import type { DisparoMetrica } from '@/hooks/useDisparos'

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  metricas: DisparoMetrica[]
  selectedId: string | null
  onSelect: (id: string | null) => void
}

export function DisparoMetricsTable({ metricas, selectedId, onSelect }: Props) {
  if (metricas.length === 0) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6 text-sm text-empire-muted">
        Nenhuma campanha encontrada. Ajuste os filtros ou crie uma na aba Configuração.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-empire-elevated text-empire-subtle">
          <tr>
            <th className="text-left font-medium px-4 py-3">Campanha</th>
            <th className="text-right font-medium px-4 py-3">Enviados</th>
            <th className="text-right font-medium px-4 py-3">Resp.</th>
            <th className="text-right font-medium px-4 py-3">Parou</th>
            <th className="text-right font-medium px-4 py-3">Erro</th>
            <th className="text-right font-medium px-4 py-3">Converteu</th>
            <th className="text-right font-medium px-4 py-3">Conv.%</th>
            <th className="text-right font-medium px-4 py-3">Custo est.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-empire-border">
          {metricas.map((m) => (
            <tr
              key={m.disparo_id}
              className={`cursor-pointer hover:bg-empire-elevated/50 ${selectedId === m.disparo_id ? 'bg-empire-elevated' : ''}`}
              onClick={() => onSelect(selectedId === m.disparo_id ? null : m.disparo_id)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.cor }} />
                  <span className="font-medium text-empire-void">{m.disparo_nome}</span>
                </div>
              </td>
              <td className="text-right px-4 py-3 text-empire-void">{m.trigger_count.toLocaleString('pt-BR')}</td>
              <td className="text-right px-4 py-3 text-empire-subtle">{m.respondeu_count.toLocaleString('pt-BR')}</td>
              <td className="text-right px-4 py-3 text-empire-subtle">{m.parou_count.toLocaleString('pt-BR')}</td>
              <td className="text-right px-4 py-3 text-empire-subtle">{m.erro_count.toLocaleString('pt-BR')}</td>
              <td className="text-right px-4 py-3 text-empire-subtle">{m.converteu_count.toLocaleString('pt-BR')}</td>
              <td className="text-right px-4 py-3 font-medium text-empire-void">{m.taxa_conversao_pct.toFixed(1)}%</td>
              <td className="text-right px-4 py-3 text-empire-subtle">{fmtBRL(m.custo_estimado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
