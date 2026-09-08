// Types for user management
// Reference: docs/DASHBOARD-CONTROLE-ACESSO.md

export type WorkspaceRole = 'owner' | 'admin' | 'member'

// ─── GHL Users ────────────────────────────────────────────────

export type GhlPapel = 'sdr' | 'closer' | 'social_seller' | 'gestor' | 'sistema'

export interface GhlUser {
  id: string
  ghl_id: string
  nome: string
  email: string | null
  role_ghl: string | null
  papeis: GhlPapel[]
  deleted: boolean
  auth_user_id: string | null
  clara_habilitado: boolean
  created_at: string
  updated_at: string
}

export const PAPEL_CONFIG: Record<GhlPapel, {
  label: string
  color: string
  bg: string
  defaultPermissions: string[]
}> = {
  sdr: {
    label: 'SDR',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.15)',
    defaultPermissions: ['pre_vendas'],
  },
  closer: {
    label: 'Closer',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.15)',
    defaultPermissions: ['leads', 'trafego'],
  },
  social_seller: {
    label: 'Social Seller',
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.15)',
    defaultPermissions: ['traqueamento.organico'],
  },
  gestor: {
    label: 'Gestor',
    color: '#9b5a00',
    bg: 'rgba(155,90,0,0.15)',
    defaultPermissions: ['dashboard', 'leads', 'pre_vendas', 'traqueamento'],
  },
  sistema: {
    label: 'Sistema',
    color: '#94a3b8',
    bg: 'rgba(148,163,184,0.15)',
    defaultPermissions: [],
  },
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  invited_by: string | null
  joined_at: string
  is_active: boolean
  clara_habilitado: boolean
  email?: string
  full_name?: string
  avatar_url?: string
}

export interface ModulePermission {
  id: string
  workspace_id: string
  user_id: string
  module_key: string
  can_view: boolean
  can_edit: boolean
  granted_by: string | null
  created_at: string
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'contains'
  | 'starts_with'
  | 'is_null'
  | 'is_not_null'

export type FilterLogic = 'AND' | 'OR'

export interface LeadFilterRule {
  table: 'contatos' | 'oportunidades'
  field: string
  operator: FilterOperator
  value: string | string[] | null
}

export interface LeadFilterConfig {
  logic: FilterLogic
  rules: LeadFilterRule[]
}

export interface LeadFilter {
  id: string
  workspace_id: string
  user_id: string
  filter_name: string | null
  filter_config: LeadFilterConfig
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ModuleNode {
  key: string
  label: string
  description?: string
  children?: ModuleNode[]
}

export const MODULE_TREE: ModuleNode[] = [
  {
    key: 'vendas',
    label: 'Vendas',
    description: 'Faturamento, closers e reuniões de vendas',
    children: [
      { key: 'vendas.geral', label: 'Visão Geral' },
      { key: 'vendas.matriz', label: 'Matriz' },
      { key: 'vendas.reunioes', label: 'Reuniões' },
    ],
  },
  {
    key: 'aquisicao',
    label: 'Aquisição',
    description: 'Visão completa de todas as fontes — pago, orgânico, direto e desconhecido',
  },
  {
    key: 'trafego',
    label: 'Tráfego',
    description: 'KPIs de mídia paga e funil de conversão (apenas tráfego pago)',
  },
  {
    key: 'traqueamento',
    label: 'Traqueamento',
    description: 'Módulo de rastreamento UTM',
    children: [
      {
        key: 'traqueamento.cods_utm',
        label: 'CODS UTM',
        children: [
          { key: 'traqueamento.cods_utm.slug_utm', label: 'Slug UTM' },
          { key: 'traqueamento.cods_utm.utm_source_ads', label: 'UTM Source ADS' },
          { key: 'traqueamento.cods_utm.utm_source_organico', label: 'UTM Source Orgânico' },
          { key: 'traqueamento.cods_utm.utm_campaign', label: 'UTM Campaign' },
          { key: 'traqueamento.cods_utm.utm_medium', label: 'UTM Medium' },
          { key: 'traqueamento.cods_utm.utm_term', label: 'UTM Term' },
          { key: 'traqueamento.cods_utm.objetivo_ads', label: 'Objetivo ADS' },
        ],
      },
      { key: 'traqueamento.origem', label: 'Origem' },
      {
        key: 'traqueamento.anuncios',
        label: 'Anúncios',
        children: [
          { key: 'traqueamento.anuncios.campanhas', label: 'Campanhas' },
          { key: 'traqueamento.anuncios.testes_criativos', label: 'Testes de Criativos' },
          { key: 'traqueamento.anuncios.catalogo_criativos', label: 'Catálogo de Criativos' },
          { key: 'traqueamento.anuncios.producao_notion', label: 'Produção Notion' },
          { key: 'traqueamento.anuncios.producao_direta', label: 'Produção Direta' },
        ],
      },
      {
        key: 'traqueamento.organico',
        label: 'Orgânico',
        children: [
          { key: 'traqueamento.organico.producao', label: 'Produção' },
          { key: 'traqueamento.organico.catalogo', label: 'Catálogo' },
        ],
      },
      { key: 'traqueamento.funis', label: 'Funis' },
    ],
  },
  {
    key: 'pre_vendas',
    label: 'Pré-Vendas',
    description: 'Performance do time de SDRs',
    children: [
      { key: 'pre_vendas.geral', label: 'Visão Geral' },
      { key: 'pre_vendas.sdrs', label: 'SDRs' },
      { key: 'pre_vendas.leads_parados', label: 'Leads Parados' },
    ],
  },
  {
    key: 'recuperacao',
    label: 'Recuperação',
    description: 'Reativação de leads antigos',
    children: [
      { key: 'recuperacao.geral', label: 'Visão Geral' },
      { key: 'recuperacao.sdrs', label: 'SDRs' },
      { key: 'recuperacao.leads_parados', label: 'Leads Parados' },
    ],
  },
  {
    key: 'metas',
    label: 'Metas',
    description: 'Gestão de metas e acompanhamento de performance',
    children: [
      { key: 'metas.overview', label: 'Visão Geral' },
      { key: 'metas.tracking', label: 'Acompanhamento' },
      { key: 'metas.registry', label: 'Cadastro' },
      { key: 'metas.history', label: 'Histórico' },
    ],
  },
  {
    key: 'leads',
    label: 'Leads',
    description: 'Listagem e detalhamento de leads',
    children: [
      { key: 'leads.lista', label: 'Lista' },
      { key: 'leads.limpeza', label: 'Limpeza' },
    ],
  },
  // Os 5 módulos abaixo faltavam nesta árvore legada (adicionados em
  // 2026-07-05, auditoria) — só existiam em APP_CATALOG/FEATURES_CATALOG
  // (eb-dash2/src/lib/apps/features.ts), usados pela tela nova de
  // permissões (AdminPermissionsPage/WorkspaceUserDetailPage). Sem essas
  // entradas, a tela antiga de permissões por usuário não permitia
  // conceder acesso a esses apps.
  {
    key: 'organico',
    label: 'Orgânico',
    description: 'Visão geral de canais orgânicos',
  },
  {
    key: 'criativos',
    label: 'Criativos',
    description: 'Ranking, biblioteca, produção e testes de criativos',
    children: [
      { key: 'criativos.dashboard', label: 'Dashboard' },
      { key: 'criativos.ranking', label: 'Ranking' },
      { key: 'criativos.biblioteca', label: 'Biblioteca' },
      { key: 'criativos.kanban', label: 'Kanban' },
      { key: 'criativos.testes', label: 'Testes' },
    ],
  },
  {
    key: 'sdr-ia',
    label: 'SDR IA',
    description: 'Auditoria da SDR de inteligência artificial',
    children: [
      { key: 'sdr-ia.auditoria-ia', label: 'Auditoria IA' },
      { key: 'sdr-ia.configuracao', label: 'Configuração' },
    ],
  },
  {
    key: 'relatorios',
    label: 'Relatórios',
    description: 'Relatórios semanais consolidados',
    children: [
      { key: 'relatorios.cohort', label: 'Cohort' },
      { key: 'relatorios.produtividade', label: 'Produtividade' },
      { key: 'relatorios.comparativo', label: 'Comparativo' },
      { key: 'relatorios.tendencias', label: 'Tendências' },
    ],
  },
  {
    key: 'disparos',
    label: 'Campanhas WhatsApp',
    description: 'Campanhas de disparo no WhatsApp mensuradas por tags configuráveis',
    children: [
      { key: 'disparos.dashboard', label: 'Dashboard' },
      { key: 'disparos.configuracao', label: 'Configuração' },
    ],
  },
]

// Helper: check permission with parent inheritance
export function hasModulePermission(
  permissions: ModulePermission[],
  moduleKey: string,
  requireEdit = false
): boolean {
  const exact = permissions.find((p) => p.module_key === moduleKey)
  if (exact) return requireEdit ? exact.can_edit : exact.can_view

  const parts = moduleKey.split('.')
  for (let i = parts.length - 1; i > 0; i--) {
    const parentKey = parts.slice(0, i).join('.')
    const parent = permissions.find((p) => p.module_key === parentKey)
    if (parent) return requireEdit ? parent.can_edit : parent.can_view
  }

  return false
}

// Helper: get visible modules for user
export function getVisibleModules(
  permissions: ModulePermission[],
  modules: ModuleNode[] = MODULE_TREE
): ModuleNode[] {
  return modules
    .filter((module) => {
      if (hasModulePermission(permissions, module.key)) return true
      if (module.children) {
        return getVisibleModules(permissions, module.children).length > 0
      }
      return false
    })
    .map((module) => ({
      ...module,
      children: module.children
        ? getVisibleModules(permissions, module.children)
        : undefined,
    }))
}
