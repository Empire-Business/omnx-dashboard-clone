import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

// Evento module-level para garantir UM dropdown aberto por vez: ao abrir, cada
// instância avisa as outras, que se fecham. Antes disso, clicar no trigger de
// um segundo menu não fechava o primeiro (o clique caía dentro de
// [data-dropdown-root] e o handler de "click fora" ignorava) — resultado: dois
// menus sobrepostos na tela.
const DROPDOWN_OPENED_EVENT = 'omnx:dropdown-opened'

interface DropdownMenuContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLDivElement | null>
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue>({
  open: false,
  setOpen: () => {},
  triggerRef: React.createRef<HTMLDivElement>(),
})

interface DropdownMenuProps {
  children: React.ReactNode
}

function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLDivElement>(null)
  const idRef = React.useRef(Symbol('dropdown'))

  React.useEffect(() => {
    if (!open) return
    const id = idRef.current

    const closeOthers = () => {
      document.dispatchEvent(new CustomEvent(DROPDOWN_OPENED_EVENT, { detail: id }))
    }
    // Despacha depois do mount para que os outros menus já tenham registrado
    // seus listeners (caso tenham aberto no mesmo ciclo de clique).
    const raf = requestAnimationFrame(closeOthers)

    const onOtherOpened = (e: Event) => {
      if ((e as CustomEvent).detail !== id) setOpen(false)
    }
    document.addEventListener(DROPDOWN_OPENED_EVENT, onOtherOpened)

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-dropdown-root]') && !target.closest('[data-dropdown-portal]')) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)

    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onEscape)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener(DROPDOWN_OPENED_EVENT, onOtherOpened)
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, triggerRef }}>
      <div data-dropdown-root ref={triggerRef} className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

interface DropdownMenuTriggerProps {
  asChild?: boolean
  children: React.ReactNode
}

function DropdownMenuTrigger({ asChild, children }: DropdownMenuTriggerProps) {
  const { open, setOpen } = React.useContext(DropdownMenuContext)

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: React.MouseEventHandler; 'data-state'?: string }>, {
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation()
        setOpen(!open)
        const original = (children as React.ReactElement<{ onClick?: React.MouseEventHandler }>).props.onClick
        original?.(e as React.MouseEvent<HTMLButtonElement>)
      },
      'data-state': open ? 'open' : 'closed',
    })
  }

  return (
    <button onClick={() => setOpen(!open)} data-state={open ? 'open' : 'closed'}>
      {children}
    </button>
  )
}

interface Coords {
  top: number
  left: number
  maxHeight: number
}

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: 'top' | 'bottom' | 'left' | 'right'
  align?: 'start' | 'center' | 'end'
  sideOffset?: number
}

function DropdownMenuContent({
  className,
  side = 'bottom',
  align = 'end',
  sideOffset = 6,
  children,
  ...props
}: DropdownMenuContentProps) {
  const { open, triggerRef } = React.useContext(DropdownMenuContext)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [coords, setCoords] = React.useState<Coords | null>(null)

  // Posição calculada em PIXELS (top/left absolutos), nunca via transform CSS:
  // o menu usa animate-scale-in com fill-mode forwards, cujo keyframe final
  // (transform: scale(1)) sobrescreve qualquer transform inline — foi isso que
  // derrubava o translate(-100%) do align="end" e jogava o menu pra fora da
  // tela ~180ms depois de abrir.
  React.useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }

    const update = () => {
      const trigger = triggerRef.current
      const content = contentRef.current
      if (!trigger || !content) return

      const rect = trigger.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth
      const margin = 8
      const contentW = content.offsetWidth
      const contentH = content.offsetHeight

      // Vertical: inverte o lado se não couber e o outro lado tiver mais espaço
      const spaceAbove = rect.top - sideOffset
      const spaceBelow = vh - rect.bottom - sideOffset
      let effectiveSide = side
      if (side === 'bottom' && spaceBelow < contentH && spaceAbove > spaceBelow) effectiveSide = 'top'
      if (side === 'top' && spaceAbove < contentH && spaceBelow > spaceAbove) effectiveSide = 'bottom'

      const top =
        effectiveSide === 'top'
          ? Math.max(margin, rect.top - sideOffset - contentH)
          : rect.bottom + sideOffset

      // Horizontal: ancora conforme align e trava dentro da viewport
      let left: number
      if (align === 'start') left = rect.left
      else if (align === 'end') left = rect.right - contentW
      else left = rect.left + rect.width / 2 - contentW / 2
      left = Math.max(margin, Math.min(left, vw - margin - contentW))

      // Área útil limitada ao espaço disponível; o conteúdo rola.
      const available = (effectiveSide === 'top' ? spaceAbove : spaceBelow) - margin
      const maxHeight = Math.max(0, available)

      setCoords({ top, left, maxHeight })
    }

    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, side, align, sideOffset, triggerRef])

  if (!open) return null

  return createPortal(
    <div
      ref={contentRef}
      data-dropdown-portal
      className={cn(
        'fixed z-50 min-w-[8rem] max-w-[calc(100vw-16px)] overflow-x-hidden overflow-y-auto overscroll-contain p-1 rounded-lg border border-empire-border bg-empire-surface shadow-lg animate-scale-in',
        className
      )}
      style={{
        // Renderiza fora da tela e invisível até a primeira medição — evita o
        // "pulo" de posição e permite medir offsetWidth/Height reais já no
        // primeiro paint.
        top: coords?.top ?? -9999,
        left: coords?.left ?? -9999,
        visibility: coords ? 'visible' : 'hidden',
        maxHeight: coords ? `${coords.maxHeight}px` : undefined,
      }}
      {...props}
    >
      {children}
    </div>,
    document.body
  )
}

function DropdownMenuItem({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <div
      role="menuitem"
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2 px-2 py-1.5 text-sm outline-none rounded-md',
        'text-empire-void transition-colors duration-150',
        'hover:bg-empire-hover focus:bg-empire-hover',
        className
      )}
      onClick={() => setOpen(false)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('-mx-1 my-1 h-px bg-empire-border', className)}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-2 py-1.5 text-sm font-semibold text-empire-void', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
}
