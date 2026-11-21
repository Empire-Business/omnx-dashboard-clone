# CI gate — suite de isolamento cross-tenant

> **21/11/2026:** a empresa não usa mais GitHub Actions. O workflow `integration-isolation.yml`
> saiu; a mesma suite roda à mão com `bash scripts/testar-isolamento.sh` (pula sem as variáveis
> `SUPABASE_*`/`TEST_PROJECT_REF` do projeto de TESTE). O texto abaixo é o histórico.

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Workflow ativo e corrigido; ⚠️ enforcement de branch protection bloqueado por plano do GitHub |
| **Branch** | `chore/ci-isolation-gate-path-fix` |
| **Workflow** | `.github/workflows/integration-isolation.yml` |

---

## 1. O que já existia

O workflow `Integration — Multi-tenant Isolation` já rodava a suite completa de
integração (`vitest -c eb-dash2/vitest.integration.config.ts run`) — incluindo
`workspace-isolation.test.ts` (132 provas cross-tenant, ampliado em 2026-07-11 de 124
para cobrir as 79 tabelas com `workspace_id`), `workspace-deletion-requests-isolation.test.ts`
(novo, 6 provas — tabela sem cobertura dedicada até então), `credential-isolation.test.ts`,
`agency-isolation.test.ts`, os testes estruturais de guard novos (item 1/2/3) etc. —
a cada push/PR, contra o projeto Supabase de TESTE (`fgjbmdsucruvtpywyhhf`), protegido
por `__tests__/helpers/safe-guard.ts` (aborta se apontar para produção).

## 2. Achado corrigido nesta branch

O filtro `paths:` do trigger tinha um caminho **inexistente**:
`eb-dash2/supabase/migrations/**` — a pasta `eb-dash2/supabase/` nunca existiu; as
migrations reais ficam em `supabase/migrations/` (raiz do repo). Além disso, o
trigger **não incluía `supabase/functions/**`** — ou seja, um PR que só alterasse
edge functions ou migrations (exatamente o tipo de mudança dos itens 1, 2 e 3 desta
sessão) **não disparava a suite automaticamente** a menos que também tocasse
`__tests__/**` ou `eb-dash2/src/**`. Nas PRs desta sessão o workflow rodou porque
cada uma também adicionou um teste novo em `__tests__/**` — mas isso era coincidência,
não garantia estrutural.

**Corrigido:** `paths` agora inclui `supabase/migrations/**` e `supabase/functions/**`
(além de `__tests__/**`, `eb-dash2/src/**` e o próprio arquivo do workflow).

## 3. Limitação conhecida — branch protection

O ideal para "fechar como gate" seria configurar branch protection em `main` exigindo
o check `RLS cross-tenant isolation` como **obrigatório** antes de qualquer merge
(bloqueio automático do GitHub, não dependente de disciplina humana/IA). Tentativa:

```bash
gh api repos/Empire-Business/GHL-SUPABASE/branches/main/protection
# → 403: "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

**Repositório é privado** (`docs/SINGLE-TENANT-LOCK.md`/regra de segurança) e o plano
atual do GitHub não inclui required status checks em repositórios privados. Duas
saídas possíveis, nenhuma aplicada automaticamente por não ser decisão técnica:
1. Upgrade para GitHub Pro/Team (habilita branch protection em repo privado).
2. Manter o repositório privado sem enforcement automático — a suite roda e FALHA
   o job do Actions (visível na aba Checks do PR e no `gh pr checks`), mas nada
   impede um merge manual com o check vermelho.

**Enforcement atual, até a decisão acima:** processual — a regra 1.6 do
`CLAUDE.md`/OMNX (gate de segurança) e a disciplina desta sessão de sempre rodar a
suite completa e conferir `gh pr checks`/vitest local antes de cada merge.

## 4. Validação

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/integration-isolation.yml'))"
# YAML válido
gh run list --workflow=integration-isolation.yml --limit 5
# runs recentes: success
```
