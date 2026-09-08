import { useState } from 'react'
import { X, Sparkles, Loader2, Mail, Clock, Calendar, FileText } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  CreateScheduleInput,
  SuggestedConfig,
  WeeklyEmailSchedule,
} from '@/hooks/useWeeklyEmailSchedules'
import { REPORT_MODULE_OPTIONS } from '@/lib/relatorios/moduleOptions'

const MODULES = REPORT_MODULE_OPTIONS

const FREQUENCIES = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
]

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
]

const TEMPLATES = [
  { value: 'default', label: 'Padrão' },
  { value: 'executive', label: 'Executivo' },
  { value: 'detailed', label: 'Detalhado' },
]

interface AutomationFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialData?: WeeklyEmailSchedule | null
  onSubmit: (data: CreateScheduleInput) => Promise<void>
  onSuggest: (description: string) => Promise<SuggestedConfig | { error: string }>
  loading?: boolean
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function AutomationForm({
  open,
  onOpenChange,
  initialData,
  onSubmit,
  onSuggest,
  loading,
}: AutomationFormProps) {
  const [description, setDescription] = useState('')
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [form, setForm] = useState<CreateScheduleInput>({
    name: '',
    description: '',
    modules: ['trafego'],
    report_type: 'cohort',
    frequency: 'weekly',
    day_of_week: 1,
    day_of_month: null,
    time_of_day: '08:00',
    subject: 'Relatório Semanal - OMNX',
    recipient_emails: [],
    reply_to: '',
    template_key: 'default',
    include_comparative: true,
    include_trends: false,
    use_clara_summary: false,
    clara_prompt: '',
    email_format: 'full' as const,
  })
  const [recipientInput, setRecipientInput] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [prevInitKey, setPrevInitKey] = useState<{ initialData: WeeklyEmailSchedule | null | undefined; open: boolean } | null>(null)
  if (prevInitKey === null || prevInitKey.initialData !== initialData || prevInitKey.open !== open) {
    setPrevInitKey({ initialData, open })
    if (initialData) {
      setForm({
        name: initialData.name,
        description: initialData.description ?? '',
        modules: initialData.modules,
        report_type: initialData.report_type,
        frequency: initialData.frequency,
        day_of_week: initialData.day_of_week,
        day_of_month: initialData.day_of_month,
        time_of_day: initialData.time_of_day.slice(0, 5),
        subject: initialData.subject,
        recipient_emails: initialData.recipient_emails,
        reply_to: initialData.reply_to ?? '',
        template_key: initialData.template_key || 'default',
        include_comparative: initialData.include_comparative,
        include_trends: initialData.include_trends,
        use_clara_summary: initialData.use_clara_summary,
        clara_prompt: initialData.clara_prompt ?? '',
        email_format: initialData.email_format ?? 'full',
      })
      setDescription(initialData.description ?? '')
    } else {
      setForm({
        name: '',
        description: '',
        modules: ['trafego'],
        report_type: 'cohort',
        frequency: 'weekly',
        day_of_week: 1,
        day_of_month: null,
        time_of_day: '08:00',
        subject: 'Relatório Semanal - OMNX',
        recipient_emails: [],
        reply_to: '',
        template_key: 'default' as string,
        include_comparative: true,
        include_trends: false,
        use_clara_summary: false,
        clara_prompt: '',
        email_format: 'full' as const,
      })
      setDescription('')
    }
    setErrors({})
    setRecipientInput('')
  }

  const handleSuggest = async () => {
    if (!description.trim()) return
    setSuggestLoading(true)
    const result = await onSuggest(description)
    setSuggestLoading(false)

    if ('error' in result) {
      setErrors({ suggest: result.error })
      return
    }

    setForm((prev) => ({
      ...prev,
      name: result.name ?? prev.name,
      modules: result.modules ?? prev.modules,
      report_type: result.report_type ?? prev.report_type,
      frequency: result.frequency ?? prev.frequency,
      day_of_week: result.day_of_week ?? prev.day_of_week,
      day_of_month: result.day_of_month ?? prev.day_of_month,
      time_of_day: result.time_of_day ?? prev.time_of_day,
      subject: result.subject ?? prev.subject,
      recipient_emails: result.recipient_emails ?? prev.recipient_emails,
      include_comparative: result.include_comparative ?? prev.include_comparative,
      include_trends: result.include_trends ?? prev.include_trends,
      use_clara_summary: result.use_clara_summary ?? prev.use_clara_summary,
      clara_prompt: result.clara_prompt ?? prev.clara_prompt,
      email_format: result.email_format ?? prev.email_format,
    }))
    setErrors({})
  }

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (!form.name.trim()) nextErrors.name = 'Nome obrigatório'
    if (form.modules.length === 0) nextErrors.modules = 'Selecione pelo menos um módulo'
    if (form.recipient_emails.length === 0) nextErrors.recipients = 'Adicione pelo menos um e-mail'
    if (form.frequency === 'monthly' && (form.day_of_month == null || form.day_of_month < 1 || form.day_of_month > 31)) {
      nextErrors.day_of_month = 'Dia do mês inválido'
    }
    if ((form.frequency === 'weekly' || form.frequency === 'biweekly') && form.day_of_week == null) {
      nextErrors.day_of_week = 'Dia da semana obrigatório'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    await onSubmit({
      ...form,
      description,
      reply_to: form.reply_to?.trim() || null,
      clara_prompt: form.clara_prompt?.trim() || null,
      email_format: form.email_format ?? 'full',
    })
    onOpenChange(false)
  }

  const toggleModule = (module: string) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.includes(module)
        ? prev.modules.filter((m) => m !== module)
        : [...prev.modules, module],
    }))
  }

  const addRecipient = () => {
    const emails = recipientInput
      .split(/[,;\n]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    const valid = emails.filter(isValidEmail)
    const invalid = emails.filter((e) => !isValidEmail(e))

    if (invalid.length) {
      setErrors({ recipients: `E-mails inválidos: ${invalid.join(', ')}` })
      return
    }

    setForm((prev) => ({
      ...prev,
      recipient_emails: [...new Set([...prev.recipient_emails, ...valid])],
    }))
    setRecipientInput('')
    setErrors((prev) => ({ ...prev, recipients: '' }))
  }

  const removeRecipient = (email: string) => {
    setForm((prev) => ({
      ...prev,
      recipient_emails: prev.recipient_emails.filter((e) => e !== email),
    }))
  }

  const showDayOfWeek = form.frequency === 'weekly' || form.frequency === 'biweekly'
  const showDayOfMonth = form.frequency === 'monthly'

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader onClose={() => onOpenChange(false)}>
          <DialogTitle className="text-lg font-semibold">
            {initialData ? 'Editar Automação' : 'Nova Automação de E-mail'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-5">
          {/* Descrição livre + IA */}
          <div className="space-y-2 rounded-xl border border-empire-border bg-[var(--empire-canvas)] p-4">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-empire-primary" />
              Descreva o que você quer (opcional)
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Todo domingo às 20h envie para a diretoria um resumo executivo de tráfego e vendas da semana, com análise da Clara."
              rows={3}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-empire-subtle">
                A Clara vai sugerir nome, módulos, frequência e destinatários.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={!description.trim() || suggestLoading}
                className="gap-1.5"
              >
                {suggestLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Sugerir com IA
              </Button>
            </div>
            {errors.suggest && <p className="text-xs text-red-500">{errors.suggest}</p>}
          </div>

          {/* Presets */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-empire-subtle">Presets rápidos</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    name: 'Análise diária completa de tráfego',
                    description: 'Relatório diário de tráfego com análise autônoma da Clara, cruzando campanhas e criativos do Meta Ads com os dados do CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS).',
                    modules: ['trafego'],
                    report_type: 'cohort',
                    frequency: 'daily',
                    day_of_week: null,
                    day_of_month: null,
                    time_of_day: '08:00',
                    subject: 'Análise diária de tráfego · OMNX',
                    include_comparative: true,
                    include_trends: true,
                    use_clara_summary: true,
                    email_format: 'clara_only' as const,
                    clara_prompt:
                      'Analise o tráfego do dia anterior de forma autônoma. Escreva um relatório completo em primeira pessoa, como se você fosse a analista sênior da OMNX. Cruze os dados de campanhas e criativos do Meta Ads com o CRM. Para cada campanha e criativo relevante, calcule e comente: CPMQL, CPAgendamento, CPReunião, CPV, ROAS e ROAS Caixa. Identifique o que está funcionando, o que está desperdiçando dinheiro e dê recomendações concretas de escala, pausa ou teste. Use os números exatos das ferramentas. Não apenas repita os KPIs do dashboard.',
                  }))
                  setDescription('Relatório diário de tráfego com análise autônoma da Clara, cruzando campanhas e criativos do Meta Ads com os dados do CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS).')
                }}
                className="rounded-lg border border-empire-border bg-white px-3 py-1.5 text-xs font-medium text-empire-primary hover:bg-[var(--empire-canvas)]"
              >
                Análise diária de tráfego
              </button>
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome da automação</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Relatório semanal para diretoria"
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>

          {/* Módulos */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-empire-subtle" />
              Módulos incluídos
            </Label>
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => toggleModule(m.value)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    border: `1px solid ${form.modules.includes(m.value) ? 'color-mix(in srgb, var(--empire-warning) 40%, transparent)' : 'var(--empire-border)'}`,
                    background: form.modules.includes(m.value) ? 'color-mix(in srgb, var(--empire-warning) 10%, transparent)' : 'white',
                    color: form.modules.includes(m.value) ? 'var(--empire-primary)' : 'var(--empire-subtle)',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {errors.modules && <p className="text-xs text-red-500">{errors.modules}</p>}
          </div>

          {/* Tipo de relatório */}
          <div className="space-y-2">
            <Label>Tipo de relatório</Label>
            <div className="flex gap-2">
              {(['cohort', 'produtividade'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, report_type: type }))}
                  className="flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                  style={{
                    border: `1px solid ${form.report_type === type ? 'color-mix(in srgb, var(--empire-warning) 40%, transparent)' : 'var(--empire-border)'}`,
                    background: form.report_type === type ? 'color-mix(in srgb, var(--empire-warning) 10%, transparent)' : 'white',
                    color: form.report_type === type ? 'var(--empire-primary)' : 'var(--empire-subtle)',
                  }}
                >
                  {type === 'cohort' ? 'Cohort (data_lead_recebido)' : 'Produtividade (data_pagamento_entrada)'}
                </button>
              ))}
            </div>
          </div>

          {/* Agendamento */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-empire-subtle" />
                Frequência
              </Label>
              <Select
                value={form.frequency}
                onValueChange={(v) => setForm((prev) => ({ ...prev, frequency: v as typeof prev.frequency }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-empire-subtle" />
                Horário
              </Label>
              <Input
                type="time"
                value={form.time_of_day}
                onChange={(e) => setForm((prev) => ({ ...prev, time_of_day: e.target.value }))}
              />
            </div>

            {showDayOfWeek && (
              <div className="space-y-1.5">
                <Label>Dia da semana</Label>
                <Select
                  value={String(form.day_of_week ?? 1)}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, day_of_week: Number(v) }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OF_WEEK.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.day_of_week && <p className="text-xs text-red-500">{errors.day_of_week}</p>}
              </div>
            )}

            {showDayOfMonth && (
              <div className="space-y-1.5">
                <Label>Dia do mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.day_of_month ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, day_of_month: Number(e.target.value) }))}
                />
                {errors.day_of_month && <p className="text-xs text-red-500">{errors.day_of_month}</p>}
              </div>
            )}
          </div>

          {/* Assunto */}
          <div className="space-y-1.5">
            <Label htmlFor="subject">Assunto do e-mail</Label>
            <Input
              id="subject"
              value={form.subject}
              onChange={(e) => setForm((prev) => ({ ...prev, subject: e.target.value }))}
            />
          </div>

          {/* Destinatários */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-empire-subtle" />
              Destinatários
            </Label>
            <div className="flex gap-2">
              <Textarea
                value={recipientInput}
                onChange={(e) => setRecipientInput(e.target.value)}
                placeholder="Digite e-mails separados por vírgula ou enter"
                rows={2}
                className="min-h-[60px]"
              />
              <Button type="button" variant="outline" onClick={addRecipient} className="shrink-0 self-start">
                Adicionar
              </Button>
            </div>
            {errors.recipients && <p className="text-xs text-red-500">{errors.recipients}</p>}
            <div className="flex flex-wrap gap-1.5">
              {form.recipient_emails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 rounded-full border border-empire-border bg-[var(--empire-canvas)] px-2.5 py-1 text-xs"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeRecipient(email)}
                    className="rounded-full p-0.5 hover:bg-black/5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label>Template do e-mail</Label>
            <Select
              value={form.template_key || 'default'}
              onValueChange={(v) => setForm((prev) => ({ ...prev, template_key: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPLATES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="space-y-3 rounded-xl border border-empire-border p-4">
            <p className="text-sm font-medium">Opções do relatório</p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="comparative"
                checked={form.include_comparative}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, include_comparative: !!v }))}
              />
              <Label htmlFor="comparative" className="text-sm font-normal">
                Incluir resumo executivo por módulo
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="trends"
                checked={form.include_trends}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, include_trends: !!v }))}
              />
              <Label htmlFor="trends" className="text-sm font-normal">
                Incluir tendências (últimas 4 semanas)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="clara"
                checked={form.use_clara_summary}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, use_clara_summary: !!v }))}
              />
              <Label htmlFor="clara" className="text-sm font-normal">
                Adicionar resumo escrito pela Clara
              </Label>
            </div>
            {form.use_clara_summary && (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-sm font-normal">Formato do e-mail</Label>
                  <Select
                    value={form.email_format || 'full'}
                    onValueChange={(v) => setForm((prev) => ({ ...prev, email_format: v as 'full' | 'clara_only' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Template visual + análise da Clara</SelectItem>
                      <SelectItem value="clara_only">Apenas análise autônoma da Clara</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={form.clara_prompt ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, clara_prompt: e.target.value }))}
                  placeholder="Instruções extras para a Clara (opcional)"
                  rows={2}
                />
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {initialData ? 'Salvar alterações' : 'Criar automação'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
