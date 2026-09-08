import { MessageCircle, XCircle, AlertTriangle, HelpCircle, CheckCircle2, Users, DollarSign } from 'lucide-react'
import type { DisparoMetrica } from '@/hooks/useDisparos'

interface Props {
  metrica: DisparoMetrica
}

const SIGNIFICADO_META = [
  { key: 'trigger', label: 'Enviados', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { key: 'respondeu', label: 'Responderam', icon: MessageCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  { key: 'parou', label: 'Pararam', icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
  { key: 'erro', label: 'Erros', icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { key: 'nao_respondeu', label: 'Não responderam', icon: HelpCircle, color: 'text-gray-500', bg: 'bg-gray-500/10' },
  { key: 'converteu', label: 'Converteram', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
] as const

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function DisparoMetricCards({ metrica }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
      {SIGNIFICADO_META.map((s) => {
        const value = metrica[`${s.key}_count` as keyof DisparoMetrica] as number
        const total = metrica.trigger_count || 1
        const pct = s.key === 'trigger' ? 100 : Math.round((value / total) * 100)
        const Icon = s.icon
        return (
          <div
            key={s.key}
            className="rounded-xl border border-empire-border bg-empire-surface p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-md ${s.bg}`}>
                <Icon className={`h-4 w-4 ${s.color}`} />
              </div>
              <span className="text-xs text-empire-muted">{s.label}</span>
            </div>
            <div className="text-2xl font-semibold text-empire-void">{value.toLocaleString('pt-BR')}</div>
            <div className="text-xs text-empire-muted mt-1">{pct}% do total</div>
          </div>
        )
      })}

      <div className="rounded-xl border border-empire-border bg-empire-surface p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-md bg-amber-500/10">
            <DollarSign className="h-4 w-4 text-amber-500" />
          </div>
          <span className="text-xs text-empire-muted">Custo estimado</span>
        </div>
        <div className="text-2xl font-semibold text-empire-void">{fmtBRL(metrica.custo_estimado)}</div>
        <div className="text-xs text-empire-muted mt-1">
          {metrica.tipo_mensagem === 'utility' ? 'Utility' : 'Marketing'} · {fmtBRL(metrica.preco_unitario)}/msg
        </div>
      </div>
    </div>
  )
}
