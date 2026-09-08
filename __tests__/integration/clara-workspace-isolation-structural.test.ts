/**
 * Clara/BYOK — prova estrutural de isolamento entre subcontas.
 *
 * Esta suíte não chama Edge Functions nem exige o banco remoto. Ela protege os
 * contratos que impedem a conta A de consultar conversas, sessões, dados ou a
 * chave OpenRouter da conta B. Para o RLS em execução, a migration correspondente
 * continua sendo validada na auditoria e no ambiente de staging.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

const botChat = () => read('supabase/functions/bot-chat/index.ts');
const synthesis = () => read('supabase/functions/bot-chat-synthesis/index.ts');
const dataWorker = () => read('supabase/functions/bot-chat-data/index.ts');
const isolationMigration = () => read('supabase/migrations/20260829000000_isolate_clara_by_workspace.sql');

describe('Clara/BYOK — isolamento A → B sem banco remoto', () => {
  it('recusa requisições sem workspace_id em todos os workers da Clara', () => {
    for (const [name, source] of [
      ['bot-chat', botChat()],
      ['bot-chat-synthesis', synthesis()],
      ['bot-chat-data', dataWorker()],
    ] as const) {
      expect(source, name).toMatch(/workspace_id é obrigatório/);
    }
  });

  it('valida que o usuário pertence à conta informada antes de atender o chat', () => {
    const source = botChat();
    expect(source).toContain(".from('workspace_members')");
    expect(source).toContain(".eq('workspace_id', workspaceId)");
    expect(source).toContain(".eq('user_id', userId)");
    expect(source).toContain(".eq('is_active', true)");
    expect(source).toContain('member?.clara_habilitado');
  });

  it('não permite reutilizar conversa ou sessão da conta B na conta A', () => {
    const source = botChat();

    expect(source).toMatch(/from\('ai_conversations'\)[\s\S]*?eq\('id', convId\)[\s\S]*?eq\('user_id', userId\)[\s\S]*?eq\('workspace_id', workspaceId\)/);
    expect(source).toMatch(/from\('ai_analysis_sessions'\)[\s\S]*?eq\('id', session_id\)[\s\S]*?eq\('workspace_id', workspaceId\)[\s\S]*?eq\('user_id', userId\)/);
    expect(source).toMatch(/from\('ai_analysis_sessions'\)\.update[\s\S]*?eq\('id', session_id\)\.eq\('workspace_id', workspaceId\)\.eq\('user_id', userId\)/);
  });

  it('propaga exatamente o workspace validado para coleta e síntese', () => {
    const source = botChat();
    expect(source).toContain('workspace_id: workspaceId, _internal_secret: BOT_INTERNAL_SECRET');
    expect(source).toMatch(/invokeDataWorker\(authHeader, workspaceId, toolsToRun\)/);
    expect(source).toMatch(/invokeSynthesisWorker\(authHeader, workspaceId, systemPrompt/);
  });

  it('consulta dados somente por cliente escopado e bloqueia tools ainda não isoladas', () => {
    const source = dataWorker();
    expect(source).toContain('createWorkspaceScopedClient(supabase, body.workspace_id)');
    expect(source).toContain('executeTool(tool.name, tool.arguments ?? {}, scopedSupabase)');
    expect(source).toContain("tool.name === 'run_sql_query'");
    expect(source).toContain("tool.name === 'query_meta_ads_region'");
  });

  it('resolve a chave OpenRouter por workspace e não possui fallback global', () => {
    for (const [name, source] of [
      ['bot-chat', botChat()],
      ['bot-chat-synthesis', synthesis()],
    ] as const) {
      expect(source, name).toContain("resolveWorkspaceCredential(");
      expect(source, name).toMatch(/workspaceId,\s*'openrouter'/);
      expect(source, name).not.toMatch(/Deno\.env\.get\(['"]OPENROUTER_API_KEY['"]\)/);
    }
  });

  it('a migration torna legado ambíguo inacessível e aplica RLS por workspace', () => {
    const sql = isolationMigration();
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id)');
    expect(sql).toContain('CHECK (workspace_id IS NOT NULL) NOT VALID');
    expect(sql).toContain('HAVING count(*) = 1'); // nunca infere um workspace ambíguo
    expect(sql).toContain('public.is_workspace_member(workspace_id)');
    expect(sql).toContain('workspace_id IS NOT NULL');
    expect(sql).toContain('Users can view messages in own workspace conversations');
  });
});
