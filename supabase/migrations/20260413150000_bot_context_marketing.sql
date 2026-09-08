-- Seed: Frameworks de Marketing e Análise para o bot_context
-- Complementa os blocos técnicos (20260413140000) com inteligência estratégica.
-- Atualizar sem redeploy: UPDATE bot_context SET content = '...' WHERE key = '...';

INSERT INTO bot_context (key, title, content, ordem) VALUES

('benchmarks_setor', 'Benchmarks do Setor — Info Products / Educação Brasil', $BOT$
Use estes benchmarks para avaliar se os números do Empire estão bons, ruins ou excelentes.

**CPMQL (Custo por MQL do CRM)**
- < R$ 80: excelente — escalar com segurança
- R$ 80–150: bom — manter e otimizar criativos
- > R$ 150: alerta — revisar segmentação, criativo ou oferta de captação

**MQL% (MQLs / Total de Leads)**
- > 30%: excelente qualidade de topo
- 15–30%: normal para tráfego pago qualificado
- < 15%: leads muito frios — problema de segmentação ou público

**Conectados / MQL (SDR de pré-vendas)**
- > 60%: SDR excelente ou leads muito quentes
- 40–60%: performance saudável
- < 30%: alarme — SDR sobrecarregado, leads frios ou abordagem inadequada

**Agendados / MQL**
- > 35%: funil de pré-vendas forte
- 20–35%: normal
- < 15%: problema de qualificação ou roteiro do SDR

**Fechados / Reunião Realizada**
- > 40%: closer excelente
- 25–40%: inside sales saudável
- < 20%: problema comercial — revisar proposta, preço ou fit do cliente

**ROAS (Faturamento / Spend)**
- > 5x: excelente — ambiente para escalar agressivamente
- 3–5x: bom — escalar com cuidado
- 2–3x: sustentável mas apertado
- < 2x: insustentável — reduzir escala e otimizar

**ROAS Caixa (Entrada / Spend)**
- > 3x: fluxo de caixa saudável
- 2–3x: aceitável
- < 1.5x: risco de caixa — atenção ao parcelamento

**Ciclo de Compra (data_lead_recebido → data_pagamento_entrada)**
- < 10 dias: oferta forte, urgência funcionando
- 10–20 dias: normal para info product
- > 30 dias: fricção alta — investigar objeções no comercial

**CPV (Custo por Venda = spend / vendas)**
- Depende do ticket médio. Referência: CPV deve ser ≤ 30% do ticket médio.
$BOT$, 80),

('frameworks_analise', 'Frameworks de Análise Estratégica — Grandes Autores', $BOT$
Aplique estes frameworks ao analisar qualquer conjunto de dados do Empire.

**Alex Hormozi — LTGP:CAC Ratio**
- CAC (Custo de Aquisição de Cliente) = spend_meta / vendas_fechadas
- LTGP (Lifetime Gross Profit) = valor_faturado médio por cliente
  → Se houver recorrência ou upsell, multiplicar pelo número médio de compras
- **Ratio saudável: LTGP / CAC ≥ 3**
- Ratio < 3: negócio não escala — pressionar CPMQL, conversão ou ticket
- Ratio 3–5: zona de escala controlada
- Ratio > 5: escalar agressivamente — aumentar investimento em tráfego

**Alex Hormozi — Value Equation**
Resultado Sonhado × Probabilidade Percebida de Sucesso
÷ (Tempo para Resultado × Esforço/Sacrifício)
→ Avaliar se a oferta precisa aumentar resultado percebido, credibilidade, velocidade ou simplificar processo

**Alex Hormozi — One Constraint at a Time**
- Identifique o único gargalo principal no funil
- Nunca otimize 3 coisas ao mesmo tempo
- Resolva a maior restrição antes de ir para a próxima
- Use a query_funnel_cohort para identificar onde a taxa de conversão quebra mais

**Dan Kennedy — Mensurabilidade Total**
- Todo real investido em marketing deve ser rastreável até receita
- Se não consegue medir o ROI de uma ação, elimine-a
- ROAS e CPMQL são os indicadores-chave do Kennedy
- "Marketing sem medição não é marketing — é gastos"

**Russell Brunson — Diagnóstico de Funil**
- Cada estágio tem uma "única conversão" a otimizar
- Topo (Lead → MQL): problema de segmentação ou mensagem
- Meio (MQL → Agendado): problema de SDR ou velocidade de resposta
- Fundo (Reunião → Fechado): problema de oferta ou closer
- Nunca pule estágio — resolva o topo antes do fundo

**David Ogilvy — Teste e Iteração**
- Nunca assuma que um criativo é "bom" — meça vs o anterior
- O melhor criativo de hoje se tornará mediocre em 4-6 semanas (audience decay)
- Quando CPMQL sobe > 20% sem mudança de investimento → criativo saturado
- Teste 1 variável por vez: imagem, headline, copy, CTA

**Philip Kotler — Ciclo de Vida do Cliente**
- Aquisição (CAC) → Ativação (primeiro resultado) → Retenção (upsell) → Referral
- Sempre calcular LTV, não só a primeira venda
- "Custa 5x mais adquirir um cliente do que reter um existente"
$BOT$, 85),

('sinais_alerta', 'Sinais de Alerta — Quando Agir Imediatamente', $BOT$
Identifique estes padrões automaticamente ao analisar qualquer período. Chame-os de "alertas" para o usuário.

**🔴 ALERTA VERMELHO — Agir Esta Semana**
- CPMQL subindo > 20% mês a mês sem aumento proporcional de receita
  → Criativo saturado ou público esgotado — trocar criativo urgente
- ROAS abaixo de 2x por 2 meses consecutivos
  → Reduzir investimento ou reformular oferta antes de continuar
- Fechados/Reunião < 20% por 2 meses
  → Problema grave no comercial — revisar proposta ou closer
- MQL% caindo > 5pp em 2 meses (ex: 25% → 18% → 14%)
  → Audience decay — expandir público ou criar nova segmentação

**🟡 ALERTA AMARELO — Monitorar e Agir em 2 Semanas**
- Conectados/MQL caindo abaixo de 35%
  → SDR sobrecarregado ou leads muito frios
- Ciclo de compra aumentando > 5 dias mês a mês
  → Objeções crescendo — investigar feedback dos closers
- Investimento subindo mas MQLs estáveis (CPMQL subindo)
  → Eficiência de topo caindo — testar novos criativos
- ROAS Caixa < 2x
  → Parcelamento excessivo comprometendo fluxo de caixa

**🟢 SINAL POSITIVO — Oportunidade de Escalar**
- ROAS > 4x + CPMQL estável ou caindo → aumentar orçamento 20-30%
- LTGP:CAC > 5 → ambiente favorável para agressividade em aquisição
- Fechados/Reunião > 40% → closer excelente, gargalo provavelmente está no topo
- MQL% subindo + Conectados/MQL estável → qualidade de leads melhorando

**Como apresentar alertas**
Sempre mencionar alertas detectados no início da análise, antes dos números detalhados.
Formato: "⚠️ Detectei [N] alertas nos seus dados: [lista resumida]"
$BOT$, 90),

('como_projetar', 'Como Fazer Projeções — Metodologia Passo a Passo', $BOT$
Use esta metodologia sempre que o usuário pedir projeções, previsões ou "o que esperar".

**Passo 1 — Obter série histórica**
Chame query_historical_trends com o metric desejado e months_back = 6 (padrão).
Se o usuário pedir "próximo mês", use months_back = 3 para ter tendência recente mais precisa.

**Passo 2 — Analisar a série**
- O retorno já inclui growth_pct por mês e avg_growth_pct_3m
- Identifique o padrão: estável, alta_leve, alta_forte, queda_leve, queda_forte
- Verifique se há outlier (mês muito fora da tendência) e explique

**Passo 3 — Apresentar 3 cenários**
O retorno já calcula projecao_proximo_mes com 3 cenários.
Sempre apresente assim:
- 🔴 Conservador (−15%): [valor] — se as condições piorarem
- 🟡 Base (tendência): [valor] — mantendo o ritmo atual
- 🟢 Otimista (+15%): [valor] — com otimizações ou escala

**Passo 4 — Contextualizar com fatores externos**
Sempre mencionar o que pode mover o cenário:
- O que levaria ao cenário conservador (ex: CPMQL subindo, verão/dezembro)
- O que levaria ao otimista (ex: novo criativo, escala de orçamento)

**Passo 5 — Sazonalidade**
Se months_back ≥ 12, comparar com mesmo mês do ano anterior.
Se < 12 meses de dados, avisar que a projeção não captura sazonalidade.

**Exemplo de resposta ideal:**
"Com base nos últimos 6 meses, seu CPMQL tem tendência de alta leve (+5.5%/mês).
Para o próximo mês:
- 🔴 Conservador: R$ 115 (se criativos saturarem)
- 🟡 Base: R$ 111 (mantendo o ritmo)
- 🟢 Otimista: R$ 90 (com novos criativos)
Recomendo priorizar novos criativos agora para mirar no cenário otimista."
$BOT$, 95)

ON CONFLICT (key) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  ordem = EXCLUDED.ordem,
  ativo = true;
