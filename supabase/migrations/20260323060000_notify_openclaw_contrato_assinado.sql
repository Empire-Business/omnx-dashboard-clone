-- Migration: Trigger para notificar OpenClaw quando contrato for assinado
--
-- CONTEXTO (2026-03-23):
-- Quando o campo op_link_do_contrato_assinado em vendas_fechamento recebe um valor
-- pela primeira vez (transição NULL → preenchido), enviamos um POST para o OpenClaw
-- com todos os dados financeiros do contrato.
--
-- REGRA CRÍTICA DE IDEMPOTÊNCIA:
-- - UPDATE: só dispara quando OLD.op_link_do_contrato_assinado IS NULL
--           AND NEW.op_link_do_contrato_assinado IS NOT NULL
--   → Se o link já existia e apenas mudou: NÃO reenvia
--   → Se chegar outro webhook sem o link: NÃO reenvia (COALESCE no trigger principal)
-- - INSERT: só dispara se o link já estiver presente no INSERT inicial
--   → Raro mas possível se todos os dados chegarem num webhook só
--
-- DESTINO: POST https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado
-- MECANISMO: pg_net (HTTP assíncrono — não bloqueia a transação)
-- DOCUMENTAÇÃO: docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md

-- ============================================================
-- 1. Habilitar extensão pg_net (HTTP assíncrono nativo Supabase)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- ============================================================
-- 2. Criar função do trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_openclaw_contrato_assinado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contato   RECORD;
  v_opp       RECORD;
  v_faturado  DECIMAL;
  v_payload   JSONB;
BEGIN
  -- ======================================================
  -- GUARDA DE IDEMPOTÊNCIA
  -- ======================================================
  -- INSERT: só avança se o link já veio preenchido
  IF TG_OP = 'INSERT' THEN
    IF NEW.op_link_do_contrato_assinado IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  -- UPDATE: só avança na transição NULL → preenchido
  IF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.op_link_do_contrato_assinado IS NULL
            AND NEW.op_link_do_contrato_assinado IS NOT NULL) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- ======================================================
  -- BUSCAR DADOS RELACIONADOS
  -- ======================================================
  SELECT nome, email, telefone
  INTO v_contato
  FROM contatos
  WHERE id = NEW.contato_id
  LIMIT 1;

  SELECT ghl_opportunity_id, pipeline_name, status
  INTO v_opp
  FROM oportunidades
  WHERE id = NEW.oportunidade_id
  LIMIT 1;

  -- ======================================================
  -- CALCULAR VALOR FATURADO
  -- ======================================================
  v_faturado := COALESCE(NEW.valor_entrada, 0)
              + (COALESCE(NEW.numero_parcelas, 0) * COALESCE(NEW.valor_parcela, 0));

  -- ======================================================
  -- MONTAR PAYLOAD
  -- ======================================================
  v_payload := jsonb_build_object(
    -- Metadados
    'evento',                   'contrato_assinado',
    'timestamp',                NOW(),

    -- Identificação do lead
    'nome',                     v_contato.nome,
    'email',                    v_contato.email,
    'telefone',                 v_contato.telefone,
    'ghl_opportunity_id',       v_opp.ghl_opportunity_id,
    'pipeline',                 v_opp.pipeline_name,

    -- Contratante
    'nome_contratante',         NEW.nome_contratante,
    'cpf_cnpj_contratante',     NEW.cpf_cnpj_contratante,

    -- Endereço
    'logradouro',               NEW.logradouro_rua_avenida,
    'numero_endereco',          NEW.numero_endereco,
    'complemento',              NEW.complemento_endereco,
    'bairro',                   NEW.bairro,
    'municipio',                NEW.municipio,
    'estado_uf',                NEW.estado_uf,
    'cep',                      NEW.cep,

    -- Faturamento
    'valor_faturado',           v_faturado,
    'valor_entrada',            NEW.valor_entrada,
    'numero_parcelas',          NEW.numero_parcelas,
    'valor_parcela',            NEW.valor_parcela,
    'forma_pagamento',          NEW.forma_pagamento,
    'produto_vendido',          NEW.produto_vendido,
    'data_pagamento_entrada',   NEW.data_pagamento_entrada,

    -- Contrato
    'link_contrato_assinado',   NEW.op_link_do_contrato_assinado,

    -- Vencimentos
    'vencimentos_parcelas',     NEW.op_vencimentos_parcelas,

    -- Observações
    'observacoes',              NEW.observacoes_venda
  );

  -- ======================================================
  -- DISPARAR HTTP POST (assíncrono via pg_net)
  -- ======================================================
  PERFORM extensions.net.http_post(
    url     := 'https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'x-openclaw-token', 'hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM'
    ),
    body    := v_payload::text
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Loga o erro mas NÃO falha a transação de vendas_fechamento
  RAISE WARNING 'Erro ao notificar OpenClaw (contrato assinado): %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_openclaw_contrato_assinado() IS
  'Notifica OpenClaw via HTTP POST quando op_link_do_contrato_assinado transita de NULL para preenchido em vendas_fechamento. Idempotente: não reenvia se link já existia.';

-- ============================================================
-- 3. Criar trigger (INSERT + UPDATE para cobrir ambos os casos)
-- ============================================================

DROP TRIGGER IF EXISTS tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento;

CREATE TRIGGER tr_notify_openclaw_contrato_assinado
  AFTER INSERT OR UPDATE ON public.vendas_fechamento
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_openclaw_contrato_assinado();

COMMENT ON TRIGGER tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento IS
  'Dispara notify_openclaw_contrato_assinado após INSERT ou UPDATE em vendas_fechamento. A função garante idempotência pela condição NULL → NOT NULL.';
