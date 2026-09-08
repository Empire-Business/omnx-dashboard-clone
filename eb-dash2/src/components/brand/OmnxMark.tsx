import { cn } from '@/lib/utils'

// Assets servidos de eb-dash2/public/ (caminho na raiz). Antes eram importados de
// "images/logo omnx /" — pasta com espaço no fim, inválida no Windows e que
// quebrava o build. Recuperados para public/ com nomes válidos.
const logoLight = '/omnx-fundo-claro.png'
const logoDark = '/omnx-fundo-escuro.png'
// Símbolo quadrado (mesma arte do favicon) — para espaços estreitos onde o
// wordmark não cabe, como a sidebar recolhida (64px).
const logoIcone = '/favicon-omnx.png'

interface OmnxMarkProps {
  className?: string
  compact?: boolean
}

/**
 * Símbolo OMNX quadrado — a mesma arte do favicon.
 * Serve onde a marca precisa caber num quadrado: sidebar recolhida, avatares
 * de app, badges. Não depende do tema (o fundo roxo já dá contraste nos dois).
 */
export function OmnxIcon({ className }: { className?: string }) {
  return (
    <img
      src={logoIcone}
      alt="OMNX"
      className={cn('shrink-0 rounded-lg object-contain', className ?? 'h-8 w-8')}
    />
  )
}

/** Logo oficial OMNX, com variação adequada para os temas claro e escuro. */
export function OmnxMark({ className, compact = false }: OmnxMarkProps) {
  const imageClassName = cn(
    'w-auto object-contain',
    compact ? 'h-6' : 'h-9',
    className,
  )

  return (
    <picture className="inline-flex shrink-0">
      <img
        src={logoLight}
        alt="OMNX"
        className={cn(imageClassName, 'dark:hidden')}
      />
      <img
        src={logoDark}
        alt=""
        aria-hidden="true"
        className={cn(imageClassName, 'hidden dark:block')}
      />
    </picture>
  )
}
