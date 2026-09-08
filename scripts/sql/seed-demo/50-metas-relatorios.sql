-- ============================================================================
-- Tenant de Demonstração — 50 · Metas e Relatórios
-- ============================================================================
-- Popula o módulo de Metas (catálogo → definições → versões → snapshots), a
-- tabela legada `metas` e os agendamentos/logs de e-mail de relatório do
-- tenant de demonstração "Acme Educação (Demo)".
--
-- PRÉ-REQUISITOS: rodar antes 00, 10, 20, 30 e 40.
--
-- ⚠️ workspace alvo: d0000000-0000-4000-8000-000000000001
--
-- ─── DUAS COISAS IMPORTANTES SOBRE ESTE ARQUIVO ────────────────────────────
--
-- 1. AS TABELAS `weekly_*` NÃO SÃO GERADAS AQUI, DE PROPÓSITO.
--    Elas são dado DERIVADO: em produção quem as calcula é a edge function
--    `compute-weekly-reports`, disparada pelos jobs `weekly_reports_cohort_job`
--    e `weekly_reports_produtividade_job`. Reescrever essa agregação em SQL
--    aqui criaria uma segunda implementação da mesma regra de negócio, que
--    inevitavelmente divergiria da real — exatamente o tipo de armadilha que
--    faz a demo mostrar número diferente do produto.
--    A forma correta de regerar está na seção 5, no fim do arquivo.
--
-- 2. O ARQUIVO É PROTEGIDO POR UMA TRAVA DE EXISTÊNCIA.
--    Se o workspace já tiver metas, ele não faz nada. Isso o torna seguro de
--    rodar a qualquer momento, mas significa que, para regerar do zero, você
--    precisa limpar antes (ver seção 6).
-- ============================================================================


-- ─── 1. Definições de meta ──────────────────────────────────────────────────
-- O catálogo `goal_metric_definitions` é GLOBAL e já vem preenchido (8
-- métricas). Aqui só criamos as DEFINIÇÕES do workspace, derivando os escopos
-- da própria taxonomia — assim o conjunto acompanha os canais e a equipe que
-- o arquivo 00 cadastrou, sem lista fixa para desatualizar.
do $$
declare v_ws uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  if exists (select 1 from goal_definitions where workspace_id = v_ws) then
    raise notice 'Metas já existem neste workspace — nada a fazer.';
    return;
  end if;

  -- 1a. Escopo workspace: toda métrica do catálogo que o suporta
  insert into goal_definitions (workspace_id, metric_definition_id, scope_type,
                                scope_id, scope_label, is_active, metadata)
  select v_ws, id, 'workspace', 'global', 'Global', true, '{}'::jsonb
  from goal_metric_definitions
  where is_active and 'workspace' = any(supported_scope_types);

  -- 1b. Escopo canal — tráfego usa os canais pagos, orgânico os orgânicos
  insert into goal_definitions (workspace_id, metric_definition_id, scope_type,
                                scope_id, scope_label, is_active, metadata)
  select v_ws, m.id, 'channel', s.utm_source, s.nome, true, '{}'::jsonb
  from goal_metric_definitions m
  join utm_sources s on s.workspace_id = v_ws
  where m.is_active and m.area_key = 'trafego' and 'channel' = any(m.supported_scope_types);

  insert into goal_definitions (workspace_id, metric_definition_id, scope_type,
                                scope_id, scope_label, is_active, metadata)
  select v_ws, m.id, 'channel', s.utm_source, s.nome, true, '{}'::jsonb
  from goal_metric_definitions m
  join utm_sources_plain s on s.workspace_id = v_ws
  where m.is_active and m.area_key = 'organico' and 'channel' = any(m.supported_scope_types);

  -- 1c. Escopo usuário — pré-vendas para os SDRs, vendas para os closers.
  -- "SDR IA" entra junto: ela tem meta como qualquer pré-vendedor.
  insert into goal_definitions (workspace_id, metric_definition_id, scope_type,
                                scope_id, scope_label, is_active, metadata)
  select v_ws, m.id, 'user', u.nome, u.nome, true, '{}'::jsonb
  from goal_metric_definitions m
  join (
    select nome from ghl_users where workspace_id = v_ws and not deleted and 'sdr' = any(papeis)
    union all select 'SDR IA'
  ) u on true
  where m.is_active and m.area_key = 'prevendas' and 'user' = any(m.supported_scope_types);

  insert into goal_definitions (workspace_id, metric_definition_id, scope_type,
                                scope_id, scope_label, is_active, metadata)
  select v_ws, m.id, 'user', u.nome, u.nome, true, '{}'::jsonb
  from goal_metric_definitions m
  join ghl_users u on u.workspace_id = v_ws and not u.deleted and 'closer' = any(u.papeis)
  where m.is_active and m.area_key = 'vendas' and 'user' = any(m.supported_scope_types);
end $$;


-- ─── 2. Versões mensais das metas ───────────────────────────────────────────
-- A meta é calibrada CONTRA O REALIZADO, com um fator que varia por mês:
-- alguns meses batem, outros ficam perto, outros ficam abaixo. Uma demo em que
-- tudo está verde não demonstra nada — o valor do painel de metas é justamente
-- mostrar desvio.
--
-- O fator sai de hash do mês + da definição, então é determinístico.
do $$
declare v_ws uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  if exists (
    select 1 from goal_versions gv
    join goal_definitions gd on gd.id = gv.goal_definition_id
    where gd.workspace_id = v_ws
  ) then
    raise notice 'Versões de meta já existem — nada a fazer.';
    return;
  end if;

  insert into goal_versions (goal_definition_id, target_value, period_start,
                             period_end, cadence, notes, metadata)
  select
    gd.id,
    -- Meta = realizado × fator. Fator entre 0,85 e 1,20 quando "mais é melhor";
    -- entre 0,80 e 1,15 para custo/tempo, onde a meta funciona como teto.
    --
    -- ⚠️ O ARREDONDAMENTO DEPENDE DA UNIDADE. Meta de "75,60 agendamentos" ou
    -- "6,01 MQLs" não existe no mundo real e destrói a credibilidade da demo.
    -- Percentual também ganha teto: taxa de conversão de 106% é impossível.
    case m.unit
      when 'mql'           then greatest(1, round(bruto.v, 0))
      when 'agendamentos'  then greatest(1, round(bruto.v, 0))
      when 'fechamentos'   then greatest(1, round(bruto.v, 0))
      when 'percent'       then least(85, greatest(1, round(bruto.v, 1)))
      when 'minutes'       then greatest(1, round(bruto.v, 1))
      else                      greatest(1, round(bruto.v, 2))   -- BRL
    end,
    mes.m,
    (mes.m + interval '1 month' - interval '1 day')::date,
    'monthly',
    'Meta mensal — ' || to_char(mes.m, 'MM/YYYY'),
    jsonb_build_object('origem', 'seed-demo')
  from goal_definitions gd
  join goal_metric_definitions m on m.id = gd.metric_definition_id
  cross join (
    select generate_series('2025-08-01'::date, '2026-07-01'::date, interval '1 month')::date m
  ) mes
  left join lateral (
    -- Realizado do mês, por métrica e escopo, lido da base real do tenant.
    select case m.provider_key

      when 'trafego.mql_count' then (
        select count(*)::numeric from oportunidades o
        join contatos c on c.id = o.contato_id
        where o.workspace_id = v_ws
          and o.pipeline_id <> 'Sn1Guqcm6zwZNTVOOf5L'
          and c.tags like '%mql%' and c.tags not like '%nmql%'
          and o.data_lead_recebido >= mes.m
          and o.data_lead_recebido < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or c.utm_source = gd.scope_id)
          and (gd.scope_type <> 'workspace' or c.utm_source in (select utm_source from utm_sources where workspace_id = v_ws))
      )

      when 'trafego.cost_per_mql' then (
        select round(coalesce(sum(d.spend),0) / nullif((
          select count(*) from oportunidades o join contatos c on c.id = o.contato_id
          where o.workspace_id = v_ws and o.pipeline_id <> 'Sn1Guqcm6zwZNTVOOf5L'
            and c.tags like '%mql%' and c.tags not like '%nmql%'
            and o.data_lead_recebido >= mes.m and o.data_lead_recebido < mes.m + interval '1 month'
            and c.utm_source in (select utm_source from utm_sources where workspace_id = v_ws)
        ),0), 2)
        from meta_ads_account_daily d
        where d.workspace_id = v_ws and d.date >= mes.m and d.date < mes.m + interval '1 month'
      )

      when 'organico.mql_count' then (
        select count(*)::numeric from oportunidades o
        join contatos c on c.id = o.contato_id
        where o.workspace_id = v_ws
          and o.pipeline_id <> 'Sn1Guqcm6zwZNTVOOf5L'
          and c.tags like '%mql%' and c.tags not like '%nmql%'
          and o.data_lead_recebido >= mes.m and o.data_lead_recebido < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or c.utm_source = gd.scope_id)
          and (gd.scope_type <> 'workspace' or c.utm_source in (select utm_source from utm_sources_plain where workspace_id = v_ws))
      )

      when 'prevendas.agendamentos' then (
        select count(*)::numeric from oportunidades o
        where o.workspace_id = v_ws and o.data_agendamento_reuniao is not null
          and o.data_agendamento_reuniao >= mes.m
          and o.data_agendamento_reuniao < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or o.sdr_name = gd.scope_id)
      )

      -- Tempo de resposta em MINUTOS: intervalo entre o inbound do lead e o
      -- próximo outbound do time. Ver docs/KPI-SDR-TEMPO-RESPOSTA.md
      --
      -- ⚠️ MEDIANA, não média, e com corte de outlier em 24h. A média aqui é
      -- inútil: uma minoria de leads que só é retomada na cadência seguinte
      -- (dias depois) puxa a média para ~18h, enquanto a mediana real é ~12min.
      -- Usar avg() produziria uma meta de "1.300 minutos de tempo de resposta",
      -- que é obviamente errada para qualquer um que olhe a tela.
      when 'prevendas.response_time' then (
        select round(percentile_cont(0.5) within group (
                 order by extract(epoch from (resp.data_comunicacao - inb.data_comunicacao)) / 60.0
               )::numeric, 1)
        from comunicacoes inb
        join lateral (
          select c2.data_comunicacao from comunicacoes c2
          where c2.contato_id = inb.contato_id and c2.direction = 'outbound'
            and c2.data_comunicacao > inb.data_comunicacao
          order by c2.data_comunicacao limit 1
        ) resp on true
        join contatos ct on ct.id = inb.contato_id
        where inb.workspace_id = v_ws and inb.direction = 'inbound'
          and inb.data_comunicacao >= mes.m and inb.data_comunicacao < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or ct.owner_name = gd.scope_id)
          -- corte anti-distorção: acima de 24h não é "tempo de resposta",
          -- é retomada de cadência
          and resp.data_comunicacao <= inb.data_comunicacao + interval '24 hours'
      )

      when 'vendas.closed_count' then (
        select count(*)::numeric from vendas_fechamento v
        join oportunidades o on o.id = v.oportunidade_id
        where v.workspace_id = v_ws
          and v.data_pagamento_entrada >= mes.m
          and v.data_pagamento_entrada < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or o.vendedor_closer = gd.scope_id)
      )

      when 'vendas.closed_revenue' then (
        select coalesce(sum(v.valor_faturado),0) from vendas_fechamento v
        join oportunidades o on o.id = v.oportunidade_id
        where v.workspace_id = v_ws
          and v.data_pagamento_entrada >= mes.m
          and v.data_pagamento_entrada < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or o.vendedor_closer = gd.scope_id)
      )

      when 'vendas.conversion_rate' then (
        select round(100.0 * count(*) filter (where o.status = 'won')
                     / nullif(count(*) filter (where o.data_realizacao_vendas is not null),0), 1)
        from oportunidades o
        where o.workspace_id = v_ws
          and o.data_realizacao_vendas >= mes.m
          and o.data_realizacao_vendas < mes.m + interval '1 month'
          and (gd.scope_type = 'workspace' or o.vendedor_closer = gd.scope_id)
      )

      else 0 end as valor
  ) realizado on true
  cross join lateral (
    select coalesce(realizado.valor, 0) *
      case when m.target_direction = 'decrease'
           then 0.80 + ((((hashtext('gt'||gd.id::text||mes.m::text) % 1000)+1000)%1000) / 1000.0) * 0.35
           else 0.85 + ((((hashtext('gt'||gd.id::text||mes.m::text) % 1000)+1000)%1000) / 1000.0) * 0.35
      end as v
  ) bruto
  where gd.workspace_id = v_ws;

  -- ── Meta revisada no meio do período ──────────────────────────────────────
  -- Em 3 dos 12 meses a meta é revisada no dia 15. Serve para a tela
  -- demonstrar o versionamento, que é recurso real do módulo e ficaria
  -- invisível se toda meta tivesse uma única versão.
  --
  -- ⚠️ `goal_versions` tem a exclusion constraint `goal_versions_no_overlap`:
  -- duas versões da MESMA definição não podem ter períodos que se cruzam.
  -- Portanto "revisar no meio do mês" NÃO é inserir uma segunda versão por
  -- cima — é ENCURTAR a original até o dia 14 e criar a revisada do 15 em
  -- diante. Inserir sem encurtar quebra o arquivo com erro 23P01.

  -- 1) encurta a versão original até o dia 14
  update goal_versions gv
     set period_end = (gv.period_start + interval '14 days')::date,
         notes      = 'Meta original do período (revisada no dia 15)'
    from goal_definitions gd
   where gd.id = gv.goal_definition_id
     and gd.workspace_id = v_ws
     and gd.scope_type = 'workspace'
     and gv.period_start in (date '2025-11-01', date '2026-02-01', date '2026-05-01');

  -- 2) cria a versão revisada, do dia 15 até o fim do mês
  insert into goal_versions (goal_definition_id, target_value, period_start,
                             period_end, cadence, notes, metadata)
  select gv.goal_definition_id,
         case m.unit
           when 'mql'          then greatest(1, round(gv.target_value * 1.15, 0))
           when 'agendamentos' then greatest(1, round(gv.target_value * 1.15, 0))
           when 'fechamentos'  then greatest(1, round(gv.target_value * 1.15, 0))
           when 'percent'      then least(85, round(gv.target_value * 1.10, 1))
           when 'minutes'      then greatest(1, round(gv.target_value * 0.90, 1))
           else                     round(gv.target_value * 1.15, 2)
         end,
         (gv.period_start + interval '15 days')::date,
         -- fim do mês calculado a partir do início, porque o period_end
         -- original acabou de ser encurtado no passo 1
         (date_trunc('month', gv.period_start) + interval '1 month' - interval '1 day')::date,
         'monthly',
         'Meta revisada no meio do mês',
         jsonb_build_object('origem', 'seed-demo', 'revisao', true)
  from goal_versions gv
  join goal_definitions gd on gd.id = gv.goal_definition_id
  join goal_metric_definitions m on m.id = gd.metric_definition_id
  where gd.workspace_id = v_ws
    and gd.scope_type = 'workspace'
    and gv.period_start in (date '2025-11-01', date '2026-02-01', date '2026-05-01')
    and gv.notes = 'Meta original do período (revisada no dia 15)';
end $$;


-- ─── 3. Snapshots semanais das metas ────────────────────────────────────────
-- Um ponto por semana dentro do período de cada versão: `actual_value` é o
-- acumulado real até aquela data, `ideal_value` é a reta até a meta e
-- `projected_value` extrapola o ritmo atual até o fim do período.
do $$
declare v_ws uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  if exists (
    select 1 from goal_snapshots gs
    join goal_versions gv on gv.id = gs.goal_version_id
    join goal_definitions gd on gd.id = gv.goal_definition_id
    where gd.workspace_id = v_ws
  ) then
    raise notice 'Snapshots de meta já existem — nada a fazer.';
    return;
  end if;

  -- ⚠️ `status` tem CHECK: só aceita
  --    scheduled | on_track | at_risk | off_track | completed | no_data
  -- e o sinal depende de `target_direction`: em métricas de custo/tempo
  -- (CPMQL, tempo de resposta) ficar ABAIXO da meta é o bom resultado.
  insert into goal_snapshots (goal_version_id, snapshot_date, actual_value,
                              ideal_value, projected_value, status, payload)
  select
    gv.id,
    d.dia,
    calc.atual,
    calc.ideal,
    round(gv.target_value * (0.85 + ((((hashtext('pj'||gv.id::text) % 1000)+1000)%1000) / 1000.0) * 0.4), 2),
    case
      when d.dia > date '2026-07-29' then 'scheduled'
      -- Período já encerrado: o último ponto da série fecha como 'completed'.
      -- Sem isso, meses antigos ficariam eternamente "on_track"/"at_risk",
      -- como se ainda estivessem correndo.
      when gv.period_end < date '2026-07-29'
           and d.dia + 7 > gv.period_end then 'completed'
      when m.target_direction = 'decrease' then
        case when calc.atual <= calc.ideal              then 'on_track'
             when calc.atual <= calc.ideal * 1.25       then 'at_risk'
             else 'off_track' end
      else
        case when calc.atual >= calc.ideal              then 'on_track'
             when calc.atual >= calc.ideal * 0.75       then 'at_risk'
             else 'off_track' end
    end,
    jsonb_build_object('origem', 'seed-demo')
  from goal_versions gv
  join goal_definitions gd on gd.id = gv.goal_definition_id
  join goal_metric_definitions m on m.id = gd.metric_definition_id
  cross join lateral (
    select generate_series(gv.period_start, least(gv.period_end, date '2026-07-29'), interval '7 days')::date dia
  ) d
  cross join lateral (
    select least(1.0, greatest(0.05,
      (d.dia - gv.period_start + 1)::numeric / nullif(gv.period_end - gv.period_start + 1, 0)
    )) frac
  ) prog
  cross join lateral (
    select
      round(gv.target_value * prog.frac, 2) as ideal,
      round(gv.target_value * prog.frac
            -- Faixa 0,55–1,35 do ideal: larga o bastante para produzir os três
            -- estados (on_track / at_risk / off_track) em proporção realista.
            -- Uma faixa estreita deixaria a demo sem nenhuma meta furada.
            * (0.55 + ((((hashtext('sn'||gv.id::text||d.dia::text) % 1000)+1000)%1000) / 1000.0) * 0.80), 2) as atual
  ) calc
  where gd.workspace_id = v_ws;
end $$;


-- ─── 4. Tabela legada `metas` ───────────────────────────────────────────────
-- Mantida por compatibilidade com telas que ainda leem daqui.
insert into metas (workspace_id, tipo, referencia, valor, periodo, periodo_inicio, periodo_fim)
select 'd0000000-0000-4000-8000-000000000001', m.area_key, gd.scope_label,
       gv.target_value, 'mensal', gv.period_start, gv.period_end
from goal_versions gv
join goal_definitions gd on gd.id = gv.goal_definition_id
join goal_metric_definitions m on m.id = gd.metric_definition_id
where gd.workspace_id = 'd0000000-0000-4000-8000-000000000001'
  and not exists (select 1 from metas where workspace_id = 'd0000000-0000-4000-8000-000000000001')
on conflict (workspace_id, tipo, referencia, periodo_inicio, periodo_fim) do nothing;


-- ─── 5. Relatórios semanais (`weekly_*`) — como regerar ─────────────────────
--
-- NÃO existe INSERT aqui de propósito (ver o cabeçalho do arquivo).
-- O gerador canônico é a edge function `compute-weekly-reports`, a mesma que
-- roda em produção. Para preencher o histórico do tenant de demonstração,
-- invoque-a uma vez por semana comercial (segunda→domingo) e por tipo:
--
--   for semana in $(seq 0 51); do
--     for tipo in cohort produtividade; do
--       curl -s -X POST \
--         "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/compute-weekly-reports" \
--         -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--         -H "Content-Type: application/json" \
--         -d "{\"workspace_id\":\"d0000000-0000-4000-8000-000000000001\",
--              \"week_start\":\"<segunda-feira da semana>\",
--              \"report_type\":\"$tipo\"}"
--     done
--   done
--
-- Confira o contrato exato do corpo da requisição em
-- `supabase/functions/compute-weekly-reports/index.ts` antes de rodar — ele é
-- a fonte da verdade, não este comentário.
--
-- Semanas cobertas na demo original: 2025-08-04 a 2026-07-26 (51 semanas),
-- gerando 102 linhas em `weekly_snapshots` (51 cohort + 51 produtividade) e
-- ~5.400 linhas nas tabelas por módulo, com as dimensões `todos`, `canal`,
-- `sdr`, `closer` e `origem`.


-- ─── 6. Agendamentos e logs de e-mail de relatório ──────────────────────────
-- Só para as abas Automações/Relatórios não ficarem vazias na demonstração.
-- `is_active = false` de propósito: um agendamento ativo dispararia e-mail de
-- verdade a partir de dado fictício.
insert into weekly_email_schedules (
  workspace_id, name, description, modules, report_type, frequency,
  day_of_week, time_of_day, subject, recipient_emails, is_active
)
select 'd0000000-0000-4000-8000-000000000001', x.name, x.descr, x.mods, x.rtype, x.freq,
       x.dow, x.hora, x.subj, array['marina@acmedemo.test'], false
from (values
  ('Resumo semanal — Comercial',
   'Enviado toda segunda com o fechamento da semana anterior.',
   array['trafego','prevendas','vendas'], 'produtividade', 'weekly', 1, '08:00'::time,
   'Acme Educação — resumo da semana'),
  ('Consolidado mensal — Diretoria',
   'Visão de cohort do mês fechado.',
   array['trafego','aquisicao','vendas','metas'], 'cohort', 'monthly', 1, '09:00'::time,
   'Acme Educação — consolidado do mês')
) as x(name, descr, mods, rtype, freq, dow, hora, subj)
where not exists (
  select 1 from weekly_email_schedules
  where workspace_id = 'd0000000-0000-4000-8000-000000000001'
);


-- ─── 7. Limpeza, para regerar do zero ───────────────────────────────────────
-- As travas das seções 1–3 impedem execução dupla. Para reconstruir:
--
-- delete from goal_snapshots gs using goal_versions gv, goal_definitions gd
--   where gs.goal_version_id = gv.id and gv.goal_definition_id = gd.id
--     and gd.workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from goal_versions gv using goal_definitions gd
--   where gv.goal_definition_id = gd.id
--     and gd.workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from goal_definitions where workspace_id = 'd0000000-0000-4000-8000-000000000001';
-- delete from metas             where workspace_id = 'd0000000-0000-4000-8000-000000000001';
--
-- Para os `weekly_*`, apague as linhas do workspace nas 9 tabelas por módulo e
-- em `weekly_snapshots`, e rode de novo a edge function da seção 5.
