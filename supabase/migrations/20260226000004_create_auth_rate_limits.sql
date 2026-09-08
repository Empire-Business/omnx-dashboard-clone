-- Migration: Create auth_rate_limits table
-- Purpose: Implement rate limiting for authentication endpoints
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email or IP address
  action TEXT NOT NULL, -- 'otp_request', 'otp_verify', 'password_reset'
  attempt_count INT DEFAULT 1 NOT NULL,
  first_attempt_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_attempt_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  blocked_until TIMESTAMPTZ,
  
  UNIQUE(identifier, action)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_identifier_action 
  ON auth_rate_limits(identifier, action);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_blocked_until 
  ON auth_rate_limits(blocked_until);

-- Enable RLS
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service_role can access
CREATE POLICY "Service role only" ON auth_rate_limits
  FOR ALL TO service_role USING (true);

-- Function to check rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INT DEFAULT 5,
  p_window_minutes INT DEFAULT 60
)
RETURNS TABLE (
  is_allowed BOOLEAN,
  attempts_remaining INT,
  blocked_until TIMESTAMPTZ
) AS $$
DECLARE
  v_rate_limit auth_rate_limits%ROWTYPE;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start := now() - (p_window_minutes || ' minutes')::INTERVAL;
  
  -- Get or create rate limit record
  SELECT * INTO v_rate_limit
  FROM auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;
  
  IF v_rate_limit IS NULL THEN
    -- First attempt
    INSERT INTO auth_rate_limits (identifier, action, attempt_count)
    VALUES (p_identifier, p_action, 1);
    
    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::TIMESTAMPTZ;
  ELSE
    -- Check if blocked
    IF v_rate_limit.blocked_until IS NOT NULL AND v_rate_limit.blocked_until > now() THEN
      RETURN QUERY SELECT false, 0, v_rate_limit.blocked_until;
    END IF;
    
    -- Check if window expired
    IF v_rate_limit.last_attempt_at < v_window_start THEN
      -- Reset counter
      UPDATE auth_rate_limits
      SET attempt_count = 1, first_attempt_at = now(), last_attempt_at = now()
      WHERE identifier = p_identifier AND action = p_action;
      
      RETURN QUERY SELECT true, p_max_attempts - 1, NULL::TIMESTAMPTZ;
    ELSE
      -- Increment counter
      UPDATE auth_rate_limits
      SET attempt_count = attempt_count + 1, last_attempt_at = now()
      WHERE identifier = p_identifier AND action = p_action;
      
      -- Check if exceeded
      IF v_rate_limit.attempt_count >= p_max_attempts THEN
        -- Block for 15 minutes
        UPDATE auth_rate_limits
        SET blocked_until = now() + '15 minutes'::INTERVAL
        WHERE identifier = p_identifier AND action = p_action;
        
        RETURN QUERY SELECT false, 0, now() + '15 minutes'::INTERVAL;
      ELSE
        RETURN QUERY SELECT true, p_max_attempts - v_rate_limit.attempt_count - 1, NULL::TIMESTAMPTZ;
      END IF;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, TEXT, INT, INT) TO authenticated;

-- Function to reset rate limit
CREATE OR REPLACE FUNCTION reset_rate_limit(
  p_identifier TEXT,
  p_action TEXT
)
RETURNS void AS $$
BEGIN
  DELETE FROM auth_rate_limits
  WHERE identifier = p_identifier AND action = p_action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION reset_rate_limit(TEXT, TEXT) TO authenticated;
