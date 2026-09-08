# Permissões de API

> A API Key do GHL já está configurada e em uso. Só precisamos adicionar as permissões abaixo.
> Base URL: `https://services.leadconnectorhq.com` | Header: `Version: 2021-04-15`

---

## Permissões a adicionar

| Permissão | Endpoint usado | Por que precisamos |
|-----------|---------------|--------------------|
| **Opportunities - Read** | `GET /opportunities/{id}` | Buscar estágio atual em Recuperação (NULL no banco) |
| **Opportunities - Write/Update** | `PUT /opportunities/{id}` | Mover opp para pipeline original |
| **Opportunities - Create** | `POST /opportunities` | Criar duplicata em Recuperação |
| **Opportunities - Delete** | `DELETE /opportunities/{id}` | Necessário para rollback |
| **Pipelines - Read** | `GET /pipelines` | Coletar IDs dos stages "Perdido" (Etapa 0) |

> Contacts - Read provavelmente já está habilitado (sync de tags usa isso). Confirmar.

---

## Como adicionar no GHL

1. GHL → Settings → API Keys
2. Editar a API Key existente
3. Habilitar as permissões acima
4. Salvar — **não precisa atualizar variável de ambiente** (a key string não muda, só as permissões)

---

## Chamadas que o script vai fazer

### Etapa 0 — Listar pipelines e stages
```
GET /pipelines
```

### Por lead (3 chamadas cada)

```
1. GET /opportunities/{ghl_opportunity_id}
   → pega pipelineStageId atual

2. PUT /opportunities/{ghl_opportunity_id}
   Body: { pipelineId, pipelineStageId (perdido), status: "lost" }
   → move para pipeline original

3. POST /opportunities
   Body: { contactId, pipelineId: Recuperação, pipelineStageId (copiado), title, status: "open" }
   → cria duplicata
```

### Rollback (se necessário — 2 chamadas por lead revertido)
```
1. PUT /opportunities/{opp_id_original}   → volta para Recuperação
2. DELETE /opportunities/{nova_opp_id}    → apaga a duplicata
```
