import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Calendar,
  Clock,
  TrendingUp,
  Users,
  CheckCircle,
  BarChart3,
  Target,
  Zap,
  Gauge,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectItem } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  useCreativeDashboardData,
  useCreativeAlerts,
  useCreativeReviewSettings,
  useUpdateCreativeReviewSettings,
  formatCurrency,
  FUNNEL_ORDER,
  UNMAPPED_FUNNEL_STATUS,
} from '@/hooks/useCreativeDashboard'
import { useCriativosList } from '@/hooks/useCriativos'
import type { FunnelStage, ThroughputPoint } from '@/hooks/useCreativeDashboard'
import type { NotionCreative } from '@/hooks/useCriativos'

const WEEK_DAYS: { value: string; label: string }[] = [
  { value: 'monday', label: 'Segunda-feira' },
  { value: 'tuesday', label: 'Terça-feira' },
  { value: 'wednesday', label: 'Quarta-feira' },
  { value: 'thursday', label: 'Quinta-feira' },
  { value: 'friday', label: 'Sexta-feira' },
  { value: 'saturday', label: 'Sábado' },
  { value: 'sunday', label: 'Domingo' },
]

const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

const STATUS_COLORS: Record<string, string> = {
  __nao_mapeado__: 'bg-empire-border-strong',
  ideia: 'bg-slate-400',
  roteiro: 'bg-blue-400',
  produzindo: 'bg-indigo-400',
  revisao: 'bg-purple-400',
  ajustes: 'bg-orange-400',
  aprovado: 'bg-emerald-400',
  reprovado: 'bg-red-400',
  pronto: 'bg-cyan-400',
  em_teste: 'bg-amber-400',
  testado: 'bg-teal-400',
  escalar: 'bg-green-500',
  arquivado: 'bg-gray-400',
}

function ProgressBar({ value, max, colorClass = 'bg-primary', size = 'md' }: { value: number; max: number; colorClass?: string; size?: 'sm' | 'md' | 'lg' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  const height = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-4' : 'h-2.5'
  return (
    <div className={`w-full overflow-hidden rounded-full bg-empire-elevated ${height}`}>
      <div
        className={['h-full rounded-full transition-all duration-500', colorClass].join(' ')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function KpiCard({
  title,
  value,
  description,
  icon: Icon,
  variant = 'default',
  trend,
}: {
  title: string
  value: React.ReactNode
  description?: string
  icon: React.ElementType
  variant?: 'default' | 'success' | 'warning' | 'danger'
  trend?: { value: number; label: string }
}) {
  const iconColor =
    variant === 'success'
      ? 'text-emerald-500'
      : variant === 'warning'
        ? 'text-amber-500'
        : variant === 'danger'
          ? 'text-red-500'
          : 'text-primary'

  const TrendIcon = trend && trend.value > 0 ? ArrowUpRight : trend && trend.value < 0 ? ArrowDownRight : Minus

  return (
    <Card variant="metric" className="animate-fade-in-up">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-empire-muted">{title}</p>
            <div className="text-3xl font-semibold tracking-tight text-empire-void">{value}</div>
            {description && <p className="text-xs text-empire-subtle">{description}</p>}
            {trend && (
              <div className="flex items-center gap-1 text-xs">
                <TrendIcon className={`h-3.5 w-3.5 ${trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'}`} />
                <span className={trend.value >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                  {trend.value > 0 ? '+' : ''}{trend.value}%
                </span>
                <span className="text-empire-muted">{trend.label}</span>
              </div>
            )}
          </div>
          <div className={['rounded-lg border border-empire-border bg-empire-surface p-2.5', iconColor].join(' ')}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function GoalCard({ current, goal }: { current: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0
  const status = pct >= 100 ? 'success' : pct >= 70 ? 'warning' : 'danger'
  const statusText = pct >= 100 ? 'Meta batida' : pct >= 70 ? 'Na rota' : 'Atrasado'

  return (
    <Card variant="glowing" className="animate-fade-in-up">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-empire-muted">Meta semanal</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-bold tracking-tight text-empire-void">{current}</span>
              <span className="text-lg text-empire-muted">/ {goal} validados</span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <ProgressBar value={current} max={goal} size="lg" colorClass={status === 'success' ? 'bg-emerald-500' : status === 'warning' ? 'bg-amber-500' : 'bg-red-500'} />
              <Badge variant={status === 'success' ? 'default' : status === 'warning' ? 'secondary' : 'destructive'} className="shrink-0">
                {pct}% · {statusText}
              </Badge>
            </div>
          </div>
          <div className="hidden rounded-xl border border-empire-border bg-empire-surface p-3 sm:block">
            <Target className="h-8 w-8 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// BUG-05, reunião de 2026-08-28: "Aperta nesse card aí, vai que abre alguma coisa. — Não,
// não tem clique, né?" (00:14:38). A etapa agora é um botão de verdade (alcançável por
// teclado, com foco visível), e abre o detalhamento dos criativos que compõem o número.
function FunnelStageItem({
  stage,
  isLast,
  onSelect,
}: {
  stage: FunnelStage
  isLast: boolean
  onSelect: (stage: FunnelStage) => void
}) {
  const isEmpty = stage.count === 0

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onSelect(stage)}
        disabled={isEmpty}
        aria-label={`Ver os ${stage.count} criativos da etapa ${stage.label}`}
        className={[
          'flex flex-1 flex-col gap-1.5 rounded-lg p-2 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
          isEmpty ? 'cursor-default opacity-60' : 'hover:bg-empire-elevated',
        ].join(' ')}
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-empire-void">{stage.label}</span>
          <span className="text-empire-muted">{stage.count}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-empire-elevated">
            <div
              className={['h-full rounded-full transition-all duration-500', STATUS_COLORS[stage.status] ?? 'bg-empire-primary'].join(' ')}
              style={{ width: `${Math.max(stage.pct, 3)}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs text-empire-muted">{stage.pct}%</span>
        </div>
        {stage.avgDays != null && (
          <p className="text-xs text-empire-subtle">média {stage.avgDays}d nesta etapa</p>
        )}
      </button>
      {!isLast && <div className="hidden h-px w-4 bg-empire-border lg:block" />}
    </div>
  )
}

function FunnelView({ funnel, onSelectStage }: { funnel: FunnelStage[]; onSelectStage: (stage: FunnelStage) => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {funnel.map((stage, index) => (
        <FunnelStageItem
          key={stage.status}
          stage={stage}
          isLast={index === funnel.length - 1}
          onSelect={onSelectStage}
        />
      ))}
    </div>
  )
}

const FUNNEL_STATUS_SET = new Set<string>(FUNNEL_ORDER)

/**
 * Quais criativos compõem uma etapa do funil.
 *
 * A etapa sintética "Fora do fluxo da plataforma" não tem status próprio no banco: ela é o
 * complemento — status fora do vocabulário (tipicamente o status cru do Notion) ou sem
 * status. Por isso o filtro dela é o inverso do das outras.
 */
function creativesForStage(creatives: NotionCreative[], stageStatus: string): NotionCreative[] {
  if (stageStatus === UNMAPPED_FUNNEL_STATUS) {
    return creatives.filter((c) => !c.status || !FUNNEL_STATUS_SET.has(c.status))
  }
  return creatives.filter((c) => c.status === stageStatus)
}

function sourceLabel(source: string | null | undefined): string {
  if (source === 'native') return 'Nativo'
  if (source === 'import') return 'Import'
  return 'Notion'
}

function FunnelStageDialog({ stage, onClose }: { stage: FunnelStage; onClose: () => void }) {
  // Sem filtro de `database_type`: o funil conta o workspace inteiro (v_creative_status_counts),
  // então o detalhamento tem que olhar para o mesmo universo.
  const { data: creatives, isLoading } = useCriativosList()
  const isUnmapped = stage.status === UNMAPPED_FUNNEL_STATUS

  const rows = useMemo(
    () => creativesForStage(creatives ?? [], stage.status),
    [creatives, stage.status],
  )

  return (
    <Dialog open onClose={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader onClose={onClose}>
          <DialogTitle>{stage.label}</DialogTitle>
          <DialogDescription>
            {stage.count} {stage.count === 1 ? 'criativo' : 'criativos'} · {stage.pct}% da base
            {isUnmapped && ' · status que não corresponde a nenhuma etapa da plataforma'}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Nenhum criativo nesta etapa"
              description="A contagem do funil e a lista de criativos podem ficar fora de sincronia por instantes após uma edição. Recarregue a página se persistir."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Formato</TableHead>
                  <TableHead>Origem</TableHead>
                  {isUnmapped && <TableHead>Status de origem</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((creative) => (
                  <TableRow key={creative.id}>
                    <TableCell className="font-mono text-xs text-empire-subtle">
                      {creative.external_id || creative.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-empire-void">{creative.name || 'Sem nome'}</TableCell>
                    <TableCell className="capitalize">{creative.format || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={creative.source === 'native' ? 'info' : 'secondary'}>
                        {sourceLabel(creative.source)}
                      </Badge>
                    </TableCell>
                    {isUnmapped && (
                      <TableCell className="text-empire-muted">{creative.status || 'Sem status'}</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function BarChart({ data, showGoal = false, emptyMessage }: { data: ThroughputPoint[]; showGoal?: boolean; emptyMessage: string }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.count, d.goal)))

  if (data.every((d) => d.count === 0 && d.goal === 0)) {
    return <EmptyState icon={BarChart3} title="Sem dados" description={emptyMessage} />
  }

  return (
    <div className="flex h-48 items-end gap-1.5 sm:gap-2">
      {data.map((point) => (
        <div key={point.date} className="group flex flex-1 flex-col items-center gap-1.5">
          <div className="relative w-full flex-1 rounded-t-md bg-empire-elevated">
            {showGoal && point.goal > 0 && (
              <div
                className="absolute w-full border-t-2 border-dashed border-empire-muted/50"
                style={{ bottom: `${(point.goal / max) * 100}%` }}
              />
            )}
            <div
              className="absolute bottom-0 w-full rounded-t-md bg-primary transition-all duration-500 group-hover:bg-primary/80"
              style={{ height: `${(point.count / max) * 100}%` }}
            />
          </div>
          <div className="text-center">
            <p className="text-[10px] font-medium text-empire-void">{point.count}</p>
            <p className="text-[9px] text-empire-muted">{point.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} variant="metric">
            <CardContent className="pt-6">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-8 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card variant="default" className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card variant="default">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export function DashboardTab() {
  const { data: dashboardData, isLoading: isLoadingDashboard } = useCreativeDashboardData()
  const { data: alerts, isLoading: isLoadingAlerts } = useCreativeAlerts()
  const { data: settings, isLoading: isLoadingSettings } = useCreativeReviewSettings()
  const updateSettings = useUpdateCreativeReviewSettings()
  // Etapa do funil aberta no drill-down (BUG-05). O modal só é montado quando há etapa
  // selecionada — assim a lista de criativos só é buscada quando alguém clica.
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null)

  const nextReviewDate = useMemo(() => {
    const dayKey = settings?.creative_review_day ?? 'thursday'
    const targetIndex = DAY_INDEX[dayKey] ?? 4
    const now = new Date()
    const currentIndex = now.getDay()
    let daysUntil = targetIndex - currentIndex
    if (daysUntil <= 0) daysUntil += 7
    const date = new Date(now)
    date.setDate(now.getDate() + daysUntil)
    return date
  }, [settings?.creative_review_day])

  const nextReviewTime = settings?.creative_review_time ?? '10:00'

  const handleDayChange = (value: string) => {
    updateSettings.mutate({ creative_review_day: value as never })
  }

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSettings.mutate({ creative_review_time: e.target.value })
  }

  const isLoading = isLoadingDashboard || isLoadingAlerts || isLoadingSettings

  if (isLoading) {
    return <DashboardSkeleton />
  }

  const bottleneck = dashboardData?.bottleneck
  const unmappedStatuses = dashboardData?.unmappedStatuses ?? []

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Goal */}
      <GoalCard current={dashboardData?.validatedThisWeek ?? 0} goal={dashboardData?.weeklyGoal ?? 0} />

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Validados / semana"
          value={dashboardData?.validatedThisWeek ?? 0}
          description={`Meta: ${dashboardData?.weeklyGoal ?? 0}`}
          icon={Target}
          variant="success"
          trend={{ value: dashboardData?.validatedTrend ?? 0, label: 'vs semana anterior' }}
        />
        <KpiCard
          title="Lead time"
          value={dashboardData?.leadTime != null ? `${dashboardData.leadTime}d` : '—'}
          description="Ideia → decisão"
          icon={Clock}
        />
        <KpiCard
          title="Cycle time"
          value={dashboardData?.cycleTime != null ? `${dashboardData.cycleTime}d` : '—'}
          description="Teste → decisão"
          icon={Gauge}
        />
        <KpiCard
          title="Yield rate"
          value={`${Math.round((dashboardData?.approvalRate.rate ?? 0) * 100)}%`}
          description={`${dashboardData?.approvalRate.approved ?? 0} aprovados / ${dashboardData?.approvalRate.tested ?? 0} testados`}
          icon={CheckCircle}
          variant="success"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard title="WIP" value={dashboardData?.wip ?? 0} description="Criativos em andamento" icon={Layers} />
        <KpiCard
          title="Total de criativos"
          value={dashboardData?.total ?? 0}
          description={`${dashboardData?.fromNotion ?? 0} Notion · ${dashboardData?.fromNative ?? 0} Nativos`}
          icon={Users}
        />
        <KpiCard
          title="Tempo até teste"
          value={dashboardData?.avgTimeToTest != null ? `${dashboardData.avgTimeToTest}d` : '—'}
          description="Pronto → início do teste"
          icon={Zap}
        />
      </div>

      {/* Bottleneck alert */}
      {bottleneck && (
        <Card variant="accent" className="border-l-4 border-l-amber-500">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium text-empire-void">Gargalo detectado: {bottleneck.label}</p>
              <p className="text-sm text-empire-muted">
                {bottleneck.count} criativos parados com média de {bottleneck.avgDays}d nesta etapa.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Funnel */}
      <Card variant="default">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Funil de produção + testes
          </CardTitle>
          <CardDescription>
            Fluxo de ideia até escalar/pausar. Cada criativo aparece em exatamente uma
            etapa, e o total das etapas fecha com o card "Total de criativos". Clique numa
            etapa para ver quais criativos estão nela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {dashboardData?.funnel.length === 0 ? (
            <EmptyState icon={BarChart3} title="Nenhum dado" description="A sincronização ainda não trouxe criativos." />
          ) : (
            <>
              <FunnelView funnel={dashboardData?.funnel ?? []} onSelectStage={setSelectedStage} />
              {unmappedStatuses.length > 0 && (
                <p className="rounded-lg border border-empire-border bg-empire-elevated p-3 text-xs text-empire-muted">
                  <span className="font-medium text-empire-void">Fora do fluxo da plataforma:</span>{' '}
                  criativos importados do Notion cujo status de lá ainda não corresponde a
                  nenhuma etapa daqui, mais os que estão sem status.{' '}
                  {unmappedStatuses.length > 0 && (
                    <>Status encontrados: {unmappedStatuses.join(', ')}.</>
                  )}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card variant="default">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Throughput diário
            </CardTitle>
            <CardDescription>Criativos validados nos últimos 15 dias.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={dashboardData?.dailyThroughput ?? []}
              showGoal
              emptyMessage="Nenhum criativo validado nos últimos 15 dias."
            />
          </CardContent>
        </Card>

        <Card variant="default">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Throughput semanal
            </CardTitle>
            <CardDescription>Criativos validados por semana vs meta.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart
              data={dashboardData?.weeklyThroughput ?? []}
              showGoal
              emptyMessage="Nenhum criativo validado nas últimas semanas."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Alerts */}
        <Card variant="default" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Alertas
            </CardTitle>
            <CardDescription>
              {alerts?.length === 0
                ? 'Nenhum alerta no momento.'
                : `${alerts?.length ?? 0} situação(ões) precisam de atenção.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alerts?.length === 0 ? (
              <EmptyState icon={CheckCircle} title="Tudo certo" description="Nenhum alerta foi gerado com base nos dados atuais." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {alerts?.map((alert) => {
                  const Icon = alert.type === 'danger' ? AlertCircle : alert.type === 'warning' ? AlertTriangle : Info
                  return (
                    <div
                      key={alert.id}
                      className={[
                        'flex items-start gap-3 rounded-xl border p-4',
                        alert.type === 'danger'
                          ? 'border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10'
                          : alert.type === 'warning'
                            ? 'border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-900/10'
                            : 'border-blue-200 bg-blue-50 dark:border-blue-900/30 dark:bg-blue-900/10',
                      ].join(' ')}
                    >
                      <Icon
                        className={[
                          'mt-0.5 h-5 w-5 shrink-0',
                          alert.type === 'danger' ? 'text-red-500' : alert.type === 'warning' ? 'text-amber-500' : 'text-blue-500',
                        ].join(' ')}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-empire-void">{alert.title}</p>
                        <p className="mt-0.5 text-xs text-empire-muted">{alert.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Side column */}
        <div className="space-y-6">
          {/* Next review */}
          <Card variant="default">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Próxima reunião
              </CardTitle>
              <CardDescription>Configure o dia e horário da revisão semanal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-empire-border bg-empire-elevated p-4 text-center">
                <p className="text-sm text-empire-muted">Próxima reunião</p>
                <p className="mt-1 text-2xl font-semibold text-empire-void">
                  {nextReviewDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                  })}
                </p>
                <p className="text-sm text-empire-subtle">{nextReviewTime}</p>
              </div>
              <div className="space-y-2">
                <Label>Dia da semana</Label>
                <Select
                  value={settings?.creative_review_day ?? 'thursday'}
                  onValueChange={handleDayChange}
                  placeholder="Selecione o dia"
                >
                  {WEEK_DAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <input
                  type="time"
                  value={nextReviewTime}
                  onChange={handleTimeChange}
                  className="w-full rounded-lg border border-empire-border bg-empire-surface px-3 py-2 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
                />
              </div>
            </CardContent>
          </Card>

          {/* CPL by format */}
          <Card variant="default">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                CPL médio por formato
              </CardTitle>
              <CardDescription>Média do CPL registrado nos criativos.</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardData?.cplByFormat.length === 0 ? (
                <EmptyState icon={TrendingUp} title="Sem dados de CPL" description="Nenhum criativo possui CPL registrado por formato." />
              ) : (
                <div className="space-y-3">
                  {dashboardData?.cplByFormat.map((item) => (
                    <div
                      key={item.format}
                      className="flex items-center justify-between rounded-lg border border-empire-border bg-empire-elevated px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {item.format}
                        </Badge>
                        <span className="text-xs text-empire-subtle">{item.count} criativos</span>
                      </div>
                      <span className="font-medium text-empire-void">{formatCurrency(item.avgCpl)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedStage && (
        <FunnelStageDialog stage={selectedStage} onClose={() => setSelectedStage(null)} />
      )}
    </div>
  )
}
