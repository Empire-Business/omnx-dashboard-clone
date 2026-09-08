-- ═══════════════════════════════════════════════════════════════════════════════
-- REDESENHO DA FILA DE DISCAGEM — precisão e correspondência com a realidade
--
-- Diagnóstico medido em produção (qzesffnkqgelmtfblzkr, 2026-08-04):
--   • 4.166 linhas na fila; 3.357 com score EXATAMENTE 200 e 721 com EXATAMENTE
--     95 → 97,9% da fila com DOIS valores distintos, ordem efetivamente
--     arbitrária. Só 40 scores distintos no total.
--   • Causa raiz: TODOS os componentes do score de cadência eram cegos.
--       - sinal_resposta: janela de 24h  → 0 em praticamente toda a fila
--       - recencia:       janela de 24h  → idem
--       - engajamento e fadiga: contavam toques dos ÚLTIMOS 14 DIAS, mas o lead
--         mediano da fila tem ~162 dias de idade → contagem 0.
--     Sobrava só qualificacao_mql (1000 ou 300) → score 200 ou 95. Fim.
--   • O sinal existe, só não estava sendo lido: 764 leads NUNCA foram tocados,
--     1.781 já responderam alguma vez, e os toques históricos se distribuem bem.
--
-- Estratégia: trocar as janelas curtas (4h/24h/14d) por métricas de HISTÓRICO
-- COMPLETO (dias desde o último toque, toques de todos os tempos, já respondeu
-- alguma vez), que é onde a informação realmente está.
--
-- Resultado simulado em produção (read-only, mesma fotografia):
--   367 scores distintos (vs 40), sendo 349 só na camada cadência (vs 2).
--   Distribuição em curva, sem empilhamento no teto da faixa.
--
-- Faixas de score (bandas separadas — nunca competem entre si):
--   horario_marcado  900–1000  compromisso explícito (task GHL ou retorno combinado)
--   respondeu        800– 899  respondeu e ainda não foi retornado
--   lead_novo        600– 799  chegou hoje (ordem estritamente cronológica)
--   cadencia           0– 599  composto — agora com poder de discriminação real
--
-- Custo: a função roda no cron `recalcular-discagem-scores` (jobid 62), a cada
-- 5 minutos. Medição em produção com EXPLAIN (ANALYZE) — ver seção "CUSTO" no
-- rodapé desta migration.
--
-- Idempotência (modo "só produção", docs/DECISAO-SO-PRODUCAO-2026-07-18.md):
-- toda a DDL abaixo é IF NOT EXISTS / CREATE OR REPLACE; nenhuma linha de dado
-- é destruída de forma irreversível (a fila é 100% derivada e reconstruída a
-- cada 5 min).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── DDL idempotente ───────────────────────────────────────────────────────────
-- sdr_name materializado na fila permite filtrar por SDR NO SERVIDOR.
-- Nota honesta: o frontend (useDiscagemScore.ts) JÁ pagina com .range() e já
-- aplica o filtro de SDR sobre a fila completa, então isto NÃO conserta um bug
-- aberto — é habilitador para o filtro server-side e para relatórios por SDR.
-- A coluna é aditiva e nullable: nenhuma leitura existente quebra.
ALTER TABLE discagem_scores ADD COLUMN IF NOT EXISTS sdr_name TEXT;

CREATE INDEX IF NOT EXISTS idx_discagem_scores_ws_escopo_sdr_score
  ON discagem_scores (workspace_id, escopo, sdr_name, score DESC);

-- NOTA SOBRE ÍNDICE EM `comunicacoes` (decisão deliberada de NÃO criar):
-- Uma versão anterior desta migration criava
--   idx_comunicacoes_contato_dir_src_data (contato_id, direction, ghl_source,
--                                          data_comunicacao DESC)
-- "para suportar as agregações do recálculo". Medido: esse índice NÃO ajuda.
-- A agregação também filtra por `channel`, que não está no índice, logo o
-- PostgreSQL continua indo ao heap exatamente como já faz pelo
-- idx_comunicacoes_contato_id existente — o índice novo seria só amplificação
-- de escrita (226.702 linhas) na tabela de ingestão mais quente do sistema.
-- O índice que de fato serviria seria COBRINDO:
--   (contato_id) INCLUDE (direction, ghl_source, channel, data_comunicacao)
-- Ele não é criado aqui porque, depois da correção de `ghl_tasks` abaixo, o
-- recálculo inteiro cai para ~400 ms num cron de 5 minutos — não há pressão
-- que justifique pagar escrita extra na `comunicacoes`. Fica registrado como
-- opção caso a fila cresça uma ordem de grandeza.


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
  WITH elegiveis AS (
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

  -- CORREÇÃO: um contato com 2 oportunidades abertas aparecia 2x na fila.
  -- Medido: 285 linhas excedentes por (contato, escopo) repetido.
  -- DISTINCT ON mantém uma linha por (contato, escopo) — a oportunidade mais
  -- recente, com o maior score como desempate. O escopo entra na chave porque
  -- pré-vendas e recuperação são filas operacionalmente distintas, atendidas
  -- por pessoas diferentes.
  SELECT DISTINCT ON (f.contato_id, f.escopo)
    f.oportunidade_id, f.contato_id, f.workspace_id, f.escopo, f.sdr_name,
    f.score, f.camada, f.toques_ever, f.calls_14d,
    f.comp_sinal, f.comp_pausa, f.comp_fadiga, f.comp_qualificacao, f.comp_frescor,
    f.task_title, f.last_inb_ever, f.last_out_ever, f.data_lead_recebido,
    f.dias_desde_toque, f.dias_desde_inbound, f.dias_idade, f.seg_desde_chegada
  FROM final f
  ORDER BY f.contato_id, f.escopo, f.data_lead_recebido DESC NULLS LAST, f.score DESC, f.oportunidade_id;

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

-- Reafirma o intent service_role-only já vigente em produção (proacl atual:
-- postgres, service_role). CREATE OR REPLACE preserva o ACL, mas declarar aqui
-- torna a migration autossuficiente e imune ao GRANT global do baseline
-- (ver 20260921000000_revoke_internal_security_definer.sql).
REVOKE ALL ON FUNCTION public.recalcular_discagem_scores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_discagem_scores() TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════════
-- buscar_reengajamento — a RPC está 100% quebrada em produção.
-- Faz SELECT de "c.body", mas a coluna em comunicacoes chama "mensagem_body"
-- (confirmado por introspecção: pg_get_functiondef contém 'c.body' e não contém
-- 'mensagem_body'; information_schema.columns não tem 'body' em comunicacoes).
-- Toda chamada levanta erro; o frontend engole (if (rErr) return), então o
-- bloco "Reengajar" NUNCA apareceu desde que foi escrito.
-- Correções adicionais aplicadas junto:
--   • pipeline 'Recuperação' incluída (o escopo existe na UI e era ignorado);
--   • numero_tentativa >= 6 trocado por >= 8, porque numero_tentativa agora
--     conta toques históricos, não ligações em 14 dias — com o limiar antigo,
--     metade da fila ativa seria classificada como "esgotada";
--   • exclusão de leads bloqueados e de quem já pagou, pela mesma regra da fila.
-- Assinatura e RETURNS TABLE idênticos aos de produção (verificado), então o
-- CREATE OR REPLACE não esbarra em "cannot change return type".
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.buscar_reengajamento(
  p_workspace_id uuid,
  p_sdr_name text DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  oportunidade_id uuid, contato_id uuid, nome text, telefone text, ghl_id text,
  ultima_mensagem text, data_ultima_mensagem timestamptz, contexto text, utm_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(p_workspace_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não é membro deste workspace'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.contato_id,
    ct.nome::TEXT,
    ct.telefone::TEXT,
    ct.ghl_id::TEXT,
    last_msg.mensagem_body::TEXT,          -- <<< era c.body (coluna inexistente)
    last_msg.data_comunicacao,
    ('Respondeu há '
      || ROUND(EXTRACT(EPOCH FROM (now() - last_msg.data_comunicacao)) / 86400)::TEXT
      || 'd: "' || LEFT(COALESCE(last_msg.mensagem_body, '(sem texto)'), 80) || '"'
    )::TEXT,
    ct.utm_source::TEXT
  FROM oportunidades o
  JOIN contatos ct ON ct.id = o.contato_id
  LEFT JOIN LATERAL (
    SELECT c.mensagem_body, c.data_comunicacao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.direction = 'inbound'
      AND c.data_comunicacao > (now() - INTERVAL '60 days')
    ORDER BY c.data_comunicacao DESC
    LIMIT 1
  ) last_msg ON true
  WHERE o.status = 'open'
    AND o.pipeline_id IS NOT NULL
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Pré-Vendas nMQL', 'Auto Agendamento', 'Recuperação')
    AND ct.workspace_id = p_workspace_id
    -- lead sem telefone não pode ser "reengajado" por discagem, mesma regra da fila
    AND ct.telefone IS NOT NULL
    AND btrim(ct.telefone) <> ''
    AND (p_sdr_name IS NULL OR COALESCE(o.sdr_name, ct.owner_name) = p_sdr_name)
    AND NOT (lower(COALESCE(ct.tags, '')) ~ '(^|,)\s*(bloquear|stop bot|descartado|nao perturbe)\s*(,|$)')
    AND NOT EXISTS (
      SELECT 1 FROM vendas_fechamento vf
      WHERE vf.oportunidade_id = o.id AND vf.data_pagamento_entrada IS NOT NULL
    )
    AND (
      NOT EXISTS (SELECT 1 FROM discagem_scores ds WHERE ds.oportunidade_id = o.id)
      OR EXISTS (
        SELECT 1 FROM discagem_scores ds
        WHERE ds.oportunidade_id = o.id AND ds.numero_tentativa >= 8 AND ds.camada = 'cadencia'
      )
    )
    AND last_msg.data_comunicacao IS NOT NULL
    AND last_msg.data_comunicacao < (now() - INTERVAL '3 days')
  ORDER BY last_msg.data_comunicacao DESC
  LIMIT p_limit;
END;
$function$;

-- Preserva explicitamente o ACL vigente em produção (authenticated + service_role);
-- `anon` nunca deve executar uma RPC que devolve telefone e mensagem de lead.
REVOKE ALL ON FUNCTION public.buscar_reengajamento(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.buscar_reengajamento(uuid, text, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════════
-- CUSTO — medido em produção com EXPLAIN (ANALYZE, BUFFERS), read-only,
-- 2026-08-04, sobre 226.702 linhas de `comunicacoes` e 4.168 oportunidades
-- elegíveis. Cron: a cada 5 minutos (jobid 62).
--
--   Etapa 1 completa, versão original desta migration ....  735 ms / 219.512 buffers
--     └─ LATERAL de ghl_tasks .............................  410 ms / 119.345 buffers
--     └─ LATERAL de comunicacoes (histórico completo) .....  ~200 ms /  88.470 buffers
--   Etapa 1 completa, após a correção `t.deleted = false` ~  400 ms / ~113.000 buffers
--     └─ LATERAL de ghl_tasks .............................   90 ms /  13.017 buffers
--
-- Conclusão: o gargalo NÃO era varrer `comunicacoes` sem janela de 14 dias
-- (o índice idx_comunicacoes_contato_id já resolve isso em ~26 linhas por
-- contato). Era o LATERAL de `ghl_tasks`, que não conseguia usar o índice
-- parcial existente por causa do `OR t.deleted IS NULL`. A correção é gratuita
-- (nenhum índice novo) e derruba a leitura de buffers em ~9x.
-- 400 ms a cada 5 minutos = 0,13% de ocupação. Nenhum índice adicional se
-- justifica; ver a nota sobre o índice coberto de `comunicacoes` no topo.
-- ═══════════════════════════════════════════════════════════════════════════════
