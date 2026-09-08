import { describe, it, expect } from 'vitest'
import { isSingleTenantMode, SINGLE_WORKSPACE_MODE } from './workspace'
import { resolveTenancyModeFromCounts } from './tenancy-mode'

/**
 * Regressão de UX single-tenant (Fase 0.3 do plano multi-tenant).
 *
 * Hoje o produto opera no modelo "1 instância = 1 empresa": a estrutura de
 * workspaces existe por baixo, mas o usuário nunca vê. Estes testes travam
 * esse comportamento para que nenhuma mudança futura exponha o conceito de
 * workspace antes da hora (Fase 1).
 */
describe('Regressão single-tenant (Fase 0.3)', () => {
  it('SINGLE_WORKSPACE_MODE está ligado (lock de instância única)', () => {
    expect(SINGLE_WORKSPACE_MODE).toBe(true)
  })

  it('isSingleTenantMode() retorna true no cenário atual', () => {
    expect(isSingleTenantMode()).toBe(true)
  })
})

describe('resolveTenancyModeFromCounts (Fase 1 — fatia 3)', () => {
  // Critério de aceite (seção 4.1, item 4): cliente atual (1 workspace, 0
  // agency_members) continua em 'single-tenant' sem perceber mudança.
  it("1 workspace + 0 agency => 'single-tenant' (cliente atual não muda)", () => {
    expect(resolveTenancyModeFromCounts({ workspaceCount: 1, agencyMemberCount: 0 })).toBe('single-tenant')
  })

  it("0 workspace + 0 agency => 'single-tenant' (conta vazia/nova)", () => {
    expect(resolveTenancyModeFromCounts({ workspaceCount: 0, agencyMemberCount: 0 })).toBe('single-tenant')
  })

  it("2 workspaces + 0 agency => 'multi-tenant'", () => {
    expect(resolveTenancyModeFromCounts({ workspaceCount: 2, agencyMemberCount: 0 })).toBe('multi-tenant')
  })

  it("1 workspace + 1 agency => 'multi-tenant'", () => {
    expect(resolveTenancyModeFromCounts({ workspaceCount: 1, agencyMemberCount: 1 })).toBe('multi-tenant')
  })

  it("1 workspace + N agency (>1) => 'multi-tenant'", () => {
    expect(resolveTenancyModeFromCounts({ workspaceCount: 1, agencyMemberCount: 2 })).toBe('multi-tenant')
  })
})
