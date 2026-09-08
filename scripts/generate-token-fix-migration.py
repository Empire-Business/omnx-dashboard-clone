#!/usr/bin/env python3
"""
Gera migration para remover tokens Supabase hardcoded de funções PostgreSQL
e cron jobs, centralizando-os na tabela `secrets` com helper `get_secret()`.

Uso:
  python3 scripts/generate-token-fix-migration.py
  python3 scripts/generate-token-fix-migration.py --apply

Saída:
  - supabase/migrations/YYYYMMDDHHMMSS_remove_hardcoded_supabase_tokens.sql
    (migration segura, com placeholders, pode ser commitada)
  - /tmp/apply-supabase-secrets.sql
    (script temporário com valores reais; aplicar e depois deletar)
"""

import base64
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"


def run_query(sql: str) -> list:
    """Roda SQL via supabase db query --linked --output json."""
    result = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json", sql],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERRO ao rodar SQL: {result.stderr}", file=sys.stderr)
        raise RuntimeError(result.stderr)

    lines = result.stdout.strip().splitlines()
    start_idx = None
    end_idx = None
    for i, line in enumerate(lines):
        stripped = line.strip()
        if start_idx is None and (stripped.startswith("[") or stripped.startswith("{")):
            start_idx = i
        if start_idx is not None and (stripped.endswith("]") or stripped.endswith("}")):
            end_idx = i
    if start_idx is None or end_idx is None:
        print("Saída inesperada:", result.stdout, file=sys.stderr)
        return []
    json_text = "\n".join(lines[start_idx : end_idx + 1])
    return json.loads(json_text)


def decode_jwt_payload(token: str) -> dict:
    """Decodifica payload de JWT sem validar assinatura."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return {}
        payload = parts[1]
        payload += "=" * (4 - len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload)
        return json.loads(decoded)
    except Exception:
        return {}


def identify_token(token: str) -> tuple:
    """Retorna (role, iat) baseado no payload do JWT."""
    payload = decode_jwt_payload(token)
    role = payload.get("role", "unknown")
    iat = payload.get("iat", 0)
    return role, iat


def extract_hardcoded_tokens(text: str) -> list:
    """Extrai todos os JWTs hardcoded do texto."""
    pattern = re.compile(r"eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*")
    return list(set(pattern.findall(text)))


def extract_hardcoded_urls(text: str) -> list:
    """Extrai URLs do projeto hardcoded."""
    pattern = re.compile(r"https://[a-z0-9-]+\.supabase\.co")
    return list(set(pattern.findall(text)))


def get_affected_functions() -> list:
    sql = """
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
          pg_get_functiondef(p.oid) ILIKE '%bearer%'
          OR pg_get_functiondef(p.oid) LIKE '%app_settings.%'
          OR pg_get_functiondef(p.oid) LIKE '%.supabase.co%'
      )
    ORDER BY p.proname;
    """
    return run_query(sql)


def get_affected_cron_jobs() -> list:
    sql = """
    SELECT jobname, schedule, command
    FROM cron.job
    WHERE command ILIKE '%bearer%'
       OR command LIKE '%app_settings.%'
       OR command LIKE '%.supabase.co%'
    ORDER BY jobname;
    """
    return run_query(sql)


def choose_current_token(tokens: list, role: str) -> Optional[str]:
    """Escolhe o token mais recente (maior iat) para cada role."""
    candidates = []
    for token in tokens:
        token_role, iat = identify_token(token)
        if token_role == role:
            candidates.append((token, iat))
    if not candidates:
        return None
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[0][0]


def replace_tokens_in_sql(sql_text: str, token_map: dict, project_url: str) -> str:
    """Substitui tokens e URLs hardcoded por get_secret()."""
    # Substitui URLs do projeto
    sql_text = re.sub(
        re.escape(project_url),
        "' || get_secret('supabase_url') || '",
        sql_text,
    )

    # Substitui cada token pelo placeholder/setting correspondente
    for token, setting_name in token_map.items():
        sql_text = sql_text.replace(
            token,
            f"' || get_secret('{setting_name}') || '",
        )

    # Corrige namespace errado app_settings -> app.settings
    sql_text = sql_text.replace("app_settings.", "app.settings.")

    # Substitui current_setting('app.settings.xxx', true) por get_secret('xxx')
    sql_text = re.sub(
        r"current_setting\('app\.settings\.([a-zA-Z0-9_]+)',\s*true\)",
        r"get_secret('\1')",
        sql_text,
    )

    # Substitui current_setting('app.xxx') sem .settings e sem fallback
    sql_text = re.sub(
        r"current_setting\('app\.([a-zA-Z0-9_]+)'\)",
        r"get_secret('\1')",
        sql_text,
    )

    # Substitui current_setting('app.xxx', true) sem .settings
    sql_text = re.sub(
        r"current_setting\('app\.([a-zA-Z0-9_]+)',\s*true\)",
        r"get_secret('\1')",
        sql_text,
    )

    # Normaliza nomes de secrets para os padrões centralizados
    sql_text = sql_text.replace("get_secret('supabase_anon_key')", "get_secret('anon_key')")
    sql_text = sql_text.replace("get_secret('weekly_reports_anon_key')", "get_secret('anon_key')")

    # Substitui setting customizado meta_ads_sync_url pelo supabase_url + path
    sql_text = sql_text.replace(
        "get_secret('meta_ads_sync_url')",
        "get_secret('supabase_url') || '/functions/v1/sync-meta-ads'",
    )

    return sql_text


def generate_migration(
    functions: list,
    cron_jobs: list,
    project_url: str,
    anon_token: Optional[str],
    service_token: Optional[str],
    token_map: dict,
) -> str:
    """Gera o conteúdo do migration (sem valores reais de tokens)."""
    lines = [
        "-- ============================================================",
        "-- Migration: remove tokens Supabase hardcoded de funções e cron jobs",
        "--",
        "-- O que faz:",
        "--   1. Cria tabela `secrets` para centralizar supabase_url, anon_key e service_role_key.",
        "--   2. Cria função helper `get_secret(key)` (SECURITY DEFINER) para ler secrets.",
        "--   3. Atualiza funções PostgreSQL que chamam edge functions para usar get_secret().",
        "--   4. Atualiza cron jobs que chamam edge functions para usar get_secret().",
        "--   5. Corrige referências ao namespace errado app_settings.*.",
        "--",
        "-- IMPORTANTE: após aplicar esta migration, execute imediatamente o script",
        "-- /tmp/apply-supabase-secrets.sql (gerado pelo mesmo gerador) para preencher",
        "-- os valores reais. Depois delete o script temporário.",
        "-- ============================================================",
        "",
        "-- Tabela centralizada de secrets (apenas service_role e SECURITY DEFINER functions acessam)",
        "CREATE TABLE IF NOT EXISTS secrets (",
        "    key TEXT PRIMARY KEY,",
        "    value TEXT NOT NULL,",
        "    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,",
        "    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL",
        ");",
        "",
        "ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;",
        "",
        "DROP POLICY IF EXISTS \"service_role_all_secrets\" ON secrets;",
        "CREATE POLICY \"service_role_all_secrets\"",
        "    ON secrets FOR ALL",
        "    TO service_role",
        "    USING (true) WITH CHECK (true);",
        "",
        "DROP TRIGGER IF EXISTS trigger_update_secrets_updated_at ON secrets;",
        "CREATE TRIGGER trigger_update_secrets_updated_at",
        "    BEFORE UPDATE ON secrets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();",
        "",
        "-- Helper SECURITY DEFINER para ler secrets (qualquer função pode usar)",
        "CREATE OR REPLACE FUNCTION public.get_secret(p_key TEXT)",
        "RETURNS TEXT",
        "LANGUAGE plpgsql",
        "SECURITY DEFINER",
        "SET search_path TO 'public'",
        "AS $$",
        "BEGIN",
        "    RETURN (SELECT value FROM secrets WHERE key = p_key);",
        "END;",
        "$$;",
        "",
        "-- Placeholders (serão sobrescritos pelo script de secrets)",
        "INSERT INTO secrets (key, value) VALUES",
        "    ('supabase_url', 'https://PROJECT_REF.supabase.co'),",
    ]

    if anon_token:
        lines.append("    ('anon_key', 'ANON_KEY_PLACEHOLDER'),")
    if service_token:
        lines.append("    ('service_role_key', 'SERVICE_ROLE_KEY_PLACEHOLDER'),")

    # Remove trailing comma from last value
    lines[-1] = lines[-1].rstrip(",")

    lines.append("ON CONFLICT (key) DO NOTHING;")
    lines.append("")

    if functions:
        lines.append("-- ============================================================")
        lines.append("-- Funções PostgreSQL atualizadas")
        lines.append("-- ============================================================")
        lines.append("")
        for fn in functions:
            lines.append(f"-- Function: {fn['proname']}")
            func_def = replace_tokens_in_sql(fn["def"], token_map, project_url)
            # pg_get_functiondef não inclui ';' final — adiciona se faltar
            func_def = func_def.rstrip()
            if not func_def.endswith(";"):
                func_def += ";"
            lines.append(func_def)
            lines.append("")

    if cron_jobs:
        lines.append("-- ============================================================")
        lines.append("-- Cron jobs atualizados")
        lines.append("-- ============================================================")
        lines.append("")
        for job in cron_jobs:
            lines.append(f"-- Cron job: {job['jobname']}")
            lines.append(f"SELECT cron.unschedule('{job['jobname']}')")
            lines.append(
                f"  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = '{job['jobname']}');"
            )
            new_command = replace_tokens_in_sql(job["command"], token_map, project_url)
            escaped_command = new_command.replace("'", "''")
            lines.append(
                f"SELECT cron.schedule('{job['jobname']}', '{job['schedule']}', '{escaped_command}');"
            )
            lines.append("")

    return "\n".join(lines)


def generate_secrets_script(
    project_url: str,
    anon_token: Optional[str],
    service_token: Optional[str],
) -> str:
    """Gera script SQL temporário com valores reais (não commitar)."""
    lines = [
        "-- ============================================================",
        "-- SCRIPT TEMPORÁRIO: aplicar valores reais dos secrets",
        "--",
        "-- Este arquivo contém secrets. Aplique e delete imediatamente.",
        "-- NÃO COMMITE.",
        "-- ============================================================",
        "",
        "INSERT INTO secrets (key, value) VALUES",
        f"    ('supabase_url', '{project_url}'),",
    ]

    if anon_token:
        lines.append(f"    ('anon_key', '{anon_token}'),")
    if service_token:
        lines.append(f"    ('service_role_key', '{service_token}'),")

    lines[-1] = lines[-1].rstrip(",")
    lines.append("ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();")
    lines.append("")
    return "\n".join(lines)


def apply_migration(migration_path: Path, secrets_path: Path) -> None:
    """Aplica migration e secrets no banco linkado."""
    print(f"Aplicando migration {migration_path}...")
    result = subprocess.run(
        ["supabase", "db", "push", "--linked", "--include-all"],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERRO ao aplicar migration: {result.stderr}", file=sys.stderr)
        raise RuntimeError(result.stderr)
    print("Migration aplicado.")

    print(f"Aplicando secrets de {secrets_path}...")
    result = subprocess.run(
        ["supabase", "db", "query", "--linked", "--file", str(secrets_path)],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"ERRO ao aplicar secrets: {result.stderr}", file=sys.stderr)
        raise RuntimeError(result.stderr)
    print("Secrets aplicados.")


def generate():
    print("Buscando funções e cron jobs afetados...")
    functions = get_affected_functions()
    cron_jobs = get_affected_cron_jobs()

    print(f"Encontradas {len(functions)} funções e {len(cron_jobs)} cron jobs afetados.")

    all_tokens = set()
    for fn in functions:
        all_tokens.update(extract_hardcoded_tokens(fn["def"]))
    for job in cron_jobs:
        all_tokens.update(extract_hardcoded_tokens(job["command"]))

    print(f"Tokens únicos encontrados: {len(all_tokens)}")
    for token in all_tokens:
        role, iat = identify_token(token)
        print(f"  - {role} (iat={iat}): {token[:20]}...")

    anon_token = choose_current_token(list(all_tokens), "anon")
    service_token = choose_current_token(list(all_tokens), "service_role")

    if not anon_token:
        print("AVISO: não foi encontrado anon token hardcoded.", file=sys.stderr)
    if not service_token:
        print("AVISO: não foi encontrado service_role token hardcoded.", file=sys.stderr)

    token_map = {}
    for token in all_tokens:
        role, _ = identify_token(token)
        if role == "anon" and anon_token:
            token_map[token] = "anon_key"
        elif role == "service_role" and service_token:
            token_map[token] = "service_role_key"

    project_url = None
    for fn in functions:
        urls = extract_hardcoded_urls(fn["def"])
        if urls:
            project_url = urls[0]
            break
    if not project_url:
        for job in cron_jobs:
            urls = extract_hardcoded_urls(job["command"])
            if urls:
                project_url = urls[0]
                break

    if not project_url:
        print("ERRO: não foi possível determinar a URL do projeto.", file=sys.stderr)
        sys.exit(1)

    print(f"URL do projeto: {project_url}")

    migration_content = generate_migration(functions, cron_jobs, project_url, anon_token, service_token, token_map)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    migration_path = MIGRATIONS_DIR / f"{timestamp}_remove_hardcoded_supabase_tokens.sql"
    migration_path.write_text(migration_content, encoding="utf-8")
    print(f"Migration gerado: {migration_path}")

    secrets_path = None
    if anon_token or service_token:
        secrets_content = generate_secrets_script(project_url, anon_token, service_token)
        secrets_path = Path("/tmp/apply-supabase-secrets.sql")
        secrets_path.write_text(secrets_content, encoding="utf-8")
        print(f"Script de secrets gerado: {secrets_path}")
        print("IMPORTANTE: aplique o script de secrets e delete-o em seguida.")

    return migration_path, secrets_path


def apply_mode():
    migration_files = sorted(MIGRATIONS_DIR.glob("*_remove_hardcoded_supabase_tokens.sql"))
    if not migration_files:
        print("ERRO: nenhuma migration de token fix encontrada.", file=sys.stderr)
        sys.exit(1)
    secrets_path = Path("/tmp/apply-supabase-secrets.sql")
    if not secrets_path.exists():
        print("ERRO: script de secrets não encontrado.", file=sys.stderr)
        sys.exit(1)
    apply_migration(migration_files[-1], secrets_path)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--apply":
        apply_mode()
    else:
        generate()


if __name__ == "__main__":
    main()
