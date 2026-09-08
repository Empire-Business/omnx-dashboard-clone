import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PipelineStageStep } from './PipelineStageStep'
import type { GhlDiscoveryResult } from '@/types/ghl-config'

const discoveryResult: GhlDiscoveryResult = {
  contact_custom_fields: [],
  opportunity_custom_fields: [],
  pipelines: [
    {
      id: 'pipeline-1',
      name: 'Pré-Vendas',
      stages: [
        { id: 'stage-1', name: 'Novo lead' },
        { id: 'stage-2', name: 'Tentativa de contato' },
      ],
    },
  ],
  tags: [],
  calendars: [],
  users: [],
  field_folders: [],
  errors: [],
  status: 'success',
  workspace_id: 'workspace-1',
  location_id: 'location-1',
  ghl_api_key_mask: '***',
}

function renderStep(onStageChange = vi.fn()) {
  render(
    <PipelineStageStep
      discoveryResult={discoveryResult}
      existingPipelines={[]}
      existingStages={[]}
      pipelineValues={new Map()}
      stageValues={new Map()}
      onPipelineChange={vi.fn()}
      onStageChange={onStageChange}
    />,
  )
  return onStageChange
}

describe('PipelineStageStep', () => {
  it('mostra a ação em massa com rótulo claro no cabeçalho do pipeline', () => {
    renderStep()
    expect(screen.getByText('Classificar todos os stages como…')).toBeInTheDocument()
  })

  it('aplica o estágio escolhido a todos os stages do pipeline', () => {
    const onStageChange = renderStep()

    const trigger = screen.getByText('Classificar todos os stages como…').closest('button')
    expect(trigger).not.toBeNull()
    fireEvent.click(trigger!)
    fireEvent.click(screen.getByText('Agendado'))

    expect(onStageChange).toHaveBeenCalledWith('stage-1', 'agendado')
    expect(onStageChange).toHaveBeenCalledWith('stage-2', 'agendado')
  })

  it('esconde os IDs técnicos atrás de "Ver código técnico"', () => {
    const { container } = render(
      <PipelineStageStep
        discoveryResult={discoveryResult}
        existingPipelines={[]}
        existingStages={[]}
        pipelineValues={new Map()}
        stageValues={new Map()}
        onPipelineChange={vi.fn()}
        onStageChange={vi.fn()}
      />,
    )
    // Pipeline + 2 stages = 3 blocos de detalhes técnicos colapsados
    expect(container.querySelectorAll('details').length).toBe(3)
    expect(screen.getAllByText('Ver código técnico').length).toBe(3)
  })
})
