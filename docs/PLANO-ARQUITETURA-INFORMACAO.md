# Plano de Arquitetura de Informação — quem é dono de quê no dashboard

**Data:** 2026-07-12 · **Status:** proposta para aprovação do dono · **Escopo:** só documento, nenhuma linha de código de produto foi alterada por este plano.

---

## 1. O princípio (como foi definido pelo dono)

> Cada aba é dona de uma etapa do processo. Fora da aba dona, mostra-se apenas o **RESULTADO**. Dentro dela, a **MECÂNICA**.
> - Tráfego é dona do investimento e do clique.
> - Aquisição é dona do lead.
> - Pré-venda é dona da qualificação e da reunião.
> - Vendas é dona do fechamento.

**Teste prático:** se a métrica **JULGA** o desempenho da aba onde está, ela fica. Se **EXPLICA** o funcionamento de outra etapa, volta pra casa dela. O contexto vem do filtro, não da duplicação.

Este documento aplica esse teste a **todo card, gráfico, tabela e métrica** hoje visível no dashboard (`eb-dash2/src/pages/`), levantados por leitura direta do código (hooks, componentes, colunas Supabase) — não por suposição.

---

## 2. Mapa real de rotas → componente (fato verificado, não o que o menu sugere)

| Rota | Label no menu | Componente que realmente serve a rota | Abas |
|---|---|---|---|
| `/trafego` | **Tráfego** | `pages/dashboard/DashboardPage.tsx` (não existe "TrafegoPage") | Visão Geral, Matriz, Leads |
| `/traqueamento` | **Traqueamento** | `pages/traqueamento/TraqueamentoPage.tsx` | CODS UTM, Origem, Anúncios, Orgânico, Funis |
| `/aquisicao` | **Aquisição** | `pages/aquisicao/AquisicaoPage.tsx` | Visão Geral, Matriz, Leads |
| `/organico` | **Orgânico** | `pages/organico/OrganicoPage.tsx` (reusa `AquisicaoTab`/`MatrizTab`/`LeadsTable` da Aquisição) | Visão Geral, Matriz, Leads, Meta MQL |
| `/pre-vendas` | **Pré-Vendas** | `pages/prevendas/PreVendasPage.tsx` | Discagem, Agendamentos, Atividades, MQLs, SDRs, Funil, Auto Agendados, Leads Parados, Auditoria IA |
| `/vendas` | **Vendas** | `pages/vendas/VendasPage.tsx` | Visão Geral, Matriz, Reuniões, Cami |
| `/recuperacao` | **Recuperação** | `pages/recuperacao/RecuperacaoPage.tsx` — **reusa 100% das abas do Pré-Vendas** (`GeralTab`, `SDRsTab`, `MQLsCohortTab`, `AutoAgendadosTab`, `LeadsParadosTab`, `DiscagemTab`), só troca `pipelineMode` para `'only_recuperacao'` | (mesmas do Pré-Vendas) |
| `/sdr-ia` | **SDR IA** | `pages/sdr-ia/SdrIaPage.tsx` | Auditoria IA, Configuração |
| `/relatorios` | **Relatórios** | `pages/relatorios/RelatoriosPage.tsx` | Cohort, Produtividade, Comparativo, Tendências, Automações |
| `/metas` | **Metas** | `pages/goals/GoalsPage.tsx` | Visão Geral, Acompanhamento, Metas, Histórico |
| `/leads` | **Leads** | `pages/leads/LeadsPage.tsx` | Lista, Limpeza |
| `/criativos` | **Criativos** | `pages/criativos/CriativosPage.tsx` | Dashboard, Ranking, Biblioteca, Kanban, Testes |
| `/disparos` | **Disparos** | `pages/disparos/DisparosPage.tsx` | Dashboard, Configuração |

**Dois achados de código morto encontrados durante o inventário** (não fazem parte de nenhuma rota, mas existem no repositório):
- `pages/prevendas/tabs/GeralTab.tsx` (681 linhas) — versão completa de funil com KPIs de MQL/Conectados/Agendados/Reuniões/Fechados/Taxas, Matriz Cohort e donuts por campanha. **Não é importado em lugar nenhum.**
- `pages/dashboard/tabs/CriativosTab.tsx` (961 linhas) — tabela de criativos por investimento/CPL/CPMQL/CTR/CPM. **Não é importado em lugar nenhum.**

Isso já é relevante para a arquitetura: parte da duplicação que você percebeu pode ter nascido desses arquivos órfãos sendo copiados/adaptados em vez de removidos.

---

## 3. Inventário condensado — o que cada aba mostra hoje

A tabela completa lead-a-lead (todo card, hook, coluna Supabase) está no apêndice ao final. Aqui, o resumo por módulo com a classificação já aplicada.

Legenda: 🟢 **em casa** (é o resultado/mecânica que a etapa deveria mostrar) · 🟡 **mecânica de outra etapa, exibida como resultado aqui** (candidato a virar recorte via filtro, não card fixo) · 🔴 **fora de casa** (deveria se mudar) · ⚪ **transversal por natureza** (não se aplica a regra)

### Tráfego (`/trafego`, `DashboardPage` + `TrafegoTab`/`MatrizTab`/`LeadsTab`)

| Item | Classificação | Nota |
|---|---|---|
| Investimento, CPMQL, Meta CPMQL, gráfico Investimento×CPMQL, Cruzamento Meta×CRM | 🟢 em casa | núcleo de "investimento" |
| MQLs (contagem), CPMQL | 🟢 em casa como custo, mas a *contagem* de MQL é qualificação (ver Pré-Vendas) | ambíguo — ver seção 7 |
| Vendas, CPV, Faturamento, Caixa, ROAS, ROAS Caixa, Ciclo de Compra, Ciclo de Fechamento | 🔴 fora de casa | isso é **fechamento** (Vendas), Tráfego só precisa do resultado agregado (ROAS já é isso — o problema é o detalhamento por closer/campanha que seria mecânica de Vendas) |
| Funil de Conversão completo (Leads→MQL→Agendados→Reuniões→Vendas), Conectados/Não conectados/No-shows, bloco "Etapas independentes" | 🔴 fora de casa | mistura lead+qualificação+reunião+fechamento num módulo que deveria ser só investimento/clique |
| **"Origem dos eventos" — Agendamentos por IA/humano, Reuniões por IA/humano, Vendas por IA/humano** | 🔴 fora de casa | exatamente o exemplo citado pelo dono — mecânica de Pré-Vendas |
| **"Saldo de agendamentos"** (No-shows/A realizar/Canceladas) | 🔴 fora de casa | mecânica de Pré-Vendas |
| Segmentação MQL/Reuniões/Vendas por funil/campanha/canal/criativo (12 donuts) | 🔴 fora de casa (MQL/Reuniões/Vendas) | só a segmentação de **investimento** por canal/campanha seria "em casa" |
| Matriz Cohort/Produtividade (Leads, MQLs, Conectados, Agendados, Reuniões, Fechados, Faturamento) | 🔴 fora de casa | mesma mistura do funil |
| Aba "Leads" (tabela crua de tráfego pago) | 🟡 zona cinza | é lista operacional, não card de resultado — ver seção 7 |

### Aquisição (`/aquisicao`) e Orgânico (`/organico`) — **mesmos componentes, escopo de dado diferente**

| Item | Classificação | Nota |
|---|---|---|
| **"Leads gerados"** (bloco Produtividade), coluna "Leads" da Matriz, degrau "Leads" do Funil, coluna "Entrada"/estágio "Lead Recebido" na tabela de Leads | 🟢 em casa | **único item genuinamente "lead"** em todo o módulo |
| MQLs, Conectados, Não conectados, No-shows, Agendados, Reuniões, Fechados (Funil + Matriz + bloco Produtividade) | 🔴 fora de casa | é o funil inteiro de novo — Aquisição deveria mostrar só "quantos leads chegaram e com que qualidade (proxy: MQL)", não todo o funil pós-lead |
| Prazo Médio de Compra, Ciclo de Fechamento, Faturamento, Caixa, Taxa de recebimento, ROAS, ROI | 🔴 fora de casa | fechamento (Vendas) |
| **"Origem dos eventos" (IA vs humano)** e **"Saldo de agendamentos"** | 🔴 fora de casa | mesmo componente duplicado de Tráfego — mecânica de Pré-Vendas |
| Segmentação MQL/Reuniões/Vendas por funil/campanha/mídia (Aquisição) e Meta MQL (Orgânico) | 🔴 fora de casa | idem Tráfego |
| Bloco "Score real do MQL" (na aba Leads) | 🔴 fora de casa | qualificação — mecânica de Pré-Vendas |
| Colunas "Conectado?/Ag. Reunião?/Reunião Feita?/Fechado?" na LeadsTable | 🟡 zona cinza | ok como *contexto* de uma lista operacional, não como card de resultado |

### Pré-Vendas (`/pre-vendas`) — 9 abas

| Item | Classificação | Nota |
|---|---|---|
| Discagem (fila operacional), Atividades (log de comunicação), Leads Parados (no-show pendente, follow-up) | 🟢 em casa | mecânica pura de qualificação/atendimento |
| MQLs (tabela detalhada lead-a-lead: conectado→agendado→reunião→status), SDRs (leaderboard: taxa de conexão, taxa de agendamento, tempo de resposta), Funil (por funil de marketing), Auto Agendados | 🟢 em casa | **este é o núcleo correto do módulo** — qualificação e reunião, mecânica completa |
| Agendamentos (tabela com `agendamento_origem`, badge IA/humano por linha) | 🟢 em casa | é justamente aqui que a mecânica de "quem agendou" deveria morar (ver duplicação abaixo) |
| Coluna "Fechamentos" no leaderboard de SDRs, "Faturado" em Agendamentos | 🟡 zona cinza | é **resultado** de outra etapa (Vendas) mostrado como contexto — aceitável desde que não vire dashboard de faturamento |
| Auditoria IA | 🟢 em casa, mas **duplicada** | ver seção 5 |
| `GeralTab.tsx` (código morto) | ⚫ decisão pendente | reativar como consolidação da Visão Geral, ou apagar |

### Vendas (`/vendas`)

| Item | Classificação | Nota |
|---|---|---|
| Fechados, Faturamento Bruto, Caixa Recebido, Taxa de Conversão, Taxa de Recebimento, Vendas Externas, DonutCharts Fechados por Closer/Campanha, tabela de Closers | 🟢 em casa | núcleo correto — fechamento |
| Leads, MQLs, Agendados, Reuniões, No-shows, Negociação (KPIs + Matriz) | 🟡 zona cinza | contexto do funil que termina em Vendas — aceitável como *linha de contexto*, mas não deveria ter o mesmo peso visual/segmentação que "Fechados" |
| **"Origem dos eventos" (IA vs humano)** e **"Saldo de agendamentos de vendas"** | 🔴 fora de casa | de novo, mecânica de agendamento — pertence a Pré-Vendas (mesmo sendo "agendamento de vendas", quem opera esse agendamento é o mesmo tipo de processo) |
| Conversão por Closer/Funil/Campanha/Canal (cruzando canal com fechamento) | 🟢 em casa | canal aqui é **dimensão de corte** de uma métrica de Vendas (fechamento), não duplicação de posse — está correto |
| Aba "Reuniões" (tabela com SDR, funil, canal) | 🟡 zona cinza | detalhe operacional de reunião de vendas — ok manter, mas mostra de novo dado de SDR/pré-vendas |
| Aba "Cami" (produto pontual "Cami Start") | 🔴 não se encaixa em lugar nenhum | ver seção 7 |

### SDR IA (`/sdr-ia`)

| Item | Classificação | Nota |
|---|---|---|
| Auditoria IA (Total de Problemas + 6 categorias + tabela) | 🔴 duplicação exata da mesma aba em Pré-Vendas | ver seção 5 |
| Configuração (critérios da auditoria) | ⚪ transversal/config | não é métrica, é setup — correto ficar num lugar só |

### Recuperação (`/recuperacao`)

Não tem cards próprios — é o Pré-Vendas inteiro rodando com `pipelineMode='only_recuperacao'`. **Não é duplicação de código** (é reuso de componente com filtro de pipeline diferente), mas a classificação acima do Pré-Vendas vale integralmente aqui também.

### Disparos (`/disparos`)

Métricas de campanha de mensageria (enviados/responderam/pararam/converteram, custo estimado) — usa `converteu_count` como proxy de conversão, **não é a mesma coisa que "venda fechada"** no sentido de Vendas. ⚪ Módulo isolado por natureza (canal de automação, não etapa do funil comercial) — não viola o princípio, mas o nome "converteu" pode confundir com "fechado".

### Relatórios (`/relatorios`) e Metas (`/metas`)

⚪ **Transversais por design.** Relatórios lê uma view (`v_weekly_dashboard`) que já une tráfego+pré-vendas+vendas por semana; Metas cadastra/acompanha indicadores de qualquer área (`trafego.*`, `prevendas.*`, `vendas.*`, `organico.*`). Isso é esperado e correto — **a regra "1 aba = 1 etapa" não deve ser aplicada aqui**. Ver seção 7.

### Leads (`/leads`)

Puramente operacional (lista + limpeza de teste), zero métricas agregadas. ⚪ Não viola o princípio porque não julga nem explica nada — é ferramenta de manutenção de dado.

### Criativos (`/criativos`)

Investimento/CPL/CPMQL/CPV/CTR/CPM por criativo, produtividade de produção de criativo (lead time, cycle time, yield rate, WIP). ⚪ Cross-etapa por natureza (precisa de Leads/MQL/Reuniões/Vendas para calcular CPL/CPMQL/CPV por criativo) — mas o "dono" conceitual aqui é claro: é uma **dimensão de corte** (por criativo) sobre métricas que já existem em Tráfego/Vendas, análogo ao "Canal" em Vendas. Não é duplicação de posse, é reaproveitamento correto do dado para outra pergunta ("qual criativo performa melhor").

### Traqueamento (`/traqueamento`)

Zero métricas de performance — as 5 abas (CODS UTM, Origem, Anúncios, Orgânico, Funis) são só CRUD/cadastro de taxonomia (fontes UTM, campanhas, funis, catálogo de criativos). ⚪ Não viola o princípio (não julga nem explica desempenho), mas também **não é dono de nenhuma métrica hoje** — se a intenção for que Traqueamento assuma "clique" (CTR/CPM/page views), isso exigiria construir cards que não existem.

---

## 4. Duplicações identificadas e a casa certa

| Métrica/componente | Aparece hoje em | Casa certa | Ação proposta |
|---|---|---|---|
| **`AppointmentOriginBreakdown`** (Agendamentos/Reuniões/Vendas por IA vs humano — 6 KpiCards) | Tráfego (`TrafegoTab`), Aquisição (`AquisicaoTab`), Orgânico (via reuso), Vendas (`GeralTab`) — **4 lugares** | **Pré-Vendas, aba Agendamentos** (que já tem o dado por linha, `agendamento_origem`) | Remover das outras 3 telas; se quiserem o recorte por canal/campanha, usar o filtro Canal/Funil/Campanha que Pré-Vendas já tem (ver seção 6) |
| **`AppointmentBalance`** (Saldo de agendamentos: No-shows/A realizar/Canceladas) | Tráfego, Aquisição, Orgânico (variant "pre-venda"), Vendas (variant "vendas") — **4 lugares, 2 variantes** | **Pré-Vendas** (variante pré-venda) e **Vendas** (variante vendas, só se "agendamento de vendas" for tratado como etapa própria de Vendas — ver nota abaixo) | Remover de Tráfego/Aquisição/Orgânico; decidir se a variante "vendas" fica em Vendas (fechamento tem sua própria reunião de fechamento) ou também migra para Pré-Vendas |
| **Painel "Auditoria IA"** (`AuditoriaIaPanel`, mesmo componente, mesmo hook `useAuditoriaIA`) | Pré-Vendas (aba própria) **e** SDR IA (aba própria) — mesma tela, dois lugares na navegação | **SDR IA** (é sobre a qualidade do atendimento automatizado, não sobre o funil de conversão em si) | Remover a aba de Pré-Vendas; deixar só em SDR IA. Se o hábito do time for entrar por Pré-Vendas, considerar um link/atalho, não a tela duplicada |
| Funil completo (Leads→MQL→Conectados→Agendados→Reuniões→Fechados) + Matriz Cohort/Produtividade | Tráfego, Aquisição, Orgânico, Vendas — **praticamente idêntico nos 4 módulos** | Cada módulo mostra só sua etapa + o resultado final agregado das demais (não o funil inteiro) | Ver plano de migração (seção 8) — é a mudança de maior impacto |
| Segmentação por funil/campanha/canal/criativo (donuts de MQL/Reuniões/Vendas) | Tráfego, Aquisição, Orgânico | MQL → Pré-Vendas; Reuniões → Pré-Vendas; Vendas → Vendas | Cada segmentação migra com a métrica que ela detalha |
| Três fontes não-unificadas de "quem agendou" (`agendamento_origem`, tag `[cp] sdr ia`, tag `auto agendou` + aba "Auto Agendados" baseada em `data_auto_agendamento`) | Dentro do próprio Pré-Vendas (Agendamentos, MQLs, SDRs, Auto Agendados) | Não tem "casa certa" só de UI — é um problema de modelo de dado | Ver seção 7 (o princípio não resolve isso sozinho) |
| `GeralTab.tsx` (código morto, prevendas/tabs) | Nenhuma rota | Se reativado, seria a Visão Geral consolidada de Pré-Vendas | Decisão binária: revive como aba "Geral" ou apaga (não deixar código morto) |
| `CriativosTab.tsx` (código morto, dashboard/tabs) | Nenhuma rota | Conteúdo já existe de forma mais completa no módulo Criativos → Ranking | Apagar (é redundante com Criativos/Ranking, que já tem CPL/CPMQL/CPV/CTR/CPM por criativo) |

---

## 5. Filtros cruzados — existem os necessários?

Verificado direto no código (`MultiSelectFilter`/`FilterBar` de cada página):

| Módulo | Filtros hoje | Canal/Mídia/Funil/Campanha? | SDR/Closer? |
|---|---|---|---|
| Tráfego (`DashboardPage`, via `FilterBar`) | Campanha Meta, Canal, Funil, Campanha | ✅ (Canal/Funil/Campanha) | ❌ |
| Aquisição/Orgânico | Origem, Sub-categoria, Canal, Mídia, Funil, Campanha | ✅ completo | ❌ |
| **Pré-Vendas** | SDR, Closer, Canal, Mídia, Funil, Campanha | ✅ completo | ✅ completo |
| **Vendas** | SDR, Closer, Canal, Mídia, Funil, Campanha | ✅ completo | ✅ completo |

**Conclusão prática:** a infraestrutura de filtro para o exemplo citado pelo dono ("quem quiser o recorte de tráfego, entra na Pré-venda e filtra por tráfego") **já existe** — Pré-Vendas e Vendas já têm Canal/Mídia/Funil/Campanha. A remoção da duplicação em Tráfego/Aquisição/Orgânico (seção 4) não fica órfã: quem precisar do recorte de agendamento/reunião por canal de tráfego consegue isso hoje mesmo dentro de Pré-Vendas, sem filtro novo.

**Gaps reais encontrados** (aqui sim faltam filtros/estrutura):
1. **Nenhum módulo tem filtro por "SDR IA vs Humano" como dimensão única** — porque essa dimensão não existe como coluna consolidada (é derivada de 3 fontes diferentes, seção 7). Não dá para criar o filtro sem antes resolver o modelo de dado.
2. **Nenhum módulo tem filtro por "produto/oferta"** — a aba Cami existe como aba dedicada exatamente porque não há um jeito de recortar por produto/campanha específica dentro de Vendas. Se o objetivo for eliminar abas de produto pontual, precisaria de um filtro "Oferta"/"Produto" genérico primeiro.
3. **Criativos não tem filtro cruzado por SDR/Closer** (não testado a fundo neste plano, fora do escopo de funil comercial) — não é bloqueante, mas fica registrado.

---

## 6. Onde o princípio NÃO fecha bem (sinalizado, não forçado)

1. **Relatórios e Metas são transversais por desenho.** Relatórios espelha um snapshot semanal que já une todas as etapas (é o próprio propósito do módulo: comparar semana a semana o funil inteiro). Metas cadastra indicadores de qualquer área. Aplicar "cada aba dona de uma etapa" quebraria a função desses dois módulos. **Não mexer.**

2. **Criativos é uma dimensão de corte, não uma etapa.** Ele recalcula CPL/CPMQL/CPV agrupando eventos que "pertencem" a Tráfego/Vendas, mas pela lente de "criativo" em vez de "canal" ou "closer". Isso é estruturalmente idêntico a "Conversão por Canal" dentro de Vendas (aceito acima como correto) — a métrica de fechamento é dona de Vendas, o corte por criativo é só uma dimensão. **Não é violação do princípio, é o princípio funcionando** (mecânica de outra etapa aparecendo como resultado *dentro do contexto certo* — aqui o contexto é "análise de criativo", que é o próprio propósito do módulo).

3. **A aba "Cami" em Vendas não se encaixa em nenhuma etapa clara.** Não é fechamento geral (é uma oferta específica com funil próprio de inscrito→comprador), não é pré-venda, não é tráfego. É basicamente uma página de acompanhamento de campanha isolada que foi encaixada em Vendas por falta de lugar melhor. **Recomendação:** não forçar dentro de nenhuma das 4 etapas — ou vira um "módulo de campanha/oferta" genérico e reutilizável (se houver mais casos como esse no futuro), ou fica como uma exceção documentada e aceita.

4. **As "três fontes de quem agendou" dentro do próprio Pré-Vendas não são um problema de organização de abas — são um problema de modelo de dado.** `agendamento_origem` (coluna de oportunidade, 4 valores possíveis), a tag de contato `[cp] sdr ia`, e a tag `"auto agendou"` + `data_auto_agendamento` (usada para uma aba inteira, "Auto Agendados") medem a mesma pergunta ("quem/o quê operou este agendamento?") de três jeitos que não necessariamente concordam entre si. Mover cards de tela para tela não resolve isso — evitando o esforço de menor caminho, a recomendação correta é uma frente separada e específica: unificar essas três fontes num único campo derivado (ou confirmar que `agendamento_origem` já é suficiente e as duas tags são vestigiais/redundantes), antes de decidir a UI final da métrica "agendamento por IA vs humano" na Pré-Vendas.

5. **"Traqueamento" hoje não é dono de métrica nenhuma** — é puro cadastro. O princípio "Tráfego é dona do investimento e do clique" não distingue entre o módulo "Tráfego" (que tem as métricas) e "Traqueamento" (que tem a configuração). Se a intenção de longo prazo for separar "métrica de clique/CTR/page view" para dentro de Traqueamento, isso é uma decisão de produto nova, não uma correção de duplicação — sinalizado, não presumido.

6. **Disparos usa "converteu" para uma conversão de campanha de mensageria, não para "venda fechada".** Não há duplicação de dado com Vendas (são fontes e definições diferentes — `disparo_tags.significado='converteu'` vs `vendas_fechamento.data_pagamento_entrada`), mas o nome da métrica pode gerar confusão de leitura entre módulos. Sinalizado como risco de nomenclatura, não de arquitetura.

7. **Recuperação não é uma etapa — é um recorte de pipeline do Pré-Vendas.** Herda 100% da classificação do Pré-Vendas. Isso está correto arquiteturalmente (reuso de componente, não duplicação de lógica), só registrado aqui para não ser confundido com uma 5ª etapa que precisaria de sua própria "casa".

---

## 7. Plano de migração recomendado (fases — documento, sem código)

**Fase 1 — Baixo risco, alto ganho de clareza (recomendado começar aqui):**
- Apagar os dois arquivos órfãos (`GeralTab.tsx` de prevendas — após decisão explícita de revive-ou-apaga; `CriativosTab.tsx` de dashboard) ou documentá-los como propositalmente mantidos.
- Remover a aba "Auditoria IA" duplicada de Pré-Vendas, mantendo só em SDR IA.

**Fase 2 — Remoção de duplicação de componente (`AppointmentOriginBreakdown`, `AppointmentBalance`):**
- Remover das telas de Tráfego, Aquisição, Orgânico (Vendas mantém a variante própria, ou também migra — decisão do dono na seção 4).
- Confirmar com o time que o filtro Canal/Funil/Campanha dentro de Pré-Vendas cobre os casos de uso que hoje usam a versão duplicada em Tráfego/Aquisição.

**Fase 3 — Redução do funil completo em Tráfego/Aquisição/Orgânico:**
- Maior impacto visual — envolve decidir, para cada um dos 3 módulos, qual é o "resultado agregado" que eles devem manter (ex: Tráfego mantém ROAS como número único, mas não a segmentação de Vendas por campanha) vs o que deve ser cortado por completo.
- Recomendo tratar módulo a módulo, com validação do dono a cada um, não como uma mudança única.

**Fase 4 — Resolver a fonte única de "quem agendou" (pré-requisito de modelo de dado, não de UI):**
- Frente técnica separada, fora deste documento — decidir se `agendamento_origem` vira a fonte única e as duas tags são descontinuadas/migradas.

**Fase 5 — Decisão sobre "Cami" e casos futuros similares:**
- Definir se produtos/ofertas pontuais ganham um padrão de módulo próprio ou continuam como exceção caso a caso.

---

## 8. Apêndice — inventário completo por aba (referência)

O levantamento completo, card por card, hook por hook, coluna por coluna, usado para montar as tabelas das seções 3–5 foi produzido por investigação direta do código-fonte (5 varreduras paralelas cobrindo os 13 módulos). Está disponível para consulta sob pedido caso seja necessário auditar uma métrica específica com mais detalhe do que o resumo aqui — não foi anexado na íntegra a este documento para manter o plano legível; se quiser, posso desdobrar qualquer seção específica (ex: "me dá o detalhe completo de tudo que a aba SDRs calcula") em um documento à parte.
