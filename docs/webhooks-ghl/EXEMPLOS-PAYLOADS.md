# Exemplos de Payloads GHL

> **INSTRUÇÃO**: Quando receber um webhook novo, copiar o payload aqui para análise antes de qualquer extração.

---

## 📝 Template de Documentação

Para cada novo evento documentado:

```markdown
## Evento: [NOME_DO_EVENTO]

**Data recebido:** YYYY-MM-DD  
**Location ID:** [id da location]  
**Webhook ID:** [uuid do registro em webhooks_ghl]

### Payload Completo
```json
{
  "event": "...",
  "version": "...",
  "timestamp": "...",
  ...
}
```

### Campos Identificados

| Campo | Tipo | Descrição | Interesse |
|-------|------|-----------|-----------|
| `contact.id` | string | ID do contato | ⭐ Alto |
| `contact.email` | string | Email | ⭐ Alto |
| `meta.timestamp` | string | Data do evento | ⭐ Médio |

### Observações
- [Notas sobre o payload]
- [Campos que parecem opcionais]
- [Diferenças da documentação oficial]

### Decisão
- [ ] Extrair dados
- [ ] Ignorar
- [ ] Aguardar mais exemplos
```

---

## 📦 Eventos Documentados

### Evento: Workflow Trigger (Oportunidade Criada/Atualizada)

**Data recebido:** 2026-02-19  
**Location ID:** U8FTcw90CB5QELUnbGUu  
**Webhook ID:** 8ed42592-5521-463a-a598-ce263b8422a1  
**Evento GHL:** `workflow` (oportunidade criada/atualizada)

### Payload Estrutura (Simplificado)

```json
{
  "id": "o40R9f7xevOWTwCKGJS8",
  "contact_id": "aNPI651izreiwWEm4emo",
  "email": "leonardo@centroauditivomacae.com.br",
  "phone": "+5522997158607",
  "full_name": "Leonardo Moraes Santos",
  "first_name": "Leonardo",
  "last_name": "Moraes Santos",
  "status": "lost",
  "pipeline_id": "sqchZ2kIIZljR6wJ6bko",
  "pipeline_name": "Pré-Vendas nMQL",
  "pipleline_stage": "Perdido",
  "lead_value": 0,
  "opportunity_name": "Leonardo Moraes Santos",
  "opportunity_source": "[AA] Aplicação direta",
  "date_created": "2026-01-25T20:02:52.080Z"
}
```

### Campos Identificados

| Campo | Tipo | Descrição | Interesse |
|-------|------|-----------|-----------|
| `id` | string | ID da oportunidade no GHL | ⭐ Alto |
| `contact_id` | string | ID do contato no GHL | ⭐ Alto |
| `email` | string | Email do contato | ⭐ Alto |
| `phone` | string | Telefone do contato | ⭐ Alto |
| `full_name` | string | Nome completo | ⭐ Alto |
| `first_name` | string | Primeiro nome | ⭐ Médio |
| `last_name` | string | Sobrenome | ⭐ Médio |
| `status` | string | Status da oportunidade | ⭐ Alto |
| `pipeline_id` | string | ID do pipeline | ⭐ Alto |
| `pipeline_name` | string | Nome do pipeline | ⭐ Médio |
| `pipleline_stage` | string | Estágio atual | ⭐ Médio |
| `lead_value` | number | Valor da oportunidade | ⭐ Alto |
| `opportunity_name` | string | Nome da oportunidade | ⭐ Alto |
| `opportunity_source` | string | Fonte da oportunidade | ⭐ Médio |
| `date_created` | string | Data de criação | ⭐ Médio |

### Observações
- O payload vem através de workflow trigger no GHL
- Contém tanto dados do contato quanto da oportunidade
- O campo `contact_id` é o ID do contato no GHL (não da oportunidade)
- Status comum: "open", "won", "lost"
- Pipeline "Pré-Vendas nMQL" e "Pré-Vendas MQL" são os principais

### Decisão
- [x] Extrair dados para tabelas `contatos` e `oportunidades`

---

## 🎯 Próximos Passos

1. Configurar webhook no GHL
2. Receber webhooks reais
3. Documentar payloads aqui
4. Analisar campos relevantes
5. Seguir processo de extração em `REGRAS-EXTRACAO.md`

---

*Arquivo de referência - Não incluir dados sensíveis reais (emails, telefones)*
