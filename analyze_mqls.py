#!/usr/bin/env python3
"""
Análise de Discrepância MQLs — Gabarito vs Banco de Dados
Compara 82 MQLs do formulário com os dados de tags no Supabase
"""

import csv
import json
import os
import sys
from datetime import datetime, timedelta
from typing import Optional

# Ler arquivo CSV do gabarito
CSV_PATH = "/Users/bguzela/Desenvolvimento/GHL-SUPABASE/gabarito/mqls_fev_26.csv"

def extract_email_from_csv():
    """Extrai emails, nomes e whatsapp do gabarito CSV"""
    leads = []

    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            email = row.get("Seu e-mail corporativo", "").strip().lower()
            nome = row.get("Qual é o seu nome completo?", "").strip()
            whatsapp = row.get("Whastapp (com DDD)", "").strip()
            data_str = row.get("Submission Date", "").strip()
            utm_source = row.get("utm_source", "").strip()

            if email and "@" in email:  # Validar email
                leads.append({
                    "email": email,
                    "nome": nome,
                    "whatsapp": whatsapp,
                    "data_formulario": data_str,
                    "utm_source": utm_source
                })

    return leads

def parse_submission_date(date_str: str) -> Optional[str]:
    """Converte 'Feb 26th 2026, 10:01 pm' para 'YYYY-MM-DD'"""
    if not date_str:
        return None
    try:
        # Remover o ordinal (th, st, nd, rd) e processar
        date_clean = date_str.replace("th", "").replace("st", "").replace("nd", "").replace("rd", "").strip()
        dt = datetime.strptime(date_clean, "%b %d %Y, %I:%M %p")
        return dt.strftime("%Y-%m-%d")
    except:
        return None

def main():
    print("=" * 80)
    print("ANÁLISE DE DISCREPÂNCIA MQLs — GABARITO vs BANCO DE DADOS")
    print("=" * 80)

    # FASE 1: Extrair dados do gabarito
    print("\n📋 FASE 1: Extraindo dados do gabarito...")
    leads = extract_email_from_csv()
    print(f"✅ Extraídos {len(leads)} MQLs do gabarito")

    if not leads:
        print("❌ Nenhum lead extraído do CSV!")
        sys.exit(1)

    # Salvar em JSON para referência
    output_json = {
        "total": len(leads),
        "extração_data": datetime.now().isoformat(),
        "leads": leads
    }

    json_path = "/tmp/mqls_gabarito.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(output_json, f, ensure_ascii=False, indent=2)
    print(f"💾 Dados salvos em: {json_path}")

    # FASE 2: Preparar SQL query para buscar no Supabase
    print("\n🔍 FASE 2: Preparando para buscar no Supabase...")

    # Criar lista de emails para o SQL IN
    email_list = [lead["email"] for lead in leads]
    email_list_str = "', '".join(email_list)

    sql_query = f"""
    SELECT
        c.id,
        c.nome,
        c.email,
        c.tags,
        c.whatsapp,
        o.data_lead_recebido::DATE as data_lead_recebido
    FROM contatos c
    LEFT JOIN oportunidades o ON o.contato_id = c.id
    WHERE c.email IN ('{email_list_str}')
    ORDER BY c.email
    """

    print(f"📝 SQL Query gerada (para execução manual no Supabase):")
    print("-" * 80)
    print(sql_query)
    print("-" * 80)

    # FASE 3: Salvar instruções para busca manual
    print("\n📌 FASE 3: Instruções para busca no Supabase...")

    instructions = """
## Para executar a análise:

1. **Copie a query SQL acima**
2. Abra o Supabase console em: https://supabase.com/dashboard
3. Vá para SQL Editor → New Query
4. Cole a query e execute
5. Exporte os resultados como JSON
6. Salve o resultado em: /tmp/supabase_results.json
7. Execute novamente este script com: python analyze_mqls.py --merge

---

## GABARITO EXTRAÍDO (82 MQLs)

Arquivo: /tmp/mqls_gabarito.json
Emails únicos: {len(set(lead['email'] for lead in leads))}

Amostra (primeiros 5):
"""

    for i, lead in enumerate(leads[:5], 1):
        instructions += f"\n{i}. {lead['nome']} | {lead['email']}"

    instructions += "\n\n..."

    print(instructions)

    # Salvar instruções
    instr_path = "/tmp/MQL_ANALYSIS_INSTRUCTIONS.md"
    with open(instr_path, 'w', encoding='utf-8') as f:
        f.write(instructions)

    print(f"💾 Instruções salvas em: {instr_path}")

    # FASE 4: Resumo estatístico
    print("\n📊 FASE 4: Estatísticas do gabarito")
    print("-" * 80)
    print(f"Total de leads:           {len(leads)}")
    print(f"Emails únicos:            {len(set(lead['email'] for lead in leads))}")
    print(f"Com WhatsApp válido:      {sum(1 for l in leads if l['whatsapp'] and len(l['whatsapp']) > 5)}")
    print(f"Com utm_source:           {sum(1 for l in leads if l['utm_source'])}")

    # Distribuição por mês (esperado: todos fevereiro)
    months = {}
    for lead in leads:
        date = parse_submission_date(lead['data_formulario'])
        if date:
            month = date[:7]  # YYYY-MM
            months[month] = months.get(month, 0) + 1

    print(f"\nDistribuição por mês:")
    for month in sorted(months.keys()):
        print(f"  {month}: {months[month]} leads")

    print("\n✅ Próxima etapa: Buscar dados no Supabase com a query acima")
    print("=" * 80)

if __name__ == "__main__":
    main()
