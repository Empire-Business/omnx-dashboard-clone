# Solução: Problema de Timezone no `date_created`

## Problema Identificado

O campo `date_created` está armazenado em UTC no Supabase, mas ao visualizar os dados:
- **GHL mostra:** 20/02/2026 (timezone America/Sao_Paulo)
- **Supabase mostra:** 21/02/2026 (quando visto em UTC)

**Causa raiz:** O GHL envia `2026-02-21T00:04:11.514Z` (meia-noite UTC), que convertido para São Paulo (UTC-3) vira `2026-02-2021:04:11`.

---

## Soluções Propostas

### Opção 1: Conversão no Frontend (Recomendada) ✅

**Vantagem:** Mantém o banco consistente (sempre UTC) e converte apenas na exibição.

**Implementação:**

```typescript
// eb-dash/lib/utils/dates.ts
export function formatDateTimeToBrazil(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDateToBrazil(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', { 
    timeZone: 'America/Sao_Paulo'
  });
}
```

---

### Opção 2: Conversão via SQL View

**Vantagem:** Já retorna os dados prontos para o frontend.

**Implementação:**

```sql
CREATE VIEW contatos_br AS
SELECT 
    id,
    nome,
    email,
    date_created AT TIME ZONE 'America/Sao_Paulo' as date_created_br,
    updated_at AT TIME ZONE 'America/Sao_Paulo' as updated_at_br
FROM contatos;
```

---

### Opção 3: Coluna Computada no Banco

**Vantagem:** Transparente para queries.

**Implementação:**

```sql
ALTER TABLE contatos 
ADD COLUMN date_created_br timestamptz 
GENERATED ALWAYS AS (date_created AT TIME ZONE 'America/Sao_Paulo') STORED;
```

---

## Comparativo

| Opção | Complexidade | Performance | Flexibilidade | Armazenamento |
|-------|--------------|-------------|---------------|---------------|
| **1 - Frontend** | Baixa | Melhor | Alta | Sem impacto |
| **2 - SQL View** | Média | Boa | Média | Sem impacto |
| **3 - Coluna Gerada** | Alta | Boa | Baixa | Usa mais espaço |

---

## Recomendação

**Opção 1 (Frontend)** é a mais indicada porque:

1. **Padrão da indústria** - UTC no banco, conversão na view
2. **Flexível** - Cada usuário pode ver no seu timezone
3. **Sem alteração de schema** - Não mexe na estrutura do banco
4. **Manutenção simples** - Lógica centralizada em um utilitário

---

## Próximos Passos

1. Criar arquivo `eb-dash/lib/utils/dates.ts` com funções de conversão
2. Atualizar componentes que exibem datas para usar as novas funções
3. Documentar o padrão em `docs/DATA-MODEL-GUIA-IA.md`
