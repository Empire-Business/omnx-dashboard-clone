// ─── Pipelines excluídos dos painéis ──────────────────────────────────────────
//
// Pipeline "Recuperação": leads antigos reativados em novo pipeline.
// NÃO representa novos leads gerados — excluído de todas as contagens
// de leads novos, MQL, funil de conversão e cohort.
//
// pipeline_id confirmado via GHL: Sn1Guqcm6zwZNTVOOf5L
export const PIPELINE_RECUPERACAO_ID = 'Sn1Guqcm6zwZNTVOOf5L'

// Pipeline comercial (closer) — leads em negociação/fechamento.
//
// REGRA DE USO:
//   COHORT (useSDRLeaderboard):        EXCLUIR — leads contados via usePreVendas,
//                                       que não filtra Vendas SQL por padrão.
//   PRODUTIVIDADE (useSDRProdutividade,
//                  loadProdutividadeBase): INCLUIR — quando o SDR agenda uma reunião,
//                                       a automação GHL move o lead para Vendas SQL
//                                       imediatamente. Excluir este pipeline apaga o
//                                       agendamento do registro de atividade do SDR.
//   Auditoria IA / Atividades:         EXCLUIR — essas telas focam em pré-vendas ativas.
//
// pipeline_id confirmado via GHL: ZWuCjEXM2VDyLCx8CtGU
export const PIPELINE_VENDAS_SQL_ID = 'ZWuCjEXM2VDyLCx8CtGU'

// Array de pipelines excluídos (para filtros .not('pipeline_id', 'in', ...))
export const PIPELINES_EXCLUIDOS = [PIPELINE_RECUPERACAO_ID]

// ─── Modo do filtro de Recuperação (Vendas + Aquisição) ───────────────────────
// Controle de 3 estados, escolhível pelo usuário e salvo por conta:
//   exclude_recuperacao → tudo, EXCETO Recuperação (default = comportamento histórico)
//   include_recuperacao → tudo, INCLUINDO Recuperação
//   only_recuperacao    → APENAS leads de Recuperação
export type RecuperacaoMode = 'exclude_recuperacao' | 'include_recuperacao' | 'only_recuperacao'

export const RECUPERACAO_MODE_DEFAULT: RecuperacaoMode = 'exclude_recuperacao'

// Interface mínima de uma query de oportunidades para o filtro de Recuperação.
// Selects com embed (`contatos(...)`) geram um tipo de builder tão profundo que
// deixar o genérico abaixo inferi-lo estoura o type-checker com TS2589
// ("type instantiation is excessively deep"). O padrão nos call sites pesados é:
//
//   const base = supabase.from('oportunidades').select(OPP_SELECT)...
//   const q = applyRecuperacaoFilter(base as unknown as RecuperacaoQueryLike, mode)
//              as unknown as typeof base
//
export type RecuperacaoQueryLike = {
  eq: (col: string, val: string) => RecuperacaoQueryLike
  neq: (col: string, val: string) => RecuperacaoQueryLike
}

// Aplica o filtro de pipeline Recuperação a uma query de oportunidades do Supabase.
// include_recuperacao → não aplica filtro (retorna a query intacta).
export function applyRecuperacaoFilter<T extends {
  neq: (col: string, val: string) => T
  eq: (col: string, val: string) => T
}>(query: T, mode: RecuperacaoMode): T {
  if (mode === 'exclude_recuperacao') return query.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
  if (mode === 'only_recuperacao') return query.eq('pipeline_id', PIPELINE_RECUPERACAO_ID)
  return query
}

// Pipelines do discador de Pré-Vendas (escopo 'pre_vendas' em discagem_scores).
// Fonte de verdade única — importar em vez de redeclarar em outro arquivo
// (useDiscagemScore.ts já foi corrigido pra importar daqui em 2026-07-05,
// depois de encontrarmos essa lista duplicada e desatualizada no hook).
export const PIPELINE_DISCAGEM_NAMES = ['Pré-Vendas MQL', 'Auto Agendamento'] as const

// Pipeline do discador de Recuperação (escopo 'recuperacao' em discagem_scores).
export const PIPELINE_DISCAGEM_RECUPERACAO_NAME = 'Recuperação' as const
