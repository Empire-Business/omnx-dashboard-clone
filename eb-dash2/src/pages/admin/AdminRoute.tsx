import { Navigate } from 'react-router-dom'
import { usePermissions } from '@/contexts/PermissionsContext'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { isAdminOrOwner, loading, loadingApps } = usePermissions()

  // Nunca desmontar children durante loading — isso destroya o estado local.
  // As permissões recarregam em background.
  if (loading || loadingApps) return <>{children}</>

  if (!isAdminOrOwner) return <Navigate to="/" replace />

  return <>{children}</>
}
