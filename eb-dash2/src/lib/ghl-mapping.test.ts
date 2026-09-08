import { describe, expect, it } from 'vitest'
import { getLogicalFieldLabel, groupFieldMappingsByLogicalName } from './ghl-mapping'

describe('getLogicalFieldLabel', () => {
  it('traduz chaves técnicas conhecidas para nomes compreensíveis', () => {
    expect(getLogicalFieldLabel('full_name')).toBe('Nome completo')
    expect(getLogicalFieldLabel('data_agendamento_reuniao')).toBe('Data do agendamento da reunião')
  })

  it('mantém uma leitura humana para chaves ainda não catalogadas', () => {
    expect(getLogicalFieldLabel('campo_personalizado')).toBe('Campo Personalizado')
  })

  it('não expõe a chave interna de campos extras como rótulo principal', () => {
    expect(getLogicalFieldLabel('extra.contact_interesse')).toBe('Campo extra (somente exibição)')
  })
})

describe('groupFieldMappingsByLogicalName', () => {
  it('agrupa vários campos do GHL no mesmo logical_name em uma única row', () => {
    const rows = groupFieldMappingsByLogicalName([
      { logical_name: 'full_name', ghl_field_key: 'contact.nome', ghl_field_id: 'f1', field_type: 'contact_field', variations: ['contact.nome'] },
      { logical_name: 'full_name', ghl_field_key: 'contact.nome_completo', ghl_field_id: 'f2', field_type: 'contact_field', variations: ['contact.nome_completo'] },
      { logical_name: 'email', ghl_field_key: 'contact.email', ghl_field_id: 'f3', field_type: 'contact_field', variations: ['contact.email'] },
    ])

    // Uma row por logical_name — sem isto o upsert com onConflict falha no Postgres
    expect(rows).toHaveLength(2)

    const fullName = rows.find((r) => r.logical_name === 'full_name')
    expect(fullName?.variations).toEqual(['contact.nome', 'contact.nome_completo'])
    // ghl_field_key/id/type ficam com a primeira ocorrência
    expect(fullName?.ghl_field_key).toBe('contact.nome')
    expect(fullName?.ghl_field_id).toBe('f1')
  })

  it('ignora linhas sem logical_name', () => {
    const rows = groupFieldMappingsByLogicalName([
      { logical_name: '', ghl_field_key: 'contact.x', ghl_field_id: 'f1', field_type: 'contact_field' },
      { logical_name: 'email', ghl_field_key: 'contact.email', ghl_field_id: 'f2', field_type: 'contact_field' },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].logical_name).toBe('email')
  })

  it('não duplica variações repetidas e preserva is_required se alguma linha exigir', () => {
    const rows = groupFieldMappingsByLogicalName([
      { logical_name: 'phone', ghl_field_key: 'contact.fone', ghl_field_id: 'f1', field_type: 'contact_field', variations: ['contact.fone'], is_required: false },
      { logical_name: 'phone', ghl_field_key: 'contact.fone', ghl_field_id: 'f1', field_type: 'contact_field', variations: ['contact.fone'], is_required: true },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].variations).toEqual(['contact.fone'])
    expect(rows[0].is_required).toBe(true)
  })
})
