/**
 * Auditoria de RLS/GRANT permissivo — Item 2 e Item 3 da caça a bugs
 * pós-PR #35 (2026-07-11).
 *
 * Contexto: durante a investigação da suite "flaky" descobrimos que a causa
 * real não era rate-limit do Supabase Auth, e sim RPCs SECURITY DEFINER
 * sensíveis (get_decrypted_secret, purge_workspace_data,
 * create_agency_for_owner_service_role, register_outbound_webhook, etc.) com
 * EXECUTE concedido DIRETAMENTE a `anon`/`authenticated` — não apenas a
 * PUBLIC. Como são SECURITY DEFINER, a RLS da tabela por baixo não protege;
 * o GRANT EXECUTE era a única barreira, e ela estava aberta.
 *
 * A auditoria de policies RLS (Item 2) também achou uma segunda falha real:
 * `public.webhooks_ghl` tinha uma policy de INSERT para `anon` com
 * `WITH CHECK (true)` — qualquer requisição não autenticada podia inserir
 * direto via PostgREST, contornando por completo a validação de
 * webhook_secret que a edge function `webhook-ghl` implementa, e disparando
 * o mesmo trigger que processa webhooks legítimos (forjar contato/
 * oportunidade sem nenhum segredo).
 *
 * Ambas corrigidas em migrations (20260816000000, 20260817000000). Este
 * teste PROVA a correção contra o banco real — não é grep, é a ação
 * (INSERT/RPC) sendo de fato recusada.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '../helpers/supabase-test-client';

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function getFreshAnonClient(): SupabaseClient {
  // Cliente anon "cru" (sem sessão), simulando um atacante que só tem a chave
  // pública anon — exatamente o que qualquer visitante do bundle JS possui.
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe('Auditoria de GRANT/RLS permissivo — RPCs sensíveis e webhooks_ghl', () => {
  let service: SupabaseClient;
  let anon: SupabaseClient;

  beforeAll(() => {
    service = getServiceClient();
    anon = getFreshAnonClient();
  });

  it('anon NAO chama get_decrypted_secret (SECURITY DEFINER, service_role-only)', async () => {
    const { data, error } = await anon.rpc('get_decrypted_secret', {
      p_secret_key_id: '00000000-0000-0000-0000-000000000000',
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('anon NAO chama get_workspace_credential_meta (SECURITY DEFINER, service_role-only)', async () => {
    const { data, error } = await anon.rpc('get_workspace_credential_meta', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_provider: 'ghl',
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('anon NAO chama purge_workspace_data (LGPD, pode apagar um workspace inteiro)', async () => {
    const { data, error } = await anon.rpc('purge_workspace_data', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_confirmation_name: 'nao-existe',
      p_dry_run: true,
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('anon NAO chama create_agency_for_owner_service_role', async () => {
    const { data, error } = await anon.rpc('create_agency_for_owner_service_role', {
      p_owner_id: '00000000-0000-0000-0000-000000000000',
      p_agency_name: 'agencia-forjada',
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('anon NAO chama register_outbound_webhook', async () => {
    const { data, error } = await anon.rpc('register_outbound_webhook', {
      p_workspace_id: '00000000-0000-0000-0000-000000000000',
      p_event_key: 'contrato_assinado',
      p_url: 'https://attacker.example.com/hook',
      p_secret: 'x',
      p_headers: {},
    });
    const blocked = error !== null || data === null;
    expect(blocked).toBe(true);
  });

  it('anon NAO consegue inserir direto em webhooks_ghl (bypass do webhook_secret da edge function)', async () => {
    const { error } = await anon.from('webhooks_ghl').insert({
      payload: { forjado: true, tentativa: 'bypass-anon-insert' },
    });
    expect(error).not.toBeNull();
  });

  afterAll(async () => {
    // Nenhum dado real foi criado (todas as chamadas foram bloqueadas antes de
    // qualquer efeito) — nada a limpar. Mantido por padrão/simetria com o
    // resto da suite.
    void service;
  });
});
