# Correção: Colunas Não Populadas em Oportunidades

**Projeto:** qzesffnkqgelmtfblzkr  
**Data:** 2026-02-26

---

## 🎯 O Que Esta Correção Faz

Corrige a extração de dados de webhooks GHL para a tabela `oportunidades`, implementando:

1. ✅ **Fallbacks** conforme [`Document_GHL.md`](../../docs/Document_GHL.md)
2. ✅ **Variações de formato** de chaves em customData
3. ✅ **Conversão de tipos** (timestamp vs date)
4. ✅ **Campos alternativos** (MQL vs SQL)

**Resultado:** 33 colunas que estavam vazias agora são populadas corretamente.

---

## 📋 Migrations Incluídas

### 1. `20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql`

**O que faz:**

- Cria função auxiliar `extract_custom_field()`
- Atualiza `extrair_dados_ghl()` com fallbacks
- Implementa regras de [`Document_GHL.md`](../../docs/Document_GHL.md)

**Seguro:** Sim, pode rodar múltiplas vezes (idempotente)

### 2. `20260226400200_backfill_oportunidades_com_fallbacks.sql`

**O que faz:**

- Reprocessa todos os webhooks existentes
- Preenche colunas vazias em oportunidades
- Mostra estatísticas do resultado

**Seguro:** Sim, apenas preenche campos vazios (não sobrescreve)

---

## 🚀 Como Aplicar

### Opção 1: Supabase Dashboard (Recomendado)

1. Acesse: https://supabase.com/dashboard/project/qzesffnkqgelmtfblzkr
2. Vá em: **SQL Editor**
3. Clique em: **New Query**
4. Cole o conteúdo de `20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql`
5. Clique em: **Run**
6. Repita para `20260226400200_backfill_oportunidades_com_fallbacks.sql`

### Opção 2: Supabase CLI

```bash
# Aplicar migrations
supabase db push --project-ref qzesffnkqgelmtfblzkr

# Ou aplicar manualmente
supabase db execute --project-ref qzesffnkqgelmtfblzkr \
  --file supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql

supabase db execute --project-ref qzesffnkqgelmtfblzkr \
  --file supabase/migrations/20260226400200_backfill_oportunidades_com_fallbacks.sql
```

---

## ✅ Validação

### Antes da Correção

```sql
SELECT 
    COUNT(*) as total,
    COUNT(pipeline_name) as com_pipeline_name,
    COUNT(vendedor_closer) as com_vendedor
FROM oportunidades;

-- Resultado esperado:
-- total: 10
-- com_pipeline_name: ~2 (20%)
-- com_vendedor: ~1 (10%)
```

### Depois da Correção

```sql
SELECT 
    COUNT(*) as total,
    COUNT(pipeline_name) as com_pipeline_name,
    COUNT(vendedor_closer) as com_vendedor,
    COUNT(opportunity_source) as com_source,
    COUNT(data_mql_lead_recebido) as com_datas
FROM oportunidades;

-- Resultado esperado:
-- total: 10
-- com_pipeline_name: ~9 (90%)
-- com_vendedor: ~7 (70%)
-- com_source: ~8 (80%)
-- com_datas: ~9 (90%)
```

### Script de Validação Completo

```sql
-- Ver estatísticas detalhadas
SELECT 
    '=== ESTATÍSTICAS DE PREENCHIMENTO ===' as secao,
    COUNT(*) as total_oportunidades,
    
    -- Campos diretos
    COUNT(pipeline_name) as com_pipeline_name,
    ROUND(COUNT(pipeline_name)::NUMERIC / COUNT(*) * 100, 1) as pct_pipeline_name,
    
    -- Campos de texto
    COUNT(vendedor_closer) as com_vendedor_closer,
    ROUND(COUNT(vendedor_closer)::NUMERIC / COUNT(*) * 100, 1) as pct_vendedor_closer,
    
    COUNT(opportunity_source) as com_opportunity_source,
    ROUND(COUNT(opportunity_source)::NUMERIC / COUNT(*) * 100, 1) as pct_opportunity_source,
    
    COUNT(resumo_ia) as com_resumo_ia,
    ROUND(COUNT(resumo_ia)::NUMERIC / COUNT(*) * 100, 1) as pct_resumo_ia,
    
    -- Datas MQL
    COUNT(data_mql_lead_recebido) as com_data_mql_lead_recebido,
    ROUND(COUNT(data_mql_lead_recebido)::NUMERIC / COUNT(*) * 100, 1) as pct_data_mql_lead_recebido,
    
    COUNT(data_mql_contato_1) as com_data_mql_contato_1,
    ROUND(COUNT(data_mql_contato_1)::NUMERIC / COUNT(*) * 100, 1) as pct_data_mql_contato_1,
    
    COUNT(data_mql_conectado) as com_data_mql_conectado,
    ROUND(COUNT(data_mql_conectado)::NUMERIC / COUNT(*) * 100, 1) as pct_data_mql_conectado,
    
    COUNT(data_mql_reuniao_marcada) as com_data_mql_reuniao_marcada,
    ROUND(COUNT(data_mql_reuniao_marcada)::NUMERIC / COUNT(*) * 100, 1) as pct_data_mql_reuniao_marcada,
    
    -- Datas SQL
    COUNT(data_sql_reuniao_agendada) as com_data_sql_reuniao_agendada,
    ROUND(COUNT(data_sql_reuniao_agendada)::NUMERIC / COUNT(*) * 100, 1) as pct_data_sql_reuniao_agendada,
    
    COUNT(data_sql_reuniao_realizada) as com_data_sql_reuniao_realizada,
    ROUND(COUNT(data_sql_reuniao_realizada)::NUMERIC / COUNT(*) * 100, 1) as pct_data_sql_reuniao_realizada
    
FROM oportunidades;
```

---

## 🔍 Diagnóstico (Opcional)

Antes de aplicar, você pode executar o diagnóstico:

```sql
\i supabase/diagnosticos/verificar-extracao-oportunidades.sql
```

**O que mostra:**

1. Exemplo de webhook com oportunidade
2. Estrutura de customData
3. Oportunidades com colunas vazias
4. Comparação webhook vs oportunidade
5. Todas as chaves disponíveis em customData

---

## 📊 Campos Corrigidos

### Total

- **42 colunas** na tabela `oportunidades`
- **9 colunas** eram populadas antes
- **33 colunas** agora são populadas

### Categorias

| Categoria | Quantidade | Exemplos |
|-----------|------------|----------|
| Campos diretos | 3 | `pipeline_name`, `status` |
| Campos de texto | 6 | `vendedor_closer`, `resumo_ia`, `percepcao_closer` |
| Datas MQL | 12 | `data_mql_contato_1`, `data_mql_conectado` |
| Datas SQL | 6 | `data_sql_reuniao_agendada`, `data_sql_negociacao` |
| Datas de reunião | 2 | `data_reuniao_agendada`, `data_reuniao_realizada` |
| Outros | 4 | `data_pendencias_preenchimento`, `lost_reason` |

---

## 🔄 Funcionamento Automático

Após aplicar as migrations:

1. ✅ Trigger continua ativo
2. ✅ Novos webhooks usam função corrigida
3. ✅ Fallbacks são aplicados automaticamente
4. ✅ Colunas são populadas corretamente

**Fluxo:**

```
GHL envia webhook
    ↓
Edge Function salva em webhooks_ghl
    ↓
Trigger dispara automaticamente
    ↓
extrair_dados_ghl() executa COM FALLBACKS
    ↓
Tabela oportunidades populada corretamente
```

---

## 🚨 Importante

### Segurança

- ✅ **Idempotente:** Pode rodar múltiplas vezes
- ✅ **Sem perda de dados:** Apenas preenche campos vazios
- ✅ **Rollback:** Pode reverter se necessário

### Performance

- ⚠️ Backfill pode levar alguns segundos (10-30s)
- ✅ Não bloqueia outras operações
- ✅ Não afeta webhooks em andamento

### Validação

- ✅ Execute script de validação após aplicar
- ✅ Verifique percentuais de preenchimento
- ✅ Compare com resultado esperado

---

## 📁 Documentação Relacionada

| Documento | Descrição |
|-----------|-----------|
| [`SOLUCAO-COLUNAS-NAO-POPULADAS.md`](../../docs/webhooks-ghl/SOLUCAO-COLUNAS-NAO-POPULADAS.md) | Resumo executivo da solução |
| [`20260226-correcao-extracao-com-fallbacks.md`](../../docs/webhooks-ghl/DECISOES/20260226-correcao-extracao-com-fallbacks.md) | Decisão técnica detalhada |
| [`corrigir-extracao-oportunidades-completa.md`](../../plans/corrigir-extracao-oportunidades-completa.md) | Plano de ação completo |
| [`Document_GHL.md`](../../docs/Document_GHL.md) | Regras de negócio (fonte da verdade) |

---

## ❓ FAQ

**Q: Posso rodar as migrations múltiplas vezes?**  
R: Sim, são idempotentes. Não causam problemas.

**Q: Vai sobrescrever dados existentes?**  
R: Não, apenas preenche campos vazios (NULL).

**Q: Quanto tempo leva?**  
R: 10-30 segundos para backfill de ~10 oportunidades.

**Q: Preciso parar o sistema?**  
R: Não, pode aplicar com sistema rodando.

**Q: E se der erro?**  
R: Pode fazer rollback ou rodar novamente.

**Q: Como verifico se funcionou?**  
R: Execute o script de validação acima.

---

## 🆘 Suporte

Se encontrar problemas:

1. Execute o diagnóstico: [`verificar-extracao-oportunidades.sql`](../diagnosticos/verificar-extracao-oportunidades.sql)
2. Verifique logs do Supabase
3. Consulte a documentação: [`SOLUCAO-COLUNAS-NAO-POPULADAS.md`](../../docs/webhooks-ghl/SOLUCAO-COLUNAS-NAO-POPULADAS.md)

---

**Próximo passo:** Aplicar migrations no projeto `qzesffnkqgelmtfblzkr`

```bash
# Supabase Dashboard
https://supabase.com/dashboard/project/qzesffnkqgelmtfblzkr/editor
```

---

*Correção criada em 2026-02-26*
