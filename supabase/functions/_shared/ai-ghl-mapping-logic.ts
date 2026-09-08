// Módulo PURO (sem import Deno/esm) — testável em Node (vitest) e importado
// pelo wrapper Deno em ai-ghl-mapping/index.ts. Mesmo padrão de
// require-service-role-logic.ts: lógica testável separada do transporte.

export interface ProposalField {
  ghl_field_key: string
  logical_name: string
  confidence: number
}

export interface ProposalPipeline {
  ghl_pipeline_id: string
  system_category: string
  confidence: number
}

export interface ProposalStage {
  ghl_stage_id: string
  system_stage: string
  confidence: number
}

export type MappingOutcome = 'mapped' | 'not_in_vocabulary' | 'unclear'

export interface MappingProposal {
  fields: ProposalField[]
  pipelines: ProposalPipeline[]
  stages: ProposalStage[]
  explanation: string
  warnings: string[]
  outcome?: MappingOutcome
}

/**
 * A resposta do modelo nunca é uma autorização para alterar outros itens.
 * Mantém somente a sugestão para o campo que o usuário escolheu e descarta
 * pipelines, stages e nomes lógicos fora da lista permitida pelo servidor.
 *
 * O resultado é comunicado via `outcome` (não por warnings soltos):
 * - 'mapped': a IA sugeriu um logical_name permitido para o campo alvo.
 * - 'not_in_vocabulary': a IA até sugeriu algo para o campo, mas fora do
 *   vocabulário — o destino real dele é o escape automático (custom_extra
 *   para oportunidade / extra.* para contato), não um mapeamento.
 * - 'unclear': a IA não conseguiu classificar o campo.
 *
 * Quando o outcome não é 'mapped', a explanation da IA descreve um mapeamento
 * que o servidor recusou — repassá-la cria contradição na UI ("mapeado com
 * alta confiança" ao lado de "não encontrou categoria segura"). Por isso
 * explanation e warnings são esvaziados: a UI explica o resultado a partir
 * do outcome, com texto próprio e honesto.
 */
export function restrictProposalToFieldTarget(
  proposal: MappingProposal,
  targetKey: string,
  allowedLogicalNames: Set<string>,
): MappingProposal {
  const fields = proposal.fields
    .filter(
      (field) =>
        field.ghl_field_key === targetKey &&
        allowedLogicalNames.has(field.logical_name),
    )
    .slice(0, 1)

  const outcome: MappingOutcome =
    fields.length > 0
      ? 'mapped'
      : proposal.fields.some((field) => field.ghl_field_key === targetKey)
        ? 'not_in_vocabulary'
        : 'unclear'

  const accepted = outcome === 'mapped'

  return {
    fields,
    pipelines: [],
    stages: [],
    explanation: accepted ? proposal.explanation : '',
    warnings: accepted ? proposal.warnings : [],
    outcome,
  }
}

export class InvalidProposalJsonError extends Error {}

/**
 * Extrai e valida a proposta de mapeamento retornada pela IA. Lança
 * InvalidProposalJsonError (nunca outro tipo) quando o conteúdo não é JSON
 * válido — quem chama decide se tenta de novo ou desiste.
 */
export function parseProposal(content: string): MappingProposal {
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new InvalidProposalJsonError('A IA não retornou um JSON válido.')
  }

  let parsed: Partial<MappingProposal>
  try {
    parsed = JSON.parse(jsonMatch[0]) as Partial<MappingProposal>
  } catch (e) {
    throw new InvalidProposalJsonError(
      `A IA retornou um JSON malformado: ${e instanceof Error ? e.message : String(e)}`,
    )
  }

  return {
    fields: Array.isArray(parsed.fields)
      ? parsed.fields.filter((f) => f && typeof f === 'object' && f.ghl_field_key && f.logical_name)
      : [],
    pipelines: Array.isArray(parsed.pipelines)
      ? parsed.pipelines.filter((p) => p && typeof p === 'object' && p.ghl_pipeline_id && p.system_category)
      : [],
    stages: Array.isArray(parsed.stages)
      ? parsed.stages.filter((s) => s && typeof s === 'object' && s.ghl_stage_id && s.system_stage)
      : [],
    explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((w) => typeof w === 'string')
      : [],
  }
}

export const RETRY_INSTRUCTION =
  '\n\nATENÇÃO: sua última resposta não pôde ser lida como JSON válido. ' +
  'Responda EXCLUSIVAMENTE com o objeto JSON pedido — sem texto antes, sem texto depois, ' +
  'sem blocos de código markdown (```), sem explicações fora do campo "explanation".'

/**
 * Orquestra até 2 tentativas de uma chamada de modelo (fetcher injetado, testável
 * sem rede real) até obter JSON válido. Retorna { content, proposal, attempts }.
 * Lança InvalidProposalJsonError se as 2 tentativas falharem em parsear.
 */
export async function callModelWithRetry(
  fetchModel: (prompt: string) => Promise<string>,
  basePrompt: string,
  maxAttempts = 2,
): Promise<{ content: string; proposal: MappingProposal; attempts: number }> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const prompt = attempt === 0 ? basePrompt : basePrompt + RETRY_INSTRUCTION
    const content = await fetchModel(prompt)
    try {
      const proposal = parseProposal(content)
      return { content, proposal, attempts: attempt + 1 }
    } catch (e) {
      lastError = e
      if (!(e instanceof InvalidProposalJsonError)) throw e
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Falha desconhecida ao interpretar resposta da IA')
}
