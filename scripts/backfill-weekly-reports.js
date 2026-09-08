#!/usr/bin/env node
// Backfill de relatórios semanais — jan/2026 até semana atual
// Chama a edge function compute-weekly-reports para cada semana
// Processa em batches configuráveis
//
// Fail-closed multi-tenant (Fase 8): a edge function EXIGE workspace_id
// explícito no body (sem fallback de env) e caller service_role.

const SUPABASE_URL = 'https://qzesffnkqgelmtfblzkr.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('\u274c Erro: SUPABASE_SERVICE_ROLE_KEY não definida (a edge function exige caller service_role). Use: export SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

// Argumentos de CLI: node backfill-weekly-reports.js workspace=<uuid> [from=YYYY-MM-DD] [to=YYYY-MM-DD] [modules=trafego,vendas] [types=produtividade,cohort] [dry-run]
function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {};
  for (const arg of args) {
    if (arg.includes('=')) {
      const [k, v] = arg.split('=');
      flags[k] = v;
    } else {
      flags[arg] = true;
    }
  }
  return flags;
}

const CLI = parseArgs();

if (!CLI.workspace) {
  console.error('❌ Erro: workspace=<uuid> obrigatório (fail-closed multi-tenant — a edge function não aceita mais fallback de env).');
  console.error('   Uso: node backfill-weekly-reports.js workspace=<uuid> [from=YYYY-MM-DD] [to=YYYY-MM-DD] [modules=...] [types=...] [dry-run]');
  process.exit(1);
}

const CONFIG = {
  // Workspace alvo (obrigatório — fail-closed multi-tenant)
  workspaceId: CLI.workspace,
  // Primeira semana com dados (segunda-feira)
  firstWeekStart: CLI.from || '2025-12-30',
  // Última semana a processar (null = até semana atual)
  lastWeekStart: CLI.to || null,
  // Módulos a computar
  modules: CLI.modules ? CLI.modules.split(',') : ['trafego'],
  // Tipos de relatório
  reportTypes: CLI.types ? CLI.types.split(',') : ['produtividade'],
  // Dry run (só calcula, não persiste)
  dryRun: CLI['dry-run'] === true,
  // Delay entre requests (ms)
  delayMs: 500,
  // Timeout por request (ms)
  timeoutMs: 45000,
};

function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getWeeks(startStr, endStr) {
  const weeks = [];
  let current = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');

  while (current <= end) {
    weeks.push(formatDate(current));
    current.setDate(current.getDate() + 7);
  }
  return weeks;
}

async function computeWeek(weekStart, reportType, modules, dryRun = false) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/compute-weekly-reports`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      week_start: weekStart,
      report_type: reportType,
      modules,
      dry_run: dryRun,
      workspace_id: CONFIG.workspaceId,
    }),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!data.success) {
    throw new Error(data.error || 'Unknown error');
  }

  return data;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const today = formatDate(new Date());
  const lastWeek = CONFIG.lastWeekStart || today;

  console.log(`📅 Backfill de ${CONFIG.firstWeekStart} até ${lastWeek}`);
  console.log(`📦 Módulos: ${CONFIG.modules.join(', ')}`);
  console.log(`📊 Tipos: ${CONFIG.reportTypes.join(', ')}`);
  console.log('');

  const weeks = getWeeks(CONFIG.firstWeekStart, lastWeek);
  console.log(`Total de semanas: ${weeks.length}`);
  console.log('');

  let totalSuccess = 0;
  let totalErrors = 0;

  for (let i = 0; i < weeks.length; i++) {
    const week = weeks[i];
    console.log(`\n[${i + 1}/${weeks.length}] Semana ${week}`);

    for (const reportType of CONFIG.reportTypes) {
      try {
        const result = await computeWeek(week, reportType, CONFIG.modules, CONFIG.dryRun);
        const inserted = Object.values(result.module_results || {})
          .reduce((sum, m) => sum + (m.inserted || 0), 0);
        const errors = Object.values(result.module_results || {})
          .flatMap(m => m.errors || []);

        console.log(`  ✅ ${reportType}: snapshot #${result.snapshot_id}, ${inserted} registros, ${result.duration_ms}ms`);
        if (errors.length > 0) {
          console.log(`  ⚠️  Erros: ${errors.join('; ')}`);
        }
        totalSuccess++;
      } catch (err) {
        console.error(`  ❌ ${reportType}: ${err.message}`);
        totalErrors++;
      }

      await sleep(CONFIG.delayMs);
    }
  }

  console.log('\n========================================');
  console.log('Backfill concluído!');
  console.log(`Sucessos: ${totalSuccess}`);
  console.log(`Erros: ${totalErrors}`);
  console.log('========================================');
}

main().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
