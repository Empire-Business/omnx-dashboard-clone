#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CPV, ROAS e ROAS CAIXA por região — cruzamento real com Meta Ads.

Regras:
- Apenas vendas oriundas de tráfego pago.
- Estado normalizado a partir de `estado_uf` e, em falta, inferido pelo DDD do telefone.
- Investimento por região lido do CSV `investimento-por-regiao-meta.csv`.
  - Se o CSV não existir, um mock de exemplo é gerado automaticamente para demonstração.
- CPV  = investimento real da região / vendas da região
- ROAS = faturamento da região / investimento real da região
- ROAS CAIXA = entrada (valor pago) da região / investimento real da região
"""

import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent.parent

COMPRANTES_CSV = ROOT_DIR / "exports" / "comprantes-2026.csv"
INVESTIMENTO_CSV = BASE_DIR / "investimento-por-regiao-meta.csv"

OUTPUT_DIR = BASE_DIR
OUTPUT_MD = OUTPUT_DIR / "cpv-real-por-regiao-2026.md"
OUTPUT_CSV = OUTPUT_DIR / "cpv-real-por-regiao-2026.csv"

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

# Ordem fixa para apresentação das regiões no relatório.
ORDEM_REGIOES = ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte", "Exterior", "Indefinido"]

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
    """Converte um nome/sigla de estado para a sigla de dois caracteres."""
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
    """Extrai o DDD brasileiro de um número de telefone, tratando prefixos."""
    import re
    if pd.isna(telefone):
        return None
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
    """Mapeia uma UF brasileira (ou PT) para a região correspondente."""
    if uf is None:
        return "Indefinido"
    if uf == "PT":
        return "Exterior"
    for regiao, estados in REGIOES_BRASIL.items():
        if uf in estados:
            return regiao
    return "Indefinido"


def formatar_moeda(valor):
    """Formata um número como moeda brasileira."""
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def carregar_ou_criar_investimento(csv_path):
    """
    Carrega o CSV de investimento por região.
    Se ele não existir, cria um mock de exemplo e o salva em disco.
    """
    if csv_path.exists():
        invest_df = pd.read_csv(csv_path)
        print(f"✅ Investimento real carregado: {csv_path}")
        return invest_df, False

    # Mock representativo para demonstração do funcionamento.
    # Valores baseados em uma conta proporcional ao peso de vendas histórico;
    # serão substituídos automaticamente quando o backfill da Meta gerar o CSV real.
    mock_data = {
        "regiao": ["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte", "Exterior"],
        "investimento": [95000.00, 32000.00, 28000.00, 18000.00, 12000.00, 5000.00],
    }
    invest_df = pd.DataFrame(mock_data)
    invest_df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    print(f"⚠️  CSV de investimento não encontrado. Mock criado em: {csv_path}")
    return invest_df, True


def main():
    # Carrega dados de comprantes.
    df = pd.read_csv(COMPRANTES_CSV)

    # Prepara estado e região.
    df["uf_estado_uf"] = df["estado_uf"].apply(normalizar_estado)
    df["ddd"] = df["telefone"].apply(extrair_ddd)
    df["uf_ddd"] = df["ddd"].map(DDD_PARA_ESTADO)
    df["uf"] = df["uf_estado_uf"].fillna(df["uf_ddd"])
    df["regiao"] = df["uf"].apply(estado_para_regiao)

    # Valores numéricos.
    df["valor_faturado"] = pd.to_numeric(df["valor_faturado"], errors="coerce").fillna(0)
    df["valor_entrada"] = pd.to_numeric(df["valor_entrada"], errors="coerce").fillna(0)

    # Filtra tráfego pago.
    df["utm_source"] = df["utm_source"].fillna("").astype(str).str.strip()
    df_trafego = df[df["utm_source"].isin(TRAFEGO_SOURCES)].copy()

    # Agrupa vendas por região.
    vendas_por_regiao = df_trafego.groupby("regiao").agg(
        vendas=("valor_faturado", "size"),
        faturamento=("valor_faturado", "sum"),
        entrada=("valor_entrada", "sum"),
    ).reset_index()

    # Carrega (ou cria mock de) investimento por região.
    investimento_df, usou_mock = carregar_ou_criar_investimento(INVESTIMENTO_CSV)

    # Garante tipos numéricos.
    investimento_df["investimento"] = pd.to_numeric(investimento_df["investimento"], errors="coerce").fillna(0)

    # Cruza vendas com investimento real por região.
    # LEFT JOIN mantém todas as regiões que tiveram vendas, mesmo sem investimento mapeado.
    resumo = vendas_por_regiao.merge(
        investimento_df[["regiao", "investimento"]],
        on="regiao",
        how="left"
    )
    resumo["investimento"] = resumo["investimento"].fillna(0)

    # Adiciona regiões que têm investimento mas ainda não tiveram vendas (linha com vendas=0).
    regioes_com_vendas = set(resumo["regiao"])
    investimento_extra = investimento_df[~investimento_df["regiao"].isin(regioes_com_vendas)].copy()
    if not investimento_extra.empty:
        investimento_extra["vendas"] = 0
        investimento_extra["faturamento"] = 0.0
        investimento_extra["entrada"] = 0.0
        resumo = pd.concat([resumo, investimento_extra[["regiao", "vendas", "faturamento", "entrada", "investimento"]]], ignore_index=True)

    # Métricas.
    resumo["cpv"] = np.where(resumo["vendas"] > 0, resumo["investimento"] / resumo["vendas"], np.inf)
    resumo["roas"] = np.where(resumo["investimento"] > 0, resumo["faturamento"] / resumo["investimento"], np.inf)
    resumo["roas_caixa"] = np.where(resumo["investimento"] > 0, resumo["entrada"] / resumo["investimento"], np.inf)

    # Proporções.
    total_vendas = resumo["vendas"].sum()
    total_faturamento = resumo["faturamento"].sum()
    resumo["pct_vendas"] = np.where(total_vendas > 0, resumo["vendas"] / total_vendas * 100, 0)
    resumo["pct_faturamento"] = np.where(total_faturamento > 0, resumo["faturamento"] / total_faturamento * 100, 0)

    # Ordena conforme ORDEM_REGIOES, colocando desconhecidas no final.
    resumo["ordem"] = resumo["regiao"].apply(
        lambda r: ORDEM_REGIOES.index(r) if r in ORDEM_REGIOES else len(ORDEM_REGIOES)
    )
    resumo = resumo.sort_values(["ordem", "regiao"]).drop(columns="ordem").reset_index(drop=True)

    # Garante todas as colunas finais com nomes claros.
    colunas_finais = [
        "regiao", "vendas", "faturamento", "entrada", "investimento",
        "cpv", "roas", "roas_caixa", "pct_vendas", "pct_faturamento"
    ]
    resumo = resumo[colunas_finais]

    # Salva CSV.
    resumo.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

    # Totais para o markdown.
    total_entrada = resumo["entrada"].sum()
    total_investimento = resumo["investimento"].sum()
    cpv_geral = total_investimento / total_vendas if total_vendas > 0 else 0
    roas_geral = total_faturamento / total_investimento if total_investimento > 0 else 0
    roas_caixa_geral = total_entrada / total_investimento if total_investimento > 0 else 0

    # Gera Markdown.
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    linhas = []
    linhas.append("# CPV, ROAS e ROAS CAIXA por Região — Investimento Real da Meta")
    linhas.append("")
    linhas.append(f"_Gerado em: {agora}_")
    linhas.append("")
    linhas.append("## Regras da conta")
    linhas.append("")
    linhas.append("- Apenas vendas oriundas de tráfego pago.")
    linhas.append("- Estado normalizado pelo campo `estado_uf`; quando ausente, inferido pelo DDD do telefone.")
    linhas.append("- Investimento por região lido de `investimento-por-regiao-meta.csv`.")
    if usou_mock:
        linhas.append("- ⚠️ **Atenção:** o CSV de investimento real ainda não existia, então foi gerado um mock de demonstração.")
        linhas.append("  Substitua `investimento-por-regiao-meta.csv` pelo arquivo real do backfill da Meta para obter números reais.")
    linhas.append("- **CPV** = investimento real da região / vendas da região")
    linhas.append("- **ROAS** = faturamento da região / investimento real da região")
    linhas.append("- **ROAS CAIXA** = entrada (valor pago) da região / investimento real da região")
    linhas.append("")
    linhas.append("## Resumo geral")
    linhas.append("")
    linhas.append(f"- **Investimento total:** {formatar_moeda(total_investimento)}")
    linhas.append(f"- **Vendas de tráfego:** {int(total_vendas)}")
    linhas.append(f"- **Faturamento total:** {formatar_moeda(total_faturamento)}")
    linhas.append(f"- **Entrada total (caixa):** {formatar_moeda(total_entrada)}")
    linhas.append(f"- **CPV médio geral:** {formatar_moeda(cpv_geral)}")
    linhas.append(f"- **ROAS geral:** {roas_geral:.2f}")
    linhas.append(f"- **ROAS CAIXA geral:** {roas_caixa_geral:.2f}")
    linhas.append("")
    linhas.append("## Resultado por região")
    linhas.append("")
    linhas.append("| Região | Vendas | % Vendas | Faturamento | Entrada (Caixa) | Investimento | CPV | ROAS | ROAS CAIXA |")
    linhas.append("|--------|-------:|---------:|------------:|----------------:|-------------:|----:|-----:|-----------:|")

    for _, row in resumo.iterrows():
        cpv_fmt = "—" if np.isinf(row["cpv"]) else formatar_moeda(row["cpv"])
        roas_fmt = "—" if np.isinf(row["roas"]) else f"{row['roas']:.2f}"
        roas_caixa_fmt = "—" if np.isinf(row["roas_caixa"]) else f"{row['roas_caixa']:.2f}"
        linhas.append(
            f"| {row['regiao']} | {int(row['vendas'])} | {row['pct_vendas']:.1f}% | "
            f"{formatar_moeda(row['faturamento'])} | {formatar_moeda(row['entrada'])} | "
            f"{formatar_moeda(row['investimento'])} | {cpv_fmt} | {roas_fmt} | {roas_caixa_fmt} |"
        )

    linhas.append("")
    linhas.append("## Observações")
    linhas.append("")
    linhas.append(
        "> O investimento por região deve vir do breakdown `region` da Meta Ads API. "
        "Quando o backfill da Meta gerar `investimento-por-regiao-meta.csv`, basta substituir o arquivo e rodar este script novamente. "
        "Até lá, o mock serve apenas para validar o cruzamento de dados."
    )
    linhas.append("")
    linhas.append("> **Nota metodológica:** o investimento da Meta é por localização de exibição do anúncio, "
                  "não necessariamente pelo endereço do comprador. Use como aproximação regional.")

    OUTPUT_MD.write_text("\n".join(linhas), encoding="utf-8")

    print(f"✅ Análise real por região concluída.")
    print(f"   CSV: {OUTPUT_CSV}")
    print(f"   MD:  {OUTPUT_MD}")
    if usou_mock:
        print(f"   MOCK: {INVESTIMENTO_CSV} (substituir pelo real quando disponível)")
    print(f"\nResumo:")
    print(resumo[["regiao", "vendas", "faturamento", "entrada", "investimento", "cpv", "roas", "roas_caixa"]].to_string(index=False))


if __name__ == "__main__":
    main()
