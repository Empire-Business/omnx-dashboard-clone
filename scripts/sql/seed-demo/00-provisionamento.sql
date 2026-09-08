-- ============================================================================
-- Tenant de Demonstração — 00 · Provisionamento
-- ============================================================================
-- O QUE ESTE ARQUIVO FAZ
--   Cria o workspace de demonstração "Acme Educação (Demo)", o usuário de
--   acesso, o vínculo com a agência OMNX, os apps/permissões e toda a
--   TAXONOMIA canônica (canais, campanhas, funis, mídias, equipe).
--
--   Nada aqui é dado real: é uma empresa fictícia usada para demonstrar o
--   dashboard na prática, sem expor nenhum cliente.
--
-- ORDEM DE EXECUÇÃO
--   00-provisionamento.sql  ← este
--   10-crm-core.sql
--   20-meta-ads.sql
--   30-criativos.sql
--   40-disparos-organico-config.sql
--   50-metas-relatorios.sql
--
-- IDEMPOTENTE: pode rodar mais de uma vez sem duplicar nada.
--
-- ⚠️ PONTO ÚNICO DE CONFIGURAÇÃO
--   workspace de demo .... d0000000-0000-4000-8000-000000000001
--   usuário de demo ...... d0000000-0000-4000-8000-000000000002
--   agência OMNX ......... 4dc27bc0-5366-4111-bb16-27108f014810
--   Para apontar para outro destino, troque os três UUIDs em TODOS os arquivos.
--
-- ⚠️ NUNCA rode isto apontando para o workspace de produção do cliente.
-- ============================================================================

-- ─── 1. Usuário, workspace, membership e vínculo com a agência ──────────────
do $$
declare
  v_user uuid := 'd0000000-0000-4000-8000-000000000002';
  v_ws   uuid := 'd0000000-0000-4000-8000-000000000001';
  v_ag   uuid := '4dc27bc0-5366-4111-bb16-27108f014810';
begin
  if not exists (select 1 from auth.users where id = v_user) then
    -- ⚠️ ARMADILHA: as colunas de token abaixo PRECISAM ser string vazia, nunca
    -- NULL. O GoTrue (serviço de auth do Supabase) lê essas colunas como texto;
    -- se encontrar NULL, o login falha com HTTP 500 e a mensagem enganosa
    -- "Database error querying schema" — que parece problema de permissão ou de
    -- RLS, mas é só isto. Acontece sempre que o usuário é criado por SQL em vez
    -- da Admin API, e foi exatamente o que aconteceu na primeira tentativa.
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token,
      reauthentication_token
    ) values (
      v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'demo@omnx.app',
      -- Senha de demonstração. Troque antes de expor o link a terceiros.
      extensions.crypt('OmnxDemo@2026', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Demonstração OMNX","email_verified":true,"is_demo":true}'::jsonb,
      now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user::text, v_user,
            jsonb_build_object('sub', v_user::text, 'email', 'demo@omnx.app', 'email_verified', true),
            'email', now(), now(), now());
  end if;

  if not exists (select 1 from workspaces where id = v_ws) then
    insert into workspaces (id, name, owner_id, settings)
    values (v_ws, 'Acme Educação (Demo)', v_user,
            jsonb_build_object('is_demo', true, 'demo_seed_version', 1));
  end if;

  if not exists (select 1 from workspace_members where workspace_id = v_ws and user_id = v_user) then
    insert into workspace_members (workspace_id, user_id, role, is_active)
    values (v_ws, v_user, 'owner', true);
  end if;

  -- Vincular à agência faz o workspace aparecer no seletor para owner/admin
  -- da agência. Remova este bloco se quiser o demo invisível para eles.
  if not exists (select 1 from agency_workspaces where workspace_id = v_ws) then
    insert into agency_workspaces (agency_id, workspace_id, provisioning_mode, status)
    values (v_ag, v_ws, 'manual_byok', 'active');
  end if;
end $$;

-- ─── 2. Taxonomia canônica ──────────────────────────────────────────────────
-- Tudo que os painéis usam como "dimensão". Sem isso, abas inteiras zeram:
-- a aba Tráfego só considera lead pago cujo utm_source esteja em utm_sources,
-- e a aba Orgânico só considera o que estiver em utm_sources_plain.
do $$
declare v_ws uuid := 'd0000000-0000-4000-8000-000000000001';
begin
  -- Canais pagos. public_code é o código de público usado no nome do anúncio.
  insert into utm_sources (workspace_id, nome, slug, utm_source, public_code) values
    (v_ws,'Instagram Ads — Envolvimento','ig-envolvimento','iads-1','P11'),
    (v_ws,'Instagram Ads — Interesses','ig-interesses','iads-2','P12'),
    (v_ws,'Facebook Ads — Lookalike','fb-lookalike','iads-3','P13'),
    (v_ws,'Instagram Ads — Remarketing','ig-rmkt','iads-4','P14'),
    (v_ws,'Google Ads — Search','google-search','gads-1','P21'),
    (v_ws,'YouTube Ads','youtube-ads','yt-1','P22')
  on conflict (workspace_id, utm_source) do update
    set nome = excluded.nome, public_code = excluded.public_code;

  -- Canais orgânicos
  insert into utm_sources_plain (workspace_id, nome, slug, utm_source) values
    (v_ws,'Instagram Orgânico','ig-organico','iorg-1'),
    (v_ws,'YouTube Orgânico','yt-organico','iorg-2'),
    (v_ws,'Indicação','indicacao','iorg-3'),
    (v_ws,'Lista de E-mail','lista-email','iorg-4'),
    (v_ws,'Grupo de WhatsApp','grupo-whatsapp','iorg-5')
  on conflict (workspace_id, utm_source) do update set nome = excluded.nome;

  insert into utm_mediums (workspace_id, nome, utm_medium) values
    (v_ws,'Feed',1),(v_ws,'Stories',2),(v_ws,'Reels',3),(v_ws,'Busca',4),(v_ws,'Bio',5)
  on conflict do nothing;

  insert into funnels (workspace_id, nome) values
    (v_ws,'Aplicação'),(v_ws,'Webinário'),(v_ws,'Desafio'),(v_ws,'Masterclass'),
    (v_ws,'Lançamento'),(v_ws,'Social Selling'),(v_ws,'Evento Presencial'),
    (v_ws,'Recuperação'),(v_ws,'Indicação')
  on conflict (workspace_id, nome) do nothing;

  -- utm_campaigns.funnels é o que liga campanha → funil nos filtros.
  insert into utm_campaigns (workspace_id, nome, utm_campaign, page_code, funnels) values
    (v_ws,'Aplicação Acelerador',1,'PG12','["Aplicação"]'::jsonb),
    (v_ws,'Webinário Escala',2,'PG27','["Webinário"]'::jsonb),
    (v_ws,'Masterclass Gratuita',3,'PG32','["Webinário","Aplicação"]'::jsonb),
    (v_ws,'Desafio 7 Dias',4,'PG24','["Desafio"]'::jsonb),
    (v_ws,'Remarketing Vendas',5,'PG12','["Aplicação"]'::jsonb),
    (v_ws,'Masterclass Escala 6 Dígitos',6,'PG32','["Masterclass","Aplicação"]'::jsonb),
    (v_ws,'Lançamento Turma 12',7,'PG41','["Lançamento"]'::jsonb),
    (v_ws,'Social Selling — DM Instagram',8,'PG09','["Social Selling"]'::jsonb),
    (v_ws,'Evento Presencial SP',9,'PG53','["Evento Presencial"]'::jsonb),
    (v_ws,'Indica e Ganha',10,'PG14','["Indicação"]'::jsonb),
    (v_ws,'Reativação Base Fria',11,'PG12','["Recuperação"]'::jsonb),
    (v_ws,'Webinário Perpétuo',12,'PG27','["Webinário","Aplicação"]'::jsonb)
  on conflict (workspace_id, utm_campaign) do update
    set nome = excluded.nome, funnels = excluded.funnels, page_code = excluded.page_code;

  -- Obrigatório ANTES de qualquer insert em meta_ads_insights: existe um
  -- trigger que rejeita insight cuja conta não esteja vinculada ao workspace.
  insert into workspace_meta_ad_accounts (workspace_id, account_id, is_active)
  values (v_ws,'act_demo_acme', true)
  on conflict do nothing;

  -- Equipe. Os papéis alimentam os filtros de Pré-vendedor e Closer.
  insert into ghl_users (ghl_id, nome, email, role_ghl, deleted, papeis, workspace_id) values
    ('demo-u-01','Bruna Martins','bruna@acmedemo.test','user',false,array['sdr'],v_ws),
    ('demo-u-02','Diego Salles','diego@acmedemo.test','user',false,array['sdr'],v_ws),
    ('demo-u-03','Larissa Prado','larissa@acmedemo.test','user',false,array['sdr'],v_ws),
    ('demo-u-04','Rafael Uchoa','rafael@acmedemo.test','user',false,array['sdr'],v_ws),
    ('demo-u-05','Camila Rocha','camila@acmedemo.test','user',false,array['closer'],v_ws),
    ('demo-u-06','Otávio Lins','otavio@acmedemo.test','user',false,array['closer'],v_ws),
    ('demo-u-07','Priscila Amado','priscila@acmedemo.test','user',false,array['closer'],v_ws),
    ('demo-u-08','Marina Duarte','marina@acmedemo.test','admin',false,array['gestor'],v_ws)
  on conflict (ghl_id) do update set nome = excluded.nome, papeis = excluded.papeis;

  perform setup_workspace_apps_and_permissions(v_ws);
end $$;

-- ─── 3. Permissões legadas por módulo para o usuário de demo ────────────────
-- O usuário é owner (já tem acesso amplo), mas o modelo legado ainda é
-- consultado em algumas telas. Copiamos a lista de módulos existente.
insert into dashboard_user_permissions (workspace_id, user_id, module_key, can_view, can_edit)
select distinct
  'd0000000-0000-4000-8000-000000000001'::uuid,
  'd0000000-0000-4000-8000-000000000002'::uuid,
  module_key, true, true
from dashboard_user_permissions
where workspace_id = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
on conflict do nothing;

-- ─── 4. Integração GHL fictícia (a tela de Configuração não fica vazia) ─────
-- location_id propositalmente inválido e is_active = false: nenhum webhook
-- real jamais casa com ele, então não há risco de roteamento indevido.
insert into ghl_integration_settings (workspace_id, ghl_location_id, webhook_secret, webhook_url, is_active)
values ('d0000000-0000-4000-8000-000000000001','demo-location-acme-educacao','demo-secret-nao-funcional',
        'https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/webhook-ghl', false)
on conflict do nothing;

insert into ghl_calendars (workspace_id, ghl_id, nome, location_id) values
 ('d0000000-0000-4000-8000-000000000001','demo-cal-01','Agenda Comercial Acme','demo-location-acme-educacao'),
 ('d0000000-0000-4000-8000-000000000001','demo-cal-02','Agenda Camila Rocha','demo-location-acme-educacao'),
 ('d0000000-0000-4000-8000-000000000001','demo-cal-03','Agenda Otávio Lins','demo-location-acme-educacao'),
 ('d0000000-0000-4000-8000-000000000001','demo-cal-04','Diagnóstico Gratuito','demo-location-acme-educacao')
on conflict do nothing;

insert into user_dashboard_prefs (user_id, workspace_id, prefs)
values ('d0000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001',
        '{"recuperacao_mode":"exclude_recuperacao"}'::jsonb)
on conflict do nothing;
