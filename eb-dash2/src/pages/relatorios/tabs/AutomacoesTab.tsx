import { useState } from 'react'
import {
  Plus,
  Mail,
  Clock,
  Play,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Send,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { AutomationForm } from '@/components/relatorios/AutomationForm'
import { useWeeklyEmailSchedules, type WeeklyEmailSchedule, type WeeklyEmailLog } from '@/hooks/useWeeklyEmailSchedules'
import { useCredentialsStatus } from '@/hooks/useWorkspaceCredentials'

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Diário',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatNextRun(nextRun: string | null): string {
  if (!nextRun) return '—'
  const d = new Date(nextRun)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatLastRun(lastRun: string | null): string {
  if (!lastRun) return 'Nunca'
  const d = new Date(lastRun)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: WeeklyEmailLog['status'] }) {
  const styles: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
    sent: { bg: 'var(--empire-success-soft)', text: 'var(--empire-success)', icon: CheckCircle2 },
    pending: { bg: 'var(--empire-warning-soft)', text: 'var(--empire-warning)', icon: Clock },
    failed: { bg: 'rgba(239,68,68,0.1)', text: 'var(--empire-danger)', icon: AlertCircle },
    bounced: { bg: 'var(--empire-elevated)', text: 'var(--empire-subtle)', icon: AlertCircle },
  }
  const s = styles[status] ?? styles.pending
  const Icon = s.icon
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
    >
      <Icon className="h-3 w-3" />
      {status === 'sent' ? 'Enviado' : status === 'pending' ? 'Pendente' : status === 'failed' ? 'Falhou' : 'Bounced'}
    </span>
  )
}

export function AutomacoesTab() {
  const {
    schedules,
    loading,
    error,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getLogs,
    sendTest,
    suggestWithAI,
  } = useWeeklyEmailSchedules()
  const { data: credentials } = useCredentialsStatus()
  const openrouterConnected = credentials?.some((c) => c.provider === 'openrouter')

  const [formOpen, setFormOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<WeeklyEmailSchedule | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [logsBySchedule, setLogsBySchedule] = useState<Record<string, WeeklyEmailLog[]>>({})
  const [logsLoading, setLogsLoading] = useState<Record<string, boolean>>({})
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [testEmail, setTestEmail] = useState<Record<string, string>>({})
  const [formLoading, setFormLoading] = useState(false)

  const handleCreate = async (data: Parameters<typeof createSchedule>[0]) => {
    setFormLoading(true)
    const result = await createSchedule(data)
    setFormLoading(false)
    if ('error' in result) {
      alert(result.error)
      throw new Error(result.error)
    }
  }

  const handleUpdate = async (id: string, data: Parameters<typeof updateSchedule>[1]) => {
    setFormLoading(true)
    const result = await updateSchedule(id, data)
    setFormLoading(false)
    if ('error' in result) {
      alert(result.error)
      throw new Error(result.error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta automação?')) return
    setActionLoading((prev) => ({ ...prev, [id]: true }))
    const result = await deleteSchedule(id)
    setActionLoading((prev) => ({ ...prev, [id]: false }))
    if ('error' in result) alert(result.error)
  }

  const handleToggleActive = async (schedule: WeeklyEmailSchedule) => {
    const result = await updateSchedule(schedule.id, { is_active: !schedule.is_active })
    if ('error' in result) alert(result.error)
  }

  const handleTest = async (schedule: WeeklyEmailSchedule) => {
    const email = testEmail[schedule.id]?.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Digite um e-mail válido para o teste')
      return
    }
    setActionLoading((prev) => ({ ...prev, [`test-${schedule.id}`]: true }))
    const result = await sendTest(schedule.id, email)
    setActionLoading((prev) => ({ ...prev, [`test-${schedule.id}`]: false }))
    alert(result.success ? 'E-mail de teste enviado!' : result.message)
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!logsBySchedule[id]) {
      setLogsLoading((prev) => ({ ...prev, [id]: true }))
      const logs = await getLogs(id)
      setLogsBySchedule((prev) => ({ ...prev, [id]: logs }))
      setLogsLoading((prev) => ({ ...prev, [id]: false }))
    }
  }

  const openEdit = (schedule: WeeklyEmailSchedule) => {
    setEditingSchedule(schedule)
    setFormOpen(true)
  }

  const openCreate = () => {
    setEditingSchedule(null)
    setFormOpen(true)
  }

  const frequencyText = (s: WeeklyEmailSchedule) => {
    const base = FREQUENCY_LABELS[s.frequency]
    if (s.frequency === 'daily') return base
    if (s.frequency === 'monthly') return `${base} (dia ${s.day_of_month})`
    return `${base} (${DAY_LABELS[s.day_of_week ?? 1]})`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-empire-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Erro ao carregar automações: {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-empire-void">Automações de e-mail</h2>
          <p className="text-sm text-empire-subtle">
            Configure relatórios automáticos enviados periodicamente por e-mail.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Nova automação
        </Button>
      </div>

      {schedules.some((s) => s.use_clara_summary) && !openrouterConnected && (
        <div className="rounded-xl border border-empire-warning/30 bg-empire-warning/10 p-4 text-sm text-empire-void">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-empire-warning" />
            <div>
              <p className="font-medium">A Clara precisa de uma chave OpenRouter</p>
              <p className="mt-1 text-empire-subtle">
                Pelo menos uma automação usa a análise da Clara, mas nenhuma chave OpenRouter está
                configurada. Os e-mails com análise da Clara não serão enviados até cadastrar a chave.
              </p>
              <a
                href="/workspace/integracoes"
                className="mt-2 inline-flex items-center gap-1 font-medium text-empire-primary hover:underline"
              >
                Ir para Integrações <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {schedules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-empire-border bg-empire-canvas p-12 text-center">
          <Mail className="mx-auto h-10 w-10 text-empire-subtle opacity-50" />
          <p className="mt-4 text-sm font-medium text-empire-void">Nenhuma automação criada</p>
          <p className="mt-1 text-xs text-empire-subtle">
            Crie sua primeira automação para receber relatórios por e-mail.
          </p>
          <Button onClick={openCreate} className="mt-4 gap-1.5" variant="outline">
            <Plus className="h-4 w-4" />
            Criar automação
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className="overflow-hidden border-empire-border bg-empire-surface p-0">
              <div className="flex items-start justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-empire-void">{schedule.name}</h3>
                    {!schedule.is_active && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        Inativo
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-empire-subtle">
                    {frequencyText(schedule)} às {schedule.time_of_day.slice(0, 5)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-empire-subtle">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {schedule.recipient_emails.length} destinatário{schedule.recipient_emails.length !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Próximo: {formatNextRun(schedule.next_run_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Send className="h-3.5 w-3.5" />
                      Último: {formatLastRun(schedule.last_run_at)}
                    </span>
                    {schedule.last_error && (
                      <span className="flex items-center gap-1 text-red-500" title={schedule.last_error}>
                        <AlertCircle className="h-3.5 w-3.5" />
                        Erro no último envio
                      </span>
                    )}
                  </div>
                </div>

                <div className="ml-4 flex items-center gap-1">
                  <Checkbox
                    checked={schedule.is_active}
                    onCheckedChange={() => handleToggleActive(schedule)}
                    title={schedule.is_active ? 'Desativar' : 'Ativar'}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(schedule)}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4 text-empire-subtle" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(schedule.id)}
                    disabled={actionLoading[schedule.id]}
                    title="Excluir"
                  >
                    {actionLoading[schedule.id] ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-red-500" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Envio de teste */}
              <div className="border-t border-empire-border bg-empire-canvas px-4 py-3">
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    placeholder="E-mail para teste"
                    value={testEmail[schedule.id] ?? ''}
                    onChange={(e) => setTestEmail((prev) => ({ ...prev, [schedule.id]: e.target.value }))}
                    className="h-8 flex-1 rounded-md border border-empire-border bg-empire-surface px-3 text-xs outline-none focus:border-[var(--empire-primary)]"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(schedule)}
                    disabled={actionLoading[`test-${schedule.id}`]}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {actionLoading[`test-${schedule.id}`] ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    Testar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleExpand(schedule.id)}
                    className="h-8 gap-1 text-xs text-empire-subtle"
                  >
                    Histórico
                    {expandedId === schedule.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Histórico */}
              {expandedId === schedule.id && (
                <div className="border-t border-empire-border px-4 py-3">
                  {logsLoading[schedule.id] ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin text-empire-primary" />
                    </div>
                  ) : (logsBySchedule[schedule.id] ?? []).length === 0 ? (
                    <p className="py-2 text-center text-xs text-empire-subtle">Nenhum envio registrado.</p>
                  ) : (
                    <div className="space-y-2">
                      {(logsBySchedule[schedule.id] ?? []).map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between rounded-lg border border-empire-border bg-empire-surface px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={log.status} />
                              <span className="text-xs text-empire-subtle">
                                {log.week_start
                                  ? new Date(log.week_start).toLocaleDateString('pt-BR')
                                  : 'Teste'}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-empire-void">
                              {log.recipient_emails?.join(', ')}
                            </p>
                            {log.error_message && (
                              <p className="mt-0.5 truncate text-xs text-red-500" title={log.error_message}>
                                {log.error_message}
                              </p>
                            )}
                          </div>
                          <span className="ml-3 text-[10px] text-empire-subtle">
                            {new Date(log.created_at).toLocaleString('pt-BR', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <AutomationForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editingSchedule}
        onSubmit={async (data) => {
          if (editingSchedule) {
            await handleUpdate(editingSchedule.id, data)
          } else {
            await handleCreate(data)
          }
        }}
        onSuggest={suggestWithAI}
        loading={formLoading}
      />
    </div>
  )
}
