-- ============================================================
-- Migration: 20260924000007
-- Seed: cria automação diária de análise completa de tráfego
--       para bruno@aliancadealtovalor.com.br.
--
-- A Clara vai usar as tools get_campaigns_crm e get_creatives_crm
-- para cruzar Meta Ads × CRM (CPMQL, CPAgendamento, CPReunião, CPV,
-- ROAS, ROAS Caixa) e entregar uma análise pensada todos os dias.
-- ============================================================
SET search_path = public, pg_catalog;

DO $$
DECLARE
    v_workspace_id uuid := '7909d02a-4d15-46ea-a7b8-5debeb6e8351';
    v_next_run timestamptz;
BEGIN
    -- Evita duplicar se o schedule já existir
    IF EXISTS (
        SELECT 1
        FROM public.weekly_email_schedules
        WHERE workspace_id = v_workspace_id
          AND frequency = 'daily'
          AND 'bruno@aliancadealtovalor.com.br' = ANY(recipient_emails)
          AND name = 'Análise diária completa de tráfego'
    ) THEN
        RAISE NOTICE 'Schedule diário já existe; nada inserido.';
        RETURN;
    END IF;

    v_next_run := public.calculate_next_run_at(
        'daily',
        NULL,
        NULL,
        '08:00:00'::time,
        'America/Sao_Paulo',
        NOW()
    );

    INSERT INTO public.weekly_email_schedules (
        workspace_id,
        created_by,
        name,
        description,
        is_active,
        modules,
        report_type,
        dimensions,
        frequency,
        day_of_week,
        day_of_month,
        time_of_day,
        timezone,
        next_run_at,
        subject,
        recipient_emails,
        reply_to,
        template_key,
        include_comparative,
        include_trends,
        use_clara_summary,
        clara_prompt
    ) VALUES (
        v_workspace_id,
        NULL,
        'Análise diária completa de tráfego',
        'Relatório diário de tráfego com análise autônoma da Clara, cruzando campanhas e criativos do Meta Ads com os dados do CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS).',
        true,
        ARRAY['trafego'],
        'cohort',
        ARRAY['todos'],
        'daily',
        NULL,
        NULL,
        '08:00:00',
        'America/Sao_Paulo',
        v_next_run,
        'Análise diária de tráfego · OMNX',
        ARRAY['bruno@aliancadealtovalor.com.br'],
        NULL,
        'default',
        true,
        true,
        true,
        'Analise o tráfego do dia anterior de forma autônoma. Cruze os dados de campanhas e criativos do Meta Ads com o CRM. Para cada campanha e criativo relevante, calcule e comente: CPMQL, CPAgendamento, CPReunião, CPV, ROAS e ROAS Caixa. Identifique o que está funcionando, o que está desperdiçando dinheiro e dê recomendações concretas de escala, pausa ou teste. Use os números exatos das ferramentas. Não apenas repita os KPIs do dashboard.'
    );
END $$;

NOTIFY pgrst, 'reload schema';
