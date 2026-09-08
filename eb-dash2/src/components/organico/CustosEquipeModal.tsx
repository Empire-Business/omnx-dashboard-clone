import { useState, useMemo, useRef, useEffect, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import type { OrganicInvestment, InvestmentGridMap } from '@/hooks/useOrganicInvestments'
import type { OrganicInvestmentItem } from '@/hooks/useOrganicInvestmentItems'
import { CATEGORY_LABELS, CATEGORY_COLORS } from '@/hooks/useOrganicInvestmentItems'
import type { InvestmentCategory, InvestmentRecurrence } from '@/hooks/useOrganicInvestmentItems'
import {
  X, Plus, Trash2, Loader2, ChevronLeft, ChevronRight,
  DollarSign, RotateCcw, Pencil, Check,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────

interface OrganicSourceOption { utm_source: string; nome: string }

interface CustosEquipeModalProps {
  open: boolean
  onClose: () => void
  workspaceId: string
  organicSources: OrganicSourceOption[]
  items: OrganicInvestmentItem[]
  gridMap: InvestmentGridMap
  onRefetch: () => void
}

// ─── Month helpers ────────────────────────────────────────────

function getMonthCols(centerYM: string): string[] {
  const [y, m] = centerYM.split('-').map(Number)
  const cols: string[] = []
  for (let i = -3; i <= 2; i++) {
    let nm = m + i
    let ny = y
    while (nm < 1) { nm += 12; ny-- }
    while (nm > 12) { nm -= 12; ny++ }
    cols.push(`${ny}-${String(nm).padStart(2, '0')}`)
  }
  return cols
}

function ymLabel(ym: string): string {
  const [y, m] = ym.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[Number(m) - 1]} ${y}`
}

function ymToPeriod(ym: string): { period_start: string; period_end: string } {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return {
    period_start: `${y}-${String(m).padStart(2, '0')}-01`,
    period_end:   `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  }
}

function todayYM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function fmtCurrency(v: number): string {
  if (v >= 1000) {
    return 'R$' + (v / 1000).toFixed(1).replace('.', ',') + 'k'
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

// ─── AddItemForm ──────────────────────────────────────────────

interface AddItemFormProps {
  workspaceId: string
  organicSources: OrganicSourceOption[]
  existingSortOrder: number
  onSaved: () => void
  onCancel: () => void
}

function AddItemForm({ workspaceId, organicSources, existingSortOrder, onSaved, onCancel }: AddItemFormProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<InvestmentCategory>('other')
  const [utmSource, setUtmSource] = useState('')
  const [recurrence, setRecurrence] = useState<InvestmentRecurrence>('monthly')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome obrigatório.'); return }
    setSaving(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('organic_investment_items').insert({
        workspace_id: workspaceId,
        name: name.trim(),
        category,
        utm_source: utmSource === '' ? null : utmSource,
        recurrence,
        sort_order: existingSortOrder,
      })
      if (err) throw err
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-4 space-y-3" style={{ background: 'var(--empire-elevated)', borderBottom: '1px solid var(--empire-border)' }}>
      <p className="text-xs font-semibold" style={{ color: 'var(--empire-void)' }}>Novo custo</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          autoFocus
          type="text"
          placeholder="Nome (ex: Designer - Ana)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); if (e.key === 'Escape') onCancel() }}
          className="col-span-2 h-8 px-3 text-xs focus:outline-none"
          style={{ background: 'var(--empire-surface)', border: '1.5px solid var(--empire-border)', borderRadius: 'var(--radius-md)', color: 'var(--empire-void)' }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as InvestmentCategory)}
          className="h-8 px-2 text-xs focus:outline-none"
          style={{ background: 'var(--empire-surface)', border: '1.5px solid var(--empire-border)', borderRadius: 'var(--radius-md)', color: 'var(--empire-void)' }}
        >
          {(Object.entries(CATEGORY_LABELS) as [InvestmentCategory, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={recurrence}
          onChange={(e) => setRecurrence(e.target.value as InvestmentRecurrence)}
          className="h-8 px-2 text-xs focus:outline-none"
          style={{ background: 'var(--empire-surface)', border: '1.5px solid var(--empire-border)', borderRadius: 'var(--radius-md)', color: 'var(--empire-void)' }}
        >
          <option value="monthly">Recorrente (mensal)</option>
          <option value="once">Pontual</option>
        </select>
        <select
          value={utmSource}
          onChange={(e) => setUtmSource(e.target.value)}
          className="col-span-2 h-8 px-2 text-xs focus:outline-none"
          style={{ background: 'var(--empire-surface)', border: '1.5px solid var(--empire-border)', borderRadius: 'var(--radius-md)', color: 'var(--empire-void)' }}
        >
          <option value="">Geral (todos os canais)</option>
          {organicSources.map((s) => (
            <option key={s.utm_source} value={s.utm_source}>{s.nome}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs" style={{ color: 'var(--data-danger)' }}>{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1 text-xs rounded" style={{ border: '1px solid var(--empire-border)', color: 'var(--empire-subtle)' }}>Cancelar</button>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1 text-xs rounded"
          style={{ background: 'color-mix(in srgb, var(--empire-warning) 15%, transparent)', border: '1px solid color-mix(in srgb, var(--empire-warning) 40%, transparent)', color: 'var(--empire-primary)', opacity: saving ? 0.6 : 1 }}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Adicionar
        </button>
      </div>
    </div>
  )
}

// ─── Cell ─────────────────────────────────────────────────────

interface CellProps {
  item: OrganicInvestmentItem
  ym: string
  entry: OrganicInvestment | undefined
  workspaceId: string
  isCurrentMonth: boolean
  months: string[]
  onRefetch: () => void
}

function Cell({ item, ym, entry, workspaceId, isCurrentMonth, months, onRefetch }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [rawValue, setRawValue] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const openEdit = () => {
    setRawValue(entry ? String(entry.amount) : '')
    setEditing(true)
  }

  const cancel = () => { setEditing(false); setRawValue('') }

  const save = async (replicateForward = false) => {
    const amount = parseFloat(rawValue.replace(',', '.'))
    setSaving(true)
    try {
      const { period_start, period_end } = ymToPeriod(ym)
      const payload = {
        workspace_id: workspaceId,
        item_id: item.id,
        period_start,
        period_end,
        utm_source: item.utm_source,
        amount: isNaN(amount) || amount <= 0 ? null : amount,
        description: null,
      }

      if (isNaN(amount) || amount <= 0) {
        // Delete if empty/zero
        if (entry?.id) {
          await supabase.from('organic_investments').delete().eq('id', entry.id)
        }
        if (replicateForward) {
          const futureYMs = months.filter((m) => m > ym)
          for (const fym of futureYMs) {
            const { period_start: ps } = ymToPeriod(fym)
            await supabase.from('organic_investments').delete()
              .eq('item_id', item.id).eq('period_start', ps)
          }
        }
      } else {
        if (entry?.id) {
          await supabase.from('organic_investments').update({ amount, updated_at: new Date().toISOString() }).eq('id', entry.id)
        } else {
          await supabase.from('organic_investments').insert({ ...payload, amount })
        }
        if (replicateForward) {
          const futureYMs = months.filter((m) => m > ym)
          for (const fym of futureYMs) {
            const { period_start: ps, period_end: pe } = ymToPeriod(fym)
            const { data: existing } = await supabase.from('organic_investments').select('id').eq('item_id', item.id).eq('period_start', ps).maybeSingle()
            if (existing?.id) {
              await supabase.from('organic_investments').update({ amount, updated_at: new Date().toISOString() }).eq('id', existing.id)
            } else {
              await supabase.from('organic_investments').insert({ workspace_id: workspaceId, item_id: item.id, period_start: ps, period_end: pe, utm_source: item.utm_source, amount, description: null })
            }
          }
        }
      }
      onRefetch()
      setEditing(false)
    } catch (e) {
      console.error('[Cell save]', e)
    } finally {
      setSaving(false)
    }
  }

  const hasValue = !!entry && entry.amount > 0
  const isRecurrent = item.recurrence === 'monthly'

  if (editing) {
    return (
      <td className="relative px-0 py-0" style={{ minWidth: 90 }}>
        <div className="flex flex-col gap-1 p-1.5">
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="number"
              min="0"
              step="any"
              value={rawValue}
              onChange={(e) => setRawValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save(false)
                if (e.key === 'Escape') cancel()
              }}
              className="w-full h-7 px-2 text-xs focus:outline-none text-right"
              style={{ background: 'var(--empire-surface)', border: '1.5px solid color-mix(in srgb, var(--empire-warning) 50%, transparent)', borderRadius: 'var(--radius-sm)', color: 'var(--empire-void)' }}
              placeholder="0"
            />
            {saving
              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" style={{ color: 'var(--empire-subtle)' }} />
              : <button onClick={() => void save(false)} className="shrink-0 rounded p-0.5 hover:bg-empire-border" style={{ color: 'var(--empire-primary)' }}><Check className="h-3.5 w-3.5" /></button>
            }
          </div>
          {isRecurrent && (
            <button
              onClick={() => void save(true)}
              disabled={saving}
              className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-all"
              style={{ background: 'color-mix(in srgb, var(--empire-warning) 10%, transparent)', color: 'var(--empire-primary)', opacity: saving ? 0.5 : 1 }}
            >
              <RotateCcw className="h-2.5 w-2.5" />
              Replicar →
            </button>
          )}
        </div>
      </td>
    )
  }

  return (
    <td
      onClick={openEdit}
      className="px-3 py-2.5 text-right text-xs cursor-pointer group transition-colors"
      style={{
        minWidth: 90,
        background: isCurrentMonth ? 'color-mix(in srgb, var(--empire-warning) 4%, transparent)' : 'transparent',
        borderLeft: '1px solid var(--empire-border)',
        color: hasValue ? 'var(--empire-void)' : 'transparent',
      }}
    >
      <span className="group-hover:text-empire-void transition-colors" style={{ color: hasValue ? 'var(--empire-void)' : 'var(--empire-subtle)' }}>
        {hasValue ? fmtCurrency(entry!.amount) : (
          <span className="opacity-0 group-hover:opacity-100 text-[10px]">+ add</span>
        )}
      </span>
    </td>
  )
}

// ─── Main Component ───────────────────────────────────────────

export function CustosEquipeModal({
  open,
  onClose,
  workspaceId,
  organicSources,
  items,
  gridMap,
  onRefetch,
}: CustosEquipeModalProps) {
  const [centerYM, setCenterYM] = useState(todayYM())
  const [showAddForm, setShowAddForm] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingNameId, setEditingNameId] = useState<string | null>(null)
  const [editingNameValue, setEditingNameValue] = useState('')

  // Todos os hooks ANTES do early return (regra obrigatória do React)
  const months = getMonthCols(centerYM)
  const currentYM = todayYM()

  const grouped = useMemo(() => {
    const map = new Map<InvestmentCategory, OrganicInvestmentItem[]>()
    for (const item of items) {
      const cat = item.category as InvestmentCategory
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(item)
    }
    return map
  }, [items])

  const colTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const ym of months) {
      let sum = 0
      for (const item of items) {
        const entry = gridMap.get(item.id)?.get(ym)
        if (entry) sum += entry.amount
      }
      totals[ym] = sum
    }
    return totals
  }, [items, gridMap, months])

  const rowTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const item of items) {
      let sum = 0
      for (const ym of months) {
        const entry = gridMap.get(item.id)?.get(ym)
        if (entry) sum += entry.amount
      }
      totals[item.id] = sum
    }
    return totals
  }, [items, gridMap, months])

  if (!open) return null

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Excluir este custo e todos os valores cadastrados? Esta ação não pode ser desfeita.')) return
    setDeletingId(id)
    try {
      await supabase.from('organic_investments').delete().eq('item_id', id)
      await supabase.from('organic_investment_items').update({ is_active: false }).eq('id', id)
      onRefetch()
    } catch (e) {
      console.error('[deleteItem]', e)
    } finally {
      setDeletingId(null)
    }
  }

  const handleSaveName = async (id: string) => {
    const name = editingNameValue.trim()
    if (!name) return
    await supabase.from('organic_investment_items').update({ name, updated_at: new Date().toISOString() }).eq('id', id)
    setEditingNameId(null)
    onRefetch()
  }

  const prevMonth = () => {
    const [y, m] = centerYM.split('-').map(Number)
    const nm = m - 1 < 1 ? 12 : m - 1
    const ny = m - 1 < 1 ? y - 1 : y
    setCenterYM(`${ny}-${String(nm).padStart(2, '0')}`)
  }

  const nextMonth = () => {
    const [y, m] = centerYM.split('-').map(Number)
    const nm = m + 1 > 12 ? 1 : m + 1
    const ny = m + 1 > 12 ? y + 1 : y
    setCenterYM(`${ny}-${String(nm).padStart(2, '0')}`)
  }

  const grandTotal = Object.values(colTotals).reduce((s, v) => s + v, 0)

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-empire-void/50 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-5xl max-h-[90vh] flex flex-col animate-fade-in-up pointer-events-auto"
          style={{ background: 'var(--empire-surface)', border: '1px solid var(--empire-border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--empire-shadow-xl)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--empire-border)' }}>
            <div className="flex items-center gap-3">
              <DollarSign className="h-4 w-4" style={{ color: 'var(--empire-primary)' }} />
              <div>
                <h3 className="font-semibold text-foreground">Custos de Equipe Orgânica</h3>
                <p className="text-xs" style={{ color: 'var(--empire-subtle)' }}>Planilha de custos que impactam o ROI dos canais orgânicos</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Month navigator */}
              <div className="flex items-center gap-1 rounded-md px-1" style={{ border: '1px solid var(--empire-border)' }}>
                <button onClick={prevMonth} className="p-1 rounded hover:bg-empire-elevated transition-colors" style={{ color: 'var(--empire-subtle)' }}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="text-xs font-medium px-1 min-w-[80px] text-center" style={{ color: 'var(--empire-void)' }}>
                  {ymLabel(centerYM)}
                </span>
                <button onClick={nextMonth} className="p-1 rounded hover:bg-empire-elevated transition-colors" style={{ color: 'var(--empire-subtle)' }}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                onClick={() => { setShowAddForm(true) }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all"
                style={{ background: 'color-mix(in srgb, var(--empire-warning) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--empire-warning) 35%, transparent)', color: 'var(--empire-primary)' }}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Custo
              </button>
              <button onClick={onClose} className="rounded p-1.5 hover:bg-empire-border transition-colors" style={{ color: 'var(--empire-subtle)' }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Add form ── */}
          {showAddForm && (
            <AddItemForm
              workspaceId={workspaceId}
              organicSources={organicSources}
              existingSortOrder={items.length}
              onSaved={() => { setShowAddForm(false); onRefetch() }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {/* ── Spreadsheet ── */}
          <div className="flex-1 overflow-auto">
            {items.length === 0 && !showAddForm ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <DollarSign className="h-10 w-10" style={{ color: 'var(--empire-subtle)' }} />
                <p className="text-sm text-center" style={{ color: 'var(--empire-subtle)' }}>
                  Nenhum custo cadastrado ainda.<br />
                  Clique em <strong>Adicionar Custo</strong> para começar.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse" style={{ minWidth: 700 }}>
                <thead>
                  <tr style={{ background: 'var(--empire-elevated)', borderBottom: '2px solid var(--empire-border)' }}>
                    <th className="px-4 py-2.5 text-left sticky left-0 z-10 font-mono text-[11px] font-medium tracking-[0.1em] uppercase" style={{ color: 'var(--empire-subtle)', background: 'var(--empire-elevated)', minWidth: 200, boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}>
                      Custo / Canal
                    </th>
                    {months.map((ym) => (
                      <th
                        key={ym}
                        className="px-3 py-2.5 text-right font-mono text-[11px] font-medium tracking-[0.1em] uppercase"
                        style={{
                          color: ym === currentYM ? 'var(--empire-primary)' : 'var(--empire-subtle)',
                          background: ym === currentYM ? 'color-mix(in srgb, var(--empire-warning) 6%, transparent)' : 'var(--empire-elevated)',
                          borderLeft: '1px solid var(--empire-border)',
                          minWidth: 90,
                        }}
                      >
                        {ymLabel(ym)}
                        {ym === currentYM && <span className="ml-1 text-[11px] opacity-60">↑</span>}
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right font-mono text-[11px] font-medium tracking-[0.1em] uppercase" style={{ color: 'var(--empire-subtle)', borderLeft: '1px solid var(--empire-border)', minWidth: 90, background: 'var(--empire-elevated)' }}>
                      Total
                    </th>
                    <th className="px-3 py-2.5 w-12" style={{ background: 'var(--empire-elevated)' }} />
                  </tr>
                </thead>
                <tbody>
                  {Array.from(grouped.entries()).map(([cat, catItems]) => (
                    <Fragment key={cat}>
                      {/* Category header row */}
                      <tr key={`cat-${cat}`} style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <td
                          colSpan={months.length + 3}
                          className="px-4 py-1.5 sticky left-0"
                          style={{ borderBottom: '1px solid var(--empire-border)' }}
                        >
                          <span
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide uppercase"
                            style={{ background: CATEGORY_COLORS[cat].bg, color: CATEGORY_COLORS[cat].text }}
                          >
                            {CATEGORY_LABELS[cat]}
                          </span>
                        </td>
                      </tr>

                      {catItems.map((item) => (
                        <tr key={item.id} className="group/row hover:bg-empire-elevated transition-colors" style={{ borderBottom: '1px solid var(--empire-border)' }}>
                          {/* Row header */}
                          <td
                            className="px-4 py-2 sticky left-0 z-10"
                            style={{ background: 'var(--empire-surface)', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}
                          >
                            {editingNameId === item.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  autoFocus
                                  type="text"
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleSaveName(item.id)
                                    if (e.key === 'Escape') setEditingNameId(null)
                                  }}
                                  onBlur={() => void handleSaveName(item.id)}
                                  className="flex-1 h-7 px-2 text-xs focus:outline-none"
                                  style={{ border: '1.5px solid color-mix(in srgb, var(--empire-warning) 50%, transparent)', borderRadius: 'var(--radius-sm)', color: 'var(--empire-void)' }}
                                />
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div>
                                  <p className="text-xs font-medium leading-tight" style={{ color: 'var(--empire-void)' }}>{item.name}</p>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    {item.utm_source ? (
                                      <span className="text-[10px] px-1.5 py-0 rounded-full" style={{ background: 'color-mix(in srgb, var(--empire-warning) 10%, transparent)', color: 'var(--empire-primary)' }}>
                                        {organicSources.find((s) => s.utm_source === item.utm_source)?.nome ?? item.utm_source}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] px-1.5 py-0 rounded-full" style={{ background: 'var(--empire-elevated)', color: 'var(--empire-subtle)', border: '1px solid var(--empire-border)' }}>
                                        Geral
                                      </span>
                                    )}
                                    {item.recurrence === 'monthly' && (
                                      <span className="text-[10px] px-1.5 py-0 rounded-full" style={{ background: 'var(--empire-info-soft)', color: 'var(--empire-info)' }}>
                                        ↻ mensal
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => { setEditingNameId(item.id); setEditingNameValue(item.name) }}
                                  className="opacity-0 group-hover/row:opacity-100 transition-opacity ml-auto p-1 rounded hover:bg-empire-border"
                                  style={{ color: 'var(--empire-subtle)' }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </td>

                          {/* Month cells */}
                          {months.map((ym) => (
                            <Cell
                              key={ym}
                              item={item}
                              ym={ym}
                              entry={gridMap.get(item.id)?.get(ym)}
                              workspaceId={workspaceId}
                              isCurrentMonth={ym === currentYM}
                              months={months}
                              onRefetch={onRefetch}
                            />
                          ))}

                          {/* Row total */}
                          <td className="px-3 py-2 text-right text-xs font-mono font-semibold" style={{ borderLeft: '1px solid var(--empire-border)', color: rowTotals[item.id] > 0 ? 'var(--empire-void)' : 'var(--empire-subtle)' }}>
                            {rowTotals[item.id] > 0 ? fmtCurrency(rowTotals[item.id]) : '—'}
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-2 text-center" style={{ borderLeft: '1px solid var(--empire-border)' }}>
                            <button
                              onClick={() => void handleDeleteItem(item.id)}
                              disabled={deletingId === item.id}
                              className="opacity-0 group-hover/row:opacity-100 transition-opacity rounded p-1 hover:bg-[var(--data-danger-soft)] hover:text-[var(--data-danger)]"
                              style={{ color: 'var(--empire-subtle)' }}
                            >
                              {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>

                {/* Totals footer */}
                {items.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--empire-elevated)', borderTop: '2px solid var(--empire-border)' }}>
                      <td className="px-4 py-2.5 sticky left-0 text-xs font-mono font-bold uppercase tracking-wide" style={{ color: 'var(--empire-void)', background: 'var(--empire-elevated)', boxShadow: '2px 0 4px rgba(0,0,0,0.04)' }}>
                        Total Mensal
                      </td>
                      {months.map((ym) => (
                        <td key={ym} className="px-3 py-2.5 text-right text-xs font-mono font-bold" style={{ borderLeft: '1px solid var(--empire-border)', color: colTotals[ym] > 0 ? 'var(--empire-void)' : 'var(--empire-subtle)', background: ym === currentYM ? 'color-mix(in srgb, var(--empire-warning) 6%, transparent)' : 'var(--empire-elevated)' }}>
                          {colTotals[ym] > 0 ? fmtCurrency(colTotals[ym]) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2.5 text-right text-xs font-mono font-bold" style={{ borderLeft: '1px solid var(--empire-border)', color: 'var(--empire-primary)', background: 'var(--empire-elevated)' }}>
                        {grandTotal > 0 ? fmtCurrency(grandTotal) : '—'}
                      </td>
                      <td style={{ background: 'var(--empire-elevated)' }} />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>

          {/* ── Hint footer ── */}
          <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
            <p className="text-xs" style={{ color: 'var(--empire-subtle)' }}>
              Clique em qualquer célula para editar · "Replicar →" preenche meses seguintes · Hover na linha para ações
            </p>
            <p className="text-xs font-semibold" style={{ color: 'var(--empire-void)' }}>
              {items.length} custo{items.length !== 1 ? 's' : ''} cadastrado{items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
