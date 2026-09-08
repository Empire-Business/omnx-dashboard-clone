// Teste de estrutura da edge function discover-ghl-config
// Simula respostas reais da API GHL e valida a normalização.
// Não requer credenciais reais.

interface NormalizedCustomField {
  id: string
  name: string
  key: string
  field_type: string
  placeholder: string | null
}

interface NormalizedStage {
  id: string
  name: string
}

interface NormalizedPipeline {
  id: string
  name: string
  stages: NormalizedStage[]
}

function normalizeCustomFields(raw: unknown): NormalizedCustomField[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).customFields
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      key: String(item.fieldKey ?? item.key ?? ''),
      field_type: String(item.dataType ?? item.fieldType ?? 'UNKNOWN'),
      placeholder: item.placeholder != null ? String(item.placeholder) : null,
    }))
    .filter((item) => item.id && item.name)
}

function normalizeStages(raw: unknown): NormalizedStage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
    }))
    .filter((item) => item.id && item.name)
}

function normalizePipelines(raw: unknown): NormalizedPipeline[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).pipelines
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      stages: normalizeStages(item.stages),
    }))
    .filter((item) => item.id && item.name)
}

// Mocks realistas baseados na documentação da API GHL
const mockContactFields = {
  customFields: [
    {
      id: 'cf-contact-1',
      name: 'Data de Nascimento',
      fieldKey: 'data_de_nascimento',
      dataType: 'DATE',
      placeholder: 'DD/MM/AAAA',
    },
    {
      id: 'cf-contact-2',
      name: 'Telefone Alternativo',
      fieldKey: 'telefone_alternativo',
      dataType: 'TEXT',
      placeholder: null,
    },
  ],
}

const mockOpportunityFields = {
  customFields: [
    {
      id: 'cf-opp-1',
      name: 'MQL Conectado',
      fieldKey: 'mqlconectado',
      dataType: 'DATE',
      placeholder: 'Data do primeiro contato',
    },
    {
      id: 'cf-opp-2',
      name: 'Percepção do Closer',
      fieldKey: 'percepo_do_closer',
      dataType: 'TEXT',
      placeholder: 'Observações do closer',
    },
  ],
}

const mockPipelines = {
  pipelines: [
    {
      id: 'pipe-pre-vendas',
      name: 'Pré-Vendas',
      stages: [
        { id: 'stg-novo', name: 'Novo' },
        { id: 'stg-conectado', name: 'Conectado' },
        { id: 'stg-agendado', name: 'Agendado' },
      ],
    },
    {
      id: 'pipe-vendas',
      name: 'Vendas',
      stages: [
        { id: 'stg-reuniao', name: 'Reunião Agendada' },
        { id: 'stg-negociacao', name: 'Negociação' },
        { id: 'stg-fechado', name: 'Fechado' },
      ],
    },
  ],
}

// Validações
const contactFields = normalizeCustomFields(mockContactFields)
const opportunityFields = normalizeCustomFields(mockOpportunityFields)
const pipelines = normalizePipelines(mockPipelines)

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

assert(contactFields.length === 2, 'deve ter 2 contact custom fields')
assert(contactFields[0].key === 'data_de_nascimento', 'primeiro campo deve ter key correta')
assert(contactFields[0].field_type === 'DATE', 'primeiro campo deve ter field_type DATE')

assert(opportunityFields.length === 2, 'deve ter 2 opportunity custom fields')
assert(opportunityFields[0].key === 'mqlconectado', 'primeiro opp field deve ter key correta')
assert(opportunityFields[1].placeholder === 'Observações do closer', 'placeholder deve ser preservado')

assert(pipelines.length === 2, 'deve ter 2 pipelines')
assert(pipelines[0].stages.length === 3, 'primeiro pipeline deve ter 3 stages')
assert(pipelines[1].stages[2].name === 'Fechado', 'último stage do segundo pipeline deve ser Fechado')

// Teste de resposta vazia / mal formada
assert(normalizeCustomFields({}).length === 0, 'objeto vazio deve retornar array vazio')
assert(normalizeCustomFields(null).length === 0, 'null deve retornar array vazio')
assert(normalizePipelines({ pipelines: 'invalid' }).length === 0, 'pipelines não-array deve retornar array vazio')

console.log('✅ Todos os testes de normalização passaram.')
console.log('Contact fields:', contactFields.length)
console.log('Opportunity fields:', opportunityFields.length)
console.log('Pipelines:', pipelines.length)
