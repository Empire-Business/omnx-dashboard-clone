-- ============================================================================
-- BASELINE RE-ENTRANTE: contatos / oportunidades (+ dependências)
-- Gerado por scripts/build-baseline-contatos-oportunidades.sh
-- Origem: DDL extraído do banco de teste (cópia fiel do produção).
-- Objetivo (Fase 0.7): setup-do-zero reproduzível pelas migrations.
-- Idempotente (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS / guard de constraint).
-- Ordem: tabelas -> constraints -> funções -> índices -> gatilhos -> policies -> comentários -> grants.
-- NÃO aplicar em produção fora de docs/PIPELINE-TESTE-STAGING-PRODUCAO.md.
-- ============================================================================

-- Tabelas

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

-- Constraints

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_ghl_id_key') THEN ALTER TABLE ONLY public.contatos ADD CONSTRAINT contatos_ghl_id_key UNIQUE (ghl_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_pkey') THEN ALTER TABLE ONLY public.contatos ADD CONSTRAINT contatos_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_ghl_opportunity_id_key') THEN ALTER TABLE ONLY public.oportunidades ADD CONSTRAINT oportunidades_ghl_opportunity_id_key UNIQUE (ghl_opportunity_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_pkey') THEN ALTER TABLE ONLY public.oportunidades ADD CONSTRAINT oportunidades_pkey PRIMARY KEY (id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contatos_workspace_id_fkey') THEN ALTER TABLE ONLY public.contatos ADD CONSTRAINT contatos_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_contato_id_fkey') THEN ALTER TABLE ONLY public.oportunidades ADD CONSTRAINT oportunidades_contato_id_fkey FOREIGN KEY (contato_id) REFERENCES public.contatos(id) ON DELETE CASCADE; END IF; END $$;

-- Funções


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

CREATE OR REPLACE FUNCTION public.get_contact_workspace_id(p_contato_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT workspace_id FROM public.contatos WHERE id = p_contato_id;
$function$
;

-- Índices

CREATE INDEX IF NOT EXISTS idx_contatos_email ON public.contatos USING btree (email);
CREATE INDEX IF NOT EXISTS idx_contatos_ghl_id ON public.contatos USING btree (ghl_id);
CREATE INDEX IF NOT EXISTS idx_contatos_nome ON public.contatos USING btree (nome);
CREATE INDEX IF NOT EXISTS idx_contatos_workspace_id ON public.contatos USING btree (workspace_id);
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

-- Gatilhos

DROP TRIGGER IF EXISTS "tr_fix_date_created_tz" ON public.contatos;
CREATE TRIGGER tr_fix_date_created_tz BEFORE INSERT ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.fix_contact_date_created_tz();;
DROP TRIGGER IF EXISTS "tr_relink_comunicacoes_on_contato_change" ON public.contatos;
CREATE TRIGGER tr_relink_comunicacoes_on_contato_change AFTER INSERT OR UPDATE OF email, telefone ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.relink_comunicacoes_for_contato();;
DROP TRIGGER IF EXISTS "tr_sync_opp_dates_on_insert" ON public.oportunidades;
CREATE TRIGGER tr_sync_opp_dates_on_insert AFTER INSERT ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_opp_dates();;
DROP TRIGGER IF EXISTS "trg_attribution_on_contact" ON public.contatos;
CREATE TRIGGER trg_attribution_on_contact AFTER INSERT OR UPDATE OF tags, contact_source, utm_source, utm_campaign, utm_medium, utm_content, utm_term, attribution_skip ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.trg_fn_enqueue_attribution_on_contact();;
DROP TRIGGER IF EXISTS "trg_reset_sdr_name_on_owner_change" ON public.contatos;
CREATE TRIGGER trg_reset_sdr_name_on_owner_change AFTER UPDATE OF owner_name ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.reset_sdr_name_on_owner_change();;
DROP TRIGGER IF EXISTS "update_contatos_updated_at" ON public.contatos;
CREATE TRIGGER update_contatos_updated_at BEFORE UPDATE ON public.contatos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;
DROP TRIGGER IF EXISTS "update_oportunidades_updated_at" ON public.oportunidades;
CREATE TRIGGER update_oportunidades_updated_at BEFORE UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();;

-- Policies

DROP POLICY IF EXISTS "admins_delete_contatos" ON public.contatos;
CREATE POLICY admins_delete_contatos ON public.contatos FOR DELETE USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true) AND (wm.role = ANY (ARRAY['admin'::text, 'owner'::text, 'admin_master'::text]))))));;
DROP POLICY IF EXISTS "service_role_all_contatos" ON public.contatos;
CREATE POLICY service_role_all_contatos ON public.contatos TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_all_oportunidades" ON public.oportunidades;
CREATE POLICY service_role_all_oportunidades ON public.oportunidades TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_contatos" ON public.contatos;
CREATE POLICY service_role_full_contatos ON public.contatos TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "service_role_full_oportunidades" ON public.oportunidades;
CREATE POLICY service_role_full_oportunidades ON public.oportunidades TO service_role USING (true) WITH CHECK (true);;
DROP POLICY IF EXISTS "workspace_admins_delete_contatos" ON public.contatos;
CREATE POLICY workspace_admins_delete_contatos ON public.contatos FOR DELETE TO authenticated USING (public.is_workspace_admin(workspace_id));;
DROP POLICY IF EXISTS "workspace_admins_delete_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_admins_delete_oportunidades ON public.oportunidades FOR DELETE TO authenticated USING (public.is_workspace_admin(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_insert_contatos" ON public.contatos;
CREATE POLICY workspace_members_insert_contatos ON public.contatos FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_insert_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_insert_oportunidades ON public.oportunidades FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_read_contatos" ON public.contatos;
CREATE POLICY workspace_members_read_contatos ON public.contatos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_read_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_read_oportunidades ON public.oportunidades FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1 FROM public.workspace_members wm WHERE ((wm.user_id = ( SELECT auth.uid() AS uid)) AND (wm.is_active = true)))));;
DROP POLICY IF EXISTS "workspace_members_select_contatos" ON public.contatos;
CREATE POLICY workspace_members_select_contatos ON public.contatos FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_select_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_select_oportunidades ON public.oportunidades FOR SELECT TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;
DROP POLICY IF EXISTS "workspace_members_update_contatos" ON public.contatos;
CREATE POLICY workspace_members_update_contatos ON public.contatos FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id)) WITH CHECK (public.is_workspace_member(workspace_id));;
DROP POLICY IF EXISTS "workspace_members_update_oportunidades" ON public.oportunidades;
CREATE POLICY workspace_members_update_oportunidades ON public.oportunidades FOR UPDATE TO authenticated USING (public.is_workspace_member(public.get_contact_workspace_id(contato_id))) WITH CHECK (public.is_workspace_member(public.get_contact_workspace_id(contato_id)));;

-- Comentários

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

-- Grants

GRANT ALL ON public.contatos TO service_role;
GRANT ALL ON public.oportunidades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oportunidades TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contact_workspace_id(uuid) TO authenticated;
