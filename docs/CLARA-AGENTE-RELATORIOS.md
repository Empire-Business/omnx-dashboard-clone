# Clara Agente Autônoma de Relatórios

> Sistema de agentes IA para geração de relatórios semanais inteligentes — Clara investiga, cruza dados e gera insights acionáveis em vez de apenas despejar números.

## Arquitetura

```
weekly-email-dispatcher (pg_cron)
  └─ send-weekly-report-email (Edge Function)
       ├─ fetchDashboardData()         — dados do v_weekly_dashboard
       ├─ buildEmailHtml()             — template visual rico
       ├─ callClaraSummary()           — AGENT LOOP com function calling
       │    ├─ resolveWorkspaceCredential('openrouter')
       │    ├─ lê clara_workspace_settings
       │    ├─ system prompt rico
       │    └─ LOOP (máx 10 iterações):
       │         ├─ POST OpenRouter com tools
       │         ├─ Clara decide quais tools chamar
       │         ├─ Edge executa RPC → retorna dados
       │         └─ Clara analisa, decide próximo passo
       └─ sendEmail() via Resend
```

## Ferramentas de Investigação (10 tools)

Cada tool é uma RPC no banco + função TypeScript no módulo `report-tools.ts`:

| Tool | RPC | O que retorna |
|------|-----|---------------|
| `get_kpis` | `get_clara_kpis` | Todos os KPIs (leads, MQLs, spend, CPMQL, ROAS, taxas, receita) |
| `compare_periods` | `get_clara_comparison` | Delta vs semana anterior (% de variação em cada KPI) |
| `get_funnel` | `get_clara_funnel` | Funil completo: contagens + taxas entre etapas |
| `get_creatives` | `get_clara_creatives` | Top 5 e bottom 5 criativos por CPL |
| `get_campaigns` | `get_clara_campaigns` | Breakdown de performance por campanha Meta |
| `get_campaigns_crm` | `get_clara_campaigns_crm` | Campanhas Meta Ads × CRM via `utm_campaigns.page_code` (código `PGxx` extraído do `ad_name`): spend, leads, MQLs, agendamentos, reuniões, vendas, CPMQL, CPAgendamento, CPReunião, CPV, ROAS, ROAS Caixa |
| `get_creatives_crm` | `get_clara_creatives_crm` | Criativos Meta Ads (`CR-xxx` no `ad_name`/`utm_term`) × CRM: mesmas métricas de funil acima por criativo |
| `get_channels` | `get_clara_channels` | Leads/MQLs/vendas por canal (utm_source) |
| `get_trend` | `get_clara_trend` | Tendência de uma métrica nas últimas N semanas |
| `get_benchmarks` | `get_clara_benchmarks` | Médias e desvios-padrão históricos (12 semanas) |

As tools `get_campaigns_crm` e `get_creatives_crm` são as preferidas da Clara ao analisar eficiência de tráfego: elas cruzam investimento Meta Ads com resultado comercial real do CRM, evitando decisões baseadas apenas em CTR ou CPL de plataforma.

### Como funciona o cruzamento de campanhas

O painel de Tráfego usa a tabela `utm_campaigns` como ponte:

- **CRM:** `contatos.utm_campaign` (código numérico) → `utm_campaigns.utm_campaign`
- **Meta Ads:** o `ad_name` contém o `page_code` (ex: `M7_01_PG53_CR-1116` → `PG53`) → `utm_campaigns.page_code`
- **Nome exibido:** `utm_campaigns.nome` (ex: `[cp] maquina-conteudo-online-07-26`)

A Clara usa exatamente esse mesmo mecanismo, garantindo que os números dela batam com os do painel.

## Como a Clara raciocina

O system prompt instrui a Clara a agir como uma **analista sênior com autonomia**:

1. **Investigar antes de concluir** — ela não aceita dados superficiais, busca causas
2. **Comparar sempre** — vs semana anterior, vs benchmarks, vs tendência
3. **Cruzar dados** — se CPMQL subiu, ela investiga criativos e campanhas
4. **Gerar insights acionáveis** — "CPMQL subiu 40% porque o criativo CR-045 está torrando orçamento — pause ele"
5. **Recomendar ações concretas** — termina o relatório com próximos passos

## Configuração

### Via UI (`/relatorios?tab=clara`)

- **Business Context**: descrição do negócio da empresa
- **Modelo IA**: escolha do modelo OpenRouter (default: Qwen 3.6 Plus)
- **Profundidade**: concise / standard / detailed
- **Instruções para relatórios**: instruções específicas para análise semanal

### No schedule de email

- **`use_clara_summary`** = true ativa o agente
- **`clara_prompt`**: instruções específicas para aquela automação

## Schedule padrão: Análise diária completa de tráfego

Criado automaticamente via migration `20260924000007_seed_daily_traffic_analysis_schedule.sql`:

- **Destinatário:** `bruno@aliancadealtovalor.com.br`
- **Frequência:** diário às 08:00 (BRT)
- **Módulo:** `trafego`
- **Clara ativada:** `use_clara_summary = true`, com prompt obrigando o cruzamento de campanhas e criativos com CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS, ROAS Caixa)
- **Formato do e-mail:** `email_format = 'clara_only'` — envia apenas a análise escrita pela Clara, sem o template visual estático de KPIs
- **Criado em:** produção, 2026-07-16

Na UI (`/relatorios?tab=automacoes`) também existe um preset rápido "Análise diária de tráfego" que preenche a mesma configuração para novos schedules.

## Formato do e-mail (`email_format`)

A coluna `email_format` em `weekly_email_schedules` permite escolher entre:

- **`full`** (padrão): template visual rico com KPIs, funil e Meta Ads + análise da Clara ao final.
- **`clara_only`**: apenas a análise autônoma escrita pela Clara. Ideal quando o dono quer um relatório "pensado" em vez de números repetidos do dashboard.

Comportamento fail-closed: quando `email_format = 'clara_only'`, se a Clara não conseguir gerar a análise (ex.: credencial OpenRouter inválida), o e-mail **não é enviado** — evita que o destinatário receba o template visual por engano.

## Arquivos

| Arquivo | Propósito |
|---------|-----------|
| `supabase/functions/send-weekly-report-email/index.ts` | Edge function principal — contém o agent loop e template HTML |
| `supabase/functions/_shared/report-tools.ts` | Definição das 10 ferramentas (interface OpenAI function calling) |
| `supabase/migrations/20260916000000_clara_report_tools_rpcs.sql` | 8 RPCs SQL originais acessíveis por service_role |
| `supabase/migrations/20260924000004_clara_crm_cross_tools.sql` | RPCs de cruzamento Meta × CRM por campanha e criativo |
| `supabase/migrations/20260924000006_fix_clara_creatives_crm_creative_code.sql` | Correção do `creative_code`/`creative_name` em `get_clara_creatives_crm` |
| `supabase/migrations/20260924000008_fix_clara_campaigns_crm_mapping.sql` | Correção do cruzamento de campanhas via `utm_campaigns.nome` |
| `supabase/migrations/20260924000009_fix_clara_campaigns_crm_page_code.sql` | Cruzamento de campanhas via `page_code` (PGxx) — forma adotada pelo painel de Tráfego |
| `supabase/migrations/20260924000007_seed_daily_traffic_analysis_schedule.sql` | Seed do schedule diário para `bruno@aliancadealtovalor.com.br` |
| `supabase/migrations/20260924000010_add_email_format_to_schedules.sql` | Adiciona `email_format` em `weekly_email_schedules` e atualiza as RPCs CRUD |
| `supabase/migrations/20260924000014_list_schedules_setof_table.sql` | Refatora `list_weekly_email_schedules` para `SETOF` (evita cache do PostgREST) |
| `eb-dash2/src/components/relatorios/AutomationForm.tsx` | Formulário de criação/edição de automações (inclui preset diário e seletor de formato) |
| `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts` | Hook que consome as RPCs de agendamentos e expõe `email_format` |
| `eb-dash2/src/pages/relatorios/tabs/ConfigurarClaraTab.tsx` | UI de configuração |
| `eb-dash2/src/hooks/useClaraSettings.ts` | Hook de leitura/escrita das configurações |
| `eb-dash2/tests/clara-daily-traffic-report.spec.ts` | Teste E2E Playwright do schedule e envio de teste |

## Deploy

Migration aplicada, edge function deployada, credenciais OpenRouter seedadas no Vault do workspace Default.

## Problemas operacionais conhecidos

### Credencial OpenRouter inválida (2026-07-16)

A credencial `openrouter` do workspace Default (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`) está respondendo **401 `User not found`** na API da OpenRouter. Por isso, a Clara não consegue gerar a análise autônoma e e-mails `clara_only` não são enviados (fail-closed).

**Ação necessária do dono:** cadastrar uma nova chave de API válida da OpenRouter em `/configuracoes?tab=integracoes` (ou diretamente em `workspace_integration_credentials`) para o provider `openrouter`.

Verificação feita via `dry_run` da edge function `send-weekly-report-email` e probe direto na OpenRouter com a chave descriptografada.
