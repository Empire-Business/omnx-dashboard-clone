import { useState } from 'react'
import type { FilterValues } from '@/types/filters'
import { isFilterActive } from '@/types/filters'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadCard } from '@/components/leads/LeadCard'
import { Phone, MessageSquare, Mail, Smartphone, ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react'
import { useLeadAtividades, tsSPHour, fmtDuration } from '@/hooks/useLeadAtividades'
import type { AtividadeRow } from '@/hooks/useLeadAtividades'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  startDate: string
  endDate: string
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'
  activePanel: 'cohort' | 'produtividade'
  sdr?: FilterValues
}

// ─── Helpers ──────────────────────────────────────────────────

function tsSPDate(ts: string): string {
  return new Date(ts).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  })
}

function ChannelIcon({ channel }: { channel: string | null }) {
  switch (channel) {
    case 'call':
      return <Phone className="h-3.5 w-3.5 text-empire-subtle" />
    case 'whatsapp':
    case 'sms':
      return <MessageSquare className="h-3.5 w-3.5 text-empire-success" />
    case 'email':
      return <Mail className="h-3.5 w-3.5 text-empire-danger" />
    default:
      return <Smartphone className="h-3.5 w-3.5 text-empire-subtle" />
  }
}

function DirectionIcon({ direction }: { direction: string | null }) {
  if (direction === 'inbound') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[var(--empire-success)]">
        <ArrowDownLeft className="h-3 w-3" />
        IN
      </span>
    )
  }
  if (direction === 'outbound') {
    return (
      <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[var(--brand))]">
        <ArrowUpRight className="h-3 w-3" />
        OUT
      </span>
    )
  }
  return <span className="text-empire-subtle">—</span>
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null
  const map: Record<string, { label: string; cls: string }> = {
    delivered: { label: 'Entregue', cls: 'bg-empire-success/10 text-empire-success' },
    read: { label: 'Lido', cls: 'bg-empire-success/15 text-empire-success' },
    sent: { label: 'Enviado', cls: 'bg-empire-elevated text-empire-subtle' },
    failed: { label: 'Falhou', cls: 'bg-empire-danger/10 text-empire-danger' },
    pending: { label: 'Pendente', cls: 'bg-empire-warning/10 text-empire-warning' },
    completed: { label: 'Concluído', cls: 'bg-empire-success/10 text-empire-success' },
    'no-answer': { label: 'Sem resposta', cls: 'bg-empire-danger/10 text-empire-danger' },
    busy: { label: 'Ocupado', cls: 'bg-empire-danger/10 text-empire-danger' },
    canceled: { label: 'Cancelado', cls: 'bg-empire-danger/10 text-empire-danger' },
  }
  const cfg = map[status] ?? { label: status, cls: 'bg-empire-elevated text-empire-subtle' }
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', cfg.cls)}>
      {cfg.label}
    </span>
  )
}

function MessageCell({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <span className="text-empire-subtle">—</span>
  const truncated = text.length > 80
  const display = truncated && !expanded ? text.slice(0, 80) + '…' : text
  return (
    <div className="flex flex-col">
      <span className="text-empire-void">{display}</span>
      {truncated && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
          className="text-[10px] text-[var(--brand))] font-medium hover:underline text-left mt-0.5"
        >
          {expanded ? 'Ver menos' : 'Ver mais'}
        </button>
      )}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(8)].map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-lg" />
      ))}
    </div>
  )
}

// ─── Table Row ────────────────────────────────────────────────

function AtividadeRowComponent({
  row,
  onClick,
}: {
  row: AtividadeRow
  onClick: () => void
}) {
  return (
    <tr
      className="cursor-pointer transition-colors hover:bg-empire-elevated border-b border-empire-border last:border-0"
      onClick={onClick}
    >
      <td className="px-4 py-3 text-xs font-mono text-empire-subtle">
        {row.dataComunicacao ? tsSPDate(row.dataComunicacao) : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-medium text-empire-void text-sm leading-tight">
            {row.leadNome ?? '—'}
          </span>
          {row.leadTelefone && (
            <span className="text-[11px] text-empire-subtle">{row.leadTelefone}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-empire-void">{row.sdrName ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <ChannelIcon channel={row.channel} />
          <span className="text-xs text-empire-void capitalize">
            {row.channel === 'whatsapp' ? 'WhatsApp' : row.channel ?? '—'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <DirectionIcon direction={row.direction} />
      </td>
      <td className="px-4 py-3 max-w-[200px]">
        {row.isAutomatico ? (
          <span className="text-[10px] italic text-empire-subtle">Automação</span>
        ) : (
          <MessageCell text={row.mensagemBody} />
        )}
      </td>
      <td className="px-4 py-3 text-xs text-empire-subtle font-mono">
        {row.dataComunicacao ? tsSPHour(row.dataComunicacao) : '—'}
      </td>
      <td className="px-4 py-3 text-xs text-empire-subtle">
        {row.channel === 'call' ? fmtDuration(row.phoneCallDuration) : '—'}
      </td>
      <td className="px-4 py-3">
        {row.channel === 'call' ? (
          row.phoneCallStatus ? <StatusBadge status={row.phoneCallStatus} /> : null
        ) : (
          <StatusBadge status={row.msgStatus} />
        )}
      </td>
    </tr>
  )
}

// ─── Pagination ────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const pages: (number | '...')[] = []
  if (totalPages <= 7) {
    for (let i = 0; i < totalPages; i++) pages.push(i)
  } else {
    pages.push(0)
    if (page > 2) pages.push('...')
    for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i)
    if (page < totalPages - 3) pages.push('...')
    pages.push(totalPages - 1)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <p className="text-xs text-empire-subtle">
        {total === 0 ? 'Nenhuma atividade' : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} de ${total}`}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="h-7 w-7 flex items-center justify-center rounded text-xs font-medium text-empire-subtle hover:bg-empire-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="h-7 w-7 flex items-center justify-center text-xs text-empire-subtle">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={cn(
                'h-7 w-7 flex items-center justify-center rounded text-xs font-medium transition-colors',
                p === page
                  ? 'bg-[var(--brand))] text-white'
                  : 'text-empire-subtle hover:bg-empire-elevated',
              )}
            >
              {(p as number) + 1}
            </button>
          ),
        )}
        <button
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="h-7 w-7 flex items-center justify-center rounded text-xs font-medium text-empire-subtle hover:bg-empire-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ›
        </button>
      </div>
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────

export function AtividadesTab({ startDate, endDate, pipelineMode, activePanel, sdr }: Props) {
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  const { rows, total, loading, error, loadPage } = useLeadAtividades(
    startDate,
    endDate,
    sdr,
    pipelineMode,
    true,
  )

  const handlePage = (p: number) => {
    setPage(p)
    loadPage(p)
  }

  if (activePanel === 'cohort') {
    return (
      <div
        className="flex flex-col items-center justify-center py-20 text-center rounded-xl bg-empire-elevated border-[1.5px] border-empire-border"
      >
        <Activity className="h-10 w-10 text-empire-border mb-3" />
        <p className="text-sm font-semibold text-empire-void">Atividades disponíveis apenas em Produtividade</p>
        <p className="text-xs text-empire-subtle mt-1 max-w-[320px]">
          Esta aba mostra as interações dos SDRs por dia no período selecionado. Alterne para o modo Produtividade para visualizar.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-empire-void">Atividades do dia</h2>
          {!loading && total > 0 && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-empire-elevated text-empire-subtle border border-empire-border">
              {total.toLocaleString('pt-BR')}
            </span>
          )}
        </div>
        <p className="text-xs text-empire-subtle mt-0.5">
          Todas as interações dos SDRs no período — ligações, mensagens e emails.
          {sdr && isFilterActive(sdr) && sdr.include.length > 0 && <span className="ml-2 font-medium text-empire-primary">Filtrado: {sdr.include.join(', ')}</span>}
        </p>
      </div>

      {/* Erro */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-xl p-4 text-sm bg-empire-danger-soft"
        >
          <span className="text-empire-danger">{error}</span>
        </div>
      )}

      {/* Tabela */}
      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MessageSquare className="h-10 w-10 text-empire-border mb-3" />
          <p className="text-sm font-medium text-empire-void">Nenhuma atividade registrada</p>
          <p className="text-xs text-empire-subtle mt-1">
            {sdr && isFilterActive(sdr) ? `Nenhuma atividade para os SDRs selecionados no período.` : 'Nenhuma atividade no período selecionado.'}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl overflow-hidden border border-empire-border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead style={{ background: 'var(--empire-elevated)', borderBottom: '1px solid var(--empire-border)' }}>
                  <tr>
                    {[
                      { label: 'Data', align: 'text-left' },
                      { label: 'Lead', align: 'text-left' },
                      { label: 'SDR', align: 'text-left' },
                      { label: 'Canal', align: 'text-left' },
                      { label: 'Dir.', align: 'text-left' },
                      { label: 'Mensagem', align: 'text-left' },
                      { label: 'Horário', align: 'text-left' },
                      { label: 'Duração', align: 'text-left' },
                      { label: 'Status', align: 'text-left' },
                    ].map((h) => (
                      <th
                        key={h.label}
                        className={cn('px-4 py-3 text-[11px] font-medium tracking-[0.10em] uppercase text-empire-subtle', h.align)}
                      >
                        {h.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <AtividadeRowComponent
                      key={row.id}
                      row={row}
                      onClick={() => setSelectedOppId(row.oppId)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={total} pageSize={50} onPage={handlePage} />
          </div>
        </>
      )}

      {/* LeadCard modal */}
      {selectedOppId && (
        <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
      )}
    </div>
  )
}
