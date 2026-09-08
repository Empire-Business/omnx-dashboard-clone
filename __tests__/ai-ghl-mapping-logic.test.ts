import { describe, it, expect, vi } from 'vitest';
import {
  parseProposal,
  callModelWithRetry,
  InvalidProposalJsonError,
  restrictProposalToFieldTarget,
} from '../supabase/functions/_shared/ai-ghl-mapping-logic';

const VALID_JSON = JSON.stringify({
  fields: [{ ghl_field_key: 'nome', logical_name: 'nome_contato', confidence: 0.9 }],
  pipelines: [],
  stages: [],
  explanation: 'ok',
  warnings: [],
});

describe('parseProposal', () => {
  it('parseia JSON válido', () => {
    const proposal = parseProposal(VALID_JSON);
    expect(proposal.fields).toHaveLength(1);
    expect(proposal.fields[0].logical_name).toBe('nome_contato');
  });

  it('extrai JSON envolto em texto (markdown/explicação)', () => {
    const wrapped = `Aqui está a proposta:\n\`\`\`json\n${VALID_JSON}\n\`\`\`\nEspero que ajude.`;
    const proposal = parseProposal(wrapped);
    expect(proposal.fields).toHaveLength(1);
  });

  it('lança InvalidProposalJsonError (não Error genérico) quando não há chaves', () => {
    expect(() => parseProposal('isso não é JSON')).toThrow(InvalidProposalJsonError);
  });

  it('lança InvalidProposalJsonError quando o JSON está malformado', () => {
    expect(() => parseProposal('{ "fields": [ }')).toThrow(InvalidProposalJsonError);
  });

  it('filtra itens de fields/pipelines/stages sem as chaves obrigatórias', () => {
    const partial = JSON.stringify({
      fields: [{ ghl_field_key: 'nome' }, { logical_name: 'sem_key' }, null],
      pipelines: [{ ghl_pipeline_id: 'p1', system_category: 'vendas' }, {}],
      stages: 'not-an-array',
      explanation: 42,
      warnings: ['ok', 1, null],
    });
    const proposal = parseProposal(partial);
    expect(proposal.fields).toHaveLength(0);
    expect(proposal.pipelines).toHaveLength(1);
    expect(proposal.stages).toEqual([]);
    expect(proposal.explanation).toBe('');
    expect(proposal.warnings).toEqual(['ok']);
  });
});

describe('callModelWithRetry', () => {
  it('retorna na primeira tentativa quando o JSON já é válido', async () => {
    const fetchModel = vi.fn().mockResolvedValue(VALID_JSON);
    const result = await callModelWithRetry(fetchModel, 'prompt base');
    expect(result.attempts).toBe(1);
    expect(fetchModel).toHaveBeenCalledTimes(1);
    expect(fetchModel).toHaveBeenCalledWith('prompt base');
  });

  it('tenta de novo com instrução reforçada quando a 1ª resposta não é JSON válido', async () => {
    const fetchModel = vi
      .fn()
      .mockResolvedValueOnce('desculpe, não consigo ajudar com isso')
      .mockResolvedValueOnce(VALID_JSON);
    const result = await callModelWithRetry(fetchModel, 'prompt base');
    expect(result.attempts).toBe(2);
    expect(fetchModel).toHaveBeenCalledTimes(2);
    const secondCallPrompt = fetchModel.mock.calls[1][0] as string;
    expect(secondCallPrompt).toContain('prompt base');
    expect(secondCallPrompt).toContain('EXCLUSIVAMENTE');
  });

  it('lança InvalidProposalJsonError se as 2 tentativas falharem', async () => {
    const fetchModel = vi.fn().mockResolvedValue('nunca retorna JSON');
    await expect(callModelWithRetry(fetchModel, 'prompt base')).rejects.toThrow(
      InvalidProposalJsonError,
    );
    expect(fetchModel).toHaveBeenCalledTimes(2);
  });

  it('propaga erros que não são de parsing (ex: falha de rede) sem retry', async () => {
    const networkError = new Error('OpenRouter error 500: timeout');
    const fetchModel = vi.fn().mockRejectedValue(networkError);
    await expect(callModelWithRetry(fetchModel, 'prompt base')).rejects.toBe(networkError);
    expect(fetchModel).toHaveBeenCalledTimes(1);
  });
});

describe('restrictProposalToFieldTarget', () => {
  it('mantém somente a categoria permitida para o campo escolhido', () => {
    const proposal = restrictProposalToFieldTarget(
      {
        fields: [
          { ghl_field_key: 'data_reuniao', logical_name: 'data_reuniao', confidence: 0.91 },
          { ghl_field_key: 'telefone', logical_name: 'telefone', confidence: 0.98 },
        ],
        pipelines: [{ ghl_pipeline_id: 'pipeline-1', system_category: 'vendas', confidence: 0.8 }],
        stages: [{ ghl_stage_id: 'stage-1', system_stage: 'fechado', confidence: 0.8 }],
        explanation: 'Campo de agendamento.',
        warnings: [],
      },
      'data_reuniao',
      new Set(['data_reuniao']),
    );

    expect(proposal.fields).toEqual([
      { ghl_field_key: 'data_reuniao', logical_name: 'data_reuniao', confidence: 0.91 },
    ]);
    expect(proposal.pipelines).toEqual([]);
    expect(proposal.stages).toEqual([]);
    expect(proposal.outcome).toBe('mapped');
    expect(proposal.explanation).toBe('Campo de agendamento.');
  });

  it('recusa categoria desconhecida mesmo quando a chave do campo confere', () => {
    const proposal = restrictProposalToFieldTarget(
      {
        fields: [{ ghl_field_key: 'origem', logical_name: 'categoria_inventada', confidence: 0.9 }],
        pipelines: [],
        stages: [],
        explanation: 'Mapeei com alta confiança.',
        warnings: [],
      },
      'origem',
      new Set(['utm_source']),
    );

    expect(proposal.fields).toEqual([]);
    expect(proposal.outcome).toBe('not_in_vocabulary');
    // A explanation da IA descreve um mapeamento recusado — não pode chegar à UI.
    expect(proposal.explanation).toBe('');
    expect(proposal.warnings).toEqual([]);
  });

  it('marca unclear quando a IA não sugere nada para o campo alvo', () => {
    const proposal = restrictProposalToFieldTarget(
      {
        fields: [{ ghl_field_key: 'outro_campo', logical_name: 'utm_source', confidence: 0.9 }],
        pipelines: [],
        stages: [],
        explanation: 'Não consegui classificar.',
        warnings: [],
      },
      'origem',
      new Set(['utm_source']),
    );

    expect(proposal.fields).toEqual([]);
    expect(proposal.outcome).toBe('unclear');
    expect(proposal.explanation).toBe('');
  });

  it('marca unclear quando a IA retorna fields vazio', () => {
    const proposal = restrictProposalToFieldTarget(
      { fields: [], pipelines: [], stages: [], explanation: 'sem ideia', warnings: [] },
      'origem',
      new Set(['utm_source']),
    );

    expect(proposal.fields).toEqual([]);
    expect(proposal.outcome).toBe('unclear');
  });
});
