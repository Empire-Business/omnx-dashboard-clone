/**
 * Aplica workspace_id a toda leitura da Clara. A função usa service_role para
 * consultar dados, portanto este guard é obrigatório: sem ele o RLS é ignorado.
 */
const WORKSPACE_TABLES = new Set([
  'contatos',
  'comunicacoes',
  'ghl_users',
  'goal_versions',
  'meta_ads_insights',
  'oportunidades',
  'utm_campaigns',
  'utm_sources',
  'vendas_fechamento',
])

export function createWorkspaceScopedClient<T extends { from: (table: string) => unknown }>(
  client: T,
  workspaceId: string,
): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property !== 'from') return Reflect.get(target, property, receiver)

      return (table: string) => {
        const builder = target.from(table) as Record<string, unknown>
        if (!WORKSPACE_TABLES.has(table)) return builder

        return new Proxy(builder, {
          get(query, queryProperty, queryReceiver) {
            if (queryProperty !== 'select') return Reflect.get(query, queryProperty, queryReceiver)
            return (...args: unknown[]) => {
              const selected = (query.select as (...values: unknown[]) => { eq: (column: string, value: string) => unknown })(...args)
              return selected.eq('workspace_id', workspaceId)
            }
          },
        })
      }
    },
  })
}
