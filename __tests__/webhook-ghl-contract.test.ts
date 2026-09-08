/**
 * Contrato de Webhook CRM OMNX — validação de FORMATO, teste PURO (node).
 *
 * checkContractShape nunca lança exceção e nunca bloqueia — só sinaliza
 * quando falta identificador (contact_id/id) ou quando customData traz
 * chave fora do vocabulário fixo do contrato (docs/CONTRATO-WEBHOOK-CRM.md).
 */

import { describe, it, expect } from 'vitest';
import { checkContractShape, buildContractWarnings } from '../supabase/functions/_shared/webhook-ghl-contract';

describe('checkContractShape — identificadores', () => {
  it('contact_id presente => sem missingIdentifiers', () => {
    const shape = checkContractShape({ contact_id: 'C-1' });
    expect(shape.missingIdentifiers).toEqual([]);
  });

  it('id (oportunidade) presente => sem missingIdentifiers', () => {
    const shape = checkContractShape({ id: 'OPP-1' });
    expect(shape.missingIdentifiers).toEqual([]);
  });

  it('evento de mensagem (conversationId) => sem missingIdentifiers mesmo sem contact_id/id', () => {
    const shape = checkContractShape({ conversationId: 'CONV-1' });
    expect(shape.missingIdentifiers).toEqual([]);
  });

  it('evento de mensagem (type InboundMessage/OutboundMessage) => sem missingIdentifiers', () => {
    expect(checkContractShape({ type: 'InboundMessage' }).missingIdentifiers).toEqual([]);
    expect(checkContractShape({ type: 'OutboundMessage' }).missingIdentifiers).toEqual([]);
  });

  it('sem contact_id, id, conversationId ou type de mensagem => flag contact_id_ou_id', () => {
    expect(checkContractShape({}).missingIdentifiers).toEqual(['contact_id_ou_id']);
    expect(checkContractShape({ foo: 'bar' }).missingIdentifiers).toEqual(['contact_id_ou_id']);
    expect(checkContractShape(null).missingIdentifiers).toEqual(['contact_id_ou_id']);
    expect(checkContractShape(undefined).missingIdentifiers).toEqual(['contact_id_ou_id']);
  });

  it('contact_id vazio/whitespace conta como ausente', () => {
    expect(checkContractShape({ contact_id: '   ' }).missingIdentifiers).toEqual(['contact_id_ou_id']);
    expect(checkContractShape({ contact_id: 123 }).missingIdentifiers).toEqual(['contact_id_ou_id']);
  });
});

describe('checkContractShape — customData conhecido vs desconhecido', () => {
  it('chave conhecida do contrato => sem unknownCustomDataKeys', () => {
    const shape = checkContractShape({
      contact_id: 'C-1',
      customData: { '{{opportunity.mqlconectado}}': '2026-01-01' },
    });
    expect(shape.unknownCustomDataKeys).toEqual([]);
  });

  it('chave conhecida COM espacos internos (variacao GHL) => ainda reconhecida', () => {
    const shape = checkContractShape({
      contact_id: 'C-1',
      customData: { '{{ opportunity.data_pagamento_entrada }}': '2026-01-01' },
    });
    expect(shape.unknownCustomDataKeys).toEqual([]);
  });

  it('chave fora do contrato => aparece em unknownCustomDataKeys', () => {
    const shape = checkContractShape({
      contact_id: 'C-1',
      customData: { '{{opportunity.campo_que_o_cliente_inventou}}': 'valor' },
    });
    expect(shape.unknownCustomDataKeys).toEqual(['{{opportunity.campo_que_o_cliente_inventou}}']);
  });

  it('customData ausente/vazio => sem unknownCustomDataKeys', () => {
    expect(checkContractShape({ contact_id: 'C-1' }).unknownCustomDataKeys).toEqual([]);
    expect(checkContractShape({ contact_id: 'C-1', customData: {} }).unknownCustomDataKeys).toEqual([]);
  });

  it('customData nao-objeto (array) => tratado como vazio, sem crash', () => {
    expect(checkContractShape({ contact_id: 'C-1', customData: [] as unknown }).unknownCustomDataKeys).toEqual([]);
  });

  it('chave que nao comeca com {{ (nao e campo customizado GHL) e ignorada', () => {
    const shape = checkContractShape({ contact_id: 'C-1', customData: { foo: 'bar' } });
    expect(shape.unknownCustomDataKeys).toEqual([]);
  });
});

describe('buildContractWarnings — mensagens publicas, sem detalhe tecnico', () => {
  it('shape conforme => sem warnings', () => {
    expect(buildContractWarnings({ missingIdentifiers: [], unknownCustomDataKeys: [] })).toEqual([]);
  });

  it('identificador faltando => warning referencia a doc do contrato', () => {
    const warnings = buildContractWarnings({ missingIdentifiers: ['contact_id_ou_id'], unknownCustomDataKeys: [] });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('CONTRATO-WEBHOOK-CRM.md');
    expect(warnings[0]).not.toMatch(/sql|table|column|stack/i);
  });

  it('customData desconhecido => warning conta quantos, referencia a doc', () => {
    const warnings = buildContractWarnings({
      missingIdentifiers: [],
      unknownCustomDataKeys: ['{{opportunity.a}}', '{{opportunity.b}}'],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('2 campo(s)');
    expect(warnings[0]).toContain('CONTRATO-WEBHOOK-CRM.md');
  });

  it('os dois problemas juntos => dois warnings', () => {
    const warnings = buildContractWarnings({
      missingIdentifiers: ['contact_id_ou_id'],
      unknownCustomDataKeys: ['{{opportunity.a}}'],
    });
    expect(warnings).toHaveLength(2);
  });
});
