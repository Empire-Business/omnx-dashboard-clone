# Sub-app Criativos

> **Decisão:** separar o controle e teste de criativos de anúncios do módulo `Traqueamento` e do Painel de Tráfego em um sub-app próprio.
> **Data da decisão:** 2026-06-30
> **Fonte:** conselho-app-criativos-2026-06-30
> **Atualizado em:** 2026-07-02 16:30 BRT

---

## Visão geral

O sub-app **Criativos** centraliza o ciclo de vida completo de peças de anúncio (copy, imagem, vídeo, hook, CTA). Ele nasce do conselho dos mestres com foco em:

- Domínio separado de `Traqueamento` e do Painel de Tráfego.
- Decisão numérica: cada criativo vive, morre ou escala com base em CPL/CPMQL/ROAS.
- Cadastro nativo: criativos novos recebem código `AN-XXXX` e não dependem do Notion.
- Soberania dos dados: o app é a fonte de verdade para teste e decisão.
- Segurança: RLS por workspace, sem `service_role` no frontend.

---

## Estrutura

### Frontend

| Arquivo | Responsabilidade |
|---------|------------------|
| `eb-dash2/src/pages/criativos/CriativosPage.tsx` | Página principal com 5 tabs |
| `eb-dash2/src/pages/criativos/tabs/RankingTab.tsx` | Ranking com métricas reais por criativo |
| `eb-dash2/src/pages/criativos/tabs/BibliotecaTab.tsx` | Produção paga + formulário de criar/editar |
| `eb-dash2/src/pages/criativos/tabs/KanbanTab.tsx` | Kanban de produção com 12 status |
| `eb-dash2/src/pages/criativos/tabs/TestesTab.tsx` | Painel de testes + Creative Funnel |
| `eb-dash2/src/pages/criativos/tabs/DashboardTab.tsx` | KPIs, alertas e configuração da reunião |
| `eb-dash2/src/pages/criativos/components/CreativeFormDialog.tsx` | Formulário nativo de criar/editar criativo |
| `eb-dash2/src/pages/criativos/components/KanbanBoard.tsx` | Board e drag-and-drop |
| `eb-dash2/src/hooks/useCriativos.ts` | Listagem, métricas, campanhas, atualização de status |
| `eb-dash2/src/hooks/useCreativeTests.ts` | Critérios, fila de testes, decisões |
| `eb-dash2/src/hooks/useCreativeDashboard.ts` | KPIs, alertas, configuração de reunião |
| `eb-dash2/src/lib/apps/navigation.ts` | Navegação do app Criativos na sidebar |
| `eb-dash2/src/types/apps.ts` | Catálogo de apps com slug `criativos` |
| `eb-dash2/src/types/creatives.ts` | Tipos compartilhados de criativos |
| `eb-dash2/src/App.tsx` | Rota `/criativos` protegida por permissões |

### Backend

| Arquivo | Responsabilidade |
|---------|------------------|
| `supabase/migrations/20260630170000_add_criativos_app.sql` | Ativa o app `criativos` nos workspaces existentes |
| `supabase/migrations/20260630180000_evolve_notion_creatives_mvp.sql` | Adiciona `creative_type`, `mvp_status`, `learning`, `campaign_id` à `notion_creatives` |
| `supabase/migrations/20260701200000_support_native_creative_prefix.sql` | Suporta `CR-` (Notion) e `AN-` (nativo) nas métricas |
| `supabase/migrations/20260702000000_creative_system_base.sql` | `workspace_settings`, `v_creative_status_counts`, índices e critérios padrão |
| `supabase/functions/workspace-apps/index.ts` | Catálogo da edge function inclui `criativos` |
| `supabase/functions/generate-creative-code/index.ts` | Gera próximo `AN-XXXX` ou `CR-XXXX` por workspace |
| `supabase/functions/notion-creatives-sync/index.ts` | Sync do Notion mantido, preenche `source='notion'` |

### Tabela base

`notion_creatives` é a tabela central. Campos principais:

- `external_id`: `CR-XXXX` (Notion) ou `AN-XXXX` (nativo)
- `source`: `notion`, `native`, `import`
- `status`: 12 status de produção (ideia → arquivado)
- `creative_type`: `copy`, `imagem`, `video`, `hook`, `cta`
- `mvp_status`: `testando`, `aprovado`, `reprovado`
- `learning`: aprendizado da peça
- `campaign_id`: FK para `ads_campaigns(id)`
- `copy_text`, `hook_text`, `cta_text`, `content_pillar`, `funnel_stage`
- `test_status`, `test_result`: resultado do teste
- `aprovado`, `data_avaliacao`: aprovação manual

Métricas vêm da view/RPC `get_creative_metrics` (reconhece `CR-` e `AN-`).

---

## Como usar cada aba

### 1. Ranking

**Para que serve:** ver a performance de cada criativo em números, igual ao ranking da aba Tráfego.

**Como usar:**
- Escolha o período no topo.
- Use os filtros (campanha, conjunto, anúncio, canal, funil, campanha [cp], MQL).
- A tabela mostra: investimento, faturamento, caixa, leads, CPL, MQL, CPMQL, reuniões, vendas, CPV, CTR, CPM, conv. página e video hook.
- Clique no cabeçalho de qualquer coluna para ordenar.
- Clique no botão **"Colunas"** para escolher quais colunas exibir e em qual ordem.
- Clique no botão **"Só com MQL"** para ocultar criativos sem MQL.
- Clique no número de **Leads**, **MQLs**, **Reuniões** ou **Vendas** para abrir a lista de leads (drill-down).
- Clique na seta ao lado do criativo para expandir e ver o breakdown por público (adset).
- Clique no código do criativo (se tiver link) para abrir o anúncio no Instagram/Facebook.

**Funcional?** ✅ Sim. Métricas reais do Meta Ads + CRM, com colunas configuráveis, ordenação, expansão por público e drill-down de leads.

---

### 2. Biblioteca

**Para que serve:** listar, criar e editar criativos.

**Como usar:**
- Veja todos os criativos pago em uma tabela paginada.
- Use a busca por nome ou código.
- Filtre por status, formato, perfil, campanha, etc.
- Clique em **"Novo Criativo"** para criar um criativo nativo (`AN-XXXX`).
- Clique em **"Editar"** em qualquer linha para alterar metadados (nome, copy, hook, CTA, formato, campanha, links, etc.).
- Use os botões de ação para marcar como testado, aprovar ou reprovar.

**Funcional?** ✅ Sim. Criação e edição nativas funcionando; sync com Notion mantido.

---

### 3. Kanban

**Para que serve:** acompanhar a produção dos criativos visualmente.

**Como usar:**
- Cada coluna é um status de produção (Ideia, Roteiro, Produzindo, Revisão, Ajustes, Aprovado, Pronto, Em Teste, etc.).
- Arraste os cards entre as colunas para mudar o status.
- Filtre por origem (Notion/Nativo/Import/Todos) e busque por nome ou código.
- Cada card mostra o código, nome, formato, dono e origem.

**Funcional?** ✅ Sim. Drag-and-drop atualiza o status no banco.

---

### 4. Testes

**Para que serve:** decidir se um criativo vive, morre ou escala com base em números.

**Como usar:**
- A fila mostra criativos prontos ou em teste.
- Clique em **"Iniciar Teste"** para colocar um criativo em teste.
- O sistema compara os números reais (spend, CTR, leads) com os critérios configurados em `creative_test_criteria`.
- A sugestão automática aparece em cores:
  - 🟢 **Aprovar / Escalar** — dentro dos critérios
  - 🔴 **Reprovar / Matar** — fora dos critérios
  - 🟡 **Aguarde** — ainda sem dados suficientes
- Clique na sugestão ou em um dos botões de ação e informe o motivo.

**Funcional?** ✅ Sim. Fila, critérios, sugestão automática e decisão funcionando.

> **Nota técnica:** as decisões em inglês (`approved`, `rejected`, `scale`, `kill`) são mapeadas para os valores permitidos pelo CHECK constraint de `notion_creativos.test_result` (`aprovado`, `reprovado`, `pendente`, `retestar`) antes de salvar. Cada início de teste e cada decisão também registram um evento em `creative_test_history`, usado pelo Dashboard para calcular lead time e cycle time.

---

### 5. Dashboard

**Para que serve:** ver a saúde geral da produção de criativos.

**Como usar:**
- Cards de KPIs: total de criativos, distribuição por status, taxa de aprovação, CPL médio por formato.
- Gráfico de barras com a distribuição por status.
- Seção "Próxima reunião" — escolha o dia da semana em que o time revisa os criativos.
- Alertas:
  - Criativo "pronto" há muito tempo sem iniciar teste
  - Teste sem leads há X dias
  - Critérios de teste não configurados

**Funcional?** ✅ Sim. KPIs, alertas e dia configurável da reunião funcionando.

---

## Fluxo de uso recomendado

1. **Biblioteca:** cadastre ou edite criativos novos (`AN-`).
2. **Kanban:** mova os cards pela produção até "Pronto".
3. **Testes:** inicie o teste e acompanhe os números.
4. **Testes:** decida (aprovar/escalar/reprovar/matar) com base na sugestão.
5. **Ranking:** acompanhe a performance histórica.
6. **Dashboard:** use na reunião semanal para tomar decisões em conjunto.

---

## Integrações

- **Painel de Tráfego:** o ranking completo ainda pode ser acessado em `/trafego?tab=criativos`, mas a tab foi removida da navegação principal. O sub-app consome as mesmas métricas sem duplicar dados.
- **Traqueamento:** o módulo continua com Catálogo/Gerador de UTMs e Produção Notion orgânica, mas o controle de teste e decisão migra para o sub-app Criativos.
- **Meta Ads:** métricas continuam sendo calculadas via `meta_ads_insights` + CRM pela `v_creative_metrics` / `get_creative_metrics`.
- **Notion:** sync mantido. Criativos do Notion continuam com prefixo `CR-`. Novos criativos no app usam `AN-`.

---

## Segurança

- RLS ativado em `notion_creatives`, `workspace_apps`, `app_role_permissions`, `app_user_overrides`, `workspace_settings`, `creative_test_criteria`, `creative_tests`, `creative_test_history`, `creative_validations`.
- O frontend nunca usa `SUPABASE_SERVICE_ROLE_KEY`.
- Acesso por workspace via `workspace_members`.

---

## Próximos passos (pós-MVP)

- Upload de assets diretamente no app (`raw_asset_url`, `final_asset_url`).
- A/B test formal entre criativos.
- Reaproveitamento orgânico dos criativos aprovados (conteúdo para Instagram/TikTok/LinkedIn).
- Notificações e lembretes para a reunião semanal de decisão.
- Relatório semanal automático.

---

## Regras de manutenção

- Ao alterar este sub-app, mantenha a Sidebar e o AppHub sincronizados.
- Qualquer mudança em `notion_creatives` deve preservar colunas usadas pelo Painel de Tráfego.
- Novas migrations devem seguir o padrão `YYYYMMDDHHMMSS_descricao.sql`.
