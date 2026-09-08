# Plano de Ação — Conselho dos Mestres

**Tema:** Redesenho da página inicial de administração (`/admin`) do Empire Dashboard
**Presidente:** Steve Jobs
**Decisão:** Transformar `/admin` em um command center de negócio, com a integração GHL como elemento dominante, status binário, checklist obrigatório e separação física entre configurações de negócio e de plataforma.

---

## 1. Visão da decisão

A página `/admin` hoje é um depósito de três cards genéricos (Usuários, Apps, Permissões) e esconde a integração GHL — a espinha dorsal do produto — dentro de um dropdown no header. Isso é um erro de prioridade, não de estética. Quem opera um negócio high-ticket entra no admin para ter certeza de que a máquina está ligada, não para explorar funcionalidades.

A decisão é reordenar a página em torno do que move dinheiro: a conexão GHL. Ela ocupará o centro da tela com status visual binário (vermelho/amarelo/verde) e um checklist de setup obrigatório. Enquanto o checklist não estiver verde, a página incomodará o admin com clareza — sem gritaria, sem pânico. As configurações de plataforma (Usuários, Apps, Permissões) continuarão acessíveis, mas visualmente subordinadas em uma seção inferior chamada "Plataforma".

A mudança incorpora a prioridade de Alex Hormozi, a arquitetura de experiência de Marcel Marcondes, a clareza de Sandro San, a ação imediata de Grant Cardone, a sequência leve de Russell Brunson (dentro do checklist) e a validação em paralelo sugerida por Gary Vaynerchuk.

---

## 2. Objetivos

### Objetivo macro
Reduzir o tempo médio para um novo admin deixar a integração GHL operacional sozinho para menos de 10 minutos, medido a partir do primeiro acesso à `/admin`, em 60 dias.

### 30 dias
- Nova `/admin` em produção com GHL como protagonista, status binário e checklist de setup visível.
- KPI "tempo para setup GHL verde" instalado com baseline inicial.
- 3 sessões de validação com clientes reais concluídas e ajustes de linguagem aplicados.

### 60 dias
- Tempo médio para setup verde reduzido em 50% em relação à baseline.
- Taxa de ativação GHL em 7 dias após primeiro login do admin acima de 80%.
- Nenhuma configuração crítica do admin permanece escondida em dropdowns.

### 90 dias
- `/admin` consolidada como command center: expandir para alertas de integração, status de sincronização e resumo de saúde do sistema.
- Documentação e testes de UI cobrindo o novo fluxo principal.

---

## 3. Pilares de ação

### Pilar 1: GHL como protagonista absoluto
**Origem no conselho:** Alex Hormozi, Sandro San e Grant Cardone defenderam que a integração GHL é a espinha dorsal do negócio e precisa dominar a tela.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Criar componente `GhlStatusCard` com status binário (desconectado / incompleto / conectado) e CTA principal | Frontend lead | 5 dias | Card renderiza corretamente com estados reais da API |
| Adicionar checklist de setup: Location ID, conexão API, mapeamento de campos, pipelines e stages | Frontend lead | 7 dias | Checklist reflete status real do wizard de mapeamento |
| Mover Integração GHL do dropdown Admin para o centro da `/admin` | Frontend lead | 3 dias | URL `/workspace/ghl-config` acessível via card principal na `/admin` |

### Pilar 2: Arquitetura de experiência — separar negócio de plataforma
**Origem no conselho:** Marcel Marcondes propôs separar fisicamente configurações que movem dinheiro das configurações de plataforma.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Reorganizar `/admin` em duas seções: "Negócio" (GHL, integrações futuras) e "Plataforma" (Usuários, Apps, Permissões) | Frontend lead | 5 dias | Layout aprovado visualmente e semanticamente separado |
| Redesenhar cards de plataforma para não competirem visualmente com a seção Negócio | Frontend lead | 3 dias | Cards de plataforma ocupam área menor e estão abaixo da dobra |
| Remover dropdown Admin do header ou restringi-lo a ações secundárias (perfil, logout) | Frontend lead + Product | 2 dias | Nenhuma configuração crítica depende do dropdown para ser acessada |

### Pilar 3: Métricas e validação
**Origem no conselho:** Marcel Marcondes, Alex Hormozi e Gary Vaynerchuk concordaram que métricas e observação real devem guiar os ajustes.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Instalar eventos de analytics: tempo até clicar em "Configurar GHL", conclusão de cada item do checklist, tempo total até status verde | Frontend lead + Data | 5 dias | Eventos disponíveis no dashboard de analytics |
| Definir baseline de "tempo para configurar GHL sem suporte" com dados históricos ou sessões de teste | Product + CS | 7 dias | Baseline documentada com amostra mínima de 5 contas |
| Conduzir 3 sessões de onboarding gravadas com admins reais usando a nova tela | Product + CS | 14 dias | Relatório de fricção com top 3 pontos de confusão |

### Pilar 4: Clareza e linguagem humana
**Origem no conselho:** Gary Vaynerchuk e Sandro San defenderam que a linguagem deve ser do operador, não do desenvolvedor.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Reescrever labels do checklist em linguagem de negócio (ex: "Leads estão entrando" em vez de "Mapeamento de campos concluído") | Product + Copy | 3 dias | Labels aprovados após revisão com 1 cliente real |
| Adicionar microcopy explicando por que cada passo importa | Copy | 3 dias | Cada item do checklist tem uma linha de contexto |
| Criar estados vazios amigáveis para quando a integração ainda não foi configurada | Frontend lead | 2 dias | Empty state orienta o próximo passo sem culpa |

### Pilar 5: Documentação e testes
**Origem no conselho:** necessidade de manter a governança do produto e evitar regressão.

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Atualizar `docs/ADMIN-DASHBOARD.md` com a nova arquitetura da página | Tech lead | 3 dias | Doc reflete a estrutura final e os KPIs |
| Adicionar testes de integração Playwright para o fluxo principal da `/admin` | QA / Frontend | 5 dias | Testes cobrem acesso à `/admin`, status GHL e navegação para configuração |
| Atualizar índice do `CLAUDE.md` e `docs/MUDANCAS.md` | Tech lead | 1 dia | Entradas atualizadas com data e descrição |

---

## 4. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Admins acostumados com o dropdown se perdem com a nova localização | Média | Médio | Manter redirecionamento da URL antiga `/workspace/ghl-config` e adicionar tooltip no primeiro acesso |
| Checklist binário criar ansiedade excessiva se algo estiver amarelo | Média | Médio | Usar linguagem de orientação ("Próximo passo") em vez de alarme; nunca bloquear acesso, apenas destacar |
| Métricas não refletirem realidade se onboarding for guiado por suporte | Alta | Alto | Instrumentar eventos desde o primeiro login e separar contas "self-service" das "assistidas" |
| Página ficar polida demais e perder foco ao adicionar novos cards no futuro | Baixa | Alto | Documentar princípio de hierarquia: só entra na seção Negócio o que move dinheiro; o resto vai para Plataforma |

---

## 5. Próximo passo imediato

**Nas próximas 24-48h:**
Criar um protótipo visual estático da nova `/admin` em um arquivo HTML ou Figma/pen, validando a hierarquia visual com o usuário (dono do produto). O protótipo deve mostrar: (1) card GHL grande no topo com estados vermelho/amarelo/verde, (2) checklist de setup, (3) seção Plataforma abaixo com Usuários, Apps e Permissões. Após aprovação visual, partir para implementação no React.

---

## 6. Como acompanhar

- **Revisão semanal das métricas:** tempo médio para setup GHL verde, taxa de ativação em 7 dias, taxa de contas com GHL ativa vs. cadastrada.
- **Reunião de ajuste:** toda segunda-feira, 15 minutos, com frontend lead + product + CS.
- **Decisão de escalada:** se após 30 dias o tempo médio de setup não tiver reduzido 30%, convocar novo conselho focado em onboarding.
