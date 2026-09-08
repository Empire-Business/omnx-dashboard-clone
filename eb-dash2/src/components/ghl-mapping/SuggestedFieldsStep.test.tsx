import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SuggestedFieldsStep } from './SuggestedFieldsStep'
import type { GhlDiscoveryResult, GhlFieldMappingTemplate } from '@/types/ghl-config'

const discoveryResult: GhlDiscoveryResult = {
  contact_custom_fields: [
    { id: 'field-1', name: 'tesst', key: 'contact.tesst', field_type: 'text', placeholder: null },
  ],
  opportunity_custom_fields: [],
  pipelines: [],
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

const templates: GhlFieldMappingTemplate[] = [
  {
    id: 'template-1',
    name: 'Empire Default',
    logical_name: 'full_name',
    ghl_field_key: 'full_name',
    field_type: 'contact_field',
    variations: [],
    is_required: false,
    created_at: '',
    updated_at: '',
  },
]

describe('SuggestedFieldsStep', () => {
  it('filtra por status: campo mapeado não aparece no filtro padrão "Sugestões pendentes"', () => {
    const { container } = render(
      <SuggestedFieldsStep
        discoveryResult={discoveryResult}
        existingFields={[]}
        templates={templates}
        fieldValues={new Map([['contact.tesst', 'full_name']])}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Nenhum campo encontrado com os filtros atuais.')).toBeInTheDocument()
    expect(screen.queryByText('full_name')).toBeNull()
    expect(container.querySelector('.overflow-visible')).not.toBeNull()
  })

  it('marca sugestão pendente para revisão (nunca como "Mapeado") e usa rótulos humanos', () => {
    render(
      <SuggestedFieldsStep
        discoveryResult={discoveryResult}
        existingFields={[]}
        templates={templates}
        fieldValues={new Map()}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Revisar sugestão')).toBeInTheDocument()
    expect(screen.queryByText('Mapeado')).toBeNull()
    expect(screen.getByText('Usar este campo como')).toBeInTheDocument()
    // A sugestão aparece com rótulo humano, nunca com o logical_name cru
    expect(screen.getByText('Usar sugestão: Nome completo')).toBeInTheDocument()
    expect(screen.queryByText('full_name')).toBeNull()
  })

  it('oferece ação em massa sempre que há sugestões pendentes exibidas', () => {
    const onFieldChange = vi.fn()
    render(
      <SuggestedFieldsStep
        discoveryResult={discoveryResult}
        existingFields={[]}
        templates={templates}
        fieldValues={new Map()}
        onFieldChange={onFieldChange}
      />,
    )

    const button = screen.getByText('Aceitar sugestões exibidas (1)')
    fireEvent.click(button)
    expect(onFieldChange).toHaveBeenCalledWith('contact.tesst', 'full_name')
  })
})
