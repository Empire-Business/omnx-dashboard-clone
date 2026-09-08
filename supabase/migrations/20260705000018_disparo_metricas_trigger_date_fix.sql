-- Corrige v_disparo_metricas: primeiro_trigger/ultimo_trigger usavam
-- contatos.date_created (data de criação do contato no GHL) em vez do
-- momento real em que a tag de trigger foi aplicada.
--
-- Bug encontrado em auditoria (2026-07-05): pra contatos que já existiam
-- antes do disparo ser criado (o caso mais comum em remarketing pra base
-- existente), isso mostrava datas erradas — às vezes meses ou anos antes
-- da campanha existir.
--
-- Fix: usa contatos.updated_at, que sync_tags_from_latest_webhook()
-- atualiza sempre que as tags do contato mudam (incluindo quando a tag de
-- trigger é aplicada). Não é 100% preciso — se o contato tiver outra
-- mudança de tag depois do trigger, updated_at reflete a mudança mais
-- recente, não especificamente a aplicação da tag de trigger — mas é a
-- melhor aproximação disponível sem uma coluna dedicada de "tag aplicada
-- em". Ver débito técnico documentado em docs/MUDANCAS.md.

CREATE OR REPLACE VIEW v_disparo_metricas AS
WITH tags_por_disparo AS (
    SELECT
        d.id AS disparo_id,
        d.workspace_id,
        d.nome AS disparo_nome,
        d.cor,
        d.is_active,
        dt.significado,
        lower(trim(dt.tag)) AS tag
    FROM disparos d
    JOIN disparo_tags dt ON dt.disparo_id = d.id AND dt.workspace_id = d.workspace_id
),
trigger_contatos AS (
    SELECT
        tpd.disparo_id,
        tpd.workspace_id,
        c.id AS contato_id,
        c.updated_at AS tagged_at
    FROM tags_por_disparo tpd
    JOIN contatos c ON c.workspace_id = tpd.workspace_id
    WHERE tpd.significado = 'trigger'
      AND contato_tem_tag(c.tags, tpd.tag)
),
metricas AS (
    SELECT
        tc.disparo_id,
        tc.workspace_id,
        COUNT(DISTINCT tc.contato_id) AS trigger_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'respondeu'   AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS respondeu_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'parou'       AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS parou_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'erro'        AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS erro_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'nao_respondeu' AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS nao_respondeu_count,
        COUNT(DISTINCT CASE WHEN tpd.significado = 'comprou'     AND contato_tem_tag(c.tags, tpd.tag) THEN tc.contato_id END) AS comprou_count,
        MIN(tc.tagged_at) AS primeiro_trigger,
        MAX(tc.tagged_at) AS ultimo_trigger
    FROM trigger_contatos tc
    LEFT JOIN tags_por_disparo tpd
      ON tpd.disparo_id = tc.disparo_id
     AND tpd.workspace_id = tc.workspace_id
     AND tpd.significado <> 'trigger'
    LEFT JOIN contatos c
      ON c.id = tc.contato_id
     AND c.workspace_id = tc.workspace_id
    GROUP BY tc.disparo_id, tc.workspace_id
)
SELECT
    d.id AS disparo_id,
    d.workspace_id,
    d.nome AS disparo_nome,
    d.descricao,
    d.cor,
    d.is_active,
    COALESCE(m.trigger_count, 0) AS trigger_count,
    COALESCE(m.respondeu_count, 0) AS respondeu_count,
    COALESCE(m.parou_count, 0) AS parou_count,
    COALESCE(m.erro_count, 0) AS erro_count,
    COALESCE(m.nao_respondeu_count, 0) AS nao_respondeu_count,
    COALESCE(m.comprou_count, 0) AS comprou_count,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.respondeu_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_resposta_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.parou_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_parou_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.erro_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_erro_pct,
    CASE WHEN COALESCE(m.trigger_count, 0) = 0 THEN 0
         ELSE ROUND((m.comprou_count::numeric / m.trigger_count) * 100, 2)
    END AS taxa_conversao_pct,
    m.primeiro_trigger,
    m.ultimo_trigger
FROM disparos d
LEFT JOIN metricas m ON m.disparo_id = d.id AND m.workspace_id = d.workspace_id;

NOTIFY pgrst, 'reload schema';
