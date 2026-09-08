-- ============================================================================
-- Tenant de Demonstração — 10 · Núcleo do CRM
-- ============================================================================
-- Gera contatos, oportunidades, vendas e a base do discador do tenant de
-- demonstração "Acme Educação (Demo)". 100% dado fictício.
--
-- PRÉ-REQUISITO: rodar antes `00-provisionamento.sql`.
--
-- ⚠️ workspace alvo: d0000000-0000-4000-8000-000000000001
--    NUNCA aponte para o workspace de produção de um cliente.
--
-- COMO A ALEATORIEDADE FUNCIONA
--   Nada usa random(). Toda variação vem de hash determinístico sobre o
--   índice do lead: ((hashtext('sal'||i) % 10000)+10000)%10000  →  0..9999.
--   Isso torna o resultado reprodutível e permite recalcular a mesma decisão
--   em etapas diferentes sem guardar estado.
--
-- FORMATO DO FUNIL (calibrado para uma operação de alto ticket)
--   8.200 leads → ~3.180 MQL → ~2.475 conectados → ~607 reuniões agendadas
--   → ~390 realizadas → ~123 no-shows → ~75 vendas
--   + ~567 oportunidades de Recuperação (leads antigos reativados)
--   Ticket médio ~R$ 13 mil · faturamento ~R$ 1,03 mi · tráfego ~R$ 480 mil
--
-- ⚠️ TRÊS ARMADILHAS DE TRIGGER QUE ESTE ARQUIVO CONTORNA DE PROPÓSITO
--   1. `trg_attribution_on_contact` enfileira chamada à API REAL do GHL para
--      contato de formulário do Facebook sem UTM. Contornado com
--      `attribution_skip = true` em todo contato fictício.
--   2. `tr_sync_opp_dates_on_insert` dispara busca de datas na API do GHL
--      quando a oportunidade entra com `data_lead_recebido` NULL. Contornado
--      preenchendo sempre essa coluna.
--   3. `marcar_conectado_ao_perder` preenche `data_conectado` em toda
--      oportunidade marcada como 'lost' sem conexão registrada. É o
--      comportamento real de produção — por isso os "conectados" (2.475)
--      são mais que os contatos com a tag `conectado` (1.671).
-- ============================================================================

-- ─── 1. Contatos ────────────────────────────────────────────────────────────
-- A distribuição mensal cresce ao longo do ano, com queda em dezembro e
-- julho parcial (a base termina em 2026-07-29, "hoje" na geração original).
with meses(idx, m_start, n, dias) as (values
  (1,'2025-08-01'::date,520,31),(2,'2025-09-01'::date,560,30),(3,'2025-10-01'::date,600,31),
  (4,'2025-11-01'::date,700,30),(5,'2025-12-01'::date,540,31),(6,'2026-01-01'::date,720,31),
  (7,'2026-02-01'::date,740,28),(8,'2026-03-01'::date,760,31),(9,'2026-04-01'::date,780,30),
  (10,'2026-05-01'::date,800,31),(11,'2026-06-01'::date,820,30),(12,'2026-07-01'::date,660,29)
),
exp as (
  select m.idx, m.m_start, m.dias, m.n, k, row_number() over (order by m.idx, k) as i
  from meses m cross join lateral generate_series(1, m.n) k
),
r as (
  select e.*,
    (((hashtext('ch'||i::text) % 10000)+10000)%10000) r_ch,
    (((hashtext('mql'||i::text) % 10000)+10000)%10000) r_mql,
    (((hashtext('cn'||i::text) % 10000)+10000)%10000) r_cn,
    (((hashtext('src'||i::text) % 10000)+10000)%10000) r_src,
    (((hashtext('cmp'||i::text) % 10000)+10000)%10000) r_cmp,
    (((hashtext('med'||i::text) % 10000)+10000)%10000) r_med,
    (((hashtext('cr'||i::text) % 10000)+10000)%10000) r_cr,
    (((hashtext('nm'||i::text) % 10000)+10000)%10000) r_nm,
    (((hashtext('sn'||i::text) % 10000)+10000)%10000) r_sn,
    (((hashtext('sdr'||i::text) % 10000)+10000)%10000) r_sdr,
    (((hashtext('hr'||i::text) % 10000)+10000)%10000) r_hr,
    (((hashtext('fat'||i::text) % 10000)+10000)%10000) r_fat
  from exp e
),
b as (
  select r.*,
    (r_ch < 6500) as is_paid,                       -- 65% tráfego pago
    (r_ch >= 6500 and r_ch < 9500) as is_org,       -- 30% orgânico
    (r_mql < 3800) as is_mql,                       -- 38% viram MQL
    (r_mql < 3800 and r_cn < 5200) as is_conn,      -- 52% dos MQL conectam
    ((m_start + (floor((k-1)::numeric * dias / n) * interval '1 day')
      + make_interval(hours => 8 + (r_hr % 12), mins => (r_hr*7) % 60))::timestamp
      at time zone 'America/Sao_Paulo') as lead_ts,
    (array['Ana','Bruno','Carla','Daniel','Eduarda','Felipe','Gabriela','Henrique','Isabela','João','Karina','Lucas','Mariana','Nathan','Olívia','Pedro','Queila','Rodrigo','Sabrina','Thiago','Ursula','Vinícius','Wanessa','Xavier','Yasmin','Zeca','Amanda','Bernardo','Camila','Diego','Elaine','Fábio','Giovana','Heitor','Ivana','Jonas','Letícia','Marcelo','Natália','Otávio'])[1 + (r_nm % 40)] as pnome,
    (array['Almeida','Barbosa','Cardoso','Duarte','Esteves','Fonseca','Gomes','Henriques','Ibrahim','Jardim','Klein','Lima','Moraes','Nunes','Oliveira','Pacheco','Quintela','Ribeiro','Santana','Teixeira','Uchoa','Vasconcelos','Werneck','Xavier','Yamada','Zanetti','Bittencourt','Carvalho','Dantas','Figueiredo'])[1 + (r_sn % 30)] as snome
  from r
),
c as (
  select b.*,
    case when is_paid then (array['iads-1','iads-2','iads-3','iads-4','gads-1','yt-1'])[1 + (r_src % 6)]
         when is_org  then (array['iorg-1','iorg-2','iorg-3','iorg-4','iorg-5'])[1 + (r_src % 5)]
    end as utm_src,
    case when is_paid or is_org then 1 + (r_cmp % 5) end as utm_cmp,
    case when is_paid or is_org then 1 + (r_med % 5) end as utm_med,
    101 + (r_cr % 24) as cr_num
  from b
)
insert into contatos (
  ghl_id, nome, primeiro_nome, ultimo_nome, email, telefone, date_created,
  utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  contact_source, origem, source, country, timezone,
  owner_name, owner_email, tags, attribution_skip, custom_fields, workspace_id
)
select
  'demo-c-'||lpad(i::text,6,'0'),
  pnome||' '||snome, pnome, snome,
  lower(translate(pnome||'.'||snome,'áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ','aaaaeeiooouucAAAAEEIOOOUUC'))||'.'||i::text||'@acmedemo.test',
  '+5511'||(90000000 + (i*7919) % 9999999)::text,
  lead_ts,
  utm_src, utm_med::text, utm_cmp::text,
  -- utm_term é a ponte lead → criativo. O painel de Criativos faz split('_')
  -- e lê parts[2] como código de público, e extrai o criativo com /(CR|AN)-\d+/.
  -- Quebrar este formato zera a aba Criativos.
  case when is_paid then 'M'||idx::text||'_O1_'||
       (case utm_src when 'iads-1' then 'P11' when 'iads-2' then 'P12' when 'iads-3' then 'P13'
                     when 'iads-4' then 'P14' when 'gads-1' then 'P21' else 'P22' end)||
       '_CR-'||cr_num::text||'_'||
       (case utm_cmp when 1 then 'PG12' when 2 then 'PG27' when 3 then 'PG32'
                     when 4 then 'PG24' else 'PG12' end)
  end,
  case when is_paid then 'anuncio-'||cr_num::text end,
  case when is_paid then 'facebook_ads' when is_org then 'organico' else 'manual' end,
  case when is_paid then 'Tráfego Pago' when is_org then 'Orgânico' else 'Sem atribuição' end,
  'demo', 'BR', 'America/Sao_Paulo',
  (array['Bruna Martins','Diego Salles','Larissa Prado','Rafael Uchoa','SDR IA'])[1 + (r_sdr % 5)],
  (array['bruna@acmedemo.test','diego@acmedemo.test','larissa@acmedemo.test','rafael@acmedemo.test','sdria@acmedemo.test'])[1 + (r_sdr % 5)],
  -- MQL é detectado por TAG, nunca por pipeline. Ver docs/MQL-TAG-CLASSIFICATION.md
  concat_ws(',',
    case utm_cmp when 1 then '[cp] aplicação' when 2 then '[fn] webinário' when 3 then '[fn] webinário'
                 when 4 then '[cp] desafio' when 5 then '[cp] aplicação' else 'lead-manual' end,
    case when is_mql then 'mql' else 'nmql' end,
    case when is_conn then 'conectado' end,
    case when is_mql and r_fat < 3500 then 'qualificado' end
  ),
  true,   -- attribution_skip: impede chamada à API real do GHL (armadilha 1)
  jsonb_build_object('demo_i', i, 'demo_lead_ts', lead_ts, 'demo', true),
  'd0000000-0000-4000-8000-000000000001'
from c
on conflict (ghl_id) do nothing;

-- ─── 2. Redistribui as campanhas entre os 12 códigos ────────────────────────
-- O passo 1 usa só as campanhas 1..5 para manter a legibilidade; aqui a base
-- ganha variedade real, e o utm_term é reescrito para continuar coerente.
with c as (
  select id, utm_term, (custom_fields->>'demo_i')::int i
  from contatos
  where workspace_id='d0000000-0000-4000-8000-000000000001' and custom_fields ? 'demo_i'
),
n as (
  select c.*, 1 + ((((hashtext('cmp2'||i::text) % 10000)+10000)%10000) % 12) as novo_cmp,
         (((hashtext('mes'||i::text) % 10000)+10000)%10000) r_mes
  from c
)
update contatos t set
  utm_campaign = n.novo_cmp::text,
  utm_term = case when t.utm_term is null then null else
    regexp_replace(
      regexp_replace(t.utm_term, '_PG[0-9]+$', '_'||(case n.novo_cmp
        when 1 then 'PG12' when 2 then 'PG27' when 3 then 'PG32' when 4 then 'PG24' when 5 then 'PG12'
        when 6 then 'PG32' when 7 then 'PG41' when 8 then 'PG09' when 9 then 'PG53' when 10 then 'PG14'
        when 11 then 'PG12' else 'PG27' end)),
      '^M[0-9]+', 'M'||(1 + (n.r_mes % 12))::text)
  end
from n where t.id = n.id;

-- ─── 3. Oportunidades (a cascata de datas do funil) ─────────────────────────
-- ⚠️ pipeline_id NUNCA pode ficar NULL: PostgREST filtra NULL silenciosamente
--    em .neq() e o lead some de todos os painéis. Ver docs/BUG-FIX-PIPELINE-NULL.md
-- Os pipeline_id abaixo são os mesmos do GHL real de propósito: há constantes
-- hardcoded no frontend (PIPELINE_RECUPERACAO_ID, PIPELINE_VENDAS_SQL_ID) que
-- só funcionam com esses valores. Reusar o id em outro workspace não vaza
-- nada — o isolamento é por workspace_id.
with c as (
  select id, ghl_id, nome, email, tags, owner_name,
         (custom_fields->>'demo_i')::int as i,
         (custom_fields->>'demo_lead_ts')::timestamptz as lead_ts
  from contatos
  where workspace_id='d0000000-0000-4000-8000-000000000001' and custom_fields ? 'demo_i'
),
r as (
  select c.*,
    (((hashtext('sc'||i::text) % 10000)+10000)%10000) r_sc,
    (((hashtext('ns'||i::text) % 10000)+10000)%10000) r_ns,
    (((hashtext('rz'||i::text) % 10000)+10000)%10000) r_rz,
    (((hashtext('vd'||i::text) % 10000)+10000)%10000) r_vd,
    (((hashtext('ls'||i::text) % 10000)+10000)%10000) r_ls,
    (((hashtext('cl'||i::text) % 10000)+10000)%10000) r_cl,
    (((hashtext('lg'||i::text) % 10000)+10000)%10000) r_lg,
    (((hashtext('vl'||i::text) % 10000)+10000)%10000) r_vl,
    (((hashtext('pp'||i::text) % 10000)+10000)%10000) r_pp,
    (tags like '%conectado%') as is_conn,
    (tags like '%mql%' and tags not like '%nmql%') as is_mql,
    (tags like '%qualificado%') as is_qual,
    lead_ts::date as d0
  from c
),
f as (select r.*, (is_conn and r_sc < 3600) as sched from r),
g as (
  select f.*,
    (sched and r_ns < 2000) as noshow,
    (sched and r_ns >= 2000 and r_rz < 7750) as realizou
  from f
),
h as (
  select g.*,
    (realizou and r_vd < 2300) as venda,
    least(d0 + ((r_lg % 5))::int, date '2026-07-29') as d_conn,
    least(d0 + ((r_lg % 5) + 1 + (r_sc % 7))::int, date '2026-07-29') as d_agend
  from g
),
j as (select h.*, least(d_agend + (2 + (r_ns % 8))::int, date '2026-07-29') as d_reuniao from h)
insert into oportunidades (
  ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo, valor, status,
  pipeline_id, pipeline_name, pipeline_stage_id, data_lead_recebido, data_criacao_contato,
  data_conectado, data_qualificado, data_agendamento_reuniao, data_reuniao_agendada,
  data_reuniao_agendada_ts, data_reuniao_realizada, data_realizacao_vendas, data_no_show,
  data_negociacao, data_fechado, data_perdido, data_ultima_atividade,
  sdr_name, vendedor_closer, appointment_status, agendamento_origem,
  agendamento_por_user_nome, agendamento_calendar_name, opportunity_source,
  lost_reason, workspace_id
)
select
  'demo-o-'||lpad(i::text,6,'0'), id, nome, email,
  nome||' — Acelerador Acme', 8000 + (r_vl % 101) * 100,
  case when venda then 'won'
       when (is_conn and not sched and r_ls < 5500) or (not is_conn and r_ls < 1200) then 'lost'
       when (sched and not venda and r_ls < 4000) then 'lost'
       else 'open' end,
  case when sched then 'ZWuCjEXM2VDyLCx8CtGU'
       when is_mql and r_pp < 400 then 'H7Nz08hgySOJ9upSYSPL'
       when is_mql and r_pp >= 400 and r_pp < 700 then '8DAr28W959nKNsmTL8qy'
       when is_mql then 'QQXqQvYEkwafSCAB1ybC'
       else 'sqchZ2kIIZljR6wJ6bko' end,
  case when sched then 'Vendas SQL'
       when is_mql and r_pp < 400 then 'Cami'
       when is_mql and r_pp >= 400 and r_pp < 700 then 'Auto Agendamento'
       when is_mql then 'Pré-Vendas MQL'
       else 'Pré-Vendas nMQL' end,
  'demo-stage-'||(1 + (r_pp % 6))::text,
  lead_ts,   -- preenchido de propósito: evita a armadilha 2 (chamada ao GHL)
  lead_ts,
  case when is_conn then d_conn end,
  case when is_qual and is_conn then least(d_conn + (r_lg % 4)::int, date '2026-07-29') end,
  case when sched then d_agend end,
  case when sched then d_reuniao end,
  case when sched then (d_reuniao + make_interval(hours => 9 + (r_ns % 9)))::timestamp at time zone 'America/Sao_Paulo' end,
  case when realizou then d_reuniao end,
  case when realizou then d_reuniao end,
  case when noshow then d_reuniao end,
  case when venda then least(d_reuniao + (1 + (r_vd % 5))::int, date '2026-07-29') end,
  case when venda then least(d_reuniao + (2 + (r_vd % 12))::int, date '2026-07-29') end,
  case when venda then null
       when (is_conn and not sched and r_ls < 5500) then least(d_conn + (7 + (r_ls % 34))::int, date '2026-07-29')
       when (not is_conn and r_ls < 1200) then least(d0 + (20 + (r_ls % 60))::int, date '2026-07-29')
       when (sched and r_ls < 4000) then least(d_reuniao + (3 + (r_ls % 20))::int, date '2026-07-29')
  end,
  least(greatest(d0, coalesce(d_reuniao, d_conn, d0)), date '2026-07-29'),
  owner_name,
  case when sched then (array['Camila Rocha','Otávio Lins','Priscila Amado'])[1 + (r_cl % 3)] end,
  case when noshow then 'noshow' when realizou then 'showed' when sched then 'confirmed' end,
  case when sched and owner_name = 'SDR IA' then 'conversations_ai'
       when sched and r_cl % 10 = 0 then 'booking_widget'
       when sched then 'calendar_page' end,
  case when sched then owner_name end,
  case when sched then 'Agenda Comercial Acme' end,
  case when tags like '%[cp]%' then 'form-aplicacao' else 'organico' end,
  case when venda then null
       when (is_conn and not sched and r_ls < 5500) then (array['Sem budget','Não é o momento','Não respondeu mais','Perfil fora do ICP'])[1 + (r_ls % 4)]
       when (not is_conn and r_ls < 1200) then 'Não atendeu / contato inválido'
       when (sched and r_ls < 4000) then (array['Achou caro','Vai pensar','Escolheu concorrente','Sumiu após a call'])[1 + (r_ls % 4)]
  end,
  'd0000000-0000-4000-8000-000000000001'
from j
on conflict (ghl_opportunity_id) do nothing;

-- ─── 4. Distribui parte da base pelos demais pipelines ──────────────────────
-- Sem isso a demo mostraria só 5 pipelines. Uma conta real tem funis paralelos.
with o as (
  select o.id, (c.custom_fields->>'demo_i')::int i
  from oportunidades o join contatos c on c.id = o.contato_id
  where o.workspace_id='d0000000-0000-4000-8000-000000000001'
    and o.pipeline_name in ('Pré-Vendas nMQL','Pré-Vendas MQL')
),
n as (select o.*, (((hashtext('pip2'||i::text) % 10000)+10000)%10000) r from o),
alvo as (
  select id,
    case when r < 1200 then array['smwSHOBdtMWNh64MMpBw','[fn] webinário']
         when r < 1600 then array['dz9ItDIo7qnEmM2wko3E','[fn] evento']
         when r < 2000 then array['fgh4CfZQ8Un9iRCsgPFw','Social Selling']
         when r < 2200 then array['tflq0utP0Yabm6B0v9Vr','Webinar PRO']
         when r < 2400 then array['Pns0NE0KtoJ6UhviKEU9','Incompleto']
         when r < 2500 then array['ssFI7L8fMRjjMmAKCaAU','[fn] sdr ia']
    end as p
  from n
)
update oportunidades t set pipeline_id = alvo.p[1], pipeline_name = alvo.p[2]
from alvo where t.id = alvo.id and alvo.p is not null;

-- ─── 5. Tags comportamentais ────────────────────────────────────────────────
-- O guard `tags not like '%verifica sdr%'` torna o passo idempotente: rodar
-- de novo não duplica tag.
with agg as (
  select c.id, (c.custom_fields->>'demo_i')::int i, c.tags, c.utm_campaign::int cmp,
         bool_or(o.data_no_show is not null) tem_noshow,
         bool_or(o.data_agendamento_reuniao is not null) tem_agend,
         bool_or(o.status='won') tem_venda,
         bool_or(o.data_conectado is not null) tem_conn
  from contatos c left join oportunidades o on o.contato_id = c.id
  where c.workspace_id='d0000000-0000-4000-8000-000000000001'
    and c.custom_fields ? 'demo_i'
    and c.tags not like '%verifica sdr%'
  group by 1,2,3,4
),
n as (
  select agg.*,
    (((hashtext('t1'||i::text) % 10000)+10000)%10000) t1,
    (((hashtext('t2'||i::text) % 10000)+10000)%10000) t2,
    (((hashtext('t3'||i::text) % 10000)+10000)%10000) t3,
    (((hashtext('t4'||i::text) % 10000)+10000)%10000) t4,
    (((hashtext('t5'||i::text) % 10000)+10000)%10000) t5,
    (((hashtext('t6'||i::text) % 10000)+10000)%10000) t6
  from agg
)
update contatos c set tags = concat_ws(',', c.tags,
  case when n.t1 < 8500 then 'verifica sdr' end,
  case when n.t2 < 6000 then 'apto-para-disparar' end,
  case when n.t3 < 3500 then 'novo fluxo' end,
  case when n.cmp in (2,3,12) then '[fn] webinário'
       when n.cmp = 9 then '[fn] evento'
       when n.cmp = 8 then 'social selling'
       when n.cmp = 6 then '[cp] masterclass'
       when n.cmp = 7 then '[cp] lançamento'
       when n.cmp = 10 then '[cp] indicação'
       when n.cmp = 11 then 'recuperação' end,
  case when n.t4 < 2800 then 'assistiu-webinario' end,
  case when n.t4 >= 2800 and n.t4 < 4600 then 'baixou-ebook' end,
  case when n.t5 < 1200 then 'lead-quente' end,
  case when n.t5 >= 1200 and n.t5 < 2100 then 'ticket-alto' end,
  case when n.t5 >= 8600 then 'sem-perfil' end,
  case when n.t6 < 300 then 'ja-cliente' end,
  case when n.tem_agend then 'sql' when n.tem_conn then 'nsql' end,
  case when n.tem_noshow then 'no-show' end,
  case when n.tem_agend and n.t6 >= 300 and n.t6 < 1800 then 'reagendou' end,
  case when n.tem_venda then 'cliente-ativo' end,
  case when not n.tem_conn then 'follow-up-'||(1 + (n.t6 % 5))::text end
)
from n where c.id = n.id;

-- ─── 6. Campos de qualificação (dão corpo ao LeadCard) ──────────────────────
with n as (
  select id,
    (((hashtext('q1'||(custom_fields->>'demo_i')) % 10000)+10000)%10000) q1,
    (((hashtext('q2'||(custom_fields->>'demo_i')) % 10000)+10000)%10000) q2,
    (((hashtext('q3'||(custom_fields->>'demo_i')) % 10000)+10000)%10000) q3
  from contatos
  where workspace_id='d0000000-0000-4000-8000-000000000001' and custom_fields ? 'demo_i'
)
update contatos c set
  faturamento_anual  = (array['Até R$ 100 mil','R$ 100 mil a R$ 300 mil','R$ 300 mil a R$ 600 mil','R$ 600 mil a R$ 1 milhão','R$ 1 mi a R$ 3 mi','Acima de R$ 3 mi','Ainda não faturo'])[1 + (n.q1 % 7)],
  como_nos_conheceu  = (array['Instagram','YouTube','Indicação de amigo','Anúncio no Facebook','Google','Podcast','Evento presencial','Já era aluno'])[1 + (n.q2 % 8)],
  situacao_atual     = (array['Tenho produto validado, quero escalar','Faturo mas não consigo previsibilidade','Estou começando agora','Tenho equipe mas falta processo','Travei no operacional','Perdi tração nos últimos meses'])[1 + (n.q3 % 6)],
  tipo_empresa       = (array['MEI','ME','Simples Nacional','Lucro Presumido','Ainda sem CNPJ'])[1 + (n.q1 % 5)],
  investe_trafego    = (array['Sim, mais de R$ 10 mil/mês','Sim, até R$ 5 mil/mês','Já investi e parei','Nunca investi'])[1 + (n.q2 % 4)],
  preciso_ajuda_para = (array['Estruturar funil de vendas','Escalar tráfego pago','Montar time comercial','Criar oferta de alto ticket','Organizar processo de pré-vendas'])[1 + (n.q3 % 5)],
  possiveis_objecoes = (array['Preço','Falta de tempo','Precisa falar com sócio','Já tentou algo parecido antes','Descrença no método'])[1 + (n.q1 % 5)],
  visao_6_meses      = (array['Dobrar o faturamento','Sair do operacional','Estruturar time','Lançar novo produto','Ter previsibilidade de caixa'])[1 + (n.q2 % 5)],
  perfil_inteligente = (array['Perfil A — pronto para investir','Perfil B — precisa de mais maturidade','Perfil C — fora do ICP','Perfil A — decisor com urgência','Perfil B — bom fit, timing ruim'])[1 + (n.q3 % 5)],
  print_instagram    = '@'||lower(translate(split_part(c.nome,' ',1),'áàâãéêíóôõúüç','aaaaeeiooouuc'))||'.oficial'
from n where c.id = n.id;

with n as (
  select o.id, (((hashtext('ia'||o.id::text) % 10000)+10000)%10000) r
  from oportunidades o
  where o.workspace_id='d0000000-0000-4000-8000-000000000001' and o.data_conectado is not null
)
update oportunidades o set
  resumo_ia = (array[
    'Lead demonstrou interesse claro, já fatura acima de R$ 300 mil/ano e busca previsibilidade. Objeção principal: agenda.',
    'Contato respondeu rápido mas está em fase inicial. Baixa maturidade para o ticket atual — sugerido nutrir.',
    'Empresário com time montado, travado no operacional. Fit alto para o Acelerador. Encaminhado para agendamento.',
    'Lead pediu material antes de conversar. Enviado case. Aguardando retorno há 3 dias.',
    'Já investe em tráfego e quer estruturar pré-vendas. Decisor único, sem necessidade de aprovação de sócio.',
    'Interesse morno. Respondeu duas mensagens e sumiu. Recomendado entrar em cadência de reengajamento.'
  ])[1 + (n.r % 6)],
  percepcao_closer = case when o.data_realizacao_vendas is not null then (array[
    'Call muito boa, lead engajado do início ao fim. Vai apresentar para o sócio.',
    'Achou o investimento alto mas entendeu o valor. Pediu proposta parcelada.',
    'Fit perfeito. Fechou na própria call.',
    'Lead chegou desalinhado sobre o que é o programa. Pré-vendas precisa ajustar o pitch.',
    'Precisa resolver questão financeira antes. Follow-up marcado para 30 dias.'
  ])[1 + (n.r % 5)] end
from n where o.id = n.id;

-- ─── 7. Oportunidades de Recuperação (leads antigos reativados) ─────────────
-- Duas ondas: os leads marcados com a tag `recuperação` e uma fatia de leads
-- perdidos há mais tempo.
with c as (
  select id, nome, email, owner_name, (custom_fields->>'demo_i')::int i,
         (custom_fields->>'demo_lead_ts')::timestamptz lead_ts
  from contatos
  where workspace_id='d0000000-0000-4000-8000-000000000001' and tags like '%recuperação%'
),
r as (
  select c.*,
    (((hashtext('rc'||i::text) % 10000)+10000)%10000) r_rc,
    (((hashtext('rc2'||i::text) % 10000)+10000)%10000) r_rc2,
    (((hashtext('rc3'||i::text) % 10000)+10000)%10000) r_rc3,
    (((hashtext('rc4'||i::text) % 10000)+10000)%10000) r_rc4
  from c
),
b as (
  select r.*, (lead_ts::date + (90 + (r_rc % 150))::int) as d_rec
  from r
  where (lead_ts::date + (90 + ((((hashtext('rc'||i::text) % 10000)+10000)%10000) % 150))::int) <= date '2026-07-15'
),
g as (
  select b.*, (r_rc2 < 4200) as reconn,
    (r_rc2 < 4200 and r_rc3 < 1900) as reagend,
    (r_rc2 < 4200 and r_rc3 < 1900 and r_rc4 < 5200) as rerealizou
  from b
),
h as (
  select g.*, (rerealizou and r_rc4 < 1500) as revenda,
    least(d_rec + (r_rc % 6)::int, date '2026-07-29') d_conn,
    least(d_rec + (2 + (r_rc3 % 9))::int, date '2026-07-29') d_agend
  from g
),
j as (select h.*, least(d_agend + (2 + (r_rc4 % 8))::int, date '2026-07-29') d_reuniao from h)
insert into oportunidades (
  ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo, valor, status,
  pipeline_id, pipeline_name, pipeline_stage_id, data_lead_recebido, data_criacao_contato,
  data_conectado, data_agendamento_reuniao, data_reuniao_agendada, data_reuniao_agendada_ts,
  data_reuniao_realizada, data_realizacao_vendas, data_no_show, data_fechado, data_perdido,
  data_ultima_atividade, sdr_name, vendedor_closer, appointment_status, agendamento_origem,
  opportunity_source, lost_reason, workspace_id
)
select
  'demo-r-'||lpad(i::text,6,'0'), id, nome, email, nome||' — Reativação Acme',
  7000 + (r_rc % 81) * 100,
  case when revenda then 'won'
       when reconn and not reagend and r_rc2 < 2600 then 'lost'
       when reagend and not revenda and r_rc4 < 4500 then 'lost'
       when not reconn and r_rc < 3000 then 'lost'
       else 'open' end,
  'Sn1Guqcm6zwZNTVOOf5L', 'Recuperação', 'demo-stage-rec-'||(1+(r_rc%5))::text,
  (d_rec + make_interval(hours => 9 + (r_rc % 10)))::timestamp at time zone 'America/Sao_Paulo',
  lead_ts,
  case when reconn then d_conn end,
  case when reagend then d_agend end,
  case when reagend then d_reuniao end,
  case when reagend then (d_reuniao + make_interval(hours => 10 + (r_rc4 % 8)))::timestamp at time zone 'America/Sao_Paulo' end,
  case when rerealizou then d_reuniao end,
  case when rerealizou then d_reuniao end,
  case when reagend and not rerealizou then d_reuniao end,
  case when revenda then least(d_reuniao + (2 + (r_rc % 10))::int, date '2026-07-29') end,
  case when revenda then null
       when reconn and not reagend and r_rc2 < 2600 then least(d_conn + (10 + (r_rc % 30))::int, date '2026-07-29')
       when reagend and r_rc4 < 4500 then least(d_reuniao + (3 + (r_rc % 15))::int, date '2026-07-29')
       when not reconn and r_rc < 3000 then least(d_rec + (25 + (r_rc % 40))::int, date '2026-07-29')
  end,
  least(greatest(d_rec, coalesce(d_reuniao, d_conn, d_rec)), date '2026-07-29'),
  owner_name,
  case when reagend then (array['Camila Rocha','Otávio Lins','Priscila Amado'])[1 + (r_rc3 % 3)] end,
  case when reagend and not rerealizou then 'noshow' when rerealizou then 'showed' when reagend then 'confirmed' end,
  case when reagend then 'calendar_page' end,
  'reativacao-base',
  case when revenda then null
       when reconn and not reagend and r_rc2 < 2600 then (array['Já resolveu com outro','Sem budget agora','Pediu para não contatar mais'])[1 + (r_rc % 3)]
       when reagend and r_rc4 < 4500 then (array['Achou caro','Vai pensar','Sumiu após a call'])[1 + (r_rc % 3)]
       when not reconn and r_rc < 3000 then 'Base fria — sem resposta'
  end,
  'd0000000-0000-4000-8000-000000000001'
from j
on conflict (ghl_opportunity_id) do nothing;

with cand as (
  select c.id, c.nome, c.email, c.owner_name, (c.custom_fields->>'demo_i')::int i,
         (c.custom_fields->>'demo_lead_ts')::timestamptz lead_ts,
         (((hashtext('rx'||(c.custom_fields->>'demo_i')) % 10000)+10000)%10000) rx,
         (((hashtext('rx2'||(c.custom_fields->>'demo_i')) % 10000)+10000)%10000) rx2
  from contatos c
  where c.workspace_id='d0000000-0000-4000-8000-000000000001'
    and c.tags not like '%recuperação%'
    and (c.custom_fields->>'demo_lead_ts')::timestamptz < '2026-03-01'
    and exists (select 1 from oportunidades o where o.contato_id = c.id and o.status='lost')
),
sel as (select * from cand where rx < 3200),
b as (select sel.*, least(lead_ts::date + (100 + (rx % 130))::int, date '2026-07-20') d_rec from sel),
g as (select b.*, (rx2 < 3800) reconn, (rx2 < 3800 and rx < 900) reagend from b)
insert into oportunidades (
  ghl_opportunity_id, contato_id, nome_contato, email_contato, titulo, valor, status,
  pipeline_id, pipeline_name, pipeline_stage_id, data_lead_recebido, data_criacao_contato,
  data_conectado, data_agendamento_reuniao, data_reuniao_agendada, data_perdido,
  data_ultima_atividade, sdr_name, opportunity_source, lost_reason, workspace_id
)
select
  'demo-r2-'||lpad(i::text,6,'0'), id, nome, email, nome||' — Reativação Acme',
  7000 + (rx % 61) * 100,
  case when reconn and rx2 < 1800 then 'lost' when not reconn and rx < 1400 then 'lost' else 'open' end,
  'Sn1Guqcm6zwZNTVOOf5L', 'Recuperação', 'demo-stage-rec-'||(1+(rx%5))::text,
  (d_rec + make_interval(hours => 9 + (rx % 10)))::timestamp at time zone 'America/Sao_Paulo', lead_ts,
  case when reconn then least(d_rec + (rx % 5)::int, date '2026-07-29') end,
  case when reagend then least(d_rec + (3 + (rx % 7))::int, date '2026-07-29') end,
  case when reagend then least(d_rec + (8 + (rx % 10))::int, date '2026-07-29') end,
  case when reconn and rx2 < 1800 then least(d_rec + (15 + (rx % 30))::int, date '2026-07-29')
       when not reconn and rx < 1400 then least(d_rec + (30 + (rx % 30))::int, date '2026-07-29') end,
  least(d_rec + (rx % 20)::int, date '2026-07-29'), owner_name, 'reativacao-base',
  case when reconn and rx2 < 1800 then 'Não avançou na reativação'
       when not reconn and rx < 1400 then 'Base fria — sem resposta' end,
  'd0000000-0000-4000-8000-000000000001'
from g
on conflict (ghl_opportunity_id) do nothing;

-- ─── 8. Vendas ──────────────────────────────────────────────────────────────
-- ⚠️ REGRA DE OURO DO PROJETO: uma oportunidade só conta como venda quando
--    `vendas_fechamento.data_pagamento_entrada` está preenchida.
--    `oportunidades.data_fechado` sozinho NÃO confirma pagamento.
--    Ver docs/CONCEITOS-NEGOCIO.md e docs/VENDAS-FECHAMENTO.md
-- `valor_faturado` é coluna GERADA (entrada + parcelas × valor_parcela):
--    não pode ser inserida diretamente.
with o as (
  select o.id, o.contato_id, o.nome_contato, o.valor, o.data_fechado, o.vendedor_closer,
         (c.custom_fields->>'demo_i')::int i
  from oportunidades o join contatos c on c.id = o.contato_id
  where o.workspace_id='d0000000-0000-4000-8000-000000000001'
    and o.status='won' and o.pipeline_name <> 'Recuperação'
),
r as (
  select o.*,
    (((hashtext('pg'||i::text) % 10000)+10000)%10000) r_pg,
    (((hashtext('uf'||i::text) % 10000)+10000)%10000) r_uf,
    (((hashtext('pd'||i::text) % 10000)+10000)%10000) r_pd
  from o
),
v as (
  select r.*,
    case when r_pg < 2500 then 0 when r_pg < 6000 then 10 else 12 end as parcelas,
    round(valor * (case when r_pg < 2500 then 1.0 when r_pg < 6000 then 0.30 else 0.20 end), 2) as entrada
  from r
)
insert into vendas_fechamento (
  oportunidade_id, contato_id, nome_contratante, cpf_cnpj_contratante,
  municipio, estado_uf, produto_vendido, forma_pagamento,
  valor_entrada, numero_parcelas, valor_parcela,
  data_pagamento_entrada, data_da_assinatura_do_contrato,
  op_link_do_contrato_assinado, link_gravacao_call_vendas,
  pagamentos, comprovantes, closer_nome, closer_email, origem, workspace_id
)
select
  id, contato_id, nome_contato,
  lpad(((i*37)%999)::text,3,'0')||'.'||lpad(((i*73)%999)::text,3,'0')||'.'||lpad(((i*17)%999)::text,3,'0')||'-'||lpad(((i*11)%99)::text,2,'0'),
  (array['São Paulo','Rio de Janeiro','Belo Horizonte','Curitiba','Porto Alegre','Salvador','Recife','Fortaleza','Goiânia','Florianópolis','Campinas','Brasília'])[1 + (r_uf % 12)],
  (array['SP','RJ','MG','PR','RS','BA','PE','CE','GO','SC','SP','DF'])[1 + (r_uf % 12)],
  (array['Acelerador Acme — Anual','Acelerador Acme — Premium','Mentoria Acme 1:1'])[1 + (r_pd % 3)],
  case when parcelas = 0 then 'PIX à vista' when r_pg < 6000 then 'Cartão de crédito' else 'Boleto parcelado' end,
  entrada, parcelas,
  case when parcelas = 0 then 0 else round((valor - entrada) / parcelas, 2) end,
  (data_fechado + make_interval(hours => 10 + (r_pg % 8)))::timestamp at time zone 'America/Sao_Paulo',
  data_fechado,
  'https://demo.acme.test/contratos/'||lpad(i::text,6,'0')||'.pdf',
  'https://demo.acme.test/calls/'||lpad(i::text,6,'0'),
  jsonb_build_array(jsonb_build_object('data', data_fechado::text, 'valor', entrada, 'sinal', true))
    || case when parcelas = 0 then '[]'::jsonb
       else (select jsonb_agg(jsonb_build_object(
              'data', (data_fechado + (p * interval '1 month'))::date::text,
              'valor', round((valor - entrada)/parcelas, 2), 'sinal', false))
             from generate_series(1, parcelas) p) end,
  jsonb_build_array(jsonb_build_object('url','https://demo.acme.test/comprovantes/'||lpad(i::text,6,'0')||'.jpg','tipo','entrada')),
  vendedor_closer,
  lower(translate(split_part(vendedor_closer,' ',1),'áàâãéêíóôõúüç','aaaaeeiooouuc'))||'@acmedemo.test',
  'ghl', 'd0000000-0000-4000-8000-000000000001'
from v
on conflict (oportunidade_id) do nothing;

insert into vendas_fechamento (
  oportunidade_id, contato_id, nome_contratante, municipio, estado_uf, produto_vendido,
  forma_pagamento, valor_entrada, numero_parcelas, valor_parcela,
  data_pagamento_entrada, data_da_assinatura_do_contrato,
  pagamentos, comprovantes, closer_nome, closer_email, origem, workspace_id
)
select o.id, o.contato_id, o.nome_contato,
  (array['São Paulo','Curitiba','Recife','Belo Horizonte','Goiânia'])[1 + (abs(hashtext(o.id::text)) % 5)],
  (array['SP','PR','PE','MG','GO'])[1 + (abs(hashtext(o.id::text)) % 5)],
  'Acelerador Acme — Anual', 'Cartão de crédito',
  round(o.valor * 0.30, 2), 10, round(o.valor * 0.70 / 10, 2),
  (o.data_fechado + interval '11 hours')::timestamp at time zone 'America/Sao_Paulo',
  o.data_fechado,
  jsonb_build_array(jsonb_build_object('data', o.data_fechado::text, 'valor', round(o.valor*0.30,2), 'sinal', true)),
  '[]'::jsonb, o.vendedor_closer,
  lower(translate(split_part(o.vendedor_closer,' ',1),'áàâãéêíóôõúüç','aaaaeeiooouuc'))||'@acmedemo.test',
  'ghl', 'd0000000-0000-4000-8000-000000000001'
from oportunidades o
where o.workspace_id='d0000000-0000-4000-8000-000000000001'
  and o.pipeline_name='Recuperação' and o.status='won' and o.vendedor_closer is not null
on conflict (oportunidade_id) do nothing;

-- ─── 9. Fila do discador de Pré-Vendas e Recuperação ────────────────────────
with o as (
  select o.id, o.contato_id, o.data_lead_recebido, o.pipeline_name,
         case when o.pipeline_name = 'Recuperação' then 'recuperacao' else 'pre_vendas' end escopo,
         (((hashtext('ds'||o.id::text) % 10000)+10000)%10000) r,
         (current_date - o.data_lead_recebido::date) idade
  from oportunidades o
  where o.workspace_id='d0000000-0000-4000-8000-000000000001'
    and o.status='open'
    and o.pipeline_name in ('Pré-Vendas MQL','Auto Agendamento','Recuperação')
),
s as (select o.*, (idade <= 3) as novo, least(8, 1 + (idade / 4)) as tentativas from o)
insert into discagem_scores (
  oportunidade_id, contato_id, workspace_id, escopo, score, estado, camada, canal_sugerido,
  componente_dom, razao, score_sinal, score_urgencia, score_tentativas, score_fonte,
  score_qualificacao, numero_tentativa, data_entrada_lead, data_retorno_previsto, updated_at
)
select id, contato_id, 'd0000000-0000-4000-8000-000000000001', escopo,
  case when novo then 620 + (r % 300) else 90 + (r % 260) end,
  case when novo then 'ligue_hoje' else 'mensagem' end,
  case when novo then 'lead_novo' else 'cadencia' end,
  'call',
  case when novo then 'urgencia' else 'tentativas' end,
  case when novo then 'Lead novo — ligar ainda hoje' else 'Cadência ativa — '||tentativas::text||'ª tentativa' end,
  (r % 200), case when novo then 380 + (r % 120) else (r % 60) end,
  greatest(0, 200 - tentativas * 25), (r % 90), (r % 150),
  tentativas, data_lead_recebido, (current_date + ((r % 4))::int)::timestamptz, now()
from s
on conflict do nothing;
