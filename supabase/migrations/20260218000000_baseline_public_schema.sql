-- ============================================================================
-- BASELINE RE-ENTRANTE DO SCHEMA PUBLIC (Fase 0.7)
-- Gerado por scripts/build-baseline-full.sh a partir do dump de producao.
-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS / guard de constraint).
-- Ordem: schema -> tabelas -> sequences -> constraints -> funcoes -> views ->
--        indices -> gatilhos -> policies -> comentarios -> grants.
-- NAO aplicar em producao fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================
SET search_path = public, pg_catalog;
SET check_function_bodies = false;

-- Schema

CREATE SCHEMA IF NOT EXISTS public;

-- Tabelas

CREATE TABLE IF NOT EXISTS public.ghl_api_jobs (
    id bigint NOT NULL,
    url text NOT NULL,
    method text DEFAULT 'GET'::text NOT NULL,
    body jsonb,
    priority integer DEFAULT 5 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 4 NOT NULL,
    result jsonb,
    error text,
    caller text,
    idempotency_key text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    next_retry_at timestamp with time zone DEFAULT now() NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    claimed_at timestamp with time zone,
    handled_at timestamp with time zone,
    CONSTRAINT ghl_api_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text])))
);
CREATE TABLE IF NOT EXISTS public.ads_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    objective_code text,
    objective_name text,
    page_name text,
    campaign_date date,
    code text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ads_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    month_number integer,
    objective_name text,
    objective_code text,
    public_name text,
    public_code text,
    utm_source text,
    creative_id text,
    page_name text,
    page_code text,
    utm_campaign_number integer,
    utm_medium_name text,
    utm_medium_number integer,
    utm_term text,
    url text,
    shortened_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ads_catalog_month_number_check CHECK (((month_number >= 1) AND (month_number <= 12)))
);
CREATE TABLE IF NOT EXISTS public.ai_analysis_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text DEFAULT 'service'::text NOT NULL,
    question text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    collected_data jsonb DEFAULT '[]'::jsonb NOT NULL,
    status text DEFAULT 'collecting'::text NOT NULL,
    final_answer text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    CONSTRAINT ai_analysis_sessions_status_check CHECK ((status = ANY (ARRAY['collecting'::text, 'done'::text, 'failed'::text])))
);
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    role text NOT NULL,
    content text NOT NULL,
    tokens_used integer,
    model_used text,
    relevant_docs jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);
CREATE TABLE IF NOT EXISTS public.ai_doc_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_path text NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    embedding public.vector(384),
    token_count integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    title text DEFAULT ''::text NOT NULL,
    fts tsvector DEFAULT to_tsvector('portuguese'::regconfig, ''::text) NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ai_doc_index_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    doc_path text NOT NULL,
    file_hash text NOT NULL,
    last_indexed_at timestamp with time zone DEFAULT now() NOT NULL,
    chunk_count integer DEFAULT 0,
    status text DEFAULT 'indexed'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ai_doc_index_status_status_check CHECK ((status = ANY (ARRAY['indexed'::text, 'error'::text, 'pending'::text, 'processing'::text])))
);
CREATE TABLE IF NOT EXISTS public.ai_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    chunk_id uuid,
    embedding public.vector(384),
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public."aplic-acelerador" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    endpoint text NOT NULL,
    nome text,
    email text,
    whatsapp text,
    form_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    ghl_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    ghl_tags text[] DEFAULT '{}'::text[] NOT NULL,
    ghl_opportunity jsonb,
    ghl_contact_id text,
    ghl_opportunity_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 20 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    tt_source text,
    tt_medium text,
    tt_campaign text,
    sent_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    page_url text,
    CONSTRAINT "aplic-acelerador_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'retrying'::text, 'success'::text, 'failed'::text])))
);
CREATE TABLE IF NOT EXISTS public.app_config (
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.app_feature_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    app_slug text NOT NULL,
    feature_key text NOT NULL,
    role text NOT NULL,
    can_view boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    can_edit boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.app_feature_user_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    app_slug text NOT NULL,
    feature_key text NOT NULL,
    user_id uuid NOT NULL,
    can_view boolean NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    can_edit boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.app_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    app_slug text NOT NULL,
    role text NOT NULL,
    can_view boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.app_user_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    app_slug text NOT NULL,
    user_id uuid NOT NULL,
    can_view boolean NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action text NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    payload_before jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.auth_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    status text NOT NULL,
    email text,
    ip_address inet,
    user_agent text,
    error_message text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_audit_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'failed'::text])))
);
CREATE TABLE IF NOT EXISTS public.auth_password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    ip_address inet,
    user_agent text
);
CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    identifier text NOT NULL,
    action text NOT NULL,
    attempt_count integer DEFAULT 1 NOT NULL,
    first_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    blocked_until timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.bot_context (
    key text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    ordem integer DEFAULT 100 NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    meta_campaign_id text
);
CREATE TABLE IF NOT EXISTS public.comunicacoes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contato_id uuid,
    tipo text NOT NULL,
    mensagem_body text,
    mensagem_subject text,
    mensagem_attachments text,
    ai_summary text,
    ai_transcript text,
    phone_call_from text,
    phone_call_to text,
    phone_call_duration integer,
    phone_call_from_city text,
    phone_call_from_state text,
    phone_call_answered_by_phone text,
    phone_call_answered_by_name text,
    phone_call_start_time timestamp with time zone,
    phone_call_end_time timestamp with time zone,
    phone_call_status text,
    phone_call_dispositions text,
    created_at timestamp with time zone DEFAULT now(),
    direction text,
    ghl_message_id text,
    ghl_conversation_id text,
    channel text,
    data_comunicacao timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    usuario_ghl_id text,
    contato_nome text,
    contato_email text,
    contato_telefone text,
    sdr_name text,
    sdr_email text,
    closer_name text,
    ghl_source text,
    msg_status text,
    ghl_date_updated timestamp with time zone,
    alt_id text,
    error_msg text,
    msg_from text,
    msg_to text,
    ghl_assigned_to text,
    CONSTRAINT comunicacoes_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))),
    CONSTRAINT comunicacoes_tipo_check CHECK ((tipo = ANY (ARRAY['mensagem'::text, 'ligacao'::text, 'ai_conversation'::text])))
);
CREATE TABLE IF NOT EXISTS public.ghl_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ghl_id text NOT NULL,
    nome text NOT NULL,
    email text,
    role_ghl text,
    deleted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    papeis text[] DEFAULT '{}'::text[] NOT NULL,
    auth_user_id uuid,
    clara_habilitado boolean DEFAULT false NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.contact_opp_sync_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ghl_contact_id text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    location_id text,
    claimed_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.contatos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ghl_id text NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    updated_at timestamp with time zone DEFAULT now(),
    ip text,
    url text,
    ad_id text,
    gclid text,
    ad_name text,
    fbclid text,
    gbraid text,
    wbraid text,
    referrer text,
    ad_group_id text,
    user_agent text,
    fbc text,
    fbp text,
    ga_client_id text,
    ga_session_id text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    utm_keyword text,
    utm_matchtype text,
    tt_term text,
    tt_medium text,
    tt_source text,
    tt_content text,
    tt_campaign text,
    primeiro_nome text,
    ultimo_nome text,
    country text,
    date_created timestamp with time zone,
    contact_type text,
    contact_source text,
    pipeline_id_contato text,
    pipeline_name text,
    pipeline_stage text,
    location_id text,
    location_name text,
    timezone text,
    owner_id text,
    owner_name text,
    owner_email text,
    social_seller text,
    swot_forcas text,
    swot_fraquezas text,
    swot_oportunidades text,
    swot_ameacas text,
    id_analise text,
    data_analise text,
    link_analise text,
    status_analise text,
    situacao_atual text,
    perfil_inteligente text,
    como_nos_conheceu text,
    possiveis_objecoes text,
    preciso_ajuda_para text,
    faturamento_anual text,
    follow_up_1 text,
    follow_up_2 text,
    follow_up_3 text,
    follow_up_4 text,
    follow_up_5 text,
    follow_up_6 text,
    follow_up_7 text,
    follow_up_8 text,
    follow_up_9 text,
    follow_up_10 text,
    follow_up_11 text,
    follow_up_12 text,
    follow_up_13 text,
    follow_up_14 text,
    follow_up_15 text,
    comunicacao_veredito text,
    comunicacao_erros_atuais text,
    comunicacao_tendencia_mercado text,
    analise_oferta_principal text,
    banco_ideias_conteudo text,
    canais_venda_recomendados text,
    analise_gap_pontos_fracos text,
    estudo_concorrentes text,
    estrategia_antibrjection_scripts text,
    plano_acao_passo_a_passo text,
    print_instagram text,
    descricao_negocio text,
    tempo_usa_internet text,
    investe_trafego text,
    treinamento_marketing text,
    super_heroi_favorito text,
    disponibilidade_barra text,
    tipo_empresa text,
    plano_meta text,
    obstaculos text,
    visao_6_meses text,
    situacao_investimentos text,
    closer_name text,
    closer_email text,
    tags text,
    total_oportunidades_ghl integer,
    total_oportunidades_db integer,
    attribution_attempts integer DEFAULT 0 NOT NULL,
    attribution_skip boolean DEFAULT false NOT NULL,
    indicacao_ingresso text,
    vai_indicar_alguem text,
    origem text,
    source text,
    sdr_id text,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    workspace_id uuid DEFAULT '7909d02a-4d15-46ea-a7b8-5debeb6e8351'::uuid
);
CREATE TABLE IF NOT EXISTS public.creative_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    creative_id uuid NOT NULL,
    table_name text NOT NULL,
    field_name text NOT NULL,
    old_value text,
    new_value text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now(),
    ip_address inet,
    user_agent text
);
CREATE TABLE IF NOT EXISTS public.creative_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    creative_id uuid NOT NULL,
    user_id uuid NOT NULL,
    parent_id uuid,
    content text NOT NULL,
    resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.creative_test_criteria (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    cpl_target numeric(10,2) DEFAULT 70 NOT NULL,
    budget_min numeric(10,2) DEFAULT 50 NOT NULL,
    budget_max numeric(10,2) DEFAULT 100 NOT NULL,
    window_min_days integer DEFAULT 3 NOT NULL,
    window_max_days integer DEFAULT 5 NOT NULL,
    early_stop_threshold numeric(10,2) DEFAULT 150 NOT NULL,
    early_stop_spend numeric(10,2) DEFAULT 30 NOT NULL,
    no_lead_max_days integer DEFAULT 5 NOT NULL,
    weekly_goal_reels integer DEFAULT 4 NOT NULL,
    weekly_goal_static integer DEFAULT 6 NOT NULL,
    weekly_goal_carousel integer DEFAULT 3 NOT NULL,
    weekly_goal_stories integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);
CREATE TABLE IF NOT EXISTS public.creative_test_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    creative_id uuid NOT NULL,
    test_id uuid,
    event_type text NOT NULL,
    event_data jsonb,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT creative_test_history_event_type_check CHECK ((event_type = ANY (ARRAY['teste_iniciado'::text, 'teste_pausado'::text, 'teste_finalizado'::text, 'aprovado'::text, 'reprovado'::text, 'retestar'::text, 'orcamento_atualizado'::text, 'cpl_atualizado'::text, 'observacao_adicionada'::text])))
);
CREATE TABLE IF NOT EXISTS public.creative_tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    creative_id uuid,
    started_at date,
    ended_at date,
    budget_allocated numeric(10,2),
    budget_spent numeric(10,2) DEFAULT 0,
    leads_meta integer DEFAULT 0,
    leads_crm integer DEFAULT 0,
    mql_count integer DEFAULT 0,
    sales_count integer DEFAULT 0,
    revenue numeric(12,2) DEFAULT 0,
    cpl_meta numeric(10,2),
    cpl_crm numeric(10,2),
    cpmql numeric(10,2),
    result text,
    result_reason text,
    observations text,
    decided_by uuid,
    decided_at timestamp with time zone,
    status text DEFAULT 'draft'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name text,
    hypothesis text,
    control_creative_id uuid,
    variant_creative_id uuid,
    winner_creative_id uuid,
    start_date date,
    end_date date,
    budget numeric(10,2),
    criteria_id uuid,
    created_by uuid,
    CONSTRAINT creative_tests_result_check CHECK ((result = ANY (ARRAY['aprovado'::text, 'reprovado'::text, 'cancelado'::text, 'pendente'::text]))),
    CONSTRAINT creative_tests_status_check CHECK ((status = ANY (ARRAY['em_andamento'::text, 'concluido'::text, 'cancelado'::text])))
);
CREATE TABLE IF NOT EXISTS public.creative_validations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    creative_id uuid NOT NULL,
    status text NOT NULL,
    motivo text,
    validated_by uuid,
    validated_by_email text,
    validated_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT creative_validations_status_check CHECK ((status = ANY (ARRAY['validado'::text, 'reprovado'::text])))
);
CREATE TABLE IF NOT EXISTS public.dashboard_user_lead_filters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    filter_name text,
    logic text DEFAULT 'AND'::text NOT NULL,
    rules jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dashboard_user_lead_filters_logic_check CHECK ((logic = ANY (ARRAY['AND'::text, 'OR'::text])))
);
CREATE TABLE IF NOT EXISTS public.dashboard_user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    module_key text NOT NULL,
    can_view boolean DEFAULT true NOT NULL,
    can_edit boolean DEFAULT false NOT NULL,
    granted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.discagem_scores (
    oportunidade_id uuid NOT NULL,
    contato_id uuid NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    estado text NOT NULL,
    razao text DEFAULT ''::text NOT NULL,
    componente_dom text DEFAULT 'urgencia'::text NOT NULL,
    score_sinal integer DEFAULT 0 NOT NULL,
    score_urgencia integer DEFAULT 0 NOT NULL,
    score_tentativas integer DEFAULT 0 NOT NULL,
    score_fonte integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    camada text DEFAULT 'cadencia'::text NOT NULL,
    numero_tentativa integer DEFAULT 0 NOT NULL,
    canal_sugerido text DEFAULT 'call'::text NOT NULL,
    data_retorno_combinado timestamp with time zone,
    data_entrada_lead timestamp with time zone,
    data_retorno_previsto timestamp with time zone,
    workspace_id uuid,
    score_qualificacao integer DEFAULT 0 NOT NULL,
    escopo text DEFAULT 'pre_vendas'::text NOT NULL,
    CONSTRAINT discagem_scores_camada_check CHECK ((camada = ANY (ARRAY['horario_marcado'::text, 'respondeu'::text, 'lead_novo'::text, 'cadencia'::text]))),
    CONSTRAINT discagem_scores_canal_sugerido_check CHECK ((canal_sugerido = ANY (ARRAY['call'::text, 'whatsapp'::text, 'sms'::text]))),
    CONSTRAINT discagem_scores_escopo_check CHECK ((escopo = ANY (ARRAY['pre_vendas'::text, 'recuperacao'::text]))),
    CONSTRAINT discagem_scores_estado_check CHECK ((estado = ANY (ARRAY['ligue_agora'::text, 'ligue_hoje'::text, 'mensagem'::text])))
);
CREATE TABLE IF NOT EXISTS public.disparo_campos_custom (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome_campo text NOT NULL,
    tipo text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT disparo_campos_custom_tipo_check CHECK ((tipo = ANY (ARRAY['texto'::text, 'numero'::text, 'moeda'::text, 'data'::text])))
);
CREATE TABLE IF NOT EXISTS public.disparo_campos_custom_valores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    disparo_id uuid NOT NULL,
    campo_id uuid NOT NULL,
    valor text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.disparo_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    disparo_id uuid NOT NULL,
    significado text NOT NULL,
    tag text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT disparo_tags_significado_check CHECK ((significado = ANY (ARRAY['trigger'::text, 'respondeu'::text, 'parou'::text, 'erro'::text, 'nao_respondeu'::text, 'converteu'::text])))
);
CREATE TABLE IF NOT EXISTS public.disparos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    descricao text,
    cor text DEFAULT '#6366f1'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_mensagem text DEFAULT 'marketing'::text NOT NULL,
    CONSTRAINT disparos_tipo_mensagem_check CHECK ((tipo_mensagem = ANY (ARRAY['marketing'::text, 'utility'::text])))
);
CREATE TABLE IF NOT EXISTS public.estado_uf_normalizacao (
    estado_raw text NOT NULL,
    uf text NOT NULL,
    regiao text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.funnels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_calendars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid,
    ghl_id text NOT NULL,
    nome text NOT NULL,
    location_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_conversations_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    mode text DEFAULT 'incremental'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    page_processed integer DEFAULT 1,
    conversations_processed integer DEFAULT 0,
    messages_processed integer DEFAULT 0,
    messages_upserted integer DEFAULT 0,
    has_more_pages boolean DEFAULT false,
    next_page integer,
    total_conversations integer,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ghl_conversations_sync_log_mode_check CHECK ((mode = ANY (ARRAY['incremental'::text, 'full_backfill'::text]))),
    CONSTRAINT ghl_conversations_sync_log_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])))
);
CREATE TABLE IF NOT EXISTS public.ghl_custom_field_mappings (
    logical_name text NOT NULL,
    ghl_custom_field_id text NOT NULL,
    field_key text,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_discovery_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    source text,
    payload jsonb,
    status text DEFAULT 'success'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_field_mapping_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Empire Default'::text NOT NULL,
    logical_name text NOT NULL,
    ghl_field_key text,
    field_type text,
    variations jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_field_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    logical_name text NOT NULL,
    ghl_field_key text,
    ghl_field_id text,
    field_type text,
    variations jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_integration_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    ghl_location_id text NOT NULL,
    webhook_secret text,
    webhook_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_opp_reconcile_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    contato_id uuid,
    ghl_contact_id text NOT NULL,
    location_id text NOT NULL,
    nome_contato text,
    email_contato text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    claimed_at timestamp with time zone,
    processed_at timestamp with time zone,
    last_error text,
    ghl_total integer DEFAULT 0 NOT NULL,
    db_total integer DEFAULT 0 NOT NULL,
    missing_in_db jsonb DEFAULT '[]'::jsonb NOT NULL,
    extra_in_db jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_in_db jsonb DEFAULT '[]'::jsonb NOT NULL,
    inserted_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ghl_opp_reconcile_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'error'::text])))
);
CREATE TABLE IF NOT EXISTS public.ghl_opp_reconcile_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mode text NOT NULL,
    scope text DEFAULT 'all_contacts'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    total_contacts integer DEFAULT 0 NOT NULL,
    processed_contacts integer DEFAULT 0 NOT NULL,
    success_contacts integer DEFAULT 0 NOT NULL,
    error_contacts integer DEFAULT 0 NOT NULL,
    contacts_with_missing integer DEFAULT 0 NOT NULL,
    contacts_with_extra integer DEFAULT 0 NOT NULL,
    opportunities_missing integer DEFAULT 0 NOT NULL,
    opportunities_extra integer DEFAULT 0 NOT NULL,
    opportunities_inserted integer DEFAULT 0 NOT NULL,
    opportunities_updated integer DEFAULT 0 NOT NULL,
    notes text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ghl_opp_reconcile_runs_mode_check CHECK ((mode = ANY (ARRAY['audit'::text, 'write'::text]))),
    CONSTRAINT ghl_opp_reconcile_runs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'done_with_errors'::text, 'failed'::text])))
);
CREATE TABLE IF NOT EXISTS public.ghl_pipeline_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    ghl_pipeline_id text NOT NULL,
    ghl_pipeline_name text,
    system_category text,
    is_excluded boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_stage_mappings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    ghl_pipeline_id text NOT NULL,
    ghl_stage_id text NOT NULL,
    ghl_stage_name text,
    system_stage text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ghl_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ghl_task_id text NOT NULL,
    contact_ghl_id text,
    contato_id uuid,
    title text,
    due_date timestamp with time zone,
    completed boolean DEFAULT false NOT NULL,
    deleted boolean DEFAULT false NOT NULL,
    assigned_to_ghl_id text,
    task_type text DEFAULT 'Call'::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.goal_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    metric_definition_id uuid NOT NULL,
    scope_type text NOT NULL,
    scope_id text NOT NULL,
    scope_label text NOT NULL,
    owner_user_id uuid,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    app_slug text,
    CONSTRAINT goal_definitions_scope_not_blank_chk CHECK ((btrim(scope_id) <> ''::text)),
    CONSTRAINT goal_definitions_scope_type_check CHECK ((scope_type = ANY (ARRAY['workspace'::text, 'area'::text, 'team'::text, 'user'::text, 'channel'::text, 'campaign'::text, 'custom_entity'::text])))
);
CREATE TABLE IF NOT EXISTS public.goal_metric_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    area_key text NOT NULL,
    metric_key text NOT NULL,
    metric_name text NOT NULL,
    description text,
    analysis_mode text NOT NULL,
    aggregation_type text NOT NULL,
    unit text NOT NULL,
    target_direction text NOT NULL,
    date_basis text NOT NULL,
    default_period_granularity text DEFAULT 'customizado'::text NOT NULL,
    tracking_mode text NOT NULL,
    provider_key text NOT NULL,
    legacy_tipo text,
    supported_scope_types text[] DEFAULT ARRAY['workspace'::text] NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_metric_definitions_analysis_mode_check CHECK ((analysis_mode = ANY (ARRAY['cohort'::text, 'produtividade'::text]))),
    CONSTRAINT goal_metric_definitions_target_direction_check CHECK ((target_direction = ANY (ARRAY['maximize'::text, 'minimize'::text]))),
    CONSTRAINT goal_metric_definitions_tracking_mode_check CHECK ((tracking_mode = ANY (ARRAY['cumulative'::text, 'snapshot'::text, 'budget_capped'::text])))
);
CREATE TABLE IF NOT EXISTS public.goal_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_version_id uuid NOT NULL,
    snapshot_date date NOT NULL,
    actual_value numeric(14,2),
    ideal_value numeric(14,2),
    projected_value numeric(14,2),
    status text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_snapshots_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'on_track'::text, 'at_risk'::text, 'off_track'::text, 'completed'::text, 'no_data'::text])))
);
CREATE TABLE IF NOT EXISTS public.goal_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    goal_definition_id uuid NOT NULL,
    target_value numeric(14,2) NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    cadence text DEFAULT 'customizado'::text NOT NULL,
    notes text,
    created_by uuid DEFAULT auth.uid(),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT goal_versions_period_valid_chk CHECK ((period_start <= period_end)),
    CONSTRAINT goal_versions_target_value_check CHECK ((target_value > (0)::numeric))
);
CREATE TABLE IF NOT EXISTS public.maquina_de_conteudo (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transacao_id text,
    evento_tipo text,
    comprador_nome text,
    comprador_sobrenome text,
    comprador_email text,
    comprador_telefone text,
    produto_id bigint,
    produto_nome text,
    oferta_codigo text,
    oferta_nome text,
    valor numeric(10,2),
    valor_oferta_original numeric(10,2),
    moeda text DEFAULT 'BRL'::text,
    forma_pagamento text,
    parcelas integer DEFAULT 1,
    quantidade_ingressos bigint DEFAULT 1,
    status text,
    data_pedido timestamp with time zone,
    data_aprovacao timestamp with time zone,
    payload jsonb,
    criado_em timestamp with time zone DEFAULT now(),
    atualizado_em timestamp with time zone DEFAULT now(),
    cupom_codigo text
);
CREATE TABLE IF NOT EXISTS public.meta_ads_backfill_controle (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    data_inicio date NOT NULL,
    data_fim date NOT NULL,
    dias_processados integer DEFAULT 0,
    total_dias integer,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meta_ads_backfill_controle_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'paused'::text, 'completed'::text, 'error'::text])))
);
CREATE TABLE IF NOT EXISTS public.meta_ads_backfill_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    controle_id uuid,
    data date NOT NULL,
    status text NOT NULL,
    registros_processados integer DEFAULT 0,
    error_message text,
    processed_at timestamp with time zone,
    CONSTRAINT meta_ads_backfill_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'success'::text, 'error'::text])))
);
CREATE TABLE IF NOT EXISTS public.meta_ads_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id text NOT NULL,
    account_id text NOT NULL,
    name text,
    status text,
    objective text,
    daily_budget numeric(15,2),
    lifetime_budget numeric(15,2),
    start_time timestamp with time zone,
    stop_time timestamp with time zone,
    created_time timestamp with time zone,
    updated_time timestamp with time zone,
    fetched_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meta_ads_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    campaign_id text NOT NULL,
    adset_id text,
    ad_id text,
    date date NOT NULL,
    hour integer,
    spend numeric(15,2) DEFAULT 0,
    impressions integer DEFAULT 0,
    clicks integer DEFAULT 0,
    reach integer DEFAULT 0,
    frequency numeric(10,4),
    ctr numeric(10,4),
    cpc numeric(15,4),
    cpm numeric(15,4),
    cpp numeric(15,4),
    actions jsonb DEFAULT '[]'::jsonb,
    conversions jsonb DEFAULT '[]'::jsonb,
    conversion_values jsonb DEFAULT '[]'::jsonb,
    cost_per_action_type jsonb DEFAULT '[]'::jsonb,
    video_metrics jsonb DEFAULT '{}'::jsonb,
    quality_ranking text,
    engagement_rate_ranking text,
    conversion_rate_ranking text,
    raw_insight_id uuid,
    fetched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    campaign_name text,
    adset_name text,
    ad_name text,
    landing_page_views integer DEFAULT 0,
    video_views integer DEFAULT 0,
    link_clicks integer DEFAULT 0,
    leads integer DEFAULT 0,
    onsite_web_leads integer DEFAULT 0,
    fb_pixel_leads integer DEFAULT 0,
    workspace_id uuid,
    CONSTRAINT meta_ads_insights_hour_check CHECK (((hour >= 0) AND (hour <= 23)))
);
CREATE TABLE IF NOT EXISTS public.meta_ads_insights_breakdowns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    insights_id uuid NOT NULL,
    age text,
    gender text,
    country text,
    region text,
    impression_device text,
    publisher_platform text,
    platform_position text,
    spend numeric(15,2) DEFAULT 0,
    impressions integer DEFAULT 0,
    clicks integer DEFAULT 0,
    conversions jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    breakdown_type text,
    reach integer DEFAULT 0,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.meta_ads_permalinks (
    ad_id text NOT NULL,
    creative_code text,
    instagram_permalink_url text,
    permalink_url text,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.meta_ads_raw_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    api_endpoint text NOT NULL,
    params jsonb DEFAULT '{}'::jsonb,
    response_data jsonb,
    http_status integer,
    records_count integer DEFAULT 0,
    fetch_started_at timestamp with time zone,
    fetch_finished_at timestamp with time zone,
    processado_em timestamp with time zone,
    error_details jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.meta_ads_region_mapping (
    region_name text NOT NULL,
    uf text NOT NULL,
    regiao text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.meta_ads_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    status text NOT NULL,
    records_fetched integer DEFAULT 0,
    records_inserted integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    error_message text,
    error_details jsonb,
    execution_time_ms integer,
    created_at timestamp with time zone DEFAULT now(),
    workspace_id uuid,
    CONSTRAINT meta_ads_sync_log_status_check CHECK ((status = ANY (ARRAY['success'::text, 'error'::text, 'partial'::text, 'running'::text])))
);
CREATE TABLE IF NOT EXISTS public.metas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    tipo text NOT NULL,
    referencia text DEFAULT 'global'::text NOT NULL,
    valor numeric(12,2) NOT NULL,
    periodo text DEFAULT 'customizado'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    periodo_inicio date NOT NULL,
    periodo_fim date NOT NULL,
    CONSTRAINT metas_periodo_valido_chk CHECK ((periodo_inicio <= periodo_fim))
);
CREATE TABLE IF NOT EXISTS public.notion_creatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    notion_page_id text,
    database_type text,
    external_id text,
    name text,
    status text,
    available_date date,
    format text,
    cta_objective text,
    videos_folder_url text,
    final_asset_url text,
    profile text,
    raw_properties jsonb DEFAULT '{}'::jsonb,
    synced_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notion_database_id text,
    post_url text,
    creative_tested boolean DEFAULT false NOT NULL,
    test_started_at date,
    aprovado boolean,
    data_avaliacao timestamp with time zone,
    objective text,
    social_network text,
    micro_program text,
    source text DEFAULT 'native'::text NOT NULL,
    copy_text text,
    hook_text text,
    cta_text text,
    content_pillar text,
    funnel_stage text,
    created_by uuid,
    assigned_to uuid,
    priority integer DEFAULT 0,
    tags text[] DEFAULT '{}'::text[],
    raw_asset_url text,
    test_ended_at date,
    cpl_value numeric(10,2),
    observations text,
    budget_spent numeric(10,2) DEFAULT 0,
    test_status text DEFAULT 'nao_testado'::text,
    test_result text,
    campaign_id uuid,
    creative_type text,
    mvp_status text,
    learning text,
    CONSTRAINT notion_creatives_creative_type_check CHECK ((creative_type = ANY (ARRAY['copy'::text, 'imagem'::text, 'video'::text, 'hook'::text, 'cta'::text]))),
    CONSTRAINT notion_creatives_database_type_check CHECK ((database_type = ANY (ARRAY['paid'::text, 'organic'::text]))),
    CONSTRAINT notion_creatives_mvp_status_check CHECK ((mvp_status = ANY (ARRAY['testando'::text, 'aprovado'::text, 'reprovado'::text]))),
    CONSTRAINT notion_creatives_source_check CHECK ((source = ANY (ARRAY['notion'::text, 'native'::text, 'import'::text]))),
    CONSTRAINT notion_creatives_test_result_check CHECK ((test_result = ANY (ARRAY['aprovado'::text, 'reprovado'::text, 'pendente'::text, 'retestar'::text]))),
    CONSTRAINT notion_creatives_test_status_check CHECK ((test_status = ANY (ARRAY['nao_testado'::text, 'em_teste'::text, 'testado'::text])))
);
CREATE TABLE IF NOT EXISTS public.notion_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    database_type text NOT NULL,
    request_source text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    records_synced integer DEFAULT 0,
    records_created integer DEFAULT 0,
    records_updated integer DEFAULT 0,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notion_database_id text,
    start_date date,
    end_date date,
    records_fetched integer DEFAULT 0,
    records_inserted integer DEFAULT 0,
    records_skipped integer DEFAULT 0,
    CONSTRAINT notion_sync_runs_database_type_check CHECK ((database_type = ANY (ARRAY['paid'::text, 'organic'::text]))),
    CONSTRAINT notion_sync_runs_request_source_check CHECK ((request_source = ANY (ARRAY['manual'::text, 'cron'::text]))),
    CONSTRAINT notion_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'error'::text])))
);
CREATE TABLE IF NOT EXISTS public.oportunidades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ghl_opportunity_id text NOT NULL,
    contato_id uuid NOT NULL,
    nome_contato text NOT NULL,
    email_contato text,
    titulo text,
    valor numeric(12,2),
    status text DEFAULT 'open'::text,
    pipeline_id text,
    pipeline_stage_id text,
    updated_at timestamp with time zone DEFAULT now(),
    data_lead_recebido timestamp with time zone,
    data_tentativa_1 date,
    data_tentativa_2 date,
    data_tentativa_3 date,
    data_tentativa_4 date,
    data_tentativa_5 date,
    data_tentativa_6 date,
    data_tentativa_7 date,
    data_tentativa_8 date,
    data_no_show date,
    data_conectado date,
    data_perdido date,
    data_qualificado date,
    data_no_show_vendas date,
    data_perdido_vendas date,
    data_agendamento_vendas date,
    data_realizacao_vendas date,
    data_negociacao date,
    data_fechado date,
    data_reuniao_agendada date,
    data_reuniao_realizada date,
    vendedor_closer text,
    data_agendamento_reuniao date,
    data_pendencias_preenchimento date,
    data_ultima_atividade date,
    resumo_ia text,
    percepcao_closer text,
    lost_reason text,
    data_criacao_contato timestamp with time zone,
    pipeline_name text,
    opportunity_source text,
    op_vencimentos_e_parcelas text,
    openclaw_notificado_em timestamp with time zone,
    openclaw_request_id bigint,
    openclaw_enfileirado_em timestamp with time zone,
    openclaw_ultima_resposta_em timestamp with time zone,
    openclaw_ultimo_status_code integer,
    openclaw_ultimo_erro text,
    data_auto_agendamento date,
    last_appointment_sync_at timestamp with time zone,
    sdr_name text,
    last_pipeline_sync_at timestamp with time zone,
    data_reuniao_agendada_ts timestamp with time zone,
    agendamento_origem text,
    agendamento_por_user_id text,
    agendamento_por_user_nome text,
    agendamento_por_user_email text,
    agendamento_calendar_id text,
    agendamento_calendar_name text,
    agendamento_assigned_user_id text,
    agendamento_assigned_user_nome text,
    appointment_status text
);
CREATE TABLE IF NOT EXISTS public.organic_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    profile text,
    utm_source_name text,
    utm_source text,
    utm_campaign_name text,
    utm_campaign integer,
    utm_medium_name text,
    utm_medium integer,
    utm_term_name text,
    utm_term integer,
    utm_content text,
    url text,
    shortened_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.organic_investment_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'other'::text NOT NULL,
    utm_source text,
    recurrence text DEFAULT 'monthly'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT category_valid CHECK ((category = ANY (ARRAY['social_media'::text, 'design'::text, 'video'::text, 'copywriter'::text, 'other'::text]))),
    CONSTRAINT recurrence_valid CHECK ((recurrence = ANY (ARRAY['monthly'::text, 'once'::text])))
);
CREATE TABLE IF NOT EXISTS public.organic_investments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    item_id uuid,
    period_start date NOT NULL,
    period_end date NOT NULL,
    year_month text GENERATED ALWAYS AS (((((EXTRACT(year FROM period_start))::integer)::text || '-'::text) || lpad(((EXTRACT(month FROM period_start))::integer)::text, 2, '0'::text))) STORED,
    utm_source text,
    amount numeric(12,2) NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT organic_investments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT period_valid CHECK ((period_end >= period_start))
);
CREATE TABLE IF NOT EXISTS public.permission_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    action text NOT NULL,
    target_user_id uuid NOT NULL,
    performed_by uuid NOT NULL,
    module_key text,
    old_value jsonb,
    new_value jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT permission_audit_log_action_check CHECK ((action = ANY (ARRAY['granted'::text, 'revoked'::text, 'updated'::text])))
);
CREATE TABLE IF NOT EXISTS public.prevendas_ai_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    input_hash text NOT NULL,
    resultado jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reunioes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contato_id uuid NOT NULL,
    oportunidade_id uuid,
    ghl_appointment_id text,
    titulo text,
    notas text,
    usuario_nome text,
    usuario_email text,
    data_agendada timestamp with time zone,
    data_realizada timestamp with time zone,
    status text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT reunioes_status_check CHECK ((status = ANY (ARRAY['agendada'::text, 'realizada'::text, 'cancelada'::text, 'no_show'::text])))
);
CREATE TABLE IF NOT EXISTS public.sales_process_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    utm_campaign_id uuid NOT NULL,
    sales_process_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sales_processes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sdr_ia_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    tags_filter jsonb DEFAULT '{"exclude": [], "include": []}'::jsonb NOT NULL,
    pipelines_filter jsonb DEFAULT '{"exclude": [], "include": []}'::jsonb NOT NULL,
    utm_source_filter jsonb DEFAULT '{"exclude": [], "include": []}'::jsonb NOT NULL,
    utm_campaign_filter jsonb DEFAULT '{"exclude": [], "include": []}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.secrets (
    key text NOT NULL,
    value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.stevo_whatsapp_calls (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id text NOT NULL,
    instance_id text,
    caller text,
    receiver text,
    direction text,
    status text,
    is_video boolean DEFAULT false,
    duration_seconds integer,
    has_recording boolean DEFAULT false,
    recording_url text,
    audio_url text,
    transcription text,
    analysis jsonb,
    analyzed_at timestamp with time zone,
    call_timestamp timestamp with time zone,
    created_at timestamp with time zone DEFAULT (now() - '03:00:00'::interval),
    updated_at timestamp with time zone DEFAULT (now() - '03:00:00'::interval),
    raw_data jsonb
);
CREATE TABLE IF NOT EXISTS public.telegram_allowed_users (
    telegram_user_id bigint NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    utm_campaign integer,
    page_code text,
    funnels jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_mediums (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    utm_medium integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    objective_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_origins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_slugs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_source_origin_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    utm_source text NOT NULL,
    origin_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    utm_source text NOT NULL,
    public_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_sources_plain (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    slug text NOT NULL,
    utm_source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.utm_terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    nome text NOT NULL,
    utm_term integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.vendas_fechamento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    oportunidade_id uuid NOT NULL,
    contato_id uuid NOT NULL,
    nome_contratante text,
    cpf_cnpj_contratante text,
    logradouro_rua_avenida text,
    numero_endereco text,
    complemento_endereco text,
    bairro text,
    municipio text,
    estado_uf text,
    cep text,
    produto_vendido text,
    observacoes_venda text,
    forma_pagamento text,
    valor_entrada numeric(12,2) DEFAULT 0,
    numero_parcelas integer DEFAULT 0,
    valor_parcela numeric(12,2) DEFAULT 0,
    valor_faturado numeric(12,2) GENERATED ALWAYS AS ((COALESCE(valor_entrada, (0)::numeric) + ((COALESCE(numero_parcelas, 0))::numeric * COALESCE(valor_parcela, (0)::numeric)))) STORED,
    data_pagamento_entrada timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    op_vencimentos_parcelas text,
    op_link_do_contrato_assinado text,
    data_da_assinatura_do_contrato date,
    link_gravacao_call_vendas text,
    pagamentos jsonb DEFAULT '[]'::jsonb NOT NULL,
    comprovantes jsonb DEFAULT '[]'::jsonb NOT NULL,
    closer_nome text,
    closer_email text,
    origem text DEFAULT 'ghl'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.whatsapp_pricing_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    preco_marketing numeric(10,4) DEFAULT 0 NOT NULL,
    preco_utility numeric(10,4) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.weekly_aquisicao (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    conectados_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    perdidos_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    valor_entrada numeric(18,2) DEFAULT 0 NOT NULL,
    meta_spend numeric(18,2) DEFAULT 0 NOT NULL,
    meta_impressions integer DEFAULT 0 NOT NULL,
    meta_clicks integer DEFAULT 0 NOT NULL,
    meta_leads_actions integer DEFAULT 0 NOT NULL,
    cpmql numeric(18,2),
    cpv numeric(18,2),
    roas numeric(18,4),
    roas_caixa numeric(18,4),
    ctr numeric(18,4),
    ciclo_compra_dias numeric(18,2),
    taxa_conexao_pct numeric(18,2),
    taxa_agendamento_pct numeric(18,2),
    taxa_reuniao_pct numeric(18,2),
    taxa_conversao_pct numeric(18,2),
    taxa_no_show_pct numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_closer (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    ligacoes_count integer DEFAULT 0 NOT NULL,
    mensagens_count integer DEFAULT 0 NOT NULL,
    pessoas_contatadas integer DEFAULT 0 NOT NULL,
    avg_response_seconds integer,
    leads_sem_resposta integer DEFAULT 0 NOT NULL,
    taxa_conversao_pct numeric(18,2),
    taxa_no_show_pct numeric(18,2),
    taxa_comparecimento_pct numeric(18,2),
    taxa_sem_resposta_pct numeric(18,2),
    ciclo_fechamento_dias numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_organico (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    conectados_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    perdidos_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    taxa_conexao_pct numeric(18,2),
    taxa_agendamento_pct numeric(18,2),
    taxa_reuniao_pct numeric(18,2),
    taxa_conversao_pct numeric(18,2),
    taxa_no_show_pct numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_prevendas (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    conectados_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    perdidos_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    ligacoes_count integer DEFAULT 0 NOT NULL,
    mensagens_count integer DEFAULT 0 NOT NULL,
    pessoas_contatadas integer DEFAULT 0 NOT NULL,
    leads_sem_resposta integer DEFAULT 0 NOT NULL,
    avg_response_seconds integer,
    taxa_conexao_pct numeric(18,2),
    taxa_agendamento_pct numeric(18,2),
    taxa_reuniao_pct numeric(18,2),
    taxa_conversao_pct numeric(18,2),
    taxa_no_show_pct numeric(18,2),
    taxa_sem_resposta_pct numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_recuperacao (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    conectados_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    perdidos_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    ligacoes_count integer DEFAULT 0 NOT NULL,
    mensagens_count integer DEFAULT 0 NOT NULL,
    pessoas_contatadas integer DEFAULT 0 NOT NULL,
    leads_sem_resposta integer DEFAULT 0 NOT NULL,
    avg_response_seconds integer,
    taxa_conexao_pct numeric(18,2),
    taxa_agendamento_pct numeric(18,2),
    taxa_reuniao_pct numeric(18,2),
    taxa_conversao_pct numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_sdr (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    conectados_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    agendados_no_prazo integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    ligacoes_count integer DEFAULT 0 NOT NULL,
    mensagens_count integer DEFAULT 0 NOT NULL,
    pessoas_contatadas integer DEFAULT 0 NOT NULL,
    leads_sem_resposta integer DEFAULT 0 NOT NULL,
    avg_response_seconds integer,
    ultima_resposta_seconds integer,
    taxa_conexao_pct numeric(18,2),
    taxa_agendamento_pct numeric(18,2),
    taxa_agendamento_prazo_pct numeric(18,2),
    taxa_conversao_pct numeric(18,2),
    taxa_sem_resposta_pct numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_snapshots (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    week_start date NOT NULL,
    week_end date GENERATED ALWAYS AS ((week_start + 6)) STORED NOT NULL,
    year_week text NOT NULL,
    report_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    computed_at timestamp with time zone,
    finalized_at timestamp with time zone,
    computation_duration_ms integer,
    records_processed integer,
    error_message text,
    data_version integer DEFAULT 1 NOT NULL,
    workspace_id uuid,
    CONSTRAINT weekly_snapshots_report_type_check CHECK ((report_type = ANY (ARRAY['cohort'::text, 'produtividade'::text]))),
    CONSTRAINT weekly_snapshots_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'computing'::text, 'completed'::text, 'failed'::text, 'finalized'::text])))
);
CREATE TABLE IF NOT EXISTS public.weekly_trafego (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    conectados_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    perdidos_count integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    valor_entrada numeric(18,2) DEFAULT 0 NOT NULL,
    meta_spend numeric(18,2) DEFAULT 0 NOT NULL,
    meta_impressions integer DEFAULT 0 NOT NULL,
    meta_clicks integer DEFAULT 0 NOT NULL,
    meta_leads_actions integer DEFAULT 0 NOT NULL,
    cpmql numeric(18,2),
    cpv numeric(18,2),
    roas numeric(18,4),
    roas_caixa numeric(18,4),
    ctr numeric(18,4),
    ciclo_compra_dias numeric(18,2),
    taxa_conexao_pct numeric(18,2),
    taxa_agendamento_pct numeric(18,2),
    taxa_reuniao_pct numeric(18,2),
    taxa_conversao_pct numeric(18,2),
    taxa_no_show_pct numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_vendas (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    leads_count integer DEFAULT 0 NOT NULL,
    mqls_count integer DEFAULT 0 NOT NULL,
    agendados_count integer DEFAULT 0 NOT NULL,
    reunioes_count integer DEFAULT 0 NOT NULL,
    fechados_count integer DEFAULT 0 NOT NULL,
    no_shows_count integer DEFAULT 0 NOT NULL,
    negociacao_count integer DEFAULT 0 NOT NULL,
    perdidos_count integer DEFAULT 0 NOT NULL,
    perdidos_apos_reuniao integer DEFAULT 0 NOT NULL,
    perdidos_sem_reuniao integer DEFAULT 0 NOT NULL,
    faturamento_bruto numeric(18,2) DEFAULT 0 NOT NULL,
    caixa_recebido numeric(18,2) DEFAULT 0 NOT NULL,
    valor_entrada numeric(18,2) DEFAULT 0 NOT NULL,
    ligacoes_count integer DEFAULT 0 NOT NULL,
    mensagens_count integer DEFAULT 0 NOT NULL,
    pessoas_contatadas integer DEFAULT 0 NOT NULL,
    avg_response_seconds integer,
    taxa_conversao_pct numeric(18,2),
    taxa_no_show_pct numeric(18,2),
    taxa_comparecimento_pct numeric(18,2),
    ciclo_fechamento_dias numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_metas (
    id bigint NOT NULL,
    snapshot_id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    dimension text DEFAULT 'todos'::text NOT NULL,
    dimension_value text DEFAULT 'todos'::text NOT NULL,
    sub_dimension text,
    sub_dimension_value text,
    meta_mql_target integer,
    meta_cpmql_target numeric(18,2),
    meta_spend_target numeric(18,2),
    meta_vendas_target integer,
    realizado_mql integer DEFAULT 0 NOT NULL,
    realizado_spend numeric(18,2) DEFAULT 0 NOT NULL,
    realizado_vendas integer DEFAULT 0 NOT NULL,
    realizado_faturamento numeric(18,2) DEFAULT 0 NOT NULL,
    realizado_caixa numeric(18,2) DEFAULT 0 NOT NULL,
    realizado_cpmql numeric(18,2),
    pct_atingido_mql numeric(18,2),
    pct_atingido_vendas numeric(18,2),
    pct_atingido_spend numeric(18,2),
    ideal_dia_mql numeric(18,2),
    ideal_dia_vendas numeric(18,2),
    extras jsonb DEFAULT '{}'::jsonb NOT NULL,
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.webhooks_ghl (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    processado_em timestamp with time zone,
    location_id text
);
CREATE TABLE IF NOT EXISTS public.weekly_cohort_audit (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    snapshot_id bigint NOT NULL,
    module text NOT NULL,
    metric text NOT NULL,
    dimension text DEFAULT 'todos'::text,
    dimension_value text DEFAULT 'todos'::text,
    old_value numeric,
    new_value numeric,
    delta numeric GENERATED ALWAYS AS ((new_value - COALESCE(old_value, (0)::numeric))) STORED,
    reason text NOT NULL,
    trigger_event text,
    trigger_record_id text,
    changed_by uuid DEFAULT auth.uid(),
    workspace_id uuid
);
CREATE TABLE IF NOT EXISTS public.weekly_email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    schedule_id uuid NOT NULL,
    week_start date,
    report_type text,
    recipient_emails text[],
    subject text,
    status text NOT NULL,
    resend_message_id text,
    error_message text,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    CONSTRAINT weekly_email_logs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'bounced'::text])))
);
CREATE TABLE IF NOT EXISTS public.weekly_email_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    modules text[] DEFAULT ARRAY['trafego'::text] NOT NULL,
    report_type text NOT NULL,
    dimensions text[] DEFAULT ARRAY['todos'::text],
    frequency text NOT NULL,
    day_of_week integer,
    day_of_month integer,
    time_of_day time without time zone DEFAULT '08:00:00'::time without time zone NOT NULL,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    last_run_at timestamp with time zone,
    next_run_at timestamp with time zone,
    subject text DEFAULT 'Relatório Semanal - Empire Business'::text NOT NULL,
    recipient_emails text[] NOT NULL,
    reply_to text,
    template_key text DEFAULT 'default'::text,
    include_comparative boolean DEFAULT true,
    include_trends boolean DEFAULT false,
    clara_prompt text,
    use_clara_summary boolean DEFAULT false,
    email_sent_count integer DEFAULT 0 NOT NULL,
    last_error text,
    CONSTRAINT weekly_email_schedules_day_of_month_check CHECK (((day_of_month IS NULL) OR ((day_of_month >= 1) AND (day_of_month <= 31)))),
    CONSTRAINT weekly_email_schedules_day_of_week_check CHECK (((day_of_week IS NULL) OR ((day_of_week >= 0) AND (day_of_week <= 6)))),
    CONSTRAINT weekly_email_schedules_frequency_check CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'biweekly'::text, 'monthly'::text]))),
    CONSTRAINT weekly_email_schedules_report_type_check CHECK ((report_type = ANY (ARRAY['cohort'::text, 'produtividade'::text])))
);
CREATE TABLE IF NOT EXISTS public.weekly_reprocess_queue (
    id bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    week_start date NOT NULL,
    report_type text NOT NULL,
    reason text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    error_message text,
    workspace_id uuid,
    CONSTRAINT weekly_reprocess_queue_report_type_check CHECK ((report_type = ANY (ARRAY['cohort'::text, 'produtividade'::text])))
);
CREATE TABLE IF NOT EXISTS public.workspace_apps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    app_slug text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    invited_by uuid,
    joined_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL,
    clara_habilitado boolean DEFAULT false NOT NULL,
    CONSTRAINT workspace_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])))
);
CREATE TABLE IF NOT EXISTS public.workspace_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    app_slug text DEFAULT 'criativos'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL
);

-- Sequences

CREATE SEQUENCE IF NOT EXISTS public.ghl_api_jobs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_aquisicao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_closer_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_cohort_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_metas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_organico_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_prevendas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_recuperacao_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_reprocess_queue_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_sdr_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_trafego_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.weekly_vendas_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- Constraints

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_campaigns_pkey') THEN ALTER TABLE ONLY public.ads_campaigns ADD CONSTRAINT ads_campaigns_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_campaigns_workspace_id_code_key') THEN ALTER TABLE ONLY public.ads_campaigns ADD CONSTRAINT ads_campaigns_workspace_id_code_key UNIQUE (workspace_id, code); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_catalog_pkey') THEN ALTER TABLE ONLY public.ads_catalog ADD CONSTRAINT ads_catalog_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_analysis_sessions_pkey') THEN ALTER TABLE ONLY public.ai_analysis_sessions ADD CONSTRAINT ai_analysis_sessions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_pkey') THEN ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_doc_chunks_doc_path_chunk_index_key') THEN ALTER TABLE ONLY public.ai_doc_chunks ADD CONSTRAINT ai_doc_chunks_doc_path_chunk_index_key UNIQUE (doc_path, chunk_index); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_doc_chunks_pkey') THEN ALTER TABLE ONLY public.ai_doc_chunks ADD CONSTRAINT ai_doc_chunks_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_doc_index_status_doc_path_key') THEN ALTER TABLE ONLY public.ai_doc_index_status ADD CONSTRAINT ai_doc_index_status_doc_path_key UNIQUE (doc_path); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_doc_index_status_pkey') THEN ALTER TABLE ONLY public.ai_doc_index_status ADD CONSTRAINT ai_doc_index_status_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_embeddings_pkey') THEN ALTER TABLE ONLY public.ai_embeddings ADD CONSTRAINT ai_embeddings_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_pkey') THEN ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aplic-acelerador_pkey') THEN ALTER TABLE ONLY public."aplic-acelerador" ADD CONSTRAINT "aplic-acelerador_pkey" PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_config_pkey') THEN ALTER TABLE ONLY public.app_config ADD CONSTRAINT app_config_pkey PRIMARY KEY (key); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_role_permissions_pkey') THEN ALTER TABLE ONLY public.app_feature_role_permissions ADD CONSTRAINT app_feature_role_permissions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_role_permissions_workspace_id_app_slug_feature__key') THEN ALTER TABLE ONLY public.app_feature_role_permissions ADD CONSTRAINT app_feature_role_permissions_workspace_id_app_slug_feature__key UNIQUE (workspace_id, app_slug, feature_key, role); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_user_overrides_pkey') THEN ALTER TABLE ONLY public.app_feature_user_overrides ADD CONSTRAINT app_feature_user_overrides_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_user_overrides_workspace_id_app_slug_feature_ke_key') THEN ALTER TABLE ONLY public.app_feature_user_overrides ADD CONSTRAINT app_feature_user_overrides_workspace_id_app_slug_feature_ke_key UNIQUE (workspace_id, app_slug, feature_key, user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_role_permissions_pkey') THEN ALTER TABLE ONLY public.app_role_permissions ADD CONSTRAINT app_role_permissions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_role_permissions_workspace_id_app_slug_role_key') THEN ALTER TABLE ONLY public.app_role_permissions ADD CONSTRAINT app_role_permissions_workspace_id_app_slug_role_key UNIQUE (workspace_id, app_slug, role); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_user_overrides_pkey') THEN ALTER TABLE ONLY public.app_user_overrides ADD CONSTRAINT app_user_overrides_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_user_overrides_workspace_id_app_slug_user_id_key') THEN ALTER TABLE ONLY public.app_user_overrides ADD CONSTRAINT app_user_overrides_workspace_id_app_slug_user_id_key UNIQUE (workspace_id, app_slug, user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'audit_log_pkey') THEN ALTER TABLE ONLY public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_audit_log_pkey') THEN ALTER TABLE ONLY public.auth_audit_log ADD CONSTRAINT auth_audit_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_password_reset_tokens_pkey') THEN ALTER TABLE ONLY public.auth_password_reset_tokens ADD CONSTRAINT auth_password_reset_tokens_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_password_reset_tokens_token_hash_key') THEN ALTER TABLE ONLY public.auth_password_reset_tokens ADD CONSTRAINT auth_password_reset_tokens_token_hash_key UNIQUE (token_hash); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_rate_limits_identifier_action_key') THEN ALTER TABLE ONLY public.auth_rate_limits ADD CONSTRAINT auth_rate_limits_identifier_action_key UNIQUE (identifier, action); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_rate_limits_pkey') THEN ALTER TABLE ONLY public.auth_rate_limits ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bot_context_pkey') THEN ALTER TABLE ONLY public.bot_context ADD CONSTRAINT bot_context_pkey PRIMARY KEY (key); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_pkey') THEN ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_workspace_id_name_key') THEN ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_workspace_id_name_key UNIQUE (workspace_id, name); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comunicacoes_ghl_message_id_key') THEN ALTER TABLE ONLY public.comunicacoes ADD CONSTRAINT comunicacoes_ghl_message_id_key UNIQUE (ghl_message_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comunicacoes_pkey') THEN ALTER TABLE ONLY public.comunicacoes ADD CONSTRAINT comunicacoes_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_opp_sync_queue_pkey') THEN ALTER TABLE ONLY public.contact_opp_sync_queue ADD CONSTRAINT contact_opp_sync_queue_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_ghl_id_key') THEN ALTER TABLE ONLY public.contatos ADD CONSTRAINT contatos_ghl_id_key UNIQUE (ghl_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_pkey') THEN ALTER TABLE ONLY public.contatos ADD CONSTRAINT contatos_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_log_pkey') THEN ALTER TABLE ONLY public.creative_audit_log ADD CONSTRAINT creative_audit_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_comments_pkey') THEN ALTER TABLE ONLY public.creative_comments ADD CONSTRAINT creative_comments_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_criteria_pkey') THEN ALTER TABLE ONLY public.creative_test_criteria ADD CONSTRAINT creative_test_criteria_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_criteria_workspace_id_key') THEN ALTER TABLE ONLY public.creative_test_criteria ADD CONSTRAINT creative_test_criteria_workspace_id_key UNIQUE (workspace_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_history_pkey') THEN ALTER TABLE ONLY public.creative_test_history ADD CONSTRAINT creative_test_history_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_pkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_validations_creative_id_key') THEN ALTER TABLE ONLY public.creative_validations ADD CONSTRAINT creative_validations_creative_id_key UNIQUE (creative_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_validations_pkey') THEN ALTER TABLE ONLY public.creative_validations ADD CONSTRAINT creative_validations_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_lead_filters_pkey') THEN ALTER TABLE ONLY public.dashboard_user_lead_filters ADD CONSTRAINT dashboard_user_lead_filters_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_permissions_pkey') THEN ALTER TABLE ONLY public.dashboard_user_permissions ADD CONSTRAINT dashboard_user_permissions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_permissions_workspace_id_user_id_module_key_key') THEN ALTER TABLE ONLY public.dashboard_user_permissions ADD CONSTRAINT dashboard_user_permissions_workspace_id_user_id_module_key_key UNIQUE (workspace_id, user_id, module_key); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discagem_scores_pkey') THEN ALTER TABLE ONLY public.discagem_scores ADD CONSTRAINT discagem_scores_pkey PRIMARY KEY (oportunidade_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_pkey') THEN ALTER TABLE ONLY public.disparo_campos_custom ADD CONSTRAINT disparo_campos_custom_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_valores_disparo_id_campo_id_key') THEN ALTER TABLE ONLY public.disparo_campos_custom_valores ADD CONSTRAINT disparo_campos_custom_valores_disparo_id_campo_id_key UNIQUE (disparo_id, campo_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_valores_pkey') THEN ALTER TABLE ONLY public.disparo_campos_custom_valores ADD CONSTRAINT disparo_campos_custom_valores_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_workspace_id_nome_campo_key') THEN ALTER TABLE ONLY public.disparo_campos_custom ADD CONSTRAINT disparo_campos_custom_workspace_id_nome_campo_key UNIQUE (workspace_id, nome_campo); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_tags_pkey') THEN ALTER TABLE ONLY public.disparo_tags ADD CONSTRAINT disparo_tags_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_tags_workspace_id_disparo_id_significado_key') THEN ALTER TABLE ONLY public.disparo_tags ADD CONSTRAINT disparo_tags_workspace_id_disparo_id_significado_key UNIQUE (workspace_id, disparo_id, significado); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_tags_workspace_id_disparo_id_tag_key') THEN ALTER TABLE ONLY public.disparo_tags ADD CONSTRAINT disparo_tags_workspace_id_disparo_id_tag_key UNIQUE (workspace_id, disparo_id, tag); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparos_pkey') THEN ALTER TABLE ONLY public.disparos ADD CONSTRAINT disparos_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparos_workspace_id_nome_key') THEN ALTER TABLE ONLY public.disparos ADD CONSTRAINT disparos_workspace_id_nome_key UNIQUE (workspace_id, nome); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'estado_uf_normalizacao_pkey') THEN ALTER TABLE ONLY public.estado_uf_normalizacao ADD CONSTRAINT estado_uf_normalizacao_pkey PRIMARY KEY (estado_raw); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnels_pkey') THEN ALTER TABLE ONLY public.funnels ADD CONSTRAINT funnels_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnels_workspace_id_nome_key') THEN ALTER TABLE ONLY public.funnels ADD CONSTRAINT funnels_workspace_id_nome_key UNIQUE (workspace_id, nome); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_api_jobs_pkey') THEN ALTER TABLE ONLY public.ghl_api_jobs ADD CONSTRAINT ghl_api_jobs_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_calendars_pkey') THEN ALTER TABLE ONLY public.ghl_calendars ADD CONSTRAINT ghl_calendars_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_calendars_workspace_id_ghl_id_key') THEN ALTER TABLE ONLY public.ghl_calendars ADD CONSTRAINT ghl_calendars_workspace_id_ghl_id_key UNIQUE (workspace_id, ghl_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_conversations_sync_log_pkey') THEN ALTER TABLE ONLY public.ghl_conversations_sync_log ADD CONSTRAINT ghl_conversations_sync_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_custom_field_mappings_ghl_custom_field_id_key') THEN ALTER TABLE ONLY public.ghl_custom_field_mappings ADD CONSTRAINT ghl_custom_field_mappings_ghl_custom_field_id_key UNIQUE (ghl_custom_field_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_custom_field_mappings_pkey') THEN ALTER TABLE ONLY public.ghl_custom_field_mappings ADD CONSTRAINT ghl_custom_field_mappings_pkey PRIMARY KEY (logical_name); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_discovery_runs_pkey') THEN ALTER TABLE ONLY public.ghl_discovery_runs ADD CONSTRAINT ghl_discovery_runs_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_field_mapping_templates_name_logical_name_key') THEN ALTER TABLE ONLY public.ghl_field_mapping_templates ADD CONSTRAINT ghl_field_mapping_templates_name_logical_name_key UNIQUE (name, logical_name); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_field_mapping_templates_pkey') THEN ALTER TABLE ONLY public.ghl_field_mapping_templates ADD CONSTRAINT ghl_field_mapping_templates_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_field_mappings_pkey') THEN ALTER TABLE ONLY public.ghl_field_mappings ADD CONSTRAINT ghl_field_mappings_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_field_mappings_workspace_id_logical_name_key') THEN ALTER TABLE ONLY public.ghl_field_mappings ADD CONSTRAINT ghl_field_mappings_workspace_id_logical_name_key UNIQUE (workspace_id, logical_name); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_integration_settings_pkey') THEN ALTER TABLE ONLY public.ghl_integration_settings ADD CONSTRAINT ghl_integration_settings_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_integration_settings_workspace_id_key') THEN ALTER TABLE ONLY public.ghl_integration_settings ADD CONSTRAINT ghl_integration_settings_workspace_id_key UNIQUE (workspace_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_opp_reconcile_items_pkey') THEN ALTER TABLE ONLY public.ghl_opp_reconcile_items ADD CONSTRAINT ghl_opp_reconcile_items_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_opp_reconcile_items_run_contact_unique') THEN ALTER TABLE ONLY public.ghl_opp_reconcile_items ADD CONSTRAINT ghl_opp_reconcile_items_run_contact_unique UNIQUE (run_id, ghl_contact_id, location_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_opp_reconcile_runs_pkey') THEN ALTER TABLE ONLY public.ghl_opp_reconcile_runs ADD CONSTRAINT ghl_opp_reconcile_runs_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_pipeline_mappings_pkey') THEN ALTER TABLE ONLY public.ghl_pipeline_mappings ADD CONSTRAINT ghl_pipeline_mappings_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_pipeline_mappings_workspace_id_ghl_pipeline_id_key') THEN ALTER TABLE ONLY public.ghl_pipeline_mappings ADD CONSTRAINT ghl_pipeline_mappings_workspace_id_ghl_pipeline_id_key UNIQUE (workspace_id, ghl_pipeline_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_stage_mappings_pkey') THEN ALTER TABLE ONLY public.ghl_stage_mappings ADD CONSTRAINT ghl_stage_mappings_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_stage_mappings_workspace_id_ghl_pipeline_id_ghl_stage_i_key') THEN ALTER TABLE ONLY public.ghl_stage_mappings ADD CONSTRAINT ghl_stage_mappings_workspace_id_ghl_pipeline_id_ghl_stage_i_key UNIQUE (workspace_id, ghl_pipeline_id, ghl_stage_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_tasks_ghl_task_id_key') THEN ALTER TABLE ONLY public.ghl_tasks ADD CONSTRAINT ghl_tasks_ghl_task_id_key UNIQUE (ghl_task_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_tasks_pkey') THEN ALTER TABLE ONLY public.ghl_tasks ADD CONSTRAINT ghl_tasks_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_users_ghl_id_key') THEN ALTER TABLE ONLY public.ghl_users ADD CONSTRAINT ghl_users_ghl_id_key UNIQUE (ghl_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_users_pkey') THEN ALTER TABLE ONLY public.ghl_users ADD CONSTRAINT ghl_users_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_definitions_pkey') THEN ALTER TABLE ONLY public.goal_definitions ADD CONSTRAINT goal_definitions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_definitions_workspace_metric_scope_key') THEN ALTER TABLE ONLY public.goal_definitions ADD CONSTRAINT goal_definitions_workspace_metric_scope_key UNIQUE (workspace_id, metric_definition_id, scope_type, scope_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_metric_definitions_area_metric_key') THEN ALTER TABLE ONLY public.goal_metric_definitions ADD CONSTRAINT goal_metric_definitions_area_metric_key UNIQUE (area_key, metric_key); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_metric_definitions_pkey') THEN ALTER TABLE ONLY public.goal_metric_definitions ADD CONSTRAINT goal_metric_definitions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_snapshots_goal_date_key') THEN ALTER TABLE ONLY public.goal_snapshots ADD CONSTRAINT goal_snapshots_goal_date_key UNIQUE (goal_version_id, snapshot_date); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_snapshots_pkey') THEN ALTER TABLE ONLY public.goal_snapshots ADD CONSTRAINT goal_snapshots_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_versions_goal_period_key') THEN ALTER TABLE ONLY public.goal_versions ADD CONSTRAINT goal_versions_goal_period_key UNIQUE (goal_definition_id, period_start, period_end); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_versions_no_overlap') THEN ALTER TABLE ONLY public.goal_versions ADD CONSTRAINT goal_versions_no_overlap EXCLUDE USING gist (goal_definition_id WITH =, daterange(period_start, period_end, '[]'::text) WITH &&); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_versions_pkey') THEN ALTER TABLE ONLY public.goal_versions ADD CONSTRAINT goal_versions_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idx_meta_ads_breakdowns_unique_region') THEN ALTER TABLE ONLY public.meta_ads_insights_breakdowns ADD CONSTRAINT idx_meta_ads_breakdowns_unique_region UNIQUE (insights_id, region, country); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maquina_de_conteudo_pkey') THEN ALTER TABLE ONLY public.maquina_de_conteudo ADD CONSTRAINT maquina_de_conteudo_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maquina_de_conteudo_transacao_id_key') THEN ALTER TABLE ONLY public.maquina_de_conteudo ADD CONSTRAINT maquina_de_conteudo_transacao_id_key UNIQUE (transacao_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_backfill_controle_pkey') THEN ALTER TABLE ONLY public.meta_ads_backfill_controle ADD CONSTRAINT meta_ads_backfill_controle_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_backfill_log_controle_id_data_key') THEN ALTER TABLE ONLY public.meta_ads_backfill_log ADD CONSTRAINT meta_ads_backfill_log_controle_id_data_key UNIQUE (controle_id, data); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_backfill_log_pkey') THEN ALTER TABLE ONLY public.meta_ads_backfill_log ADD CONSTRAINT meta_ads_backfill_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_campaigns_campaign_id_key') THEN ALTER TABLE ONLY public.meta_ads_campaigns ADD CONSTRAINT meta_ads_campaigns_campaign_id_key UNIQUE (campaign_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_campaigns_pkey') THEN ALTER TABLE ONLY public.meta_ads_campaigns ADD CONSTRAINT meta_ads_campaigns_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_insights_ad_id_date_key') THEN ALTER TABLE ONLY public.meta_ads_insights ADD CONSTRAINT meta_ads_insights_ad_id_date_key UNIQUE (ad_id, date); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_insights_breakdowns_pkey') THEN ALTER TABLE ONLY public.meta_ads_insights_breakdowns ADD CONSTRAINT meta_ads_insights_breakdowns_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_insights_date_hour_ad_id_key') THEN ALTER TABLE ONLY public.meta_ads_insights ADD CONSTRAINT meta_ads_insights_date_hour_ad_id_key UNIQUE (date, hour, ad_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_insights_pkey') THEN ALTER TABLE ONLY public.meta_ads_insights ADD CONSTRAINT meta_ads_insights_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_permalinks_pkey') THEN ALTER TABLE ONLY public.meta_ads_permalinks ADD CONSTRAINT meta_ads_permalinks_pkey PRIMARY KEY (ad_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_raw_insights_pkey') THEN ALTER TABLE ONLY public.meta_ads_raw_insights ADD CONSTRAINT meta_ads_raw_insights_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_region_mapping_pkey') THEN ALTER TABLE ONLY public.meta_ads_region_mapping ADD CONSTRAINT meta_ads_region_mapping_pkey PRIMARY KEY (region_name); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_sync_log_pkey') THEN ALTER TABLE ONLY public.meta_ads_sync_log ADD CONSTRAINT meta_ads_sync_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metas_pkey') THEN ALTER TABLE ONLY public.metas ADD CONSTRAINT metas_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metas_sem_sobreposicao') THEN ALTER TABLE ONLY public.metas ADD CONSTRAINT metas_sem_sobreposicao EXCLUDE USING gist (workspace_id WITH =, tipo WITH =, referencia WITH =, daterange(periodo_inicio, periodo_fim, '[]'::text) WITH &&); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'metas_workspace_tipo_referencia_periodo_key') THEN ALTER TABLE ONLY public.metas ADD CONSTRAINT metas_workspace_tipo_referencia_periodo_key UNIQUE (workspace_id, tipo, referencia, periodo_inicio, periodo_fim); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_creatives_pkey') THEN ALTER TABLE ONLY public.notion_creatives ADD CONSTRAINT notion_creatives_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_creatives_workspace_id_notion_page_id_key') THEN ALTER TABLE ONLY public.notion_creatives ADD CONSTRAINT notion_creatives_workspace_id_notion_page_id_key UNIQUE (workspace_id, notion_page_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_sync_runs_pkey') THEN ALTER TABLE ONLY public.notion_sync_runs ADD CONSTRAINT notion_sync_runs_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_ghl_opportunity_id_key') THEN ALTER TABLE ONLY public.oportunidades ADD CONSTRAINT oportunidades_ghl_opportunity_id_key UNIQUE (ghl_opportunity_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_pkey') THEN ALTER TABLE ONLY public.oportunidades ADD CONSTRAINT oportunidades_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_catalog_pkey') THEN ALTER TABLE ONLY public.organic_catalog ADD CONSTRAINT organic_catalog_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_investment_items_pkey') THEN ALTER TABLE ONLY public.organic_investment_items ADD CONSTRAINT organic_investment_items_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_investments_pkey') THEN ALTER TABLE ONLY public.organic_investments ADD CONSTRAINT organic_investments_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_audit_log_pkey') THEN ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prevendas_ai_insights_pkey') THEN ALTER TABLE ONLY public.prevendas_ai_insights ADD CONSTRAINT prevendas_ai_insights_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prevendas_ai_insights_workspace_id_input_hash_key') THEN ALTER TABLE ONLY public.prevendas_ai_insights ADD CONSTRAINT prevendas_ai_insights_workspace_id_input_hash_key UNIQUE (workspace_id, input_hash); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reunioes_pkey') THEN ALTER TABLE ONLY public.reunioes ADD CONSTRAINT reunioes_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_process_assignments_pkey') THEN ALTER TABLE ONLY public.sales_process_assignments ADD CONSTRAINT sales_process_assignments_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_process_assignments_workspace_id_utm_campaign_id_key') THEN ALTER TABLE ONLY public.sales_process_assignments ADD CONSTRAINT sales_process_assignments_workspace_id_utm_campaign_id_key UNIQUE (workspace_id, utm_campaign_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_processes_pkey') THEN ALTER TABLE ONLY public.sales_processes ADD CONSTRAINT sales_processes_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_processes_workspace_id_nome_key') THEN ALTER TABLE ONLY public.sales_processes ADD CONSTRAINT sales_processes_workspace_id_nome_key UNIQUE (workspace_id, nome); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sdr_ia_config_pkey') THEN ALTER TABLE ONLY public.sdr_ia_config ADD CONSTRAINT sdr_ia_config_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sdr_ia_config_workspace_id_key') THEN ALTER TABLE ONLY public.sdr_ia_config ADD CONSTRAINT sdr_ia_config_workspace_id_key UNIQUE (workspace_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'secrets_pkey') THEN ALTER TABLE ONLY public.secrets ADD CONSTRAINT secrets_pkey PRIMARY KEY (key); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stevo_whatsapp_calls_call_id_key') THEN ALTER TABLE ONLY public.stevo_whatsapp_calls ADD CONSTRAINT stevo_whatsapp_calls_call_id_key UNIQUE (call_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stevo_whatsapp_calls_pkey') THEN ALTER TABLE ONLY public.stevo_whatsapp_calls ADD CONSTRAINT stevo_whatsapp_calls_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'telegram_allowed_users_pkey') THEN ALTER TABLE ONLY public.telegram_allowed_users ADD CONSTRAINT telegram_allowed_users_pkey PRIMARY KEY (telegram_user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uk_vendas_fechamento_oportunidade_id') THEN ALTER TABLE ONLY public.vendas_fechamento ADD CONSTRAINT uk_vendas_fechamento_oportunidade_id UNIQUE (oportunidade_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_aquisicao_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_aquisicao ADD CONSTRAINT uq_weekly_aquisicao_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_closer_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_closer ADD CONSTRAINT uq_weekly_closer_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_metas_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_metas ADD CONSTRAINT uq_weekly_metas_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_organico_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_organico ADD CONSTRAINT uq_weekly_organico_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_prevendas_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_prevendas ADD CONSTRAINT uq_weekly_prevendas_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_recuperacao_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_recuperacao ADD CONSTRAINT uq_weekly_recuperacao_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_reprocess_queue') THEN ALTER TABLE ONLY public.weekly_reprocess_queue ADD CONSTRAINT uq_weekly_reprocess_queue UNIQUE (workspace_id, week_start, report_type, reason); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_sdr_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_sdr ADD CONSTRAINT uq_weekly_sdr_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_snapshots_workspace_week_type') THEN ALTER TABLE ONLY public.weekly_snapshots ADD CONSTRAINT uq_weekly_snapshots_workspace_week_type UNIQUE (workspace_id, week_start, report_type); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_trafego_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_trafego ADD CONSTRAINT uq_weekly_trafego_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_weekly_vendas_snapshot_dim') THEN ALTER TABLE ONLY public.weekly_vendas ADD CONSTRAINT uq_weekly_vendas_snapshot_dim UNIQUE (snapshot_id, dimension, dimension_value, sub_dimension, sub_dimension_value); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_campaigns_pkey') THEN ALTER TABLE ONLY public.utm_campaigns ADD CONSTRAINT utm_campaigns_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_campaigns_workspace_id_utm_campaign_key') THEN ALTER TABLE ONLY public.utm_campaigns ADD CONSTRAINT utm_campaigns_workspace_id_utm_campaign_key UNIQUE (workspace_id, utm_campaign); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_mediums_pkey') THEN ALTER TABLE ONLY public.utm_mediums ADD CONSTRAINT utm_mediums_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_mediums_workspace_id_utm_medium_key') THEN ALTER TABLE ONLY public.utm_mediums ADD CONSTRAINT utm_mediums_workspace_id_utm_medium_key UNIQUE (workspace_id, utm_medium); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_objectives_pkey') THEN ALTER TABLE ONLY public.utm_objectives ADD CONSTRAINT utm_objectives_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_objectives_workspace_id_objective_code_key') THEN ALTER TABLE ONLY public.utm_objectives ADD CONSTRAINT utm_objectives_workspace_id_objective_code_key UNIQUE (workspace_id, objective_code); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_origins_pkey') THEN ALTER TABLE ONLY public.utm_origins ADD CONSTRAINT utm_origins_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_origins_workspace_id_nome_key') THEN ALTER TABLE ONLY public.utm_origins ADD CONSTRAINT utm_origins_workspace_id_nome_key UNIQUE (workspace_id, nome); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_slugs_pkey') THEN ALTER TABLE ONLY public.utm_slugs ADD CONSTRAINT utm_slugs_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_slugs_workspace_id_nome_key') THEN ALTER TABLE ONLY public.utm_slugs ADD CONSTRAINT utm_slugs_workspace_id_nome_key UNIQUE (workspace_id, nome); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_slugs_workspace_id_slug_key') THEN ALTER TABLE ONLY public.utm_slugs ADD CONSTRAINT utm_slugs_workspace_id_slug_key UNIQUE (workspace_id, slug); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_source_origin_assignments_pkey') THEN ALTER TABLE ONLY public.utm_source_origin_assignments ADD CONSTRAINT utm_source_origin_assignments_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_source_origin_assignments_workspace_id_utm_source_key') THEN ALTER TABLE ONLY public.utm_source_origin_assignments ADD CONSTRAINT utm_source_origin_assignments_workspace_id_utm_source_key UNIQUE (workspace_id, utm_source); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_sources_pkey') THEN ALTER TABLE ONLY public.utm_sources ADD CONSTRAINT utm_sources_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_sources_plain_pkey') THEN ALTER TABLE ONLY public.utm_sources_plain ADD CONSTRAINT utm_sources_plain_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_sources_plain_workspace_id_utm_source_key') THEN ALTER TABLE ONLY public.utm_sources_plain ADD CONSTRAINT utm_sources_plain_workspace_id_utm_source_key UNIQUE (workspace_id, utm_source); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_sources_workspace_id_utm_source_key') THEN ALTER TABLE ONLY public.utm_sources ADD CONSTRAINT utm_sources_workspace_id_utm_source_key UNIQUE (workspace_id, utm_source); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_terms_pkey') THEN ALTER TABLE ONLY public.utm_terms ADD CONSTRAINT utm_terms_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_terms_workspace_id_utm_term_key') THEN ALTER TABLE ONLY public.utm_terms ADD CONSTRAINT utm_terms_workspace_id_utm_term_key UNIQUE (workspace_id, utm_term); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_fechamento_oportunidade_id_unique') THEN ALTER TABLE ONLY public.vendas_fechamento ADD CONSTRAINT vendas_fechamento_oportunidade_id_unique UNIQUE (oportunidade_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_fechamento_pkey') THEN ALTER TABLE ONLY public.vendas_fechamento ADD CONSTRAINT vendas_fechamento_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'webhooks_ghl_pkey') THEN ALTER TABLE ONLY public.webhooks_ghl ADD CONSTRAINT webhooks_ghl_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_aquisicao_pkey') THEN ALTER TABLE ONLY public.weekly_aquisicao ADD CONSTRAINT weekly_aquisicao_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_closer_pkey') THEN ALTER TABLE ONLY public.weekly_closer ADD CONSTRAINT weekly_closer_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_cohort_audit_pkey') THEN ALTER TABLE ONLY public.weekly_cohort_audit ADD CONSTRAINT weekly_cohort_audit_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_email_logs_pkey') THEN ALTER TABLE ONLY public.weekly_email_logs ADD CONSTRAINT weekly_email_logs_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_email_schedules_pkey') THEN ALTER TABLE ONLY public.weekly_email_schedules ADD CONSTRAINT weekly_email_schedules_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_metas_pkey') THEN ALTER TABLE ONLY public.weekly_metas ADD CONSTRAINT weekly_metas_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_organico_pkey') THEN ALTER TABLE ONLY public.weekly_organico ADD CONSTRAINT weekly_organico_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_prevendas_pkey') THEN ALTER TABLE ONLY public.weekly_prevendas ADD CONSTRAINT weekly_prevendas_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_recuperacao_pkey') THEN ALTER TABLE ONLY public.weekly_recuperacao ADD CONSTRAINT weekly_recuperacao_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_reprocess_queue_pkey') THEN ALTER TABLE ONLY public.weekly_reprocess_queue ADD CONSTRAINT weekly_reprocess_queue_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_sdr_pkey') THEN ALTER TABLE ONLY public.weekly_sdr ADD CONSTRAINT weekly_sdr_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_snapshots_pkey') THEN ALTER TABLE ONLY public.weekly_snapshots ADD CONSTRAINT weekly_snapshots_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_trafego_pkey') THEN ALTER TABLE ONLY public.weekly_trafego ADD CONSTRAINT weekly_trafego_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_vendas_pkey') THEN ALTER TABLE ONLY public.weekly_vendas ADD CONSTRAINT weekly_vendas_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_pricing_config_pkey') THEN ALTER TABLE ONLY public.whatsapp_pricing_config ADD CONSTRAINT whatsapp_pricing_config_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_pricing_config_workspace_id_key') THEN ALTER TABLE ONLY public.whatsapp_pricing_config ADD CONSTRAINT whatsapp_pricing_config_workspace_id_key UNIQUE (workspace_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_apps_pkey') THEN ALTER TABLE ONLY public.workspace_apps ADD CONSTRAINT workspace_apps_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_apps_workspace_id_app_slug_key') THEN ALTER TABLE ONLY public.workspace_apps ADD CONSTRAINT workspace_apps_workspace_id_app_slug_key UNIQUE (workspace_id, app_slug); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_pkey') THEN ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_id_user_id_key') THEN ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_user_id_key UNIQUE (workspace_id, user_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_settings_pkey') THEN ALTER TABLE ONLY public.workspace_settings ADD CONSTRAINT workspace_settings_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_settings_workspace_id_app_slug_key') THEN ALTER TABLE ONLY public.workspace_settings ADD CONSTRAINT workspace_settings_workspace_id_app_slug_key UNIQUE (workspace_id, app_slug); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_pkey') THEN ALTER TABLE ONLY public.workspaces ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_campaigns_workspace_id_fkey') THEN ALTER TABLE ONLY public.ads_campaigns ADD CONSTRAINT ads_campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ads_catalog_workspace_id_fkey') THEN ALTER TABLE ONLY public.ads_catalog ADD CONSTRAINT ads_catalog_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_user_id_fkey') THEN ALTER TABLE ONLY public.ai_conversations ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_messages_conversation_id_fkey') THEN ALTER TABLE ONLY public.ai_messages ADD CONSTRAINT ai_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_conversations(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_role_permissions_workspace_id_fkey') THEN ALTER TABLE ONLY public.app_feature_role_permissions ADD CONSTRAINT app_feature_role_permissions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_user_overrides_granted_by_fkey') THEN ALTER TABLE ONLY public.app_feature_user_overrides ADD CONSTRAINT app_feature_user_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_user_overrides_user_id_fkey') THEN ALTER TABLE ONLY public.app_feature_user_overrides ADD CONSTRAINT app_feature_user_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_feature_user_overrides_workspace_id_fkey') THEN ALTER TABLE ONLY public.app_feature_user_overrides ADD CONSTRAINT app_feature_user_overrides_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_role_permissions_workspace_id_fkey') THEN ALTER TABLE ONLY public.app_role_permissions ADD CONSTRAINT app_role_permissions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_user_overrides_granted_by_fkey') THEN ALTER TABLE ONLY public.app_user_overrides ADD CONSTRAINT app_user_overrides_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_user_overrides_user_id_fkey') THEN ALTER TABLE ONLY public.app_user_overrides ADD CONSTRAINT app_user_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'app_user_overrides_workspace_id_fkey') THEN ALTER TABLE ONLY public.app_user_overrides ADD CONSTRAINT app_user_overrides_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_audit_log_user_id_fkey') THEN ALTER TABLE ONLY public.auth_audit_log ADD CONSTRAINT auth_audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_password_reset_tokens_user_id_fkey') THEN ALTER TABLE ONLY public.auth_password_reset_tokens ADD CONSTRAINT auth_password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_created_by_fkey') THEN ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_workspace_id_fkey') THEN ALTER TABLE ONLY public.campaigns ADD CONSTRAINT campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comunicacoes_contato_id_fkey') THEN ALTER TABLE ONLY public.comunicacoes ADD CONSTRAINT comunicacoes_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_workspace_id_fkey') THEN ALTER TABLE ONLY public.contatos ADD CONSTRAINT contatos_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_log_changed_by_fkey') THEN ALTER TABLE ONLY public.creative_audit_log ADD CONSTRAINT creative_audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_log_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_audit_log ADD CONSTRAINT creative_audit_log_creative_id_fkey FOREIGN KEY (creative_id) REFERENCES public.notion_creatives(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_audit_log_workspace_id_fkey') THEN ALTER TABLE ONLY public.creative_audit_log ADD CONSTRAINT creative_audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_comments_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_comments ADD CONSTRAINT creative_comments_creative_id_fkey FOREIGN KEY (creative_id) REFERENCES public.notion_creatives(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_comments_parent_id_fkey') THEN ALTER TABLE ONLY public.creative_comments ADD CONSTRAINT creative_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.creative_comments(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_comments_user_id_fkey') THEN ALTER TABLE ONLY public.creative_comments ADD CONSTRAINT creative_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_comments_workspace_id_fkey') THEN ALTER TABLE ONLY public.creative_comments ADD CONSTRAINT creative_comments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_criteria_updated_by_fkey') THEN ALTER TABLE ONLY public.creative_test_criteria ADD CONSTRAINT creative_test_criteria_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_criteria_workspace_id_fkey') THEN ALTER TABLE ONLY public.creative_test_criteria ADD CONSTRAINT creative_test_criteria_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_history_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_test_history ADD CONSTRAINT creative_test_history_creative_id_fkey FOREIGN KEY (creative_id) REFERENCES public.notion_creatives(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_history_performed_by_fkey') THEN ALTER TABLE ONLY public.creative_test_history ADD CONSTRAINT creative_test_history_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_history_test_id_fkey') THEN ALTER TABLE ONLY public.creative_test_history ADD CONSTRAINT creative_test_history_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.creative_tests(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_test_history_workspace_id_fkey') THEN ALTER TABLE ONLY public.creative_test_history ADD CONSTRAINT creative_test_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_control_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_control_creative_id_fkey FOREIGN KEY (control_creative_id) REFERENCES public.notion_creatives(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_created_by_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_creative_id_fkey FOREIGN KEY (creative_id) REFERENCES public.notion_creatives(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_criteria_id_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_criteria_id_fkey FOREIGN KEY (criteria_id) REFERENCES public.creative_test_criteria(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_decided_by_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_variant_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_variant_creative_id_fkey FOREIGN KEY (variant_creative_id) REFERENCES public.notion_creatives(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_winner_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_winner_creative_id_fkey FOREIGN KEY (winner_creative_id) REFERENCES public.notion_creatives(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_tests_workspace_id_fkey') THEN ALTER TABLE ONLY public.creative_tests ADD CONSTRAINT creative_tests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_validations_creative_id_fkey') THEN ALTER TABLE ONLY public.creative_validations ADD CONSTRAINT creative_validations_creative_id_fkey FOREIGN KEY (creative_id) REFERENCES public.notion_creatives(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_validations_validated_by_fkey') THEN ALTER TABLE ONLY public.creative_validations ADD CONSTRAINT creative_validations_validated_by_fkey FOREIGN KEY (validated_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'creative_validations_workspace_id_fkey') THEN ALTER TABLE ONLY public.creative_validations ADD CONSTRAINT creative_validations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_lead_filters_created_by_fkey') THEN ALTER TABLE ONLY public.dashboard_user_lead_filters ADD CONSTRAINT dashboard_user_lead_filters_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_lead_filters_user_id_fkey') THEN ALTER TABLE ONLY public.dashboard_user_lead_filters ADD CONSTRAINT dashboard_user_lead_filters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_lead_filters_workspace_id_fkey') THEN ALTER TABLE ONLY public.dashboard_user_lead_filters ADD CONSTRAINT dashboard_user_lead_filters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_permissions_granted_by_fkey') THEN ALTER TABLE ONLY public.dashboard_user_permissions ADD CONSTRAINT dashboard_user_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_permissions_user_id_fkey') THEN ALTER TABLE ONLY public.dashboard_user_permissions ADD CONSTRAINT dashboard_user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_user_permissions_workspace_id_fkey') THEN ALTER TABLE ONLY public.dashboard_user_permissions ADD CONSTRAINT dashboard_user_permissions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discagem_scores_oportunidade_id_fkey') THEN ALTER TABLE ONLY public.discagem_scores ADD CONSTRAINT discagem_scores_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES public.oportunidades(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discagem_scores_workspace_id_fkey') THEN ALTER TABLE ONLY public.discagem_scores ADD CONSTRAINT discagem_scores_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_valores_campo_id_fkey') THEN ALTER TABLE ONLY public.disparo_campos_custom_valores ADD CONSTRAINT disparo_campos_custom_valores_campo_id_fkey FOREIGN KEY (campo_id) REFERENCES public.disparo_campos_custom(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_valores_disparo_id_fkey') THEN ALTER TABLE ONLY public.disparo_campos_custom_valores ADD CONSTRAINT disparo_campos_custom_valores_disparo_id_fkey FOREIGN KEY (disparo_id) REFERENCES public.disparos(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_valores_workspace_id_fkey') THEN ALTER TABLE ONLY public.disparo_campos_custom_valores ADD CONSTRAINT disparo_campos_custom_valores_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_campos_custom_workspace_id_fkey') THEN ALTER TABLE ONLY public.disparo_campos_custom ADD CONSTRAINT disparo_campos_custom_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_tags_disparo_id_fkey') THEN ALTER TABLE ONLY public.disparo_tags ADD CONSTRAINT disparo_tags_disparo_id_fkey FOREIGN KEY (disparo_id) REFERENCES public.disparos(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparo_tags_workspace_id_fkey') THEN ALTER TABLE ONLY public.disparo_tags ADD CONSTRAINT disparo_tags_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'disparos_workspace_id_fkey') THEN ALTER TABLE ONLY public.disparos ADD CONSTRAINT disparos_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funnels_workspace_id_fkey') THEN ALTER TABLE ONLY public.funnels ADD CONSTRAINT funnels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_calendars_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_calendars ADD CONSTRAINT ghl_calendars_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_discovery_runs_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_discovery_runs ADD CONSTRAINT ghl_discovery_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_field_mappings_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_field_mappings ADD CONSTRAINT ghl_field_mappings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_integration_settings_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_integration_settings ADD CONSTRAINT ghl_integration_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_opp_reconcile_items_contato_id_fkey') THEN ALTER TABLE ONLY public.ghl_opp_reconcile_items ADD CONSTRAINT ghl_opp_reconcile_items_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_opp_reconcile_items_run_id_fkey') THEN ALTER TABLE ONLY public.ghl_opp_reconcile_items ADD CONSTRAINT ghl_opp_reconcile_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ghl_opp_reconcile_runs(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_pipeline_mappings_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_pipeline_mappings ADD CONSTRAINT ghl_pipeline_mappings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_stage_mappings_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_stage_mappings ADD CONSTRAINT ghl_stage_mappings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_tasks_contato_id_fkey') THEN ALTER TABLE ONLY public.ghl_tasks ADD CONSTRAINT ghl_tasks_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_users_auth_user_id_fkey') THEN ALTER TABLE ONLY public.ghl_users ADD CONSTRAINT ghl_users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ghl_users_workspace_id_fkey') THEN ALTER TABLE ONLY public.ghl_users ADD CONSTRAINT ghl_users_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_definitions_metric_definition_id_fkey') THEN ALTER TABLE ONLY public.goal_definitions ADD CONSTRAINT goal_definitions_metric_definition_id_fkey FOREIGN KEY (metric_definition_id) REFERENCES public.goal_metric_definitions(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_definitions_workspace_id_fkey') THEN ALTER TABLE ONLY public.goal_definitions ADD CONSTRAINT goal_definitions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_snapshots_goal_version_id_fkey') THEN ALTER TABLE ONLY public.goal_snapshots ADD CONSTRAINT goal_snapshots_goal_version_id_fkey FOREIGN KEY (goal_version_id) REFERENCES public.goal_versions(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goal_versions_goal_definition_id_fkey') THEN ALTER TABLE ONLY public.goal_versions ADD CONSTRAINT goal_versions_goal_definition_id_fkey FOREIGN KEY (goal_definition_id) REFERENCES public.goal_definitions(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_backfill_log_controle_id_fkey') THEN ALTER TABLE ONLY public.meta_ads_backfill_log ADD CONSTRAINT meta_ads_backfill_log_controle_id_fkey FOREIGN KEY (controle_id) REFERENCES public.meta_ads_backfill_controle(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_insights_breakdowns_insights_id_fkey') THEN ALTER TABLE ONLY public.meta_ads_insights_breakdowns ADD CONSTRAINT meta_ads_insights_breakdowns_insights_id_fkey FOREIGN KEY (insights_id) REFERENCES public.meta_ads_insights(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meta_ads_insights_raw_insight_id_fkey') THEN ALTER TABLE ONLY public.meta_ads_insights ADD CONSTRAINT meta_ads_insights_raw_insight_id_fkey FOREIGN KEY (raw_insight_id) REFERENCES public.meta_ads_raw_insights(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_creatives_assigned_to_fkey') THEN ALTER TABLE ONLY public.notion_creatives ADD CONSTRAINT notion_creatives_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_creatives_campaign_id_fkey') THEN ALTER TABLE ONLY public.notion_creatives ADD CONSTRAINT notion_creatives_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_creatives_created_by_fkey') THEN ALTER TABLE ONLY public.notion_creatives ADD CONSTRAINT notion_creatives_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_creatives_workspace_id_fkey') THEN ALTER TABLE ONLY public.notion_creatives ADD CONSTRAINT notion_creatives_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notion_sync_runs_workspace_id_fkey') THEN ALTER TABLE ONLY public.notion_sync_runs ADD CONSTRAINT notion_sync_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_contato_id_fkey') THEN ALTER TABLE ONLY public.oportunidades ADD CONSTRAINT oportunidades_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_catalog_workspace_id_fkey') THEN ALTER TABLE ONLY public.organic_catalog ADD CONSTRAINT organic_catalog_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_investment_items_workspace_id_fkey') THEN ALTER TABLE ONLY public.organic_investment_items ADD CONSTRAINT organic_investment_items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_investments_item_id_fkey') THEN ALTER TABLE ONLY public.organic_investments ADD CONSTRAINT organic_investments_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.organic_investment_items(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organic_investments_workspace_id_fkey') THEN ALTER TABLE ONLY public.organic_investments ADD CONSTRAINT organic_investments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_audit_log_performed_by_fkey') THEN ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_audit_log_target_user_id_fkey') THEN ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'permission_audit_log_workspace_id_fkey') THEN ALTER TABLE ONLY public.permission_audit_log ADD CONSTRAINT permission_audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reunioes_contato_id_fkey') THEN ALTER TABLE ONLY public.reunioes ADD CONSTRAINT reunioes_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reunioes_oportunidade_id_fkey') THEN ALTER TABLE ONLY public.reunioes ADD CONSTRAINT reunioes_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES public.oportunidades(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_process_assignments_sales_process_id_fkey') THEN ALTER TABLE ONLY public.sales_process_assignments ADD CONSTRAINT sales_process_assignments_sales_process_id_fkey FOREIGN KEY (sales_process_id) REFERENCES public.sales_processes(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_process_assignments_utm_campaign_id_fkey') THEN ALTER TABLE ONLY public.sales_process_assignments ADD CONSTRAINT sales_process_assignments_utm_campaign_id_fkey FOREIGN KEY (utm_campaign_id) REFERENCES public.utm_campaigns(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_process_assignments_workspace_id_fkey') THEN ALTER TABLE ONLY public.sales_process_assignments ADD CONSTRAINT sales_process_assignments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_processes_workspace_id_fkey') THEN ALTER TABLE ONLY public.sales_processes ADD CONSTRAINT sales_processes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sdr_ia_config_workspace_id_fkey') THEN ALTER TABLE ONLY public.sdr_ia_config ADD CONSTRAINT sdr_ia_config_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_campaigns_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_campaigns ADD CONSTRAINT utm_campaigns_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_mediums_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_mediums ADD CONSTRAINT utm_mediums_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_objectives_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_objectives ADD CONSTRAINT utm_objectives_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_origins_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_origins ADD CONSTRAINT utm_origins_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_slugs_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_slugs ADD CONSTRAINT utm_slugs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_source_origin_assignments_origin_id_fkey') THEN ALTER TABLE ONLY public.utm_source_origin_assignments ADD CONSTRAINT utm_source_origin_assignments_origin_id_fkey FOREIGN KEY (origin_id) REFERENCES public.utm_origins(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_source_origin_assignments_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_source_origin_assignments ADD CONSTRAINT utm_source_origin_assignments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_sources_plain_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_sources_plain ADD CONSTRAINT utm_sources_plain_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_sources_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_sources ADD CONSTRAINT utm_sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utm_terms_workspace_id_fkey') THEN ALTER TABLE ONLY public.utm_terms ADD CONSTRAINT utm_terms_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_fechamento_contato_id_fkey') THEN ALTER TABLE ONLY public.vendas_fechamento ADD CONSTRAINT vendas_fechamento_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vendas_fechamento_oportunidade_id_fkey') THEN ALTER TABLE ONLY public.vendas_fechamento ADD CONSTRAINT vendas_fechamento_oportunidade_id_fkey FOREIGN KEY (oportunidade_id) REFERENCES public.oportunidades(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_aquisicao_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_aquisicao ADD CONSTRAINT weekly_aquisicao_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_closer_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_closer ADD CONSTRAINT weekly_closer_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_cohort_audit_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_cohort_audit ADD CONSTRAINT weekly_cohort_audit_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_email_logs_schedule_id_fkey') THEN ALTER TABLE ONLY public.weekly_email_logs ADD CONSTRAINT weekly_email_logs_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.weekly_email_schedules(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_email_schedules_created_by_fkey') THEN ALTER TABLE ONLY public.weekly_email_schedules ADD CONSTRAINT weekly_email_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_metas_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_metas ADD CONSTRAINT weekly_metas_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_organico_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_organico ADD CONSTRAINT weekly_organico_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_prevendas_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_prevendas ADD CONSTRAINT weekly_prevendas_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_recuperacao_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_recuperacao ADD CONSTRAINT weekly_recuperacao_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_sdr_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_sdr ADD CONSTRAINT weekly_sdr_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_trafego_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_trafego ADD CONSTRAINT weekly_trafego_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_vendas_snapshot_id_fkey') THEN ALTER TABLE ONLY public.weekly_vendas ADD CONSTRAINT weekly_vendas_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.weekly_snapshots(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_pricing_config_workspace_id_fkey') THEN ALTER TABLE ONLY public.whatsapp_pricing_config ADD CONSTRAINT whatsapp_pricing_config_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_apps_workspace_id_fkey') THEN ALTER TABLE ONLY public.workspace_apps ADD CONSTRAINT workspace_apps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_invited_by_fkey') THEN ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT workspace_members_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_user_id_fkey') THEN ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_id_fkey') THEN ALTER TABLE ONLY public.workspace_members ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspace_settings_workspace_id_fkey') THEN ALTER TABLE ONLY public.workspace_settings ADD CONSTRAINT workspace_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_owner_id_fkey') THEN ALTER TABLE ONLY public.workspaces ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id); END IF; END $$;

-- Funcoes


CREATE OR REPLACE FUNCTION public.analisar_comunicacoes(p_start_date date, p_end_date date, p_group_by text DEFAULT 'none'::text, p_sdr_name text DEFAULT NULL::text, p_channel text DEFAULT NULL::text, p_direction text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, total_mensagens bigint, mensagens_enviadas bigint, mensagens_recebidas bigint, ligacoes bigint, ligacoes_atendidas bigint, tempo_medio_resposta_minutos numeric, leads_contatados bigint, mqls_contatados bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      c.id,
      c.contato_id,
      c.channel,
      c.direction,
      c.tipo,
      c.msg_status,
      c.phone_call_status,
      c.data_comunicacao,
      c.ghl_source,
      c.ghl_conversation_id,
      COALESCE(c.sdr_name, ct.owner_name) AS sdr_name,
      ct.tags
    FROM comunicacoes c
    LEFT JOIN contatos ct ON ct.id = c.contato_id
    LEFT JOIN oportunidades o ON o.id = c.oportunidade_id
    WHERE c.data_comunicacao >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND c.data_comunicacao <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_channel IS NULL OR c.channel = p_channel)
      AND (p_direction IS NULL OR c.direction = p_direction)
      AND (
        p_sdr_name IS NULL
        OR COALESCE(c.sdr_name, '') ILIKE '%' || p_sdr_name || '%'
        OR COALESCE(ct.owner_name, '') ILIKE '%' || p_sdr_name || '%'
      )
      AND (o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT OR c.oportunidade_id IS NULL)
  ),
  conversation_pairs AS (
    SELECT
      b.sdr_name,
      b.ghl_conversation_id,
      b.data_comunicacao,
      b.direction,
      b.ghl_source,
      LAG(b.data_comunicacao) OVER (PARTITION BY b.ghl_conversation_id ORDER BY b.data_comunicacao) AS prev_ts,
      LAG(b.direction) OVER (PARTITION BY b.ghl_conversation_id ORDER BY b.data_comunicacao) AS prev_dir
    FROM base b
    WHERE b.ghl_conversation_id IS NOT NULL
  ),
  responses AS (
    SELECT
      sdr_name,
      EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) / 60.0 AS diff_minutes
    FROM conversation_pairs
    WHERE direction = 'outbound'
      AND prev_dir = 'inbound'
      AND ghl_source = 'app'
      AND prev_ts IS NOT NULL
      AND data_comunicacao > prev_ts
      AND EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) BETWEEN 1 AND 86400
  ),
  response_times AS (
    SELECT
      CASE WHEN p_group_by = 'sdr' THEN COALESCE(sdr_name, 'Sem SDR') ELSE 'Total' END AS gkey,
      AVG(diff_minutes) AS avg_minutes
    FROM responses
    GROUP BY gkey
  ),
  aggr AS (
    SELECT
      CASE
        WHEN p_group_by = 'sdr' THEN COALESCE(b.sdr_name, 'Sem SDR')
        WHEN p_group_by = 'channel' THEN COALESCE(b.channel, 'Sem canal')
        WHEN p_group_by = 'direction' THEN COALESCE(b.direction, 'Sem direction')
        WHEN p_group_by = 'month' THEN TO_CHAR(b.data_comunicacao AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
        ELSE 'Total'
      END AS gkey,
      COUNT(*) AS total_mensagens,
      COUNT(*) FILTER (WHERE b.direction = 'outbound') AS mensagens_enviadas,
      COUNT(*) FILTER (WHERE b.direction = 'inbound') AS mensagens_recebidas,
      COUNT(*) FILTER (WHERE b.channel = 'call' OR b.tipo = 'ligacao') AS ligacoes,
      COUNT(*) FILTER (
        WHERE (b.channel = 'call' OR b.tipo = 'ligacao')
          AND COALESCE(b.phone_call_status, b.msg_status) = 'completed'
      ) AS ligacoes_atendidas,
      COUNT(DISTINCT b.contato_id) AS leads_contatados,
      COUNT(DISTINCT b.contato_id) FILTER (
        WHERE b.tags IS NOT NULL
          AND (
            b.tags::TEXT ILIKE '%"mql"%'
            OR b.tags::TEXT ILIKE '%mql%'
          )
      ) AS mqls_contatados
    FROM base b
    GROUP BY gkey
  )
  SELECT
    a.gkey AS group_key,
    a.total_mensagens,
    a.mensagens_enviadas,
    a.mensagens_recebidas,
    a.ligacoes,
    a.ligacoes_atendidas,
    rt.avg_minutes::NUMERIC AS tempo_medio_resposta_minutos,
    a.leads_contatados,
    a.mqls_contatados
  FROM aggr a
  LEFT JOIN response_times rt
    ON (p_group_by = 'sdr' AND rt.gkey = a.gkey)
    OR (p_group_by <> 'sdr' AND rt.gkey = 'Total')
  ORDER BY
    CASE WHEN p_group_by = 'month' THEN a.gkey END ASC NULLS LAST,
    CASE WHEN p_group_by <> 'month' THEN a.total_mensagens END DESC NULLS LAST;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_criativos(p_start_date date, p_end_date date, p_group_by text DEFAULT 'creative'::text, p_creative_id text DEFAULT NULL::text, p_campaign_name text DEFAULT NULL::text, p_min_spend numeric DEFAULT 0)
 RETURNS TABLE(group_key text, creative_code text, creative_name text, status text, spend numeric, impressions bigint, clicks bigint, ctr numeric, cpm numeric, leads_meta bigint, leads_crm bigint, mqls bigint, vendas bigint, faturamento numeric, caixa numeric, cpl_crm numeric, cpmql numeric, cpv numeric, roas numeric, roas_caixa numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH meta_raw AS (
    SELECT
      CASE
        WHEN p_group_by = 'ad' THEN COALESCE(mai.ad_name, 'Sem anúncio')
        WHEN p_group_by = 'campaign' THEN COALESCE(mai.campaign_name, 'Sem campanha')
        WHEN p_group_by = 'adset' THEN COALESCE(mai.adset_name, 'Sem conjunto')
        ELSE (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
      END AS meta_key,
      CASE
        WHEN p_group_by = 'creative' THEN (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
        ELSE NULL
      END AS creative_num,
      mai.spend,
      mai.impressions,
      mai.clicks,
      mai.leads
    FROM meta_ads_insights mai
    WHERE mai.date >= p_start_date
      AND mai.date <= p_end_date
      AND (p_campaign_name IS NULL OR mai.campaign_name ILIKE '%' || p_campaign_name || '%')
      AND (
        p_group_by != 'creative' OR mai.ad_name ~ 'CR-(\d+)'
      )
  ),
  meta_aggr AS (
    SELECT
      mr.meta_key,
      mr.creative_num,
      SUM(mr.spend) AS sum_spend,
      SUM(mr.impressions)::BIGINT AS sum_impressions,
      SUM(mr.clicks)::BIGINT AS sum_clicks,
      SUM(mr.leads)::BIGINT AS sum_leads_meta
    FROM meta_raw mr
    GROUP BY mr.meta_key, mr.creative_num
  ),
  crm_raw AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS crm_key,
      o.id AS opp_id,
      c.tags,
      vf.id AS venda_id,
      vf.valor_faturado,
      vf.valor_entrada
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id AND vf.data_pagamento_entrada IS NOT NULL
    WHERE o.data_lead_recebido >= (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND o.data_lead_recebido < ((p_end_date + INTERVAL '1 day')::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND c.utm_term IS NOT NULL
      AND c.utm_term ~ 'CR-(\d+)'
      AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
  ),
  crm_aggr AS (
    SELECT
      cr.crm_key,
      COUNT(DISTINCT cr.opp_id)::BIGINT AS sum_leads_crm,
      COUNT(DISTINCT cr.opp_id) FILTER (WHERE cr.tags IS NOT NULL AND cr.tags::TEXT ILIKE '%MQL%')::BIGINT AS sum_mqls,
      COUNT(DISTINCT cr.venda_id) FILTER (WHERE cr.venda_id IS NOT NULL)::BIGINT AS sum_vendas,
      SUM(COALESCE(cr.valor_faturado, 0)) AS sum_faturamento,
      SUM(COALESCE(cr.valor_entrada, 0)) AS sum_caixa
    FROM crm_raw cr
    GROUP BY cr.crm_key
  ),
  all_keys AS (
    SELECT meta_key AS jkey FROM meta_aggr
    UNION
    SELECT crm_key AS jkey FROM crm_aggr
  ),
  joined AS (
    SELECT
      ak.jkey,
      ma.creative_num,
      COALESCE(ma.sum_spend, 0) AS sum_spend,
      COALESCE(ma.sum_impressions, 0) AS sum_impressions,
      COALESCE(ma.sum_clicks, 0) AS sum_clicks,
      COALESCE(ma.sum_leads_meta, 0) AS sum_leads_meta,
      COALESCE(ca.sum_leads_crm, 0) AS sum_leads_crm,
      COALESCE(ca.sum_mqls, 0) AS sum_mqls,
      COALESCE(ca.sum_vendas, 0) AS sum_vendas,
      COALESCE(ca.sum_faturamento, 0) AS sum_faturamento,
      COALESCE(ca.sum_caixa, 0) AS sum_caixa
    FROM all_keys ak
    LEFT JOIN meta_aggr ma ON ma.meta_key = ak.jkey
    LEFT JOIN crm_aggr ca ON ca.crm_key = ak.jkey
  ),
  enriched AS (
    SELECT
      j.jkey,
      j.creative_num,
      nc.name AS notion_name,
      nc.status AS notion_status,
      j.sum_spend,
      j.sum_impressions,
      j.sum_clicks,
      j.sum_leads_meta,
      j.sum_leads_crm,
      j.sum_mqls,
      j.sum_vendas,
      j.sum_faturamento,
      j.sum_caixa,
      CASE WHEN j.sum_impressions > 0 THEN ROUND((j.sum_clicks::NUMERIC / j.sum_impressions) * 100, 2) ELSE 0 END AS calc_ctr,
      CASE WHEN j.sum_impressions > 0 THEN ROUND((j.sum_spend / j.sum_impressions) * 1000, 2) ELSE 0 END AS calc_cpm,
      CASE WHEN j.sum_leads_crm > 0 THEN ROUND(j.sum_spend / j.sum_leads_crm, 2) ELSE 0 END AS calc_cpl_crm,
      CASE WHEN j.sum_mqls > 0 THEN ROUND(j.sum_spend / j.sum_mqls, 2) ELSE 0 END AS calc_cpmql,
      CASE WHEN j.sum_vendas > 0 THEN ROUND(j.sum_spend / j.sum_vendas, 2) ELSE 0 END AS calc_cpv,
      CASE WHEN j.sum_spend > 0 THEN ROUND(j.sum_faturamento / j.sum_spend, 2) ELSE 0 END AS calc_roas,
      CASE WHEN j.sum_spend > 0 THEN ROUND(j.sum_caixa / j.sum_spend, 2) ELSE 0 END AS calc_roas_caixa
    FROM joined j
    LEFT JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || j.creative_num
      AND nc.database_type = 'paid'
  )
  SELECT
    e.jkey AS group_key,
    ('CR-' || e.creative_num)::TEXT AS creative_code,
    COALESCE(e.notion_name, 'Criativo ' || 'CR-' || e.creative_num) AS creative_name,
    COALESCE(e.notion_status, 'Desconhecido') AS status,
    e.sum_spend,
    e.sum_impressions,
    e.sum_clicks,
    e.calc_ctr,
    e.calc_cpm,
    e.sum_leads_meta,
    e.sum_leads_crm,
    e.sum_mqls,
    e.sum_vendas,
    e.sum_faturamento,
    e.sum_caixa,
    e.calc_cpl_crm,
    e.calc_cpmql,
    e.calc_cpv,
    e.calc_roas,
    e.calc_roas_caixa
  FROM enriched e
  WHERE e.sum_spend >= COALESCE(p_min_spend, 0)
    AND (p_creative_id IS NULL OR e.jkey ILIKE '%' || p_creative_id || '%')
  ORDER BY e.sum_spend DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_criativos(p_start_date date, p_end_date date, p_group_by text DEFAULT 'creative'::text, p_creative_id text DEFAULT NULL::text, p_campaign_name text DEFAULT NULL::text, p_min_spend numeric DEFAULT 0, p_limit integer DEFAULT NULL::integer)
 RETURNS TABLE(group_key text, creative_code text, creative_name text, status text, spend numeric, impressions bigint, clicks bigint, ctr numeric, cpm numeric, leads_meta bigint, leads_crm bigint, mqls bigint, vendas bigint, faturamento numeric, caixa numeric, cpl_crm numeric, cpmql numeric, cpv numeric, roas numeric, roas_caixa numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH meta_raw AS (
    SELECT
      CASE
        WHEN p_group_by = 'ad' THEN COALESCE(mai.ad_name, 'Sem anúncio')
        WHEN p_group_by = 'campaign' THEN COALESCE(mai.campaign_name, 'Sem campanha')
        WHEN p_group_by = 'adset' THEN COALESCE(mai.adset_name, 'Sem conjunto')
        ELSE (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
      END AS meta_key,
      CASE
        WHEN p_group_by = 'creative' THEN (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
        ELSE NULL
      END AS creative_num,
      mai.spend,
      mai.impressions,
      mai.clicks,
      mai.leads
    FROM meta_ads_insights mai
    WHERE mai.date >= p_start_date
      AND mai.date <= p_end_date
      AND (p_campaign_name IS NULL OR mai.campaign_name ILIKE '%' || p_campaign_name || '%')
      AND (
        p_group_by != 'creative' OR mai.ad_name ~ 'CR-(\d+)'
      )
  ),
  meta_aggr AS (
    SELECT
      mr.meta_key,
      mr.creative_num,
      SUM(mr.spend) AS sum_spend,
      SUM(mr.impressions)::BIGINT AS sum_impressions,
      SUM(mr.clicks)::BIGINT AS sum_clicks,
      SUM(mr.leads)::BIGINT AS sum_leads_meta
    FROM meta_raw mr
    GROUP BY mr.meta_key, mr.creative_num
  ),
  crm_raw AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS crm_key,
      o.id AS opp_id,
      c.tags,
      vf.id AS venda_id,
      vf.valor_faturado,
      vf.valor_entrada
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id AND vf.data_pagamento_entrada IS NOT NULL
    WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND c.utm_term IS NOT NULL
      AND c.utm_term ~ 'CR-(\d+)'
      AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
  ),
  crm_aggr AS (
    SELECT
      cr.crm_key,
      COUNT(DISTINCT cr.opp_id)::BIGINT AS sum_leads_crm,
      COUNT(DISTINCT cr.opp_id) FILTER (WHERE cr.tags IS NOT NULL AND cr.tags::TEXT ILIKE '%MQL%')::BIGINT AS sum_mqls,
      COUNT(DISTINCT cr.venda_id) FILTER (WHERE cr.venda_id IS NOT NULL)::BIGINT AS sum_vendas,
      SUM(COALESCE(cr.valor_faturado, 0)) AS sum_faturamento,
      SUM(COALESCE(cr.valor_entrada, 0)) AS sum_caixa
    FROM crm_raw cr
    GROUP BY cr.crm_key
  ),
  all_keys AS (
    SELECT meta_key AS jkey FROM meta_aggr
    UNION
    SELECT crm_key AS jkey FROM crm_aggr
  ),
  joined AS (
    SELECT
      ak.jkey,
      ma.creative_num,
      COALESCE(ma.sum_spend, 0) AS sum_spend,
      COALESCE(ma.sum_impressions, 0) AS sum_impressions,
      COALESCE(ma.sum_clicks, 0) AS sum_clicks,
      COALESCE(ma.sum_leads_meta, 0) AS sum_leads_meta,
      COALESCE(ca.sum_leads_crm, 0) AS sum_leads_crm,
      COALESCE(ca.sum_mqls, 0) AS sum_mqls,
      COALESCE(ca.sum_vendas, 0) AS sum_vendas,
      COALESCE(ca.sum_faturamento, 0) AS sum_faturamento,
      COALESCE(ca.sum_caixa, 0) AS sum_caixa
    FROM all_keys ak
    LEFT JOIN meta_aggr ma ON ma.meta_key = ak.jkey
    LEFT JOIN crm_aggr ca ON ca.crm_key = ak.jkey
  ),
  enriched AS (
    SELECT
      j.jkey,
      j.creative_num,
      nc.name AS notion_name,
      nc.status AS notion_status,
      j.sum_spend,
      j.sum_impressions,
      j.sum_clicks,
      j.sum_leads_meta,
      j.sum_leads_crm,
      j.sum_mqls,
      j.sum_vendas,
      j.sum_faturamento,
      j.sum_caixa,
      CASE WHEN j.sum_impressions > 0 THEN ROUND((j.sum_clicks::NUMERIC / j.sum_impressions) * 100, 2) ELSE 0 END AS calc_ctr,
      CASE WHEN j.sum_impressions > 0 THEN ROUND((j.sum_spend / j.sum_impressions) * 1000, 2) ELSE 0 END AS calc_cpm,
      CASE WHEN j.sum_leads_crm > 0 THEN ROUND(j.sum_spend / j.sum_leads_crm, 2) ELSE 0 END AS calc_cpl_crm,
      CASE WHEN j.sum_mqls > 0 THEN ROUND(j.sum_spend / j.sum_mqls, 2) ELSE 0 END AS calc_cpmql,
      CASE WHEN j.sum_vendas > 0 THEN ROUND(j.sum_spend / j.sum_vendas, 2) ELSE 0 END AS calc_cpv,
      CASE WHEN j.sum_spend > 0 THEN ROUND(j.sum_faturamento / j.sum_spend, 2) ELSE 0 END AS calc_roas,
      CASE WHEN j.sum_spend > 0 THEN ROUND(j.sum_caixa / j.sum_spend, 2) ELSE 0 END AS calc_roas_caixa
    FROM joined j
    LEFT JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || j.creative_num
      AND nc.database_type = 'paid'
  )
  SELECT
    e.jkey AS group_key,
    ('CR-' || e.creative_num)::TEXT AS creative_code,
    COALESCE(e.notion_name, 'Criativo ' || 'CR-' || e.creative_num) AS creative_name,
    COALESCE(e.notion_status, 'Desconhecido') AS status,
    e.sum_spend,
    e.sum_impressions,
    e.sum_clicks,
    e.calc_ctr,
    e.calc_cpm,
    e.sum_leads_meta,
    e.sum_leads_crm,
    e.sum_mqls,
    e.sum_vendas,
    e.sum_faturamento,
    e.sum_caixa,
    e.calc_cpl_crm,
    e.calc_cpmql,
    e.calc_cpv,
    e.calc_roas,
    e.calc_roas_caixa
  FROM enriched e
  WHERE e.sum_spend >= COALESCE(p_min_spend, 0)
    AND (p_creative_id IS NULL OR e.jkey ILIKE '%' || p_creative_id || '%')
  ORDER BY e.sum_spend DESC
  LIMIT COALESCE(p_limit, 10000);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_funnel_cohort(p_start_date date, p_end_date date, p_group_by text DEFAULT 'none'::text, p_utm_source text DEFAULT NULL::text, p_utm_campaign_code text DEFAULT NULL::text, p_sdr_name text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, leads bigint, mqls bigint, conectados bigint, agendados bigint, reunioes bigint, vendas bigint, faturamento numeric, caixa numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_realizacao_vendas,
      o.sdr_name,
      c.utm_source,
      c.utm_campaign,
      c.tags,
      c.owner_name,
      CASE
        WHEN p_group_by = 'month' THEN COALESCE(TO_CHAR(o.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Sem data')
        WHEN p_group_by = 'sdr' THEN COALESCE(o.sdr_name, c.owner_name, 'Sem SDR')
        WHEN p_group_by = 'campaign' THEN COALESCE(c.utm_campaign, 'Sem campanha')
        WHEN p_group_by = 'channel' THEN COALESCE(c.utm_source, 'Sem canal')
        ELSE 'Total'
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_utm_source IS NULL OR c.utm_source ILIKE '%' || p_utm_source || '%')
      AND (p_utm_campaign_code IS NULL OR c.utm_campaign = p_utm_campaign_code)
      AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
  ),
  vendas_base AS (
    SELECT
      vf.oportunidade_id,
      SUM(vf.valor_faturado) AS fat,
      SUM(vf.valor_entrada) AS ent
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada IS NOT NULL
    GROUP BY vf.oportunidade_id
  )
  SELECT
    b.gkey AS group_key,
    COUNT(*) AS leads,
    COUNT(*) FILTER (WHERE b.tags IS NOT NULL AND b.tags::TEXT ILIKE '%MQL%') AS mqls,
    COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS conectados,
    COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS agendados,
    COUNT(*) FILTER (WHERE b.data_realizacao_vendas IS NOT NULL) AS reunioes,
    COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL) AS vendas,
    COALESCE(SUM(vb.fat), 0) AS faturamento,
    COALESCE(SUM(vb.ent), 0) AS caixa
  FROM base b
  LEFT JOIN vendas_base vb ON vb.oportunidade_id = b.id
  GROUP BY b.gkey
  ORDER BY leads DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_investimento_organico(p_start_date date, p_end_date date, p_group_by text DEFAULT 'none'::text, p_category text DEFAULT NULL::text, p_utm_source text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, investimento numeric, leads bigint, mqls bigint, conectados bigint, agendados bigint, reunioes bigint, vendas bigint, faturamento numeric, caixa numeric, custo_por_mql numeric, custo_por_venda numeric, roi_org numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH invest_raw AS (
    SELECT
      i.category,
      COALESCE(oi.utm_source, i.utm_source) AS utm_source,
      oi.amount,
      oi.period_start,
      oi.period_end,
      (oi.period_end - oi.period_start + 1) AS period_days,
      GREATEST(oi.period_start, p_start_date) AS overlap_start,
      LEAST(oi.period_end, p_end_date) AS overlap_end
    FROM organic_investments oi
    JOIN organic_investment_items i ON i.id = oi.item_id
    WHERE i.is_active = true
      AND oi.period_start <= p_end_date
      AND oi.period_end >= p_start_date
      AND (p_category IS NULL OR i.category = p_category)
      AND (p_utm_source IS NULL OR COALESCE(oi.utm_source, i.utm_source, '') ILIKE '%' || p_utm_source || '%')
  ),
  invest_prorated AS (
    SELECT
      ir.category,
      ir.utm_source,
      SUM(ir.amount * GREATEST(ir.overlap_end - ir.overlap_start + 1, 0)::NUMERIC / NULLIF(ir.period_days, 0)) AS prorated_amount
    FROM invest_raw ir
    GROUP BY ir.category, ir.utm_source
  ),
  org_sources AS (
    SELECT usp.utm_source, usp.nome FROM utm_sources_plain usp WHERE usp.utm_source IS NOT NULL
  ),
  org_data AS (
    SELECT
      COALESCE(osp.nome, 'Sem canal') AS canal_nome,
      o.group_key AS canal_key,
      o.leads,
      o.mqls,
      o.conectados,
      o.agendados,
      o.reunioes,
      o.vendas,
      o.faturamento,
      o.caixa
    FROM analisar_organico(p_start_date, p_end_date, 'channel', NULL) o
    LEFT JOIN org_sources osp ON osp.utm_source = o.group_key
  ),
  general_amount AS (
    SELECT COALESCE(SUM(prorated_amount), 0) AS amount
    FROM invest_prorated
    WHERE utm_source IS NULL
  ),
  channel_count AS (
    SELECT GREATEST(COUNT(DISTINCT canal_key), 1) AS cnt FROM org_data
  ),
  invest_by_channel AS (
    SELECT
      od.canal_key,
      od.canal_nome,
      COALESCE(SUM(ip.prorated_amount) FILTER (WHERE ip.utm_source IS NOT NULL AND ip.utm_source = od.canal_key), 0)
        + (SELECT amount FROM general_amount) / (SELECT cnt FROM channel_count) AS investimento,
      od.leads,
      od.mqls,
      od.conectados,
      od.agendados,
      od.reunioes,
      od.vendas,
      od.faturamento,
      od.caixa
    FROM org_data od
    LEFT JOIN invest_prorated ip ON ip.utm_source = od.canal_key
    GROUP BY od.canal_key, od.canal_nome, od.leads, od.mqls, od.conectados, od.agendados, od.reunioes, od.vendas, od.faturamento, od.caixa
  ),
  invest_by_category AS (
    SELECT
      ip.category AS gkey,
      SUM(ip.prorated_amount) AS investimento
    FROM invest_prorated ip
    GROUP BY ip.category
  ),
  invest_total AS (
    SELECT 'Total'::TEXT AS gkey, COALESCE(SUM(prorated_amount), 0) AS investimento FROM invest_prorated
  ),
  invest_by_month AS (
    SELECT
      TO_CHAR((m.month_start)::DATE, 'YYYY-MM') AS gkey,
      COALESCE(SUM(
        ir.amount * GREATEST(
          LEAST(ir.period_end, ((m.month_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE)
          - GREATEST(ir.period_start, (m.month_start)::DATE)
          + 1,
          0
        )::NUMERIC / NULLIF(ir.period_days, 0)
      ), 0) AS investimento
    FROM generate_series(DATE_TRUNC('month', p_start_date)::DATE, DATE_TRUNC('month', p_end_date)::DATE, '1 month'::INTERVAL) m(month_start)
    LEFT JOIN invest_raw ir
      ON ir.period_start <= ((m.month_start)::DATE + INTERVAL '1 month' - INTERVAL '1 day')::DATE
     AND ir.period_end >= (m.month_start)::DATE
    GROUP BY m.month_start
  ),
  base AS (
    SELECT COALESCE(ibc.canal_nome, ibc.canal_key) AS group_key, ibc.investimento, ibc.leads, ibc.mqls, ibc.conectados, ibc.agendados, ibc.reunioes, ibc.vendas, ibc.faturamento, ibc.caixa
    FROM invest_by_channel ibc
    WHERE p_group_by = 'utm_source'
    UNION ALL
    SELECT ibcat.gkey, ibcat.investimento, 0, 0, 0, 0, 0, 0, 0, 0
    FROM invest_by_category ibcat
    WHERE p_group_by = 'category'
    UNION ALL
    SELECT it.gkey, it.investimento, 0, 0, 0, 0, 0, 0, 0, 0
    FROM invest_total it
    WHERE p_group_by = 'none'
    UNION ALL
    SELECT ibm.gkey, ibm.investimento, 0, 0, 0, 0, 0, 0, 0, 0
    FROM invest_by_month ibm
    WHERE p_group_by = 'month'
  )
  SELECT
    b.group_key,
    COALESCE(b.investimento, 0)::NUMERIC AS investimento,
    COALESCE(b.leads, 0)::BIGINT AS leads,
    COALESCE(b.mqls, 0)::BIGINT AS mqls,
    COALESCE(b.conectados, 0)::BIGINT AS conectados,
    COALESCE(b.agendados, 0)::BIGINT AS agendados,
    COALESCE(b.reunioes, 0)::BIGINT AS reunioes,
    COALESCE(b.vendas, 0)::BIGINT AS vendas,
    COALESCE(b.faturamento, 0)::NUMERIC AS faturamento,
    COALESCE(b.caixa, 0)::NUMERIC AS caixa,
    CASE WHEN COALESCE(b.mqls, 0) > 0 THEN ROUND(b.investimento / b.mqls, 2) ELSE 0 END AS custo_por_mql,
    CASE WHEN COALESCE(b.vendas, 0) > 0 THEN ROUND(b.investimento / b.vendas, 2) ELSE 0 END AS custo_por_venda,
    CASE WHEN COALESCE(b.investimento, 0) > 0 THEN ROUND(b.faturamento / b.investimento, 2) ELSE 0 END AS roi_org
  FROM base b
  ORDER BY investimento DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_meta_ads(p_start_date date, p_end_date date, p_group_by text DEFAULT 'campaign'::text, p_campaign_name text DEFAULT NULL::text, p_adset_name text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS TABLE(group_key text, spend numeric, impressions bigint, clicks bigint, leads bigint, landing_page_views bigint, ctr numeric, cpm numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT
      CASE
        WHEN p_group_by = 'campaign' THEN COALESCE(campaign_name, 'Sem campanha')
        WHEN p_group_by = 'adset' THEN COALESCE(adset_name, 'Sem conjunto')
        WHEN p_group_by = 'ad' THEN COALESCE(ad_name, 'Sem anúncio')
        WHEN p_group_by = 'day' THEN COALESCE(date::TEXT, 'Sem data')
        ELSE 'Total'
      END AS gkey,
      SUM(spend) AS spend,
      SUM(impressions) AS impressions,
      SUM(clicks) AS clicks,
      SUM(leads) AS leads,
      SUM(landing_page_views) AS lp_views
    FROM meta_ads_insights
    WHERE date >= p_start_date
      AND date <= p_end_date
      AND (p_campaign_name IS NULL OR campaign_name ILIKE '%' || p_campaign_name || '%')
      AND (p_adset_name IS NULL OR adset_name ILIKE '%' || p_adset_name || '%')
    GROUP BY gkey
  )
  SELECT
    a.gkey AS group_key,
    COALESCE(a.spend, 0) AS spend,
    COALESCE(a.impressions, 0)::BIGINT AS impressions,
    COALESCE(a.clicks, 0)::BIGINT AS clicks,
    COALESCE(a.leads, 0)::BIGINT AS leads,
    COALESCE(a.lp_views, 0)::BIGINT AS landing_page_views,
    CASE WHEN COALESCE(a.impressions, 0) > 0 THEN ROUND((a.clicks::NUMERIC / a.impressions) * 100, 2) ELSE 0 END AS ctr,
    CASE WHEN COALESCE(a.impressions, 0) > 0 THEN ROUND((a.spend / a.impressions) * 1000, 2) ELSE 0 END AS cpm
  FROM agg a
  ORDER BY a.spend DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_meta_ads_por_regiao(p_start_date date, p_end_date date)
 RETURNS TABLE(regiao text, investimento numeric, vendas bigint, faturamento numeric, entrada numeric, cpv numeric, roas numeric, roas_caixa numeric, pct_vendas numeric, pct_faturamento numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_total_vendas      BIGINT;
    v_total_faturamento NUMERIC;
BEGIN
    -- Investimento por região (Meta Ads breakdown)
    WITH investimento AS (
        SELECT
            COALESCE(m.regiao, 'Indefinido') AS regiao,
            SUM(b.spend)                     AS investimento
        FROM meta_ads_insights i
        JOIN meta_ads_insights_breakdowns b
          ON b.insights_id = i.id
         AND b.breakdown_type = 'region'
        LEFT JOIN meta_ads_region_mapping m
          ON LOWER(m.region_name) = LOWER(b.region)
        WHERE i.date BETWEEN p_start_date AND p_end_date
        GROUP BY COALESCE(m.regiao, 'Indefinido')
    ),
    -- Vendas por região (CRM): leads de tráfego pago que entraram no período e fecharam
    vendas AS (
        SELECT
            COALESCE(e.regiao, 'Indefinido') AS regiao,
            COUNT(*)                          AS vendas,
            SUM(vf.valor_faturado)            AS faturamento,
            SUM(vf.valor_entrada)             AS entrada
        FROM vendas_fechamento vf
        JOIN oportunidades o ON o.id = vf.oportunidade_id
        JOIN contatos c ON c.id = o.contato_id
        LEFT JOIN estado_uf_normalizacao e
          ON LOWER(e.estado_raw) = LOWER(TRIM(vf.estado_uf))
        WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
          AND c.utm_source IS NOT NULL
          AND c.utm_source != ''
          AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
          AND vf.data_pagamento_entrada IS NOT NULL
        GROUP BY COALESCE(e.regiao, 'Indefinido')
    ),
    cruzado AS (
        SELECT
            COALESCE(v.regiao, i.regiao) AS regiao,
            COALESCE(i.investimento, 0)  AS investimento,
            COALESCE(v.vendas, 0)        AS vendas,
            COALESCE(v.faturamento, 0)   AS faturamento,
            COALESCE(v.entrada, 0)       AS entrada
        FROM investimento i
        FULL OUTER JOIN vendas v ON v.regiao = i.regiao
    )
    SELECT
        COALESCE(SUM(c.vendas), 0)::BIGINT,
        COALESCE(SUM(c.faturamento), 0)
    INTO v_total_vendas, v_total_faturamento
    FROM cruzado c;

    RETURN QUERY
    WITH investimento AS (
        SELECT
            COALESCE(m.regiao, 'Indefinido') AS regiao,
            SUM(b.spend)                     AS investimento
        FROM meta_ads_insights i
        JOIN meta_ads_insights_breakdowns b
          ON b.insights_id = i.id
         AND b.breakdown_type = 'region'
        LEFT JOIN meta_ads_region_mapping m
          ON LOWER(m.region_name) = LOWER(b.region)
        WHERE i.date BETWEEN p_start_date AND p_end_date
        GROUP BY COALESCE(m.regiao, 'Indefinido')
    ),
    vendas AS (
        SELECT
            COALESCE(e.regiao, 'Indefinido') AS regiao,
            COUNT(*)                          AS vendas,
            SUM(vf.valor_faturado)            AS faturamento,
            SUM(vf.valor_entrada)             AS entrada
        FROM vendas_fechamento vf
        JOIN oportunidades o ON o.id = vf.oportunidade_id
        JOIN contatos c ON c.id = o.contato_id
        LEFT JOIN estado_uf_normalizacao e
          ON LOWER(e.estado_raw) = LOWER(TRIM(vf.estado_uf))
        WHERE o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
          AND c.utm_source IS NOT NULL
          AND c.utm_source != ''
          AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
          AND vf.data_pagamento_entrada IS NOT NULL
        GROUP BY COALESCE(e.regiao, 'Indefinido')
    ),
    cruzado AS (
        SELECT
            COALESCE(v.regiao, i.regiao) AS regiao,
            COALESCE(i.investimento, 0)  AS investimento,
            COALESCE(v.vendas, 0)::BIGINT AS vendas,
            COALESCE(v.faturamento, 0)   AS faturamento,
            COALESCE(v.entrada, 0)       AS entrada
        FROM investimento i
        FULL OUTER JOIN vendas v ON v.regiao = i.regiao
    )
    SELECT
        c.regiao,
        ROUND(c.investimento::NUMERIC, 2),
        c.vendas,
        ROUND(c.faturamento::NUMERIC, 2),
        ROUND(c.entrada::NUMERIC, 2),
        CASE WHEN c.vendas > 0 THEN ROUND((c.investimento / c.vendas)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN c.investimento > 0 THEN ROUND((c.faturamento / c.investimento)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN c.investimento > 0 THEN ROUND((c.entrada / c.investimento)::NUMERIC, 2) ELSE NULL END,
        CASE WHEN v_total_vendas > 0 THEN ROUND((c.vendas::NUMERIC / v_total_vendas * 100), 2) ELSE 0 END,
        CASE WHEN v_total_faturamento > 0 THEN ROUND((c.faturamento / v_total_faturamento * 100), 2) ELSE 0 END
    FROM cruzado c
    ORDER BY c.investimento DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_meta_crm_cruzado(p_start_date date, p_end_date date)
 RETURNS TABLE(utm_campaign text, investimento_meta numeric, impressoes bigint, cliques bigint, leads_meta bigint, leads_crm bigint, mqls_crm bigint, reunioes bigint, fechamentos bigint, cpl_meta numeric, cpl_crm numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH meta AS (
    SELECT
      LOWER(TRIM(campaign_name))  AS camp_key,
      SUM(spend)                  AS investimento,
      SUM(impressions)            AS impressoes,
      SUM(clicks)                 AS cliques,
      SUM(leads)                  AS leads_meta
    FROM meta_ads_insights
    WHERE date >= p_start_date
      AND date <= p_end_date
      AND campaign_name IS NOT NULL
      AND campaign_name <> ''
    GROUP BY LOWER(TRIM(campaign_name))
  ),
  crm AS (
    SELECT
      LOWER(TRIM(c.utm_campaign))  AS camp_key,
      COUNT(DISTINCT o.id)         AS leads_crm,
      COUNT(DISTINCT o.id) FILTER (
        WHERE c.tags IS NOT NULL AND c.tags ~* '(^|,)\s*mql\s*($|,)'
      )                            AS mqls_crm,
      COUNT(DISTINCT o.id) FILTER (
        WHERE o.data_agendamento_reuniao >= p_start_date
          AND o.data_agendamento_reuniao <= p_end_date
      )                            AS reunioes,
      COUNT(DISTINCT vf.oportunidade_id) FILTER (
        WHERE vf.data_pagamento_entrada >= p_start_date
          AND vf.data_pagamento_entrada <= p_end_date
      )                            AS fechamentos
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND o.data_lead_recebido < ((p_end_date + 1)::TIMESTAMPTZ AT TIME ZONE 'America/Sao_Paulo')
      AND c.utm_campaign IS NOT NULL
      AND c.utm_campaign <> ''
    GROUP BY LOWER(TRIM(c.utm_campaign))
  )
  SELECT
    COALESCE(m.camp_key, cr.camp_key)  AS utm_campaign,
    COALESCE(m.investimento, 0)        AS investimento_meta,
    COALESCE(m.impressoes, 0)          AS impressoes,
    COALESCE(m.cliques, 0)             AS cliques,
    COALESCE(m.leads_meta, 0)          AS leads_meta,
    COALESCE(cr.leads_crm, 0)          AS leads_crm,
    COALESCE(cr.mqls_crm, 0)           AS mqls_crm,
    COALESCE(cr.reunioes, 0)           AS reunioes,
    COALESCE(cr.fechamentos, 0)        AS fechamentos,
    CASE
      WHEN COALESCE(m.leads_meta, 0) > 0
        THEN ROUND(m.investimento / m.leads_meta, 2)
      ELSE NULL
    END AS cpl_meta,
    CASE
      WHEN COALESCE(cr.leads_crm, 0) > 0
        THEN ROUND(m.investimento / cr.leads_crm, 2)
      ELSE NULL
    END AS cpl_crm
  FROM meta m
  FULL OUTER JOIN crm cr USING (camp_key)
  ORDER BY COALESCE(m.investimento, 0) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_metas_vs_realizado(p_period_start date DEFAULT NULL::date, p_period_end date DEFAULT NULL::date, p_metric_name text DEFAULT NULL::text, p_area_key text DEFAULT NULL::text, p_scope_label text DEFAULT NULL::text, p_group_by text DEFAULT 'none'::text)
 RETURNS TABLE(group_key text, period_start date, period_end date, metric_name text, area_key text, scope_label text, target_value numeric, actual_value numeric, gap numeric, progress_pct numeric, projected_value numeric, projection_basis text)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_start DATE;
  v_end DATE;
  v_today DATE;
BEGIN
  -- Resolução do período: padrão = mês atual em São Paulo
  v_start := COALESCE(
    p_period_start,
    (date_trunc('month', timezone('America/Sao_Paulo', now())))::DATE
  );
  v_end := COALESCE(
    p_period_end,
    (date_trunc('month', timezone('America/Sao_Paulo', now())) + INTERVAL '1 month - 1 day')::DATE
  );
  v_today := (timezone('America/Sao_Paulo', now()))::DATE;

  RETURN QUERY
  WITH matched_versions AS (
    SELECT
      gv.id AS goal_version_id,
      gv.target_value,
      gv.period_start AS gv_period_start,
      gv.period_end AS gv_period_end,
      gd.scope_type,
      gd.scope_id,
      gd.scope_label,
      gmd.area_key AS m_area_key,
      gmd.metric_key,
      gmd.metric_name AS m_metric_name,
      gmd.provider_key,
      gmd.unit
    FROM goal_versions gv
    JOIN goal_definitions gd ON gd.id = gv.goal_definition_id
    JOIN goal_metric_definitions gmd ON gmd.id = gd.metric_definition_id
    WHERE gv.period_start <= v_end
      AND gv.period_end >= v_start
      AND (p_metric_name IS NULL
           OR gmd.metric_name ILIKE '%' || p_metric_name || '%'
           OR gmd.metric_key ILIKE '%' || p_metric_name || '%')
      AND (p_area_key IS NULL OR gmd.area_key = p_area_key)
      AND (p_scope_label IS NULL OR gd.scope_label ILIKE '%' || p_scope_label || '%')
  ),
  latest_snapshots AS (
    SELECT DISTINCT ON (gs.goal_version_id)
      gs.goal_version_id,
      gs.actual_value,
      gs.snapshot_date
    FROM goal_snapshots gs
    WHERE gs.goal_version_id IN (SELECT mv.goal_version_id FROM matched_versions mv)
      AND gs.snapshot_date <= v_today
    ORDER BY gs.goal_version_id, gs.snapshot_date DESC
  ),
  computed_actual AS (
    SELECT
      mv.goal_version_id,
      COALESCE(
        ls.actual_value,
        CASE
          -- MQLs (tráfego pago ou orgânico): leads com tag MQL no período
          WHEN mv.provider_key IN ('trafego.mql_count', 'organico.mql_count') THEN (
            SELECT COUNT(*)::NUMERIC
            FROM oportunidades o
            JOIN contatos c ON c.id = o.contato_id
            WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
              AND o.data_lead_recebido >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND o.data_lead_recebido <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
              AND c.tags IS NOT NULL
              AND c.tags::TEXT ILIKE '%MQL%'
              AND (
                mv.scope_label = 'Global'
                OR c.utm_source = mv.scope_label
                OR c.utm_source ILIKE '%' || mv.scope_label || '%'
              )
          )
          -- Agendamentos produzidos no período
          WHEN mv.provider_key = 'prevendas.agendamentos' THEN (
            SELECT COUNT(*)::NUMERIC
            FROM oportunidades o
            JOIN contatos c ON c.id = o.contato_id
            WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
              AND o.data_agendamento_reuniao >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND o.data_agendamento_reuniao <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
              AND (
                mv.scope_label = 'Global'
                OR COALESCE(o.sdr_name, c.owner_name) = mv.scope_label
                OR COALESCE(o.sdr_name, c.owner_name) ILIKE '%' || mv.scope_label || '%'
              )
          )
          -- Quantidade de vendas fechadas (pagamento confirmado)
          WHEN mv.provider_key = 'vendas.closed_count' THEN (
            SELECT COUNT(*)::NUMERIC
            FROM vendas_fechamento vf
            WHERE vf.data_pagamento_entrada >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND vf.data_pagamento_entrada <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          )
          -- Faturamento fechado
          WHEN mv.provider_key = 'vendas.closed_revenue' THEN (
            SELECT COALESCE(SUM(vf.valor_faturado), 0)::NUMERIC
            FROM vendas_fechamento vf
            WHERE vf.data_pagamento_entrada >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND vf.data_pagamento_entrada <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
          )
          -- Taxa de conversão de reuniões (%)
          WHEN mv.provider_key = 'vendas.conversion_rate' THEN (
            SELECT CASE
              WHEN COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) > 0
              THEN ROUND(
                (COUNT(*) FILTER (WHERE vf.oportunidade_id IS NOT NULL)::NUMERIC
                 / NULLIF(COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL), 0)) * 100,
                2
              )
              ELSE NULL
            END
            FROM oportunidades o
            JOIN contatos c ON c.id = o.contato_id
            LEFT JOIN vendas_fechamento vf
              ON vf.oportunidade_id = o.id
             AND vf.data_pagamento_entrada IS NOT NULL
            WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
              AND o.data_realizacao_vendas >= (mv.gv_period_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
              AND o.data_realizacao_vendas <= (mv.gv_period_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
              AND (
                mv.scope_label = 'Global'
                OR o.vendedor_closer = mv.scope_label
                OR o.vendedor_closer ILIKE '%' || mv.scope_label || '%'
              )
          )
          ELSE NULL
        END
      ) AS actual_value
    FROM matched_versions mv
    LEFT JOIN latest_snapshots ls ON ls.goal_version_id = mv.goal_version_id
  ),
  detail AS (
    SELECT
      CASE
        WHEN p_group_by = 'none' THEN COALESCE(mv.m_metric_name, '—') || ' | ' || COALESCE(mv.scope_label, 'Global')
        WHEN p_group_by = 'metric' THEN COALESCE(mv.m_metric_name, '—')
        WHEN p_group_by = 'area' THEN COALESCE(mv.m_area_key, '—')
        WHEN p_group_by = 'scope' THEN COALESCE(mv.scope_label, 'Global')
        ELSE COALESCE(mv.scope_label, 'Global')
      END AS gkey,
      mv.gv_period_start AS p_start,
      mv.gv_period_end AS p_end,
      mv.m_metric_name,
      mv.m_area_key,
      mv.scope_label,
      mv.target_value,
      ca.actual_value,
      CASE
        WHEN ca.actual_value IS NOT NULL THEN ca.actual_value - mv.target_value
        ELSE NULL
      END AS v_gap,
      CASE
        WHEN ca.actual_value IS NOT NULL AND mv.target_value > 0
        THEN ROUND((ca.actual_value / mv.target_value) * 100, 2)
        ELSE NULL
      END AS v_progress_pct,
      CASE
        WHEN ca.actual_value IS NULL THEN NULL
        WHEN v_today > mv.gv_period_end THEN ca.actual_value
        WHEN v_today < mv.gv_period_start THEN ca.actual_value
        WHEN (mv.gv_period_end - mv.gv_period_start + 1) > 0
         AND (v_today - mv.gv_period_start + 1) > 0
         AND (v_today - mv.gv_period_start + 1) < (mv.gv_period_end - mv.gv_period_start + 1)
        THEN ROUND(
          ca.actual_value
          / ((LEAST(GREATEST(v_today - mv.gv_period_start + 1, 0), mv.gv_period_end - mv.gv_period_start + 1))::NUMERIC
             / NULLIF(mv.gv_period_end - mv.gv_period_start + 1, 0)),
          2
        )
        ELSE ca.actual_value
      END AS v_projected_value
    FROM matched_versions mv
    JOIN computed_actual ca ON ca.goal_version_id = mv.goal_version_id
  )
  SELECT
    d.gkey AS group_key,
    MIN(d.p_start)::DATE AS period_start,
    MAX(d.p_end)::DATE AS period_end,
    CASE WHEN p_group_by = 'none' THEN MAX(d.m_metric_name) ELSE NULL END AS metric_name,
    CASE WHEN p_group_by = 'none' THEN MAX(d.m_area_key) ELSE NULL END AS area_key,
    CASE WHEN p_group_by = 'none' THEN MAX(d.scope_label) ELSE NULL END AS scope_label,
    SUM(d.target_value)::NUMERIC AS target_value,
    SUM(d.actual_value)::NUMERIC AS actual_value,
    SUM(d.v_gap)::NUMERIC AS gap,
    CASE
      WHEN SUM(d.target_value) > 0
      THEN ROUND((SUM(d.actual_value) / SUM(d.target_value)) * 100, 2)
      ELSE NULL
    END AS progress_pct,
    SUM(d.v_projected_value)::NUMERIC AS projected_value,
    CASE
      WHEN v_today > MAX(d.p_end) THEN 'Período encerrado'
      WHEN v_today < MIN(d.p_start) THEN 'Período não iniciado'
      ELSE 'Projeção por proporção do período decorrido'
    END AS projection_basis
  FROM detail d
  GROUP BY d.gkey
  ORDER BY
    CASE WHEN p_group_by = 'none' THEN 0 ELSE 1 END,
    d.gkey;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_organico(p_start_date date, p_end_date date, p_group_by text DEFAULT 'channel'::text, p_utm_source text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, leads bigint, mqls bigint, conectados bigint, agendados bigint, reunioes bigint, vendas bigint, faturamento numeric, caixa numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH paid_sources AS (
    SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL
  ),
  organic_sources AS (
    SELECT utm_source, nome FROM utm_sources_plain WHERE utm_source IS NOT NULL
  ),
  base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_realizacao_vendas,
      c.utm_source,
      c.tags,
      CASE
        WHEN c.utm_source IS NULL OR TRIM(c.utm_source) = '' THEN 'Sem source'
        WHEN EXISTS (SELECT 1 FROM paid_sources ps WHERE ps.utm_source = c.utm_source) THEN NULL
        WHEN osp.nome IS NOT NULL THEN osp.nome || ' (' || c.utm_source || ')'
        ELSE 'Sem canal (' || c.utm_source || ')'
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN organic_sources osp ON osp.utm_source = c.utm_source
    WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (c.utm_source IS NULL OR TRIM(c.utm_source) = '' OR NOT EXISTS (SELECT 1 FROM paid_sources ps WHERE ps.utm_source = c.utm_source))
      AND (p_utm_source IS NULL OR c.utm_source ILIKE '%' || p_utm_source || '%')
  ),
  vendas_base AS (
    SELECT
      vf.oportunidade_id,
      SUM(vf.valor_faturado) AS fat,
      SUM(vf.valor_entrada) AS ent
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada IS NOT NULL
    GROUP BY vf.oportunidade_id
  )
  SELECT
    b.gkey AS group_key,
    COUNT(*) AS leads,
    COUNT(*) FILTER (WHERE b.tags IS NOT NULL AND b.tags::TEXT ILIKE '%MQL%') AS mqls,
    COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS conectados,
    COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS agendados,
    COUNT(*) FILTER (WHERE b.data_realizacao_vendas IS NOT NULL) AS reunioes,
    COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL) AS vendas,
    COALESCE(SUM(vb.fat), 0) AS faturamento,
    COALESCE(SUM(vb.ent), 0) AS caixa
  FROM base b
  LEFT JOIN vendas_base vb ON vb.oportunidade_id = b.id
  WHERE b.gkey IS NOT NULL
  GROUP BY b.gkey
  ORDER BY leads DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_pre_vendas(p_start_date date, p_end_date date, p_group_by text DEFAULT 'none'::text, p_sdr_name text DEFAULT NULL::text, p_closer_name text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, leads bigint, mqls bigint, conectados bigint, agendamentos bigint, reunioes_agendadas bigint, reunioes_realizadas bigint, no_shows bigint, taxa_comparecimento numeric, tempo_medio_agendamento_horas numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_reuniao_agendada,
      o.data_reuniao_realizada,
      o.data_no_show,
      o.data_realizacao_vendas,
      COALESCE(o.sdr_name, c.owner_name, 'Sem SDR') AS sdr,
      COALESCE(o.vendedor_closer, 'Sem closer') AS closer,
      (
        c.tags IS NOT NULL AND c.tags::TEXT ILIKE '%MQL%'
      ) AS is_mql
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.data_lead_recebido IS NOT NULL
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND (p_sdr_name IS NULL OR COALESCE(o.sdr_name, c.owner_name, '') ILIKE '%' || p_sdr_name || '%')
      AND (p_closer_name IS NULL OR COALESCE(o.vendedor_closer, '') ILIKE '%' || p_closer_name || '%')
  ),
  aggr AS (
    SELECT
      CASE
        WHEN p_group_by = 'sdr' THEN b.sdr
        WHEN p_group_by = 'closer' THEN b.closer
        WHEN p_group_by = 'month' THEN TO_CHAR(b.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')
        ELSE 'Total'
      END AS gkey,
      COUNT(*) AS qtd_leads,
      COUNT(*) FILTER (WHERE b.is_mql) AS qtd_mqls,
      COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS qtd_conectados,
      COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS qtd_agendamentos,
      COUNT(*) FILTER (WHERE b.data_reuniao_agendada IS NOT NULL) AS qtd_reunioes_agendadas,
      COUNT(*) FILTER (WHERE b.data_reuniao_realizada IS NOT NULL) AS qtd_reunioes_realizadas,
      COUNT(*) FILTER (WHERE b.data_no_show IS NOT NULL) AS qtd_no_shows,
      AVG(
        EXTRACT(EPOCH FROM (b.data_agendamento_reuniao::TIMESTAMPTZ - b.data_lead_recebido)) / 3600.0
      ) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS avg_horas
    FROM base b
    GROUP BY gkey
  )
  SELECT
    a.gkey,
    a.qtd_leads,
    a.qtd_mqls,
    a.qtd_conectados,
    a.qtd_agendamentos,
    a.qtd_reunioes_agendadas,
    a.qtd_reunioes_realizadas,
    a.qtd_no_shows,
    ROUND(
      CASE
        WHEN (a.qtd_reunioes_realizadas + a.qtd_no_shows) > 0
        THEN (a.qtd_reunioes_realizadas::NUMERIC / (a.qtd_reunioes_realizadas + a.qtd_no_shows)) * 100
        ELSE 0
      END,
      2
    ) AS tx_comparecimento,
    ROUND(a.avg_horas::NUMERIC, 2) AS tmp_medio_horas
  FROM aggr a
  ORDER BY a.qtd_leads DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_recuperacao(p_start_date date, p_end_date date, p_group_by text DEFAULT 'none'::text, p_sdr_name text DEFAULT NULL::text, p_lost_reason text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, leads bigint, mqls bigint, conectados bigint, agendados bigint, reunioes bigint, perdidos bigint, vendas bigint, faturamento numeric, caixa numeric, taxa_reconquista numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_realizacao_vendas,
      o.status,
      o.lost_reason,
      o.motivo_perda,
      o.data_perdido,
      o.data_perdido_vendas,
      o.sdr_name,
      c.tags,
      c.owner_name,
      CASE
        WHEN p_group_by = 'month' THEN COALESCE(TO_CHAR(o.data_lead_recebido AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM'), 'Sem data')
        WHEN p_group_by = 'sdr' THEN COALESCE(o.sdr_name, c.owner_name, 'Sem SDR')
        WHEN p_group_by = 'lost_reason' THEN COALESCE(NULLIF(TRIM(o.lost_reason), ''), NULLIF(TRIM(o.motivo_perda), ''), 'Sem motivo')
        WHEN p_group_by = 'status' THEN COALESCE(o.status, 'Sem status')
        ELSE 'Total'
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.pipeline_id IS NOT DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
      AND (p_lost_reason IS NULL
           OR COALESCE(o.lost_reason, '') ILIKE '%' || p_lost_reason || '%'
           OR COALESCE(o.motivo_perda, '') ILIKE '%' || p_lost_reason || '%')
  ),
  vendas_base AS (
    SELECT
      vf.oportunidade_id,
      SUM(vf.valor_faturado) AS fat,
      SUM(vf.valor_entrada) AS ent
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada IS NOT NULL
    GROUP BY vf.oportunidade_id
  )
  SELECT
    b.gkey AS group_key,
    COUNT(*) AS leads,
    COUNT(*) FILTER (WHERE b.tags IS NOT NULL AND b.tags::TEXT ILIKE '%MQL%') AS mqls,
    COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS conectados,
    COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS agendados,
    COUNT(*) FILTER (WHERE b.data_realizacao_vendas IS NOT NULL) AS reunioes,
    COUNT(*) FILTER (WHERE b.status = 'lost' OR b.data_perdido IS NOT NULL OR b.data_perdido_vendas IS NOT NULL) AS perdidos,
    COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL) AS vendas,
    COALESCE(SUM(vb.fat), 0) AS faturamento,
    COALESCE(SUM(vb.ent), 0) AS caixa,
    ROUND((COUNT(*) FILTER (WHERE vb.oportunidade_id IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 2) AS taxa_reconquista
  FROM base b
  LEFT JOIN vendas_base vb ON vb.oportunidade_id = b.id
  GROUP BY b.gkey
  ORDER BY leads DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_relatorio_semanal(p_week_start date DEFAULT NULL::date)
 RETURNS TABLE(metric text, current_value numeric, previous_value numeric, change_pct numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_week_start DATE;
  v_week_end DATE;
  v_prev_week_start DATE;
  v_prev_week_end DATE;
BEGIN
  -- Semana comercial: segunda a domingo
  v_week_start := COALESCE(p_week_start, (
    date_trunc('week', timezone('America/Sao_Paulo', now()))::DATE
  ));
  v_week_end := v_week_start + 6;
  v_prev_week_start := v_week_start - 7;
  v_prev_week_end := v_prev_week_start + 6;

  RETURN QUERY
  WITH curr_funnel AS (
    SELECT * FROM analisar_funnel_cohort(v_week_start, v_week_end, 'none', NULL, NULL, NULL)
  ),
  prev_funnel AS (
    SELECT * FROM analisar_funnel_cohort(v_prev_week_start, v_prev_week_end, 'none', NULL, NULL, NULL)
  ),
  curr_revenue AS (
    SELECT
      COUNT(*) AS vendas,
      SUM(COALESCE(vf.valor_faturado, 0)) AS faturamento,
      SUM(COALESCE(vf.valor_entrada, 0)) AS caixa
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada >= (v_week_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND vf.data_pagamento_entrada <= (v_week_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
  ),
  prev_revenue AS (
    SELECT
      COUNT(*) AS vendas,
      SUM(COALESCE(vf.valor_faturado, 0)) AS faturamento,
      SUM(COALESCE(vf.valor_entrada, 0)) AS caixa
    FROM vendas_fechamento vf
    WHERE vf.data_pagamento_entrada >= (v_prev_week_start::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND vf.data_pagamento_entrada <= (v_prev_week_end::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
  ),
  curr_meta AS (
    SELECT COALESCE(SUM(spend), 0) AS spend FROM meta_ads_insights WHERE date BETWEEN v_week_start AND v_week_end
  ),
  prev_meta AS (
    SELECT COALESCE(SUM(spend), 0) AS spend FROM meta_ads_insights WHERE date BETWEEN v_prev_week_start AND v_prev_week_end
  ),
  metrics AS (
    SELECT 'leads'::TEXT AS metric,
           (SELECT leads FROM curr_funnel) AS current_value,
           (SELECT leads FROM prev_funnel) AS previous_value
    UNION ALL
    SELECT 'mqls'::TEXT,
           (SELECT mqls FROM curr_funnel),
           (SELECT mqls FROM prev_funnel)
    UNION ALL
    SELECT 'conectados'::TEXT,
           (SELECT conectados FROM curr_funnel),
           (SELECT conectados FROM prev_funnel)
    UNION ALL
    SELECT 'agendados'::TEXT,
           (SELECT agendados FROM curr_funnel),
           (SELECT agendados FROM prev_funnel)
    UNION ALL
    SELECT 'reunioes'::TEXT,
           (SELECT reunioes FROM curr_funnel),
           (SELECT reunioes FROM prev_funnel)
    UNION ALL
    SELECT 'vendas'::TEXT,
           (SELECT vendas FROM curr_revenue),
           (SELECT vendas FROM prev_revenue)
    UNION ALL
    SELECT 'faturamento'::TEXT,
           (SELECT faturamento FROM curr_revenue),
           (SELECT faturamento FROM prev_revenue)
    UNION ALL
    SELECT 'caixa'::TEXT,
           (SELECT caixa FROM curr_revenue),
           (SELECT caixa FROM prev_revenue)
    UNION ALL
    SELECT 'spend_meta'::TEXT,
           (SELECT spend FROM curr_meta),
           (SELECT spend FROM prev_meta)
  )
  SELECT
    m.metric,
    COALESCE(m.current_value, 0) AS current_value,
    COALESCE(m.previous_value, 0) AS previous_value,
    CASE
      WHEN COALESCE(m.previous_value, 0) > 0
        THEN ROUND(((COALESCE(m.current_value, 0) - m.previous_value) / m.previous_value) * 100, 2)
      WHEN COALESCE(m.current_value, 0) > 0 THEN 100
      ELSE 0
    END AS change_pct
  FROM metrics m
  ORDER BY CASE m.metric
    WHEN 'leads' THEN 1
    WHEN 'mqls' THEN 2
    WHEN 'conectados' THEN 3
    WHEN 'agendados' THEN 4
    WHEN 'reunioes' THEN 5
    WHEN 'vendas' THEN 6
    WHEN 'faturamento' THEN 7
    WHEN 'caixa' THEN 8
    WHEN 'spend_meta' THEN 9
    ELSE 10
  END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_sdr_performance(p_start_date date, p_end_date date, p_mode text DEFAULT 'cohort'::text, p_sdr_name text DEFAULT NULL::text)
 RETURNS TABLE(sdr text, leads bigint, mqls bigint, conectados bigint, agendados bigint, reunioes bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  IF p_mode = 'cohort' THEN
    RETURN QUERY
    WITH official_sdrs AS (
      SELECT nome FROM ghl_users
      WHERE papeis @> '["sdr"]'::jsonb AND deleted = false
    ),
    base AS (
      SELECT
        COALESCE(o.sdr_name, c.owner_name, 'Sem SDR') AS sdr_name_raw,
        o.data_conectado,
        o.data_agendamento_reuniao,
        o.data_realizacao_vendas,
        c.tags
      FROM oportunidades o
      JOIN contatos c ON c.id = o.contato_id
      WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
        AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
        AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
        AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
    )
    SELECT
      b.sdr_name_raw AS sdr,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE b.tags IS NOT NULL AND b.tags::TEXT ILIKE '%MQL%') AS mqls,
      COUNT(*) FILTER (WHERE b.data_conectado IS NOT NULL) AS conectados,
      COUNT(*) FILTER (WHERE b.data_agendamento_reuniao IS NOT NULL) AS agendados,
      COUNT(*) FILTER (WHERE b.data_realizacao_vendas IS NOT NULL) AS reunioes
    FROM base b
    WHERE EXISTS (SELECT 1 FROM official_sdrs os WHERE os.nome = b.sdr_name_raw)
       OR p_sdr_name IS NOT NULL
    GROUP BY b.sdr_name_raw
    ORDER BY leads DESC;
  ELSE
    RETURN QUERY
    WITH official_sdrs AS (
      SELECT nome FROM ghl_users
      WHERE papeis @> '["sdr"]'::jsonb AND deleted = false
    ),
    base AS (
      SELECT
        COALESCE(o.sdr_name, c.owner_name, 'Sem SDR') AS sdr_name_raw,
        o.data_conectado,
        o.data_agendamento_reuniao,
        o.data_realizacao_vendas
      FROM oportunidades o
      JOIN contatos c ON c.id = o.contato_id
      WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
        AND o.data_lead_recebido >= ((p_start_date::DATE - INTERVAL '2 years')::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
        AND (p_sdr_name IS NULL OR o.sdr_name ILIKE '%' || p_sdr_name || '%' OR c.owner_name ILIKE '%' || p_sdr_name || '%')
    )
    SELECT
      b.sdr_name_raw AS sdr,
      COUNT(*) AS leads,
      0::BIGINT AS mqls,
      COUNT(*) FILTER (WHERE b.data_conectado >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ AND b.data_conectado <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ) AS conectados,
      COUNT(*) FILTER (WHERE b.data_agendamento_reuniao >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ AND b.data_agendamento_reuniao <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ) AS agendados,
      COUNT(*) FILTER (WHERE b.data_realizacao_vendas >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ AND b.data_realizacao_vendas <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ) AS reunioes
    FROM base b
    WHERE EXISTS (SELECT 1 FROM official_sdrs os WHERE os.nome = b.sdr_name_raw)
       OR p_sdr_name IS NOT NULL
    GROUP BY b.sdr_name_raw
    ORDER BY leads DESC;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_teste_criativos(p_start_date date, p_end_date date, p_creative_ids text[] DEFAULT NULL::text[], p_min_spend numeric DEFAULT 500)
 RETURNS TABLE(creative_code text, creative_name text, status text, spend numeric, impressions bigint, clicks bigint, ctr numeric, leads_crm bigint, mqls bigint, vendas bigint, faturamento numeric, caixa numeric, cpmql numeric, roas numeric, roas_caixa numeric, is_valid boolean, is_winner boolean, sample_size bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT *
    FROM analisar_criativos(p_start_date, p_end_date, 'creative', NULL, NULL, 0, 10000)
    WHERE p_creative_ids IS NULL OR p_creative_ids = '{}'::TEXT[] OR creative_code = ANY(p_creative_ids)
  ),
  valid_candidates AS (
    SELECT b.*
    FROM base b
    WHERE b.spend >= COALESCE(p_min_spend, 0)
  ),
  winner AS (
    SELECT vc.creative_code
    FROM valid_candidates vc
    ORDER BY vc.roas_caixa DESC NULLS LAST, vc.spend DESC
    LIMIT 1
  )
  SELECT
    b.creative_code,
    b.creative_name,
    b.status,
    b.spend,
    b.impressions,
    b.clicks,
    b.ctr,
    b.leads_crm,
    b.mqls,
    b.vendas,
    b.faturamento,
    b.caixa,
    b.cpmql,
    b.roas,
    b.roas_caixa,
    (b.spend >= COALESCE(p_min_spend, 0)) AS is_valid,
    (w.creative_code IS NOT NULL AND b.creative_code = w.creative_code) AS is_winner,
    b.leads_crm AS sample_size
  FROM base b
  LEFT JOIN winner w ON w.creative_code = b.creative_code
  ORDER BY b.spend DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_trafego(p_start_date date, p_end_date date, p_group_by text DEFAULT 'source'::text, p_utm_source text DEFAULT NULL::text, p_utm_campaign_code text DEFAULT NULL::text, p_mode text DEFAULT 'cohort'::text)
 RETURNS TABLE(group_key text, leads bigint, mqls bigint, conectados bigint, agendados bigint, reunioes bigint, vendas bigint, faturamento numeric, caixa numeric, investimento_meta numeric, cpl numeric, cpmql numeric, cpv numeric, roas numeric, roas_caixa numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH leads_base AS (
    SELECT
      o.id,
      o.data_lead_recebido,
      o.data_conectado,
      o.data_agendamento_reuniao,
      o.data_realizacao_vendas,
      c.utm_source,
      c.utm_campaign,
      c.tags,
      CASE
        WHEN p_group_by = 'campaign' THEN COALESCE(uc.nome, c.utm_campaign, 'Sem campanha')
        WHEN p_group_by = 'channel' THEN COALESCE(us.public_code, c.utm_source, 'Sem canal')
        ELSE COALESCE(c.utm_source, 'Sem source')
      END AS gkey
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN utm_sources us ON us.utm_source = c.utm_source
    LEFT JOIN utm_campaigns uc ON uc.utm_campaign::TEXT = c.utm_campaign
    WHERE o.pipeline_id IS DISTINCT FROM 'Sn1Guqcm6zwZNTVOOf5L'::TEXT
      AND c.utm_source IS NOT NULL
      AND c.utm_source != ''
      AND c.utm_source IN (SELECT utm_source FROM utm_sources WHERE utm_source IS NOT NULL)
      AND (
        (p_mode = 'cohort'
         AND o.data_lead_recebido >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
         AND o.data_lead_recebido <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ)
        OR p_mode = 'produtividade'
      )
      AND (p_utm_source IS NULL OR c.utm_source ILIKE '%' || p_utm_source || '%')
      AND (p_utm_campaign_code IS NULL OR c.utm_campaign = p_utm_campaign_code)
  ),
  vendas_base AS (
    SELECT
      vf.oportunidade_id,
      vf.valor_faturado,
      vf.valor_entrada,
      CASE
        WHEN p_mode = 'produtividade'
          AND vf.data_pagamento_entrada >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
          AND vf.data_pagamento_entrada <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
        THEN true
        WHEN p_mode = 'cohort' AND vf.data_pagamento_entrada IS NOT NULL
        THEN true
        ELSE false
      END AS dentro_periodo
    FROM vendas_fechamento vf
  ),
  meta_base AS (
    SELECT
      COALESCE(us.utm_source, 'Sem source') AS gkey,
      COALESCE(SUM(mai.spend), 0) AS investimento
    FROM utm_sources us
    LEFT JOIN meta_ads_insights mai
      ON mai.ad_name ILIKE '%' || us.public_code || '%'
     AND mai.date BETWEEN p_start_date AND p_end_date
    WHERE (p_utm_source IS NULL OR us.utm_source ILIKE '%' || p_utm_source || '%')
      AND p_group_by = 'source'
    GROUP BY us.utm_source
    UNION ALL
    SELECT
      COALESCE(campaign_name, 'Sem campanha') AS gkey,
      SUM(spend) AS investimento
    FROM meta_ads_insights
    WHERE date BETWEEN p_start_date AND p_end_date
      AND (p_utm_campaign_code IS NULL OR campaign_name ILIKE '%' || p_utm_campaign_code || '%')
      AND p_group_by = 'campaign'
    GROUP BY campaign_name
  ),
  aggr AS (
    SELECT
      lb.gkey,
      COUNT(*) AS qtd_leads,
      COUNT(*) FILTER (WHERE lb.tags IS NOT NULL AND lb.tags::TEXT ILIKE '%MQL%') AS qtd_mqls,
      COUNT(*) FILTER (WHERE lb.data_conectado IS NOT NULL) AS qtd_conectados,
      COUNT(*) FILTER (WHERE lb.data_agendamento_reuniao IS NOT NULL) AS qtd_agendados,
      COUNT(*) FILTER (WHERE lb.data_realizacao_vendas IS NOT NULL) AS qtd_reunioes,
      COUNT(*) FILTER (WHERE vb.dentro_periodo) AS qtd_vendas,
      SUM(CASE WHEN vb.dentro_periodo THEN vb.valor_faturado ELSE 0 END) AS sum_faturamento,
      SUM(CASE WHEN vb.dentro_periodo THEN vb.valor_entrada ELSE 0 END) AS sum_caixa
    FROM leads_base lb
    LEFT JOIN vendas_base vb ON vb.oportunidade_id = lb.id
    GROUP BY lb.gkey
  )
  SELECT
    a.gkey AS group_key,
    a.qtd_leads,
    a.qtd_mqls,
    a.qtd_conectados,
    a.qtd_agendados,
    a.qtd_reunioes,
    a.qtd_vendas,
    COALESCE(a.sum_faturamento, 0),
    COALESCE(a.sum_caixa, 0),
    COALESCE(mb.investimento, 0),
    CASE WHEN a.qtd_leads > 0 THEN ROUND(COALESCE(mb.investimento, 0) / a.qtd_leads, 2) ELSE 0 END,
    CASE WHEN a.qtd_mqls > 0 THEN ROUND(COALESCE(mb.investimento, 0) / a.qtd_mqls, 2) ELSE 0 END,
    CASE WHEN a.qtd_vendas > 0 THEN ROUND(COALESCE(mb.investimento, 0) / a.qtd_vendas, 2) ELSE 0 END,
    CASE WHEN COALESCE(mb.investimento, 0) > 0 THEN ROUND(COALESCE(a.sum_faturamento, 0) / mb.investimento, 2) ELSE 0 END,
    CASE WHEN COALESCE(mb.investimento, 0) > 0 THEN ROUND(COALESCE(a.sum_caixa, 0) / mb.investimento, 2) ELSE 0 END
  FROM aggr a
  LEFT JOIN meta_base mb ON mb.gkey = a.gkey
  ORDER BY COALESCE(mb.investimento, 0) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.analisar_vendas(p_start_date date, p_end_date date, p_group_by text DEFAULT 'none'::text, p_closer_name text DEFAULT NULL::text, p_produto text DEFAULT NULL::text, p_forma_pagamento text DEFAULT NULL::text)
 RETURNS TABLE(group_key text, vendas bigint, faturamento numeric, caixa numeric, ticket_medio numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      vf.id,
      vf.oportunidade_id,
      vf.valor_faturado,
      vf.valor_entrada,
      COALESCE(vf.closer_nome, o.vendedor_closer, 'Sem closer') AS closer,
      vf.produto_vendido AS produto,
      vf.forma_pagamento AS forma
    FROM vendas_fechamento vf
    JOIN oportunidades o ON o.id = vf.oportunidade_id
    WHERE vf.data_pagamento_entrada IS NOT NULL
      AND vf.data_pagamento_entrada >= (p_start_date::TEXT || 'T00:00:00-03:00')::TIMESTAMPTZ
      AND vf.data_pagamento_entrada <= (p_end_date::TEXT || 'T23:59:59.999-03:00')::TIMESTAMPTZ
      AND (p_closer_name IS NULL OR COALESCE(vf.closer_nome, o.vendedor_closer, '') ILIKE '%' || p_closer_name || '%')
      AND (p_produto IS NULL OR vf.produto_vendido ILIKE '%' || p_produto || '%')
      AND (p_forma_pagamento IS NULL OR vf.forma_pagamento ILIKE '%' || p_forma_pagamento || '%')
  ),
  aggr AS (
    SELECT
      CASE
        WHEN p_group_by = 'closer' THEN COALESCE(b.closer, 'Sem closer')
        WHEN p_group_by = 'product' THEN COALESCE(b.produto, 'Sem produto')
        WHEN p_group_by = 'payment_method' THEN COALESCE(b.forma, 'Sem forma de pagamento')
        ELSE 'Total'
      END AS gkey,
      COUNT(*) AS qtd,
      SUM(COALESCE(b.valor_faturado, 0)) AS fat,
      SUM(COALESCE(b.valor_entrada, 0)) AS cxa
    FROM base b
    GROUP BY gkey
  )
  SELECT
    a.gkey,
    a.qtd,
    a.fat,
    a.cxa,
    CASE WHEN a.qtd > 0 THEN ROUND(a.fat / a.qtd, 2) ELSE 0 END
  FROM aggr a
  ORDER BY a.fat DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_ghl_field_mappings(p_workspace_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result jsonb := '{}'::jsonb;
    rec record;
    v_value text;
BEGIN
    IF p_workspace_id IS NULL OR p_payload IS NULL THEN
        RETURN v_result;
    END IF;

    FOR rec IN
        SELECT logical_name, variations
        FROM public.ghl_field_mappings
        WHERE workspace_id = p_workspace_id
          AND enabled = true
        ORDER BY logical_name
    LOOP
        v_value := public.resolve_ghl_field_value(p_payload, rec.variations);
        IF v_value IS NOT NULL THEN
            v_result := v_result || jsonb_build_object(rec.logical_name, v_value);
        END IF;
    END LOOP;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.atualizar_progresso_backfill(p_controle_id uuid, p_data date, p_status text, p_raw_id uuid DEFAULT NULL::uuid, p_registros integer DEFAULT 0, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update the backfill log
    UPDATE meta_ads_backfill_log
    SET 
        status = p_status,
        registros_processados = p_registros,
        error_message = p_error,
        processed_at = NOW()
    WHERE controle_id = p_controle_id AND data = p_data;
    
    -- If status is success or error, update the controle progress
    IF p_status IN ('success', 'error', 'skipped') THEN
        UPDATE meta_ads_backfill_controle
        SET 
            dias_processados = dias_processados + 1,
            finished_at = CASE 
                WHEN dias_processados + 1 >= total_dias THEN NOW()
                ELSE finished_at
            END,
            status = CASE 
                WHEN dias_processados + 1 >= total_dias THEN 'completed'
                ELSE status
            END
        WHERE id = p_controle_id;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_app_feature_role_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_action TEXT;
    v_old JSONB;
    v_new JSONB;
    v_workspace_id UUID;
    v_performed_by UUID;
    v_module_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'granted';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_old := NULL;
        v_workspace_id := NEW.workspace_id;
        v_performed_by := auth.uid();
        v_module_key := NEW.app_slug || '.' || NEW.feature_key || ':role=' || NEW.role;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'updated';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_workspace_id := NEW.workspace_id;
        v_performed_by := auth.uid();
        v_module_key := NEW.app_slug || '.' || NEW.feature_key || ':role=' || NEW.role;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'revoked';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := NULL;
        v_workspace_id := OLD.workspace_id;
        v_performed_by := auth.uid();
        v_module_key := OLD.app_slug || '.' || OLD.feature_key || ':role=' || OLD.role;
    END IF;

    IF v_performed_by IS NULL THEN
        v_performed_by := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    INSERT INTO permission_audit_log (
        workspace_id,
        action,
        target_user_id,
        performed_by,
        module_key,
        old_value,
        new_value
    ) VALUES (
        v_workspace_id,
        v_action,
        v_performed_by,
        v_performed_by,
        v_module_key,
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_app_feature_user_overrides()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_action TEXT;
    v_old JSONB;
    v_new JSONB;
    v_workspace_id UUID;
    v_target_user_id UUID;
    v_performed_by UUID;
    v_module_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'granted';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_old := NULL;
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.app_slug || '.' || NEW.feature_key;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'updated';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.app_slug || '.' || NEW.feature_key;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'revoked';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := NULL;
        v_workspace_id := OLD.workspace_id;
        v_target_user_id := OLD.user_id;
        v_performed_by := auth.uid();
        v_module_key := OLD.app_slug || '.' || OLD.feature_key;
    END IF;

    IF v_performed_by IS NULL THEN
        v_performed_by := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    INSERT INTO permission_audit_log (
        workspace_id,
        action,
        target_user_id,
        performed_by,
        module_key,
        old_value,
        new_value
    ) VALUES (
        v_workspace_id,
        v_action,
        v_target_user_id,
        v_performed_by,
        v_module_key,
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_dashboard_user_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_action TEXT;
    v_old JSONB;
    v_new JSONB;
    v_workspace_id UUID;
    v_target_user_id UUID;
    v_performed_by UUID;
    v_module_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'granted';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_old := NULL;
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.module_key;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'updated';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := to_jsonb(NEW) - 'created_at' - 'updated_at';
        v_workspace_id := NEW.workspace_id;
        v_target_user_id := NEW.user_id;
        v_performed_by := COALESCE(NEW.granted_by, auth.uid());
        v_module_key := NEW.module_key;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'revoked';
        v_old := to_jsonb(OLD) - 'created_at' - 'updated_at';
        v_new := NULL;
        v_workspace_id := OLD.workspace_id;
        v_target_user_id := OLD.user_id;
        v_performed_by := auth.uid();
        v_module_key := OLD.module_key;
    END IF;

    IF v_performed_by IS NULL THEN
        v_performed_by := '00000000-0000-0000-0000-000000000000'::UUID;
    END IF;

    INSERT INTO permission_audit_log (
        workspace_id,
        action,
        target_user_id,
        performed_by,
        module_key,
        old_value,
        new_value
    ) VALUES (
        v_workspace_id,
        v_action,
        v_target_user_id,
        v_performed_by,
        v_module_key,
        v_old,
        v_new
    );

    RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_leads_fevereiro()
 RETURNS TABLE(total_leads_fevereiro bigint, com_trafego_pago bigint, sem_utm_source bigint, utm_desconhecido bigint)
 LANGUAGE sql
 STABLE
AS $function$
WITH leads_fev AS (
  SELECT
    o.id,
    c.utm_source,
    CASE
      WHEN c.utm_source IS NULL OR TRIM(c.utm_source) = ''
        THEN 'sem_utm'
      WHEN us.utm_source IS NOT NULL
        THEN 'trafego_pago'
      ELSE 'utm_nao_cadastrado'
    END AS classificacao
  FROM oportunidades o
  INNER JOIN contatos c ON c.id = o.contato_id
  LEFT JOIN utm_sources us ON us.utm_source = c.utm_source
  WHERE o.data_lead_recebido >= '2026-02-01T00:00:00-03:00'
    AND o.data_lead_recebido <= '2026-02-28T23:59:59-03:00'
)
SELECT
  COUNT(*) AS total_leads_fevereiro,
  COUNT(*) FILTER (WHERE classificacao = 'trafego_pago') AS com_trafego_pago,
  COUNT(*) FILTER (WHERE classificacao = 'sem_utm') AS sem_utm_source,
  COUNT(*) FILTER (WHERE classificacao = 'utm_desconhecido') AS utm_desconhecido
FROM leads_fev;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_leads_por_utm_source()
 RETURNS TABLE(utm_source text, canal_cadastrado text, total_leads bigint, e_trafego_pago text)
 LANGUAGE sql
 STABLE
AS $function$
SELECT
  COALESCE(c.utm_source, '(NULL)') AS utm_source,
  us.nome AS canal_cadastrado,
  COUNT(o.id) AS total_leads,
  CASE WHEN us.utm_source IS NOT NULL THEN '✓ Sim' ELSE '✗ Não' END AS e_trafego_pago
FROM oportunidades o
INNER JOIN contatos c ON c.id = o.contato_id
LEFT JOIN utm_sources us ON us.utm_source = c.utm_source
WHERE o.data_lead_recebido >= '2026-02-01T00:00:00-03:00'
  AND o.data_lead_recebido <= '2026-02-28T23:59:59-03:00'
GROUP BY c.utm_source, us.nome, us.utm_source
ORDER BY total_leads DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.auditoria_sdr_ia(p_workspace_id uuid, p_start_date date, p_end_date date, p_include_tags text[] DEFAULT NULL::text[], p_exclude_tags text[] DEFAULT NULL::text[], p_include_pipelines text[] DEFAULT NULL::text[], p_exclude_pipelines text[] DEFAULT NULL::text[], p_include_utm_source text[] DEFAULT NULL::text[], p_exclude_utm_source text[] DEFAULT NULL::text[], p_include_utm_campaign text[] DEFAULT NULL::text[], p_exclude_utm_campaign text[] DEFAULT NULL::text[])
 RETURNS TABLE(contato_id uuid, contato_nome text, contato_email text, contato_telefone text, contato_tags text[], opp_id uuid, sdr_humano text, tipo text, severidade text, detalhes text, ultima_interacao timestamp with time zone, msg_ia integer, msg_lead integer, channel text, error_msg text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_cutoff_7d timestamptz;
BEGIN
  -- Converte datas para intervalo em BRT (America/Sao_Paulo)
  v_start_ts := timezone('America/Sao_Paulo', (p_start_date::text || ' 00:00:00')::timestamp);
  v_end_ts   := timezone('America/Sao_Paulo', (p_end_date::text || ' 23:59:59')::timestamp);
  v_cutoff_7d := timezone('America/Sao_Paulo', ((current_date - interval '7 days')::date::text || ' 00:00:00')::timestamp);

  RETURN QUERY
  WITH
  universo AS (
    SELECT DISTINCT c.contato_id
    FROM comunicacoes c
    JOIN contatos ct ON ct.id = c.contato_id
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    WHERE ct.workspace_id = p_workspace_id
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND (p_include_utm_source IS NULL OR p_include_utm_source = '{}'::text[] OR ct.utm_source = ANY(p_include_utm_source))
      AND (p_exclude_utm_source IS NULL OR p_exclude_utm_source = '{}'::text[] OR ct.utm_source IS NULL OR NOT (ct.utm_source = ANY(p_exclude_utm_source)))
      AND (p_include_utm_campaign IS NULL OR p_include_utm_campaign = '{}'::text[] OR ct.utm_campaign::text = ANY(p_include_utm_campaign))
      AND (p_exclude_utm_campaign IS NULL OR p_exclude_utm_campaign = '{}'::text[] OR ct.utm_campaign IS NULL OR NOT (ct.utm_campaign::text = ANY(p_exclude_utm_campaign)))
  ),
  contato_info AS (
    SELECT
      ct.id AS cid,
      ct.nome AS cnome,
      ct.email AS cemail,
      ct.telefone AS ctelefone,
      string_to_array(ct.tags, ',') AS ctags_arr
    FROM contatos ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.id IN (SELECT contato_id FROM universo)
      AND (
        p_include_tags IS NULL OR p_include_tags = '{}'::text[] OR
        ct.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(p_include_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
      AND (
        p_exclude_tags IS NULL OR p_exclude_tags = '{}'::text[] OR
        ct.tags IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p_exclude_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
  ),
  oportunidade_info AS (
    SELECT DISTINCT ON (o.contato_id)
      o.contato_id AS ocid,
      o.id AS oid,
      COALESCE(o.sdr_name, ct.owner_name) AS osdr
    FROM oportunidades o
    JOIN contatos ct ON ct.id = o.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND o.contato_id IN (SELECT cid FROM contato_info)
      AND (p_include_pipelines IS NULL OR p_include_pipelines = '{}'::text[] OR o.pipeline_id = ANY(p_include_pipelines))
      AND (p_exclude_pipelines IS NULL OR p_exclude_pipelines = '{}'::text[] OR NOT (o.pipeline_id = ANY(p_exclude_pipelines)))
    ORDER BY o.contato_id, o.data_lead_recebido DESC NULLS LAST
  ),
  stats AS (
    SELECT
      c.contato_id AS scid,
      COUNT(*) FILTER (WHERE ccr.autor = 'automacao' AND c.direction = 'outbound') AS qtd_ia,
      COUNT(*) FILTER (WHERE c.direction = 'inbound') AS qtd_lead,
      COUNT(*) FILTER (WHERE ccr.autor != 'automacao' AND c.direction = 'outbound') AS qtd_humano,
      MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound') AS ultimo_outbound
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    GROUP BY c.contato_id
  ),
  erro_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS ecid,
      c.channel AS echannel,
      c.error_msg AS eerror,
      c.data_comunicacao AS edata
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.msg_status = 'failed'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    ORDER BY c.contato_id, c.data_comunicacao DESC
  ),
  spam_calc AS (
    SELECT
      c.contato_id AS spcid,
      COUNT(*) FILTER (WHERE diff_seg < 600) AS qtd_rapidas_10min,
      COUNT(*) FILTER (WHERE diff_seg < 300) AS qtd_rapidas_5min,
      MAX(c.data_comunicacao) AS ultima_data
    FROM (
      SELECT
        c.contato_id,
        c.data_comunicacao,
        EXTRACT(EPOCH FROM (c.data_comunicacao - LAG(c.data_comunicacao) OVER (PARTITION BY c.contato_id ORDER BY c.data_comunicacao))) AS diff_seg
      FROM comunicacoes c
      JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
      JOIN contatos ct ON ct.id = c.contato_id
      WHERE ct.workspace_id = p_workspace_id
        AND c.contato_id IN (SELECT cid FROM contato_info)
        AND ccr.autor = 'automacao'
        AND c.direction = 'outbound'
        AND c.data_comunicacao >= v_start_ts
        AND c.data_comunicacao <= v_end_ts
    ) c
    GROUP BY c.contato_id
  ),
  horario_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS hcid,
      EXTRACT(HOUR FROM timezone('America/Sao_Paulo', c.data_comunicacao))::int AS hora_sp,
      c.data_comunicacao AS hdata,
      c.channel AS hchannel
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND EXTRACT(HOUR FROM timezone('America/Sao_Paulo', c.data_comunicacao)) NOT BETWEEN 8 AND 21
    ORDER BY c.contato_id, c.data_comunicacao DESC
  )
  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'sem_followup'::text,
    CASE WHEN s.ultimo_outbound < timezone('America/Sao_Paulo', ((current_date - interval '14 days')::date::text || ' 00:00:00')::timestamp) THEN 'alta' ELSE 'media' END,
    ('Último contato há ' || GREATEST(1, (extract(epoch from (now() - s.ultimo_outbound))/86400)::int) || ' dias (IA + humano)')::text,
    s.ultimo_outbound,
    NULL::integer,
    NULL::integer,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.ultimo_outbound < v_cutoff_7d

  UNION ALL

  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'erro_entrega'::text,
    CASE
      WHEN lower(ei.eerror) LIKE '%invalid%' OR lower(ei.eerror) LIKE '%block%' OR lower(ei.eerror) LIKE '%unavailable%'
      THEN 'alta' ELSE 'media'
    END,
    ('Mensagem não entregue via ' || COALESCE(ei.echannel, '?') || ': ' || COALESCE(ei.eerror, 'Erro desconhecido'))::text,
    ei.edata,
    NULL::integer,
    NULL::integer,
    ei.echannel,
    ei.eerror
  FROM contato_info ci
  JOIN erro_info ei ON ei.ecid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid

  UNION ALL

  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'spam'::text,
    CASE WHEN sp.qtd_rapidas_5min > 5 THEN 'alta' ELSE 'media' END,
    (sp.qtd_rapidas_10min || ' mensagens rápidas (em <10min)')::text,
    sp.ultima_data,
    s.qtd_ia::integer,
    NULL::integer,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN spam_calc sp ON sp.spcid = ci.cid
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE sp.qtd_rapidas_10min > 5

  UNION ALL

  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'horario_inadequado'::text,
    CASE WHEN hi.hora_sp >= 0 AND hi.hora_sp < 6 THEN 'media' ELSE 'baixa' END,
    ('Mensagem enviada às ' || hi.hora_sp || ':00 (fora do horário comercial 08:00-22:00)')::text,
    hi.hdata,
    NULL::integer,
    NULL::integer,
    hi.hchannel,
    NULL::text
  FROM contato_info ci
  JOIN horario_info hi ON hi.hcid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid

  UNION ALL

  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'conversa_unilateral'::text,
    CASE WHEN s.qtd_ia > 5 THEN 'media' ELSE 'baixa' END,
    (s.qtd_ia || ' mensagens da IA, 0 respostas do lead')::text,
    v_end_ts,
    s.qtd_ia::integer,
    0,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.qtd_ia > 3 AND s.qtd_lead = 0

  UNION ALL

  SELECT
    ci.cid,
    ci.cnome,
    ci.cemail,
    ci.ctelefone,
    ci.ctags_arr,
    oi.oid,
    oi.osdr,
    'conflito_humano'::text,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor = 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      AND EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor != 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      THEN 'alta' ELSE 'media'
    END,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor = 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      AND EXISTS (
        SELECT 1 FROM comunicacoes c
        JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid
          AND ccr.autor != 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      )
      THEN 'Mensagens de IA e humano no mesmo dia'
      ELSE 'Lead recebeu mensagens de IA e humano'
    END::text,
    COALESCE(
      (SELECT MAX(c.data_comunicacao) FROM comunicacoes c
       JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
       WHERE c.contato_id = ci.cid AND ccr.autor != 'automacao' AND c.direction = 'outbound'
         AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts),
      (SELECT MAX(c.data_comunicacao) FROM comunicacoes c
       JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
       WHERE c.contato_id = ci.cid AND ccr.autor = 'automacao' AND c.direction = 'outbound'
         AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts)
    ),
    NULL::integer,
    NULL::integer,
    NULL::text,
    NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.qtd_ia > 0 AND s.qtd_humano > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_tag_conectado_on_inbound()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ghl_id    TEXT;
  v_tags      TEXT;
  v_tags_json JSONB;
BEGIN
  -- Saída rápida: só processa mensagens inbound
  IF NEW.direction IS DISTINCT FROM 'inbound' THEN
    RETURN NEW;
  END IF;

  -- Só conecta se existe outbound com timestamp ANTERIOR ao desta mensagem.
  -- Isso resolve o webhook fora de ordem: o botão do lead (inbound T1)
  -- chega após o outbound do bot (T2 > T1), mas data_comunicacao do botão
  -- é T1 < T2, então nenhum outbound é "antes" de T1 → não conecta.
  IF NOT EXISTS (
    SELECT 1
      FROM comunicacoes com
     WHERE com.contato_id       = NEW.contato_id
       AND com.direction        = 'outbound'
       AND com.data_comunicacao < NEW.data_comunicacao
  ) THEN
    RETURN NEW;
  END IF;

  -- Lê ghl_id e tags atuais do contato
  SELECT ghl_id, tags
    INTO v_ghl_id, v_tags
    FROM contatos
   WHERE id = NEW.contato_id;

  IF v_ghl_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Já tem a tag → nada a fazer
  IF EXISTS (
    SELECT 1
      FROM UNNEST(string_to_array(COALESCE(v_tags, ''), ',')) AS t(tag)
     WHERE LOWER(TRIM(t.tag)) = 'conectado'
  ) THEN
    RETURN NEW;
  END IF;

  -- 1. Atualiza contatos.tags localmente
  UPDATE contatos
     SET tags = CASE
                  WHEN tags IS NULL OR TRIM(tags) = '' THEN 'conectado'
                  ELSE tags || ',conectado'
                END
   WHERE id = NEW.contato_id;

  -- 2. Preenche data_conectado nas oportunidades abertas (se NULL)
  UPDATE oportunidades
     SET data_conectado = NEW.data_comunicacao::DATE
   WHERE contato_id = NEW.contato_id
     AND data_conectado IS NULL
     AND status != 'lost';

  -- 3. Monta array de tags para o GHL
  SELECT jsonb_agg(tag ORDER BY tag)
    INTO v_tags_json
    FROM (
      SELECT LOWER(TRIM(t.tag)) AS tag
        FROM UNNEST(string_to_array(COALESCE(v_tags, ''), ',')) AS t(tag)
       WHERE TRIM(t.tag) != ''
      UNION
      SELECT 'conectado'
    ) sub;

  IF v_tags_json IS NULL THEN
    v_tags_json := '["conectado"]'::JSONB;
  END IF;

  -- 4. Enfileira PUT no GHL via fila centralizada
  INSERT INTO ghl_api_jobs (
    url, method, body, caller, priority, idempotency_key, context
  )
  VALUES (
    'https://services.leadconnectorhq.com/contacts/' || v_ghl_id,
    'PUT',
    jsonb_build_object('tags', v_tags_json),
    'auto-tag-conectado',
    3,
    'auto-tag-conectado:' || NEW.contato_id::TEXT,
    jsonb_build_object(
      'contato_id', NEW.contato_id,
      'ghl_id',     v_ghl_id,
      'tag_added',  'conectado'
    )
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.backfill_meta_ads_job(p_data_inicio date DEFAULT ((CURRENT_DATE - '7 days'::interval))::date, p_data_fim date DEFAULT ((CURRENT_DATE - '1 day'::interval))::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_url TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-meta-ads-backfill';
    v_service_key TEXT := '' || get_secret('service_role_key') || '';
    v_request_id BIGINT;
    v_body JSONB;
BEGIN
    -- Montar body da requisição
    v_body := jsonb_build_object(
        'data_inicio', to_char(p_data_inicio, 'YYYY-MM-DD'),
        'data_fim', to_char(p_data_fim, 'YYYY-MM-DD')
    );
    
    -- Fazer requisição HTTP
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := v_body
    ) INTO v_request_id;
    
    RETURN 'Request ID: ' || v_request_id || ' | Período: ' || p_data_inicio || ' a ' || p_data_fim;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bot_query(sql_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
  normalized TEXT;
BEGIN
  -- Normalizar: remover espaços/newlines do início e passar para maiúsculas para checagem
  normalized := UPPER(TRIM(sql_text));

  -- Validar que é uma query de leitura (SELECT ou WITH para CTEs)
  IF NOT (normalized LIKE 'SELECT%' OR normalized LIKE 'WITH%') THEN
    RAISE EXCEPTION 'bot_query: apenas SELECT e WITH são permitidos. Recebido: %', LEFT(sql_text, 50);
  END IF;

  -- Bloqueios adicionais de palavras-chave destrutivas
  IF normalized ~ '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
    RAISE EXCEPTION 'bot_query: comando não permitido detectado na query.';
  END IF;

  -- Executar e retornar como JSONB array
  EXECUTE format('SELECT jsonb_agg(row_to_json(q)) FROM (%s) q', sql_text)
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_documentos_clara(p_query text, p_limit integer DEFAULT 5)
 RETURNS TABLE(doc_path text, chunk_index integer, title text, content text, rank numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    c.doc_path,
    c.chunk_index,
    c.title,
    c.content,
    ts_rank_cd(c.fts, plainto_tsquery('portuguese', p_query))::NUMERIC AS rank
  FROM public.ai_doc_chunks c
  WHERE c.fts @@ plainto_tsquery('portuguese', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_lead_para_venda(p_telefone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tel_digits text;
  v_tel_core   text;
  v_email      text;
  v_result     jsonb;
BEGIN
  v_tel_digits := NULLIF(regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g'), '');
  v_tel_core   := CASE
                    WHEN v_tel_digits IS NOT NULL AND length(v_tel_digits) >= 8
                    THEN right(v_tel_digits, 8)
                    ELSE NULL
                  END;
  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');

  IF v_tel_core IS NULL AND v_email IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(cand), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      ct.id                                                   AS contato_id,
      ct.nome                                                 AS contato_nome,
      ct.email                                                AS contato_email,
      ct.telefone                                             AS contato_telefone,
      CASE
        WHEN v_tel_core IS NOT NULL
             AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core
          THEN 'telefone'
        ELSE 'email'
      END                                                     AS match_por,
      COALESCE((
        SELECT jsonb_agg(op_row ORDER BY op_row.data_lead_recebido DESC NULLS LAST)
        FROM (
          SELECT
            op.id              AS oportunidade_id,
            op.titulo          AS titulo,
            op.pipeline_name   AS pipeline_name,
            op.status          AS status,
            op.data_lead_recebido,
            op.sdr_name        AS sdr_name,
            op.vendedor_closer AS vendedor_closer
          FROM public.oportunidades op
          WHERE op.contato_id = ct.id
        ) op_row
      ), '[]'::jsonb)                                         AS oportunidades
    FROM public.contatos ct
    WHERE
      (v_tel_core IS NOT NULL
        AND right(regexp_replace(COALESCE(ct.telefone, ''), '\D', '', 'g'), 8) = v_tel_core)
      OR (v_email IS NOT NULL AND lower(ct.email) = v_email)
    LIMIT 25
  ) cand;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.buscar_reengajamento(p_workspace_id uuid, p_sdr_name text DEFAULT NULL::text, p_limit integer DEFAULT 10)
 RETURNS TABLE(oportunidade_id uuid, contato_id uuid, nome text, telefone text, ghl_id text, ultima_mensagem text, data_ultima_mensagem timestamp with time zone, contexto text, utm_source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.contato_id,
    ct.nome::TEXT,
    ct.telefone::TEXT,
    ct.ghl_id::TEXT,
    last_msg.body::TEXT,
    last_msg.data_comunicacao,
    CASE
      WHEN last_msg.body IS NOT NULL
        THEN 'Respondeu há '
             || ROUND(EXTRACT(EPOCH FROM (now() - last_msg.data_comunicacao)) / 86400)::TEXT
             || 'd: "' || LEFT(last_msg.body, 80) || '"'
      ELSE 'Entrou via ' || COALESCE(ct.utm_source, 'fonte desconhecida') || ' — nunca respondeu'
    END::TEXT AS contexto,
    ct.utm_source::TEXT
  FROM oportunidades o
  JOIN contatos ct ON ct.id = o.contato_id
  LEFT JOIN LATERAL (
    SELECT c.body, c.data_comunicacao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
      AND c.data_comunicacao > (now() - INTERVAL '60 days')
    ORDER BY c.data_comunicacao DESC
    LIMIT 1
  ) last_msg ON true
  WHERE o.status = 'open'
    AND o.pipeline_id IS NOT NULL
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Pré-Vendas nMQL', 'Auto Agendamento')
    AND ct.workspace_id = p_workspace_id
    AND (p_sdr_name IS NULL OR o.sdr_name = p_sdr_name)
    AND (
      NOT EXISTS (SELECT 1 FROM discagem_scores ds WHERE ds.oportunidade_id = o.id)
      OR EXISTS (
        SELECT 1 FROM discagem_scores ds
        WHERE ds.oportunidade_id = o.id
          AND ds.numero_tentativa >= 6
          AND ds.camada = 'cadencia'
      )
    )
    AND last_msg.data_comunicacao IS NOT NULL
    AND last_msg.data_comunicacao < (now() - INTERVAL '3 days')
  ORDER BY last_msg.data_comunicacao DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_next_run_at(p_frequency text, p_day_of_week integer, p_day_of_month integer, p_time_of_day time without time zone, p_timezone text DEFAULT 'America/Sao_Paulo'::text, p_after timestamp with time zone DEFAULT now())
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_now DATE;
  v_now_time TIME;
  v_candidate TIMESTAMPTZ;
  v_base DATE;
BEGIN
  v_now := (p_after AT TIME ZONE p_timezone)::DATE;
  v_now_time := (p_after AT TIME ZONE p_timezone)::TIME;

  IF p_frequency = 'daily' THEN
    -- Todo dia no horário especificado
    IF p_time_of_day > v_now_time THEN
      v_base := v_now;
    ELSE
      v_base := v_now + INTERVAL '1 day';
    END IF;
    v_candidate := (v_base::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;
    RETURN v_candidate;

  ELSIF p_frequency IN ('weekly', 'biweekly') THEN
    -- Próximo dia da semana no horário especificado
    IF p_day_of_week IS NULL THEN
      p_day_of_week := 1; -- segunda como padrão
    END IF;

    v_base := v_now + ((p_day_of_week - EXTRACT(DOW FROM v_now))::INTEGER % 7) * INTERVAL '1 day';
    IF v_base < v_now OR (v_base = v_now AND p_time_of_day <= v_now_time) THEN
      v_base := v_base + INTERVAL '7 days';
    END IF;

    v_candidate := (v_base::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;

    IF p_frequency = 'biweekly' THEN
      -- Ajusta para semanas alternadas: garante que a próxima execução seja 14 dias após a última segunda-feira da semana
      -- Simplificação: arredonda para a próxima segunda-feira ímpar/par baseada na semana do ano
      IF EXTRACT(WEEK FROM v_base)::INTEGER % 2 != EXTRACT(WEEK FROM v_now)::INTEGER % 2 THEN
        v_candidate := v_candidate + INTERVAL '7 days';
      END IF;
    END IF;

    RETURN v_candidate;

  ELSIF p_frequency = 'monthly' THEN
    -- Dia do mês no horário especificado
    IF p_day_of_month IS NULL THEN
      p_day_of_month := 1;
    END IF;

    v_base := make_date(EXTRACT(YEAR FROM v_now)::INTEGER, EXTRACT(MONTH FROM v_now)::INTEGER, LEAST(p_day_of_month, 28));
    IF v_base < v_now OR (v_base = v_now AND p_time_of_day <= v_now_time) THEN
      v_base := v_base + INTERVAL '1 month';
    END IF;

    v_candidate := (v_base::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;
    RETURN v_candidate;
  END IF;

  -- Fallback: amanhã no mesmo horário
  RETURN ((v_now + INTERVAL '1 day')::TEXT || ' ' || p_time_of_day::TEXT || ' ' || p_timezone)::TIMESTAMPTZ;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_disparos(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        is_workspace_admin(p_workspace_id)
        OR EXISTS (
            SELECT 1 FROM app_feature_user_overrides
            WHERE workspace_id = p_workspace_id
              AND app_slug = 'disparos'
              AND feature_key = 'configuracao'
              AND user_id = auth.uid()
              AND can_edit = true
        )
        OR EXISTS (
            SELECT 1
            FROM app_feature_role_permissions afrp
            JOIN workspace_members wm
              ON wm.workspace_id = afrp.workspace_id
             AND wm.role = afrp.role
            WHERE afrp.workspace_id = p_workspace_id
              AND afrp.app_slug = 'disparos'
              AND afrp.feature_key = 'configuracao'
              AND afrp.can_edit = true
              AND wm.user_id = auth.uid()
              AND wm.is_active = true
        );
$function$
;

CREATE OR REPLACE FUNCTION public.can_write_sdr_ia_config(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        is_workspace_admin(p_workspace_id)
        OR EXISTS (
            SELECT 1 FROM app_feature_user_overrides
            WHERE workspace_id = p_workspace_id
              AND app_slug = 'sdr-ia'
              AND feature_key = 'configuracao'
              AND user_id = auth.uid()
              AND can_edit = true
        )
        OR EXISTS (
            SELECT 1
            FROM app_feature_role_permissions afrp
            JOIN workspace_members wm
              ON wm.workspace_id = afrp.workspace_id
             AND wm.role = afrp.role
            WHERE afrp.workspace_id = p_workspace_id
              AND afrp.app_slug = 'sdr-ia'
              AND afrp.feature_key = 'configuracao'
              AND afrp.can_edit = true
              AND wm.user_id = auth.uid()
              AND wm.is_active = true
        );
$function$
;

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_identifier text, p_action text, p_max_attempts integer DEFAULT 5, p_window_minutes integer DEFAULT 60)
 RETURNS TABLE(is_allowed boolean, attempts_remaining integer, blocked_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate_limit auth_rate_limits%ROWTYPE;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;
  
  -- Get or create rate limit record
  SELECT * INTO v_rate_limit
  FROM auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;
  
  IF v_rate_limit IS NULL THEN
    -- First attempt
    INSERT INTO auth_rate_limits (identifier, action, attempt_count)
    VALUES (p_identifier, p_action, 1);
    
    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::TIMESTAMPTZ;
  ELSE
    -- Check if blocked
    IF v_rate_limit.blocked_until IS NOT NULL AND v_rate_limit.blocked_until > now() THEN
      RETURN QUERY SELECT false, 0, v_rate_limit.blocked_until;
    END IF;
    
    -- Check if window expired
    IF v_rate_limit.last_attempt_at < v_window_start THEN
      -- Reset counter
      UPDATE auth_rate_limits
      SET attempt_count = 1, first_attempt_at = now(), last_attempt_at = now()
      WHERE identifier = p_identifier AND action = p_action;
      
      RETURN QUERY SELECT true, p_max_attempts - 1, NULL::TIMESTAMPTZ;
    ELSE
      -- Increment counter
      UPDATE auth_rate_limits
      SET attempt_count = attempt_count + 1, last_attempt_at = now()
      WHERE identifier = p_identifier AND action = p_action;
      
      -- Check if exceeded
      IF v_rate_limit.attempt_count >= p_max_attempts THEN
        -- Block for 15 minutes
        UPDATE auth_rate_limits
        SET blocked_until = now() + '15 minutes'::INTERVAL
        WHERE identifier = p_identifier AND action = p_action;
        
        RETURN QUERY SELECT false, 0, now() + '15 minutes'::INTERVAL;
      ELSE
        RETURN QUERY SELECT true, p_max_attempts - v_rate_limit.attempt_count - 1, NULL::TIMESTAMPTZ;
      END IF;
    END IF;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_contact_opp_sync_queue(p_batch_size integer DEFAULT 20, p_stale_after_minutes integer DEFAULT 30)
 RETURNS TABLE(id uuid, ghl_contact_id text, location_id text, attempts integer, created_at timestamp with time zone, last_error text, claimed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.requeue_stale_contact_opp_sync_queue(p_stale_after_minutes);

  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.contact_opp_sync_queue q
    WHERE q.status = 'pending'
    ORDER BY q.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(p_batch_size, 200), 1)
  ),
  updated AS (
    UPDATE public.contact_opp_sync_queue q
    SET
      status = 'processing',
      claimed_at = NOW(),
      attempts = COALESCE(q.attempts, 0) + 1
    FROM picked
    WHERE q.id = picked.id
    RETURNING
      q.id,
      q.ghl_contact_id,
      q.location_id,
      q.attempts,
      q.created_at,
      q.last_error,
      q.claimed_at
  )
  SELECT
    updated.id,
    updated.ghl_contact_id,
    updated.location_id,
    updated.attempts,
    updated.created_at,
    updated.last_error,
    updated.claimed_at
  FROM updated
  ORDER BY updated.created_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_ghl_api_jobs(max_jobs integer DEFAULT 50)
 RETURNS SETOF ghl_api_jobs
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.ghl_api_jobs
  SET
    status = 'processing',
    attempts = attempts + 1,
    claimed_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.ghl_api_jobs
    WHERE status = 'pending'
      AND next_retry_at <= NOW()
    ORDER BY priority ASC, next_retry_at ASC
    LIMIT max_jobs
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_ghl_opp_reconcile_items(p_run_id uuid, p_batch_size integer DEFAULT 20, p_stale_after_minutes integer DEFAULT 30)
 RETURNS TABLE(id uuid, run_id uuid, contato_id uuid, ghl_contact_id text, location_id text, nome_contato text, email_contato text, attempts integer, created_at timestamp with time zone, last_error text, claimed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.requeue_stale_ghl_opp_reconcile_items(p_run_id, p_stale_after_minutes);

  RETURN QUERY
  WITH picked AS (
    SELECT i.id
    FROM public.ghl_opp_reconcile_items i
    WHERE i.run_id = p_run_id
      AND i.status = 'pending'
    ORDER BY i.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(p_batch_size, 500), 1)
  ),
  updated AS (
    UPDATE public.ghl_opp_reconcile_items i
    SET
      status = 'processing',
      claimed_at = NOW(),
      attempts = COALESCE(i.attempts, 0) + 1,
      updated_at = NOW()
    FROM picked
    WHERE i.id = picked.id
    RETURNING
      i.id,
      i.run_id,
      i.contato_id,
      i.ghl_contact_id,
      i.location_id,
      i.nome_contato,
      i.email_contato,
      i.attempts,
      i.created_at,
      i.last_error,
      i.claimed_at
  )
  SELECT
    updated.id,
    updated.run_id,
    updated.contato_id,
    updated.ghl_contact_id,
    updated.location_id,
    updated.nome_contato,
    updated.email_contato,
    updated.attempts,
    updated.created_at,
    updated.last_error,
    updated.claimed_at
  FROM updated
  ORDER BY updated.created_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_reset_tokens()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM auth_password_reset_tokens
  WHERE expires_at < now() AND used_at IS NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.contato_tem_tag(tags_text text, tag_buscada text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        EXISTS (
            SELECT 1
            FROM unnest(string_to_array(COALESCE(tags_text, ''), ',')) AS t
            WHERE lower(trim(t)) = lower(trim(tag_buscada))
        ),
        false
    );
$function$
;

CREATE OR REPLACE FUNCTION public.create_weekly_email_schedule(p_name text, p_description text, p_modules text[], p_report_type text, p_frequency text, p_day_of_week integer, p_day_of_month integer, p_time_of_day time without time zone, p_subject text, p_recipient_emails text[], p_reply_to text DEFAULT NULL::text, p_template_key text DEFAULT 'default'::text, p_include_comparative boolean DEFAULT true, p_include_trends boolean DEFAULT false, p_clara_prompt text DEFAULT NULL::text, p_use_clara_summary boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
  v_next_run TIMESTAMPTZ;
BEGIN
  v_next_run := public.calculate_next_run_at(
    p_frequency,
    p_day_of_week,
    p_day_of_month,
    p_time_of_day,
    'America/Sao_Paulo',
    NOW()
  );

  INSERT INTO public.weekly_email_schedules (
    created_by,
    name,
    description,
    modules,
    report_type,
    frequency,
    day_of_week,
    day_of_month,
    time_of_day,
    subject,
    recipient_emails,
    reply_to,
    template_key,
    include_comparative,
    include_trends,
    clara_prompt,
    use_clara_summary,
    next_run_at
  )
  VALUES (
    auth.uid(),
    p_name,
    p_description,
    p_modules,
    p_report_type,
    p_frequency,
    p_day_of_week,
    p_day_of_month,
    p_time_of_day,
    COALESCE(p_subject, 'Relatório Semanal - Empire Business'),
    p_recipient_emails,
    p_reply_to,
    COALESCE(p_template_key, 'default'),
    COALESCE(p_include_comparative, true),
    COALESCE(p_include_trends, false),
    p_clara_prompt,
    COALESCE(p_use_clara_summary, false),
    v_next_run
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(workspace_name text, workspace_settings jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_workspace_id UUID;
BEGIN
    INSERT INTO workspaces (name, owner_id, settings)
    VALUES (workspace_name, auth.uid(), workspace_settings)
    RETURNING id INTO new_workspace_id;

    INSERT INTO workspace_members (workspace_id, user_id, role, invited_by, joined_at, is_active)
    VALUES (new_workspace_id, auth.uid(), 'owner', auth.uid(), now(), true);

    RETURN new_workspace_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.criar_backfill_meta_ads(p_data_inicio date, p_data_fim date)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_controle_id UUID;
    v_total_dias INTEGER;
BEGIN
    -- Calculate total days
    v_total_dias := (p_data_fim - p_data_inicio)::INTEGER + 1;
    
    -- Create controle record
    INSERT INTO meta_ads_backfill_controle (
        status,
        data_inicio,
        data_fim,
        dias_processados,
        total_dias,
        started_at
    ) VALUES (
        'pending',
        p_data_inicio,
        p_data_fim,
        0,
        v_total_dias,
        NOW()
    ) RETURNING id INTO v_controle_id;
    
    -- Create log entries for each day
    INSERT INTO meta_ads_backfill_log (controle_id, data, status, registros_processados)
    SELECT 
        v_controle_id,
        generate_series(p_data_inicio, p_data_fim, '1 day'::interval)::DATE,
        'pending',
        0;
    
    RETURN v_controle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_weekly_email_schedule(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM public.weekly_email_schedules WHERE id = p_id;
  RETURN FOUND;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_contact_opp_sync()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contact_id TEXT;
  v_location_id TEXT;
BEGIN
  -- Só processa eventos de criação de contato
  -- Suporta variações: 'ContactCreate', 'contact.created'
  IF NEW.payload->>'type' NOT IN ('ContactCreate', 'contact.created') THEN
    RETURN NEW;
  END IF;

  -- Extrai contact_id — suporta variações de nome de campo
  v_contact_id := COALESCE(
    NEW.payload->>'contact_id',
    NEW.payload->>'contactId',
    NEW.payload->'contact'->>'id'
  );

  -- Valida: contact_id não pode ser vazio
  IF v_contact_id IS NULL OR TRIM(v_contact_id) = '' THEN
    RETURN NEW;
  END IF;

  -- Extrai location_id do webhook — suporta variações
  v_location_id := COALESCE(
    NEW.payload->'location'->>'id',
    NEW.payload->>'locationId',
    NEW.payload->>'location_id'
  );

  -- Valida: location_id é obrigatório
  IF v_location_id IS NULL OR TRIM(v_location_id) = '' THEN
    RAISE WARNING '[enqueue_contact_opp_sync] location_id vazio para contact_id=%', v_contact_id;
    RETURN NEW;
  END IF;

  -- ON CONFLICT DO NOTHING = deduplicação automática
  -- Se o contato+location já está em status='pending', não insere novamente
  INSERT INTO contact_opp_sync_queue (ghl_contact_id, location_id)
  VALUES (TRIM(v_contact_id), TRIM(v_location_id))
  ON CONFLICT (ghl_contact_id, location_id) WHERE status = 'pending' DO NOTHING;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_ghl_api_job(p_url text, p_method text DEFAULT 'GET'::text, p_body jsonb DEFAULT NULL::jsonb, p_priority integer DEFAULT 5, p_caller text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text, p_context jsonb DEFAULT '{}'::jsonb, p_max_attempts integer DEFAULT 4)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rows INT := 0;
BEGIN
  INSERT INTO public.ghl_api_jobs (
    url,
    method,
    body,
    priority,
    caller,
    idempotency_key,
    context,
    max_attempts
  )
  VALUES (
    p_url,
    COALESCE(NULLIF(TRIM(p_method), ''), 'GET'),
    p_body,
    COALESCE(p_priority, 5),
    p_caller,
    p_idempotency_key,
    COALESCE(p_context, '{}'::jsonb),
    COALESCE(p_max_attempts, 4)
  )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.executar_backfill_direto(p_controle_id uuid, p_max_dias integer DEFAULT 10)
 RETURNS TABLE(data date, status text, registros integer, erro text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_dia RECORD;
    v_contador INTEGER := 0;
BEGIN
    -- Update controle status to running
    UPDATE meta_ads_backfill_controle
    SET status = 'running'
    WHERE id = p_controle_id;
    
    -- Process each pending day up to max_dias
    FOR v_dia IN 
        SELECT data
        FROM meta_ads_backfill_log
        WHERE controle_id = p_controle_id
        AND status = 'pending'
        ORDER BY data ASC
        LIMIT p_max_dias
    LOOP
        -- Mark as processing
        UPDATE meta_ads_backfill_log
        SET status = 'processing',
            processed_at = NOW()
        WHERE controle_id = p_controle_id
        AND data = v_dia.data;
        
        -- Call the sync function for this specific date
        -- This will trigger the Edge Function via pg_net
        INSERT INTO net.http_request_queue (
            method,
            url,
            headers,
            body,
            timeout_ms
        )
        SELECT 
            'POST',
            get_secret('supabase_url') || '/functions/v1/sync-meta-ads',
            jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || get_secret('service_role_key')
            ),
            jsonb_build_object(
                'lookback_days', (CURRENT_DATE - v_dia.data)::INTEGER,
                'specific_date', v_dia.data::TEXT
            ),
            60000;
        
        -- Return progress
        data := v_dia.data;
        status := 'triggered';
        registros := 0;
        erro := NULL;
        RETURN NEXT;
        
        v_contador := v_contador + 1;
    END LOOP;
    
    RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_and_parse_date(p_custom_data jsonb, p_field_variations text[])
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_value text;
BEGIN
    v_value := extract_custom_field(p_custom_data, p_field_variations);
    RETURN parse_safe_date(v_value);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_custom_field(custom_data jsonb, field_variations text[])
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    variation text;
    value text;
BEGIN
    -- Se customData é NULL, retornar NULL
    IF custom_data IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Tentar cada variação na ordem fornecida
    FOREACH variation IN ARRAY field_variations
    LOOP
        value := NULLIF(TRIM(custom_data->>variation), '');
        IF value IS NOT NULL THEN
            RETURN value;
        END IF;
    END LOOP;
    
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_ghl_tags(payload_tags jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
    SELECT CASE
        -- Array JSON: ["mql","[fn] aplicação"] → "mql,[fn] aplicação"
        WHEN jsonb_typeof(payload_tags) = 'array' THEN
            NULLIF(
                (SELECT string_agg(TRIM(elem::text, '"'), ',')
                 FROM jsonb_array_elements(payload_tags) AS elem),
                ''
            )
        -- String JSON ou outro formato → converte diretamente
        WHEN payload_tags IS NOT NULL THEN
            NULLIF(TRIM(payload_tags #>> '{}'), '')
        ELSE NULL
    END;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_opp_field(payload jsonb, field_name text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    RETURN extract_custom_field(
        payload->'customData',
        ARRAY[
            '{{ opportunity.' || field_name || ' }}',
            '{{opportunity.' || field_name || '}}'
        ]
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extract_safe_date_from_customdata(p_customdata jsonb, p_key_variations text[])
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_value text;
BEGIN
    -- Extrair valor usando a função existente
    v_value := public.extract_custom_field(p_customdata, p_key_variations);
    
    -- Usar parse_safe_date para conversão segura
    RETURN public.parse_safe_date(v_value);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extrair_dados_ghl(p_webhook_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contatos_inseridos integer, contatos_atualizados integer, oportunidades_inseridas integer, oportunidades_atualizadas integer, vendas_inseridas integer, comunicacoes_inseridas integer, reunioes_inseridas integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_contatos_inseridos INTEGER := 0;
    v_contatos_atualizados INTEGER := 0;
    v_oportunidades_inseridas INTEGER := 0;
    v_oportunidades_atualizadas INTEGER := 0;
    v_vendas_inseridas INTEGER := 0;
    v_comunicacoes_inseridas INTEGER := 0;
    v_reunioes_inseridas INTEGER := 0;
BEGIN
    -- ============================================
    -- PASSO 1: Extrair Contatos (INSERT)
    -- ============================================

    WITH inseridos AS (
        INSERT INTO contatos (
            ghl_id, nome, email, telefone, primeiro_nome, ultimo_nome,
            ip, url, fbclid, utm_source, utm_medium, utm_campaign,
            utm_term, utm_content, tt_term, tt_medium, tt_source, tt_content,
            country, date_created, contact_type, contact_source,
            pipeline_id_contato, pipeline_name, owner_id, owner_name, owner_email
        )
        SELECT DISTINCT
            TRIM(w.payload->>'contact_id'),
            TRIM(w.payload->>'full_name'),
            LOWER(TRIM(w.payload->>'email')),
            TRIM(w.payload->>'phone'),
            TRIM(w.payload->>'first_name'),
            TRIM(w.payload->>'last_name'),
            COALESCE(NULLIF(TRIM(w.payload->'lastAttributionSource'->>'ip'), ''), TRIM(w.payload->'attributionSource'->>'ip')),
            COALESCE(NULLIF(TRIM(w.payload->'lastAttributionSource'->>'url'), ''), TRIM(w.payload->'attributionSource'->>'url')),
            COALESCE(NULLIF(TRIM(w.payload->'lastAttributionSource'->>'fbclid'), ''), TRIM(w.payload->'attributionSource'->>'fbclid')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_source'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmSource')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_medium'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmMedium')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_campaign'), ''), TRIM(w.payload->'lastAttributionSource'->>'campaign')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_term'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmTerm')),
            COALESCE(NULLIF(TRIM(w.payload->>'utm_content'), ''), TRIM(w.payload->'lastAttributionSource'->>'utmContent')),
            TRIM(w.payload->>'tt_term'),
            TRIM(w.payload->>'tt_medium'),
            TRIM(w.payload->>'tt_source'),
            TRIM(w.payload->>'tt_content'),
            TRIM(w.payload->>'country'),
            (w.payload->>'date_created')::TIMESTAMPTZ,
            TRIM(w.payload->>'contact_type'),
            TRIM(w.payload->>'contact_source'),
            TRIM(w.payload->>'pipeline_id'),
            TRIM(w.payload->>'pipeline_name'),
            TRIM(w.payload->>'Owner ID'),
            TRIM(w.payload->>'owner'),
            TRIM(w.payload->>'E-mail Owner')
        FROM webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (
              SELECT 1 FROM contatos c
              WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
          )
        ON CONFLICT (ghl_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_inseridos FROM inseridos;

    -- UPDATE contatos — webhook é fonte de verdade para campos de atribuição
    WITH ultimos_webhooks AS (
        SELECT DISTINCT ON (TRIM(payload->>'contact_id'))
            id,
            payload,
            TRIM(payload->>'contact_id') as ghl_id
        FROM webhooks_ghl
        WHERE payload->>'contact_id' IS NOT NULL
          AND TRIM(payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR id = p_webhook_id)
        ORDER BY TRIM(payload->>'contact_id'), created_at DESC
    ),
    atualizados AS (
        UPDATE contatos c
        SET
            nome     = NULLIF(TRIM(w.payload->>'full_name'), ''),
            email    = NULLIF(LOWER(TRIM(w.payload->>'email')), ''),
            telefone = NULLIF(TRIM(w.payload->>'phone'), ''),
            utm_source   = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_source'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmSource'), '')
            ),
            utm_medium   = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_medium'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmMedium'), '')
            ),
            utm_campaign = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_campaign'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'campaign'), '')
            ),
            utm_term     = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_term'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmTerm'), '')
            ),
            utm_content  = COALESCE(
                NULLIF(TRIM(w.payload->>'utm_content'), ''),
                NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmContent'), '')
            ),
            owner_name  = NULLIF(TRIM(w.payload->>'owner'), ''),
            owner_email = NULLIF(TRIM(w.payload->>'E-mail Owner'), ''),
            updated_at  = NOW()
        FROM ultimos_webhooks w
        WHERE c.ghl_id = w.ghl_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM atualizados;

    -- ============================================
    -- PASSO 2: Extrair Oportunidades
    -- ============================================

    WITH novas_oportunidades AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            TRIM(w.payload->>'id') as opp_id,
            c.id as contato_id,
            TRIM(w.payload->>'full_name') as nome_contato,
            LOWER(TRIM(w.payload->>'email')) as email_contato,
            TRIM(w.payload->>'opportunity_name') as titulo,
            COALESCE((w.payload->>'lead_value')::DECIMAL, 0) as valor,
            COALESCE(TRIM(w.payload->>'status'), 'open') as status,
            TRIM(w.payload->>'pipeline_id') as pipeline_id,
            TRIM(w.payload->>'pipleline_stage') as pipeline_stage_id,
            TRIM(w.payload->>'pipeline_name') as pipeline_name,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.source }}', '{{opportunity.source}}'
            ]) as opportunity_source,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{opportunity.assignedToUsersName}}', '{{ opportunity.assignedToUsersName }}'
            ]) as vendedor_closer,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}'
            ]) as lost_reason,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}'
            ]) as resumo_ia,
            extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}'
            ]) as percepcao_closer,
            parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}'
            ])) as data_ultima_atividade,
            NULL::TIMESTAMPTZ as data_lead_recebido,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}']))) as data_tentativa_1,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}']))) as data_tentativa_2,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}']))) as data_tentativa_3,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}']))) as data_tentativa_4,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}']))) as data_tentativa_5,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}']))) as data_tentativa_6,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}']))) as data_tentativa_7,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}']))) as data_tentativa_8,
            COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}', '{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}', '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))
            ) as data_no_show,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}']))) as data_conectado,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}']))) as data_perdido,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}']))) as data_qualificado,
            -- data_agendamento_reuniao: NÃO extraída do webhook — fonte de verdade
            -- é a API GHL via sync-appointment-dates. Ver migration 20260706000000.
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}']))) as data_pendencias_preenchimento,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))) as data_no_show_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}']))) as data_perdido_vendas,
            -- data_agendamento_vendas: idem — NÃO extraída do webhook.
            -- data_realizacao_vendas: prioridade 1=data_da_reunio_realizada, 2=sqlreunio_realizada, 3=d_sqlreunio_realizada
            COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))
            ) as data_realizacao_vendas,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}']))) as data_negociacao,
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}']))) as data_fechado,
            -- data_reuniao_agendada: NÃO extraída do webhook (desde 20260326110000)
            COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}', '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}']))) as data_reuniao_realizada,
            -- data_auto_agendamento — lead agendou sozinho com SDR (campo mqlauto_agendamento)
            parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY[
                '{{ opportunity.mqlauto_agendamento }}', '{{opportunity.mqlauto_agendamento}}'
            ])) as data_auto_agendamento,
            (w.payload->>'date_created')::TIMESTAMPTZ as data_criacao_contato,
            extract_ghl_tags(w.payload->'tags') as tags_contato
        FROM webhooks_ghl w
        INNER JOIN contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
          AND NOT EXISTS (
              SELECT 1 FROM oportunidades o
              WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          )
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    ),
    opp_inseridas AS (
        INSERT INTO oportunidades (
            ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo,
            valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
            data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
            data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
            data_tentativa_8, data_no_show, data_conectado, data_perdido,
            data_qualificado, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas,
            data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_realizada,
            data_auto_agendamento,
            data_criacao_contato
            -- data_agendamento_reuniao, data_agendamento_vendas, data_reuniao_agendada
            -- omitidos: preenchidos pelo sync-appointment-dates
        )
        SELECT opp_id, contato_id, nome_contato, email_contato, titulo,
            valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
            data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
            data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
            data_tentativa_8, data_no_show, data_conectado, data_perdido,
            data_qualificado, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas,
            data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_realizada,
            data_auto_agendamento,
            data_criacao_contato
        FROM novas_oportunidades
        ON CONFLICT (ghl_opportunity_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_inseridas FROM opp_inseridas;

    -- UPDATE oportunidades — webhook é fonte de verdade para a maioria dos campos
    -- EXCEÇÕES que preservam valor anterior com COALESCE:
    --   pipeline_id / pipeline_name: webhooks de atualização de data não incluem esses
    --     campos → NULLIF aqui zeraria o pipeline de leads que movimentam de stage
    --   data_lead_recebido: gerenciada exclusivamente por sync-opp-dates (edge function)
    --   sdr_name: gerenciada exclusivamente por sync-opp-sdr (edge function + followers API)
    --   data_reuniao_agendada, data_agendamento_reuniao, data_agendamento_vendas:
    --     gerenciadas exclusivamente por sync-appointment-dates (edge function) —
    --     ver migration 20260706000000. Sem essa exclusão, um webhook sem o
    --     customData esperado apagava/desatualizava esses campos silenciosamente.
    WITH ultimos_webhooks_opp AS (
        SELECT DISTINCT ON (TRIM(payload->>'id'))
            id,
            payload,
            TRIM(payload->>'id') as ghl_opportunity_id
        FROM webhooks_ghl
        WHERE payload->>'id' IS NOT NULL
          AND TRIM(payload->>'id') != ''
          AND (p_webhook_id IS NULL OR id = p_webhook_id)
        ORDER BY TRIM(payload->>'id'), created_at DESC
    ),
    atualizados AS (
        UPDATE oportunidades o
        SET
            nome_contato       = NULLIF(TRIM(w.payload->>'full_name'), ''),
            email_contato      = NULLIF(LOWER(TRIM(w.payload->>'email')), ''),
            titulo             = NULLIF(TRIM(w.payload->>'opportunity_name'), ''),
            valor              = (w.payload->>'lead_value')::DECIMAL,
            status             = NULLIF(TRIM(w.payload->>'status'), ''),
            -- COALESCE aqui: webhook de "data alterada" não traz pipeline_id
            -- Se vier NULL/vazio, mantém o valor já gravado
            pipeline_id        = COALESCE(NULLIF(TRIM(w.payload->>'pipeline_id'), ''), o.pipeline_id),
            pipeline_stage_id  = NULLIF(TRIM(w.payload->>'pipleline_stage'), ''),
            pipeline_name      = COALESCE(NULLIF(TRIM(w.payload->>'pipeline_name'), ''), o.pipeline_name),
            opportunity_source = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.source }}', '{{opportunity.source}}']),
            vendedor_closer    = extract_custom_field(w.payload->'customData', ARRAY['{{opportunity.assignedToUsersName}}', '{{ opportunity.assignedToUsersName }}']),
            lost_reason        = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.lost_reason }}', '{{opportunity.lost_reason}}']),
            resumo_ia          = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.resumo_ia }}', '{{opportunity.resumo_ia}}']),
            percepcao_closer   = extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.percepo_do_closer }}', '{{opportunity.percepo_do_closer}}']),
            data_ultima_atividade = parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.ltima_atividade }}', '{{opportunity.ltima_atividade}}'])),
            data_tentativa_1         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato1 }}', '{{opportunity.mqlcontato1}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}']))),
            data_tentativa_2         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato2 }}', '{{opportunity.mqlcontato2}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}']))),
            data_tentativa_3         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato3 }}', '{{opportunity.mqlcontato3}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}']))),
            data_tentativa_4         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato4 }}', '{{opportunity.mqlcontato4}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}']))),
            data_tentativa_5         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato5 }}', '{{opportunity.mqlcontato5}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}']))),
            data_tentativa_6         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato6 }}', '{{opportunity.mqlcontato6}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}']))),
            data_tentativa_7         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato7 }}', '{{opportunity.mqlcontato7}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}']))),
            data_tentativa_8         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlcontato8 }}', '{{opportunity.mqlcontato8}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}']))),
            data_no_show             = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlno_show }}', '{{opportunity.mqlno_show}}', '{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}', '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))),
            data_conectado           = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlconectado }}', '{{opportunity.mqlconectado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}']))),
            data_perdido             = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}']))),
            data_qualificado         = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlqualificado }}', '{{opportunity.mqlqualificado}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}']))),
            -- data_agendamento_reuniao: NÃO atualizada pelo webhook — exclusiva do sync-appointment-dates
            data_pendencias_preenchimento = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}']))),
            data_no_show_vendas      = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlno_show }}', '{{opportunity.sqlno_show}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}']))),
            data_perdido_vendas      = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}']))),
            -- data_agendamento_vendas: NÃO atualizada pelo webhook — exclusiva do sync-appointment-dates
            -- data_realizacao_vendas: prioridade 1=data_da_reunio_realizada, 2=sqlreunio_realizada, 3=d_sqlreunio_realizada
            data_realizacao_vendas   = COALESCE(
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'])),
                parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlreunio_realizada }}', '{{opportunity.d_sqlreunio_realizada}}']))
            ),
            data_negociacao          = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}']))),
            data_fechado             = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}']))),
            -- data_reuniao_agendada: NÃO atualizada pelo webhook — exclusiva do sync-appointment-dates
            data_reuniao_realizada   = COALESCE(parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}', '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'])), parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.d_reuniao_realizada }}', '{{opportunity.d_reuniao_realizada}}']))),
            -- data_auto_agendamento — lead agendou sozinho com SDR
            data_auto_agendamento    = parse_date_flexible(extract_custom_field(w.payload->'customData', ARRAY['{{ opportunity.mqlauto_agendamento }}', '{{opportunity.mqlauto_agendamento}}'])),
            updated_at = NOW()
        FROM ultimos_webhooks_opp w
        WHERE o.ghl_opportunity_id = w.ghl_opportunity_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados;

    -- ============================================
    -- PASSO 2.6: Enfileirar job de followers para opp(s) deste webhook
    -- ============================================
    -- Só executa para webhooks específicos (p_webhook_id IS NOT NULL).
    -- Quando chamada sem webhook_id (backfill bulk), o cron sync-opp-sdr
    -- cuida do reprocessamento de opps com sdr_name IS NULL.
    --
    -- Prioridade 1 = urgente: o follower mudou em tempo real.
    -- Idempotência: 'sync-opp-sdr:<opp.id>' — se já existe job pending/processing,
    -- a inserção é ignorada silenciosamente (ON CONFLICT DO NOTHING).
    IF p_webhook_id IS NOT NULL THEN
        PERFORM enqueue_ghl_api_job(
            p_url             => 'https://services.leadconnectorhq.com/opportunities/' || o.ghl_opportunity_id || '/followers',
            p_method          => 'GET',
            p_body            => NULL,
            p_priority        => 1,
            p_caller          => 'sync-opp-sdr',
            p_idempotency_key => 'sync-opp-sdr:' || o.id::text,
            p_context         => jsonb_build_object(
                'opportunity_id',     o.id::text,
                'ghl_opportunity_id', o.ghl_opportunity_id,
                'contato_id',         o.contato_id::text
            ),
            p_max_attempts    => 4
        )
        FROM oportunidades o
        INNER JOIN webhooks_ghl w ON w.id = p_webhook_id
        WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          AND TRIM(w.payload->>'id') IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND o.ghl_opportunity_id IS NOT NULL;
    END IF;

    RETURN QUERY SELECT
        v_contatos_inseridos,
        v_contatos_atualizados,
        v_oportunidades_inseridas,
        v_oportunidades_atualizadas,
        v_vendas_inseridas,
        v_comunicacoes_inseridas,
        v_reunioes_inseridas;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extrair_dados_ghl_v2(p_webhook_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contatos_inseridos integer, contatos_atualizados integer, oportunidades_inseridas integer, oportunidades_atualizadas integer, vendas_inseridas integer, comunicacoes_inseridas integer, reunioes_inseridas integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_contatos_inseridos INTEGER := 0;
    v_contatos_atualizados INTEGER := 0;
    v_oportunidades_inseridas INTEGER := 0;
    v_oportunidades_atualizadas INTEGER := 0;
    v_vendas_inseridas INTEGER := 0;
    v_comunicacoes_inseridas INTEGER := 0;
    v_reunioes_inseridas INTEGER := 0;
BEGIN
    -- ============================================
    -- PASSO 1: Extrair Contatos (INSERT)
    -- ============================================
    WITH webhooks AS (
        SELECT
            w.id,
            w.payload,
            w.created_at,
            public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')) AS workspace_id,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
                w.payload
            ) AS mapped
        FROM public.webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
    ),
    inseridos AS (
        INSERT INTO public.contatos (
            workspace_id, ghl_id, nome, email, telefone, primeiro_nome, ultimo_nome,
            ip, url, fbclid, utm_source, utm_medium, utm_campaign,
            utm_term, utm_content, tt_term, tt_medium, tt_source, tt_content,
            country, date_created, contact_type, contact_source,
            pipeline_id_contato, pipeline_name, owner_id, owner_name, owner_email
        )
        SELECT DISTINCT ON (TRIM(w.payload->>'contact_id'))
            w.workspace_id,
            TRIM(w.payload->>'contact_id'),
            w.mapped->>'full_name',
            LOWER(w.mapped->>'email'),
            w.mapped->>'phone',
            w.mapped->>'first_name',
            w.mapped->>'last_name',
            w.mapped->>'ip',
            w.mapped->>'url',
            w.mapped->>'fbclid',
            w.mapped->>'utm_source',
            w.mapped->>'utm_medium',
            w.mapped->>'utm_campaign',
            w.mapped->>'utm_term',
            w.mapped->>'utm_content',
            w.mapped->>'tt_term',
            w.mapped->>'tt_medium',
            w.mapped->>'tt_source',
            w.mapped->>'tt_content',
            w.mapped->>'country',
            (w.payload->>'date_created')::TIMESTAMPTZ,
            w.mapped->>'contact_type',
            w.mapped->>'contact_source',
            w.mapped->>'pipeline_id_contato',
            w.mapped->>'pipeline_name_contato',
            w.mapped->>'owner_id',
            w.mapped->>'owner_name',
            w.mapped->>'owner_email'
        FROM webhooks w
        WHERE NOT EXISTS (
            SELECT 1 FROM public.contatos c
            WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
        )
        ORDER BY TRIM(w.payload->>'contact_id'), w.created_at DESC
        ON CONFLICT (ghl_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_inseridos FROM inseridos;

    -- ============================================
    -- PASSO 1b: Atualizar Contatos (webhook = fonte de verdade para atribuicao)
    -- ============================================
    WITH ultimos_webhooks AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'contact_id'))
            w.id,
            w.payload,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
                w.payload
            ) AS mapped,
            TRIM(w.payload->>'contact_id') AS ghl_id
        FROM public.webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY TRIM(w.payload->>'contact_id'), w.created_at DESC
    ),
    atualizados AS (
        UPDATE public.contatos c
        SET
            nome     = w.mapped->>'full_name',
            email    = LOWER(w.mapped->>'email'),
            telefone = w.mapped->>'phone',
            utm_source   = w.mapped->>'utm_source',
            utm_medium   = w.mapped->>'utm_medium',
            utm_campaign = w.mapped->>'utm_campaign',
            utm_term     = w.mapped->>'utm_term',
            utm_content  = w.mapped->>'utm_content',
            owner_name  = w.mapped->>'owner_name',
            owner_email = w.mapped->>'owner_email',
            updated_at  = NOW()
        FROM ultimos_webhooks w
        WHERE c.ghl_id = w.ghl_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_contatos_atualizados FROM atualizados;

    -- ============================================
    -- PASSO 2: Extrair Oportunidades (INSERT)
    -- ============================================
    WITH webhooks AS (
        SELECT
            w.id,
            w.payload,
            w.created_at,
            public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')) AS workspace_id,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
                w.payload
            ) AS mapped
        FROM public.webhooks_ghl w
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
    ),
    novas_oportunidades AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            TRIM(w.payload->>'id') AS opp_id,
            c.id AS contato_id,
            w.mapped->>'full_name' AS nome_contato,
            LOWER(w.mapped->>'email') AS email_contato,
            w.mapped->>'opportunity_name' AS titulo,
            COALESCE((w.mapped->>'lead_value')::DECIMAL, 0) AS valor,
            COALESCE(w.mapped->>'status', 'open') AS status,
            w.mapped->>'pipeline_id_opp' AS pipeline_id,
            w.mapped->>'pipeline_stage_id' AS pipeline_stage_id,
            w.mapped->>'pipeline_name_opp' AS pipeline_name,
            w.mapped->>'opportunity_source' AS opportunity_source,
            w.mapped->>'vendedor_closer' AS vendedor_closer,
            w.mapped->>'lost_reason' AS lost_reason,
            w.mapped->>'resumo_ia' AS resumo_ia,
            w.mapped->>'percepcao_closer' AS percepcao_closer,
            parse_date_flexible(w.mapped->>'data_ultima_atividade') AS data_ultima_atividade,
            NULL::TIMESTAMPTZ AS data_lead_recebido,
            parse_date_flexible(w.mapped->>'data_tentativa_1') AS data_tentativa_1,
            parse_date_flexible(w.mapped->>'data_tentativa_2') AS data_tentativa_2,
            parse_date_flexible(w.mapped->>'data_tentativa_3') AS data_tentativa_3,
            parse_date_flexible(w.mapped->>'data_tentativa_4') AS data_tentativa_4,
            parse_date_flexible(w.mapped->>'data_tentativa_5') AS data_tentativa_5,
            parse_date_flexible(w.mapped->>'data_tentativa_6') AS data_tentativa_6,
            parse_date_flexible(w.mapped->>'data_tentativa_7') AS data_tentativa_7,
            parse_date_flexible(w.mapped->>'data_tentativa_8') AS data_tentativa_8,
            parse_date_flexible(w.mapped->>'data_no_show') AS data_no_show,
            parse_date_flexible(w.mapped->>'data_conectado') AS data_conectado,
            parse_date_flexible(w.mapped->>'data_perdido') AS data_perdido,
            parse_date_flexible(w.mapped->>'data_qualificado') AS data_qualificado,
            parse_date_flexible(w.mapped->>'data_pendencias_preenchimento') AS data_pendencias_preenchimento,
            parse_date_flexible(w.mapped->>'data_no_show_vendas') AS data_no_show_vendas,
            parse_date_flexible(w.mapped->>'data_perdido_vendas') AS data_perdido_vendas,
            parse_date_flexible(w.mapped->>'data_realizacao_vendas') AS data_realizacao_vendas,
            parse_date_flexible(w.mapped->>'data_negociacao') AS data_negociacao,
            parse_date_flexible(w.mapped->>'data_fechado') AS data_fechado,
            parse_date_flexible(w.mapped->>'data_reuniao_realizada') AS data_reuniao_realizada,
            parse_date_flexible(w.mapped->>'data_auto_agendamento') AS data_auto_agendamento,
            (w.payload->>'date_created')::TIMESTAMPTZ AS data_criacao_contato
        FROM webhooks w
        INNER JOIN public.contatos c ON c.ghl_id = TRIM(w.payload->>'contact_id')
        WHERE NOT EXISTS (
            SELECT 1 FROM public.oportunidades o
            WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
        )
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    ),
    opp_inseridas AS (
        INSERT INTO public.oportunidades (
            ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo,
            valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
            data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
            data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
            data_tentativa_8, data_no_show, data_conectado, data_perdido,
            data_qualificado, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas,
            data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_realizada,
            data_auto_agendamento,
            data_criacao_contato
        )
        SELECT opp_id, contato_id, nome_contato, email_contato, titulo,
            valor, status, pipeline_id, pipeline_stage_id, pipeline_name,
            opportunity_source, vendedor_closer, lost_reason, resumo_ia, percepcao_closer,
            data_ultima_atividade,
            data_lead_recebido, data_tentativa_1, data_tentativa_2, data_tentativa_3,
            data_tentativa_4, data_tentativa_5, data_tentativa_6, data_tentativa_7,
            data_tentativa_8, data_no_show, data_conectado, data_perdido,
            data_qualificado, data_pendencias_preenchimento,
            data_no_show_vendas, data_perdido_vendas,
            data_realizacao_vendas, data_negociacao, data_fechado,
            data_reuniao_realizada,
            data_auto_agendamento,
            data_criacao_contato
        FROM novas_oportunidades
        ON CONFLICT (ghl_opportunity_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_inseridas FROM opp_inseridas;

    -- ============================================
    -- PASSO 2b: Atualizar Oportunidades
    -- ============================================
    -- Excecoes que preservam valor anterior com COALESCE:
    --   pipeline_id / pipeline_name: webhooks de atualizacao de data nao incluem
    --   data_lead_recebido: gerenciada por sync-opp-dates
    --   sdr_name: gerenciada por sync-opp-sdr
    --   data_reuniao_agendada, data_agendamento_reuniao, data_agendamento_vendas:
    --     gerenciadas por sync-appointment-dates (nao extraidas do webhook)
    WITH ultimos_webhooks_opp AS (
        SELECT DISTINCT ON (TRIM(w.payload->>'id'))
            w.id,
            w.payload,
            public.apply_ghl_field_mappings(
                public.get_workspace_id_by_ghl_location_id(TRIM(w.payload->>'locationId')),
                w.payload
            ) AS mapped,
            TRIM(w.payload->>'id') AS ghl_opportunity_id
        FROM public.webhooks_ghl w
        WHERE w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND (p_webhook_id IS NULL OR w.id = p_webhook_id)
        ORDER BY TRIM(w.payload->>'id'), w.created_at DESC
    ),
    atualizados AS (
        UPDATE public.oportunidades o
        SET
            nome_contato       = w.mapped->>'full_name',
            email_contato      = LOWER(w.mapped->>'email'),
            titulo             = w.mapped->>'opportunity_name',
            valor              = (w.mapped->>'lead_value')::DECIMAL,
            status             = w.mapped->>'status',
            pipeline_id        = COALESCE(w.mapped->>'pipeline_id_opp', o.pipeline_id),
            pipeline_stage_id  = w.mapped->>'pipeline_stage_id',
            pipeline_name      = COALESCE(w.mapped->>'pipeline_name_opp', o.pipeline_name),
            opportunity_source = w.mapped->>'opportunity_source',
            vendedor_closer    = w.mapped->>'vendedor_closer',
            lost_reason        = w.mapped->>'lost_reason',
            resumo_ia          = w.mapped->>'resumo_ia',
            percepcao_closer   = w.mapped->>'percepcao_closer',
            data_ultima_atividade = parse_date_flexible(w.mapped->>'data_ultima_atividade'),
            data_tentativa_1         = parse_date_flexible(w.mapped->>'data_tentativa_1'),
            data_tentativa_2         = parse_date_flexible(w.mapped->>'data_tentativa_2'),
            data_tentativa_3         = parse_date_flexible(w.mapped->>'data_tentativa_3'),
            data_tentativa_4         = parse_date_flexible(w.mapped->>'data_tentativa_4'),
            data_tentativa_5         = parse_date_flexible(w.mapped->>'data_tentativa_5'),
            data_tentativa_6         = parse_date_flexible(w.mapped->>'data_tentativa_6'),
            data_tentativa_7         = parse_date_flexible(w.mapped->>'data_tentativa_7'),
            data_tentativa_8         = parse_date_flexible(w.mapped->>'data_tentativa_8'),
            data_no_show             = parse_date_flexible(w.mapped->>'data_no_show'),
            data_conectado           = parse_date_flexible(w.mapped->>'data_conectado'),
            data_perdido             = parse_date_flexible(w.mapped->>'data_perdido'),
            data_qualificado         = parse_date_flexible(w.mapped->>'data_qualificado'),
            data_pendencias_preenchimento = parse_date_flexible(w.mapped->>'data_pendencias_preenchimento'),
            data_no_show_vendas      = parse_date_flexible(w.mapped->>'data_no_show_vendas'),
            data_perdido_vendas      = parse_date_flexible(w.mapped->>'data_perdido_vendas'),
            data_realizacao_vendas   = parse_date_flexible(w.mapped->>'data_realizacao_vendas'),
            data_negociacao          = parse_date_flexible(w.mapped->>'data_negociacao'),
            data_fechado             = parse_date_flexible(w.mapped->>'data_fechado'),
            data_reuniao_realizada   = parse_date_flexible(w.mapped->>'data_reuniao_realizada'),
            data_auto_agendamento    = parse_date_flexible(w.mapped->>'data_auto_agendamento'),
            updated_at = NOW()
        FROM ultimos_webhooks_opp w
        WHERE o.ghl_opportunity_id = w.ghl_opportunity_id
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_oportunidades_atualizadas FROM atualizados;

    -- ============================================
    -- PASSO 2.6: Enfileirar job de followers
    -- ============================================
    IF p_webhook_id IS NOT NULL THEN
        PERFORM public.enqueue_ghl_api_job(
            p_url             => 'https://services.leadconnectorhq.com/opportunities/' || o.ghl_opportunity_id || '/followers',
            p_method          => 'GET',
            p_body            => NULL,
            p_priority        => 1,
            p_caller          => 'sync-opp-sdr',
            p_idempotency_key => 'sync-opp-sdr:' || o.id::text,
            p_context         => jsonb_build_object(
                'opportunity_id',     o.id::text,
                'ghl_opportunity_id', o.ghl_opportunity_id,
                'contato_id',         o.contato_id::text
            ),
            p_max_attempts    => 4
        )
        FROM public.oportunidades o
        INNER JOIN public.webhooks_ghl w ON w.id = p_webhook_id
        WHERE o.ghl_opportunity_id = TRIM(w.payload->>'id')
          AND TRIM(w.payload->>'id') IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
          AND o.ghl_opportunity_id IS NOT NULL;
    END IF;

    RETURN QUERY SELECT
        v_contatos_inseridos,
        v_contatos_atualizados,
        v_oportunidades_inseridas,
        v_oportunidades_atualizadas,
        v_vendas_inseridas,
        v_comunicacoes_inseridas,
        v_reunioes_inseridas;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.extrair_vendas_fechamento_do_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_opp_id TEXT;
    v_contato_id UUID;
    v_opp_pk_id UUID;
    v_valor_entrada DECIMAL;
    v_numero_parcelas INTEGER;
    v_valor_parcela DECIMAL;
    v_data_pagamento TIMESTAMPTZ;
    v_nome_contratante TEXT;
    v_cpf_cnpj TEXT;
    v_produto_vendido TEXT;
    v_forma_pagamento TEXT;
    v_endereco TEXT;
    v_numero TEXT;
    v_complemento TEXT;
    v_bairro TEXT;
    v_municipio TEXT;
    v_estado TEXT;
    v_cep TEXT;
    v_observacoes TEXT;
    v_op_vencimentos TEXT;
    v_link_contrato TEXT;
    v_data_assinatura DATE;
    v_link_gravacao_call TEXT;
BEGIN
    v_opp_id := TRIM(NEW.payload->>'id');
    IF v_opp_id IS NULL OR v_opp_id = '' THEN
        RETURN NEW;
    END IF;

    -- Campos financeiros
    v_valor_entrada := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.valor_a_ser_pago_de_entrada}}'), '')::DECIMAL,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.valor_a_ser_pago_de_entrada }}'), '')::DECIMAL
    );
    v_numero_parcelas := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.numero_parcelas}}'), '')::INTEGER,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.numero_parcelas }}'), '')::INTEGER
    );
    v_valor_parcela := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.valor_parcela}}'), '')::DECIMAL,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.valor_parcela }}'), '')::DECIMAL
    );
    v_data_pagamento := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_pagamento_entrada }}'), '')::TIMESTAMPTZ,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_pagamento_entrada}}'), '')::TIMESTAMPTZ
    );

    -- Campos contratuais
    v_nome_contratante := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.nome_contratante }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.nome_contratante}}'), '')
    );
    v_cpf_cnpj := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cpf_ou_cnpj_do_contratante }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.cpf_ou_cnpj_do_contratante}}'), '')
    );
    v_produto_vendido := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.produto_que_foi_vendido }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.produto_que_foi_vendido}}'), '')
    );
    v_forma_pagamento := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.forma_de_pagamento }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.forma_de_pagamento}}'), '')
    );
    v_endereco := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.logradouro_rua_avenida }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.logradouro_rua_avenida}}'), '')
    );
    v_numero := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.numero_endereco }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.numero_endereco}}'), '')
    );
    v_complemento := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.complemento_do_endereo }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.complemento_do_endereo}}'), '')
    );
    v_bairro := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.bairro }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.bairro}}'), '')
    );
    v_municipio := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.municipio }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.municipio}}'), '')
    );
    v_estado := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.estado_uf }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.estado_uf}}'), '')
    );
    v_cep := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.cep }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.cep}}'), '')
    );
    v_observacoes := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.observacoes_venda }}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.observacoes_venda}}'), '')
    );
    v_op_vencimentos := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_vencimentos_e_parcelas}}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.op_vencimentos_e_parcelas }}'), '')
    );
    v_link_contrato := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.op_link_do_contrato_assinado }}'), '')
    );
    v_data_assinatura := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE,
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.data_da_assinatura_do_contrato }}'), '')::DATE
    );
    v_link_gravacao_call := COALESCE(
        NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.link_da_gravao_da_call_de_vendas}}'), ''),
        NULLIF(TRIM(NEW.payload->'customData'->>'{{ opportunity.link_da_gravao_da_call_de_vendas }}'), '')
    );

    -- Ignorar webhooks sem qualquer informação de vendas/contrato relevante
    IF v_valor_entrada IS NULL
       AND v_numero_parcelas IS NULL
       AND v_valor_parcela IS NULL
       AND v_data_pagamento IS NULL
       AND v_nome_contratante IS NULL
       AND v_cpf_cnpj IS NULL
       AND v_produto_vendido IS NULL
       AND v_forma_pagamento IS NULL
       AND v_endereco IS NULL
       AND v_numero IS NULL
       AND v_complemento IS NULL
       AND v_bairro IS NULL
       AND v_municipio IS NULL
       AND v_estado IS NULL
       AND v_cep IS NULL
       AND v_observacoes IS NULL
       AND v_op_vencimentos IS NULL
       AND v_link_contrato IS NULL
       AND v_data_assinatura IS NULL
       AND v_link_gravacao_call IS NULL
    THEN
        RETURN NEW;
    END IF;

    SELECT id INTO v_contato_id
    FROM contatos
    WHERE ghl_id = TRIM(NEW.payload->>'contact_id')
    LIMIT 1;

    SELECT id INTO v_opp_pk_id
    FROM oportunidades
    WHERE ghl_opportunity_id = v_opp_id
    LIMIT 1;

    IF v_opp_pk_id IS NULL OR v_contato_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO vendas_fechamento (
        oportunidade_id,
        contato_id,
        nome_contratante,
        cpf_cnpj_contratante,
        logradouro_rua_avenida,
        numero_endereco,
        complemento_endereco,
        bairro,
        municipio,
        estado_uf,
        cep,
        produto_vendido,
        observacoes_venda,
        forma_pagamento,
        valor_entrada,
        numero_parcelas,
        valor_parcela,
        data_pagamento_entrada,
        op_vencimentos_parcelas,
        op_link_do_contrato_assinado,
        data_da_assinatura_do_contrato,
        link_gravacao_call_vendas
    ) VALUES (
        v_opp_pk_id,
        v_contato_id,
        v_nome_contratante,
        v_cpf_cnpj,
        v_endereco,
        v_numero,
        v_complemento,
        v_bairro,
        v_municipio,
        v_estado,
        v_cep,
        v_produto_vendido,
        v_observacoes,
        v_forma_pagamento,
        v_valor_entrada,
        v_numero_parcelas,
        v_valor_parcela,
        v_data_pagamento,
        v_op_vencimentos,
        v_link_contrato,
        v_data_assinatura,
        v_link_gravacao_call
    )
    ON CONFLICT (oportunidade_id) DO UPDATE SET
        contato_id                     = COALESCE(EXCLUDED.contato_id,                     vendas_fechamento.contato_id),
        nome_contratante               = COALESCE(EXCLUDED.nome_contratante,               vendas_fechamento.nome_contratante),
        cpf_cnpj_contratante           = COALESCE(EXCLUDED.cpf_cnpj_contratante,           vendas_fechamento.cpf_cnpj_contratante),
        logradouro_rua_avenida         = COALESCE(EXCLUDED.logradouro_rua_avenida,         vendas_fechamento.logradouro_rua_avenida),
        numero_endereco                = COALESCE(EXCLUDED.numero_endereco,                vendas_fechamento.numero_endereco),
        complemento_endereco           = COALESCE(EXCLUDED.complemento_endereco,           vendas_fechamento.complemento_endereco),
        bairro                         = COALESCE(EXCLUDED.bairro,                         vendas_fechamento.bairro),
        municipio                      = COALESCE(EXCLUDED.municipio,                      vendas_fechamento.municipio),
        estado_uf                      = COALESCE(EXCLUDED.estado_uf,                      vendas_fechamento.estado_uf),
        cep                            = COALESCE(EXCLUDED.cep,                            vendas_fechamento.cep),
        produto_vendido                = COALESCE(EXCLUDED.produto_vendido,                vendas_fechamento.produto_vendido),
        observacoes_venda              = COALESCE(EXCLUDED.observacoes_venda,              vendas_fechamento.observacoes_venda),
        forma_pagamento                = COALESCE(EXCLUDED.forma_pagamento,                vendas_fechamento.forma_pagamento),
        valor_entrada                  = COALESCE(EXCLUDED.valor_entrada,                  vendas_fechamento.valor_entrada),
        numero_parcelas                = COALESCE(EXCLUDED.numero_parcelas,                vendas_fechamento.numero_parcelas),
        valor_parcela                  = COALESCE(EXCLUDED.valor_parcela,                  vendas_fechamento.valor_parcela),
        data_pagamento_entrada         = COALESCE(EXCLUDED.data_pagamento_entrada,         vendas_fechamento.data_pagamento_entrada),
        op_vencimentos_parcelas        = COALESCE(EXCLUDED.op_vencimentos_parcelas,        vendas_fechamento.op_vencimentos_parcelas),
        op_link_do_contrato_assinado   = COALESCE(EXCLUDED.op_link_do_contrato_assinado,   vendas_fechamento.op_link_do_contrato_assinado),
        data_da_assinatura_do_contrato = COALESCE(EXCLUDED.data_da_assinatura_do_contrato, vendas_fechamento.data_da_assinatura_do_contrato),
        link_gravacao_call_vendas      = COALESCE(EXCLUDED.link_gravacao_call_vendas,      vendas_fechamento.link_gravacao_call_vendas),
        updated_at                     = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Erro ao extrair vendas_fechamento: %', SQLERRM;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_comunicacao_contato_id_by_email()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Se contato_id ja vem preenchido, respeitar
  IF NEW.contato_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Se contato_email vem preenchido, tentar lookup por email
  IF NEW.contato_email IS NOT NULL THEN
    SELECT id INTO NEW.contato_id
    FROM contatos
    WHERE email = NEW.contato_email
    LIMIT 1;

    -- Se encontrou, retornar com contato_id preenchido
    IF NEW.contato_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Se nao achou por email mas tem telefone, tentar fallback por telefone
  IF NEW.contato_telefone IS NOT NULL THEN
    SELECT id INTO NEW.contato_id
    FROM contatos
    WHERE telefone = NEW.contato_telefone
    LIMIT 1;
  END IF;

  -- Se ainda nao achou ou ambos NULL, deixar como chegou (NULL permitido)
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fix_contact_date_created_tz()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    IF NEW.date_created IS NOT NULL THEN
      NEW.date_created := (timezone('America/Sao_Paulo', NEW.date_created))::TIMESTAMPTZ;
    END IF;
    RETURN NEW;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.ganhou_ingresso()
 RETURNS TABLE(id uuid, nome text, email text, telefone text, utm_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT DISTINCT ON (c.id)
    c.id,
    COALESCE(NULLIF(TRIM(c.nome), ''), c.email) AS nome,
    c.email,
    c.telefone,
    c.utm_source
  FROM contatos c
  WHERE
    c.tags ILIKE '%ganhou-ingresso%'
    AND c.tags NOT ILIKE '%[deletar]%'
    AND c.nome NOT ILIKE '%test%'
    AND c.email NOT ILIKE '%test%'
    AND LENGTH(TRIM(COALESCE(c.nome, ''))) >= 3
    AND TRIM(COALESCE(c.nome, '')) ~ '[A-Za-zÀ-ú]'
    AND LOWER(TRIM(COALESCE(c.nome, ''))) NOT IN (
      'qweqwe', 'qwerty', 'asdf', 'asdfgh', 'zxcv',
      'aaa', 'bbb', 'xxx', 'yyy', 'zzz',
      'nome', 'name', 'fulano', 'ciclano', 'beltrano'
    )
    AND LOWER(TRIM(c.email)) NOT IN ('bguzela@gmail.com')
  ORDER BY c.id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_campaign_creatives(p_workspace_id uuid, p_start_date date, p_end_date date, p_meta_campaign_id text DEFAULT NULL::text, p_local_campaign_id uuid DEFAULT NULL::uuid, p_objective text DEFAULT NULL::text)
 RETURNS TABLE(creative_code text, creative_id uuid, creative_name text, spend numeric, impressions bigint, clicks bigint, leads_meta bigint, leads_crm bigint, vendas bigint, faturamento numeric, cpl_crm numeric, roas numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ws_accounts AS (
    SELECT DISTINCT mai.account_id
    FROM meta_ads_insights mai
    JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
     AND nc.workspace_id = p_workspace_id
    WHERE mai.ad_name ~ 'CR-\d+'
  ),
  local_crs AS (
    SELECT nc.external_id AS cr_code
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.external_id ~ 'CR-\d+'
      AND (
        (p_local_campaign_id IS NOT NULL AND nc.campaign_id = p_local_campaign_id)
        OR (p_objective IS NOT NULL AND nc.cta_objective = p_objective)
      )
  ),
  scoped_ads AS (
    SELECT
      mai.*,
      (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_num
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ 'CR-\d+'
      AND (
        (p_meta_campaign_id IS NOT NULL
          AND mai.campaign_id::text = p_meta_campaign_id
          AND mai.account_id IN (SELECT account_id FROM ws_accounts))
        OR
        ((p_local_campaign_id IS NOT NULL OR p_objective IS NOT NULL)
          AND ('CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1])
              IN (SELECT cr_code FROM local_crs))
      )
  ),
  meta_by_cr AS (
    SELECT
      s.cr_num,
      SUM(s.spend) AS spend,
      SUM(s.impressions) AS impressions,
      SUM(s.clicks) AS clicks,
      SUM(s.leads) AS leads_meta
    FROM scoped_ads s
    GROUP BY s.cr_num
  ),
  crm_by_cr AS (
    SELECT
      (regexp_match(c.utm_term, 'CR-(\d+)'))[1] AS cr_num,
      COUNT(*) AS leads_crm,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS vendas,
      COALESCE(SUM(vf.valor_faturado), 0) AS faturamento
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ 'CR-\d+'
    GROUP BY cr_num
  )
  SELECT
    'CR-' || m.cr_num,
    nc.id,
    nc.name,
    COALESCE(m.spend, 0),
    COALESCE(m.impressions, 0)::bigint,
    COALESCE(m.clicks, 0)::bigint,
    COALESCE(m.leads_meta, 0)::bigint,
    COALESCE(cr.leads_crm, 0)::bigint,
    COALESCE(cr.vendas, 0)::bigint,
    COALESCE(cr.faturamento, 0),
    CASE WHEN cr.leads_crm > 0 THEN ROUND(m.spend / cr.leads_crm, 2) END,
    CASE WHEN m.spend > 0 THEN ROUND(cr.faturamento / m.spend, 2) END
  FROM meta_by_cr m
  LEFT JOIN crm_by_cr cr ON cr.cr_num = m.cr_num
  LEFT JOIN notion_creatives nc
    ON nc.external_id = 'CR-' || m.cr_num
   AND nc.workspace_id = p_workspace_id
  ORDER BY COALESCE(m.spend, 0) DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_campaign_daily(p_workspace_id uuid, p_start_date date, p_end_date date, p_meta_campaign_id text DEFAULT NULL::text, p_local_campaign_id uuid DEFAULT NULL::uuid, p_objective text DEFAULT NULL::text)
 RETURNS TABLE(date date, spend numeric, leads bigint, clicks bigint, impressions bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ws_accounts AS (
    SELECT DISTINCT mai.account_id
    FROM meta_ads_insights mai
    JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
     AND nc.workspace_id = p_workspace_id
    WHERE mai.ad_name ~ 'CR-\d+'
  ),
  local_crs AS (
    SELECT nc.external_id AS cr_code
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.external_id ~ 'CR-\d+'
      AND (
        (p_local_campaign_id IS NOT NULL AND nc.campaign_id = p_local_campaign_id)
        OR (p_objective IS NOT NULL AND nc.cta_objective = p_objective)
      )
  ),
  scoped_ads AS (
    SELECT mai.*
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND (
        (p_meta_campaign_id IS NOT NULL
          AND mai.campaign_id::text = p_meta_campaign_id
          AND mai.account_id IN (SELECT account_id FROM ws_accounts))
        OR
        ((p_local_campaign_id IS NOT NULL OR p_objective IS NOT NULL)
          AND mai.ad_name ~ 'CR-\d+'
          AND ('CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1])
              IN (SELECT cr_code FROM local_crs))
      )
  )
  SELECT
    s.date,
    COALESCE(SUM(s.spend), 0),
    COALESCE(SUM(s.leads), 0)::bigint,
    COALESCE(SUM(s.clicks), 0)::bigint,
    COALESCE(SUM(s.impressions), 0)::bigint
  FROM scoped_ads s
  GROUP BY s.date
  ORDER BY s.date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_campaign_summary(p_workspace_id uuid, p_start_date date, p_end_date date, p_meta_campaign_id text DEFAULT NULL::text, p_local_campaign_id uuid DEFAULT NULL::uuid, p_objective text DEFAULT NULL::text)
 RETURNS TABLE(spend numeric, impressions bigint, clicks bigint, reach bigint, leads_meta bigint, lp_views bigint, avg_ctr numeric, avg_cpm numeric, avg_cpc numeric, leads_crm bigint, mql_count bigint, reunioes bigint, vendas bigint, faturamento numeric, caixa numeric, cpl_crm numeric, cpmql numeric, cpv numeric, roas numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ws_accounts AS (
    SELECT DISTINCT mai.account_id
    FROM meta_ads_insights mai
    JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
     AND nc.workspace_id = p_workspace_id
    WHERE mai.ad_name ~ 'CR-\d+'
  ),
  local_crs AS (
    -- CR-xxx dos criativos no escopo (agrupamento local OU objetivo do Notion)
    SELECT nc.external_id AS cr_code
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.external_id ~ 'CR-\d+'
      AND (
        (p_local_campaign_id IS NOT NULL AND nc.campaign_id = p_local_campaign_id)
        OR (p_objective IS NOT NULL AND nc.cta_objective = p_objective)
      )
  ),
  scoped_ads AS (
    SELECT
      mai.*,
      'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_code
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND (
        (p_meta_campaign_id IS NOT NULL
          AND mai.campaign_id::text = p_meta_campaign_id
          AND mai.account_id IN (SELECT account_id FROM ws_accounts))
        OR
        ((p_local_campaign_id IS NOT NULL OR p_objective IS NOT NULL)
          AND mai.ad_name ~ 'CR-\d+'
          AND ('CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1])
              IN (SELECT cr_code FROM local_crs))
      )
  ),
  meta_agg AS (
    SELECT
      COALESCE(SUM(s.spend), 0) AS spend,
      COALESCE(SUM(s.impressions), 0) AS impressions,
      COALESCE(SUM(s.clicks), 0) AS clicks,
      COALESCE(SUM(s.reach), 0) AS reach,
      COALESCE(SUM(s.leads), 0) AS leads_meta,
      COALESCE(SUM(s.landing_page_views), 0) AS lp_views,
      AVG(s.ctr) AS avg_ctr,
      AVG(s.cpm) AS avg_cpm,
      AVG(s.cpc) AS avg_cpc
    FROM scoped_ads s
  ),
  cr_set AS (
    SELECT DISTINCT s.cr_code FROM scoped_ads s WHERE s.cr_code IS NOT NULL
  ),
  crm_agg AS (
    SELECT
      COUNT(*) AS leads_crm,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mql_count,
      COUNT(*) FILTER (WHERE o.data_realizacao_vendas IS NOT NULL) AS reunioes,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS vendas,
      COALESCE(SUM(vf.valor_faturado), 0) AS faturamento,
      COALESCE(SUM(vf.valor_entrada), 0) AS caixa
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ 'CR-\d+'
      AND ('CR-' || (regexp_match(c.utm_term, 'CR-(\d+)'))[1])
          IN (SELECT cr_code FROM cr_set)
  )
  SELECT
    m.spend,
    m.impressions::bigint,
    m.clicks::bigint,
    m.reach::bigint,
    m.leads_meta::bigint,
    m.lp_views::bigint,
    ROUND(m.avg_ctr::numeric, 2),
    ROUND(m.avg_cpm::numeric, 2),
    ROUND(m.avg_cpc::numeric, 2),
    cr.leads_crm::bigint,
    cr.mql_count::bigint,
    cr.reunioes::bigint,
    cr.vendas::bigint,
    cr.faturamento,
    cr.caixa,
    CASE WHEN cr.leads_crm > 0 THEN ROUND(m.spend / cr.leads_crm, 2) END,
    CASE WHEN cr.mql_count > 0 THEN ROUND(m.spend / cr.mql_count, 2) END,
    CASE WHEN cr.vendas > 0 THEN ROUND(m.spend / cr.vendas, 2) END,
    CASE WHEN m.spend > 0 THEN ROUND(cr.faturamento / m.spend, 2) END
  FROM meta_agg m CROSS JOIN crm_agg cr;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_compradores_do_criativo(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  DECLARE result json;
  BEGIN
    SELECT json_agg(json_build_object(
      'nome', TRIM(COALESCE(mc.comprador_nome,'') || ' ' ||
  COALESCE(mc.comprador_sobrenome,'')),
      'email', mc.comprador_email, 'telefone', mc.comprador_telefone
    ) ORDER BY mc.data_aprovacao DESC) INTO result
    FROM maquina_de_conteudo mc JOIN contatos c ON lower(c.email) =
  lower(mc.comprador_email)
    WHERE c.utm_content = p_code AND mc.status = 'APPROVED';
    RETURN COALESCE(result, '[]');
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.get_compras_evento()
 RETURNS TABLE(id uuid, transacao_id text, evento_tipo text, status text, data_aprovacao timestamp with time zone, data_pedido timestamp with time zone, comprador_nome text, comprador_sobrenome text, comprador_email text, comprador_telefone text, produto_nome text, oferta_codigo text, oferta_nome text, cupom_codigo text, valor numeric, valor_oferta_original numeric, moeda text, forma_pagamento text, parcelas integer, quantidade_ingressos bigint, criado_em timestamp with time zone, utm_source_contato text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    mc.id,
    mc.transacao_id,
    mc.evento_tipo,
    mc.status,
    mc.data_aprovacao,
    mc.data_pedido,
    mc.comprador_nome,
    mc.comprador_sobrenome,
    mc.comprador_email,
    mc.comprador_telefone,
    mc.produto_nome,
    mc.oferta_codigo,
    mc.oferta_nome,
    mc.cupom_codigo,
    mc.valor,
    mc.valor_oferta_original,
    mc.moeda,
    mc.forma_pagamento,
    mc.parcelas,
    mc.quantidade_ingressos,
    mc.criado_em,
    c.utm_source AS utm_source_contato
  FROM maquina_de_conteudo mc
  LEFT JOIN contatos c
    ON LOWER(TRIM(c.email)) = LOWER(TRIM(mc.comprador_email))
  ORDER BY mc.data_aprovacao DESC NULLS LAST
  LIMIT 500;
$function$
;

CREATE OR REPLACE FUNCTION public.get_contact_workspace_id(p_contato_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT workspace_id FROM public.contatos WHERE id = p_contato_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creative_metrics(p_workspace_id uuid, p_start_date date, p_end_date date, p_creative_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(creative_code text, creative_id uuid, creative_name text, total_spend numeric, total_impressions bigint, total_clicks bigint, leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric, vendas bigint, faturamento numeric, roas numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);
  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creative_metrics(p_workspace_id uuid, p_start_date date, p_end_date date, p_creative_id uuid DEFAULT NULL::uuid, p_campaign_names text[] DEFAULT NULL::text[], p_adset_names text[] DEFAULT NULL::text[], p_ad_names text[] DEFAULT NULL::text[], p_channels text[] DEFAULT NULL::text[], p_funil_tags text[] DEFAULT NULL::text[], p_cp_tags text[] DEFAULT NULL::text[])
 RETURNS TABLE(creative_code text, creative_id uuid, creative_name text, total_spend numeric, total_impressions bigint, total_clicks bigint, leads_crm bigint, mql_count bigint, cpl_crm numeric, cpmql numeric, vendas bigint, faturamento numeric, roas numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_campaign_codes text[];
  v_funil_codes text[];
  v_cp_codes text[];
  v_channel_public_codes text[];
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);

  IF p_campaign_names IS NOT NULL AND array_length(p_campaign_names, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_campaign_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_campaign_names);
  END IF;

  IF p_funil_tags IS NOT NULL AND array_length(p_funil_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_funil_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(uc.funnels) AS f WHERE f = ANY(p_funil_tags)
      );
  END IF;

  IF p_cp_tags IS NOT NULL AND array_length(p_cp_tags, 1) > 0 THEN
    SELECT array_agg(DISTINCT uc.utm_campaign::text)
    INTO v_cp_codes
    FROM utm_campaigns uc
    WHERE uc.workspace_id = p_workspace_id
      AND uc.nome = ANY(p_cp_tags);
  END IF;

  IF p_channels IS NOT NULL AND array_length(p_channels, 1) > 0 THEN
    SELECT array_agg(DISTINCT us.public_code)
    INTO v_channel_public_codes
    FROM utm_sources us
    WHERE us.workspace_id = p_workspace_id
      AND us.utm_source = ANY(p_channels)
      AND us.public_code IS NOT NULL;
  END IF;

  RETURN QUERY
  WITH meta_agg AS (
    SELECT
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ '(CR|AN)-\d+'
      AND (p_campaign_names IS NULL OR array_length(p_campaign_names, 1) IS NULL OR mai.campaign_name = ANY(p_campaign_names))
      AND (p_adset_names IS NULL OR array_length(p_adset_names, 1) IS NULL OR mai.adset_name = ANY(p_adset_names))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR mai.ad_name = ANY(p_ad_names)
        OR ((regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1] || '-' || (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2]) = ANY(p_ad_names)
      )
      AND (
        v_channel_public_codes IS NULL OR array_length(v_channel_public_codes, 1) IS NULL
        OR mai.ad_name ~ ANY(v_channel_public_codes)
      )
    GROUP BY
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[2],
      (regexp_match(mai.ad_name, '(CR|AN)-(\d+)'))[1]
  ),
  crm_agg AS (
    SELECT
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2] AS cr_num,
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1] AS cr_prefix,
      COUNT(*) AS leads,
      COUNT(*) FILTER (WHERE c.tags ILIKE '%mql%') AS mqls,
      COUNT(*) FILTER (WHERE vf.data_pagamento_entrada IS NOT NULL) AS sales,
      COALESCE(SUM(vf.valor_faturado), 0) AS revenue
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    LEFT JOIN vendas_fechamento vf ON vf.oportunidade_id = o.id
    WHERE o.data_lead_recebido >= (p_start_date || 'T00:00:00-03:00')::timestamptz
      AND o.data_lead_recebido <= (p_end_date || 'T23:59:59-03:00')::timestamptz
      AND c.utm_term ~ '(CR|AN)-\d+'
      AND (p_channels IS NULL OR array_length(p_channels, 1) IS NULL OR c.utm_source = ANY(p_channels))
      AND (v_campaign_codes IS NULL OR array_length(v_campaign_codes, 1) IS NULL OR c.utm_campaign = ANY(v_campaign_codes))
      AND (v_funil_codes IS NULL OR array_length(v_funil_codes, 1) IS NULL OR c.utm_campaign = ANY(v_funil_codes))
      AND (v_cp_codes IS NULL OR array_length(v_cp_codes, 1) IS NULL OR c.utm_campaign = ANY(v_cp_codes))
      AND (
        p_ad_names IS NULL OR array_length(p_ad_names, 1) IS NULL
        OR c.utm_term = ANY(p_ad_names)
      )
    GROUP BY
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[2],
      (regexp_match(c.utm_term, '(CR|AN)-(\d+)'))[1]
  )
  SELECT
    m.cr_prefix || '-' || m.cr_num,
    nc.id,
    nc.name,
    m.spend,
    m.impressions,
    m.clicks,
    COALESCE(c.leads, 0),
    COALESCE(c.mqls, 0),
    CASE WHEN c.leads > 0 THEN m.spend / c.leads END,
    CASE WHEN c.mqls > 0 THEN m.spend / c.mqls END,
    COALESCE(c.sales, 0),
    COALESCE(c.revenue, 0),
    CASE WHEN m.spend > 0 THEN c.revenue / m.spend END
  FROM meta_agg m
  LEFT JOIN crm_agg c
    ON c.cr_num = m.cr_num AND c.cr_prefix = m.cr_prefix
  LEFT JOIN notion_creatives nc
    ON nc.external_id = m.cr_prefix || '-' || m.cr_num
    AND nc.workspace_id = p_workspace_id
  WHERE (p_creative_id IS NULL OR nc.id = p_creative_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cron_jobs()
 RETURNS TABLE(jobid bigint, jobname text, schedule text, active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT j.jobid, j.jobname::TEXT, j.schedule::TEXT, j.active
  FROM cron.job j
  ORDER BY j.jobname;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cron_runs(limit_count integer DEFAULT 100)
 RETURNS TABLE(jobid bigint, jobname text, status text, start_time timestamp with time zone, end_time timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT j.jobid,
         j.jobname::TEXT,
         r.status::TEXT,
         r.start_time,
         r.end_time
  FROM cron.job_run_details r
  JOIN cron.job j ON j.jobid = r.jobid
  ORDER BY r.start_time DESC
  LIMIT limit_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_email_utm_source_map()
 RETURNS TABLE(email text, utm_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    LOWER(TRIM(c.email)) AS email,
    c.utm_source
  FROM contatos c
  WHERE c.email IS NOT NULL
    AND c.utm_source IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_inbound_count_by_contato(p_contato_ids uuid[])
 RETURNS TABLE(contato_id uuid, total_inbound bigint)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  SELECT c.contato_id, COUNT(*) AS total_inbound
  FROM comunicacoes c
  WHERE c.direction = 'inbound'
    AND c.contato_id = ANY(p_contato_ids)
  GROUP BY c.contato_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_lead_full(p_opp_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  DECLARE result json; 
  BEGIN
    SELECT row_to_json(t) INTO result                                               FROM (
      SELECT o.*,                                                               
        (SELECT row_to_json(c.*) FROM contatos c WHERE c.id = o.contato_id) AS
  contatos
      FROM oportunidades o WHERE o.id = p_opp_id
    ) t;
    RETURN result;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.get_leads_do_criativo(p_code text, p_start text DEFAULT NULL::text, p_end text DEFAULT NULL::text)
 RETURNS TABLE("oppId" uuid, nome text, email text, telefone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT DISTINCT ON (c.id)
    o.id                                                AS "oppId",
    COALESCE(NULLIF(TRIM(c.nome), ''), c.email)        AS nome,
    c.email,
    c.telefone
  FROM oportunidades o
  JOIN contatos c ON c.id = o.contato_id
  WHERE
    -- Criativo via utm_content (CR-xxx) ou utm_term como fallback
    (
      (c.utm_content ~ 'CR-\d+' AND (regexp_match(c.utm_content, 'CR-(\d+)'))[1] = SUBSTRING(p_code FROM 'CR-(\d+)'))
      OR
      (c.utm_term ~ 'CR-\d+' AND (regexp_match(c.utm_term, 'CR-(\d+)'))[1] = SUBSTRING(p_code FROM 'CR-(\d+)'))
    )
    AND (p_start IS NULL OR o.data_lead_recebido::date >= p_start::date)
    AND (p_end   IS NULL OR o.data_lead_recebido::date <= p_end::date)
    -- Filtros do evento
    AND c.tags ILIKE '%[cp] ev-jun-26%'
    AND c.tags NOT ILIKE '%[deletar]%'
    AND c.nome NOT ILIKE '%test%'
    AND c.email NOT ILIKE '%test%'
    AND LOWER(TRIM(COALESCE(c.nome, ''))) NOT IN (
      'qweqwe','qwerty','asdf','asdfgh','zxcv',
      'aaa','bbb','xxx','yyy','zzz',
      'nome','name','fulano','ciclano','beltrano'
    )
    AND LOWER(TRIM(c.email)) NOT IN (
      'bguzela@gmail.com',
      'susana.leite@vena.app.br'
    )
  ORDER BY c.id, o.data_lead_recebido DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_leads_do_publico(p_code text, p_utm_term text, p_start text DEFAULT NULL::text, p_end text DEFAULT NULL::text)
 RETURNS TABLE("oppId" uuid, nome text, email text, telefone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT DISTINCT ON (c.id)
      o.id                                             AS "oppId",
      COALESCE(NULLIF(TRIM(c.nome), ''), c.email)     AS nome,
      c.email,
      c.telefone
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE
      c.utm_content ~ 'CR-\d+'
      AND (regexp_match(c.utm_content, 'CR-(\d+)'))[1] = SUBSTRING(p_code FROM   
  'CR-(\d+)')
      AND SPLIT_PART(c.utm_term, '_', 3) = p_utm_term
      AND c.tags ILIKE '%[cp] ev-jun-26%'
      AND c.tags NOT ILIKE '%[deletar]%'
      AND c.nome NOT ILIKE '%test%'
      AND c.email NOT ILIKE '%test%'
      AND LOWER(TRIM(COALESCE(c.nome, ''))) NOT IN (
        'qweqwe','qwerty','asdf','asdfgh','zxcv',
        'aaa','bbb','xxx','yyy','zzz',
        'nome','name','fulano','ciclano','beltrano'
      )
      AND LOWER(TRIM(c.email)) NOT IN (
        'bguzela@gmail.com'
      )
      AND (p_start IS NULL OR o.data_lead_recebido::date >= p_start::date)       
      AND (p_end   IS NULL OR o.data_lead_recebido::date <= p_end::date)
    ORDER BY c.id, o.data_lead_recebido DESC;
  $function$
;

CREATE OR REPLACE FUNCTION public.get_max_creative_number(p_workspace_id uuid, p_prefix text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM raise_unless_workspace_member(p_workspace_id);
  RETURN (
    SELECT COALESCE(MAX(
      (regexp_match(external_id, '^' || p_prefix || '-(\d+)$'))[1]::bigint
    ), 0)
    FROM notion_creatives
    WHERE workspace_id = p_workspace_id
      AND external_id ~ ('^' || p_prefix || '-\d+$')
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_meta_campaigns(p_workspace_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(campaign_id text, campaign_name text, total_spend numeric, total_impressions bigint, total_clicks bigint, leads_meta bigint, avg_ctr numeric, ad_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Isolamento: só membros do workspace podem consultar suas métricas.
  -- Sem isto, qualquer authenticated poderia passar outro workspace_id (IDOR).
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH ws_accounts AS (
    -- contas de anúncio que pertencem a este workspace
    SELECT DISTINCT mai.account_id
    FROM meta_ads_insights mai
    JOIN notion_creatives nc
      ON nc.external_id = 'CR-' || (regexp_match(mai.ad_name, 'CR-(\d+)'))[1]
     AND nc.workspace_id = p_workspace_id
    WHERE mai.ad_name ~ 'CR-\d+'
  )
  SELECT
    mai.campaign_id::text,
    MAX(mai.campaign_name),
    COALESCE(SUM(mai.spend), 0),
    COALESCE(SUM(mai.impressions), 0)::bigint,
    COALESCE(SUM(mai.clicks), 0)::bigint,
    COALESCE(SUM(mai.leads), 0)::bigint,
    ROUND(AVG(mai.ctr)::numeric, 2),
    COUNT(DISTINCT mai.ad_id)::bigint
  FROM meta_ads_insights mai
  WHERE mai.date BETWEEN p_start_date AND p_end_date
    AND mai.campaign_id IS NOT NULL
    AND mai.account_id IN (SELECT account_id FROM ws_accounts)
  GROUP BY mai.campaign_id
  ORDER BY 3 DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_objectives(p_workspace_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(objective text, total_spend numeric, total_impressions bigint, total_clicks bigint, leads_meta bigint, avg_ctr numeric, creative_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH cr_obj AS (
    -- criativos do workspace que têm objetivo preenchido
    SELECT
      (regexp_match(nc.external_id, 'CR-(\d+)'))[1] AS cr_num,
      nc.cta_objective AS objective
    FROM notion_creatives nc
    WHERE nc.workspace_id = p_workspace_id
      AND nc.cta_objective IS NOT NULL
      AND nc.external_id ~ 'CR-\d+'
  ),
  meta AS (
    SELECT
      (regexp_match(mai.ad_name, 'CR-(\d+)'))[1] AS cr_num,
      SUM(mai.spend) AS spend,
      SUM(mai.impressions) AS impressions,
      SUM(mai.clicks) AS clicks,
      SUM(mai.leads) AS leads,
      AVG(mai.ctr) AS ctr
    FROM meta_ads_insights mai
    WHERE mai.date BETWEEN p_start_date AND p_end_date
      AND mai.ad_name ~ 'CR-\d+'
    GROUP BY cr_num
  )
  SELECT
    o.objective,
    COALESCE(SUM(m.spend), 0),
    COALESCE(SUM(m.impressions), 0)::bigint,
    COALESCE(SUM(m.clicks), 0)::bigint,
    COALESCE(SUM(m.leads), 0)::bigint,
    ROUND(AVG(m.ctr)::numeric, 2),
    COUNT(DISTINCT o.cr_num)::bigint
  FROM cr_obj o
  LEFT JOIN meta m ON m.cr_num = o.cr_num
  GROUP BY o.objective
  ORDER BY 2 DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_opp_id_by_email(p_email text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$     
    SELECT o.id FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE lower(c.email) = lower(p_email)
    ORDER BY o.data_lead_recebido DESC NULLS LAST LIMIT 1;
  $function$
;

CREATE OR REPLACE FUNCTION public.get_opportunity_workspace_id(p_oportunidade_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT c.workspace_id
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE o.id = p_oportunidade_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_user_id uuid, p_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_conversation_id UUID;
BEGIN
    -- Try to get the most recent conversation for the user
    SELECT id INTO v_conversation_id
    FROM ai_conversations
    WHERE user_id = p_user_id
    ORDER BY updated_at DESC
    LIMIT 1;
    
    -- If no conversation exists, create a new one
    IF v_conversation_id IS NULL THEN
        INSERT INTO ai_conversations (user_id, title)
        VALUES (p_user_id, p_title)
        RETURNING id INTO v_conversation_id;
    END IF;
    
    RETURN v_conversation_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_origens()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ 
  DECLARE result json;
  BEGIN
    SELECT json_build_object(
      'origins',     COALESCE((SELECT json_agg(row_to_json(o)) FROM (SELECT id, 
  nome FROM utm_origins ORDER BY nome) o), '[]'),
      'assignments', COALESCE((SELECT json_agg(row_to_json(a)) FROM (SELECT     
  utm_source, origin_id FROM utm_source_origin_assignments) a), '[]'),
      'sources',     COALESCE((SELECT json_agg(row_to_json(s)) FROM (SELECT     
  utm_source, nome FROM utm_sources UNION ALL SELECT utm_source, nome FROM      
  utm_sources_plain) s), '[]')
    ) INTO result;
    RETURN result;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.get_publicos_do_criativo(p_code text, p_start text DEFAULT NULL::text, p_end text DEFAULT NULL::text)
 RETURNS TABLE(utm_source text, nome text, investimento numeric, faturamento numeric, caixa numeric, leads bigint, vendas bigint, cpl numeric, cpv numeric, ctr numeric, cpm numeric, conv_pagina numeric, video_hook numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    WITH meta_por_publico AS (
      SELECT
        SPLIT_PART(ad_name, '_', 3)          AS public_code,
        SUM(COALESCE(spend, 0))              AS total_spend,
        SUM(COALESCE(impressions, 0))        AS total_impressions,
        SUM(COALESCE(clicks, 0))             AS total_clicks,
        SUM(COALESCE(landing_page_views, 0)) AS total_lpv,
        SUM(COALESCE(video_views, 0))        AS total_vv
      FROM meta_ads_insights
      WHERE
        (regexp_match(ad_name, 'CR-(\d+)'))[1] = SUBSTRING(p_code FROM
  'CR-(\d+)')
        AND ad_name ~ '_PG33'
        AND (p_start IS NULL OR date >= p_start::date)
        AND (p_end   IS NULL OR date <= p_end::date)
      GROUP BY SPLIT_PART(ad_name, '_', 3)
      HAVING SPLIT_PART(ad_name, '_', 3) ~ '^P\d+$'
    ),
    leads_por_publico AS (
      SELECT
        SPLIT_PART(c.utm_term, '_', 3)  AS public_code,
        COUNT(DISTINCT c.id)            AS leads_count
      FROM contatos c
      JOIN oportunidades o ON o.contato_id = c.id
      WHERE
        c.tags ILIKE '%[cp] ev-jun-26%'
        AND c.tags NOT ILIKE '%[deletar]%'
        AND c.utm_content ~ 'CR-\d+'
        AND (regexp_match(c.utm_content, 'CR-(\d+)'))[1] = SUBSTRING(p_code FROM 
  'CR-(\d+)')
        AND c.utm_term IS NOT NULL
        AND SPLIT_PART(c.utm_term, '_', 3) ~ '^P\d+$'
        AND c.nome NOT ILIKE '%test%'
        AND c.email NOT ILIKE '%test%'
        AND LOWER(TRIM(c.email)) NOT IN ('bguzela@gmail.com')
        AND (p_start IS NULL OR o.data_lead_recebido::date >= p_start::date)     
        AND (p_end   IS NULL OR o.data_lead_recebido::date <= p_end::date)       
      GROUP BY SPLIT_PART(c.utm_term, '_', 3)
    )
    SELECT
      m.public_code                                        AS utm_source,        
      COALESCE(us.nome, m.public_code)                    AS nome,
      m.total_spend                                        AS investimento,      
      0::numeric                                           AS faturamento,       
      0::numeric                                           AS caixa,
      COALESCE(lp.leads_count, 0)::bigint                 AS leads,
      0::bigint                                            AS vendas,
      CASE WHEN COALESCE(lp.leads_count, 0) > 0
        THEN ROUND(m.total_spend / lp.leads_count, 2)
        ELSE 0 END                                         AS cpl,
      0::numeric                                           AS cpv,
      CASE WHEN m.total_impressions > 0
        THEN ROUND((m.total_clicks::numeric / m.total_impressions) * 100, 2)     
        ELSE 0 END                                         AS ctr,
      CASE WHEN m.total_impressions > 0
        THEN ROUND((m.total_spend / m.total_impressions) * 1000, 2)
        ELSE 0 END                                         AS cpm,
      CASE WHEN m.total_lpv > 0
        THEN ROUND((m.total_clicks::numeric / m.total_lpv) * 100, 2)
        ELSE 0 END                                         AS conv_pagina,       
      CASE WHEN m.total_impressions > 0
        THEN ROUND((m.total_vv::numeric / m.total_impressions) * 100, 2)
        ELSE 0 END                                         AS video_hook
    FROM meta_por_publico m
    LEFT JOIN utm_sources us       ON us.public_code    = m.public_code
    LEFT JOIN leads_por_publico lp ON lp.public_code    = m.public_code
    ORDER BY m.total_spend DESC;
  $function$
;

CREATE OR REPLACE FUNCTION public.get_ranking_criativos(p_start text DEFAULT NULL::text, p_end text DEFAULT NULL::text, p_utm_sources text[] DEFAULT NULL::text[])
 RETURNS TABLE(code text, name text, investimento numeric, faturamento numeric, caixa numeric, leads bigint, vendas bigint, cpl numeric, cpv numeric, ctr numeric, cpm numeric, conv_pagina numeric, video_hook numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  WITH

  meta_por_criativo AS (
    SELECT
      'CR-' || (regexp_match(ad_name, 'CR-(\d+)'))[1]  AS creative_code,
      SUM(COALESCE(spend, 0))                           AS total_spend,
      SUM(COALESCE(impressions, 0))                     AS total_impressions,
      SUM(COALESCE(clicks, 0))                          AS total_clicks,
      SUM(COALESCE(landing_page_views, 0))              AS total_lpv,
      SUM(COALESCE(video_views, 0))                     AS total_vv
    FROM meta_ads_insights
    WHERE
      ad_name ~ 'CR-\d+'
      AND ad_name ~ '_PG33'
      AND (p_start IS NULL OR date >= p_start::date)
      AND (p_end   IS NULL OR date <= p_end::date)
    GROUP BY (regexp_match(ad_name, 'CR-(\d+)'))[1]
    HAVING (regexp_match(ad_name, 'CR-(\d+)'))[1] IS NOT NULL
  ),

  leads_por_criativo AS (
    SELECT
      'CR-' || COALESCE(
        (regexp_match(c.utm_content, 'CR-(\d+)'))[1],
        (regexp_match(c.utm_term,    'CR-(\d+)'))[1]
      )                        AS creative_code,
      COUNT(DISTINCT c.id)     AS total_leads
    FROM oportunidades o
    JOIN contatos c ON c.id = o.contato_id
    WHERE
      (c.utm_content ~ 'CR-\d+' OR c.utm_term ~ 'CR-\d+')
      AND c.utm_term ~ '_PG33'
      AND (p_start IS NULL OR o.data_lead_recebido::date >= p_start::date)
      AND (p_end   IS NULL OR o.data_lead_recebido::date <= p_end::date)
      AND c.tags ILIKE '%[cp] ev-jun-26%'
      AND c.tags NOT ILIKE '%[deletar]%'
      AND c.nome NOT ILIKE '%test%'
      AND c.email NOT ILIKE '%test%'
      AND LOWER(TRIM(COALESCE(c.nome, ''))) NOT IN (
        'qweqwe','qwerty','asdf','asdfgh','zxcv',
        'aaa','bbb','xxx','yyy','zzz',
        'nome','name','fulano','ciclano','beltrano'
      )
      AND LOWER(TRIM(c.email)) NOT IN (
        'bguzela@gmail.com',
        'susana.leite@vena.app.br'
      )
    GROUP BY COALESCE(
      (regexp_match(c.utm_content, 'CR-(\d+)'))[1],
      (regexp_match(c.utm_term,    'CR-(\d+)'))[1]
    )
    HAVING COALESCE(
      (regexp_match(c.utm_content, 'CR-(\d+)'))[1],
      (regexp_match(c.utm_term,    'CR-(\d+)'))[1]
    ) IS NOT NULL
  ),

  -- Vendas: usa utm_content (primário) ou utm_term (fallback) para o código do criativo.
  -- Filtra pela tag do evento — sem restrição de página (_PG33 removido).
  vendas_por_criativo AS (
    SELECT
      'CR-' || COALESCE(
        (regexp_match(c.utm_content, 'CR-(\d+)'))[1],
        (regexp_match(c.utm_term,    'CR-(\d+)'))[1]
      )                                AS creative_code,
      COUNT(DISTINCT mc.id)            AS total_vendas,
      COALESCE(SUM(mc.valor), 0)       AS total_faturamento
    FROM maquina_de_conteudo mc
    JOIN contatos c
      ON LOWER(TRIM(c.email)) = LOWER(TRIM(mc.comprador_email))
    WHERE
      mc.status = 'APPROVED'
      AND (c.utm_content ~ 'CR-\d+' OR c.utm_term ~ 'CR-\d+')
      AND c.tags ILIKE '%[cp] ev-jun-26%'
      AND (p_start IS NULL OR mc.data_aprovacao::date >= p_start::date)
      AND (p_end   IS NULL OR mc.data_aprovacao::date <= p_end::date)
    GROUP BY COALESCE(
      (regexp_match(c.utm_content, 'CR-(\d+)'))[1],
      (regexp_match(c.utm_term,    'CR-(\d+)'))[1]
    )
    HAVING COALESCE(
      (regexp_match(c.utm_content, 'CR-(\d+)'))[1],
      (regexp_match(c.utm_term,    'CR-(\d+)'))[1]
    ) IS NOT NULL
  ),

  todos_criativos AS (
    SELECT creative_code FROM meta_por_criativo
    UNION
    SELECT creative_code FROM leads_por_criativo
  )

  SELECT
    t.creative_code                                                AS code,
    COALESCE(nc.name, t.creative_code)                            AS name,
    COALESCE(m.total_spend, 0)                                    AS investimento,
    COALESCE(v.total_faturamento, 0)                              AS faturamento,
    0::numeric                                                     AS caixa,
    COALESCE(l.total_leads, 0)                                    AS leads,
    COALESCE(v.total_vendas, 0)                                   AS vendas,
    CASE WHEN COALESCE(l.total_leads, 0) > 0 AND COALESCE(m.total_spend, 0) > 0
      THEN ROUND(m.total_spend / l.total_leads, 2)
      ELSE 0 END                                                   AS cpl,
    CASE WHEN COALESCE(v.total_vendas, 0) > 0 AND COALESCE(m.total_spend, 0) > 0
      THEN ROUND(m.total_spend / v.total_vendas, 2)
      ELSE 0 END                                                   AS cpv,
    CASE WHEN COALESCE(m.total_impressions, 0) > 0
      THEN ROUND((m.total_clicks::numeric / m.total_impressions) * 100, 2)
      ELSE 0 END                                                   AS ctr,
    CASE WHEN COALESCE(m.total_impressions, 0) > 0
      THEN ROUND((m.total_spend / m.total_impressions) * 1000, 2)
      ELSE 0 END                                                   AS cpm,
    CASE WHEN COALESCE(m.total_lpv, 0) > 0
      THEN ROUND((m.total_clicks::numeric / m.total_lpv) * 100, 2)
      ELSE 0 END                                                   AS conv_pagina,
    CASE WHEN COALESCE(m.total_impressions, 0) > 0
      THEN ROUND((m.total_vv::numeric / m.total_impressions) * 100, 2)
      ELSE 0 END                                                   AS video_hook
  FROM todos_criativos t
  LEFT JOIN meta_por_criativo  m  ON m.creative_code = t.creative_code
  LEFT JOIN leads_por_criativo l  ON l.creative_code = t.creative_code
  LEFT JOIN vendas_por_criativo v  ON v.creative_code = t.creative_code
  LEFT JOIN notion_creatives   nc ON nc.external_id   = t.creative_code
                                  AND nc.database_type = 'paid'
  ORDER BY COALESCE(m.total_spend, 0) DESC, COALESCE(l.total_leads, 0) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sdr_avg_response_time(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(sdr_name text, usuario_ghl_id text, avg_response_seconds integer, response_count integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH ordered AS (
    SELECT
      ghl_conversation_id,
      usuario_ghl_id,
      direction,
      ghl_source,
      data_comunicacao,
      LAG(direction) OVER (
        PARTITION BY ghl_conversation_id ORDER BY data_comunicacao
      ) AS prev_direction,
      LAG(data_comunicacao) OVER (
        PARTITION BY ghl_conversation_id ORDER BY data_comunicacao
      ) AS prev_ts
    FROM comunicacoes
    WHERE data_comunicacao >= p_start
      AND data_comunicacao <= p_end
      AND direction IS NOT NULL
      AND ghl_conversation_id IS NOT NULL
  ),
  responses AS (
    SELECT
      usuario_ghl_id,
      EXTRACT(EPOCH FROM (data_comunicacao - prev_ts))::integer AS seconds
    FROM ordered
    WHERE direction = 'outbound'
      AND ghl_source = 'app'
      AND prev_direction = 'inbound'
      AND EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) BETWEEN 1 AND 86400
  )
  SELECT
    u.nome               AS sdr_name,
    r.usuario_ghl_id,
    ROUND(AVG(r.seconds))::integer AS avg_response_seconds,
    COUNT(*)::integer    AS response_count
  FROM responses r
  JOIN ghl_users u ON u.ghl_id = r.usuario_ghl_id
  GROUP BY r.usuario_ghl_id, u.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.get_sdr_last_response_time(p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(sdr_name text, usuario_ghl_id text, last_response_seconds integer, last_response_at timestamp with time zone)
 LANGUAGE sql
 STABLE
AS $function$
  WITH ordered AS (
    SELECT
      ghl_conversation_id,
      usuario_ghl_id,
      direction,
      ghl_source,
      data_comunicacao,
      LAG(direction)        OVER (PARTITION BY ghl_conversation_id ORDER BY data_comunicacao) AS prev_direction,
      LAG(data_comunicacao) OVER (PARTITION BY ghl_conversation_id ORDER BY data_comunicacao) AS prev_ts
    FROM comunicacoes
    WHERE data_comunicacao >= p_start
      AND data_comunicacao <= p_end
  ),
  responses AS (
    SELECT
      usuario_ghl_id,
      EXTRACT(EPOCH FROM (data_comunicacao - prev_ts))::integer AS seconds,
      data_comunicacao,
      ROW_NUMBER() OVER (
        PARTITION BY usuario_ghl_id
        ORDER BY data_comunicacao DESC
      ) AS rn
    FROM ordered
    WHERE direction      = 'outbound'
      AND ghl_source     = 'app'
      AND prev_direction = 'inbound'
      AND EXTRACT(EPOCH FROM (data_comunicacao - prev_ts)) BETWEEN 1 AND 86400
  )
  SELECT
    u.nome              AS sdr_name,
    r.usuario_ghl_id,
    r.seconds           AS last_response_seconds,
    r.data_comunicacao  AS last_response_at
  FROM responses r
  JOIN ghl_users u ON u.ghl_id = r.usuario_ghl_id
  WHERE r.rn = 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_secret(p_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN (SELECT value FROM secrets WHERE key = p_key);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_todos_leads_evento()
 RETURNS TABLE(id uuid, nome text, email text, telefone text, situacao text, utm_source_raw text, utm_source_nome text, utm_medium_nome text, utm_campaign_nome text, utm_content_raw text, opp_id_evento uuid, data_entrada_evento timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT DISTINCT ON (c.id)
    c.id,
    COALESCE(NULLIF(TRIM(c.nome), ''), c.email)  AS nome,
    c.email,
    c.telefone,

    -- Situação do lead no evento
    CASE
      WHEN EXISTS(
        SELECT 1 FROM maquina_de_conteudo mc
        WHERE LOWER(TRIM(mc.comprador_email)) = LOWER(TRIM(c.email))
          AND mc.status = 'APPROVED'
      ) THEN 'comprou'
      WHEN c.tags ILIKE '%ganhou-ingresso%' THEN 'ganhou'
      ELSE 'lead'
    END                                           AS situacao,

    c.utm_source                                  AS utm_source_raw,

    -- UTM Source: match exato em utm_sources_plain, fallback para utm_sources
    COALESCE(
      (SELECT usp.nome FROM utm_sources_plain usp WHERE usp.utm_source = c.utm_source LIMIT 1),
      (SELECT us.nome  FROM utm_sources us       WHERE us.utm_source  = c.utm_source LIMIT 1)
    )                                             AS utm_source_nome,

    -- Medium: número → nome (ex: "1" → "Reels")
    COALESCE(um.nome, c.utm_medium)               AS utm_medium_nome,

    -- Campaign: número → nome (ex: "33" → "[cp] ev-jun-26")
    COALESCE(uc.nome, c.utm_campaign)             AS utm_campaign_nome,

    c.utm_content                                 AS utm_content_raw,

    -- ID e data da oportunidade no pipeline [fn] evento
    (
      SELECT o.id
      FROM oportunidades o
      WHERE o.contato_id = c.id
        AND o.pipeline_name ILIKE '%[fn] evento%'
      ORDER BY o.data_lead_recebido ASC NULLS LAST
      LIMIT 1
    )                                             AS opp_id_evento,
    (
      SELECT o.data_lead_recebido
      FROM oportunidades o
      WHERE o.contato_id = c.id
        AND o.pipeline_name ILIKE '%[fn] evento%'
      ORDER BY o.data_lead_recebido ASC NULLS LAST
      LIMIT 1
    )                                             AS data_entrada_evento

  FROM contatos c

  -- UTM Source: match exato (específico)
  -- Medium
  LEFT JOIN utm_mediums um
    ON c.utm_medium ~ '^\d+$'
    AND um.utm_medium = c.utm_medium::integer

  -- Campaign
  LEFT JOIN utm_campaigns uc
    ON c.utm_campaign ~ '^\d+$'
    AND uc.utm_campaign = c.utm_campaign::integer

  WHERE
    (
      c.tags ILIKE '%[cp] ev-jun-26%'
      OR c.tags ILIKE '%ganhou-ingresso%'
    )
    AND c.tags NOT ILIKE '%[deletar]%'
    AND c.nome NOT ILIKE '%test%'
    AND c.email NOT ILIKE '%test%'
    AND LENGTH(TRIM(COALESCE(c.nome, ''))) >= 3
    AND TRIM(COALESCE(c.nome, '')) ~ '[A-Za-zÀ-ú]'
    AND LOWER(TRIM(COALESCE(c.nome, ''))) NOT IN (
      'qweqwe', 'qwerty', 'asdf', 'asdfgh', 'zxcv',
      'aaa', 'bbb', 'xxx', 'yyy', 'zzz',
      'nome', 'name', 'fulano', 'ciclano', 'beltrano'
    )
    AND LOWER(TRIM(c.email)) NOT IN ('bguzela@gmail.com')

  ORDER BY c.id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_admin_workspace_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = p_user_id 
    AND is_active = true 
    AND role IN ('owner', 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_auth_events(p_user_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, action text, status text, ip_address inet, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    auth_audit_log.id,
    auth_audit_log.action,
    auth_audit_log.status,
    auth_audit_log.ip_address,
    auth_audit_log.created_at
  FROM auth_audit_log
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_owner_workspace_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = p_user_id 
    AND is_active = true 
    AND role = 'owner';
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_workspace_ids(p_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- This function runs with elevated privileges to bypass RLS
  -- and safely return the workspace IDs the user belongs to
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = p_user_id 
    AND is_active = true;
$function$
;

CREATE OR REPLACE FUNCTION public.get_utm_slugs_trafego()
 RETURNS TABLE(slug text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT DISTINCT slug FROM utm_sources WHERE slug IS NOT NULL;
$function$
;

CREATE OR REPLACE FUNCTION public.get_weekly_email_logs(p_schedule_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, schedule_id uuid, week_start date, report_type text, recipient_emails text[], subject text, status text, resend_message_id text, error_message text, opened_at timestamp with time zone, clicked_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT l.*
  FROM public.weekly_email_logs l
  WHERE l.schedule_id = p_schedule_id
  ORDER BY l.created_at DESC
  LIMIT p_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_id_by_ghl_location_id(p_location_id text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_workspace_id uuid;
    v_clean_location_id text;
BEGIN
    v_clean_location_id := NULLIF(TRIM(p_location_id), '');

    IF v_clean_location_id IS NOT NULL THEN
        SELECT workspace_id INTO v_workspace_id
        FROM public.ghl_integration_settings
        WHERE ghl_location_id = v_clean_location_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    -- Fallback Fase A: workspace unico/mais antigo
    IF v_workspace_id IS NULL THEN
        SELECT id INTO v_workspace_id
        FROM public.workspaces
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    RETURN v_workspace_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_workspace_members_with_profile(p_workspace_id uuid)
 RETURNS TABLE(id uuid, workspace_id uuid, user_id uuid, role text, invited_by uuid, joined_at timestamp with time zone, is_active boolean, clara_habilitado boolean, email text, full_name text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT
    wm.id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.invited_by,
    wm.joined_at,
    wm.is_active,
    wm.clara_habilitado,
    u.email::TEXT,
    COALESCE(
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      split_part(u.email::TEXT, '@', 1)
    ) AS full_name
  FROM public.workspace_members wm
  JOIN auth.users u ON u.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
    AND wm.is_active = true
    AND p_workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  ORDER BY wm.joined_at ASC;
$function$
;

CREATE OR REPLACE FUNCTION public.ghl_api_worker_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/ghl-api-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{"max_jobs": 50}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ghl_opp_reconcile_process_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/reconcile-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{
      "action": "process",
      "batch_size": 25,
      "stale_after_minutes": 30
    }'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ghl_opp_reconcile_start_nightly_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/reconcile-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{
      "action": "start",
      "mode": "write",
      "scope": "all_contacts",
      "source": "nightly",
      "auto_process": false
    }'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_ghl_opp_reconcile_run_counters(p_run_id uuid, p_processed_contacts integer DEFAULT 0, p_success_contacts integer DEFAULT 0, p_error_contacts integer DEFAULT 0, p_contacts_with_missing integer DEFAULT 0, p_contacts_with_extra integer DEFAULT 0, p_opportunities_missing integer DEFAULT 0, p_opportunities_extra integer DEFAULT 0, p_opportunities_inserted integer DEFAULT 0, p_opportunities_updated integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.ghl_opp_reconcile_runs
  SET
    processed_contacts     = processed_contacts + COALESCE(p_processed_contacts, 0),
    success_contacts       = success_contacts + COALESCE(p_success_contacts, 0),
    error_contacts         = error_contacts + COALESCE(p_error_contacts, 0),
    contacts_with_missing  = contacts_with_missing + COALESCE(p_contacts_with_missing, 0),
    contacts_with_extra    = contacts_with_extra + COALESCE(p_contacts_with_extra, 0),
    opportunities_missing  = opportunities_missing + COALESCE(p_opportunities_missing, 0),
    opportunities_extra    = opportunities_extra + COALESCE(p_opportunities_extra, 0),
    opportunities_inserted = opportunities_inserted + COALESCE(p_opportunities_inserted, 0),
    opportunities_updated  = opportunities_updated + COALESCE(p_opportunities_updated, 0),
    updated_at             = NOW()
  WHERE id = p_run_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_active_workspace_admin_any()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_active_workspace_member_any()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.workspace_members
        WHERE user_id = auth.uid()
          AND is_active = true
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role IN ('owner', 'admin')
    );
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND is_active = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_workspace_owner(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM workspace_members
        WHERE workspace_id = p_workspace_id
          AND user_id = auth.uid()
          AND is_active = true
          AND role = 'owner'
    );
$function$
;

CREATE OR REPLACE FUNCTION public.leads_pipeline_sem_compra()
 RETURNS TABLE(id uuid, nome text, email text, telefone text, status_oportunidade text, data_lead_recebido timestamp with time zone, utm_source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT DISTINCT ON (c.id)
    COALESCE(o.id, c.id)                         AS id,
    COALESCE(NULLIF(TRIM(c.nome), ''), c.email)  AS nome,
    c.email,
    c.telefone,
    o.status                                      AS status_oportunidade,
    o.data_lead_recebido,
    c.utm_source
  FROM contatos c
  LEFT JOIN oportunidades o ON o.contato_id = c.id
  WHERE
    c.tags ILIKE '%[cp] ev-jun-26%'
    AND c.tags NOT ILIKE '%[deletar]%'
    AND c.nome NOT ILIKE '%test%'
    AND c.email NOT ILIKE '%test%'
    AND LENGTH(TRIM(COALESCE(c.nome, ''))) >= 3
    AND TRIM(COALESCE(c.nome, '')) ~ '[A-Za-zÀ-ú]'
    AND LOWER(TRIM(COALESCE(c.nome, ''))) NOT IN (
      'qweqwe', 'qwerty', 'asdf', 'asdfgh', 'zxcv',
      'aaa', 'bbb', 'xxx', 'yyy', 'zzz',
      'nome', 'name', 'fulano', 'ciclano', 'beltrano'
    )
    AND LOWER(TRIM(c.email)) NOT IN (
      'bguzela@gmail.com'
    )
  ORDER BY c.id, o.data_lead_recebido DESC NULLS LAST;
$function$
;

CREATE OR REPLACE FUNCTION public.list_weekly_email_schedules()
 RETURNS TABLE(id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, name text, description text, is_active boolean, modules text[], report_type text, dimensions text[], frequency text, day_of_week integer, day_of_month integer, time_of_day time without time zone, timezone text, last_run_at timestamp with time zone, next_run_at timestamp with time zone, subject text, recipient_emails text[], reply_to text, template_key text, include_comparative boolean, include_trends boolean, clara_prompt text, use_clara_summary boolean, email_sent_count integer, last_error text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM public.weekly_email_schedules s
  ORDER BY s.created_at DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_openclaw_respostas_recentes(p_limit integer DEFAULT 50)
 RETURNS TABLE(oportunidade_id uuid, ghl_opportunity_id text, email text, request_id bigint, enfileirado_em timestamp with time zone, created_at timestamp with time zone, openclaw_notificado_em timestamp with time zone, status_code integer, error_msg text, content text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
  SELECT
    o.id AS oportunidade_id,
    o.ghl_opportunity_id,
    c.email,
    o.openclaw_request_id AS request_id,
    o.openclaw_enfileirado_em AS enfileirado_em,
    r.created AS created_at,
    o.openclaw_notificado_em,
    r.status_code,
    COALESCE(r.error_msg, o.openclaw_ultimo_erro) AS error_msg,
    LEFT(COALESCE(r.content::TEXT, ''), 1000) AS content
  FROM public.oportunidades o
  LEFT JOIN public.contatos c
    ON c.id = o.contato_id
  LEFT JOIN net._http_response r
    ON r.id = o.openclaw_request_id
  WHERE o.openclaw_request_id IS NOT NULL
     OR o.openclaw_notificado_em IS NOT NULL
  ORDER BY COALESCE(o.openclaw_enfileirado_em, o.openclaw_notificado_em) DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 50), 1);
$function$
;

CREATE OR REPLACE FUNCTION public.listar_utm_campaigns()
 RETURNS TABLE(nome text, utm_campaign text, page_code text, funnels jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nome, utm_campaign::TEXT, page_code, funnels
  FROM utm_campaigns
  ORDER BY nome, utm_campaign;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_utm_sources()
 RETURNS TABLE(nome text, utm_source text, public_code text, slug text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nome, utm_source, public_code, slug
  FROM utm_sources
  WHERE utm_source IS NOT NULL AND utm_source != ''
  ORDER BY nome, utm_source;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_utm_sources_plain()
 RETURNS TABLE(nome text, utm_source text)
 LANGUAGE sql
 STABLE
AS $function$
  SELECT nome, utm_source
  FROM utm_sources_plain
  WHERE utm_source IS NOT NULL
  ORDER BY nome;
$function$
;

CREATE OR REPLACE FUNCTION public.log_auth_event(p_user_id uuid, p_action text, p_status text, p_email text, p_ip_address inet, p_user_agent text, p_error_message text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO auth_audit_log (
    user_id,
    action,
    status,
    email,
    ip_address,
    user_agent,
    error_message,
    metadata
  ) VALUES (
    p_user_id,
    p_action,
    p_status,
    p_email,
    p_ip_address,
    p_user_agent,
    p_error_message,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_weekly_reprocess_queue_processed(p_workspace_id uuid, p_week_start date, p_report_type text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.weekly_reprocess_queue
  SET processed_at = NOW(),
      attempts     = attempts + 1
  WHERE workspace_id = p_workspace_id
    AND week_start   = p_week_start
    AND report_type  = p_report_type
    AND processed_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_ai_docs(p_query_embedding vector, p_match_threshold double precision DEFAULT 0.7, p_match_count integer DEFAULT 5)
 RETURNS TABLE(id uuid, doc_path text, chunk_index integer, content text, similarity double precision)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        adc.id,
        adc.doc_path,
        adc.chunk_index,
        adc.content,
        (1 - (adc.embedding <=> p_query_embedding))::FLOAT as similarity
    FROM ai_doc_chunks adc
    WHERE (1 - (adc.embedding <=> p_query_embedding)) > p_match_threshold
    ORDER BY adc.embedding <=> p_query_embedding
    LIMIT p_match_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pipeline_id TEXT;
  v_stage TEXT;

  PIPELINE_VENDAS_SQL CONSTANT TEXT := 'ZWuCjEXM2VDyLCx8CtGU';
  STAGE_ASSINADA CONSTANT TEXT := 'Assinada';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.op_link_do_contrato_assinado IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT (
      OLD.op_link_do_contrato_assinado IS NULL
      AND NEW.op_link_do_contrato_assinado IS NOT NULL
    ) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT o.pipeline_id, o.pipeline_stage_id
  INTO v_pipeline_id, v_stage
  FROM public.oportunidades o
  WHERE o.id = NEW.oportunidade_id
  LIMIT 1;

  IF v_pipeline_id IS DISTINCT FROM PIPELINE_VENDAS_SQL
     OR v_stage IS DISTINCT FROM STAGE_ASSINADA THEN
    RETURN NEW;
  END IF;

  PERFORM public.processar_notificacao_openclaw_contrato_assinado(
    NEW.oportunidade_id,
    NEW.op_link_do_contrato_assinado,
    NEW.data_da_assinatura_do_contrato
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO no trigger de vendas_fechamento para OpenClaw: % | SQLSTATE: %',
    SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado_por_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_opp_ghl_id TEXT;
  v_oportunidade_id UUID;
  v_link_contrato TEXT;
  v_data_assinatura DATE;

  PIPELINE_VENDAS_SQL CONSTANT TEXT := 'ZWuCjEXM2VDyLCx8CtGU';
  STAGE_ASSINADA CONSTANT TEXT := 'Assinada';
BEGIN
  v_opp_ghl_id := NULLIF(TRIM(NEW.payload->>'id'), '');
  IF v_opp_ghl_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payload->>'pipeline_id' IS DISTINCT FROM PIPELINE_VENDAS_SQL
     OR NEW.payload->>'pipleline_stage' IS DISTINCT FROM STAGE_ASSINADA THEN
    RETURN NEW;
  END IF;

  SELECT o.id
  INTO v_oportunidade_id
  FROM public.oportunidades o
  WHERE o.ghl_opportunity_id = v_opp_ghl_id
  LIMIT 1;

  IF v_oportunidade_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_link_contrato := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '');
  v_data_assinatura := NULLIF(TRIM(NEW.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE;

  IF v_link_contrato IS NULL THEN
    SELECT NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '')
    INTO v_link_contrato
    FROM public.webhooks_ghl w
    WHERE w.payload->>'id' = v_opp_ghl_id
      AND NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.op_link_do_contrato_assinado}}'), '') IS NOT NULL
    ORDER BY w.created_at DESC
    LIMIT 1;
  END IF;

  IF v_data_assinatura IS NULL THEN
    SELECT NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '')::DATE
    INTO v_data_assinatura
    FROM public.webhooks_ghl w
    WHERE w.payload->>'id' = v_opp_ghl_id
      AND NULLIF(TRIM(w.payload->'customData'->>'{{opportunity.data_da_assinatura_do_contrato}}'), '') IS NOT NULL
    ORDER BY w.created_at DESC
    LIMIT 1;
  END IF;

  PERFORM public.processar_notificacao_openclaw_contrato_assinado(
    v_oportunidade_id,
    v_link_contrato,
    v_data_assinatura
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO no trigger de stage para OpenClaw (opp_ghl=%): % | SQLSTATE: %',
    v_opp_ghl_id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.on_new_workspace_seed_ghl_mappings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO ghl_field_mappings
        (workspace_id, logical_name, ghl_field_key, field_type, variations, is_required)
    SELECT
        NEW.id,
        t.logical_name,
        t.ghl_field_key,
        t.field_type,
        t.variations,
        t.is_required
    FROM public.ghl_field_mapping_templates t
    WHERE t.name = 'Empire Default'
    ON CONFLICT (workspace_id, logical_name) DO NOTHING;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.on_new_workspace_setup_apps()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    PERFORM setup_workspace_apps_and_permissions(NEW.id);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.parse_date_flexible(date_str text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_result date;
BEGIN
    v_result := parse_safe_date(date_str);

    IF v_result IS NULL THEN
        RETURN NULL;
    END IF;

    -- Rejeitar datas impossíveis para dados de pipeline
    IF v_result < '2020-01-01'::date
       OR v_result > CURRENT_DATE + 30 THEN
        RETURN NULL;
    END IF;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.parse_safe_date(p_date_string text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_ts  timestamptz;
    v_cleaned text;
BEGIN
    IF p_date_string IS NULL OR NULLIF(TRIM(p_date_string), '') IS NULL THEN
        RETURN NULL;
    END IF;

    v_cleaned := TRIM(p_date_string);

    -- 1. ISO8601 com hora (ex: "2026-02-21T00:04:11.514Z" ou "2026-02-21")
    --    Restrito a strings que começam com YYYY- para evitar capturar D/M/YYYY pelo datestyle MDY
    IF v_cleaned ~ '^\d{4}-' THEN
        BEGIN
            RETURN (v_cleaned::timestamptz)::date;
        EXCEPTION WHEN OTHERS THEN
        END;
    END IF;

    -- 2. D/M/YYYY H:MM AM/PM — formato real dos campos customizados do GHL
    --    Ex: "7/3/2026 08:40 PM" = 7 de março de 2026
    BEGIN
        v_ts := TO_TIMESTAMP(v_cleaned, 'FMDD/FMMM/YYYY FMHH12:MI AM');
        RETURN v_ts::date;
    EXCEPTION WHEN OTHERS THEN
    END;

    -- 3. DD/MM/YYYY — data brasileira sem hora
    BEGIN
        RETURN TO_DATE(v_cleaned, 'DD/MM/YYYY');
    EXCEPTION WHEN OTHERS THEN
    END;

    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.parse_safe_date_only(p_date_string text)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    RETURN public.parse_safe_date(p_date_string);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_meta_ads_pendentes()
 RETURNS TABLE(processados integer, erros integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_raw RECORD;
    v_processados INTEGER := 0;
    v_erros INTEGER := 0;
BEGIN
    -- Loop através dos registros pendentes
    FOR v_raw IN 
        SELECT id, response_data, params, fetch_finished_at
        FROM public.meta_ads_raw_insights
        WHERE processado_em IS NULL
          AND error_details IS NULL
        ORDER BY fetch_finished_at ASC
        LIMIT 100
    LOOP
        BEGIN
            -- Aqui seria inserido o processamento real
            -- Por enquanto, apenas marca como processado
            
            UPDATE public.meta_ads_raw_insights
            SET processado_em = NOW()
            WHERE id = v_raw.id;
            
            v_processados := v_processados + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log do erro
            UPDATE public.meta_ads_raw_insights
            SET error_details = jsonb_build_object(
                'message', SQLERRM,
                'detail', SQLSTATE,
                'timestamp', NOW()
            )
            WHERE id = v_raw.id;
            
            v_erros := v_erros + 1;
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_processados, v_erros;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_meta_ads_raw(p_raw_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_raw                RECORD;
    v_insight            JSONB;
    v_actions            JSONB;
    v_insights_count     INTEGER := 0;
    v_breakdowns_count   INTEGER := 0;
    v_insight_id         UUID;
    v_workspace_id       UUID;
    v_landing_page_views INTEGER := 0;
    v_video_views        INTEGER := 0;
    v_link_clicks        INTEGER := 0;
    v_leads              INTEGER := 0;
    v_onsite_web_leads   INTEGER := 0;
    v_fb_pixel_leads     INTEGER := 0;
BEGIN
    SELECT * INTO v_raw FROM meta_ads_raw_insights WHERE id = p_raw_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('erro', 'Registro não encontrado');
    END IF;

    -- GUARDA DE SEGURANÇA: registros com breakdowns devem usar a função específica
    IF (v_raw.params->'breakdowns') IS NOT NULL AND jsonb_array_length(v_raw.params->'breakdowns') > 0 THEN
        RAISE EXCEPTION 'Raw com breakdowns deve ser processado por processar_meta_ads_raw_region_breakdown';
    END IF;

    -- Resolver workspace_id a partir dos params (preenchido pela Edge Function quando houver)
    BEGIN
        v_workspace_id := (v_raw.params->>'workspace_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_workspace_id := NULL;
    END;

    IF v_raw.response_data->'data' IS NOT NULL THEN
        FOR i IN 0..jsonb_array_length(v_raw.response_data->'data') - 1 LOOP
            v_insight := v_raw.response_data->'data'->i;
            v_actions := COALESCE(v_insight->'actions', '[]'::jsonb);

            v_landing_page_views := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "landing_page_view").value')  #>> '{}')::INTEGER, 0);
            v_video_views        := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "video_view").value')         #>> '{}')::INTEGER, 0);
            v_link_clicks        := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "link_click").value')         #>> '{}')::INTEGER, 0);
            v_leads              := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "lead").value')               #>> '{}')::INTEGER, 0);
            v_onsite_web_leads   := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "onsite_web_lead").value')    #>> '{}')::INTEGER, 0);
            v_fb_pixel_leads     := COALESCE((jsonb_path_query_first(v_actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value') #>> '{}')::INTEGER, 0);

            INSERT INTO meta_ads_insights (
                workspace_id,
                account_id,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                date,
                spend,
                impressions,
                clicks,
                reach,
                frequency,
                ctr,
                cpc,
                cpm,
                cpp,
                actions,
                conversions,
                conversion_values,
                cost_per_action_type,
                video_metrics,
                quality_ranking,
                engagement_rate_ranking,
                conversion_rate_ranking,
                raw_insight_id,
                fetched_at,
                landing_page_views,
                video_views,
                link_clicks,
                leads,
                onsite_web_leads,
                fb_pixel_leads
            ) VALUES (
                v_workspace_id,
                v_raw.params->>'account_id',
                v_insight->>'campaign_id',
                v_insight->>'campaign_name',
                v_insight->>'adset_id',
                v_insight->>'adset_name',
                v_insight->>'ad_id',
                v_insight->>'ad_name',
                (v_insight->>'date_start')::DATE,
                COALESCE((v_insight->>'spend')::DECIMAL, 0),
                COALESCE((v_insight->>'impressions')::INTEGER, 0),
                COALESCE((v_insight->>'clicks')::INTEGER, 0),
                COALESCE((v_insight->>'reach')::INTEGER, 0),
                (v_insight->>'frequency')::DECIMAL,
                (v_insight->>'ctr')::DECIMAL,
                (v_insight->>'cpc')::DECIMAL,
                (v_insight->>'cpm')::DECIMAL,
                (v_insight->>'cpp')::DECIMAL,
                v_actions,
                COALESCE(v_insight->'conversions', '[]'::jsonb),
                COALESCE(v_insight->'conversion_values', '[]'::jsonb),
                COALESCE(v_insight->'cost_per_action_type', '[]'::jsonb),
                jsonb_build_object(
                    'p25',      v_insight->'video_p25_watched_actions',
                    'p50',      v_insight->'video_p50_watched_actions',
                    'p75',      v_insight->'video_p75_watched_actions',
                    'p95',      v_insight->'video_p95_watched_actions',
                    'p100',     v_insight->'video_p100_watched_actions',
                    'avg_time', v_insight->'video_avg_time_watched_actions'
                ),
                v_insight->>'quality_ranking',
                v_insight->>'engagement_rate_ranking',
                v_insight->>'conversion_rate_ranking',
                p_raw_id,
                v_raw.fetch_finished_at,
                v_landing_page_views,
                v_video_views,
                v_link_clicks,
                v_leads,
                v_onsite_web_leads,
                v_fb_pixel_leads
            )
            ON CONFLICT (ad_id, date) DO UPDATE SET
                workspace_id            = COALESCE(EXCLUDED.workspace_id, meta_ads_insights.workspace_id),
                campaign_name           = EXCLUDED.campaign_name,
                adset_name              = EXCLUDED.adset_name,
                ad_name                 = EXCLUDED.ad_name,
                spend                   = EXCLUDED.spend,
                impressions             = EXCLUDED.impressions,
                clicks                  = EXCLUDED.clicks,
                reach                   = EXCLUDED.reach,
                frequency               = EXCLUDED.frequency,
                ctr                     = EXCLUDED.ctr,
                cpc                     = EXCLUDED.cpc,
                cpm                     = EXCLUDED.cpm,
                cpp                     = EXCLUDED.cpp,
                actions                 = EXCLUDED.actions,
                conversions             = EXCLUDED.conversions,
                conversion_values       = EXCLUDED.conversion_values,
                cost_per_action_type    = EXCLUDED.cost_per_action_type,
                video_metrics           = EXCLUDED.video_metrics,
                quality_ranking         = EXCLUDED.quality_ranking,
                engagement_rate_ranking = EXCLUDED.engagement_rate_ranking,
                conversion_rate_ranking = EXCLUDED.conversion_rate_ranking,
                landing_page_views      = EXCLUDED.landing_page_views,
                video_views             = EXCLUDED.video_views,
                link_clicks             = EXCLUDED.link_clicks,
                leads                   = EXCLUDED.leads,
                onsite_web_leads        = EXCLUDED.onsite_web_leads,
                fb_pixel_leads          = EXCLUDED.fb_pixel_leads,
                raw_insight_id          = EXCLUDED.raw_insight_id,
                fetched_at              = EXCLUDED.fetched_at
            RETURNING id INTO v_insight_id;

            v_insights_count := v_insights_count + 1;

            IF v_insight->>'age' IS NOT NULL
               OR v_insight->>'gender' IS NOT NULL
               OR v_insight->>'publisher_platform' IS NOT NULL THEN
                INSERT INTO meta_ads_insights_breakdowns (
                    workspace_id,
                    insights_id,
                    age,
                    gender,
                    country,
                    region,
                    impression_device,
                    publisher_platform,
                    platform_position,
                    spend,
                    impressions,
                    clicks,
                    reach
                ) VALUES (
                    v_workspace_id,
                    v_insight_id,
                    v_insight->>'age',
                    v_insight->>'gender',
                    v_insight->>'country',
                    v_insight->>'region',
                    v_insight->>'impression_device',
                    v_insight->>'publisher_platform',
                    v_insight->>'platform_position',
                    COALESCE((v_insight->>'spend')::DECIMAL, 0),
                    COALESCE((v_insight->>'impressions')::INTEGER, 0),
                    COALESCE((v_insight->>'clicks')::INTEGER, 0),
                    COALESCE((v_insight->>'reach')::INTEGER, 0)
                );
                v_breakdowns_count := v_breakdowns_count + 1;
            END IF;
        END LOOP;
    END IF;

    UPDATE meta_ads_raw_insights
    SET processado_em = now(),
        workspace_id  = COALESCE(meta_ads_raw_insights.workspace_id, v_workspace_id)
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_meta_ads_raw_region_breakdown(p_raw_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_raw              RECORD;
    v_rec              RECORD;
    v_insights_count   INTEGER := 0;
    v_breakdowns_count INTEGER := 0;
    v_insight_id       UUID;
    v_workspace_id     UUID;
    v_inserted_rows    INTEGER;
BEGIN
    SELECT * INTO v_raw FROM meta_ads_raw_insights WHERE id = p_raw_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('erro', 'Registro não encontrado');
    END IF;

    IF (v_raw.params->'breakdowns') IS NULL OR jsonb_array_length(v_raw.params->'breakdowns') = 0 THEN
        RETURN jsonb_build_object(
            'erro',
            'Registro raw não possui breakdowns. Use processar_meta_ads_raw para o sync padrão.'
        );
    END IF;

    IF v_raw.response_data->'data' IS NULL OR jsonb_array_length(v_raw.response_data->'data') = 0 THEN
        UPDATE meta_ads_raw_insights SET processado_em = now() WHERE id = p_raw_id;
        RETURN jsonb_build_object(
            'insights_inseridos',   0,
            'breakdowns_inseridos', 0
        );
    END IF;

    BEGIN
        v_workspace_id := (v_raw.params->>'workspace_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_workspace_id := NULL;
    END;

    FOR v_rec IN
        WITH exploded AS (
            SELECT
                v_raw.params->>'account_id'                              AS account_id,
                v_insight->>'campaign_id'                                AS campaign_id,
                v_insight->>'campaign_name'                              AS campaign_name,
                v_insight->>'adset_id'                                   AS adset_id,
                v_insight->>'adset_name'                                 AS adset_name,
                v_insight->>'ad_id'                                      AS ad_id,
                v_insight->>'ad_name'                                    AS ad_name,
                (v_insight->>'date_start')::DATE                         AS dt,
                COALESCE((v_insight->>'spend')::DECIMAL, 0)              AS spend,
                COALESCE((v_insight->>'impressions')::INTEGER, 0)        AS impressions,
                COALESCE((v_insight->>'clicks')::INTEGER, 0)             AS clicks,
                COALESCE((v_insight->>'reach')::INTEGER, 0)              AS reach,
                COALESCE(v_insight->'actions', '[]'::jsonb)              AS actions
            FROM jsonb_array_elements(v_raw.response_data->'data') AS v_insight
        ),
        actions_extracted AS (
            SELECT
                account_id,
                campaign_id,
                campaign_name,
                adset_id,
                adset_name,
                ad_id,
                ad_name,
                dt,
                spend,
                impressions,
                clicks,
                reach,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "landing_page_view").value')  #>> '{}')::INTEGER, 0) AS landing_page_views,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "video_view").value')         #>> '{}')::INTEGER, 0) AS video_views,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "link_click").value')         #>> '{}')::INTEGER, 0) AS link_clicks,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "lead").value')               #>> '{}')::INTEGER, 0) AS leads,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "onsite_web_lead").value')    #>> '{}')::INTEGER, 0) AS onsite_web_leads,
                COALESCE((jsonb_path_query_first(actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value') #>> '{}')::INTEGER, 0) AS fb_pixel_leads
            FROM exploded
        )
        SELECT
            ad_id,
            dt,
            MIN(account_id)     AS account_id,
            MIN(campaign_id)    AS campaign_id,
            MIN(campaign_name)  AS campaign_name,
            MIN(adset_id)       AS adset_id,
            MIN(adset_name)     AS adset_name,
            MIN(ad_name)        AS ad_name,
            SUM(spend)          AS spend,
            SUM(impressions)    AS impressions,
            SUM(clicks)         AS clicks,
            SUM(reach)          AS reach,
            SUM(landing_page_views) AS landing_page_views,
            SUM(video_views)        AS video_views,
            SUM(link_clicks)        AS link_clicks,
            SUM(leads)              AS leads,
            SUM(onsite_web_leads)   AS onsite_web_leads,
            SUM(fb_pixel_leads)     AS fb_pixel_leads
        FROM actions_extracted
        GROUP BY ad_id, dt
    LOOP
        INSERT INTO meta_ads_insights (
            workspace_id,
            account_id,
            campaign_id,
            campaign_name,
            adset_id,
            adset_name,
            ad_id,
            ad_name,
            date,
            spend,
            impressions,
            clicks,
            reach,
            actions,
            conversions,
            conversion_values,
            cost_per_action_type,
            video_metrics,
            quality_ranking,
            engagement_rate_ranking,
            conversion_rate_ranking,
            raw_insight_id,
            fetched_at,
            landing_page_views,
            video_views,
            link_clicks,
            leads,
            onsite_web_leads,
            fb_pixel_leads
        ) VALUES (
            v_workspace_id,
            v_rec.account_id,
            v_rec.campaign_id,
            v_rec.campaign_name,
            v_rec.adset_id,
            v_rec.adset_name,
            v_rec.ad_id,
            v_rec.ad_name,
            v_rec.dt,
            v_rec.spend,
            v_rec.impressions,
            v_rec.clicks,
            v_rec.reach,
            '[]'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            '{}'::jsonb,
            NULL,
            NULL,
            NULL,
            p_raw_id,
            v_raw.fetch_finished_at,
            v_rec.landing_page_views,
            v_rec.video_views,
            v_rec.link_clicks,
            v_rec.leads,
            v_rec.onsite_web_leads,
            v_rec.fb_pixel_leads
        )
        ON CONFLICT (ad_id, date) DO UPDATE SET
            workspace_id            = COALESCE(EXCLUDED.workspace_id, meta_ads_insights.workspace_id),
            campaign_name           = EXCLUDED.campaign_name,
            adset_name              = EXCLUDED.adset_name,
            ad_name                 = EXCLUDED.ad_name,
            spend                   = EXCLUDED.spend,
            impressions             = EXCLUDED.impressions,
            clicks                  = EXCLUDED.clicks,
            reach                   = EXCLUDED.reach,
            landing_page_views      = EXCLUDED.landing_page_views,
            video_views             = EXCLUDED.video_views,
            link_clicks             = EXCLUDED.link_clicks,
            leads                   = EXCLUDED.leads,
            onsite_web_leads        = EXCLUDED.onsite_web_leads,
            fb_pixel_leads          = EXCLUDED.fb_pixel_leads,
            frequency               = COALESCE(EXCLUDED.frequency, meta_ads_insights.frequency),
            ctr                     = COALESCE(EXCLUDED.ctr, meta_ads_insights.ctr),
            cpc                     = COALESCE(EXCLUDED.cpc, meta_ads_insights.cpc),
            cpm                     = COALESCE(EXCLUDED.cpm, meta_ads_insights.cpm),
            cpp                     = COALESCE(EXCLUDED.cpp, meta_ads_insights.cpp),
            actions                 = COALESCE(NULLIF(EXCLUDED.actions, '[]'::jsonb), meta_ads_insights.actions),
            conversions             = COALESCE(NULLIF(EXCLUDED.conversions, '[]'::jsonb), meta_ads_insights.conversions),
            conversion_values       = COALESCE(NULLIF(EXCLUDED.conversion_values, '[]'::jsonb), meta_ads_insights.conversion_values),
            cost_per_action_type    = COALESCE(NULLIF(EXCLUDED.cost_per_action_type, '[]'::jsonb), meta_ads_insights.cost_per_action_type),
            video_metrics           = COALESCE(NULLIF(EXCLUDED.video_metrics, '{}'::jsonb), meta_ads_insights.video_metrics),
            quality_ranking         = COALESCE(EXCLUDED.quality_ranking, meta_ads_insights.quality_ranking),
            engagement_rate_ranking = COALESCE(EXCLUDED.engagement_rate_ranking, meta_ads_insights.engagement_rate_ranking),
            conversion_rate_ranking = COALESCE(EXCLUDED.conversion_rate_ranking, meta_ads_insights.conversion_rate_ranking),
            raw_insight_id          = EXCLUDED.raw_insight_id,
            fetched_at              = EXCLUDED.fetched_at
        RETURNING id INTO v_insight_id;

        v_insights_count := v_insights_count + 1;

        INSERT INTO meta_ads_insights_breakdowns (
            workspace_id,
            insights_id,
            breakdown_type,
            country,
            region,
            spend,
            impressions,
            clicks,
            reach
        )
        SELECT
            v_workspace_id,
            v_insight_id,
            'region',
            v_insight2->>'country',
            v_insight2->>'region',
            COALESCE((v_insight2->>'spend')::DECIMAL, 0),
            COALESCE((v_insight2->>'impressions')::INTEGER, 0),
            COALESCE((v_insight2->>'clicks')::INTEGER, 0),
            COALESCE((v_insight2->>'reach')::INTEGER, 0)
        FROM jsonb_array_elements(v_raw.response_data->'data') AS v_insight2
        WHERE v_insight2->>'ad_id' = v_rec.ad_id
          AND (v_insight2->>'date_start')::DATE = v_rec.dt
          AND v_insight2->>'region' IS NOT NULL
        ON CONFLICT (insights_id, region, country) DO UPDATE SET
            workspace_id   = COALESCE(EXCLUDED.workspace_id, meta_ads_insights_breakdowns.workspace_id),
            breakdown_type = EXCLUDED.breakdown_type,
            spend          = EXCLUDED.spend,
            impressions    = EXCLUDED.impressions,
            clicks         = EXCLUDED.clicks,
            reach          = EXCLUDED.reach;

        GET DIAGNOSTICS v_inserted_rows = ROW_COUNT;
        v_breakdowns_count := v_breakdowns_count + v_inserted_rows;
    END LOOP;

    UPDATE meta_ads_raw_insights
    SET processado_em = now(),
        workspace_id  = COALESCE(meta_ads_raw_insights.workspace_id, v_workspace_id)
    WHERE id = p_raw_id;

    RETURN jsonb_build_object(
        'insights_inseridos',   v_insights_count,
        'breakdowns_inseridos', v_breakdowns_count
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_notificacao_openclaw_contrato_assinado(p_oportunidade_id uuid, p_link_contrato text DEFAULT NULL::text, p_data_assinatura date DEFAULT NULL::date)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE
  v_opp_id UUID;
  v_opp_ghl_id TEXT;
  v_pipeline_name TEXT;
  v_notificado_em TIMESTAMPTZ;
  v_contato_id UUID;

  v_request_id_pendente BIGINT;
  v_enfileirado_em TIMESTAMPTZ;
  v_resposta_em TIMESTAMPTZ;
  v_resposta_status INTEGER;
  v_resposta_erro TEXT;
  v_resposta_conteudo TEXT;

  v_nome TEXT;
  v_email TEXT;
  v_telefone TEXT;

  v_nome_contratante TEXT;
  v_cpf_cnpj TEXT;
  v_logradouro TEXT;
  v_numero_endereco TEXT;
  v_complemento TEXT;
  v_bairro TEXT;
  v_municipio TEXT;
  v_estado_uf TEXT;
  v_cep TEXT;
  v_valor_entrada DECIMAL;
  v_numero_parcelas INTEGER;
  v_valor_parcela DECIMAL;
  v_forma_pagamento TEXT;
  v_produto_vendido TEXT;
  v_data_pagamento TIMESTAMPTZ;
  v_link_contrato_db TEXT;
  v_data_assinatura_db DATE;
  v_vencimentos TEXT;
  v_observacoes TEXT;

  v_link_contrato TEXT;
  v_data_assinatura DATE;
  v_faturado DECIMAL;
  v_payload JSONB;
  v_request_id BIGINT;
  v_auth_header TEXT;
BEGIN
  IF p_oportunidade_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT
    o.id,
    o.ghl_opportunity_id,
    o.pipeline_name,
    o.openclaw_notificado_em,
    o.contato_id,
    o.openclaw_request_id,
    o.openclaw_enfileirado_em
  INTO
    v_opp_id,
    v_opp_ghl_id,
    v_pipeline_name,
    v_notificado_em,
    v_contato_id,
    v_request_id_pendente,
    v_enfileirado_em
  FROM public.oportunidades o
  WHERE o.id = p_oportunidade_id
  FOR UPDATE;

  IF v_opp_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_notificado_em IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  IF v_request_id_pendente IS NOT NULL THEN
    SELECT
      r.created,
      r.status_code,
      NULLIF(TRIM(r.error_msg), ''),
      NULLIF(LEFT(TRIM(COALESCE(r.content::TEXT, '')), 1000), '')
    INTO
      v_resposta_em,
      v_resposta_status,
      v_resposta_erro,
      v_resposta_conteudo
    FROM net._http_response r
    WHERE r.id = v_request_id_pendente
    LIMIT 1;

    IF FOUND THEN
      IF v_resposta_status BETWEEN 200 AND 299 AND v_resposta_erro IS NULL THEN
        UPDATE public.oportunidades
        SET openclaw_notificado_em = COALESCE(v_resposta_em, NOW()),
            openclaw_ultima_resposta_em = COALESCE(v_resposta_em, NOW()),
            openclaw_ultimo_status_code = v_resposta_status,
            openclaw_ultimo_erro = NULL
        WHERE id = v_opp_id;

        RETURN FALSE;
      END IF;

      IF v_resposta_status IS NULL AND v_resposta_erro IS NULL THEN
        IF COALESCE(v_enfileirado_em, v_resposta_em, NOW()) > NOW() - INTERVAL '10 minutes' THEN
          RETURN FALSE;
        END IF;

        UPDATE public.oportunidades
        SET openclaw_request_id = NULL,
            openclaw_enfileirado_em = NULL,
            openclaw_ultima_resposta_em = NOW(),
            openclaw_ultimo_status_code = NULL,
            openclaw_ultimo_erro = 'Timeout aguardando resposta do pg_net para o OpenClaw'
        WHERE id = v_opp_id;
      ELSE
        UPDATE public.oportunidades
        SET openclaw_request_id = NULL,
            openclaw_enfileirado_em = NULL,
            openclaw_ultima_resposta_em = COALESCE(v_resposta_em, NOW()),
            openclaw_ultimo_status_code = v_resposta_status,
            openclaw_ultimo_erro = COALESCE(v_resposta_erro, v_resposta_conteudo, 'OpenClaw respondeu sem sucesso')
        WHERE id = v_opp_id;
      END IF;
    ELSIF v_enfileirado_em IS NOT NULL AND v_enfileirado_em > NOW() - INTERVAL '10 minutes' THEN
      RETURN FALSE;
    ELSE
      UPDATE public.oportunidades
      SET openclaw_request_id = NULL,
          openclaw_enfileirado_em = NULL,
          openclaw_ultima_resposta_em = NOW(),
          openclaw_ultimo_status_code = NULL,
          openclaw_ultimo_erro = 'Timeout aguardando resposta do pg_net para o OpenClaw'
      WHERE id = v_opp_id;
    END IF;
  END IF;

  SELECT c.nome, c.email, c.telefone
  INTO v_nome, v_email, v_telefone
  FROM public.contatos c
  WHERE c.id = v_contato_id
  LIMIT 1;

  SELECT
    vf.nome_contratante,
    vf.cpf_cnpj_contratante,
    vf.logradouro_rua_avenida,
    vf.numero_endereco,
    vf.complemento_endereco,
    vf.bairro,
    vf.municipio,
    vf.estado_uf,
    vf.cep,
    vf.valor_entrada,
    vf.numero_parcelas,
    vf.valor_parcela,
    vf.forma_pagamento,
    vf.produto_vendido,
    vf.data_pagamento_entrada,
    vf.op_link_do_contrato_assinado,
    vf.data_da_assinatura_do_contrato,
    vf.op_vencimentos_parcelas,
    vf.observacoes_venda
  INTO
    v_nome_contratante,
    v_cpf_cnpj,
    v_logradouro,
    v_numero_endereco,
    v_complemento,
    v_bairro,
    v_municipio,
    v_estado_uf,
    v_cep,
    v_valor_entrada,
    v_numero_parcelas,
    v_valor_parcela,
    v_forma_pagamento,
    v_produto_vendido,
    v_data_pagamento,
    v_link_contrato_db,
    v_data_assinatura_db,
    v_vencimentos,
    v_observacoes
  FROM public.vendas_fechamento vf
  WHERE vf.oportunidade_id = p_oportunidade_id
  LIMIT 1;

  v_link_contrato := COALESCE(
    NULLIF(TRIM(p_link_contrato), ''),
    NULLIF(TRIM(v_link_contrato_db), '')
  );
  v_data_assinatura := COALESCE(p_data_assinatura, v_data_assinatura_db);

  IF v_link_contrato IS NULL THEN
    RETURN FALSE;
  END IF;

  v_faturado := COALESCE(v_valor_entrada, 0)
              + (COALESCE(v_numero_parcelas, 0) * COALESCE(v_valor_parcela, 0));

  v_payload := jsonb_build_object(
    'evento',                   'contrato_assinado',
    'timestamp',                TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),

    'nome',                     v_nome,
    'email',                    v_email,
    'telefone',                 v_telefone,
    'ghl_opportunity_id',       v_opp_ghl_id,
    'pipeline',                 v_pipeline_name,

    'nome_contratante',         v_nome_contratante,
    'cpf_cnpj_contratante',     v_cpf_cnpj,

    'logradouro',               v_logradouro,
    'numero_endereco',          v_numero_endereco,
    'complemento',              v_complemento,
    'bairro',                   v_bairro,
    'municipio',                v_municipio,
    'estado_uf',                v_estado_uf,
    'cep',                      v_cep,

    'valor_faturado',           v_faturado,
    'valor_entrada',            v_valor_entrada,
    'numero_parcelas',          v_numero_parcelas,
    'valor_parcela',            v_valor_parcela,
    'forma_pagamento',          v_forma_pagamento,
    'produto_vendido',          v_produto_vendido,
    'data_pagamento_entrada',   CASE
                                  WHEN v_data_pagamento IS NOT NULL
                                  THEN TO_CHAR(v_data_pagamento AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
                                  ELSE NULL
                                END,

    'link_contrato_assinado',   v_link_contrato,
    'data_assinatura_contrato', CASE
                                  WHEN v_data_assinatura IS NOT NULL
                                  THEN TO_CHAR(v_data_assinatura, 'DD/MM/YYYY')
                                  ELSE NULL
                                END,

    'vencimentos_parcelas',     v_vencimentos,
    'observacoes',              v_observacoes
  );

  -- ── Disparo 1: OpenClaw ──────────────────────────────────────────────────────
  SELECT net.http_post(
    url                  := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers              := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body                 := v_payload,
    timeout_milliseconds := 30000
  ) INTO v_request_id;

  UPDATE public.oportunidades
  SET openclaw_request_id = v_request_id,
      openclaw_enfileirado_em = NOW(),
      openclaw_ultima_resposta_em = NULL,
      openclaw_ultimo_status_code = NULL,
      openclaw_ultimo_erro = NULL
  WHERE id = v_opp_id;

  RAISE NOTICE 'OpenClaw enfileirado — request_id: %, opp: %', v_request_id, v_opp_ghl_id;

  -- ── Disparo 2: Email via Resend ──────────────────────────────────────────────
  BEGIN
    -- Lê o anon_key da tabela app_config (padrão do projeto)
    SELECT 'Bearer ' || value INTO v_auth_header
    FROM public.app_config
    WHERE key = 'supabase_anon_key'
    LIMIT 1;

    PERFORM net.http_post(
      url     := '' || get_secret('supabase_url') || '/functions/v1/enviar-email-contrato-assinado',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', COALESCE(v_auth_header, '')
      ),
      body    := v_payload
    );

    RAISE NOTICE 'Email contrato assinado enfileirado — opp: %', v_opp_ghl_id;
  EXCEPTION WHEN OTHERS THEN
    -- Não bloqueia o fluxo principal se o email falhar
    RAISE WARNING 'Erro ao enfileirar email contrato assinado (opp=%): %', v_opp_ghl_id, SQLERRM;
  END;

  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ERRO ao processar OpenClaw (opp=%): % | SQLSTATE: %',
    p_oportunidade_id, SQLERRM, SQLSTATE;
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_openclaw_contrato_assinado_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sync JSONB;
  v_retry JSONB;
BEGIN
  v_sync := public.sincronizar_status_openclaw_contrato_assinado(200);
  v_retry := public.reenfileirar_openclaw_contrato_assinado_pendentes(25);

  RETURN 'sync=' || v_sync::TEXT || ' | retry=' || v_retry::TEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_task_ghl(p_webhook_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_payload          JSONB;
  v_type             TEXT;
  v_task_id          TEXT;
  v_contact_ghl_id   TEXT;
  v_title            TEXT;
  v_due_date         TIMESTAMPTZ;
  v_completed        BOOLEAN;
  v_assigned_to      TEXT;
  v_task_type        TEXT;
  v_contato_id       UUID;
BEGIN
  SELECT payload INTO v_payload
  FROM webhooks_ghl WHERE id = p_webhook_id;

  IF v_payload IS NULL THEN RETURN; END IF;

  v_type := v_payload->>'type';

  -- Só processa eventos de Task
  IF v_type NOT IN ('TaskCreate', 'TaskUpdate', 'TaskComplete', 'TaskDelete') THEN
    RETURN;
  END IF;

  -- GHL usa 'id' ou 'taskId' dependendo da versão do webhook
  v_task_id        := COALESCE(NULLIF(TRIM(v_payload->>'taskId'), ''), NULLIF(TRIM(v_payload->>'id'), ''));
  v_contact_ghl_id := NULLIF(TRIM(v_payload->>'contactId'), '');
  v_title          := NULLIF(TRIM(v_payload->>'title'), '');
  v_assigned_to    := NULLIF(TRIM(v_payload->>'assignedTo'), '');
  v_task_type      := COALESCE(NULLIF(TRIM(v_payload->>'taskType'), ''), 'Call');
  v_completed      := COALESCE((v_payload->>'completed')::BOOLEAN, false);

  -- Tenta parsear dueDate em múltiplos formatos
  BEGIN
    v_due_date := (v_payload->>'dueDate')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    v_due_date := NULL;
  END;

  IF v_task_id IS NULL THEN RETURN; END IF;

  -- Resolve contato_id pelo ghl_id do contato
  IF v_contact_ghl_id IS NOT NULL THEN
    SELECT id INTO v_contato_id
    FROM contatos WHERE ghl_id = v_contact_ghl_id
    LIMIT 1;
  END IF;

  -- TaskDelete
  IF v_type = 'TaskDelete' THEN
    UPDATE ghl_tasks SET deleted = true, updated_at = now()
    WHERE ghl_task_id = v_task_id;
    RETURN;
  END IF;

  -- TaskComplete
  IF v_type = 'TaskComplete' THEN
    UPDATE ghl_tasks SET completed = true, updated_at = now()
    WHERE ghl_task_id = v_task_id;
    RETURN;
  END IF;

  -- TaskCreate / TaskUpdate — upsert
  INSERT INTO ghl_tasks (
    ghl_task_id, contact_ghl_id, contato_id, title,
    due_date, completed, assigned_to_ghl_id, task_type
  ) VALUES (
    v_task_id, v_contact_ghl_id, v_contato_id, v_title,
    v_due_date, v_completed, v_assigned_to, v_task_type
  )
  ON CONFLICT (ghl_task_id) DO UPDATE SET
    title               = EXCLUDED.title,
    due_date            = EXCLUDED.due_date,
    completed           = EXCLUDED.completed,
    contato_id          = COALESCE(EXCLUDED.contato_id, ghl_tasks.contato_id),
    contact_ghl_id      = COALESCE(EXCLUDED.contact_ghl_id, ghl_tasks.contact_ghl_id),
    assigned_to_ghl_id  = EXCLUDED.assigned_to_ghl_id,
    task_type           = EXCLUDED.task_type,
    deleted             = false,
    updated_at          = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_todos_meta_ads_pendentes()
 RETURNS TABLE(registros_processados integer, total_insights integer, total_breakdowns integer, erros integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_raw RECORD;
    v_result RECORD;
    v_registros INTEGER := 0;
    v_total_insights INTEGER := 0;
    v_total_breakdowns INTEGER := 0;
    v_erros INTEGER := 0;
BEGIN
    -- Loop através dos registros pendentes
    FOR v_raw IN 
        SELECT id
        FROM public.meta_ads_raw_insights
        WHERE processado_em IS NULL
          AND error_details IS NULL
        ORDER BY fetch_finished_at ASC
        LIMIT 100
    LOOP
        BEGIN
            SELECT * INTO v_result 
            FROM processar_meta_ads_raw(v_raw.id);
            
            IF v_result.status = 'success' THEN
                v_registros := v_registros + 1;
                v_total_insights := v_total_insights + v_result.insights_inseridos;
                v_total_breakdowns := v_total_breakdowns + v_result.breakdowns_inseridos;
            ELSIF v_result.status IN ('error', 'not_found', 'has_error') THEN
                v_erros := v_erros + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            v_erros := v_erros + 1;
            RAISE WARNING 'Erro ao processar raw %: %', v_raw.id, SQLERRM;
        END;
    END LOOP;
    
    RETURN QUERY SELECT v_registros, v_total_insights, v_total_breakdowns, v_erros;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.processar_webhooks_pendentes()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_webhook RECORD;
    v_result RECORD;
    v_contador INTEGER := 0;
BEGIN
    -- Loop através dos webhooks não processados
    FOR v_webhook IN 
        SELECT id, payload 
        FROM webhooks_ghl 
        WHERE processado_em IS NULL 
        ORDER BY created_at ASC
        LIMIT 100  -- Processa em lotes de 100
    LOOP
        BEGIN
            -- Chama função de extração para este webhook específico
            SELECT * INTO v_result FROM extrair_dados_ghl(v_webhook.id);
            
            -- Marca como processado
            UPDATE webhooks_ghl 
            SET processado_em = NOW() 
            WHERE id = v_webhook.id;
            
            v_contador := v_contador + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Log do erro mas continua processando os outros
            RAISE WARNING 'Erro ao processar webhook %: %', v_webhook.id, SQLERRM;
            
            -- Marca como processado mesmo com erro para não travar
            UPDATE webhooks_ghl 
            SET processado_em = NOW() 
            WHERE id = v_webhook.id;
        END;
    END LOOP;
    
    IF v_contador > 0 THEN
        RAISE LOG 'processar_webhooks_pendentes: % webhooks processados', v_contador;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.raise_unless_workspace_member(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_workspace_member(p_workspace_id) THEN
        RAISE EXCEPTION 'Acesso negado ao workspace %', p_workspace_id
            USING ERRCODE = 'insufficient_privilege';
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recalcular_discagem_scores()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _agora          TIMESTAMPTZ := now();
  _hoje_sp_inicio TIMESTAMPTZ;
  _hoje_sp_fim    TIMESTAMPTZ;
BEGIN
  _hoje_sp_inicio := date_trunc('day', _agora AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  _hoje_sp_fim    := _hoje_sp_inicio + INTERVAL '1 day' - INTERVAL '1 second';

  -- ── BLOCO DE LIMPEZA ─────────────────────────────────────────────────────────

  DELETE FROM discagem_scores ds
  WHERE EXISTS (
    SELECT 1 FROM comunicacoes c
    WHERE c.contato_id = ds.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao >= _hoje_sp_inicio
      AND c.data_comunicacao <= _hoje_sp_fim
  );

  DELETE FROM discagem_scores ds
  USING oportunidades o
  LEFT JOIN contatos ct2 ON ct2.id = o.contato_id
  WHERE o.id = ds.oportunidade_id
    AND (
      o.status != 'open'
      OR o.pipeline_id IS NULL
      OR o.pipeline_name NOT IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
      OR ct2.workspace_id IS NULL
    );

  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (
    SELECT 1 FROM oportunidades o WHERE o.id = ds.oportunidade_id
  );

  DELETE FROM discagem_scores ds
  WHERE (
    SELECT COUNT(*)
    FROM comunicacoes c
    WHERE c.contato_id = ds.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) >= 7;

  -- ── UPSERT COM SCORE COMPOSTO 0-1000 ─────────────────────────────────────────

  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, workspace_id, escopo, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte, score_qualificacao,
    camada, numero_tentativa, canal_sugerido,
    data_retorno_combinado,
    data_entrada_lead, data_retorno_previsto,
    updated_at
  )
  SELECT
    o.id             AS oportunidade_id,
    o.contato_id     AS contato_id,
    ct2.workspace_id AS workspace_id,
    CASE WHEN o.pipeline_name = 'Recuperação' THEN 'recuperacao' ELSE 'pre_vendas' END AS escopo,

    CASE
      WHEN cam.camada = 'horario_marcado' THEN
        GREATEST(900, 1000 - GREATEST(0,
          ROUND(EXTRACT(EPOCH FROM (_agora - task_hoje.due_date)) / 3600)::INTEGER * 10
        ))
      WHEN cam.camada = 'lead_novo' THEN
        GREATEST(0, 899 - ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 96)::INTEGER)
      ELSE
        ROUND(
          (comp.sinal_resposta      * 0.40) +
          (comp.recencia            * 0.30) +
          (comp.qualificacao_mql    * 0.15) +
          (comp.engajamento_canal   * 0.10) +
          (comp.fadiga              * 0.05)
        )
    END::INTEGER                                        AS score,

    CASE cam.camada
      WHEN 'respondeu'       THEN 'ligue_agora'
      WHEN 'horario_marcado' THEN 'ligue_agora'
      WHEN 'lead_novo'       THEN 'ligue_hoje'
      ELSE 'mensagem'
    END                                                 AS estado,

    rz.razao                                            AS razao,

    CASE
      WHEN cam.camada IN ('horario_marcado', 'lead_novo') THEN 'urgencia'
      WHEN comp.sinal_resposta >= GREATEST(comp.recencia, comp.qualificacao_mql, comp.engajamento_canal) THEN 'sinal_quente'
      WHEN comp.recencia >= GREATEST(comp.qualificacao_mql, comp.engajamento_canal) THEN 'urgencia'
      ELSE 'tentativas'
    END                                                 AS componente_dom,

    comp.sinal_resposta::INTEGER                        AS score_sinal,
    comp.recencia::INTEGER                              AS score_urgencia,
    comp.fadiga::INTEGER                                AS score_tentativas,
    comp.engajamento_canal::INTEGER                     AS score_fonte,
    comp.qualificacao_mql::INTEGER                      AS score_qualificacao,

    cam.camada                                          AS camada,
    COALESCE(tent14.n, 0)                               AS numero_tentativa,
    cam.canal_sugerido                                  AS canal_sugerido,

    ds_prev.data_retorno_combinado                      AS data_retorno_combinado,

    o.data_lead_recebido                                AS data_entrada_lead,
    NULL::TIMESTAMPTZ                                   AS data_retorno_previsto,

    _agora                                              AS updated_at

  FROM oportunidades o
  JOIN contatos ct2 ON ct2.id = o.contato_id
  LEFT JOIN discagem_scores ds_prev ON ds_prev.oportunidade_id = o.id

  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_inbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
  ) inb ON true

  LEFT JOIN LATERAL (
    SELECT MAX(c.data_comunicacao) AS last_outbound
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
  ) out ON true

  LEFT JOIN LATERAL (
    SELECT o2.id
    FROM oportunidades o2
    WHERE o2.contato_id = o.contato_id
      AND o2.status = 'open'
      AND o2.pipeline_id IS NOT NULL
      AND o2.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
    ORDER BY o2.data_lead_recebido DESC NULLS LAST, o2.id DESC
    LIMIT 1
  ) opp_mais_recente ON true

  LEFT JOIN LATERAL (
    SELECT
      t.title     AS task_title,
      t.due_date  AS due_date
    FROM ghl_tasks t
    WHERE t.contato_id = o.contato_id
      AND t.completed = false
      AND (t.deleted = false OR t.deleted IS NULL)
      AND t.due_date <= _hoje_sp_fim
      AND t.due_date >= (_agora - INTERVAL '48 hours')
      AND o.id = opp_mais_recente.id
      AND (
        LOWER(t.title) LIKE '%ligar%'
        OR LOWER(t.title) LIKE '%call%'
        OR LOWER(t.title) LIKE '%chamar%'
        OR LOWER(t.title) LIKE '%respondeu%'
        OR LOWER(t.title) LIKE '%contato%'
        OR LOWER(t.title) LIKE '%retorno%'
        OR LOWER(t.title) LIKE '%marcar%'
      )
    ORDER BY t.due_date ASC
    LIMIT 1
  ) task_hoje ON true

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.channel = 'call'
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) tent14 ON true

  LEFT JOIN LATERAL (
    SELECT COUNT(*)::INTEGER AS n
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'outbound'
      AND c.ghl_source = 'app'
      AND c.channel IN ('call', 'whatsapp', 'sms')
      AND c.data_comunicacao > (_agora - INTERVAL '14 days')
  ) touches ON true

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN task_hoje.task_title IS NOT NULL
          THEN 'horario_marcado'
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '4 hours')
          AND (out.last_outbound IS NULL OR out.last_outbound < inb.last_inbound)
          THEN 'respondeu'
        WHEN o.data_lead_recebido IS NOT NULL
          AND o.data_lead_recebido >= _hoje_sp_inicio
          AND o.data_lead_recebido <= _hoje_sp_fim
          THEN 'lead_novo'
        ELSE 'cadencia'
      END AS camada,
      CASE
        WHEN COALESCE(tent14.n, 0) <= 2 THEN 'call'
        WHEN COALESCE(tent14.n, 0) <= 4 THEN 'whatsapp'
        ELSE 'sms'
      END AS canal_sugerido
  ) cam ON true

  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN inb.last_inbound IS NOT NULL
          AND inb.last_inbound > (_agora - INTERVAL '24 hours')
          AND (out.last_outbound IS NULL OR out.last_outbound < inb.last_inbound)
        THEN GREATEST(0, 1000 - GREATEST(0, ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60)::INTEGER))
        ELSE 0
      END AS sinal_resposta,

      CASE
        WHEN o.data_lead_recebido IS NOT NULL
          AND o.data_lead_recebido > (_agora - INTERVAL '24 hours')
        THEN GREATEST(0, 1000 - ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 86.4)::INTEGER)
        ELSE 0
      END AS recencia,

      CASE
        WHEN ct2.tags IS NOT NULL AND lower(ct2.tags) ~ '(^|,)\s*mql\s*(,|$)'
          THEN 1000
        ELSE 300
      END AS qualificacao_mql,

      LEAST(1000, COALESCE(touches.n, 0) * 100) AS engajamento_canal,

      GREATEST(0, 1000 - COALESCE(tent14.n, 0) * 150) AS fadiga
  ) comp ON true

  LEFT JOIN LATERAL (
    SELECT CASE cam.camada
      WHEN 'horario_marcado' THEN
        task_hoje.task_title

      WHEN 'respondeu' THEN
        CASE
          WHEN inb.last_inbound > (_agora - INTERVAL '30 minutes')
            THEN 'Respondeu há '
                 || GREATEST(1, ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 60))::TEXT
                 || ' min'
          ELSE 'Respondeu há '
               || ROUND(EXTRACT(EPOCH FROM (_agora - inb.last_inbound)) / 3600, 1)::TEXT
               || 'h'
        END

      WHEN 'lead_novo' THEN
        CASE
          WHEN COALESCE(tent14.n, 0) = 0
            THEN 'Novo hoje · chegou há '
                 || GREATEST(1, ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido)) / 60))::TEXT
                 || ' min'
          ELSE 'Novo hoje · ' || tent14.n::TEXT || 'x tentativa'
        END

      ELSE
        CASE cam.canal_sugerido
          WHEN 'call'     THEN 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — ligue agora'
          WHEN 'whatsapp' THEN 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — mande WhatsApp'
          ELSE                 'Tentativa ' || (COALESCE(tent14.n, 0) + 1)::TEXT || ' — encerramento'
        END
    END AS razao
  ) rz ON true

  WHERE o.status = 'open'
    AND o.pipeline_id IS NOT NULL
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
    AND ct2.workspace_id IS NOT NULL
    AND COALESCE(tent14.n, 0) < 7

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id             = EXCLUDED.contato_id,
    workspace_id           = EXCLUDED.workspace_id,
    escopo                 = EXCLUDED.escopo,
    score                  = EXCLUDED.score,
    estado                 = EXCLUDED.estado,
    razao                  = EXCLUDED.razao,
    componente_dom         = EXCLUDED.componente_dom,
    score_sinal            = EXCLUDED.score_sinal,
    score_urgencia         = EXCLUDED.score_urgencia,
    score_tentativas       = EXCLUDED.score_tentativas,
    score_fonte            = EXCLUDED.score_fonte,
    score_qualificacao     = EXCLUDED.score_qualificacao,
    camada                 = EXCLUDED.camada,
    numero_tentativa       = EXCLUDED.numero_tentativa,
    canal_sugerido         = EXCLUDED.canal_sugerido,
    data_retorno_combinado = COALESCE(discagem_scores.data_retorno_combinado, EXCLUDED.data_retorno_combinado),
    data_entrada_lead      = EXCLUDED.data_entrada_lead,
    data_retorno_previsto  = EXCLUDED.data_retorno_previsto,
    updated_at             = EXCLUDED.updated_at;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reenfileirar_openclaw_contrato_assinado_pendentes(p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec RECORD;
  v_avaliadas INTEGER := 0;
  v_enfileiradas INTEGER := 0;
BEGIN
  PERFORM public.sincronizar_status_openclaw_contrato_assinado(GREATEST(COALESCE(p_limit, 25) * 5, 100));

  FOR v_rec IN
    SELECT
      o.id,
      vf.op_link_do_contrato_assinado,
      vf.data_da_assinatura_do_contrato
    FROM public.oportunidades o
    INNER JOIN public.vendas_fechamento vf
      ON vf.oportunidade_id = o.id
    WHERE o.openclaw_notificado_em IS NULL
      AND o.openclaw_request_id IS NULL
      AND NULLIF(TRIM(vf.op_link_do_contrato_assinado), '') IS NOT NULL
      AND (
        (
          o.pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
          AND o.pipeline_stage_id = 'Assinada'
        )
        OR vf.data_da_assinatura_do_contrato IS NOT NULL
      )
    ORDER BY COALESCE(o.updated_at, vf.updated_at, NOW()) DESC
    LIMIT GREATEST(COALESCE(p_limit, 25), 1)
  LOOP
    v_avaliadas := v_avaliadas + 1;

    IF public.processar_notificacao_openclaw_contrato_assinado(
      v_rec.id,
      v_rec.op_link_do_contrato_assinado,
      v_rec.data_da_assinatura_do_contrato
    ) THEN
      v_enfileiradas := v_enfileiradas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'avaliadas', v_avaliadas,
    'enfileiradas', v_enfileiradas
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_sync_log(p_started_at timestamp with time zone, p_status text, p_records_fetched integer DEFAULT 0, p_records_inserted integer DEFAULT 0, p_records_updated integer DEFAULT 0, p_error_message text DEFAULT NULL::text, p_error_details jsonb DEFAULT NULL::jsonb, p_execution_time_ms integer DEFAULT NULL::integer, p_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO meta_ads_sync_log (
        started_at,
        finished_at,
        status,
        records_fetched,
        records_inserted,
        records_updated,
        error_message,
        error_details,
        execution_time_ms,
        workspace_id
    ) VALUES (
        p_started_at,
        now(),
        p_status,
        p_records_fetched,
        p_records_inserted,
        p_records_updated,
        p_error_message,
        p_error_details,
        p_execution_time_ms,
        p_workspace_id
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.relink_comunicacoes_for_contato()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Re-link por email
  IF NEW.email IS NOT NULL AND NEW.email <> '' THEN
    UPDATE comunicacoes
    SET contato_id = NEW.id
    WHERE contato_id IS NULL
      AND contato_email IS NOT NULL
      AND contato_email <> ''
      AND LOWER(contato_email) = LOWER(NEW.email);
  END IF;

  -- Re-link por telefone (normalizado)
  IF NEW.telefone IS NOT NULL AND NEW.telefone <> '' THEN
    UPDATE comunicacoes
    SET contato_id = NEW.id
    WHERE contato_id IS NULL
      AND contato_telefone IS NOT NULL
      AND contato_telefone <> ''
      AND REGEXP_REPLACE(contato_telefone, '[^0-9]', '', 'g')
        = REGEXP_REPLACE(NEW.telefone, '[^0-9]', '', 'g');
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_stale_contact_opp_sync_queue(p_stale_after_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted  INTEGER := 0;
  v_requeued INTEGER := 0;
BEGIN
  -- Passo 1: deletar itens stale cujo contato já tem um 'pending' novo.
  -- Não faz sentido requeue — o pending mais recente vai cobrir o trabalho.
  DELETE FROM public.contact_opp_sync_queue stale
  WHERE stale.status = 'processing'
    AND (
      stale.claimed_at IS NULL
      OR stale.claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    )
    AND EXISTS (
      SELECT 1
      FROM public.contact_opp_sync_queue newer
      WHERE newer.ghl_contact_id = stale.ghl_contact_id
        AND newer.status = 'pending'
        AND newer.id <> stale.id
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Passo 2: recolocar em pending os stale que NÃO têm pending duplicado.
  UPDATE public.contact_opp_sync_queue
  SET
    status    = 'pending',
    claimed_at = NULL
  WHERE status = 'processing'
    AND (
      claimed_at IS NULL
      OR claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    );

  GET DIAGNOSTICS v_requeued = ROW_COUNT;
  RETURN v_deleted + v_requeued;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_stale_ghl_api_jobs(p_stale_after_minutes integer DEFAULT 15)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT := 0;
BEGIN
  UPDATE public.ghl_api_jobs
  SET
    status = 'pending',
    claimed_at = NULL,
    next_retry_at = NOW(),
    error = LEFT(
      COALESCE(error || ' | ', '') ||
      'stale_requeue at ' || NOW()::TEXT,
      1000
    )
  WHERE status = 'processing'
    AND claimed_at IS NOT NULL
    AND claimed_at < NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.requeue_stale_ghl_opp_reconcile_items(p_run_id uuid, p_stale_after_minutes integer DEFAULT 30)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.ghl_opp_reconcile_items
  SET
    status = 'pending',
    claimed_at = NULL,
    updated_at = NOW()
  WHERE run_id = p_run_id
    AND status = 'processing'
    AND (
      claimed_at IS NULL
      OR claimed_at <= NOW() - make_interval(mins => GREATEST(p_stale_after_minutes, 1))
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_rate_limit(p_identifier text, p_action text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_sdr_name_on_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Só atua quando owner_name realmente mudou (IS DISTINCT FROM trata NULL corretamente)
  IF OLD.owner_name IS DISTINCT FROM NEW.owner_name THEN
    UPDATE oportunidades
    SET sdr_name = NULL
    WHERE contato_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_ghl_field_value(p_payload jsonb, p_variations jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_variation text;
    v_value text;
    v_path text[];
BEGIN
    IF p_payload IS NULL OR p_variations IS NULL OR jsonb_typeof(p_variations) <> 'array' THEN
        RETURN NULL;
    END IF;

    FOR v_variation IN SELECT jsonb_array_elements_text(p_variations)
    LOOP
        v_variation := TRIM(v_variation);
        IF v_variation = '' THEN
            CONTINUE;
        END IF;

        -- Campos customizados de oportunidade: procuram em customData com chave exata
        IF v_variation LIKE '{{%' THEN
            v_value := NULLIF(TRIM(p_payload->'customData'->>v_variation), '');
            -- Fallback: GHL as vezes armazena sem espacos internos; tenta tambem a versao compacta
            IF v_value IS NULL THEN
                v_value := NULLIF(TRIM(p_payload->'customData'->>REGEXP_REPLACE(v_variation, E'\\s+', '', 'g')), '');
            END IF;
        -- Caminho aninhado (ex: lastAttributionSource.utmSource)
        ELSIF v_variation LIKE '%.%' THEN
            v_path := string_to_array(v_variation, '.');
            v_value := NULLIF(TRIM(p_payload #>> v_path), '');
        -- Chave simples no payload root
        ELSE
            v_value := NULLIF(TRIM(p_payload->>v_variation), '');
        END IF;

        IF v_value IS NOT NULL THEN
            RETURN v_value;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.safe_unschedule(job_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM cron.unschedule(job_name);
EXCEPTION WHEN OTHERS THEN
  -- Ignora erro se job não existe
  NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_weekly_report_test(p_schedule_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.weekly_email_logs (
    schedule_id,
    status,
    error_message
  )
  VALUES (
    p_schedule_id,
    'pending',
    'Teste agendado pelo usuário. O envio real é feito pela edge function send-weekly-report-email.'
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_atualizado_em()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
  BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.setup_workspace_apps_and_permissions(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    app_slugs TEXT[] := ARRAY[
        'aquisicao-vendas',
        'trafego',
        'traqueamento',
        'pre-vendas',
        'relatorios',
        'sdr-ia',
        'metas',
        'leads',
        'criativos',
        'disparos'
    ];
    slug TEXT;
BEGIN
    -- Ativa todos os apps do APP_CATALOG
    FOREACH slug IN ARRAY app_slugs LOOP
        INSERT INTO workspace_apps (workspace_id, app_slug, is_active, settings)
        VALUES (p_workspace_id, slug, true, '{}'::jsonb)
        ON CONFLICT (workspace_id, app_slug) DO NOTHING;
    END LOOP;

    -- Permissões de app: owner/admin sempre veem todos os apps
    INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
    SELECT p_workspace_id, unnest(app_slugs), r, true
    FROM (VALUES ('owner'), ('admin')) AS roles(r)
    ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;

    -- Permissões de app: member vê todos os apps do catálogo atual
    -- (todos possuem ao menos uma feature liberada para member)
    INSERT INTO app_role_permissions (workspace_id, app_slug, role, can_view)
    SELECT p_workspace_id, unnest(app_slugs), 'member', true
    ON CONFLICT (workspace_id, app_slug, role) DO NOTHING;

    -- Permissões de feature por role conforme FEATURES_CATALOG.defaultRoles
    INSERT INTO app_feature_role_permissions (workspace_id, app_slug, feature_key, role, can_view)
    VALUES
        (p_workspace_id, 'aquisicao-vendas', 'aquisicao', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'aquisicao', 'admin', true),
        (p_workspace_id, 'aquisicao-vendas', 'aquisicao', 'member', true),
        (p_workspace_id, 'aquisicao-vendas', 'vendas', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'vendas', 'admin', true),
        (p_workspace_id, 'aquisicao-vendas', 'vendas', 'member', true),
        (p_workspace_id, 'aquisicao-vendas', 'organico', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'organico', 'admin', true),
        (p_workspace_id, 'aquisicao-vendas', 'organico', 'member', true),
        (p_workspace_id, 'aquisicao-vendas', 'dados-financeiros', 'owner', true),
        (p_workspace_id, 'aquisicao-vendas', 'dados-financeiros', 'admin', true),
        (p_workspace_id, 'trafego', 'visao-geral', 'owner', true),
        (p_workspace_id, 'trafego', 'visao-geral', 'admin', true),
        (p_workspace_id, 'trafego', 'visao-geral', 'member', true),
        (p_workspace_id, 'trafego', 'matriz', 'owner', true),
        (p_workspace_id, 'trafego', 'matriz', 'admin', true),
        (p_workspace_id, 'trafego', 'matriz', 'member', true),
        (p_workspace_id, 'trafego', 'ranking-criativos', 'owner', true),
        (p_workspace_id, 'trafego', 'ranking-criativos', 'admin', true),
        (p_workspace_id, 'trafego', 'ranking-criativos', 'member', true),
        (p_workspace_id, 'trafego', 'leads', 'owner', true),
        (p_workspace_id, 'trafego', 'leads', 'admin', true),
        (p_workspace_id, 'trafego', 'leads', 'member', true),
        (p_workspace_id, 'traqueamento', 'cods-utm', 'owner', true),
        (p_workspace_id, 'traqueamento', 'cods-utm', 'admin', true),
        (p_workspace_id, 'traqueamento', 'cods-utm', 'member', true),
        (p_workspace_id, 'traqueamento', 'origem', 'owner', true),
        (p_workspace_id, 'traqueamento', 'origem', 'admin', true),
        (p_workspace_id, 'traqueamento', 'origem', 'member', true),
        (p_workspace_id, 'traqueamento', 'anuncios', 'owner', true),
        (p_workspace_id, 'traqueamento', 'anuncios', 'admin', true),
        (p_workspace_id, 'traqueamento', 'anuncios', 'member', true),
        (p_workspace_id, 'traqueamento', 'organico', 'owner', true),
        (p_workspace_id, 'traqueamento', 'organico', 'admin', true),
        (p_workspace_id, 'traqueamento', 'organico', 'member', true),
        (p_workspace_id, 'traqueamento', 'funis', 'owner', true),
        (p_workspace_id, 'traqueamento', 'funis', 'admin', true),
        (p_workspace_id, 'traqueamento', 'funis', 'member', true),
        (p_workspace_id, 'pre-vendas', 'discagem', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'discagem', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'discagem', 'member', true),
        (p_workspace_id, 'pre-vendas', 'agendamentos', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'agendamentos', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'agendamentos', 'member', true),
        (p_workspace_id, 'pre-vendas', 'atividades', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'atividades', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'atividades', 'member', true),
        (p_workspace_id, 'pre-vendas', 'mqls', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'mqls', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'mqls', 'member', true),
        (p_workspace_id, 'pre-vendas', 'sdr-leaderboard', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'sdr-leaderboard', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'sdr-leaderboard', 'member', true),
        (p_workspace_id, 'pre-vendas', 'auto-agendados', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'auto-agendados', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'auto-agendados', 'member', true),
        (p_workspace_id, 'pre-vendas', 'leads-parados', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'leads-parados', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'leads-parados', 'member', true),
        (p_workspace_id, 'pre-vendas', 'auditoria-ia', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'auditoria-ia', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'auditoria-ia', 'member', true),
        (p_workspace_id, 'pre-vendas', 'recuperacao', 'owner', true),
        (p_workspace_id, 'pre-vendas', 'recuperacao', 'admin', true),
        (p_workspace_id, 'pre-vendas', 'recuperacao', 'member', true),
        (p_workspace_id, 'relatorios', 'cohort', 'owner', true),
        (p_workspace_id, 'relatorios', 'cohort', 'admin', true),
        (p_workspace_id, 'relatorios', 'cohort', 'member', true),
        (p_workspace_id, 'relatorios', 'produtividade', 'owner', true),
        (p_workspace_id, 'relatorios', 'produtividade', 'admin', true),
        (p_workspace_id, 'relatorios', 'produtividade', 'member', true),
        (p_workspace_id, 'relatorios', 'comparativo', 'owner', true),
        (p_workspace_id, 'relatorios', 'comparativo', 'admin', true),
        (p_workspace_id, 'relatorios', 'comparativo', 'member', true),
        (p_workspace_id, 'relatorios', 'tendencias', 'owner', true),
        (p_workspace_id, 'relatorios', 'tendencias', 'admin', true),
        (p_workspace_id, 'relatorios', 'tendencias', 'member', true),
        (p_workspace_id, 'sdr-ia', 'auditoria-ia', 'owner', true),
        (p_workspace_id, 'sdr-ia', 'auditoria-ia', 'admin', true),
        (p_workspace_id, 'sdr-ia', 'auditoria-ia', 'member', true),
        (p_workspace_id, 'metas', 'overview', 'owner', true),
        (p_workspace_id, 'metas', 'overview', 'admin', true),
        (p_workspace_id, 'metas', 'overview', 'member', true),
        (p_workspace_id, 'metas', 'tracking', 'owner', true),
        (p_workspace_id, 'metas', 'tracking', 'admin', true),
        (p_workspace_id, 'metas', 'tracking', 'member', true),
        (p_workspace_id, 'metas', 'registry', 'owner', true),
        (p_workspace_id, 'metas', 'registry', 'admin', true),
        (p_workspace_id, 'metas', 'history', 'owner', true),
        (p_workspace_id, 'metas', 'history', 'admin', true),
        (p_workspace_id, 'metas', 'history', 'member', true),
        (p_workspace_id, 'leads', 'lista', 'owner', true),
        (p_workspace_id, 'leads', 'lista', 'admin', true),
        (p_workspace_id, 'leads', 'lista', 'member', true),
        (p_workspace_id, 'leads', 'limpeza', 'owner', true),
        (p_workspace_id, 'leads', 'limpeza', 'admin', true),
        (p_workspace_id, 'criativos', 'dashboard', 'owner', true),
        (p_workspace_id, 'criativos', 'dashboard', 'admin', true),
        (p_workspace_id, 'criativos', 'dashboard', 'member', true),
        (p_workspace_id, 'criativos', 'ranking', 'owner', true),
        (p_workspace_id, 'criativos', 'ranking', 'admin', true),
        (p_workspace_id, 'criativos', 'ranking', 'member', true),
        (p_workspace_id, 'criativos', 'biblioteca', 'owner', true),
        (p_workspace_id, 'criativos', 'biblioteca', 'admin', true),
        (p_workspace_id, 'criativos', 'kanban', 'owner', true),
        (p_workspace_id, 'criativos', 'kanban', 'admin', true),
        (p_workspace_id, 'criativos', 'testes', 'owner', true),
        (p_workspace_id, 'criativos', 'testes', 'admin', true),
        (p_workspace_id, 'criativos', 'testes', 'member', true),
        (p_workspace_id, 'disparos', 'dashboard', 'owner', true),
        (p_workspace_id, 'disparos', 'dashboard', 'admin', true),
        (p_workspace_id, 'disparos', 'dashboard', 'member', true),
        (p_workspace_id, 'disparos', 'configuracao', 'owner', true),
        (p_workspace_id, 'disparos', 'configuracao', 'admin', true)
    ON CONFLICT (workspace_id, app_slug, feature_key, role) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sincronizar_status_openclaw_contrato_assinado(p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'net'
AS $function$
DECLARE
  v_rec RECORD;
  v_processados INTEGER := 0;
  v_confirmados INTEGER := 0;
  v_falharam INTEGER := 0;
  v_pendentes INTEGER := 0;
  v_expirados INTEGER := 0;
BEGIN
  FOR v_rec IN
    SELECT
      o.id,
      o.openclaw_request_id,
      o.openclaw_enfileirado_em,
      r.created AS resposta_em,
      r.status_code,
      NULLIF(TRIM(r.error_msg), '') AS error_msg,
      NULLIF(LEFT(TRIM(COALESCE(r.content::TEXT, '')), 1000), '') AS content
    FROM public.oportunidades o
    LEFT JOIN net._http_response r
      ON r.id = o.openclaw_request_id
    WHERE o.openclaw_notificado_em IS NULL
      AND o.openclaw_request_id IS NOT NULL
    ORDER BY o.openclaw_enfileirado_em ASC NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  LOOP
    v_processados := v_processados + 1;

    IF v_rec.status_code BETWEEN 200 AND 299 AND v_rec.error_msg IS NULL THEN
      UPDATE public.oportunidades
      SET openclaw_notificado_em = COALESCE(v_rec.resposta_em, NOW()),
          openclaw_ultima_resposta_em = COALESCE(v_rec.resposta_em, NOW()),
          openclaw_ultimo_status_code = v_rec.status_code,
          openclaw_ultimo_erro = NULL
      WHERE id = v_rec.id;

      v_confirmados := v_confirmados + 1;
    ELSIF v_rec.status_code IS NOT NULL OR v_rec.error_msg IS NOT NULL THEN
      UPDATE public.oportunidades
      SET openclaw_request_id = NULL,
          openclaw_enfileirado_em = NULL,
          openclaw_ultima_resposta_em = COALESCE(v_rec.resposta_em, NOW()),
          openclaw_ultimo_status_code = v_rec.status_code,
          openclaw_ultimo_erro = COALESCE(v_rec.error_msg, v_rec.content, 'OpenClaw respondeu sem sucesso')
      WHERE id = v_rec.id;

      v_falharam := v_falharam + 1;
    ELSIF v_rec.openclaw_enfileirado_em IS NOT NULL
       AND v_rec.openclaw_enfileirado_em <= NOW() - INTERVAL '10 minutes' THEN
      UPDATE public.oportunidades
      SET openclaw_request_id = NULL,
          openclaw_enfileirado_em = NULL,
          openclaw_ultima_resposta_em = NOW(),
          openclaw_ultimo_status_code = NULL,
          openclaw_ultimo_erro = 'Timeout aguardando resposta do pg_net para o OpenClaw'
      WHERE id = v_rec.id;

      v_expirados := v_expirados + 1;
    ELSE
      v_pendentes := v_pendentes + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'processados', v_processados,
    'confirmados', v_confirmados,
    'falharam', v_falharam,
    'pendentes', v_pendentes,
    'expirados', v_expirados
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_contact_attribution_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-attribution';
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('anon_key') || ''
    ),
    body := jsonb_build_object(
      'batch_size',       100,
      'apply_batch_size', 300
    )
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_contact_opportunities_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-opportunities',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{"batch_size": 20}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_contact_tags_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_url         TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-tags';
    v_service_key TEXT := '' || get_secret('service_role_key') || '';
    v_request_id  BIGINT;
BEGIN
    SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body    := '{"batch_size": 100}'::jsonb
    ) INTO v_request_id;

    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_contact_tasks_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_url        TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-contact-tasks';
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('anon_key') || ''
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_ghl_conversations_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/sync-ghl-conversations',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('service_role_key') || ''
    ),
    body    := '{"mode":"incremental"}'::jsonb
  ) INTO v_request_id;

  RETURN 'Request ID: ' || v_request_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_meta_ads_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_url TEXT := '' || get_secret('supabase_url') || '/functions/v1/sync-meta-ads';
    v_service_key TEXT := '' || get_secret('service_role_key') || '';
    v_request_id BIGINT;
BEGIN
    -- Fazer requisição HTTP para a Edge Function
    SELECT net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := '{}'::jsonb
    ) INTO v_request_id;
    
    RETURN 'Request ID: ' || v_request_id || ' | URL: ' || v_url;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_opp_dates_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE   v_request_id BIGINT; BEGIN   SELECT net.http_post(     url     := '' || get_secret('supabase_url') || '/functions/v1/sync-opp-dates',     headers := jsonb_build_object(       'Content-Type',  'application/json',       'Authorization', 'Bearer ' || get_secret('service_role_key') || ''     ),     body    := '{"batch_size": 100}'::jsonb   ) INTO v_request_id;   RETURN 'Request ID: ' || v_request_id; END; $function$
;

CREATE OR REPLACE FUNCTION public.sync_tags_from_latest_webhook(p_days_back integer DEFAULT 90)
 RETURNS TABLE(updated_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INTEGER;
BEGIN
  WITH latest_webhook_per_contact AS (
    SELECT DISTINCT ON (TRIM(payload->>'contact_id'))
      TRIM(payload->>'contact_id')           AS ghl_id,
      extract_ghl_tags(payload->'tags')      AS tags_value
    FROM webhooks_ghl
    WHERE payload->>'contact_id' IS NOT NULL
      AND TRIM(payload->>'contact_id') != ''
      AND payload->'tags' IS NOT NULL
      AND jsonb_typeof(payload->'tags') != 'null'
      AND created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    ORDER BY TRIM(payload->>'contact_id'), created_at DESC
  ),
  atualizado AS (
    UPDATE contatos c
    SET
      tags       = lwc.tags_value,
      updated_at = NOW()
    FROM latest_webhook_per_contact lwc
    WHERE c.ghl_id = lwc.ghl_id
      AND lwc.tags_value IS NOT NULL
      AND (c.tags IS DISTINCT FROM lwc.tags_value)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_updated FROM atualizado;

  RETURN QUERY SELECT v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tags_from_webhook_batch(p_limit integer DEFAULT 200, p_days_back integer DEFAULT 30, p_only_null boolean DEFAULT true)
 RETURNS TABLE(candidate_count integer, updated_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_candidate_count INTEGER := 0;
  v_updated_count INTEGER := 0;
BEGIN
  WITH candidate_contacts AS (
    SELECT
      c.id,
      c.ghl_id
    FROM public.contatos c
    WHERE c.ghl_id IS NOT NULL
      AND TRIM(c.ghl_id) <> ''
      AND (
        NOT COALESCE(p_only_null, true)
        OR c.tags IS NULL
      )
    ORDER BY
      c.updated_at ASC NULLS FIRST,
      c.id ASC
    LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  ),
  latest_webhook AS (
    SELECT
      cc.id AS contato_id,
      cc.ghl_id,
      extract_ghl_tags(w.payload->'tags') AS tags_value
    FROM candidate_contacts cc
    JOIN LATERAL (
      SELECT w.payload
      FROM public.webhooks_ghl w
      WHERE TRIM(w.payload->>'contact_id') = cc.ghl_id
        AND w.payload->'tags' IS NOT NULL
        AND jsonb_typeof(w.payload->'tags') <> 'null'
        AND w.created_at >= NOW() - make_interval(days => GREATEST(COALESCE(p_days_back, 30), 1))
      ORDER BY w.created_at DESC
      LIMIT 1
    ) w ON TRUE
  ),
  atualizado AS (
    UPDATE public.contatos c
    SET
      tags = lw.tags_value,
      updated_at = NOW()
    FROM latest_webhook lw
    WHERE c.id = lw.contato_id
      AND lw.tags_value IS NOT NULL
      AND c.tags IS DISTINCT FROM lw.tags_value
    RETURNING 1
  )
  SELECT
    (SELECT COUNT(*) FROM candidate_contacts),
    (SELECT COUNT(*) FROM atualizado)
  INTO v_candidate_count, v_updated_count;

  RETURN QUERY SELECT v_candidate_count, v_updated_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tags_from_webhook_target(p_ghl_id text DEFAULT NULL::text, p_contact_id uuid DEFAULT NULL::uuid, p_days_back integer DEFAULT 90)
 RETURNS TABLE(found_webhook boolean, updated_count integer, tags_value text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_ghl_id TEXT;
  v_tags_value TEXT;
  v_updated_count INTEGER := 0;
BEGIN
  IF p_ghl_id IS NULL AND p_contact_id IS NULL THEN
    RAISE EXCEPTION 'sync_tags_from_webhook_target requer p_ghl_id ou p_contact_id';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(p_ghl_id), ''), c.ghl_id)
    INTO v_ghl_id
  FROM public.contatos c
  WHERE p_contact_id IS NULL OR c.id = p_contact_id
  LIMIT 1;

  IF v_ghl_id IS NULL OR TRIM(v_ghl_id) = '' THEN
    RETURN QUERY SELECT false, 0, NULL::TEXT;
    RETURN;
  END IF;

  SELECT extract_ghl_tags(w.payload->'tags')
    INTO v_tags_value
  FROM public.webhooks_ghl w
  WHERE TRIM(w.payload->>'contact_id') = v_ghl_id
    AND w.payload->'tags' IS NOT NULL
    AND jsonb_typeof(w.payload->'tags') <> 'null'
    AND w.created_at >= NOW() - make_interval(days => GREATEST(COALESCE(p_days_back, 90), 1))
  ORDER BY w.created_at DESC
  LIMIT 1;

  IF v_tags_value IS NULL THEN
    RETURN QUERY SELECT false, 0, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE public.contatos c
  SET
    tags = v_tags_value,
    updated_at = NOW()
  WHERE c.ghl_id = v_ghl_id
    AND (p_contact_id IS NULL OR c.id = p_contact_id)
    AND c.tags IS DISTINCT FROM v_tags_value;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN QUERY SELECT true, v_updated_count, v_tags_value;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.test_extrair_dados_ghl_v2_equivalence(p_limit integer DEFAULT 50)
 RETURNS TABLE(webhook_id uuid, status text, detail text)
 LANGUAGE plpgsql
AS $function$
DECLARE
    rec RECORD;
    v_suffix_v1 TEXT := '-ralph-v1';
    v_suffix_v2 TEXT := '-ralph-v2';
    v_contact_id_v1 TEXT;
    v_contact_id_v2 TEXT;
    v_opp_id_v1 TEXT;
    v_opp_id_v2 TEXT;
    v_payload_v1 JSONB;
    v_payload_v2 JSONB;
    v_webhook_v1 UUID;
    v_webhook_v2 UUID;
    v_result_v1 RECORD;
    v_result_v2 RECORD;
    v_contato_v1 RECORD;
    v_contato_v2 RECORD;
    v_opp_v1 RECORD;
    v_opp_v2 RECORD;
    v_detail TEXT;
BEGIN
    FOR rec IN
        SELECT w.id, w.payload
        FROM public.webhooks_ghl w
        WHERE w.payload->>'contact_id' IS NOT NULL
          AND TRIM(w.payload->>'contact_id') != ''
          AND w.payload->>'id' IS NOT NULL
          AND TRIM(w.payload->>'id') != ''
        ORDER BY w.created_at DESC
        LIMIT GREATEST(p_limit, 1)
    LOOP
        v_detail := '';

        -- Gera IDs sinteticos
        v_contact_id_v1 := TRIM(rec.payload->>'contact_id') || v_suffix_v1;
        v_contact_id_v2 := TRIM(rec.payload->>'contact_id') || v_suffix_v2;
        v_opp_id_v1 := TRIM(rec.payload->>'id') || v_suffix_v1;
        v_opp_id_v2 := TRIM(rec.payload->>'id') || v_suffix_v2;

        -- Limpa dados de teste preexistentes
        DELETE FROM public.webhooks_ghl WHERE payload->>'contact_id' IN (v_contact_id_v1, v_contact_id_v2);
        DELETE FROM public.oportunidades WHERE ghl_opportunity_id IN (v_opp_id_v1, v_opp_id_v2);
        DELETE FROM public.contatos WHERE ghl_id IN (v_contact_id_v1, v_contact_id_v2);

        -- Monta payloads modificados
        v_payload_v1 := jsonb_set(
            jsonb_set(rec.payload, '{contact_id}', to_jsonb(v_contact_id_v1)),
            '{id}',
            to_jsonb(v_opp_id_v1)
        );
        v_payload_v2 := jsonb_set(
            jsonb_set(rec.payload, '{contact_id}', to_jsonb(v_contact_id_v2)),
            '{id}',
            to_jsonb(v_opp_id_v2)
        );

        -- Insere webhooks de teste
        INSERT INTO public.webhooks_ghl (payload) VALUES (v_payload_v1) RETURNING id INTO v_webhook_v1;
        INSERT INTO public.webhooks_ghl (payload) VALUES (v_payload_v2) RETURNING id INTO v_webhook_v2;

        BEGIN
            -- Processa v1 e v2
            SELECT * INTO v_result_v1 FROM public.extrair_dados_ghl(v_webhook_v1);
            SELECT * INTO v_result_v2 FROM public.extrair_dados_ghl_v2(v_webhook_v2);

            -- Compara contagens
            IF v_result_v1.contatos_inseridos IS DISTINCT FROM v_result_v2.contatos_inseridos THEN
                v_detail := v_detail || format('contatos_inseridos(v1=%s,v2=%s) ', v_result_v1.contatos_inseridos, v_result_v2.contatos_inseridos);
            END IF;
            IF v_result_v1.contatos_atualizados IS DISTINCT FROM v_result_v2.contatos_atualizados THEN
                v_detail := v_detail || format('contatos_atualizados(v1=%s,v2=%s) ', v_result_v1.contatos_atualizados, v_result_v2.contatos_atualizados);
            END IF;
            IF v_result_v1.oportunidades_inseridas IS DISTINCT FROM v_result_v2.oportunidades_inseridas THEN
                v_detail := v_detail || format('oportunidades_inseridas(v1=%s,v2=%s) ', v_result_v1.oportunidades_inseridas, v_result_v2.oportunidades_inseridas);
            END IF;
            IF v_result_v1.oportunidades_atualizadas IS DISTINCT FROM v_result_v2.oportunidades_atualizadas THEN
                v_detail := v_detail || format('oportunidades_atualizadas(v1=%s,v2=%s) ', v_result_v1.oportunidades_atualizadas, v_result_v2.oportunidades_atualizadas);
            END IF;

            -- Compara contatos criados (campos relevantes, ignorando id/created_at/updated_at)
            SELECT * INTO v_contato_v1 FROM public.contatos WHERE ghl_id = v_contact_id_v1;
            SELECT * INTO v_contato_v2 FROM public.contatos WHERE ghl_id = v_contact_id_v2;

            IF v_contato_v1 IS NULL OR v_contato_v2 IS NULL THEN
                v_detail := v_detail || 'contato_nao_encontrado ';
            ELSIF (
                v_contato_v1.ghl_id, v_contato_v1.nome, v_contato_v1.email, v_contato_v1.telefone,
                v_contato_v1.utm_source, v_contato_v1.utm_medium, v_contato_v1.utm_campaign,
                v_contato_v1.utm_term, v_contato_v1.utm_content, v_contato_v1.ip,
                v_contato_v1.url, v_contato_v1.fbclid, v_contato_v1.owner_name, v_contato_v1.owner_email
            ) IS DISTINCT FROM (
                v_contato_v2.ghl_id, v_contato_v2.nome, v_contato_v2.email, v_contato_v2.telefone,
                v_contato_v2.utm_source, v_contato_v2.utm_medium, v_contato_v2.utm_campaign,
                v_contato_v2.utm_term, v_contato_v2.utm_content, v_contato_v2.ip,
                v_contato_v2.url, v_contato_v2.fbclid, v_contato_v2.owner_name, v_contato_v2.owner_email
            ) THEN
                v_detail := v_detail || 'contato_fields_diverge ';
            END IF;

            -- Compara oportunidades criadas (campos relevantes)
            SELECT * INTO v_opp_v1 FROM public.oportunidades WHERE ghl_opportunity_id = v_opp_id_v1;
            SELECT * INTO v_opp_v2 FROM public.oportunidades WHERE ghl_opportunity_id = v_opp_id_v2;

            IF v_opp_v1 IS NULL OR v_opp_v2 IS NULL THEN
                v_detail := v_detail || 'oportunidade_nao_encontrada ';
            ELSIF (
                v_opp_v1.ghl_opportunity_id, v_opp_v1.nome_contato, v_opp_v1.email_contato,
                v_opp_v1.titulo, v_opp_v1.valor, v_opp_v1.status, v_opp_v1.pipeline_id,
                v_opp_v1.pipeline_stage_id, v_opp_v1.pipeline_name, v_opp_v1.opportunity_source,
                v_opp_v1.vendedor_closer, v_opp_v1.lost_reason, v_opp_v1.resumo_ia,
                v_opp_v1.percepcao_closer, v_opp_v1.data_ultima_atividade, v_opp_v1.data_conectado,
                v_opp_v1.data_fechado, v_opp_v1.data_no_show, v_opp_v1.data_realizacao_vendas
            ) IS DISTINCT FROM (
                v_opp_v2.ghl_opportunity_id, v_opp_v2.nome_contato, v_opp_v2.email_contato,
                v_opp_v2.titulo, v_opp_v2.valor, v_opp_v2.status, v_opp_v2.pipeline_id,
                v_opp_v2.pipeline_stage_id, v_opp_v2.pipeline_name, v_opp_v2.opportunity_source,
                v_opp_v2.vendedor_closer, v_opp_v2.lost_reason, v_opp_v2.resumo_ia,
                v_opp_v2.percepcao_closer, v_opp_v2.data_ultima_atividade, v_opp_v2.data_conectado,
                v_opp_v2.data_fechado, v_opp_v2.data_no_show, v_opp_v2.data_realizacao_vendas
            ) THEN
                v_detail := v_detail || 'oportunidade_fields_diverge ';
            END IF;

            -- Limpa dados de teste desta iteracao
            DELETE FROM public.webhooks_ghl WHERE id IN (v_webhook_v1, v_webhook_v2);
            DELETE FROM public.oportunidades WHERE ghl_opportunity_id IN (v_opp_id_v1, v_opp_id_v2);
            DELETE FROM public.contatos WHERE ghl_id IN (v_contact_id_v1, v_contact_id_v2);

        EXCEPTION WHEN OTHERS THEN
            -- Garante limpeza mesmo em caso de erro
            DELETE FROM public.webhooks_ghl WHERE id IN (v_webhook_v1, v_webhook_v2);
            DELETE FROM public.oportunidades WHERE ghl_opportunity_id IN (v_opp_id_v1, v_opp_id_v2);
            DELETE FROM public.contatos WHERE ghl_id IN (v_contact_id_v1, v_contact_id_v2);

            webhook_id := rec.id;
            status := 'ERROR';
            detail := SQLERRM;
            RETURN NEXT;
            CONTINUE;
        END;

        webhook_id := rec.id;
        IF v_detail = '' THEN
            status := 'OK';
            detail := 'v1 e v2 equivalentes';
        ELSE
            status := 'DIFF';
            detail := v_detail;
        END IF;
        RETURN NEXT;
    END LOOP;

    RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.testar_parse_safe_date()
 RETURNS TABLE(input_text text, resultado timestamp with time zone, dia integer, mes integer, ano integer, status text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        v.input_text,
        parse_safe_date(v.input_text) AS resultado,
        EXTRACT(DAY FROM parse_safe_date(v.input_text))::int AS dia,
        EXTRACT(MONTH FROM parse_safe_date(v.input_text))::int AS mes,
        EXTRACT(YEAR FROM parse_safe_date(v.input_text))::int AS ano,
        CASE 
            WHEN parse_safe_date(v.input_text) IS NULL THEN 'NULL'
            ELSE 'OK'
        END AS status
    FROM (
        VALUES
            -- Formato ISO8601 (deve funcionar)
            ('2026-02-27'),
            ('2026-02-27T10:30:00'),
            ('2026-02-27T10:30:00Z'),
            ('2026-02-27T10:30:00-03:00'),
            
            -- Formato brasileiro DD/MM/YYYY (deve funcionar)
            ('27/02/2026'),
            ('15/01/2026'),
            ('01/12/2026'),
            
            -- Formato americano MM/DD/YYYY (deve funcionar)
            ('02/27/2026'),
            ('01/15/2026'),
            ('12/01/2026'),
            
            -- Casos ambíguos (deve priorizar DD/MM/YYYY)
            ('01/02/2026'),  -- Deve ser 1 de fevereiro, não 2 de janeiro
            ('05/06/2026'),  -- Deve ser 5 de junho, não 6 de maio
            
            -- Casos inválidos
            (''),
            (NULL::text),
            ('invalid'),
            ('32/13/2026'),
            ('2026-13-01')
    ) AS v(input_text);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_fn_enqueue_attribution_on_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_slot        TEXT;
  v_idempotency TEXT;
  v_base_url    TEXT := 'https://services.leadconnectorhq.com/contacts/';
BEGIN
  -- Pré-condições obrigatórias
  IF NEW.ghl_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.attribution_skip THEN RETURN NEW; END IF;
  IF NOT (LOWER(COALESCE(NEW.tags, '')) LIKE '%[cp] form-fb%') THEN RETURN NEW; END IF;

  -- contact_source: aceita NULL (GHL nem sempre preenche) ou começando com 'facebook'.
  -- A tag [cp] form-fb é suficiente para identificar o lead como Facebook form.
  IF NEW.contact_source IS NOT NULL
     AND LOWER(NEW.contact_source) NOT LIKE 'facebook%'
  THEN RETURN NEW; END IF;

  -- Só age se ainda há campo base vazio
  IF NEW.utm_source IS NOT NULL
     AND NEW.utm_campaign IS NOT NULL
     AND NEW.utm_medium IS NOT NULL
     AND NEW.utm_content IS NOT NULL
     AND NEW.utm_term IS NOT NULL
  THEN RETURN NEW; END IF;

  -- Calcula slot de 5 min (mesmo padrão do TypeScript)
  v_slot := to_char(
    date_trunc('hour', NOW()) +
    (floor(extract(minute FROM NOW()) / 5.0) * interval '5 minutes'),
    'YYYY-MM-DD"T"HH24:MI'
  );

  v_idempotency := 'sync-contact-attribution-fetch:' || NEW.id::text || ':' || v_slot;

  -- Enfileira (ON CONFLICT DO NOTHING via unique index de jobs ativos)
  PERFORM public.enqueue_ghl_api_job(
    p_url             := v_base_url || NEW.ghl_id,
    p_method          := 'GET',
    p_body            := NULL,
    p_priority        := 2,
    p_caller          := 'sync-contact-attribution-fetch',
    p_idempotency_key := v_idempotency,
    p_context         := jsonb_build_object(
                           'contato_id', NEW.id,
                           'ghl_id',     NEW.ghl_id,
                           'reason',     'facebook_form_missing_utm_trigger'
                         ),
    p_max_attempts    := 6
  );

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_weekly_reprocess_on_payment_fn()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_data_lead TIMESTAMPTZ;
  v_week_start DATE;
  v_workspace_id UUID;
BEGIN
  -- Só executa quando data_pagamento_entrada foi preenchida e há oportunidade
  IF NEW.data_pagamento_entrada IS NOT NULL AND NEW.oportunidade_id IS NOT NULL THEN
    -- Busca a semana cohort (data_lead_recebido) e o workspace da oportunidade
    SELECT
      o.data_lead_recebido,
      get_opportunity_workspace_id(o.id)
    INTO v_data_lead, v_workspace_id
    FROM public.oportunidades o
    WHERE o.id = NEW.oportunidade_id;

    -- Se encontrou data_lead_recebido, enfileira com workspace_id
    IF v_data_lead IS NOT NULL THEN
      v_week_start := v_data_lead::date - ((EXTRACT(DOW FROM v_data_lead::date)::int + 6) % 7);

      INSERT INTO public.weekly_reprocess_queue (workspace_id, week_start, report_type, reason, priority)
      VALUES (v_workspace_id, v_week_start, 'cohort', 'new_payment', 10)
      ON CONFLICT (workspace_id, week_start, report_type, reason) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_extrair_dados_ghl()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contact_ghl_id TEXT;
  v_type           TEXT;
BEGIN
  v_type := NEW.payload->>'type';

  -- Passo 1: processar dados do webhook (contatos, opps) usando mapeamentos configuraveis
  PERFORM public.extrair_dados_ghl_v2(NEW.id);

  -- Passo 2: processar tasks do GHL (mantido da migration 20260511000006)
  IF v_type IN ('TaskCreate', 'TaskUpdate', 'TaskComplete', 'TaskDelete') THEN
    PERFORM public.processar_task_ghl(NEW.id);
  END IF;

  -- Passo 3: sincronizar tags do contato imediatamente
  v_contact_ghl_id := TRIM(NEW.payload->>'contact_id');
  IF v_contact_ghl_id IS NOT NULL AND v_contact_ghl_id != '' THEN
    PERFORM public.sync_tags_from_webhook_target(v_contact_ghl_id);
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_sdr_ia_on_inbound_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;
  IF NEW.channel NOT IN ('whatsapp', 'sms') THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := '' || get_secret('supabase_url') || '/functions/v1/sdr-ia-orchestrator',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || get_secret('anon_key') || ''
    ),
    body    := jsonb_build_object('forcar_contato_id', NEW.contato_id::TEXT),
    timeout_milliseconds := 5000
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_sync_opp_dates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só dispara se é INSERT com data_lead_recebido NULL e ghl_opportunity_id preenchido
  IF TG_OP = 'INSERT'
     AND NEW.data_lead_recebido IS NULL
     AND NEW.ghl_opportunity_id IS NOT NULL
  THEN
    -- Dispara sync_opp_dates_job() assincronamente (non-blocking)
    -- A função interna trata rate limit da API GHL
    PERFORM sync_opp_dates_job();
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ai_conversations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ai_doc_chunks_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_bot_context_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_campaigns_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_conversation_title()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_message_count INTEGER;
    v_current_title TEXT;
BEGIN
    -- Only process user messages
    IF NEW.role = 'user' THEN
        -- Check if this is the first message in the conversation
        SELECT COUNT(*) INTO v_message_count
        FROM ai_messages
        WHERE conversation_id = NEW.conversation_id;
        
        -- Get current conversation title
        SELECT title INTO v_current_title
        FROM ai_conversations
        WHERE id = NEW.conversation_id;
        
        -- If first message and no title, set title from content (truncated)
        IF v_message_count = 0 AND (v_current_title IS NULL OR v_current_title = '') THEN
            UPDATE ai_conversations
            SET title = LEFT(NEW.content, 100)
            WHERE id = NEW.conversation_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_creative_comments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_creative_test_criteria_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_creative_tests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_creative_validations_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_meta_ads_action_columns_from_jsonb()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update landing_page_views
    UPDATE meta_ads_insights
    SET landing_page_views = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "landing_page_view").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update video_views
    UPDATE meta_ads_insights
    SET video_views = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "video_view").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update link_clicks
    UPDATE meta_ads_insights
    SET link_clicks = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "link_click").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update leads
    UPDATE meta_ads_insights
    SET leads = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "lead").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update onsite_web_leads
    UPDATE meta_ads_insights
    SET onsite_web_leads = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "onsite_web_lead").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    -- Update fb_pixel_leads
    UPDATE meta_ads_insights
    SET fb_pixel_leads = COALESCE(
        NULLIF(TRIM(REPLACE(jsonb_path_query_first(actions, '$[*] ? (@.action_type == "offsite_conversion.fb_pixel_lead").value')::text, '"', '')), '')::integer,
        0
    )
    WHERE actions IS NOT NULL AND actions != '[]'::jsonb;
    
    RAISE NOTICE 'Meta Ads action columns updated successfully';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_modified_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_notion_creatives_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_oportunidade_from_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Se o webhook tem opportunity_id, atualizar a oportunidade correspondente
    IF NEW.payload->>'id' IS NOT NULL AND TRIM(NEW.payload->>'id') != '' THEN
        UPDATE oportunidades
        SET
            -- =====================================================
            -- CAMPOS DE TEXTO
            -- =====================================================
            pipeline_name = NULLIF(TRIM(NEW.payload->>'pipeline_name'), ''),

            opportunity_source = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.source }}',
                    '{{opportunity.source}}'
                ]),
                opportunity_source
            ),

            vendedor_closer = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.assignedToUsersName}}',
                    '{{ opportunity.assignedToUsersName }}'
                ]),
                vendedor_closer
            ),

            lost_reason = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.lost_reason }}',
                    '{{opportunity.lost_reason}}'
                ]),
                lost_reason
            ),

            resumo_ia = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.resumo_ia }}',
                    '{{opportunity.resumo_ia}}'
                ]),
                resumo_ia
            ),

            percepcao_closer = COALESCE(
                extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.percepo_do_closer }}{{ opportunity.percepo_do_closer }}',
                    '{{opportunity.percepo_do_closer}}'
                ]),
                percepcao_closer
            ),

            -- data_ultima_atividade: coluna DATE — envolver em parse_date_flexible (fix bug tipo text vs date)
            data_ultima_atividade = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.ltima_atividade }}',
                    '{{opportunity.ltima_atividade}}'
                ])),
                data_ultima_atividade
            ),

            -- data_lead_recebido: NAO ATUALIZADA pelo webhook.
            -- Gerenciada exclusivamente pela edge function sync-opp-dates via API GHL.

            -- =====================================================
            -- CAMPOS DE DATA - TENTATIVAS (tipo DATE)
            -- =====================================================
            data_tentativa_1 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato1}}', '{{ opportunity.mqlcontato1 }}',
                    '{{ opportunity.d_mqlcontato1 }}', '{{opportunity.d_mqlcontato1}}'
                ])),
                data_tentativa_1
            ),
            data_tentativa_2 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato2}}', '{{ opportunity.mqlcontato2 }}',
                    '{{ opportunity.d_mqlcontato2 }}', '{{opportunity.d_mqlcontato2}}'
                ])),
                data_tentativa_2
            ),
            data_tentativa_3 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato3}}', '{{ opportunity.mqlcontato3 }}',
                    '{{ opportunity.d_mqlcontato3 }}', '{{opportunity.d_mqlcontato3}}'
                ])),
                data_tentativa_3
            ),
            data_tentativa_4 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato4}}', '{{ opportunity.mqlcontato4 }}',
                    '{{ opportunity.d_mqlcontato4 }}', '{{opportunity.d_mqlcontato4}}'
                ])),
                data_tentativa_4
            ),
            data_tentativa_5 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato5}}', '{{ opportunity.mqlcontato5 }}',
                    '{{ opportunity.d_mqlcontato5 }}', '{{opportunity.d_mqlcontato5}}'
                ])),
                data_tentativa_5
            ),
            data_tentativa_6 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato6}}', '{{ opportunity.mqlcontato6 }}',
                    '{{ opportunity.d_mqlcontato6 }}', '{{opportunity.d_mqlcontato6}}'
                ])),
                data_tentativa_6
            ),
            data_tentativa_7 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato7}}', '{{ opportunity.mqlcontato7 }}',
                    '{{ opportunity.d_mqlcontato7 }}', '{{opportunity.d_mqlcontato7}}'
                ])),
                data_tentativa_7
            ),
            data_tentativa_8 = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlcontato8}}', '{{ opportunity.mqlcontato8 }}',
                    '{{ opportunity.d_mqlcontato8 }}', '{{opportunity.d_mqlcontato8}}'
                ])),
                data_tentativa_8
            ),

            -- =====================================================
            -- CAMPOS DE DATA - PRÉ-VENDA (tipo DATE)
            -- =====================================================
            data_no_show = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlno_show}}', '{{ opportunity.mqlno_show }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlno_show}}', '{{ opportunity.sqlno_show }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlno_show }}', '{{opportunity.d_mqlno_show}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}'
                ])),
                data_no_show
            ),
            data_conectado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlconectado}}', '{{ opportunity.mqlconectado }}',
                    '{{ opportunity.d_mqlconectado }}', '{{opportunity.d_mqlconectado}}'
                ])),
                data_conectado
            ),
            data_agendamento_reuniao = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlreunio_marcada}}', '{{ opportunity.mqlreunio_marcada }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlreunio_agendada}}', '{{ opportunity.sqlreunio_agendada }}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlreunio_marcada }}', '{{opportunity.d_mqlreunio_marcada}}'
                ])),
                data_agendamento_reuniao
            ),
            data_perdido = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.mqlperdido }}', '{{opportunity.mqlperdido}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_mqlperdido }}', '{{opportunity.d_mqlperdido}}'
                ])),
                data_perdido
            ),
            data_qualificado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.mqlqualificado}}', '{{ opportunity.mqlqualificado }}',
                    '{{ opportunity.d_mqlqualificado }}', '{{opportunity.d_mqlqualificado}}'
                ])),
                data_qualificado
            ),

            -- =====================================================
            -- CAMPOS DE DATA - VENDAS (tipo DATE)
            -- =====================================================
            data_no_show_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlno_show}}', '{{ opportunity.sqlno_show }}',
                    '{{ opportunity.d_sqlno_show }}', '{{opportunity.d_sqlno_show}}'
                ])),
                data_no_show_vendas
            ),
            data_perdido_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlperdida }}', '{{opportunity.sqlperdida}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlperdida }}', '{{opportunity.d_sqlperdida}}'
                ])),
                data_perdido_vendas
            ),
            data_agendamento_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{opportunity.sqlreunio_agendada}}', '{{ opportunity.sqlreunio_agendada }}',
                    '{{ opportunity.d_sqlreunio_agendada }}', '{{opportunity.d_sqlreunio_agendada}}'
                ])),
                data_agendamento_vendas
            ),
            data_realizacao_vendas = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlreunio_realizada }}', '{{opportunity.sqlreunio_realizada}}'
                ])),
                data_realizacao_vendas
            ),
            data_negociacao = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlnegociao }}', '{{opportunity.sqlnegociao}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d_sqlnegociao }}', '{{opportunity.d_sqlnegociao}}'
                ])),
                data_negociacao
            ),
            data_fechado = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlfechada }}', '{{opportunity.sqlfechada}}',
                    '{{ opportunity.d_sqlfechada }}', '{{opportunity.d_sqlfechada}}'
                ])),
                data_fechado
            ),
            data_pendencias_preenchimento = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.sqlpendencias_preenchimento }}', '{{opportunity.sqlpendencias_preenchimento}}'
                ])),
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.d__sqlpendencias_preenchimento }}', '{{opportunity.d__sqlpendencias_preenchimento}}'
                ])),
                data_pendencias_preenchimento
            ),

            -- =====================================================
            -- CAMPOS DE DATA - REUNIÃO (tipo DATE)
            -- =====================================================
            data_reuniao_agendada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.data_da_reunio }}', '{{opportunity.data_da_reunio}}'
                ])),
                data_reuniao_agendada
            ),
            data_reuniao_realizada = COALESCE(
                parse_date_flexible(extract_custom_field(NEW.payload->'customData', ARRAY[
                    '{{ opportunity.reuniao_realizada }}', '{{opportunity.reuniao_realizada}}',
                    '{{ opportunity.data_da_reunio_realizada }}', '{{opportunity.data_da_reunio_realizada}}'
                ])),
                data_reuniao_realizada
            ),

            updated_at = NOW()

        WHERE ghl_opportunity_id = TRIM(NEW.payload->>'id');
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_stevo_whatsapp_calls_att1_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
              BEGIN NEW.updated_at = now() - interval '3 hours'; RETURN NEW; END;
              $function$
;

CREATE OR REPLACE FUNCTION public.update_stevo_whatsapp_calls_att2_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
              BEGIN NEW.updated_at = now() - interval '3 hours'; RETURN NEW; END;
              $function$
;

CREATE OR REPLACE FUNCTION public.update_stevo_whatsapp_calls_att3_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
              BEGIN NEW.updated_at = now() - interval '3 hours'; RETURN NEW; END;
              $function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_weekly_email_schedule(p_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean, p_modules text[] DEFAULT NULL::text[], p_report_type text DEFAULT NULL::text, p_frequency text DEFAULT NULL::text, p_day_of_week integer DEFAULT NULL::integer, p_day_of_month integer DEFAULT NULL::integer, p_time_of_day time without time zone DEFAULT NULL::time without time zone, p_subject text DEFAULT NULL::text, p_recipient_emails text[] DEFAULT NULL::text[], p_reply_to text DEFAULT NULL::text, p_template_key text DEFAULT NULL::text, p_include_comparative boolean DEFAULT NULL::boolean, p_include_trends boolean DEFAULT NULL::boolean, p_clara_prompt text DEFAULT NULL::text, p_use_clara_summary boolean DEFAULT NULL::boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_schedule public.weekly_email_schedules%ROWTYPE;
  v_next_run TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_schedule FROM public.weekly_email_schedules WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Se agendamento mudou, recalcula next_run_at
  IF p_frequency IS NOT NULL OR p_day_of_week IS NOT NULL OR p_day_of_month IS NOT NULL OR p_time_of_day IS NOT NULL THEN
    v_next_run := public.calculate_next_run_at(
      COALESCE(p_frequency, v_schedule.frequency),
      COALESCE(p_day_of_week, v_schedule.day_of_week),
      COALESCE(p_day_of_month, v_schedule.day_of_month),
      COALESCE(p_time_of_day, v_schedule.time_of_day),
      'America/Sao_Paulo',
      NOW()
    );
  END IF;

  UPDATE public.weekly_email_schedules
  SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    is_active = COALESCE(p_is_active, is_active),
    modules = COALESCE(p_modules, modules),
    report_type = COALESCE(p_report_type, report_type),
    frequency = COALESCE(p_frequency, frequency),
    day_of_week = COALESCE(p_day_of_week, day_of_week),
    day_of_month = COALESCE(p_day_of_month, day_of_month),
    time_of_day = COALESCE(p_time_of_day, time_of_day),
    next_run_at = COALESCE(v_next_run, next_run_at),
    subject = COALESCE(p_subject, subject),
    recipient_emails = COALESCE(p_recipient_emails, recipient_emails),
    reply_to = COALESCE(p_reply_to, reply_to),
    template_key = COALESCE(p_template_key, template_key),
    include_comparative = COALESCE(p_include_comparative, include_comparative),
    include_trends = COALESCE(p_include_trends, include_trends),
    clara_prompt = COALESCE(p_clara_prompt, clara_prompt),
    use_clara_summary = COALESCE(p_use_clara_summary, use_clara_summary)
  WHERE id = p_id;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_workspace_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_meta_ads_campaign(p_campaign_id text, p_account_id text, p_name text, p_status text, p_objective text, p_daily_budget numeric, p_lifetime_budget numeric, p_start_time timestamp with time zone, p_stop_time timestamp with time zone, p_created_time timestamp with time zone, p_updated_time timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.meta_ads_campaigns (
        campaign_id,
        account_id,
        name,
        status,
        objective,
        daily_budget,
        lifetime_budget,
        start_time,
        stop_time,
        created_time,
        updated_time,
        fetched_at
    )
    VALUES (
        p_campaign_id,
        p_account_id,
        p_name,
        p_status,
        p_objective,
        p_daily_budget,
        p_lifetime_budget,
        p_start_time,
        p_stop_time,
        p_created_time,
        p_updated_time,
        NOW()
    )
    ON CONFLICT (campaign_id) 
    DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        objective = EXCLUDED.objective,
        daily_budget = EXCLUDED.daily_budget,
        lifetime_budget = EXCLUDED.lifetime_budget,
        start_time = EXCLUDED.start_time,
        stop_time = EXCLUDED.stop_time,
        updated_time = EXCLUDED.updated_time,
        fetched_at = NOW()
    RETURNING id INTO v_id;
    
    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verificar_progresso_backfill(p_controle_id uuid)
 RETURNS TABLE(total_dias integer, dias_processados integer, dias_pendentes integer, dias_erro integer, percentual numeric, status text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        c.total_dias,
        c.dias_processados,
        (SELECT COUNT(*)::INTEGER FROM meta_ads_backfill_log WHERE controle_id = p_controle_id AND status = 'pending'),
        (SELECT COUNT(*)::INTEGER FROM meta_ads_backfill_log WHERE controle_id = p_controle_id AND status = 'error'),
        ROUND((c.dias_processados::NUMERIC / c.total_dias::NUMERIC) * 100, 2),
        c.status
    FROM meta_ads_backfill_controle c
    WHERE c.id = p_controle_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verificar_status_backfill()
 RETURNS TABLE(id uuid, data_inicio date, data_fim date, status text, dias_total bigint, dias_processados bigint, dias_com_erro bigint, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.data_inicio,
        c.data_fim,
        c.status,
        (SELECT COUNT(*) FROM meta_ads_backfill_log l WHERE l.controle_id = c.id) as dias_total,
        (SELECT COUNT(*) FROM meta_ads_backfill_log l WHERE l.controle_id = c.id AND l.status = 'success') as dias_processados,
        (SELECT COUNT(*) FROM meta_ads_backfill_log l WHERE l.controle_id = c.id AND l.status = 'error') as dias_com_erro,
        c.created_at
    FROM meta_ads_backfill_controle c
    ORDER BY c.created_at DESC
    LIMIT 10;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_email_dispatcher_job()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_schedule RECORD;
  v_auth_header TEXT;
  v_url TEXT;
  v_body TEXT;
BEGIN
  -- Busca token de autorização interno
  SELECT value INTO v_auth_header
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_auth_header IS NULL THEN
    RAISE EXCEPTION 'supabase_anon_key não configurado em app_config';
  END IF;

  v_auth_header := 'Bearer ' || v_auth_header;
  v_url := COALESCE(
    (SELECT value FROM public.app_config WHERE key = 'supabase_url'),
    get_secret('supabase_url')
  ) || '/functions/v1/send-weekly-report-email';

  FOR v_schedule IN
    SELECT id
    FROM public.weekly_email_schedules
    WHERE is_active = true
      AND next_run_at <= NOW()
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    v_body := json_build_object('schedule_id', v_schedule.id)::TEXT;

    BEGIN
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Authorization', v_auth_header,
          'Content-Type', 'application/json'
        ),
        body := v_body
      );

      -- Marca como processado (a edge function atualizará last_run_at e next_run_at)
      UPDATE public.weekly_email_schedules
      SET last_run_at = NOW()
      WHERE id = v_schedule.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.weekly_email_schedules
      SET last_error = SQLERRM
      WHERE id = v_schedule.id;

      INSERT INTO public.weekly_email_logs (schedule_id, status, error_message)
      VALUES (v_schedule.id, 'failed', SQLERRM);
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_reports_auth_header()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token TEXT;
BEGIN
  SELECT value INTO v_token
  FROM public.app_config
  WHERE key = 'supabase_anon_key';

  IF v_token IS NULL OR v_token = '' THEN
    v_token := get_secret('anon_key');
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    v_token := get_secret('anon_key');
  END IF;

  IF v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'weekly_reports_auth_header: nenhum token anon key configurado em app_config(supabase_anon_key) nem em app.settings';
  END IF;

  RETURN 'Bearer ' || v_token;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url          TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_week_start   DATE;
  v_workspace    RECORD;
  v_request_id   BIGINT;
  v_count        INTEGER := 0;
BEGIN
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  FOR v_workspace IN
    SELECT DISTINCT w.id
    FROM public.workspaces w
    JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.is_active = true
    ORDER BY w.id
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', public.weekly_reports_auth_header()
      ),
      body := jsonb_build_object(
        'report_type',  'cohort',
        'week_start',   v_week_start,
        'workspace_id', v_workspace.id::text
      )
    ) INTO v_request_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' workspaces | Week: ' || v_week_start || ' | Type: cohort';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_reports_cohort_reprocess_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url        TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_workspace  RECORD;
  v_item       RECORD;
  v_request_id BIGINT;
  v_count      INTEGER := 0;
BEGIN
  -- Para cada workspace ativo, consome até 5 itens pendentes da fila.
  -- Itens com workspace_id IS NULL (legado) não são processados aqui;
  -- eles devem ser backfilled/migrados antes de reprocessar.
  FOR v_workspace IN
    SELECT id FROM public.workspaces ORDER BY id
  LOOP
    FOR v_item IN
      SELECT id, week_start, report_type
      FROM public.weekly_reprocess_queue
      WHERE processed_at IS NULL
        AND workspace_id = v_workspace.id
      ORDER BY priority DESC, created_at ASC
      LIMIT 5
    LOOP
      SELECT net.http_post(
        url     := v_url,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', public.weekly_reports_auth_header()
        ),
        body := jsonb_build_object(
          'report_type',  v_item.report_type,
          'week_start',   v_item.week_start,
          'workspace_id', v_workspace.id::text,
          'reprocess',    true
        )
      ) INTO v_request_id;

      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' items';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_reports_finalize_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.weekly_snapshots
  SET status       = 'finalized',
      finalized_at = NOW()
  WHERE week_start < CURRENT_DATE - 7
    AND report_type = 'produtividade'
    AND status != 'finalized';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN 'Finalized: ' || v_count || ' snapshots';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_reports_produtividade_job()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_url          TEXT := '' || get_secret('supabase_url') || '/functions/v1/compute-weekly-reports';
  v_week_start   DATE;
  v_workspace    RECORD;
  v_request_id   BIGINT;
  v_count        INTEGER := 0;
BEGIN
  -- Segunda-feira da semana anterior
  v_week_start := CURRENT_DATE - ((EXTRACT(DOW FROM CURRENT_DATE)::int + 6) % 7) - 7;

  FOR v_workspace IN
    SELECT DISTINCT w.id
    FROM public.workspaces w
    JOIN public.workspace_members wm ON wm.workspace_id = w.id
    WHERE wm.is_active = true
    ORDER BY w.id
  LOOP
    SELECT net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', public.weekly_reports_auth_header()
      ),
      body := jsonb_build_object(
        'report_type',  'produtividade',
        'week_start',   v_week_start,
        'workspace_id', v_workspace.id::text
      )
    ) INTO v_request_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN 'Dispatched: ' || v_count || ' workspaces | Week: ' || v_week_start || ' | Type: produtividade';
END;
$function$
;

-- Views

CREATE OR REPLACE VIEW public.ai_conversation_stats AS
 SELECT c.id AS conversation_id,
    c.user_id,
    c.title,
    c.created_at,
    c.updated_at,
    count(m.id) AS message_count,
    sum(COALESCE(m.tokens_used, 0)) AS total_tokens,
    count(DISTINCT m.model_used) AS models_used
   FROM (public.ai_conversations c
     LEFT JOIN public.ai_messages m ON ((m.conversation_id = c.id)))
  GROUP BY c.id, c.user_id, c.title, c.created_at, c.updated_at;
CREATE OR REPLACE VIEW public.ai_doc_index_summary AS
 SELECT doc_path,
    status,
    chunk_count,
    last_indexed_at,
    error_message,
    created_at
   FROM public.ai_doc_index_status
  ORDER BY doc_path;
CREATE OR REPLACE VIEW public.comunicacoes_com_remetente WITH (security_invoker='true') AS
 SELECT c.id,
    c.contato_id,
    c.tipo,
    c.mensagem_body,
    c.mensagem_subject,
    c.mensagem_attachments,
    c.ai_summary,
    c.ai_transcript,
    c.phone_call_from,
    c.phone_call_to,
    c.phone_call_duration,
    c.phone_call_from_city,
    c.phone_call_from_state,
    c.phone_call_answered_by_phone,
    c.phone_call_answered_by_name,
    c.phone_call_start_time,
    c.phone_call_end_time,
    c.phone_call_status,
    c.phone_call_dispositions,
    c.created_at,
    c.direction,
    c.ghl_message_id,
    c.ghl_conversation_id,
    c.channel,
    c.data_comunicacao,
    c.attachments,
    c.usuario_ghl_id,
    c.contato_nome,
    c.contato_email,
    c.contato_telefone,
    c.sdr_name,
    c.sdr_email,
    c.closer_name,
    c.ghl_source,
    c.msg_status,
    c.ghl_date_updated,
    c.alt_id,
    c.error_msg,
    c.msg_from,
    c.msg_to,
    c.ghl_assigned_to,
    gu.nome AS remetente_nome,
    gu.papeis AS remetente_papeis,
    gu.email AS remetente_email,
        CASE
            WHEN ((c.direction = 'outbound'::text) AND ((c.ghl_source = ANY (ARRAY['workflow'::text, 'api'::text, 'bot'::text])) OR ((c.ghl_source IS NULL) AND (c.usuario_ghl_id IS NULL)))) THEN true
            ELSE false
        END AS is_automatico,
        CASE
            WHEN (c.direction = 'inbound'::text) THEN 'lead'::text
            WHEN ((c.direction = 'outbound'::text) AND (c.ghl_source = 'workflow'::text)) THEN 'automacao'::text
            WHEN ((c.direction = 'outbound'::text) AND (c.ghl_source = 'api'::text)) THEN 'automacao'::text
            WHEN ((c.direction = 'outbound'::text) AND (c.ghl_source = 'bot'::text)) THEN 'automacao'::text
            WHEN ((c.direction = 'outbound'::text) AND (c.usuario_ghl_id IS NULL) AND (c.ghl_source IS NULL)) THEN 'automacao'::text
            WHEN ((c.direction = 'outbound'::text) AND (gu.papeis IS NOT NULL) AND (array_length(gu.papeis, 1) > 0)) THEN gu.papeis[1]
            WHEN ((c.direction = 'outbound'::text) AND (gu.nome IS NOT NULL)) THEN gu.nome
            WHEN (c.direction = 'outbound'::text) THEN 'time'::text
            ELSE 'desconhecido'::text
        END AS autor
   FROM (public.comunicacoes c
     LEFT JOIN public.ghl_users gu ON ((gu.ghl_id = c.usuario_ghl_id)));
CREATE OR REPLACE VIEW public.v_creative_metrics AS
 WITH meta_by_creative AS (
         SELECT (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[2] AS creative_num,
            (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[1] AS creative_prefix,
            sum(meta_ads_insights.spend) AS total_spend,
            sum(meta_ads_insights.impressions) AS total_impressions,
            sum(meta_ads_insights.clicks) AS total_clicks,
            sum(meta_ads_insights.leads) AS total_leads_meta,
            sum(meta_ads_insights.landing_page_views) AS total_lp_views,
            sum(meta_ads_insights.video_views) AS total_video_views,
            avg(meta_ads_insights.ctr) AS avg_ctr,
            avg(meta_ads_insights.cpm) AS avg_cpm
           FROM public.meta_ads_insights
          WHERE (meta_ads_insights.ad_name ~ '(CR|AN)-\d+'::text)
          GROUP BY (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[2], (regexp_match(meta_ads_insights.ad_name, '(CR|AN)-(\d+)'::text))[1]
        ), crm_by_creative AS (
         SELECT (regexp_match(c_1.utm_term, '(CR|AN)-(\d+)'::text))[2] AS creative_num,
            (regexp_match(c_1.utm_term, '(CR|AN)-(\d+)'::text))[1] AS creative_prefix,
            count(*) AS total_leads_crm,
            count(*) FILTER (WHERE (c_1.tags ~~* '%mql%'::text)) AS total_mql,
            count(*) FILTER (WHERE (o.data_realizacao_vendas IS NOT NULL)) AS total_reunioes,
            count(*) FILTER (WHERE (vf.data_pagamento_entrada IS NOT NULL)) AS total_vendas,
            COALESCE(sum(vf.valor_faturado), (0)::numeric) AS total_faturamento,
            COALESCE(sum(vf.valor_entrada), (0)::numeric) AS total_caixa
           FROM ((public.oportunidades o
             JOIN public.contatos c_1 ON ((c_1.id = o.contato_id)))
             LEFT JOIN public.vendas_fechamento vf ON ((vf.oportunidade_id = o.id)))
          WHERE (c_1.utm_term ~ '(CR|AN)-\d+'::text)
          GROUP BY (regexp_match(c_1.utm_term, '(CR|AN)-(\d+)'::text))[2], (regexp_match(c_1.utm_term, '(CR|AN)-(\d+)'::text))[1]
        )
 SELECT ((m.creative_prefix || '-'::text) || m.creative_num) AS creative_code,
    nc.id AS creative_id,
    nc.workspace_id,
    nc.name AS creative_name,
    nc.external_id,
    nc.format,
    nc.profile,
    m.total_spend,
    m.total_impressions,
    m.total_clicks,
    m.total_leads_meta,
    m.total_lp_views,
    m.total_video_views,
    m.avg_ctr,
    m.avg_cpm,
    COALESCE(c.total_leads_crm, (0)::bigint) AS leads_crm,
    COALESCE(c.total_mql, (0)::bigint) AS mql_count,
    COALESCE(c.total_reunioes, (0)::bigint) AS reunioes,
    COALESCE(c.total_vendas, (0)::bigint) AS vendas,
    COALESCE(c.total_faturamento, (0)::numeric) AS faturamento,
    COALESCE(c.total_caixa, (0)::numeric) AS caixa,
        CASE
            WHEN (c.total_leads_crm > 0) THEN (m.total_spend / (c.total_leads_crm)::numeric)
            ELSE NULL::numeric
        END AS cpl_crm,
        CASE
            WHEN (c.total_mql > 0) THEN (m.total_spend / (c.total_mql)::numeric)
            ELSE NULL::numeric
        END AS cpmql,
        CASE
            WHEN (c.total_vendas > 0) THEN (m.total_spend / (c.total_vendas)::numeric)
            ELSE NULL::numeric
        END AS cpv,
        CASE
            WHEN (m.total_spend > (0)::numeric) THEN (c.total_faturamento / m.total_spend)
            ELSE NULL::numeric
        END AS roas
   FROM ((meta_by_creative m
     LEFT JOIN crm_by_creative c ON (((c.creative_num = m.creative_num) AND (c.creative_prefix = m.creative_prefix))))
     LEFT JOIN public.notion_creatives nc ON (((nc.external_id = ((m.creative_prefix || '-'::text) || m.creative_num)) AND (nc.database_type = 'paid'::text))));
CREATE OR REPLACE VIEW public.v_creative_status_counts AS
 SELECT workspace_id,
    status,
    count(*) AS total,
    count(*) FILTER (WHERE (source = 'notion'::text)) AS from_notion,
    count(*) FILTER (WHERE (source = 'native'::text)) AS from_native
   FROM public.notion_creatives
  GROUP BY workspace_id, status;
CREATE OR REPLACE VIEW public.v_disparo_metricas AS
 WITH tags_por_disparo AS (
         SELECT d_1.id AS disparo_id,
            d_1.workspace_id,
            d_1.nome AS disparo_nome,
            d_1.cor,
            d_1.is_active,
            dt.significado,
            lower(TRIM(BOTH FROM dt.tag)) AS tag
           FROM (public.disparos d_1
             JOIN public.disparo_tags dt ON (((dt.disparo_id = d_1.id) AND (dt.workspace_id = d_1.workspace_id))))
        ), trigger_contatos AS (
         SELECT tpd.disparo_id,
            tpd.workspace_id,
            c.id AS contato_id,
            c.updated_at AS tagged_at
           FROM (tags_por_disparo tpd
             JOIN public.contatos c ON ((c.workspace_id = tpd.workspace_id)))
          WHERE ((tpd.significado = 'trigger'::text) AND public.contato_tem_tag(c.tags, tpd.tag))
        ), metricas AS (
         SELECT tc.disparo_id,
            tc.workspace_id,
            count(DISTINCT tc.contato_id) AS trigger_count,
            count(DISTINCT
                CASE
                    WHEN ((tpd.significado = 'respondeu'::text) AND public.contato_tem_tag(c.tags, tpd.tag)) THEN tc.contato_id
                    ELSE NULL::uuid
                END) AS respondeu_count,
            count(DISTINCT
                CASE
                    WHEN ((tpd.significado = 'parou'::text) AND public.contato_tem_tag(c.tags, tpd.tag)) THEN tc.contato_id
                    ELSE NULL::uuid
                END) AS parou_count,
            count(DISTINCT
                CASE
                    WHEN ((tpd.significado = 'erro'::text) AND public.contato_tem_tag(c.tags, tpd.tag)) THEN tc.contato_id
                    ELSE NULL::uuid
                END) AS erro_count,
            count(DISTINCT
                CASE
                    WHEN ((tpd.significado = 'nao_respondeu'::text) AND public.contato_tem_tag(c.tags, tpd.tag)) THEN tc.contato_id
                    ELSE NULL::uuid
                END) AS nao_respondeu_count,
            count(DISTINCT
                CASE
                    WHEN ((tpd.significado = 'converteu'::text) AND public.contato_tem_tag(c.tags, tpd.tag)) THEN tc.contato_id
                    ELSE NULL::uuid
                END) AS converteu_count,
            min(tc.tagged_at) AS primeiro_trigger,
            max(tc.tagged_at) AS ultimo_trigger
           FROM ((trigger_contatos tc
             LEFT JOIN tags_por_disparo tpd ON (((tpd.disparo_id = tc.disparo_id) AND (tpd.workspace_id = tc.workspace_id) AND (tpd.significado <> 'trigger'::text))))
             LEFT JOIN public.contatos c ON (((c.id = tc.contato_id) AND (c.workspace_id = tc.workspace_id))))
          GROUP BY tc.disparo_id, tc.workspace_id
        )
 SELECT d.id AS disparo_id,
    d.workspace_id,
    d.nome AS disparo_nome,
    d.descricao,
    d.cor,
    d.is_active,
    d.tipo_mensagem,
    COALESCE(m.trigger_count, (0)::bigint) AS trigger_count,
    COALESCE(m.respondeu_count, (0)::bigint) AS respondeu_count,
    COALESCE(m.parou_count, (0)::bigint) AS parou_count,
    COALESCE(m.erro_count, (0)::bigint) AS erro_count,
    COALESCE(m.nao_respondeu_count, (0)::bigint) AS nao_respondeu_count,
    COALESCE(m.converteu_count, (0)::bigint) AS converteu_count,
        CASE
            WHEN (COALESCE(m.trigger_count, (0)::bigint) = 0) THEN (0)::numeric
            ELSE round((((m.respondeu_count)::numeric / (m.trigger_count)::numeric) * (100)::numeric), 2)
        END AS taxa_resposta_pct,
        CASE
            WHEN (COALESCE(m.trigger_count, (0)::bigint) = 0) THEN (0)::numeric
            ELSE round((((m.parou_count)::numeric / (m.trigger_count)::numeric) * (100)::numeric), 2)
        END AS taxa_parou_pct,
        CASE
            WHEN (COALESCE(m.trigger_count, (0)::bigint) = 0) THEN (0)::numeric
            ELSE round((((m.erro_count)::numeric / (m.trigger_count)::numeric) * (100)::numeric), 2)
        END AS taxa_erro_pct,
        CASE
            WHEN (COALESCE(m.trigger_count, (0)::bigint) = 0) THEN (0)::numeric
            ELSE round((((m.converteu_count)::numeric / (m.trigger_count)::numeric) * (100)::numeric), 2)
        END AS taxa_conversao_pct,
        CASE
            WHEN (d.tipo_mensagem = 'utility'::text) THEN COALESCE(wpc.preco_utility, (0)::numeric)
            ELSE COALESCE(wpc.preco_marketing, (0)::numeric)
        END AS preco_unitario,
    ((COALESCE(m.trigger_count, (0)::bigint))::numeric *
        CASE
            WHEN (d.tipo_mensagem = 'utility'::text) THEN COALESCE(wpc.preco_utility, (0)::numeric)
            ELSE COALESCE(wpc.preco_marketing, (0)::numeric)
        END) AS custo_estimado,
    m.primeiro_trigger,
    m.ultimo_trigger
   FROM ((public.disparos d
     LEFT JOIN metricas m ON (((m.disparo_id = d.id) AND (m.workspace_id = d.workspace_id))))
     LEFT JOIN public.whatsapp_pricing_config wpc ON ((wpc.workspace_id = d.workspace_id)));
CREATE OR REPLACE VIEW public.v_meta_ads_daily_summary WITH (security_invoker='true') AS
 SELECT account_id,
    campaign_id,
    date,
    sum(spend) AS total_spend,
    sum(impressions) AS total_impressions,
    sum(clicks) AS total_clicks,
    sum(reach) AS total_reach,
        CASE
            WHEN (sum(impressions) > 0) THEN round((((sum(clicks))::numeric / (sum(impressions))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS avg_ctr,
        CASE
            WHEN (sum(clicks) > 0) THEN round((sum(spend) / (sum(clicks))::numeric), 2)
            ELSE (0)::numeric
        END AS avg_cpc
   FROM public.meta_ads_insights
  GROUP BY account_id, campaign_id, date;
CREATE OR REPLACE VIEW public.v_meta_ads_ultimas_syncs WITH (security_invoker='true') AS
 SELECT id,
    started_at,
    finished_at,
    status,
    records_fetched,
    records_inserted,
    execution_time_ms,
        CASE
            WHEN (error_message IS NOT NULL) THEN ("left"(error_message, 100) || '...'::text)
            ELSE NULL::text
        END AS error_preview
   FROM public.meta_ads_sync_log
  ORDER BY started_at DESC
 LIMIT 20;
CREATE OR REPLACE VIEW public.v_weekly_dashboard AS
 SELECT 'trafego'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    t.dimension,
    t.dimension_value,
    t.sub_dimension,
    t.sub_dimension_value,
    t.leads_count,
    t.mqls_count,
    t.conectados_count,
    t.agendados_count,
    t.reunioes_count,
    t.fechados_count,
    t.no_shows_count,
    t.negociacao_count,
    t.perdidos_count,
    t.faturamento_bruto,
    t.caixa_recebido,
    t.valor_entrada,
    t.meta_spend,
    t.meta_impressions,
    t.meta_clicks,
    t.meta_leads_actions,
    t.cpmql,
    t.cpv,
    t.roas,
    t.roas_caixa,
    t.ctr,
    t.ciclo_compra_dias,
    t.taxa_conexao_pct,
    t.taxa_agendamento_pct,
    t.taxa_reuniao_pct,
    t.taxa_conversao_pct,
    t.taxa_no_show_pct,
    t.extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_trafego t ON ((t.snapshot_id = s.id)))
UNION ALL
 SELECT 'aquisicao'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    a.dimension,
    a.dimension_value,
    a.sub_dimension,
    a.sub_dimension_value,
    a.leads_count,
    a.mqls_count,
    a.conectados_count,
    a.agendados_count,
    a.reunioes_count,
    a.fechados_count,
    a.no_shows_count,
    a.negociacao_count,
    a.perdidos_count,
    a.faturamento_bruto,
    a.caixa_recebido,
    a.valor_entrada,
    a.meta_spend,
    a.meta_impressions,
    a.meta_clicks,
    a.meta_leads_actions,
    a.cpmql,
    a.cpv,
    a.roas,
    a.roas_caixa,
    a.ctr,
    a.ciclo_compra_dias,
    a.taxa_conexao_pct,
    a.taxa_agendamento_pct,
    a.taxa_reuniao_pct,
    a.taxa_conversao_pct,
    a.taxa_no_show_pct,
    a.extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_aquisicao a ON ((a.snapshot_id = s.id)))
UNION ALL
 SELECT 'organico'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    o.dimension,
    o.dimension_value,
    o.sub_dimension,
    o.sub_dimension_value,
    o.leads_count,
    o.mqls_count,
    o.conectados_count,
    o.agendados_count,
    o.reunioes_count,
    o.fechados_count,
    o.no_shows_count,
    o.negociacao_count,
    o.perdidos_count,
    o.faturamento_bruto,
    o.caixa_recebido,
    NULL::numeric AS valor_entrada,
    0 AS meta_spend,
    0 AS meta_impressions,
    0 AS meta_clicks,
    0 AS meta_leads_actions,
    NULL::numeric AS cpmql,
    NULL::numeric AS cpv,
    NULL::numeric AS roas,
    NULL::numeric AS roas_caixa,
    NULL::numeric AS ctr,
    NULL::numeric AS ciclo_compra_dias,
    o.taxa_conexao_pct,
    o.taxa_agendamento_pct,
    o.taxa_reuniao_pct,
    o.taxa_conversao_pct,
    o.taxa_no_show_pct,
    o.extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_organico o ON ((o.snapshot_id = s.id)))
UNION ALL
 SELECT 'prevendas'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    p.dimension,
    p.dimension_value,
    p.sub_dimension,
    p.sub_dimension_value,
    p.leads_count,
    p.mqls_count,
    p.conectados_count,
    p.agendados_count,
    p.reunioes_count,
    p.fechados_count,
    p.no_shows_count,
    p.negociacao_count,
    p.perdidos_count,
    p.faturamento_bruto,
    p.caixa_recebido,
    NULL::numeric AS valor_entrada,
    0 AS meta_spend,
    0 AS meta_impressions,
    0 AS meta_clicks,
    0 AS meta_leads_actions,
    NULL::numeric AS cpmql,
    NULL::numeric AS cpv,
    NULL::numeric AS roas,
    NULL::numeric AS roas_caixa,
    NULL::numeric AS ctr,
    NULL::numeric AS ciclo_compra_dias,
    p.taxa_conexao_pct,
    p.taxa_agendamento_pct,
    p.taxa_reuniao_pct,
    p.taxa_conversao_pct,
    p.taxa_no_show_pct,
    (jsonb_build_object('ligacoes', p.ligacoes_count, 'mensagens', p.mensagens_count, 'pessoas_contatadas', p.pessoas_contatadas, 'leads_sem_resposta', p.leads_sem_resposta, 'avg_response_seconds', p.avg_response_seconds, 'taxa_sem_resposta_pct', p.taxa_sem_resposta_pct) || COALESCE(p.extras, '{}'::jsonb)) AS extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_prevendas p ON ((p.snapshot_id = s.id)))
UNION ALL
 SELECT 'vendas'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    v.dimension,
    v.dimension_value,
    v.sub_dimension,
    v.sub_dimension_value,
    v.leads_count,
    v.mqls_count,
    NULL::integer AS conectados_count,
    v.agendados_count,
    v.reunioes_count,
    v.fechados_count,
    v.no_shows_count,
    v.negociacao_count,
    v.perdidos_count,
    v.faturamento_bruto,
    v.caixa_recebido,
    v.valor_entrada,
    0 AS meta_spend,
    0 AS meta_impressions,
    0 AS meta_clicks,
    0 AS meta_leads_actions,
    NULL::numeric AS cpmql,
    NULL::numeric AS cpv,
    NULL::numeric AS roas,
    NULL::numeric AS roas_caixa,
    NULL::numeric AS ctr,
    v.ciclo_fechamento_dias AS ciclo_compra_dias,
    NULL::numeric AS taxa_conexao_pct,
    NULL::numeric AS taxa_agendamento_pct,
    NULL::numeric AS taxa_reuniao_pct,
    v.taxa_conversao_pct,
    v.taxa_no_show_pct,
    (jsonb_build_object('ligacoes', v.ligacoes_count, 'mensagens', v.mensagens_count, 'pessoas_contatadas', v.pessoas_contatadas, 'avg_response_seconds', v.avg_response_seconds, 'taxa_comparecimento_pct', v.taxa_comparecimento_pct, 'perdidos_apos_reuniao', v.perdidos_apos_reuniao, 'perdidos_sem_reuniao', v.perdidos_sem_reuniao) || COALESCE(v.extras, '{}'::jsonb)) AS extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_vendas v ON ((v.snapshot_id = s.id)))
UNION ALL
 SELECT 'recuperacao'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    r.dimension,
    r.dimension_value,
    r.sub_dimension,
    r.sub_dimension_value,
    r.leads_count,
    r.mqls_count,
    r.conectados_count,
    r.agendados_count,
    r.reunioes_count,
    r.fechados_count,
    r.no_shows_count,
    r.negociacao_count,
    r.perdidos_count,
    r.faturamento_bruto,
    r.caixa_recebido,
    NULL::numeric AS valor_entrada,
    0 AS meta_spend,
    0 AS meta_impressions,
    0 AS meta_clicks,
    0 AS meta_leads_actions,
    NULL::numeric AS cpmql,
    NULL::numeric AS cpv,
    NULL::numeric AS roas,
    NULL::numeric AS roas_caixa,
    NULL::numeric AS ctr,
    NULL::numeric AS ciclo_compra_dias,
    r.taxa_conexao_pct,
    r.taxa_agendamento_pct,
    r.taxa_reuniao_pct,
    r.taxa_conversao_pct,
    NULL::numeric AS taxa_no_show_pct,
    (jsonb_build_object('ligacoes', r.ligacoes_count, 'mensagens', r.mensagens_count, 'pessoas_contatadas', r.pessoas_contatadas, 'leads_sem_resposta', r.leads_sem_resposta, 'avg_response_seconds', r.avg_response_seconds) || COALESCE(r.extras, '{}'::jsonb)) AS extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_recuperacao r ON ((r.snapshot_id = s.id)))
UNION ALL
 SELECT 'sdr'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    sd.dimension,
    sd.dimension_value,
    sd.sub_dimension,
    sd.sub_dimension_value,
    sd.leads_count,
    NULL::integer AS mqls_count,
    sd.conectados_count,
    sd.agendados_count,
    sd.reunioes_count,
    sd.fechados_count,
    NULL::integer AS no_shows_count,
    NULL::integer AS negociacao_count,
    NULL::integer AS perdidos_count,
    sd.faturamento_bruto,
    sd.caixa_recebido,
    NULL::numeric AS valor_entrada,
    0 AS meta_spend,
    0 AS meta_impressions,
    0 AS meta_clicks,
    0 AS meta_leads_actions,
    NULL::numeric AS cpmql,
    NULL::numeric AS cpv,
    NULL::numeric AS roas,
    NULL::numeric AS roas_caixa,
    NULL::numeric AS ctr,
    NULL::numeric AS ciclo_compra_dias,
    sd.taxa_conexao_pct,
    sd.taxa_agendamento_pct,
    NULL::numeric AS taxa_reuniao_pct,
    sd.taxa_conversao_pct,
    NULL::numeric AS taxa_no_show_pct,
    (jsonb_build_object('ligacoes', sd.ligacoes_count, 'mensagens', sd.mensagens_count, 'pessoas_contatadas', sd.pessoas_contatadas, 'leads_sem_resposta', sd.leads_sem_resposta, 'avg_response_seconds', sd.avg_response_seconds, 'ultima_resposta_seconds', sd.ultima_resposta_seconds, 'taxa_agendamento_prazo_pct', sd.taxa_agendamento_prazo_pct, 'taxa_sem_resposta_pct', sd.taxa_sem_resposta_pct, 'agendados_no_prazo', sd.agendados_no_prazo) || COALESCE(sd.extras, '{}'::jsonb)) AS extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_sdr sd ON ((sd.snapshot_id = s.id)))
UNION ALL
 SELECT 'closer'::text AS module,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    c.dimension,
    c.dimension_value,
    c.sub_dimension,
    c.sub_dimension_value,
    c.leads_count,
    c.mqls_count,
    NULL::integer AS conectados_count,
    c.agendados_count,
    c.reunioes_count,
    c.fechados_count,
    c.no_shows_count,
    c.negociacao_count,
    NULL::integer AS perdidos_count,
    c.faturamento_bruto,
    c.caixa_recebido,
    NULL::numeric AS valor_entrada,
    0 AS meta_spend,
    0 AS meta_impressions,
    0 AS meta_clicks,
    0 AS meta_leads_actions,
    NULL::numeric AS cpmql,
    NULL::numeric AS cpv,
    NULL::numeric AS roas,
    NULL::numeric AS roas_caixa,
    NULL::numeric AS ctr,
    c.ciclo_fechamento_dias AS ciclo_compra_dias,
    NULL::numeric AS taxa_conexao_pct,
    NULL::numeric AS taxa_agendamento_pct,
    NULL::numeric AS taxa_reuniao_pct,
    c.taxa_conversao_pct,
    c.taxa_no_show_pct,
    (jsonb_build_object('ligacoes', c.ligacoes_count, 'mensagens', c.mensagens_count, 'pessoas_contatadas', c.pessoas_contatadas, 'avg_response_seconds', c.avg_response_seconds, 'leads_sem_resposta', c.leads_sem_resposta, 'taxa_comparecimento_pct', c.taxa_comparecimento_pct, 'taxa_sem_resposta_pct', c.taxa_sem_resposta_pct) || COALESCE(c.extras, '{}'::jsonb)) AS extras
   FROM (public.weekly_snapshots s
     JOIN public.weekly_closer c ON ((c.snapshot_id = s.id)));
CREATE OR REPLACE VIEW public.v_weekly_snapshots_status AS
 SELECT s.id,
    s.workspace_id,
    s.week_start,
    s.week_end,
    s.year_week,
    s.report_type,
    s.status,
    s.data_version,
    s.computed_at,
    s.finalized_at,
    s.computation_duration_ms,
    s.records_processed,
    s.error_message,
    COALESCE(t.cnt, (0)::bigint) AS trafego_records,
    COALESCE(a.cnt, (0)::bigint) AS aquisicao_records,
    COALESCE(o.cnt, (0)::bigint) AS organico_records,
    COALESCE(p.cnt, (0)::bigint) AS prevendas_records,
    COALESCE(v.cnt, (0)::bigint) AS vendas_records,
    COALESCE(r.cnt, (0)::bigint) AS recuperacao_records,
    COALESCE(sd.cnt, (0)::bigint) AS sdr_records,
    COALESCE(c.cnt, (0)::bigint) AS closer_records,
    COALESCE(m.cnt, (0)::bigint) AS metas_records,
    ((((((((COALESCE(t.cnt, (0)::bigint) + COALESCE(a.cnt, (0)::bigint)) + COALESCE(o.cnt, (0)::bigint)) + COALESCE(p.cnt, (0)::bigint)) + COALESCE(v.cnt, (0)::bigint)) + COALESCE(r.cnt, (0)::bigint)) + COALESCE(sd.cnt, (0)::bigint)) + COALESCE(c.cnt, (0)::bigint)) + COALESCE(m.cnt, (0)::bigint)) AS total_module_records
   FROM (((((((((public.weekly_snapshots s
     LEFT JOIN ( SELECT weekly_trafego.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_trafego
          GROUP BY weekly_trafego.snapshot_id) t ON ((t.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_aquisicao.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_aquisicao
          GROUP BY weekly_aquisicao.snapshot_id) a ON ((a.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_organico.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_organico
          GROUP BY weekly_organico.snapshot_id) o ON ((o.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_prevendas.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_prevendas
          GROUP BY weekly_prevendas.snapshot_id) p ON ((p.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_vendas.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_vendas
          GROUP BY weekly_vendas.snapshot_id) v ON ((v.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_recuperacao.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_recuperacao
          GROUP BY weekly_recuperacao.snapshot_id) r ON ((r.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_sdr.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_sdr
          GROUP BY weekly_sdr.snapshot_id) sd ON ((sd.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_closer.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_closer
          GROUP BY weekly_closer.snapshot_id) c ON ((c.snapshot_id = s.id)))
     LEFT JOIN ( SELECT weekly_metas.snapshot_id,
            count(*) AS cnt
           FROM public.weekly_metas
          GROUP BY weekly_metas.snapshot_id) m ON ((m.snapshot_id = s.id)));
CREATE OR REPLACE VIEW public.vw_amostra_datas_oportunidades WITH (security_invoker='true') AS
 SELECT id,
    ghl_opportunity_id,
    titulo AS name,
    data_lead_recebido,
    data_qualificado,
    data_agendamento_reuniao,
    data_fechado,
    EXTRACT(day FROM data_lead_recebido) AS dia_lead,
    EXTRACT(month FROM data_lead_recebido) AS mes_lead,
    EXTRACT(year FROM data_lead_recebido) AS ano_lead,
    updated_at
   FROM public.oportunidades
  WHERE (data_lead_recebido IS NOT NULL)
  ORDER BY updated_at DESC
 LIMIT 100;
CREATE OR REPLACE VIEW public.vw_comparacao_datas_webhook_oportunidade WITH (security_invoker='true') AS
 SELECT w.id AS webhook_id,
    (w.payload ->> 'id'::text) AS opportunity_id,
    o.titulo AS oportunidade_name,
    (w.payload ->> 'date_created'::text) AS data_original_texto,
    o.data_criacao_contato AS data_processada,
        CASE
            WHEN (o.data_criacao_contato IS NULL) THEN 'Sem data na tabela'::text
            WHEN ((w.payload ->> 'date_created'::text) IS NULL) THEN 'Sem data no webhook'::text
            ELSE 'OK'::text
        END AS status_comparacao
   FROM (public.webhooks_ghl w
     LEFT JOIN public.oportunidades o ON ((o.ghl_opportunity_id = (w.payload ->> 'id'::text))))
  ORDER BY w.created_at DESC
 LIMIT 50;
CREATE OR REPLACE VIEW public.vw_qualidade_datas_oportunidades WITH (security_invoker='true') AS
 SELECT count(*) AS total_oportunidades,
    count(data_lead_recebido) AS com_data_lead_recebido,
    count(data_qualificado) AS com_data_qualificado,
    count(data_agendamento_reuniao) AS com_data_agendamento_reuniao,
    count(data_conectado) AS com_data_conectado,
    count(data_fechado) AS com_data_fechado,
    count(*) FILTER (WHERE (data_lead_recebido > (now() + '1 day'::interval))) AS datas_futuras,
    count(*) FILTER (WHERE ((data_lead_recebido < '2020-01-01 00:00:00+00'::timestamp with time zone) AND (data_lead_recebido IS NOT NULL))) AS datas_muito_antigas,
    count(*) FILTER (WHERE ((data_lead_recebido IS NOT NULL) AND (EXTRACT(day FROM data_lead_recebido) > (12)::numeric))) AS datas_com_dia_maior_12,
    max(updated_at) AS ultima_atualizacao
   FROM public.oportunidades;

-- Indices

CREATE INDEX IF NOT EXISTS ai_analysis_sessions_expires ON public.ai_analysis_sessions USING btree (expires_at);
CREATE INDEX IF NOT EXISTS ai_analysis_sessions_user ON public.ai_analysis_sessions USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_embeddings_chunk_id_idx ON public.ai_embeddings USING btree (chunk_id);
CREATE INDEX IF NOT EXISTS ai_embeddings_embedding_idx ON public.ai_embeddings USING hnsw (embedding public.vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "aplic-acelerador_email" ON public."aplic-acelerador" USING btree (email) WHERE (email IS NOT NULL);
CREATE INDEX IF NOT EXISTS "aplic-acelerador_next_retry_at" ON public."aplic-acelerador" USING btree (next_retry_at) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS "aplic-acelerador_status_attempts" ON public."aplic-acelerador" USING btree (status, attempts, updated_at) WHERE (status = ANY (ARRAY['pending'::text, 'retrying'::text]));
CREATE INDEX IF NOT EXISTS "aplic-acelerador_utm_campaign" ON public."aplic-acelerador" USING btree (utm_campaign) WHERE (utm_campaign IS NOT NULL);
CREATE INDEX IF NOT EXISTS contact_opp_sync_queue_contact_id_idx ON public.contact_opp_sync_queue USING btree (ghl_contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS contact_opp_sync_queue_dedup ON public.contact_opp_sync_queue USING btree (ghl_contact_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS contact_opp_sync_queue_status_claimed_idx ON public.contact_opp_sync_queue USING btree (status, claimed_at, created_at);
CREATE INDEX IF NOT EXISTS contact_opp_sync_queue_status_created_idx ON public.contact_opp_sync_queue USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS ghl_opp_reconcile_items_run_status_created_idx ON public.ghl_opp_reconcile_items USING btree (run_id, status, created_at);
CREATE INDEX IF NOT EXISTS ghl_opp_reconcile_items_status_claimed_idx ON public.ghl_opp_reconcile_items USING btree (status, claimed_at, created_at);
CREATE INDEX IF NOT EXISTS ghl_opp_reconcile_runs_status_created_idx ON public.ghl_opp_reconcile_runs USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS ghl_tasks_contact_ghl_idx ON public.ghl_tasks USING btree (contact_ghl_id);
CREATE INDEX IF NOT EXISTS ghl_tasks_contato_id_idx ON public.ghl_tasks USING btree (contato_id) WHERE ((NOT completed) AND (NOT deleted));
CREATE INDEX IF NOT EXISTS ghl_tasks_due_date_idx ON public.ghl_tasks USING btree (due_date) WHERE ((NOT completed) AND (NOT deleted));
CREATE INDEX IF NOT EXISTS ghl_users_auth_user_id_idx ON public.ghl_users USING btree (auth_user_id);
CREATE INDEX IF NOT EXISTS ghl_users_ghl_id_idx ON public.ghl_users USING btree (ghl_id);
CREATE INDEX IF NOT EXISTS goal_definitions_app_slug_idx ON public.goal_definitions USING btree (workspace_id, app_slug);
CREATE INDEX IF NOT EXISTS goal_definitions_workspace_idx ON public.goal_definitions USING btree (workspace_id, metric_definition_id);
CREATE INDEX IF NOT EXISTS goal_snapshots_goal_version_idx ON public.goal_snapshots USING btree (goal_version_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS goal_versions_goal_definition_idx ON public.goal_versions USING btree (goal_definition_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_ads_campaigns_workspace ON public.ads_campaigns USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ads_catalog_creative ON public.ads_catalog USING btree (workspace_id, creative_id);
CREATE INDEX IF NOT EXISTS idx_ads_catalog_utm_source ON public.ads_catalog USING btree (workspace_id, utm_source);
CREATE INDEX IF NOT EXISTS idx_ads_catalog_workspace ON public.ads_catalog USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created ON public.ai_conversations USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON public.ai_conversations USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON public.ai_conversations USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_created ON public.ai_doc_chunks USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_doc_path ON public.ai_doc_chunks USING btree (doc_path);
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_embedding ON public.ai_doc_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_fts ON public.ai_doc_chunks USING gin (fts);
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_path ON public.ai_doc_chunks USING btree (doc_path);
CREATE INDEX IF NOT EXISTS idx_ai_doc_index_status_indexed ON public.ai_doc_index_status USING btree (last_indexed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_doc_index_status_path ON public.ai_doc_index_status USING btree (doc_path);
CREATE INDEX IF NOT EXISTS idx_ai_doc_index_status_status ON public.ai_doc_index_status USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages USING btree (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON public.ai_messages USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_role ON public.ai_messages USING btree (role);
CREATE INDEX IF NOT EXISTS idx_aplic_acelerador_page_url ON public."aplic-acelerador" USING btree (page_url);
CREATE INDEX IF NOT EXISTS idx_app_feature_role_perms_lookup ON public.app_feature_role_permissions USING btree (workspace_id, app_slug, feature_key, role);
CREATE INDEX IF NOT EXISTS idx_app_feature_user_overrides_lookup ON public.app_feature_user_overrides USING btree (workspace_id, app_slug, feature_key, user_id);
CREATE INDEX IF NOT EXISTS idx_app_role_permissions_lookup ON public.app_role_permissions USING btree (workspace_id, app_slug, role);
CREATE INDEX IF NOT EXISTS idx_app_role_permissions_workspace_id ON public.app_role_permissions USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_app_user_overrides_lookup ON public.app_user_overrides USING btree (workspace_id, app_slug, user_id);
CREATE INDEX IF NOT EXISTS idx_app_user_overrides_user_id ON public.app_user_overrides USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_app_user_overrides_workspace_id ON public.app_user_overrides USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log USING btree (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.permission_audit_log USING btree (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by ON public.permission_audit_log USING btree (workspace_id, performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log USING btree (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON public.permission_audit_log USING btree (workspace_id, target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_workspace ON public.permission_audit_log USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_action ON public.auth_audit_log USING btree (action);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at ON public.auth_audit_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_email ON public.auth_audit_log USING btree (email);
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id ON public.auth_audit_log USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_expires ON public.auth_password_reset_tokens USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_token_hash ON public.auth_password_reset_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_user_id ON public.auth_password_reset_tokens USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until ON public.auth_rate_limits USING btree (blocked_until);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_identifier_action ON public.auth_rate_limits USING btree (identifier, action);
CREATE INDEX IF NOT EXISTS idx_campaigns_workspace ON public.campaigns USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_alt_id ON public.comunicacoes USING btree (alt_id) WHERE (alt_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato ON public.comunicacoes USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato_channel_data ON public.comunicacoes USING btree (contato_id, channel, data_comunicacao DESC) WHERE (channel IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato_direction_created ON public.comunicacoes USING btree (contato_id, direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_contato_id ON public.comunicacoes USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_created ON public.comunicacoes USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_data_comunicacao ON public.comunicacoes USING btree (data_comunicacao DESC) WHERE (data_comunicacao IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_direction_source ON public.comunicacoes USING btree (direction, ghl_source) WHERE (direction IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_ghl_conversation_id ON public.comunicacoes USING btree (ghl_conversation_id) WHERE (ghl_conversation_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_ghl_source ON public.comunicacoes USING btree (ghl_source) WHERE (ghl_source IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_msg_status ON public.comunicacoes USING btree (msg_status) WHERE (msg_status IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_tipo ON public.comunicacoes USING btree (tipo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contact_opp_sync_queue_pending ON public.contact_opp_sync_queue USING btree (ghl_contact_id, location_id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_contatos_email ON public.contatos USING btree (email);
CREATE INDEX IF NOT EXISTS idx_contatos_ghl_id ON public.contatos USING btree (ghl_id);
CREATE INDEX IF NOT EXISTS idx_contatos_nome ON public.contatos USING btree (nome);
CREATE INDEX IF NOT EXISTS idx_contatos_workspace_id ON public.contatos USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_creative_audit_log_changed_at ON public.creative_audit_log USING btree (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_creative_audit_log_creative ON public.creative_audit_log USING btree (creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_comments_creative ON public.creative_comments USING btree (creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_comments_parent ON public.creative_comments USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_criteria_workspace ON public.creative_test_criteria USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_creative ON public.creative_test_history USING btree (creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_event ON public.creative_test_history USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_creative_test_history_test ON public.creative_test_history USING btree (test_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_creative ON public.creative_tests USING btree (creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_criteria ON public.creative_tests USING btree (criteria_id);
CREATE INDEX IF NOT EXISTS idx_creative_tests_status ON public.creative_tests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_creative_tests_workspace ON public.creative_tests USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_creative_validations_creative ON public.creative_validations USING btree (creative_id);
CREATE INDEX IF NOT EXISTS idx_creative_validations_workspace ON public.creative_validations USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_permissions_module_key ON public.dashboard_user_permissions USING btree (workspace_id, user_id, module_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_permissions_workspace_user ON public.dashboard_user_permissions USING btree (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_camada ON public.discagem_scores USING btree (camada, score DESC);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_contato ON public.discagem_scores USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_escopo ON public.discagem_scores USING btree (escopo);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_estado ON public.discagem_scores USING btree (estado, score DESC);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_workspace ON public.discagem_scores USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_workspace_escopo_score ON public.discagem_scores USING btree (workspace_id, escopo, score DESC);
CREATE INDEX IF NOT EXISTS idx_discagem_scores_workspace_score ON public.discagem_scores USING btree (workspace_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_disparo_campos_custom_valores_disparo ON public.disparo_campos_custom_valores USING btree (disparo_id);
CREATE INDEX IF NOT EXISTS idx_disparo_campos_custom_valores_workspace ON public.disparo_campos_custom_valores USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparo_campos_custom_workspace ON public.disparo_campos_custom USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparo_tags_disparo ON public.disparo_tags USING btree (disparo_id);
CREATE INDEX IF NOT EXISTS idx_disparo_tags_workspace ON public.disparo_tags USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparos_workspace ON public.disparos USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_disparos_workspace_active ON public.disparos USING btree (workspace_id, is_active);
CREATE INDEX IF NOT EXISTS idx_funnels_workspace ON public.funnels USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_dead ON public.ghl_api_jobs USING btree (created_at DESC) WHERE (status = 'dead'::text);
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_pending ON public.ghl_api_jobs USING btree (priority, next_retry_at) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_processing_claimed_at ON public.ghl_api_jobs USING btree (claimed_at) WHERE (status = 'processing'::text);
CREATE INDEX IF NOT EXISTS idx_ghl_api_jobs_unhandled_by_caller ON public.ghl_api_jobs USING btree (caller, processed_at) WHERE ((status = ANY (ARRAY['done'::text, 'dead'::text])) AND (handled_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_ghl_calendars_ghl_id ON public.ghl_calendars USING btree (ghl_id);
CREATE INDEX IF NOT EXISTS idx_ghl_calendars_workspace_id ON public.ghl_calendars USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_discovery_runs_created_at ON public.ghl_discovery_runs USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_ghl_discovery_runs_workspace_id ON public.ghl_discovery_runs USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_field_mapping_templates_name ON public.ghl_field_mapping_templates USING btree (name);
CREATE INDEX IF NOT EXISTS idx_ghl_field_mappings_logical_name ON public.ghl_field_mappings USING btree (workspace_id, logical_name);
CREATE INDEX IF NOT EXISTS idx_ghl_field_mappings_workspace_id ON public.ghl_field_mappings USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_integration_settings_workspace_id ON public.ghl_integration_settings USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opp_reconcile_items_contato_id ON public.ghl_opp_reconcile_items USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_ghl_pipeline_mappings_workspace_id ON public.ghl_pipeline_mappings USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_stage_mappings_pipeline_id ON public.ghl_stage_mappings USING btree (workspace_id, ghl_pipeline_id);
CREATE INDEX IF NOT EXISTS idx_ghl_stage_mappings_workspace_id ON public.ghl_stage_mappings USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_mode_status_finished ON public.ghl_conversations_sync_log USING btree (mode, status, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_sync_log_started ON public.ghl_conversations_sync_log USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_users_workspace_id ON public.ghl_users USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_filters_active ON public.dashboard_user_lead_filters USING btree (workspace_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_lead_filters_workspace_user ON public.dashboard_user_lead_filters USING btree (workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_maquina_aprovacao ON public.maquina_de_conteudo USING btree (data_aprovacao DESC);
CREATE INDEX IF NOT EXISTS idx_maquina_email ON public.maquina_de_conteudo USING btree (comprador_email);
CREATE INDEX IF NOT EXISTS idx_maquina_produto ON public.maquina_de_conteudo USING btree (produto_id);
CREATE INDEX IF NOT EXISTS idx_maquina_status ON public.maquina_de_conteudo USING btree (status);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_country ON public.meta_ads_insights_breakdowns USING btree (country);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_insights ON public.meta_ads_insights_breakdowns USING btree (insights_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_platform ON public.meta_ads_insights_breakdowns USING btree (publisher_platform);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_region ON public.meta_ads_insights_breakdowns USING btree (region);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_type ON public.meta_ads_insights_breakdowns USING btree (breakdown_type);
CREATE INDEX IF NOT EXISTS idx_meta_ads_breakdowns_workspace ON public.meta_ads_insights_breakdowns USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_ad ON public.meta_ads_insights USING btree (ad_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_adset ON public.meta_ads_insights USING btree (adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_campaign ON public.meta_ads_insights USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_date ON public.meta_ads_insights USING btree (date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ads_insights_workspace ON public.meta_ads_insights USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_raw_fetch_finished ON public.meta_ads_raw_insights USING btree (fetch_finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ads_raw_processado ON public.meta_ads_raw_insights USING btree (processado_em);
CREATE INDEX IF NOT EXISTS idx_meta_ads_raw_workspace ON public.meta_ads_raw_insights USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_sync_log_started ON public.meta_ads_sync_log USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_ads_sync_log_status ON public.meta_ads_sync_log USING btree (status);
CREATE INDEX IF NOT EXISTS idx_meta_ads_sync_log_workspace ON public.meta_ads_sync_log USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_meta_breakdowns_age ON public.meta_ads_insights_breakdowns USING btree (age);
CREATE INDEX IF NOT EXISTS idx_meta_breakdowns_device ON public.meta_ads_insights_breakdowns USING btree (impression_device);
CREATE INDEX IF NOT EXISTS idx_meta_breakdowns_gender ON public.meta_ads_insights_breakdowns USING btree (gender);
CREATE INDEX IF NOT EXISTS idx_meta_breakdowns_insights ON public.meta_ads_insights_breakdowns USING btree (insights_id);
CREATE INDEX IF NOT EXISTS idx_meta_breakdowns_platform ON public.meta_ads_insights_breakdowns USING btree (publisher_platform);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_account ON public.meta_ads_campaigns USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_fetched ON public.meta_ads_campaigns USING btree (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_objective ON public.meta_ads_campaigns USING btree (objective);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_status ON public.meta_ads_campaigns USING btree (status);
CREATE INDEX IF NOT EXISTS idx_meta_insights_account ON public.meta_ads_insights USING btree (account_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_actions ON public.meta_ads_insights USING gin (actions);
CREATE INDEX IF NOT EXISTS idx_meta_insights_ad ON public.meta_ads_insights USING btree (ad_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_adset ON public.meta_ads_insights USING btree (adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_campaign ON public.meta_ads_insights USING btree (campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_date_hour ON public.meta_ads_insights USING btree (date DESC, hour DESC);
CREATE INDEX IF NOT EXISTS idx_meta_insights_raw ON public.meta_ads_insights USING btree (raw_insight_id);
CREATE INDEX IF NOT EXISTS idx_meta_raw_fetch_finished ON public.meta_ads_raw_insights USING btree (fetch_finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_raw_http_status ON public.meta_ads_raw_insights USING btree (http_status);
CREATE INDEX IF NOT EXISTS idx_meta_raw_processado ON public.meta_ads_raw_insights USING btree (processado_em) WHERE (processado_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_meta_sync_created ON public.meta_ads_sync_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_sync_started ON public.meta_ads_sync_log USING btree (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_meta_sync_status ON public.meta_ads_sync_log USING btree (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_assigned ON public.notion_creatives USING btree (workspace_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_campaign ON public.notion_creatives USING btree (workspace_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_campaign_id ON public.notion_creatives USING btree (workspace_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_creative_type ON public.notion_creatives USING btree (workspace_id, creative_type);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_external_id ON public.notion_creatives USING btree (workspace_id, external_id);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_external_id_workspace ON public.notion_creatives USING btree (workspace_id, external_id);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_mvp_status ON public.notion_creatives USING btree (workspace_id, mvp_status);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_source ON public.notion_creatives USING btree (workspace_id, source);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_status ON public.notion_creatives USING btree (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_tags ON public.notion_creatives USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_test_status ON public.notion_creatives USING btree (workspace_id, test_status);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_type ON public.notion_creatives USING btree (workspace_id, database_type);
CREATE INDEX IF NOT EXISTS idx_notion_creatives_workspace ON public.notion_creatives USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_status ON public.notion_sync_runs USING btree (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_notion_sync_runs_workspace ON public.notion_sync_runs USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_assigned_user_id ON public.oportunidades USING btree (agendamento_assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_calendar_id ON public.oportunidades USING btree (agendamento_calendar_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_origem ON public.oportunidades USING btree (agendamento_origem);
CREATE INDEX IF NOT EXISTS idx_oportunidades_agendamento_por_user_id ON public.oportunidades USING btree (agendamento_por_user_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_appointment_status ON public.oportunidades USING btree (appointment_status);
CREATE INDEX IF NOT EXISTS idx_oportunidades_contato_id ON public.oportunidades USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_data_lead_recebido ON public.oportunidades USING btree (data_lead_recebido);
CREATE INDEX IF NOT EXISTS idx_oportunidades_ghl_id ON public.oportunidades USING btree (ghl_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_last_pipeline_sync_at ON public.oportunidades USING btree (last_pipeline_sync_at);
CREATE INDEX IF NOT EXISTS idx_oportunidades_nome_contato ON public.oportunidades USING btree (nome_contato);
CREATE INDEX IF NOT EXISTS idx_oportunidades_openclaw_pendentes ON public.oportunidades USING btree (openclaw_enfileirado_em) WHERE ((openclaw_request_id IS NOT NULL) AND (openclaw_notificado_em IS NULL));
CREATE INDEX IF NOT EXISTS idx_oportunidades_pipeline ON public.oportunidades USING btree (pipeline_id, pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_reuniao_ts ON public.oportunidades USING btree (data_reuniao_agendada_ts) WHERE (data_reuniao_agendada_ts IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_oportunidades_sdr_name_null ON public.oportunidades USING btree (id) WHERE ((sdr_name IS NULL) AND (ghl_opportunity_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_oportunidades_status ON public.oportunidades USING btree (status);
CREATE INDEX IF NOT EXISTS idx_organic_catalog_profile ON public.organic_catalog USING btree (workspace_id, profile);
CREATE INDEX IF NOT EXISTS idx_organic_catalog_workspace ON public.organic_catalog USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_organic_investment_items_active ON public.organic_investment_items USING btree (workspace_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_organic_investment_items_workspace ON public.organic_investment_items USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_organic_investments_item ON public.organic_investments USING btree (item_id, year_month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organic_investments_item_month ON public.organic_investments USING btree (item_id, year_month) WHERE (item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_organic_investments_period ON public.organic_investments USING btree (workspace_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_organic_investments_workspace ON public.organic_investments USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_prevendas_ai_insights_lookup ON public.prevendas_ai_insights USING btree (workspace_id, input_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reunioes_contato ON public.reunioes USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_reunioes_data_agendada ON public.reunioes USING btree (data_agendada);
CREATE INDEX IF NOT EXISTS idx_reunioes_oportunidade ON public.reunioes USING btree (oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_reunioes_status ON public.reunioes USING btree (status);
CREATE INDEX IF NOT EXISTS idx_sales_process_assign_campaign ON public.sales_process_assignments USING btree (utm_campaign_id);
CREATE INDEX IF NOT EXISTS idx_sales_process_assign_process ON public.sales_process_assignments USING btree (sales_process_id);
CREATE INDEX IF NOT EXISTS idx_sales_process_assign_workspace ON public.sales_process_assignments USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_sales_processes_workspace ON public.sales_processes USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_sdr_ia_config_workspace ON public.sdr_ia_config USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_stevo_calls_call_timestamp ON public.stevo_whatsapp_calls USING btree (call_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_stevo_calls_instance ON public.stevo_whatsapp_calls USING btree (instance_id);
CREATE INDEX IF NOT EXISTS idx_stevo_calls_instance_id ON public.stevo_whatsapp_calls USING btree (instance_id);
CREATE INDEX IF NOT EXISTS idx_stevo_calls_status ON public.stevo_whatsapp_calls USING btree (status);
CREATE INDEX IF NOT EXISTS idx_telegram_allowed_users_ativo ON public.telegram_allowed_users USING btree (ativo) WHERE (ativo = true);
CREATE INDEX IF NOT EXISTS idx_utm_campaigns_page_code ON public.utm_campaigns USING btree (workspace_id, page_code);
CREATE INDEX IF NOT EXISTS idx_utm_campaigns_workspace ON public.utm_campaigns USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_mediums_workspace ON public.utm_mediums USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_objectives_workspace ON public.utm_objectives USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_origins_workspace ON public.utm_origins USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_slugs_workspace ON public.utm_slugs USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_source_origin_origin_id ON public.utm_source_origin_assignments USING btree (origin_id);
CREATE INDEX IF NOT EXISTS idx_utm_source_origin_workspace ON public.utm_source_origin_assignments USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_sources_plain_slug ON public.utm_sources_plain USING btree (workspace_id, slug);
CREATE INDEX IF NOT EXISTS idx_utm_sources_plain_workspace ON public.utm_sources_plain USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_sources_slug ON public.utm_sources USING btree (workspace_id, slug);
CREATE INDEX IF NOT EXISTS idx_utm_sources_workspace ON public.utm_sources USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_utm_terms_workspace ON public.utm_terms USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_vendas_contato ON public.vendas_fechamento USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_vendas_cpf_cnpj ON public.vendas_fechamento USING btree (cpf_cnpj_contratante);
CREATE INDEX IF NOT EXISTS idx_vendas_fechamento_contato_id ON public.vendas_fechamento USING btree (contato_id);
CREATE INDEX IF NOT EXISTS idx_vendas_fechamento_oportunidade_id ON public.vendas_fechamento USING btree (oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_vendas_oportunidade ON public.vendas_fechamento USING btree (oportunidade_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_contact_id_created ON public.webhooks_ghl USING btree (TRIM(BOTH FROM (payload ->> 'contact_id'::text)), created_at DESC) WHERE (((payload ->> 'contact_id'::text) IS NOT NULL) AND (TRIM(BOTH FROM (payload ->> 'contact_id'::text)) <> ''::text));
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_location_id ON public.webhooks_ghl USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_opp_id ON public.webhooks_ghl USING btree (((payload ->> 'id'::text)));
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_payload_contact_id ON public.webhooks_ghl USING btree (TRIM(BOTH FROM (payload ->> 'contact_id'::text)));
CREATE INDEX IF NOT EXISTS idx_webhooks_ghl_processado ON public.webhooks_ghl USING btree (processado_em) WHERE (processado_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_weekly_aquisicao_snapshot ON public.weekly_aquisicao USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_aquisicao_workspace ON public.weekly_aquisicao USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_closer_snapshot ON public.weekly_closer USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_closer_workspace ON public.weekly_closer USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_cohort_audit_snapshot ON public.weekly_cohort_audit USING btree (snapshot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_cohort_audit_workspace ON public.weekly_cohort_audit USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_email_logs_schedule ON public.weekly_email_logs USING btree (schedule_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_email_schedules_next_run ON public.weekly_email_schedules USING btree (next_run_at) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_weekly_metas_snapshot ON public.weekly_metas USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_metas_workspace ON public.weekly_metas USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_organico_snapshot ON public.weekly_organico USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_organico_workspace ON public.weekly_organico USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_prevendas_snapshot ON public.weekly_prevendas USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_prevendas_workspace ON public.weekly_prevendas USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_recuperacao_snapshot ON public.weekly_recuperacao USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_recuperacao_workspace ON public.weekly_recuperacao USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reprocess_pending ON public.weekly_reprocess_queue USING btree (processed_at, priority DESC, created_at) WHERE (processed_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_weekly_reprocess_queue_workspace ON public.weekly_reprocess_queue USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_snapshot ON public.weekly_sdr USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_sdr_workspace ON public.weekly_sdr USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_status ON public.weekly_snapshots USING btree (status, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_week_type ON public.weekly_snapshots USING btree (week_start DESC, report_type);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_workspace ON public.weekly_snapshots USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_snapshots_year_week ON public.weekly_snapshots USING btree (year_week);
CREATE INDEX IF NOT EXISTS idx_weekly_trafego_dim ON public.weekly_trafego USING btree (dimension, dimension_value);
CREATE INDEX IF NOT EXISTS idx_weekly_trafego_snapshot ON public.weekly_trafego USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_trafego_workspace ON public.weekly_trafego USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_weekly_vendas_snapshot ON public.weekly_vendas USING btree (snapshot_id);
CREATE INDEX IF NOT EXISTS idx_weekly_vendas_workspace ON public.weekly_vendas USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_pricing_config_workspace ON public.whatsapp_pricing_config USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_apps_workspace_id ON public.workspace_apps USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_apps_workspace_slug ON public.workspace_apps USING btree (workspace_id, app_slug);
CREATE INDEX IF NOT EXISTS idx_workspace_members_active ON public.workspace_members USING btree (workspace_id, user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id ON public.workspace_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace_id ON public.workspace_members USING btree (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_owner_id ON public.workspaces USING btree (owner_id);
CREATE INDEX IF NOT EXISTS meta_ads_permalinks_creative_code_idx ON public.meta_ads_permalinks USING btree (creative_code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ghl_api_jobs_idempotency_active ON public.ghl_api_jobs USING btree (idempotency_key) WHERE ((idempotency_key IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'processing'::text])));

-- Triggers

DROP TRIGGER IF EXISTS "aplic-acelerador_updated_at" ON public."aplic-acelerador";
CREATE TRIGGER "aplic-acelerador_updated_at" BEFORE UPDATE ON public."aplic-acelerador" FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();;
DROP TRIGGER IF EXISTS "audit_app_feature_role_permissions_trigger" ON public.app_feature_role_permissions;
CREATE TRIGGER audit_app_feature_role_permissions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.app_feature_role_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_app_feature_role_permissions();;
DROP TRIGGER IF EXISTS "audit_app_feature_user_overrides_trigger" ON public.app_feature_user_overrides;
CREATE TRIGGER audit_app_feature_user_overrides_trigger AFTER INSERT OR DELETE OR UPDATE ON public.app_feature_user_overrides FOR EACH ROW EXECUTE FUNCTION public.audit_app_feature_user_overrides();;
DROP TRIGGER IF EXISTS "audit_dashboard_user_permissions_trigger" ON public.dashboard_user_permissions;
CREATE TRIGGER audit_dashboard_user_permissions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.dashboard_user_permissions FOR EACH ROW EXECUTE FUNCTION public.audit_dashboard_user_permissions();;
DROP TRIGGER IF EXISTS "auto_extrair_dados_ghl" ON public.webhooks_ghl;
CREATE TRIGGER auto_extrair_dados_ghl AFTER INSERT ON public.webhooks_ghl FOR EACH ROW EXECUTE FUNCTION public.trigger_extrair_dados_ghl();;
DROP TRIGGER IF EXISTS "set_organic_investment_items_updated_at" ON public.organic_investment_items;
CREATE TRIGGER set_organic_investment_items_updated_at BEFORE UPDATE ON public.organic_investment_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "set_organic_investments_updated_at" ON public.organic_investments;
CREATE TRIGGER set_organic_investments_updated_at BEFORE UPDATE ON public.organic_investments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "set_updated_at_meta_campaigns" ON public.meta_ads_campaigns;
CREATE TRIGGER set_updated_at_meta_campaigns BEFORE UPDATE ON public.meta_ads_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();;
DROP TRIGGER IF EXISTS "set_updated_at_meta_insights" ON public.meta_ads_insights;
CREATE TRIGGER set_updated_at_meta_insights BEFORE UPDATE ON public.meta_ads_insights FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();;
DROP TRIGGER IF EXISTS "set_updated_at_meta_raw" ON public.meta_ads_raw_insights;
CREATE TRIGGER set_updated_at_meta_raw BEFORE UPDATE ON public.meta_ads_raw_insights FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();;
DROP TRIGGER IF EXISTS "tr_enqueue_contact_opp_sync" ON public.webhooks_ghl;
CREATE TRIGGER tr_enqueue_contact_opp_sync AFTER INSERT ON public.webhooks_ghl FOR EACH ROW EXECUTE FUNCTION public.enqueue_contact_opp_sync();;
DROP TRIGGER IF EXISTS "tr_extrair_vendas_fechamento" ON public.webhooks_ghl;
CREATE TRIGGER tr_extrair_vendas_fechamento AFTER INSERT ON public.webhooks_ghl FOR EACH ROW EXECUTE FUNCTION public.extrair_vendas_fechamento_do_webhook();;
DROP TRIGGER IF EXISTS "tr_fill_comunicacao_contato_id" ON public.comunicacoes;
CREATE TRIGGER tr_fill_comunicacao_contato_id BEFORE INSERT ON public.comunicacoes FOR EACH ROW EXECUTE FUNCTION public.fill_comunicacao_contato_id_by_email();;
DROP TRIGGER IF EXISTS "tr_fix_date_created_tz" ON public.contatos;
CREATE TRIGGER tr_fix_date_created_tz BEFORE INSERT ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.fix_contact_date_created_tz();;
DROP TRIGGER IF EXISTS "tr_notify_openclaw_contrato_assinado" ON public.vendas_fechamento;
CREATE TRIGGER tr_notify_openclaw_contrato_assinado AFTER INSERT OR UPDATE ON public.vendas_fechamento FOR EACH ROW EXECUTE FUNCTION public.notify_openclaw_contrato_assinado();;
DROP TRIGGER IF EXISTS "tr_relink_comunicacoes_on_contato_change" ON public.contatos;
CREATE TRIGGER tr_relink_comunicacoes_on_contato_change AFTER INSERT OR UPDATE OF email, telefone ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.relink_comunicacoes_for_contato();;
DROP TRIGGER IF EXISTS "tr_sync_opp_dates_on_insert" ON public.oportunidades;
CREATE TRIGGER tr_sync_opp_dates_on_insert AFTER INSERT ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_opp_dates();;
DROP TRIGGER IF EXISTS "tr_weekly_email_schedules_updated_at" ON public.weekly_email_schedules;
CREATE TRIGGER tr_weekly_email_schedules_updated_at BEFORE UPDATE ON public.weekly_email_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();;
DROP TRIGGER IF EXISTS "tr_weekly_reprocess_on_payment" ON public.vendas_fechamento;
CREATE TRIGGER tr_weekly_reprocess_on_payment AFTER INSERT OR UPDATE OF data_pagamento_entrada ON public.vendas_fechamento FOR EACH ROW EXECUTE FUNCTION public.trg_weekly_reprocess_on_payment_fn();;
DROP TRIGGER IF EXISTS "tr_weekly_snapshots_updated_at" ON public.weekly_snapshots;
CREATE TRIGGER tr_weekly_snapshots_updated_at BEFORE UPDATE ON public.weekly_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();;
DROP TRIGGER IF EXISTS "tr_zz_notify_openclaw_assinada" ON public.webhooks_ghl;
CREATE TRIGGER tr_zz_notify_openclaw_assinada AFTER INSERT ON public.webhooks_ghl FOR EACH ROW EXECUTE FUNCTION public.notify_openclaw_contrato_assinado_por_stage();;
DROP TRIGGER IF EXISTS "trg_attribution_on_contact" ON public.contatos;
CREATE TRIGGER trg_attribution_on_contact AFTER INSERT OR UPDATE OF tags, contact_source, utm_source, utm_campaign, utm_medium, utm_content, utm_term, attribution_skip ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.trg_fn_enqueue_attribution_on_contact();;
DROP TRIGGER IF EXISTS "trg_auto_tag_conectado" ON public.comunicacoes;
CREATE TRIGGER trg_auto_tag_conectado AFTER INSERT ON public.comunicacoes FOR EACH ROW EXECUTE FUNCTION public.auto_tag_conectado_on_inbound();;
DROP TRIGGER IF EXISTS "trg_bot_context_updated_at" ON public.bot_context;
CREATE TRIGGER trg_bot_context_updated_at BEFORE UPDATE ON public.bot_context FOR EACH ROW EXECUTE FUNCTION public.update_bot_context_updated_at();;
DROP TRIGGER IF EXISTS "trg_maquina_atualizado_em" ON public.maquina_de_conteudo;
CREATE TRIGGER trg_maquina_atualizado_em BEFORE UPDATE ON public.maquina_de_conteudo FOR EACH ROW EXECUTE FUNCTION public.set_atualizado_em();;
DROP TRIGGER IF EXISTS "trg_new_workspace_ghl_field_mappings" ON public.workspaces;
CREATE TRIGGER trg_new_workspace_ghl_field_mappings AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.on_new_workspace_seed_ghl_mappings();;
DROP TRIGGER IF EXISTS "trg_new_workspace_setup_apps" ON public.workspaces;
CREATE TRIGGER trg_new_workspace_setup_apps AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.on_new_workspace_setup_apps();;
DROP TRIGGER IF EXISTS "trg_reset_sdr_name_on_owner_change" ON public.contatos;
CREATE TRIGGER trg_reset_sdr_name_on_owner_change AFTER UPDATE OF owner_name ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.reset_sdr_name_on_owner_change();;
DROP TRIGGER IF EXISTS "trigger_ai_conversations_updated_at" ON public.ai_conversations;
CREATE TRIGGER trigger_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.update_ai_conversations_updated_at();;
DROP TRIGGER IF EXISTS "trigger_ai_doc_chunks_updated_at" ON public.ai_doc_chunks;
CREATE TRIGGER trigger_ai_doc_chunks_updated_at BEFORE UPDATE ON public.ai_doc_chunks FOR EACH ROW EXECUTE FUNCTION public.update_ai_doc_chunks_updated_at();;
DROP TRIGGER IF EXISTS "trigger_ai_messages_update_title" ON public.ai_messages;
CREATE TRIGGER trigger_ai_messages_update_title AFTER INSERT ON public.ai_messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_title();;
DROP TRIGGER IF EXISTS "trigger_campaigns_updated_at" ON public.campaigns;
CREATE TRIGGER trigger_campaigns_updated_at BEFORE UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.update_campaigns_updated_at();;
DROP TRIGGER IF EXISTS "trigger_creative_comments_updated_at" ON public.creative_comments;
CREATE TRIGGER trigger_creative_comments_updated_at BEFORE UPDATE ON public.creative_comments FOR EACH ROW EXECUTE FUNCTION public.update_creative_comments_updated_at();;
DROP TRIGGER IF EXISTS "trigger_creative_test_criteria_updated_at" ON public.creative_test_criteria;
CREATE TRIGGER trigger_creative_test_criteria_updated_at BEFORE UPDATE ON public.creative_test_criteria FOR EACH ROW EXECUTE FUNCTION public.update_creative_test_criteria_updated_at();;
DROP TRIGGER IF EXISTS "trigger_creative_tests_updated_at" ON public.creative_tests;
CREATE TRIGGER trigger_creative_tests_updated_at BEFORE UPDATE ON public.creative_tests FOR EACH ROW EXECUTE FUNCTION public.update_creative_tests_updated_at();;
DROP TRIGGER IF EXISTS "trigger_creative_validations_updated_at" ON public.creative_validations;
CREATE TRIGGER trigger_creative_validations_updated_at BEFORE UPDATE ON public.creative_validations FOR EACH ROW EXECUTE FUNCTION public.update_creative_validations_updated_at();;
DROP TRIGGER IF EXISTS "trigger_notion_creatives_updated_at" ON public.notion_creatives;
CREATE TRIGGER trigger_notion_creatives_updated_at BEFORE UPDATE ON public.notion_creatives FOR EACH ROW EXECUTE FUNCTION public.update_notion_creatives_updated_at();;
DROP TRIGGER IF EXISTS "trigger_update_ads_campaigns_updated_at" ON public.ads_campaigns;
CREATE TRIGGER trigger_update_ads_campaigns_updated_at BEFORE UPDATE ON public.ads_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_ads_catalog_updated_at" ON public.ads_catalog;
CREATE TRIGGER trigger_update_ads_catalog_updated_at BEFORE UPDATE ON public.ads_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_disparo_campos_custom_updated_at" ON public.disparo_campos_custom;
CREATE TRIGGER trigger_update_disparo_campos_custom_updated_at BEFORE UPDATE ON public.disparo_campos_custom FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_disparo_campos_custom_valores_updated_at" ON public.disparo_campos_custom_valores;
CREATE TRIGGER trigger_update_disparo_campos_custom_valores_updated_at BEFORE UPDATE ON public.disparo_campos_custom_valores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_disparo_tags_updated_at" ON public.disparo_tags;
CREATE TRIGGER trigger_update_disparo_tags_updated_at BEFORE UPDATE ON public.disparo_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_disparos_updated_at" ON public.disparos;
CREATE TRIGGER trigger_update_disparos_updated_at BEFORE UPDATE ON public.disparos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_funnels_updated_at" ON public.funnels;
CREATE TRIGGER trigger_update_funnels_updated_at BEFORE UPDATE ON public.funnels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_lead_filters_updated_at" ON public.dashboard_user_lead_filters;
CREATE TRIGGER trigger_update_lead_filters_updated_at BEFORE UPDATE ON public.dashboard_user_lead_filters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_notion_creatives_updated_at" ON public.notion_creatives;
CREATE TRIGGER trigger_update_notion_creatives_updated_at BEFORE UPDATE ON public.notion_creatives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_oportunidade_from_webhook" ON public.webhooks_ghl;
CREATE TRIGGER trigger_update_oportunidade_from_webhook AFTER INSERT ON public.webhooks_ghl FOR EACH ROW EXECUTE FUNCTION public.update_oportunidade_from_webhook();;
DROP TRIGGER IF EXISTS "trigger_update_organic_catalog_updated_at" ON public.organic_catalog;
CREATE TRIGGER trigger_update_organic_catalog_updated_at BEFORE UPDATE ON public.organic_catalog FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_sales_processes_updated_at" ON public.sales_processes;
CREATE TRIGGER trigger_update_sales_processes_updated_at BEFORE UPDATE ON public.sales_processes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_sdr_ia_config_updated_at" ON public.sdr_ia_config;
CREATE TRIGGER trigger_update_sdr_ia_config_updated_at BEFORE UPDATE ON public.sdr_ia_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_secrets_updated_at" ON public.secrets;
CREATE TRIGGER trigger_update_secrets_updated_at BEFORE UPDATE ON public.secrets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_campaigns_updated_at" ON public.utm_campaigns;
CREATE TRIGGER trigger_update_utm_campaigns_updated_at BEFORE UPDATE ON public.utm_campaigns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_mediums_updated_at" ON public.utm_mediums;
CREATE TRIGGER trigger_update_utm_mediums_updated_at BEFORE UPDATE ON public.utm_mediums FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_objectives_updated_at" ON public.utm_objectives;
CREATE TRIGGER trigger_update_utm_objectives_updated_at BEFORE UPDATE ON public.utm_objectives FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_origins_updated_at" ON public.utm_origins;
CREATE TRIGGER trigger_update_utm_origins_updated_at BEFORE UPDATE ON public.utm_origins FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_slugs_updated_at" ON public.utm_slugs;
CREATE TRIGGER trigger_update_utm_slugs_updated_at BEFORE UPDATE ON public.utm_slugs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_source_origin_assignments_updated_at" ON public.utm_source_origin_assignments;
CREATE TRIGGER trigger_update_utm_source_origin_assignments_updated_at BEFORE UPDATE ON public.utm_source_origin_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_sources_plain_updated_at" ON public.utm_sources_plain;
CREATE TRIGGER trigger_update_utm_sources_plain_updated_at BEFORE UPDATE ON public.utm_sources_plain FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_sources_updated_at" ON public.utm_sources;
CREATE TRIGGER trigger_update_utm_sources_updated_at BEFORE UPDATE ON public.utm_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_utm_terms_updated_at" ON public.utm_terms;
CREATE TRIGGER trigger_update_utm_terms_updated_at BEFORE UPDATE ON public.utm_terms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "trigger_update_whatsapp_pricing_config_updated_at" ON public.whatsapp_pricing_config;
CREATE TRIGGER trigger_update_whatsapp_pricing_config_updated_at BEFORE UPDATE ON public.whatsapp_pricing_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "update_contatos_updated_at" ON public.contatos;
CREATE TRIGGER update_contatos_updated_at BEFORE UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "update_oportunidades_updated_at" ON public.oportunidades;
CREATE TRIGGER update_oportunidades_updated_at BEFORE UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "update_reunioes_updated_at" ON public.reunioes;
CREATE TRIGGER update_reunioes_updated_at BEFORE UPDATE ON public.reunioes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "update_vendas_fechamento_updated_at" ON public.vendas_fechamento;
CREATE TRIGGER update_vendas_fechamento_updated_at BEFORE UPDATE ON public.vendas_fechamento FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "workspace_settings_updated_at" ON public.workspace_settings;
CREATE TRIGGER workspace_settings_updated_at BEFORE UPDATE ON public.workspace_settings FOR EACH ROW EXECUTE FUNCTION public.update_workspace_settings_updated_at();;

-- Policies

DROP POLICY IF EXISTS "Allow insert" ON public.webhooks_ghl;
CREATE POLICY "Allow insert" ON public.webhooks_ghl FOR INSERT TO anon WITH CHECK (true);;
DROP POLICY IF EXISTS "Autenticados podem ler" ON public.maquina_de_conteudo;
CREATE POLICY "Autenticados podem ler" ON public.maquina_de_conteudo FOR SELECT TO authenticated USING (true);;
DROP POLICY IF EXISTS "Authenticated users can read ai_doc_chunks" ON public.ai_doc_chunks;
CREATE POLICY "Authenticated users can read ai_doc_chunks" ON public.ai_doc_chunks FOR SELECT TO authenticated USING (true);;
DROP POLICY IF EXISTS "Authenticated users can read ai_doc_index_status" ON public.ai_doc_index_status;
CREATE POLICY "Authenticated users can read ai_doc_index_status" ON public.ai_doc_index_status FOR SELECT TO authenticated USING (true);;
DROP POLICY IF EXISTS "Enable insert for service role" ON public.meta_ads_raw_insights;
CREATE POLICY "Enable insert for service role" ON public.meta_ads_raw_insights FOR INSERT TO service_role WITH CHECK (true);;
DROP POLICY IF EXISTS "Only service role can manage embeddings" ON public.ai_embeddings;
CREATE POLICY "Only service role can manage embeddings" ON public.ai_embeddings TO service_role USING (true);;
DROP POLICY IF EXISTS "Owner and admin can add members" ON public.workspace_members;
CREATE POLICY "Owner and admin can add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT public.get_user_admin_workspace_ids(auth.uid()) AS get_user_admin_workspace_ids)));;
DROP POLICY IF EXISTS "Owner and admin can create lead filters" ON public.dashboard_user_lead_filters;
CREATE POLICY "Owner and admin can create lead filters" ON public.dashboard_user_lead_filters FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can delete lead filters" ON public.dashboard_user_lead_filters;
CREATE POLICY "Owner and admin can delete lead filters" ON public.dashboard_user_lead_filters FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can grant permissions" ON public.dashboard_user_permissions;
CREATE POLICY "Owner and admin can grant permissions" ON public.dashboard_user_permissions FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can revoke permissions" ON public.dashboard_user_permissions;
CREATE POLICY "Owner and admin can revoke permissions" ON public.dashboard_user_permissions FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can update lead filters" ON public.dashboard_user_lead_filters;
CREATE POLICY "Owner and admin can update lead filters" ON public.dashboard_user_lead_filters FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can update members" ON public.workspace_members;
CREATE POLICY "Owner and admin can update members" ON public.workspace_members FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT public.get_user_admin_workspace_ids(auth.uid()) AS get_user_admin_workspace_ids))) WITH CHECK ((workspace_id IN ( SELECT public.get_user_admin_workspace_ids(auth.uid()) AS get_user_admin_workspace_ids)));;
DROP POLICY IF EXISTS "Owner and admin can update permissions" ON public.dashboard_user_permissions;
CREATE POLICY "Owner and admin can update permissions" ON public.dashboard_user_permissions FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can update workspace" ON public.workspaces;
CREATE POLICY "Owner and admin can update workspace" ON public.workspaces FOR UPDATE TO authenticated USING ((id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can view all lead filters" ON public.dashboard_user_lead_filters;
CREATE POLICY "Owner and admin can view all lead filters" ON public.dashboard_user_lead_filters FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can view all permissions" ON public.dashboard_user_permissions;
CREATE POLICY "Owner and admin can view all permissions" ON public.dashboard_user_permissions FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner and admin can view audit logs" ON public.permission_audit_log;
CREATE POLICY "Owner and admin can view audit logs" ON public.permission_audit_log FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "Owner can delete members" ON public.workspace_members;
CREATE POLICY "Owner can delete members" ON public.workspace_members FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT public.get_user_owner_workspace_ids(auth.uid()) AS get_user_owner_workspace_ids)));;
DROP POLICY IF EXISTS "Owner can delete workspace" ON public.workspaces;
CREATE POLICY "Owner can delete workspace" ON public.workspaces FOR DELETE TO authenticated USING ((owner_id = auth.uid()));;
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.permission_audit_log;
CREATE POLICY "Service role can insert audit logs" ON public.permission_audit_log FOR INSERT TO service_role WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access" ON public.webhooks_ghl;
CREATE POLICY "Service role full access" ON public.webhooks_ghl TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on ads_campaigns" ON public.ads_campaigns;
CREATE POLICY "Service role full access on ads_campaigns" ON public.ads_campaigns TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on ads_catalog" ON public.ads_catalog;
CREATE POLICY "Service role full access on ads_catalog" ON public.ads_catalog TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on ai_conversations" ON public.ai_conversations;
CREATE POLICY "Service role full access on ai_conversations" ON public.ai_conversations TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on ai_doc_chunks" ON public.ai_doc_chunks;
CREATE POLICY "Service role full access on ai_doc_chunks" ON public.ai_doc_chunks TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on ai_doc_index_status" ON public.ai_doc_index_status;
CREATE POLICY "Service role full access on ai_doc_index_status" ON public.ai_doc_index_status TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on ai_messages" ON public.ai_messages;
CREATE POLICY "Service role full access on ai_messages" ON public.ai_messages TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on audit logs" ON public.permission_audit_log;
CREATE POLICY "Service role full access on audit logs" ON public.permission_audit_log TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on campaigns" ON public.campaigns;
CREATE POLICY "Service role full access on campaigns" ON public.campaigns TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on creative_audit_log" ON public.creative_audit_log;
CREATE POLICY "Service role full access on creative_audit_log" ON public.creative_audit_log TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on creative_comments" ON public.creative_comments;
CREATE POLICY "Service role full access on creative_comments" ON public.creative_comments TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on creative_test_criteria" ON public.creative_test_criteria;
CREATE POLICY "Service role full access on creative_test_criteria" ON public.creative_test_criteria TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on creative_test_history" ON public.creative_test_history;
CREATE POLICY "Service role full access on creative_test_history" ON public.creative_test_history TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on creative_tests" ON public.creative_tests;
CREATE POLICY "Service role full access on creative_tests" ON public.creative_tests TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on creative_validations" ON public.creative_validations;
CREATE POLICY "Service role full access on creative_validations" ON public.creative_validations TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on estado_uf_normalizacao" ON public.estado_uf_normalizacao;
CREATE POLICY "Service role full access on estado_uf_normalizacao" ON public.estado_uf_normalizacao TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on funnels" ON public.funnels;
CREATE POLICY "Service role full access on funnels" ON public.funnels TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on lead filters" ON public.dashboard_user_lead_filters;
CREATE POLICY "Service role full access on lead filters" ON public.dashboard_user_lead_filters TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on meta_ads_insights" ON public.meta_ads_insights;
CREATE POLICY "Service role full access on meta_ads_insights" ON public.meta_ads_insights TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on meta_ads_insights_breakdowns" ON public.meta_ads_insights_breakdowns;
CREATE POLICY "Service role full access on meta_ads_insights_breakdowns" ON public.meta_ads_insights_breakdowns TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on meta_ads_raw_insights" ON public.meta_ads_raw_insights;
CREATE POLICY "Service role full access on meta_ads_raw_insights" ON public.meta_ads_raw_insights TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on meta_ads_region_mapping" ON public.meta_ads_region_mapping;
CREATE POLICY "Service role full access on meta_ads_region_mapping" ON public.meta_ads_region_mapping TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on meta_ads_sync_log" ON public.meta_ads_sync_log;
CREATE POLICY "Service role full access on meta_ads_sync_log" ON public.meta_ads_sync_log TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on notion_creatives" ON public.notion_creatives;
CREATE POLICY "Service role full access on notion_creatives" ON public.notion_creatives TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on notion_sync_runs" ON public.notion_sync_runs;
CREATE POLICY "Service role full access on notion_sync_runs" ON public.notion_sync_runs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on organic_catalog" ON public.organic_catalog;
CREATE POLICY "Service role full access on organic_catalog" ON public.organic_catalog TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on permissions" ON public.dashboard_user_permissions;
CREATE POLICY "Service role full access on permissions" ON public.dashboard_user_permissions TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on sales_process_assignments" ON public.sales_process_assignments;
CREATE POLICY "Service role full access on sales_process_assignments" ON public.sales_process_assignments TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on sales_processes" ON public.sales_processes;
CREATE POLICY "Service role full access on sales_processes" ON public.sales_processes TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_campaigns" ON public.utm_campaigns;
CREATE POLICY "Service role full access on utm_campaigns" ON public.utm_campaigns TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_mediums" ON public.utm_mediums;
CREATE POLICY "Service role full access on utm_mediums" ON public.utm_mediums TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_objectives" ON public.utm_objectives;
CREATE POLICY "Service role full access on utm_objectives" ON public.utm_objectives TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_origins" ON public.utm_origins;
CREATE POLICY "Service role full access on utm_origins" ON public.utm_origins TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_slugs" ON public.utm_slugs;
CREATE POLICY "Service role full access on utm_slugs" ON public.utm_slugs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_source_origin_assignments" ON public.utm_source_origin_assignments;
CREATE POLICY "Service role full access on utm_source_origin_assignments" ON public.utm_source_origin_assignments TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_sources" ON public.utm_sources;
CREATE POLICY "Service role full access on utm_sources" ON public.utm_sources TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_sources_plain" ON public.utm_sources_plain;
CREATE POLICY "Service role full access on utm_sources_plain" ON public.utm_sources_plain TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on utm_terms" ON public.utm_terms;
CREATE POLICY "Service role full access on utm_terms" ON public.utm_terms TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on workspace_members" ON public.workspace_members;
CREATE POLICY "Service role full access on workspace_members" ON public.workspace_members TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role full access on workspaces" ON public.workspaces;
CREATE POLICY "Service role full access on workspaces" ON public.workspaces TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "Service role only" ON public.auth_audit_log;
CREATE POLICY "Service role only" ON public.auth_audit_log TO service_role USING (true);;
DROP POLICY IF EXISTS "Service role only" ON public.auth_password_reset_tokens;
CREATE POLICY "Service role only" ON public.auth_password_reset_tokens TO service_role USING (true);;
DROP POLICY IF EXISTS "Service role only" ON public.auth_rate_limits;
CREATE POLICY "Service role only" ON public.auth_rate_limits TO service_role USING (true);;
DROP POLICY IF EXISTS "Users can create messages in own conversations" ON public.ai_messages;
CREATE POLICY "Users can create messages in own conversations" ON public.ai_messages FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.ai_conversations WHERE ((ai_conversations.id = ai_messages.conversation_id) AND (ai_conversations.user_id = auth.uid())))));;
DROP POLICY IF EXISTS "Users can create own conversations" ON public.ai_conversations;
CREATE POLICY "Users can create own conversations" ON public.ai_conversations FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));;
DROP POLICY IF EXISTS "Users can create workspaces" ON public.workspaces;
CREATE POLICY "Users can create workspaces" ON public.workspaces FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));;
DROP POLICY IF EXISTS "Users can delete own conversations" ON public.ai_conversations;
CREATE POLICY "Users can delete own conversations" ON public.ai_conversations FOR DELETE TO authenticated USING ((user_id = auth.uid()));;
DROP POLICY IF EXISTS "Users can update own conversations" ON public.ai_conversations;
CREATE POLICY "Users can update own conversations" ON public.ai_conversations FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));;
DROP POLICY IF EXISTS "Users can view own conversations" ON public.ai_conversations;
CREATE POLICY "Users can view own conversations" ON public.ai_conversations FOR SELECT TO authenticated USING ((user_id = auth.uid()));;
DROP POLICY IF EXISTS "Users can view own lead filters" ON public.dashboard_user_lead_filters;
CREATE POLICY "Users can view own lead filters" ON public.dashboard_user_lead_filters FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))));;
DROP POLICY IF EXISTS "Users can view own logs" ON public.auth_audit_log;
CREATE POLICY "Users can view own logs" ON public.auth_audit_log FOR SELECT TO authenticated USING ((user_id = auth.uid()));;
DROP POLICY IF EXISTS "Users can view own messages" ON public.ai_messages;
CREATE POLICY "Users can view own messages" ON public.ai_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.ai_conversations WHERE ((ai_conversations.id = ai_messages.conversation_id) AND (ai_conversations.user_id = auth.uid())))));;
DROP POLICY IF EXISTS "Users can view own permissions" ON public.dashboard_user_permissions;
CREATE POLICY "Users can view own permissions" ON public.dashboard_user_permissions FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND (workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))));;
DROP POLICY IF EXISTS "Workspace members can delete ads_campaigns" ON public.ads_campaigns;
CREATE POLICY "Workspace members can delete ads_campaigns" ON public.ads_campaigns FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete ads_catalog" ON public.ads_catalog;
CREATE POLICY "Workspace members can delete ads_catalog" ON public.ads_catalog FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete campaigns" ON public.campaigns;
CREATE POLICY "Workspace members can delete campaigns" ON public.campaigns FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can delete creative_comments" ON public.creative_comments;
CREATE POLICY "Workspace members can delete creative_comments" ON public.creative_comments FOR DELETE TO authenticated USING ((public.is_workspace_member(workspace_id) AND (user_id = auth.uid())));;
DROP POLICY IF EXISTS "Workspace members can delete creative_validations" ON public.creative_validations;
CREATE POLICY "Workspace members can delete creative_validations" ON public.creative_validations FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can delete funnels" ON public.funnels;
CREATE POLICY "Workspace members can delete funnels" ON public.funnels FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete notion_creatives" ON public.notion_creatives;
CREATE POLICY "Workspace members can delete notion_creatives" ON public.notion_creatives FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete notion_sync_runs" ON public.notion_sync_runs;
CREATE POLICY "Workspace members can delete notion_sync_runs" ON public.notion_sync_runs FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete organic_catalog" ON public.organic_catalog;
CREATE POLICY "Workspace members can delete organic_catalog" ON public.organic_catalog FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete organic_investment_items" ON public.organic_investment_items;
CREATE POLICY "Workspace members can delete organic_investment_items" ON public.organic_investment_items FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete organic_investments" ON public.organic_investments;
CREATE POLICY "Workspace members can delete organic_investments" ON public.organic_investments FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete sales_process_assignments" ON public.sales_process_assignments;
CREATE POLICY "Workspace members can delete sales_process_assignments" ON public.sales_process_assignments FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete sales_processes" ON public.sales_processes;
CREATE POLICY "Workspace members can delete sales_processes" ON public.sales_processes FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_campaigns" ON public.utm_campaigns;
CREATE POLICY "Workspace members can delete utm_campaigns" ON public.utm_campaigns FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_mediums" ON public.utm_mediums;
CREATE POLICY "Workspace members can delete utm_mediums" ON public.utm_mediums FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_objectives" ON public.utm_objectives;
CREATE POLICY "Workspace members can delete utm_objectives" ON public.utm_objectives FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_origins" ON public.utm_origins;
CREATE POLICY "Workspace members can delete utm_origins" ON public.utm_origins FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_slugs" ON public.utm_slugs;
CREATE POLICY "Workspace members can delete utm_slugs" ON public.utm_slugs FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_source_origin_assignments" ON public.utm_source_origin_assignments;
CREATE POLICY "Workspace members can delete utm_source_origin_assignments" ON public.utm_source_origin_assignments FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_sources" ON public.utm_sources;
CREATE POLICY "Workspace members can delete utm_sources" ON public.utm_sources FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_sources_plain" ON public.utm_sources_plain;
CREATE POLICY "Workspace members can delete utm_sources_plain" ON public.utm_sources_plain FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can delete utm_terms" ON public.utm_terms;
CREATE POLICY "Workspace members can delete utm_terms" ON public.utm_terms FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert ads_campaigns" ON public.ads_campaigns;
CREATE POLICY "Workspace members can insert ads_campaigns" ON public.ads_campaigns FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert ads_catalog" ON public.ads_catalog;
CREATE POLICY "Workspace members can insert ads_catalog" ON public.ads_catalog FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert campaigns" ON public.campaigns;
CREATE POLICY "Workspace members can insert campaigns" ON public.campaigns FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can insert creative_comments" ON public.creative_comments;
CREATE POLICY "Workspace members can insert creative_comments" ON public.creative_comments FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can insert creative_test_history" ON public.creative_test_history;
CREATE POLICY "Workspace members can insert creative_test_history" ON public.creative_test_history FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can insert creative_tests" ON public.creative_tests;
CREATE POLICY "Workspace members can insert creative_tests" ON public.creative_tests FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can insert creative_validations" ON public.creative_validations;
CREATE POLICY "Workspace members can insert creative_validations" ON public.creative_validations FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can insert funnels" ON public.funnels;
CREATE POLICY "Workspace members can insert funnels" ON public.funnels FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert notion_creatives" ON public.notion_creatives;
CREATE POLICY "Workspace members can insert notion_creatives" ON public.notion_creatives FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert notion_sync_runs" ON public.notion_sync_runs;
CREATE POLICY "Workspace members can insert notion_sync_runs" ON public.notion_sync_runs FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert organic_catalog" ON public.organic_catalog;
CREATE POLICY "Workspace members can insert organic_catalog" ON public.organic_catalog FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert organic_investment_items" ON public.organic_investment_items;
CREATE POLICY "Workspace members can insert organic_investment_items" ON public.organic_investment_items FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert organic_investments" ON public.organic_investments;
CREATE POLICY "Workspace members can insert organic_investments" ON public.organic_investments FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert sales_process_assignments" ON public.sales_process_assignments;
CREATE POLICY "Workspace members can insert sales_process_assignments" ON public.sales_process_assignments FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert sales_processes" ON public.sales_processes;
CREATE POLICY "Workspace members can insert sales_processes" ON public.sales_processes FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_campaigns" ON public.utm_campaigns;
CREATE POLICY "Workspace members can insert utm_campaigns" ON public.utm_campaigns FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_mediums" ON public.utm_mediums;
CREATE POLICY "Workspace members can insert utm_mediums" ON public.utm_mediums FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_objectives" ON public.utm_objectives;
CREATE POLICY "Workspace members can insert utm_objectives" ON public.utm_objectives FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_origins" ON public.utm_origins;
CREATE POLICY "Workspace members can insert utm_origins" ON public.utm_origins FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_slugs" ON public.utm_slugs;
CREATE POLICY "Workspace members can insert utm_slugs" ON public.utm_slugs FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_source_origin_assignments" ON public.utm_source_origin_assignments;
CREATE POLICY "Workspace members can insert utm_source_origin_assignments" ON public.utm_source_origin_assignments FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_sources" ON public.utm_sources;
CREATE POLICY "Workspace members can insert utm_sources" ON public.utm_sources FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_sources_plain" ON public.utm_sources_plain;
CREATE POLICY "Workspace members can insert utm_sources_plain" ON public.utm_sources_plain FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can insert utm_terms" ON public.utm_terms;
CREATE POLICY "Workspace members can insert utm_terms" ON public.utm_terms FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update ads_campaigns" ON public.ads_campaigns;
CREATE POLICY "Workspace members can update ads_campaigns" ON public.ads_campaigns FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update ads_catalog" ON public.ads_catalog;
CREATE POLICY "Workspace members can update ads_catalog" ON public.ads_catalog FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update campaigns" ON public.campaigns;
CREATE POLICY "Workspace members can update campaigns" ON public.campaigns FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can update creative_comments" ON public.creative_comments;
CREATE POLICY "Workspace members can update creative_comments" ON public.creative_comments FOR UPDATE TO authenticated USING ((public.is_workspace_member(workspace_id) AND (user_id = auth.uid())));;
DROP POLICY IF EXISTS "Workspace members can update creative_test_criteria" ON public.creative_test_criteria;
CREATE POLICY "Workspace members can update creative_test_criteria" ON public.creative_test_criteria FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can update creative_tests" ON public.creative_tests;
CREATE POLICY "Workspace members can update creative_tests" ON public.creative_tests FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can update creative_validations" ON public.creative_validations;
CREATE POLICY "Workspace members can update creative_validations" ON public.creative_validations FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can update funnels" ON public.funnels;
CREATE POLICY "Workspace members can update funnels" ON public.funnels FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update notion_creatives" ON public.notion_creatives;
CREATE POLICY "Workspace members can update notion_creatives" ON public.notion_creatives FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update notion_sync_runs" ON public.notion_sync_runs;
CREATE POLICY "Workspace members can update notion_sync_runs" ON public.notion_sync_runs FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update organic_catalog" ON public.organic_catalog;
CREATE POLICY "Workspace members can update organic_catalog" ON public.organic_catalog FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update organic_investment_items" ON public.organic_investment_items;
CREATE POLICY "Workspace members can update organic_investment_items" ON public.organic_investment_items FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update organic_investments" ON public.organic_investments;
CREATE POLICY "Workspace members can update organic_investments" ON public.organic_investments FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update sales_process_assignments" ON public.sales_process_assignments;
CREATE POLICY "Workspace members can update sales_process_assignments" ON public.sales_process_assignments FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update sales_processes" ON public.sales_processes;
CREATE POLICY "Workspace members can update sales_processes" ON public.sales_processes FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_campaigns" ON public.utm_campaigns;
CREATE POLICY "Workspace members can update utm_campaigns" ON public.utm_campaigns FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_mediums" ON public.utm_mediums;
CREATE POLICY "Workspace members can update utm_mediums" ON public.utm_mediums FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_objectives" ON public.utm_objectives;
CREATE POLICY "Workspace members can update utm_objectives" ON public.utm_objectives FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_origins" ON public.utm_origins;
CREATE POLICY "Workspace members can update utm_origins" ON public.utm_origins FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_slugs" ON public.utm_slugs;
CREATE POLICY "Workspace members can update utm_slugs" ON public.utm_slugs FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_source_origin_assignments" ON public.utm_source_origin_assignments;
CREATE POLICY "Workspace members can update utm_source_origin_assignments" ON public.utm_source_origin_assignments FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_sources" ON public.utm_sources;
CREATE POLICY "Workspace members can update utm_sources" ON public.utm_sources FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_sources_plain" ON public.utm_sources_plain;
CREATE POLICY "Workspace members can update utm_sources_plain" ON public.utm_sources_plain FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can update utm_terms" ON public.utm_terms;
CREATE POLICY "Workspace members can update utm_terms" ON public.utm_terms FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view ads_campaigns" ON public.ads_campaigns;
CREATE POLICY "Workspace members can view ads_campaigns" ON public.ads_campaigns FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view ads_catalog" ON public.ads_catalog;
CREATE POLICY "Workspace members can view ads_catalog" ON public.ads_catalog FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view campaigns" ON public.campaigns;
CREATE POLICY "Workspace members can view campaigns" ON public.campaigns FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view creative_audit_log" ON public.creative_audit_log;
CREATE POLICY "Workspace members can view creative_audit_log" ON public.creative_audit_log FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view creative_comments" ON public.creative_comments;
CREATE POLICY "Workspace members can view creative_comments" ON public.creative_comments FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view creative_test_criteria" ON public.creative_test_criteria;
CREATE POLICY "Workspace members can view creative_test_criteria" ON public.creative_test_criteria FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view creative_test_history" ON public.creative_test_history;
CREATE POLICY "Workspace members can view creative_test_history" ON public.creative_test_history FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view creative_tests" ON public.creative_tests;
CREATE POLICY "Workspace members can view creative_tests" ON public.creative_tests FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view creative_validations" ON public.creative_validations;
CREATE POLICY "Workspace members can view creative_validations" ON public.creative_validations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "Workspace members can view funnels" ON public.funnels;
CREATE POLICY "Workspace members can view funnels" ON public.funnels FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_insights" ON public.meta_ads_insights;
CREATE POLICY "Workspace members can view meta_ads_insights" ON public.meta_ads_insights FOR SELECT TO authenticated USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_insights_breakdowns" ON public.meta_ads_insights_breakdowns;
CREATE POLICY "Workspace members can view meta_ads_insights_breakdowns" ON public.meta_ads_insights_breakdowns FOR SELECT TO authenticated USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "Workspace members can view meta_ads_sync_log" ON public.meta_ads_sync_log;
CREATE POLICY "Workspace members can view meta_ads_sync_log" ON public.meta_ads_sync_log FOR SELECT TO authenticated USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "Workspace members can view notion_creatives" ON public.notion_creatives;
CREATE POLICY "Workspace members can view notion_creatives" ON public.notion_creatives FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view notion_sync_runs" ON public.notion_sync_runs;
CREATE POLICY "Workspace members can view notion_sync_runs" ON public.notion_sync_runs FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view organic_catalog" ON public.organic_catalog;
CREATE POLICY "Workspace members can view organic_catalog" ON public.organic_catalog FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view organic_investment_items" ON public.organic_investment_items;
CREATE POLICY "Workspace members can view organic_investment_items" ON public.organic_investment_items FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view organic_investments" ON public.organic_investments;
CREATE POLICY "Workspace members can view organic_investments" ON public.organic_investments FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view sales_process_assignments" ON public.sales_process_assignments;
CREATE POLICY "Workspace members can view sales_process_assignments" ON public.sales_process_assignments FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view sales_processes" ON public.sales_processes;
CREATE POLICY "Workspace members can view sales_processes" ON public.sales_processes FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_campaigns" ON public.utm_campaigns;
CREATE POLICY "Workspace members can view utm_campaigns" ON public.utm_campaigns FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_mediums" ON public.utm_mediums;
CREATE POLICY "Workspace members can view utm_mediums" ON public.utm_mediums FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_objectives" ON public.utm_objectives;
CREATE POLICY "Workspace members can view utm_objectives" ON public.utm_objectives FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_origins" ON public.utm_origins;
CREATE POLICY "Workspace members can view utm_origins" ON public.utm_origins FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_slugs" ON public.utm_slugs;
CREATE POLICY "Workspace members can view utm_slugs" ON public.utm_slugs FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_source_origin_assignments" ON public.utm_source_origin_assignments;
CREATE POLICY "Workspace members can view utm_source_origin_assignments" ON public.utm_source_origin_assignments FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_sources" ON public.utm_sources;
CREATE POLICY "Workspace members can view utm_sources" ON public.utm_sources FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_sources_plain" ON public.utm_sources_plain;
CREATE POLICY "Workspace members can view utm_sources_plain" ON public.utm_sources_plain FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "Workspace members can view utm_terms" ON public.utm_terms;
CREATE POLICY "Workspace members can view utm_terms" ON public.utm_terms FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "admins_delete_contatos" ON public.contatos;
CREATE POLICY admins_delete_contatos ON public.contatos FOR DELETE USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true) AND (wm.role = ANY (ARRAY['admin'::text, 'owner'::text, 'admin_master'::text]))))));;
DROP POLICY IF EXISTS "admins_read_audit_log" ON public.audit_log;
CREATE POLICY admins_read_audit_log ON public.audit_log FOR SELECT USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true) AND (wm.role = ANY (ARRAY['admin'::text, 'owner'::text, 'admin_master'::text]))))));;
DROP POLICY IF EXISTS "admins_read_webhooks" ON public.webhooks_ghl;
CREATE POLICY admins_read_webhooks ON public.webhooks_ghl FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true) AND (wm.role = ANY (ARRAY['admin'::text, 'owner'::text]))))));;
DROP POLICY IF EXISTS "app_config_anon_read" ON public.app_config;
CREATE POLICY app_config_anon_read ON public.app_config FOR SELECT TO anon USING (true);;
DROP POLICY IF EXISTS "app_config_service_all" ON public.app_config;
CREATE POLICY app_config_service_all ON public.app_config TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "app_role_permissions: members can read" ON public.app_role_permissions;
CREATE POLICY "app_role_permissions: members can read" ON public.app_role_permissions FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "app_role_permissions: owner/admin can delete" ON public.app_role_permissions;
CREATE POLICY "app_role_permissions: owner/admin can delete" ON public.app_role_permissions FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "app_role_permissions: owner/admin can insert" ON public.app_role_permissions;
CREATE POLICY "app_role_permissions: owner/admin can insert" ON public.app_role_permissions FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "app_role_permissions: owner/admin can update" ON public.app_role_permissions;
CREATE POLICY "app_role_permissions: owner/admin can update" ON public.app_role_permissions FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "app_role_permissions: service role full access" ON public.app_role_permissions;
CREATE POLICY "app_role_permissions: service role full access" ON public.app_role_permissions TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "app_user_overrides: members can read own or workspace overrides" ON public.app_user_overrides;
CREATE POLICY "app_user_overrides: members can read own or workspace overrides" ON public.app_user_overrides FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));;
DROP POLICY IF EXISTS "app_user_overrides: owner/admin can delete" ON public.app_user_overrides;
CREATE POLICY "app_user_overrides: owner/admin can delete" ON public.app_user_overrides FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "app_user_overrides: owner/admin can insert" ON public.app_user_overrides;
CREATE POLICY "app_user_overrides: owner/admin can insert" ON public.app_user_overrides FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "app_user_overrides: owner/admin can update" ON public.app_user_overrides;
CREATE POLICY "app_user_overrides: owner/admin can update" ON public.app_user_overrides FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "app_user_overrides: service role full access" ON public.app_user_overrides;
CREATE POLICY "app_user_overrides: service role full access" ON public.app_user_overrides TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "authenticated_insert_audit_log" ON public.audit_log;
CREATE POLICY authenticated_insert_audit_log ON public.audit_log FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));;
DROP POLICY IF EXISTS "authenticated_read_ghl_tasks" ON public.ghl_tasks;
CREATE POLICY authenticated_read_ghl_tasks ON public.ghl_tasks FOR SELECT TO authenticated USING (true);;
DROP POLICY IF EXISTS "feature_role_perms: admin can write" ON public.app_feature_role_permissions;
CREATE POLICY "feature_role_perms: admin can write" ON public.app_feature_role_permissions TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "feature_role_perms: members can read" ON public.app_feature_role_permissions;
CREATE POLICY "feature_role_perms: members can read" ON public.app_feature_role_permissions FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "feature_role_perms: service role" ON public.app_feature_role_permissions;
CREATE POLICY "feature_role_perms: service role" ON public.app_feature_role_permissions TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "feature_user_overrides: admin can write" ON public.app_feature_user_overrides;
CREATE POLICY "feature_user_overrides: admin can write" ON public.app_feature_user_overrides TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "feature_user_overrides: members can read own" ON public.app_feature_user_overrides;
CREATE POLICY "feature_user_overrides: members can read own" ON public.app_feature_user_overrides FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))));;
DROP POLICY IF EXISTS "feature_user_overrides: service role" ON public.app_feature_user_overrides;
CREATE POLICY "feature_user_overrides: service role" ON public.app_feature_user_overrides TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "ghl_discovery_runs: members can read" ON public.ghl_discovery_runs;
CREATE POLICY "ghl_discovery_runs: members can read" ON public.ghl_discovery_runs FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "ghl_discovery_runs: owner/admin can write" ON public.ghl_discovery_runs;
CREATE POLICY "ghl_discovery_runs: owner/admin can write" ON public.ghl_discovery_runs TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "ghl_discovery_runs: service_role full access" ON public.ghl_discovery_runs;
CREATE POLICY "ghl_discovery_runs: service_role full access" ON public.ghl_discovery_runs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "ghl_field_mapping_templates: authenticated can read" ON public.ghl_field_mapping_templates;
CREATE POLICY "ghl_field_mapping_templates: authenticated can read" ON public.ghl_field_mapping_templates FOR SELECT TO authenticated USING (true);;
DROP POLICY IF EXISTS "ghl_field_mapping_templates: service_role full access" ON public.ghl_field_mapping_templates;
CREATE POLICY "ghl_field_mapping_templates: service_role full access" ON public.ghl_field_mapping_templates TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "ghl_field_mappings: members can read" ON public.ghl_field_mappings;
CREATE POLICY "ghl_field_mappings: members can read" ON public.ghl_field_mappings FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "ghl_field_mappings: owner/admin can write" ON public.ghl_field_mappings;
CREATE POLICY "ghl_field_mappings: owner/admin can write" ON public.ghl_field_mappings TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "ghl_field_mappings: service_role full access" ON public.ghl_field_mappings;
CREATE POLICY "ghl_field_mappings: service_role full access" ON public.ghl_field_mappings TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "ghl_integration_settings: members can read" ON public.ghl_integration_settings;
CREATE POLICY "ghl_integration_settings: members can read" ON public.ghl_integration_settings FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "ghl_integration_settings: owner/admin can write" ON public.ghl_integration_settings;
CREATE POLICY "ghl_integration_settings: owner/admin can write" ON public.ghl_integration_settings TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "ghl_integration_settings: service_role full access" ON public.ghl_integration_settings;
CREATE POLICY "ghl_integration_settings: service_role full access" ON public.ghl_integration_settings TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "ghl_pipeline_mappings: members can read" ON public.ghl_pipeline_mappings;
CREATE POLICY "ghl_pipeline_mappings: members can read" ON public.ghl_pipeline_mappings FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "ghl_pipeline_mappings: owner/admin can write" ON public.ghl_pipeline_mappings;
CREATE POLICY "ghl_pipeline_mappings: owner/admin can write" ON public.ghl_pipeline_mappings TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "ghl_pipeline_mappings: service_role full access" ON public.ghl_pipeline_mappings;
CREATE POLICY "ghl_pipeline_mappings: service_role full access" ON public.ghl_pipeline_mappings TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "ghl_stage_mappings: members can read" ON public.ghl_stage_mappings;
CREATE POLICY "ghl_stage_mappings: members can read" ON public.ghl_stage_mappings FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "ghl_stage_mappings: owner/admin can write" ON public.ghl_stage_mappings;
CREATE POLICY "ghl_stage_mappings: owner/admin can write" ON public.ghl_stage_mappings TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "ghl_stage_mappings: service_role full access" ON public.ghl_stage_mappings;
CREATE POLICY "ghl_stage_mappings: service_role full access" ON public.ghl_stage_mappings TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "goal_definitions_workspace_access" ON public.goal_definitions;
CREATE POLICY goal_definitions_workspace_access ON public.goal_definitions USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "goal_metric_definitions_read_authenticated" ON public.goal_metric_definitions;
CREATE POLICY goal_metric_definitions_read_authenticated ON public.goal_metric_definitions FOR SELECT USING ((auth.role() = 'authenticated'::text));;
DROP POLICY IF EXISTS "goal_snapshots_workspace_access" ON public.goal_snapshots;
CREATE POLICY goal_snapshots_workspace_access ON public.goal_snapshots USING ((goal_version_id IN ( SELECT gv.id FROM ((public.goal_versions gv JOIN public.goal_definitions gd ON ((gd.id = gv.goal_definition_id))) JOIN public.workspace_members wm ON ((wm.workspace_id = gd.workspace_id))) WHERE ((wm.user_id = auth.uid()) AND (wm.is_active = true))))) WITH CHECK ((goal_version_id IN ( SELECT gv.id FROM ((public.goal_versions gv JOIN public.goal_definitions gd ON ((gd.id = gv.goal_definition_id))) JOIN public.workspace_members wm ON ((wm.workspace_id = gd.workspace_id))) WHERE ((wm.user_id = auth.uid()) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "goal_versions_workspace_access" ON public.goal_versions;
CREATE POLICY goal_versions_workspace_access ON public.goal_versions USING ((goal_definition_id IN ( SELECT gd.id FROM (public.goal_definitions gd JOIN public.workspace_members wm ON ((wm.workspace_id = gd.workspace_id))) WHERE ((wm.user_id = auth.uid()) AND (wm.is_active = true))))) WITH CHECK ((goal_definition_id IN ( SELECT gd.id FROM (public.goal_definitions gd JOIN public.workspace_members wm ON ((wm.workspace_id = gd.workspace_id))) WHERE ((wm.user_id = auth.uid()) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "metas_workspace_access" ON public.metas;
CREATE POLICY metas_workspace_access ON public.metas USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "service role full access" ON public.stevo_whatsapp_calls;
CREATE POLICY "service role full access" ON public.stevo_whatsapp_calls TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_bot_context" ON public.bot_context;
CREATE POLICY service_role_all_bot_context ON public.bot_context TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_comunicacoes" ON public.comunicacoes;
CREATE POLICY service_role_all_comunicacoes ON public.comunicacoes TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_contatos" ON public.contatos;
CREATE POLICY service_role_all_contatos ON public.contatos TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_disparo_campos_custom" ON public.disparo_campos_custom;
CREATE POLICY service_role_all_disparo_campos_custom ON public.disparo_campos_custom TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_disparo_campos_custom_valores" ON public.disparo_campos_custom_valores;
CREATE POLICY service_role_all_disparo_campos_custom_valores ON public.disparo_campos_custom_valores TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_disparo_tags" ON public.disparo_tags;
CREATE POLICY service_role_all_disparo_tags ON public.disparo_tags TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_disparos" ON public.disparos;
CREATE POLICY service_role_all_disparos ON public.disparos TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_ghl_api_jobs" ON public.ghl_api_jobs;
CREATE POLICY service_role_all_ghl_api_jobs ON public.ghl_api_jobs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_ghl_calendars" ON public.ghl_calendars;
CREATE POLICY service_role_all_ghl_calendars ON public.ghl_calendars TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
CREATE POLICY service_role_all_ghl_custom_field_mappings ON public.ghl_custom_field_mappings TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY service_role_all_ghl_opp_reconcile_items ON public.ghl_opp_reconcile_items TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY service_role_all_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_ghl_users" ON public.ghl_users;
CREATE POLICY service_role_all_ghl_users ON public.ghl_users TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_oportunidades" ON public.oportunidades;
CREATE POLICY service_role_all_oportunidades ON public.oportunidades TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_sdr_ia_config" ON public.sdr_ia_config;
CREATE POLICY service_role_all_sdr_ia_config ON public.sdr_ia_config TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_secrets" ON public.secrets;
CREATE POLICY service_role_all_secrets ON public.secrets TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY service_role_all_vendas_fechamento ON public.vendas_fechamento TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_aquisicao" ON public.weekly_aquisicao;
CREATE POLICY service_role_all_weekly_aquisicao ON public.weekly_aquisicao TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_closer" ON public.weekly_closer;
CREATE POLICY service_role_all_weekly_closer ON public.weekly_closer TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_cohort_audit" ON public.weekly_cohort_audit;
CREATE POLICY service_role_all_weekly_cohort_audit ON public.weekly_cohort_audit TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_metas" ON public.weekly_metas;
CREATE POLICY service_role_all_weekly_metas ON public.weekly_metas TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_organico" ON public.weekly_organico;
CREATE POLICY service_role_all_weekly_organico ON public.weekly_organico TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_prevendas" ON public.weekly_prevendas;
CREATE POLICY service_role_all_weekly_prevendas ON public.weekly_prevendas TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_recuperacao" ON public.weekly_recuperacao;
CREATE POLICY service_role_all_weekly_recuperacao ON public.weekly_recuperacao TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_reprocess_queue" ON public.weekly_reprocess_queue;
CREATE POLICY service_role_all_weekly_reprocess_queue ON public.weekly_reprocess_queue TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_sdr" ON public.weekly_sdr;
CREATE POLICY service_role_all_weekly_sdr ON public.weekly_sdr TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_snapshots" ON public.weekly_snapshots;
CREATE POLICY service_role_all_weekly_snapshots ON public.weekly_snapshots TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_trafego" ON public.weekly_trafego;
CREATE POLICY service_role_all_weekly_trafego ON public.weekly_trafego TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_weekly_vendas" ON public.weekly_vendas;
CREATE POLICY service_role_all_weekly_vendas ON public.weekly_vendas TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_whatsapp_pricing_config" ON public.whatsapp_pricing_config;
CREATE POLICY service_role_all_whatsapp_pricing_config ON public.whatsapp_pricing_config TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_access" ON public.ai_analysis_sessions;
CREATE POLICY service_role_full_access ON public.ai_analysis_sessions TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_audit_log" ON public.audit_log;
CREATE POLICY service_role_full_audit_log ON public.audit_log TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_comunicacoes" ON public.comunicacoes;
CREATE POLICY service_role_full_comunicacoes ON public.comunicacoes TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_contact_opp_sync_queue" ON public.contact_opp_sync_queue;
CREATE POLICY service_role_full_contact_opp_sync_queue ON public.contact_opp_sync_queue TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_contatos" ON public.contatos;
CREATE POLICY service_role_full_contatos ON public.contatos TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_discagem_scores" ON public.discagem_scores;
CREATE POLICY service_role_full_discagem_scores ON public.discagem_scores TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_ghl_api_jobs" ON public.ghl_api_jobs;
CREATE POLICY service_role_full_ghl_api_jobs ON public.ghl_api_jobs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_ghl_conversations_sync_log" ON public.ghl_conversations_sync_log;
CREATE POLICY service_role_full_ghl_conversations_sync_log ON public.ghl_conversations_sync_log TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY service_role_full_ghl_opp_reconcile_items ON public.ghl_opp_reconcile_items TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY service_role_full_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_ghl_users" ON public.ghl_users;
CREATE POLICY service_role_full_ghl_users ON public.ghl_users TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_meta_ads_permalinks" ON public.meta_ads_permalinks;
CREATE POLICY service_role_full_meta_ads_permalinks ON public.meta_ads_permalinks TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_oportunidades" ON public.oportunidades;
CREATE POLICY service_role_full_oportunidades ON public.oportunidades TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY service_role_full_vendas_fechamento ON public.vendas_fechamento TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "weekly_aquisicao_select_auth" ON public.weekly_aquisicao;
CREATE POLICY weekly_aquisicao_select_auth ON public.weekly_aquisicao FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_closer_select_auth" ON public.weekly_closer;
CREATE POLICY weekly_closer_select_auth ON public.weekly_closer FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_cohort_audit_select_auth" ON public.weekly_cohort_audit;
CREATE POLICY weekly_cohort_audit_select_auth ON public.weekly_cohort_audit FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_email_logs_insert_auth" ON public.weekly_email_logs;
CREATE POLICY weekly_email_logs_insert_auth ON public.weekly_email_logs FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));;
DROP POLICY IF EXISTS "weekly_email_logs_select_auth" ON public.weekly_email_logs;
CREATE POLICY weekly_email_logs_select_auth ON public.weekly_email_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));;
DROP POLICY IF EXISTS "weekly_email_schedules_delete_auth" ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_delete_auth ON public.weekly_email_schedules FOR DELETE USING ((auth.role() = 'authenticated'::text));;
DROP POLICY IF EXISTS "weekly_email_schedules_insert_auth" ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_insert_auth ON public.weekly_email_schedules FOR INSERT WITH CHECK (((auth.role() = 'authenticated'::text) AND (created_by = auth.uid())));;
DROP POLICY IF EXISTS "weekly_email_schedules_select_auth" ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_select_auth ON public.weekly_email_schedules FOR SELECT USING ((auth.role() = 'authenticated'::text));;
DROP POLICY IF EXISTS "weekly_email_schedules_update_auth" ON public.weekly_email_schedules;
CREATE POLICY weekly_email_schedules_update_auth ON public.weekly_email_schedules FOR UPDATE USING ((auth.role() = 'authenticated'::text));;
DROP POLICY IF EXISTS "weekly_metas_select_auth" ON public.weekly_metas;
CREATE POLICY weekly_metas_select_auth ON public.weekly_metas FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_organico_select_auth" ON public.weekly_organico;
CREATE POLICY weekly_organico_select_auth ON public.weekly_organico FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_prevendas_select_auth" ON public.weekly_prevendas;
CREATE POLICY weekly_prevendas_select_auth ON public.weekly_prevendas FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_recuperacao_select_auth" ON public.weekly_recuperacao;
CREATE POLICY weekly_recuperacao_select_auth ON public.weekly_recuperacao FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_reprocess_queue_select_auth" ON public.weekly_reprocess_queue;
CREATE POLICY weekly_reprocess_queue_select_auth ON public.weekly_reprocess_queue FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_sdr_select_auth" ON public.weekly_sdr;
CREATE POLICY weekly_sdr_select_auth ON public.weekly_sdr FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_snapshots_select_auth" ON public.weekly_snapshots;
CREATE POLICY weekly_snapshots_select_auth ON public.weekly_snapshots FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_trafego_select_auth" ON public.weekly_trafego;
CREATE POLICY weekly_trafego_select_auth ON public.weekly_trafego FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "weekly_vendas_select_auth" ON public.weekly_vendas;
CREATE POLICY weekly_vendas_select_auth ON public.weekly_vendas FOR SELECT USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "workspace_admins_delete_bot_context" ON public.bot_context;
CREATE POLICY workspace_admins_delete_bot_context ON public.bot_context FOR DELETE TO authenticated USING (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_delete_comunicacoes" ON public.comunicacoes;
CREATE POLICY workspace_admins_delete_comunicacoes ON public.comunicacoes FOR DELETE TO authenticated USING (public.is_workspace_admin(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_admins_delete_contatos" ON public.contatos;
CREATE POLICY workspace_admins_delete_contatos ON public.contatos FOR DELETE TO authenticated USING (public.is_workspace_admin(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_delete_disparo_tags" ON public.disparo_tags;
CREATE POLICY workspace_admins_delete_disparo_tags ON public.disparo_tags FOR DELETE TO authenticated USING (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_delete_disparos" ON public.disparos;
CREATE POLICY workspace_admins_delete_disparos ON public.disparos FOR DELETE TO authenticated USING (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_delete_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
CREATE POLICY workspace_admins_delete_ghl_custom_field_mappings ON public.ghl_custom_field_mappings FOR DELETE TO authenticated USING (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_delete_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY workspace_admins_delete_ghl_opp_reconcile_items ON public.ghl_opp_reconcile_items FOR DELETE TO authenticated USING (public.is_workspace_admin(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_admins_delete_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY workspace_admins_delete_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs FOR DELETE TO authenticated USING (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_delete_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_admins_delete_oportunidades ON public.oportunidades FOR DELETE TO authenticated USING (public.is_workspace_admin(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_admins_delete_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY workspace_admins_delete_vendas_fechamento ON public.vendas_fechamento FOR DELETE TO authenticated USING ((public.is_workspace_admin(public.get_contact_workspace_id(contato_id)) OR public.is_workspace_admin(public.get_opportunity_workspace_id(oportunidade_id))));;
DROP POLICY IF EXISTS "workspace_admins_insert_bot_context" ON public.bot_context;
CREATE POLICY workspace_admins_insert_bot_context ON public.bot_context FOR INSERT TO authenticated WITH CHECK (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_insert_disparo_tags" ON public.disparo_tags;
CREATE POLICY workspace_admins_insert_disparo_tags ON public.disparo_tags FOR INSERT TO authenticated WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_insert_disparos" ON public.disparos;
CREATE POLICY workspace_admins_insert_disparos ON public.disparos FOR INSERT TO authenticated WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
CREATE POLICY workspace_admins_insert_ghl_custom_field_mappings ON public.ghl_custom_field_mappings FOR INSERT TO authenticated WITH CHECK (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY workspace_admins_insert_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs FOR INSERT TO authenticated WITH CHECK (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_insert_ghl_users" ON public.ghl_users;
CREATE POLICY workspace_admins_insert_ghl_users ON public.ghl_users FOR INSERT TO authenticated WITH CHECK (((workspace_id IS NULL) OR public.is_workspace_admin(workspace_id)));;
DROP POLICY IF EXISTS "workspace_admins_update_bot_context" ON public.bot_context;
CREATE POLICY workspace_admins_update_bot_context ON public.bot_context FOR UPDATE TO authenticated USING (public.is_active_workspace_admin_any()) WITH CHECK (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_update_disparo_tags" ON public.disparo_tags;
CREATE POLICY workspace_admins_update_disparo_tags ON public.disparo_tags FOR UPDATE TO authenticated USING (public.can_write_disparos(workspace_id)) WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_update_disparos" ON public.disparos;
CREATE POLICY workspace_admins_update_disparos ON public.disparos FOR UPDATE TO authenticated USING (public.can_write_disparos(workspace_id)) WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
CREATE POLICY workspace_admins_update_ghl_custom_field_mappings ON public.ghl_custom_field_mappings FOR UPDATE TO authenticated USING (public.is_active_workspace_admin_any()) WITH CHECK (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY workspace_admins_update_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs FOR UPDATE TO authenticated USING (public.is_active_workspace_admin_any()) WITH CHECK (public.is_active_workspace_admin_any());;
DROP POLICY IF EXISTS "workspace_admins_update_ghl_users" ON public.ghl_users;
CREATE POLICY workspace_admins_update_ghl_users ON public.ghl_users FOR UPDATE TO authenticated USING (((workspace_id IS NULL) OR public.is_workspace_admin(workspace_id))) WITH CHECK (((workspace_id IS NULL) OR public.is_workspace_admin(workspace_id)));;
DROP POLICY IF EXISTS "workspace_apps: members can read" ON public.workspace_apps;
CREATE POLICY "workspace_apps: members can read" ON public.workspace_apps FOR SELECT TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_apps: owner/admin can delete" ON public.workspace_apps;
CREATE POLICY "workspace_apps: owner/admin can delete" ON public.workspace_apps FOR DELETE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "workspace_apps: owner/admin can insert" ON public.workspace_apps;
CREATE POLICY "workspace_apps: owner/admin can insert" ON public.workspace_apps FOR INSERT TO authenticated WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "workspace_apps: owner/admin can update" ON public.workspace_apps;
CREATE POLICY "workspace_apps: owner/admin can update" ON public.workspace_apps FOR UPDATE TO authenticated USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text])))))) WITH CHECK ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true) AND (workspace_members.role = ANY (ARRAY['owner'::text, 'admin'::text]))))));;
DROP POLICY IF EXISTS "workspace_apps: service role full access" ON public.workspace_apps;
CREATE POLICY "workspace_apps: service role full access" ON public.workspace_apps TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "workspace_members_insert_comunicacoes" ON public.comunicacoes;
CREATE POLICY workspace_members_insert_comunicacoes ON public.comunicacoes FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_insert_contatos" ON public.contatos;
CREATE POLICY workspace_members_insert_contatos ON public.contatos FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_insert_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY workspace_members_insert_ghl_opp_reconcile_items ON public.ghl_opp_reconcile_items FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_insert_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_insert_oportunidades ON public.oportunidades FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_insert_settings" ON public.workspace_settings;
CREATE POLICY workspace_members_insert_settings ON public.workspace_settings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.workspace_id = workspace_settings.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_insert_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY workspace_members_insert_vendas_fechamento ON public.vendas_fechamento FOR INSERT TO authenticated WITH CHECK ((public.is_workspace_member(public.get_contact_workspace_id(contato_id)) OR public.is_workspace_member(public.get_opportunity_workspace_id(oportunidade_id))));;
DROP POLICY IF EXISTS "workspace_members_read_ads_campaigns" ON public.ads_campaigns;
CREATE POLICY workspace_members_read_ads_campaigns ON public.ads_campaigns FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = ads_campaigns.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_ads_catalog" ON public.ads_catalog;
CREATE POLICY workspace_members_read_ads_catalog ON public.ads_catalog FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = ads_catalog.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_ai_embeddings" ON public.ai_embeddings;
CREATE POLICY workspace_members_read_ai_embeddings ON public.ai_embeddings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_comunicacoes" ON public.comunicacoes;
CREATE POLICY workspace_members_read_comunicacoes ON public.comunicacoes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_contatos" ON public.contatos;
CREATE POLICY workspace_members_read_contatos ON public.contatos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_dashboard_user_lead_filters" ON public.dashboard_user_lead_filters;
CREATE POLICY workspace_members_read_dashboard_user_lead_filters ON public.dashboard_user_lead_filters FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = dashboard_user_lead_filters.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_dashboard_user_permissions" ON public.dashboard_user_permissions;
CREATE POLICY workspace_members_read_dashboard_user_permissions ON public.dashboard_user_permissions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = dashboard_user_permissions.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_discagem_scores" ON public.discagem_scores;
CREATE POLICY workspace_members_read_discagem_scores ON public.discagem_scores FOR SELECT USING (((workspace_id IS NOT NULL) AND public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "workspace_members_read_funnels" ON public.funnels;
CREATE POLICY workspace_members_read_funnels ON public.funnels FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = funnels.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_ghl_users" ON public.ghl_users;
CREATE POLICY workspace_members_read_ghl_users ON public.ghl_users FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_meta_ads_backfill_controle" ON public.meta_ads_backfill_controle;
CREATE POLICY workspace_members_read_meta_ads_backfill_controle ON public.meta_ads_backfill_controle FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_meta_ads_backfill_log" ON public.meta_ads_backfill_log;
CREATE POLICY workspace_members_read_meta_ads_backfill_log ON public.meta_ads_backfill_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_meta_ads_campaigns" ON public.meta_ads_campaigns;
CREATE POLICY workspace_members_read_meta_ads_campaigns ON public.meta_ads_campaigns FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_meta_ads_permalinks" ON public.meta_ads_permalinks;
CREATE POLICY workspace_members_read_meta_ads_permalinks ON public.meta_ads_permalinks FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_meta_ads_raw_insights" ON public.meta_ads_raw_insights;
CREATE POLICY workspace_members_read_meta_ads_raw_insights ON public.meta_ads_raw_insights FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_meta_ads_sync_log" ON public.meta_ads_sync_log;
CREATE POLICY workspace_members_read_meta_ads_sync_log ON public.meta_ads_sync_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_notion_creatives" ON public.notion_creatives;
CREATE POLICY workspace_members_read_notion_creatives ON public.notion_creatives FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = notion_creatives.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_notion_sync_runs" ON public.notion_sync_runs;
CREATE POLICY workspace_members_read_notion_sync_runs ON public.notion_sync_runs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = notion_sync_runs.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_read_oportunidades ON public.oportunidades FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_organic_catalog" ON public.organic_catalog;
CREATE POLICY workspace_members_read_organic_catalog ON public.organic_catalog FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = organic_catalog.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_permission_audit_log" ON public.permission_audit_log;
CREATE POLICY workspace_members_read_permission_audit_log ON public.permission_audit_log FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = permission_audit_log.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_reunioes" ON public.reunioes;
CREATE POLICY workspace_members_read_reunioes ON public.reunioes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_sales_process_assignments" ON public.sales_process_assignments;
CREATE POLICY workspace_members_read_sales_process_assignments ON public.sales_process_assignments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = sales_process_assignments.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_sales_processes" ON public.sales_processes;
CREATE POLICY workspace_members_read_sales_processes ON public.sales_processes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = sales_processes.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_stevo_whatsapp_calls" ON public.stevo_whatsapp_calls;
CREATE POLICY workspace_members_read_stevo_whatsapp_calls ON public.stevo_whatsapp_calls FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_campaigns" ON public.utm_campaigns;
CREATE POLICY workspace_members_read_utm_campaigns ON public.utm_campaigns FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_campaigns.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_mediums" ON public.utm_mediums;
CREATE POLICY workspace_members_read_utm_mediums ON public.utm_mediums FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_mediums.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_objectives" ON public.utm_objectives;
CREATE POLICY workspace_members_read_utm_objectives ON public.utm_objectives FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_objectives.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_origins" ON public.utm_origins;
CREATE POLICY workspace_members_read_utm_origins ON public.utm_origins FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_origins.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_slugs" ON public.utm_slugs;
CREATE POLICY workspace_members_read_utm_slugs ON public.utm_slugs FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_slugs.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_source_origin_assignments" ON public.utm_source_origin_assignments;
CREATE POLICY workspace_members_read_utm_source_origin_assignments ON public.utm_source_origin_assignments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_source_origin_assignments.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_sources" ON public.utm_sources;
CREATE POLICY workspace_members_read_utm_sources ON public.utm_sources FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_sources.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_sources_plain" ON public.utm_sources_plain;
CREATE POLICY workspace_members_read_utm_sources_plain ON public.utm_sources_plain FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_sources_plain.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_utm_terms" ON public.utm_terms;
CREATE POLICY workspace_members_read_utm_terms ON public.utm_terms FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.workspace_id = utm_terms.workspace_id) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY workspace_members_read_vendas_fechamento ON public.vendas_fechamento FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_workspace_members" ON public.workspace_members;
CREATE POLICY workspace_members_read_workspace_members ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_read_workspaces" ON public.workspaces;
CREATE POLICY workspace_members_read_workspaces ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id));;
DROP POLICY IF EXISTS "workspace_members_select_ai_insights" ON public.prevendas_ai_insights;
CREATE POLICY workspace_members_select_ai_insights ON public.prevendas_ai_insights FOR SELECT USING ((workspace_id IN ( SELECT workspace_members.workspace_id FROM public.workspace_members WHERE ((workspace_members.user_id = auth.uid()) AND (workspace_members.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_select_bot_context" ON public.bot_context;
CREATE POLICY workspace_members_select_bot_context ON public.bot_context FOR SELECT TO authenticated USING (public.is_active_workspace_member_any());;
DROP POLICY IF EXISTS "workspace_members_select_comunicacoes" ON public.comunicacoes;
CREATE POLICY workspace_members_select_comunicacoes ON public.comunicacoes FOR SELECT TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_select_contatos" ON public.contatos;
CREATE POLICY workspace_members_select_contatos ON public.contatos FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_disparo_campos_custom" ON public.disparo_campos_custom;
CREATE POLICY workspace_members_select_disparo_campos_custom ON public.disparo_campos_custom FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_disparo_campos_custom_valores" ON public.disparo_campos_custom_valores;
CREATE POLICY workspace_members_select_disparo_campos_custom_valores ON public.disparo_campos_custom_valores FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_disparo_tags" ON public.disparo_tags;
CREATE POLICY workspace_members_select_disparo_tags ON public.disparo_tags FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_disparos" ON public.disparos;
CREATE POLICY workspace_members_select_disparos ON public.disparos FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_ghl_calendars" ON public.ghl_calendars;
CREATE POLICY workspace_members_select_ghl_calendars ON public.ghl_calendars FOR SELECT TO authenticated USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "workspace_members_select_ghl_custom_field_mappings" ON public.ghl_custom_field_mappings;
CREATE POLICY workspace_members_select_ghl_custom_field_mappings ON public.ghl_custom_field_mappings FOR SELECT TO authenticated USING (public.is_active_workspace_member_any());;
DROP POLICY IF EXISTS "workspace_members_select_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY workspace_members_select_ghl_opp_reconcile_items ON public.ghl_opp_reconcile_items FOR SELECT TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_select_ghl_opp_reconcile_runs" ON public.ghl_opp_reconcile_runs;
CREATE POLICY workspace_members_select_ghl_opp_reconcile_runs ON public.ghl_opp_reconcile_runs FOR SELECT TO authenticated USING (public.is_active_workspace_member_any());;
DROP POLICY IF EXISTS "workspace_members_select_ghl_users" ON public.ghl_users;
CREATE POLICY workspace_members_select_ghl_users ON public.ghl_users FOR SELECT TO authenticated USING (((workspace_id IS NULL) OR public.is_workspace_member(workspace_id)));;
DROP POLICY IF EXISTS "workspace_members_select_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_select_oportunidades ON public.oportunidades FOR SELECT TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_select_sdr_ia_config" ON public.sdr_ia_config;
CREATE POLICY workspace_members_select_sdr_ia_config ON public.sdr_ia_config FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY workspace_members_select_vendas_fechamento ON public.vendas_fechamento FOR SELECT TO authenticated USING ((public.is_workspace_member(public.get_contact_workspace_id(contato_id)) OR public.is_workspace_member(public.get_opportunity_workspace_id(oportunidade_id))));;
DROP POLICY IF EXISTS "workspace_members_select_whatsapp_pricing_config" ON public.whatsapp_pricing_config;
CREATE POLICY workspace_members_select_whatsapp_pricing_config ON public.whatsapp_pricing_config FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_update_comunicacoes" ON public.comunicacoes;
CREATE POLICY workspace_members_update_comunicacoes ON public.comunicacoes FOR UPDATE TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id))) WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_update_contatos" ON public.contatos;
CREATE POLICY workspace_members_update_contatos ON public.contatos FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_update_ghl_opp_reconcile_items" ON public.ghl_opp_reconcile_items;
CREATE POLICY workspace_members_update_ghl_opp_reconcile_items ON public.ghl_opp_reconcile_items FOR UPDATE TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id))) WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_update_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_update_oportunidades ON public.oportunidades FOR UPDATE TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id))) WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_update_settings" ON public.workspace_settings;
CREATE POLICY workspace_members_update_settings ON public.workspace_settings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.workspace_id = workspace_settings.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.is_active = true))))) WITH CHECK ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.workspace_id = workspace_settings.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_update_vendas_fechamento" ON public.vendas_fechamento;
CREATE POLICY workspace_members_update_vendas_fechamento ON public.vendas_fechamento FOR UPDATE TO authenticated USING ((public.is_workspace_member(public.get_contact_workspace_id(contato_id)) OR public.is_workspace_member(public.get_opportunity_workspace_id(oportunidade_id)))) WITH CHECK ((public.is_workspace_member(public.get_contact_workspace_id(contato_id)) OR public.is_workspace_member(public.get_opportunity_workspace_id(oportunidade_id))));;
DROP POLICY IF EXISTS "workspace_members_view_settings" ON public.workspace_settings;
CREATE POLICY workspace_members_view_settings ON public.workspace_settings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.workspace_id = workspace_settings.workspace_id) AND (wm.user_id = auth.uid()) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_writers_delete_disparo_campos_custom" ON public.disparo_campos_custom;
CREATE POLICY workspace_writers_delete_disparo_campos_custom ON public.disparo_campos_custom FOR DELETE TO authenticated USING (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_delete_disparo_campos_custom_valores" ON public.disparo_campos_custom_valores;
CREATE POLICY workspace_writers_delete_disparo_campos_custom_valores ON public.disparo_campos_custom_valores FOR DELETE TO authenticated USING (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_delete_sdr_ia_config" ON public.sdr_ia_config;
CREATE POLICY workspace_writers_delete_sdr_ia_config ON public.sdr_ia_config FOR DELETE TO authenticated USING (public.can_write_sdr_ia_config(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_insert_disparo_campos_custom" ON public.disparo_campos_custom;
CREATE POLICY workspace_writers_insert_disparo_campos_custom ON public.disparo_campos_custom FOR INSERT TO authenticated WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_insert_disparo_campos_custom_valores" ON public.disparo_campos_custom_valores;
CREATE POLICY workspace_writers_insert_disparo_campos_custom_valores ON public.disparo_campos_custom_valores FOR INSERT TO authenticated WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_insert_sdr_ia_config" ON public.sdr_ia_config;
CREATE POLICY workspace_writers_insert_sdr_ia_config ON public.sdr_ia_config FOR INSERT TO authenticated WITH CHECK (public.can_write_sdr_ia_config(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_insert_whatsapp_pricing_config" ON public.whatsapp_pricing_config;
CREATE POLICY workspace_writers_insert_whatsapp_pricing_config ON public.whatsapp_pricing_config FOR INSERT TO authenticated WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_update_disparo_campos_custom" ON public.disparo_campos_custom;
CREATE POLICY workspace_writers_update_disparo_campos_custom ON public.disparo_campos_custom FOR UPDATE TO authenticated USING (public.can_write_disparos(workspace_id)) WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_update_disparo_campos_custom_valores" ON public.disparo_campos_custom_valores;
CREATE POLICY workspace_writers_update_disparo_campos_custom_valores ON public.disparo_campos_custom_valores FOR UPDATE TO authenticated USING (public.can_write_disparos(workspace_id)) WITH CHECK (public.can_write_disparos(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_update_sdr_ia_config" ON public.sdr_ia_config;
CREATE POLICY workspace_writers_update_sdr_ia_config ON public.sdr_ia_config FOR UPDATE TO authenticated USING (public.can_write_sdr_ia_config(workspace_id)) WITH CHECK (public.can_write_sdr_ia_config(workspace_id));;
DROP POLICY IF EXISTS "workspace_writers_update_whatsapp_pricing_config" ON public.whatsapp_pricing_config;
CREATE POLICY workspace_writers_update_whatsapp_pricing_config ON public.whatsapp_pricing_config FOR UPDATE TO authenticated USING (public.can_write_disparos(workspace_id)) WITH CHECK (public.can_write_disparos(workspace_id));;

-- Comentarios

COMMENT ON SCHEMA public IS 'standard public schema';
COMMENT ON FUNCTION public.analisar_comunicacoes(p_start_date date, p_end_date date, p_group_by text, p_sdr_name text, p_channel text, p_direction text) IS 'Retorna métricas agregadas de comunicações (mensagens e ligações) por período. Não expoe textos de mensagens nem PII. group_by: none | sdr | channel | direction | month.';
COMMENT ON FUNCTION public.analisar_criativos(p_start_date date, p_end_date date, p_group_by text, p_creative_id text, p_campaign_name text, p_min_spend numeric) IS 'Retorna métricas de criativos/anúncios da Meta Ads cruzadas com vendas do CRM via padrão CR-xxx.';
COMMENT ON FUNCTION public.analisar_criativos(p_start_date date, p_end_date date, p_group_by text, p_creative_id text, p_campaign_name text, p_min_spend numeric, p_limit integer) IS 'Retorna métricas de criativos/anúncios da Meta Ads cruzadas com vendas do CRM via padrão CR-xxx.';
COMMENT ON FUNCTION public.analisar_funnel_cohort(p_start_date date, p_end_date date, p_group_by text, p_utm_source text, p_utm_campaign_code text, p_sdr_name text) IS 'Retorna funil de conversão cohort (data_lead_recebido) por agrupamento. Exclui pipeline de recuperação.';
COMMENT ON FUNCTION public.analisar_investimento_organico(p_start_date date, p_end_date date, p_group_by text, p_category text, p_utm_source text) IS 'Retorna investimento orgânico (custos de equipe) cruzado com MQLs e vendas dos canais orgânicos.';
COMMENT ON FUNCTION public.analisar_meta_ads(p_start_date date, p_end_date date, p_group_by text, p_campaign_name text, p_adset_name text, p_limit integer) IS 'Retorna insights da Meta Ads agregados por campanha, adset, anúncio ou dia.';
COMMENT ON FUNCTION public.analisar_meta_ads_por_regiao(p_start_date date, p_end_date date) IS 'Retorna investimento Meta Ads e vendas do CRM por região brasileira. Visão COHORT: considera leads de tráfego pago que entraram no período e fecharam (data_pagamento_entrada preenchida). Alinhado com o painel Tráfego do dashboard.';
COMMENT ON FUNCTION public.analisar_metas_vs_realizado(p_period_start date, p_period_end date, p_metric_name text, p_area_key text, p_scope_label text, p_group_by text) IS 'Retorna metas vs realizado para a Clara. Se não houver snapshot, calcula o realizado via fonte de dados (MQLs, vendas, faturamento, agendamentos). group_by: none | metric | area | scope.';
COMMENT ON FUNCTION public.analisar_organico(p_start_date date, p_end_date date, p_group_by text, p_utm_source text) IS 'Retorna métricas de canais orgânicos por cohort. Exclui pipeline de recuperação e tráfego pago. Agrupa por nome amigável (utm_source).';
COMMENT ON FUNCTION public.analisar_pre_vendas(p_start_date date, p_end_date date, p_group_by text, p_sdr_name text, p_closer_name text) IS 'Retorna métricas de pré-vendas (leads, MQLs, conectados, agendamentos, reuniões, no-shows, comparecimento) agrupadas por SDR, closer ou mês.';
COMMENT ON FUNCTION public.analisar_recuperacao(p_start_date date, p_end_date date, p_group_by text, p_sdr_name text, p_lost_reason text) IS 'Retorna métricas do pipeline de Recuperação (Sn1Guqcm6zwZNTVOOf5L): leads, perdidos, vendas, faturamento e taxa de reconquista.';
COMMENT ON FUNCTION public.analisar_relatorio_semanal(p_week_start date) IS 'Retorna relatório semanal executivo comparando semana atual vs anterior: leads, MQLs, vendas, faturamento, caixa e investimento Meta.';
COMMENT ON FUNCTION public.analisar_sdr_performance(p_start_date date, p_end_date date, p_mode text, p_sdr_name text) IS 'Retorna performance de SDRs. Modo cohort por data_lead_recebido; produtividade por data do evento.';
COMMENT ON FUNCTION public.analisar_teste_criativos(p_start_date date, p_end_date date, p_creative_ids text[], p_min_spend numeric) IS 'Retorna comparativo de criativos CR-xxx com indicador de winner baseado em ROAS CAIXA e spend mínimo.';
COMMENT ON FUNCTION public.analisar_trafego(p_start_date date, p_end_date date, p_group_by text, p_utm_source text, p_utm_campaign_code text, p_mode text) IS 'Retorna análise completa de traqueamento por source, campanha ou canal. Modos: cohort (data_lead_recebido) ou produtividade (data_pagamento_entrada).';
COMMENT ON FUNCTION public.analisar_vendas(p_start_date date, p_end_date date, p_group_by text, p_closer_name text, p_produto text, p_forma_pagamento text) IS 'Retorna vendas (visão produtividade por data_pagamento_entrada) agrupadas por closer, produto ou forma de pagamento.';
COMMENT ON FUNCTION public.apply_ghl_field_mappings(p_workspace_id uuid, p_payload jsonb) IS 'Retorna JSONB com {logical_name: valor} para todos os mapeamentos ativos do workspace, aplicados ao payload GHL.';
COMMENT ON FUNCTION public.auto_tag_conectado_on_inbound() IS 'Trigger em comunicacoes: marca "conectado" quando inbound tem data_comunicacao
posterior a um outbound. Suporta dois fluxos SDR IA:
  Flow 1 (botão): inbound_botão → outbound → inbound_reply → conectado no reply
  Flow 2 (proativo): outbound → inbound_reply → conectado no reply
Webhook fora de ordem não afeta pois usa data_comunicacao real, não insertion order.
Atualizado em 2026-05-11.';
COMMENT ON FUNCTION public.backfill_meta_ads_job(p_data_inicio date, p_data_fim date) IS 'Chama a Edge Function sync-meta-ads-backfill para recuperar dados históricos do Meta Ads';
COMMENT ON FUNCTION public.bot_query(sql_text text) IS 'Executa SQL SELECT seguro para o bot analítico. Apenas SELECT/WITH permitidos. Usado pela tool run_sql_query do bot-chat para obter números exatos do banco sem passar pelo código TypeScript de agregação.';
COMMENT ON FUNCTION public.buscar_documentos_clara(p_query text, p_limit integer) IS 'Busca chunks de documentação interna usando full-text search em português. Retorna os trechos mais relevantes para a pergunta.';
COMMENT ON FUNCTION public.buscar_lead_para_venda(p_telefone text, p_email text) IS 'Ponte EmpireDesk: retorna contatos candidatos (com oportunidades, mais recente primeiro) para uma venda, casando por telefone (ultimos 8 digitos) ou e-mail.';
COMMENT ON FUNCTION public.can_write_disparos(p_workspace_id uuid) IS 'Permite escrita em disparos/disparo_tags pra owner/admin OU qualquer usuário/role com can_edit=true explicitamente concedido na feature disparos.configuracao.';
COMMENT ON FUNCTION public.can_write_sdr_ia_config(p_workspace_id uuid) IS 'Permite escrita em sdr_ia_config pra owner/admin OU qualquer usuário/role com can_edit=true explicitamente concedido na feature sdr-ia.configuracao.';
COMMENT ON TABLE public.ghl_api_jobs IS 'Fila centralizada de chamadas à API GHL. Worker: ghl-api-worker (*/1 * * * *).';
COMMENT ON COLUMN public.ghl_api_jobs.priority IS '1=urgente (webhook tempo real) | 5=normal (cron) | 10=backfill lento';
COMMENT ON COLUMN public.ghl_api_jobs.idempotency_key IS 'Chave única opcional para evitar duplicatas (ex: "sync-opp-dates:{opp_id}")';
COMMENT ON COLUMN public.ghl_api_jobs.context IS 'Metadados do caller para aplicar o resultado do job no domínio (ex.: opportunity_id, contato_id).';
COMMENT ON COLUMN public.ghl_api_jobs.claimed_at IS 'Timestamp de claim pelo worker. Usado para recuperar jobs presos em processing.';
COMMENT ON COLUMN public.ghl_api_jobs.handled_at IS 'Timestamp em que o caller consumiu/aplicou o result do job.';
COMMENT ON FUNCTION public.extract_and_parse_date(p_custom_data jsonb, p_field_variations text[]) IS 'Extrai campo de customData e converte para timestamptz usando parse_safe_date()';
COMMENT ON FUNCTION public.extract_custom_field(custom_data jsonb, field_variations text[]) IS 'Extrai campo de customData tentando múltiplas variações de chave. 
Retorna o primeiro valor não-nulo encontrado.';
COMMENT ON FUNCTION public.extract_opp_field(payload jsonb, field_name text) IS 'Extrai campo de oportunidade do customData usando convenção de nomenclatura.';
COMMENT ON FUNCTION public.extract_safe_date_from_customdata(p_customdata jsonb, p_key_variations text[]) IS 'Extrai data do customData e converte de forma segura usando parse_safe_date';
COMMENT ON FUNCTION public.extrair_dados_ghl(p_webhook_id uuid) IS 'Extrai dados de webhooks GHL para tabelas estruturadas.
PASSO 1: Extrai Contatos (com owner_name, owner_email do SDR)
PASSO 2: Extrai Oportunidades com parse_safe_date() para datas
PASSO 2.5: Atualiza closer_name no contatos baseado na oportunidade mais recente
PASSO 3: Extrai Vendas Fechamento (com upsert completo)
PASSO 4: Extrai Comunicações (usando colunas desnormalizadas do contatos)
FIX (2026-03-12): UPDATE de oportunidades agora atualiza datas com COALESCE para não sobrescrever valores existentes';
COMMENT ON FUNCTION public.extrair_dados_ghl_v2(p_webhook_id uuid) IS 'Versao refatorada de extrair_dados_ghl que usa ghl_field_mappings por workspace. Mantem equivalencia com v1 para o template Empire Default.';
COMMENT ON FUNCTION public.extrair_vendas_fechamento_do_webhook() IS 'Extrai dados de faturamento/contrato do webhook GHL sem inserir zeros artificiais. Backfill endurecido em 2026-03-30.';
COMMENT ON FUNCTION public.get_creative_metrics(p_workspace_id uuid, p_start_date date, p_end_date date, p_creative_id uuid) IS 'Retorna métricas agregadas por criativo (CR- ou AN-) sem filtros avançados.';
COMMENT ON FUNCTION public.get_creative_metrics(p_workspace_id uuid, p_start_date date, p_end_date date, p_creative_id uuid, p_campaign_names text[], p_adset_names text[], p_ad_names text[], p_channels text[], p_funil_tags text[], p_cp_tags text[]) IS 'Retorna métricas agregadas por criativo (CR- ou AN-) com filtros de campanha, conjunto, anúncio, canal, funil e campanha [cp].';
COMMENT ON FUNCTION public.get_max_creative_number(p_workspace_id uuid, p_prefix text) IS 'Retorna o maior número sequencial já usado para um prefixo (CR ou AN) no workspace.';
COMMENT ON FUNCTION public.get_or_create_conversation(p_user_id uuid, p_title text) IS 'Gets the most recent conversation or creates a new one for the user';
COMMENT ON FUNCTION public.get_workspace_id_by_ghl_location_id(p_location_id text) IS 'Resolve workspace_id a partir do locationId GHL. Fallback para o workspace mais antigo (Fase A).';
COMMENT ON FUNCTION public.listar_openclaw_respostas_recentes(p_limit integer) IS 'Diagnostico publico: lista status recentes do OpenClaw por oportunidade, usando request_id gravado em oportunidades.';
COMMENT ON FUNCTION public.listar_utm_campaigns() IS 'Retorna a lista de campanhas cadastradas no dashboard com código e funis associados.';
COMMENT ON FUNCTION public.listar_utm_sources() IS 'Retorna a lista de canais/sources de tráfego pago cadastrados no dashboard.';
COMMENT ON FUNCTION public.listar_utm_sources_plain() IS 'Retorna a lista de canais orgânicos cadastrados (utm_sources_plain).';
COMMENT ON FUNCTION public.mark_weekly_reprocess_queue_processed(p_workspace_id uuid, p_week_start date, p_report_type text) IS 'Marca como processados todos os itens pendentes da fila para um workspace/semana/tipo.';
COMMENT ON FUNCTION public.match_ai_docs(p_query_embedding public.vector, p_match_threshold double precision, p_match_count integer) IS 'Performs vector similarity search on document chunks for RAG';
COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado() IS 'Trigger de vendas_fechamento: envia OpenClaw quando o link entra e a oportunidade já está em "Assinada" no pipeline Vendas SQL.';
COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado_por_stage() IS 'Trigger de webhooks_ghl: quando a oportunidade entra em "Assinada", procura link/data no webhook atual ou histórico e chama o helper central do OpenClaw.';
COMMENT ON FUNCTION public.on_new_workspace_seed_ghl_mappings() IS 'Seed automatico de ghl_field_mappings com o template Empire Default para todo workspace novo.';
COMMENT ON FUNCTION public.parse_date_flexible(date_str text) IS 'Converte string de data para DATE com validação de range.
Reutiliza parse_safe_date() mas rejeita:
  - Datas antes de 2020-01-01
  - Datas > 30 dias no futuro (protege contra parsing errado, ex: MM/DD invertido)
Retorna NULL se inválido — permite fallback correto no INSERT/UPDATE.
Alterado em 2026-03-15: era TIMESTAMPTZ, agora DATE — alinhado às colunas DATE da tabela oportunidades.';
COMMENT ON FUNCTION public.parse_safe_date(p_date_string text) IS 'Converte string de data para DATE (sem hora, sem fuso).
Formatos suportados em ordem: ISO8601 (YYYY-...) → D/M/YYYY H:MM AM/PM (GHL) → DD/MM/YYYY.
Retorna NULL se nenhum formato casar.
Alterado em 2026-03-15: era TIMESTAMPTZ, agora DATE — alinhado às colunas DATE da tabela oportunidades.';
COMMENT ON FUNCTION public.parse_safe_date_only(p_date_string text) IS 'Converte string de data para date de forma segura (sem timezone).
Delega para parse_safe_date() — herdou a correção MM/DD/YYYY de 2026-03-11.';
COMMENT ON FUNCTION public.processar_meta_ads_pendentes() IS 'Processa registros pendentes de meta_ads_raw_insights. Retorna (processados, erros).';
COMMENT ON FUNCTION public.processar_notificacao_openclaw_contrato_assinado(p_oportunidade_id uuid, p_link_contrato text, p_data_assinatura date) IS 'Helper central do OpenClaw. Enfileira via net.http_post com timeout de 30s, guarda request_id e so marca openclaw_notificado_em apos confirmar resposta 2xx. Também dispara email via Resend para bruno@aliancadealtovalor.com.br (fire-and-forget).';
COMMENT ON FUNCTION public.processar_openclaw_contrato_assinado_job() IS 'Job SQL do cron OpenClaw: confirma respostas do pg_net e reenfileira falhas/expirados.';
COMMENT ON FUNCTION public.processar_task_ghl(p_webhook_id uuid) IS 'Processa eventos TaskCreate/Update/Complete/Delete do GHL e mantém ghl_tasks atualizada. Chamada pelo trigger auto_extrair_dados_ghl após cada INSERT em webhooks_ghl.';
COMMENT ON FUNCTION public.processar_todos_meta_ads_pendentes() IS 'Processa todos os registros pendentes de meta_ads_raw_insights (limite: 100 por chamada). Retorna estatísticas agregadas.';
COMMENT ON FUNCTION public.reenfileirar_openclaw_contrato_assinado_pendentes(p_limit integer) IS 'Reenfileira oportunidades assinadas que continuam sem confirmacao no OpenClaw e nao possuem request pendente.';
COMMENT ON FUNCTION public.resolve_ghl_field_value(p_payload jsonb, p_variations jsonb) IS 'Extrai valor de um payload GHL tentando todas as variacoes de chave fornecidas. Suporta chaves simples, caminhos aninhados e campos customizados {{opportunity.xxx}}.';
COMMENT ON FUNCTION public.sincronizar_status_openclaw_contrato_assinado(p_limit integer) IS 'Sincroniza respostas do pg_net/OpenClaw: confirma 2xx, libera falhas para retry e expira requests sem resposta.';
COMMENT ON FUNCTION public.sync_tags_from_latest_webhook(p_days_back integer) IS 'Atualiza contatos.tags a partir do webhook mais recente por contact_id.
Parâmetro p_days_back (default 90) define a janela de busca.
Não faz chamadas à API GHL. Cron: */5 * * * *.
Fonte de verdade: payload->tags do último webhook recebido.';
COMMENT ON FUNCTION public.sync_tags_from_webhook_batch(p_limit integer, p_days_back integer, p_only_null boolean) IS 'Repara contatos.tags em lotes pequenos a partir do webhook mais recente por contact_id.
Evita scan global em webhooks_ghl. Uso recomendado: backlog de tags nulas.';
COMMENT ON FUNCTION public.sync_tags_from_webhook_target(p_ghl_id text, p_contact_id uuid, p_days_back integer) IS 'Reprocessa um contato específico usando o último webhook com tags.
Útil para debug e reparo operacional sem depender do scan global.';
COMMENT ON FUNCTION public.test_extrair_dados_ghl_v2_equivalence(p_limit integer) IS 'Teste comparativo entre extrair_dados_ghl (v1) e extrair_dados_ghl_v2 para webhooks reais recentes. Usar dentro de transacao com ROLLBACK.';
COMMENT ON FUNCTION public.testar_parse_safe_date() IS 'Função de teste para validar comportamento do parse_safe_date()';
COMMENT ON FUNCTION public.trigger_extrair_dados_ghl() IS 'Trigger function: apos cada INSERT em webhooks_ghl, chama extrair_dados_ghl_v2(NEW.id) para processar contatos/opps usando mapeamentos por workspace, processar_task_ghl() para eventos de task, e sync_tags_from_webhook_target() para garantir que contatos.tags reflita o webhook mais recente com tags.';
COMMENT ON FUNCTION public.update_oportunidade_from_webhook() IS 'Trigger function que extrai dados de webhooks GHL para a tabela oportunidades. Implementa TODOS os campos documentados em Document_GHL.md com fallbacks apropriados.';
COMMENT ON FUNCTION public.upsert_meta_ads_campaign(p_campaign_id text, p_account_id text, p_name text, p_status text, p_objective text, p_daily_budget numeric, p_lifetime_budget numeric, p_start_time timestamp with time zone, p_stop_time timestamp with time zone, p_created_time timestamp with time zone, p_updated_time timestamp with time zone) IS 'Insere ou atualiza metadados de uma campanha. Retorna o UUID interno.';
COMMENT ON FUNCTION public.verificar_status_backfill() IS 'Retorna status dos últimos backfills executados';
COMMENT ON TABLE public.ai_conversations IS 'Stores chat conversations for AI assistant';
COMMENT ON TABLE public.ai_messages IS 'Stores individual messages in AI assistant conversations';
COMMENT ON VIEW public.ai_conversation_stats IS 'Aggregated statistics for AI conversations';
COMMENT ON TABLE public.ai_doc_chunks IS 'Stores document chunks with embeddings for RAG-based AI assistant';
COMMENT ON TABLE public.ai_doc_index_status IS 'Tracks which documents have been indexed and their hash for change detection';
COMMENT ON VIEW public.ai_doc_index_summary IS 'Summary view of document indexing status';
COMMENT ON TABLE public."aplic-acelerador" IS 'Fila de submissões de formulários do aplic-acelerador para o GHL. Registro é criado antes da tentativa ao GHL. Retry automático via cron (retry-ghl). Uma tabela única para todos os formulários — campos específicos ficam em form_payload/ghl_payload (JSONB).';
COMMENT ON COLUMN public."aplic-acelerador".status IS 'pending = aguardando envio ao GHL | success = enviado com sucesso';
COMMENT ON COLUMN public."aplic-acelerador".sent_at IS 'Timestamp exato em que o contato foi criado/atualizado no GHL com sucesso';
COMMENT ON TABLE public.bot_context IS 'Contexto dinâmico injetado no system prompt do bot Empire. Atualize aqui para mudar o conhecimento do bot sem redeploy.';
COMMENT ON COLUMN public.campaigns.meta_campaign_id IS 'ID da campanha do Meta Ads quando o agrupamento foi importado do Meta; NULL para agrupamentos manuais.';
COMMENT ON TABLE public.comunicacoes IS 'Mensagens, ligações e conversações AI dos contatos - sugerido no Document_GHL.md';
COMMENT ON COLUMN public.comunicacoes.contato_id IS 'FK para contatos.id. Pode ser NULL para comunicações importadas via API GHL de contatos que ainda não passaram pelo webhook ou cujo registro não foi encontrado no momento do sync.';
COMMENT ON COLUMN public.comunicacoes.tipo IS 'Tipo: mensagem, ligacao ou ai_conversation';
COMMENT ON COLUMN public.comunicacoes.direction IS 'inbound = mensagem veio do lead; outbound = enviada pelo SDR/sistema. NULL = histórico anterior à migração.';
COMMENT ON COLUMN public.comunicacoes.ghl_message_id IS 'ID único da mensagem no GHL. Usado como chave de deduplicação no sync da API GHL Conversations.';
COMMENT ON COLUMN public.comunicacoes.ghl_conversation_id IS 'ID da conversa no GHL. Uma conversa agrupa todas as mensagens com um contato em um canal.';
COMMENT ON COLUMN public.comunicacoes.channel IS 'Canal da comunicação: sms | whatsapp | email | call | facebook | instagram | gmb | webchat';
COMMENT ON COLUMN public.comunicacoes.data_comunicacao IS 'Timestamp real da mensagem no GHL (dateAdded). Use este campo para análise temporal, não created_at.';
COMMENT ON COLUMN public.comunicacoes.attachments IS 'Array JSON de URLs de anexos (imagens, documentos, áudios, vídeos).';
COMMENT ON COLUMN public.comunicacoes.usuario_ghl_id IS 'ID do usuário GHL que enviou a mensagem (userId). Presente em mensagens outbound. Mapeável para owner_id na tabela contatos.';
COMMENT ON COLUMN public.comunicacoes.contato_nome IS 'Nome do contato (desnormalizado de contatos.nome)';
COMMENT ON COLUMN public.comunicacoes.contato_email IS 'Email do contato (desnormalizado de contatos.email)';
COMMENT ON COLUMN public.comunicacoes.contato_telefone IS 'Telefone do contato (desnormalizado de contatos.telefone)';
COMMENT ON COLUMN public.comunicacoes.sdr_name IS 'Nome do SDR responsável (desnormalizado de contatos.owner_name)';
COMMENT ON COLUMN public.comunicacoes.sdr_email IS 'Email do SDR (reservado para uso futuro)';
COMMENT ON COLUMN public.comunicacoes.closer_name IS 'Nome do Closer/Vendedor (reservado para uso futuro)';
COMMENT ON COLUMN public.comunicacoes.ghl_source IS 'Origem da mensagem conforme GHL API (campo "source"): "app" = enviado manualmente pelo usuário no app GHL; "api" = enviado via API (automação externa); "workflow" = enviado por workflow/bot do GHL. NULL = dados históricos anteriores a esta migration. Use: direction=outbound AND ghl_source IN (''workflow'',''api'') para detectar automação/IA.';
COMMENT ON COLUMN public.comunicacoes.msg_status IS 'Status de entrega da mensagem conforme GHL API: "sent" | "delivered" | "read" | "failed" | "pending" | "connected" | "completed". Para ligações: "completed" | "failed" | "no-answer" | "busy" | "canceled".';
COMMENT ON COLUMN public.comunicacoes.ghl_date_updated IS 'Timestamp da última atualização do registro de mensagem no GHL (campo "dateUpdated"). Indica quando o status mudou — útil para medir tempo de entrega, leitura, etc.';
COMMENT ON COLUMN public.comunicacoes.alt_id IS 'ID externo da mensagem na plataforma de origem (campo "altId" da GHL API). Exemplos: wamid.HBgM... para WhatsApp, ID Meta para Facebook/Instagram.';
COMMENT ON COLUMN public.comunicacoes.error_msg IS 'Descrição do erro quando msg_status = ''failed'' (campo "error" da GHL API). Exemplos: "Invalid destination number or unreachable", "Blocked by user".';
COMMENT ON COLUMN public.comunicacoes.msg_from IS 'Identificador do remetente para todos os canais (campo "from" da GHL API). WhatsApp/SMS: número de telefone. Email: endereço. Call: duplica phone_call_from.';
COMMENT ON COLUMN public.comunicacoes.msg_to IS 'Identificador do destinatário para todos os canais (campo "to" da GHL API).';
COMMENT ON COLUMN public.comunicacoes.ghl_assigned_to IS 'ID do usuário GHL atribuído à conversa (campo "assignedTo" de GHLConversation). Pode diferir de usuario_ghl_id (quem enviou a mensagem). Mapeável para ghl_users.ghl_id.';
COMMENT ON TABLE public.ghl_users IS 'Usuários do location GHL — usado para identificar quem enviou mensagens em comunicacoes.usuario_ghl_id';
COMMENT ON COLUMN public.ghl_users.ghl_id IS 'ID do usuário na GHL. Join: comunicacoes.usuario_ghl_id = ghl_users.ghl_id';
COMMENT ON COLUMN public.ghl_users.role_ghl IS 'Papel na plataforma GHL: admin | user';
COMMENT ON COLUMN public.ghl_users.papeis IS 'Papéis no negócio: sdr | closer | social_seller | gestor | sistema (array, multi-papel)';
COMMENT ON COLUMN public.ghl_users.auth_user_id IS 'UUID do auth.users se este usuário GHL tem acesso ao dashboard';
COMMENT ON COLUMN public.ghl_users.clara_habilitado IS 'Se true, o usuário autenticado (auth_user_id) pode usar a Clara no dashboard. Default false — deve ser habilitado manualmente por admin em Settings > Usuários.';
COMMENT ON COLUMN public.ghl_users.workspace_id IS 'Workspace ao qual o usuário GHL pertence. Isolamento por tenant.';
COMMENT ON VIEW public.comunicacoes_com_remetente IS 'comunicacoes enriquecida com dados do remetente e detecção de automação. Campos extras: remetente_nome, remetente_papeis, remetente_email, is_automatico, autor. autor: ''lead'' | ''automacao'' | papeis[1] do usuário GHL | nome | ''time'' | ''desconhecido''. is_automatico: true quando ghl_source IN (''workflow'',''api'',''bot'') ou outbound sem userId.';
COMMENT ON COLUMN public.contact_opp_sync_queue.claimed_at IS 'Timestamp de claim da edge function. Usado para recuperar itens presos em processing.';
COMMENT ON TABLE public.contatos IS 'Contatos extraídos dos webhooks GHL - data de criação real vem do GHL';
COMMENT ON COLUMN public.contatos.ghl_id IS 'ID do contato no GHL (referência externa)';
COMMENT ON COLUMN public.contatos.nome IS 'Nome completo do contato';
COMMENT ON COLUMN public.contatos.email IS 'Email do contato';
COMMENT ON COLUMN public.contatos.telefone IS 'Telefone do contato';
COMMENT ON COLUMN public.contatos.date_created IS 'Data/hora de criação do contato no GHL. Armazenada como TIMESTAMPTZ UTC.
Para exibição em BRT: usar fmtDateTime() no frontend (aplica America/Sao_Paulo).
Backfill aplicado em 2026-05-08 para corrigir registros onde hora estava zerada.';
COMMENT ON COLUMN public.contatos.total_oportunidades_ghl IS 'Quantidade de oportunidades que a API do GHL informou para o contato na última reconciliação write.';
COMMENT ON COLUMN public.contatos.total_oportunidades_db IS 'Quantidade de oportunidades encontradas no banco para o contato na última reconciliação write. Backfill inicial feito via SQL local.';
COMMENT ON COLUMN public.contatos.attribution_attempts IS 'Número de vezes que tentamos resolver attribution sem sucesso para este contato.';
COMMENT ON COLUMN public.contatos.attribution_skip IS 'Quando TRUE, a cron e o trigger não enfileiram mais jobs de attribution para este contato (attribution exaurida).';
COMMENT ON COLUMN public.contatos.workspace_id IS 'Workspace ao qual o contato pertence. Isolamento por tenant. DEFAULT aponta para o workspace mais antigo até o trigger de ingestão de webhook resolver o workspace certo por location_id.';
COMMENT ON COLUMN public.discagem_scores.score_sinal IS 'Sub-score 0-1000: sinal de resposta (peso 40%)';
COMMENT ON COLUMN public.discagem_scores.score_urgencia IS 'Sub-score 0-1000: recência/velocidade desde data_lead_recebido (peso 30%)';
COMMENT ON COLUMN public.discagem_scores.score_tentativas IS 'Sub-score 0-1000: inverso de fadiga — decai com tentativas de call (peso 5%)';
COMMENT ON COLUMN public.discagem_scores.score_fonte IS 'Sub-score 0-1000: engajamento por canal certo — touches humanos recentes (peso 10%)';
COMMENT ON COLUMN public.discagem_scores.score_qualificacao IS 'Sub-score 0-1000: qualificação MQL (peso 15%)';
COMMENT ON COLUMN public.discagem_scores.escopo IS 'pre_vendas (Pré-Vendas MQL + Auto Agendamento) ou recuperacao (pipeline Recuperação) — separa as duas filas na UI.';
COMMENT ON COLUMN public.disparos.tipo_mensagem IS 'Categoria de template do WhatsApp Business Platform usada neste disparo (Meta cobra por mensagem entregue, preço difere por categoria). Ver whatsapp_pricing_config pro valor pago por categoria.';
COMMENT ON TABLE public.estado_uf_normalizacao IS 'Normaliza variações de estado_uf (sigla, nome completo, erros comuns) para UF e região brasileira.';
COMMENT ON TABLE public.ghl_calendars IS 'Cache local dos calendários do location GHL — usado para traduzir calendarId em nome legível.';
COMMENT ON COLUMN public.ghl_calendars.ghl_id IS 'ID do calendário na GHL. Join: oportunidades.agendamento_calendar_id = ghl_calendars.ghl_id.';
COMMENT ON COLUMN public.ghl_calendars.nome IS 'Nome legível do calendário no GHL.';
COMMENT ON COLUMN public.ghl_calendars.location_id IS 'Location ID do GHL ao qual o calendário pertence (quando disponível).';
COMMENT ON TABLE public.ghl_conversations_sync_log IS 'Registra cada execução do sync de conversas da API GHL. O modo incremental usa finished_at do último sucesso para calcular startAfterDate.';
COMMENT ON COLUMN public.ghl_conversations_sync_log.mode IS 'incremental = busca mensagens novas desde último sync. full_backfill = processa todas as conversas (use page_processed para controlar progresso).';
COMMENT ON TABLE public.ghl_custom_field_mappings IS 'Mapeamento entre nome lógico do projeto e ID real do custom field do GHL.';
COMMENT ON COLUMN public.ghl_custom_field_mappings.logical_name IS 'Nome lógico usado no código (ex: utm_source, tt_content).';
COMMENT ON COLUMN public.ghl_custom_field_mappings.ghl_custom_field_id IS 'ID do custom field do GHL retornado por GET /locations/{locationId}/customFields.';
COMMENT ON TABLE public.ghl_field_mapping_templates IS 'Templates globais de mapeamento GHL. Atualizado em 2026-07-08 para conter todos os campos extraidos por extrair_dados_ghl_v2.';
COMMENT ON TABLE public.ghl_tasks IS 'Tasks criadas nos contatos do GHL (via webhook TaskCreate/Update/Complete/Delete). Usada no painel de discagem para exibir ligações agendadas como Prioridade 2.';
COMMENT ON COLUMN public.goal_definitions.app_slug IS 'Slug do sub-app ao qual a meta está vinculada (ex: pre-vendas, sdr-ia, metas). Null = não vinculada a nenhum app.';
COMMENT ON TABLE public.meta_ads_campaigns IS 'Metadados das campanhas Meta Ads. Atualizado periodicamente (não a cada hora). campaign_id é o ID único da Meta.';
COMMENT ON TABLE public.meta_ads_insights IS 'Métricas de performance das campanhas Meta Ads. Granularidade: por hora e por anúncio (ad_id). Chave única: (date, hour, ad_id).';
COMMENT ON COLUMN public.meta_ads_insights.actions IS 'Array de ações: [{"action_type": "lead", "value": "3"}, ...]';
COMMENT ON COLUMN public.meta_ads_insights.video_metrics IS 'Objeto: {"p25": 156, "p50": 98, "p75": 45, "p95": 30, "p100": 23, "avg_time": 12.5}';
COMMENT ON COLUMN public.meta_ads_insights.workspace_id IS 'Workspace ao qual este insight pertence. NULL = legado sem isolamento (backfill pendente).';
COMMENT ON TABLE public.meta_ads_insights_breakdowns IS 'Segmentações demográficas e técnicas dos insights. Uma linha de insights pode ter múltiplas breakdowns (1:N).';
COMMENT ON COLUMN public.meta_ads_insights_breakdowns.breakdown_type IS 'Tipo de segmentação: region, age_gender, publisher_platform, etc.';
COMMENT ON COLUMN public.meta_ads_insights_breakdowns.workspace_id IS 'Workspace ao qual este breakdown pertence. Propagado do insight pai.';
COMMENT ON TABLE public.meta_ads_permalinks IS 'URLs públicos dos anúncios Meta (Instagram/Facebook) sincronizados via Meta Marketing API. Populada pela edge function sync-ad-permalinks.';
COMMENT ON COLUMN public.meta_ads_permalinks.ad_id IS 'ID do anúncio na Meta Marketing API.';
COMMENT ON COLUMN public.meta_ads_permalinks.creative_code IS 'Código do criativo no formato CR-XXX, extraído do campo ad_name do Meta.';
COMMENT ON COLUMN public.meta_ads_permalinks.instagram_permalink_url IS 'URL pública do post no Instagram. Preferencial para exibição.';
COMMENT ON COLUMN public.meta_ads_permalinks.permalink_url IS 'URL pública do post no Facebook. Fallback quando instagram_permalink_url está vazio.';
COMMENT ON TABLE public.meta_ads_raw_insights IS 'JSON bruto da resposta da Meta Marketing API. Fonte de verdade para auditoria e reprocessamento. processado_em = NULL indica que ainda não foi processado.';
COMMENT ON COLUMN public.meta_ads_raw_insights.response_data IS 'JSON completo da resposta da API Meta (inclui data[], paging, etc)';
COMMENT ON COLUMN public.meta_ads_raw_insights.processado_em IS 'Timestamp quando o registro foi processado para meta_ads_insights. NULL = pendente.';
COMMENT ON COLUMN public.meta_ads_raw_insights.workspace_id IS 'Workspace ao qual este lote de insights pertence. NULL = legado sem isolamento (backfill pendente).';
COMMENT ON TABLE public.meta_ads_region_mapping IS 'Mapeia os nomes de região retornados pela Meta Ads API para UF e região brasileira.';
COMMENT ON TABLE public.meta_ads_sync_log IS 'Log de execuções da sincronização Meta Ads. Status: success, error, partial, running.';
COMMENT ON COLUMN public.meta_ads_sync_log.workspace_id IS 'Workspace relacionado à execução de sync. NULL quando não informado.';
COMMENT ON COLUMN public.notion_creatives.post_url IS 'Link público do post no Instagram ou Facebook. Populado pelo campo "Link do Anúncio" do Notion.';
COMMENT ON COLUMN public.notion_creatives.objective IS 'Objetivo do criativo — campo "Objetivo" do Notion (select/multi_select). Null até o campo ser criado no Notion.';
COMMENT ON COLUMN public.notion_creatives.social_network IS 'Rede social de destino — campo "Rede Social" do Notion (multi_select, primeiro item). Orgânicos.';
COMMENT ON COLUMN public.notion_creatives.micro_program IS 'MicroPrograma — campo "MicroPrograma" do Notion (select). Orgânicos.';
COMMENT ON TABLE public.oportunidades IS 'Oportunidades extraídas dos webhooks GHL - data de criação real vem do GHL (date_created)';
COMMENT ON COLUMN public.oportunidades.ghl_opportunity_id IS 'ID da oportunidade no GHL (referência externa)';
COMMENT ON COLUMN public.oportunidades.contato_id IS 'FK para tabela contatos (relacionamento 1:N)';
COMMENT ON COLUMN public.oportunidades.nome_contato IS 'Nome do contato (cache para identificação visual)';
COMMENT ON COLUMN public.oportunidades.email_contato IS 'Email do contato (cache para identificação visual)';
COMMENT ON COLUMN public.oportunidades.titulo IS 'Título/nome da oportunidade';
COMMENT ON COLUMN public.oportunidades.valor IS 'Valor monetário da oportunidade';
COMMENT ON COLUMN public.oportunidades.status IS 'Status da oportunidade (open, won, lost, etc)';
COMMENT ON COLUMN public.oportunidades.pipeline_id IS 'ID do pipeline no GHL';
COMMENT ON COLUMN public.oportunidades.pipeline_stage_id IS 'ID do estágio do pipeline no GHL';
COMMENT ON COLUMN public.oportunidades.data_lead_recebido IS 'Data de criação da oportunidade no GHL. NÃO indica classificação MQL.
Para filtrar MQLs use: pipeline_name = ''Pré-Vendas MQL''';
COMMENT ON COLUMN public.oportunidades.data_tentativa_1 IS 'Data da 1ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_2 IS 'Data da 2ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_3 IS 'Data da 3ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_4 IS 'Data da 4ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_5 IS 'Data da 5ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_6 IS 'Data da 6ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_7 IS 'Data da 7ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_tentativa_8 IS 'Data da 8ª tentativa de contato (SDR)';
COMMENT ON COLUMN public.oportunidades.data_no_show IS 'Data em que o lead não compareceu (pré-venda)';
COMMENT ON COLUMN public.oportunidades.data_conectado IS 'Data em que conseguiu falar com o lead';
COMMENT ON COLUMN public.oportunidades.data_perdido IS 'Data em que o lead foi marcado como perdido (pré-venda)';
COMMENT ON COLUMN public.oportunidades.data_qualificado IS 'Data em que o lead foi qualificado (virou SQL)';
COMMENT ON COLUMN public.oportunidades.data_no_show_vendas IS 'Data de no show na fase de vendas';
COMMENT ON COLUMN public.oportunidades.data_perdido_vendas IS 'Data de perdido na fase de vendas';
COMMENT ON COLUMN public.oportunidades.data_agendamento_vendas IS 'Data em que reunião de vendas foi agendada';
COMMENT ON COLUMN public.oportunidades.data_realizacao_vendas IS 'Data em que a reunião de vendas foi realizada';
COMMENT ON COLUMN public.oportunidades.data_negociacao IS 'Data em que entrou em negociação';
COMMENT ON COLUMN public.oportunidades.data_fechado IS 'Data em que a venda foi fechada';
COMMENT ON COLUMN public.oportunidades.data_agendamento_reuniao IS 'Data em que a reunião foi agendada (momento do agendamento)';
COMMENT ON COLUMN public.oportunidades.op_vencimentos_e_parcelas IS 'Cronograma detalhado de vencimentos e parcelas em boleto. Texto livre enviado pelo GHL via {{ opportunity.op_vencimentos_e_parcelas }}. Exemplo: "1ª parcela: 10/04/2026 - R$ 3.000 | 2ª parcela: 10/05/2026 - R$ 3.000"';
COMMENT ON COLUMN public.oportunidades.openclaw_notificado_em IS 'Momento em que o OpenClaw confirmou a entrega com sucesso (2xx).';
COMMENT ON COLUMN public.oportunidades.openclaw_request_id IS 'Ultimo request_id do pg_net para envio ao OpenClaw enquanto a entrega ainda nao foi confirmada.';
COMMENT ON COLUMN public.oportunidades.openclaw_enfileirado_em IS 'Momento em que o request foi enfileirado no pg_net para o OpenClaw.';
COMMENT ON COLUMN public.oportunidades.openclaw_ultima_resposta_em IS 'Momento da ultima resposta observada do pg_net/OpenClaw para esta oportunidade.';
COMMENT ON COLUMN public.oportunidades.openclaw_ultimo_status_code IS 'Ultimo status HTTP observado para o webhook do OpenClaw.';
COMMENT ON COLUMN public.oportunidades.openclaw_ultimo_erro IS 'Ultimo erro ou corpo resumido de falha do OpenClaw/pg_net.';
COMMENT ON COLUMN public.oportunidades.last_appointment_sync_at IS 'Timestamp do último sync bem-sucedido de appointments via API GHL (sync-appointment-dates). NULL = nunca sincronizado.';
COMMENT ON COLUMN public.oportunidades.last_pipeline_sync_at IS 'Timestamp da última tentativa aplicada de sync de pipeline via API GHL (sync-opp-pipelines). Usado para cadenciar a cron da janela quente de reuniões e evitar reprocessamento excessivo.';
COMMENT ON COLUMN public.oportunidades.agendamento_origem IS 'Fonte do agendamento no GHL: conversations_ai, calendar_page, google_calendar, event_sync, etc.';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_id IS 'ID do usuário do GHL que criou o agendamento (quando humano). Quando IA, fica NULL.';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_nome IS 'Nome legível do usuário que criou o agendamento (quando humano).';
COMMENT ON COLUMN public.oportunidades.agendamento_por_user_email IS 'Email do usuário que criou o agendamento (quando humano).';
COMMENT ON COLUMN public.oportunidades.agendamento_calendar_id IS 'ID do calendário do GHL onde o agendamento foi feito.';
COMMENT ON COLUMN public.oportunidades.agendamento_calendar_name IS 'Nome legível do calendário do GHL onde o agendamento foi feito.';
COMMENT ON COLUMN public.oportunidades.agendamento_assigned_user_id IS 'ID do dono do calendário / closer atribuído no GHL.';
COMMENT ON COLUMN public.oportunidades.agendamento_assigned_user_nome IS 'Nome legível do dono do calendário / closer atribuído no GHL.';
COMMENT ON COLUMN public.oportunidades.appointment_status IS 'Status real do appointment de referência no GHL (showed/completed/noshow/confirmed/new/cancelled/invalid/rescheduled). Fato do GHL; usado para categorizar agendamentos sem deixar "sem status".';
COMMENT ON TABLE public.reunioes IS 'Agendamentos de reuniões - sugerido no Document_GHL.md';
COMMENT ON TABLE public.telegram_allowed_users IS 'Allowlist de usuários autorizados a usar o bot Empire no Telegram';
COMMENT ON COLUMN public.telegram_allowed_users.telegram_user_id IS 'ID numérico do usuário no Telegram (obter via @userinfobot)';
COMMENT ON COLUMN public.telegram_allowed_users.nome IS 'Nome legível para identificação (ex: João Silva)';
COMMENT ON COLUMN public.telegram_allowed_users.ativo IS 'false = bloqueado sem precisar deletar';
COMMENT ON TABLE public.vendas_fechamento IS 'Dados de contrato e pagamento das vendas fechadas. 
Fonte: campos de oportunidade do GHL com data_pagamento_entrada preenchida.
Referência: Document_GHL.md linhas 87-125';
COMMENT ON COLUMN public.vendas_fechamento.oportunidade_id IS 'FK para oportunidades.id';
COMMENT ON COLUMN public.vendas_fechamento.valor_faturado IS 'Calculado automaticamente: entrada + (parcelas × valor_parcela)';
COMMENT ON COLUMN public.vendas_fechamento.op_vencimentos_parcelas IS 'Cronograma de vencimentos das parcelas conforme GHL. Ex: "30/60/90 dias". Extraído do campo Op_Vencimentos e parcelas do GHL.';
COMMENT ON COLUMN public.vendas_fechamento.op_link_do_contrato_assinado IS 'Link do contrato assinado (ex: Open Claw). Extraído do campo {{opportunity.op_link_do_contrato_assinado}} do GHL.';
COMMENT ON COLUMN public.vendas_fechamento.data_da_assinatura_do_contrato IS 'Data de assinatura do contrato. Extraído do campo {{opportunity.data_da_assinatura_do_contrato}} do GHL.';
COMMENT ON COLUMN public.vendas_fechamento.link_gravacao_call_vendas IS 'Link da gravação da call de vendas (reunião closer). Chave GHL: {{opportunity.link_da_gravao_da_call_de_vendas}}';
COMMENT ON COLUMN public.vendas_fechamento.pagamentos IS 'Lista detalhada de pagamentos vinda do formulario EmpireDesk: [{data,valor,forma,plataforma,sinal}]. Vazio ([]) para registros historicos do GHL.';
COMMENT ON COLUMN public.vendas_fechamento.comprovantes IS 'Metadata dos comprovantes copiados para o bucket vendas-comprovantes: [{storage_path,nome_original,mime_type,tamanho_bytes}].';
COMMENT ON COLUMN public.vendas_fechamento.closer_nome IS 'Nome do closer que fechou a venda (origem EmpireDesk).';
COMMENT ON COLUMN public.vendas_fechamento.closer_email IS 'E-mail do closer que fechou a venda (origem EmpireDesk).';
COMMENT ON COLUMN public.vendas_fechamento.origem IS 'Origem do registro: ghl (webhook/OpenClaw) ou empiredesk (formulario de vendas).';
COMMENT ON VIEW public.v_creative_status_counts IS 'Contagem de criativos por status e origem (notion/native) por workspace.';
COMMENT ON TABLE public.whatsapp_pricing_config IS 'Preço pago por mensagem entregue no WhatsApp Business Platform, por categoria (marketing/utility) e por workspace. Preço varia por país/mercado na tabela da Meta — cada workspace configura o que realmente paga.';
COMMENT ON VIEW public.v_meta_ads_daily_summary IS 'Resumo diário de métricas por campanha. Útil para dashboards e relatórios.';
COMMENT ON VIEW public.v_meta_ads_ultimas_syncs IS 'Últimas 20 sincronizações realizadas. Útil para monitoramento.';
COMMENT ON TABLE public.weekly_aquisicao IS 'Métricas semanais do módulo Aquisição. FK para weekly_snapshots.';
COMMENT ON TABLE public.weekly_closer IS 'Métricas semanais do módulo Closer. FK para weekly_snapshots.';
COMMENT ON TABLE public.weekly_organico IS 'Métricas semanais do módulo Orgânico (sem investimento Meta). FK para weekly_snapshots.';
COMMENT ON TABLE public.weekly_prevendas IS 'Métricas semanais do módulo Pré-Vendas. FK para weekly_snapshots.';
COMMENT ON TABLE public.weekly_recuperacao IS 'Métricas semanais do módulo Recuperação. FK para weekly_snapshots.';
COMMENT ON TABLE public.weekly_sdr IS 'Métricas semanais do módulo SDR. FK para weekly_snapshots.';
COMMENT ON TABLE public.weekly_snapshots IS 'Catálogo central de todos os snapshots semanais. Cada semana comercial (segunda→domingo) gera 2 snapshots: cohort e produtividade. As tabelas por módulo referenciam este ID.';
COMMENT ON COLUMN public.weekly_snapshots.week_start IS 'Segunda-feira da semana comercial (DATE). Identificador temporal.';
COMMENT ON COLUMN public.weekly_snapshots.report_type IS 'cohort = métricas filtradas por data_lead_recebido (mutável). produtividade = métricas filtradas por data do evento (imutável após fechamento).';
COMMENT ON COLUMN public.weekly_snapshots.status IS 'pending→computing→completed | failed. finalized = semana antiga trancada.';
COMMENT ON COLUMN public.weekly_snapshots.data_version IS 'Incrementado a cada reprocessamento do mesmo snapshot (especialmente cohort).';
COMMENT ON COLUMN public.weekly_snapshots.workspace_id IS 'Workspace ao qual o snapshot pertence. NULL = legado agregado multi-workspace (backfill pendente).';
COMMENT ON TABLE public.weekly_trafego IS 'Métricas semanais do módulo Tráfego. FK para weekly_snapshots.';
COMMENT ON COLUMN public.weekly_trafego.workspace_id IS 'Workspace ao qual o registro pertence. Propagado do snapshot.';
COMMENT ON TABLE public.weekly_vendas IS 'Métricas semanais do módulo Vendas (closers). FK para weekly_snapshots.';
COMMENT ON VIEW public.v_weekly_dashboard IS 'TABELA ÚNICA unificada de todos os módulos incluindo workspace_id. Use WHERE workspace_id = ... para isolamento.';
COMMENT ON TABLE public.weekly_metas IS 'Métricas semanais do módulo Metas (target vs realizado). FK para weekly_snapshots.';
COMMENT ON VIEW public.v_weekly_snapshots_status IS 'Visão geral de todos os snapshots incluindo workspace_id. Use WHERE workspace_id = ... para isolamento.';
COMMENT ON TABLE public.webhooks_ghl IS 'Armazena webhooks recebidos do GoHighLevel (GHL). Timestamps em UTC (timestamptz padrão Supabase).';
COMMENT ON VIEW public.vw_comparacao_datas_webhook_oportunidade IS 'Comparação entre datas originais dos webhooks e dados processados';
COMMENT ON TABLE public.weekly_cohort_audit IS 'Audit trail de mudanças em snapshots cohort. Permite explicar por que um número mudou.';
COMMENT ON COLUMN public.weekly_cohort_audit.reason IS 'Descrição legível da causa (ex: "Venda de eduardosampaio.mb@gmail.com - opp_id abc").';
COMMENT ON COLUMN public.weekly_cohort_audit.trigger_record_id IS 'ID do registro que causou a mudança (oportunidade, pagamento, etc.).';
COMMENT ON TABLE public.weekly_email_logs IS 'Histórico de envios de e-mails automáticos de relatórios semanais.';
COMMENT ON TABLE public.weekly_email_schedules IS 'Automações de envio de relatórios semanais por e-mail configuradas pelos usuários.';
COMMENT ON TABLE public.weekly_reprocess_queue IS 'Fila de reprocessamento. Quando uma venda nova afeta uma semana cohort antiga, a semana entra aqui.';
COMMENT ON COLUMN public.weekly_reprocess_queue.priority IS 'Maior número = maior prioridade. Semanas recentes devem ter prioridade maior.';
COMMENT ON COLUMN public.workspace_members.clara_habilitado IS 'Se true, o membro pode usar a Clara no dashboard. Gerenciado em Settings > Usuários > Sistema.';
COMMENT ON TABLE public.workspace_settings IS 'Configurações por workspace para cada sub-app, incluindo dia da reunião de criativos e critérios padrão.';
COMMENT ON CONSTRAINT uq_weekly_reprocess_queue ON public.weekly_reprocess_queue IS 'Unicidade da fila de reprocessamento por workspace, semana, tipo de relatório e motivo.';
COMMENT ON CONSTRAINT uq_weekly_snapshots_workspace_week_type ON public.weekly_snapshots IS 'Unicidade de snapshot por workspace, semana e tipo de relatório.';
COMMENT ON CONSTRAINT vendas_fechamento_oportunidade_id_unique ON public.vendas_fechamento IS 'Garante que cada oportunidade tenha apenas uma venda fechamento. Usado para UPSERT na extração de dados GHL.';
COMMENT ON TRIGGER tr_extrair_vendas_fechamento ON public.webhooks_ghl IS 'Trigger que executa extrair_vendas_fechamento_do_webhook após cada INSERT em webhooks_ghl.';
COMMENT ON TRIGGER tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento IS 'Dispara OpenClaw quando o link entra em vendas_fechamento e a oportunidade já está em "Assinada".';
COMMENT ON TRIGGER tr_zz_notify_openclaw_assinada ON public.webhooks_ghl IS 'Dispara OpenClaw quando chega webhook de stage "Assinada", buscando link/data no histórico se necessário.';
COMMENT ON TRIGGER trigger_update_oportunidade_from_webhook ON public.webhooks_ghl IS 'Atualiza oportunidade automaticamente quando um webhook é recebido, usando fallbacks.';

-- Outros ALTERs (RLS etc.)

ALTER SEQUENCE public.ghl_api_jobs_id_seq OWNED BY public.ghl_api_jobs.id;
ALTER SEQUENCE public.weekly_aquisicao_id_seq OWNED BY public.weekly_aquisicao.id;
ALTER SEQUENCE public.weekly_closer_id_seq OWNED BY public.weekly_closer.id;
ALTER SEQUENCE public.weekly_cohort_audit_id_seq OWNED BY public.weekly_cohort_audit.id;
ALTER SEQUENCE public.weekly_metas_id_seq OWNED BY public.weekly_metas.id;
ALTER SEQUENCE public.weekly_organico_id_seq OWNED BY public.weekly_organico.id;
ALTER SEQUENCE public.weekly_prevendas_id_seq OWNED BY public.weekly_prevendas.id;
ALTER SEQUENCE public.weekly_recuperacao_id_seq OWNED BY public.weekly_recuperacao.id;
ALTER SEQUENCE public.weekly_reprocess_queue_id_seq OWNED BY public.weekly_reprocess_queue.id;
ALTER SEQUENCE public.weekly_sdr_id_seq OWNED BY public.weekly_sdr.id;
ALTER SEQUENCE public.weekly_snapshots_id_seq OWNED BY public.weekly_snapshots.id;
ALTER SEQUENCE public.weekly_trafego_id_seq OWNED BY public.weekly_trafego.id;
ALTER SEQUENCE public.weekly_vendas_id_seq OWNED BY public.weekly_vendas.id;
ALTER TABLE ONLY public.ghl_api_jobs ALTER COLUMN id SET DEFAULT nextval('public.ghl_api_jobs_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_aquisicao ALTER COLUMN id SET DEFAULT nextval('public.weekly_aquisicao_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_closer ALTER COLUMN id SET DEFAULT nextval('public.weekly_closer_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_cohort_audit ALTER COLUMN id SET DEFAULT nextval('public.weekly_cohort_audit_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_metas ALTER COLUMN id SET DEFAULT nextval('public.weekly_metas_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_organico ALTER COLUMN id SET DEFAULT nextval('public.weekly_organico_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_prevendas ALTER COLUMN id SET DEFAULT nextval('public.weekly_prevendas_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_recuperacao ALTER COLUMN id SET DEFAULT nextval('public.weekly_recuperacao_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_reprocess_queue ALTER COLUMN id SET DEFAULT nextval('public.weekly_reprocess_queue_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_sdr ALTER COLUMN id SET DEFAULT nextval('public.weekly_sdr_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_snapshots ALTER COLUMN id SET DEFAULT nextval('public.weekly_snapshots_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_trafego ALTER COLUMN id SET DEFAULT nextval('public.weekly_trafego_id_seq'::regclass);
ALTER TABLE ONLY public.weekly_vendas ALTER COLUMN id SET DEFAULT nextval('public.weekly_vendas_id_seq'::regclass);
ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_doc_index_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."aplic-acelerador" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_feature_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_feature_user_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_user_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_opp_sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_test_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_test_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creative_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_user_lead_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discagem_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_campos_custom ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_campos_custom_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estado_uf_normalizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_api_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_conversations_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_custom_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_field_mapping_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_field_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_opp_reconcile_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_opp_reconcile_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_pipeline_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_stage_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maquina_de_conteudo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_backfill_controle ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_backfill_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_insights_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_permalinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_raw_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_region_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organic_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organic_investment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organic_investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prevendas_ai_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_process_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdr_ia_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stevo_whatsapp_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_mediums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_origins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_source_origin_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_sources_plain ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utm_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas_fechamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks_ghl ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_aquisicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_closer ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_cohort_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_email_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_organico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_prevendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_recuperacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_reprocess_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_sdr ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_trafego ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_pricing_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- Grants

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- ============================================================================
-- Seed de privilegios (GRANTs) para o AMBIENTE DE TESTE de isolamento.
-- Projeto alvo: SOMENTE o projeto de TESTE (hoje fgjbmdsucruvtpywyhhf).
-- NUNCA aplicar em producao.
-- ============================================================================
--
-- Por que existe:
--   O schema de teste e reproduzido a partir de um dump de producao gerado com
--   `--no-owner --no-privileges`, e NENHUMA migration do repo declara GRANTs
--   (verificado em 2026-07-09: 0 linhas "grant" em supabase/migrations).
--   Em producao esses GRANTs existem (criados pelo template do Supabase / fora
--   das migrations). Sem eles, o role `authenticated` recebe 42501 em qualquer
--   SELECT — mesmo sendo dono do dado.
--
-- Por que e seguro:
--   GRANT so permite que a query CHEGUE a tabela. A policy de RLS
--   (USING / WITH CHECK) continua decidindo linha a linha. Sem policy
--   permissiva, `authenticated` com GRANT ainda ve 0 linhas / nao consegue
--   escrever. Isto replica o que producao ja tem e NAO afrouxa RLS.
--
-- Como aplicar (psql apontando para o projeto de TESTE):
--   psql "$TEST_DB_URL" -v ON_ERROR_STOP=0 -f __tests__/fixtures/test-db-grants.sql
-- ============================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Recarrega o schema cache do PostgREST (projetos remotos).
NOTIFY pgrst, 'reload schema';
