# Fila de trabalho — aberta em 2026-08-05 BRT

> **Para quem chega agora (outra sessão/IA):** este documento é autossuficiente. Leia a
> seção 1 (o que já foi feito hoje) antes de tocar em qualquer coisa — várias correções
> foram aplicadas em produção nas últimas horas, e refazer ou reverter alguma delas por
> engano é o risco mais provável. Depois vá para a seção 3, que é a fila em si.
>
> **Regras do projeto que valem aqui:** ver [`CLAUDE.md`](../../CLAUDE.md). As três que
> mais pesam nesta fila: (a) modo **só produção** — não existe staging, toda migration
> tem de ser idempotente e mudanças destrutivas pedem backup antes
> ([`docs/DECISAO-SO-PRODUCAO-2026-07-18.md`](../DECISAO-SO-PRODUCAO-2026-07-18.md));
> (b) `tsc`/build **só no fim**, nunca a cada edição; (c) atualizar
> [`docs/MUDANCAS.md`](../MUDANCAS.md) a cada mudança relevante.

---

## 1. O que foi feito hoje (05/08) — não refazer, não reverter

Cinco PRs mergeados. Tudo já está em produção.

| PR | O quê |
|---|---|
| [GHL #73](https://github.com/Empire-Business/GHL-SUPABASE/pull/73) | Caixa passa a ler o cronograma de pagamentos, não só o primeiro |
| [GHL #74](https://github.com/Empire-Business/GHL-SUPABASE/pull/74) | Paginação por cursor — consertou a aba Produtividade, que não abria |
| [GHL #75](https://github.com/Empire-Business/GHL-SUPABASE/pull/75) | Cron `sync-tags` deixa de varrer 2,9 GB a cada 10 min |
| [GHL #76](https://github.com/Empire-Business/GHL-SUPABASE/pull/76) | Filtro de workspace pela coluna própria, sem join com `contatos` (34 queries) |
| [desk #3](https://github.com/Empire-Business/omnx-desk/pull/3) e [#4](https://github.com/Empire-Business/omnx-desk/pull/4) | Renumeração automática de parcelas no desk |

**Números de julho/2026 fechados e conferidos** (não mexer sem motivo novo): caixa do desk
**R$ 200.200**, idêntico ao Relatório de Vendas do dono; caixa total do painel
**R$ 341.836**; faturamento do desk **R$ 641.350,06** — depois somado o ajuste do Thiago.

**Correções de dado aplicadas no banco do desk hoje** (todas com backup):

| Cliente | O que houve |
|---|---|
| Thiago Muniz | faturamento → **R$ 78.000** (entrada 18.000 + 10 parcelas de 6.000), a pedido do Bruno |
| Dante / MTD | Parcela 1 do **contrato** movida de 31/07 para 07/08 (o contrato estava errado, a venda certa) |
| Augusto Kraemer | os 17.000 de 23/07 viraram "Entrada" (venda estava divergente do contrato) |
| Daniel Graziane / Erick | revertidos ao original — a planilha da Larissa estava errada nos dois |

Backups no banco do desk: `_backup_vendas_pendentes_20260805`,
`_backup_vendas_pendentes_20260805_pos_edicao`, `_backup_vendas_pendentes_20260805_pos_edicao_2`,
`_backup_contratos_20260805_rotulo`, `_backup_vendas_pendentes_20260805_rotulo`,
`_backup_thiago_20260805`.

Detalhe completo de cada item em [`docs/MUDANCAS.md`](../MUDANCAS.md) (entradas de 2026-08-05).

---

## 2. Contexto técnico que economiza tempo

**Dois bancos, dois repositórios:**

| | Projeto Supabase | Repositório |
|---|---|---|
| CRM / dashboard | `qzesffnkqgelmtfblzkr` | `GitHub/GHL-SUPABASE` |
| omnx-desk | `wuzmckatbmlpkdxtfhqr` | `GitHub/omnx-desk` |

A ponte desk → CRM é **automática e funciona**: trigger em `vendas_pendentes` →
edge function `vendas-ressincronizar-crm` → `vendas_fechamento` no CRM. Cronometrado hoje:
**1,7 segundo**. Se um número do desk não aparecer no CRM, o problema não é a ponte.

**Três armadilhas de performance que já custaram horas hoje** — e que valem para qualquer
query nova:

1. **Não pagine com OFFSET** em tabela grande. `.range()` fica mais caro a cada página e
   estoura o `statement_timeout` de 8s (o PostgREST devolve **500**). Use
   `fetchAllPagesByCursor` de `eb-dash2/src/lib/supabase/paginate.ts`. Armadilha do cursor:
   `.gt('id', '')` vira `id=gt.` na URL e dá **400** — na 1ª página o filtro fica de fora.
2. **Não filtre workspace por join.** `comunicacoes`, `oportunidades` e `vendas_fechamento`
   têm `workspace_id` próprio, com índice, 100% preenchido. Filtrar por
   `contatos.workspace_id` força varredura da tabela `contatos`: medido, **796 ms contra
   87 ms**.
3. **Erro do PostgREST não é `instanceof Error`.** É objeto `{ message, details, hint, code }`.
   Usar `extractErrorMessage` de `lib/errors.ts` — o padrão antigo engolia a causa e
   mostrava texto genérico, o que atrasou muito o diagnóstico de hoje.

**Onde olhar quando algo "não abre":** log do Postgres primeiro
(`mcp supabase get_logs service=postgres`). `canceling statement due to statement timeout`
é o sinal de query cara. Foi assim que o problema real apareceu, depois de horas
perseguindo a hipótese errada.

---

## 3. A fila

### 3.1 — Painel de discagem não mostra ligações ✅ RESOLVIDO em 2026-08-06

> **O diagnóstico abaixo estava errado num ponto decisivo** e ficou registrado de
> propósito, para não ser refeito. A causa real não era "contato criado por caminho
> desconhecido, sem webhook": o contato **tinha dois webhooks**, e eles mostram que o
> **GHL mesclou dois contatos com o mesmo telefone** e moveu a oportunidade para o
> vencedor. O bug é que `extrair_dados_ghl`/`_v2` (PASSO 2b) **não atualiza `contato_id`**
> — a oportunidade fica presa ao contato perdedor, que nem existe mais no GHL.
>
> Corrigido pela migration `20261016000000` (trigger `zz_reatribuir_oportunidade_contato`
> + backfill de 30 dias com backup) e pelo selo "telefone repetido" no painel. Dimensão
> real medida: **1 oportunidade divergente em 9.099** nos últimos 30 dias — raro, não
> sistêmico. Detalhe completo em [`docs/MUDANCAS.md`](../MUDANCAS.md) (2026-08-06).
>
> Também cai por terra a leitura de que os 169 telefones duplicados eram todos deste
> mecanismo: dos 397 contatos envolvidos, só **42** estão sem histórico nenhum.

<details>
<summary>Diagnóstico original de 05/08 (contém o erro descrito acima)</summary>


**Relato do Bruno:** o painel de discagem (Omnx) não mostra as conversas nem as ligações
do lead **Thiago Cassini**; exibe "0 ligações"; o botão "abrir no CRM" não funciona.

**Já investigado — NÃO é falha de sincronização.** A ligação existe e está correta no banco
(05/08, 17:25, 23 s, por Bruno Andrease) e aparece na aba de Atividades.

A causa são **dois contatos "Thiago Cassini"**, ambos criados em 05/08:

| `ghl_id` | Telefone | Criado | Comunicações | Webhooks |
|---|---|---|---|---|
| `G7IjzS9rZZ136xwNdu6r` | +5511984532019 — **é o telefone do Fernão Battistoni** | 12:42 | 0 | **nenhum** |
| `AgwHsw1xuANDcH7ycsHq` | +5511955905079 — correto | 18:00 | 5 (1 ligação) | 8 |

O painel mostra o primeiro, que de fato tem 0 ligações. O botão do CRM monta a URL com o
`ghl_id` dele (`DiscagemTab.tsx`, `lead.ghlContactId` → `ghlContactUrlForLocation`), e esse id
não tem **um único webhook** em 352 mil registros — não veio pelo fluxo normal e
provavelmente não existe mais no GHL.

O GHL está **consistente**: manda `AgwHsw1x` = Thiago com 95590-5079 e `2NSbrQmp` = Fernão
com 98453-2019. O telefone trocado é problema nosso.

**O problema é maior que esse lead: 169 telefones duplicados, 397 contatos envolvidos.**
Em todos esses casos o painel pode mostrar o registro sem histórico e o SDR conclui que
ninguém falou com o lead.

Conecta com a pendência antiga *"algo apaga/sobrescreve `contatos.telefone` em produção"*.

**Três frentes, na ordem recomendada** (nenhuma autorizada ainda — todas mexem em produção):

1. **Achar a origem** — descobrir que caminho criou `G7IjzS9r` sem nenhum webhook
   (candidatos: `sync_contact_opportunities_job`, `ghl_opp_reconcile_process_job`,
   `sync-contact-tags`, importação manual). **Fazer isto primeiro**: sem saber se o
   vazamento segue ativo, limpar duplicado só adia o problema.
2. **Blindar o painel** — ao haver telefone repetido, preferir o contato com histórico.
   É só código, protege o SDR mesmo com o dado sujo.
3. **Consolidar os 397 contatos** — mesclar histórico e remover fantasmas. A mais invasiva;
   exige backup e decisão explícita do dono.

Query de partida:

```sql
select telefone, count(*) qtd,
       string_agg(nome || ' [' || left(ghl_id,8) || ']', ' | ' order by nome) quem
from contatos
where telefone is not null and telefone <> ''
group by telefone having count(*) > 1
order by qtd desc;
```

</details>

### 3.2 — Lead "não conectado" estando agendado ✅ RESOLVIDO em 2026-08-06

**Verificado no código:** em todas as telas, "conectado" é `oportunidades.data_conectado`
preenchida — a tag `conectado` do contato nunca é consultada. Isso confirma o diagnóstico
abaixo e mostra que **são dois problemas diferentes**:

- **Robert** — histórico na oportunidade perdida, painel mostra a aberta (nunca trabalhada).
  A tela responde *"esta oportunidade foi trabalhada?"*; a pergunta do leitor era
  *"falaram com esta pessoa?"*.
- **Tarabe** — não há divergência: as duas oportunidades conectaram em 23/07. Só aparece
  como não conectado em **Produtividade** com período que não inclui 23/07, que é a
  definição do modo. O problema ali era o **rótulo**.

**Decisão do dono: avisar na tela, sem mexer em métrica.** Propagar `data_conectado` entre
oportunidades inflaria a taxa de conexão de 1.609 contatos e daria crédito ao SDR por
conexão que ele não fez naquele ciclo.

Aplicado (frontend, zero mudança de dado): faixa de aviso no `LeadCard` quando a
oportunidade aberta não tem conexão mas o contato tem outra com histórico; e o card
"Não conectados" do modo Produtividade virou **"Sem conexão no período"** em Aquisição e
Tráfego (Cohort mantém o texto antigo, que ali está correto).

<details>
<summary>Diagnóstico original de 05/08</summary>


**Relato do Bruno:** *"Checar como contatos estão sendo conectados. `robertdantasml@gmail.com`
— no dash consta como não conectado, mas está agendado. Outro caso: `fakecontaei@gmail.com`."*

**Causa: o contato tem VÁRIAS oportunidades, e `data_conectado` é por oportunidade, não por
contato.** A tag `conectado` fica no contato; a data fica na oportunidade. O painel mostra
uma oportunidade, a pessoa olha o contato.

`robertdantasml@gmail.com` — Robert Dantas, `ghl_id` `0t5bcrGXBtIanv7H2cUW`:

| Oportunidade | Pipeline | Status | `data_conectado` | Agendamento |
|---|---|---|---|---|
| `2bd11c7a-38be-4d60-8785-2ab5d0c872c2` | Vendas SQL | lost | **08/07** | 08/07 · reunião realizada 14/07 · `appointment_status = cancelled` |
| `f8ea3f78-21bc-4723-83c2-3dc18ede8beb` | Pré-Vendas nMQL | **open** | **NULL** | nenhum |

A oportunidade **aberta** (03/07, nMQL) é a que aparece como "não conectado". O histórico
real — conexão, agendamento e reunião — está na outra, que está `lost`.

`fakecontaei@gmail.com` — Tarabe, `ghl_id` `yZL1gNrFRUy5vIhkYNhF`: também tem duas
oportunidades (Recuperação `open` e Pré-Vendas MQL `lost`), mas **as duas** têm
`data_conectado = 23/07` e **nenhuma** tem agendamento. O sintoma aqui é diferente do
Robert — confirmar com o Bruno o que exatamente ele viu nesse segundo caso antes de tratar
como o mesmo bug.

**Dimensão do problema** (workspace principal, 8.572 contatos):

| | |
|---|---|
| Contatos com mais de uma oportunidade | **2.648** (31%) |
| Destes, com `data_conectado` divergente entre as oportunidades | **1.609** |
| Agendados sem nenhuma oportunidade conectada | 4 |

**Cuidado antes de "corrigir":** pelo modelo do projeto, **Lead = Oportunidade** e cada
oportunidade é um ciclo independente (ver [`docs/CONCEITOS-NEGOCIO.md`](../CONCEITOS-NEGOCIO.md)).
Então a divergência **pode ser comportamento correto** — não é obviamente bug. A pergunta
real é de produto: *na tela onde o Bruno olhou, o esperado é o status da oportunidade ou o
do contato?* Decidir isso **com ele** antes de escrever código; propagar `data_conectado`
entre oportunidades sem essa definição corromperia métrica de funil.

</details>

### 3.3 — Chat não sincroniza com os leads — DIAGNOSTICADO em 2026-08-06

**O sync não está parado.** Medido em produção: última mensagem gravada **2 minutos**
antes da checagem, 90 na última hora, e a série diária dos últimos 35 dias **não tem um
único dia vazio** — o backfill do buraco de julho fechou. Só 3 comunicações em 282.696
estão sem `contato_id`, e nenhuma delas nos últimos 30 dias.

**O que realmente acontece: a mesma pessoa existe em dois cadastros, e a conversa fica
num enquanto a oportunidade fica no outro.** Duas origens distintas, e elas exigem
tratamentos diferentes:

1. **Mescla no GHL** (caso Thiago Cassini) — resolvido pelo item 3.1.
2. **DDI duplicado no telefone** (achado novo). Exemplo real, Paulo Daré:

| Cadastro | Telefone no webhook | Email | Campos no payload | Comunicações |
|---|---|---|---|---|
| `EBo6bS1k` | `+55` **`55`** `14996026623` | tem | 169–179 | 34 (+ a oportunidade) |
| `UOXsCkcr` | `+5514996026623` | não tem | 16–17 | 0 |

O GHL **não mescla** esses dois, porque para ele são telefones diferentes. Um nasce do
formulário (payload gordo, com email), o outro da conversa de WhatsApp (payload magro,
sem email).

**Dimensão:** 182 contatos com telefone começando em `+5555`, **32 deles na fila de
discagem** — o SDR liga para um número inválido e conclui que o lead não atende.

⚠️ **`55` também é DDD legítimo (Santa Maria/RS)** — corrigir no atacado faria o SDR ligar
para outra pessoa. A separação que resolve isso é objetiva: no grupo do RS, depois de
`+55 55` vem um **9** (celular real); no DDI duplicado, não.

| Grupo | Qtd | Na fila | O que é |
|---|---|---|---|
| A) `+55` `55` `9XXXXXXXX` (13 díg.) | 73 | 12 | DDD 55 do RS — **não tocar** |
| B) 15 dígitos | 45 | 9 | DDI duplicado |
| C) 14 dígitos | 1 | 1 | DDI duplicado provável |
| D) 13 dígitos sem o `9` | 53 | 10 | malformados, sem conserto por regra |
| E) curtos demais | 11 | 0 | lixo |

**✅ Grupo B corrigido em 2026-08-06** (migration `20261017000000`, autorizada pelo dono):
36 telefones, backup em `_backup_contatos_telefone_20260806`.

**Achado que mudou a solução:** `extrair_dados_ghl_v2` grava `telefone = mapped->>'phone'`
**sem COALESCE** — um UPDATE pontual evaporaria no próximo webhook, em silêncio. Por isso a
normalização entrou como **trigger BEFORE em `contatos`**, no ponto de escrita. Isso também
fecha a pendência herdada nº 1 desta fila ("algo sobrescreve `contatos.telefone`").

**Continua aberto:** os **53 do grupo D** (10 na fila) não fecham de nenhuma forma — falta
um dígito, provavelmente digitação errada no formulário; não há regra automática possível.
E os 15 casos com cadastro duplicado seguem com histórico dividido: por decisão do dono,
**apenas sinalizados** na tela (selo "telefone repetido"), sem fusão de dados.

<details>
<summary>Relato original (antes do diagnóstico)</summary>


**Relato do Bruno:** *"Chat não está sincronizando com os leads."* Sem mais detalhes até
agora — **pedir ao Bruno um caso concreto** (lead, horário, o que apareceu e o que devia
aparecer) antes de investigar, senão vira caça no escuro.

Contexto útil para começar: o sync de mensagens ficou **21 dias parado** em julho (14/07 a
04/08) e o backfill do buraco terminou em 05/08 01:59. Ver
[`docs/COMUNICACOES-GHL-SYNC.md`](../COMUNICACOES-GHL-SYNC.md) e o cron
`sync-ghl-conversations-incremental` (`*/10 * * * *`, hoje em 0,1 s).

Vale verificar primeiro se é o mesmo padrão dos itens 3.1 e 3.2 — mensagem gravada num
contato e exibida a partir de outro.

</details>

### 3.4 — Padrão comum entre 3.1, 3.2 e 3.3 (hipótese ✅ CONFIRMADA em 2026-08-06)

Os três relatos podem ter a mesma raiz: **um lead do mundo real está espalhado em mais de um
registro no banco** — dois contatos (3.1) ou duas oportunidades (3.2) — e cada tela escolhe
um deles por conta própria. O usuário vê "sumiu"; o dado está no registro vizinho.

Se a hipótese se confirmar, a correção de maior alcance não é caso a caso: é definir **uma
regra única de "qual registro representa este lead"** e aplicá-la nas telas. Vale testar essa
hipótese antes de abrir três frentes separadas.

**Confirmada em 06/08 — com uma ressalva que muda a conclusão.** Os três relatos são de
fato "um lead do mundo real espalhado em mais de um registro". Mas as causas são
**três mecanismos diferentes**, e uma regra única de exibição resolveria só o sintoma:

| Item | Mecanismo | Correção certa |
|---|---|---|
| 3.1 | GHL mescla contatos; nosso `contato_id` não acompanha | Estrutural, no banco — **feita** |
| 3.3 | Dois cadastros no GHL por DDI duplicado; o GHL nem sabe que são o mesmo | Higiene de telefone, com decisão do dono |
| 3.2 | Um contato, duas **oportunidades** — pode ser comportamento correto | Decisão de produto, não código |

Ou seja: só o 3.1 era bug de vínculo. Unificar "qual registro representa o lead" numa
regra de tela teria escondido os outros dois em vez de resolvê-los.

### 3.5 — Vendas "sem contrato assinado": Dante e Daniel Graziane ✅ NÃO É BUG

Relato do dono (06/08): os dois não saem do card "Vendas sem contrato assinado".

Verificado nos **dois** bancos — não há falha de sincronização; o contrato simplesmente
não foi emitido:

| | CRM (`vendas_fechamento`) | Desk (`contratos`) |
|---|---|---|
| Dante Alighiere | link `NULL`, assinatura `NULL`, `contrato_status = rascunho` | `status = rascunho`, "Não iniciado", sem Clicksign, **0 anexos** |
| Daniel Graziane | link `NULL`, assinatura `NULL`, `contrato_status = rascunho` | idem, **0 anexos** |

O desk é a origem e ele próprio não tem contrato. É pendência **operacional**: emitir e
anexar. Assim que o link entrar, a ponte desk → CRM (1,7 s) tira os dois do card sozinha.

### 3.6 — 500 nas abas de Vendas ✅ RESOLVIDO em 2026-08-06

Voltou por dois motivos: OFFSET ainda vivo em 6 hooks de `oportunidades`, e — o achado
novo — **cursor por `id` também é caro quando a query filtra por período** (1.094 ms
contra 6 ms por página). Helper `fetchAllPagesByTimeCursor`, 8 leituras migradas e 2
índices em produção. Ver [`docs/MUDANCAS.md`](../MUDANCAS.md) (2026-08-06).

### 3.7 — (reservado para as próximas tarefas do dono)

Acrescentar no mesmo formato: relato original, o que já foi investigado, o que falta decidir.

---

## 4. Pendências herdadas, ainda abertas

Nenhuma bloqueia operação, mas todas cobram juros:

1. ~~**`contatos.telefone` sendo sobrescrito em produção**~~ — **✅ EXPLICADA E CONTIDA em
   2026-08-06.** Não era webhook parcial: `extrair_dados_ghl_v2` grava
   `telefone = mapped->>'phone'` **sem COALESCE**, então todo webhook reescreve o campo com
   o que vier do GHL — inclusive número com DDI duplicado. Contido pelo trigger
   `normalizar_telefone_contato` (migration `20261017000000`). Também não era a raiz do
   item 3.1, que acabou sendo mescla de contatos no GHL.
2. **Chave do Vault diverge da env das edge functions.** Não quebra hoje (o guard v1.2 valida
   pela claim do JWT), mas **qualquer deploy com o guard v1.0 derruba tudo em silêncio** —
   foi a causa dos 21 dias de ingestão parada em julho.
3. **Workspace `Burn-in Interno`** tem credencial GHL ativa apontando para conta real com
   conversa viva e zero contatos locais.
4. **Migration `vendas_fechamento_contrato_status`** está aplicada no banco sem arquivo em
   `supabase/migrations/`.
5. **HTZ Imóveis / Fabrine — R$ 360, 28/07.** Está na planilha do dono e no extrato Marvee,
   mas não existe no desk nem no CRM. Única venda de julho sem registro em sistema nenhum.
6. **Edição pela tela do desk não salva** — relato do Bruno ("eu fiz mas ele não salvou
   automaticamente"). O caminho banco → CRM está provado; o formulário da interface **não**
   foi testado. Se estiver engolindo o salvamento, o time digita e perde.
7. **`recalcular-discagem-scores`** — 4,3 s de média, pico de 28 s, 288×/dia (~21 min de
   banco por dia). Próximo da fila de performance, bem menor que o que já foi resolvido.
8. **`count: 'exact'` em `useLeadAtividades`** — operação mais cara daquela tela. Com o join
   removido no PR #76 deve caber; se voltar a pesar, trocar por contagem estimada.

---

## 5. Como retomar

```bash
# 1. Estado dos dois repos (esperado: limpo, na main)
cd GHL-SUPABASE && git status --short && git log --oneline -5
cd ../omnx-desk && git status --short && git log --oneline -3

# 2. O que mudou hoje, em detalhe
#    docs/MUDANCAS.md — entradas de 2026-08-05, da mais recente para a mais antiga

# 3. Saúde dos crons (o pesado já foi resolvido; confirmar que continua barato)
```

```sql
select j.jobname, count(*) execucoes_24h,
       round(avg(extract(epoch from (r.end_time - r.start_time)))::numeric,1) seg_medio,
       round(max(extract(epoch from (r.end_time - r.start_time)))::numeric,1) seg_max
from cron.job_run_details r join cron.job j on j.jobid = r.jobid
where r.start_time > now() - interval '24 hours'
group by 1 order by 3 desc limit 10;
```

Esperado depois das correções de hoje: `sync-tags-from-webhook` abaixo de 1 s (era 34,9 s).
Se voltar aos 30 s, o índice `idx_webhooks_ghl_created_at` sumiu ou o cron 92 voltou à
janela de 7 dias.
