# Plano de Execução — Passo a Passo

> **Regra de ouro:** Testar com 5 leads primeiro. Só escalar após validação manual no GHL.

---

## Pré-requisitos

- [ ] Permissões adicionadas na API Key (ver [API-PERMISSOES.md](API-PERMISSOES.md))
- [ ] IDs dos stages "Perdido" coletados (Etapa 0)
- [ ] Decisão sobre os 26 leads sem tag clara

---

## Etapa 0 — Coletar IDs dos Pipelines e Stages

Antes de qualquer coisa, precisamos dos IDs exatos dos stages "Perdido" de cada pipeline destino.

```
GET https://services.leadconnectorhq.com/pipelines
Authorization: Bearer {GHL_API_KEY}
Version: 2021-04-15
```

Preencher a tabela abaixo com os resultados:

| Pipeline | pipeline_id | Stage "Perdido" → stage_id |
|----------|-------------|---------------------------|
| Pré-Vendas MQL | `sqchZ2kIIZljR6wJ6bko` | *(coletar)* |
| Pré-Vendas nMQL | *(confirmar)* | *(coletar)* |
| Vendas MQL | *(confirmar)* | *(coletar)* |

> Salvar resultado em `docs/plano-correcao-recuperacao/pipeline-stage-ids.json` — não commitar (contém IDs internos).

---

## Etapa 1 — Backup dos 246 leads

Exportar o estado atual de todos os 246 para `backup-246-leads-YYYYMMDD.json`.

Campos a salvar por lead:
- `ghl_opportunity_id`
- `contato_id` + `ghl_id` (do contato)
- `pipeline_id` atual (Recuperação)
- `pipeline_stage_id` atual (via API GHL, pois está NULL no banco)
- `data_lead_recebido`
- Tags do contato
- Todos os campos `data_*`

---

## ⚡ FASE 1 — Teste com 5 leads

### Seleção dos 5 leads de teste

Escolher leads que representem os 3 grupos:
- 2 leads → Pré-Vendas MQL
- 1 lead → Pré-Vendas nMQL
- 2 leads → Vendas MQL

### Processo para cada lead de teste

```
PASSO A — Ler estado atual da opp no GHL
  GET /opportunities/{ghl_opportunity_id}
  → salvar: pipelineStageId (estágio atual em Recuperação)
  → confirmar: pipelineId = Sn1Guqcm6zwZNTVOOf5L

PASSO B — Mover para pipeline original
  PUT /opportunities/{ghl_opportunity_id}
  Body:
  {
    "pipelineId": "{id_pipeline_original}",
    "pipelineStageId": "{id_stage_perdido_nesse_pipeline}",
    "status": "lost"
  }
  → aguardar 200 OK

PASSO C — Criar duplicata em Recuperação
  POST /opportunities
  Body:
  {
    "contactId": "{ghl_contact_id}",   ← de contatos.ghl_id
    "pipelineId": "Sn1Guqcm6zwZNTVOOf5L",
    "pipelineStageId": "{stage_id_salvo_no_PASSO_A}",
    "title": "{mesmo título da opp}",
    "status": "open"
  }
  → aguardar 201 Created
  → salvar: novo ghl_opportunity_id gerado

⏸ Pausa de 500ms antes do próximo lead
```

### Validação manual da FASE 1 (OBRIGATÓRIO antes de continuar)

Para cada um dos 5 leads, verificar **no GHL** (não só no banco):

- [ ] A opp original aparece no pipeline correto (MQL/nMQL/Vendas MQL)
- [ ] O estágio da opp original é "Perdido"
- [ ] A data de criação original (`createdAt`) foi preservada
- [ ] Uma nova opp aparece em Recuperação com o mesmo contato
- [ ] O estágio da nova opp em Recuperação é o correto (copiado do estado anterior)
- [ ] O Supabase sincronizou após o próximo webhook ou sync automático

**Se qualquer item falhar → NÃO avançar para FASE 2. Investigar e corrigir.**

---

## ⚡ FASE 2 — Execução completa

Só executar após FASE 1 validada com sucesso.

### Ordem de execução

| Grupo | Qtd | Motivo da ordem |
|-------|-----|----------------|
| Pré-Vendas MQL | 133 | Maior volume, menor risco operacional |
| Pré-Vendas nMQL | 34 | Volume médio |
| Vendas MQL | 53 | Mais delicado (reuniões envolvidas) — executar por último |
| Sem tag clara | 26 | **Somente após decisão do responsável** |

### Rate limiting

- 200ms entre cada lead
- Se receber 429 (rate limit): pausar 5s e retry
- Para 220 leads: ~44 segundos de execução pura + pausas
- Limite GHL: 100 req/10s — 3 chamadas por lead = seguro

### Log obrigatório

Para cada lead processado, registrar:
```json
{
  "ghl_opportunity_id": "...",
  "contato_id": "...",
  "pipeline_destino": "Pré-Vendas MQL",
  "status": "sucesso | erro",
  "nova_opp_id": "...",
  "erro": null
}
```

Arquivo: `docs/plano-correcao-recuperacao/log-execucao-YYYYMMDD.json`
(necessário para rollback se algo der errado)

---

## Etapa Final — Validação no banco

Após execução, rodar no Supabase:

```sql
-- Quantos ainda estão SÓ em Recuperação (esperado: ≤ 26)
SELECT COUNT(DISTINCT contato_id)
FROM oportunidades
WHERE pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L'
  AND contato_id NOT IN (
    SELECT contato_id FROM oportunidades
    WHERE pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
  );

-- Distribuição dos pares criados
SELECT pipeline_name, COUNT(*)
FROM oportunidades
WHERE contato_id IN (
  SELECT contato_id FROM oportunidades WHERE pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L'
)
AND pipeline_id != 'Sn1Guqcm6zwZNTVOOf5L'
GROUP BY pipeline_name;
```

**Resultado esperado pós-execução:**
- Leads só em Recuperação: 26 (os sem tag)
- Pré-Vendas MQL: ~133
- Pré-Vendas nMQL: ~34
- Vendas MQL: ~53
