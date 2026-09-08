import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/supabase/paginate'
import { getWorkspaceId } from '@/lib/workspace'
import { toast } from 'sonner'
import type {
  CreativeStatusCount,
  NotionCreative,
  WorkspaceCreativeSettings,
} from '@/types/creatives'

// ─── Types ─────────────────────────────────────────────────────

export interface CreativeAlert {
  id: string
  type: 'warning' | 'danger' | 'info'
  title: string
  description: string
  creativeId?: string
  creativeCode?: string | null
}

export interface CplByFormat {
  format: string
  count: number
  avgCpl: number
}

export interface ApprovalRate {
  tested: number
  approved: number
  rate: number
}

export interface ThroughputPoint {
  label: string
  date: string
  count: number
  goal: number
}

export interface StageTime {
  stage: string
  label: string
  avgDays: number | null
  count: number
}

/**
 * Etapa sintética do funil: tudo que tem status fora do vocabulário da
 * plataforma (tipicamente o status cru do Notion) ou sem status nenhum.
 * Não é um status do banco — existe só para o funil fechar com o total.
 */
export const UNMAPPED_FUNNEL_STATUS = '__nao_mapeado__'

export interface FunnelStage {
  status: string
  label: string
  count: number
  pct: number
  avgDays: number | null
}

interface DashboardCreativeTest {
  id: string
  creative_id: string
  status: string
  result: string | null
  started_at: string
  ended_at: string | null
  decided_at: string | null
}

interface DashboardHistoryEvent {
  creative_id: string
  event_type: string
  performed_at: string
}

// O `select` dos alertas e o do dashboard trazem só um subconjunto de colunas.
// Tipar pelo subconjunto real (em vez de castar para `NotionCreative`) mantém o
// compilador capaz de acusar uso de coluna que não foi pedida na query.
type AlertCreativeRow = Pick<
  NotionCreative,
  'id' | 'external_id' | 'name' | 'status' | 'test_status' | 'source' | 'updated_at' | 'available_date' | 'test_started_at' | 'cpl_value' | 'format'
>

type DashboardCreativeRow = Pick<
  NotionCreative,
  'id' | 'external_id' | 'name' | 'status' | 'source' | 'format' | 'cpl_value' | 'available_date' | 'test_started_at' | 'data_avaliacao' | 'test_result' | 'created_at'
>

interface DashboardCriteria {
  id: string
  weekly_goal_reels: number | null
  weekly_goal_static: number | null
  weekly_goal_carousel: number | null
  weekly_goal_stories: number | null
  no_lead_max_days: number | null
}

// ─── Helpers ─────────────────────────────────────────────────────

function getWorkspaceIdOrThrow() {
  return getWorkspaceId().then((id) => {
    if (!id) throw new Error('Conta não encontrada')
    return id
  })
}

function daysBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const s = new Date(start)
  const e = new Date(end)
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null
  const diff = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : null
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

function toBrtDateLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function toBrtWeekLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function startOfWeekBrt(date = new Date()): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDateIso(date: Date): string {
  const [day, month, year] = date
    .toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    .split('/')
  return `${year}-${month}-${day}`
}

// `creative_tests.result` é gravado em português — o CHECK do banco
// (`creative_tests_result_check`) só aceita aprovado|reprovado|cancelado|pendente,
// e é isso que `useCreativeTests.ts` grava. Estas funções comparavam com valores
// em inglês (approved|scale|rejected|kill), que nunca casam: o efeito era yield
// rate, "validados/semana" e os throughputs diário e semanal SEMPRE zerados.
// Passou despercebido porque, até 2026-07-29, nenhum teste em produção tinha
// resultado decidido.
//
// `cancelado` e `pendente` ficam de fora de propósito: não são decisão de mérito,
// então não entram no denominador da taxa de aproveitamento.
function isValidResult(result: string | null): boolean {
  return result === 'aprovado' || result === 'reprovado'
}

function isApprovedResult(result: string | null): boolean {
  return result === 'aprovado'
}

// ─── Status counts ───────────────────────────────────────────────

export function useCreativeStatusCounts() {
  return useQuery({
    queryKey: ['criativos', 'dashboard', 'status-counts'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdOrThrow()
      const { data, error } = await supabase
        .from('v_creative_status_counts')
        .select('status, total, from_notion, from_native')
        .eq('workspace_id', workspaceId)

      if (error) throw error
      return (data ?? []) as CreativeStatusCount[]
    },
  })
}

// ─── Review settings ─────────────────────────────────────────────

export function useCreativeReviewSettings() {
  return useQuery({
    queryKey: ['criativos', 'dashboard', 'review-settings'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdOrThrow()
      const { data, error } = await supabase
        .from('workspace_settings')
        .select('id, settings')
        .eq('workspace_id', workspaceId)
        .eq('app_slug', 'criativos')
        .maybeSingle()

      if (error) throw error
      return (data?.settings ?? {}) as WorkspaceCreativeSettings
    },
  })
}

export function useUpdateCreativeReviewSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (settings: Partial<WorkspaceCreativeSettings>) => {
      const workspaceId = await getWorkspaceIdOrThrow()

      const { data: existing } = await supabase
        .from('workspace_settings')
        .select('id, settings')
        .eq('workspace_id', workspaceId)
        .eq('app_slug', 'criativos')
        .maybeSingle()

      const merged = { ...(existing?.settings ?? {}), ...settings }

      const { error } = existing?.id
        ? await supabase
            .from('workspace_settings')
            .update({ settings: merged })
            .eq('id', existing.id)
        : await supabase.from('workspace_settings').insert({
            workspace_id: workspaceId,
            app_slug: 'criativos',
            settings: merged,
          })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'dashboard', 'review-settings'] })
      toast.success('Configuração salva')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar configuração')
    },
  })
}

// ─── Alerts ──────────────────────────────────────────────────────

export function useCreativeAlerts() {
  return useQuery({
    queryKey: ['criativos', 'dashboard', 'alerts'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdOrThrow()

      const [
        creatives,
        { data: tests, error: testsError },
        { data: criteria, error: criteriaError },
      ] = await Promise.all([
        // Paginado: sem `.range()` o PostgREST corta em 1000 linhas em silêncio
        // (CLAUDE.md, "LIMITE CRÍTICO"), e alertas de criativos além do corte
        // simplesmente não eram gerados.
        fetchAllPages<AlertCreativeRow>(() =>
          supabase
            .from('notion_creatives')
            .select(
              'id, external_id, name, status, test_status, source, updated_at, available_date, test_started_at, cpl_value, format'
            )
            .eq('workspace_id', workspaceId)
            .order('id', { ascending: true })
        ),
        supabase
          .from('creative_tests')
          .select('id, creative_id, status, leads_crm, started_at')
          .eq('workspace_id', workspaceId)
          .eq('status', 'em_andamento'),
        supabase.from('creative_test_criteria').select('*').eq('workspace_id', workspaceId).maybeSingle(),
      ])

      if (testsError) throw testsError
      if (criteriaError) throw criteriaError

      const list = creatives
      const activeTests = (tests ?? []) as {
        id: string
        creative_id: string
        status: string
        leads_crm: number | null
        started_at: string | null
      }[]
      const testByCreative = new Map(activeTests.map((t) => [t.creative_id, t]))
      const alerts: CreativeAlert[] = []

      if (!criteria) {
        alerts.push({
          id: 'criteria-missing',
          type: 'warning',
          title: 'Critérios de teste não configurados',
          description: 'Configure os critérios de aprovação/reprovação para habilitar as sugestões automáticas.',
        })
      }

      const now = new Date()
      const noLeadMaxDays = criteria?.no_lead_max_days ?? 5
      const readyMaxDays = 3

      for (const c of list) {
        if (c.status === 'pronto' && c.updated_at) {
          const days = daysBetween(c.updated_at, now.toISOString())
          if (days !== null && days > readyMaxDays) {
            alerts.push({
              id: `ready-${c.id}`,
              type: 'warning',
              title: 'Criativo pronto aguardando teste',
              description: `"${c.name ?? c.external_id ?? 'Sem nome'}" está pronto há ${days} dias e ainda não iniciou teste.`,
              creativeId: c.id,
              creativeCode: c.external_id,
            })
          }
        }

        const isInTest = c.test_status === 'em_teste' || c.status === 'em_teste'
        const test = testByCreative.get(c.id)
        if (isInTest && test) {
          const start = test.started_at ?? c.test_started_at ?? c.updated_at
          const hasNoLeads = test.leads_crm == null || test.leads_crm === 0
          if (start && hasNoLeads) {
            const days = daysBetween(start, now.toISOString())
            if (days !== null && days > noLeadMaxDays) {
              alerts.push({
                id: `no-leads-${c.id}`,
                type: 'danger',
                title: 'Teste sem leads',
                description: `"${c.name ?? c.external_id ?? 'Sem nome'}" está em teste há ${days} dias sem leads no CRM.`,
                creativeId: c.id,
                creativeCode: c.external_id,
              })
            }
          }
        }
      }

      return alerts
    },
  })
}

// ─── Consolidated dashboard data ─────────────────────────────────

export interface CreativeDashboardData {
  total: number
  fromNotion: number
  fromNative: number
  fromOther: number
  statusCounts: CreativeStatusCount[]
  approvalRate: ApprovalRate
  avgTimeToTest: number | null
  avgTimeToDecision: number | null
  cplByFormat: CplByFormat[]
  weeklyGoal: number
  validatedThisWeek: number
  validatedTrend: number
  dailyThroughput: ThroughputPoint[]
  weeklyThroughput: ThroughputPoint[]
  leadTime: number | null
  cycleTime: number | null
  wip: number
  stageTimes: StageTime[]
  funnel: FunnelStage[]
  /** Status crus (vindos do Notion) que não existem no vocabulário da plataforma. */
  unmappedStatuses: string[]
  bottleneck?: {
    stage: string
    label: string
    count: number
    avgDays: number
  }
}

export function useCreativeDashboardData() {
  return useQuery({
    queryKey: ['criativos', 'dashboard', 'data'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceIdOrThrow()

      const [
        creatives,
        { data: tests, error: testsError },
        { data: history, error: historyError },
        { data: statusCounts, error: statusCountsError },
        { data: criteriaRow, error: criteriaError },
      ] = await Promise.all([
        // Paginado: este select alimenta os cards "Total de criativos" e "WIP".
        // Sem `.range()` ele voltava com exatamente 1000 linhas (teto do PostgREST),
        // e era daí que saíam os números 1000/976 que a reunião de 2026-08-28 não
        // conseguiu conciliar com o funil (BUG-02/UX-01).
        fetchAllPages<DashboardCreativeRow>(() =>
          supabase
            .from('notion_creatives')
            .select(
              'id, external_id, name, status, source, format, cpl_value, available_date, test_started_at, data_avaliacao, test_result, created_at'
            )
            .eq('workspace_id', workspaceId)
            .order('id', { ascending: true })
        ),
        supabase
          .from('creative_tests')
          .select('id, creative_id, status, result, started_at, ended_at, decided_at')
          .eq('workspace_id', workspaceId),
        supabase
          .from('creative_test_history')
          .select('creative_id, event_type, performed_at')
          .eq('workspace_id', workspaceId)
          .in('event_type', ['teste_iniciado', 'aprovado', 'reprovado'])
          .order('performed_at', { ascending: true }),
        supabase
          .from('v_creative_status_counts')
          .select('status, total, from_notion, from_native')
          .eq('workspace_id', workspaceId),
        supabase
          .from('creative_test_criteria')
          .select('id, weekly_goal_reels, weekly_goal_static, weekly_goal_carousel, weekly_goal_stories, no_lead_max_days')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
      ])

      if (testsError) throw testsError
      if (historyError) throw historyError
      if (statusCountsError) throw statusCountsError
      if (criteriaError) throw criteriaError

      const list = creatives
      const testList = (tests ?? []) as DashboardCreativeTest[]
      const histList = (history ?? []) as DashboardHistoryEvent[]
      const counts = (statusCounts ?? []) as CreativeStatusCount[]
      const criteria = criteriaRow as DashboardCriteria | null

      const total = list.length
      const fromNotion = list.filter((c) => c.source === 'notion').length
      const fromNative = list.filter((c) => c.source === 'native').length
      const fromOther = total - fromNotion - fromNative

      const weeklyGoal =
        (criteria?.weekly_goal_reels ?? 0) +
        (criteria?.weekly_goal_static ?? 0) +
        (criteria?.weekly_goal_carousel ?? 0) +
        (criteria?.weekly_goal_stories ?? 0)

      // ── Taxa de aprovação ───────────────────────────────────────
      const decidedTests = testList.filter((t) => isValidResult(t.result))
      const tested = decidedTests.length
      const approved = decidedTests.filter((t) => isApprovedResult(t.result)).length
      const approvalRate: ApprovalRate = {
        tested,
        approved,
        rate: tested > 0 ? approved / tested : 0,
      }

      // ── Histórico por criativo ──────────────────────────────────
      const historyByCreative: Record<string, DashboardHistoryEvent[]> = {}
      for (const h of histList) {
        if (!historyByCreative[h.creative_id]) historyByCreative[h.creative_id] = []
        historyByCreative[h.creative_id].push(h)
      }

      // ── Tempos de ciclo/lead ────────────────────────────────────
      const timeToTest: number[] = []
      const timeToDecision: number[] = []
      const totalLeadTimes: number[] = []

      for (const creativeId in historyByCreative) {
        const events = historyByCreative[creativeId]
        const startEvent = events.find((e) => e.event_type === 'teste_iniciado')
        const decisionEvent = events.find((e) => e.event_type === 'aprovado' || e.event_type === 'reprovado')
        const creative = list.find((c) => c.id === creativeId)

        if (startEvent && creative?.available_date) {
          const d = daysBetween(creative.available_date, startEvent.performed_at)
          if (d != null) timeToTest.push(d)
        }

        if (startEvent && decisionEvent) {
          const d = daysBetween(startEvent.performed_at, decisionEvent.performed_at)
          if (d != null) timeToDecision.push(d)
        }

        if (creative?.created_at && decisionEvent) {
          const d = daysBetween(creative.created_at, decisionEvent.performed_at)
          if (d != null) totalLeadTimes.push(d)
        }
      }

      const avgTimeToTest =
        timeToTest.length > 0
          ? Math.round((timeToTest.reduce((a, b) => a + b, 0) / timeToTest.length) * 10) / 10
          : null
      const avgTimeToDecision =
        timeToDecision.length > 0
          ? Math.round((timeToDecision.reduce((a, b) => a + b, 0) / timeToDecision.length) * 10) / 10
          : null
      const leadTime =
        totalLeadTimes.length > 0
          ? Math.round((totalLeadTimes.reduce((a, b) => a + b, 0) / totalLeadTimes.length) * 10) / 10
          : null
      const cycleTime = avgTimeToDecision

      // ── WIP (tudo que ainda não foi decidido/arquivado) ───────────
      const terminalStatuses = new Set(['escalar', 'arquivado'])
      const wip = list.filter((c) => c.status && !terminalStatuses.has(c.status)).length

      // ── Throughput diário (últimos 15 dias) ─────────────────────
      const today = new Date()
      const dailyThroughput: ThroughputPoint[] = []
      for (let i = 14; i >= 0; i--) {
        const d = addDays(today, -i)
        const iso = formatDateIso(d)
        const count = decidedTests.filter((t) => {
          if (!t.decided_at) return false
          return formatDateIso(new Date(t.decided_at)) === iso && isApprovedResult(t.result)
        }).length
        dailyThroughput.push({
          label: toBrtDateLabel(iso),
          date: iso,
          count,
          goal: Math.max(1, Math.round(weeklyGoal / 7)),
        })
      }

      // ── Throughput semanal (últimas 8 semanas) ──────────────────
      const currentWeekStart = startOfWeekBrt(today)
      const weeklyThroughput: ThroughputPoint[] = []
      for (let i = 7; i >= 0; i--) {
        const weekStart = addDays(currentWeekStart, -i * 7)
        const weekEnd = addDays(weekStart, 6)
        const count = decidedTests.filter((t) => {
          if (!t.decided_at) return false
          const d = new Date(t.decided_at)
          return d >= weekStart && d <= weekEnd && isApprovedResult(t.result)
        }).length
        weeklyThroughput.push({
          label: `${toBrtWeekLabel(weekStart.toISOString())}`,
          date: formatDateIso(weekStart),
          count,
          goal: weeklyGoal,
        })
      }

      // ── Validados na semana corrente ────────────────────────────
      const validatedThisWeek = weeklyThroughput[weeklyThroughput.length - 1]?.count ?? 0
      const previousWeek = weeklyThroughput[weeklyThroughput.length - 2]?.count ?? 0
      const validatedTrend = previousWeek > 0 ? Math.round(((validatedThisWeek - previousWeek) / previousWeek) * 100) : 0

      // ── Tempo por estágio (simplificado) ────────────────────────
      const stageBuckets: Record<string, number[]> = {
        produzindo: [],
        revisao: [],
        ajustes: [],
        pronto: [],
        em_teste: [],
      }

      for (const c of list) {
        if (c.status === 'pronto' && c.available_date && c.test_started_at) {
          const d = daysBetween(c.available_date, c.test_started_at)
          if (d != null) stageBuckets.pronto.push(d)
        }
      }

      for (const t of decidedTests) {
        if (t.started_at && t.decided_at) {
          const d = daysBetween(t.started_at, t.decided_at)
          if (d != null) stageBuckets.em_teste.push(d)
        }
      }

      const stageTimes: StageTime[] = [
        { stage: 'produzindo', label: 'Produzindo', avgDays: null, count: 0 },
        { stage: 'revisao', label: 'Revisão', avgDays: null, count: 0 },
        { stage: 'ajustes', label: 'Ajustes', avgDays: null, count: 0 },
        { stage: 'pronto', label: 'Pronto → Teste', avgDays: average(stageBuckets.pronto), count: stageBuckets.pronto.length },
        { stage: 'em_teste', label: 'Em Teste', avgDays: average(stageBuckets.em_teste), count: stageBuckets.em_teste.length },
      ]

      // ── Funil de produção/testes ────────────────────────────────
      // Regra em `buildCreativeFunnel` (função pura, testada em
      // test/creative-funnel.test.ts).
      const stageTimeMap = new Map(stageTimes.map((st) => [st.stage, st.avgDays]))
      const { funnel, unmappedStatuses } = buildCreativeFunnel(counts, stageTimeMap)

      // ── Gargalo ─────────────────────────────────────────────────
      let bottleneck: CreativeDashboardData['bottleneck'] | undefined
      // O balde "fora do fluxo" nunca é gargalo — não é uma etapa real de trabalho.
      const queueStages = funnel.filter((f) => ['revisao', 'ajustes', 'pronto', 'em_teste'].includes(f.status))
      const biggestQueue = queueStages.sort((a, b) => b.count - a.count)[0]
      const slowestStage = stageTimes.filter((s) => s.avgDays != null).sort((a, b) => (b.avgDays ?? 0) - (a.avgDays ?? 0))[0]

      if (biggestQueue && biggestQueue.count >= 5) {
        bottleneck = {
          stage: biggestQueue.status,
          label: biggestQueue.label,
          count: biggestQueue.count,
          avgDays: Math.round((biggestQueue.avgDays ?? 0) * 10) / 10,
        }
      } else if (slowestStage && (slowestStage.avgDays ?? 0) >= 3) {
        bottleneck = {
          stage: slowestStage.stage,
          label: slowestStage.label,
          count: slowestStage.count,
          avgDays: slowestStage.avgDays ?? 0,
        }
      }

      // ── CPL médio por formato ───────────────────────────────────
      const cplMap: Record<string, { total: number; count: number }> = {}
      for (const c of list) {
        if (c.cpl_value == null || c.cpl_value <= 0 || !c.format) continue
        if (!cplMap[c.format]) cplMap[c.format] = { total: 0, count: 0 }
        cplMap[c.format].total += c.cpl_value
        cplMap[c.format].count += 1
      }
      const cplByFormat: CplByFormat[] = Object.entries(cplMap)
        .map(([format, { total, count }]) => ({
          format,
          count,
          avgCpl: Math.round((total / count) * 100) / 100,
        }))
        .sort((a, b) => b.avgCpl - a.avgCpl)

      return {
        total,
        fromNotion,
        fromNative,
        fromOther,
        statusCounts: counts,
        approvalRate,
        avgTimeToTest,
        avgTimeToDecision,
        cplByFormat,
        weeklyGoal,
        validatedThisWeek,
        validatedTrend,
        dailyThroughput,
        weeklyThroughput,
        leadTime,
        cycleTime,
        wip,
        stageTimes,
        funnel,
        unmappedStatuses,
        bottleneck,
      } as CreativeDashboardData
    },
  })
}

export const FUNNEL_ORDER = [
  'ideia', 'roteiro', 'produzindo', 'revisao', 'ajustes',
  'aprovado', 'pronto', 'em_teste', 'testado', 'escalar',
] as const

/**
 * Monta as etapas do "Funil de produção + testes".
 *
 * POR QUE ISSO EXISTE COMO FUNÇÃO SEPARADA
 * O funil só conhece os 10 status do vocabulário da plataforma. Mas
 * `v_creative_status_counts` agrupa pelo TEXTO CRU da coluna `status`, e o
 * criativo vindo do Notion carrega o status do Notion literalmente ("Concluído",
 * "Não iniciado", "Revisar edição", "Postado", "Postado no Trial", ou NULL) —
 * nada disso casa com a lista acima.
 *
 * Resultado observado na reunião de 2026-08-28 (UX-01): o funil somava 13 (só os
 * criativos nativos) enquanto o resto da tela falava em 976 e 1000, e ninguém
 * conseguiu explicar a diferença. Pior, o `pct` era calculado sobre esses 13 —
 * "Ideia 61,5%" era 8/13, porcentagem de um universo que a tela nunca mostrava.
 *
 * A correção honesta, sem inventar mapeamento de status (isso é a questão Q2 da
 * reunião, ainda em aberto): TODO criativo aparece em algum lugar. O que não está
 * no vocabulário cai num balde explícito, e as porcentagens passam a ser sobre a
 * base inteira — o funil fecha com o card "Total de criativos".
 */
export function buildCreativeFunnel(
  counts: CreativeStatusCount[],
  stageTimeMap: Map<string, number | null> = new Map(),
): { funnel: FunnelStage[]; unmappedStatuses: string[] } {
  const knownStatuses = new Set<string>(FUNNEL_ORDER)
  const countByStatus = new Map(counts.map((c) => [c.status, c.total]))

  const unmapped = counts.filter((c) => !c.status || !knownStatuses.has(c.status))
  const unmappedCount = unmapped.reduce((sum, c) => sum + (c.total ?? 0), 0)
  const unmappedStatuses = unmapped
    .map((c) => c.status)
    .filter((st): st is string => !!st)
    .sort()

  // Denominador = base inteira (mapeados + não mapeados), não só as 10 etapas.
  const totalFunnel =
    FUNNEL_ORDER.reduce((sum, st) => sum + (countByStatus.get(st) ?? 0), 0) + unmappedCount

  const pctOf = (count: number) =>
    totalFunnel > 0 ? Math.round((count / totalFunnel) * 1000) / 10 : 0

  const funnel: FunnelStage[] = FUNNEL_ORDER.map((status) => {
    const count = countByStatus.get(status) ?? 0
    return {
      status,
      label: statusLabel(status),
      count,
      pct: pctOf(count),
      avgDays: stageTimeMap.get(status) ?? null,
    }
  })

  if (unmappedCount > 0) {
    funnel.push({
      status: UNMAPPED_FUNNEL_STATUS,
      label: 'Fora do fluxo da plataforma',
      count: unmappedCount,
      pct: pctOf(unmappedCount),
      avgDays: null,
    })
  }

  return { funnel, unmappedStatuses }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ideia: 'Ideia',
    roteiro: 'Roteiro',
    produzindo: 'Produzindo',
    revisao: 'Revisão',
    ajustes: 'Ajustes',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    pronto: 'Pronto',
    em_teste: 'Em Teste',
    testado: 'Testado',
    escalar: 'Escalar',
    arquivado: 'Arquivado',
  }
  return map[status] ?? status
}

export { daysBetween, formatCurrency }
