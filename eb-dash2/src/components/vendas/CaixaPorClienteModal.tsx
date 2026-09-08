import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { CaixaPorCliente } from '@/hooks/useTrafego'
import { LeadCard } from '@/components/leads/LeadCard'

interface Props {
  open: boolean
  onClose: () => void
  rows: CaixaPorCliente[]
  /** Total do card de origem. Serve de conferência: a soma da lista tem que bater. */
  total: number
  periodoLabel?: string
  /** Qual card abriu o detalhamento — muda título, ordenação e coluna de destaque. */
  metric?: 'caixa' | 'faturamento'
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function fmtDia(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const TH = 'px-4 py-2 font-mono text-[11px] font-medium tracking-[0.12em] uppercase'

/**
 * Detalhamento do card "Caixa": quanto cada cliente pagou dentro do período.
 *
 * Usa `buildCaixaPorCliente`, que aplica a MESMA régua do KPI
 * (`caixaRecebidoNoPeriodo`) — por isso o rodapé confere a soma contra o total do
 * card e avisa na tela se algum dia divergir, em vez de mostrar número errado calado.
 */
export function CaixaPorClienteModal({
  open,
  onClose,
  rows,
  total,
  periodoLabel,
  metric = 'caixa',
}: Props) {
  // Clicar no cliente abre o LeadCard por cima, como nas outras tabelas do painel.
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setSelectedOppId(null)
  }

  if (!open) return null

  const isCaixa = metric === 'caixa'
  // Cada card mostra só quem tem valor naquela métrica, ordenado por ela.
  const visiveis = rows
    .filter((r) => (isCaixa ? r.caixa > 0 : r.faturamento > 0))
    .sort((a, b) => (isCaixa ? b.caixa - a.caixa : b.faturamento - a.faturamento))

  const soma = visiveis.reduce((s, r) => s + (isCaixa ? r.caixa : r.faturamento), 0)
  // Tolerância de 1 centavo: os valores trafegam como float.
  const bate = Math.abs(soma - total) < 0.01

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60] backdrop-blur-sm"
        style={{ background: 'rgba(7,12,20,0.55)' }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-3xl max-h-[80vh] flex flex-col animate-fade-in-up pointer-events-auto"
          style={{
            background: 'var(--empire-surface)',
            border: '1px solid var(--empire-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--empire-shadow-xl)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-start justify-between px-5 py-4"
            style={{ borderBottom: '1px solid var(--empire-border)' }}
          >
            <div>
              <h3 className="font-semibold text-foreground">
                {isCaixa ? 'Caixa por cliente' : 'Faturamento por cliente'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {visiveis.length} cliente{visiveis.length === 1 ? '' : 's'} · {fmtCurrency(soma)}
                {periodoLabel ? ` · ${periodoLabel}` : ''}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {isCaixa
                  ? 'Dinheiro que entrou dentro do período — cada parcela conta no mês em que foi paga.'
                  : 'Valor total contratado de cada venda, incluindo as parcelas que ainda vão cair.'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1.5 transition-colors hover:bg-empire-border"
              style={{ color: 'var(--empire-subtle)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto flex-1">
            {visiveis.length === 0 ? (
              <p className="p-6 text-sm text-center text-muted-foreground">
                {isCaixa
                  ? 'Nenhum pagamento recebido no período.'
                  : 'Nenhuma venda faturada no período.'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead
                  className="sticky top-0"
                  style={{
                    borderBottom: '1px solid var(--empire-border)',
                    background: 'var(--empire-elevated)',
                  }}
                >
                  <tr style={{ color: 'var(--empire-subtle)' }}>
                    <th className={`${TH} text-left`}>Cliente</th>
                    <th className={`${TH} text-left`}>Pagamentos no período</th>
                    <th className={`${TH} text-right`}>Caixa</th>
                    <th className={`${TH} text-right`}>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((r) => (
                    <tr
                      key={r.oportunidadeId}
                      style={{ borderBottom: '1px solid var(--empire-border)' }}
                    >
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => setSelectedOppId(r.oportunidadeId)}
                          className="text-left text-foreground underline-offset-2 hover:underline hover:text-empire-accent transition-colors"
                        >
                          {r.nome}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.pagamentosNoPeriodo.length === 0 ? (
                          '—'
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {r.pagamentosNoPeriodo.map((p, i) => (
                              <span key={i}>
                                {fmtDia(p.data)} · {fmtCurrency(p.valor)}
                                {p.sinal ? ` · ${p.sinal}` : ''}
                                {p.forma ? ` · ${p.forma}` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-foreground whitespace-nowrap">
                        {fmtCurrency(r.caixa)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground whitespace-nowrap">
                        {fmtCurrency(r.faturamento)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot
                  className="sticky bottom-0"
                  style={{
                    borderTop: '1px solid var(--empire-border)',
                    background: 'var(--empire-elevated)',
                  }}
                >
                  <tr>
                    <td className="px-4 py-2.5 font-semibold text-foreground" colSpan={2}>
                      Total
                    </td>
                    {/* O total vai embaixo da coluna da métrica que abriu o modal. */}
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground whitespace-nowrap">
                      {isCaixa ? fmtCurrency(soma) : ''}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-foreground whitespace-nowrap">
                      {isCaixa ? '' : fmtCurrency(soma)}
                    </td>
                  </tr>
                  {!bate && (
                    <tr>
                      <td colSpan={4} className="px-4 py-2 text-[11px] text-empire-danger">
                        Atenção: a soma por cliente ({fmtCurrency(soma)}) não bate com o card
                        ({fmtCurrency(total)}). Diferença de {fmtCurrency(Math.abs(soma - total))}.
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </>,
    document.body,
  )
}
