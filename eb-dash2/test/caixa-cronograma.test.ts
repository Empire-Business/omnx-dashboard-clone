import { describe, it, expect } from 'vitest'
import {
  caixaRecebidoNoPeriodo,
  caixaRecebidoAcumulado,
  faturamentoDaVenda,
  type RevenueRow,
} from '@/hooks/useTrafego'

/**
 * Régua de caixa e faturamento a partir do cronograma de pagamentos.
 *
 * Os casos são reais, medidos em julho/2026 na apuração que motivou a mudança
 * (ver docs/MUDANCAS.md). Não trocar por valores inventados: eles são a prova
 * de que o número do painel bate com o extrato e com o relatório de vendas.
 */

const JULHO = { startDate: '2026-07-01', endDate: '2026-07-31' }

function venda(over: Partial<RevenueRow>): RevenueRow {
  return {
    oportunidade_id: 'opp',
    valor_faturado: null,
    valor_entrada: null,
    data_pagamento_entrada: null,
    ...over,
  }
}

describe('caixaRecebidoNoPeriodo', () => {
  it('soma parcela que caiu no mês, não só a linha rotulada Entrada (Augusto Kraemer)', () => {
    // 1.000 na entrada + 17.000 nove dias depois. Pela regra antiga o painel
    // mostrava 1.000 e os 17.000 não apareciam em mês nenhum.
    const row = venda({
      valor_entrada: 1000,
      pagamentos: [
        { data: '2026-07-14', valor: 1000, sinal: 'Entrada' },
        { data: '2026-07-23', valor: 17000, sinal: 'Parcela 1' },
        { data: '2026-09-23', valor: 6000, sinal: 'Parcela 2' },
      ],
    })
    expect(caixaRecebidoNoPeriodo(row, JULHO)).toBe(18000)
  })

  it('conta duas linhas no mesmo dia (Nahuel: entrada + parcela em 27/07)', () => {
    const row = venda({
      valor_entrada: 10000,
      pagamentos: [
        { data: '2026-07-27', valor: 10000, sinal: 'Entrada' },
        { data: '2026-07-27', valor: 10000, sinal: 'Parcela 1' },
        { data: '2026-08-27', valor: 6000, sinal: 'Parcela 2' },
      ],
    })
    expect(caixaRecebidoNoPeriodo(row, JULHO)).toBe(20000)
  })

  it('entrada partida em dias diferentes conta inteira no mês do primeiro pagamento (Erick)', () => {
    // Regra do financeiro: a entrada é uma só, mesmo quando o cliente paga em
    // duas datas. R$ 13.000 (5.000 em 31/07 + 5.000 e 3.000 em 01/08) são caixa
    // de JULHO — é assim que o relatório de vendas fecha em R$ 200.200.
    const row = venda({
      valor_entrada: 5000,
      pagamentos: [
        { data: '2026-07-31', valor: 5000, sinal: 'Entrada' },
        { data: '2026-08-01', valor: 5000, sinal: 'Entrada' },
        { data: '2026-08-01', valor: 3000, sinal: 'Entrada' },
        { data: '2026-09-10', valor: 3050, sinal: 'Parcela 1' },
      ],
    })
    expect(caixaRecebidoNoPeriodo(row, JULHO)).toBe(13000)
    // Nada vaza para agosto: a entrada inteira já foi lançada em julho.
    expect(caixaRecebidoNoPeriodo(row, { startDate: '2026-08-01', endDate: '2026-08-31' })).toBe(0)
    // Parcela continua valendo pela própria data — o agrupamento é só da entrada.
    expect(caixaRecebidoNoPeriodo(row, { startDate: '2026-09-01', endDate: '2026-09-30' })).toBe(3050)
  })

  it('ignora cronograma do GHL, que é previsão de vencimento e não pagamento', () => {
    // `sinal` booleano é a assinatura do cronograma do GHL. Aceitá-lo somaria
    // R$ 72.480,10 de 75 contratos antigos cujas parcelas só venceriam em julho
    // — várias delas atrasadas, isto é, caixa que nunca entrou.
    const row = venda({
      valor_entrada: 1494,
      pagamentos: [
        { data: '2026-07-10', valor: 1494, sinal: false as unknown as string },
        { data: '2026-07-20', valor: 1494, sinal: false as unknown as string },
      ],
    })
    expect(caixaRecebidoNoPeriodo(row, JULHO)).toBe(1494)
  })

  it('cai no valor_entrada quando não há cronograma', () => {
    const row = venda({ valor_entrada: 12900, pagamentos: null })
    expect(caixaRecebidoNoPeriodo(row, JULHO)).toBe(12900)
  })
})

describe('caixaRecebidoAcumulado', () => {
  it('conta o que já foi pago e deixa a parcela futura de fora', () => {
    const row = venda({
      valor_entrada: 1000,
      pagamentos: [
        { data: '2026-07-14', valor: 1000, sinal: 'Entrada' },
        { data: '2026-07-23', valor: 17000, sinal: 'Parcela 1' },
        { data: '2026-09-23', valor: 6000, sinal: 'Parcela 2' },
      ],
    })
    expect(caixaRecebidoAcumulado(row, '2026-08-05')).toBe(18000)
  })

  it('não se limita ao período do filtro — é a régua do modo Cohort', () => {
    // Lead de janeiro que pagou em julho tem que aparecer com o dinheiro dele.
    const row = venda({
      valor_entrada: 5000,
      pagamentos: [{ data: '2026-07-31', valor: 5000, sinal: 'Entrada' }],
    })
    expect(caixaRecebidoAcumulado(row, '2026-08-05')).toBe(5000)
  })
})

describe('faturamentoDaVenda', () => {
  it('usa a soma do cronograma, sem o centavo do arredondamento (Augusto: 84.000, não 84.000,04)', () => {
    const row = venda({
      valor_faturado: 84000.04, // 1.000 + 12 x 6.916,67 reconstruído pela ponte
      pagamentos: [
        { data: '2026-07-14', valor: 1000, sinal: 'Entrada' },
        { data: '2026-07-23', valor: 17000, sinal: 'Parcela 1' },
        ...Array.from({ length: 11 }, (_, i) => ({
          data: `2026-09-${String(i + 1).padStart(2, '0')}`,
          valor: 6000,
          sinal: `Parcela ${i + 2}`,
        })),
      ],
    })
    expect(faturamentoDaVenda(row)).toBe(84000)
  })

  it('mantém valor_faturado quando não há cronograma do desk', () => {
    const row = venda({ valor_faturado: 12900, pagamentos: [] })
    expect(faturamentoDaVenda(row)).toBe(12900)
  })
})
