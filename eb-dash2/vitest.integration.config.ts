import path from 'path'
import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// Config dos testes de INTEGRAÇÃO (pasta __tests__ na raiz do projeto).
// Vive em eb-dash2/ para resolver o pacote `vitest` já instalado aqui, mas aponta
// o `root` para a raiz do projeto (onde ficam __tests__ e .env.test).
// Roda contra Supabase LOCAL (`supabase start`) ou projeto de TESTE. NUNCA produção
// (a trava __tests__/helpers/safe-guard.ts aborta se apontar errado).
const ROOT = path.resolve(__dirname, '..')

export default defineConfig(({ mode }) => {
  const testEnvMode = process.env.TEST_ENV_MODE || mode || 'test'

  if (!['test', 'staging'].includes(testEnvMode)) {
    throw new Error(
      `[vitest.integration] TEST_ENV_MODE invalido: ${testEnvMode}. Use somente "test" ou "staging".`,
    )
  }

  const env = loadEnv(testEnvMode, ROOT, '')
  Object.assign(process.env, env)
  return {
    root: ROOT,
    test: {
      environment: 'node',
      globals: true,
      setupFiles: ['__tests__/helpers/safe-guard.ts'],
      include: ['__tests__/**/*.test.ts'],
      exclude: ['node_modules', 'eb-dash2/**'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      // Fase 0/2026-07-11 — fix de flakiness: os ~35 arquivos desta suite rodam
      // TODOS contra o MESMO projeto Supabase de teste (compartilhado, sem sandbox
      // por arquivo). O workflow de CI já serializa RUNS diferentes (concurrency
      // group), mas o vitest por padrão roda os arquivos de UM MESMO run em
      // paralelo (fileParallelism: true) — dezenas de `auth.admin.createUser` e
      // seeds cruzados batem no mesmo banco ao mesmo tempo, estourando rate limit
      // do Supabase Auth e causando corrida em RPCs de leitura logo após um
      // DELETE/INSERT de outro arquivo (já mascarou 1 resultado de PR antes).
      // fileParallelism:false serializa os ARQUIVOS (mantém os `it()` dentro de
      // cada arquivo no ritmo de sempre) — elimina a causa raiz sem reescrever
      // nenhum teste. Custo: suite mais lenta (soma em vez de máximo), aceitável
      // frente a "suite em que ninguém confia".
      fileParallelism: false,
    },
  }
})
