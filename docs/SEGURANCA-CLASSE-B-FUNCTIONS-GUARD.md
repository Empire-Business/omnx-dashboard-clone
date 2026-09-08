# Guard fail-closed nas edge functions "classe B" (administrativas/manuais)

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Implementado e validado no banco de TESTE (`fgjbmdsucruvtpywyhhf`) |
| **Branch** | `fix/classe-b-functions-fail-closed-guard` |
| **Depende de** | `docs/SEGURANCA-CRON-CALLER-GUARD.md` (item 1 — o guard genérico já existe) |

---

## 1. O que são as functions "classe B"

Diferente das 20 edge functions de cron (item 1), estas 5 não são chamadas por
`pg_cron` nem pela UI — são ferramentas administrativas/de diagnóstico, operadas
manualmente pelo dono/operador via `curl` direto contra a URL da function:

- **`recuperacao-corrigir`** — corrige (escreve no GHL) leads movidos incorretamente
  para o pipeline Recuperação.
- **`recuperacao-prefetch`** — somente leitura, lista candidatos à correção acima.
- **`sync-recuperacao-stages`** — escreve `pipeline_stage_id` das opps de Recuperação.
- **`reconcile-contact-opportunities`** — reconcilia oportunidades vs GHL (audit/write).
  Já ganhou o guard no item 1 (também é uma das 20 functions de cron); incluída
  aqui só para fechar a lista completa das 5 pedidas.
- **`diag-ghl`** — somente leitura, lista pipelines/estágios do GHL de um workspace.

Nenhuma delas tinha qualquer guard além do `verify_jwt` padrão do Supabase — ou
seja, qualquer pessoa com a anon key (pública) podia chamar `recuperacao-corrigir`
e escrever no GHL de qualquer workspace, sem nenhuma autorização real.

## 2. A correção

Reaproveita o mesmo guard do item 1
(`supabase/functions/_shared/require-service-role.ts`): `requireServiceRoleCaller(req,
corsHeaders)` logo no início do handler, antes de qualquer lógica de negócio.
Como estas functions **não têm caminho legítimo de usuário autenticado** (não são
chamadas pela UI), o guard é estrito — só `service_role_key` passa. O operador que
precisar rodá-las manualmente usa `curl -H "Authorization: Bearer <service_role_key>"`.

- `recuperacao-corrigir`, `recuperacao-prefetch`, `sync-recuperacao-stages`: guard
  inserido logo após o tratamento de `OPTIONS`.
- `diag-ghl`: não tinha CORS/OPTIONS handling nenhum — guard inserido no início do
  `Deno.serve`, mantendo o estilo original do arquivo (sem CORS headers).
- `reconcile-contact-opportunities`: já coberta pelo item 1.

## 3. Teste estrutural

`__tests__/integration/classe-b-functions-guard.test.ts` — grep puro, confirma que
as 5 functions importam e chamam o guard.

## 4. Validação

```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run
# 351 passed | 10 todo (0 regressão)
cd eb-dash2 && npx tsc -b   # limpo
deno check <cada index.ts alterado>   # mesmos erros pré-existentes de antes, 0 novos
```
