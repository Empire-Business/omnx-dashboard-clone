export interface AppFeature {
  key: string
  label: string
  description: string
  defaultRoles: string[]
  defaultEditRoles?: string[]
}

export const FEATURES_CATALOG: Record<string, AppFeature[]> = {
  'aquisicao-vendas': [
    {
      key: 'aquisicao',
      label: 'Aquisição',
      description: 'Visão geral de aquisição de leads',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'vendas',
      label: 'Vendas',
      description: 'Faturamento, closers e reuniões de vendas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'organico',
      label: 'Orgânico',
      description: 'Visão geral de canais orgânicos',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'dados-financeiros',
      label: 'Dados Financeiros',
      description: 'Ver faturamento, caixa e ROAS',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
  ],
  'trafego': [
    {
      key: 'visao-geral',
      label: 'Visão Geral',
      description: 'Painel cohort e KPIs de tráfego',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'matriz',
      label: 'Matriz',
      description: 'Matriz de tráfego pago',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'ranking-criativos',
      label: 'Ranking de Criativos',
      description: 'Ranking de criativos do painel de tráfego',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'leads',
      label: 'Leads',
      description: 'Listagem de leads do tráfego',
      defaultRoles: ['owner', 'admin', 'member'],
    },
  ],
  'traqueamento': [
    {
      key: 'cods-utm',
      label: 'CODS UTM',
      description: 'Gerenciamento de códigos UTM',
      defaultRoles: ['owner', 'admin', 'member'],
      defaultEditRoles: ['owner', 'admin'],
    },
    {
      key: 'origem',
      label: 'Origem',
      description: 'Análise de origem do tráfego',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'anuncios',
      label: 'Anúncios',
      description: 'Campanhas, conjuntos e anúncios',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'organico',
      label: 'Orgânico',
      description: 'Produção e catálogo orgânico',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'funis',
      label: 'Funis',
      description: 'Mapeamento de funis',
      defaultRoles: ['owner', 'admin', 'member'],
      defaultEditRoles: ['owner', 'admin'],
    },
  ],
  'pre-vendas': [
    {
      key: 'discagem',
      label: 'Discagem',
      description: 'Fila de discagem de pré-vendas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'agendamentos',
      label: 'Agendamentos',
      description: 'Agendamentos de reuniões',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'atividades',
      label: 'Atividades',
      description: 'Atividades do time de pré-vendas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'mqls',
      label: 'MQLs',
      description: 'Visão de MQLs',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'sdr-leaderboard',
      label: 'Leaderboard de SDRs',
      description: 'Ver ranking e métricas de performance por SDR',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'auto-agendados',
      label: 'Auto Agendados',
      description: 'Leads com auto agendamento',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'leads-parados',
      label: 'Leads Parados',
      description: 'Leads parados em pré-vendas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'auditoria-ia',
      label: 'Auditoria IA',
      description: 'Ver problemas detectados pela auditoria da SDR IA',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'recuperacao',
      label: 'Recuperação',
      description: 'Reativação de leads antigos',
      defaultRoles: ['owner', 'admin', 'member'],
    },
  ],
  'relatorios': [
    {
      key: 'cohort',
      label: 'Cohort',
      description: 'Relatórios cohort',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'produtividade',
      label: 'Produtividade',
      description: 'Relatórios de produtividade',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'comparativo',
      label: 'Comparativo',
      description: 'Comparativo entre períodos',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'tendencias',
      label: 'Tendências',
      description: 'Análise de tendências',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'automacoes',
      label: 'Automações',
      description: 'Configuração de e-mails automáticos',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
    {
      key: 'clara',
      label: 'Configurar Clara',
      description: 'Configurações da Clara',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
  ],
  'sdr-ia': [
    {
      key: 'auditoria-ia',
      label: 'Auditoria IA',
      description: 'Auditoria da SDR IA',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'configuracao',
      label: 'Configuração',
      description: 'Critérios de inclusão da auditoria (tags, pipelines, UTMs)',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
  ],
  'metas': [
    {
      key: 'overview',
      label: 'Visão Geral',
      description: 'Visão geral de metas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'tracking',
      label: 'Acompanhamento',
      description: 'Acompanhamento de metas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'registry',
      label: 'Cadastro',
      description: 'Cadastro de metas',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
    {
      key: 'history',
      label: 'Histórico',
      description: 'Histórico de metas',
      defaultRoles: ['owner', 'admin', 'member'],
    },
  ],
  'leads': [
    {
      key: 'lista',
      label: 'Lista',
      description: 'Listagem de leads',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'limpeza',
      label: 'Aba Limpeza',
      description: 'Excluir leads de teste do sistema',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
    {
      key: 'inscricoes',
      label: 'Inscrições de integrações',
      description: 'Leads do formulário de aplicação',
      defaultRoles: ['owner', 'admin'],
    },
  ],
  'criativos': [
    {
      key: 'dashboard',
      label: 'Dashboard',
      description: 'Dashboard de criativos',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'ranking',
      label: 'Ranking',
      description: 'Ranking de criativos',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'biblioteca',
      label: 'Biblioteca',
      description: 'Biblioteca de criativos',
      defaultRoles: ['owner', 'admin', 'member'],
      defaultEditRoles: ['owner', 'admin'],
    },
    {
      key: 'kanban',
      label: 'Kanban',
      description: 'Produção de criativos',
      defaultRoles: ['owner', 'admin', 'member'],
      defaultEditRoles: ['owner', 'admin'],
    },
    {
      key: 'testes',
      label: 'Testes',
      description: 'Fila de testes de criativos',
      defaultRoles: ['owner', 'admin', 'member'],
    },
  ],
  'disparos': [
    {
      key: 'dashboard',
      label: 'Dashboard',
      description: 'Métricas e gráficos das campanhas de WhatsApp',
      defaultRoles: ['owner', 'admin', 'member'],
    },
    {
      key: 'configuracao',
      label: 'Configuração',
      description: 'Criar e editar campanhas e tags',
      defaultRoles: ['owner', 'admin'],
      defaultEditRoles: ['owner', 'admin'],
    },
  ],
}
