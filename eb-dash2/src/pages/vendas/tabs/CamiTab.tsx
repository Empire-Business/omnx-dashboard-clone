import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Users, ShoppingCart, TrendingUp } from 'lucide-react'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { LeadCard } from '@/components/leads/LeadCard'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDate } from '@/lib/utils/dates'
import type { OppRow } from '@/hooks/useTrafego'
import type { CamiChartDay } from '@/hooks/useCamiVendas'

// ─── Props ────────────────────────────────────────────────────

interface Props {
  inscritos: OppRow[]
  compradores: OppRow[]
  chartDays: CamiChartDay[]
  loading: boolean
  activePanel: 'cohort' | 'produtividade'
}

// ─── Gráfico de linha — só compradores ───────────────────────

function CamiLineChart({ days, loading }: { days: CamiChartDay[]; loading: boolean }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (loading) return <Skeleton className="h-40 w-full rounded-lg" />

  if (days.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-empire-subtle">
        Sem dados no período
      </div>
    )
  }

  const W = 600
  const H = 130
  const PAD_T = 16
  const PAD_B = 28
  const PAD_L = 28
  const PAD_R = 12
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  const maxVal = Math.max(...days.map((d) => d.compradores), 1)
  const n = days.length

  const pts = days.map((d, i) => ({
    x: PAD_L + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW),
    y: PAD_T + chartH - (d.compradores / maxVal) * chartH,
    val: d.compradores,
  }))

  const polyline = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')

  const areaPath = [
    `M ${pts[0].x.toFixed(2)},${(PAD_T + chartH).toFixed(2)}`,
    ...pts.map((p) => `L ${p.x.toFixed(2)},${p.y.toFixed(2)}`),
    `L ${pts[pts.length - 1].x.toFixed(2)},${(PAD_T + chartH).toFixed(2)}`,
    'Z',
  ].join(' ')

  const yLabels = [
    { frac: 0, val: 0 },
    { frac: 0.5, val: Math.round(maxVal / 2) },
    { frac: 1, val: maxVal },
  ]

  const xLabelCount = Math.min(n, 8)
  const xLabelIdxs =
    n <= 8
      ? days.map((_, i) => i)
      : Array.from({ length: xLabelCount }, (_, i) => Math.round((i * (n - 1)) / (xLabelCount - 1)))

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ minWidth: 280 }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {/* Grid lines */}
        {yLabels.map(({ frac }) => {
          const y = PAD_T + chartH * (1 - frac)
          return (
            <line key={frac} x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
          )
        })}

        {/* Labels eixo Y */}
        {yLabels.map(({ frac, val }) => (
          <text
            key={frac}
            x={PAD_L - 4}
            y={PAD_T + chartH * (1 - frac) + 3}
            textAnchor="end"
            fontSize={8}
            fill="rgba(0,0,0,0.35)"
          >
            {val}
          </text>
        ))}

        {/* Área */}
        <path d={areaPath} fill="rgba(16,185,129,0.08)" />

        {/* Linha */}
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--data-success)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Hover zones (rects invisíveis) */}
        {pts.map((p, i) => {
          const prev = pts[i - 1]
          const next = pts[i + 1]
          const x0 = prev ? (prev.x + p.x) / 2 : PAD_L
          const x1 = next ? (p.x + next.x) / 2 : W - PAD_R
          return (
            <rect
              key={i}
              x={x0}
              y={PAD_T}
              width={x1 - x0}
              height={chartH}
              fill="transparent"
              onMouseEnter={() => setHoveredIdx(i)}
              style={{ cursor: 'default' }}
            />
          )
        })}

        {/* Ponto destacado */}
        {hoveredIdx !== null && (
          <>
            <line
              x1={pts[hoveredIdx].x}
              y1={PAD_T}
              x2={pts[hoveredIdx].x}
              y2={PAD_T + chartH}
              stroke="rgba(16,185,129,0.3)"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <circle cx={pts[hoveredIdx].x} cy={pts[hoveredIdx].y} r={5} fill="white" stroke="var(--data-success)" strokeWidth={2} />
            <circle cx={pts[hoveredIdx].x} cy={pts[hoveredIdx].y} r={2.5} fill="var(--data-success)" />
          </>
        )}

        {/* Eixo X labels */}
        {xLabelIdxs.map((idx) => (
          <text key={idx} x={pts[idx].x} y={H - 6} textAnchor="middle" fontSize={9} fill="rgba(0,0,0,0.4)">
            {days[idx].label}
          </text>
        ))}

        {/* Linha de base */}
        <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
      </svg>

      {/* Tooltip */}
      {hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute top-2 left-1/2 z-10 min-w-[110px] -translate-x-1/2 rounded-md bg-empire-void px-3 py-2 text-xs text-empire-surface shadow-lg"
        >
          <p className="mb-0.5 font-semibold">{days[hoveredIdx].label}</p>
          <p>Compradores: <strong>{days[hoveredIdx].compradores}</strong></p>
        </div>
      )}
    </div>
  )
}

// ─── Tabela ───────────────────────────────────────────────────

type SortKey = 'nome' | 'data_inscricao' | 'status' | 'canal' | 'sdr'
type SortDir = 'asc' | 'desc'

function SortArrow({ k, sort }: { k: SortKey; sort: { key: SortKey; dir: SortDir } }) {
  if (sort.key !== k) return <span className="ml-1 opacity-20">↕</span>
  return <span className="ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>
}

interface TableRow {
  id: string
  nome: string
  email: string
  telefone: string
  status: 'Comprador' | 'Inscrito'
  dataInscricao: string | null
  canal: string
  sdr: string
}

function CamiTable({
  inscritos,
  compradores,
  loading,
  onSelectOpp,
}: {
  inscritos: OppRow[]
  compradores: OppRow[]
  loading: boolean
  onSelectOpp: (id: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'data_inscricao', dir: 'desc' })
  const [search, setSearch] = useState('')

  const compradorIds = useMemo(() => new Set(compradores.map((o) => o.id)), [compradores])

  // União sem duplicatas (inscritos + compradores que eventualmente não têm [cp] cami start)
  const allLeads = useMemo(() => {
    const seen = new Set<string>()
    const merged: OppRow[] = []
    for (const o of [...inscritos, ...compradores]) {
      if (!seen.has(o.id)) {
        seen.add(o.id)
        merged.push(o)
      }
    }
    return merged
  }, [inscritos, compradores])

  const rows = useMemo<TableRow[]>(
    () =>
      allLeads.map((o) => ({
        id: o.id,
        nome: o.contatos?.nome ?? '—',
        email: o.contatos?.email ?? '—',
        telefone: o.contatos?.telefone ?? '—',
        status: compradorIds.has(o.id) ? 'Comprador' : 'Inscrito',
        dataInscricao: o.data_lead_recebido ?? null,
        canal: o.contatos?.utm_source ?? '—',
        sdr: o.sdr_name ?? o.contatos?.owner_name ?? '—',
      })),
    [allLeads, compradorIds]
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter(
      (r) =>
        r.nome.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.telefone.includes(q)
    )
  }, [rows, search])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sort.key === 'nome') cmp = a.nome.localeCompare(b.nome, 'pt-BR')
      else if (sort.key === 'status') cmp = a.status.localeCompare(b.status)
      else if (sort.key === 'data_inscricao') cmp = (a.dataInscricao ?? '').localeCompare(b.dataInscricao ?? '')
      else if (sort.key === 'canal') cmp = a.canal.localeCompare(b.canal, 'pt-BR')
      else if (sort.key === 'sdr') cmp = a.sdr.localeCompare(b.sdr, 'pt-BR')
      return sort.dir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sort])

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
      </div>
    )
  }

  const thCls =
    'px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-empire-subtle'

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nome, e-mail ou telefone..."
        className="h-8 w-full max-w-xs rounded-md border border-empire-border bg-empire-elevated px-3 text-xs text-empire-void transition-colors focus:border-empire-primary focus:outline-none"
      />

      <p className="text-xs text-empire-subtle">
        <span className="font-semibold text-empire-void">{sorted.length}</span>{' '}
        {sorted.length === 1 ? 'pessoa' : 'pessoas'} · clique em uma linha para ver o lead
      </p>

      <div className="overflow-x-auto rounded-lg border border-empire-border">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="border-b border-empire-border bg-empire-elevated">
              <th className={thCls} onClick={() => toggleSort('nome')}>
                Nome<SortArrow k="nome" sort={sort} />
              </th>
              <th className={thCls}>E-mail</th>
              <th className={thCls}>Telefone</th>
              <th className={thCls} onClick={() => toggleSort('status')}>
                Status<SortArrow k="status" sort={sort} />
              </th>
              <th className={thCls} onClick={() => toggleSort('data_inscricao')}>
                Inscrição<SortArrow k="data_inscricao" sort={sort} />
              </th>
              <th className={thCls} onClick={() => toggleSort('canal')}>
                Origem<SortArrow k="canal" sort={sort} />
              </th>
              <th className={thCls} onClick={() => toggleSort('sdr')}>
                SDR<SortArrow k="sdr" sort={sort} />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-empire-subtle">
                  Nenhuma pessoa encontrada no período
                </td>
              </tr>
            ) : (
              sorted.map((row, idx) => (
                <tr
                  key={row.id}
                  onClick={() => onSelectOpp(row.id)}
                  className={cn(
                    'cursor-pointer transition-colors',
                    idx % 2 === 0 ? 'bg-empire-surface' : 'bg-empire-elevated',
                    'hover:bg-empire-primary/[0.06]'
                  )}
                >
                  <td className="px-3 py-2.5 font-medium text-empire-void" style={{ maxWidth: 180 }}>
                    <span className="block truncate">{row.nome}</span>
                  </td>
                  <td className="px-3 py-2.5 text-empire-subtle" style={{ maxWidth: 200 }}>
                    <span className="block truncate">{row.email}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-empire-subtle">
                    {row.telefone}
                  </td>
                  <td className="px-3 py-2.5">
                    {row.status === 'Comprador' ? (
                      <span className="inline-flex items-center rounded-full border border-empire-success/20 bg-empire-success-soft px-2 py-0.5 text-[10px] font-semibold text-empire-success">
                        Comprador
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-empire-border bg-empire-elevated px-2 py-0.5 text-[10px] font-semibold text-empire-subtle">
                        Inscrito
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono tabular-nums text-empire-subtle">
                    {fmtDate(row.dataInscricao)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-empire-subtle">
                    {row.canal}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-empire-subtle">
                    {row.sdr}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── CamiTab ──────────────────────────────────────────────────

export function CamiTab({ inscritos, compradores, chartDays, loading, activePanel }: Props) {
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  const totalInscritos = inscritos.length
  const totalCompradores = compradores.length
  const taxaConversao =
    totalInscritos > 0 ? ((totalCompradores / totalInscritos) * 100).toFixed(1) : '0.0'

  return (
    <div className="space-y-6 animate-fade-in-up">
      {activePanel === 'produtividade' && (
        <div className="rounded-lg border border-empire-primary/25 bg-empire-primary/[0.08] px-4 py-3 text-xs text-empire-primary">
          <strong>Produtividade:</strong> inscritos e compradores filtrados pela data de geração do lead no período
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Inscritos" value={loading ? '…' : totalInscritos.toString()} icon={Users} loading={loading} variant="info" subText="Tag [cp] cami start" />
        <KpiCard label="Compradores" value={loading ? '…' : totalCompradores.toString()} icon={ShoppingCart} loading={loading} variant="success" subText="Tag cami start" />
        <KpiCard
          label="Conversão"
          value={loading ? '…' : `${taxaConversao}%`}
          icon={TrendingUp}
          loading={loading}
          variant="highlight"
          subText={loading ? undefined : `${totalCompradores} de ${totalInscritos}`}
        />
      </div>

      {/* Gráfico */}
      <div className="rounded-xl border border-empire-border bg-empire-surface px-4 py-4">
        <h3 className="mb-1 text-sm font-semibold text-empire-void">
          Compradores por dia
        </h3>
        <p className="mb-4 text-[11px] text-empire-subtle">
          Evolução de compradores (tag <code className="font-mono">cami start</code>) ao longo do período
        </p>
        <CamiLineChart days={chartDays} loading={loading} />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-empire-border bg-empire-surface px-4 py-4">
        <h3 className="mb-4 text-sm font-semibold text-empire-void">
          Todas as pessoas
        </h3>
        <CamiTable inscritos={inscritos} compradores={compradores} loading={loading} onSelectOpp={setSelectedOppId} />
      </div>

      {/* LeadCard drawer */}
      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </div>
  )
}
