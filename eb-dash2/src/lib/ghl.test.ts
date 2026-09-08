import { describe, it, expect } from 'vitest'
import { ghlContactUrlForLocation } from './ghl'

describe('ghlContactUrlForLocation', () => {
  it('monta a URL do contato no domínio white label (crm.omnx.pro)', () => {
    expect(ghlContactUrlForLocation('LOC123', 'CONTATO456')).toBe(
      'https://crm.omnx.pro/v2/location/LOC123/contacts/detail/CONTATO456',
    )
  })

  it('nunca usa o domínio padrão do GHL', () => {
    expect(ghlContactUrlForLocation('LOC123', 'CONTATO456')).not.toContain('gohighlevel.com')
  })

  it('retorna null quando a location não está configurada', () => {
    expect(ghlContactUrlForLocation(null, 'CONTATO456')).toBeNull()
    expect(ghlContactUrlForLocation(undefined, 'CONTATO456')).toBeNull()
    expect(ghlContactUrlForLocation('', 'CONTATO456')).toBeNull()
  })
})
