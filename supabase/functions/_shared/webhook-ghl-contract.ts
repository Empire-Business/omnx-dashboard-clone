// Contrato de Webhook CRM OMNX (docs/CONTRATO-WEBHOOK-CRM.md) — validacao de
// FORMATO (shape), nao de autenticacao (isso e webhook-ghl-auth.ts).
//
// Modulo PURO (sem imports Deno/esm) testado em Node (vitest) e importado
// pela edge function Deno, mesmo padrao de webhook-ghl-auth.ts.
//
// Principio: NUNCA bloquear/descartar um evento por causa de formato — o
// evento sempre e gravado em webhooks_ghl (fonte de verdade imutavel). Esta
// checagem so gera um aviso: (a) no corpo da resposta HTTP sincrona, para
// quem estiver testando o proprio payload via curl antes de configurar o
// CRM (docs/CONTRATO-WEBHOOK-CRM.md#como-testar), e (b) registrado em
// webhook_contract_mismatches, para o dono acompanhar quais clientes fogem
// do contrato (vigilancia).
//
// A mensagem de aviso NUNCA expoe detalhe tecnico interno (nome de tabela,
// coluna, funcao SQL, stack trace) — so referencia a documentacao publica
// do contrato.

// Espelha get_contract_known_customdata_keys() em
// supabase/migrations/20261006000001_contrato_webhook_campo_escape.sql —
// se uma lista mudar, a outra tem que mudar junto (mesma fonte de verdade
// conceitual: docs/CONTRATO-WEBHOOK-CRM.md).
const KNOWN_CUSTOMDATA_KEYS = new Set<string>([
  '{{opportunity.mqlcontato1}}', '{{opportunity.d_mqlcontato1}}',
  '{{opportunity.mqlcontato2}}', '{{opportunity.d_mqlcontato2}}',
  '{{opportunity.mqlcontato3}}', '{{opportunity.d_mqlcontato3}}',
  '{{opportunity.mqlcontato4}}', '{{opportunity.d_mqlcontato4}}',
  '{{opportunity.mqlcontato5}}', '{{opportunity.d_mqlcontato5}}',
  '{{opportunity.mqlcontato6}}', '{{opportunity.d_mqlcontato6}}',
  '{{opportunity.mqlcontato7}}', '{{opportunity.d_mqlcontato7}}',
  '{{opportunity.mqlcontato8}}', '{{opportunity.d_mqlcontato8}}',
  '{{opportunity.mqlno_show}}', '{{opportunity.d_mqlno_show}}',
  '{{opportunity.mqlconectado}}', '{{opportunity.d_mqlconectado}}',
  '{{opportunity.mqlperdido}}', '{{opportunity.d_mqlperdido}}',
  '{{opportunity.mqlqualificado}}', '{{opportunity.d_mqlqualificado}}',
  '{{opportunity.mqlreunio_marcada}}', '{{opportunity.d_mqlreunio_marcada}}',
  '{{opportunity.sqlpendencias_preenchimento}}', '{{opportunity.d__sqlpendencias_preenchimento}}',
  '{{opportunity.sqlno_show}}', '{{opportunity.d_sqlno_show}}',
  '{{opportunity.sqlperdida}}', '{{opportunity.d_sqlperdida}}',
  '{{opportunity.sqlreunio_agendada}}', '{{opportunity.d_sqlreunio_agendada}}',
  '{{opportunity.sqlreunio_realizada}}', '{{opportunity.d_sqlreunio_realizada}}',
  '{{opportunity.data_da_reunio_realizada}}',
  '{{opportunity.sqlnegociao}}', '{{opportunity.d_sqlnegociao}}',
  '{{opportunity.sqlfechada}}', '{{opportunity.d_sqlfechada}}',
  '{{opportunity.data_da_reunio}}', '{{opportunity.d_data_da_reunio}}',
  '{{opportunity.reuniao_realizada}}', '{{opportunity.d_reuniao_realizada}}',
  '{{opportunity.mqlauto_agendamento}}',
  '{{opportunity.assignedToUsersName}}',
  '{{opportunity.lost_reason}}',
  '{{opportunity.resumo_ia}}',
  '{{opportunity.percepo_do_closer}}',
  '{{opportunity.ltima_atividade}}',
  '{{opportunity.source}}',
  '{{opportunity.valor_a_ser_pago_de_entrada}}',
  '{{opportunity.numero_parcelas}}',
  '{{opportunity.valor_parcela}}',
  '{{opportunity.data_pagamento_entrada}}',
  '{{opportunity.nome_contratante}}',
  '{{opportunity.cpf_ou_cnpj_do_contratante}}',
  '{{opportunity.produto_que_foi_vendido}}',
  '{{opportunity.forma_de_pagamento}}',
  '{{opportunity.logradouro_rua_avenida}}',
  '{{opportunity.numero_endereco}}',
  '{{opportunity.complemento_do_endereo}}',
  '{{opportunity.bairro}}',
  '{{opportunity.municipio}}',
  '{{opportunity.estado_uf}}',
  '{{opportunity.cep}}',
  '{{opportunity.observacoes_venda}}',
  '{{opportunity.op_vencimentos_e_parcelas}}',
  '{{opportunity.op_link_do_contrato_assinado}}',
  '{{opportunity.data_da_assinatura_do_contrato}}',
  '{{opportunity.link_da_gravao_da_call_de_vendas}}',
]);

function normalizeCustomDataKey(key: string): string {
  return key.replace(/\s+/g, '');
}

export interface ContractShapeResult {
  /** Vazio quando o payload tem pelo menos um identificador reconhecido (contact_id, id, ou e evento de mensagem). */
  missingIdentifiers: string[];
  /** Chaves de customData ({{opportunity.x}}) que nao fazem parte do vocabulario fixo do contrato. */
  unknownCustomDataKeys: string[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Verifica o FORMATO do payload contra o contrato — nunca a autenticacao.
 * Nao lanca excecao para nenhuma entrada; payload invalido/vazio so gera
 * resultado "sem identificador".
 */
export function checkContractShape(payload: unknown): ContractShapeResult {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;

  const hasContactId = isNonEmptyString(p.contact_id);
  const hasOpportunityId = isNonEmptyString(p.id);
  const isMessageEvent =
    isNonEmptyString(p.conversationId as string | undefined) ||
    p.type === 'InboundMessage' ||
    p.type === 'OutboundMessage';

  const missingIdentifiers: string[] = [];
  if (!hasContactId && !hasOpportunityId && !isMessageEvent) {
    missingIdentifiers.push('contact_id_ou_id');
  }

  const customData =
    p.customData && typeof p.customData === 'object' && !Array.isArray(p.customData)
      ? (p.customData as Record<string, unknown>)
      : {};

  const unknownCustomDataKeys = Object.keys(customData).filter(
    (k) => k.startsWith('{{') && !KNOWN_CUSTOMDATA_KEYS.has(normalizeCustomDataKey(k)),
  );

  return { missingIdentifiers, unknownCustomDataKeys };
}

/**
 * Mensagens de aviso PUBLICAS (sem detalhe tecnico interno) para o corpo da
 * resposta HTTP — usadas por quem estiver testando o proprio payload antes
 * de configurar o CRM (docs/CONTRATO-WEBHOOK-CRM.md#como-testar).
 */
export function buildContractWarnings(shape: ContractShapeResult): string[] {
  const warnings: string[] = [];
  if (shape.missingIdentifiers.length > 0) {
    warnings.push(
      'Payload sem "contact_id" nem "id" — todo evento precisa de pelo menos um identificador. Consulte docs/CONTRATO-WEBHOOK-CRM.md.',
    );
  }
  if (shape.unknownCustomDataKeys.length > 0) {
    warnings.push(
      `${shape.unknownCustomDataKeys.length} campo(s) de customData fora do contrato foram recebidos e guardados como dado extra (não viram métrica). Consulte docs/CONTRATO-WEBHOOK-CRM.md#campo-de-escape.`,
    );
  }
  return warnings;
}
