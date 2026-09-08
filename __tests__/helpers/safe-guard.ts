/**
 * Guarda de execução (Fase 0.4) — impede a suite de rodar contra o banco errado.
 *
 * Registrada como `setupFiles` em `eb-dash2/vitest.integration.config.ts`: roda ANTES de
 * qualquer teste e ABORTA o processo se `SUPABASE_URL` não for (a) local ou (b) o projeto
 * de teste declarado em `TEST_PROJECT_REF`. Produção é recusada por deny-list explícita.
 *
 * Isso torna impossível alguém apontar a suite (que cria/apaga dados) para produção por engano.
 */

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

// Refs que NUNCA podem ser alvo da suite (deny-list). Refs de URL são públicos (não-secret).
const DENYLIST_PROJECT_REFS = new Set<string>([
  'qzesffnkqgelmtfblzkr', // producao: "Dash novo EmpireBusiness (OpenClaw)"
]);

function extractRef(urlStr: string): { host: string; ref: string | null; isLocal: boolean } {
  let host = '';
  try {
    host = new URL(urlStr).hostname;
  } catch {
    throw new Error(`[safe-guard] SUPABASE_URL invalida: "${urlStr}"`);
  }
  const isLocal = LOCAL_HOSTS.has(host);
  const m = host.match(/^([a-z0-9]{20})\.supabase\.(co|in)$/);
  return { host, ref: m ? m[1] : null, isLocal };
}

export function assertSafeTestTarget(): void {
  const url = process.env.SUPABASE_URL || '';
  if (!url) {
    throw new Error(
      '[safe-guard] SUPABASE_URL vazia. Preencha .env.test (ver __tests__/ENV-SETUP.md).'
    );
  }

  const { host, ref, isLocal } = extractRef(url);

  if (isLocal) return; // Supabase local (Docker) — sempre permitido.

  if (ref && DENYLIST_PROJECT_REFS.has(ref)) {
    throw new Error(
      `[safe-guard] RECUSADO: SUPABASE_URL aponta para PRODUCAO (${ref}). ` +
        `A suite de isolamento NUNCA roda contra producao.`
    );
  }

  const allowRef = (process.env.TEST_PROJECT_REF || '').trim();
  if (!allowRef) {
    throw new Error(
      `[safe-guard] RECUSADO: SUPABASE_URL nao e local (${host}) e TEST_PROJECT_REF nao foi ` +
        `definido. Declare o ref do projeto de teste em .env.test (TEST_PROJECT_REF=...).`
    );
  }

  if (ref !== allowRef) {
    throw new Error(
      `[safe-guard] RECUSADO: SUPABASE_URL (${ref ?? host}) difere de TEST_PROJECT_REF ` +
        `(${allowRef}). Aponte para o projeto de teste correto ou ajuste TEST_PROJECT_REF.`
    );
  }

  // Permitido: é o projeto de teste declarado.
}

// Executa na importação (setupFile roda antes dos testes).
assertSafeTestTarget();
