# Runbook de produção — provisionamento do 1º tenant adicional

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Ensaiado ponta a ponta no banco de TESTE (`fgjbmdsucruvtpywyhhf`), 2026-07-11. **Não executado em produção** (`qzesffnkqgelmtfblzkr`) — só o dono decide quando puxar o gatilho. |
| **Modo** | `agency-subaccount` — sub-conta dentro da instância Agency já existente, sem projeto/deploy novo. Ver [`docs/REPLICACAO-TECNICA.md`](REPLICACAO-TECNICA.md) para quando usar este modo vs `isolated-instance`. |
| **Pré-requisito de engenharia** | Fases 0-8 no estado descrito em [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md). Nenhum item de código bloqueia este runbook hoje. |
| **Pré-requisito operacional (fora deste runbook)** | Nenhum — este runbook cobre o operacional. O que falta é jurídico (DPA, fora do escopo de engenharia). |

---

## 0. O que este runbook faz e por que cada passo existe

Provisionar o 1º tenant adicional em produção envolve 3 ações distintas, nessa ordem, cada uma com seu próprio raio de explosão se der errado:

| Passo | O que faz | Por que essa ordem importa |
|---|---|---|
| 1 | Bootstrap da agência (cria `agencies` + `agency_members` para o dono) | Produção hoje é single-tenant de verdade — **zero linhas em `agencies`**. Sem isso, `provision-new-client.ts --mode=agency-subaccount` falha na validação `validateAgencyExists` (fail-closed, por design) antes de criar qualquer coisa. |
| 2 | Provisionar o workspace da sub-conta (`provision-new-client.ts --mode=agency-subaccount --execute`) | Só pode rodar depois do passo 1 existir. Se falhar no meio (ex.: `location_id` duplicado), o rollback compensatório (Fase 7 P2) já limpa sozinho — mas só faz sentido descrever esse comportamento depois de a agência existir. |
| 3 | Cliente conecta a própria chave GHL via BYOK (UI `/workspace/integracoes`) | Só faz sentido com o workspace já existindo (passo 2). Não é um passo que o operador roda por SQL — é o próprio cliente, pela UI, exatamente como qualquer outro workspace BYOK (Fase 4). |

Este runbook cobre os passos 1 e 2 com comandos exatos (testados de verdade contra o banco de teste, transcrição abaixo) e documenta o passo 3 como responsabilidade do cliente, com o ponto de verificação que o operador usa para confirmar que ele fez certo.

**O que este runbook NÃO cobre:** o cutover da chave GHL do workspace ÚNICO atual (env global → Vault, `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`, seção "Cutover da chave GHL"). São ações independentes — o cutover pode rodar antes, depois ou nunca (o workspace atual continua funcionando com a env var enquanto não migrar); este runbook não depende dele.

---

## 1. Bootstrap da agência (rodar UMA VEZ, antes do primeiro tenant)

**Achado desta sessão:** não existia nenhum jeito seguro de criar a primeira agência — as policies de `agencies`/`agency_members` são `service_role`-only por design (é ato do operador da plataforma, não self-service do cliente), mas não havia RPC, então o único caminho seria SQL solto no editor do Supabase, **proibido pela regra 20 do `CLAUDE.md`** (toda alteração de banco via migration). Corrigido nesta sessão: migration [`20260814000000_create_agency_for_owner_service_role.sql`](../supabase/migrations/20260814000000_create_agency_for_owner_service_role.sql) cria a RPC `create_agency_for_owner_service_role(p_owner_id uuid, p_agency_name text)`.

**Comportamento:**
- Fail-closed: se `p_owner_id` não existe em `auth.users`, `RAISE EXCEPTION` — nada é criado.
- Idempotente: se o usuário já é owner de uma agência, retorna o `agency_id` existente em vez de duplicar (rodar de novo por engano não quebra nada).
- Sempre cria `agencies` + `agency_members` (`role='owner'`) no mesmo fluxo — nunca uma agência órfã sem membro.
- `service_role` only — `authenticated`/`anon` recebem erro de permissão.

### Passo a passo em produção

1. Descobrir o `user_id` do dono (o e-mail que ele já usa para logar no workspace atual):
   ```sql
   SELECT id, email FROM auth.users WHERE email = '<email-do-dono>';
   ```
2. Rodar a RPC via conexão `service_role` (nunca `anon`/`authenticated`):
   ```sql
   SELECT create_agency_for_owner_service_role(
     '<user-id-do-passo-1>'::uuid,
     'OMNX'  -- nome da agência, escolha do dono
   );
   -- retorna o agency_id — guarde para o passo 2
   ```
3. Confirmar:
   ```sql
   SELECT a.id, a.name, a.owner_id, am.role
   FROM agencies a JOIN agency_members am ON am.agency_id = a.id
   WHERE a.owner_id = '<user-id-do-passo-1>';
   -- esperado: 1 linha, role='owner'
   ```

**Ponto de verificação:** o dono consegue acessar `/agency` e `/agency/workspaces` no frontend (guard `AgencyRoute` via `useMyAgencies()`) e vê a lista vazia (nenhuma sub-conta ainda).

---

## 2. Provisionar o workspace da sub-conta

Usar `scripts/provision-new-client.ts --mode=agency-subaccount` — já implementado e validado (Fase 7, [`docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md`](FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md)) e re-ensaiado ponta a ponta nesta sessão (seção 4 abaixo).

### Comando (dry-run primeiro — SEMPRE)

```bash
npx tsx scripts/provision-new-client.ts \
  --mode=agency-subaccount \
  --agency-id "<agency-id-do-passo-1>" \
  --client-name "<slug-do-cliente>" \
  --workspace-name "<Nome do Workspace>" \
  --owner-email "<email-do-owner-do-tenant>" \
  --owner-password "<senha-forte>" \
  --supabase-url "https://qzesffnkqgelmtfblzkr.supabase.co" \
  --supabase-anon-key "<anon-key-de-producao>" \
  --supabase-service-role-key "<service-role-key-de-producao>" \
  --ghl-location-id "<location-id-do-cliente-se-ja-souber>"
  # sem --ghl-location-id: workspace nasce status='pending', cliente conecta depois via BYOK
```

Ler a saída com atenção — o dry-run mostra exatamente o que SERIA feito (usuário, workspace, vínculo com a agência) sem tocar no banco.

### Comando real (só depois de revisar o dry-run)

Adicionar `--execute` ao mesmo comando. Isso:
1. Valida que a agência existe (fail-closed — para ANTES de criar qualquer coisa se não existir).
2. Cria o usuário owner + workspace (reusa `create_workspace_with_owner`, `setup_workspace_apps_and_permissions`, import do template Empire Default — mesmo caminho já usado por `isolated-instance`).
3. Vincula o workspace à agência em `agency_workspaces` (`provisioning_mode='manual_byok'`, `status='active'` se `location_id` informado, `'pending'` se não).

**Ponto de verificação:**
```sql
SELECT aw.status, aw.provisioning_mode, aw.ghl_location_id, w.name, w.id AS workspace_id
FROM agency_workspaces aw
JOIN workspaces w ON w.id = aw.workspace_id
WHERE aw.agency_id = '<agency-id>'
ORDER BY w.name;
```

### Se o comando falhar (ex.: `location_id` já ativo em outro workspace)

**Não entre em pânico e não rode manualmente nenhum DELETE.** O rollback compensatório (Fase 7 item P2, [`docs/FASE-7-P2-ATOMICIDADE.md`](FASE-7-P2-ATOMICIDADE.md)) já dispara sozinho **dentro do próprio comando**: se o workspace/usuário já tinham sido criados quando o vínculo com a agência falha, o script chama `purge_workspace_data` para limpar o workspace órfão e apaga o usuário owner do Auth (só se foi criado nesta mesma execução — nunca um e-mail reaproveitado de tentativa anterior). O erro original ainda é reportado no terminal.

**Ponto de verificação pós-falha** (deve retornar 0 nas duas):
```sql
SELECT count(*) FROM workspaces WHERE name = '<Nome do Workspace que você tentou criar>';
SELECT count(*) FROM auth.users WHERE email = '<email-do-owner-que-voce-tentou-criar>';
```
Se qualquer uma retornar > 0, o rollback não completou — **pare e investigue antes de tentar de novo** (não é esperado; foi validado com falha real induzida, seção 4).

**Limitação aceita e documentada:** falha dentro da própria criação do workspace (não no vínculo com a agência) e o modo `isolated-instance` continuam sem rollback automático — ver seção 5 de `docs/FASE-7-P2-ATOMICIDADE.md`.

---

## 3. Cliente conecta a própria chave GHL (BYOK)

Responsabilidade do cliente, não do operador — mesmo fluxo self-service de qualquer workspace (Fase 4):

1. Login em `https://<frontend-de-producao>` com o e-mail/senha do owner criado no passo 2.
2. Ir em `/workspace/integracoes` → conectar a chave GHL (Private Integration Token do location dele) + `location_id`.
3. Clicar "Testar conexão" (edge function `test-workspace-credential`, chamada real à API do GHL — `GET /locations/{locationId}`) para confirmar que a chave é válida antes de prosseguir.

**Ponto de verificação do operador** (sem ver o segredo — RPC admin-only):
```sql
-- via API/RPC, nunca lendo workspace_integration_credentials direto (é service_role-only)
SELECT get_workspace_credential_status('<workspace-id-do-passo-2>'::uuid);
-- esperado: 1 linha, provider='ghl', rotation_version >= 1
```

A partir daqui, os crons por workspace (sync de oportunidades, comunicações, meta ads etc. — todos já resolvem credencial por workspace desde a Fase 2) começam a puxar dados do novo tenant automaticamente, sem nenhuma ação manual adicional.

---

## 4. Ensaio ponta a ponta já realizado (evidência)

Executado de verdade contra o banco de TESTE (`fgjbmdsucruvtpywyhhf`) em 2026-07-11, com uma agência sintética criada e removida ao final (nenhum artefato deixado no banco):

1. **Bootstrap da agência:** RPC `create_agency_for_owner_service_role` chamada com um usuário de teste — criou `agencies` + `agency_members` (`role='owner'`). 2ª chamada com o mesmo `owner_id` confirmou idempotência (mesmo `agency_id`, sem duplicar). Chamada com `owner_id` inexistente confirmou fail-closed. Teste automatizado permanente: `__tests__/integration/create-agency-for-owner-rpc.test.ts` (4/4).
2. **Provisionamento (`--mode=agency-subaccount --execute`), caminho feliz com `location_id`:** workspace criado, owner criado, `agency_workspaces` com `status='active'`, `provisioning_mode='manual_byok'`. Confirmado por query direta.
3. **BYOK sintético:** credencial GHL seedada via `seed_workspace_ghl_credential_service_role` com valor sintético (nunca a chave real). Confirmado: `get_workspace_credential_status` via RPC retorna o status correto **sem vazar o segredo**; leitura direta da tabela `workspace_integration_credentials` pelo cliente autenticado é corretamente negada (`permission denied`, tabela é `service_role`-only).
4. **Isolamento cross-tenant, com dado real (não só schema):**
   - O owner do novo tenant só vê o próprio workspace em `SELECT * FROM workspaces` — nenhum outro workspace da instância aparece.
   - O owner da agência consegue fazer `SELECT` em `contatos` filtrando pelo novo workspace sem erro de permissão (RLS via `can_access_workspace_via_agency` funcionando) — retornou vazio porque o workspace é novo, não por bloqueio.
   - Um usuário sem nenhuma relação com a agência ou o workspace: `SELECT * FROM workspaces WHERE id = '<novo>'` retorna vazio, e a RPC `get_workspace_credential_status` para esse workspace retorna vazio (sem erro de exceção, só zero linhas — a política nega silenciosamente).
5. **Falha real induzida (`location_id` duplicado):** 2ª tentativa de provisionamento com o MESMO `location_id` do passo 2 — logs confirmam: usuário e workspace criados, vínculo com a agência falha (constraint de unicidade), rollback compensatório dispara automaticamente, `purge_workspace_data` limpa o workspace, usuário owner recém-criado é apagado do Auth, erro claro reportado. `SELECT count(*)` no banco confirmou **zero órfãos** nas duas tabelas.
6. **Limpeza:** todo o estado sintético (workspace, credencial, usuários, agência) removido via `purge_workspace_data` + Admin API + `DELETE FROM agencies` — banco de teste voltou ao estado anterior ao ensaio, confirmado por contagem.

Nenhuma etapa deste ensaio tocou produção (`qzesffnkqgelmtfblzkr`) — só o banco de teste `fgjbmdsucruvtpywyhhf`, protegido por `__tests__/helpers/safe-guard.ts` nos testes automatizados e por checagem manual da URL em cada comando manual.

---

## 5. Checklist para o dono, no dia de rodar em produção

- [ ] Confirmar que está usando a `service_role key` de **produção** (`qzesffnkqgelmtfblzkr`), não a de teste.
- [ ] Passo 1 (bootstrap da agência) — rodar uma única vez.
- [ ] Passo 2, dry-run primeiro — ler a saída com atenção antes de adicionar `--execute`.
- [ ] Passo 2, execução real — conferir o ponto de verificação SQL.
- [ ] Se falhar: conferir os dois `SELECT count(*)` da seção 2 antes de tentar de novo.
- [ ] Avisar o cliente para conectar a própria chave GHL (passo 3) — ou fazer isso por ele, se preferir operar a UI em nome dele na primeira vez.
- [ ] Confirmar `get_workspace_credential_status` depois que a chave for conectada.
- [ ] Acompanhar os próximos ciclos de cron (sync de oportunidades/comunicações) para confirmar que o dado do novo tenant começou a chegar.
