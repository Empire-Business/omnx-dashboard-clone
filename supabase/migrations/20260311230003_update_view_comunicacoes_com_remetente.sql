-- ============================================================
-- Migration: Atualiza view comunicacoes_com_remetente
-- Melhora o campo autor para tratar sdr_closer e social_seller
-- ============================================================

CREATE OR REPLACE VIEW comunicacoes_com_remetente AS
SELECT
  c.*,
  gu.nome    AS remetente_nome,
  gu.papel   AS remetente_papel,
  gu.email   AS remetente_email,
  CASE
    WHEN c.direction = 'inbound'                                  THEN 'lead'
    WHEN c.direction = 'outbound' AND gu.papel = 'sdr'            THEN 'sdr'
    WHEN c.direction = 'outbound' AND gu.papel = 'closer'         THEN 'closer'
    WHEN c.direction = 'outbound' AND gu.papel = 'sdr_closer'     THEN 'sdr_closer'
    WHEN c.direction = 'outbound' AND gu.papel = 'social_seller'  THEN 'social_seller'
    WHEN c.direction = 'outbound' AND gu.papel = 'gestor'         THEN 'gestor'
    WHEN c.direction = 'outbound' AND gu.papel = 'sistema'        THEN 'sistema'
    WHEN c.direction = 'outbound' AND gu.nome  IS NOT NULL        THEN gu.nome
    WHEN c.direction = 'outbound'                                  THEN 'time'
    ELSE 'desconhecido'
  END AS autor
FROM comunicacoes c
LEFT JOIN ghl_users gu ON gu.ghl_id = c.usuario_ghl_id;

COMMENT ON VIEW comunicacoes_com_remetente IS
  'comunicacoes com nome/papel do remetente. '
  'Campo autor: ''lead'' | ''sdr'' | ''closer'' | ''sdr_closer'' | ''social_seller'' | ''gestor'' | ''sistema'' | nome do usuário.';

NOTIFY pgrst, 'reload schema';
