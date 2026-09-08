import { useState } from 'react'
import { Plus, Trash2, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDisparoCamposCustom } from '@/hooks/useDisparoCamposCustom'
import type { CampoCustomTipo } from '@/types/disparos'

const TIPO_LABELS: Record<CampoCustomTipo, string> = {
  texto: 'Texto',
  numero: 'Número',
  moeda: 'Moeda (R$)',
  data: 'Data',
}

export function DisparoCamposCustomManager() {
  const { campos, loading, createCampo, deleteCampo } = useDisparoCamposCustom()
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<CampoCustomTipo>('numero')
  const [saving, setSaving] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    setSaving(true)
    try {
      await createCampo(nome, tipo)
      setNome('')
      toast.success('Campo criado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar campo')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, nomeCampo: string) => {
    if (!confirm(`Remover o campo "${nomeCampo}"? Os valores já preenchidos nas campanhas serão perdidos.`)) return
    try {
      await deleteCampo(id)
      toast.success('Campo removido')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover campo')
    }
  }

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-empire-primary" />
        <h3 className="text-sm font-medium text-empire-void">Campos manuais</h3>
      </div>
      <p className="text-xs text-empire-muted">
        Métricas extras que você quer registrar à mão por campanha (ex: "Faturamento confirmado", "Observações") — não vêm de tag do GHL. Preenchidas na tela de edição de cada campanha.
      </p>

      {!loading && campos.length > 0 && (
        <div className="space-y-1.5">
          {campos.map((campo) => (
            <div
              key={campo.id}
              className="flex items-center justify-between rounded-lg border border-empire-border bg-empire-elevated px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="text-empire-void">{campo.nome_campo}</span>
                <span className="text-xs text-empire-subtle">({TIPO_LABELS[campo.tipo]})</span>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(campo.id, campo.nome_campo)}
                className="text-empire-muted hover:text-empire-danger"
                title="Remover campo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleCreate} className="flex items-end gap-2">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="novo_campo_nome" className="text-xs">Nome do campo</Label>
          <Input
            id="novo_campo_nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Faturamento confirmado"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="novo_campo_tipo" className="text-xs">Tipo</Label>
          <select
            id="novo_campo_tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as CampoCustomTipo)}
            className="flex h-9 rounded-md border border-empire-border bg-empire-surface px-2 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
          >
            {(Object.keys(TIPO_LABELS) as CampoCustomTipo[]).map((t) => (
              <option key={t} value={t}>{TIPO_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={saving || !nome.trim()} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </Button>
      </form>
    </div>
  )
}
