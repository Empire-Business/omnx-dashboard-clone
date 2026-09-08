# Validação de Relatórios Semanais

Scripts para validar a integridade dos snapshots semanais (`weekly_*`) contra os dados reais do banco de dados.

## Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `validar-snapshots.sql` | Queries SQL idempotentes (apenas SELECT) que comparam snapshot vs real para cada módulo e tipo (produtividade / cohort). |
| `validar-cron.js` | Script Node.js que automatiza a validação chamando a edge function `compute-weekly-reports` (dry-run) e comparando com os dados do banco. Gera relatório Markdown. |

## Pré-requisitos

- Node.js 18+
- Pacote `@supabase/supabase-js` instalado no projeto (já existe em `node_modules` na raiz)
- Variáveis de ambiente:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

## Uso

### 1. Validação SQL (manual)

1. Abra o arquivo `validar-snapshots.sql`.
2. Altere a data no comando:
   ```sql
   SET SESSION "app.week_start" = '2026-05-12';
   ```
3. Execute no SQL Editor do Supabase ou via `psql`.
4. O resultado mostra apenas as divergências (coluna `diff`). Se não retornar nenhuma linha, o snapshot está 100% correto.

> **Segurança:** o script contém apenas `SELECT`s. Nunca executa `INSERT`, `UPDATE` ou `DELETE`.

### 2. Validação automatizada (Node.js)

Execute a partir da raiz do projeto:

```bash
# Validar módulo "trafego" nas últimas 4 semanas (padrão)
node scripts/validacao-relatorios/validar-cron.js

# Validar outro módulo
node scripts/validacao-relatorios/validar-cron.js --module=vendas

# Validar mais semanas
node scripts/validacao-relatorios/validar-cron.js --weeks=8

# Combinado
node scripts/validacao-relatorios/validar-cron.js --module=sdr --weeks=2
```

Módulos suportados: `trafego`, `aquisicao`, `organico`, `prevendas`, `vendas`, `recuperacao`, `sdr`, `closer`, `metas`.

O script gera um arquivo Markdown na pasta `scripts/validacao-relatorios/` com o resultado:
```
validacao-trafego-2026-05-20.md
```

### Como funciona o script JS

1. Calcula as segundas-feiras das últimas N semanas.
2. Para cada semana, executa dois passes:
   - **Produtividade**: eventos que aconteceram na semana.
   - **Cohort**: leads recebidos na semana + métricas cumulativas.
3. Busca o snapshot existente no banco (`weekly_*` + `weekly_snapshots`).
4. Calcula os mesmos valores diretamente das tabelas fonte (`oportunidades`, `vendas_fechamento`, `meta_ads_insights`, `contatos`).
5. Comara e reporta divergências.

## Regras de negócio refletidas

| Conceito | Regra no script |
|----------|-----------------|
| **Produtividade** | Filtro por data do evento (`data_fechado`, `data_conectado`, etc.) entre `week_start` e `week_end`. |
| **Cohort** | Base fixa em `data_lead_recebido` na semana; métricas de funil são cumulativas (qualquer data). |
| **Pipeline padrão** | `pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'` |
| **Recuperação** | `pipeline_id == 'Sn1Guqcm6zwZNTVOOf5L'` |
| **MQL** | Tag `"MQL"` em `contatos.tags` (filtro `ILIKE '%MQL%'`). |
| **Faturamento** | Soma de `vendas_fechamento.valor_faturado` das oportunidades fechadas na semana (produtividade) ou da base cohort. |
| **Caixa** | `vendas_fechamento.valor_entrada` com `data_pagamento_entrada` na semana (produtividade) ou da base cohort. |
| **Meta Ads** | Soma de `meta_ads_insights` com `date` na semana. |

## Troubleshooting

| Problema | Solução |
|----------|---------|
| `SUPABASE_URL is not defined` | Exporte as variáveis de ambiente antes de rodar o JS. |
| Snapshot não encontrado | A semana ainda não foi processada pelo cron. Valide apenas semanas com `status = 'completed'` em `weekly_snapshots`. |
| Divergências em derivadas (taxa_*, cpmql, roas) | Verifique se os valores base (leads, mqls, spend) também divergem. As derivadas são recalculadas a partir dos bases. |
| Edge function retorna erro | Verifique se a função `compute-weekly-reports` está deployada e acessível. |
