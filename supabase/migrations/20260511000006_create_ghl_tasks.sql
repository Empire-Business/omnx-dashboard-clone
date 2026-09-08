-- ============================================================
-- Migration: Tabela ghl_tasks + sync de TaskCreate/Update/Complete/Delete
--
-- Tasks são criadas pelos SDRs nos contatos do GHL para agendar
-- ligações futuras (ex: "Ligar amanhã às 10h").
-- Essa migration captura esses eventos em tempo real via trigger
-- e os expõe no painel de discagem como Prioridade 2.
-- ============================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS ghl_tasks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_task_id         TEXT        NOT NULL UNIQUE,
  contact_ghl_id      TEXT,
  contato_id          UUID        REFERENCES contatos(id),
  title               TEXT,
  due_date            TIMESTAMPTZ,
  completed           BOOLEAN     NOT NULL DEFAULT false,
  deleted             BOOLEAN     NOT NULL DEFAULT false,
  assigned_to_ghl_id  TEXT,
  task_type           TEXT        DEFAULT 'Call',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ghl_tasks_due_date_idx      ON ghl_tasks (due_date) WHERE NOT completed AND NOT deleted;
CREATE INDEX IF NOT EXISTS ghl_tasks_contato_id_idx    ON ghl_tasks (contato_id) WHERE NOT completed AND NOT deleted;
CREATE INDEX IF NOT EXISTS ghl_tasks_contact_ghl_idx   ON ghl_tasks (contact_ghl_id);

COMMENT ON TABLE ghl_tasks IS
  'Tasks criadas nos contatos do GHL (via webhook TaskCreate/Update/Complete/Delete). '
  'Usada no painel de discagem para exibir ligações agendadas como Prioridade 2.';

-- 2. RLS — leitura para usuários autenticados
ALTER TABLE ghl_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_ghl_tasks" ON ghl_tasks;
CREATE POLICY "authenticated_read_ghl_tasks"
ON ghl_tasks FOR SELECT TO authenticated
USING (true);

-- 3. Função de processamento de tasks
CREATE OR REPLACE FUNCTION processar_task_ghl(p_webhook_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_payload          JSONB;
  v_type             TEXT;
  v_task_id          TEXT;
  v_contact_ghl_id   TEXT;
  v_title            TEXT;
  v_due_date         TIMESTAMPTZ;
  v_completed        BOOLEAN;
  v_assigned_to      TEXT;
  v_task_type        TEXT;
  v_contato_id       UUID;
BEGIN
  SELECT payload INTO v_payload
  FROM webhooks_ghl WHERE id = p_webhook_id;

  IF v_payload IS NULL THEN RETURN; END IF;

  v_type := v_payload->>'type';

  -- Só processa eventos de Task
  IF v_type NOT IN ('TaskCreate', 'TaskUpdate', 'TaskComplete', 'TaskDelete') THEN
    RETURN;
  END IF;

  -- GHL usa 'id' ou 'taskId' dependendo da versão do webhook
  v_task_id        := COALESCE(NULLIF(TRIM(v_payload->>'taskId'), ''), NULLIF(TRIM(v_payload->>'id'), ''));
  v_contact_ghl_id := NULLIF(TRIM(v_payload->>'contactId'), '');
  v_title          := NULLIF(TRIM(v_payload->>'title'), '');
  v_assigned_to    := NULLIF(TRIM(v_payload->>'assignedTo'), '');
  v_task_type      := COALESCE(NULLIF(TRIM(v_payload->>'taskType'), ''), 'Call');
  v_completed      := COALESCE((v_payload->>'completed')::BOOLEAN, false);

  -- Tenta parsear dueDate em múltiplos formatos
  BEGIN
    v_due_date := (v_payload->>'dueDate')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    v_due_date := NULL;
  END;

  IF v_task_id IS NULL THEN RETURN; END IF;

  -- Resolve contato_id pelo ghl_id do contato
  IF v_contact_ghl_id IS NOT NULL THEN
    SELECT id INTO v_contato_id
    FROM contatos WHERE ghl_id = v_contact_ghl_id
    LIMIT 1;
  END IF;

  -- TaskDelete
  IF v_type = 'TaskDelete' THEN
    UPDATE ghl_tasks SET deleted = true, updated_at = now()
    WHERE ghl_task_id = v_task_id;
    RETURN;
  END IF;

  -- TaskComplete
  IF v_type = 'TaskComplete' THEN
    UPDATE ghl_tasks SET completed = true, updated_at = now()
    WHERE ghl_task_id = v_task_id;
    RETURN;
  END IF;

  -- TaskCreate / TaskUpdate — upsert
  INSERT INTO ghl_tasks (
    ghl_task_id, contact_ghl_id, contato_id, title,
    due_date, completed, assigned_to_ghl_id, task_type
  ) VALUES (
    v_task_id, v_contact_ghl_id, v_contato_id, v_title,
    v_due_date, v_completed, v_assigned_to, v_task_type
  )
  ON CONFLICT (ghl_task_id) DO UPDATE SET
    title               = EXCLUDED.title,
    due_date            = EXCLUDED.due_date,
    completed           = EXCLUDED.completed,
    contato_id          = COALESCE(EXCLUDED.contato_id, ghl_tasks.contato_id),
    contact_ghl_id      = COALESCE(EXCLUDED.contact_ghl_id, ghl_tasks.contact_ghl_id),
    assigned_to_ghl_id  = EXCLUDED.assigned_to_ghl_id,
    task_type           = EXCLUDED.task_type,
    deleted             = false,
    updated_at          = now();
END;
$$;

COMMENT ON FUNCTION processar_task_ghl IS
  'Processa eventos TaskCreate/Update/Complete/Delete do GHL e mantém ghl_tasks atualizada. '
  'Chamada pelo trigger auto_extrair_dados_ghl após cada INSERT em webhooks_ghl.';

-- 4. Atualiza o trigger para chamar processar_task_ghl em eventos de Task
CREATE OR REPLACE FUNCTION trigger_extrair_dados_ghl()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_contact_ghl_id TEXT;
  v_type           TEXT;
BEGIN
  v_type := NEW.payload->>'type';

  -- Passo 1: processar dados do webhook (contatos, opps, vendas)
  PERFORM extrair_dados_ghl(NEW.id);

  -- Passo 2: processar tasks do GHL
  IF v_type IN ('TaskCreate', 'TaskUpdate', 'TaskComplete', 'TaskDelete') THEN
    PERFORM processar_task_ghl(NEW.id);
  END IF;

  -- Passo 3: sincronizar tags do contato imediatamente
  v_contact_ghl_id := TRIM(NEW.payload->>'contact_id');
  IF v_contact_ghl_id IS NOT NULL AND v_contact_ghl_id != '' THEN
    PERFORM sync_tags_from_webhook_target(v_contact_ghl_id);
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_extrair_dados_ghl IS
  'Trigger após INSERT em webhooks_ghl: '
  '(1) extrair_dados_ghl — contatos/opps/vendas, '
  '(2) processar_task_ghl — tasks de ligação, '
  '(3) sync_tags_from_webhook_target — tags em tempo real.';
