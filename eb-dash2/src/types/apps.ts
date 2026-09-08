// Types for workspace sub-apps
// Reference: docs/SUB-APPS-MODULARES.md

export type AppBadge = 'novo' | 'beta' | 'popular' | null

export type AppCategory =
  | 'vendas'
  | 'marketing'
  | 'operacao'
  | 'inteligencia'
  | 'comunicacao'

export interface AppCatalogItem {
  slug: string
  label: string
  icon: string
  description: string
  category: AppCategory
  badge?: AppBadge
  tags?: string[]
  /**
   * App oculto: continua existindo (rota, permissões, dados), mas não aparece
   * no Hub de apps, na App Store nem na sidebar. Usado para módulos legados
   * que ainda não foram removidos. Ver docs/SUB-APPS-MODULARES.md.
   */
  hidden?: boolean
}

export const APP_CATALOG: ReadonlyArray<AppCatalogItem> = [
  {
    slug: 'aquisicao-vendas',
    label: 'Aquisição & Vendas',
    icon: 'shopping-cart',
    description: 'Funil completo de aquisição, vendas e acompanhamento de receita.',
    category: 'vendas',
    badge: 'popular',
    tags: ['funil', 'vendas', 'receita'],
  },
  {
    slug: 'trafego',
    label: 'Tráfego',
    icon: 'trending-up',
    description: 'Análise de campanhas, criativos, cohort e produtividade do tráfego pago.',
    category: 'marketing',
    tags: ['ads', 'meta', 'cohort'],
  },
  {
    slug: 'traqueamento',
    label: 'Traqueamento',
    icon: 'radar',
    description: 'UTMs, origens, funis e anúncios — tudo sobre rastreamento de leads.',
    category: 'marketing',
    tags: ['utm', 'tracking', 'analytics'],
  },
  {
    slug: 'pre-vendas',
    label: 'Pré-Vendas',
    icon: 'message-circle',
    description: 'Discador, follow-up, no-shows e qualificação de MQLs.',
    category: 'operacao',
    tags: ['sdr', 'discador', 'mql'],
  },
  {
    slug: 'relatorios',
    label: 'Relatórios',
    icon: 'bar-chart-2',
    description: 'Relatórios semanais consolidados por módulo e indicadores-chave.',
    category: 'inteligencia',
    tags: ['relatorio', 'kpi', 'semanal'],
    // Oculto desde 2026-08-04: a configuração da Clara migrou para
    // /workspace/clara (Administração). A rota /relatorios segue viva.
    hidden: true,
  },
  {
    slug: 'sdr-ia',
    label: 'SDR IA',
    icon: 'bot',
    description: 'Auditoria e supervisão da SDR IA Clara e seus atendimentos.',
    category: 'inteligencia',
    badge: 'beta',
    tags: ['ia', 'clara', 'auditoria'],
  },
  {
    slug: 'metas',
    label: 'Metas',
    icon: 'target',
    description: 'Definição e acompanhamento de metas por indicador e período.',
    category: 'inteligencia',
    tags: ['meta', 'kpi', 'performance'],
  },
  {
    slug: 'leads',
    label: 'Leads',
    icon: 'users',
    description: 'Base unificada de leads, limpeza, qualificação e histórico.',
    category: 'operacao',
    tags: ['leads', 'crm', 'contatos'],
  },
  {
    slug: 'criativos',
    label: 'Criativos',
    icon: 'palette',
    description: 'Biblioteca, ranking, kanban e dashboard de criativos de anúncios.',
    category: 'marketing',
    badge: 'novo',
    tags: ['criativos', 'ads', 'kanban'],
  },
  {
    slug: 'disparos',
    label: 'Campanhas WhatsApp',
    icon: 'send',
    description: 'Campanhas de disparo no WhatsApp por tags, com acompanhamento de respostas.',
    category: 'comunicacao',
    tags: ['whatsapp', 'disparo', 'campanha'],
  },
]

export type AppSlug = (typeof APP_CATALOG)[number]['slug']

/** Slugs marcados como `hidden` no catálogo. */
export const HIDDEN_APP_SLUGS: ReadonlySet<string> = new Set(
  APP_CATALOG.filter((app) => app.hidden).map((app) => app.slug)
)

export function isHiddenApp(slug: string): boolean {
  return HIDDEN_APP_SLUGS.has(slug)
}

export interface WorkspaceApp {
  slug: string
  label: string
  icon: string
  is_active: boolean
  allowed: boolean
}

export interface WorkspaceAppRecord {
  id: string
  workspace_id: string
  app_slug: string
  is_active: boolean
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface AppRolePermission {
  id: string
  workspace_id: string
  app_slug: string
  role: string
  can_view: boolean
  created_at: string
}

export interface AppUserOverride {
  id: string
  workspace_id: string
  app_slug: string
  user_id: string
  can_view: boolean
  granted_by: string | null
  created_at: string
  updated_at: string
}
