import { Navigate } from 'react-router-dom'
import { useMyAgencies } from '@/hooks/useAgency'

interface AgencyRouteProps {
  children: React.ReactNode
}

// Fase 5 (Agency UI) — docs/PLANO-MULTI-TENANT-AGENCY.md secao 8.
// Guard: so libera /agency/* para quem tem >=1 linha ativa em agency_members.
// O cliente single-tenant padrao NUNCA ve nem um flash desta area — ver
// docs/SINGLE-TENANT-LOCK.md.
export function AgencyRoute({ children }: AgencyRouteProps) {
  const { data, isLoading } = useMyAgencies()

  // Nunca desmontar children durante loading — mesmo padrao do AdminRoute.
  if (isLoading) return <>{children}</>

  if (!data || data.length === 0) return <Navigate to="/" replace />

  return <>{children}</>
}
