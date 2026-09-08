import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { LeadCard } from '@/components/leads/LeadCard'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { spToday, spDaysAgo } from '@/lib/utils/dates'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  loading: boolean
}

interface NoShowRow {
  id: string
  nome: string | null
  data_agendada: string
}

// Linha da query de no-shows (client Supabase não é tipado)
interface NoShowDbRow {
  id: string
  contatos: { nome: string | null } | null
  data_agendamento_reuniao: string
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function NoShowsPendentesCard({ loading }: Props) {
  const [dataLoading, setDataLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  const [noShows, setNoShows] = useState<NoShowRow[]>([])

  useEffect(() => {
    let cancelled = false

    async function loadNoShows() {
      setDataLoading(true)
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        const todaySP = spToday()
        const d30agoSP = spDaysAgo(30)

        const { data, error } = await supabase
          .from('oportunidades')
          .select('id, contatos(nome), data_agendamento_reuniao')
          .eq('workspace_id', wid)
          .lt('data_agendamento_reuniao', todaySP)
          .is('data_realizacao_vendas', null)
          .neq('status', 'lost')
          .not('data_agendamento_reuniao', 'is', null)
          .gte('data_agendamento_reuniao', d30agoSP)
          .limit(50)

        if (cancelled) return
        if (error) throw error

        // Embed many-to-one `contatos` é inferido como array pelo client não
        // tipado, mas em runtime é objeto — cast estrutural para o tipo local.
        setNoShows(((data ?? []) as unknown as NoShowDbRow[]).map((row) => ({
          id: row.id,
          nome: row.contatos?.nome ?? null,
          data_agendada: row.data_agendamento_reuniao,
        })))
      } catch (err) {
        console.error('[NoShowsPendentesCard]', err)
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    void loadNoShows()
    return () => { cancelled = true }
  }, [])

  const isLoading = loading || dataLoading

  return (
    <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
      <button
        onClick={() => setShowModal(true)}
        className="flex w-full items-center gap-2 border-b border-empire-border px-4 py-3 text-left transition-colors hover:bg-empire-danger-soft"
      >
        <AlertTriangle className="h-4 w-4 text-empire-danger" />
        <h3 className="text-sm font-semibold text-empire-void">No-shows pendentes</h3>
        {!isLoading && (
          <Badge variant="secondary" className="border-0 bg-empire-danger/10 text-xs text-empire-danger">
            {noShows.length}
          </Badge>
        )}
        <span className="ml-auto text-xs font-medium text-empire-muted">Ver todos</span>
      </button>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : noShows.length === 0 ? (
        <p className="p-6 text-center text-sm text-empire-muted">Nenhum no-show pendente.</p>
      ) : (
        <ul className="space-y-1 p-4">
          {noShows.slice(0, 5).map((row) => (
            <li
              key={row.id}
              onClick={() => setSelectedOppId(row.id)}
              className="flex cursor-pointer gap-2 rounded px-2 py-2 text-sm text-empire-muted transition-colors hover:bg-empire-danger-soft"
            >
              <span className="text-empire-void">{row.nome ?? '—'}</span>
              <span className="ml-auto text-empire-danger/80">{fmtDatetime(row.data_agendada)}</span>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-empire-void/50">
          <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-auto rounded-xl bg-empire-surface">
            <div className="sticky top-0 flex items-center justify-between border-b border-empire-border bg-empire-surface px-6 py-4">
              <h2 className="text-lg font-semibold text-empire-void">No-shows Pendentes</h2>
              <button
                onClick={() => setShowModal(false)}
                className="rounded p-1 transition-colors hover:bg-empire-elevated"
              >
                <X className="h-5 w-5 text-empire-subtle" />
              </button>
            </div>
            <div className="p-6">
              {noShows.length === 0 ? (
                <p className="text-sm text-empire-muted">Nenhum no-show pendente.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-empire-border bg-empire-elevated">
                    <tr>
                      <th className="px-4 py-2 text-left font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Nome</th>
                      <th className="px-4 py-2 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Data Agendada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noShows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => {
                          setSelectedOppId(row.id)
                          setShowModal(false)
                        }}
                        className="cursor-pointer border-t border-empire-border transition-colors hover:bg-empire-elevated"
                      >
                        <td className="px-4 py-3 font-medium text-empire-void">{row.nome ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-empire-danger/80">{fmtDatetime(row.data_agendada)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </div>
  )
}
