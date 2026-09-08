import { usePermissions } from '@/contexts/PermissionsContext'
import { KanbanBoard } from '../components/KanbanBoard'

export function KanbanTab() {
  const { hasFeatureEditPermission } = usePermissions()
  const canEdit = hasFeatureEditPermission('criativos', 'kanban')

  return <KanbanBoard canEdit={canEdit} />
}
