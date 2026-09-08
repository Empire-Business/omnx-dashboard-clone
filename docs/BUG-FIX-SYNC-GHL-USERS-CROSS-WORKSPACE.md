# Bug fix — `sync-ghl-users` apagava o time de uma conta ao sincronizar a outra

**Data:** 2026-08-25 BRT
**Severidade:** CRÍTICO (dado operacional de produção zerado silenciosamente)
**Status:** ✅ Corrigido e aplicado em produção em 2026-08-25

---

## 1. Sintoma relatado

Painel **Pré-Vendas → Discagem**, card **"Ligações hoje" = 0**, sem nenhum filtro
aplicado, enquanto o time estava discando normalmente.

No banco, no mesmo instante, existiam **102 ligações** registradas para o dia
(66 de Lucas Leonardo, 37 de Caroline Alves, 1 de Bruno Andrease).

## 2. Causa raiz

`useDiscagemScore` conta as ligações do dia em dois passos:

1. resolve os `ghl_id` dos SDRs **ativos** do workspace
   (`ghl_users` com `deleted = false` e `papeis @> ['sdr']`);
2. conta `comunicacoes` de hoje com `usuario_ghl_id` nessa lista.

O passo 1 devolvia lista vazia. Com `ghlIds.length === 0` o hook nem chega a
consultar `comunicacoes` — `callsCount` fica `0`. **Zero por lista vazia é
indistinguível de zero por inatividade**: nenhum erro, nenhum log.

A lista estava vazia porque **os 31 usuários do workspace real estavam com
`deleted = true`**, todos marcados no mesmo instante (2026-08-25 12:00:05 UTC),
pelo cron `sync-ghl-users-cron` (jobid 89, a cada 6h).

A edge function `sync-ghl-users` roda **uma vez por workspace** com credencial
GHL (`sync_ghl_users_job()` itera `workspace_integration_credentials`), mas o
corpo dela **não filtrava por workspace** em três pontos:

| Passo | Código original | Efeito |
|---|---|---|
| 2. ler existentes | `select(...)` sem `.eq('workspace_id', ...)` | enxergava usuários de TODAS as contas |
| 3. atualizar | `.eq('ghl_id', ...)` + `workspace_id: workspaceId` no `SET` | **transferia** o usuário para a conta que estava sincronizando |
| 4. soft-delete | `.in('ghl_id', ...)` sem filtro de conta | marcava `deleted = true` no time das outras contas |

Havia duas contas com credencial GHL: `Default` (real, 12.392 contatos) e
`Burn-in Interno` (sub-conta de teste, 0 contatos). As duas execuções competiam
a cada 6 horas e **a última a terminar zerava a outra**. Naquele dia perdeu a
conta real.

Agravante estrutural: `ghl_users` tinha `UNIQUE (ghl_id)` **global**. Uma pessoa
com acesso a dois locations do GHL só cabia em uma linha — então o passo 3 não
tinha como não roubar a linha. 8 pessoas do time real (incluindo Bruno Andrease,
com 39.982 comunicações na conta real) estavam registradas no workspace de
burn-in.

## 3. Correção aplicada

**Migration `20261019000000_ghl_users_unique_por_workspace.sql`**
- cria `UNIQUE (workspace_id, ghl_id)` (índice parcial, `workspace_id NOT NULL`);
- remove `UNIQUE (ghl_id)`.

A mesma pessoa passa a poder existir uma vez em cada conta, com `papeis`
próprios em cada uma.

**Edge function `sync-ghl-users`** (deploy em 2026-08-25)
- passo 2 filtra por `.eq('workspace_id', workspaceId)`;
- passo 3 não reescreve mais `workspace_id` e adiciona `.eq('workspace_id', ...)`
  ao `UPDATE`;
- passo 4 adiciona `.eq('workspace_id', workspaceId)` ao soft-delete.

**Restauração dos dados**
1. `UPDATE ghl_users SET workspace_id = <real>` para as 8 pessoas transferidas,
   critério = ter comunicações na conta real (papéis preservados);
2. `SELECT public.sync_ghl_users_job();` com a função já corrigida, que
   reconstruiu o estado verdadeiro a partir da API do GHL.

**Resultado:** conta real de 0 → **29 usuários ativos**; burn-in seguiu com 10;
card "Ligações hoje" voltou a **102**.

## 4. Lição / regra

Vale a mesma regra já registrada em `docs/VARREDURA-CROSS-TENANT-COMPLETA.md`,
agora do lado da **escrita**: toda rotina que roda *uma vez por workspace* tem de
filtrar por `workspace_id` em **leitura, escrita E exclusão**. Filtrar só na
leitura da API externa não basta — o passo de reconciliação ("o que existe no
banco e não veio na API") é justamente onde o vazamento vira perda de dado.

Sintoma a desconfiar: **contador que zera sem erro**. Quando o KPI depende de uma
lista intermediária, lista vazia deve ser distinguível de resultado vazio.
