import { useEffect } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

interface AdminRedirectProps {
  to: string
}

export function AdminRedirect({ to }: AdminRedirectProps) {
  const location = useLocation()

  useEffect(() => {
    const from = location.pathname
    if (from.startsWith('/settings')) {
      toast.info('Configurações globais mudaram para Administração.', {
        description: 'Você foi redirecionado para o novo local.',
      })
    } else if (from.startsWith('/admin')) {
      toast.info('O painel admin foi unificado em Administração.', {
        description: 'Você foi redirecionado para o novo local.',
      })
    }
  }, [location.pathname])

  return <Navigate to={to} replace state={{ from: location }} />
}
