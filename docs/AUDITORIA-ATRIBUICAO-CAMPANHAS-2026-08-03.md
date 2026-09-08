# Auditoria de atribuição — todas as campanhas (2026-08-03)

> **Atualizado em:** 2026-08-03 BRT
> **Motivo:** após corrigir o bug da UTM apagada por webhook vazio
> ([`BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md`](BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md)),
> verificar se **outras campanhas** sofriam do mesmo problema.
> **Veredito:** o bug está zerado em toda a base. O que restou é de
> parametrização de anúncio — fora do alcance do sistema.

---

## 1. Armadilha metodológica encontrada no caminho

A primeira varredura comparou Meta × dash **sem filtrar workspace** e produziu
um quadro alarmante e **falso** (PG27 com 24% de captura, PG32 com 63%).

Causa: o banco tem o tenant de demonstração `Acme Educação (Demo)`
(`d0000000-0000-4000-8000-000000000001`) com **8.200 contatos fictícios, 3.583
deles pagos, e 2.060 linhas em `meta_ads_insights`** — ver
[`TENANT-DEMONSTRACAO.md`](TENANT-DEMONSTRACAO.md). Consultas feitas com
`service_role` **não passam por RLS** e enxergam os dois workspaces somados.

> ⚠️ **Regra para qualquer auditoria futura via MCP/service_role:** filtrar
> `workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'` (workspace `Default`,
> o do cliente real) nos **dois lados** da comparação. Sem isso, números de
> Meta Ads e de CRM ficam inflados por dados de demonstração e levam a
> diagnóstico errado.

---

## 2. Resultado real — Meta × dash por página (30 dias, workspace do cliente)

| Página | Campanha | Meta | Dash | % capturado |
|---|---|---|---|---|
| 53 | `[cp] maquina-conteudo-online-07-26` | 262 | 239 | 91% |
| 32 | `[cp] form-fb` | 212 | 225 | 106% |
| 9 | `[cp] form reduzido` | 72 | 64 | 89% |
| 58 | `[cp] codigo-audiencia-08-26` | 72 | 87 | 121% |
| 45 | `[cp] bpo-performance` | 33 | 33 | 100% |
| 46 | `[cp] form direto bpo performance` | 18 | 22 | 122% |
| 52 | `[cp] cami-400-pg1` | 11 | 8 | 73% |
| 47 | `[cp] form-fb bpo performance` | 9 | 0 | 0% |
| 12 | `[cp] aplicação` | 13 | 76 | 585% |

Faixa de 89%–122% é **ruído esperado**, não perda: o Meta conta pela janela de
atribuição do clique (até 7 dias) e em fuso próprio, enquanto a dash conta pelo
momento do cadastro. As duas linhas fora da faixa (47 e 12) são explicadas na
seção 4 — são o mesmo fenômeno visto pelos dois lados.

---

## 3. O bug da UTM apagada está zerado

Consulta de resíduo em **toda** a base do workspace do cliente:

```sql
SELECT COUNT(*) FROM contatos c
WHERE c.utm_source IS NULL AND c.ghl_id IS NOT NULL
  AND c.workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND EXISTS (
    SELECT 1 FROM webhooks_ghl wh
    WHERE TRIM(wh.payload->>'contact_id') = c.ghl_id
      AND NULLIF(TRIM(wh.payload->>'utm_source'), '') IS NOT NULL
  );
-- resultado: 0
```

**Zero** leads com origem recuperável. O backfill foi estendido até 2024. Os
contatos que seguem sem UTM não têm origem em webhook nenhum — são tráfego
direto/importado real e devem permanecer `NULL`.

O backfill **não tocou** o tenant de demonstração (verificado: 0 linhas do
workspace demo com `updated_at` na janela da execução).

---

## 4. Achado novo: nome do anúncio × parâmetro do link divergem

Este **não é** bug do sistema — o Empire grava fielmente o que o link entrega.

O teste decisivo é **interno ao próprio lead**, sem depender do Meta: comparar o
`PG` escrito dentro de `contatos.utm_term` (que é o nome do anúncio) com
`contatos.utm_campaign` (que é o parâmetro que o link carrega).

```sql
SELECT (regexp_match(c.utm_term,'PG(\d+)'))[1] AS pg_no_nome_do_anuncio,
       c.utm_campaign                          AS pg_no_parametro_do_link,
       COUNT(*) AS leads, MIN(c.utm_term) AS exemplo
FROM contatos c
WHERE c.workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
  AND c.date_created >= '2026-07-04'
  AND c.utm_term ~ 'PG\d+' AND c.utm_campaign IS NOT NULL
  AND (regexp_match(c.utm_term,'PG(\d+)'))[1] IS DISTINCT FROM c.utm_campaign
GROUP BY 1,2 ORDER BY leads DESC;
```

Resultado (30 dias — **69 leads** divergentes):

| PG no nome do anúncio | PG no parâmetro do link | Campanha onde o lead é contado | Leads |
|---|---|---|---|
| **32** | **6** | `[cp] pagina-recrutamento-antigo` | **47** |
| 53 | 55 | `[cp] webinario-ss-07-26` | 7 |
| 9 | 58 | `[cp] codigo-audiencia-08-26` | 4 |
| 53 | 58 | `[cp] codigo-audiencia-08-26` | 3 |
| 52 | 25 | `[cp] cami start` | 2 |
| 32 | 55 | `[cp] webinario-ss-07-26` | 2 |
| demais | — | — | 4 |

### O caso grave: 47 leads na campanha errada

Os anúncios `M1_O1_P29_CR-187_PG32`, `..._CR-248_PG32` e `..._CR-836_PG32`
dizem **página 32** no nome, mas o link carrega `utm_campaign=6`. Resultado:
47 leads novos de julho/agosto são contabilizados em
**`[cp] pagina-recrutamento-antigo`** — uma campanha marcada como antiga.

**Hipótese de reciclagem descartada:** os contatos foram criados em 02–03/08 e
geraram lead no mesmo dia. Não são contatos velhos carregando UTM antiga; o
link do anúncio ativo entrega mesmo `utm_campaign=6`.

### O que isso explica

- **PG47 com 0 na dash:** o criativo CR-170 é nomeado `M6_O1_P40_CR-170_PG47`
  mas entrega UTM de `PG45`/`PG46` — os leads existem, contados na página vizinha
  (que por isso aparece com 100% e 122%).
- **PG12 com 585%:** a outra ponta do mesmo fenômeno — leads chegando com
  parâmetro de uma campanha que teve pouco/nenhum gasto no período.

### Ação — é do gestor de tráfego, não do sistema

Nenhum lead é perdido; eles são **atribuídos à página errada**. A correção é
alinhar, nos anúncios, o `PG` do **nome** com o `utm_campaign` do **link**.
Prioridade pelo volume:

1. `CR-187`, `CR-248`, `CR-836` na campanha de `PG32` → link aponta `utm_campaign=6`
2. `CR-170` (`PG47`/`PG45`/`PG46`)
3. `CR-335` (`PG9`/`PG52`)
4. `CR-1121`/`CR-1154` (`PG53` × `PG55`/`PG58`)

Enquanto não for corrigido, o relatório por campanha continua deslocando esses
leads de linha — e o CPL por campanha fica distorcido nos dois lados.

---

## 5. Consulta de vigilância

A query da seção 4 serve como verificação periódica. Se o número de leads
divergentes crescer, há anúncio novo publicado com nome e link desalinhados.

Nada disso é detectável pelo sistema sozinho: do ponto de vista do webhook, um
`utm_campaign=6` vindo de um anúncio chamado `PG32` é um dado perfeitamente
válido. Só o cruzamento acima revela a inconsistência.
