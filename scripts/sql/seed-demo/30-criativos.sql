-- =============================================================================
-- SEED DE DEMONSTRACAO — SUB-APP CRIATIVOS
-- =============================================================================
--
-- O QUE ESTE ARQUIVO FAZ
-- ----------------------
-- Popula, do zero, todas as tabelas que alimentam as 5 abas do sub-app
-- Criativos (Ranking, Biblioteca, Kanban, Testes e Dashboard) para o tenant de
-- DEMONSTRACAO "Acme Educacao (Demo)":
--
--   campaigns              5 campanhas internas, vinculadas as campanhas Meta
--   creative_test_criteria 1 linha de criterios de aprovacao/reprovacao
--   notion_creatives      24 criativos, external_id CR-101 .. CR-124
--   creative_tests        19 testes (10 criativos, 9 deles com 2 rodadas)
--   creative_test_history 35 eventos (alimenta lead time / cycle time)
--   creative_comments      8 comentarios (2 sao respostas via parent_id)
--   creative_audit_log    10 mudancas de status
--
-- IMPORTANTE — DADO 100% FICTICIO
-- -------------------------------
-- Nenhum nome, depoimento, faturamento, URL ou metrica deste arquivo e real.
-- A empresa "Acme Educacao" nao existe; os textos foram escritos apenas para
-- que as telas do dashboard tenham conteudo plausivel numa demonstracao.
-- Este arquivo NAO deve ser executado contra um workspace de cliente.
--
-- WORKSPACE ALVO
-- --------------
-- d0000000-0000-4000-8000-000000000001  — workspace "Acme Educacao (Demo)"
-- d0000000-0000-4000-8000-000000000002  — usuario de demonstracao (auth.users)
--
-- Os dois UUIDs sao o UNICO ponto de configuracao do arquivo: estao isolados na
-- tabela temporaria _cfg logo abaixo e todo o resto do script os referencia a
-- partir dela. Para recriar a demo em outro workspace, troque so aquele bloco.
--
-- IDEMPOTENCIA
-- ------------
-- Todos os ids sao deterministicos (md5('demo-<chave>')::uuid) e todos os
-- inserts usam ON CONFLICT ... DO UPDATE. Rodar o arquivo N vezes produz sempre
-- o mesmo estado final, sem duplicar linha nenhuma.
--
-- COMO EXECUTAR
-- -------------
--   psql "$DATABASE_URL" -f scripts/sql/seed-demo/30-criativos.sql
--
-- Rode numa unica sessao: a tabela temporaria _cfg vive so enquanto a sessao
-- estiver aberta.
--
-- DEPENDENCIAS
-- ------------
-- Exige que o workspace e o usuario de demonstracao ja existam (seed anterior).
-- Os external_id CR-101..CR-124 sao a chave de cruzamento com o seed do Meta
-- Ads, que gera ad_name no formato M{n}_O1_{PUBCODE}_CR-{n}_PG{n}. Mudar esses
-- codigos aqui quebra o Ranking de Criativos.
--
-- ATENCAO — DIVERGENCIA CONHECIDA DO FRONTEND
-- -------------------------------------------
-- creative_tests.result tem CHECK que so aceita portugues
-- ('aprovado','reprovado','cancelado','pendente'), mas
-- eb-dash2/src/hooks/useCreativeDashboard.ts espera ingles
-- ('approved','scale','rejected','kill'). Enquanto essa divergencia existir, a
-- aba Dashboard mostra Yield rate 0%, Validados/semana 0 e throughput zerado —
-- para qualquer tenant, nao so o de demonstracao. Nao e defeito deste seed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- CONFIGURACAO — unico ponto a editar
-- -----------------------------------------------------------------------------
create temp table _cfg on commit preserve rows as
select
  'd0000000-0000-4000-8000-000000000001'::uuid as workspace_id,
  'd0000000-0000-4000-8000-000000000002'::uuid as demo_user_id;


-- -----------------------------------------------------------------------------
-- 1) CAMPANHAS INTERNAS
--    meta_campaign_id aponta para as campanhas criadas pelo seed do Meta Ads.
-- -----------------------------------------------------------------------------
insert into campaigns (id, workspace_id, name, created_by, meta_campaign_id)
select md5('demo-campaign-' || v.idx)::uuid,
       (select workspace_id from _cfg),
       v.nome,
       (select demo_user_id from _cfg),
       v.meta_id
from (values
  (1, 'Aplicação — Acelerador',  'demo-camp-1'),
  (2, 'Webinário — Escala',      'demo-camp-2'),
  (3, 'Masterclass Gratuita',    'demo-camp-3'),
  (4, 'Desafio 7 Dias',          'demo-camp-4'),
  (5, 'Remarketing — Vendas',    'demo-camp-5')
) as v(idx, nome, meta_id)
on conflict (id) do update set
  name             = excluded.name,
  meta_campaign_id = excluded.meta_campaign_id,
  updated_at       = now();


-- -----------------------------------------------------------------------------
-- 2) CRITERIOS DE TESTE DO WORKSPACE
--    early_stop_threshold e MULTIPLICADOR do CPL alvo (o frontend faz
--    cpl >= cpl_target * early_stop_threshold), nao percentual.
-- -----------------------------------------------------------------------------
insert into creative_test_criteria (
  id, workspace_id, cpl_target, budget_min, budget_max,
  window_min_days, window_max_days, early_stop_threshold, early_stop_spend, no_lead_max_days,
  weekly_goal_reels, weekly_goal_static, weekly_goal_carousel, weekly_goal_stories, updated_by
)
select md5('demo-criteria-1')::uuid, (select workspace_id from _cfg),
       45, 300, 1500,
       3, 10, 2.5, 400, 3,
       4, 3, 2, 2, (select demo_user_id from _cfg)
on conflict (workspace_id) do update set
  cpl_target           = excluded.cpl_target,
  budget_min           = excluded.budget_min,
  budget_max           = excluded.budget_max,
  window_min_days      = excluded.window_min_days,
  window_max_days      = excluded.window_max_days,
  early_stop_threshold = excluded.early_stop_threshold,
  early_stop_spend     = excluded.early_stop_spend,
  no_lead_max_days     = excluded.no_lead_max_days,
  weekly_goal_reels    = excluded.weekly_goal_reels,
  weekly_goal_static   = excluded.weekly_goal_static,
  weekly_goal_carousel = excluded.weekly_goal_carousel,
  weekly_goal_stories  = excluded.weekly_goal_stories,
  updated_at           = now();


-- -----------------------------------------------------------------------------
-- 3) OS 24 CRIATIVOS
--
--    Distribuicao pelas 12 colunas do Kanban (CREATIVE_STATUSES do frontend):
--      ideia 2 · roteiro 2 · produzindo 2 · revisao 2 · ajustes 1 · aprovado 1
--      reprovado 1 · pronto 3 · em_teste 3 · testado 3 · escalar 2 · arquivado 2
--
--    Vinculo com campanha espelha a veiculacao real no seed do Meta Ads.
--    CR-119..CR-124 ficam sem campanha de proposito: sao os criativos ainda em
--    producao, que nunca subiram (e por isso aparecem zerados no Ranking).
--
--    Colunas derivadas por regra a partir do status (test_status, test_result,
--    aprovado, cpl_value, budget_spent, mvp_status, datas) para manter a
--    coerencia interna sem repetir valor a valor.
--
--    Restricoes do schema que ditam alguns valores:
--      creative_type CHECK  copy|imagem|video|hook|cta  (nao aceita "reels")
--      test_status   CHECK  nao_testado|em_teste|testado
--      test_result   CHECK  aprovado|reprovado|pendente|retestar
--      mvp_status    CHECK  testando|aprovado|reprovado
--      priority      integer (nao texto)
--      tags          text[]  (nao texto)
-- -----------------------------------------------------------------------------
with src(n, nome, fmt, st, avail, rede, pilar, etapa, obj, prio, camp, hook, cta, copy_t, aprend) as (values
 (101,'Depoimento Ana — faturou 40k em 90 dias','reels','escalar','2025-08-06'::date,'instagram','prova social','fundo','conversao',3,1,'Eu faturei 40 mil em 90 dias sem aumentar minha equipe','Quero aplicar para a mentoria','A Ana entrou travada em 8k/mes. Em 90 dias, 40k. O que mudou nao foi o produto: foi a estrutura de oferta.','Depoimento com numero especifico no primeiro segundo segura o scroll. Padrao para replicar.'),
 (102,'VSL Método Acme v1','video','arquivado','2025-08-19'::date,'youtube','educacional','meio','conversao',1,1,'O metodo que 300 alunos usam para escalar sem caos','Assistir a aula completa','Aula de 12 minutos explicando o metodo. Versao 1, muito longa na abertura.','Abertura de 40s matou a retencao. VSL precisa entregar promessa nos primeiros 8s.'),
 (103,'Carrossel 5 erros que travam sua escala','carousel','testado','2025-09-02'::date,'instagram','educacional','topo','trafego',2,1,'5 erros que travam a escala do seu negocio','Baixar o diagnostico gratuito','Carrossel de 6 cards listando os gargalos mais comuns em negocios de 20k a 100k/mes.',null),
 (104,'Stories bastidores da mentoria','stories','arquivado','2025-09-18'::date,'instagram','autoridade','topo','alcance',0,1,'Bastidores do encontro presencial da mentoria','Ver como funciona','Sequencia de 5 stories do encontro presencial em Sao Paulo.','Bastidor sem promessa clara gera alcance, mas nao gera lead qualificado.'),
 (105,'Antes e depois — Marcos saiu do zero','reels','escalar','2025-10-01'::date,'instagram','prova social','fundo','conversao',3,1,'Ha 1 ano ele nao tinha nenhum cliente. Hoje fatura 60k','Quero minha vaga','Historia do Marcos em 45 segundos, com print de faturamento no final.','Prova social com linha do tempo bate prova social generica em CPL.'),
 (106,'Estático prova social: 300 alunos','static','testado','2025-10-20'::date,'facebook','prova social','meio','conversao',1,2,'300 alunos ja passaram pelo metodo','Quero conhecer o metodo','Peca estatica com numero de alunos e selo de garantia.',null),
 (107,'VSL Método Acme v2','video','testado','2025-11-05'::date,'youtube','educacional','meio','conversao',2,2,'Em 8 minutos eu te mostro por que voce trava nos 30k','Assistir agora','Segunda versao da VSL, abertura reescrita para entregar a promessa em 6 segundos.','Cortar a abertura de 40s para 6s derrubou o CPL pela metade.'),
 (108,'Carrossel quanto custa não escalar','carousel','reprovado','2025-11-24'::date,'instagram','educacional','topo','trafego',0,2,'Quanto custa ficar mais um ano no mesmo faturamento','Fazer o calculo','Carrossel com calculo de custo de oportunidade ao longo de 12 meses.',null),
 (109,'Reels 3 passos para o primeiro 10k','reels','aprovado','2025-12-08'::date,'instagram','educacional','topo','trafego',2,2,'Os 3 passos que levam qualquer negocio ao primeiro 10k','Salvar esse reels','Reels didatico de 50 segundos com os 3 passos na tela.',null),
 (110,'Estático oferta Turma 12','static','pronto','2026-01-13'::date,'facebook','oferta','fundo','conversao',2,3,'Turma 12 aberta: 20 vagas','Garantir minha vaga','Peca de oferta com contagem de vagas e data de fechamento.',null),
 (111,'Reels o erro que me custou 6 meses','reels','pronto','2026-02-02'::date,'instagram','autoridade','topo','alcance',1,3,'Esse erro me custou 6 meses e uns 200 mil','Me conta se ja aconteceu contigo','Reels em primeira pessoa contando um erro de posicionamento.',null),
 (112,'Carrossel método A.C.M.E. explicado','carousel','pronto','2026-02-24'::date,'instagram','educacional','meio','trafego',2,3,'O metodo A.C.M.E. em 4 letras','Quero o material completo','Carrossel explicando cada letra do metodo com exemplo pratico.',null),
 (113,'Depoimento Juliana — 2 contratos em 30 dias','reels','em_teste','2026-03-10'::date,'instagram','prova social','fundo','conversao',3,3,'Fechei 2 contratos de 15 mil em 30 dias','Quero aplicar','Depoimento gravado no celular, sem producao, com print dos contratos.',null),
 (114,'VSL Desafio 7 dias — abertura','video','em_teste','2026-04-06'::date,'youtube','oferta','meio','conversao',3,4,'7 dias para sair do zero ao primeiro 10k','Entrar no desafio','Video de captacao do desafio, 4 minutos, foco na transformacao.',null),
 (115,'Stories enquete: qual seu maior gargalo?','stories','em_teste','2026-04-28'::date,'instagram','educacional','topo','alcance',1,4,'Qual desses 4 gargalos trava voce hoje?','Responder a enquete','Sequencia de stories com enquete e resposta segmentada por gargalo.',null),
 (116,'Carrossel 4 níveis de maturidade do negócio','carousel','revisao','2026-05-12'::date,'instagram','educacional','topo','trafego',2,4,'Em qual dos 4 niveis o seu negocio esta hoje?','Descobrir meu nivel','Carrossel de diagnostico com 4 niveis e sintomas de cada um.',null),
 (117,'Estático webinário ao vivo quinta 20h','static','revisao','2026-05-26'::date,'facebook','oferta','meio','conversao',2,5,'Quinta, 20h: aula ao vivo sobre escala previsivel','Garantir minha vaga na aula','Peca de captacao para o webinario, com data e horario em destaque.',null),
 (118,'Reels não venda barato, venda certo','reels','ajustes','2026-06-09'::date,'instagram','autoridade','topo','alcance',1,5,'Baratear o preco nao resolve o seu problema de venda','Comenta AQUI que eu te mando','Reels de posicionamento sobre precificacao de alto ticket.',null),
 (119,'VSL Método Acme v3 — nova promessa','video','produzindo','2026-06-22'::date,'youtube','educacional','meio','conversao',3,null,'De 30k a 100k sem dobrar o time','Assistir a aula','Terceira versao da VSL com promessa reposicionada para o publico de 30k+.',null),
 (120,'Reels rotina de um aluno que escala','reels','produzindo','2026-07-01'::date,'instagram','prova social','meio','alcance',2,null,'A rotina de quem saiu de 20k para 80k por mes','Ver a rotina completa','Reels documental acompanhando um dia de um aluno da mentoria.',null),
 (121,'Carrossel 7 sinais de que você virou gargalo','carousel','roteiro','2026-07-08'::date,'instagram','educacional','topo','trafego',2,null,'7 sinais de que o gargalo do negocio e voce','Fazer o diagnostico','Carrossel de autodiagnostico para donos de negocio sobrecarregados.',null),
 (122,'Stories countdown Turma 13','stories','roteiro','2026-07-14'::date,'instagram','oferta','fundo','conversao',3,null,'Faltam 48h para fechar a Turma 13','Garantir a vaga agora','Sequencia de stories de urgencia nas ultimas 48h de carrinho aberto.',null),
 (123,'Reels resposta ao comentário mais polêmico','reels','ideia','2026-07-21'::date,'instagram','autoridade','topo','alcance',1,null,'Recebi esse comentario e preciso responder','Comenta o que voce acha','Reels respondendo a critica sobre preco de mentoria de alto ticket.',null),
 (124,'Estático depoimento em número: 12x em 1 ano','static','ideia','2026-07-27'::date,'facebook','prova social','fundo','conversao',2,null,'12x o faturamento em 1 ano','Quero o mesmo resultado','Peca estatica com grafico de evolucao de faturamento de um aluno.',null)
)
insert into notion_creatives (
  id, workspace_id, notion_page_id, database_type, external_id, source, name, status, available_date,
  format, creative_type, social_network, objective, content_pillar, funnel_stage, profile,
  copy_text, hook_text, cta_text, learning, observations, priority, tags,
  final_asset_url, videos_folder_url, campaign_id, created_by, assigned_to,
  creative_tested, test_status, test_result, test_started_at, test_ended_at,
  aprovado, data_avaliacao, cpl_value, budget_spent, mvp_status,
  created_at, updated_at, synced_at
)
select
  md5('demo-creative-' || n)::uuid,
  (select workspace_id from _cfg),
  'demo-notion-' || n,
  'paid',
  'CR-' || n,
  -- mistura de origem: 1 em cada 5 e cadastro nativo, o resto vem do Notion
  case when n % 5 = 0 then 'native' else 'notion' end,
  nome,
  st,
  avail,
  fmt,
  -- creative_type tem CHECK proprio: derivado do formato
  case when fmt in ('reels','video') then 'video'
       when fmt = 'stories'          then 'hook'
       else 'imagem' end,
  rede,
  obj,
  pilar,
  etapa,
  '@acmeeducacao',
  copy_t,
  hook,
  cta,
  aprend,
  case st
    when 'revisao'   then 'Aguardando aprovacao do roteiro pelo head de criativo.'
    when 'ajustes'   then 'Revisao solicitada: refazer os 3 primeiros segundos.'
    when 'arquivado' then 'Arquivado apos teste sem performance.'
    else null end,
  prio,
  -- tags de aprovacao que o Kanban le para exibir os botoes de acao
  case st
    when 'roteiro'    then array['roteiro-em-aprovacao']
    when 'produzindo' then array['roteiro-aprovado']
    when 'revisao'    then array['edicao-em-aprovacao']
    when 'ajustes'    then array['revisao-solicitada']
    when 'aprovado'   then array['edicao-aprovada']
    else array[]::text[] end,
  'https://cdn.demo.acme-educacao.com.br/criativos/CR-' || n || '.mp4',
  'https://drive.demo.acme-educacao.com.br/criativos/CR-' || n,
  case when camp is null then null else md5('demo-campaign-' || camp)::uuid end,
  (select demo_user_id from _cfg),
  (select demo_user_id from _cfg),
  st in ('em_teste','testado','escalar','arquivado'),
  case when st = 'em_teste'                             then 'em_teste'
       when st in ('testado','escalar','arquivado')     then 'testado'
       else 'nao_testado' end,
  case when st = 'escalar'                    then 'aprovado'
       when st = 'arquivado'                  then 'reprovado'
       when st = 'testado' and n in (103,107) then 'aprovado'
       when st = 'testado'                    then 'reprovado'
       else null end,
  -- os 3 criativos em teste tem inicio recente, para o painel mostrar
  -- testes vivos (e o alerta de "teste sem leads" no CR-115)
  case when n = 113 then '2026-07-16'::date
       when n = 114 then '2026-07-20'::date
       when n = 115 then '2026-07-23'::date
       when st in ('testado','escalar','arquivado') then avail + 4
       else null end,
  case when st in ('testado','escalar','arquivado') then avail + 11 else null end,
  case when st = 'escalar'                    then true
       when st = 'arquivado'                  then false
       when st = 'testado' and n in (103,107) then true
       when st = 'testado'                    then false
       else null end,
  case when st in ('testado','escalar','arquivado') then (avail + 11)::timestamptz + interval '17 hours' else null end,
  -- CPL coerente com o desfecho: campeao barato, arquivado caro
  case when st = 'escalar'                    then round((26 + (n % 7) * 1.4)::numeric, 2)
       when st = 'testado' and n in (103,107) then round((38 + (n % 5) * 1.1)::numeric, 2)
       when st = 'testado'                    then round((61 + (n % 5) * 2.3)::numeric, 2)
       when st = 'arquivado'                  then round((88 + (n % 6) * 3.1)::numeric, 2)
       else null end,
  case when st = 'em_teste'                         then round((320 + (n % 7) * 61)::numeric, 2)
       when st in ('testado','escalar','arquivado') then round((780 + (n % 9) * 74)::numeric, 2)
       else 0 end,
  case when st = 'escalar'                    then 'aprovado'
       when st = 'arquivado'                  then 'reprovado'
       when st = 'em_teste'                   then 'testando'
       when st = 'testado' and n in (103,107) then 'aprovado'
       when st = 'testado'                    then 'reprovado'
       else null end,
  avail::timestamptz + interval '9 hours',
  case when st in ('testado','escalar','arquivado') then (avail + 11)::timestamptz + interval '17 hours'
       when n = 113 then '2026-07-16 10:00-03'::timestamptz
       when n = 114 then '2026-07-20 10:00-03'::timestamptz
       when n = 115 then '2026-07-23 10:00-03'::timestamptz
       else avail::timestamptz + interval '15 hours' end,
  avail::timestamptz + interval '9 hours'
from src
on conflict (id) do update set
  name            = excluded.name,
  status          = excluded.status,
  available_date  = excluded.available_date,
  format          = excluded.format,
  creative_type   = excluded.creative_type,
  social_network  = excluded.social_network,
  objective       = excluded.objective,
  content_pillar  = excluded.content_pillar,
  funnel_stage    = excluded.funnel_stage,
  copy_text       = excluded.copy_text,
  hook_text       = excluded.hook_text,
  cta_text        = excluded.cta_text,
  learning        = excluded.learning,
  observations    = excluded.observations,
  priority        = excluded.priority,
  tags            = excluded.tags,
  final_asset_url = excluded.final_asset_url,
  campaign_id     = excluded.campaign_id,
  creative_tested = excluded.creative_tested,
  test_status     = excluded.test_status,
  test_result     = excluded.test_result,
  test_started_at = excluded.test_started_at,
  test_ended_at   = excluded.test_ended_at,
  aprovado        = excluded.aprovado,
  data_avaliacao  = excluded.data_avaliacao,
  cpl_value       = excluded.cpl_value,
  budget_spent    = excluded.budget_spent,
  mvp_status      = excluded.mvp_status,
  created_at      = excluded.created_at,
  updated_at      = excluded.updated_at;


-- -----------------------------------------------------------------------------
-- 4) OS 19 TESTES
--
--    10 criativos testados; 9 deles com 2 rodadas (rodada 1 reprovada, rodada 2
--    com o ajuste aplicado). CR-104 tem uma rodada so, morta por stop
--    antecipado.
--
--    Numeros internamente coerentes por construcao:
--      leads_crm <= leads_meta, mql_count <= leads_crm, sales_count <= mql_count
--      budget_spent <= budget_allocated
--      cpl_meta = spent/leads_meta, cpl_crm = spent/leads_crm, cpmql = spent/mql
--      revenue  = sales_count * 11800 (ticket medio ficticio)
--
--    CR-115 esta em teste com 0 leads de proposito: e o gatilho do alerta
--    "Teste sem leads" na aba Dashboard.
-- -----------------------------------------------------------------------------
with t(cn, rnd, started, ended, st, res, alloc, spent, lm, lc, mql, sales, motivo) as (values
 (101,1,'2025-08-10'::date,'2025-08-13'::date,'concluido','reprovado', 500, 420.00,  9,  8,  3, 0,'CPL de R$ 46,67 acima do alvo de R$ 45 e nenhuma venda na janela.'),
 (101,2,'2025-08-14'::date,'2025-08-17'::date,'concluido','aprovado',1500,1180.00, 41, 38, 17, 4,'CPL de R$ 28,78 muito abaixo do alvo, 4 vendas na janela. Escalar.'),
 (102,1,'2025-08-23'::date,'2025-08-26'::date,'concluido','reprovado', 500, 380.00,  4,  3,  1, 0,'Apenas 4 leads com R$ 380 investidos. CPL de R$ 95.'),
 (102,2,'2025-08-27'::date,'2025-08-30'::date,'cancelado','cancelado',1200, 900.00,  9,  8,  2, 0,'Stop antecipado: CPL de R$ 100 acima de 2,5x o alvo apos R$ 400 gastos.'),
 (103,1,'2025-09-06'::date,'2025-09-09'::date,'concluido','reprovado', 500, 400.00,  8,  7,  2, 0,'CPL de R$ 50 acima do alvo. Ajustar hook e retestar.'),
 (103,2,'2025-09-10'::date,'2025-09-13'::date,'concluido','aprovado',1200,1020.00, 26, 24,  9, 2,'CPL de R$ 39,23 abaixo do alvo com 2 vendas. Aprovado para a esteira.'),
 (104,2,'2025-09-22'::date,'2025-09-25'::date,'cancelado','cancelado',1200, 850.00,  6,  5,  1, 0,'Stop antecipado: CPL de R$ 141,67 e nenhum MQL qualificado. Criativo arquivado.'),
 (105,1,'2025-10-05'::date,'2025-10-08'::date,'concluido','reprovado', 500, 430.00,  7,  6,  2, 0,'CPL de R$ 61,43 acima do alvo. Refazer os 3 primeiros segundos.'),
 (105,2,'2025-10-09'::date,'2025-10-12'::date,'concluido','aprovado',1500,1250.00, 45, 42, 19, 5,'CPL de R$ 27,78 e 5 vendas. Melhor criativo da conta ate aqui.'),
 (106,1,'2025-10-24'::date,'2025-10-27'::date,'concluido','reprovado', 500, 390.00,  5,  4,  1, 0,'CPL de R$ 78 apos a janela minima. Sem sinal de melhora.'),
 (106,2,'2025-10-28'::date,'2025-10-31'::date,'concluido','reprovado',1200, 980.00, 15, 14,  4, 0,'CPL de R$ 65,33 acima do alvo e nenhuma venda em duas rodadas.'),
 (107,1,'2025-11-09'::date,'2025-11-12'::date,'concluido','reprovado', 500, 410.00,  7,  6,  2, 0,'Abertura longa derrubou a retencao. CPL de R$ 58,57.'),
 (107,2,'2025-11-13'::date,'2025-11-16'::date,'concluido','aprovado',1300,1150.00, 29, 27, 11, 3,'Nova abertura levou o CPL a R$ 39,66 com 3 vendas. Aprovado.'),
 (113,1,'2026-03-14'::date,'2026-03-17'::date,'concluido','reprovado', 500, 400.00,  8,  7,  3, 0,'CPL de R$ 50 na primeira rodada. Retestar com nova copy.'),
 (113,2,'2026-07-16'::date,null,               'em_andamento',null,    1500, 610.00, 14, 13,  5, 1,null),
 (114,1,'2026-04-10'::date,'2026-04-13'::date,'concluido','reprovado', 500, 380.00,  6,  5,  1, 0,'CPL de R$ 63,33 e apenas 1 MQL. Reescrever a promessa.'),
 (114,2,'2026-07-20'::date,null,               'em_andamento',null,    1500, 520.00, 11, 10,  3, 0,null),
 (115,1,'2026-05-02'::date,'2026-05-05'::date,'concluido','reprovado', 500, 350.00,  4,  3,  0, 0,'Nenhum MQL gerado. Formato de enquete nao converteu em aplicacao.'),
 (115,2,'2026-07-23'::date,null,               'em_andamento',null,    1200, 430.00,  0,  0,  0, 0,null)
)
insert into creative_tests (
  id, workspace_id, creative_id, criteria_id, name, hypothesis, status, result, result_reason, observations,
  started_at, ended_at, start_date, end_date, decided_at, decided_by, created_by,
  budget, budget_allocated, budget_spent, leads_meta, leads_crm, mql_count, sales_count, revenue,
  cpl_meta, cpl_crm, cpmql, created_at, updated_at
)
select
  md5('demo-test-' || cn || '-' || rnd)::uuid,
  (select workspace_id from _cfg),
  md5('demo-creative-' || cn)::uuid,
  md5('demo-criteria-1')::uuid,
  'Teste CR-' || cn || ' — rodada ' || rnd,
  case rnd when 1 then 'Validar se o criativo entrega CPL abaixo de R$ 45 na primeira exposicao a publico frio.'
           else 'Validar se os ajustes de hook e copy derrubam o CPL para baixo do alvo de R$ 45.' end,
  st, res, motivo,
  case when st = 'em_andamento' then 'Teste em andamento, aguardando atingir a janela minima de 3 dias.' else null end,
  started, ended, started, ended,
  case when ended is null then null else ended::timestamptz + interval '18 hours' end,
  case when ended is null then null else (select demo_user_id from _cfg) end,
  (select demo_user_id from _cfg),
  alloc, alloc, spent, lm, lc, mql, sales, (sales * 11800)::numeric,
  case when lm  > 0 then round(spent / lm,  2) else null end,
  case when lc  > 0 then round(spent / lc,  2) else null end,
  case when mql > 0 then round(spent / mql, 2) else null end,
  started::timestamptz + interval '9 hours',
  coalesce(ended::timestamptz + interval '18 hours', now())
from t
on conflict (id) do update set
  name             = excluded.name,
  hypothesis       = excluded.hypothesis,
  status           = excluded.status,
  result           = excluded.result,
  result_reason    = excluded.result_reason,
  observations     = excluded.observations,
  started_at       = excluded.started_at,
  ended_at         = excluded.ended_at,
  start_date       = excluded.start_date,
  end_date         = excluded.end_date,
  decided_at       = excluded.decided_at,
  decided_by       = excluded.decided_by,
  budget           = excluded.budget,
  budget_allocated = excluded.budget_allocated,
  budget_spent     = excluded.budget_spent,
  leads_meta       = excluded.leads_meta,
  leads_crm        = excluded.leads_crm,
  mql_count        = excluded.mql_count,
  sales_count      = excluded.sales_count,
  revenue          = excluded.revenue,
  cpl_meta         = excluded.cpl_meta,
  cpl_crm          = excluded.cpl_crm,
  cpmql            = excluded.cpmql,
  created_at       = excluded.created_at,
  updated_at       = excluded.updated_at;


-- -----------------------------------------------------------------------------
-- 5) HISTORICO DOS TESTES
--    Derivado das linhas de creative_tests. E o que alimenta lead time, cycle
--    time e "tempo ate teste" no Dashboard — esses KPIs leem daqui, nao de
--    creative_tests.result, e por isso funcionam apesar da divergencia
--    portugues/ingles descrita no cabecalho.
--    event_type tem CHECK: teste_iniciado|teste_pausado|teste_finalizado|
--    aprovado|reprovado|retestar|orcamento_atualizado|cpl_atualizado|
--    observacao_adicionada
-- -----------------------------------------------------------------------------
insert into creative_test_history (id, workspace_id, creative_id, test_id, event_type, event_data, performed_by, performed_at)
select md5('demo-history-' || t.id::text || '-start')::uuid,
       t.workspace_id, t.creative_id, t.id, 'teste_iniciado',
       jsonb_build_object('criteria_id', t.criteria_id, 'budget_allocated', t.budget_allocated, 'started_at', t.started_at),
       (select demo_user_id from _cfg),
       t.started_at::timestamptz + interval '9 hours'
from creative_tests t
where t.workspace_id = (select workspace_id from _cfg)
on conflict (id) do update set
  event_data   = excluded.event_data,
  performed_at = excluded.performed_at;

insert into creative_test_history (id, workspace_id, creative_id, test_id, event_type, event_data, performed_by, performed_at)
select md5('demo-history-' || t.id::text || '-end')::uuid,
       t.workspace_id, t.creative_id, t.id,
       case when t.result = 'aprovado' then 'aprovado' else 'reprovado' end,
       jsonb_build_object('result', t.result, 'reason', t.result_reason, 'decided_at', t.decided_at,
                          'cpl_meta', t.cpl_meta, 'leads_crm', t.leads_crm, 'sales_count', t.sales_count),
       (select demo_user_id from _cfg),
       t.decided_at
from creative_tests t
where t.workspace_id = (select workspace_id from _cfg)
  and t.decided_at is not null
on conflict (id) do update set
  event_data   = excluded.event_data,
  performed_at = excluded.performed_at;


-- -----------------------------------------------------------------------------
-- 6) COMENTARIOS
--    c2 e c6 sao respostas (parent_id), para a thread nao ficar plana.
-- -----------------------------------------------------------------------------
with c(k, cn, parent, txt, resolvido, quando) as (values
 ('c1',116,null,'O card 3 esta com a promessa diferente do resto do carrossel. Alinhar com a copy do anuncio.',false,'2026-05-14 11:20-03'::timestamptz),
 ('c2',116,'c1','Ajustado. Reescrevi o card 3 usando o mesmo numero do card 1.',true,'2026-05-15 09:05-03'::timestamptz),
 ('c3',118,null,'Os 3 primeiros segundos estao arrastados. Corta a introducao e comeca direto na frase de impacto.',false,'2026-06-11 16:40-03'::timestamptz),
 ('c4',119,null,'Confirmar com o trafego se a nova promessa cabe no publico de 30k+ antes de gravar.',false,'2026-06-24 10:15-03'::timestamptz),
 ('c5',113,null,'Esse depoimento esta performando bem. Vale pedir mais um corte de 15s pra stories.',false,'2026-07-18 14:30-03'::timestamptz),
 ('c6',113,'c5','Pedido aberto com a edicao. Entrega prevista pra sexta.',true,'2026-07-19 08:50-03'::timestamptz),
 ('c7',115,null,'4 dias em teste e nenhum lead. Sugiro matar e realocar o orcamento no CR-113.',false,'2026-07-27 17:10-03'::timestamptz),
 ('c8',122,null,'Roteiro dos stories de countdown aprovado. Pode produzir.',true,'2026-07-15 13:25-03'::timestamptz)
)
insert into creative_comments (id, workspace_id, creative_id, user_id, parent_id, content, resolved, created_at, updated_at)
select md5('demo-comment-' || k)::uuid,
       (select workspace_id from _cfg),
       md5('demo-creative-' || cn)::uuid,
       (select demo_user_id from _cfg),
       case when parent is null then null else md5('demo-comment-' || parent)::uuid end,
       txt, resolvido, quando, quando
from c
on conflict (id) do update set
  content    = excluded.content,
  resolved   = excluded.resolved,
  created_at = excluded.created_at;


-- -----------------------------------------------------------------------------
-- 7) AUDIT LOG
-- -----------------------------------------------------------------------------
with a(k, cn, campo, vfrom, vto, quando) as (values
 ('a1', 101,'status',      'em_teste',  'escalar',    '2025-08-17 18:05-03'::timestamptz),
 ('a2', 101,'test_result', null,        'aprovado',   '2025-08-17 18:05-03'::timestamptz),
 ('a3', 102,'status',      'em_teste',  'arquivado',  '2025-08-30 18:12-03'::timestamptz),
 ('a4', 105,'status',      'em_teste',  'escalar',    '2025-10-12 18:03-03'::timestamptz),
 ('a5', 107,'status',      'em_teste',  'testado',    '2025-11-16 18:22-03'::timestamptz),
 ('a6', 113,'status',      'pronto',    'em_teste',   '2026-07-16 09:10-03'::timestamptz),
 ('a7', 116,'status',      'produzindo','revisao',    '2026-05-13 15:44-03'::timestamptz),
 ('a8', 118,'status',      'revisao',   'ajustes',    '2026-06-11 16:41-03'::timestamptz),
 ('a9', 120,'status',      'roteiro',   'produzindo', '2026-07-02 10:30-03'::timestamptz),
 ('a10',122,'priority',    '1',         '3',          '2026-07-15 13:26-03'::timestamptz)
)
insert into creative_audit_log (id, workspace_id, creative_id, table_name, field_name, old_value, new_value, changed_by, changed_at)
select md5('demo-audit-' || k)::uuid,
       (select workspace_id from _cfg),
       md5('demo-creative-' || cn)::uuid,
       'notion_creatives', campo, vfrom, vto,
       (select demo_user_id from _cfg), quando
from a
on conflict (id) do update set
  old_value  = excluded.old_value,
  new_value  = excluded.new_value,
  changed_at = excluded.changed_at;


-- -----------------------------------------------------------------------------
-- 8) VERIFICACAO
--    Esperado: campaigns 5 · criteria 1 · creatives 24 · tests 19 ·
--              history 35 · comments 8 · audit 10 · e todas as checagens de
--              coerencia (incoerencias) em 0.
-- -----------------------------------------------------------------------------
select
  (select count(*) from campaigns              where workspace_id = (select workspace_id from _cfg)) as campaigns,
  (select count(*) from creative_test_criteria where workspace_id = (select workspace_id from _cfg)) as criteria,
  (select count(*) from notion_creatives       where workspace_id = (select workspace_id from _cfg)) as creatives,
  (select count(*) from creative_tests         where workspace_id = (select workspace_id from _cfg)) as tests,
  (select count(*) from creative_test_history  where workspace_id = (select workspace_id from _cfg)) as history,
  (select count(*) from creative_comments      where workspace_id = (select workspace_id from _cfg)) as comments,
  (select count(*) from creative_audit_log     where workspace_id = (select workspace_id from _cfg)) as audit,
  (select count(*) from creative_tests
     where workspace_id = (select workspace_id from _cfg)
       and (sales_count > mql_count
         or mql_count   > leads_crm
         or leads_crm   > leads_meta
         or budget_spent > budget_allocated
         or (leads_meta > 0 and abs(cpl_meta - budget_spent / leads_meta) > 0.01)
         or (mql_count  > 0 and abs(cpmql    - budget_spent / mql_count)  > 0.01)
         or started_at > coalesce(ended_at, current_date)
         or greatest(started_at, coalesce(ended_at, started_at)) > current_date)) as incoerencias;

drop table if exists _cfg;
