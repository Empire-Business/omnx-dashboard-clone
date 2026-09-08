# Decisão: Armazenar Tags do Contato GHL

**Data:** 2026-03-19
**Responsável:** Claude (AI)
**Status:** Implementada ✅

---

## Contexto

As tags do contato no GHL (ex: `mql`, `[fn] aplicação`, `[cp] campanha`) são a principal forma de qualificação e classificação de leads no CRM. Elas não estavam sendo armazenadas em nenhuma tabela do Supabase, tornando impossível:
- Filtrar/identificar MQLs corretamente (a detecção anterior era por nome de pipeline, não por tag)
- Exibir o histórico de qualificação do lead no LeadCard
- Usar tags como critério de análise no dashboard

## Problema Técnico

Os webhooks de workflow trigger que o sistema usa **não incluem tags no payload** — o campo `tags` não está presente na estrutura documentada em `EXEMPLOS-PAYLOADS.md`. As tags são gerenciadas pelo CRM e precisam ser consultadas via API GHL.

## Decisão

### 1. Coluna `tags TEXT` em `contatos`
Armazenar as tags como texto separado por vírgula (ex: `"mql,[fn] aplicação,[cp] ws-100/100-11-25"`).

**Por que TEXT e não ARRAY ou tabela separada?**
- Simplicidade de leitura/escrita
- Compatibilidade com o padrão já existente no sistema (campos denormalizados em `contatos`)
- Tags são lidas como conjunto, raramente filtradas individualmente no banco
- Índices GIN são possíveis se necessário no futuro

### 2. Edge Function `sync-contact-tags`
Busca `GET /contacts/{ghl_id}` na API GHL → extrai `contact.tags[]` → salva como string CSV.

**Por que edge function e não webhook?**
- Tags não chegam no webhook atual
- Precisamos sincronizar todos os contatos existentes (backfill)
- Padrão já consolidado: `sync-opp-dates`, `sync-opp-pipelines`
- Cron automático garante que tags atualizadas no GHL sejam refletidas

### 3. Extração preventiva em `extrair_dados_ghl`
Adicionado `extract_ghl_tags(w.payload->'tags')` na função de extração do webhook.

**Por que extract_ghl_tags() separada?**
- No GHL, `tags` chegam como **array JSON**: `["mql","[fn] aplicação"]`
- O operador `->>'tags'` converte arrays para string com colchetes: `["mql","[fn] aplicação"]`
- A função `extract_ghl_tags()` detecta o tipo JSONB e normaliza:
  - Array → `string_agg` separado por vírgula sem colchetes
  - String → usa diretamente
  - NULL → retorna NULL (COALESCE mantém valor existente)

## Formato das Tags

| Prefixo | Significado | Cor no UI |
|---------|-------------|-----------|
| `mql` | Lead qualificado pelo marketing | Verde |
| `sql` | Lead qualificado para vendas | Verde |
| `nmql` | Lead não qualificado pelo marketing | Vermelho |
| `nsql` | Lead não qualificado para vendas | Vermelho |
| `[fn] nome` | Funil de origem | Azul |
| `[cp] nome` | Campanha de origem | Laranja |
| Outros | Status, ação, produto | Cinza |

## Backfill

Contatos existentes: ~6.900 (backfill via cron 15min, batch=100).
Status em 2026-03-19: ~1.200 processados ao deploy, restante via cron automático.

## Impacto na Detecção de MQL

A função `isMqlByTag()` em `useTrafego.ts` passou a detectar MQLs pela tag `"mql"` no campo `contatos.tags`, substituindo a detecção anterior por nome de pipeline. Isso é mais preciso porque um lead pode ser MQL em qualquer pipeline.

## Checklist de Aprovação (REGRAS-EXTRACAO.md)

- [x] 1. Qual evento GHL? → API REST `GET /contacts/{id}`, não webhook (webhook futuro preventivo)
- [x] 2. Qual campo do payload? → `contact.tags` (array de strings)
- [x] 3. Para qual tabela vai? → `contatos.tags` (TEXT)
- [x] 4. Qual o propósito de negócio? → Qualificação MQL/SQL, origem de funil/campanha, badges no LeadCard
- [x] 5. É único ou pode repetir? → Pode repetir (N tags por contato)
- [x] 6. Pode ser nulo? → Sim (contatos sem tags no GHL ficam com string vazia `""`)
- [x] 7. Tem relação com outra tabela? → Não (desnormalizado)
- [x] 8. Precisa de índice? → Não por enquanto (sem filtro no banco por tag individual)
- [x] 9. Quem vai usar? → Dashboard Tráfego (filtro MQL), LeadCard (badges), Pré-Vendas
- [x] 10. Frequência de atualização? → Cron 15min (via sync-contact-tags) + webhook eventual

## Arquivos Afetados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `supabase/migrations/20260319100000_add_tags_to_contatos.sql` | Migration | Adiciona coluna `tags TEXT` |
| `supabase/migrations/20260319105000_schedule_sync_contact_tags_cron.sql` | Migration | Cron pg_cron a cada 15min |
| `supabase/migrations/20260319110000_extrair_tags_do_webhook.sql` | Migration | Extração preventiva (string) |
| `supabase/migrations/20260319115000_fix_extrair_tags_array_json.sql` | Migration | **FIX:** extração correta (array JSON → CSV) via `extract_ghl_tags()` |
| `supabase/functions/sync-contact-tags/index.ts` | Edge Function | Sync via API GHL |
| `eb-dash2/src/hooks/useLeads.ts` | Frontend | Adiciona `tags` ao select de detalhes |
| `eb-dash2/src/hooks/useTrafego.ts` | Frontend | Adiciona `tags` ao tipo + `isMqlByTag()` |
| `eb-dash2/src/components/leads/LeadCard.tsx` | Frontend | Badges coloridos na seção de Identificação |
