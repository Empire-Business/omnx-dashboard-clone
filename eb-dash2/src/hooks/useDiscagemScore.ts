import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { PIPELINE_DISCAGEM_NAMES, PIPELINE_DISCAGEM_RECUPERACAO_NAME } from '@/lib/constants'

export type DiscagemCamada = 'horario_marcado' | 'respondeu' | 'lead_novo' | 'cadencia'
export type DiscagemEstado = 'ligue_agora' | 'ligue_hoje' | 'mensagem'
export type CanalSugerido = 'call' | 'whatsapp' | 'sms'

export interface DiscagemScoreLead {
  oppId: string
  contatoId: string
  nome: string
  telefone: string | null
  ghlContactId: string | null
  sdrName: string | null
  score: number
  camada: DiscagemCamada
  estado: DiscagemEstado
  razao: string
  numeroTentativa: number
  canalSugerido: CanalSugerido
  dataEntradaLead: string | null
  dataLeadRecebido: string | null
  updatedAt: string
  /**
   * Outro lead da MESMA fila usa este telefone.
   *
   * Acontece quando a mesma pessoa existe em dois contatos no banco — em geral
   * porque o GHL mesclou duplicados e um dos registros ficou órfão. O sintoma
   * para o SDR é traiçoeiro: um dos dois mostra "0 ligações" e ele conclui que
   * ninguém falou com o lead, quando o histórico está no registro vizinho.
   *
   * Detectado DENTRO da fila já carregada, sem query extra. Não mescla nem troca
   * o registro exibido de propósito: telefone repetido também acontece por
   * motivo legítimo (sócios, casal, central da empresa), e trocar a identidade
   * do lead por heurística seria pior que avisar.
   */
  telefoneDuplicado: boolean
}

export interface ReengajamentoLead {
  oppId: string
  contatoId: string
  nome: string
  telefone: string | null
  ghlContactId: string | null
  ultimaMensagem: string | null
  dataUltimaMensagem: string | null
  contexto: string
  utmSource: string | null
}

export interface UseDiscagemScoreResult {
  leads: DiscagemScoreLead[]
  reengajamento: ReengajamentoLead[]
  total: number
  ligacoesHoje: number
  isAdmin: boolean
  sdrOptions: string[]
  loading: boolean
  refreshing: boolean
  loadingReengajamento: boolean
  error: string | null
  reload: () => void
}

export type DiscagemScope = 'pre_vendas' | 'recuperacao'

const SCOPE_PIPELINES: Record<DiscagemScope, Set<string>> = {
  pre_vendas: new Set(PIPELINE_DISCAGEM_NAMES),
  recuperacao: new Set([PIPELINE_DISCAGEM_RECUPERACAO_NAME]),
}

export function useDiscagemScore(sdrFilter = '', scope: DiscagemScope = 'pre_vendas'): UseDiscagemScoreResult {
  const [leads, setLeads] = useState<DiscagemScoreLead[]>([])
  const [reengajamento, setReengajamento] = useState<ReengajamentoLead[]>([])
  const [ligacoesHoje, setLigacoesHoje] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [sdrOptions, setSdrOptions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingReengajamento, setLoadingReengajamento] = useState(false)
  const hasLoadedOnceRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [currentSdrName, setCurrentSdrName] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  const load = useCallback(async () => {
    // Só mostra o skeleton de tela cheia no primeiro carregamento — refreshes
    // automáticos (intervalo de 30s, foco da janela) atualizam os dados sem
    // "piscar" a lista inteira, que deixava a fila difícil de usar.
    if (!hasLoadedOnceRef.current) setLoading(true)
    setRefreshing(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) {
        setError('Conta não encontrada')
        return
      }
      setWorkspaceId(wid)

      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user?.id ?? null
      let admin = false
      let sdrName: string | null = null

      if (userId) {
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle()
        admin = ['admin', 'owner', 'admin_master'].includes(membership?.role ?? '')
        if (!admin) {
          const { data: ghlUser } = await supabase
            .from('ghl_users')
            .select('nome, papeis')
            .eq('auth_user_id', userId)
            .eq('workspace_id', wid)
            .maybeSingle()
          if ((ghlUser?.papeis ?? []).includes('gestor')) {
            admin = true
          } else {
            sdrName = ghlUser?.nome ?? null
          }
        }
      }
      setIsAdmin(admin)
      setCurrentSdrName(sdrName)

      if (admin) {
        const { data: sdrs } = await supabase
          .from('ghl_users')
          .select('nome')
          .contains('papeis', ['sdr'])
          .eq('deleted', false)
          .eq('workspace_id', wid)
          .order('nome')
        setSdrOptions((sdrs ?? []).map((r: { nome: string }) => r.nome).filter(Boolean))
      }

      // Paginação obrigatória: o PostgREST corta em 1000 linhas sem erro e sem
      // aviso. A fila de recuperação já passa de 2 mil leads — sem o loop, mais
      // da metade da fila simplesmente não existia para o SDR.
      const PAGE_SIZE = 1000
      const scores: Record<string, unknown>[] = []
      for (let page = 0; ; page++) {
        const { data: pageRows, error: scoresErr } = await supabase
          .from('discagem_scores')
          .select(`
            oportunidade_id, contato_id, score, estado, razao, updated_at,
            camada, numero_tentativa, canal_sugerido,
            data_entrada_lead,
            oportunidades!inner (
              id, sdr_name, data_lead_recebido, pipeline_name,
              contatos (nome, telefone, ghl_id, owner_name)
            )
          `)
          .eq('workspace_id', wid)
          .eq('escopo', scope)
          // Desempate por oportunidade_id: sem ordem determinística, o mesmo
          // lead pode repetir em duas páginas (ou sumir de todas).
          .order('score', { ascending: false })
          .order('oportunidade_id', { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (scoresErr) throw scoresErr
        const rows = (pageRows ?? []) as Record<string, unknown>[]
        scores.push(...rows)
        if (rows.length < PAGE_SIZE) break
      }

      // Contador de ligações hoje — filtrado pelo SDR ativo
      const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      const todayStart = new Date(`${today}T00:00:00-03:00`).toISOString()
      const todayEnd   = new Date(`${today}T23:59:59-03:00`).toISOString()

      const activeSdrName = admin ? (sdrFilter || null) : sdrName

      // Contagem feita na tabela base `comunicacoes` e não na view
      // `comunicacoes_com_remetente`: a view não expõe `workspace_id`, então não
      // dava para isolar a conta — quem tem acesso a mais de uma somava ligações
      // de outra empresa no próprio KPI. O remetente é resolvido por
      // `usuario_ghl_id`, exatamente a chave que a view usa para achar o nome.
      const remetentesQuery = supabase
        .from('ghl_users')
        .select('ghl_id')
        .eq('workspace_id', wid)
        .eq('deleted', false)

      const { data: remetentes, error: remetentesErr } = activeSdrName
        ? await remetentesQuery.eq('nome', activeSdrName)
        : await remetentesQuery.contains('papeis', ['sdr'])

      if (remetentesErr) console.error('[useDiscagemScore] falha ao resolver remetentes:', remetentesErr)

      const ghlIds = (remetentes ?? [])
        .map((r: { ghl_id: string | null }) => r.ghl_id)
        .filter(Boolean) as string[]

      let callsCount = 0
      if (ghlIds.length > 0) {
        const { count, error: callsErr } = await supabase
          .from('comunicacoes')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', wid)
          .eq('channel', 'call')
          .eq('direction', 'outbound')
          .eq('ghl_source', 'app')
          .in('usuario_ghl_id', ghlIds)
          .gte('data_comunicacao', todayStart)
          .lte('data_comunicacao', todayEnd)
        if (callsErr) console.error('[useDiscagemScore] falha ao contar ligações de hoje:', callsErr)
        callsCount = count ?? 0
      }
      setLigacoesHoje(callsCount)

      // Guardrail: excluir leads fora dos pipelines válidos do escopo atual.
      // Filtrado ANTES do map — a versão anterior fazia um find() dentro de um
      // filter() sobre a lista já mapeada (com 2 mil leads, ~4 milhões de
      // comparações a cada refresh de 30s).
      const validPipelines = SCOPE_PIPELINES[scope]
      const scopedRows = scores.filter((s) => {
        const opp = s.oportunidades as Record<string, unknown> | null
        const pipelineName = opp?.pipeline_name as string | null
        return !pipelineName || validPipelines.has(pipelineName)
      })

      const mapped: DiscagemScoreLead[] = scopedRows.map((s: Record<string, unknown>) => {
        const opp = s.oportunidades as Record<string, unknown> | null
        const contato = opp?.contatos as Record<string, unknown> | null
        const sdrNameVal = (opp?.sdr_name as string | null) || (contato?.owner_name as string | null) || null

        const camadaRaw = s.camada as string | null
        let camada: DiscagemCamada
        if (camadaRaw && ['horario_marcado', 'respondeu', 'lead_novo', 'cadencia'].includes(camadaRaw)) {
          camada = camadaRaw as DiscagemCamada
        } else {
          const estado = s.estado as string
          camada = estado === 'ligue_agora' ? 'lead_novo' : estado === 'ligue_hoje' ? 'respondeu' : 'cadencia'
        }

        const canalRaw = s.canal_sugerido as string | null
        const canalSugerido: CanalSugerido =
          canalRaw === 'whatsapp' ? 'whatsapp' : canalRaw === 'sms' ? 'sms' : 'call'

        return {
          oppId: s.oportunidade_id as string,
          contatoId: s.contato_id as string,
          nome: (contato?.nome as string) ?? 'Sem nome',
          telefone: (contato?.telefone as string | null) ?? null,
          ghlContactId: (contato?.ghl_id as string | null) ?? null,
          sdrName: sdrNameVal,
          score: s.score as number,
          camada,
          estado: s.estado as DiscagemEstado,
          razao: (s.razao as string) ?? '',
          numeroTentativa: (s.numero_tentativa as number) ?? 0,
          canalSugerido,
          dataEntradaLead: (s.data_entrada_lead as string | null) ?? (opp?.data_lead_recebido as string | null) ?? null,
          dataLeadRecebido: (opp?.data_lead_recebido as string | null) ?? null,
          updatedAt: s.updated_at as string,
          telefoneDuplicado: false,
        }
      })

      // Telefone repetido na fila: marca os dois lados. Só conta como duplicata
      // quando os CONTATOS são diferentes — o mesmo contato com duas
      // oportunidades é normal e não engana ninguém.
      {
        const porTelefone = new Map<string, Set<string>>()
        for (const l of mapped) {
          const fone = (l.telefone ?? '').replace(/\D/g, '')
          if (fone.length < 8) continue
          const contatos = porTelefone.get(fone) ?? new Set<string>()
          contatos.add(l.contatoId)
          porTelefone.set(fone, contatos)
        }
        for (const l of mapped) {
          const fone = (l.telefone ?? '').replace(/\D/g, '')
          if (fone.length < 8) continue
          if ((porTelefone.get(fone)?.size ?? 0) > 1) l.telefoneDuplicado = true
        }
      }

      // Filtro de SDR fica no cliente por falta de coluna: `discagem_scores` não
      // tem `sdr_name` próprio e o nome exibido depende do fallback
      // `oportunidades.sdr_name || contatos.owner_name` — filtrar no servidor só
      // pelo primeiro esconderia leads cujo SDR vem do fallback. Como agora a
      // busca é paginada, o filtro roda sobre a fila COMPLETA, não sobre as
      // primeiras 1000 linhas.
      const efectiveSdr = admin ? sdrFilter : sdrName
      const filtered = efectiveSdr ? mapped.filter(l => l.sdrName === efectiveSdr) : mapped

      // Ordenação: score DESC (já vem ordenado do banco, mas garante)
      filtered.sort((a, b) => b.score - a.score)

      setLeads(filtered)
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err)
      setError(msg)
    } finally {
      hasLoadedOnceRef.current = true
      setLoading(false)
      setRefreshing(false)
    }
  }, [sdrFilter, scope])

  const loadReengajamento = useCallback(async (sdrName: string | null, admin: boolean) => {
    // Recuperação já É reengajamento — leads que responderam aparecem na
    // própria fila (camada "respondeu"), sem precisar da sugestão de fallback.
    if (!workspaceId || scope !== 'pre_vendas') return
    setLoadingReengajamento(true)
    try {
      const efectiveSdr = admin ? sdrFilter || null : sdrName
      const { data, error: rErr } = await supabase
        .rpc('buscar_reengajamento', {
          p_workspace_id: workspaceId,
          p_sdr_name: efectiveSdr,
          p_limit: 10,
        })
      if (rErr) {
        // Sem log, uma falha da RPC virava "nenhuma sugestão disponível" na tela
        // — foi assim que um bug ficou meses invisível.
        console.error('[useDiscagemScore] buscar_reengajamento falhou:', rErr)
        return
      }
      const mapped: ReengajamentoLead[] = (data ?? []).map((r: Record<string, unknown>) => ({
        oppId: r.oportunidade_id as string,
        contatoId: r.contato_id as string,
        nome: (r.nome as string) ?? 'Sem nome',
        telefone: (r.telefone as string | null) ?? null,
        ghlContactId: (r.ghl_id as string | null) ?? null,
        ultimaMensagem: (r.ultima_mensagem as string | null) ?? null,
        dataUltimaMensagem: (r.data_ultima_mensagem as string | null) ?? null,
        contexto: (r.contexto as string) ?? '',
        utmSource: (r.utm_source as string | null) ?? null,
      }))
      setReengajamento(mapped)
    } finally {
      setLoadingReengajamento(false)
    }
  }, [sdrFilter, workspaceId, scope])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const id = setInterval(() => void load(), 30_000)
    return () => clearInterval(id)
  }, [load])

  // Recarrega ao voltar para a aba — SDR fez ligação no GHL e voltou
  useEffect(() => {
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  // Carrega reengajamento quando a fila está vazia
  useEffect(() => {
    if (!loading && leads.length === 0) {
      void loadReengajamento(currentSdrName, isAdmin)
    }
  }, [loading, leads.length, loadReengajamento, currentSdrName, isAdmin])

  return {
    leads,
    reengajamento,
    total: leads.length,
    ligacoesHoje,
    isAdmin,
    sdrOptions,
    loading,
    refreshing,
    loadingReengajamento,
    error,
    reload: load,
  }
}
