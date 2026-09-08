# Template: Decisão de Extração de Dados

**Copie este arquivo para criar uma nova decisão:**
```
DECISOES/YYYYMMDD-nome-da-extracao.md
```

---

# Decisão: [Nome da Extração]

**Data:** YYYY-MM-DD  
**Responsável:** @nome  
**Status:** [Proposta / Em Revisão / Aprovada / Implementada / Rejeitada]

---

## 📋 Contexto

### Por que precisamos extrair isso?
[Descrever a necessidade de negócio]

### Quem solicitou?
[Stakeholder / Product Owner / Análise de dados]

### Qual o impacto?
[Alto / Médio / Baixo]

---

## 🔗 Evento GHL

### Evento
- **Nome:** `contact.created`
- **Documentação GHL:** [link]
- **Frequência esperada:** [X vezes/dia]

### Payload Analisado
[Link para EXEMPLOS-PAYLOADS.md ou copiar aqui]

```json
{
  "exemplo": "payload"
}
```

---

## 🗺️ Mapeamento Proposto

### Campos a Extrair

| # | Campo GHL | Tabela | Coluna | Tipo | Nullable | Único | Índice |
|---|-----------|--------|--------|------|----------|-------|--------|
| 1 | `contact.id` | ghl_contacts | ghl_id | text | Não | Sim | ✅ |
| 2 | `contact.email` | ghl_contacts | email | text | Sim | Não | ✅ |
| 3 | `contact.phone` | ghl_contacts | phone | text | Sim | Não | ❌ |

### Tabela Proposta

```sql
CREATE TABLE ghl_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ghl_id text UNIQUE NOT NULL,
    email text,
    phone text,
    -- ...
    webhook_id uuid REFERENCES webhooks_ghl(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);
```

---

## 🧠 Raciocínio

### Por que esta estrutura?
[Explicar decisões de modelagem]

### Alternativas Consideradas
| Alternativa | Prós | Contras | Decisão |
|-------------|------|---------|---------|
| Opção A | ... | ... | ❌ Rejeitada |
| Opção B | ... | ... | ✅ Escolhida |

### Riscos
| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| GHL mudar payload | Média | Alto | Manter json bruto |
| Duplicatas | Baixa | Médio | UNIQUE em ghl_id |

---

## 📏 Regras de Negócio

### Inserção
- Quando criar novo registro?
- Quando ignorar?

### Atualização
- Quando atualizar?
- Qual a fonte da verdade?

### Validação
- Campos obrigatórios?
- Formato esperado?

### Tratamento de Erros
- Se email inválido?
- Se campo ausente?

---

## 👥 Aprovações

| Role | Nome | Status | Data |
|------|------|--------|------|
| Arquiteto | @nome | ⏳ Pendente | - |
| Product Owner | @nome | ⏳ Pendente | - |
| Tech Lead | @nome | ⏳ Pendente | - |

---

## ✅ Implementação

### Checklist
- [ ] Migration criada
- [ ] Função de extração implementada
- [ ] Testes unitários
- [ ] Testes de integração
- [ ] RLS configurado
- [ ] Índices criados
- [ ] Documentação atualizada

### Migration
```sql
-- Nome: YYYYMMDD_criar_ghl_contacts.sql
-- [SQL aqui]
```

### Função de Extração
```typescript
// [Código da função aqui]
```

---

## 📝 Notas

[Anything else relevant]

---

## 📚 Referências

- [Link para payload em EXEMPLOS-PAYLOADS.md]
- [Documentação GHL]
- [Discussão no Slack/Notion]
