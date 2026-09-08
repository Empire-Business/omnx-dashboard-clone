// Types for GHL multi-account mapping configuration UI
// Reference: docs/GHL-MAPEAMENTO-CAMPOS.md, docs/GHL-DISCOVERY.md

export interface GhlIntegrationSettings {
  id: string
  workspace_id: string
  ghl_location_id: string
  webhook_secret: string | null
  webhook_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GhlIntegrationSettingsInput {
  ghl_location_id: string
  webhook_secret?: string
  webhook_url?: string
  is_active?: boolean
}

export interface GhlFieldMapping {
  id: string
  workspace_id: string
  logical_name: string
  ghl_field_key: string | null
  ghl_field_id: string | null
  field_type: string | null
  variations: string[]
  is_required: boolean
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface GhlPipelineMapping {
  id: string
  workspace_id: string
  ghl_pipeline_id: string
  ghl_pipeline_name: string | null
  system_category: GhlPipelineCategory | null
  is_excluded: boolean
  created_at: string
  updated_at: string
}

export type GhlPipelineCategory = 'pre_vendas' | 'vendas' | 'recuperacao' | 'excluir' | 'outro'

export const GHL_PIPELINE_CATEGORIES: { value: GhlPipelineCategory; label: string }[] = [
  { value: 'pre_vendas', label: 'Pré-Vendas' },
  { value: 'vendas', label: 'Vendas' },
  { value: 'recuperacao', label: 'Recuperação' },
  { value: 'excluir', label: 'Ignorar (não importar dados)' },
  { value: 'outro', label: 'Outro' },
]

export interface GhlStageMapping {
  id: string
  workspace_id: string
  ghl_pipeline_id: string
  ghl_stage_id: string
  ghl_stage_name: string | null
  system_stage: GhlSystemStage | null
  created_at: string
  updated_at: string
}

export type GhlSystemStage = 'novo' | 'conectado' | 'agendado' | 'reuniao_realizada' | 'fechado' | 'perdido'

export const GHL_SYSTEM_STAGES: { value: GhlSystemStage; label: string }[] = [
  { value: 'novo', label: 'Novo' },
  { value: 'conectado', label: 'Conectado' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'reuniao_realizada', label: 'Reunião realizada' },
  { value: 'fechado', label: 'Fechado' },
  { value: 'perdido', label: 'Perdido' },
]

export interface GhlFieldMappingTemplate {
  id: string
  name: string
  logical_name: string
  ghl_field_key: string | null
  field_type: string | null
  variations: string[]
  is_required: boolean
  created_at: string
  updated_at: string
}

export interface GhlDiscoveryCustomField {
  id: string
  name: string
  key: string
  field_type: string
  placeholder: string | null
}

export interface GhlDiscoveryStage {
  id: string
  name: string
}

export interface GhlDiscoveryPipeline {
  id: string
  name: string
  stages: GhlDiscoveryStage[]
}

export interface GhlDiscoveryTag {
  id: string
  name: string
}

export interface GhlDiscoveryCalendar {
  id: string
  name: string
  type: string | null
}

export interface GhlDiscoveryUser {
  id: string
  name: string
  email: string | null
  role: string | null
}

export interface GhlDiscoveryFieldFolder {
  id: string
  name: string
  model: string | null
}

export interface GhlDiscoveryResult {
  contact_custom_fields: GhlDiscoveryCustomField[]
  opportunity_custom_fields: GhlDiscoveryCustomField[]
  pipelines: GhlDiscoveryPipeline[]
  tags: GhlDiscoveryTag[]
  calendars: GhlDiscoveryCalendar[]
  users: GhlDiscoveryUser[]
  field_folders: GhlDiscoveryFieldFolder[]
  errors: string[]
  status: 'success' | 'partial' | 'error'
  workspace_id: string
  location_id: string
  ghl_api_key_mask: string
}

export interface DiscoveryFieldRow {
  source: 'contact' | 'opportunity'
  id: string
  name: string
  key: string
  field_type: string
  placeholder: string | null
}

export interface DiscoveryStageRow {
  pipeline_id: string
  pipeline_name: string
  stage_id: string
  stage_name: string
}

export interface GhlMappingProposalField {
  ghl_field_key: string
  logical_name: string
  confidence: number
}

export interface GhlMappingProposalPipeline {
  ghl_pipeline_id: string
  system_category: GhlPipelineCategory
  confidence: number
}

export interface GhlMappingProposalStage {
  ghl_stage_id: string
  system_stage: GhlSystemStage
  confidence: number
}

export type GhlMappingOutcome = 'mapped' | 'not_in_vocabulary' | 'unclear'

export interface GhlMappingProposal {
  fields: GhlMappingProposalField[]
  pipelines: GhlMappingProposalPipeline[]
  stages: GhlMappingProposalStage[]
  explanation: string
  warnings: string[]
  outcome?: GhlMappingOutcome
}

export interface GhlMappingProposalResponse {
  proposal: GhlMappingProposal
  model_used: string
  discovery_summary: {
    fields_count: number
    pipelines_count: number
    stages_count: number
  }
}

export interface GhlMappingAssistantInput {
  workspace_id: string
  user_description: string
  discovery_result: GhlDiscoveryResult
  target: GhlAiMappingTarget
}

export interface GhlAiMappingTarget {
  kind: 'field'
  source: 'contact' | 'opportunity'
  key: string
}

export interface GhlInferredField {
  ghl_field_key: string
  logical_name: string | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface GhlInferredPipeline {
  ghl_pipeline_id: string
  system_category: GhlPipelineCategory | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface GhlInferredStage {
  ghl_pipeline_id: string
  ghl_stage_id: string
  system_stage: GhlSystemStage | null
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export interface GhlInferenceResult {
  fields: GhlInferredField[]
  pipelines: GhlInferredPipeline[]
  stages: GhlInferredStage[]
  stats: { high: number; medium: number; low: number }
}
