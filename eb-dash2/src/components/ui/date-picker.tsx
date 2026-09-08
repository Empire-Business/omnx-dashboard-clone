import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { spToday } from '@/lib/utils/dates'

/**
 * DatePicker do design system.
 *
 * Substitui o `<input type="date">` nativo, que renderiza com a cara do
 * sistema operacional (e ignora tema, tipografia e paleta do dashboard).
 *
 * Contrato igual ao do input nativo para facilitar a troca:
 *   value/onChange trabalham com a string ISO curta `YYYY-MM-DD`
 *   (string vazia = sem data). Nada de objeto Date na borda do componente —
 *   `new Date('2026-08-07')` é interpretado como UTC e volta um dia atrás no
 *   fuso do Brasil, bug clássico que este componente evita por construção.
 */

const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

type Partes = { ano: number; mes: number; dia: number }

function parseISO(v: string | null | undefined): Partes | null {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
  if (!m) return null
  const ano = Number(m[1])
  const mes = Number(m[2]) - 1
  const dia = Number(m[3])
  if (mes < 0 || mes > 11 || dia < 1 || dia > 31) return null
  return { ano, mes, dia }
}

function toISO(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

function formatarBR(v: string | null | undefined): string {
  const p = parseISO(v)
  if (!p) return ''
  return `${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}/${p.ano}`
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes + 1, 0).getDate()
}

/** Dia da semana (0=domingo) do dia 1 do mês, sem passar por UTC. */
function primeiroDiaSemana(ano: number, mes: number): number {
  return new Date(ano, mes, 1).getDay()
}

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  /** Menor data selecionável, em `YYYY-MM-DD`. */
  min?: string
  /** Maior data selecionável, em `YYYY-MM-DD`. */
  max?: string
  placeholder?: string
  disabled?: boolean
  /** Exibe o botão de limpar quando há data escolhida. */
  clearable?: boolean
  /** Classe do gatilho, para casar com a altura dos filtros de cada tela. */
  className?: string
  /** Ocupa toda a largura disponível — para uso como campo de formulário. */
  fullWidth?: boolean
  'aria-label'?: string
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'dd/mm/aaaa',
  disabled = false,
  clearable = false,
  className,
  fullWidth = false,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [aberto, setAberto] = useState(false)
  const [acima, setAcima] = useState(false)
  const [alinhaDireita, setAlinhaDireita] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const painelId = useId()

  const selecionado = parseISO(value)
  const hojeISO = spToday()
  const hoje = parseISO(hojeISO)

  const [cursor, setCursor] = useState(() => {
    const base = selecionado ?? hoje
    return { ano: base?.ano ?? new Date().getFullYear(), mes: base?.mes ?? new Date().getMonth() }
  })

  // Reabrir sempre mostra o mês da data escolhida (ou o mês corrente).
  useEffect(() => {
    if (!aberto) return
    const base = parseISO(value) ?? hoje
    if (base) setCursor({ ano: base.ano, mes: base.mes })
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [aberto])

  // Abre para cima / alinhado à direita quando não couber na viewport.
  useLayoutEffect(() => {
    if (!aberto || !containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    setAcima(window.innerHeight - r.bottom < 360 && r.top > 360)
    setAlinhaDireita(window.innerWidth - r.left < 320)
  }, [aberto])

  // Comparação lexicográfica funciona direto no formato YYYY-MM-DD.
  function foraDosLimites(iso: string): boolean {
    if (min && iso < min) return true
    if (max && iso > max) return true
    return false
  }

  function irMes(delta: number) {
    setCursor((c) => {
      const d = new Date(c.ano, c.mes + delta, 1)
      return { ano: d.getFullYear(), mes: d.getMonth() }
    })
  }

  const celulas = useMemo(() => {
    const total = diasNoMes(cursor.ano, cursor.mes)
    const offset = primeiroDiaSemana(cursor.ano, cursor.mes)
    const out: (number | null)[] = Array.from({ length: offset }, () => null)
    for (let d = 1; d <= total; d++) out.push(d)
    while (out.length % 7 !== 0) out.push(null)
    return out
  }, [cursor])

  const rotulo = formatarBR(value)

  return (
    <div ref={containerRef} className={cn('relative', fullWidth ? 'block w-full' : 'inline-block')}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        aria-label={ariaLabel ?? (rotulo ? `Data: ${rotulo}` : 'Escolher data')}
        className={cn(
          'inline-flex h-8 items-center gap-2 rounded-lg border border-empire-border bg-empire-elevated px-2.5 text-xs text-empire-void transition-colors',
          fullWidth && 'w-full justify-start',
          'hover:border-empire-border-strong focus:border-empire-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/40',
          disabled && 'cursor-not-allowed opacity-50',
          aberto && 'border-empire-primary',
          className
        )}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-empire-subtle" />
        <span className={cn('tabular-nums', !rotulo && 'text-empire-subtle')}>{rotulo || placeholder}</span>
        {clearable && rotulo && !disabled && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar data"
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
              setAberto(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onChange('')
                setAberto(false)
              }
            }}
            className="ml-0.5 rounded p-0.5 text-empire-subtle transition-colors hover:bg-empire-border/70 hover:text-empire-void"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {aberto && (
        <div
          id={painelId}
          role="dialog"
          aria-label="Calendário"
          className={cn(
            'absolute z-50 w-[276px] rounded-2xl border border-empire-border bg-empire-elevated p-3 shadow-2xl shadow-black/20',
            acima ? 'bottom-full mb-2' : 'top-full mt-2',
            alinhaDireita ? 'right-0' : 'left-0'
          )}
        >
          {/* Navegação de mês */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => irMes(-1)}
              aria-label="Mês anterior"
              className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-border/60 hover:text-empire-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-sm font-semibold text-empire-void">
              {MESES[cursor.mes]} <span className="tabular-nums text-empire-muted">{cursor.ano}</span>
            </div>
            <button
              type="button"
              onClick={() => irMes(1)}
              aria-label="Próximo mês"
              className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-border/60 hover:text-empire-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Cabeçalho da semana */}
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {DIAS_SEMANA.map((d, i) => (
              <div
                key={i}
                className="flex h-7 items-center justify-center text-[10px] font-semibold uppercase text-empire-subtle"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Dias */}
          <div className="grid grid-cols-7 gap-0.5">
            {celulas.map((dia, i) => {
              if (dia === null) return <div key={i} className="h-8" />

              const iso = toISO(cursor.ano, cursor.mes, dia)
              const isSelecionado = value === iso
              const isHoje = hojeISO === iso
              const bloqueado = foraDosLimites(iso)

              return (
                <button
                  key={i}
                  type="button"
                  disabled={bloqueado}
                  aria-current={isHoje ? 'date' : undefined}
                  aria-pressed={isSelecionado}
                  onClick={() => {
                    onChange(iso)
                    setAberto(false)
                  }}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-lg text-xs tabular-nums transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/40',
                    isSelecionado
                      ? 'bg-empire-primary font-semibold text-empire-primary-foreground'
                      : 'text-empire-void hover:bg-empire-border/60',
                    isHoje && !isSelecionado && 'ring-1 ring-inset ring-empire-primary/50 font-semibold',
                    bloqueado && 'cursor-not-allowed text-empire-subtle opacity-35 hover:bg-transparent'
                  )}
                >
                  {dia}
                </button>
              )
            })}
          </div>

          {/* Rodapé */}
          <div className="mt-2 flex items-center justify-between border-t border-empire-border pt-2">
            <button
              type="button"
              disabled={foraDosLimites(hojeISO)}
              onClick={() => {
                onChange(hojeISO)
                setAberto(false)
              }}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-empire-primary transition-colors hover:bg-empire-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Hoje
            </button>
            {clearable && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setAberto(false)
                }}
                className="rounded-lg px-2 py-1 text-[11px] font-medium text-empire-subtle transition-colors hover:bg-empire-border/60 hover:text-empire-void"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Exportado para telas que precisam exibir a data fora do seletor. */
export { formatarBR as formatDateBR }
