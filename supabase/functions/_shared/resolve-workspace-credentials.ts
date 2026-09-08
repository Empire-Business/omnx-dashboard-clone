/**
 * Helper de resolucao de credencial por workspace (Fase 2 — plano v3 secao 5.3).
 *
 * Move a leitura de credencial para DENTRO do handler, chaveada por workspace_id,
 * via Vault (service_role) — em vez de constante de modulo lida no cold start.
 *
 * FAIL-CLOSED: sem credencial para (workspace, provider) lanca
 * CredentialResolutionError (NUNCA cai em env global). Esse e o ponto central
 * da Fase 2: eliminar o fallback a GHL_API_KEY/GHL_LOCATION_ID globais.
 *
 * Cache por isolate Deno: chave `${workspaceId}:${provider}:${rotation_version}`,
 * rele rotation_version a cada request (read leve) e decifra o segredo so no
 * miss; TTL curto (<=10s) como garantia de revogacao.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import {
  CREDENTIAL_CACHE_TTL_MS,
  makeCredentialCacheKey,
  isCacheEntryValid,
  type CredentialCacheEntry,
} from './credential-cache.ts'

export type CredentialProvider = 'ghl' | 'meta' | 'openrouter' | 'notion'

const cache = new Map<string, CredentialCacheEntry>() // por isolate Deno

export class CredentialResolutionError extends Error {
  readonly workspaceId: string
  readonly provider: string
  constructor(message: string, workspaceId: string, provider: string) {
    super(message)
    this.name = 'CredentialResolutionError'
    this.workspaceId = workspaceId
    this.provider = provider
  }
}

export interface ResolvedCredential {
  apiKey: string
  rotationVersion: number
  metadata: Record<string, unknown>
}

interface CredentialMetaRow {
  secret_key_id: string
  rotation_version: number
  metadata: Record<string, unknown> | null
}

async function readMeta(
  service: SupabaseClient,
  workspaceId: string,
  provider: CredentialProvider
): Promise<{ secretKeyId: string; rotationVersion: number; metadata: Record<string, unknown> }> {
  const { data, error } = await service
    .rpc('get_workspace_credential_meta', {
      p_workspace_id: workspaceId,
      p_provider: provider,
    })
    .maybeSingle()

  if (error) {
    throw new CredentialResolutionError(
      `meta lookup failed: ${error.message}`,
      workspaceId,
      provider
    )
  }
  if (!data) {
    throw new CredentialResolutionError(
      `no ${provider} credential for workspace`,
      workspaceId,
      provider
    )
  }
  const row = data as CredentialMetaRow
  return {
    secretKeyId: row.secret_key_id,
    rotationVersion: row.rotation_version,
    metadata: row.metadata ?? {},
  }
}

async function readDecryptedSecret(
  service: SupabaseClient,
  secretKeyId: string,
  workspaceId: string,
  provider: CredentialProvider
): Promise<string> {
  // RPC RETURNS text => `data` e a string (ou null se nao encontrar linha).
  const { data, error } = await service.rpc('get_decrypted_secret', {
    p_secret_key_id: secretKeyId,
  })
  if (error) {
    throw new CredentialResolutionError(
      `secret decrypt failed: ${error.message}`,
      workspaceId,
      provider
    )
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new CredentialResolutionError(
      'secret decrypt returned empty',
      workspaceId,
      provider
    )
  }
  return data
}

/**
 * Resolve a credencial (apiKey + metadata) do workspace para o provider dado.
 */
export async function resolveWorkspaceCredential(
  service: SupabaseClient,
  workspaceId: string,
  provider: CredentialProvider
): Promise<ResolvedCredential> {
  const meta = await readMeta(service, workspaceId, provider)

  const cacheKey = makeCredentialCacheKey(workspaceId, provider, meta.rotationVersion)
  const now = Date.now()
  const hit = cache.get(cacheKey)
  if (isCacheEntryValid(hit, now)) {
    return {
      apiKey: hit!.apiKey,
      rotationVersion: meta.rotationVersion,
      metadata: meta.metadata,
    }
  }

  const apiKey = await readDecryptedSecret(service, meta.secretKeyId, workspaceId, provider)
  cache.set(cacheKey, { apiKey, expiresAt: now + CREDENTIAL_CACHE_TTL_MS })
  return { apiKey, rotationVersion: meta.rotationVersion, metadata: meta.metadata }
}

/**
 * Atalho para GHL (caso mais comum), expondo locationId lido do metadata.
 */
export async function resolveGhlCredentials(
  service: SupabaseClient,
  workspaceId: string
): Promise<{ apiKey: string; locationId: string | null; rotationVersion: number }> {
  const resolved = await resolveWorkspaceCredential(service, workspaceId, 'ghl')
  const locationId =
    typeof resolved.metadata.location_id === 'string'
      ? (resolved.metadata.location_id as string)
      : null
  return {
    apiKey: resolved.apiKey,
    locationId,
    rotationVersion: resolved.rotationVersion,
  }
}

/** Apenas para testes: limpa o cache do isolate. */
export function __clearCredentialCacheForTests(): void {
  cache.clear()
}
