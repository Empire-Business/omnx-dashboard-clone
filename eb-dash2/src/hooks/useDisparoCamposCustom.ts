import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { usePermissions } from '@/contexts/PermissionsContext'
import type { CampoCustomTipo, DisparoCampoCustom } from '@/types/disparos'

function assertCanEdit(hasFeaturePermission: (app: string, feature: string) => boolean) {
  if (!hasFeaturePermission('disparos', 'configuracao')) {
    throw new Error('Você não tem permissão para gerenciar campos customizados')
  }
}

export interface UseDisparoCamposCustomResult {
  campos: DisparoCampoCustom[]
  loading: boolean
  error: string | null
  reload: () => void
  createCampo: (nome_campo: string, tipo: CampoCustomTipo) => Promise<void>
  deleteCampo: (id: string) => Promise<void>
}

/**
 * Definições de campos manuais que o usuário quer acompanhar por disparo
 * (ex: "Faturamento confirmado", "Observações", "Meta de conversão") — não
 * vêm de tag do GHL, são preenchidos à mão por disparo em
 * disparo_campos_custom_valores.
 */
export function useDisparoCamposCustom(): UseDisparoCamposCustomResult {
  const [campos, setCampos] = useState<DisparoCampoCustom[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { hasFeaturePermission } = usePermissions()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) {
        setCampos([])
        return
      }

      const { data, error: err } = await supabase
        .from('disparo_campos_custom')
        .select('*')
        .eq('workspace_id', wid)
        .order('sort_order', { ascending: true })

      if (err) throw err
      setCampos((data ?? []) as unknown as DisparoCampoCustom[])
    } catch (err) {
      console.error('[useDisparoCamposCustom]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar campos customizados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createCampo = async (nome_campo: string, tipo: CampoCustomTipo): Promise<void> => {
    assertCanEdit(hasFeaturePermission)
    const wid = await getWorkspaceId()
    if (!wid) throw new Error('Conta não encontrada')

    const { error: err } = await supabase.from('disparo_campos_custom').insert({
      workspace_id: wid,
      nome_campo: nome_campo.trim(),
      tipo,
      sort_order: campos.length,
    })

    if (err) throw err
    await load()
  }

  const deleteCampo = async (id: string): Promise<void> => {
    assertCanEdit(hasFeaturePermission)
    const wid = await getWorkspaceId()
    if (!wid) throw new Error('Conta não encontrada')

    const { error: err } = await supabase.from('disparo_campos_custom').delete().eq('id', id).eq('workspace_id', wid)
    if (err) throw err
    await load()
  }

  return { campos, loading, error, reload: load, createCampo, deleteCampo }
}

export interface UseDisparoCamposCustomValoresResult {
  valores: Record<string, string>
  loading: boolean
  error: string | null
  saveValor: (campoId: string, valor: string) => Promise<void>
}

/**
 * Valores preenchidos manualmente para um disparo específico — um valor
 * por campo customizado (chave = campo_id, valor = texto cru, cast por
 * tipo é feito na exibição conforme DisparoCampoCustom.tipo).
 */
export function useDisparoCamposCustomValores(disparoId: string | null): UseDisparoCamposCustomValoresResult {
  const [valores, setValores] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { hasFeaturePermission } = usePermissions()

  const load = useCallback(async () => {
    if (!disparoId) {
      setValores({})
      return
    }
    setLoading(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) return

      const { data, error: err } = await supabase
        .from('disparo_campos_custom_valores')
        .select('campo_id, valor')
        .eq('workspace_id', wid)
        .eq('disparo_id', disparoId)

      if (err) throw err

      const map: Record<string, string> = {}
      for (const row of (data ?? []) as { campo_id: string; valor: string | null }[]) {
        map[row.campo_id] = row.valor ?? ''
      }
      setValores(map)
    } catch (err) {
      console.error('[useDisparoCamposCustomValores]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar valores')
    } finally {
      setLoading(false)
    }
  }, [disparoId])

  useEffect(() => {
    void load()
  }, [load])

  const saveValor = async (campoId: string, valor: string): Promise<void> => {
    if (!hasFeaturePermission('disparos', 'configuracao')) {
      throw new Error('Você não tem permissão para editar esses campos')
    }
    if (!disparoId) throw new Error('Nenhum disparo selecionado')
    const wid = await getWorkspaceId()
    if (!wid) throw new Error('Conta não encontrada')

    const { error: err } = await supabase.from('disparo_campos_custom_valores').upsert(
      {
        workspace_id: wid,
        disparo_id: disparoId,
        campo_id: campoId,
        valor,
      },
      { onConflict: 'disparo_id,campo_id' }
    )

    if (err) throw err
    setValores((prev) => ({ ...prev, [campoId]: valor }))
  }

  return { valores, loading, error, saveValor }
}
