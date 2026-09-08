# Troubleshooting: Funil [cp] form-fb não aparece no filtro

**Data:** 2026-05-08  
**Módulo:** Aquisição / Orgânico (filtro Funil)

---

## Como o filtro de Funil funciona

1. O dropdown mostra entradas de `funnels.nome` (filtradas por `workspace_id`)
2. Quando o usuário filtra por "X", o hook encontra todos os `utm_campaigns` cujo campo `funnels` JSONB contém "X"
3. Leads cujo `contatos.utm_campaign` aponta para uma dessas campanhas são incluídos

---

## Diagnóstico — execute no Supabase SQL Editor

### Passo 1: Verificar se o funil existe na tabela `funnels`

```sql
SELECT id, nome, workspace_id
FROM funnels
WHERE nome ILIKE '%form-fb%' OR nome ILIKE '%cp%form%';
```

→ Se não retornar nada, o funil não existe. Ver **Fix A**.

### Passo 2: Verificar campanhas mapeadas para este funil

```sql
SELECT utm_campaign, nome, funnels
FROM utm_campaigns
WHERE funnels::text ILIKE '%form-fb%'
   OR nome ILIKE '%form-fb%';
```

→ Se não retornar nada, as campanhas não estão mapeadas. Ver **Fix B**.

### Passo 3: Identificar os utm_campaign codes dos leads form-fb

```sql
SELECT DISTINCT
  c.utm_campaign,
  c.contact_source,
  c.utm_source,
  COUNT(*) AS leads
FROM contatos c
WHERE c.contact_source = 'form-fb'
   OR c.utm_source ILIKE '%form-fb%'
GROUP BY c.utm_campaign, c.contact_source, c.utm_source
ORDER BY leads DESC
LIMIT 20;
```

→ Anote os `utm_campaign` codes para usar nos fixes.

---

## Fixes

### Fix A — Criar o funil (se não existir)

```sql
-- Substituir <workspace-id> pelo ID do workspace real
INSERT INTO funnels (nome, workspace_id, created_at, updated_at)
VALUES ('[cp] form-fb', '<workspace-id>', NOW(), NOW())
ON CONFLICT DO NOTHING;
```

### Fix B — Mapear campanhas ao funil

```sql
-- Substituir (123, 456) pelos utm_campaign codes encontrados no Passo 3
UPDATE utm_campaigns
SET funnels = COALESCE(funnels, '[]'::jsonb) || '["[cp] form-fb"]'::jsonb
WHERE utm_campaign::TEXT IN ('123', '456')  -- códigos dos utm_campaigns de form-fb
  AND NOT (COALESCE(funnels, '[]'::jsonb) @> '["[cp] form-fb"]'::jsonb);
```

---

## Verificação final

Após aplicar os fixes, recarregue o painel. O funil `[cp] form-fb` deve aparecer no dropdown de Funil da página de Aquisição/Orgânico.

Se ainda não aparecer, verifique:
- O `workspace_id` do registro em `funnels` bate com o da sessão atual
- Os `utm_campaign` codes mapeados realmente existem nos contatos do período filtrado
