import { useEffect, useState } from 'react'
import { ShieldOff, Save, Info } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useSdrIaConfig, useSdrIaFilterOptions, type SdrIaConfig } from '@/hooks/useSdrIaConfig'
import { emptyFilter, isFilterActive } from '@/types/filters'

export function ConfiguracaoTab() {
  const { hasFeaturePermission } = usePermissions()
  const canAccess = hasFeaturePermission('sdr-ia', 'configuracao')
  const { config, loading, saving, saveConfig } = useSdrIaConfig()
  const { tags, pipelines, utmSources, utmCampaigns, loading: optionsLoading } = useSdrIaFilterOptions()

  const [draft, setDraft] = useState<SdrIaConfig>(config)

  useEffect(() => {
    setDraft(config)
  }, [config])

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-empire-muted">
        <ShieldOff className="h-8 w-8 opacity-40" />
        <p className="text-sm">Você não tem permissão para acessar esta área.</p>
      </div>
    )
  }

  const handleSave = async () => {
    try {
      await saveConfig(draft)
      toast.success('Critérios de auditoria atualizados')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar configuração')
    }
  }

  const handleClearAll = () => {
    setDraft({
      tags: emptyFilter(),
      pipelines: emptyFilter(),
      utmSource: emptyFilter(),
      utmCampaign: emptyFilter(),
    })
  }

  const algumFiltroAtivo =
    isFilterActive(draft.tags) ||
    isFilterActive(draft.pipelines) ||
    isFilterActive(draft.utmSource) ||
    isFilterActive(draft.utmCampaign)

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6 space-y-5">
        <div>
          <h3 className="text-sm font-medium text-empire-void">Refinamento da auditoria</h3>
          <p className="mt-1 text-xs text-empire-muted">
            A Auditoria IA detecta automaticamente leads atendidos pela IA direto das mensagens
            enviadas (autor = automação). Use os filtros abaixo para restringir ou expandir o
            painel. Deixe um critério sem nenhuma seleção pra não aplicar filtro nele.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-empire-info/30 bg-empire-info/5 px-3 py-2 text-xs text-empire-subtle">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-empire-info" />
          <span>
            Clique 1× numa opção pra <strong>incluir</strong> (só ela conta nesse critério), 2× pra{' '}
            <strong>excluir</strong> (nunca conta), 3× pra remover a seleção.
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-empire-void">Tags</label>
            <MultiSelectFilter
              value={draft.tags}
              onChange={(v) => setDraft((d) => ({ ...d, tags: v }))}
              options={tags.map((t) => ({ value: t, label: t }))}
              placeholder={optionsLoading ? 'Carregando tags...' : 'Todas as tags (aberto)'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-empire-void">Pipelines</label>
            <MultiSelectFilter
              value={draft.pipelines}
              onChange={(v) => setDraft((d) => ({ ...d, pipelines: v }))}
              options={pipelines}
              placeholder={optionsLoading ? 'Carregando pipelines...' : 'Todos os pipelines (aberto)'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-empire-void">Origem (UTM Source)</label>
            <MultiSelectFilter
              value={draft.utmSource}
              onChange={(v) => setDraft((d) => ({ ...d, utmSource: v }))}
              options={utmSources.map((s) => ({ value: s, label: s }))}
              placeholder={optionsLoading ? 'Carregando origens...' : 'Todas as origens (aberto)'}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-empire-void">Campanha (UTM Campaign)</label>
            <MultiSelectFilter
              value={draft.utmCampaign}
              onChange={(v) => setDraft((d) => ({ ...d, utmCampaign: v }))}
              options={utmCampaigns.map((c) => ({ value: c, label: c }))}
              placeholder={optionsLoading ? 'Carregando campanhas...' : 'Todas as campanhas (aberto)'}
            />
          </div>
        </div>

        {!algumFiltroAtivo && (
          <p className="text-xs text-empire-warning">
            Nenhum critério selecionado — a auditoria vai considerar 100% dos contatos.
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} disabled={loading || saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Salvando...' : 'Salvar critérios'}
          </Button>
          <Button type="button" variant="ghost" onClick={handleClearAll} disabled={loading || saving}>
            Deixar 100% aberto
          </Button>
        </div>
      </div>
    </div>
  )
}
