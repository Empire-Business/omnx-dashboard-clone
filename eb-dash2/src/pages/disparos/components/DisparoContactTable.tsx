import { Loader2 } from 'lucide-react'
import type { DisparoContact } from '@/types/disparos'
import { DISPARO_SIGNIFICADOS } from '@/types/disparos'

interface Props {
  contacts: DisparoContact[]
  loading: boolean
}

export function DisparoContactTable({ contacts, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-8 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-empire-muted" />
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6 text-sm text-empire-muted">
        Nenhum contato encontrado para os critérios selecionados.
      </div>
    )
  }

  const significadoMap = new Map(DISPARO_SIGNIFICADOS.map((s) => [s.value, s]))

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-empire-elevated text-empire-subtle">
          <tr>
            <th className="text-left font-medium px-4 py-3">Nome</th>
            <th className="text-left font-medium px-4 py-3">Telefone</th>
            <th className="text-left font-medium px-4 py-3">Email</th>
            <th className="text-left font-medium px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-empire-border">
          {contacts.map((c) => (
            <tr key={c.id} className="hover:bg-empire-elevated/50">
              <td className="px-4 py-3 text-empire-void">{c.nome ?? 'Sem nome'}</td>
              <td className="px-4 py-3 text-empire-subtle">{c.telefone ?? '—'}</td>
              <td className="px-4 py-3 text-empire-subtle">{c.email ?? '—'}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {c.significados.map((sig) => {
                    const meta = significadoMap.get(sig)
                    return (
                      <span
                        key={sig}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium text-white"
                        style={{ backgroundColor: meta?.cor ?? '#6b7280' }}
                      >
                        {meta?.label ?? sig}
                      </span>
                    )
                  })}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
