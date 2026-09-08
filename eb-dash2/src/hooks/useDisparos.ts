import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { usePermissions } from '@/contexts/PermissionsContext'
import { parseTags } from './useTrafego'
import type { Disparo, DisparoTag, DisparoWithTags, DisparoMetrica, DisparoContact, DisparoSignificado, TipoMensagemWhatsapp } from '@/types/disparos'

export type { Disparo, DisparoTag, DisparoWithTags, DisparoMetrica, DisparoContact }

export interface UseDisparosResult {
  disparos: DisparoWithTags[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useDisparos(): UseDisparosResult {
  const [disparos, setDisparos] = useState<DisparoWithTags[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) {
        setDisparos([])
        return
      }

      const { data, error: err } = await supabase
        .from('disparos')
        .select(`*, tags:disparo_tags(*)`)
        .eq('workspace_id', wid)
        .order('created_at', { ascending: false })

      if (err) throw err
      setDisparos((data ?? []) as unknown as DisparoWithTags[])
    } catch (err) {
      console.error('[useDisparos]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar disparos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { disparos, loading, error, reload: load }
}

export interface UseDisparoMetricsOptions {
  /** ISO timestamptz com offset (ex: 2026-07-01T00:00:00-03:00). null = sem limite. */
  from?: string | null
  /** Exclusivo. null = sem limite. */
  to?: string | null
}

export interface UseDisparoMetricsResult {
  metricas: DisparoMetrica[]
  loading: boolean
  error: string | null
  reload: () => void
}

/**
 * Métricas agregadas por campanha (disparo), com filtro opcional de período
 * sobre a data de aplicação da tag de trigger (via rpc_disparo_metricas).
 * A filtragem por workspace acontece na RLS das tabelas base (função é
 * SECURITY INVOKER) — não precisa de filtro explícito aqui.
 */
export function useDisparoMetrics(options: UseDisparoMetricsOptions = {}): UseDisparoMetricsResult {
  const { from = null, to = null } = options
  const [metricas, setMetricas] = useState<DisparoMetrica[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .rpc('rpc_disparo_metricas', { p_from: from, p_to: to })
        .order('disparo_nome', { ascending: true })

      if (err) throw err
      setMetricas((data ?? []) as unknown as DisparoMetrica[])
    } catch (err) {
      console.error('[useDisparoMetrics]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas')
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  return { metricas, loading, error, reload: load }
}

export interface UseDisparoContactsOptions {
  disparoId: string | null
  significado?: DisparoSignificado | null
  limit?: number
}

export interface UseDisparoContactsResult {
  contacts: DisparoContact[]
  loading: boolean
  error: string | null
  reload: () => void
}

export function useDisparoContacts(options: UseDisparoContactsOptions): UseDisparoContactsResult {
  const { disparoId, significado, limit = 200 } = options
  const [contacts, setContacts] = useState<DisparoContact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!disparoId) {
      setContacts([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) {
        setContacts([])
        return
      }

      const { data: tagsData, error: tagsErr } = await supabase
        .from('disparo_tags')
        .select('significado, tag')
        .eq('workspace_id', wid)
        .eq('disparo_id', disparoId)

      if (tagsErr) throw tagsErr
      const tags = (tagsData ?? []) as { significado: DisparoSignificado; tag: string }[]
      const triggerTag = tags.find((t) => t.significado === 'trigger')?.tag
      if (!triggerTag) {
        setContacts([])
        return
      }

      // Busca só um candidato grosseiro por substring no banco (ilike não
      // suporta match exato por token separado por vírgula). O filtro real
      // (trigger obrigatório, significado opcional) é feito abaixo,
      // client-side, com tagMatches() — que já faz o split/trim/lowercase
      // corretos. Antes disso era feito via `.or()` no banco combinado com
      // `.filter()`, que o PostgREST trata como AND: um contato que só tem
      // a tag de trigger (ainda sem resposta/compra/etc.) nunca batia em
      // nenhuma condição do `.or()` e sumia da lista. O `.or()` também
      // interpolava o texto da tag sem escapar vírgulas/parênteses, quebrando
      // a query se a tag configurada continha esses caracteres.
      const { data, error: err } = await supabase
        .from('contatos')
        .select('id, nome, email, telefone, tags, date_created')
        .eq('workspace_id', wid)
        .filter('tags', 'ilike', `%${triggerTag}%`)
        .order('date_created', { ascending: false })
        .limit(limit)

      if (err) throw err

      const rows = (data ?? []) as { id: string; nome: string | null; email: string | null; telefone: string | null; tags: string | null; date_created: string | null }[]

      const triggerMatched = rows.filter((r) => tagMatches(r.tags, triggerTag))

      const withSignificados = triggerMatched.map((r) => ({
        ...r,
        significados: tags
          .filter((t) => tagMatches(r.tags, t.tag))
          .map((t) => t.significado),
      }))

      const mapped: DisparoContact[] = significado
        ? withSignificados.filter((r) => r.significados.includes(significado))
        : withSignificados

      setContacts(mapped)
    } catch (err) {
      console.error('[useDisparoContacts]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar contatos')
    } finally {
      setLoading(false)
    }
  }, [disparoId, significado, limit])

  useEffect(() => {
    void load()
  }, [load])

  return { contacts, loading, error, reload: load }
}

function tagMatches(tagsText: string | null, tagBuscada: string): boolean {
  if (!tagsText) return false
  return tagsText
    .split(',')
    .some((t) => t.trim().toLowerCase() === tagBuscada.trim().toLowerCase())
}

export interface DisparoMutations {
  createDisparo: (payload: { nome: string; descricao?: string; cor?: string; tipoMensagem?: TipoMensagemWhatsapp; tags: Record<DisparoSignificado, string | undefined> }) => Promise<Disparo | null>
  updateDisparo: (id: string, payload: { nome?: string; descricao?: string; cor?: string; is_active?: boolean; tipoMensagem?: TipoMensagemWhatsapp; tags?: Record<DisparoSignificado, string | undefined> }) => Promise<void>
  deleteDisparo: (id: string) => Promise<void>
}

export function useDisparoMutations(): DisparoMutations {
  const { hasFeaturePermission } = usePermissions()

  const assertCanEdit = () => {
    if (!hasFeaturePermission('disparos', 'configuracao')) {
      throw new Error('Você não tem permissão para criar/editar campanhas')
    }
  }

  const createDisparo = async (payload: { nome: string; descricao?: string; cor?: string; tipoMensagem?: TipoMensagemWhatsapp; tags: Record<DisparoSignificado, string | undefined> }): Promise<Disparo | null> => {
    assertCanEdit()
    const wid = await getWorkspaceId()
    if (!wid) throw new Error('Conta não encontrada')

    const { data, error } = await supabase
      .from('disparos')
      .insert({
        workspace_id: wid,
        nome: payload.nome,
        descricao: payload.descricao ?? null,
        cor: payload.cor ?? '#6366f1',
        tipo_mensagem: payload.tipoMensagem ?? 'marketing',
      })
      .select()
      .single()

    if (error) throw error
    const disparo = data as unknown as Disparo

    await upsertTags(wid, disparo.id, payload.tags)
    return disparo
  }

  const updateDisparo = async (id: string, payload: { nome?: string; descricao?: string; cor?: string; is_active?: boolean; tipoMensagem?: TipoMensagemWhatsapp; tags?: Record<DisparoSignificado, string | undefined> }): Promise<void> => {
    assertCanEdit()
    const wid = await getWorkspaceId()
    if (!wid) throw new Error('Conta não encontrada')

    const updateData: Record<string, unknown> = {}
    if (payload.nome !== undefined) updateData.nome = payload.nome
    if (payload.descricao !== undefined) updateData.descricao = payload.descricao
    if (payload.cor !== undefined) updateData.cor = payload.cor
    if (payload.is_active !== undefined) updateData.is_active = payload.is_active
    if (payload.tipoMensagem !== undefined) updateData.tipo_mensagem = payload.tipoMensagem

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabase.from('disparos').update(updateData).eq('id', id).eq('workspace_id', wid)
      if (error) throw error
    }

    if (payload.tags) {
      await upsertTags(wid, id, payload.tags)
    }
  }

  const deleteDisparo = async (id: string): Promise<void> => {
    assertCanEdit()
    const wid = await getWorkspaceId()
    if (!wid) throw new Error('Conta não encontrada')
    const { error } = await supabase.from('disparos').delete().eq('id', id).eq('workspace_id', wid)
    if (error) throw error
  }

  return { createDisparo, updateDisparo, deleteDisparo }
}

async function upsertTags(wid: string, disparoId: string, tags: Record<DisparoSignificado, string | undefined>) {
  const entries = Object.entries(tags)
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([significado, tag]) => ({
      workspace_id: wid,
      disparo_id: disparoId,
      significado: significado as DisparoSignificado,
      tag: tag!.trim(),
    }))

  if (entries.length === 0) return

  const { error } = await supabase.from('disparo_tags').upsert(entries, {
    onConflict: 'workspace_id,disparo_id,significado',
  })

  if (error) throw error
}

export interface UseAllGhlTagsResult {
  tags: string[]
  loading: boolean
  error: string | null
}

/**
 * Todas as tags distintas já aplicadas a algum contato do workspace (ou
 * seja, tags reais do GHL conectado, sincronizadas via webhook/API) — usado
 * pra montar uma lista buscável em vez de exigir digitação exata na
 * configuração de disparos.
 */
export function useAllGhlTags(): UseAllGhlTagsResult {
  const [tags, setTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const wid = await getWorkspaceId()
        if (!wid) {
          setTags([])
          return
        }

        const PAGE_SIZE = 1000
        const unique = new Set<string>()
        let page = 0
        while (true) {
          const { data, error: err } = await supabase
            .from('contatos')
            .select('tags')
            .eq('workspace_id', wid)
            .not('tags', 'is', null)
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

          if (err) throw err
          if (cancelled) return

          for (const row of (data ?? []) as { tags: string | null }[]) {
            for (const tag of parseTags(row.tags)) {
              const trimmed = tag.trim()
              if (trimmed) unique.add(trimmed)
            }
          }

          if ((data?.length ?? 0) < PAGE_SIZE) break
          page++
        }

        if (cancelled) return
        setTags([...unique].sort((a, b) => a.localeCompare(b, 'pt-BR')))
      } catch (err) {
        console.error('[useAllGhlTags]', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar tags')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return { tags, loading, error }
}
