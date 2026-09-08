# Empire CRM — Módulo: Ligações VOIP + WhatsApp com IA

> **Versão:** 1.0  
> **Data:** Abril/2026  
> **Status:** Em elaboração  
> **Depende de:** `20-MODULO-SDR-IA.md` (modos de atendimento), `06-MODULO-COMUNICACOES.md` (inbox unificado)

---

## Índice

- [1. Visão Geral](#1-visão-geral)
- [2. Arquitetura](#2-arquitetura)
- [3. Provedores](#3-provedores)
  - [3.1 Telnyx — VOIP + Voice AI](#31-telnyx--voip--voice-ai)
  - [3.2 Wavoip — Ligações via WhatsApp](#32-wavoip--ligações-via-whatsapp)
  - [3.3 ElevenLabs — TTS Avançado em Português](#33-elevenlabs--tts-avançado-em-português)
- [4. Pilares Funcionais](#4-pilares-funcionais)
  - [4.1 Discador VOIP (Humano)](#41-discador-voip-humano)
  - [4.2 Ligações VOIP com IA (Telnyx Voice AI)](#42-ligações-voip-com-ia-telnyx-voice-ai)
  - [4.3 Discador WhatsApp (Humano)](#43-discador-whatsapp-humano)
  - [4.4 Ligações WhatsApp com IA](#44-ligações-whatsapp-com-ia)
  - [4.5 Inbox Unificado de Chamadas](#45-inbox-unificado-de-chamadas)
  - [4.6 Gravação, Transcrição e Insights](#46-gravação-transcrição-e-insights)
  - [4.7 Discador Power / Preview](#47-discador-power--preview)
- [5. Modelo de Dados](#5-modelo-de-dados)
- [6. Fluxos Detalhados](#6-fluxos-detalhados)
- [7. Configuração por Workspace](#7-configuração-por-workspace)
- [8. Custos Estimados](#8-custos-estimados)
- [9. Riscos e Mitigações](#9-riscos-e-mitigações)
- [10. Tabela de Funcionalidades](#10-tabela-de-funcionalidades)
- [Apêndice B — Guia Prático de Implementação: WavoIP + Soniox](#apêndice-b--guia-prático-de-implementação-wavoip--soniox)

---

## 1. Visão Geral

### O problema hoje

O Empire CRM lida com leads via WhatsApp texto, mas **não faz ligações**. O SDR precisa sair do CRM, abrir o telefone, discar manualmente, e depois voltar para registrar o resultado. Para ligações VIA WhatsApp (que os leads preferem), precisa usar o celular pessoalmente. Não há gravação, não há transcrição, não há IA assistindo a chamada.

### O que este módulo resolve

Um módulo de **ligações integrado** que permite:

1. **Ligar por VOIP** direto do navegador (telefone normal) — humano ou IA
2. **Ligar por WhatsApp** direto do navegador — humano ou IA
3. **IA fazendo ligações autônomas** em ambos os canais (SDR IA por voz)
4. **Gravação + transcrição** automáticas de todas as chamadas
5. **Tudo centralizado** no inbox do CRM com timeline completa

### Decisão técnica central

| Canal | Provedor | Motivo |
|-------|----------|--------|
| **VOIP (telefone)** | **Telnyx** | Infraestrutura completa (telefonia + Voice AI nativa + SIP + WebRTC), latência <200ms, STIR/SHAKEN para entregabilidade, 100+ idiomas |
| **WhatsApp** | **Wavoip** | Única solução brasileira que faz ligações VIA WhatsApp nativamente, sem gambiarra, com API por WebSocket e SIP, suporte a API oficial e não-oficial |
| **TTS (voz em português)** | **Telnyx TTS Router + ElevenLabs** | Telnyx roteia entre provedores de voz; para português brasileiro com naturalidade máxima, usamos ElevenLabs via BYOK no Telnyx ou diretamente. Fallback: vozes MiniMax e Telnyx NaturalHD |
| **LLM (raciocínio)** | **OpenRouter** (princípio 9 do PRD) | Sempre pelo OpenRouter. Para Voice AI no Telnyx, usamos Kimi-K2.5 (nativo, hospedado nas GPUs Telnyx) ou trazemos chave OpenRouter |

---

## 2. Arquitetura

### Diagrama de alto nível

```
┌───────────────────────────────────────────────────────────────────┐
│                        EMPIRE CRM (Frontend)                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │  Discador    │  │   Inbox      │  │   Config IA Voice     │   │
│  │  VOIP+WA     │  │   Chamadas   │  │   (Agente, Voz, LLM)  │   │
│  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘   │
│         │                  │                       │                │
└─────────┼──────────────────┼───────────────────────┼────────────────┘
          │                  │                       │
          ▼                  ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│   TELNYX API     │  │  WAVOIP API     │  │  SUPABASE (Backend)   │
│                  │  │  (WebSocket)    │  │                        │
│ ┌─────────────┐  │  │ ┌─────────────┐ │  │ ┌────────────────────┐  │
│ │ Call Control│  │  │ │ startCall() │ │  │ │ chamadas          │  │
│ │ (WebRTC/    │  │  │ │ onOffer()   │ │  │ │ gravacoes         │  │
│ │  SIP)       │  │  │ │ end()       │ │  │ │ transcricoes      │  │
│ └──────┬──────┘  │  │ │ mute()      │ │  │ │ ai_call_logs      │  │
│        │         │  │ └──────┬──────┘ │  │ │ configuracoes     │  │
│ ┌──────▼──────┐  │  │        │        │  │ └────────────────────┘  │
│ │ Voice AI    │  │  │        │        │  │                        │
│ │ Agents      │  │  │        │        │  │ ┌────────────────────┐  │
│ │ (STT→LLM→TTS│  │  │        │        │  │ │ Edge Functions     │  │
│ │  integrado) │  │  │        │        │  │ │ - call-webhook     │  │
│ └──────┬──────┘  │  │        │        │  │ │ - ai-call-bridge   │  │
│        │         │  │        │        │  │ │ - transcript-ai    │  │
│ ┌──────▼──────┐  │  ┌────────┘        │  │ └────────────────────┘  │
│ │ TTS Router │  │  │                  │  │                        │
│ │ (ElevenLabs│  │  │  ┌─────────────┐ │  │                        │
│ │  MiniMax    │  │  │  │ Webphone    │ │  │                        │
│ │  Telnyx HD) │  │  │  │ (iframe)   │ │  │                        │
│ └─────────────┘  │  │  └─────────────┘ │  │                        │
│                  │  │                  │  │                        │
│ ┌─────────────┐  │  │  ┌─────────────┐ │  │                        │
│ │ SIP Trunk  │◄─┼──┼──│ SIP Bridge  │─┼──┼── (audio bridge IA)   │
│ └─────────────┘  │  │  └─────────────┘ │  │                        │
└─────────────────┘  └─────────────────┘  └──────────────────────┘
```

### Fluxos de chamada

#### Fluxo A — Ligação VOIP Humana (SDR manual)

```
SDR clica "Ligar" no lead card
  → Frontend chama Telnyx Call Control API via edge function
  → Telnyx disca o número do lead (outbound)
  → WebRTC no navegador do SDR conecta a chamada
  → SDR conversa com o lead pelo headset
  → Gravação automática via Telnyx
  → Ao encerrar, webhook Telnyx → edge function → salva gravação + transcrição
```

#### Fluxo B — Ligação VOIP com IA (SDR IA por voz)

```
Trigger dispara (cadência, workflow, manual)
  → Edge function chama Telnyx AI Assistant API
  → Telnyx Voice AI Agent faz a chamada outbound
  → STT (Telnyx Whisper) transcreve voz do lead em tempo real
  → LLM (Kimi-K2.5 ou modelo configurado via OpenRouter) gera resposta
  → TTS (ElevenLabs PT-BR ou MiniMax) sintetiza em áudio
  → Conversa flui naturalmente — handoff para humano se necessário
  → Post-call: Insights (resumo, sentimento, BANT) salvos no CRM
```

#### Fluxo C — Ligação WhatsApp Humana (SDR manual)

```
SDR clica "Ligar via WhatsApp" no lead card
  → Frontend abre Webphone Wavoip (iframe ou componente SDK)
  → Wavoip API estabelece chamada via WhatsApp do número conectado
  → SDR conversa com o lead pelo headset (áudio via WhatsApp)
  → Gravação automática Wavoip (armazenada em storage.wavoip.com)
  → Ao encerrar, webhook Wavoip → edge function → salva registro
  → Gravação baixada e armazenada no Supabase Storage
```

#### Fluxo D — Ligação WhatsApp com IA (SDR IA por voz no WA)

```
Trigger dispara (cadência, workflow, manual)
  → Edge function inicia chamada via Wavoip WebSocket API
  → Wavoip faz outbound call via WhatsApp do número conectado
  → Áudio do lead flui para nosso server via SIP bridge (Wavoip SIP trunk)
  → Servidor de audio bridge processa:
     → STT (Telnyx ou Deepgram) transcreve voz do lead
     → LLM (via OpenRouter) gera resposta contextualizada
     → TTS (ElevenLabs PT-BR) sintetiza áudio
     → Áudio sintetizado injetado de volta na chamada via SIP bridge
  → Se lead pede humano → handoff: chamada transferida para SDR humano
  → Post-call: gravação + transcrição + insights salvos no CRM
```

> **Nota sobre Fluxo D:** O audio bridge para IA em WhatsApp é a parte mais complexa da arquitetura. Exige um servidor de mídia (ex: FreeSWITCH ou Asterisk como SIP proxy) entre Wavoip e o pipeline de IA. A Wavoip suporta integração SIP que permite este roteamento. Ver seção [4.4](#44-ligações-whatsapp-com-ia) para detalhes da implementação em fases.

---

## 3. Provedores

### 3.1 Telnyx — VOIP + Voice AI

#### O que é

Plataforma americana de telecomunicações que **detém a infraestrutura completa**: rede própria de fibra, GPUs em PoPs de borda, e toda a stack de Voice AI. Diferente de Vapi ou Retell que orquestram sobre infra de terceiros, o Telnyx é a infra.

#### Capacidades relevantes

| Capacidade | Detalhes |
|-----------|----------|
| **Voice AI Agents** | Agentes de IA autônomos que fazem e recebem ligações com conversação natural |
| **Call Control API** | Controle programático de chamadas (discar, transferir, gravar, DTMF) |
| **WebRTC** | Chamadas diretamente no navegador — sem plugin, sem app |
| **SIP Trunking** | Conexão com PBX externo (FreeSWITCH, Asterisk) para bridging |
| **STT (Speech-to-Text)** | Whisper próprio (incluído no Conversational AI), Deepgram, Azure |
| **TTS Router** | Roteia entre 7+ provedores de voz (ElevenLabs, MiniMax, Rime, Resemble, Inworld, AWS, Azure, Telnyx Natural/HD) com uma API |
| **LLM nativo** | Modelos hospedados nas GPUs Telnyx: Kimi-K2.5 (recomendado), Qwen3-235B, GLM-5.1, MiniMax-M2.5. Sem necessidade de chave externa |
| **BYOK (Bring Your Own Key)** | OpenAI, Anthropic, Google, Groq, xAI — traz sua própria chave |
| **Multi-agent handoff** | Transferência transparente entre agentes com contexto compartilhado |
| **Knowledge Bases** | Upload de documentos para RAG (base de conhecimento do agente) |
| **AI Insights** | Extração automática de campos estruturados de cada chamada |
| **Noise Suppression** | Krisp e DeepFilterNet integrados — áudio limpo mesmo em ambiente barulhento |
| **Voicemail Detection** | Detecção de caixa postal com AMD (Answering Machine Detection) |
| **MMS durante chamada** | Agente pode receber/enviar imagens durante a conversa (com modelos de visão) |
| **STIR/SHAKEN** | Atestado nível A — chamadas aparecem como verificadas, não spam |
| **40+ idiomas** | Suporte multilíngue com troca de idioma mid-conversation (code-switching) |
| **Integrações** | Salesforce, HubSpot, Zendesk, ServiceNow, Jira, Intercom, GitHub, Greenhouse |

#### Modelos LLM disponíveis (nativos, sem chave externa)

| Modelo | Parâmetros | Contexto | Input/1k tokens | Output/1k tokens | Melhor para |
|--------|-----------|----------|----------------|-------------------|-------------|
| `moonshotai/Kimi-K2.5` | 1.0T | 256K | $0.0006 | $0.003 | Uso geral, Voice AI (recomendado) |
| `Qwen/Qwen3-235B-A22B` | 235.1B | 32K | $0.0006 | $0.002 | Function calling, raciocínio |
| `MiniMaxAI/MiniMax-M2.5` | — | 2M | sob consulta | sob consulta | Contexto longo |
| `zai-org/GLM-5.1-FP8` | 753.9B | 202K | sob consulta | sob consulta | Maior inteligência open-source |

#### Modelos externos (BYOK)

Qualquer modelo acessível via OpenRouter (princípio 9 do PRD), incluindo: Claude Haiku/Sonnet/Opus, GPT-4o/GPT-5, Gemini, Llama, etc.

#### TTS — Vozes em Português Brasileiro

| Provedor | Vozes PT-BR | Qualidade | Custo |
|----------|------------|-----------|-------|
| **ElevenLabs** (BYOK) | ~15 vozes PT-BR | ★★★★★ — Mais natural do mercado | Pago por caractere |
| **MiniMax** | Lucia, Celestino + outras | ★★★★ — Boa naturalidade | Incluído no Conversational AI |
| **Telnyx NaturalHD** | Vozes multilíngues | ★★★ — Funcional, menos expressiva | Incluído |
| **Rime Arcana V3** | Code-switching (troca de idioma na mesma frase) | ★★★★ — Ideal para português com termos em inglês | Pago |

**Decisão:** Para ligações VOIP com IA, usar **ElevenLabs** como TTS principal para qualidade em português. **MiniMax** como fallback (já incluído no Telnyx). Para ligações WhatsApp com IA, usar **ElevenLabs** diretamente (ver seção 3.3).

#### Pricing Telnyx (Pay-as-you-go)

| Componente | Preço |
|-----------|-------|
| Conversational AI (orquestração) | $0.05/min |
| Call Control (telefonia) | $0.002/min |
| WebRTC (navegador) | $0.002/min |
| Inbound Telephony (receber) | SIP Trunking fee |
| Outbound Telephony (discar BR) | ~$0.01–0.03/min (varia por destino) |
| STT (Speech-to-Text) | Incluído |
| TTS Telnyx Natural/NaturalHD | Incluído |
| TTS ElevenLabs (BYOK) | Cobrado pela ElevenLabs diretamente |
| LLM Kimi-K2.5 (nativo) | $0.0006/1k input + $0.0003/1k cached + $0.003/1k output |
| Cloud Storage (knowledge base) | $0.006/GiB/mês |

**Custo estimado por ligação VOIP com IA de 3 minutos (Brasil):**
- Conversational AI: 3 min × $0.05 = $0.15
- Outbound BR: 3 min × ~$0.02 = $0.06
- STT: Incluído
- TTS ElevenLabs: ~3 min × 150 palavras/min × ~$0.30/1M chars ≈ $0.001
- LLM Kimi-K2.5: ~2k tokens ≈ $0.01
- **Total estimado: ~$0.22 por ligação de 3 min (~R$ 1.30)**

---

### 3.2 Wavoip — Ligações via WhatsApp

#### O que é

Empresa brasileira que transforma WhatsApp em canal de voz profissional. Permite fazer e receber ligações pelo WhatsApp diretamente do navegador, com API para automação.

#### Capacidades relevantes

| Capacidade | Detalhes |
|-----------|----------|
| **Ligações via WhatsApp** | Faz e recebe chamadas de voz pelo WhatsApp do número conectado |
| **Conexão por QR Code** | Escaneia QR como WhatsApp Web — sem perder número ou histórico |
| **API Oficial + Não-Oficial** | Suporta ambos os tipos de API do WhatsApp |
| **Websocket SDK** | `@wavoip/wavoip-api` — controle programático completo de chamadas |
| **Click To Call** | URL simples para iniciar chamada — integração em 10 minutos |
| **SIP Integration** | Conecta a PBX (FreeSWITCH, Asterisk) via SIP trunk |
| **Webphone** | Interface web completa para chamadas |
| **Gravação** | Todas as chamadas gravadas automaticamente, armazenamento ilimitado |
| **Webhooks** | Eventos de CALL (criar/atualizar), RECORD (status gravação), DEVICE (status dispositivo) |
| **Canais simultâneos** | 1 canal por dispositivo — múltiplos dispositivos = múltiplas chamadas simultâneas |
| **Identidade visual** | Nome, foto e identidade da empresa aparecem no WhatsApp do lead |
| **Histórico no chat** | Cada ligação fica registrada na linha do tempo da conversa |

#### Planos e Preços

| Plano | Preço | Chamadas Simultâneas |
|-------|-------|---------------------|
| Básico | R$ 99,90/mês | 1 |
| Empresarial | R$ 600/mês | 10 |
| Scale Up | R$ 1.200/mês | 30 |

#### Riscos do WhatsApp

| Risco | Nível | Mitigação |
|-------|-------|-----------|
| Banimento do número por ligações a desconhecidos | Médio | Usar para atendimento ativo e retorno de clientes; não para cold calling indiscriminado |
| Instabilidade da API não-oficial | Baixo | Preferir API oficial; Wavoip suporta ambas |
| Limitação de canais simultâneos | Baixo | Adicionar mais dispositivos conforme demanda |

#### Integração: Click To Call

```typescript
// Exemplo: abrir discador Wavoip em nova janela
window.open(
  `https://app.wavoip.com/call?token=${deviceToken}&phone=5511999999999&name=Lead%20Nome&start_if_ready=true&available_after_call=false&close_after_call=true`,
  'wavoip',
  { width: 300, height: 500 }
)
```

#### Integração: WebSocket SDK

```typescript
import { Wavoip } from '@wavoip/wavoip-api'

const wavoip = new Wavoip({
  tokens: ['token-dispositivo-1', 'token-dispositivo-2']
})

// Receber ligação
wavoip.onOffer((offer) => {
  console.log('Ligação recebida de:', offer.peer.phone)
  offer.accept().then(({ call }) => {
    call.onEnd(() => console.log('Chamada encerrada'))
  })
})

// Fazer ligação
wavoip.startCall({ to: '5511999999999', fromTokens: ['token-dispositivo-1'] })
  .then(({ call }) => {
    call.onPeerAccept((activeCall) => {
      console.log('Lead atendeu!')
      activeCall.onEnd(() => console.log('Chamada encerrada'))
    })
  })
```

#### Integração: SIP Bridge (para IA em WhatsApp)

A Wavoip suporta conexão SIP, permitindo que chamadas WhatsApp sejam roteadas para um servidor de mídia (FreeSWITCH/Asterisk) que faz o bridge com o pipeline de IA.

```
Lead atende no WhatsApp
  → Wavoip estabelece chamada
  → Áudio roteado via SIP trunk para FreeSWITCH
  → FreeSWITCH faz fork do áudio:
    → STT (Telnyx Whisper) transcreve o lead
    → LLM (OpenRouter/Kimi-K2.5) gera resposta
    → TTS (ElevenLabs PT-BR) sintetiza áudio
    → FreeSWITCH injeta áudio de volta na chamada Wavoip
  → Handoff: FreeSWITCH transfere chamada para SDR humano
```

---

### 3.3 ElevenLabs — TTS Avançado em Português

#### Por que ElevenLabs

O Telnyx oferece TTS Router com múltiplos provedores, mas para **português brasileiro com naturalidade máxima** (sem sotaque robótico, sem pronúncia artificial), a ElevenLabs é o melhor do mercado:

- **~15 vozes específicas em PT-BR** — não são vozes americanas forçando sotaque
- **Voice Design** — permite criar uma voz personalizada para a Empire a partir de amostras
- **Voice Cloning** — clona a voz de um SDR real para ligações com IA soarem como a pessoa
- **Latência ~250ms** — suficiente para conversação natural
- **API simples** — POST com texto, recebe áudio

#### Vozes recomendadas para SDR IA

| Voz | Estilo | Uso |
|-----|--------|-----|
| **Rachel** | Profissional, amigável | SDR feminino padrão |
| **Antônio** | Profissional, seguro | SDR masculino padrão |
| **Voz Custom (Voice Design)** | Imita o tom da Empire | Atendimento da marca |
| **Clone do SDR real** | Voz do próprio vendedor | Handoff imperceptível IA→humano |

#### Integração com Telnyx

O Telnyx suporta ElevenLabs como TTS provider BYOK (Bring Your Own Key):
1. Criar chave API na ElevenLabs (plano pago necessário)
2. Armazenar chave como Integration Secret no Telnyx
3. Configurar o Assistant para usar ElevenLabs como TTS provider
4. Selecionar a voz desejada

#### Integração direta (para WhatsApp AI)

Para ligações WhatsApp com IA, onde o áudio não passa pelo Telnyx:
```typescript
// Edge function: text-to-speech via ElevenLabs
const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/VOICE_ID', {
  method: 'POST',
  headers: {
    'xi-api-key': ELEVENLABS_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'Olá! Aqui é da Empire Business, tudo bem?',
    model_id: 'eleven_multilingual_v2',
    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
  })
})
const audioBuffer = await response.arrayBuffer()
```

---

## 4. Pilares Funcionais

### 4.1 Discador VOIP (Humano)

O SDR clica "Ligar" no lead card e fala diretamente pelo navegador usando headset.

#### Funcionalidades

- **Discagem 1-clique**: Botão "Ligar ☎️" no lead card, inbox, kanban e lista
- **Softphone WebRTC**: Chamada acontece dentro do CRM — sem abrir app externo
- **Discador manual**: Campo para digitar número diretamente
- **Transferência**: SDR pode transferir chamada para outro membro (warm transfer — apresenta o lead)
- **MUDO**: SDR pode silenciar o microfone
- **Gravação automática**: Toda chamada gravada, armazenada no Supabase Storage
- **Registro automático**: Ao encerrar, cria registro em `chamadas` vinculado ao contato/oportunidade
- **Histórico**: Timeline do lead mostra todas as chamadas (data, duração, gravação, transcrição)
- **Contatos bloqueados/supressão**: Não ligar para números na lista de exclusão (LGPD, opt-out)
- **Horário comercial**: Alerta se ligar fora do horário comercial do lead

#### Implementação técnica

```
Frontend (WebRTC SDK):
  → Telnyx Call Control Client via WebRTC
  → Número de origem: número Telnyx comprado (ex: +55 11 3000-0000)
  → Destination: telefone do lead
  → Gravação: Telnyx gravando automaticamente
  → Post-call: webhook para edge function com URL da gravação + transcrição
```

#### Números de telefone

Cada workspace pode comprar números virtuais via Telnyx:
- Número local brasileiro (ex: +55 11 3000-0000) — ~$1/mês
- Número verde (0800) — requer contrato
- Caller ID customizável com nome da empresa (STIR/SHAKEN nível A)

---

### 4.2 Ligações VOIP com IA (Telnyx Voice AI)

O SDR IA faz ligações autônomas por telefone — sem intervenção humana.

#### Como funciona (visão do lead)

1. Lead recebe ligação no telefone normal
2. Voz natural em português (ElevenLabs/MiniMax) — não parece robô
3. Conversa flui naturalmente com pausas, tom de pergunta, empatia
4. Se o lead pede para falar com humano, a chamada é transferida
5. Após a chamada, o lead recebe WhatsApp de confirmação (se configurado)

#### Configuração do Agente Voice AI

Cada workspace configura um ou mais agentes Voice AI com:

| Configuração | Opções | Padrão |
|-------------|--------|--------|
| **Nome do agente** | Texto livre | "Empire Business" |
| **Personalidade (system prompt)** | Texto livre com variáveis dinâmicas | Prompt SDR IA adaptado para voz |
| **Idioma principal** | pt-BR, en, es | pt-BR |
| **Modelo LLM** | Qualquer via OpenRouter, ou Kimi-K2.5 nativo | Kimi-K2.5 |
| **Voz TTS** | ElevenLabs (qualquer voz), MiniMax, Telnyx HD | ElevenLabs "Antônio" |
| **Velocidade de fala** | 0.5x – 2.0x | 1.0x |
| **Tom** | Casual, Profissional, Empático | Profissional com empatia |
| **Detecção de caixa postal** | On/Off, com msg customizada | On |
| **Supressão de ruído** | Krisp / DeepFilterNet / Desativado | Krisp |
| **Horário de operação** | Seg–Sex 9h–18h (configurável) | Horário comercial BR |
| **Max tentativas por lead** | 1, 2, 3, 5 | 3 |
| **Intervalo entre tentativas** | 30min, 1h, 2h, 4h | 2h |
| **Transferência para humano** | Número Telnyx ou membro do workspace | SDR humano |
| **Mensagem de caixa postal** | Texto gravado via TTS | Customizável |
| **Knowledge Base (RAG)** | Upload de PDFs, URLs | Documentos da empresa |

#### Ferramentas (Tools) do Agente Voice AI

O agente pode executar ações durante a chamada via function calling:

| Tool | Descrição | Parâmetros |
|------|-----------|-----------|
| `schedule_meeting` | Agenda reunião no CRM | lead_id, data_hora, duracao, closer_id |
| `update_lead_status` | Movimenta lead no pipeline | lead_id, novo_stage |
| `send_whatsapp_message` | Envia mensagem WhatsApp após ligação | lead_id, mensagem |
| `transfer_to_human` | Transfere chamada para SDR humano | member_id ou número |
| `hang_up` | Encerra chamada educadamente | motivo |
| `check_availability` | Verifica disponibilidade do closer | closer_id, data |

#### Fluxo de uma ligação SDR IA por VOIP

```
1. Trigger dispara (manual, cadência, workflow)
2. Edge function cria AI Assistant no Telnyx (se não existe)
3. Edge function disca via Telnyx Call Control API:
   POST /v2/texml/ai_calls/{app_id}
   {
     "From": "+551130000000",
     "To": lead.telefone,
     "AIAssistantId": "assistant-uuid"
   }
4. Lead atende (ou caixa postal detectada)
5. Se atendeu:
   a. Agente inicia conversação com greeting configurado
   b. STT transcreve em tempo real (Whisper)
   c. LLM processa contexto + histórico do lead
   d. TTS sintetiza resposta (ElevenLabs PT-BR)
   e. Tools podem ser chamadas durante a conversa
   f. Se lead pede humano → transfer via SIP
   g. Se agendamento → tool schedule_meeting
   h. Se lead desinteressado → hang_up com educação
6. Se caixa postal:
   a. Agente deixa mensagem gravada via TTS
   b. Registra no CRM: "caixa postal, mensagem deixada"
7. Post-call webhook:
   a. Telnyx envia transcript + recording + insights
   b. Edge function salva em chamadas + transcrição
   c. Se agendou reunião → cria em reunioes
   d. Se transferiu → registra handoff
```

#### Insights automáticos (AI Insights do Telnyx)

Após cada ligação, o Telnyx extrai campos estruturados:

```typescript
// Configuração de Insights no Assistant
insights: [
  { name: 'interesse_nivel', type: 'enum', values: ['alto', 'medio', 'baixo', 'nenhum'] },
  { name: 'agendou_reuniao', type: 'boolean' },
  { name: 'objecao_principal', type: 'string' },
  { name: 'proximo_passo', type: 'string' },
  { name: 'resumo_ligacao', type: 'string' },
  { name: 'bant_score', type: 'number' },
]
```

---

### 4.3 Discador WhatsApp (Humano)

O SDR clica "Ligar via WhatsApp" e fala com o lead pelo WhatsApp — direto do navegador.

#### Funcionalidades

- **Discagem 1-clique via WhatsApp**: Botão "Ligar via WhatsApp 📱" no lead card
- **Webphone integrado**: Componente Wavoip embutido no CRM (iframe ou SDK)
- **Identidade visual**: Nome e logo da empresa aparecem no WhatsApp do lead
- **Gravação automática**: Wavoip grava todas as chamadas
- **Registro no CRM**: Ao encerrar, webhook Wavoip → edge function → salva em `chamadas`
- **Histórico no chat WhatsApp**: Ligação fica registrada na timeline da conversa do lead
- **Múltiplos dispositivos**: Workspace pode ter N números WhatsApp conectados (1 por SDR ou número compartilhado)
- **Status do dispositivo em tempo real**: Mostra se número está conectado, desconectado ou com erro

#### Implementação

```typescript
// Frontend: componente React do discador WhatsApp
import { Wavoip } from '@wavoip/wavoip-api'

const wavoip = new Wavoip({ tokens: [deviceToken] })

// Fazer ligação
async function callViaWhatsApp(phone: string) {
  const { call, err } = await wavoip.startCall({
    to: phone,
    fromTokens: [deviceToken]
  })
  if (err) {
    // tratar erro (dispositivo offline, lead offline, etc)
    return
  }
  // call.onPeerAccept → lead atendeu
  // call.onEnd → chamada encerrada
  // call.onStats → estatísticas (RTT, perda de pacote)
}

// Receber ligação
wavoip.onOffer((offer) => {
  // offer.peer.phone → número de quem está ligando
  // offer.peer.displayName → nome (se disponível)
  // offer.accept() ou offer.reject()
})
```

#### Gerenciamento de dispositivos WhatsApp

Cada SDR pode ter 1 ou mais números conectados:

```typescript
// Tabela: whatsapp_devices
{
  id: UUID
  workspace_id: UUID
  member_id: UUID          // qual SDR usa este número
  token: TEXT              // token Wavoip
  phone_number: TEXT       // número WhatsApp (5511999999999)
  display_name: TEXT       // "Vendas SP" / "SDR Maria"
  status: ENUM             // 'open', 'close', 'connecting', 'hibernating', 'disconnected'
  is_default: BOOLEAN     // número padrão do SDR
  created_at: TIMESTAMPTZ
}
```

---

### 4.4 Ligações WhatsApp com IA

SDR IA faz ligações autônomas pelo WhatsApp do número conectado da empresa.

#### Desafio técnico

Diferente do VOIP (onde o Telnyx controla toda a stack de áudio), no WhatsApp o áudio passa pela infraestrutura da Meta/Wavoip. Não temos acesso direto ao stream de áudio para injetar TTS. A solução é um **audio bridge via SIP**.

#### Arquitetura em 3 Fases

##### Fase 1 — Gravação + Transcrição Pós-Call (mais simples)

Nesta fase, a IA NÃO fala em tempo real. O SDR humano faz a ligação, e a IA assiste:

```
1. SDR humano liga via WhatsApp (Wavoip)
2. Chamada gravada automaticamente
3. Ao encerrar, webhook Wavoip → edge function
4. Edge function baixa gravação (storage.wavoip.com/{call_id})
5. Envia áudio para STT (Telnyx Whisper ou Deepgram)
6. Envia transcrição para LLM (OpenRouter) → gera:
   - Resumo da chamada
   - Sentimento detectado
   - BANT preenchido
   - Próximos passos sugeridos
7. Salva tudo em chamadas + transcrição no CRM
```

**Custo estimado:** STT ~$0.012/min + LLM ~$0.005/chamada = ~R$ 0.10/chamada de 5 min

**Valor imediato:** Mesmo sem IA em tempo real, a transcrição e análise pós-call são valiosíssimas.

##### Fase 2 — Audio Bridge SIP (IA em tempo real)

Nesta fase, a IA FAZ a ligação e conversa em tempo real via WhatsApp:

```
1. Trigger dispara ligação IA via WhatsApp
2. Edge function → Wavoip startCall()
3. Wavoip estabelece chamada com lead via WhatsApp
4. Wavoip SIP trunk → FreeSWITCH (nosso servidor de mídia)
5. FreeSWITCH:
   a. Forka o áudio em dois streams:
      - Stream 1: STT (Telnyx Whisper) → LLM (OpenRouter/Kimi-K2.5) → TTS (ElevenLabs PT-BR)
      - Stream 2: Gravação bruta (salva no Supabase Storage)
   b. Áudio sintetizado pelo TTS injetado de volta na chamada
   c. Supressão de ruído (Krisp) aplicada
6. Se handoff para humano: FreeSWITCH transfere SIP → SDR humano conectado
7. Post-call: gravação + transcrição + insights salvos no CRM
```

**Servidor de mídia necessário:** FreeSWITCH rodando em VPS dedicado (recommended: Hetzner ou AWS EC2 c5.large, ~$50-100/mês)

**Complexidade:** Alta. Requer expertise em FreeSWITCH/SIP. Framework como FreeSWITCH ESL (Event Socket Library) para orquestração.

##### Fase 3 — Pipeline Custom com WebRTC Media Server (melhor latência)

Substitui FreeSWITCH por servidor de mídia mais moderno (LiveKit Media Server ou custom):

```
LiveKit SFU Media Server
  → Recebe stream de áudio do Wavoip (via SIP gateway)
  → Processa em pipeline STT → LLM → TTS com <300ms latência
  → Stream sintetizado de volta para Wavoip
  → Supressão de ruído, VAD (Voice Activity Detection) integrado
  → Gravação dual-channel (lead + IA separados)
```

> **Recomendação:** Começar pela **Fase 1** (transcrição pós-call) para validar valor, depois investir na **Fase 2** (audio bridge SIP) quando a demanda por IA autônoma em WhatsApp justificar.

---

### 4.5 Inbox Unificado de Chamadas

Todas as chamadas (VOIP e WhatsApp, humanas e IA) aparecem no inbox unificado.

#### Componentes

| Componente | Descrição |
|-----------|-----------|
| **Lista de chamadas** | Aba "Chamadas" no inbox — filtrar por tipo (VOIP/WA), direção (inbound/outbound), status |
| **Player de áudio** | Reprodutor embutido no CRM — ouvir gravação sem sair do sistema |
| **Transcrição lado a lado** | Áudio + texto sincronizado — clicar no texto pula para o momento do áudio |
| **Insights da IA** | Card com resumo, sentimento, BANT, próximos passos — gerado automaticamente |
| **Timeline integrada** | Chamada aparece na timeline do lead junto com mensagens e notas |
| **Discar da timeline** | Botão "Ligar" ao lado de cada número de telefone no lead card |

#### Tipos de chamada no inbox

| Tipo | Ícone | Cor |
|------|-------|-----|
| VOIP outbound (SDR ligou) | 📞→ | Azul |
| VOIP inbound (lead ligou) | 📞← | Verde |
| VOIP IA (SDR IA ligou) | 🤖→ | Roxo |
| WhatsApp outbound (SDR ligou via WA) | 📱→ | Azul |
| WhatsApp inbound (lead ligou via WA) | 📱← | Verde |
| WhatsApp IA (SDR IA ligou via WA) | 🤖📱→ | Roxo |
| Chamada perdida (não atendida) | 📞✗ | Vermelho |
| Caixa postal (voicemail) | 📞💬 | Amarelo |

---

### 4.6 Gravação, Transcrição e Insights

Toda chamada é gravada e transcrita automaticamente.

#### Gravação

| Aspecto | VOIP (Telnyx) | WhatsApp (Wavoip) |
|---------|--------------|-------------------|
| **Ativação** | Automática em toda chamada | Automática em toda chamada |
| **Formato** | MP3 / WAV | MP3 (armazenado em Wavoip) |
| **Armazenamento** | Telnyx → download para Supabase Storage | Wavoip → download para Supabase Storage |
| **Dual-channel** | Sim (lead e SDR em canais separados) | Não (mono mixado) |
| **Duração mínima** | Sem limite | Sem limite |
| **Retenção** | Permanente no Supabase Storage | Permanente no Supabase Storage |
| **LGPD** | Lead pode solicitar exclusão | Lead pode solicitar exclusão |

#### Transcrição

| Aspecto | VOIP (Telnyx) | WhatsApp (Fase 1) |
|---------|--------------|-------------------|
| **Quando** | Tempo real (durante a chamada) | Pós-call (após download da gravação) |
| **Provedor** | Telnyx Whisper (incluído) | Deepgram ou Telnyx Whisper |
| **Idiomas** | 40+ com detecção automática | 40+ com detecção automática |
| **Formato** | Texto com timestamps por trecho | Texto com timestamps por trecho |
| **Speakers** | Diarização (quem falou o quê) | Sem diarização na Fase 1 |
| **Custo** | Incluído no Conversational AI | ~$0.012/min (Deepgram) |

#### Insights (post-call analysis)

Após cada chamada (humana ou IA), geramos automaticamente:

| Insight | Origem | Armazenamento |
|---------|--------|--------------|
| **Resumo executivo** | LLM → transcrição | `chamadas.resumo` |
| **Sentimento geral** | LLM → transcrição | `chamadas.sentimento` |
| **BANT preenchido** | LLM → transcrição | `chamadas.bant_score`, `chamadas.bant_detalhes` |
| **Próximos passos** | LLM → transcrição | `chamadas.proximos_passos` |
| **Duração** | Telnyx/Wavoip | `chamadas.duracao_segundos` |
| **Caixa postal detectada** | Telnyx AMD | `chamadas.voicemail` |
| **Transfer para humano** | Ligação IA | `chamadas.handoff_para` |
| **Objecao principal** | LLM → transcrição | `chamadas.objecao_principal` |

---

### 4.7 Discador Power / Preview

Para equipes de SDR que fazem volume de ligações.

#### Tipos de discador

| Tipo | Como funciona | Quando usar |
|------|--------------|------------|
| **Preview** | SDR vê dados do lead antes de ligar, clica "Discar" manualmente | Atendimento qualificado, 1:1 |
| **Power** | Sistema discavaáriosleads em sequência, mas só conecta quando atende | Volume moderado, SDR disponível |
| **Predictive** | IA calcula quando SDR estará livre e disca antecipadamente | Alto volume, equipe de 5+ SDRs |

**Decisão:** Implementar **Preview Dialer** na Fase 2 e **Power Dialer** na Fase 3. Predictive é complexo demais para o MVP.

#### Preview Dialer — Fluxo

```
1. SDR clica "Iniciar sessão de ligações"
2. Sistema monta lista de leads a ligar (filtro: pipeline, SDR, sem contato há X dias, etc.)
3. SDR vê card do lead: nome, telefone, stage, última interação
4. SDR clica "Discar"
5. Chamada é feita (VOIP ou WA)
6. Ao encerrar, SDR preenche resultado rápido: "Interessado", "Não atendeu", "Caixa postal", "Inadequado"
7. Sistema avança para o próximo lead da lista
8. Repete até fim da lista ou SDR encerrar sessão
```

#### Power Dialer — Fluxo (Fase 3)

```
1. SDR inicia sessão
2. Sistema disca para próximo lead automaticamente
3. Se lead atende → conecta SDR imediatamente
4. Se não atende (voicemail, sem resposta) → marca e avança
5. SDR preenche resultado rápido
6. Sistema já está discando para o próximo
```

---

## 5. Modelo de Dados

```sql
-- =============================
-- Números de telefone do workspace
-- =============================
CREATE TABLE phone_numbers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  numero             TEXT NOT NULL,                  -- ex: '+5511300000000'
  tipo               TEXT NOT NULL,                  -- 'voip_telnyx', 'whatsapp_wavoip'
  provider_id        TEXT,                            -- ID no provedor (Telnyx number id / Wavoip device token)
  nome_exibicao      TEXT,                            -- "Empire Business", "Vendas SP"
  status             TEXT DEFAULT 'active',            -- 'active', 'inactive', 'porting'
  caller_id_name     TEXT,                            -- Nome no identificador de chamadas (STIR/SHAKEN)
  bought_at          TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, numero)
);

-- =============================
-- Registro de todas as chamadas
-- =============================
CREATE TABLE chamadas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  contato_id        UUID REFERENCES contatos(id),
  oportunidade_id   UUID REFERENCES oportunidades(id),
  phone_number_id   UUID REFERENCES phone_numbers(id),
  direcao           TEXT NOT NULL,                    -- 'inbound', 'outbound'
  tipo              TEXT NOT NULL,                    -- 'voip', 'whatsapp'
  modo              TEXT NOT NULL DEFAULT 'humano',   -- 'humano', 'ia', 'humano_ia'
  membro_id         UUID REFERENCES workspace_members(id), -- SDR/Closer que fez/atendeu
  ai_assistant_id   TEXT,                              -- ID do Telnyx AI Assistant (se modo ia)
  phone_from        TEXT NOT NULL,                    -- número de origem
  phone_to          TEXT NOT NULL,                    -- número de destino
  status            TEXT NOT NULL DEFAULT 'initiated', -- 'initiated', 'ringing', 'active', 'ended', 'missed', 'voicemail', 'failed', 'transferred'
  duracao_segundos  INTEGER,
  gravacao_url      TEXT,                              -- URL Supabase Storage
  gravacao_wavoip_id TEXT,                             -- ID da gravação Wavoip (se tipo whatsapp)
  transcrita        BOOLEAN DEFAULT false,
  transcricao       TEXT,                              -- texto completo da transcrição
  transcricao_json  JSONB,                             -- timestamps + speakers
  resumo            TEXT,                              -- resumo gerado por IA
  sentimento        TEXT,                              -- 'positivo', 'neutro', 'negativo', 'misto'
  bant_score        INTEGER,                           -- 15-100 (mesma escala do SDR IA texto)
  bant_detalhes     JSONB,                            -- { budget: true, authority: false, need: true, timeline: '30d' }
  proximos_passos   TEXT,                              -- próximos passos sugeridos pela IA
  objecao_principal TEXT,                              -- 'preço', 'concorrente', 'sem urgência', etc
  voicemail         BOOLEAN DEFAULT false,
  voicemail_texto   TEXT,                              -- transcrição do voicemail (se detectado)
  handoff_de        UUID,                              -- se IA transferiu para humano, referencia a outra chamada
  handoff_para      UUID REFERENCES workspace_members(id), -- se IA transferiu, para qual membro
  wavoip_call_id    TEXT,                              -- ID da chamada no Wavoip (se tipo whatsapp)
  telnyx_call_id    TEXT,                              -- ID da chamada no Telnyx (se tipo voip)
  notas_sdr         TEXT,                              -- nota rápida do SDR após a chamada
  resultado         TEXT,                              -- 'interessado', 'nao_atendeu', 'caixa_postal', 'inadequado', 'reunião_agendada'
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_chamadas_workspace ON chamadas(workspace_id);
CREATE INDEX idx_chamadas_contato ON chamadas(contato_id);
CREATE INDEX idx_chamadas_oportunidade ON chamadas(oportunidade_id);
CREATE INDEX idx_chamadas_membro ON chamadas(membro_id);
CREATE INDEX idx_chamadas_status ON chamadas(status);
CREATE INDEX idx_chamadas_tipo ON chamadas(tipo);
CREATE INDEX idx_chamadas_started_at ON chamadas(started_at);

-- =============================
-- Configuração do agente Voice AI
-- =============================
CREATE TABLE voice_ai_agents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  nome              TEXT NOT NULL,                    -- "SDR IA Vendas"
  descricao         TEXT,
  system_prompt     TEXT NOT NULL,                    -- prompt do agente com variáveis dinâmicas
  idioma_principal  TEXT DEFAULT 'pt-BR',
  modelo_llm        TEXT DEFAULT 'moonshotai/Kimi-K2.5',  -- modelo via OpenRouter ou nativo Telnyx
  voz_tts_provedor  TEXT DEFAULT 'elevenlabs',        -- 'elevenlabs', 'minimax', 'telnyx_hd', 'rime'
  voz_tts_id        TEXT,                              -- ID da voz no provedor (ex: ElevenLabs voice_id)
  voz_tts_nome      TEXT,                              -- nome amigável (ex: "Antônio Profissional")
  velocidade_fala   NUMERIC DEFAULT 1.0,              -- 0.5 a 2.0
  tom               TEXT DEFAULT 'profissional',       -- 'casual', 'profissional', 'empatico'
  deteccao_voicemail BOOLEAN DEFAULT true,
  supressao_ruido   TEXT DEFAULT 'krisp',             -- 'krisp', 'deepfilternet', 'disabled'
  max_tentativas   SMALLINT DEFAULT 3,
  intervalo_tentativas TEXT DEFAULT '2h',              -- '30min', '1h', '2h', '4h'
  horario_inicio   TIME DEFAULT '09:00',
  horario_fim      TIME DEFAULT '18:00',
  dias_semana      SMALLINT[] DEFAULT '{1,2,3,4,5}',  -- 0=Dom, 1=Seg, ..., 6=Sab
  transfer_para_membro UUID REFERENCES workspace_members(id), -- SDR para handoff
  transfer_numero  TEXT,                              -- número direto para transferência
  mensagem_voicemail TEXT,                             -- texto a ser dito em caixa postal
  canal            TEXT DEFAULT 'voip',               -- 'voip', 'whatsapp', 'ambos'
  ativo            BOOLEAN DEFAULT true,
  telnyx_assistant_id TEXT,                           -- ID do assistant no Telnyx (criado auto)
  knowledge_base_ids TEXT[],                           -- IDs das knowledge bases Telnyx
  insights_config  JSONB,                             -- configuração de insights automáticos
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================
-- Dispositivos WhatsApp (Wavoip)
-- =============================
CREATE TABLE whatsapp_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  membro_id        UUID REFERENCES workspace_members(id),
  token            TEXT NOT NULL,                    -- token Wavoip
  phone_number     TEXT,                              -- número conectado (5511999999999)
  display_name     TEXT,                              -- "Vendas SP", "SDR Maria"
  status           TEXT DEFAULT 'close',              -- 'open', 'close', 'connecting', 'hibernating', 'disconnected'
  is_default       BOOLEAN DEFAULT false,
  canal_simultaneo INTEGER DEFAULT 1,                 -- chamadas simultâneas deste dispositivo
  last_connected_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- =============================
-- Sessões de discador
-- =============================
CREATE TABLE dialer_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  membro_id        UUID NOT NULL REFERENCES workspace_members(id),
  tipo              TEXT NOT NULL,                     -- 'voip', 'whatsapp'
  modo              TEXT DEFAULT 'preview',            -- 'preview', 'power', 'predictive'
  lead_ids          UUID[] NOT NULL,                  -- lista ordenada de leads a ligar
  current_index     INTEGER DEFAULT 0,
  total_leads      INTEGER NOT NULL,
  total_atendidas   INTEGER DEFAULT 0,
  total_nao_atendidas INTEGER DEFAULT 0,
  total_voicemail  INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'active',             -- 'active', 'paused', 'completed'
  started_at       TIMESTAMPTZ DEFAULT now(),
  ended_at         TIMESTAMPTZ
);

-- =============================
-- Configurações de Voice AI por workspace
-- =============================
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS voice_enabled BOOLEAN DEFAULT false;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS telnyx_api_key_encrypted TEXT;   -- chave criptografada
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS wavoip_api_key_encrypted TEXT;    -- chave criptografada
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS elevenlabs_api_key_encrypted TEXT; -- chave criptografada
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS telnyx_phone_number TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS telnyx_app_id TEXT;               -- TeXML Application ID
```

---

## 6. Fluxos Detalhados

### 6.1 Fluxo — Ligação VOIP Humana pelo CRM

```
SDR está no lead card de "João Silva"
  → Clica botão "Ligar ☎️"
  → Frontend chama edge function: POST /call-initiate
    { phone: '+5511999999999', type: 'voip', contact_id, opportunity_id }
  → Edge function:
    1. Verifica se workspace tem voice_enabled = true
    2. Busca phone_number Telnyx do workspace
    3. Chama Telnyx Call Control: POST /v2/texml/ai_calls/{app_id}
       { From: workspace.phone_number, To: lead.phone }
    4. Cria registro em chamadas (status: 'initiated')
    5. Retorna call_id para o frontend
  → Frontend abre softphone WebRTC
  → Lead atende → status: 'active'
  → Webhook Telnyx (call.answered) → atualiza chamadas status = 'active'
  → SDR conversa com o lead
  → SDR encerra (ou lead encerra) → webhook (call.hangup) → atualiza chamadas
  → Webhook Telnyx (recording.done) → baixa gravação → salva em Supabase Storage
  → Edge function envia gravação para transcrição:
    - Se configurado: STT Telnyx → transcricao armazenada
    - LLM (OpenRouter) analisa transcricao → gera insights
  → Insights salvos em chamadas
  → SDR recebe notificação: "Chamada com João Silva encerrada. Resumo disponível."
```

### 6.2 Fluxo — Ligação VOIP com IA (SDR IA)

```
Trigger: cadência de follow-up ou manual
  → Edge function: POST /ai-call-initiate
    { contact_id, opportunity_id, agent_id, type: 'voip' }
  → Edge function:
    1. Busca configuração do voice_ai_agents
    2. Verifica se lead já atingiu max_tentativas
    3. Verifica se está dentro do horário de operação
    4. Cria ou reutiliza AI Assistant no Telnyx
    5. Adiciona contexto do lead no system prompt:
       "Você está ligando para {lead.nome}. Ele está no stage {stage}. 
        Último contato: {data}. Seu objetivo é {objetivo}."
    6. Disca: POST /v2/texml/ai_calls/{app_id}
       { From: workspace.phone_number, To: lead.phone, AIAssistantId: agent.telnyx_assistant_id }
    7. Cria registro em chamadas (status: 'initiated', modo: 'ia')
  → AI Assistant inicia ligação
  → Lead atende (ou caixa postal detectada por AMD)
  → Se atendeu:
    - IA conversa com naturalidade (ElevenLabs PT-BR + Kimi-K2.5)
    - Function calls durante conversa (schedule_meeting, transfer_to_human, etc.)
    - Após encerrar: webhook com transcript + insights
    - Edge function salva tudo em chamadas
    - Se agendou reunião → cria em reunioes
    - Se transferiu → cria handoff_de reference
  → Se caixa postal:
    - IA deixa mensagem configurada (TTS)
    - Registra: voicemail = true, resultado = 'caixa_postal'
  → Se não atendeu:
    - Registra: status = 'missed'
    - Agenda próxima tentativa se < max_tentativas
```

### 6.3 Fluxo — Ligação WhatsApp Humana pelo CRM

```
SDR está no lead card
  → Clica botão "Ligar via WhatsApp 📱"
  → Frontend verifica se há dispositivo WhatsApp disponível:
    - Busca whatsapp_devices WHERE membro_id = current_user AND status = 'open'
    - Se nenhum disponível → alerta: "Conecte um dispositivo WhatsApp primeiro"
  → Se disponível:
    - Frontend chama wavoip.startCall({ to: lead.phone, fromTokens: [device.token] })
    - OU abre iframe com Click To Call URL
  → Chamada estabelecida via WhatsApp
  → Wavoip Webphone aparece no CRM (embutido na sidebar)
  → SDR conversa com o lead
  → Ao encerrar:
    - Wavoip webhook (CALL, action: UPDATE, status: 'ENDED') → edge function
    - Edge function cria registro em chamadas
    - Baixa gravação de storage.wavoip.com → Supabase Storage
    - Envia para transcrição e análise de IA (Fase 1: pós-call)
```

### 6.4 Fluxo — Ligação WhatsApp com IA (Fase 2: Audio Bridge)

```
Trigger: cadência de follow-up ou manual
  → Edge function: POST /ai-call-initiate
    { contact_id, opportunity_id, agent_id, type: 'whatsapp' }
  → Edge function:
    1. Busca dispositivo WhatsApp disponível (status = 'open')
    2. Busca configuração do voice_ai_agents WHERE canal IN ('whatsapp', 'ambos')
    3. Verifica horário de operação e limites de tentativas
    4. Inicia chamada via Wavoip API:
       wavoip.startCall({ to: lead.phone, fromTokens: [device.token] })
    5. Quando lead atende → chama freeSWITCH ESL para bridge de áudio:
       - Wavoip SIP trunk → FreeSWITCH → STT → LLM → TTS → FreeSWITCH → Wavoip
    6. Cria registro em chamadas (status: 'active', modo: 'ia', tipo: 'whatsapp')
  → IA conversa com lead em tempo real
  → Se handoff: FreeSWITCH transfere para SDR humano conectado
  → Post-call: gravação + transcrição + insights salvos
```

### 6.5 Fluxo — Receber Ligação Inbound (VOIP)

```
Lead liga para o número do workspace
  → Telnyx recebe chamada inbound
  → Telnyx call control webhook → edge function
  → Edge function:
    1. Busca contato com o número de origem
    2. Se encontrado → notifica SDR responsável
    3. Se não encontrado → toca saudação e pede nome
    4. Roteia para SDR disponível (round-robin)
    5. Se SDR disponível → WebRTC para navegador do SDR
    6. Se SDR não disponível → caixa postal ou IA atende
  → Registro criado em chamadas (direcao: 'inbound')
```

### 6.6 Fluxo — Receber Ligação Inbound (WhatsApp)

```
Lead liga via WhatsApp para o número conectado
  → Wavoip webhook (CALL, action: CREATE, direction: INCOMING) → edge function
  → Edge function:
    1. Busca contato com o número de origem
    2. Notifica SDR responsável (push notification)
    3. SDR aceita ou rejeita via interface Wavoip
  → Se aceitar: chamada estabelecida
  → Registro em chamadas (direcao: 'inbound', tipo: 'whatsapp')
```

---

## 7. Configuração por Workspace

### 7.1 Tela de Configuração

**Configurações → Ligações & Voz**

| Seção | Configuração | Tipo | Padrão |
|-------|-------------|------|--------|
| **Geral** | Ligações habilitadas | Toggle | Off |
| **Geral** | Gravação automática | Toggle | On |
| **Geral** | Transcrição automática | Toggle | On |
| **Geral** | Insights pós-call | Toggle | On |
| **VOIP** | Chave API Telnyx (criptografada) | Password | — |
| **VOIP** | Telefone de origem | Select (números comprados) | — |
| **VOIP** | Nome de exibição (Caller ID) | Text | Nome da empresa |
| **VOIP** | Discador padrão | Select | Preview |
| **WhatsApp** | Tokens Wavoip (criptografado) | List | — |
| **WhatsApp** | Dispositivo padrão | Select | — |
| **Voz IA** | Chave ElevenLabs (criptografada) | Password | — |
| **Voz IA** | Modelo LLM | Select (via OpenRouter) | Kimi-K2.5 |
| **Voz IA** | Voz TTS | Select (ElevenLabs / MiniMax / Telnyx HD) | Antônio (ElevenLabs) |
| **Voz IA** | Velocidade de fala | Slider 0.5x – 2.0x | 1.0x |
| **Voz IA** | Detecção de caixa postal | Toggle | On |
| **Voz IA** | Mensagem de voicemail | Textarea | Customizável |
| **Voz IA** | Horário de operação | Time range | 9h – 18h |
| **Voz IA** | Max tentativas por lead | Number | 3 |
| **Voz IA** | Intervalo entre tentativas | Select | 2h |
| **Voz IA** | System prompt | Textarea | Template SDR IA |
| **Voz IA** | Transferir para humano se pedido | Toggle | On |
| **Voz IA** | Knowledge Base | Upload de PDFs/URLs | — |

---

## 8. Custos Estimados

### Cenário: 100 leads/mês, 5 SDRs, 3 minutos médio por ligação

| Item | Qtd | Custo Unitário | Custo Mensal |
|------|-----|----------------|-------------|
| **VOIP Humano** | | | |
| Telnyx Conversational AI | 300 min | $0.052/min | $15.60 |
| Outbound BR (Telnyx) | 300 min | ~$0.02/min | $6.00 |
| **VOIP IA** | | | |
| Conversational AI (orquestração) | 200 min | $0.05/min | $10.00 |
| Outbound BR | 200 min | $0.02/min | $4.00 |
| TTS ElevenLabs | 200 min | ~$0.04/min | $8.00 |
| LLM (Kimi-K2.5) | ~50 chamadas | ~$0.02/chamada | $1.00 |
| STT (incluído) | — | — | $0 |
| **WhatsApp Humano** | | | |
| Plano Empresarial Wavoip | 10 canais | R$ 600 | R$ 600 |
| **WhatsApp IA (Fase 2)** | | | |
| Wavoip Scale Up | 30 canais | R$ 1.200 | R$ 1.200 |
| VPS FreeSWITCH | 1 | ~$80 | ~$450 |
| Deepgram STT | 150 min | $0.012/min | $1.80 |
| ElevenLabs TTS | 150 min | $0.04/min | $6.00 |
| OpenRouter LLM | ~40 chamadas | $0.02 | $0.80 |
| **Infra Comum** | | | |
| Número Telnyx brasileiro | 1 | $1/mês | ~$6 |
| Supabase Storage (gravações) | ~5 GB | $0.021/GB | ~$0.50 |
| | | **Total estimado (Fase 1):** | **~R$ 800–1.000/mês** |
| | | **Total estimado (Fase 2 + IA WA):** | **~R$ 2.500–3.000/mês** |

---

## 9. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|-------------|---------|-----------|
| **Banimento WhatsApp por ligações a desconhecidos** | Média | Alto | Usar Wavoip apenas para leads que já interagiram; cold calling via VOIP (Telnyx); aquecer leads com mensagem antes de ligar |
| **Latência alta em IA por WhatsApp (audio bridge)** | Média | Médio | Fase 1 não tem latência (pós-call); Fase 2 com FreeSWITCH dedicado; monitorar latência e fallback para humano |
| **Qualidade de voz em PT-BR não natural suficiente** | Baixa | Médio | ElevenLabs tem vozes PT-BR de alta qualidade; testar com amostras reais antes de deploy; opção de clonar voz de SDR real |
| **Downtime Wavoip/Telnyx** | Baixa | Médio | Telnyx: 99.999% uptime; Wavoip: ter número VOIP como fallback; monitorar status dos provedores |
| **Custo de gravação + transcrição escalando** | Média | Baixo | Deepgram é barato ($0.012/min); Telnyx STT incluído; limpeza de gravações > 90 dias |
| **LGPD: gravação sem consentimento** | Médio | Alto | Configurar notificação automática de gravação no início da chamada; armazenar consentimento; lead pode solicitar exclusão |
| **Complexidade do audio bridge para IA no WhatsApp** | Alta | Médio | Implementar em fases; Fase 1 sem IA em tempo real no WA; validar demanda antes de investir em FreeSWITCH |

---

## 10. Tabela de Funcionalidades

### Módulo: Ligações VOIP + WhatsApp

| Funcionalidade | Fase | Prioridade |
|---------------|------|------------|
| **VOIP — Humano** | | |
| Softphone WebRTC no navegador (Telnyx) | 2 | Alta |
| Discagem 1-clique no lead card | 2 | Alta |
| Discador manual (digitar número) | 2 | Alta |
| Gravação automática de chamadas VOIP | 2 | Crítica |
| Registro automático de chamada no CRM | 2 | Crítica |
| Transferência de chamada (warm transfer) | 3 | Média |
| Mute/unmute durante chamada | 2 | Alta |
| Receber chamadas inbound VOIP | 2 | Alta |
| Detecção de caixa postal (AMD) | 2 | Média |
| **VOIP — IA** | | |
| Criação de AI Assistant Telnyx via UI | 2 | Alta |
| Ligação VOIP autônoma por IA (SDR IA por voz) | 2 | Alta |
| Configuração de voz TTS (ElevenLabs/MiniMax) | 2 | Alta |
| Configuração de system prompt com contexto do lead | 2 | Crítica |
| Detecção de caixa postal com mensagem customizada | 2 | Média |
| Handoff IA → humano (transfer SIP) | 3 | Alta |
| Knowledge Base (RAG) para agente de voz | 3 | Média |
| Insights automáticos pós-call (resumo, BANT, sentimento) | 2 | Alta |
| máx tentativas com intervalo configurável | 2 | Média |
| Horário de operação do agente | 2 | Média |
| **WhatsApp — Humano** | | |
| Conexão de dispositivo WhatsApp (QR Code) | 2 | Crítica |
| Discar via WhatsApp 1-clique | 2 | Crítica |
| Webphone Wavoip embutido no CRM | 2 | Alta |
| Gravação automática de chamadas WA | 2 | Crítica |
| Registro automático no CRM (via webhook Wavoip) | 2 | Crítica |
| Receber chamadas inbound via WhatsApp | 2 | Alta |
| Gerenciamento de múltiplos dispositivos | 2 | Média |
| Status do dispositivo em tempo real (conectado/desconectado) | 2 | Média |
| **WhatsApp — IA** | | |
| Transcrição pós-call automática (Fase 1) | 2 | Alta |
| Análise de IA pós-call (resumo, BANT) (Fase 1) | 2 | Alta |
| Audio bridge SIP para IA em tempo real (Fase 2) | 3 | Alta |
| Configuração de agente IA para WhatsApp | 3 | Média |
| Handoff IA → humano no WhatsApp | 3 | Alta |
| **Inbox & Histórico** | | |
| Aba "Chamadas" no inbox unificado | 2 | Alta |
| Player de áudio embutido (ouvir gravação no CRM) | 2 | Alta |
| Transcrição lado a lado com áudio (sync) | 3 | Média |
| Card de insights IA (resumo, sentimento, próximos passos) | 2 | Alta |
| Timeline: chamada aparece junto com mensagens e notas | 2 | Alta |
| Ícones diferenciados por tipo/direção/status | 2 | Média |
| **Discador** | | |
| Preview Dialer (ver lead antes de ligar) | 2 | Alta |
| Sessão de ligações (lista de leads a ligar) | 2 | Alta |
| Resultado rápido pós-call (interessado, não atendeu, etc.) | 2 | Alta |
| Power Dialer (discagem em sequência) | 3 | Média |
| **Configuração** | | |
| Tela de configuração de ligações por workspace | 2 | Crítica |
| Compra de número Telnyx pela UI | 3 | Baixa |
| Conexão de chave ElevenLabs pela UI | 2 | Alta |
| Configuração do agente Voice AI (6 abas) | 2 | Alta |
| Teste de ligação IA (simulador) | 2 | Média |
| **LGPD & Compliance** | | |
| Notificação automática de gravação no início da chamada | 2 | Crítica |
| Opt-out de gravação (lead pode solicitar) | 2 | Alta |
| Exclusão de gravação (direito ao esquecimento) | 2 | Alta |
| Log de consentimento de gravação | 2 | Média |

---

## Apêndice A — Comparação de Provedores Considerados

### VOIP / Voice AI

| Critério | Telnyx | Twilio | Vapi | Retell |
|----------|--------|--------|------|--------|
| Infraestrutura própria (rede) | ✅ Sim — rede global de fibra | ❌ Alugada | ❌ Alugada | ❌ Alugada |
| GPUs em PoPs de borda | ✅ Sim — <200ms latência | ❌ Não | ❌ Não | ❌ Não |
| Voice AI nativo (STT+LLM+TTS) | ✅ Sim — stack completa | ❌ Não (precisa montar) | ✅ Sim | ✅ Sim |
| TTS Router (múltiplos provedores) | ✅ 7+ provedores | ❌ Não | ❌ Não | ❌ Não |
| STIR/SHAKEN (entregabilidade) | ✅ Nível A | ❌ Não | N/A | N/A |
| Voicemail detection (AMD) | ✅ Premium | ✅ Básico | ❌ Não nativo | ✅ |
| SIP Trunking | ✅ Completo | ✅ Completo | N/A | N/A |
| WebRTC SDK | ✅ | ✅ | ❌ | ❌ |
| Latência E2E | <200ms | ~500ms | ~500ms | ~300ms |
| Preço (Conversational AI/min) | $0.05 | N/A | $0.05 | $0.05 |
| **Decisão** | **✅ Escolhido** | — | — | — |

### Ligações WhatsApp

| Critério | Wavoip | Alternativa DIY (Baileys) |
|----------|--------|---------------------------|
| Estabilidade | ✅ Empresa estabelecida, 15k+ números | ⚠️ Instável, quebra com updates |
| API pronta | ✅ WebSocket + Click To Call + SIP | ❌ Precisa construir tudo |
| Gravação | ✅ Automática, storage ilimitado | ❌ Precisa implementar |
| Suporte | ✅ Time brasileiro, WhatsApp direto | ❌ Comunidade open-source |
| Risco de banimento | ⚠️ Médio (mesmo com boas práticas) | 🔴 Alto |
| Preço | ✅ R$99–1.200/mês | ✅ Gratuito (mas custo de infra) |
| SIP integration | ✅ Completdo | ❌ Precisa implementar |
| **Decisão** | **✅ Escolhido** | — |

---

---

## Apêndice B — Guia Prático de Implementação: WavoIP + Soniox

> Este apêndice é o **manual de implementação** do zero ao produção. Contém código de referência, fluxos detalhados, armadilhas comuns e checklist completo. Use junto com as seções 4.3, 4.6 e 5 do corpo principal.

---

### B1. Visão Geral da Arquitetura de Implementação

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │     │   Supabase   │     │   WavoIP     │
│   (React)    │     │   (Backend)  │     │   (VoIP)     │
└──────┬──────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │  get-wavoip-token │                    │
       │──────────────────► │  Busca token       │
       │◄────────────────── │◄────────────────── │
       │                    │                    │
       │  Iniciar ligação   │                    │
       │────────────────────────────────────────► │
       │                    │                    │
       │  Eventos da ligação │                   │
       │◄──────────────────────────────────────── │
       │  (aceita, rejeitada, encerrada, etc.)   │
       │                    │                    │
       │  Salvar dados da ligação                │
       │──────────────────►│                    │
       │                    │                    │
       │                    │     ┌──────────────┐
       │                    │     │   Soniox      │
       │                    │     │ (Transcrição)│
       │                    │     └──────┬───────┘
       │                    │            │
       │  get-soniox-token  │            │
       │──────────────────►│            │
       │◄────────────────── │            │
       │                    │            │
       │  Stream de áudio ──────────────►│
       │                    │            │
       │  Transcrição em tempo real     │
       │◄────────────────────────────── │
       │                    │            │
       │  Salvar transcrição            │
       │──────────────────►│            │
       │                    │            │
       │  Análise IA (analyze-sales-call)│
       │──────────────────►│            │
```

---

### B2. WavoIP — Configuração e Conexão

#### Configuração Inicial

1. Criar conta em https://wavoip.com
2. Obter o Token de API no painel
3. Salvar o token no CRM (Settings > Integrações > WavoIP)

#### Armazenamento do Token — Padrão DB-First

Sempre usar `integration_keys` como fonte primária, com fallback para env vars:

```typescript
// Tabela integration_keys
// service: 'wavoip', key_name: 'token', key_value: 'seu-token-aqui'
```

Edge Function de proxy (segurança — nunca expor token no frontend):

```typescript
// supabase/functions/get-wavoip-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getIntegrationKey } from '../_shared/get-integration-key.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const token = await getIntegrationKey('wavoip', 'token', 'WAVOIP_TOKEN')

    return new Response(JSON.stringify({ token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

**Segurança:** Para produção, usar `verify_jwt = true` e verificar se o usuário está autenticado antes de retornar o token.

---

### B3. Duas Formas de Fazer Ligação

#### Abordagem 1: SDK Completo (Controle Total)

Use quando precisa de controle total da ligação dentro do app: mutar, desligar, cronômetro, eventos detalhados.

```typescript
import { Wavoip } from '@wavoip/wavoip-api'
import { useEffect, useRef, useState } from 'react'

interface CallState {
  status: 'idle' | 'connecting' | 'ringing' | 'active' | 'ended' | 'error'
  duration: number
  isMuted: boolean
}

export function useWavoip() {
  const wavoipRef = useRef<Wavoip | null>(null)
  const activeCallRef = useRef<any>(null)
  const [devices, setDevices] = useState<any[]>([])
  const [callState, setCallState] = useState<CallState>({
    status: 'idle', duration: 0, isMuted: false
  })
  const [isCalling, setIsCalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const durationIntervalRef = useRef<number | null>(null)

  const initWavoip = async () => {
    try {
      const { data } = await supabase.functions.invoke('get-wavoip-token')
      const token = data.token

      const wavoip = new Wavoip({ tokens: [token] })
      wavoipRef.current = wavoip
      setDevices(wavoip.devices || [])

      return wavoip
    } catch (err) {
      setError(err.message)
      return null
    }
  }

  const startCall = async (phone: string) => {
    setIsCalling(true)
    setError(null)
    setCallState({ status: 'connecting', duration: 0, isMuted: false })

    try {
      const wavoip = wavoipRef.current || await initWavoip()
      if (!wavoip) throw new Error('Falha ao inicializar WavoIP')

      // Permissão de microfone
      const micPermission = await navigator.mediaDevices.getUserMedia({ audio: true })
      micPermission.getTracks().forEach(t => t.stop())

      // Verificar dispositivos
      if (wavoip.devices && wavoip.devices.length > 0) {
        const device = wavoip.devices[0]

        if (device.status === 'hibernating') {
          await device.wakeUp()
        }

        if (device.status === 'close') {
          throw new Error('Dispositivo WavoIP offline. Reconecte.')
        }
      }

      const formattedPhone = formatPhoneForWavoip(phone)

      const { call, err: callErr } = await wavoip.startCall({ to: formattedPhone })

      if (callErr || !call) {
        throw new Error(callErr?.message || 'Erro ao iniciar ligação')
      }

      call.onPeerAccept((activeCall) => {
        setCallState(prev => ({ ...prev, status: 'active' }))
        activeCallRef.current = activeCall

        durationIntervalRef.current = window.setInterval(() => {
          setCallState(prev => ({ ...prev, duration: prev.duration + 1 }))
        }, 1000)
      })

      call.onPeerReject(() => {
        setCallState({ status: 'ended', duration: 0, isMuted: false })
        cleanup()
      })

      call.onUnanswered(() => {
        setCallState({ status: 'ended', duration: 0, isMuted: false })
        cleanup()
      })

      call.onEnd(() => {
        setCallState(prev => ({ ...prev, status: 'ended' }))
        cleanup()
      })

      call.onError((callError) => {
        setError(callError.message || 'Erro na ligação')
        setCallState({ status: 'error', duration: 0, isMuted: false })
        cleanup()
      })

      setCallState(prev => ({ ...prev, status: 'ringing' }))
    } catch (err: any) {
      setError(err.message || 'Erro ao fazer ligação')
      setCallState({ status: 'error', duration: 0, isMuted: false })
      setIsCalling(false)
    }
  }

  const toggleMute = async () => {
    if (!activeCallRef.current) return
    try {
      if (callState.isMuted) {
        await activeCallRef.current.unmute()
      } else {
        await activeCallRef.current.mute()
      }
      setCallState(prev => ({ ...prev, isMuted: !prev.isMuted }))
    } catch (err) {
      console.error('Erro ao mutar/desmutar:', err)
    }
  }

  const endCall = async () => {
    if (activeCallRef.current) {
      await activeCallRef.current.end()
    }
    setCallState(prev => ({ ...prev, status: 'ended' }))
    cleanup()
  }

  const cleanup = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    activeCallRef.current = null
    setIsCalling(false)
  }

  return { startCall, endCall, toggleMute, callState, isCalling, error, devices }
}
```

#### Abordagem 2: Click2Call (Simples e Rápido)

Use quando só precisa que a ligação aconteça, sem controle detalhado dentro do app.

```typescript
import { useState } from 'react'

export function useClick2Call() {
  const [isCalling, setIsCalling] = useState(false)

  const makeCall = async (phone: string, name?: string) => {
    setIsCalling(true)
    try {
      const { data } = await supabase.functions.invoke('get-wavoip-token')
      const token = data.token

      // IMPORTANTE: Abrir popup ANTES de redirecionar
      // Navegadores bloqueiam popups async, só permitem sincronamente
      const popup = window.open('', 'wavoip-call', 'width=400,height=600')

      if (!popup) {
        toast.error('Permita popups para este site para fazer ligações.')
        setIsCalling(false)
        return
      }

      const e164Phone = formatPhoneForE164(phone)

      const url = new URL('https://app.wavoip.com/call')
      url.searchParams.set('token', token)
      url.searchParams.set('phone', e164Phone)
      url.searchParams.set('start_if_ready', 'true')
      url.searchParams.set('available_after_call', 'false')
      url.searchParams.set('close_after_call', 'true')
      if (name) url.searchParams.set('name', name)

      popup.location.href = url.toString()

      toast.success(`Ligando para ${name || phone}...`)

      setTimeout(() => {
        try {
          if (popup && !popup.closed) {
            try {
              const popupUrl = popup.location.href
              if (!popupUrl.includes('wavoip.com')) {
                popup.close()
              }
            } catch {
              // Cross-origin — normal
            }
          }
        } catch {
          // Popup já fechou
        }
      }, 30000)

    } catch (error: any) {
      toast.error(`Erro ao fazer ligação: ${error.message}`)
      if (popup && !popup.closed) popup.close()
    } finally {
      setIsCalling(false)
    }
  }

  return { makeCall, isCalling }
}
```

#### Quando Usar Cada Abordagem

| Critério | SDK Completo | Click2Call |
|----------|-------------|------------|
| **Complexidade** | Alta | Baixa |
| **Controle da ligação** | Total (mutar, desligar, eventos) | Nenhum |
| **Cronômetro** | Sim | Não |
| **Integração no app** | Sim (dentro da interface) | Não (popup separado) |
| **Experiência do usuário** | Mais fluida | Mais simples |
| **Recomendação** | SDR que faz ligações dentro do CRM | Botão rápido de ligação |

---

### B4. Formatação de Telefone — O Maior Ponto de Dor

Números de telefone vêm de fontes diferentes em formatos diferentes. É preciso normalizar **antes** de enviar para o WavoIP.

#### Formato E.164

O WavoIP espera números no formato **E.164**: `+[código do país][número]`

Exemplos:
- Brasil: `5511999999999`
- Angola: `244923456789`
- EUA: `12125551234`

> **Nota:** O SDK WavoIP aceita sem o `+` prefixo. O Click2Call URL também funciona sem o `+`.

#### Funções de Formatação

```typescript
/**
 * Formata telefone para o formato que o WavoIP SDK aceita.
 * Remove tudo que não é dígito e adiciona código do país se necessário.
 */
function formatPhoneForWavoip(phone: string): string {
  let digits = phone.replace(/\D/g, '')

  // Se tem 9 dígitos ou menos, assumir Angola (+244)
  if (digits.length <= 9) {
    digits = '244' + digits
  }

  // Se tem 10 ou 11 dígitos sem código do país, assumir Brasil (+55)
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith('55')) {
      digits = '55' + digits
    }
  }

  return digits
}

/**
 * Formata telefone para E.164 (usado pelo Click2Call).
 * O formato E.164 é: +[country][number]
 */
function formatPhoneForE164(phone: string): string {
  let digits = phone.replace(/\D/g, '')

  digits = digits.replace(/^0+/, '')

  // Brasil: 10 ou 11 dígitos (com DDD, sem 55)
  if (digits.length === 10 || digits.length === 11) {
    if (!digits.startsWith('55')) {
      digits = '55' + digits
    }
  }

  // Angola: 9 dígitos (sem 244)
  if (digits.length === 9 && !digits.startsWith('244')) {
    digits = '244' + digits
  }

  return digits
}
```

#### Tabela de Formatos Comuns

| Entrada | Formato WavoIP | Formato E.164 | País |
|---------|----------------|---------------|------|
| `(11) 99999-9999` | `5511999999999` | `5511999999999` | Brasil |
| `+55 11 99999 9999` | `5511999999999` | `5511999999999` | Brasil |
| `923456789` | `244923456789` | `244923456789` | Angola |
| `+244 923 456 789` | `244923456789` | `244923456789` | Angola |
| `(212) 555-1234` | `12125551234` | `12125551234` | EUA |

---

### B5. Componentes de Interface — Call Button

#### CallButton Completo (SDK)

```tsx
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from 'lucide-react'

interface CallButtonProps {
  phone: string
  name?: string
  variant?: 'icon' | 'full'
  onCallStart?: () => void
  onCallEnd?: (duration: number) => void
}

export function CallButton({ phone, name, variant = 'icon', onCallStart, onCallEnd }: CallButtonProps) {
  const { startCall, endCall, toggleMute, callState, isCalling, error } = useWavoip()

  const handleCall = async () => {
    if (callState.status === 'idle') {
      await startCall(phone)
      onCallStart?.()
    } else if (callState.status === 'active') {
      onCallEnd?.(callState.duration)
      await endCall()
    }
  }

  const getIcon = () => {
    switch (callState.status) {
      case 'connecting':
      case 'ringing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'active':
        return <PhoneOff className="h-4 w-4" />
      default:
        return <Phone className="h-4 w-4" />
    }
  }

  const getLabel = () => {
    switch (callState.status) {
      case 'connecting':
        return 'Conectando...'
      case 'ringing':
        return 'Chamando...'
      case 'active': {
        const mins = Math.floor(callState.duration / 60)
        const secs = callState.duration % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      }
      case 'ended':
        return 'Ligar'
      case 'error':
        return 'Erro — Tentar novamente'
      default:
        return 'Ligar'
    }
  }

  if (variant === 'icon') {
    return (
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant={callState.status === 'active' ? 'destructive' : 'default'}
          onClick={handleCall}
          disabled={isCalling && callState.status === 'connecting'}
          className={cn(
            'transition-all',
            callState.status === 'active' && 'animate-pulse'
          )}
        >
          {getIcon()}
        </Button>
        {callState.status === 'active' && (
          <Button size="icon" variant="outline" onClick={toggleMute}>
            {callState.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={callState.status === 'active' ? 'destructive' : 'default'}
        onClick={handleCall}
        disabled={isCalling && callState.status === 'connecting'}
        className={cn(
          'transition-all',
          callState.status === 'active' && 'animate-pulse'
        )}
      >
        {getIcon()}
        <span className="ml-2">{getLabel()}</span>
      </Button>
      {callState.status === 'active' && (
        <Button variant="outline" size="icon" onClick={toggleMute}>
          {callState.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </Button>
      )}
      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
    </div>
  )
}
```

#### Click2CallButton (Popup)

```tsx
export function Click2CallButton({ phone, name }: { phone: string; name?: string }) {
  const { makeCall, isCalling } = useClick2Call()

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => makeCall(phone, name)}
      disabled={isCalling}
    >
      {isCalling ? (
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
      ) : (
        <Phone className="h-4 w-4 mr-2" />
      )}
      {isCalling ? 'Abrindo...' : 'Ligar'}
    </Button>
  )
}
```

---

### B6. Transcrição de Chamadas com Soniox

> **Nota:** O PRD principal menciona Telnyx Whisper (incluído no Conversational AI) e Deepgram como provedores de STT. O Soniox é uma **terceira opção** especializada em transcrição dual-channel em tempo real, ideal para chamadas manuais onde o áudio capturado pelo navegador precisa de diarização (quem falou o quê).

#### O que é o Soniox

Serviço de transcrição de áudio em tempo real. Converte fala em texto durante a ligação, permitindo:
- Análise instantânea da conversa
- Registro completo do que foi dito
- Identificação de quem está falando (local/remoto)
- Dados para IA analisar e gerar insights

#### Configuração

1. Criar conta em https://soniox.com
2. Obter API Key no painel
3. Salvar no CRM (Settings > Integrações > Soniox)

#### Edge Function de Proxy

```typescript
// supabase/functions/get-soniox-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getIntegrationKey } from '../_shared/get-integration-key.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = await getIntegrationKey('soniox', 'api_key', 'SONIOX_API_KEY')

    return new Response(JSON.stringify({ api_key: apiKey }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

#### Hook de Transcrição Completo

```typescript
import { useState, useRef, useCallback } from 'react'

interface TranscriptionSegment {
  id: string
  text: string
  speaker: 'local' | 'remote'
  timestamp: number
  confidence: number
}

interface MeetingTranscription {
  isRecording: boolean
  isPaused: boolean
  transcriptions: TranscriptionSegment[]
  duration: number
  error: string | null
  startRecording: (leadId: string, sellerId: string) => Promise<string | null>
  stopRecording: () => Promise<void>
  pauseRecording: () => void
  resumeRecording: () => void
}

export function useMeetingTranscription(): MeetingTranscription {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [transcriptions, setTranscriptions] = useState<TranscriptionSegment[]>([])
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const meetingIdRef = useRef<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const durationIntervalRef = useRef<number | null>(null)
  const sonioxWsRef = useRef<WebSocket | null>(null)

  const startRecording = useCallback(async (leadId: string, sellerId: string) => {
    try {
      setError(null)
      setTranscriptions([])
      setDuration(0)

      // 1. Obter API key do Soniox
      const { data: sonioxData } = await supabase.functions.invoke('get-soniox-token')
      const apiKey = sonioxData.api_key

      // 2. Criar registro da reunião no banco
      const { data: meeting } = await supabase.from('lead_meetings').insert({
        lead_id: leadId,
        seller_id: sellerId,
        status: 'active',
        started_at: new Date().toISOString(),
      }).select().single()

      if (!meeting) throw new Error('Erro ao criar reunião')
      meetingIdRef.current = meeting.id

      // 3. Capturar áudio do microfone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      })
      streamRef.current = stream

      // 4. Conectar ao Soniox via WebSocket
      const ws = new WebSocket(`wss://api.soniox.com/listen?api_key=${apiKey}`)
      sonioxWsRef.current = ws

      ws.onopen = () => {
        console.log('Conectado ao Soniox')
      }

      ws.onmessage = (event) => {
        const result = JSON.parse(event.data)

        if (result.segments) {
          const newSegments: TranscriptionSegment[] = result.segments.map((seg: any) => ({
            id: `${meeting.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: seg.text,
            speaker: seg.speaker === 'local' ? 'local' : 'remote',
            timestamp: Date.now(),
            confidence: seg.confidence || 0.95,
          }))

          setTranscriptions(prev => [...prev, ...newSegments])
        }
      }

      ws.onerror = () => {
        setError('Erro na transcrição. Verifique sua API key.')
      }

      // 5. Enviar stream de áudio para o Soniox
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN && !isPaused) {
          const data = e.inputBuffer.getChannelData(0)
          ws.send(data.buffer)
        }
      }

      source.connect(processor)
      processor.connect(audioContext.destination)

      // 6. Iniciar cronômetro
      durationIntervalRef.current = window.setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)

      setIsRecording(true)
      return meeting.id

    } catch (err: any) {
      setError(err.message || 'Erro ao iniciar gravação')
      stopRecording()
      return null
    }
  }, [])

  const stopRecording = useCallback(async () => {
    try {
      streamRef.current?.getTracks().forEach(track => track.stop())
      streamRef.current = null

      sonioxWsRef.current?.close()
      sonioxWsRef.current = null

      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
        durationIntervalRef.current = null
      }

      // Salvar transcrição + disparar análise IA
      if (meetingIdRef.current) {
        await supabase.from('lead_meetings').update({
          status: 'completed',
          transcription: transcriptions,
          duration_seconds: duration,
          ended_at: new Date().toISOString(),
        }).eq('id', meetingIdRef.current)

        await supabase.functions.invoke('analyze-sales-call', {
          body: { meeting_id: meetingIdRef.current },
        })

        meetingIdRef.current = null
      }

    } catch (err) {
      console.error('Erro ao parar gravação:', err)
    } finally {
      setIsRecording(false)
      setIsPaused(false)
    }
  }, [transcriptions, duration])

  const pauseRecording = useCallback(() => { setIsPaused(true) }, [])
  const resumeRecording = useCallback(() => { setIsPaused(false) }, [])

  return {
    isRecording, isPaused, transcriptions, duration, error,
    startRecording, stopRecording, pauseRecording, resumeRecording,
  }
}
```

#### Componente de Interface da Transcrição

```tsx
export function MeetingTranscriptionModal({ leadId, sellerId, open, onClose }) {
  const {
    isRecording, isPaused, transcriptions, duration, error,
    startRecording, stopRecording, pauseRecording, resumeRecording
  } = useMeetingTranscription()

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Gravar Reunião</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Controles */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <Button onClick={() => startRecording(leadId, sellerId)}>
                  <Mic className="h-4 w-4 mr-2" />
                  Iniciar Gravação
                </Button>
              ) : (
                <>
                  <Button variant="destructive" onClick={stopRecording}>
                    <Square className="h-4 w-4 mr-2" />
                    Parar
                  </Button>
                  <Button variant="outline" onClick={isPaused ? resumeRecording : pauseRecording}>
                    {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
                    {isPaused ? 'Retomar' : 'Pausar'}
                  </Button>
                </>
              )}
            </div>

            {isRecording && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  'h-3 w-3 rounded-full animate-pulse',
                  isPaused ? 'bg-yellow-500' : 'bg-red-500'
                )} />
                <span className="text-sm font-mono">{formatDuration(duration)}</span>
              </div>
            )}
          </div>

          {/* Transcrição em tempo real */}
          <div className="border rounded-lg p-4 h-64 overflow-y-auto space-y-2">
            {transcriptions.length === 0 && !isRecording && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Clique em "Iniciar Gravação" para começar a transcrever a reunião.
              </p>
            )}

            {transcriptions.map((seg) => (
              <div key={seg.id} className={cn(
                'text-sm p-2 rounded',
                seg.speaker === 'local' ? 'bg-blue-50 ml-8' : 'bg-gray-50 mr-8'
              )}>
                <span className={cn(
                  'text-xs font-semibold',
                  seg.speaker === 'local' ? 'text-blue-600' : 'text-gray-600'
                )}>
                  {seg.speaker === 'local' ? 'Você' : 'Lead'}:
                </span>
                {' '}{seg.text}
              </div>
            ))}

            {isRecording && (
              <div className="text-sm text-muted-foreground animate-pulse">
                {isPaused ? 'Pausado...' : 'Ouvindo...'}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

---

### B7. Salvando Dados da Ligação no Banco

> **Nota:** A tabela `lead_meetings` abaixo é complementar à tabela `chamadas` definida na seção 5 do corpo principal. `chamadas` é a tabela canônica para todas as chamadas (VOIP + WhatsApp). `lead_meetings` pode ser usada para reuniões com vídeo/transcrição ou como alias. Em produção, unificar as duas.

```sql
CREATE TABLE lead_meetings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    seller_id uuid REFERENCES profiles(id),

    status text NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'completed', 'cancelled', 'no_show')),

    duration_seconds integer,
    recording_url text,

    -- Transcrição
    transcription jsonb,
    transcription_summary text,
    ai_analysis jsonb,

    -- Google Meet (opcional)
    meet_link text,
    meet_id text,

    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_meetings_lead ON lead_meetings(lead_id);
CREATE INDEX idx_lead_meetings_seller ON lead_meetings(seller_id);
CREATE INDEX idx_lead_meetings_status ON lead_meetings(status);
```

#### Campo `ai_analysis` (preenchido pela Edge Function `analyze-sales-call`)

```json
{
  "summary": "Resumo da conversa...",
  "key_points": ["Ponto 1", "Ponto 2", "Ponto 3"],
  "objections": ["Objeção 1", "Objeção 2"],
  "next_steps": ["Próximo passo 1", "Próximo passo 2"],
  "sentiment": "positive|neutral|negative",
  "talk_ratio": { "seller": 45, "lead": 55 },
  "questions_asked": 8,
  "budget_mentioned": true,
  "decision_maker": true,
  "timeline": "Q2 2025",
  "score": 75
}
```

---

### B8. Análise IA da Ligação

#### Fluxo Completo

```
1. Ligação encerrada → stopRecording()
2. Transcrição salva no banco (lead_meetings.transcription)
3. Dispara edge function: analyze-sales-call
4. A função obtém a transcrição e envia para a OpenAI
5. OpenAI analisa: resumo, pontos-chave, objeções, próximos passos, sentimento
6. Resultado salvo em lead_meetings.ai_analysis
7. Frontend exibe a análise no painel do lead
```

#### Edge Function `analyze-sales-call`

> **Nota:** Seguindo o Princípio 9 do PRD, esta function usa OpenAI diretamente como exemplo simples. Em produção, preferir OpenRouter como gateway.

```typescript
// supabase/functions/analyze-sales-call/index.ts

serve(async (req) => {
  const { meeting_id } = await req.json()

  const { data: meeting } = await supabase
    .from('lead_meetings')
    .select('*, leads(*)')
    .eq('id', meeting_id)
    .single()

  if (!meeting?.transcription) {
    return new Response(JSON.stringify({ error: 'Sem transcrição' }), { status: 400 })
  }

  const transcriptText = meeting.transcription
    .map(seg => `${seg.speaker === 'local' ? 'Vendedor' : 'Lead'}: ${seg.text}`)
    .join('\n')

  // Em produção, usar OpenRouter como gateway (Princípio 9)
  const apiKey = await getIntegrationKeyWithClient(supabase, 'openai', 'api_key', 'OPENAI_API_KEY')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um analista de vendas. Analise a transcrição da ligação e retorne um JSON com:
- summary: resumo em 2-3 frases
- key_points: lista de pontos-chave
- objections: objeções levantadas pelo lead
- next_steps: próximos passos recomendados
- sentiment: positive/neutral/negative
- talk_ratio: { seller: X, lead: Y } (porcentagem aproximada)
- questions_asked: número de perguntas feitas pelo vendedor
- budget_mentioned: true/false
- decision_maker: true/false
- timeline: prazo mencionado ou null
- score: número de 0-100 representando qualidade da ligação

Responda APENAS com JSON válido.`
        },
        { role: 'user', content: `Transcrição da ligação:\n\n${transcriptText}` }
      ],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  })

  const aiResult = await response.json()
  const analysis = JSON.parse(aiResult.choices[0].message.content)

  await supabase.from('lead_meetings').update({
    ai_analysis: analysis,
    transcription_summary: analysis.summary,
  }).eq('id', meeting_id)

  return new Response(JSON.stringify({ success: true, analysis }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
```

---

### B9. Integração com o SDR IA

Quando o agente agenda uma reunião, a ligação pode ser registrada como parte do funil:

```
1. Agente qualifica o lead via WhatsApp
2. Agente usa schedule_meeting para agendar
3. Vendedor faz a ligação usando CallButton ou Click2Call
4. Vendedor abre MeetingTranscriptionModal para gravar
5. Ao encerrar, transcrição é salva automaticamente
6. IA analisa a ligação e gera insights
7. Insights aparecem no painel do lead
8. Lead avança no funil
```

---

### B10. Erros Comuns e Como Evitar

#### 1. Permissão de Microfone Negada

O navegador bloqueia o acesso ao microfone. **Sempre pedir permissão explicitamente ANTES de iniciar a ligação:**

```typescript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach(t => t.stop())
} catch (err) {
  toast.error('Permita o acesso ao microfone para fazer ligações.')
  return
}
```

#### 2. Popup Bloqueado (Click2Call)

Navegadores bloqueiam popups que não são resultado direto de um clique. **Abrir popup ANTES de qualquer chamada async:**

```typescript
// ERRADO — popup bloqueado
const { data } = await supabase.functions.invoke('get-wavoip-token')
const popup = window.open(url) // BLOQUEADO!

// CERTO — abrir popup primeiro
const popup = window.open('', 'wavoip-call', 'width=400,height=600')
const { data } = await supabase.functions.invoke('get-wavoip-token')
popup.location.href = url // Não bloqueado
```

#### 3. Token Expirado

O token WavoIP expira após algumas horas. **Sempre buscar o token fresco antes de cada ligação**, não cachear por mais de 1 hora:

```typescript
let cachedToken: { token: string; expiresAt: number } | null = null

async function getWavoipToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token
  }

  const { data } = await supabase.functions.invoke('get-wavoip-token')
  cachedToken = { token: data.token, expiresAt: Date.now() + 30 * 60 * 1000 }
  return data.token
}
```

#### 4. Dispositivo WavoIP Hibernando

O dispositivo entra em modo hibernação quando não está em uso. **Verificar e acordar antes de ligar:**

```typescript
if (device.status === 'hibernating') {
  toast.info('Acordando dispositivo...')
  await device.wakeUp()
  await new Promise(resolve => setTimeout(resolve, 3000))
}
```

#### 5. Formato de Telefone Incorreto

Telefone sem código do país causa erro no WavoIP. **Sempre normalizar com `formatPhoneForWavoip` ou `formatPhoneForE164`.**

#### 6. Transcrição com Áudio Ruim

Qualidade do microfone afeta diretamente a transcrição. **Configurar echo cancellation, noise suppression e auto gain:**

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  }
})
```

#### 7. Reunião Encerrada sem Salvar

Usuário fecha a aba e a transcrição se perde. **Salvar transcrições incrementalmente a cada 30 segundos:**

```typescript
useEffect(() => {
  if (!isRecording || !meetingIdRef.current) return

  const interval = setInterval(async () => {
    await supabase.from('lead_meetings').update({
      transcription: transcriptions,
      duration_seconds: duration,
    }).eq('id', meetingIdRef.current)
  }, 30000)

  return () => clearInterval(interval)
}, [isRecording, transcriptions, duration])
```

---

### B11. Checklist de Implementação

#### Banco de Dados
- [ ] Criar tabela `lead_meetings` com campos de transcrição e análise IA
- [ ] Criar tabela `user_availability` para horários de vendedores
- [ ] Criar tabela `lead_tasks` para reuniões agendadas
- [ ] Criar tabela `integration_keys` para armazenar tokens (WavoIP, Soniox)
- [ ] Configurar RLS (cada vendedor só vê suas reuniões)

#### Edge Functions
- [ ] `get-wavoip-token` — Proxy do token WavoIP (verify_jwt: true)
- [ ] `get-soniox-token` — Proxy da API key Soniox (verify_jwt: true)
- [ ] `analyze-sales-call` — Análise IA da ligação (verify_jwt: true)
- [ ] `create-meet-interview` — Criar Google Meet (verify_jwt: true, opcional)

#### Frontend — Hooks
- [ ] `useWavoip()` — SDK completo de VoIP (startCall, endCall, mute, unmute, eventos)
- [ ] `useClick2Call()` — Ligação via popup (simples)
- [ ] `useMeetingTranscription()` — Gravação e transcrição (start, stop, pause, resume)
- [ ] `formatPhoneForWavoip()` — Normalização de telefone para SDK
- [ ] `formatPhoneForE164()` — Normalização para Click2Call

#### Frontend — Componentes
- [ ] `CallButton.tsx` — Botão de ligação com SDK (ícone + estado + mutar)
- [ ] `Click2CallButton.tsx` — Botão de ligação via popup (simples)
- [ ] `MeetingTranscriptionModal.tsx` — Modal de gravação com transcrição em tempo real
- [ ] `CallAnalysisCard.tsx` — Card que exibe análise IA após a ligação

#### Fluxos Críticos
- [ ] Pedir permissão de microfone antes de ligar
- [ ] Normalizar telefone antes de enviar para WavoIP
- [ ] Verificar/acordar dispositivo hibernando antes de ligar
- [ ] Salvar transcrição incrementalmente (não perder dados ao fechar aba)
- [ ] Disparar análise IA após encerrar a reunião
- [ ] Tratar erros de permissão, dispositivo offline e token expirado
- [ ] Mostrar cronômetro durante a ligação
- [ ] Mostrar estado da ligação (conectando, chamando, ativa, encerrada)

---

### B12. Os 5 Pilares Que Mais Fazem Diferença em Ligações

1. **Formatação de telefone** — Sem normalização E.164, metade das ligações não conecta

2. **Permissão de microfone** — Sem pedir explicitamente, o usuário fica sem áudio e sem entender por quê

3. **Popup vs SDK** — Click2Call para simplicidade, SDK para controle. Não tente fazer os dois ao mesmo tempo

4. **Transcrição incremental** — Se o usuário fechar a aba, a transcrição não pode se perder. Salve a cada 30 segundos

5. **Análise pós-ligação** — A transcrição sozinha não serve pra nada sem IA que transforme em insights acionáveis

---

*Documento criado em Abril/2026 — Empire Business*
*Complementa os documentos 01–20 do PRD do Empire CRM*