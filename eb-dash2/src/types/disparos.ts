export type DisparoSignificado =
  | 'trigger'
  | 'respondeu'
  | 'parou'
  | 'erro'
  | 'nao_respondeu'
  | 'converteu'

// Cores alinhadas à paleta Nubank (docs/DESIGN-SYSTEM-NUBANK.md): sucesso/destrutivo/aviso
// usam os mesmos tons dos tokens --empire-success/--empire-danger/--empire-warning.
export const DISPARO_SIGNIFICADOS: { value: DisparoSignificado; label: string; cor: string }[] = [
  { value: 'trigger', label: 'Disparo (entrou)', cor: '#820ad1' },
  { value: 'respondeu', label: 'Respondeu', cor: '#0c7a3a' },
  { value: 'parou', label: 'Pediu para parar', cor: '#d01d1c' },
  { value: 'erro', label: 'Erro', cor: '#9b5a00' },
  { value: 'nao_respondeu', label: 'Não respondeu', cor: '#777777' },
  { value: 'converteu', label: 'Converteu', cor: '#5c0f8b' },
]

export type TipoMensagemWhatsapp = 'marketing' | 'utility'

export type CampoCustomTipo = 'texto' | 'numero' | 'moeda' | 'data'

export interface DisparoCampoCustom {
  id: string
  workspace_id: string
  nome_campo: string
  tipo: CampoCustomTipo
  sort_order: number
  created_at: string
  updated_at: string
}

export interface DisparoCampoCustomValor {
  id: string
  workspace_id: string
  disparo_id: string
  campo_id: string
  valor: string | null
  updated_at: string
}

export interface Disparo {
  id: string
  workspace_id: string
  nome: string
  descricao: string | null
  cor: string
  is_active: boolean
  tipo_mensagem: TipoMensagemWhatsapp
  created_at: string
  updated_at: string
}

export interface DisparoTag {
  id: string
  workspace_id: string
  disparo_id: string
  significado: DisparoSignificado
  tag: string
  created_at: string
  updated_at: string
}

export interface DisparoWithTags extends Disparo {
  tags: DisparoTag[]
}

export interface DisparoMetrica {
  disparo_id: string
  workspace_id: string
  disparo_nome: string
  descricao: string | null
  cor: string
  is_active: boolean
  tipo_mensagem: TipoMensagemWhatsapp
  trigger_count: number
  respondeu_count: number
  parou_count: number
  erro_count: number
  nao_respondeu_count: number
  converteu_count: number
  taxa_resposta_pct: number
  taxa_parou_pct: number
  taxa_erro_pct: number
  taxa_conversao_pct: number
  preco_unitario: number
  custo_estimado: number
  primeiro_trigger: string | null
  ultimo_trigger: string | null
}

export interface DisparoContact {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  tags: string | null
  date_created: string | null
  significados: DisparoSignificado[]
}
