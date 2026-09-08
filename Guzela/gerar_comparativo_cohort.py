"""
Gera comparativo-campanhas-cohort.csv usando a MESMA lógica do hook useTrafego.ts.

Lógica replicada:
1. Oportunidades: filtra por data_lead_recebido (TIMESTAMPTZ, offset SP -03:00),
   exclui pipeline de Recuperação, filtra apenas paid sources (utm_sources),
   depois filtra por utm_campaign (32 = Grupo A, 9+12 = Grupo B).

2. MQL: isMqlByTag — campo contatos.tags contém a tag "mql" (case-insensitive).

3. Agendamento: data_agendamento_reuniao IS NOT NULL
4. Reunião feita: data_realizacao_vendas IS NOT NULL
5. Venda fechada: oportunidade tem vendas_fechamento.data_pagamento_entrada NOT NULL
   (= buildPaymentDateMap — só conta quem pagou, não quem apenas fechou no CRM)

6. Faturamento: vendas_fechamento.valor_faturado (soma das opps com pagamento confirmado)
   - Revenue: fetch de vendas_fechamento com data_pagamento_entrada >= startISO (sem upper bound)
     depois filtra client-side pelos IDs das opps do cohort.

7. Investimento Meta: soma spend de meta_ads_insights
   - Filtro de data: por DATE (não por timestamp) — gte/lte na coluna `date`
   - Filtro de campanha: ad_name ILIKE '%PG32%' para Grupo A, '%PG9%' ou '%PG12%' para Grupo B

8. COHORT: o período define quais leads entram (data_lead_recebido).
   Todos os eventos desses leads são contados sem filtro de data posterior.
   Revenue conta da startISO em diante (sem upper bound).

PIPELINE DE RECUPERAÇÃO excluído: Sn1Guqcm6zwZNTVOOf5L
"""

import requests
import json
import csv
import os
from datetime import datetime, timezone, timedelta
from collections import defaultdict

# ─── Config ────────────────────────────────────────────────────
SUPA_URL = "https://qzesffnkqgelmtfblzkr.supabase.co"
SUPA_KEY = "REMOVED_SERVICE_ROLE_TOKEN_CONFIGURE_IN_SUPABASE_DASHBOARD"
PIPELINE_RECUPERACAO_ID = "Sn1Guqcm6zwZNTVOOf5L"

HEADERS = {
    "apikey": SUPA_KEY,
    "Authorization": f"Bearer {SUPA_KEY}",
    "Content-Type": "application/json",
}

# Grupos de campanhas (utm_campaign numérico como string, igual ao hook)
GRUPO_A_CAMPAIGNS = {"32"}        # [cp] form-fb — page_code: PG32
GRUPO_B_CAMPAIGNS = {"9", "12"}   # [cp] form reduzido (PG9) + [cp] aplicação (PG12)

# Page codes para filtrar Meta Ads por grupo
GRUPO_A_PAGE_CODES = ["PG32"]
GRUPO_B_PAGE_CODES = ["PG9", "PG12"]

# Meses do cohort: novembro/2025 até maio/2026
MONTHS = [
    ("2025-11", "nov/25"),
    ("2025-12", "dez/25"),
    ("2026-01", "jan/26"),
    ("2026-02", "fev/26"),
    ("2026-03", "mar/26"),
    ("2026-04", "abr/26"),
    ("2026-05", "mai/26"),
]


def to_sp_iso_start(date_str: str) -> str:
    """YYYY-MM-DD → '2026-01-01T00:00:00-03:00' (São Paulo início do dia)"""
    return f"{date_str}T00:00:00-03:00"


def to_sp_iso_end(date_str: str) -> str:
    """YYYY-MM-DD → '2026-01-31T23:59:59-03:00' (São Paulo fim do dia)"""
    return f"{date_str}T23:59:59-03:00"


def month_bounds(year_month: str):
    """Retorna (first_day, last_day) como 'YYYY-MM-DD' para o mês dado."""
    import calendar
    year, month = map(int, year_month.split("-"))
    last_day = calendar.monthrange(year, month)[1]
    return f"{year_month}-01", f"{year_month}-{last_day:02d}"


def rest_get(path: str, params: dict = None) -> list:
    """GET paginado via PostgREST. Retorna lista completa."""
    all_rows = []
    page = 0
    page_size = 1000
    while True:
        range_start = page * page_size
        range_end = (page + 1) * page_size - 1
        hdrs = {**HEADERS, "Range": f"{range_start}-{range_end}"}
        resp = requests.get(f"{SUPA_URL}/rest/v1/{path}", headers=hdrs, params=params)
        resp.raise_for_status()
        data = resp.json()
        all_rows.extend(data)
        if len(data) < page_size:
            break
        page += 1
        print(f"  ... paginando {path}: página {page}, total={len(all_rows)}", flush=True)
    return all_rows


def parse_tags(raw) -> list:
    """Replica parseTags() do hook TS."""
    if not raw:
        return []
    if isinstance(raw, list):
        return [str(t) for t in raw]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(t) for t in parsed]
        except (json.JSONDecodeError, ValueError):
            pass
        return [t.strip() for t in raw.split(",") if t.strip()]
    return []


def is_mql_by_tag(contato) -> bool:
    """Replica isMqlByTag() do hook TS."""
    if not contato or not contato.get("tags"):
        return False
    tags = parse_tags(contato["tags"])
    return any(t.lower() == "mql" for t in tags)


# ─── STEP 1: Carregar utm_sources (canais pagos) ────────────────
print("Carregando utm_sources (canais pagos)...")
utm_sources_rows = rest_get("utm_sources", {"select": "utm_source,public_code"})
PAGO_SOURCES = {r["utm_source"] for r in utm_sources_rows if r.get("utm_source")}
print(f"  Canais pagos: {len(PAGO_SOURCES)} sources — {sorted(PAGO_SOURCES)[:5]}...")


# ─── STEP 2: Carregar TODAS as oportunidades do período total ───
# Fetch de nov/2025 a mai/2026 de uma vez (mais eficiente)
print("\nCarregando oportunidades nov/2025–mai/2026...")
GLOBAL_START = to_sp_iso_start("2025-11-01")
GLOBAL_END = to_sp_iso_end("2026-05-31")

OPP_SELECT = (
    "id,contato_id,ghl_opportunity_id,pipeline_id,pipeline_name,"
    "data_lead_recebido,data_conectado,data_agendamento_reuniao,"
    "data_realizacao_vendas,data_fechado,data_perdido,data_perdido_vendas,"
    "contatos(utm_source,utm_campaign,tags)"
)

raw_opps = rest_get("oportunidades", {
    "select": OPP_SELECT,
    "data_lead_recebido": f"gte.{GLOBAL_START}",
    "pipeline_id": f"neq.{PIPELINE_RECUPERACAO_ID}",
    "order": "data_lead_recebido.asc,id.asc",
})
# Filtro de data_lead_recebido <= GLOBAL_END (PostgREST não aceita dois filtros no mesmo campo via params dict)
# Precisamos adicionar como parâmetro separado — usar Prefer: count=none e múltiplos params
# Reprocessar com query string correta:
print(f"  Carregadas {len(raw_opps)} opps (antes do filtro de data final)")

# Filtrar <= GLOBAL_END no client (já que o dict params não aceita dois filtros no mesmo campo)
# Na prática, como data_lead_recebido >= nov-01-2025 já é razoável, vamos fazer a query correta
print("  Re-carregando com filtro de data correto...")
all_opps_raw = []
page = 0
page_size = 1000
while True:
    range_start = page * page_size
    range_end = (page + 1) * page_size - 1
    hdrs = {**HEADERS, "Range": f"{range_start}-{range_end}"}
    # Usar query string para múltiplos filtros no mesmo campo
    import urllib.parse
    qs = urllib.parse.urlencode([
        ("select", OPP_SELECT),
        ("data_lead_recebido", f"gte.{GLOBAL_START}"),
        ("data_lead_recebido", f"lte.{GLOBAL_END}"),
        ("pipeline_id", f"neq.{PIPELINE_RECUPERACAO_ID}"),
        ("order", "data_lead_recebido.asc,id.asc"),
    ])
    resp = requests.get(f"{SUPA_URL}/rest/v1/oportunidades?{qs}", headers=hdrs)
    resp.raise_for_status()
    data = resp.json()
    all_opps_raw.extend(data)
    if len(data) < page_size:
        break
    page += 1
    print(f"  ... página {page+1}, total={len(all_opps_raw)}", flush=True)

print(f"  Total oportunidades brutas: {len(all_opps_raw)}")

# Filtrar apenas paid sources (replicando o hook)
opps_paid = [
    o for o in all_opps_raw
    if o.get("contatos") and o["contatos"].get("utm_source") in PAGO_SOURCES
]
print(f"  Após filtro paid sources: {len(opps_paid)} opps")


# ─── STEP 3: Carregar revenue (vendas_fechamento) ───────────────
# Lógica do hook: fetch revenue com data_pagamento_entrada >= startISO (global),
# filtra client-side pelos IDs das opps do cohort.
print("\nCarregando vendas_fechamento...")
REVENUE_SELECT = "oportunidade_id,valor_faturado,valor_entrada,data_pagamento_entrada"
import urllib.parse
qs_rev = urllib.parse.urlencode([
    ("select", REVENUE_SELECT),
    ("data_pagamento_entrada", f"gte.{GLOBAL_START}"),
])
all_revenue = []
page = 0
while True:
    range_start = page * page_size
    range_end = (page + 1) * page_size - 1
    hdrs = {**HEADERS, "Range": f"{range_start}-{range_end}"}
    resp = requests.get(f"{SUPA_URL}/rest/v1/vendas_fechamento?{qs_rev}", headers=hdrs)
    resp.raise_for_status()
    data = resp.json()
    all_revenue.extend(data)
    if len(data) < page_size:
        break
    page += 1
print(f"  Total revenue rows: {len(all_revenue)}")

# Map: opp_id → { faturamento, data_pagamento }
revenue_map = {}
for r in all_revenue:
    if r.get("data_pagamento_entrada"):
        revenue_map[r["oportunidade_id"]] = {
            "faturamento": r.get("valor_faturado") or 0,
            "data_pagamento": r["data_pagamento_entrada"][:10],
        }

# ─── STEP 4: Carregar meta_ads_insights ─────────────────────────
print("\nCarregando meta_ads_insights nov/2025–mai/2026...")
META_SELECT = "spend,ad_name,date"
import urllib.parse
qs_meta = urllib.parse.urlencode([
    ("select", META_SELECT),
    ("date", f"gte.2025-11-01"),
    ("date", f"lte.2026-05-31"),
    ("order", "date.asc"),
])
all_meta = []
page = 0
while True:
    range_start = page * page_size
    range_end = (page + 1) * page_size - 1
    hdrs = {**HEADERS, "Range": f"{range_start}-{range_end}"}
    resp = requests.get(f"{SUPA_URL}/rest/v1/meta_ads_insights?{qs_meta}", headers=hdrs)
    resp.raise_for_status()
    data = resp.json()
    all_meta.extend(data)
    if len(data) < page_size:
        break
    page += 1
    print(f"  ... meta página {page+1}, total={len(all_meta)}", flush=True)

print(f"  Total meta rows: {len(all_meta)}")


# ─── STEP 5: Calcular métricas por mês/grupo ─────────────────────
def filter_opps_by_campaign(opps: list, campaign_set: set) -> list:
    """Filtra oportunidades pelo utm_campaign do contato."""
    result = []
    for o in opps:
        uc = o.get("contatos", {}) and o["contatos"].get("utm_campaign")
        if uc is not None and str(uc) in campaign_set:
            result.append(o)
    return result


def calc_meta_spend(meta_rows: list, page_codes: list, date_start: str, date_end: str) -> float:
    """
    Soma spend do Meta filtrado por page_code (ad_name contém o código)
    e pelo período de data (coluna date, tipo DATE — sem timezone).
    """
    total = 0.0
    for r in meta_rows:
        if not r.get("date"):
            continue
        if r["date"] < date_start or r["date"] > date_end:
            continue
        ad_name = r.get("ad_name") or ""
        if any(pc in ad_name for pc in page_codes):
            total += r.get("spend") or 0
    return total


rows_output = []

print("\nCalculando métricas por mês/grupo...")
for year_month, label in MONTHS:
    first_day, last_day = month_bounds(year_month)
    start_iso = to_sp_iso_start(first_day)
    end_iso = to_sp_iso_end(last_day)

    print(f"\n  Mês: {label} ({first_day} → {last_day})")

    # Filtrar opps do cohort do mês (data_lead_recebido no período)
    month_opps_all = [
        o for o in opps_paid
        if o.get("data_lead_recebido") and
           start_iso <= o["data_lead_recebido"] <= end_iso
    ]

    for grupo_label, campaigns, page_codes, camp_names in [
        ("Grupo A", GRUPO_A_CAMPAIGNS, GRUPO_A_PAGE_CODES, "[cp] form-fb (ID 32)"),
        ("Grupo B", GRUPO_B_CAMPAIGNS, GRUPO_B_PAGE_CODES, "[cp] aplicacao (ID 12) + [cp] form reduzido (ID 9)"),
    ]:
        # Filtrar por campanha
        opps = filter_opps_by_campaign(month_opps_all, campaigns)
        total_leads = len(opps)

        # IDs das opps do cohort
        opp_ids = {o["id"] for o in opps}

        # MQLs: tag "mql" no contato
        total_mqls = sum(1 for o in opps if is_mql_by_tag(o.get("contatos")))

        # Agendamentos: data_agendamento_reuniao IS NOT NULL
        total_agendamentos = sum(1 for o in opps if o.get("data_agendamento_reuniao"))

        # Reuniões feitas: data_realizacao_vendas IS NOT NULL
        total_reunioes = sum(1 for o in opps if o.get("data_realizacao_vendas"))

        # Vendas fechadas: opp_id está no revenue_map (= tem data_pagamento_entrada)
        total_vendas = sum(1 for o in opps if o["id"] in revenue_map)

        # Faturamento total das opps do cohort com pagamento
        total_faturado = sum(
            revenue_map[o["id"]]["faturamento"]
            for o in opps
            if o["id"] in revenue_map
        )

        # Investimento Meta: soma spend por page_code no período DO MÊS (data DATE)
        investimento = calc_meta_spend(all_meta, page_codes, first_day, last_day)

        # Calcular métricas derivadas
        cpl = round(investimento / total_mqls, 2) if total_mqls > 0 else None
        custo_agendamento = round(investimento / total_agendamentos, 2) if total_agendamentos > 0 else None
        custo_reuniao = round(investimento / total_reunioes, 2) if total_reunioes > 0 else None
        custo_venda = round(investimento / total_vendas, 2) if total_vendas > 0 else None
        roas = round(total_faturado / investimento, 4) if investimento > 0 else None

        print(f"    {grupo_label}: leads={total_leads}, mqls={total_mqls}, "
              f"agend={total_agendamentos}, reun={total_reunioes}, "
              f"vendas={total_vendas}, fat=R${total_faturado:,.2f}, "
              f"invest=R${investimento:,.2f}")

        rows_output.append({
            "Mes": label,
            "Grupo": grupo_label,
            "Campanha(s)": camp_names,
            "Investimento": round(investimento, 2),
            "Total_Leads": total_leads,
            "Total_MQLs": total_mqls,
            "CPL": cpl if cpl is not None else "",
            "Total_Agendamentos": total_agendamentos,
            "Custo_Agendamento": custo_agendamento if custo_agendamento is not None else "",
            "Total_Reunioes": total_reunioes,
            "Custo_Reuniao": custo_reuniao if custo_reuniao is not None else "",
            "Total_Vendas": total_vendas,
            "Custo_Venda": custo_venda if custo_venda is not None else "",
            "Total_Faturado": round(total_faturado, 2),
            "ROAS": roas if roas is not None else "",
        })


# ─── STEP 6: Salvar CSV ──────────────────────────────────────────
output_path = "/Users/bguzela/Desenvolvimento/GHL-SUPABASE/Guzela/comparativo-campanhas-cohort.csv"
fieldnames = [
    "Mes", "Grupo", "Campanha(s)", "Investimento", "Total_Leads", "Total_MQLs",
    "CPL", "Total_Agendamentos", "Custo_Agendamento", "Total_Reunioes",
    "Custo_Reuniao", "Total_Vendas", "Custo_Venda", "Total_Faturado", "ROAS"
]

with open(output_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows_output)

print(f"\n✅ CSV salvo em: {output_path}")
print(f"   Total linhas: {len(rows_output)}")
