# Fase 7 — Reescrita do provisionamento (`--mode=agency-subaccount`)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Implementado e validado no banco de TESTE (`fgjbmdsucruvtpywyhhf`) |
| **Branch** | `feat/fase7-provisioning-agency-subaccount` |
| **Critério de "pronto" (plano-mãe)** | `docs/REPLICACAO-TECNICA.md` documenta quando usar cada modo — ✅ feito |

---

## 1. Por que esta fase (e não outra) foi priorizada

O dono pediu para avançar no que mais destrava o caminho até o primeiro tenant
real, sugerindo a Fase 7 e pedindo para eu contestar se visse algo mais crítico.
Análise:

- **Fase 2 (isolamento de credenciais):** entregue no banco de teste (9 fatias).
  Falta o cutover em produção, mas isso é uma **ação de deploy** (seed real da
  chave GHL), explicitamente fora do escopo desta sessão (decisão do dono) — não
  um trabalho de construção pendente.
- **Fase 3 (descoberta de sub-contas):** mergeada em `main`.
- **Fase 4 (BYOK):** funcional (fatias 1, 2, 4). Falta só a fatia 3 (link de
  intake para terceiro) — não bloqueia onboarding, o próprio admin cadastrado
  pode colar a chave.
- **Fase 5 (UI de gestão Agency):** MVP entregue.
- **Fase 6 (backfill):** fatia 1 (CRM) entregue; tabelas restantes
  (`meta_ads_*`/`weekly_*`/infra) não bloqueiam um workspace **novo** — o
  problema é só para dados **históricos** de workspaces já existentes.
- **Fase 7 (provisionamento):** ⬜ não iniciado antes desta sessão — e é a peça
  que **literalmente falta** para colocar qualquer sub-conta nova dentro do
  modelo Agency. Sem ela, `provision-new-client.ts` só sabe criar uma instância
  isolada nova (projeto Supabase + deploy Vercel do zero) — o oposto do que o
  modelo híbrido promete (baixo custo operacional via sub-conta compartilhada).
- **Fase 8 (LGPD/DPA):** bloqueia o **2º tenant real pagante**, não o primeiro
  tenant adicional (que a "regra de ouro" do roadmap já exige ser
  interno/de baixo risco). Não é o item que destrava o próximo passo imediato.

**Conclusão:** a leitura do dono está correta — Fase 7 é o maior destravador.
Nenhum item mais crítico foi identificado à frente dela.

## 2. O que foi implementado

`scripts/provision-new-client.ts` ganhou `--mode=agency-subaccount` (padrão
continua `isolated-instance`, comportamento 100% preservado — nenhuma mudança
para quem já usa o script hoje).

### Novidades

- `ProvisionMode = 'isolated-instance' | 'agency-subaccount'` + flag `--mode`
  (aceita `--mode valor` e `--mode=valor` — `getEnvOrArg` passou a suportar
  ambas as sintaxes).
- Flag `--agency-id` (uuid da agência dona do novo workspace).
- Flag `--execute`: nesse modo, `--create-supabase`/`--deploy-vercel` não se
  aplicam (nunca usados em `agency-subaccount`), então sem `--execute` o script
  **nunca** sairia do dry-run — o escape hatch existe para isso.
- `collectInputs`/`validateConfig` brancheiam por modo: em `agency-subaccount`,
  nunca pedem `ghl_api_key`/`webhook_secret` (o cliente conecta via BYOK depois);
  `ghl_location_id` é **opcional** (sem ele, workspace nasce `status='pending'`).
- `validateAgencyExists`: falha **antes** de criar qualquer coisa se a agência
  não existir (fail-closed, evita workspace órfão por erro de digitação do uuid).
- `linkWorkspaceToAgency`: `INSERT` em `agency_workspaces`
  (`provisioning_mode='manual_byok'`); erro claro e específico se o
  `ghl_location_id` colidir com outro workspace ativo (índice único
  `uq_agency_workspaces_location_active`), em vez de vazar o erro Postgres cru.
- `provisionAgencySubaccount` reaproveita `createWorkspace` (mesma função usada
  por `isolated-instance` — mesmo `create_workspace_with_owner`,
  `setup_workspace_apps_and_permissions`, import do template Empire Default).
- `printAgencySubaccountInstructions`: próximos passos específicos (conectar
  BYOK, convidar membros, conferir `/agency/workspaces`) em vez das instruções
  de webhook/Vercel que só fazem sentido no modo isolado.
- `main()` branca no início: se `agency-subaccount`, nunca entra no caminho de
  criar projeto Supabase/aplicar migrations/deploy de functions/Vercel.

## 3. Validação (contra o banco de TESTE, com `--execute`)

Rodado de verdade (não só dry-run) contra `fgjbmdsucruvtpywyhhf`, com uma agência
sintética criada para o teste (removida depois):

1. **Caminho feliz sem `location_id`:** workspace criado, owner criado,
   `agency_workspaces` com `status='pending'`, `provisioning_mode='manual_byok'`.
   Confirmado via query direta (`agency_workspaces JOIN workspaces JOIN workspace_members`).
2. **Caminho feliz com `location_id`:** `status='active'`.
3. **Agência inexistente:** falha ANTES de criar usuário/workspace — zero
   registros órfãos confirmado.
4. **`location_id` duplicado (já ativo em outro workspace):** erro claro e
   específico citando a constraint; workspace/owner da etapa anterior já
   tinham sido criados quando o vínculo falha — **corrigido em 2026-07-11**
   com rollback compensatório automático (item P2, ver
   [`docs/FASE-7-P2-ATOMICIDADE.md`](FASE-7-P2-ATOMICIDADE.md)): o script
   detecta a falha, reusa a RPC `purge_workspace_data` da Fase 8 para limpar
   o workspace órfão e, se o usuário owner foi criado nesta mesma execução,
   apaga-o do Auth também — validado com falha real induzida no banco de
   teste, zero órfãos confirmado. `isolated-instance` mantém o comportamento
   não-atômico original (fora do escopo desta correção — ver seção 5 do
   documento referenciado).
5. Toda a massa de teste (workspaces, `workspace_members`,
   `app_feature_role_permissions`, `permission_audit_log`, usuários, agência)
   removida ao final — banco de teste voltou ao estado anterior.

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
# 357 passed | 10 todo (0 regressão — nenhuma mudança nesta PR afeta o schema/edge functions)
cd eb-dash2 && npx tsc -b   # limpo (script fora do escopo do tsconfig do eb-dash2)
npx --yes tsx scripts/provision-new-client.ts --help   # compila e roda via tsx
```

> Este script não tem suite automatizada (não é Deno/edge function nem código do
> `eb-dash2`) — a validação é a execução real documentada acima, seguindo o
> mesmo padrão do restante do script (sempre validado por execução manual/dry-run,
> nunca por vitest).

## 4. O que NÃO foi feito nesta fase (fora de escopo)

- **Fatia de UI:** não foi criada nenhuma tela para "provisionar sub-conta pelo
  navegador" — o script CLI é a interface, como já era para `isolated-instance`.
  Se o volume de onboarding justificar, uma UI é um passo futuro separado.
- **Rollback automático:** ~~a não-atomicidade descrita na seção 2/3 não foi
  corrigida~~ — **implementado em 2026-07-11**, ver
  [`docs/FASE-7-P2-ATOMICIDADE.md`](FASE-7-P2-ATOMICIDADE.md) (item P2 do
  roadmap). Escopo do que ficou de fora dessa correção também está lá
  (seção 5: falha dentro da própria `createWorkspace` e o modo
  `isolated-instance` continuam sem rollback automático).
- **Cutover em produção:** nada foi rodado contra `qzesffnkqgelmtfblzkr` — decisão
  explícita do dono nesta sessão.
