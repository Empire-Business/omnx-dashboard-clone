-- RAG de documentação da Clara usando full-text search nativo do Postgres.
-- A tabela pode já existir de uma implementação anterior com embeddings.

-- Garante colunas necessárias na tabela existente
ALTER TABLE public.ai_doc_chunks
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fts tsvector;

-- Se a coluna embedding existir, removemos para simplificar e evitar dependência de modelo de embedding.
-- Mantida comentada por segurança; descomente se quiser manter embeddings legados.
-- ALTER TABLE public.ai_doc_chunks DROP COLUMN IF EXISTS embedding;

-- Atualiza fts para registros existentes
UPDATE public.ai_doc_chunks
SET fts = to_tsvector('portuguese', COALESCE(content, ''))
WHERE fts IS NULL;

-- Torna fts generated always stored
ALTER TABLE public.ai_doc_chunks
  ALTER COLUMN fts SET NOT NULL,
  ALTER COLUMN fts SET DEFAULT to_tsvector('portuguese', '');

-- Índice full-text
CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_fts ON public.ai_doc_chunks
  USING GIN (fts);

CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_doc_path ON public.ai_doc_chunks(doc_path);

-- Tabela de status de indexação
CREATE TABLE IF NOT EXISTS public.ai_doc_index_status (
  doc_path TEXT PRIMARY KEY,
  file_hash TEXT NOT NULL,
  last_indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'indexed'
);

-- RLS
ALTER TABLE public.ai_doc_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_doc_index_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ai_doc_chunks" ON public.ai_doc_chunks;
CREATE POLICY "Authenticated users can read ai_doc_chunks"
  ON public.ai_doc_chunks FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read ai_doc_index_status" ON public.ai_doc_index_status;
CREATE POLICY "Authenticated users can read ai_doc_index_status"
  ON public.ai_doc_index_status FOR SELECT TO authenticated
  USING (true);

-- Função de busca full-text
CREATE OR REPLACE FUNCTION public.buscar_documentos_clara(
  p_query TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  doc_path TEXT,
  chunk_index INTEGER,
  title TEXT,
  content TEXT,
  rank NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
AS $$
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
$$;

COMMENT ON FUNCTION public.buscar_documentos_clara(TEXT, INTEGER) IS
'Busca chunks de documentação interna usando full-text search em português. Retorna os trechos mais relevantes para a pergunta.';
