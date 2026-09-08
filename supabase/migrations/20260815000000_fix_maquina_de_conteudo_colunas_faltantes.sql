-- Fix: webhook-compras (Hotmart) faz upsert em 14 colunas que nunca existiram
-- em public.maquina_de_conteudo. Mesma classe de bug do sync-ad-permalinks (PR #35):
-- toda chamada de webhook falha com erro de coluna inexistente (PGRST204/42703) e
-- retorna 500 -- nenhuma compra Hotmart estava sendo persistida desde a introducao
-- da function (commit e0a43d3), pois o INSERT/UPSERT inteiro falha, nao so o campo
-- extra. Corrigido adicionando as colunas (dado de negocio real que o codigo ja
-- tentava capturar), em vez de remover os campos do payload.
ALTER TABLE public.maquina_de_conteudo
  ADD COLUMN IF NOT EXISTS hotmart_event_id     text,
  ADD COLUMN IF NOT EXISTS data_evento           timestamp with time zone,
  ADD COLUMN IF NOT EXISTS comprador_documento   text,
  ADD COLUMN IF NOT EXISTS comprador_pais        text,
  ADD COLUMN IF NOT EXISTS comprador_cidade      text,
  ADD COLUMN IF NOT EXISTS comprador_cep         text,
  ADD COLUMN IF NOT EXISTS produto_ucode         text,
  ADD COLUMN IF NOT EXISTS valor_total           numeric(10,2),
  ADD COLUMN IF NOT EXISTS comissao_produtor     numeric(10,2),
  ADD COLUMN IF NOT EXISTS comissao_marketplace  numeric(10,2),
  ADD COLUMN IF NOT EXISTS afiliado_nome         text,
  ADD COLUMN IF NOT EXISTS afiliado_codigo       text,
  ADD COLUMN IF NOT EXISTS pais_compra           text,
  ADD COLUMN IF NOT EXISTS modelo_negocio        text;
