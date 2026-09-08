-- Migration: Renomear colunas da tabela oportunidades
-- Data: 2026-02-27
-- Motivo: O prefixo "mql" e "sql" confunde IAs e desenvolvedores, pois não indica classificação do lead
-- Execute no Supabase migration diret

-- Pré-Venda: Remover prefixo "mql_"
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_lead_recebido TO data_lead_recebido;

ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_1 TO data_tentativa_1;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_2 TO data_tentativa_2;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_3 TO data_tentativa_3;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_4 TO data_tentativa_4;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_5 TO data_tentativa_5;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_6 TO data_tentativa_6;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_7 TO data_tentativa_7;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_contato_8 TO data_tentativa_8;

-- Outras colunas de pré-venda
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_conectado TO data_conectado;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_no_show TO data_no_show;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_perdido TO data_perdido;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_qualificado TO data_qualificado;
ALTER TABLE oportunidades 
RENAME COLUMN data_mql_reuniao_marcada TO data_agendamento_reuniao;

-- Vendas: Simplificar prefixo "sql_"
ALTER TABLE oportunidades 
RENAME COLUMN data_sql_no_show TO data_no_show_vendas;
ALTER TABLE oportunidades 
RENAME COLUMN data_sql_perdido TO data_perdido_vendas;
ALTER TABLE oportunidades 
RENAME COLUMN data_sql_reuniao_agendada TO data_agendamento_vendas;
ALTER TABLE oportunidades 
RENAME COLUMN data_sql_reuniao_realizada TO data_realizacao_vendas;
ALTER TABLE oportunidades 
RENAME COLUMN data_sql_negociacao TO data_negociacao;
ALTER TABLE oportunidades 
RENAME COLUMN data_sql_fechada TO data_fechado;

-- Comentários explicativos
COMMENT ON COLUMN oportunidades.data_lead_recebido IS 
'Data de criação da oportunidade no GHL. NÃO indica classificação Mql.
Para filtrar MQLs use: pipeline_name = ''Pré-Vendas MQL''';

COMMENT ON COLUMN oportunidades.data_tentativa_1 IS 
'Data da 1ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_2 IS 
'Data da 2ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_3 IS 
'Data da 3ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_4 IS 
'Data da 4ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_5 IS 
'Data da 5ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_6 IS 
'Data da 6ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_7 IS 
'Data da 7ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_tentativa_8 IS 
'Data da 8ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_conectado IS 
'Data em que conseguiu falar com o lead';

COMMENT ON COLUMN oportunidades.data_no_show IS 
'Data em que o lead não compareceu (pré-venda)';

COMMENT ON COLUMN oportunidades.data_perdido IS 
'Data em que o lead foi marcado como perdido (pré-venda)';

COMMENT ON COLUMN oportunidades.data_qualificado IS 
'Data em que o lead foi qualificado (virou SQL)';

COMMENT ON COLUMN oportunidades.data_agendamento_reuniao IS 
'Data em que a reunião foi agendada (momento do agendamento)';

COMMENT ON COLUMN oportunidades.data_no_show_vendas IS 
'Data de no show na fase de vendas';

COMMENT ON COLUMN oportunidades.data_perdido_vendas IS 
'Data de perdido na fase de vendas';

COMMENT ON COLUMN oportunidades.data_agendamento_vendas IS 
'Data em que reunião de vendas foi agendada';

COMMENT ON COLUMN oportunidades.data_realizacao_vendas IS 
'Data em que a reunião de vendas foi realizada';

COMMENT ON COLUMN oportunidades.data_negociacao IS 
'Data em que entrou em negociação';

COMMENT ON COLUMN oportunidades.data_fechado IS 
'Data em que a venda foi fechada';
