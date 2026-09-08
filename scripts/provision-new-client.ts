#!/usr/bin/env node
// scripts/provision-new-client.ts
// Fase 6 — Processo de replicação do Sistema Empire para novos clientes GHL.
// Modo padrão: dry-run (não executa mutações reais).
// Use --create-supabase para criar/linkar projeto Supabase via CLI.
// Use --deploy-vercel para fazer deploy real no Vercel.
//
// Uso:
//   npx tsx scripts/provision-new-client.ts --workspace-name "Cliente X"
//   npx tsx scripts/provision-new-client.ts --create-supabase --deploy-vercel

import { createClient } from '@supabase/supabase-js';
import { execSync, spawnSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as https from 'https';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'step' | 'dry';

type ProvisionMode = 'isolated-instance' | 'agency-subaccount';

interface ProvisionConfig {
  mode: ProvisionMode;
  agencyId?: string;
  workspaceName: string;
  ownerEmail: string;
  ownerPassword?: string;
  clientName: string;
  supabaseProjectId?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseAnonKey?: string;
  ghlApiKey?: string;
  ghlLocationId?: string;
  webhookSecret?: string;
  vercelProjectName?: string;
  vercelToken?: string;
  dryRun: boolean;
  createSupabase: boolean;
  deployVercel: boolean;
  skipMigrations: boolean;
  skipFunctionsDeploy: boolean;
  skipVercelEnv: boolean;
}

interface SupabaseProjectMeta {
  id: string;
  name: string;
  ref: string;
  url: string;
  anonKey: string;
}

// ----------------------------------------------------------------------------
// Cores
// ----------------------------------------------------------------------------

const COLORS: Record<LogLevel, string> = {
  info: '\x1b[36m',    // cyan
  success: '\x1b[32m', // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  step: '\x1b[35m',    // magenta
  dry: '\x1b[90m',     // gray
};
const RESET = '\x1b[0m';
const ICONS: Record<LogLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warn: '⚠️',
  error: '❌',
  step: '▶️',
  dry: '🧪',
};

function log(level: LogLevel, message: string): void {
  const color = COLORS[level];
  const icon = ICONS[level];
  console.log(`${color}${icon} [${level.toUpperCase()}]${RESET} ${message}`);
}

// ----------------------------------------------------------------------------
// Segurança
// ----------------------------------------------------------------------------

function maskSecret(value: string | undefined): string {
  if (!value) return '***';
  if (value.length <= 8) return '***';
  const visible = Math.max(2, Math.floor(value.length / 6));
  return value.slice(0, visible) + '...' + value.slice(-visible);
}

function maskCommandSecrets(command: string, values: (string | undefined)[]): string {
  let masked = command;
  for (const value of values) {
    if (value && value.length > 0) {
      masked = masked.split(value).join(maskSecret(value));
    }
  }
  return masked;
}

function sanitizeOutput(text: string): string {
  if (!text || text.length === 0) return text;

  return text
    .split('\n')
    .map((line) => {
      // 1) Mascarar valores após : ou = em linhas que mencionam key/token/secret/password.
      if (/(key|token|secret|password)/i.test(line)) {
        line = line.replace(/([:=]\s*)([^:=\s].*)/gi, (_, prefix, value) => {
          const trimmed = value.trim();
          if (trimmed.length > 0) {
            return `${prefix}${maskSecret(trimmed)}`;
          }
          return _;
        });
      }

      // 2) Mascarar JWT tokens (eyJ...).
      line = line.replace(/\b(eyJ[\w-]*\.eyJ[\w-]*\.[\w-]*)\b/g, (match) => maskSecret(match));

      // 3) Mascarar strings longas (>20 chars) que pareçam tokens/chaves.
      line = line.replace(/\b([a-zA-Z0-9_.-]{21,})\b/g, (match) => {
        // Preservar padrões que claramente não são secrets.
        if (/^\d+$/.test(match)) return match; // número puro
        if (/^\d{4}-\d{2}-\d{2}/.test(match)) return match; // data/hora ISO
        if (match.startsWith('http://') || match.startsWith('https://')) return match; // URLs
        return maskSecret(match);
      });

      return line;
    })
    .join('\n');
}

function writeTempEnvFile(secrets: Record<string, string>): string {
  const filePath = path.join(os.tmpdir(), `.empire-secrets-${crypto.randomBytes(8).toString('hex')}.env`);
  const lines = Object.entries(secrets).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(filePath, lines.join('\n') + '\n', { mode: 0o600 });
  return filePath;
}

// ----------------------------------------------------------------------------
// Prompt helpers
// ----------------------------------------------------------------------------

function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    if (hidden && process.stdin.isTTY) {
      const stdin = process.stdin;
      const stdout = process.stdout;
      stdout.write(question);
      stdin.resume();
      stdin.setRawMode(true);
      stdin.setEncoding('utf8');

      let input = '';
      stdin.on('data', (key: string) => {
        if (key === '\r' || key === '\n') {
          stdout.write('\n');
          stdin.setRawMode(false);
          stdin.pause();
          rl.close();
          resolve(input);
        } else if (key === '\u0003') {
          process.exit(1);
        } else if (key === '\u007f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            stdout.write('\b \b');
          }
        } else {
          input += key;
          stdout.write('*');
        }
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function promptRequired(question: string, hidden = false): Promise<string> {
  while (true) {
    const value = await prompt(question, hidden);
    if (value.length > 0) return value;
    log('warn', 'Resposta obrigatória. Tente novamente.');
  }
}

async function promptYesNo(question: string, defaultValue = false): Promise<boolean> {
  const suffix = defaultValue ? ' [Y/n]: ' : ' [y/N]: ';
  const answer = await prompt(question + suffix);
  if (!answer) return defaultValue;
  return /^y(es)?$/i.test(answer);
}

// ----------------------------------------------------------------------------
// Args parser
// ----------------------------------------------------------------------------

function showHelp(): void {
  console.log(`
Empire — Provisionamento de novo cliente (Fase 6)

Uso:
  npx tsx scripts/provision-new-client.ts [opções]

Modos (Fase 7 — docs/REPLICACAO-TECNICA.md):
  --mode=isolated-instance        (padrão) Instância isolada — projeto Supabase +
                                   deploy Vercel próprios. Use para tier enterprise/
                                   alto risco ou quando o cliente exige isolamento
                                   físico total.
  --mode=agency-subaccount        Cria um workspace DENTRO da instância Agency já
                                   existente (mesma Supabase/Vercel). Não cria
                                   projeto novo, não faz deploy. Use para o tier
                                   padrão — a maioria dos clientes. Requer --agency-id
                                   e as credenciais do Supabase JÁ existente (nunca
                                   cria projeto).

Flags:
  --create-supabase              (isolated-instance) Cria/links o projeto Supabase via CLI
  --deploy-vercel                (isolated-instance) Cria o projeto no Vercel e configura env vars
  --dry-run                      Modo simulação (padrão quando não há flags reais)
  --execute                      (agency-subaccount) Sai do dry-run e executa de
                                   verdade. Necessário nesse modo porque
                                   --create-supabase/--deploy-vercel não se aplicam
                                   (nunca usados em agency-subaccount).
  --skip-migrations              (isolated-instance) Pula supabase db push
  --skip-functions-deploy        (isolated-instance) Pula supabase functions deploy
  --skip-vercel-env              (isolated-instance) Pula configuração de env vars no Vercel
  --help, -h                     Exibe esta ajuda

Inputs (também podem ser informados via variáveis de ambiente ou prompt interativo):
  --mode <isolated-instance|agency-subaccount>  Modo de provisionamento (padrão: isolated-instance)
  --agency-id <uuid>              (agency-subaccount) ID da agência dona do novo workspace
  --client-name <slug>           Nome curto do cliente (apenas a-z, 0-9, hífen)
  --workspace-name, -w <nome>    Nome do workspace inicial
  --owner-email, -e <email>      E-mail do owner/admin
  --owner-password <senha>       Senha do owner (obrigatória; não é gerada)
  --supabase-project-id <ref>    (isolated-instance) Project ref do Supabase
  --supabase-url <url>           URL do Supabase (projeto existente em agency-subaccount)
  --supabase-anon-key <key>      Anon key
  --supabase-service-role-key    Service role key
  --ghl-api-key <token>          (isolated-instance) Private Integration Token do GHL
  --ghl-location-id <id>         Location ID do GHL (opcional em agency-subaccount — se
                                  omitido, o workspace nasce status=pending e o cliente
                                  conecta a própria chave depois via BYOK)
  --webhook-secret <secret>      (isolated-instance) Secret do webhook (gerado se omitido)
  --vercel-project-name <nome>   (isolated-instance) Nome do projeto no Vercel
  --vercel-token <token>         (isolated-instance) Token da API do Vercel (obrigatório com --deploy-vercel)

Variáveis de ambiente suportadas:
  GHL_API_KEY
  GHL_LOCATION_ID
  SUPABASE_URL
  SUPABASE_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY
  WEBHOOK_SECRET
  VERCEL_TOKEN

Exemplo dry-run (isolated-instance, padrão):
  npx tsx scripts/provision-new-client.ts \\
    --client-name "acme" \\
    --workspace-name "Acme Empire" \\
    --owner-email "admin@acme.com" \\
    --owner-password "<senha-forte>" \\
    --supabase-url "https://<ref>.supabase.co" \\
    --supabase-anon-key "<anon>" \\
    --supabase-service-role-key "<service-role>" \\
    --ghl-api-key "<token>" \\
    --ghl-location-id "<location>"

Exemplo criando Supabase e deployando Vercel (isolated-instance):
  npx tsx scripts/provision-new-client.ts \\
    --create-supabase \\
    --deploy-vercel \\
    --client-name "acme" \\
    --workspace-name "Acme Empire" \\
    --owner-email "admin@acme.com" \\
    --owner-password "<senha-forte>" \\
    --supabase-url "https://<ref>.supabase.co" \\
    --supabase-anon-key "<anon>" \\
    --supabase-service-role-key "<service-role>" \\
    --ghl-api-key "<token>" \\
    --ghl-location-id "<location>" \\
    --vercel-token "<vercel-token>"

Exemplo agency-subaccount (dry-run — não cria projeto/deploy nenhum):
  npx tsx scripts/provision-new-client.ts \\
    --mode=agency-subaccount \\
    --agency-id "<agency-uuid>" \\
    --client-name "acme" \\
    --workspace-name "Acme (sub-conta)" \\
    --owner-email "admin@acme.com" \\
    --owner-password "<senha-forte>" \\
    --supabase-url "https://<ref-da-instancia-existente>.supabase.co" \\
    --supabase-anon-key "<anon>" \\
    --supabase-service-role-key "<service-role>"
    # --ghl-location-id opcional: se omitido, workspace nasce 'pending' (BYOK depois)
`);
  process.exit(0);
}

function getEnvOrArg(args: string[], flags: string[], envName: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    // Suporta tanto "--flag valor" quanto "--flag=valor".
    const eqIdx = arg.indexOf('=');
    const argFlag = eqIdx > 0 ? arg.slice(0, eqIdx) : arg;
    if (flags.includes(argFlag)) {
      if (eqIdx > 0) return arg.slice(eqIdx + 1);
      const next = args[i + 1];
      if (next !== undefined) return next;
    }
  }
  return process.env[envName];
}

function hasFlag(args: string[], ...flags: string[]): boolean {
  return flags.some((flag) => args.includes(flag));
}

function parseArgs(): ProvisionConfig {
  const args = process.argv.slice(2);

  if (hasFlag(args, '--help', '-h')) {
    showHelp();
  }

  const rawMode = getEnvOrArg(args, ['--mode'], 'PROVISION_MODE');
  const mode: ProvisionMode = rawMode === 'agency-subaccount' ? 'agency-subaccount' : 'isolated-instance';
  if (rawMode && rawMode !== 'isolated-instance' && rawMode !== 'agency-subaccount') {
    throw new Error(`--mode inválido: "${rawMode}" (use isolated-instance ou agency-subaccount)`);
  }

  const config: ProvisionConfig = {
    mode,
    agencyId: getEnvOrArg(args, ['--agency-id'], 'AGENCY_ID'),
    workspaceName: getEnvOrArg(args, ['--workspace-name', '-w'], '') ?? '',
    ownerEmail: getEnvOrArg(args, ['--owner-email', '-e'], '') ?? '',
    clientName: getEnvOrArg(args, ['--client-name', '-c'], '') ?? '',
    supabaseProjectId: getEnvOrArg(args, ['--supabase-project-id'], 'SUPABASE_PROJECT_ID'),
    supabaseUrl: getEnvOrArg(args, ['--supabase-url'], 'SUPABASE_URL'),
    supabaseServiceRoleKey: getEnvOrArg(args, ['--supabase-service-role-key'], 'SUPABASE_SERVICE_ROLE_KEY'),
    supabaseAnonKey: getEnvOrArg(args, ['--supabase-anon-key'], 'SUPABASE_ANON_KEY'),
    ghlApiKey: getEnvOrArg(args, ['--ghl-api-key'], 'GHL_API_KEY'),
    ghlLocationId: getEnvOrArg(args, ['--ghl-location-id'], 'GHL_LOCATION_ID'),
    webhookSecret: getEnvOrArg(args, ['--webhook-secret'], 'WEBHOOK_SECRET'),
    vercelProjectName: getEnvOrArg(args, ['--vercel-project-name'], 'VERCEL_PROJECT_NAME'),
    vercelToken: getEnvOrArg(args, ['--vercel-token'], 'VERCEL_TOKEN'),
    ownerPassword: getEnvOrArg(args, ['--owner-password'], 'OWNER_PASSWORD'),
    // Real ("molhado") por padrão só com --create-supabase/--deploy-vercel (modo
    // isolated-instance) OU --execute (necessário em agency-subaccount, que nunca
    // usa create-supabase/deploy-vercel — sem --execute essa combinação nunca
    // sairia do dry-run). --dry-run sempre força simulação, mesmo com --execute.
    dryRun:
      hasFlag(args, '--dry-run') ||
      (!hasFlag(args, '--create-supabase') && !hasFlag(args, '--deploy-vercel') && !hasFlag(args, '--execute')),
    createSupabase: hasFlag(args, '--create-supabase'),
    deployVercel: hasFlag(args, '--deploy-vercel'),
    skipMigrations: hasFlag(args, '--skip-migrations'),
    skipFunctionsDeploy: hasFlag(args, '--skip-functions-deploy'),
    skipVercelEnv: hasFlag(args, '--skip-vercel-env'),
  };

  return config;
}

// ----------------------------------------------------------------------------
// Utilitários
// ----------------------------------------------------------------------------

function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

function exec(command: string, dryRun: boolean, options?: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: 'inherit' | 'pipe'; mask?: string[] }): string {
  const masked = options?.mask ? maskCommandSecrets(command, options.mask) : command;
  if (dryRun) {
    log('dry', `[DRY-RUN] Executaria: ${masked}`);
    return '';
  }
  log('info', `Executando: ${masked}`);
  const result = spawnSync(command, {
    shell: true,
    stdio: options?.stdio ?? 'pipe',
    cwd: options?.cwd,
    env: { ...process.env, ...(options?.env ?? {}) },
  });

  const stdout = result.stdout?.toString('utf8') ?? '';
  const stderr = result.stderr?.toString('utf8') ?? '';

  if (result.status !== 0) {
    const sanitizedStderr = sanitizeOutput(stderr);
    log('error', `Comando falhou (exit ${result.status ?? 'unknown'}): ${masked}`);
    if (sanitizedStderr) log('error', sanitizedStderr);
    throw new Error(`Comando falhou: ${masked}`);
  }
  return stdout;
}

function checkCli(tool: string): boolean {
  try {
    execSync(`${tool} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidClientName(name: string): boolean {
  return /^[a-z0-9-]+$/.test(name);
}

// ----------------------------------------------------------------------------
// Validação de inputs
// ----------------------------------------------------------------------------

async function collectInputs(config: ProvisionConfig): Promise<ProvisionConfig> {
  log('step', 'Coletando informações do novo cliente...');

  if (!config.clientName) {
    config.clientName = (await promptRequired('Nome curto do cliente (slug/identificador): ')).toLowerCase();
  }
  if (!config.workspaceName) {
    config.workspaceName = await promptRequired('Nome do workspace inicial: ');
  }
  if (!config.ownerEmail) {
    config.ownerEmail = await promptRequired('E-mail do owner/admin do workspace: ');
  }
  if (!config.ownerPassword) {
    config.ownerPassword = await promptRequired('Senha do owner/admin: ', true);
  }

  if (!isValidClientName(config.clientName)) {
    throw new Error('client-name deve conter apenas letras minúsculas (a-z), números (0-9) e hífen (-)');
  }
  if (!isValidEmail(config.ownerEmail)) {
    throw new Error('E-mail do owner é inválido');
  }

  if (config.mode === 'agency-subaccount') {
    // agency-subaccount: SEMPRE contra a instância Agency já existente — nunca cria
    // projeto Supabase novo, nunca pede GHL API key/webhook secret (o cliente conecta
    // a própria chave depois via BYOK, Fase 4 — /workspace/integracoes).
    if (!config.agencyId) {
      config.agencyId = await promptRequired('ID da agência (uuid) dona do novo workspace: ');
    }
    if (!config.supabaseUrl) {
      config.supabaseUrl = await promptRequired('URL do Supabase da instância Agency existente: ');
    }
    if (!config.supabaseAnonKey) {
      config.supabaseAnonKey = await promptRequired('Supabase Anon Key (instância Agency existente): ', true);
    }
    if (!config.supabaseServiceRoleKey) {
      config.supabaseServiceRoleKey = await promptRequired('Supabase Service Role Key (instância Agency existente): ', true);
    }
    if (!config.ghlLocationId) {
      const provided = await prompt('GHL Location ID (deixe em branco para o cliente conectar depois via BYOK): ');
      config.ghlLocationId = provided || undefined;
    }

    log('info', `Cliente: ${config.clientName}`);
    log('info', `Agência: ${config.agencyId}`);
    log('info', `Workspace: ${config.workspaceName}`);
    log('info', `Owner: ${config.ownerEmail}`);
    log('info', `GHL Location: ${config.ghlLocationId ?? '(nenhum — status pending, BYOK depois)'}`);

    return config;
  }

  if (!config.createSupabase) {
    const hasCredentials =
      Boolean(config.supabaseUrl) && Boolean(config.supabaseAnonKey) && Boolean(config.supabaseServiceRoleKey);
    if (!config.supabaseProjectId && !hasCredentials) {
      config.supabaseProjectId = await prompt('ID do projeto Supabase (deixe em branco se ainda não tiver): ');
    }
    if (!config.supabaseUrl) {
      config.supabaseUrl = await promptRequired('URL do projeto Supabase (ex: https://abc123.supabase.co): ');
    }
    if (!config.supabaseAnonKey) {
      config.supabaseAnonKey = await promptRequired('Supabase Anon Key: ', true);
    }
    if (!config.supabaseServiceRoleKey) {
      config.supabaseServiceRoleKey = await promptRequired('Supabase Service Role Key: ', true);
    }
  } else {
    // Com --create-supabase, as credenciais são obtidas APÓS criar/linkar o projeto.
    // Se o usuário já passou valores via args/env, eles são preservados e usados.
    // Não solicitamos antecipadamente para evitar vazamento e experiência ruim.
  }

  if (!config.ghlApiKey) {
    config.ghlApiKey = await promptRequired('GHL API Key (Private Integration Token): ', true);
  }
  if (!config.ghlLocationId) {
    config.ghlLocationId = await promptRequired('GHL Location ID: ');
  }
  if (!config.webhookSecret) {
    const generated = generateWebhookSecret();
    const useGenerated = await prompt(`WEBHOOK_SECRET (deixe em branco para gerar automaticamente: ${maskSecret(generated)}): `, true);
    config.webhookSecret = useGenerated || generated;
  }

  if (config.deployVercel && !config.vercelProjectName) {
    config.vercelProjectName = await prompt('Nome do projeto Vercel (deixe em branco para sugerir): ');
  }

  if (config.deployVercel && !config.dryRun && !config.vercelToken) {
    config.vercelToken = await promptRequired('Vercel Token (obrigatório para --deploy-vercel): ', true);
  }

  log('info', `Cliente: ${config.clientName}`);
  log('info', `Workspace: ${config.workspaceName}`);
  log('info', `Owner: ${config.ownerEmail}`);
  log('info', `GHL Location: ${config.ghlLocationId}`);
  log('info', `Webhook Secret: ${maskSecret(config.webhookSecret)}`);

  return config;
}

function validateConfig(config: ProvisionConfig, meta?: SupabaseProjectMeta): void {
  if (!config.workspaceName) throw new Error('workspaceName é obrigatório');
  if (!config.ownerEmail) throw new Error('ownerEmail é obrigatório');
  if (!config.ownerPassword) throw new Error('ownerPassword é obrigatória');

  if (!isValidClientName(config.clientName)) {
    throw new Error('client-name deve conter apenas letras minúsculas (a-z), números (0-9) e hífen (-)');
  }
  if (!isValidEmail(config.ownerEmail)) {
    throw new Error('ownerEmail é inválido');
  }

  if (config.mode === 'agency-subaccount') {
    if (!config.agencyId) throw new Error('agencyId é obrigatório em --mode=agency-subaccount');
    if (!config.supabaseUrl) throw new Error('supabaseUrl é obrigatório em --mode=agency-subaccount (instância Agency já existente)');
    if (!config.supabaseServiceRoleKey) throw new Error('supabaseServiceRoleKey é obrigatório em --mode=agency-subaccount');
    if (!config.supabaseAnonKey) throw new Error('supabaseAnonKey é obrigatório em --mode=agency-subaccount');
    if (config.createSupabase) throw new Error('--create-supabase não é compatível com --mode=agency-subaccount (usa a instância já existente)');
    if (config.deployVercel) throw new Error('--deploy-vercel não é compatível com --mode=agency-subaccount (usa o deploy já existente)');
    // ghlLocationId é OPCIONAL neste modo: sem ele, o workspace nasce status=pending
    // e o cliente conecta a própria chave depois via BYOK (Fase 4).
    return;
  }

  if (!config.ghlApiKey) throw new Error('ghlApiKey é obrigatório');
  if (!config.ghlLocationId) throw new Error('ghlLocationId é obrigatório');
  if (!config.webhookSecret) throw new Error('webhookSecret é obrigatório');

  if (!config.createSupabase) {
    if (!config.supabaseUrl) throw new Error('supabaseUrl é obrigatório quando --create-supabase não é usado');
    if (!config.supabaseServiceRoleKey) throw new Error('supabaseServiceRoleKey é obrigatório quando --create-supabase não é usado');
    if (!config.supabaseAnonKey) throw new Error('supabaseAnonKey é obrigatório quando --create-supabase não é usado');
  }

  if (meta) {
    if (!meta.url) throw new Error('Não foi possível determinar a URL do Supabase');
    if (!meta.anonKey) throw new Error('Não foi possível determinar a Anon Key do Supabase');
  }
}

// ----------------------------------------------------------------------------
// Supabase: criação / link
// ----------------------------------------------------------------------------

function listSupabaseProjects(dryRun: boolean): Array<{ ref: string; name: string }> {
  if (dryRun) return [];
  if (!checkCli('supabase')) return [];
  try {
    const output = execSync('supabase projects list', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    // Formato esperado: tabela com colunas. Faz parse simples por linhas.
    const lines = output.split('\n').slice(1); // pula header
    const projects: Array<{ ref: string; name: string }> = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 2) {
        projects.push({ ref: parts[0], name: parts[1] });
      }
    }
    return projects;
  } catch {
    return [];
  }
}

async function createSupabaseProject(config: ProvisionConfig): Promise<SupabaseProjectMeta> {
  log('step', 'Criando/linkando projeto Supabase...');

  if (!checkCli('supabase')) {
    throw new Error('CLI do Supabase não encontrada. Instale: https://supabase.com/docs/guides/cli/getting-started');
  }

  const projectName = config.clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  log('info', `Nome sugerido do projeto Supabase: ${projectName}`);

  if (config.dryRun) {
    log('dry', `[DRY-RUN] Criaria projeto Supabase: ${projectName}`);
    return {
      id: 'dry-run-project-id',
      name: projectName,
      ref: 'dryrun',
      url: config.supabaseUrl ?? `https://${projectName}.supabase.co`,
      anonKey: config.supabaseAnonKey ?? 'dry-run-anon-key',
    };
  }

  // Se já tiver um project_id, apenas linka
  if (config.supabaseProjectId) {
    log('info', `Linkando projeto existente: ${config.supabaseProjectId}`);
    exec(`supabase link --project-ref ${config.supabaseProjectId}`, false);
    const status = exec('supabase status', false);
    log('info', sanitizeOutput(status));
    return {
      id: config.supabaseProjectId,
      name: projectName,
      ref: config.supabaseProjectId,
      url: config.supabaseUrl ?? `https://${config.supabaseProjectId}.supabase.co`,
      anonKey: config.supabaseAnonKey ?? '',
    };
  }

  // Idempotência: verifica se já existe projeto com mesmo nome
  const existingProjects = listSupabaseProjects(config.dryRun);
  const existing = existingProjects.find((p) => p.name === projectName || p.ref === projectName);
  if (existing) {
    log('warn', `Já existe um projeto Supabase com nome/ref ${existing.ref} (${existing.name})`);
    const useExisting = await promptYesNo('Deseja usar o projeto existente?', true);
    if (useExisting) {
      config.supabaseProjectId = existing.ref;
      return createSupabaseProject(config);
    }
    throw new Error('Abortado pelo usuário. Escolha outro client-name ou use --supabase-project-id.');
  }

  // Criação real de projeto via CLI (requer login)
  log('info', `Criando projeto Supabase ${projectName}...`);
  const stdout = exec(`supabase projects create ${projectName} --org-id default --region sa-east-1 --plan free`, false);
  log('info', sanitizeOutput(stdout));

  // Tenta extrair o project ref da saída (formato pode variar)
  const refMatch = stdout.match(/Project ref:\s*([a-z0-9_-]+)/i) ?? stdout.match(/Reference ID:\s*([a-z0-9_-]+)/i);
  const ref = refMatch?.[1];
  if (!ref) {
    throw new Error('Não foi possível extrair o project ref do Supabase após criação. Verifique o dashboard.');
  }

  log('info', `Aguardando projeto ficar disponível: ${ref}`);
  // Polling simples de status (max 5 min)
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      exec(`supabase link --project-ref ${ref}`, false);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  // Tenta extrair anon key via CLI (comando pode não existir em todas as versões)
  let anonKey = config.supabaseAnonKey ?? '';
  try {
    const apiKeys = exec(`supabase projects api-keys --project-ref ${ref}`, false);
    const anonMatch = apiKeys.match(/anon[\s\S]*?eyJ[\w-]*\.[\w-]*\.[\w-]*/);
    if (anonMatch) anonKey = anonMatch[0].trim();
  } catch {
    log('warn', 'Não foi possível extrair a anon key automaticamente. Será solicitada.');
  }

  return {
    id: ref,
    name: projectName,
    ref,
    url: config.supabaseUrl ?? `https://${ref}.supabase.co`,
    anonKey,
  };
}

// ----------------------------------------------------------------------------
// Migrations
// ----------------------------------------------------------------------------

async function applyMigrations(config: ProvisionConfig, meta: SupabaseProjectMeta): Promise<void> {
  if (config.skipMigrations) {
    log('warn', 'Migrations puladas (--skip-migrations)');
    return;
  }

  log('step', 'Aplicando migrations no banco...');

  if (config.dryRun) {
    log('dry', `[DRY-RUN] Executaria: supabase db push`);
    return;
  }

  if (!meta.ref) {
    throw new Error('Project ref não disponível para aplicar migrations');
  }

  exec(`supabase db push --linked`, false);
  log('success', 'Migrations aplicadas com sucesso.');
}

// ----------------------------------------------------------------------------
// Edge functions: secrets e deploy
// ----------------------------------------------------------------------------

async function configureFunctionSecrets(config: ProvisionConfig, meta: SupabaseProjectMeta): Promise<void> {
  log('step', 'Configurando secrets das edge functions...');

  const serviceRoleKey = config.supabaseServiceRoleKey;
  if (!serviceRoleKey) {
    throw new Error('Service role key é obrigatória para configurar secrets');
  }

  const secrets: Record<string, string> = {
    GHL_API_KEY: config.ghlApiKey!,
    GHL_LOCATION_ID: config.ghlLocationId!,
    WEBHOOK_SECRET: config.webhookSecret!,
    SUPABASE_URL: meta.url,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };

  if (config.dryRun) {
    for (const [key, value] of Object.entries(secrets)) {
      const display = key === 'SUPABASE_URL' ? value : maskSecret(value);
      log('dry', `[DRY-RUN] Configuraria secret: ${key}=${display}`);
    }
    return;
  }

  const tempFile = writeTempEnvFile(secrets);
  try {
    log('info', 'Aplicando secrets via arquivo temporário (valores mascarados nos logs)');
    exec(`supabase secrets set --env-file ${tempFile}`, false, { mask: Object.values(secrets) });
    log('success', 'Secrets configuradas com sucesso.');
  } finally {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // ignore
    }
  }
}

async function deployEdgeFunctions(config: ProvisionConfig): Promise<void> {
  if (config.skipFunctionsDeploy) {
    log('warn', 'Deploy de edge functions pulado (--skip-functions-deploy)');
    return;
  }

  log('step', 'Fazendo deploy das edge functions...');

  if (config.dryRun) {
    log('dry', `[DRY-RUN] Executaria: supabase functions deploy`);
    return;
  }

  exec('supabase functions deploy', false);
  log('success', 'Edge functions deployadas com sucesso.');
}

// ----------------------------------------------------------------------------
// Criação do workspace e seed
// ----------------------------------------------------------------------------

async function createWorkspace(
  config: ProvisionConfig,
  meta: SupabaseProjectMeta
): Promise<{ workspaceId: string; ownerUserId: string; ownerUserWasNew: boolean }> {
  log('step', 'Criando workspace inicial no banco...');

  const serviceClient = createClient(meta.url, config.supabaseServiceRoleKey ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Cria usuário owner via Admin API
  log('info', `Criando usuário owner: ${config.ownerEmail}`);
  const password = config.ownerPassword;
  if (!password) {
    throw new Error('ownerPassword é obrigatória');
  }

  if (config.dryRun) {
    log('dry', `[DRY-RUN] Criaria usuário owner e workspace`);
    return {
      workspaceId: '00000000-0000-0000-0000-000000000000',
      ownerUserId: '00000000-0000-0000-0000-000000000001',
      ownerUserWasNew: true,
    };
  }

  let existing: { id: string } | undefined;
  const LIST_USERS_PAGE_SIZE = 200;
  for (let page = 1; ; page++) {
    const { data: existingUsers, error: listError } = await serviceClient.auth.admin.listUsers({
      page,
      perPage: LIST_USERS_PAGE_SIZE,
    });
    if (listError) throw listError;
    existing = existingUsers?.users?.find((u) => u.email === config.ownerEmail);
    if (existing) break;
    if (!existingUsers?.users || existingUsers.users.length < LIST_USERS_PAGE_SIZE) break;
  }

  let ownerUserId = existing?.id;
  const ownerUserWasNew = !ownerUserId;

  if (!ownerUserId) {
    const { data: newUser, error: createError } = await serviceClient.auth.admin.createUser({
      email: config.ownerEmail,
      password,
      email_confirm: true,
    });
    if (createError) throw createError;
    ownerUserId = newUser.user?.id;
    if (!ownerUserId) throw new Error('Falha ao criar usuário owner');
    log('success', `Usuário owner criado: ${ownerUserId}`);
  } else {
    log('warn', `Usuário owner já existe: ${ownerUserId}. Atualizando senha para garantir login.`);
    const { error: updateError } = await serviceClient.auth.admin.updateUserById(ownerUserId, {
      password,
      email_confirm: true,
    });
    if (updateError) throw updateError;
  }

  log('warn', 'Use a senha fornecida para fazer login. Não foi gerada senha temporária. Guarde-a em cofre seguro.');

  // 2. Faz login do owner para obter JWT
  const { data: signInData, error: signInError } = await serviceClient.auth.signInWithPassword({
    email: config.ownerEmail,
    password,
  });
  if (signInError) throw signInError;
  const ownerAccessToken = signInData.session?.access_token;
  if (!ownerAccessToken) throw new Error('Não foi possível obter access token do owner');

  // 3. Cria workspace via RPC
  const ownerClient = createClient(meta.url, meta.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${ownerAccessToken}` } },
  });

  const { data: workspaceId, error: rpcError } = await ownerClient.rpc('create_workspace_with_owner', {
    workspace_name: config.workspaceName,
    workspace_settings: {
      client_name: config.clientName,
      ghl_location_id: config.ghlLocationId,
    },
  });

  if (rpcError) {
    log('error', `Erro ao criar workspace: ${rpcError.message}`);
    throw rpcError;
  }

  if (!workspaceId) throw new Error('Workspace ID não retornado');

  log('success', `Workspace criado: ${workspaceId}`);

  // 4. Garante seed de apps e permissões (idempotente; trigger já faz, mas reforçamos)
  const { error: seedError } = await serviceClient.rpc('setup_workspace_apps_and_permissions', {
    p_workspace_id: workspaceId,
  });
  if (seedError) {
    log('warn', `setup_workspace_apps_and_permissions retornou erro: ${seedError.message}`);
  } else {
    log('success', 'Apps e permissões seedados.');
  }

  // 5. Importa template Empire Default (idempotente; trigger já faz, mas reforçamos)
  const { data: templateRows, error: templateQueryError } = await serviceClient
    .from('ghl_field_mapping_templates')
    .select('logical_name, ghl_field_key, field_type, variations, is_required')
    .eq('name', 'Empire Default');

  if (templateQueryError) {
    log('warn', `Não foi possível buscar template Empire Default: ${templateQueryError.message}`);
  } else if (templateRows && templateRows.length > 0) {
    const mappings = templateRows.map((t) => ({
      workspace_id: workspaceId,
      logical_name: t.logical_name,
      ghl_field_key: t.ghl_field_key,
      field_type: t.field_type,
      variations: t.variations,
      is_required: t.is_required,
    }));

    const { error: insertError } = await serviceClient.from('ghl_field_mappings').upsert(mappings, {
      onConflict: 'workspace_id,logical_name',
    });
    if (insertError) {
      log('warn', `Importação do template Empire Default retornou erro: ${insertError.message}`);
    } else {
      log('success', `Template Empire Default importado (${mappings.length} campos).`);
    }
  } else {
    log('warn', 'Template Empire Default não encontrado. O workspace pode já ter recebido via trigger.');
  }

  return { workspaceId, ownerUserId, ownerUserWasNew };
}

// ----------------------------------------------------------------------------
// Fase 7 — Provisionamento agency-subaccount (workspace dentro da instância
// Agency já existente — sem criar projeto Supabase nem deploy novo)
// ----------------------------------------------------------------------------

async function validateAgencyExists(config: ProvisionConfig, meta: SupabaseProjectMeta): Promise<void> {
  if (config.dryRun) {
    log('dry', `[DRY-RUN] Validaria que a agência ${config.agencyId} existe`);
    return;
  }

  const serviceClient = createClient(meta.url, config.supabaseServiceRoleKey ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await serviceClient
    .from('agencies')
    .select('id, name')
    .eq('id', config.agencyId as string)
    .maybeSingle();

  if (error) throw new Error(`Erro ao validar agência: ${error.message}`);
  if (!data) {
    throw new Error(
      `Agência ${config.agencyId} não encontrada. Crie a agência primeiro (tabela public.agencies) ` +
        `antes de provisionar uma sub-conta para ela.`,
    );
  }

  log('success', `Agência confirmada: ${data.name} (${data.id})`);
}

async function linkWorkspaceToAgency(
  config: ProvisionConfig,
  meta: SupabaseProjectMeta,
  workspaceId: string,
): Promise<void> {
  const status = config.ghlLocationId ? 'active' : 'pending';

  if (config.dryRun) {
    log(
      'dry',
      `[DRY-RUN] Inseriria em agency_workspaces: agency_id=${config.agencyId}, workspace_id=${workspaceId}, ` +
        `ghl_location_id=${config.ghlLocationId ?? 'null'}, status=${status}, provisioning_mode=manual_byok`,
    );
    return;
  }

  const serviceClient = createClient(meta.url, config.supabaseServiceRoleKey ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await serviceClient.from('agency_workspaces').insert({
    agency_id: config.agencyId,
    workspace_id: workspaceId,
    ghl_location_id: config.ghlLocationId ?? null,
    status,
    provisioning_mode: 'manual_byok',
  });

  if (error) {
    if (error.message.includes('uq_agency_workspaces_location_active')) {
      throw new Error(
        `ghl_location_id "${config.ghlLocationId}" já está ativo em outro workspace desta agência (ou de outra). ` +
          `Cada location_id só pode estar ativo em UM workspace por vez — verifique agency_workspaces antes de tentar de novo.`,
      );
    }
    throw new Error(`Erro ao vincular workspace à agência: ${error.message}`);
  }

  log('success', `Workspace vinculado à agência (status=${status}, provisioning_mode=manual_byok).`);
}

/**
 * Fase 7 — item P2 (não-atomicidade documentada, docs/FASE-7-P2-ATOMICIDADE.md).
 *
 * `createWorkspace` (Admin Auth API + RPC) e `linkWorkspaceToAgency` (INSERT
 * em agency_workspaces) são chamadas de rede separadas — não cabem numa única
 * transação SQL (ver docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md secao 2 para o
 * contraste com purge_workspace_data, que É uma função só e por isso É atômica
 * de graça). Uma transação real de verdade exigiria um "distributed saga" com
 * coordenador próprio — desproporcional para um script de operador rodado
 * manualmente e raramente.
 *
 * Em vez disso: se `linkWorkspaceToAgency` falhar depois que o workspace já
 * foi criado, este rollback COMPENSATÓRIO apaga o que já foi commitado —
 * reusando a MESMA RPC `purge_workspace_data` da Fase 8 (LGPD), que já é
 * atômica, já testada (5/5) e já sabe limpar 100% dos dados de um workspace
 * sem deixar órfão. Isso reduz o não-atomicidade documentado de "orfão
 * permanente, conserto manual" para "rollback automático, log claro do que
 * aconteceu" — sem reescrever a arquitetura do script.
 *
 * Cuidado deliberado: só apaga o usuário do Auth se ele foi CRIADO por esta
 * execução (ownerUserWasNew) E aparece na lista de "exclusivo" que a própria
 * purge_workspace_data calcula (nenhuma outra membership). Um e-mail
 * REUTILIZADO (usuário que já existia antes desta tentativa) NUNCA é apagado
 * — evita destruir a conta de um operador que só errou o location_id.
 */
async function rollbackOrphanedWorkspace(
  config: ProvisionConfig,
  meta: SupabaseProjectMeta,
  workspaceId: string,
  ownerUserId: string,
  ownerUserWasNew: boolean,
): Promise<void> {
  log('warn', `Revertendo workspace órfão ${workspaceId} (falha no passo de vínculo com a agência)...`);

  const serviceClient = createClient(meta.url, config.supabaseServiceRoleKey ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: report, error: purgeError } = await serviceClient.rpc('purge_workspace_data', {
    p_workspace_id: workspaceId,
    p_confirmation_name: config.workspaceName,
    p_dry_run: false,
  });

  if (purgeError) {
    log(
      'error',
      `ROLLBACK AUTOMÁTICO FALHOU: ${purgeError.message}. ` +
        `O workspace ${workspaceId} (owner ${ownerUserId}) ficou ÓRFÃO — precisa de limpeza manual ` +
        `(scripts/purge-workspace.ts --workspace-id=${workspaceId} --confirm="${config.workspaceName}" --execute).`,
    );
    return;
  }

  log('success', `Rollback automático concluído — workspace órfão ${workspaceId} removido sem deixar rastro.`);

  const exclusiveUserIds: string[] = report?.usuarios_exclusivos_nao_apagados_de_auth_users ?? [];
  if (ownerUserWasNew && exclusiveUserIds.includes(ownerUserId)) {
    const { error: delUserError } = await serviceClient.auth.admin.deleteUser(ownerUserId);
    if (delUserError) {
      log('warn', `Falha ao apagar o usuário owner recém-criado ${ownerUserId}: ${delUserError.message} (ação manual necessária).`);
    } else {
      log('success', `Usuário owner recém-criado ${ownerUserId} também removido (não existia antes desta tentativa).`);
    }
  } else if (!ownerUserWasNew) {
    log('info', `Usuário owner ${ownerUserId} já existia antes desta tentativa — preservado (não apagado pelo rollback).`);
  }
}

async function provisionAgencySubaccount(config: ProvisionConfig): Promise<{ workspaceId: string; meta: SupabaseProjectMeta }> {
  // Nunca cria projeto Supabase nem faz deploy — usa a instância Agency já
  // existente, cujas credenciais o operador informa (mesmas do .env de produção
  // ou de teste, conforme o alvo pretendido).
  const meta: SupabaseProjectMeta = {
    id: 'agency-shared-instance',
    name: config.clientName,
    ref: 'agency-shared-instance',
    url: config.supabaseUrl ?? '',
    anonKey: config.supabaseAnonKey ?? '',
  };

  await validateAgencyExists(config, meta);

  const created = await createWorkspace(config, meta);

  try {
    await linkWorkspaceToAgency(config, meta, created.workspaceId);
  } catch (linkError) {
    if (!config.dryRun) {
      await rollbackOrphanedWorkspace(config, meta, created.workspaceId, created.ownerUserId, created.ownerUserWasNew);
    }
    throw linkError;
  }

  return { workspaceId: created.workspaceId, meta };
}

function printAgencySubaccountInstructions(config: ProvisionConfig, workspaceId: string): void {
  console.log('');
  log('success', '============================================================');
  log('success', '  Sub-conta provisionada na instância Agency existente');
  log('success', '============================================================');
  console.log('');
  log('info', `Cliente: ${config.clientName}`);
  log('info', `Agência: ${config.agencyId}`);
  log('info', `Workspace: ${config.workspaceName} (${workspaceId})`);
  log('info', `Status em agency_workspaces: ${config.ghlLocationId ? 'active' : 'pending'}`);
  console.log('');
  log('step', 'Próximos passos:');
  console.log(`  1. Faça login no frontend já deployado com o e-mail owner: ${config.ownerEmail}`);
  if (!config.ghlLocationId) {
    console.log(`  2. O cliente conecta a própria chave GHL em /workspace/integracoes (BYOK, Fase 4).`);
    console.log(`     Até lá, o workspace fica com status=pending em agency_workspaces.`);
  } else {
    console.log(`  2. Confirme em /workspace/integracoes que a chave GHL do location ${config.ghlLocationId} está conectada.`);
  }
  console.log(`  3. Convide os demais membros do workspace (se houver) via /workspace/membros ou a função invite-user.`);
  console.log(`  4. Confira /agency/workspaces — a nova sub-conta deve aparecer na lista da agência.`);
  console.log('');
  log('warn', 'Nenhum projeto Supabase ou deploy Vercel novo foi criado — este modo usa a instância já existente.');
  console.log('');
}

// ----------------------------------------------------------------------------
// Vercel
// ----------------------------------------------------------------------------

function vercelApiRequest<T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<{ statusCode: number; data?: T; error?: string }> {
  return new Promise((resolve) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'api.vercel.com',
        port: 443,
        path,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? (JSON.parse(data) as T) : undefined;
            resolve({ statusCode: res.statusCode ?? 0, data: parsed });
          } catch {
            resolve({ statusCode: res.statusCode ?? 0, error: data });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ statusCode: 0, error: err.message }));

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function vercelProjectExists(token: string, projectName: string): Promise<boolean> {
  const result = await vercelApiRequest<unknown>(token, 'GET', `/v9/projects/${encodeURIComponent(projectName)}`);
  return result.statusCode === 200;
}

async function createVercelProject(token: string, projectName: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    log('dry', `[DRY-RUN] Criaria projeto Vercel: ${projectName}`);
    return;
  }
  const exists = await vercelProjectExists(token, projectName);
  if (exists) {
    log('warn', `Projeto Vercel ${projectName} já existe. Usando existente.`);
    return;
  }
  log('info', `Criando projeto Vercel: ${projectName}`);
  const result = await vercelApiRequest<{ id?: string }>(token, 'POST', '/v9/projects', { name: projectName });
  if (result.statusCode >= 200 && result.statusCode < 300) {
    log('success', `Projeto Vercel criado: ${projectName}`);
  } else {
    throw new Error(`Falha ao criar projeto Vercel: ${result.error ?? `HTTP ${result.statusCode}`}`);
  }
}

async function setVercelEnvVar(
  token: string,
  projectName: string,
  key: string,
  value: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) {
    log('dry', `[DRY-RUN] Configuraria env no Vercel: ${key}=${maskSecret(value)}`);
    return;
  }
  log('info', `Configurando env no Vercel: ${key}`);
  const result = await vercelApiRequest<unknown>(token, 'POST', `/v9/projects/${encodeURIComponent(projectName)}/env`, {
    key,
    value,
    type: 'encrypted',
    target: ['production', 'preview', 'development'],
  });
  if (result.statusCode >= 200 && result.statusCode < 300) {
    log('success', `Env ${key} configurada no Vercel.`);
  } else {
    throw new Error(`Falha ao configurar env ${key} no Vercel: ${result.error ?? `HTTP ${result.statusCode}`}`);
  }
}

async function configureVercel(config: ProvisionConfig, meta: SupabaseProjectMeta): Promise<void> {
  log('step', 'Preparando deploy/variáveis do Vercel...');

  const envVars: Record<string, string> = {
    VITE_SUPABASE_URL: meta.url,
    VITE_SUPABASE_ANON_KEY: meta.anonKey,
    VITE_GHL_LOCATION_ID: config.ghlLocationId,
  };

  const projectName = config.vercelProjectName || `${config.clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-empire`;

  if (config.dryRun || !config.deployVercel) {
    log('info', 'Comando sugerido para criar projeto Vercel:');
    console.log(`  vercel projects add ${projectName}`);
    console.log('');
    log('info', 'Variáveis de ambiente a configurar no Vercel:');
    for (const [key, value] of Object.entries(envVars)) {
      const display = key.includes('URL') ? value : maskSecret(value);
      console.log(`  ${key}=${display}`);
    }
    return;
  }

  if (!config.vercelToken) {
    throw new Error('VERCEL_TOKEN é obrigatório para --deploy-vercel');
  }

  await createVercelProject(config.vercelToken, projectName, config.dryRun);

  log('info', 'Configurando variáveis de ambiente no Vercel...');
  for (const [key, value] of Object.entries(envVars)) {
    await setVercelEnvVar(config.vercelToken, projectName, key, value, config.dryRun);
  }

  log('info', `Deploy do frontend: cd eb-dash2 && vercel --prod`);
}

// ----------------------------------------------------------------------------
// Instruções finais
// ----------------------------------------------------------------------------

function printInstructions(config: ProvisionConfig, meta: SupabaseProjectMeta, workspaceId: string): void {
  const webhookUrl = `${meta.url}/functions/v1/webhook-ghl`;

  console.log('');
  log('success', '============================================================');
  log('success', '  Provisionamento do cliente Empire finalizado');
  log('success', '============================================================');
  console.log('');
  log('info', `Cliente: ${config.clientName}`);
  log('info', `Workspace: ${config.workspaceName} (${workspaceId})`);
  log('info', `Supabase URL: ${meta.url}`);
  log('info', `Supabase Project ID: ${meta.id}`);
  console.log('');
  log('step', 'Próximos passos:');
  console.log(`  1. Acesse o frontend deployado no Vercel.`);
  console.log(`  2. Faça login com o e-mail owner: ${config.ownerEmail}`);
  console.log(`  3. Vá em Configurações → Integração GHL (/workspace/ghl-config).`);
  console.log(`  4. Configure a API key e o webhook secret (ou confirme se já estão salvos).`);
  console.log(`  5. No GHL do cliente, configure o webhook:`);
  console.log(`     URL: ${webhookUrl}`);
  console.log(`     Secret: ${maskSecret(config.webhookSecret ?? '')}`);
  console.log(`     Eventos recomendados: contact.create, contact.update, opportunity.create, opportunity.update, opportunity.status_update`);
  console.log(`  6. Use a função "Descobrir campos do GHL" para mapear pipelines/stages.`);
  console.log(`  7. Envie um evento de teste do GHL e verifique a tabela webhooks_ghl.`);
  console.log('');
  log('warn', 'Lembre-se de salvar as credenciais em um cofre seguro (1Password, Bitwarden etc).');
  console.log('');
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = parseArgs();

  console.log('');
  log('step', `Empire — Provisionamento de novo cliente (modo: ${config.mode})`);
  log('info', 'Modo padrão: dry-run. Use --create-supabase e/ou --deploy-vercel para ações reais.');
  console.log('');
  const populated = await collectInputs(config);

  if (populated.mode === 'agency-subaccount') {
    validateConfig(populated);
    const { workspaceId } = await provisionAgencySubaccount(populated);
    printAgencySubaccountInstructions(populated, workspaceId);
    return;
  }

  let meta: SupabaseProjectMeta | undefined;

  if (populated.createSupabase) {
    meta = await createSupabaseProject(populated);
    // Se a anon key não veio por env/arg e a extração automática falhou, solicita
    if (!meta.anonKey && !populated.supabaseAnonKey) {
      populated.supabaseAnonKey = await promptRequired('Supabase Anon Key (não foi possível extrair automaticamente): ', true);
      meta.anonKey = populated.supabaseAnonKey;
    }
    if (!populated.supabaseServiceRoleKey) {
      populated.supabaseServiceRoleKey = await promptRequired('Supabase Service Role Key: ', true);
    }
    if (!populated.supabaseUrl || populated.supabaseUrl.startsWith('http://placeholder')) {
      populated.supabaseUrl = `https://${meta.ref}.supabase.co`;
      meta.url = populated.supabaseUrl;
    }
  } else {
    validateConfig(populated);
    meta = {
      id: populated.supabaseProjectId ?? 'manual',
      name: populated.clientName,
      ref: populated.supabaseProjectId ?? 'manual',
      url: populated.supabaseUrl ?? '',
      anonKey: populated.supabaseAnonKey ?? '',
    };
  }

  validateConfig(populated, meta);

  await applyMigrations(populated, meta);
  await configureFunctionSecrets(populated, meta);
  await deployEdgeFunctions(populated);

  const { workspaceId } = await createWorkspace(populated, meta);

  await configureVercel(populated, meta);

  printInstructions(populated, meta, workspaceId);
}

main().catch((err) => {
  log('error', err?.message ?? String(err));
  process.exit(1);
});
