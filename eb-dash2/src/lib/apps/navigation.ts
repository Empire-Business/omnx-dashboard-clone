import {
  Globe,
  DollarSign,
  Leaf,
  LayoutDashboard,
  Target,
  PhoneCall,
  RefreshCw,
  ClipboardList,
  FileBarChart,
  Bot,
  Users,
  TrendingUp,
  TableProperties,
  List,
  CalendarDays,
  Star,
  Trophy,
  Share2,
  BarChart3,
  Megaphone,
  GitBranch,
  CalendarRange,
  Activity,
  CalendarCheck,
  AlertCircle,
  Layers3,
  History,
  ArrowLeftRight,
  Trash2,
  Palette,
  Library,
  LayoutGrid,
  FlaskConical,
  Send,
  Settings,
  FileText,
} from 'lucide-react'
import type { AppSlug } from '@/types/apps'

export type NavChild = {
  title: string
  href: string
  icon: React.ElementType
  moduleKey?: string
  featureKey?: string
}

export type NavItem = {
  title: string
  href: string
  icon: React.ElementType
  moduleKey?: string
  featureKey?: string
  children?: NavChild[]
}

const ICONS = {
  Globe,
  DollarSign,
  Leaf,
  LayoutDashboard,
  Target,
  PhoneCall,
  RefreshCw,
  ClipboardList,
  FileBarChart,
  Bot,
  Users,
  TrendingUp,
  TableProperties,
  List,
  CalendarDays,
  Star,
  Trophy,
  Share2,
  BarChart3,
  Megaphone,
  GitBranch,
  CalendarRange,
  Activity,
  CalendarCheck,
  AlertCircle,
  Layers3,
  History,
  ArrowLeftRight,
  Trash2,
  Palette,
  Library,
  LayoutGrid,
  FlaskConical,
  Send,
  Settings,
  FileText,
}

const AquisicaoVendasNav: NavItem[] = [
  {
    title: 'Aquisição',
    href: '/aquisicao',
    icon: ICONS.Globe,
    moduleKey: 'aquisicao',
    featureKey: 'aquisicao',
    children: [
      { title: 'Visão Geral', href: '/aquisicao?tab=visao-geral', icon: ICONS.TrendingUp, featureKey: 'aquisicao' },
      { title: 'Matriz', href: '/aquisicao?tab=matriz', icon: ICONS.TableProperties, featureKey: 'aquisicao' },
      { title: 'Leads', href: '/aquisicao?tab=leads', icon: ICONS.List, featureKey: 'aquisicao' },
    ],
  },
  {
    title: 'Vendas',
    href: '/vendas',
    icon: ICONS.DollarSign,
    moduleKey: 'vendas',
    featureKey: 'vendas',
    children: [
      { title: 'Visão Geral', href: '/vendas?tab=geral', icon: ICONS.TrendingUp, featureKey: 'vendas' },
      { title: 'Matriz', href: '/vendas?tab=matriz', icon: ICONS.TableProperties, featureKey: 'vendas' },
      { title: 'Reuniões', href: '/vendas?tab=reunioes', icon: ICONS.CalendarDays, featureKey: 'vendas' },
      { title: 'Cami', href: '/vendas?tab=cami', icon: ICONS.Star, featureKey: 'vendas' },
    ],
  },
  {
    title: 'Orgânico',
    href: '/organico',
    icon: ICONS.Leaf,
    moduleKey: 'organico',
    featureKey: 'organico',
    children: [
      { title: 'Visão Geral', href: '/organico?tab=visao-geral', icon: ICONS.TrendingUp, featureKey: 'organico' },
      { title: 'Matriz', href: '/organico?tab=matriz', icon: ICONS.TableProperties, featureKey: 'organico' },
      { title: 'Leads', href: '/organico?tab=leads', icon: ICONS.Users, featureKey: 'organico' },
      { title: 'Meta MQL', href: '/organico?tab=meta', icon: ICONS.Target, featureKey: 'organico' },
      { title: 'Investimentos', href: '/organico?modal=investimentos', icon: ICONS.DollarSign, featureKey: 'organico' },
    ],
  },
]

const TrafegoAppNav: NavItem[] = [
  {
    title: 'Tráfego',
    href: '/trafego',
    icon: ICONS.LayoutDashboard,
    moduleKey: 'trafego',
    featureKey: 'visao-geral',
    children: [
      { title: 'Visão Geral', href: '/trafego?tab=painel-cohort', icon: ICONS.TrendingUp, featureKey: 'visao-geral' },
      { title: 'Matriz', href: '/trafego?tab=matriz', icon: ICONS.TableProperties, featureKey: 'matriz' },
      { title: 'Ranking Criativos', href: '/trafego?tab=criativos', icon: ICONS.Trophy, featureKey: 'ranking-criativos' },
      { title: 'Leads', href: '/trafego?tab=leads', icon: ICONS.List, featureKey: 'leads' },
    ],
  },
]

const TraqueamentoNav: NavItem[] = [
  {
    title: 'Traqueamento',
    href: '/traqueamento',
    icon: ICONS.Target,
    moduleKey: 'traqueamento',
    featureKey: 'cods-utm',
    children: [
      { title: 'CODS UTM', href: '/traqueamento?tab=cods_utm', icon: ICONS.Share2, featureKey: 'cods-utm' },
      { title: 'Origem', href: '/traqueamento?tab=origem', icon: ICONS.BarChart3, featureKey: 'origem' },
      { title: 'Anúncios', href: '/traqueamento?tab=anuncios', icon: ICONS.Megaphone, featureKey: 'anuncios' },
      { title: 'Orgânico', href: '/traqueamento?tab=organico', icon: ICONS.Users, featureKey: 'organico' },
      { title: 'Funis', href: '/traqueamento?tab=funis', icon: ICONS.GitBranch, featureKey: 'funis' },
    ],
  },
]

const PreVendasNav: NavItem[] = [
  {
    title: 'Pré-Vendas',
    href: '/pre-vendas',
    icon: ICONS.PhoneCall,
    moduleKey: 'pre_vendas',
    featureKey: 'discagem',
    children: [
      { title: 'Discagem', href: '/pre-vendas?tab=discagem', icon: ICONS.PhoneCall, featureKey: 'discagem' },
      { title: 'Agendamentos', href: '/pre-vendas?tab=agendamentos', icon: ICONS.CalendarRange, featureKey: 'agendamentos' },
      { title: 'Atividades', href: '/pre-vendas?tab=atividades', icon: ICONS.Activity, featureKey: 'atividades' },
      { title: 'MQLs', href: '/pre-vendas?tab=mqls', icon: ICONS.Target, featureKey: 'mqls' },
      { title: 'SDRs', href: '/pre-vendas?tab=sdrs', icon: ICONS.Users, featureKey: 'sdr-leaderboard' },
      { title: 'Auto Agendados', href: '/pre-vendas?tab=auto_agendados', icon: ICONS.CalendarCheck, featureKey: 'auto-agendados' },
      { title: 'Leads Parados', href: '/pre-vendas?tab=leads_parados', icon: ICONS.AlertCircle, featureKey: 'leads-parados' },
    ],
  },
  {
    title: 'Recuperação',
    href: '/recuperacao',
    icon: ICONS.RefreshCw,
    moduleKey: 'recuperacao',
    featureKey: 'recuperacao',
    children: [
      { title: 'Discagem', href: '/recuperacao?tab=discagem', icon: ICONS.PhoneCall, featureKey: 'recuperacao' },
      { title: 'Visão Geral', href: '/recuperacao?tab=geral', icon: ICONS.BarChart3, featureKey: 'recuperacao' },
      { title: 'SDRs', href: '/recuperacao?tab=sdrs', icon: ICONS.Users, featureKey: 'recuperacao' },
      { title: 'MQLs', href: '/recuperacao?tab=mqls', icon: ICONS.Target, featureKey: 'recuperacao' },
      { title: 'Auto Agendados', href: '/recuperacao?tab=auto_agendados', icon: ICONS.CalendarCheck, featureKey: 'recuperacao' },
      { title: 'Leads Parados', href: '/recuperacao?tab=leads_parados', icon: ICONS.AlertCircle, featureKey: 'recuperacao' },
    ],
  },
]

const MetasNav: NavItem[] = [
  {
    title: 'Metas',
    href: '/metas',
    icon: ICONS.ClipboardList,
    moduleKey: 'metas',
    featureKey: 'overview',
    children: [
      { title: 'Visão Geral', href: '/metas?tab=overview', icon: ICONS.TrendingUp, featureKey: 'overview' },
      { title: 'Acompanhamento', href: '/metas?tab=tracking', icon: ICONS.BarChart3, featureKey: 'tracking' },
      { title: 'Metas', href: '/metas?tab=registry', icon: ICONS.Layers3, featureKey: 'registry' },
      { title: 'Histórico', href: '/metas?tab=history', icon: ICONS.History, featureKey: 'history' },
    ],
  },
]

const RelatoriosNav: NavItem[] = [
  {
    title: 'Relatórios',
    href: '/relatorios',
    icon: ICONS.FileBarChart,
    moduleKey: 'relatorios',
    featureKey: 'cohort',
    children: [
      { title: 'Cohort', href: '/relatorios?tab=cohort', icon: ICONS.Users, featureKey: 'cohort' },
      { title: 'Produtividade', href: '/relatorios?tab=produtividade', icon: ICONS.BarChart3, featureKey: 'produtividade' },
      { title: 'Comparativo', href: '/relatorios?tab=comparativo', icon: ICONS.ArrowLeftRight, featureKey: 'comparativo' },
      { title: 'Tendências', href: '/relatorios?tab=tendencias', icon: ICONS.TrendingUp, featureKey: 'tendencias' },
      { title: 'Automações', href: '/relatorios?tab=automacoes', icon: ICONS.Send, featureKey: 'automacoes' },
      // "Configurar Clara" saiu daqui em 2026-08-04 → /workspace/clara (Administração)
    ],
  },
]

const SdrIaNav: NavItem[] = [
  {
    title: 'SDR IA',
    href: '/sdr-ia',
    icon: ICONS.Bot,
    moduleKey: 'sdr-ia',
    featureKey: 'auditoria-ia',
    children: [
      { title: 'Auditoria IA', href: '/sdr-ia?tab=auditoria', icon: ICONS.Bot, featureKey: 'auditoria-ia' },
      { title: 'Configuração', href: '/sdr-ia?tab=configuracao', icon: ICONS.Settings, featureKey: 'configuracao' },
    ],
  },
]

const LeadsNav: NavItem[] = [
  {
    title: 'Leads',
    href: '/leads',
    icon: ICONS.Users,
    moduleKey: 'leads',
    featureKey: 'lista',
    children: [
      { title: 'Lista', href: '/leads?tab=lista', icon: ICONS.BarChart3, featureKey: 'lista' },
      { title: 'Limpeza', href: '/leads?tab=limpeza', icon: ICONS.Trash2, featureKey: 'limpeza' },
    ],
  },
  {
    title: 'Inscrições de integrações',
    href: '/leads?tab=inscricoes',
    icon: ICONS.FileText,
    moduleKey: 'leads',
    featureKey: 'inscricoes',
  },
]

const CriativosNav: NavItem[] = [
  {
    title: 'Criativos',
    href: '/criativos',
    icon: ICONS.Palette,
    moduleKey: 'criativos',
    featureKey: 'dashboard',
    children: [
      { title: 'Dashboard', href: '/criativos?tab=dashboard', icon: ICONS.LayoutDashboard, featureKey: 'dashboard' },
      { title: 'Ranking', href: '/criativos?tab=ranking', icon: ICONS.Trophy, featureKey: 'ranking' },
      { title: 'Biblioteca', href: '/criativos?tab=biblioteca', icon: ICONS.Library, featureKey: 'biblioteca' },
      { title: 'Kanban', href: '/criativos?tab=kanban', icon: ICONS.LayoutGrid, featureKey: 'kanban' },
      { title: 'Testes', href: '/criativos?tab=testes', icon: ICONS.FlaskConical, featureKey: 'testes' },
    ],
  },
]

const DisparosNav: NavItem[] = [
  {
    title: 'Campanhas WhatsApp',
    href: '/disparos',
    icon: ICONS.Send,
    moduleKey: 'disparos',
    featureKey: 'dashboard',
    children: [
      { title: 'Dashboard', href: '/disparos?tab=dashboard', icon: ICONS.BarChart3, featureKey: 'dashboard' },
      { title: 'Configuração', href: '/disparos?tab=configuracao', icon: ICONS.Settings, featureKey: 'configuracao' },
    ],
  },
]

export const APP_NAVIGATION: Record<AppSlug, NavItem[]> = {
  'aquisicao-vendas': AquisicaoVendasNav,
  trafego: TrafegoAppNav,
  traqueamento: TraqueamentoNav,
  'pre-vendas': PreVendasNav,
  relatorios: RelatoriosNav,
  'sdr-ia': SdrIaNav,
  metas: MetasNav,
  leads: LeadsNav,
  criativos: CriativosNav,
  disparos: DisparosNav,
}

export function resolveAppSlugByPathname(pathname: string): AppSlug | null {
  if (
    pathname.startsWith('/aquisicao') ||
    pathname.startsWith('/vendas') ||
    pathname.startsWith('/organico')
  ) {
    return 'aquisicao-vendas'
  }
  if (pathname.startsWith('/trafego')) return 'trafego'
  if (pathname.startsWith('/traqueamento')) return 'traqueamento'
  if (pathname.startsWith('/pre-vendas') || pathname.startsWith('/recuperacao')) return 'pre-vendas'
  if (pathname.startsWith('/relatorios')) return 'relatorios'
  if (pathname.startsWith('/metas')) return 'metas'
  if (pathname.startsWith('/leads')) return 'leads'
  if (pathname.startsWith('/sdr-ia')) return 'sdr-ia'
  if (pathname.startsWith('/criativos')) return 'criativos'
  if (pathname.startsWith('/disparos')) return 'disparos'
  return null
}

export function getNavigationByPathname(pathname: string): NavItem[] | undefined {
  const slug = resolveAppSlugByPathname(pathname)
  if (!slug) return undefined
  return APP_NAVIGATION[slug]
}

// Mapeia module_key legado (ex: "pre_vendas.sdrs") para appSlug + featureKey
export function resolveModuleKey(moduleKey: string): { appSlug: AppSlug; featureKey: string } | null {
  const mapping: Record<string, { appSlug: AppSlug; featureKey: string }> = {
    'vendas': { appSlug: 'aquisicao-vendas', featureKey: 'vendas' },
    'aquisicao': { appSlug: 'aquisicao-vendas', featureKey: 'aquisicao' },
    'organico': { appSlug: 'aquisicao-vendas', featureKey: 'organico' },
    'trafego': { appSlug: 'trafego', featureKey: 'visao-geral' },
    'traqueamento': { appSlug: 'traqueamento', featureKey: 'cods-utm' },
    'traqueamento.cods_utm': { appSlug: 'traqueamento', featureKey: 'cods-utm' },
    'traqueamento.origem': { appSlug: 'traqueamento', featureKey: 'origem' },
    'traqueamento.anuncios': { appSlug: 'traqueamento', featureKey: 'anuncios' },
    'traqueamento.organico': { appSlug: 'traqueamento', featureKey: 'organico' },
    'traqueamento.funis': { appSlug: 'traqueamento', featureKey: 'funis' },
    'pre_vendas': { appSlug: 'pre-vendas', featureKey: 'discagem' },
    'pre_vendas.sdrs': { appSlug: 'pre-vendas', featureKey: 'sdr-leaderboard' },
    'recuperacao': { appSlug: 'pre-vendas', featureKey: 'recuperacao' },
    'metas': { appSlug: 'metas', featureKey: 'overview' },
    'relatorios': { appSlug: 'relatorios', featureKey: 'cohort' },
    'sdr-ia': { appSlug: 'sdr-ia', featureKey: 'auditoria-ia' },
    'leads': { appSlug: 'leads', featureKey: 'lista' },
    'criativos': { appSlug: 'criativos', featureKey: 'dashboard' },
    'disparos': { appSlug: 'disparos', featureKey: 'dashboard' },
    'inscricoes': { appSlug: 'leads', featureKey: 'inscricoes' },
  }

  // Procura correspondência exata ou pelo prefixo
  if (mapping[moduleKey]) return mapping[moduleKey]

  const parts = moduleKey.split('.')
  for (let i = parts.length; i > 0; i--) {
    const prefix = parts.slice(0, i).join('.')
    if (mapping[prefix]) return mapping[prefix]
  }

  return null
}
