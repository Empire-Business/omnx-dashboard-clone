#!/usr/bin/env python3
"""
Script: import_leads.py
Importa 14 leads form-fb (20-24/04/2026) que chegaram no GHL mas faltava integração.

Situação encontrada:
- Todos os 14 CONTATOS já existem no GHL e no Supabase (sinc funcionou)
- 12 leads já têm OPP no Pré-Vendas MQL criadas às 20:28 de hoje (via automação GHL)
- 2 leads (Leonardo #7 e Alexandre #11) têm apenas opps antigas (2025) — precisam de OPP nova
- Nenhum tem sdr_name, data correta ou utm_campaign preenchidos

Ações:
  A) Criar opp nova para leads 7 e 11
  B) Adicionar SDR como follower nas 14 opps
  C) Atualizar owner do contato para o SDR designado
  D) Forçar data_lead_recebido correta em oportunidades
  E) Forçar utm_campaign=32 e utm_source=iads-28 em contatos

Execução: python3 Guzela/import_leads.py
"""

import json
import os
import time
import urllib.request
import urllib.parse
import sys

# ─── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────

SUPABASE_URL = "https://qzesffnkqgelmtfblzkr.supabase.co"
SRK = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
if not SRK:
    raise RuntimeError(
        "Configure a variável de ambiente SUPABASE_SERVICE_ROLE_KEY antes de executar este script."
    )
GHL_BASE        = "https://services.leadconnectorhq.com"
GHL_LOCATION_ID = "U8FTcw90CB5QELUnbGUu"
PIPELINE_ID     = "QQXqQvYEkwafSCAB1ybC"
STAGE_ID        = "f87d4253-f260-4b21-a5a9-70c023fe9f03"   # Leads Recebidos
FERNANDA_ID     = "UCIxJ2kOp9SJKc00RviU"
LUCAS_ID        = "fmNfovWHhnE4I9VttMkw"
UTM_SOURCE      = "iads-28"
UTM_CAMPAIGN    = "32"
CALLER          = "import-fb-leads-2026-04"

# ─── LEADS ────────────────────────────────────────────────────────────────────
# Timestamps convertidos de UTC-5 para BRT (UTC-3): UTC = local+5h, BRT = UTC-3h = local+2h
# Linha 1 do CSV é cabeçalho, linha 2 é test lead → omitido

LEADS = [
    {
        "idx": 1,
        "first": "Felipe",
        "last": "Leckar",
        "email": "felipe.leckar1@gmail.com",
        "phone": "+5521975234197",
        "instagram": "Felipe.leckar",
        "cargo": "empresa_de_serviços",
        "faturamento": "de_700_a_1mm_de_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-20T19:28:12-03:00",
    },
    {
        "idx": 2,
        "first": "Paulo Henrique",
        "last": "Joanello",
        "email": "paulojoanello@gmail.com",
        "phone": "+5541999949664",
        "instagram": "@paulojoanello",
        "cargo": "empresa_de_serviços",
        "faturamento": "de_700_a_1mm_de_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-20T20:52:16-03:00",
    },
    {
        "idx": 3,
        "first": "João Diniz",
        "last": "AVC",
        "email": "jd.joaodiniz73@gmail.com",
        "phone": "+5521999201322",
        "instagram": "@joaodinizrj",
        "cargo": "profissional_liberal",
        "faturamento": "de_700_a_1mm_de_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-21T12:42:16-03:00",
    },
    {
        "idx": 4,
        "first": "JP",
        "last": "Especialista em Imóveis",
        "email": "joao.paulo@mentoriahorus.com",
        "phone": "+5579998359899",
        "instagram": "@joao.paullo.pimentell",
        "cargo": "profissional_liberal",
        "faturamento": "de_400_a_700_mil_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-21T12:47:53-03:00",
    },
    {
        "idx": 5,
        "first": "Izadora",
        "last": "Piccoli",
        "email": "izadorapiccoli@icloud.com",
        "phone": "+5547992577733",
        "instagram": "@izadorahultmann.imoveis",
        "cargo": "empresa_de_serviços",
        "faturamento": "de_400_a_700_mil_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-21T15:13:22-03:00",
    },
    {
        "idx": 6,
        "first": "Pablo",
        "last": "Wisnheski",
        "email": "pablo_w0626@hotmail.com",
        "phone": "+5515996477110",
        "instagram": "Pablo.wisk",
        "cargo": "empresa_de_serviços",
        "faturamento": "de_400_a_700_mil_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-21T21:06:54-03:00",
    },
    {
        "idx": 7,
        "first": "Leonardo",
        "last": "Silva",
        "email": "brunoleorj2004@hotmail.com",
        "phone": "+5522999520012",
        "instagram": "@leonardosilvacorretor1",
        "cargo": "profissional_liberal",
        "faturamento": "acima_de_5mm_de_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-22T02:20:24-03:00",
    },
    {
        "idx": 8,
        "first": "Anderson",
        "last": "Vessel",
        "email": "anderson@grupovessel.com",
        "phone": "+5541998258274",
        "instagram": "@vesselexperience",
        "cargo": "empresa_de_serviços",
        "faturamento": "de_400_a_700_mil_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-22T14:12:50-03:00",
    },
    {
        "idx": 9,
        "first": "Jeanne",
        "last": "Rebouças",
        "email": "jeannebocucci@gmail.com",
        "phone": "+5512988493392",
        "instagram": "Jeanne reboucas",
        "cargo": "profissional_liberal",
        "faturamento": "acima_de_5mm_de_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-22T18:24:43-03:00",
    },
    {
        "idx": 10,
        "first": "Vinicius Seiti",
        "last": "Ferreira",
        "email": "vinicius.seiti@gmail.com",
        "phone": "+5515996771986",
        "instagram": "@hubtnt",
        "cargo": "agência_lançador_ou_profissional_de_marketing",
        "faturamento": "acima_de_5mm_de_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-22T19:00:26-03:00",
    },
    {
        "idx": 11,
        "first": "Alexandre",
        "last": "Boechat",
        "email": "dralexandreboechat@gmail.com",
        "phone": "+5566999080032",
        "instagram": "alexandreboechatt",
        "cargo": "profissional_liberal",
        "faturamento": "de_400_a_700_mil_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-23T17:44:20-03:00",
    },
    {
        "idx": 12,
        "first": "Hugo Felipe",
        "last": "Neurociência Clínica",
        "email": "agradecequetudoacontece@gmail.com",
        "phone": "+5511964173672",
        "instagram": "@hugofelipeoficial",
        "cargo": "infoprodutor_ou_mentor",
        "faturamento": "de_400_a_700_mil_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-23T21:50:57-03:00",
    },
    {
        "idx": 13,
        "first": "Pedro Henrique",
        "last": "Mathiel",
        "email": "pmathiel@gmail.com",
        "phone": "+5517996160282",
        "instagram": "drpedromathiel",
        "cargo": "profissional_liberal",
        "faturamento": "de_1mm_a_5mm_de_reais",
        "sdr_id": FERNANDA_ID,
        "sdr_name": "Fernanda Torres",
        "data_brt": "2026-04-24T00:15:05-03:00",
    },
    {
        "idx": 14,
        "first": "Tiago",
        "last": "Lima",
        "email": "tiagonlima@hotmail.com",
        "phone": "+5511982848262",
        "instagram": "@marilia.rhormens",
        "cargo": "empresa_de_serviços",
        "faturamento": "de_1mm_a_5mm_de_reais",
        "sdr_id": LUCAS_ID,
        "sdr_name": "Lucas Leonardo",
        "data_brt": "2026-04-24T09:00:56-03:00",
    },
]

# ─── HTTP HELPERS ─────────────────────────────────────────────────────────────

def sb_request(method, path, body=None):
    url = SUPABASE_URL + path
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
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        raise RuntimeError(f"HTTP {e.code} {path}: {body_text}")


def enqueue_job(url, method, body, idem_key, context=None):
    return sb_request("POST", "/rest/v1/rpc/enqueue_ghl_api_job", {
        "p_url": url,
        "p_method": method,
        "p_body": body,
        "p_priority": 1,
        "p_caller": CALLER,
        "p_idempotency_key": idem_key,
        "p_context": context or {},
        "p_max_attempts": 3,
    })


def get_jobs_done(idem_keys):
    """Retorna map idem_key -> job para jobs com status done/dead."""
    result = {}
    for ikey in idem_keys:
        rows = sb_request(
            "GET",
            f"/rest/v1/ghl_api_jobs?idempotency_key=eq.{urllib.parse.quote(ikey)}"
            f"&select=id,idempotency_key,status,result,error&limit=1",
        )
        if rows:
            result[ikey] = rows[0]
    return result


def wait_for_jobs(idem_keys, label, timeout_s=120):
    """Aguarda até todos os jobs terem status done ou dead."""
    print(f"\n⏳  Aguardando {label} ({len(idem_keys)} jobs)...")
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        done_map = get_jobs_done(idem_keys)
        finished = [k for k, v in done_map.items() if v.get("status") in ("done", "dead")]
        print(f"    {len(finished)}/{len(idem_keys)} concluídos...", end="\r")
        if len(finished) == len(idem_keys):
            print(f"\n✅  {label} concluídos!")
            return done_map
        time.sleep(8)
    raise TimeoutError(f"Timeout aguardando {label}")


# ─── MAPA CONHECIDO (dos erros de duplicata GHL + consulta Supabase) ──────────
#
# Contatos já existem no GHL. IDs obtidos das mensagens 400 da tentativa anterior.
# Oportunidades: 12 de 14 já existem no Pré-Vendas MQL (criadas às 20:28 hoje).
# Leads 7 (Leonardo) e 11 (Alexandre) precisam de opp NOVA.

GHL_CONTACT_IDS = {
    1:  "VODskmOKTg5ka7dTF2J6",   # Felipe Leckar
    2:  "TuboEzG3KgxJwbd2zTPL",   # Paulo Henrique Joanello
    3:  "C10y4Hn4dkKh9iTldCF8",   # João Diniz | AVC
    4:  "aGDIaWTKTlZUueoNmiUi",   # JP | Especialista em Imóveis
    5:  "DFxCrBu9Ac5pEwXXvVJF",   # Izadora
    6:  "uuqay251Q0RacwuXsqIi",   # Pablo Wisnheski
    7:  "gwkmgNz7jQ5PEcSfofKn",   # Leonàrdo Silva  ← precisa OPP nova
    8:  "zH3m7yJSWlvsfFJ9VoqR",   # Anderson
    9:  "PcYSFQh0E66GdVSnga37",   # Jeanne Rebouças
    10: "htwH7yQS5xtG4FE7vva2",   # Vinicius Seiti Ferreira
    11: "ysj196cCSCZdWrGu3I8x",   # Dr. Alexandre Boechat  ← precisa OPP nova
    12: "HtBE4O6VHZgqsQgPYK8H",   # Hugo Felipe
    13: "ShI2U7yEWjIW2I4G4s98",   # Pedro Henrique Mathiel
    14: "DDGXK27PsRMajEC2Zh1q",   # Tiago Lima
}

# Opps já existentes no Supabase (Pré-Vendas MQL, criadas hoje 20:28)
EXISTING_OPP_IDS = {
    1:  "CCHg3X23VGcOqqDQzJSB",   # Felipe
    2:  "Juwg11BbyKvWVr9ht922",   # Paulo
    3:  "p0UbIWjQ4p4hammMKi1B",   # João Diniz
    4:  "9hgqZXEbPLhPOv6ycokE",   # JP
    5:  "BVuXZaaXxLjcZFUJSaT9",   # Izadora
    6:  "YHuB0ajf3pvR2T52Hzc9",   # Pablo
    # 7: Leonardo → criar nova opp
    8:  "h6g4EoX2ON3q1kQTeuN9",   # Anderson
    9:  "I4xT4xwc3j0tCdVGzK09",   # Jeanne
    10: "0WhhjEBIazfWEDVK8Lpv",   # Vinicius
    # 11: Alexandre → criar nova opp
    12: "nc0rVPLAGONhz09qilIN",   # Hugo Felipe
    13: "RwP3RitNBHImfI20QEzq",   # Pedro Henrique
    14: "0bH0YklbhD7KOg7h0DYB",   # Tiago Lima
}

NEEDS_NEW_OPP = [7, 11]   # Leonardo e Alexandre

# ─── FASE A: CRIAR OPPS NOVAS (só leads 7 e 11) ────────────────────────────

def phaseA_create_missing_opps():
    print("\n═══════════════════════════════════════════")
    print("FASE A — Criando opps novas (Leonardo #7 e Alexandre #11)")
    print("═══════════════════════════════════════════")

    lead_map = {l["idx"]: l for l in LEADS}
    idem_keys = []

    for lead_idx in NEEDS_NEW_OPP:
        lead = lead_map[lead_idx]
        ghl_contact_id = GHL_CONTACT_IDS[lead_idx]
        ikey = f"{CALLER}-opp-v2-{lead_idx}"
        body = {
            "pipelineId": PIPELINE_ID,
            "pipelineStageId": STAGE_ID,
            "locationId": GHL_LOCATION_ID,
            "contactId": ghl_contact_id,
            "name": f"{lead['first']} {lead['last']}",
            "status": "open",
            "assignedTo": lead["sdr_id"],
        }
        ok = enqueue_job(
            url=f"{GHL_BASE}/opportunities/",
            method="POST",
            body=body,
            idem_key=ikey,
            context={"lead_idx": lead_idx, "ghl_contact_id": ghl_contact_id},
        )
        print(f"  [{lead_idx:02d}] {lead['first']} {lead['last']} (contato {ghl_contact_id}) → {'enfileirado ✓' if ok else 'já existia'}")
        idem_keys.append(ikey)

    done = wait_for_jobs(idem_keys, "criação de opps novas")

    new_opps = {}
    errors = []
    for lead_idx in NEEDS_NEW_OPP:
        ikey = f"{CALLER}-opp-v2-{lead_idx}"
        job = done.get(ikey, {})
        if job.get("status") == "dead":
            errors.append(f"Lead {lead_idx}: {job.get('error')}")
            continue
        result = job.get("result") or {}
        ghl_opp_id = (result.get("opportunity") or result.get("opportunities") or {}).get("id")
        if not ghl_opp_id:
            ghl_opp_id = result.get("id")
        if ghl_opp_id:
            new_opps[lead_idx] = ghl_opp_id
            print(f"  [{lead_idx:02d}] → nova opp GHL: {ghl_opp_id} ✓")
        else:
            errors.append(f"Lead {lead_idx}: id não encontrado: {json.dumps(result)[:300]}")

    if errors:
        print("\n⚠️  ERROS:")
        for e in errors:
            print(f"  • {e}")

    return new_opps


# ─── FASE B: UPDATE OWNER E TAGS DO CONTATO ───────────────────────────────────

def phaseB_update_contacts():
    print("\n═══════════════════════════════════════════")
    print("FASE B — Atualizando owner e tags dos 14 contatos")
    print("═══════════════════════════════════════════")

    lead_map = {l["idx"]: l for l in LEADS}
    idem_keys = []

    for lead_idx, ghl_contact_id in GHL_CONTACT_IDS.items():
        lead = lead_map[lead_idx]
        ikey = f"{CALLER}-update-contact-{lead_idx}"
        body = {
            "assignedTo": lead["sdr_id"],
            "tags": ["MQL", "[cp] form-fb"],
        }
        ok = enqueue_job(
            url=f"{GHL_BASE}/contacts/{ghl_contact_id}",
            method="PUT",
            body=body,
            idem_key=ikey,
            context={"lead_idx": lead_idx},
        )
        print(f"  [{lead_idx:02d}] {lead['first']} → assignedTo={lead['sdr_name']} {'enfileirado ✓' if ok else 'já existia'}")
        idem_keys.append(ikey)

    wait_for_jobs(idem_keys, "update de contatos")


# ─── FASE C: ADICIONAR FOLLOWER NAS 14 OPPS ──────────────────────────────────

def phaseC_add_followers(full_opp_map):
    print("\n═══════════════════════════════════════════")
    print("FASE C — Adicionando SDR como follower nas 14 opps")
    print("═══════════════════════════════════════════")

    lead_map = {l["idx"]: l for l in LEADS}
    idem_keys = []

    for lead_idx, ghl_opp_id in full_opp_map.items():
        lead = lead_map[lead_idx]
        ikey = f"{CALLER}-follower-v2-{lead_idx}"
        body = {"followers": [lead["sdr_id"]]}
        ok = enqueue_job(
            url=f"{GHL_BASE}/opportunities/{ghl_opp_id}/followers",
            method="POST",
            body=body,
            idem_key=ikey,
            context={"lead_idx": lead_idx, "ghl_opp_id": ghl_opp_id},
        )
        print(f"  [{lead_idx:02d}] opp {ghl_opp_id[:12]}... → follower {lead['sdr_name']} {'enfileirado ✓' if ok else 'já existia'}")
        idem_keys.append(ikey)

    wait_for_jobs(idem_keys, "adição de followers")


# ─── FASE D: FORÇAR DATAS E UTMs NO SUPABASE ─────────────────────────────────

def phaseD_fix_supabase(full_opp_map):
    print("\n═══════════════════════════════════════════")
    print("FASE D — Forçando datas e UTMs no Supabase")
    print("═══════════════════════════════════════════")

    # Aguarda jobs da Fase C processarem (webhooks já devem ter chegado para A)
    print("    (aguardando 20s para novos webhooks processarem...)")
    time.sleep(20)

    lead_map = {l["idx"]: l for l in LEADS}
    date_ok = 0
    utm_ok = 0
    errors = []

    for lead_idx, ghl_opp_id in full_opp_map.items():
        lead = lead_map[lead_idx]
        # 1. Forçar data_lead_recebido na oportunidade
        try:
            sb_request(
                "PATCH",
                f"/rest/v1/oportunidades?ghl_opportunity_id=eq.{ghl_opp_id}",
                {"data_lead_recebido": lead["data_brt"]},
            )
            date_ok += 1
            print(f"  [{lead_idx:02d}] opp {ghl_opp_id[:12]}... → data = {lead['data_brt'][:10]} ✓")
        except Exception as e:
            errors.append(f"Lead {lead_idx} data: {e}")

    print()
    # 2. Atualizar utm_campaign e utm_source nos contatos
    for lead_idx, ghl_contact_id in GHL_CONTACT_IDS.items():
        try:
            sb_request(
                "PATCH",
                f"/rest/v1/contatos?ghl_id=eq.{ghl_contact_id}",
                {"utm_campaign": UTM_CAMPAIGN, "utm_source": UTM_SOURCE},
            )
            utm_ok += 1
            print(f"  [{lead_idx:02d}] contato {ghl_contact_id[:12]}... → utm_campaign=32, utm_source=iads-28 ✓")
        except Exception as e:
            errors.append(f"Lead {lead_idx} utm: {e}")

    print(f"\n  Datas atualizadas: {date_ok}/{len(full_opp_map)}")
    print(f"  UTMs atualizados:  {utm_ok}/{len(GHL_CONTACT_IDS)}")

    if errors:
        print("\n⚠️  ERROS:")
        for e in errors:
            print(f"  • {e}")


# ─── FASE E: VERIFICAÇÃO FINAL ────────────────────────────────────────────────

def phaseE_verify(full_opp_map):
    print("\n═══════════════════════════════════════════")
    print("FASE E — Verificação final")
    print("═══════════════════════════════════════════")

    ghl_ids = list(full_opp_map.values())
    ids_param = "(" + ",".join(ghl_ids) + ")"
    rows = sb_request(
        "GET",
        f"/rest/v1/oportunidades"
        f"?ghl_opportunity_id=in.{ids_param}"
        f"&select=ghl_opportunity_id,pipeline_id,pipeline_name,data_lead_recebido,sdr_name"
        f"&limit=20",
    )

    lead_map = {l["idx"]: l for l in LEADS}
    opp_to_idx = {v: k for k, v in full_opp_map.items()}

    print(f"  Encontradas no Supabase: {len(rows)}/{len(ghl_ids)}")

    all_ok = True
    for r in rows:
        opp_id = r["ghl_opportunity_id"]
        lead_idx = opp_to_idx.get(opp_id, "?")
        lead = lead_map.get(lead_idx, {})
        data = r.get("data_lead_recebido") or ""
        pipeline_ok = r.get("pipeline_id") == PIPELINE_ID
        date_ok = "2026-04-2" in data
        sdr_ok = bool(r.get("sdr_name"))
        ok = pipeline_ok and date_ok
        if not ok:
            all_ok = False
        print(
            f"  {'✅' if ok else '⚠️ '} [{lead_idx:02}] {opp_id[:12]}... "
            f"| pipe={'✓' if pipeline_ok else '✗'} "
            f"| data={data[:10] if data else 'NULL'} "
            f"| sdr={r.get('sdr_name') or '(pendente sync)'}"
        )

    if all_ok:
        print("\n✅ Tudo certo! sdr_name será preenchido pelo sync-opp-sdr em ~10min.")
    else:
        print("\n⚠️  Algumas opps precisam de atenção. Rode novamente com --fix-dates-only")


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("╔══════════════════════════════════════════════╗")
    print("║  IMPORT LEADS FORM-FB — 20 a 24/04/2026      ║")
    print("║  Situação: contatos e 12 opps já existem     ║")
    print("║  Ações: 2 opps novas + owners + datas + UTMs ║")
    print("╚══════════════════════════════════════════════╝")

    # A) Criar as 2 opps faltantes (leads 7 e 11)
    new_opps = phaseA_create_missing_opps()

    # Montar mapa completo de opps (existentes + novas)
    full_opp_map = dict(EXISTING_OPP_IDS)
    full_opp_map.update(new_opps)
    print(f"\n  Total de opps mapeadas: {len(full_opp_map)}/14")

    # B) Atualizar owner e garantir tags nos contatos
    phaseB_update_contacts()

    # C) Adicionar SDR como follower
    phaseC_add_followers(full_opp_map)

    # D) Forçar datas e UTMs no Supabase
    phaseD_fix_supabase(full_opp_map)

    # E) Verificação
    phaseE_verify(full_opp_map)

    print("\n╔══════════════════════════════════════════════╗")
    print("║  CONCLUÍDO ✅                                 ║")
    print("╚══════════════════════════════════════════════╝")
    print("  sdr_name: sync-opp-sdr roda a cada hora (offset :06)")
    print("  Para forçar já: invocar sync-opp-sdr manualmente")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--fix-dates-only":
        print("\n🔁 Modo fix-dates-only — reutilizando mapa de opps conhecido...")
        full_opp_map = dict(EXISTING_OPP_IDS)
        # Tenta buscar também as novas (leads 7 e 11) se já existirem
        for lead_idx in NEEDS_NEW_OPP:
            ikey = f"{CALLER}-opp-v2-{lead_idx}"
            jobs = sb_request(
                "GET",
                f"/rest/v1/ghl_api_jobs?idempotency_key=eq.{urllib.parse.quote(ikey)}&select=status,result&limit=1",
            )
            if jobs and jobs[0].get("status") == "done":
                result = jobs[0].get("result") or {}
                ghl_opp_id = (result.get("opportunity") or {}).get("id") or result.get("id")
                if ghl_opp_id:
                    full_opp_map[lead_idx] = ghl_opp_id
        phaseD_fix_supabase(full_opp_map)
        phaseE_verify(full_opp_map)
    else:
        main()
