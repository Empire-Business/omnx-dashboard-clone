#!/usr/bin/env python3
"""
Script: sync-evento-contacts.py
Sincroniza contatos do form-evento.csv com o GHL.

Para cada contato:
  - Busca no Supabase por e-mail (depois por telefone)
  - Se já tiver ambas as tags → SKIP
  - Se existir no GHL mas faltar tag → UPDATE (adiciona tags + obs__evento)
  - Se não existir no GHL → CREATE (cria contato com todos os campos)

Campos GHL: email, firstName, lastName, phone
Campo customizado: obs__evento (key: obs__evento) — CPF, emergência, hospedagem, etc.
Tags obrigatórias: ganhou-ingresso, confirmado-evento-jun-26

Execução: python3 Guzela/sync-evento-contacts.py
"""

import csv
import json
import re
import time
import urllib.request
import urllib.parse
import sys
import os

# ─── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────

SUPABASE_URL    = "https://qzesffnkqgelmtfblzkr.supabase.co"
SRK = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SRK:
    raise RuntimeError(
        "Configure a variável de ambiente SUPABASE_SERVICE_ROLE_KEY antes de executar este script."
    )
GHL_BASE        = "https://services.leadconnectorhq.com"
GHL_LOCATION_ID = "U8FTcw90CB5QELUnbGUu"
CALLER          = "sync-evento-jun26"
TAGS_EVENTO     = ["ganhou-ingresso", "confirmado-evento-jun-26"]

# Caminho relativo ao diretório do script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH   = os.path.join(SCRIPT_DIR, "form-evento.csv")

# ─── HELPERS HTTP ─────────────────────────────────────────────────────────────

def sb_request(method, path, body=None, params=None):
    url = SUPABASE_URL + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "apikey": SRK,
            "Authorization": f"Bearer {SRK}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else []
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} {path}: {body_text}")


def enqueue_job(url, method, body, idem_key, context=None):
    return sb_request("POST", "/rest/v1/rpc/enqueue_ghl_api_job", {
        "p_url":              url,
        "p_method":           method,
        "p_body":             body,
        "p_priority":         1,
        "p_caller":           CALLER,
        "p_idempotency_key":  idem_key,
        "p_context":          context or {},
        "p_max_attempts":     3,
    })


def wait_for_jobs(idem_keys, label, timeout_s=300):
    if not idem_keys:
        return {}
    print(f"\n⏳  Aguardando {label} ({len(idem_keys)} jobs)...")
    deadline = time.time() + timeout_s
    result = {}
    while time.time() < deadline:
        for ikey in idem_keys:
            if ikey in result and result[ikey].get("status") in ("done", "dead"):
                continue
            try:
                rows = sb_request(
                    "GET",
                    f"/rest/v1/ghl_api_jobs"
                    f"?idempotency_key=eq.{urllib.parse.quote(ikey)}"
                    f"&select=id,idempotency_key,status,result,error&limit=1",
                )
                if rows:
                    result[ikey] = rows[0]
            except Exception:
                pass  # ignora timeout pontual, tenta no próximo ciclo
        finished = [k for k, v in result.items() if v.get("status") in ("done", "dead")]
        print(f"    {len(finished)}/{len(idem_keys)} concluídos...", end="\r")
        if len(finished) == len(idem_keys):
            print(f"\n✅  {label} concluídos!")
            return result
        time.sleep(10)
    print(f"\n⚠️  Timeout aguardando {label}")
    return result


# ─── NORMALIZAÇÃO DE TELEFONE ─────────────────────────────────────────────────

def normalize_phone(raw: str) -> str:
    """Converte qualquer formato BR para +55XXXXXXXXXXX."""
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return ""
    if digits.startswith("55") and len(digits) > 11:
        return "+" + digits
    if len(digits) in (10, 11):
        return "+55" + digits
    if len(digits) > 11:
        # Pode ser código de país sem o 55 (improvável, mas seguro)
        return "+" + digits
    return "+55" + digits


# ─── PARSE DO CSV ──────────────────────────────────────────────────────────────

def parse_csv() -> list[dict]:
    contatos = []
    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            nome_completo = row.get("Nome Completo", "").strip()
            partes = nome_completo.split(" ", 1)
            first_name = partes[0] if partes else ""
            last_name  = partes[1] if len(partes) > 1 else ""

            email = row.get("Endereço de e-mail", "").strip().lower()
            raw_phone = row.get("Whatsapp (com DDD)", "").strip()
            phone = normalize_phone(raw_phone)

            # Campos extras → obs__evento
            cpf           = row.get("CPF", "").strip()
            emergencia    = row.get(
                "Contato de emergência - Pessoa próxima que podemos avisar se você precisar de assistência - Insira, por favor o nome e um telefone com whatsapp.",
                ""
            ).strip()
            hospedagem    = row.get("Precisará de hospedagem?", "").strip()
            programa      = row.get("Participa de algum de nossos programas?", "").strip()
            autorizou     = row.get(
                "Autorizo receber comunicações sobre o evento via e-mail ou WhatsApp e aceito ser incluído(a) no grupo oficial do evento.",
                ""
            ).strip()
            obs_extras    = row.get(
                "Observações extras - Algum detalhe que gostaria de acrescentar? (opcional)",
                ""
            ).strip()
            timestamp     = row.get("Carimbo de data/hora", "").strip()

            obs_lines = []
            if cpf:        obs_lines.append(f"CPF: {cpf}")
            if emergencia: obs_lines.append(f"Emergência: {emergencia}")
            if hospedagem: obs_lines.append(f"Hospedagem: {hospedagem}")
            if programa:   obs_lines.append(f"Programa: {programa}")
            if autorizou:  obs_lines.append(f"Autorizou: {autorizou}")
            if obs_extras: obs_lines.append(f"Obs: {obs_extras}")
            if timestamp:  obs_lines.append(f"Inscrito em: {timestamp}")
            obs_evento = "\n".join(obs_lines)

            contatos.append({
                "nome":        nome_completo,
                "first_name":  first_name,
                "last_name":   last_name,
                "email":       email,
                "phone":       phone,
                "phone_raw":   raw_phone,
                "obs_evento":  obs_evento,
            })
    return contatos


# ─── BUSCA NO SUPABASE ────────────────────────────────────────────────────────

def buscar_no_supabase(email: str, phone: str):
    """Retorna { ghl_id, tags } se encontrar, ou None."""
    # Tenta por e-mail primeiro
    if email:
        rows = sb_request(
            "GET",
            f"/rest/v1/contatos"
            f"?email=ilike.{urllib.parse.quote(email)}"
            f"&select=ghl_id,tags,email,telefone"
            f"&limit=1",
        )
        if rows:
            return rows[0]

    # Fallback por telefone (apenas dígitos, sem +55)
    if phone:
        digits = re.sub(r"\D", "", phone)
        # Tenta com e sem código de país
        sufixo = digits[-11:] if len(digits) >= 11 else digits
        rows = sb_request(
            "GET",
            f"/rest/v1/contatos"
            f"?telefone=ilike.%25{urllib.parse.quote(sufixo)}"
            f"&select=ghl_id,tags,email,telefone"
            f"&limit=1",
        )
        if rows:
            return rows[0]

    return None


# ─── LÓGICA PRINCIPAL ──────────────────────────────────────────────────────────

def tags_tem_evento(tags_str):
    """Verifica se ambas as tags de evento estão presentes."""
    if not tags_str:
        return False
    tags = [t.strip().lower() for t in tags_str.split(",")]
    return all(t.lower() in tags for t in TAGS_EVENTO)


def merged_tags(tags_str):
    """Retorna lista de tags com as duas de evento adicionadas (sem duplicatas)."""
    existing = []
    if tags_str:
        existing = [t.strip() for t in tags_str.split(",") if t.strip()]
    existing_lower = {t.lower() for t in existing}
    for tag in TAGS_EVENTO:
        if tag.lower() not in existing_lower:
            existing.append(tag)
    return existing


def idem_key(action: str, email: str) -> str:
    safe = re.sub(r"[^a-z0-9]", "-", email.lower())
    return f"{CALLER}-{action}-{safe}"


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════════════════╗")
    print("║  SYNC EVENTO JUN/26 — form-evento.csv → GHL              ║")
    print("║  Tags: ganhou-ingresso + confirmado-evento-jun-26         ║")
    print("╚══════════════════════════════════════════════════════════╝")

    # ── FASE 1: Parse CSV ────────────────────────────────────────────
    print("\n─── FASE 1: Lendo CSV ───────────────────────────────────────")
    contatos = parse_csv()
    print(f"  {len(contatos)} contatos carregados.")

    # ── FASE 2: Busca no Supabase + classificação ────────────────────
    print("\n─── FASE 2: Buscando no Supabase ────────────────────────────")

    to_skip   = []  # (contato, sb_row)
    to_update = []  # (contato, sb_row)
    to_create = []  # (contato,)

    for c in contatos:
        sb = buscar_no_supabase(c["email"], c["phone"])
        if sb:
            ghl_id = sb.get("ghl_id") or ""
            tags_str = sb.get("tags") or ""
            if not ghl_id:
                # Existe no Supabase mas sem ghl_id — tratar como create
                print(f"  ⚠️  {c['nome']}: encontrado no Supabase SEM ghl_id → CREATE")
                to_create.append(c)
            elif tags_tem_evento(tags_str):
                print(f"  ⏩ {c['nome']}: já tem as tags → SKIP")
                to_skip.append((c, sb))
            else:
                print(f"  ✏️  {c['nome']}: encontrado (ghl_id={ghl_id[:12]}...) → UPDATE")
                c["_ghl_id"] = ghl_id
                c["_tags_atuais"] = tags_str
                to_update.append((c, sb))
        else:
            print(f"  🆕 {c['nome']}: não encontrado → CREATE")
            to_create.append(c)

    print(f"\n  Resumo: {len(to_skip)} skip | {len(to_update)} update | {len(to_create)} create")

    # ── FASE 3: Enfileirar UPDATEs ───────────────────────────────────
    update_keys = []
    if to_update:
        print(f"\n─── FASE 3a: Enfileirando {len(to_update)} UPDATEs ──────────────")
        for c, _sb in to_update:
            ghl_id   = c["_ghl_id"]
            new_tags = merged_tags(c["_tags_atuais"])
            body = {
                "tags": new_tags,
                "customFields": [
                    {"key": "obs__evento", "value": c["obs_evento"]}
                ],
            }
            ikey = idem_key("update", c["email"])
            ok = enqueue_job(
                url=f"{GHL_BASE}/contacts/{ghl_id}",
                method="PUT",
                body=body,
                idem_key=ikey,
                context={"nome": c["nome"], "email": c["email"]},
            )
            status = "enfileirado ✓" if ok else "já existia"
            print(f"  ✏️  {c['nome']} → {status}")
            update_keys.append(ikey)

    # ── FASE 4: Enfileirar CREATEs ───────────────────────────────────
    create_keys = []
    if to_create:
        print(f"\n─── FASE 3b: Enfileirando {len(to_create)} CREATEs ──────────────")
        for c in to_create:
            body = {
                "firstName":  c["first_name"],
                "lastName":   c["last_name"],
                "email":      c["email"],
                "phone":      c["phone"],
                "locationId": GHL_LOCATION_ID,
                "tags":       list(TAGS_EVENTO),
                "customFields": [
                    {"key": "obs__evento", "value": c["obs_evento"]}
                ],
            }
            ikey = idem_key("create", c["email"])
            ok = enqueue_job(
                url=f"{GHL_BASE}/contacts/",
                method="POST",
                body=body,
                idem_key=ikey,
                context={"nome": c["nome"], "email": c["email"]},
            )
            status = "enfileirado ✓" if ok else "já existia"
            print(f"  🆕 {c['nome']} ({c['phone']}) → {status}")
            create_keys.append(ikey)

    # ── FASE 5: Aguardar jobs ────────────────────────────────────────
    all_keys = update_keys + create_keys
    if not all_keys:
        print("\n✅  Nada a processar — todos os contatos já estavam com as tags.")
        return

    done_map = wait_for_jobs(all_keys, "todos os jobs do evento")

    # ── FASE 6: Relatório final ───────────────────────────────────────
    print("\n─── RELATÓRIO FINAL ─────────────────────────────────────────")
    print(f"{'Nome':<35} {'Ação':<8} {'Status':<8} {'Detalhe'}")
    print("─" * 80)

    # SKIPs
    for c, _ in to_skip:
        print(f"  {'⏩'} {c['nome']:<33} {'skip':<8} {'—':<8}")

    # UPDATEs
    for c, _ in to_update:
        ikey = idem_key("update", c["email"])
        job  = done_map.get(ikey, {})
        st   = job.get("status", "?")
        err  = job.get("error") or ""
        icon = "✅" if st == "done" else "❌"
        detalhe = err[:40] if err else ""
        print(f"  {icon} {c['nome']:<33} {'update':<8} {st:<8} {detalhe}")

    # CREATEs
    for c in to_create:
        ikey = idem_key("create", c["email"])
        job  = done_map.get(ikey, {})
        st   = job.get("status", "?")
        err  = job.get("error") or ""
        icon = "✅" if st == "done" else "❌"
        detalhe = err[:40] if err else ""
        print(f"  {icon} {c['nome']:<33} {'create':<8} {st:<8} {detalhe}")

    total_ok  = sum(1 for v in done_map.values() if v.get("status") == "done")
    total_err = sum(1 for v in done_map.values() if v.get("status") == "dead")

    print("─" * 80)
    print(f"\n  ✅ OK: {total_ok}  |  ❌ Erro: {total_err}  |  ⏩ Skip: {len(to_skip)}")
    print("\n  ⚡ Tags e campo obs__evento serão sincronizados no Supabase")
    print("     após o próximo webhook do GHL (~5min).")
    print("\n╔══════════════════════════════════════════════════════════╗")
    print("║  CONCLUÍDO ✅                                             ║")
    print("╚══════════════════════════════════════════════════════════╝")


if __name__ == "__main__":
    main()
