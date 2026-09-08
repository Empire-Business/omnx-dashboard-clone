/**
 * Fase 6 (fatia 1) — Denormalizacao de workspace_id em oportunidades,
 * comunicacoes e vendas_fechamento — docs/PLANO-MULTI-TENANT-AGENCY.md (secao 4.3)
 *
 * Prova que o trigger BEFORE INSERT preenche workspace_id automaticamente a
 * partir do contato (ou da oportunidade, no caso de vendas_fechamento) —
 * fechando o gap para linhas NOVAS depois do backfill historico da migration
 * 20260803000000_fase6_denormaliza_workspace_id_crm.sql.
 *
 * Evita disparar efeitos colaterais dos outros triggers dessas tabelas
 * (mesma cautela documentada em agency-data-access.test.ts):
 *  - oportunidades: `data_lead_recebido` preenchido evita
 *    trigger_sync_opp_dates() (so dispara se NULL).
 *  - comunicacoes: `direction='outbound'` evita auto_tag_conectado_on_inbound
 *    (so processa 'inbound').
 *  - vendas_fechamento: nao preenche `op_link_do_contrato_assinado`, entao
 *    notify_openclaw_contrato_assinado() retorna cedo (guard de NULL).
 *
 * Producao (qzesffnkqgelmtfblzkr) nao e alvo — banco de TESTE via .env.test.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  getServiceClient,
  createTestUser,
  createTestWorkspace,
  deleteTestUsers,
  uniqueEmail,
  TestUser,
  TestWorkspace,
} from '../helpers/supabase-test-client';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Fase 6 (fatia 1) — trigger de workspace_id em oportunidades/comunicacoes/vendas_fechamento', () => {
  let service: SupabaseClient;
  let owner: TestUser;
  let workspace: TestWorkspace;
  const run = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  let contatoId: string;
  let oportunidadeId: string;
  let comunicacaoId: string;
  let vendaId: string;

  beforeAll(async () => {
    service = getServiceClient();
    owner = await createTestUser(service, uniqueEmail('fase6-owner'), 'TestPassword123!');
    workspace = await createTestWorkspace(service, 'Fase6 Denorm WS', owner.id);

    const { data: contato, error: eContato } = await service
      .from('contatos')
      .insert({ workspace_id: workspace.id, ghl_id: `fase6-${run}`, nome: 'Contato Fase6' })
      .select('id')
      .single();
    if (eContato) throw new Error(`contato: ${eContato.message}`);
    contatoId = (contato as { id: string }).id;
  });

  afterAll(async () => {
    if (vendaId) await service.from('vendas_fechamento').delete().eq('id', vendaId);
    if (comunicacaoId) await service.from('comunicacoes').delete().eq('id', comunicacaoId);
    if (oportunidadeId) await service.from('oportunidades').delete().eq('id', oportunidadeId);
    await service.from('contatos').delete().eq('id', contatoId);
    await service.from('workspaces').delete().eq('id', workspace.id);
    await deleteTestUsers(service, [owner.id]);
  });

  it('oportunidades: trigger preenche workspace_id a partir do contato', async () => {
    const { data, error } = await service
      .from('oportunidades')
      .insert({
        contato_id: contatoId,
        nome_contato: 'Contato Fase6',
        ghl_opportunity_id: `fase6-opp-${run}`,
        data_lead_recebido: new Date().toISOString(), // evita trigger_sync_opp_dates
      })
      .select('id, workspace_id')
      .single();
    expect(error).toBeNull();
    oportunidadeId = (data as { id: string }).id;
    expect((data as { workspace_id: string }).workspace_id).toBe(workspace.id);
  });

  it('comunicacoes: trigger preenche workspace_id a partir do contato', async () => {
    const { data, error } = await service
      .from('comunicacoes')
      .insert({
        contato_id: contatoId,
        tipo: 'mensagem',
        direction: 'outbound', // evita auto_tag_conectado_on_inbound (so processa 'inbound')
      })
      .select('id, workspace_id')
      .single();
    expect(error).toBeNull();
    comunicacaoId = (data as { id: string }).id;
    expect((data as { workspace_id: string }).workspace_id).toBe(workspace.id);
  });

  it('vendas_fechamento: trigger preenche workspace_id via contato/oportunidade (COALESCE)', async () => {
    const { data, error } = await service
      .from('vendas_fechamento')
      .insert({
        contato_id: contatoId,
        oportunidade_id: oportunidadeId,
        // op_link_do_contrato_assinado deliberadamente omitido: evita
        // notify_openclaw_contrato_assinado (guard de NULL retorna cedo).
      })
      .select('id, workspace_id')
      .single();
    expect(error).toBeNull();
    vendaId = (data as { id: string }).id;
    expect((data as { workspace_id: string }).workspace_id).toBe(workspace.id);
  });
});
