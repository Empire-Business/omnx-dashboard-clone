import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { tsToSPDate } from '@/lib/utils/dates'
import type { RevenueRow } from '@/hooks/useTrafego'
import { caixaRecebidoAcumulado, faturamentoDaVenda } from '@/hooks/useTrafego'
import { LeadCard } from '@/components/leads/LeadCard'

interface Props {
  open: boolean
  onClose: () => void
  rows: RevenueRow[]
  faturamento: number
  caixa: number
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  const spDate = tsToSPDate(value)
  const [y, m, d] = spDate.split('-')
  return `${d}/${m}/${y}`
}

function fmtOrigem(origem: string | null | undefined) {
  if (!origem) return '—'
  // As vendas antigas gravaram 'empiredesk'; o rótulo exibido é o nome novo.
  if (origem === 'omnx_desk' || origem === 'empiredesk') return 'omnx-desk'
  if (origem === 'ghl') return 'GHL'
  return origem
}

const TH = 'px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase'

/**
 * Lista das vendas já contabilizadas no faturamento que ainda não têm contrato
 * assinado. É um alerta de pendência documental — nenhum valor daqui é
 * descontado dos KPIs de vendas, caixa ou faturamento.
 */
export function PendentesAssinaturaModal({ open, onClose, rows, faturamento, caixa }: Props) {
  // Clicar no cliente abre o LeadCard, igual as demais tabelas do painel.
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setSelectedOppId(null)
  }

  if (!open) return null

  const ordenadas = [...rows].sort((a, b) =>
    (b.data_pagamento_entrada ?? '').localeCompare(a.data_pagamento_entrada ?? ''),
  )

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
              <h3 className="font-semibold text-foreground">Vendas sem contrato assinado</h3>
              <p className="text-xs text-muted-foreground">
                {ordenadas.length} venda{ordenadas.length === 1 ? '' : 's'} · {fmtCurrency(faturamento)} de
                faturamento · {fmtCurrency(caixa)} de caixa
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Já contam no faturamento e no caixa — falta só o contrato assinado.
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
            {ordenadas.length === 0 ? (
              <p className="p-6 text-sm text-center text-muted-foreground">
                Nenhuma venda pendente de assinatura no período.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead
                  style={{
                    borderBottom: '1px solid var(--empire-border)',
                    background: 'var(--empire-elevated)',
                  }}
                >
                  <tr>
                    <th className={TH} style={{ color: 'var(--empire-subtle)' }}>Contratante</th>
                    <th className={TH} style={{ color: 'var(--empire-subtle)' }}>Produto</th>
                    <th className={TH} style={{ color: 'var(--empire-subtle)' }}>Pagamento</th>
                    <th className={`${TH} text-right`} style={{ color: 'var(--empire-subtle)' }}>Faturado</th>
                    <th className={`${TH} text-right`} style={{ color: 'var(--empire-subtle)' }}>Caixa</th>
                    <th className={TH} style={{ color: 'var(--empire-subtle)' }}>Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((r) => (
                    <tr key={r.oportunidade_id} style={{ borderBottom: '1px solid var(--empire-border)' }}>
                      <td className="px-4 py-2.5 font-medium">
                        <button
                          onClick={() => setSelectedOppId(r.oportunidade_id)}
                          className="text-left underline-offset-2 hover:underline hover:text-empire-accent transition-colors"
                          style={{ color: 'var(--empire-void)' }}
                        >
                          {r.nome_contratante?.trim() || '—'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>
                        {r.produto_vendido?.trim() || '—'}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>
                        {fmtDate(r.data_pagamento_entrada)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums" style={{ color: 'var(--empire-void)' }}>
                        {fmtCurrency(faturamentoDaVenda(r))}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums" style={{ color: 'var(--empire-subtle)' }}>
                        {fmtCurrency(caixaRecebidoAcumulado(r))}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>
                        {fmtOrigem(r.origem)}
                      </td>
                    </tr>
                  ))}
                </tbody>
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
