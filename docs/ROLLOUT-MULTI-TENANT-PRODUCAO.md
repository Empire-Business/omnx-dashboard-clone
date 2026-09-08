# Rollout multi-tenant em produção — manifesto de liberação

| Campo | Estado |
|---|---|
| Atualizado em | 2026-07-13 BRT |
| Código | Fases 0–8 e bloqueadores P0 validados no banco de teste e mergeados em `main`, incluindo a PR #47 |
| Produção | PITR de 7 dias ativo; 34 migrations multi-tenant aprovadas aplicadas em 2026-07-13 por bundles controlados; nenhum item explicitamente excluído foi promovido |
| Objetivo | Transformar os bloqueios restantes em gates objetivos, sem SQL manual e sem `db push --include-all` |

Este documento é a fonte operacional para promover o multi-tenant. Ele substitui qualquer interpretação de que a existência das migrations no repositório autoriza aplicá-las em produção.

## 1. Estado concluído em engenharia

- O takeover de `workspace_members` foi fechado pela migration `20260818000000_fix_workspace_member_privilege_escalation.sql`, com 5 cenários de regressão.
- A adoção do workspace existente é aditiva e reversível: `adopt_existing_workspace_service_role` cria somente o vínculo em `agency_workspaces`; `detach_adopted_workspace_service_role` remove somente esse vínculo.
- O backfill Meta Ads agora exige `workspace_id`, resolve a chave `meta` pelo Vault e a tabela `meta_ads_account_daily` está isolada por `(workspace_id, account_id, date)`.
- Os crons de discovery e os erros públicos prioritários foram endurecidos; os detalhes permanecem apenas nos logs do servidor.
- A suíte ampla multi-tenant foi executada em 2026-07-13 contra o projeto de teste: **438 passed | 10 todo**, sem falhas. Isto **não** é evidência de produção.

## 2. Reconciliação de migrations

O histórico de produção segue a trilha histórica; os dois baselines abaixo são *squashes* para construir um banco novo e **não são migrations pendentes executáveis** sobre produção:

- `20260218000000_baseline_public_schema.sql`
- `20260710000000_baseline_contatos_oportunidades.sql`

Também ficam fora de qualquer rollout de produção:

- `20260819000000_ghl_mapping_vigilancia.sql` e `20260820000000_reseed_empire_default_template.sql`: exclusivos do ambiente de teste.
- `20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql`: correção funcional independente; planejar e validar em release próprio.

O lote multi-tenant é `20260720000000` até `20260818000000`, na ordem versionada. Os bloqueadores P0 posteriores `20260822000000_adopt_existing_workspace_service_role.sql` e `20260823000000_fix_meta_ads_account_daily_tenant_isolation.sql` entram somente após o lote base estar validado em staging.

Em 2026-07-13, com autorização explícita do dono, foi executado `supabase migration repair --status applied --linked 20260218000000 20260710000000`. A operação atualizou apenas o registro interno de migrations para reconhecer os dois baselines já incorporados ao schema histórico; não executou seus SQLs e não alterou tabelas nem dados. O `supabase migration list --linked` posterior confirmou os dois registros. A simulação seguinte completou, mas listou 38 migrations pendentes, misturando o lote multi-tenant com migrations de teste, uma correção independente e a remoção OpenClaw. Logo, o `db push` padrão continua inadequado para produção.

**Proibido:** usar `supabase db push --include-all`, aplicar os baselines em schema existente, mover arquivos para contornar o histórico ou executar SQL de mutação no SQL Editor/psql. Toda mudança continua sendo aplicada exclusivamente por migration versionada e revisada.

## 3. Gates obrigatórios, em ordem

1. [x] Ativar e registrar PITR/backup restaurável em produção — PITR de 7 dias ativado pelo dono em 2026-07-13.
2. [ ] Criar staging com snapshot anonimizado e provar paridade de schema, policies, funções, triggers e grants com produção. Em 2026-07-13, o projeto vazio `raquxboahgebposgttnb` confirmou que ele não pode receber o histórico inteiro automaticamente: seriam centenas de migrations incluindo baselines *squash*; nenhuma migration foi aplicada. Em seguida foi criada a cópia isolada `2-staging` (`suhkxlgnzcriigwrzjkh`) por **Restore to new project**. Ela responde pela API e está com URL/chaves locais separadas; falta preencher somente `TEST_DB_URL` da própria cópia para inspecionar e reconciliar seu histórico de migrations. O banco de produção não foi modificado.
3. [x] Gerar `supabase migration list` no staging e registrar o conjunto pendente. Feito em 2026-07-13 contra a cópia `2-staging`; repetido em produção após o link controlado. Com autorização explícita, os baselines `20260218000000`/`20260710000000` foram reconciliados no **histórico**, sem executar SQL. O dry-run posterior listou as 38 migrations pendentes: `20260720000000`–`20260818000000`, `20260822000000`/`20260823000000`, as exclusivas de teste `20260819000000`/`20260820000000`, a correção independente `20260821000000` e `20260824000000` da remoção OpenClaw. Consequência: `supabase db push` direto em produção continua proibido; antes é obrigatório um manifesto de release que separe o lote multi-tenant dos itens fora do escopo.
4. [ ] Aplicar o lote multi-tenant em staging, uma fase por vez, com smoke de RLS, credenciais Vault, cron e rollback ensaiado. No primeiro ensaio em 2026-07-13, `20260720000000` e `20260721000000` aplicaram; `20260722000000` interrompeu sem commit por detectar corretamente a ausência de `agencia_select_meta_ads_account_daily`. A correção `20260721120000` foi aplicada antes do retrofit e o lote avançou até `20260802000000`. `20260803000000` recusou corretamente 59 órfãos porque o ensaio havia deixado um segundo workspace sintético. A limpeza revelou que triggers de auditoria bloqueavam exclusão em cascata; `20260802500000_fix_permission_audit_cascade_delete.sql` corrige esse comportamento antes do lote pendente. A `TEST_DB_URL` usa a Direct connection da cópia; produção permanece fora do procedimento.
5. [x] Executar o ensaio P0.2 com a cópia controlada do workspace atual: `adopt-existing-workspace` 3/3, `credential-isolation` 39/39 e `workspace-member-privilege-escalation` 5/5 no `2-staging`, em 2026-07-13 (**47/47**). O teste de adoção confirmou confirmação incorreta recusada, manifesto estável antes/depois, preservação de credencial GHL sintética, adoção idempotente e detach preservando workspace/memberships.
6. [x] Rodar auditoria de segurança da revisão final e produzir `security-report/verdict.json` da sessão com `gate: PASS`. Em 2026-07-13, os 3 P0/2 P1 preexistentes de erros públicos/logs foram corrigidos, receberam testes estruturais e a reauditoria gerou `gate: PASS` em `security-report/audit-2026-07-13-staging-rollout-final.md`.
7. [x] Obter autorização explícita do dono para reconciliar o histórico e continuar o rollout controlado — autorização registrada em 2026-07-13. Esta autorização não libera `db push` integral, pois a simulação identificou migrations fora do escopo.
8. [x] O manifesto de release foi executado em produção com autorização explícita: A (16), B (12), C (4) e D (2), totalizando **34 migrations**. Cada grupo teve dry-run prévio e o histórico final confirmou todas as versões aprovadas. As exclusões `20260819000000`, `20260820000000`, `20260821000000` e `20260824000000` não foram promovidas. Em 2026-07-14, após novo gate de segurança `PASS`, o lote controlado de Edge Functions foi publicado e a consulta remota confirmou **19/19**. O próximo gate operacional é o burn-in do primeiro tenant interno/de baixo risco, com credenciais por workspace no Vault, antes de qualquer segunda sub-conta paga.

Se qualquer passo falhar, interromper o rollout, preservar as evidências e retornar ao staging. Não improvisar correção diretamente no banco.

## 4. Prova exigida para MT-P0.2

O teste automatizado cobre confirmação incorreta, idempotência do vínculo e detach sem apagar workspace ou memberships. No ensaio de 2026-07-13, as evidências abaixo foram confirmadas no `2-staging` com massa sintética e removida ao final:

- [x] manifesto de `export_workspace_data_manifest` antes e depois com as mesmas contagens (desconsiderado somente `_generated_at`);
- [x] um único owner ativo no workspace e nenhum vínculo prévio em `agency_workspaces`;
- [x] login/RLS do owner legado preservado, acesso de agência apenas após vínculo `active` e outsider sem acesso (cobertura complementar nas suítes de isolamento);
- [x] credencial GHL legada sintética preservada: adoção não é cutover de chave;
- [x] detach confirmado e nova adoção idempotente; os IDs efêmeros foram removidos ao final e nenhum segredo/PII foi registrado.

Isso fecha a prova funcional do MT-P0.2. A promoção das migrations foi concluída pelo manifesto faseado; o burn-in continua obrigatório antes do segundo tenant pago.

O provisionador de tenant novo não substitui este ensaio, pois ele cria workspace e owner; a adoção somente vincula um workspace já existente.

## 5. Critério de produção

O rollout de schema/RLS está concluído. Antes de liberar uma sub-conta paga, executar o fluxo de `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md` em um tenant interno, incluindo seed/cutover de credenciais no Vault e burn-in monitorado, sempre sem SQL manual.

Referências: `docs/ROADMAP-MULTI-TENANT.md`, `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md`, `docs/HANDOFF-MULTI-TENANT-META-ADS-ACCOUNT-DAILY.md`, `docs/UML.md` e `docs/NIVEIS-DE-ACESSO.md`.
