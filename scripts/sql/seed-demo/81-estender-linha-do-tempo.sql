-- ═══════════════════════════════════════════════════════════════════════════
-- SEED DEMO — 81. Estender a linha do tempo (aplicado em 2026-08-04)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ NÃO é automático. É um registro do que foi aplicado, para poder repetir.
--
-- PROBLEMA QUE RESOLVE
-- O seed foi gerado em 2026-07-29 e os dados param nessa data. O filtro padrão
-- do dashboard é "últimos 30 dias" — então, conforme o demo envelhece, os
-- últimos dias aparecem zerados e TODO gráfico de linha do tempo termina
-- despencando para zero. Fica com cara de integração quebrada.
--
-- O QUE FAZ
-- Clona a última janela de 6 dias (24/07–29/07) deslocando +6 dias, cobrindo
-- 30/07–04/08: gasto de anúncio, leads, oportunidades e comunicações.
--
-- ⚠️ DUAS ARMADILHAS DE TRIGGER (ver docs/TENANT-DEMONSTRACAO.md)
--   · `oportunidades` INSERT com `data_lead_recebido` NULL dispara
--     `trigger_sync_opp_dates` → chamada à API do GHL DO CLIENTE REAL.
--     Por isso a data é sempre preenchida abaixo.
--   · `contatos` INSERT sem `attribution_skip = true` dispara
--     `trg_fn_enqueue_attribution_on_contact` → idem.
--
-- COMO REPETIR NO FUTURO
-- Troque as duas datas da janela de origem e o número de dias do
-- deslocamento (3 ocorrências de `interval '6 days'` / `+ 6`).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Meta Ads ───────────────────────────────────────────────────────────
insert into meta_ads_insights (
  workspace_id, account_id, campaign_id, adset_id, ad_id, date, hour,
  spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, cpp,
  actions, conversions, conversion_values, cost_per_action_type, video_metrics,
  quality_ranking, engagement_rate_ranking, conversion_rate_ranking,
  campaign_name, adset_name, ad_name,
  landing_page_views, video_views, link_clicks, leads, onsite_web_leads, fb_pixel_leads,
  fetched_at
)
select
  workspace_id, account_id, campaign_id, adset_id, ad_id, date + 6, hour,
  round(spend * 1.04, 2), round(impressions * 1.04)::int, round(clicks * 1.05)::int,
  round(reach * 1.04)::int, frequency, ctr, cpc, cpm, cpp,
  actions, conversions, conversion_values, cost_per_action_type, video_metrics,
  quality_ranking, engagement_rate_ranking, conversion_rate_ranking,
  campaign_name, adset_name, ad_name,
  round(landing_page_views * 1.04)::int, round(video_views * 1.04)::int,
  round(link_clicks * 1.05)::int, round(leads * 1.06)::int,
  round(onsite_web_leads * 1.06)::int, round(fb_pixel_leads * 1.06)::int,
  now()
from meta_ads_insights
where workspace_id = 'd0000000-0000-4000-8000-000000000001'
  and date between '2026-07-24' and '2026-07-29'
on conflict (workspace_id, ad_id, date) do nothing;

-- ─── 2. Contatos ───────────────────────────────────────────────────────────
-- Recombina primeiro nome + sobrenome de outro contato para não duplicar
-- pessoas na listagem de Leads.
with base as (
  select c.*, row_number() over (order by c.id) rn, count(*) over () n
  from contatos c
  join oportunidades o on o.contato_id = c.id
  where c.workspace_id = 'd0000000-0000-4000-8000-000000000001'
    and o.data_lead_recebido::date between '2026-07-24' and '2026-07-29'
),
pairs as (
  select b.*,
         (select b2.ultimo_nome from base b2 where b2.rn = ((b.rn + 7 - 1) % b.n) + 1) novo_sobrenome
  from base b
)
insert into contatos (
  id, ghl_id, nome, primeiro_nome, ultimo_nome, email, telefone, date_created,
  ip, url, ad_id, ad_name, referrer, user_agent,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_keyword,
  tt_source, tt_medium, tt_campaign, tt_term, tt_content,
  country, contact_type, contact_source, pipeline_id_contato, pipeline_name, pipeline_stage,
  location_id, location_name, timezone, owner_id, owner_name, owner_email,
  closer_name, closer_email, tags, attribution_skip, origem, source, sdr_id,
  custom_fields, workspace_id
)
select
  md5(id::text || ':ext6')::uuid,
  ghl_id || '-x6',
  primeiro_nome || ' ' || coalesce(novo_sobrenome, ultimo_nome),
  primeiro_nome,
  coalesce(novo_sobrenome, ultimo_nome),
  lower(translate(primeiro_nome,'áàâãéêíóôõúüç','aaaaeeiooouuc')) || '.' ||
    lower(translate(coalesce(novo_sobrenome, ultimo_nome),'áàâãéêíóôõúüç','aaaaeeiooouuc')) ||
    (90000 + rn)::text || '@acmedemo.test',
  telefone, date_created + interval '6 days',
  ip, url, ad_id, ad_name, referrer, user_agent,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_keyword,
  tt_source, tt_medium, tt_campaign, tt_term, tt_content,
  country, contact_type, contact_source, pipeline_id_contato, pipeline_name, pipeline_stage,
  location_id, location_name, timezone, owner_id, owner_name, owner_email,
  closer_name, closer_email, tags,
  true,                              -- ⚠️ attribution_skip: NÃO remover
  origem, source, sdr_id,
  jsonb_set(coalesce(custom_fields,'{}'::jsonb), '{demo_i}',
            to_jsonb(((custom_fields->>'demo_i')::int + 100000))),
  workspace_id
from pairs
on conflict (ghl_id) do nothing;

-- ─── 3. Oportunidades ──────────────────────────────────────────────────────
-- ⚠️ `data_lead_recebido` SEMPRE preenchida (ver cabeçalho).
insert into oportunidades (
  id, ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo, valor, status,
  pipeline_id, pipeline_stage_id, pipeline_name, data_lead_recebido,
  data_tentativa_1, data_tentativa_2, data_tentativa_3, data_tentativa_4,
  data_no_show, data_conectado, data_perdido, data_qualificado,
  data_agendamento_vendas, data_realizacao_vendas, data_negociacao, data_fechado,
  data_reuniao_agendada, data_reuniao_realizada, data_reuniao_agendada_ts,
  data_agendamento_reuniao, data_ultima_atividade, data_criacao_contato,
  vendedor_closer, sdr_name, opportunity_source, lost_reason,
  agendamento_origem, appointment_status, workspace_id
)
select
  md5(o.id::text || ':ext6')::uuid,
  o.ghl_opportunity_id || '-x6',
  nc.id, nc.nome, nc.email, nc.nome, o.valor, o.status,
  o.pipeline_id, o.pipeline_stage_id, o.pipeline_name,
  o.data_lead_recebido + interval '6 days',
  least(o.data_tentativa_1 + 6, date '2026-08-04'), least(o.data_tentativa_2 + 6, date '2026-08-04'),
  least(o.data_tentativa_3 + 6, date '2026-08-04'), least(o.data_tentativa_4 + 6, date '2026-08-04'),
  least(o.data_no_show + 6, date '2026-08-04'), least(o.data_conectado + 6, date '2026-08-04'),
  least(o.data_perdido + 6, date '2026-08-04'), least(o.data_qualificado + 6, date '2026-08-04'),
  least(o.data_agendamento_vendas + 6, date '2026-08-04'), least(o.data_realizacao_vendas + 6, date '2026-08-04'),
  least(o.data_negociacao + 6, date '2026-08-04'), least(o.data_fechado + 6, date '2026-08-04'),
  least(o.data_reuniao_agendada + 6, date '2026-08-04'), least(o.data_reuniao_realizada + 6, date '2026-08-04'),
  o.data_reuniao_agendada_ts + interval '6 days',
  least(o.data_agendamento_reuniao + 6, date '2026-08-04'),
  least(o.data_ultima_atividade + 6, date '2026-08-04'),
  o.data_criacao_contato + interval '6 days',
  o.vendedor_closer, o.sdr_name, o.opportunity_source, o.lost_reason,
  o.agendamento_origem, o.appointment_status, o.workspace_id
from oportunidades o
join contatos nc on nc.id = md5(o.contato_id::text || ':ext6')::uuid
where o.workspace_id = 'd0000000-0000-4000-8000-000000000001'
  and o.data_lead_recebido::date between '2026-07-24' and '2026-07-29'
on conflict (ghl_opportunity_id) do nothing;

-- ─── 4. Comunicações ───────────────────────────────────────────────────────
-- 4a. Dos leads recém-clonados.
insert into comunicacoes (
  contato_id, tipo, mensagem_body, mensagem_subject, direction, channel,
  data_comunicacao, ghl_message_id, ghl_conversation_id,
  phone_call_duration, phone_call_status, phone_call_from, phone_call_to,
  contato_nome, contato_email, contato_telefone,
  sdr_name, sdr_email, closer_name, ghl_source, msg_status, usuario_ghl_id, workspace_id
)
select
  nc.id, cm.tipo, cm.mensagem_body, cm.mensagem_subject, cm.direction, cm.channel,
  cm.data_comunicacao + interval '6 days',
  cm.ghl_message_id || '-x6', cm.ghl_conversation_id || '-x6',
  cm.phone_call_duration, cm.phone_call_status, cm.phone_call_from, cm.phone_call_to,
  nc.nome, nc.email, nc.telefone,
  cm.sdr_name, cm.sdr_email, cm.closer_name, cm.ghl_source, cm.msg_status, cm.usuario_ghl_id,
  cm.workspace_id
from comunicacoes cm
join contatos nc on nc.id = md5(cm.contato_id::text || ':ext6')::uuid
where cm.workspace_id = 'd0000000-0000-4000-8000-000000000001'
  and cm.data_comunicacao::date between '2026-07-24' and '2026-07-29';

-- 4b. Dos leads que JÁ existiam — sem isso o volume diário de atividade
--     desaba na janela nova (a operação pareceria ter parado).
insert into comunicacoes (
  contato_id, tipo, mensagem_body, mensagem_subject, direction, channel,
  data_comunicacao, ghl_message_id, ghl_conversation_id,
  phone_call_duration, phone_call_status, phone_call_from, phone_call_to,
  contato_nome, contato_email, contato_telefone,
  sdr_name, sdr_email, closer_name, ghl_source, msg_status, usuario_ghl_id, workspace_id
)
select
  cm.contato_id, cm.tipo, cm.mensagem_body, cm.mensagem_subject, cm.direction, cm.channel,
  cm.data_comunicacao + interval '6 days',
  cm.ghl_message_id || '-x6b', cm.ghl_conversation_id || '-x6b',
  cm.phone_call_duration, cm.phone_call_status, cm.phone_call_from, cm.phone_call_to,
  cm.contato_nome, cm.contato_email, cm.contato_telefone,
  cm.sdr_name, cm.sdr_email, cm.closer_name, cm.ghl_source, cm.msg_status, cm.usuario_ghl_id,
  cm.workspace_id
from comunicacoes cm
where cm.workspace_id = 'd0000000-0000-4000-8000-000000000001'
  and cm.data_comunicacao::date between '2026-07-24' and '2026-07-29'
  and cm.ghl_message_id not like '%-x6'
  and not exists (select 1 from contatos nc where nc.id = md5(cm.contato_id::text || ':ext6')::uuid);

-- ─── 5. Investimento orgânico do mês em curso ──────────────────────────────
-- ⚠️ `computeOrganicInvestment` (eb-dash2/src/hooks/useOrganicInvestments.ts)
--    NÃO pro-rateia: se o período do filtro encostar no mês, soma o valor
--    cheio. Por isso o mês parcial entra rateado pelos dias decorridos —
--    senão um mês inteiro de custo bateria contra 4 dias de receita.
insert into organic_investments (workspace_id, item_id, period_start, period_end, utm_source, amount, description)
select workspace_id, item_id, date '2026-08-01', date '2026-08-04', utm_source,
       round(amount * 4.0 / 31.0, 2),
       'Custo de equipe orgânica — parcial do mês em curso (dados de demonstração)'
from organic_investments
where workspace_id = 'd0000000-0000-4000-8000-000000000001' and year_month = '2026-07'
  and not exists (select 1 from organic_investments oi2
                  where oi2.workspace_id = 'd0000000-0000-4000-8000-000000000001'
                    and oi2.year_month = '2026-08');

-- ⚠️ Depois de rodar este script, rode 80-resultado-financeiro.sql de novo
--    para que os leads novos entrem na escada de ticket e na curva de vendas.
