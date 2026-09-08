# Fase 2 — Fatia 7: Webhooks de saída por workspace (OpenClaw)

> Status: implementada e testada no banco de TESTE. NÃO aplicada em produção.
> Migration: `supabase/migrations/20260727000000_fase7_outbound_webhooks.sql`
> Testes: `__tests__/integration/outbound-webhooks-isolation.test.ts` (12/12) · suite 235 verde.

## O que mudou

Havia **dois** caminhos disparando o webhook `contrato_assinado` do OpenClaw com URL e
token **fixos no código** (segredo único compartilhado entre todos os tenants):

1. `public.notify_openclaw_contrato_assinado()` — trigger em `vendas_fechamento` (caminho live).
2. `public.processar_notificacao_openclaw_contrato_assinado(uuid,text,text)` — cron de retry/sync.

Agora ambos leem destino e credencial da tabela `public.outbound_webhooks`, filtrando
**explicitamente por `workspace_id` do evento** (as funções rodam `SECURITY DEFINER`, fora de
RLS — o `WHERE workspace_id = ...` é a defesa real). O segredo fica no **vault**
(`secret_key_id`), nunca em plaintext. Sem configuração para o workspace = **no-op** (não quebra
o INSERT/UPDATE nem o cron).

## Peças novas

| Objeto | Papel |
|--------|-------|
| `public.outbound_webhooks` | destino + `secret_key_id` por `(workspace_id, event_key)`; RLS: leitura `is_workspace_member`, escrita `is_workspace_admin`; `anon` revogado; `service_role` full |
| `public.assert_outbound_url_safe(text)` | guarda SSRF deny-by-default: bloqueia esquema ≠ http(s), `localhost`, IPv6 literal e IPv4 privado/loopback/link-local/CGNAT/reservado |
| `public.register_outbound_webhook(...)` | operador (só `service_role`): valida SSRF, guarda segredo no vault e faz upsert da linha |

## Como ligar em produção (cutover seguro)

A migration **não** semeia nenhum workspace (não há segredo no git). Antes de aplicar a
migration em produção, cadastre o webhook do cliente real no banco de produção:

```sql
-- 1) descobrir o workspace dono do OpenClaw (tenant com atividade real):
SELECT c.workspace_id, count(*) AS qtd
FROM public.oportunidades o
JOIN public.contatos c ON c.id = o.contato_id
WHERE o.openclaw_notificado_em IS NOT NULL
   OR o.openclaw_request_id  IS NOT NULL
GROUP BY c.workspace_id
ORDER BY qtd DESC;

-- 2) cadastrar (service_role; valores do provedor do cliente — NUNCA commitar):
SELECT public.register_outbound_webhook(
  '<workspace_id_do_cliente>'::uuid,
  'contrato_assinado',
  '<url_do_endpoint_openclaw>',
  '<token_x_openclaw>'
);
```

Ordem recomendada de cutover: aplicar a migration → registrar o webhook do cliente (passo 2)
→ validar um `contrato_assinado` de teste confirmando 2xx. Até o passo 2, os dois caminhos
viram no-op (seguro, sem erro) — por isso o seed deve preceder o tráfego real.

## Residual conhecido (próxima etapa de hardening)

`assert_outbound_url_safe` bloqueia IP literal interno e `localhost`, mas **não** fecha SSRF por
**DNS rebinding** (hostname público que resolve para IP privado no instante do fetch). Isso
exige *resolve-then-connect* fora do Postgres — um dispatcher Deno (edge function) que resolve
DNS, recusa IP privado e só então faz o POST. O fluxo atual de confirmação lê
`net._http_response` (pg_net); trocar o egresso pelo dispatcher é uma mudança maior nesse
caminho delicado e ficou fora desta fatia para não arriscar o cliente. Tratar como próxima
etapa dedicada, validada em staging antes de produção.

## Rollback

Reaplicar as duas funções na versão anterior (migrations `20260324031000...` e
`20260323211000...`) restaura o comportamento antigo — porém reintroduz o segredo fixo no
código. Só em emergência.
