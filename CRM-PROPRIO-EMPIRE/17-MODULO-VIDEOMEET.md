# Módulo 17 — Video Meet (Google Meet Próprio)

> **Versão:** 1.0  
> **Data:** Abril/2026  
> **Baseado em:** `livekitacelerador.md`  
> **Status:** Especificado — aguardando implementação (Fase 1)

---

## O que é este módulo?

**Pense assim:** imagine que, em vez de enviar um link do Google Meet para o lead, o closer abre uma sala de reunião que vive **dentro do próprio CRM**. Ao lado do vídeo, ele vê o histórico do lead, as notas, o pipeline — tudo sem sair da tela. A conversa é gravada automaticamente, transcrita em tempo real, e depois uma IA analisa o que foi dito e sugere os próximos passos.

É exatamente isso que este módulo entrega:

- **Gravação automática** — toda reunião vira um MP4 armazenado na nuvem, vinculado ao lead
- **Transcrição em tempo real** — o que é falado aparece na tela em segundos
- **Roles** — host (vendedor), guest (lead) e observer invisível (gestor assistindo sem aparecer)
- **Coaching ao vivo** — gestor pode mandar mensagens privadas para o closer durante a call
- **Análise de IA pós-call** — resumo automático com pontos fortes, fracos e tarefas sugeridas
- **Controle total dos dados** — nada fica no Google. Gravações no nosso storage, transcrições no nosso banco.

---

## Índice

1. [Arquitetura](#1-arquitetura)
2. [Fluxo completo de uma reunião](#2-fluxo-completo-de-uma-reunião)
3. [Pré-requisitos — contas a criar](#3-pré-requisitos--contas-a-criar)
4. [Credenciais e secrets no Supabase](#4-credenciais-e-secrets-no-supabase)
5. [Schema do banco](#5-schema-do-banco)
6. [Edge function: livekit-token](#6-edge-function-livekit-token)
7. [Edge function: livekit-webhook](#7-edge-function-livekit-webhook)
8. [Edge function: livekit-end-room](#8-edge-function-livekit-end-room)
9. [Edge function: send-meeting-email (opcional)](#9-edge-function-send-meeting-email-opcional)
10. [Frontend — página da sala /meet/:roomId](#10-frontend--página-da-sala-meetroomid)
11. [Helpers: generateRoomName e getMeetUrl](#11-helpers-generateroomname-e-getmeeturl)
12. [Transcrição em tempo real com Soniox (opcional)](#12-transcrição-em-tempo-real-com-soniox-opcional)
13. [Gotchas críticos](#13-gotchas-críticos)
14. [Testes end-to-end](#14-testes-end-to-end)
15. [Custos mensais estimados](#15-custos-mensais-estimados)
16. [Checklist de deploy](#16-checklist-de-deploy)
17. [Extensões futuras](#17-extensões-futuras)

---

## 1. Arquitetura

### Por que não usar o Supabase Storage para as gravações?

O Supabase Storage tem um limite de **6 MB em uploads multipart** em algumas rotas. Uma gravação de 30 minutos tem entre 50 MB e 500 MB — o upload falha silenciosamente. Por isso usamos o **Cloudflare R2**:

- **Zero custo de egress** — assiste quantas vezes quiser, sem pagar por download
- **10 GB grátis** — dá para gravar ~50 calls de 30 min antes de pagar qualquer coisa
- **Compatível com S3** — o LiveKit integra nativamente, sem nenhuma adaptação
- **URLs públicas** prontas, sem precisar assinar

### Componentes

| Camada | Responsabilidade |
|--------|-----------------|
| **LiveKit Cloud** | Servidor WebRTC SFU — gerencia as salas de vídeo em tempo real |
| **Cloudflare R2** | Storage das gravações em MP4 |
| **Supabase Edge Functions** | Geração de token, recebimento de webhooks, encerramento de sala |
| **Supabase DB** | Tabela `meetings` — sessões, gravações, transcrições |
| **Frontend React** | Página `/meet/:roomId` — PreJoin + VideoConference |
| **Soniox** *(opcional)* | Speech-to-Text dual-channel em tempo real |

---

## 2. Fluxo completo de uma reunião

```
1. Closer cria reunião no CRM → sistema gera roomName único
2. meeting_link = https://empirecrm.com.br/meet/<roomName>
3. Registro inserido na tabela meetings (status: pending, recording_status: pending)
4. Lead recebe o link por email ou WhatsApp com botão "Entrar na reunião"

5. Closer abre o link com ?role=host
   → tela PreJoin (escolhe câmera e microfone)
   → frontend pede token JWT via edge function livekit-token
   → conecta na sala LiveKit (WebRTC)

6. Lead abre o link (sem parâmetro de role = guest por padrão)
   → mesma tela PreJoin, digita o nome
   → conecta na sala

7. LiveKit dispara webhook participant_joined
   → edge function livekit-webhook inicia Egress (gravação em MP4 no R2)
   → meetings.recording_status = 'recording'

8. Reunião acontece: vídeo bidirecional, áudio, transcrição em tempo real (se Soniox ativo)
   Gestor pode entrar como observer (invisível para o lead) e mandar mensagens privadas ao closer

9. Closer clica "Encerrar" → edge function livekit-end-room
   → deleta a sala no servidor (lead é desconectado automaticamente)

10. LiveKit dispara webhook egress_ended
    → edge function salva a URL pública do MP4 em meetings.recording_url
    → meetings.recording_status = 'completed'

11. (Opcional) Edge function dispara análise IA com a transcrição
12. Timeline do lead exibe card da reunião com botão para assistir a gravação
```

---

## 3. Pré-requisitos — contas a criar

### 3.1 LiveKit Cloud

1. Criar conta em https://cloud.livekit.io
2. Começar no **Free tier** (5.000 min/mês) — suficiente para testes
3. Quando escalar: upgrade para o plano **Ship** ($50/mês, 150.000 min)
4. Criar um novo projeto e anotar:
   - **URL do WebSocket:** `wss://seu-projeto-xxxxx.livekit.cloud`
   - **API Key** e **API Secret** (seção "API Keys" do dashboard)

### 3.2 Cloudflare R2

1. Criar conta em https://dash.cloudflare.com
2. Ativar **R2 Object Storage** (requer cartão, mas free tier é generoso)
3. Criar bucket chamado `meeting-recordings`
4. No menu **Settings** do bucket → **Public Access** → ativar
5. Anotar a **URL pública** (ex: `https://pub-abc123.r2.dev`)
6. Criar **API Token** em **Manage R2 API Tokens**:
   - Permissão: **Object Read & Write**
   - Restringir ao bucket `meeting-recordings`
7. Anotar `Access Key ID`, `Secret Access Key` e `Endpoint S3`

### 3.3 Configurar webhook no LiveKit

1. No dashboard LiveKit → **Settings → Webhooks**
2. Adicionar URL:
   ```
   https://<SEU_REF>.supabase.co/functions/v1/livekit-webhook
   ```
3. Marcar os eventos: `participant_joined`, `room_finished`, `egress_started`, `egress_ended`, `egress_updated`

### 3.4 Soniox (opcional — só se quiser transcrição em tempo real)

1. Criar conta em https://soniox.com
2. Gerar API Key na conta
3. Anotar a chave

---

## 4. Credenciais e secrets no Supabase

Configurar via CLI:

```bash
npx supabase secrets set \
  LIVEKIT_API_KEY=APIxxxx \
  LIVEKIT_API_SECRET=secretxxxx \
  LIVEKIT_URL=wss://seu-projeto.livekit.cloud \
  S3_ACCESS_KEY=R2accesskey \
  S3_SECRET_KEY=R2secret \
  S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com \
  S3_BUCKET=meeting-recordings \
  S3_REGION=auto \
  S3_PUBLIC_URL=https://pub-xxx.r2.dev \
  MEETING_FROM_EMAIL=noreply@empirecrm.com.br \
  SONIOX_API_KEY=opcional \
  --project-ref SEU_PROJECT_REF
```

---

## 5. Schema do banco

Execute no SQL Editor do Supabase. Se a tabela `meetings` já existir no projeto, apenas adicione as colunas novas com `ALTER TABLE`.

```sql
-- Tabela de reuniões
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT,
  oportunidade_id UUID REFERENCES oportunidades(id),
  contato_id UUID REFERENCES contatos(id),
  atividade_id UUID,                          -- vinculo com a task do CRM
  meeting_type TEXT DEFAULT 'sales_call',
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'completed', 'no_show', 'cancelled')),
  meeting_link TEXT,
  livekit_room_name TEXT UNIQUE,
  recording_url TEXT,
  recording_status TEXT
    CHECK (recording_status IN ('pending', 'recording', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  participants JSONB DEFAULT '[]'::jsonb,
  transcriptions JSONB DEFAULT '[]'::jsonb,
  ai_summary JSONB,                           -- análise IA pós-call
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_room      ON meetings(livekit_room_name);
CREATE INDEX IF NOT EXISTS idx_meetings_opp       ON meetings(oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_meetings_contato   ON meetings(contato_id);
CREATE INDEX IF NOT EXISTS idx_meetings_workspace ON meetings(workspace_id);

-- RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "meetings_read" ON meetings
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "meetings_write" ON meetings
  FOR ALL TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ))
  WITH CHECK (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

> **Atenção:** adapte os nomes das colunas de FK ao modelo real do Empire CRM (`oportunidade_id`, `contato_id`, `workspace_id`). O guia original usava `lead_id` e `organization_id` — aqui foram renomeados para seguir a nomenclatura do projeto.

---

## 6. Edge function: livekit-token

Gera o JWT que autoriza um usuário a entrar em uma sala. Suporta 3 roles:

- **host** — vendedor/closer: publica vídeo+áudio, administra a sala, pode iniciar gravação
- **guest** — lead/cliente: publica vídeo+áudio, participa normalmente
- **observer** — gestor invisível: vê tudo, envia mensagens via DataChannel, **não aparece** para ninguém

**Arquivo:** `supabase/functions/livekit-token/index.ts`

```typescript
import { AccessToken } from 'https://esm.sh/livekit-server-sdk@2.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
const API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { roomName, participantName, role, metadata } = await req.json();

    if (!roomName || !participantName) {
      return new Response(
        JSON.stringify({ error: 'roomName e participantName são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const identity = `${role || 'guest'}-${participantName}-${Date.now()}`;
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: participantName,
      metadata: JSON.stringify(metadata || {}),
    });

    if (role === 'host') {
      at.addGrant({
        room: roomName, roomJoin: true,
        canPublish: true, canSubscribe: true, canPublishData: true,
        roomAdmin: true, roomRecord: true,
      });
    } else if (role === 'observer') {
      at.addGrant({
        room: roomName, roomJoin: true,
        canPublish: false, canSubscribe: true, canPublishData: true,
        hidden: true,  // invisível para os outros participantes
      });
    } else {
      // guest
      at.addGrant({
        room: roomName, roomJoin: true,
        canPublish: true, canSubscribe: true, canPublishData: true,
      });
    }

    const token = await at.toJwt();
    return new Response(JSON.stringify({ token, url: LIVEKIT_URL }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Deploy:**
```bash
npx supabase functions deploy livekit-token --no-verify-jwt --project-ref SEU_REF
```

> **Por que `--no-verify-jwt`?** O lead acessa o link sem estar logado no CRM, então o token de autenticação do Supabase não existe para ele. A função precisa ser acessível sem JWT.

---

## 7. Edge function: livekit-webhook

Recebe os eventos do LiveKit. Os dois eventos mais importantes:

- `participant_joined` → inicia a gravação (Egress) assim que alguém entra na sala
- `egress_ended` → salva a URL pública do MP4 no banco

> **Gotcha importante:** o Egress só funciona quando já tem participante na sala. Se você tentar iniciar em `room_started` (sala criada mas vazia), ele trava no estado `EGRESS_STARTING` para sempre. Por isso o trigger é `participant_joined`.

**Arquivo:** `supabase/functions/livekit-webhook/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  WebhookReceiver,
  EgressClient,
  EncodedFileType,
  EncodedFileOutput,
} from 'https://esm.sh/livekit-server-sdk@2.7.0';

const API_KEY     = Deno.env.get('LIVEKIT_API_KEY')!;
const API_SECRET  = Deno.env.get('LIVEKIT_API_SECRET')!;
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!;
const S3_ACCESS_KEY  = Deno.env.get('S3_ACCESS_KEY')!;
const S3_SECRET_KEY  = Deno.env.get('S3_SECRET_KEY')!;
const S3_ENDPOINT    = Deno.env.get('S3_ENDPOINT')!;
const S3_BUCKET      = Deno.env.get('S3_BUCKET') || 'meeting-recordings';
const S3_PUBLIC_URL  = Deno.env.get('S3_PUBLIC_URL')!;

const supabase     = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const receiver     = new WebhookReceiver(API_KEY, API_SECRET);
const egressClient = new EgressClient(LIVEKIT_URL.replace('wss://', 'https://'), API_KEY, API_SECRET);

Deno.serve(async (req: Request) => {
  const body = await req.text();
  const auth = req.headers.get('Authorization') || '';

  let event: any;
  try {
    event = await receiver.receive(body, auth);
  } catch {
    return new Response('Invalid signature', { status: 401 });
  }

  const roomName = event.room?.name;
  console.log(`[livekit-webhook] event=${event.event} room=${roomName}`);

  try {
    // Inicia gravação quando o primeiro participante entrar
    if (event.event === 'participant_joined' && roomName) {
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, recording_status')
        .eq('livekit_room_name', roomName)
        .maybeSingle();

      if (meeting && !['recording', 'completed'].includes(meeting.recording_status)) {
        const filename = `${roomName}-${Date.now()}.mp4`;
        const output = new EncodedFileOutput({
          fileType: EncodedFileType.MP4,
          filepath: filename,
          output: {
            case: 's3',
            value: {
              accessKey: S3_ACCESS_KEY,
              secret: S3_SECRET_KEY,
              endpoint: S3_ENDPOINT,
              bucket: S3_BUCKET,
              region: 'auto',
              forcePathStyle: true,
            },
          },
        });

        try {
          await egressClient.startRoomCompositeEgress(roomName, { file: output }, { layout: 'grid' });
          await supabase.from('meetings').update({
            recording_status: 'recording',
            started_at: new Date().toISOString(),
          }).eq('id', meeting.id);
        } catch (err: any) {
          console.error('[livekit-webhook] Egress falhou:', err.message);
          await supabase.from('meetings').update({ recording_status: 'failed' }).eq('id', meeting.id);
        }
      }
    }

    // Salva URL da gravação quando o Egress terminar
    if (event.event === 'egress_ended' && event.egressInfo) {
      const file = event.egressInfo.fileResults?.[0] || event.egressInfo.file;
      const filename = file?.filename;
      const roomFromEgress = event.egressInfo.roomName;

      if (filename && roomFromEgress) {
        await supabase.from('meetings').update({
          recording_url: `${S3_PUBLIC_URL}/${filename}`,
          recording_status: 'completed',
        }).eq('livekit_room_name', roomFromEgress);
      }
    }

    // Marca reunião como concluída quando a sala fechar
    if (event.event === 'room_finished' && roomName) {
      await supabase.from('meetings').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }).eq('livekit_room_name', roomName);
    }
  } catch (err: any) {
    console.error('[livekit-webhook] Erro:', err.message);
  }

  return new Response('OK', { status: 200 });
});
```

**Deploy:**
```bash
npx supabase functions deploy livekit-webhook --no-verify-jwt --project-ref SEU_REF
```

---

## 8. Edge function: livekit-end-room

Quando o host clica em "Encerrar", esta função deleta a sala no servidor LiveKit, desconectando todos os participantes automaticamente e finalizando o Egress (gravação).

**Arquivo:** `supabase/functions/livekit-end-room/index.ts`

```typescript
import { RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const rs = new RoomServiceClient(
  Deno.env.get('LIVEKIT_URL')!.replace('wss://', 'https://'),
  Deno.env.get('LIVEKIT_API_KEY')!,
  Deno.env.get('LIVEKIT_API_SECRET')!,
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { room_name } = await req.json();
    if (!room_name) return new Response(
      JSON.stringify({ error: 'room_name required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

    await rs.deleteRoom(room_name);
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

**Deploy:**
```bash
npx supabase functions deploy livekit-end-room --no-verify-jwt --project-ref SEU_REF
```

---

## 9. Edge function: send-meeting-email (opcional)

Envia email de confirmação/lembrete/reagendamento/no-show com anexo `.ics` — compatível com Google Calendar, Outlook e Apple Calendar.

**Secrets adicionais necessários:** `RESEND_API_KEY` e `MEETING_FROM_EMAIL`

**Arquivo:** `supabase/functions/send-meeting-email/index.ts`

A função aceita um `type` no payload:

| type | Quando usar |
|------|------------|
| `scheduled` | Reunião confirmada — envia data, botão de acesso e link de calendário |
| `rescheduled` | Reunião remarcada — nova data e link |
| `reminder` | 15 min antes — lembrete automático |
| `no_show` | Lead não apareceu — convite para remarcar |

**Payload esperado:**
```json
{
  "type": "scheduled",
  "to": "lead@email.com",
  "leadName": "João Silva",
  "meetingTitle": "Reunião de Diagnóstico — Empire",
  "startAt": "2026-05-10T14:00:00-03:00",
  "endAt": "2026-05-10T15:00:00-03:00",
  "meetLink": "https://empirecrm.com.br/meet/meeting-abc123",
  "hostName": "Carlos Closer",
  "hostEmail": "carlos@empire.com.br"
}
```

O `.ics` gerado é compatível com todos os clientes de calendário e inclui:
- Alerta automático 15 minutos antes
- Link da reunião no campo `LOCATION`
- Organizador e participante preenchidos

---

## 10. Frontend — página da sala /meet/:roomId

**Dependências NPM a instalar:**
```bash
npm install livekit-client @livekit/components-react @livekit/components-styles
```

**Arquivo:** `src/pages/MeetRoom.tsx`

A página tem três estados principais:

1. **PreJoin** — o usuário escolhe câmera e microfone antes de entrar. Observer pula esta etapa automaticamente.
2. **VideoConference** — sala ativa com vídeo/áudio/chat.
3. **Ended** — tela de encerramento com botão "Voltar".

```tsx
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  type LocalUserChoices,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { supabase } from '@/lib/supabase';

interface ConnectionData { token: string; url: string }

export default function MeetRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();

  const role      = (searchParams.get('role') || 'guest') as 'host' | 'guest' | 'observer';
  const defaultName = searchParams.get('name') || '';
  const oportunidadeId = searchParams.get('oportunidade_id') || undefined;
  const returnUrl = searchParams.get('return') || '/';

  const isHost     = role === 'host';
  const isObserver = role === 'observer';

  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | null>(null);
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded]   = useState(false);

  // Observer entra silenciosamente (sem tela de PreJoin)
  useEffect(() => {
    if (isObserver && !preJoinChoices && roomId) {
      (async () => {
        const data = await getLiveKitToken({ roomName: roomId, participantName: defaultName || 'Gestor', role: 'observer' });
        setPreJoinChoices({ username: defaultName, videoEnabled: false, audioEnabled: false } as any);
        setConnectionData(data);
      })();
    }
  }, [isObserver, roomId]);

  const handlePreJoin = async (choices: LocalUserChoices) => {
    if (!roomId) return;
    setPreJoinChoices(choices);
    setLoading(true);
    setError(null);

    try {
      // Garante que o registro da reunião existe no banco
      const { data: existing } = await supabase
        .from('meetings').select('id').eq('livekit_room_name', roomId).maybeSingle();

      if (!existing) {
        await supabase.from('meetings').insert({
          title: `Reunião ${roomId}`,
          oportunidade_id: oportunidadeId || null,
          livekit_room_name: roomId,
          meeting_link: `${window.location.origin}/meet/${roomId}`,
          status: 'active',
          recording_status: 'pending',
        });
      }

      const data = await getLiveKitToken({
        roomName: roomId,
        participantName: choices.username || defaultName || 'Participante',
        role,
        metadata: { oportunidade_id: oportunidadeId },
      });
      setConnectionData(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (isHost && roomId) {
      supabase.functions.invoke('livekit-end-room', { body: { room_name: roomId } }).catch(() => {});
    }
    setConnectionData(null);
    setEnded(true);
  };

  if (error) return (
    <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl mb-4">Erro ao entrar na sala</h1>
        <p className="text-zinc-400 mb-4">{error}</p>
        <a href={returnUrl} className="text-emerald-400 underline">Voltar</a>
      </div>
    </div>
  );

  if (ended) return (
    <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-2xl mb-4">Reunião encerrada</h1>
        <p className="text-zinc-400 mb-6">Obrigado pela participação.</p>
        <a href={returnUrl} className="bg-emerald-600 text-white px-6 py-3 rounded-lg">Voltar</a>
      </div>
    </div>
  );

  if (!preJoinChoices) return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-zinc-800 rounded-xl p-6">
        <h1 className="text-white text-2xl mb-4 text-center">Entrar na reunião</h1>
        <PreJoin
          defaults={{ username: defaultName, videoEnabled: true, audioEnabled: true }}
          onSubmit={handlePreJoin}
          data-lk-theme="default"
          userLabel="Seu nome"
          joinLabel={loading ? 'Conectando...' : 'Entrar na sala'}
          micLabel="Microfone"
          camLabel="Câmera"
        />
      </div>
    </div>
  );

  if (!connectionData) return (
    <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
      <p>Conectando...</p>
    </div>
  );

  return (
    <LiveKitRoom
      token={connectionData.token}
      serverUrl={connectionData.url}
      video={preJoinChoices?.videoEnabled && !isObserver}
      audio={preJoinChoices?.audioEnabled && !isObserver}
      connect={true}
      onDisconnected={handleDisconnect}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <VideoConference />
    </LiveKitRoom>
  );
}

async function getLiveKitToken(params: {
  roomName: string;
  participantName: string;
  role: 'host' | 'guest' | 'observer';
  metadata?: any;
}) {
  const { data, error } = await supabase.functions.invoke('livekit-token', { body: params });
  if (error || !data?.token) throw new Error(error?.message || 'Falha ao gerar token');
  return data as { token: string; url: string };
}
```

**Adicionar rota no router:**
```tsx
<Route path="/meet/:roomId" element={<MeetRoom />} />
```

---

## 11. Helpers: generateRoomName e getMeetUrl

**Arquivo:** `src/lib/livekit.ts`

```typescript
/** Gera um nome de sala único baseado em timestamp + random */
export function generateRoomName(): string {
  return `meeting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Monta a URL pública de uma sala de reunião.
 * IMPORTANTE: sempre usa a URL de produção, mesmo em ambiente de desenvolvimento.
 * Se usar localhost, o lead não consegue acessar.
 */
export function getMeetUrl(
  roomName: string,
  opts?: {
    role?: 'host' | 'guest' | 'observer';
    oportunidadeId?: string;
    name?: string;
  }
): string {
  const baseUrl = import.meta.env.VITE_APP_URL || 'https://empirecrm.com.br';
  const params = new URLSearchParams();
  if (opts?.role) params.set('role', opts.role);
  if (opts?.oportunidadeId) params.set('oportunidade_id', opts.oportunidadeId);
  if (opts?.name) params.set('name', opts.name);
  const qs = params.toString();
  return `${baseUrl}/meet/${roomName}${qs ? '?' + qs : ''}`;
}
```

**Exemplo de uso ao criar reunião:**
```typescript
import { generateRoomName, getMeetUrl } from '@/lib/livekit'

const roomName = generateRoomName()
const linkParaLead = getMeetUrl(roomName, { role: 'guest', oportunidadeId: opp.id })
const linkParaCloser = getMeetUrl(roomName, { role: 'host', oportunidadeId: opp.id, name: user.name })

// Salvar no banco
await supabase.from('meetings').insert({
  livekit_room_name: roomName,
  meeting_link: linkParaLead,
  oportunidade_id: opp.id,
  ...
})
```

---

## 12. Transcrição em tempo real com Soniox (opcional)

Permite ver a transcrição da conversa em tempo real durante a call — com identificação de quem está falando.

**Conceito:**
1. O hook captura os `MediaStreamTrack` de áudio do microfone local (host) e dos participantes remotos (lead)
2. Converte para PCM 16kHz
3. Envia via WebSocket para o Soniox (`wss://stt-rt.soniox.com/transcribe-websocket`)
4. Soniox retorna as falas em tempo real com labels de speaker

**Arquivo:** `src/hooks/useLiveKitTranscription.ts`

```typescript
import { useEffect, useRef } from 'react';
import { useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSoniox } from './useSoniox'; // hook Soniox existente

export function useLiveKitTranscription(meetingId: string | null) {
  const tracks = useTracks([Track.Source.Microphone]);
  const streamsRef = useRef<MediaStream[]>([]);

  // Atualiza a ref de streams toda vez que tracks mudar
  useEffect(() => {
    streamsRef.current = tracks
      .map((t) => t.publication.track?.mediaStream)
      .filter(Boolean) as MediaStream[];
  }, [tracks]);

  // Passa os streams via ref para o hook do Soniox (evita closure stale)
  const soniox = useSoniox({ externalStreams: streamsRef });

  // Auto-salva transcrição no banco a cada 10 segundos
  useEffect(() => {
    if (!meetingId || !soniox.transcriptions.length) return;
    const timer = setInterval(async () => {
      await supabase
        .from('meetings')
        .update({ transcriptions: soniox.transcriptions })
        .eq('id', meetingId);
    }, 10_000);
    return () => clearInterval(timer);
  }, [meetingId, soniox.transcriptions]);

  return soniox;
}
```

> **Dica:** passe os streams via `ref` em vez de `state` para o hook do Soniox. Se passar via state, você vai ter um closure stale — o hook captura os streams no momento em que é criado (vazio) e nunca vê os novos streams que chegam depois.

---

## 13. Gotchas críticos

Problemas que você vai encontrar e como resolver:

| # | Sintoma | Causa | Solução |
|---|---------|-------|---------|
| 1 | Upload de gravação falha silenciosamente | Supabase Storage tem limite de 6 MB em uploads multipart | Usar Cloudflare R2 |
| 2 | Egress fica travado em `EGRESS_STARTING` para sempre | Tentou iniciar Egress em `room_started` (sala vazia) | Disparar Egress em `participant_joined` |
| 3 | Erro "Rendered fewer hooks than expected" | Hooks React depois de `return` condicional | Mover todos os `useEffect` para ANTES de qualquer `return` no componente |
| 4 | Transcrição não captura fala (streams null) | Closure stale — streams capturados no primeiro render, antes de chegarem | Passar streams via `ref` em vez de `state` para o hook do Soniox |
| 5 | MP4 toca no desktop mas falha no mobile | `moov atom` no fim do arquivo (não faststart) | Pós-processar com `ffmpeg -movflags +faststart`, ou configurar LiveKit Egress para gerar faststart |
| 6 | Vídeo preto no iOS Safari | Autoplay bloqueado sem interação do usuário | Usar `muted autoPlay playsInline` + botão "Ativar som" para o usuário dar o gesto de unmute |
| 7 | CORS bloqueia WebAudio do R2 | R2 não tem CORS configurado | Configurar CORS no bucket R2 para seu domínio |
| 8 | Lead recebe link `http://localhost:3000/meet/...` | `getMeetUrl` usando `window.location.origin` em dev | `getMeetUrl` sempre usa `VITE_APP_URL` ou domínio de produção hardcoded |
| 9 | Observer aparece no grid de vídeo | Faltou setar `hidden: true` no token | Incluir `hidden: true` e `canPublish: false` nos grants do token do observer |
| 10 | Mensagem privada do observer vai para o lead | `publishData` sem filtro de destino | Usar `destinationIdentities` filtrado para identities que começam com `host-` |
| 11 | Card duplicado na timeline do lead | Task + meeting gerando 2 cards | Se `meeting.atividade_id` estiver preenchido, pular a task no hook de timeline |
| 12 | UI não atualiza após encerrar reunião | React Query com cache desatualizado | Chamar `queryClient.invalidateQueries` no handler de encerramento |
| 13 | Reunião não aparece na timeline do lead | `meeting.oportunidade_id` ficou null | Em `handlePreJoin`, buscar `oportunidade_id` via `meeting_link` matching como fallback |

---

## 14. Testes end-to-end

Script de validação completo antes de ir para produção:

```bash
# 1. Secrets e deploy
npx supabase secrets set LIVEKIT_API_KEY=xxx LIVEKIT_API_SECRET=yyy ... --project-ref SEU_REF
npx supabase functions deploy livekit-token    --no-verify-jwt --project-ref SEU_REF
npx supabase functions deploy livekit-webhook  --no-verify-jwt --project-ref SEU_REF
npx supabase functions deploy livekit-end-room --no-verify-jwt --project-ref SEU_REF
```

**No app:**

1. Logar como usuário admin
2. Criar uma reunião vinculada a uma oportunidade (usar `generateRoomName`)
3. Abrir `/meet/<roomName>?role=host&oportunidade_id=xxx` em uma aba
4. Copiar o link, abrir `/meet/<roomName>?role=guest&name=LeadTeste` em outra aba (ou celular)
5. Entrar em ambas as abas

**Verificar:**

- [ ] Sala conecta via WebRTC (vídeo e áudio funcionando)
- [ ] Webhook `participant_joined` dispara em segundos → Egress inicia
- [ ] `meetings.recording_status` muda para `'recording'`
- [ ] Host clica "Sair" → `livekit-end-room` é chamado → guest é desconectado
- [ ] Aguardar 1-2 min → webhook `egress_ended` chega
- [ ] `meetings.recording_url` tem URL pública do R2
- [ ] MP4 toca no navegador desktop
- [ ] MP4 toca no mobile (iOS + Android)
- [ ] Card da reunião aparece na timeline do lead com botão de gravação

---

## 15. Custos mensais estimados

Para uso típico (20–30 reuniões/dia, ~30 min cada):

| Serviço | Custo | Observação |
|---------|-------|-----------|
| **LiveKit Cloud Ship** | $50/mês | 150.000 min inclusos — suficiente para ~5.000 calls de 30 min |
| **Cloudflare R2** | $0–5/mês | 10 GB grátis (≈50 calls de 30 min) + $0,015/GB depois |
| **Supabase Pro** | $25/mês (já pago) | Edge functions, DB, Auth |
| **Soniox** | ~$0,10/min | Opcional — só se usar transcrição em tempo real |
| **Resend** (emails) | $20/mês | Opcional — 50k emails/mês |
| **Total extra** | **$50–75/mês** | Sem Soniox. Com Soniox: +$90–270/mês |

---

## 16. Checklist de deploy

Antes de ativar para os closers, confirmar cada item:

- [ ] Conta LiveKit Cloud criada + projeto ativo
- [ ] `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` salvos nos secrets do Supabase
- [ ] Bucket R2 `meeting-recordings` criado e marcado como **público**
- [ ] Credenciais R2 (`S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_URL`) nos secrets
- [ ] Edge functions deployadas com `--no-verify-jwt`: `livekit-token`, `livekit-webhook`, `livekit-end-room`
- [ ] URL do webhook configurada no dashboard LiveKit: `https://SEU_REF.supabase.co/functions/v1/livekit-webhook`
- [ ] Eventos marcados no webhook: `participant_joined`, `room_finished`, `egress_ended`
- [ ] Tabela `meetings` criada com todas as colunas (incluindo `livekit_room_name`, `recording_url`, `recording_status`)
- [ ] RLS ativo na tabela `meetings` filtrando por `workspace_id`
- [ ] Rota `/meet/:roomId` registrada no router do frontend
- [ ] `VITE_APP_URL` configurado como URL de produção no Vercel (não localhost)
- [ ] CSP/Permissions-Policy do host liberando `camera`, `microphone`, `display-capture`
- [ ] Teste local ponta a ponta passando (host + guest em abas diferentes)
- [ ] Teste no iOS Safari passando (autoplay + câmera)
- [ ] Teste no Android Chrome passando
- [ ] Lead real consegue entrar no link sem estar logado no CRM

---

## 17. Extensões futuras

Funcionalidades a implementar após o MVP do módulo estar estável:

| Extensão | Descrição |
|----------|-----------|
| **Análise IA pós-call** | Edge function que envia a transcrição para Gemini/OpenAI e gera resumo, pontos fortes/fracos, objeções levantadas e tarefas sugeridas. Salvo em `meetings.ai_summary`. |
| **Painel de contexto do lead** | Drawer lateral visível durante a call: histórico de mensagens, notas, etapa do pipeline, score do lead. |
| **Chat privado host ↔ observer** | DataChannel com `topic: 'coach-chat'` e `destinationIdentities` filtradas — gestor manda dicas ao closer sem o lead ver. |
| **Badge "AO VIVO"** | Polling em `meetings` filtrando por `status = 'active'` — exibe badge vermelho na task enquanto a reunião estiver rolando. |
| **Banner de recovery** | Se o usuário saiu da página mas a reunião ainda está ativa, exibir banner "Você tem uma reunião em andamento" com botão para voltar. |
| **Emails automáticos** | Trigger na criação de `meetings` → `send-meeting-email` com tipo `scheduled` + `.ics`. Cron de lembrete 15 min antes. |
| **Análise de sentimento** | Processar a transcrição para detectar engajamento, objeções, interesse — útil para coaching do time de vendas. |

---

*Documento criado em Abril/2026 — Empire Business. Baseado no `livekitacelerador.md`.*
