-- =============================================================================
-- SEED DEMO — 20-meta-ads.sql
-- =============================================================================
--
-- O QUE ESTE ARQUIVO FAZ
--   Popula a integração Meta Ads do TENANT DE DEMONSTRAÇÃO com dados
--   100% FICTÍCIOS, gerados por fórmula. Nenhum número aqui veio da API da Meta
--   nem de qualquer cliente real — servem apenas para que as telas do dashboard
--   (Tráfego, Aquisição, Criativos, Relatórios) tenham o que exibir numa demo.
--
--   Tabelas populadas:
--     1. meta_ads_campaigns     — 5 campanhas
--     2. meta_ads_insights      — 1 linha por (anúncio, dia), ~2.060 linhas
--     3. meta_ads_account_daily — 1 linha por dia (fonte de verdade do
--                                 "Investimento Total" do painel)
--     4. meta_ads_permalinks    — 24 criativos (CR-101 … CR-124)
--     5. meta_ads_sync_log      — 10 execuções de sync 'success'
--
-- WORKSPACE ALVO
--   Definido UMA ÚNICA VEZ no bloco \set logo abaixo. Todas as escritas são
--   filtradas por ele; o script nunca toca em linha de outro workspace.
--
-- PERÍODO E VOLUME
--   2025-08-01 a 2026-07-29 (363 dias). Investimento total: R$ 480.000,00,
--   distribuído por mês conforme a CTE `targets`. ~5.180 leads no acumulado.
--
-- IDEMPOTÊNCIA
--   Todas as inserções usam ON CONFLICT nas unique keys reais das tabelas.
--   Rodar duas vezes não duplica nada e não altera os totais. A geração é
--   determinística (hashtext sobre ad_id+data — sem random()), então duas
--   execuções produzem exatamente os mesmos números.
--
-- COMO RODAR
--   psql "$DATABASE_URL" -f scripts/sql/seed-demo/20-meta-ads.sql
--
--   Para rodar fora do psql (SQL Editor do Supabase, MCP, etc.), o \set não é
--   interpretado: troque as duas ocorrências de :'demo_workspace_id' / :'demo_account_id'
--   por literais, ou pré-processe o arquivo com um envsubst equivalente.
--
-- PRÉ-REQUISITOS
--   - O workspace já existe em `workspaces`.
--   - O par (workspace_id, account_id) já existe em `workspace_meta_ad_accounts`.
--     O trigger `trg_validar_meta_ad_account_workspace` rejeita insight cuja
--     conta não esteja vinculada ao workspace.
--   - Os public_codes P11/P12/P13/P14/P21/P22 existem em `utm_sources`.
--
-- CONTRATO DE NOMENCLATURA (NÃO ALTERAR SEM LER)
--   `ad_name` segue exatamente `M{n}_O1_{PUBCODE}_CR-{n}_PG{n}`.
--   O frontend de Criativos faz split('_') e usa parts[2] como código de público,
--   e extrai o criativo com a regex /(CR|AN)-(\d+)/. Quebrar o formato zera a aba.
-- =============================================================================

-- ▼▼▼ ÚNICO PONTO DE CONFIGURAÇÃO ▼▼▼
\set demo_workspace_id 'd0000000-0000-4000-8000-000000000001'
\set demo_account_id   'act_demo_acme'
-- ▲▲▲ ÚNICO PONTO DE CONFIGURAÇÃO ▲▲▲

\echo 'Seed Meta Ads (demo) — workspace' :'demo_workspace_id'

BEGIN;

-- 1) CAMPANHAS ----------------------------------------------------------------
-- Nomes espelham as linhas de `utm_campaigns` do workspace demo (1..5), para que
-- o vínculo campanha -> funil fique coerente entre o CRM e o Meta.
WITH p AS (
  SELECT :'demo_workspace_id'::uuid AS workspace_id, :'demo_account_id'::text AS account_id
), v(campaign_id, name, status, objective, daily_budget, start_time, created_time) AS (VALUES
 ('demo-camp-1','O1_aplicacao-_01-08-2025_ABO_QUENTE_ENVOLVIMENTO_ACELERADOR','PAUSED','OUTCOME_LEADS',420.00,'2025-08-01T00:00:00-03:00'::timestamptz,'2025-07-28T14:12:00-03:00'::timestamptz),
 ('demo-camp-2','O1_webinario-_15-09-2025_CBO_FRIO_INTERESSES_ESCALA','PAUSED','OUTCOME_LEADS',380.00,'2025-09-15T00:00:00-03:00','2025-09-11T09:35:00-03:00'),
 ('demo-camp-3','O1_masterclass-_02-01-2026_ABO_FRIO_LOOKALIKE_MASTERCLASS','PAUSED','OUTCOME_LEADS',560.00,'2026-01-02T00:00:00-03:00','2025-12-26T17:48:00-03:00'),
 ('demo-camp-4','O1_desafio-_10-03-2026_ABO_FRIO_INTERESSES_DESAFIO7D','ACTIVE','OUTCOME_LEADS',640.00,'2026-03-10T00:00:00-03:00','2026-03-05T11:20:00-03:00'),
 ('demo-camp-5','O1_remarketing-_01-05-2026_CBO_QUENTE_REMARKETING_ACELERADOR','ACTIVE','OUTCOME_LEADS',300.00,'2026-05-01T00:00:00-03:00','2026-04-27T16:02:00-03:00')
)
INSERT INTO meta_ads_campaigns
  (campaign_id, account_id, name, status, objective, daily_budget, start_time, created_time, workspace_id)
SELECT v.campaign_id, p.account_id, v.name, v.status, v.objective, v.daily_budget,
       v.start_time, v.created_time, p.workspace_id
FROM v CROSS JOIN p
ON CONFLICT (workspace_id, campaign_id) DO UPDATE SET
  name=EXCLUDED.name, status=EXCLUDED.status, objective=EXCLUDED.objective,
  daily_budget=EXCLUDED.daily_budget, start_time=EXCLUDED.start_time,
  created_time=EXCLUDED.created_time, updated_at=now();

-- 2) INSIGHTS -----------------------------------------------------------------
-- Uma linha por (anúncio, dia) nos dias em que o anúncio esteve no ar.
--
-- `tier` é a qualidade do criativo (0 = melhor, 4 = pior) e é o que produz um
-- ranking com variação real: entra como bônus no CTR e na taxa de conversão,
-- então o CPL final varia ~2,3x entre o melhor e o pior criativo.
--
-- `w0` é o peso de verba do anúncio; a verba diária de cada anúncio é o peso
-- normalizado contra o alvo do mês, então a soma do mês fecha exatamente no
-- valor de `targets` (o resíduo de centavos do arredondamento é jogado na
-- maior linha do mês).
WITH p AS (
  SELECT :'demo_workspace_id'::uuid AS workspace_id, :'demo_account_id'::text AS account_id
), ads(ad_id, cr, mcode, camp, camp_name, pub, pg, tier, w0, d0, d1) AS (VALUES
 ('demo-ad-101','CR-101','M1','demo-camp-1','O1_aplicacao-_01-08-2025_ABO_QUENTE_ENVOLVIMENTO_ACELERADOR','P11','PG12',1,1.20,'2025-08-01'::date,'2025-11-30'::date),
 ('demo-ad-102','CR-102','M1','demo-camp-1','O1_aplicacao-_01-08-2025_ABO_QUENTE_ENVOLVIMENTO_ACELERADOR','P12','PG24',3,0.85,'2025-08-01','2025-10-15'),
 ('demo-ad-103','CR-103','M1','demo-camp-1','O1_aplicacao-_01-08-2025_ABO_QUENTE_ENVOLVIMENTO_ACELERADOR','P11','PG12',0,1.45,'2025-08-10','2025-12-31'),
 ('demo-ad-104','CR-104','M1','demo-camp-1','O1_aplicacao-_01-08-2025_ABO_QUENTE_ENVOLVIMENTO_ACELERADOR','P13','PG27',4,0.70,'2025-08-01','2025-09-20'),
 ('demo-ad-105','CR-105','M1','demo-camp-1','O1_aplicacao-_01-08-2025_ABO_QUENTE_ENVOLVIMENTO_ACELERADOR','P12','PG12',2,1.00,'2025-09-01','2025-12-31'),
 ('demo-ad-106','CR-106','M2','demo-camp-2','O1_webinario-_15-09-2025_CBO_FRIO_INTERESSES_ESCALA','P12','PG24',1,1.25,'2025-09-15','2026-02-28'),
 ('demo-ad-107','CR-107','M2','demo-camp-2','O1_webinario-_15-09-2025_CBO_FRIO_INTERESSES_ESCALA','P14','PG32',2,0.95,'2025-09-15','2025-12-20'),
 ('demo-ad-108','CR-108','M2','demo-camp-2','O1_webinario-_15-09-2025_CBO_FRIO_INTERESSES_ESCALA','P11','PG24',0,1.50,'2025-10-05','2026-02-28'),
 ('demo-ad-109','CR-109','M2','demo-camp-2','O1_webinario-_15-09-2025_CBO_FRIO_INTERESSES_ESCALA','P22','PG27',4,0.65,'2025-11-01','2026-01-31'),
 ('demo-ad-110','CR-110','M3','demo-camp-3','O1_masterclass-_02-01-2026_ABO_FRIO_LOOKALIKE_MASTERCLASS','P13','PG32',1,1.30,'2026-01-02','2026-05-31'),
 ('demo-ad-111','CR-111','M3','demo-camp-3','O1_masterclass-_02-01-2026_ABO_FRIO_LOOKALIKE_MASTERCLASS','P11','PG12',2,1.05,'2026-01-02','2026-04-15'),
 ('demo-ad-112','CR-112','M3','demo-camp-3','O1_masterclass-_02-01-2026_ABO_FRIO_LOOKALIKE_MASTERCLASS','P12','PG24',0,1.55,'2026-01-15','2026-05-31'),
 ('demo-ad-113','CR-113','M3','demo-camp-3','O1_masterclass-_02-01-2026_ABO_FRIO_LOOKALIKE_MASTERCLASS','P21','PG27',3,0.80,'2026-02-01','2026-05-31'),
 ('demo-ad-114','CR-114','M4','demo-camp-4','O1_desafio-_10-03-2026_ABO_FRIO_INTERESSES_DESAFIO7D','P14','PG32',1,1.35,'2026-03-10','2026-07-29'),
 ('demo-ad-115','CR-115','M4','demo-camp-4','O1_desafio-_10-03-2026_ABO_FRIO_INTERESSES_DESAFIO7D','P11','PG24',3,0.90,'2026-03-10','2026-06-15'),
 ('demo-ad-116','CR-116','M4','demo-camp-4','O1_desafio-_10-03-2026_ABO_FRIO_INTERESSES_DESAFIO7D','P12','PG12',0,1.60,'2026-04-01','2026-07-29'),
 ('demo-ad-117','CR-117','M5','demo-camp-5','O1_remarketing-_01-05-2026_CBO_QUENTE_REMARKETING_ACELERADOR','P13','PG27',2,1.10,'2026-05-01','2026-07-29'),
 ('demo-ad-118','CR-118','M5','demo-camp-5','O1_remarketing-_01-05-2026_CBO_QUENTE_REMARKETING_ACELERADOR','P22','PG32',4,0.75,'2026-05-10','2026-07-29')
), targets(m, t) AS (VALUES
 ('2025-08',28000),('2025-09',30000),('2025-10',32000),('2025-11',38000),('2025-12',30000),('2026-01',42000),
 ('2026-02',44000),('2026-03',46000),('2026-04',48000),('2026-05',50000),('2026-06',52000),('2026-07',40000)
), days AS (
  SELECT d::date AS d FROM generate_series('2025-08-01'::date,'2026-07-29'::date,'1 day') d
),
base AS (
  SELECT a.*, d.d, to_char(d.d,'YYYY-MM') AS m,
    a.w0 * (80 + (abs(hashtext(a.ad_id||d.d::text)) % 41))::numeric / 100 AS w
  FROM ads a JOIN days d ON d.d BETWEEN a.d0 AND a.d1
),
tot AS (SELECT m, sum(w) AS sw FROM base GROUP BY m),
sp AS (
  SELECT b.*, t.t AS tgt, round(t.t * b.w / tot.sw, 2) AS spend0,
    row_number() OVER (PARTITION BY b.m ORDER BY b.w DESC, b.ad_id) AS rn
  FROM base b JOIN tot ON tot.m=b.m JOIN targets t ON t.m=b.m
),
resid AS (SELECT m, tgt - sum(spend0) AS diff FROM sp GROUP BY m, tgt),
fin AS (
  SELECT sp.*, (sp.spend0 + CASE WHEN sp.rn=1 THEN r.diff ELSE 0 END) AS spend
  FROM sp JOIN resid r ON r.m=sp.m
),
met AS (
  SELECT f.*,
    -- CPM entre R$ 24,00 e R$ 44,99
    24 + (abs(hashtext('cpm'||f.ad_id||f.d::text)) % 2100)::numeric/100 AS cpm,
    -- CTR: piso de 0,80% + bônus de qualidade + ruído diário
    (0.80 + CASE f.tier WHEN 0 THEN 0.55 WHEN 1 THEN 0.32 WHEN 2 THEN 0.15 WHEN 3 THEN 0.05 ELSE 0.01 END
      + (abs(hashtext('ctr'||f.ad_id||f.d::text)) % 22)::numeric/100) AS ctr,
    -- Taxa de conversão de landing page view -> lead: 5,0% a 8,2%
    (5.0 + CASE f.tier WHEN 0 THEN 2.4 WHEN 1 THEN 1.5 WHEN 2 THEN 0.7 WHEN 3 THEN 0.2 ELSE 0.0 END
      + (abs(hashtext('cvr'||f.ad_id||f.d::text)) % 9)::numeric/10) AS cvr,
    (115 + (abs(hashtext('fq'||f.ad_id||f.d::text)) % 126))::numeric/100 AS frequency
  FROM fin f
),
c1 AS (SELECT met.*, GREATEST(round(met.spend/met.cpm*1000)::int,1) AS impressions FROM met),
-- ceil (e não round) garante que o CTR realizado nunca caia abaixo do piso de 0,80%
c2 AS (SELECT c.*, GREATEST(ceil(c.impressions*c.ctr/100)::int,1) AS clicks FROM c1 c),
c3 AS (SELECT c.*, GREATEST(round(c.clicks*(66+(abs(hashtext('lc'||c.ad_id||c.d::text))%9))::numeric/100)::int,1) AS link_clicks FROM c2 c),
c4 AS (SELECT c.*, GREATEST(round(c.link_clicks*(56+(abs(hashtext('lp'||c.ad_id||c.d::text))%9))::numeric/100)::int,0) AS lpv FROM c3 c),
c5 AS (
  SELECT c.*, round(c.lpv*c.cvr/100)::int AS leads,
    round(c.impressions * (38+(abs(hashtext('vv'||c.ad_id||c.d::text))%6))::numeric/100)::int AS video_views,
    GREATEST(round(c.impressions/c.frequency)::int,1) AS reach
  FROM c4 c
)
INSERT INTO meta_ads_insights (
  account_id, campaign_id, adset_id, ad_id, date, hour,
  spend, impressions, clicks, reach, frequency, ctr, cpc, cpm, cpp,
  campaign_name, adset_name, ad_name,
  landing_page_views, video_views, link_clicks, leads, onsite_web_leads, fb_pixel_leads,
  fetched_at, workspace_id)
SELECT
  p.account_id, c.camp, 'demo-adset-'||substr(c.ad_id,9), c.ad_id, c.d, NULL,
  c.spend, c.impressions, c.clicks, c.reach, c.frequency,
  round(c.clicks::numeric/c.impressions*100, 4),
  round(c.spend/c.clicks, 4),
  round(c.spend/c.impressions*1000, 4),
  round(c.spend/c.reach*1000, 4),
  c.camp_name,
  'CJ_'||c.pub||'_'||c.mcode,
  c.mcode||'_O1_'||c.pub||'_'||c.cr||'_'||c.pg,
  c.lpv, c.video_views, c.link_clicks, c.leads, c.leads, c.leads,
  now(), p.workspace_id
FROM c5 c CROSS JOIN p
ON CONFLICT (workspace_id, ad_id, date) DO UPDATE SET
  spend=EXCLUDED.spend, impressions=EXCLUDED.impressions, clicks=EXCLUDED.clicks,
  reach=EXCLUDED.reach, frequency=EXCLUDED.frequency, ctr=EXCLUDED.ctr, cpc=EXCLUDED.cpc,
  cpm=EXCLUDED.cpm, cpp=EXCLUDED.cpp, campaign_name=EXCLUDED.campaign_name,
  adset_name=EXCLUDED.adset_name, ad_name=EXCLUDED.ad_name,
  landing_page_views=EXCLUDED.landing_page_views, video_views=EXCLUDED.video_views,
  link_clicks=EXCLUDED.link_clicks, leads=EXCLUDED.leads,
  onsite_web_leads=EXCLUDED.onsite_web_leads, fb_pixel_leads=EXCLUDED.fb_pixel_leads,
  updated_at=now();

-- 3) ACCOUNT DAILY ------------------------------------------------------------
-- Fonte de verdade do "Investimento Total" do painel. Derivada da soma dos
-- insights do dia, então as duas telas nunca divergem.
WITH p AS (
  SELECT :'demo_workspace_id'::uuid AS workspace_id, :'demo_account_id'::text AS account_id
)
INSERT INTO meta_ads_account_daily (workspace_id, account_id, date, spend, account_currency, fetched_at)
SELECT i.workspace_id, i.account_id, i.date, sum(i.spend), 'BRL', now()
FROM meta_ads_insights i JOIN p ON p.workspace_id=i.workspace_id AND p.account_id=i.account_id
GROUP BY i.workspace_id, i.account_id, i.date
ON CONFLICT (workspace_id, account_id, date) DO UPDATE SET
  spend=EXCLUDED.spend, account_currency='BRL', fetched_at=now(), updated_at=now();

-- 4) PERMALINKS ---------------------------------------------------------------
-- Uma linha por criativo CR-101..CR-124. A PK da tabela é `ad_id` (não há
-- unique em creative_code), por isso o casamento é 1:1 demo-ad-1NN <-> CR-1NN.
-- CR-119..CR-124 existem como cadastro sem veiculação (não têm insights).
WITH p AS (SELECT :'demo_workspace_id'::uuid AS workspace_id)
INSERT INTO meta_ads_permalinks (ad_id, creative_code, permalink_url, instagram_permalink_url, fetched_at, workspace_id)
SELECT 'demo-ad-'||i, 'CR-'||i,
       'https://www.facebook.com/acmeeducacao/posts/DEMOCR'||i,
       'https://www.instagram.com/p/DEMOCR'||i||'/',
       now(), p.workspace_id
FROM generate_series(101,124) i CROSS JOIN p
ON CONFLICT (ad_id) DO UPDATE SET
  creative_code=EXCLUDED.creative_code, permalink_url=EXCLUDED.permalink_url,
  instagram_permalink_url=EXCLUDED.instagram_permalink_url, fetched_at=now();

-- 5) SYNC LOG -----------------------------------------------------------------
-- A tabela não tem unique key natural, então o id é derivado de md5() para que
-- a re-execução caia no ON CONFLICT em vez de acumular linhas.
WITH p AS (SELECT :'demo_workspace_id'::uuid AS workspace_id)
INSERT INTO meta_ads_sync_log
  (id, started_at, finished_at, status, records_fetched, records_inserted, records_updated, execution_time_ms, workspace_id)
SELECT
  md5('demo-meta-sync-'||i)::uuid,
  ('2026-07-29T06:00:00-03:00'::timestamptz - (i || ' days')::interval),
  ('2026-07-29T06:00:00-03:00'::timestamptz - (i || ' days')::interval)
    + ((18 + (abs(hashtext('sync'||i))%25)) || ' seconds')::interval,
  'success',
  40 + (abs(hashtext('f'||i)) % 25),
  4  + (abs(hashtext('i'||i)) % 9),
  36 + (abs(hashtext('u'||i)) % 18),
  18000 + (abs(hashtext('t'||i)) % 25000),
  p.workspace_id
FROM generate_series(1,10) i CROSS JOIN p
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICAÇÃO (opcional — roda depois do COMMIT, não altera nada)
-- Esperado: 5 campanhas | 2.060 insights (18 anúncios) | 363 dias |
--           24 permalinks | 10 logs | R$ 480.000,00 nas duas fontes |
--           ~5.180 leads | 0 ad_name fora do formato | 0 divergência
-- =============================================================================
WITH p AS (SELECT :'demo_workspace_id'::uuid AS w)
SELECT 'campanhas'            AS metrica, count(*)::text AS valor FROM meta_ads_campaigns, p WHERE workspace_id=w
UNION ALL SELECT 'insights',              count(*)::text FROM meta_ads_insights, p WHERE workspace_id=w
UNION ALL SELECT 'anuncios_distintos',    count(DISTINCT ad_id)::text FROM meta_ads_insights, p WHERE workspace_id=w
UNION ALL SELECT 'dias_account_daily',    count(*)::text FROM meta_ads_account_daily, p WHERE workspace_id=w
UNION ALL SELECT 'permalinks',            count(*)::text FROM meta_ads_permalinks, p WHERE workspace_id=w
UNION ALL SELECT 'sync_log',              count(*)::text FROM meta_ads_sync_log, p WHERE workspace_id=w
UNION ALL SELECT 'spend_insights',        sum(spend)::text FROM meta_ads_insights, p WHERE workspace_id=w
UNION ALL SELECT 'spend_account_daily',   sum(spend)::text FROM meta_ads_account_daily, p WHERE workspace_id=w
UNION ALL SELECT 'leads',                 sum(leads)::text FROM meta_ads_insights, p WHERE workspace_id=w
UNION ALL SELECT 'ad_name_fora_do_formato', count(*)::text FROM meta_ads_insights, p
  WHERE workspace_id=w AND ad_name !~ '^M[0-9]+_O1_P[0-9]{2}_CR-[0-9]+_PG[0-9]+$'
UNION ALL SELECT 'datas_futuras',         count(*)::text FROM meta_ads_insights, p WHERE workspace_id=w AND date > CURRENT_DATE
UNION ALL SELECT 'divergencia_insights_vs_daily', count(*)::text FROM (
  SELECT i.date FROM (SELECT date, sum(spend) s FROM meta_ads_insights, p WHERE workspace_id=w GROUP BY date) i
  FULL JOIN (SELECT date, spend s FROM meta_ads_account_daily, p WHERE workspace_id=w) a ON a.date=i.date
  WHERE coalesce(i.s,-1) <> coalesce(a.s,-2)) z
ORDER BY 1;
