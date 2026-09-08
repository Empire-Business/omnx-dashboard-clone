# Incidente 2026-07-14/15 — Webhooks GHL parados (leads não contabilizados)

| Campo | Valor |
|-------|-------|
| **Severidade** | 🔴 CRÍTICO — pipeline de dados GHL 100% parado por ~30h |
| **Janela** | 2026-07-14 ~13:00 UTC → 2026-07-15 ~16:00 UTC |
| **Sintoma** | Nenhum lead novo contabilizado no workspace Default; syncs parados |
| **Status** | ✅ RESOLVIDO — fluxo retomado e 1.502/1.502 eventos da quarentena reprocessados |
| **Resolução** | 2026-07-15 16:15 UTC |

## O que aconteceu

Em 2026-07-14 foi feito o deploy em produção do pacote multi-tenant (Fases 2/3 + consolidação GHL + criação do workspace "Burn-in Interno"). O deploy ativou três mudanças que, combinadas, pararam completamente a ingestão e o processamento de dados do GHL para o workspace Default — sem erro visível em lugar nenhum até o cliente perceber a ausência de leads.

## As 3 causas (camadas independentes)

### 1. webhook_secret por workspace ≠ segredo que os workflows GHL enviam

A nova `webhook-ghl` autentica por workspace (`ghl_integration_settings.webhook_secret`). O valor gravado para o Default (19 chars, definido em 2026-07-08) **não era** o segredo que os workflows realmente enviam (`ghl_webhook_...`, provado por hash SHA-256 bater com o digest do antigo `WEBHOOK_SECRET` global). Resultado: 100% dos eventos → `auth_failed` → dead-letter `webhook_unresolved` (1.502 eventos em ~22h).

**Correção:** gravado o segredo correto via service role (valor nunca commitado; verificação por hash).

### 2. Credencial GHL do workspace Default nunca seedada no Vault

O cutover da Fase 2 exige `workspace_integration_credentials` por workspace (fail-closed). Só o Burn-in foi seedado; o Default ficou sem — syncs/crons viraram no-op (0 updates de oportunidades em 24h) e a UI de config mostrava "Não conectado" (escondendo o campo de Webhook Secret).

**Correção:** usuário conectou a chave GHL do Default pela própria UI (`/workspace/ghl-config`, Passo 1), que grava no Vault via `save_workspace_credential`.

### 3. extrair_dados_ghl_v2 não lia o formato de location que o GHL realmente envia

A função lia `payload->>'locationId'` (flat), mas **99% dos payloads reais** trazem `payload.location.id` (aninhado — medido: 500/500 da quarentena, 198/200 do histórico). Com a versão fail-closed de `get_workspace_id_by_ghl_location_id` (Fase 3), isso dava `workspace_id NULL` → mapping vazio → `nome NULL` em contatos → violação de NOT NULL → **rollback do INSERT em `webhooks_ghl` → evento perdido em silêncio** (a edge responde 202 antes do insert). Este era o bug mais grave: mesmo com os itens 1 e 2 corrigidos, todo evento de contato continuaria sendo perdido.

**Correção:** migration `20260906000000` — helper `ghl_payload_location_id(payload, location_id_coluna)` (coluna → nested → flat → snake) aplicado nos 6 call-sites da função.

### 3b. Contatos sem nome no GHL deixavam de ser contados (regressão da v2)

Após o fix 3, restaram 8 eventos falhando: contatos reais (email/telefone/tags) com `full_name = ""`. A v1 contava esses leads (string vazia passa no NOT NULL); a v2 devolve NULL → falha.

**Correção:** migration `20260907000000` — fallback `full_name → email → phone → 'Sem nome'` no INSERT e preservação do nome existente no UPDATE (contatos e oportunidades).

## Linha do tempo (UTC)

- **07-14 ~13:00** — deploy do pacote multi-tenant; syncs param (sem credencial no Vault)
- **07-14 ~17:17** — primeiros eventos rejeitados (`auth_failed`) começam a acumular na quarentena
- **07-15 15:30** — diagnóstico concluído (3 camadas identificadas)
- **07-15 15:47** — credencial GHL do Default seedada via UI pelo usuário
- **07-15 15:56** — webhook_secret correto gravado (verificado por hash)
- **07-15 16:06** — migration `20260906000000` aplicada (fix location aninhado)
- **07-15 16:10** — migration `20260907000000` aplicada (fallback de nome)
- **07-15 16:15** — quarentena zerada (1.502/1.502 reprocessados); fluxo orgânico confirmado; 96 contatos e 105 oportunidades novos no Default desde 14/07

## Lições (para o próximo deploy multi-tenant)

1. **Checklist de cutover precisa incluir paridade de segredos**: antes de ativar auth por workspace, provar por hash que `ghl_integration_settings.webhook_secret` == segredo que o remetente envia. O runbook da Fase 2 cobria o seed da credencial de API, mas não a paridade do webhook_secret.
2. **Trigger que processa eventos externos não pode morrer por 1 evento ruim**: um único payload inesperado derrubava o INSERT inteiro. Considerar `EXCEPTION` handler por evento + dead-letter, em vez de falhar o lote.
3. **Monitorar a quarentena**: `webhook_unresolved` crescendo = ingestão quebrada. Merece alerta (cron de saúde/Telegram) — o cliente percebeu antes do sistema.
4. **Formatos de payload do GHL variam por tipo de evento**: qualquer código novo que leia payload deve aceitar `location.id` (nested), `locationId` (flat) e `location_id` (snake) — a edge (`extractLocationId`) já aceita; o SQL não aceitava.

## Artefatos

- Migrations: `20260906000000_fix_extrair_dados_ghl_v2_location_id_aninhado.sql`, `20260907000000_fix_extrair_dados_ghl_v2_fallback_nome.sql`
- Scripts de diagnóstico (read-only, reutilizáveis): `scripts/diagnostico-leads-conta-default.js`, `scripts/diagnostico-webhook-secret-compare.js`
- Pendência conhecida: workspace Burn-in Interno está com `webhook_secret` NULL — configurar quando o GHL daquela location começar a enviar eventos (falharão com `no_secret` até lá).
