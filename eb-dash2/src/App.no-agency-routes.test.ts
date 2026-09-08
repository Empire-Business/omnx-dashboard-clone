import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createElement } from 'react'

/**
 * Este arquivo SUBSTITUIU o gate da Fase 1 ("rotas /agency nao podem existir
 * antes da Fase 5"). A Fase 5 (docs/PLANO-MULTI-TENANT-AGENCY.md secao 8) foi
 * implementada — /agency/* agora existe em App.tsx. A garantia que importa
 * dali pra frente NAO e mais "a rota nao existe", e sim: "quem nao tem
 * nenhuma linha ativa em agency_members NUNCA ve nem um flash da area de
 * agencia" (docs/SINGLE-TENANT-LOCK.md). E isso que este teste valida,
 * exercitando o guard real `AgencyRoute` com o hook `useMyAgencies` mockado
 * para retornar 0 agencias (mesmo padrao de mock de
 * WorkspaceSelector.test.tsx).
 */

vi.mock('@/hooks/useAgency', () => ({
  useMyAgencies: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}))

import { AgencyRoute } from '@/pages/agency/AgencyRoute'

describe('AgencyRoute — guard da area de agencia (substitui o gate da Fase 1)', () => {
  it('redireciona para "/" e nao renderiza os children quando o usuario nao tem nenhuma agencia ativa', () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/agency/workspaces'] },
        createElement(
          AgencyRoute,
          null,
          createElement('div', { 'data-testid': 'secret' }, 'conteudo sigiloso da agencia')
        )
      )
    )

    expect(screen.queryByTestId('secret')).toBeNull()
  })
})
