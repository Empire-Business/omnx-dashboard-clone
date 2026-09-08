-- ═══════════════════════════════════════════════════════════════════════════════
-- FILA DE DISCAGEM — lead com hora marcada sai da fila, e um contato ocupa uma
-- posição só
--
-- Reportado pelo time de pré-vendas em 2026-08-26, três casos:
--   (a) "está aparecendo ali na discagem sendo que já está agendada" — timeline
--       com "Reunião agendada" e "Reunião de vendas agendada" em 25/08, e mesmo
--       assim na posição 2 da fila. Observação do time: "tá em chegada | é a 2ª".
--   (b) "já fez a reunião, está em perdido, mas consta na lista"
--   (c) "parece que ele tá batendo e voltando de rec pra 1º contato"
--
-- ─── LACUNA (a) e (b): ninguém olha agendamento desde 2026-06-28 ──────────────
-- A regra `AND o.data_agendamento_vendas IS NULL` foi criada em
-- 20260627100000_discagem_excluir_agendamento_vendas e **removida de propósito
-- no dia seguinte** por 20260628010000_discagem_fix_filtros, com justificativa
-- registrada no cabeçalho dela: o campo produzia falso-negativo — uma
-- oportunidade NOVA podia nascer já com o valor copiado do histórico pelo
-- webhook e sumia da fila sem motivo. A aposta feita na época foi que
-- `pipeline_name` bastaria ("se o lead foi pro pipeline Vendas SQL, o
-- pipeline_name muda lá").
--
-- Essa aposta pressupõe um contato = uma oportunidade, e o caso reportado é a
-- prova de que isso não vale: a lead agendada tem DUAS oportunidades abertas —
-- o agendamento está na de 'Auto Agendamento' e a fila exibia a outra, nova, em
-- estágio "Chegada" e legitimamente ainda em pré-vendas. Nenhum filtro por
-- linha resolveria, nem o original. Por isso o compromisso passa a ser avaliado
-- por CONTATO.
--
-- O redesenho de 2026-08-04 (20261014000000) não mexeu nisso — só manteve o
-- comportamento que já vinha de junho. O problema tem ~2 meses.
--
-- ─── QUAL SINAL FOI USADO (medido em produção, não escolhido no chute) ────────
-- Contagem sobre as 3.685 linhas da fila em 2026-08-26:
--     data_reuniao_agendada_ts .....  32 preenchidas
--     appointment_status ...........  21
--     data_agendamento_vendas ......  84
--     data_agendamento_reuniao ..... 103
--
-- A primeira versão desta correção usava SÓ o appointment sincronizado
-- (`data_reuniao_agendada_ts` + `appointment_status`), por ser "fato vindo da
-- API de appointments". Conferido contra o banco antes de aplicar: esse sinal
-- está praticamente vazio e NÃO pegaria nem o caso reportado — a lead agendada
-- tem `data_agendamento_reuniao`/`data_agendamento_vendas`/
-- `data_auto_agendamento` em 25/08 e `last_appointment_sync_at` NULL, ou seja, o
-- `sync-appointment-dates` nunca passou por ela. O sinal real disponível hoje é
-- a DATA DO AGENDAMENTO vinda do pipeline.
--
-- O falso-negativo que motivou a remoção em 2026-06-28 é neutralizado pela
-- JANELA DE TEMPO: o problema de junho era oportunidade nova nascer com a data
-- COPIADA DO HISTÓRICO — data velha, logo fora da janela de 14 dias, logo não
-- bloqueia. O campo volta a ser usado, mas só enquanto o compromisso é
-- plausivelmente real.
--
-- ─── O QUE ESTA MIGRATION FAZ ────────────────────────────────────────────────
--   1. CTE `compromissos`, agregada POR CONTATO: a pessoa tem hora marcada de
--      pé? a pessoa já fez a reunião?
--   2. Hora marcada de pé → fora de QUALQUER fila.
--   3. Reunião já realizada → fora da fila de PRÉ-VENDAS apenas. Recuperação
--      continua enxergando de propósito: quem fez reunião e não fechou é
--      exatamente a matéria-prima dela.
--   4. Deduplicação passa a ser por CONTATO, não por (contato, escopo) — corrige
--      (c). Pré-vendas vence o desempate.
--   5. Recalcula a fila na hora, sem esperar o cron de 5 minutos.
--
-- O que NÃO bloqueia, de propósito:
--   • no-show (`data_no_show`, `data_no_show_vendas`) e os status `cancelled` /
--     `canceled` / `noshow` / `invalid` — esses leads PRECISAM voltar à fila;
--     devolvê-los ao SDR é o trabalho. (As duas grafias de "cancelada" estão na
--     lista porque o GHL emite ambas.)
--   • agendamento com mais de 14 dias e sem desfecho — dado velho não pode
--     congelar um lead para sempre.
-- `rescheduled` continua bloqueando: remarcada ainda é hora marcada.
--
-- ─── IMPACTO MEDIDO ANTES DE APLICAR (produção, 2026-08-26) ──────────────────
--   fila atual ................ 1.580 pré-vendas + 2.105 recuperação
--   saem por agenda pendente ..     3 pré-vendas +     5 recuperação
--   saem por reunião já feita .    32 pré-vendas (recuperação mantém as 78 dela)
--   contatos em duas filas ....   110 (passam a ocupar uma só)
--
-- ─── IDEMPOTÊNCIA (modo "só produção", docs/DECISAO-SO-PRODUCAO-2026-07-18) ───
-- Só CREATE OR REPLACE de função. Nenhum DDL destrutivo, nenhuma linha perdida:
-- `discagem_scores` é 100% derivada e se reconstrói a cada execução.
-- Rollback = reaplicar a função de 20261014000000.
--
-- ─── CUSTO ───────────────────────────────────────────────────────────────────
-- `compromissos` é uma agregação por contato sobre `oportunidades` (~4.800
-- linhas), lida uma vez por execução, contra os ~400 ms do recálculo completo
-- num cron de 5 minutos. Desprezível.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalcular_discagem_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_temp explicitamente NO FIM: a função cria e lê uma tabela TEMP, e sem
-- listar pg_temp ele é pesquisado IMPLICITAMENTE PRIMEIRO — que é justamente
-- o vetor de sequestro de nomes em função SECURITY DEFINER. Listado por
-- último, a resolução de `_fila_nova` continua funcionando e `public` ganha
-- precedência.
SET search_path = public, pg_temp
AS $$
DECLARE
  _agora          TIMESTAMPTZ := now();
  _hoje_sp_inicio TIMESTAMPTZ;
  _hoje_sp_fim    TIMESTAMPTZ;
BEGIN
  _hoje_sp_inicio := date_trunc('day', _agora AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  _hoje_sp_fim    := _hoje_sp_inicio + INTERVAL '1 day' - INTERVAL '1 microsecond';

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ETAPA 1 — Montar a fila desejada numa tabela temporária.
  --
  -- Por que reconstruir em vez de DELETE+UPSERT como antes: no desenho antigo,
  -- o DELETE de "já ligou hoje" era anulado pelo INSERT do mesmo run, porque a
  -- condição existia só no DELETE e não no WHERE do INSERT. Medido: 5 leads na
  -- fila hoje já tinham recebido ligação outbound hoje.
  -- Reconstruir a partir de uma fonte única elimina essa classe de bug: o que
  -- não entra no temp não existe na fila, ponto.
  -- ═══════════════════════════════════════════════════════════════════════════

  DROP TABLE IF EXISTS _fila_nova;

  CREATE TEMP TABLE _fila_nova ON COMMIT DROP AS
  WITH
  -- ═══════════════════════════════════════════════════════════════════════════
  -- CORREÇÃO 2026-08-26 — compromisso de agenda, avaliado POR CONTATO.
  --
  -- Lacuna: desde 2026-06-28 NADA na fila olha para agendamento. A regra
  -- `o.data_agendamento_vendas IS NULL` foi criada em 20260627100000 e removida
  -- de propósito no dia seguinte por 20260628010000, com justificativa
  -- registrada: o campo dava falso-negativo (oportunidade NOVA nascia com o
  -- valor do histórico copiado pelo webhook e sumia da fila sem motivo). A
  -- aposta feita ali foi que `pipeline_name` bastaria — o que pressupõe um
  -- contato = uma oportunidade.
  --
  -- Essa aposta não se sustenta, e o caso reportado é a prova: a fila é montada
  -- por oportunidade e depois deduplicada, ficando com a MAIS RECENTE. A lead
  -- agendada tinha DUAS oportunidades abertas — o agendamento na de
  -- 'Auto Agendamento' e a fila exibindo a outra. Todo filtro por linha,
  -- inclusive o original, passaria batido. Por isso o compromisso é avaliado por
  -- CONTATO: se a PESSOA tem hora marcada, a PESSOA sai da fila.
  --
  -- QUAL SINAL — medido em produção antes de escolher (2026-08-26, 3.685 linhas
  -- na fila):
  --     data_reuniao_agendada_ts .....  32 preenchidas
  --     appointment_status ...........  21
  --     data_agendamento_vendas ......  84
  --     data_agendamento_reuniao ..... 103
  -- Uma primeira versão desta correção usava SÓ o appointment sincronizado
  -- (`data_reuniao_agendada_ts`/`appointment_status`) por ser "fato vindo da
  -- API". Verificado contra o banco: esse sinal está praticamente vazio e NÃO
  -- pegaria nem o caso reportado — a lead agendada tem
  -- `data_agendamento_reuniao`/`data_agendamento_vendas` preenchidas e
  -- `last_appointment_sync_at` NULL, ou seja, o `sync-appointment-dates` nunca
  -- passou por ela. O sinal real disponível hoje é a DATA DO AGENDAMENTO vinda
  -- do pipeline.
  --
  -- COMO O FALSO-NEGATIVO DE 2026-06-28 É NEUTRALIZADO: pela JANELA DE TEMPO.
  -- O problema de junho era oportunidade nova nascer com a data COPIADA DO
  -- HISTÓRICO — data velha, portanto fora da janela de 14 dias, portanto não
  -- bloqueia. O campo volta a ser usado, mas só enquanto o compromisso é
  -- plausivelmente real.
  --
  -- Impacto medido antes de aplicar: 3 linhas saem de pré-vendas e 5 de
  -- recuperação por agenda pendente; 32 saem de pré-vendas por reunião já feita
  -- (recuperação mantém as 78 dela, por design); 110 contatos deixam de ocupar
  -- duas filas ao mesmo tempo.
  -- ═══════════════════════════════════════════════════════════════════════════
  compromissos AS (
    SELECT
      o2.contato_id,

      -- HORA MARCADA E AINDA DE PÉ.
      bool_or(
        o2.status = 'open'

        -- Existe agendamento registrado por qualquer um dos caminhos. Os quatro
        -- campos são preenchidos por rotas diferentes (pipeline, auto
        -- agendamento, sync de appointments) e nem sempre juntos.
        AND COALESCE(o2.data_reuniao_agendada, o2.data_agendamento_reuniao,
                     o2.data_agendamento_vendas, o2.data_auto_agendamento) IS NOT NULL

        -- E o compromisso ainda não teve desfecho. No-show encerra o bloqueio:
        -- esse lead PRECISA voltar a ser discado, é justamente o trabalho do
        -- SDR. Reunião realizada também encerra, e é tratada logo abaixo por
        -- `ja_fez_reuniao`.
        AND o2.data_no_show IS NULL
        AND o2.data_no_show_vendas IS NULL
        AND o2.data_reuniao_realizada IS NULL
        AND o2.data_realizacao_vendas IS NULL
        -- 'canceled' com um L só está na lista porque o GHL emite as duas
        -- grafias (ver docs/SYNC-APPOINTMENT-DATES.md).
        -- 'rescheduled' NÃO está: remarcada ainda é hora marcada.
        AND COALESCE(o2.appointment_status, '')
            NOT IN ('cancelled', 'canceled', 'noshow', 'invalid')

        AND (
          -- Caminho preciso: o instante da reunião veio do sync de appointments.
          -- Bloqueia até 2h depois dela — durante a reunião ninguém deve discar,
          -- e passada a hora sem desfecho o lead volta sozinho à fila, que é o
          -- certo para quem não apareceu.
          (o2.data_reuniao_agendada_ts IS NOT NULL
           AND o2.data_reuniao_agendada_ts >= (_agora - INTERVAL '2 hours'))

          -- Caminho comum: só a DATA do agendamento, sem hora. Sem hora não dá
          -- para saber quando a reunião ocorre, então vale uma janela de 14
          -- dias — tempo de sobra entre marcar e realizar, e curto o bastante
          -- para que um agendamento velho e sem desfecho não congele o lead
          -- para sempre. É esta janela que neutraliza o falso-negativo de
          -- 2026-06-28.
          OR (o2.data_reuniao_agendada_ts IS NULL
              AND COALESCE(o2.data_reuniao_agendada, o2.data_agendamento_reuniao,
                           o2.data_agendamento_vendas, o2.data_auto_agendamento)
                  >= ((_agora AT TIME ZONE 'America/Sao_Paulo')::date - 14))
        )
      ) AS tem_agenda_pendente,

      -- REUNIÃO QUE JÁ ACONTECEU. Fato consumado, independente do status atual
      -- da oportunidade — é o caso do lead que "já fez a reunião, está em
      -- perdido, mas consta na lista".
      bool_or(
        o2.data_reuniao_realizada IS NOT NULL
        OR o2.data_realizacao_vendas IS NOT NULL
        OR COALESCE(o2.appointment_status, '') IN ('showed', 'completed')
      ) AS ja_fez_reuniao

    FROM oportunidades o2
    GROUP BY o2.contato_id
  ),

  elegiveis AS (
    SELECT
      o.id            AS oportunidade_id,
      o.contato_id,
      ct.workspace_id,
      o.data_lead_recebido,
      COALESCE(o.sdr_name, ct.owner_name)                     AS sdr_name,
      lower(COALESCE(ct.tags, ''))                            AS tags,
      CASE WHEN o.pipeline_name = 'Recuperação'
           THEN 'recuperacao' ELSE 'pre_vendas' END           AS escopo
    FROM oportunidades o
    JOIN contatos ct ON ct.id = o.contato_id
    WHERE o.status = 'open'
      AND o.pipeline_id IS NOT NULL
      AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento', 'Recuperação')
      AND ct.workspace_id IS NOT NULL

      -- CORREÇÃO (defeito 10): lead sem telefone não pode ocupar posição numa
      -- FILA DE DISCAGEM — não há o que discar. Medido: 95 linhas.
      AND ct.telefone IS NOT NULL
      AND btrim(ct.telefone) <> ''

      -- CORREÇÃO: tags de bloqueio explícito. O SDR foi instruído a não
      -- contatar, mas o lead continuava na fila. Medido: 88 linhas.
      AND NOT (lower(COALESCE(ct.tags, '')) ~ '(^|,)\s*(bloquear|stop bot|descartado|nao perturbe)\s*(,|$)')

      -- CORREÇÃO: "status = open" NÃO garante que o lead ainda é prospect. A
      -- regra de negócio do projeto é que venda fechada =
      -- vendas_fechamento.data_pagamento_entrada preenchida (ver CLAUDE.md).
      -- Medido: 1 lead que JÁ PAGOU continuava sendo discado.
      AND NOT EXISTS (
        SELECT 1 FROM vendas_fechamento vf
        WHERE vf.oportunidade_id = o.id
          AND vf.data_pagamento_entrada IS NOT NULL
      )

      -- CORREÇÃO 2026-08-26: hora marcada de pé → fora de QUALQUER fila.
      AND NOT EXISTS (
        SELECT 1 FROM compromissos cm
        WHERE cm.contato_id = o.contato_id
          AND cm.tem_agenda_pendente
      )
  ),

  -- Métricas de histórico COMPLETO por contato. É aqui que mora a diferença
  -- em relação ao desenho antigo, que só olhava 14 dias e por isso enxergava
  -- zero em praticamente toda a fila.
  metricas AS (
    SELECT
      e.*,
      hist.last_out_ever,
      hist.last_inb_ever,
      hist.toques_ever,
      hist.calls_14d,
      tk.task_title,
      tk.task_due
    FROM elegiveis e

    LEFT JOIN LATERAL (
      SELECT
        MAX(c.data_comunicacao) FILTER (
          WHERE c.direction = 'outbound' AND c.ghl_source = 'app'
            AND c.channel IN ('call','whatsapp','sms')
        )                                                     AS last_out_ever,
        MAX(c.data_comunicacao) FILTER (
          WHERE c.direction = 'inbound'
        )                                                     AS last_inb_ever,
        COUNT(*) FILTER (
          WHERE c.direction = 'outbound' AND c.ghl_source = 'app'
            AND c.channel IN ('call','whatsapp','sms')
        )::INTEGER                                            AS toques_ever,
        -- Mantido em 14 dias de propósito: este é o guarda-corpo anti-assédio,
        -- não um componente de ordenação.
        COUNT(*) FILTER (
          WHERE c.direction = 'outbound' AND c.ghl_source = 'app'
            AND c.channel = 'call'
            AND c.data_comunicacao > (_agora - INTERVAL '14 days')
        )::INTEGER                                            AS calls_14d
      FROM comunicacoes c
      WHERE c.contato_id = e.contato_id
    ) hist ON true

    LEFT JOIN LATERAL (
      SELECT t.title AS task_title, t.due_date AS task_due
      FROM ghl_tasks t
      WHERE t.contato_id = e.contato_id
        AND t.completed = false
        -- CORREÇÃO DE PERFORMANCE (medida): a forma antiga
        --   (t.deleted = false OR t.deleted IS NULL)
        -- impedia o planner de usar o índice parcial existente
        -- ghl_tasks_contato_id_idx (WHERE NOT completed AND NOT deleted),
        -- porque ele não consegue provar a implicação através do OR. O plano
        -- caía em Bitmap Heap Scan por workspace_id (ou Seq Scan) repetido
        -- ~4.000 vezes. `ghl_tasks.deleted` é NOT NULL no schema e tem 0 linhas
        -- NULL em produção (691 linhas verificadas), então o OR era código
        -- morto que só custava caro.
        -- Medido: 410 ms / 119.345 buffers  →  90 ms / 13.017 buffers.
        AND t.deleted = false
        AND t.due_date <= _hoje_sp_fim
        AND t.due_date >= (_agora - INTERVAL '48 hours')
        AND t.workspace_id = e.workspace_id   -- isolamento explícito de tenant
        AND (
          LOWER(t.title) ~ '(ligar|call|chamar|respondeu|contato|retorno|marcar)'
        )
      ORDER BY t.due_date ASC
      LIMIT 1
    ) tk ON true

    WHERE hist.calls_14d < 7   -- teto de fadiga (inalterado)

      -- CORREÇÃO 2026-08-26: reunião já REALIZADA encerra o trabalho de
      -- pré-vendas para aquele contato. Deliberadamente NÃO se aplica ao escopo
      -- de recuperação: lead que fez reunião e não fechou é precisamente quem a
      -- fila de Recuperação existe para resgatar (medido: 78 dos 110 casos).
      AND NOT (
        e.escopo = 'pre_vendas'
        AND EXISTS (
          SELECT 1 FROM compromissos cm
          WHERE cm.contato_id = e.contato_id
            AND cm.ja_fez_reuniao
        )
      )

      -- CORREÇÃO (defeito 1): quem já recebeu ligação HOJE sai da fila e — o
      -- ponto que faltava — não é reinserido, porque a condição agora está no
      -- WHERE da própria construção da fila, não num DELETE separado.
      AND NOT EXISTS (
        SELECT 1 FROM comunicacoes c2
        WHERE c2.contato_id = e.contato_id
          AND c2.channel = 'call'
          AND c2.direction = 'outbound'
          AND c2.ghl_source = 'app'
          AND c2.data_comunicacao >= _hoje_sp_inicio
          AND c2.data_comunicacao <= _hoje_sp_fim
      )
  ),

  -- Grandezas derivadas, todas em DIAS e todas com piso zero.
  --
  -- ⚠ ARMADILHA CORRIGIDA: a versão anterior escrevia
  --     COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (_agora - x))) / 86400, 99999)
  -- na expectativa de que `x IS NULL` caísse no default 99999. Não cai:
  -- no PostgreSQL, GREATEST/LEAST IGNORAM NULLs e só retornam NULL se TODOS os
  -- argumentos forem NULL — logo GREATEST(0, NULL) = 0 e o COALESCE nunca
  -- dispara (verificado em produção). O default virava 0, ou seja, o oposto
  -- exato da intenção: "nunca tocado" era lido como "tocado agora mesmo".
  -- Medido nesta fila: 764 linhas sem toque, 2.192 sem inbound e 6 sem
  -- data_lead_recebido pegavam o valor errado (o impacto de score se
  -- materializava em comp_frescor, que dava 1000 a lead sem data de entrada).
  -- Forma correta: testar o NULL explicitamente ANTES de aplicar o piso.
  --
  -- O GREATEST(0, ...) no tempo decorrido continua sendo a correção do defeito
  -- 3: uma data_lead_recebido no futuro produzia tempo decorrido NEGATIVO e,
  -- com isso, score acima do teto da faixa, cravando o lead no topo para sempre.
  derivadas AS (
    SELECT m.*,
      COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (_agora - m.data_lead_recebido))), 0) AS seg_desde_chegada,
      COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (_agora - m.last_inb_ever))), 0)      AS seg_desde_inbound,

      CASE WHEN m.last_out_ever IS NULL THEN 99999::NUMERIC
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (_agora - m.last_out_ever)) / 86400)
      END                                                                            AS dias_desde_toque,

      CASE WHEN m.last_inb_ever IS NULL THEN 99999::NUMERIC
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (_agora - m.last_inb_ever)) / 86400)
      END                                                                            AS dias_desde_inbound,

      CASE WHEN m.data_lead_recebido IS NULL THEN 365::NUMERIC
           ELSE GREATEST(0, EXTRACT(EPOCH FROM (_agora - m.data_lead_recebido)) / 86400)
      END                                                                            AS dias_idade,

      COALESCE(GREATEST(0, EXTRACT(EPOCH FROM (_agora - m.task_due))), 0)            AS seg_task_vencida
    FROM metricas m
  ),

  camadas AS (
    SELECT d.*,
      CASE
        WHEN d.task_title IS NOT NULL THEN 'horario_marcado'

        -- CORREÇÃO (defeito 5): janela única de 24h para "respondeu".
        -- Antes: a camada usava 4h, o componente de score usava 24h e a doc
        -- dizia 2h — três verdades diferentes para a mesma pergunta. 24h é o
        -- valor escolhido porque a própria faixa já decai ao longo do dia,
        -- então não há necessidade de um corte duro mais curto.
        WHEN d.last_inb_ever IS NOT NULL
         AND d.dias_desde_inbound <= 1
         AND (d.last_out_ever IS NULL OR d.last_out_ever < d.last_inb_ever)
          THEN 'respondeu'

        WHEN d.data_lead_recebido IS NOT NULL
         AND d.data_lead_recebido >= _hoje_sp_inicio
         AND d.data_lead_recebido <= _hoje_sp_fim
          THEN 'lead_novo'

        ELSE 'cadencia'
      END AS camada
    FROM derivadas d
  ),

  -- ═══════════════════════════════════════════════════════════════════════════
  -- COMPONENTES DO SCORE DE CADÊNCIA (cada um 0–1000)
  --
  -- Pesos escolhidos a partir da distribuição REAL medida em produção, não por
  -- intuição. A pergunta que a cadência responde é: "entre milhares de leads
  -- frios, quem tem maior chance de atender e avançar AGORA?"
  -- ═══════════════════════════════════════════════════════════════════════════
  componentes AS (
    SELECT c.*,

      -- [30%] SINAL DE ENGAJAMENTO — a pessoa já respondeu ALGUMA VEZ?
      -- Medido: 1.781 das 3.973 linhas elegíveis já responderam em algum
      -- momento. No desenho antigo esse sinal valia 0 para 100% da cadência,
      -- porque só olhava 24h. É o discriminador mais forte disponível: quem já
      -- falou com você uma vez atende de novo.
      -- Decai com o tempo, mas nunca abaixo de 300 — já ter respondido nunca
      -- deixa de valer mais do que nunca ter respondido (0).
      CASE
        WHEN c.last_inb_ever IS NOT NULL
          THEN GREATEST(300, 1000 - (c.dias_desde_inbound * 5)::INTEGER)
        ELSE 0
      END AS comp_sinal,

      -- [25%] PAUSA RESPEITADA — já passou tempo suficiente desde o último toque?
      -- Medido: 764 leads NUNCA foram tocados. Esses são o maior ativo
      -- desperdiçado da base e vão para o topo (1000).
      -- Na outra ponta, quem foi tocado há menos de 2 dias vai a 0: ligar de
      -- novo tão cedo queima o lead. Isso substitui o antigo "engajamento_canal",
      -- que premiava QUANTIDADE de toques recentes — exatamente o contrário do
      -- que uma cadência saudável quer.
      CASE
        WHEN c.last_out_ever IS NULL      THEN 1000   -- nunca tocado
        WHEN c.dias_desde_toque <  2      THEN    0   -- acabou de ser tocado
        WHEN c.dias_desde_toque <  4      THEN  250
        WHEN c.dias_desde_toque <  8      THEN  550
        WHEN c.dias_desde_toque < 21      THEN  800
        ELSE                                   1000   -- follow-up vencido
      END AS comp_pausa,

      -- [20%] FADIGA — quantas vezes já insistimos, em TODA a história.
      -- O desenho antigo contava só 14 dias e via 0 em praticamente toda a
      -- fila, tornando o componente inerte.
      GREATEST(0, 1000 - c.toques_ever * 125) AS comp_fadiga,

      -- [15%] QUALIFICAÇÃO — agora em degraus, não binário.
      -- O desenho antigo era 1000 (tag mql) ou 300 (resto), e como todo o resto
      -- valia 0, ESSE componente sozinho definia a fila inteira — daí os dois
      -- únicos scores 200 e 95.
      -- Nota sobre o "defeito 6" (regex derrubando tags compostas): investigado
      -- e essencialmente inexistente — os casos suspeitos eram "nmql"/
      -- "nqualificado", que NÃO são MQL. O regex de token exato está correto e
      -- foi mantido de propósito; trocar por LIKE '%mql%' promoveria centenas
      -- de leads nMQL por engano.
      -- Nota de semântica: a ordem dos degraus é intencional — a tag mais
      -- FORTE encontrada vence. Um lead 'nmql,conectado' pontua 500 (conectado)
      -- e não 100, porque já houve conexão real, que é informação mais recente
      -- e mais acionável do que a desqualificação de marketing.
      CASE
        WHEN c.tags ~ '(^|,)\s*sql\s*(,|$)'                    THEN 1000
        WHEN c.tags ~ '(^|,)\s*(mql|qualificado)\s*(,|$)'      THEN  750
        WHEN c.tags ~ '(^|,)\s*conectado\s*(,|$)'              THEN  500
        WHEN c.tags ~ '(^|,)\s*(nmql|nqualificado)\s*(,|$)'    THEN  100
        ELSE                                                        250
      END AS comp_qualificacao,

      -- [10%] FRESCOR — idade do lead na base.
      -- Medido: idade mediana de ~162 dias. Peso deliberadamente baixo: numa
      -- base majoritariamente antiga, idade sozinha não decide nada, mas serve
      -- como desempate útil entre leads equivalentes.
      GREATEST(0, 1000 - (c.dias_idade * 5)::INTEGER) AS comp_frescor

    FROM camadas c
  ),

  final AS (
    SELECT cp.*,
      CASE cp.camada
        -- ── 900–1000: compromisso explícito ──────────────────────────────────
        -- Quanto mais vencida a task, mais urgente. Teto duro em 1000.
        WHEN 'horario_marcado' THEN
          LEAST(1000, GREATEST(900, 900 + (cp.seg_task_vencida / 3600)::INTEGER * 5))

        -- ── 800–899: respondeu e ninguém retornou ────────────────────────────
        -- Decai 899 → 800 ao longo das 24h da janela.
        WHEN 'respondeu' THEN
          LEAST(899, GREATEST(800, 899 - (cp.seg_desde_inbound / 864)::INTEGER))

        -- ── 600–799: chegou hoje, ordem estritamente cronológica ─────────────
        -- Mantida a decisão de negócio do desenho anterior: dentro de
        -- "chegou hoje", SÓ o horário de chegada ordena. Nenhum outro
        -- componente entra, para que o lead que acabou de cair vá ao topo.
        -- 200 pontos distribuídos nas 24h do dia (86400/200 = 432 s por ponto).
        WHEN 'lead_novo' THEN
          LEAST(799, GREATEST(600, 799 - (cp.seg_desde_chegada / 432)::INTEGER))

        -- ── 0–599: cadência composta ─────────────────────────────────────────
        -- Média ponderada 0–1000 comprimida na faixa 0–599 (× 0,599), para
        -- que nenhum lead de cadência jamais ultrapasse um lead que chegou hoje.
        ELSE
          LEAST(599, GREATEST(0, ROUND((
              cp.comp_sinal        * 0.30
            + cp.comp_pausa        * 0.25
            + cp.comp_fadiga       * 0.20
            + cp.comp_qualificacao * 0.15
            + cp.comp_frescor      * 0.10
          ) * 0.599)::INTEGER))
      END AS score
    FROM componentes cp
  )

  -- CORREÇÃO (2026-08-04): um contato com 2 oportunidades abertas aparecia 2x
  -- na fila. Medido na época: 285 linhas excedentes. O DISTINCT ON resolve
  -- mantendo a oportunidade mais recente, com o maior score como desempate.
  --
  -- CORREÇÃO 2026-08-26: a chave era (contato, escopo), então um contato com
  -- uma oportunidade em 'Recuperação' e outra em 'Pré-Vendas MQL' entrava nas
  -- DUAS filas ao mesmo tempo. Medido em produção: 110 contatos nessa situação.
  -- Como o recálculo roda a cada 5 min e cada tela lê um escopo, duas pessoas
  -- diferentes podiam ligar para o mesmo lead no mesmo dia. Agora a chave é só
  -- o CONTATO: uma pessoa ocupa exatamente uma posição, em uma única fila.
  -- Pré-vendas ganha o desempate porque oportunidade ativa ali significa que o
  -- lead ainda está no fluxo principal; recuperação é para os dormentes.
  SELECT DISTINCT ON (f.contato_id)
    f.oportunidade_id, f.contato_id, f.workspace_id, f.escopo, f.sdr_name,
    f.score, f.camada, f.toques_ever, f.calls_14d,
    f.comp_sinal, f.comp_pausa, f.comp_fadiga, f.comp_qualificacao, f.comp_frescor,
    f.task_title, f.last_inb_ever, f.last_out_ever, f.data_lead_recebido,
    f.dias_desde_toque, f.dias_desde_inbound, f.dias_idade, f.seg_desde_chegada
  FROM final f
  ORDER BY f.contato_id,
           (f.escopo = 'pre_vendas') DESC,
           f.data_lead_recebido DESC NULLS LAST,
           f.score DESC,
           f.oportunidade_id;

  -- Seguro: `escopo` é função determinística de `pipeline_name`, então uma
  -- oportunidade produz no máximo uma linha e a unicidade nunca colide.
  CREATE UNIQUE INDEX ON _fila_nova (oportunidade_id);
  ANALYZE _fila_nova;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- ETAPA 2 — Sincronizar a tabela real com a fila desejada.
  -- Tudo que não está no temp sai. Isso cobre de uma vez: leads fechados,
  -- pagos, sem telefone, bloqueados, já ligados hoje, duplicados, órfãos e —
  -- correção adicional — linhas com status NULL, que o antigo
  -- "WHERE o.status != 'open'" nunca removia (NULL != 'open' é NULL, não TRUE),
  -- deixando linhas fantasmas presas na fila para sempre.
  -- ═══════════════════════════════════════════════════════════════════════════

  DELETE FROM discagem_scores ds
  WHERE NOT EXISTS (SELECT 1 FROM _fila_nova f WHERE f.oportunidade_id = ds.oportunidade_id);

  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, workspace_id, escopo, sdr_name, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte, score_qualificacao,
    camada, numero_tentativa, canal_sugerido,
    data_entrada_lead, data_retorno_previsto, updated_at
  )
  SELECT
    f.oportunidade_id, f.contato_id, f.workspace_id, f.escopo, f.sdr_name, f.score,

    CASE f.camada
      WHEN 'horario_marcado' THEN 'ligue_agora'
      WHEN 'respondeu'       THEN 'ligue_agora'
      WHEN 'lead_novo'       THEN 'ligue_hoje'
      ELSE 'mensagem'
    END,

    -- Razão legível. Na cadência ela agora EXPLICA a posição — antes dizia
    -- sempre "Tentativa 1 — ligue agora" para milhares de leads, porque o
    -- contador de 14 dias era 0 em praticamente todos.
    CASE f.camada
      WHEN 'horario_marcado' THEN f.task_title
      WHEN 'respondeu' THEN
        CASE WHEN f.dias_desde_inbound < 0.021
          THEN 'Respondeu há ' || GREATEST(1, ROUND(f.dias_desde_inbound * 1440))::TEXT || ' min'
          ELSE 'Respondeu há ' || ROUND(f.dias_desde_inbound * 24, 1)::TEXT || 'h'
        END
      WHEN 'lead_novo' THEN
        'Novo hoje · chegou há ' || GREATEST(1, ROUND(f.seg_desde_chegada / 60))::TEXT || ' min'
      ELSE
        CASE
          WHEN f.last_out_ever IS NULL AND f.last_inb_ever IS NOT NULL
            THEN 'Respondeu e nunca foi ligado'
          WHEN f.last_out_ever IS NULL
            -- usa dias_idade (e não seg_desde_chegada) porque este é o caminho
            -- que pode ter data_lead_recebido NULL; dias_idade tem default 365.
            THEN 'Nunca contatado · ' || ROUND(f.dias_idade)::TEXT || 'd na base'
          WHEN f.last_inb_ever IS NOT NULL
            THEN 'Já respondeu · ' || f.toques_ever::TEXT || ' toques · último há '
                 || ROUND(f.dias_desde_toque)::TEXT || 'd'
          ELSE f.toques_ever::TEXT || ' toques · último há '
               || ROUND(f.dias_desde_toque)::TEXT || 'd'
        END
    END,

    -- componente_dom: qual componente explica a posição do lead. comp_frescor
    -- entra na comparação (a versão anterior o omitia, então um lead cuja
    -- posição vinha do frescor era rotulado como "tentativas" sem motivo).
    CASE
      WHEN f.camada IN ('horario_marcado', 'lead_novo') THEN 'urgencia'
      WHEN f.comp_sinal >= GREATEST(f.comp_pausa, f.comp_qualificacao, f.comp_fadiga, f.comp_frescor) THEN 'sinal_quente'
      WHEN f.comp_pausa >= GREATEST(f.comp_qualificacao, f.comp_fadiga, f.comp_frescor) THEN 'urgencia'
      ELSE 'tentativas'
    END,

    f.comp_sinal, f.comp_pausa, f.comp_fadiga, f.comp_frescor, f.comp_qualificacao,
    f.camada,

    -- numero_tentativa passa a ser o total histórico, não a contagem de 14 dias.
    -- É o número que o SDR realmente quer ver ("é a 5ª vez que tentamos").
    f.toques_ever,

    -- Canal sugerido também passa a olhar o histórico completo: com o contador
    -- de 14 dias, praticamente toda a fila caía em 'call' independentemente de
    -- quantas ligações sem resposta o lead já tinha acumulado.
    CASE
      WHEN f.toques_ever <= 2 THEN 'call'
      WHEN f.toques_ever <= 5 THEN 'whatsapp'
      ELSE 'sms'
    END,

    f.data_lead_recebido,
    NULL::TIMESTAMPTZ,
    _agora
  FROM _fila_nova f

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id         = EXCLUDED.contato_id,
    workspace_id       = EXCLUDED.workspace_id,
    escopo             = EXCLUDED.escopo,
    sdr_name           = EXCLUDED.sdr_name,
    score              = EXCLUDED.score,
    estado             = EXCLUDED.estado,
    razao              = EXCLUDED.razao,
    componente_dom     = EXCLUDED.componente_dom,
    score_sinal        = EXCLUDED.score_sinal,
    score_urgencia     = EXCLUDED.score_urgencia,
    score_tentativas   = EXCLUDED.score_tentativas,
    score_fonte        = EXCLUDED.score_fonte,
    score_qualificacao = EXCLUDED.score_qualificacao,
    camada             = EXCLUDED.camada,
    numero_tentativa   = EXCLUDED.numero_tentativa,
    canal_sugerido     = EXCLUDED.canal_sugerido,
    data_entrada_lead  = EXCLUDED.data_entrada_lead,
    updated_at         = EXCLUDED.updated_at;
    -- data_retorno_combinado NÃO é tocada: é entrada manual do SDR e o
    -- recálculo nunca deve sobrescrevê-la.

  DROP TABLE IF EXISTS _fila_nova;
END;
$$;

-- Reafirma o intent service_role-only (CREATE OR REPLACE preserva o ACL, mas
-- declarar aqui torna a migration autossuficiente).
REVOKE ALL ON FUNCTION public.recalcular_discagem_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_discagem_scores() TO service_role;

-- Aplica a correção imediatamente, em vez de esperar o cron
-- `recalcular-discagem-scores` (jobid 62). A fila é derivada: reconstruí-la
-- agora é seguro e idempotente.
SELECT public.recalcular_discagem_scores();

NOTIFY pgrst, 'reload schema';
