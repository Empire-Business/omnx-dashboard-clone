import type { ReactNode } from 'react'
import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fmtDate } from '@/lib/utils/dates'
import { toast } from 'sonner'
import type { NotionCreative } from '@/types/creatives'
import { CREATIVE_STATUSES } from '@/types/creatives'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { DatePicker } from '@/components/ui/date-picker'
import { Loader2, RefreshCw, Pencil, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react'
import { useCriativosList, useUpdateCreativeStatus } from '@/hooks/useCriativos'

/** Classe compartilhada pelos seletores nativos do painel (filtros e status na linha). */
const SELECT_CLASS =
  'rounded-lg border-[1.5px] border-empire-border bg-empire-elevated px-3 py-2 text-sm text-empire-void focus:outline-none focus:border-empire-primary transition-colors disabled:opacity-50'

/** Colunas de data pelas quais a Biblioteca pode ser ordenada (MEL-16). */
type SortField = 'available_date' | 'test_started_at'
type SortDir = 'asc' | 'desc'

/**
 * O "Objetivo" exibido/filtrado é a campanha real do criativo, que vem do campo
 * "Objetivo" do Notion (`objective`). O `cta_objective` é o campo legado do
 * mesmo conceito e continua como fallback para os registros antigos — os dois
 * precisam concordar entre a coluna e o filtro (MEL-18).
 */
function getObjetivo(item: NotionCreative): string | null {
  return item.objective || item.cta_objective || null
}

function CodeBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-empire-border-strong bg-empire-elevated px-2 py-0.5 font-mono text-[var(--text-11)] text-empire-void">
      {children}
    </span>
  )
}

function TableRowsSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

/** Cabeçalho clicável que alterna a ordenação da coluna de data (MEL-16). */
function SortableDateHead({
  label,
  field,
  activeField,
  dir,
  onToggle,
}: {
  label: string
  field: SortField
  activeField: SortField
  dir: SortDir
  onToggle: (field: SortField) => void
}) {
  const ativo = activeField === field
  const Icon = !ativo ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onToggle(field)}
        title={`Ordenar por ${label}`}
        className={[
          'inline-flex items-center gap-1 transition-colors hover:text-empire-void',
          ativo ? 'text-empire-void' : '',
        ].join(' ')}
      >
        {label}
        <Icon className="h-3.5 w-3.5" />
      </button>
    </TableHead>
  )
}

interface CreativeProductionPanelProps {
  databaseType: 'paid' | 'organic'
  title?: string
  extraHeaderActions?: ReactNode
  onEditCreative?: (creative: NotionCreative) => void
}

export function CreativeProductionPanel({
  databaseType,
  title,
  extraHeaderActions,
  onEditCreative: _onEditCreative,
}: CreativeProductionPanelProps) {
  const queryClient = useQueryClient()
  const { data: creatives = [], isLoading: loading } = useCriativosList(databaseType)
  const updateStatus = useUpdateCreativeStatus()
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({})
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterFormat, setFilterFormat] = useState('all')
  const [filterObjetivo, setFilterObjetivo] = useState('all')
  // Padrão "mais recentes primeiro": a reclamação da reunião foi justamente ficar
  // preso na ordem de entrada, do mais antigo para o mais novo (MEL-16).
  const [sortField, setSortField] = useState<SortField>('available_date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Cada filtro é populado com os valores que realmente aparecem nos dados,
  // no mesmo padrão que o filtro de status já usava.
  const statuses = useMemo(
    () => [...new Set(creatives.map((d) => d.status).filter(Boolean))] as string[],
    [creatives]
  )

  const formatos = useMemo(
    () => ([...new Set(creatives.map((d) => d.format).filter(Boolean))] as string[]).sort(),
    [creatives]
  )

  const objetivos = useMemo(
    () => ([...new Set(creatives.map(getObjetivo).filter(Boolean))] as string[]).sort(),
    [creatives]
  )

  const filtered = useMemo(() => {
    const termo = search.toLowerCase()
    const lista = creatives.filter((item) => {
      const matchSearch =
        !search ||
        (item.name?.toLowerCase().includes(termo) ?? false) ||
        (item.external_id?.toLowerCase().includes(termo) ?? false)
      const matchStatus = filterStatus === 'all' || item.status === filterStatus
      const matchFormat = filterFormat === 'all' || item.format === filterFormat
      const matchObjetivo = filterObjetivo === 'all' || getObjetivo(item) === filterObjetivo
      return matchSearch && matchStatus && matchFormat && matchObjetivo
    })

    // Datas vazias vão sempre para o fim, independente da direção — senão a
    // inversão da ordem enche a primeira tela de traços.
    return [...lista].sort((a, b) => {
      const va = a[sortField] ?? ''
      const vb = b[sortField] ?? ''
      if (!va && !vb) return 0
      if (!va) return 1
      if (!vb) return -1
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  }, [creatives, search, filterStatus, filterFormat, filterObjetivo, sortField, sortDir])

  const toggleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const handleUpdateCreative = async (id: string, patch: Partial<NotionCreative>) => {
    setSavingIds((current) => ({ ...current, [id]: true }))

    const { error } = await supabase.from('notion_creatives').update(patch as never).eq('id', id)

    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`)
    } else {
      toast.success('Criativo atualizado')
      await queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
    }

    setSavingIds((current) => ({ ...current, [id]: false }))
  }

  // MEL-20, reunião de 2026-08-28: até aqui o status só mudava arrastando o card
  // no Kanban. A mutação reusa o mesmo indicador de "salvando" das outras células.
  const handleStatusChange = async (id: string, status: string) => {
    setSavingIds((current) => ({ ...current, [id]: true }))
    try {
      await updateStatus.mutateAsync({ id, status })
    } catch {
      // O toast de erro já é emitido pelo próprio hook.
    } finally {
      setSavingIds((current) => ({ ...current, [id]: false }))
    }
  }

  const handleAprovacao = (id: string, valor: boolean | null) => {
    const item = creatives.find((d) => d.id === id)
    if (!item) return
    const novoValor = item.aprovado === valor ? null : valor
    void handleUpdateCreative(id, {
      aprovado: novoValor,
      data_avaliacao: novoValor !== null ? new Date().toISOString() : null,
    })
  }

  const displayTitle = title ?? `Produção (${databaseType === 'paid' ? 'Pago' : 'Orgânico'}) — Notion`

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              {displayTitle}
            </CardTitle>
            {/*
              Não existe mais botão "Sincronizar" (decisão do dono, 2026-09-01). Ele
              chamava uma RPC de disparo manual que não foi adotada — ela concedia a
              `authenticated` o poder de acionar a edge function com a service_role_key,
              e o ganho não justificava o caminho de elevação de privilégio.

              A entrada de criativos do Notion é 100% pelo cron (migration
              20261024000000), então a tela diz isso em vez de oferecer um controle
              que não existe.
            */}
            <CardDescription>
              {creatives.length} registros · sincroniza com o Notion automaticamente às
              9h, 13h e 19h.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {extraHeaderActions}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        {/*
          São três filtros + busca: cada um recebe rótulo próprio e a linha quebra
          em telas menores, para o cabeçalho não virar uma parede de seletores.
        */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[220px] flex-1 flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-empire-subtle">
              Buscar
            </label>
            <Input
              variant="default"
              placeholder="Buscar por nome, ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-empire-subtle">
              Status
            </label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">Todos</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-empire-subtle">
              Formato
            </label>
            <select
              value={filterFormat}
              onChange={(e) => setFilterFormat(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">Todos</option>
              {formatos.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium uppercase tracking-wide text-empire-subtle">
              Objetivo / campanha
            </label>
            <select
              value={filterObjetivo}
              onChange={(e) => setFilterObjetivo(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="all">Todos</option>
              {objetivos.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
        {/*
          BUG-04, reunião de 2026-08-28: a tabela tem mais colunas do que cabe na
          tela. O `Table` já traz um wrapper com `overflow-x-auto`, mas a tabela
          era `w-full` e as colunas só espremiam — nunca sobrava largura para a
          barra aparecer. O `min-w` força o transbordo e a rolagem acontece dentro
          do container (o body da página nunca rola na horizontal).
        */}
        <div className="rounded-xl border border-empire-border bg-empire-surface">
          <Table className="min-w-[1320px]">
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Formato</TableHead>
                <TableHead>Objetivo</TableHead>
                <SortableDateHead
                  label="Disponível"
                  field="available_date"
                  activeField={sortField}
                  dir={sortDir}
                  onToggle={toggleSort}
                />
                <TableHead>Testado</TableHead>
                <SortableDateHead
                  label="Início do Teste"
                  field="test_started_at"
                  activeField={sortField}
                  dir={sortDir}
                  onToggle={toggleSort}
                />
                {/*
                  MEL-15, reunião de 2026-08-28: chamava-se "Aprovação" e todo mundo
                  lia como "o criativo foi validado / deu certo". O que a coluna diz
                  de fato é que o tráfego pegou o criativo e subiu no anúncio.
                */}
                <TableHead title="O tráfego subiu este criativo no anúncio?">Publicado</TableHead>
                <TableHead>Links</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRowsSkeleton cols={11} />
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11}>
                    <EmptyState
                      icon={RefreshCw}
                      title="Nenhum criativo encontrado"
                      description="Cadastre um novo criativo. Os que vêm do Notion entram sozinhos nas sincronizações das 9h, 13h e 19h."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.external_id ? <CodeBadge>{item.external_id}</CodeBadge> : <span className="text-empire-subtle">—</span>}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-medium text-empire-void">
                      {item.name || '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <select
                          value={item.status ?? ''}
                          disabled={!!savingIds[item.id]}
                          onChange={(e) => void handleStatusChange(item.id, e.target.value)}
                          aria-label="Status do criativo"
                          className={`${SELECT_CLASS} min-w-[130px] py-1 text-xs`}
                        >
                          <option value="" disabled>
                            Sem status
                          </option>
                          {/*
                            Status vindo do Notion pode não estar no catálogo da
                            plataforma; ele entra como opção extra para a edição
                            não apagar silenciosamente o valor atual.
                          */}
                          {item.status && !CREATIVE_STATUSES.some((s) => s.value === item.status) && (
                            <option value={item.status}>{item.status}</option>
                          )}
                          {CREATIVE_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        {savingIds[item.id] && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-empire-subtle" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-empire-muted">{item.format || '—'}</TableCell>
                    <TableCell className="text-empire-muted">{getObjetivo(item) || '—'}</TableCell>
                    <TableCell className="text-empire-muted">
                      {item.available_date ? fmtDate(item.available_date) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {/*
                          MEL-21, reunião de 2026-08-28: desmarcar "Testado" apagava a
                          data de início do teste. Os dois campos são independentes —
                          um teste que começou e foi desmarcado continua tendo começado.
                        */}
                        <Checkbox
                          checked={item.creative_tested}
                          disabled={!!savingIds[item.id]}
                          onCheckedChange={(checked) => {
                            void handleUpdateCreative(item.id, {
                              creative_tested: checked === true,
                            })
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      {/*
                        MEL-21: editável sem depender de "Testado". Quando o teste
                        começa o criativo ainda NÃO foi testado — exigir a marcação
                        antes da data invertia a ordem real do processo.
                      */}
                      <DatePicker
                        value={item.test_started_at ?? ''}
                        disabled={!!savingIds[item.id]}
                        clearable
                        aria-label="Data de início do teste"
                        onChange={(v) => {
                          void handleUpdateCreative(item.id, {
                            test_started_at: v || null,
                          })
                        }}
                        className="min-w-[150px]"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 min-w-[120px]">
                        <div className="flex gap-1.5">
                          <button
                            disabled={!!savingIds[item.id]}
                            onClick={() => handleAprovacao(item.id, true)}
                            title="O tráfego subiu este criativo no anúncio"
                            className={[
                              'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-all',
                              item.aprovado === true
                                ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                                : 'border-empire-border bg-empire-elevated text-empire-subtle hover:border-blue-400 hover:text-blue-500',
                            ].join(' ')}
                          >
                            ✓ Sim
                          </button>
                          <button
                            disabled={!!savingIds[item.id]}
                            onClick={() => handleAprovacao(item.id, false)}
                            title="Este criativo não foi publicado"
                            className={[
                              'flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold transition-all',
                              item.aprovado === false
                                ? 'border-red-500 bg-red-500 text-white shadow-sm'
                                : 'border-empire-border bg-empire-elevated text-empire-subtle hover:border-red-400 hover:text-red-500',
                            ].join(' ')}
                          >
                            ✗ Não
                          </button>
                          {savingIds[item.id] && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-empire-subtle self-center" />
                          )}
                        </div>
                        {item.data_avaliacao && (
                          <span
                            className={[
                              'text-[11px]',
                              item.aprovado === true
                                ? 'text-blue-500'
                                : item.aprovado === false
                                  ? 'text-red-400'
                                  : 'text-empire-subtle',
                            ].join(' ')}
                          >
                            {new Date(item.data_avaliacao).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'America/Sao_Paulo',
                            })}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {item.videos_folder_url && (
                          <a
                            href={item.videos_folder_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            Vídeos
                          </a>
                        )}
                        {item.final_asset_url && (
                          <a
                            href={item.final_asset_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            Asset
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!_onEditCreative}
                        onClick={() => _onEditCreative?.(item)}
                        className="border-empire-border bg-empire-elevated hover:bg-empire-border"
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
