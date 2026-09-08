# Discador de Pré-Vendas

Fila de prioridade inteligente para SDRs ligarem para leads de pré-vendas, ordenada por urgência real (não por ordem de chegada).

---

## Pipelines incluídos

O motor de score (`recalcular_discagem_scores()`) é único e roda para as duas filas, mas separa os resultados por coluna `discagem_scores.escopo`:

| Pipeline | Incluído | Escopo | Onde aparece |
|----------|----------|--------|--------------|
| Pré-Vendas MQL | ✅ | `pre_vendas` | Pré-Vendas → Discagem |
| Auto Agendamento | ✅ | `pre_vendas` | Pré-Vendas → Discagem |
| Recuperação | ✅ (desde 2026-07-05) | `recuperacao` | Recuperação → Discagem |
| Pré-Vendas nMQL | ❌ | — | Fora do discador por enquanto |
| Vendas SQL | ❌ | — | Já passou para vendas — SDR não precisa ligar |

**2026-07-05:** usuário reportou que o discador estava "muito pobre" comparado à versão anterior em produção — leads de Recuperação com tasks do GHL (respostas de reengajamento) tinham sumido porque o pipeline nunca esteve no filtro. Em vez de duplicar a lógica de score/camada, a mesma função agora também pontua o pipeline `Recuperação`, marcando as linhas com `escopo = 'recuperacao'`. A aba **Recuperação → Discagem** (`RecuperacaoPage.tsx`) usa `<DiscagemTab scope="recuperacao" />`, que reaproveita 100% do componente de Pré-Vendas — só troca o filtro de escopo e esconde a sugestão de reengajamento (que não faz sentido ali, já que Recuperação **é** o reengajamento).

---

## Arquitetura

### Tabela `discagem_scores`

Populada a cada 2 min pelo cron `recalcular-discagem-scores`. Cada linha = uma oportunidade em aberto.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `oportunidade_id` | UUID PK | FK para `oportunidades.id` |
| `contato_id` | UUID | FK para `contatos.id` |
| `workspace_id` | UUID | FK para `workspaces.id` — derivado de `contatos.workspace_id` pelo cron. **Obrigatório para RLS** (ver Isolamento de Workspace) |
| `score` | INTEGER (0-1000) | Sub-ordena dentro da camada — escala contínua, sem floor artificial (ver seção Score) |
| `camada` | TEXT | `horario_marcado` / `respondeu` / `lead_novo` / `cadencia` |
| `canal_sugerido` | TEXT | `call` / `whatsapp` / `sms` |
| `numero_tentativa` | INTEGER | Calls outbound nos últimos 14 dias |
| `razao` | TEXT | Motivo em linguagem humana |
| `data_retorno_combinado` | TIMESTAMPTZ | Override manual do SDR (preservado pelo cron) — hoje só alimentado por tasks do GHL, sem UI de "marcar retorno" ainda (ver Débitos Técnicos) |
| `data_entrada_lead` | TIMESTAMPTZ | Cópia de `oportunidades.data_lead_recebido` |
| `data_retorno_previsto` | TIMESTAMPTZ | Reservado — não populado pela versão atual da função (`NULL`) |

### Isolamento de Workspace (2026-07-05)

Antes da migration `20260705000010_discagem_scores_workspace_isolation.sql`, `discagem_scores` **não tinha `workspace_id`** e a policy de leitura liberava qualquer membro ativo de qualquer workspace a ver a fila inteira — vazamento cross-tenant real (nomes, telefones, contexto de conversa). Corrigido:

- Coluna `workspace_id` adicionada e preenchida pelo cron via `JOIN contatos` (oportunidades não tem `workspace_id` direto).
- Policy `workspace_members_read_discagem_scores` agora exige `is_workspace_member(workspace_id)`.
- `buscar_reengajamento()` ganhou o parâmetro obrigatório `p_workspace_id` — sem ele, qualquer usuário autenticado conseguia puxar reengajamento de outros workspaces via RPC direta.
- `useDiscagemScore.ts` filtra a query por `.eq('workspace_id', wid)` e passa `p_workspace_id` na RPC.

### Coluna `oportunidades.data_reuniao_agendada_ts`

Adicionada para guardar o timestamp completo de appointments GHL (a coluna DATE anterior perdia a hora). Alimentada por `sync-appointment-dates` a cada 5 min.

---

## 4 Camadas de prioridade

A camada é determinada na ordem abaixo (primeira que bater vence):

### 1. `horario_marcado` 🔴 Violeta

Lead tem uma task pendente no GHL com palavra-chave de ligação (`ligar`, `call`, `chamar`, `respondeu`, `contato`, `retorno`, `marcar`), vencida ou vencendo hoje.

**Regras (2026-07-05, corrigindo bug real):**
- Só conta task com **até 48h de atraso**. `ghl_tasks` não tem `oportunidade_id` — descobrimos que 148 das 192 tasks pendentes no banco estavam abandonadas há 31-90 dias no GHL (nunca marcadas como concluídas) e dominavam o topo da fila indefinidamente, acima de leads genuinamente novos. Acima de 48h a task é ignorada e o lead cai pro scoring normal.
- A task só é atribuída à **oportunidade mais recente do contato** entre os pipelines válidos (Pré-Vendas MQL, Auto Agendamento, Recuperação) — como `ghl_tasks` é por `contato_id`, sem esse filtro a mesma task vazava pra todas as oportunidades abertas daquele contato, mesmo de pipelines diferentes.
- Score fixo 900-1000 (decai 10pt/h de atraso) — tratado como compromisso operacional, não como sinal de qualidade do lead.

### 2. `respondeu` 🟢 Verde

Lead mandou mensagem inbound nas últimas 2 horas. Urgência visual varia pela recência:
- < 30 min → verde forte ("Respondeu há 4 min")
- > 30 min → verde mais suave ("Respondeu há 1.5h")

### 3. `lead_novo` 🔴 Vermelho pulsante

Lead chegou hoje (desde a meia-noite em SP). Diferente das outras camadas, **não usa o score composto** — tem faixa própria (0-899) ordenada estritamente por horário de chegada: `GREATEST(0, 899 - minutos_desde_chegada / 1.6)`, decaindo a 0 em 24h.

**Por quê (2026-07-05, corrigindo bug real):** mesmo com a recência do composto ajustada pra decair em 24h em vez de 30 dias, MQL/canal/fadiga ainda tinham peso suficiente pra colocar um lead chegado há 5h (mas MQL, já com alguma tentativa) acima de um lead chegado há 20 minutos. Usuário pediu explicitamente: quem chegou agora tem que ir sempre pro topo dos "chegou hoje" — sem outros fatores interferindo na ordem.

> Nota: requer `data_lead_recebido` preenchida. O `sync-opp-dates` roda a cada 10 min — leads muito novos (<10 min) podem aparecer em `cadencia` temporariamente até o sync rodar.

### 4. `cadencia` ⬜ Cinza/Verde/Laranja

Todos os demais. Canal sugerido baseado no número de tentativas:

| Tentativas | Canal | Cor |
|------------|-------|-----|
| 0-2 | Call | Cinza-azul |
| 3-4 | WhatsApp | Verde |
| 5-6 | SMS | Laranja |
| 7+ | — | Removido da fila |

---

## Score composto 0-1000 (2026-07-05)

Versão ativa: `20260705000011_discagem_score_composto.sql`. Substitui a versão anterior por faixas fixas por camada (`20260628050000`, que já havia abandonado o score ponderado 0-100 original por causa de floors artificiais — ex: `GREATEST(60,...)` para "respondeu" deixava um lead que respondeu ontem acima de um lead novo chegado há 4h).

**Metodologia:** análise real de 122 vendas pagas (`vendas_fechamento.data_pagamento_entrada`) vs. ~6.000 contatos que passaram por pré-vendas/vendas, feita em 2026-07-05:

| Sinal | Compradores | Não-compradores | Leitura |
|---|---|---|---|
| Respondeu (≥1 inbound) | 58.8% | 41.7% | sinal mais forte, de longe |
| Msgs inbound (média) | 16.1 | 2.9 | 5.5x mais engajamento |
| Tempo até 1º contato (mediana) | 5.5 dias | 19.9 dias | resposta rápida importa muito |
| Tag MQL | 43.4% | 34.6% | sinal real, mas moderado |
| Tentativas de call (média) | 4.35 | 5.44 | mais ligação NÃO fecha venda |
| Contato humano total (média) | 16.7 | 8.0 | WhatsApp/SMS > ligação pura |

**Pesos aprovados** (score = soma ponderada de 5 sub-scores 0-1000 cada):

| Componente | Peso | Coluna | Fórmula |
|---|---|---|---|
| Sinal de resposta | 40% | `score_sinal` | decai 1pt/min desde o último inbound não respondido, zera em 24h |
| Recência/velocidade | 30% | `score_urgencia` | decai desde `data_lead_recebido` ao longo de 30 dias |
| Qualificação MQL | 15% | `score_qualificacao` | tag `mql` presente = 1000, ausente = 300 (baseline observado) |
| Engajamento por canal certo | 10% | `score_fonte` | touches humanos (call+wpp+sms) nos últimos 14 dias, capado em 10 touches |
| Fadiga de tentativas (penalidade) | 5% | `score_tentativas` | decai com tentativas de call puro nos últimos 14 dias |

**Exceções — fora do composto:**
- `horario_marcado`: task GHL agendada é tratado como compromisso operacional, não como sinal de qualidade do lead. Prioridade fixa 900-1000 (decai 10pt/h de atraso).
- `lead_novo`: faixa própria 0-899, ordenada só por horário de chegada (ver seção "4 Camadas" acima). Recência sozinha decide a ordem — MQL/canal/fadiga não interferem enquanto o lead está nessa camada.

`camada` continua existindo só para exibição (ícone/cor do card: 🔔/💬/🔴/🔁) — não limita mais a faixa do `score`, que agora é único e contínuo entre todos os leads (exceto `horario_marcado`).

> Os pesos estão fixos na função SQL (não há tabela `discagem_config` configurável por workspace ainda — ficou fora do escopo desta rodada). Reavaliar quando houver volume de vendas suficiente para validar estatisticamente pesos diferentes ou por workspace.

---

## Função SQL `recalcular_discagem_scores()`

```sql
-- Cron: */2 * * * * (a cada 2 min)
SELECT recalcular_discagem_scores()
```

**O que faz em cada execução:**
1. **DELETE** — remove leads que saíram dos pipelines válidos ou atingiram 7+ tentativas
2. **INSERT ... ON CONFLICT DO UPDATE** — upsert de todos os leads válidos com scores recalculados
3. Preserva `data_retorno_combinado` via `COALESCE(existente, novo)` — nunca sobrescreve override manual do SDR

---

## Função SQL `buscar_reengajamento(p_sdr_name, p_limit)`

Chamada quando a fila de discagem esvazia. Retorna leads que:
- Estão em `Pré-Vendas MQL` ou `Auto Agendamento`
- Mandaram inbound nos últimos 60 dias (mas esfriaram > 3 dias)
- Não estão na fila ativa OU têm 6+ tentativas em cadência

Retorna: nome, telefone, ghl_id, última mensagem (trecho), contexto textual para reengajamento.

---

## Hook `useDiscagemScore`

**Arquivo:** `eb-dash2/src/hooks/useDiscagemScore.ts` (única implementação — `useDiscagem.ts` legado foi removido em 2026-07-05 por estar morto/não importado em lugar nenhum)

```typescript
const { leads, reengajamento, total, ligacoesHoje, isAdmin, sdrOptions, loading, loadingReengajamento, error, reload } = useDiscagemScore(sdrFilter)
```

- `leads` — lista ordenada por score DESC (a UI atual exibe lista plana, sem blocos por camada)
- `reengajamento` — carregado quando `leads.length === 0`, via RPC `buscar_reengajamento(p_workspace_id, p_sdr_name, p_limit)`
- Auto-refresh a cada 30s e no foco da janela
- SDRs veem apenas sua fila; admins/gestores veem todas + dropdown de filtro

> ⚠️ `marcarRetorno`/`cancelarRetorno` — mencionados em versões antigas deste doc — **nunca foram implementados** na UI atual. `data_retorno_combinado` só é preenchido indiretamente pela camada `horario_marcado`, que lê tasks do GHL contendo palavras-chave de ligação. Reintroduzir essa ação manual é o item 4.6 do handoff (`docs/HANDOFF-OMNX-2026-07-05.md`).

---

## Botão GHL

Abre o contato diretamente no GHL (não disca pelo computador):

```
https://app.gohighlevel.com/v2/location/{GHL_LOCATION_ID}/contacts/detail/{ghl_id}
```

Campo usado: `contatos.ghl_id`

---

## Reengajamento

Quando a fila está vazia, o sistema exibe leads com contexto de conversa para reabertura. Cada card mostra:
- Nome do lead
- Trecho da última mensagem recebida
- "Respondeu há Xd: [...]"
- Botão para abrir no GHL

---

## Migrations relacionadas

| Migration | O que faz |
|-----------|-----------|
| `20260627010000_discagem_scores.sql` | Cria tabela base |
| `20260627010001_recalcular_discagem_scores.sql` | Função v1 + cron pg_cron |
| `20260627080000_discagem_camadas.sql` | Adiciona 4 camadas + `buscar_reengajamento()` |
| `20260627090000_discagem_ghl_appointment_ts.sql` | `data_reuniao_agendada_ts` em oportunidades + campos de exibição |
| `20260628010000_discagem_fix_filtros.sql` | Versão final da função (sem nMQL, sem filtro agendamento_vendas) |
| `20260628050000_discagem_score_escala_1000.sql` | Score contínuo 0-1000 por faixas de camada (superada) |
| `20260705000010_discagem_scores_workspace_isolation.sql` | `workspace_id` em `discagem_scores`, RLS por workspace, `buscar_reengajamento(p_workspace_id, ...)` |
| `20260705000011_discagem_score_composto.sql` | Score composto único (40% resposta + 30% recência + 15% MQL + 10% canal + 5% fadiga), baseado em análise real de conversão |
| `20260705000012_discagem_recuperacao.sql` | Adiciona pipeline `Recuperação` + coluna `escopo` (`pre_vendas`/`recuperacao`) |
| `20260705000013_discagem_fix_tasks_zumbis.sql` | Task GHL só conta como `horario_marcado` com até 48h de atraso (antes: qualquer atraso, inclusive tasks abandonadas há meses) |
| `20260705000014_discagem_task_oportunidade_mais_recente.sql` | Task só é atribuída à oportunidade MAIS RECENTE do contato entre os pipelines válidos — evita vazar pra oportunidades antigas de outro pipeline do mesmo contato |
| `20260705000015_discagem_recencia_intradiaria.sql` | Componente "recência" do composto decai em 24h (não mais 30 dias) |
| `20260705000016_discagem_lead_novo_ordem_cronologica.sql` | `lead_novo` ganha faixa própria (0-899) ordenada só por horário de chegada, sem interferência de MQL/canal/fadiga |
| `20261014000000_discagem_score_redesenho_cadencia.sql` | Redesenho do score de cadência (histórico completo em vez de janelas de 14d/24h), fila reconstruída via tabela temporária, dedup por `(contato, escopo)`, `buscar_reengajamento()` corrigida |
| `20261020000000_discagem_excluir_agendados_e_dedup_por_contato.sql` | Contato com hora marcada sai da fila; reunião já realizada tira de pré-vendas; dedup passa a ser só por contato — versão ativa hoje |

---

## Rótulo "dias na base" (corrigido em 2026-08-24)

O texto ao lado do telefone (`Chegou hoje` / `Chegou ontem` / `Nd na base`) é
calculado no frontend por `fmtDiasNaBase()` em `DiscagemTab.tsx`, a partir de
`data_entrada_lead`.

**Bug corrigido:** a função contava blocos de **24h corridas**. Um lead que
chegou ontem às 15h44 ainda dava 0 às 14h46 de hoje e exibia "Chegou hoje",
contradizendo na mesma linha o badge vindo do banco (`Nunca contatado · 1d na
base`, que usa `ROUND(dias_idade)`). Passou a contar por **dia de calendário em
São Paulo**.

**Por que importa:** a divergência fazia a fila *parecer* fora de ordem para quem
confere pela data — foi assim que chegou o report "não está ordenado do mais
recente para o menos". A ordem é por score de urgência (ver seções acima), nunca
por data de chegada; o que estava errado era só o rótulo.

---

## Botão de ordem: Urgência × Chegada (2026-08-24)

O cabeçalho da fila tem um seletor de duas posições, ao lado do filtro de SDR:

| Ordem | O que faz | Quando usar |
|---|---|---|
| **Urgência** (padrão) | Ordem real da fila: `score` 0-1000 do motor — hora marcada > respondeu > lead novo > cadência | Operação normal de discagem |
| **Chegada** | Mesma fila, reordenada por `data_entrada_lead` — **do mais recente para o mais antigo** | Conferir "o que entrou hoje" sem caçar na lista |

**Regras da implementação (`DiscagemTab.tsx`):**

- É reordenação **só de exibição**. Não muda quem está na fila, não chama o
  banco de novo e não toca no `score` — a fila continua a mesma, em outra ordem.
- Sem `data_entrada_lead` → vai para o fim (não dá para afirmar que é recente).
  Empate de data cai no `score`, para a lista não embaralhar a cada refresh de 30s.
- Em **Chegada**, o rótulo de cada linha deixa de ser "Ligue para N." e vira
  "Lead N." — na ordem de chegada a posição não significa prioridade, e manter
  "Ligue para" mentiria para o SDR. Um aviso no topo da lista repete que a
  prioridade real é a de Urgência.
- A escolha é persistida em `localStorage` (`eb:discagem_ordem`) — a aba
  recarrega sozinha a cada 30s e reescolher a ordem toda hora seria insuportável.

**Origem:** o time comercial reportou a fila como "fora de ordem" por esperar
ordem de chegada. A ordem por urgência está correta e continua sendo o padrão;
o botão dá a segunda visão sem trocar o comportamento da fila.

---

## Quem NÃO entra na fila (regras de elegibilidade)

Consolidado em 2026-08-26. Tudo isto está no `WHERE` da construção da fila em
`recalcular_discagem_scores()` — nada é feito por `DELETE` avulso depois.

| Regra | Motivo |
|---|---|
| `status <> 'open'` ou `pipeline_id IS NULL` | não é lead ativo |
| pipeline fora de Pré-Vendas MQL / Auto Agendamento / Recuperação | não é público da fila |
| sem telefone | não há o que discar |
| tag `bloquear`, `stop bot`, `descartado`, `nao perturbe` | instrução explícita de não contatar |
| `vendas_fechamento.data_pagamento_entrada` preenchida | já comprou (regra canônica do projeto) |
| já recebeu ligação outbound **hoje** | não ligar duas vezes no mesmo dia |
| 7+ ligações nos últimos 14 dias | teto de fadiga |
| **o contato tem hora marcada de pé** | *(novo em 2026-08-26)* |
| **o contato já fez a reunião** — só na fila de pré-vendas | *(novo em 2026-08-26)* |

### As duas regras de agendamento (2026-08-26)

São avaliadas **por contato**, não por oportunidade. Esse é o ponto central: a
fila é montada por oportunidade, então um contato com duas oportunidades tinha o
agendamento numa e aparecia na fila pela outra — foi exatamente o caso reportado
(lead agendada exibida pela 2ª oportunidade, em estágio "Chegada").

**Qual sinal, e por quê.** A primeira tentativa usou só o appointment
sincronizado (`data_reuniao_agendada_ts` + `appointment_status`), por ser fato
vindo da API e não campo de pipeline sujeito a cópia por webhook. Medido em
produção antes de aplicar, nas 3.685 linhas da fila: `data_reuniao_agendada_ts`
em 32 linhas, `appointment_status` em 21, contra `data_agendamento_reuniao` em
103 e `data_agendamento_vendas` em 84. O sinal "correto" está quase vazio e não
pegaria nem o caso reportado — a lead agendada tem as datas do pipeline
preenchidas e `last_appointment_sync_at` NULL.

Então a fila usa a **data do agendamento vinda do pipeline**
(`data_reuniao_agendada`, `data_agendamento_reuniao`, `data_agendamento_vendas`,
`data_auto_agendamento`), com uma **janela de 14 dias**. A janela é o que
neutraliza o motivo pelo qual `data_agendamento_vendas` tinha sido banido em
`20260628010000`: o falso-negativo de lá vinha de oportunidade nova nascendo com
a data copiada do histórico — data velha, fora da janela, não bloqueia.

| Situação | Sai da fila? |
|---|---|
| instante da reunião conhecido e ainda à frente (tolerância de 2h) | sim, nas duas filas |
| só a data do agendamento, dentro de 14 dias, sem desfecho | sim, nas duas filas |
| agendamento com mais de 14 dias e sem desfecho | **não** — dado velho não congela lead |
| `data_no_show` / `data_no_show_vendas` preenchida | **não** — devolver ao SDR é o trabalho |
| `cancelled` / `canceled` / `noshow` / `invalid` | **não**, mesma razão |
| `rescheduled` | sim — remarcada ainda é hora marcada |
| reunião realizada | sai **só de pré-vendas**; Recuperação continua vendo |

### Um contato, uma posição, uma fila (2026-08-26)

A deduplicação usava a chave `(contato_id, escopo)`. Contato com uma oportunidade
em `Recuperação` e outra em `Pré-Vendas MQL` entrava nas **duas** filas ao mesmo
tempo — 110 contatos em produção, o que permitia duas pessoas ligarem para o
mesmo lead no mesmo dia. Reportado pelo time como o lead "batendo e voltando de
rec pra 1º contato". Agora a chave é só `contato_id`, e o desempate é
`(escopo = 'pre_vendas') DESC`: oportunidade ativa em pré-vendas significa que o
lead ainda está no fluxo principal; Recuperação é para os dormentes.

**Resultado medido, antes → depois:** pré-vendas 1.580 → 1.546; recuperação
2.105 → 1.997; contatos em duas filas 110 → 0; contato repetido na fila 0.
