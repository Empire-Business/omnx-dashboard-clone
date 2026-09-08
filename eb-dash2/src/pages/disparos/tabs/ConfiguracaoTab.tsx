import { useState } from 'react'
import { Plus, Pencil, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useDisparos, useDisparoMutations } from '@/hooks/useDisparos'
import { DisparoConfigForm } from '../components/DisparoConfigForm'
import { WhatsappPricingCard } from '../components/WhatsappPricingCard'
import { DisparoCamposCustomManager } from '../components/DisparoCamposCustomManager'
import type { DisparoWithTags, DisparoSignificado, TipoMensagemWhatsapp } from '@/types/disparos'
import { toast } from 'sonner'
import { usePermissions } from '@/contexts/PermissionsContext'

export function ConfiguracaoTab() {
  const { disparos, loading, reload } = useDisparos()
  const { createDisparo, updateDisparo, deleteDisparo } = useDisparoMutations()
  const { hasFeaturePermission } = usePermissions()
  const canAccess = hasFeaturePermission('disparos', 'configuracao')
  const [editing, setEditing] = useState<DisparoWithTags | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (payload: {
    nome: string
    descricao: string
    cor: string
    tipoMensagem: TipoMensagemWhatsapp
    tags: Record<DisparoSignificado, string | undefined>
  }) => {
    setIsSaving(true)
    try {
      if (editing) {
        await updateDisparo(editing.id, payload)
        toast.success('Campanha atualizada')
      } else {
        await createDisparo(payload)
        toast.success('Campanha criada')
      }
      setEditing(null)
      reload()
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar campanha')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editing) return
    if (!confirm(`Tem certeza que deseja excluir a campanha "${editing.nome}"?`)) return
    setIsSaving(true)
    try {
      await deleteDisparo(editing.id)
      toast.success('Campanha excluída')
      setEditing(null)
      reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir campanha')
    } finally {
      setIsSaving(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-empire-muted">
        <ShieldOff className="h-8 w-8 opacity-40" />
        <p className="text-sm">Você não tem permissão para acessar esta área.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <WhatsappPricingCard />
        <DisparoCamposCustomManager />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-empire-void">Campanhas</h3>
          <Button
            size="sm"
            onClick={() => setEditing(null)}
            className="gap-1"
            disabled={!canAccess}
            title={canAccess ? 'Nova campanha' : 'Você não tem permissão para criar campanhas'}
          >
            <Plus className="h-4 w-4" />
            Novo
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-empire-muted">Carregando...</p>
        ) : disparos.length === 0 ? (
          <p className="text-sm text-empire-muted">Nenhuma campanha configurada.</p>
        ) : (
          <div className="space-y-2">
            {disparos.map((d) => (
              <button
                key={d.id}
                onClick={() => canAccess && setEditing(d)}
                disabled={!canAccess}
                className={`w-full flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                  editing?.id === d.id
                    ? 'border-empire-accent bg-empire-elevated'
                    : 'border-empire-border bg-empire-surface hover:bg-empire-elevated/50'
                } ${!canAccess ? 'cursor-not-allowed opacity-60' : ''}`}
                title={canAccess ? 'Editar campanha' : 'Você não tem permissão para editar campanhas'}
              >
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.cor }} />
                  <span className="text-sm text-empire-void">{d.nome}</span>
                </div>
                <Pencil className="h-3.5 w-3.5 text-empire-muted" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
          <DisparoConfigForm
            disparo={editing}
            onSave={handleSave}
            onDelete={editing ? handleDelete : undefined}
            onCancel={() => setEditing(null)}
            loading={isSaving}
          />
        </div>
      </div>
      </div>
    </div>
  )
}
