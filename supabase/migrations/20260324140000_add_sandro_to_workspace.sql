-- Migration: Adiciona sandro@wtrade.com.br ao workspace como membro admin
-- Problema: sandro não estava em workspace_members → RLS bloqueava utm_sources
-- → filtro de tráfego pago era bypassado → painel Tráfego mostrava todos os leads
--
-- Lógica:
-- 1. Descobre o workspace_id que ferramentas@aliancadealtovalor.com.br pertence
-- 2. Descobre o auth.users.id de sandro@wtrade.com.br
-- 3. INSERT OR UPDATE em workspace_members

DO $$
DECLARE
  v_workspace_id   UUID;
  v_sandro_id      UUID;
  v_ferramentas_id UUID;
BEGIN

  -- 1. Pega o auth.users.id do usuário ferramentas (reference user)
  SELECT id INTO v_ferramentas_id
  FROM auth.users
  WHERE email = 'ferramentas@aliancadealtovalor.com.br'
  LIMIT 1;

  IF v_ferramentas_id IS NULL THEN
    RAISE EXCEPTION 'Usuário ferramentas@aliancadealtovalor.com.br não encontrado em auth.users';
  END IF;

  -- 2. Pega o workspace_id que ferramentas pertence (ativo)
  SELECT workspace_id INTO v_workspace_id
  FROM workspace_members
  WHERE user_id = v_ferramentas_id
    AND is_active = true
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum workspace ativo encontrado para ferramentas@aliancadealtovalor.com.br';
  END IF;

  -- 3. Pega o auth.users.id de sandro
  SELECT id INTO v_sandro_id
  FROM auth.users
  WHERE email = 'sandro@wtrade.com.br'
  LIMIT 1;

  IF v_sandro_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sandro@wtrade.com.br não encontrado em auth.users';
  END IF;

  -- 4. INSERT ou reativa se já existia desativado
  INSERT INTO workspace_members (workspace_id, user_id, role, invited_by, joined_at, is_active)
  VALUES (v_workspace_id, v_sandro_id, 'admin', v_ferramentas_id, now(), true)
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    is_active  = true,
    role       = 'admin',
    joined_at  = COALESCE(workspace_members.joined_at, now());

  RAISE NOTICE 'sandro@wtrade.com.br adicionado/reativado no workspace % como admin', v_workspace_id;

END $$;
