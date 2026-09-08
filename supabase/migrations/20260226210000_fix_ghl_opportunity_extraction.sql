-- ============================================================
-- Migration: Corrigir extração de dados do webhook GHL
-- Problema: Função usava chaves incorretas para acessar customData
-- Solução: Usar chaves reais do GHL (sem {{ opportunity.xxx }})
-- Data: 2026-02-26
-- ============================================================

-- Função auxiliar para extrair datas com fallback
CREATE OR REPLACE FUNCTION public.extract_date_from_customdata(
    p_customdata jsonb,
    p_key text
)
RETURNS timestamptz AS $$
DECLARE
    v_value text;
    v_result timestamptz;
BEGIN
    -- Tenta extrair o valor da chave
    v_value := NULLIF(TRIM(p_customdata->>p_key), '');
    -- Se encontrou valor, converte para date depois timestamptz
    IF v_value IS NOT NULL THEN
        BEGIN
            v_result := v_value::date::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            v_result := NULL;
        END;
    END IF;
    RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION public.extract_date_from_customdata(jsonb, text) IS 
'Extrai uma data do customData do GHL, retornando NULL se vazia ou inválida';

-- ============================================================
-- Criar função de extração corrigida
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_ghl_opportunity_webhook(
    p_payload jsonb
)
RETURNS TABLE(
    ghl_opportunity_id text,
    ghl_contact_id text,
    name text,
    status text,
    monetary_value numeric,
    pipeline_id text,
    pipeline_name text,
    pipeline_stage_id text,
    pipeline_stage_name text,
    opportunity_source text,
    owner_id text,
    owner_name text,
    owner_email text,
    date_created timestamptz,
    closed_date timestamptz,
    lost_reason text,
    custom_fields jsonb,
    -- Campos MQL
    op_dateadded timestamptz,
    date_mql_connected timestamptz,
    date_mql_lost timestamptz,
    date_no_show timestamptz,
    date_meeting timestamptz,
    date_meeting_completed timestamptz,
    mql_contato_1 text,
    mql_contato_2 text,
    mql_contato_3 text,
    mql_contato_4 text,
    mql_contato_5 text,
    mql_contato_6 text,
    mql_contato_7 text,
    mql_contato_8 text,
    -- Campos SQL
    date_sql_scheduled timestamptz,
    date_sql_completed timestamptz,
    -- Campos UTM
    override_utm_source text,
    -- Campos de venda
    op_valor_entrada numeric,
    op_num_parcelas integer,
    op_valor_parcela numeric,
    op_receita_total numeric
) AS $$
DECLARE
    v_customdata jsonb;
BEGIN
    -- Extrair customData do payload
    v_customdata := COALESCE(p_payload->'customData', '{}'::jsonb);
    
    RETURN QUERY SELECT
        -- Campos principais do payload (não customData)
        NULLIF(TRIM(p_payload->>'id'), '')::text as ghl_opportunity_id,
        NULLIF(TRIM(p_payload->>'contact_id'), '')::text as ghl_contact_id,
        NULLIF(TRIM(p_payload->>'name'), '')::text as name,
        NULLIF(TRIM(p_payload->>'status'), '')::text as status,
        NULLIF(TRIM(p_payload->>'monetary_value'), '')::numeric as monetary_value,
        NULLIF(TRIM(p_payload->>'pipeline_id'), '')::text as pipeline_id,
        NULLIF(TRIM(p_payload->>'pipeline_name'), '')::text as pipeline_name,
        NULLIF(TRIM(p_payload->>'pipeline_stage_id'), '')::text as pipeline_stage_id,
        NULLIF(TRIM(p_payload->>'pipeline_stage_name'), '')::text as pipeline_stage_name,
        
        -- Campos de customData - CHAVES CORRIGIDAS
        NULLIF(TRIM(v_customdata->>'Opportunity Source'), '')::text as opportunity_source,
        NULLIF(TRIM(p_payload->>'assigned_user_id'), '')::text as owner_id,
        NULLIF(TRIM(v_customdata->>'Owner (SDR ou SS)'), '')::text as owner_name,
        NULLIF(TRIM(v_customdata->>'E-mail Owner'), '')::text as owner_email,
        
        -- Data de criação
        CASE 
            WHEN NULLIF(TRIM(p_payload->>'date_created'), '') IS NOT NULL 
            THEN (NULLIF(TRIM(p_payload->>'date_created'), '')::text)::timestamptz
            ELSE NULL
        END as date_created,
        
        CASE 
            WHEN NULLIF(TRIM(p_payload->>'closed_date'), '') IS NOT NULL 
            THEN (NULLIF(TRIM(p_payload->>'closed_date'), '')::text)::timestamptz
            ELSE NULL
        END as closed_date,
        
        NULLIF(TRIM(v_customdata->>'Lost Reason'), '')::text as lost_reason,
        v_customdata as custom_fields,
        
        -- ============================================================
        -- CAMPOS MQL - CHAVES CORRIGIDAS
        -- ============================================================
        -- d_MQL-Leads Recebidos = data de criação da oportunidade
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Leads Recebidos') as op_dateadded,
        
        -- d_MQL-Conectado = data de conexão
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Conectado') as date_mql_connected,
        
        -- d_MQL-Perdido = data de perda MQL
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Perdido') as date_mql_lost,
        
        -- d_MQL-No Show = data no show (MQL ou SQL)
        COALESCE(
            public.extract_date_from_customdata(v_customdata, 'd_MQL-No Show'),
            public.extract_date_from_customdata(v_customdata, 'd_SQL-No Show')
        ) as date_no_show,
        
        -- d_MQL-Reunião Marcada = data da reunião
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Reunião Marcada') as date_meeting,
        
        -- Data da reunião realizada
        COALESCE(
            public.extract_date_from_customdata(v_customdata, 'Data da reunião realizada'),
            public.extract_date_from_customdata(v_customdata, 'd_SQL-Reunião Realizada')
        ) as date_meeting_completed,
        
        -- Contatos 1-8 (textos, não datas)
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato1'), '')::text as mql_contato_1,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato2'), '')::text as mql_contato_2,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato3'), '')::text as mql_contato_3,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato4'), '')::text as mql_contato_4,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato5'), '')::text as mql_contato_5,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato6'), '')::text as mql_contato_6,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato7'), '')::text as mql_contato_7,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato8'), '')::text as mql_contato_8,
        
        -- ============================================================
        -- CAMPOS SQL - CHAVES CORRIGIDAS
        -- ============================================================
        -- d_SQL-Reunião Agendada = data SQL agendada
        public.extract_date_from_customdata(v_customdata, 'd_SQL-Reunião Agendada') as date_sql_scheduled,
        
        -- d_SQL-Reunião Realizada = data SQL completada
        public.extract_date_from_customdata(v_customdata, 'd_SQL-Reunião Realizada') as date_sql_completed,
        
        -- ============================================================
        -- CAMPOS UTM - CHAVES CORRIGIDAS
        -- ============================================================
        NULLIF(TRIM(v_customdata->>'utm_source'), '')::text as override_utm_source,
        
        -- ============================================================
        -- CAMPOS DE VENDA - CHAVES CORRIGIDAS
        -- ============================================================
        NULLIF(TRIM(v_customdata->>'Op_Valor a ser pago de entrada'), '')::numeric as op_valor_entrada,
        NULLIF(TRIM(v_customdata->>'Op_Número de parcelas'), '')::integer as op_num_parcelas,
        NULLIF(TRIM(v_customdata->>'Op_Valor de cada parcela'), '')::numeric as op_valor_parcela,
        -- Receita total = entrada + (parcelas * valor parcela)
        CASE 
            WHEN NULLIF(TRIM(v_customdata->>'Op_Valor a ser pago de entrada'), '') IS NOT NULL
            THEN NULLIF(TRIM(v_customdata->>'Op_Valor a ser pago de entrada'), '')::numeric + 
                 (COALESCE(NULLIF(TRIM(v_customdata->>'Op_Número de parcelas'), '')::integer, 0) * 
                  COALESCE(NULLIF(TRIM(v_customdata->>'Op_Valor de cada parcela'), '')::numeric, 0))
            ELSE NULL
        END as op_receita_total;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION public.process_ghl_opportunity_webhook(jsonb) IS 
'Processa um payload de webhook do GHL para oportunidades, extraindo campos do customData com as chaves corretas';
