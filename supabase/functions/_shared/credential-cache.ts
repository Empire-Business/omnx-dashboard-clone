/**
 * Cache de credenciais por isolate (Fase 2 — plano v3 secao 5.3).
 *
 * Modulo PURO (sem imports Deno/esm) para ser testavel em Node (vitest) e
 * reutilizavel pelo helper Deno `resolve-workspace-credentials.ts`.
 *
 * Decisao do plano (5.3.1 + 5.3.2):
 *  - a chave inclui rotation_version, de modo que uma rotacao/revogacao
 *    invalida a entrada assim que o helper rele o rotation_version (a cada
 *    request, leitura leve de int);
 *  - o TTL curto (<=10s) e a GARANTIA efetiva da janela de revogacao — deletar
 *    a secret do Vault nao apaga o plaintext ja em memoria do isolate; o que
 *    limita a exposicao e o TTL.
 */

export const CREDENTIAL_CACHE_TTL_MS = 10_000 // SLA: janela maxima pos-revogacao

export interface CredentialCacheEntry {
  apiKey: string
  expiresAt: number
}

export function makeCredentialCacheKey(
  workspaceId: string,
  provider: string,
  rotationVersion: number
): string {
  return `${workspaceId}:${provider}:${rotationVersion}`
}

export function isCacheEntryValid(
  entry: CredentialCacheEntry | undefined,
  now: number
): boolean {
  return !!entry && entry.expiresAt > now
}
