# Catálogo de Eventos GHL

> Documentação de referência dos eventos disponíveis no GoHighLevel (GHL)

---

## 📋 Índice de Eventos

### Contacts
| Evento | Descrição | Status Doc |
|--------|-----------|------------|
| `ContactCreate` | Novo contato criado | ⏳ Pendente |
| `ContactUpdate` | Contato atualizado | ⏳ Pendente |
| `ContactDelete` | Contato deletado | ⏳ Pendente |
| `ContactTagAdd` | Tag adicionada ao contato | ⏳ Pendente |
| `ContactTagRemove` | Tag removida do contato | ⏳ Pendente |

### Opportunities (Pipeline)
| Evento | Descrição | Status Doc |
|--------|-----------|------------|
| `OpportunityCreate` | Nova oportunidade criada | ⏳ Pendente |
| `OpportunityUpdate` | Oportunidade atualizada | ⏳ Pendente |
| `OpportunityDelete` | Oportunidade deletada | ⏳ Pendente |
| `OpportunityStatusUpdate` | Status da oportunidade mudou | ⏳ Pendente |
| `OpportunityStageUpdate` | Estágio do pipeline alterado | ⏳ Pendente |
| `OpportunityMonetaryValueUpdate` | Valor da oportunidade alterado | ⏳ Pendente |

### Appointments
| Evento | Descrição | Status Doc |
|--------|-----------|------------|
| `AppointmentCreate` | Novo agendamento | ⏳ Pendente |
| `AppointmentUpdate` | Agendamento atualizado | ⏳ Pendente |
| `AppointmentDelete` | Agendamento cancelado | ⏳ Pendente |

### Tasks
| Evento | Descrição | Status Doc |
|--------|-----------|------------|
| `TaskCreate` | Nova tarefa criada | ⏳ Pendente |
| `TaskUpdate` | Tarefa atualizada | ⏳ Pendente |
| `TaskComplete` | Tarefa concluída | ⏳ Pendente |
| `TaskDelete` | Tarefa deletada | ⏳ Pendente |

### Notes
| Evento | Descrição | Status Doc |
|--------|-----------|------------|
| `NoteCreate` | Nova nota adicionada | ⏳ Pendente |

### Custom Fields
| Evento | Descrição | Status Doc |
|--------|-----------|------------|
| `ContactCustomFieldUpdate` | Campo customizado atualizado | ⏳ Pendente |

---

## 📖 Legendas

| Status | Significado |
|--------|-------------|
| ⏳ Pendente | Evento listado, mas não documentado detalhadamente |
| 📝 Documentado | Payload mapeado, mas não implementado |
| ✅ Implementado | Extração aprovada e em produção |
| 🚫 Ignorado | Decisão consciente de não extrair |

---

## 🎯 Como Usar Este Documento

### Quando receber um webhook novo:

1. **Identifique o evento** nesta lista
2. **Verifique o status**:
   - Se ⏳: Precisa documentar em `EXEMPLOS-PAYLOADS.md`
   - Se 📝: Ler documentação existente
   - Se ✅: Usar implementação existente
3. **Se for novo**: Adicionar à lista e documentar

### Processo de Documentação:

```
1. Receber webhook em webhooks_ghl
2. Identificar evento
3. Adicionar neste arquivo (se não existir)
4. Documentar payload em EXEMPLOS-PAYLOADS.md
5. Analisar campos relevantes
6. Propor extração seguindo REGRAS-EXTRACAO.md
```

---

## 🔗 Referências Externas

- [Documentação Webhooks GHL](https://help.gohighlevel.com/support/solutions/articles/48001242951-webhooks-overview)
- [API Reference GHL](https://highlevel.stoplight.io/docs/integrations/)

---

*Atualizado conforme recebemos webhooks*  
*Não editar manualmente - atualizar via processo de documentação*
