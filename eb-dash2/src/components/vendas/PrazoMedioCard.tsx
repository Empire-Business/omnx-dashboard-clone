import { Clock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface Props {
  dias: number | null
  vendas: number
  loading?: boolean
}

export function PrazoMedioCard({ dias, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border-[1.5px] border-empire-primary/30 bg-empire-elevated p-5">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-3 h-10 w-24" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border-[1.5px] border-empire-primary/30 bg-empire-elevated p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-empire-primary" />
        <span className="text-sm font-semibold text-empire-void">
          Prazo Médio de Compra
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold text-empire-void">
          {dias !== null ? `${dias} dias` : '—'}
        </span>
      </div>
      <p className="mt-1 text-xs text-empire-muted">
        Média entre geração do lead e pagamento da entrada
      </p>
    </div>
  )
}
