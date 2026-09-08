# Viabilidade Técnica — Verificação Prévia

> Checagem de que todos os dados necessários estão disponíveis antes de executar.

---

## ✅ 1. Identificação dos leads problemáticos

**Como distinguimos os 246 errados dos 136 corretos:**
- Corretos: contato tem opp em Recuperação **E** em outro pipeline
- Problemáticos: contato tem opp **somente** em Recuperação

Query no Supabase confirma: **246 leads para corrigir, 136 fora do escopo**.

---

## ✅ 2. GHL Contact ID disponível para todos

A operação de criar nova opp (`POST /opportunities`) exige o `contactId` do GHL.

Verificação realizada:
- Campo `contatos.ghl_id` = ID do contato no GHL
- Resultado: **246/246 contatos têm `ghl_id` preenchido** — 0 bloqueios

---

## ✅ 3. GHL Opportunity ID disponível

A operação de mover a opp (`PUT /opportunities/{id}`) exige o ID da oportunidade no GHL.

Campo `oportunidades.ghl_opportunity_id` está presente em todos os registros. ✅

---

## ⚠️ 4. Stage atual em Recuperação — precisa buscar da API GHL

O campo `pipeline_stage_id` está **NULL** em todos os leads de Recuperação no nosso banco.
Isso acontece porque os webhooks do pipeline Recuperação não enviam esse campo corretamente.

**Solução:** Antes de mover cada opp, fazer `GET /opportunities/{id}` para buscar:
- `pipelineStageId` — estágio atual (será copiado na duplicata de Recuperação)
- Confirmar `pipelineId` = Recuperação (validação de segurança)

Isso já é o padrão usado em `sync-opp-pipelines` — sem impacto no rate limit.

---

## ✅ 5. Classificação por tags funciona

Tags estão em `contatos.tags` como string separada por vírgula (ex: `"mql,sql,recuperação"`).
Cobertura nos 246 leads:
- Tag `mql` (sem `nmql`): 133 leads → Pré-Vendas MQL
- Tag `nmql`: 34 leads → Pré-Vendas nMQL
- Reunião marcada: 53 leads → Vendas MQL
- Sem classificação clara: 26 leads → aguardando decisão

---

## ✅ 6. `createdAt` é preservado ao mover pipeline via PUT

O endpoint `PUT /opportunities/{id}` atualiza campos como `pipelineId` e `pipelineStageId`
**sem alterar `createdAt`** — a data de criação da oportunidade é imutável na API GHL.

Isso é o comportamento padrão do GHL: `createdAt` só é definido na criação (`POST`).
Qualquer `PUT` subsequente não toca esse campo.

**Confirmação:** Já usamos `PUT` em `sync-opp-pipelines` para atualizar `pipeline_id` sem
alterar datas — nenhum efeito colateral observado.

---

## ✅ 7. API GHL já configurada

A API Key já está configurada e em uso pelas edge functions (`GHL_API_KEY` no Supabase Secrets).
Base URL: `https://services.leadconnectorhq.com`
Header obrigatório: `Version: 2021-04-15`

Só precisamos adicionar as permissões extras (ver [API-PERMISSOES.md](API-PERMISSOES.md)).

---

## Resumo de viabilidade

| Item | Status | Observação |
|------|--------|------------|
| Contact ID (GHL) para todos os 246 | ✅ | `contatos.ghl_id` 100% preenchido |
| Opportunity ID (GHL) para todos | ✅ | `ghl_opportunity_id` presente |
| Stage atual em Recuperação | ⚠️ | NULL no banco — buscar via `GET /opportunities/{id}` |
| createdAt preservado no PUT | ✅ | Confirmado pelo comportamento da API GHL |
| Classificação MQL/nMQL/Reunião | ✅ | 220/246 classificáveis, 26 aguardam decisão |
| API Key existente | ✅ | Só precisa de permissões adicionais |
