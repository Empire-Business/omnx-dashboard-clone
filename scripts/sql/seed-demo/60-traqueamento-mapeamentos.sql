-- ============================================================================
-- Tenant de Demonstração — 60 · Traqueamento, mapeamentos GHL e breakdown Meta
-- ============================================================================
-- Fecha as lacunas encontradas ao navegar a demo pela primeira vez: o módulo
-- Traqueamento estava com as abas vazias, a tela de Configuração GHL sem
-- mapeamento de pipeline/estágio, e a aba Meta Ads sem breakdown por região.
--
-- PRÉ-REQUISITOS: rodar antes 00, 10, 20, 30, 40 e 50.
--
-- ⚠️ workspace alvo: d0000000-0000-4000-8000-000000000001
--
-- POR QUE ISTO É UM ARQUIVO SEPARADO
--   Estas tabelas não alimentam KPI nenhum — são catálogo e configuração.
--   Ficaram de fora do plano original justamente por isso, e só apareceram
--   como buraco quando alguém abriu as telas. Ficam isoladas aqui para deixar
--   claro que são cosmético/configuração, não base de cálculo.
-- ============================================================================

do $$
declare v_ws uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  -- ─── 1. Vocabulário de traqueamento ───────────────────────────────────────
  insert into utm_objectives (workspace_id, nome, objective_code) values
    (v_ws,'Aplicação','O1'),(v_ws,'Captura de lead','O2'),(v_ws,'Remarketing','O3'),
    (v_ws,'Reconhecimento','O4'),(v_ws,'Evento','O5')
  on conflict do nothing;

  -- Um termo por criativo, no mesmo intervalo usado no arquivo 30
  insert into utm_terms (workspace_id, nome, utm_term)
  select v_ws, 'CR-'||n::text, n from generate_series(101,124) n
  on conflict do nothing;

  -- Os slugs precisam bater com os códigos PG usados no utm_term do arquivo 10
  insert into utm_slugs (workspace_id, nome, slug) values
    (v_ws,'Página de Aplicação','PG12'),
    (v_ws,'Página do Desafio','PG24'),
    (v_ws,'Página do Webinário','PG27'),
    (v_ws,'Página da Masterclass','PG32'),
    (v_ws,'Página do Lançamento','PG41'),
    (v_ws,'Bio do Instagram','PG09'),
    (v_ws,'Página do Evento SP','PG53'),
    (v_ws,'Indique e Ganhe','PG14')
  on conflict do nothing;

  -- ─── 2. Processos de venda e vínculo com as campanhas ─────────────────────
  insert into sales_processes (workspace_id, nome) values
    (v_ws,'Aplicação → Call de Diagnóstico'),
    (v_ws,'Webinário → Oferta ao vivo'),
    (v_ws,'Desafio → Call de Fechamento'),
    (v_ws,'Indicação → Contato Direto')
  on conflict do nothing;

  insert into sales_process_assignments (workspace_id, utm_campaign_id, sales_process_id)
  select v_ws, uc.id, sp.id
  from utm_campaigns uc
  join sales_processes sp on sp.workspace_id = v_ws and sp.nome =
    case
      when uc.utm_campaign in (2,3,12) then 'Webinário → Oferta ao vivo'
      when uc.utm_campaign = 4          then 'Desafio → Call de Fechamento'
      when uc.utm_campaign = 10         then 'Indicação → Contato Direto'
      else 'Aplicação → Call de Diagnóstico'
    end
  where uc.workspace_id = v_ws
  on conflict do nothing;
end $$;

-- ─── 3. Catálogo de anúncios ────────────────────────────────────────────────
-- Derivado das combinações de traqueamento que REALMENTE existem em `contatos`,
-- em vez de inventado: assim o catálogo casa com o tráfego da demo.
insert into ads_catalog (
  workspace_id, month_number, objective_name, objective_code, public_name, public_code,
  utm_source, creative_id, page_name, page_code, utm_campaign_number,
  utm_medium_name, utm_medium_number, utm_term, url, shortened_url
)
select distinct on (c.utm_source, substring(c.utm_term from 'CR-[0-9]+'), c.utm_campaign)
  'd0000000-0000-4000-8000-000000000001',
  (substring(c.utm_term from '^M([0-9]+)'))::int,
  'Aplicação', 'O1', s.nome, s.public_code, c.utm_source,
  substring(c.utm_term from 'CR-[0-9]+'),
  sl.nome, sl.slug, c.utm_campaign::int, md.nome, md.utm_medium, c.utm_term,
  'https://acme.test/'||lower(sl.slug)||'?utm_source='||c.utm_source||'&utm_campaign='||c.utm_campaign||'&utm_term='||c.utm_term,
  'https://acme.link/'||lower(substring(c.utm_term from 'CR-[0-9]+'))
from contatos c
join utm_sources s on s.workspace_id='d0000000-0000-4000-8000-000000000001' and s.utm_source=c.utm_source
left join utm_slugs sl on sl.workspace_id='d0000000-0000-4000-8000-000000000001' and sl.slug = substring(c.utm_term from 'PG[0-9]+$')
left join utm_mediums md on md.workspace_id='d0000000-0000-4000-8000-000000000001' and md.utm_medium = c.utm_medium::int
where c.workspace_id='d0000000-0000-4000-8000-000000000001' and c.utm_term is not null
on conflict do nothing;

-- ─── 4. Catálogo orgânico ───────────────────────────────────────────────────
insert into organic_catalog (
  workspace_id, profile, utm_source_name, utm_source, utm_campaign_name, utm_campaign,
  utm_medium_name, utm_medium, utm_term_name, utm_term, utm_content, url, shortened_url
)
select distinct on (sp.utm_source, uc.utm_campaign)
  'd0000000-0000-4000-8000-000000000001', '@acmeeducacao',
  sp.nome, sp.utm_source, uc.nome, uc.utm_campaign,
  md.nome, md.utm_medium, 'Orgânico', null, 'bio-link',
  'https://acme.test/'||coalesce(uc.page_code,'PG12')||'?utm_source='||sp.utm_source||'&utm_campaign='||uc.utm_campaign,
  'https://acme.link/org-'||sp.utm_source||'-'||uc.utm_campaign
from utm_sources_plain sp
cross join utm_campaigns uc
left join utm_mediums md on md.workspace_id='d0000000-0000-4000-8000-000000000001' and md.utm_medium = 5
where sp.workspace_id='d0000000-0000-4000-8000-000000000001'
  and uc.workspace_id='d0000000-0000-4000-8000-000000000001'
  and uc.utm_campaign in (2,3,8,10,12)
on conflict do nothing;

insert into ads_campaigns (workspace_id, objective_code, objective_name, page_name, campaign_date, code)
select 'd0000000-0000-4000-8000-000000000001', 'O1', 'Aplicação', uc.nome,
       (date '2025-08-01' + (uc.utm_campaign * 21))::date,
       'O1_'||lower(replace(translate(uc.nome,'áàâãéêíóôõúüç','aaaaeeiooouuc'),' ','-'))||'_'||uc.utm_campaign::text
from utm_campaigns uc where uc.workspace_id='d0000000-0000-4000-8000-000000000001'
on conflict do nothing;

-- ─── 5. Mapeamento GHL de pipelines e estágios ──────────────────────────────
-- Valores válidos (ver eb-dash2/src/types/ghl-config.ts):
--   system_category: pre_vendas | vendas | recuperacao | excluir | outro
--   system_stage:    novo | conectado | agendado | reuniao_realizada | fechado | perdido
insert into ghl_pipeline_mappings (workspace_id, ghl_pipeline_id, ghl_pipeline_name, system_category, is_excluded)
values
 ('d0000000-0000-4000-8000-000000000001','sqchZ2kIIZljR6wJ6bko','Pré-Vendas nMQL','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','QQXqQvYEkwafSCAB1ybC','Pré-Vendas MQL','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','ZWuCjEXM2VDyLCx8CtGU','Vendas SQL','vendas',false),
 ('d0000000-0000-4000-8000-000000000001','Sn1Guqcm6zwZNTVOOf5L','Recuperação','recuperacao',true),
 ('d0000000-0000-4000-8000-000000000001','8DAr28W959nKNsmTL8qy','Auto Agendamento','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','H7Nz08hgySOJ9upSYSPL','Cami','outro',false),
 ('d0000000-0000-4000-8000-000000000001','smwSHOBdtMWNh64MMpBw','[fn] webinário','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','dz9ItDIo7qnEmM2wko3E','[fn] evento','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','fgh4CfZQ8Un9iRCsgPFw','Social Selling','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','tflq0utP0Yabm6B0v9Vr','Webinar PRO','pre_vendas',false),
 ('d0000000-0000-4000-8000-000000000001','Pns0NE0KtoJ6UhviKEU9','Incompleto','excluir',true),
 ('d0000000-0000-4000-8000-000000000001','ssFI7L8fMRjjMmAKCaAU','[fn] sdr ia','pre_vendas',false)
on conflict do nothing;

insert into ghl_stage_mappings (workspace_id, ghl_pipeline_id, ghl_stage_id, ghl_stage_name, system_stage)
select 'd0000000-0000-4000-8000-000000000001', p.pid, 'demo-stage-'||s.ord::text, s.nome, s.sys
from (values
  ('sqchZ2kIIZljR6wJ6bko'),('QQXqQvYEkwafSCAB1ybC'),('ZWuCjEXM2VDyLCx8CtGU'),
  ('Sn1Guqcm6zwZNTVOOf5L'),('8DAr28W959nKNsmTL8qy'),('H7Nz08hgySOJ9upSYSPL'),
  ('smwSHOBdtMWNh64MMpBw'),('dz9ItDIo7qnEmM2wko3E'),('fgh4CfZQ8Un9iRCsgPFw'),
  ('tflq0utP0Yabm6B0v9Vr'),('Pns0NE0KtoJ6UhviKEU9'),('ssFI7L8fMRjjMmAKCaAU')
) p(pid)
cross join (values
  (1,'Lead novo','novo'), (2,'Em contato','conectado'), (3,'Reunião agendada','agendado'),
  (4,'Reunião realizada','reuniao_realizada'), (5,'Fechado','fechado'), (6,'Perdido','perdido')
) s(ord, nome, sys)
on conflict do nothing;

-- ─── 6. Breakdown regional do Meta Ads ──────────────────────────────────────
-- Alimenta o CPV/ROAS por estado. Os nomes de região precisam existir em
-- `meta_ads_region_mapping` (tabela GLOBAL, já preenchida) para o painel
-- conseguir traduzir para UF.
--
-- A soma do breakdown fica ~1% abaixo do total dos insights, de propósito:
-- é assim que a própria API da Meta se comporta (breakdown nunca fecha 100%
-- com o total), e forçar a igualdade deixaria o dado com cara de sintético.
with regioes(nome, peso) as (values
  ('São Paulo (state)', 0.34), ('Rio de Janeiro (state)', 0.14), ('Minas Gerais (state)', 0.11),
  ('Paraná (state)', 0.08), ('Rio Grande do Sul (state)', 0.07), ('Santa Catarina (state)', 0.06),
  ('Bahia (state)', 0.06), ('Goiás (state)', 0.05), ('Pernambuco (state)', 0.05), ('Ceará (state)', 0.04)
),
base as (
  select i.id, i.workspace_id, i.spend, i.impressions, i.clicks, i.reach,
         (((hashtext('bd'||i.id::text) % 1000)+1000)%1000) r
  from meta_ads_insights i
  where i.workspace_id='d0000000-0000-4000-8000-000000000001'
)
insert into meta_ads_insights_breakdowns (
  insights_id, workspace_id, breakdown_type, region, country,
  spend, impressions, clicks, reach
)
select b.id, b.workspace_id, 'region', g.nome, 'BR',
  round(b.spend * (g.peso * (0.85 + (b.r % 300)/1000.0))::numeric, 2),
  round(b.impressions * (g.peso * (0.85 + (b.r % 300)/1000.0)))::int,
  round(b.clicks * (g.peso * (0.85 + (b.r % 300)/1000.0)))::int,
  round(coalesce(b.reach,0) * (g.peso * (0.85 + (b.r % 300)/1000.0)))::int
from base b cross join regioes g
on conflict do nothing;
