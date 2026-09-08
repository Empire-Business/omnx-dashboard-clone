#!/usr/bin/env python3
"""Análise de Persona — MQLs e Comprantes 2026"""

import csv
import os
import re
from collections import Counter
from datetime import datetime, date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS = os.path.join(ROOT, 'exports')
MQLS_CSV = os.path.join(EXPORTS, 'mqls-2026.csv')
BUYERS_CSV = os.path.join(EXPORTS, 'comprantes-2026.csv')
OUT_MQLS = os.path.join(EXPORTS, 'analise-persona-mqls-2026.md')
OUT_BUYERS = os.path.join(EXPORTS, 'analise-persona-comprantes-2026.md')

NOW = datetime.now().strftime('%d/%m/%Y %H:%M')

STOPWORDS = {
    'e','de','do','da','dos','das','o','a','os','as','um','uma','uns','umas',
    'em','no','na','nos','nas','por','para','com','sem','que','se','é','ao',
    'já','ou','mas','mais','muito','tem','ter','meu','minha','meus','minhas',
    'seu','sua','seus','suas','não','como','quando','onde','quem','qual','quais',
    'isso','esse','essa','esses','essas','este','esta','isto','aqui','lá',
    'eu','ele','ela','nós','eles','elas','você','vocês','me','te','nos',
    'foi','ser','estar','vai','vou','tenho','tenha','todo','toda','todos','todas',
    'só','também','ainda','porque','então','assim','pra','pro','até','sobre',
    'ser','que','para','com','uma','seu','sua','não','como','mais','muito',
}

def load_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return list(reader)

def pct(n, total):
    if not total:
        return '0%'
    return f'{round(n/total*100)}%'

def top_values(rows, field, top_n=15, min_count=1):
    freq = Counter()
    for row in rows:
        v = (row.get(field) or '').strip()
        if v:
            freq[v] += 1
    return [(v, c) for v, c in freq.most_common(top_n) if c >= min_count]

def top_tags(rows, top_n=25):
    freq = Counter()
    for row in rows:
        tags_str = (row.get('tags') or '').strip()
        for tag in tags_str.split(','):
            t = tag.strip().lower()
            if t and len(t) > 1:
                # Filtrar tags que são claramente dados errados (timestamps, UUIDs, números longos)
                if re.match(r'^\d{4}-\d{2}-\d{2}', t): continue
                if re.match(r'^[a-f0-9]{20,}$', t): continue
                if len(t) > 50: continue
                freq[t] += 1
    return freq.most_common(top_n)

def count_field(rows, field):
    return sum(1 for r in rows if (r.get(field) or '').strip())

def sample_quotes(rows, field, n=6, min_len=15):
    samples = []
    for row in rows:
        v = (row.get(field) or '').strip()
        if len(v) >= min_len:
            # Limpar o texto para exibição (primeiras 200 chars)
            clean = v.replace('\n', ' ').replace('\r', '')[:250]
            samples.append(clean)
        if len(samples) >= n:
            break
    return samples

def parse_date(d_str):
    if not d_str:
        return None
    for fmt in ['%Y-%m-%dT%H:%M:%S.%f%z', '%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d']:
        try:
            from datetime import datetime, timezone
            if 'T' in d_str:
                return datetime.fromisoformat(d_str.replace('Z', '+00:00'))
            else:
                return datetime.strptime(d_str, '%Y-%m-%d')
        except:
            pass
    return None

def days_between(d1_str, d2_str):
    d1 = parse_date(d1_str)
    d2 = parse_date(d2_str)
    if d1 and d2:
        diff = abs((d2 - d1).days) if hasattr(d2 - d1, 'days') else abs(int((d2 - d1).total_seconds() / 86400))
        return diff
    return None

def filter_valid_utm(value):
    """Retorna True se o valor parece ser um código UTM válido (não lixo de dados)"""
    if not value:
        return False
    # Filtrar timestamps, textos longos, UUIDs longos
    if re.match(r'^\d{4}-\d{2}-\d{2}', value): return False
    if len(value) > 60: return False
    if re.match(r'^[A-Za-z0-9]{20,}$', value) and not re.match(r'^(iads|iorg|vdir|form)', value): return False
    return True

def top_utm(rows, field, top_n=12):
    freq = Counter()
    for row in rows:
        v = (row.get(field) or '').strip()
        if v and filter_valid_utm(v):
            freq[v] += 1
    return freq.most_common(top_n)

# ─── Gerador do relatório ─────────────────────────────────────────────────────
def generate_report(rows, label, is_buyers=False):
    total = len(rows)
    lines = []

    def h(level, text):
        lines.append('#' * level + ' ' + text)
        lines.append('')

    def p(text):
        lines.append(text)
        lines.append('')

    def li(text):
        lines.append(f'- {text}')

    def quote(text):
        lines.append(f'> "{text}"')
        lines.append('')

    def sep():
        lines.append('---')
        lines.append('')

    h(1, f'Análise de Persona — {label}')
    p(f'**Total de registros analisados:** {total}')
    p(f'**Data de geração:** {NOW}')
    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '1. INTRODUÇÃO — Perfil Geral')
    lines.append('')

    # País
    h(3, 'País de Origem')
    country_vals = [(v, c) for v, c in top_values(rows, 'country', 10) if len(v) <= 10]
    if country_vals:
        for v, cnt in country_vals:
            li(f'**{v}** — {cnt} leads ({pct(cnt, total)})')
    else:
        lines.append('_Dados não disponíveis_')
    lines.append('')

    # Canal
    h(3, 'Canal de Origem (utm_source) — De onde vêm esses leads?')
    utm_src = top_utm(rows, 'utm_source', 12)
    if utm_src:
        for v, cnt in utm_src:
            li(f'`{v}` — {cnt} leads ({pct(cnt, total)})')
    else:
        lines.append('_Dados não disponíveis_')
    lines.append('')

    # Campanha
    h(3, 'Campanha de Origem (utm_campaign)')
    utm_camp = top_utm(rows, 'utm_campaign', 12)
    if utm_camp:
        for v, cnt in utm_camp:
            li(f'`{v}` — {cnt} leads ({pct(cnt, total)})')
    else:
        lines.append('_Dados não disponíveis_')
    lines.append('')

    # Conteúdo
    h(3, 'Anúncio/Conteúdo (utm_content) — Quais criativos atraem mais?')
    utm_cont = top_utm(rows, 'utm_content', 12)
    if utm_cont:
        for v, cnt in utm_cont:
            li(f'`{v}` — {cnt} leads ({pct(cnt, total)})')
    else:
        lines.append('_Dados não disponíveis_')
    lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '2. CONEXÃO — Segmentação por Tags e Pipeline')
    p('_As tags revelam a jornada, segmento e comportamento de cada lead._')
    lines.append('')

    h(3, 'Top Tags na Base')
    tags_data = top_tags(rows, 25)
    if tags_data:
        for tag, cnt in tags_data:
            li(f'`{tag}` — {cnt}x ({pct(cnt, total)} dos leads)')
    else:
        lines.append('_Dados não disponíveis_')
    lines.append('')

    h(3, 'Pipeline de Origem (onde estão no funil)')
    pipe_vals = [(v, c) for v, c in top_values(rows, 'pipeline_name', 10) if len(v) < 60]
    for v, cnt in pipe_vals:
        li(f'**{v}** — {cnt} leads ({pct(cnt, total)})')
    lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '3. OBSTÁCULOS — Jornada pelo Funil (Onde Travam?)')
    lines.append('')

    tentativa1 = count_field(rows, 'data_tentativa_1')
    conectado = count_field(rows, 'data_conectado')
    agendado_mql = count_field(rows, 'data_agendamento_reuniao')
    reuniao_agendada = count_field(rows, 'data_reuniao_agendada')
    agendado = max(agendado_mql, reuniao_agendada)
    realizado = count_field(rows, 'data_realizacao_vendas')
    no_show = count_field(rows, 'data_no_show') + count_field(rows, 'data_no_show_vendas')
    perdido = count_field(rows, 'data_perdido') + count_field(rows, 'data_perdido_vendas')
    fechado = count_field(rows, 'data_fechado')

    h(3, 'Funil de Conversão — Taxa de Avanço em Cada Etapa')
    li(f'**Total de leads:** {total} (100%)')
    if tentativa1 > 0:
        li(f'**Pelo menos 1 tentativa de contato:** {tentativa1} ({pct(tentativa1, total)})')
    li(f'**Conectados (conseguiram falar):** {conectado} ({pct(conectado, total)})')
    li(f'**Reunião MQL agendada:** {agendado} ({pct(agendado, total)})')
    li(f'**Reunião de vendas realizada:** {realizado} ({pct(realizado, total)})')
    li(f'**No-shows (MQL + Vendas):** {no_show} ({pct(no_show, total)})')
    li(f'**Leads perdidos (MQL + Vendas):** {perdido} ({pct(perdido, total)})')
    if fechado > 0:
        li(f'**Fechados:** {fechado} ({pct(fechado, total)})')
    lines.append('')

    h(3, 'Status Atual das Oportunidades')
    status_vals = [(v, c) for v, c in top_values(rows, 'status', 10) if v in ('open', 'won', 'lost', 'abandoned')]
    for v, cnt in status_vals:
        li(f'**{v}** — {cnt} ({pct(cnt, total)})')
    lines.append('')

    h(3, 'Motivos de Perda (lost_reason)')
    lost_rows = [r for r in rows if (r.get('lost_reason') or '').strip()]
    p(f'_{len(lost_rows)} leads com motivo de perda registrado ({pct(len(lost_rows), total)} do total)_')
    lines.append('')
    for v, cnt in top_values(lost_rows, 'lost_reason', 15):
        if len(v) < 100:
            li(f'**"{v}"** — {cnt}x')
    lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '4. MEDOS — Análise de No-shows e Perdas por Canal')
    lines.append('')

    h(3, 'Análise de No-shows')
    no_show_mql = count_field(rows, 'data_no_show')
    no_show_vendas = count_field(rows, 'data_no_show_vendas')
    li(f'No-shows pré-vendas (MQL): **{no_show_mql}** ({pct(no_show_mql, total)})')
    li(f'No-shows vendas: **{no_show_vendas}** ({pct(no_show_vendas, total)})')
    li(f'Total no-shows: **{no_show_mql + no_show_vendas}** ({pct(no_show_mql + no_show_vendas, total)})')
    lines.append('')

    h(3, 'Canal com maior taxa de perda (mínimo 20 leads no canal)')
    perda_by_source = {}
    for row in rows:
        src = (row.get('utm_source') or 'desconhecido').strip()
        if not filter_valid_utm(src): continue
        if src not in perda_by_source:
            perda_by_source[src] = {'total': 0, 'perdido': 0}
        perda_by_source[src]['total'] += 1
        if (row.get('data_perdido') or '').strip() or (row.get('data_perdido_vendas') or '').strip():
            perda_by_source[src]['perdido'] += 1

    ranking = [(src, d) for src, d in perda_by_source.items() if d['total'] >= 20]
    ranking.sort(key=lambda x: x[1]['perdido'] / x[1]['total'], reverse=True)
    for src, d in ranking[:10]:
        taxa = d['perdido'] / d['total']
        li(f'`{src}` — {d["perdido"]}/{d["total"]} perdidos ({pct(d["perdido"], d["total"])} taxa de perda)')
    lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '5. SUSPEITAS CONFIRMADAS — Atribuição TikTok vs Meta')
    lines.append('')

    com_tt = sum(1 for r in rows if (r.get('tt_source') or '').strip() and filter_valid_utm(r.get('tt_source') or ''))
    li(f'**Leads com atribuição TikTok:** {com_tt} ({pct(com_tt, total)})')
    li(f'**Leads sem atribuição TikTok:** {total - com_tt} ({pct(total - com_tt, total)})')
    lines.append('')

    h(3, 'Top Origem TikTok (tt_source)')
    tt_src = top_utm(rows, 'tt_source', 8)
    for v, cnt in tt_src:
        li(f'`{v}` — {cnt} ({pct(cnt, total)})')
    if not tt_src:
        lines.append('_Sem dados TikTok_')
    lines.append('')

    h(3, 'Top Campanha TikTok (tt_campaign)')
    tt_camp = top_utm(rows, 'tt_campaign', 8)
    for v, cnt in tt_camp:
        li(f'`{v}` — {cnt} ({pct(cnt, total)})')
    if not tt_camp:
        lines.append('_Sem dados TikTok_')
    lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '6. SONHOS — Perfil da Equipe Comercial')
    lines.append('')

    h(3, 'SDRs com mais leads')
    sdr_rows = [r for r in rows if (r.get('sdr_name') or '').strip()]
    p(f'_{len(sdr_rows)} leads com SDR identificado ({pct(len(sdr_rows), total)})_')
    lines.append('')
    for v, cnt in top_values(sdr_rows, 'sdr_name', 10):
        if len(v) < 60:
            li(f'**{v}** — {cnt} leads ({pct(cnt, total)})')
    lines.append('')

    h(3, 'Closers com mais leads acompanhados')
    closer_rows = [r for r in rows if (r.get('vendedor_closer') or '').strip()]
    p(f'_{len(closer_rows)} leads com closer identificado ({pct(len(closer_rows), total)})_')
    lines.append('')
    for v, cnt in top_values(closer_rows, 'vendedor_closer', 10):
        if len(v) < 60:
            li(f'**{v}** — {cnt} leads ({pct(cnt, total)})')
    lines.append('')

    h(3, 'Owners/SDRs Responsáveis (owner_name)')
    for v, cnt in top_values(rows, 'owner_name', 10):
        if len(v) < 60:
            li(f'**{v}** — {cnt} leads ({pct(cnt, total)})')
    lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '7. NOVA OPORTUNIDADE — Slide da Régua (Público-Alvo)')
    lines.append('')

    h(3, 'Distribuição Temporal — Quando Chegam os Leads?')
    by_month = Counter()
    for row in rows:
        d = (row.get('data_lead_recebido') or row.get('data_pagamento_entrada') or '')[:7]
        if re.match(r'^\d{4}-\d{2}$', d):
            by_month[d] += 1
    for month in sorted(by_month.keys()):
        cnt = by_month[month]
        li(f'**{month}:** {cnt} leads ({pct(cnt, total)})')
    lines.append('')

    h(3, 'Lead por Canal — Convergência do Público')
    utm_main = top_utm(rows, 'utm_source', 5)
    for v, cnt in utm_main:
        # Taxa de conexão por canal
        canal_rows = [r for r in rows if (r.get('utm_source') or '').strip() == v]
        canal_conectado = sum(1 for r in canal_rows if (r.get('data_conectado') or '').strip())
        canal_agendado = sum(1 for r in canal_rows if (r.get('data_agendamento_reuniao') or r.get('data_reuniao_agendada') or '').strip())
        li(f'**`{v}`** → {cnt} leads | Conectados: {canal_conectado} ({pct(canal_conectado, cnt)}) | Agendados: {canal_agendado} ({pct(canal_agendado, cnt)})')
    lines.append('')

    # ─── Seção exclusiva de comprantes ───────────────────────────────────
    if is_buyers:
        sep()
        h(2, '8. COMPRANTES — Análise Financeira e Comportamental')
        lines.append('')

        h(3, 'Produtos Vendidos')
        for v, cnt in top_values(rows, 'produto_vendido', 10):
            if v and len(v) < 80:
                li(f'**{v}** — {cnt}x ({pct(cnt, total)})')
        lines.append('')

        h(3, 'Formas de Pagamento')
        for v, cnt in top_values(rows, 'forma_pagamento', 8):
            if v and len(v) < 60:
                li(f'**{v}** — {cnt}x ({pct(cnt, total)})')
        lines.append('')

        h(3, 'Estado (UF) dos Comprantes')
        for v, cnt in top_values(rows, 'estado_uf', 15):
            if v and len(v) < 40:
                li(f'**{v}** — {cnt}x ({pct(cnt, total)})')
        lines.append('')

        h(3, 'Cidade dos Comprantes')
        for v, cnt in top_values(rows, 'municipio', 12):
            if v and len(v) < 40:
                li(f'**{v}** — {cnt}x')
        lines.append('')

        # Métricas financeiras
        valores = [float(r.get('valor_faturado') or 0) for r in rows if (r.get('valor_faturado') or '').strip()]
        valores = [v for v in valores if v > 0]
        if valores:
            soma = sum(valores)
            media = soma / len(valores)
            sorted_v = sorted(valores)
            mediana = sorted_v[len(sorted_v) // 2]
            h(3, 'Métricas Financeiras')
            li(f'Total faturado: **R$ {soma:,.2f}**'.replace(',', 'X').replace('.', ',').replace('X', '.'))
            li(f'Ticket médio: **R$ {media:,.2f}**'.replace(',', 'X').replace('.', ',').replace('X', '.'))
            li(f'Ticket mediana: **R$ {mediana:,.2f}**'.replace(',', 'X').replace('.', ',').replace('X', '.'))
            li(f'Ticket mínimo: **R$ {sorted_v[0]:,.2f}**'.replace(',', 'X').replace('.', ',').replace('X', '.'))
            li(f'Ticket máximo: **R$ {sorted_v[-1]:,.2f}**'.replace(',', 'X').replace('.', ',').replace('X', '.'))
            li(f'Comprantes com valor registrado: **{len(valores)}/{total}**')
            lines.append('')

            h(3, 'Distribuição por Faixa de Ticket')
            faixas = [
                ('Até R$5.000', 0, 5000),
                ('R$5.001–R$10.000', 5001, 10000),
                ('R$10.001–R$20.000', 10001, 20000),
                ('R$20.001–R$30.000', 20001, 30000),
                ('R$30.001–R$50.000', 30001, 50000),
                ('Acima de R$50.000', 50001, float('inf')),
            ]
            for label_f, min_v, max_v in faixas:
                n = sum(1 for v in valores if min_v <= v <= max_v)
                if n > 0:
                    li(f'**{label_f}** — {n}x ({pct(n, len(valores))})')
            lines.append('')

        h(3, 'Ciclo de Vendas (lead → pagamento)')
        ciclos = []
        for row in rows:
            d = days_between(row.get('data_lead_recebido'), row.get('data_pagamento_entrada'))
            if d is not None and 0 <= d <= 365:
                ciclos.append(d)
        if ciclos:
            media_c = round(sum(ciclos) / len(ciclos))
            sorted_c = sorted(ciclos)
            mediana_c = sorted_c[len(sorted_c) // 2]
            li(f'Ciclo médio lead→pagamento: **{media_c} dias**')
            li(f'Ciclo mediano lead→pagamento: **{mediana_c} dias**')
            li(f'Ciclo mínimo: **{sorted_c[0]} dias**')
            li(f'Ciclo máximo: **{sorted_c[-1]} dias**')
        lines.append('')

        h(3, 'Closers — Performance de Fechamento')
        closer_perf = {}
        for row in rows:
            closer = (row.get('vendedor_closer') or '').strip()
            if not closer or len(closer) > 60: continue
            if closer not in closer_perf:
                closer_perf[closer] = {'vendas': 0, 'total': 0.0}
            closer_perf[closer]['vendas'] += 1
            val = float(row.get('valor_faturado') or 0)
            closer_perf[closer]['total'] += val
        for closer, d in sorted(closer_perf.items(), key=lambda x: x[1]['vendas'], reverse=True):
            total_str = f'{d["total"]:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
            li(f'**{closer}** — {d["vendas"]} vendas | Total: R$ {total_str}')
        lines.append('')

        h(3, 'Resumos IA e Percepções dos Closers (amostra)')
        for q in sample_quotes(rows, 'resumo_ia', 5):
            quote(q)
        for q in sample_quotes(rows, 'percepcao_closer', 5):
            quote(q)

    sep()
    final_section = '9' if is_buyers else '8'
    h(2, f'{final_section}. OBSERVAÇÕES E CAMPOS DISPONÍVEIS')
    lines.append('> **Campos quantitativos com dados:** `utm_source`, `utm_campaign`, `utm_content`, `utm_medium`, `utm_term`, `tt_source`, `tt_campaign`, `tags`, `pipeline_name`, `status`, `lost_reason`, `sdr_name`, `vendedor_closer`, `owner_name`, datas do funil, `country`, `nome`, `email`, `telefone`.')
    lines.append('')
    lines.append('> **Campos de pesquisa de persona (vazios):** `visao_6_meses`, `obstaculos`, `preciso_ajuda_para`, `tipo_empresa`, `faturamento_anual`, `situacao_atual`, `possiveis_objecoes`, `swot_*`, `follow_up_*`, `comunicacao_*`, `analise_*` — estes campos existem no banco mas **não foram preenchidos** via formulário de aplicação. Para análise qualitativa profunda, é necessário ativar o formulário de aplicação e mapear as respostas.')
    lines.append('')

    return '\n'.join(lines)


if __name__ == '__main__':
    import sys

    if not os.path.exists(MQLS_CSV):
        print(f'❌ Arquivo não encontrado: {MQLS_CSV}')
        print('   Execute primeiro: node scripts/export-mqls-2026.js')
        sys.exit(1)
    if not os.path.exists(BUYERS_CSV):
        print(f'❌ Arquivo não encontrado: {BUYERS_CSV}')
        print('   Execute primeiro: node scripts/export-buyers-2026.js')
        sys.exit(1)

    print('📊 Analisando MQLs de 2026...')
    mql_rows = load_csv(MQLS_CSV)
    print(f'   {len(mql_rows)} MQLs carregados')
    mql_report = generate_report(mql_rows, 'MQLs de 2026', is_buyers=False)
    with open(OUT_MQLS, 'w', encoding='utf-8') as f:
        f.write(mql_report)
    print(f'   ✅ Relatório salvo: {OUT_MQLS}')

    print()
    print('📊 Analisando Comprantes de 2026...')
    buyer_rows = load_csv(BUYERS_CSV)
    print(f'   {len(buyer_rows)} comprantes carregados')
    buyer_report = generate_report(buyer_rows, 'Comprantes de 2026', is_buyers=True)
    with open(OUT_BUYERS, 'w', encoding='utf-8') as f:
        f.write(buyer_report)
    print(f'   ✅ Relatório salvo: {OUT_BUYERS}')

    print()
    print('✅ Análise de persona concluída!')
    print(f'   - {OUT_MQLS}')
    print(f'   - {OUT_BUYERS}')
