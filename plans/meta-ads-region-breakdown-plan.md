# Plano de Implementação: Extração de Investimento por Região (Meta Ads)

> **Branch:** `feat/meta-ads-region-breakdown`  
> **Projeto:** GHL-SUPABASE (React + TypeScript + Supabase + Vercel)  
> **Objetivo:** Obter dados históricos de investimento da Meta Ads por **região** (estado) desde nov/2025, cruzar com vendas do CRM e calcular CPV, ROAS e ROAS CAIXA reais por região.  
> **Restrição crítica:** NÃO quebrar o sync atual de Meta Ads.

---

## 1. Resumo executivo (versão para quem não é técnico)

Hoje o sistema baixa da Meta, a cada hora, o total gasto por anúncio/dia. O que não temos é o **detalhamento geográfico** desse gasto: quanto foi investido em São Paulo, Minas, Rio Grande do Sul etc.

A Meta permite pedir esse detalhamento por meio de um parâmetro chamado `breakdowns` (quebra por dimensão). Quando pedimos `breakdowns=region`, a API devolve várias linhas para o mesmo anúncio/dia — uma para cada estado/região. Isso é ótimo para análise, mas exige cuidado: se jogarmos essas linhas diretamente na tabela principal `meta_ads_insights`, vamos sobrescrever o total do dia várias vezes e corromper os números.

O plano abaixo propõe:

1. Reaproveitar a Edge Function existente `sync-meta-ads`, adicionando um parâmetro opcional de breakdown por região.  
   - Se não passar o parâmetro, tudo continua exatamente como está (sem risco para o sync de hora em hora).
2. Criar uma nova função no banco para processar dados com breakdown, agregando corretamente os totais na tabela principal e guardando os detalhes por região na tabela filha `meta_ads_insights_breakdowns`.
3. Usar a Edge Function de backfill `sync-meta-ads-backfill` para extrair dia a dia, desde nov/2025, com controle de progresso e sem duplicar registros.
4. Mapear os nomes de região da Meta para UF e região brasileira, cruzando com as vendas do CRM (`vendas_fechamento` / `contatos.estado_uf`).

---

## 2. Análise de impacto

### Arquivos que vão mudar

| Arquivo | O que muda | Por quê |
|---|---|---|
| `supabase/functions/sync-meta-ads/index.ts` | Adicionar suporte opcional a `breakdowns` no body; incluir `country` e `region` nos campos solicitados; escolher a função de processamento correta no banco. | Permite fazer o sync normal (sem breakdown) e o sync por região usando o mesmo código, sem duplicar lógica. |
| `supabase/functions/sync-meta-ads-backfill/index.ts` | Adicionar suporte opcional a `breakdowns`; repassar para a requisição e para os parâmetros salvos. | É a ferramenta certa para o backfill histórico dia a dia. |
| `supabase/migrations/20260618XXXXXX_meta_ads_region_breakdown.sql` | Nova função `processar_meta_ads_raw_breakdown`, nova coluna `breakdown_type`, tabela de mapeamento `meta_ads_region_mapping`, índices e grants. | Processa múltiplas linhas por anúncio/dia de forma segura, mapeia nomes da Meta para UF/região e garante performance. |
| `docs/meta-ads/README.md` | Atualizar documentação da integração. | Manter documentação sincronizada (regra do `CLAUDE.md`). |
| `docs/ARQUITETURA.md` | Adicionar seção sobre breakdown por região. | Registrar decisão arquitetural e novo fluxo de dados. |
| `plans/meta-ads-region-breakdown-plan.md` | Este documento. | Rastreabilidade do planejamento. |

### Arquivos que NÃO vão mudar

- `supabase/migrations/20260409120000_fix_processar_meta_ads_raw_update_names.sql`  
  Não será alterado. A função `processar_meta_ads_raw` continuará existindo e servindo o sync padrão.
- Tabelas de CRM (`contatos`, `oportunidades`, `vendas_fechamento`, etc.)  
  Não sofrerão alterações de schema; apenas serão consultadas.

---

## 3. Decisão arquitetural: modificar `sync-meta-ads` ou criar uma nova Edge Function?

**Decisão:** Modificar a Edge Function existente `sync-meta-ads` de forma **retrocompatível**, e também atualizar a `sync-meta-ads-backfill`.

### Justificativa

| Opção | Prós | Contras |
|---|---|---|
| **A) Modificar `sync-meta-ads`** | Código único de autenticação, paginação, rate limit e salvamento de raw; menos manutenção; parâmetro opcional preserva comportamento atual. | Exige cuidado para não afetar o sync de hora em hora. |
| **B) Criar Edge Function separada** | Zero risco de tocar no sync atual. | Duplicação de código (autenticação, paginação, salvamento de raw); com o tempo as duas funções podem divergir e gerar bugs silenciosos. |

A opção A é mais sustentável. Para mitigar o risco, vamos **isolar o processamento** no banco:

- Quando **não houver** `breakdowns`, chama a função `processar_meta_ads_raw` exatamente como hoje.
- Quando **houver** `breakdowns`, chama uma **nova** função `processar_meta_ads_raw_breakdown`, responsável por agregar os totais e inserir as linhas de detalhe.

Assim, o caminho feliz do sync de hora em hora não passa por nenhuma lógica nova.

---

## 4. Decisão sobre banco: o que muda na RPC?

### Por que não basta adicionar `region` na condição atual?

A RPC `processar_meta_ads_raw` hoje insere um registro na tabela `meta_ads_insights` para cada linha da Meta, e só insere na tabela de breakdowns se houver `age`, `gender` ou `publisher_platform`.

Se simplesmente adicionássemos `OR v_insight->>'region' IS NOT NULL`, teríamos um problema grave: a API, com `breakdowns=region`, devolve **uma linha por estado** para o mesmo anúncio e dia. Cada inserção na `meta_ads_insights` daria `ON CONFLICT (ad_id, date)` e sobrescreveria o total com os valores de apenas um estado. No final, a tabela principal teria o gasto de apenas a última região, não o total do dia.

### Solução correta

**Não alterar o comportamento principal da `processar_meta_ads_raw`.** Em vez disso, criar uma nova função:

```sql
processar_meta_ads_raw_breakdown(p_raw_id UUID) RETURNS JSONB
```

Essa função fará:

1. **Agregar os totais por `(ad_id, date)`** a partir de todas as linhas do raw:
   - Soma: `spend`, `impressions`, `clicks`, `reach`
   - Soma também as colunas de action types (`landing_page_views`, `video_views`, `link_clicks`, `leads`, `onsite_web_leads`, `fb_pixel_leads`)
   - Insere/atualiza **uma única linha** na `meta_ads_insights` por `(ad_id, date)`.

2. **Inserir as linhas de breakdown** na `meta_ads_insights_breakdowns`, uma para cada região, vinculadas ao `insights_id` da linha agregada.

3. **Garantir idempotência:** antes de inserir os breakdowns, apaga os breakdowns anteriores do mesmo tipo para o mesmo `insights_id`. Assim, se rodarmos o backfill duas vezes para o mesmo dia, não duplicamos.

### Alterações no schema

- Adicionar coluna `breakdown_type TEXT` em `meta_ads_insights_breakdowns`.
  - Exemplos de valores: `'region'`, `'age_gender'`, `'publisher_platform'`.
  - Permite apagar só os breakdowns do mesmo tipo na reexecução.

- Criar tabela de mapeamento:

```sql
CREATE TABLE meta_ads_region_mapping (
    region_name TEXT PRIMARY KEY,  -- nome exato devolvido pela Meta
    uf TEXT NOT NULL,              -- sigla do estado (SP, MG, etc.)
    regiao TEXT NOT NULL           -- Sudeste, Sul, Nordeste, etc.
);
```

- Adicionar índices:

```sql
CREATE INDEX idx_meta_ads_breakdowns_region ON meta_ads_insights_breakdowns(region);
CREATE INDEX idx_meta_ads_breakdowns_country ON meta_ads_insights_breakdowns(country);
CREATE INDEX idx_meta_ads_breakdowns_type ON meta_ads_insights_breakdowns(breakdown_type);
```

### Segurança adicional

Adicionar no início da `processar_meta_ads_raw` uma guarda:

```sql
IF (v_raw.params->'breakdowns') IS NOT NULL AND jsonb_array_length(v_raw.params->'breakdowns') > 0 THEN
    RAISE EXCEPTION 'Raw com breakdowns deve ser processado por processar_meta_ads_raw_breakdown';
END IF;
```

Isso evita que alguém chame a função errada por acidente e corrompa os dados.

---

## 5. Estratégia de backfill (nov/2025 até hoje)

### Ferramenta

Usar a Edge Function `sync-meta-ads-backfill`, com um novo parâmetro opcional:

```json
{
  "data_inicio": "2025-11-01",
  "data_fim": "2026-06-18",
  "breakdowns": ["country", "region"],
  "max_dias": 30
}
```

### Passo a passo

1. **Dry run primeiro:**
   ```bash
   curl -X POST .../sync-meta-ads-backfill \
     -d '{"data_inicio":"2025-11-01","data_fim":"2026-06-18","breakdowns":["country","region"],"dry_run":true}'
   ```
   - Verificar quantos dias serão processados (~231 dias).

2. **Rodar em lotes pequenos:**
   - Usar `max_dias: 30` por vez.
   - A função já respeita 1 chamada a cada 5 segundos entre dias.
   - Com breakdown por região, o número de páginas por dia pode aumentar; a paginação automática continua funcionando.

3. **Reprocessar erros:**
   - A tabela `meta_ads_backfill_log` marca dias com erro.
   - Basta atualizar o status para `pending` e chamar a função novamente com o mesmo `controle_id`.

### Como evitar duplicatas

- **Tabela principal (`meta_ads_insights`):** a constraint `UNIQUE(ad_id, date)` faz upsert. O total agregado das regiões deve ser igual ao total antigo (se existir). Se for diferente, investigar antes de prosseguir.
- **Tabela de breakdowns:** a nova função apaga os breakdowns do tipo `'region'` do `insights_id` antes de inserir novamente.

### Como não sobrescrever insights atuais de forma errada

- O sync de hora em hora **não usa breakdown**. Ele continua usando `processar_meta_ads_raw`.
- O backfill por região roda sobre datas passadas e atualiza os totais para a soma real por região.
- Antes de rodar o backfill completo, comparar o total do primeiro lote com os dados já existentes para validar que a soma das regiões bate com o total anterior.

---

## 6. Estratégia de análise: cruzar Meta × CRM

### Origem dos dados

- **Investimento por região:** `meta_ads_insights_breakdowns`
  - `region`: nome da região devolvido pela Meta (ex: "São Paulo")
  - `spend`: investimento naquela região
  - `insights_id` → `meta_ads_insights.date`

- **Vendas por região:** `vendas_fechamento` + `contatos`
  - `estado_uf` do contratante (ou, em falta, inferir pelo DDD do telefone)
  - `valor_faturado` e `valor_entrada`
  - `data_pagamento_entrada` para definir o período
  - Filtrar vendas de tráfego pago pela `utm_source` (whitelist da tabela `utm_sources`)

### Mapeamento de região

Criar view ou função que:

1. Pega o nome da região da Meta (`meta_ads_insights_breakdowns.region`).
2. Busca na `meta_ads_region_mapping` a UF e a região brasileira.
3. Se não encontrar, marca como `"Indefinido"` e gera um alerta/log para mapeamento manual.

### Exemplo de query de análise

```sql
WITH investimento_por_regiao AS (
  SELECT
    COALESCE(mrm.regiao, 'Indefinido') AS regiao,
    DATE_TRUNC('month', mi.date) AS mes,
    SUM(mib.spend) AS investimento
  FROM meta_ads_insights_breakdowns mib
  JOIN meta_ads_insights mi ON mi.id = mib.insights_id
  LEFT JOIN meta_ads_region_mapping mrm ON mrm.region_name = mib.region
  WHERE mib.breakdown_type = 'region'
  GROUP BY 1, 2
),
vendas_por_regiao AS (
  SELECT
    COALESCE(
      CASE LEFT(c.estado_uf, 2)
        WHEN 'SP' THEN 'Sudeste'
        WHEN 'MG' THEN 'Sudeste'
        WHEN 'RJ' THEN 'Sudeste'
        WHEN 'ES' THEN 'Sudeste'
        WHEN 'PR' THEN 'Sul'
        WHEN 'RS' THEN 'Sul'
        WHEN 'SC' THEN 'Sul'
        WHEN 'DF' THEN 'Centro-Oeste'
        WHEN 'GO' THEN 'Centro-Oeste'
        WHEN 'MT' THEN 'Centro-Oeste'
        WHEN 'MS' THEN 'Centro-Oeste'
        ELSE 'Indefinido'
      END,
      'Indefinido'
    ) AS regiao,
    DATE_TRUNC('month', vf.data_pagamento_entrada) AS mes,
    COUNT(*) AS vendas,
    SUM(vf.valor_faturado) AS faturamento,
    SUM(vf.valor_entrada) AS caixa
  FROM vendas_fechamento vf
  JOIN contatos c ON c.id = vf.contato_id
  JOIN oportunidades o ON o.id = vf.oportunidade_id
  WHERE c.utm_source IN (SELECT utm_source FROM utm_sources)
    AND vf.data_pagamento_entrada IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  COALESCE(i.regiao, v.regiao) AS regiao,
  COALESCE(i.mes, v.mes) AS mes,
  i.investimento,
  v.vendas,
  v.faturamento,
  v.caixa,
  CASE WHEN v.vendas > 0 THEN i.investimento / v.vendas END AS cpv,
  CASE WHEN i.investimento > 0 THEN v.faturamento / i.investimento END AS roas,
  CASE WHEN i.investimento > 0 THEN v.caixa / i.investimento END AS roas_caixa
FROM investimento_por_regiao i
FULL OUTER JOIN vendas_por_regiao v
  ON v.regiao = i.regiao AND v.mes = i.mes
ORDER BY mes, regiao;
```

> **Nota:** A query acima é um exemplo. A implementação final pode criar uma view (`v_meta_ads_cpv_por_regiao`) para facilitar o consumo pelo frontend.

### Limitações importantes

- O investimento da Meta é por **localização de exibição do anúncio**, não necessariamente por onde o comprador mora. É uma aproximação.
- Vendas sem `estado_uf` e sem DDD mapeável ficarão como `"Indefinido"`.
- Vendas de fontes não pagas devem ser excluídas da comparação.

---

## 7. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Corromper totais da `meta_ads_insights` ao inserir múltiplas linhas de região | Alto se feito errado | Alto | Usar função separada `processar_meta_ads_raw_breakdown` que agrega antes de inserir na tabela principal. |
| Quebrar o sync de hora em hora | Baixo se isolado | Alto | `breakdowns` é opcional; o cron continua chamando sem o parâmetro. Testar em staging antes de mergear. |
| Rate limit da Meta API | Médio | Médio | Manter 1 chamada a cada 5 segundos no backfill; rodar em lotes de 30 dias; monitorar `meta_ads_backfill_log`. |
| Nomes de região da Meta não mapeados para UF | Médio | Médio | Criar `meta_ads_region_mapping` com seed inicial; gerar alerta para nomes não mapeados; revisar manualmente após primeiro lote. |
| Aumento de volume de dados | Médio | Baixo/Médio | ~27 estados × anúncios/dia. Adicionar índices em `region`, `country`, `breakdown_type`. Monitorar espaço e performance. |
| Divergência entre total agregado por região e total anterior | Médio | Médio | Validar lote piloto comparando `SUM(spend)` dos breakdowns com `meta_ads_insights.spend` para as mesmas datas. |
| Duplicar breakdowns em reexecuções | Baixo se idempotente | Médio | Apagar breakdowns anteriores do mesmo tipo antes de inserir. |
| `region` breakdown não disponível com `level=ad` ou campos solicitados | Baixo | Alto | Testar no Graph API Explorer antes da implementação. Se houver restrição, ajustar `level` ou combinação de breakdowns. |

---

## 8. Checklist de validação (QA)

### Antes de ir para produção

- [ ] Nova migration aplicada em ambiente de teste/sem impacto no sync padrão.
- [ ] Edge Function `sync-meta-ads` deployada na branch; chamada **sem body** retorna sucesso e não insere breakdowns.
- [ ] Chamada com body `{"breakdowns":["country","region"],"time_range":{"since":"2026-06-01","until":"2026-06-01"}}` retorna sucesso e insere breakdowns.
- [ ] Para uma mesma data, `SUM(spend)` dos breakdowns do tipo `'region'` é igual ao `spend` da linha correspondente em `meta_ads_insights`.
- [ ] Reexecutar a mesma data não duplica registros em `meta_ads_insights_breakdowns`.
- [ ] Todos os nomes de região retornados pela Meta estão mapeados em `meta_ads_region_mapping` ou foram registrados como `"Indefinido"` para tratamento.
- [ ] `meta_ads_sync_log` continua registrando execuções normais sem erro.
- [ ] Backfill dry run para nov/2025 até hoje retorna número esperado de dias (~231).
- [ ] Backfill piloto de 5 dias conclui com sucesso; progresso refletido em `meta_ads_backfill_controle`.
- [ ] Query de CPV/ROAS por região retorna valores coerentes com a análise manual baseada em `exports/comprantes-2026.csv`.
- [ ] Documentação `docs/meta-ads/README.md` e `docs/ARQUITETURA.md` atualizadas.
- [ ] Rollback testado: reverte a migration e a Edge Function; sync padrão continua funcionando.

### Após deploy em produção

- [ ] Acompanhar as próximas 3 execuções automáticas do `sync-meta-ads-hourly` (cron).
- [ ] Verificar se o backfill histórico completo terminou sem dias com erro.
- [ ] Validar totais de investimento no dashboard de Tráfego antes e depois do backfill.
- [ ] Revisar logs de regiões não mapeadas e atualizar `meta_ads_region_mapping` se necessário.

---

## 9. Próximos passos sugeridos (ordem de execução)

1. Criar a migration com a nova função, coluna `breakdown_type`, tabela de mapeamento e índices.
2. Atualizar `supabase/functions/sync-meta-ads/index.ts` para suportar `breakdowns` e escolher a função de processamento correta.
3. Atualizar `supabase/functions/sync-meta-ads-backfill/index.ts` para suportar `breakdowns`.
4. Fazer testes locais/staging com 1 dia de exemplo.
5. Executar dry run do backfill completo.
6. Executar backfill em lotes de 30 dias.
7. Preencher `meta_ads_region_mapping` com os nomes reais devolvidos pela Meta.
8. Criar view/função de análise `v_meta_ads_cpv_por_regiao`.
9. Atualizar documentação.
10. Mergear para `main` via PR com commits Conventional Commits.

---

## 10. Notas de governança

- **Commits:** seguir Conventional Commits. Exemplos:
  - `feat(meta-ads): adiciona suporte a breakdown por região na sync`
  - `feat(meta-ads): cria processador de breakdowns com agregação segura`
  - `feat(meta-ads): adiciona mapeamento de região Meta para UF/região`
  - `docs(meta-ads): documenta extração de investimento por região`

- **Segurança:** nenhum token ou secret será commitado. As variáveis de ambiente (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `SUPABASE_SERVICE_ROLE_KEY`) continuam apenas no Supabase/Vercel.

- **LGPD / Privacidade:** os dados de região são agregados e anônimos (não identificam pessoas). Não há alteração no tratamento de dados pessoais.
