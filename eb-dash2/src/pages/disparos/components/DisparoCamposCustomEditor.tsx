import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useDisparoCamposCustom, useDisparoCamposCustomValores } from '@/hooks/useDisparoCamposCustom'

interface Props {
  disparoId: string
}

function inputTypeFor(tipo: string): string {
  if (tipo === 'numero' || tipo === 'moeda') return 'number'
  if (tipo === 'data') return 'date'
  return 'text'
}

export function DisparoCamposCustomEditor({ disparoId }: Props) {
  const { campos, loading: camposLoading } = useDisparoCamposCustom()
  const { valores, loading: valoresLoading, saveValor } = useDisparoCamposCustomValores(disparoId)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    setDraft(valores)
  }, [valores])

  if (camposLoading || valoresLoading) return null
  if (campos.length === 0) return null

  const handleBlur = async (campoId: string) => {
    const value = draft[campoId] ?? ''
    if (value === (valores[campoId] ?? '')) return
    setSavingId(campoId)
    try {
      await saveValor(campoId, value)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar campo')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-3">
      <Label>Campos manuais desta campanha</Label>
      <p className="text-xs text-empire-muted">
        Métricas que você preenche à mão (não vêm de tag do GHL). Gerencie a lista de campos em "Campos manuais" na aba Configuração.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {campos.map((campo) => (
          <div key={campo.id} className="space-y-1.5">
            <Label htmlFor={`campo-${campo.id}`} className="text-xs font-normal text-empire-muted">
              {campo.nome_campo}
            </Label>
            <div className="relative">
              <Input
                id={`campo-${campo.id}`}
                type={inputTypeFor(campo.tipo)}
                step={campo.tipo === 'moeda' ? '0.01' : undefined}
                value={draft[campo.id] ?? ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, [campo.id]: e.target.value }))}
                onBlur={() => handleBlur(campo.id)}
                className="pr-7"
              />
              {savingId === campo.id && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-empire-subtle" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
