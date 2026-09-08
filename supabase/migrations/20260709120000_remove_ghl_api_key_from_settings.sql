-- Migration: Remove ghl_api_key from ghl_integration_settings
-- Rationale: GHL API key must be configured as an environment variable
-- (GHL_API_KEY) in the deployment platform (Vercel / Supabase Secrets),
-- never stored in the database or collected by the frontend UI.
--
-- All edge functions already read GHL_API_KEY from Deno.env / process.env.
-- This migration drops the insecure column and removes the deprecated
-- setup-ghl-integration endpoint behavior that accepted the key in the body.

ALTER TABLE ghl_integration_settings
DROP COLUMN IF EXISTS ghl_api_key;
