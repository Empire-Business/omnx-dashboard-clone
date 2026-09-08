Agora tenho o entendimento completo do sistema atual. Vou montar o plano.

---

# Plano de Ação Técnico — Refatoração do Discador de Pré-Vendas

## 1. Visão da Decisão

O discador atual funciona como um organizador de lista, não como uma máquina de chamadas. Ele divide leads em 5 blocos estáticos (Novo hoje, Task agendada, Respondeu, Últimos 3 dias, Cadência) que não mudam de posição durante o turno, não refletem o estado real de cada lead minuto a minuto, e dependem de um "tick manual" gravado em `localStorage` — que some quando o SDR troca de dispositivo, abre outra aba, ou simplesmente esquece de clicar. O sistema sabe que um lead chegou hoje, mas não sabe se ele acabou de responder um WhatsApp há 4 minutos. Esse gap entre o que o sistema sabe e o que o SDR precisa saber custa agendamentos reais toda hora de cada turno.

A decisão adotada resolve isso em dois movimentos. Primeiro: o score de prioridade passa a ser calculado no banco de dados a cada 2 minutos via função SQL materializada em uma tabela auxiliar `discagem_scores`, alimentada pelos dados que já existem em `comunicacoes`, `oportunidades` e `ghl_tasks`. Segundo: a interface deixa de mostrar números para o SDR — exibe três listas nomeadas (Ligue Agora, Ligue Hoje, Mensagem) com uma linha de razão em linguagem humana ao lado de cada nome. O SDR nunca interpreta um número; ele lê uma instrução e discam.

---

## 2. Objetivo Macro + Metas 30/60/90 Dias

**Objetivo macro:** Transformar o discador de um organizador visual passivo em uma máquina de chamadas ativa — que decide sozinha a ordem de prioridade, detecta automaticamente o resultado de cada ligação via webhook do GHL, e expõe ao SDR apenas o próximo nome e o motivo em uma linha.

**30 dias — Score dinâmico operacional:**
- Métrica: percentual de leads contactados em até 30 minutos após entrada no pipeline >= 60% (baseline atual a ser medido na primeira semana)
- Entregável: tabela `discagem_scores` populada, cron a cada 2 min, interface refatorada com 3 estados visuais, linha de razão por lead

**60 dias — Saída automática da fila + prompt de resultado:**
- Métrica: leads com resultado registrado (Agendou / Não atendeu / Em andamento / Descartado) >= 80% das ligações do dia
- Entregável: webhook do GHL detecta ligação → move lead automaticamente → prompt de resultado em 4 botões aparece em 30s → dado gravado em `discagem_tentativas`

**90 dias — Calibração por dados reais:**
- Métrica: taxa de agendamento por lead contactado em verde >= taxa de leads contactados em amarelo (valida que o score está correto)
- Entregável: painel do gestor com KPIs — contactados em 30min, taxa de resposta por faixa de score, tempo médio entre tentativas, distribuição de resultados por SDR

---

## 3. Pilares e Ações Concretas

---

### Pilar 1 — Score de Prioridade

**O que fazer:**

Criar tabela `discagem_scores` no banco que é populada por uma função SQL chamada a cada 2 minutos via `pg_cron`. Cada linha representa um lead ativo no pipeline de discagem com seu score calculado e o "motivo" em texto para exibir na interface.

```sql
-- Migration: 20260630000001_create_discagem_scores.sql

CREATE TABLE IF NOT EXISTS discagem_scores (
  oportunidade_id  UUID         PRIMARY KEY REFERENCES oportunidades(id) ON DELETE CASCADE,
  contato_id       UUID         NOT NULL,
  score            INTEGER      NOT NULL DEFAULT 0,
  estado           TEXT         NOT NULL CHECK (estado IN ('ligue_agora', 'ligue_hoje', 'mensagem')),
  razao            TEXT         NOT NULL,  -- ex: "respondeu há 8 min"
  componente_dom   TEXT         NOT NULL,  -- qual componente dominou: 'sinal_quente'|'urgencia'|'tentativas'|'fonte'
  score_sinal      INTEGER      NOT NULL DEFAULT 0,
  score_urgencia   INTEGER      NOT NULL DEFAULT 0,
  score_tentativas INTEGER      NOT NULL DEFAULT 0,
  score_fonte      INTEGER      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_discagem_scores_estado ON discagem_scores(estado, score DESC);
CREATE INDEX idx_discagem_scores_contato ON discagem_scores(contato_id);
```

A função de recálculo (SQL puro, sem edge function):

```sql
-- Função chamada pelo cron a cada 2 minutos
CREATE OR REPLACE FUNCTION recalcular_discagem_scores()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  _agora TIMESTAMPTZ := now();
BEGIN
  -- Limpa leads que saíram dos pipelines ativos
  DELETE FROM discagem_scores
  WHERE oportunidade_id NOT IN (
    SELECT id FROM oportunidades
    WHERE status = 'open'
      AND pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')
  );

  -- Upsert dos scores
  INSERT INTO discagem_scores (
    oportunidade_id, contato_id, score,
    estado, razao, componente_dom,
    score_sinal, score_urgencia, score_tentativas, score_fonte, updated_at
  )
  SELECT
    o.id,
    o.contato_id,

    -- Score final ponderado (0-100)
    LEAST(100, ROUND(
      (sig.pts * 0.40) +
      (urg.pts * 0.35) +
      (tent.pts * 0.20) +
      (fonte.pts * 0.05)
    ))::INT AS score,

    -- Estado
    CASE
      WHEN LEAST(100, ROUND((sig.pts*0.40)+(urg.pts*0.35)+(tent.pts*0.20)+(fonte.pts*0.05))) >= 65
        THEN 'ligue_agora'
      WHEN LEAST(100, ROUND((sig.pts*0.40)+(urg.pts*0.35)+(tent.pts*0.20)+(fonte.pts*0.05))) >= 30
        THEN 'ligue_hoje'
      ELSE 'mensagem'
    END AS estado,

    -- Razão (componente dominante gera texto)
    CASE
      WHEN sig.pts >= urg.pts AND sig.pts >= tent.pts THEN sig.razao
      WHEN urg.pts >= tent.pts THEN urg.razao
      ELSE tent.razao
    END AS razao,

    CASE
      WHEN sig.pts >= urg.pts AND sig.pts >= tent.pts THEN 'sinal_quente'
      WHEN urg.pts >= tent.pts THEN 'urgencia'
      ELSE 'tentativas'
    END AS componente_dom,

    sig.pts::INT,
    urg.pts::INT,
    tent.pts::INT,
    fonte.pts::INT,
    _agora

  FROM oportunidades o

  -- SINAL QUENTE (peso 40): resposta recente via inbound
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound') > (_agora - INTERVAL '30 min')
          THEN 100
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound') > (_agora - INTERVAL '2 hours')
          THEN 70
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound' AND c.data_comunicacao > (_agora - INTERVAL '24 hours')) IS NOT NULL
          AND MAX(c.data_comunicacao) FILTER (WHERE c.direction='outbound') IS NULL
          THEN 90  -- resposta espontânea sem contato prévio
        ELSE 0
      END AS pts,
      CASE
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound') > (_agora - INTERVAL '30 min')
          THEN 'respondeu há ' ||
            CASE
              WHEN EXTRACT(EPOCH FROM (_agora - MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound')))/60 < 2
              THEN '1 min'
              ELSE ROUND(EXTRACT(EPOCH FROM (_agora - MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound')))/60)::TEXT || ' min'
            END
        WHEN MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound') > (_agora - INTERVAL '2 hours')
          THEN 'respondeu há ' || ROUND(EXTRACT(EPOCH FROM (_agora - MAX(c.data_comunicacao) FILTER (WHERE c.direction='inbound')))/3600, 1)::TEXT || 'h'
        ELSE 'sem resposta recente'
      END AS razao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.data_comunicacao > (_agora - INTERVAL '24 hours')
  ) sig ON true

  -- URGÊNCIA DE TEMPO (peso 35): tempo desde data_lead_recebido sem primeiro contato
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN o.data_lead_recebido > (_agora - INTERVAL '15 min') THEN 100
        WHEN o.data_lead_recebido > (_agora - INTERVAL '1 hour')  THEN 75
        WHEN o.data_lead_recebido > (_agora - INTERVAL '4 hours') THEN 45
        WHEN o.data_lead_recebido > (_agora - INTERVAL '12 hours') THEN 20
        ELSE 5
      END AS pts,
      CASE
        WHEN o.data_lead_recebido > (_agora - INTERVAL '15 min')  THEN 'lead novo, ' || ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido))/60)::TEXT || ' min sem contato'
        WHEN o.data_lead_recebido > (_agora - INTERVAL '1 hour')  THEN 'chegou há ' || ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido))/60)::TEXT || ' min'
        WHEN o.data_lead_recebido > (_agora - INTERVAL '4 hours') THEN 'chegou há ' || ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido))/3600, 1)::TEXT || 'h'
        ELSE ROUND(EXTRACT(EPOCH FROM (_agora - o.data_lead_recebido))/86400, 0)::TEXT || 'd na base'
      END AS razao
  ) urg ON true

  -- TENTATIVAS ANTERIORES (peso 20): inversamente proporcional
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 0 THEN 100
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 1 THEN 70
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 2 THEN 40
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 3 THEN 15
        ELSE 0
      END AS pts,
      CASE
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 0 THEN 'nenhuma tentativa ainda'
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 1 THEN '1ª tentativa — sem resposta'
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 2 THEN '2ª tentativa'
        WHEN COUNT(*) FILTER (WHERE c.channel='call' AND c.direction='outbound' AND c.ghl_source='app') = 3 THEN '3ª tentativa — cooldown ativo'
        ELSE 'cooldown — migrar para mensagem'
      END AS razao
    FROM comunicacoes c
    WHERE c.contato_id = o.contato_id
      AND c.data_comunicacao > (_agora - INTERVAL '72 hours')
  ) tent ON true

  -- FONTE DE TRÁFEGO (peso 5)
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN EXISTS (
          SELECT 1 FROM utm_campaigns uc
          WHERE uc.utm_campaign = ct.utm_campaign
            AND uc.funnels @> '["CDAV"]'::jsonb
        ) THEN 100
        WHEN ct.utm_source IS NOT NULL THEN 60
        ELSE 40
      END AS pts
    FROM contatos ct WHERE ct.id = o.contato_id
  ) fonte ON true

  WHERE o.status = 'open'
    AND o.pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')

  ON CONFLICT (oportunidade_id) DO UPDATE SET
    contato_id       = EXCLUDED.contato_id,
    score            = EXCLUDED.score,
    estado           = EXCLUDED.estado,
    razao            = EXCLUDED.razao,
    componente_dom   = EXCLUDED.componente_dom,
    score_sinal      = EXCLUDED.score_sinal,
    score_urgencia   = EXCLUDED.score_urgencia,
    score_tentativas = EXCLUDED.score_tentativas,
    score_fonte      = EXCLUDED.score_fonte,
    updated_at       = EXCLUDED.updated_at;
END;
$$;

-- Cron a cada 2 minutos
SELECT cron.schedule(
  'discagem-recalcula-score',
  '*/2 * * * *',
  'SELECT recalcular_discagem_scores()'
);
```

**Responsável:** desenvolvedor backend
**Prazo:** Dias 1-7
**Métrica:** `discagem_scores` populada com <= 2min de defasagem em relação a `comunicacoes`; zero erros no cron log por 72h

---

### Pilar 2 — Fila em Tempo Real

**O que fazer:**

Refatorar o `useDiscagem.ts` para ler de `discagem_scores` (JOIN com `oportunidades` e `contatos`) em vez de reconstruir o score no frontend. O hook passa a assinar o canal Supabase Realtime na tabela `discagem_scores` para receber atualizações sem polling.

```typescript
// eb-dash2/src/hooks/useDiscagem.ts — versão refatorada (trecho central)

// Tipo atualizado
export interface DiscagemLead {
  oppId: string
  contatoId: string
  contatoGhlId: string | null
  nome: string
  telefone: string | null
  sdrName: string | null
  score: number
  estado: 'ligue_agora' | 'ligue_hoje' | 'mensagem'
  razao: string           // "respondeu há 8 min" — gerado pelo banco
  ligacoesHoje: number
  diasNaBase: number
}

// Substituir a query de oportunidades pela leitura de discagem_scores:
const { data, error } = await supabase
  .from('discagem_scores')
  .select(`
    oportunidade_id, contato_id, score, estado, razao,
    oportunidades!inner(sdr_name, data_lead_recebido, pipeline_name,
      contatos(nome, telefone, ghl_id, owner_name)
    )
  `)
  // Filtro por SDR (mantém lógica atual)
  .order('score', { ascending: false })

// Realtime: subscribe ao canal da tabela
const channel = supabase
  .channel('discagem-scores-updates')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'discagem_scores'
  }, () => {
    // Re-fetch ao receber qualquer mudança
    load()
  })
  .subscribe()
```

Para o filtro por SDR no servidor (evitar trazer todos os leads de todos os SDRs):

```typescript
// Adicionar ao select quando SDR específico:
if (efectiveSdr) {
  query = query.eq('oportunidades.sdr_name', efectiveSdr)
}
```

**Responsável:** desenvolvedor frontend
**Prazo:** Dias 8-14
**Métrica:** Latência de atualização da fila <= 30s após um inbound chegar em `comunicacoes`; zero chamadas de polling desnecessárias (substituídas por Realtime)

---

### Pilar 3 — Saída da Fila

**O que fazer:**

Criar tabela `discagem_tentativas` para registrar cada tentativa com resultado, e dois mecanismos de atualização:

**3a — Detecção automática via webhook do GHL (fluxo principal):**

```sql
-- Migration: 20260630000002_create_discagem_tentativas.sql

CREATE TABLE IF NOT EXISTS discagem_tentativas (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidade_id UUID         NOT NULL REFERENCES oportunidades(id),
  contato_id      UUID         NOT NULL,
  sdr_name        TEXT,
  canal           TEXT         NOT NULL DEFAULT 'call', -- 'call' | 'whatsapp' | 'sms'
  resultado       TEXT         CHECK (resultado IN ('agendou', 'nao_atendeu', 'em_andamento', 'descartado', NULL)),
  registrado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resultado_em    TIMESTAMPTZ,
  fonte           TEXT         NOT NULL DEFAULT 'webhook' -- 'webhook' | 'manual'
);

CREATE INDEX idx_disc_tent_opp ON discagem_tentativas(oportunidade_id, registrado_em DESC);
CREATE INDEX idx_disc_tent_contato ON discagem_tentativas(contato_id, registrado_em DESC);
```

No trigger existente `auto_extrair_dados_ghl` (ou em um trigger separado em `comunicacoes`), quando chegar uma ligação outbound de um SDR para um lead na fila ativa:

```sql
-- Trigger em comunicacoes: detecta ligação e cria tentativa pendente
CREATE OR REPLACE FUNCTION registrar_tentativa_discagem()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  _opp_id UUID;
BEGIN
  -- Só processa ligações outbound feitas via app (SDR humano)
  IF NEW.channel != 'call' OR NEW.direction != 'outbound' OR NEW.ghl_source != 'app' THEN
    RETURN NEW;
  END IF;

  -- Verifica se o contato está na fila ativa
  SELECT ds.oportunidade_id INTO _opp_id
  FROM discagem_scores ds
  WHERE ds.contato_id = NEW.contato_id
    AND ds.estado IN ('ligue_agora', 'ligue_hoje')
  LIMIT 1;

  IF _opp_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Registra tentativa sem resultado ainda (resultado vem do prompt UI)
  INSERT INTO discagem_tentativas (oportunidade_id, contato_id, canal, fonte)
  VALUES (_opp_id, NEW.contato_id, 'call', 'webhook')
  ON CONFLICT DO NOTHING;

  -- Força recálculo imediato do score deste lead
  PERFORM recalcular_discagem_score_single(_opp_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_registrar_tentativa_discagem
  AFTER INSERT ON comunicacoes
  FOR EACH ROW EXECUTE FUNCTION registrar_tentativa_discagem();
```

**3b — Prompt de resultado (UI, 30s após detecção):**

```typescript
// No DiscagemTab.tsx — componente de prompt de resultado
// Aparece automaticamente quando discagem_tentativas tem registro sem resultado
// para um lead que o SDR atual ligou

function PromptResultado({
  tentativaId, nomeLead, onSubmit
}: {
  tentativaId: string
  nomeLead: string
  onSubmit: (resultado: string) => void
}) {
  const opcoes = [
    { id: 'agendou',      icon: '📅', label: 'Agendou' },
    { id: 'nao_atendeu',  icon: '📵', label: 'Não atendeu' },
    { id: 'em_andamento', icon: '🔄', label: 'Vai pensar' },
    { id: 'descartado',   icon: '✕',  label: 'Descartado' },
  ]
  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-empire-border bg-white shadow-xl p-4 w-72 animate-slide-up">
      <p className="text-xs text-empire-subtle mb-1">Como foi a ligação com</p>
      <p className="text-sm font-bold text-empire-void mb-3">{nomeLead}?</p>
      <div className="grid grid-cols-2 gap-2">
        {opcoes.map(o => (
          <button key={o.id} onClick={() => onSubmit(o.id)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-empire-border
                       text-sm font-medium text-empire-void hover:bg-empire-elevated transition-colors">
            <span>{o.icon}</span> {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**3c — Tick manual como exceção (não fluxo principal):**

Um botão "Registrar contato externo" no card do lead (mesmo 4 botões) para quando a ligação aconteceu fora do GHL. O botão NÃO aparece como ação primária — fica oculto até clicar em "..." no card.

**3d — Cooldown por tentativas:**

Leads com 4+ tentativas sem resultado `agendou` nas últimas 72h mudam automaticamente para estado `mensagem` na função `recalcular_discagem_scores` (score_tentativas = 0 → score total < 30).

**Responsável:** desenvolvedor backend (trigger) + frontend (prompt UI)
**Prazo:** Dias 10-21
**Métrica:** >= 80% das ligações registradas em `discagem_tentativas` com resultado preenchido dentro de 5 minutos da ligação; leads com 4+ tentativas sem resposta zero na lista verde

---

### Pilar 4 — Interface do SDR

**O que fazer:**

Refatorar `DiscagemTab.tsx` para exibir três listas nomeadas em vez de 5 blocos de prioridade. O score nunca aparece. A `razao` do banco é exibida diretamente como linha de contexto.

**Wireframe Textual da Interface:**

```
┌─────────────────────────────────────────────────────────────────┐
│  Pré-Vendas / Painel de Discagem          [Todos os SDRs ▾] [⟳] │
│  sexta-feira, 27 de junho                                        │
│  ────────────────────────────────────────────────────────────── │
│  📞 Ligações hoje: 12                                            │
│                                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🟢 LIGUE AGORA  (3 leads)                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ○  Carla Mendes      respondeu há 8 min    [📞 GHL]             │
│  ○  João Alves        lead novo, 11 min sem contato  [📞 GHL]   │
│  ○  Fernanda Costa    respondeu há 22 min   [📞 GHL]             │
│                                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  🟡 LIGUE HOJE  (8 leads)                    [▾ mostrar]         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  [colapsado por padrão, expande com 1 clique]                    │
│                                                                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  ⚪ MENSAGEM  (5 leads)                       [▾ mostrar]         │
│  [colapsado, automação de WhatsApp sugerida]                     │
└─────────────────────────────────────────────────────────────────┘

Cada linha do lead:
  ○  [Nome]        [razao em texto]           [📞 link GHL]
  ↑               ↑                           ↑
  tick manual    gerado pelo banco             abre contato direto
  (exceção)      ex: "3ª tentativa —
                 cooldown até 14h30"
```

**Regras de exibição:**
- Lista verde ("Ligue Agora"): sempre expandida, máximo visível sem scroll
- Lista amarela ("Ligue Hoje"): colapsada por padrão, expande com 1 clique, título mostra contagem
- Lista cinza ("Mensagem"): colapsada por padrão, mostra botão "Enviar mensagem automática" no header
- Nenhuma lista mostra número de score
- Razão vem do campo `discagem_scores.razao` diretamente — sem lógica de formatação no frontend
- Tick manual: círculo vazio ao lado do nome → ao clicar, abre mini-menu com 4 ícones (exceção para contato externo)
- Prompt de resultado: componente `PromptResultado` aparece no canto inferior direito 30s após webhook detectar ligação — independente do que o SDR estiver fazendo na tela

**Responsável:** desenvolvedor frontend
**Prazo:** Dias 8-21 (paralelo com pilar 2)
**Métrica:** tempo de treinamento para novo SDR usar o discador <= 15 minutos; zero tickets de "não sei para quem ligar" por 30 dias

---

## 4. Fórmula Final do Score

### Componentes e Pesos

| Componente | Peso | Descrição |
|---|---|---|
| Sinal Quente | 40% | Resposta recente via qualquer canal |
| Urgência de Tempo | 35% | Tempo desde `data_lead_recebido` |
| Tentativas Anteriores | 20% | Inversamente proporcional |
| Fonte de Tráfego | 5% | Campanha de alta intenção vs frio |

### Tabela de Pontuação

**Sinal Quente (0–100):**
- Respondeu qualquer canal nos últimos 30 min = 100
- Resposta espontânea sem contato prévio = 90
- Respondeu entre 30 min e 2h = 70
- Respondeu entre 2h e 24h = 30
- Nenhum sinal = 0

**Urgência de Tempo (0–100):**
- Lead chegou há 0–15 min = 100
- Lead chegou há 15–60 min = 75
- Lead chegou há 1–4h = 45
- Lead chegou há 4–12h = 20
- Lead chegou há +12h sem sinal = 5

**Tentativas (0–100):**
- 0 tentativas = 100
- 1 tentativa = 70
- 2 tentativas = 40
- 3 tentativas = 15
- 4+ tentativas sem agendamento em 72h = 0 (lead vai para estado "mensagem" diretamente)

**Fonte (0–100):**
- Campanha com funil CDAV = 100
- Tráfego pago qualificado (utm_source não nulo) = 60
- Orgânico / sem utm = 40

### Estados

- Score >= 65 → **ligue_agora** (verde)
- Score 30–64 → **ligue_hoje** (amarelo)
- Score < 30 → **mensagem** (cinza)

### Exemplos Numéricos

**Cenário A — Lead quente novo:**
- Carla Mendes chegou há 8 min (urgência = 100), respondeu WhatsApp há 8 min (sinal = 100), 0 tentativas (tentativas = 100), campanha CDAV (fonte = 100)
- Score = (100×0.40) + (100×0.35) + (100×0.20) + (100×0.05) = **100** → ligue_agora
- Razão exibida: "respondeu há 8 min"

**Cenário B — Lead médio, 2ª tentativa:**
- João Silva chegou há 3h (urgência = 45), sem inbound (sinal = 0), 2 tentativas (tentativas = 40), tráfego pago (fonte = 60)
- Score = (0×0.40) + (45×0.35) + (40×0.20) + (60×0.05) = 0 + 15.75 + 8 + 3 = **27** → mensagem
- Razão exibida: "2ª tentativa"

**Cenário C — Lead frio reativado:**
- Ana Paula chegou há 2 dias (urgência = 5), respondeu WhatsApp há 12 min (sinal = 100), 3 tentativas (tentativas = 15), orgânico (fonte = 40)
- Score = (100×0.40) + (5×0.35) + (15×0.20) + (40×0.05) = 40 + 1.75 + 3 + 2 = **47** → ligue_hoje
- Razão exibida: "respondeu há 12 min" (componente dominante = sinal_quente)

---

## 5. Riscos e Mitigações

**Risco 1 — Latência do webhook do GHL (3+ minutos em pico):**
O trigger em `comunicacoes` depende de o webhook GHL ter sido processado. Em picos, o SDR já ligou e o lead ainda aparece como pendente.
- Mitigação: O tick manual (botão no card) continua funcionando como override imediato. O SDR sabe que pode usá-lo quando "a bolinha não sumiu". A instrução de onboarding cobre esse caso. O cron de 2 minutos em `discagem_scores` garante que em até 4 minutos (webhook + cron) o estado correto aparece.

**Risco 2 — SDR não responde o prompt de resultado:**
Se o SDR fechar o prompt sem responder, a tentativa fica sem resultado. Score subsequente usa número de chamadas outbound (que existem em `comunicacoes`) mas sem saber se conectou.
- Mitigação: O prompt reaparece na próxima vez que o SDR abrir o discador (estado pendente em `discagem_tentativas` sem `resultado`). Após 10 minutos sem resultado, o sistema assume `nao_atendeu` automaticamente via função SQL de cleanup. Métrica de "prompts sem resposta" fica visível no painel do gestor.

**Risco 3 — Score calculado sem dados de comunicações antigos:**
Leads que chegaram antes da implementação têm histórico de comunicações mas `discagem_tentativas` vazio. O componente de tentativas vai mostrar 0 para todos — inflando o score de leads que já foram chamados 5 vezes.
- Mitigação: Script de backfill que lê `comunicacoes` dos últimos 30 dias e cria registros em `discagem_tentativas` com `resultado = 'nao_atendeu'` para ligações outbound históricas. Executado uma vez antes do go-live. Os dados já existem em `comunicacoes` — é só migrar o cálculo de tentativas de "na hora" para "pré-computado".

---

## 6. Próxima Ação em 24h

Criar a migration `20260630000001_create_discagem_scores.sql` com a tabela e a função `recalcular_discagem_scores()`, rodar `supabase db push` no ambiente de desenvolvimento, e executar `SELECT recalcular_discagem_scores()` manualmente para validar que os scores são calculados corretamente para os leads atuais. Verificar 10 leads aleatórios no resultado comparando o `estado` e a `razao` gerada com o estado real do lead em `comunicacoes`. Se os valores fizerem sentido operacionalmente, agendar o cron e comunicar à equipe de SDRs que o painel está em refatoração — sem mudar a interface ainda.

---

**Arquivos a criar/modificar:**

- `/Users/bguzela/Desenvolvimento/GHL-SUPABASE/supabase/migrations/20260630000001_create_discagem_scores.sql` — tabela + função + cron
- `/Users/bguzela/Desenvolvimento/GHL-SUPABASE/supabase/migrations/20260630000002_create_discagem_tentativas.sql` — tabela de tentativas + trigger em comunicacoes
- `/Users/bguzela/Desenvolvimento/GHL-SUPABASE/eb-dash2/src/hooks/useDiscagem.ts` — refatorar para ler de `discagem_scores` + Realtime
- `/Users/bguzela/Desenvolvimento/GHL-SUPABASE/eb-dash2/src/pages/prevendas/tabs/DiscagemTab.tsx` — 3 listas + PromptResultado + linha de razão
- `/Users/bguzela/Desenvolvimento/GHL-SUPABASE/docs/DISCADOR-PREVENDAS.md` — documentação do novo sistema
