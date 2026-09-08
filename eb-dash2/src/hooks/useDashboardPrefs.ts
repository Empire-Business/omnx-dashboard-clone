import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { RECUPERACAO_MODE_DEFAULT, type RecuperacaoMode } from '@/lib/constants'

// Preferências de dashboard salvas POR CONTA (tabela user_dashboard_prefs, com RLS).
// A escolha segue o usuário entre navegadores/dispositivos — o localStorage é só
// um cache otimista para a preferência aparecer instantaneamente ao abrir a página.

const LS_PREFIX = 'eb:dashboard_prefs'

export interface DashboardPrefs {
  recuperacao_mode: RecuperacaoMode
}

const DEFAULT_PREFS: DashboardPrefs = { recuperacao_mode: RECUPERACAO_MODE_DEFAULT }

function readCache(wid: string): DashboardPrefs | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}:${wid}`)
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

function writeCache(wid: string, prefs: DashboardPrefs) {
  try {
    localStorage.setItem(`${LS_PREFIX}:${wid}`, JSON.stringify(prefs))
  } catch {
    /* localStorage indisponível — segue só com o banco */
  }
}

export interface UseDashboardPrefs {
  recuperacaoMode: RecuperacaoMode
  setRecuperacaoMode: (mode: RecuperacaoMode) => void
  prefsLoaded: boolean
}

export function useDashboardPrefs(): UseDashboardPrefs {
  const [prefs, setPrefs] = useState<DashboardPrefs>(DEFAULT_PREFS)
  const [loaded, setLoaded] = useState(false)
  const [ctx, setCtx] = useState<{ userId: string; workspaceId: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const workspaceId = await getWorkspaceId()
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id
      if (cancelled) return
      if (!workspaceId || !userId) {
        setLoaded(true)
        return
      }
      setCtx({ userId, workspaceId })

      // 1) cache otimista imediato (evita "piscar" o default)
      const cached = readCache(workspaceId)
      if (cached && !cancelled) setPrefs(cached)

      // 2) fonte da verdade: o banco (segue a conta)
      const { data } = await supabase
        .from('user_dashboard_prefs')
        .select('prefs')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (cancelled) return
      if (data?.prefs) {
        const merged = { ...DEFAULT_PREFS, ...(data.prefs as Partial<DashboardPrefs>) }
        setPrefs(merged)
        writeCache(workspaceId, merged)
      }
      setLoaded(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(
    (patch: Partial<DashboardPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch }
        if (ctx) {
          writeCache(ctx.workspaceId, next)
          void supabase
            .from('user_dashboard_prefs')
            .upsert(
              { user_id: ctx.userId, workspace_id: ctx.workspaceId, prefs: next },
              { onConflict: 'user_id,workspace_id' },
            )
            .then(({ error }) => {
              if (error) console.error('[useDashboardPrefs] persist error', error.message)
            })
        }
        return next
      })
    },
    [ctx],
  )

  const setRecuperacaoMode = useCallback(
    (mode: RecuperacaoMode) => update({ recuperacao_mode: mode }),
    [update],
  )

  return { recuperacaoMode: prefs.recuperacao_mode, setRecuperacaoMode, prefsLoaded: loaded }
}
