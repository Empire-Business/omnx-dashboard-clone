// Edge Function: sync-ghl-conversations
// Sincroniza mensagens (WhatsApp, SMS, Email, Ligações) da API GHL para comunicacoes
//
// Modos:
//   incremental (padrão): busca conversas com mensagens novas desde o último sync
//   full_backfill: processa todas as conversas, paginado (100 por chamada) — DEPRECATED (paginação GHL quebrada)
//   backfill_by_contact: itera pela tabela contatos usando contactId param — modo correto para backfill completo
//
// Body (POST):
//   { mode?: 'incremental' | 'full_backfill' | 'backfill_by_contact', page?: number, offset?: number, batch_size?: number, contactId?: string, daysBack?: number }
//
// Tenant (Fase 2 — obrigatório, um dos dois):
//   workspace_id?: string  → resolve credencial GHL direto (sem RPC) — preferencial
//   location_id?:  string  → location_id -> workspace via RPC get_workspace_id_by_ghl_location_id -> credencial
//   A chave GHL é resolvida UMA VEZ por chamada (1 workspace por chamada) e propagada a todos os fetchs.
//
// Exemplo backfill_by_contact:
//   POST { mode: 'backfill_by_contact', offset: 0, batch_size: 20 }   → processa primeiros 20 contatos
//   POST { mode: 'backfill_by_contact', offset: 20, batch_size: 20 }  → próximos 20 ... e assim por diante
//   Resposta: { has_more: true, next_offset: 40, total_contacts: 1500, ... }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts';
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '';
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || '';

// Fase 2/fatia de credenciais: a chave NAO e mais global. E resolvida UMA VEZ no
// handler a partir do tenant do payload (workspace_id direto, ou location_id ->
// workspace via RPC fatia 3 -> credencial via helper fatia 2). buildGhlHeaders
// monta o header por chamada com a chave do workspace resolvido.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
  };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// Conversas por página (máximo suportado pela API)
const CONV_PAGE_SIZE = 100;

// ============================================================
// TENANT / CREDENCIAL (Fase 2)
// ============================================================
//
// Esta funcao processa 1 workspace por chamada (NAO ha fila multi-tenant com
// location_id por item, como em sync-contact-opportunities). O tenant vem do
// payload: `workspace_id` (preferencial) ou `location_id`. A chave GHL e
// resolvida UMA VEZ no handler e propagada para todos os fetchs.

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Erro de fail-closed (sem tenant no payload, ou tenant sem credencial GHL).
// E TERMINAL: sem dono/chave nao ha como sincronizar. Aqui nao ha fila com retry
// por item, entao o handler captura e responde 500; a classe distingue falha de
// tenant de erros transientes da API GHL.
class FailClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FailClosedError';
  }
}

// Resolve a chave GHL e o location_id do workspace desta chamada. Ordem:
//   1. workspace_id no payload -> resolveGhlCredentials direto (sem RPC).
//   2. location_id no payload  -> RPC fatia 3 -> workspace -> credencial.
//   3. nenhum dos dois         -> FailClosedError (NUNCA chave global).
// O locationId retornado e o usado nas URLs (/conversations/search?locationId=).
async function resolveTenantGhl(
  sb: ReturnType<typeof createClient>,
  payload: { workspace_id?: string; location_id?: string },
): Promise<{ apiKey: string; locationId: string; workspaceId: string }> {
  const workspaceIdInput = normalizeText(payload.workspace_id);
  const locationIdInput  = normalizeText(payload.location_id);

  if (workspaceIdInput) {
    try {
      const creds = await resolveGhlCredentials(sb, workspaceIdInput);
      const locationId = locationIdInput || normalizeText(creds.locationId);
      if (!locationId) {
        throw new FailClosedError(
          `workspace ${workspaceIdInput} sem location_id (credencial sem metadata.location_id e payload sem location_id)`,
        );
      }
      return { apiKey: creds.apiKey, locationId, workspaceId: workspaceIdInput };
    } catch (err) {
      if (err instanceof FailClosedError) throw err;
      const msg = err instanceof CredentialResolutionError
        ? err.message
        : (err instanceof Error ? err.message : String(err));
      throw new FailClosedError(
        `credencial ghl nao resolvida para workspace ${workspaceIdInput}: ${msg}`,
      );
    }
  }

  if (locationIdInput) {
    const { data: workspaceId, error: rpcErr } = await sb.rpc(
      'get_workspace_id_by_ghl_location_id',
      { p_location_id: locationIdInput },
    );
    if (rpcErr || !workspaceId) {
      throw new FailClosedError(
        `location_id '${locationIdInput}' nao resolve workspace${rpcErr ? ': ' + rpcErr.message : ''}`,
      );
    }
    try {
      const creds = await resolveGhlCredentials(sb, workspaceId as string);
      return { apiKey: creds.apiKey, locationId: locationIdInput, workspaceId: workspaceId as string };
    } catch (err) {
      const msg = err instanceof CredentialResolutionError
        ? err.message
        : (err instanceof Error ? err.message : String(err));
      throw new FailClosedError(
        `credencial ghl nao resolvida para workspace ${workspaceId} (location ${locationIdInput}): ${msg}`,
      );
    }
  }

  throw new FailClosedError(
    'payload sem workspace_id nem location_id — tenant obrigatorio na Fase 2',
  );
}

// ============================================================
// TIPOS
// ============================================================

interface GHLConversation {
  id: string;
  contactId: string;
  locationId: string;
  type: string;
  fullName?: string;
  email?: string;
  phone?: string;
  assignedTo?: string;    // GHL user ID atribuído à conversa
  lastMessageDate: number; // Unix ms
  dateUpdated: number;     // Unix ms
}

interface GHLMessage {
  id: string;
  conversationId: string;
  contactId: string;
  locationId: string;
  type: number;          // Número interno GHL (pouco confiável entre versões)
  messageType: string;   // String canônico: TYPE_WHATSAPP, TYPE_CALL, etc.
  direction: 'inbound' | 'outbound';
  status?: string;       // sent, delivered, read, failed, pending, connected, completed
  body?: string;
  dateAdded: string;     // ISO 8601
  dateUpdated?: string;  // ISO 8601 — quando o status foi atualizado (entrega, leitura, etc.)
  attachments?: string[];
  userId?: string;       // GHL user ID de quem enviou (outbound; null = automação/IA)
  source?: string;       // 'app' (humano) | 'api' (automação externa) | 'workflow' (bot GHL)
  from?: string;         // Número/ID do remetente (todos os canais)
  to?: string;           // Número/ID do destinatário (todos os canais)
  altId?: string;        // ID externo (wamid WhatsApp, ID Meta, etc.)
  error?: string;        // Descrição do erro quando status=failed
  meta?: {
    call?: {
      duration?: number | null;  // Duração em segundos
      status?: string;           // completed, failed, no-answer, busy, canceled
    };
    email?: {
      subject?: string;
      textBody?: string;
      htmlBody?: string;
    };
  };
}

interface ContactRow {
  id: string;
  ghl_id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  owner_name: string | null;
}

interface SyncStats {
  conversations_processed: number;
  messages_processed: number;
  messages_upserted: number;
  has_more_pages: boolean;
  next_page?: number;
  total_conversations?: number;
  // backfill_by_contact fields
  contacts_processed?: number;
  total_contacts?: number;
  has_more?: boolean;
  next_offset?: number;
  last_error?: string;
  // Maior lastMessageDate visto na página (Unix ms). É o cursor do incremental:
  // a paginação por ?page=N da GHL é quebrada (todas as páginas devolvem as
  // mesmas conversas), então avançamos por data em vez de por número de página.
  max_last_message_date?: number;
}

// ============================================================
// MAPEAMENTO DE TIPOS DE MENSAGEM
// ============================================================

// Mensagens de sistema/atividade — NÃO devem ser salvas em comunicacoes
const SKIP_MESSAGE_TYPES = new Set([
  'TYPE_ACTIVITY_OPPORTUNITY',
  'TYPE_ACTIVITY_CONTACT',
  'TYPE_NOTE',
  'TYPE_INTERNAL_NOTE',
  'TYPE_LIVE_CHAT_INFO_MESSAGES',
  'TYPE_CUSTOM_PROVIDER_SMS',    // mensagens de sistema de roteamento
  'TYPE_CUSTOM_PROVIDER_EMAIL',
]);

function shouldSkip(messageType: string): boolean {
  if (SKIP_MESSAGE_TYPES.has(messageType)) return true;
  if (messageType.startsWith('TYPE_ACTIVITY_')) return true;
  return false;
}

// Canal legível por humanos
const CHANNEL_MAP: Record<string, string> = {
  'TYPE_SMS':                    'sms',
  'TYPE_CUSTOM_SMS':             'sms',
  'TYPE_EMAIL':                  'email',
  'TYPE_CUSTOM_EMAIL':           'email',
  'TYPE_WHATSAPP':               'whatsapp',
  'TYPE_CALL':                   'call',
  'TYPE_VOICEMAIL':              'call',
  'TYPE_FACEBOOK':               'facebook',
  'TYPE_FACEBOOK_COMMENT':       'facebook',
  'TYPE_INSTAGRAM':              'instagram',
  'TYPE_INSTAGRAM_STORY_MENTION':'instagram',
  'TYPE_GMB':                    'gmb',
  'TYPE_GMB_REVIEW':             'gmb',
  'TYPE_LIVE_CHAT':              'webchat',
  'TYPE_TYPEBOT':                'webchat',
};

// Tipo na tabela comunicacoes
const TIPO_MAP: Record<string, string> = {
  'TYPE_CALL':      'ligacao',
  'TYPE_VOICEMAIL': 'ligacao',
};

function getChannel(messageType: string): string {
  return CHANNEL_MAP[messageType] ?? 'mensagem';
}

function getTipo(messageType: string): string {
  return TIPO_MAP[messageType] ?? 'mensagem';
}

// ============================================================
// RATE LIMIT — protocolo de proteção GHL API
// ============================================================
//
// Limites reais (medidos via headers):
//   x-ratelimit-max:                  100  (requisições por janela)
//   x-ratelimit-interval-milliseconds: 10000 (10 segundos)
//   x-ratelimit-limit-daily:          200000
//   → Máximo seguro: ~8 req/s (80% do teto de 10 req/s)
//
// Estratégia:
//   1. delay base de 130ms entre requests  →  ~7.7 req/s (dentro do limite)
//   2. lê x-ratelimit-remaining em toda resposta
//      - remaining < 20  → aguarda 500ms antes do próximo request
//      - remaining < 5   → aguarda até janela renovar (1s extra)
//   3. 429 Too Many Requests  → lê Retry-After, aguarda + 500ms de buffer
//      retenta até 4 vezes com backoff: 1s, 2s, 4s, 8s
// ============================================================

// Estado de rate limit compartilhado entre chamadas
const rateLimitState = {
  remaining: 100,
  resetInMs:  0,
};

// Delay base conservador: ~130ms = 7.7 req/s (limite = 10 req/s)
const BASE_DELAY_MS = 130;

async function ghlFetch(urlStr: string, apiKey: string, label = ''): Promise<Response> {
  const MAX_RETRIES = 4;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // Delay adaptativo baseado no estado de rate limit
    if (rateLimitState.remaining < 5) {
      // Quase no limite: esperar janela renovar
      const waitMs = Math.max(rateLimitState.resetInMs, 1000);
      console.warn(`[rate-limit] remaining=${rateLimitState.remaining}, aguardando ${waitMs}ms`);
      await delay(waitMs + 200);
    } else if (rateLimitState.remaining < 20) {
      await delay(500);
    } else {
      await delay(BASE_DELAY_MS);
    }

    const res = await fetch(urlStr, { headers: buildGhlHeaders(apiKey) });

    // Atualizar estado de rate limit
    const remaining = res.headers.get('x-ratelimit-remaining');
    const interval  = res.headers.get('x-ratelimit-interval-milliseconds');
    if (remaining !== null) rateLimitState.remaining = Number(remaining);
    if (interval  !== null) rateLimitState.resetInMs  = Number(interval);

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs     = retryAfter ? Number(retryAfter) * 1000 : 1000 * Math.pow(2, attempt);
      console.warn(`[rate-limit] 429 ${label} — tentativa ${attempt + 1}/${MAX_RETRIES}, aguardando ${waitMs + 500}ms`);
      if (attempt >= MAX_RETRIES) throw new Error(`GHL 429 após ${MAX_RETRIES} tentativas: ${label}`);
      await delay(waitMs + 500);
      continue;
    }

    return res;
  }

  throw new Error(`ghlFetch: loop inesperado (${label})`);
}

// ============================================================
// GHL API — busca conversas (paginado por página)
// ============================================================

async function fetchConversationsPage(params: {
  locationId: string;
  apiKey: string;
  page: number;
  limit: number;
  startAfterDate?: number;  // Unix ms — filtra lastMessageDate > este valor
  contactId?: string;
  sortOrder?: 'asc' | 'desc'; // asc = oldest first (stable for backfill), desc = newest first (incremental)
}): Promise<{ conversations: GHLConversation[]; total: number }> {
  const url = new URL(`${GHL_API_BASE}/conversations/search`);
  url.searchParams.set('locationId',  params.locationId);
  url.searchParams.set('limit',       String(params.limit));
  url.searchParams.set('page',        String(params.page));
  url.searchParams.set('sortBy',      'last_message_date');
  url.searchParams.set('sort',        params.sortOrder ?? 'desc');

  if (params.startAfterDate) {
    url.searchParams.set('startAfterDate', String(params.startAfterDate));
  }
  if (params.contactId) {
    url.searchParams.set('contactId', params.contactId);
  }

  const res = await ghlFetch(url.toString(), params.apiKey, `/conversations/search`);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GHL /conversations/search ${res.status}: ${errText}`);
  }

  const data = await res.json();
  return {
    conversations: data.conversations ?? [],
    total:         data.total         ?? 0,
  };
}

// ============================================================
// GHL API — busca todas as mensagens de uma conversa (cursor)
// ============================================================

async function fetchAllMessages(conversationId: string, apiKey: string): Promise<GHLMessage[]> {
  const all: GHLMessage[] = [];
  let lastMessageId: string | undefined;
  let hasMore = true;

  while (hasMore) {
    const url = new URL(`${GHL_API_BASE}/conversations/${conversationId}/messages`);
    url.searchParams.set('limit', '100');
    if (lastMessageId) {
      url.searchParams.set('lastMessageId', lastMessageId);
    }

    const res = await ghlFetch(url.toString(), apiKey, `/conversations/${conversationId}/messages`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`GHL /conversations/${conversationId}/messages ${res.status}: ${errText}`);
    }

    const data    = await res.json();
    // Estrutura da API: { messages: { messages: [...], lastMessageId, nextPage } }
    const wrapper: { messages?: GHLMessage[]; lastMessageId?: string | null; nextPage?: boolean } =
      data?.messages ?? data ?? {};

    const batch: GHLMessage[] = wrapper.messages ?? [];
    all.push(...batch);

    hasMore       = wrapper.nextPage === true && !!wrapper.lastMessageId;
    lastMessageId = wrapper.lastMessageId ?? undefined;
    // delay já aplicado no início do próximo loop via ghlFetch
  }

  return all;
}

// ============================================================
// MAPEAMENTO: GHLMessage + contato → linha de comunicacoes
// ============================================================

function mapMessageToRow(
  msg:     GHLMessage,
  contact: ContactRow | null,
  conv:    GHLConversation,
  workspaceId: string,
): Record<string, unknown> {
  const channel = getChannel(msg.messageType);
  const tipo    = getTipo(msg.messageType);
  const isCall  = tipo === 'ligacao';

  return {
    // Tenant explicito. comunicacoes.workspace_id e NOT NULL e o trigger
    // set_workspace_id_comunicacoes so resolve via contato_id — quando a conversa
    // e de um contato que ainda nao existe em `contatos`, contato_id fica NULL,
    // o trigger devolve NULL e o upsert do LOTE INTEIRO era rejeitado.
    workspace_id: workspaceId,

    // Identificadores GHL (chave de dedup)
    ghl_message_id:      msg.id,
    ghl_conversation_id: msg.conversationId,

    // FK para contatos
    contato_id: contact?.id ?? null,

    // Tipo e canal
    tipo,
    channel,
    direction: msg.direction ?? null,

    // Conteúdo
    mensagem_body:    msg.body ?? null,
    mensagem_subject: msg.meta?.email?.subject ?? null,
    data_comunicacao: msg.dateAdded,

    // Anexos
    attachments: (msg.attachments?.length) ? msg.attachments : null,

    // Usuário GHL que enviou (outbound; null = IA/automação)
    usuario_ghl_id: msg.userId ?? null,

    // Origem da mensagem — CAMPO CRÍTICO para distinguir humano vs IA/automação:
    //   'app'      = enviado manualmente pelo SDR no app GHL
    //   'api'      = enviado via API (automação externa)
    //   'workflow' = enviado por workflow ou bot do GHL
    ghl_source: msg.source ?? null,

    // Status de entrega
    msg_status:       msg.status      ?? null,
    ghl_date_updated: msg.dateUpdated ?? null,

    // Identificador externo (wamid WhatsApp, ID Meta, etc.)
    alt_id: msg.altId ?? null,

    // Erro quando msg_status = 'failed'
    error_msg: msg.error ?? null,

    // Remetente e destinatário (todos os canais)
    msg_from: msg.from ?? null,
    msg_to:   msg.to   ?? null,

    // Quem está atribuído à conversa (pode diferir de quem enviou)
    ghl_assigned_to: conv.assignedTo ?? null,

    // Campos de ligação (mantidos para compatibilidade)
    phone_call_from:     isCall ? (msg.from ?? null) : null,
    phone_call_to:       isCall ? (msg.to   ?? null) : null,
    phone_call_duration: isCall ? (msg.meta?.call?.duration ?? null) : null,
    phone_call_status:   isCall ? (msg.meta?.call?.status   ?? null) : null,

    // Campos desnormalizados de contato (para evitar JOINs nas queries de PRÉ-VENDAS)
    contato_nome:     contact?.nome     ?? conv.fullName ?? null,
    contato_email:    contact?.email    ?? conv.email    ?? null,
    contato_telefone: contact?.telefone ?? conv.phone    ?? null,
    sdr_name:         contact?.owner_name ?? null,
  };
}

// ============================================================
// SYNC LOG — helpers
// ============================================================

type SupabaseClient = ReturnType<typeof createClient>;

async function createSyncLog(
  sb: SupabaseClient,
  mode: string,
  page: number,
  workspaceId: string | null,
): Promise<string> {
  const { data } = await sb
    .from('ghl_conversations_sync_log')
    .insert({ mode, page_processed: page, status: 'running', workspace_id: workspaceId })
    .select('id')
    .single();
  return data?.id ?? 'unknown';
}

async function finishSyncLog(
  sb: SupabaseClient,
  id: string,
  status: 'success' | 'error' | 'partial',
  stats: Partial<SyncStats>,
  errorMessage?: string,
): Promise<void> {
  await sb.from('ghl_conversations_sync_log').update({
    status,
    finished_at:             new Date().toISOString(),
    conversations_processed: stats.conversations_processed ?? 0,
    messages_processed:      stats.messages_processed      ?? 0,
    messages_upserted:       stats.messages_upserted       ?? 0,
    has_more_pages:          stats.has_more_pages          ?? false,
    next_page:               stats.next_page               ?? null,
    total_conversations:     stats.total_conversations     ?? null,
    // last_error era descartado: um upsert que falhava em TODAS as conversas
    // ainda terminava como 'success' com error_message NULL. Foi o que manteve
    // a violacao de NOT NULL de workspace_id invisivel por semanas.
    error_message:           errorMessage ?? stats.last_error ?? null,
    cursor_last_message_date: stats.max_last_message_date ?? null,
  }).eq('id', id);
}

// Ponto de retomada do incremental: a data da ultima conversa efetivamente
// processada, e NAO o `finished_at` da ultima execucao completa.
//
// Por que nao finished_at: quando a janela nao cabe no orcamento (24h de
// conversas levam mais de 90s, porque cada conversa exige buscar o historico
// inteiro de mensagens), a execucao nunca fecha como 'success' — e o sync
// releria o mesmo bloco a cada 10 min, para sempre, sem nunca convergir.
//
// Por que e seguro incluir execucoes 'partial': o cursor e a data do que JA foi
// lido, entao retomar dali nao pula nada.
async function getResumeCursor(
  sb: SupabaseClient,
  workspaceId: string,
): Promise<number | null> {
  const { data } = await sb
    .from('ghl_conversations_sync_log')
    .select('cursor_last_message_date')
    // Sem este filtro o marco e GLOBAL: com 2+ workspaces, o que termina primeiro
    // avanca o relogio do outro, que perde a janela e nunca mais volta atras.
    .eq('workspace_id', workspaceId)
    .eq('mode', 'incremental')
    .in('status', ['success', 'partial'])
    .not('cursor_last_message_date', 'is', null)
    .order('cursor_last_message_date', { ascending: false })
    .limit(1)
    .maybeSingle();  // workspace sem historico => null, nao erro

  const cursor = data?.cursor_last_message_date;
  return typeof cursor === 'number' ? cursor : (cursor ? Number(cursor) : null);
}

// ============================================================
// SYNC PRINCIPAL — processa uma página de conversas
// ============================================================

async function syncPage(
  sb:   SupabaseClient,
  opts: {
    locationId:      string;
    apiKey:          string;
    workspaceId:     string;
    page:           number;
    startAfterDate?: number;
    contactId?:      string;
    mode:            string;
    // Instante limite (epoch ms) para parar de processar conversas. Sem isto o
    // laco abaixo pode rodar muito alem do orcamento e a plataforma MATA a
    // function no meio — o log fica preso em 'running' para sempre e o marco
    // temporal nunca avanca (foi o que aconteceu no 1o ciclo pos-correcao).
    deadline?:       number;
  },
): Promise<SyncStats> {
  const stats: SyncStats = {
    conversations_processed: 0,
    messages_processed:      0,
    messages_upserted:       0,
    has_more_pages:          false,
  };

  // asc (mais antigas primeiro) tanto no full_backfill quanto no incremental.
  // No incremental o cursor e `startAfterDate`, que so avanca se lermos em ordem
  // crescente de data — com desc o cursor ficaria travado na conversa mais nova
  // e as paginas seguintes repetiriam sempre o mesmo bloco.
  const sortOrder = 'asc';

  // 1. Buscar página de conversas
  const { conversations, total } = await fetchConversationsPage({
    locationId:     opts.locationId,
    apiKey:         opts.apiKey,
    page:           opts.page,
    limit:          CONV_PAGE_SIZE,
    startAfterDate: opts.startAfterDate,
    contactId:      opts.contactId,
    sortOrder,
  });

  if (conversations.length === 0) return stats;

  stats.total_conversations = total;
  stats.has_more_pages      = conversations.length === CONV_PAGE_SIZE;
  stats.next_page           = stats.has_more_pages ? opts.page + 1 : undefined;

  // 2. Batch lookup de contatos (evita N queries individuais)
  const ghlIds = [...new Set(conversations.map(c => c.contactId).filter(Boolean))];
  const { data: contacts } = await sb
    .from('contatos')
    .select('id, ghl_id, nome, email, telefone, owner_name')
    // Isolamento de tenant: sem este filtro, um ghl_id repetido entre workspaces
    // casaria com o contato do tenant errado e a mensagem seria vinculada a ele.
    .eq('workspace_id', opts.workspaceId)
    .in('ghl_id', ghlIds);

  const contactMap = new Map<string, ContactRow>(
    (contacts ?? []).map(c => [c.ghl_id, c])
  );

  // 3. Processar cada conversa.
  // As conversas vem em ordem CRESCENTE de lastMessageDate, entao o cursor e a
  // data da ultima conversa EFETIVAMENTE processada — nunca o maior valor da
  // pagina inteira: parar no meio e saltar o cursor para o fim perderia tudo
  // que ficou sem processar.
  for (const conv of conversations) {
    if (opts.deadline && Date.now() > opts.deadline) {
      stats.has_more_pages = true;
      break;
    }
    // Avanca o cursor ao ASSUMIR esta conversa (o catch abaixo tambem a conta
    // como processada, entao o criterio e o mesmo nos dois caminhos).
    if (
      typeof conv.lastMessageDate === 'number' &&
      conv.lastMessageDate > (stats.max_last_message_date ?? 0)
    ) {
      stats.max_last_message_date = conv.lastMessageDate;
    }
    try {
      const messages = await fetchAllMessages(conv.id, opts.apiKey);
      stats.messages_processed += messages.length;

      // Filtrar mensagens de atividade/sistema
      const validMessages = messages.filter(m => !shouldSkip(m.messageType));

      if (validMessages.length === 0) {
        stats.conversations_processed++;
        continue;
      }

      const contact = contactMap.get(conv.contactId) ?? null;
      const rows    = validMessages.map(m => mapMessageToRow(m, contact, conv, opts.workspaceId));

      // Upsert — ON CONFLICT (ghl_message_id) DO UPDATE
      const { error } = await sb
        .from('comunicacoes')
        .upsert(rows, {
          onConflict:       'ghl_message_id',
          ignoreDuplicates: false,
        });

      if (error) {
        const errInfo = `conv ${conv.id}: ${error.message} | code: ${error.code} | details: ${error.details}`;
        console.error(`[sync-ghl-conversations] upsert error`, errInfo);
        if (!stats.last_error) (stats as Record<string, unknown>).last_error = errInfo;
      } else {
        stats.messages_upserted += rows.length;
      }

      stats.conversations_processed++;
    } catch (err) {
      console.error(`[sync-ghl-conversations] error on conv ${conv.id}:`, err);
      stats.conversations_processed++;
    }
    // Sem delay extra aqui — ghlFetch já aplica BASE_DELAY_MS entre requests
  }

  return stats;
}

// ============================================================
// BACKFILL POR CONTATO — itera a tabela contatos (paginação estável)
// ============================================================
// O endpoint GHL /conversations/search?page=N está quebrado (todas as páginas
// retornam as mesmas conversas). A alternativa é iterar pelos contatos do nosso DB
// e usar ?contactId=X para buscar conversas de cada contato individualmente.
// ============================================================

async function syncByContactBatch(
  sb:   SupabaseClient,
  opts: {
    locationId: string; apiKey: string; workspaceId: string;
    offset: number; batchSize: number;
    deadline?: number;  // mesma protecao do syncPage: nao ser morto no meio
  },
): Promise<SyncStats> {
  const stats: SyncStats = {
    conversations_processed: 0,
    messages_processed:      0,
    messages_upserted:       0,
    has_more_pages:          false,
    contacts_processed:      0,
    has_more:                false,
  };

  // 1. Buscar lote de contatos da nossa tabela
  const { data: contacts, error: contactsErr, count } = await sb
    .from('contatos')
    .select('id, ghl_id, nome, email, telefone, owner_name', { count: 'exact' })
    // Sem este filtro o backfill varre a base INTEIRA — incluindo os contatos
    // ficticios do tenant de demonstracao — e os busca na location real do cliente.
    .eq('workspace_id', opts.workspaceId)
    .not('ghl_id', 'is', null)
    .order('ghl_id', { ascending: true })
    .range(opts.offset, opts.offset + opts.batchSize - 1);

  if (contactsErr) throw new Error(`contatos query: ${contactsErr.message}`);
  if (!contacts || contacts.length === 0) {
    stats.has_more     = false;
    stats.total_contacts = count ?? 0;
    return stats;
  }

  stats.total_contacts = count ?? 0;
  let processed = 0;  // contatos EFETIVAMENTE processados — base do next_offset

  // 2. Para cada contato, buscar suas conversas via contactId
  for (const contact of contacts as ContactRow[]) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    if (!contact.ghl_id) { processed++; continue; }

    try {
      // GHL pode ter múltiplas conversas por contato (WhatsApp, SMS, Email separados)
      // limit=100 é suficiente — raramente um contato tem mais de 10 conversas
      const { conversations } = await fetchConversationsPage({
        locationId: opts.locationId,
        apiKey:     opts.apiKey,
        page:       1,
        limit:      100,
        contactId:  contact.ghl_id,
        sortOrder:  'asc',
      });

      if (conversations.length === 0) {
        stats.contacts_processed = (stats.contacts_processed ?? 0) + 1;
        processed++;  // contato SEM conversa tambem foi visitado — sem isto o
                      // next_offset nao avanca por ele e o lote seguinte o relê
        continue;
      }

      stats.total_conversations = (stats.total_conversations ?? 0) + conversations.length;

      // 3. Para cada conversa do contato, buscar todas as mensagens
      for (const conv of conversations) {
        try {
          const messages = await fetchAllMessages(conv.id, opts.apiKey);
          stats.messages_processed += messages.length;

          const validMessages = messages.filter(m => !shouldSkip(m.messageType));
          if (validMessages.length === 0) {
            stats.conversations_processed++;
            await delay(80);
            continue;
          }

          const rows = validMessages.map(m => mapMessageToRow(m, contact, conv, opts.workspaceId));

          const { error: upsertErr } = await sb
            .from('comunicacoes')
            .upsert(rows, { onConflict: 'ghl_message_id', ignoreDuplicates: false });

          if (upsertErr) {
            const errInfo = `conv ${conv.id} (contact ${contact.ghl_id}): ${upsertErr.message}`;
            console.error(`[sync-ghl-conversations] upsert error`, errInfo);
            if (!stats.last_error) stats.last_error = errInfo;
          } else {
            stats.messages_upserted += rows.length;
          }

          stats.conversations_processed++;
        } catch (convErr) {
          console.error(`[sync-ghl-conversations] error on conv ${conv.id}:`, convErr);
          stats.conversations_processed++;
        }
        // Sem delay extra — ghlFetch gerencia o rate limit
      }
    } catch (contactErr) {
      console.error(`[sync-ghl-conversations] error on contact ${contact.ghl_id}:`, contactErr);
    }

    stats.contacts_processed = (stats.contacts_processed ?? 0) + 1;
    processed++;
  }

  // 4. Determinar se há mais contatos para processar.
  // Baseado nos contatos processados, nao nos buscados: parar no prazo e ainda
  // assim avancar o offset pelo lote inteiro puralaria os que ficaram de fora.
  const nextOffset      = opts.offset + processed;
  stats.has_more        = nextOffset < (stats.total_contacts ?? 0);
  stats.next_offset     = stats.has_more ? nextOffset : undefined;
  stats.has_more_pages  = stats.has_more; // compatibilidade

  return stats;
}

// ============================================================
// BACKFILL DE UM CONTATO — re-sync cirurgico
// ============================================================
// O webhook-ghl chama {mode:'backfill_by_contact', contactId} quando chega um
// evento de mensagem. Antes o contactId era ignorado: caia no lote por offset e
// sincronizava sempre o PRIMEIRO contato da tabela, nunca o do evento.
// ============================================================

async function syncSingleContact(
  sb:   SupabaseClient,
  opts: { locationId: string; apiKey: string; workspaceId: string; ghlContactId: string },
): Promise<SyncStats> {
  const stats: SyncStats = {
    conversations_processed: 0,
    messages_processed:      0,
    messages_upserted:       0,
    has_more_pages:          false,
    contacts_processed:      0,
    has_more:                false,
  };

  // O contato pode ainda nao existir localmente (lead novo). Nesse caso seguimos
  // com contact = null: a mensagem entra com contato_id NULL e o workspace_id
  // explicito, e a religacao acontece quando o contato for criado.
  const { data: contact } = await sb
    .from('contatos')
    .select('id, ghl_id, nome, email, telefone, owner_name')
    .eq('workspace_id', opts.workspaceId)
    .eq('ghl_id', opts.ghlContactId)
    .maybeSingle();

  const { conversations } = await fetchConversationsPage({
    locationId: opts.locationId,
    apiKey:     opts.apiKey,
    page:       1,
    limit:      100,
    contactId:  opts.ghlContactId,
    sortOrder:  'asc',
  });

  stats.total_conversations = conversations.length;

  for (const conv of conversations) {
    try {
      const messages = await fetchAllMessages(conv.id, opts.apiKey);
      stats.messages_processed += messages.length;

      const validMessages = messages.filter(m => !shouldSkip(m.messageType));
      if (validMessages.length === 0) {
        stats.conversations_processed++;
        continue;
      }

      const rows = validMessages.map(
        m => mapMessageToRow(m, (contact as ContactRow | null) ?? null, conv, opts.workspaceId),
      );

      const { error: upsertErr } = await sb
        .from('comunicacoes')
        .upsert(rows, { onConflict: 'ghl_message_id', ignoreDuplicates: false });

      if (upsertErr) {
        const errInfo = `conv ${conv.id} (contact ${opts.ghlContactId}): ${upsertErr.message}`;
        console.error('[sync-ghl-conversations] upsert error', errInfo);
        if (!stats.last_error) stats.last_error = errInfo;
      } else {
        stats.messages_upserted += rows.length;
      }

      stats.conversations_processed++;
    } catch (convErr) {
      console.error(`[sync-ghl-conversations] error on conv ${conv.id}:`, convErr);
      stats.conversations_processed++;
    }
  }

  stats.contacts_processed = 1;
  return stats;
}

// ============================================================
// HANDLER HTTP
// ============================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders);
  if (guardResponse) return guardResponse;

  // GHL_API_KEY / GHL_LOCATION_ID nao sao mais exigidos: a chave e resolvida por
  // workspace (Fase 2) a partir do tenant do payload. So o client Supabase e obrigatorio.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return new Response(
      JSON.stringify({
        error: 'Missing required env vars: SUPABASE_URL|SB_URL / SUPABASE_SERVICE_ROLE_KEY|SB_SERVICE_ROLE_KEY',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // Parse request body
  let body: {
    workspace_id?: string; // Fase 2: tenant preferencial (resolve credencial direto, sem RPC)
    location_id?:  string; // Fase 2: tenant alternativo (location_id -> workspace via RPC)
    mode?:         string;
    page?:         number;
    offset?:       number;
    batch_size?:   number;
    contactId?:    string;
    daysBack?:     number;
  } = {};
  try {
    if (req.method === 'POST') body = await req.json();
  } catch { /* ignore */ }

  const mode      = body.mode       ?? 'incremental';
  const page      = body.page       ?? 1;
  const offset    = body.offset     ?? 0;
  const batchSize = body.batch_size ?? 20;
  const contactId = body.contactId;
  const daysBack  = body.daysBack   ?? 1;

  const logId = await createSyncLog(
    sb,
    mode,
    mode === 'backfill_by_contact' ? offset : page,
    normalizeText(body.workspace_id),
  );

  try {
    // Fase 2: resolve o tenant (workspace) e a chave GHL UMA VEZ por chamada.
    // FailClosedError aqui dentro => catch abaixo finaliza o sync log como 'error'
    // e responde 500 (terminal — sem tenant/credencial nao ha como sincronizar).
    const tenant = await resolveTenantGhl(sb as unknown as SupabaseClient, {
      workspace_id: body.workspace_id,
      location_id:  body.location_id,
    });

    let stats: SyncStats;

    if (mode === 'backfill_by_contact') {
      stats = contactId
        // Re-sync cirurgico de UM contato (caminho do webhook de mensagem)
        ? await syncSingleContact(sb, {
            locationId:   tenant.locationId,
            apiKey:       tenant.apiKey,
            workspaceId:  tenant.workspaceId,
            ghlContactId: contactId,
          })
        // Varredura por lote (backfill completo, avanca por offset)
        : await syncByContactBatch(sb, {
            locationId:  tenant.locationId,
            apiKey:      tenant.apiKey,
            workspaceId: tenant.workspaceId,
            offset,
            batchSize,
            deadline: Date.now() + 90_000,
          });
    } else {
      // incremental ou full_backfill
      let startAfterDate: number | undefined;
      if (mode === 'incremental' && !contactId) {
        // startAfterDate só faz sentido no incremental geral — quando um contactId
        // específico é passado, buscamos todas as conversas dele sem filtro de data
        const cursor = await getResumeCursor(sb, tenant.workspaceId);
        if (cursor) {
          // Retoma exatamente de onde parou. Sem recuo de 1h: o cursor e a data
          // da ultima conversa JA processada, e o upsert e idempotente por
          // ghl_message_id — recuar so faria retrabalho.
          startAfterDate = cursor;
        } else {
          // Primeira execucao do workspace (ou historico limpo): janela curta.
          // Buraco maior que isso e trabalho do backfill, nao do incremental —
          // tentar puxar semanas numa execucao estoura o orcamento e falha em
          // looping, sem nunca gravar nada.
          startAfterDate = Date.now() - daysBack * 24 * 60 * 60 * 1000;
        }
      }

      // Processa todas as páginas disponíveis até o limite de tempo.
      // Sem paginação, dias movimentados (>100 conversas/10min) ficavam com
      // conversas de leads novos perdidas nas páginas seguintes.
      stats = { conversations_processed: 0, messages_processed: 0, messages_upserted: 0, has_more_pages: false };
      // 90s (nao 120s): a plataforma mata a function bem antes disso quando o
      // processamento passa do orcamento, e o log precisa de folga para ser
      // fechado. Melhor terminar como 'partial' e continuar no proximo ciclo
      // do que ser morto no meio e deixar o registro preso em 'running'.
      const TIMEOUT_MS = 90_000;
      const started = Date.now();
      const deadline = started + TIMEOUT_MS;

      // Avanco por CURSOR DE DATA, nao por numero de pagina. O ?page=N da GHL e
      // quebrado (toda pagina devolve as mesmas conversas): o laco antigo lia a
      // pagina 1 duas vezes, estourava o timeout e parava marcando next_page=3 —
      // que ninguem consumia. Aqui cada volta reconsulta a partir da data da
      // ultima conversa lida, entao a proxima execucao do cron ja retoma sozinha.
      let cursor = startAfterDate;
      const MAX_LOOPS = 50;  // trava de seguranca contra laco infinito

      for (let i = 0; i < MAX_LOOPS; i++) {
        const pageStats = await syncPage(sb, {
          page: 1,
          startAfterDate: cursor,
          contactId,
          mode,
          locationId:  tenant.locationId,
          apiKey:      tenant.apiKey,
          workspaceId: tenant.workspaceId,
          deadline,
        });
        stats.conversations_processed = (stats.conversations_processed ?? 0) + (pageStats.conversations_processed ?? 0);
        stats.messages_processed += pageStats.messages_processed;
        stats.messages_upserted  += pageStats.messages_upserted;
        stats.total_conversations = pageStats.total_conversations ?? stats.total_conversations;
        if (pageStats.last_error && !stats.last_error) stats.last_error = pageStats.last_error;
        // Propaga o cursor: e ele que vai para o log e serve de retomada.
        if (
          pageStats.max_last_message_date &&
          pageStats.max_last_message_date > (stats.max_last_message_date ?? 0)
        ) {
          stats.max_last_message_date = pageStats.max_last_message_date;
        }

        // Pagina incompleta => acabou o que havia para ler nesta janela
        if (!pageStats.has_more_pages) break;

        const next = pageStats.max_last_message_date;
        // Cursor que nao avanca (ou some) significaria reler o mesmo bloco eternamente
        if (!next || (cursor !== undefined && next <= cursor)) {
          stats.has_more_pages = true;
          break;
        }

        if (Date.now() - started > TIMEOUT_MS) {
          // Sem next_page: o proximo ciclo recalcula o cursor pelo log e continua
          stats.has_more_pages = true;
          break;
        }
        cursor = next;
      }
    }

    // Execucao que parou no meio da janela NAO pode virar marco temporal: o
    // proximo ciclo leria a partir do fim dela e pularia o que ficou por ler.
    // 'partial' distingue "terminou a janela" de "parou no meio" — a retomada
    // em si vem do cursor gravado (getResumeCursor), que aceita os dois.
    await finishSyncLog(sb, logId, stats.has_more_pages ? 'partial' : 'success', stats);

    return new Response(
      JSON.stringify({ success: true, mode, page, offset, ...stats }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await finishSyncLog(sb, logId, 'error', {}, errMsg);

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

// ============================================================
// HELPERS
// ============================================================

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
