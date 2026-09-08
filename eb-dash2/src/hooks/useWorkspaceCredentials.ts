import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

// Provedores expostos na UI de Integracoes (Fase 4). Notion fica fora (descontinuado).
// omnx_desk (20261008): secret por conta para o roteamento multi-tenant da
// edge crm-registrar-venda — o save grava metadata.secret_sha256 na RPC.
// `notion` entrou em 2026-09-01. A RPC `save_workspace_credential` já aceitava o provider
// desde a Fase 4, mas ele nunca esteve nesta lista — ou seja, não existia tela para
// cadastrar a credencial do Notion. Consequência medida em produção: no cutover
// multi-tenant de 14–15/07 a `notion-creatives-sync` virou fail-closed por workspace, a
// credencial nunca foi cadastrada (não havia como), e o cron virou no-op silencioso por
// ~50 dias — sem erro e sem linha em `notion_sync_runs`. Ver docs/MUDANCAS.md.
export type CredentialProvider = 'ghl' | 'meta' | 'openrouter' | 'omnx_desk' | 'notion'

export interface CredentialStatus {
  provider: CredentialProvider
  rotation_version: number
  metadata: Record<string, unknown>
  updated_at: string
}

const QUERY_KEY = 'workspace-credentials'

async function fetchStatus(): Promise<CredentialStatus[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  // RPC admin-only (Fase 4/Fatia 1): retorna providers + metadata, SEM o segredo.
  const { data, error } = await supabase.rpc('get_workspace_credential_status', {
    p_workspace_id: workspaceId,
  })
  if (error) throw error
  return (data ?? []) as CredentialStatus[]
}

interface SaveInput {
  provider: CredentialProvider
  secret: string
  metadata: Record<string, unknown>
}

async function saveCredential(input: SaveInput): Promise<number> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  // Chaves de API nunca contêm espaços/quebras de linha legítimos. Colar de
  // e-mail/PDF/WhatsApp pode trazer \n no meio, o que quebra o header HTTP
  // na hora de usar a chave (o teste falha com erro genérico). Limpa aqui.
  const cleanSecret = input.secret.replace(/\s+/g, '')

  // Porteiro (Fase 4/Fatia 1): guarda is_workspace_admin, vault.create_secret + upsert
  // (rotation_version+1). Retorna SO rotation_version — a chave nunca volta.
  const { data, error } = await supabase.rpc('save_workspace_credential', {
    p_workspace_id: workspaceId,
    p_provider: input.provider,
    p_secret: cleanSecret,
    p_metadata: input.metadata,
  })
  if (error) throw error
  return data as number
}

export function useCredentialsStatus() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchStatus,
  })
}

export function useSaveCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      toast.success('Chave salva com segurança')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao salvar a chave'
      toast.error(message)
    },
  })
}

async function revokeCredential(provider: CredentialProvider): Promise<void> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { error } = await supabase.rpc('revoke_workspace_credential', {
    p_workspace_id: workspaceId,
    p_provider: provider,
  })
  if (error) throw error
}

export function useRevokeCredential() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: revokeCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      toast.success('Chave revogada com segurança')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao revogar a chave'
      toast.error(message)
    },
  })
}

// Resultado do teste de UMA conta Meta (Fase 15 — multi-conta).
export interface MetaAccountTestResult {
  account_id: string
  ok: boolean
  name?: string
  error?: string
}

interface TestConnectionResult {
  ok: boolean
  error?: string
  // Fase 15 (provider meta): detalhe por conta testada. Ausente nos demais
  // providers e em respostas antigas (single-conta) — a UI trata como opcional.
  accounts?: MetaAccountTestResult[]
}

async function testConnection(provider: CredentialProvider): Promise<TestConnectionResult> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  // Fase 4/Fatia 4: valida a chave contra a API do provedor (server-side).
  // A edge function nunca devolve a chave — so { ok, error?, accounts? }.
  const { data, error } = await supabase.functions.invoke<TestConnectionResult>(
    'test-workspace-credential',
    { body: { workspace_id: workspaceId, provider } }
  )
  if (error) {
    // FunctionsHttpError só traz a mensagem genérica "Edge Function returned a
    // non-2xx status code". A mensagem útil (ex.: "A chave OpenRouter foi
    // recusada.") está no corpo da resposta — extrai de lá antes de lançar.
    const context = (error as { context?: Response }).context
    const body = context
      ? await context.json().catch(() => null) as TestConnectionResult | null
      : null
    // Fase 15: quando o corpo traz o detalhe por conta, devolve o resultado
    // completo (ok:false + accounts) para a UI exibir conta a conta — o toast
    // de erro sai do onSuccess com ok:false, como no fluxo normal.
    if (body?.accounts) return body
    throw new Error(body?.error ?? 'Erro ao testar a conexão')
  }
  return data ?? { ok: false, error: 'Resposta vazia do servidor' }
}

export function useTestConnection() {
  return useMutation({
    mutationFn: testConnection,
    onSuccess: (result) => {
      if (result.ok) {
        toast.success('Conexão confirmada!')
      } else {
        toast.error(result.error ?? 'Não foi possível confirmar a conexão')
      }
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao testar a conexão'
      toast.error(message)
    },
  })
}
