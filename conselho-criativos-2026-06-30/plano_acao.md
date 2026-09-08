# Plano de Ação — Conselho dos Mestres

**Tema:** Tornar o app de Criativos autossuficiente, rápido e independente do Notion
**Presidente:** Steve Jobs
**Decisão:** Vamos fazer um app de Criativos nativo, autossuficiente e soberano. O Notion morre como fonte de verdade; o app vive como cérebro dos criativos.

---

## 1. Visão da decisão

O app de Criativos não pode continuar sendo um espelho do Notion. A decisão do conselho, liderada por Steve Jobs, é transformá-lo no sistema nativo de gestão do ciclo de vida dos criativos: ideia, produção, teste, decisão e escala. Os 948 criativos históricos serão migrados como legado imutável, preservando memória organizacional, mas todo criativo novo ou editado passa a nascer, viver e decidir dentro do app.

Incorporamos de Alex Hormozi a centralidade da oferta: cada criativo novo deve carregar metadados de oferta (ângulo, avatar, promessa, prova, gatilho). De Russell Brunson, incorporamos a lógica do Creative Funnel, mas enxuta: dois portões binários iniciais (spend mínimo + CTR), evoluindo para ROAS. De Sandro San e Marcel Marcondes, a soberania total dos dados, KPIs com dono e RLS firme. De Gary Vaynerchuk, a obsessão por velocidade de iteração. E de Grant Cardone, a urgência de colocar o app no ar agora, sem esperar a perfeição.

Descartamos o corte total sem estrutura (geraria caos), o funil de 4 portões imediato (viraria burocracia) e a paralisia de preencher metadados nos 948 antigos antes de lançar (histórico não pode paralisar o futuro).

---

## 2. Objetivos

### Objetivo macro
Em 90 dias, o sub-app Criativos é a única fonte de verdade para criação, edição, produção e decisão de criativos do workspace, sem dependência do Notion, com carregamento inicial < 2s e decisão automática baseada em 2 portões binários.

### 30 dias
- Migrar os 948 criativos do Notion para `notion_creatives` como legado imutável (`source='notion'`)
- Congelar criação/edição no Notion e comunicar o time
- Lançar formulário nativo de criar/editar criativo com metadados de oferta obrigatórios
- Desligar a sincronização do Notion como fonte primária
- Garantir RLS por workspace e performance de listagem (paginação + índices)

### 60 dias
- Implementar Kanban de produção com os 12 status e transições validadas
- Adicionar painel de Testes com critérios configuráveis por workspace
- Ligar o Creative Funnel enxuto: 2 portões automáticos (spend mínimo + CTR)
- Construir dashboard próprio com KPIs: tempo médio entre status, taxa de aprovação, CPL médio

### 90 dias
- Evoluir Creative Funnel para ROAS e retenção
- Adicionar alertas automáticos (sem teste há +5 dias, orçamento mínimo atingido, CPL alto)
- Entregar relatório semanal automático para reunião de quinta
- Validar com métricas reais: 100% dos criativos novos criados no app, zero criação no Notion

---

## 3. Pilares de ação

### Pilar 1: Soberania dos dados e migração do legado
**Origem no conselho:** Sandro San, Marcel Marcondes e Grant Cardone concordaram que o app precisa ser a fonte única da verdade. A diferença foi a velocidade do corte — Steve Jobs optou pela transição cirúrgica, preservando o histórico.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Congelar Notion como fonte de verdade e comunicar time | Matheus / Diretor de Marketing | 24h | Nenhum criativo novo/editado no Notion após a data |
| Criar migration que marca 948 registros como `source='notion'` e adiciona colunas para metadados de oferta | Tech Lead / Dev | 7 dias | 100% dos criativos com `source` preenchido |
| Validar integridade dos 948 registros (ids CR-xxx, campos essenciais) | Tech Lead / QA | 10 dias | Zero perda de dados; audit log completo |
| Desligar edge function `notion-creatives-sync` como fonte primária | Tech Lead / Dev | 14 dias | Criativos novos não mais vêm do Notion |

### Pilar 2: Criação e edição nativas
**Origem no conselho:** Alex Hormozi defendeu metadados de oferta obrigatórios. Steve Jobs decidiu que isso vale para criativos novos/editados; os 948 legados entram sem metadados completos.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Expandir schema `notion_creatives` com campos: ângulo, avatar, promessa, prova, gatilho, source | Tech Lead / Dev | 7 dias | Schema migrado com RLS atualizado |
| Construir formulário de criar/editar criativo com validação obrigatória dos metadados | Frontend Dev | 14 dias | Formulário funcional e validado com testes E2E |
| Implementar geração automática de próximo ID `CR-xxx` | Backend / Edge Function | 10 dias | IDs gerados sequencialmente por workspace, sem conflito |
| Substituir tela de produção atual por experiência nativa no sub-app | Frontend Dev | 21 dias | Biblioteca do sub-app permite criar/editar |

### Pilar 3: Creative Funnel e decisão automática
**Origem no conselho:** Russell Brunson propôs o funil de decisão. O conselho convergiu para começar enxuto: 2 portões (spend mínimo + CTR).

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Criar tabela `creative_test_criteria` (CPL alvo, spend min/máx, janela min/máx) | Tech Lead / Dev | 14 dias | Critérios configuráveis por workspace |
| Implementar cálculo de spend e CTR por criativo a partir de `meta_ads_insights` | Backend / Edge Function | 21 dias | Métricas atualizadas automaticamente |
| Construir painel de Testes com sugestão automática: ✅ APROVADO / ❌ REPROVADO / ⏳ AGUARDE | Frontend Dev | 28 dias | Decisão sugerida para 100% dos criativos em teste |
| Adicionar gatilho manual de "Iniciar Teste" e "Finalizar Teste" | Frontend Dev | 28 dias | Fluxo funcional com testes E2E |

### Pilar 4: Performance e experiência
**Origem no conselho:** Gary Vaynerchuk defendeu velocidade de iteração. O PRD original exige carregamento < 2s e listagem paginada.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Implementar paginação (50/página) e índices otimizados em `notion_creatives` | Tech Lead / Dev | 10 dias | Listagem de 948 criativos < 2s |
| Adicionar virtualização na tabela de produção | Frontend Dev | 14 dias | Scroll fluido sem travamentos |
| Revisar e otimizar queries do sub-app Criativos (evitar N+1) | Frontend Dev | 14 dias | Lighthouse performance ≥ 80 |

### Pilar 5: Governança e KPIs
**Origem no conselho:** Marcel Marcondes e Sandro San defenderam KPIs com dono. Sem isso, o dashboard vira decoração.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Definir 4 KPIs: taxa de aprovação, tempo médio entre status, CPL médio por formato, taxa de reuso de winners | Matheus / Diretor de Marketing | 7 dias | KPIs documentados com definição e dono |
| Construir dashboard próprio com cards de KPIs e alertas | Frontend Dev | 35 dias | Dashboard atualizado em tempo real |
| Criar cadência semanal de revisão dos KPIs na reunião de quinta | Matheus | 14 dias | Reunião com dados do app, não de planilha |

---

## 4. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Perda ou corrupção dos 948 criativos na migração | Baixa | Alto | Backup PITR do Supabase; migration idempotente; validação linha a linha antes de desligar sync |
| Time continuar criando no Notion por hábito | Alta | Médio | Congelar permissões de edição no Notion; comunicação clara; onboarding no novo app |
| App fica lento com 948+ criativos nativos | Média | Alto | Paginação, índices, virtualização, PostgREST `max_rows` respeitado |
| Decisão automática errada por dados imprecisos | Média | Médio | Portões iniciais conservadores; decisão manual sempre disponível; log de cada sugestão |
| Resistência a metadados de oferta obrigatórios | Média | Médio | Campos simples, com exemplos; permitir preenchimento gradual; mostrar valor no dashboard |

---

## 5. Próximo passo imediato

**Nas próximas 24-48h:**
Matheus (ou o dono do produto) comunica oficialmente ao time que o Notion está congelado como fonte de verdade para criativos, e que todo novo criativo deve ser criado no sub-app Criativos. Em paralelo, o Tech Lead inicia a migration que adiciona `source` e os campos de metadados de oferta à tabela `notion_creatives`, preservando os 948 registros existentes.

**Como saber se foi feito:**
- Comunicação enviada no canal do time de criativos
- Migration aplicada no ambiente de dev/linked com `supabase db push`
- `SELECT source, COUNT(*) FROM notion_creatives GROUP BY source` retorna 948 registros como `notion`

---

## 6. Como acompanhar

- **Revisão semanal das métricas:** KPIs do dashboard (taxa de aprovação, tempo médio entre status, CPL médio por formato, taxa de reuso de winners)
- **Reunião de ajuste:** toda quinta-feira, usando dados do app de Criativos em vez de planilhas
- **Decisão de escalada:** se em 30 dias menos de 80% dos criativos novos forem criados no app, rever a comunicação, onboarding e UX do formulário nativo
