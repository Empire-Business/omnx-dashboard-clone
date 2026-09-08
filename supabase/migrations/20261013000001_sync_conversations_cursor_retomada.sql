-- =============================================================================
-- Cursor de retomada do sync de conversas GHL
-- =============================================================================
--
-- POR QUE ISTO EXISTE
-- -------------------
-- Achado ao VALIDAR a correção anterior (`20261013000000`) rodando em produção:
-- o incremental nunca convergiria.
--
-- O ponto de retomada era o `finished_at` da última execução com
-- `status = 'success'`. Só que 24h de conversas não cabem no orçamento de 90s
-- da edge function — cada conversa exige buscar o histórico INTEIRO de
-- mensagens. Logo a execução sempre terminava como `partial`, nunca gravava um
-- `success`, e o ciclo seguinte relia exatamente o mesmo bloco. Para sempre, a
-- cada 10 minutos, queimando cota da API do GHL sem nunca alcançar o presente.
--
-- Medido em produção antes da correção: dois ciclos consecutivos processando a
-- mesma janela, 4.322 e 4.422 mensagens, com zero linha nova no segundo.
--
-- A SOLUÇÃO
-- ---------
-- Guardar a data da última conversa EFETIVAMENTE processada e retomar dali —
-- inclusive quando a execução parou no meio. É seguro por construção: o cursor
-- é a data do que JÁ foi lido, então retomar dele não pula nada. E as conversas
-- são lidas em ordem crescente de `lastMessageDate`, o que garante que o cursor
-- só anda para frente sobre terreno já coberto.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
-- =============================================================================

ALTER TABLE public.ghl_conversations_sync_log
  ADD COLUMN IF NOT EXISTS cursor_last_message_date BIGINT;

COMMENT ON COLUMN public.ghl_conversations_sync_log.cursor_last_message_date IS
  'Epoch ms da ultima conversa EFETIVAMENTE processada nesta execucao. E o ponto '
  'de retomada do incremental: usar finished_at nao converge, porque uma janela '
  'que nao cabe no orcamento nunca fecha como success e o sync releria o mesmo '
  'bloco para sempre. Gravado tambem em execucoes parciais — como e a data do que '
  'ja foi lido, retomar dali nao pula nada.';

-- Suporta a leitura do cursor mais recente por (workspace, mode, status).
CREATE INDEX IF NOT EXISTS idx_ghl_conv_sync_log_cursor
  ON public.ghl_conversations_sync_log (workspace_id, mode, status, cursor_last_message_date DESC);
