-- ============================================================================
-- Auditoria SDR IA: restaura a deteccao de problemas + detector de reclamacao
--
-- Aplicado em producao em 2026-08-07 (projeto qzesffnkqgelmtfblzkr) por tres
-- passos, consolidados aqui num unico CREATE OR REPLACE idempotente:
--   20260807162356_restaura_auditoria_sdr_ia_e_detector_reclamacao
--   20260807162758_auditoria_sdr_ia_reclamacao_refino_falsos_positivos
--   20260807xxxxxx_auditoria_sdr_ia_conversa_unilateral_data_real
--
-- REGRESSAO CORRIGIDA
-- --------------------------------------------------------------------------
-- As migrations de hardening cross-tenant `20261004000002` (linha 320) e
-- `20261006000000` (linha 296) recriaram `auditoria_sdr_ia()` com
-- CREATE OR REPLACE para adicionar o guard de workspace, mas substituiram o
-- corpo por uma versao simplificada que devolvia UMA linha por contato com
-- `tipo = 'auditoria'` e `severidade = 'info'` — sem nenhuma deteccao.
--
-- Como o frontend (`useAuditoriaIA.ts`) so aceita linhas cujo `tipo` esteja na
-- lista valida, 100% das linhas eram descartadas e o painel exibia
-- "0 problemas" desde entao, mesmo havendo 2.557 mensagens da IA com falha de
-- entrega nos ultimos 30 dias.
--
-- Esta migration restaura o corpo integro da `20260709220200` PRESERVANDO o
-- guard de seguranca, e acrescenta o 7o tipo de problema.
--
-- NOVO TIPO: `reclamacao_lead`
-- --------------------------------------------------------------------------
-- Detecta, no texto que o LEAD enviou, sinais de que a IA respondeu fora de
-- contexto / repetiu / errou a pessoa, ou de que o lead ficou insatisfeito.
-- Padroes calibrados contra 180 dias de conversas reais de producao.
--
-- Guards anti-falso-positivo, todos derivados de ruido REAL medido nos dados:
--   1. `ghl_source <> 'workflow'` — existem e-mails de marketing do proprio
--      negocio gravados com direction='inbound'. O rodape "unsubscribe" deles
--      casava com o padrao de "pediu para parar". Nao da pra usar a view
--      `comunicacoes_com_remetente` aqui: ela marca TODO inbound como
--      autor='lead', inclusive esses.
--   2. Descarta `reaction in message:` / `edit message:`, corpos iniciados por
--      `<telefone> <nome>:` e por `*nome:*` — sao ECO do texto que a IA
--      enviou, colado dentro do corpo do inbound.
--   3. Limpa o trecho citado de respostas (tudo antes de `➡️ Message:`) e o
--      rodape `Source: ...` antes de casar os padroes.
--   4. `absurdo` so conta se a mensagem NAO falar de preco — sem isso,
--      objecao comercial ("valor absurdo") virava reclamacao do atendimento.
--   5. So conta se a IA ja tinha falado com o lead ANTES da reclamacao.
--
-- Severidade:
--   alta  -> pediu para parar, ameacou bloquear, xingou, apontou repeticao,
--            disse ser a pessoa errada, ou percebeu que e um robo.
--   media -> sinalizou confusao ou resposta fora de contexto.
--
-- Idempotente: CREATE OR REPLACE. Nao altera schema de tabela.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auditoria_sdr_ia(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_include_tags text[] DEFAULT NULL,
  p_exclude_tags text[] DEFAULT NULL,
  p_include_pipelines text[] DEFAULT NULL,
  p_exclude_pipelines text[] DEFAULT NULL,
  p_include_utm_source text[] DEFAULT NULL,
  p_exclude_utm_source text[] DEFAULT NULL,
  p_include_utm_campaign text[] DEFAULT NULL,
  p_exclude_utm_campaign text[] DEFAULT NULL
)
RETURNS TABLE(
  contato_id uuid, contato_nome text, contato_email text, contato_telefone text,
  contato_tags text[], opp_id uuid, sdr_humano text, tipo text, severidade text,
  detalhes text, ultima_interacao timestamptz, msg_ia integer, msg_lead integer,
  channel text, error_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_cutoff_7d timestamptz;
BEGIN
  -- Guard cross-tenant (introduzido por 20261004000002 / 20261006000000).
  IF auth.role() <> 'service_role' AND NOT public.is_workspace_member(p_workspace_id) THEN
    RETURN;
  END IF;

  v_start_ts := timezone('America/Sao_Paulo', (p_start_date::text || ' 00:00:00')::timestamp);
  v_end_ts   := timezone('America/Sao_Paulo', (p_end_date::text || ' 23:59:59')::timestamp);
  v_cutoff_7d := timezone('America/Sao_Paulo', ((current_date - interval '7 days')::date::text || ' 00:00:00')::timestamp);

  RETURN QUERY
  WITH
  universo AS (
    SELECT DISTINCT c.contato_id
    FROM comunicacoes c
    JOIN contatos ct ON ct.id = c.contato_id
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    WHERE ct.workspace_id = p_workspace_id
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND (p_include_utm_source IS NULL OR p_include_utm_source = '{}'::text[] OR ct.utm_source = ANY(p_include_utm_source))
      AND (p_exclude_utm_source IS NULL OR p_exclude_utm_source = '{}'::text[] OR ct.utm_source IS NULL OR NOT (ct.utm_source = ANY(p_exclude_utm_source)))
      AND (p_include_utm_campaign IS NULL OR p_include_utm_campaign = '{}'::text[] OR ct.utm_campaign::text = ANY(p_include_utm_campaign))
      AND (p_exclude_utm_campaign IS NULL OR p_exclude_utm_campaign = '{}'::text[] OR ct.utm_campaign IS NULL OR NOT (ct.utm_campaign::text = ANY(p_exclude_utm_campaign)))
  ),
  contato_info AS (
    SELECT
      ct.id AS cid, ct.nome AS cnome, ct.email AS cemail, ct.telefone AS ctelefone,
      string_to_array(ct.tags, ',') AS ctags_arr
    FROM contatos ct
    WHERE ct.workspace_id = p_workspace_id
      AND ct.id IN (SELECT contato_id FROM universo)
      AND (
        p_include_tags IS NULL OR p_include_tags = '{}'::text[] OR
        ct.tags IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(p_include_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
      AND (
        p_exclude_tags IS NULL OR p_exclude_tags = '{}'::text[] OR
        ct.tags IS NULL OR NOT EXISTS (
          SELECT 1 FROM unnest(p_exclude_tags) t
          WHERE lower(trim(ct.tags)) LIKE '%' || lower(trim(t)) || '%'
        )
      )
  ),
  oportunidade_info AS (
    SELECT DISTINCT ON (o.contato_id)
      o.contato_id AS ocid, o.id AS oid,
      COALESCE(o.sdr_name, ct.owner_name) AS osdr
    FROM oportunidades o
    JOIN contatos ct ON ct.id = o.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND o.contato_id IN (SELECT cid FROM contato_info)
      AND (p_include_pipelines IS NULL OR p_include_pipelines = '{}'::text[] OR o.pipeline_id = ANY(p_include_pipelines))
      AND (p_exclude_pipelines IS NULL OR p_exclude_pipelines = '{}'::text[] OR NOT (o.pipeline_id = ANY(p_exclude_pipelines)))
    ORDER BY o.contato_id, o.data_lead_recebido DESC NULLS LAST
  ),
  stats AS (
    SELECT
      c.contato_id AS scid,
      COUNT(*) FILTER (WHERE ccr.autor = 'automacao' AND c.direction = 'outbound') AS qtd_ia,
      COUNT(*) FILTER (WHERE c.direction = 'inbound') AS qtd_lead,
      COUNT(*) FILTER (WHERE ccr.autor != 'automacao' AND c.direction = 'outbound') AS qtd_humano,
      MAX(c.data_comunicacao) FILTER (WHERE c.direction = 'outbound') AS ultimo_outbound
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    GROUP BY c.contato_id
  ),
  erro_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS ecid, c.channel AS echannel, c.error_msg AS eerror, c.data_comunicacao AS edata
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.msg_status = 'failed'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
    ORDER BY c.contato_id, c.data_comunicacao DESC
  ),
  spam_calc AS (
    SELECT
      c.contato_id AS spcid,
      COUNT(*) FILTER (WHERE diff_seg < 600) AS qtd_rapidas_10min,
      COUNT(*) FILTER (WHERE diff_seg < 300) AS qtd_rapidas_5min,
      MAX(c.data_comunicacao) AS ultima_data
    FROM (
      SELECT
        c.contato_id, c.data_comunicacao,
        EXTRACT(EPOCH FROM (c.data_comunicacao - LAG(c.data_comunicacao) OVER (PARTITION BY c.contato_id ORDER BY c.data_comunicacao))) AS diff_seg
      FROM comunicacoes c
      JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
      JOIN contatos ct ON ct.id = c.contato_id
      WHERE ct.workspace_id = p_workspace_id
        AND c.contato_id IN (SELECT cid FROM contato_info)
        AND ccr.autor = 'automacao'
        AND c.direction = 'outbound'
        AND c.data_comunicacao >= v_start_ts
        AND c.data_comunicacao <= v_end_ts
    ) c
    GROUP BY c.contato_id
  ),
  horario_info AS (
    SELECT DISTINCT ON (c.contato_id)
      c.contato_id AS hcid,
      EXTRACT(HOUR FROM timezone('America/Sao_Paulo', c.data_comunicacao))::int AS hora_sp,
      c.data_comunicacao AS hdata, c.channel AS hchannel
    FROM comunicacoes c
    JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND ccr.autor = 'automacao'
      AND c.direction = 'outbound'
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND EXTRACT(HOUR FROM timezone('America/Sao_Paulo', c.data_comunicacao)) NOT BETWEEN 8 AND 21
    ORDER BY c.contato_id, c.data_comunicacao DESC
  ),
  -- ==========================================================================
  -- reclamacao do lead sobre o atendimento da IA
  -- ==========================================================================
  reclamacao_base AS (
    SELECT
      c.contato_id AS rcid, c.channel AS rchannel, c.data_comunicacao AS rdata,
      lower(regexp_replace(
        regexp_replace(c.mensagem_body, '(?s)^.*(➡️|=>)\s*(Message|For)\s*:\s*', ''),
        '(?s)\n+Source\s*:.*$', ''
      )) AS rbody
    FROM comunicacoes c
    JOIN contatos ct ON ct.id = c.contato_id
    WHERE ct.workspace_id = p_workspace_id
      AND c.contato_id IN (SELECT cid FROM contato_info)
      AND c.direction = 'inbound'
      AND c.mensagem_body IS NOT NULL
      AND c.data_comunicacao >= v_start_ts
      AND c.data_comunicacao <= v_end_ts
      AND c.ghl_source IS DISTINCT FROM 'workflow'
      AND c.mensagem_body !~* '^\s*(reaction in message|edit message)\s*:'
      AND c.mensagem_body !~ '^\s*\d{10,15}\s'
      AND c.mensagem_body !~ '^\s*\*[^*\n]{1,40}:\*\s'
      AND EXISTS (
        SELECT 1
        FROM comunicacoes ia
        JOIN comunicacoes_com_remetente iar ON iar.id = ia.id
        WHERE ia.contato_id = c.contato_id
          AND iar.autor = 'automacao'
          AND ia.direction = 'outbound'
          AND ia.data_comunicacao < c.data_comunicacao
          AND ia.data_comunicacao >= v_start_ts
      )
  ),
  reclamacao_classificada AS (
    SELECT
      rb.rcid, rb.rchannel, rb.rdata, rb.rbody,
      CASE
        WHEN rb.rbody ~ '(par[ae] de (me )?(mandar|enviar|encher)|n[aã]o quero mais receber|chega de mensagem|me descadastr|descadastrar|sair da lista|me remove d)'
          THEN 'pediu para parar de receber mensagens'
        WHEN rb.rbody ~ '(vou (te )?bloquear|irei (te )?bloquear|vou bloquear (vc|voc[eê]|seu))'
          THEN 'ameaçou bloquear o contato'
        WHEN rb.rbody ~ '(mesma mensagem|mensagem repetida|(est[aá]|t[aá]) repetindo|de novo a mesma|ignorando tudo que eu (falei|disse)|j[aá] mandou essa mensagem|mandaram [0-9]+x a mesma)'
          THEN 'apontou que a IA está repetindo mensagens'
        WHEN rb.rbody ~ '(pessoa errada|n[uú]mero errado|me chamando de)'
          THEN 'avisou que a IA está falando com a pessoa errada'
        WHEN rb.rbody ~ '(voc[eê] [eé] (um |uma )?(rob[oô]|m[aá]quina|b[oô]t)|isso [eé] (um )?b[oô]t|falando com (uma )?m[aá]quina|mensagens? (aí )?de rob[oô])'
          THEN 'percebeu que está falando com um robô'
        WHEN rb.rbody ~ '(p[eé]ssim[oa]|palha[cç]ada|vergonha|inaceit[aá]vel|vou processar|horr[ií]vel)'
          OR (rb.rbody ~ 'absurdo' AND rb.rbody !~ '(valor|pre[çc]o|caro|cobrar|cobran|mensalidade|investimento|r\$|gr[aá]tis|gratis|pag[oa])')
          THEN 'demonstrou insatisfação forte'
        WHEN rb.rbody ~ '(voc[eê] n[aã]o (est[aá]|ta) entendendo|n[aã]o foi isso que (eu )?(perguntei|falei|disse)|n[aã]o tem nada a ver|sua resposta)'
          THEN 'disse que a resposta da IA ficou fora de contexto'
        WHEN rb.rbody ~ '(n[aã]o entendi|nao entendi|n[aã]o compreendi|j[aá] (te )?(disse|falei|respondi)|j[aá] informei)'
          THEN 'sinalizou que não entendeu a mensagem'
      END AS motivo,
      CASE
        WHEN rb.rbody ~ '(par[ae] de (me )?(mandar|enviar|encher)|n[aã]o quero mais receber|chega de mensagem|me descadastr|descadastrar|sair da lista|me remove d|vou (te )?bloquear|irei (te )?bloquear|vou bloquear (vc|voc[eê]|seu)|mesma mensagem|mensagem repetida|(est[aá]|t[aá]) repetindo|de novo a mesma|ignorando tudo que eu (falei|disse)|j[aá] mandou essa mensagem|mandaram [0-9]+x a mesma|pessoa errada|n[uú]mero errado|me chamando de|voc[eê] [eé] (um |uma )?(rob[oô]|m[aá]quina|b[oô]t)|isso [eé] (um )?b[oô]t|falando com (uma )?m[aá]quina|mensagens? (aí )?de rob[oô]|p[eé]ssim[oa]|palha[cç]ada|vergonha|inaceit[aá]vel|vou processar|horr[ií]vel)'
          OR (rb.rbody ~ 'absurdo' AND rb.rbody !~ '(valor|pre[çc]o|caro|cobrar|cobran|mensalidade|investimento|r\$|gr[aá]tis|gratis|pag[oa])')
          THEN 'alta' ELSE 'media'
      END AS sev
    FROM reclamacao_base rb
  ),
  reclamacao_info AS (
    SELECT DISTINCT ON (rc.rcid)
      rc.rcid, rc.rchannel, rc.rdata, rc.rbody, rc.motivo, rc.sev
    FROM reclamacao_classificada rc
    WHERE rc.motivo IS NOT NULL
    -- mais grave primeiro; em empate, a mais recente
    ORDER BY rc.rcid, (rc.sev = 'alta') DESC, rc.rdata DESC
  )
  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'sem_followup'::text,
    CASE WHEN s.ultimo_outbound < timezone('America/Sao_Paulo', ((current_date - interval '14 days')::date::text || ' 00:00:00')::timestamp) THEN 'alta' ELSE 'media' END,
    ('Último contato há ' || GREATEST(1, (extract(epoch from (now() - s.ultimo_outbound))/86400)::int) || ' dias (IA + humano)')::text,
    s.ultimo_outbound, NULL::integer, NULL::integer, NULL::text, NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.ultimo_outbound < v_cutoff_7d

  UNION ALL

  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'erro_entrega'::text,
    CASE WHEN lower(ei.eerror) LIKE '%invalid%' OR lower(ei.eerror) LIKE '%block%' OR lower(ei.eerror) LIKE '%unavailable%' THEN 'alta' ELSE 'media' END,
    ('Mensagem não entregue via ' || COALESCE(ei.echannel, '?') || ': ' || COALESCE(ei.eerror, 'Erro desconhecido'))::text,
    ei.edata, NULL::integer, NULL::integer, ei.echannel, ei.eerror
  FROM contato_info ci
  JOIN erro_info ei ON ei.ecid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid

  UNION ALL

  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'spam'::text,
    CASE WHEN sp.qtd_rapidas_5min > 5 THEN 'alta' ELSE 'media' END,
    (sp.qtd_rapidas_10min || ' mensagens rápidas (em <10min)')::text,
    sp.ultima_data, s.qtd_ia::integer, NULL::integer, NULL::text, NULL::text
  FROM contato_info ci
  JOIN spam_calc sp ON sp.spcid = ci.cid
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE sp.qtd_rapidas_10min > 5

  UNION ALL

  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'horario_inadequado'::text,
    CASE WHEN hi.hora_sp >= 0 AND hi.hora_sp < 6 THEN 'media' ELSE 'baixa' END,
    ('Mensagem enviada às ' || hi.hora_sp || ':00 (fora do horário comercial 08:00-22:00)')::text,
    hi.hdata, NULL::integer, NULL::integer, hi.hchannel, NULL::text
  FROM contato_info ci
  JOIN horario_info hi ON hi.hcid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid

  UNION ALL

  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'conversa_unilateral'::text,
    CASE WHEN s.qtd_ia > 5 THEN 'media' ELSE 'baixa' END,
    (s.qtd_ia || ' mensagens da IA, 0 respostas do lead')::text,
    -- data real da ultima mensagem enviada (antes usava v_end_ts, que exibia
    -- "23:59 do fim do periodo" em todas as linhas)
    COALESCE(s.ultimo_outbound, v_end_ts), s.qtd_ia::integer, 0, NULL::text, NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.qtd_ia > 3 AND s.qtd_lead = 0

  UNION ALL

  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'conflito_humano'::text,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM comunicacoes c JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid AND ccr.autor = 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      ) AND EXISTS (
        SELECT 1 FROM comunicacoes c JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid AND ccr.autor != 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      ) THEN 'alta' ELSE 'media'
    END,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM comunicacoes c JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid AND ccr.autor = 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      ) AND EXISTS (
        SELECT 1 FROM comunicacoes c JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
        WHERE c.contato_id = ci.cid AND ccr.autor != 'automacao' AND c.direction = 'outbound'
          AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts
          AND timezone('America/Sao_Paulo', c.data_comunicacao)::date = timezone('America/Sao_Paulo', now())::date
      ) THEN 'Mensagens de IA e humano no mesmo dia'
      ELSE 'Lead recebeu mensagens de IA e humano'
    END::text,
    COALESCE(
      (SELECT MAX(c.data_comunicacao) FROM comunicacoes c JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
       WHERE c.contato_id = ci.cid AND ccr.autor != 'automacao' AND c.direction = 'outbound'
         AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts),
      (SELECT MAX(c.data_comunicacao) FROM comunicacoes c JOIN comunicacoes_com_remetente ccr ON ccr.id = c.id
       WHERE c.contato_id = ci.cid AND ccr.autor = 'automacao' AND c.direction = 'outbound'
         AND c.data_comunicacao >= v_start_ts AND c.data_comunicacao <= v_end_ts)
    ),
    NULL::integer, NULL::integer, NULL::text, NULL::text
  FROM contato_info ci
  JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid
  WHERE s.qtd_ia > 0 AND s.qtd_humano > 0

  UNION ALL

  SELECT
    ci.cid, ci.cnome, ci.cemail, ci.ctelefone, ci.ctags_arr, oi.oid, oi.osdr,
    'reclamacao_lead'::text,
    ri.sev,
    ('Lead ' || ri.motivo || ': "' ||
      regexp_replace(left(btrim(ri.rbody), 160), '\s+', ' ', 'g') ||
      CASE WHEN length(btrim(ri.rbody)) > 160 THEN '..."' ELSE '"' END)::text,
    ri.rdata, s.qtd_ia::integer, s.qtd_lead::integer, ri.rchannel, NULL::text
  FROM contato_info ci
  JOIN reclamacao_info ri ON ri.rcid = ci.cid
  LEFT JOIN stats s ON s.scid = ci.cid
  LEFT JOIN oportunidade_info oi ON oi.ocid = ci.cid;
END;
$fn$;

-- Grants: identicos aos definidos por 20261006000000 (anon nunca executa).
REVOKE EXECUTE ON FUNCTION public.auditoria_sdr_ia(uuid, date, date, text[], text[], text[], text[], text[], text[], text[], text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.auditoria_sdr_ia(uuid, date, date, text[], text[], text[], text[], text[], text[], text[], text[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.auditoria_sdr_ia(uuid, date, date, text[], text[], text[], text[], text[], text[], text[], text[]) IS
  'Auditoria da SDR IA: detecta 7 tipos de problema (sem_followup, erro_entrega, spam, horario_inadequado, conversa_unilateral, conflito_humano, reclamacao_lead) por contato atendido pela automacao no periodo. Ver docs/ABA-AUDITORIA-IA.md.';
