#!/usr/bin/env python3
"""
Análise de Persona via Conversas Reais — MQLs e Comprantes 2026
Busca mensagens INBOUND (do lead) e aplica o framework de 7 seções
"""

import csv, os, re, sys, json
from collections import Counter, defaultdict
from datetime import datetime

try:
    from supabase import create_client
except ImportError:
    print("❌ Instale: pip3 install supabase")
    sys.exit(1)

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORTS = os.path.join(ROOT, 'exports')
ENV_PATH = os.path.join(ROOT, 'eb-dash2', '.env.local')

MQLS_CSV   = os.path.join(EXPORTS, 'mqls-2026.csv')
BUYERS_CSV = os.path.join(EXPORTS, 'comprantes-2026.csv')
OUT_MQLS   = os.path.join(EXPORTS, 'analise-conversas-mqls-2026.md')
OUT_BUYERS = os.path.join(EXPORTS, 'analise-conversas-comprantes-2026.md')

NOW = datetime.now().strftime('%d/%m/%Y %H:%M')
PAGE_SIZE = 1000

# ─── Env ─────────────────────────────────────────────────────────────────────
def read_env(path):
    env = {}
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip()
    return env

# ─── CSV loader ───────────────────────────────────────────────────────────────
def load_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

# ─── Supabase fetch com paginação ─────────────────────────────────────────────
def fetch_all(sb, table, select, filters_fn):
    all_rows = []
    page = 0
    while True:
        q = sb.table(table).select(select).order('id')
        q = filters_fn(q)
        q = q.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        res = q.execute()
        data = res.data or []
        all_rows.extend(data)
        if len(data) < PAGE_SIZE:
            break
        page += 1
    return all_rows

# ─── Análise de texto ─────────────────────────────────────────────────────────
STOPWORDS = {
    'e','de','do','da','dos','das','o','a','os','as','um','uma','uns','umas',
    'em','no','na','nos','nas','por','para','com','sem','que','se','é','ao',
    'já','ou','mas','mais','muito','tem','ter','meu','minha','meus','minhas',
    'seu','sua','seus','suas','não','como','quando','onde','quem','qual','quais',
    'isso','esse','essa','esses','essas','este','esta','isto','aqui','lá',
    'eu','ele','ela','nós','eles','elas','você','vocês','me','te','nos',
    'foi','ser','estar','vai','vou','tenho','tenha','todo','toda','todos','todas',
    'só','também','ainda','porque','então','assim','pra','pro','até','sobre',
    'sim','não','ok','oi','olá','boa','bom','bom','dia','tarde','noite',
    'tudo','bem','obrigado','obrigada','claro','certo','pode','falar','gostaria',
    'queria','quero','preciso','seria','seria','ser','são','está','estou',
    'tô','né','né','né','tipo','cara','então','aí','lá','aqui','mesmo','cada',
    'depois','antes','durante','sempre','nunca','ainda','agora','hoje','amanhã',
    'coisa','coisas','fazer','feito','feita','ficou','fica','ficar',
    'sou','minha','gente','muito','pouco','mais','menos','quer','dizer',
    'assim','dessa','disso','desse','nessa','nesse','numa','num','duma','dum',
    # Metadados GHL (ruído)
    'source','empire','message','transcription','audio','reply','menssage',
    'attachment','image','video','document','https','http','null','undefined',
    'att','whatsapp','email','sms','instagram','facebook',
}

# ─── Limpeza de mensagens ────────────────────────────────────────────────────
# Padrões de metadados GHL que devem ser removidos dos corpos de mensagem
GHL_NOISE_PATTERNS = [
    r'Source:\s*\S+',
    r'Empire\d*',
    r'att\d+',
    r'Message:\s*',
    r'Transcription:\s*',
    r'Audio Message\.?\s*',
    r'Image Message\.?\s*',
    r'Video Message\.?\s*',
    r'Reply Message\.?\s*',
    r'Reply Menssage\.?\s*',
    r'Entrando\s+Source:\s*\S+',
    r'Source:\s*brunoandrease\S*',
    r'Source:\s*empire\S*',
    r'\batt\d+\b',
    r'https?://\S+',
    r'<[^>]+>',           # tags HTML
    r'\[image\]',
    r'\[audio\]',
    r'\[vídeo\]',
    r'\[documento\]',
]
NOISE_RE = re.compile('|'.join(GHL_NOISE_PATTERNS), re.IGNORECASE)

def clean_message(text):
    """Remove ruído de metadados GHL e retorna texto limpo."""
    if not text: return ''
    cleaned = NOISE_RE.sub(' ', text)
    # Remover linhas que são só metadados (ex: "Source: att1\n")
    lines_out = []
    for line in cleaned.split('\n'):
        line = line.strip()
        # Ignorar linhas muito curtas ou que parecem só metadado
        if len(line) < 5: continue
        if re.match(r'^(source|att|message|transcription|audio|image|reply|https?)\b', line, re.IGNORECASE): continue
        lines_out.append(line)
    result = ' '.join(lines_out)
    # Colapsar espaços múltiplos
    result = re.sub(r'\s+', ' ', result).strip()
    return result if len(result) > 10 else ''

def tokenize(text):
    if not text: return []
    words = re.findall(r'[a-záàâãäéèêëíïóôõöúüçñ]+', text.lower())
    return [w for w in words if len(w) > 3 and w not in STOPWORDS]

def top_terms(texts, top_n=25):
    freq = Counter()
    for t in texts:
        for w in tokenize(t):
            freq[w] += 1
    return freq.most_common(top_n)

# ─── Padrões de persona — palavras-gatilho em PT-BR ──────────────────────────

# Categorias semânticas para inferência de persona
PATTERNS = {
    'dores_negocio': [
        r'(não.{0,20}(resultado|convers[aã]o|cliente|vender|vendas))',
        r'(dificuldad[ea].{0,30}(vender|client|conteúdo|cres|rede))',
        r'(não.{0,15}(sei|consigo|sei como|saber).{0,30}(fazer|criar|vender|crescer))',
        r'(perco|perdendo|desperdic).{0,30}(tempo|dinheiro|client)',
        r'(estagnado|parado|travado|não.*evoluindo)',
        r'(muito.{0,10}(trabalho|esforço).{0,20}(pouco|resultado))',
        r'(caro demais|não tenho grana|sem dinheiro|investimento alto)',
        r'(social.media|redes sociais).{0,40}(não|difícil|ruim|problema)',
        r'(conteúdo.{0,20}(não|difícil|ruim|problema|sem))',
        r'(sem.{0,15}(tempo|equipe|apoio|estratégia|planejamento))',
    ],
    'sonhos': [
        r'(quero|gostaria|sonho|objetivo|meta|desejo).{0,50}(crescer|escalar|faturar|cliente|reconhecido|autoridade|liberdade)',
        r'(faturar|ganhar|lucrar).{0,30}(mais|melhor|muito|muito mais)',
        r'(ser.{0,20}(referência|autoridade|reconhecido|conhecido))',
        r'(crescer.{0,30}(negócio|empresa|marca|audiência|seguidores))',
        r'(mais.{0,15}(clientes|vendas|receita|faturamento|seguidores))',
        r'(liberdade.{0,20}(financeira|tempo|geográfica))',
        r'(escalar|multiplicar|expandir).{0,30}(negócio|vendas|cliente)',
        r'(vida.{0,20}(que eu quero|dos sonhos|melhor))',
        r'(deixar.{0,20}(emprego|CLT|trabalho|patrão))',
        r'(conteúdo.{0,20}(vend[ea]|converte|atraindo))',
    ],
    'objecoes': [
        r'(muito caro|não tenho grana|sem verba|valor muito alto|não tenho dinheiro)',
        r'(não sei se.{0,30}(funciona|é pra mim|vale|resultado))',
        r'(já tentei.{0,40}(não|sem resultado|funcionou))',
        r'(sem.{0,15}(tempo|disponibilidade|horário))',
        r'(deixa.{0,15}(eu pensar|ver|analisar))',
        r'(preciso.{0,20}(falar.{0,10}(marido|esposa|sócio)|pensar|decidir))',
        r'(estou.{0,15}(incerto|inseguro|com dúvida))',
        r'(outro.{0,20}(curso|mentorado|programa|ferramenta))',
        r'(não tenho certeza|não sei se|ainda não sei)',
    ],
    'contexto_negocio': [
        r'(sou.{0,30}(coach|mentor|consultor|agência|social media|gestor|infoprodutor|médico|advogado|terapeuta|dentista))',
        r'(trabalho.{0,30}(com|como).{0,30}(conteúdo|marca|redes|clientes|marketing))',
        r'(tenho.{0,20}(empresa|negócio|marca|produto|serviço|clientes|loja))',
        r'(faturamento.{0,30}(mensal|anual|mil|reais|k))',
        r'(investindo.{0,20}(em tráfego|em marketing|em ads|por mês))',
        r'(segmento|nicho|mercado).{0,30}(de|do|da)',
        r'(instagram|youtube|tiktok|linkedin).{0,20}(seguidores|mil|k|perfil)',
        r'(produto digital|infoproduto|curso|mentoria|consultoria)',
    ],
    'tentativas_anteriores': [
        r'(já.{0,20}(tentei|fiz|testei|investi|paguei|contratei))',
        r'(fiz.{0,30}(curso|treinamento|mentoria|consultoria|agência))',
        r'(contratei.{0,30}(profissional|agência|gestor|editor|social media))',
        r'(gastei.{0,30}(dinheiro|tempo|reais).{0,20}(e não|sem resultado))',
        r'(tive.{0,20}(resultado|experiência).{0,20}(ruim|negativa|horrível))',
        r'(não.{0,15}(funcionou|deu certo|adiantou|resolveu))',
    ],
    'inimigos_externos': [
        r'(algoritmo.{0,20}(não|ruim|prejudic))',
        r'(concorrência.{0,20}(desleal|preço baixo|difícil|acirrada))',
        r'(mercado.{0,20}(saturado|difícil|concorrido))',
        r'(inflação|crise|pandemia|economi).{0,20}(afetando|impactando)',
        r'(agência.{0,30}(não entrega|promete|cara|ruim|decepcionei))',
        r'(guru|curso.{0,20}(não funciona|mentira|enganação))',
        r'(plataforma.{0,20}(mudou|atualização|alcance caiu))',
    ],
}

def find_pattern_matches(texts, pattern_list, max_per_pattern=5):
    """Encontra frases que batem com os padrões e retorna exemplos."""
    matches = []
    seen = set()
    for text in texts:
        if not text: continue
        sents = re.split(r'[.!?\n]+', text)
        for sent in sents:
            sent_clean = sent.strip()
            if len(sent_clean) < 15: continue
            for pat in pattern_list:
                if re.search(pat, sent_clean.lower()):
                    key = sent_clean[:80]
                    if key not in seen:
                        seen.add(key)
                        matches.append(sent_clean[:300])
                    if len(matches) >= max_per_pattern * len(pattern_list):
                        break
    return matches[:30]

def frequency_context(texts, keyword, window=60):
    """Extrai trechos ao redor de uma palavra-chave."""
    excerpts = []
    seen = set()
    for text in texts:
        if not text: continue
        for m in re.finditer(keyword, text.lower()):
            start = max(0, m.start() - window)
            end = min(len(text), m.end() + window)
            excerpt = text[start:end].strip().replace('\n', ' ')
            if len(excerpt) > 20 and excerpt[:50] not in seen:
                seen.add(excerpt[:50])
                excerpts.append(excerpt)
        if len(excerpts) >= 10:
            break
    return excerpts[:8]

# ─── Gerador do relatório ─────────────────────────────────────────────────────
def generate_report(msgs_by_contact, label, total_leads, buyer_context=None):
    """
    msgs_by_contact: dict { ghl_id: [msg_text, ...] }
    """
    all_texts = [m for msgs in msgs_by_contact.values() for m in msgs]
    n_leads_com_msg = len([k for k, v in msgs_by_contact.items() if v])
    n_total_msgs = sum(len(v) for v in msgs_by_contact.values())

    lines = []
    def h(level, text): lines.append('#'*level + ' ' + text); lines.append('')
    def p(text): lines.append(text); lines.append('')
    def li(text): lines.append(f'- {text}')
    def quote(text): lines.append(f'> "{text}"'); lines.append('')
    def sep(): lines.append('---'); lines.append('')
    def note(text): lines.append(f'> _{text}_'); lines.append('')

    h(1, f'Análise de Persona via Conversas — {label}')
    p(f'**Total de leads analisados:** {total_leads}')
    p(f'**Leads com mensagens inbound:** {n_leads_com_msg} ({round(n_leads_com_msg/total_leads*100) if total_leads else 0}%)')
    p(f'**Total de mensagens inbound analisadas:** {n_total_msgs}')
    p(f'**Data de geração:** {NOW}')
    note('Metodologia: busca de mensagens INBOUND (do lead → para o time) no WhatsApp/SMS/email. Análise por padrões linguísticos, frequência de termos e citações verbatim.')
    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '1. INTRODUÇÃO — Slide de Abertura: O Que Eles Querem?')
    p('_Base: mensagens dos leads analisadas por padrões de sonhos e objetivos._')
    lines.append('')

    # Top termos gerais
    top = top_terms(all_texts, 30)
    if top:
        h(3, 'Palavras mais usadas pelos leads (excluindo stop words)')
        for w, cnt in top:
            li(f'**{w}** — {cnt}x')
        lines.append('')

    # Sonhos e objetivos
    sonho_matches = find_pattern_matches(all_texts, PATTERNS['sonhos'], max_per_pattern=4)
    h(3, 'O que eles dizem que querem alcançar (verbatim)')
    if sonho_matches:
        for q in sonho_matches[:12]:
            quote(q)
    else:
        p('_Nenhum padrão encontrado neste grupo._')

    # Contexto de negócio
    ctx_matches = find_pattern_matches(all_texts, PATTERNS['contexto_negocio'], max_per_pattern=4)
    h(3, 'Como descrevem seu negócio/perfil (verbatim)')
    if ctx_matches:
        for q in ctx_matches[:10]:
            quote(q)
    else:
        p('_Nenhum padrão encontrado neste grupo._')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '2. CONEXÃO — Justifique Suas Falhas: O Que Já Tentaram?')
    p('_O que eles já fizeram antes de chegar até você — e por que não funcionou._')
    lines.append('')

    tent_matches = find_pattern_matches(all_texts, PATTERNS['tentativas_anteriores'], max_per_pattern=5)
    h(3, 'Tentativas e frustrações anteriores (verbatim)')
    if tent_matches:
        for q in tent_matches[:12]:
            quote(q)
    else:
        p('_Padrão não encontrado nas mensagens deste grupo._')

    # Extrair contexto de palavras-chave de frustração
    for kw in ['não funcionou', 'não deu certo', 'já tentei', 'gastei']:
        excerpts = frequency_context(all_texts, kw)
        if excerpts:
            h(3, f'Contexto de "{kw}"')
            for ex in excerpts[:5]:
                quote(ex)
            break

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '3. CONEXÃO — Acalme Seus Medos: O Que Eles Temem?')
    p('_Objeções e medos expressos nas conversas._')
    lines.append('')

    objecao_matches = find_pattern_matches(all_texts, PATTERNS['objecoes'], max_per_pattern=5)
    h(3, 'Objeções e medos relatados (verbatim)')
    if objecao_matches:
        for q in objecao_matches[:12]:
            quote(q)
    else:
        p('_Objeções não detectadas como padrão explícito — podem estar implícitas._')

    # Palavras de hesitação
    hesitacao_kws = ['caro', 'valor', 'investimento', 'pensar', 'decidir', 'certeza', 'garantia']
    found_hesitacao = False
    for kw in hesitacao_kws:
        excerpts = frequency_context(all_texts, kw)
        if excerpts:
            h(3, f'Contexto de preocupação com "{kw}"')
            for ex in excerpts[:4]:
                quote(ex)
            found_hesitacao = True
            break
    if not found_hesitacao:
        p('_Palavras de hesitação não detectadas com frequência._')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '4. CONEXÃO — Jogue Pedras nos Inimigos: Quem os Atrapalha?')
    p('_Obstáculos externos que os leads mencionam — o que ou quem culpam pelo problema._')
    lines.append('')

    inimigos_matches = find_pattern_matches(all_texts, PATTERNS['inimigos_externos'], max_per_pattern=4)
    h(3, 'Obstáculos externos mencionados (verbatim)')
    if inimigos_matches:
        for q in inimigos_matches[:10]:
            quote(q)
    else:
        p('_Obstáculos externos não detectados como padrão explícito._')

    dores_matches = find_pattern_matches(all_texts, PATTERNS['dores_negocio'], max_per_pattern=5)
    h(3, 'Dores de negócio relatadas (verbatim)')
    if dores_matches:
        for q in dores_matches[:12]:
            quote(q)
    else:
        p('_Dores não detectadas como padrão explícito._')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '5. CONEXÃO — Confirme Suas Suspeitas: O Que Já Desconfiam?')
    p('_Percepções dos leads sobre o mercado, sobre soluções disponíveis e sobre o que funciona._')
    lines.append('')

    # Contextos de desconfiança/suspeita
    for kw in ['mercado', 'algoritmo', 'agência', 'curso', 'guru', 'método', 'estratégia']:
        excerpts = frequency_context(all_texts, kw)
        if excerpts:
            h(3, f'O que falam sobre "{kw}"')
            for ex in excerpts[:4]:
                quote(ex)

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '6. CONEXÃO — Incentive Seus Sonhos: O Que Desejam?')
    p('_Aspirações e visões de futuro extraídas das conversas._')
    lines.append('')

    h(3, 'Sonhos e metas expressos (verbatim)')
    if sonho_matches:
        for q in sonho_matches[:15]:
            quote(q)

    for kw in ['quero', 'objetivo', 'meta', 'sonho', 'crescer', 'faturar', 'escalar']:
        excerpts = frequency_context(all_texts, kw)
        if excerpts:
            h(3, f'O que falam quando dizem "{kw}"')
            for ex in excerpts[:5]:
                quote(ex)
            break

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '7. NOVA OPORTUNIDADE — Slide da Régua: Para Quem É Isso?')
    p('_Perfil inferido com base nas conversas reais._')
    lines.append('')

    # Termos de segmento/nicho mais frequentes
    nicho_terms = ['coach', 'mentor', 'consultor', 'agência', 'social media', 'gestor',
                   'infoprodutor', 'médico', 'advogado', 'terapeuta', 'dentista',
                   'empreendedor', 'empresário', 'nutricionista', 'psicólogo',
                   'personal', 'fotógrafo', 'designer', 'arquiteto', 'engenheiro',
                   'profissional', 'criador', 'produtor', 'influencer', 'digital']
    nicho_freq = Counter()
    for text in all_texts:
        if not text: continue
        text_lower = text.lower()
        for term in nicho_terms:
            if term in text_lower:
                nicho_freq[term] += text_lower.count(term)

    h(3, 'Segmentos e nichos mais mencionados pelos leads')
    if nicho_freq:
        for term, cnt in nicho_freq.most_common(15):
            li(f'**{term}** — citado {cnt}x nas mensagens')
    else:
        p('_Segmentos não detectados com frequência._')
    lines.append('')

    # Faixa de faturamento mencionada
    fat_matches = []
    for text in all_texts:
        if not text: continue
        found = re.findall(r'(?:fatur[oa]|ganha|receita|rend[ao]).{0,50}(?:R\$\s*[\d.,]+\s*(?:mil|k|milhão|mi)?|\d+\s*(?:mil|k|reais))', text.lower())
        fat_matches.extend(found)
    if fat_matches:
        h(3, 'Menções de faturamento/renda (verbatim)')
        for m in fat_matches[:8]:
            li(f'`{m.strip()}`')
        lines.append('')

    # Contexto de investimento em marketing
    inv_matches = []
    for text in all_texts:
        if not text: continue
        found = re.findall(r'(?:invisto|investindo|gasto|gastando).{0,60}(?:tráfego|marketing|ads|anúncio|publicidade|mês)', text.lower())
        inv_matches.extend(found)
    if inv_matches:
        h(3, 'Menções de investimento em marketing (verbatim)')
        for m in inv_matches[:8]:
            li(f'`{m.strip()}`')
        lines.append('')

    sep()

    # ═══════════════════════════════════════════════════════════
    h(2, '8. ANÁLISE QUANTITATIVA DAS MENSAGENS')
    lines.append('')

    # Distribuição de mensagens por lead
    msg_counts = [len(v) for v in msgs_by_contact.values() if v]
    if msg_counts:
        sorted_counts = sorted(msg_counts)
        media = sum(msg_counts) / len(msg_counts)
        mediana = sorted_counts[len(sorted_counts)//2]
        li(f'Leads com pelo menos 1 mensagem: **{len(msg_counts)}**')
        li(f'Média de mensagens por lead: **{media:.1f}**')
        li(f'Mediana: **{mediana}**')
        li(f'Máximo: **{max(msg_counts)}** mensagens de um único lead')
        lines.append('')

    # Top frases/expressões (bi-gramas)
    bigram_freq = Counter()
    for text in all_texts:
        if not text: continue
        words = re.findall(r'[a-záàâãäéèêëíïóôõöúüçñ]+', text.lower())
        words = [w for w in words if len(w) > 2 and w not in STOPWORDS]
        for i in range(len(words) - 1):
            bigram = f'{words[i]} {words[i+1]}'
            if len(bigram) > 7:
                bigram_freq[bigram] += 1

    if bigram_freq:
        h(3, 'Pares de palavras mais frequentes (bigramas — revelam intenções)')
        for bigram, cnt in bigram_freq.most_common(25):
            li(f'**"{bigram}"** — {cnt}x')
        lines.append('')

    sep()
    h(2, '9. INFERÊNCIAS E SÍNTESE')
    lines.append('')

    # Síntese baseada nos dados
    p('Com base nas mensagens INBOUND analisadas, é possível inferir:')
    lines.append('')

    # Total de leads sem nenhuma mensagem
    sem_msg = total_leads - n_leads_com_msg
    if sem_msg > 0:
        li(f'**{sem_msg} leads ({round(sem_msg/total_leads*100)}%) nunca enviaram nenhuma mensagem** — possivelmente leads frios, no-shows ou captados via anúncio sem responder à abordagem.')
    li(f'**{n_leads_com_msg} leads ({round(n_leads_com_msg/total_leads*100) if total_leads else 0}%) conversaram** e geraram {n_total_msgs} mensagens para análise.')
    lines.append('')

    # Se comprador: ticket e jornada
    if buyer_context:
        p('**Perfil do Comprador Ideal (inferido das conversas + dados financeiros):**')
        for item in buyer_context:
            li(item)
        lines.append('')

    p('> **Próximo passo recomendado:** Ativar o formulário de aplicação e mapear as respostas para os campos de persona (`tipo_empresa`, `faturamento_anual`, `obstaculos`, `visao_6_meses`) — assim as próximas análises terão dados estruturados além das conversas.')

    return '\n'.join(lines)


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(ENV_PATH):
        print(f"❌ .env.local não encontrado: {ENV_PATH}"); sys.exit(1)

    env = read_env(ENV_PATH)
    url = env.get('VITE_SUPABASE_URL') or env.get('SUPABASE_URL')
    key = env.get('SUPABASE_SERVICE_ROLE_KEY') or env.get('VITE_SUPABASE_ANON_KEY')
    if not url or not key:
        print("❌ Credenciais Supabase não encontradas"); sys.exit(1)

    sb = create_client(url, key)

    # ─── Carregar IDs dos CSVs ────────────────────────────────────────────
    print("📂 Carregando CSVs...")
    mql_rows    = load_csv(MQLS_CSV)
    buyer_rows  = load_csv(BUYERS_CSV)

    # Extrair ghl_ids únicos de contatos
    mql_ghl_ids   = list({ r['ghl_id'] for r in mql_rows if r.get('ghl_id') })
    buyer_ghl_ids = list({ r['ghl_id'] for r in buyer_rows if r.get('ghl_id') })

    print(f"   MQLs: {len(mql_rows)} opps | {len(mql_ghl_ids)} contatos únicos")
    print(f"   Comprantes: {len(buyer_rows)} opps | {len(buyer_ghl_ids)} contatos únicos")

    # ─── Buscar UUIDs dos contatos (ghl_id → id) ─────────────────────────
    print("\n🔑 Buscando UUIDs dos contatos...")

    def get_uuid_map(ghl_ids):
        uuid_map = {}
        for i in range(0, len(ghl_ids), 500):
            batch = ghl_ids[i:i+500]
            res = sb.table('contatos').select('id, ghl_id').in_('ghl_id', batch).execute()
            for row in (res.data or []):
                uuid_map[row['ghl_id']] = row['id']
        return uuid_map

    mql_uuid_map   = get_uuid_map(mql_ghl_ids)
    buyer_uuid_map = get_uuid_map(buyer_ghl_ids)

    mql_uuids   = list(mql_uuid_map.values())
    buyer_uuids = list(buyer_uuid_map.values())
    print(f"   MQLs: {len(mql_uuids)} UUIDs encontrados")
    print(f"   Comprantes: {len(buyer_uuids)} UUIDs encontrados")

    # ─── Buscar mensagens inbound ─────────────────────────────────────────
    def fetch_messages(uuids, label):
        print(f"\n💬 Buscando mensagens inbound de {label}...")
        msgs = []
        # Buscar em batches de 300 UUIDs (limite do IN)
        BATCH = 300
        for i in range(0, len(uuids), BATCH):
            batch = uuids[i:i+BATCH]
            page = 0
            while True:
                res = sb.table('comunicacoes') \
                    .select('contato_id, mensagem_body, channel, direction') \
                    .in_('contato_id', batch) \
                    .eq('direction', 'inbound') \
                    .not_.is_('mensagem_body', 'null') \
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1) \
                    .execute()
                data = res.data or []
                msgs.extend(data)
                if len(data) < PAGE_SIZE: break
                page += 1
            print(f"   Batch {i//BATCH + 1}/{(len(uuids)-1)//BATCH + 1}: {len(msgs)} msgs até agora")
        return msgs

    mql_msgs   = fetch_messages(mql_uuids, "MQLs")
    buyer_msgs = fetch_messages(buyer_uuids, "Comprantes")

    print(f"\n   Total mensagens MQLs: {len(mql_msgs)}")
    print(f"   Total mensagens Comprantes: {len(buyer_msgs)}")

    # ─── Agrupar por contato (com limpeza) ───────────────────────────────
    def group_by_contact(msgs, uuid_map):
        inv = {v: k for k, v in uuid_map.items()}
        result = defaultdict(list)
        for msg in msgs:
            cid = msg.get('contato_id')
            raw  = (msg.get('mensagem_body') or '').strip()
            body = clean_message(raw)
            if body and cid and len(body) > 15:
                ghl = inv.get(cid, cid)
                result[ghl].append(body)
        return dict(result)

    mql_by_contact   = group_by_contact(mql_msgs, mql_uuid_map)
    buyer_by_contact = group_by_contact(buyer_msgs, buyer_uuid_map)

    # ─── Gerar relatórios ─────────────────────────────────────────────────
    print("\n📊 Gerando análise de persona dos MQLs...")
    mql_report = generate_report(
        mql_by_contact,
        label='MQLs de 2026',
        total_leads=len(mql_ghl_ids),
    )
    with open(OUT_MQLS, 'w', encoding='utf-8') as f:
        f.write(mql_report)
    print(f"   ✅ {OUT_MQLS}")

    print("\n📊 Gerando análise de persona dos Comprantes...")
    buyer_context = [
        f"Ticket médio R$ 32.110 | 100% brasileiros | Ciclo médio lead→pagamento: 14 dias",
        f"52% pagam entre R$30k–R$50k | Produto dominante: Acelerador Gold (48%) e Platinum (30%)",
        f"Canal dominante: iads-28 (25%) + iorg-3 (23%) — combinação de tráfego pago + orgânico",
        f"Taxa de conexão: 95% | Taxa de reunião: 93% | Taxa de fechamento: 93% dos qualificados",
    ]
    buyer_report = generate_report(
        buyer_by_contact,
        label='Comprantes de 2026',
        total_leads=len(buyer_ghl_ids),
        buyer_context=buyer_context,
    )
    with open(OUT_BUYERS, 'w', encoding='utf-8') as f:
        f.write(buyer_report)
    print(f"   ✅ {OUT_BUYERS}")

    print("\n✅ Análise de conversas concluída!")
    print(f"   - {OUT_MQLS}")
    print(f"   - {OUT_BUYERS}")


if __name__ == '__main__':
    main()
