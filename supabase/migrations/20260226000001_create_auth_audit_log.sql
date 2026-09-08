-- Migration: Create auth_audit_log table
-- Purpose: Log all authentication events for security auditing
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'otp_sent', 'otp_verified', 'password_reset_requested', 'password_reset_completed', 'login_failed'
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  email TEXT,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auth_audit_log_user_id 
  ON auth_audit_log(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_action 
  ON auth_audit_log(action);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_created_at 
  ON auth_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_audit_log_email 
  ON auth_audit_log(email);

-- Enable RLS
ALTER TABLE auth_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own logs
CREATE POLICY "Users can view own logs" ON auth_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS Policy: Service role can do everything
CREATE POLICY "Service role only" ON auth_audit_log
  FOR ALL TO service_role USING (true);

-- Function to log authentication event
CREATE OR REPLACE FUNCTION log_auth_event(
  p_user_id UUID,
  p_action TEXT,
  p_status TEXT,
  p_email TEXT,
  p_ip_address INET,
  p_user_agent TEXT,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO auth_audit_log (
    user_id,
    action,
    status,
    email,
    ip_address,
    user_agent,
    error_message,
    metadata
  ) VALUES (
    p_user_id,
    p_action,
    p_status,
    p_email,
    p_ip_address,
    p_user_agent,
    p_error_message,
    p_metadata
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION log_auth_event(UUID, TEXT, TEXT, TEXT, INET, TEXT, TEXT, JSONB) TO authenticated;

-- Function to get user's recent auth events
CREATE OR REPLACE FUNCTION get_user_auth_events(
  p_user_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  action TEXT,
  status TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    auth_audit_log.id,
    auth_audit_log.action,
    auth_audit_log.status,
    auth_audit_log.ip_address,
    auth_audit_log.created_at
  FROM auth_audit_log
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_auth_events(UUID, INT) TO authenticated;
