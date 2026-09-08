-- ============================================================================
-- Tenant de Demonstração — 70 · Logs operacionais e integrações
-- ============================================================================
-- Popula as tabelas de LOG e de integração externa do tenant de demonstração.
--
-- PRÉ-REQUISITOS: rodar antes 00, 10, 20, 30, 40, 50 e 60.
-- ⚠️ workspace alvo: d0000000-0000-4000-8000-000000000001
--
-- ─── CONTEXTO DA DECISÃO ────────────────────────────────────────────────────
-- Estas tabelas normalmente só se preenchem com uso real do sistema (alguém
-- rodando um discovery, sincronizando o Notion, recebendo um webhook da
-- Hotmart). A recomendação técnica inicial foi deixá-las vazias, para não
-- fabricar registro de uma operação que nunca aconteceu.
--
-- O dono decidiu populá-las mesmo assim, com um argumento válido: numa
-- demonstração, tela de log vazia também é lida como defeito pelo prospect.
--
-- A contrapartida adotada foi amarrar cada log a algo que EXISTE de fato na
-- demo, em vez de gerar registro solto:
--   • as sincronizações do Notion movimentam exatamente os 24 criativos reais;
--   • os discoveries reportam os 63 campos / 12 pipelines / 72 estágios que
--     estão mesmo mapeados;
--   • as validações de criativo apontam para `notion_creatives.id` reais;
--   • as ligações do WhatsApp usam telefone de contatos que têm a tag
--     `conectado`;
--   • as compras da Hotmart usam nome, e-mail e telefone de contatos reais,
--     com a data da compra sempre DEPOIS da data de entrada do lead.
-- ============================================================================

-- ─── 1. Auditoria de ações administrativas ──────────────────────────────────
insert into audit_log (workspace_id, user_id, action, table_name, record_id, payload_before, created_at)
select 'd0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002',
  a.acao, a.tabela, 'demo-rec-'||n::text,
  jsonb_build_object('antes', a.antes, 'por', 'Marina Duarte'),
  (timestamp '2025-09-01 09:00' + (n * interval '7 days') + make_interval(hours => (n*5)%9))::timestamptz
from generate_series(1,42) n
cross join lateral (select
  (array['UPDATE','INSERT','DELETE','UPDATE','UPDATE'])[1+(n%5)] acao,
  (array['dashboard_user_permissions','workspace_apps','utm_campaigns','goal_versions','disparos','ghl_field_mappings'])[1+(n%6)] tabela,
  (array['can_view=false','is_active=false','nome antigo','target 120','tag antiga','logical_name nulo'])[1+(n%6)] antes) a
on conflict do nothing;

-- ─── 2. Descobertas de configuração GHL ─────────────────────────────────────
-- Os números batem com o que está de fato mapeado (ver arquivo 60).
insert into ghl_discovery_runs (workspace_id, source, payload, status, created_at)
select 'd0000000-0000-4000-8000-000000000001',
  (array['manual','cron-vigilancia','onboarding'])[1+(n%3)],
  jsonb_build_object('custom_fields',63,'pipelines',12,'stages',72,
                     'novos_desde_ultima', case when n%4=0 then 1 else 0 end),
  case when n = 3 then 'error' else 'success' end,
  (timestamp '2025-08-05 10:00' + (n * interval '32 days'))::timestamptz
from generate_series(1,11) n
on conflict do nothing;

-- ─── 3. Sincronizações do Notion ────────────────────────────────────────────
-- ⚠️ CHECKs: database_type ∈ (paid, organic) · request_source ∈ (manual, cron)
--    · status ∈ (running, success, error). "webhook" NÃO é fonte válida.
insert into notion_sync_runs (
  workspace_id, database_type, request_source, status, started_at, finished_at,
  records_fetched, records_synced, records_created, records_updated, records_skipped,
  notion_database_id, error_message, created_at
)
select 'd0000000-0000-4000-8000-000000000001','paid',
  case when n%3=1 then 'manual' else 'cron' end,
  case when n = 7 then 'error' else 'success' end,
  ts, ts + make_interval(secs => 8 + (n*3)%40),
  24, case when n=7 then 0 else 24 end,
  case when n <= 3 then 8 else (n%3) end,
  case when n=7 then 0 else 24 - (case when n <= 3 then 8 else (n%3) end) end,
  (n%2), 'demo-notion-db-criativos',
  case when n = 7 then 'Notion API: rate limited (429) após 12 páginas' end, ts
from generate_series(1,22) n
cross join lateral (select (timestamp '2025-08-10 06:00' + (n * interval '15 days'))::timestamptz ts) t
on conflict do nothing;

-- ─── 4. Validações de criativo ──────────────────────────────────────────────
-- ⚠️ CHECK: status ∈ (validado, reprovado) — em português.
insert into creative_validations (workspace_id, creative_id, status, motivo, validated_by, validated_by_email, validated_at)
select 'd0000000-0000-4000-8000-000000000001', nc.id,
  case when (((hashtext('cv'||nc.id::text) % 100)+100)%100) < 65 then 'validado' else 'reprovado' end,
  case when (((hashtext('cv'||nc.id::text) % 100)+100)%100) < 65
       then (array['Gancho forte nos 3 primeiros segundos','Oferta clara e CTA direto','Prova social convincente','Dentro da identidade da marca'])[1+(((hashtext('m'||nc.id::text)%4)+4)%4)]
       else (array['Gancho fraco, demora a entregar a promessa','Áudio com ruído','Claim sem prova — risco de bloqueio','Fora do posicionamento'])[1+(((hashtext('m'||nc.id::text)%4)+4)%4)] end,
  'd0000000-0000-4000-8000-000000000002','marina@acmedemo.test',
  coalesce(nc.available_date, date '2026-01-15') + interval '2 days'
from notion_creatives nc where nc.workspace_id='d0000000-0000-4000-8000-000000000001'
on conflict do nothing;

-- ─── 5. Ligações de WhatsApp (Stevo), com transcrição e análise ─────────────
with alvo as (
  select c.telefone, (c.custom_fields->>'demo_i')::int i,
         (((hashtext('st'||(c.custom_fields->>'demo_i')) % 1000)+1000)%1000) r
  from contatos c
  where c.workspace_id='d0000000-0000-4000-8000-000000000001'
    and c.tags like '%conectado%'
    and (((hashtext('st'||(c.custom_fields->>'demo_i')) % 1000)+1000)%1000) < 220
)
insert into stevo_whatsapp_calls (
  workspace_id, call_id, instance_id, caller, receiver, direction, status, is_video,
  duration_seconds, has_recording, recording_url, transcription, analysis, analyzed_at,
  call_timestamp, raw_data
)
select 'd0000000-0000-4000-8000-000000000001',
  'demo-call-'||lpad(i::text,6,'0'), 'demo-instance-acme',
  '+551140028922', telefone,
  case when r % 5 = 0 then 'inbound' else 'outbound' end,
  case when r % 7 = 0 then 'missed' else 'completed' end,
  false,
  case when r % 7 = 0 then 0 else 90 + (r % 800) end,
  (r % 7 <> 0),
  case when r % 7 <> 0 then 'https://demo.acme.test/calls/whatsapp/'||lpad(i::text,6,'0')||'.mp3' end,
  case when r % 7 <> 0 then (array[
    'Lead confirmou interesse no Acelerador e pediu para receber a proposta por e-mail. Disse que fatura em torno de 400 mil por ano e quer estruturar o comercial.',
    'Contato atendeu mas estava dirigindo. Pediu retorno no fim da tarde. Demonstrou conhecer o método.',
    'Lead relatou que já tentou dois programas parecidos e não teve resultado. Objeção principal é confiança, não preço.',
    'Conversa boa. Lead quer entender o formato das mentorias e se tem acompanhamento individual. Encaminhado para agendamento com o closer.',
    'Lead disse que o momento não é bom, empresa passando por reestruturação. Pediu para retomar em 60 dias.'
  ])[1 + (r % 5)] end,
  case when r % 7 <> 0 then jsonb_build_object(
    'sentimento', (array['positivo','neutro','positivo','negativo','neutro'])[1+(r%5)],
    'interesse', (array['alto','medio','alto','baixo','medio'])[1+(r%5)],
    'objecoes', (array['nenhuma','tempo','confianca','momento','preco'])[1+(r%5)],
    'proximo_passo', (array['enviar proposta','retornar a tarde','enviar cases','agendar com closer','retomar em 60 dias'])[1+(r%5)],
    'score_qualificacao', 40 + (r % 60)) end,
  case when r % 7 <> 0 then (timestamp '2026-01-01' + (r * interval '1 day'))::timestamptz end,
  (timestamp '2026-01-01 10:00' + (r * interval '1 day') + make_interval(hours => r % 8))::timestamptz,
  jsonb_build_object('provider','stevo','demo',true)
from alvo
on conflict do nothing;

-- ─── 6. Insights de IA de pré-vendas ────────────────────────────────────────
insert into prevendas_ai_insights (workspace_id, input_hash, resultado, created_at)
select 'd0000000-0000-4000-8000-000000000001', md5('demo-insight-'||n::text),
  jsonb_build_object(
    'resumo', (array[
      'A taxa de conexão caiu 8% em relação à semana anterior. A queda se concentra nos leads do canal Instagram Ads — Interesses.',
      'Os leads do funil Webinário estão agendando 2,3x mais que a média, mas o comparecimento é 14 pontos menor.',
      'Três pré-vendedores concentram 71% dos agendamentos. Há desequilíbrio de distribuição de leads.',
      'O tempo médio de resposta subiu para 19 minutos nas terças-feiras — possível gargalo de escala no time.',
      'Leads com faturamento acima de R$ 1 mi convertem 3,1x mais, mas representam só 12% da base.'
    ])[1+(n%5)],
    'recomendacoes', jsonb_build_array(
      (array['Revisar a segmentação da campanha','Reforçar a confirmação de reunião 24h antes','Redistribuir a fila do discador','Escalar o time nas terças','Priorizar o público de alto ticket'])[1+(n%5)],
      (array['Testar novo criativo para o público frio','Adicionar lembrete por WhatsApp','Revisar critério de rodízio','Revisar cadência de follow-up','Criar oferta específica'])[1+(n%5)]),
    'severidade', (array['media','alta','media','baixa','alta'])[1+(n%5)],
    'periodo_analisado', to_char(date '2026-01-01' + (n*14), 'YYYY-MM-DD')),
  (timestamp '2026-01-05' + (n * interval '14 days'))::timestamptz
from generate_series(1,14) n
on conflict do nothing;

-- ─── 7. Compras Hotmart (produto digital de entrada) ────────────────────────
-- A data da compra é sempre POSTERIOR à entrada do lead, e nunca no futuro.
with alvo as (
  select c.primeiro_nome, c.ultimo_nome, c.email, c.telefone,
         (c.custom_fields->>'demo_i')::int i,
         (c.custom_fields->>'demo_lead_ts')::timestamptz lead_ts,
         (((hashtext('hm'||(c.custom_fields->>'demo_i')) % 1000)+1000)%1000) r
  from contatos c
  where c.workspace_id='d0000000-0000-4000-8000-000000000001'
    and (((hashtext('hm'||(c.custom_fields->>'demo_i')) % 1000)+1000)%1000) < 95
)
insert into maquina_de_conteudo (
  workspace_id, transacao_id, hotmart_event_id, evento_tipo,
  comprador_nome, comprador_sobrenome, comprador_email, comprador_telefone,
  comprador_documento, comprador_pais, comprador_cidade,
  produto_id, produto_nome, produto_ucode, oferta_codigo, oferta_nome,
  valor, valor_total, valor_oferta_original, moeda, forma_pagamento, parcelas,
  status, data_pedido, data_aprovacao, data_evento,
  comissao_produtor, comissao_marketplace, pais_compra, modelo_negocio, payload
)
select 'd0000000-0000-4000-8000-000000000001',
  'HP'||lpad(i::text,8,'0'), 'evt-demo-'||lpad(i::text,8,'0'),
  case when r % 11 = 0 then 'PURCHASE_REFUNDED' else 'PURCHASE_APPROVED' end,
  primeiro_nome, ultimo_nome, email, telefone,
  lpad(((i*37)%999)::text,3,'0')||'.'||lpad(((i*73)%999)::text,3,'0')||'.'||lpad(((i*17)%999)::text,3,'0')||'-'||lpad(((i*11)%99)::text,2,'0'),
  'BR', (array['São Paulo','Rio de Janeiro','Belo Horizonte','Curitiba','Recife','Salvador'])[1+(r%6)],
  4471122, 'Máquina de Conteúdo — Acme', 'demo-ucode-mdc',
  (array['MDC-ANUAL','MDC-MENSAL','MDC-PROMO'])[1+(r%3)],
  (array['Plano Anual','Plano Mensal','Oferta de Lançamento'])[1+(r%3)],
  v.preco, v.preco, case when r%3=2 then 997.00 else v.preco end,
  'BRL', (array['CREDIT_CARD','PIX','BILLET','CREDIT_CARD'])[1+(r%4)],
  case when r%4 in (1,2) then 1 else 1 + (r % 12) end,
  case when r % 11 = 0 then 'REFUNDED' else 'APPROVED' end,
  dt, case when r % 11 = 0 then null else dt + interval '4 minutes' end, dt,
  round(v.preco * 0.70, 2), round(v.preco * 0.30, 2), 'BR', 'I',
  jsonb_build_object('demo', true, 'origem', 'hotmart-webhook')
from alvo
cross join lateral (select (array[497.00, 97.00, 697.00])[1+(r%3)] preco) v
cross join lateral (select (lead_ts + make_interval(days => 3 + (r % 40)))::timestamptz dt) d
where (lead_ts + make_interval(days => 3 + (r % 40))) <= timestamptz '2026-07-29 23:59'
on conflict do nothing;
