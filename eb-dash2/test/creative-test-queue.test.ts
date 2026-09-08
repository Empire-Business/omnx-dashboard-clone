import { describe, it, expect } from 'vitest'
import { READY_FOR_TEST_STATUSES, selectReadyQueue } from '@/hooks/useCreativeTests'

/**
 * Fila da aba "Testes de Criativos".
 *
 * O caso do primeiro bloco é real: na reunião de 2026-08-28 o criativo
 * `AN-0017 / TESTE 1` foi levado no Kanban até "Aprovado", marcado como Testado,
 * com data de início preenchida — e a aba continuou dizendo "Fila vazia".
 * A causa era o filtro do banco aceitar só `status = 'pronto'`.
 * Ver docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md (BUG-01).
 */

function criativo(over: Partial<{ id: string; status: string; test_status: string | null }> = {}) {
  return { id: 'c1', status: 'aprovado', test_status: null, ...over }
}

describe('READY_FOR_TEST_STATUSES', () => {
  it('aceita "aprovado" — é onde o Kanban para quando o card chega ao fim', () => {
    expect(READY_FOR_TEST_STATUSES).toContain('aprovado')
  })

  it('mantém "pronto", que já era aceito antes', () => {
    expect(READY_FOR_TEST_STATUSES).toContain('pronto')
  })

  it('não aceita status de trabalho em andamento nem de fim de linha', () => {
    for (const s of ['ideia', 'roteiro', 'produzindo', 'revisao', 'ajustes', 'reprovado', 'escalar', 'arquivado']) {
      expect(READY_FOR_TEST_STATUSES as readonly string[]).not.toContain(s)
    }
  })
})

describe('selectReadyQueue', () => {
  it('mantém na fila o criativo aprovado que ainda não foi testado', () => {
    const out = selectReadyQueue([criativo()], [])
    expect(out).toHaveLength(1)
  })

  it('não recicla criativo já decidido (senão o aprovado voltaria para sempre)', () => {
    // useDecideCreativeTest grava status='aprovado' + test_status='testado'
    // na decisão "Aprovar". Sem este filtro, ele reentraria na fila eternamente.
    const out = selectReadyQueue([criativo({ status: 'aprovado', test_status: 'testado' })], [])
    expect(out).toHaveLength(0)
  })

  it('tira da fila quem já tem teste em andamento', () => {
    const out = selectReadyQueue([criativo({ id: 'c1' })], [{ creative_id: 'c1' }])
    expect(out).toHaveLength(0)
  })

  it('não deixa criativo "pronto" com teste ativo aparecer nos dois blocos', () => {
    // Regressão do filtro antigo: `c.status === 'pronto' || !ativos.has(c.id)`.
    // O curto-circuito do `||` deixava passar quem já estava em teste.
    const out = selectReadyQueue([criativo({ id: 'c1', status: 'pronto' })], [{ creative_id: 'c1' }])
    expect(out).toHaveLength(0)
  })

  it('não mexe em quem não tem teste ativo nem veredito', () => {
    const out = selectReadyQueue(
      [criativo({ id: 'a' }), criativo({ id: 'b', status: 'pronto' })],
      [{ creative_id: 'z' }],
    )
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
