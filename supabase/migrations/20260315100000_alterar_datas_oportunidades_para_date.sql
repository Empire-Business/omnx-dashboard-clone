-- ============================================================
-- Migration: Alterar colunas de datas de pipeline para tipo DATE
--
-- Motivação:
--   As datas de pipeline (conectado, fechado, tentativas etc.) vêm dos
--   webhooks do GHL como strings sem significado de hora (ex: "7/3/2026 08:40 PM").
--   Guardar como TIMESTAMPTZ adicionava complexidade desnecessária de timezone
--   nas queries e exibição do frontend.
--
--   Após esta migration, o banco guarda apenas a data (ex: 2026-03-07) e o
--   frontend lê diretamente como "DD/MM/YYYY" sem qualquer conversão.
--
-- O que NÃO muda:
--   - data_lead_recebido: fica TIMESTAMPTZ (vem da API GHL com ISO completo via sync-opp-dates)
--   - data_criacao_contato: fica TIMESTAMPTZ (campo de sistema)
--   - created_at, updated_at: ficam TIMESTAMPTZ (timestamps de sistema)
--   - contatos.date_created: fica TIMESTAMPTZ
--
-- Compatibilidade:
--   ALTER COLUMN ... TYPE DATE USING col::DATE é seguro pois:
--   - TIMESTAMPTZ → DATE trunca a parte da hora (exatamente o que queremos)
--   - NULL → NULL (sem perda)
--   - Dados existentes são preservados com a data correta
--
-- Nota: A view vw_qualidade_datas_oportunidades depende de colunas desta tabela.
--   Precisa ser recriada após o ALTER TABLE.
-- ============================================================

-- 1. Remover views dependentes temporariamente
DROP VIEW IF EXISTS vw_qualidade_datas_oportunidades;
DROP VIEW IF EXISTS vw_amostra_datas_oportunidades;

-- 2. Alterar tipos de coluna
ALTER TABLE oportunidades
  ALTER COLUMN data_tentativa_1            TYPE DATE USING data_tentativa_1::DATE,
  ALTER COLUMN data_tentativa_2            TYPE DATE USING data_tentativa_2::DATE,
  ALTER COLUMN data_tentativa_3            TYPE DATE USING data_tentativa_3::DATE,
  ALTER COLUMN data_tentativa_4            TYPE DATE USING data_tentativa_4::DATE,
  ALTER COLUMN data_tentativa_5            TYPE DATE USING data_tentativa_5::DATE,
  ALTER COLUMN data_tentativa_6            TYPE DATE USING data_tentativa_6::DATE,
  ALTER COLUMN data_tentativa_7            TYPE DATE USING data_tentativa_7::DATE,
  ALTER COLUMN data_tentativa_8            TYPE DATE USING data_tentativa_8::DATE,
  ALTER COLUMN data_conectado              TYPE DATE USING data_conectado::DATE,
  ALTER COLUMN data_no_show               TYPE DATE USING data_no_show::DATE,
  ALTER COLUMN data_qualificado           TYPE DATE USING data_qualificado::DATE,
  ALTER COLUMN data_perdido               TYPE DATE USING data_perdido::DATE,
  ALTER COLUMN data_agendamento_reuniao   TYPE DATE USING data_agendamento_reuniao::DATE,
  ALTER COLUMN data_pendencias_preenchimento TYPE DATE USING data_pendencias_preenchimento::DATE,
  ALTER COLUMN data_reuniao_agendada      TYPE DATE USING data_reuniao_agendada::DATE,
  ALTER COLUMN data_reuniao_realizada     TYPE DATE USING data_reuniao_realizada::DATE,
  ALTER COLUMN data_negociacao            TYPE DATE USING data_negociacao::DATE,
  ALTER COLUMN data_no_show_vendas        TYPE DATE USING data_no_show_vendas::DATE,
  ALTER COLUMN data_perdido_vendas        TYPE DATE USING data_perdido_vendas::DATE,
  ALTER COLUMN data_agendamento_vendas    TYPE DATE USING data_agendamento_vendas::DATE,
  ALTER COLUMN data_realizacao_vendas     TYPE DATE USING data_realizacao_vendas::DATE,
  ALTER COLUMN data_fechado               TYPE DATE USING data_fechado::DATE,
  ALTER COLUMN data_ultima_atividade      TYPE DATE USING data_ultima_atividade::DATE;

-- 3. Recriar as views (adaptadas para colunas DATE — data_lead_recebido
--    permanece TIMESTAMPTZ, as demais colunas referenciadas viram DATE)

-- View de amostra: seleciona diretamente as colunas DATE (sem date math nelas)
CREATE OR REPLACE VIEW vw_amostra_datas_oportunidades AS
SELECT
  id,
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
FROM oportunidades
WHERE data_lead_recebido IS NOT NULL
ORDER BY updated_at DESC
LIMIT 100;

-- View de qualidade: comparações em data_lead_recebido (TIMESTAMPTZ) inalteradas
CREATE OR REPLACE VIEW vw_qualidade_datas_oportunidades AS
SELECT
  count(*) AS total_oportunidades,
  count(data_lead_recebido) AS com_data_lead_recebido,
  count(data_qualificado) AS com_data_qualificado,
  count(data_agendamento_reuniao) AS com_data_agendamento_reuniao,
  count(data_conectado) AS com_data_conectado,
  count(data_fechado) AS com_data_fechado,
  count(*) FILTER (WHERE data_lead_recebido > (now() + '1 day'::interval)) AS datas_futuras,
  count(*) FILTER (WHERE data_lead_recebido < '2020-01-01 00:00:00+00'::timestamptz AND data_lead_recebido IS NOT NULL) AS datas_muito_antigas,
  count(*) FILTER (WHERE data_lead_recebido IS NOT NULL AND EXTRACT(day FROM data_lead_recebido) > 12) AS datas_com_dia_maior_12,
  max(updated_at) AS ultima_atualizacao
FROM oportunidades;
