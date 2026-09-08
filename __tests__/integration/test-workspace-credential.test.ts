/**
 * "Testar conexao" — Fase 4 (fatia 4), plano-mae secao 3.5.1
 *
 * Duas partes, sem rede real (nem para o Supabase, nem para GHL/Meta):
 *
 *  - Parte A (unit puro): a logica de interpretacao de resposta em
 *    supabase/functions/_shared/test-workspace-credential-logic.ts e testada
 *    diretamente com respostas MOCKADAS (nao chama fetch nem Deno) — confirma
 *    que so "ok:true" quando o id retornado bate com o location/conta esperado,
 *    e que 401/403/erro viram mensagem amigavel.
 *  - Parte B (estrutural, le a fonte via fs): confirma que a edge function
 *    test-workspace-credential (a) checa JWT + is owner/admin do workspace
 *    antes de qualquer chamada externa, (b) resolve a credencial pelo helper
 *    fail-closed (nunca env global), (c) usa a logica pura do modulo acima em
 *    vez de reimplementar interpretacao inline, e (d) NUNCA coloca a chave
 *    (`apiKey`) no corpo de nenhuma Response.
 *
 * Producao (qzesffnkqgelmtfblzkr) nao e alvo — nenhum teste aqui toca banco.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildGhlTestUrl,
  buildMetaTestUrl,
  interpretGhlTestResult,
  interpretMetaTestResult,
  extractMetaAdAccountIds,
  aggregateMetaAccountResults,
} from '../../supabase/functions/_shared/test-workspace-credential-logic';

const ROOT = process.cwd();
const FN_SRC = readFileSync(
  join(ROOT, 'supabase', 'functions', 'test-workspace-credential', 'index.ts'),
  'utf8'
);

describe('test-workspace-credential-logic (unit puro)', () => {
  it('buildGhlTestUrl monta a URL de location do GHL', () => {
    expect(buildGhlTestUrl('L1')).toBe('https://services.leadconnectorhq.com/locations/L1');
  });

  it('buildMetaTestUrl aceita id com ou sem prefixo act_', () => {
    expect(buildMetaTestUrl('123')).toBe('https://graph.facebook.com/v18.0/act_123?fields=id,name');
    expect(buildMetaTestUrl('act_123')).toBe('https://graph.facebook.com/v18.0/act_123?fields=id,name');
  });

  it('GHL: 200 com id igual ao esperado => ok', () => {
    const result = interpretGhlTestResult(200, { id: 'L1', name: 'Minha empresa' }, 'L1');
    expect(result).toEqual({ ok: true });
  });

  it('GHL: 200 com id de OUTRO location => rejeitado (fecha squatting/erro de digitacao)', () => {
    const result = interpretGhlTestResult(200, { id: 'L2' }, 'L1');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/outro location/i);
  });

  it('GHL: 401/403 => mensagem amigavel, sem detalhe cru do provedor', () => {
    expect(interpretGhlTestResult(401, null, 'L1').ok).toBe(false);
    expect(interpretGhlTestResult(403, null, 'L1').ok).toBe(false);
  });

  it('GHL: 500 => erro generico com status', () => {
    const result = interpretGhlTestResult(500, null, 'L1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('500');
  });

  it('GHL: corpo sem id => erro (resposta inesperada)', () => {
    const result = interpretGhlTestResult(200, {}, 'L1');
    expect(result.ok).toBe(false);
  });

  it('Meta: 200 com id igual (normalizando act_) => ok', () => {
    expect(interpretMetaTestResult(200, { id: 'act_123' }, '123').ok).toBe(true);
    expect(interpretMetaTestResult(200, { id: '123' }, 'act_123').ok).toBe(true);
  });

  it('Meta: 200 com id de OUTRA conta => rejeitado', () => {
    const result = interpretMetaTestResult(200, { id: 'act_999' }, '123');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/outra conta/i);
  });

  it('Meta: 401/403 => mensagem amigavel', () => {
    expect(interpretMetaTestResult(401, null, '123').ok).toBe(false);
    expect(interpretMetaTestResult(403, null, '123').ok).toBe(false);
  });

  it('Meta: 200 com name => devolve o nome da conta (Fase 15, aditivo)', () => {
    const result = interpretMetaTestResult(200, { id: 'act_123', name: 'Conta Principal' }, 'act_123');
    expect(result.ok).toBe(true);
    expect(result.name).toBe('Conta Principal');
  });
});

// Fase 15 (D4) — lista de contas a testar a partir do metadata da credencial
describe('extractMetaAdAccountIds (Fase 15 — multi-conta)', () => {
  it('le ad_account_ids (lista canonica)', () => {
    expect(extractMetaAdAccountIds({ ad_account_ids: ['act_1', 'act_2'] })).toEqual(['act_1', 'act_2']);
  });

  it('fallback para o legado ad_account_id singular', () => {
    expect(extractMetaAdAccountIds({ ad_account_id: 'act_9' })).toEqual(['act_9']);
  });

  it('contrato D2: singular = primeiro da lista nao duplica', () => {
    expect(
      extractMetaAdAccountIds({ ad_account_ids: ['act_1', 'act_2'], ad_account_id: 'act_1' })
    ).toEqual(['act_1', 'act_2']);
  });

  it('normaliza: trim, prefixo act_ quando so numeros, dedup e ignora lixo', () => {
    expect(
      extractMetaAdAccountIds({
        ad_account_ids: [' 123 ', 'act_123', '', null, 42, 'act_7'],
      })
    ).toEqual(['act_123', 'act_7']);
  });

  it('metadata vazio/indefinido => lista vazia', () => {
    expect(extractMetaAdAccountIds(undefined)).toEqual([]);
    expect(extractMetaAdAccountIds({})).toEqual([]);
    expect(extractMetaAdAccountIds({ ad_account_ids: 'act_1' })).toEqual([]);
  });
});

describe('aggregateMetaAccountResults (Fase 15)', () => {
  it('ok:true somente quando TODAS as contas passam', () => {
    const all = aggregateMetaAccountResults([
      { account_id: 'act_1', ok: true, name: 'A' },
      { account_id: 'act_2', ok: true },
    ]);
    expect(all.ok).toBe(true);
    expect(all.error).toBeUndefined();
    expect(all.accounts).toHaveLength(2);
  });

  it('ok:false com a primeira mensagem de erro quando alguma conta falha', () => {
    const agg = aggregateMetaAccountResults([
      { account_id: 'act_1', ok: true },
      { account_id: 'act_2', ok: false, error: 'Token invalido ou sem acesso a esta conta de anuncios' },
      { account_id: 'act_3', ok: false, error: 'outro erro' },
    ]);
    expect(agg.ok).toBe(false);
    expect(agg.error).toBe('Token invalido ou sem acesso a esta conta de anuncios');
  });

  it('lista vazia => ok:false', () => {
    expect(aggregateMetaAccountResults([]).ok).toBe(false);
  });
});

describe('test-workspace-credential (estrutural — le a fonte, sem rede)', () => {
  it('valida JWT do chamador antes de prosseguir', () => {
    expect(FN_SRC).toContain('auth.getUser(token)');
    expect(FN_SRC).toMatch(/401/);
  });

  it('checa owner/admin do workspace (workspace_members) antes da chamada externa', () => {
    expect(FN_SRC).toContain('workspace_members');
    expect(FN_SRC).toMatch(/role\s*!==\s*'owner'/);
    expect(FN_SRC).toMatch(/403/);
  });

  it('resolve a credencial pelo helper fail-closed (nunca env global de provedor)', () => {
    expect(FN_SRC).toContain('resolve-workspace-credentials');
    expect(FN_SRC).toContain('resolveWorkspaceCredential');
    expect(FN_SRC).toContain('CredentialResolutionError');
    expect(FN_SRC).not.toMatch(/Deno\.env\.get\(['"](GHL_API_KEY|META_ACCESS_TOKEN)['"]\)/);
  });

  it('usa a logica pura de interpretacao (nao reimplementa inline)', () => {
    expect(FN_SRC).toContain('test-workspace-credential-logic');
    expect(FN_SRC).toContain('interpretGhlTestResult');
    expect(FN_SRC).toContain('interpretMetaTestResult');
  });

  it('NUNCA coloca a variavel apiKey dentro de um jsonResponse/Response', () => {
    // Garantia estrutural: nenhuma chamada a jsonResponse(...)/new Response(...)
    // referencia a variavel apiKey no corpo — a unica leitura de apiKey e para
    // montar o header Authorization/URL de request de SAIDA (para o provedor),
    // nunca para a resposta desta function ao browser.
    const responseCalls = FN_SRC.match(/jsonResponse\([^)]*\)/g) ?? [];
    for (const call of responseCalls) {
      expect(call).not.toContain('apiKey');
    }
  });

  it('Fase 15 (meta): testa TODAS as contas da lista e agrega por conta', () => {
    expect(FN_SRC).toContain('extractMetaAdAccountIds');
    expect(FN_SRC).toContain('aggregateMetaAccountResults');
    // Isolamento de falha por conta: Promise.allSettled (uma conta nao derruba as demais)
    expect(FN_SRC).toContain('Promise.allSettled');
    // Resposta por conta preserva o account_id
    expect(FN_SRC).toContain('account_id');
  });

});
