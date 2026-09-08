import { useState, useMemo } from 'react'
import { AlertTriangle, Filter, X } from 'lucide-react'
import { useAuditoriaIA, type ProblemaTipo, type Severidade } from '@/hooks/useAuditoriaIA'
import { AuditoriaProblemsCard } from '@/components/prevendas/AuditoriaProblemsCard'
import { AuditoriaTable } from '@/components/prevendas/AuditoriaTable'
import { LeadCard } from '@/components/leads/LeadCard'

type AuditoriaIaPanelProps = {
  startDate: string
  endDate: string
  loading?: boolean
}

export function AuditoriaIaPanel({ startDate, endDate }: AuditoriaIaPanelProps) {
  const { problemas, resumo, loading, error } = useAuditoriaIA(startDate, endDate)

  const [filtroTipo, setFiltroTipo] = useState<ProblemaTipo | 'todos'>('todos')
  const [filtroSeveridade, setFiltroSeveridade] = useState<Severidade | 'todas'>('todas')
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  const problemasFiltrados = useMemo(() => {
    return problemas.filter((p) => {
      const todos = [p, ...(p.outros_problemas ?? [])]
      if (filtroTipo !== 'todos' && !todos.some((x) => x.tipo === filtroTipo)) return false
      if (filtroSeveridade !== 'todas' && !todos.some((x) => x.severidade === filtroSeveridade)) return false
      return true
    })
  }, [problemas, filtroTipo, filtroSeveridade])

  const handleFilter = (tipo: ProblemaTipo) => {
    setFiltroTipo(filtroTipo === tipo ? 'todos' : tipo)
  }

  const handleLeadClick = (oppId: string | null) => {
    setSelectedOppId(oppId)
  }

  const limparFiltros = () => {
    setFiltroTipo('todos')
    setFiltroSeveridade('todas')
  }

  const filtrosAtivos = filtroTipo !== 'todos' || filtroSeveridade !== 'todas'

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="h-5 w-5 text-empire-primary" />
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-empire-primary">Monitoramento</p>
        </div>
        <h2 className="font-display text-2xl font-semibold text-empire-void">
          Auditoria SDR IA
        </h2>
        <p className="mt-1 text-sm text-empire-subtle">
          Detecta problemas no atendimento automatizado: leads sem follow-up, erros de entrega, spam e mais
        </p>
      </div>

      {/* Cards de Resumo */}
      <AuditoriaProblemsCard
        resumo={resumo}
        loading={loading}
        onFilter={handleFilter}
        activeFilter={filtroTipo}
      />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-empire-border bg-empire-surface px-4 py-3">
        <div className="flex items-center gap-2 text-empire-subtle">
          <Filter className="h-4 w-4" />
          <span className="text-[11px] font-semibold uppercase tracking-wider">Filtros</span>
        </div>

        {/* Filtro por Tipo */}
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value as ProblemaTipo | 'todos')}
          className="h-8 min-w-[170px] cursor-pointer rounded-lg border border-empire-border bg-empire-elevated px-2.5 text-xs text-empire-void transition-colors hover:border-empire-border-strong focus:border-empire-primary focus:outline-none"
        >
          <option value="todos">Todos os tipos</option>
          <option value="reclamacao_lead">Reclamação do Lead</option>
          <option value="erro_entrega">Erro de Entrega</option>
          <option value="sem_followup">Sem Follow-up</option>
          <option value="spam">Spam/Excesso</option>
          <option value="conflito_humano">Conflito IA/Humano</option>
          <option value="conversa_unilateral">Conversa Unilateral</option>
          <option value="horario_inadequado">Horário Inadequado</option>
        </select>

        {/* Filtro por Severidade */}
        <select
          value={filtroSeveridade}
          onChange={(e) => setFiltroSeveridade(e.target.value as Severidade | 'todas')}
          className="h-8 min-w-[140px] cursor-pointer rounded-lg border border-empire-border bg-empire-elevated px-2.5 text-xs text-empire-void transition-colors hover:border-empire-border-strong focus:border-empire-primary focus:outline-none"
        >
          <option value="todas">Todas as severidades</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>

        {/* Limpar filtros */}
        {filtrosAtivos && (
          <button
            onClick={limparFiltros}
            className="inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-elevated px-2.5 py-1.5 text-xs font-medium text-empire-muted transition-colors hover:border-empire-border-strong hover:text-empire-void"
          >
            <X className="h-3 w-3" />
            Limpar
          </button>
        )}

        {/* Contador de resultados */}
        <div className="ml-auto text-xs text-empire-subtle">
          {filtrosAtivos ? (
            <span>
              <span className="font-semibold tabular-nums text-empire-void">{problemasFiltrados.length}</span> de{' '}
              <span className="tabular-nums">{problemas.length}</span> leads
            </span>
          ) : (
            <span>
              <span className="font-semibold tabular-nums text-empire-void">{problemas.length}</span> leads com problema
            </span>
          )}
        </div>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.07] p-4 text-sm text-rose-700 dark:text-rose-300">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* Tabela de Problemas */}
      <AuditoriaTable problemas={problemasFiltrados} loading={loading} onLeadClick={handleLeadClick} />

      {/* LeadCard padrão do sistema */}
      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </div>
  )
}
