/**
 * Guarda estrutural: escrita (insert/update/upsert) em coluna ou tabela
 * inexistente. Nasceu da caça a bugs de 2026-07-11 (mesma família da PR #35:
 * `sync-ad-permalinks` fazia upsert numa coluna que não existia — quebrado
 * 100% silencioso). A mesma varredura achou um segundo caso real:
 * `webhook-compras` fazia upsert em 14 colunas de `maquina_de_conteudo` que
 * nunca existiram na tabela (corrigido na migration
 * 20260815000000_fix_maquina_de_conteudo_colunas_faltantes.sql).
 *
 * O que este teste faz:
 * 1. Varre estaticamente `supabase/functions/**\/*.ts` procurando cadeias
 *    `.from('tabela').insert(...)/.update(...)/.upsert(...)` (e a variante
 *    `const x = supabase.from('tabela'); x.insert(...)`), extraindo as
 *    chaves de topo do objeto passado como payload.
 * 2. Para cada (tabela, colunas) encontrado, verifica contra o SCHEMA REAL do
 *    banco de teste (via um `select` inofensivo com `head:true, limit 0` —
 *    não lê nem grava nenhuma linha). Se a tabela ou qualquer coluna não
 *    existir, o Postgres/PostgREST responde com erro (42703/PGRST204/"does
 *    not exist") e o teste falha apontando arquivo+linha.
 *
 * Por que via `select` ao vivo (e não um JSON de schema versionado): o
 * schema muda a cada migration; comparar contra o banco real elimina o
 * risco de o próprio guard ficar desatualizado.
 *
 * Limitação conhecida (aceita): extração estática é heurística. Casos em que
 * o payload é construído de forma muito indireta (ex.: spread de objeto
 * vindo de import externo, colunas 100% dinâmicas por `[key]: value`) não
 * são resolvidos e são pulados (contam como "não verificável", não como
 * "OK") — a lista de arquivos pulados é logada no console para visibilidade,
 * nunca escondida silenciosamente.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { getServiceClient } from '../helpers/supabase-test-client';

const FUNCTIONS_ROOT = join(__dirname, '../../supabase/functions');

interface WriteCall {
  file: string;
  line: number;
  table: string;
  method: 'insert' | 'update' | 'upsert';
  columns: string[];
}

interface SkippedCall {
  file: string;
  line: number;
  reason: string;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '_shared') continue; // helpers, não é alvo direto de varredura
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(source: string): string {
  // Remove comentários de linha e bloco (suficiente para código TS comum;
  // não lida com casos patológicos tipo `//` dentro de string com aspas).
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

/** Isola o 1o argumento de nível top de uma lista `a, b, c` (respeita aninhamento/strings). */
function firstTopLevelArg(argsSource: string): string {
  let depth = 0;
  let inString: string | null = null;
  for (let i = 0; i < argsSource.length; i++) {
    const ch = argsSource[i];
    if (inString) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) return argsSource.slice(0, i).trim();
  }
  return argsSource.trim();
}

function lineAt(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

/** Encontra o índice do fechamento do parêntese/chave que abriu em `openIdx`. */
function matchClosing(source: string, openIdx: number, openCh: string, closeCh: string): number {
  let depth = 0;
  let inString: string | null = null;
  for (let i = openIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i++; // pula caractere escapado
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Extrai as chaves de topo (depth 0 dentro do objeto) de um object literal. */
function extractTopLevelKeys(objSource: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let i = 0;
  const n = objSource.length;
  // objSource começa em '{' e termina em '}' correspondente.
  while (i < n) {
    const ch = objSource[i];
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      i++;
      continue;
    }
    if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
      i++;
      continue;
    }
    if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
      i++;
      continue;
    }
    // Início de uma propriedade top-level: logo após '{' (depth===1) ou após ',' no depth 1.
    if (depth === 1) {
      const m = /^\s*(\.\.\.[a-zA-Z0-9_.]+|\[[^\]]+\]|['"`]?[a-zA-Z_][a-zA-Z0-9_]*['"`]?)\s*:/.exec(
        objSource.slice(i)
      );
      if (m && m[1] && !m[1].startsWith('...') && !m[1].startsWith('[')) {
        keys.push(m[1].replace(/['"`]/g, ''));
        i += m[0].length;
        continue;
      }
    }
    i++;
  }
  return keys;
}

/**
 * Tenta achar o object literal de onde vem o payload (variável ou chamada de função),
 * usando a posição do site de chamada (`beforeIndex`) para escolher a declaração/função
 * MAIS PRÓXIMA ANTES dela — arquivos grandes com múltiplas seções reaproveitam nomes
 * como `row`/`payload` em escopos diferentes; pegar "a primeira ocorrência do arquivo
 * inteiro" gerava falsos positivos (ex.: compute-weekly-reports, ~10 blocos `const row = {...}`).
 *
 * - Payload = identificador simples (`row`, `payload`, ...): procura `const NAME = {`.
 * - Payload = chamada de função (`parseCompra(body)`): procura a definição de `NAME`
 *   (`function NAME(` ou `const NAME = (...) =>` ou `const NAME = function`) e, DENTRO do
 *   corpo dela (limitado pelas chaves da própria função — nunca o arquivo todo), o
 *   primeiro `return {`.
 */
/** Resolve `NAME(...)`: acha a definição de NAME e retorna o object literal do seu `return {...}`. */
function resolveFunctionReturnObject(source: string, fnName: string): string | null {
  const escaped = fnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fnDeclRe = new RegExp(
    `(function\\s+${escaped}\\s*\\(|const\\s+${escaped}\\s*=\\s*(async\\s*)?\\(?[^=]*=>|const\\s+${escaped}\\s*=\\s*(async\\s*)?function)`
  );
  const fnMatch = fnDeclRe.exec(source);
  if (!fnMatch) return null;
  // Acha a primeira '{' que abre o CORPO da função (após os parâmetros/arrow).
  const bodyOpenIdx = source.indexOf('{', fnMatch.index + fnMatch[0].length - 1);
  if (bodyOpenIdx < 0) return null;
  const bodyCloseIdx = matchClosing(source, bodyOpenIdx, '{', '}');
  if (bodyCloseIdx < 0) return null;
  const fnBody = source.slice(bodyOpenIdx, bodyCloseIdx + 1);
  const returnMatch = /return\s*\{/.exec(fnBody);
  if (!returnMatch) return null;
  const openIdx = returnMatch.index + returnMatch[0].length - 1;
  const closeIdx = matchClosing(fnBody, openIdx, '{', '}');
  if (closeIdx > openIdx) return fnBody.slice(openIdx, closeIdx + 1);
  return null;
}

function resolveVariableToObjectSource(
  source: string,
  argSource: string,
  beforeIndex: number
): string | null {
  const callMatch = /^([a-zA-Z0-9_]+)\s*\(/.exec(argSource);
  const identMatch = /^([a-zA-Z0-9_]+)\s*$/.exec(argSource);

  if (identMatch) {
    const name = identMatch[1];
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Caso 1: `const NAME = { ... }` — object literal direto. Pega a ocorrência
    // mais próxima ANTES do call site (nomes como `row`/`payload` se repetem
    // em seções diferentes de arquivos grandes).
    const declRe = new RegExp(`const\\s+${escaped}\\s*=\\s*\\{`, 'g');
    let bestLiteral: RegExpExecArray | null = null;
    let m: RegExpExecArray | null;
    while ((m = declRe.exec(source))) {
      if (m.index < beforeIndex) bestLiteral = m;
      else break;
    }
    if (bestLiteral) {
      const openIdx = bestLiteral.index + bestLiteral[0].length - 1;
      const closeIdx = matchClosing(source, openIdx, '{', '}');
      if (closeIdx > openIdx) return source.slice(openIdx, closeIdx + 1);
    }

    // Caso 2: `const NAME = algumaFuncao(...)` — indireção em 2 níveis (ex.:
    // `const compra = parseCompra(body); ...upsert(compra)`). Resolve a função.
    const callAssignRe = new RegExp(`const\\s+${escaped}\\s*=\\s*([a-zA-Z0-9_]+)\\s*\\(`, 'g');
    let bestCallAssign: RegExpExecArray | null = null;
    while ((m = callAssignRe.exec(source))) {
      if (m.index < beforeIndex) bestCallAssign = m;
      else break;
    }
    if (bestCallAssign) {
      const resolved = resolveFunctionReturnObject(source, bestCallAssign[1]);
      if (resolved) return resolved;
    }

    return null;
  }

  if (callMatch) {
    return resolveFunctionReturnObject(source, callMatch[1]);
  }

  return null;
}

function scanFile(filePath: string, rawSource: string): { writes: WriteCall[]; skipped: SkippedCall[] } {
  const source = stripComments(rawSource);
  const writes: WriteCall[] = [];
  const skipped: SkippedCall[] = [];
  const relFile = relative(join(__dirname, '../..'), filePath);

  // 1) Cadeia direta: .from('tabela') ... .insert(/.update(/.upsert( dentro de uma janela razoável.
  const fromRe = /\.from\(\s*['"`]([a-zA-Z0-9_]+)['"`]\s*\)/g;
  let fromMatch: RegExpExecArray | null;
  const varFromTable = new Map<string, string>(); // nome de variável -> tabela (para `const x = supabase.from('t')`)

  while ((fromMatch = fromRe.exec(source))) {
    const table = fromMatch[1];
    const fromEnd = fromMatch.index + fromMatch[0].length;

    // Se for `.storage.from(...)`, não é tabela — pula.
    const before = source.slice(Math.max(0, fromMatch.index - 20), fromMatch.index);
    if (/\.storage\s*$/.test(before)) continue;

    // Se essa chamada está sendo atribuída a uma variável: `const NAME = ...from('t')`
    const assignBefore = /const\s+([a-zA-Z0-9_]+)\s*=\s*[a-zA-Z0-9_.]*$/.exec(
      source.slice(Math.max(0, fromMatch.index - 80), fromMatch.index)
    );
    if (assignBefore) varFromTable.set(assignBefore[1], table);

    // Procura .insert(/.update(/.upsert( logo em seguida (janela de 400 chars, cadeia encadeada).
    const window = source.slice(fromEnd, fromEnd + 400);
    const methodMatch = /^\s*\.\s*(insert|update|upsert)\s*\(/.exec(window);
    if (!methodMatch) continue;

    const method = methodMatch[1] as WriteCall['method'];
    const argOpenIdx = fromEnd + methodMatch.index + methodMatch[0].length - 1;
    processWriteArg(source, argOpenIdx, table, method, relFile, writes, skipped);
  }

  // 2) Variante indireta: `NAME.insert(/.update(/.upsert(` onde NAME veio de `.from('t')` guardado antes.
  for (const [varName, table] of varFromTable) {
    const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callRe = new RegExp(`\\b${escaped}\\s*\\.\\s*(insert|update|upsert)\\s*\\(`, 'g');
    let callMatch: RegExpExecArray | null;
    while ((callMatch = callRe.exec(source))) {
      const method = callMatch[1] as WriteCall['method'];
      const argOpenIdx = callMatch.index + callMatch[0].length - 1;
      processWriteArg(source, argOpenIdx, table, method, relFile, writes, skipped);
    }
  }

  return { writes, skipped };
}

function processWriteArg(
  source: string,
  argOpenIdx: number,
  table: string,
  method: WriteCall['method'],
  relFile: string,
  writes: WriteCall[],
  skipped: SkippedCall[]
): void {
  const line = lineAt(source, argOpenIdx);
  const argCloseIdx = matchClosing(source, argOpenIdx, '(', ')');
  if (argCloseIdx < 0) {
    skipped.push({ file: relFile, line, reason: `parênteses não balanceados em ${method}()` });
    return;
  }
  const fullArgSource = source.slice(argOpenIdx + 1, argCloseIdx).trim();
  // insert/update/upsert podem ter um 2o argumento de opções (ex.: `{onConflict: ...}`)
  // — isola só o 1o argumento de nível top (respeitando chaves/parênteses/strings aninhados).
  const argSource = firstTopLevelArg(fullArgSource);

  // Payload é objeto literal direto: { ... }
  if (argSource.startsWith('{')) {
    const closeObj = matchClosing(argSource, 0, '{', '}');
    const objSrc = closeObj > 0 ? argSource.slice(0, closeObj + 1) : argSource;
    const keys = extractTopLevelKeys(objSrc);
    if (keys.length > 0) writes.push({ file: relFile, line, table, method, columns: keys });
    else skipped.push({ file: relFile, line, reason: 'objeto literal sem chaves extraíveis' });
    return;
  }

  // Payload é array de objetos: [ {...}, {...} ] — usa o primeiro elemento.
  if (argSource.startsWith('[')) {
    const firstObjIdx = argSource.indexOf('{');
    if (firstObjIdx >= 0) {
      const closeObj = matchClosing(argSource, firstObjIdx, '{', '}');
      if (closeObj > firstObjIdx) {
        const keys = extractTopLevelKeys(argSource.slice(firstObjIdx, closeObj + 1));
        if (keys.length > 0) {
          writes.push({ file: relFile, line, table, method, columns: keys });
          return;
        }
      }
    }
    skipped.push({ file: relFile, line, reason: 'array literal sem objeto extraível' });
    return;
  }

  // Payload é uma variável ou chamada de função: tenta resolver o object literal de origem
  // usando a posição do site de chamada para achar a declaração mais próxima antes dele.
  const varNameMatch = /^([a-zA-Z0-9_]+)/.exec(argSource);
  if (varNameMatch) {
    const objSrc = resolveVariableToObjectSource(source, argSource, argOpenIdx);
    if (objSrc) {
      const keys = extractTopLevelKeys(objSrc);
      if (keys.length > 0) {
        writes.push({ file: relFile, line, table, method, columns: keys });
        return;
      }
    }
  }
  skipped.push({
    file: relFile,
    line,
    reason: `payload de ${method}() não resolvido estaticamente (variável/expressão indireta)`,
  });
}

describe('Escrita em coluna/tabela inexistente — guarda estrutural (classe do bug PR #35)', () => {
  let allWrites: WriteCall[] = [];
  let allSkipped: SkippedCall[] = [];

  beforeAll(() => {
    const files = listTsFiles(FUNCTIONS_ROOT);
    for (const file of files) {
      const raw = readFileSync(file, 'utf-8');
      const { writes, skipped } = scanFile(file, raw);
      allWrites.push(...writes);
      allSkipped.push(...skipped);
    }
    if (allSkipped.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[schema-write-columns-structural] ${allSkipped.length} chamada(s) de escrita não puderam ` +
          `ser resolvidas estaticamente (não contam como falha, mas também não foram verificadas):\n` +
          allSkipped.map((s) => `  - ${s.file}:${s.line} — ${s.reason}`).join('\n')
      );
    }
  });

  it('encontrou pelo menos uma chamada de escrita para validar (sanity check do próprio scanner)', () => {
    expect(allWrites.length).toBeGreaterThan(10);
  });

  it('toda tabela/coluna escrita por uma edge function existe no schema real', async () => {
    const service = getServiceClient();

    // Agrupa por tabela, unindo todas as colunas vistas em qualquer chamada.
    const byTable = new Map<string, Set<string>>();
    for (const w of allWrites) {
      if (!byTable.has(w.table)) byTable.set(w.table, new Set());
      for (const c of w.columns) byTable.get(w.table)!.add(c);
    }

    const failures: string[] = [];

    for (const [table, columnsSet] of byTable) {
      const columns = [...columnsSet];
      const { error: batchError } = await service
        .from(table)
        .select(columns.join(','), { head: true, count: 'exact' })
        .limit(0);

      if (!batchError) continue; // tabela + todas as colunas existem — ok.

      // Tabela inteira não existe.
      if (/relation .* does not exist/i.test(batchError.message)) {
        const sites = allWrites.filter((w) => w.table === table);
        for (const s of sites) {
          failures.push(
            `${s.file}:${s.line} — tabela "${table}" NÃO EXISTE no schema real ` +
              `(${s.method}() com colunas: ${s.columns.join(', ')})`
          );
        }
        continue;
      }

      // Ao menos uma coluna do lote não existe — testa uma a uma para apontar exatamente qual.
      for (const col of columns) {
        const { error: colError } = await service
          .from(table)
          .select(col, { head: true, count: 'exact' })
          .limit(0);
        if (colError) {
          const sites = allWrites.filter((w) => w.table === table && w.columns.includes(col));
          for (const s of sites) {
            failures.push(
              `${s.file}:${s.line} — coluna "${col}" NÃO EXISTE na tabela "${table}" ` +
                `(${s.method}()) — erro: ${colError.message}`
            );
          }
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `${failures.length} escrita(s) em coluna/tabela inexistente encontrada(s):\n` +
          failures.map((f) => `  - ${f}`).join('\n')
      );
    }
  });
});
