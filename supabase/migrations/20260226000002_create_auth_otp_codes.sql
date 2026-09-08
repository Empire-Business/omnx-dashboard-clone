-- Migration: Create auth_otp_codes table
-- Purpose: Store OTP codes for authentication
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS auth_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT,
  code VARCHAR(8) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('email', 'sms')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INT DEFAULT 0 NOT NULL,
  used BOOLEAN DEFAULT false NOT NULL,
  ip_address INET,
  user_agent TEXT,
  
  -- Constraints
  CONSTRAINT otp_max_attempts CHECK (attempts <= 5)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_email_created 
  ON auth_otp_codes(email, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_code 
  ON auth_otp_codes(code);

CREATE INDEX IF NOT EXISTS idx_auth_otp_codes_expires 
  ON auth_otp_codes(expires_at);

-- Enable RLS
ALTER TABLE auth_otp_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service_role can access
CREATE POLICY "Service role only" ON auth_otp_codes
  FOR ALL TO service_role USING (true);

-- Function to clean up expired OTP codes (runs daily)
CREATE OR REPLACE FUNCTION cleanup_expired_otp_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM auth_otp_codes
  WHERE expires_at < now() AND used = false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (for scheduled jobs)
GRANT EXECUTE ON FUNCTION cleanup_expired_otp_codes() TO authenticated;
