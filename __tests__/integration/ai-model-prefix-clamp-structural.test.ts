/**
 * Defesa residual no consumo — clamp de model_id proibido (camada 3).
 *
 * A escrita de modelos anthropic/* e openai/* já é bloqueada na camada 1
 * (clara-settings → HTTP 422) e na camada 2 (CHECK do banco, migration
 * 20260920000000). Esta suíte prova, sem subir Edge Functions nem banco, que
 * bot-chat e prevendas-ai ainda descartam no CONSUMO qualquer model_id com
 * provider proibido vindo de settings antigas: caem no Qwen padrão, com aviso
 * no log, ANTES de falar com o provedor — sem quebrar a request.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

const botChat = () => read('supabase/functions/bot-chat/index.ts');
const prevendasAi = () => read('supabase/functions/prevendas-ai/index.ts');

const consumers = () =>
  [
    ['bot-chat', botChat()],
    ['prevendas-ai', prevendasAi()],
  ] as const;

describe('Clamp de model_id proibido no consumo (bot-chat, prevendas-ai)', () => {
  it('ambas as functions carregam a mesma lista de prefixos proibidos da camada de escrita', () => {
    for (const [name, source] of consumers()) {
      expect(source, name).toContain("const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']");
    }
  });

  it('a detecção é robusta: trim + case-insensitive via startsWith', () => {
    for (const [name, source] of consumers()) {
      expect(source, name).toContain('function hasForbiddenModelPrefix(value: unknown): boolean');
      expect(source, name).toContain('value.trim().toLowerCase()');
      expect(source, name).toContain('FORBIDDEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))');
    }
  });

  it('o clamp cai no Qwen padrão e registra aviso no log — sem quebrar a request', () => {
    for (const [name, source] of consumers()) {
      expect(source, name).toContain("const DEFAULT_MODEL = 'qwen/qwen3.6-plus'");
      expect(source, name).toContain(`console.warn(\`[${name}] model_id proibido descartado`);
      expect(source, name).toMatch(/= DEFAULT_MODEL$/m);
    }
  });

  it('o default Qwen é único e centralizado (sem literais soltos)', () => {
    for (const [name, source] of consumers()) {
      expect(source.match(/qwen\/qwen3\.6-plus/g) ?? [], name).toHaveLength(1);
    }
  });

  it('bot-chat: o clamp sanitiza settings antes de QUALQUER chamada ao provedor', () => {
    const source = botChat();
    const clampAt = source.indexOf('hasForbiddenModelPrefix(settings.model_id)');
    expect(clampAt, 'clamp do settings.model_id').toBeGreaterThan(-1);

    // O orquestrador fala direto com o OpenRouter em um único ponto (coleta).
    const directCalls = source.match(/https:\/\/openrouter\.ai\/api\/v1\/chat\/completions/g) ?? [];
    expect(directCalls, 'uma única chamada direta ao OpenRouter').toHaveLength(1);
    expect(clampAt).toBeLessThan(source.indexOf('https://openrouter.ai/api/v1/chat/completions'));

    // Toda delegação ao worker de síntese recebe o model_id JÁ sanitizado.
    const synthesisCalls = [...source.matchAll(/invokeSynthesisWorker\(authHeader, workspaceId, systemPrompt, \w+, false, ([^)]+)\)/g)];
    expect(synthesisCalls.length, 'delegações ao synthesis worker').toBeGreaterThan(0);
    for (const call of synthesisCalls) {
      expect(call[1], 'modelo repassado ao synthesis worker').toBe('settings?.model_id');
      expect(call.index ?? -1).toBeGreaterThan(clampAt);
    }
  });

  it('prevendas-ai: o clamp acontece antes da chamada ao provedor', () => {
    const source = prevendasAi();
    const clampAt = source.indexOf('hasForbiddenModelPrefix(modelId)');
    expect(clampAt, 'clamp do modelId').toBeGreaterThan(-1);
    const providerAt = source.indexOf('callOpenRouter(leads, openrouterKey, modelId');
    expect(providerAt, 'chamada ao provedor').toBeGreaterThan(-1);
    expect(clampAt).toBeLessThan(providerAt);
  });

  it('nenhum modelo proibido aparece como literal fora da lista de bloqueio', () => {
    for (const [name, source] of consumers()) {
      const withoutBlocklist = source.replace("const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']", '');
      expect(withoutBlocklist, name).not.toMatch(/['"]anthropic\//);
      expect(withoutBlocklist, name).not.toMatch(/['"]openai\//);
    }
  });
});
