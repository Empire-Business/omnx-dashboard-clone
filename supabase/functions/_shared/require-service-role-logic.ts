// Guard genérico de chamador autorizado — módulo PURO (sem imports Deno/esm),
// testável em Node (vitest) e importado pelas edge functions Deno.
//
// Motivo: o `verify_jwt` padrão do Supabase só valida a ASSINATURA do JWT — tanto
// a anon key quanto a service_role key são JWTs válidos assinados pelo mesmo
// projeto. Sem este guard, qualquer pessoa com a anon key (pública, embutida no
// bundle JS do frontend) pode chamar diretamente edge functions que deveriam ser
// só-cron/internas e disparar ações administrativas (sync em massa, reconciliação,
// envio de e-mail, etc.).
//
// `extractBearerToken` e `isServiceRoleCaller` são puros: recebem o header
// Authorization e a service role key já lidos (Deno.env.get fica na camada fina
// wrapper.ts), o que permite testar toda a lógica de comparação sem depender do
// runtime Deno.

import { secretsEqual } from './webhook-ghl-auth.ts';

export function extractBearerToken(authorizationHeader: string | null | undefined): string {
  if (!authorizationHeader) return '';
  return authorizationHeader.replace(/^Bearer\s+/i, '').trim();
}

/**
 * true somente se o token do header Authorization for EXATAMENTE a service_role
 * key configurada no ambiente. Fail-closed: sem service_role key configurada
 * (erro de configuração), nunca autoriza — nem mesmo um header vazio "casa" com
 * uma env var vazia.
 */
export function isServiceRoleCaller(
  authorizationHeader: string | null | undefined,
  serviceRoleKey: string | null | undefined,
): boolean {
  if (!serviceRoleKey) return false;
  const token = extractBearerToken(authorizationHeader);
  if (!token) return false;
  return secretsEqual(token, serviceRoleKey);
}
