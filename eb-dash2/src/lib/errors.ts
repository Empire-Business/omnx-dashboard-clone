export const GENERIC_OPERATION_ERROR = 'Não foi possível concluir a operação. Tente novamente.'

export function publicErrorMessage(_error: unknown, fallback = GENERIC_OPERATION_ERROR): string {
  return fallback
}

/**
 * Extrai a mensagem real de qualquer erro — incluindo PostgrestError do
 * Supabase, que NÃO é instanceof Error (é um objeto com .message). Use em
 * fluxos de configuração admin, onde o usuário precisa do motivo real para
 * agir (diferente de publicErrorMessage, que esconde detalhes de propósito).
 */
export function extractErrorMessage(error: unknown, fallback = GENERIC_OPERATION_ERROR): string {
  if (!error) return fallback
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  if (typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
