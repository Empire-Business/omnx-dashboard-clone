# Plano de Implementação: Corrigir Extração de Oportunidades

## 📋 Resumo Executivo

**Problema:** A função de extração de webhooks GHL usa chaves incorretas para acessar campos do `customData`, resultando em ~70% das colunas de oportunidades não populadas.

**Solução:** Corrigir o mapeamento de chaves e executar backfill nos dados existentes.

---

## 🔍 Root Cause Identificado

### O Erro

A função `extrair_dados_ghl()` busca campos usando o padrão **INCORRETO**:

```sql
-- INCORRETO (atual):
w.payload->'customData'->>'{{ opportunity.d_mqlleads_recebidos }}'

-- CORRETO (deveria ser):
w.payload->'customData'->>'d_MQL-Leads Recebidos'
```

### Evidência

Analisando um webhook real recebido em `webhook_events`:

```json
{
  "customData": {
    "d_MQL-Leads Recebidos": "",
    "d_MQL-Contato1": "",
    "Owner (SDR ou SS)": "Lucas Leonardo",
    "Lost Reason": "",
    "MQL-Conectado": ""
  }
}
```

**As chaves são texto simples, NÃO usam o formato `{{ opportunity.xxx }}`.**

---

## 📊 Mapeamento Completo

### Chaves customData → Colunas da Tabela

| Chave no GHL | Coluna DB | Tipo | Observação |
|--------------|-----------|------|------------|
| `d_MQL-Leads Recebidos` | op_dateAdded | timestamptz | Data de criação |
| `d_MQL-Contato1` | mql_contato_1 | text | 1º contato |
| `d_MQL-Contato2` | mql_contato_2 | text | 2º contato |
| `d_MQL-Contato3` | mql_contato_3 | text | 3º contato |
| `d_MQL-Contato4` | mql_contato_4 | text | 4º contato |
| `d_MQL-Contato5` | mql_contato_5 | text | 5º contato |
| `d_MQL-Contato6` | mql_contato_6 | text | 6º contato |
| `d_MQL-Contato7` | mql_contato_7 | text | 7º contato |
| `d_MQL-Contato8` | mql_contato_8 | text | 8º contato |
| `d_MQL-Conectado` | date_mql_connected | timestamptz | Data conexão |
| `d_MQL-No Show` | date_no_show | timestamptz | No show MQL |
| `d_MQL-Perdido` | date_mql_lost | timestamptz | Perdido MQL |
| `d_MQL-Reunião Marcada` | date_meeting | timestamptz | Reunião marcada |
| `d_SQL-Reunião Agendada` | date_sql_scheduled | timestamptz | SQL agendada |
| `d_SQL-Reunião Realizada` | date_sql_completed | timestamptz | SQL realizada |
| `d_SQL-No Show` | date_no_show | timestamptz | No show SQL (fallback) |
| `Data da reunião realizada` | date_meeting_completed | timestamptz | Reunião feita |
| `Lost Reason` | lost_reason | text | Motivo perda |
| `Opportunity Source` | opportunity_source | text | Fonte |
| `Owner (SDR ou SS)` | owner_name | text | Owner |
| `utm_source` | override_utm_source | text | UTM source |

---

## ✅ Plano de Execução

### FASE 1: Migration com Função Corrigida

**Arquivo:** `supabase/migrations/20260226210000_fix_ghl_opportunity_extraction.sql`

**Conteúdo:**
```sql
-- ============================================================
-- Migration: Corrigir extração de dados do webhook GHL
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
    v_value := NULLIF(TRIM(p_customdata->>p_key), '');
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

-- Função principal de processamento
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
    date_sql_scheduled timestamptz,
    date_sql_completed timestamptz,
    override_utm_source text
) AS $$
DECLARE
    v_customdata jsonb;
BEGIN
    v_customdata := COALESCE(p_payload->'customData', '{}'::jsonb);
    
    RETURN QUERY SELECT
        -- Campos principais
        NULLIF(TRIM(p_payload->>'id'), '')::text,
        NULLIF(TRIM(p_payload->>'contact_id'), '')::text,
        NULLIF(TRIM(p_payload->>'name'), '')::text,
        NULLIF(TRIM(p_payload->>'status'), '')::text,
        NULLIF(TRIM(p_payload->>'monetary_value'), '')::numeric,
        NULLIF(TRIM(p_payload->>'pipeline_id'), '')::text,
        NULLIF(TRIM(p_payload->>'pipeline_name'), '')::text,
        NULLIF(TRIM(p_payload->>'pipeline_stage_id'), '')::text,
        NULLIF(TRIM(p_payload->>'pipeline_stage_name'), '')::text,
        
        -- customData - CHAVES CORRIGIDAS
        NULLIF(TRIM(v_customdata->>'Opportunity Source'), '')::text,
        NULLIF(TRIM(p_payload->>'assigned_user_id'), '')::text,
        NULLIF(TRIM(v_customdata->>'Owner (SDR ou SS)'), '')::text,
        NULLIF(TRIM(v_customdata->>'E-mail Owner'), '')::text,
        
        CASE WHEN NULLIF(TRIM(p_payload->>'date_created'), '') IS NOT NULL 
            THEN (NULLIF(TRIM(p_payload->>'date_created'), '')::text)::timestamptz
            ELSE NULL END,
        CASE WHEN NULLIF(TRIM(p_payload->>'closed_date'), '') IS NOT NULL 
            THEN (NULLIF(TRIM(p_payload->>'closed_date'), '')::text)::timestamptz
            ELSE NULL END,
        
        NULLIF(TRIM(v_customdata->>'Lost Reason'), '')::text,
        v_customdata,
        
        -- Datas MQL - CHAVES CORRIGIDAS
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Leads Recebidos'),
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Conectado'),
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Perdido'),
        COALESCE(
            public.extract_date_from_customdata(v_customdata, 'd_MQL-No Show'),
            public.extract_date_from_customdata(v_customdata, 'd_SQL-No Show')
        ),
        public.extract_date_from_customdata(v_customdata, 'd_MQL-Reunião Marcada'),
        COALESCE(
            public.extract_date_from_customdata(v_customdata, 'Data da reunião realizada'),
            public.extract_date_from_customdata(v_customdata, 'd_SQL-Reunião Realizada')
        ),
        
        -- Contatos
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato1'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato2'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato3'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato4'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato5'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato6'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato7'), '')::text,
        NULLIF(TRIM(v_customdata->>'d_MQL-Contato8'), '')::text,
        
        -- Datas SQL
        public.extract_date_from_customdata(v_customdata, 'd_SQL-Reunião Agendada'),
        public.extract_date_from_customdata(v_customdata, 'd_SQL-Reunião Realizada'),
        
        -- UTM
        NULLIF(TRIM(v_customdata->>'utm_source'), '')::text;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

### FASE 2: Script de Backfill

**Arquivo:** `supabase/migrations/20260226210100_backfill_ghl_opportunities.sql`

**Conteúdo:**
```sql
-- ============================================================
-- Backfill: Atualizar oportunidades existentes com dados corretos
-- ============================================================

-- Atualizar todas as oportunidades usando webhooks armazenados
UPDATE gohighlevel_opportunities o
SET
    -- Campos de customData com chaves CORRETAS
    opportunity_source = NULLIF(TRIM(w.body->'customData'->>'Opportunity Source'), ''),
    owner_name = COALESCE(
        NULLIF(TRIM(w.body->'customData'->>'Owner (SDR ou SS)'), ''),
        o.owner_name
    ),
    lost_reason = NULLIF(TRIM(w.body->'customData'->>'Lost Reason'), ''),
    custom_fields = w.body->'customData',
    
    -- Datas MQL
    op_dateAdded = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_MQL-Leads Recebidos'),
        o.op_dateAdded
    ),
    date_mql_connected = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_MQL-Conectado'),
        o.date_mql_connected
    ),
    date_mql_lost = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_MQL-Perdido'),
        o.date_mql_lost
    ),
    date_no_show = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_MQL-No Show'),
        public.extract_date_from_customdata(w.body->'customData', 'd_SQL-No Show'),
        o.date_no_show
    ),
    date_meeting = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_MQL-Reunião Marcada'),
        o.date_meeting
    ),
    date_meeting_completed = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'Data da reunião realizada'),
        public.extract_date_from_customdata(w.body->'customData', 'd_SQL-Reunião Realizada'),
        o.date_meeting_completed
    ),
    
    -- Contatos
    mql_contato_1 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato1'), ''), o.mql_contato_1),
    mql_contato_2 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato2'), ''), o.mql_contato_2),
    mql_contato_3 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato3'), ''), o.mql_contato_3),
    mql_contato_4 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato4'), ''), o.mql_contato_4),
    mql_contato_5 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato5'), ''), o.mql_contato_5),
    mql_contato_6 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato6'), ''), o.mql_contato_6),
    mql_contato_7 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato7'), ''), o.mql_contato_7),
    mql_contato_8 = COALESCE(NULLIF(TRIM(w.body->'customData'->>'d_MQL-Contato8'), ''), o.mql_contato_8),
    
    -- Datas SQL
    date_sql_scheduled = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_SQL-Reunião Agendada'),
        o.date_sql_scheduled
    ),
    date_sql_completed = COALESCE(
        public.extract_date_from_customdata(w.body->'customData', 'd_SQL-Reunião Realizada'),
        o.date_sql_completed
    ),
    
    -- UTM
    override_utm_source = COALESCE(
        NULLIF(TRIM(w.body->'customData'->>'utm_source'), ''),
        o.override_utm_source
    ),
    
    updated_at = NOW()
FROM webhook_events w
WHERE w.body->>'id' = o.ghl_opportunity_id
  AND w.body->'customData' IS NOT NULL;

-- Verificar resultado
SELECT 
    COUNT(*) as total,
    COUNT(custom_fields) as has_custom_fields,
    COUNT(lost_reason) as has_lost_reason,
    COUNT(date_mql_connected) as has_date_mql_connected
FROM gohighlevel_opportunities;
```

---

### FASE 3: Atualizar Documentação

**Arquivo:** `docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md`

Adicionar seção com mapeamento correto das chaves customData.

---

### FASE 4: Query de Validação

**Arquivo:** `supabase/diagnosticos/validar-extracao-oportunidades.sql`

```sql
-- Validar população após correção
SELECT 
    COUNT(*) as total,
    COUNT(custom_fields) as has_custom_fields,
    COUNT(lost_reason) as has_lost_reason,
    COUNT(date_mql_connected) as has_date_mql_connected,
    COUNT(date_sql_scheduled) as has_date_sql_scheduled,
    COUNT(date_meeting) as has_date_meeting,
    ROUND(100.0 * COUNT(custom_fields) / COUNT(*), 2) as pct_custom_fields
FROM gohighlevel_opportunities;
```

---

## 📋 Checklist de Execução

- [ ] **FASE 1:** Criar migration com função corrigida
- [ ] **FASE 2:** Criar script de backfill
- [ ] **FASE 3:** Executar migration no Supabase
- [ ] **FASE 4:** Executar backfill
- [ ] **FASE 5:** Validar dados
- [ ] **FASE 6:** Atualizar documentação
- [ ] **FASE 7:** Monitorar próximos webhooks

---

## ⚠️ Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Chaves podem variar entre webhooks | Usar COALESCE com fallbacks |
| Dados históricos podem ter formato diferente | Backfill preserva valores existentes |
| Encoding de caracteres especiais | PostgreSQL lida bem com UTF-8 |

---

*Documento criado em: 2026-02-26*
*Autor: Arquiteto de Sistemas*
