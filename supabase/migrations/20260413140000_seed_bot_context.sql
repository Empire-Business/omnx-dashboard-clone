-- Seed inicial da tabela bot_context
-- O bot-chat lê estas linhas em runtime e injeta no system prompt como conhecimento adicional.
-- Para atualizar: UPDATE bot_context SET content = '...' WHERE key = '...';
-- Nenhum redeploy necessário — o bot usa o valor mais recente a cada consulta.

INSERT INTO bot_context (key, title, content, ordem) VALUES

('painel_trafego', 'Painel Tráfego Pago — Regras Críticas', $BOT$
**Duas visões:** Cohort (filtra `data_lead_recebido`, "O que aconteceu com leads gerados em X?") vs Produtividade (filtra data do evento, "O que foi produzido em X?").

**Filtro permanente:** Apenas leads com `contatos.utm_source` cadastrado em `utm_sources` (tráfego pago). Orgânicos = leads com utm_source NOT IN utm_sources (tabela separada `utm_sources_plain`).

**Pipeline Recuperação excluído:** `pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L'` = leads antigos reativados. Excluir de TODA contagem via `.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)`.

**KPI Cards:**
- MQL = COUNT de opps com tag "mql" — NUNCA usar leads do Meta (actions JSONB)
- CPMQL = spend_meta / mqls_CRM (dois calls: query_meta_ads ÷ query_funnel_cohort)
- ROAS = valor_faturado / spend_meta
- ROAS Caixa = valor_entrada / spend_meta (caixa real ÷ investimento)
- CPV = spend_meta / vendas (COUNT de opps com data_pagamento_entrada)
- CTR e CPM = pré-calculados pela Meta em meta_ads_insights — não recalcular
- Ciclo de Compra = média de dias entre data_lead_recebido e data_pagamento_entrada

**Cruzamento Criativo-Público:**
- Chave: `contatos.utm_term` (CRM) ↔ `ad_name` (Meta Ads)
- Público extraído do `ad_name` via `public_code` de `utm_sources`
- CPMQL por criativo = spend do anúncio / mqls com aquele utm_term

**Gráfico Investimento × CPMQL:** dois eixos Y com mesma escala (sharedMax).

**Canal sem public_code:** não filtra Meta Ads, mostra total de investimento.
$BOT$, 10),

('conceitos_negocio', 'Conceitos de Negócio — Definições Oficiais', $BOT$
**Lead = Oportunidade:** Contar sempre oportunidades (tabela `oportunidades`), NUNCA contatos. 1 contato pode ter N oportunidades.

**MQL:** Lead com TAG "mql" em `contatos.tags` (CSV ou JSON). NÃO é por pipeline_name. Um MQL pode estar em qualquer pipeline.
Parsing: `tags.split(',').map(t=>t.trim()).some(t=>t.toLowerCase()==='mql')`

**Venda Fechada = ÚNICA fonte de verdade:** `vendas_fechamento.data_pagamento_entrada` preenchida. Campo `oportunidades.data_fechado` = apenas mudança de estágio no CRM, NÃO confirma pagamento.

**COHORT:** Filtra opps por `data_lead_recebido`. Funil encadeado: Leads → MQLs → Conectados → Agendados → Reuniões → Vendas. Eventos contados SEM upper bound de data. Use para: ROI de aquisição, performance de campanha.

**PRODUTIVIDADE:** Cada métrica usa SUA PRÓPRIA data:
- Leads/MQLs: data_lead_recebido
- Conectados: data_conectado
- Agendados: data_agendamento_reuniao
- Reuniões realizadas: data_realizacao_vendas
- Fechamentos/Faturamento: data_pagamento_entrada
NÃO exibir funis encadeados em modo Produtividade.

**Quando usar cada um:**
- Perguntas de aquisição/ROI/campanha → COHORT
- Perguntas de faturamento/metas/período → PRODUTIVIDADE
- Ambíguo → assumir COHORT e informar
$BOT$, 20),

('schema_tabelas', 'Schema das Tabelas Principais', $BOT$
**oportunidades** (Lead = 1 linha)
- id UUID PK, contato_id FK, pipeline_id, sdr_name, vendedor_closer
- data_lead_recebido TIMESTAMPTZ — fonte: API GHL via sync-opp-dates, NÃO o webhook
- data_conectado DATE, data_agendamento_reuniao DATE, data_realizacao_vendas DATE
- data_qualificado DATE, data_negociacao DATE, data_fechado DATE
- Datas pipeline = tipo DATE → filtro sem -03:00 suffix

**contatos** (1 por pessoa, N oportunidades)
- utm_source, utm_campaign, utm_term, utm_medium (do GHL lastAttributionSource)
- tags TEXT (CSV/JSON, ex: "mql,sql,[fn] webinar")
- owner_name (fallback de SDR quando sdr_name é NULL)

**vendas_fechamento** (1 por venda paga)
- oportunidade_id FK 1:1, data_pagamento_entrada TIMESTAMPTZ
- valor_entrada (caixa), valor_faturado = entrada + (parcelas × valor_parcela)
- forma_pagamento, produto_vendido, vendedor_closer

**meta_ads_insights** (Meta Ads por anúncio/dia)
- date DATE, campaign_name, adset_name, ad_name, ad_id
- spend, impressions, clicks, ctr (pré-calc), cpm (pré-calc)
- actions JSONB: `[{"action_type":"lead","value":"3"},...]` — leads do Meta

**utm_sources** (canais PAGOS)
- utm_source (código), nome (amigável ex: "Facebook Ads"), public_code (ex: "P20")
- Filtro Painel Tráfego: join com contatos.utm_source

**utm_sources_plain** (canais ORGÂNICOS)
- utm_source, nome — sem public_code

**utm_campaigns** (campanhas)
- utm_campaign (código numérico), nome, funnels JSONB array

**ghl_users** (equipe)
- nome, papeis JSONB array — SDRs: `papeis @> '["sdr"]'`

**comunicacoes** (mensagens/ligações)
- channel (call/whatsapp/sms/email), direction (outbound=SDR enviou)
- ghl_source: 'app'=manual, 'bot'=IA — para KPIs de SDR, filtrar ghl_source='app'

**Paginação obrigatória:** PostgREST max 1000 rows. Usar .range() em loop. Tabelas grandes: oportunidades (~4800+), comunicacoes (~78k+).
$BOT$, 30),

('modulo_metas', 'Módulo de Metas — Estrutura e Indicadores', $BOT$
**Tabelas:**
- goal_metric_definitions: catálogo de métricas (metric_name, unit, area_key)
- goal_definitions: instância de meta (metric + scope + nome)
- goal_versions: versão com target_value e period_start/period_end
- goal_snapshots: registro periódico de valor atual, ideal, status

**Indicadores por área:**
- trafego: mql_count, cost_per_mql (CPMQL), cpmql
- prevendas: agendamentos, response_time, conversion_rate
- vendas: closed_count, closed_revenue, conversion_rate

**Status de snapshot:** "on_track" | "at_risk" | "behind" | "achieved"

**Regra importante:** Cada indicador declara modo (COHORT ou PRODUTIVIDADE) explicitamente. Consultar goal_versions para period_start/period_end correto antes de chamar query_goals.

**Tabela legada `metas`:** Ainda existe para compatibilidade. Use goal_versions para dados atuais.
$BOT$, 40),

('sdr_regras', 'SDR — Regras e KPIs de Pré-Vendas', $BOT$
**SDR por oportunidade:** Usar `oportunidades.sdr_name` como fonte primária. Fallback: `contatos.owner_name`. NUNCA exibir traço ("—") sem tentar ambos.

**SDRs oficiais:** Apenas usuários em `ghl_users` com `papeis @> '["sdr"]'` e `deleted = false`. Filtrar leads por SDRs oficiais para rankings.

**SDR IA:** Existe um SDR automatizado. Para KPIs humanos, verificar se é SDR real em ghl_users.

**Tempo de Resposta:** Medir apenas mensagens outbound manuais (ghl_source='app', direction='outbound', channel IN ['whatsapp','sms','call']). Excluir mensagens da IA.

**% Sem Resposta:** Leads que nunca receberam nenhuma mensagem outbound manual do SDR atribuído.

**Agendamento em 7 dias:** KPI que mede se o SDR agendou reunião em até 7 dias após `data_lead_recebido`.

**Leads parados:** Em pré-vendas sem `data_conectado` após N dias. Filtrar por pipeline Pré-Vendas MQL (não Recuperação).
$BOT$, 50),

('organico_canais', 'Canais Orgânicos — Regras', $BOT$
**Definição orgânico:** Lead com `contatos.utm_source` NÃO cadastrado em `utm_sources` (pagas). Podem ter utm_source NULL ou de `utm_sources_plain`.

**Tabela utm_sources_plain:** Canais orgânicos catalogados (Instagram Orgânico, Indicação, YouTube, etc.). Sem public_code.

**Painel Orgânico:** Módulo separado do Tráfego Pago. Agrupa por canal via utm_sources_plain.nome.

**Funil orgânico:** Usa COHORT por padrão. Mesmo funil: Leads → MQLs → Conectados → Agendados → Reuniões → Vendas.

**Canal não cadastrado:** Se utm_source do contato não está em nenhuma tabela de canais, agrupar como "Sem canal".
$BOT$, 60),

('timezone_datas', 'Timezone e Tipos de Data — Regras Técnicas', $BOT$
**Dois tipos de coluna de data:**

1. TIMESTAMPTZ (data_lead_recebido, data_pagamento_entrada, created_at): requer conversão São Paulo
   - Filtrar: WHERE data_lead_recebido >= '2026-03-01T00:00:00-03:00' AND <= '2026-03-31T23:59:59-03:00'
   - Formato: 'YYYY-MM-DDTHH:MM:SS-03:00'

2. DATE (data_conectado, data_agendamento_reuniao, data_realizacao_vendas, data_fechado, etc.): string direta
   - Filtrar: WHERE data_conectado >= '2026-03-01' AND <= '2026-03-31'
   - SEM sufixo de timezone

**NUNCA usar created_at** como data de evento de negócio.

**data_lead_recebido:** Preenchida EXCLUSIVAMENTE pela edge function `sync-opp-dates` via API GHL. O webhook NÃO toca esse campo.
$BOT$, 70)

ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  ordem = EXCLUDED.ordem,
  ativo = true;
