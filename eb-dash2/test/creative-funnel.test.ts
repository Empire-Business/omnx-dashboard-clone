import { describe, it, expect } from 'vitest'
import { buildCreativeFunnel, UNMAPPED_FUNNEL_STATUS } from '@/hooks/useCreativeDashboard'
import type { CreativeStatusCount } from '@/types/creatives'

/**
 * Funil de produção + testes do Dashboard de Criativos.
 *
 * O cenário do primeiro caso é o real, lido da tela na reunião de 2026-08-28:
 * o funil somava 13 (8 Ideia + 4 Roteiro + 1 Produzindo) enquanto os cards ao
 * lado falavam em 976 e 1000, porque `v_creative_status_counts` agrupa pelo
 * texto CRU do status e os ~985 criativos vindos do Notion carregam o status do
 * Notion ("Concluído", "Postado", …), que não existe no vocabulário da
 * plataforma. Ver docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md (UX-01).
 */

function linha(status: string | null, total: number): CreativeStatusCount {
  return { status, total, from_notion: 0, from_native: 0 } as CreativeStatusCount
}

const TELA_DA_REUNIAO: CreativeStatusCount[] = [
  linha('ideia', 8),
  linha('roteiro', 4),
  linha('produzindo', 1),
  linha('Concluído', 800),
  linha('Não iniciado', 100),
  linha('Postado', 60),
  linha('Postado no Trial', 25),
  linha(null, 2),
]

describe('buildCreativeFunnel', () => {
  it('fecha com o total da base — nenhum criativo fica invisível', () => {
    const { funnel } = buildCreativeFunnel(TELA_DA_REUNIAO)
    const somaFunil = funnel.reduce((s, f) => s + f.count, 0)
    const somaBase = TELA_DA_REUNIAO.reduce((s, r) => s + r.total, 0)
    expect(somaFunil).toBe(somaBase)
    expect(somaFunil).toBe(1000)
  })

  it('joga status de fora do vocabulário (e sem status) num balde explícito', () => {
    const { funnel } = buildCreativeFunnel(TELA_DA_REUNIAO)
    const balde = funnel.find((f) => f.status === UNMAPPED_FUNNEL_STATUS)
    // 800 + 100 + 60 + 25 + 2 sem status
    expect(balde?.count).toBe(987)
  })

  it('lista os status crus encontrados, para a tela poder explicá-los', () => {
    const { unmappedStatuses } = buildCreativeFunnel(TELA_DA_REUNIAO)
    expect(unmappedStatuses).toEqual(['Concluído', 'Não iniciado', 'Postado', 'Postado no Trial'])
  })

  it('calcula a porcentagem sobre a base inteira, não sobre as etapas mapeadas', () => {
    const { funnel } = buildCreativeFunnel(TELA_DA_REUNIAO)
    const ideia = funnel.find((f) => f.status === 'ideia')
    // Antes: 8/13 = 61,5% (denominador que a tela nunca mostrava).
    // Agora: 8/1000 = 0,8%.
    expect(ideia?.pct).toBe(0.8)
    expect(ideia?.pct).not.toBe(61.5)
  })

  it('as porcentagens somam ~100%', () => {
    const { funnel } = buildCreativeFunnel(TELA_DA_REUNIAO)
    const soma = funnel.reduce((s, f) => s + f.pct, 0)
    expect(soma).toBeGreaterThan(99.5)
    expect(soma).toBeLessThan(100.5)
  })

  it('não cria o balde quando todo mundo tem status do vocabulário', () => {
    const { funnel, unmappedStatuses } = buildCreativeFunnel([linha('ideia', 3), linha('pronto', 2)])
    expect(funnel.some((f) => f.status === UNMAPPED_FUNNEL_STATUS)).toBe(false)
    expect(unmappedStatuses).toEqual([])
    expect(funnel.find((f) => f.status === 'ideia')?.pct).toBe(60)
  })

  it('base vazia não divide por zero', () => {
    const { funnel } = buildCreativeFunnel([])
    expect(funnel.every((f) => f.count === 0 && f.pct === 0)).toBe(true)
  })

  it('mantém as 10 etapas na ordem do fluxo, mesmo as zeradas', () => {
    const { funnel } = buildCreativeFunnel([linha('ideia', 1)])
    expect(funnel.map((f) => f.status)).toEqual([
      'ideia', 'roteiro', 'produzindo', 'revisao', 'ajustes',
      'aprovado', 'pronto', 'em_teste', 'testado', 'escalar',
    ])
  })
})
