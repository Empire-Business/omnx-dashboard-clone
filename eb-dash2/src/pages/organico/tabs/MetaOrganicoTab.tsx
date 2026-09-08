/**
 * MetaOrganicoTab — aba dedicada ao acompanhamento de metas de MQL orgânico.
 *
 * Permite selecionar o período da meta cadastrado (ex: "Abril 2026") e visualizar
 * a evolução real de MQLs vs a meta para aquele período — independente do filtro
 * de data global da página.
 *
 * Suporta também filtro por canal, mostrando o progresso de um canal específico
 * em relação à meta individual daquele canal.
 */
import { useEffect, useMemo, useState } from 'react'
import { Target, ChevronDown } from 'lucide-react'
import { useOrganicoMetaTab } from '@/hooks/useOrganicoMetaTab'
import { OrganicoMqlGoalChart } from '@/components/organico/OrganicoMqlGoalChart'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { PIPELINE_RECUPERACAO_ID } from '@/lib/constants'
import { spToday, toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import type { OppRow } from '@/hooks/useTrafego'

interface MetaOrganicoTabProps {
  organicSourceSet: Set<string>
  channelOptions: { value: string; label: string }[]
}

const OPP_SELECT = 'id, data_lead_recebido, contatos(utm_source, tags)'

export function MetaOrganicoTab({ organicSourceSet, channelOptions }: MetaOrganicoTabProps) {
  const { periods, loading: periodsLoading } = useOrganicoMetaTab()

  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null)
  const [selectedChannel, setSelectedChannel] = useState<string>('')

  const [opps, setOpps] = useState<OppRow[]>([])
  const [oppsLoading, setOppsLoading] = useState(false)

  const today = spToday()

  // Auto-selecionar o período atual ou o mais recente quando os períodos carregam
  useEffect(() => {
    if (!periods.length) return
    if (selectedPeriodId && periods.some((p) => p.id === selectedPeriodId)) return

    const current = periods.find((p) => p.startDate <= today && p.endDate >= today)
    setSelectedPeriodId(current?.id ?? periods[0]?.id ?? null)
  }, [periods, today, selectedPeriodId])

  const selectedPeriod = useMemo(
    () => periods.find((p) => p.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  )

  // Carregar oportunidades para o período selecionado
  useEffect(() => {
    if (!selectedPeriod || organicSourceSet.size === 0) return
    let cancelled = false
    setOppsLoading(true)
    setOpps([])

    async function loadOpps() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        const startISO = toSPISOStart(selectedPeriod!.startDate)
        const endISO = toSPISOEnd(selectedPeriod!.endDate)

        const PAGE_SIZE = 1000
        let all: OppRow[] = []
        let page = 0

        while (true) {
          const res = await supabase
            .from('oportunidades')
            .select(OPP_SELECT)
            .eq('workspace_id', wid)
            .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
            .gte('data_lead_recebido', startISO)
            .lte('data_lead_recebido', endISO)
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

          if (cancelled) return
          if (res.error) throw res.error

          const rows = (res.data ?? []) as unknown as OppRow[]
          all = all.concat(rows)
          if (rows.length < PAGE_SIZE) break
          page++
        }

        // Filtrar apenas canais orgânicos
        const organic = all.filter((r) => {
          const src = r.contatos?.utm_source
          return src != null && src !== '' && organicSourceSet.has(src)
        })

        if (!cancelled) setOpps(organic)
      } catch {
        // silent — gráfico mostra estado sem dados
      } finally {
        if (!cancelled) setOppsLoading(false)
      }
    }

    void loadOpps()
    return () => {
      cancelled = true
    }
  }, [selectedPeriod, organicSourceSet])

  // Filtrar por canal selecionado
  const filteredOpps = useMemo(() => {
    if (!selectedChannel) return opps
    return opps.filter((o) => o.contatos?.utm_source === selectedChannel)
  }, [opps, selectedChannel])

  // Alvo ativo: canal selecionado usa meta do canal; sem canal usa meta global
  const activeTarget = useMemo(() => {
    if (!selectedPeriod) return null
    if (selectedChannel) {
      return selectedPeriod.targetByChannel.get(selectedChannel) ?? null
    }
    return selectedPeriod.globalTarget
  }, [selectedPeriod, selectedChannel])

  // Label amigável do canal ativo
  const activeChannelLabel = useMemo(() => {
    if (!selectedChannel) return undefined
    return channelOptions.find((o) => o.value === selectedChannel)?.label ?? selectedChannel
  }, [selectedChannel, channelOptions])

  // ── Estado: carregando períodos ──────────────────────────────
  if (periodsLoading) {
    return (
      <div
        className="animate-pulse rounded-2xl p-6 space-y-4 bg-empire-elevated border border-empire-border"
      >
        <div className="flex gap-3">
          <div className="h-9 w-56 rounded-lg bg-[rgba(13,24,41,0.07)]" />
          <div className="h-9 w-40 rounded-lg bg-[rgba(13,24,41,0.05)]" />
        </div>
        <div className="h-[500px] rounded-xl bg-empire-elevated" />
      </div>
    )
  }

  // ── Estado: sem metas cadastradas ───────────────────────────
  if (!periods.length) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-5 rounded-2xl py-20 bg-empire-elevated"
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
        >
          <Target size={28} className="text-empire-subtle" />
        </div>
        <div className="text-center max-w-sm px-4">
          <p className="text-base font-semibold text-empire-void mb-2">
            Nenhuma meta cadastrada
          </p>
          <p className="text-sm text-empire-subtle leading-relaxed">
            Acesse o módulo <span className="font-medium text-empire-void">Metas</span> e
            cadastre em{' '}
            <span className="font-medium text-empire-void">
              Orgânico → MQLs Orgânicos
            </span>
            . Você pode definir metas por canal individual (Instagram, YouTube, etc.) ou uma
            meta global para todos os canais.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Seletores: Período e Canal */}
      <div
        className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 bg-empire-elevated border border-empire-border"
      >
        {/* Período */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-empire-subtle shrink-0">Período:</span>
          <div className="relative">
            <select
              value={selectedPeriodId ?? ''}
              onChange={(e) => {
                setSelectedPeriodId(e.target.value || null)
                setSelectedChannel('')
              }}
              className="h-9 pl-3 pr-8 text-sm font-medium focus:outline-none appearance-none cursor-pointer transition-colors text-empire-void bg-empire-surface border-[1.5px] border-empire-border rounded-md"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-empire-subtle"
            />
          </div>
        </div>

        {/* Canal (mostra apenas se há metas por canal) */}
        {selectedPeriod && selectedPeriod.targetByChannel.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-empire-subtle shrink-0">Canal:</span>
            <div className="relative">
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="h-9 pl-3 pr-8 text-sm focus:outline-none appearance-none cursor-pointer transition-colors text-empire-void bg-empire-surface border-[1.5px] border-empire-border rounded-md"
              >
                <option value="">Todos os canais</option>
                {Array.from(selectedPeriod.targetByChannel.keys()).map((utm) => {
                  const opt = channelOptions.find((o) => o.value === utm)
                  return (
                    <option key={utm} value={utm}>
                      {opt?.label ?? utm}
                    </option>
                  )
                })}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-empire-subtle"
              />
            </div>
          </div>
        )}

        {/* Badge: período ativo */}
        {selectedPeriod && (
          <span
            className="ml-auto text-[11px] font-medium px-2.5 py-1 rounded-full"
          >
            {selectedPeriod.startDate <= today && selectedPeriod.endDate >= today
              ? 'Período atual'
              : selectedPeriod.endDate < today
                ? 'Encerrado'
                : 'Futuro'}
          </span>
        )}
      </div>

      {/* Gráfico */}
      {selectedPeriod && (
        <OrganicoMqlGoalChart
          opps={filteredOpps}
          startDate={selectedPeriod.startDate}
          endDate={selectedPeriod.endDate}
          targetValue={activeTarget}
          channelLabel={activeChannelLabel}
          loading={oppsLoading}
        />
      )}
    </div>
  )
}
