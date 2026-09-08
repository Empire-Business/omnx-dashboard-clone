-- Migration: Re-semear o template "Empire Default" (ghl_field_mapping_templates)
--
-- CONTEXTO
--   Achado da auditoria do sistema de mapeamento de campos GHL (2026-07-12,
--   ver docs/GHL-MAPEAMENTO-CAMPOS-AUDITORIA.md): a tabela
--   ghl_field_mapping_templates está VAZIA no banco de teste, apesar das
--   migrations 20260707000000 e 20260708000000 conterem os INSERTs de seed.
--
--   Causa raiz confirmada: 20260218000000_baseline_public_schema.sql (dump
--   consolidado de ESTRUTURA) já contém `CREATE TABLE
--   ghl_field_mapping_templates`, então quando o banco de teste foi montado a
--   partir do baseline, essa tabela já existia — e as migrations 20260707/08,
--   que só têm DDL condicional (CREATE TABLE IF NOT EXISTS, sem efeito
--   nesse caso) + os INSERTs de seed, nunca chegaram a rodar de fato (aparecem
--   como "não aplicadas" em `supabase migration list`). O baseline capturou a
--   ESTRUTURA da tabela mas não os DADOS de seed. Mesma classe de problema já
--   documentada em docs/BASELINE-REPRODUCIBILIDADE.md.
--
--   Esta migration reaplica EXATAMENTE os mesmos INSERTs (copiados das
--   migrations originais, sem alteração de conteúdo) — os campos são os
--   nomes REAIS da conta GHL do dono, documentados a partir de
--   docs/Document_GHL.md e docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md. É o caso
--   de referência real pedido: "semear com os dados do dono usando a
--   documentação que já está no repositório".
--
-- ⚠️ APLICAR APENAS NO BANCO DE TESTE (fgjbmdsucruvtpywyhhf).

-- ============================================================================
-- Bloco 1 — de 20260707000000_create_ghl_mapping_foundation.sql
-- ============================================================================
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    -- Opportunity date fields
    ('Empire Default', 'data_tentativa_1', '{{opportunity.mqlcontato1}}', 'date', '["{{opportunity.mqlcontato1}}","{{opportunity.d_mqlcontato1}}"]', false),
    ('Empire Default', 'data_tentativa_2', '{{opportunity.mqlcontato2}}', 'date', '["{{opportunity.mqlcontato2}}","{{opportunity.d_mqlcontato2}}"]', false),
    ('Empire Default', 'data_tentativa_3', '{{opportunity.mqlcontato3}}', 'date', '["{{opportunity.mqlcontato3}}","{{opportunity.d_mqlcontato3}}"]', false),
    ('Empire Default', 'data_tentativa_4', '{{opportunity.mqlcontato4}}', 'date', '["{{opportunity.mqlcontato4}}","{{opportunity.d_mqlcontato4}}"]', false),
    ('Empire Default', 'data_tentativa_5', '{{opportunity.mqlcontato5}}', 'date', '["{{opportunity.mqlcontato5}}","{{opportunity.d_mqlcontato5}}"]', false),
    ('Empire Default', 'data_tentativa_6', '{{opportunity.mqlcontato6}}', 'date', '["{{opportunity.mqlcontato6}}","{{opportunity.d_mqlcontato6}}"]', false),
    ('Empire Default', 'data_tentativa_7', '{{opportunity.mqlcontato7}}', 'date', '["{{opportunity.mqlcontato7}}","{{opportunity.d_mqlcontato7}}"]', false),
    ('Empire Default', 'data_tentativa_8', '{{opportunity.mqlcontato8}}', 'date', '["{{opportunity.mqlcontato8}}","{{opportunity.d_mqlcontato8}}"]', false),
    ('Empire Default', 'data_no_show', '{{opportunity.mqlno_show}}', 'date', '["{{opportunity.mqlno_show}}","{{opportunity.sqlno_show}}","{{opportunity.d_mqlno_show}}","{{opportunity.d_sqlno_show}}"]', false),
    ('Empire Default', 'data_conectado', '{{opportunity.mqlconectado}}', 'date', '["{{opportunity.mqlconectado}}","{{opportunity.d_mqlconectado}}"]', false),
    ('Empire Default', 'data_perdido', '{{opportunity.mqlperdido}}', 'date', '["{{opportunity.mqlperdido}}","{{opportunity.d_mqlperdido}}"]', false),
    ('Empire Default', 'data_qualificado', '{{opportunity.mqlqualificado}}', 'date', '["{{opportunity.mqlqualificado}}","{{opportunity.d_mqlqualificado}}"]', false),
    ('Empire Default', 'data_agendamento_reuniao', '{{opportunity.mqlreunio_marcada}}', 'date', '["{{opportunity.mqlreunio_marcada}}","{{opportunity.sqlreunio_agendada}}","{{opportunity.d_mqlreunio_marcada}}"]', false),
    ('Empire Default', 'data_pendencias_preenchimento', '{{opportunity.sqlpendencias_preenchimento}}', 'date', '["{{opportunity.sqlpendencias_preenchimento}}","{{opportunity.d__sqlpendencias_preenchimento}}"]', false),
    ('Empire Default', 'data_no_show_vendas', '{{opportunity.sqlno_show}}', 'date', '["{{opportunity.sqlno_show}}","{{opportunity.d_sqlno_show}}"]', false),
    ('Empire Default', 'data_perdido_vendas', '{{opportunity.sqlperdida}}', 'date', '["{{opportunity.sqlperdida}}","{{opportunity.d_sqlperdida}}"]', false),
    ('Empire Default', 'data_agendamento_vendas', '{{opportunity.sqlreunio_agendada}}', 'date', '["{{opportunity.sqlreunio_agendada}}","{{opportunity.d_sqlreunio_agendada}}"]', false),
    ('Empire Default', 'data_realizacao_vendas', '{{opportunity.sqlreunio_realizada}}', 'date', '["{{opportunity.sqlreunio_realizada}}","{{opportunity.d_sqlreunio_realizada}}"]', false),
    ('Empire Default', 'data_negociacao', '{{opportunity.sqlnegociao}}', 'date', '["{{opportunity.sqlnegociao}}","{{opportunity.d_sqlnegociao}}"]', false),
    ('Empire Default', 'data_fechado', '{{opportunity.sqlfechada}}', 'date', '["{{opportunity.sqlfechada}}","{{opportunity.d_sqlfechada}}"]', false),
    ('Empire Default', 'data_reuniao_agendada', '{{opportunity.data_da_reunio}}', 'date', '["{{opportunity.data_da_reunio}}","{{opportunity.d_data_da_reunio}}"]', false),
    ('Empire Default', 'data_reuniao_realizada', '{{opportunity.reuniao_realizada}}', 'date', '["{{opportunity.reuniao_realizada}}","{{opportunity.data_da_reunio_realizada}}","{{opportunity.d_reuniao_realizada}}"]', false),
    ('Empire Default', 'data_auto_agendamento', '{{opportunity.mqlauto_agendamento}}', 'date', '["{{opportunity.mqlauto_agendamento}}"]', false),

    -- Opportunity text / metadata fields
    ('Empire Default', 'vendedor_closer', '{{opportunity.assignedToUsersName}}', 'opportunity_field', '["{{opportunity.assignedToUsersName}}"]', false),
    ('Empire Default', 'lost_reason', '{{opportunity.lost_reason}}', 'opportunity_field', '["{{opportunity.lost_reason}}"]', false),
    ('Empire Default', 'resumo_ia', '{{opportunity.resumo_ia}}', 'opportunity_field', '["{{opportunity.resumo_ia}}"]', false),
    ('Empire Default', 'percepcao_closer', '{{opportunity.percepo_do_closer}}', 'opportunity_field', '["{{opportunity.percepo_do_closer}}"]', false),
    ('Empire Default', 'data_ultima_atividade', '{{opportunity.ltima_atividade}}', 'date', '["{{opportunity.ltima_atividade}}"]', false),
    ('Empire Default', 'opportunity_source', '{{opportunity.source}}', 'opportunity_field', '["{{opportunity.source}}"]', false),

    -- Contact fields
    ('Empire Default', 'utm_source', 'utm_source', 'contact_field', '["utm_source"]', false),
    ('Empire Default', 'utm_medium', 'utm_medium', 'contact_field', '["utm_medium"]', false),
    ('Empire Default', 'utm_campaign', 'utm_campaign', 'contact_field', '["utm_campaign"]', false),
    ('Empire Default', 'utm_term', 'utm_term', 'contact_field', '["utm_term"]', false),
    ('Empire Default', 'utm_content', 'utm_content', 'contact_field', '["utm_content"]', false),
    ('Empire Default', 'tt_source', 'tt_source', 'contact_field', '["tt_source"]', false),
    ('Empire Default', 'tt_medium', 'tt_medium', 'contact_field', '["tt_medium"]', false),
    ('Empire Default', 'tt_campaign', 'tt_campaign', 'contact_field', '["tt_campaign"]', false),
    ('Empire Default', 'tt_term', 'tt_term', 'contact_field', '["tt_term"]', false),
    ('Empire Default', 'tt_content', 'tt_content', 'contact_field', '["tt_content"]', false)
ON CONFLICT (name, logical_name) DO NOTHING;

-- ============================================================================
-- Bloco 2 — de 20260708000000_update_empire_default_template_full.sql
-- ============================================================================

-- Contato: identificacao e dados pessoais
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    ('Empire Default', 'full_name', 'full_name', 'contact_field', '["full_name"]', false),
    ('Empire Default', 'email', 'email', 'contact_field', '["email"]', false),
    ('Empire Default', 'phone', 'phone', 'contact_field', '["phone"]', false),
    ('Empire Default', 'first_name', 'first_name', 'contact_field', '["first_name"]', false),
    ('Empire Default', 'last_name', 'last_name', 'contact_field', '["last_name"]', false)
ON CONFLICT (name, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

-- Contato: atribuicao de trafego (UTM + IP/URL/fbclid)
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    ('Empire Default', 'ip', 'lastAttributionSource.ip', 'contact_field', '["lastAttributionSource.ip","attributionSource.ip"]', false),
    ('Empire Default', 'url', 'lastAttributionSource.url', 'contact_field', '["lastAttributionSource.url","attributionSource.url"]', false),
    ('Empire Default', 'fbclid', 'lastAttributionSource.fbclid', 'contact_field', '["lastAttributionSource.fbclid","attributionSource.fbclid"]', false),
    ('Empire Default', 'utm_source', 'utm_source', 'contact_field', '["utm_source","lastAttributionSource.utmSource"]', false),
    ('Empire Default', 'utm_medium', 'utm_medium', 'contact_field', '["utm_medium","lastAttributionSource.utmMedium"]', false),
    ('Empire Default', 'utm_campaign', 'utm_campaign', 'contact_field', '["utm_campaign","lastAttributionSource.campaign"]', false),
    ('Empire Default', 'utm_term', 'utm_term', 'contact_field', '["utm_term","lastAttributionSource.utmTerm"]', false),
    ('Empire Default', 'utm_content', 'utm_content', 'contact_field', '["utm_content","lastAttributionSource.utmContent"]', false),
    ('Empire Default', 'tt_source', 'tt_source', 'contact_field', '["tt_source"]', false),
    ('Empire Default', 'tt_medium', 'tt_medium', 'contact_field', '["tt_medium"]', false),
    ('Empire Default', 'tt_campaign', 'tt_campaign', 'contact_field', '["tt_campaign"]', false),
    ('Empire Default', 'tt_term', 'tt_term', 'contact_field', '["tt_term"]', false),
    ('Empire Default', 'tt_content', 'tt_content', 'contact_field', '["tt_content"]', false)
ON CONFLICT (name, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

-- Contato: metadados GHL + pipeline + owner
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    ('Empire Default', 'country', 'country', 'contact_field', '["country"]', false),
    ('Empire Default', 'date_created', 'date_created', 'contact_field', '["date_created"]', false),
    ('Empire Default', 'contact_type', 'contact_type', 'contact_field', '["contact_type"]', false),
    ('Empire Default', 'contact_source', 'contact_source', 'contact_field', '["contact_source"]', false),
    ('Empire Default', 'pipeline_id_contato', 'pipeline_id', 'contact_field', '["pipeline_id"]', false),
    ('Empire Default', 'pipeline_name_contato', 'pipeline_name', 'contact_field', '["pipeline_name"]', false),
    ('Empire Default', 'owner_id', 'Owner ID', 'contact_field', '["Owner ID"]', false),
    ('Empire Default', 'owner_name', 'owner', 'contact_field', '["owner"]', false),
    ('Empire Default', 'owner_email', 'E-mail Owner', 'contact_field', '["E-mail Owner"]', false)
ON CONFLICT (name, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

-- Oportunidade: identificacao e metadados
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    ('Empire Default', 'opportunity_id', 'id', 'opportunity_field', '["id"]', true),
    ('Empire Default', 'opportunity_name', 'opportunity_name', 'opportunity_field', '["opportunity_name"]', false),
    ('Empire Default', 'lead_value', 'lead_value', 'opportunity_field', '["lead_value"]', false),
    ('Empire Default', 'pipeline_id_opp', 'pipeline_id', 'opportunity_field', '["pipeline_id"]', true),
    ('Empire Default', 'pipeline_name_opp', 'pipeline_name', 'opportunity_field', '["pipeline_name"]', false),
    ('Empire Default', 'pipeline_stage_id', 'pipleline_stage', 'opportunity_field', '["pipleline_stage"]', false),
    ('Empire Default', 'status', 'status', 'opportunity_field', '["status"]', false)
ON CONFLICT (name, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

-- Oportunidade: campos customizados de texto
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    ('Empire Default', 'opportunity_source', '{{opportunity.source}}', 'opportunity_field', '["{{opportunity.source}}"]', false),
    ('Empire Default', 'vendedor_closer', '{{opportunity.assignedToUsersName}}', 'opportunity_field', '["{{opportunity.assignedToUsersName}}"]', false),
    ('Empire Default', 'lost_reason', '{{opportunity.lost_reason}}', 'opportunity_field', '["{{opportunity.lost_reason}}"]', false),
    ('Empire Default', 'resumo_ia', '{{opportunity.resumo_ia}}', 'opportunity_field', '["{{opportunity.resumo_ia}}"]', false),
    ('Empire Default', 'percepcao_closer', '{{opportunity.percepo_do_closer}}', 'opportunity_field', '["{{opportunity.percepo_do_closer}}"]', false)
ON CONFLICT (name, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

-- Oportunidade: datas (variacoes na ordem certa para equivalencia com v1)
INSERT INTO ghl_field_mapping_templates
    (name, logical_name, ghl_field_key, field_type, variations, is_required)
VALUES
    ('Empire Default', 'data_tentativa_1', '{{opportunity.mqlcontato1}}', 'date', '["{{opportunity.mqlcontato1}}","{{opportunity.d_mqlcontato1}}"]', false),
    ('Empire Default', 'data_tentativa_2', '{{opportunity.mqlcontato2}}', 'date', '["{{opportunity.mqlcontato2}}","{{opportunity.d_mqlcontato2}}"]', false),
    ('Empire Default', 'data_tentativa_3', '{{opportunity.mqlcontato3}}', 'date', '["{{opportunity.mqlcontato3}}","{{opportunity.d_mqlcontato3}}"]', false),
    ('Empire Default', 'data_tentativa_4', '{{opportunity.mqlcontato4}}', 'date', '["{{opportunity.mqlcontato4}}","{{opportunity.d_mqlcontato4}}"]', false),
    ('Empire Default', 'data_tentativa_5', '{{opportunity.mqlcontato5}}', 'date', '["{{opportunity.mqlcontato5}}","{{opportunity.d_mqlcontato5}}"]', false),
    ('Empire Default', 'data_tentativa_6', '{{opportunity.mqlcontato6}}', 'date', '["{{opportunity.mqlcontato6}}","{{opportunity.d_mqlcontato6}}"]', false),
    ('Empire Default', 'data_tentativa_7', '{{opportunity.mqlcontato7}}', 'date', '["{{opportunity.mqlcontato7}}","{{opportunity.d_mqlcontato7}}"]', false),
    ('Empire Default', 'data_tentativa_8', '{{opportunity.mqlcontato8}}', 'date', '["{{opportunity.mqlcontato8}}","{{opportunity.d_mqlcontato8}}"]', false),
    ('Empire Default', 'data_no_show', '{{opportunity.mqlno_show}}', 'date', '["{{opportunity.mqlno_show}}","{{opportunity.sqlno_show}}","{{opportunity.d_mqlno_show}}","{{opportunity.d_sqlno_show}}"]', false),
    ('Empire Default', 'data_conectado', '{{opportunity.mqlconectado}}', 'date', '["{{opportunity.mqlconectado}}","{{opportunity.d_mqlconectado}}"]', false),
    ('Empire Default', 'data_perdido', '{{opportunity.mqlperdido}}', 'date', '["{{opportunity.mqlperdido}}","{{opportunity.d_mqlperdido}}"]', false),
    ('Empire Default', 'data_qualificado', '{{opportunity.mqlqualificado}}', 'date', '["{{opportunity.mqlqualificado}}","{{opportunity.d_mqlqualificado}}"]', false),
    ('Empire Default', 'data_agendamento_reuniao', '{{opportunity.mqlreunio_marcada}}', 'date', '["{{opportunity.mqlreunio_marcada}}","{{opportunity.sqlreunio_agendada}}","{{opportunity.d_mqlreunio_marcada}}"]', false),
    ('Empire Default', 'data_pendencias_preenchimento', '{{opportunity.sqlpendencias_preenchimento}}', 'date', '["{{opportunity.sqlpendencias_preenchimento}}","{{opportunity.d__sqlpendencias_preenchimento}}"]', false),
    ('Empire Default', 'data_no_show_vendas', '{{opportunity.sqlno_show}}', 'date', '["{{opportunity.sqlno_show}}","{{opportunity.d_sqlno_show}}"]', false),
    ('Empire Default', 'data_perdido_vendas', '{{opportunity.sqlperdida}}', 'date', '["{{opportunity.sqlperdida}}","{{opportunity.d_sqlperdida}}"]', false),
    ('Empire Default', 'data_agendamento_vendas', '{{opportunity.sqlreunio_agendada}}', 'date', '["{{opportunity.sqlreunio_agendada}}","{{opportunity.d_sqlreunio_agendada}}"]', false),
    -- data_realizacao_vendas: v1 tenta primeiro data_da_reunio_realizada, depois sqlreunio_realizada.
    ('Empire Default', 'data_realizacao_vendas', '{{opportunity.data_da_reunio_realizada}}', 'date', '["{{opportunity.data_da_reunio_realizada}}","{{opportunity.sqlreunio_realizada}}","{{opportunity.d_sqlreunio_realizada}}"]', false),
    ('Empire Default', 'data_negociacao', '{{opportunity.sqlnegociao}}', 'date', '["{{opportunity.sqlnegociao}}","{{opportunity.d_sqlnegociao}}"]', false),
    ('Empire Default', 'data_fechado', '{{opportunity.sqlfechada}}', 'date', '["{{opportunity.sqlfechada}}","{{opportunity.d_sqlfechada}}"]', false),
    ('Empire Default', 'data_reuniao_agendada', '{{opportunity.data_da_reunio}}', 'date', '["{{opportunity.data_da_reunio}}","{{opportunity.d_data_da_reunio}}"]', false),
    ('Empire Default', 'data_reuniao_realizada', '{{opportunity.reuniao_realizada}}', 'date', '["{{opportunity.reuniao_realizada}}","{{opportunity.data_da_reunio_realizada}}","{{opportunity.d_reuniao_realizada}}"]', false),
    ('Empire Default', 'data_auto_agendamento', '{{opportunity.mqlauto_agendamento}}', 'date', '["{{opportunity.mqlauto_agendamento}}"]', false),
    ('Empire Default', 'data_ultima_atividade', '{{opportunity.ltima_atividade}}', 'date', '["{{opportunity.ltima_atividade}}"]', false)
ON CONFLICT (name, logical_name) DO UPDATE SET
    ghl_field_key = EXCLUDED.ghl_field_key,
    field_type    = EXCLUDED.field_type,
    variations    = EXCLUDED.variations,
    is_required   = EXCLUDED.is_required;

COMMENT ON TABLE ghl_field_mapping_templates IS
'Templates globais de mapeamento GHL. Re-semeado em 2026-07-12 (banco de teste) — ver docs/GHL-MAPEAMENTO-CAMPOS-AUDITORIA.md.';
