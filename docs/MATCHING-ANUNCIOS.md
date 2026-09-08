# Matching de Anúncios: utm_term → Nomes Descritivos

> **Versão:** 1.0
> **Última Atualização:** 2026-03-23
> **Público:** Desenvolvedores, Analytics, BI

---

## 🎯 Problema

Quando um lead clica em um anúncio e chega ao sistema, o banco de dados registra:

```sql
SELECT utm_term FROM contatos WHERE id = 'abc123'
-- Resultado: M1_O1_P29_CR-248_PG12
```

Esse código é **estruturado mas incompreensível** em relatórios sem contexto:
- Para humanos: "M1_O1_P29_CR-248_PG12" é apenas um código
- Para análise: Precisamos do nome descritivo do criativo
- Para auditoria: Rastrear qual criativo gerou quantos leads

**Resultado desejado:**
```
M1_O1_P29_CR-248_PG12 → "(Pedro e Breno) Personagem Breno e P..."
```

---

## 📐 Estrutura do utm_term

O código segue um padrão estruturado:

```
M[MÊS]_O[OBJETIVO]_P[PÁGINA]_CR-[CRIATIVO]_PG[PÚBLICO]

M  = Mês (1-12)
O  = Objetivo (1=Conversão, 2=Engajamento, etc.)
P  = Página/Campanha (1-99)
CR = Criativo (número único em notion_creatives.external_id)
PG = Público/Ad Group (grupo de segmentação)

Exemplos reais:
- M1_O1_P29_CR-248_PG12    (Janeiro, Objetivo 1, Página 29, Criativo 248, Público 12)
- M2_O1_P26_CR-567_PG24    (Fevereiro, Objetivo 1, Página 26, Criativo 567, Público 24)
```

**A chave:** O `CR-XXX` é sempre o identificador único do criativo!

---

## 🔗 Tabelas Envolvidas

### 1. `contatos` (Source)
```sql
CREATE TABLE contatos (
  id UUID PRIMARY KEY,
  utm_term TEXT,        -- O código estruturado (ex: M1_O1_P29_CR-248_PG12)
  date_created TIMESTAMPTZ,
  ...
);
```

### 2. `notion_creatives` (Lookup)
```sql
CREATE TABLE notion_creatives (
  id UUID PRIMARY KEY,
  external_id TEXT UNIQUE,  -- Chave: "CR-248", "CR-567", etc.
  name TEXT,                -- Nome legível: "(Pedro e Breno) Personagem Breno e P..."
  database_type TEXT CHECK (database_type IN ('paid', 'organic')),
  ...
);

-- Índice para busca rápida
CREATE INDEX idx_notion_creatives_external_id ON notion_creatives(external_id);
```

### 3. `ads_catalog` (Opcional, mas incompleto)
```sql
CREATE TABLE ads_catalog (
  id UUID PRIMARY KEY,
  utm_term TEXT,         -- Código completo (ex: M1_O1_P29_CR-248_PG12)
  creative_id TEXT,      -- FK: "CR-248"
  objective_code TEXT,   -- "O1", "O2", etc.
  ...
);
-- NOTA: Em produção, muitos utm_term=NULL (tabela incompleta)
```

---

## ⚙️ Algoritmo de Matching

### Passo 1: Extrair creative_id do utm_term

```typescript
const extractCreativeId = (utm_term: string): string | null => {
  const match = utm_term.match(/CR-(\d+)/)  // Regex para capturar CR-XXX
  return match ? `CR-${match[1]}` : null
}

// Exemplos:
extractCreativeId('M1_O1_P29_CR-248_PG12')    // → "CR-248"
extractCreativeId('M2_O1_P26_CR-567_PG24')    // → "CR-567"
extractCreativeId('00 - MixEnvolvimento')     // → null (não segue padrão)
```

### Passo 2: Buscar em notion_creatives

```sql
SELECT name FROM notion_creatives
WHERE external_id = 'CR-248'
-- Resultado: "(Pedro e Breno) Personagem Breno e P..."
```

### Passo 3: Retornar com fallback

```typescript
const creativeName = creative_id
  ? creativeMap.get(creative_id)           // Busca em mapa (mais rápido)
  : null

// Exibição final:
const displayName = creativeName
  ? `${utf_term} - ${creativeName}`
  : `${utf_term} (sem nome catalogado)`
```

---

## 💻 Implementação Prática

### Hook Exemplo: useTrafego.ts

```typescript
// 1. Fetch contatos (com paginação para evitar limite de 1000)
let allContacts = []
let page = 0
while (true) {
  const { data } = await supabase
    .from('contatos')
    .select('utm_term')
    .not('utm_term', 'is', null)
    .gte('date_created', startDate)
    .lte('date_created', endDate)
    .order('id')
    .range(page * 1000, (page + 1) * 1000 - 1)

  allContacts = allContacts.concat(data || [])
  if (!data || data.length < 1000) break
  page++
}

// 2. Fetch notion_creatives (pode ser feito uma vez no início)
const { data: creatives } = await supabase
  .from('notion_creatives')
  .select('external_id, name, database_type')
  .eq('database_type', 'paid')
  .limit(1000)

// 3. Build creative map (Map é O(1) lookup)
const creativeMap = new Map<string, string>()
;(creatives || []).forEach((c) => {
  if (c.external_id && c.name) {
    creativeMap.set(c.external_id, c.name)
  }
})

// 4. Count leads by utm_term com nomes
const adCounts: Record<string, {
  count: number
  creative_id?: string
  creative_name?: string
}> = {}

allContacts.forEach((row) => {
  if (row.utm_term) {
    if (!adCounts[row.utm_term]) {
      const creativeId = extractCreativeId(row.utm_term)
      const creativeName = creativeId ? creativeMap.get(creativeId) : null
      adCounts[row.utm_term] = {
        count: 0,
        creative_id: creativeId,
        creative_name: creativeName
      }
    }
    adCounts[row.utm_term].count += 1
  }
})

// 5. Sort e retornar
const sorted = Object.entries(adCounts)
  .sort((a, b) => b[1].count - a[1].count)
  .map(([code, info]) => ({
    utm_term: code,
    creative_id: info.creative_id,
    creative_name: info.creative_name,
    lead_count: info.count,
    display_name: info.creative_name
      ? `${code} - ${info.creative_name}`
      : `${code} (sem nome)`
  }))
```

---

## 📊 Métricas de Cobertura

### Fevereiro 2026

```
Total de leads com utm_term:      972
Total de anúncios distintos:       37
Anúncios com nome catalogado:      35  (94.6%)
Anúncios sem nome:                  2  (5.4%)
```

**Anúncios sem nome catalogado:**
- `00 - MixEnvolvimento Acelerador` — manual, fora do padrão `CR-XXX` (7 leads)
- Outro code desconhecido (data não disponível para análise)

---

## 🎯 Top 10 Anúncios (Fevereiro 2026)

| Rank | utm_term | Criativo | Leads |
|------|----------|----------|-------|
| 1 | M1_O1_P29_CR-248_PG12 | (Pedro e Breno) Personagem Breno... | 184 |
| 2 | M1_O1_P29_CR-2_PG12 | [TR] (Davi) | 178 |
| 3 | M2_O1_P26_CR-567_PG24 | Se você não gosta de pular carnaval | 141 |
| 4 | M1_O1_P29_CR-324_PG12 | [TR] (Davi) Compilado: Esse é... | 98 |
| 5 | M1_O1_P29_CR-408_PG12 | [TR] (Pedro) Perfil do Thiago... | 74 |
| 6 | M1_O1_P28_CR-248_PG12 | (Pedro e Breno) Personagem Breno... | 47 |
| 7 | M1_O1_P28_CR-2_PG12 | [TR] (Davi) | 38 |
| 8 | M2_O1_P32_CR-570_PG24 | 1 milhão de pessoas | 38 |
| 9 | M1_O1_P30_CR-2_PG12 | [TR] (Davi) | 34 |
| 10 | M1_O1_P28_CR-269_PG12 | [TR] (Pedro) Perfil do Otávio... | 24 |

---

## ✅ Checklist de Implementação

Ao usar este padrão em novo código/hook:

- [ ] **Paginação:** Query contatos com `.range()` para evitar limite 1000 PostgREST
- [ ] **Caching:** Carregar `notion_creatives` uma única vez (começo do hook)
- [ ] **Map:** Usar `Map<string, string>` para lookup O(1)
- [ ] **Regex:** Testar `extractCreativeId()` com diversos códigos (com/sem padrão)
- [ ] **Fallback:** Exibir "(sem nome catalogado)" se `creative_id` não encontrado
- [ ] **Truncamento:** Limitar nomes longos em UI com `.substring(0, N)`
- [ ] **Auditoria:** Logar criativos não encontrados para sync manual

---

## 🔗 Referências

- `docs/ARQUITETURA.md` — Seção "🎯 Matching de Anúncios"
- `docs/CORRELACAO-META-CRM.md` — Seções 3-5 (estrutura e normalização)
- `docs/TABELAS-SISTEMA.md` — Tabela "notion_creatives"
- Script benchmark: `eb-dash2/query_top_ads_v3.ts`

---

## 📝 Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | 2026-03-23 | Documento inicial, algoritmo, implementação, cobertura Fevereiro 2026 |
