#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CPV, ROAS e ROAS CAIXA por região — conta simples.

Regras:
- 100% da base de comprantes.
- Apenas vendas oriundas de tráfego pago.
- Investimento total é distribuído por região proporcionalmente ao número de vendas.
- CPV  = investimento alocado na região / vendas da região
- ROAS = faturamento da região / investimento alocado na região
- ROAS CAIXA = valor de entrada da região / investimento alocado na região
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent.parent

COMPRANTES_CSV = ROOT_DIR / "exports" / "comprantes-2026.csv"
INVESTIMENTO_CSV = ROOT_DIR / "Guzela" / "comparativo-campanhas-cohort.csv"

OUTPUT_DIR = BASE_DIR
OUTPUT_MD = OUTPUT_DIR / "cpv-simples-por-regiao-2026.md"
OUTPUT_CSV = OUTPUT_DIR / "cpv-simples-por-regiao-2026.csv"

TRAFEGO_SOURCES = {
    "iads-28", "iorg-3", "iads-7", "iorg-9", "iorg-1", "iads-11",
    "iads-18", "iads-25", "iads-32", "iorg-4", "iorg-43",
}

ESTADO_NORMALIZACAO = {
    "acre": "AC", "ac": "AC",
    "alagoas": "AL", "al": "AL",
    "amapa": "AP", "ap": "AP",
    "amazonas": "AM", "am": "AM",
    "bahia": "BA", "ba": "BA",
    "ceara": "CE", "ce": "CE",
    "distrito federal": "DF", "df": "DF",
    "espirito santo": "ES", "es": "ES",
    "goias": "GO", "go": "GO",
    "maranhao": "MA", "ma": "MA",
    "mato grosso": "MT", "mt": "MT",
    "mato grosso do sul": "MS", "ms": "MS",
    "minas gerais": "MG", "mg": "MG",
    "para": "PA", "pa": "PA",
    "paraiba": "PB", "pb": "PB",
    "parana": "PR", "pr": "PR",
    "pernambuco": "PE", "pe": "PE",
    "piaui": "PI", "pi": "PI",
    "rio de janeiro": "RJ", "rj": "RJ",
    "rio grande do norte": "RN", "rn": "RN",
    "rio grande do sul": "RS", "rs": "RS",
    "rondonia": "RO", "ro": "RO",
    "roraima": "RR", "rr": "RR",
    "santa catarina": "SC", "sc": "SC",
    "sao paulo": "SP", "sp": "SP", "são paulo": "SP",
    "sergipe": "SE", "se": "SE",
    "tocantins": "TO", "to": "TO",
    "bh": "MG",
    "distrito de lisboa": "PT",
}

REGIOES_BRASIL = {
    "Norte": ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
    "Nordeste": ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
    "Centro-Oeste": ["DF", "GO", "MS", "MT"],
    "Sudeste": ["ES", "MG", "RJ", "SP"],
    "Sul": ["PR", "RS", "SC"],
}

DDD_PARA_ESTADO = {
    11: "SP", 12: "SP", 13: "SP", 14: "SP", 15: "SP", 16: "SP", 17: "SP", 18: "SP", 19: "SP",
    21: "RJ", 22: "RJ", 24: "RJ",
    27: "ES", 28: "ES",
    31: "MG", 32: "MG", 33: "MG", 34: "MG", 35: "MG", 37: "MG", 38: "MG",
    41: "PR", 42: "PR", 43: "PR", 44: "PR", 45: "PR", 46: "PR",
    47: "SC", 48: "SC", 49: "SC",
    51: "RS", 53: "RS", 54: "RS", 55: "RS",
    61: "DF", 62: "GO", 64: "GO",
    63: "TO",
    65: "MT", 66: "MT",
    67: "MS",
    68: "AC",
    69: "RO",
    71: "BA", 73: "BA", 74: "BA", 75: "BA", 77: "BA",
    79: "SE",
    81: "PE", 87: "PE",
    82: "AL",
    83: "PB",
    84: "RN",
    85: "CE", 88: "CE",
    86: "PI", 89: "PI",
    91: "PA", 93: "PA", 94: "PA",
    92: "AM", 97: "AM",
    95: "RR",
    96: "AP",
    98: "MA", 99: "MA",
}


def normalizar_estado(valor):
    if pd.isna(valor):
        return None
    s = str(valor).strip().lower()
    s = s.replace("á", "a").replace("ã", "a").replace("â", "a")
    s = s.replace("é", "e").replace("ê", "e")
    s = s.replace("í", "i")
    s = s.replace("ó", "o").replace("ô", "o").replace("õ", "o")
    s = s.replace("ú", "u")
    s = s.replace("ç", "c")
    return ESTADO_NORMALIZACAO.get(s)


def extrair_ddd(telefone):
    if pd.isna(telefone):
        return None
    import re
    tel = str(telefone).strip()
    digitos = re.sub(r"\D", "", tel)
    if digitos.startswith("55") and len(digitos) >= 12:
        digitos = digitos[2:]
    if digitos.startswith("0"):
        digitos = digitos[1:]
    if len(digitos) >= 10:
        return int(digitos[:2])
    return None


def estado_para_regiao(uf):
    if uf is None:
        return "Indefinido"
    if uf == "PT":
        return "Exterior"
    for regiao, estados in REGIOES_BRASIL.items():
        if uf in estados:
            return regiao
    return "Indefinido"


def formatar_moeda(valor):
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def main():
    # Carrega dados
    df = pd.read_csv(COMPRANTES_CSV)
    investimento_df = pd.read_csv(INVESTIMENTO_CSV)

    investimento_total = investimento_df["Investimento"].sum()

    # Prepara estado
    df["uf_estado_uf"] = df["estado_uf"].apply(normalizar_estado)
    df["ddd"] = df["telefone"].apply(extrair_ddd)
    df["uf_ddd"] = df["ddd"].map(DDD_PARA_ESTADO)
    df["uf"] = df["uf_estado_uf"].fillna(df["uf_ddd"])
    df["regiao"] = df["uf"].apply(estado_para_regiao)

    # Valores numéricos
    df["valor_faturado"] = pd.to_numeric(df["valor_faturado"], errors="coerce").fillna(0)
    df["valor_entrada"] = pd.to_numeric(df["valor_entrada"], errors="coerce").fillna(0)

    # Filtra tráfego pago
    df["utm_source"] = df["utm_source"].fillna("").astype(str).str.strip()
    df_trafego = df[df["utm_source"].isin(TRAFEGO_SOURCES)].copy()

    # Agrupa por região
    resumo = df_trafego.groupby("regiao").agg(
        vendas=("valor_faturado", "size"),
        faturamento=("valor_faturado", "sum"),
        entrada=("valor_entrada", "sum"),
    ).reset_index()

    total_vendas = resumo["vendas"].sum()

    # Aloca investimento proporcionalmente às vendas
    resumo["investimento"] = investimento_total * (resumo["vendas"] / total_vendas)

    # Métricas
    resumo["cpv"] = resumo["investimento"] / resumo["vendas"]
    resumo["roas"] = resumo["faturamento"] / resumo["investimento"]
    resumo["roas_caixa"] = resumo["entrada"] / resumo["investimento"]

    # Proporções
    resumo["pct_vendas"] = resumo["vendas"] / total_vendas * 100
    resumo["pct_faturamento"] = resumo["faturamento"] / resumo["faturamento"].sum() * 100

    # Ordena por faturamento
    resumo = resumo.sort_values("faturamento", ascending=False)

    # Salva CSV
    resumo[["regiao", "vendas", "faturamento", "entrada", "investimento",
            "cpv", "roas", "roas_caixa", "pct_vendas", "pct_faturamento"]].to_csv(
        OUTPUT_CSV, index=False, encoding="utf-8-sig"
    )

    # Gera Markdown
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linhas = []
    linhas.append("# CPV, ROAS e ROAS CAIXA por Região — Conta Simples")
    linhas.append("")
    linhas.append(f"_Gerado em: {agora}_")
    linhas.append("")
    linhas.append("## Regras da conta")
    linhas.append("")
    linhas.append("- Apenas vendas oriundas de tráfego pago.")
    linhas.append("- Investimento total distribuído por região proporcionalmente ao número de vendas.")
    linhas.append("- **CPV** = investimento da região / vendas da região")
    linhas.append("- **ROAS** = faturamento da região / investimento da região")
    linhas.append("- **ROAS CAIXA** = entrada (valor pago) da região / investimento da região")
    linhas.append("")
    linhas.append("## Resumo geral")
    linhas.append("")
    linhas.append(f"- **Investimento total:** {formatar_moeda(investimento_total)}")
    linhas.append(f"- **Vendas de tráfego:** {int(total_vendas)}")
    linhas.append(f"- **Faturamento total:** {formatar_moeda(resumo['faturamento'].sum())}")
    linhas.append(f"- **Entrada total (caixa):** {formatar_moeda(resumo['entrada'].sum())}")
    linhas.append(f"- **CPV médio geral:** {formatar_moeda(investimento_total / total_vendas)}")
    linhas.append(f"- **ROAS geral:** {resumo['faturamento'].sum() / investimento_total:.2f}")
    linhas.append(f"- **ROAS CAIXA geral:** {resumo['entrada'].sum() / investimento_total:.2f}")
    linhas.append("")
    linhas.append("## Resultado por região")
    linhas.append("")
    linhas.append("| Região | Vendas | % Vendas | Faturamento | Entrada (Caixa) | Investimento | CPV | ROAS | ROAS CAIXA |")
    linhas.append("|--------|-------:|---------:|------------:|----------------:|-------------:|----:|-----:|-----------:|")

    for _, row in resumo.iterrows():
        linhas.append(
            f"| {row['regiao']} | {int(row['vendas'])} | {row['pct_vendas']:.1f}% | "
            f"{formatar_moeda(row['faturamento'])} | {formatar_moeda(row['entrada'])} | "
            f"{formatar_moeda(row['investimento'])} | {formatar_moeda(row['cpv'])} | "
            f"{row['roas']:.2f} | {row['roas_caixa']:.2f} |"
        )

    linhas.append("")
    linhas.append("## Observação")
    linhas.append("")
    linhas.append("> O investimento foi alocado proporcionalmente porque não temos o gasto real do Meta Ads por região. "
                  "Se quisermos o CPV/ROAS real por estado, é necessário extrair da Meta Ads API o breakdown de investimento por região.")

    OUTPUT_MD.write_text("\n".join(linhas), encoding="utf-8")

    print(f"✅ Análise simples concluída.")
    print(f"   CSV: {OUTPUT_CSV}")
    print(f"   MD:  {OUTPUT_MD}")
    print(f"\nResumo:")
    print(resumo[["regiao", "vendas", "faturamento", "entrada", "investimento", "cpv", "roas", "roas_caixa"]].to_string(index=False))


if __name__ == "__main__":
    main()
