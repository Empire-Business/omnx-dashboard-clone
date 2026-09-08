# Plano de Ação — Conselho dos Mestres

**Tema:** Separação do app dedicado de controle e teste de criativos de anúncios
**Presidente:** Steve Jobs
**Decisão:** Criar o sub-app "Criativos" como experiência integrada, MVP enxuto e decisão numérica, separado do Traqueamento e do Painel de Tráfego.

---

## 1. Visão da decisão

O conselho concordou que criativos de anúncios são ativos de alto valor que hoje estão perdidos dentro do módulo de Traqueamento e diluídos no Painel de Tráfego. Traqueamento foi feito para medir origem e atribuição; criativo é oferta em forma de imagem, vídeo, copy, hook e CTA. Manter os dois no mesmo espaço destrói a clareza operacional e a velocidade de decisão do time.

Steve Jobs elegeu o caminho da execução rápida com experiência integrada: separar um sub-app dedicado, reutilizar a base `notion_creatives` e as migrations já existentes, manter RLS por workspace e zero `service_role` no frontend, e entregar um MVP com poucos campos, status claros, dono nomeado e métrica de morte/escala visível. A experiência do usuário — o time de tráfego abrindo o app e decidindo em segundos — é mais importante que um processo perfeito desenhado no papel.

Foram incorporados: a métrica única de Alex Hormozi (CPLQ/CPA/ROAS), o domínio separado e RLS do Sandro San, a governança mínima do Marcel Marcondes, o campo de aprendizado do Gary Vaynerchuk e a estrutura mínima de funil do Russell Brunson. Foram descartados: duas semanas exclusivas de Notion, funil de cinco estágios como requisito de lançamento e reaproveitamento orgânico como prioridade do MVP.

---

## 2. Objetivos

### Objetivo macro
Ter um sub-app "Criativos" em produção dentro de 30 dias, com pelo menos 80% dos criativos ativos do mês cadastrados, status definidos e métrica de morte/escala visível, sem quebrar o Painel de Tráfego nem perder dados históricos.

### 30 dias
- Sub-app Criativos criado, roteado e acessível via AppHub/Sidebar.
- Tela de listagem com filtros por status, dono e campanha.
- Tela de cadastro/edição com campos do MVP.
- RLS por workspace validado e 100% dos dados históricos preservados.

### 60 dias
- Métrica de morte/escala (CPLQ/CPA/ROAS) puxada automaticamente do Painel de Tráfego ou inserida manualmente com link limpo.
- Processo mínimo de hipótese/persona/promessa validado com o time.
- Primeira reunião semanal de decisão de criativos acontecendo dentro do app.

### 90 dias
- 90% dos criativos novos passando pelo app antes de ir para campanha.
- Redução de 30% no tempo de decisão aprovar/reprovar/testar em relação ao processo anterior (Notion/Traqueamento).
- Decisão sobre expansão do funil para escala/reaproveitamento baseada em uso real.

---

## 3. Pilares de ação

### Pilar 1: Arquitetura e segurança
**Origem no conselho:** Sandro San defendeu domínio separado com workspace próprio, RLS ativado e zero `service_role` no frontend; Grant Cardone pressionou por velocidade usando a base existente.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Reutilizar/estender `notion_creatives` com campos do MVP | Tech lead / backend | 5 dias | Migration aplicada sem perda de dados históricos |
| Criar políticas de RLS por workspace para leitura/escrita | Tech lead / backend | 3 dias | Testes com 2 workspaces mostrando isolamento |
| Criar sub-app Criativos na arquitetura modular (rota, catálogo, permissões) | Frontend lead | 5 dias | App aparece no AppHub e na Sidebar para quem tem acesso |

### Pilar 2: Experiência e workflow
**Origem no conselho:** Russell Brunson defendeu funil do criativo; Steve Jobs reduziu à estrutura mínima de ideia → teste → aprova/reprova → escala.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Tela de listagem com filtros (status, dono, campanha, tipo) | Frontend | 7 dias | Time consegue encontrar qualquer criativo em < 10s |
| Tela de cadastro/edição com campos MVP | Frontend | 7 dias | Cadastro de novo criativo em < 2 min |
| Ações rápidas de aprovar/reprovar/testar | Frontend | 4 dias | Decisão feita em 1 clique a partir da listagem |

### Pilar 3: Decisão numérica
**Origem no conselho:** Alex Hormozi defendeu métrica única de vida/morte; Sandro San corrigiu para custo por lead qualificado.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Definir métrica padrão (CPLQ, CPA ou ROAS) com o time de tráfego | Head de tráfego + tech lead | 3 dias | Métrica documentada e validada |
| Exibir métrica atual no card/detalhe do criativo | Frontend + backend | 7 dias | Número visível para 100% dos criativos com campanha ativa |
| Link limpo para os números do Painel de Tráfego | Frontend | 5 dias | Usuário navega do criativo para o painel sem perder contexto |

### Pilar 4: Governança e aprendizado
**Origem no conselho:** Marcel Marcondes defendeu processo mínimo viável; Gary Vaynerchuk defendeu dono nomeado e campo de aprendizado.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Definir dono e cadência semanal de revisão | Head de tráfego | 3 dias | Responsável nomeado e data fixa de reunião |
| Campo de aprendizado obrigatório ao reprovar | Frontend | 4 dias | 100% dos reprovados têm nota registrada |
| Definir hipótese/persona/promessa mínimas | Head de tráfego + copy | 7 dias | Template usado em 100% dos novos criativos |

---

## 4. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Quebra do Painel de Tráfego ao alterar `notion_creatives` | Média | Alto | Não alterar colunas existentes usadas pelo painel; adicionar novas colunas apenas; testar integração em staging |
| Time não adotar o app e continuar no Notion/Traqueamento | Alta | Alto | Definir dono nomeado, reunião semanal obrigatória e desativar edição em outros lugares após 60 dias |
| Métrica de morte/escala imprecisa ou não confiável | Média | Alto | Começar com inserção manual validada; depois automatizar com joins auditados |
| Over-engineering no MVP por causa do debate sobre funil | Média | Médio | Seguir escopo decidido por Steve Jobs: 4 estágios, sem reaproveitamento orgânico no MVP |
| Problemas de RLS fazendo usuários verem criativos de outros workspaces | Baixa | Alto | Testar RLS com múltiplos usuários/workspaces antes do deploy; nunca usar `service_role` no frontend |

---

## 5. Próximo passo imediato

**Nas próximas 24-48h:**
Mapear com o time de tráfego qual métrica será a métrica de morte/escala (CPLQ, CPA ou ROAS), quem será o dono do processo e qual será a cadência semanal de revisão. Em paralelo, o tech lead deve inspecionar a tabela `notion_creatives` e as migrations existentes para definir quais campos já existem e quais precisam ser adicionados para o MVP.

---

## 6. Como acompanhar

- Revisão semanal das métricas: número de criativos cadastrados, tempo médio de decisão, % de criativos com métrica preenchida.
- Reunião de ajuste: toda segunda-feira, 30 min, com dono do processo, tech lead e head de tráfego.
- Decisão de escalada: quando 3 criativos consecutivos forem aprovados com a mesma promessa/persona, submeter para a fase de escala/reaproveitamento.
