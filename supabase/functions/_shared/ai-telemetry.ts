// Telemetria operacional de IA por workspace.
// Deliberadamente não recebe nem persiste prompts, respostas, chaves ou erros brutos.

export type AiTelemetryFeature =
  | 'ai-ghl-mapping'
  | 'prevendas-ai'
  | 'bot-chat'
  | 'bot-chat-synthesis'

interface OpenRouterUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface AiTelemetryEvent {
  workspaceId: string
  feature: AiTelemetryFeature
  model?: string | null
  status: 'success' | 'failure'
  durationMs?: number | null
  responseStatus?: number | null
  errorCode?: string | null
  usage?: OpenRouterUsage | null
}

export function getOpenRouterUsage(value: unknown): OpenRouterUsage | null {
  if (!value || typeof value !== 'object') return null
  const usage = value as Record<string, unknown>
  const toSafeNumber = (input: unknown) =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 ? Math.floor(input) : null

  const promptTokens = toSafeNumber(usage.prompt_tokens)
  const completionTokens = toSafeNumber(usage.completion_tokens)
  const totalTokens = toSafeNumber(usage.total_tokens)

  if (promptTokens === null && completionTokens === null && totalTokens === null) return null
  return {
    ...(promptTokens !== null ? { prompt_tokens: promptTokens } : {}),
    ...(completionTokens !== null ? { completion_tokens: completionTokens } : {}),
    ...(totalTokens !== null ? { total_tokens: totalTokens } : {}),
  }
}

export function getAiFailureCode(responseStatus?: number, error?: unknown): string {
  if (typeof responseStatus === 'number') return `provider_http_${responseStatus}`
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'provider_timeout'
  if (error instanceof Error && error.name === 'AbortError') return 'provider_timeout'
  return 'provider_request_failed'
}

export async function recordAiTelemetry(
  supabase: any,
  event: AiTelemetryEvent,
): Promise<void> {
  const usage = event.usage ?? null
  const payload = {
    workspace_id: event.workspaceId,
    feature: event.feature,
    provider: 'openrouter',
    model: event.model ?? null,
    status: event.status,
    request_count: 1,
    input_tokens: usage?.prompt_tokens ?? null,
    output_tokens: usage?.completion_tokens ?? null,
    total_tokens: usage?.total_tokens ?? null,
    estimated_cost_usd: null,
    duration_ms: typeof event.durationMs === 'number' && event.durationMs >= 0
      ? Math.floor(event.durationMs)
      : null,
    response_status: event.responseStatus ?? null,
    error_code: event.status === 'failure' ? (event.errorCode ?? 'provider_request_failed') : null,
  }

  try {
    const { error } = await supabase.from('workspace_ai_usage_events').insert(payload)
    if (error) console.error('[ai-telemetry] Falha ao registrar evento:', error.code ?? 'unknown')
  } catch (error) {
    // Telemetria é observabilidade: nunca pode indisponibilizar o fluxo de IA.
    console.error('[ai-telemetry] Exceção ao registrar evento:', error instanceof Error ? error.name : 'unknown')
  }
}
