// CORS headers for Supabase Edge Functions
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-workspace-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
