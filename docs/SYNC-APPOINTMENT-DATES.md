# sync-appointment-dates — Sincronização de data_reuniao_agendada via API GHL

| Campo | Valor |
|-------|-------|
| **Status** | ✅ OPERACIONAL |
| **Implementado em** | 2026-03-26 BRT |
| **Atualizado em** | 2026-07-09 BRT |
| **Edge function** | `supabase/functions/sync-appointment-dates/index.ts` |
| **Campos atualizados** | `oportunidades.data_reuniao_agendada`, `data_agendamento_reuniao`, `data_agendamento_vendas` (os 3 sempre recebem o mesmo valor — ver seção "Unificação dos 3 campos" abaixo) + 8 campos de origem do agendamento (`agendamento_origem`, `agendamento_por_user_*`, `agendamento_calendar_*`, `agendamento_assigned_user_*`) + `appointment_status` (status real do GHL — ver seção abaixo) |
| **Escopo alvo** | Oportunidades fora de Recuperação com sinal real de reunião (`data_agendamento_vendas`, `data_reuniao_agendada`, `data_agendamento_reuniao` ou histórico de sync) |
| **Cron** | `sync-appointment-dates-cron` — a cada 5 min (offset :03) |
| **API GHL** | `GET /contacts/{contactId}/appointments` + `GET /calendars/appointments/{appointmentId}` |

## Status real do appointment (2026-07-09)

**Problema:** o painel de agendamentos tinha uma categoria "Sem status" para agendamentos passados sem `data_realizacao_vendas`/`data_no_show`. Diagnóstico direto na API do GHL (edge function com `include_debug`) mostrou que esses agendamentos **têm status** — na amostra de 25: 20 `confirmed`, 5 `cancelled`, 2 `noshow`, 1 `new`, 1 `showed`. O sync só lia `showed`/`noshow`, então `confirmed`/`new`/`cancelled` caíam no limbo.

**Dois bugs colaterais corrigidos junto:**

1. **Cancelados sumiam.** A função filtrava appointments `cancelled`/`canceled` fora antes de escolher a referência; se o contato só tinha cancelados, ela limpava todos os campos de data e o agendamento desaparecia do funil. Cancelado é um desfecho real — agora, quando só há cancelados, o mais recente vira referência com `appointment_status = 'cancelled'` e as datas são preservadas.
2. **Status não corrigia.** A regra antiga "nunca sobrescreve" impedia correção quando o GHL mudava o status (ex: `noshow` → `showed`). Agora, quando o GHL diz `showed`/`completed`, grava `data_realizacao_vendas` e **zera** `data_no_show` (e vice-versa). Para os demais status (`confirmed`/`new`/`cancelled`/`invalid`), preserva as datas existentes e só grava `appointment_status` — o status é quem manda na categoria do painel.
3. **Órfãos (404) poluíam o painel.** Quando o contato não existe mais no GHL (deletado/mesclado), a função só atualizava `last_appointment_sync_at` e deixava a data antiga para trás — essas opps ficavam com `appointment_status` NULL e apareciam como agendamento fantasma. Agora, no 404, a função também limpa as datas de agendamento e o status (o agendamento não existe mais no GHL).

**Nova coluna:** `oportunidades.appointment_status` (texto) — guarda o status exato que o GHL retorna no appointment de referência (`showed`, `completed`, `noshow`, `confirmed`, `new`, `cancelled`, `invalid`, `rescheduled`). É **fato**, não inferência.

Migration: `20260709210000_add_appointment_status.sql`.

**Como o painel usa (componente `AppointmentBalance`):** cada agendamento cai em exatamente uma categoria, por prioridade exclusiva:

1. **Canceladas** — `appointment_status ∈ {cancelled, canceled, invalid}`.
2. **Realizadas** — `data_realizacao_vendas` preenchida ou status `showed`/`completed`.
3. **No-shows** — `data_no_show` preenchida ou status `noshow` (com breakdown IA / humano / sem origem).
4. **A acontecer** — data do agendamento ≥ hoje, sem desfecho.
5. **Aguardando desfecho** — data já passou e o GHL ainda não marcou showed/noshow (tipicamente `confirmed`/`new`). **Não é "sem status":** o status real é `confirmed`/`new`; é ação pendente do time no GHL (marcar se a reunião aconteceu ou foi no-show).

Conta que sempre fecha: `agendamentos = realizadas + no-shows + canceladas + a acontecer + aguardando desfecho`.

> **Observação importante sobre "Aguardando desfecho":** a existência dessa categoria é um sintoma de que o time não está marcando `showed`/`noshow` no GHL. O sistema **não inventa** o desfecho (não transforma `confirmed` em no-show nem em realizada), porque isso distorceria a taxa de comparecimento. Se a operação quiser auto-marcação (ex: "reunião passada sem desfecho após Xh vira no-show"), isso é uma regra de negócio a ser decidida e implementada como automação separada — não como padrão silencioso.

## Rastreamento de origem do agendamento (2026-07-08)

A partir de 2026-07-08, a função passou a rastrear **como** o agendamento foi feito no GHL (IA vs humano), além de **quando**. Para isso, após listar os appointments do contato, ela chama o endpoint de detalhes `GET /calendars/appointments/{appointmentId}` para obter:

- `createdBy.source` → `agendamento_origem` (`conversations_ai`, `calendar_page`, `google_calendar`, `event_sync`, etc.)
- `createdBy.userId` → `agendamento_por_user_id`
- nome/email do usuário criador → `agendamento_por_user_nome`, `agendamento_por_user_email`
- `calendarId` → `agendamento_calendar_id`
- nome do calendário → `agendamento_calendar_name`
- `assignedUserId` → `agendamento_assigned_user_id`
- nome do dono do calendário → `agendamento_assigned_user_nome`

Para traduzir IDs em nomes legíveis, a função consulta primeiro o cache local (`ghl_users` para usuários e `ghl_calendars` para calendários) e só chama a API do GHL se não encontrar. Isso minimiza requisições extras.

Os novos campos são limpos (`NULL`) quando o lead não tem appointment ativo, igual aos campos de data.

### Tabela criada

| Tabela | Propósito |
|---|---|
| `ghl_calendars` | Cache local dos calendários do location GHL (`ghl_id`, `nome`, `location_id`, `workspace_id`) |

### Migration

`20260708190000_add_agendamento_origem_oportunidades.sql`

---

## Unificação dos 3 campos (2026-07-06)

Até 2026-07-06, só `data_reuniao_agendada` era gerenciado por esta função — `data_agendamento_reuniao` e `data_agendamento_vendas` continuavam sendo preenchidos pelo webhook (`extrair_dados_ghl`), com o **mesmo bug de design** que motivou tirar `data_reuniao_agendada` do webhook em março: a cada webhook, o valor era sobrescrito incondicionalmente a partir do `customData` daquele payload específico, sem nenhuma guarda contra payload sem o campo esperado.

**Achado em auditoria real (2026-07-06):** usuário reportou que adicionar uma tag manualmente num lead mudou o KPI de "agendamentos nos últimos 7 dias" (que usa `data_agendamento_reuniao`, exibido em Visão Geral/Aquisição/Produtividade). Query de diagnóstico em produção (últimos 90 dias):

| Situação | Antes da correção | Depois do backfill |
|---|---|---|
| Só `data_agendamento_reuniao` preenchido | 44 | convergindo via cron |
| Só `data_reuniao_agendada` preenchido | 42 | convergindo via cron |
| Os dois preenchidos, mas **diferentes** | 205 | convergindo via cron |
| Os dois preenchidos e **iguais** | 20 | 190+ (medido após 3 backfills manuais) |

**Correção aplicada:**
1. Migration `20260706000000_remove_data_agendamento_reuniao_vendas_from_webhook.sql` — remove `data_agendamento_reuniao` e `data_agendamento_vendas` da função `extrair_dados_ghl` (INSERT e UPDATE), mesmo padrão da migration `20260326110000`.
2. Edge function passa a gravar os 3 campos com o mesmo valor (mesma fonte: o appointment mais recente ativo da API GHL) — tanto ao confirmar uma data quanto ao limpar quando não há appointment ativo.
3. Filtro de elegibilidade (cron e backfill) passou a considerar `data_agendamento_reuniao` também, não só os outros dois — sem isso, opps cujo único sinal era esse campo legado nunca voltariam a ser verificadas.
4. Rodado backfill manual (3 lotes de 200) pra corrigir o histórico imediatamente em vez de esperar a convergência orgânica do cron.

---

## Por que API e não webhook?

O webhook GHL envia o campo `data_da_reunio` (mapeado para `data_reuniao_agendada`) de forma **não confiável**:

- Pode chegar com valor incorreto (formatação inconsistente)
- Pode não chegar após reagendamento
- Pode chegar fora de ordem
- O campo custom `data_da_reunio` não é atualizado em todos os eventos GHL

A API `GET /contacts/{contactId}/appointments` retorna todos os appointments reais cadastrados no calendário do GHL, que é a **fonte de verdade**.

---

## Regra de negócio

Para cada oportunidade elegível fora de **Recuperação**:
1. Busca todos os appointments do contato via API GHL
2. Descarta appointments deletados (`deleted = true`)
3. Descarta appointments cancelados por qualquer sinal canônico do payload (`appointmentStatus`, `appointment_status`, `status`, `calendarStatus` e flags booleanas de cancelamento)
4. Seleciona o appointment ativo com o `startTime` **mais recente**
5. Extrai apenas a parte DATE de `startTime` (ex: `"2026-04-08 15:30:00"` → `"2026-04-08"`)
6. Atualiza `oportunidades.data_reuniao_agendada` com essa data
7. Marca `oportunidades.last_appointment_sync_at` com o timestamp atual

Se o contato não tem nenhum appointment ativo (porque não existe nenhum ou porque todos foram cancelados/deletados) → `data_reuniao_agendada` é limpa (`NULL`) e `last_appointment_sync_at` é atualizada.

**Elegibilidade do cron:**
- exclui `pipeline_id = PIPELINE_RECUPERACAO_ID`
- inclui oportunidades que satisfaçam:
  - `last_appointment_sync_at IS NULL` **(novas opps SEMPRE elegíveis — mesmo sem datas)**
  - OU (`data_agendamento_vendas` ou `data_reuniao_agendada` dentro de 60 dias **E** `last_appointment_sync_at` antigo)

Esse recorte evita custo desnecessário em leads sem reunião e corrige casos reais em que o dashboard mostra reuniões fora do pipeline `Vendas SQL`, como contatos ainda em `Pré-Vendas MQL` ou em outros funis operacionais.

**Caso que motivou a regra `last_appointment_sync_at IS NULL` (2026-04-06):**
Umaopp. com `data_agendamento_vendas = NULL`, `data_reuniao_agendada = NULL` e `last_appointment_sync_at = NULL` **nunca era selecionada** pelo cron, mesmo tendo appointment real no GHL. O bug acontecia porque `NULL >= data` retorna NULL (não TRUE) no PostgreSQL, fazendo a condição `or(data_agendamento_vendas.gte.X, data_reuniao_agendada.gte.X)` falhar silenciosamente para todos os campos NULL. A correção segrega opps nunca sincronizadas (quebra inmediata) das que precisam de re-sincronização (lógica com datas).

---

## Arquitetura Atual

A função **não usa** a fila `ghl_api_jobs`. Ela chama a API GHL diretamente no próprio request para refletir cancelamentos e reagendamentos sem esperar o worker da fila.

## Hardening adicional — 2026-03-31 11:55 BRT

Após um caso real em produção (`moiseshbp@gmail.com`), foi identificado que alguns contatos continuavam com `data_reuniao_agendada` preenchida mesmo após o cron rodar no mesmo dia. Isso mostrou que confiar apenas em `appointmentStatus` era estreito demais para a variedade de payloads do endpoint de appointments.

**Ajustes aplicados:**
- `sync-appointment-dates` agora considera cancelamento também por `appointment_status`, `status`, `calendarStatus`, `calendar_status` e flags booleanas como `canceled`, `cancelled`, `isCanceled`, `isCancelled`
- o filtro de deleção também aceita `isDeleted`, além de `deleted`
- a função passa a aceitar execução direcionada por `opp_id` ou `contact_ghl_id`
- `POST {"include_debug": true}` devolve um resumo dos appointments vistos e dos que permaneceram ativos, para diagnosticar casos sem depender de tentativa e erro no cron

## Ampliação de escopo — 2026-03-31 12:03 BRT

Após os casos reais de `carlos@eusoucarlosferreira.com.br` e `luciney@infowin.com.br`, foi confirmado que o dashboard de reuniões exibe oportunidades fora de `Vendas SQL`, mas o cron ainda sincronizava apenas esse pipeline. Resultado: o GHL tinha appointment válido, `data_agendamento_vendas` estava preenchida, porém `data_reuniao_agendada` ficava `NULL` e a reunião sumia do painel.

**Ajustes aplicados:**
- o cron deixou de restringir a sincronização ao pipeline `Vendas SQL`
- o modo direcionado por `contact_ghl_id` passou a resolver o contato primeiro em `contatos`, em vez de depender de filtro relacional direto no PostgREST
- o universo sincronizado agora segue o mesmo recorte operacional do dashboard: oportunidades fora de Recuperação com sinal real de reunião

## Hardening operacional — 2026-03-31 12:14 BRT

O caso de `guilherme@egservicosdigitais.com.br` mostrou um terceiro modo de falha: o appointment já existia na API GHL (`2026-03-31 14:00:00`, status `confirmed`), mas a linha ainda estava com `data_reuniao_agendada = 2026-03-27` até o reprocessamento manual.

**Causa raiz operacional:** o cron rápido estava tentando revisitar um universo grande demais, incluindo reuniões antigas sem valor operacional imediato. Isso reduz a chance de um lead com reunião de hoje ser atualizado cedo.

**Ajustes aplicados:**
- janela de ressync reduzida de `25` para `10` minutos
- cada execução da function agora processa até `3` sublotes por request (`max_cycles`), em vez de um lote único
- o universo do sync frequente foi restringido ao recorte operacional recente: oportunidades fora de Recuperação com `data_agendamento_vendas` ou `data_reuniao_agendada` nos últimos `60` dias

**Efeito prático:** o cron deixa de desperdiçar capacidade com histórico antigo e passa a concentrar esforço em reuniões atuais e recentes, que são as que afetam o dashboard do dia a dia.

```text
sync-appointment-dates
   │
   ├── busca opps pendentes de sync
   ├── chama GET /contacts/{id}/appointments diretamente
   ├── filtra appointments cancelados/deletados
   └── atualiza/limpa data_reuniao_agendada na própria execução
```

---

## Modos de Operação

### Modo Cron (padrão)
- Processa apenas opps onde `last_appointment_sync_at IS NULL` ou `< NOW() - 25 min`
- Garante que cada lead é sincronizado ~5x por hora (cron a cada 5 min, janela de 25 min)
- `batch_size` padrão da função: `100`
- O cron de produção chama com `{"batch_size": 200}`

### Modo Backfill
- `POST {"backfill": true}` → ignora `last_appointment_sync_at` e processa tudo diretamente
- Ideal para correção histórica ou primeira execução

```bash
# Backfill manual via curl
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-appointment-dates" \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"backfill": true, "batch_size": 200}'
```

---

## Cron Schedule

| Job | Schedule | Frequência | Offset |
|-----|----------|------------|--------|
| `sync-appointment-dates-cron` | `3,8,13,18,23,28,33,38,43,48,53,58 * * * *` | A cada 5 min | +3 min (evita colisão com `*/5` existentes) |

Migration: `20260326100001_cron_sync_appointment_dates.sql`

---

## Migrations

| Migration | O que faz |
|-----------|-----------|
| `20260326100000_add_last_appointment_sync_at.sql` | Adiciona coluna `last_appointment_sync_at TIMESTAMPTZ` em `oportunidades` |
| `20260326100001_cron_sync_appointment_dates.sql` | Registra cron `sync-appointment-dates-cron` |

---

## Formato da Resposta

```json
{
  "mode": "cron",
  "processed": 200,
  "updated": 143,
  "cleared": 7,
  "no_appointment": 32,
  "not_found": 0,
  "api_errors": 0,
  "remaining_never_synced": 0
}
```

---

## Verificação de Saúde

```sql
-- Opps no pipeline Vendas SQL nunca sincronizadas
SELECT COUNT(*)
FROM oportunidades
WHERE pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
  AND last_appointment_sync_at IS NULL;
-- Esperado: 0 (após backfill completo)

-- Últimas sincronizações
SELECT
  nome_contato,
  data_reuniao_agendada,
  last_appointment_sync_at
FROM oportunidades
WHERE pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
  AND last_appointment_sync_at IS NOT NULL
ORDER BY last_appointment_sync_at DESC
LIMIT 10;

-- Opps vencidas para novo sync
SELECT COUNT(*)
FROM oportunidades
WHERE pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'
  AND (
    last_appointment_sync_at IS NULL
    OR last_appointment_sync_at < NOW() - INTERVAL '25 minutes'
  );
```

---

## Troubleshooting

| Sintoma | Causa Provável | Solução |
|---------|---------------|---------|
| `remaining_never_synced` não zera | Ainda existem oportunidades recentes elegíveis fora de Recuperação que nunca passaram pelo cron | Rodar backfill da função e verificar se essas opps têm `data_agendamento_vendas` ou `data_reuniao_agendada` no recorte operacional |
| Lead aparece como reunião, mas appointment foi cancelado no GHL | O payload retornado pela API pode sinalizar cancelamento em campos diferentes de `appointmentStatus` | Função endurecida em `2026-03-31 11:55 BRT`: agora considera múltiplos campos/flags de cancelamento e permite `include_debug` para inspecionar o caso real |
| Lead tem reunião no GHL, mas não aparece no dashboard | A oportunidade está fora de `Vendas SQL` e o cron ainda não tinha sincronizado esse funil | Correção de `2026-03-31 12:03 BRT`: cron ampliado para oportunidades elegíveis fora de Recuperação |
| Lead tem reunião no GHL, mas o banco ainda mostra a data antiga | O cron está cobrindo volume demais e o lead recente não foi reprocessado a tempo | Hardening de `2026-03-31 12:14 BRT`: janela de 10 min, sublotes por execução e escopo recente de 60 dias |
| `data_reuniao_agendada` fica `NULL` após sync | Lead sem appointment ativo no GHL | Normal — isso inclui contato sem appointment ou só com appointments cancelados/deletados |
| `not_found` alto | Contato deletado do GHL | A função trata 404 como terminal, não fica em loop |
| Datas erradas após sync | `startTime` com formato inesperado | Verificar `errors` no response da função |

---

## Relação com o Webhook

O webhook GHL **não popula mais** `data_reuniao_agendada`. A extração via `customData[data_da_reunio]` foi removida da função `extrair_dados_ghl` na migration `20260326110000`. O campo é gerenciado **exclusivamente** pelo cron `sync-appointment-dates`.

**Limpeza de dados históricos:** A migration `20260326110001` zeraa `data_reuniao_agendada` de todas as opps no pipeline Vendas SQL que ainda não haviam sido sincronizadas pela API (onde `last_appointment_sync_at IS NULL`), para que o backfill as re-popule com dados corretos.

---

*Criado em: 2026-03-26 BRT*
