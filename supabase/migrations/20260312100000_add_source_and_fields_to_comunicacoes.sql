-- ============================================================
-- Migration: Adiciona campos completos da GHL Conversations API
-- Motivo: Capturar todos os dados disponíveis da API para permitir
--         análises de qualidade, detecção de IA/automação e auditoria.
-- Data: 2026-03-12
-- ============================================================

-- 1. NOVAS COLUNAS
ALTER TABLE comunicacoes
  -- Origem da mensagem: 'app' (humano), 'api' (automatizado), 'workflow' (GHL workflow/bot)
  -- CRÍTICO: distingue mensagens de SDR humano vs IA/automação
  ADD COLUMN IF NOT EXISTS ghl_source        TEXT,

  -- Status de entrega: 'sent' | 'delivered' | 'read' | 'failed' | 'pending' | 'connected' | 'completed'
  ADD COLUMN IF NOT EXISTS msg_status        TEXT,

  -- Quando o status da mensagem foi atualizado no GHL (ex: momento de entrega, leitura)
  ADD COLUMN IF NOT EXISTS ghl_date_updated  TIMESTAMPTZ,

  -- ID externo da mensagem na plataforma de origem (wamid WhatsApp, ID Meta, etc.)
  ADD COLUMN IF NOT EXISTS alt_id            TEXT,

  -- Descrição do erro quando msg_status = 'failed'
  ADD COLUMN IF NOT EXISTS error_msg         TEXT,

  -- Remetente (número/ID) para todos os canais
  ADD COLUMN IF NOT EXISTS msg_from          TEXT,

  -- Destinatário (número/ID) para todos os canais
  ADD COLUMN IF NOT EXISTS msg_to            TEXT,

  -- ID do usuário GHL atribuído à conversa (pode diferir de usuario_ghl_id = quem enviou)
  ADD COLUMN IF NOT EXISTS ghl_assigned_to   TEXT;

-- 2. COMENTÁRIOS
COMMENT ON COLUMN comunicacoes.ghl_source IS
  'Origem da mensagem conforme GHL API (campo "source"): '
  '"app" = enviado manualmente pelo usuário no app GHL; '
  '"api" = enviado via API (automação externa); '
  '"workflow" = enviado por workflow/bot do GHL. '
  'NULL = dados históricos anteriores a esta migration. '
  'Use: direction=outbound AND ghl_source IN (''workflow'',''api'') para detectar automação/IA.';

COMMENT ON COLUMN comunicacoes.msg_status IS
  'Status de entrega da mensagem conforme GHL API: '
  '"sent" | "delivered" | "read" | "failed" | "pending" | "connected" | "completed". '
  'Para ligações: "completed" | "failed" | "no-answer" | "busy" | "canceled".';

COMMENT ON COLUMN comunicacoes.ghl_date_updated IS
  'Timestamp da última atualização do registro de mensagem no GHL (campo "dateUpdated"). '
  'Indica quando o status mudou — útil para medir tempo de entrega, leitura, etc.';

COMMENT ON COLUMN comunicacoes.alt_id IS
  'ID externo da mensagem na plataforma de origem (campo "altId" da GHL API). '
  'Exemplos: wamid.HBgM... para WhatsApp, ID Meta para Facebook/Instagram.';

COMMENT ON COLUMN comunicacoes.error_msg IS
  'Descrição do erro quando msg_status = ''failed'' (campo "error" da GHL API). '
  'Exemplos: "Invalid destination number or unreachable", "Blocked by user".';

COMMENT ON COLUMN comunicacoes.msg_from IS
  'Identificador do remetente para todos os canais (campo "from" da GHL API). '
  'WhatsApp/SMS: número de telefone. Email: endereço. Call: duplica phone_call_from.';

COMMENT ON COLUMN comunicacoes.msg_to IS
  'Identificador do destinatário para todos os canais (campo "to" da GHL API).';

COMMENT ON COLUMN comunicacoes.ghl_assigned_to IS
  'ID do usuário GHL atribuído à conversa (campo "assignedTo" de GHLConversation). '
  'Pode diferir de usuario_ghl_id (quem enviou a mensagem). Mapeável para ghl_users.ghl_id.';

-- 3. ÍNDICES
CREATE INDEX IF NOT EXISTS idx_comunicacoes_ghl_source
  ON comunicacoes (ghl_source)
  WHERE ghl_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comunicacoes_msg_status
  ON comunicacoes (msg_status)
  WHERE msg_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comunicacoes_alt_id
  ON comunicacoes (alt_id)
  WHERE alt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comunicacoes_direction_source
  ON comunicacoes (direction, ghl_source)
  WHERE direction IS NOT NULL;

-- 4. ATUALIZAR VIEW comunicacoes_com_remetente
-- ghl_users usa papeis TEXT[] (array multi-papel), não papel TEXT
-- Adiciona: is_automatico (bool) via ghl_source
DROP VIEW IF EXISTS comunicacoes_com_remetente;

CREATE VIEW comunicacoes_com_remetente AS
SELECT
  c.*,
  gu.nome    AS remetente_nome,
  gu.papeis  AS remetente_papeis,
  gu.email   AS remetente_email,

  -- is_automatico: true quando ghl_source indica automação/workflow/bot
  -- Fallback para dados históricos: outbound sem userId também é tratado como automatizado
  CASE
    WHEN c.direction = 'outbound'
     AND (
       c.ghl_source IN ('workflow', 'api', 'bot')
       OR (c.ghl_source IS NULL AND c.usuario_ghl_id IS NULL)
     )
    THEN true
    ELSE false
  END AS is_automatico,

  -- autor: quem enviou (enriquecido com ghl_source para detecção de IA)
  -- Para usuários com múltiplos papeis usa papeis[1] como papel principal
  CASE
    WHEN c.direction = 'inbound'                                               THEN 'lead'
    WHEN c.direction = 'outbound' AND c.ghl_source = 'workflow'               THEN 'automacao'
    WHEN c.direction = 'outbound' AND c.ghl_source = 'api'                    THEN 'automacao'
    WHEN c.direction = 'outbound' AND c.ghl_source = 'bot'                    THEN 'automacao'
    WHEN c.direction = 'outbound'
     AND c.usuario_ghl_id IS NULL AND c.ghl_source IS NULL                    THEN 'automacao'
    WHEN c.direction = 'outbound'
     AND gu.papeis IS NOT NULL AND array_length(gu.papeis, 1) > 0             THEN gu.papeis[1]
    WHEN c.direction = 'outbound' AND gu.nome IS NOT NULL                     THEN gu.nome
    WHEN c.direction = 'outbound'                                              THEN 'time'
    ELSE 'desconhecido'
  END AS autor

FROM comunicacoes c
LEFT JOIN ghl_users gu ON gu.ghl_id = c.usuario_ghl_id;

COMMENT ON VIEW comunicacoes_com_remetente IS
  'comunicacoes enriquecida com dados do remetente e detecção de automação. '
  'Campos extras: remetente_nome, remetente_papeis, remetente_email, is_automatico, autor. '
  'autor: ''lead'' | ''automacao'' | papeis[1] do usuário GHL | nome | ''time'' | ''desconhecido''. '
  'is_automatico: true quando ghl_source IN (''workflow'',''api'',''bot'') ou outbound sem userId.';

NOTIFY pgrst, 'reload schema';
