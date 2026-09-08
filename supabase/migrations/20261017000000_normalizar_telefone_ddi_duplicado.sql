-- ============================================================================
-- Telefone com o DDI 55 do Brasil DUPLICADO
-- ----------------------------------------------------------------------------
-- SINTOMA (relato do dono, "chat nao sincroniza com os leads"): a conversa do
-- lead aparece num cadastro e a oportunidade em outro; e o SDR liga para um
-- numero invalido.
--
-- CAUSA: alguns contatos chegam do GHL com o `55` do Brasil repetido —
-- `+55` `55` `14` `99602-6623` (Paulo Dare). Para o GHL sao dois telefones
-- diferentes, entao ele NAO mescla: o cadastro do formulario fica com o numero
-- errado e o da conversa de WhatsApp com o certo. O historico do lead racha.
--
-- POR QUE UM UPDATE SOZINHO NAO RESOLVE: `extrair_dados_ghl_v2` grava
-- `telefone = w.mapped->>'phone'` sem COALESCE nem normalizacao — o proximo
-- webhook daquele contato reescreveria o numero errado por cima. E dai a
-- correcao evaporaria em silencio. (Isto tambem explica a pendencia herdada
-- "algo sobrescreve contatos.telefone em producao".) Por isso a normalizacao
-- entra como trigger BEFORE, no ponto de escrita, e vale para todo webhook
-- futuro sem tocar nas ~350 linhas da funcao de extracao.
--
-- ⚠️ REGRA DELIBERADAMENTE ESTREITA — `55` TAMBEM E DDD LEGITIMO (Santa Maria/RS).
-- Classificacao medida em producao (182 contatos com telefone `+5555%`):
--
--   A) 73 contatos — `+55` `55` `9XXXXXXXX` (13 digitos)  -> DDD 55 do RS. NAO TOCAR.
--   B) 45 contatos — 15 digitos                            -> DDI duplicado.
--   D) 53 contatos — 13 digitos sem o `9`                  -> malformados, sem
--                                                             conserto por regra.
--   E) 11 contatos — curtos demais                         -> lixo.
--
-- O trigger so age no grupo B, e ainda assim apenas quando o resultado vira um
-- celular brasileiro valido (`+55` + DDD + `9` + 8 digitos). Qualquer duvida,
-- deixa como esta: numero errado o SDR percebe na hora, numero "corrigido" para
-- outra pessoa gera ligacao para terceiro.
--
-- Idempotente (modo so-producao).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalizar_telefone_ddi_duplicado(p_telefone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_digitos TEXT;
BEGIN
    IF p_telefone IS NULL OR p_telefone = '' THEN
        RETURN p_telefone;
    END IF;

    v_digitos := regexp_replace(p_telefone, '\D', '', 'g');

    -- Grupo B e somente ele: 15 digitos comecando por '5555'.
    -- 13 digitos NAO entram aqui — e la que mora o DDD 55 do Rio Grande do Sul.
    IF length(v_digitos) <> 15 OR left(v_digitos, 4) <> '5555' THEN
        RETURN p_telefone;
    END IF;

    -- Depois de tirar o '55' extra tem de sobrar celular valido:
    -- 55 + DDD(2) + 9 + 8 digitos. O '9' esta na posicao 7 do numero original.
    IF substring(v_digitos from 7 for 1) <> '9' THEN
        RETURN p_telefone;
    END IF;

    RETURN '+' || substring(v_digitos from 3);
END;
$$;

COMMENT ON FUNCTION public.normalizar_telefone_ddi_duplicado(TEXT) IS
'Remove o DDI 55 duplicado (+5555...) quando sobra celular brasileiro valido. Nao toca em numeros de 13 digitos: 55 tambem e DDD de Santa Maria/RS.';

CREATE OR REPLACE FUNCTION public.trg_normalizar_telefone_contato()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.telefone := public.normalizar_telefone_ddi_duplicado(NEW.telefone);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalizar_telefone_contato ON public.contatos;
CREATE TRIGGER normalizar_telefone_contato
    BEFORE INSERT OR UPDATE OF telefone ON public.contatos
    FOR EACH ROW
    EXECUTE FUNCTION public.trg_normalizar_telefone_contato();

-- ============================================================================
-- BACKFILL — os que ja estao gravados errados
-- ============================================================================

CREATE TABLE IF NOT EXISTS public._backup_contatos_telefone_20260806 (
    id UUID PRIMARY KEY,
    nome TEXT,
    telefone_antigo TEXT,
    telefone_novo TEXT,
    backup_em TIMESTAMPTZ DEFAULT NOW()
);

WITH alvo AS (
    SELECT c.id, c.nome, c.telefone AS antigo,
           public.normalizar_telefone_ddi_duplicado(c.telefone) AS novo
    FROM public.contatos c
    WHERE c.telefone LIKE '+5555%'
),
mudam AS (
    SELECT * FROM alvo WHERE novo IS DISTINCT FROM antigo
),
backup AS (
    INSERT INTO public._backup_contatos_telefone_20260806 (id, nome, telefone_antigo, telefone_novo)
    SELECT m.id, m.nome, m.antigo, m.novo FROM mudam m
    ON CONFLICT (id) DO NOTHING
    RETURNING 1
)
UPDATE public.contatos c
   SET telefone = m.novo
  FROM mudam m
 WHERE c.id = m.id;
