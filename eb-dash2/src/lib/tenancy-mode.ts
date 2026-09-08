/**
 * Classificacao de tenancy (Fase 1 do plano multi-tenant).
 *
 * Decide, a partir de contagens, se uma conta opera no modelo "single-tenant"
 * (1 instancia = 1 empresa, usuario nunca ve workspace) ou "multi-tenant"
 * (agencia com varias sub-contas).
 *
 * Regra (secao 3.4 do plano):
 *   - single-tenant: nenhuma participacao em agencia (agencyMemberCount === 0)
 *     E no maximo 1 workspace ativo (workspaceCount <= 1).
 *   - multi-tenant: qualquer outro caso (>=2 workspaces, ou >=1 membership em
 *     agencia).
 *
 * Lado seguro: esta funcao e PURA (sem acesso a banco, sem alias `@`) para ser
 * importavel tanto pelo app (eb-dash2/src) quanto pelos testes de integracao da
 * raiz. A busca (COUNTs) fica em `resolveTenancyMode` (workspace.ts), que em
 * caso de erro de query cai em 'single-tenant' para nao expor UI nova antes da
 * hora.
 */

export type TenancyMode = 'single-tenant' | 'multi-tenant'

export function resolveTenancyModeFromCounts({
  workspaceCount,
  agencyMemberCount,
}: {
  workspaceCount: number
  agencyMemberCount: number
}): TenancyMode {
  if (agencyMemberCount === 0 && workspaceCount <= 1) {
    return 'single-tenant'
  }
  return 'multi-tenant'
}
