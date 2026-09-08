# Caça a bugs — classe "escrita em coluna/tabela inexistente"

> **Prioridade:** OBRIGATÓRIO
> **Gatilho:** PR #35 achou por acaso, durante um backfill de rotina, que `sync-ad-permalinks`
> fazia `upsert` numa coluna que nunca existiu em `meta_ads_permalinks` — quebrado 100% dos
> workspaces, de forma silenciosa (o insert/upsert inteiro falha, não só o campo extra).
> Hipótese: se um bug desses apareceu por acaso, provavelmente existem mais.

## Metodologia

1. **Schema de verdade extraído do banco de TESTE** (`fgjbmdsucruvtpywyhhf`), não de migrations
   (o schema real diverge das migrations — ver [`docs/BASELINE-REPRODUCIBILIDADE.md`](BASELINE-REPRODUCIBILIDADE.md)):
   ```sql
   SELECT table_name, column_name, data_type
   FROM information_schema.columns WHERE table_schema='public'
   ORDER BY table_name, ordinal_position;
   ```
   Executado via `supabase db query --linked` (não precisa de Docker/`db push`).
2. Varredura de **todas as 43 edge functions** (`supabase/functions/**/*.ts`) procurando cadeias
   `.from('tabela').insert()/.update()/.upsert()`, extraindo as chaves do payload (objeto
   literal, array de objetos, variável, ou retorno de função auxiliar) e comparando contra o
   schema real.
3. Varredura complementar das funções/triggers PL/pgSQL "vivas" (que rodam a cada webhook):
   `extrair_dados_ghl_v2` e `extrair_vendas_fechamento_do_webhook`.

## Achado real

### `webhook-compras` (Hotmart) — 14 colunas inexistentes em `maquina_de_conteudo`

**Arquivo:** `supabase/functions/webhook-compras/index.ts`, função `parseCompra()`.

O payload construído incluía `hotmart_event_id`, `data_evento`, `comprador_documento`,
`comprador_pais`, `comprador_cidade`, `comprador_cep`, `produto_ucode`, `valor_total`,
`comissao_produtor`, `comissao_marketplace`, `afiliado_nome`, `afiliado_codigo`,
`pais_compra`, `modelo_negocio` — nenhuma dessas colunas existia na tabela
(`supabase/migrations/20260218000000_baseline_public_schema.sql:888`, 23 colunas).

**Impacto:** desde a introdução da function (commit `e0a43d3`), **todo webhook de compra
Hotmart falhava** com erro de coluna inexistente (`PGRST204`/`42703`) e retornava HTTP 500 —
nenhuma compra estava sendo persistida em `maquina_de_conteudo`. O handler capturava o erro e
respondia 500 (não era 100% silencioso do ponto de vista de quem observasse o webhook), mas
não havia dado persistido, e o padrão (payload rico > schema) é idêntico ao do
`sync-ad-permalinks`.

**Decisão de correção:** adicionar as 14 colunas via migration (`20260815000000_fix_
maquina_de_conteudo_colunas_faltantes.sql`), preservando o dado de negócio que o código já
tentava capturar — em vez de truncar o payload e descartar informação (documento do comprador,
endereço, comissão, dados de afiliado) que claramente era intencional.

### Achados descartados (falsos positivos / dívida técnica não-bloqueante)

- `compute-weekly-reports/index.ts` referencia `metas_ads` (tabela que não existe) só em
  `SELECT` com fallback automático para `metas` — é leitura defensiva já tratada no próprio
  código (try/catch), não um bug ativo. Não corrigido nesta rodada; candidato a limpeza futura
  (remover a tentativa morta ou criar a tabela, a decidir quando alguém mexer nesse código de novo).
- `crm-registrar-venda` usa `supabase.storage.from('vendas-comprovantes')` — é um bucket do
  Storage, não uma tabela `public.*`; investigado e descartado.

## Guarda estrutural (regressão futura)

Novo teste `__tests__/integration/schema-write-columns-structural.test.ts` (roda no CI via
`.github/workflows/integration-isolation.yml`, mesmo pipeline da suite de isolamento):

1. Faz o parsing estático de `supabase/functions/**/*.ts` com um scanner próprio (regex +
   balanceamento de chaves/parênteses — não usa o compilador TS para evitar dependência extra),
   extraindo toda chamada de escrita (`insert`/`update`/`upsert`) e as colunas do payload —
   inclusive quando o payload vem de uma variável (`const row = {...}`) ou de uma função
   auxiliar (`const compra = parseCompra(body); ...upsert(compra)`), resolvendo a declaração
   **mais próxima antes do site de chamada** (evita conflito de nomes reaproveitados como `row`
   em arquivos grandes com múltiplas seções, ex. `compute-weekly-reports`).
2. Para cada tabela+colunas encontrada, faz um `select(colunas, {head:true}).limit(0)` contra o
   banco de teste **ao vivo** (não um JSON de schema versionado — elimina o risco de o próprio
   guard ficar desatualizado). Se a tabela ou qualquer coluna não existir, o teste falha
   apontando arquivo:linha exatos.
3. Casos que o scanner não consegue resolver estaticamente (ex.: objeto construído por múltiplas
   atribuições condicionais — `const x: any = {}; if (...) x.foo = y;`) são logados como "não
   verificável" no `console.warn`, nunca escondidos silenciosamente. Nesta rodada, 18 chamadas
   (de ~10 arquivos, majoritariamente `reconcile-contact-opportunities` e
   `sync-contact-opportunities`) caem nessa categoria — foram conferidas manualmente durante a
   varredura e estão OK; se algum desses arquivos mudar para o padrão de objeto literal simples,
   o guard passa a cobri-los automaticamente sem precisar de nova heurística.

Rodar localmente:
```bash
./eb-dash2/node_modules/.bin/vitest -c eb-dash2/vitest.integration.config.ts run \
  __tests__/integration/schema-write-columns-structural.test.ts
```

## Escopo não coberto nesta rodada

- As ~400 migrations históricas não foram varridas arquivo a arquivo (só as funções/triggers
  "vivas" de maior tráfego). Migrations antigas de DDL puro não escrevem dados via código vivo,
  então o risco é baixo, mas não é zero — se uma investigação futura tiver motivo para suspeitar
  de outro trigger, vale repetir o mesmo método aqui.
