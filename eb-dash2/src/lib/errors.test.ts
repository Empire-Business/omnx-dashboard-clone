import { describe, expect, it } from 'vitest'
import { extractErrorMessage } from './errors'

describe('extractErrorMessage', () => {
  it('lê message de erros comuns (Error)', () => {
    expect(extractErrorMessage(new Error('falha x'))).toBe('falha x')
  })

  it('lê message de PostgrestError, que não é instanceof Error', () => {
    const postgrestError = { message: 'duplicate key value', code: '23505', details: '', hint: '' }
    expect(extractErrorMessage(postgrestError)).toBe('duplicate key value')
  })

  it('usa o fallback quando não há mensagem identificável', () => {
    expect(extractErrorMessage(null, 'fallback')).toBe('fallback')
    expect(extractErrorMessage({}, 'fallback')).toBe('fallback')
    expect(extractErrorMessage(undefined)).toBe('Não foi possível concluir a operação. Tente novamente.')
  })
})
