import { useState } from 'react'
import { Bot, Check, Clock3, Loader2, Save, ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useClaraModels, useClaraSettings, useClaraSettingsHistory, useSaveClaraSettings, type ClaraSettings, type ClaraModel } from '@/hooks/useClaraSettings'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'

const EMPTY: Partial<ClaraSettings> = { is_enabled: true, persistent_instructions: '', business_context: '', response_rules: '', allowed_modules: [], allowed_tools: [], analysis_depth: 'standard', max_response_tokens: 2048, scheduled_report_instructions: '', model_id: 'qwen/qwen3.6-plus' }
const listToText = (values?: string[]) => (values ?? []).join(', ')
const textToList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)
const DEFAULT_MODEL_ID = 'qwen/qwen3.6-plus'

function modelDisplayName(id: string): string {
  const parts = id.split('/')
  return parts.length === 2 ? parts[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : id
}

function pricePerMillion(priceStr: string | null): string {
  if (!priceStr) return '—'
  const val = parseFloat(priceStr)
  if (isNaN(val)) return '—'
  return `$${(val * 1_000_000).toFixed(4)}`
}

function findModel(models: ClaraModel[], id: string): ClaraModel | undefined {
  return models.find(m => m.id === id)
}

export function ConfigurarClaraTab() {
  const settingsQuery = useClaraSettings()
  const save = useSaveClaraSettings()
  const [form, setForm] = useState<Partial<ClaraSettings>>(EMPTY)
  const [showModels, setShowModels] = useState(false)
  const [pendingModel, setPendingModel] = useState<ClaraModel | null>(null)
  const models = useClaraModels(showModels)
  const history = useClaraSettingsHistory(true)

  const [prevSettingsData, setPrevSettingsData] = useState<typeof settingsQuery.data | null>(null)
  if (prevSettingsData !== settingsQuery.data) {
    setPrevSettingsData(settingsQuery.data)
    if (settingsQuery.data?.settings) setForm(settingsQuery.data.settings)
  }
  const set = <K extends keyof ClaraSettings>(key: K, value: ClaraSettings[K]) => setForm((previous) => ({ ...previous, [key]: value }))
  const saveForm = async () => {
    try { await save.mutateAsync(form); toast.success('Configurações da Clara salvas') }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar') }
  }

  const currentModelId = form.model_id || DEFAULT_MODEL_ID
  const modelList = models.data?.models ?? []
  const currentModel = findModel(modelList, currentModelId)

  const handleModelClick = (model: ClaraModel) => {
    if (model.id === currentModelId) return
    setPendingModel(model)
  }

  const confirmModelChange = () => {
    if (pendingModel) {
      set('model_id', pendingModel.id)
      setPendingModel(null)
    }
  }

  if (settingsQuery.isLoading) return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-empire-primary" /></div>
  if (settingsQuery.isError) return <p className="text-sm text-empire-danger">Não foi possível carregar as configurações da Clara.</p>

  return <div className="mx-auto max-w-3xl space-y-6">
    <section className="flex items-start justify-between gap-5 rounded-xl border border-empire-border bg-empire-surface p-5">
      <div className="flex gap-3"><Bot className="mt-0.5 h-5 w-5 text-empire-primary" /><div><h2 className="font-semibold text-empire-void">Como a Clara trabalha nesta conta</h2><p className="mt-1 text-sm text-empire-muted">Estas regras valem apenas para esta conta e nunca expõem sua chave de IA.</p></div></div>
      <div className="flex items-center gap-2"><Label htmlFor="clara-enabled" className="text-sm">Ativa</Label><Switch id="clara-enabled" checked={form.is_enabled ?? true} onCheckedChange={(value) => set('is_enabled', value)} /></div>
    </section>
    <section className="space-y-4 rounded-xl border border-empire-border bg-empire-surface p-5">
      <div><Label htmlFor="clara-context">Contexto da empresa</Label><Textarea id="clara-context" className="mt-2 min-h-24" value={form.business_context ?? ''} onChange={(e) => set('business_context', e.target.value)} placeholder="Ex.: vendemos consultoria B2B para clínicas. Priorize margem, recorrência e próximos passos." /></div>
      <div><Label htmlFor="clara-instructions">Instruções permanentes</Label><Textarea id="clara-instructions" className="mt-2 min-h-28" value={form.persistent_instructions ?? ''} onChange={(e) => set('persistent_instructions', e.target.value)} placeholder="Ex.: seja direto, explique números e destaque riscos antes de oportunidades." /></div>
      <div><Label htmlFor="clara-rules">Regras de resposta</Label><Textarea id="clara-rules" className="mt-2 min-h-20" value={form.response_rules ?? ''} onChange={(e) => set('response_rules', e.target.value)} placeholder="Ex.: não faça recomendações sem citar o dado que as sustenta." /></div>
      <div><Label htmlFor="clara-report-instructions">Instruções para relatórios automáticos</Label><Textarea id="clara-report-instructions" className="mt-2 min-h-20" value={form.scheduled_report_instructions ?? ''} onChange={(e) => set('scheduled_report_instructions', e.target.value)} placeholder="Ex.: comece pelo maior risco da semana e termine com três próximos passos." /></div>
    </section>
    <section className="grid gap-4 rounded-xl border border-empire-border bg-empire-surface p-5 sm:grid-cols-2"><div><Label htmlFor="clara-depth">Profundidade da análise</Label><select id="clara-depth" className="mt-2 h-10 w-full rounded-md border border-empire-border bg-empire-surface px-3 text-sm text-empire-void" value={form.analysis_depth ?? 'standard'} onChange={(e) => set('analysis_depth', e.target.value as ClaraSettings['analysis_depth'])}><option value="concise">Objetiva</option><option value="standard">Padrão</option><option value="detailed">Detalhada</option></select></div><div><Label htmlFor="clara-tokens">Tamanho máximo da resposta</Label><Input id="clara-tokens" className="mt-2" type="number" min="256" max="4096" value={form.max_response_tokens ?? 2048} onChange={(e) => set('max_response_tokens', Number(e.target.value))} /></div><div><Label htmlFor="clara-modules">Módulos permitidos</Label><Input id="clara-modules" className="mt-2" value={listToText(form.allowed_modules)} onChange={(e) => set('allowed_modules', textToList(e.target.value))} placeholder="Ex.: vendas, trafego, prevendas" /></div><div className="sm:col-span-2"><Label htmlFor="clara-tools">Ferramentas permitidas</Label><Input id="clara-tools" className="mt-2" value={listToText(form.allowed_tools)} onChange={(e) => set('allowed_tools', textToList(e.target.value))} placeholder="Vazio libera as ferramentas padrão. Para restringir, informe os nomes separados por vírgula." /><p className="mt-1 text-xs text-empire-subtle">Use os identificadores técnicos exibidos na documentação da Clara. Uma lista preenchida restringe o chat apenas a ela.</p></div></section>
    <section className="rounded-xl border border-empire-border bg-empire-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-empire-void">Modelo de IA</h3>
          <p className="mt-1 text-sm text-empire-muted">
            Atual: <span className="font-medium text-empire-primary">{modelDisplayName(currentModelId)}</span>
            <span className="ml-2 text-empire-subtle">({currentModelId})</span>
            {currentModel && (
              <span className="ml-2 text-xs text-empire-subtle">
                entrada {pricePerMillion(currentModel.input_price)}/1M tokens · saída {pricePerMillion(currentModel.output_price)}/1M tokens
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" onClick={() => setShowModels(!showModels)}>
          {showModels ? 'Fechar catálogo' : 'Ver catálogo'}
        </Button>
      </div>
      {showModels && (
        <div className="mt-4 max-h-64 overflow-y-auto rounded-lg border border-empire-border">
          {models.isLoading ? (
            <div className="p-4 text-sm text-empire-muted">Consultando catálogo…</div>
          ) : models.isError ? (
            <div className="p-4 text-sm text-empire-danger">
              Erro ao consultar modelos.{' '}
              <a href="/workspace/integracoes" className="inline-flex items-center gap-1 underline hover:text-empire-primary">
                Cadastre sua chave OpenRouter em Integrações <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            modelList.map((model) => {
              const isSelected = model.id === currentModelId
              const isDefault = model.id === DEFAULT_MODEL_ID
              return (
                <div
                  key={model.id}
                  role="button"
                  tabIndex={0}
                  className={`flex cursor-pointer items-center justify-between gap-3 border-b border-empire-border px-4 py-3 last:border-0 transition-colors hover:bg-empire-hover ${isSelected ? 'bg-primary/5' : ''}`}
                  onClick={() => handleModelClick(model)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleModelClick(model) } }}
                >
                  <div>
                    <p className="text-sm font-medium text-empire-void">{model.name}</p>
                    <p className="text-xs text-empire-subtle">
                      {model.id} · {model.context_length?.toLocaleString('pt-BR') ?? '—'} tokens
                      {isDefault && <span className="ml-1.5 text-gold-400">(padrão)</span>}
                      {model.input_price && <span className="ml-1.5">· in {pricePerMillion(model.input_price)}</span>}
                      {model.output_price && <span> / out {pricePerMillion(model.output_price)}</span>}
                    </p>
                  </div>
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-xs text-empire-success shrink-0">
                      <Check className="h-3.5 w-3.5" />Em uso
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </section>
    <div className="flex justify-end"><Button onClick={saveForm} disabled={save.isPending}>{save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar configurações</Button></div>
    <section className="rounded-xl border border-empire-border bg-empire-surface p-5"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-empire-primary" /><h3 className="font-semibold text-empire-void">Histórico de alterações</h3></div><div className="mt-3 space-y-2">{history.data?.entries?.length ? history.data.entries.map((entry) => <p key={entry.id} className="flex gap-2 text-sm text-empire-muted"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />{new Date(entry.created_at).toLocaleString('pt-BR')}: {entry.changed_fields.join(', ')}</p>) : <p className="text-sm text-empire-subtle">Nenhuma alteração registrada ainda.</p>}</div></section>

    <Dialog open={!!pendingModel} onClose={() => setPendingModel(null)}>
      <DialogContent>
        <DialogHeader onClose={() => setPendingModel(null)}>
          <DialogTitle>Confirmar troca de modelo</DialogTitle>
          <DialogDescription>
            A alteração do modelo de IA afeta diretamente o custo por uso. Compare antes de trocar.
          </DialogDescription>
        </DialogHeader>
        {pendingModel && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-empire-border p-4">
              <div>
                <p className="text-xs font-medium text-empire-muted mb-1">Modelo atual</p>
                <p className="text-sm font-semibold text-empire-void">{modelDisplayName(currentModelId)}</p>
                <p className="text-xs text-empire-subtle">entrada {pricePerMillion(currentModel?.input_price ?? null)}/1M</p>
                <p className="text-xs text-empire-subtle">saída {pricePerMillion(currentModel?.output_price ?? null)}/1M</p>
              </div>
              <div>
                <p className="text-xs font-medium text-empire-muted mb-1">Novo modelo</p>
                <p className="text-sm font-semibold text-empire-primary">{pendingModel.name}</p>
                <p className="text-xs text-empire-subtle">entrada {pricePerMillion(pendingModel.input_price)}/1M</p>
                <p className="text-xs text-empire-subtle">saída {pricePerMillion(pendingModel.output_price)}/1M</p>
              </div>
            </div>
            {pendingModel.id !== DEFAULT_MODEL_ID && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                <p className="text-xs text-yellow-600">
                  {pendingModel.name} pode ter custo diferente do padrão Qwen. A cobrança vai para a chave OpenRouter desta conta. Se notar aumento de custo, você pode voltar ao modelo anterior a qualquer momento.
                </p>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setPendingModel(null)}>Cancelar</Button>
          <Button variant="premium" onClick={confirmModelChange}>Confirmar troca</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
