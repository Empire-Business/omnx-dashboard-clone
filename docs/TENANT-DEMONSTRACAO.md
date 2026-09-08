# Tenant de Demonstração — "Acme Educação (Demo)"

> **Atualizado em:** 2026-08-04 BRT
> **Status:** ✅ Ativo em produção
> **Recalibrado em 2026-08-04:** o seed original produzia um negócio ruim
> (ROAS Caixa abaixo de 1x, meses com ROI negativo). Ver seção 3.1.
> **Para que serve:** demonstrar o dashboard funcionando na prática, com uma
> operação completa e coerente, sem expor nenhum dado de cliente real.

---

## 1. Como acessar

| | |
|---|---|
| **Login** | `demo@omnx.app` |
| **Senha** | `OmnxDemo@2026` |
| **Workspace** | Acme Educação (Demo) |
| **Método** | Login por senha na tela normal (`/login`). Não precisa de OTP nem e-mail. |

> ⚠️ **Antes de mandar o link para um prospect, troque a senha.** Ela está
> escrita em texto puro neste documento e no arquivo de seed, o que é aceitável
> para um ambiente 100% fictício, mas não é higiene de acesso para um link que
> circula fora da casa.

**Quem mais enxerga esse workspace:** o tenant está vinculado à agência OMNX
(`agency_workspaces`). Por causa da RLS aditiva de agência, quem é **owner ou
admin da agência** vê "Acme Educação (Demo)" no seletor de workspace e pode
entrar nele. Isso é o comportamento de projeto do modelo multi-tenant, não um
vazamento — e é conveniente, porque permite ao dono abrir a demo com a própria
conta. Se você preferir que a demo fique invisível para a agência, basta
remover a linha em `agency_workspaces` (ver §6).

---

## 2. A empresa fictícia

**Acme Educação** — negócio de curso/mentoria de alto ticket, que vende via
aplicação, webinário e desafio, com tráfego pago no Instagram, Facebook,
Google e YouTube, mais canais orgânicos.

| Elemento | Conteúdo |
|---|---|
| **Período coberto** | 2025-08-01 a 2026-07-29 (12 meses) |
| **Pré-vendedores** | Bruna Martins, Diego Salles, Larissa Prado, Rafael Uchoa, **SDR IA** |
| **Closers** | Camila Rocha, Otávio Lins, Priscila Amado |
| **Gestora** | Marina Duarte |
| **Canais pagos** | 6 (Instagram Ads Envolvimento/Interesses/Remarketing, Facebook Lookalike, Google Search, YouTube Ads) |
| **Canais orgânicos** | 5 (Instagram, YouTube, Indicação, Lista de E-mail, Grupo de WhatsApp) |
| **Funis** | 9 (Aplicação, Webinário, Desafio, Masterclass, Lançamento, Social Selling, Evento Presencial, Recuperação, Indicação) |
| **Campanhas** | 12 |
| **Pipelines** | 12, com os mesmos nomes e IDs do padrão GHL usado no projeto |

Todos os e-mails são `@acmedemo.test` e todos os links apontam para
`demo.acme.test` — domínios reservados que não existem, então nada pode ser
confundido com dado real nem sair acidentalmente para fora.

---

## 3. O funil gerado (e por que ele fecha)

O ponto mais difícil de uma demo não é ter dado — é ter dado **coerente**.
Um número solto quebra a demonstração inteira. Este é o funil:

```
8.336 leads
  ├─ ~3.230 MQL
  ├─ ~2.510 conectados
  ├─   ~615 reuniões agendadas
  ├─   ~395 reuniões realizadas
  ├─   ~125 no-shows
  └─    131 vendas
+ 567 oportunidades de Recuperação (leads antigos reativados) → 5 vendas
= 8.903 oportunidades · 136 vendas
```

**Indicadores que a demo mostra** (medidos no banco, não estimados —
valores de 2026-08-04, cobrindo ago/2025 a ago/2026):

| Indicador | Valor |
|---|---|
| Investimento em tráfego pago | R$ 488.753 |
| Investimento em equipe orgânica | R$ 217.217 |
| **Investimento total** | **R$ 705.970** |
| Faturamento bruto | R$ 2.162.500 |
| Caixa (entradas) | R$ 1.259.758 |
| Taxa de recebimento | 58,3% |
| Ticket médio | ~R$ 15.900 |
| **ROAS** (faturamento / investimento total) | **3,06x** |
| **ROI** | **+206%** |
| **ROAS Caixa** (caixa / tráfego pago) | **2,58x** |
| Conversão lead → venda | 1,53% |
| Pior mês do ano | ROI +102% (ago/2025) |

Os pré-vendedores e closers têm **desempenho diferente entre si** de
propósito: a Bruna converte mais com menos agendamentos, a Priscila tem taxa
de conversão menor. Sem essa variação, os rankings e leaderboards ficam sem
graça e a demo não prova nada.

### 3.1 Por que o seed foi recalibrado (2026-08-04)

O seed original entregava um negócio que **a própria tela reprovava**:

| Problema | Valor antigo | Por que quebrava a demo |
|---|---|---|
| ROAS Caixa abaixo de 1x | 0,99x no ano, 0,77x nos últimos 30 dias | O card na aba Tráfego dizia, em números, que saiu mais dinheiro do que entrou |
| Meses com ROI negativo | ago/25 −71%, mar/26 −12%; jan, mai e jun quase zerados | Gráfico temporal serrilhado, com barras vermelhas no meio do ano |
| Taxa de recebimento baixa | 46% | Passava impressão de inadimplência alta |
| Linha do tempo parada | dados terminavam em 29/07 | Filtro padrão é "últimos 30 dias": todo gráfico despencava a zero no fim |

A correção **não mexeu no investimento** — é ele que produz o CPL e o CPMQL
bonitos. Mexeu em três alavancas: escada de ticket (três produtos, R$ 12.900 /
R$ 17.900 / R$ 24.900), volume de vendas (80 → 136, curva mensal crescente de
6 a 16) e mix de pagamento (35% à vista, 40% em 10x, 25% em 12x → caixa ≈ 58%
do faturado).

Está tudo em `scripts/sql/seed-demo/80-resultado-financeiro.sql`
(determinístico e idempotente) e `81-estender-linha-do-tempo.sql`.

---

## 4. Cobertura por aba

| Aba / módulo | O que alimenta | Status |
|---|---|---|
| **Tráfego** | 5.298 leads pagos, R$ 480 mil investidos, CPMQL R$ 235,87 | ✅ |
| **Aquisição** | mesma base, visão cohort e produtividade | ✅ |
| **Orgânico** | 2.509 leads orgânicos + investimento de equipe orgânica mensal | ✅ |
| **Pré-Vendas** | funil, leads parados, no-shows pendentes, atividades, agendamentos | ✅ |
| **Vendas** (Geral / Reuniões / Produtividade / Cami) | 683 reuniões, 80 vendas com pagamento confirmado | ✅ |
| **Criativos** (Ranking / Biblioteca / Kanban / Testes / Dashboard) | 24 criativos `CR-101`…`CR-124`, 18 rodando no Meta, 19 testes | ✅ |
| **Disparos** | 7 campanhas com tags de trigger/respondeu/parou/erro/converteu | ✅ |
| **Leads** | 8.200 contatos com campos de qualificação preenchidos | ✅ |
| **Metas** | 44 definições (workspace, pré-vendedor, closer, canal) · 532 versões mensais · 2.556 snapshots semanais | ✅ |
| **Relatórios** | 102 snapshots semanais (51 cohort + 51 produtividade) + ~5.400 linhas por módulo | ✅ |
| **SDR IA / Auditoria** | mensagens de automação, casos sem follow-up e de spam plantados | ✅ |
| **Discador** | fila de pré-vendas e de recuperação com score | ✅ |
| **Traqueamento** | canais, campanhas, mídias, funis, objetivos, termos, slugs + 1.646 URLs no catálogo de anúncios e 25 no orgânico | ✅ |
| **Configuração GHL** | 63 campos, 12 pipelines e 72 estágios mapeados | ✅ |
| **Meta Ads → por região** | 20.600 linhas de breakdown em 10 estados | ✅ |

### Tabelas que ficam legitimamente vazias

Não são buraco — são log de operação que só se preenche com uso real, e a
demonstração não perde nada com isso:
`audit_log`, `ghl_discovery_runs`, `notion_sync_runs`, `creative_validations`,
`prevendas_ai_insights`, `stevo_whatsapp_calls`, `maquina_de_conteudo`
(integração Hotmart, fora do escopo da demo).

---

## 5. Como o dado foi gerado

Os arquivos ficam em `scripts/sql/seed-demo/` e devem rodar **nesta ordem**:

| Arquivo | O que cria |
|---|---|
| `00-provisionamento.sql` | workspace, usuário, apps/permissões e toda a taxonomia (canais, campanhas, funis, equipe) |
| `10-crm-core.sql` | contatos, oportunidades, vendas, tags, Recuperação, discador |
| `20-meta-ads.sql` | campanhas, insights diários e investimento Meta Ads |
| `30-criativos.sql` | criativos, testes e critérios do sub-app Criativos |
| `40-disparos-organico-config.sql` | disparos, investimento orgânico e configurações |
| `50-metas-relatorios.sql` | metas, versões, snapshots e relatórios semanais |
| `60-traqueamento-mapeamentos.sql` | catálogos de traqueamento, processos de venda, mapeamento GHL de pipeline/estágio e breakdown regional do Meta |
| `70-logs-operacionais.sql` | logs de operação |
| `80-resultado-financeiro.sql` | **recalibra o resultado** — escada de ticket, curva de vendas e mix de pagamento (ver seção 3.1) |
| `81-estender-linha-do-tempo.sql` | estende a janela até a data corrente (**não é automático** — ver abaixo) |
| `99-teardown.sql` | remoção completa (destrutivo — leia o cabeçalho) |

⚠️ **O demo envelhece.** `81-estender-linha-do-tempo.sql` foi aplicado uma vez
(2026-08-04) para cobrir 30/07–04/08. Conforme o tempo passa, os últimos dias
voltam a ficar zerados e os gráficos terminam despencando. Para reaplicar,
ajuste a janela de origem e o deslocamento no cabeçalho do arquivo — e rode
`80-resultado-financeiro.sql` **depois**, para que os leads novos entrem na
escada de ticket e na curva de vendas.

**Toda a variação vem de hash determinístico** sobre o índice do lead
(`hashtext`), nunca de `random()`. Isso significa que o resultado é
reprodutível: rodar de novo gera a mesma empresa fictícia, não uma diferente.

Todos os arquivos são **idempotentes** (usam `ON CONFLICT`): rodar duas vezes
não duplica nada.

---

## 6. Manutenção

**Regerar só os dados, mantendo o login e o workspace:**
ver o bloco final de `scripts/sql/seed-demo/99-teardown.sql`.

**Apagar o tenant inteiro:** rodar `99-teardown.sql`. Ele usa a RPC
`purge_workspace_data`, que exige o nome do workspace digitado como
confirmação — a trava contra apagar o workspace errado.

**Tirar a demo da vista da agência:**
```sql
delete from agency_workspaces
where workspace_id = 'd0000000-0000-4000-8000-000000000001';
```

**Trocar a senha do usuário de demonstração:**
```sql
update auth.users
   set encrypted_password = extensions.crypt('<nova-senha>', extensions.gen_salt('bf'))
 where id = 'd0000000-0000-4000-8000-000000000002';
```

---

## 7. Segurança — o que foi verificado

Este tenant vive **no mesmo banco de produção** do cliente real. Por isso as
verificações abaixo foram feitas e precisam ser refeitas se o seed mudar.

### 7.1 Isolamento (validado)

Simulando o JWT de cada usuário direto no banco:

| Quem | O que enxerga |
|---|---|
| `demo@omnx.app` | 8.200 contatos (100% do demo), 1 workspace, **0 linhas do workspace real** |
| Owner do workspace real | os dados dele + os do demo, **porque é owner da agência** (comportamento de projeto, ver §1) |

Os painéis sempre filtram por `workspace_id` do workspace selecionado, então
não existe mistura de número na tela: para ver a demo é preciso trocar de
workspace explicitamente no seletor.

### 7.2 Nenhuma chamada à API real do GoHighLevel (validado)

O maior risco de plantar 8.200 contatos fictícios no banco de produção é que
os **triggers** disparem chamadas reais ao GHL do cliente, poluindo a fila
compartilhada `ghl_api_jobs` e queimando rate limit. Três armadilhas foram
identificadas e neutralizadas:

| Trigger | O que faria | Como foi evitado |
|---|---|---|
| `trg_attribution_on_contact` | busca atribuição na API do GHL para contato de formulário do Facebook sem UTM | `attribution_skip = true` em todo contato fictício |
| `tr_sync_opp_dates_on_insert` | busca datas na API do GHL quando a oportunidade entra sem `data_lead_recebido` | a coluna é sempre preenchida |
| `auto_tag_conectado_on_inbound` | envia PUT de tag para o contato no GHL quando chega mensagem inbound | mensagens inbound só são geradas para contatos que **já** têm a tag `conectado`, condição em que o trigger sai antes de enfileirar |

**Resultado medido:** `0` jobs em `ghl_api_jobs` originados do workspace de
demonstração, e `0` oportunidades fictícias que os crons de sync pegariam
(nenhuma tem `sdr_name`, `data_lead_recebido` ou `pipeline_id` nulo).

### 7.3 Integração GHL inerte

A linha em `ghl_integration_settings` usa `ghl_location_id =
'demo-location-acme-educacao'` e `is_active = false`. Nenhum webhook real casa
com esse location, então não há risco de roteamento indevido de evento.

---

## 8. Armadilhas conhecidas (leia antes de mexer no seed)

1. **`pipeline_id` nunca pode ser NULL.** O PostgREST filtra NULL
   silenciosamente em `.neq()` e o lead some de todos os painéis, sem erro e
   sem log. Ver [`docs/BUG-FIX-PIPELINE-NULL.md`](BUG-FIX-PIPELINE-NULL.md).

2. **Os `pipeline_id` do demo são iguais aos do GHL real, de propósito.**
   O frontend tem constantes hardcoded (`PIPELINE_RECUPERACAO_ID`,
   `PIPELINE_VENDAS_SQL_ID` em `eb-dash2/src/lib/constants.ts`) que só
   funcionam com esses valores. Reusar o ID em outro workspace não vaza nada:
   o isolamento é por `workspace_id`.

3. **A aba Tráfego só conta lead pago cujo `utm_source` esteja cadastrado em
   `utm_sources`** — e a aba Orgânico, em `utm_sources_plain`. Se a taxonomia
   não for semeada primeiro, essas abas mostram zero, corretamente.

4. **O formato do `utm_term` é contrato, não enfeite.**
   `M{n}_O1_{PUBCODE}_CR-{n}_PG{n}` — o painel de Criativos faz `split('_')` e
   lê `parts[2]` como código de público, e extrai o criativo com
   `/(CR|AN)-(\d+)/`. O `ad_name` do Meta segue o mesmo formato. Quebrar isso
   zera a aba Criativos.

5. **Venda só é venda com `data_pagamento_entrada`.** `data_fechado` sozinho
   significa apenas que o card foi movido no GHL, não que houve pagamento.
   Ver [`docs/CONCEITOS-NEGOCIO.md`](CONCEITOS-NEGOCIO.md).

6. **`vendas_fechamento.valor_faturado` é coluna gerada** (entrada + parcelas ×
   valor da parcela). Não pode ser inserida diretamente.

7. **Mais "conectados" que tags `conectado`.** São 2.475 oportunidades com
   `data_conectado` contra 1.671 contatos com a tag. Não é inconsistência: o
   trigger `marcar_conectado_ao_perder` preenche `data_conectado` em toda
   oportunidade perdida sem conexão registrada — comportamento real de
   produção, reproduzido de propósito.

8. **Tempo de resposta: use mediana, nunca média.** A média do intervalo entre
   o inbound do lead e o próximo outbound dá ~1.116 minutos, porque uma
   minoria de leads só é retomada na cadência seguinte, dias depois. A mediana
   real é **11,7 minutos**, com 79% respondidos em até 1 hora. Calcular esse
   KPI com `avg()` produz uma meta de "1.300 minutos de tempo de resposta", que
   é obviamente errada para quem olha a tela. Corte outliers acima de 24h.

9. **`goal_versions` tem exclusion constraint de sobreposição**
   (`goal_versions_no_overlap`). Uma "meta revisada no meio do mês" **não** é
   uma segunda versão sobreposta: é encurtar a versão original até o dia 15 e
   criar a revisada do dia 16 ao fim do mês.

10. **`goal_snapshots.status` tem CHECK**: só aceita
    `scheduled | on_track | at_risk | off_track | completed | no_data`. E o
    sinal depende de `target_direction` — em métricas de custo e tempo, ficar
    **abaixo** da meta é o bom resultado.

11. **Arredonde a meta pela unidade.** Meta de "75,60 agendamentos" ou de
    "taxa de conversão de 106%" não existe no mundo real e destrói a
    credibilidade da demonstração na primeira olhada.

12. **Login com erro 500 "Database error querying schema".** Se aparecer isso
    ao entrar com o usuário de demonstração, a causa quase certamente é
    coluna de token `NULL` em `auth.users`. O GoTrue lê
    `confirmation_token`, `recovery_token`, `email_change_token_new`,
    `email_change`, `email_change_token_current`, `phone_change`,
    `phone_change_token` e `reauthentication_token` como **texto** — `NULL`
    quebra a leitura e o erro sai como se fosse problema de schema ou de RLS.
    Acontece sempre que o usuário é criado por SQL em vez da Admin API.
    Correção:
    ```sql
    update auth.users set
      confirmation_token         = coalesce(confirmation_token, ''),
      recovery_token             = coalesce(recovery_token, ''),
      email_change_token_new     = coalesce(email_change_token_new, ''),
      email_change               = coalesce(email_change, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change               = coalesce(phone_change, ''),
      phone_change_token         = coalesce(phone_change_token, ''),
      reauthentication_token     = coalesce(reauthentication_token, '')
    where id = 'd0000000-0000-4000-8000-000000000002';
    ```
    O arquivo `00-provisionamento.sql` já cria o usuário com `''` nessas
    colunas — isto aqui é para diagnóstico, caso reapareça.

---

## 9. Referências

- [`docs/CONCEITOS-NEGOCIO.md`](CONCEITOS-NEGOCIO.md) — MQL, Cohort vs Produtividade
- [`docs/MQL-TAG-CLASSIFICATION.md`](MQL-TAG-CLASSIFICATION.md) — MQL é tag, não pipeline
- [`docs/SINGLE-TENANT-LOCK.md`](SINGLE-TENANT-LOCK.md) — por que o seletor de workspace normalmente fica escondido
- [`docs/FASE-5-AGENCY-UI.md`](FASE-5-AGENCY-UI.md) — modelo de agência e sub-contas
- [`docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`](FASE-8-LGPD-EXPURGO-OFFBOARDING.md) — a RPC `purge_workspace_data` usada no teardown
