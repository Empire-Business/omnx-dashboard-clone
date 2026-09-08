-- Migration: sincronizacao do Notion passa de 2x para 3x ao dia
--
-- CONTEXTO
--   Os crons `notion-sync-paid-creatives` e `notion-sync-organic-creatives` rodavam
--   em '0 9,21 * * *' UTC, ou seja 6h e 18h BRT (definido em 20260729000000).
--   Na pratica isso deixava a manha inteira e a tarde inteira sem atualizacao: um
--   criativo cadastrado no Notion as 7h so aparecia as 18h.
--
--   Com o botao "Sincronizar" removido da Biblioteca (a RPC de disparo manual nao foi
--   adotada, ver docs/MUDANCAS.md), o cron passa a ser o UNICO caminho de entrada dos
--   criativos do Notion. Entao a frequencia importa mais.
--
-- NOVA GRADE (decisao do dono, 2026-09-01) — 3x ao dia, em BRT:
--   09:00 BRT = 12:00 UTC  (manha, comeco do expediente)
--   13:00 BRT = 16:00 UTC  (inicio da tarde)
--   19:00 BRT = 22:00 UTC  (final do dia)
--
--   BRT e UTC-3 e o Brasil nao usa mais horario de verao, entao a conversao e fixa e
--   nao ha risco de a grade "andar" duas vezes por ano.
--
-- ⚠️ ARMADILHA MEDIDA AO APLICAR ISTO EM PRODUCAO (2026-09-01)
--   A versao original desta migration usava o padrao herdado de 20260729000000:
--
--       SELECT cron.unschedule('nome') WHERE EXISTS (SELECT 1 FROM cron.job WHERE ...);
--       SELECT cron.schedule('nome', ...);
--
--   Executada em bloco, ela **retornou sem erro e nao mudou nada** — a consulta a
--   `cron.job` logo depois ainda mostrava '0 9,21 * * *'. O `unschedule` seguido de
--   `schedule` do MESMO jobname na mesma execucao nao surte efeito.
--
--   `cron.schedule` ja e idempotente por jobname: chamado sozinho, ele atualiza o job
--   existente (ou cria, se nao houver). Entao o `unschedule` era desnecessario E era
--   justamente o que quebrava. Por isso ele saiu daqui.
--
--   Se voce for mexer em outro cron deste repositorio, nao copie o padrao antigo —
--   e SEMPRE confira o resultado com um SELECT em `cron.job` depois de aplicar, porque
--   o modo de falha e o silencio.
--
-- SEGURANCA / COMPATIBILIDADE
--   So muda o horario. As funcoes chamadas (`notion_sync_paid_creatives_job` /
--   `notion_sync_organic_creatives_job`) seguem exatamente as mesmas, e continuam sendo
--   no-op seguro enquanto nenhum workspace tiver credencial `provider = 'notion'`.

SELECT cron.schedule(
  'notion-sync-paid-creatives',
  '0 12,16,22 * * *',
  'SELECT public.notion_sync_paid_creatives_job();'
);

SELECT cron.schedule(
  'notion-sync-organic-creatives',
  '0 12,16,22 * * *',
  'SELECT public.notion_sync_organic_creatives_job();'
);

-- Verificacao (rode depois de aplicar — o modo de falha aqui e silencioso):
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'notion%';
--   Esperado: ambos em '0 12,16,22 * * *' e active = true.
