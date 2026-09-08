// Definições das tools usadas pela Clara (function calling)

export const TOOLS_DEFINITION = [
  {
    type: 'function',
    function: {
      name: 'query_funnel_cohort',
      description: `Retorna o funil de conversão COHORT completo: Leads → MQLs → Conectados → Agendados → Reuniões → Vendas.
Filtra oportunidades por data_lead_recebido (quando o lead entrou). Já exclui Pipeline Recuperação automaticamente.
Use para: "quantos MQLs em março", "taxa de conversão do funil", "leads recebidos", "performance de aquisição", "cohort".
NÃO use para "faturamento do mês" ou "vendas fechadas no período" (use query_revenue_produtividade).`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD (São Paulo)' },
          end_date: { type: 'string', description: 'Data final YYYY-MM-DD (São Paulo)' },
          utm_source: { type: 'string', description: 'Filtrar por canal (utm_source). Opcional.' },
          utm_campaign_code: { type: 'string', description: 'Código numérico da campanha (utm_campaign). Use query_campaign_mapping primeiro para resolver o código. Opcional.' },
          sdr_name: { type: 'string', description: 'Filtrar por SDR exato. Use list_sdrs para resolver nomes parciais. Opcional.' },
          group_by: { type: 'string', enum: ['month', 'sdr', 'campaign', 'channel', 'none'], description: 'Agrupar resultados. Default: none.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_revenue_produtividade',
      description: `Retorna faturamento e vendas usando PRODUTIVIDADE: filtra por data_pagamento_entrada no período.
Use para: "faturamento do mês", "quanto vendemos em março", "caixa recebido", "vendas fechadas no período", "receita".
Esta é a visão financeira real — independente de cohort.`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
          end_date: { type: 'string', description: 'Data final YYYY-MM-DD' },
          closer_name: { type: 'string', description: 'Filtrar por closer. Opcional.' },
          group_by: { type: 'string', enum: ['month', 'closer', 'product', 'payment_method', 'none'], description: 'Agrupar resultados. Default: none.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_meta_ads',
      description: `Retorna dados de Meta Ads: investimento, impressões, cliques, CTR, CPM, leads do Meta.
Use para: "investimento da campanha X", "CTR dos anúncios", "CPM do período", "melhor criativo".
Para calcular CPMQL: combine com query_funnel_cohort (CPMQL = spend / mqls_crm).`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
          end_date: { type: 'string', description: 'Data final YYYY-MM-DD' },
          campaign_name: { type: 'string', description: 'Filtrar por nome de campanha (parcial, case-insensitive). Opcional.' },
          adset_name: { type: 'string', description: 'Filtrar por nome de conjunto. Opcional.' },
          group_by: { type: 'string', enum: ['campaign', 'adset', 'ad', 'day', 'none'], description: 'Agrupar. Default: campaign.' },
          limit: { type: 'number', description: 'Máximo de grupos a retornar. Default: 10.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_meta_ads_region',
      description: `Retorna análise completa de Meta Ads por região brasileira: investimento, vendas de tráfego pago, faturamento, entrada (caixa), CPV, ROAS e ROAS CAIXA.
Use para: "qual região vendeu mais", "ROAS por região", "CPV do Sudeste", "investimento por estado", "qual região tem melhor ROAS CAIXA", "análise de região".
Cruza investimento real da Meta (breakdown por estado) com vendas do CRM filtradas por utm_source de tráfego pago.`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD' },
          end_date: { type: 'string', description: 'Data final YYYY-MM-DD' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_sdr_performance',
      description: `Retorna performance de SDRs: leads recebidos, MQLs, conectados, agendados, reuniões.
Use para: "performance do SDR João", "ranking de SDRs", "qual SDR teve mais agendamentos", "pré-vendas".
Modos: cohort (por data_lead_recebido) ou produtividade (por data do evento).`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          sdr_name: { type: 'string', description: 'SDR específico. Omitir para todos.' },
          mode: { type: 'string', enum: ['cohort', 'produtividade'], description: 'OBRIGATÓRIO: cohort=por data_lead_recebido; produtividade=por data do evento' },
        },
        required: ['start_date', 'end_date', 'mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_leads_parados',
      description: `Retorna leads que não avançaram no funil — em pré-vendas sem data_conectado por N dias.
Use para: "leads parados", "leads sem contato", "leads travados há mais de X dias".`,
      parameters: {
        type: 'object',
        properties: {
          min_days_without_contact: { type: 'number', description: 'Mínimo de dias sem data_conectado. Default: 3.' },
          sdr_name: { type: 'string', description: 'Filtrar por SDR. Opcional.' },
          limit: { type: 'number', description: 'Máximo de leads a retornar. Default: 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_goals',
      description: `Retorna metas cadastradas e progresso (snapshots).
Use para: "qual é a meta de MQLs", "atingimos a meta de vendas?", "progresso das metas do mês".`,
      parameters: {
        type: 'object',
        properties: {
          period_start: { type: 'string', description: 'YYYY-MM-DD. Opcional.' },
          period_end: { type: 'string', description: 'YYYY-MM-DD. Opcional.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_campaign_mapping',
      description: `Resolve nome de campanha → código utm_campaign e funis associados.
Use ANTES de filtrar por campanha em query_funnel_cohort para obter o código numérico correto.
Também lista todas as campanhas disponíveis se chamado sem parâmetros.`,
      parameters: {
        type: 'object',
        properties: {
          campaign_name: { type: 'string', description: 'Nome parcial para busca (case-insensitive). Omitir retorna todas.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_organico',
      description: `Retorna métricas de canais orgânicos (leads sem utm_source pago).
Use para: "leads orgânicos", "MQLs orgânicos", "performance do canal orgânico", "Instagram orgânico".`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'YYYY-MM-DD' },
          end_date: { type: 'string', description: 'YYYY-MM-DD' },
          group_by: { type: 'string', enum: ['channel', 'month', 'none'], description: 'Agrupar. Default: channel.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_sdrs',
      description: `Lista todos os SDRs cadastrados com seus nomes exatos.
Use antes de query_sdr_performance quando o usuário menciona um nome parcial ou incerto.`,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_sql_query',
      description: `Executa uma query SQL SELECT diretamente no banco de dados Empire.
Use quando precisar de números EXATOS que as outras tools não cobrem, ou para validar um número com lógica customizada.
REGRAS: apenas SELECT/WITH são permitidos. Sempre incluir LIMIT (max 500). Usar timezone correto.`,
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description: 'Query SQL SELECT completa. Incluir LIMIT. Usar sufixo -03:00 para TIMESTAMPTZ e string direta para DATE.',
          },
          description: {
            type: 'string',
            description: 'Breve descrição do que a query calcula (para explicar ao usuário o que está sendo consultado)',
          },
        },
        required: ['sql', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_buyer_profile',
      description: `Retorna perfil completo de todos os compradores de um período: dados pessoais, empresa/email, produto comprado, forma de pagamento, canal de origem, ciclo de compra, SDR/closer, e as últimas mensagens trocadas — para análise qualitativa de quem compra, suas dores, desejos e objeções.
Use para: "perfil de quem compra", "quem são meus compradores", "análise dos clientes", "leia as mensagens dos compradores", "dores e desejos dos clientes", "relatório de comprador", "análise qualitativa", "perfil do trimestre", "buyer persona".
Retorna tudo em UMA chamada — use antes de escrever o relatório.`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD (data_pagamento_entrada)' },
          end_date: { type: 'string', description: 'Data final YYYY-MM-DD' },
          messages_per_buyer: { type: 'number', description: 'Mensagens por comprador para análise (default: 25, max: 40)' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_funnel_comparison',
      description: `Retorna comparativo COMPLETO de todos os funis em UMA única chamada: MQLs, reuniões, fechamentos, investimento Meta Ads, CPMQL, custo por reunião e conversão — tudo agrupado por funil.
Use SEMPRE que o usuário pedir: "compare os funis", "CPMQL por funil", "custo por reunião por funil", "conversão de cada funil", "investimento por funil", "desempenho dos funis", "funil de forms vs outros funis".
Retorna JSON com um objeto por funil — use para montar tabela comparativa na resposta.
MODO: sempre COHORT (leads por data_lead_recebido). Para faturamento por funil, complemente com query_revenue_produtividade.`,
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'Data inicial YYYY-MM-DD (início do cohort)' },
          end_date: { type: 'string', description: 'Data final YYYY-MM-DD (fim do cohort)' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_historical_trends',
      description: `Retorna série histórica MENSAL de um KPI para análise de tendência e projeção.
Use quando: "qual a tendência de CPMQL", "projete o faturamento do próximo mês", "o funil está melhorando?", "evolução mês a mês", "crescimento de leads", "como estamos vs meses anteriores".
Retorna valores mensais com crescimento % mês a mês — use para calcular projeções e diagnosticar tendências.`,
      parameters: {
        type: 'object',
        properties: {
          metric: {
            type: 'string',
            enum: ['leads', 'mqls', 'conectados', 'agendados', 'reunioes', 'vendas', 'faturamento', 'caixa', 'spend_meta', 'cpmql', 'roas'],
            description: 'KPI a analisar: leads/mqls/conectados/agendados/reunioes = funil (COHORT por data_lead_recebido) | vendas/faturamento/caixa = receita (PRODUTIVIDADE por data_pagamento_entrada) | spend_meta = investimento Meta | cpmql = spend/mqls por mês | roas = faturamento/spend por mês',
          },
          months_back: { type: 'number', description: 'Quantos meses de histórico (1-12). Default: 6.' },
          utm_source: { type: 'string', description: 'Filtrar por canal pago (utm_source). Opcional.' },
        },
        required: ['metric'],
      },
    },
  },
]
