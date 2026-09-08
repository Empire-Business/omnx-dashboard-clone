-- ============================================================================
-- Rename de dados: origem 'empiredesk' → 'omnx_desk' em vendas_fechamento
-- ============================================================================
-- O produto que envia as vendas mudou de nome EmpireDesk → omnx-desk. As vendas
-- históricas foram gravadas com origem='empiredesk'; esta migration normaliza o
-- valor para 'omnx_desk'. A partir da edge function crm-registrar-venda renomeada,
-- novas vendas já gravam 'omnx_desk'.
--
-- NÃO altera o DEFAULT da coluna (segue 'ghl' — default da Porta 1, webhook GHL).
-- NÃO renomeia tabela/coluna — só o VALOR. Aditivo e idempotente (reexecutável).
-- Ver docs/INTEGRACAO-OMNX-DESK-VENDAS.md §0 e §6.
-- ============================================================================
SET search_path = public, pg_catalog;

UPDATE public.vendas_fechamento
SET origem = 'omnx_desk'
WHERE origem = 'empiredesk';

NOTIFY pgrst, 'reload schema';
