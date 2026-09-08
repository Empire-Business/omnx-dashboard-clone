import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

interface TagComboboxProps {
  value: string
  onChange: (v: string) => void
  options: string[]
  loading?: boolean
  placeholder?: string
  required?: boolean
}

/**
 * Campo de tag com busca — mostra as tags já usadas nos contatos do GHL
 * conectado, filtradas pelo que o usuário digita. Continua aceitando
 * digitar uma tag que ainda não existe em nenhum contato (útil pra
 * disparos configurados antes da primeira aplicação da tag no GHL).
 */
export function TagCombobox({ value, onChange, options, loading, placeholder, required }: TagComboboxProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const filtered = value.trim()
    ? options.filter((o) => o.toLowerCase().includes(value.trim().toLowerCase()))
    : options

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          required={required}
          className="pr-8"
          autoComplete="off"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-empire-subtle">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        </span>
      </div>

      {open && !loading && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 max-h-56 w-full min-w-[220px] overflow-y-auto rounded-lg border border-empire-border bg-empire-surface shadow-md">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-empire-subtle">
              {value.trim()
                ? `Nenhuma tag existente com "${value.trim()}" — será usada como digitada.`
                : 'Nenhuma tag encontrada nos contatos.'}
            </p>
          ) : (
            filtered.slice(0, 100).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  onChange(tag)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-empire-hover',
                  tag === value && 'bg-empire-primary/10 text-empire-primary'
                )}
              >
                <TagIcon className="h-3 w-3 shrink-0 text-empire-subtle" />
                <span className="truncate">{tag}</span>
              </button>
            ))
          )}
          {filtered.length > 100 && (
            <p className="border-t border-empire-border px-3 py-1.5 text-[10px] text-empire-subtle">
              Mostrando 100 de {filtered.length} — refine a busca digitando.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
