import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { fmtDate } from '@/lib/utils/dates'
import { toast } from 'sonner'
import { Trash2, AlertTriangle, Loader2, ShieldOff } from 'lucide-react'
import { usePermissions } from '@/contexts/PermissionsContext'

interface TestLead {
  id: string
  contato_id: string | null
  pipeline_name: string | null
  status: string | null
  data_lead_recebido: string | null
  contatos: {
    nome: string | null
    email: string | null
  } | null
}

// ─── Confirmation Modal ────────────────────────────────────────

function ConfirmDeleteModal({
  open,
  title,
  message,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-empire-void/40 backdrop-blur-sm">
      <div
        className="rounded-2xl p-6 max-w-sm w-full mx-4 bg-empire-surface border border-empire-border"
      >
        <h2 className="text-lg font-semibold text-empire-void mb-2">{title}</h2>
        <p className="text-sm text-empire-subtle mb-6">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors text-empire-void bg-empire-elevated border border-empire-border"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── Main Component ───────────────────────────────────────────

export function LimpezaTab() {
  const { hasFeaturePermission, hasFeatureEditPermission } = usePermissions()
  const canAccessLimpeza = hasFeaturePermission('leads', 'limpeza')
  const canEdit = hasFeatureEditPermission('leads', 'limpeza')
  const [leads, setLeads] = useState<TestLead[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  // Seleção múltipla
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedIdx = useRef<number | null>(null)

  // Modais
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false)
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false)

  // Load test leads
  useEffect(() => {
    async function loadTestLeads() {
      try {
        setLoading(true)

        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[LimpezaTab] No workspace found')
          setLeads([])
          return
        }

        const PAGE_SIZE = 1000
        let contatosComTeste: { id: string }[] = []
        let contatoPage = 0
        while (true) {
          const { data, error: contatoError } = await supabase
            .from('contatos')
            .select('id')
            .or('nome.ilike.%teste%, email.ilike.%teste%')
            .eq('workspace_id', wid)
            .order('id', { ascending: true })
            .range(contatoPage * PAGE_SIZE, (contatoPage + 1) * PAGE_SIZE - 1)
          if (contatoError) throw contatoError
          contatosComTeste = contatosComTeste.concat(data ?? [])
          if ((data?.length ?? 0) < PAGE_SIZE) break
          contatoPage++
        }

        if (contatosComTeste.length === 0) {
          setLeads([])
          return
        }

        const contatoIds = contatosComTeste.map((c) => c.id)

        // .in() com muitos ids de uma vez arrisca limite de URL — busca em
        // lotes de 200 contato_ids por vez.
        const CHUNK_SIZE = 200
        let allOpps: TestLead[] = []
        for (let i = 0; i < contatoIds.length; i += CHUNK_SIZE) {
          const chunk = contatoIds.slice(i, i + CHUNK_SIZE)
          const { data, error } = await supabase
            .from('oportunidades')
            .select(
              `
              id,
              contato_id,
              pipeline_name,
              status,
              data_lead_recebido,
              contatos!inner (
                nome,
                email,
                workspace_id
              )
            `
            )
            .in('contato_id', chunk)
            .eq('workspace_id', wid)

          if (error) throw error
          allOpps = allOpps.concat((data || []) as unknown as TestLead[])
        }

        setLeads(allOpps)
      } catch (err) {
        console.error('Erro ao carregar leads de teste:', err)
        toast.error('Erro ao carregar leads de teste')
      } finally {
        setLoading(false)
      }
    }

    loadTestLeads()
  }, [])

  // ─── Helpers de workspace isolation ───────────────────────────

  async function filterOpportunityIdsInWorkspace(ids: string[]): Promise<string[]> {
    const wid = await getWorkspaceId()
    if (!wid || ids.length === 0) return []
    // .in() com muitos ids de uma vez arrisca limite de URL e o corte
    // silencioso de 1000 linhas do PostgREST — busca em lotes.
    const CHUNK_SIZE = 200
    let allowed: string[] = []
    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE)
      const { data, error } = await supabase
        .from('oportunidades')
        .select('id')
        .in('id', chunk)
        .eq('workspace_id', wid)
      if (error) {
        console.error('[LimpezaTab] Erro ao validar workspace das oportunidades:', error)
        continue
      }
      allowed = allowed.concat((data ?? []).map((r) => r.id))
    }
    return allowed
  }

  // ─── Seleção ──────────────────────────────────────────────────

  function handleRowClick(id: string, idx: number, e: React.MouseEvent) {
    // Shift+clique: seleciona faixa do último clicado até o atual
    if (e.shiftKey) {
      e.preventDefault() // evita seleção de texto do browser
      const anchor = lastClickedIdx.current ?? idx
      const from = Math.min(anchor, idx)
      const to = Math.max(anchor, idx)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (let i = from; i <= to; i++) {
          next.add(leads[i].id)
        }
        return next
      })
      return
    }

    // Ctrl/Cmd+clique: alterna individual sem deselecionar os outros
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
      lastClickedIdx.current = idx
      return
    }

    // Clique simples na linha: alterna apenas este
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClickedIdx.current = idx
  }

  function handleCheckboxChange(id: string, idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClickedIdx.current = idx
  }

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) setSelectedIds(new Set(leads.map((l) => l.id)))
    else setSelectedIds(new Set())
  }

  const allSelected = leads.length > 0 && selectedIds.size === leads.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < leads.length

  // ─── Delete individual ────────────────────────────────────────

  async function confirmDeleteLead() {
    if (!selectedOppId) return
    try {
      setDeleting(true)
      const lead = leads.find((l) => l.id === selectedOppId)
      const contatoId = lead?.contato_id

      const allowedIds = await filterOpportunityIdsInWorkspace([selectedOppId])
      if (allowedIds.length === 0) {
        toast.error('Lead não encontrado na conta atual')
        return
      }

      const { error: oppError } = await supabase.from('oportunidades').delete().in('id', allowedIds)
      if (oppError) throw oppError

      if (contatoId) {
        const wid = await getWorkspaceId()
        const { error: contError } = await supabase
          .from('contatos')
          .delete()
          .eq('id', contatoId)
          .eq('workspace_id', wid)
        if (contError) console.error('Erro ao excluir contato:', contError)
      }

      setLeads((prev) => prev.filter((l) => l.id !== selectedOppId))
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(selectedOppId); return n })
      toast.success('Lead de teste excluído com sucesso')
      setSelectedOppId(null)
    } catch (err) {
      console.error('Erro ao excluir lead:', err)
      toast.error('Erro ao excluir lead')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Delete selecionados ──────────────────────────────────────

  async function confirmDeleteSelected() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      setDeleting(true)
      const allowedIds = await filterOpportunityIdsInWorkspace(ids)
      if (allowedIds.length === 0) {
        toast.error('Nenhum lead selecionado pertence à conta atual')
        setShowDeleteSelectedModal(false)
        return
      }

      const contatoIds = leads
        .filter((l) => allowedIds.includes(l.id) && l.contato_id)
        .map((l) => l.contato_id as string)

      const { error: oppError } = await supabase.from('oportunidades').delete().in('id', allowedIds)
      if (oppError) throw oppError

      if (contatoIds.length > 0) {
        const wid = await getWorkspaceId()
        const { error: contError } = await supabase
          .from('contatos')
          .delete()
          .in('id', contatoIds)
          .eq('workspace_id', wid)
        if (contError) console.error('Erro ao excluir contatos:', contError)
      }

      setLeads((prev) => prev.filter((l) => !allowedIds.includes(l.id)))
      setSelectedIds(new Set())
      lastClickedIdx.current = null
      toast.success(`${allowedIds.length} lead${allowedIds.length > 1 ? 's' : ''} excluído${allowedIds.length > 1 ? 's' : ''} com sucesso`)
      setShowDeleteSelectedModal(false)
    } catch (err) {
      console.error('Erro ao excluir leads:', err)
      toast.error('Erro ao excluir leads selecionados')
    } finally {
      setDeleting(false)
    }
  }

  // ─── Delete todos ─────────────────────────────────────────────

  async function confirmDeleteAllLeads() {
    if (leads.length === 0) return
    try {
      setDeleting(true)
      const ids = leads.map((l) => l.id)
      const allowedIds = await filterOpportunityIdsInWorkspace(ids)
      if (allowedIds.length === 0) {
        toast.error('Nenhum lead pertence à conta atual')
        setShowDeleteAllModal(false)
        return
      }

      const contatoIds = leads
        .filter((l) => allowedIds.includes(l.id) && l.contato_id)
        .map((l) => l.contato_id as string)

      const { error: oppError } = await supabase.from('oportunidades').delete().in('id', allowedIds)
      if (oppError) throw oppError

      if (contatoIds.length > 0) {
        const wid = await getWorkspaceId()
        const { error: contError } = await supabase
          .from('contatos')
          .delete()
          .in('id', contatoIds)
          .eq('workspace_id', wid)
        if (contError) console.error('Erro ao excluir contatos:', contError)
      }

      setLeads([])
      setSelectedIds(new Set())
      lastClickedIdx.current = null
      toast.success(`${allowedIds.length} leads de teste excluídos com sucesso`)
      setShowDeleteAllModal(false)
    } catch (err) {
      console.error('Erro ao excluir leads:', err)
      toast.error('Erro ao excluir leads')
    } finally {
      setDeleting(false)
    }
  }

  if (!canAccessLimpeza) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-empire-muted">
        <ShieldOff className="h-8 w-8 opacity-40" />
        <p className="text-sm">Você não tem permissão para acessar esta área.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Warning */}
      <div
        className="flex items-center gap-3 rounded-xl p-4 text-sm"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>
          Esta aba lista todos os leads com "teste" no nome ou email. As exclusões são permanentes e não podem ser desfeitas.
        </span>
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden bg-empire-surface border border-empire-border"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-empire-border"
        >
          <div className="flex items-center gap-3 text-xs text-empire-subtle">
            <span>
              {leads.length === 0 ? 'Nenhum lead de teste encontrado' : `${leads.length} leads de teste encontrados`}
            </span>
            {selectedIds.size > 0 && (
              <span className="font-medium text-empire-void">
                · {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canEdit && selectedIds.size > 0 && (
              <button
                onClick={() => setShowDeleteSelectedModal(true)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 text-empire-danger"
              >
                <Trash2 className="h-3 w-3" />
                Excluir selecionados ({selectedIds.size})
              </button>
            )}
            {canEdit && leads.length > 0 && (
              <button
                onClick={() => setShowDeleteAllModal(true)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-2 text-empire-danger"
              >
                <Trash2 className="h-3 w-3" />
                Excluir todos ({leads.length})
              </button>
            )}
          </div>
        </div>

        {/* Hint de atalhos */}
        {leads.length > 0 && (
          <div
            className="px-4 py-2 text-[11px] text-empire-subtle bg-empire-elevated border-b border-empire-border"
          >
            Dica: <kbd className="px-1 py-0.5 rounded text-[10px] font-mono bg-empire-border">Ctrl</kbd>+clique para selecionar individualmente ·{' '}
            <kbd className="px-1 py-0.5 rounded text-[10px] font-mono bg-empire-border">Shift</kbd>+clique para selecionar faixa
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
              <tr>
                <th className="px-4 py-3 w-10">
                  {leads.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected }}
                      onChange={handleSelectAll}
                      className="cursor-pointer rounded"
                    />
                  )}
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">
                  Nome
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">
                  Email
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">
                  Pipeline
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">
                  Data Lead
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">
                  Ação
                </th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-empire-subtle">
                    Nenhum lead de teste encontrado.
                  </td>
                </tr>
              ) : (
                leads.map((lead, idx) => {
                  const isSelected = selectedIds.has(lead.id)
                  return (
                    <tr
                      key={lead.id}
                      style={{
                        borderBottom: '1px solid var(--empire-border)',
                        background: isSelected ? 'rgba(239, 68, 68, 0.05)' : undefined,
                        cursor: 'pointer',
                      }}
                      className={cn('transition-colors', !isSelected && 'hover:bg-empire-elevated')}
                      onClick={(e) => handleRowClick(lead.id, idx, e)}
                    >
                      <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleCheckboxChange(lead.id, idx, e)}
                          className="cursor-pointer rounded"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[160px] truncate text-empire-void">
                        {lead.contatos?.nome ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-empire-subtle max-w-[180px] truncate">
                        {lead.contatos?.email ?? '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        {lead.pipeline_name ? (
                          <span className="truncate text-xs text-empire-subtle">{lead.pipeline_name}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {lead.status ? (
                          <span
                            className={cn(
                              'px-2 py-1 rounded text-[11px] font-medium',
                              lead.status === 'won' && 'bg-empire-success/10 text-empire-success',
                              lead.status === 'lost' && 'bg-empire-danger/10 text-empire-danger',
                              !['won', 'lost'].includes(lead.status) && 'bg-[rgba(100,116,139,0.1)] text-empire-subtle'
                            )}
                          >
                            {lead.status}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-empire-subtle whitespace-nowrap">
                        {fmtDate(lead.data_lead_recebido)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {canEdit && (
                          <button
                            onClick={() => setSelectedOppId(lead.id)}
                            disabled={deleting}
                            className="p-1.5 rounded-lg transition-colors text-empire-danger"
                            title="Excluir este lead"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modals */}
      <ConfirmDeleteModal
        open={selectedOppId !== null}
        title="Confirmar exclusão"
        message="Tem certeza? Esta ação não pode ser desfeita."
        isDeleting={deleting}
        onConfirm={confirmDeleteLead}
        onCancel={() => setSelectedOppId(null)}
      />

      <ConfirmDeleteModal
        open={showDeleteSelectedModal}
        title="Confirmar exclusão dos selecionados"
        message={`Você está prestes a excluir ${selectedIds.size} lead${selectedIds.size > 1 ? 's' : ''} selecionado${selectedIds.size > 1 ? 's' : ''}. Esta ação não pode ser desfeita.`}
        isDeleting={deleting}
        onConfirm={confirmDeleteSelected}
        onCancel={() => setShowDeleteSelectedModal(false)}
      />

      <ConfirmDeleteModal
        open={showDeleteAllModal}
        title="Confirmar exclusão em massa"
        message={`Você está prestes a excluir ${leads.length} leads de teste. Esta ação não pode ser desfeita.`}
        isDeleting={deleting}
        onConfirm={confirmDeleteAllLeads}
        onCancel={() => setShowDeleteAllModal(false)}
      />
    </div>
  )
}
