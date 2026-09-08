/**
 * Helpers de integração com o CRM (GoHighLevel white label).
 *
 * O domínio base é o white label da instância (`crm.omnx.pro`) — nunca
 * `app.gohighlevel.com`, que o usuário final não reconhece. Pode ser
 * sobrescrito por `VITE_CRM_APP_BASE_URL` (ex.: outra instância/tenant).
 * O location ID vem do banco (`ghl_integration_settings` do workspace);
 * quando não está configurado, os helpers retornam `null` e a UI deve
 * omitir o link em vez de apontar para uma location errada.
 */

const CRM_APP_BASE_URL =
  (import.meta.env.VITE_CRM_APP_BASE_URL as string | undefined) ?? 'https://crm.omnx.pro'

/**
 * URL pública do contato no CRM a partir do location ID vindo do banco
 * (`ghl_integration_settings.ghl_location_id` do workspace) — caminho
 * multi-tenant, independente de variável de ambiente. Retorna `null`
 * quando a location não está configurada no workspace.
 */
export function ghlContactUrlForLocation(locationId: string | null | undefined, ghlId: string): string | null {
  if (!locationId) return null
  return `${CRM_APP_BASE_URL}/v2/location/${locationId}/contacts/detail/${ghlId}`
}
