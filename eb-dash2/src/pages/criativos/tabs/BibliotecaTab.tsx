import { useState } from 'react'
import type { NotionCreative } from '@/types/creatives'
import { CreativeProductionPanel } from '../components/CreativeProductionPanel'
import { CreativeFormDialog } from '../components/CreativeFormDialog'
import { usePermissions } from '@/contexts/PermissionsContext'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export function BibliotecaTab() {
  const { hasFeatureEditPermission } = usePermissions()
  const canEdit = hasFeatureEditPermission('criativos', 'biblioteca')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedCreative, setSelectedCreative] = useState<NotionCreative | null>(null)

  const handleCreate = () => {
    setSelectedCreative(null)
    setDialogOpen(true)
  }

  const handleEdit = (creative: NotionCreative) => {
    setSelectedCreative(creative)
    setDialogOpen(true)
  }

  const handleClose = () => {
    setDialogOpen(false)
    setSelectedCreative(null)
  }

  return (
    <>
      <CreativeProductionPanel
        databaseType="paid"
        title="Produção (Pago) — Notion"
        extraHeaderActions={
          canEdit ? (
            <Button variant="gold" onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Criativo
            </Button>
          ) : null
        }
        onEditCreative={canEdit ? handleEdit : undefined}
      />
      <CreativeFormDialog
        open={dialogOpen}
        onClose={handleClose}
        creative={selectedCreative}
      />
    </>
  )
}
