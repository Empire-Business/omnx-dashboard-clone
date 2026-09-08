# 03 — Modelo de Dados: Empire CRM

> **O que este documento cobre:** O esquema completo do banco de dados — todas as tabelas, todos os campos, relacionamentos, constraints e exemplos. É a planta baixa da "cozinha" do sistema.

---

## O que é um Modelo de Dados?

Pense no banco de dados como um conjunto de planilhas do Excel. Cada tabela é uma planilha, cada coluna é um campo, cada linha é um registro. O modelo de dados define quais planilhas existem, quais colunas cada uma tem, e como elas se relacionam.

**Exemplo concreto:**
```
Tabela "contatos" (como uma planilha):
┌────────────┬──────────────┬─────────────────────┬─────────────────┐
│ id (UUID)  │ nome (TEXT)  │ email (TEXT)         │ telefone (TEXT) │
├────────────┼──────────────┼─────────────────────┼─────────────────┤
│ abc-123    │ João Silva   │ joao@email.com       │ 11999999999     │
│ def-456    │ Maria Costa  │ maria@empresa.com.br │ 21988888888     │
└────────────┴──────────────┴─────────────────────┴─────────────────┘
```

---

## Relacionamentos Entre Tabelas

Antes dos detalhes, veja como as tabelas se conectam:

```
workspaces
    ↓ (1 workspace tem muitos membros)
workspace_members → users (Supabase Auth)

workspaces
    ↓ (1 workspace tem muitos contatos)
contatos
    ↓ (1 contato tem muitas oportunidades)
oportunidades → pipelines → pipeline_stages
    ↓ (1 oportunidade tem muitas comunicações)
comunicacoes
    ↓ (1 oportunidade tem muitas reuniões)
reunioes
    ↓ (1 oportunidade pode ter 1 registro de fechamento)
vendas_fechamento

workspaces
    ↓ (1 workspace tem muitos formulários)
formularios
    ↓ (1 formulário tem muitos campos)
formulario_campos
    ↓ (1 formulário tem muitas submissões)
formulario_submissoes → contatos (cria/atualiza)
                     → oportunidades (cria)

workspaces
    ↓ (1 workspace tem muitas automações)
automacoes
    ↓ (1 automação tem muitos steps)
automacao_steps
    ↓ (1 automação tem muitas execuções)
automacao_execucoes → contatos
```

---

## Tabela 1: `workspaces`

**O que é:** Cada workspace é um "espaço" isolado. Pense como uma empresa dentro do sistema. Todos os dados de um workspace ficam separados dos outros.

```sql
CREATE TABLE workspaces (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  TEXT NOT NULL,               -- "Empire Business"
  slug                  TEXT NOT NULL UNIQUE,        -- "empire-business" (URL-friendly)
  plano                 TEXT DEFAULT 'pro',          -- "free", "pro", "enterprise"
  timezone              TEXT DEFAULT 'America/Sao_Paulo',
  logo_url              TEXT,                        -- URL da logo no Storage
  
  -- Configurações gerais
  whatsapp_default_instance TEXT,                   -- ID da instância UAZAPI padrão
  pipeline_default_id   UUID,                       -- Pipeline padrão para novos leads
  
  -- Controle
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 2: `workspace_members`

**O que é:** Relaciona usuários (pessoas) a workspaces. Um usuário pode estar em vários workspaces.

```sql
CREATE TABLE workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Papel do membro
  role          TEXT NOT NULL DEFAULT 'member',
  -- Valores: "owner" | "admin" | "gerente" | "sdr" | "closer" | "viewer"
  
  -- Permissões granulares (sobrescrevem o role)
  permissions   JSONB DEFAULT '{}',
  -- Exemplo: { "contacts.delete": true, "config": false, "api_keys": true }
  
  -- Filtros de dados (quais leads pode ver)
  data_filters  JSONB DEFAULT '{}',
  -- Exemplo: { "sdr_filter": ["joao@email.com"], "pipeline_filter": [] }
  
  -- Status
  status        TEXT DEFAULT 'active', -- "active" | "invited" | "suspended"
  invited_at    TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ,
  
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
```

---

## Tabela 3: `contatos`

**O que é:** Armazena as pessoas (leads, clientes). Um contato pode ter várias oportunidades (leads). É a tabela mais central do CRM.

```sql
CREATE TABLE contatos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  
  -- Identificador externo (opcional — para importação/migração)
  -- Se você estiver migrando de outro CRM (ex: GHL), pode armazenar o ID original aqui
  -- para cruzar dados durante o período de transição. NÃO é obrigatório para o funcionamento.
  external_id     TEXT,                    -- ID no sistema de origem (ex: GHL, Salesforce)
  
  -- Dados pessoais básicos
  nome            TEXT NOT NULL,
  email           TEXT,
  telefone        TEXT,                    -- Normalizado: só dígitos + DDI
  telefone_raw    TEXT,                    -- Como foi digitado (para auditoria)
  
  -- Dados profissionais
  empresa         TEXT,
  cargo           TEXT,
  website         TEXT,
  
  -- Endereço
  cidade          TEXT,
  estado          TEXT,
  pais            TEXT DEFAULT 'BR',
  
  -- Tags (sistema de classificação)
  tags            TEXT,                    -- CSV: "mql,conectado,sql"
  -- Por que CSV e não array? Compatibilidade com GHL + queries simples
  -- Para verificar: tags ILIKE '%mql%' ou parse_tags(tags)
  
  -- Atribuição (SDR responsável)
  owner_id        TEXT,                    -- ID do usuário responsável
  owner_name      TEXT,                    -- Nome cacheado para exibição rápida
  owner_email     TEXT,
  
  -- Atribuição de tráfego (UTMs)
  utm_source      TEXT,                    -- "facebook", "google", "instagram"
  utm_medium      TEXT,                    -- "cpc", "story", "reels"
  utm_campaign    TEXT,                    -- "cdav-jan-2026"
  utm_term        TEXT,                    -- "M01_O1_P29_CR-248_PG5"
  utm_content     TEXT,                    -- Variação do criativo
  
-- Identificadores de anúncio
   fbclid          TEXT,                    -- Facebook click ID
   gclid           TEXT,                    -- Google click ID
   ttclid          TEXT,                    -- TikTok click ID
   
   -- UTMs raw da Meta Ads (quando houver)
   tt_source       TEXT,
   tt_medium       TEXT,
   tt_campaign     TEXT,
   tt_term         TEXT,
   tt_content      TEXT,
  
  -- Informações de qualificação
  como_nos_conheceu TEXT,                  -- Campo livre de qualificação
  faturamento_anual TEXT,                  -- "até 100k", "100k-500k", "500k+"
  
  -- Dados do formulário de origem
  form_id         UUID REFERENCES formularios(id),  -- Qual form gerou este contato
  form_source     TEXT,                    -- Nome do form (cacheado)
  
  -- Campos de integração
  activecampaign_contact_id TEXT,         -- ID no ActiveCampaign
  
  -- Controle de sync
  last_sync_at    TIMESTAMPTZ,            -- Última sincronização com sistema externo
  attribution_skip BOOLEAN DEFAULT FALSE, -- Evitar re-atribuição automática indevida
  
  -- Campos de qualidade
  lead_quality_score      NUMERIC(5,2),   -- 0-100, calculado pelo sistema
  lead_quality_updated_at TIMESTAMPTZ,
  
  -- Controle
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,            -- Soft delete
  
  -- Constraints
  UNIQUE(workspace_id, email) WHERE email IS NOT NULL AND deleted_at IS NULL,
  UNIQUE(workspace_id, telefone) WHERE telefone IS NOT NULL AND deleted_at IS NULL
);

-- Índices para performance
CREATE INDEX idx_contatos_workspace ON contatos(workspace_id);
CREATE INDEX idx_contatos_telefone ON contatos(workspace_id, telefone);
CREATE INDEX idx_contatos_email ON contatos(workspace_id, email);
CREATE INDEX idx_contatos_tags ON contatos USING gin(to_tsvector('simple', COALESCE(tags, '')));
CREATE INDEX idx_contatos_owner ON contatos(workspace_id, owner_id);
CREATE INDEX idx_contatos_utm_source ON contatos(workspace_id, utm_source);
```

---

## Tabela 3b: `contato_atribuicoes`

**O que é:** Histórico de atribuição de tráfego (UTMs e click IDs) do contato. Cada vez que um contato se cadastra (ou se recadastra) por um formulário/webhook com UTMs, uma nova linha é criada aqui — mesmo que o contato já exista. Isso preserva o histórico completo de cliques, permitindo ver por quais funis e campanhas o contato passou antes de comprar.

**Por que uma tabela separada?** O contato pode se cadastrar múltiplas vezes por funis diferentes. Se sobrescrevêssemos os UTMs a cada novo cadastro, perderíamos o histórico de atribuição. Com esta tabela, cada "clique/cadastro" gera um registro isolado que pode ser auditado e corrigido independentemente.

```sql
CREATE TABLE contato_atribuicoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  contato_id      UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,

  -- Origem desta atribuição
  oportunidade_id UUID REFERENCES oportunidades(id) ON DELETE SET NULL,
  form_id         UUID REFERENCES formularios(id) ON DELETE SET NULL,
  origem          TEXT NOT NULL,
  -- "formulario" | "webhook" | "api" | "importacao_csv" | "edicao_manual"

  -- UTMs padrão
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  utm_term        TEXT,
  utm_content     TEXT,

  -- UTMs raw da Meta Ads
  tt_source       TEXT,
  tt_medium       TEXT,
  tt_campaign     TEXT,
  tt_term         TEXT,
  tt_content      TEXT,

  -- Click IDs
  fbclid          TEXT,
  gclid           TEXT,
  ttclid          TEXT,

  -- URL completa de origem (referrer + query string original)
  landing_url     TEXT,
  referrer        TEXT,

  -- Metadados
  ip_address      TEXT,
  user_agent      TEXT,

  -- É a atribuição "ativa" (mais recente) do contato?
  is_ativa        BOOLEAN DEFAULT FALSE,

  -- Auditoria de edição manual
  editado_por     UUID REFERENCES workspace_members(id),
  editado_em      TIMESTAMPTZ,
  valor_original  JSONB,          -- Snapshot dos campos antes da edição manual
  motivo_edicao   TEXT,           -- Motivo informado pelo usuário ao editar

  -- Controle
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_atribuicoes_contato ON contato_atribuicoes(workspace_id, contato_id);
CREATE INDEX idx_atribuicoes_oportunidade ON contato_atribuicoes(oportunidade_id);
CREATE INDEX idx_atribuicoes_utm_source ON contato_atribuicoes(workspace_id, utm_source);
CREATE INDEX idx_atribuicoes_utm_campaign ON contato_atribuicoes(workspace_id, utm_campaign);
CREATE INDEX idx_atribuicoes_ativa ON contato_atribuicoes(contato_id, is_ativa) WHERE is_ativa = TRUE;
```

**Regras de negócio:**

1. **Nova atribuição sempre cria linha** — Nunca atualiza uma linha existente (exceto edições manuais). Cada submissão de formulário, webhook ou importação gera uma nova linha.

2. **`is_ativa = TRUE` marca a atribuição "atual"** — Quando um contato se recadastra, a atribuição anterior perde `is_ativa` e a nova recebe `is_ativa = TRUE`. Os campos `utm_*` no `contatos` são espelho da atribuição ativa.

3. **Edição manual registra auditoria** — Quando um usuário edita UTMs manualmente, o sistema: salva o valor original em `valor_original`, registra quem editou (`editado_por`), quando (`editado_em`), e o motivo (`motivo_edicao`).

4. **Atribuição ativa espelha no contato** — Sempre que `is_ativa` muda, os campos `utm_*` da tabela `contatos` são atualizados para refletir a atribuição ativa. Isso permite queries simples sem JOIN.

5. **Sempre editável** — Qualquer linha de atribuição pode ser editada manualmente, não só a ativa. O usuário pode corrigir UTMs de um cadastro antigo sem afetar o atual.

---

## Tabela 4: `pipelines`

**O que é:** Define os funis/pipelines de vendas. Cada pipeline tem etapas (stages). Ex: "Pré-Vendas MQL" tem as etapas Novo → Conectado → Qualificado → Agendado.

```sql
CREATE TABLE pipelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  
  nome          TEXT NOT NULL,            -- "Pré-Vendas MQL"
  descricao     TEXT,
  cor           TEXT DEFAULT '#3B82F6',   -- Cor hexadecimal para visual
  icone         TEXT,                     -- Emoji ou nome de ícone
  
  -- Configurações
  is_default    BOOLEAN DEFAULT FALSE,    -- Pipeline padrão para novos leads
  is_recuperacao BOOLEAN DEFAULT FALSE,   -- Marcar como "Recuperação" (exclui de contagens)
  
  -- Ordem de exibição
  ordem         INTEGER DEFAULT 0,
  
  -- Controle
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
```

---

## Tabela 5: `pipeline_stages`

**O que é:** As etapas dentro de um pipeline.

```sql
CREATE TABLE pipeline_stages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  pipeline_id   UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  
  nome          TEXT NOT NULL,            -- "Conectado", "Agendado", "Fechado"
  descricao     TEXT,
  cor           TEXT,
  
  -- Tipo da etapa (para lógica automática)
  tipo          TEXT DEFAULT 'default',
  -- Valores: "entrada" | "conectado" | "qualificado" | "agendado" | 
  --          "reuniao_realizada" | "fechado" | "perdido" | "default"
  
  -- Ordem dentro do pipeline
  ordem         INTEGER NOT NULL DEFAULT 0,
  
  -- Probabilidade de fechamento (para previsão)
  probabilidade INTEGER DEFAULT 0,        -- 0-100%
  
  -- Automações desta etapa
  trigger_automacao_id UUID,              -- Automação disparada ao entrar nesta etapa
  
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 6: `oportunidades`

**O que é:** Cada lead/deal. Um contato pode ter várias oportunidades. É aqui que fica o "estado" do lead no funil.

```sql
CREATE TABLE oportunidades (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  contato_id            UUID NOT NULL REFERENCES contatos(id),
  
  -- Identificador externo (opcional — para importação/migração)
  -- Usado apenas se você importar dados de outro CRM. NÃO é necessário para uso nativo.
  external_id           TEXT,             -- ID no sistema de origem (ex: GHL, Pipedrive)
  
  -- Dados do deal
  titulo                TEXT,            -- Nome descritivo (geralmente nome do contato)
  valor                 NUMERIC(12,2) DEFAULT 0,  -- Valor estimado do deal
  status                TEXT DEFAULT 'open',      -- "open" | "won" | "lost"
  
  -- Localização no pipeline
  pipeline_id           UUID REFERENCES pipelines(id),
  pipeline_stage_id     UUID REFERENCES pipeline_stages(id),
  pipeline_name         TEXT,            -- Cacheado para queries sem JOIN
  stage_name            TEXT,            -- Cacheado para queries sem JOIN
  
  -- Origem
  formulario_id         UUID REFERENCES formularios(id),
  lead_source           TEXT,            -- "form_web", "whatsapp_inbound", "manual", "api"
  
  -- SDR responsável
  sdr_id                TEXT,            -- ID do SDR
  sdr_name              TEXT,            -- Nome cacheado (fonte primária)
  
  -- Closer responsável
  closer_id             TEXT,
  closer_name           TEXT,
  
  -- Datas críticas de pipeline (tipo DATE — sem hora, sem fuso)
  data_lead_recebido    TIMESTAMPTZ,     -- Quando o lead chegou (via API externa)
  data_tentativa_1      DATE,            -- 1ª tentativa de contato
  data_tentativa_2      DATE,
  data_tentativa_3      DATE,
  data_tentativa_4      DATE,
  data_tentativa_5      DATE,
  data_tentativa_6      DATE,
  data_tentativa_7      DATE,
  data_tentativa_8      DATE,
  data_conectado        DATE,            -- Quando o SDR conseguiu contato real
  data_no_show          DATE,            -- Lead agendou mas não apareceu (pré-vendas)
  data_qualificado      DATE,            -- Quando foi qualificado como MQL
  data_perdido          DATE,            -- Quando foi marcado como perdido (pré-vendas)
  data_agendamento_reuniao DATE,         -- Quando a reunião foi agendada
  data_reuniao_agendada DATE,            -- Data da reunião agendada
  data_reuniao_realizada DATE,           -- Data em que a reunião foi realizada
  data_auto_agendamento DATE,            -- Auto-agendamento (Calendly)
  
  -- Datas de vendas (closer)
  data_agendamento_vendas DATE,          -- Quando agendou com o closer
  data_realizacao_vendas  DATE,          -- Quando aconteceu a reunião de vendas
  data_no_show_vendas     DATE,
  data_negociacao         DATE,          -- Em negociação
  data_perdido_vendas     DATE,
  data_pendencias         DATE,          -- Pendências de preenchimento
  data_fechado            DATE,          -- Quando foi marcado como fechado
  data_ultima_atividade   DATE,          -- Última atividade registrada
  
  -- Informações de perda
  motivo_perda            TEXT,          -- "Preço", "Timing", "Concorrência", etc.
  observacoes_perda       TEXT,          -- Texto livre
  
  -- IA e análises
  resumo_ia               TEXT,          -- Resumo automático das conversas
  percepcao_closer        TEXT,          -- Percepção do closer sobre o lead
  
  -- OpenClaw / Contratos externos
  openclaw_notificado_em  TIMESTAMPTZ,
  openclaw_ultimo_status  TEXT,
  
  -- Soft delete (similar a contatos — oportunidades perdidas ficam para relatórios)
  deleted_at              TIMESTAMPTZ,            -- Soft delete: NULL = ativa, preenchido = "lixeira"
  
  -- Controle
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Índices críticos
CREATE INDEX idx_opps_workspace ON oportunidades(workspace_id);
CREATE INDEX idx_opps_contato ON oportunidades(contato_id);
CREATE INDEX idx_opps_pipeline ON oportunidades(workspace_id, pipeline_id);
CREATE INDEX idx_opps_stage ON oportunidades(workspace_id, pipeline_stage_id);
CREATE INDEX idx_opps_data_lead ON oportunidades(workspace_id, data_lead_recebido);
CREATE INDEX idx_opps_data_fechado ON oportunidades(workspace_id, data_fechado);
CREATE INDEX idx_opps_sdr ON oportunidades(workspace_id, sdr_name);
```

---

## Tabela 6b: `conversas`

**O que é:** Agrupa mensagens de um mesmo contato em uma conversa contínua. Sem esta tabela, o inbox não consegue saber qual conversa exibir, qual a última mensagem, nem se a janela de 24h do WhatsApp está aberta. Cada conversa pertence a um contato, um canal e (opcionalmente) uma oportunidade.

```sql
CREATE TABLE conversas (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID NOT NULL REFERENCES workspaces(id),
  contato_id                UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  oportunidade_id           UUID REFERENCES oportunidades(id) ON DELETE SET NULL,

  -- Canal principal desta conversa
  canal                     TEXT NOT NULL,  -- 'whatsapp' | 'email' | 'sms' | 'instagram' | 'facebook'

  -- SDR responsável pela conversa (pode ser transferido)
  atribuido_a               UUID REFERENCES workspace_members(id),

  -- Status da conversa
  status                    TEXT DEFAULT 'aberta',  -- 'aberta' | 'aguardando' | 'resolvida'

  -- Indicadores rápidos (evitam queries pesadas no inbox)
  ultima_mensagem_em        TIMESTAMPTZ,    -- data/hora da última mensagem (qualquer direção)
  ultima_mensagem_inbound_em TIMESTAMPTZ,   -- data/hora da última mensagem do LEAD (para SLA)
  ultima_mensagem_preview    TEXT,           -- primeiros 100 caracteres da última mensagem
  nao_lidas                 INTEGER DEFAULT 0,  -- contagem de mensagens inbound não lidas pelo SDR

  -- Janela de 24h do WhatsApp (Meta Cloud API)
  janela_24h_expira_em      TIMESTAMPTZ,    -- ultima_mensagem_inbound_em + 24h (somente WhatsApp)

  -- Instância/SDR IA que está atendendo (para modo SDR IA)
  sdr_ia_ativo              BOOLEAN DEFAULT FALSE,
  sdr_ia_pausado_por        UUID REFERENCES workspace_members(id),  -- quem pausou

  -- Controle
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW(),

  -- Uma conversa ativa por contato + canal (ou abertamente filtrável)
  UNIQUE(workspace_id, contato_id, canal, status) WHERE status = 'aberta'
);

CREATE INDEX idx_conversas_workspace ON conversas(workspace_id);
CREATE INDEX idx_conversas_contato ON conversas(contato_id);
CREATE INDEX idx_conversas_atribuido ON conversas(workspace_id, atribuido_a);
CREATE INDEX idx_conversas_status ON conversas(workspace_id, status);
CREATE INDEX idx_conversasUltima ON conversas(workspace_id, ultima_mensagem_em DESC);
```

**Regras de negócio:**

1. **Uma conversa aberta por contato+canal:** Um contato pode ter apenas uma conversa `aberta` por canal. Mensagens novas em um canal com conversa `aberta` são adicionadas a essa conversa. Se a conversa foi `resolvida`, uma nova mensagem reabre ou cria nova conversa.

2. **Janela de 24h:** Para conversas de WhatsApp (`canal = 'whatsapp'`), `janela_24h_expira_em` é calculada automaticamente quando `ultima_mensagem_inbound_em` é atualizada. A UI desabilita texto livre após a expiração e só permite templates HSM.

3. **Contador de não lidas:** A coluna `nao_lidas` é atualizada via trigger每当 uma mensagem `inbound` é inserida em `comunicacoes` sem que o SDR tenha visualizado a conversa. Quando o SDR abre a conversa, o contador é zerado.

4. **Transferência de conversa:** Quando `atribuido_a` muda, o sistema registra no `activity_log` quem transferiu para quem.

---

## Tabela 7: `comunicacoes`

**O que é:** Armazena todas as mensagens e ligações trocadas com os leads, independente do canal (WhatsApp, SMS, Email, Call).

```sql
CREATE TABLE comunicacoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  contato_id            UUID REFERENCES contatos(id),
  oportunidade_id       UUID REFERENCES oportunidades(id),
  
  -- Identificação da mensagem no sistema externo (para deduplicação)
  external_message_id   TEXT UNIQUE,     -- ID no WhatsApp, Email, etc.
  external_conv_id      TEXT,            -- ID da conversa/thread
  
  -- Tipo e canal
  tipo                  TEXT NOT NULL,   -- "mensagem" | "ligacao" | "nota"
  canal                 TEXT NOT NULL,   -- "whatsapp" | "sms" | "email" | "call" | "instagram" | "facebook"
  direction             TEXT NOT NULL,   -- "inbound" (lead → SDR) | "outbound" (SDR → lead)
  
  -- Conteúdo da mensagem
  mensagem_body         TEXT,            -- Texto da mensagem
  mensagem_subject      TEXT,            -- Assunto (apenas email)
  attachments           JSONB,           -- Array: [{ url, type, name, size }]
  
  -- Metadata
  data_comunicacao      TIMESTAMPTZ NOT NULL,  -- Quando a mensagem foi enviada/recebida
  
  -- SDR que enviou (outbound)
  usuario_id            TEXT,            -- ID do usuário que enviou
  usuario_nome          TEXT,            -- Nome cacheado
  
  -- Dados específicos de ligação
  phone_call_from       TEXT,
  phone_call_to         TEXT,
  phone_call_duration   INTEGER,         -- Em segundos
  phone_call_status     TEXT,            -- "completed" | "failed" | "no_answer" | "busy"
  phone_call_recording  TEXT,            -- URL da gravação
  
  -- Dados cacheados do contato (para queries sem JOIN)
  contato_nome          TEXT,
  contato_email         TEXT,
  contato_telefone      TEXT,
  sdr_name              TEXT,
  
  -- Status de entrega (WhatsApp)
  delivery_status       TEXT,            -- "sent" | "delivered" | "read" | "failed"
  delivered_at          TIMESTAMPTZ,
  read_at               TIMESTAMPTZ,
  
  -- Nota interna (tipo="nota")
  nota_privada          BOOLEAN DEFAULT FALSE,  -- Visível apenas para a equipe
  
  -- Controle
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Relacionamento com conversa
  conversa_id              UUID REFERENCES conversas(id) ON DELETE SET NULL,

  -- Índices
CREATE INDEX idx_comunicacoes_workspace ON comunicacoes(workspace_id);
CREATE INDEX idx_comunicacoes_contato ON comunicacoes(contato_id);
CREATE INDEX idx_comunicacoes_data ON comunicacoes(workspace_id, data_comunicacao DESC);
CREATE INDEX idx_comunicacoes_canal ON comunicacoes(workspace_id, canal);
CREATE INDEX idx_comunicacoes_direction ON comunicacoes(workspace_id, direction);
CREATE INDEX idx_comunicacoes_conversa ON comunicacoes(conversa_id);
CREATE UNIQUE INDEX idx_comunicacoes_external_id ON comunicacoes(external_message_id) 
  WHERE external_message_id IS NOT NULL;
```

**Nota sobre `conversa_id`:** Toda mensagem pertence a uma conversa. Quando uma mensagem chega via webhook, a edge function busca a conversa aberta daquele contato+canal. Se existir, vincula a mensagem. Se não, cria a conversa primeiro.

---

## Tabela 8: `reunioes`

**O que é:** Reuniões agendadas (via Calendly ou manual). Separadas de `comunicacoes` porque têm campos específicos de agendamento.

```sql
CREATE TABLE reunioes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  contato_id            UUID REFERENCES contatos(id),
  oportunidade_id       UUID REFERENCES oportunidades(id),
  
  -- Identificação externa (Calendly, etc.)
  external_appointment_id TEXT UNIQUE,
  
  -- Dados da reunião
  titulo                TEXT,
  notas                 TEXT,
  
  -- Responsável
  usuario_id            TEXT,
  usuario_nome          TEXT,
  
  -- Datas
  data_agendada         TIMESTAMPTZ NOT NULL,  -- Quando está marcada
  data_realizada        TIMESTAMPTZ,           -- Quando efetivamente aconteceu
  duracao_minutos       INTEGER,
  
  -- Status
  status                TEXT DEFAULT 'agendada',
  -- "agendada" | "realizada" | "cancelada" | "no_show" | "reagendada"
  
  -- Link da reunião
  link_reuniao          TEXT,            -- Zoom, Google Meet, etc.
  link_gravacao         TEXT,            -- URL da gravação
  
  -- Controle
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 9: `vendas_fechamento`

**O que é:** Dados financeiros e contratuais de um deal fechado. Uma oportunidade só é considerada "venda" quando tem `data_pagamento_entrada` preenchida.

```sql
CREATE TABLE vendas_fechamento (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  oportunidade_id       UUID NOT NULL REFERENCES oportunidades(id),
  contato_id            UUID NOT NULL REFERENCES contatos(id),
  
  -- Produto e observações
  produto_vendido       TEXT,
  observacoes_venda     TEXT,
  
  -- Dados financeiros
  forma_pagamento       TEXT,            -- "pix", "credito", "boleto"
  valor_entrada         NUMERIC(12,2),   -- Valor de entrada/sinal
  numero_parcelas       INTEGER,         -- Número de parcelas
  valor_parcela         NUMERIC(12,2),   -- Valor de cada parcela
  valor_faturado        NUMERIC(12,2) GENERATED ALWAYS AS (
    COALESCE(valor_entrada, 0) + 
    COALESCE(numero_parcelas, 0) * COALESCE(valor_parcela, 0)
  ) STORED,                              -- Calculado automaticamente
  op_vencimentos_parcelas TEXT,          -- Datas de vencimento (texto livre)
  
  -- Datas de pagamento
  data_pagamento_entrada TIMESTAMPTZ,   -- ← CRÍTICO: define se é "venda fechada"
  
  -- Dados do contratante
  nome_contratante      TEXT,
  cpf_cnpj_contratante  TEXT,
  logradouro            TEXT,
  numero_endereco       TEXT,
  complemento           TEXT,
  bairro                TEXT,
  municipio             TEXT,
  estado_uf             TEXT,
  cep                   TEXT,
  
  -- Contrato
  op_link_contrato_assinado TEXT,        -- URL do contrato assinado
  data_assinatura_contrato  DATE,
  link_gravacao_call_vendas TEXT,        -- URL da gravação da call de vendas
  
  -- Controle
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(oportunidade_id)
);
```

---

## Tabela 8a: `activity_log`

**O que é:** Registro imutável de todas as ações que acontecem no sistema — mudanças de stage, adições de tag, criação de oportunidades, transfers de conversa, etc. Alimenta a timeline do lead card e o audit log de uma vez só.

```sql
CREATE TABLE activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),

  -- Entidade afetada (polimórfico)
  entidade_tipo   TEXT NOT NULL,  -- 'contato' | 'oportunidade' | 'conversa' | 'tarefa' | 'reuniao'
  entidade_id     UUID NOT NULL,  -- ID da entidade

  -- Quem fez a ação
  autor_id        UUID REFERENCES workspace_members(id),
  autor_tipo      TEXT DEFAULT 'humano',  -- 'humano' | 'sistema' | 'ia'

  -- O que aconteceu
  acao            TEXT NOT NULL,   -- 'stage_mudou' | 'tag_adicionada' | 'tag_removida' | 'criado'
                                   -- 'oportunidade_criada' | 'conversa_transferida' | 'tarefa_concluida'
                                   -- 'reuniao_agendada' | 'nota_adicionada' | 'atribuido' | 'handoff'
  dados_anteriores JSONB,         -- { stage_name: 'Novo Lead' }
  dados_novos      JSONB,         -- { stage_name: 'Conectado' }

  -- Contexto (opcional)
  contexto        JSONB,          -- { pipeline_name: 'Pré-Vendas', via: 'kanban' }

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activity_log_workspace ON activity_log(workspace_id);
CREATE INDEX idx_activity_log_entidade ON activity_log(entidade_tipo, entidade_id);
CREATE INDEX idx_activity_log_autor ON activity_log(workspace_id, autor_id);
CREATE INDEX idx_activity_log_data ON activity_log(workspace_id, created_at DESC);
```

**Regras de negócio:**

1. **Imutável:** Registros de `activity_log` nunca são alterados ou deletados. Funciona como um append-only log.
2. **Polimórfico:** A mesma tabela serve para qualquer entidade. Uma mudança de stage gera `{ entidade_tipo: 'oportunidade', acao: 'stage_mudou', dados_anteriores: { stage: 'Novo' }, dados_novos: { stage: 'Conectado' } }`.
3. **Alimenta a timeline:** A seção "Timeline de Atividades" no perfil do contato e no lead card consulta esta tabela filtrando por `entidade_id = contato_id OR oportunidade_id`.
4. **Alimenta o audit log:** A seção de auditoria do workspace consulta esta tabela filtrando por `workspace_id` e opcionalmente `autor_id`.

---

## Tabela 8b: `tarefas`

**O que é:** Tarefas vinculadas a contatos e/ou oportunidades — follow-ups, ligações, emails, reuniões. Pode ser criada manualmente ou automaticamente por automações.

```sql
CREATE TABLE tarefas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  contato_id        UUID REFERENCES contatos(id) ON DELETE SET NULL,
  oportunidade_id   UUID REFERENCES oportunidades(id) ON DELETE SET NULL,
  conversa_id       UUID REFERENCES conversas(id) ON DELETE SET NULL,

  -- Quem criou e a quem foi atribuída
  criado_por        UUID NOT NULL REFERENCES workspace_members(id),
  atribuido_a       UUID REFERENCES workspace_members(id),

  -- Tipo e conteúdo
  tipo              TEXT NOT NULL DEFAULT 'tarefa',  -- 'ligar' | 'mensagem' | 'email' | 'reuniao' | 'nota' | 'tarefa'
  titulo            TEXT NOT NULL,
  descricao         TEXT,

  -- Prazo e lembrete
  prazo             TIMESTAMPTZ,
  lembrete_em       TIMESTAMPTZ,

  -- Status
  status            TEXT DEFAULT 'pendente',  -- 'pendente' | 'em_progresso' | 'concluida' | 'cancelada'
  prioridade        TEXT DEFAULT 'normal',    -- 'baixa' | 'normal' | 'alta' | 'urgente'
  concluida_em      TIMESTAMPTZ,
  concluida_por     UUID REFERENCES workspace_members(id),

  -- Contexto automático (se criada por automação)
  automacao_id      UUID REFERENCES automacoes(id),

  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tarefas_workspace ON tarefas(workspace_id);
CREATE INDEX idx_tarefas_atribuido ON tarefas(workspace_id, atribuido_a);
CREATE INDEX idx_tarefas_contato ON tarefas(contato_id);
CREATE INDEX idx_tarefas_oportunidade ON tarefas(oportunidade_id);
CREATE INDEX idx_tarefas_prazo ON tarefas(workspace_id, prazo) WHERE status = 'pendente';
CREATE INDEX idx_tarefas_status ON tarefas(workspace_id, status);
```

**Regras de negócio:**

1. **Vinculação flexível:** Uma tarefa pode ser vinculada a um contato, uma oportunidade, ou ambos. Tarefas de follow-up são vinculadas ao contato E à oportunidade. Tarefas genéricas podem não ter nenhum dos dois.
2. **Auto-criação:** Quando um SDR registra uma tentativa de contato, o sistema pode criar automaticamente uma tarefa "Ligar" para o próximo dia. Quando uma oportunidade é movida para "Agendado", o sistema sugere criar uma tarefa de acompanhamento.
3. **Painel de atividades:** A tela central de atividades mostra tarefas agrupadas: "Hoje", "Amanhã", "Atrasadas" (prazo < agora E status = pendente).
4. **Conclusão automática:** Quando uma tarefa do tipo "ligar" é completada porque o SDR faz uma ligação, ou quando uma tarefa de "email" é completada porque o SDR envia um email pelo inbox, o sistema marca automaticamente como concluída.

---

## Tabela 9: `formularios`

**O que é:** Os formulários de captura de leads criados no Form Builder.

```sql
CREATE TABLE formularios (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id          UUID NOT NULL REFERENCES workspaces(id),
  
  nome                  TEXT NOT NULL,         -- "Formulário CDAV Janeiro"
  descricao             TEXT,
  slug                  TEXT NOT NULL UNIQUE,  -- URL: /f/cdav-janeiro (embed)
  
  -- Configurações de lead
  pipeline_id           UUID REFERENCES pipelines(id),    -- Pipeline destino
  stage_id              UUID REFERENCES pipeline_stages(id), -- Stage inicial
  tags_iniciais         TEXT,                  -- Tags adicionadas automaticamente
  owner_id              TEXT,                  -- SDR que recebe o lead
  
  -- Configurações de redirect
  redirect_url          TEXT,                  -- URL após submissão
  mensagem_sucesso      TEXT,                  -- Mensagem exibida após submissão
  
  -- Configurações técnicas
  allow_duplicates      BOOLEAN DEFAULT FALSE, -- Permitir duplicatas?
  notify_owner          BOOLEAN DEFAULT TRUE,  -- Notificar SDR?
  notify_email          TEXT,                  -- Email adicional para notificação
  
  -- Status
  status                TEXT DEFAULT 'active', -- "active" | "inactive" | "archived"
  
  -- Estatísticas (cacheadas)
  total_submissoes      INTEGER DEFAULT 0,
  
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 11: `formulario_campos`

**O que é:** Os campos de cada formulário.

```sql
CREATE TABLE formulario_campos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  formulario_id   UUID NOT NULL REFERENCES formularios(id) ON DELETE CASCADE,
  
  -- Identificação
  nome_interno    TEXT NOT NULL,      -- "telefone" (nome técnico, sem espaços)
  label           TEXT NOT NULL,      -- "Seu telefone" (exibido para o usuário)
  placeholder     TEXT,              -- Texto de exemplo no campo
  
  -- Tipo do campo
  tipo            TEXT NOT NULL,
  -- "text" | "email" | "phone" | "number" | "select" | "multiselect"
  -- "textarea" | "checkbox" | "date" | "hidden" | "utm" | "heading" | "divider"
  
  -- Opções (para select/multiselect)
  opcoes          JSONB,             -- [{ label: "Opção 1", value: "opcao_1" }]
  
  -- Mapeamento para campo do contato/oportunidade
  campo_destino   TEXT,              -- "contato.nome" | "contato.utm_source" | "oportunidade.valor"
  
  -- Validações
  obrigatorio     BOOLEAN DEFAULT FALSE,
  validacao_regex TEXT,              -- Regex de validação (ex: telefone)
  
  -- Visibilidade
  visivel         BOOLEAN DEFAULT TRUE,
  readonly        BOOLEAN DEFAULT FALSE,
  valor_padrao    TEXT,              -- Valor pré-preenchido
  
  -- Layout
  ordem           INTEGER NOT NULL DEFAULT 0,
  largura         TEXT DEFAULT 'full', -- "full" | "half"
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 12: `formulario_submissoes`

**O que é:** Log de cada submissão de formulário. Mesmo após criar o contato/oportunidade, guardamos a submissão original.

```sql
CREATE TABLE formulario_submissoes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  formulario_id     UUID NOT NULL REFERENCES formularios(id),
  
  -- Referências ao que foi criado
  contato_id        UUID REFERENCES contatos(id),
  oportunidade_id   UUID REFERENCES oportunidades(id),
  
  -- Dados brutos da submissão
  dados             JSONB NOT NULL,   -- { nome: "João", email: "...", utm_source: "fb" }
  
  -- Metadata
  ip_address        TEXT,
  user_agent        TEXT,
  referrer          TEXT,
  
  -- Status
  status            TEXT DEFAULT 'processed',
  -- "processed" | "duplicate" | "error" | "pending"
  
  error_message     TEXT,            -- Se status="error"
  
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 13: `webhooks_raw`

**O que é:** Auditoria imutável de todos os webhooks recebidos de **sistemas externos** (WhatsApp, Calendly, Hotmart, etc.). É o princípio raw-first: salvar o dado bruto antes de processar.

**Importante:** Esta tabela NÃO é usada para formulários ou chamadas da API pública — esses dados chegam já estruturados e vão direto para as tabelas de negócio (`contatos`, `oportunidades`). Esta tabela é exclusivamente para webhooks de sistemas de terceiros.

**NUNCA alterar ou deletar registros desta tabela.** Se um processamento falhou, pode ser refeito a partir do payload original.

```sql
CREATE TABLE webhooks_raw (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID REFERENCES workspaces(id),  -- Pode ser NULL se não identificado
  
  -- Origem do webhook
  source        TEXT NOT NULL,
  -- Valores: "whatsapp_uazapi" | "whatsapp_official" | "activecampaign"
  --          "calendly" | "hotmart" | "custom"
  instance_id   TEXT,                 -- Instância UAZAPI ou similar
  
  -- Payload bruto (imutável)
  payload       JSONB NOT NULL,
  headers       JSONB,                -- Headers HTTP recebidos
  
  -- Processamento
  processado    BOOLEAN DEFAULT FALSE,
  processado_em TIMESTAMPTZ,
  erro          TEXT,                 -- Se falhou no processamento
  
  -- Controle
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- REGRAS desta tabela:
-- 1. NUNCA alterar o campo "payload" após inserção (imutável)
-- 2. NUNCA deletar registros (auditoria permanente)
-- 3. Só atualizar "processado" e "erro" após processar
-- 4. Esta tabela NÃO substitui as tabelas de negócio — é apenas auditoria
```

---

## Tabela 14: `webhooks_outbound`

**O que é:** Webhooks configurados para enviar dados para sistemas externos quando eventos acontecem.

```sql
CREATE TABLE webhooks_outbound (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  
  nome          TEXT NOT NULL,        -- "Notificar sistema X"
  url           TEXT NOT NULL,        -- URL destino
  secret        TEXT,                 -- Secret para assinar o payload (HMAC SHA-256)
  
  -- Eventos que disparam este webhook
  eventos       JSONB NOT NULL,
  -- ["contato.criado", "oportunidade.atualizada", "mensagem.recebida"]
  
  -- Configurações
  ativo         BOOLEAN DEFAULT TRUE,
  max_retries   INTEGER DEFAULT 5,
  timeout_ms    INTEGER DEFAULT 10000,
  
  -- Filtros (opcional — só dispara se condição for verdadeira)
  filtros       JSONB,
  -- { pipeline_id: "uuid", tags: ["mql"] }
  
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 15: `webhooks_outbound_logs`

**O que é:** Histórico de cada tentativa de entrega de webhook.

```sql
CREATE TABLE webhooks_outbound_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id      UUID NOT NULL REFERENCES webhooks_outbound(id),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  
  -- O que aconteceu
  evento          TEXT NOT NULL,       -- "contato.criado"
  payload         JSONB NOT NULL,      -- Payload que foi enviado
  
  -- Resposta
  status_http     INTEGER,             -- 200, 404, 500...
  response_body   TEXT,               -- Corpo da resposta
  response_ms     INTEGER,            -- Tempo de resposta
  
  -- Status da tentativa
  status          TEXT DEFAULT 'pending',
  -- "pending" | "success" | "failed" | "retrying"
  
  -- Retry
  tentativa       INTEGER DEFAULT 1,
  proxima_tentativa TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 16: `api_keys`

**O que é:** Chaves de API para acesso programático ao Empire CRM.

```sql
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  
  nome          TEXT NOT NULL,         -- "Integração Site Principal"
  key_hash      TEXT NOT NULL UNIQUE,  -- Hash SHA-256 da chave (nunca armazenar plaintext)
  key_prefix    TEXT NOT NULL,         -- Prefixo visível: "emp_live_xxxxx"
  
  -- Permissões
  scopes        JSONB DEFAULT '["read", "write"]',
  -- ["read"] | ["write"] | ["read", "write"] | ["webhook"] | ["admin"]
  
  -- Controle
  ativa         BOOLEAN DEFAULT TRUE,
  ultimo_uso    TIMESTAMPTZ,
  expira_em     TIMESTAMPTZ,           -- NULL = nunca expira
  
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID REFERENCES auth.users(id)
);
```

---

## Tabela 17: `automacoes`

**O que é:** Workflows automatizados (ex: "quando lead criar, enviar WhatsApp de boas-vindas").

```sql
CREATE TABLE automacoes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  
  nome            TEXT NOT NULL,
  descricao       TEXT,
  
  -- Trigger (o que dispara)
  trigger_tipo    TEXT NOT NULL,
  -- "contato.criado" | "oportunidade.criada" | "tag.adicionada"
  -- "stage.mudou" | "mensagem.recebida" | "formulario.submetido"
  -- "agendamento.criado" | "webhook.recebido" | "data.relativa"
  
  trigger_config  JSONB,              -- Configuração específica do trigger
  
  -- Filtros (só dispara se condição verdadeira)
  condicoes       JSONB,              -- { pipeline_id: "...", tags_tem: ["mql"] }
  
  -- Status
  ativo           BOOLEAN DEFAULT FALSE,
  pausada         BOOLEAN DEFAULT FALSE,
  
  -- Estatísticas
  total_execucoes INTEGER DEFAULT 0,
  total_erros     INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 18: `automacao_steps`

**O que é:** Os passos de uma automação (cada ação que ela executa).

```sql
CREATE TABLE automacao_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  automacao_id    UUID NOT NULL REFERENCES automacoes(id) ON DELETE CASCADE,
  
  -- Posição
  ordem           INTEGER NOT NULL,
  tipo            TEXT NOT NULL,
  -- "enviar_mensagem" | "adicionar_tag" | "remover_tag"
  -- "mover_stage" | "notificar_usuario" | "aguardar"
  -- "chamar_webhook" | "activecampaign_add" | "condicao"
  
  -- Configuração do step
  config          JSONB NOT NULL,
  -- Para "enviar_mensagem": { canal: "whatsapp", template_id: "...", mensagem: "Olá {{nome}}" }
  -- Para "aguardar": { horas: 24 }
  -- Para "adicionar_tag": { tags: ["mql", "conectado"] }
  -- Para "condicao": { campo: "tags", operador: "contem", valor: "mql" }
  
  -- Branches (para steps de condição)
  proximo_step_sim  UUID REFERENCES automacao_steps(id),
  proximo_step_nao  UUID REFERENCES automacao_steps(id),
  
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Tabela 19: `tags` (Catálogo)

**O que é:** Catálogo de tags disponíveis por workspace. As tags em `contatos.tags` são CSVs, mas o catálogo permite gerenciar quais tags existem.

```sql
CREATE TABLE tags (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  
  nome          TEXT NOT NULL,          -- "mql"
  label         TEXT NOT NULL,          -- "MQL - Qualificado" (nome amigável)
  cor           TEXT DEFAULT '#6B7280', -- Cor da tag na UI
  descricao     TEXT,
  
  -- Sistema vs customizada
  sistema       BOOLEAN DEFAULT FALSE,  -- Tags do sistema (mql, conectado, sql) não podem ser deletadas
  
  UNIQUE(workspace_id, nome),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Tags padrão (inseridas automaticamente ao criar workspace):
-- { nome: "mql", label: "MQL", sistema: true }
-- { nome: "conectado", label: "Conectado", sistema: true }
-- { nome: "sql", label: "SQL", sistema: true }
-- { nome: "no-show", label: "No-show", sistema: true }
```

---

## Tabela 20: `custom_fields`

**O que é:** Campos personalizados por workspace. Permite adicionar campos além dos padrões (ex: "Faturamento Anual", "Objetivo Principal").

```sql
CREATE TABLE custom_fields (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  
  entidade      TEXT NOT NULL,        -- "contato" | "oportunidade"
  nome          TEXT NOT NULL,        -- "faturamento_anual"
  label         TEXT NOT NULL,        -- "Faturamento Anual"
  
  tipo          TEXT NOT NULL,
  -- "text" | "number" | "date" | "select" | "multiselect" | "boolean" | "url"
  
  opcoes        JSONB,               -- Para select: [{ label, value }]
  obrigatorio   BOOLEAN DEFAULT FALSE,
  ordem         INTEGER DEFAULT 0,
  
  UNIQUE(workspace_id, entidade, nome),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE custom_field_values (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id),
  entidade_id     UUID NOT NULL,      -- ID do contato ou oportunidade
  valor           TEXT,               -- Armazenado como texto, interpretado conforme tipo
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(custom_field_id, entidade_id)
);
```

---

## Tabela 21: `meta_ads_insights`

**O que é:** Dados de performance dos anúncios Meta (Facebook/Instagram). Alimentados pela sincronização com a API do Meta Ads.

```sql
CREATE TABLE meta_ads_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  
  -- Identificadores Meta
  account_id      TEXT NOT NULL,
  campaign_id     TEXT NOT NULL,
  adset_id        TEXT NOT NULL,
  ad_id           TEXT NOT NULL,
  
  -- Período
  date            DATE NOT NULL,
  hour            INTEGER,             -- 0-23 (NULL se dado diário)
  
  -- Nomes (cacheados)
  campaign_name   TEXT,
  adset_name      TEXT,
  ad_name         TEXT,
  
  -- Métricas
  spend           NUMERIC(12,4),       -- Gasto em moeda local
  impressions     INTEGER,
  clicks          INTEGER,
  reach           INTEGER,
  frequency       NUMERIC(6,4),
  ctr             NUMERIC(8,6),        -- Click-through rate
  cpc             NUMERIC(10,4),       -- Custo por clique
  cpm             NUMERIC(10,4),       -- Custo por mil impressões
  
  -- Conversões
  actions         JSONB,               -- Array de ações por tipo
  conversions     JSONB,               -- Array de conversões
  cost_per_action JSONB,               -- CPA por tipo de ação
  
  -- Controle
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(workspace_id, ad_id, date, hour)
);
```

---

## Tabela 22: `metas`

**O que é:** Metas/OKRs do negócio. Permitem acompanhar se os objetivos estão sendo batidos.

```sql
CREATE TABLE metas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspaces(id),
  
  -- Definição
  nome            TEXT NOT NULL,       -- "Meta MQL Março"
  metrica         TEXT NOT NULL,       -- "mql_count" | "cpmql" | "vendas" | "faturamento"
  
  -- Alvo
  valor_meta      NUMERIC(12,2) NOT NULL,
  
  -- Período
  periodo_inicio  DATE NOT NULL,
  periodo_fim     DATE NOT NULL,
  
  -- Segmentação (opcional)
  sdr_id          TEXT,                -- Meta específica de um SDR
  canal           TEXT,                -- Meta de um canal específico
  funil           TEXT,                -- Meta de um funil específico
  
  -- Status calculado (atualizado periodicamente)
  valor_atual     NUMERIC(12,2),
  status          TEXT,                -- "no_track" | "at_risk" | "off_track" | "achieved"
  ultima_atualizacao TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Relações — Diagrama Resumido

```
workspaces
│
├─── workspace_members (N) ──── auth.users
│
├─── contatos (N)
│     ├─── oportunidades (N)
│     │     ├─── comunicacoes (N)
│     │     ├─── reunioes (N)
│     │     ├─── vendas_fechamento (1)
│     │     ├─── tarefas (N)
│     │     └─── activity_log (N)
│     ├─── contato_atribuicoes (N)    ← histórico de UTMs/clicks
│     ├─── comunicacoes (N)
│     ├─── conversas (N)              ← agrupa mensagens por contato+canal
│     └─── tarefas (N)
│
├─── pipelines (N)
│     └─── pipeline_stages (N)
│
├─── formularios (N)
│     ├─── formulario_campos (N)
│     └─── formulario_submissoes (N)
│
├─── automacoes (N)
│     └─── automacao_steps (N)
│
├─── webhooks_outbound (N)
│     └─── webhooks_outbound_logs (N)
│
├─── api_keys (N)
├─── tags (N)
├─── custom_fields (N)
│     └─── custom_field_values (N)
│
├─── meta_ads_insights (N)
├─── activity_log (N)                 ← timeline + audit unificado
├─── conversas (N)                    ← inbox: agrupa mensagens
├─── tarefas (N)                      ← follow-ups, ligações, etc.
├─── email_templates (N)             ← templates de email (AC + nativos)
├─── processing_queue (N)            ← fila de jobs assíncronos
└─── idempotency_keys (N)            ← chaves de idempotência da API
```
workspaces
│
├─── workspace_members (N) ──── auth.users
│
├─── contatos (N)
│     ├─── oportunidades (N)
 │     │     ├─── comunicacoes (N)
 │     │     ├─── reunioes (N)
 │     │     └─── vendas_fechamento (1)
 │     ├─── contato_atribuicoes (N)    ← histórico de UTMs/clicks
 │     └─── comunicacoes (N)
│
├─── pipelines (N)
│     └─── pipeline_stages (N)
│
├─── formularios (N)
│     ├─── formulario_campos (N)
│     └─── formulario_submissoes (N)
│
├─── automacoes (N)
│     └─── automacao_steps (N)
│
├─── webhooks_outbound (N)
│     └─── webhooks_outbound_logs (N)
│
├─── api_keys (N)
├─── tags (N)
├─── custom_fields (N)
│     └─── custom_field_values (N)
│
└─── meta_ads_insights (N)
```

---

*Próximo: [04 — Módulo Contatos](./04-MODULO-CONTATOS.md)*
