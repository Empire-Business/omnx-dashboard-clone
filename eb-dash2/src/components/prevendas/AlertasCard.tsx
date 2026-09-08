import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { spToday, spDaysAgo, toSPISOStart } from '@/lib/utils/dates'
import { AlertTriangle, Clock, ChevronDown } from 'lucide-react'

interface Props {
  loading: boolean
  compact?: boolean
}

// Linha da query de reuniões (client Supabase não é tipado)
interface ReuniaoAlertaRow {
  contatos: { nome: string | null } | null
  data_agendamento_reuniao: string
}

// ─── Helpers ──────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────

export function AlertasCard({ loading, compact = false }: Props) {
  const [open, setOpen] = useState(!compact)
  const [alerts, setAlerts] = useState<{
    reunioesHoje: { nome: string | null; data_agendada: string }[]
    leadsAntigos: number
  }>({ reunioesHoje: [], leadsAntigos: 0 })

  useEffect(() => {
    let cancelled = false

    async function loadAlerts() {
      try {
        const wid = await getWorkspaceId()
        if (!wid) throw new Error('Conta não encontrada')

        const todaySP = spToday()                        // YYYY-MM-DD hoje em SP
        const in2daysSP = spDaysAgo(-2)                  // YYYY-MM-DD 2 dias à frente em SP
        const d30agoTSTZ = toSPISOStart(spDaysAgo(30))   // ISO 30 dias atrás em SP (coluna TIMESTAMPTZ)

        const [reunioesRes, antigosRes] = await Promise.all([
          // Reuniões próximas (48h): intencionalmente SEM filtro de pipeline —
          // decisão do usuário (2026-07-05) é cobrir TODOS os leads com reunião
          // agendada, diferente do escopo mais restrito do discador
          // (PIPELINE_DISCAGEM_NAMES em lib/constants.ts). Não unificar essa
          // lógica com a do discador.
          supabase
            .from('oportunidades')
            .select('id, contatos(nome), data_agendamento_reuniao')
            .eq('workspace_id', wid)
            .gte('data_agendamento_reuniao', todaySP)
            .lte('data_agendamento_reuniao', in2daysSP)
            .is('data_realizacao_vendas', null)
            .limit(50),
          // Leads parados (>30d): alerta conceitualmente diferente do discador
          // e das reuniões — cobre só Pré-Vendas MQL/nMQL (não Auto Agendamento,
          // que por definição já tem próximo passo agendado).
          supabase
            .from('oportunidades')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', wid)
            .lte('data_lead_recebido', d30agoTSTZ)
            .is('data_fechado', null)
            .is('data_perdido', null)
            .not('data_lead_recebido', 'is', null)
            .in('pipeline_name', ['Pré-Vendas MQL', 'Pré-Vendas nMQL']),
        ])

        if (cancelled) return

        setAlerts({
          // Embed many-to-one `contatos` é inferido como array pelo client não
          // tipado, mas em runtime é objeto — cast estrutural para o tipo local.
          reunioesHoje: ((reunioesRes.data ?? []) as unknown as ReuniaoAlertaRow[]).map((r) => ({
            nome: r.contatos?.nome ?? null,
            data_agendada: r.data_agendamento_reuniao,
          })),
          leadsAntigos: antigosRes.count ?? 0,
        })
      } catch (err) {
        console.error('[AlertasCard]', err)
      }
    }

    void loadAlerts()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="overflow-hidden rounded-xl border border-empire-primary/30 bg-empire-surface">
      <div className="flex cursor-pointer select-none items-center gap-2 border-b border-empire-border px-4 py-3 transition-colors hover:bg-empire-elevated" onClick={() => setOpen(o => !o)}>
        <AlertTriangle className="h-4 w-4 text-empire-warning" />
        <h3 className="text-sm font-semibold text-empire-void">Alertas</h3>
        <ChevronDown className={cn('ml-auto h-4 w-4 text-empire-subtle transition-transform', !open && '-rotate-90')} />
      </div>

      {open && (
        <>
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {/* Reuniões nas próximas 48h */}
              <div>
                <p className="mb-2 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-empire-subtle">
                  <Clock className="h-3.5 w-3.5 text-empire-primary" />
                  Reuniões nas próximas 48h
                  <Badge variant="secondary" className="text-xs">{alerts.reunioesHoje.length}</Badge>
                </p>
                {alerts.reunioesHoje.length === 0 ? (
                  <p className="text-xs text-empire-muted">Nenhuma reunião agendada.</p>
                ) : (
                  <ul className="space-y-1">
                    {alerts.reunioesHoje.slice(0, 5).map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs text-empire-muted">
                        <span className="text-empire-void">{r.nome ?? '—'}</span>
                        <span className="ml-auto">{fmtDatetime(r.data_agendada)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Leads antigos parados */}
              <div>
                <p className="mb-1 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-empire-subtle">
                  <Clock className="h-3.5 w-3.5 text-empire-muted" />
                  Leads &gt;30d em pré-vendas (sem fechar/perder)
                </p>
                <p className="font-display text-[1.75rem] font-bold leading-none text-empire-warning">{alerts.leadsAntigos}</p>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}
