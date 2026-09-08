-- Migration: Create auth_password_reset_tokens table
-- Purpose: Store password reset tokens for secure password recovery
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_user_id 
  ON auth_password_reset_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_token_hash 
  ON auth_password_reset_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_auth_password_reset_tokens_expires 
  ON auth_password_reset_tokens(expires_at);

-- Enable RLS
ALTER TABLE auth_password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service_role can access
CREATE POLICY "Service role only" ON auth_password_reset_tokens
  FOR ALL TO service_role USING (true);

-- Function to clean up expired reset tokens (runs daily)
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_password_reset_tokens
  WHERE expires_at < now() AND used_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION cleanup_expired_reset_tokens() TO authenticated;
