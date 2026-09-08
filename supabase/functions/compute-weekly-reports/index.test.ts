// Testes automatizados para a edge function compute-weekly-reports
// Usa a biblioteca padrão de testes do Deno.

import { assertEquals } from "https://deno.land/std@0.210.0/assert/mod.ts";
import {
  getWeekNumber,
  safeDiv,
  getModuleComputeFn,
  computeTrafegoProdutividade,
} from "./index.ts";

// =============================================================================
// 1. getWeekNumber — número da semana ISO
// =============================================================================

Deno.test("getWeekNumber: 1º de janeiro de 2024 é semana 1", () => {
  const d = new Date("2024-01-01T00:00:00");
  assertEquals(getWeekNumber(d), 1);
});

Deno.test("getWeekNumber: 15 de maio de 2026 é semana 20", () => {
  const d = new Date("2026-05-15T00:00:00");
  assertEquals(getWeekNumber(d), 20);
});

Deno.test("getWeekNumber: 31 de dezembro de 2024 é semana 1 (pertence a 2025)", () => {
  const d = new Date("2024-12-31T00:00:00");
  // Terça-feira: ISO week 1 de 2025
  assertEquals(getWeekNumber(d), 1);
});

// =============================================================================
// 2. safeDiv — divisão segura
// =============================================================================

Deno.test("safeDiv: divisão normal retorna valor arredondado", () => {
  assertEquals(safeDiv(10, 2), 5);
  assertEquals(safeDiv(1, 3), 0.3333);
});

Deno.test("safeDiv: denominador 0 retorna null", () => {
  assertEquals(safeDiv(10, 0), null);
});

Deno.test("safeDiv: denominador negativo funciona", () => {
  assertEquals(safeDiv(10, -2), -5);
});

// =============================================================================
// 3. computeTrafegoProdutividade — mockado
// =============================================================================

/**
 * Cria um mock do cliente Supabase que responde às queries feitas por
 * computeTrafegoProdutividade. Registra cada chamada para permitir
 * verificação dos filtros aplicados.
 */
function createMockSupabase(overrides: Record<string, unknown> = {}) {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function log(table: string, method: string, args: unknown[]) {
    calls.push({ table, method, args });
  }

  const chain = (table: string) => {
    let currentSelect: string | null = null;
    let currentOpts: Record<string, unknown> | null = null;
    const filters: Array<{ method: string; args: unknown[] }> = [];

    const builder = {
      select: (cols: string, opts?: Record<string, unknown>) => {
        currentSelect = cols;
        currentOpts = opts ?? null;
        return builder;
      },
      gte: (col: string, val: unknown) => {
        log(table, "gte", [col, val]);
        filters.push({ method: "gte", args: [col, val] });
        return builder;
      },
      lte: (col: string, val: unknown) => {
        log(table, "lte", [col, val]);
        filters.push({ method: "lte", args: [col, val] });
        return builder;
      },
      neq: (col: string, val: unknown) => {
        log(table, "neq", [col, val]);
        filters.push({ method: "neq", args: [col, val] });
        return builder;
      },
      eq: (col: string, val: unknown) => {
        log(table, "eq", [col, val]);
        filters.push({ method: "eq", args: [col, val] });
        return builder;
      },
      is: (col: string, val: unknown) => {
        log(table, "is", [col, val]);
        filters.push({ method: "is", args: [col, val] });
        return builder;
      },
      not: (col: string, operator: string, val: unknown) => {
        log(table, "not", [col, operator, val]);
        filters.push({ method: "not", args: [col, operator, val] });
        return builder;
      },
      ilike: (col: string, pattern: string) => {
        log(table, "ilike", [col, pattern]);
        filters.push({ method: "ilike", args: [col, pattern] });
        return builder;
      },
      in: (col: string, vals: unknown[]) => {
        log(table, "in", [col, vals]);
        filters.push({ method: "in", args: [col, vals] });
        return builder;
      },
      maybeSingle: () => builder,
      upsert: (_row: unknown, _opts?: unknown) => {
        log(table, "upsert", [_row, _opts]);
        return Promise.resolve({ error: null });
      },
      delete: () => {
        log(table, "delete", []);
        return { eq: (_col: string, _val: unknown) => Promise.resolve({ error: null }) };
      },
      then: (
        resolve: (value: unknown) => void,
        _reject?: (reason?: unknown) => void,
      ) => {
        // Constroi a chave única da query para lookup de override
        const key = `${table}:${currentSelect ?? "*"}`;
        const filterKey = filters.map((f) => `${f.method}(${f.args.join(",")})`).join("|");
        const fullKey = `${key}:${filterKey}`;

        // Retorna o valor do override se existir; senão, padrões neutros
        const result =
          (overrides[fullKey] as Record<string, unknown>) ??
          (overrides[key] as Record<string, unknown>) ??
          defaultResponse(table, currentSelect, currentOpts);

        resolve(result);
      },
    };

    return builder;
  };

  const client = {
    from: (table: string) => {
      log(table, "from", []);
      return chain(table);
    },
    calls,
  };

  return client;
}

/** Respostas padrão para as queries mais comuns. */
function defaultResponse(
  table: string,
  select: string | null,
  opts: Record<string, unknown> | null,
): Record<string, unknown> {
  if (opts?.head === true && opts?.count === "exact") {
    return { count: 5, error: null };
  }
  if (table === "oportunidades" && select?.includes("id")) {
    return { data: [{ id: "opp-1" }, { id: "opp-2" }], error: null };
  }
  if (table === "vendas_fechamento") {
    return { data: [{ valor_faturado: 1000, valor_entrada: 500 }], error: null };
  }
  if (table === "meta_ads_insights") {
    return { data: [{ spend: 200, impressions: 1000, clicks: 50, leads: 10 }], error: null };
  }
  if (table === "metas_ads") {
    return { data: { meta_mql: 100, meta_cpmql: 50, meta_spend: 5000, meta_vendas: 10 }, error: null };
  }
  return { data: [], error: null };
}

Deno.test("computeTrafegoProdutividade: retorna estrutura esperada em dry run", async () => {
  const mock = createMockSupabase();
  const result = await computeTrafegoProdutividade(
    mock as unknown as Parameters<typeof computeTrafegoProdutividade>[0],
    42,
    "ws-1",
    "2026-05-12",
    "2026-05-18",
    true, // dryRun
  );

  assertEquals(result.inserted, 1);
  assertEquals(result.errors, []);
});

Deno.test("computeTrafegoProdutividade: aplica filtros de data, pipeline_id e workspace", async () => {
  const mock = createMockSupabase();
  await computeTrafegoProdutividade(
    mock as unknown as Parameters<typeof computeTrafegoProdutividade>[0],
    42,
    "ws-1",
    "2026-05-12",
    "2026-05-18",
    true,
  );

  const oportunidadeCalls = mock.calls.filter((c) => c.table === "oportunidades");
  assertEquals(oportunidadeCalls.length > 0, true);

  // Pelo menos uma query de oportunidades deve ter o filtro de workspace
  const workspaceFilters = oportunidadeCalls.filter((c) =>
    c.method === "eq" && c.args[0] === "contatos.workspace_id" && c.args[1] === "ws-1"
  );
  assertEquals(workspaceFilters.length > 0, true);
});

Deno.test("computeTrafegoProdutividade: não aplica filtro de workspace quando workspaceId é null", async () => {
  const mock = createMockSupabase();
  await computeTrafegoProdutividade(
    mock as unknown as Parameters<typeof computeTrafegoProdutividade>[0],
    42,
    null,
    "2026-05-12",
    "2026-05-18",
    true,
  );

  const workspaceFilters = mock.calls.filter((c) =>
    c.method === "eq" && c.args[0] === "contatos.workspace_id"
  );
  assertEquals(workspaceFilters.length, 0);
});

Deno.test("computeTrafegoProdutividade: retorna erro quando query falha", async () => {
  const mock = createMockSupabase({
    "oportunidades:*, contatos!inner(workspace_id):gte(data_lead_recebido,2026-05-12)|lte(data_lead_recebido,2026-05-18)|neq(pipeline_id,Sn1Guqcm6zwZNTVOOf5L)": {
      count: null,
      error: { message: "connection refused" },
    },
  });

  const result = await computeTrafegoProdutividade(
    mock as unknown as Parameters<typeof computeTrafegoProdutividade>[0],
    42,
    null,
    "2026-05-12",
    "2026-05-18",
    true,
  );

  assertEquals(result.inserted, 0);
  assertEquals(result.errors.length, 1);
  assertEquals(result.errors[0].includes("connection refused"), true);
});

// =============================================================================
// 4. Dispatcher — getModuleComputeFn
// =============================================================================

Deno.test("getModuleComputeFn: vendas + produtividade retorna computeVendasProdutividade", () => {
  const fn = getModuleComputeFn("vendas", "produtividade");
  assertEquals(typeof fn, "function");
});

Deno.test("getModuleComputeFn: trafego + cohort retorna computeTrafegoCohort", () => {
  const fn = getModuleComputeFn("trafego", "cohort");
  assertEquals(typeof fn, "function");
});

Deno.test("getModuleComputeFn: modulo inexistente retorna null", () => {
  // Forçamos o tipo para testar o fallback
  const fn = getModuleComputeFn("inexistente" as unknown as Parameters<typeof getModuleComputeFn>[0], "produtividade");
  assertEquals(fn, null);
});
