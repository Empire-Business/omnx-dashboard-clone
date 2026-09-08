// Módulo puro de inferência heurística para mapeamento GHL -> Empire.
// Sem dependências de Deno/React. Usado na edge function e copiado/espelhado no frontend.

export type GhlPipelineCategory = 'pre_vendas' | 'vendas' | 'recuperacao' | 'excluir' | 'outro'

export const GHL_PIPELINE_CATEGORIES: { value: GhlPipelineCategory; label: string }[] = [
  { value: 'pre_vendas', label: 'Pré-Vendas' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'recuperacao', label: 'Recuperação' },
  { value: 'excluir', label: 'Excluir' },
  { value: 'outro', label: 'Outro' },
]

export type GhlSystemStage = 'novo' | 'conectado' | 'agendado' | 'reuniao_realizada' | 'fechado' | 'perdido'

export const GHL_SYSTEM_STAGES: { value: GhlSystemStage; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'conectado', label: 'Conectado' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'reuniao_realizada', label: 'Reunião realizada' },
  { value: 'fechado', label: 'Fechado' },
  { value: 'perdido', label: 'Perdido' },
]

export interface InferredField {
  logical_name: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface InferredPipeline {
  category: GhlPipelineCategory | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface InferredStage {
  stage: GhlSystemStage | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => [])
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }
  return matrix[a.length][b.length]
}

export function similarityScore(a: string, b: string): number {
  if (!a || !b) return 0
  const na = normalizeToken(a)
  const nb = normalizeToken(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const distance = levenshteinDistance(na, nb)
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 1
  return 1 - distance / maxLen
}

// Mapa de sinônimos para cada logical_name do template Empire Default.
// Cada entrada pode ter: exact (match exato normalizado), keywords (presença de termos),
// startsWith/endsWith (padrões) e folders (nomes de pastas que corroboram).
type FieldRule = {
  logical_name: string
  exact?: string[]
  keywords?: string[]
  startsWith?: string[]
  endsWith?: string[]
  folders?: string[]
  fieldTypes?: string[]
}

const FIELD_RULES: FieldRule[] = [
  // Contato: identificação
  {
    logical_name: 'full_name',
    exact: ['fullname', 'nomecompleto', 'nomecompleto', 'nome'],
    keywords: ['full name', 'nome completo'],
    fieldTypes: ['text'],
  },
  {
    logical_name: 'first_name',
    exact: ['firstname', 'nome', 'primernombre'],
    keywords: ['first name', 'primeiro nome', 'nome'],
    startsWith: ['first'],
  },
  {
    logical_name: 'last_name',
    exact: ['lastname', 'sobrenome', 'apellido'],
    keywords: ['last name', 'sobrenome', 'segundo nome'],
    startsWith: ['last'],
  },
  {
    logical_name: 'email',
    exact: ['email', 'e-mail', 'correo'],
    keywords: ['email', 'e-mail', 'mail'],
  },
  {
    logical_name: 'phone',
    exact: ['phone', 'telefone', 'celular', 'whatsapp', 'mobile'],
    keywords: ['phone', 'telefone', 'celular', 'whatsapp', 'mobile', 'fone'],
  },

  // Atribuição
  {
    logical_name: 'ip',
    exact: ['ip', 'ipaddress', 'enderecoip'],
    keywords: ['ip', 'ip address', 'endereco ip'],
    startsWith: ['ip'],
  },
  {
    logical_name: 'url',
    exact: ['url', 'pageurl', 'url_da_pagina'],
    keywords: ['url', 'page url', 'url da pagina'],
    startsWith: ['url'],
  },
  {
    logical_name: 'fbclid',
    exact: ['fbclid', 'facebookclid'],
    keywords: ['fbclid', 'facebook click'],
    startsWith: ['fbclid'],
  },
  {
    logical_name: 'utm_source',
    exact: ['utmsource', 'source', 'utm_source'],
    keywords: ['utm source', 'origem', 'fonte'],
    startsWith: ['utm_source', 'utmsource'],
  },
  {
    logical_name: 'utm_medium',
    exact: ['utmmedium', 'medium', 'utm_medium'],
    keywords: ['utm medium', 'meio'],
    startsWith: ['utm_medium', 'utmmedium'],
  },
  {
    logical_name: 'utm_campaign',
    exact: ['utmcampaign', 'campaign', 'utm_campaign', 'campanha'],
    keywords: ['utm campaign', 'campanha'],
    startsWith: ['utm_campaign', 'utmcampaign'],
  },
  {
    logical_name: 'utm_term',
    exact: ['utmterm', 'term', 'utm_term'],
    keywords: ['utm term', 'termo'],
    startsWith: ['utm_term', 'utmterm'],
  },
  {
    logical_name: 'utm_content',
    exact: ['utmcontent', 'content', 'utm_content', 'conteudo'],
    keywords: ['utm content', 'conteudo', 'conteúdo'],
    startsWith: ['utm_content', 'utmcontent'],
  },
  {
    logical_name: 'tt_source',
    exact: ['ttsource', 'tt_source'],
    keywords: ['tiktok source', 'tt source'],
    startsWith: ['tt_source', 'ttsource'],
  },
  {
    logical_name: 'tt_medium',
    exact: ['ttmedium', 'tt_medium'],
    keywords: ['tiktok medium', 'tt medium'],
    startsWith: ['tt_medium', 'ttmedium'],
  },
  {
    logical_name: 'tt_campaign',
    exact: ['ttcampaign', 'tt_campaign'],
    keywords: ['tiktok campaign', 'tt campaign'],
    startsWith: ['tt_campaign', 'ttcampaign'],
  },
  {
    logical_name: 'tt_term',
    exact: ['ttterm', 'tt_term'],
    keywords: ['tiktok term', 'tt term'],
    startsWith: ['tt_term', 'ttterm'],
  },
  {
    logical_name: 'tt_content',
    exact: ['ttcontent', 'tt_content'],
    keywords: ['tiktok content', 'tt content'],
    startsWith: ['tt_content', 'ttcontent'],
  },

  // Metadados contato
  {
    logical_name: 'country',
    exact: ['country', 'pais', 'país'],
    keywords: ['country', 'pais', 'país', 'nacao'],
  },
  {
    logical_name: 'date_created',
    exact: ['datecreated', 'datacriacao', 'data_criacao', 'createdat'],
    keywords: ['date created', 'data criacao', 'data de criacao', 'created at'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'contact_type',
    exact: ['contacttype', 'tipo_de_contato', 'tipocontato'],
    keywords: ['contact type', 'tipo de contato', 'tipo contato'],
  },
  {
    logical_name: 'contact_source',
    exact: ['contactsource', 'source', 'origem', 'fonte'],
    keywords: ['contact source', 'origem do contato', 'fonte do contato'],
  },
  {
    logical_name: 'pipeline_id_contato',
    exact: ['pipelineid', 'pipeline_id'],
    keywords: ['pipeline id', 'id do pipeline'],
  },
  {
    logical_name: 'pipeline_name_contato',
    exact: ['pipelinename', 'pipeline_name', 'nome_pipeline'],
    keywords: ['pipeline name', 'nome do pipeline'],
  },
  {
    logical_name: 'owner_id',
    exact: ['ownerid', 'responsavelid', 'owner_id'],
    keywords: ['owner id', 'id do responsavel', 'id do owner'],
  },
  {
    logical_name: 'owner_name',
    exact: ['owner', 'responsavel', 'owner_name', 'nome_responsavel'],
    keywords: ['owner', 'responsavel', 'nome do responsavel', 'owner name'],
  },
  {
    logical_name: 'owner_email',
    exact: ['owneremail', 'email_owner', 'email_responsavel'],
    keywords: ['owner email', 'email do responsavel', 'e-mail owner'],
  },

  // Oportunidade: identificação
  {
    logical_name: 'opportunity_id',
    exact: ['opportunityid', 'id', 'oppid'],
    keywords: ['opportunity id', 'id da oportunidade', 'opp id'],
  },
  {
    logical_name: 'opportunity_name',
    exact: ['opportunityname', 'nome_oportunidade', 'oppname'],
    keywords: ['opportunity name', 'nome da oportunidade', 'titulo da oportunidade'],
  },
  {
    logical_name: 'lead_value',
    exact: ['leadvalue', 'valor', 'value', 'valor_lead'],
    keywords: ['lead value', 'valor do lead', 'valor da oportunidade'],
  },
  {
    logical_name: 'pipeline_id_opp',
    exact: ['pipelineid', 'pipeline_id'],
    keywords: ['pipeline id', 'id do pipeline da oportunidade'],
  },
  {
    logical_name: 'pipeline_name_opp',
    exact: ['pipelinename', 'pipeline_name'],
    keywords: ['pipeline name', 'nome do pipeline da oportunidade'],
  },
  {
    logical_name: 'pipeline_stage_id',
    exact: ['pipelinestage', 'pipeline_stage_id', 'stageid'],
    keywords: ['pipeline stage', 'stage id', 'id do stage'],
  },
  {
    logical_name: 'status',
    exact: ['status', 'situacao'],
    keywords: ['status', 'situacao', 'estado'],
  },

  // Oportunidade: campos customizados
  {
    logical_name: 'opportunity_source',
    exact: ['source', 'origem', 'fonte', 'origem_da_oportunidade'],
    keywords: ['opportunity source', 'origem da oportunidade', 'fonte da oportunidade'],
  },
  {
    logical_name: 'vendedor_closer',
    exact: ['vendedor', 'closer', 'assignedto', 'responsavel_pelo_fechamento'],
    keywords: ['vendedor', 'closer', 'assigned to', 'fechador', 'responsavel pelo fechamento'],
  },
  {
    logical_name: 'lost_reason',
    exact: ['lostreason', 'motivo_perda', 'motivo_da_perda'],
    keywords: ['lost reason', 'motivo da perda', 'motivo perda', 'razao da perda'],
  },
  {
    logical_name: 'resumo_ia',
    exact: ['resumoia', 'resumo_ia', 'airesumo', 'sumario_ia'],
    keywords: ['resumo ia', 'resumo da ia', 'ai summary', 'resumo inteligente'],
  },
  {
    logical_name: 'percepcao_closer',
    exact: ['percepcaocloser', 'percepcao_do_closer', 'percepcao_closer'],
    keywords: ['percepcao do closer', 'percepcao closer', 'feedback closer'],
  },

  // Datas MQL
  {
    logical_name: 'data_tentativa_1',
    exact: ['mqlcontato1', 'd_mqlcontato1', 'tentativa1', 'tentativa_1'],
    keywords: ['tentativa 1', 'primeira tentativa', 'mql contato 1'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_2',
    exact: ['mqlcontato2', 'd_mqlcontato2', 'tentativa2', 'tentativa_2'],
    keywords: ['tentativa 2', 'segunda tentativa', 'mql contato 2'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_3',
    exact: ['mqlcontato3', 'd_mqlcontato3', 'tentativa3', 'tentativa_3'],
    keywords: ['tentativa 3', 'terceira tentativa', 'mql contato 3'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_4',
    exact: ['mqlcontato4', 'd_mqlcontato4', 'tentativa4', 'tentativa_4'],
    keywords: ['tentativa 4', 'quarta tentativa', 'mql contato 4'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_5',
    exact: ['mqlcontato5', 'd_mqlcontato5', 'tentativa5', 'tentativa_5'],
    keywords: ['tentativa 5', 'quinta tentativa', 'mql contato 5'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_6',
    exact: ['mqlcontato6', 'd_mqlcontato6', 'tentativa6', 'tentativa_6'],
    keywords: ['tentativa 6', 'sexta tentativa', 'mql contato 6'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_7',
    exact: ['mqlcontato7', 'd_mqlcontato7', 'tentativa7', 'tentativa_7'],
    keywords: ['tentativa 7', 'setima tentativa', 'mql contato 7'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_tentativa_8',
    exact: ['mqlcontato8', 'd_mqlcontato8', 'tentativa8', 'tentativa_8'],
    keywords: ['tentativa 8', 'oitava tentativa', 'mql contato 8'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_no_show',
    exact: ['mqlnoshow', 'sqlnoshow', 'd_mqlnoshow', 'd_sqlnoshow', 'no_show'],
    keywords: ['no show', 'nao compareceu', 'falta', 'mql no show'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_conectado',
    exact: ['mqlconectado', 'd_mqlconectado', 'conectado'],
    keywords: ['conectado', 'connect', 'mql conectado'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_perdido',
    exact: ['mqlperdido', 'd_mqlperdido', 'perdido'],
    keywords: ['perdido', 'lost', 'mql perdido'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_qualificado',
    exact: ['mqlqualificado', 'd_mqlqualificado', 'qualificado'],
    keywords: ['qualificado', 'qualified', 'mql qualificado'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_agendamento_reuniao',
    exact: ['mqlreunio_marcada', 'sqlreunio_agendada', 'd_mqlreunio_marcada', 'reuniao_marcada'],
    keywords: ['reuniao marcada', 'reuniao agendada', 'agendamento reuniao', 'mql reuniao'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_pendencias_preenchimento',
    exact: ['sqlpendencias_preenchimento', 'd__sqlpendencias_preenchimento', 'pendencias'],
    keywords: ['pendencias preenchimento', 'pendencias', 'sql pendencias'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_no_show_vendas',
    exact: ['sqlnoshow', 'd_sqlnoshow', 'no_show_vendas'],
    keywords: ['no show vendas', 'sql no show'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_perdido_vendas',
    exact: ['sqlperdida', 'd_sqlperdida', 'perdido_vendas'],
    keywords: ['perdido vendas', 'sql perdido', 'sql perdida'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_agendamento_vendas',
    exact: ['sqlreunio_agendada', 'd_sqlreunio_agendada', 'agendamento_vendas'],
    keywords: ['agendamento vendas', 'sql reuniao agendada', 'sql agendamento'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_realizacao_vendas',
    exact: ['data_da_reunio_realizada', 'sqlreunio_realizada', 'd_sqlreunio_realizada', 'reuniao_realizada_vendas'],
    keywords: ['reuniao realizada vendas', 'data da reuniao realizada', 'sql reuniao realizada'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_negociacao',
    exact: ['sqlnegociao', 'd_sqlnegociao', 'negociacao'],
    keywords: ['negociacao', 'negociação', 'sql negociacao'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_fechado',
    exact: ['sqlfechada', 'd_sqlfechada', 'fechado'],
    keywords: ['fechado', 'fechada', 'sql fechada'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_reuniao_agendada',
    exact: ['data_da_reunio', 'd_data_da_reunio', 'reuniao_agendada'],
    keywords: ['reuniao agendada', 'data da reuniao', 'data reuniao'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_reuniao_realizada',
    exact: ['reuniao_realizada', 'd_reuniao_realizada', 'data_reuniao_realizada'],
    keywords: ['reuniao realizada', 'data reuniao realizada'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_auto_agendamento',
    exact: ['mqlauto_agendamento', 'auto_agendamento'],
    keywords: ['auto agendamento', 'auto agendado', 'mql auto agendamento'],
    fieldTypes: ['date'],
  },
  {
    logical_name: 'data_ultima_atividade',
    exact: ['ltima_atividade', 'ultima_atividade', 'last_activity'],
    keywords: ['ultima atividade', 'last activity', 'ltima atividade'],
    fieldTypes: ['date'],
  },
]

function matchesRule(name: string, type: string | undefined, folder: string | undefined, rule: FieldRule): boolean {
  const n = normalizeToken(name)
  const f = folder ? normalizeToken(folder) : ''
  const t = type ? normalizeToken(type) : ''

  if (rule.exact?.some((e) => normalizeToken(e) === n)) return true
  if (rule.keywords?.some((k) => n.includes(normalizeToken(k)))) return true
  if (rule.startsWith?.some((k) => n.startsWith(normalizeToken(k)))) return true
  if (rule.endsWith?.some((k) => n.endsWith(normalizeToken(k)))) return true
  if (rule.folders?.some((k) => f.includes(normalizeToken(k)))) return true
  if (rule.fieldTypes?.some((k) => t.includes(normalizeToken(k)))) return true

  return false
}

function ruleConfidence(
  name: string,
  type: string | undefined,
  folder: string | undefined,
  rule: FieldRule,
): 'high' | 'medium' | 'low' {
  const n = normalizeToken(name)
  const f = folder ? normalizeToken(folder) : ''
  const t = type ? normalizeToken(type) : ''

  // Exact match é sempre alta confiança.
  if (rule.exact?.some((e) => normalizeToken(e) === n)) return 'high'

  // Palavra-chave exata no nome (não só substring em palavra composta) é alta.
  const hasStrongKeyword = rule.keywords?.some((k) => {
    const nk = normalizeToken(k)
    return n === nk || n.includes(nk) && (n.startsWith(nk) || n.endsWith(nk) || /[0-9]/.test(n))
  })

  // Folder ou type corroborando aumenta confiança.
  const folderCorroborates = rule.folders && rule.folders.some((k) => f.includes(normalizeToken(k)))
  const typeCorroborates = rule.fieldTypes && rule.fieldTypes.some((k) => t.includes(normalizeToken(k)))

  if (hasStrongKeyword && (folderCorroborates || typeCorroborates)) return 'high'
  if (hasStrongKeyword) return 'medium'

  // StartsWith/endsWith com folder/type corroborando -> média.
  if ((rule.startsWith || rule.endsWith) && (folderCorroborates || typeCorroborates)) return 'medium'

  return 'low'
}

export function inferLogicalName(
  fieldName: string,
  fieldType?: string,
  folderName?: string,
): InferredField {
  if (!fieldName || typeof fieldName !== 'string') {
    return { logical_name: null, confidence: 'low', reason: 'Nome do campo ausente' }
  }

  const folderNorm = folderName ? normalizeToken(folderName) : ''

  // 1) Regras diretas.
  const matches: Array<{ rule: FieldRule; confidence: 'high' | 'medium' | 'low' }> = []
  for (const rule of FIELD_RULES) {
    if (matchesRule(fieldName, fieldType, folderName, rule)) {
      matches.push({ rule, confidence: ruleConfidence(fieldName, fieldType, folderName, rule) })
    }
  }

  if (matches.length > 0) {
    // Ordena por confiança, depois pela especificidade do match (menor nome lógico primeiro? maior score).
    matches.sort((a, b) => {
      const confidenceOrder = { high: 0, medium: 1, low: 2 }
      if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
        return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
      }
      return b.rule.logical_name.length - a.rule.logical_name.length
    })
    const best = matches[0]
    return {
      logical_name: best.rule.logical_name,
      confidence: best.confidence,
      reason: `Match heurístico com "${best.rule.logical_name}"${folderNorm ? ` (pasta "${folderName}")` : ''}`,
    }
  }

  // 2) Similaridade aproximada (Levenshtein) com os nomes lógicos e variações.
  let bestScore = 0
  let bestLogicalName: string | null = null

  for (const rule of FIELD_RULES) {
    const candidates = [
      rule.logical_name,
      rule.logical_name.replace(/_/g, ' '),
      ...(rule.exact ?? []),
      ...(rule.keywords ?? []),
    ]
    for (const candidate of candidates) {
      const score = similarityScore(fieldName, candidate)
      if (score > bestScore) {
        bestScore = score
        bestLogicalName = rule.logical_name
      }
    }
  }

  if (bestScore >= 0.85) {
    return {
      logical_name: bestLogicalName,
      confidence: 'medium',
      reason: `Similaridade aproximada (${Math.round(bestScore * 100)}%) com "${bestLogicalName}"`,
    }
  }
  if (bestScore >= 0.7) {
    return {
      logical_name: bestLogicalName,
      confidence: 'low',
      reason: `Similaridade fraca (${Math.round(bestScore * 100)}%) com "${bestLogicalName}"`,
    }
  }

  return {
    logical_name: null,
    confidence: 'low',
    reason: 'Nenhum match heurístico encontrado',
  }
}

// -------------------- Pipeline inference --------------------

interface KeywordCategory {
  category: GhlPipelineCategory
  keywords: string[]
  antiKeywords?: string[]
}

const PIPELINE_KEYWORDS: KeywordCategory[] = [
  {
    category: 'pre_vendas',
    keywords: [
      'prevenda', 'pre-venda', 'pre venda', 'sdr', 'mql', 'prospec', 'prospeccao',
      'qualificacao', 'inbound', 'outbound', 'discovery', 'qualifica', 'captacao',
    ],
  },
  {
    category: 'vendas',
    keywords: [
      'venda', 'vendas', 'closing', 'closer', 'sql', 'fechamento', 'negociacao',
      'negociacao', 'vendedor', 'comercial', 'deal', 'contrato',
    ],
    antiKeywords: ['prevenda', 'pre-venda', 'pre venda'],
  },
  {
    category: 'recuperacao',
    keywords: [
      'recuperacao', 'recuperação', 'recup', 'reengajamento', 'reengagement',
      'winback', 'win back', 'retencao', 'retenção', 'reativacao', 'reativação',
      'recall', 'recuperar',
    ],
  },
  {
    category: 'excluir',
    keywords: [
      'lixo', 'descart', 'descartados', 'descarte', 'arquiv', 'arquivados',
      'blacklist', 'spam', 'invalido', 'inválido', 'descarte', 'descartado',
    ],
  },
]

export function inferPipelineCategory(pipelineName: string): InferredPipeline {
  if (!pipelineName || typeof pipelineName !== 'string') {
    return { category: null, confidence: 'low', reason: 'Nome do pipeline ausente' }
  }

  const n = normalizeToken(pipelineName)

  for (const item of PIPELINE_KEYWORDS) {
    if (item.antiKeywords?.some((k) => n.includes(normalizeToken(k)))) continue
    if (item.keywords.some((k) => normalizeToken(k) === n)) {
      return {
        category: item.category,
        confidence: 'high',
        reason: `Match exato com categoria "${item.category}"`,
      }
    }
    if (item.keywords.some((k) => n.includes(normalizeToken(k)))) {
      return {
        category: item.category,
        confidence: 'medium',
        reason: `Palavra-chave identificada para "${item.category}"`,
      }
    }
  }

  // Se nenhuma palavra-chave, mas o nome é muito curto ou genérico, sugerimos outro com baixa confiança.
  if (n.length <= 4) {
    return { category: 'outro', confidence: 'low', reason: 'Nome muito curto/genérico, classificado como outro' }
  }

  return { category: null, confidence: 'low', reason: 'Nenhuma categoria identificada pelo nome' }
}

// -------------------- Stage inference --------------------

interface KeywordStage {
  stage: GhlSystemStage
  keywords: string[]
  antiKeywords?: string[]
}

const STAGE_KEYWORDS: KeywordStage[] = [
  {
    stage: 'novo',
    keywords: ['novo', 'new', 'lead', 'incoming', 'entrada', 'raw', 'novolead'],
  },
  {
    stage: 'conectado',
    keywords: ['conectado', 'conect', 'contactado', 'contact', 'respondido', 'reply', 'approached', 'abordado'],
  },
  {
    stage: 'agendado',
    keywords: ['agendado', 'agend', 'marcado', 'scheduled', 'booking', 'booked', 'marcada', 'agendamento'],
    antiKeywords: ['realizada', 'realizado', 'feito', 'held'],
  },
  {
    stage: 'reuniao_realizada',
    keywords: ['realizada', 'realizado', 'feito', 'done', 'held', 'completed', 'concluido', 'aconteceu', 'attended', 'compareceu'],
  },
  {
    stage: 'fechado',
    keywords: ['fechado', 'fechada', 'ganho', 'won', 'closedwon', 'venda', 'vendido', 'contrato', 'assinado', 'aprovado'],
    antiKeywords: ['perdido', 'lost', 'descartado'],
  },
  {
    stage: 'perdido',
    keywords: ['perdido', 'perdida', 'lost', 'descartado', 'descartada', 'nao venda', 'no sale', 'closedlost', 'desqualificado'],
  },
]

export function inferSystemStage(stageName: string): InferredStage {
  if (!stageName || typeof stageName !== 'string') {
    return { stage: null, confidence: 'low', reason: 'Nome do stage ausente' }
  }

  const n = normalizeToken(stageName)

  for (const item of STAGE_KEYWORDS) {
    if (item.antiKeywords?.some((k) => n.includes(normalizeToken(k)))) continue
    if (item.keywords.some((k) => normalizeToken(k) === n)) {
      return {
        stage: item.stage,
        confidence: 'high',
        reason: `Match exato com stage "${item.stage}"`,
      }
    }
    if (item.keywords.some((k) => n.includes(normalizeToken(k)))) {
      return {
        stage: item.stage,
        confidence: 'medium',
        reason: `Palavra-chave identificada para "${item.stage}"`,
      }
    }
  }

  return { stage: null, confidence: 'low', reason: 'Nenhum stage canônico identificado' }
}

export function getPipelineCategoryLabel(value: GhlPipelineCategory): string {
  return GHL_PIPELINE_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export function getSystemStageLabel(value: GhlSystemStage): string {
  return GHL_SYSTEM_STAGES.find((s) => s.value === value)?.label ?? value
}
