-- ============================================================================
-- Fix: campanhas [cp] invisíveis no dashboard
-- ============================================================================
-- Contexto
--   Campanhas com prefixo "[cp]" são rastreadas por TAG no contato (e não por
--   utm_campaign). O filtro do dashboard casa o NOME cadastrado em
--   `utm_campaigns` com a tag do contato, comparando o texto inteiro
--   (case-insensitive, mas sensível a espaço e acento) — ver `matchesCampaign`
--   em eb-dash2/src/hooks/useAquisicao.ts.
--
--   Consequência: tag usada no CRM sem campanha cadastrada — ou cadastrada com
--   o nome ligeiramente diferente — vira campanha que NÃO aparece no filtro e
--   cujos leads ficam invisíveis, sem erro e sem aviso.
--
-- Achados medidos em produção (2026-07-31), por workspace:
--
--   workspace "Default" (cliente real)
--     [cp] 150 ht                 →  66 contatos — cadastrada como "[cp] 150ht" (falta o espaço)
--     [cp] webinario thiago reis  →   2 contatos — cadastrada como "[cp] webinário thiago reis" (acento)
--
--   workspace "Acme Educação (Demo)" (tenant de demonstração)
--     [cp] aplicação  → 3042 contatos — não cadastrada
--     [cp] desafio    → 1519 contatos — não cadastrada
--     [cp] lançamento →  723 contatos — não cadastrada
--     [cp] indicação  →  657 contatos — não cadastrada
--     [cp] masterclass→  620 contatos — não cadastrada
--
--   Fora do escopo por decisão: "[cp] evento-growth-mai-cami_disparo_respondeu"
--   (8 contatos) é tag de automação de disparo, não campanha de página. Fica
--   abaixo do corte de 50 contatos aplicado no passo 2.
--
-- Segurança / reversibilidade
--   - Idempotente: pode rodar N vezes sem duplicar.
--   - Só INSERT/UPDATE de dados de cadastro; não altera schema nem apaga nada.
--   - Escopada por workspace: cadastra a campanha apenas no workspace que de
--     fato possui contatos com aquela tag (não cruza tenant).
--   - Não toca em contatos, oportunidades nem em métricas.
-- ============================================================================

-- ── 1. Corrige nomes divergentes (espaço / acento) ──────────────────────────
-- Só renomeia quando (a) o nome correto ainda não existe no mesmo workspace e
-- (b) nenhum contato usa a grafia antiga — assim o rename nunca cega leads que
-- hoje aparecem.
WITH renames(errado, correto) AS (
  VALUES ('[cp] 150ht',                  '[cp] 150 ht'),
         ('[cp] webinário thiago reis',  '[cp] webinario thiago reis')
)
UPDATE utm_campaigns u
   SET nome = r.correto,
       updated_at = NOW()
  FROM renames r
 WHERE lower(u.nome) = lower(r.errado)
   AND NOT EXISTS (
         SELECT 1 FROM utm_campaigns u2
          WHERE u2.workspace_id = u.workspace_id
            AND lower(u2.nome) = lower(r.correto)
       )
   AND NOT EXISTS (
         SELECT 1
           FROM contatos c
           CROSS JOIN LATERAL unnest(string_to_array(c.tags, ',')) AS x(tag_raw)
          WHERE c.workspace_id = u.workspace_id
            AND lower(trim(x.tag_raw)) = lower(r.errado)
       );

-- ── 2. Cadastra as campanhas [cp] órfãs ─────────────────────────────────────
-- Critério: tag [cp] presente em >= 50 contatos do workspace e sem campanha
-- correspondente. O corte de 50 evita transformar tag pontual de automação em
-- campanha no filtro.
DO $$
DECLARE
  r           RECORD;
  v_next_code INTEGER;
BEGIN
  FOR r IN
    SELECT c.workspace_id,
           -- preserva a grafia original da tag (não usa lower no nome exibido)
           (array_agg(trim(x.tag_raw) ORDER BY trim(x.tag_raw)))[1] AS tag,
           COUNT(DISTINCT c.id) AS contatos
      FROM contatos c
      CROSS JOIN LATERAL unnest(string_to_array(c.tags, ',')) AS x(tag_raw)
     WHERE c.workspace_id IS NOT NULL
       AND lower(trim(x.tag_raw)) LIKE '[cp]%'
     GROUP BY c.workspace_id, lower(trim(x.tag_raw))
    HAVING COUNT(DISTINCT c.id) >= 50
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM utm_campaigns u
       WHERE u.workspace_id = r.workspace_id
         AND lower(u.nome) = lower(r.tag)
    );

    -- utm_campaign é UNIQUE por workspace
    SELECT COALESCE(MAX(u.utm_campaign), 0) + 1
      INTO v_next_code
      FROM utm_campaigns u
     WHERE u.workspace_id = r.workspace_id;

    INSERT INTO utm_campaigns (workspace_id, nome, utm_campaign, page_code, funnels)
    VALUES (r.workspace_id, r.tag, v_next_code, 'PG' || v_next_code, '[]'::jsonb);

    RAISE NOTICE 'Campanha "%" cadastrada (workspace %, codigo %, % contatos)',
                 r.tag, r.workspace_id, v_next_code, r.contatos;
  END LOOP;
END $$;

-- ── 3. Verificação (só leitura, aparece no log da aplicação) ────────────────
DO $$
DECLARE
  v_orfas INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orfas
    FROM (
      SELECT c.workspace_id, lower(trim(x.tag_raw)) AS tag
        FROM contatos c
        CROSS JOIN LATERAL unnest(string_to_array(c.tags, ',')) AS x(tag_raw)
       WHERE lower(trim(x.tag_raw)) LIKE '[cp]%'
       GROUP BY c.workspace_id, lower(trim(x.tag_raw))
      HAVING COUNT(DISTINCT c.id) >= 50
    ) t
   WHERE NOT EXISTS (
     SELECT 1 FROM utm_campaigns u
      WHERE u.workspace_id = t.workspace_id
        AND lower(u.nome) = t.tag
   );

  RAISE NOTICE 'Tags [cp] relevantes ainda sem campanha cadastrada: %', v_orfas;
END $$;
