# Plano de Ação — Conselho dos Mestres

**Tema:** Usabilidade, navegação e arquitetura de informação do dashboard Empire
**Presidente:** Steve Jobs
**Decisão:** Criar uma camada de administração soberana no topo do dashboard, fora de qualquer app, para configurações globais de apps, usuários e permissões; cada app cuida apenas do seu território operacional.

---

## 1. Visão da decisão

O Empire será tratado como plataforma, não como coleção de módulos. Configurações que afetam mais de um app — ativação/desativação de apps, permissões por papel, gerenciamento de usuários — ganham um ponto de entrada único, fixo e visualmente separado no header do dashboard. Isso elimina a confusão atual, em que o usuário precisa entrar em um app específico para governar todo o sistema.

A decisão incorpora a separação entre espaço de decisão e espaço de execução de Alex Hormozi, a hierarquia visual de Russell Brunson, as três camadas de governança de Marcel Marcondes, a noção de soberania de Sandro San e a empatia comportamental de Gary Vaynerchuk. A urgência de Grant Cardone foi absorvida na forma de métricas de tempo e cliques, mas sem sacrificar a qualidade da transição.

A implementação será feita em fases. Cada fase tem objetivo claro, responsável e critério de pass/fail baseado em métricas de usabilidade. Não haverá big bang.

---

## 2. Objetivos

### Objetivo macro

Reduzir para menos de 2 cliques e menos de 5 segundos o tempo para um administrador acessar as telas de gerenciamento de apps e permissões, a partir de qualquer ponto do dashboard, em até 30 dias.

### 30 dias
- Entregar o portal de administração soberana acessível pelo header em qualquer tela.
- Mover `/settings/apps` e `/settings/apps/permissions` para o novo espaço global.
- Implementar redirecionamentos inteligentes dos links antigos.
- Validar com 3 usuários reais e medir tempo/cliques até as telas de admin.

### 60 dias
- Refinar hierarquia visual: conta/tenant no topo, AppHub/seletor no meio, contexto operacional na base.
- Padronizar configurações contextuais dentro de cada app (estágios de pipeline, regras de atribuição, filtros padrão).
- Eliminar links antigos de configuração global que ainda existem dentro dos apps.

### 90 dias
- Medir NPS de usabilidade do dashboard e taxa de erro na navegação.
- Documentar a regra de ouro em `docs/ARQUITETURA-NAVEGACAO-EMPIRE.md`.
- Escalar padrão para novos apps e módulos futuros.

---

## 3. Pilares de ação

### Pilar 1: Administração soberana no topo
**Origem no conselho:** Sandro San (trono), Alex Hormozi (decisão vs. execução), Gary Vaynerchuk (hub de conta no topo).

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Adicionar ícone fixo de engrenagem no header, visível de qualquer app | Frontend Lead | 5 dias | Ícone renderizado em todas as rotas autenticadas |
| Criar rota `/admin` com sub-rotas `/admin/apps`, `/admin/users`, `/admin/permissions` | Frontend Lead | 7 dias | Rotas acessíveis e protegidas por papel de admin/owner |
| Mover telas existentes de `/settings/apps` e `/settings/apps/permissions` para `/admin/apps` e `/admin/permissions` | Frontend Lead + Product Lead | 10 dias | Funcionalidade preservada e URLs antigas redirecionando |
| Atualizar `Sidebar` e `AppHub` para não exibirem mais configurações globais | Frontend Lead | 12 dias | Zero referências a settings de apps fora de `/admin` |

### Pilar 2: Hierarquia visual e redirecionamentos inteligentes
**Origem no conselho:** Russell Brunson (funil de navegação), Marcel Marcondes (governança em camadas).

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Definir visualmente as três camadas: conta/admin, AppHub, app contexto | Design/UX | 14 dias | Style guide aprovado e aplicado no header e sidebar |
| Implementar redirecionamentos dos links antigos de configuração com mensagem informativa | Frontend Lead | 16 dias | Links antigos levam ao novo local sem quebrar |
| Revisar labels e ícones do seletor de apps e AppHub | Design/UX | 18 dias | Teste de 5 usuários: 100% identificam onde trocar de app |
| Ajustar dropdown do seletor de apps para nunca sair da viewport | Frontend Lead | 5 dias | Dropdown visível em resoluções 1366x768 e superiores |

### Pilar 3: Métricas e validação com usuários reais
**Origem no conselho:** Marcel Marcondes (métrica de pass/fail), Gary Vaynerchuk (teste real), Grant Cardone (velocidade medida).

| Ação | Responsável | Prazo | Métrica de sucesso |
|---|---|---|---|
| Definir métricas: tempo até tela de permissões, cliques, taxa de erro, NPS | Product Lead | 7 dias | Dashboard de métricas acordado com stakeholders |
| Gravar sessões de 3 usuários reais navegando para apps e permissões | UX/Ops | 20 dias | Relatório com pontos de fricção e tempo médio |
| Aplicar ajustes pós-teste e remediar falhas críticas | Frontend Lead + UX | 25 dias | Tempo médio < 5s e cliques < 2 em 80% dos testes |
| Criar testes automatizados de navegação para as novas rotas | QA | 30 dias | Cobertura das rotas `/admin/*` no Playwright |

---

## 4. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Usuários experientes se perderem com a nova localização de configurações | Média | Alto | Redirecionamentos inteligentes, mensagens informativas e comunicação prévia no grupo da operação |
| Links antigos de configuração espalhados pelo código não serem mapeados | Média | Médio | Busca por `/settings/apps` e `settings/apps/permissions` em todo o codebase antes do deploy |
| Conflito entre papéis (admin vs. owner vs. user) nas novas rotas | Baixa | Alto | Reutilizar lógica existente de `AppPermissionsPage` e `AppsSettingsPage`; revisar RLS e políticas de acesso |
| Mudança visual do header quebrar layout em telas pequenas | Média | Médio | Testar responsivo em 1366x768, 1920x1080 e mobile antes de merge |
| Rollout apressado gerar regressões de UX | Baixa | Alto | Fases com critérios de pass/fail; não avançar para próxima fase sem métrica |

---

## 5. Próximo passo imediato

**Nas próximas 24-48h:**

1. Product Lead e Frontend Lead se reúnem para confirmar escopo da fase 1 e mapear todos os pontos de entrada atuais de `/settings/apps` e `/settings/apps/permissions`.
2. Criar branch `feat/admin-soberano` a partir de `main`.
3. Implementar ícone de engrenagem no header e rota `/admin` vazia, protegida por papel admin/owner.
4. Escrever teste Playwright que verifica presença do ícone e acesso à rota `/admin`.

Critério de feito: build passando, teste novo passando e screenshot do header com ícone visível anexado no PR.

---

## 6. Como acompanhar

- **Revisão semanal das métricas:** tempo médio para acessar permissões, número de cliques, taxa de erro na navegação e NPS de usabilidade.
- **Reunião de ajuste:** toda terça-feira, 10h, com Frontend Lead, UX e Product Lead.
- **Decisão de escalada:** se em 15 dias o tempo médio não tiver caído pelo menos 30%, pausar a fase 2 e refazer o teste com usuários reais.
