// Edge Function: test-workspace-credential
// Fase 4 (fatia 4) — "Testar conexao" / prova de posse (plano-mae secao 3.5.1).
//
// Endpoint: POST /test-workspace-credential
// Headers:  Authorization: Bearer <jwt>
// Body:     { workspace_id: string, provider: 'ghl' | 'meta' | 'openrouter' }
//
// Valida, server-side, que a chave cadastrada pelo workspace realmente da acesso
// ao location_id/ad_account_id informado nos metadados — sem NUNCA expor a chave
// no browser (nem no corpo desta resposta). So admin/owner do workspace pode
// chamar. Fail-closed: sem credencial cadastrada, responde erro amigavel, nunca
// cai em fallback global.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'
import {
  resolveWorkspaceCredential,
  CredentialResolutionError,
  type CredentialProvider,
} from '../_shared/resolve-workspace-credentials.ts'
import {
  buildGhlTestUrl,
  buildMetaTestUrl,
  interpretGhlTestResult,
  interpretMetaTestResult,
  extractMetaAdAccountIds,
  aggregateMetaAccountResults,
  GHL_API_VERSION,
  type MetaAccountTestResult,
} from '../_shared/test-workspace-credential-logic.ts'
import { createRequestId, logSafeError } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const REQUEST_TIMEOUT_MS = 15000

const TESTABLE_PROVIDERS: CredentialProvider[] = ['ghl', 'meta', 'openrouter']

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405)
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Validar JWT do chamador.
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()
    if (!token) {
      return jsonResponse({ ok: false, error: 'Unauthorized' }, 401)
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (!caller || authError) {
      return jsonResponse(
        { ok: false, error: `Unauthorized: ${authError?.message ?? 'token invalido'}` },
        401
      )
    }

    // 2. Ler e validar o body.
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ ok: false, error: 'Body invalido: JSON esperado' }, 400)
    }

    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
    const provider = typeof body.provider === 'string' ? body.provider : ''
    if (!workspaceId || !TESTABLE_PROVIDERS.includes(provider as CredentialProvider)) {
      return jsonResponse(
        { ok: false, error: 'workspace_id e provider (ghl|meta|openrouter) sao obrigatorios' },
        400
      )
    }
    const typedProvider = provider as CredentialProvider

    // 3. Verificar que o chamador e owner/admin do workspace.
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      throw new Error(`Erro ao verificar membership: ${membershipError.message}`)
    }
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return jsonResponse(
        { ok: false, error: 'Apenas owner ou admin pode testar a conexao' },
        403
      )
    }

    // 4. Resolver a credencial via helper (Vault + cache). Fail-closed: sem
    // credencial cadastrada, responde erro amigavel — nunca cai em env global.
    let apiKey: string
    let metadata: Record<string, unknown>
    try {
      const resolved = await resolveWorkspaceCredential(supabaseAdmin, workspaceId, typedProvider)
      apiKey = resolved.apiKey
      metadata = resolved.metadata
    } catch (err) {
      if (err instanceof CredentialResolutionError) {
        return jsonResponse(
          { ok: false, error: 'Nenhuma chave cadastrada para este provedor' },
          400
        )
      }
      throw err
    }

    // 5. Chamar a API do provedor e interpretar a resposta (nunca ecoa a chave
    // nem o corpo cru retornado pelo provedor).
    if (typedProvider === 'ghl') {
      const locationId = typeof metadata.location_id === 'string' ? metadata.location_id : ''
      if (!locationId) {
        return jsonResponse({ ok: false, error: 'Location ID nao cadastrado' }, 400)
      }
      const res = await fetchWithTimeout(buildGhlTestUrl(locationId), {
        Authorization: `Bearer ${apiKey}`,
        Version: GHL_API_VERSION,
      })
      const respBody = await res.json().catch(() => null)
      const result = interpretGhlTestResult(res.status, respBody, locationId)
      return jsonResponse(result, result.ok ? 200 : 400)
    }

    if (typedProvider === 'openrouter') {
      const res = await fetchWithTimeout('https://openrouter.ai/api/v1/auth/key', {
        Authorization: `Bearer ${apiKey}`,
      })
      if (res.ok) return jsonResponse({ ok: true }, 200)
      if (res.status === 401 || res.status === 403) {
        return jsonResponse({ ok: false, error: 'A chave OpenRouter foi recusada.' }, 400)
      }
      return jsonResponse({ ok: false, error: 'Não foi possível confirmar a chave OpenRouter agora.' }, 400)
    }

    // meta — Fase 15 (D4): testa TODAS as contas da lista
    // (metadata.ad_account_ids, com fallback para o legado ad_account_id
    // singular). ok:true somente se todas passam; a resposta detalha por
    // conta em `accounts`. Com uma unica conta, comportamento equivalente ao
    // anterior ({ ok, error? } no topo).
    const adAccountIds = extractMetaAdAccountIds(metadata)
    if (adAccountIds.length === 0) {
      return jsonResponse({ ok: false, error: 'ID da conta de anuncios nao cadastrado' }, 400)
    }

    // Testa as contas em paralelo com isolamento de falha: timeout/erro de
    // rede de uma conta vira erro DESTA conta e nao derruba as demais.
    const settled = await Promise.allSettled(
      adAccountIds.map(async (accountId): Promise<MetaAccountTestResult> => {
        const res = await fetchWithTimeout(
          `${buildMetaTestUrl(accountId)}&access_token=${encodeURIComponent(apiKey)}`,
          {},
        )
        const respBody = await res.json().catch(() => null)
        const r = interpretMetaTestResult(res.status, respBody, accountId)
        return {
          account_id: accountId,
          ok: r.ok,
          ...(r.name ? { name: r.name } : {}),
          ...(r.error ? { error: r.error } : {}),
        }
      }),
    )

    const accounts: MetaAccountTestResult[] = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : {
            account_id: adAccountIds[i],
            ok: false,
            error: 'Nao foi possivel contatar a Meta para esta conta',
          },
    )

    const aggregated = aggregateMetaAccountResults(accounts)
    return jsonResponse(aggregated, aggregated.ok ? 200 : 400)
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('test-workspace-credential', requestId, err)
    return jsonResponse(
      { ok: false, error: 'Não foi possível concluir a operação. Tente novamente.', code: 'internal_error', request_id: requestId },
      500,
    )
  }
})
