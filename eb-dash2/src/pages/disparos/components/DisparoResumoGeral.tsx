import { Send, CheckCircle2, DollarSign, Megaphone } from 'lucide-react'

interface Props {
  totalEnviados: number
  totalConverteu: number
  totalCusto: number
  disparosAtivos: number
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function DisparoResumoGeral({ totalEnviados, totalConverteu, totalCusto, disparosAtivos }: Props) {
  const custoPorConversao = totalConverteu > 0 ? totalCusto / totalConverteu : 0

  const cards = [
    { label: 'Campanhas ativas', value: disparosAtivos.toLocaleString('pt-BR'), icon: Megaphone, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { label: 'Total enviado', value: totalEnviados.toLocaleString('pt-BR'), icon: Send, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Total convertido', value: totalConverteu.toLocaleString('pt-BR'), icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    {
      label: 'Custo total estimado',
      value: fmtBRL(totalCusto),
      sub: totalConverteu > 0 ? `${fmtBRL(custoPorConversao)} / conversão` : undefined,
      icon: DollarSign,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => {
        const Icon = c.icon
        return (
          <div key={c.label} className="rounded-xl border border-empire-border bg-empire-surface p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-md ${c.bg}`}>
                <Icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <span className="text-xs text-empire-muted">{c.label}</span>
            </div>
            <div className="text-xl font-semibold text-empire-void">{c.value}</div>
            {c.sub && <div className="text-xs text-empire-muted mt-1">{c.sub}</div>}
          </div>
        )
      })}
    </div>
  )
}
