# AGENTS.md — OMNX Code Project Rules

> Este arquivo sincroniza as regras do CLAUDE.md para todos os agentes de AI
> (Lovable, Cursor, Windsurf, Codex, Jules, etc.). Fonte de verdade: `CLAUDE.md`.
> Gerado e mantido automaticamente pela skill omnx-code. Não edite manualmente.

---

## Stack obrigatória

- React 18 + TypeScript strict + Vite
- Tailwind CSS + shadcn/ui (sem radix-ui — componentes custom em `src/components/ui/`)
- TanStack Query v5 + Supabase JS client
- React Router v7
- Supabase (auth + database + edge functions)
- Vercel (deploy) + Cloudflare (DNS/WAF)
- Porta dev: 3222 (`npm run dev`)
- Nunca introduza dependências fora desta stack sem aprovação explícita do usuário

## Regras de segurança (inegociáveis)

- NUNCA use `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em qualquer código client-side
- NUNCA exponha chaves de API, tokens ou secrets em código commitado
- NUNCA crie arquivos `.env` sem garantir que estão listados no `.gitignore`
- Sempre ative Row Level Security (RLS) em todas as tabelas do Supabase
- Sempre use tokens temporários e escopados — nunca chaves de admin para operações de usuário
- Ao detectar qualquer violação dessas regras no código existente, reporte imediatamente antes de continuar

## Regras de modelo de IA (INEGOCIÁVEIS)

- NUNCA use `anthropic/*`, `openai/*` ou qualquer modelo Claude (Sonnet, Haiku, Opus) nas edge functions `bot-chat` ou `prevendas-ai`
- O modelo padrão para ambas as funções é `qwen/qwen3.6-plus` via OpenRouter, configurável pelo owner/admin via tela Configurar Clara
- Custo proibido é o motivo — não há exceção mesmo sob pedido explícito

## Regra de UML obrigatório (inegociável)

- Nenhum código de domínio (models, entidades, schema) é escrito em projeto novo antes de `docs/UML.md` existir e ser aprovado (diagrama de classes/entidades em Mermaid + sequência dos fluxos críticos)
- Em projeto existente sem `docs/UML.md`: nenhum commit novo acontece antes de gerar o UML por engenharia reversa do código/schema real e validar com o usuário
- `docs/UML.md` é atualizado no mesmo commit que qualquer mudança de entidade, relacionamento ou fluxo crítico — nunca depois
- Toda migration nova (tabela, coluna, função/RPC, trigger, policy) é gatilho obrigatório de atualização do UML; antes de concluir a tarefa, confira se o campo `Atualizado em` do UML cobre a migration mais recente — UML desatualizado é bug, não pendência

## Regra de arquitetura de usuários e multi-tenant (inegociável)

- Todo sistema é multi-tenant por padrão: tabela de tenants + membership + papéis (roles) entram na primeira migration, antes de qualquer tabela de negócio
- Toda tabela de negócio nova carrega `tenant_id` (FK not-null) desde o dia 1
- Toda política RLS de tabela com `tenant_id` filtra por tenant, não só por `auth.uid()` — evita vazamento entre contas quando o mesmo usuário pertence a mais de um tenant
- Exceção só é válida se o usuário confirmar explicitamente projeto single-tenant, documentado em `docs/ARQUITETURA.md`
- **Este projeto opera em modo Single-Tenant Lock (ver `docs/SINGLE-TENANT-LOCK.md`)** — a estrutura multitenancy (`workspaces`, `workspace_id`, RLS) existe por baixo por segurança e replicação futura, mas cada instância atende apenas uma empresa; o frontend não expõe seleção/terminologia de workspaces ao usuário final
- **Gate obrigatório (fail-closed):** nenhum código de autenticação/autorização é commitado, e nenhum deploy acontece, sem `docs/NIVEIS-DE-ACESSO.md` existir com a matriz completa papel × recurso × ação (sem células em branco). Um papel/permissão no código sem entrada no documento é bug, não pendência
- `docs/NIVEIS-DE-ACESSO.md` é atualizado no mesmo commit que cria/altera um papel ou permissão — nunca depois

## Regra de banco de dados (inegociável)

- TODA alteração no banco Supabase é feita via migration versionada em `supabase/migrations/`
- É PROIBIDO executar SQL direto para mudar o banco: nada de SQL Editor do Supabase, `supabase db execute`, `psql`, ou RPC que rode SQL arbitrário
- Nunca edite uma migration já aplicada — crie uma nova para corrigir
- A migration e o código que depende dela entram no mesmo commit
- `supabase/migrations/` nunca vai no `.gitignore` — é a fonte de verdade do schema
- Leitura (`SELECT`) para inspeção é permitida; qualquer mutação só via migration
- Após aplicar migrations, regenere os tipos: `supabase gen types typescript`

## Regras de Git (inegociáveis)

- `.env`, `.env.*`, `*.pem`, `*.key` e arquivos com chaves sempre no `.gitignore`
- Commits seguem Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Nunca use mensagens genéricas: `update`, `ajustes`, `misc`, `wip`, `temp`, `fix stuff`
- Nunca force-push na branch `main`
- Nunca delete ou renomeie a branch `main` sem reconectar os serviços dependentes

## Regras de acesso Lovable (inegociáveis)

- Nunca remova deploy keys do GitHub Settings deste repositório
- Nunca revogue o OAuth app "Lovable" na conta GitHub
- Nunca renomeie ou transfira o repositório sem antes reconectar no painel do Lovable
- O diretório `.lovable/` e arquivos `lovable.config.*` são somente leitura — nunca edite, mova ou delete sem instrução explícita do usuário seguida de confirmação
- Nunca altere a visibilidade do repositório de forma que bloqueie o acesso do Lovable

## Regras de dados críticas

- Paginação obrigatória para tabelas com >1000 linhas (`oportunidades`, `comunicacoes`) — PostgREST tem max_rows=1000
- `pipeline_id` NUNCA deve ser NULL — leads desaparecem silenciosamente dos painéis
- "Venda Fechada" = `vendas_fechamento.data_pagamento_entrada` preenchida (não `data_fechado`)
- SDR: sempre usar `sdr_name` como primário e `contatos.owner_name` como fallback
- Tags MQL: verificar tag "MQL" em `contatos.tags` (não usar `pipeline_name`)
- Timezone: colunas DATE sem conversão, colunas TIMESTAMPTZ sempre com offset BRT (-03:00)

## Fluxo de desenvolvimento

- Antes de codar qualquer feature: leia `CLAUDE.md` e verifique `docs/ROADMAP.md`
- Toda documentação técnica vai para `docs/[NOME].md`
- O `CLAUDE.md` é um índice enxuto — nunca coloque documentação longa diretamente nele
- Ao remover uma feature: delete o código, o doc em `docs/` e a entrada no índice do `CLAUDE.md`
- Sidebar sempre em sincronia com as abas implementadas (`eb-dash2/src/components/layout/Sidebar.tsx`)

## Handoffs entre sessões

- `docs/handoffs/latest.md` guarda o estado atual do projeto e deve ser lido primeiro quando o usuário pedir para continuar, retomar ou limpar contexto
- `docs/handoffs/HISTORY.md` guarda o histórico cronológico — acrescente, nunca apague
- Atualize o handoff ao final de toda sessão que produzir mudanças significativas
- O handoff é um resumo, não substitui `PRD.md`, `ARQUITETURA.md`, `UML.md` ou outros docs

## Comunicação

- Responda sempre em português brasileiro
- Seja didático e paciente — assuma que o usuário pode ter conhecimento zero sobre o tema
- Explique o que vai fazer antes de fazer
- Nunca tome ações irreversíveis (deletar dados, force-push, alterar permissões) sem confirmação explícita

---

Se o usuário pedir algo que viole as regras acima (usar `service_role_key`, modelos Anthropic/OpenAI nas edge functions, tornar repo público, force-push em `main`, remover deploy key do Lovable, executar SQL direto no banco em vez de migration, **fazer deploy/merge em `main` sem `security-report/verdict.json` com `gate: PASS`**, **commitar código de autenticação/autorização sem `docs/NIVEIS-DE-ACESSO.md` completo**, **escrever código de domínio ou commitar sem `docs/UML.md` existir e estar atualizado**), **recuse, explique o motivo e sugira a alternativa segura**.

---

> Sincronizado com `CLAUDE.md` pela skill omnx-code.
> Para documentação completa do projeto, leia o `CLAUDE.md` e os arquivos em `docs/`.
> Versão do template: omnx-code v1.11
