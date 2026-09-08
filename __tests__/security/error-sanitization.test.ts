import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('sanitização de erros públicos', () => {
  it('publicError nunca inclui o detalhe interno no corpo HTTP', async () => {
    const { publicError } = await import('../../supabase/functions/_shared/safe-error.ts')
    const response = publicError('internal_error', 'req-test-123')
    const body = await response.json() as Record<string, string>

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Não foi possível concluir a operação. Tente novamente.',
      code: 'internal_error',
      request_id: 'req-test-123',
    })
  })

  it.each([
    'bot-chat/index.ts',
    'bot-chat-data/index.ts',
    'invite-user/index.ts',
    'workspace-apps/index.ts',
    'setup-ghl-integration/index.ts',
    'discover-ghl-config/index.ts',
    'test-workspace-credential/index.ts',
    'sync-meta-ads/index.ts',
    'sync-contact-attribution/index.ts',
    'sync-opp-pipelines/index.ts',
    'sync-ad-permalinks/index.ts',
    'crm-buscar-lead/index.ts',
    'crm-sync-stats/index.ts',
    'webhook-compras/index.ts',
    'crm-registrar-venda/index.ts',
    'generate-creative-code/index.ts',
  ])('edge function usa resposta segura sem refletir erro: %s', (file) => {
    const source = read(join('supabase', 'functions', file))

    expect(source).toContain("_shared/safe-error.ts")
    expect(source).not.toMatch(/JSON\.stringify\(\{\s*error:\s*(?:\w+\.)?message/)
    expect(source).not.toMatch(/JSON\.stringify\(\{\s*error:\s*err instanceof Error/)
    expect(source).not.toMatch(/jsonResponse\(\{[^}]*error:\s*(?:\w+\.)?message/s)
  })

  it('discovery não reflete URL, corpo ou mensagem do provedor GHL', () => {
    const source = read('supabase/functions/discover-ghl-config/index.ts')

    expect(source).not.toContain('Endpoint não encontrado (${res.status}): ${url}')
    expect(source).not.toContain('Erro da API GHL (${res.status}): ${text.slice(0, 500)}')
    expect(source).not.toContain('Falha de rede/timeout ao chamar GHL: ${message}')
  })

  it.each([
    'sync-meta-ads/index.ts',
    'sync-contact-attribution/index.ts',
    'sync-opp-pipelines/index.ts',
    'sync-ad-permalinks/index.ts',
  ])('sincronizador não expõe detalhes internos na resposta: %s', (file) => {
    const source = read(join('supabase', 'functions', file))

    expect(source).not.toMatch(/error:\s*(?:err|error) instanceof Error/)
    expect(source).not.toMatch(/error:\s*`[^`]*\$\{/)
  })

  it.each([
    'eb-dash2/src/pages/traqueamento/tabs/CodsUtmTab.tsx',
    'eb-dash2/src/pages/admin/AdminUsersPage.tsx',
    'eb-dash2/src/hooks/useBotChat.ts',
    'eb-dash2/src/contexts/PermissionsContext.tsx',
  ])('frontend não exibe mensagem crua do erro: %s', (file) => {
    const source = read(file)

    expect(source).not.toContain('error.message')
    expect(source).not.toContain('err instanceof Error ? err.message')
  })
})
