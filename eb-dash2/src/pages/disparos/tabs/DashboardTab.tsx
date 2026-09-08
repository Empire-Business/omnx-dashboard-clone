import { useState, useMemo } from 'react'
import { useDisparoMetrics } from '@/hooks/useDisparos'
import { DisparoMetricCards } from '../components/DisparoMetricCards'
import { DisparoBarChart } from '../components/DisparoBarChart'
import { DisparoFunnel } from '../components/DisparoFunnel'
import { DisparoMetricsTable } from '../components/DisparoMetricsTable'
import { DisparoContactTable } from '../components/DisparoContactTable'
import { DisparoResumoGeral } from '../components/DisparoResumoGeral'
import { DisparoCamposCustomValoresView } from '../components/DisparoCamposCustomValoresView'
import { DisparoFiltersBar } from '../components/DisparoFiltersBar'
import { EMPTY_DISPAROS_FILTERS } from '../filters'
import { DISPARO_SIGNIFICADOS, type DisparoSignificado } from '@/types/disparos'
import { useDisparoContacts } from '@/hooks/useDisparos'
import { Loader2 } from 'lucide-react'

/** Converte YYYY-MM-DD para o início do dia em BRT, com offset explícito. */
function toIsoStart(date: string): string {
  return `${date}T00:00:00-03:00`
}

/** p_to é exclusivo na RPC: início do dia SEGUINTE em BRT. */
function toIsoEndExclusive(date: string): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const next = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  return `${next}T00:00:00-03:00`
}

export function DashboardTab() {
  const [filters, setFilters] = useState(EMPTY_DISPAROS_FILTERS)
  const [activePreset, setActivePreset] = useState('Todo o período')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [significado, setSignificado] = useState<DisparoSignificado | null>(null)

  const from = filters.startDate ? toIsoStart(filters.startDate) : null
  const to = filters.endDate ? toIsoEndExclusive(filters.endDate) : null
  const { metricas, loading } = useDisparoMetrics({ from, to })

  // Período vai pro banco (afeta as contagens); status/tipo/busca refinam
  // client-side a lista já agregada.
  const filtered = useMemo(() => {
    const busca = filters.busca.trim().toLowerCase()
    return metricas.filter((m) => {
      if (filters.status === 'active' && !m.is_active) return false
      if (filters.status === 'inactive' && m.is_active) return false
      if (filters.tipo !== 'all' && m.tipo_mensagem !== filters.tipo) return false
      if (busca && !m.disparo_nome.toLowerCase().includes(busca)) return false
      return true
    })
  }, [metricas, filters.status, filters.tipo, filters.busca])

  const selectedMetrica = filtered.find((m) => m.disparo_id === selectedId) ?? null
  const effectiveSelectedId = selectedMetrica ? selectedId : null

  const { contacts, loading: contactsLoading } = useDisparoContacts({
    disparoId: effectiveSelectedId,
    significado,
    limit: 100,
  })

  const resumoGeral = useMemo(() => {
    const ativos = filtered.filter((m) => m.is_active)
    return {
      totalEnviados: ativos.reduce((acc, m) => acc + m.trigger_count, 0),
      totalConverteu: ativos.reduce((acc, m) => acc + m.converteu_count, 0),
      totalCusto: ativos.reduce((acc, m) => acc + m.custo_estimado, 0),
      disparosAtivos: ativos.length,
    }
  }, [filtered])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-empire-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <DisparoFiltersBar
        filters={filters}
        setFilters={setFilters}
        activePreset={activePreset}
        setActivePreset={setActivePreset}
      />

      {filtered.length > 0 && <DisparoResumoGeral {...resumoGeral} />}

      {selectedMetrica ? (
        <DisparoMetricCards metrica={selectedMetrica} />
      ) : filtered.length > 0 ? (
        <div className="rounded-xl border border-empire-border bg-empire-surface p-6 text-sm text-empire-muted">
          Selecione uma campanha na tabela abaixo para ver os KPIs detalhados.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DisparoBarChart metricas={filtered} metric="respondeu_count" title="Respostas por Campanha" color="var(--empire-success)" />
        <DisparoBarChart metricas={filtered} metric="converteu_count" title="Conversões por Campanha" color="var(--empire-primary-hover)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DisparoMetricsTable metricas={filtered} selectedId={effectiveSelectedId} onSelect={setSelectedId} />
        </div>
        <div>
          <DisparoFunnel metrica={selectedMetrica} />
        </div>
      </div>

      {effectiveSelectedId && <DisparoCamposCustomValoresView disparoId={effectiveSelectedId} />}

      {effectiveSelectedId && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-empire-void">
              Últimos contatos da campanha{selectedMetrica ? `: ${selectedMetrica.disparo_nome}` : ''}
            </h3>
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-empire-border bg-empire-surface px-2 text-xs">
              <span className="font-medium text-empire-subtle">Significado:</span>
              <select
                value={significado ?? ''}
                onChange={(e) => setSignificado((e.target.value || null) as DisparoSignificado | null)}
                className="h-full bg-transparent text-xs text-empire-void focus:outline-none cursor-pointer"
              >
                <option value="">Todos</option>
                {DISPARO_SIGNIFICADOS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <DisparoContactTable contacts={contacts} loading={contactsLoading} />
        </div>
      )}
    </div>
  )
}
