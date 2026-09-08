#!/usr/bin/env python3
"""
Orquestrador de Backfill — comunicacoes (campos GHL completos)

Chama a edge function sync-ghl-conversations em modo backfill_by_contact
em lotes sequenciais até processar todos os contatos.

Uso:
  python3 scripts/backfill-comunicacoes.py             # começa do zero
  python3 scripts/backfill-comunicacoes.py --offset 500  # retoma a partir do offset 500

Progresso é salvo em: scripts/backfill-progress.json
Log detalhado em:     scripts/backfill-comunicacoes.log
"""

import argparse
import json
import os
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path

# ============================================================
# CONFIGURAÇÃO
# ============================================================

EDGE_FUNCTION_URL = (
    "https://qzesffnkqgelmtfblzkr.supabase.co"
    "/functions/v1/sync-ghl-conversations"
)

ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
if not ANON_KEY:
    raise RuntimeError(
        "Configure a variável de ambiente SUPABASE_ANON_KEY antes de executar este script."
    )

BATCH_SIZE   = 25     # contatos por chamada (safe dentro do timeout da edge fn)
MAX_RETRIES  = 4      # tentativas por lote em caso de erro
RETRY_DELAY  = 30     # segundos entre tentativas

PROGRESS_FILE = Path(__file__).parent / "backfill-progress.json"
LOG_FILE      = Path(__file__).parent / "backfill-comunicacoes.log"

# ============================================================
# HELPERS
# ============================================================

def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"offset": 0, "total_upserted": 0, "batches_done": 0}


def save_progress(p: dict):
    PROGRESS_FILE.write_text(json.dumps(p, indent=2))


def call_backfill(offset: int) -> dict:
    payload = json.dumps({
        "mode":       "backfill_by_contact",
        "offset":     offset,
        "batch_size": BATCH_SIZE,
    }).encode()

    req = urllib.request.Request(
        EDGE_FUNCTION_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {ANON_KEY}",
            "Content-Type":  "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def eta_str(batches_remaining: int, secs_per_batch: float) -> str:
    total_secs = batches_remaining * secs_per_batch
    eta = datetime.now() + timedelta(seconds=total_secs)
    return eta.strftime("%H:%M") + f" (~{int(total_secs/60)}min)"


# ============================================================
# MAIN
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=int, default=None,
                        help="Iniciar a partir deste offset (sobrepõe progresso salvo)")
    args = parser.parse_args()

    progress = load_progress()
    if args.offset is not None:
        progress["offset"] = args.offset
        log(f"Offset sobreposto via argumento: {args.offset}")

    log("=" * 60)
    log("Backfill comunicacoes — início")
    log(f"  Lote: {BATCH_SIZE} contatos | Offset inicial: {progress['offset']}")
    log("=" * 60)

    batch_times = []  # para calcular média de tempo por lote

    while True:
        offset = progress["offset"]
        attempt = 0
        result  = None

        while attempt <= MAX_RETRIES:
            try:
                t0     = time.time()
                result = call_backfill(offset)
                elapsed = time.time() - t0
                batch_times.append(elapsed)
                if len(batch_times) > 20:
                    batch_times.pop(0)
                break
            except urllib.error.HTTPError as e:
                body = e.read().decode(errors="replace")
                log(f"  ERRO HTTP {e.code} (tentativa {attempt+1}/{MAX_RETRIES+1}): {body[:200]}")
            except Exception as e:
                log(f"  ERRO (tentativa {attempt+1}/{MAX_RETRIES+1}): {e}")

            attempt += 1
            if attempt <= MAX_RETRIES:
                log(f"  Aguardando {RETRY_DELAY}s antes de tentar novamente...")
                time.sleep(RETRY_DELAY)
            else:
                log("  Máximo de tentativas atingido. Abortando.")
                save_progress(progress)
                return

        upserted        = result.get("messages_upserted", 0)
        processed       = result.get("messages_processed", 0)
        contacts_done   = result.get("contacts_processed", 0)
        total_contacts  = result.get("total_contacts", 7675)
        has_more        = result.get("has_more", False)
        next_offset     = result.get("next_offset", offset + BATCH_SIZE)

        progress["total_upserted"] += upserted
        progress["batches_done"]   += 1
        progress["offset"]          = next_offset if has_more else offset

        save_progress(progress)

        # Log de progresso
        pct          = min(next_offset / total_contacts * 100, 100) if total_contacts else 0
        avg_t        = sum(batch_times) / len(batch_times)
        batches_left = max(0, (total_contacts - next_offset) // BATCH_SIZE)
        eta          = eta_str(batches_left, avg_t)

        log(
            f"Lote {progress['batches_done']:>4} | "
            f"offset {offset:>5}→{next_offset:<5} | "
            f"proc {processed:>4} msg | "
            f"upsert {upserted:>4} | "
            f"total upsert {progress['total_upserted']:>6} | "
            f"{pct:5.1f}% | "
            f"ETA {eta} | "
            f"{elapsed:.0f}s"
        )

        if not has_more:
            log("=" * 60)
            log(f"Backfill CONCLUÍDO!")
            log(f"  Total mensagens atualizadas: {progress['total_upserted']}")
            log(f"  Total lotes: {progress['batches_done']}")
            log("=" * 60)
            PROGRESS_FILE.unlink(missing_ok=True)
            break

        # Sem sleep extra — cada lote já demora ~30-50s pela edge fn


if __name__ == "__main__":
    main()
