#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Análise de CPV (Custo Por Venda) por região/estado do Brasil.

Dados de entrada:
  - exports/comprantes-2026.csv      (compradores com estado_uf e telefone)
  - exports/mqls-2026.csv            (MQLs com telefone para inferir estado via DDD)
  - Guzela/comparativo-campanhas-cohort.csv  (investimento e vendas totais por mês/grupo)

Limitações importantes:
  1. Não temos investimento de tráfego segmentado por estado diretamente.
     O gasto do Meta Ads vem agregado por campanha/mês. Portanto, o CPV por
     estado é uma ESTIMATIVA baseada em regras de alocação.
  2. O estado do comprador vem do campo estado_uf (muitas vezes preenchido
     manualmente no contrato). Quando ausente ou inconsistente, usamos o DDD
     do telefone como fallback.
  3. "Tráfego" aqui é interpretado como tráfego pago Meta (iads-* e iorg-*),
     excluindo importações e fontes orgânicas/diretas. O recorte pode ser
     ajustado no parâmetro TRAFEGO_SOURCES abaixo.

Métodos de alocação do investimento por estado:
  A) Proporcional ao número de vendas no estado
  B) Proporcional ao faturamento gerado no estado
  C) Proporcional ao número de MQLs do estado (inferidos por DDD)

CPV estimado = investimento alocado no estado / vendas no estado
"""

import pandas as pd
import numpy as np
import re
import os
from pathlib import Path
from datetime import datetime

# ─── Configurações ───────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent.parent

COMPRANTES_CSV = ROOT_DIR / "exports" / "comprantes-2026.csv"
MQLS_CSV = ROOT_DIR / "exports" / "mqls-2026.csv"
INVESTIMENTO_CSV = ROOT_DIR / "Guzela" / "comparativo-campanhas-cohort.csv"

OUTPUT_DIR = BASE_DIR
OUTPUT_CSV = OUTPUT_DIR / "cpv-por-regiao-2026.csv"
OUTPUT_MD = OUTPUT_DIR / "cpv-por-regiao-2026.md"

# Fontes consideradas tráfego pago Meta no recorte padrão.
# iads-* = Instagram Ads; iorg-* = Instagram organizado como campanha paga no CRM.
# Ajuste conforme a classificação real da tabela utm_sources.
TRAFEGO_SOURCES = {
    "iads-28", "iorg-3", "iads-7", "iorg-9", "iorg-1", "iads-11",
    "iads-18", "iads-25", "iads-32", "iorg-4", "iorg-43",
}

# ─── Mapeamentos ─────────────────────────────────────────────────────────────

# Nomes completos / variações → sigla
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
    "rio de janeiro": "RJ", "rj": "RJ", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rn": "RN",
    "rio grande do sul": "RS", "rs": "RS",
    "rondonia": "RO", "ro": "RO",
    "roraima": "RR", "rr": "RR",
    "santa catarina": "SC", "sc": "SC",
    "sao paulo": "SP", "sp": "SP", "são paulo": "SP",
    "sergipe": "SE", "se": "SE",
    "tocantins": "TO", "to": "TO",
    # Correções manuais de erros comuns
    "bh": "MG",  # Belo Horizonte sem estado → MG
    "distrito de lisboa": "PT",  # Portugal (erro de preenchimento)
}

REGIOES_BRASIL = {
    "Norte": ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
    "Nordeste": ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
    "Centro-Oeste": ["DF", "GO", "MS", "MT"],
    "Sudeste": ["ES", "MG", "RJ", "SP"],
    "Sul": ["PR", "RS", "SC"],
}

# DDD → estado (sem +55)
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

# ─── Funções auxiliares ──────────────────────────────────────────────────────


def normalizar_estado(valor):
    """Converte nome completo, sigla ou variação para sigla do estado."""
    if pd.isna(valor):
        return None
    s = str(valor).strip().lower()
    # Remove acentos básicos
    s = s.replace("á", "a").replace("ã", "a").replace("â", "a")
    s = s.replace("é", "e").replace("ê", "e")
    s = s.replace("í", "i")
    s = s.replace("ó", "o").replace("ô", "o").replace("õ", "o")
    s = s.replace("ú", "u")
    s = s.replace("ç", "c")
    return ESTADO_NORMALIZACAO.get(s)


def extrair_ddd(telefone):
    """Extrai o DDD de um telefone brasileiro. Retorna int ou None."""
    if pd.isna(telefone):
        return None
    tel = str(telefone).strip()
    # Remove tudo que não for dígito
    digitos = re.sub(r"\D", "", tel)
    # Se começar com 55, remove
    if digitos.startswith("55") and len(digitos) >= 12:
        digitos = digitos[2:]
    # Se começar com 0, remove
    if digitos.startswith("0"):
        digitos = digitos[1:]
    if len(digitos) >= 10:
        return int(digitos[:2])
    return None


def ddd_para_estado(ddd):
    if ddd is None:
        return None
    return DDD_PARA_ESTADO.get(ddd)


def estado_para_regiao(uf):
    if uf is None:
        return None
    if uf == "PT":
        return "Exterior"
    for regiao, estados in REGIOES_BRASIL.items():
        if uf in estados:
            return regiao
    return "Indefinido"


def formatar_moeda(valor):
    return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ─── Carregamento ────────────────────────────────────────────────────────────


def carregar_dados():
    comprantes = pd.read_csv(COMPRANTES_CSV)
    mqls = pd.read_csv(MQLS_CSV)
    investimento = pd.read_csv(INVESTIMENTO_CSV)
    return comprantes, mqls, investimento


# ─── Processamento ───────────────────────────────────────────────────────────


def preparar_comprantes(comprantes):
    df = comprantes.copy()

    # Normaliza estado a partir do campo estado_uf
    df["uf_estado_uf"] = df["estado_uf"].apply(normalizar_estado)

    # Inferir estado pelo DDD do telefone
    df["ddd"] = df["telefone"].apply(extrair_ddd)
    df["uf_ddd"] = df["ddd"].apply(ddd_para_estado)

    # Estado final: estado_uf normalizado tem prioridade; senão, DDD
    df["uf"] = df["uf_estado_uf"].fillna(df["uf_ddd"])
    df["regiao"] = df["uf"].apply(estado_para_regiao)

    # Garante valor_faturado numérico
    df["valor_faturado"] = pd.to_numeric(df["valor_faturado"], errors="coerce").fillna(0)

    # Identifica tráfego pago
    df["utm_source"] = df["utm_source"].fillna("").astype(str).str.strip()
    df["is_trafego"] = df["utm_source"].isin(TRAFEGO_SOURCES)

    return df


def preparar_mqls(mqls):
    df = mqls.copy()
    df["ddd"] = df["telefone"].apply(extrair_ddd)
    df["uf"] = df["ddd"].apply(ddd_para_estado)
    df["regiao"] = df["uf"].apply(estado_para_regiao)

    df["utm_source"] = df["utm_source"].fillna("").astype(str).str.strip()
    df["is_trafego"] = df["utm_source"].isin(TRAFEGO_SOURCES)

    return df


def calcular_metricas(df_comp, df_mql, investimento_total, vendas_total_comparativo):
    """Calcula métricas por estado."""
    df_trafego = df_comp[df_comp["is_trafego"]].copy()

    # Se não houver nenhum comprador de tráfego, usa todos para não quebrar
    if df_trafego.empty:
        df_trafego = df_comp.copy()
        modo = "todos_os_compradores"
    else:
        modo = "trafego_pago"

    # Agrupa por estado
    grupo = df_trafego.groupby("uf").agg(
        vendas=("valor_faturado", "size"),
        faturamento=("valor_faturado", "sum"),
        ticket_medio=("valor_faturado", "mean"),
    ).reset_index()

    # Adiciona regiao a partir da UF
    grupo["regiao"] = grupo["uf"].apply(estado_para_regiao)

    # MQLs por estado (apenas tráfego)
    mql_por_uf = df_mql[df_mql["is_trafego"]].groupby("uf").size().reset_index(name="mqls")
    grupo = grupo.merge(mql_por_uf, on="uf", how="left")
    grupo["mqls"] = grupo["mqls"].fillna(0).astype(int)

    # Totais para proporções
    total_vendas = grupo["vendas"].sum()
    total_faturamento = grupo["faturamento"].sum()
    total_mqls = grupo["mqls"].sum()

    # Alocação do investimento total por diferentes métodos
    grupo["invest_alocado_por_vendas"] = investimento_total * (grupo["vendas"] / total_vendas) if total_vendas > 0 else 0
    grupo["invest_alocado_por_faturamento"] = investimento_total * (grupo["faturamento"] / total_faturamento) if total_faturamento > 0 else 0
    grupo["invest_alocado_por_mqls"] = investimento_total * (grupo["mqls"] / total_mqls) if total_mqls > 0 else 0

    # CPV estimado por método
    grupo["cpv_por_vendas"] = grupo["invest_alocado_por_vendas"] / grupo["vendas"]
    grupo["cpv_por_faturamento"] = grupo["invest_alocado_por_faturamento"] / grupo["vendas"]
    grupo["cpv_por_mqls"] = np.where(grupo["vendas"] > 0, grupo["invest_alocado_por_mqls"] / grupo["vendas"], np.nan)

    # ROAS estimado por método (faturamento / investimento alocado)
    grupo["roas_por_vendas"] = grupo["faturamento"] / grupo["invest_alocado_por_vendas"]
    grupo["roas_por_faturamento"] = grupo["faturamento"] / grupo["invest_alocado_por_faturamento"]
    grupo["roas_por_mqls"] = np.where(grupo["invest_alocado_por_mqls"] > 0, grupo["faturamento"] / grupo["invest_alocado_por_mqls"], np.nan)

    # Ajuste de escala: o comparativo de campanhas reporta menos vendas do que o CSV.
    # Aplicamos um fator de correção uniforme para aproximar o CPV real.
    fator_correcao = (total_vendas / vendas_total_comparativo) if vendas_total_comparativo > 0 else 1.0
    grupo["cpv_por_vendas_ajustado"] = grupo["cpv_por_vendas"] * fator_correcao
    grupo["cpv_por_faturamento_ajustado"] = grupo["cpv_por_faturamento"] * fator_correcao
    grupo["cpv_por_mqls_ajustado"] = grupo["cpv_por_mqls"] * fator_correcao

    # Proporção do total
    grupo["pct_vendas"] = grupo["vendas"] / total_vendas * 100
    grupo["pct_faturamento"] = grupo["faturamento"] / total_faturamento * 100

    # Ordena por faturamento
    grupo = grupo.sort_values("faturamento", ascending=False)

    return grupo, modo, total_vendas, fator_correcao


def calcular_metricas_por_regiao(df_comp, df_mql, investimento_total, vendas_total_comparativo):
    """Calcula métricas agregadas por região."""
    df_trafego = df_comp[df_comp["is_trafego"]].copy()
    if df_trafego.empty:
        df_trafego = df_comp.copy()

    grupo = df_trafego.groupby("regiao").agg(
        vendas=("valor_faturado", "size"),
        faturamento=("valor_faturado", "sum"),
        ticket_medio=("valor_faturado", "mean"),
    ).reset_index()

    mql_por_regiao = df_mql[df_mql["is_trafego"]].groupby("regiao").size().reset_index(name="mqls")
    grupo = grupo.merge(mql_por_regiao, on="regiao", how="left")
    grupo["mqls"] = grupo["mqls"].fillna(0).astype(int)

    total_vendas = grupo["vendas"].sum()
    total_faturamento = grupo["faturamento"].sum()
    total_mqls = grupo["mqls"].sum()

    grupo["invest_alocado_por_vendas"] = investimento_total * (grupo["vendas"] / total_vendas) if total_vendas > 0 else 0
    grupo["invest_alocado_por_faturamento"] = investimento_total * (grupo["faturamento"] / total_faturamento) if total_faturamento > 0 else 0
    grupo["invest_alocado_por_mqls"] = investimento_total * (grupo["mqls"] / total_mqls) if total_mqls > 0 else 0

    grupo["cpv_por_vendas"] = grupo["invest_alocado_por_vendas"] / grupo["vendas"]
    grupo["cpv_por_faturamento"] = grupo["invest_alocado_por_faturamento"] / grupo["vendas"]
    grupo["cpv_por_mqls"] = np.where(grupo["vendas"] > 0, grupo["invest_alocado_por_mqls"] / grupo["vendas"], np.nan)

    grupo["roas_por_vendas"] = grupo["faturamento"] / grupo["invest_alocado_por_vendas"]
    grupo["roas_por_faturamento"] = grupo["faturamento"] / grupo["invest_alocado_por_faturamento"]
    grupo["roas_por_mqls"] = np.where(grupo["invest_alocado_por_mqls"] > 0, grupo["faturamento"] / grupo["invest_alocado_por_mqls"], np.nan)

    fator_correcao = (total_vendas / vendas_total_comparativo) if vendas_total_comparativo > 0 else 1.0
    grupo["cpv_por_vendas_ajustado"] = grupo["cpv_por_vendas"] * fator_correcao
    grupo["cpv_por_faturamento_ajustado"] = grupo["cpv_por_faturamento"] * fator_correcao
    grupo["cpv_por_mqls_ajustado"] = grupo["cpv_por_mqls"] * fator_correcao

    grupo["pct_vendas"] = grupo["vendas"] / total_vendas * 100
    grupo["pct_faturamento"] = grupo["faturamento"] / total_faturamento * 100

    grupo = grupo.sort_values("faturamento", ascending=False)
    return grupo


# ─── Saída ───────────────────────────────────────────────────────────────────


def salvar_csv(df_estado, df_regiao):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Colunas finais por estado
    cols_estado = [
        "uf", "regiao", "vendas", "mqls", "faturamento", "ticket_medio",
        "pct_vendas", "pct_faturamento",
        "invest_alocado_por_vendas", "cpv_por_vendas", "cpv_por_vendas_ajustado", "roas_por_vendas",
        "invest_alocado_por_faturamento", "cpv_por_faturamento", "cpv_por_faturamento_ajustado", "roas_por_faturamento",
        "invest_alocado_por_mqls", "cpv_por_mqls", "cpv_por_mqls_ajustado", "roas_por_mqls",
    ]
    df_estado[cols_estado].to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

    # Região em arquivo separado
    cols_regiao = [
        "regiao", "vendas", "mqls", "faturamento", "ticket_medio",
        "pct_vendas", "pct_faturamento",
        "invest_alocado_por_vendas", "cpv_por_vendas", "cpv_por_vendas_ajustado", "roas_por_vendas",
        "invest_alocado_por_faturamento", "cpv_por_faturamento", "cpv_por_faturamento_ajustado", "roas_por_faturamento",
        "invest_alocado_por_mqls", "cpv_por_mqls", "cpv_por_mqls_ajustado", "roas_por_mqls",
    ]
    df_regiao[cols_regiao].to_csv(OUTPUT_DIR / "cpv-por-regiao-agregado-2026.csv", index=False, encoding="utf-8-sig")


def gerar_relatorio(df_comp, df_mql, df_estado, df_regiao, investimento_total, vendas_total_comparativo, faturamento_total, modo, total_vendas_csv, fator_correcao):
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Recorte de tráfego
    total_compradores = len(df_comp)
    compradores_trafego = df_comp["is_trafego"].sum()
    total_mqls = len(df_mql)
    mqls_trafego = df_mql["is_trafego"].sum()

    # Vendas por campanha cohort (9,12,32) vs outras
    df_comp["utm_campaign_num"] = pd.to_numeric(df_comp["utm_campaign"], errors="coerce")
    vendas_cohort = df_comp[df_comp["utm_campaign_num"].isin([9, 12, 32]) & df_comp["is_trafego"]]
    vendas_outras = df_comp[~df_comp["utm_campaign_num"].isin([9, 12, 32]) & df_comp["is_trafego"]]

    linhas = []
    linhas.append("# Estudo de CPV por Região / Estado do Brasil")
    linhas.append("")
    linhas.append(f"_Gerado em: {agora}_")
    linhas.append("")
    linhas.append("## Resumo executivo")
    linhas.append("")
    linhas.append(f"- **Período analisado:** nov/2025 a mai/2026 (cohort do painel de tráfego)")
    linhas.append(f"- **Investimento total de tráfego (comparativo cohort):** {formatar_moeda(investimento_total)}")
    linhas.append(f"- **Vendas totais no comparativo cohort:** {int(vendas_total_comparativo)}")
    linhas.append(f"- **Vendas de tráfego identificadas no CSV de comprantes:** {int(total_vendas_csv)}")
    linhas.append(f"- **Faturamento total (tráfego, CSV):** {formatar_moeda(faturamento_total)}")
    linhas.append(f"- **CPV médio geral (comparativo):** {formatar_moeda(investimento_total / vendas_total_comparativo)}")
    linhas.append(f"- **ROAS geral (comparativo):** {faturamento_total / investimento_total:.2f}")
    linhas.append("")
    linhas.append("## Recorte de tráfego pago")
    linhas.append("")
    linhas.append(f"Fontes consideradas como tráfego pago Meta (critério hardcoded): `{', '.join(sorted(TRAFEGO_SOURCES))}`.")
    linhas.append("")
    linhas.append(f"- Compradores no arquivo: **{total_compradores}**")
    linhas.append(f"- Compradores de tráfego pago: **{compradores_trafego}** ({compradores_trafego/total_compradores*100:.1f}%)")
    linhas.append(f"- MQLs no arquivo: **{total_mqls}**")
    linhas.append(f"- MQLs de tráfego pago: **{mqls_trafego}** ({mqls_trafego/total_mqls*100:.1f}%)")
    linhas.append(f"- Vendas nas campanhas do cohort (9/12/32): **{len(vendas_cohort)}** → faturamento {formatar_moeda(vendas_cohort['valor_faturado'].sum())}")
    linhas.append(f"- Vendas em outras campanhas de tráfego: **{len(vendas_outras)}** → faturamento {formatar_moeda(vendas_outras['valor_faturado'].sum())}")
    linhas.append("")
    linhas.append("## ⚠️ Limitações e discrepâncias de dados")
    linhas.append("")
    linhas.append("> **Atenção:** há uma diferença importante entre as bases de dados:")
    linhas.append("")
    linhas.append(f"- O comparativo de campanhas (`Guzela/comparativo-campanhas-cohort.csv`) reporta **{int(vendas_total_comparativo)} vendas** para o período.")
    linhas.append(f"- O CSV de comprantes (`exports/comprantes-2026.csv`) contém **{int(total_vendas_csv)} vendas de tráfego pago** no mesmo período, "
                  f"sendo **{len(vendas_cohort)}** nas campanhas 9/12/32 e **{len(vendas_outras)}** em outras campanhas de tráfego.")
    linhas.append("")
    linhas.append("Isso pode ocorrer por:")
    linhas.append("1. Diferença na classificação de `utm_sources` entre a tabela do Supabase e o critério usado aqui.")
    linhas.append("2. O comparativo considera apenas as campanhas 9, 12 e 32; outras campanhas pagas (17, 21, 27, 30) podem ter investimento não capturado.")
    linhas.append("3. Atraso na atualização de `data_pagamento_entrada` ou diferença de critério entre a exportação do CSV e o script do comparativo.")
    linhas.append("")
    linhas.append(f"Para contornar isso, apliquei um **fator de correção uniforme de {fator_correcao:.2f}x** "
                  f"({total_vendas_csv}/{int(vendas_total_comparativo)}) sobre o CPV estimado. "
                  "Essa correção assume que a distribuição geográfica das vendas não contadas no comparativo "
                  "é igual às vendas contadas — o que pode não ser verdade.")
    linhas.append("")
    linhas.append("## Metodologia de alocação")
    linhas.append("")
    linhas.append("> **Importante:** o Meta Ads não nos entrega investimento por estado. "
                  "O CPV por estado abaixo é uma estimativa obtida alocando o investimento total "
                  "por diferentes proxies. Os métodos produzem resultados diferentes e devem ser "
                  "interpretados em conjunto.")
    linhas.append("")
    linhas.append("### Métodos utilizados")
    linhas.append("")
    linhas.append("1. **Proporcional às vendas:** cada estado 'paga' de acordo com quantas vendas gerou. "
                  "Neste método, o CPV é igual em todos os estados (CPV médio não ajustado).")
    linhas.append("2. **Proporcional ao faturamento:** cada estado 'paga' de acordo com a receita que gerou. "
                  "Estados com ticket médio mais alto ficam com CPV maior.")
    linhas.append("3. **Proporcional aos MQLs:** inferimos o estado dos MQLs pelo DDD do telefone e "
                  "alocamos o investimento proporcionalmente. CPV = investimento alocado / vendas do estado. "
                  "Estados com melhor conversão MQL→venda aparecem com CPV menor.")
    linhas.append("")
    linhas.append("### Leitura das colunas de CPV")
    linhas.append("")
    linhas.append("- **CPV (método):** estimativa bruta usando o investimento do comparativo dividido pelas vendas do estado.")
    linhas.append("- **CPV ajustado (método):** CPV bruto multiplicado pelo fator de correção ({:.2f}x) para refletir o CPV médio real do comparativo.".format(fator_correcao))
    linhas.append("")
    linhas.append("## Resultado por estado")
    linhas.append("")
    linhas.append("| UF | Região | Vendas | MQLs | Faturamento | Ticket Médio | % Vendas | % Fat | "
                  "CPV (vendas) | CPV ajust. | CPV (fat) | CPV ajust. | CPV (MQLs) | CPV ajust. |")
    linhas.append("|----|--------|-------:|-----:|------------:|-------------:|---------:|------:|"
                  "-------------:|-----------:|----------:|-----------:|-----------:|-----------:|")

    for _, row in df_estado.iterrows():
        uf = row["uf"] if pd.notna(row["uf"]) else "—"
        regiao = row["regiao"] if pd.notna(row["regiao"]) else "—"
        cpv_mqls = f"{formatar_moeda(row['cpv_por_mqls'])}" if row["mqls"] > 0 else "—"
        cpv_mqls_adj = f"{formatar_moeda(row['cpv_por_mqls_ajustado'])}" if row["mqls"] > 0 else "—"
        linhas.append(
            f"| {uf} | {regiao} | {int(row['vendas'])} | {int(row['mqls'])} | "
            f"{formatar_moeda(row['faturamento'])} | {formatar_moeda(row['ticket_medio'])} | "
            f"{row['pct_vendas']:.1f}% | {row['pct_faturamento']:.1f}% | "
            f"{formatar_moeda(row['cpv_por_vendas'])} | {formatar_moeda(row['cpv_por_vendas_ajustado'])} | "
            f"{formatar_moeda(row['cpv_por_faturamento'])} | {formatar_moeda(row['cpv_por_faturamento_ajustado'])} | "
            f"{cpv_mqls} | {cpv_mqls_adj} |"
        )

    linhas.append("")
    linhas.append("## Resultado por região")
    linhas.append("")
    linhas.append("| Região | Vendas | MQLs | Faturamento | Ticket Médio | % Vendas | % Fat | "
                  "CPV (vendas) | CPV ajust. | CPV (fat) | CPV ajust. | CPV (MQLs) | CPV ajust. |")
    linhas.append("|--------|-------:|-----:|------------:|-------------:|---------:|------:|"
                  "-------------:|-----------:|----------:|-----------:|-----------:|-----------:|")

    for _, row in df_regiao.iterrows():
        regiao = row["regiao"] if pd.notna(row["regiao"]) else "—"
        cpv_mqls = f"{formatar_moeda(row['cpv_por_mqls'])}" if row["mqls"] > 0 else "—"
        cpv_mqls_adj = f"{formatar_moeda(row['cpv_por_mqls_ajustado'])}" if row["mqls"] > 0 else "—"
        linhas.append(
            f"| {regiao} | {int(row['vendas'])} | {int(row['mqls'])} | "
            f"{formatar_moeda(row['faturamento'])} | {formatar_moeda(row['ticket_medio'])} | "
            f"{row['pct_vendas']:.1f}% | {row['pct_faturamento']:.1f}% | "
            f"{formatar_moeda(row['cpv_por_vendas'])} | {formatar_moeda(row['cpv_por_vendas_ajustado'])} | "
            f"{formatar_moeda(row['cpv_por_faturamento'])} | {formatar_moeda(row['cpv_por_faturamento_ajustado'])} | "
            f"{cpv_mqls} | {cpv_mqls_adj} |"
        )

    linhas.append("")
    linhas.append("## Insights e cuidados")
    linhas.append("")
    linhas.append("- O **Sudeste** concentra a maior parte das vendas e do faturamento, o que é esperado "
                  "pelo tamanho do mercado e pela concentração de investimento em anúncios nessa região.")
    linhas.append("- Estados com poucas vendas (1–2) têm CPV muito volátil — uma única venda a mais ou a menos "
                  "muda completamente o número.")
    linhas.append("- O método **proporcional ao faturamento** pode ser útil quando queremos entender "
                  "quanto cada região 'custa' em relação ao valor que gera.")
    linhas.append("- O método **proporcional aos MQLs** depende da qualidade da inferência por DDD. "
                  "Alguns MQLs podem ter telefone incorreto ou DDD não mapeado.")
    linhas.append("- O **CPV ajustado** é uma aproximação. O valor real só pode ser obtido com o investimento "
                  "por estado diretamente da Meta Ads API.")
    linhas.append("")
    linhas.append("## Próximos passos recomendados")
    linhas.append("")
    linhas.append("1. **Alinhar as bases:** verificar por que o comparativo cohort reporta 16 vendas enquanto o CSV tem 39 vendas de tráfego.")
    linhas.append("2. **Validar na tabela `utm_sources`** quais sources realmente são tráfego pago.")
    linhas.append("3. **Extrair do Meta Ads API** os insights com breakdown por região para obter investimento real por estado.")
    linhas.append("4. **Cruzar campanha/criativo** com estado da venda para identificar criativos que performam melhor em cada região.")
    linhas.append("")
    linhas.append("---")
    linhas.append("")
    linhas.append(f"Arquivos gerados: `{OUTPUT_CSV.name}` e `{OUTPUT_DIR / 'cpv-por-regiao-agregado-2026.csv'}`.")

    OUTPUT_MD.write_text("\n".join(linhas), encoding="utf-8")


# ─── Main ────────────────────────────────────────────────────────────────────


def main():
    print("Carregando dados...")
    comprantes, mqls, investimento = carregar_dados()

    # Totais do cohort
    investimento_total = investimento["Investimento"].sum()
    vendas_total = investimento["Total_Vendas"].sum()
    faturamento_total = investimento["Total_Faturado"].sum()

    print(f"Investimento total: {formatar_moeda(investimento_total)}")
    print(f"Vendas totais: {int(vendas_total)} | Faturamento: {formatar_moeda(faturamento_total)}")

    print("Preparando comprantes e MQLs...")
    df_comp = preparar_comprantes(comprantes)
    df_mql = preparar_mqls(mqls)

    print("Calculando métricas por estado...")
    df_estado, modo, total_vendas_csv, fator_correcao = calcular_metricas(df_comp, df_mql, investimento_total, vendas_total)

    print("Calculando métricas por região...")
    df_regiao = calcular_metricas_por_regiao(df_comp, df_mql, investimento_total, vendas_total)

    print("Salvando arquivos...")
    salvar_csv(df_estado, df_regiao)
    gerar_relatorio(df_comp, df_mql, df_estado, df_regiao, investimento_total, vendas_total, faturamento_total, modo, total_vendas_csv, fator_correcao)

    print(f"\n✅ Análise concluída. Modo: {modo}")
    print(f"   CSV por estado: {OUTPUT_CSV}")
    print(f"   CSV por região: {OUTPUT_DIR / 'cpv-por-regiao-agregado-2026.csv'}")
    print(f"   Relatório: {OUTPUT_MD}")


if __name__ == "__main__":
    main()
