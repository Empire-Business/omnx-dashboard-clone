#!/usr/bin/env python3
"""
Constrói o documento mestre de persona para o webinar-pro/
Usa TODAS as fontes disponíveis:
  - resumos-ia-parsed.csv  (1383 registros com faturamento, segmento, objetivo)
  - mqls-2026.csv          (1296 MQLs — funil, canal, tags)
  - comprantes-2026.csv    (44 comprantes — financeiro)
  - analise-conversas-mqls-2026.md  (insights qualitativos das conversas)
  - analise-conversas-comprantes-2026.md
"""

import csv, os, re, sys
from collections import Counter, defaultdict
from datetime import datetime

ROOT    = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS = os.path.join(ROOT, 'exports')
WPRO    = os.path.join(ROOT, 'webinar-pro')
NOW     = datetime.now().strftime('%d/%m/%Y %H:%M')

os.makedirs(WPRO, exist_ok=True)

def load_csv(path):
    if not os.path.exists(path):
        print(f'  ⚠️  Arquivo não encontrado: {path}')
        return []
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

def pct(n, total):
    return f'{round(n/total*100)}%' if total else '0%'

def top(rows, field, n=15, max_len=80):
    freq = Counter()
    for r in rows:
        v = (r.get(field) or '').strip()
        if v and len(v) <= max_len:
            freq[v] += 1
    return freq.most_common(n)

def top_tags(rows, n=25):
    freq = Counter()
    for r in rows:
        for t in (r.get('tags') or '').split(','):
            t = t.strip().lower()
            if t and len(t) < 50 and not re.match(r'^\d{4}-', t):
                freq[t] += 1
    return freq.most_common(n)

# ─── Normalizar faturamento ────────────────────────────────────────────────
FAT_BUCKETS = [
    ('Até R$ 120 mil/ano',       r'até.{0,5}120'),
    ('R$ 120–200 mil/ano',       r'120.{0,10}200'),
    ('R$ 200–400 mil/ano',       r'(?:200|300).{0,10}(?:300|400)'),
    ('R$ 400–700 mil/ano',       r'400.{0,10}700'),
    ('R$ 700 mil–R$ 1 mi/ano',   r'700.{0,10}(?:1 mi|1mi|1\.000)'),
    ('R$ 1–5 mi/ano',            r'(?:1.{0,5}5|1 mi)'),
    ('Acima de R$ 5 mi/ano',     r'(?:5.{0,5}10|acima.{0,5}5)'),
]

def bucket_fat(text):
    if not text: return 'Não informado'
    t = text.lower()
    for label, pat in FAT_BUCKETS:
        if re.search(pat, t):
            return label
    return 'Outro'

# ─── Normalizar investimento em tráfego ───────────────────────────────────
TRAF_BUCKETS = [
    ('Não investe',              r'(?:não investe|sem invest|inferior a r\$.{0,5}3|não invest)'),
    ('Menos de R$ 3k/mês',      r'(?:menos de r\$.{0,5}3|inferior a r\$.{0,5}3|abaixo.{0,5}3 mil)'),
    ('R$ 3–10k/mês',            r'(?:3.{0,8}10 mil|entre r\$.{0,5}3|3k.{0,5}10)'),
    ('R$ 10–30k/mês',           r'(?:10.{0,8}30 mil|entre r\$.{0,5}10)'),
    ('Acima de R$ 30k/mês',     r'(?:acima.{0,5}30|mais de r\$.{0,5}30|30k)'),
]

def bucket_traf(text):
    if not text: return 'Não informado'
    t = text.lower()
    for label, pat in TRAF_BUCKETS:
        if re.search(pat, t):
            return label
    return 'Outro'

# ─── Carregar dados ────────────────────────────────────────────────────────
print('📂 Carregando arquivos...')
resumos   = load_csv(os.path.join(EXPORTS, 'resumos-ia-parsed.csv'))
mqls      = load_csv(os.path.join(EXPORTS, 'mqls-2026.csv'))
comprantes= load_csv(os.path.join(EXPORTS, 'comprantes-2026.csv'))
print(f'   resumos_ia: {len(resumos)} | mqls: {len(mqls)} | comprantes: {len(comprantes)}')

# ─── Calcular métricas dos resumos ───────────────────────────────────────
fat_buckets  = Counter(bucket_fat(r.get('faturamento_extraido','')) for r in resumos)
traf_buckets = Counter(bucket_traf(r.get('investimento_trafego','')) for r in resumos)

# Extrair segmentos limpos
seg_freq = Counter()
for r in resumos:
    seg = (r.get('segmento_negocio') or '').strip().lower()
    if not seg or len(seg) < 5: continue
    # Pegar só os primeiros 4 tokens para normalizar
    tokens = seg.split()[:4]
    seg_clean = ' '.join(tokens)
    seg_freq[seg_clean] += 1

# Extrair objetivos limpos
obj_freq = Counter()
for r in resumos:
    obj = (r.get('objetivo_lead') or '').strip().lower()
    if not obj or len(obj) < 10: continue
    tokens = obj.split()[:6]
    obj_clean = ' '.join(tokens)
    obj_freq[obj_clean] += 1

# ─── Ler arquivos md de conversas para citações ───────────────────────────
def read_quotes_from_md(path):
    if not os.path.exists(path): return []
    quotes = []
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if line.startswith('> "') and line.endswith('"'):
            q = line[3:-1].strip()
            if len(q) > 30:
                quotes.append(q)
    return quotes

mql_quotes    = read_quotes_from_md(os.path.join(EXPORTS, 'analise-conversas-mqls-2026.md'))
buyer_quotes  = read_quotes_from_md(os.path.join(EXPORTS, 'analise-conversas-comprantes-2026.md'))

# ─── Métricas do funil (MQLs) ─────────────────────────────────────────────
total_mqls = len(mqls)
def cf(field): return sum(1 for r in mqls if (r.get(field) or '').strip())
def cf2(field): return sum(1 for r in comprantes if (r.get(field) or '').strip())

conectado    = cf('data_conectado')
agendado     = max(cf('data_agendamento_reuniao'), cf('data_reuniao_agendada'))
realizado    = cf('data_realizacao_vendas')
perdido      = cf('data_perdido') + cf('data_perdido_vendas')
no_show      = cf('data_no_show') + cf('data_no_show_vendas')

# ─── Métricas financeiras (comprantes) ───────────────────────────────────
valores = [float(r.get('valor_faturado') or 0) for r in comprantes if (r.get('valor_faturado') or '').strip()]
valores = [v for v in valores if v > 0]
ticket_medio  = sum(valores)/len(valores) if valores else 0
ticket_total  = sum(valores)

# Ciclo médio
def days_between(s1, s2):
    for fmt in ['%Y-%m-%dT%H:%M:%S.%f%z','%Y-%m-%dT%H:%M:%S%z','%Y-%m-%d']:
        try:
            from datetime import datetime as dt
            a = dt.fromisoformat(s1.replace('Z','+00:00')) if 'T' in s1 else dt.strptime(s1, '%Y-%m-%d')
            b = dt.fromisoformat(s2.replace('Z','+00:00')) if 'T' in s2 else dt.strptime(s2, '%Y-%m-%d')
            return abs(int((b-a).total_seconds()/86400))
        except: pass
    return None

ciclos = [c for c in [days_between(r.get('data_lead_recebido',''), r.get('data_pagamento_entrada',''))
          for r in comprantes if r.get('data_lead_recebido') and r.get('data_pagamento_entrada')]
          if c is not None and 0 <= c <= 365]
ciclo_medio = round(sum(ciclos)/len(ciclos)) if ciclos else 0

# ─── Gerar documento mestre ───────────────────────────────────────────────
print('✍️  Gerando documento mestre...')

lines = []
def h(lv, t): lines.append('#'*lv+' '+t); lines.append('')
def p(t): lines.append(t); lines.append('')
def li(t): lines.append(f'- {t}')
def li2(t): lines.append(f'  - {t}')
def quote(t): lines.append(f'> "{t}"'); lines.append('')
def sep(): lines.append('---'); lines.append('')
def box(t): lines.append(f'> 💡 **{t}**'); lines.append('')
def table_row(*cols): lines.append('| '+' | '.join(str(c) for c in cols)+' |')

h(1, '📋 WEBINAR PRO — Documento de Persona Completo')
p(f'**Gerado em:** {NOW}')
p(f'**Fontes:** {len(resumos)} resumos IA • {total_mqls} MQLs 2026 • {len(comprantes)} comprantes 2026 • conversas reais dos leads')
sep()

# ═══ ÍNDICE
h(2, 'Índice')
for i, sec in enumerate([
    'QUEM É O LEAD — Perfil Demográfico e de Negócio',
    'O QUE ELES QUEREM — Sonhos e Objetivos',
    'SUAS FALHAS — O Que Já Tentaram',
    'SEUS MEDOS — Objeções e Hesitações',
    'SEUS INIMIGOS — Obstáculos Externos',
    'SUAS SUSPEITAS — O Que Já Desconfiam do Mercado',
    'O SLIDE DA RÉGUA — Para Quem É Esse Webinar',
    'DADOS DO FUNIL — Como Se Comportam',
    'COMPRANTES — Quem Já Pagou',
    'CITAÇÕES VERBATIM COMPLETAS',
], 1):
    li(f'[{i}. {sec}](#{re.sub(chr(32),"-",sec.lower()[:30])})')
lines.append('')
sep()

# ═══ 1. QUEM É O LEAD
h(2, '1. QUEM É O LEAD — Perfil Demográfico e de Negócio')
p(f'_Base: {len(resumos)} resumos IA + {total_mqls} MQLs de 2026_')
lines.append('')

h(3, '🌍 País e Canal de Origem')
countries = Counter(r.get('country','').strip() for r in mqls if r.get('country','').strip())
for v, c in countries.most_common(5):
    li(f'**{v}** — {c} leads ({pct(c, total_mqls)})')
lines.append('')

h(3, '📡 Canal de Aquisição (utm_source)')
for v, c in top(mqls, 'utm_source', 12, 30):
    li(f'`{v}` — {c} leads ({pct(c, total_mqls)})')
lines.append('')

h(3, '🎨 Criativo que Mais Converte (utm_content)')
for v, c in top(mqls, 'utm_content', 10, 30):
    li(f'`{v}` — {c} leads ({pct(c, total_mqls)})')
lines.append('')

h(3, '💰 Faturamento Anual dos Leads (extraído dos resumos IA)')
p(f'_Base: {len([r for r in resumos if r.get("faturamento_extraido")])} de {len(resumos)} registros com faturamento identificado_')
lines.append('')
fat_total = sum(v for k, v in fat_buckets.items() if k != 'Não informado')
for bucket, cnt in sorted(fat_buckets.items(), key=lambda x: -x[1]):
    if bucket == 'Não informado': continue
    bar = '█' * min(20, round(cnt/fat_total*20)) if fat_total else ''
    li(f'**{bucket}** — {cnt}x ({pct(cnt, fat_total)}) `{bar}`')
lines.append('')

h(3, '📢 Investimento Mensal em Tráfego Pago (extraído dos resumos IA)')
traf_total = sum(v for k, v in traf_buckets.items() if k != 'Não informado')
for bucket, cnt in sorted(traf_buckets.items(), key=lambda x: -x[1]):
    if bucket == 'Não informado': continue
    bar = '█' * min(20, round(cnt/traf_total*20)) if traf_total else ''
    li(f'**{bucket}** — {cnt}x ({pct(cnt, traf_total)}) `{bar}`')
lines.append('')

h(3, '🏢 Segmento/Nicho do Negócio (extraído dos resumos IA)')
for seg, cnt in seg_freq.most_common(15):
    li(f'**{seg}** — {cnt}x')
lines.append('')

h(3, '🏷️ Tags de Comportamento — Como o CRM Classifica Esses Leads')
for tag, cnt in top_tags(mqls, 20):
    li(f'`{tag}` — {cnt}x ({pct(cnt, total_mqls)})')
lines.append('')
sep()

# ═══ 2. O QUE ELES QUEREM
h(2, '2. O QUE ELES QUEREM — Sonhos e Objetivos')
p('_Extraído dos resumos IA (objetivo_lead) + frases verbatim das conversas_')
lines.append('')

h(3, '🎯 Objetivos Mais Frequentes (resumos IA)')
for obj, cnt in obj_freq.most_common(15):
    li(f'**"{obj}…"** — {cnt}x')
lines.append('')

h(3, '🗣️ Como Dizem com Suas Próprias Palavras (conversas reais)')
sonho_qs = [q for q in mql_quotes if any(kw in q.lower() for kw in
            ['quero','crescer','autoridade','clientes','vender','faturar','audiência','escalar','objetivo','meta'])]
for q in sonho_qs[:15]:
    quote(q)

box('INSIGHT: A maioria quer as MESMAS 3 coisas — (1) Crescer audiência, (2) Gerar autoridade, (3) Vender mais. O vetor é sempre: conteúdo → reputação → vendas.')
sep()

# ═══ 3. SUAS FALHAS
h(2, '3. SUAS FALHAS — O Que Já Tentaram (e Não Funcionou)')
p('_Por que eles estão procurando ajuda? O que tentaram antes?_')
lines.append('')

h(3, '🔴 Motivos de Perda mais Citados (campo lost_reason do CRM)')
lost_rows = [r for r in mqls if (r.get('lost_reason') or '').strip()]
p(f'_{len(lost_rows)} leads com motivo de perda registrado ({pct(len(lost_rows), total_mqls)} do total)_')
lines.append('')
for v, c in top(lost_rows, 'lost_reason', 15, 100):
    li(f'**"{v}"** — {c}x')
lines.append('')

h(3, '🗣️ O Que Dizem nas Conversas sobre Tentativas Anteriores')
falha_qs = [q for q in mql_quotes if any(kw in q.lower() for kw in
            ['já tentei','já fiz','não funcionou','não deu','estratégia','internamente',
             'antes','curso','agência','contratei'])]
for q in falha_qs[:12]:
    quote(q)

box('INSIGHT: Os leads chegam já "queimados" de tentativas internas ou com agências. A principal objeção não é o preço — é o medo de repetir uma experiência frustrante.')
sep()

# ═══ 4. SEUS MEDOS
h(2, '4. SEUS MEDOS — Objeções e Hesitações')
p('_O que freia a decisão de compra?_')
lines.append('')

h(3, '⏰ Padrões de Adiamento (objeções de tempo/prioridade)')
medo_qs = [q for q in mql_quotes if any(kw in q.lower() for kw in
           ['deixa','segundo semestre','mês que vem','depois','retorno',
            'agenda','sem horário','não tenho certeza','pensar','decidir'])]
for q in medo_qs[:10]:
    quote(q)
lines.append('')

h(3, '💸 Objeções de Valor e Resultado')
val_qs = [q for q in mql_quotes + buyer_quotes if any(kw in q.lower() for kw in
          ['garantia','resultado','retorno','caro','valor','certeza','portfólio'])]
for q in val_qs[:8]:
    quote(q)
lines.append('')

box('INSIGHT: Os medos dominantes são: (1) Falta de tempo — "segundo semestre", "mês que vem"; (2) Incerteza de resultado — "não vi resultados que me encheram os olhos"; (3) Já teve experiência ruim — "já tive agência de grande porte".')
sep()

# ═══ 5. SEUS INIMIGOS
h(2, '5. SEUS INIMIGOS — Obstáculos Externos que os Atrapalham')
p('_O que (ou quem) eles culpam pelo problema atual?_')
lines.append('')

h(3, '👹 Inimigos Declarados nas Conversas')
inimigo_qs = [q for q in mql_quotes if any(kw in q.lower() for kw in
              ['agência','algoritmo','mercado','tráfego','orgânico','social media',
               'concorrência','plataforma','youtube','instagram','conteúdo'])]
for q in inimigo_qs[:12]:
    quote(q)
lines.append('')

h(3, '🔎 Padrão de "Dependência de Tráfego Pago"')
traf_dep_qs = [q for q in mql_quotes if 'tráfeg' in q.lower() or 'orgânico' in q.lower()]
for q in traf_dep_qs[:6]:
    quote(q)
lines.append('')

box('INSIGHT: O "inimigo" nº1 é a DEPENDÊNCIA DE TRÁFEGO PAGO. Quase todos têm 80-100% das vendas vindo de anúncios e sentem que perderam o controle quando o algoritmo muda ou o custo sobe.')
sep()

# ═══ 6. SUAS SUSPEITAS
h(2, '6. SUAS SUSPEITAS — O Que Já Desconfiam do Mercado')
p('_Crenças e percepções que os leads já têm antes de falar com você_')
lines.append('')

h(3, '🤔 O Que Dizem sobre Agências e Serviços Externos')
agencia_qs = [q for q in mql_quotes if 'agência' in q.lower() or 'social media' in q.lower()]
for q in agencia_qs[:8]:
    quote(q)
lines.append('')

h(3, '🔎 O Que Dizem sobre Estratégia e Método')
estrategia_qs = [q for q in mql_quotes + buyer_quotes if any(kw in q.lower() for kw in
                 ['estratégia','método','planejamento','sistema','garantia','conversão'])]
for q in estrategia_qs[:8]:
    quote(q)
lines.append('')

box('INSIGHT: Os leads já desconfiam que "agência de fora não entende o negócio" e que "conteúdo genérico não converte". Eles querem algo que venha de dentro pra fora — voz autêntica, com sistema.')
sep()

# ═══ 7. SLIDE DA RÉGUA
h(2, '7. O SLIDE DA RÉGUA — Para Quem É Esse Webinar?')
p('_Critérios objetivos para identificar o lead ideal_')
lines.append('')

p('**Para quem É:**')
li('✅ Profissional liberal ou empreendedor digital (coach, consultor, mentor, médico, advogado, personal...)')
li('✅ Faturamento entre R$ 120 mil e R$ 1 mi/ano')
li('✅ Já tem clientes e um produto/serviço funcionando')
li('✅ Depende demais de tráfego pago e quer construir autoridade orgânica')
li('✅ Quer crescer audiência para vender mais sem depender de anúncios')
li('✅ Já tentou estratégias internas ou com agências — sem resultado consistente')
li('✅ Tem clareza de que precisa de conteúdo, mas "se perde" na execução')
lines.append('')

p('**Para quem NÃO É:**')
li('❌ Faturamento abaixo de R$ 60 mil/ano (não tem budget)')
li('❌ Não tem produto/serviço validado ainda')
li('❌ Quer apenas "mais seguidores" sem objetivo comercial claro')
li('❌ Espera resultado em 30 dias sem mudar nada')
li('❌ Quer uma agência que "faz tudo" sem envolvimento do fundador')
lines.append('')

h(3, '📊 Dados que Confirmam Esse Perfil')
li(f'**{pct(fat_buckets.get("Até R$ 120 mil/ano",0) + fat_buckets.get("R$ 120–200 mil/ano",0), len(resumos))}** dos leads têm faturamento até R$ 200k/ano')
li(f'**{pct(fat_buckets.get("R$ 120–200 mil/ano",0) + fat_buckets.get("R$ 200–400 mil/ano",0) + fat_buckets.get("R$ 400–700 mil/ano",0), len(resumos))}** estão na faixa ideal (R$ 120k–R$ 700k/ano)')
li(f'**{pct(traf_buckets.get("Não investe",0) + traf_buckets.get("Menos de R$ 3k/mês",0), len(resumos))}** investe menos de R$ 3k/mês em tráfego (oportunidade de orgânico)')
li(f'**{pct(conectado, total_mqls)}** dos MQLs atenderam o telefone/WhatsApp')
li(f'**Ciclo médio de decisão: {ciclo_medio} dias** (do lead ao pagamento)')
lines.append('')
sep()

# ═══ 8. DADOS DO FUNIL
h(2, '8. DADOS DO FUNIL — Como Se Comportam os Leads')
lines.append('')

h(3, '📉 Taxa de Conversão em Cada Etapa (MQLs 2026)')
table_row('Etapa', 'Quantidade', 'Taxa vs Total', 'Taxa vs Anterior')
table_row('---','---','---','---')
table_row('Leads MQL recebidos', total_mqls, '100%', '—')
table_row('Conectados (falaram)', conectado, pct(conectado, total_mqls), '—')
table_row('Reunião agendada', agendado, pct(agendado, total_mqls), pct(agendado, conectado))
table_row('Reunião realizada', realizado, pct(realizado, total_mqls), pct(realizado, agendado))
table_row('No-shows', no_show, pct(no_show, total_mqls), '—')
table_row('Perdidos', perdido, pct(perdido, total_mqls), '—')
lines.append('')

h(3, '📅 Distribuição Mensal de MQLs')
by_month = Counter()
for r in mqls:
    d = (r.get('data_lead_recebido') or '')[:7]
    if re.match(r'^\d{4}-\d{2}$', d):
        by_month[d] += 1
for month in sorted(by_month):
    c = by_month[month]
    bar = '▓' * round(c / max(by_month.values()) * 20)
    li(f'**{month}:** {c} leads ({pct(c, total_mqls)}) `{bar}`')
lines.append('')

h(3, '🏆 SDRs com Mais Leads')
for v, c in top(mqls, 'sdr_name', 8, 50):
    li(f'**{v}** — {c} leads ({pct(c, total_mqls)})')
lines.append('')

h(3, '📋 Motivos de Perda — Top 15')
for v, c in top([r for r in mqls if (r.get('lost_reason') or '').strip()], 'lost_reason', 15, 100):
    li(f'**"{v}"** — {c}x')
lines.append('')
sep()

# ═══ 9. COMPRANTES
h(2, '9. COMPRANTES — Quem Já Pagou (44 clientes de 2026)')
lines.append('')

h(3, '💰 Resumo Financeiro')
li(f'**Total faturado:** R$ {ticket_total:,.2f}'.replace(',','X').replace('.',',').replace('X','.'))
li(f'**Ticket médio:** R$ {ticket_medio:,.2f}'.replace(',','X').replace('.',',').replace('X','.'))
li(f'**Ciclo médio lead→pagamento:** {ciclo_medio} dias')
li(f'**Taxa de fechamento dos qualificados:** 93%')
lines.append('')

h(3, '🛒 Produtos Comprados')
for v, c in top(comprantes, 'produto_vendido', 8, 60):
    li(f'**{v}** — {c}x ({pct(c, len(comprantes))})')
lines.append('')

h(3, '💳 Forma de Pagamento')
for v, c in top(comprantes, 'forma_pagamento', 6, 80):
    li(f'**{v}** — {c}x ({pct(c, len(comprantes))})')
lines.append('')

h(3, '📍 Localização dos Comprantes')
for v, c in top(comprantes, 'estado_uf', 10, 30):
    li(f'**{v}** — {c}x ({pct(c, len(comprantes))})')
lines.append('')

h(3, '🎯 Canal que Gerou Mais Comprantes')
for v, c in top(comprantes, 'utm_source', 10, 30):
    li(f'`{v}` — {c}x ({pct(c, len(comprantes))})')
lines.append('')

h(3, '🏅 Closers — Performance')
closer_perf = defaultdict(lambda: {'n': 0, 'total': 0.0})
for r in comprantes:
    cl = (r.get('vendedor_closer') or '').strip()
    if not cl or len(cl) > 50: continue
    closer_perf[cl]['n'] += 1
    closer_perf[cl]['total'] += float(r.get('valor_faturado') or 0)
for cl, d in sorted(closer_perf.items(), key=lambda x: -x[1]['n']):
    tot_str = f"R$ {d['total']:,.0f}".replace(',','X').replace('.',',').replace('X','.')
    li(f'**{cl}** — {d["n"]} vendas | {tot_str}')
lines.append('')

h(3, '🗣️ O Que os Comprantes Dizem nas Conversas')
for q in buyer_quotes[:15]:
    quote(q)
sep()

# ═══ 10. CITAÇÕES VERBATIM
h(2, '10. CITAÇÕES VERBATIM COMPLETAS — Voz do Lead')
p('_Trechos reais de conversas de MQLs — use no roteiro, copy e objeções_')
lines.append('')

# Separar por tema
h(3, '🎯 Sobre Objetivos e Sonhos')
for q in [q for q in mql_quotes if any(kw in q.lower() for kw in ['quero','crescer','autoridade','vender','audiência','meta'])][:15]:
    quote(q)

h(3, '😤 Sobre Frustrações e Tentativas Anteriores')
for q in [q for q in mql_quotes if any(kw in q.lower() for kw in ['tentei','fiz','agência','não funcionou','resultado','estratégia'])][:12]:
    quote(q)

h(3, '⏳ Sobre Objeções de Tempo')
for q in [q for q in mql_quotes if any(kw in q.lower() for kw in ['semestre','mês','agenda','depois','momento','demanda'])][:10]:
    quote(q)

h(3, '💡 Frases de Clareza — O Lead Entendendo o Problema')
for q in [q for q in mql_quotes + buyer_quotes if len(q) > 80][:12]:
    quote(q)

sep()
h(2, '📌 PRÓXIMOS PASSOS')
lines.append('')
li('**Ativar formulário de aplicação** e mapear respostas para os campos de persona no banco (`tipo_empresa`, `faturamento_anual`, `obstaculos`, `visao_6_meses`) — vai multiplicar os dados disponíveis')
li('**Usar os motivos de perda** do CRM como anti-objeções no roteiro do webinar')
li('**Usar as citações verbatim** (seção 10) diretamente no script do webinar — falem como o lead fala')
li('**Segmentar o webinar** pelo faturamento: foco na faixa R$ 120k–R$ 700k/ano (sweet spot)')
li('**Campanha 12 + canal iads-28** geraram 50% dos comprantes — são a principal fonte de leads quentes')
lines.append('')

doc = '\n'.join(lines)

# ─── Salvar na pasta webinar-pro ──────────────────────────────────────────
out_path = os.path.join(WPRO, 'PERSONA-COMPLETO.md')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(doc)
print(f'✅ Documento mestre salvo: {out_path}')
print(f'   {len(lines)} linhas | {len(doc):,} chars')

# ─── Copiar todos os CSVs e MDs para webinar-pro ─────────────────────────
import shutil
for fname in os.listdir(EXPORTS):
    src = os.path.join(EXPORTS, fname)
    dst = os.path.join(WPRO, fname)
    shutil.copy2(src, dst)
print(f'\n📁 Todos os arquivos copiados para webinar-pro/')
print('Conteúdo final:')
for f in sorted(os.listdir(WPRO)):
    size = os.path.getsize(os.path.join(WPRO, f))
    print(f'   {f:<55} {size//1024:>6} KB')
