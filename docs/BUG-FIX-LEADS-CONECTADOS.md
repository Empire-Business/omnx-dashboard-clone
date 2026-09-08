# BUG FIX: Leads conectados contabilizados como NÃO conectados

**Data:** 2026-07-12
**Severidade:** CRÍTICO
**Impacto:** ~14% das oportunidades abertas (321 de 2.251, medição por proxy em produção) com `data_conectado` indevidamente `NULL`. Sistêmico — todo o workspace de produção, não caso isolado.
**Migration:** [`supabase/migrations/20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql`](../supabase/migrations/20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql)
**Teste de regressão:** [`__tests__/integration/data-conectado-mapping-spacing.test.ts`](../__tests__/integration/data-conectado-mapping-spacing.test.ts)
**Dependência nova (2026-07-14):** `supabase/migrations/20260827000000_add_ghl_extra_fields_extraction.sql` ("campos extras", [`docs/GHL-CAMPOS-EXTRAS.md`](GHL-CAMPOS-EXTRAS.md)) usa o corpo desta migration como base — decisão do dono de promover as duas juntas em produção. Ao aplicar `20260827000000`, aplicar `20260821000000` antes/junto, nunca depois.

---

## Sintoma

Lead `robertdantasml@gmail.com` foi de fato conectado (tag `conectado` presente no contato no GHL, respondeu mensagem da SDR IA), mas o painel de Pré-Vendas o exibia como **não conectado**.

---

## O que significa "conectado" no domínio

`oportunidades.data_conectado` é uma coluna `DATE`. O front-end conta "Conectados" checando simplesmente se essa coluna é truthy — sem olhar tag, estágio ou pipeline:

```ts
// eb-dash2/src/hooks/useTrafego.ts, useSDRLeaderboard.ts, prevendas/tabs/*.tsx
opps.filter((o) => o.data_conectado)
```

Essa data vem de um **custom field de data no GHL** (`{{opportunity.mqlconectado}}` / `{{opportunity.d_mqlconectado}}`), resolvido via a camada de mapeamento configurável por workspace introduzida na Fase 4 do mapeamento GHL (`ghl_field_mappings`, PR #43 — "refactor webhook extraction to use GHL mappings v2"). Antes da Fase 4, a chave era hard-coded na função de extração; hoje é uma linha configurável na tabela `ghl_field_mappings` (`logical_name = 'data_conectado'`).

Existe uma segunda via, independente do webhook: a trigger `auto_tag_conectado_on_inbound` em `comunicacoes` também seta `data_conectado` quando o contato responde após uma mensagem outbound (só se ainda estiver `NULL`). Essa trigger não tem relação com o bug — ela funciona corretamente. O problema está na camada de mapeamento por webhook.

---

## Causa raiz (2 problemas encadeados)

### 1) `resolve_ghl_field_value` só normalizava espaço em UM sentido

A variação cadastrada em `ghl_field_mappings` para `data_conectado` é:

```json
["{{opportunity.mqlconectado}}", "{{opportunity.d_mqlconectado}}"]
```

— **sem** espaço interno. Mas o payload real que o GHL desta conta manda (via o workflow "Oportunidade Criada/Atualizada -> DASH NOVO (OPEN CLAW)") traz a chave em `customData` **com** espaço interno:

```json
{ "{{ opportunity.mqlconectado }}": "8/7/2026 12:44 PM", "{{ opportunity.d_mqlconectado }}": "2026-07-08" }
```

A função `resolve_ghl_field_value` (`supabase/migrations/20260708000001_create_ghl_field_mapping_helpers.sql`) tinha um fallback de "chave compacta" — mas ele só removia espaços da **variação** (que já não tinha nenhum), nunca tentava casar com uma chave do payload que tivesse espaço. Resultado: para este workspace, `data_conectado` **nunca resolvia**, mesmo quando o GHL mandava o valor certo. Confirmado lendo o payload bruto de `webhooks_ghl` em produção (leitura) para a oportunidade `dhwuJ5AKLsAKSYzu8Nu3` do lead Robert Dantas: `{{ opportunity.d_mqlconectado }}` = `"2026-07-08"` chegou várias vezes, e mesmo assim a extração não conseguia lê-lo.

### 2) `extrair_dados_ghl_v2` sobrescrevia `data_conectado` sem `COALESCE`

No `PASSO 2b` (UPDATE de oportunidades existentes), `pipeline_id`/`pipeline_name` já eram protegidos com `COALESCE(valor_novo, valor_existente)` — regra documentada desde o bug de `pipeline_id NULL` ([`docs/BUG-FIX-PIPELINE-NULL.md`](BUG-FIX-PIPELINE-NULL.md)). `data_conectado` **não** tinha essa proteção: todo webhook subsequente da mesma oportunidade sobrescrevia o campo com o que o mapeamento resolvesse — e, por causa do problema 1, isso era **sempre `NULL`** para este workspace. Ou seja: mesmo nos casos raros em que `data_conectado` fosse setado corretamente por outra via (ex: a trigger de `comunicacoes`), o próximo webhook da oportunidade apagava o valor.

### Caso real (produção, leitura, 2026-07-12)

Contato `robertdantasml@gmail.com` (`ghl_id=0t5bcrGXBtIanv7H2cUW`) tem **2 oportunidades**:

| Oportunidade | Pipeline | `data_conectado` |
|---|---|---|
| `dhwuJ5AKLsAKSYzu8Nu3` | Vendas SQL | `2026-07-08` (setada pela trigger de `comunicacoes`, sobreviveu por não ter recebido webhook novo depois) |
| `NUdYsgcsH3CKBNuyqxWj` | **Pré-Vendas nMQL** ← a que o painel de Pré-Vendas enxerga | `NULL` (zerada pelo último webhook, que não conseguiu resolver o custom field) |

O contato tem a tag `conectado` no GHL (confirma que a conexão de fato aconteceu), mas a oportunidade de Pré-Vendas ficava com o campo zerado.

### Extensão medida (produção, leitura)

Proxy: oportunidades **abertas** cujo contato tem a tag `conectado`, mas `data_conectado IS NULL`.

```
321 de 2.251 oportunidades abertas com contato tag "conectado" (~14%) — NÃO é caso isolado.
```

(Total geral: 10.737 oportunidades, 6.665 com `data_conectado NULL`, 4.072 preenchidas — a proporção real de subcontagem entre as 6.665 é maior ainda, já que a tag "conectado" é apenas uma evidência parcial; oportunidades conectadas via outros caminhos, sem a tag sincronizada, não entram nesse proxy.)

---

## Correção aplicada

Migration `20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql`:

1. **`resolve_ghl_field_value`** — para chaves `{{...}}`, se a chave exata não bater, varre as chaves reais de `customData` e compara ignorando espaços internos dos **dois lados** (chave do payload e variação cadastrada), em vez de só normalizar a variação. Corrige o mismatch nos dois sentidos — vale para `data_conectado` e para qualquer outro campo `{{opportunity.xxx}}` afetado pelo mesmo padrão de digitação inconsistente no workflow do GHL (a inspeção do payload mostrou que o espaçamento varia campo a campo dentro do mesmo payload — não é um padrão único).
2. **`extrair_dados_ghl_v2`** — `data_conectado` agora usa `COALESCE(parse_date_flexible(w.mapped->>'data_conectado'), o.data_conectado)` no UPDATE, mesmo padrão de `pipeline_id`/`pipeline_name`. Um webhook que não resolve o campo nunca mais apaga um `data_conectado` já confirmado.
3. **Backfill cirúrgico** — recalcula `data_conectado` (com a função já corrigida) apenas para oportunidades onde hoje está `NULL`, a partir do último webhook conhecido daquela oportunidade. Não toca em nenhuma oportunidade que já tem o campo preenchido, nem em nenhum outro campo.

Validado no banco de TESTE (`fgjbmdsucruvtpywyhhf`):
- `resolve_ghl_field_value` com a chave espaçada (`{{ opportunity.mqlconectado }}`) e a variação sem espaço agora resolve para o valor correto (antes retornava `NULL`).
- `parse_date_flexible('8/7/2026 12:44 PM')` → `2026-07-08`.
- Teste de regressão prova as duas pontas: um webhook com a chave espaçada preenche `data_conectado`; um segundo webhook da mesma oportunidade sem o campo populado **não** apaga o valor já confirmado.

---

## Fora de escopo (decisão registrada, não omissão)

O `PASSO 2b` de `extrair_dados_ghl_v2` tem ~14 outros campos de data de marco sem `COALESCE`: `data_no_show`, `data_perdido`, `data_qualificado`, `data_pendencias_preenchimento`, `data_no_show_vendas`, `data_perdido_vendas`, `data_realizacao_vendas`, `data_negociacao`, `data_fechado`, `data_reuniao_realizada`, `data_auto_agendamento`, `data_tentativa_1..8`, `data_ultima_atividade`.

**Por que não protegi todos cegamente nesta migration:** "conectado" é estritamente aditivo — uma vez verdadeiro, nunca pode voltar a ser falso, então `COALESCE` é sempre seguro para ele. O mesmo não é necessariamente verdade para todos os outros: `data_perdido` e `data_no_show`, por exemplo, podem precisar ser legitimamente resetados pelo próprio webhook em fluxos de reativação de lead (perdido → reaberto). Aplicar `COALESCE` sem auditar caso a caso arriscaria travar um estado incorreto para sempre (o oposto do bug que este fix resolve).

**Recomendação:** auditoria dedicada, campo a campo, para decidir quais dos ~14 campos restantes devem ganhar a mesma proteção — provavelmente a maioria (qualquer "isto aconteceu em tal data" tende a ser aditivo), mas alguns explicitamente ligados a reativação/perda podem precisar permanecer sobrescrevíveis. Esse levantamento fica fora do escopo deste bug fix pontual.

---

## Aplicação em produção

**✅ Aplicada em produção em 2026-07-14**, junto com `20260827000000` (campos extras — [`docs/GHL-CAMPOS-EXTRAS.md`](GHL-CAMPOS-EXTRAS.md)), conforme decisão do dono ("Aproveita e promove os dois juntos"). Aplicada via `supabase db push --include-all` no projeto `qzesffnkqgelmtfblzkr`, com as demais migrations deliberadamente excluídas (`20260819000000`, `20260820000000`, `20260824000000`) movidas temporariamente para fora de `supabase/migrations/` durante o push e restauradas em seguida — nenhuma delas foi tocada.

**Verificação pós-aplicação (leitura, produção):**
- `extrair_dados_ghl_v2` confirmado com o `COMMENT` da versão corrigida (`COALESCE` de `data_conectado` desde `20260821000000` + `custom_fields` desde `20260827000000`).
- Proxy de extensão (contato com tag `conectado` + oportunidade aberta + `data_conectado NULL`): **337 de 2.309 (~14,6%)**, ante os 321/2.251 (~14,3%) medidos em 2026-07-12. A proporção permanece estável, como esperado — o backfill cirúrgico (item 3 desta migration) só recalcula a partir do **último webhook conhecido** de cada oportunidade; opps cujo último webhook nunca carregou o campo resolvível (não é o mesmo bug de espaçamento) continuam fora do alcance do backfill. O ganho real está nas oportunidades **novas/atualizadas a partir de agora**, que passam pela função corrigida.
