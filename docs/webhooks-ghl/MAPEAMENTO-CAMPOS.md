# Mapeamento de Campos - Webhooks GHL

> Mapeamento técnico de campos do GHL para nossas tabelas

---

## 🎯 Propósito

Este documento registra:
- Quais campos dos webhooks extraímos
- Para quais tabelas/colunas mapeamos
- Regras de transformação

---

## 📋 Estrutura do Mapeamento

### Template

```markdown
### Campo: [caminho.no.json]

| Atributo | Valor |
|----------|-------|
| **Evento** | `contact.created`, `contact.updated` |
| **Tipo GHL** | string / number / object |
| **Tabela** | ghl_contacts |
| **Coluna** | email |
| **Tipo DB** | text |
| **Nullable** | Sim / Não |
| **Único** | Sim / Não |

**Descrição:** O que esse campo representa

**Regras de Transformação:**
- Trim whitespace
- Lowercase
- Validar formato de email

**Decisão vinculada:** [link para DECISOES/YYYYMMDD-nome.md]
```

---

## 🗂️ Mapeamentos

### Tabela: contatos

| Campo GHL | Tabela | Coluna | Tipo DB | Nullable | Único | Transformação |
|-----------|--------|--------|---------|----------|-------|---------------|
| `contact_id` | contatos | ghl_id | text | Não | Sim | Trim |
| `full_name` | contatos | nome | text | Não | Não | Trim |
| `email` | contatos | email | text | Sim | Não | Trim, Lowercase |
| `phone` | contatos | telefone | text | Sim | Não | Trim |
| `contact.tags[]` (API) | contatos | tags | text | Sim | Não | Array JSON → string CSV via `extract_ghl_tags()` |

**Regras:**
- ON CONFLICT (ghl_id) DO UPDATE
- updated_at = NOW() em todas as atualizações
- NOTA: A coluna `created_at` foi removida para evitar confusão com a data de criação real do contato no GHL
- `tags`: preenchida via `sync-contact-tags` (API GHL), não via webhook. Webhook usa `extract_ghl_tags()` preventivamente.
  - Formato no banco: `"mql,[fn] aplicação,[cp] campanha"` (vírgula, sem colchetes)
  - Formato na API GHL: array JSON `["mql","[fn] aplicação","[cp] campanha"]`
  - Decisão: `docs/webhooks-ghl/DECISOES/20260319-tags-contato-ghl.md`

---

### Tabela: oportunidades

| Campo GHL | Tabela | Coluna | Tipo DB | Nullable | Único | Transformação |
|-----------|--------|--------|---------|----------|-------|---------------|
| `id` | oportunidades | ghl_opportunity_id | text | Não | Sim | Trim |
| `contact_id` (join) | oportunidades | contato_id | uuid | Não | Não | FK → contatos.id |
| `full_name` | oportunidades | nome_contato | text | Não | Não | Trim (cache) |
| `email` | oportunidades | email_contato | text | Sim | Não | Trim (cache) |
| `opportunity_name` | oportunidades | titulo | text | Sim | Não | Trim |
| `lead_value` | oportunidades | valor | decimal(12,2) | Sim | Não | COALESCE(valor, 0) |
| `status` | oportunidades | status | text | Sim | Não | COALESCE(status, 'open') |
| `pipeline_id` | oportunidades | pipeline_id | text | Sim | Não | Trim |
| `pipleline_stage` | oportunidades | pipeline_stage_id | text | Sim | Não | Trim |
| `customData[mqlreunio_marcada]` | oportunidades | data_agendamento_reuniao | date | Sim | Não | `parse_date_flexible()`, fallbacks: `sqlreunio_agendada`, `d_mqlreunio_marcada` |
| `customData[data_da_reunio]` | oportunidades | data_reuniao_agendada | date | Sim | Não | ~~`parse_date_flexible()`~~ **REMOVIDO do webhook** (migration `20260326110000`) — campo gerenciado exclusivamente pelo cron `sync-appointment-dates` via API GHL. Ver `docs/SYNC-APPOINTMENT-DATES.md` |
| `customData[reuniao_realizada]` | oportunidades | data_reuniao_realizada | date | Sim | Não | `parse_date_flexible()`, fallbacks: `data_da_reunio_realizada`, `d_reuniao_realizada` |
| `customData[sqlreunio_agendada]` | oportunidades | data_agendamento_vendas | date | Sim | Não | `parse_date_flexible()`, fallback: `d_sqlreunio_agendada` |
| `customData[sqlreunio_realizada]` | oportunidades | data_realizacao_vendas | date | Sim | Não | `parse_date_flexible()`, fallback: `d_sqlreunio_realizada` |
| `customData[sqlno_show]` | oportunidades | data_no_show_vendas | date | Sim | Não | `parse_date_flexible()`, fallback: `d_sqlno_show` |
| `customData[sqlperdida]` | oportunidades | data_perdido_vendas | date | Sim | Não | `parse_date_flexible()`, fallback: `d_sqlperdida` |
| `customData[sqlnegociao]` | oportunidades | data_negociacao | date | Sim | Não | `parse_date_flexible()`, fallback: `d_sqlnegociao` |
| `customData[sqlfechada]` | oportunidades | data_fechado | date | Sim | Não | `parse_date_flexible()` |
| `customData[mqlauto_agendamento]` | oportunidades | data_auto_agendamento | date | Sim | Não | `parse_date_flexible()` — webhook envia data+hora, apenas DATE é armazenado |

**Regras:**
- ON CONFLICT (ghl_opportunity_id) DO UPDATE
- contato_id obtido via JOIN com contatos.ghl_id
- Cache de nome/email para visualização rápida
- NOTA: A coluna `created_at` foi removida para evitar confusão com a data de criação real (do campo `date_created` do webhook GHL)

---

## 📊 Resumo por Tabela

| Tabela | Campos Mapeados | Status |
|--------|----------------|--------|
| contatos | 5 | ✅ Ativa |
| oportunidades | 19 | ✅ Ativa |
| webhooks_ghl | 1 (payload) | ✅ Ativa (fonte)

---

## 🔄 Processo de Atualização

1. Receber payload em `EXEMPLOS-PAYLOADS.md`
2. Identificar campos relevantes
3. Documentar decisão em `DECISOES/`
4. **APROVADO?** → Adicionar neste arquivo
5. Criar migration
6. Atualizar status

---

*Documento técnico - Manter atualizado*  
*Última atualização: 2026-03-25 23:50 BRT*
