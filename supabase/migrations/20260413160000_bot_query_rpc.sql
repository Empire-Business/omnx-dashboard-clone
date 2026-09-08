-- Função RPC segura para o bot executar SQL SELECT diretamente no banco
-- Usada pela tool run_sql_query do bot-chat para obter números exatos sem passar
-- pelo código TypeScript de agregação (que pode divergir do dashboard).
-- SEGURANÇA: valida que o SQL começa com SELECT antes de executar.

CREATE OR REPLACE FUNCTION bot_query(sql_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  normalized TEXT;
BEGIN
  -- Normalizar: remover espaços/newlines do início e passar para maiúsculas para checagem
  normalized := UPPER(TRIM(sql_text));

  -- Validar que é uma query de leitura (SELECT ou WITH para CTEs)
  IF NOT (normalized LIKE 'SELECT%' OR normalized LIKE 'WITH%') THEN
    RAISE EXCEPTION 'bot_query: apenas SELECT e WITH são permitidos. Recebido: %', LEFT(sql_text, 50);
  END IF;

  -- Bloqueios adicionais de palavras-chave destrutivas
  IF normalized ~ '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|CALL)\M' THEN
    RAISE EXCEPTION 'bot_query: comando não permitido detectado na query.';
  END IF;

  -- Executar e retornar como JSONB array
  EXECUTE format('SELECT jsonb_agg(row_to_json(q)) FROM (%s) q', sql_text)
  INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Permissão: apenas service_role pode chamar (bot-chat usa service_role key)
REVOKE ALL ON FUNCTION bot_query(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bot_query(TEXT) TO service_role;

COMMENT ON FUNCTION bot_query(TEXT) IS
'Executa SQL SELECT seguro para o bot analítico. Apenas SELECT/WITH permitidos. Usado pela tool run_sql_query do bot-chat para obter números exatos do banco sem passar pelo código TypeScript de agregação.';
