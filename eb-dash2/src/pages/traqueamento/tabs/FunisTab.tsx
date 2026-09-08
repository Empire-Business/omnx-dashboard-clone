import { useState, useEffect, useCallback } from 'react'
import { GitBranch, BarChart3, AlertTriangle, Plus, Loader2, Trash2, Pencil, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Funnel = { id: string; nome: string }
type Campaign = { id: string; nome: string; utm_campaign: number | null; funnels: unknown; page_code: string | null }

export function FunisTab({ canEdit = true }: { canEdit?: boolean }) {
  const [funnels, setFunnels] = useState<Funnel[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [newFunnel, setNewFunnel] = useState('')
  const [saving, setSaving] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [pageCodeEdits, setPageCodeEdits] = useState<Record<string, string>>({})
  const [savingPageCode, setSavingPageCode] = useState<Record<string, boolean>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const [{ data: funnelsData }, { data: campaignsData }] = await Promise.all([
      supabase.from('funnels').select('*').eq('workspace_id', workspaceId).order('nome'),
      supabase.from('utm_campaigns').select('id, nome, utm_campaign, funnels, page_code').eq('workspace_id', workspaceId).order('utm_campaign'),
    ])
    setFunnels(funnelsData || [])
    setCampaigns(campaignsData || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAddFunnel = async () => {
    if (!newFunnel.trim()) { toast.error('Digite um nome para o funil'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { error } = await supabase.from('funnels').insert({ workspace_id: workspaceId, nome: newFunnel.trim() } as never)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Funil criado'); setNewFunnel(''); fetchData() }
    setSaving(false)
  }

  const handleDeleteFunnel = async (id: string) => {
    const { error } = await supabase.from('funnels').delete().eq('id', id)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Funil excluído'); fetchData() }
  }

  const handleRenameFunnel = async (id: string, oldName: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldName) { setRenamingId(null); return }
    const newName = renameValue.trim()
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) return
    const { error } = await supabase.from('funnels').update({ nome: newName } as never).eq('id', id)
    if (error) { toast.error(`Erro: ${error.message}`); return }
    // Cascade: update campaigns that referenced old name
    const affected = campaigns.filter(c => Array.isArray(c.funnels) && (c.funnels as string[]).includes(oldName))
    for (const c of affected) {
      const updatedFunnels = (c.funnels as string[]).map(f => f === oldName ? newName : f)
      await supabase.from('utm_campaigns').update({ funnels: updatedFunnels } as never).eq('id', c.id)
    }
    toast.success('Funil renomeado')
    setRenamingId(null)
    fetchData()
  }

  const handleToggleCampaignFunnel = async (campaignId: string, funnelNome: string) => {
    const campaign = campaigns.find(c => c.id === campaignId)
    if (!campaign) return
    const currentFunnels = Array.isArray(campaign.funnels) ? (campaign.funnels as string[]) : []
    const isChecked = currentFunnels.includes(funnelNome)
    const newFunnels = isChecked ? [] : [funnelNome]
    // Optimistic update
    setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, funnels: newFunnels } : c))
    setTogglingId(campaignId)
    const { error } = await supabase.from('utm_campaigns').update({ funnels: newFunnels } as never).eq('id', campaignId)
    if (error) {
      toast.error(`Erro: ${error.message}`)
      // Revert
      setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, funnels: currentFunnels } : c))
    }
    setTogglingId(null)
  }

  const handleSavePageCode = async (campaignId: string) => {
    const newValue = (pageCodeEdits[campaignId] ?? '').trim() || null
    const campaign = campaigns.find(c => c.id === campaignId)
    if (!campaign) return
    if (newValue === (campaign.page_code ?? null)) return
    setSavingPageCode(prev => ({ ...prev, [campaignId]: true }))
    const { error } = await supabase.from('utm_campaigns').update({ page_code: newValue } as never).eq('id', campaignId)
    if (error) {
      toast.error(`Erro: ${error.message}`)
    } else {
      setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, page_code: newValue } : c))
      toast.success('Page code salvo')
    }
    setSavingPageCode(prev => ({ ...prev, [campaignId]: false }))
  }

  const getCampaignFunnelCount = (funnelNome: string) =>
    campaigns.filter(c => Array.isArray(c.funnels) && (c.funnels as string[]).includes(funnelNome)).length

  const unassignedCount = campaigns.filter(c => !Array.isArray(c.funnels) || (c.funnels as string[]).length === 0).length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-empire-void">Funis</h2>
          <p className="text-sm text-empire-muted">Organize campanhas em funis de venda</p>
        </div>
        <Badge variant="gold">V1</Badge>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Card 1: Funis */}
        <Card variant="glowing" className="animate-fade-in-up">
          <CardHeader className="border-b border-empire-border">
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Funis
            </CardTitle>
            <CardDescription>{funnels.length} funis cadastrados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="flex gap-2">
              <Input
                variant="glowing"
                placeholder="Nome do funil..."
                value={newFunnel}
                onChange={e => setNewFunnel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddFunnel()}
                className="flex-1"
              />
              <Button onClick={handleAddFunnel} disabled={saving || !canEdit} variant="premium" size="sm" className="shrink-0">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : funnels.length === 0 ? (
              <EmptyState icon={GitBranch} title="Nenhum funil" description="Adicione seu primeiro funil acima." />
            ) : (
              <ul className="space-y-2">
                {funnels.map(f => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg border border-empire-border bg-empire-surface px-3 py-2">
                    <GitBranch className="h-4 w-4 shrink-0 text-primary/70" />
                    {renamingId === f.id ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input
                          variant="glowing"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameFunnel(f.id, f.nome)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="h-6 flex-1 px-2 text-xs"
                          autoFocus
                        />
                        <button type="button" onClick={() => handleRenameFunnel(f.id, f.nome)} className="text-primary hover:text-primary/80">
                          <Check className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setRenamingId(null)} className="text-empire-subtle hover:text-empire-muted">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium text-empire-void">{f.nome}</span>
                        <span className="text-xs text-empire-subtle">{getCampaignFunnelCount(f.nome)} camp.</span>
                        {canEdit && (
                          <>
                            <button type="button" onClick={() => { setRenamingId(f.id); setRenameValue(f.nome) }} className="rounded p-1 text-empire-subtle hover:text-primary transition-colors">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleDeleteFunnel(f.id)} className="rounded p-1 text-empire-subtle hover:text-destructive transition-colors">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Hierarquia */}
        <Card variant="glowing" className="animate-fade-in-up lg:col-span-2">
          <CardHeader className="border-b border-empire-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Hierarquia de Funis
                </CardTitle>
                <CardDescription>{campaigns.length} campanhas · {funnels.length} funis</CardDescription>
              </div>
              {unassignedCount > 0 && (
                <Badge variant="warning" className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {unassignedCount} sem funil
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[520px]">
              <Table>
                <TableHeader className="border-b border-empire-border">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky top-0 left-0 z-30 bg-empire-elevated min-w-[160px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Campanha</TableHead>
                    <TableHead className="sticky top-0 z-20 bg-empire-elevated min-w-[120px] text-xs">
                      Page Code
                      <span className="ml-1 text-empire-subtle font-normal normal-case tracking-normal" title="Código usado para filtrar investimento Meta Ads (ad_name LIKE '%page_code%')">ⓘ</span>
                    </TableHead>
                    {loading ? (
                      <TableHead className="sticky top-0 z-20 bg-empire-elevated"><Skeleton className="h-4 w-20" /></TableHead>
                    ) : funnels.map(f => (
                      <TableHead key={f.id} className="sticky top-0 z-20 bg-empire-elevated text-center min-w-[100px] text-xs">{f.nome}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i} className="hover:bg-transparent">
                          <TableCell className="sticky left-0 z-20 bg-empire-surface shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"><Skeleton className="h-4 w-full" /></TableCell>
                          <TableCell><Skeleton className="h-6 w-full" /></TableCell>
                          {Array.from({ length: 3 }).map((_, j) => (
                            <TableCell key={j} className="text-center"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </>
                  ) : campaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={funnels.length + 1}>
                        <EmptyState icon={BarChart3} title="Nenhuma campanha" description="Cadastre campanhas em UTM Sources > Campanhas." />
                      </TableCell>
                    </TableRow>
                  ) : (
                    campaigns.map(campaign => {
                      const campaignFunnels = Array.isArray(campaign.funnels) ? (campaign.funnels as string[]) : []
                      return (
                        <TableRow key={campaign.id}>
                          <TableCell className="sticky left-0 z-20 bg-empire-surface font-medium text-sm shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                            {campaign.utm_campaign && (
                              <span className="mr-1.5 text-xs text-empire-subtle">{campaign.utm_campaign}.</span>
                            )}
                            {campaign.nome}
                          </TableCell>
                          <TableCell className="min-w-[120px]">
                            <input
                              type="text"
                              placeholder="ex: eb-mql"
                              className="w-full rounded border border-empire-border bg-empire-elevated px-2 py-1 text-xs focus:outline-none focus:border-empire-primary transition-colors"
                              value={pageCodeEdits[campaign.id] ?? (campaign.page_code ?? '')}
                              onChange={e => setPageCodeEdits(prev => ({ ...prev, [campaign.id]: e.target.value }))}
                              onBlur={() => handleSavePageCode(campaign.id)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                              disabled={savingPageCode[campaign.id] || !canEdit}
                            />
                          </TableCell>
                          {funnels.map(f => (
                            <TableCell key={f.id} className="text-center">
                              <div className="flex justify-center">
                                <Checkbox
                                  checked={campaignFunnels.includes(f.nome)}
                                  onCheckedChange={() => handleToggleCampaignFunnel(campaign.id, f.nome)}
                                  disabled={togglingId === campaign.id || !canEdit}
                                />
                              </div>
                            </TableCell>
                          ))}
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {!loading && campaigns.length > 0 && (
              <div className="flex items-center justify-between border-t border-empire-border px-4 py-2 text-xs text-empire-subtle">
                <span>{campaigns.length} campanhas · {funnels.length} funis</span>
                {unassignedCount > 0 && (
                  <span className="flex items-center gap-1 text-yellow-500/70">
                    <AlertTriangle className="h-3 w-3" />
                    {unassignedCount} campanhas sem funil atribuído
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
