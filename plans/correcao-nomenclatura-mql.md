# Plano de Correção: Nomenclatura de MQL e Documentação

> **Data:** 27/02/2026
> **Status:** Pendente de Aprovação
> **Prioridade:** Alta

---

## 🔍 Problema Identificado

### Sintoma
Consulta de MQLs retornou **726 registros** em Fevereiro/2026, quando o esperado era **menos de 200**.

### Causa Raiz
O campo `data_mql_lead_recebido` está **mal nomeado**. Apesar do nome conter "MQL", ele armazena apenas a **data de criação da oportunidade**, não a data em que o lead se tornou um MQL.

**Evidência no Document_GHL.md (linha 66):**
> `{{opportunity.mqlleads_recebidos}}` → indica o momento que a oportunidade foi criada

### Confusão Gerada
O prefixo "MQL" nos campos do GHL (como `mqlleads_recebidos`, `mqlcontato1`, etc.) é apenas uma **convenção de nomenclatura**, não uma classificação do lead. Isso confunde IAs e desenvolvedores.

---

## 📊 Definição de MQL no Sistema

### O que é um MQL?

**MQL (Marketing Qualified Lead)** = Lead que está no pipeline **"Pré-Vendas MQL"**.

### Classificação por Pipeline

| Pipeline | Classificação | Descrição |
|----------|---------------|-----------|
| **Pré-Vendas MQL** | ✅ MQL | Lead qualificado pelo marketing |
| **Pré-Vendas nMQL** | ❌ nMQL | Lead ainda não qualificado |
| **[fn] webinário** | ⚠️ Inbound | Lead de webinar (ainda não classificado) |
| **Social Selling** | ⚠️ Social | Lead de social selling |
| **Vendas SQL** | ✅ SQL | Sales Qualified Lead |
| **Recuperação** | 🔄 Recuperação | Lead em recuperação |

### Query Correta para MQLs

```sql
-- MQLs de Fevereiro/2026 (CORRETO)
SELECT COUNT(*) as mqls_fevereiro_2026
FROM oportunidades
WHERE data_lead_recebido >= '2026-02-01'::timestamptz
  AND data_lead_recebido < '2026-03-01'::timestamptz
  AND pipeline_name = 'Pré-Vendas MQL';
-- Resultado: 55 MQLs
```

---

## 🛠️ Mudanças Necessárias

### 1. Migration: Renomear Todas as Colunas

**Total: 20 colunas a renomear**

#### Colunas de Pré-Venda (prefixo "mql" → remover ou simplificar)

| Nome Antigo | Nome Novo | Descrição |
|-------------|-----------|-----------|
| `data_mql_lead_recebido` | `data_lead_recebido` | Data de criação da oportunidade |
| `data_mql_contato_1..8` | `data_tentativa_1..8` | Tentativas de contato (8 colunas) |
| `data_mql_conectado` | `data_conectado` | Conseguiu falar com o lead |
| `data_mql_no_show` | `data_no_show` | Lead não compareceu |
| `data_mql_perdido` | `data_perdido` | Perdido na pré-venda |
| `data_mql_qualificado` | `data_qualificado` | Lead foi qualificado |
| `data_mql_reuniao_marcada` | `data_reuniao_marcada` | Reunião foi agendada |

#### Colunas de Vendas (prefixo "sql" → simplificar)

| Nome Antigo | Nome Novo | Descrição |
|-------------|-----------|-----------|
| `data_sql_no_show` | `data_no_show_pos_qualificacao` | No show pós qualificação |
| `data_sql_perdido` | `data_perdido_pos_qualificacao` | Perdido pós qualificação |
| `data_sql_reuniao_agendada` | `data_reuniao_agendada` | Reunião agendada (vendas) |
| `data_sql_reuniao_realizada` | `data_reuniao_realizada` | Reunião realizada |
| `data_sql_negociacao` | `data_negociacao` | Entrou em negociação |
| `data_sql_fechada` | `data_fechado` | Venda fechada |

```sql
-- Migration: 20260227100000_rename_oportunidades_columns.sql

-- Pré-Venda: remover prefixo "mql_"
ALTER TABLE oportunidades RENAME COLUMN data_mql_lead_recebido TO data_lead_recebido;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_1 TO data_tentativa_1;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_2 TO data_tentativa_2;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_3 TO data_tentativa_3;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_4 TO data_tentativa_4;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_5 TO data_tentativa_5;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_6 TO data_tentativa_6;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_7 TO data_tentativa_7;
ALTER TABLE oportunidades RENAME COLUMN data_mql_contato_8 TO data_tentativa_8;
ALTER TABLE oportunidades RENAME COLUMN data_mql_conectado TO data_conectado;
ALTER TABLE oportunidades RENAME COLUMN data_mql_no_show TO data_no_show;
ALTER TABLE oportunidades RENAME COLUMN data_mql_perdido TO data_perdido;
ALTER TABLE oportunidades RENAME COLUMN data_mql_qualificado TO data_qualificado;
ALTER TABLE oportunidades RENAME COLUMN data_mql_reuniao_marcada TO data_reuniao_marcada;

-- Vendas: simplificar prefixo "sql_"
ALTER TABLE oportunidades RENAME COLUMN data_sql_no_show TO data_no_show_pos_qualificacao;
ALTER TABLE oportunidades RENAME COLUMN data_sql_perdido TO data_perdido_pos_qualificacao;
ALTER TABLE oportunidades RENAME COLUMN data_sql_reuniao_agendada TO data_reuniao_agendada;
ALTER TABLE oportunidades RENAME COLUMN data_sql_reuniao_realizada TO data_reuniao_realizada;
ALTER TABLE oportunidades RENAME COLUMN data_sql_negociacao TO data_negociacao;
ALTER TABLE oportunidades RENAME COLUMN data_sql_fechada TO data_fechado;

-- Comentários explicativos
COMMENT ON COLUMN oportunidades.data_lead_recebido IS
'Data de criação da oportunidade. Para filtrar MQLs use: pipeline_name = ''Pré-Vendas MQL''';

COMMENT ON COLUMN oportunidades.data_tentativa_1 IS
'Data da 1ª tentativa de contato (SDR)';

COMMENT ON COLUMN oportunidades.data_conectado IS
'Data em que conseguiu falar com o lead';

COMMENT ON COLUMN oportunidades.data_qualificado IS
'Data em que o lead foi qualificado (virou SQL)';

COMMENT ON COLUMN oportunidades.data_fechado IS
'Data em que a venda foi fechada';
```

### 2. Atualizar Trigger

A função `update_oportunidade_from_webhook()` precisa ser atualizada para usar o novo nome da coluna.

### 3. Atualizar Documentação

#### 3.1 AI-INSTRUCTIONS.md

Adicionar seção destacada:

```markdown
## ⚠️ DEFINIÇÃO DE MQL

### O que é MQL?
**MQL = Lead no pipeline "Pré-Vendas MQL"**

### NÃO use o prefixo dos campos como classificação
Os campos com prefixo "mql" (como `data_mql_contato_1`) são apenas nomes de campos do GHL, não indicam que o lead é MQL.

### Query para MQLs
```sql
SELECT COUNT(*) FROM oportunidades
WHERE pipeline_name = 'Pré-Vendas MQL'
  AND data_lead_recebido >= '2026-02-01';
```
```

#### 3.2 TABELAS-SISTEMA.md

Atualizar descrição da coluna:

```markdown
| Coluna | Descrição |
|--------|-----------|
| `data_lead_recebido` | **Data de criação da oportunidade** (não indica MQL) |
```

#### 3.3 Document_GHL.md

Atualizar descrição do campo:

```markdown
{{opportunity.mqlleads_recebidos}} → Data de criação da oportunidade (nome confuso, mas é apenas data de criação)
```

---

## 📋 Checklist de Execução

- [ ] Criar migration para renomear coluna
- [ ] Atualizar trigger `update_oportunidade_from_webhook()`
- [ ] Atualizar AI-INSTRUCTIONS.md com seção de definição de MQL
- [ ] Atualizar TABELAS-SISTEMA.md
- [ ] Atualizar Document_GHL.md
- [ ] Verificar se há views ou functions que referenciam o nome antigo
- [ ] Comunicar time sobre a mudança

---

## 🔢 Números Corretos (Fevereiro/2026)

| Métrica | Valor | Query |
|---------|-------|-------|
| **Total de Leads** | 726 | `WHERE data_lead_recebido >= '2026-02-01'` |
| **MQLs** | 55 | `+ AND pipeline_name = 'Pré-Vendas MQL'` |
| **nMQLs** | 248 | `+ AND pipeline_name = 'Pré-Vendas nMQL'` |
| **Webinar** | 290 | `+ AND pipeline_name = '[fn] webinário'` |
| **Social Selling** | 44 | `+ AND pipeline_name = 'Social Selling'` |

---

## ⚠️ Impacto em Código Existente

### Arquivos que referenciam `data_mql_lead_recebido` (61 ocorrências):

#### 📁 Migrations SQL (CRÍTICO - Executar primeiro)
| Arquivo | Ocorrências | Ação |
|---------|-------------|------|
| `supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql` | 4 | Atualizar trigger |
| `supabase/migrations/20260226300100_update_extrair_dados_ghl_oportunidades.sql` | 5 | Atualizar function |
| `supabase/migrations/20260226400200_backfill_oportunidades_com_fallbacks.sql` | 2 | Atualizar backfill |
| `supabase/migrations/20260226300200_backfill_oportunidades.sql` | 1 | Atualizar backfill |

#### 📁 Diagnósticos SQL
| Arquivo | Ocorrências | Ação |
|---------|-------------|------|
| `supabase/diagnosticos/verificar-extracao-oportunidades.sql` | 3 | Atualizar queries |
| `supabase/diagnosticos/contar-mqls-mes-atual.sql` | 5 | Atualizar queries |

#### 📁 Documentação (Atualizar após migration)
| Arquivo | Ocorrências | Prioridade |
|---------|-------------|------------|
| `docs/AI-INSTRUCTIONS.md` | 5 | 🔴 Alta |
| `docs/DATA-MODEL-GUIA-IA.md` | 15 | 🔴 Alta |
| `docs/TABELAS-SISTEMA.md` | 2 | 🔴 Alta |
| `docs/ANALISE-COHORT-VS-PRODUTIVIDADE.md` | 10 | 🟡 Média |
| `docs/ARQUITETURA.md` | 1 | 🟡 Média |
| `docs/webhooks-ghl/SOLUCAO-COLUNAS-NAO-POPULADAS.md` | 4 | 🟢 Baixa |
| `docs/webhooks-ghl/DECISOES/20260226-correcao-extracao-com-fallbacks.md` | 2 | 🟢 Baixa |
| `docs/webhooks-ghl/DECISOES/20250219-implementacao-document-ghl-completa.md` | 1 | 🟢 Baixa |

#### 📁 Plans (Referência histórica)
| Arquivo | Ocorrências | Ação |
|---------|-------------|------|
| `plans/migracao-completa-extracao-oportunidades.md` | 2 | Manter como histórico |
| `plans/corrigir-extracao-oportunidades-completo.md` | 4 | Manter como histórico |
| `plans/corrigir-extracao-oportunidades-completa.md` | 2 | Manter como histórico |

#### 📁 Outros
| Arquivo | Ocorrências | Ação |
|---------|-------------|------|
| `supabase/migrations/README-CORRECAO-OPORTUNIDADES.md` | 3 | Atualizar |

---

## 🎯 Próximos Passos Detalhados

### Fase 1: Banco de Dados (Modo Code)

1. **Criar migration para renomear coluna:**
   ```sql
   -- supabase/migrations/20260227100000_rename_data_mql_lead_recebido.sql
   ALTER TABLE oportunidades
   RENAME COLUMN data_mql_lead_recebido TO data_lead_recebido;
   
   COMMENT ON COLUMN oportunidades.data_lead_recebido IS
   'Data de criação da oportunidade no GHL. NÃO indica classificação MQL.
   Para filtrar MQLs, use: pipeline_name = ''Pré-Vendas MQL''';
   ```

2. **Atualizar trigger existente:**
   - Arquivo: `supabase/migrations/20260226400100_fix_extrair_dados_ghl_com_fallbacks.sql`
   - Substituir todas as referências de `data_mql_lead_recebido` para `data_lead_recebido`

3. **Atualizar functions de backfill:**
   - Arquivos em `supabase/miigrations/` que referenciam o campo

### Fase 2: Documentação (Modo Architect/Code)

1. **AI-INSTRUCTIONS.md** - Adicionar seção destacada:
   ```markdown
   ## ⚠️ DEFINIÇÃO DE MQL - LEIA ISTO PRIMEIRO!
   
   ### O que é MQL?
   **MQL = Lead no pipeline "Pré-Vendas MQL"**
   
   ### NÃO confunda!
   - O campo `data_lead_recebido` é apenas a data de criação da oportunidade
   - O prefixo "mql" nos campos do GHL é apenas nomenclatura, não classificação
   - Para filtrar MQLs, SEMPRE use: `WHERE pipeline_name = 'Pré-Vendas MQL'`
   
   ### Classificação de Leads por Pipeline
   | Pipeline | Classificação |
   |----------|---------------|
   | Pré-Vendas MQL | ✅ MQL |
   | Pré-Vendas nMQL | ❌ nMQL (não qualificado) |
   | [fn] webinário | 🎯 Inbound |
   | Social Selling | 📱 Social |
   | Vendas SQL | 💰 SQL |
   ```

2. **TABELAS-SISTEMA.md** - Atualizar descrição da coluna

3. **DATA-MODEL-GUIA-IA.md** - Atualizar todas as referências

4. **ANALISE-COHORT-VS-PRODUTIVIDADE.md** - Atualizar exemplos de query

### Fase 3: Verificação

1. **Testar queries principais:**
   ```sql
   -- Verificar MQLs de Fevereiro/2026
   SELECT COUNT(*) FROM oportunidades
   WHERE data_lead_recebido >= '2026-02-01'
     AND data_lead_recebido < '2026-03-01'
     AND pipeline_name = 'Pré-Vendas MQL';
   -- Esperado: ~55
   ```

2. **Verificar se frontend não quebrou**

---

## 📝 Resumo para Aprovação

| Item | Ação | Impacto |
|------|------|---------|
| Renomear coluna | `data_mql_lead_recebido` → `data_lead_recebido` | Baixo (nome mais claro) |
| Atualizar trigger | Substituir referências | Nenhum (mesma lógica) |
| Atualizar docs | 6 arquivos principais | Positivo (menos confusão) |
| Definição de MQL | Documentar claramente | Alto (evita erros futuros) |

**Risco geral:** BAIXO - Apenas renomeação e documentação
