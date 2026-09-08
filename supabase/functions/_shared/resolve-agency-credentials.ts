/**
 * Helper de resolucao do token de agencia GHL (Fase 3 — descoberta de sub-contas).
 * docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.3)
 *
 * Espelha resolve-workspace-credentials.ts, mas chaveado por agency_id em vez
 * de workspace_id, e com um unico provider possivel (token de agencia GHL,
 * SO-LEITURA por decisao do dono — docs/FASE-3-POC-RESULTADOS.md).
 *
 * FAIL-CLOSED: sem credencial para a agencia lanca AgencyCredentialResolutionError.
 * Cache por isolate Deno: chave `${agencyId}:${rotation_version}`, mesma TTL
 * curta (10s) de credential-cache.ts como garantia de revogacao.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import {
  CREDENTIAL_CACHE_TTL_MS,
  isCacheEntryValid,
  type CredentialCacheEntry,
} from './credential-cache.ts'

const cache = new Map<string, CredentialCacheEntry>() // por isolate Deno

export class AgencyCredentialResolutionError extends Error {
  readonly agencyId: string
  constructor(message: string, agencyId: string) {
    super(message)
    this.name = 'AgencyCredentialResolutionError'
    this.agencyId = agencyId
  }
}

export interface ResolvedAgencyCredential {
  apiKey: string
  companyId: string
  rotationVersion: number
}

interface AgencyCredentialMetaRow {
  secret_key_id: string
  rotation_version: number
  company_id: string
}

function makeAgencyCacheKey(agencyId: string, rotationVersion: number): string {
  return `${agencyId}:${rotationVersion}`
}

async function readMeta(
  service: SupabaseClient,
  agencyId: string
): Promise<{ secretKeyId: string; rotationVersion: number; companyId: string }> {
  const { data, error } = await service
    .rpc('get_agency_credential_meta', { p_agency_id: agencyId })
    .maybeSingle()

  if (error) {
    throw new AgencyCredentialResolutionError(`meta lookup failed: ${error.message}`, agencyId)
  }
  if (!data) {
    throw new AgencyCredentialResolutionError('no ghl credential for agency', agencyId)
  }
  const row = data as AgencyCredentialMetaRow
  return {
    secretKeyId: row.secret_key_id,
    rotationVersion: row.rotation_version,
    companyId: row.company_id,
  }
}

async function readDecryptedSecret(
  service: SupabaseClient,
  secretKeyId: string,
  agencyId: string
): Promise<string> {
  const { data, error } = await service.rpc('get_decrypted_secret', {
    p_secret_key_id: secretKeyId,
  })
  if (error) {
    throw new AgencyCredentialResolutionError(`secret decrypt failed: ${error.message}`, agencyId)
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new AgencyCredentialResolutionError('secret decrypt returned empty', agencyId)
  }
  return data
}

/**
 * Resolve o token de agencia GHL (apiKey + companyId) para a agencia dada.
 */
export async function resolveAgencyCredential(
  service: SupabaseClient,
  agencyId: string
): Promise<ResolvedAgencyCredential> {
  const meta = await readMeta(service, agencyId)

  const cacheKey = makeAgencyCacheKey(agencyId, meta.rotationVersion)
  const now = Date.now()
  const hit = cache.get(cacheKey)
  if (isCacheEntryValid(hit, now)) {
    return { apiKey: hit!.apiKey, companyId: meta.companyId, rotationVersion: meta.rotationVersion }
  }

  const apiKey = await readDecryptedSecret(service, meta.secretKeyId, agencyId)
  cache.set(cacheKey, { apiKey, expiresAt: now + CREDENTIAL_CACHE_TTL_MS })
  return { apiKey, companyId: meta.companyId, rotationVersion: meta.rotationVersion }
}

/** Apenas para testes: limpa o cache do isolate. */
export function __clearAgencyCredentialCacheForTests(): void {
  cache.clear()
}
