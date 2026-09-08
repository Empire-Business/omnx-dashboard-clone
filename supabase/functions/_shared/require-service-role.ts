// Wrapper Deno fino sobre require-service-role-logic.ts (lógica pura testada em Node).
// Use nas edge functions que só devem ser chamadas pelo backend (cron via
// net.http_post com service_role_key) — nunca diretamente pelo frontend com a
// anon key, mesmo que o `verify_jwt` do Supabase aceite a anon key como JWT válido.
//
// v1.2 — dupla verificação (fallback do mais forte):
//   1. (preferencial) Decodifica o JWT e verifica claim `role === 'service_role'`.
//      Imune a key rotation; a assinatura do JWT já foi validada pelo gateway
//      Supabase (função deployada SEM --no-verify-jwt).
//   2. (fallback) Comparação exata do token contra a env var — cobre cenários onde
//      o gateway deixa passar um JWT sem claim role (ex: token de usuário logado).

import { extractBearerToken, isServiceRoleCaller as isServiceRoleCallerPure } from './require-service-role-logic.ts'

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(payload)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

export function isServiceRoleCaller(req: Request): boolean {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return false

  // Via preferencial: claim role no JWT (imune a key rotation)
  const payload = decodeJwtPayload(token)
  if (payload?.role === 'service_role') return true

  // Fallback: comparação exata contra env var
  const serviceKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SB_SERVICE_ROLE_KEY') ||
    ''
  if (!serviceKey) return false
  return isServiceRoleCallerPure(req.headers.get('Authorization'), serviceKey)
}

/**
 * Guard fail-closed para functions 100% cron/internas (sem caminho legítimo de
 * usuário autenticado). Chame logo após tratar OPTIONS/CORS; se retornar uma
 * Response, devolva-a imediatamente sem executar o resto do handler.
 */
export function requireServiceRoleCaller(
  req: Request,
  corsHeaders: Record<string, string> = {},
): Response | null {
  if (isServiceRoleCaller(req)) return null;
  return new Response(
    JSON.stringify({
      error: 'Unauthorized: esta função só pode ser chamada internamente (service_role).',
    }),
    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}
