# Regras de Extração de Dados - Webhooks GHL

> ⚠️ **DOCUMENTO OBRIGATÓRIO**  
> Nenhuma extração de dados de webhooks GHL pode ser implementada sem seguir estas regras.

---

## 🚫 PROIBIÇÕES

### 1. Proibido Criar Tabela sem Documentação

```
❌ NÃO FAZER:
   - "Vou criar uma tabela contacts porque vi que tem no webhook"
   - "Vou extrair o email direto sem mapear"
   - "Depois eu documento, vou só testar"

✅ FAZER:
   - Documentar primeiro em MAPEAMENTO-CAMPOS.md
   - Registrar decisão em DECISOES/
   - Revisar com arquiteto
   - Depois implementar
```

### 2. Proibido Extrair Campo sem Contexto

```
❌ NÃO FAZER:
   - Extrair campo porque "parece útil"
   - Copiar estrutura do GHL sem análise
   - Assumir significado de campo

✅ FAZER:
   - Entender o que o campo representa
   - Documentar o propósito
   - Mapear para necessidade de negócio
```

### 3. Proibido Modificar Payload Original

```
❌ NÃO FAZER:
   - Alterar json salvo em webhooks_ghl
   - Deletar webhooks recebidos
   - Processar in-place

✅ FAZER:
   - Manter payload original imutável
   - Criar tabelas derivadas
   - Versionar transformações
```

---

## ✅ REGRAS OBRIGATÓRIAS

### Regra 1: Documentar Antes de Implementar

**Checklist obrigatório antes de criar qualquer tabela:**

```markdown
□ 1. Qual evento GHL? (ex: contact.created)
□ 2. Qual campo do payload?
□ 3. Para qual tabela vai?
□ 4. Qual o propósito de negócio?
□ 5. É único ou pode repetir?
□ 6. Pode ser nulo?
□ 7. Tem relação com outra tabela?
□ 8. Precisa de índice?
□ 9. Quem vai usar esse dado?
□ 10. Qual a frequência de atualização?
```

### Regra 2: Estrutura de Documentação

Toda extração DEVE ter:

```
docs/webhooks-ghl/
├── MAPEAMENTO-CAMPOS.md          # Mapeamento técnico
└── DECISOES/
    └── YYYYMMDD-extracao-[nome].md  # Decisão documentada
```

### Regra 3: Nomenclatura

**Tabelas derivadas de webhooks:**
```
ghl_contacts          ← boa (prefixo ghl_)
contacts              ← ruim (genérico)
webhook_contacts      ← aceitável

ghl_opportunities     ← boa
opportunities         ← ruim
```

**Colunas:**
```
ghl_id               ← ID original do GHL
email                ← campo comum
phone                ← campo comum
custom_field_123     ← campo customizado
```

### Regra 4: Sempre Preservar IDs Originais

```sql
-- OBRIGATÓRIO: Ter coluna com ID original do GHL
CREATE TABLE ghl_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- nosso ID
    ghl_id text UNIQUE NOT NULL,                     -- ID original GHL
    email text,
    ...
);
```

### Regra 5: Versionamento de Campos

Se o GHL mudar a estrutura:

```
1. Não alterar tabela existente imediatamente
2. Documentar mudança em DECISOES/
3. Criar migração versionada
4. Atualizar MAPEAMENTO-CAMPOS.md
5. Testar antes de aplicar
```

---

## 📋 PROCESSO DE APROVAÇÃO

### Fluxo Obrigatório

```
1. IDENTIFICAR
   └─ Ver webhook em webhooks_ghl
   └─ Identificar campo útil

2. DOCUMENTAR
   └─ Preencher MAPEAMENTO-CAMPOS.md
   └─ Criar arquivo em DECISOES/

3. REVISAR
   └─ Revisão de arquiteto
   └─ Aprovação PO/Stakeholder

4. IMPLEMENTAR
   └─ Criar migration
   └─ Criar função de extração
   └─ Testar

5. VALIDAR
   └─ Verificar dados extraídos
   └─ Atualizar documentação
```

---

## 🎯 DECISÕES ARQUITETURAIS

### 1. Imutabilidade

```
webhooks_ghl.payload ← IMUTÁVEL
        ↓
   [função de extração]
        ↓
   tabelas derivadas ← MUTÁVEIS
```

### 2. Extração Lazy

```
NÃO extrair tudo de uma vez
Extrair sob demanda, conforme necessidade de negócio
```

### 3. Rastreabilidade

```
Toda linha extraída deve saber de qual webhook veio:
- webhook_id (referência ao webhook original)
- extracted_at (quando foi extraído)
```

### 4. Idempotência

```
Mesmo webhook processado múltiplas vezes = mesmo resultado
Não criar duplicatas
```

---

## 📁 Template de Decisão

Criar arquivo em `DECISOES/YYYYMMDD-nome.md`:

```markdown
# Decisão: Extração de [Campo/Evento]

**Data:** YYYY-MM-DD  
**Responsável:** Nome  
**Status:** [Proposta/Aprovada/Implementada]

## Contexto
Por que precisamos extrair isso?

## Evento GHL
- Evento: `contact.created`
- Documentação GHL: [link]

## Campos do Payload
```json
{
  "contact": {
    "id": "...",
    "email": "..."
  }
}
```

## Mapeamento Proposto

| Campo GHL | Tabela | Coluna | Tipo | Nullable | Único |
|-----------|--------|--------|------|----------|-------|
| contact.id | ghl_contacts | ghl_id | text | Não | Sim |
| contact.email | ghl_contacts | email | text | Sim | Não |

## Raciocínio
Por que essa estrutura?

## Regras de Negócio
- Quando contact.updated, atualizar email
- Se email null, ignorar

## Aprovações
- [ ] Arquiteto
- [ ] PO
- [ ] Tech Lead

## Implementação
- [ ] Migration criada
- [ ] Função de extração
- [ ] Testes
- [ ] Documentação atualizada
```

---

## 🔍 Checklist de Qualidade

Antes de marcar como "Implementada":

```markdown
□ Documentação completa em DECISOES/
□ MAPEAMENTO-CAMPOS.md atualizado
□ Migration testada
□ Função idempotente
□ Índices necessários criados
□ RLS configurado
□ Testes de integração passando
□ Rollback testado
```

---

## 🚨 Penalidades

Não seguir estas regras resulta em:
- ❌ Código não aprovado em PR
- ❌ Débito técnico documentado
- ❌ Refatoração obrigatória
- ❌ Blocker para próximas sprints

---

## 🔧 Funções Auxiliares de Extração

### `extract_custom_field(custom_data jsonb, field_variations text[])`

**Propósito:** Extrai campo de customData tentando múltiplas variações de chave.

```sql
extract_custom_field(payload->'customData', ARRAY[
    '{{opportunity.campo}}',
    '{{ opportunity.campo }}'
])
```

**Retorno:** Primeiro valor não-nulo encontrado ou NULL.

---

### `parse_date_flexible(date_str text)`

**Propósito:** Converte diferentes formatos de data para TIMESTAMPTZ.

**Formatos suportados:**
- ISO 8601: `"2026-02-19T14:48:00Z"`
- Date ISO: `"2026-02-19"`
- Brasileiro com AM/PM: `"19/2/2026 02:48 PM"`
- Brasileiro 24h: `"19/2/2026 14:48:00"`
- Brasileiro só data: `"19/2/2026"`

**Retorno:** TIMESTAMPTZ ou NULL se não conseguir converter.

Se um novo formato aparecer nos webhooks, adicionar um branch a esta função.

---

## 🔄 Trigger de Atualização Automática

### `trigger_update_oportunidade_from_webhook`

**Evento:** AFTER INSERT ON webhooks_ghl
**Função:** `update_oportunidade_from_webhook()`

**O que faz:**
1. Verifica se webhook tem `opportunity.id`
2. Busca oportunidade correspondente
3. Atualiza campos usando fallbacks
4. Usa COALESCE para não sobrescrever dados existentes com NULL

```sql
CREATE TRIGGER trigger_update_oportunidade_from_webhook
    AFTER INSERT ON webhooks_ghl
    FOR EACH ROW
    EXECUTE FUNCTION update_oportunidade_from_webhook();
```

**Regra de datas (DESATUALIZADA em 2026-03-13):** Veja seção "Regras de Atualização" abaixo para a nova abordagem.

---

## 📝 Regras de Atualização (CRÍTICO — 2026-03-13)

### Problema: COALESCE "Preserva Existente" Era Perigoso

**Bug crítico descoberto em 2026-03-13:**
- 722+ oportunidades tinham datas parseadas errado (MM/DD invertido)
- Exemplo: "12/02/2026" foi parseado para dezembro (12/02) ao invés de fevereiro (02/12)
- **UPDATE de oportunidades usava:** `COALESCE(o.data_conectado, parse_date_flexible(...))`
- Isso significa: "mantém valor existente se tem, preenche se NULL"
- **Resultado:** Datas erradas NUNCA eram corrigidas — persistiam forever em UPDATE posteriores

### Nova Regra: Webhook é Fonte de Verdade

**OBRIGATÓRIO (desde 2026-03-13):**

```sql
-- ❌ ERRADO (antigo):
data_conectado = COALESCE(o.data_conectado, parse_date_flexible(...))
-- Mantém erro se existir ❌

-- ✅ CORRETO (novo):
data_conectado = COALESCE(parse_date_flexible(...), o.data_conectado)
-- Sobrescreve com webhook se veio; mantém se webhook não enviou ✅
```

**Lógica:**
1. Se webhook enviou valor → USE O VALOR DO WEBHOOK
2. Se webhook não enviou (NULL) → MANTÉM O VALOR EXISTENTE
3. Resultado: Erros anteriores podem ser corrigidos em futuras atualizações

### Aplicação em `extrair_dados_ghl()`

**Campos que OBRIGATORIAMENTE usam novo COALESCE:**
```
ATENÇÃO: data_lead_recebido NÃO está nesta lista.
  → Gerenciada exclusivamente pela edge function sync-opp-dates via API GHL.
  → Webhook insere NULL no INSERT e não toca no UPDATE.
  → Ver docs/SYNC-OPP-DATES.md

data_tentativa_1..8
data_no_show
data_conectado
data_perdido
data_qualificado
data_agendamento_reuniao
data_pendencias_preenchimento
data_no_show_vendas
data_perdido_vendas
data_agendamento_vendas
data_realizacao_vendas
data_negociacao
data_fechado
data_reuniao_agendada
data_reuniao_realizada
```

### Validação com `parse_date_flexible`

A função `parse_date_flexible` (criada 2026-03-13) adiciona proteção:

```sql
parse_date_flexible(date_str text) → TIMESTAMPTZ ou NULL

Rejeita:
- Datas < 2020-01-01 (epoch, inválidas)
- Datas > NOW() + 30 dias (futuras, erro de parsing)

Retorna NULL se inválida → COALESCE cai para o.data_existente
```

### Exemplo Prático

**Antes (quebrado):**
```sql
-- Webhook 1 (errado): date_created = "2026-12-02" (MM/DD invertido)
UPDATE oportunidades SET data_conectado = COALESCE(o.data_conectado, 2026-12-02)
-- Banco: data_conectado = 2026-12-02 ❌

-- Webhook 2 (correto): customData.campo_conectado vazio
UPDATE oportunidades SET data_conectado = COALESCE(o.data_conectado, NULL)
-- Banco: data_conectado = 2026-12-02 ❌ (erro congelado!)
```

**Depois (correto):**
```sql
-- Webhook 1: date_created = "2026-12-02"
UPDATE oportunidades SET data_conectado = COALESCE(2026-12-02, o.data_conectado)
-- Banco: data_conectado = 2026-12-02

-- Webhook 2: campo vazio, mas esperamos parse_date_flexible(NULL) = NULL
-- UPDATE oportunidades SET data_conectado = COALESCE(NULL, o.data_conectado)
-- Banco: data_conectado = 2026-12-02 ← mantém (correto!)

-- Webhook 3: campo corrigido, "2026-02-10"
-- UPDATE oportunidades SET data_conectado = COALESCE(2026-02-10, o.data_conectado)
-- Banco: data_conectado = 2026-02-10 ✅ (erro corrigido!)
```

### Backfill de Datas Inválidas

**Migration 20260313300000** removeu todos os valores futuros:
- 722 opp com `data_lead_recebido > NOW()+15d` → **NULL** (removidos)
- 331 opp com `data_conectado > NOW()+15d` → **NULL**
- Etc.

Resultado: Painéis agora mostram dados corretos. Lead danieltiago107@gmail.com restaurado manualmente para fevereiro.

---

## 🚀 Como Implementar Novo Campo

### Passo 1: Documentar

Adicionar em `Document_GHL.md` se for regra de negócio. Preencher checklist de aprovação neste documento.

### Passo 2: Mapear

Adicionar em [`MAPEAMENTO-CAMPOS.md`](MAPEAMENTO-CAMPOS.md) com campo GHL → coluna DB + variações.

### Passo 3: Criar Migration

```sql
-- Adicionar coluna
ALTER TABLE oportunidades ADD COLUMN novo_campo text;

-- Atualizar trigger
CREATE OR REPLACE FUNCTION update_oportunidade_from_webhook()
  -- adicionar extração do novo campo aqui
```

### Passo 4: Fazer Backfill

```sql
UPDATE oportunidades o
SET novo_campo = extract_custom_field(
    w.payload->'customData',
    ARRAY['{{ opportunity.campo }}', '{{opportunity.campo}}']
)
FROM (
    SELECT DISTINCT ON (payload->>'opportunityId')
        payload->>'opportunityId' AS opp_id,
        payload
    FROM webhooks_ghl
    WHERE payload->>'opportunityId' IS NOT NULL
    ORDER BY payload->>'opportunityId', created_at DESC
) w
WHERE o.ghl_opportunity_id = w.opp_id
  AND o.novo_campo IS NULL;
```

### Passo 5: Verificar

```sql
-- Conferir preenchimento
SELECT
  COUNT(*) AS total,
  COUNT(novo_campo) AS preenchidos,
  ROUND(100.0 * COUNT(novo_campo) / COUNT(*), 1) AS pct
FROM oportunidades;
```

---

*Documento vivo - Atualizar conforme necessidade*
*Última atualização: 2026-03-12*
