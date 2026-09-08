# MQL Classification: Tag-Based System

> **Date:** 2026-03-17
> **Status:** ✅ Implementation Complete
> **Issue:** MQL was using pipeline name instead of tags, resulting in missed MQLs

---

## Problem

The system was **incorrectly classifying MQL** based on pipeline name:
```typescript
// WRONG: checks pipeline, not tags
const mql = lead.pipeline_name === 'Pré-Vendas MQL'
```

This missed **24+ leads** who had the TAG "MQL" but were in other pipelines (SQL, nMQL, etc.).

---

## Solution: Tag-Based Detection

MQL is now determined by checking the `tags` field in the `contatos` table:

```typescript
function isMqlByTag(contato: ContatoRow | null | undefined): boolean {
  if (!contato?.tags) return false
  const tags = parseTags(contato.tags)
  return tags.some((t) => t.toLowerCase() === 'mql')
}
```

**Key rule:** A lead with TAG "MQL" is always MQL, regardless of current pipeline.

---

## Data Model

### contatos.tags (TEXT, comma-separated)

Example values:
- `"mql"`
- `"mql,sql"`
- `"mql,sql,[fn] webinar"`
- `"nmql"`
- `"sql,[cp] facebook"`

### Tag Parsing

Use the existing `parseTags()` helper from `useTrafego.ts`:

```typescript
export function parseTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {}
    return raw.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return []
}
```

---

## Migration Guide for Developers

### 1. Where MQL filtering happens (5 locations)

| File | Function | Old Code | New Code |
|------|----------|----------|----------|
| `useTrafego.ts` | `applyMqlFilter()` | `.pipeline_name === 'Pré-Vendas MQL'` | Use `isMqlByTag()` |
| `useTrafego.ts` | `computeFunnel()` | `.pipeline_name === 'Pré-Vendas MQL'` | Use `isMqlByTag()` |
| `useTrafego.ts` | `computeSmallCards()` | `.pipeline_name === 'Pré-Vendas MQL'` | Use `isMqlByTag()` |
| `useTrafego.ts` | `computeCostPerMqlSeries()` | `.pipeline_name === 'Pré-Vendas MQL'` | Use `isMqlByTag()` |
| `useCohort.ts` | `Step 2: Build cohort matrix` | `.pipeline_name === 'Pré-Vendas MQL'` | Use `isMqlByTag()` |

### 2. Queries must include `contatos(tags)`

When fetching `oportunidades`, always include the tags field:

```typescript
.select('*, contatos(nome, email, tags, owner_name, ...')
```

### 3. AlertasCard: Filter by tags instead of pipeline

Old code filtered by pipeline names. New code should validate against tags if needed.

---

## Testing Checklist

### 1. Find test cases

**Test Case 1:** Lead with TAG "MQL" but in pipeline "Pré-Vendas nMQL"
- Should appear in MQL counts ✓

**Test Case 2:** Lead in pipeline "Pré-Vendas MQL" but WITHOUT TAG "MQL"
- Should NOT appear in MQL counts ✓

**Test Case 3:** Lead with TAG "MQL" and TAG "SQL"
- Should appear in MQL counts ✓

### 2. Verify counts

- Dashboard MQL count should match **gabarito expectations**
- Run manual verification:
  ```sql
  SELECT COUNT(*) FROM oportunidades o
  WHERE o.contatos.tags LIKE '%mql%'
  ```

### 3. Check edge cases

- **NULL tags:** Should be treated as no tags
- **Empty tags:** Should be treated as no tags
- **Case sensitivity:** "MQL", "mql", "Mql" should all match
- **Tag aliases:** Only "mql" is recognized (not "MQ", "SQL", etc.)

---

## Implementation Details

### Helper Function Location

```typescript
// eb-dash2/src/hooks/useTrafego.ts (line ~190-210)

export function isMqlByTag(contato: ContatoRow | null | undefined): boolean {
  if (!contato?.tags) return false
  const tags = parseTags(contato.tags)
  return tags.some((t) => t.toLowerCase() === 'mql')
}
```

### Filter Functions Updated

1. **`applyMqlFilter(opps, mqlFilter)`** — line 648
   ```typescript
   if (mqlFilter === 'mql')
     return opps.filter((o) => isMqlByTag(o.contatos))
   ```

2. **`computeFunnel(opps)`** — line 656
   ```typescript
   { key: 'mql', label: 'MQLs', count: opps.filter((o) => isMqlByTag(o.contatos)).length }
   ```

3. **`computeSmallCards(opps)`** — line 666
   ```typescript
   mqls: opps.filter((o) => isMqlByTag(o.contatos))
   ```

4. **`computeCostPerMqlSeries(opps, metaRows, startDate, endDate)`** — line 827
   ```typescript
   if (isMqlByTag(o.contatos) && o.data_lead_recebido) {
     // count as MQL...
   }
   ```

5. **`useCohort.ts` — line 90**
   ```typescript
   const mqls = cohortOpps.filter((o) => isMqlByTag(o.contatos)).length
   ```

---

## Tags Reference

### GHL Tag Mapping

| Tag | Meaning |
|-----|---------|
| `mql` | Marketing Qualified Lead |
| `nmql` | Non-Marketing Qualified |
| `sql` | Sales Qualified Lead |
| `[fn] webinar` | Funnel: Webinar |
| `[fn] leads_fb` | Funnel: Facebook Leads |
| `[cp] facebook` | Campaign: Facebook |

See: [`docs/TAGS-GHL.md`](TAGS-GHL.md)

---

## Common Mistakes ❌

```typescript
// ❌ WRONG: Only checks current pipeline
opps.filter(o => o.pipeline_name === 'Pré-Vendas MQL')

// ❌ WRONG: String contains check (case-sensitive)
opps.filter(o => o.contatos?.tags?.includes('mql'))

// ❌ WRONG: Checks if tags field exists (not if MQL tag exists)
opps.filter(o => !!o.contatos?.tags)

// ✅ CORRECT: Use isMqlByTag helper
opps.filter(o => isMqlByTag(o.contatos))
```

---

## Verification

To verify the fix is working:

```sql
-- Should return leads with MQL tag
SELECT COUNT(*) FROM oportunidades o
LEFT JOIN contatos c ON o.contato_id = c.id
WHERE c.tags ILIKE '%mql%';

-- Compare with old pipeline-based count
SELECT COUNT(*) FROM oportunidades
WHERE pipeline_name = 'Pré-Vendas MQL';

-- Difference = number of missed MQLs (should be 24+)
```

---

## Rollback Plan

If needed, the old pipeline-based logic is still available in git history (commit before this change). Tag-based filtering is purely additive and doesn't affect the data model.
