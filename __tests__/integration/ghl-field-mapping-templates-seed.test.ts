/**
 * Regressão do achado de auditoria (2026-07-12): ghl_field_mapping_templates
 * estava vazia no banco de teste apesar das migrations de seed existirem —
 * causa raiz: o baseline consolidado capturou a estrutura da tabela, mas as
 * migrations de seed (20260707000000/20260708000000) nunca chegaram a rodar.
 * Corrigido por 20260820000000_reseed_empire_default_template.sql.
 *
 * Este teste prova que o template "Empire Default" (os campos reais da conta
 * GHL do dono, documentados em docs/Document_GHL.md e
 * docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md) está populado — sem isso, o
 * assistente de IA e o wizard de onboarding não têm nenhuma sugestão para
 * oferecer a um workspace novo.
 */

import { describe, it, expect } from 'vitest';
import { getServiceClient } from '../helpers/supabase-test-client';

describe('seed do template "Empire Default" (ghl_field_mapping_templates)', () => {
  it('está populado com os campos reais documentados (não vazio)', async () => {
    const service = getServiceClient();
    const { data, error } = await service
      .from('ghl_field_mapping_templates')
      .select('logical_name, ghl_field_key, is_required')
      .eq('name', 'Empire Default');

    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(50);
  });

  it('contém os campos obrigatórios usados por extrair_dados_ghl_v2', async () => {
    const service = getServiceClient();
    const { data, error } = await service
      .from('ghl_field_mapping_templates')
      .select('logical_name')
      .eq('name', 'Empire Default')
      .eq('is_required', true);

    expect(error).toBeNull();
    const names = (data ?? []).map((r) => r.logical_name);
    expect(names).toEqual(expect.arrayContaining(['opportunity_id', 'pipeline_id_opp']));
  });

  it('contém os campos de UTM/atribuição de tráfego', async () => {
    const service = getServiceClient();
    const { data, error } = await service
      .from('ghl_field_mapping_templates')
      .select('logical_name')
      .eq('name', 'Empire Default')
      .in('logical_name', ['utm_source', 'utm_medium', 'utm_campaign', 'ip', 'fbclid']);

    expect(error).toBeNull();
    expect((data ?? []).length).toBe(5);
  });
});
