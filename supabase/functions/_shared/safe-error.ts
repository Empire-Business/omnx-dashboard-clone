export type PublicErrorCode =
  | 'internal_error'
  | 'service_unavailable'
  | 'invalid_request'
  | 'unauthorized'
  | 'forbidden'

const PUBLIC_MESSAGES: Record<PublicErrorCode, string> = {
  internal_error: 'Não foi possível concluir a operação. Tente novamente.',
  service_unavailable: 'Serviço temporariamente indisponível. Tente novamente.',
  invalid_request: 'Não foi possível validar a solicitação.',
  unauthorized: 'Sua sessão não é válida. Faça login novamente.',
  forbidden: 'Você não tem permissão para executar esta ação.',
}

export function createRequestId(): string {
  return crypto.randomUUID()
}

export function publicError(
  code: PublicErrorCode,
  requestId: string,
  status = 500,
  headers: HeadersInit = {},
): Response {
  return new Response(
    JSON.stringify({
      error: PUBLIC_MESSAGES[code],
      code,
      request_id: requestId,
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    },
  )
}

export function logSafeError(context: string, requestId: string, error: unknown): void {
  const errorName = error instanceof Error ? error.name : typeof error
  console.error(`[${context}] falha interna`, { request_id: requestId, error_name: errorName })
}
