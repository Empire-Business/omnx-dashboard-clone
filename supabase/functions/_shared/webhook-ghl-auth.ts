// Fase 2 (fatia 6) — autenticacao do webhook-ghl por workspace (manual_byok).
//
// Modulo PURO (sem imports Deno/esm) testado em Node (vitest) e importado pela
// edge function Deno. Contem:
//   - extractLocationId(payload): extrai o locationId dos formatos que o GHL
//     envia (varia por evento). Sem locationId, nao ha como saber o tenant.
//   - secretsEqual(a, b): comparacao em TEMPO CONSTANTE do secret informado com
//     o webhook_secret do workspace (evita vazar o conteudo via timing).

export function extractLocationId(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null | undefined;
  const candidates: unknown[] = [
    p?.locationId,
    (p?.location as Record<string, unknown> | undefined)?.id,
    p?.location_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const t = c.trim();
      if (t.length > 0) return t;
    }
  }
  return null;
}

/**
 * Comparacao em tempo constante. Retorna false se qualquer lado for nulo/nao-string
 * ou se os tamanhos diferirem. O laco percorre o MAIOR tamanho para nao vazar
 * o conteudo via timing quando os tamanhos sao iguais; a diferenca de tamanho em
 * si ja e publica (o atacante controla o input), entao short-circuit de tamanho
 * nao reduz a seguranca do conteudo.
 */
export function secretsEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
