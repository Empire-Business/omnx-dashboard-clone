-- Simplificar tabela webhooks_ghl - apenas payload jsonb
DROP TABLE IF EXISTS webhooks_ghl;
DROP TYPE IF EXISTS webhook_status CASCADE;

CREATE TABLE webhooks_ghl (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payload jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Índice para buscas no jsonb
CREATE INDEX idx_webhooks_ghl_payload ON webhooks_ghl USING GIN(payload);

-- RLS
ALTER TABLE webhooks_ghl ENABLE ROW LEVEL SECURITY;

-- Permitir insert anônimo (Edge Function)
CREATE POLICY "Allow insert" ON webhooks_ghl
    FOR INSERT TO anon WITH CHECK (true);

-- Service role pode tudo
CREATE POLICY "Service role full access" ON webhooks_ghl
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Autenticados podem ler
CREATE POLICY "Authenticated read" ON webhooks_ghl
    FOR SELECT TO authenticated USING (true);
