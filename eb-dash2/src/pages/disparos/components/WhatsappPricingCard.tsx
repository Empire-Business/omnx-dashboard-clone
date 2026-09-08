import { useEffect, useState } from 'react'
import { Save, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useWhatsappPricing } from '@/hooks/useWhatsappPricing'

export function WhatsappPricingCard() {
  const { pricing, loading, saving, savePricing } = useWhatsappPricing()
  const [marketing, setMarketing] = useState('0')
  const [utility, setUtility] = useState('0')

  useEffect(() => {
    setMarketing(String(pricing.precoMarketing))
    setUtility(String(pricing.precoUtility))
  }, [pricing])

  const handleSave = async () => {
    try {
      await savePricing({
        precoMarketing: Number(marketing) || 0,
        precoUtility: Number(utility) || 0,
      })
      toast.success('Preços de mensagem atualizados')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar preços')
    }
  }

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-6 space-y-4">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-empire-primary" />
        <h3 className="text-sm font-medium text-empire-void">Custo por mensagem (WhatsApp)</h3>
      </div>
      <p className="text-xs text-empire-muted">
        A Meta cobra por mensagem de template entregue, por categoria (o preço varia por país). Informe aqui quanto você realmente paga por mensagem em cada categoria — usado pra calcular o custo estimado de cada campanha.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="preco_marketing">Marketing (R$/msg)</Label>
          <Input
            id="preco_marketing"
            type="number"
            step="0.0001"
            min="0"
            value={marketing}
            onChange={(e) => setMarketing(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="preco_utility">Utility (R$/msg)</Label>
          <Input
            id="preco_utility"
            type="number"
            step="0.0001"
            min="0"
            value={utility}
            onChange={(e) => setUtility(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      <Button onClick={handleSave} disabled={loading || saving} size="sm" className="gap-2">
        <Save className="h-3.5 w-3.5" />
        {saving ? 'Salvando...' : 'Salvar preços'}
      </Button>
    </div>
  )
}
