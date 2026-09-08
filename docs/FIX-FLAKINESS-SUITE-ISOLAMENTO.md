# Fix: flakiness da suite de isolamento — causa real (não era rate-limit)

> **Prioridade:** CRÍTICO
> **Contexto:** Item 3 da caça a bugs pós-PR #35, iniciada em 2026-07-11.

## Hipótese inicial vs. causa real

A hipótese de partida (do dono) era **rate-limit do Supabase Auth em runs full-parallel** —
o vitest roda ~35 arquivos de `__tests__/integration/**`, cada um criando usuários via
`auth.admin.createUser` no `beforeAll`, e o workflow já reconhecia o projeto de teste como
"compartilhado" (`concurrency: group: isolation-suite` no workflow, serializando *runs*
diferentes — mas não os *arquivos* de um mesmo run).

**Investigação mostrou uma causa muito mais séria:** ao rodar a suite completa localmente,
9 a 18 testes falhavam de forma **determinística** (mesmo resultado, mesmo UUID, em 3 runs
seguidos) — não o padrão de uma corrida por rate-limit. As falhas apontavam para:

1. `get_workspace_id_by_ghl_location_id('LOC-QUE-NAO-EXISTE')` retornando o UUID do
   workspace mais antigo em vez de `NULL`.
2. RPCs `SECURITY DEFINER` sensíveis (`get_decrypted_secret`, `purge_workspace_data`,
   `create_agency_for_owner_service_role`, `register_outbound_webhook` etc.) executáveis
   por `authenticated` quando deveriam ser `service_role`-only.
3. Policies de `weekly_email_schedules`/`weekly_email_logs` não bloqueando INSERT/UPDATE
   cross-tenant (a mesma classe de bug que a Fase 6 fatia 2 já tinha corrigido — só que a
   correção nunca tinha realmente "pegado" neste banco).

## Causa raiz #1 — drift de migration (já documentado, mas com impacto maior do que se sabia)

`docs/BASELINE-REPRODUCIBILIDADE.md` já registrava que o schema do banco de teste foi
montado por dump+seed, não por `supabase db push` completo (que quebra numa migration
antiga — `20260219052803_simplificar_webhooks_ghl.sql` — por causa de uma view dependente).
O que não estava claro até agora: esse drift também deixou **corpos de função (RPC) e
policies inteiras desatualizadas**, não só colunas. Ex.: `get_workspace_id_by_ghl_location_id`
ao vivo ainda tinha o fallback antigo "workspace mais antigo" que a migration
`20260725000000_fase3_routing_location_uniqueness.sql` deveria ter removido.

**Correção:** as migrations relevantes foram reaplicadas diretamente
(`supabase db query --linked -f <migration>.sql`, idempotentes por `CREATE OR REPLACE
FUNCTION`/`DROP POLICY IF EXISTS`), sem tentar resolver agora o problema maior do `db push`
quebrado (fora de escopo desta correção pontual — ver `docs/BASELINE-REPRODUCIBILIDADE.md`
seção "plano de correção 0.7").

## Causa raiz #2 (mais grave) — `REVOKE ... FROM PUBLIC` nunca revogava de `anon`/`authenticated`

Esta é a descoberta mais importante: mesmo migrations que **foram** aplicadas corretamente
não teriam corrigido o problema, porque o **texto da correção em si estava incompleto**.

Toda migration de hardening anterior (fases 2/3/4/5/7/8) usava o padrão:
```sql
REVOKE ALL ON FUNCTION public.get_decrypted_secret(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_decrypted_secret(uuid) TO service_role;
```

Isso **não é suficiente** neste projeto. O schema `public` do Supabase recebeu, na
configuração inicial do projeto, um `GRANT EXECUTE` **direto e explícito** a `anon` e
`authenticated` sobre todas as funções então existentes (comportamento padrão do template
Supabase para o schema `public`, pensado para expor tudo via PostgREST por padrão, deixando
para quem desenvolve restringir função por função). Esse grant foi feito **diretamente nos
roles** `anon`/`authenticated` — nunca passou pelo pseudo-role `PUBLIC`. Confirmado
inspecionando `pg_proc.proacl` de `get_decrypted_secret`:

```
{postgres=X/postgres, service_role=X/postgres, anon=X/postgres, authenticated=X/postgres}
```

Não há entrada de `PUBLIC` nesse ACL — logo `REVOKE ALL ... FROM PUBLIC` é um **no-op** para
esses roles. Como `get_decrypted_secret`, `purge_workspace_data`,
`create_agency_for_owner_service_role` e `register_outbound_webhook` são todas
`SECURITY DEFINER`, a RLS da tabela por baixo **não protege** essas chamadas — o `GRANT
EXECUTE` era a **única barreira**, e ela nunca existiu de fato.

**Impacto no banco de teste, antes da correção:** qualquer usuário autenticado (e, em
alguns casos, `anon` sem sessão nenhuma) podia chamar `get_decrypted_secret` (decifra
segredo/API key armazenado), `purge_workspace_data` (apaga um workspace inteiro —
LGPD/offboarding), `create_agency_for_owner_service_role` e `register_outbound_webhook`.

**Correção:** nova migration `20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql`
— revoga explicitamente de `PUBLIC, anon` (e, onde a função deveria ser 100%
`service_role`-only, também de `authenticated`) para 18 funções. Reaplicada no banco de
teste; comparação antes/depois:

| | Antes | Depois |
|---|---|---|
| Funções com `EXECUTE` para `anon` | 16 (nenhuma deveria ter) | 0 |
| Funções com `EXECUTE` para `authenticated` além do intencional | 16 | 8 (todas documentadas como intencionais — ex. `save_workspace_credential`, `request_workspace_deletion`) |

### ⚠️ Ação manual urgente — verificar produção

Como a causa raiz #2 é um **erro no próprio texto** das migrations originais (revogar do
role errado), **é provável que o mesmo gap exista em produção** (`qzesffnkqgelmtfblzkr`),
independente de quais migrations já rodaram lá — o bug se reproduz mesmo com a migration
aplicada corretamente, porque o `REVOKE FROM PUBLIC` nunca fez o que deveria.

Esta sessão **não tocou produção** (regra do projeto). É necessário que alguém com acesso
rode, em produção, a query abaixo e — se `anon`/`authenticated` aparecerem — aplique lá o
mesmo `REVOKE ... FROM PUBLIC, anon, authenticated` desta migration:

```sql
SELECT p.proname, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN (
  'get_decrypted_secret','get_workspace_credential_meta',
  'purge_workspace_data','create_agency_for_owner_service_role',
  'register_outbound_webhook','get_agency_credential_meta',
  'seed_workspace_ghl_credential_service_role'
);
```

## Mudanças mecânicas na suite (defesa em profundidade, não a causa raiz)

Mesmo com a causa raiz corrigida, duas mudanças adicionais em
`eb-dash2/vitest.integration.config.ts` e `__tests__/helpers/supabase-test-client.ts`
reduzem o risco de flakiness genuína por concorrência:

1. **`fileParallelism: false`** — os ~35 arquivos de integração rodam contra o MESMO
   projeto Supabase compartilhado. O workflow de CI já serializa *runs* diferentes, mas o
   vitest por padrão roda os *arquivos* de um mesmo run em paralelo. Serializar os arquivos
   elimina qualquer corrida cross-arquivo remanescente (custo: suite mais lenta — soma em
   vez de máximo — aceitável frente a "suite em que ninguém confia").
2. **Retry com backoff em `createTestUser`** — defesa em profundidade contra rate-limit
   genuíno do Supabase Auth (4 tentativas, backoff exponencial com jitter), caso a
   serialização de arquivos ainda não seja suficiente sob carga.

## Prova

Suite completa rodada 4x localmente após as correções: **35/36 arquivos passando, 399/399
testes verdes** (1 arquivo skipped intencionalmente — `future-phases.skip.test.ts`).
Antes da correção: 8-18 testes falhando de forma determinística em toda execução.
