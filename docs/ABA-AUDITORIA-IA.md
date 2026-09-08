# Aba Auditoria IA — Módulo Pré-Vendas

| Campo | Valor |
|-------|-------|
| **Versão** | 2.0 |
| **Data** | 2026-08-07 BRT |
| **Status** | Operacional (7 tipos de problema) |
| **Chave** | `pre_vendas.auditoria_ia` |
| **Relacionado** | DASHBOARD-MODULOS.md, COMUNICACOES-SCHEMA.md, CONCEITOS-NEGOCIO.md |

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Problemas Detectáveis](#2-problemas-detectáveis)
3. [Queries SQL](#3-queries-sql)
4. [Estrutura de Dados](#4-estrutura-de-dados)
5. [Componentes](#5-componentes)
6. [Regras de Negócio](#6-regras-de-negócio)
7. [Interações](#7-interações)
8. [Configurações](#8-configurações)

---

## 1. Visão Geral

A aba **Auditoria IA** monitora problemas da SDR IA em tempo real, permitindo identificar rapidamente leads com atendimento problemático pela automação.

### Objetivo

Detectar e exibir anomalias no comportamento da SDR IA que podem impactar a qualidade do atendimento e a experiência do lead.

### Posição

- **Módulo:** Pré-Vendas
- **Posição:** 6ª aba (após "Leads Parados")
- **Ícone:** `AlertTriangle` (Lucide)

### Estrutura Visual

```
┌─────────────────────────────────────────────────────────────────────┐
│  AUDITORIA IA - Monitoramento de Problemas da SDR IA               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Seção: Cards de Resumo por Categoria]                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Sem        │ │ Erros de   │ │ Spam/      │ │ Horário    │       │
│  │ Follow-up  │ │ Entrega    │ │ Excesso    │ │ Inadequado │       │
│  │    15      │ │     8     │ │    23      │ │    12      │       │
│  │ [alta]     │ │ [alta]    │ │ [média]    │ │ [baixa]    │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
│                                                                      │
│  [Filtros: Período, Tipo de Problema, Severidade, Canal]           │
│                                                                      │
│  [Tabela de Problemas Detalhada]                                    │
│  │ Lead         │ Tipo           │ Severidade │ Detalhes          │
│  │──────────────│────────────────│────────────│───────────────────│
│  │ João Silva   │ Sem follow-up │ Alta       │ Última msg há 12d │
│  │ Maria Souza  │ Spam           │ Média     │ 8 msgs em 10min   │
│  │ Pedro Costa  │ Erro entrega  │ Alta       │ WhatsApp failed   │
│  │ ...          │ ...            │ ...        │ ...               │
│                                                                      │
│  [Ao clicar no lead → Modal com histórico completo de conversa]    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Problemas Detectáveis

### 2.1 Sem Follow-up ⚠️ (Prioridade Alta)

**Definição:** Leads atendidos pela IA que não receberam nenhuma mensagem (IA ou humano) há mais de 7 dias.

**Detecção:**
```sql
-- Último outbound (IA ou humano) por contato no período
WITH ultimo_outbound AS (
  SELECT
    c.contato_id,
    MAX(c.data_comunicacao) AS ultimo_contato
  FROM comunicacoes_com_remetente c
  JOIN contatos ct ON ct.id = c.contato_id
  WHERE c.direction = 'outbound'
    AND c.data_comunicacao >= NOW() - INTERVAL '30 days'
    AND ct.workspace_id = '<workspace_id>'
  GROUP BY c.contato_id
)
SELECT *
FROM ultimo_outbound
WHERE ultimo_contato < NOW() - INTERVAL '7 days'
  AND contato_id IN (
    SELECT DISTINCT contato_id
    FROM comunicacoes_com_remetente
    WHERE autor = 'automacao' AND direction = 'outbound'
      AND data_comunicacao >= NOW() - INTERVAL '30 days'
  );
```

**Severidade:**
- **Alta:** >14 dias sem contato
- **Média:** 7-14 dias sem contato

**Ações Sugeridas:**
- Verificar se o lead está no pipeline correto
- Verificar se há erro na sequência do GHL
- Considerar intervenção humana

---

### 2.2 Erros de Entrega 🔴 (Prioridade Alta)

**Definição:** Mensagens da IA que falharam ao ser entregues.

**Detecção:**
```sql
-- Mensagens da IA com status 'failed'
SELECT 
  cm.contato_id,
  cm.contato_nome,
  cm.channel,
  cm.mensagem_body,
  cm.error_msg,
  cm.msg_status,
  cm.data_comunicacao
FROM comunicacoes_com_remetente cm
WHERE cm.autor = 'automacao'
  AND cm.direction = 'outbound'
  AND cm.msg_status = 'failed'
  AND cm.data_comunicacao >= NOW() - INTERVAL '30 days'
ORDER BY cm.data_comunicacao DESC;
```

**Severidade:**
- **Alta:** Erro crítico (número inválido, bloqueio)
- **Média:** Erro temporário (timeout, rate limit)

**Ações Sugeridas:**
- Verificar se o número/email é válido
- Verificar se há bloqueio no canal
- Reenviar mensagem manualmente

---

### 2.3 Spam / Excesso 🟡 (Prioridade Média)

**Definição:** Muitas mensagens da IA em curto intervalo de tempo para o mesmo lead.

**Detecção:**
```sql
-- Mais de N mensagens da IA em M minutos
WITH ia_messages AS (
  SELECT 
    contato_id,
    data_comunicacao,
    LAG(data_comunicacao) OVER (PARTITION BY contato_id ORDER BY data_comunicacao) as prev_msg_time
  FROM comunicacoes_com_remetente
  WHERE autor = 'automacao'
    AND direction = 'outbound'
    AND data_comunicacao >= NOW() - INTERVAL '30 days'
),
fast_messages AS (
  SELECT 
    contato_id,
    data_comunicacao,
    prev_msg_time,
    EXTRACT(EPOCH FROM (data_comunicacao - prev_msg_time)) as segundos_entre_msgs
  FROM ia_messages
  WHERE prev_msg_time IS NOT NULL
)
SELECT 
  contato_id,
  COUNT(*) FILTER (WHERE segundos_entre_msgs < 300) as msgs_rapidas_5min,
  COUNT(*) FILTER (WHERE segundos_entre_msgs < 600) as msgs_rapidas_10min,
  COUNT(*) as total_msgs
FROM fast_messages
GROUP BY contato_id
HAVING COUNT(*) FILTER (WHERE segundos_entre_msgs < 600) > 5
ORDER BY msgs_rapidas_10min DESC;
```

**Parâmetros:**
- Crítico: >5 mensagens em 5 minutos
- Alto: >5 mensagens em 10 minutos
- Médio: >3 mensagens em 10 minutos

**Severidade:**
- **Alta:** >5 msgs em 5min
- **Média:** >5 msgs em 10min

**Ações Sugeridas:**
- Revisar configuração da sequência no GHL
- Adicionar delay entre mensagens
- Configurar rate limit

---

### 2.4 Horários Inadequados 🟢 (Prioridade Baixa)

**Definição:** Mensagens da IA enviadas fora de horário comercial.

**Detecção:**
```sql
-- Mensagens da IA fora de horário comercial (22h-08h SP)
SELECT 
  cm.contato_id,
  cm.contato_nome,
  cm.channel,
  cm.mensagem_body,
  cm.data_comunicacao AT TIME ZONE 'America/Sao_Paulo' as horario_sp,
  EXTRACT(HOUR FROM cm.data_comunicacao AT TIME ZONE 'America/Sao_Paulo') as hora
FROM comunicacoes_com_remetente cm
WHERE cm.autor = 'automacao'
  AND cm.direction = 'outbound'
  AND (
    EXTRACT(HOUR FROM cm.data_comunicacao AT TIME ZONE 'America/Sao_Paulo') < 8
    OR EXTRACT(HOUR FROM cm.data_comunicacao AT TIME ZONE 'America/Sao_Paulo') >= 22
  )
  AND cm.data_comunicacao >= NOW() - INTERVAL '30 days'
ORDER BY cm.data_comunicacao DESC;
```

**Parâmetros:**
- Horário comercial: 08:00 - 22:00 (SP)
- Horário inadequado: 22:00 - 08:00 (SP)

**Severidade:**
- **Média:** Mensagens de madrugada (00:00 - 06:00)
- **Baixa:** Mensagens cedo/noite (06:00 - 08:00 ou 22:00 - 00:00)

**Ações Sugeridas:**
- Configurar janela de envio no GHL
- Usar "business hours" nas automações

---

### 2.5 Conversas Unilaterais

**Definição:** Leads que nunca responderam às mensagens da IA.

**Detecção:**
```sql
-- Leads com >3 mensagens da IA e 0 respostas do lead
WITH ia_interactions AS (
  SELECT 
    contato_id,
    COUNT(*) FILTER (WHERE autor = 'automacao' AND direction = 'outbound') as msg_ia,
    COUNT(*) FILTER (WHERE direction = 'inbound') as respostas_lead
  FROM comunicacoes_com_remetente
  WHERE data_comunicacao >= NOW() - INTERVAL '30 days'
  GROUP BY contato_id
)
SELECT 
  c.id,
  c.nome,
  c.tags,
  ii.msg_ia,
  ii.respostas_lead,
  ii.msg_ia - ii.respostas_lead as diferenca
FROM ia_interactions ii
JOIN contatos c ON c.id = ii.contato_id
WHERE ii.msg_ia > 3
  AND ii.respostas_lead = 0
  AND c.tags ILIKE '%sdr ia%'
ORDER BY ii.msg_ia DESC;
```

**Severidade:**
- **Média:** >5 mensagens sem resposta
- **Baixa:** 3-5 mensagens sem resposta

**Ações Sugeridas:**
- Revisar qualidade das mensagens
- Considerar abordagem diferente
- Possível lead desqualificado

---

### 2.6 IA vs Humano Conflito

**Definição:** Leads atendidos pela IA que também receberam mensagem de humano (SDR, closer, gestor, social_seller ou qualquer usuário do GHL) no período.

**Detecção:**
```sql
-- Conversas com mensagens de IA E humano no mesmo período
WITH conversas AS (
  SELECT 
    contato_id,
    COUNT(DISTINCT CASE WHEN autor = 'automacao' THEN 1 END) as tem_ia,
    COUNT(DISTINCT CASE WHEN autor != 'automacao' AND direction = 'outbound' THEN 1 END) as tem_humano,
    MAX(CASE WHEN autor = 'automacao' THEN data_comunicacao END) as ultima_ia,
    MAX(CASE WHEN autor != 'automacao' AND direction = 'outbound' THEN data_comunicacao END) as ultimo_humano
  FROM comunicacoes_com_remetente
  WHERE data_comunicacao >= NOW() - INTERVAL '30 days'
  GROUP BY contato_id
)
SELECT 
  c.id,
  c.nome,
  c.tags,
  conv.tem_ia,
  conv.tem_humano,
  conv.ultima_ia,
  conv.ultimo_humano
FROM conversas conv
JOIN contatos c ON c.id = conv.contato_id
WHERE conv.tem_ia > 0 
  AND conv.tem_humano > 0
ORDER BY conv.ultimo_humano DESC;
```

**Severidade:**
- **Alta:** Mensagens simultâneas (mesmo dia)
- **Média:** Mensagens em dias diferentes

**Ações Sugeridas:**
- Verificar se SDR está assumindo o lead
- Atualizar tags no GHL
- Definir responsabilidade clara

---

### 2.7 Reclamação do Lead 🟣 (Prioridade Alta) — desde 2026-08-07

**Definição:** o **lead escreveu** algo indicando que a IA respondeu fora de contexto, repetiu mensagens, falou com a pessoa errada — ou que ele ficou insatisfeito e quer parar de receber contato. É o único detector que **lê o texto da conversa**; todos os outros olham apenas metadados.

**Onde detecta:** mensagens `direction = 'inbound'` do contato, no período, classificadas por expressão regular no corpo da mensagem.

**Motivos detectados (em ordem de precedência):**

| Motivo | Severidade | Exemplo real de produção |
|--------|-----------|--------------------------|
| Pediu para parar de receber mensagens | alta | "pare de mandar msg!!!" |
| Ameaçou bloquear o contato | alta | "vou bloquear vc" |
| Apontou que a IA está repetindo | alta | "vocês já mandaram 3x a mesma mensagem em 3 horas" |
| A IA está falando com a pessoa errada | alta | "você continua mandando pra pessoa errada. eu não sou 'teste'" |
| Percebeu que está falando com um robô | alta | "chega. você é um robô de spam" |
| Demonstrou insatisfação forte | alta | "péssimo atendimento" |
| Resposta da IA ficou fora de contexto | média | "não foi isso que eu perguntei" |
| Sinalizou que não entendeu | média | "não entendi" |

**Guards anti-falso-positivo** (todos derivados de ruído real medido em 180 dias de produção — não são hipóteses):

1. **E-mail de marketing gravado como inbound** — existem mensagens do próprio negócio com `direction = 'inbound'` e `ghl_source = 'workflow'`; o rodapé "unsubscribe" delas casava com "pediu para parar". Filtro: `ghl_source IS DISTINCT FROM 'workflow'`.
   > ⚠️ Não use a view `comunicacoes_com_remetente` para isso: ela marca **todo** inbound como `autor = 'lead'`, inclusive esses.
2. **Eco do texto da IA dentro do inbound** — corpos que começam com `reaction in message:`, `edit message:`, `<telefone> <nome>:` ou `*nome:*` são citação/reação, não fala do lead. Descartados.
3. **Trecho citado em respostas** — tudo antes de `➡️ Message:` e o rodapé `Source: ...` são removidos antes de casar os padrões.
4. **Objeção de preço ≠ reclamação** — "valor absurdo", "tá caro" é negociação comercial. O gatilho `absurdo` só conta se a mensagem **não** falar de preço (`valor|preço|caro|cobrar|mensalidade|investimento|R$|grátis|pago`).
5. **Precisa ter havido IA antes** — só conta se existir mensagem `autor = 'automacao'` **anterior** à reclamação, no período. Corta reclamação dirigida a atendimento humano.

**Ações sugeridas:** ler a conversa completa, assumir com um humano, revisar o prompt/sequência que gerou a resposta e, se o lead pediu para parar, removê-lo das automações.

---

## 3. Queries SQL

### Query Principal (Resumo)

```sql
-- Resumo de todos os problemas (para cards de KPI)
SELECT 
  'sem_followup' as tipo,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE dias_sem_contato > 14) as alta,
  COUNT(*) FILTER (WHERE dias_sem_contato BETWEEN 7 AND 14) as media
FROM (...) -- query sem followup

UNION ALL

SELECT 
  'erro_entrega' as tipo,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE error_msg ILIKE '%invalid%' OR error_msg ILIKE '%block%') as alta,
  COUNT(*) FILTER (WHERE error_msg NOT ILIKE '%invalid%' AND error_msg NOT ILIKE '%block%') as media
FROM (...) -- query erro entrega

UNION ALL

SELECT 
  'spam' as tipo,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE msgs_rapidas_5min > 5) as alta,
  COUNT(*) FILTER (WHERE msgs_rapidas_10min > 5 AND msgs_rapidas_5min <= 5) as media
FROM (...) -- query spam

UNION ALL

SELECT 
  'horario_inadequado' as tipo,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE hora BETWEEN 0 AND 6) as media,
  COUNT(*) FILTER (WHERE hora BETWEEN 6 AND 8 OR hora BETWEEN 22 AND 24) as baixa
FROM (...) -- query horário

UNION ALL

SELECT 
  'conversa_unilateral' as tipo,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE msg_ia > 5) as media,
  COUNT(*) FILTER (WHERE msg_ia BETWEEN 3 AND 5) as baixa
FROM (...) -- query unilateral

UNION ALL

SELECT 
  'conflito_humano' as tipo,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE DATE(ultimo_ia) = DATE(ultimo_humano)) as alta,
  COUNT(*) FILTER (WHERE DATE(ultimo_ia) != DATE(ultimo_humano)) as media
FROM (...) -- query conflito;
```

---

## 4. Estrutura de Dados

### TypeScript Types

```typescript
// Tipo de problema
type ProblemaTipo = 
  | 'sem_followup' 
  | 'erro_entrega' 
  | 'spam' 
  | 'horario_inadequado'
  | 'conversa_unilateral'
  | 'conflito_humano'

// Severidade
type Severidade = 'alta' | 'media' | 'baixa'

// Problema individual
type ProblemaIA = {
  id: string
  contato_id: string
  opp_id: string | null          // ID da oportunidade (pipeline != Vendas SQL)
  sdr_humano: string | null      // Nome do SDR humano (sdr_name || owner_name)
  contato_nome: string
  contato_email: string | null
  contato_telefone: string | null
  tags: string[] | null
  tipo: ProblemaTipo
  severidade: Severidade
  detalhes: string
  ultima_interacao: Date
  dias_sem_contato?: number
  msg_ia?: number
  msg_lead?: number
  channel?: string
  error_msg?: string
  acoes_sugeridas: string[]
}

// Resumo de problemas
type ResumoAuditoria = {
  sem_followup: { total: number; alta: number; media: number }
  erro_entrega: { total: number; alta: number; media: number }
  spam: { total: number; alta: number; media: number }
  horario_inadequado: { total: number; media: number; baixa: number }
  conversa_unilateral: { total: number; media: number; baixa: number }
  conflito_humano: { total: number; alta: number; media: number }
}

// Dados do hook
type AuditoriaIAData = {
  problemas: ProblemaIA[]
  resumo: ResumoAuditoria
  loading: boolean
  error: string | null
}

// Filtros
type AuditoriaFilters = {
  startDate: string
  endDate: string
  tipoProblema: ProblemaTipo | 'todos'
  severidade: Severidade | 'todas'
  canal: string | 'todos'
}
```

---

## 5. Componentes

### 5.1 AuditoriaProblemsCard.tsx

**Função:** Exibe cards de resumo com contagem de problemas por categoria.

**Props:**
```typescript
type AuditoriaProblemsCardProps = {
  resumo: ResumoAuditoria
  loading: boolean
  onFilter: (tipo: ProblemaTipo) => void
}
```

**Layout:**
- 4 cards horizontais (problemas principais)
- 3 cards menores (problemas secundários)
- Cores: vermelho (alta), amarelo (média), cinza (baixa)
- Clicável → filtra tabela pelo tipo

---

### 5.2 AuditoriaTable.tsx

**Função:** Exibe tabela detalhada de todos os problemas.

**Props:**
```typescript
type AuditoriaTableProps = {
  problemas: ProblemaIA[]
  loading: boolean
  onLeadClick: (contatoId: string) => void
}
```

**Colunas:**
- Lead (nome + telefone + email)
- Tipo (badge colorido)
- Severidade (ícone + texto)
- Detalhes (descrição do problema)
- Última Interação (timestamp)
- Ações (botão para ver histórico)

---

### 5.3 AuditoriaIATab.tsx

**Função:** Componente principal que integra todos os elementos.

**Estrutura:**
```tsx
export function AuditoriaIATab({ startDate, endDate, loading }) {
  const [filtroTipo, setFiltroTipo] = useState<ProblemaTipo | 'todos'>('todos')
  const [filtroSeveridade, setFiltroSeveridade] = useState<Severidade | 'todas'>('todas')
  
  const { problemas, resumo } = useAuditoriaIA(startDate, endDate)
  
  return (
    <div>
      <AuditoriaProblemsCard 
        resumo={resumo} 
        onFilter={setFiltroTipo} 
      />
      <AuditoriaFilters 
        tipo={filtroTipo}
        severidade={filtroSeveridade}
        onTipoChange={setFiltroTipo}
        onSeveridadeChange={setFiltroSeveridade}
      />
      <AuditoriaTable 
        problemas={problemasFiltrados}
        onLeadClick={handleLeadClick}
      />
    </div>
  )
}
```

---

## 6. Regras de Negócio

### 6.1 Identificação de Mensagens IA

**Campo principal:** `autor = 'automacao'` na view `comunicacoes_com_remetente`

**Critério:**
```sql
autor = 'automacao' -- calculado pela view
-- OU diretamente na tabela:
WHERE direction = 'outbound'
  AND (ghl_source IN ('workflow', 'api', 'bot')
       OR (ghl_source IS NULL AND usuario_ghl_id IS NULL))
```

### 6.2 Identificação de Leads IA — por mensagem, não por tag

**Desde 2026-07-09:** o universo da Auditoria IA é definido **diretamente da mensagem enviada**, não pela tag `[CP] SDR IA`. Um contato entra no painel se recebeu ao menos uma mensagem outbound classificada como `autor = 'automacao'` na view `comunicacoes_com_remetente` no período selecionado.

A tag `[CP] SDR IA` virou apenas um **filtro opcional** entre outros (tags, pipelines, UTM source, UTM campaign). Os critérios são configuráveis por workspace na aba **Configuração** (`/sdr-ia?tab=configuracao`, feature `sdr-ia.configuracao`, acesso restrito a owner/admin por padrão). Cada critério é um `FilterValues` (`{ include: string[], exclude: string[] }`, mesmo formato do `MultiSelectFilter`):

- **Tags:** vazio = 100% aberto (qualquer contato do universo é candidato); `include` = só contatos com pelo menos uma dessas tags; `exclude` = nunca inclui contato com essa tag.
- **Pipelines:** mesma lógica, aplicada à oportunidade mais recente do contato.
- **UTM Source / UTM Campaign:** mesma lógica, aplicada direto em `contatos.utm_source`/`contatos.utm_campaign`.

**Default seedado pela migration:**
- Tags → vazio (aberto)
- Pipelines → exclude: `["ZWuCjEXM2VDyLCx8CtGU"]` (Vendas SQL)
- UTM Source / UTM Campaign → sem filtro (aberto)

**Tabela:** `sdr_ia_config` (uma linha por workspace) — colunas `tags_filter`, `pipelines_filter`, `utm_source_filter`, `utm_campaign_filter` (todas `jsonb`). RLS: leitura por qualquer membro, escrita via `can_write_sdr_ia_config()` (admin/owner OU `can_edit=true` explícito na feature `sdr-ia.configuracao`).

**Hook:** `useSdrIaConfig()` (leitura/gravação da config) e `useSdrIaFilterOptions()` (enumera tags/pipelines/UTMs reais do workspace pra popular os `MultiSelectFilter`) em `eb-dash2/src/hooks/useSdrIaConfig.ts`.

**Processamento:** a lógica de detecção dos 6 problemas foi movida para a função PostgreSQL `auditoria_sdr_ia()` (ver seção 9). O frontend chama essa RPC uma única vez e agrupa os resultados por contato.

### 6.3 Exclusão de pipeline — agora configurável (era hardcoded)

Antes de 2026-07-05, leads no pipeline "Vendas SQL" (`ZWuCjEXM2VDyLCx8CtGU`) eram **sempre** removidos da Auditoria IA via `.neq('pipeline_id', PIPELINE_VENDAS_SQL_ID)` hardcoded em `buildSdrMap()`. Esse comportamento agora é o **default seedado** na config (ver 6.2), mas pode ser alterado ou removido livremente na aba Configuração.

### 6.4 SDR Humano

**Campo:** `sdr_humano` em cada problema detectado.

**Fonte:** `oportunidades.sdr_name` com fallback para `contatos.owner_name`.

**Regra:** Se o lead não tiver oportunidade em pipelines de pré-vendas (excluindo Vendas SQL), o campo `sdr_humano` será `null`.

### 6.5 Período Padrão

- **Período de análise:** Últimos 30 dias
- **Período de follow-up:** >7 dias sem contato
- **Período de spam:** Análise em janela de 30 dias

### 6.6 Cores e Badges

| Severidade | Cor | Badge |
|------------|-----|-------|
| Alta | Vermelho | `bg-red-100 text-red-800 border-red-300` |
| Média | Amarelo | `bg-yellow-100 text-yellow-800 border-yellow-300` |
| Baixa | Cinza | `bg-gray-100 text-gray-800 border-gray-300` |

### 6.7 Ações por Tipo

| Tipo | Ações |
|------|-------|
| Sem follow-up | Verificar pipeline, revisar sequência, intervenção humana |
| Erro entrega | Validar contato, verificar canal, reenviar |
| Spam | Ajustar delays, revisar sequência, configurar rate limit |
| Horário inadequado | Configurar business hours no GHL |
| Conversa unilateral | Revisar mensagens, testar nova abordagem |
| Conflito humano | Atualizar tags, definir responsabilidade |
| Loop sem progresso | Revisar sequência, intervenção humana |

---

## 7. Interações

### 7.1 Filtros

- **Período:** Seletor de data (padrão: últimos 30 dias)
- **Tipo de Problema:** Dropdown com todos os tipos
- **Severidade:** Dropdown (Alta, Média, Baixa, Todas)
- **Canal:** WhatsApp, SMS, Email, Todos

### 7.2 Clique no Card de Resumo

Ao clicar em um card de categoria (ex: "Sem Follow-up"):
1. Filtro de tipo é atualizado automaticamente
2. Tabela mostra apenas problemas daquele tipo
3. Scroll automático para a tabela

### 7.3 Clique em um Lead

Ao clicar em uma linha da tabela:
1. Abre modal com histórico completo de conversa
2. Exibe timeline de mensagens (IA e lead)
3. Mostra tags, dados do contato, pipeline atual
4. Permite abrir no GHL

### 7.4 Exportação

Botão de exportar para CSV:
- Todos os problemas visíveis na tabela atual
- Formato: `auditoria-ia-YYYY-MM-DD.csv`

---

## 8. Configurações

### 8.1 Parâmetros Ajustáveis

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `dias_sem_followup_warning` | 7 | Dias sem contato para alertar |
| `dias_sem_followup_critical` | 14 | Dias sem contato para crítico |
| `msgs_rapidas_threshold` | 5 | Mensagens em janela para spam |
| `janela_spam_minutos` | 10 | Janela de tempo para detectar spam |
| `horario_comercial_inicio` | 8 | Hora inicial (SP) |
| `horario_comercial_fim` | 22 | Hora final (SP) |

### 8.2 Configuração no GHL

Para evitar problemas de horário inadequado, configurar no GHL:
- Business Hours: 08:00 - 22:00 (America/Sao_Paulo)
- Timezone: America/Sao_Paulo
- Send within business hours: Enabled

---

## 8.3 ⚠️ Regressão histórica — leia antes de mexer na RPC

Entre 2026-07-16 e 2026-08-07 o painel exibiu **0 problemas em qualquer período**, silenciosamente.

**Causa:** as migrations de hardening cross-tenant `20261004000002` (linha 320) e `20261006000000` (linha 296) recriaram `auditoria_sdr_ia()` com `CREATE OR REPLACE` para adicionar o guard de workspace — correto —, mas **reescreveram o corpo** com uma versão simplificada que devolvia uma única linha por contato com `tipo = 'auditoria'` e `severidade = 'info'`, sem nenhuma detecção.

**Por que ninguém viu:** o hook filtra linhas cujo `tipo` não esteja na lista válida (`useAuditoriaIA.ts`). Como `'auditoria'` não está, **100% das linhas eram descartadas no cliente** — sem erro, sem log, painel zerado. Havia 2.557 mensagens da IA com falha de entrega nos 30 dias anteriores à correção.

**Regra que fica:** ao adicionar guard de segurança a uma função existente com `CREATE OR REPLACE`, **partir da definição atual** (`pg_get_functiondef`) e inserir apenas o guard — nunca reescrever o corpo de memória. E, ao mudar o vocabulário de `tipo`/`severidade` no banco, atualizar `PROBLEMA_TIPOS`/`SEVERIDADES` no hook na mesma sessão: os dois lados formam um contrato fechado que falha em silêncio.

Corrigido por `20261018000000_restaura_auditoria_sdr_ia_e_detector_reclamacao.sql` (aplicado em produção em 2026-08-07).

---

## 9. Backend: função `auditoria_sdr_ia()`

A partir de 2026-07-09, a lógica de detecção dos problemas foi movida para a função PostgreSQL `auditoria_sdr_ia()` (migrações `20260709220000_auditoria_sdr_ia_rpc.sql` e ajustes subsequentes). Isso eliminou a necessidade de carregar dezenas de milhares de linhas de `comunicacoes` no frontend e reduziu o tempo de carregamento do painel.

### Assinatura

```sql
auditoria_sdr_ia(
  p_workspace_id uuid,
  p_start_date date,
  p_end_date date,
  p_include_tags text[] DEFAULT NULL,
  p_exclude_tags text[] DEFAULT NULL,
  p_include_pipelines text[] DEFAULT NULL,
  p_exclude_pipelines text[] DEFAULT NULL,
  p_include_utm_source text[] DEFAULT NULL,
  p_exclude_utm_source text[] DEFAULT NULL,
  p_include_utm_campaign text[] DEFAULT NULL,
  p_exclude_utm_campaign text[] DEFAULT NULL
)
RETURNS TABLE(
  contato_id uuid,
  contato_nome text,
  contato_email text,
  contato_telefone text,
  contato_tags text[],
  opp_id uuid,
  sdr_humano text,
  tipo text,
  severidade text,
  detalhes text,
  ultima_interacao timestamptz,
  msg_ia integer,
  msg_lead integer,
  channel text,
  error_msg text
)
```

### O que a função faz

0. **Guard cross-tenant:** se o chamador não é `service_role` nem membro do workspace, retorna vazio.
1. **Universo:** seleciona contatos do workspace que tiveram ao menos uma mensagem outbound `autor = 'automacao'` no período.
2. **Filtros:** aplica UTM source/campaign no universo (server-side) e tags/pipelines antes de devolver os resultados.
3. **Estatísticas:** calcula, por contato, a contagem de mensagens IA, inbound do lead, outbound humano e a data do último outbound.
4. **Problemas:** detecta os **7** tipos de problema (os 6 originais + `reclamacao_lead`) e atribui severidade.
5. **Deduplicação no frontend:** leads com `erro_entrega` não aparecem como `sem_followup` (o erro já explica a ausência de contato).
6. **Escolha do problema principal (frontend):** ao agrupar por contato, vence a maior severidade; em empate, vence o tipo mais acionável, nesta ordem — `reclamacao_lead` > `erro_entrega` > `spam` > `conflito_humano` > `sem_followup` > `conversa_unilateral` > `horario_inadequado`.

**Desempenho medido em produção (2026-08-07):** ~616 ms para 30 dias no workspace real (106 linhas).

### Chamada no frontend

```typescript
const { data, error } = await supabase.rpc('auditoria_sdr_ia', {
  p_workspace_id: wid,
  p_start_date: startDate,
  p_end_date: endDate,
  p_include_tags: tags.include,
  p_exclude_tags: tags.exclude,
  p_include_pipelines: pipelines.include,
  p_exclude_pipelines: pipelines.exclude,
  p_include_utm_source: utmSource.include,
  p_exclude_utm_source: utmSource.exclude,
  p_include_utm_campaign: utmCampaign.include,
  p_exclude_utm_campaign: utmCampaign.exclude,
})
```

### Hook: useAuditoriaIA.ts

O hook agora é enxuto: chama a RPC, deduplica `sem_followup` quando há `erro_entrega` e agrupa os problemas restantes por contato (o mais severo vira o problema principal, os demais vão para `outros_problemas`).

---

## 10. Checklist de Implementação

```
[x] Criar documentação docs/ABA-AUDITORIA-IA.md
[x] Criar hook useAuditoriaIA.ts
[x] Criar componente AuditoriaProblemsCard.tsx
[x] Criar componente AuditoriaTable.tsx
[x] Criar AuditoriaIATab.tsx
[x] Integrar em PreVendasPage.tsx
[x] Atualizar Sidebar.tsx
[x] Atualizar DASHBOARD-MODULOS.md
[x] Testar queries SQL no Supabase
[x] Validar contagem de problemas
[x] Testar filtros e interações
[x] Testar modal de histórico do lead
[x] Identificar leads IA direto da mensagem (não só pela tag)
[x] Criar RPC `auditoria_sdr_ia()` para agregar problemas no backend
[x] Adicionar testes Playwright para o painel de auditoria
```

---

## 11. Histórico de Alterações

| Data | Alteração | Autor |
|------|-----------|-------|
| 2026-04-03 | Criação inicial da especificação | OMNX Code |
| 2026-07-05 | Critérios de inclusão viraram configuráveis (tags, pipelines, UTMs) | OMNX Code |
| 2026-07-09 | Universo passa a ser identificado pela mensagem (`autor = 'automacao'`), não pela tag `[CP] SDR IA`; criação da RPC `auditoria_sdr_ia()` | OMNX Code |
| 2026-08-07 | **Correção de regressão** (painel exibia 0 problemas desde julho — ver 8.3), novo tipo `reclamacao_lead` (7º detector, único que lê o texto da conversa), `conversa_unilateral` passa a usar a data real da última mensagem, e refino visual dos cards/tabela | OMNX Code |

---

## 12. Referências

- [`docs/DASHBOARD-MODULOS.md`](DASHBOARD-MODULOS.md) — Catálogo de módulos
- [`docs/COMUNICACOES-SCHEMA.md`](COMUNICACOES-SCHEMA.md) — Schema da tabela `comunicacoes`
- [`docs/CONCEITOS-NEGOCIO.md`](CONCEITOS-NEGOCIO.md) — Conceitos de MQL e SDR IA
- [`docs/ABA-ATIVIDADES-PRE-VENDAS.md`](ABA-ATIVIDADES-PRE-VENDAS.md) — Aba Atividades (referência de UI)