/**
 * Esqueleto de testes de isolamento para FASES FUTURAS (Fase 0.6 do plano).
 *
 * Cada `it.todo` abaixo referencia a fase que o habilita e o comportamento que
 * precisa ser provado. Eles aparecem no relatório da suite como "todo" (não
 * rodam, não tocam no banco) para que a cobertura futura fique mapeada e
 * visível desde já.
 *
 * Como destravar: quando a fase correspondente for implementada, troque o
 * `it.todo` por `it(...)` com a prova real (seed nos 2 workspaces sintéticos +
 * assert de isolamento), seguindo o padrão de `workspace-isolation.test.ts`.
 */
import { describe, it } from 'vitest'

describe('Fase 1 — Modelo Agency (agencies / agency_members / agency_workspaces)', () => {
  it.todo('membro da agência vê apenas os workspaces da própria agência')
  it.todo('RLS aditiva filtra membros da agência por status ativo')
  it.todo('transferência de workspace entre agências é bloqueada para não-owner')
  it.todo('workspace sem agência (single-tenant) continua isolado como antes')
})

describe('Fase 2 — Isolamento de credenciais por workspace (Vault)', () => {
  it.todo('workspace A não consegue ler a credencial do workspace B')
  it.todo('webhook-ghl usa a credencial do workspace da location (sem fallback global)')
  it.todo('credencial trocada entre tenants falha duro (kill-switch da Fase 2)')
  it.todo('unicidade de ghl location_id impede dois workspaces com a mesma location')
})

describe('Fase 2 — outbound_webhooks com RLS', () => {
  it.todo('workspace A não lê outbound_webhooks do workspace B')
  it.todo('disparo de outbound_webhook respeita o workspace de origem')
})
