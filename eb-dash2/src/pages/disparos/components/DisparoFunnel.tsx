import type { DisparoMetrica } from '@/hooks/useDisparos'

interface Props {
  metrica: DisparoMetrica | null
}

const ETAPAS = [
  { key: 'trigger_count', label: 'Enviados', color: 'var(--empire-primary)' },
  { key: 'respondeu_count', label: 'Responderam', color: 'var(--empire-success)' },
  { key: 'converteu_count', label: 'Converteram', color: 'var(--empire-primary-hover)' },
] as const

export function DisparoFunnel({ metrica }: Props) {
  if (!metrica || metrica.trigger_count === 0) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
        <h3 className="text-sm font-medium text-empire-void mb-4">Funil da Campanha</h3>
        <p className="text-sm text-empire-muted">Selecione uma campanha para ver o funil.</p>
      </div>
    )
  }

  const max = metrica.trigger_count

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
      <h3 className="text-sm font-medium text-empire-void mb-1">Funil: {metrica.disparo_nome}</h3>
      <p className="text-xs text-empire-muted mb-4">Enviados → Responderam → Converteram</p>
      <div className="space-y-3">
        {ETAPAS.map((etapa) => {
          const value = metrica[etapa.key] as number
          const width = max > 0 ? (value / max) * 100 : 0
          return (
            <div key={etapa.key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-empire-void">{etapa.label}</span>
                <span className="text-empire-muted">
                  {value.toLocaleString('pt-BR')} ({width.toFixed(1)}%)
                </span>
              </div>
              <div className="h-8 w-full rounded-md bg-empire-elevated overflow-hidden flex items-center">
                <div
                  className="h-full flex items-center justify-end px-2 transition-all duration-500"
                  style={{ width: `${Math.max(width, 4)}%`, backgroundColor: etapa.color }}
                >
                  {width > 15 && <span className="text-[10px] text-white font-medium">{width.toFixed(0)}%</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
