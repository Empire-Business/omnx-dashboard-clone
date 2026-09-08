export type CreativeSource = 'notion' | 'native' | 'import'

export type CreativeStatus =
  | 'ideia'
  | 'roteiro'
  | 'produzindo'
  | 'revisao'
  | 'ajustes'
  | 'aprovado'
  | 'reprovado'
  | 'pronto'
  | 'em_teste'
  | 'testado'
  | 'escalar'
  | 'arquivado'

export type CreativeFormat = 'reels' | 'static' | 'carousel' | 'stories' | 'video' | 'other'

export type TestResult = 'approved' | 'rejected' | 'pending' | 'scale' | 'kill' | null

export interface NotionCreative {
  id: string
  workspace_id: string
  notion_page_id: string | null
  database_type: 'paid' | 'organic'
  external_id: string | null
  source: CreativeSource
  name: string | null
  status: string | null
  available_date: string | null
  format: string | null
  cta_objective: string | null
  videos_folder_url: string | null
  final_asset_url: string | null
  post_url: string | null
  profile: string | null
  raw_properties: Record<string, unknown> | null
  synced_at: string | null
  created_at: string
  updated_at: string
  objective: string | null
  social_network: string | null
  micro_program: string | null
  copy_text: string | null
  ad_caption: string | null
  hook_text: string | null
  cta_text: string | null
  content_pillar: string | null
  funnel_stage: string | null
  created_by: string | null
  assigned_to: string | null
  priority: string | null
  tags: string[] | null
  raw_asset_url: string | null
  creative_tested: boolean
  test_started_at: string | null
  test_ended_at: string | null
  test_status: string | null
  test_result: string | null
  aprovado: boolean | null
  data_avaliacao: string | null
  cpl_value: number | null
  observations: string | null
  budget_spent: number | null
  campaign_id: string | null
  creative_type: string | null
  mvp_status: string | null
  learning: string | null
}

export interface CreativeTest {
  id: string
  workspace_id: string
  creative_id: string
  name: string | null
  hypothesis: string | null
  status: string | null
  start_date: string | null
  end_date: string | null
  budget: number | null
  budget_allocated: number | null
  budget_spent: number | null
  leads_meta: number | null
  leads_crm: number | null
  mql_count: number | null
  sales_count: number | null
  revenue: number | null
  cpl_meta: number | null
  cpl_crm: number | null
  cpmql: number | null
  result: TestResult
  result_reason: string | null
  observations: string | null
  decided_by: string | null
  decided_at: string | null
  created_by: string | null
  criteria_id: string | null
  control_creative_id: string | null
  variant_creative_id: string | null
  winner_creative_id: string | null
  created_at: string
  updated_at: string
}

export interface CreativeTestCriteria {
  id: string
  workspace_id: string
  cpl_target: number | null
  budget_min: number | null
  budget_max: number | null
  window_min_days: number | null
  window_max_days: number | null
  early_stop_threshold: number | null
  early_stop_spend: number | null
  no_lead_max_days: number | null
  weekly_goal_reels: number | null
  weekly_goal_static: number | null
  weekly_goal_carousel: number | null
  weekly_goal_stories: number | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface WorkspaceCreativeSettings {
  creative_review_day?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'
  creative_review_time?: string
  default_criteria_id?: string
  dashboard_kpis?: string[]
}

// Campos que o formulário "Novo Criativo" realmente escreve.
// Reunião de 2026-08-28: saíram daqui `hook_text` (MEL-04), `cta_text` (MEL-05),
// `creative_type` (MEL-03), `mvp_status` (MEL-06) e `campaign_id` (MEL-01) — as colunas
// continuam existindo no banco e em `NotionCreative`, mas o formulário deixou de escrevê-las
// para não sobrescrever o histórico com null a cada edição.
export interface CreativeFormInput {
  name: string
  format: string | null
  /** Campanha do criativo (MEL-01). É onde o sync do Notion grava a campanha real. */
  objective: string | null
  profile: string | null
  social_network: string | null
  /** Texto da postagem (MEL-07). */
  copy_text: string | null
  /** Texto exibido acima do criativo no anúncio veiculado (MEL-08). */
  ad_caption: string | null
  content_pillar: string | null
  funnel_stage: string | null
  observations: string | null
  videos_folder_url: string | null
  final_asset_url: string | null
  raw_asset_url: string | null
  /** Status inicial escolhido no cadastro (MEL-19). Vazio/ausente = 'ideia'. */
  status?: string | null
}

export interface CreativeStatusCount {
  status: string
  total: number
  from_notion: number
  from_native: number
}

export const CREATIVE_STATUSES: { value: CreativeStatus; label: string }[] = [
  { value: 'ideia', label: 'Ideia' },
  { value: 'roteiro', label: 'Roteiro' },
  { value: 'produzindo', label: 'Produzindo' },
  { value: 'revisao', label: 'Revisão' },
  { value: 'ajustes', label: 'Ajustes' },
  { value: 'aprovado', label: 'Aprovado' },
  { value: 'reprovado', label: 'Reprovado' },
  { value: 'pronto', label: 'Pronto' },
  { value: 'em_teste', label: 'Em Teste' },
  { value: 'testado', label: 'Testado' },
  { value: 'escalar', label: 'Escalar' },
  { value: 'arquivado', label: 'Arquivado' },
]

export type CreativeApprovalTag =
  | 'roteiro-em-aprovacao'
  | 'roteiro-aprovado'
  | 'revisao-solicitada'
  | 'edicao-em-aprovacao'
  | 'edicao-aprovada'

export const CREATIVE_APPROVAL_TAGS: { value: CreativeApprovalTag; label: string }[] = [
  { value: 'roteiro-em-aprovacao', label: 'Roteiro em aprovação' },
  { value: 'roteiro-aprovado', label: 'Roteiro aprovado' },
  { value: 'revisao-solicitada', label: 'Revisão solicitada' },
  { value: 'edicao-em-aprovacao', label: 'Edição em aprovação' },
  { value: 'edicao-aprovada', label: 'Edição aprovada' },
]

export function getApprovalTagLabel(tag: string): string {
  return CREATIVE_APPROVAL_TAGS.find((t) => t.value === tag)?.label ?? tag
}

export function getApprovalTagVariant(tag: string): 'default' | 'secondary' | 'success' | 'warning' | 'destructive' {
  if (tag.includes('aprovado')) return 'success'
  if (tag.includes('revisao')) return 'destructive'
  if (tag.includes('aprovacao')) return 'warning'
  return 'default'
}
