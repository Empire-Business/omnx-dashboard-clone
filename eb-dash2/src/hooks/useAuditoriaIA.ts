import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { spToday, spDaysAgo, parseTags } from '@/lib/utils/dates'
import type { FilterValues } from '@/types/filters'
import { useSdrIaConfig, type SdrIaConfig } from './useSdrIaConfig'

export type ProblemaTipo =
  | 'sem_followup'
  | 'erro_entrega'
  | 'spam'
  | 'horario_inadequado'
  | 'conversa_unilateral'
  | 'conflito_humano'
  | 'reclamacao_lead'

export type Severidade = 'alta' | 'media' | 'baixa'

const PROBLEMA_TIPOS: ProblemaTipo[] = [
  'sem_followup',
  'erro_entrega',
  'spam',
  'horario_inadequado',
  'conversa_unilateral',
  'conflito_humano',
  'reclamacao_lead',
]

const SEVERIDADES: Severidade[] = ['alta', 'media', 'baixa']

function isProblemaTipo(value: string): value is ProblemaTipo {
  return (PROBLEMA_TIPOS as string[]).includes(value)
}

function isSeveridade(value: string): value is Severidade {
  return (SEVERIDADES as string[]).includes(value)
}

export type ProblemaIA = {
  id: string
  contato_id: string
  opp_id: string | null
  sdr_humano: string | null
  contato_nome: string
  contato_email: string | null
  contato_telefone: string | null
  tags: string[] | null
  tipo: ProblemaTipo
  severidade: Severidade
  detalhes: string
  ultima_interacao: Date
  dias_sem_contato?: number
  msg_ia?: number
  msg_lead?: number
  channel?: string
  error_msg?: string
  acoes_sugeridas: string[]
  outros_problemas?: ProblemaIA[]
}

export type ResumoAuditoria = {
  sem_followup: { total: number; alta: number; media: number }
  erro_entrega: { total: number; alta: number; media: number }
  spam: { total: number; alta: number; media: number }
  horario_inadequado: { total: number; media: number; baixa: number }
  conversa_unilateral: { total: number; media: number; baixa: number }
  conflito_humano: { total: number; alta: number; media: number }
  reclamacao_lead: { total: number; alta: number; media: number }
}

export type AuditoriaIAData = {
  problemas: ProblemaIA[]
  resumo: ResumoAuditoria
  loading: boolean
  error: string | null
}

const ACOES_SUGERIDAS: Record<ProblemaTipo, string[]> = {
  sem_followup: [
    'Verificar se o lead está no pipeline correto',
    'Verificar se há erro na sequência do GHL',
    'Considerar intervenção humana',
  ],
  erro_entrega: [
    'Verificar se o número/email é válido',
    'Verificar se há bloqueio no canal',
    'Reenviar mensagem manualmente',
  ],
  spam: [
    'Revisar configuração da sequência no GHL',
    'Adicionar delay entre mensagens',
    'Configurar rate limit',
  ],
  horario_inadequado: [
    'Configurar janela de envio no GHL',
    'Usar "business hours" nas automações',
  ],
  conversa_unilateral: [
    'Revisar qualidade das mensagens',
    'Considerar abordagem diferente',
    'Possível lead desqualificado',
  ],
  conflito_humano: [
    'Verificar se SDR está assumindo o lead',
    'Atualizar tags no GHL',
    'Definir responsabilidade clara',
  ],
  reclamacao_lead: [
    'Ler a conversa completa antes de responder',
    'Assumir o atendimento com um humano',
    'Revisar o prompt/sequência que gerou a resposta',
    'Se o lead pediu para parar, remover das automações',
  ],
}

function toArrayOrNull(f: FilterValues): { include: string[] | null; exclude: string[] | null } {
  return {
    include: f.include.length > 0 ? f.include : null,
    exclude: f.exclude.length > 0 ? f.exclude : null,
  }
}

function calculateResumo(problemas: ProblemaIA[]): ResumoAuditoria {
  const resumo: ResumoAuditoria = {
    sem_followup: { total: 0, alta: 0, media: 0 },
    erro_entrega: { total: 0, alta: 0, media: 0 },
    spam: { total: 0, alta: 0, media: 0 },
    horario_inadequado: { total: 0, media: 0, baixa: 0 },
    conversa_unilateral: { total: 0, media: 0, baixa: 0 },
    conflito_humano: { total: 0, alta: 0, media: 0 },
    reclamacao_lead: { total: 0, alta: 0, media: 0 },
  }

  for (const p of problemas) {
    const key = p.tipo as keyof ResumoAuditoria
    if (!resumo[key]) continue

    const bucket = resumo[key] as Record<string, number>
    bucket.total++
    if (p.severidade === 'alta') bucket.alta++
    else if (p.severidade === 'media') bucket.media++
    else if (p.severidade === 'baixa') bucket.baixa++
  }

  return resumo
}

// Linha retornada pela RPC auditoria_sdr_ia (client Supabase não é tipado)
interface AuditoriaSdrIaRow {
  contato_id: string
  opp_id: string | null
  sdr_humano: string | null
  contato_nome: string | null
  contato_email: string | null
  contato_telefone: string | null
  contato_tags: string[] | null
  tipo: string
  severidade: string
  detalhes: string
  ultima_interacao: string | null
  msg_ia: number | null
  msg_lead: number | null
  channel: string | null
  error_msg: string | null
}

async function fetchProblemas(startDate: string, endDate: string, config: SdrIaConfig): Promise<ProblemaIA[]> {
  const wid = await getWorkspaceId()
  if (!wid) return []

  const tags = toArrayOrNull(config.tags)
  const pipelines = toArrayOrNull(config.pipelines)
  const utmSource = toArrayOrNull(config.utmSource)
  const utmCampaign = toArrayOrNull(config.utmCampaign)

  const { data, error } = await supabase.rpc('auditoria_sdr_ia', {
    p_workspace_id: wid,
    p_start_date: startDate,
    p_end_date: endDate,
    p_include_tags: tags.include,
    p_exclude_tags: tags.exclude,
    p_include_pipelines: pipelines.include,
    p_exclude_pipelines: pipelines.exclude,
    p_include_utm_source: utmSource.include,
    p_exclude_utm_source: utmSource.exclude,
    p_include_utm_campaign: utmCampaign.include,
    p_exclude_utm_campaign: utmCampaign.exclude,
  })

  if (error) throw new Error(error.message)
  if (!data) return []

  return data
    .filter((row: AuditoriaSdrIaRow) => isProblemaTipo(row.tipo) && isSeveridade(row.severidade))
    .map((row: AuditoriaSdrIaRow) => {
      const tipo = row.tipo as ProblemaTipo
      const severidade = row.severidade as Severidade
      const ultima = row.ultima_interacao ? new Date(row.ultima_interacao) : new Date()
      const dias = row.tipo === 'sem_followup'
        ? Math.floor((Date.now() - ultima.getTime()) / (24 * 60 * 60 * 1000))
        : undefined

      return {
        id: `${row.contato_id}-${row.tipo}`,
        contato_id: row.contato_id,
        opp_id: row.opp_id ?? null,
        sdr_humano: row.sdr_humano ?? null,
        contato_nome: row.contato_nome || 'Sem nome',
        contato_email: row.contato_email ?? null,
        contato_telefone: row.contato_telefone ?? null,
        tags: row.contato_tags ?? parseTags(row.contato_tags),
        tipo,
        severidade,
        detalhes: row.detalhes,
        ultima_interacao: ultima,
        dias_sem_contato: dias,
        msg_ia: row.msg_ia ?? undefined,
        msg_lead: row.msg_lead ?? undefined,
        channel: row.channel ?? undefined,
        error_msg: row.error_msg ?? undefined,
        acoes_sugeridas: ACOES_SUGERIDAS[tipo],
      }
    })
}

export function useAuditoriaIA(
  startDate: string = spDaysAgo(29),
  endDate: string = spToday()
): AuditoriaIAData {
  const [problemas, setProblemas] = useState<ProblemaIA[]>([])
  const [resumo, setResumo] = useState<ResumoAuditoria>({
    sem_followup: { total: 0, alta: 0, media: 0 },
    erro_entrega: { total: 0, alta: 0, media: 0 },
    spam: { total: 0, alta: 0, media: 0 },
    horario_inadequado: { total: 0, media: 0, baixa: 0 },
    conversa_unilateral: { total: 0, media: 0, baixa: 0 },
    conflito_humano: { total: 0, alta: 0, media: 0 },
    reclamacao_lead: { total: 0, alta: 0, media: 0 },
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { config, loading: configLoading } = useSdrIaConfig()

  const fetchAll = useCallback(async () => {
    if (configLoading) return

    setLoading(true)
    setError(null)

    try {
      let todos = await fetchProblemas(startDate, endDate, config)

      // Leads com erro de entrega não devem aparecer como sem follow-up:
      // o erro já explica por que não houve contato recente.
      const contatosComErro = new Set(todos.filter((p) => p.tipo === 'erro_entrega').map((p) => p.contato_id))
      todos = todos.filter((p) => !(p.tipo === 'sem_followup' && contatosComErro.has(p.contato_id)))

      // Agrupa por contato_id — principal = mais severo, restantes em outros_problemas
      const severityOrder: Record<Severidade, number> = { alta: 3, media: 2, baixa: 1 }
      // Desempate entre problemas de mesma severidade: o mais acionável primeiro.
      // Uma reclamação do lead exige resposta humana; "conversa unilateral" não.
      const tipoPrioridade: Record<ProblemaTipo, number> = {
        reclamacao_lead: 7,
        erro_entrega: 6,
        spam: 5,
        conflito_humano: 4,
        sem_followup: 3,
        conversa_unilateral: 2,
        horario_inadequado: 1,
      }
      const byContato = new Map<string, ProblemaIA[]>()
      for (const p of todos) {
        if (!byContato.has(p.contato_id)) byContato.set(p.contato_id, [])
        byContato.get(p.contato_id)!.push(p)
      }
      const problemasUnicos: ProblemaIA[] = []
      for (const grupo of byContato.values()) {
        grupo.sort(
          (a, b) =>
            severityOrder[b.severidade] - severityOrder[a.severidade] ||
            tipoPrioridade[b.tipo] - tipoPrioridade[a.tipo]
        )
        problemasUnicos.push({ ...grupo[0], outros_problemas: grupo.slice(1) })
      }

      setProblemas(problemasUnicos)
      setResumo(calculateResumo(problemasUnicos))
    } catch (err) {
      const message = err instanceof Error ? err.message : null
      setError(message || 'Erro ao carregar auditoria')
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, config, configLoading])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return {
    problemas,
    resumo,
    loading,
    error,
  }
}
