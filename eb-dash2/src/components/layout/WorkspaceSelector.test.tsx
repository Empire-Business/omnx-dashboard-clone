import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  listUserWorkspaces: vi.fn(),
  resolveTenancyMode: vi.fn(),
}))

// Mantém isSingleTenantMode()/SINGLE_WORKSPACE_MODE reais, mas evita chamada ao
// Supabase dentro do useEffect do componente.
vi.mock('@/lib/workspace', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workspace')>('@/lib/workspace')
  return {
    ...actual,
    listUserWorkspaces: mocks.listUserWorkspaces,
    resolveTenancyMode: mocks.resolveTenancyMode,
  }
})

import { WorkspaceSelector } from './WorkspaceSelector'

const wsA = { workspace_id: 'a', role: 'owner', workspaces: { id: 'a', name: 'Workspace A' } }
const wsB = { workspace_id: 'b', role: 'owner', workspaces: { id: 'b', name: 'Workspace B' } }

/**
 * Regressão de UX single-tenant (Fase 0.3): cliente comum (single-tenant,
 * resolveTenancyMode -> 'single-tenant') NUNCA vê o seletor de workspace.
 * Travar isso aqui.
 */
describe('WorkspaceSelector — regressão single-tenant (Fase 0.3)', () => {
  it('não renderiza o seletor quando resolveTenancyMode resolve single-tenant', async () => {
    mocks.listUserWorkspaces.mockResolvedValue([wsA])
    mocks.resolveTenancyMode.mockResolvedValue('single-tenant')

    const { container } = render(<WorkspaceSelector />)
    await waitFor(() => expect(mocks.resolveTenancyMode).toHaveBeenCalled())

    expect(screen.queryByTestId('workspace-selector-trigger')).toBeNull()
    expect(container.firstChild).toBeNull()
  })
})

/**
 * Fase 5 (fatia 3b): owner/admin de agência com 2+ workspaces precisa trocar
 * de sub-conta para operar — o lock single-tenant não pode escondê-lo dele.
 */
describe('WorkspaceSelector — visível para admin de agência (Fase 5, fatia 3b)', () => {
  it('renderiza o seletor quando resolveTenancyMode resolve multi-tenant e há 2+ workspaces', async () => {
    mocks.listUserWorkspaces.mockResolvedValue([wsA, wsB])
    mocks.resolveTenancyMode.mockResolvedValue('multi-tenant')

    render(<WorkspaceSelector />)

    await waitFor(() => expect(screen.getByTestId('workspace-selector-trigger')).toBeInTheDocument())
  })

  it('continua escondido em multi-tenant com apenas 1 workspace', async () => {
    mocks.listUserWorkspaces.mockResolvedValue([wsA])
    mocks.resolveTenancyMode.mockResolvedValue('multi-tenant')

    const { container } = render(<WorkspaceSelector />)
    await waitFor(() => expect(mocks.resolveTenancyMode).toHaveBeenCalled())

    expect(container.firstChild).toBeNull()
  })
})
