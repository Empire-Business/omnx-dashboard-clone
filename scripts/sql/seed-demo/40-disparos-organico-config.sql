-- =============================================================================
-- SEED DEMO — Disparos, Investimento Orgânico e Configurações auxiliares
-- =============================================================================
--
-- Popula, para UM workspace de demonstração, os módulos auxiliares do dashboard:
--
--   1. Módulo Disparos ....... disparos, disparo_tags,
--                              disparo_campos_custom, disparo_campos_custom_valores
--   2. Preço do WhatsApp ..... whatsapp_pricing_config
--   3. Investimento orgânico . organic_investment_items, organic_investments
--   4. SDR IA ................ sdr_ia_config
--   5. Sub-apps .............. workspace_settings (app_slug = 'criativos')
--   6. Clara ................. clara_workspace_settings
--   7. Origens de UTM ........ utm_origins, utm_source_origin_assignments
--   8. Tags de disparo ....... UPDATE em contatos.tags (só do workspace demo)
--
-- PRÉ-REQUISITOS (rodar os seeds anteriores primeiro):
--   - O workspace e o usuário de demonstração já existem.
--   - Os canais orgânicos 'iorg-1'..'iorg-5' já existem em utm_sources_plain.
--   - O núcleo do CRM já foi gerado (contatos com date_created preenchido).
--     Sem contatos, os passos 1-7 rodam normalmente e o passo 8 simplesmente
--     não marca ninguém — basta rodar o arquivo de novo depois.
--
-- IDEMPOTENTE: rodar N vezes produz exatamente o mesmo estado final.
--   - Tabelas com unique key usam ON CONFLICT ... DO UPDATE.
--   - organic_investment_items/organic_investments não têm unique key no schema,
--     então são recriadas (DELETE + INSERT) dentro do escopo do workspace demo.
--   - As tags de disparo em contatos são recalculadas por hash determinístico
--     (md5 do id do contato), então o mesmo contato cai sempre na mesma campanha
--     e no mesmo desfecho.
--
-- ISOLAMENTO: toda escrita é filtrada por workspace_id. Este arquivo nunca lê
-- nem escreve linha de outro workspace. NÃO troque os filtros por algo mais
-- amplo: há tags parecidas ('disparo-...') em workspaces reais de produção.
--
-- COMO RODAR: cole no SQL Editor do Supabase, ou
--   psql "$DATABASE_URL" -f scripts/sql/seed-demo/40-disparos-organico-config.sql
--
-- -----------------------------------------------------------------------------
-- ⚠️  session_replication_role = 'replica'
-- -----------------------------------------------------------------------------
-- O passo 8 roda com os triggers de usuário desligados NA SESSÃO (via SET LOCAL,
-- revertido no COMMIT — não é DDL, não afeta outras conexões). Dois motivos:
--
--   a) `update_contatos_updated_at` (BEFORE UPDATE) força updated_at = now().
--      A RPC rpc_disparo_metricas data o trigger de cada campanha por
--      contatos.updated_at — não existe coluna de data na tag. Sem desligar o
--      trigger, todas as campanhas apareceriam disparadas "hoje" e qualquer
--      filtro de período no painel de Disparos voltaria zero.
--   b) `trg_attribution_on_contact` (AFTER UPDATE OF tags) enfileiraria jobs
--      na fila real ghl_api_jobs a cada contato tocado.
--
-- Consequência aceita: para os contatos de demo marcados por uma campanha,
-- updated_at passa a valer a data da campanha, não a da última escrita na linha.
-- Por isso cada contato participa de no máximo UMA campanha (ver passo 8).
-- =============================================================================


-- =============================================================================
-- ÚNICO PONTO DE CONFIGURAÇÃO
-- =============================================================================
\set demo_workspace_id 'd0000000-0000-4000-8000-000000000001'
\set demo_user_id      'd0000000-0000-4000-8000-000000000002'

-- Fora do psql (SQL Editor do Supabase), o \set acima é ignorado: troque as
-- duas ocorrências abaixo por uma constante e siga usando `cfg` em tudo.
CREATE OR REPLACE TEMP VIEW cfg AS
SELECT :'demo_workspace_id'::uuid AS ws,
       :'demo_user_id'::uuid      AS demo_user;


-- =============================================================================
-- 1. MÓDULO DISPAROS — campanhas + tags
-- =============================================================================
-- created_at de cada campanha é a data em que o disparo aconteceu: é ela que
-- vira a data do trigger nos contatos (passo 8) e alimenta o filtro de período.
-- Os nomes das tags NÃO levam prefixo de demonstração: elas aparecem na
-- interface e precisam parecer tags reais do GHL.

WITH camp(slug, nome, descricao, cor, tipo, disparado_em) AS (VALUES
 ('reativacao-set25',      'Reativação Base Geral — Set/25',    'Reengajamento da base fria de leads sem contato há mais de 90 dias.', '#820ad1', 'marketing', '2025-09-08T10:00:00-03:00'),
 ('webinario-out25',       'Convite Webinário Escala — Out/25', 'Convite para o webinário "Escala Previsível" com inscrição por link.', '#0c7a3a', 'marketing', '2025-10-14T09:30:00-03:00'),
 ('black-friday-nov25',    'Oferta Black Friday — Nov/25',      'Oferta especial de Black Friday para base qualificada.',              '#d01d1c', 'marketing', '2025-11-24T08:00:00-03:00'),
 ('ano-novo-jan26',        'Retomada Ano Novo — Jan/26',        'Retomada de conversas paradas no fim do ano.',                        '#9b5a00', 'marketing', '2026-01-12T10:00:00-03:00'),
 ('lembrete-reuniao-mar26','Lembrete de Reunião — Mar/26',      'Lembrete transacional de reunião agendada (24h antes).',              '#5c0f8b', 'utility',   '2026-03-03T08:00:00-03:00'),
 ('turma-nova-mai26',      'Aviso de Turma Nova — Mai/26',      'Aviso de abertura da turma de maio para lista de espera.',            '#0c7a3a', 'marketing', '2026-05-05T09:00:00-03:00'),
 ('pesquisa-jul26',        'Pesquisa de Satisfação — Jul/26',   'Pesquisa NPS com alunos e leads atendidos no semestre.',              '#777777', 'utility',   '2026-07-07T09:00:00-03:00')
),
ins AS (
  INSERT INTO disparos (workspace_id, nome, descricao, cor, tipo_mensagem, is_active, created_at, updated_at)
  SELECT cfg.ws, c.nome, c.descricao, c.cor, c.tipo, true, c.disparado_em::timestamptz, c.disparado_em::timestamptz
  FROM camp c CROSS JOIN cfg
  ON CONFLICT (workspace_id, nome) DO UPDATE
    SET descricao     = EXCLUDED.descricao,
        cor           = EXCLUDED.cor,
        tipo_mensagem = EXCLUDED.tipo_mensagem,
        created_at    = EXCLUDED.created_at
  RETURNING id, nome
),
mapa AS (SELECT ins.id AS disparo_id, c.slug FROM ins JOIN camp c ON c.nome = ins.nome),
-- Os 6 significados aceitos pelo CHECK de disparo_tags e pelo type
-- DisparoSignificado do frontend (eb-dash2/src/types/disparos.ts).
sig(significado, prefixo) AS (VALUES
 ('trigger',       ''),
 ('respondeu',     'respondeu-'),
 ('parou',         'parou-'),
 ('erro',          'erro-'),
 ('nao_respondeu', 'nao-respondeu-'),
 ('converteu',     'converteu-')
)
INSERT INTO disparo_tags (workspace_id, disparo_id, significado, tag)
SELECT cfg.ws, m.disparo_id, s.significado, s.prefixo || 'disparo-' || m.slug
FROM mapa m CROSS JOIN sig s CROSS JOIN cfg
ON CONFLICT (workspace_id, disparo_id, significado) DO UPDATE SET tag = EXCLUDED.tag;


-- =============================================================================
-- 1b. Campos customizados das campanhas
-- =============================================================================
-- 'Mensagens enviadas' e 'Custo real' são reconciliados no passo 8, depois que
-- os contatos são marcados — aqui entram só como valores iniciais.

WITH campos(nome_campo, tipo, ord) AS (VALUES
 ('Público-alvo',       'texto',  1),
 ('Mensagens enviadas', 'numero', 2),
 ('Custo real',         'moeda',  3),
 ('Data do disparo',    'data',   4)
),
ins_campos AS (
  INSERT INTO disparo_campos_custom (workspace_id, nome_campo, tipo, sort_order)
  SELECT cfg.ws, c.nome_campo, c.tipo, c.ord FROM campos c CROSS JOIN cfg
  ON CONFLICT (workspace_id, nome_campo) DO UPDATE
    SET tipo = EXCLUDED.tipo, sort_order = EXCLUDED.sort_order
  RETURNING id, nome_campo
),
vals(disparo_nome, nome_campo, valor) AS (VALUES
 ('Reativação Base Geral — Set/25',    'Público-alvo',    'Base fria 90+ dias'),
 ('Reativação Base Geral — Set/25',    'Data do disparo', '2025-09-08'),
 ('Convite Webinário Escala — Out/25', 'Público-alvo',    'Leads MQL sem reunião'),
 ('Convite Webinário Escala — Out/25', 'Data do disparo', '2025-10-14'),
 ('Oferta Black Friday — Nov/25',      'Público-alvo',    'Base geral qualificada'),
 ('Oferta Black Friday — Nov/25',      'Data do disparo', '2025-11-24'),
 ('Retomada Ano Novo — Jan/26',        'Público-alvo',    'Conversas paradas em dez/25'),
 ('Retomada Ano Novo — Jan/26',        'Data do disparo', '2026-01-12'),
 ('Lembrete de Reunião — Mar/26',      'Público-alvo',    'Reuniões agendadas 24h'),
 ('Lembrete de Reunião — Mar/26',      'Data do disparo', '2026-03-03'),
 ('Aviso de Turma Nova — Mai/26',      'Público-alvo',    'Lista de espera turma mai/26'),
 ('Aviso de Turma Nova — Mai/26',      'Data do disparo', '2026-05-05'),
 ('Pesquisa de Satisfação — Jul/26',   'Público-alvo',    'Atendidos no 1º semestre'),
 ('Pesquisa de Satisfação — Jul/26',   'Data do disparo', '2026-07-07')
)
INSERT INTO disparo_campos_custom_valores (workspace_id, disparo_id, campo_id, valor)
SELECT cfg.ws, d.id, ic.id, v.valor
FROM vals v
CROSS JOIN cfg
JOIN disparos d            ON d.nome = v.disparo_nome AND d.workspace_id = cfg.ws
JOIN ins_campos ic         ON ic.nome_campo = v.nome_campo
ON CONFLICT (disparo_id, campo_id) DO UPDATE SET valor = EXCLUDED.valor;


-- =============================================================================
-- 2. PREÇO DO WHATSAPP (alimenta custo_estimado da rpc_disparo_metricas)
-- =============================================================================
INSERT INTO whatsapp_pricing_config (workspace_id, preco_marketing, preco_utility)
SELECT ws, 0.0625, 0.0080 FROM cfg
ON CONFLICT (workspace_id) DO UPDATE
  SET preco_marketing = EXCLUDED.preco_marketing,
      preco_utility   = EXCLUDED.preco_utility,
      updated_at      = now();


-- =============================================================================
-- 3. SDR IA — filtros de identificação do universo da IA
-- =============================================================================
-- Formato exigido por useSdrIaConfig.ts: {"include": [...], "exclude": [...]}.
-- Pipelines são IDs do GHL. Filtros vazios = sem restrição.
INSERT INTO sdr_ia_config (workspace_id, tags_filter, pipelines_filter, utm_source_filter, utm_campaign_filter)
SELECT ws,
  '{"include": [], "exclude": []}'::jsonb,
  -- include: Pré-Vendas MQL, Pré-Vendas nMQL, Auto Agendamento
  -- exclude: Vendas SQL, Cami
  '{"include": ["QQXqQvYEkwafSCAB1ybC","sqchZ2kIIZljR6wJ6bko","8DAr28W959nKNsmTL8qy"], "exclude": ["ZWuCjEXM2VDyLCx8CtGU","H7Nz08hgySOJ9upSYSPL"]}'::jsonb,
  '{"include": [], "exclude": []}'::jsonb,
  '{"include": [], "exclude": []}'::jsonb
FROM cfg
ON CONFLICT (workspace_id) DO UPDATE
  SET tags_filter         = EXCLUDED.tags_filter,
      pipelines_filter    = EXCLUDED.pipelines_filter,
      utm_source_filter   = EXCLUDED.utm_source_filter,
      utm_campaign_filter = EXCLUDED.utm_campaign_filter,
      updated_at          = now();


-- =============================================================================
-- 4. CLARA — preferências do workspace
-- =============================================================================
-- ⚠️ model_id NUNCA pode ser anthropic/* nem openai/* (CHECK no banco + regra do
-- projeto, ver CLAUDE.md). Padrão: qwen/qwen3.6-plus via OpenRouter.
INSERT INTO clara_workspace_settings (
  workspace_id, is_enabled, persistent_instructions, business_context, response_rules,
  allowed_modules, allowed_tools, analysis_depth, max_response_tokens,
  conversation_retention_days, scheduled_report_instructions, model_id, updated_by)
SELECT ws, true,
  'Responda sempre em português do Brasil, com números arredondados e foco em ação prática.',
  'Acme Educação (demo) — infoprodutora de cursos e mentorias de alto ticket na área de gestão. Ticket médio entre R$ 5.000 e R$ 18.000. Funil: lead de tráfego pago e orgânico, qualificação por pré-vendas, reunião de diagnóstico e fechamento com closer.',
  'Nunca invente números: se o dado não existir no período, diga que não há dado. Destaque variações acima de 15% e proponha no máximo 3 ações por relatório.',
  ARRAY['trafego','aquisicao','organico','prevendas','vendas','criativos','relatorios']::text[],
  ARRAY['get_kpis','compare_periods','get_funnel','get_creatives','get_campaigns','get_channels','get_trend','get_benchmarks']::text[],
  'standard', 2048, 365,
  'Relatório semanal toda segunda-feira: comparar a semana anterior com a retrasada, destacar CPMQL, taxa de agendamento e faturamento.',
  'qwen/qwen3.6-plus',
  demo_user
FROM cfg
ON CONFLICT (workspace_id) DO UPDATE
  SET persistent_instructions       = EXCLUDED.persistent_instructions,
      business_context              = EXCLUDED.business_context,
      response_rules                = EXCLUDED.response_rules,
      allowed_modules               = EXCLUDED.allowed_modules,
      allowed_tools                 = EXCLUDED.allowed_tools,
      scheduled_report_instructions = EXCLUDED.scheduled_report_instructions,
      model_id                      = EXCLUDED.model_id,
      updated_at                    = now();


-- =============================================================================
-- 5. SUB-APPS — workspace_settings
-- =============================================================================
-- Chaves conforme WorkspaceCreativeSettings (eb-dash2/src/types/creatives.ts).
-- default_criteria_id fica de fora de propósito: pertence ao seed do sub-app
-- Criativos, que é quem conhece os ids reais dos critérios.
INSERT INTO workspace_settings (workspace_id, app_slug, settings)
SELECT ws, 'criativos',
  '{"creative_review_day":"tuesday","creative_review_time":"10:00","dashboard_kpis":["spend","leads","cpl","mqls","cpmql","roas"]}'::jsonb
FROM cfg
ON CONFLICT (workspace_id, app_slug) DO UPDATE
  SET settings   = workspace_settings.settings || EXCLUDED.settings,
      updated_at = now();


-- =============================================================================
-- 6. ORIGENS DE UTM (filtro de origem da aba Orgânico)
-- =============================================================================
WITH origens(nome) AS (VALUES ('Redes Sociais'), ('Indicação'), ('E-mail/CRM'), ('Comunidade')),
ins AS (
  INSERT INTO utm_origins (workspace_id, nome)
  SELECT cfg.ws, o.nome FROM origens o CROSS JOIN cfg
  ON CONFLICT (workspace_id, nome) DO UPDATE SET updated_at = now()
  RETURNING id, nome
),
vinc(utm_source, origem) AS (VALUES
  ('iorg-1', 'Redes Sociais'),   -- Instagram Orgânico
  ('iorg-2', 'Redes Sociais'),   -- YouTube Orgânico
  ('iorg-3', 'Indicação'),
  ('iorg-4', 'E-mail/CRM'),      -- Lista de E-mail
  ('iorg-5', 'Comunidade')       -- Grupo de WhatsApp
)
INSERT INTO utm_source_origin_assignments (workspace_id, utm_source, origin_id)
SELECT cfg.ws, v.utm_source, i.id
FROM vinc v CROSS JOIN cfg JOIN ins i ON i.nome = v.origem
ON CONFLICT (workspace_id, utm_source) DO UPDATE
  SET origin_id = EXCLUDED.origin_id, updated_at = now();


-- =============================================================================
-- 7. INVESTIMENTO ORGÂNICO — itens de custo + 12 meses de lançamento
-- =============================================================================
-- Nenhuma das duas tabelas tem unique key, então recria dentro do workspace.
-- organic_investments.year_month é COLUNA GERADA: não pode entrar no INSERT.
-- Total mensal: R$ 16.280 (2025-08) crescendo 1,8% ao mês até 2026-07.

DELETE FROM organic_investments      WHERE workspace_id = (SELECT ws FROM cfg);
DELETE FROM organic_investment_items WHERE workspace_id = (SELECT ws FROM cfg);

WITH itens(name, category, utm_source, recurrence, ord, base) AS (VALUES
 ('Social Media',                       'social_media', 'iorg-1', 'monthly', 1, 4200.00),
 ('Editor de Vídeo',                    'video',        'iorg-2', 'monthly', 2, 3800.00),
 ('Redator / Copywriter',               'copywriter',   'iorg-4', 'monthly', 3, 2600.00),
 ('Designer de Conteúdo',               'design',       'iorg-1', 'monthly', 4, 2200.00),
 ('Ferramenta de Agendamento',          'other',        NULL,     'monthly', 5,  480.00),
 ('Gestão de Comunidade WhatsApp',      'other',        'iorg-5', 'monthly', 6, 1400.00),
 ('Programa de Indicação — Bonificação','other',        'iorg-3', 'monthly', 7, 1600.00)
),
ins AS (
  INSERT INTO organic_investment_items (workspace_id, name, category, utm_source, recurrence, is_active, sort_order)
  SELECT cfg.ws, i.name, i.category, i.utm_source, i.recurrence, true, i.ord
  FROM itens i CROSS JOIN cfg
  RETURNING id, name, utm_source
),
meses AS (SELECT generate_series(0, 11) AS n)
INSERT INTO organic_investments (workspace_id, item_id, period_start, period_end, utm_source, amount, description)
SELECT cfg.ws, ins.id,
  (DATE '2025-08-01' + (m.n || ' month')::interval)::date,
  ((DATE '2025-08-01' + (m.n || ' month')::interval) + INTERVAL '1 month - 1 day')::date,
  ins.utm_source,
  ROUND(i.base * (1 + 0.018 * m.n)::numeric, 2),
  'Custo mensal de equipe orgânica (dados de demonstração)'
FROM meses m CROSS JOIN cfg JOIN ins ON true JOIN itens i ON i.name = ins.name;


-- =============================================================================
-- 8. TAGS DE DISPARO NOS CONTATOS
-- =============================================================================
-- Sem isto, o painel de Disparos mostra 7 campanhas zeradas: a métrica sai da
-- rpc_disparo_metricas, que cruza disparo_tags com contatos.tags.
--
-- Regras de sorteio (determinístico por md5 do id do contato):
--   - elegível: contato criado ANTES da data da campanha;
--   - cada contato entra em no máximo UMA campanha, sorteada entre as 3
--     primeiras campanhas posteriores à sua entrada (ver nota sobre
--     updated_at no cabeçalho; o teto de 3 evita que as campanhas recentes
--     concentrem quase toda a base);
--   - 55% dos elegíveis formam o público-alvo; 65% desses recebem o trigger;
--   - desfecho de quem recebeu o trigger: 28% respondeu, 60% não respondeu,
--     4% erro, 3% parou, 2% converteu, 3% sem desfecho (só trigger).
--
-- A limpeza prévia usa a lista real de tags em disparo_tags DO WORKSPACE, e não
-- um LIKE '%disparo-%': existem tags parecidas em workspaces reais, e o padrão
-- por texto é frágil.

BEGIN;
SET LOCAL session_replication_role = 'replica';

WITH cfg_tx AS (SELECT ws, demo_user FROM cfg),
tags_do_ws AS (
  SELECT lower(btrim(tag)) AS tag FROM disparo_tags, cfg_tx WHERE workspace_id = cfg_tx.ws
),
elig AS (
  SELECT c.id AS contato_id, d.id AS disparo_id, d.created_at AS ref,
    ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY d.created_at)              AS rn,
    (('x' || substr(md5(c.id::text || 'pick' || d.id::text), 1, 7))::bit(28)::int)          AS pick,
    (('x' || substr(md5(c.id::text || 'a'    || d.id::text), 1, 7))::bit(28)::int %  1000)  AS b_alvo,
    (('x' || substr(md5(c.id::text || 'b'    || d.id::text), 1, 7))::bit(28)::int %  1000)  AS b_trigger,
    (('x' || substr(md5(c.id::text || 'c'    || d.id::text), 1, 7))::bit(28)::int % 10000)  AS b_desfecho
  FROM contatos c
  CROSS JOIN cfg_tx
  JOIN disparos d ON d.workspace_id = c.workspace_id
  WHERE c.workspace_id = cfg_tx.ws
    AND d.workspace_id = cfg_tx.ws
    AND c.date_created < d.created_at
),
escolhido AS (
  SELECT DISTINCT ON (contato_id) * FROM elig WHERE rn <= 3 ORDER BY contato_id, pick
),
trig AS (
  SELECT e.*,
    CASE WHEN e.b_desfecho < 2800 THEN 'respondeu'
         WHEN e.b_desfecho < 8800 THEN 'nao_respondeu'
         WHEN e.b_desfecho < 9200 THEN 'erro'
         WHEN e.b_desfecho < 9500 THEN 'parou'
         WHEN e.b_desfecho < 9700 THEN 'converteu'
         ELSE NULL END AS sig
  FROM escolhido e
  WHERE e.b_alvo < 550 AND e.b_trigger < 650
),
tags_por_contato AS (
  SELECT t.contato_id, array_agg(DISTINCT x.tag) AS novas_tags, t.ref AS disparado_em
  FROM trig t
  CROSS JOIN LATERAL (
    SELECT dtg.tag FROM disparo_tags dtg
      WHERE dtg.disparo_id = t.disparo_id AND dtg.significado = 'trigger'
    UNION ALL
    SELECT dt2.tag FROM disparo_tags dt2
      WHERE dt2.disparo_id = t.disparo_id AND dt2.significado = t.sig
  ) x
  GROUP BY t.contato_id, t.ref
)
UPDATE contatos c SET
  -- tags é TEXT separado por vírgula, sem espaço depois da vírgula.
  -- Remove as tags de disparo anteriores (idempotência) e concatena as novas,
  -- preservando todas as tags do núcleo do CRM.
  tags = NULLIF(array_to_string(
     ARRAY(SELECT btrim(t)
             FROM unnest(string_to_array(COALESCE(c.tags, ''), ',')) t
            WHERE btrim(t) <> ''
              AND lower(btrim(t)) NOT IN (SELECT tag FROM tags_do_ws))
     || COALESCE(tpc.novas_tags, ARRAY[]::text[]), ','), ''),
  -- Data do trigger para a rpc_disparo_metricas, com jitter de até 10h.
  updated_at = CASE
    WHEN tpc.disparado_em IS NULL THEN c.updated_at
    ELSE tpc.disparado_em
         + ((('x' || substr(md5(c.id::text), 1, 7))::bit(28)::int % 600) || ' minutes')::interval
  END
FROM (SELECT c2.id FROM contatos c2, cfg_tx WHERE c2.workspace_id = cfg_tx.ws) alvo
LEFT JOIN tags_por_contato tpc ON tpc.contato_id = alvo.id
WHERE c.id = alvo.id
  AND c.workspace_id = (SELECT ws FROM cfg_tx);

COMMIT;


-- =============================================================================
-- 8b. Reconciliação dos campos custom com o resultado real
-- =============================================================================
WITH m AS (
  SELECT disparo_id, trigger_count, ROUND(custo_estimado, 2) AS custo
  FROM rpc_disparo_metricas(NULL, NULL), cfg
  WHERE workspace_id = cfg.ws
)
UPDATE disparo_campos_custom_valores v
SET valor = CASE cc.nome_campo
              WHEN 'Mensagens enviadas' THEN m.trigger_count::text
              WHEN 'Custo real'         THEN m.custo::text
            END,
    updated_at = now()
FROM m, disparo_campos_custom cc, cfg
WHERE v.workspace_id = cfg.ws
  AND v.disparo_id   = m.disparo_id
  AND cc.id          = v.campo_id
  AND cc.nome_campo IN ('Mensagens enviadas', 'Custo real');


-- =============================================================================
-- 9. VERIFICAÇÃO
-- =============================================================================
SELECT 'disparos' AS tabela, count(*) FROM disparos, cfg WHERE workspace_id = cfg.ws
UNION ALL SELECT 'disparo_tags',                  count(*) FROM disparo_tags, cfg                  WHERE workspace_id = cfg.ws
UNION ALL SELECT 'disparo_campos_custom',         count(*) FROM disparo_campos_custom, cfg         WHERE workspace_id = cfg.ws
UNION ALL SELECT 'disparo_campos_custom_valores', count(*) FROM disparo_campos_custom_valores, cfg WHERE workspace_id = cfg.ws
UNION ALL SELECT 'whatsapp_pricing_config',       count(*) FROM whatsapp_pricing_config, cfg       WHERE workspace_id = cfg.ws
UNION ALL SELECT 'organic_investment_items',      count(*) FROM organic_investment_items, cfg      WHERE workspace_id = cfg.ws
UNION ALL SELECT 'organic_investments',           count(*) FROM organic_investments, cfg           WHERE workspace_id = cfg.ws
UNION ALL SELECT 'sdr_ia_config',                 count(*) FROM sdr_ia_config, cfg                 WHERE workspace_id = cfg.ws
UNION ALL SELECT 'workspace_settings',            count(*) FROM workspace_settings, cfg            WHERE workspace_id = cfg.ws
UNION ALL SELECT 'clara_workspace_settings',      count(*) FROM clara_workspace_settings, cfg      WHERE workspace_id = cfg.ws
UNION ALL SELECT 'utm_origins',                   count(*) FROM utm_origins, cfg                   WHERE workspace_id = cfg.ws
UNION ALL SELECT 'utm_source_origin_assignments', count(*) FROM utm_source_origin_assignments, cfg WHERE workspace_id = cfg.ws
ORDER BY 1;

-- Métricas por campanha, exatamente como o painel de Disparos vai ler:
SELECT disparo_nome, tipo_mensagem, trigger_count, respondeu_count, nao_respondeu_count,
       erro_count, parou_count, converteu_count, taxa_resposta_pct,
       ROUND(custo_estimado, 2) AS custo_estimado, primeiro_trigger::date AS disparado_em
FROM rpc_disparo_metricas(NULL, NULL), cfg
WHERE workspace_id = cfg.ws
ORDER BY primeiro_trigger;

-- Investimento orgânico consolidado (esperado: 12 meses, 7 itens cada):
SELECT year_month, ROUND(SUM(amount), 2) AS total_mes, count(*) AS itens
FROM organic_investments, cfg WHERE workspace_id = cfg.ws
GROUP BY year_month ORDER BY year_month;

DROP VIEW cfg;
