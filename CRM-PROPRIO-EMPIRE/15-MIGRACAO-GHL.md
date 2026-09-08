# 15 — Guia de Migração do GHL para o Empire CRM

> **O que este documento cobre:** Este é um guia **opcional** para quem vem do GHL (GoHighLevel) e quer migrar o histórico de dados para o Empire CRM. O Empire CRM funciona 100% de forma independente desde o primeiro dia — este documento só é relevante se você quiser trazer dados históricos de outro sistema.

---

## Importante: O Empire CRM não depende do GHL

O Empire CRM é um sistema **completamente independente**. Você pode:

**Opção A — Começar do zero (recomendado):**
- Criar os pipelines no Empire CRM
- Configurar os formulários de captura
- Começar a receber leads novos diretamente no Empire CRM
- O histórico do GHL fica no GHL como referência

**Opção B — Migrar o histórico:**
- Usar os scripts e guias desta seção para importar dados históricos
- Útil se você precisar que a equipe veja conversas antigas no novo sistema
- Recomendado para migrações planejadas com tempo (não corra)

**Este documento cobre a Opção B.**

---

## Filosofia da Migração (se você escolher migrar)

A migração não acontece em um dia. É um processo gradual:

```
Etapa 1: Empire CRM recebe novos leads (GHL ainda em paralelo)
Etapa 2: SDRs começam a usar o inbox do Empire CRM
Etapa 3: Importação histórica do GHL (scripts desta seção)
Etapa 4: Formulários migrados para o Empire CRM
Etapa 5: GHL desativado
```

**Princípio:** Nunca migrar com pressa. Melhor 3 meses de transição tranquila do que 1 semana caótica.

---

## 1. O que migrar

| Dado | Origem GHL | Destino Empire CRM | Prioridade |
|------|-----------|-------------------|-----------|
| Contatos | GHL API `/contacts` | `contatos` | Crítico |
| Oportunidades | GHL API `/opportunities` | `oportunidades` | Crítico |
| Pipelines e stages | GHL API `/pipelines` | `pipelines` + `pipeline_stages` | Crítico |
| Histórico de mensagens | GHL API + webhooks_ghl | `comunicacoes` | Alta |
| Tags dos contatos | GHL via `contatos.tags` (já no Supabase) | Copiar diretamente | Crítico |
| UTMs e atribuição | GHL custom fields + webhooks_ghl | `contatos.*utm*` | Alta |
| Reuniões | GHL API `/appointments` | `reunioes` | Alta |
| Usuários/SDRs | GHL API `/users` | `workspace_members` | Alta |
| Formulários | Recriar no Form Builder | `formularios` | Média |
| Automações GHL | Recriar no Workflow Builder | `automacoes` | Média |

---

## 2. Estratégia de Migração por Dado

### 2.1 Contatos

**Fonte:** API GHL `GET /contacts?locationId={location_id}&limit=100`

**Script de migração:**
```typescript
async function migrarContatos(ghlApiKey: string, workspaceId: string) {
  let page = 1
  let hasMore = true
  
  while (hasMore) {
    // 1. Buscar contatos do GHL (paginado)
    const ghlContacts = await fetchGHL(`/contacts?limit=100&page=${page}`)
    
    for (const ghlContact of ghlContacts.contacts) {
      // 2. Mapear campos GHL → Empire CRM
      const empireContact = {
        workspace_id: workspaceId,
        ghl_id: ghlContact.id,           // Preservar ID original para referência
        nome: ghlContact.name,
        email: ghlContact.email,
        telefone: normalizePhone(ghlContact.phone),
        tags: ghlContact.tags?.join(','),
        utm_source: getCustomField(ghlContact, 'utm_source'),
        utm_campaign: getCustomField(ghlContact, 'utm_campaign'),
        utm_term: getCustomField(ghlContact, 'utm_term'),
        owner_name: ghlContact.assignedTo?.name,
        created_at: ghlContact.dateAdded,
      }
      
      // 3. UPSERT no Empire CRM (idempotente)
      await supabase
        .from('contatos')
        .upsert(empireContact, { onConflict: 'ghl_id,workspace_id' })
    }
    
    hasMore = ghlContacts.meta?.nextPageUrl != null
    page++
    await sleep(100)  // Respeitar rate limit do GHL
  }
}
```

### 2.2 Oportunidades

**Fonte:** API GHL `GET /opportunities/search?location_id={id}`

**Mapeamento de campos:**
```typescript
const empireOpp = {
  workspace_id: workspaceId,
  ghl_opportunity_id: ghlOpp.id,
  contato_id: await findContactByGhlId(ghlOpp.contact.id),
  titulo: ghlOpp.name,
  valor: ghlOpp.monetaryValue || 0,
  status: mapStatus(ghlOpp.status),     // "open" | "won" | "lost"
  pipeline_id: await findPipelineByGhlId(ghlOpp.pipelineId),
  pipeline_stage_id: await findStageByGhlId(ghlOpp.pipelineStageId),
  pipeline_name: ghlOpp.pipeline?.name,
  stage_name: ghlOpp.pipelineStage?.name,
  sdr_name: ghlOpp.assignedTo?.name,
  
  // Datas de pipeline (dos campos customizados GHL)
  data_conectado: getCustomDateField(ghlOpp, 'conectado'),
  data_qualificado: getCustomDateField(ghlOpp, 'qualificado'),
  data_agendamento_reuniao: getCustomDateField(ghlOpp, 'mqlreunio_marcada'),
  data_reuniao_realizada: getCustomDateField(ghlOpp, 'reuniao_realizada'),
  data_fechado: getCustomDateField(ghlOpp, 'sqlfechada'),
  // ... demais datas
}
```

### 2.3 Histórico de Mensagens

**Vantagem:** O Supabase atual já tem a tabela `comunicacoes` preenchida via `sync-ghl-conversations`. Podemos **copiar direto** do banco atual.

```sql
-- Copiar comunicações do Supabase atual para o Empire CRM
-- (assumindo que o Empire CRM usa o mesmo Supabase project)

INSERT INTO crm.comunicacoes (
  workspace_id, contato_id, tipo, canal, direction,
  mensagem_body, data_comunicacao, external_message_id
)
SELECT 
  'workspace-uuid',
  -- Encontrar novo contato_id pelo ghl_id do contato original
  c_new.id,
  com.tipo,
  com.channel,
  com.direction,
  com.mensagem_body,
  com.data_comunicacao,
  com.ghl_message_id
FROM comunicacoes com
JOIN contatos c_old ON c_old.id = com.contato_id
JOIN crm.contatos c_new ON c_new.ghl_id = c_old.ghl_id
ON CONFLICT (external_message_id) DO NOTHING;
```

---

## 3. Período de Convivência (GHL + Empire CRM em paralelo)

Durante a migração, ambos os sistemas rodam ao mesmo tempo. Para evitar dados inconsistentes:

**Estratégia:**
1. Empire CRM recebe todos os novos leads (formulários migrados primeiro)
2. GHL continua sendo usado pelos SDRs por mais 4 semanas
3. Sync unidirecional: GHL → Empire CRM (via webhooks GHL configurados para o Empire CRM)
4. Depois de 4 semanas: SDRs migram para o inbox do Empire CRM
5. GHL desativado após 1 semana sem uso

**Webhook de sync durante convivência:**
```
GHL → Webhook → Empire CRM
(qualquer atualização no GHL replica para o Empire CRM automaticamente)
```

---

## 4. Validação Pós-Migração

Antes de desligar o GHL, executar este checklist:

### Checklist de validação

```sql
-- 1. Contagem de contatos deve ser igual
SELECT COUNT(*) FROM contatos WHERE workspace_id = 'uuid';
-- Comparar com: contagem no GHL

-- 2. Contagem de oportunidades
SELECT COUNT(*) FROM oportunidades WHERE workspace_id = 'uuid';

-- 3. Zero oportunidades sem pipeline_id
SELECT COUNT(*) FROM oportunidades 
WHERE workspace_id = 'uuid' AND pipeline_id IS NULL;
-- Esperado: 0

-- 4. Zero contatos MQL sem tag "mql"
-- (verificar que tags foram migradas corretamente)
SELECT COUNT(*) FROM contatos 
WHERE workspace_id = 'uuid' 
  AND tags ILIKE '%mql%';
-- Comparar com total de MQLs no GHL

-- 5. Datas críticas preenchidas
SELECT 
  COUNT(*) FILTER (WHERE data_lead_recebido IS NULL) as sem_data_lead,
  COUNT(*) FILTER (WHERE pipeline_id IS NULL) as sem_pipeline
FROM oportunidades 
WHERE workspace_id = 'uuid';
-- Esperado: 0, 0
```

---

## 5. Formulários — Migração

**Os formulários do GHL não migram automaticamente.** É necessário recriar cada um no Form Builder do Empire CRM.

**Processo:**
1. Listar todos os formulários ativos no GHL
2. Recriar cada um no Empire CRM (campos, validações, configurações)
3. Testar com uma submissão real
4. Atualizar a URL nos anúncios do Meta Ads (trocar URL GHL pela URL Empire CRM)
5. Monitorar por 48h: novos leads chegando no Empire CRM? Sim → sucesso

---

## 6. Critérios de Aceite da Migração

- [ ] 100% dos contatos migrados com email/telefone corretos
- [ ] 100% das oportunidades com pipeline_id preenchido
- [ ] Tags "mql" preservadas em todos os contatos que tinham
- [ ] Histórico de mensagens visível na timeline dos contatos
- [ ] Datas de pipeline (data_conectado, data_agendamento, etc.) preservadas
- [ ] SDRs conseguem logar no Empire CRM e ver seus leads
- [ ] Formulários recriados e testados com submissão real

---

*Próximo: [16 — Roadmap por Fases](./16-ROADMAP-FASES.md)*
