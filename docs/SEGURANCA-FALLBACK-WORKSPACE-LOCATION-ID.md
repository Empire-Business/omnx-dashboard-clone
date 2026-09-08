# Achado crítico: fallback "workspace mais antigo" ainda ativo em produção

| Campo | Valor |
|-------|-------|
| **Severidade** | 🔴 CRÍTICO — corrupção de dado entre tenants (escrita, não só vazamento de leitura) |
| **Status em produção (`qzesffnkqgelmtfblzkr`)** | ⚠️ **Vulnerabilidade ATIVA, confirmada por leitura direta em 2026-07-11/12.** A correção já existe em `main`, testada, mas **nunca foi deployada**. |
| **Status no banco de TESTE (`fgjbmdsucruvtpywyhhf`)** | ✅ Corrigido — confirmado por leitura direta + 8/8 testes de regressão passando. |
| **Ação pendente** | `supabase db push` + `supabase functions deploy webhook-ghl` (e demais functions listadas na seção 4) em produção — decisão e execução do dono, fora do escopo desta investigação (só leitura autorizada). |

---

## 1. O problema

`public.get_workspace_id_by_ghl_location_id(p_location_id text)` resolve qual
workspace é dono de um evento do GHL a partir do `locationId` do payload. A versão
antiga (criada em `20260708000001_create_ghl_field_mapping_helpers.sql`) tinha um
fallback: se o `location_id` não batesse com nenhum `ghl_integration_settings` ativo,
em vez de falhar, ela retornava o **workspace mais antigo do banco**.

Em single-tenant (1 workspace só) isso é inofensivo — não tem para onde mais o dado
ir. Em multi-tenant (2+ workspaces na mesma instância), um webhook com `location_id`
não cadastrado — ou vindo de um cliente diferente por engano de configuração —
seria atribuído **silenciosamente** ao workspace mais antigo, ou seja, dado de um
cliente sendo escrito na conta de outro. Isso é um buraco de **escrita**, mais grave
que os buracos de leitura que RLS/policies protegem — não vaza dado, **corrompe**
dado, sem gerar nenhum erro visível no momento em que acontece.

## 2. A correção já existe em `main` — não precisou ser escrita agora

Confirmado por `git log`, a correção está mergeada em `main` desde a Fase 2 (fatias 3
e 6) do trabalho multi-tenant, **antes** desta sessão:

- `e5c2ea5` — *Fase 2 (fatia 3) - roteamento por location_id sem fallback + dead-letter*
- `4ffbc95` — *Fase 2 (fatia 6) - webhook-ghl autentica por workspace (manual_byok) + dead-letter*
- `a00015a` — *Fase 2 (fatia 4) - ghl-api-worker resolve credencial POR JOB (fail-closed)*

O que essas mudanças fazem, todas já no repositório:

1. **`get_workspace_id_by_ghl_location_id` reescrita** (migration
   `20260725000000_fase3_routing_location_uniqueness.sql`): sem match de
   `location_id` → `RETURN NULL`. **Sem fallback.** Fail-closed de verdade.
2. **Tabela `webhook_unresolved`** (dead-letter, criada na mesma migration): todo
   evento que não resolve tenant vai para lá — `source`, `location_id`, `reason`
   (`missing_location`/`no_match`/`no_secret`/`auth_failed`/`ambiguous`/`missing_tenant`),
   `payload` e `headers` completos (nada se perde), `reprocess_attempts`,
   `reprocessed_at`. RLS: só `service_role` lê/escreve — `authenticated`/`anon` não
   têm acesso (não tem workspace para filtrar).
3. **`webhook-ghl` reescrita** (a edge function que recebe os webhooks do GHL):
   extrai `location_id` do payload **antes** de autenticar, busca o
   `webhook_secret` daquele workspace especificamente (não mais um segredo global
   único), e qualquer falha (`missing_location`, `no_match`, `no_secret`,
   `auth_failed`) grava em `webhook_unresolved` e responde `401` — nunca processa
   com adivinhação.
4. **`ghl-api-worker` e o módulo `_shared/job-tenant.ts`**: jobs da fila
   `ghl_api_jobs` sem tenant identificável (nem `workspace_id`, nem `location_id`)
   viram `status='dead'` + linha em `webhook_unresolved`, nunca usam credencial
   global.
5. **Observabilidade:** `webhook_unresolved` é uma tabela normal — dá para contar
   quantos registros têm cada `reason`, agrupar por `location_id`, e montar alerta
   em cima (`SELECT reason, count(*) FROM webhook_unresolved GROUP BY reason`).

### Testes de regressão — já existem, já passam

`__tests__/integration/routing-location-uniqueness.test.ts` (rodado nesta sessão
contra o banco de TESTE, **8/8 passando**):
- `location_id` conhecida → resolve o workspace certo.
- `location_id` desconhecida → `NULL`, **não** "o mais antigo".
- Evento não resolvido cai em `webhook_unresolved` e é lido por `service_role`.
- `authenticated` (mesmo sendo owner) **não** consegue ler `webhook_unresolved`
  (dado sem workspace para filtrar — RLS nega).
- Constraint `UNIQUE` parcial garante no máximo 1 `location_id` ativo por vez.

`__tests__/integration/webhook-ghl-lookup.test.ts` cobre o comportamento da edge
function em si.

## 3. Medição em produção (só leitura, exigida antes de qualquer decisão de deploy)

Por instrução explícita: medir antes de assumir que fail-closed é seguro para o
cliente atual, porque o fallback pode estar mascarando um `location_id` mal
cadastrado no único workspace que existe hoje.

```sql
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE payload->'location'->>'id' IS NULL) AS sem_location_id,
  count(*) FILTER (WHERE payload->'location'->>'id' IS NOT NULL
                      AND payload->'location'->>'id' != 'U8FTcw90CB5QELUnbGUu') AS location_diferente,
  count(*) FILTER (WHERE payload->'location'->>'id' = 'U8FTcw90CB5QELUnbGUu') AS location_correta
FROM webhooks_ghl;
```

**Resultado (produção, 2026-07-12, sobre os 240.018 webhooks históricos):**

| Métrica | Valor | % |
|---|---|---|
| Total de webhooks | 240.018 | 100% |
| `location_id` correta (bate com o workspace ativo) | 240.017 | 99,9996% |
| `location_id` ausente no payload | 1 | 0,0004% |
| `location_id` presente mas diferente da cadastrada | 0 | 0% |

**Leitura:** o `location_id` do único workspace de produção
(`ghl_integration_settings.ghl_location_id = 'U8FTcw90CB5QELUnbGUu'`, ligado ao
workspace `7909d02a-4d15-46ea-a7b8-5debeb6e8351`) está corretamente cadastrado e
bate com praticamente 100% do histórico. **Não há evidência de que o cliente atual
dependa do fallback para funcionar.** Ir fail-closed hoje não quebraria a ingestão
do cliente existente — o único caso que cairia em `webhook_unresolved` seria o 1
webhook histórico sem `location_id` no payload (que já é um caso legítimo de
dead-letter, não um falso positivo).

Confirmado também, por leitura direta do banco de produção, que a versão **antiga
e vulnerável** de `get_workspace_id_by_ghl_location_id` é a que está rodando hoje
(`prosrc` da função em produção contém literalmente o comentário `-- Fallback Fase
A: workspace unico/mais antigo`). E, baixando o código-fonte real da edge function
`webhook-ghl` diretamente do projeto de produção (`supabase functions download`),
confirmei que ela **nem chega a usar essa RPC** — roda uma versão ainda mais
antiga, com um único `WEBHOOK_SECRET` global compartilhado por todos os tenants
(o exato anti-padrão que a versão em `main` substituiu), sem extração de
`location_id`, sem `webhook_unresolved`, sem dead-letter. A tabela
`webhook_unresolved` **não existe** em produção hoje.

## 4. O que precisa ser deployado (quando o dono autorizar)

Nenhum código novo precisa ser escrito — está tudo em `main`. Para produção
alcançar o mesmo estado do banco de teste:

```bash
# 1. Aplicar as migrations pendentes (inclui a 20260725000000 e as que a sucedem)
supabase link --project-ref qzesffnkqgelmtfblzkr
supabase db push

# 2. Deploy das edge functions que mudaram nesse pacote
supabase functions deploy webhook-ghl --project-ref qzesffnkqgelmtfblzkr
supabase functions deploy ghl-api-worker --project-ref qzesffnkqgelmtfblzkr
# + demais functions listadas no diff de main desde a Fase 2 (ver git log das
#   fatias 3/4/6 citadas na seção 2) — levantamento file-by-file recomendado
#   antes do deploy real, não coberto por esta investigação (só leitura).
```

**Atenção:** isso não é um deploy isolado e barato. Conforme investigação separada
desta mesma sessão (adoção do workspace de produção existente no modelo de
agência), produção está congelada num estado anterior a **30 migrations**
pendentes (tudo a partir de `20260710000000`), e este fix é só uma fatia desse
pacote. Aplicar só as migrations de roteamento por `location_id` isoladamente (sem
o resto do pacote Fase 2) pode não ser trivial se houver dependência entre
migrations — precisa de uma análise de ordem/dependência antes de qualquer
`db push` real em produção, fora do escopo desta investigação.

## 5. Resumo para decisão

- A vulnerabilidade que o dono apontou é real e está ativa em produção hoje.
- A correção já foi projetada, implementada e testada — não em resposta a esta
  sessão, já estava em `main` antes.
- A medição mostra que corrigir **não quebra o cliente atual** (99,9996% de
  consistência de `location_id`).
- O que falta é só **deploy** — decisão e execução do dono, fora do escopo de
  leitura autorizado nesta investigação.
