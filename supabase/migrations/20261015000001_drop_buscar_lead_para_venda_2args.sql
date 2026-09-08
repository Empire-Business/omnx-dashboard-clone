-- Fecha o vazamento cross-tenant de LEITURA da ponte omnx-desk (PASSO 2 de 2).
--
-- Pre-requisitos (nesta ordem, obrigatoria):
--   1. Migration `20261015000000` aplicada  -> assinatura nova de 3 args existe.
--   2. Edge functions `crm-buscar-lead` e `crm-sync-stats` deployadas -> ja chamam a nova.
--
-- So entao esta migration remove a assinatura antiga de 2 argumentos, que era a que
-- vazava (guard `auth.role() = 'service_role'` sem receber workspace = passe-livre para
-- o chamador real, que usa a service role key).
--
-- Rodar isto ANTES do deploy das functions derrubaria a busca de lead do desk ate o
-- deploy sair. Rodar DEPOIS, como aqui, nao tem janela nenhuma: quando a antiga sai,
-- ninguem mais a chama.
--
-- Idempotente: `IF EXISTS` deixa reaplicar sem erro.

DROP FUNCTION IF EXISTS public.buscar_lead_para_venda(text, text);
