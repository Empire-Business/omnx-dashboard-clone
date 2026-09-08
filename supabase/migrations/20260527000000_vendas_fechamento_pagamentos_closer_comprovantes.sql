-- Fase 1.1 — Fundação para vendas vindas do EmpireDesk
-- Adiciona modelo de pagamento detalhado, dados do closer, comprovantes e marca
-- de origem à vendas_fechamento; cria o bucket de storage para comprovantes.
-- Puramente aditivo e idempotente — não altera os registros históricos do GHL.

-- =====================================================================
-- 1. NOVAS COLUNAS EM vendas_fechamento
-- =====================================================================
ALTER TABLE public.vendas_fechamento
  ADD COLUMN IF NOT EXISTS pagamentos   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comprovantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closer_nome  TEXT,
  ADD COLUMN IF NOT EXISTS closer_email TEXT,
  ADD COLUMN IF NOT EXISTS origem       TEXT NOT NULL DEFAULT 'ghl';

COMMENT ON COLUMN public.vendas_fechamento.pagamentos IS
  'Lista detalhada de pagamentos vinda do formulario EmpireDesk: [{data,valor,forma,plataforma,sinal}]. Vazio ([]) para registros historicos do GHL.';
COMMENT ON COLUMN public.vendas_fechamento.comprovantes IS
  'Metadata dos comprovantes copiados para o bucket vendas-comprovantes: [{storage_path,nome_original,mime_type,tamanho_bytes}].';
COMMENT ON COLUMN public.vendas_fechamento.closer_nome IS
  'Nome do closer que fechou a venda (origem EmpireDesk).';
COMMENT ON COLUMN public.vendas_fechamento.closer_email IS
  'E-mail do closer que fechou a venda (origem EmpireDesk).';
COMMENT ON COLUMN public.vendas_fechamento.origem IS
  'Origem do registro: ghl (webhook/OpenClaw) ou empiredesk (formulario de vendas).';

-- =====================================================================
-- 2. BUCKET DE COMPROVANTES (privado)
-- =====================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('vendas-comprovantes', 'vendas-comprovantes', false)
ON CONFLICT (id) DO NOTHING;

-- Leitura: qualquer usuario autenticado do dashboard (exibicao via signed URL).
DROP POLICY IF EXISTS "vendas_comprovantes_authenticated_read" ON storage.objects;
CREATE POLICY "vendas_comprovantes_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'vendas-comprovantes');

-- Escrita: somente service_role (edge function da ponte). service_role bypassa RLS,
-- portanto nao e necessaria policy de INSERT/UPDATE para usuarios.
