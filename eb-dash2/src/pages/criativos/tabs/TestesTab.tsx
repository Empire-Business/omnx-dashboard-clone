import { useEffect, useMemo, useState } from 'react'
import { FlaskConical, Play, CheckCircle2, XCircle, TrendingUp, Skull, AlertCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog'
import { useCriativosMetrics, type CreativeMetric } from '@/hooks/useCriativos'
import { getWorkspaceId } from '@/lib/workspace'
import {
  useCreativeTestCriteria,
  useCreativeTestQueue,
  useCreativeTests,
  useCreateCreativeTest,
  useDecideCreativeTest,
  selectReadyQueue,
  type TestDecision,
} from '@/hooks/useCreativeTests'
import type { NotionCreative, CreativeTest } from '@/types/creatives'
import { cn } from '@/lib/utils'

const STATUS_LABELS: Record<string, string> = {
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const SUGGESTION_LABELS: Record<TestSuggestion, { label: string; variant: 'success' | 'destructive' | 'warning' | 'default' }> = {
  approved: { label: 'APROVADO', variant: 'success' },
  scale: { label: 'ESCALAR', variant: 'success' },
  rejected: { label: 'REPROVADO', variant: 'destructive' },
  kill: { label: 'MATAR', variant: 'destructive' },
  wait: { label: 'AGUARDE', variant: 'warning' },
}

const DATE_RANGE_DAYS = 30

function formatCurrency(value: number | null | undefined) {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatNumber(value: number | null | undefined) {
  if (value == null) return '—'
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
}

type TestSuggestion = 'approved' | 'scale' | 'rejected' | 'kill' | 'wait'

function computeSuggestion(metrics: CreativeMetric | undefined, criteria: import('@/types/creatives').CreativeTestCriteria | null | undefined): TestSuggestion {
  if (!criteria) return 'wait'

  const leads = metrics?.leads_crm ?? metrics?.leads_meta ?? 0
  const spend = metrics?.total_spend ?? 0
  const cpl = metrics?.cpl_meta ?? metrics?.cpl_crm ?? null
  const cplTarget = criteria.cpl_target ?? null
  const budgetMin = criteria.budget_min ?? 300
  const earlyStopSpend = criteria.early_stop_spend ?? 200
  const earlyStopThreshold = criteria.early_stop_threshold ?? 1.5

  if (leads > 0 && cpl != null && cplTarget != null) {
    if (cpl <= cplTarget) return 'approved'
    if (cpl > cplTarget) return 'rejected'
  }

  if (spend >= budgetMin && leads === 0) return 'rejected'

  if (spend >= earlyStopSpend && cpl != null && cplTarget != null && cpl >= cplTarget * earlyStopThreshold) {
    return 'rejected'
  }

  if (spend < budgetMin && leads === 0) return 'wait'

  return 'wait'
}

function getDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - DATE_RANGE_DAYS)
  return { start: formatDate(start), end: formatDate(end) }
}

function formatDate(date: Date) {
  return date.toISOString().split('T')[0]
}

export function TestesTab() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const { data: queue = [], isLoading: queueLoading } = useCreativeTestQueue()
  const { data: activeTests = [], isLoading: testsLoading } = useCreativeTests('em_andamento')
  const { data: criteria, isLoading: criteriaLoading } = useCreativeTestCriteria()
  const createTest = useCreateCreativeTest()
  const decideTest = useDecideCreativeTest()

  const [search, setSearch] = useState('')

  useEffect(() => {
    void getWorkspaceId().then((id) => setWorkspaceId(id))
  }, [])
  const [reasonDialog, setReasonDialog] = useState<{ open: boolean; testId: string; creativeId: string; decision: TestDecision } | null>(null)
  const [reason, setReason] = useState('')

  const { start, end } = useMemo(() => getDateRange(), [])
  const creativeCodes = useMemo(() => queue.map((c) => c.external_id).filter(Boolean) as string[], [queue])

  const { data: metrics = [] } = useCriativosMetrics(workspaceId ?? undefined, start, end, creativeCodes)

  const metricsByCode = useMemo(() => {
    const map = new Map<string, CreativeMetric>()
    for (const m of metrics) {
      if (m.creative_code) map.set(m.creative_code, m)
    }
    return map
  }, [metrics])

  const activeTestsWithCreative = useMemo(() => {
    const creativeMap = new Map<string, NotionCreative>()
    for (const c of queue) {
      creativeMap.set(c.id, c)
    }
    return activeTests
      .map((test) => ({ test, creative: creativeMap.get(test.creative_id) }))
      .filter((item): item is { test: CreativeTest; creative: NotionCreative } => !!item.creative)
  }, [activeTests, queue])

  // Regra em `selectReadyQueue` (useCreativeTests.ts), com teste de regressão.
  const readyQueue = useMemo(() => selectReadyQueue(queue, activeTests), [queue, activeTests])

  const filteredQueue = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return readyQueue
    return readyQueue.filter(
      (c) =>
        c.name?.toLowerCase().includes(term) ||
        c.external_id?.toLowerCase().includes(term) ||
        c.format?.toLowerCase().includes(term)
    )
  }, [readyQueue, search])

  const filteredActive = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return activeTestsWithCreative
    return activeTestsWithCreative.filter(
      (item) =>
        item.creative.name?.toLowerCase().includes(term) ||
        item.creative.external_id?.toLowerCase().includes(term) ||
        item.creative.format?.toLowerCase().includes(term)
    )
  }, [activeTestsWithCreative, search])

  const handleStart = async (creative: NotionCreative) => {
    await createTest.mutateAsync({
      creativeId: creative.id,
      criteriaId: criteria?.id ?? null,
      budgetAllocated: criteria?.budget_max ?? null,
    })
  }

  const handleDecide = async () => {
    if (!reasonDialog) return
    await decideTest.mutateAsync({
      testId: reasonDialog.testId,
      creativeId: reasonDialog.creativeId,
      decision: reasonDialog.decision,
      reason,
    })
    setReason('')
    setReasonDialog(null)
  }

  const openReason = (testId: string, creativeId: string, decision: TestDecision) => {
    setReason('')
    setReasonDialog({ open: true, testId, creativeId, decision })
  }

  const loading = queueLoading || testsLoading || criteriaLoading

  return (
    <div className="space-y-6 animate-fade-in-up">
      <Card variant="default">
        <CardHeader className="border-b border-empire-border">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                Testes de Criativos
              </CardTitle>
              <CardDescription>
                Gerencie testes A/B, compare métricas com critérios e tome decisões.
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Input
                variant="default"
                placeholder="Buscar por nome, código, formato..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-[280px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {criteria && (
            <div className="flex flex-wrap gap-2 rounded-lg border border-empire-border bg-empire-elevated p-3">
              <Badge variant="outline">CPL alvo: {formatCurrency(criteria.cpl_target)}</Badge>
              <Badge variant="outline">Budget mín: {formatCurrency(criteria.budget_min)}</Badge>
              <Badge variant="outline">Budget máx: {formatCurrency(criteria.budget_max)}</Badge>
              <Badge variant="outline">Janela: {criteria.window_min_days}–{criteria.window_max_days} dias</Badge>
              <Badge variant="outline">Stop antecipado: CPL ≥ {criteria.early_stop_threshold}x após {formatCurrency(criteria.early_stop_spend)}</Badge>
            </div>
          )}

          <section>
            <h3 className="mb-3 text-sm font-semibold text-empire-void">Fila de testes</h3>
            {loading ? (
              <QueueSkeleton />
            ) : filteredQueue.length === 0 ? (
              <EmptyState icon={FlaskConical} title="Fila vazia" description="Nenhum criativo pronto para iniciar teste." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredQueue.map((creative) => (
                  <CreativeQueueCard
                    key={creative.id}
                    creative={creative}
                    onStart={() => handleStart(creative)}
                    starting={createTest.isPending}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-empire-void">Testes em andamento</h3>
            {loading ? (
              <QueueSkeleton />
            ) : filteredActive.length === 0 ? (
              <EmptyState icon={FlaskConical} title="Nenhum teste ativo" description="Inicie um teste a partir da fila acima." />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredActive.map(({ test, creative }) => (
                  <ActiveTestCard
                    key={test.id}
                    test={test}
                    creative={creative}
                    metrics={creative.external_id ? metricsByCode.get(creative.external_id) : undefined}
                    criteria={criteria}
                    onDecide={openReason}
                    deciding={decideTest.isPending}
                  />
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <Dialog open={!!reasonDialog?.open} onClose={() => setReasonDialog(null)}>
        <DialogContent>
          <DialogHeader onClose={() => setReasonDialog(null)}>
            <DialogTitle>Confirmar decisão</DialogTitle>
            <DialogDescription>Informe o motivo da decisão para registro no histórico.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-2">
              <Label htmlFor="reason">Motivo</Label>
              <Textarea
                id="reason"
                placeholder="Ex: CPL acima do alvo, alto volume de leads, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialog(null)}>Cancelar</Button>
            <Button onClick={handleDecide} disabled={!reason.trim()}>
              {decideTest.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreativeQueueCard({
  creative,
  onStart,
  starting,
}: {
  creative: NotionCreative
  onStart: () => void
  starting: boolean
}) {
  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-empire-subtle">{creative.external_id || '—'}</span>
          <h4 className="font-medium text-empire-void line-clamp-2">{creative.name || 'Sem nome'}</h4>
        </div>
        <Badge variant="outline">{creative.format || '—'}</Badge>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary">{creative.status || '—'}</Badge>
        {creative.source && <Badge variant="secondary">{creative.source}</Badge>}
      </div>
      <Button size="sm" className="w-full" onClick={onStart} disabled={starting}>
        {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
        Iniciar Teste
      </Button>
    </div>
  )
}

function ActiveTestCard({
  test,
  creative,
  metrics,
  criteria,
  onDecide,
  deciding,
}: {
  test: CreativeTest
  creative: NotionCreative
  metrics?: CreativeMetric
  criteria: import('@/types/creatives').CreativeTestCriteria | null | undefined
  onDecide: (testId: string, creativeId: string, decision: TestDecision) => void
  deciding: boolean
}) {
  const suggestion = computeSuggestion(metrics, criteria)
  const suggestionMeta = SUGGESTION_LABELS[suggestion]

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-xs text-empire-subtle">{creative.external_id || '—'}</span>
          <h4 className="font-medium text-empire-void">{creative.name || 'Sem nome'}</h4>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={suggestionMeta.variant}>{suggestionMeta.label}</Badge>
          <span className="text-[11px] text-empire-subtle">{STATUS_LABELS[test.status ?? ''] || test.status}</span>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg border border-empire-border bg-empire-elevated p-3">
        <MetricItem label="Investimento" value={formatCurrency(metrics?.total_spend ?? test.budget_spent)} />
        <MetricItem label="Leads" value={formatNumber(metrics?.leads_crm ?? metrics?.leads_meta ?? test.leads_crm ?? test.leads_meta)} />
        <MetricItem label="CPL" value={formatCurrency(metrics?.cpl_meta ?? metrics?.cpl_crm ?? test.cpl_crm ?? test.cpl_meta)} />
      </div>

      {suggestion === 'wait' && criteria && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-empire-warning/30 bg-empire-warning-soft p-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Dados insuficientes. Aguarde atingir {formatCurrency(criteria.budget_min)} de investimento ou receber leads.</span>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <ActionButton icon={CheckCircle2} label="Aprovar" color="green" onClick={() => onDecide(test.id, creative.id, 'approved')} disabled={deciding} />
        <ActionButton icon={XCircle} label="Reprovar" color="red" onClick={() => onDecide(test.id, creative.id, 'rejected')} disabled={deciding} />
        <ActionButton icon={TrendingUp} label="Escalar" color="blue" onClick={() => onDecide(test.id, creative.id, 'scale')} disabled={deciding} />
        <ActionButton icon={Skull} label="Matar" color="slate" onClick={() => onDecide(test.id, creative.id, 'kill')} disabled={deciding} />
      </div>
    </div>
  )
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xs text-empire-subtle">{label}</div>
      <div className="font-semibold text-empire-void">{value}</div>
    </div>
  )
}

function ActionButton({
  icon: Icon,
  label,
  color,
  onClick,
  disabled,
}: {
  icon: React.ElementType
  label: string
  color: 'green' | 'red' | 'blue' | 'slate'
  onClick: () => void
  disabled: boolean
}) {
  const colorClasses = {
    green: 'border-emerald-500/30 text-emerald-700 hover:bg-emerald-500 hover:text-white dark:text-emerald-300',
    red: 'border-red-500/30 text-red-700 hover:bg-red-500 hover:text-white dark:text-red-300',
    blue: 'border-blue-500/30 text-blue-700 hover:bg-blue-500 hover:text-white dark:text-blue-300',
    slate: 'border-empire-border text-empire-muted hover:bg-empire-void hover:text-white',
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-center justify-center gap-1 rounded-lg border bg-empire-elevated px-2 py-2 text-[11px] font-semibold transition-all disabled:opacity-50',
        colorClasses[color]
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

function QueueSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-empire-border bg-empire-surface p-4">
          <Skeleton className="mb-2 h-4 w-1/3" />
          <Skeleton className="mb-4 h-5 w-3/4" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}
