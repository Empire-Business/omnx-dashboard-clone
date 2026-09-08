# Aba "Reuniões" — Módulo Vendas

| Campo | Valor |
|-------|-------|
| **Módulo** | Vendas (`/vendas?tab=reunioes`) |
| **Chave** | `vendas.reunioes` |
| **Status** | ✅ V2 |
| **Criado em** | 2026-03-25 BRT |
| **Atualizado em** | 2026-07-15 BRT |

---

## Propósito

Tabela operacional para monitorar cada reunião de closer — agendadas, realizadas e no-shows — com visão por lead, incluindo funil, canal, status e link de gravação.

---

## Regras de Negócio

### Modo de visualização
- **Só funciona em modo Cohort.** Em modo Produtividade exibe aviso para trocar de modo.
- O filtro principal usa `data_reuniao_agendada` (data prevista da reunião) no período global selecionado em VendasPage.
- Motivo: é um cohort por data de reunião — você seleciona um período e vê **todas as reuniões cuja data prevista cai dentro dele**. Isso é exatamente o padrão Cohort (grupo definido pela data do evento em questão).

### Filtro principal
```
data_reuniao_agendada >= startDate AND data_reuniao_agendada <= endDate
```
Campo tipo `DATE` em `oportunidades`. Representa a data para a qual a reunião foi marcada no calendário.

> **Fonte de dados:** `data_reuniao_agendada` é preenchida e mantida atualizada pelo cron `sync-appointment-dates` (a cada 5 min) via API GHL — `GET /contacts/{contactId}/appointments`. O valor do webhook é considerado não confiável e é sobrescrito pelo cron em até 5 min. O cron cobre oportunidades elegíveis fora de Recuperação, não apenas `Vendas SQL`. Ver `docs/SYNC-APPOINTMENT-DATES.md`.

### Filtro secundário (interno à aba)
Date range por `data_realizacao_vendas` (opcional). Aplicado sobre o conjunto já filtrado pelo principal. Permite cruzar "reuniões previstas no período X" com "realizadas no período Y".

---

## Colunas

| Coluna | Campo | Tipo | Observação |
|--------|-------|------|------------|
| Cliente | `contatos.nome` | Texto (fixo) | Sempre visível, clicável → abre LeadCard |
| Closer | `oportunidades.vendedor_closer` | Texto | |
| Reunião Prevista | `oportunidades.data_reuniao_agendada` | DATE | Filtro principal |
| Realizada em | `oportunidades.data_realizacao_vendas` | DATE | `—` se ainda não realizada |
| Status Reunião | derivado | Badge | Ver tabela abaixo |
| Status Lead | `oportunidades.status` | Badge | `won`/`lost`/`open` → PT |
| Funil | tags do contato | Texto | Primeiro match contra tabela `funnels` |
| Canal | `contatos.utm_source` | Texto | Exibe nome amigável de `utm_sources` / `utm_sources_plain` |
| Gravação | `vendas_fechamento.link_gravacao_call_vendas` | Link | Extraído via trigger do webhook GHL |

Colunas são **reordenáveis** e **ocultáveis** via botão "Colunas" na toolbar. Persiste em `localStorage` (key `eb-dash2:reunioes-tab:columns-v2`).

---

## Derivação do Status da Reunião

Prioridade aplicada sobre campos de `oportunidades`:

| Prioridade | Condição | Status | Cor |
|-----------|----------|--------|-----|
| 1 | `data_fechado` + `paymentMap.has(id)` | Fechado | Verde forte |
| 2 | `data_perdido_vendas` preenchida | Perdido | Vermelho |
| 3 | `data_negociacao` preenchida | Negociação | Dourado |
| 4 | `data_realizacao_vendas` preenchida | Realizada | Verde |
| 5 | `data_no_show_vendas` preenchida | No-show | Vermelho claro |
| 6 | Apenas `data_reuniao_agendada` | Agendada | Azul/prata |

---

## Arquivos

| Arquivo | Papel |
|---------|-------|
| `eb-dash2/src/pages/vendas/tabs/ReunioesTab.tsx` | Componente principal da aba |
| `eb-dash2/src/pages/vendas/VendasPage.tsx` | Registra a aba no TABS + render |
| `eb-dash2/src/components/layout/Sidebar.tsx` | Item "Reuniões" no menu Vendas |
| `eb-dash2/src/hooks/usePreVendas.ts` | `data_reuniao_agendada` no OPP_SELECT |
| `eb-dash2/src/hooks/useTrafego.ts` | `RevenueRow` inclui `link_gravacao_call_vendas` |
| `supabase/migrations/20260325140000_add_link_gravacao_call_vendas.sql` | Coluna + trigger + backfill em `vendas_fechamento` |
| `supabase/migrations/20260325160000_drop_link_gravacao_call_from_oportunidades.sql` | Remove coluna duplicada de `oportunidades` |
| `__tests__/integration/ghl-link-gravacao-call.test.ts` | Prova a extração do link contra o banco de teste (2026-07-15) |

---

## Link de Gravação — Fonte Única: `vendas_fechamento`

O link de gravação da call de vendas é armazenado **exclusivamente** em `vendas_fechamento.link_gravacao_call_vendas`, extraído automaticamente pela trigger `tr_extrair_vendas_fechamento` (função `extrair_vendas_fechamento_do_webhook`) a cada INSERT em `webhooks_ghl`.

### Chave GHL — CONFIRMADA (2026-07-15)

```
customData['{{opportunity.link_da_gravao_da_call_de_vendas}}']
```

(Campo customizado de oportunidade "Link da Gravação da Call de Vendas" — o GHL remove "ç"/"ã" da chave.)

A função vigente (ver `baseline_public_schema`) aceita as **duas grafias** via `COALESCE`: sem espaços (`{{opportunity.link_...}}`) e com espaços (`{{ opportunity.link_... }}`). O GUARD da função inclui o link isoladamente — um webhook que traga só a gravação já cria/atualiza a linha; upserts posteriores preservam o valor (`COALESCE(EXCLUDED..., vf...)`).

**Evidência em produção (SELECT read-only, 2026-07-15):**
- 12 webhooks reais de uma oportunidade (entre 2026-03-25 e 2026-07-05) trazem a chave preenchida com um link do Google Drive; a `vendas_fechamento` correspondente está populada com exatamente esse valor.
- Auditoria completa: das 4.926 linhas de `vendas_fechamento`, as 4.925 sem link pertencem a oportunidades cujos webhooks **nunca** trouxeram a chave preenchida (verificado webhook a webhook) — **zero perda de extração**. A coluna aparece vazia na UI porque o campo customizado quase nunca é preenchido no GHL (uso manual do closer/automação), não por falha técnica.

A aba Reuniões acessa o link via `revenueRows` (que já carrega `vendas_fechamento`), usando um `gravacaoMap` (Map<oppId, link>), e renderiza link clicável ("Ver ↗") quando preenchido e "—" quando vazio.

A coluna `oportunidades.link_gravacao_call` foi removida (migration `20260325160000`) — nunca foi populada e duplicaria dados.

> Cobertura de teste: `__tests__/integration/ghl-link-gravacao-call.test.ts` (4 cenários contra o banco de teste: extração, preservação em upsert, GUARD sem campos relevantes, variação da chave com espaços).
