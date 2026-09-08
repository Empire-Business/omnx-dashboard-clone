# Acelerador LiveKit — Substituindo Google Meet no seu CRM

> Este documento é um guia completo pra implementar uma sala própria de videochamada dentro do seu CRM usando **LiveKit Cloud** como backend, **Cloudflare R2** como storage de gravações, **Soniox** (opcional) pra transcrição em tempo real, e **Supabase** como backend e banco. A ideia é **substituir o Google Meet** em todas as chamadas comerciais/CS do seu CRM, ganhando: gravação automática, transcrição em tempo real, análise IA pós-call, painel com contexto do lead ao lado, chat privado entre host e observer, e controle total dos dados.
>
> **Este guia é AI-friendly**: joga ele na sua IA (Cursor, Copilot, Claude, GPT) e ela consegue implementar ponta a ponta no seu CRM, adaptando tabelas e caminhos conforme sua aplicação.

---

## Índice

1. [Visão geral da arquitetura](#1-visão-geral-da-arquitetura)
2. [Por que Cloudflare R2 (e não Supabase Storage)](#2-por-que-cloudflare-r2-e-não-supabase-storage)
3. [Pré-requisitos — contas a criar](#3-pré-requisitos--contas-a-criar)
4. [Credenciais e secrets do Supabase](#4-credenciais-e-secrets-do-supabase)
5. [Schema do banco (SQL)](#5-schema-do-banco-sql)
6. [Edge function `livekit-token`](#6-edge-function-livekit-token)
7. [Edge function `livekit-webhook`](#7-edge-function-livekit-webhook)
8. [Edge function `livekit-end-room`](#8-edge-function-livekit-end-room)
9. [Edge function `send-meeting-email` (opcional)](#9-edge-function-send-meeting-email-opcional)
10. [Frontend — página da sala `/meet/:roomId`](#10-frontend--página-da-sala-meetroomid)
11. [Frontend — hook `useLiveKit` e helpers](#11-frontend--hook-uselivekit-e-helpers)
12. [Integração com transcrição Soniox (opcional)](#12-integração-com-transcrição-soniox-opcional)
13. [Gotchas e aprendizados](#13-gotchas-e-aprendizados)
14. [Testes end-to-end](#14-testes-end-to-end)
15. [Custos mensais estimados](#15-custos-mensais-estimados)
16. [Checklist final](#16-checklist-final)

---

## 1. Visão geral da arquitetura

Fluxo de uma reunião completa:

```
1. Usuário cria reunião no CRM → escolhe tipo "Sala Própria"
2. Frontend gera roomName único + meeting_link = https://seudominio.com/meet/<roomName>
3. Reunião cadastrada em company_activities (ou equivalente no seu CRM)
4. Host abre o link → página MeetRoom
   → pede token via edge function livekit-token
   → conecta no LiveKit Cloud (WebRTC)
5. LiveKit dispara webhook `participant_joined` → backend inicia Egress (gravação em MP4)
6. Reunião rola: vídeo, áudio, transcrição em tempo real (Soniox), chat observer
7. Host clica "Sair" → edge function livekit-end-room → DeleteRoom (kicka todos)
8. LiveKit dispara webhook `egress_ended` → salva URL do MP4 no R2 em meetings.recording_url
9. Backend dispara análise IA pós-call (opcional)
10. Timeline do lead mostra o card da reunião com link da gravação
```

**Componentes:**

| Camada | Responsabilidade |
|---|---|
| **LiveKit Cloud** | Servidor WebRTC SFU — 1 sala aguenta 100+ participantes |
| **Cloudflare R2** | Storage S3-compatible pras gravações (sem egress fees) |
| **Supabase Edge Functions** | Token generation, webhooks, orchestration |
| **Supabase DB** | `meetings` (sessões), `company_activities` (tasks) |
| **Frontend (React/Next)** | Página `/meet/:roomId` com PreJoin, VideoConference, recovery |
| **Soniox** (opcional) | STT dual-channel em tempo real |

---

## 2. Por que Cloudflare R2 (e não Supabase Storage)

**Regra de ouro:** use **Cloudflare R2** pra gravações de vídeo. Aqui o por quê:

### Limitações do Supabase Storage

- Upload multipart limitado a **6MB** em algumas rotas → uploads de 50-500MB (típico em calls de 30min-1h) **falham silenciosamente**
- Egress pago por GB ($0.09/GB a partir de 250GB/mês) — sai caro pra vídeos com muita visualização

### Por que R2 ganha

- **Zero egress fees** — assiste quantas vezes quiser sem pagar
- **10GB grátis** incluso (dá pra gravar ~50 calls de 30min)
- **S3-compatible** — LiveKit Egress integra nativo
- **URLs públicas** via `pub-xxx.r2.dev` (sem assinar URL)
- Barato: $0.015/GB depois do free tier

### Configuração mínima do R2

1. Criar bucket `meeting-recordings`
2. Marcar bucket como **Público** (Settings → Public Access → Enabled)
3. Gerar **API Token** com permissão **Object Read & Write** pro bucket
4. Copiar **Endpoint S3** do seu bucket (formato `https://<account-id>.r2.cloudflarestorage.com`)
5. Copiar **URL Pública** do bucket (formato `https://pub-xxx.r2.dev`)
6. Configurar **CORS** pra permitir seu domínio do CRM (necessário se for usar WebAudio)

**CORS policy do R2** (opcional, só se frontend for processar áudio via WebAudio):

```json
[
  {
    "AllowedOrigins": ["https://seudominio.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 3. Pré-requisitos — contas a criar

### 3.1 LiveKit Cloud

1. Criar conta em https://cloud.livekit.io
2. Plano **Free tier** (5.000 min/mês) pra começar. Upgrade pro **Ship ($50/mês, 150.000 min)** quando escalar.
3. Criar um novo projeto
4. Anotar:
   - **URL do WebSocket:** `wss://seu-projeto-xxxxx.livekit.cloud`
   - **API Key:** (clicar em "API Keys")
   - **API Secret:** (clicar em "API Keys")

### 3.2 Cloudflare R2

1. Criar conta Cloudflare em https://dash.cloudflare.com
2. Ativar **R2 Object Storage** (precisa de cartão, mas free tier generoso)
3. Criar bucket `meeting-recordings`
4. **Settings** do bucket → **Public Access** → enable
5. Anotar a **URL pública** (ex: `https://pub-9ad9609ce50e4c97b930a99bac90c285.r2.dev`)
6. Criar **API Token** em **Manage R2 API Tokens**:
   - Permissão: **Object Read & Write**
   - Specify bucket: `meeting-recordings`
7. Anotar `Access Key ID`, `Secret Access Key`, `Endpoint`

### 3.3 Configurar webhook no LiveKit

1. No dashboard LiveKit → **Settings → Webhooks**
2. Adicionar webhook com URL:
   ```
   https://<seu-projeto>.supabase.co/functions/v1/livekit-webhook
   ```
3. Eventos: marcar **todos** (ou ao menos `participant_joined`, `room_finished`, `egress_started`, `egress_ended`, `egress_updated`)

### 3.4 Soniox (opcional — só se quiser transcrição em tempo real)

1. Criar conta em https://soniox.com
2. Gerar API Key
3. Anotar

---

## 4. Credenciais e secrets do Supabase

Setar via CLI ou Dashboard:

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
  SONIOX_API_KEY=opcional \
  --project-ref SEU_PROJECT_REF
```

---

## 5. Schema do banco (SQL)

Execute no SQL Editor do Supabase. **Adapte os nomes de tabela ao seu CRM** (se já tiver `meetings`, `activities`, etc, pule a criação e só adicione as colunas novas).

```sql
-- Tabela principal de reuniões (adicione campos ao que você já tem)
CREATE TABLE IF NOT EXISTS meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  lead_id UUID REFERENCES leads(id),
  organization_id UUID REFERENCES organizations(id),
  activity_id UUID,
  meeting_type TEXT DEFAULT 'sales_call',
  status TEXT DEFAULT 'active' CHECK (status IN ('active','completed','no_show','cancelled')),
  meeting_link TEXT,
  livekit_room_name TEXT UNIQUE,
  recording_url TEXT,
  recording_status TEXT CHECK (recording_status IN ('pending','recording','completed','failed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID,
  participants JSONB DEFAULT '[]'::jsonb,
  transcriptions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meetings_room ON meetings(livekit_room_name);
CREATE INDEX IF NOT EXISTS idx_meetings_lead ON meetings(lead_id);
CREATE INDEX IF NOT EXISTS idx_meetings_activity ON meetings(activity_id);

-- Se já tiver a tabela, adicione só as colunas novas:
-- ALTER TABLE meetings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT UNIQUE;
-- ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_url TEXT;
-- ALTER TABLE meetings ADD COLUMN IF NOT EXISTS recording_status TEXT;
-- ALTER TABLE meetings ADD COLUMN IF NOT EXISTS activity_id UUID;

-- RLS
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_meetings" ON meetings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_write_meetings" ON meetings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Se você tem company_activities (tasks), garanta o meeting_link:
-- ALTER TABLE company_activities ADD COLUMN IF NOT EXISTS meeting_link TEXT;
```

---

## 6. Edge function `livekit-token`

Gera JWT pra entrar na sala. Suporta 3 roles: **host** (pode publicar, gerenciar sala, gravar), **guest** (publica, participa), **observer** (invisível, escuta+envia DataChannel, nenhum vídeo/áudio).

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
      return new Response(JSON.stringify({ error: 'roomName e participantName são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const identity = `${role || 'guest'}-${participantName}-${Date.now()}`;
    const at = new AccessToken(API_KEY, API_SECRET, {
      identity,
      name: participantName,
      metadata: JSON.stringify(metadata || {}),
    });

    // Permissões por role
    if (role === 'host') {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        roomAdmin: true,
        roomRecord: true,
      });
    } else if (role === 'observer') {
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: false,
        canSubscribe: true,
        canPublishData: true,
        hidden: true, // invisível pros outros participantes
      });
    } else {
      // guest
      at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
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

---

## 7. Edge function `livekit-webhook`

Recebe eventos do LiveKit. **Ponto crítico:** o Egress só inicia quando tem participante na sala (não na criação da sala vazia). Por isso o trigger é `participant_joined`, não `room_started`.

**Arquivo:** `supabase/functions/livekit-webhook/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';
import { WebhookReceiver, EgressClient, EncodedFileType, EncodedFileOutput } from 'https://esm.sh/livekit-server-sdk@2.7.0';

const API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
const API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const S3_ACCESS_KEY = Deno.env.get('S3_ACCESS_KEY')!;
const S3_SECRET_KEY = Deno.env.get('S3_SECRET_KEY')!;
const S3_ENDPOINT = Deno.env.get('S3_ENDPOINT')!;
const S3_BUCKET = Deno.env.get('S3_BUCKET') || 'meeting-recordings';
const S3_PUBLIC_URL = Deno.env.get('S3_PUBLIC_URL')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const receiver = new WebhookReceiver(API_KEY, API_SECRET);
const egressClient = new EgressClient(LIVEKIT_URL.replace('wss://', 'https://'), API_KEY, API_SECRET);

Deno.serve(async (req: Request) => {
  const body = await req.text();
  const auth = req.headers.get('Authorization') || '';

  let event: any;
  try {
    event = await receiver.receive(body, auth);
  } catch (err: any) {
    return new Response('Invalid signature', { status: 401 });
  }

  const roomName = event.room?.name;
  console.log(`[webhook] event: ${event.event}, room: ${roomName}`);

  try {
    if (event.event === 'participant_joined' && roomName) {
      // Inicia Egress quando o primeiro participante entrar (não na criação da sala)
      const { data: meeting } = await supabase
        .from('meetings')
        .select('id, recording_status')
        .eq('livekit_room_name', roomName)
        .maybeSingle();

      if (meeting && meeting.recording_status !== 'recording' && meeting.recording_status !== 'completed') {
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
          await egressClient.startRoomCompositeEgress(roomName, { file: output }, {
            layout: 'grid',
          });
          await supabase.from('meetings').update({
            recording_status: 'recording',
            started_at: new Date().toISOString(),
          }).eq('id', meeting.id);
          console.log(`[webhook] Egress iniciado: ${filename}`);
        } catch (err: any) {
          console.error(`[webhook] Egress falhou:`, err.message);
          await supabase.from('meetings').update({ recording_status: 'failed' }).eq('id', meeting.id);
        }
      }
    }

    if (event.event === 'egress_ended' && event.egressInfo) {
      const file = event.egressInfo.fileResults?.[0] || event.egressInfo.file;
      const filename = file?.filename;
      const roomNameFromEgress = event.egressInfo.roomName;

      if (filename && roomNameFromEgress) {
        const publicUrl = `${S3_PUBLIC_URL}/${filename}`;
        await supabase.from('meetings').update({
          recording_url: publicUrl,
          recording_status: 'completed',
        }).eq('livekit_room_name', roomNameFromEgress);
        console.log(`[webhook] Gravação salva: ${publicUrl}`);
      }
    }

    if (event.event === 'room_finished' && roomName) {
      await supabase.from('meetings').update({
        status: 'completed',
        ended_at: new Date().toISOString(),
      }).eq('livekit_room_name', roomName);
    }
  } catch (err: any) {
    console.error(`[webhook] Error processing event:`, err.message);
  }

  return new Response('OK', { status: 200 });
});
```

**Deploy:**
```bash
npx supabase functions deploy livekit-webhook --no-verify-jwt --project-ref SEU_REF
```

Configurar URL no dashboard LiveKit: `https://SEU_REF.supabase.co/functions/v1/livekit-webhook`

---

## 8. Edge function `livekit-end-room`

Quando o host encerra, essa função deleta a sala no servidor (kicka todo mundo + finaliza Egress). Sem isso, o lead fica sozinho na sala mesmo depois do host sair.

**Arquivo:** `supabase/functions/livekit-end-room/index.ts`

```typescript
import { RoomServiceClient } from 'https://esm.sh/livekit-server-sdk@2.7.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const API_KEY = Deno.env.get('LIVEKIT_API_KEY')!;
const API_SECRET = Deno.env.get('LIVEKIT_API_SECRET')!;
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL')!.replace('wss://', 'https://');

const rs = new RoomServiceClient(LIVEKIT_URL, API_KEY, API_SECRET);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { room_name } = await req.json();
    if (!room_name) return new Response(JSON.stringify({ error: 'room_name required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

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

Deploy idêntico às anteriores.

---

## 9. Edge function `send-meeting-email` (opcional)

Envia email de confirmação/lembrete/reagendamento com anexo `.ics` (compatível com Google/Outlook/Apple Calendar).

**Arquivo:** `supabase/functions/send-meeting-email/index.ts`

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('MEETING_FROM_EMAIL') || 'noreply@seudominio.com';

function formatICSDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function buildICS(params: {
  uid: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  url: string;
  attendeeEmail: string;
  attendeeName: string;
  organizerEmail: string;
  organizerName: string;
}): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SeuCRM//Meeting//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${params.uid}`,
    `DTSTAMP:${formatICSDate(new Date().toISOString())}`,
    `DTSTART:${formatICSDate(params.start)}`,
    `DTEND:${formatICSDate(params.end)}`,
    `SUMMARY:${params.summary}`,
    `DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`,
    `LOCATION:${params.url}`,
    `URL:${params.url}`,
    `ORGANIZER;CN=${params.organizerName}:mailto:${params.organizerEmail}`,
    `ATTENDEE;CN=${params.attendeeName};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION:mailto:${params.attendeeEmail}`,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const payload = await req.json();
    const {
      type, // 'scheduled' | 'reminder' | 'rescheduled' | 'no_show'
      to,
      leadName,
      meetingTitle,
      startAt,
      endAt,
      meetLink,
      hostName,
      hostEmail,
    } = payload;

    const firstName = leadName?.split(' ')[0] || '';

    let subject = '';
    let html = '';

    if (type === 'scheduled') {
      subject = `✅ Reunião confirmada — ${meetingTitle}`;
      html = `
        <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>Olá ${firstName}, reunião confirmada!</h2>
          <p>Sua reunião está agendada para <strong>${new Date(startAt).toLocaleString('pt-BR')}</strong>.</p>
          <div style="margin: 24px 0;">
            <a href="${meetLink}" style="background: #10b981; color: white; padding: 14px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
              🎥 Entrar na reunião
            </a>
          </div>
          <p style="font-size: 13px; color: #666;">
            Adicionar ao calendário:
            <a href="https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(meetingTitle)}&dates=${formatICSDate(startAt)}/${formatICSDate(endAt)}&location=${encodeURIComponent(meetLink)}">Google</a> •
            <a href="https://outlook.office.com/calendar/deeplink/compose?subject=${encodeURIComponent(meetingTitle)}&startdt=${startAt}&enddt=${endAt}&location=${encodeURIComponent(meetLink)}">Outlook</a>
          </p>
          <p style="margin-top: 32px; font-size: 12px; color: #999;">
            Se o botão não funcionar, acesse: <a href="${meetLink}">${meetLink}</a>
          </p>
        </div>
      `;
    } else if (type === 'rescheduled') {
      subject = `🔄 Reunião remarcada — ${meetingTitle}`;
      html = `<h2>${firstName}, sua reunião foi remarcada</h2><p>Nova data: <strong>${new Date(startAt).toLocaleString('pt-BR')}</strong></p><a href="${meetLink}">Entrar na nova reunião</a>`;
    } else if (type === 'no_show') {
      subject = `Sentimos sua falta, ${firstName}`;
      html = `<h2>Olá ${firstName}</h2><p>Notamos que você não conseguiu participar. Quer remarcar?</p><p><a href="${meetLink}">Agendar novo horário</a></p>`;
    } else {
      subject = `Lembrete: ${meetingTitle}`;
      html = `<h2>Lembrete de reunião</h2><p>Sua reunião começa em 15 minutos: <strong>${new Date(startAt).toLocaleString('pt-BR')}</strong></p><a href="${meetLink}">Entrar na reunião</a>`;
    }

    const ics = buildICS({
      uid: `${Date.now()}@seudominio.com`,
      summary: meetingTitle,
      description: `Link: ${meetLink}`,
      start: startAt,
      end: endAt,
      url: meetLink,
      attendeeEmail: to,
      attendeeName: leadName,
      organizerEmail: hostEmail,
      organizerName: hostName,
    });

    const icsBase64 = btoa(ics);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html,
        attachments: [{ filename: 'invite.ics', content: icsBase64 }],
      }),
    });

    const result = await res.json();
    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

---

## 10. Frontend — página da sala `/meet/:roomId`

Essa é a tela onde host, guest e observer entram.

**Dependências:**

```bash
npm install livekit-client @livekit/components-react @livekit/components-styles
```

**Arquivo:** `src/pages/MeetRoom.tsx`

```tsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  useConnectionState,
  useParticipants,
  LocalUserChoices,
} from '@livekit/components-react';
import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import '@livekit/components-styles';
import { supabase } from '@/lib/supabase'; // ajuste pro seu client

interface ConnectionData {
  token: string;
  url: string;
}

export default function MeetRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();

  const role = (searchParams.get('role') || 'guest') as 'host' | 'guest' | 'observer';
  const defaultName = searchParams.get('name') || '';
  const leadId = searchParams.get('lead_id') || undefined;
  const orgId = searchParams.get('org_id') || undefined;
  const returnUrl = searchParams.get('return') || '/';

  const isHost = role === 'host';
  const isObserver = role === 'observer';

  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | null>(null);
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [meetingDbId, setMeetingDbId] = useState<string | null>(null);

  // Observer pula PreJoin automaticamente (precisa vir ANTES dos returns)
  useEffect(() => {
    if (isObserver && !preJoinChoices && roomId) {
      (async () => {
        const { token, url } = await getLiveKitToken({
          roomName: roomId,
          participantName: defaultName || 'Observador',
          role: 'observer',
          metadata: { lead_id: leadId, org_id: orgId },
        });
        setPreJoinChoices({
          username: defaultName || 'Observador',
          videoEnabled: false,
          audioEnabled: false,
        } as any);
        setConnectionData({ token, url });
      })();
    }
  }, [isObserver, roomId, preJoinChoices]);

  const handlePreJoin = async (choices: LocalUserChoices) => {
    if (!roomId) return;
    setPreJoinChoices(choices);
    setLoading(true);
    setError(null);

    try {
      // Cria/atualiza meeting no banco
      const { data: existing } = await supabase
        .from('meetings')
        .select('id')
        .eq('livekit_room_name', roomId)
        .maybeSingle();

      if (existing) {
        setMeetingDbId(existing.id);
      } else {
        // Busca activity vinculada (caso meeting foi criada via task no CRM)
        const { data: act } = await supabase
          .from('company_activities')
          .select('id, lead_id, organization_id')
          .like('meeting_link', `%${roomId}%`)
          .maybeSingle();

        const { data: newMeet } = await supabase.from('meetings').insert({
          title: `Reunião ${roomId}`,
          lead_id: leadId || act?.lead_id || null,
          organization_id: orgId || act?.organization_id || null,
          activity_id: act?.id || null,
          meeting_type: 'sales_call',
          status: 'active',
          livekit_room_name: roomId,
          recording_status: 'pending',
          meeting_link: window.location.origin + '/meet/' + roomId,
        }).select('id').single();

        if (newMeet) setMeetingDbId(newMeet.id);

        // Marca task como "em andamento"
        if (act?.id) {
          await supabase.from('company_activities')
            .update({ status: 'in_progress' })
            .eq('id', act.id);
        }
      }

      const { token, url } = await getLiveKitToken({
        roomName: roomId,
        participantName: choices.username || defaultName || 'Participante',
        role,
        metadata: { lead_id: leadId, org_id: orgId },
      });

      setConnectionData({ token, url });
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Erro ao conectar');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isHost) {
      setConnectionData(null);
      setEnded(true);
      return;
    }

    // Host encerra a sala pra todos
    if (roomId) {
      supabase.functions.invoke('livekit-end-room', { body: { room_name: roomId } }).catch(() => {});
    }

    setConnectionData(null);
    setEnded(true);
  };

  // ========== Renders ==========

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl mb-4">Erro</h1>
          <p className="text-zinc-400">{error}</p>
          <a href={returnUrl} className="mt-4 inline-block text-emerald-400">Voltar</a>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl mb-4">Reunião encerrada</h1>
          <p className="text-zinc-400 mb-6">Obrigado pela participação</p>
          <a href={returnUrl} className="bg-emerald-600 text-white px-6 py-3 rounded-lg">Voltar</a>
        </div>
      </div>
    );
  }

  if (!preJoinChoices) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-800 rounded-xl p-6">
          <h1 className="text-white text-2xl mb-4 text-center">Entrando na reunião</h1>
          <PreJoin
            defaults={{ username: defaultName, videoEnabled: true, audioEnabled: true }}
            onSubmit={handlePreJoin}
            data-lk-theme="default"
            userLabel="Seu nome"
            joinLabel="Entrar na sala"
            micLabel="Microfone"
            camLabel="Câmera"
          />
        </div>
      </div>
    );
  }

  if (!connectionData) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <p>Conectando...</p>
      </div>
    );
  }

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
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: params,
  });
  if (error || !data?.token) throw new Error(error?.message || 'Falha ao gerar token');
  return data;
}
```

Adicione a rota no seu router:

```tsx
<Route path="/meet/:roomId" element={<MeetRoom />} />
```

---

## 11. Frontend — helpers `generateRoomName` e `getMeetUrl`

**Arquivo:** `src/lib/livekit.ts`

```typescript
export function generateRoomName(): string {
  return `meeting-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getMeetUrl(roomName: string, opts?: { role?: 'host' | 'guest' | 'observer'; leadId?: string; orgId?: string; name?: string }) {
  // SEMPRE usar URL de produção (mesmo em dev) — se não, o lead recebe localhost
  const baseUrl = 'https://seudominio.com';
  const params = new URLSearchParams();
  if (opts?.role) params.set('role', opts.role);
  if (opts?.leadId) params.set('lead_id', opts.leadId);
  if (opts?.orgId) params.set('org_id', opts.orgId);
  if (opts?.name) params.set('name', opts.name);
  const qs = params.toString();
  return `${baseUrl}/meet/${roomName}${qs ? '?' + qs : ''}`;
}
```

---

## 12. Integração com transcrição Soniox (opcional)

Pra ter transcrição dual-speaker (Vendedor/Lead) em tempo real durante a call, integre Soniox ao stream de áudio do LiveKit.

**Conceito:**
1. Pegue os `MediaStreamTrack` de áudio do **mic local** (host) + dos **participantes remotos** (lead)
2. Converta pra PCM 16kHz
3. Mande via WebSocket pro Soniox (`wss://stt-rt.soniox.com/transcribe-websocket`)
4. Soniox devolve transcrição em tempo real com speaker labels

**Arquivo:** `src/hooks/useLiveKitTranscription.ts`

```typescript
import { useEffect, useRef } from 'react';
import { useLocalParticipant, useParticipants, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useSoniox } from './useSoniox'; // hook existente do Soniox que aceita externalStreams

export function useLiveKitTranscription(meetingId: string | null) {
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Microphone]);
  const streamsRef = useRef<MediaStream[]>([]);

  // Coleta todos os streams de áudio (local + remoto)
  useEffect(() => {
    const streams: MediaStream[] = [];
    tracks.forEach((t) => {
      if (t.publication.track?.mediaStream) {
        streams.push(t.publication.track.mediaStream);
      }
    });
    streamsRef.current = streams;
  }, [tracks]);

  // Passa pro useSoniox (que conecta WebSocket + processa PCM)
  const soniox = useSoniox({ externalStreams: streamsRef });

  // Auto-save a cada 10s
  useEffect(() => {
    if (!meetingId || !soniox.transcriptions.length) return;
    const timer = setInterval(() => {
      supabase.from('meetings').update({
        transcriptions: soniox.transcriptions,
      }).eq('id', meetingId);
    }, 10000);
    return () => clearInterval(timer);
  }, [meetingId, soniox.transcriptions]);

  return soniox;
}
```

**Dica:** use `ref` pra passar os streams pro hook do Soniox, senão tem closure stale (os streams começam vazios e chegam depois).

---

## 13. Gotchas e aprendizados

Lista dos problemas que você vai encontrar e como resolver:

### 1. Supabase Storage multipart tem limite de 6MB
**Sintoma:** uploads da gravação falham silenciosamente.
**Fix:** use Cloudflare R2.

### 2. Egress começa só com participante, não sala vazia
**Sintoma:** se você tentar iniciar Egress em `room_started`, fica em `EGRESS_STARTING` pra sempre.
**Fix:** dispare Egress em `participant_joined`.

### 3. Hooks React antes de returns condicionais
**Sintoma:** erro "Rendered fewer hooks than expected".
**Fix:** todos os `useEffect` vêm **antes** de qualquer `return` do componente.

### 4. Closure stale em transcrição
**Sintoma:** hook do Soniox recebe streams null (capturados no primeiro render).
**Fix:** passe via `ref` em vez de state direto.

### 5. MP4 do LiveKit não toca em mobile
**Sintoma:** desktop funciona, iOS/Android dá `MEDIA_ERR_SRC_NOT_SUPPORTED` (code 4).
**Causa:** moov atom no fim do arquivo (não faststart).
**Fix:** pós-processa com ffmpeg: `ffmpeg -i in.mp4 -c copy -movflags +faststart out.mp4`. Ou configure LiveKit Egress pra gerar faststart direto.

### 6. iOS Safari bloqueia autoplay sem gesture
**Sintoma:** vídeo mostra frame preto, não toca.
**Fix:** use `muted autoPlay playsInline` + mostra botão "Ativar som" pra user dar o gesture de unmute.

### 7. CORS no R2 bloqueia WebAudio
**Sintoma:** se você tentar usar `createMediaElementSource` de áudio do R2.dev, falha silencioso.
**Fix:** configure CORS no bucket R2 (veja seção 2) OU proxy via edge function com `Access-Control-Allow-Origin: *`.

### 8. Link em localhost
**Sintoma:** lead recebe link `http://localhost:3000/meet/...` e não consegue acessar.
**Fix:** o helper `getMeetUrl` sempre retorna domínio de produção, mesmo em dev.

### 9. Observer hidden
**Sintoma:** observer deveria ser invisível mas participante aparece no grid.
**Fix:** setar `hidden: true` + `canPublish: false` nos grants do token.

### 10. DataChannel entre host e observer
**Sintoma:** mensagem do observer vai pro lead tb.
**Fix:** use `publishData` com `destinationIdentities` filtrando só identities que começam com `host-` ou `observer-`.

### 11. Deduplicação timeline do lead
**Sintoma:** aparece 2 cards pra mesma reunião (a task + a meeting).
**Fix:** se `meeting.activity_id` tá setado, pula a task no hook de timeline.

### 12. React Query cache desatualizado
**Sintoma:** UI não atualiza depois de encerrar reunião.
**Fix:** sempre `queryClient.invalidateQueries` nos branches do modal de encerramento.

### 13. Meeting com lead_id null
**Sintoma:** reunião não aparece na timeline do lead.
**Causa:** URL `/meet/XYZ` foi aberta sem `?lead_id=...`.
**Fix:** no `handlePreJoin`, busca `activity.lead_id` como fallback via `meeting_link` matching (código já tá no exemplo da seção 10).

---

## 14. Testes end-to-end

Script de teste mínimo pra validar tudo:

```bash
# 1. Setup
npx supabase secrets set LIVEKIT_API_KEY=xxx LIVEKIT_API_SECRET=yyy ...
npx supabase functions deploy livekit-token
npx supabase functions deploy livekit-webhook
npx supabase functions deploy livekit-end-room
```

**No app:**
1. Logar como usuário admin
2. Criar reunião com um lead (gerar roomName via `generateRoomName`)
3. Abrir `/meet/<roomName>?role=host&lead_id=xxx` em uma aba
4. Copiar o link, abrir `/meet/<roomName>?role=guest&name=Teste` em outra aba (ou celular) — simula o lead
5. Entrar em ambas (host + guest)
6. **Verificar:**
   - Sala conecta WebRTC
   - Em segundos, webhook `participant_joined` dispara Egress
   - `meetings.recording_status` vai pra `recording`
7. Falar um pouco (aparece transcrição real-time se Soniox ativo)
8. Host clica "Sair" → `livekit-end-room` → guest é kicked
9. Aguardar webhook `egress_ended` (1-2min pra terminar de processar)
10. `meetings.recording_url` deve ter URL pública do R2
11. Tocar o MP4 em navegador desktop e mobile — deve tocar em ambos

---

## 15. Custos mensais estimados

Pra uso típico (20-30 reuniões/dia, 30min cada):

| Item | Custo | Nota |
|---|---|---|
| **LiveKit Cloud Ship** | $50/mês | 150.000 min inclusos |
| **Cloudflare R2** | $0-5/mês | Free tier cobre até 10GB storage + zero egress |
| **Supabase Pro** | $25/mês (já tem) | Edge functions, DB |
| **Soniox** | ~$0.10/min | Só se usar transcrição |
| **Resend** (email) | $20/mês | 50k emails |
| **Total extra típico** | **$50-75/mês** | Sem Soniox |

---

## 16. Checklist final

Antes de colocar em produção, confira:

- [ ] Conta LiveKit Cloud criada + project ativo
- [ ] API Key e Secret salvos nos secrets do Supabase
- [ ] Bucket R2 criado e marcado como público
- [ ] Credenciais R2 salvas nos secrets do Supabase
- [ ] Edge functions `livekit-token`, `livekit-webhook`, `livekit-end-room` deployadas (`--no-verify-jwt`)
- [ ] Webhook URL configurada no dashboard LiveKit apontando pra `livekit-webhook`
- [ ] Eventos do webhook marcados: `participant_joined`, `room_finished`, `egress_ended`
- [ ] Tabela `meetings` criada com todas as colunas LiveKit
- [ ] Rota `/meet/:roomId` registrada no router do frontend
- [ ] Teste local de ponta a ponta funcionando (host + guest em abas diferentes)
- [ ] Teste mobile passando (iOS + Android)
- [ ] CSP/Permissions-Policy do seu host liberam `camera`, `microphone`, `display-capture`
- [ ] CORS do R2 configurado se for usar WebAudio
- [ ] Link usando domínio de produção (nunca localhost em prod)
- [ ] Teste com lead real — ele consegue entrar via link só com o nome

---

## Próximos passos (extensões)

Depois que o LiveKit tá rodando, dá pra adicionar:

- **Análise IA pós-call** — edge function que chama Gemini/OpenAI com a transcrição e gera resumo, pontos fortes/fracos, tarefas sugeridas
- **Painel de contexto do lead** ao lado da call (timeline, deals, notas)
- **Chat privado entre host e observer** via DataChannel (`topic: 'coach-chat'` com filtro de destination identities)
- **Badge "AO VIVO" em tarefas** — polling na tabela `meetings` filtrando por `livekit_room_name`
- **Banner de recovery** — detecta se o usuário deixou uma call rolando e volta pra ela
- **Emails de reagendamento/no-show** via `send-meeting-email`

---

## Suporte

Dúvidas técnicas: consulte a documentação oficial:
- LiveKit: https://docs.livekit.io
- Cloudflare R2: https://developers.cloudflare.com/r2
- Supabase Edge Functions: https://supabase.com/docs/guides/functions

Este guia foi escrito com base em implementação real rodando em produção.
