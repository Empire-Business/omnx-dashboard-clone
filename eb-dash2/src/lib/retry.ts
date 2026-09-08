// Retry para chamadas de rede transitórias (ex: `TypeError: Failed to fetch`,
// abort/timeout). Usado nos loaders de Produtividade, que faziam falhas
// intermitentes serem engolidas e a tela mostrar "0" sem aviso.
//
// Reexecuta o thunk (que deve CONSTRUIR e disparar a query a cada tentativa —
// não reutilizar um builder já consumido) com backoff linear. Se todas as
// tentativas falharem, relança o último erro para o chamador tratar/logar.
export async function retryAsync<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 600,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)))
      }
    }
  }
  throw lastErr
}
