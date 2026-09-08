-- Remove trigger de notificação OpenClaw da tabela vendas_fechamento.
-- A notificação será feita diretamente via automação GHL (webhook customizado).
DROP TRIGGER IF EXISTS tr_notify_openclaw_contrato_assinado ON public.vendas_fechamento;
