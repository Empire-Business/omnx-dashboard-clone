# Fase 7 (item P2) — não-atomicidade do provisionamento

| Campo | Valor |
|-------|-------|
| **Status** | 🟢 Rollback compensatório implementado e validado com falha real induzida no banco de TESTE (2026-07-11). |
| **Arquivo** | [`scripts/provision-new-client.ts`](../scripts/provision-new-client.ts) — funções `rollbackOrphanedWorkspace`, `provisionAgencySubaccount` |
| **Achado original** | [`docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md`](FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md) seções 3 e 4 |
| **Depende de** | [`docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`](FASE-8-LGPD-EXPURGO-OFFBOARDING.md) — reusa a RPC `purge_workspace_data` como mecanismo de rollback |

---

## 1. O problema (recapitulando o que a Fase 7 já tinha documentado)

`provisionAgencySubaccount` executa, em sequência:
1. `validateAgencyExists` — só leitura, seguro.
2. `createWorkspace` — cria usuário owner (Admin Auth API) + workspace (RPC `create_workspace_with_owner`) + seeds (apps/permissões/template).
3. `linkWorkspaceToAgency` — `INSERT` em `agency_workspaces`.

Se o passo 3 falhar (ex.: `ghl_location_id` já ativo em outro workspace — a constraint `uq_agency_workspaces_location_active`), os passos 1-2 **já commitaram**: existe um usuário Auth real e um workspace totalmente seedado, sem vínculo com nenhuma agência. Antes desta correção, isso era um **órfão permanente** — a doc da Fase 7 documentava isso como decisão consciente ("operador confere/corrige manualmente"), sem runbook de limpeza escrito.

## 2. Por que não "só colocar tudo numa transação"

Os passos 1-2 são **chamadas de rede distintas e heterogêneas**, não `INSERT`s numa mesma conexão SQL:
- Chamada HTTP à Supabase Admin Auth API (criar usuário).
- Chamada RPC via PostgREST autenticada como o usuário recém-criado (JWT do login).
- Chamada RPC via `service_role` (seeds).
- Chamada REST final (`agency_workspaces`).

Não existe uma "transação Postgres" que abranja a Auth API — ela vive num serviço diferente (GoTrue), não é uma tabela comum que participa de `BEGIN/COMMIT`. Fazer isso de verdade exigiria um **saga distribuído** com coordenador próprio (registrar cada passo, compensar na ordem inversa, tolerar o coordenador cair no meio) — desproporcional para um script de operador rodado manualmente e raramente (não é um caminho de alto volume como um webhook).

Contraste direto: `purge_workspace_data` (Fase 8) **é** atômica de graça porque todo o trabalho dela é `DELETE` no mesmo banco, dentro de uma única função `plpgsql` — nenhuma chamada de rede no meio. São categorias de problema diferentes; a "solução simples" de uma não se aplica à outra.

## 3. Solução implementada: rollback compensatório reusando a Fase 8

Em vez de tentar uma transação real, `provisionAgencySubaccount` agora:

```
created = createWorkspace(...)          // já commitado se chegar aqui
try {
  linkWorkspaceToAgency(created.workspaceId)
} catch (err) {
  rollbackOrphanedWorkspace(created)     // compensação
  throw err                              // operador ainda vê a falha original
}
```

`rollbackOrphanedWorkspace` chama a **mesma RPC `purge_workspace_data`** que a Fase 8 já construiu e testou para o expurgo LGPD — ela já sabe apagar 100% dos dados de um workspace (incluindo o achado de FK/trigger corrigido na Fase 8, seção 4) sem deixar órfão, dentro de uma transação atômica de verdade. Reusar essa RPC em vez de escrever uma segunda lógica de limpeza:
- evita duplicar a ordem de exclusão correta (que já é não-trivial — ver Fase 8 seção 3);
- garante que qualquer correção futura no expurgo (ex.: cobrir mais um gap) beneficia automaticamente o rollback do provisionamento também.

**Cuidado deliberado com o usuário do Auth:** só é apagado se (a) foi **criado nesta mesma execução** (`ownerUserWasNew`, não um e-mail reutilizado de uma tentativa anterior) **e** (b) aparece na lista `usuarios_exclusivos_nao_apagados_de_auth_users` que a própria `purge_workspace_data` calcula (sem nenhuma outra membership). Isso evita o cenário perigoso de apagar a conta de um operador real só porque uma tentativa de provisionamento não relacionada falhou.

## 4. Validação real (não só leitura de código)

Reproduzido no banco de teste (`fgjbmdsucruvtpywyhhf`), com dados sintéticos:
1. Criada uma agência + um workspace já `active` em `agency_workspaces` com `ghl_location_id = loc-collision-<ts>`.
2. Rodado `provision-new-client.ts --mode=agency-subaccount --execute` tentando o **mesmo** `location_id`.
3. Resultado observado nos logs: usuário owner criado → workspace criado → seeds aplicados → `linkWorkspaceToAgency` falha (constraint) → **rollback automático dispara** → `purge_workspace_data` limpa o workspace → usuário owner recém-criado é apagado do Auth → erro original (`location_id já está ativo`) ainda é reportado ao operador.
4. Confirmado no banco: `SELECT count(*) FROM workspaces WHERE id = '<órfão>'` → `0`. `SELECT count(*) FROM auth.users WHERE email = '<owner recém-criado>'` → `0`. Zero órfãos.

Este teste também **reproduziu de novo** o bug de trigger de auditoria documentado na Fase 8 (seção 4) ao tentar limpar o cenário de teste com `DELETE FROM workspaces` puro (sem passar pela RPC) — reforça que `purge_workspace_data` não é só "mais uma forma" de apagar um workspace, é a **única forma correta** hoje.

## 5. O que continua não-atômico (limitação aceita, documentada)

- Se `createWorkspace` falhar **no meio** dela mesma (ex.: usuário criado com sucesso, mas a RPC `create_workspace_with_owner` falha logo em seguida), o rollback acima **não é acionado** — porque `provisionAgencySubaccount` só tem um `workspaceId` para rolar de volta depois que `createWorkspace` retorna. Nesse cenário mais raro (falha dentro da própria criação do workspace, não no vínculo), pode sobrar um usuário Auth órfão sem workspace nenhum. Mitigação: `createWorkspace` já reutiliza usuários existentes por e-mail (idempotente na prática — rodar de novo com o mesmo e-mail não duplica), então o pior caso é um usuário Auth sem workspace, facilmente encontrável por `email` e removível manualmente (`supabase.auth.admin.deleteUser`), sem risco de vazamento de dado de outro tenant.
- O modo `isolated-instance` (padrão, pré-existente) **não** ganhou esse rollback — ele cria projeto Supabase + faz deploy Vercel, uma cadeia de efeitos ainda mais heterogênea (contas de terceiros, não só o próprio banco). Fica fora do escopo desta correção; mantém o mesmo comportamento "sequencial, best-effort, operador corrige" já documentado.
