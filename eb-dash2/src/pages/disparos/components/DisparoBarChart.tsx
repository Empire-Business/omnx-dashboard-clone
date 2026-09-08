import type { DisparoMetrica } from '@/hooks/useDisparos'

interface Props {
  metricas: DisparoMetrica[]
  metric: 'respondeu_count' | 'converteu_count' | 'erro_count' | 'parou_count'
  title: string
  color?: string
}

export function DisparoBarChart({ metricas, metric, title, color = 'var(--empire-info)' }: Props) {
  const data = metricas
    .filter((m) => m.trigger_count > 0)
    .map((m) => ({
      name: m.disparo_nome,
      value: m[metric],
      total: m.trigger_count,
      pct: m.trigger_count > 0 ? (m[metric] / m.trigger_count) * 100 : 0,
      cor: m.cor,
    }))
    .sort((a, b) => b.value - a.value)

  const maxValue = Math.max(...data.map((d) => d.value), 1)

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
        <h3 className="text-sm font-medium text-empire-void mb-4">{title}</h3>
        <p className="text-sm text-empire-muted">Nenhuma campanha com dados.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
      <h3 className="text-sm font-medium text-empire-void mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((d) => (
          <div key={d.name} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-empire-void truncate max-w-[70%]" title={d.name}>{d.name}</span>
              <span className="text-empire-muted">
                {d.value.toLocaleString('pt-BR')} ({d.pct.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-empire-elevated overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(d.value / maxValue) * 100}%`, backgroundColor: d.cor || color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
