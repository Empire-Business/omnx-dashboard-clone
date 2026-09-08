# Arquitetura — Sistema Completo de Criativos

## Contexto
O sub-app Criativos precisa se tornar autossuficiente: criar/editar criativos nativamente, gerenciar produção em Kanban, decidir testes automaticamente e ter dashboard próprio.

## Stack
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui customizado (sem radix-ui)
- TanStack Query v5
- Supabase (auth + database + edge functions)
- Porta dev: 3222

## Banco de dados já existente
- `notion_creatives` — dados dos criativos
- `creative_tests` — testes A/B e decisões
- `creative_test_history` — histórico de eventos
- `creative_test_criteria` — critérios configuráveis por workspace
- `creative_validations` — aprovações/reprovações manuais
- `creative_comments` — comentários
- `creative_audit_log` — auditoria
- `v_creative_metrics` — view de métricas
- `get_creative_metrics(...)` — RPC de métricas

RLS já está ativo em todas as tabelas.

## Campos relevantes em `notion_creatives`
- `external_id` (CR-xxx do Notion, AN-xxx para nativos)
- `source` (`notion`, `native`, `import`)
- `status` — status de produção
- `creative_tested`, `test_started_at`, `test_ended_at`, `test_status`, `test_result`
- `aprovado`, `data_avaliacao`
- `copy_text`, `hook_text`, `cta_text`, `content_pillar`, `funnel_stage`, `objective`
- `format`, `profile`, `social_network`, `micro_program`
- `campaign_id`, `creative_type`, `mvp_status`, `learning`

## Convenções obrigatórias
- NUNCA use `SUPABASE_SERVICE_ROLE_KEY` no frontend
- Sempre filtre por `workspace_id`
- Componentes reutilizáveis em `src/components/ui/`
- Hooks em `src/hooks/useCriativos.ts` ou `src/hooks/useCreative*.ts`
- Páginas em `src/pages/criativos/`
- Tipos em `src/types/creatives.ts`

## Estrutura de abas do sub-app Criativos
1. **Ranking** — métricas reais (já existe)
2. **Biblioteca** — listagem/tabela de produção (já existe, evoluir)
3. **Kanban** — produção por status (novo)
4. **Testes** — painel de testes + Creative Funnel (novo)
5. **Dashboard** — estatísticas e alertas (novo)

## IDs e prefixos
- Notion: `CR-` + source='notion'
- Nativos: `AN-` + source='native'
- Edge function `generate-creative-code` gera próximo ID

## Métricas
- View/RPC `get_creative_metrics` reconhece `CR-` e `AN-`
- Critérios em `creative_test_criteria` definem spend/CTR/ROAS alvo

## Reunião de revisão
- Dia configurável por workspace (não hardcoded quinta)
- Guardar em `workspace_settings.settings['creative_review_day']`
