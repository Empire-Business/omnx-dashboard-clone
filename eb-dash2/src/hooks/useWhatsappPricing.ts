import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { usePermissions } from '@/contexts/PermissionsContext'

export interface WhatsappPricing {
  precoMarketing: number
  precoUtility: number
}

export interface UseWhatsappPricingResult {
  pricing: WhatsappPricing
  loading: boolean
  saving: boolean
  error: string | null
  reload: () => void
  savePricing: (next: WhatsappPricing) => Promise<void>
}

/**
 * Preço pago por mensagem entregue no WhatsApp Business Platform, por
 * categoria (marketing/utility) — a Meta cobra por mensagem desde jul/2025,
 * com valor variando por país. Cada workspace configura o que paga de
 * verdade (uma linha por workspace em whatsapp_pricing_config).
 */
export function useWhatsappPricing(): UseWhatsappPricingResult {
  const [pricing, setPricing] = useState<WhatsappPricing>({ precoMarketing: 0, precoUtility: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { hasFeaturePermission } = usePermissions()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) return

      const { data, error: err } = await supabase
        .from('whatsapp_pricing_config')
        .select('preco_marketing, preco_utility')
        .eq('workspace_id', wid)
        .maybeSingle()

      if (err) throw err

      if (data) {
        setPricing({
          precoMarketing: Number(data.preco_marketing) || 0,
          precoUtility: Number(data.preco_utility) || 0,
        })
      }
    } catch (err) {
      console.error('[useWhatsappPricing]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar preços')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const savePricing = async (next: WhatsappPricing): Promise<void> => {
    if (!hasFeaturePermission('disparos', 'configuracao')) {
      throw new Error('Você não tem permissão para alterar essa configuração')
    }
    setSaving(true)
    try {
      const wid = await getWorkspaceId()
      if (!wid) throw new Error('Conta não encontrada')

      const { error: err } = await supabase.from('whatsapp_pricing_config').upsert(
        {
          workspace_id: wid,
          preco_marketing: next.precoMarketing,
          preco_utility: next.precoUtility,
        },
        { onConflict: 'workspace_id' }
      )

      if (err) throw err
      setPricing(next)
    } finally {
      setSaving(false)
    }
  }

  return { pricing, loading, saving, error, reload: load, savePricing }
}
