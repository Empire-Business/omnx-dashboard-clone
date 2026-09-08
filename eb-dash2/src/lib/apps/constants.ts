import {
  ShoppingCart,
  Radar,
  MessageCircle,
  BarChart2,
  TrendingUp,
  Bot,
  Target,
  Users,
  Palette,
  Send,
  type LucideIcon,
} from 'lucide-react'

export const ICON_MAP: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  radar: Radar,
  'message-circle': MessageCircle,
  'bar-chart-2': BarChart2,
  'trending-up': TrendingUp,
  bot: Bot,
  target: Target,
  users: Users,
  palette: Palette,
  send: Send,
}

export const APP_ROUTE: Record<string, string> = {
  'aquisicao-vendas': '/aquisicao?tab=visao-geral',
  trafego: '/trafego?tab=painel-cohort',
  traqueamento: '/traqueamento?tab=cods_utm',
  'pre-vendas': '/pre-vendas?tab=discagem',
  relatorios: '/relatorios?tab=cohort',
  'sdr-ia': '/sdr-ia?tab=auditoria',
  metas: '/metas?tab=overview',
  leads: '/leads?tab=lista',
  criativos: '/criativos?tab=ranking',
  disparos: '/disparos?tab=dashboard',
}
