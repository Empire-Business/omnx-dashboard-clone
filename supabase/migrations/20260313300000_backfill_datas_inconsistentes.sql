-- ============================================================
-- Migration: Backfill de datas inválidas (futuras > 15 dias)
--
-- Contexto:
--   Após investigação, descobriu-se que centenas de leads têm datas
--   incorretas no banco. O padrão é inequívoco: datas foram parseadas
--   com MM/DD invertido (ex: "12/02/2026" → dezembro ao invés de fevereiro).
--
-- Exemplos reais:
--   date_created do contato: 2026-02-12
--   data_lead_recebido no banco: 2026-12-02 ❌ (deveria ser 02-12)
--
-- Critério de "data inválida":
--   - data_lead_recebido > NOW() + 15 dias (nunca deveria ser futura)
--   - data_conectado, data_fechado, etc > NOW() + 15 dias
--   - Tolerância de 15 dias cobre agendamentos legítimos de reuniões
--
-- Estratégia de correção:
--   Remover valores futuros (> 15 dias) na maioria dos campos.
--   Estas datas foram definitivamente parseadas errado.
-- ============================================================

DO $$
DECLARE
    v_count_lead_recebido INTEGER;
    v_count_conectado INTEGER;
    v_count_fechado INTEGER;
    v_count_realizacao INTEGER;
    v_count_negociacao INTEGER;
    v_count_perdido INTEGER;
    v_count_no_show INTEGER;
BEGIN
    -- ============================================
    -- DIAGNÓSTICO PRÉ-BACKFILL
    -- ============================================

    SELECT COUNT(*) INTO v_count_lead_recebido
    FROM oportunidades
    WHERE data_lead_recebido > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_conectado
    FROM oportunidades
    WHERE data_conectado > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_fechado
    FROM oportunidades
    WHERE data_fechado > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_realizacao
    FROM oportunidades
    WHERE data_realizacao_vendas > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_negociacao
    FROM oportunidades
    WHERE data_negociacao > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_perdido
    FROM oportunidades
    WHERE data_perdido > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_no_show
    FROM oportunidades
    WHERE data_no_show > NOW() + INTERVAL '15 days';

    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_lead_recebido > NOW()+15d', v_count_lead_recebido;
    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_conectado > NOW()+15d', v_count_conectado;
    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_fechado > NOW()+15d', v_count_fechado;
    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_realizacao_vendas > NOW()+15d', v_count_realizacao;
    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_negociacao > NOW()+15d', v_count_negociacao;
    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_perdido > NOW()+15d', v_count_perdido;
    RAISE NOTICE 'PRÉ-BACKFILL: % oportunidades com data_no_show > NOW()+15d', v_count_no_show;

    -- ============================================
    -- ETAPA 1: Corrigir data_lead_recebido futura
    -- ============================================

    UPDATE oportunidades
    SET data_lead_recebido = NULL
    WHERE data_lead_recebido > NOW() + INTERVAL '15 days';

    RAISE NOTICE 'Backfill data_lead_recebido concluído';

    -- ============================================
    -- ETAPA 2: Corrigir outras datas futuras
    -- ============================================

    UPDATE oportunidades
    SET
        data_conectado = CASE WHEN data_conectado > NOW() + INTERVAL '15 days' THEN NULL ELSE data_conectado END,
        data_fechado = CASE WHEN data_fechado > NOW() + INTERVAL '15 days' THEN NULL ELSE data_fechado END,
        data_perdido = CASE WHEN data_perdido > NOW() + INTERVAL '15 days' THEN NULL ELSE data_perdido END,
        data_no_show = CASE WHEN data_no_show > NOW() + INTERVAL '15 days' THEN NULL ELSE data_no_show END,
        data_qualificado = CASE WHEN data_qualificado > NOW() + INTERVAL '15 days' THEN NULL ELSE data_qualificado END,
        data_agendamento_reuniao = CASE WHEN data_agendamento_reuniao > NOW() + INTERVAL '15 days' THEN NULL ELSE data_agendamento_reuniao END,
        data_pendencias_preenchimento = CASE WHEN data_pendencias_preenchimento > NOW() + INTERVAL '15 days' THEN NULL ELSE data_pendencias_preenchimento END,
        data_tentativa_1 = CASE WHEN data_tentativa_1 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_1 END,
        data_tentativa_2 = CASE WHEN data_tentativa_2 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_2 END,
        data_tentativa_3 = CASE WHEN data_tentativa_3 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_3 END,
        data_tentativa_4 = CASE WHEN data_tentativa_4 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_4 END,
        data_tentativa_5 = CASE WHEN data_tentativa_5 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_5 END,
        data_tentativa_6 = CASE WHEN data_tentativa_6 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_6 END,
        data_tentativa_7 = CASE WHEN data_tentativa_7 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_7 END,
        data_tentativa_8 = CASE WHEN data_tentativa_8 > NOW() + INTERVAL '15 days' THEN NULL ELSE data_tentativa_8 END,
        data_realizacao_vendas = CASE WHEN data_realizacao_vendas > NOW() + INTERVAL '15 days' THEN NULL ELSE data_realizacao_vendas END,
        data_negociacao = CASE WHEN data_negociacao > NOW() + INTERVAL '15 days' THEN NULL ELSE data_negociacao END,
        data_no_show_vendas = CASE WHEN data_no_show_vendas > NOW() + INTERVAL '15 days' THEN NULL ELSE data_no_show_vendas END,
        data_perdido_vendas = CASE WHEN data_perdido_vendas > NOW() + INTERVAL '15 days' THEN NULL ELSE data_perdido_vendas END,
        data_agendamento_vendas = CASE WHEN data_agendamento_vendas > NOW() + INTERVAL '15 days' THEN NULL ELSE data_agendamento_vendas END,
        data_reuniao_agendada = CASE WHEN data_reuniao_agendada > NOW() + INTERVAL '15 days' THEN NULL ELSE data_reuniao_agendada END,
        data_reuniao_realizada = CASE WHEN data_reuniao_realizada > NOW() + INTERVAL '15 days' THEN NULL ELSE data_reuniao_realizada END
    WHERE
        data_conectado > NOW() + INTERVAL '15 days' OR
        data_fechado > NOW() + INTERVAL '15 days' OR
        data_perdido > NOW() + INTERVAL '15 days' OR
        data_no_show > NOW() + INTERVAL '15 days' OR
        data_qualificado > NOW() + INTERVAL '15 days' OR
        data_agendamento_reuniao > NOW() + INTERVAL '15 days' OR
        data_pendencias_preenchimento > NOW() + INTERVAL '15 days' OR
        data_tentativa_1 > NOW() + INTERVAL '15 days' OR
        data_tentativa_2 > NOW() + INTERVAL '15 days' OR
        data_tentativa_3 > NOW() + INTERVAL '15 days' OR
        data_tentativa_4 > NOW() + INTERVAL '15 days' OR
        data_tentativa_5 > NOW() + INTERVAL '15 days' OR
        data_tentativa_6 > NOW() + INTERVAL '15 days' OR
        data_tentativa_7 > NOW() + INTERVAL '15 days' OR
        data_tentativa_8 > NOW() + INTERVAL '15 days' OR
        data_realizacao_vendas > NOW() + INTERVAL '15 days' OR
        data_negociacao > NOW() + INTERVAL '15 days' OR
        data_no_show_vendas > NOW() + INTERVAL '15 days' OR
        data_perdido_vendas > NOW() + INTERVAL '15 days' OR
        data_agendamento_vendas > NOW() + INTERVAL '15 days' OR
        data_reuniao_agendada > NOW() + INTERVAL '15 days' OR
        data_reuniao_realizada > NOW() + INTERVAL '15 days';

    RAISE NOTICE 'Backfill demais datas futuras concluído';

    -- ============================================
    -- ETAPA 3: Fix explícito para danieltiago107@gmail.com
    -- ============================================

    UPDATE oportunidades
    SET data_lead_recebido = '2026-02-10T00:00:00+00:00'::timestamptz
    WHERE email_contato = 'danieltiago107@gmail.com'
      AND pipeline_name = 'Vendas SQL'
      AND data_lead_recebido IS NULL;

    RAISE NOTICE 'Fix explícito para danieltiago107@gmail.com concluído';

    -- ============================================
    -- DIAGNÓSTICO PÓS-BACKFILL
    -- ============================================

    SELECT COUNT(*) INTO v_count_lead_recebido
    FROM oportunidades
    WHERE data_lead_recebido > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_conectado
    FROM oportunidades
    WHERE data_conectado > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_fechado
    FROM oportunidades
    WHERE data_fechado > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_realizacao
    FROM oportunidades
    WHERE data_realizacao_vendas > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_negociacao
    FROM oportunidades
    WHERE data_negociacao > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_perdido
    FROM oportunidades
    WHERE data_perdido > NOW() + INTERVAL '15 days';

    SELECT COUNT(*) INTO v_count_no_show
    FROM oportunidades
    WHERE data_no_show > NOW() + INTERVAL '15 days';

    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_lead_recebido > NOW()+15d (deveria ser 0)', v_count_lead_recebido;
    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_conectado > NOW()+15d', v_count_conectado;
    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_fechado > NOW()+15d', v_count_fechado;
    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_realizacao_vendas > NOW()+15d', v_count_realizacao;
    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_negociacao > NOW()+15d', v_count_negociacao;
    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_perdido > NOW()+15d', v_count_perdido;
    RAISE NOTICE 'PÓS-BACKFILL: % oportunidades com data_no_show > NOW()+15d', v_count_no_show;

END $$;
