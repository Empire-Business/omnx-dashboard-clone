# Relatório de QA — Extração de Investimento por Região (Meta Ads)

> **Branch:** `feat/meta-ads-region-breakdown`  
> **Data da revisão:** 2026-06-18  
> **Revisor:** Agente de QA OMNX  
> **Restrição crítica:** ZERO quebra no sistema atual.

---

## 1. Status geral

| Item | Status | Observação |
|---|---|---|
| Edge Function `sync-meta-ads` (comportamento padrão) | ⚠️ **PASS com ressalvas** | Sync padrão continua ativando `processar_meta_ads_raw`, mas array vazio de `breakdowns` pode enviar `breakdowns=` para a Meta. |
| Edge Function `sync-meta-ads` (com breakdowns) | ⚠️ **PASS com ressalvas** | Roteamento para `processar_meta_ads_raw_breakdown` correto. |
| Edge Function `sync-meta-ads-backfill` | ⚠️ **PASS com ressalvas** | Validação de `breakdowns` está correta; consistência de `buildInsightsFields` idêntica. |
| Migration `20260618175926_meta_ads_region_breakdown.sql` | 🔴 **NEEDS_REVIEW** | Vários pontos de atenção: recriação da função padrão com micro-divergência, perda de campos calculados/JSONB no processador de breakdown, e documentação não atualizada. |
| Script Python `cpv-real-por-regiao.py` | ✅ **PASS** | Executa sem erros; CSV/MD gerados fazem sentido aritmeticamente. |
| Consistência entre Edge Functions | ✅ **PASS** | Lógica de `buildInsightsFields` e escolha de RPC estão alinhadas. |
| Segurança (secrets) | ✅ **PASS** | Nenhuma exposição de tokens ou service role key no código. |

**Status geral da entrega:** 🟡 **NEEDS_REVIEW antes de merge/deploy.**

Não há bugs catastróficos imediatos, mas existem regressões silenciosas e comportamentos inesperados que precisam ser endereçados antes do backfill em produção.

---

## 2. Revisão de código das Edge Functions

### 2.1 `sync-meta-ads/index.ts`

#### ✅ O sync padrão (sem body) continua exatamente igual?

**Sim, com uma ressalva.**

- Quando o body é vazio ou inválido, `body = {}`.
- O código cai no ramo `else` e define `insightParams = { level: 'ad', date_preset: 'today', breakdowns: body.breakdowns }`.
- Como `body.breakdowns` é `undefined`, a função `processRawInsights` recebe `undefined` e chama `processar_meta_ads_raw`.

⚠️ **Ressalva:** o `insightParams` atribui `breakdowns: body.breakdowns` mesmo quando `body.breakdowns` é `undefined`. Em TypeScript isso gera a chave com valor `undefined`. Na prática, `params.breakdowns` vira `undefined` e não é enviado à Meta (`if (params.breakdowns)` é falso). Então o sync padrão não muda.

#### ⚠️ O parâmetro `breakdowns` é opcional e bem tratado?

**Parcialmente.**

- A função aceita `breakdowns` como array opcional.
- Quando `breakdowns` é um array válido (`["country","region"]`), os campos `country` e `region` são adicionados aos fields e o parâmetro é repassado à Meta.
- **Problema:** se `breakdowns` for um array vazio (`[]`), a condição `if (params.breakdowns)` em `fetchMetaInsights` é **truthy** (array vazio é truthy em JavaScript). Isso faz com que a Meta receba `breakdowns=` (string vazia). A Meta pode rejeitar a requisição ou interpretar de forma inesperada.

**Recomendação:** alterar a linha 228 de:

```ts
if (params.breakdowns) url.searchParams.append('breakdowns', params.breakdowns.join(','));
```

para:

```ts
if (params.breakdowns && params.breakdowns.length > 0) url.searchParams.append('breakdowns', params.breakdowns.join(','));
```

#### ✅ A escolha entre `processar_meta_ads_raw` e `processar_meta_ads_raw_breakdown` está correta?

**Sim.** A função `processRawInsights` verifica `breakdowns && breakdowns.length > 0` e escolhe a RPC correta.

#### ✅ Há risco de exposição de secrets?

**Não.**

- O token da Meta é mascarado no log (`replace(accessToken, '***')`).
- O log da linha 421 só indica "present" ou "MISSING", sem expor o token.
- A service role key é lida de `Deno.env` e usada apenas no cliente Supabase interno.

---

### 2.2 `sync-meta-ads-backfill/index.ts`

#### ✅ Parâmetro `breakdowns` é opcional e validado?

**Sim, e melhor que na função principal.**

- Verifica se `breakdowns !== undefined` e se é array.
- Verifica se todos os elementos são strings.
- Normaliza array vazio para `undefined`.

#### ✅ Roteamento para RPC correto?

**Sim.** A função `processDay` usa `hasBreakdowns` para escolher entre `processRawInsights` e `processRawInsightsBreakdown`.

#### ⚠️ Dados salvos no `params` do raw

O backfill salva `breakdowns` no `params` apenas quando existem:

```ts
...(breakdowns ? { breakdowns } : {}),
```

Isso é correto e consistente com a função principal.

#### ⚠️ Consistência do `buildInsightsFields`

As duas Edge Functions têm implementações ligeiramente diferentes da mesma função, mas com comportamento idêntico:

- `sync-meta-ads`: cria novo array via spread e retorna.
- `sync-meta-ads-backfill`: clona array base e faz push condicional.

Ambas adicionam `country` e `region` quando há breakdown geográfico. **Comportamento equivalente.**

---

## 3. Revisão da migration `20260618175926_meta_ads_region_breakdown.sql`

### 3.1 Schema e tabela de mapeamento

#### ✅ Coluna `breakdown_type`

Adiciona `breakdown_type TEXT` na `meta_ads_insights_breakdowns`. Permite `NULL`, o que é compatível com registros antigos, mas exige cuidado em queries futuras.

#### ✅ Tabela `meta_ads_region_mapping`

- Criada com `region_name TEXT PRIMARY KEY`, `uf TEXT NOT NULL`, `regiao TEXT NOT NULL`.
- Seed inicial contém os 26 estados + Distrito Federal.

⚠️ **Risco:** os nomes devolvidos pela Meta podem não ter acentuação correta ou podem vir em inglês/español. Por exemplo, a Meta pode retornar `Sao Paulo` em vez de `São Paulo`. O seed atual usa a forma acentuada. Regiões não mapeadas não quebram o processamento, mas dificultam a análise (ficam como "Indefinido").

**Recomendação:** após o primeiro lote do backfill, executar uma query de diagnóstico para listar `region` distintas não mapeadas e atualizar a tabela.

#### ✅ Índices

- `idx_meta_ads_breakdowns_region`
- `idx_meta_ads_breakdowns_country`
- `idx_meta_ads_breakdowns_type`

Todos criados com `IF NOT EXISTS`. Corretos.

#### ✅ RLS e grants

- RLS habilitado em `meta_ads_region_mapping`.
- Policy para `service_role`.
- `GRANT ALL ON meta_ads_region_mapping TO service_role`.
- `GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role` (igual à migration original, mas concede permissões amplas — manter consciente).

---

### 3.2 Função `processar_meta_ads_raw_breakdown`

#### ✅ Agregação dos totais por `(ad_id, date)`

A função faz CTEs `exploded` e `actions_extracted`, depois agrupa por `ad_id, dt` e soma:

- `spend`, `impressions`, `clicks`, `reach`
- `landing_page_views`, `video_views`, `link_clicks`, `leads`, `onsite_web_leads`, `fb_pixel_leads`

Depois faz upsert na `meta_ads_insights` com `ON CONFLICT (ad_id, date)`.

#### 🔴 Perda de campos calculados e JSONB na tabela principal

Este é o problema mais sério da migration. Quando a função de breakdown insere/atualiza a `meta_ads_insights`, ela **não preenche**:

- `frequency`
- `ctr`
- `cpc`
- `cpm`
- `cpp`
- `actions` (fica como `'[]'::jsonb`)
- `conversions`
- `conversion_values`
- `cost_per_action_type`
- `video_metrics`
- `quality_ranking`
- `engagement_rate_ranking`
- `conversion_rate_ranking`

Como o `ON CONFLICT DO UPDATE` também não atualiza essas colunas, ao rodar o backfill por região sobre datas que já existem na tabela principal, os valores antigos dessas colunas **serão mantidos** (se a linha já existia) ou ficarão **NULL** (se for uma nova linha).

**Por que isso importa:**

- `actions`, `conversions`, `video_metrics` e rankings são usados por dashboards e relatórios. Se o backfill por região for rodado sobre todo o histórico, esses campos podem ficar desatualizados ou vazios.
- `frequency`, `ctr`, `cpc`, `cpm`, `cpp` não são somáveis por região, então não faz sentido agregá-los. Mas a solução correta seria **não sobrescrever** esses campos na tabela principal quando já existem valores do sync padrão. A função atual sobrescreve tudo exceto o que está explicitamente no `DO UPDATE`.

**Recomendação:**

1. Adicionar `actions` agregado (JSONB) no insert/update da tabela principal, OU
2. No mínimo, garantir que `conversions`, `conversion_values`, `cost_per_action_type`, `video_metrics` e rankings sejam preservados se a linha já existir (não sobrescrever com NULL/vazio).

A forma mais segura seria alterar o `DO UPDATE` para preservar os valores antigos quando eles existirem:

```sql
frequency = COALESCE(EXCLUDED.frequency, meta_ads_insights.frequency),
ctr = COALESCE(EXCLUDED.ctr, meta_ads_insights.ctr),
...
actions = COALESCE(NULLIF(EXCLUDED.actions, '[]'::jsonb), meta_ads_insights.actions),
```

Ou, alternativamente, fazer o backfill por região **antes** do backfill padrão, ou garantir que o sync padrão de hora em hora reexecute sobre as mesmas datas para repopular esses campos.

#### ✅ Idempotência (não duplica breakdowns)

A função apaga os breakdowns do tipo `'region'` do `insights_id` antes de inserir novamente:

```sql
DELETE FROM meta_ads_insights_breakdowns
WHERE insights_id = v_insight_id
  AND breakdown_type = 'region';
```

**Correto e idempotente.**

#### ⚠️ Hardcoded `'region'`

A função se chama `processar_meta_ads_raw_breakdown` (nome genérico), mas internamente trata apenas breakdowns do tipo `region`. Se alguém chamar com `breakdowns: ["age","gender"]`, a função vai inserir `breakdown_type = 'region'` e filtrar `region IS NOT NULL`, resultando em zero breakdowns inseridos.

Isso não é um bug para o escopo atual, mas o nome da função pode induzir a erro futuro. **Recomendação:** renomear para `processar_meta_ads_raw_region_breakdown` ou documentar claramente que só suporta `region`.

#### ⚠️ `MIN()` em campos nomeáveis

A agregação usa `MIN(account_id)`, `MIN(campaign_id)`, `MIN(campaign_name)` etc. para campos que não estão no `GROUP BY`. Isso é funcional porque todos os registros de um mesmo `ad_id` em um dia devem ter os mesmos nomes, mas é uma solução frágil. Se houver renomeação no meio do dia, o resultado será arbitrário.

A função padrão `processar_meta_ads_raw` usa o último registro (ordem da Meta), enquanto a função de breakdown usa `MIN`. Isso pode gerar diferenças sutis nos nomes após o backfill.

---

### 3.3 Guarda na função `processar_meta_ads_raw`

#### ✅ Guarda de segurança

A migration adiciona:

```sql
IF (v_raw.params->'breakdowns') IS NOT NULL AND jsonb_array_length(v_raw.params->'breakdowns') > 0 THEN
    RAISE EXCEPTION 'Raw com breakdowns deve ser processado por processar_meta_ads_raw_breakdown';
END IF;
```

**Correto.** Impede que alguém chame a função errada e corrompa os dados.

#### 🔴 Recriação da função padrão com micro-divergência

A migration recria `processar_meta_ads_raw` inteira. A intenção é manter a mesma lógica da migration `20260409120000_fix_processar_meta_ads_raw_update_names.sql`, mas há uma divergência:

- Na migration `20260409`, o `ON CONFLICT DO UPDATE` **não atualiza** `account_id`.
- Na migration `20260618`, o `ON CONFLICT DO UPDATE` **atualiza** `account_id = EXCLUDED.account_id`.

Embora atualizar `account_id` não cause problema prático (raramente muda), a regra do projeto é **não alterar o comportamento do sync padrão**. Qualquer divergência aumenta o risco de regressão.

**Recomendação:** remover `account_id = EXCLUDED.account_id` do `DO UPDATE` para manter fidelidade total à versão anterior.

Além disso, a migração não explica por que precisa recriar a função inteira em vez de apenas adicionar a guarda via `CREATE OR REPLACE` com o corpo anterior. Recriar funções grandes aumenta a chance de regressão.

---

### 3.4 Constraint `ON CONFLICT (ad_id, date)`

#### ✅ Constraint real do banco

A migration `20260311152000_fix_meta_ads_insights_dedup.sql` alterou a constraint para:

```sql
ALTER TABLE meta_ads_insights
ADD CONSTRAINT meta_ads_insights_ad_id_date_key UNIQUE (ad_id, date);
```

A migration `20260618` usa corretamente `ON CONFLICT (ad_id, date)` tanto na função de breakdown quanto na função padrão.

---

## 4. Consistência entre Edge Functions

### ✅ `buildInsightsFields`

Ambas as funções adicionam `country` e `region` quando `breakdowns` inclui `country` ou `region`. O comportamento é equivalente.

### ✅ Escolha de RPC

- `sync-meta-ads`: `processRawInsights(supabase, rawId, insightParams.breakdowns)`
- `sync-meta-ads-backfill`: `processDay` → `hasBreakdowns ? processRawInsightsBreakdown : processRawInsights`

Ambas chamam `processar_meta_ads_raw_breakdown` quando há breakdowns e `processar_meta_ads_raw` quando não há.

---

## 5. Testes locais

### ✅ Execução do script Python

```bash
python3 analises/cpv-por-regiao/cpv-real-por-regiao.py
```

**Resultado:** executou sem erros. Gerou:

- `analises/cpv-por-regiao/cpv-real-por-regiao-2026.csv`
- `analises/cpv-por-regiao/cpv-real-por-regiao-2026.md`

### ⚠️ Validação dos CSVs gerados

O script leu o arquivo `investimento-por-regiao-meta.csv`, que já existia com valores de investimento por região. Os cálculos de CPV, ROAS e ROAS CAIXA estão aritmeticamente corretos.

**Atenção:** o arquivo `investimento-por-regiao-meta.csv` contém valores que parecem ser um mock/exemplo (números redondos: 95.000, 32.000, 28.000 etc.). Antes de usar os resultados para decisões de negócio, é necessário substituir esse CSV pelos dados reais do backfill da Meta.

**Recomendação:** adicionar um aviso no relatório markdown quando o investimento vier de um mock. O script já faz isso (`usou_mock`), mas o CSV atual não foi identificado como mock pelo script porque o arquivo existia previamente.

---

## 6. Documentação

### 🔴 Documentação não atualizada

O plano aprovado previa atualização de:

- `docs/meta-ads/README.md`
- `docs/ARQUITETURA.md`

**Nenhuma das duas foi atualizada** para refletir a nova funcionalidade de breakdown por região. `docs/ARQUITETURA.md` menciona breakdowns horários futuros, mas não a extração por região.

**Recomendação:** criar seção em `docs/meta-ads/README.md` explicando:

- Como chamar `sync-meta-ads` e `sync-meta-ads-backfill` com `breakdowns`.
- Como funciona a agregação segura.
- Como mapear novas regiões.
- Limitações metodológicas (investimento por exibição, não por endereço do comprador).

---

## 7. Lista de problemas encontrados

| # | Severidade | Arquivo/Local | Problema | Impacto |
|---|---|---|---|---|
| 1 | 🔴 Alta | `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql` — função `processar_meta_ads_raw_breakdown` | A função de breakdown não preenche `actions`, `conversions`, `conversion_values`, `cost_per_action_type`, `video_metrics`, rankings, `frequency`, `ctr`, `cpc`, `cpm`, `cpp` na tabela principal. Ao rodar o backfill, esses campos podem ficar vazios ou desatualizados. | Regressão silenciosa em dashboards/relatórios que consomem `meta_ads_insights`. |
| 2 | 🟡 Média | `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql` — `processar_meta_ads_raw` | Recria a função padrão com micro-divergência: atualiza `account_id` no `DO UPDATE`, enquanto a migration `20260409` não atualiza. | Violação do princípio de não alterar comportamento do sync padrão. |
| 3 | 🟡 Média | `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql` — `meta_ads_region_mapping` | Seed usa nomes acentuados. A Meta pode retornar nomes sem acento ou em outro idioma. | Regiões não mapeadas dificultam a análise e exigem trabalho manual pós-backfill. |
| 4 | 🟡 Média | `supabase/functions/sync-meta-ads/index.ts` linha 228 | Se `breakdowns` for `[]`, a Meta recebe `breakdowns=` (string vazia). | Pode causar erro na Meta ou comportamento inesperado. |
| 5 | 🟡 Média | `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql` — `processar_meta_ads_raw_breakdown` | Nome da função é genérico (`breakdown`), mas só suporta `region`. | Pode induzir a erro futuro se alguém usar com outros breakdowns. |
| 6 | 🟡 Média | `docs/meta-ads/README.md` e `docs/ARQUITETURA.md` | Documentação não foi atualizada conforme plano. | Dificulta manutenção e onboarding. |
| 7 | 🟢 Baixa | `analises/cpv-por-regiao/investimento-por-regiao-meta.csv` | Valores parecem ser mock (números redondos). | Risco de tomar decisões com dados não reais. |
| 8 | 🟢 Baixa | `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql` — `processar_meta_ads_raw_breakdown` | Usa `MIN()` para nomes de campanha/adset/ad. | Pode escolher nome errado se houver renomeação no dia. |
| 9 | 🟢 Baixa | `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql` | `breakdown_type` permite `NULL`. | Queries futuras precisam tratar registros antigos. |

---

## 8. Recomendações de correção

### Correções obrigatórias antes do deploy

1. **Preservar campos calculados/JSONB na função `processar_meta_ads_raw_breakdown`.**
   - Opção A: Preencher `actions` agregado (soma dos JSONB de actions por região) e preservar os demais campos existentes.
   - Opção B: Usar `COALESCE(EXCLUDED.campo, meta_ads_insights.campo)` no `DO UPDATE` para não apagar dados já existentes do sync padrão.

2. **Corrigir envio de `breakdowns` vazio na `sync-meta-ads`.**
   - Alterar a condição para `params.breakdowns && params.breakdowns.length > 0`.

3. **Manter fidelidade da função `processar_meta_ads_raw`.**
   - Remover `account_id = EXCLUDED.account_id` do `DO UPDATE` ou justificar explicitamente por que essa mudança é necessária.

### Correções recomendadas

4. **Criar script de diagnóstico pós-backfill** para listar regiões retornadas pela Meta que não estão no `meta_ads_region_mapping`.

5. **Renomear ou documentar** `processar_meta_ads_raw_breakdown` para deixar claro que só suporta `region`.

6. **Atualizar documentação** `docs/meta-ads/README.md` e `docs/ARQUITETURA.md`.

7. **Adicionar teste local simples** para validar que `SUM(spend)` dos breakdowns iguala `spend` da `meta_ads_insights` para uma data de exemplo.

---

## 9. Checklist final de validação para rodar na Meta

Antes de executar o backfill real, garantir:

- [ ] Migration aplicada em ambiente de staging/teste.
- [ ] `sync-meta-ads` sem body executa com sucesso e não insere breakdowns.
- [ ] `sync-meta-ads` com `{"breakdowns":["country","region"],"time_range":{"since":"2026-06-01","until":"2026-06-01"}}` executa com sucesso e insere breakdowns.
- [ ] Para uma data, `SUM(spend)` dos breakdowns do tipo `'region'` é igual ao `spend` da linha correspondente em `meta_ads_insights`.
- [ ] Reexecutar a mesma data não duplica registros em `meta_ads_insights_breakdowns`.
- [ ] Campos `actions`, `conversions`, `video_metrics`, `frequency`, `ctr`, `cpc`, `cpm`, `cpp` e rankings não são perdidos após o backfill por região.
- [ ] Todos os nomes de região retornados pela Meta estão mapeados ou registrados para mapeamento manual.
- [ ] `meta_ads_sync_log` continua registrando execuções normais sem erro.
- [ ] Dry run do backfill retorna número esperado de dias (~231 de nov/2025 a jun/2026).
- [ ] Backfill piloto de 5 dias conclui com sucesso.
- [ ] Query de CPV/ROAS por região retorna valores coerentes.
- [ ] Documentação atualizada.
- [ ] Rollback testado: reverte migration e Edge Functions; sync padrão continua funcionando.

---

## 10. Resumo executivo para não-técnicos

A implementação está **caminhando bem**, mas **ainda não está pronta para produção** sem ajustes.

O ponto mais importante: a nova função que processa dados por região está **apagando ou deixando de lado várias informações úteis** que hoje existem na tabela principal de investimento (como vídeos, conversões e rankings). Se rodarmos o backfill por região agora, podemos **estragar relatórios que já funcionam**.

Além disso, há pequenos ajustes de consistência (como um campo `account_id` sendo atualizado sem necessidade) e a documentação ainda não foi atualizada.

**Minha recomendação:** corrigir os itens 1, 2 e 4 da lista de problemas antes de qualquer deploy. Os demais podem ser tratados em seguida, mas não podem ser ignorados.
