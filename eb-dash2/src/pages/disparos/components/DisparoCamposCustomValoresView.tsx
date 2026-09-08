import { useDisparoCamposCustom, useDisparoCamposCustomValores } from '@/hooks/useDisparoCamposCustom'

interface Props {
  disparoId: string
}

function fmtValor(valor: string, tipo: string): string {
  if (!valor) return '—'
  if (tipo === 'moeda') {
    const n = Number(valor)
    return Number.isFinite(n) ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : valor
  }
  if (tipo === 'numero') {
    const n = Number(valor)
    return Number.isFinite(n) ? n.toLocaleString('pt-BR') : valor
  }
  if (tipo === 'data') {
    const d = new Date(`${valor}T00:00:00`)
    return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString('pt-BR')
  }
  return valor
}

export function DisparoCamposCustomValoresView({ disparoId }: Props) {
  const { campos, loading: camposLoading } = useDisparoCamposCustom()
  const { valores, loading: valoresLoading } = useDisparoCamposCustomValores(disparoId)

  if (camposLoading || valoresLoading || campos.length === 0) return null

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4">
      <h3 className="text-sm font-medium text-empire-void mb-3">Campos manuais</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {campos.map((campo) => (
          <div key={campo.id}>
            <div className="text-xs text-empire-muted">{campo.nome_campo}</div>
            <div className="text-sm font-medium text-empire-void">{fmtValor(valores[campo.id] ?? '', campo.tipo)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
