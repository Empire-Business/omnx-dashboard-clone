# Changelog

## 2026-09-03 BRT — Trafego escondia vendas de Recuperacao: filtro agora e o mesmo em todas as abas

**Origem:** reuniao de 02/09. O dono apontou que Aquisicao mostrava 7 vendas em agosto e
Trafego -> Produtividade mostrava so **2**, faltando **Franklin Gomes** e **Celso Missias**
(citou tambem "Erico Oliveira" — e o Erick Oliveira, pago em 31/07, ou seja julho: cai fora
do periodo pela regua de data de pagamento, nao e bug).

### Causa raiz

Existe um filtro de 3 estados de pipeline Recuperacao (`RecuperacaoFilter`), salvo **por
conta** em `user_dashboard_prefs` via `useDashboardPrefs`. Ele so era respeitado por
**Aquisicao** e **Vendas**. **Trafego** e **Organico** tinham
`.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)` **fixo no codigo** — nao havia como incluir
Recuperacao, nem controle na tela.

A conta usada na reuniao (`ferramentas@`) tem `include_recuperacao` salvo desde 01/09. Por
isso as duas abas divergiam: uma obedecia a preferencia, a outra a ignorava.

Prova em producao (workspace real, vendas pagas em agosto com fonte paga cadastrada):

| Cenario | Vendas na aba Trafego |
|---|---:|
| `exclude_recuperacao` (comportamento antigo, fixo) | **2** — Jonatas Trancoso, Claudio de Andrade |
| `include_recuperacao` (preferencia real da conta) | **4** — + Celso Missias e Franklin Gomes |

As outras 3 vendas de agosto (Bruno Quaresma, Mateus Maia, Robson Machado) sao **organicas**
— corretamente fora do painel de trafego pago. As 3 vendas que apareciam so no banco
(Ana Cardoso, Nathan Ibrahim, Vinicius Vasconcelos) sao do **tenant de demonstracao**, nao
do cliente: isolamento por workspace funcionando.

### Correcoes aplicadas

1. **Trafego passa a respeitar a preferencia da conta** — `useTrafego`, `loadTrafegoDataset`
   e `useProducao` recebem `recuperacaoMode`; `DashboardPage` (Trafego) le
   `useDashboardPrefs()` e exibe o `RecuperacaoFilter` acima dos filtros, igual a Aquisicao.
   O modo entra na `queryKey` do TanStack Query (sem isso o cache serviria o resultado do
   modo anterior).
2. **Organico idem** — `useOrganico`, `OrganicoPage` e o dataset de produtividade da pagina.
3. **Bug: `include_recuperacao` virava `only_recuperacao`.** Nove pontos escreviam o filtro
   a mao como `if (mode === 'exclude') neq(...) else eq(...)` — ou seja, quem pedia "incluir
   Recuperacao" recebia **apenas** Recuperacao. Afetava `useProdutividadeMatrix` (2x),
   `useSDRProdutividade` (2x), `useSDRHighlightChart`, `useSDRAtividade`,
   `useLeadAtividades` e `LeadsParadosTab` (2x). Todos passaram a usar o helper unico
   `applyRecuperacaoFilter`, que trata os 3 estados.
4. **Modal "Fechados" divergia do numero da celula** na matriz de Pre-Vendas: a celula
   contava por `data_pagamento_entrada` (regra correta) e a lista abria por `data_fechado`.
   `CohortRow` agora carrega `fechados_leads`, a mesma lista que gerou o numero.

### Ficou de fora (decisao pendente do dono)

- **Modulo Metas** (`lib/goals/service.ts`) conta venda fechada por
  `oportunidades.data_fechado`, e nao por `vendas_fechamento.data_pagamento_entrada` —
  contrariando a regra critica do `CLAUDE.md`. E exatamente o caso do Erick Oliveira (pago
  31/07, `data_fechado` 02/08): ele cai em julho no dashboard e em agosto nas Metas.
  Corrigir muda o "atual" de metas ja acompanhadas pelo time, entao nao foi aplicado sem
  decisao.
- `MetaOrganicoTab` e as metas do `goals/service.ts` seguem excluindo Recuperacao de forma
  fixa — proposital enquanto as metas nao forem redefinidas.
- **Pre-Vendas** passa `'exclude_recuperacao'` fixo de proposito: Recuperacao tem pagina
  propria (`/recuperacao`, que usa `'only_recuperacao'`).

**Arquivos:** `eb-dash2/src/hooks/useTrafego.ts`, `useProducao.ts`, `useOrganico.ts`,
`useCohort.ts`, `useProdutividadeMatrix.ts`, `useSDRProdutividade.ts`,
`useSDRHighlightChart.ts`, `useSDRAtividade.ts`, `useLeadAtividades.ts`,
`pages/dashboard/DashboardPage.tsx`, `pages/dashboard/tabs/TrafegoTab.tsx`,
`pages/organico/OrganicoPage.tsx`, `pages/prevendas/tabs/LeadsParadosTab.tsx`,
`pages/prevendas/tabs/GeralTab.tsx`.

## 2026-09-02 BRT — Google Ads invisivel no painel de Trafego + conferencia da divergencia "CRM x Meta"

**Origem:** o responsavel pelo trafego relatou por WhatsApp que "os leads do forms e
agendamentos estao bem abaixo do que recebo da Meta e do Sheets que a Meta alimenta os
formularios". Conferencia feita direto em producao (workspace `Default`).

### Veredito da divergencia: nao havia perda de lead

Funil de agosto/2026, numero a numero:

| Etapa | Leads |
|---|---:|
| Meta reporta (R$ 45.158 investidos) | 662 |
| Oportunidades no CRM em agosto | 1.364 |
| − pipeline Recuperacao (o painel exclui) | −303 |
| − organico e sem atribuicao | −440 |
| **= painel de Trafego** | **621** (−6% vs Meta) |
| − sem a tag MQL | −392 |
| **= com filtro "so MQL" ligado** | **229** (−65% vs Meta) |

A sensacao de "bem abaixo" e quase certamente o ultimo degrau: **a Meta conta formulario
preenchido, MQL e qualificacao posterior** — nao sao comparaveis. Os 6% do topo sao
duplicata e atraso de sync. Integridade da ingestao confirmada: dos **490 contatos pagos
criados em agosto, zero ficaram sem oportunidade**.

### Achado real 1 — Google Ads nao estava cadastrado como canal pago (CORRIGIDO)

Leads de Google Ads Search chegam com o UTM padrao do Google (`utm_source=google`,
`utm_medium=cpc`, com `gclid`), e nao com o codigo do sistema (`gads-N`). Como o painel de
Trafego so conta fonte paga presente em `utm_sources`, esses leads **sumiam da tela sem
erro nem aviso** — o mesmo mecanismo silencioso do bug de `pipeline_id` NULL.

Campanhas afetadas: `ACELERADOR_SEARCH_INSTITUCIONAL` e `25`.

**Correcao aplicada em producao** (INSERT aditivo de 1 linha, sem migration por ser dado
de configuracao, normalmente cadastrado pela tela):

```sql
insert into utm_sources (workspace_id, nome, slug, utm_source, public_code)
values ('7909d02a-4d15-46ea-a7b8-5debeb6e8351', 'Google Ads', 'gads', 'google', 'P54');
```

Efeito retroativo (o painel recalcula sozinho): **julho 699 → +5 leads, agosto 621 → 631**.

**Pendencia para o time de trafego:** com uma unica linha `google`, todas as campanhas do
Google caem num balde so. Para ter granularidade por campanha como no Meta, os templates
de UTM do Google Ads precisam passar a usar `gads-N` (ja existem `gads-1` a `gads-5`
cadastrados e sem uso).

### Achado real 2 — 61 leads de agosto sem nenhuma atribuicao (NAO e bug de webhook)

Descartado o bug de "UTM apagada por webhook vazio" (corrigido em 2026-08-03): os 52
contatos por tras dessas 61 oportunidades **tem webhook registrado e nenhum deles jamais
trouxe `utm_source`** em nenhum evento. Nunca tiveram origem; nao a perderam.

| Categoria | Opps | Contatos |
|---|---:|---:|
| Formulario HTML "marca pessoal" (nao envia UTM) | 15 | 14 |
| Criado manualmente pela pre-venda | 15 | 13 |
| Cadastro de teste | 10 | 8 |
| Outros / sem pista | 10 | 9 |
| Pagina de venda Cami | 6 | 3 |
| Evento/webinario Codigo da Audiencia | 5 | 5 |

Unico item acionavel: o **formulario HTML de "marca pessoal" nao propaga UTM** (~15
leads/mes entram cegos). Os demais sao entrada manual ou teste, sem origem por natureza.

### Achado menor

12 leads com `utm_medium = "3?"` — typo de digitacao na origem, polui o agrupamento por
midia.

### Achado real 3 — 23 campanhas sem funil mapeado (CORRIGIDO PARCIALMENTE)

Segunda pergunta do trafego: *"se colocar todas campanhas da aplicacao nao bate o valor do
funil da aplicacao"*. Nao e bug de codigo — os filtros de funil (`funilTags`) e de campanha
(`cpTags`) em `useTrafego.ts` usam a mesma mecanica (nome → codigo → `String(utm_campaign)`)
e a mesma query de `utm_campaigns`. O problema estava no **dado**.

**Causa 1 — nome enganoso.** O funil `[fn] aplicação` tinha 255 leads em agosto, dos quais
**219 (86%) vinham de `[cp] pagina-recrutamento-antigo`**. Somando so as campanhas de nome
obvio (`[cp] aplicação` 22 + `[cp] form-fb` 10 = 32) nunca fecharia.

**Causa 2 — 23 das 60 campanhas com `funnels = []`**, incluindo a maior do mes
(`[cp] codigo-audiencia-08-26`, 277 leads). Resultado: **353 dos 631 leads pagos de agosto
(56%) nao apareciam em funil nenhum**, sem aviso na tela.

**Correcao aplicada em producao** — `scripts/sql/2026-09-02-mapear-funis-campanhas.sql`
(idempotente, com rollback no cabecalho). Criterio: so campanha com evidencia conclusiva —
pipeline dominante dos leads >=78% **e** familia de nome ja mapeada igual.

| Campanhas | Funil | Evidencia |
|---|---|---|
| 58, 61, 53, 57, 55, 49, 59 | `[fn] webinário` | 78%–93% dos leads no pipeline "[fn] webinário"; `ponda-01-26`/`Ponda-12-25` ja eram |
| 54 `form-aplicacao-v2` | `[fn] aplicação` | 276/353 em Pre-Vendas; toda a familia `form *` ja era |
| 51, 52 `cami-*-pg1` | `[fn] low ticket` | pipeline Cami; `[cp] cami start` ja era |

**Resultado medido (agosto):** leads sem funil **353 → 70**. Distribuicao final:
webinário 283, aplicação 255, sem funil 70, sdr ia 15, low ticket 7, desafio 1 — soma 631,
bate com o total do painel.

### Pendencias deixadas para o dono (decisao de negocio, nao inferivel do dado)

1. **Renomear `[cp] pagina-recrutamento-antigo`** — carrega 219 dos 255 leads do funil
   aplicação e o nome faz o time ignorar a campanha.
2. **13 campanhas nao mapeadas.** Com volume: `bpo-performance` (128 leads desde junho) e
   `form direto bpo performance` (30) — leads vao para Pre-Vendas, mas BPO parece oferta
   propria sem funil correspondente cadastrado; `evento-growth-mai-26-cami` (36) — nome diz
   evento mas 34/36 leads estao em Recuperacao; `acelerador de marca` (16) — espalhada por
   4 pipelines, sem dominante. As outras 9 tem zero lead desde junho.
3. **Campanha do Google Search** (`ACELERADOR_SEARCH_INSTITUCIONAL`, 8 leads) nao existe em
   `utm_campaigns` — junto com `bpo-performance` (62) formam os 70 leads que ainda ficam
   fora de funil em agosto.

## 2026-09-02 BRT — Modal de leads: coluna "Contato desde" (aquisicao nova x base reativada)

**Origem:** duvida do dono sobre um lead que o painel de Trafego exibia como MQL novo
(Danilo Vilas Boas, fonte `iads-39`). Diagnostico: o contato existe desde **30/03/2024**,
era `import-23` ("Importados GHL", organico) ate 25/08/2026 e ja era MQL desde
**24/07/2026**. Em **01/09/2026 14:03** o webhook do "Evento Codigo da Audiencia SET/26"
regravou a origem dele para `iads-39` ("ViewCaptura", pago).

**Nao e bug.** E a regra documentada "valor novo sobrescreve, valor vazio nao apaga"
funcionando como escrita — ela existe para permitir re-atribuicao. O efeito colateral e
que base antiga que clica num anuncio passa a ser contada como aquisicao do trafego pago,
e como **Lead = Oportunidade**, a oportunidade nova conta como "lead gerado" do periodo.

### Medicao (oportunidades creditadas a fontes pagas, por distancia contato -> oportunidade)

| Faixa | Jul/26 | Ago/26 | Set/26 (2 dias) |
|---|---|---|---|
| Novo (mesmo dia) | 486 | 536 | 28 |
| Recente (ate 30d) — funil normal | 172 | 180 | 13 |
| Base 1-3 meses | 66 | 28 | 3 |
| **Base antiga (3+ meses)** | **139** | **72** | **6** |
| **% base 1 mes+** | **23,8%** | **12,3%** | **18%** |

### Decisao

**Nao mexer na regra de atribuicao.** Alterar como a origem e gravada mudaria a leitura
de todo o historico, e o ganho nao justifica o risco. Em vez disso, devolver o contexto
que estava escondido: o modal de leads (`LeadListModal`, usado por Trafego, Aquisicao,
Vendas, Pre-Vendas e Recuperacao) ganhou a coluna **"Contato desde"**, com selo
`base Nm` quando o contato ja existia ha 90+ dias na entrada da oportunidade.

Mudanca **puramente aditiva**: `contatos.date_created` ja vinha no select e no tipo
`OppRow`; nenhuma query, contagem, KPI ou funil foi alterado. Arquivo unico:
`eb-dash2/src/components/leads/LeadCard.tsx`. `tsc --noEmit` limpo.

**Ressalva de leitura:** a coluna "com tag MQL" das medicoes conta contato que tem a tag
**hoje**, nao quem virou MQL naquele mes — serve para ordem de grandeza, nao para KPI.

## 2026-09-01 BRT — Notion: sync 3× ao dia e fim do botão "Sincronizar"

**Decisão do dono:** a RPC de disparo manual (`20261022000000`) **não foi adotada**. Ela
concedia a `authenticated` o poder de acionar a edge function usando a `service_role_key`
lida do Vault — um caminho de elevação de privilégio cujo ganho (não esperar o cron) não
justificava o risco. A migration fica versionada no repositório, não aplicada.

Como consequência, o cron passou a ser o **único** caminho de entrada dos criativos do
Notion, e a frequência passou a importar mais:

| | Antes | Agora |
|---|---|---|
| Grade (UTC) | `0 9,21 * * *` | `0 12,16,22 * * *` |
| Em BRT | 6h e 18h | **9h, 13h e 19h** |

A grade antiga deixava a manhã e a tarde inteiras sem atualização — criativo cadastrado
às 7h só aparecia às 18h. Migration `20261024000000`, **aplicada em produção**.

O botão "Sincronizar" saiu da Biblioteca; no lugar, o cabeçalho diz quando a
sincronização acontece. Um controle que dá erro é pior que controle nenhum.

### ⚠️ Armadilha medida ao aplicar: `unschedule` + `schedule` do mesmo job não funciona

A primeira versão da migration usou o padrão herdado de `20260729000000`:

```sql
SELECT cron.unschedule('nome') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nome');
SELECT cron.schedule('nome', ...);
```

Executada em bloco, ela **retornou sem erro e não mudou nada** — o `SELECT` em `cron.job`
logo depois ainda mostrava a grade antiga. `cron.schedule` já é idempotente por `jobname`:
sozinho, ele atualiza o job existente. O `unschedule` era desnecessário **e** era o que
quebrava.

**Regra para quem mexer em cron neste repositório:** não copie o padrão antigo, e sempre
confira o resultado com `SELECT jobname, schedule FROM cron.job` depois de aplicar — o
modo de falha aqui é o silêncio, exatamente como no caso do sync morto abaixo.

## 2026-09-01 BRT — 🔴 ACHADO: o sync do Notion está MORTO desde 13/07 (~50 dias)

Descoberto ao aplicar as migrations em produção e conferir os dados reais. **Corrige
parcialmente o diagnóstico que eu mesmo publiquei mais cedo hoje** (entrada "o '1000' da
Biblioteca era teto do PostgREST"): o truncamento de leitura era real e está corrigido,
mas **não era a única causa** — há também criativos que genuinamente nunca chegaram.

### Evidência medida em produção

| Medição | Valor |
|---|---|
| `count(*)` em `notion_creatives` | **3.123** (a tela mostrava 1.000 → truncamento confirmado) |
| Maior código `CR-` no banco | **CR-1177** |
| Maior código `CR-` no Notion (visto na reunião) | **CR-1256** |
| Última execução de `notion_sync_runs` | **2026-07-13 21:00 UTC** |
| Credencial `provider = 'notion'` em `workspace_integration_credentials` | **nenhuma, em nenhum workspace** |

### Causa raiz

No cutover multi-tenant de 14–15/07 (`docs/DEPLOY-EDGE-FUNCTIONS-MULTI-TENANT.md`), a
função `notion-creatives-sync` passou a **exigir credencial Notion por workspace** no Vault
(fail-closed), e o cron passou a iterar sobre os workspaces que têm
`provider = 'notion'`. Essa credencial **nunca foi cadastrada** — o
`docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md` marca o seed como obrigatório antes do
cutover, e ele não aconteceu para o Notion.

Resultado: o cron virou **no-op silencioso**. Não falha, não gera erro, não gera linha em
`notion_sync_runs` — simplesmente não encontra workspace e retorna. Por isso ninguém
percebeu por ~7 semanas. O workspace `Default` (Empire) tem `ghl`, `meta`, `omnx_desk` e
`openrouter` cadastrados; só o `notion` ficou de fora.

**É a mesma classe de bug já registrada 3× neste repositório:** mudança fail-closed
promovida sem o seed correspondente. A diferença é que aqui o modo de falha é o silêncio
total, não um erro visível.

### Situação

- ~79 criativos pagos (`CR-1178` a `CR-1256`) e os orgânicos do período **não estão no banco**.
- **Pendente de ação do dono:** cadastrar a credencial Notion do workspace `Default`
  (token da integração + `notion_database_id_paid` / `notion_database_id_organic` no
  metadata), seguindo `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`. Sem isso o cron
  segue morto, e o botão "Sincronizar" também não terá o que sincronizar.
- A RPC `enqueue_notion_creatives_sync` já checa essa credencial e devolve erro explícito
  ("Nenhuma credencial Notion cadastrada para esta conta") em vez de falhar em silêncio.

## 2026-09-01 BRT — Criativos: formulário enxugado e Biblioteca utilizável (MEL-01 a MEL-21)

Segunda leva da reunião de 28/08. O veredito do usuário sobre o cadastro foi
direto: *"tomei um susto quando vi tanta opção de coisa pra preencher, e a
maioria eu não acho tão relevante"* (00:37:29).

### Formulário "Novo Criativo"

- **MEL-01** — O seletor **Campanha** vinha vazio porque lia `ads_campaigns`,
  tabela onde as campanhas reais do time nunca estiveram. Elas moram em
  `notion_creatives.objective` (é lá que o sync grava o campo "Objetivo" do
  Notion): `Código da Audiência`, `Aplicação`, `BPO`, `Máfia Russa`. Hook novo
  `useCreativeCampaigns()`, paginado, com item "Outra campanha…" para digitar uma
  que ainda não existe.
- **MEL-02** — Campo "Objetivo / CTA" removido: gravava na **mesma coluna** que o
  seletor de Campanha agora usa. Era duplicata, não dois campos.
- **MEL-03 a MEL-06** — Fora do formulário: "Tipo criativo" (duplicava Formato),
  "Hook", "CTA text" e "MVP status". **As colunas continuam no banco** — só
  saíram da tela.
- **MEL-07** — "Copy" virou "Copy (texto da postagem)", com ajuda dizendo que não
  é roteiro nem legenda do anúncio.
- **MEL-08** — Campo novo **"Legenda do anúncio"** (`ad_caption`, migration
  `20261023000000`). Não dava para reaproveitar `copy_text`: a reunião definiu
  Copy como o texto da postagem, são coisas diferentes.
- **MEL-14** — Só "Nome" é obrigatório, e a descrição do diálogo diz isso.
- **MEL-19** — Seletor de **status inicial** no cadastro. Antes todo criativo
  nascia em `ideia`, mas o time costuma cadastrar o criativo **já pronto**
  (*"a partir do momento que eu subo o criativo, ele tá pronto"*, 00:42:03).
  `ideia` segue como padrão quando o campo vem vazio.

**Cuidado que evitou perda de dado:** os campos removidos saíram também de
`CreativeFormInput`. Se ficassem no tipo, cada edição mandaria `null` neles e
apagaria o histórico do banco.

### Biblioteca

- **BUG-04** — A tabela era `w-full` e as colunas só espremiam, então a barra de
  rolagem horizontal nunca aparecia (e o container externo tinha `overflow-hidden`
  clipando o que sobrasse). Agora a tabela tem largura mínima e transborda dentro
  do próprio container. O `body` da página continua sem rolagem horizontal.
- **MEL-15** — Coluna "Aprovação" → **"Publicado"**, com tooltip explicando o que
  ela significa de verdade: *"aprovação é quando o pessoal do tráfego pegou esse
  vídeo e já botou pra rodar"* (00:23:14). O nome antigo sugeria "foi validado,
  deu certo". Coluna `aprovado` do banco intacta.
- **MEL-16** — "Disponível" e "Início do teste" viraram cabeçalhos ordenáveis.
  **Mudança de padrão:** a lista agora abre pelos mais recentes, não pelos mais
  antigos. Datas vazias vão para o fim nos dois sentidos.
- **MEL-17 / MEL-18** — Filtros por **Formato** e por **Objetivo/campanha**,
  populados a partir dos valores presentes nos dados.
- **MEL-20** — Status editável direto na linha, sem precisar do Kanban. Status
  vindo do Notion que não existe no catálogo entra como opção extra, para não ser
  apagado em silêncio.
- **MEL-21** — "Início do teste" e "Testado" agora são independentes. A regra
  antiga era invertida: só dava para pôr a data de início **depois** de marcar
  como testado (*"o que é meio esquisito, né? Ele ainda não foi testado"*,
  00:43:51). Desmarcar "Testado" também não apaga mais a data.

### Dashboard e Kanban

- **BUG-05** — As etapas do funil viraram botões de verdade (foco visível,
  navegáveis por teclado, desabilitadas quando a contagem é zero) que abrem o
  detalhamento dos criativos daquela etapa. O usuário tinha tentado clicar e
  nada acontecia (*"aperta nesse card aí, vai que abre alguma coisa — não, não tem
  clique, né?"*, 00:14:38). Na etapa "Fora do fluxo da plataforma" o modal mostra
  o **status cru** de cada criativo — que é exatamente a pergunta que ficou sem
  resposta na reunião.
- **BUG-06** — Arrastar cards era travado e só movia um por vez. Duas correções:
  o realce da coluna piscava porque cada elemento filho disparava `dragleave`
  (agora há contador de profundidade), a área de drop passou a ser a coluna
  inteira e não só a lista, a alça de arraste deixou de ser invisível
  (`opacity-0`), e começar o gesto sobre um botão/checkbox não sequestra mais o
  arrasto. Além disso entrou **seleção múltipla** (checkbox ou Ctrl/Cmd+clique)
  com um seletor "Mover para…" — que de quebra dá um caminho **sem arrasto**,
  aliviando o P0 de Kanban inutilizável em touch registrado em
  `docs/AUDITORIA-CRIATIVOS.md` (o drag HTML5 não funciona em touch).

O move em lote virou o hook `useBulkUpdateCreativeStatus` (`.in('id', ids)` numa
query só, com filtro de workspace), ao lado dos demais. Mover 1 card continua
usando o hook por id; 2 ou mais usa o lote — senão seriam N UPDATEs e N toasts.

### Ainda em aberto (não é código)

As questões Q1 a Q4 da reunião continuam dependendo de decisão do dono, e a Q2
(mapa de status Notion → plataforma) ganhou proposta escrita em
[`docs/CRIATIVOS-STATUS-NOTION-MAPA.md`](CRIATIVOS-STATUS-NOTION-MAPA.md) —
**nada aplicado**. Resumo do impasse: há fala literal definindo `Concluído` =
`pronto` (00:23:08), mas aplicar isso faz `Concluído` entrar no WIP pela regra do
próprio time, e o card saltaria de ~976 para perto do total da base. E
`Postado no Trial` não dá para mapear: o time não sabe o que significa (00:13:15).

Fonte: `docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`.

## 2026-09-01 BRT — Criativos: o funil somava 13 e o resto da tela falava em 1000 (UX-01)

O bloco "Funil de produção + testes" exibia 13 criativos (8 Ideia + 4 Roteiro +
1 Produzindo) enquanto os cards ao lado mostravam WIP 976 e Total 1000. Na
reunião de 28/08 ninguém conseguiu explicar a diferença, e o veredito do usuário
foi direto: *"eu não entendi a utilidade disso aqui"*.

**Causa.** A view `v_creative_status_counts` agrupa pelo **texto cru** da coluna
`status`, e o criativo importado do Notion carrega o status do Notion
literalmente (`Concluído`, `Não iniciado`, `Revisar edição`, `Postado`,
`Postado no Trial`, ou NULL). O funil, porém, só sabe ler os 10 status do
vocabulário da plataforma (`ideia` … `escalar`). Tudo que veio do Notion caía
fora da conta — **o funil enxergava só os criativos nativos**.

Pior: o `pct` de cada etapa era calculado sobre esses 13. "Ideia 61,5%" era 8/13,
porcentagem de um universo que a tela nunca mostrava.

Eram, portanto, **três respostas para três perguntas diferentes** empilhadas sem
rótulo: 1000 (leitura truncada), 976 (a mesma leitura menos os terminais) e 13
(agregado da view, restrito ao vocabulário).

**Correção,** sem inventar mapeamento de status — isso é a questão Q2 da reunião,
ainda em aberto e dependente da decisão sobre manter ou não o Notion:

- Todo criativo aparece em alguma etapa. O que está fora do vocabulário (mais os
  sem status) cai num balde explícito, **"Fora do fluxo da plataforma"**.
- As porcentagens passam a ser sobre a base inteira, então o funil **fecha com o
  card "Total de criativos"**.
- O card ganhou texto dizendo isso, e o balde lista os status crus encontrados —
  o usuário vê de onde vêm os números sem precisar perguntar.
- O balde nunca é eleito gargalo: não é etapa real de trabalho.

Regra extraída para `buildCreativeFunnel`, com 8 casos de regressão em
`test/creative-funnel.test.ts` — incluindo o cenário exato lido da tela na
reunião.

Fonte: `docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`.

## 2026-09-01 BRT — Criativos: criativo aprovado não chegava na aba Testes (BUG-01)

A fila da aba Testes aceitava **um único status**: `pronto`. Mas o caminho que o
time usa no Kanban termina em `Aprovado` — arrastar o card até o fim grava
`status = 'aprovado'`, que a fila descartava. Na reunião de 28/08 o criativo
`AN-0017` foi levado até o fim, marcado como Testado e com data de início
preenchida, e a aba seguiu dizendo "Fila vazia".

As caixinhas da Biblioteca não ajudavam porque escrevem em colunas que a fila
nem lê: **Testado** grava `creative_tested`, **Início do teste** grava
`test_started_at`, e **Aprovação** grava `aprovado` — enquanto a fila consultava
só `status` e `test_status`. Três campos de nome parecido, e a tela deixava mexer
justamente nos que não contavam.

**Correção.** `READY_FOR_TEST_STATUSES = ['aprovado', 'pronto']` — os dois
estados de "produção concluída" no vocabulário de `CreativeStatus`.

**Efeito colateral tratado.** `useDecideCreativeTest` grava `status = 'aprovado'`
quando a decisão é "Aprovar". Com `aprovado` entrando na fila, todo criativo
aprovado voltaria para o começo eternamente. O filtro da tela agora exclui
`test_status === 'testado'`. De quebra, isso conserta o curto-circuito antigo
(`c.status === 'pronto' || !ativos.has(c.id)`), que fazia um criativo `pronto`
com teste em andamento aparecer na fila **e** em "Testes em andamento" ao mesmo
tempo.

A regra virou função pura `selectReadyQueue`, com teste de regressão em
`test/creative-test-queue.test.ts` (8 casos).

Fonte: `docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`.

## 2026-09-01 BRT — Criativos: o "1000" nunca foi do Notion (BUG-02/BUG-03 da reunião de 28/08)

O time de criativos reportou que a sincronização com o Notion "travava em 1.000
registros e dava erro na tela", enquanto o Notion já tinha até `CR-1256`. A
suspeita era paginação não tratada na API do Notion. **Não era.**

`notion-creatives-sync` pagina corretamente (`has_more`/`next_cursor`, 100 por
página) e o cron por workspace roda 2×/dia. Eram **dois bugs independentes** que
se somaram na percepção do usuário:

**Causa 1 — truncamento de leitura no frontend (o número 1.000).** `useCriativosList`
e os dois `select` de `useCreativeDashboard` liam `notion_creatives` sem
paginação. O PostgREST tem `max_rows = 1000` e devolve exatamente 1.000 linhas
**sem erro e sem aviso** — a armadilha já documentada no `CLAUDE.md`. Daí saíam
"1000 registros" na Biblioteca, `Total = 1000` e `WIP = 976` no Dashboard.

**Isso também explica o BUG-03** (15 criativos nativos sumidos do Kanban): o
Kanban usa a mesma lista, ordenada por `updated_at DESC`, e o trigger
`trigger_notion_creatives_updated_at` carimba `updated_at = now()` em todos os
~1,2 mil registros do Notion a cada passada do cron — empurrando os nativos
(parados há semanas) para fora da janela dos 1.000 primeiros. Um bug, dois
sintomas.

**Causa 2 — o botão "Sincronizar" estava quebrado desde o hardening multi-tenant.**
Ele chamava a edge function direto do navegador: `requireServiceRoleCaller`
respondia 401 ao JWT do usuário e, se passasse, o body sem `workspace_id` levava
400. Nunca funcionou; o usuário só via "Erro ao sincronizar".

**Correções.**

- Paginação via `fetchAllPages` em `useCriativosList`, `useCreativeAlerts` e
  `useCreativeDashboardData`, com desempate por `id` (ordem determinística é
  obrigatória, senão o corte entre páginas repete ou perde linhas).
- Migration `20261022000000` — RPC `enqueue_notion_creatives_sync`
  (`SECURITY DEFINER`), que valida owner/admin do workspace via
  `is_workspace_admin()` e dispara a function pelo banco com a
  `service_role_key`. **O guard da edge function não foi afrouxado** — a chave
  nunca chega ao navegador. Ver `docs/UML.md`.
- A UI passa a dizer "sincronização iniciada" (o disparo é assíncrono), não
  "concluída".

Fonte: `docs/reunioes/REUNIAO-CRIATIVOS-2026-08-28.md`.

## 2026-08-31 BRT — Agosto fechava com R$ 108 mil no lugar de R$ 266 mil: duas causas, uma delas de valor

Conferência venda a venda de agosto/2026 entre o omnx-desk, `vendas_fechamento`
e o que as abas exibem (workspace `Default`, leitura via Management API).

**Realidade do mês: 7 vendas, R$ 266.000. As abas mostravam 5 vendas, R$ 108.068.**

**Causa 1 — duas vendas de R$ 45.000 no pipeline "Recuperação"** (pagas em 13/08 e
19/08). Todas as abas excluem esse pipeline por padrão, então as vendas somem sem
erro e sem aviso. Não é bug de dado: é decisão de negócio ainda aberta (venda de
lead recuperado entra no faturamento?).

**Causa 2 — o webhook do GHL esmagava o valor da venda vinda do desk.** As duas
vendas abaixo são de R$ 48.000 cada no omnx-desk:

| oportunidade | valor real | valor exibido |
|---|---|---|
| `8ba650b9` (05/08) | R$ 48.000,00 | R$ 48,00 |
| `27343eb6` (12/08) | R$ 48.000,00 | R$ 28.020,00 |

No GHL os campos financeiros da oportunidade são preenchidos à mão **em milhares**
— o webhook chega com `valor_a_ser_pago_de_entrada = "20"` e `valor_parcela = "5.6"`
para uma venda de R$ 20.000 + 5× R$ 5.600 (conferido nos webhooks de 13/08, 25/08 e
26/08). O trigger `extrair_vendas_fechamento_do_webhook` gravava o número cru por
cima do que o `crm-registrar-venda` já tinha sincronizado certo, e `valor_faturado`,
coluna GERADA (`entrada + parcelas × valor_parcela`), seguia junto. O cronograma
completo continuava intacto em `vendas_fechamento.pagamentos` — só as colunas
derivadas ficaram erradas.

- **Migration `20261021000000_trigger_ghl_nao_sobrescreve_financeiro_omnx_desk.sql`**
  — no `ON CONFLICT`, os cinco campos financeiros (`forma_pagamento`,
  `valor_entrada`, `numero_parcelas`, `valor_parcela`, `data_pagamento_entrada`)
  passam a ser preservados quando a linha tem `origem` do desk. Venda de origem
  `ghl` não muda em nada.
- **`scripts/sql/fix-valores-omnx-desk-2026-08-31.sql`** — recalcula as colunas a
  partir do `pagamentos` para as linhas do desk que divergem em mais de R$ 1.
  Simulado em leitura: as duas voltam a R$ 48.000. Idempotente.
- **`scripts/aplicar-fix-vendas-2026-08-31.sh`** — aplica migration + registro em
  `schema_migrations` + correção + conferência, numa tacada.
- **`scripts/conferir-vendas-desk-vs-dashboard.mjs`** — auditoria repetível
  desk × CRM × abas (só leitura).

**Aplicado em produção em 2026-08-31**, nesta ordem: migration `20261021000000`
(registrada em `schema_migrations`), `fix-valores-omnx-desk-2026-08-31.sql` e
`fix-datas-entrada-omnx-desk-2026-08-31.sql`. Agosto passou de R$ 108.068
exibidos para R$ 221.000 nas abas (R$ 266.000 contando as duas de Recuperação).

**Correção de data (mesma raiz).** O webhook do GHL também sobrescrevia
`data_pagamento_entrada` com o que o closer digitava, deslocando o dia em que a
venda entra nos painéis: `356b8fb1` (09/06 → 02/06), `531bd9ef` (18/06 → 17/06),
`8ba650b9` (06/08 → 05/08) e `27343eb6` (13/08 → 12/08). As quatro voltaram para
a data do desk (meio-dia BRT, como `crm-registrar-venda` grava).

**Conferência final das 30 vendas do desk contra o CRM:** 0 ausentes, 0 valores
divergentes, 0 datas divergentes. A única diferença remanescente é a oportunidade
`c797dba1`, que tem **duas vendas concluídas duplicadas no desk** (23/06 e 30/06,
R$ 24.000 cada) — o UPSERT por `oportunidade_id` mantém uma só, que é o
comportamento correto (contar as duas dobraria o faturamento). Restam também 2 e 4
centavos a mais em `5bec1220` e `defdd58c`, do arredondamento da média das
parcelas na coluna gerada; o cronograma em `pagamentos` segue exato.

**Venda nova entra sozinha:** `crm-registrar-venda` na conclusão, e o trigger
`trg_venda_ressincronizar_crm` (no desk) reenvia automaticamente sempre que um
campo enviado muda, `pagamentos` incluído. O webhook do GHL não interfere mais no
financeiro dessas linhas. Continua exposta a venda registrada **direto no GHL**,
sem passar pelo desk (origem `ghl`) — hoje nenhuma das 111 está com valor
achatado, mas não há guarda automática para esse caso.

**Sincronização desk → CRM: saudável.** 29 vendas concluídas no desk, todas
vinculadas e sincronizadas, zero erros; as 30 linhas `origem = omnx_desk` no CRM
batem com as 30 oportunidades distintas do desk. Três vendas do desk apontam para
uma oportunidade já usada por outra (`8ba650b9`, `9f28b212`, `c797dba1`), mas nos
três casos são pares de mesmo valor — duplicata de cadastro, não venda perdida.

## 2026-08-31 BRT — Vendas × Aquisição: filtro de Recuperação passa a valer nos KPIs de Vendas e join de contato padronizado

Investigação da divergência entre a aba **Aquisição** e a aba **Vendas** no mesmo
período. Duas causas de código foram corrigidas (frontend apenas — nenhuma
migration, nenhuma edge function). A conferência numérica venda a venda contra o
omnx-desk continua pendente de acesso ao banco de produção.

**1) O toggle "Recuperação" não tinha efeito nos números de Vendas.**
`useCloserProdutividade` — que alimenta os cards de vendas/faturamento/caixa da
aba Vendas em Produtividade, e a Matriz — tinha o pipeline cravado no código
(`.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)` em três queries). O mesmo
acontecia nos dois fetches locais do `GeralTab` e no fetch da aba Reuniões.
A Aquisição, por outro lado, sempre respeitou a escolha via
`applyRecuperacaoFilter`. Resultado: com "incluir Recuperação" (ou "só
Recuperação") ligado, Aquisição mudava os números e Vendas não — divergência
garantida no mesmo período.

Agora o hook recebe `pipelineMode` (padrão `exclude_recuperacao`, o
comportamento anterior) e a `VendasPage` propaga o `recuperacaoMode` para
`GeralTab`, `MatrizTab` e `ReunioesTab`.

- `eb-dash2/src/hooks/useCloserProdutividade.ts`
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx`
- `eb-dash2/src/pages/vendas/tabs/MatrizTab.tsx`
- `eb-dash2/src/pages/vendas/tabs/ReunioesTab.tsx`
- `eb-dash2/src/pages/vendas/VendasPage.tsx`

**2) Join de contato divergente entre as abas.** `usePreVendas`,
`usePreVendasProducao` e `useAquisicao` usavam `contatos!inner(...)`, enquanto a
carga de Produtividade da Aquisição usa join normal. Oportunidade cujo contato
não volta na consulta sumia de uma aba e aparecia na outra — e, quando essa
oportunidade tem venda paga, a venda desaparecia sem erro. Os três hooks passaram
a usar o join normal (`contatos(...)`), que é o que não esconde venda.

**Ainda em aberto (precisa do banco):** conferência das vendas do omnx-desk
(`vendas_pendentes`) contra `vendas_fechamento` e contra o que cada aba exibe —
em especial vendas amarradas a oportunidade no pipeline Recuperação ou com
`pipeline_id` NULL, que somem de todos os painéis em silêncio
(ver `docs/BUG-FIX-PIPELINE-NULL.md`), e vendas que nunca sincronizaram
(`vendas_pendentes.sincronizacao_erro` preenchido ou `ghl_oportunidade_id` nulo).

Nota de leitura, não bug: a aba **Tráfego** só considera lead cujo `utm_source`
está cadastrado em `utm_sources` (tráfego pago). Venda de lead orgânico, de
indicação, venda direta ou sem UTM nunca aparece lá — por desenho.

## 2026-08-27 BRT — Material de apresentação do Dashboard de Criativos (guia PDF + roteiro de vídeo)

Documentação de uso, não mudança de código. Nenhum arquivo de `eb-dash2/`,
`supabase/` ou migration foi tocado.

- **`docs/guias/guia-dashboard-criativos.html`** + **`docs/guias/Guia-Dashboard-Criativos-OMNX.pdf`**
  — guia do usuário final: para que serve o app, como o código `CR-`/`AN-` no nome
  do anúncio amarra Meta Ads e CRM, as 5 abas (Dashboard, Ranking, Biblioteca,
  Kanban, Testes), dicionário das 14 métricas do Ranking com a fórmula de cada uma,
  Cohort × Produtividade, rotina semanal, FAQ e limitações conhecidas.
- **`docs/ROTEIRO-VIDEO-CRIATIVOS.md`** — roteiro bloco a bloco para gravar o tour
  em vídeo (12-16 min), com falas prontas e ordem das telas.

As limitações citadas no guia (Kanban sem suporte a toque, toast de sucesso falso
quando a RLS bloqueia, ausência de exclusão de criativo, sugestão de teste sem
justificativa inline) vêm de `docs/AUDITORIA-CRIATIVOS.md` e continuam abertas —
o material foi escrito para não prometer o que o app não entrega.


## 2026-08-26 BRT — Fila de discagem: lead com hora marcada sai da fila e um contato ocupa uma posição só

✅ **Aplicado em produção em 2026-08-26** (migration `20261020000000`, registrada
em `schema_migrations`). Três reclamações do time de pré-vendas no mesmo dia,
com duas raízes distintas.

**1) Lead com reunião marcada continuava na fila.** Reportado com print da lead
na posição 2 da Fila de Discagem, com a timeline mostrando "Reunião agendada"
**e** "Reunião de vendas agendada" em 25/08. O mesmo padrão explica o segundo
relato ("já fez a reunião, está em perdido, mas consta na lista").

Não foi duplicidade de lead nem dado sujo: **desde 2026-06-28 nada na fila olhava
para agendamento**. A regra `AND o.data_agendamento_vendas IS NULL` foi criada em
`20260627100000` e removida **de propósito no dia seguinte** por
`20260628010000`, com justificativa registrada: o campo dava falso-negativo —
uma oportunidade nova podia nascer já com o valor copiado do histórico pelo
webhook e sumia da fila sem motivo. A aposta feita ali foi que `pipeline_name`
bastaria. O redesenho de 04/08 não mexeu nisso, só manteve o comportamento de
junho.

Essa aposta pressupõe um contato = uma oportunidade. No caso reportado a lead
tinha **duas** oportunidades abertas: o agendamento em `Auto Agendamento` e a
fila exibindo a outra, em estágio "Chegada" e legitimamente ainda em pré-vendas.
Nenhum filtro linha a linha resolveria, nem o original. Por isso o compromisso
passou a ser avaliado **por contato**.

**A armadilha que quase passou.** A primeira versão da correção usava só o
appointment sincronizado (`data_reuniao_agendada_ts` + `appointment_status`),
com o argumento de que é fato vindo da API e não campo de pipeline sujeito a
cópia por webhook. Bom argumento, dado ruim — conferido contra produção antes de
aplicar, nas 3.685 linhas da fila:

| Campo | Preenchidas |
|---|---|
| `data_reuniao_agendada_ts` | 32 |
| `appointment_status` | 21 |
| `data_agendamento_vendas` | 84 |
| `data_agendamento_reuniao` | 103 |

O sinal "correto" está praticamente vazio e **não pegaria nem o caso
reportado**: a lead agendada tem as datas do pipeline preenchidas e
`last_appointment_sync_at` **NULL** — o `sync-appointment-dates` nunca passou por
ela. O sinal usado passou a ser a data do agendamento vinda do pipeline, e o
falso-negativo de junho é neutralizado por uma **janela de 14 dias**: data
copiada do histórico é data velha, fica fora da janela e não bloqueia.

O que **não** bloqueia, de propósito: no-show e reunião cancelada/inválida —
esses leads precisam voltar a ser discados, é o trabalho do SDR. Agendamento com
mais de 14 dias e sem desfecho também não bloqueia: dado velho não pode congelar
um lead para sempre. Reunião já realizada tira o lead de **pré-vendas** apenas; a
fila de Recuperação continua enxergando, porque quem fez reunião e não fechou é
exatamente a matéria-prima dela.

**2) Contato aparecendo em duas filas ao mesmo tempo.** Reportado como o lead
"batendo e voltando de rec pra 1º contato". A deduplicação usava a chave
`(contato_id, escopo)` — 110 contatos em produção estavam nas duas filas, o que
permitia duas pessoas ligarem para o mesmo lead no mesmo dia. A chave passou a
ser só `contato_id`, com desempate a favor de pré-vendas.

**Resultado medido, antes → depois:**

| | Antes | Depois |
|---|---|---|
| Fila pré-vendas | 1.580 | 1.546 |
| Fila recuperação | 2.105 | 1.997 |
| Contatos em duas filas | 110 | **0** |
| Contato repetido na fila | — | **0** |

A lead do caso (a) saiu da fila, como esperado.

**Ainda em aberto:** o caso (c) reportado por e-mail não é explicado por nada
disso — aquele contato tem **uma única oportunidade**, em `Pré-Vendas MQL`, sem
agendamento. Além disso o contato está gravado com nome de uma pessoa e e-mail
de outra, o que sugere mesclagem de contatos no GHL. Investigação separada.

## 2026-08-25 BRT — MQL duplicado nas listas + tooltips nos icones da Discagem

**1) Lead repetido na lista de MQLs.** Reportado com print do modal "MQLs"
mostrando a mesma pessoa duas vezes (mesmo e-mail, telefone e Instagram).

MQL e uma classificacao do **contato** (tag no GHL), mas varias telas contavam e
listavam por **oportunidade**. Como um contato pode ter N oportunidades, o mesmo
lead aparecia repetido. Os KPIs principais ja usavam `countUniqueMqls` /
`filterUniqueMqls` — por isso card e lista as vezes nem batiam entre si.

Padronizado para "um MQL por contato" em:

- `computeFunnel` (`hooks/useTrafego.ts`) — etapa MQLs do funil
- `TrafegoTab` — KPI de MQLs em Produtividade e lista do funil em Cohort
- `CohortMatrix` e `aquisicao/MatrizTab` — modal da coluna MQLs
- `useProducao` (`leads_mqls`) e `useProdutividadeMatrix` — matriz de produtividade

Efeito colateral esperado: onde havia contato com mais de uma oportunidade, a
contagem de MQLs **cai** — o numero anterior estava inflado. Nenhuma outra etapa
do funil mudou (leads, conectados, agendados, reunioes e vendas continuam por
oportunidade). Teste novo em `test/useTrafego-useCohort.test.ts` trava a regra.

Observacao: a dedupe e por `contato_id`. Se o CRM tiver **dois contatos
distintos** para a mesma pessoa, a duplicidade e do GHL e precisa ser resolvida
na origem.

**2) Tooltips na Discagem.** Os emojis das camadas da fila (🔔 Task GHL,
💬 Respondeu, 🔴 Novo hoje, 🔁 Cadencia) nao tinham explicacao. Cada um ganhou
`title` com a descricao da camada — no resumo do topo, no badge do card do lead
e na legenda (`pages/prevendas/tabs/DiscagemTab.tsx`).


## 2026-08-25 BRT — "Ligacoes hoje" zerado: sync-ghl-users apagava o time de uma conta ao sincronizar a outra

Reportado como "o card Ligacoes hoje esta em 0 e nao estou com nenhum filtro".
No banco havia **102 ligacoes** no mesmo dia.

O card conta em dois passos: resolve os SDRs **ativos** da conta e so entao
conta as ligacoes deles. O primeiro passo devolvia lista vazia — e com lista
vazia o hook nem consulta `comunicacoes`, retornando 0 sem erro e sem log.

**Causa:** os 31 usuarios da conta real estavam com `deleted = true`, todos
marcados no mesmo instante pelo cron `sync-ghl-users-cron` (jobid 89). A edge
function roda **uma vez por workspace** com credencial GHL, mas nao filtrava por
`workspace_id` ao ler os existentes, ao atualizar (ainda reescrevia
`workspace_id`, transferindo a linha) nem ao fazer o soft-delete de quem nao
veio na API. Com duas contas conectadas (`Default` real e `Burn-in Interno` de
teste), as duas execucoes competiam a cada 6h e a ultima a terminar zerava a
outra. Agravante: `UNIQUE (ghl_id)` global impedia a mesma pessoa de existir nos
dois locations — 8 pessoas do time real (incluindo uma com 39.982 comunicacoes
na conta real) estavam registradas no workspace de burn-in.

**Correcao aplicada em producao:** migration `20261019000000` troca
`UNIQUE (ghl_id)` por `UNIQUE (workspace_id, ghl_id)`; a function passa a
filtrar por conta nos tres pontos e nao reescreve mais `workspace_id`; os 8
usuarios foram devolvidos a conta real (papeis preservados) e o sync corrigido
reconstruiu o estado a partir da API do GHL.

**Resultado:** conta real de 0 -> 29 usuarios ativos; card voltou a **102**.

Ver [`BUG-FIX-SYNC-GHL-USERS-CROSS-WORKSPACE.md`](BUG-FIX-SYNC-GHL-USERS-CROSS-WORKSPACE.md).

## 2026-08-24 BRT (2) — Link "Abrir no CRM" invisivel para SDR, "Chegou hoje" mentindo e ordem por chegada na discagem

Dois bugs reportados na mesma conversa. O segundo foi reportado como "a ordem da
fila esta estranha" — a ordem esta certa (ver abaixo), o rotulo e que mentia.

### 1. Link "Abrir no CRM" nunca aparecia para SDR/pre-vendedor

O link do card do lead depende de `ghl_integration_settings.ghl_location_id`,
mas a RLS dessa tabela so libera `SELECT` para `owner`/`admin` — a linha guarda
o `webhook_secret`. Para quem tem role `member` a query voltava **vazia sem
erro**, e a UI escondia o link em silencio. Atingia os tres lugares que montam o
link: card do lead, aba Lista de Leads e Inscricoes no Formulario.

**Correcao:** RPC `get_workspace_ghl_location_id()` (`SECURITY DEFINER`), que
devolve so o location ID — identificador publico, ja visivel na URL do CRM — sem
expor o `webhook_secret` e sem afrouxar a RLS da tabela. Migration
`20261013000000`, aplicada em producao em 2026-08-24 e verificada com JWT
simulado (membro recebe; outro tenant recebe NULL; `anon` recebe
`permission denied`; `SELECT` direto segue bloqueado).

### 2. "Chegou hoje" em lead que chegou ontem (painel de Discagem)

`fmtDiasNaBase()` contava **blocos de 24h corridas** (`floor((agora - chegada) /
86400000)`) em vez de dias de calendario. Um lead que chegou ontem as 15h44
ainda marcava 0 as 14h46 de hoje e exibia "Chegou hoje" — contradizendo, na
mesma linha, o badge vindo do banco ("Nunca contatado · 1d na base"). Passou a
contar por **dia de calendario em Sao Paulo**.

### 3. Botao de ordem na fila de discagem: Urgencia x Chegada

A fila e ordenada por **urgencia** (score 0-1000), nunca por data de chegada —
comportamento intencional e documentado. Leads que ja receberam ligacao hoje saem
da fila; por isso os dois leads novos do dia sumiram do topo depois que a SDR
ligou para eles. Nada disso era bug.

Como o time esperava ver por ordem de chegada, foi adicionado um seletor de duas
posicoes no cabecalho da fila:

- **Urgencia** (padrao) — a fila de verdade, por score.
- **Chegada** — mesma fila reordenada do lead mais recente para o mais antigo.

E reordenacao so de exibicao: nao muda quem esta na fila, nao consulta o banco de
novo e nao mexe no score. Em "Chegada" o rotulo da linha vira "Lead N." em vez de
"Ligue para N." (posicao ali nao e prioridade) e um aviso no topo lembra que a
prioridade real continua sendo a de Urgencia. A escolha e persistida em
`localStorage`. Detalhes em `DISCADOR-PRE-VENDAS.md`.

## 2026-08-24 BRT — Telefone do lead na lista de leads (LeadListModal)

A lista que abre ao clicar em qualquer numero dos paineis (funil, cards de
Agendados/Nao agendados, Conectados etc.) passa a exibir a coluna **Telefone**,
logo depois do e-mail. Pedido de origem: acao de recuperacao com os leads nao
agendados da Visao Geral de Pre-Vendas.

**O que mudou (`src/components/leads/LeadCard.tsx` — `LeadListModal`):**

- Nova coluna `Telefone`, com helper `formatTelefone()` que normaliza o formato
  cru do GHL (`+5511999998888`) para `+55 (11) 99999-8888`; valor nao reconhecido
  e exibido como veio, sem mexer.
- Clique na celula do telefone nao abre mais o LeadCard (`stopPropagation`), para
  permitir selecionar e copiar o numero.
- Modal ampliado de `max-w-2xl` para `max-w-4xl` e scroll horizontal proprio
  (`overflow-auto`), ja que agora sao 7 colunas.

O dado ja vinha nos selects de `usePreVendas` e `useTrafego` (`contatos.telefone`)
— nao houve mudanca de query nem de banco. Como o componente e compartilhado, a
coluna aparece em todos os paineis que usam a lista (Pre-Vendas, Vendas,
Aquisicao, Trafego, Criativos, Matrizes).

## 2026-08-19 BRT — Padronizacao de cores por origem nos graficos

Cada origem passa a ter **sempre a mesma cor** em todos os graficos do dashboard
(Organico, Aquisicao e Vendas). Antes existiam duas regras concorrentes: pizza e
barra escolhiam a cor pelo hash do rotulo na paleta `chart-1..8`; o grafico de
linhas escolhia pela posicao no ranking na paleta `series-1..8`. Resultado: o
"acelerador" saia roxo na pizza e verde na linha, e a cor da linha mudava quando
o ranking mudava de periodo.

**O que mudou:**

- Paleta categorica unificada em `--series-*`, ampliada de 8 para 12 matizes
  (`src/index.css`, claro e escuro).
- `src/lib/utils/colors.ts`: nova `buildLabelColorMap(labels)` — cor canonica por
  hash do rotulo + desempate deterministico (ordem alfabetica, probing na
  paleta), para que duas series exibidas juntas nunca fiquem identicas e a cor
  nao dependa da ordem de exibicao. `getChartColorByIndex` (cor por posicao) foi
  removida, pois era a origem da inconsistencia.
- Passaram a usar a funcao unica: `DonutChart`, `VerticalBarChart`,
  `PerformanceOriginChart`, `MediaBreakdownCard` e o grafico de linhas
  `OriginTrendChart` (alimentado por `AquisicaoTab`, usada tanto em Aquisicao
  quanto em Organico).

Nenhuma mudanca de dado ou de calculo — so de cor.

## 2026-08-07 BRT (2) — Preview de conversa na auditoria, DatePicker do design system e fix da sidebar recolhida

Tres entregas da mesma sessao, depois da correcao da auditoria (entrada abaixo).

**1. Preview da conversa na Auditoria IA.** Ao expandir a linha de um problema, o
painel agora mostra o trecho real da conversa (6 mensagens antes e 2 depois do
evento), em formato de chat: lead a esquerda, SDR IA e humano a direita, com
canal, horario e destaque ambar na mensagem que gerou o alerta. Mensagens que
falharam aparecem com o motivo do erro. Antes so existia o texto resumido na
coluna "Detalhes" — nao dava para julgar se a IA errou sem sair do painel.

Lido via `comunicacoes_com_remetente` sob demanda (so ao expandir). A view e
`security_invoker=true`: verificado que `anon` enxerga 0 linhas e que um usuario
de outra conta tambem enxerga 0.

O corpo da mensagem passa pela mesma limpeza do detector de reclamacao (trecho
citado, rodape `Source:`, rodape de e-mail marketing com link gigante) e trunca
em 340 caracteres com "ver mensagem completa".

**2. Lista de tags no expandido.** Um contato de campanha acumula 60+ tags
operacionais (`disparo_050826bpo`, `nao-respondeu-...`) que enterravam as tags
uteis. Agora mostra ate 8 tags relevantes e recolhe o resto atras de
"+N de campanha".

**3. DatePicker do design system** (`src/components/ui/date-picker.tsx`). Os 25
`<input type="date">` espalhados por 13 arquivos usavam o calendario nativo do
sistema operacional — visual fora do tema, diferente em cada navegador. Criado um
calendario proprio (popover, navegacao de mes, hoje/limpar, `min`/`max`, teclado
e ARIA) e **migrados todos os 25 usos**; nao resta nenhum input nativo no `src/`.
Contrato em string `YYYY-MM-DD` de proposito: `new Date('2026-08-07')` e lido
como UTC e volta um dia no fuso do Brasil. Documentado em §6.1 de
`docs/DESIGN-SYSTEM-NUBANK.md`.

**4. Fix — sidebar recolhida prendia o usuario.** Com a sidebar recolhida (64px),
o logo OMNX (wordmark de 107px) estourava a largura, aparecia cortado como "OM" e
**empurrava o botao de expandir para fora da tela** — sem como voltar ao estado
normal a nao ser recarregando. O rodape tinha o mesmo problema (avatar + sair =
92px em 64px). Agora, recolhida, a sidebar mostra so o botao (centralizado) e
empilha o rodape. Medido depois do fix: `scrollWidth` 63px em 64px, zero
elementos estourando, botao visivel e funcional.

---

## 2026-08-07 BRT — Auditoria da SDR IA voltou a detectar + novo detector de reclamacao do lead

**Sintoma:** a aba Auditoria IA (`/sdr-ia?tab=auditoria`) exibia **0 problemas em
qualquer periodo**, sem erro e sem log — em qualquer um dos dois workspaces.

**Causa raiz:** as migrations de hardening cross-tenant `20261004000002` (linha 320) e
`20261006000000` (linha 296) recriaram `auditoria_sdr_ia()` com `CREATE OR REPLACE`
para adicionar o guard de workspace, mas **reescreveram o corpo** com uma versao
simplificada que devolvia uma linha por contato com `tipo='auditoria'` e
`severidade='info'` — sem nenhuma deteccao. Como `useAuditoriaIA.ts` descarta linhas
cujo `tipo` nao esta no vocabulario valido, **100% das linhas morriam no cliente**.
Estava assim desde julho, com 2.557 mensagens da IA falhando entrega em 30 dias.

**Corrigido (migration `20261018000000`, aplicada em producao em 2026-08-07):**

- Corpo integro da `20260709220200` restaurado, **preservando** o guard de seguranca
  (`anon` sem EXECUTE e nao-membro recebendo 0 linhas — ambos reverificados).
- **7o tipo de problema: `reclamacao_lead`** — unico detector que le o texto da
  conversa. Identifica lead que reclamou de resposta fora de contexto, repeticao,
  pessoa errada, ou que pediu para parar / ameacou bloquear / percebeu que e um robo.
  Padroes calibrados contra 180 dias de conversas reais, com 5 guards
  anti-falso-positivo tirados de ruido medido (e-mail de marketing gravado como
  `inbound`, eco do texto da IA dentro do corpo do inbound, objecao de preco
  confundida com reclamacao). Ver §2.7 de `docs/ABA-AUDITORIA-IA.md`.
- `conversa_unilateral` passa a mostrar a **data real** da ultima mensagem (antes
  exibia 23:59 do fim do periodo em todas as linhas).
- Frontend: tipo novo no hook/cards/tabela/filtro, desempate por tipo mais acionavel
  quando a severidade empata, e refino visual (cores translucidas em vez de
  `bg-*-50`, chips arredondados, faixa de severidade na linha, cabecalho fixo,
  card destacado quando filtrado, estado vazio positivo).

**Resultado medido em producao (30d, workspace real):** 106 deteccoes onde antes
havia 0 — 22 sem follow-up, 14 erro de entrega, 35 conversa unilateral,
27 horario inadequado, 8 conflito IA/humano. Em 180 dias o detector novo encontra
18 reclamacoes de severidade alta. Tempo de execucao da RPC: ~616 ms.

**Licao registrada em `docs/UML.md` e §8.3 de `docs/ABA-AUDITORIA-IA.md`:** guard de
seguranca em funcao existente deve partir de `pg_get_functiondef`, nunca de reescrita
de memoria; e mudanca no vocabulario de `tipo`/`severidade` exige atualizar o hook na
mesma sessao — os dois lados formam um contrato que falha em silencio.

---

## 2026-08-06 BRT — "Nao conectado" em lead que ja tinha sido conectado

**Sintoma (relato do dono):** `robertdantasml@gmail.com` aparece como nao conectado no
dash, mas esta agendado. Segundo caso citado: `fakecontaei@gmail.com`.

**Como o sistema decide hoje:** verificado no codigo — em **todas** as telas, "conectado"
e `oportunidades.data_conectado` preenchida. A tag `conectado` do contato nunca e
consultada para isso.

**Sao dois problemas diferentes, nao um:**

**1. Robert Dantas — dado dividido entre duas oportunidades.**

| Oportunidade | Situacao | Conectado | Agendamento |
|---|---|---|---|
| Pre-Vendas nMQL (03/07) | **aberta** | nao | nenhum |
| Vendas SQL (08/07) | perdida | 08/07 | agendou 08/07, reuniao 14/07 (`cancelled`) |

Todo o historico esta na oportunidade **perdida**; a que segue **aberta** nunca foi
trabalhada — e e ela que o painel mostra. A tela nao esta errada: ela responde "esta
oportunidade foi trabalhada?", enquanto a pergunta do leitor e "falaram com esta pessoa?".

**2. Tarabe (`fakecontaei`) — nao ha divergencia nenhuma.** As duas oportunidades tem
`data_conectado = 23/07` e nenhuma tem agendamento. So aparece como nao conectado no modo
**Produtividade** com periodo que nao inclui 23/07 — que e a definicao de Produtividade,
nao um bug. O problema ali e o **rotulo**.

**Decisao do dono:** avisar na tela, **sem mexer em metrica**. Propagar `data_conectado`
entre oportunidades inflaria a taxa de conexao de **1.609 contatos** (dos 2.648 com mais de
uma oportunidade) e daria credito ao SDR por conexao que ele nao fez naquele ciclo.

**Aplicado (so frontend, nenhuma mudanca de dado):**
- `LeadCard` ganha faixa de aviso quando a oportunidade aberta **nao** tem conexao mas o
  contato tem outra(s) com historico — lista pipeline, status e as datas de conexao,
  agendamento e reuniao de cada uma. Consulta leve, por `contato_id`.
- Card "Nao conectados" do modo **Produtividade** renomeado para **"Sem conexao no
  periodo"** em Aquisicao e Trafego. O modo Cohort mantem "Nao conectados", que ali esta
  correto.

## 2026-08-06 BRT — Telefone com o DDI 55 do Brasil duplicado ("chat nao sincroniza")

**Sintoma (relato do dono):** "chat nao esta sincronizando com os leads" — a conversa
aparece num cadastro e a oportunidade em outro; e o SDR liga para numero invalido.

**O sync nao estava parado.** Medido: ultima mensagem gravada 2 minutos antes da checagem,
90 na ultima hora, nenhum dia vazio nos ultimos 35 dias, e so 3 comunicacoes em 282.696
sem `contato_id` (nenhuma nos ultimos 30 dias).

**A causa:** alguns contatos chegam do GHL com o `55` do Brasil repetido —
`+55` `55` `14` `99602-6623`. Para o GHL sao telefones diferentes, entao ele **nao mescla**:
o cadastro do formulario (payload de 169-179 campos, com email) fica com o numero errado e
o da conversa de WhatsApp (payload de 16-17 campos, sem email) com o certo. O historico do
lead racha entre os dois.

**Achado que mudou a solucao:** `extrair_dados_ghl_v2` grava
`telefone = w.mapped->>'phone'` **sem COALESCE nem normalizacao**. Um UPDATE pontual
evaporaria no proximo webhook daquele contato — em silencio. Isto tambem explica a
pendencia herdada *"algo sobrescreve `contatos.telefone` em producao"*.

**⚠️ `55` tambem e DDD legitimo (Santa Maria/RS)** — corrigir no atacado faria o SDR ligar
para outra pessoa. Classificacao medida (182 contatos com telefone `+5555%`):

| Grupo | Qtd | Na fila | O que e |
|---|---|---|---|
| A) `+55` `55` `9XXXXXXXX` (13 dig) | 73 | 12 | DDD 55 do RS — **nao tocar** |
| B) 15 digitos | 45 | 9 | DDI duplicado |
| C) 14 digitos | 1 | 1 | DDI duplicado provavel |
| D) 13 digitos sem o `9` | 53 | 10 | malformados, sem conserto por regra |
| E) curtos demais | 11 | 0 | lixo |

**Aplicado (migration `20261017000000`):**
- `normalizar_telefone_ddi_duplicado(TEXT)` — regra deliberadamente estreita: so 15
  digitos comecando em `5555` **e** que sobrem celular valido (`+55` + DDD + `9` + 8).
- Trigger `normalizar_telefone_contato` (BEFORE INSERT OR UPDATE OF telefone em
  `contatos`) — normaliza no ponto de escrita, entao vale para todo webhook futuro sem
  tocar nas ~350 linhas da funcao de extracao.
- Backfill: **36 telefones corrigidos**, backup em `_backup_contatos_telefone_20260806`
  (id, nome, telefone antigo e novo). Os 9 restantes de 15 digitos sao cadastros de teste
  com numero invalido (2222222222) e ficaram como estavam.
- **Verificado em producao:** grupo A intacto (`+5555991391283` sai igual da funcao);
  Paulo Dare passou a `+5514996026623`; e um UPDATE simulando o webhook com o numero
  errado foi normalizado pelo trigger (registro de teste restaurado depois).

**Ainda aberto:** os 53 do grupo D (10 na fila) nao fecham de nenhuma forma — falta um
digito, provavelmente digitacao errada no formulario. E os 15 casos em que ja existe
cadastro duplicado seguem com o historico dividido: por decisao do dono, **so sinalizados**
na tela (selo "telefone repetido"), sem fusao de dados.

## 2026-08-06 BRT — Cursor por DATA nas leituras grandes (fim dos 500 que voltaram)

**Sintoma:** HTTP **500** de novo nas abas de Vendas, em duas familias de query:
`comunicacoes` (`useCloserProdutividade`, `useCloserLeaderboard`) e `oportunidades`
(`offset=4000..7000`, select gordo com join de ~25 colunas de `contatos`).

**Duas causas, nao uma:**

1. **OFFSET ainda vivo** em 6 hooks de `oportunidades` (`useTrafego`, `useAquisicao`,
   `useOrganico`, `usePreVendas` x2, `useCamiVendas`, `useCreativeRankingData`). O PR #74
   trocou so os que quebravam na epoca.
2. **Cursor por `id` tambem e caro** quando a query filtra por periodo — e essa parte era
   nova. Com filtro de data, ordenar por `id` faz o Postgres varrer a PK descartando tudo
   que esta fora da janela. Medido em producao, uma pagina de 1.000 linhas em
   `comunicacoes`:

| Ordem/cursor | Tempo | Linhas descartadas pelo filtro |
|---|---|---|
| por `id` | **1.094 ms** | 18.361 |
| por `data_comunicacao` | **6 ms** | 1.271 |

**180x.** E o custo por `id` CRESCE a cada pagina, porque o cursor anda em espaco de uuid,
nao em espaco de data.

**Aplicado:**
- Helper novo `fetchAllPagesByTimeCursor` em `eb-dash2/src/lib/supabase/paginate.ts` —
  cursor pela coluna de data, `>=` com deduplicacao por `id` (dois registros podem ter o
  mesmo timestamp; `>` perderia o segundo em silencio).
- 8 leituras migradas nos hooks acima.
- Dois indices em producao: `idx_comunicacoes_ws_data_id` (workspace_id, data_comunicacao,
  id) e `idx_oportunidades_ws_data_lead_id` (workspace_id, data_lead_recebido, id), ambos
  `CREATE INDEX CONCURRENTLY`.
- `useCreativeRankingData` tambem ganhou o desempate por `id` que faltava: sem ele o corte
  entre paginas era indefinido e podia repetir ou perder linhas.

**Regra que fica:** paginacao grande com filtro de periodo pagina pela COLUNA DE DATA.
Cursor por `id` so quando nao ha janela temporal na query.

## 2026-08-06 BRT — Oportunidade presa ao contato antigo quando o GHL mescla duplicados

**Sintoma (relato do dono):** o painel de discagem mostrava o lead "Thiago Cassini" com
**0 ligacoes**, sem conversas, e o botao "abrir no CRM" nao funcionava.

**Nao era falha de sincronizacao.** No GHL, dois contatos com o mesmo telefone foram
**mesclados** e a oportunidade migrou para o contato vencedor — comportamento normal do
GHL. O webhook seguinte chegou com o mesmo `payload->>'id'` e um `contact_id` diferente.

**A causa:** o PASSO 2b de `extrair_dados_ghl`/`_v2` atualiza dezenas de colunas da
oportunidade, mas **nao atualiza `contato_id`**. A oportunidade fica presa para sempre ao
contato em que nasceu — o perdedor da mescla, que nem existe mais no GHL. Dai os tres
sintomas de uma vez: o painel exibe o contato errado; o historico esta no contato certo
(*0 ligacoes*); e o link do CRM usa um `ghl_id` que nao existe mais.

> Correcao de registro: o handoff de 05/08 dizia que esse contato "nao tinha nenhum
> webhook em 352 mil registros". Tinha dois — e sao eles que provam a mescla.

**Dimensao medida:** 30 dias, 9.099 oportunidades comparadas contra o `contact_id` do
ultimo webhook, **1 divergente**. Raro, mas apaga o lead do radar do SDR quando acontece.

**Aplicado (migration `20261016000000`):**
- Funcao + trigger `zz_reatribuir_oportunidade_contato` em `webhooks_ghl` (prefixo `zz_`
  de proposito: triggers AFTER INSERT disparam em ordem alfabetica e este precisa rodar
  depois de `auto_extrair_dados_ghl`). Resolve o contato **sempre dentro do workspace do
  webhook** — sem isso, um `ghl_id` repetido entre contas cruzaria tenants.
- Atualiza tambem `discagem_scores.contato_id`, que guarda o vinculo denormalizado.
- Backfill de 30 dias com backup em `_backup_oportunidades_contato_20260806`.
- Painel de discagem passa a marcar **"telefone repetido"** quando dois leads da fila
  compartilham telefone. Nao mescla nem troca o registro exibido: telefone repetido tambem
  acontece por motivo legitimo (socios, casal, central da empresa).

## 2026-08-05 BRT — Fim do join com `contatos` so para descobrir o workspace (34 queries)

**Sintoma:** depois de consertar a Produtividade, o mesmo erro reapareceu em outra tela
(`useLeadAtividades`) — HTTP **500** numa query em `comunicacoes`. Nao era caso isolado:
era o mesmo padrao repetido no projeto inteiro.

**A causa.** Todos os hooks descobriam o workspace **atravessando um join**:

```
.select('..., contatos!inner(workspace_id)')
.eq('contatos.workspace_id', wid)
```

So que `comunicacoes`, `oportunidades` e `vendas_fechamento` **ja tem coluna
`workspace_id` propria, com indice** — a Fase 6 do multi-tenant denormalizou isso
justamente para evitar o join (ver `docs/FASE-6-DENORMALIZACAO-CRM.md`). Os hooks nunca
passaram a usar. Verificado no banco antes de mexer: **100% preenchida, zero nulos** nas
tres tabelas.

**Custo medido** (a query que devolvia 500, em `comunicacoes` — 282 mil linhas, 360 MB):

| Forma | Tempo | Plano |
|---|---|---|
| Filtro pelo join | **796 ms** | `Parallel Seq Scan on contatos` — varre a tabela inteira |
| Filtro pela coluna propria | **87 ms** | `BitmapAnd` de dois indices |

9x mais rapido. Sob carga, os 796 ms viravam os 8s do `statement_timeout` — o 500 da tela.

**Aplicado:**
- **34 filtros** trocados para a coluna propria, em 11 arquivos. O script de migracao
  confere o `.from()` de cada encadeamento antes de trocar, em vez de substituir as
  cegas — nenhuma tabela sem a coluna foi tocada.
- **17 joins removidos** dos `select`: os que carregavam apenas `workspace_id` viraram
  peso morto depois da troca do filtro.

Vale para todas as telas, nao so a que quebrou: Trafego, Aquisicao, Leads, Pre-Vendas,
Producao, SDR, Criativos e Limpeza.

**Consequencia verificada antes de aceitar.** Remover `!inner` faz linhas orfas deixarem
de ser descartadas pelo join. Contagem real: **3 comunicacoes sem contato** em 282.257
(0,001%); **zero** em oportunidades e vendas_fechamento. Impacto pratico nenhum, mas fica
o registro.

Um teste travava o filtro antigo (`loadTrafegoDataset` > "escopa oportunidades pelo
workspace") e foi atualizado com o motivo no comentario. Suite de volta as mesmas 5
falhas pre-existentes.

**Ainda em aberto:** o `count: 'exact'` do `useLeadAtividades` continua sendo a operacao
mais cara daquela tela — e o preco de saber o total exato para a paginacao. Com o join
removido deve caber folgado; se voltar a pesar, o caminho e contagem estimada.

## 2026-08-05 BRT — Crons: um unico ofensor consumia 1h24 de banco por dia

Varredura dos 30+ crons agendados. O custo estava **concentrado em um so**:

| Cron | Freq. | Media | Pico | Custo/dia |
|---|---|---|---|---|
| `sync-tags-from-webhook` | 10 min | **34,9s** | **80,2s** | **~1h24 de banco** |
| `recalcular-discagem-scores` | 5 min | 4,3s | 28,1s | ~21 min |
| `backfill-conversas-temp` | 24x/h | 0,1s | 0,2s | trabalho **ja concluido** |
| outros 28 | — | 0,1s | ≤3,6s | desprezivel |

**Causa do cron pesado.** `sync_tags_from_latest_webhook(7)` varre 7 DIAS de
`webhooks_ghl` — 352 mil linhas, **2,9 GB**, a maior tabela do banco — para achar o
webhook mais recente de cada contato, e repetia isso 144x/dia refazendo 99% do mesmo
trabalho. Duas causas somadas:

1. **Nao existia indice em `created_at`.** So havia `(contact_id, created_at)`, que nao
   serve para filtrar por tempo: o Postgres percorria o indice inteiro, todos os
   contatos, desde sempre. (Sintoma de quanto isso pesa: uma simples contagem nessa
   tabela, feita durante o diagnostico, **estourou o statement_timeout**.)
2. Janela de 7 dias para um cron de 10 minutos e desproporcional.

**Ganho medido, com o indice em vigor:**

| Janela | Tempo |
|---|---|
| 7 dias | ~35.000 ms |
| 1 dia | 843 ms |
| 1 hora | **55 ms** |

**Aplicado em producao:**
- `idx_webhooks_ghl_created_at` criado com **CONCURRENTLY** (nao trava a ingestao de
  webhooks; 8 MB, valido). Versionado em `20260805190000` como `IF NOT EXISTS` sem
  CONCURRENTLY — que nao roda em transacao/migration — para setup do zero ficar igual.
- Sobrecarga `sync_tags_from_latest_webhook(interval)`; a versao em dias passa a
  **delegar**, sem duplicar logica.
- `jobid 92` (10 min) agora usa `interval '2 hours'`; novo `jobid 95` roda
  `sync_tags_from_latest_webhook(7)` diariamente as 04:40 como rede de seguranca.
- **`backfill-conversas-temp` desagendado** — `backfill_conversas_controle` mostra
  `ativo: false` e `concluido_em: 2026-08-05 01:59`. Eram 576 execucoes/dia de trabalho
  ja terminado. Era pendencia conhecida desde 04/08.

Estimativa: de ~1h24 de banco por dia para menos de 1 minuto.

**Nao tratado:** `recalcular-discagem-scores` (4,3s de media, pico de 28s, 288x/dia).
E o proximo da fila se a carga do banco voltar a incomodar.

## 2026-08-05 BRT — Thiago Muniz: faturamento para R$ 78.000 e teste da ponte desk→CRM

Pedido do Bruno (lider): o faturamento do Thiago no desk tem de ser **78k**, somando
parcelas de 6k. Reaplica o valor que a planilha da Larissa indicava e que tinha sido
revertido de manha por contradizer o contrato do desk — agora com decisao explicita.

**Teste da sincronizacao automatica, cronometrado:** update em `vendas_pendentes` as
17:37:52 → `sincronizado_em` as 17:37:54, `sincronizacao_erro` vazio. **1,7 segundo.**
O CRM ja mostra `valor_faturado` 78.000 / entrada 18.000 / 10 parcelas de 6.000.

Cronograma final (venda e contrato identicos): `Entrada 18.000 (02/07) + Parcelas 1..10
de 6.000` (mensais, dia 02, set/26 a jun/27). **O caixa de julho nao muda** — as
parcelas novas sao todas futuras; julho segue nos R$ 200.200.

**Bug encontrado pelo proprio teste:** as parcelas foram lancadas com o rotulo
`"Parcela"` sem numero e o trigger de renumeracao **nao pegou** — o padrao exigia
numero. Corrigido no desk (migration `20260805180000`, PR omnx-desk #4): passa a aceitar
`"Parcela"` e `"Parcela N"`. Foi ele que renumerou o Thiago para `Parcela 1..10` sozinho.

**Ponto em aberto:** o Bruno relatou "eu fiz mas ele nao salvou automaticamente" ao
editar **pela tela do desk**. O teste acima provou a ponte banco→CRM, mas **nao** o
caminho da interface. Pode haver falha no formulario de edicao do desk engolindo o
salvamento sem avisar — nao investigado ainda.

Backup: `_backup_thiago_20260805` (banco do desk).

## 2026-08-05 BRT — Produtividade quebrada: paginacao por OFFSET estourava o statement_timeout

**Sintoma:** a aba Produtividade de Vendas demorava e terminava em "Erro ao carregar dados de
produtividade", com todos os indicadores zerados. Cohort funcionava normalmente.

**Causa real (log do Postgres):** `canceling statement due to statement timeout`, dezenas de vezes,
sempre nas paginas com `offset` alto — 2000, 3000, 4000, 5000. No console do navegador as mesmas
requisicoes apareciam como **HTTP 500**.

Paginar com `.range()` custa mais a cada pagina: para entregar a linha 5.000 o Postgres materializa
as 5.000 anteriores e descarta. Com o `select` desses hooks (join de ~25 colunas de `contatos`), as
paginas profundas passavam do `statement_timeout` de 8s do Supabase.

**Correcao:** `fetchAllPagesByCursor` em `lib/supabase/paginate.ts` — paginacao por cursor
(`id > ultimo_id` + `limit`), que e index scan de custo constante. Aplicada nas tres leituras grandes:
oportunidades do `usePreVendasProducao`, oportunidades por evento e comunicacoes do
`useCloserProdutividade`. O `fetchAllPages` por OFFSET continua para leituras pequenas, onde o custo
nao aparece e a concorrencia compensa.

Armadilha do cursor, encontrada na primeira tentativa: `.gt('id', '')` vira `id=gt.` na URL e o
PostgREST responde **400** (string vazia nao e uuid). Na primeira pagina o filtro precisa ficar de
fora.

**Mensagem de erro deixou de esconder a causa.** Os dois hooks faziam
`err instanceof Error ? err.message : '<texto generico>'` — e erro do PostgREST **nao** e instancia
de `Error`, e sim um objeto `{ message, details, hint, code }`. Resultado: a tela sempre mostrava o
texto generico e jogava fora a causa. Passaram a usar `extractErrorMessage` (que ja existia em
`lib/errors.ts`). Foi esse detalhe que atrasou o diagnostico: a tela dizia "erro" sem dizer qual, e a
resposta estava no log do banco o tempo todo.

**Reducoes de volume aplicadas no mesmo passe** (`useCloserProdutividade`):

| Leitura | Antes | Agora |
|---|---|---|
| Oportunidades (select cheio) | 10.023 linhas, carregadas 2x | 1.408 (so com evento no periodo) |
| Mapa contato -> closer | 10.023 linhas | 827 contatos (os das comunicacoes do periodo) |

A base filtrada foi validada contra a completa antes de entrar: leads 1377, MQLs 289, agendados 120,
reunioes 45, no-shows 23, negociacao 9 — **identicos** nas duas.

Duas armadilhas preservadas: (a) venda paga no periodo pode nao ter **nenhum** evento no periodo
(lead de maio, reuniao em maio, pagamento em julho), entao as vendas sao carregadas primeiro e as
oportunidades delas entram na base mesmo sem evento na janela; (b) a busca de detalhes das opps pagas
continua **sem** excluir o pipeline de Recuperacao — 7 vendas pagas vivem la.

**Achado lateral, nao tratado:** o mesmo log mostra crons pesados competindo com o dashboard —
`sync_tags_from_latest_webhook` em **47s** e `recalcular_discagem_scores` em 10s. Nao sao a causa do
erro (o cursor resolve), mas encurtam a margem ate o timeout de quem estiver carregando a tela.

## 2026-08-05 BRT — Produtividade: fim do "Erro ao carregar dados" e da espera eterna

**Sintoma relatado pelo dono:** "sempre demora pra carregar e sempre buga com Erro ao carregar dados
de produtividade".

**Causa medida.** O `useCloserProdutividade` varria as **21.045 oportunidades** do workspace em
paginas de 1.000 — **em fila**, uma requisicao esperando a anterior — e fazia isso **duas vezes**:

1. `allEventOpps` (22 requisicoes em serie);
2. uma **segunda varredura identica** (mesmo workspace, mesmo filtro de pipeline) so para montar o
   mapa `contato_id -> vendedor_closer`, que ja podia sair da primeira (+22 em serie);
3. comunicacoes do periodo, ~17,5 mil linhas em julho (+18 em serie);
4. detalhes das opps pagas, em lotes de 100 tambem sequenciais.

Somando: **~65 idas e voltas em serie** por carga. O erro na tela era o estouro disso.

**Correcoes:**
- **Segunda varredura eliminada** — `contatoToCloser` agora deriva de `allEventOpps`, que ja traz
  `contato_id` e `vendedor_closer` sob filtro identico. 22 requisicoes a menos, resultado igual.
- **`fetchAllPages` (lotes concorrentes)** nas tres leituras grandes, no lugar dos `while (true)`
  sequenciais. O helper ja existia em `lib/supabase/paginate.ts`; este hook era o unico que ainda
  nao usava.
- **Lotes de opps pagas em paralelo** via `Promise.all`.

De ~65 requisicoes em serie para ~11 lotes concorrentes.

**Cuidado preservado:** a busca de detalhes das opps pagas continua **sem** excluir o pipeline de
Recuperacao — 7 vendas pagas vivem la e sumiriam se essa query tambem fosse derivada de
`allEventOpps`, que exclui esse pipeline. Verificado por contagem antes de mexer.

## 2026-08-05 BRT — Desk: rotulos alinhados e renumeracao automatica de parcelas

**Correcao de dado (aplicada em producao no banco do desk):**

- **Augusto Kraemer** — os R$ 17.000 de 23/07 estavam como "Parcela 1" na venda e "Entrada" no
  contrato. Como e o rotulo da **venda** que a ponte manda ao CRM, o painel exibia "Parcela 1".
  Alinhado ao contrato: virou "Entrada" e as parcelas renumeraram de 2..12 para 1..11. Venda e
  contrato agora identicos linha a linha; o CRM ressincronizou sozinho (19:35, sem erro).
- **Dante / MTD** — aqui o **contrato** e que estava errado: tinha as duas parcelas de 20.000 em
  31/07, inflando o caixa de julho dele para 40.000. A planilha do dono confirma a venda ("MTD
  CONSULTORIA · 07/08/2026 · R$ 20.000,00"). Parcela 1 movida para 07/08.
- **Carla e Nahuel** ficaram como estao, de proposito: sao dois pagamentos de mesmo valor e mesma
  data com os rotulos apenas trocados entre si. Conjunto identico, nenhum numero muda.

Backups: `_backup_vendas_pendentes_20260805_rotulo`, `_backup_contratos_20260805_rotulo`.

**Automacao nova (migration `20260805120000` no repo `omnx-desk`).** Quando alguem promove uma
parcela a "Entrada", as parcelas seguintes passam a **renumerar sozinhas**:

- `renumerar_parcelas_pagamentos(jsonb)` — renumera as linhas que casam com `Parcela N` em 1..N por
  ordem de vencimento. Linhas de "Entrada" e rotulos livres ("Sinal", "Pagamento pix", "Pagamento
  cartao 1") passam **intactos** — existem em contratos antigos e nao seguem numeracao.
- Triggers `BEFORE INSERT OR UPDATE OF pagamentos` em `contratos` e `vendas_pendentes`, para a linha
  ja ser gravada normalizada e os triggers seguintes (`data_pagamento`, ressincronizacao do CRM)
  verem o cronograma final.
- Idempotente: cronograma correto sai igual ao que entrou, entao nao marca a linha como alterada nem
  dispara ressincronizacao a toa.

**Dry-run antes de aplicar:** em 300+ registros, **um unico** mudaria — Victor Lacorte, que estava
com `Entrada | Parcela 2 | ... | Parcela 11` (sem Parcela 1), exatamente o mesmo bug. Corrigido pelo
backfill da migration.

**Prova em transacao revertida:** promovida a Parcela 1 do Eduardo Dias a "Entrada" →
`Entrada | Entrada | Parcela 1 | Parcela 2`. Renumerou sozinho; rollback aplicado.

## 2026-08-05 BRT — Caixa passa a ler o cronograma de pagamentos (parcela do mes conta)

**O que estava errado.** O caixa do mes somava `vendas_fechamento.valor_entrada`, que guarda
**apenas o primeiro pagamento** da venda. Parcela que caiu dentro do mes sumia. Em julho/2026 isso
escondia **R$ 36.000** das vendas do desk:

| Cliente | Desk registrou | Painel contava | Perdia |
|---|---|---|---|
| Leonardo / Lotus | 1.000 (07/07) + 9.000 (07/07) | 1.000 | 9.000 |
| Augusto Kraemer | 1.000 (14/07) + 17.000 (23/07) | 1.000 | 17.000 |
| Nahuel | 10.000 (27/07) + 10.000 (27/07) | 10.000 | 10.000 |

Nao era "so soma o que se chama Entrada": era **so o primeiro pagamento**, independente do rotulo. A
prova e o Erick, com tres linhas rotuladas "Entrada" (13.000) das quais o painel registrou 5.000.

**A correcao.** Dois helpers novos em `eb-dash2/src/hooks/useTrafego.ts`, aplicados em todos os
agregadores de caixa/faturamento (`useVendasCohort`, `useCloserLeaderboard`, `useCohort`,
`useProducao`, `useMatrizEficiencia`, `useCloserProdutividade`, `creativeRanking`, Matriz de Vendas,
card "Sem contrato assinado", `buildRevenueMap`, `buildCaixaPorCliente`):

- `caixaRecebidoAcumulado(row)` — regua do modo **Cohort**: soma os pagamentos ja ocorridos, sem
  recorte de periodo (ali o filtro fala da chegada do lead, nao do pagamento). Parcela futura fica de
  fora — e faturamento, nao caixa.
- `faturamentoDaVenda(row)` — soma o cronograma em vez de `valor_faturado`, que a ponte reconstroi
  como `entrada + N x parcela` arredondada e inventa centavo (Augusto virava 84.000,04; Nahuel,
  50.000,02).

O `caixaRecebidoNoPeriodo` (modo Produtividade) ja existia e continua sendo a regua do periodo.

**Guarda contra caixa fantasma — achado no meio do caminho.** A primeira versao aceitava qualquer
cronograma e o caixa de julho pulou para R$ 406.316,10. Investigado: **R$ 72.480,10 vinham de 75
contratos antigos do GHL** (o mais velho de ago/2025) cujas parcelas apenas *venceriam* em julho. O
cronograma do GHL e **previsao de vencimento**, nao pagamento — e chega sem rotulo (`sinal` booleano),
ao contrario do desk, onde o closer so lanca o que recebeu, com comprovante. A planilha de cobranca
confirma o risco: boa parte dessas parcelas de julho esta como "Atrasado". Helper
`cronogramaEhPagamentoRegistrado` passa a exigir rotulo textual; sem ele, cai no `valor_entrada`.

**Resultado em julho/2026:** caixa total **R$ 333.836,00** (era 297.836) — desk **192.200** (era
156.200, +36.000) e GHL **141.636** (inalterado, como deve ser).

**Regra da entrada partida (decisao do dono).** A entrada conta **inteira na data do primeiro
pagamento dela**, mesmo quando o cliente paga em dias diferentes — "o valor geral da entrada fica
sempre pela data do primeiro pagamento". Caso que define: Erick, entrada de R$ 13.000 partida em
5.000 (31/07) e 5.000 + 3.000 (01/08), as tres lancadas como "Entrada" no desk. Pela data crua,
R$ 8.000 vazariam para agosto. Implementado em `lancamentosDeCaixa`, que agrupa **so** as linhas
rotuladas "Entrada"; parcela continua valendo pela propria data, sem excecao.

**Com isso o caixa de julho do desk fecha em R$ 200.200,00 — identico ao Relatorio de Vendas.**
Total do painel: **R$ 341.836,00** (desk 200.200 + GHL 141.636).

| Fonte | Julho | Diferenca para o desk (200.200) |
|---|---|---|
| Relatorio de Vendas | 200.200 | **zero** |
| Extrato Marvee | 191.560 | +9.000 do Leonardo/Erick por data bancaria, −360 da HTZ/Fabrine |

**Bug corrigido junto — card mostrava R$ 0,00 com a lista somando R$ 192.200.** O modal de
detalhamento montava a lista sempre com o universo do modo **Cohort**, enquanto o card lia o total do
modo **Produtividade** (`prodOverall`): duas fontes na mesma tela. `useCloserProdutividade` passa a
expor `caixaPorCliente` do proprio universo e `GeralTab` escolhe a lista conforme o modo ativo.

**Nomes clicaveis** nos modais de Caixa, Faturamento e "Sem contrato assinado" — abrem o LeadCard,
como nas demais tabelas. O modal de pendentes tambem passou a exibir os valores pela regua nova (usava
`valor_faturado`/`valor_entrada` crus e divergia do proprio rodape).

**Divergencia de rotulo entre contrato e venda no desk (aberto, dado, nao codigo).** No contrato do
Augusto Kraemer as duas linhas sao "Entrada" (1.000 em 14/07 + 17.000 em 23/07); na venda
(`vendas_pendentes`), a de 23/07 esta como "Parcela 1" — e e o rotulo da **venda** que a ponte manda
ao CRM. Em julho nao muda o total (ambas caem no mesmo mes), mas em um caso de virada de mes mudaria.
O mesmo vale, invertido, para Nahuel e Dante. Correcao pertence ao desk: ou alinhar o rotulo da venda
ao do contrato, ou a ponte passar a enviar o cronograma do contrato quando existir.

**Pendencia real: HTZ IMOVEIS / Fabrine (R$ 360, 28/07)** existe na planilha e no extrato, mas **nao
existe no desk nem no CRM**. Unica venda de julho sem registro em sistema nenhum.

Cobertura: `eb-dash2/test/caixa-cronograma.test.ts` (9 casos, todos com os valores reais de julho —
incluindo o do cronograma-previsao do GHL). Build verde; as 5 falhas da suite sao pre-existentes
(`useNavigate` sem Router em RelatoriosPage e um teste de paginacao), identicas antes e depois.

## 2026-08-05 BRT — Julho: as 4 edicoes da planilha desfeitas, contratos do desk como prova

Depois de reverter Daniel e Erick (entrada abaixo), a tabela `contratos` do desk foi inspecionada e
**provou que a planilha errava tambem no Thiago e no Dante**. O campo `pagamentos` (jsonb) do contrato
bate exatamente com o da venda em todos os clientes de julho — exceto justamente esses dois, porque a
edicao da manha tocou a venda e nao o contrato. O contrato ficou intacto com o valor original:
Thiago **24.000** (nao 78.000) e Dante **260.000** (nao 280.000). Ambos revertidos a pedido do dono.

**Estado final de julho no painel:** 26 vendas, caixa **R$ 297.836,00**, faturamento **R$ 879.170,14**
(desk: 10 vendas, 156.200 / **641.350,06** — o mesmo numero intocado medido antes de qualquer edicao;
GHL/venda direta: 16 vendas, 141.636 / 237.820,08).

**Semantica dos campos de `contratos` (levantada nesta sessao, valia como incognita):**

| Campo | O que e | Confiavel? |
|---|---|---|
| `data_pagamento` (= `pg_entrada`) | dia em que a entrada caiu na conta — data de **caixa** | sim |
| `data_fechamento` | dia em que o contrato foi fechado/assinado — data de **venda**, nao e dinheiro | sim |
| `valor_total` | valor do contrato — **faturamento** | sim |
| `pagamentos` (jsonb) | cronograma real, pagamento a pagamento | **melhor fonte** |
| `entrada` | valor da entrada | **NAO** — NULL em 4 dos 12 de julho |
| `fat_bruto` | ora vale a entrada (Thiago/Victor/Augusto), ora o total (Leonardo/Eduardo/Daniela) | **NAO** |
| `num_parcelas` / `valor_parcela` | inconsistentes com o cronograma | **NAO** |

As duas datas divergem de verdade: Augusto pagou 14/07 e fechou 23/07; Leonardo pagou 07/07 e fechou
13/07; **Erick e Daniel pagaram 31/07 e fecharam 03/08** — agrupar por fechamento joga os dois para
agosto. Bruno Sevarolli (fechou 01/07, pagou 30/06) e Gabrihel (fechou 01/07, pagou 14/06) fecharam em
julho mas nao sao caixa de julho.

**Contrato tambem nao e fonte unica — 2 furos reais:** (a) Dante tem duas parcelas de 20.000 em 31/07
no contrato (caixa jul = 40.000), enquanto a venda e a tabela do dono dizem uma so (20.000) — a venda
esta certa, o contrato erra a data; (b) Victor Lacorte esta **sem cronograma nenhum** no jsonb do
contrato, so a venda tem. Por isso a regra proposta e: `pagamentos` do contrato como fonte, venda como
fallback quando o contrato nao tiver cronograma, e divergencia real resolvida caso a caso.

Backups do estado com a planilha aplicada: `_backup_vendas_pendentes_20260805_pos_edicao` (Daniel,
Erick) e `_backup_vendas_pendentes_20260805_pos_edicao_2` (Thiago, Dante), no banco do desk.

## 2026-08-05 BRT — Julho: Daniel e Erick revertidos, reconciliacao fecha nos tres lados

**A planilha da Larissa estava errada nessas duas linhas.** O dono trouxe a tabela nova (colunas
MARVEE = extrato bancario e RELATORIO VENDAS), que contradiz a correcao aplicada de manha.
Comparacao linha a linha de julho: **o desk batia com a tabela nova em tudo**, exceto justamente
Daniel Graziane e Erick — as duas linhas que eu havia alterado com base na planilha.

Revertidas em `vendas_pendentes` a partir de `_backup_vendas_pendentes_20260805`; a
ressincronizacao automatica levou ao CRM em 1-2s, `sincronizacao_erro` vazio nas duas:

| Cliente | Estava (planilha) | Voltou para | CRM agora |
|---|---|---|---|
| Daniel Graziane | 13.000 + 9.000 = 22.000 | 10.200 unico em 31/07 | entrada 10.200 / faturado 10.200 |
| Erick Oliveira | 9.000 unico | 5.000 (31/07) + 5.000 e 3.000 (01/08) + 3x 3.050 = 22.150 | entrada 5.000 / faturado 22.150 |

**Caixa de julho no desk voltou a R$ 192.200 — e agora reconcilia exatamente:**
- vs. Marvee (191.560): +1.000 do Leonardo que caiu na conta em 30/06, -360 da HTZ/Fabrine que nao existe no desk.
- vs. Relatorio Vendas (200.200): -8.000 do Erick, que a conta recebeu em 01/08 e o relatorio lanca em julho.

**Thiago Muniz (78.000) e Dante/Matheus Mascena (280.000) NAO foram revertidos** — o caixa de julho
deles ja batia com a tabela nova; so o faturamento futuro veio da planilha. Decisao pendente do dono.

**Achado aberto — a regra de "caixa" do dashboard esta incompleta.** `useVendasCohort` soma apenas
`vendas_fechamento.valor_entrada`, alimentado so pelo pagamento rotulado `Entrada` no desk. Pagamento
rotulado `Parcela` que cai dentro do mes e ignorado. So em julho isso esconde R$ 36.000 das vendas do
desk (Leonardo 9.000 em 07/07, Augusto Kraemer 17.000 em 23/07, Nahuel 10.000 em 27/07): o dashboard
mostra 163.000 onde o real e 199.000. Regra correta, confirmada pelo dono: **caixa do mes = soma de
todo pagamento com data no mes, independente do rotulo**. Correcao ainda NAO aplicada (muda codigo +
historico de todos os meses, aguarda autorizacao).

**Residuo cosmetico:** a linha do Daniel no CRM ficou com `valor_parcela = 9.000` e
`numero_parcelas = 0`. `valor_faturado` esta correto (10.200) e nenhum painel le esses dois campos
juntos, mas fica registrado.

Backups: `_backup_vendas_pendentes_20260805` (original de hoje de manha) e
`_backup_vendas_pendentes_20260805_pos_edicao` (estado com a planilha aplicada), ambos no banco do desk.

## 2026-08-05 BRT — Ponte omnx-desk: a sincronizacao E automatica (provada), o dado e que esta errado no desk

**Correcao de um diagnostico meu, publicado antes com a conclusao errada.** Eu havia afirmado que "o desk nao reenvia sozinho quando alguem edita". Isso estava errado. Com acesso ao repositorio do desk (`GitHub/omnx-desk`) e ao banco dele (`wuzmckatbmlpkdxtfhqr`), o quadro real e:

- Commit `7fd2f0e` (04/08 19:06) — *"venda e contrato editados no Desk atualizam o CRM sozinhos"*.
- Triggers `trg_venda_ressincronizar_crm` (em `vendas_pendentes`) e `trg_contrato_ressincronizar_venda_crm` (em `contratos`) **instalados e ativos** em producao.
- Edge function `vendas-ressincronizar-crm` **ACTIVE**; secret `notify_webhook_secret` no Vault; `pg_net` instalado.
- O trigger e bem construido: disjuntor `app.skip_venda_resync` para lotes, so dispara quando um campo que vai ao CRM muda de fato (evita laco infinito), e ignora venda ainda sem vinculo.

**Teste de ponta a ponta executado (e revertido).** Marcador em `observacoes` de uma venda no desk as 16:36:39,77 → apareceu no CRM as 16:36:41,59. **1,8 segundo, sem intervencao.** A remocao do marcador tambem propagou. A automacao funciona.

**A causa real do numero errado:** os valores **nunca foram corrigidos no desk**. Todas as 4 vendas divergentes estao com `sincronizacao_erro` vazio e `sincronizado_em` preenchido — o dashboard e um espelho fiel do desk.

**Consequencia pratica, comprovada na pratica:** correcao feita a mao no CRM **e desfeita** pela ressincronizacao. Durante o teste, a linha do Daniel Graziane voltou de 13.000 para 10.200 sozinha. Por isso **o CRM foi restaurado ao espelho do desk** — numero que muda sozinho depois e pior do que numero errado visivel.

**Divergencias reais, a corrigir NO DESK** (planilha da Larissa como referencia):

| Cliente | Desk tem | Planilha | Acao |
|---|---|---|---|
| Thiago Muniz | 24.000 | 78.000 | faltam 9 parcelas de 6.000 |
| Dante (opp "Matheus Mascena") | 260.000 | 280.000 | falta 1 parcela de 20.000 |
| Daniel Graziane | 10.200 | 22.000 | entrada 13.000 + 9.000 restante |
| Erick (Verzaska) | 22.150 | 9.000 | desk tem 13.150 **a mais** |

Caixa de julho: desk 192.200 x planilha 199.000 (Daniel +2.800, Erick +4.000).

**Segundo erro meu, tambem corrigido aqui:** eu disse que "a diferenca de 660 para 714 e exatamente o Thiago (54.000)". Aquela medicao de 660 **ja estava contaminada pelas minhas proprias edicoes manuais**. O numero real, intocado, e **R$ 641.350,06**, e a diferenca para a planilha e de **R$ 72.649,94**, distribuida nos 4 clientes acima.

**Correcao aplicada NO DESK (fonte da verdade), 05/08 16:44 BRT.** Decisao do dono: planilha da Larissa manda. As 4 vendas foram corrigidas em `vendas_pendentes` (banco do desk), e a ressincronizacao automatica levou tudo ao dashboard sozinha, em segundos, com `sincronizacao_erro` vazio nas 4:

| Cliente | Desk antes | Desk agora | Como |
|---|---|---|---|
| Thiago Muniz | 24.000 | **78.000** | + parcelas 2..10 de 6.000, seguindo a cadencia mensal ja existente (dia 02) |
| Dante (opp "Matheus Mascena") | 260.000 | **280.000** | + Parcela 13 de 20.000, mesma cadencia (dia 14) |
| Daniel Graziane | 10.200 | **22.000** | entrada 13.000 em 31/07 + 9.000 em 31/08 |
| Erick (Verzaska) | 22.150 | **9.000** | pagamento unico de 9.000 em 31/07 (removeu 13.150 de parcelas futuras) |

**Julho fechado: caixa R$ 199.000 e faturamento R$ 714.000**, batendo com a planilha nos dois sistemas.

**Ressalvas registradas:** (a) as datas das parcelas novas do Thiago, do Dante e a do Daniel (31/08) foram **inferidas** da cadencia existente — se os termos reais forem outros, corrigir no app; (b) o Erick **perdeu 13.150 em parcelas futuras**, o que afeta cobranca no desk; (c) a coluna `valor_total_venda` do desk **nao foi tocada** (semantica inconsistente na base: em Thiago valia 18.000 com soma 24.000; o CRM nao a le). Backup em `public._backup_vendas_pendentes_20260805` (banco do desk) e `public._backup_vendas_20260805` (CRM).

**Achado extra:** o desk tem **2 vendas duplicadas** apontando para a mesma oportunidade (Bruno Sevarolli e Tiago Friedrich). No CRM o upsert por `oportunidade_id` colapsa as duas em uma, entao o dashboard nao duplica — mas o desk conta duas vezes.

## 2026-08-05 BRT — Vazamento de leitura da ponte omnx-desk fechado em producao

Aplicado em producao pelo rollout de 2 migrations + deploy, **sem janela de indisponibilidade**:

1. Migration `20261015000000` — cria `buscar_lead_para_venda(p_workspace_id, p_telefone, p_email)`. A assinatura antiga de 2 args segue viva, entao o desk nao para.
2. Deploy de `crm-buscar-lead` e `crm-sync-stats` — passam a resolver a conta pelo digest do secret e a informar o workspace.
3. Migration `20261015000001` — remove a assinatura antiga, a que vazava.

A premissa inicial de que as duas assinaturas colidiriam (forcando um DROP junto e criando janela de erro) **estava errada**: `p_workspace_id` nao tem DEFAULT, entao uma chamada com 2 argumentos nomeados so casa com a antiga. Verificado em producao com duas funcoes temporarias antes de escolher o caminho.

**Prova pos-aplicacao** (telefone que so existe no tenant de demonstracao, simulando o contexto real da edge function):

| Chamada | Antes | Depois |
|---|---|---|
| workspace `Default` (o do desk) | 1 candidato (vazava) | **0** |
| sem workspace | — | **0** (fail-closed) |
| workspace do proprio demo | 1 | 1 (correto, e o dono) |

Busca real do desk intacta: telefone de lead do `Default` retorna 8 candidatos normalmente.

## 2026-08-05 BRT — Clicar em Caixa e Faturamento abre o detalhamento por cliente

## 2026-08-05 BRT — Ponte omnx-desk: escrita isolada, leitura vazava

**Pedido:** verificar se o dado do desk cai só na subconta certa, se o webhook está correto e se há perda de dados.

**O que estava certo.** A escrita é isolada de fato: `crm-registrar-venda` e `crm-marcar-assinada` resolvem o workspace pelo digest SHA-256 do secret e devolvem **403** se a oportunidade for de outra conta. Credencial por conta ativa para o `Default` desde 28/07. Prova nos dados de produção: **0** vendas com workspace divergente do da oportunidade, **0** com contato de outro workspace, **0** sem workspace; as 23 vendas `omnx_desk` estão todas no `Default`, nenhuma no tenant de demonstração. Sem perda de dados: 23/23 completas (0 sem data de entrada, sem pagamentos, sem comprovante ou sem closer). Webhook GHL saudável (202 em todas as chamadas, sem erro). As 2 oportunidades `won` sem venda são de `[fn] webinário` e `Social Selling`, sem data de fechamento nem closer — ganho de etapa, não venda.

**O achado real — vazamento de LEITURA.** `crm-buscar-lead` só aceitava o secret **global** (sem roteamento por conta) e chamava `buscar_lead_para_venda(p_telefone, p_email)`, cujo guard era `auth.role() = 'service_role' OR is_workspace_member(...)`. Como a edge function conecta com a service role key, o primeiro ramo era **sempre** verdadeiro — a busca varria todos os workspaces. Reproduzido: telefone existente só no tenant de demonstração devolveu o contato (nome, e-mail, telefone) e suas oportunidades (título, funil, SDR, closer). Hoje o exposto é dado fictício; com o 2º cliente pago seria vazamento real.

**Segundo achado.** `crm-sync-stats` contava vendas do desk **sem filtro de workspace** — o monitor de uma conta recebia o total de todas.

**A correção.**
- Migration `20261015000000`: `buscar_lead_para_venda(p_workspace_id, p_telefone, p_email)` — workspace obrigatório e sempre aplicado (no contato **e** na oportunidade), `NULL` retorna vazio, `REVOKE` nominal de `anon`/`authenticated`. Assinatura antiga removida de propósito: manter as duas criaria overload ambíguo.
- `crm-buscar-lead` e `crm-sync-stats` passam a resolver a conta pelo digest, como as outras duas. O secret global sobrevive só enquanto existir **uma única** conta `omnx_desk` cadastrada; com duas ou mais, nega (fail-closed) com mensagem apontando para Administração → Integrações.

**Fica registrado (item aberto):** em `crm-registrar-venda`/`crm-marcar-assinada` o fallback do secret global **pula inteiramente** a checagem cross-tenant — grava no workspace da oportunidade, seja qual for. Inofensivo com um cliente só; precisa ser aposentado antes do 2º, depois de confirmar com o programador do desk que ele já usa o secret por conta.

## 2026-08-05 BRT — Dashboard mais rápido: cache, páginas em paralelo e bundle dividido

Diagnóstico medido (o banco **não** era o gargalo — 12 ms por página; `oportunidades` tem 21.021 linhas, não as ~4.770 que o `CLAUDE.md` ainda cita):

| # | Causa | Correção |
|---|---|---|
| 1 | Sem cache: `useEffect` cru nos hooks pesados — sair da aba e voltar refazia tudo | `useTrafego`, `useAquisicao`, `useOrganico` e `usePreVendas` migrados para `useQuery` (staleTime de 5 min já configurado em `main.tsx`) |
| 2 | Páginas buscadas em fila (página N+1 só depois da N) | Helper novo `src/lib/supabase/paginate.ts` (`fetchAllPages`) busca em lotes concorrentes de 4; aplicado nos 4 hooks |
| 3 | Bundle único de 2.032 kB — abrir o login baixava o sistema inteiro | `React.lazy` por rota em `App.tsx` + 2 `Suspense` (um dentro do `DashboardLayout`, para não piscar a sidebar) |

**Bundle inicial: 2.032 kB → 660 kB** (gzip 515 kB → 192 kB), em 85 pedaços carregados sob demanda.

Efeito colateral bom da migração: sumiram as máquinas de `cancelled` manuais — o TanStack Query descarta resultado obsoleto por conta própria.

## 2026-08-05 BRT — Build da Vercel quebrado por sobra da mudança da aba Clara

**O sintoma.** Nada subia para produção: o deploy da Vercel falhava desde a sessão de 04/08.

**A causa.** Ao mover "Configurar Clara" de Relatórios para `/workspace/clara` (Administração), a rota nova, a sidebar e o redirect do link legado ficaram corretos — mas o ramo do ternário que renderizava a aba antiga permaneceu em `RelatoriosPage.tsx`, chamando `isAdminOrOwner` e `ConfigurarClaraTab`, que já não existiam mais naquele arquivo. Dois `TS2304`.

**A armadilha que deixou passar.** Os dois comandos de validação recomendados no `CLAUDE.md` davam verde falso:

| Comando | Resultado |
|---|---|
| `npx vite build` | ✅ passava — o Vite não checa tipos |
| `npx tsc --noEmit` | ✅ passava — o `tsconfig.json` raiz é só `references`, então não checa nada |
| `npm run build` (`tsc -b && vite build`) | ❌ falhava — **é o que a Vercel roda** |

**A entrega.** Trecho morto removido; `tsc -b --force` e `npm run build` verdes. Para validar build daqui em diante, o comando correto é `npm run build` (ou `npx tsc -b`), nunca `tsc --noEmit` sozinho.

## 2026-08-04 BRT — Caixa passa a ser o dinheiro recebido no período

**O sintoma.** Julho exibia R$ 156.200 de caixa; a planilha de vendas dizia R$ 199.000.

**A causa.** O caixa vinha de `vendas_fechamento.valor_entrada`, herança do modelo antigo em que cada venda tinha UMA entrada. Hoje o omnx-desk manda o cronograma completo, com data em cada pagamento — e o dashboard ignorava. Casos medidos em julho/2026:

| Venda | Entrou no mês | Caixa exibido | Motivo |
|---|---|---|---|
| Augusto Kraemer | R$ 18.000 | R$ 1.000 | R$ 17.000 recebidos 9 dias depois **não apareciam em mês nenhum** |
| Nahuel | R$ 20.000 | R$ 10.000 | 2ª parcela no MESMO dia, contada como futura |
| Lótus/Leonardo | R$ 10.000 | R$ 1.000 | idem |

**A entrega.** `caixaRecebidoNoPeriodo(row, periodo)` em `useTrafego.ts` soma os pagamentos cujo `data` cai no período; `computeRevenueKpis` ganhou o parâmetro. Aplicado em Vendas → Geral, Aquisição e Tráfego (nos dois modos) e no `useCloserProdutividade`. Sem cronograma (vendas `origem='ghl'`), cai no `valor_entrada` — sem regressão. **Julho: R$ 156.200 → R$ 192.200.** Não precisou de backfill: é cálculo.

**Hipótese descartada.** Cogitou-se "somar tudo que está marcado como Entrada". Erraria: o Erick tem três lançamentos "Entrada", dois em 01/08 — jogaria R$ 8.000 de agosto dentro de julho. O critério é a data, não o rótulo.

## 2026-08-04 BRT — Contrato do desk chega ao CRM (`contrato_status`)

O card "Sem contrato assinado" acusava vendas que **tinham contrato assinado** no omnx-desk. Causa: o CRM só enxergava assinatura por dois caminhos indiretos — os campos do webhook OpenClaw ou a etapa "Assinada" do card — e **nenhum dos dois vê contrato fechado fora do Clicksign**. Em 04/08/2026 havia 17 contratos `ativo` sem link no desk.

- **Coluna `contrato_status`** em `vendas_fechamento` (migration `vendas_fechamento_contrato_status`), com índice parcial.
- **`crm-registrar-venda`** aceita `venda.contrato = { status, link_assinatura, data_assinatura }` e grava os três com COALESCE — envio sem contrato nunca apaga o que já existe.
- **Critério do card** (decisão do dono): contrato `ativo`/`concluido`/`pausado` no desk **é** contrato assinado. Rascunho ou venda sem contrato seguem pendentes. As três vias (status, campos antigos, etapa do funil) valem em conjunto.
- **Resultado do backfill:** 20 das 23 vendas do desk com contrato ativo. Pendentes reais: **Dante** e **Daniel Graziane** (rascunho) — exatamente o que o dono apontou — mais 3 vendas antigas de `origem='ghl'`.

## 2026-08-04 BRT — Fila de discagem: 98% dela tinha só DOIS scores

Reportado como "verificar se a fila de discagem está precisa e correspondendo à realidade". Não estava: **3.357 leads com score exatamente 200 e 721 com exatamente 95** — 97,9% da fila em dois valores, ou seja, a ordem entre milhares de leads era decidida pelo banco, não pela priorização.

**Causa raiz.** Todos os componentes do score de cadência eram cegos: `sinal_resposta` e `recencia` olhavam 24h; `engajamento` e `fadiga` contavam toques dos últimos 14 dias. Só que o lead mediano dessa fila tem **162 dias de idade e 153 dias desde o último toque** — todos zeravam, sobrando apenas a tag MQL (1000 ou 300), que sozinha produzia os dois valores. O sinal existia e não estava sendo lido: **764 leads nunca receberam nenhum contato** e 1.781 já responderam alguma vez.

**Redesenho.** Janelas curtas trocadas por histórico completo, com pesos tirados da distribuição real: sinal de engajamento 30%, pausa respeitada 25% (nunca tocado = topo; tocado há menos de 2 dias = fundo), fadiga histórica 20%, qualificação em degraus 15%, frescor 10%. Faixas deixam de competir entre si. Resultado medido: **367 scores distintos (antes 40), sendo 349 só na cadência (antes 2)**, em curva, sem empilhamento.

**Mudança estrutural:** a fila passa a ser reconstruída a partir de uma tabela temporária em vez de DELETE + UPSERT. Isso mata por construção a classe de bug em que a condição existia no DELETE mas não no INSERT — era o caso de "já ligou hoje", cujo DELETE era desfeito pelo INSERT do mesmo ciclo (5 leads na fila hoje já tinham recebido ligação no dia).

**Também saem da fila:** 95 leads sem telefone (não há o que discar), 88 com tag de bloqueio explícito, 1 que **já pagou** (o corte antigo olhava só o status do GHL, não o pagamento — regra canônica do projeto), 285 linhas duplicadas do mesmo contato, e as linhas com `status` NULL, que o antigo `WHERE status != 'open'` nunca removia porque `NULL != 'open'` é NULL, não verdadeiro.

**Bug de linguagem pego na revisão (o mais perigoso).** A primeira versão da migration usava `COALESCE(GREATEST(0, <expr>), default)` para dar valor padrão a lead sem histórico. No PostgreSQL, `GREATEST` e `LEAST` **ignoram NULL** — `GREATEST(0, NULL)` é 0, então o `COALESCE` nunca disparava. O padrão virava 0 e **"nunca tocado" seria lido como "tocado agora mesmo"**, invertendo exatamente o público que o redesenho quer priorizar (764 leads).

**Performance.** A condição `(t.deleted = false OR t.deleted IS NULL)` em `ghl_tasks` impedia o uso de um índice parcial — e o `OR` era código morto, porque a coluna é `NOT NULL`. Medido: **410 ms / 119 mil blocos → 90 ms / 13 mil**. O recálculo inteiro caiu de ~735 ms para ~400 ms, sem criar índice novo. O índice que a versão anterior propunha em `comunicacoes` foi **removido**: não cobria uma das colunas do filtro, logo não evitava a ida ao disco — seria só escrita extra na tabela mais quente do sistema.

**`buscar_reengajamento` estava 100% quebrada:** fazia `SELECT c.body`, mas a coluna se chama `mensagem_body`. Toda chamada levantava erro e o frontend engolia (`if (rErr) return`), então o bloco "Reengajar" nunca apareceu desde que foi escrito.

**Frontend:** a fila era buscada sem paginação e o PostgREST corta em 1.000 linhas — com o filtro de SDR aplicado **depois** do corte. Em `Default/recuperacao` (2.076 linhas) isso deixava **1.076 leads invisíveis**. Corrigido com paginação e ordem determinística. O contador "Ligações hoje" passou a filtrar por workspace: a view usada não expõe a coluna e junta `ghl_users` sem filtro, somando contas para quem tem acesso a duas.

**✅ Aplicada em produção em 2026-08-04**, medido antes/depois:

| | Antes | Depois |
|---|---|---|
| Linhas na fila | 4.161 | 3.718 |
| Scores distintos (total) | 42 | **368** |
| Scores distintos na cadência | 23 | **349** |

Verificações pós-aplicação: bloqueados na fila **0**, já pagaram **0**, duplicatas por (contato, escopo) **0**, `sdr_name` preenchido em 99,4%, faixas de score sem sobreposição entre camadas. `buscar_reengajamento` executou sem erro e devolveu resultado pela primeira vez desde que foi escrita.

Recálculo completo: **6,25s** a frio — 15x acima da estimativa de 400ms (que media só a montagem da fila, sem o DELETE+INSERT de 3.718 linhas nem o `ANALYZE`), mas ainda 2% do intervalo do cron de 5 minutos.

**Achado colateral não resolvido:** durante a verificação apareceram contatos com `telefone` vazio cujo `updated_at` é posterior ao recálculo — ou seja, o telefone está sendo apagado por escrita concorrente, alguns por minuto. O filtro da fila está correto (o ciclo seguinte os remove), mas a causa da escrita ficou em aberto. Suspeita a investigar: mesma classe do bug de UTM apagada por webhook vazio (ver entrada de 2026-08-03) — webhook parcial sobrescrevendo campo que ele não carrega.

## 2026-08-04 BRT — 12 Edge Functions em 401 há 3 semanas; chat dos leads sem sincronizar

Reportado como "chat não está sincronizando com os leads". Procedia — e era **muito maior** que o chat: o workspace real não recebia mensagem nova em `comunicacoes` desde **2026-07-14 12:11**, e outras 11 funções estavam igualmente paradas.

**Causa 1 (a que bloqueava tudo) — guard de `service_role` desatualizado.** O lote de Edge Functions deployado em 14/07 às 12:56 levou a versão do guard que compara o token com a variável de ambiente. A versão que valida pela claim `role` do JWT (imune a rotação de chave) entrou no git em **15/07** — um dia depois. Como o valor no Vault e a env do runtime divergiram, as 12 funções congeladas naquele deploy passaram a responder **401 a todo disparo de cron**. Tudo que foi redeployado a partir de 15/07 seguia em 200 — por isso as oportunidades continuavam entrando e só as mensagens sumiram.

Prova que fechou o diagnóstico: `ghl_conversations_sync_log` com **zero linhas** após 14/07 12:50, sendo que o registro é aberto *antes* de qualquer resolução de tenant. Se fosse falha de tenant, haveria linhas com `status='error'`.

**Correção 1 — redeploy** das 11 funções (`sync-contact-opportunities`, `reconcile-contact-opportunities`, `sync-contact-tasks`, `sync-appointment-dates`, `sync-ghl-users`, `sync-recuperacao-stages`, `recuperacao-prefetch`, `recuperacao-corrigir`, `diag-ghl`, `sync-ad-permalinks`, `discover-agency-locations`). Verificado: 401 por ciclo caiu de **4 → 1** (o remanescente era o próprio sync do chat, deixado por último de propósito), `reconcile` voltou a rodar 29–39s de processamento real e `ghl_tasks` recebeu a primeira escrita em 21 dias.

**Causa 2 — cron sem tenant.** `sync_ghl_conversations_job()` disparava **uma** chamada com `{"mode":"incremental"}`, sem dizer de qual cliente. A função exige tenant desde a Fase 2 e falha fechado. Agora itera as credenciais GHL ativas e dispara **uma chamada por workspace** (migration `20261013000000`).

**Três defeitos silenciosos achados no caminho:**

1. A tabela de log **rejeitava o modo `backfill_by_contact`** (o CHECK só aceitava dois modos) — o caminho acionado pelo webhook de mensagem nunca conseguiu nem abrir registro.
2. `finishSyncLog` **descartava o erro**: um upsert que falhava em todas as conversas ainda terminava como `success` com `error_message` NULL. Foi isso que manteve o problema invisível por semanas.
3. `comunicacoes.workspace_id` nunca era escrito pelo sync — dependia de um trigger que resolve via `contato_id`. Conversa de contato ainda inexistente ⇒ trigger devolve NULL ⇒ coluna é `NOT NULL` ⇒ **o lote inteiro era rejeitado**.

**Outras correções na Edge Function:** filtro de workspace em toda leitura de `contatos` (o backfill varreria os 8.336 contatos fictícios do demo contra a conta real); `contactId` do webhook finalmente respeitado (antes sincronizava sempre o *primeiro contato da tabela*); marco temporal por workspace (um cliente avançava o relógio do outro, que perdia a janela para sempre); teto de 24h na janela; paginação por cursor de data no lugar do `?page=N` da GHL, que é quebrado e fazia reler o mesmo bloco eternamente; e status `partial` para execução interrompida não virar marco.

**Achado durante a validação em produção:** o primeiro ciclo gravou 2.157 mensagens e foi **morto pela plataforma aos ~3 minutos** — o limite de tempo só era checado *entre* páginas, nunca *dentro* de uma. Corrigido com `deadline` dentro do laço de conversas e orçamento reduzido para 90s, deixando folga para fechar o log.

**Pendências registradas:** backfill das ~31 mil mensagens de 14/07 a 04/08 (o incremental cobre só as últimas 24h, por desenho); alinhar a chave do Vault com a env do runtime — enquanto divergirem, qualquer deploy que reintroduza o guard antigo quebra em silêncio; e decidir o destino do workspace `Burn-in Interno`, que tem credencial ativa apontando para uma conta real do GHL com conversa viva e nenhum contato local.

## 2026-08-04 BRT — Card "Sem contrato assinado" em Vendas → Geral

Pedido do dono: vendas que já subiram pelo omnx-desk mas ainda não foram assinadas precisam **somar** em vendas/caixa/faturamento, e ao mesmo tempo aparecer numa somatória e numa lista separadas, para o time saber o que falta cobrar.

**Diagnóstico (produção, 2026-08-04).** A primeira metade já era o comportamento real: a venda entra em `vendas_fechamento` assim que o atendimento conclui e vincula no desk — antes de qualquer assinatura — e todo painel conta venda por `data_pagamento_entrada`. Nenhum filtro do dashboard olhava assinatura. Medição: 19 vendas `origem='omnx_desk'` (R$ 582.500 faturado / R$ 269.000 de caixa), **todas** com `data_pagamento_entrada` (ou seja, todas já somando) e apenas **6** com contrato assinado registrado. Nas 244 vendas `origem='ghl'`, 3 estão sem assinatura.

Faltava só a visibilidade — entregue como card novo:

- **KPI "Sem contrato assinado"** ao lado de Faturamento Bruto / Caixa Recebido (`eb-dash2/src/pages/vendas/tabs/GeralTab.tsx`). Mostra o faturamento pendente, com subtítulo de quantas vendas e quanto de caixa, e o texto "já somam no faturamento" para não sugerir desconto. Clicável quando há pendência.
- **Critério (corrigido na mesma sessão):** venda com `data_pagamento_entrada` preenchida, **sem** `op_link_do_contrato_assinado`, **sem** `data_da_assinatura_do_contrato` **e** cuja oportunidade **não** está na etapa `Assinada` (`isVendaSemAssinatura` / `buildAssinadasPorEtapa` / `computePendentesAssinatura` em `useTrafego.ts`). Vale para **todas as origens**, não só omnx-desk.
  - **Por que a etapa entra no critério.** Os campos `op_link_do_contrato_assinado` e `data_da_assinatura_do_contrato` só são preenchidos pelo webhook do GHL (fluxo antigo do OpenClaw). A assinatura das vendas do omnx-desk chega por outro caminho: a `crm-marcar-assinada` move o card para **Vendas SQL / Assinada / won** e **não escreve nada em `vendas_fechamento`**. Olhando só para os campos, o card acusava como pendente venda já assinada — reportado pelo dono no caso **Augusto Kraemer** (assinado no Clicksign em 23/07/2026, card em "Assinada", campos nulos no CRM).
  - **Efeito da correção em produção:** de 16 vendas "pendentes" pelo critério errado para **7 vendas / R$ 202.463,42** pelo critério certo — dessas, 4 do omnx-desk (Nahuel e Thiago Derrico parados na etapa "Fechada"; Manoel e Gabrihel com o card no pipeline `[fn] evento`, nunca movido) e 3 antigas do GHL.
  - **Lacuna de dado que continua aberta** (não resolvida aqui): o CRM não guarda o link nem a data de assinatura das vendas do desk — só a posição do card. A fonte real está no omnx-desk (`contratos.link_clicksign` / `contratos.data_assinatura`, 302 contratos assinados). Fazer a ponte gravar esses dois campos em `vendas_fechamento` (+ backfill) é item separado, ainda pendente de decisão.
- **Modal com a lista** (`components/vendas/PendentesAssinaturaModal.tsx`): contratante, produto, data do pagamento, faturado, caixa e origem (`empiredesk` legado exibido como omnx-desk).
- **Respeita o modo ativo:** em Cohort usa `revenueRows` do `usePreVendas`; em Produtividade usa o universo do período do `useCloserProdutividade`, já filtrado pelas dimensões ativas (`pendentes` novo no retorno do hook).
- **Nada foi descontado.** Faturamento, caixa e contagem de vendas continuam exatamente como estavam — o card é aditivo e informativo.

Sem migration: as colunas de contrato já existiam em `vendas_fechamento`; só passaram a ser lidas pelos selects de receita.

## 2026-08-04 BRT — App Relatórios ocultado + Clara movida para Administração

O app **Relatórios** não entregava valor próprio — servia, na prática, só como casa da aba "Configurar Clara". Ele foi **ocultado** (não removido) e a configuração da Clara ganhou lugar próprio na Administração.

- **Flag nova `hidden` no catálogo de apps** (`eb-dash2/src/types/apps.ts`): app com `hidden: true` some do Hub de apps, da App Store (`/workspace/apps`), do onboarding de primeiro acesso e das telas de permissão (`/workspace/permissions`, detalhe de pessoa). A rota, as permissões e os dados continuam intactos — `/relatorios` segue acessível por URL direta, nada foi apagado no banco.
- **Nova página `/workspace/clara`** (`WorkspaceClaraPage.tsx`) — reaproveita o componente `ConfigurarClaraTab` sem duplicar código. Protegida por `AdminRoute` (só owner/admin), com item na barra lateral da Administração e card na seção Integrações.
- **Aba `?tab=clara` removida** de `RelatoriosPage` e da navegação; link antigo redireciona para `/workspace/clara`.

## 2026-08-04 BRT — Filtro "Tipo de tráfego" na aba Leads → Lista

A barra de filtros de Leads não permitia separar lead de tráfego pago de lead orgânico — só filtrar canal a canal, um por um. Agora existe o filtro **Tipo de tráfego** com quatro categorias, usando o mesmo critério canônico de Aquisição/Tráfego/Orgânico:

| Categoria | Critério (`contatos.utm_source`) | Volume em produção |
|---|---|---|
| Tráfego pago | código cadastrado em `utm_sources` | 10.638 contatos |
| Orgânico | código em `utm_sources_plain` (e não em `utm_sources`) | 7.007 contatos |
| Canal não cadastrado | tem código, mas fora das duas tabelas | 89 contatos |
| Sem origem | `utm_source` nulo ou vazio | 2.359 contatos |

Detalhes de implementação (`eb-dash2/src/hooks/useLeads.ts`):

- **Server-side**, como todos os outros filtros da aba — traduzido para uma cláusula PostgREST `.or(...)` sobre `contatos.utm_source`, então a paginação e o contador de 1.617 leads continuam corretos (filtro client-side quebraria os dois).
- A cláusula é sempre **positiva** (união dos tipos permitidos, via `resolveAllowedTrafficTypes`). Motivo: `not.in` avalia `NULL` como desconhecido e descartaria silenciosamente os leads sem origem ao usar o modo "excluir" do dropdown.
- `utm_sources` tem precedência sobre `utm_sources_plain` — código presente nas duas conta como pago, igual ao resto do sistema.
- Se o filtro não deixar nenhuma categoria selecionável (ex.: só "pago" marcado num workspace sem canal pago cadastrado), a query usa um valor sentinela e retorna **zero linhas** — em vez de sumir e mostrar todos os leads.
- Sintaxe da cláusula validada contra o PostgREST de produção (HTTP 200), incluindo o `and(...)` aninhado da categoria "Canal não cadastrado".

## 2026-08-04 BRT — Tenant de demonstração recalibrado (o demo demonstrava um negócio ruim)

Reportado como "vejo que lá ficou negativo". Procedia: o seed do tenant de demonstração produzia números que **a própria tela reprovava**.

**Diagnóstico.** Investimento de R$ 694.700 (R$ 480 mil de tráfego + R$ 214,7 mil de equipe orgânica) contra faturamento de R$ 1.030.700 e caixa de apenas R$ 474.200. Consequências visíveis:

- **ROAS Caixa abaixo de 1x** — 0,99x no ano e 0,77x nos últimos 30 dias. O card da aba Tráfego (`caixa ÷ spend`, `TrafegoTab.tsx:442`) informava, em números, que saiu mais dinheiro do que entrou.
- **Meses com ROI negativo** — ago/25 −71%, mar/26 −12%; jan, mai e jun entre +1% e +10%. Gráfico temporal serrilhado.
- **Taxa de recebimento de 46%** — passava impressão de inadimplência alta.
- **Linha do tempo parada em 29/07** — o seed rodou nessa data e o filtro padrão do dashboard é "últimos 30 dias" (`AquisicaoPage.tsx:117`), então os últimos 6 dias apareciam zerados e todo gráfico terminava despencando.

**Correção.** Não mexeu no investimento — é ele que produz o CPL e o CPMQL bonitos. Três alavancas: escada de ticket (R$ 12.900 / R$ 17.900 / R$ 24.900, mix 50/32/18 → ticket ~R$ 16.600), volume de vendas (80 → 136, curva mensal crescente de 6 a 16) e mix de pagamento (35% à vista / 40% em 10x / 25% em 12x → caixa ≈ 58% do faturado). Linha do tempo estendida até 04/08 clonando a janela 24–29/07 com deslocamento de +6 dias.

**Resultado:** ROAS 3,06x · ROI +206% · ROAS Caixa 2,58x · taxa de recebimento 58,3% · conversão lead→venda 1,53% · **todos os 13 meses positivos**, pior mês com ROI +102%. Na visão padrão (últimos 30 dias): ROAS 3,63x, ROI +263%, ROAS Caixa 3,80x, CPL R$ 55,22.

**Versionado** em `scripts/sql/seed-demo/80-resultado-financeiro.sql` (determinístico e idempotente) e `81-estender-linha-do-tempo.sql`, para que um teardown/reseed não volte aos números feios.

**Armadilhas respeitadas** (ver `docs/TENANT-DEMONSTRACAO.md` §8): toda oportunidade inserida com `data_lead_recebido` preenchida (senão `trigger_sync_opp_dates` chama a API do GHL do cliente real) e todo contato com `attribution_skip = true` (senão `trg_fn_enqueue_attribution_on_contact` faz o mesmo). Verificado após a carga: 0 jobs novos enfileirados a partir dos registros criados.

**Achado colateral não corrigido** — o cron `sync-contact-tags` enfileira jobs da API GHL para contatos do tenant de demonstração: **21.312 jobs, todos com status `dead`**, acumulando desde 29/07 a um ritmo de ~80 a cada 15 minutos. Não quebra o sync real (os jobs morrem), mas polui a fila e consome cota do rate limit compartilhado com o workspace do cliente. Registrado como pendência — a correção é a function pular workspaces de demonstração.

---

## 2026-08-03 BRT — Frontend lia dados sem filtrar workspace (59 pontos corrigidos)

Reportado como "no Orgânico não mostra o nome dos perfis". Não era nome faltando: eram **nomes de outro workspace**. O tenant de demonstração usa os mesmos códigos de canal do cliente real com significados diferentes — `iorg-1` é `@odavilouback` no cliente e "Instagram Orgânico" no demo; `iorg-3` é `@aceleradordeaudiencia` e "Indicação"; `iorg-5`, `iorg-2` idem. Só `@empirebusiness.br` (`iorg-9`) aparecia certo, por ser o único código que o demo não usa.

**Causa raiz.** Em `useOrganico.ts`, a consulta a `utm_sources_plain` era a única do bloco sem `.eq('workspace_id', wid)` — as outras seis ao lado tinham. Como o cadastro vira um `Map` por código, o nome do demo sobrescrevia o do cliente.

**Quem era afetado.** Apenas contas que enxergam 2+ workspaces — hoje só a conta dona da agência OMNX, que tem o tenant demo vinculado via `agency_workspaces`. As policies de RLS estão **corretas** (filtram por membership ou por agência); para os demais usuários do cliente nada vazou. Não houve exposição de dado de cliente.

**Varredura sistemática.** Script comparando as 104 tabelas com `workspace_id` contra todas as chamadas `.from(...).select(...)` do frontend, descartando as escopadas por chave (`.eq('id'|'contato_id'|'oportunidade_id'…)`, que a RLS já resolve): **62 leituras** sem filtro. Todas corrigidas menos 3 confirmadas inofensivas (2 escopadas por `auth_user_id`/`item_id`, 1 que virou o achado extra abaixo).

Distribuição do que estava exposto à mistura: `oportunidades` (19), `comunicacoes` (8), `vendas_fechamento` (7), cadastros UTM (17), `ghl_users` (6), `meta_ads_permalinks`/`notion_creatives`/`meta_ads_sync_log` (4). Os de `oportunidades`/`vendas_fechamento` eram mais graves que o rótulo do gráfico: **somavam leads e faturamento do demo** aos números reais de quem tem os dois acessos.

**Achado extra.** `AdminUsersPage` criava usuário em `ghl_users` **sem `workspace_id`** — corrigido no mesmo PR.

**Por que importa além do sintoma:** hoje o "outro workspace" é um tenant de demonstração; no primeiro cliente adicional, a mesma falha vira mistura de dados entre clientes pagos.

**Validação:** `npx tsc --noEmit` limpo e `npx vite build` exit 0. Re-varredura do script: de 62 para 0 pontos reais.

## 2026-08-03 BRT — Webhook com UTM vazia apagava a atribuição do lead (fix + backfill em produção)

Reportado pelo gestor de tráfego: campanha **Código da Audiência** (`CA_AGO26_CAPTACAO_LEAD_QUENTE` → `utm_campaign 58`, `PG58`) marcava **62 leads no gerenciador do Meta** e **26 na dash** entre 30/07 e 02/08.

**Causa raiz.** Os leads chegavam normalmente — o que se perdia era a origem. O GHL dispara webhooks de atualização do mesmo contato minutos depois da criação, e neles os campos `utm_*` vêm como **string vazia**. Tanto `extrair_dados_ghl()` quanto `extrair_dados_ghl_v2()` gravam `utm_source = COALESCE(NULLIF(TRIM(payload->>'utm_source'),''), NULLIF(TRIM(lastAttributionSource->>'utmSource'),''))` — **sem fallback para o valor já gravado**. Webhook sem UTM → `NULL` → atribuição correta apagada. Prova no contato `E0aRiR1ss9TCUcX38GJm`: `10:19:39 iads-25/58` → `10:19:46 iads-25/58` → `10:29:43 vazio/vazio`.

A regra 4 do `CLAUDE.md` ("webhook é a fonte de verdade, nunca `COALESCE(c.utm_source, ...)`") está certa quanto à re-atribuição, mas não distinguia "webhook trouxe origem nova" de "webhook não trouxe origem nenhuma". A ordem correta é `COALESCE(valor_novo_não_vazio, valor_antigo)` — a regra foi corrigida no `CLAUDE.md`.

**Correção — trigger, não edição da função.** `extrair_dados_ghl` tem ~30 KB em produção e **já divergiu do arquivo versionado**; reescrevê-la inteira para corrigir 5 atribuições arriscaria todo o caminho de ingestão. A migration `20261012000000` cria `preservar_atribuicao_contato()` + trigger `BEFORE UPDATE` em `contatos`, que é aditivo, cobre **qualquer** caminho de escrita (v1, v2, cron, edge function, backfill) e é revertido com um `DROP TRIGGER`. Protege 21 colunas de atribuição (`utm_*`, `tt_*`, `ad_id`, `ad_name`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `referrer`, `url`).

**Validado em produção nos dois sentidos**, com contato real e valor restaurado ao fim: `SET utm_source=''` → preservado ✅; `SET utm_source='TESTE-REATRIBUICAO'` → sobrescrito ✅ (re-atribuição continua viva).

**Backfill** a partir de `webhooks_ghl` (payload imutável), rodado **depois** do guard ativo. Impacto na janela 29/07–03/08: 34 leads pagos (`iads-25`), 13 `import-23`, 12 orgânicos (`iorg-3`), 6 demais. Resultado dia a dia da campanha 58, dash × Meta: 30/07 `5×3`, 31/07 `21×23`, 01/08 `27×29`, 02/08 `7×7`, 03/08 `10×8` — diferença residual esperada (fuso do Meta × BRT e janela de atribuição). Total do período: **60 na dash × 62 no Meta**, contra 26 antes.

Os ~1.100 contatos históricos que seguem sem UTM foram conferidos: não têm origem em webhook nenhum (tráfego direto/importado real), então permanecem `NULL` corretamente.

Detalhamento completo em [`docs/BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md`](BUG-FIX-UTM-APAGADA-POR-WEBHOOK-VAZIO.md).

## 2026-07-31 BRT — "Performance por Origem" vira linha temporal + detalhamento de mídia

O bloco de destaque da aba Aquisição deixou de ser um gráfico de barras (uma barra por origem, sem noção de tempo) e passou a ser um **gráfico de múltiplas linhas com evolução dia a dia**, no mesmo padrão visual do gráfico de alcance do Instagram: curva suave, eixo X no formato `1 de jul`, grid horizontal enxuto (3 marcas) e sem eixo Y desenhado.

**Componente novo `OriginTrendChart`** (`eb-dash2/src/components/dashboard/OriginTrendChart.tsx`):
- uma linha por origem (orgânicas por canal, pago agrupado em "Tráfego Pago");
- hover em qualquer dia mostra tooltip com **todas as origens daquele dia** ordenadas por valor, mais o total do dia;
- legenda no rodapé com o **total de cada origem no período**; clique oculta/mostra a linha, duplo clique isola, botão "Ver todas" reseta;
- card mostra o **total do período** da métrica ativa (e avisa quando há origem oculta);
- clique num ponto abre o `LeadListModal` com os leads daquela origem naquele dia;
- mantém o seletor de métrica já existente (Nº Vendas / Faturamento / Caixa / MQLs / Reuniões).

**Componente novo `MediaBreakdownCard`** — logo abaixo do gráfico, responde "quantos vieram da bio, do direct, dos stories". Lê `contatos.utm_medium` (com nome amigável via `mediumNameMap`), lista barras horizontais com valor, % do total e clique para ver os leads, e tem seletor de origem ("Todas as origens" ou uma origem específica).

**Data de cada ponto = data do próprio evento**, respeitando as regras de negócio já vigentes: MQL por `data_lead_recebido`, reunião por `data_realizacao_vendas`, venda/faturamento/caixa por `data_pagamento_entrada` (nunca `data_fechado`). O eixo cobre o período filtrado e se estende quando o evento cai fora dele — em Cohort a venda costuma acontecer depois da janela de geração do lead, e ela não pode sumir do gráfico.

Os agregados `mqlsByOrigin`/`reunioesByOrigin`/`salesByOrigin`, antes consumidos só pelas barras, viraram três donuts "por origem" na seção Segmentação — que já se descrevia como "funil, campanha, origem e mídia" mas não tinha a coluna de origem. `PerformanceOriginChart` continua no repositório e exportado, agora sem consumidor.

**Quatro correções feitas depois de olhar o gráfico rodando** (tenant de demonstração, julho/2026, 227 MQLs em 7 origens):
1. **Curva inventava picos.** A suavização Catmull-Rom criava ondas entre pontos — com valores de 0 a 2 por dia, o gráfico mostrava subidas e descidas que não existem no dado. Trocada por interpolação **monotônica (Fritsch–Carlson)**, que arredonda o traçado mas nunca ultrapassa os valores reais.
2. **Cores repetidas.** `getLabelColor` sorteia entre `--chart-1..8` pelo hash do texto, e essa paleta tem tons duplicados (`chart-1 = chart-2`, `chart-4 = chart-5`) e é quase toda roxa: várias origens saíam com o mesmo roxo. Criada a paleta **`--series-1..8`** (oito matizes distintas, versão clara e escura) e a função `getChartColorByIndex`, que dá cor pela **posição** na ordenação. Vale para o gráfico e para as barras do detalhamento de mídia.
3. **Serrote ilegível em período longo.** Botão **Por dia / Por semana**, com semana como padrão acima de 45 dias.
4. **Armadilha do balde parcial.** Agrupando por semana, a última semana costuma ter menos de 7 dias e a linha "despenca" — parecia queda de performance. Agora há aviso no rodapé e marcação `parcial (N dias)` no tooltip.

Também: passar o mouse numa origem da legenda **destaca a linha dela** e esmaece as outras.

**Validação:** `npx vite build` exit 0, `npx tsc --noEmit` limpo e verificação visual no navegador (tenant de demonstração) nos modos claro e escuro, por dia e por semana.

## 2026-07-31 BRT — Régua de período passa a ser a data do lead (fatia 2 de 2)

Causa raiz da divergência relatada (leads da tag `[cp] codigo-audiencia-08-26` não batendo com o CRM). O filtro de período no cliente usava a data de criação do **contato** (`contatos.date_created`); passou a usar a data do **lead** (`oportunidades.data_lead_recebido`), com fallback para `date_created` quando ela estiver nula (lead cujo `sync-opp-dates` ainda não rodou).

`filterByContactDate` foi renomeada para `filterByLeadDate` (`eb-dash2/src/hooks/useTrafego.ts`) e os quatro consumidores acompanham: Tráfego, Aquisição, Orgânico e Pré-Vendas. O fetch no servidor desses hooks **já** recortava por `data_lead_recebido` — era o filtro no cliente que descartava parte do resultado depois.

**Por que estava errado:** a régua antiga era deliberada (manter lead reciclado no mês em que entrou originalmente), mas escondia campanha. Quando uma campanha pega base antiga, o contato "nasceu" fora do período e o lead novo sumia. Na campanha relatada eram 48 pessoas no CRM contra 21 no dash de julho — as 27 restantes eram contatos antigos que geraram oportunidade nova no mês. `data_lead_recebido` também é a data canônica do lead segundo `docs/CONCEITOS-NEGOCIO.md` (COHORT filtra por ela): o código é que divergia da regra.

**Impacto medido antes de aplicar** (workspace do cliente, oportunidades por mês — régua antiga → nova): fev 1.420 → 1.197; mar 792 → 1.102; abr 1.231 → 1.570; mai 1.453 → 1.512; jun 665 → 821; **jul 1.095 → 1.612**. Os números históricos dos painéis mudam, e o time precisa ser avisado. **Decisão do dono em 2026-07-31: alcance global**, com as duas outras opções (só sob filtro `[cp]`, ou não mexer) apresentadas e recusadas.

**Alarme para não repetir:** RPC `listar_campanhas_cp_orfas(p_workspace_id)` (migration `20261011000001`) lista as tags `[cp]` do workspace sem campanha cadastrada. Ela alimenta um aviso novo em Traqueamento → Cods UTM → UTM Campaign, com botão "Cadastrar" por tag — o time resolve na tela, sem migration. `SECURITY DEFINER` com `is_workspace_member` e `EXECUTE` revogado de `anon`/`PUBLIC` (padrão de `docs/VARREDURA-CROSS-TENANT-COMPLETA.md`). Falha da RPC não derruba a tela: o aviso simplesmente não aparece.

**Três achados da validação pós-mudança** (todos corrigidos no commit seguinte): (1) `loadPreVendasDataset` — que alimenta a aba SDRs — e o segundo fetch de `usePreVendas` tinham filtro inline próprio por `date_created`, fora da função renomeada, e teriam ficado com a régua antiga, divergindo das outras abas; esse filtro ainda comparava datas como **texto ISO com offsets diferentes** (`+00:00` contra `-03:00`), errando nas bordas do período, e descartava lead sem `date_created` em vez de manter. (2) `useCohort`/`useVendasCohort` agrupavam por `date_created` com fallback para `data_lead_recebido` — precedência invertida, senão um lead filtrado como julho cairia na linha de cohort de outro mês. (3) `endISO` ficou órfão em `usePreVendas`, e o `tsc -b` que roda antes do `vite build` **quebraria o deploy na Vercel** (mesma classe do TS2589 de 2026-07-30).

**Conservação verificada no banco:** das 11.796 oportunidades do workspace, 11.796 têm régua nova contra 11.782 na antiga — **nenhum lead fica sem data de referência**, e as 14 que a régua antiga descartava passam a ser contadas. O efeito é redistribuição entre meses, não perda: julho ganha 519 e não perde nenhum; meses passados trocam leads entre si (jan −434/+193, fev −290/+67, abr −264/+603), porque lead reciclado migra para o mês da oportunidade nova.

**Validação:** `npx vitest run test/useTrafego-useCohort.test.ts` → 70/70, incluindo dois testes de regressão novos (lead novo de contato antigo entra no período; lead antigo de contato novo não entra) e o do fallback. `npx vite build` exit 0. RPC testada em produção dentro de `BEGIN … ROLLBACK`.

**NÃO entregue (decisão de escopo):** exibir "pessoas únicas" ao lado de "leads" nos KPIs. O CRM conta pessoas e o dash conta oportunidades (48 pessoas = 122 oportunidades), então a conferência manual continua exigindo essa tradução mental. Ficou de fora por tocar em card de quatro módulos, o que inchava um PR que já muda semântica de data.

## 2026-07-31 BRT — Campanhas `[cp]` invisíveis no dashboard (fatia 1 de 2)

Relato do dono: os leads com a tag `[cp] codigo-audiencia-08-26` no CRM não batiam com o número do dashboard. A investigação no banco de produção achou **três mecanismos distintos** de divergência — este commit fecha o primeiro; a causa raiz fica para a fatia 2.

**Como campanha `[cp]` funciona:** ela é rastreada por TAG no contato, e o filtro casa o nome cadastrado em `utm_campaigns` com a tag, comparando o texto inteiro (`matchesCampaign`, `eb-dash2/src/hooks/useAquisicao.ts`). É case-insensitive, mas **sensível a espaço e acento**. Tag sem campanha cadastrada — ou cadastrada com grafia diferente — some do filtro sem erro e sem aviso.

**Achados medidos (2026-07-31), por workspace:**

| Workspace | Tag no CRM | Contatos | Situação |
|---|---|---|---|
| Default (cliente) | `[cp] 150 ht` | 66 | cadastrada como `[cp] 150ht` — falta o espaço |
| Default (cliente) | `[cp] webinario thiago reis` | 2 | cadastrada como `[cp] webinário thiago reis` — acento |
| Acme Demo | `[cp] aplicação` | 3.042 | não cadastrada |
| Acme Demo | `[cp] desafio` | 1.519 | não cadastrada |
| Acme Demo | `[cp] lançamento` | 723 | não cadastrada |
| Acme Demo | `[cp] indicação` | 657 | não cadastrada |
| Acme Demo | `[cp] masterclass` | 620 | não cadastrada |

Fora do escopo: `[cp] evento-growth-mai-cami_disparo_respondeu` (8 contatos) é tag de automação de disparo, não campanha de página — fica abaixo do corte de 50 contatos.

**Correção:** migration `20261011000000_fix_campanhas_cp_invisiveis.sql`, idempotente e escopada por workspace. Corrige os dois nomes divergentes (só renomeia se nenhum contato usar a grafia antiga, para o rename nunca cegar lead que hoje aparece) e cadastra as tags `[cp]` com ≥ 50 contatos que não têm campanha. Sem DDL, sem tocar em `contatos`/`oportunidades`/métricas.

**Validação:** rodada em produção dentro de `BEGIN … ROLLBACK` — 5 campanhas criadas no demo, 2 renomes no Default, e execução dupla mantendo 61 campanhas `[cp]` (baseline 56), provando idempotência. Nada foi persistido.

**Ainda NÃO resolvido (fatia 2):** o painel filtra o período pela data de criação do *contato* (`filterByContactDate`, `eb-dash2/src/hooks/useTrafego.ts:330`), não pela data do lead. Na campanha `codigo-audiencia-08-26` isso é o que faz 48 pessoas no CRM virarem 21 no dash de julho — 27 são contatos antigos que entraram na campanha agora. Somado a isso, o CRM conta pessoas e o dash conta oportunidades (48 pessoas = 122 oportunidades).

## 2026-07-30 BRT — Login: botão de mostrar/ocultar senha

Pedido do dono depois de errar a senha na tela de login sem conseguir conferir o que digitou. `eb-dash2/src/pages/LoginPage.tsx` ganhou um botão dentro do campo de senha que alterna `type="password"` / `type="text"`, com ícone `Eye`/`EyeOff`.

Acabamento: `tabIndex={-1}` para não entrar na ordem de tabulação entre e-mail → senha → Entrar, `aria-label`/`aria-pressed` para leitor de tela, e `pr-11` no input para o texto não correr por baixo do ícone. O estado é local e volta a oculto a cada carregamento da página. Validado com `vite build` (exit 0).

Registro operacional da mesma sessão (sem código, feito direto em produção): criada a conta `gildasio@aliancadealtovalor.com.br` como `owner` do workspace "Default" — ela **não existia**, e era essa a causa real do "Email ou senha incorretos" (não senha errada). Seguido o padrão de `scripts/sql/seed-demo/00-provisionamento.sql`, incluindo os tokens como string vazia em vez de `NULL`, senão o GoTrue responde 500 com a mensagem enganosa "Database error querying schema". Confirmado que `owner` não depende de linhas em `dashboard_user_permissions` — o owner pré-existente também tem zero.

## 2026-07-30 BRT — Build da Vercel quebrado: TS2589 na tela de Inscrições

Deploy do commit `1b6dcd2` falhou com um único erro, no `tsc -b` que roda antes do `vite build`:

```
src/pages/inscricoes/InscricoesPage.tsx(229,35):
error TS2589: Type instantiation is excessively deep and possibly infinite.
```

**Causa raiz:** `applyLocalFilters` era genérica com auto-referência — `<T extends { or: (f) => T; gte: ...; eq: ... }>(query: T): T`. Como o tipo do `PostgrestFilterBuilder` já se re-deriva a cada método encadeado, exigir que entrada e saída fossem *exatamente o mesmo* `T` fez o compilador desenrolar a cadeia até estourar o limite interno de instanciação. É um erro latente por natureza: depende do tamanho total inferido, então passa em várias builds até o dia em que não passa.

**Correção:** trocado o genérico por um contrato explícito e enxuto, `LocalQuery`, com apenas os métodos que a tela usa (`or`, `gte`, `lte`, `eq`, `order`, `range`), mais o helper `localSubmissionsQuery()`. **Zero mudança de runtime** — mesma query, mesmos filtros, mesma paginação e exportação; só a descrição de tipos. Dois casts `as Submission[]` ficaram desnecessários e foram removidos.

Validado com `npx tsc -b --force` (exit 0, projeto inteiro) e `npx vite build` (exit 0). Arquivo: `eb-dash2/src/pages/inscricoes/InscricoesPage.tsx`.

Ficaram **em aberto** (apareceram no mesmo log, não são o que quebrou o deploy): `npm audit` reporta 8 vulnerabilidades de severidade alta, e o bundle está em 2.004 kB (507 kB gzip) sem code-splitting.

## 2026-07-29 BRT — Tenant de demonstração "Acme Educação (Demo)" com 12 meses de dados fictícios

Pedido do dono: "crie um tenant do dashboard com 100% de dados fictícios para podermos demonstrar o uso do dash na prática" — decisões dele: workspace novo dentro da instância de produção atual, 12 meses / ~8.000 leads, empresa fictícia genérica, e depois "criar funis variados, tags variadas, no-show e essas coisas, criar um ambiente real mesmo".

**Entregue** — workspace `Acme Educação (Demo)` (`d0000000-0000-4000-8000-000000000001`), login `demo@omnx.app`, vinculado à agência OMNX. Base: **8.200 contatos**, **8.767 oportunidades** (12 pipelines, incluindo 567 de Recuperação), **80 vendas** (R$ 1.030.700 faturado, ticket médio R$ 13 mil), **46.877 comunicações**, **683 reuniões**, **420 tasks**, R$ 480 mil de investimento Meta Ads, 24 criativos `CR-101`…`CR-124` com 19 testes, 7 disparos, 102 snapshots semanais, metas por workspace/pré-vendedor/closer/canal. 9 funis, 12 campanhas, 6 canais pagos + 5 orgânicos, 77 tags distintas. Funil coerente ponta a ponta: 8.200 leads → 3.178 MQL → 2.475 conectados → 607 agendados → 390 realizados → 123 no-shows → 75 vendas; **CPMQL R$ 235,87**, **CPL R$ 90,60**, **ROAS ~2,1**. Pré-vendedores e closers com desempenho deliberadamente diferente entre si, para os leaderboards mostrarem variação real.

**Três armadilhas de trigger identificadas e neutralizadas** (o risco real de plantar dado fictício no banco de produção era disparar chamadas à API do GHL **do cliente**, poluindo a fila compartilhada `ghl_api_jobs` e queimando rate limit):
1. `trg_attribution_on_contact` — enfileira busca de atribuição no GHL para contato de form do Facebook sem UTM → contornado com `attribution_skip = true` em todo contato fictício.
2. `tr_sync_opp_dates_on_insert` — busca datas no GHL quando a oportunidade entra sem `data_lead_recebido` → a coluna é sempre preenchida.
3. `auto_tag_conectado_on_inbound` — envia PUT de tag ao GHL a cada mensagem inbound → mensagens inbound só são geradas para contatos que **já** têm a tag `conectado`, condição em que o trigger sai antes de enfileirar.
**Medido depois do seed:** `0` jobs em `ghl_api_jobs` originados do workspace de demo e `0` oportunidades fictícias que os crons de sync pegariam.

**Isolamento validado nos dois sentidos** simulando o JWT direto no banco: `demo@omnx.app` enxerga 8.200 contatos (100% do demo), 1 workspace e **zero linha do workspace real**. O owner do workspace real enxerga também o demo — não por falha, mas porque é owner da agência OMNX e a RLS aditiva de agência é assim por projeto; os painéis filtram por `workspace_id` selecionado, então não há mistura de número em tela.

Também descoberto e contornado: `vendas_fechamento.valor_faturado` é **coluna gerada** (entrada + parcelas × valor da parcela), não aceita insert direto.

Seed versionado e idempotente em `scripts/sql/seed-demo/` (6 arquivos, ordem numerada, variação por hash determinístico em vez de `random()`, teardown com trava de confirmação por nome via `purge_workspace_data`). Documentação completa em [`docs/TENANT-DEMONSTRACAO.md`](TENANT-DEMONSTRACAO.md).

### Bug P1 encontrado de quebra e corrigido: Dashboard de Criativos com throughput sempre zerado

Ao popular o sub-app Criativos, o Dashboard apareceu com yield rate 0%, "validados/semana" 0 e throughputs diário e semanal zerados — apesar de existirem 19 testes com resultado decidido.

**Causa raiz:** `eb-dash2/src/hooks/useCreativeDashboard.ts` comparava `creative_tests.result` com valores **em inglês** (`approved|scale|rejected|kill`), mas o CHECK do banco (`creative_tests_result_check`) só aceita **português** (`aprovado|reprovado|cancelado|pendente`) — e é o que `useCreativeTests.ts` grava. Nenhum valor casava nunca, então `isValidResult`/`isApprovedResult` retornavam `false` para 100% das linhas.

**Não era bug só do demo:** afetava qualquer workspace. Passou despercebido porque, até esta data, o workspace real tinha apenas 2 registros em `creative_tests`, ambos com `result` NULL — ou seja, nunca houve teste decidido em produção para expor a falha.

**Correção:** as duas funções passaram a comparar com os valores em português. `cancelado` e `pendente` ficaram **fora** do `isValidResult` de propósito: não são decisão de mérito, então não entram no denominador da taxa de aproveitamento. Validado com `vite build` limpo.

## 2026-07-27 BRT — Correção do ícone da marca (aba do navegador e app instalado)

Relato do dono: "a logo bugou mesmo" (sem lembrar onde). Auditoria descartou as logos dentro da página — `omnx-fundo-claro.png`, `omnx-fundo-escuro.png` e `favicon-omnx.png` existem em `eb-dash2/public/`, estão versionados e respondem HTTP 200 em produção com o mesmo tamanho dos arquivos locais. Os defeitos reais estavam no **ícone**:

1. **`index.html` não declarava ícone.** O favicon só era injetado por JS em `src/main.tsx`, depois do app carregar. Até lá o navegador pede `/favicon.ico` — que em produção responde **200 `text/html`** (fallback de SPA da Vercel devolvendo o próprio `index.html`), então o navegador descarta e mostra ícone genérico/quebrado. Corrigido com `<link rel="icon">` + `<link rel="apple-touch-icon">` apontando para `/favicon-omnx.png` direto no HTML. A injeção via JS foi mantida (agora ela reaproveita a tag existente, sem criar outra).
2. **`manifest.webmanifest` sem o campo `icons`.** PWA/atalho instalado ficava sem logo. Adicionado o PNG 512×512 com `purpose: "any"`.

Validado com `vite build` (tags presentes em `dist/index.html`, manifesto com ícones em `dist/`) e `vitest run test/brand-identity.test.ts` verde.

## 2026-07-27 BRT — Leads → Inscrições de integrações: exportação CSV + filtros organizados

Pedido do dono: "permitir exportar esses contatos aqui e arrumar os filtros pra ficarem mais organizados".

- **Novo utilitário `eb-dash2/src/lib/utils/csv.ts`** — primeiro export de CSV do projeto (antes só existia geração de PDF via `window.print()`). `buildCsv`/`downloadCsv` com separador `;` e BOM UTF-8 (Excel pt-BR abre direto, com acentos), escape de aspas e proteção contra CSV injection (valores iniciados por `=`, `+`, `-`, `@` recebem prefixo `'`).
- **Botão "Exportar CSV"** na aba (`eb-dash2/src/pages/inscricoes/InscricoesPage.tsx`): exporta **todas** as linhas que batem com os filtros ativos, não apenas a página visível de 50. Nova função `fetchAllFiltered` pagina de verdade — chunks de 1.000 no caminho do workspace default (respeitando o `max_rows = 1000` do PostgREST, que o antigo `.range(0, 1999)` da tela não respeita) e chunks de 500 no proxy `external-form-submissions` das subcontas. 17 colunas: data, nome, email, WhatsApp, canal/campanha/mídia com nome amigável **e** o código UTM cru, termo, conteúdo, endpoint, status, página, ID do contato no CRM e último erro.
- **Filtros reorganizados**: os 6 selects que apareciam empilhados mostrando só "all" agora ficam em grade responsiva (2/3/6 colunas) com rótulo visível acima de cada um (Status, Endpoint, Canal, Campanha, Mídia, Termo) e o estado vazio escrito como "Todos". A primeira linha passou a agrupar Buscar + Período (rotulados) à esquerda e, à direita, o chip de filtros ativos, "Limpar filtros", o contador de inscrições e o botão de exportar.
- Refatoração de apoio: filtros da query local extraídos para `applyLocalFilters` (reusados por tela e exportação, sem duplicar lógica) e dedupe de inscrições extraído para a função `dedupe`. `tsc --noEmit` e `eslint` limpos.

## 2026-07-24 BRT — Pré-Vendas: aba "Visão Geral" (resumo sem R$) + aplicação em produção das migrations de Instagram/conectado

Pedido do dono por vídeo (transcrito por IA): "mexer somente na área de pré-vendas; preciso de um resumo do que está acontecendo, uma visão geral igual ao Funil de Conversão, só que **sem falar de valor**: quantos leads, MQLs, não-MQLs, agendados, não-agendados, reuniões realizadas, no-show, conectados e não-conectados. E, ao abrir o lead na lista, quero ver o SDR e o @ do Instagram — vou montar uma planilha e abordar essas pessoas também no Instagram."

**Frontend — nova aba `Visão Geral` em Pré-Vendas (`pre_vendas.geral`):**
- Novo `eb-dash2/src/pages/prevendas/tabs/VisaoGeralTab.tsx` — resumo operacional **sem nenhum valor monetário**: Funil de Conversão (Leads → MQLs → Agendados → Reuniões → Fechados, contadores puros via `FunnelViz` sem `cost`), + blocos Classificação (MQLs / Não MQLs), Agendamento (Agendados / Não agendados) e Reunião & Contato (Reuniões realizadas / No-shows / Conectados / Não conectados / Fechados). Todos os números são clicáveis e abrem o `LeadListModal` (com colunas Pré-vendedor e @ Instagram).
- Ligada como **primeira aba** em `PreVendasPage.tsx` (`TABS`), casando com a chave `pre_vendas.geral` que já existia no catálogo de permissões (`types/users.ts`) mas não tinha componente. Definições reusadas do `AquisicaoTab`: Não conectados = `!data_conectado`, No-shows = `!!data_no_show`, MQL via `isMqlByTag`, Fechados via `buildPaymentDateMap` (pagamento de entrada, não `data_fechado`).
- Validado ao vivo (dev server + navegador, workspace Default real, 30d): Leads 940 = MQLs 208 + Não MQLs 732 = Conectados 430 + Não conectados 510; modal confirma colunas Nome/Email/Instagram/Pré-vendedor/Fonte/Status com @handles e SDRs reais. `tsc -b` e `vite build` limpos.

**Banco — 2 migrations da manhã aplicadas em produção** (estavam escritas no commit `b338aa2`, marcadas "aplicar em janela de baixa carga"; aplicadas nesta sessão com aprovação do dono):
- `20261010000000_marcar_conectado_ao_perder.sql` — trigger `BEFORE` + backfill: toda oportunidade `lost` sem `data_conectado` recebe `data_conectado = COALESCE(data_perdido, data_ultima_atividade, hoje)` (SDRs conversam via WhatsApp externo, o GHL não registra a conexão). Backfill preencheu **1.556** oportunidades perdidas históricas. Nunca sobrescreve valor existente.
- `20261010000001_capturar_instagram_do_webhook.sql` — trigger `AFTER INSERT` em `webhooks_ghl` (guard `WHEN payload ? 'Qual é o seu @ do instagram?'`) grava `contatos.print_instagram` por `ghl_id`, latest-wins. **Backfill histórico executado** dirigindo por `contatos` (subquery via índice `idx_webhooks_ghl_contact_id_created`, evitando o seq scan de 307k webhooks que estourava o `statement_timeout`): **7.594 de 11.486** contatos (66%) agora têm @ preenchido.

Nenhuma migration nova nesta sessão (só aplicação das já versionadas). Arquivos de código tocados: `eb-dash2/src/pages/prevendas/tabs/VisaoGeralTab.tsx` (novo), `eb-dash2/src/pages/prevendas/PreVendasPage.tsx`.

## 2026-07-23 BRT — Hardening pré-push: job semanal privilegiado + dependência vulnerável

- Nova migration `20261009000004_harden_weekly_current_cohort_job.sql`, aplicada em produção: o job interno `weekly_reports_current_week_cohort_job()` passa a usar `search_path = pg_catalog`, referências qualificadas e `EXECUTE` restrito a `service_role`; chamadas por `PUBLIC`, `anon` e `authenticated` são negadas. Re-teste remoto confirmou os três grants.
- `brace-expansion` é fixado em `1.1.16` via `overrides` para eliminar a CVE-2026-13149, vulnerabilidade de DoS transitiva de `eslint → minimatch`.

## 2026-07-21 BRT — Tela de vigilância do contrato de webhook + correção de 2 documentos com status desatualizado

Pedido do dono: "a documentação/regra de webhook foi feita? Tem regra pra como os dados devem chegar? Isso está claro pro usuário?". Auditoria confirmou que a regra em si (`docs/CONTRATO-WEBHOOK-CRM.md`, `docs/CONFIG-OMNX-DESK-USUARIO.md`) está completa e didática, mas achou 3 problemas reais:

1. **Gap real corrigido — vigilância do contrato de webhook sem tela.** A tabela `webhook_contract_mismatches` e a RPC `count_contract_mismatches_pending` (migration `20261006000002`) gravavam desvios de formato em produção desde 2026-07-19, mas nenhum componente do frontend lia essa tabela — só era visível via SQL direto. Criado `eb-dash2/src/hooks/useWebhookContractMismatches.ts` (mesmo padrão de `useGhlMappingAlerts.ts`: query dos pendentes + mutation de reconhecimento, tratando tabela ausente como "sem desvios" em vez de erro) e o componente `WebhookContractMismatchesBanner` em `WorkspaceGhlConfigPage.tsx`, exibido no topo de **Configuração → Integração CRM OMNX** para owner/admin, junto do banner já existente de `GhlMappingAlertsBanner`. Lista até 8 desvios recentes (identificador faltando, campos `customData` desconhecidos, location, data), com "Reconhecer" por item e "Reconhecer todos". Zero mismatches em produção até agora — não é bug, é o resultado esperado sem contas configuradas fora do contrato.
2. **Achado real — `docs/GHL-MAPEAMENTO-VIGILANCIA.md` dizia "não aplicado em produção", mas estava rodando havia dias.** Confirmado via API de Management do Supabase: migration `20260819000000` aplicada (Local = Remote), crons `ghl-mapping-discovery-watch` (jobid 90) e `ghl-mapping-detect-changes` (jobid 91) ativos e com execuções `succeeded` todo dia desde pelo menos 2026-07-17, `ghl_discovery_runs` com registros reais gravados pelo cron, e o hook/banner do frontend (`useGhlMappingAlerts.ts`, `GhlMappingAlertsBanner`) já existiam e já estavam corretamente wireados. Nada de código faltava — só a documentação (`docs/GHL-MAPEAMENTO-VIGILANCIA.md` e a linha correspondente em `CLAUDE.md`) estava desatualizada. Corrigido.
3. **Achado real — `docs/ROADMAP.md` dizia "PR aberto, aguardando merge" para o contrato de webhook**, mas o PR #52 já tinha sido mergeado em 2026-07-19 (confirmado via `gh pr view 52`). Corrigido.
4. **Follow-up na mesma sessão — pergunta do dono "onde eu vejo, na tela, a documentação do webhook?"** Resposta honesta: em lugar nenhum — `docs/CONTRATO-WEBHOOK-CRM.md` e `docs/CONFIG-OMNX-DESK-USUARIO.md` só existiam como arquivo no repositório, sem visualizador dentro do painel. Criado `eb-dash2/src/lib/docs-markdown.ts` (renderizador de markdown sem dependência externa, mais completo que o do chat: cobre blockquote, link, `<details>/<summary>` e linha horizontal, que os docs usam) e `eb-dash2/src/components/ghl-mapping/WebhookContractDocsTab.tsx`, que importa os 2 `.md` via `?raw` do Vite (conteúdo sempre igual ao arquivo-fonte) e renderiza numa nova aba **Documentação** em Configuração → Integração CRM OMNX, visível mesmo antes de conectar o GHL. Testado ao vivo no navegador contra o workspace Default real (dev server local): título, blockquote, tabelas, bloco de código JSON e `<details>` da Anexo A renderizam corretamente nas duas sub-abas.

**Por que isso importava:** as duas seções incorretas (#2 e #3) fariam qualquer IA ou humano futuro perder tempo reimplementando ou re-mergeando algo que já estava pronto e rodando — exatamente o tipo de erro que a auto-memória e o handoff deste projeto existem para evitar. Nenhuma migration nova nesta sessão — só o componente de frontend novo (deploy Vercel via push do branch) e correções de documentação.

Arquivos tocados: `eb-dash2/src/hooks/useWebhookContractMismatches.ts` (novo), `eb-dash2/src/lib/docs-markdown.ts` (novo), `eb-dash2/src/components/ghl-mapping/WebhookContractDocsTab.tsx` (novo), `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx`, `eb-dash2/src/index.css`, `docs/CONTRATO-WEBHOOK-CRM.md`, `docs/GHL-MAPEAMENTO-VIGILANCIA.md`, `docs/ROADMAP.md`, `CLAUDE.md`.

> Nota: o fix do e-mail diário da Clara (branch separado `fix/clara-email-report-truncation`,
> PR #57, ainda sem merge) tem sua própria entrada de changelog nesse branch — não duplicada
> aqui para não gerar conflito quando os dois PRs forem mergeados.

## 2026-07-20 BRT — Investimento Meta Ads: isolamento por workspace + filtro por campanha + cura de dados (commit autorizado pelo dono)

Trabalho de duas sessões (19–20/07), commitado junto porque toca os mesmos 5 hooks:

1. **Vazamento entre workspaces (sessão 20/07):** o card Investimento (Painel Cohort, Aquisição, Pré-Vendas) somava o spend de TODOS os workspaces do usuário — as queries de `meta_ads_insights`/`meta_ads_account_daily` nunca filtravam `workspace_id`, confiando só no RLS por membership. Sintoma: Burn-in Interno mostrava R$ 38.490,93 que são do Default. Fix: `.eq('workspace_id', wid)` em 13 queries (`useTrafego` ×5, `usePreVendas` ×4, `useAquisicao` ×2, `useCreativeRankingData`, `useCriativosFilters`). Confirmado no banco: Burn-in tem 0 linhas de spend; 0 linhas legadas com `workspace_id` NULL. Diagnóstico read-only em `scripts/check-meta-ads-workspace-spend.mjs`; validação Playwright em `eb-dash2/tests/fix-workspace-investimento.spec.ts`.
2. **Investimento por campanha batendo com o Gerenciador (sessão 19/07):** `useAquisicao` passou a filtrar o spend por campanha (`[cp]` casa por `page_code` no `ad_name` via novo `campaignPageCodeMap`); curada a corrupção de 30/06–06/07 em `meta_ads_insights` (migration `20261007000000`, já aplicada — 7 raws do cron 7-dias gravavam soma de 7 dias num dia só) com blindagem permanente (`processar_meta_ads_raw*` pula linhas agregadas `date_stop != date_start`); reprocessamento das semanas afetadas enfileirado (migration `20261007000001`, já aplicada); desempate `.order('ad_id')` na paginação de `meta_ads_insights` em todos os hooks (corte de página no meio de empate de data perdia/duplicava linhas).

Validado: `tsc --noEmit` limpo; Playwright — filtro `[cp] maquina-conteudo-online-07-26` → R$ 8.912,54 = Gerenciador Meta; Default segue mostrando R$ 38.517,65/30d. Prova UI do lado Burn-in pendente de validação visual do dono (conta de teste só é membro do Default; por construção retorna 0).

## 2026-07-20 BRT — Auditoria IA tolerante a tipos desconhecidos

`useAuditoriaIA` + `AuditoriaTable`: linhas da `auditoria_sdr_ia` com `tipo`/`severidade` fora do enum esperado quebravam a renderização da tabela (config `undefined`). Agora o hook filtra linhas inválidas (type guards `isProblemaTipo`/`isSeveridade`) e a tabela tem fallbacks (`DEFAULT_TIPO_CONFIG`/`DEFAULT_SEVERIDADE_CONFIG`) para `outros_problemas`.

## 2026-07-19 BRT — Faxina de migrations + aplicação em produção (contrato de webhook)

Autorizado pelo dono ("faz você as migrations"). PITR confirmado ativo (janela 2026-07-12T22:28:58Z → 2026-07-19T22:29Z) antes de qualquer mudança. Branch `chore/faxina-migrations-drift-producao`, sem push/PR ainda (decisão pendente do dono).

**Faxina (drift real vs. `main`), via `supabase migration list --linked`:**
- `20261004000000_fix_cross_tenant_rls_p0_round2.sql` e `20261004000002_fix_clara_dashboard_rpc_cross_tenant_p0.sql` (round 2 cross-tenant) estavam aplicadas em produção mas não existiam em nenhuma branch — recuperadas de um commit órfão de checkpoint local (`fb8d60359c99e553df90609cc59029846cdf23c3`, não alcançável a partir de nenhum branch). Conteúdo confirmado por introspecção ao vivo (`pg_policies` + `pg_get_functiondef`) como o que rodou em produção — com uma ressalva documentada no próprio arquivo: a versão original usava `auth.uid() IS NULL` (bug de anon-bypass, já corrigido por `20261006000000`, já em `main`).
- Colisão de timestamp `20261005000000` (duas migrations com o mesmo nome) resolvida: `..._fix_creative_metrics_cross_tenant_p0.sql` renomeada para `20261005000002_..._redundante_ver_20261006000000.sql`.
- **Achado:** essa migration de criativos é REDUNDANTE — `20261006000000` (já aplicada) já incorpora exatamente o mesmo fix (`get_creative_metrics` 4 e 10 args + `v_creative_metrics`), confirmado por introspecção (`anon` sem EXECUTE/SELECT). Marcada como `applied` via `supabase migration repair --status applied` (não `reverted` — esse status faz o CLI tratar como pendente de novo, o oposto do desejado) para nunca ser reaplicada.

**Aplicado em produção (genuinamente pendente):**
- `20261005000000_contrato_webhook_campo_escape.sql` e `20261005000001_contrato_webhook_validacao_ingest.sql` (PR #52) — renomeadas para `20261006000001`/`20261006000002` (após a varredura de segurança já aplicada) para evitar `supabase db push --include-all`, proibido por `docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`. Antes de aplicar, confirmado por leitura de código que a validação de contrato NUNCA bloqueia o ingest (`webhook-ghl/index.ts` sempre grava em `webhooks_ghl` e sempre responde 202; mismatches só geram um registro de observabilidade em `webhook_contract_mismatches`). Coluna `oportunidades.custom_extra` é aditiva (`ADD COLUMN IF NOT EXISTS ... DEFAULT '{}'`).
- Deploy coordenado de `webhook-ghl` (v59 → v60) para ativar a checagem de contrato na edge function.

**Pós-verificação:** `supabase migration list --linked` com zero drift (Local = Remote em todas as linhas); coluna `custom_extra` e tabela `webhook_contract_mismatches` confirmadas; 2 workspaces ativos com `ghl_integration_settings`; 0 oportunidades órfãs; 256 webhooks nas últimas 24h, ingestão intacta.

## 2026-07-19 BRT — Matriz de Eficiência (Funis/Campanhas) + status honesto do multi-tenant

Duas entregas nesta sessão, ambas em branch dedicada (`feat/matriz-eficiencia-funis-campanhas`), sem escrita em produção:

1. **`docs/STATUS-MULTITENANT-2026-07-19.md`** — leitura consolidada de `docs/ROADMAP-MULTI-TENANT.md` + `docs/VALIDACAO-MULTITENANT.md` + `docs/VALIDACAO-META-MULTITENANT.md` + `docs/VARREDURA-CROSS-TENANT-COMPLETA.md`, separando o que ainda bloqueia o 2º tenant pago (burn-in, DPA), os 2 riscos residuais aceitos (funções-oráculo, `REVOKE` pendente de `analisar_*`) e o que já está fechado.
2. **MT-P1.2 — Matriz de Eficiência.** Nova aba "Eficiência" (sub-abas Funis/Campanhas) em Vendas, Aquisição e Tráfego — só linhas com dado != 0 no período selecionado. Implementação 100% em arquivos novos (`useMatrizEficiencia.ts`, `MatrizEficienciaTab.tsx`) + edição mínima (import + entrada de tab + render condicional) em `AquisicaoPage.tsx`/`VendasPage.tsx`/`DashboardPage.tsx`, para minimizar conflito com as ~15 PRs abertas (a PR #55 já toca os mesmos 3 arquivos). Detalhe em `docs/MATRIZ-EFICIENCIA-FUNIS-CAMPANHAS.md`. `tsc -b`, `vite build`, `eslint` e `vitest` (126/126) verdes.

## 2026-07-19 BRT — Diagnóstico do filtro MQL + filtros Closer/Pré-vendedor em todas as abas (PR aberto, sem merge)

Duas tarefas de UX de filtros no eb-dash2, documentadas em `docs/FILTROS-MQL-CLOSER-PREVENDEDOR.md`:

1. **Filtro "só MQL":** lógica de detecção (`isMqlByTag`, tag exata "mql") estava correta e validada contra produção por leitura (2.216/11.198 contatos com a tag exata). Achados reais corrigidos: (a) Ranking de Criativos tinha semântica diferente das demais abas (só escondia linhas, não filtrava os leads-base — duplicava a função do já existente "Ocultar sem MQL"), agora alinhado; (b) badge "N filtros ativos" não contava o MQL em 4 telas; (c) rótulo "Modo:" colidia com o toggle Cohort/Produtividade (também chamado "Modo") — renomeado para "Classificação:" com tooltip explicativo em todos os 6 pontos onde o filtro existe.
2. **Filtros Closer e Pré-vendedor:** adicionados em Tráfego, Aquisição, Orgânico, Ranking de Criativos e Leads (já existiam em Pré-Vendas/Vendas/Recuperação). Dado confirmado: `sdr_name` (pré-vendedor) 99,4% sincronizado; `vendedor_closer` só 1,4% preenchido em produção (reflexo de poucos leads chegarem à etapa de closer no GHL, não bug de sync). Nova opção sintética "Sem atribuição" (`SEM_ATRIBUICAO`) em todos os dropdowns para tornar filtrável o que antes ficava invisível.

Validado: `tsc --noEmit` limpo, `npm run build` limpo, `vitest` 126/126, `eslint` limpo, teste ao vivo no navegador contra produção (leitura) confirmando que o filtro Closer → "Sem atribuição" muda a contagem de MQLs de 133 para 111 na aba Tráfego. Branch `fix/dashboard-mql-filter-closer-presales-filters`, PR aberto — **sem merge**, aguardando revisão do dono.

## 2026-10-05 BRT — Contrato de Webhook CRM OMNX: inversão do mapeamento reativo → contrato fixo (PR aberto, sem merge)

Decisão do dono: o mapeamento de campos deixa de ser reativo (o sistema tentava adivinhar o
significado de cada campo customizado da conta GHL do cliente — 0/249 campos com match exato numa
conta nova) e passa a ser um **contrato publicado**: `docs/CONTRATO-WEBHOOK-CRM.md` lista os nomes
exatos de campo que o webhook do CRM OMNX deve enviar (por tabela: contato, oportunidade, venda
fechada), com tipos, formatos e exemplos. Levantamento prévio confirmou exatamente quais ~72
chaves `customData`/campos de contato o sistema já consome hoje (`extrair_dados_ghl_v2` +
trigger de `vendas_fechamento`) — o contrato documenta esse vocabulário sem remover nada, mantendo
100% de compatibilidade com o cliente já em produção.

**Campo de escape (zero-config):** nova coluna `oportunidades.custom_extra` (jsonb) captura
automaticamente qualquer chave de `customData` fora do contrato — sem exigir mapeamento
pré-configurado por workspace (diferente de `contatos.custom_fields`, que já existia mas depende
de uma linha de mapeamento manual por campo). Nunca vira métrica/funil, só exibição passiva.
Migration `20261005000000_contrato_webhook_campo_escape.sql`.

**Validação de formato no ingest:** `webhook-ghl` agora checa o formato de cada payload contra o
contrato (`supabase/functions/_shared/webhook-ghl-contract.ts`) — nunca bloqueia nem descarta o
evento (webhooks_ghl continua imutável), só devolve `warnings` na resposta HTTP síncrona (útil para
quem testa via curl) e registra o desvio em `webhook_contract_mismatches` (nova tabela, vigilância).
Migration `20261005000001_contrato_webhook_validacao_ingest.sql`. Reaproveita, sem descartar, a
vigilância de contagem já existente (`ghl_mapping_change_alerts`, `20260819000000`) — as duas são
complementares: uma olha o formato de cada evento, a outra a estrutura geral da conta ao longo do
tempo.

**Validação:** 16 testes unitários novos (`__tests__/webhook-ghl-contract.test.ts`) + 17 testes
funcionais com escrita real num projeto Supabase efêmero (criado, migrations aplicadas, ingest
testado com payload conforme e não-conforme, custom_extra confirmado, COALESCE de `data_conectado`
confirmado protegido, projeto deletado ao final). Suite completa (`vitest run`) sem regressão nos
testes que não dependem do banco de teste (descontinuado em 2026-07-18).

Entrega em branch `feat/contrato-webhook-crm`, PR aberto **sem merge** — decisão de merge é do
dono (`main` dispara deploy Vercel).

## 2026-07-19 BRT — Varredura sistemática cross-tenant (161 funções SECURITY DEFINER + 13 views), PR sem merge

Auditoria exaustiva de toda a superfície de RPCs `SECURITY DEFINER`/views de produção
(`qzesffnkqgelmtfblzkr`), motivada pela mesma classe de bug já ter aparecido 3x (RPCs CRM round2,
RPCs Meta PR #51, funções de criativo PR #53). **37 funções + 1 view eram vazamento cross-tenant
real**, corrigidas numa única migration (`20261006000000_fix_cross_tenant_security_definer_sweep_p0.sql`)
na branch `fix/cross-tenant-security-definer-sweep`. Achados principais:

- **Anon-bypass no fix anterior:** o round2 (`20261004000002`, já em produção) usou
  `auth.uid() IS NULL OR is_workspace_member(...)` pensando em liberar `service_role`, mas
  `auth.uid()` também é `NULL` para uma chamada com a **anon key pública sem login** — 6 funções
  afetadas (`get_lead_full`, `get_opp_id_by_email`, `buscar_lead_para_venda`,
  `list_weekly_email_schedules`, `auditoria_sdr_ia`, `delete_weekly_email_schedule`). Corrigido
  trocando por `auth.role() = 'service_role'` + revogando `anon`.
- **IDOR (sem checar posse):** `get_clara_campaigns_crm`/`get_clara_creatives_crm`/
  `buscar_reengajamento` filtravam a query pelo `workspace_id` recebido mas nunca validavam que o
  chamador pertencia a ele; `update_weekly_email_schedule`/`send_weekly_report_test` tinham zero
  checagem de posse (qualquer autenticado podia sequestrar `recipient_emails` do relatório semanal
  de outro workspace).
- **CTE sem filtro de workspace (mesma classe da PR #53):** `get_creative_metrics` (incorporado da
  PR #53, ainda não mergeada) + `get_campaign_creatives`/`get_campaign_summary`/`get_objectives`
  (achados novos desta varredura, mesma família não coberta pela PR #53).
- **Família "evento legado" (`ganhou_ingresso` e mais 10 funções):** zero workspace-awareness,
  zero callers em `eb-dash2/src`/`supabase/functions` — `EXECUTE` revogado de anon/authenticated.
- **Helpers de cron/worker expostos sem necessidade** (`sync_tags_from_webhook_*`,
  `setup_workspace_apps_and_permissions`, `get_cron_jobs`/`get_cron_runs`, etc.) — todos os
  callers reais confirmados usam `SUPABASE_SERVICE_ROLE_KEY`; grant a anon/authenticated revogado.
- **Oráculo de enumeração `get_user_*_workspace_ids`/`get_user_auth_events`:** fechava o risco
  residual que `docs/ROADMAP.md` listava como "aceito" — 0 callers confirmados, `EXECUTE` revogado.
- **View `ai_conversation_stats`** sem `security_invoker`, exposta a anon+authenticated —
  corrigida com `security_invoker=true` (mesmo padrão do round2).

**Validado com escrita real** em projeto Supabase efêmero (`xigyntpcuusouswwcblw`, renomeado ao
final para `DELETAR-validacao-cross-tenant-sweep` — regra 20c, nunca auto-excluído): 2 tenants
sintéticos com colisão proposital de código de criativo (`CR-1` nos dois), 9 ataques adversariais
simulando anon/authenticated/service_role via JWT forjado — todos os IDOR/anon-bypass corretamente
bloqueados, contaminação de CTE comprovadamente fechada (spend/leads/faturamento retornados batem
exatamente com os dados do próprio tenant, não somados com o outro), e o caminho de automação
(`service_role`) confirmado intacto.

Inventário completo (161 funções + 13 views, classificação a/b/c/d, evidência de cada achado) em
[`docs/VARREDURA-CROSS-TENANT-COMPLETA.md`](VARREDURA-CROSS-TENANT-COMPLETA.md). **Não aplicada em
produção nesta sessão** — branch `fix/cross-tenant-security-definer-sweep`, PR aberto sem merge,
aguarda autorização do dono.

## 2026-07-19 BRT — Correção Meta Ads (P0 cross-tenant) aplicada em PRODUÇÃO, deploy coordenado

Migration `20261004000003_fix_meta_ads_rpcs_cross_tenant_p0.sql` **aplicada em produção**
(`qzesffnkqgelmtfblzkr`), autorizada explicitamente pelo dono, em deploy coordenado com o
frontend para não quebrar a aba Tráfego. PITR reconfirmado ativo antes da escrita (backup físico
mais recente: `2026-07-19T11:00:26Z`). Sequência: PR [#51](https://github.com/Empire-Business/GHL-SUPABASE/pull/51)
mergeado em `main` (`5ae2414`) → deploy Vercel confirmado ao vivo nos domínios reais
(`dash.omnx.pro`, `ceo.omnx.pro`, `ceo.empirebusiness.com.br`) → migration aplicada
imediatamente depois via `node scripts/apply-migration.mjs ... --allow-destructive` (o
`DROP FUNCTION` é redefinição de assinatura, não perda de dado; confirmado antes de aplicar
que não havia `DROP TABLE`/`DELETE`/`TRUNCATE`).

**Verificação pós-aplicação, dinâmica (não só leitura de policy):** `has_function_privilege('anon', ...)`
= `false` nas 3 RPCs; simulação de JWT real de um admin do workspace `Default` confirmou dado real
retornado para o próprio workspace (161 linhas, R$266.321,65) e 0 linhas ao tentar ler o workspace
`Burn-in Interno`; chamada como `anon` agora recebe `ERROR 42501: permission denied` (bloqueado no
GRANT, não só filtrado por RLS). Ingestão (`sync-meta-ads`) e `workspace_meta_ad_accounts` confirmados
intactos. Detalhe completo, incluindo a decisão de não usar overload retrocompatível (para não manter
o vazamento `anon` vivo durante a transição), em `docs/VALIDACAO-META-MULTITENANT.md`.

## 2026-07-19 BRT — Validação adversarial Meta Ads: P0 confirmado, correção AINDA NÃO aplicada

Auditoria adversarial do isolamento multi-tenant da integração Meta Ads (`docs/VALIDACAO-META-MULTITENANT.md`),
via introspecção read-only de produção (`scripts/query-prod-readonly.mjs`, SELECT-only). As tabelas
`meta_ads_*` em si (RLS, triggers, sync, credenciais) estão bem isoladas. Achado real:

- **P0:** `analisar_meta_crm_cruzado(date, date)` — `SECURITY DEFINER`, sem filtro de `workspace_id`,
  `EXECUTE` concedido a `anon` **e** `authenticated` (confirmado ao vivo). Qualquer request com a anon
  key pública, sem login, agrega Meta Ads + CRM de todos os workspaces. Chamada pelo frontend
  (`useMetaCrmCruzado.ts`, aba Tráfego). Hoje sem dado cross-tenant real vazando porque o 2º workspace
  (`Burn-in Interno`) está vazio — mas o mecanismo é live.
- **P1:** `analisar_meta_ads_por_regiao(date, date)` — mesmo padrão (sem filtro de workspace); só não é
  explorável hoje porque a tool da Clara que a chama (`query_meta_ads_region`) já está bloqueada
  explicitamente em `bot-chat-data/index.ts`. Sem gate no banco, só no app.
- **P2:** `analisar_meta_ads(...)` — mesmo padrão, sem caller ativo localizado.

Migration de correção escrita (`supabase/migrations/20261004000003_fix_meta_ads_rpcs_cross_tenant_p0.sql`):
as 3 RPCs passam a exigir `p_workspace_id` + `is_workspace_member()` fail-closed, e `REVOKE` explícito de
`anon`/`PUBLIC`. Callers já atualizados no mesmo commit: `useMetaCrmCruzado.ts`, `TrafegoTab.tsx`,
`executors.ts` (Clara), `bot-chat-data/index.ts`. **A migration NÃO foi aplicada em produção nesta
sessão** — aguarda autorização do dono, mesmo fluxo do hardening P0/round 2 do núcleo GHL abaixo.

## 2026-07-19 BRT — Hardening multi-tenant P0/round 2 aplicado em PRODUÇÃO

As 2 migrations escritas e testadas na validação adversarial de 2026-07-18/19
(`docs/VALIDACAO-MULTITENANT.md`) foram aplicadas em produção (`qzesffnkqgelmtfblzkr`),
autorizadas explicitamente pelo dono, com PITR reconfirmado ativo antes da escrita
(ponto de recuperação registrado: `2026-07-19T03:36:19Z`).

- **`20261004000000_fix_cross_tenant_rls_p0_round2.sql`:** removidas 12 políticas RLS
  permissivas (sem filtro de workspace) que coexistiam com as políticas corretas em
  `contatos` (SELECT+DELETE), `oportunidades`, `comunicacoes`, `vendas_fechamento`,
  `meta_ads_raw_insights` (SELECT); `meta_ads_backfill_controle`/`meta_ads_backfill_log`
  ganharam `workspace_id NOT NULL` + trigger; `ghl_opp_reconcile_runs`/
  `ghl_custom_field_mappings` (dado sistêmico, sem tenant por linha) viraram
  service_role-only.
- **`20261004000002_fix_clara_dashboard_rpc_cross_tenant_p0.sql`:** 6 RPCs
  `SECURITY DEFINER` (`get_lead_full`, `get_opp_id_by_email`, `buscar_lead_para_venda`,
  `auditoria_sdr_ia`, `list_weekly_email_schedules`, `delete_weekly_email_schedule`)
  ganharam guard `is_workspace_member`/`is_workspace_admin` — a última tinha uma escrita
  destrutiva cross-tenant confirmada ao vivo (DELETE de agendamento de outro tenant). 5
  views (`v_creative_metrics`, `v_disparo_metricas`, `v_creative_status_counts`,
  `v_weekly_snapshots_status`, `v_weekly_dashboard`) ganharam `security_invoker=true`.
- **Pós-aplicação verificado por introspecção** (sem executar ataque destrutivo real
  contra produção): as 12 policies antigas sumiram de `pg_policies`, as 6 funções têm o
  guard no `prosrc`, as 5 views têm a opção no `pg_class.reloptions`. Ingestão íntegra:
  2 workspaces com contagem igual à pré-aplicação (`Default` 11.191 contatos/11.234
  oportunidades, `Burn-in Interno` 0/0), zero órfãos, 3 webhooks processados nos 15 min
  seguintes.
- Detalhe completo do procedimento (7 passos) em
  [`docs/VALIDACAO-MULTITENANT.md`](VALIDACAO-MULTITENANT.md), seção "Aplicação em
  Produção (2026-07-19)".
- **Gate do 2º tenant pago liberado** quanto a este hardening — riscos residuais
  aceitos e documentados (funções-oráculo `get_contact_workspace_id`/
  `get_opportunity_workspace_id`, hardening pendente da família `analisar_*`) não
  bloqueiam.

## 2026-07-18 BRT — Filtro "Venda Direta" completo em Vendas→Produtividade (branch `feat/filtro-venda-direta`)

Conclui a reestruturação de venda externa em Vendas→Produtividade descrita no handoff
anterior (§4). Antes, "Só Venda Direta" em Produtividade mostrava 0 fechados/R$0 — a 3ª
fonte de KPIs (`useCloserProdutividade`) e o filtro dimensional da GeralTab não conheciam
o canal sintético `__venda_direta__`, e 5 pontos ainda excluíam venda direta dos
contadores de Fechados por hardcode (`!isVendaExterna`).

- **`isVendaExterna` (useTrafego.ts) generalizada:** aceita agora qualquer objeto com
  `contatos.{contact_source,tags}` em vez de exigir o `OppRow` completo — permite reuso
  em linhas mais enxutas (`useCloserProdutividade`) sem duplicar a lógica de detecção.
- **`useCloserProdutividade`:** `contact_source` adicionado ao select de oportunidades;
  o match de canal em `passesFilter` agora usa `isVendaExterna(opp) ? VENDA_DIRETA_CANAL
  : utm_source` — igual ao padrão já usado em `usePreVendas`/`usePreVendasProducao`.
- **`GeralTab.tsx` — venda direta aparece por padrão em Fechados** (5 pontos): o
  contador `kpis.fechados` (cohort), `filteredProdPaidOpps` (produtividade) e os 2 passos
  "Fechados" do funil (cohort + produtividade) pararam de excluir `isVendaExterna(o)`
  incondicionalmente — quem decide agora é o filtro de Canal (`matchesDimensionFilters`,
  também corrigida para reconhecer `VENDA_DIRETA_CANAL`). O card "Vendas Externas" virou
  um breakdown informativo, não mais um desconto automático.
- **Verificado manualmente no dev server** (workspace Default, dados de teste de
  2026-05-11): sem filtro → 6 fechados/R$196.500; "Só Venda Direta" → 1 fechado/R$24.000;
  excluindo Venda Direta → 5 fechados/R$172.500 (6=1+5, R$196.500=R$24.000+R$172.500).
  Cohort e Pré-Vendas conferidos sem regressão. `tsc --noEmit`, `eslint`, `vitest run`
  (126/126) e `vite build` verdes.
- Branch `feat/filtro-venda-direta` pronta para PR — merge é decisão do dono.

## 2026-07-18 BRT — Varredura de consistência do dashboard (bug Vendas R$0 + robustez)

Auditoria multi-agente de consistência de receita e robustez em todos os painéis.
Veredito: Aquisição, Tráfego, Matriz, Pré-Vendas, Recuperação e Relatórios/Metas estão
internamente consistentes; a única inconsistência de números real era Vendas→Produtividade.

- **Vendas→Produtividade "5 fechados / Faturamento R$ 0,00" — CORRIGIDO:** os cards
  financeiros vinham de `useCloserProdutividade` (loading/erro próprios) mas usavam o
  loading do `usePreVendasProducao` → exibiam R$0 durante a carga e permanentemente em
  falha (banner só na tabela de Closers). Fix: KPIs de Produtividade gateados no loading
  dos DOIS hooks (`prodDataLoading`) + Faturamento/Caixa mostram "—" em erro, nunca R$0
  silencioso. Verificado por Playwright (R$0 falso não aparece mais).
- **Card Fechados respeita filtros dimensionais** (`filteredProdPaidOpps`) — antes ignorava
  filtros ativos e divergia do Faturamento.
- **Truncamento em `useLeads`** (`.limit(1200)` ignorado pelo PostgREST) → paginado `.range()`.
- **Robustez preventiva:** paginação `.range()` nas queries de `vendas_fechamento` por data
  (useSDRProdutividade, useSDRHighlightChart, useProdutividadeMatrix); chunking de
  `.in('oportunidade_id')` (AutoAgendados/Agendamentos/Reunioes); estado de erro em
  `useProdutividadeMatrix` e `useMQLCohortComms` (fim do "mostra 0 sem avisar" em falha).
- **Pendente de decisão do dono:** semântica de "venda externa" — na página Vendas o card
  Fechados exclui venda externa mas o Faturamento inclui (divergem quando há externa, ~4 no
  Default); Aquisição/Tráfego não excluem. Padronização aguarda decisão.

## 2026-07-18 BRT — Vendas omnx-desk: rename compatível, robustez, isolamento multi-tenant, paginação

- **Rename EmpireDesk → omnx-desk (compatível):** as 3 edge functions `crm-*` aceitam
  `x-omnx-desk-secret` **e** o antigo `x-empiredesk-secret`; `crm-registrar-venda` grava
  `origem='omnx_desk'`; migration `20261002000000` normaliza as 16 vendas históricas
  (`empiredesk`→`omnx_desk`). Rótulos/comentários e health-check atualizados.
- **Robustez da ponte** `crm-registrar-venda`: COALESCE server-side (nunca sobrescreve
  `data_pagamento_entrada`/valores bons com null) + `422` quando `pagamentos` não deriva
  data de entrada e não há venda existente (fim da "venda cega").
- **Isolamento multi-tenant (fazer agora):** provider `omnx_desk` no CHECK de
  `workspace_integration_credentials` + RPC `resolve_workspace_by_omnx_desk_secret_digest`
  (`service_role`-only, migration `20261003000000`). A ponte roteia por digest SHA-256 do
  secret → workspace; a oportunidade precisa pertencer a esse workspace (403 cross-tenant);
  `workspace_id` explícito no upsert. Secret global vira fallback legado (aposentar após seed).
- **Paginação `.range()`** nas 3 queries de receita (`usePreVendas` ×2, `useProducao`) que
  podiam truncar em 1000 conforme o histórico cresce.
- **Decisões do dono:** manter filtros/painéis como estão (filtro Recuperação já cobre a
  visibilidade); sem painel de faturamento total; sem reescrever Cohort×Produtividade; sem
  lacuna de ingestão pós-07/jul. Gate de segurança PASS (0 P0/P1, 3 P2 documentados).
- Docs: `docs/INTEGRACAO-OMNX-DESK-VENDAS.md` (§8 checklist), `docs/ROADMAP.md`,
  `docs/NIVEIS-DE-ACESSO.md` (RPC de roteamento), `docs/UML.md` (fluxo de registro isolado).

## 2026-07-18 BRT — decisão: só produção (teste + staging serão deletados) + limpeza de branches

- **Decisão do dono:** deletar os bancos de **teste** e **staging**; operar só com
  produção (`qzesffnkqgelmtfblzkr`). Pipeline de 3 fases vira HISTÓRICO. Registrado em
  [`docs/DECISAO-SO-PRODUCAO-2026-07-18.md`](DECISAO-SO-PRODUCAO-2026-07-18.md) e banner
  em [`docs/PIPELINE-TESTE-STAGING-PRODUCAO.md`](PIPELINE-TESTE-STAGING-PRODUCAO.md).
  **Risco registrado:** sem rede de segurança pré-produção; mitigação = migrations sempre
  idempotentes + backup antes de DDL destrutivo + mudanças aditivas.
- **Limpeza de branches:** 56 branches locais **já mergeadas** na main deletadas com
  `git branch -d` (recusa não-mergeadas — nada perdido). 4 restantes (pr41/43/44/45)
  presas a worktrees `/private/tmp`; remoção via `worktree prune`+`-D` barrada pelo
  guardrail do harness (pendente, manual).
- **Migration `20261001000000` em produção:** tentativa automática **barrada pelo
  guardrail** de escrita em produção. Runbook de aplicação manual no doc da decisão.

## 2026-07-18 BRT — feat: filtro Recuperação (3 estados, salvo por conta) + fix do "0 vendas" intermitente

Branch `feat/filtro-recuperacao-e-fix-produtividade`. Implementação após auditoria
Playwright das telas de venda (contra produção, com cross-check SQL).

- **Auditoria de contagem:** Aquisição→Produtividade exibiu **5 vendas / R$209k**, batendo
  **exato** com o banco (sem bug de contagem). O "0 vendas" reportado é **intermitente**:
  `TypeError: Failed to fetch` nos loaders de Produtividade era **engolido em silêncio** →
  0 sem aviso.
- **Fix confiabilidade:** novo `src/lib/retry.ts` (`retryAsync`) aplicado aos loaders de
  Produtividade (AquisicaoPage inline + `usePreVendasProducao`); `catch {}` silencioso da
  `AquisicaoPage` virou log + **banner de erro visível** com "Tentar de novo" (nunca mais
  mostrar 0 enganoso).
- **Filtro Recuperação (3 estados):** "Sem recuperação" (default) / "Com recuperação" /
  "Só recuperação" em **Vendas** e **Aquisição**. Base: `pipelineMode` do `usePreVendas`
  estendido; helper `applyRecuperacaoFilter` em `constants.ts`; componente
  `RecuperacaoFilter`. Nenhum filtro existente foi alterado (default = comportamento atual).
- **Persistência por conta:** migration `20261001000000_user_dashboard_prefs.sql` (RLS por
  usuário, `user_id=auth.uid()`), hook `useDashboardPrefs` (cache localStorage + banco).
  Validada no banco de TESTE (5 colunas, 5 policies). **Ainda não aplicada em produção**
  (gated) — sem a tabela, o filtro funciona na sessão e a persistência degrada com elegância.
- **Verificação:** `npm run build` verde; smoke Playwright confirmou o seletor e a troca de
  modo em dados reais (Só recuperação = R$0 vs Sem = R$84k no período default, consistente).
- **Pendências gated (não executadas):** aplicar migration em produção (aval do dono +
  staging), `supabase gen types`, gerar `docs/UML.html`, `/security-auditor`, e commit/push.

## 2026-07-18 BRT — docs: diagnóstico das vendas omnx-desk (ex-EmpireDesk) + plano de correção/multi-tenant/rename

Investigação do relato "vendas do omnx-desk não aparecem no dashboard".
Diagnóstico rodado **em produção** via Management API (SELECT-only), sem alterar dados.

- **Achado:** as **16 vendas** `origem='empiredesk'` estão **corretas no banco** (data de
  pagamento, workspace, pagamentos). Não há venda perdida. O problema é **exibição**:
  **8 delas (~R$ 101k)** ficam invisíveis nos painéis de Tráfego/Produção por filtro de
  tráfego pago (7 leads orgânicos) e pipeline Recuperação (2).
- **Bug confirmado:** Aquisição → Produtividade mostra **0 vendas em 30 dias** quando há 3
  vendas válidas de tráfego pago no período (R$ 41k). Suspeito: `catch {}` silencioso em
  `AquisicaoPage.tsx:299`. Requer reprodução ao vivo para corrigir.
- **Corrobora** a nota abaixo: **nenhuma venda omnx-desk chegou desde 2026-07-07**.
- **Multi-tenant:** a ponte `crm-registrar-venda` usa 1 secret global — sem isolamento por
  tenant. Desenhado o provider `omnx_desk` em `workspace_integration_credentials` (prep).
- **Rename EmpireDesk → omnx-desk:** mapeadas 9 arquivos / 39 ocorrências para troca compatível.
- **Entregas (documentação, sem código ainda):**
  - Novo [`docs/INTEGRACAO-OMNX-DESK-VENDAS.md`](INTEGRACAO-OMNX-DESK-VENDAS.md) — plano técnico completo.
  - Novo [`docs/CONFIG-OMNX-DESK-USUARIO.md`](CONFIG-OMNX-DESK-USUARIO.md) — passo a passo + formato de dados p/ o usuário.
  - Item detalhado em [`docs/ROADMAP.md`](ROADMAP.md) com decisão do dono pendente.
  - Supersede [`docs/INTEGRACAO-EMPIREDESK-VENDAS.md`](INTEGRACAO-EMPIREDESK-VENDAS.md).

## 2026-07-18 BRT — fix: enchente `missing_tenant` eliminada (126k jobs mortos) + backfill de SDR

Desde 14/07, `sync-opp-sdr` (104k jobs mortos/3 dias), `sync-contact-tags`
(9,5k) e `sync-opp-pipelines` (1,8k) enfileiravam jobs sem tenant — o worker
multi-tenant (fail-closed desde 13/07) matava todos: 126.587 dead-letters em
3 dias e subindo (17k→53k/dia). Nomes de SDR e refresh de tags MQL parados.
Achado durante a investigação de "vendas de julho não aparecem" (que se
provou ser ausência de dados de venda vindos do GHL/Hotmart desde 07/07,
não bug do sistema).

- **Causa raiz:** `enqueue_ghl_api_job` (RPC) nunca preenchia as colunas
  `workspace_id`/`location_id`; `extrair_dados_ghl_v2` PASSO 2.6 montava o
  context do job sem tenant; as 3 edge functions idem (era pré-multi-tenant).
- **Fix (migration `20260929000000` + 3 functions):** RPC promove
  `context->workspace_id/location_id` para as colunas (assinatura intacta);
  PASSO 2.6 inclui tenant no context; functions enviam `workspace_id` do
  próprio registro e pulam sem tenant (fail-closed, padrão do fix f50a9f2).
- **Prova pós-deploy:** jobs criados após o deploy com **0 mortos** (RPC e
  PASSO 2.6 verificados via `pg_proc`; 191+ jobs sync-opp-sdr `done`).
- **Limpeza:** 127.946 jobs `dead` com `missing_tenant` e ~128k registros em
  `webhook_unresolved` removidos em lotes de 20k (o backfill refaz o
  trabalho — não eram dados, eram ruído de fila).
- **Backfill em curso:** 7.424 oportunidades sem `sdr_name` reprocessadas em
  lotes de 500 via `sync-opp-sdr` (drain aplica os nomes a cada rodada);
  tags MQL e pipelines voltam ao ciclo normal via cron.
- Suite de integração **592/592** verde; gate de segurança PASS
  (`security-report/audit-2026-07-18-gate-missing-tenant-fix.md`).

## 2026-07-18 BRT — fix: endpoint `/followers` nunca existiu (4,6M de chamadas 404) + backfill SDR concluído

Descoberta durante o backfill de SDR: `GET /opportunities/{id}/followers`
**nunca foi um endpoint válido** na conta GHL — 4.642.230 jobs `sync-opp-sdr`
na história, 100% com `http_status 404`, zero dados retornados. Todo
`sdr_name` existente veio de backfills de `contatos.owner_name`.

- **Fix:** `sync-opp-sdr` e o PASSO 2.6 agora enfileiram `GET
  /opportunities/{id}` (o objeto retorna `followers` como array de ids,
  provado em produção); o drain resolve `followers[0]` → `ghl_users.nome`
  com fallback **sempre** para `contatos.owner_name` (inclusive em 404).
- **Backfill (migration `20260930000000`):** 7.424 oportunidades sem
  `sdr_name` → **86** (98,8% resolvidas via `owner_name`; as 86 restantes
  têm contato sem owner). Prova do endpoint novo: jobs retornando
  `traceId` + objeto `opportunity` real.
- **Bônus:** fim do desperdício de ~4,6M de chamadas inúteis à API do GHL
  (grande parte das linhas `done` históricas da fila era esse endpoint 404).

## 2026-07-17 BRT — fix: hardening multi-tenant P0+P2 — 8 vazamentos cross-tenant fechados em produção

Auditoria ao vivo de `pg_policies` em produção confirmou 8 tabelas com
leitura/escrita entre workspaces (policies `USING (true)` ou "membro de
qualquer workspace"). Com a sub-conta "Burn-in Interno" ativa, o vazamento era
real, não teórico. Branch `fix/multi-tenant-rls-hardening` (5 commits).

- **Migration `20260927000000` (P0):** `workspace_id NOT NULL` + backfill por
  mapeamento real + triggers `set_workspace_id_*` em `ghl_tasks`,
  `maquina_de_conteudo`, `webhooks_ghl` (246k linhas, backfill em 2 passos
  set-based após timeout inicial), `reunioes`, `bot_context`; policy de
  `stevo_whatsapp_calls` reescrita para usar a coluna; `audit_log` com
  `workspace_id` nullable (NULL invisível para authenticated); `app_config`
  com leitura anon restrita a `key = 'supabase_anon_key'`.
- **Migration `20260928000000` (P2):** fim da brecha `workspace_id IS NULL OR`
  nas 12 `weekly_*` (12 gêmeas redundantes da reprocess_queue removidas),
  `ghl_users`, `ghl_calendars`, `meta_ads_sync_log` (3.511 linhas backfill);
  `contatos` sem DEFAULT "workspace mais antigo" + NOT NULL; DROP da função
  morta `trigger_sdr_ia_on_inbound_message`.
- **Edge functions:** `bot-chat` filtra `bot_context` por workspace;
  `compute-weekly-reports` exige `workspace_id` (sem fallback de env);
  `notion-creatives-sync` com database IDs só do metadata (422 fail-closed —
  zero credenciais notion em prod, nada quebra); `external-form-submissions`
  sem bypass do helper (RPC direto como caminho primário).
- **Higiene:** 16 functions mortas deletadas de produção (callers zerados
  comprovados por auditoria), incluindo `audit-leads-fev` — endpoint público
  sem auth que lia dados de todos os workspaces. `infer-ghl-mappings`
  (código morto, nunca deployada) removida do repo. Produção agora tem
  exatamente as 44 functions do repo (diff zero).
- **Provas:** fixture RLS re-gerada (99 tabelas com workspace_id / 28 sem);
  30 testes novos em `p0-cross-tenant-rls-fix.test.ts`; suite completa
  **592/592 verde** no banco de teste; gate de segurança PASS
  (`security-report/audit-2026-07-17-gate-deploy-rls-hardening.md`);
  verificação pós-deploy em produção: 0 NULLs, policies corretas, tráfego
  ao vivo inserindo com `workspace_id` via trigger.
- **Docs:** `docs/UML.md` (nova seção de hardening) e
  `docs/NIVEIS-DE-ACESSO.md` atualizados nos mesmos commits (gates).

## 2026-07-17 BRT — refactor: ESLint zero no eb-dash2 (Fase 1)

`npm run lint` sai de **131 problemas (84 erros + 47 warnings) para 0** —
59 arquivos refatorados sem mudança de comportamento (branch `fix/lint-zero`).

- **`react-hooks/set-state-in-effect` (27 erros):** dois padrões aplicados —
  setState síncrono de loads async movido para closure async/microtask (mesmo
  timing de fetch), e "reset quando prop muda" reescrito como ajuste de estado
  durante o render (padrão oficial react.dev, com sentinel para o mount).
- **`react-hooks/exhaustive-deps` (47 warnings):** filtros de objetos
  serializados em referência estável (deep-compare com adjust-during-render),
  eliminando tanto os warnings quanto o risco de loop por identidade nova;
  shadow `const filters = filtersStable` preserva o corpo dos effects intacto.
- **`@typescript-eslint/no-explicit-any` (25 erros):** `any` substituído por
  interfaces locais das linhas do Supabase não tipado (casts estruturais
  `as unknown as T[]` nos embeds many-to-one), generics e `unknown`+narrowing.
- **`react-refresh/only-export-components` (6):** disable de topo justificado
  em `ui/button`, `ui/badge` e nos 3 contexts + `ChatMessage` (padrão
  Provider+hook/variantes; separar arquivo quebraria imports no app inteiro).
- **Demais regras:** `no-unused-vars` (14 — remoção de código morto),
  `no-unused-expressions` (4 — ternário-statement → if/else),
  `no-unexpected-multiline` (2), `react-hooks/immutability` (2),
  `react-hooks/refs`/`purity` (2 — ref fora do render, `Date.now()` fora do
  JSX), directive obsoleta `react/no-danger` removida (regra inexistente).
- **Testes:** 3 specs Playwright com código morto removido; warning de `act()`
  em `useWeeklyReports.test.ts` corrigido (sem alterar asserções).

Verificação: `npm run lint` 0 problemas; `tsc --noEmit` 0 erros (app+node);
`vitest run` 116/116. Suíte de integração da raiz não afetada (só frontend).

## 2026-07-17 BRT — chore: higiene da base (Fase 0 do plano "terminar sistema + UX/UI")

Primeira fatia do plano aprovado de conclusão do sistema e reforma de UX/UI
(branch `chore/higiene-base`). Só organização e correções sem mudança de
comportamento.

- **Location ID do GHL sem fallback hardcoded:** `DiscagemTab.tsx` e
  `LeadCard.tsx` usavam `?? 'U8FTcw90CB5QELUnbGUu'` (location de produção
  embutida no código). Criado helper compartilhado `eb-dash2/src/lib/ghl.ts`
  (`ghlContactUrl`) que retorna `null` quando `VITE_GHL_LOCATION_ID` não está
  configurada — a UI omite o link em vez de apontar para a location errada.
- **`.env.example` criado** (`eb-dash2/.env.example`) documentando
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (obrigatórias) e
  `VITE_GHL_LOCATION_ID` (opcional); `.gitignore` ajustado com exceção
  `!.env.example` para versioná-lo.
- **Scripts de debug organizados:** 10 scripts soltos da raiz do pacote
  (`query_top_ads*.ts`, `check_lead.ts`, `debug_creatives.ts`, `get_meta_data.*`,
  `test_drilldown.mjs`, `check_meta_final.mjs`) movidos para `eb-dash2/scripts/`
  e excluídos do lint (`globalIgnores` no `eslint.config.js`). Nada em `src/`
  os importa.
- **Bug latente corrigido:** `resolveModuleKey` mapeava `inscricoes` →
  `appSlug: 'inscricoes'` (app inexistente). Agora resolve para
  `{ appSlug: 'leads', featureKey: 'inscricoes' }` — a feature vive no app
  Leads (`/leads?tab=inscricoes`).
- **3 directives `eslint-disable` órfãs removidas** (`useLeads.ts`,
  `useMQLCohortComms.ts`, `GeralTab.tsx`) — o linter as marcava como não usadas.
- **ROADMAP sincronizado com a realidade:** deploy do `webhook-ghl` fail-closed
  marcado como concluído (2026-07-16); isolamento Meta Ads marcado como aplicado
  em produção (2026-07-16, pré-condição da Fase 15 cumprida); migration
  `20260921000000` (36 funções SECURITY DEFINER) marcada como aplicada — resta só
  a rotação da service_role key; Fase 11-A marcada concluída; Task 6 da Fase 14
  (backfill) esclarecida; referência `/inscricoes` corrigida para
  `/leads?tab=inscricoes` na tabela de progresso.

Verificação: `tsc --noEmit` 0 erros; `vitest run` 116/116; lint caiu de
141 → 131 problemas (84 erros, 47 warnings — o restante é a Fase 1).

## 2026-07-16 BRT — feat: formato `clara_only` para e-mails autônomos + fix cache PostgREST

Adicionado `email_format` em `weekly_email_schedules` para permitir enviar e-mails
escritos apenas pela Clara, sem o template visual estático de KPIs.

- Nova coluna `email_format` (`full` | `clara_only`) com default `full` e CHECK.
- Atualizadas as RPCs `list_weekly_email_schedules`, `create_weekly_email_schedule`
  e `update_weekly_email_schedule` para expor/aceitar `email_format`.
- Refatorada `list_weekly_email_schedules` para `RETURNS SETOF public.weekly_email_schedules`
  (`supabase/migrations/20260924000014_list_schedules_setof_table.sql`), resolvendo
  cache do PostgREST que continuava retornando `structure of query does not match
  function result type` após adicionar a coluna.
- Edge function `send-weekly-report-email` atualizada para respeitar
  `email_format = 'clara_only'`: gera corpo do e-mail apenas com a análise da Clara.
- Fail-closed: se `email_format = 'clara_only'` e a Clara não conseguir gerar a
  análise, o e-mail não é enviado (evita envio do template visual por engano).
- UI em `eb-dash2/src/components/relatorios/AutomationForm.tsx` ganhou seletor
  de formato quando o resumo da Clara está ativo.
- Hook `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts` atualizado com tipagem
  e parâmetros de `email_format`.
- Schedule diário "Análise diária completa de tráfego" atualizado para
  `email_format = 'clara_only'`.
- Teste E2E Playwright `eb-dash2/tests/clara-daily-traffic-report.spec.ts`: **2/2 passed**.

⚠️ Problema operacional encontrado: a credencial `openrouter` do workspace Default
está respondendo **401 `User not found`** na API da OpenRouter. Por isso, e-mails
`clara_only` não são enviados até que uma chave válida seja configurada. O template
`full` continua funcionando normalmente.

Arquivos:
- `supabase/migrations/20260924000010_add_email_format_to_schedules.sql`
- `supabase/migrations/20260924000011_invalidate_pgrst_cache_email_format.sql`
- `supabase/migrations/20260924000012_force_pgrst_reload_table_cache.sql`
- `supabase/migrations/20260924000013_alter_function_set_pgrst.sql`
- `supabase/migrations/20260924000014_list_schedules_setof_table.sql`
- `supabase/functions/send-weekly-report-email/index.ts`
- `eb-dash2/src/components/relatorios/AutomationForm.tsx`
- `eb-dash2/src/hooks/useWeeklyEmailSchedules.ts`
- `docs/CLARA-AGENTE-RELATORIOS.md`

## 2026-07-16 BRT — feat: Clara cruza Meta Ads × CRM por campanha e criativo + schedule diário

A Clara agora consegue analisar campanhas e criativos do Meta Ads usando métricas
comerciais reais do CRM (CPMQL, CPAgendamento, CPReunião, CPV, ROAS, ROAS Caixa),
em vez de apenas descrever CPL e CTR de plataforma.

- Criadas RPCs `get_clara_campaigns_crm` e `get_clara_creatives_crm`
  (`supabase/migrations/20260924000004_clara_crm_cross_tools.sql`).
- Corrigido bug em `get_clara_creatives_crm` onde `creative_code` e
  `creative_name` vinham `NULL` para todos os registros
  (`supabase/migrations/20260924000006_fix_clara_creatives_crm_creative_code.sql`).
- Corrigido cruzamento de campanhas: a primeira versão cruzava
  `campaign_name` do Meta diretamente com `contatos.utm_campaign`, o que nunca
  bate. A versão final usa `utm_campaigns.page_code` (código `PGxx` extraído do
  `ad_name`), igual ao filtro "Campanha [cp]" do painel de Tráfego
  (`supabase/migrations/20260924000008_fix_clara_campaigns_crm_mapping.sql` e
  `20260924000009_fix_clara_campaigns_crm_page_code.sql`).
- Adicionadas tools `get_campaigns_crm` e `get_creatives_crm` em
  `supabase/functions/_shared/report-tools.ts`.
- Atualizado o system prompt de `send-weekly-report-email` para instruir a Clara
  a usar obrigatoriamente as tools de cruzamento CRM ao analisar tráfego.
- Adicionado preset "Análise diária de tráfego" em
  `eb-dash2/src/components/relatorios/AutomationForm.tsx`.
- Criado schedule diário para `bruno@aliancadealtovalor.com.br` às 08:00 BRT,
  com prompt obrigando análise autônoma e cruzada
  (`supabase/migrations/20260924000007_seed_daily_traffic_analysis_schedule.sql`).
- Teste E2E Playwright novo:
  `eb-dash2/tests/clara-daily-traffic-report.spec.ts` — valida que o schedule
  existe, está ativo, permite envio de teste e o preset preenche o formulário.

Verificação em produção:
- `get_clara_campaigns_crm` retornou breakdown por campanha com métricas CRM
  reais (ex: `[cp] maquina-conteudo-online-07-26` — spend R$ 4.393,41,
  203 leads CRM, 10 MQLs, 3 agendamentos, 3 reuniões, CPMQL R$ 439,34).
- `get_clara_creatives_crm` retornou `creative_code` e `creative_name` corretos
  (ex: `CR-1154` / "AD 02 MAQUINA", `CR-836` / "[Pedro] Headline 1...").
- Email de teste enviado com sucesso para `bruno@aliancadealtovalor.com.br`
  (log `status: sent`).
- Playwright: **2/2 passed**.

Documentação atualizada em `docs/CLARA-AGENTE-RELATORIOS.md`.

## 2026-07-16 BRT — feat: isolamento multi-tenant completo do Meta Ads

Fechados todos os gaps arquiteturais de isolamento Meta Ads identificados na
auditoria do dia:

- Criada tabela `workspace_meta_ad_accounts` (mapeamento formal conta Meta ↔
  workspace) com seed do workspace Default → `act_716772443330289`.
- Ajustadas constraints `UNIQUE` para incluir `workspace_id` em
  `meta_ads_insights`, `meta_ads_insights_breakdowns` e `meta_ads_campaigns`.
- `NOT NULL` aplicado em `workspace_id` em `meta_ads_raw_insights`,
  `meta_ads_insights_breakdowns`, `meta_ads_campaigns` e `meta_ads_account_daily`.
- Policies RLS apertadas — removida a cláusula `OR workspace_id IS NULL` das
  tabelas Meta Ads.
- Edge functions `sync-meta-ads` e `sync-meta-ads-backfill` validam que a
  `account_id` da credencial está cadastrada para o workspace antes de sincronizar.
- Triggers `BEFORE INSERT OR UPDATE` em `meta_ads_insights`,
  `meta_ads_raw_insights`, `meta_ads_account_daily` e `meta_ads_campaigns`
  rejeitam dados cuja conta não esteja vinculada ao workspace.
- Teste A→B novo: `__tests__/integration/meta-ads-isolation.test.ts` (8 testes).
- Suite de integração completa: **536 passed**.

Migrations:
- `20260924000000_fix_meta_ads_tenant_isolation.sql`
- `20260924000001_add_meta_ads_account_workspace_trigger.sql`
- `20260924000002_fix_meta_ads_raw_trigger_account.sql`
- `20260924000003_meta_ads_backfill_null_account_fallback.sql`

Aplicação em produção concluída em 2026-07-16:
- Auditoria da seção 5 de `docs/META-ADS-ISOLAMENTO-AUDITORIA.md` retornou 0
  NULLs, 0 duplicatas e 0 account_ids órfãos.
- Edge functions `sync-meta-ads` (v37) e `sync-meta-ads-backfill` (v31)
  re-deployadas em produção.
- Teste Playwright E2E novo: `eb-dash2/tests/meta-ads-isolamento.spec.ts`
  (usuário de teste) validou investimento Meta Ads > R$ 0 no dashboard.
- Email de teste da Clara enviado com sucesso via `clara-research-report`
  (`message_id: 6d7c9e01-bd7b-4575-ad8b-1a39f0f6af6b`) com análise autônoma
  cruzando investimento, MQLs, CPMQL, campanhas e criativos.
- Runbook de produção adicionado em
  `docs/META-ADS-ISOLAMENTO-PRODUCAO.md`.

## 2026-07-16 BRT — fix: backfill emergencial de workspace_id em Meta Ads e correção de benchmarks da Clara

Descoberto que 9.842 linhas (94%) de `meta_ads_insights` estavam com
`workspace_id IS NULL`, fazendo o investimento Meta Ads aparecer como zero nos
snapshots cohort de semanas anteriores. Isso distorcia CPMQL, ROAS e benchmarks
usados pela Clara: o CPMQL médio histórico estava em R$ 3,79, valor totalmente
fora da realidade.

Ações:
- Migration `20260716000002_backfill_meta_ads_workspace_id.sql` preencheu as
  linhas órfãs com o workspace Default (`7909d02a-4d15-46ea-a7b8-5debeb6e8351`)
  e tornou `workspace_id` `NOT NULL` em `meta_ads_insights`.
- Reprocessadas 26 semanas cohort de tráfego via `compute-weekly-reports`.
- Benchmark corrigido: CPMQL médio histórico de R$ 3,79 → R$ 82,39.
- Email de teste reenviado para `bruno@aliancadealtovalor.com.br` com os
  números corrigidos, usando `qwen/qwen3.6-plus`.

Gaps arquiteturais documentados em `docs/META-ADS-ISOLAMENTO-AUDITORIA.md`:
falta tabela `workspace_meta_ad_accounts`, constraints `UNIQUE` sem
`workspace_id`, policies RLS ainda permitem `workspace_id IS NULL`, e o sync
pode sobrescrever workspace via `COALESCE(EXCLUDED.workspace_id, ...)`. Antes
de conectar novas contas Meta, esses gaps devem ser fechados.

## 2026-07-15 BRT — fix: incidente webhooks GHL parados (leads não contabilizados)

Pipeline GHL 100% parado por ~30h (14/07 13:00 UTC → 15/07 16:00 UTC) após o
deploy do pacote multi-tenant. Três causas combinadas: webhook_secret do
workspace Default diferente do que os workflows enviam (1.502 eventos em
quarentena), credencial GHL do Default nunca seedada no Vault (syncs no-op),
e `extrair_dados_ghl_v2` lendo location só no formato flat enquanto 99% dos
payloads usam `location.id` aninhado (evento perdido em silêncio por nome
NULL). Correções: segredo correto gravado (verificado por hash), credencial
seedada via UI, migrations `20260906000000` (helper
`ghl_payload_location_id`) e `20260907000000` (fallback de nome — contatos
sem nome voltam a ser contados, restaurando comportamento da v1).
Quarentena reprocessada: 1.502/1.502. Detalhes completos e lições em
`docs/INCIDENTE-WEBHOOKS-PARADOS-2026-07-14.md`.

## 2026-07-14 BRT — docs: migra guias operacionais para OMNX

Os guias de design, tags, Notion, PRD e referências operacionais passaram a
usar OMNX. Dados, relatórios e handoffs históricos permanecem inalterados para
preservar rastreabilidade; domínio e headers OpenRouter seguem pendentes da
definição oficial de identidade pública.

## 2026-07-14 BRT — test: protege a identidade pública OMNX

Foi adicionado um teste automatizado que verifica o HTML, manifest e fontes
distribuídos do frontend. Ele bloqueia a reintrodução de nome, domínio ou
favicon legados, sem confundir tokens técnicos internos com marca visível.

## 2026-07-14 BRT — feat: conclui metadados públicos da OMNX

O HTML deixou de apontar para o favicon legado. A inicialização do frontend usa
a arte oficial OMNX no favicon e o novo `manifest.webmanifest` define nome,
cor e idioma públicos da plataforma.

## 2026-07-14 BRT — fix: mantém menus dentro da viewport

O dropdown agora calcula a altura disponível no lado onde será aberto e limita
o menu a esse espaço, com rolagem interna e contenção de overscroll. Isso cobre
o seletor de apps e qualquer outro uso do componente compartilhado.

## 2026-07-14 BRT — docs: registra correção do menu de apps

Registrado no roadmap o defeito visual em que o seletor de apps abre para fora
da tela e deixa itens inacessíveis. A correção deverá considerar espaço acima e
abaixo do gatilho, altura máxima e rolagem interna do menu.

## 2026-07-14 BRT — fix: torna rolável o painel de contato

O drawer do LeadCard passou a rolar como uma única área. Antes, um cabeçalho
com muitas tags consumia a altura disponível e empurrava as abas para fora da
tela. Agora cabeçalho, métricas, abas e conteúdo permanecem acessíveis em
qualquer altura de viewport.

## 2026-07-14 BRT — feat: aplica profundidade configurada ao chat da Clara

O chat passa a adaptar a instrução de resposta para modo objetivo, padrão ou
detalhado, sempre lida da configuração do próprio `workspace_id`. Com isso os
limites operacionais expostos na aba de Relatórios já têm efeito nos fluxos de
chat e síntese semanal, exceto o expurgo físico de conversas, que exige rotina
de retenção separada.

## 2026-07-14 BRT — feat: completa controles da configuração da Clara

A aba de Relatórios agora permite cadastrar instruções para relatórios
automáticos, profundidade de análise, módulos e ferramentas permitidas, além
dos limites já existentes. A allowlist de ferramentas já restringe o chat;
módulos e profundidade são persistidos para aplicação progressiva pelos
executores, sem alterar o comportamento fora dessa regra explícita.

## 2026-07-14 BRT — feat: aplica configuração da Clara aos relatórios automáticos

O resumo semanal agora lê as instruções globais da mesma conta antes de chamar a
Clara. Conta desativada não gera síntese, e o limite de resposta respeita a
preferência por `workspace_id`, sem misturar configuração entre agendamentos.

## 2026-07-14 BRT — feat: aplica configurações da conta no chat da Clara

`bot-chat` agora lê as preferências da própria conta antes de chamar a IA:
desativação bloqueia o uso, contexto/instruções/regras entram no prompt, o
limite controla `max_tokens` e a allowlist reduz as ferramentas disponíveis.
Um teste estrutural protege RLS, validação owner/admin e a política Qwen.

## 2026-07-14 BRT — docs: explicita publicação pendente da Clara

O roadmap agora separa claramente o código pronto da ativação remota: a
migration `20260901000000_create_clara_workspace_settings.sql` deve ser aplicada
em teste/staging antes de produção, e `clara-settings` só pode ser publicada
depois dela. Ambos os passos exigem teste com owner/admin e member.

## 2026-07-14 BRT — feat: cria aba de configuração da Clara em Relatórios

Owner e admin agora têm a aba **Configurar Clara** em Relatórios, com estado
inicial claro, contexto/instruções persistentes, limites operacionais, catálogo
sanitizado de modelos e histórico de alterações. Membros não veem a aba; a API
mantém a mesma regra server-side. A entrega requer a migration e Edge Function
publicadas antes de ficar disponível no ambiente remoto.

## 2026-07-14 BRT — feat: adiciona API segura de configurações da Clara

A Edge Function `clara-settings` valida JWT, membership ativa e papel
owner/admin antes de ler, salvar ou auditar qualquer configuração. Ela consulta
o catálogo da OpenRouter com a chave BYOK da própria conta e entrega somente
nome, contexto e preço sanitizados, sem nunca retornar segredo ou resposta bruta.

## 2026-07-14 BRT — feat: funda configurações isoladas da Clara

Criadas as tabelas versionadas de preferências e auditoria da Clara por
`workspace_id`. RLS limita a leitura a owner/admin e somente a camada server-side
gerencia alterações. A migration não armazena segredo e fixa
`qwen/qwen3.6-plus` como modelo permitido até uma revisão explícita da política.

## 2026-07-14 BRT — feat: conclui textos públicos da marca OMNX

O e-mail de convite agora usa OMNX como remetente e no corpo da mensagem. A
varredura de runtime confirmou que não restam referências públicas a Acelerador
de Audiência, Empire ou Empire Business; nomes técnicos e registros históricos
foram preservados para não quebrar compatibilidade nem apagar contexto.

## 2026-07-14 BRT — feat: aplica logos oficiais OMNX no frontend

O componente de marca passou a usar as artes oficiais clara e escura, com
troca automática pelo tema. Login agora mostra exclusivamente a logo, sem
nome ou descrição visual adicional. Cabeçalhos administrativos deixaram de
repetir o nome que já está na imagem, e o título da aba foi atualizado para
OMNX.

## 2026-07-14 BRT — docs: requisito de logos oficiais OMNX

O roadmap agora determina que toda a interface use as artes oficiais em
`images/logo omnx /fundo claro.png` e `images/logo omnx /fundo escuro.png`.
Na autenticação, a marca deve aparecer exclusivamente como a imagem da nova
logo: sem wordmark, nome da plataforma ou outro texto visual de marca.

## 2026-07-14 BRT — feat: inicia BYOK OpenRouter por workspace

Primeira fatia do isolamento de IA: a RPC BYOK passa a aceitar `openrouter` e
o assistente de mapeamento GHL resolve a chave no Vault pelo `workspace_id`,
sem fallback para a variável global. Sem chave própria, retorna instrução para
o admin configurar a integração. A tela de cadastro e a migração de
Pré-Vendas foram entregues nesta fase; Clara permanece deliberadamente fora
desta mudança até ganhar isolamento de conversas por workspace.

## 2026-07-14 BRT — fix: publica assistente IA de mapeamento GHL

O assistente aparecia no frontend, mas a Edge Function `ai-ghl-mapping` nunca
tinha sido publicada no projeto de produção. Por isso a classificação retornava
"Failed to send a request to the Edge Function". A função foi publicada como
versão 1 após validação Deno, testes e gate de segurança `PASS`.

Também foi corrigido o tratamento de falhas: o frontend agora mostra mensagens
seguras retornadas pela função, enquanto erros inesperados não expõem detalhes
internos. Verificação externa pós-deploy: endpoint ativo e chamada sem JWT
recusada corretamente com HTTP 401.

## 2026-07-14 BRT — feat: assistente IA do GHL passa a classificar um campo por vez

O assistente deixou de pedir que a pessoa descrevesse toda a configuração do
GHL antes de saber quais campos existem. Agora ele começa por **Detectar campos
no GHL**, mostra uma lista simples dos campos ainda pendentes, pede a explicação
de um campo escolhido e apresenta uma sugestão única para revisão.

A edge function agora exige um `target` validado contra a discovery. Mesmo que o
modelo tente devolver campos, pipelines ou stages extras, o servidor descarta
tudo que não seja a chave escolhida e uma categoria permitida. Pipelines e
stages seguem no modo avançado nesta versão.

Validação: teste unitário da contenção da proposta, build do frontend e checks
estáticos (registrados no commit desta mudança).

## 2026-07-14 BRT — fix: wizard de mapeamento GHL compreensível para usuários não técnicos

O reteste do burn-in revelou que o modo avançado ainda expunha nomes internos
como `full_name` e que os menus de seleção podiam ser cortados pelo card do
wizard. A decisão de mapeamento ficou mais clara: a interface agora apresenta
nomes como **Nome completo**, esconde códigos atrás de "Ver código técnico" e
usa o texto "Usar este campo como". Os cards das três etapas com seletores
permitem que o menu ultrapasse seus limites visuais, eliminando o corte.

O fluxo recomendado para usuários sem familiaridade técnica permanece o
**Assistente IA**. O modo avançado agora serve para ajustar um detalhe, não
para obrigar a pessoa a interpretar identificadores do sistema.

Validação: `src/lib/ghl-mapping.test.ts` (3 testes), `npm run build` e
`git diff --check`.

## 2026-07-14 BRT — deploy: promove data_conectado (bug fix crítico) + campos extras para produção

Aplicadas em produção (`qzesffnkqgelmtfblzkr`), na mesma janela, conforme
decisão do dono: `20260821000000` (fix crítico de `data_conectado` — 321/2.251
oportunidades abertas afetadas, segurado fora de produção desde 2026-07-12) e
`20260827000000` (campos extras GHL). Aplicadas via `supabase db push
--include-all` com as migrations deliberadamente excluídas
(`20260819000000`, `20260820000000`, `20260824000000`) movidas para fora do
diretório durante o push e restauradas em seguida.

Verificação pós-aplicação (leitura): `extrair_dados_ghl_v2` confirmado com a
versão corrigida via `COMMENT ON FUNCTION`; proxy de oportunidades com tag
"conectado" e `data_conectado NULL` em 337/2.309 (~14,6%, estável frente aos
321/2.251 medidos antes — o backfill cirúrgico só alcança oportunidades cujo
último webhook conhecido resolve o campo; o ganho real é sobre webhooks
novos a partir de agora, já protegidos pelo `COALESCE`).

Ver `docs/BUG-FIX-LEADS-CONECTADOS.md` e `docs/GHL-CAMPOS-EXTRAS.md`.

## 2026-07-14 BRT — feat: campos extras GHL (reconciliação de campo sem correspondência no vocabulário)

Pergunta real do dono durante o burn-in: "como fica se um campo mapeado pelo
usuário tiver um significado totalmente diferente de tudo que já existe no
sistema?". Investigação mostrou que `apply_ghl_field_mappings()` já era
100% data-driven, mas `extrair_dados_ghl_v2()` extraía uma lista fixa de
`logical_name` para colunas fixas — qualquer campo fora dessa lista era
descartado em silêncio, mesmo já mapeado. `contatos.custom_fields jsonb`
existia desde a Fase 6 mas nunca era escrita por nenhum fluxo.

Solução: prefixo reservado `extra.` em `logical_name` (`buildExtraFieldLogicalName`
em `ghl-mapping.ts`), novo helper SQL `extract_ghl_extra_fields()` que grava
esses campos em `contatos.custom_fields`, e exibição passiva (só leitura) na
aba Dados do LeadCard — decisão explícita do dono: "por hora pode apenas
exibir no card do lead, adicionar funções pra eles é arriscado". Nunca entra
em métrica, funil ou cálculo.

**Dependência importante:** a migration usa como base o corpo de
`20260821000000` (bug fix crítico de `data_conectado`, ver
`docs/BUG-FIX-LEADS-CONECTADOS.md`), que estava aplicado no banco de teste
mas segurado fora de produção. Decisão do dono: promover as duas juntas.
Em produção, `20260821000000` precisa ser aplicada antes ou junto de
`20260827000000`, nunca depois.

Migration `20260827000000_add_ghl_extra_fields_extraction.sql`. Testes novos:
`__tests__/integration/ghl-extra-fields.test.ts` (4 provas). Doc completa:
`docs/GHL-CAMPOS-EXTRAS.md`. Suite completa 475/475, sem regressão.

## 2026-07-14 BRT — fix: discover-ghl-config esconde erros reais em respostas não-2xx

Achado real testando o burn-in com uma conta GHL de teste: a function
devolvia HTTP `502` quando nenhum dos 7 endpoints retornava itens — mas uma
conta nova/vazia é sucesso válido (0 itens), não erro. Pior: o `supabase-js`
descarta o corpo da resposta em qualquer status não-2xx, então as mensagens
de erro reais por endpoint (achadas depois direto na tabela
`ghl_discovery_runs`) nunca chegavam ao usuário — só um erro genérico
"Edge Function returned a non-2xx status code".

Corrigido: `httpStatus` sempre `200`; o status geral (`success`/`partial`/
`error`) agora é calculado por quantos dos 7 endpoints **responderam** com
sucesso (`succeededSources`), não por quantos itens vieram. `error` só
ocorre se literalmente nenhum endpoint respondeu. `useGhlDiscovery.ts` já
sabia interpretar os três estados — só precisava receber o corpo de
verdade.

Bônus: `useGhlMappingAlerts.ts` tratava 404 de `ghl_mapping_change_alerts`
(tabela de uma feature deliberadamente não promovida a produção,
`docs/GHL-MAPEAMENTO-VIGILANCIA.md`) como erro, gerando retries e ruído no
console a cada carregamento da página. Agora trata "tabela ausente"
(`PGRST205`/`42P01`) como "sem alertas".

## 2026-07-14 BRT — security: restringe leitura de ghl_integration_settings a owner/admin

Achado ao auditar a consolidação da conexão GHL (não introduzido por ela):
a policy `"ghl_integration_settings: members can read"` permitia que
qualquer membro ativo do workspace, não só owner/admin, lesse
`webhook_secret` em texto plano. Corrigido no mesmo lote — migration
`20260826000000` restringe o SELECT a owner/admin. Validado com 2 testes
novos + suite completa 471/471, sem regressão.

## 2026-07-14 BRT — feat: consolida a conexão GHL numa página só (fim da dessincronia de location_id)

Achado real ao testar o burn-in: existiam duas telas e duas fontes de verdade
para "GHL está conectado" (`workspace_integration_credentials` via BYOK/Vault
vs `ghl_integration_settings` via um formulário antigo pré-BYOK), sem
sincronia entre elas — um workspace podia ficar com um preenchido e o outro
não, e o card de status da Admin tinha checkboxes decorativos que não
refletiam a credencial real.

Migration `20260825000000`: `save_workspace_credential` agora sincroniza
`ghl_integration_settings.ghl_location_id` na mesma transação quando
`provider='ghl'` — fonte única de verdade, e impossível dois workspaces
ativos com o mesmo `location_id` (a credencial inteira falha se houver
conflito). Validado com 469/469 na suite de integração completa (+5 testes
novos) contra o banco de teste, sem regressão.

Frontend: `/workspace/ghl-config` vira o único ponto de entrada — Passo 1
(chave + Location ID, BYOK real) libera o Passo 2 (mapeamento de campos).
`GhlStatusCard` na Admin lê o status real da credencial em vez de checkboxes
decorativos. `/workspace/integracoes` fica só para Meta Ads; menu lateral
renomeado ("Conectar GHL" / "Meta Ads") para eliminar a ambiguidade entre
"Chaves de API" e "Integração GHL". Detalhe completo em
`docs/GHL-CONFIG-UI.md`.

## 2026-07-14 BRT — fix: WorkspaceSelector ausente em AdminLayout e WorkspaceLayout

Testando o burn-in de verdade em produção, o fix anterior (mostrar o
seletor para owner/admin de agência) se mostrou insuficiente: o
componente nunca esteve montado em nenhum lugar além de
`DashboardLayout`. As telas de Administração (`/admin/*`) e
Configurações do Workspace (`/workspace/*`, incluindo
`/workspace/integracoes`, onde o BYOK acontece) usam `AdminLayout` e
`WorkspaceLayout` — layouts separados que nunca importavam o
componente. Adicionado `<WorkspaceSelector />` ao header dos dois.
Sem lógica nova, mesma condição de visibilidade já corrigida.

## 2026-07-14 BRT — feat: exibe seletor de workspace para owner/admin de agência

O burn-in do primeiro tenant expôs um gap real de UX: o Single-Tenant Lock
escondia o `WorkspaceSelector` incondicionalmente, sem nenhum caminho de UI
para quem já é owner/admin de agência trocar de sub-conta (só via
`localStorage` manual). `WorkspaceSelector.tsx` agora usa a função
`resolveTenancyMode()` (já existente e testada desde a Fase 1) para mostrar
o seletor quando o usuário é classificado como `multi-tenant`, mantendo o
lock intacto para o cliente comum. Sem mudança de RLS/permissão — só
exposição de um acesso que já existia via `can_access_workspace_via_agency`.

## 2026-07-14 BRT — feat: burn-in em produção iniciado (agência OMNX + subconta interna)

Com autorização explícita do dono, os passos 1 e 2 do burn-in (seção 7.7 do
`docs/ROADMAP-MULTI-TENANT.md`) foram executados em produção
(`qzesffnkqgelmtfblzkr`). A agência `OMNX` foi criada via RPC
`create_agency_for_owner_service_role` (chamada por API REST, nunca SQL
direto), e o workspace `Burn-in Interno` foi provisionado via
`provision-new-client.ts --mode=agency-subaccount --execute`, vinculado à
agência com `status=pending` (sem `location_id` — BYOK fica para o dono
conectar depois via `/workspace/integracoes`).

## 2026-07-14 BRT — fix: corrige paginação de listUsers no lookup de owner existente

`scripts/provision-new-client.ts` buscava o usuário owner existente via
`auth.admin.listUsers({page:1, perPage:10})`, olhando só os 10 usuários mais
recentes. Achado real ao preparar o burn-in: a instância de produção já tem
28 usuários e o dono da agência é o mais antigo — nunca seria encontrado,
levando o script a tentar criar um usuário duplicado em vez de reaproveitar
o existente. Corrigido com paginação em loop (blocos de 200) até encontrar
o e-mail ou esgotar a lista. Validado com dry-run real contra produção antes
e depois do fix.

## 2026-07-14 BRT — docs: handoff completo do rollout multi-tenant

`docs/ROADMAP-MULTI-TENANT.md` agora contém uma foto operacional detalhada
para continuidade por outra IA: ambientes, migrations aplicadas/excluídas,
19 Edge Functions confirmadas, evidência do gate de segurança, estado do
worktree, arquitetura que não pode regredir, passos do burn-in, pendências
classificadas e proibições de rollout. A continuação segura começa no burn-in
interno e exige nova autorização explícita antes de criar dados em produção.

## 2026-07-14 BRT — feat: Edge Functions multi-tenant publicadas em produção

Com autorização explícita do dono e `security-report/verdict.json` em
`gate: PASS`, o lote controlado publicou as 19 Edge Functions no projeto
`qzesffnkqgelmtfblzkr`. A consulta posterior confirmou **19/19** presentes,
incluindo `discover-agency-locations` e `test-workspace-credential`, antes
ausentes, e as atualizações de `ghl-api-worker` e `webhook-ghl`. Nenhuma
migration, dado ou segredo foi alterado nesta operação. O próximo gate é o
burn-in de uma subconta interna antes de liberar cliente pago.

## 2026-07-14 BRT — docs: bloqueio restante para ativação multi-tenant

O inventário remoto do Supabase confirmou que migrations e schema estão em dia,
mas migrations não publicam Edge Functions. `discover-agency-locations` e
`test-workspace-credential` não existem em produção; `ghl-api-worker` e
`webhook-ghl` estão em versões anteriores às mudanças multi-tenant. O roadmap
passou a exigir auditoria nova com `gate: PASS`, deploy controlado das functions
por tenant e burn-in de uma subconta interna antes de qualquer cliente pago.
O cutover da chave legada do workspace atual para Vault foi corrigido no texto:
ele é opcional e não bloqueia o primeiro tenant adicional.

## 2026-07-14 BRT — chore: lote controlado de Edge Functions preparado

Criado `scripts/deploy-multi-tenant-functions.sh` com o lote fechado de 19
functions multi-tenant. Sem `--execute`, ele somente valida e lista o lote;
com `--execute`, ele exige o verdict de segurança PASS do dia em BRT e publica
uma function por vez, interrompendo na primeira falha. Nenhuma function foi
publicada nesta preparação. O procedimento operacional está em
`docs/DEPLOY-EDGE-FUNCTIONS-MULTI-TENANT.md`.

## 2026-07-14 BRT — security: gate do deploy de Edge Functions bloqueado

A auditoria atual do lote encontrou `vitest@1.6.1` com advisory crítico e Vite
transitivo com advisory alto. Como a correção disponível atualiza Vitest em
versão major, nenhuma dependência foi alterada automaticamente. O
`security-report/verdict.json` foi marcado como `gate: FAIL`; o deploy das
19 Edge Functions permanece bloqueado até atualização, testes e reauditoria.

## 2026-07-14 BRT — fix: atualizar Vitest e remover gate de dependências

Com autorização explícita, `vitest` foi atualizado de `1.6.1` para `4.1.10`
via instalação com `--ignore-scripts`; a cadeia vulnerável de Vite 5 foi
removida do lockfile. O build passou, as quatro suites críticas passaram em
83/83 e `npm audit --audit-level=high` retornou 0 vulnerabilidades. A
reauditoria atualizou `security-report/verdict.json` para `gate: PASS`; nenhum
deploy de Edge Function foi executado nesta etapa.

## 2026-07-13 BRT — chore: rollout controlado multi-tenant aplicado em produção

Com autorização explícita do dono, PITR de 7 dias ativo e
`security-report/verdict.json` em `gate: PASS`, foram promovidas as **34
migrations multi-tenant aprovadas** ao projeto de produção
`qzesffnkqgelmtfblzkr`. O fluxo usou exclusivamente
`scripts/build-multi-tenant-release-bundle.sh` e `supabase db push`, nunca SQL
manual: grupo A (16), B (12), C (4) e D (2), cada qual precedido por dry-run.

O histórico remoto final confirma `20260720000000`–`20260818000000` e
`20260822000000`/`20260823000000`. Permanecem fora de produção
`20260819000000`, `20260820000000`, `20260821000000` e `20260824000000`.
Isto conclui a promoção de schema/RLS; antes de uma segunda sub-conta paga,
ainda é obrigatório o burn-in de um tenant interno e o cutover das credenciais
por workspace no Vault. A regeneração remota de tipos (`supabase gen types
typescript --linked`) concluiu com 9.253 linhas; o projeto não versiona esse
arquivo de tipos, portanto não houve arquivo de código adicional para atualizar.

## 2026-07-13 BRT — chore: bundle seletivo de release multi-tenant validado

O Supabase CLI não possui filtro de migrations pendentes; o `db push` do
repositório principal tentaria publicar 38 arquivos, inclusive itens fora de
escopo. Foi criado `scripts/build-multi-tenant-release-bundle.sh`, que monta
fora do repositório um bundle efêmero com o histórico remoto e apenas as
migrations aprovadas, verificadas por SHA-256.

O dry-run na produção confirmou o grupo A com 16 migrations exatas e o bundle
completo com 34 migrations exatas. As quatro exclusões não apareceram. Esta
validação antecedeu a aplicação controlada registrada acima.

## 2026-07-13 BRT — chore: histórico de baselines reconciliado em produção

Com autorização explícita do dono, `supabase migration repair --status applied
--linked 20260218000000 20260710000000` marcou os dois baselines *squash* como
já registrados no histórico remoto. A operação não executa os SQLs das
migrations e não alterou tabelas, dados, Edge Functions ou credenciais.

O dry-run seguinte terminou normalmente, mas listou 38 migrations: além do
lote multi-tenant, inclui migrations exclusivas do teste, uma correção
funcional independente e a remoção OpenClaw. Por isso o `supabase db push`
integral continua bloqueado; o próximo artefato é um manifesto de release
faseado que exclua explicitamente esses itens fora de escopo.

O manifesto foi criado em `docs/MANIFESTO-RELEASE-MULTI-TENANT.md`, com quatro
grupos de promoção e smoke obrigatório entre grupos. Ele registra o bloqueio
real do CLI: não há filtro seguro para enviar só parte da fila por `db push`.

## 2026-07-13 BRT — docs: bloqueio real de promoção automática em produção

A leitura de `supabase migration list --linked` em produção confirmou que o
histórico remoto termina em `20260713170448`. O CLI também listou baselines,
migrations exclusivas de teste e releases independentes como pendentes; por
isso `supabase db push` direto foi explicitamente vetado. Nenhuma migration
nem Edge Function foi aplicada. O rollout precisa de uma estratégia dedicada
para promover somente o lote multi-tenant versionado.

O dry-run posterior confirmou que os dois baselines são o bloqueio imediato:
o CLI solicitou `--include-all` para inseri-los antes da última migration
remota. A flag não foi usada.

## 2026-07-13 BRT — chore: PR #47 mergeada em `main`

A PR #47 foi mergeada após o gate de segurança `PASS` e a prévia Vercel verde.
O merge entrega código, migrations versionadas e testes ao repositório, mas não
executa migrations nem faz deploy manual das Edge Functions no Supabase. O
Vercel publicou automaticamente o frontend de `main` com sucesso.

## 2026-07-13 BRT — chore: conflito da PR #47 resolvido

A branch da PR #47 foi atualizada com a `main` atual; os conflitos eram somente
em documentação e no registro de auditoria. A PR ficou mesclável e a prévia do
Vercel foi aprovada. Nenhum merge em `main` ou deploy de produção foi feito.

## 2026-07-13 BRT — chore: PR #47 aberta para hardening multi-tenant

A entrega de migrations, sanitização de erros, testes e evidências do staging
foi enviada para a PR #47 (`fix/multi-tenant-staging-hardening` → `main`).
Ela não faz deploy nem aplica migrations por si só. Os relatórios pessoais em
`analises/` ficaram deliberadamente fora da PR.

## 2026-07-13 BRT — test: prova completa da adoção reversível no staging

O teste de adoção em `2-staging` passou novamente com uma credencial GHL
sintética: confirmação incorreta recusada, manifesto de dados antes/depois
inalterado (exceto horário de geração), vínculo idempotente, credencial
preservada e detach sem remover workspace ou membership. Junto das suítes de
credenciais e privilégios, foram **47/47** testes críticos aprovados. Toda a
massa foi temporária e removida; produção não foi acessada para escrita.

## 2026-07-13 BRT — test: ensaio multi-tenant aprovado em staging restaurado

No projeto `2-staging`, o histórico de migrations ficou em paridade até
`20260823000000`, incluindo as correções de rollout `20260721120000` e
`20260802500000`. As provas reais passaram: adoção reversível 3/3,
isolamento de credenciais 39/39 e prevenção de escalada de privilégio 5/5.
Produção não recebeu migrations, dados ou deploys nesta sessão.

Tentativa de regenerar tipos por conexão direta exigiu Docker local; a geração
remota pelo `project-id` respondeu `502`. O frontend não mantém arquivo de tipos
Supabase versionado hoje, portanto não houve alteração de código nem bloqueio do
ensaio de staging.

## 2026-07-13 BRT — fix: não bloquear exclusão de workspace por auditoria em cascata

A exclusão de um workspace acionava DELETEs em cascata nas tabelas de permissões.
Os triggers tentavam inserir um evento em `permission_audit_log` depois que o
workspace já não existia, violando a FK e abortando toda a exclusão. A migration
`20260802500000_fix_permission_audit_cascade_delete.sql` preserva a auditoria
para operações normais e ignora exclusivamente o DELETE em cascata pós-exclusão.

## 2026-07-13 BRT — chore: rollout em staging interrompido por deadlock seguro

Na cópia `2-staging`, as migrations multi-tenant foram aplicadas até
`20260802000000`. A próxima migration, `20260803000000`, tentou acrescentar
`workspace_id` às tabelas CRM e encontrou um deadlock com uma leitura concorrente
em `comunicacoes`. O PostgreSQL desfez essa migration integralmente; nenhum dado
ou schema parcial ficou gravado. Próxima ação: reiniciar **apenas** a cópia de
staging para encerrar a conexão concorrente e repetir o lote restante.

## 2026-07-13 BRT — fix: completar RLS de agência para totais Meta Ads

O primeiro ensaio do pacote multi-tenant na cópia `2-staging` aplicou as fases
iniciais e parou no guard de cobertura da migration de retrofit: a tabela
`meta_ads_account_daily` tinha policy por workspace, mas não a via explícita de
agência. A migration versionada
`20260721120000_fix_agency_rls_meta_ads_account_daily.sql` cria somente a
policy de `SELECT` para admin/owner da agência da subconta ativa. Não há mudança
de dados nem acesso a subconta suspensa/outra agência.

## 2026-07-13 BRT — docs: histórico da cópia de staging conferido

Com a conexão local da cópia `2-staging`, foi feita somente a leitura de
`supabase migration list`. O histórico remoto coincide com produção até
`20260713170448`; os dois baselines *squash* estão somente no repositório,
pois o restore já contém sua estrutura. O lote multi-tenant está pendente e
nenhuma migration foi aplicada nesta etapa.

## 2026-07-13 BRT — chore: cópia isolada de staging pronta para reconciliação

Criada a cópia `2-staging` (`suhkxlgnzcriigwrzjkh`) por **Restore to new project**
do Supabase. A URL e as chaves dessa cópia ficaram somente em
`.env.staging.local`, separado e ignorado pelo Git; nenhuma credencial foi
registrada no repositório. A API respondeu normalmente. Falta exclusivamente a
`TEST_DB_URL` da cópia para inspecionar o histórico e aplicar as migrations
reconciliadas. Produção permaneceu sem alteração.

## 2026-07-13 BRT — chore: staging vazio preservado após dry-run de migrations

Validado o novo staging `raquxboahgebposgttnb` com o guard de ambiente separado;
o ensaio de adoção parou corretamente porque não havia tabela `workspaces`. O
`supabase db push --dry-run` listou centenas de migrations, incluindo os
baselines *squash*, portanto nenhuma migration foi aplicada. O caminho seguro
continua sendo uma cópia controlada/anonimizada ou bootstrap explicitamente
aprovado — nunca um `db push` integral no banco vazio.

## 2026-07-13 BRT — test: separar configuração de staging do projeto de testes

O executor de integração passou a aceitar somente `TEST_ENV_MODE=test|staging`.
O novo `.env.staging.local` (ignorado pelo Git) mantém URL, chaves e conexão do
staging separados de `.env.test`; documentação atualizada com a origem de cada
valor e a regra de nunca registrar senha da conta Supabase. Nenhuma chave foi
incluída no repositório.

## 2026-07-13 BRT — test: novo ensaio do caminho de adoção multi-tenant

Reexecutado exclusivamente contra o projeto de teste configurado em `.env.test`, sem tocar produção: `adopt-existing-workspace` passou em **3/3** (confirmação errada recusada, adoção idempotente e detach preservando workspace/memberships); `credential-isolation` passou em **39/39** e `workspace-member-privilege-escalation` em **5/5**. A suíte ampla terminou em **438 passed | 10 todo**, sem falhas. O dono também confirmou a ativação de PITR de 7 dias em produção. A prova de dados reais continua pendente de staging e não foi marcada como concluída indevidamente.

## 2026-07-13 BRT — docs: manifesto de liberação do multi-tenant

Consolidado o estado pós-PR #46 e corrigidas referências que ainda diziam que
as PRs #43/#44 aguardavam merge. Novo
`docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md` separa os baselines *squash* das
migrations executáveis, exclui migrations somente de teste e transforma o
rollout em gates verificáveis: PITR, staging/paridade, ensaio reversível de
adoção do workspace existente, auditoria de segurança `PASS` e autorização
explícita. Nenhuma migration, edge function ou dado de produção foi alterado.

## 2026-07-13 BRT — remoção da integração OpenClaw

Por decisão do dono, a migration
`20260824000000_remove_openclaw_integration.sql` remove somente a integração
OpenClaw. Os relatórios semanais por Resend permanecem; a chave inválida em
produção é tratada como pendência operacional separada.

## 2026-07-12 BRT — docs: plano de arquitetura de informação do dashboard (proposta, sem código)

Aplicado o princípio definido pelo dono ("cada aba é dona de uma etapa; fora dela só resultado, dentro
dela mecânica") a todo card/aba/métrica dos 13 módulos do dashboard, via inventário direto do código
(5 varreduras paralelas por hooks/componentes/colunas Supabase). Achados principais: `AppointmentOriginBreakdown`
(agendamentos/reuniões/vendas por IA vs humano) e `AppointmentBalance` (saldo de agendamentos) duplicados em
até 4 módulos (Tráfego, Aquisição, Orgânico, Vendas) quando deveriam existir só em Pré-Vendas; a aba
"Auditoria IA" existe duplicada, literalmente o mesmo componente, em Pré-Vendas e SDR IA; o funil completo
(Leads→MQL→Conectados→Agendados→Reuniões→Fechados) é repetido quase idêntico em Tráfego/Aquisição/Orgânico/Vendas
em vez de cada módulo mostrar só sua etapa; 2 arquivos de código morto encontrados (`prevendas/tabs/GeralTab.tsx`,
`dashboard/tabs/CriativosTab.tsx`, nenhum roteado). Verificado que os filtros cruzados necessários (Canal/Mídia/Funil/Campanha/SDR/Closer)
já existem em Pré-Vendas e Vendas — a consolidação proposta não depende de filtro novo. Sinalizados (não forçados)
os casos onde o princípio não se aplica: Relatórios/Metas são transversais por desenho, a aba "Cami" em Vendas
não se encaixa em nenhuma etapa clara, e as 3 fontes não-unificadas de "quem agendou" (`agendamento_origem`,
tag `[cp] sdr ia`, tag `auto agendou`) são um problema de modelo de dado, não de organização de tela.

Entrega: [`docs/PLANO-ARQUITETURA-INFORMACAO.md`](../docs/PLANO-ARQUITETURA-INFORMACAO.md), com plano de migração
em 5 fases proposto (não implementado). **Aguarda aprovação do dono antes de qualquer mudança de código.**

## 2026-07-12 BRT — fix CRÍTICO: leads conectados contabilizados como não conectados

Corrigida a normalização de chaves de mapeamento GHL e a preservação de
`data_conectado` em atualizações subsequentes. A migration
`20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql` foi
validada no banco de teste; produção permanece sem alteração até autorização
explícita do dono.

## 2026-07-12 BRT — docs: fallback "workspace mais antigo" confirmado ativo em produção (correção já em main, falta deploy)

Investigação (só leitura em produção, `qzesffnkqgelmtfblzkr`) motivada por
preocupação do dono sobre `get_workspace_id_by_ghl_location_id`. Confirmado por
query direta: produção roda a versão antiga da função (fallback "workspace mais
antigo" quando `location_id` não bate) e a edge function `webhook-ghl` em produção
é ainda mais antiga que isso — usa 1 segredo global por todos os tenants, sem
roteamento por `location_id`, sem tabela `webhook_unresolved` (nem existe em
produção). A correção (fail-closed, `RETURN NULL` sem match + dead-letter em
`webhook_unresolved`) já estava mergeada em `main` desde a Fase 2 (fatias 3/4/6),
com 8/8 testes de regressão passando — não foi preciso escrever código novo nesta
sessão, só confirmar e medir.

Medição em produção: dos 240.018 webhooks históricos, 240.017 (99,9996%) têm
`location_id` batendo com o cadastro ativo do único workspace — deploy da correção
não quebraria o cliente atual. Documentado em detalhe em
`docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`. Deploy em si é decisão e
execução do dono, fora do escopo desta investigação.

## 2026-07-11 BRT — docs: mapa de dados pessoais para o DPA (conclui a frente "caça a bugs pós-PR #35")

Item 4/4 (último) da caça a bugs iniciada nesta data. Levantamento técnico completo para o
jurídico redigir o DPA e a política de privacidade: quais dados pessoais o sistema coleta e
onde ficam (lead/CRM, cliente pagante, usuário interno, destinatário de e-mail), por quanto
tempo são retidos (sem TTL automático hoje — só o grace period de 30 dias para exclusão de
workspace), com quem são compartilhados (GHL, Meta Ads, Resend, OpenRouter/IA, Notion,
Telegram, OpenClaw — achado: `prevendas-ai` envia nome de lead à IA terceira sem
anonimização documentada) e como são expurgados (`purge_workspace_data` só por workspace
inteiro — lacuna real: sem RPC de exclusão de titular individual).

Nenhum dado sensível (LGPD art. 5º, II) encontrado estruturado; ressalva sobre campos de
texto livre e gravação de voz sem triagem automática de conteúdo.

Documento completo com 6 pendências para o jurídico decidir em
`docs/MAPA-DADOS-PESSOAIS-DPA.md`. Este é um levantamento técnico, não o DPA em si nem
opinião legal.

Com este item, a frente de 4 itens da caça a bugs pós-PR #35 está concluída: (1) colunas
inexistentes em writes — `webhook-compras` corrigido + guarda estrutural no CI; (2) RLS
permissiva — `webhooks_ghl` corrigido; (3) flakiness da suite — causa real era GRANT
indevido em RPCs sensíveis (não rate-limit), corrigido, com ação manual urgente pendente
para produção; (4) este mapa de dados pessoais.

## 2026-07-11 BRT — fix CRÍTICO: RPCs sensíveis executáveis por anon/authenticated + fix da flakiness da suite

Item 3 da caça a bugs pós-PR #35. Hipótese inicial do dono era rate-limit do Supabase Auth
em runs full-parallel. Investigação revelou causa bem mais séria: 9-18 testes falhavam de
forma **determinística** (mesmo UUID em runs repetidos), não por corrida.

**Causa raiz #1:** funções `SECURITY DEFINER` sensíveis — `get_decrypted_secret` (decifra
segredo/API key), `purge_workspace_data` (expurgo LGPD, apaga workspace inteiro),
`create_agency_for_owner_service_role`, `register_outbound_webhook` — tinham `EXECUTE`
concedido a `anon`/`authenticated` no banco de teste. Como são SECURITY DEFINER, RLS não
protege — o GRANT era a única barreira.

**Causa raiz #2 (a descoberta importante):** todas as migrations de hardening anteriores
usavam `REVOKE ALL ... FROM PUBLIC`. Isso não revoga um `GRANT` feito diretamente a
`anon`/`authenticated` (confirmado via `pg_proc.proacl`: as funções tinham `anon=X` e
`authenticated=X` explícitos, sem entrada de `PUBLIC`) — esse é o padrão de bootstrap do
Supabase para o schema `public`. Ou seja, **o bug se reproduziria mesmo com a migration
aplicada corretamente** — não é só drift de `db push` quebrado (já documentado em
`docs/BASELINE-REPRODUCIBILIDADE.md`). É provável que o mesmo gap exista em produção;
ação manual urgente registrada no doc (produção não foi tocada por esta sessão).

**Corrigido no banco de teste:** migration `20260816000000_fix_reassert_grants_credential_and_admin_rpcs.sql`
(revoga explicitamente de `anon`/`authenticated`, 18 funções). Também reaplicadas 2 migrations
que nunca tinham "pegado" (`get_workspace_id_by_ghl_location_id` com fallback antigo pro
workspace mais antigo; policies de `weekly_email_schedules`/`weekly_email_logs`).

**Defesa em profundidade na suite:** `fileParallelism: false` em
`eb-dash2/vitest.integration.config.ts` (serializa os ~35 arquivos contra o banco
compartilhado) + retry com backoff exponencial em `createTestUser`.

**Resultado:** suite completa 399/399 verde (35/36 arquivos, 1 skip intencional), confirmado
em 4 execuções consecutivas. Detalhes completos e query de verificação para produção em
`docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md`.

## 2026-07-11 BRT — fix: auditoria de RLS permissiva — webhooks_ghl aceitava insert de anon

Item 2 da mesma frente. Classificadas as ~600 policies RLS não-service_role do banco de
teste. Achado real: `public.webhooks_ghl` tinha policy de INSERT para `anon` com
`WITH CHECK (true)` — qualquer requisição não autenticada com a anon key podia inserir
direto via PostgREST (`POST /rest/v1/webhooks_ghl`), contornando por completo a validação
de `webhook_secret` por workspace da edge function `webhook-ghl`, e disparando o mesmo
trigger que processa webhooks legítimos (forjar contato/oportunidade sem nenhum segredo).
Confirmado sem uso legítimo (única escrita real é a edge function, via service_role).

Corrigido via migration `20260817000000_fix_webhooks_ghl_remove_anon_insert.sql`. Teste novo
`__tests__/integration/permissive-grants-audit.test.ts` prova (ação real contra o banco, não
grep) que `anon` é recusado tanto nesse insert quanto nas RPCs sensíveis do Item 3.

Demais policies revisadas (ai_doc_chunks, ai_doc_index_status, ghl_field_mapping_templates,
app_config, creative_comments/test_criteria/tests, metas, maquina_de_conteudo) classificadas
como intencionais-e-seguras — detalhamento e justificativa de cada uma em
`docs/FIX-FLAKINESS-SUITE-ISOLAMENTO.md` (mesma investigação) e no corpo desta PR.

## 2026-07-11 BRT — fix: webhook-compras (Hotmart) upsert em colunas inexistentes + guarda estrutural no CI

Nova frente de trabalho: caça sistemática a bugs da mesma família da PR #35 (`sync-ad-permalinks`
fazia upsert numa coluna inexistente, quebrado 100% silencioso). Extraído o schema real do banco
de teste (133 tabelas via `information_schema.columns`, sem depender de migrations — que já
divergem do schema real, ver `docs/BASELINE-REPRODUCIBILIDADE.md`) e varridas as 43 edge functions
mais as funções/triggers PL/pgSQL "vivas".

**Achado real:** `webhook-compras/index.ts` (`parseCompra()`) construía um payload com 14 colunas
que nunca existiram em `maquina_de_conteudo` (`hotmart_event_id`, `data_evento`,
`comprador_documento`, `comprador_pais`, `comprador_cidade`, `comprador_cep`, `produto_ucode`,
`valor_total`, `comissao_produtor`, `comissao_marketplace`, `afiliado_nome`, `afiliado_codigo`,
`pais_compra`, `modelo_negocio`). Desde a introdução da function (commit `e0a43d3`), **toda
compra Hotmart falhava** ao persistir (erro de coluna inexistente, HTTP 500) — zero compras
salvas em `maquina_de_conteudo`.

**Correção:** migration `20260815000000_fix_maquina_de_conteudo_colunas_faltantes.sql` adiciona
as 14 colunas (preserva o dado de negócio que o código já tentava capturar, em vez de truncar o
payload e descartar informação real).

**Guarda estrutural nova:** `__tests__/integration/schema-write-columns-structural.test.ts`, no
mesmo pipeline de CI da suite de isolamento (`.github/workflows/integration-isolation.yml`).
Faz o parsing estático de toda chamada `insert`/`update`/`upsert` nas edge functions e valida
cada tabela/coluna contra o schema real do banco de teste **ao vivo** (não um JSON versionado) —
trava essa classe de bug permanentemente. Detalhes completos, metodologia e achados descartados
(falso-positivo em `compute-weekly-reports`, bucket de Storage em `crm-registrar-venda`) em
`docs/CACA-BUGS-CLASSE-COLUNA-INEXISTENTE.md`.

Aplicado apenas no banco de TESTE (`fgjbmdsucruvtpywyhhf`); produção não foi tocada.

## 2026-07-11 BRT — Frontend: Design System "Nubank" v2.2 (tokens + primitivos)

Refatoração visual completa do eb-dash2 para o novo design system do dono (paleta roxa
`#820AD1`, branco dominante, radius scale 12/24/32/48px, tipografia graphikMedium/
graphikRegular com fallback Arial). **Liquid glass preservado** (requisito explícito) —
mesma arquitetura de 3 classes (`glass-sidebar/header/card`) e blur amounts (8/16/24px),
só reharmonizadas do azul-petróleo/dourado "Binance" antigo para branco+roxo (light) e
preto+roxo (dark). Decisão nova: o glass passou a existir também em light mode (antes só
existia em dark) para honrar o pedido do dono de mantê-lo visível independente do tema.

**Escopo desta PR (camada tokens + primitivos):** ~19 tokens `--empire-*` + tokens shadcn
(`--primary`, `--border` etc.) em `src/index.css`, `tailwind.config.js` (radius/fontFamily/
boxShadow), remoção do import Google Fonts (Geist/JetBrains Mono, substituídos por
graphikMedium/graphikRegular com fallback), receitas de `button`/`card`/`input`/`textarea`/
`badge`/`select`/`dialog` alinhadas ao design system, acessibilidade (focus ring global,
alvo de toque ≥44px em botões/inputs padrão, `prefers-reduced-motion`, texto de corpo nunca
abaixo de 16px), e remoção de hex hardcoded órfãos da marca antiga (`#C9A240`, glows
`rgba(252,213,53,*)`, radial `rgba(118,131,247,*)`). Build + typecheck (`tsc -b && vite
build`) passando sem erros. Fonte da verdade e decisões de arquitetura documentadas em
`docs/DESIGN-SYSTEM-NUBANK.md`. Cores categóricas não-semânticas (papéis de usuário, status
de disparo) e hex hardcoded em componentes de gráfico ficaram fora do escopo — candidatos a
uma PR de camada 3 (telas), listados na seção 8 do doc.

## 2026-07-11 BRT — Multi-tenant: runbook de produção do 1º tenant + RPC de bootstrap de agência

Ensaio ponta a ponta no banco de teste do fluxo completo que o dono vai
executar em produção: bootstrap da agência → `provision-new-client.ts
--mode=agency-subaccount --execute` → cliente conecta BYOK → verificação de
isolamento cross-tenant com dado real → falha real induzida (`location_id`
duplicado) confirmando zero órfãos no rollback compensatório da Fase 7 (P2).
**Achado:** não existia caminho seguro para criar a primeira agência de uma
instância — as policies são `service_role`-only por design, mas sem RPC o
único jeito seria SQL solto (proibido pela regra 20 do CLAUDE.md). Nova RPC
`create_agency_for_owner_service_role` (migration `20260814000000`):
fail-closed (owner precisa existir), idempotente (não duplica agência),
sempre cria a membership `owner` junto. Teste novo
`create-agency-for-owner-rpc.test.ts` (4/4). Runbook completo com comandos
exatos, pontos de verificação e checklist em
`docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md`.

## 2026-07-11 BRT — Multi-tenant: Fase 6 (fatia 2) — backfill meta_ads/weekly_email + 2 achados de segurança corrigidos

Fecha os 4 gaps que a Fase 8 (LGPD) documentou como não-isoláveis:
`meta_ads_campaigns`, `meta_ads_permalinks`, `weekly_email_logs`,
`weekly_email_schedules` ganham `workspace_id` via backfill por JOIN real
(ad_id/created_by/schedule_id) com fallback fail-closed, mesmo padrão das
fatias anteriores. **Achado 1 (bug funcional):** `sync-ad-permalinks` já
escrevia `workspace_id` em todo upsert desde a Fase 2, mas a coluna nunca
existiu na tabela — todo upsert real falhava silenciosamente para 100% dos
workspaces. **Achado 2 (segurança):** as policies de SELECT dessas 4 tabelas
não filtravam por linha — qualquer usuário autenticado de qualquer workspace
lia tudo, incluindo `recipient_emails` (PII) em `weekly_email_logs`. Corrigido
na mesma migration antes de expor as tabelas na suite de isolamento.
`meta_ads_backfill_controle`/`log` ficam de fora (decisão já registrada do
dono, residual de-scoped). `meta_ads_region_mapping` reclassificada como
referência global (sem tenant). Teste novo com seed real (7/7) prova o join
do trigger, o isolamento cross-tenant e o bloqueio de INSERT malicioso.
Detalhe em `docs/FASE-6-FATIA2-META-WEEKLY-EMAIL.md`.

## 2026-07-11 BRT — Multi-tenant: Fase 0 — cobertura de isolamento cross-tenant ampliada

Auditoria de lacunas (antes de avançar o roadmap) encontrou a fixture
`__tests__/helpers/rls-tables.generated.ts` desatualizada desde 09/07: 4 tabelas já
denormalizadas na Fase 6 (`oportunidades`, `comunicacoes`, `vendas_fechamento`,
`stevo_whatsapp_calls`) seguiam classificadas como "sem `workspace_id`" (só cobertura
estrutural) em vez de entrar na prova forte por coluna; e `workspace_deletion_requests`
(Fase 8) tinha `workspace_id` + RLS mas nenhum teste de isolamento dedicado. Fixture
regerada contra o banco de teste real: universo agora é **120 tabelas com RLS = 79 com
`workspace_id` (era 70) + 41 sem (era 42)**. As 4 tabelas do achado entram na suite
genérica (`it.each`, 132 provas, era 124); nova categoria `agency_scoped` documenta que
`agencies`/`agency_members`/`agency_ghl_credentials` isolam por `agency_id` (cobertos
pela suite dedicada de agência, não pela genérica). Teste novo
`workspace-deletion-requests-isolation.test.ts` (6/6): owner/admin de A não vê pedido de
B, member comum de A (não-owner/admin) também não vê o pedido do próprio A,
INSERT/UPDATE direto pelo cliente bloqueado. Suite completa **376 passed** (era 362).
Detalhe em `docs/ROADMAP-MULTI-TENANT.md` (log de execução).

## 2026-07-11 BRT — Multi-tenant: Fase 7 (P2) — rollback compensatório do provisionamento

`scripts/provision-new-client.ts` (modo `agency-subaccount`) ganha rollback automático
quando `linkWorkspaceToAgency` falha (ex.: `location_id` já ativo em outro workspace):
reusa a RPC `purge_workspace_data` (Fase 8) para apagar o workspace órfão e, se o owner
foi criado nesta mesma execução, remove-o também do Auth — o operador ainda vê o erro
original, mas sem sobrar órfão para limpar manualmente. Validado com falha real
induzida no banco de teste (colisão de `location_id`), zero órfãos confirmado. Detalhe
em `docs/FASE-7-P2-ATOMICIDADE.md`.

## 2026-07-11 BRT — Multi-tenant: Fase 8 — runbook técnico de expurgo LGPD/offboarding

RPC `purge_workspace_data` (SECURITY DEFINER, `service_role` only) apaga 100% dos dados
de um workspace numa única transação atômica (dry-run transacional via ROLLBACK
forçado), reusável como mecanismo de rollback pela Fase 7 (P2). Scripts de operador
`scripts/export-workspace-data.ts` (portabilidade, obrigatório antes de qualquer
exclusão) e `scripts/purge-workspace.ts` (wrapper de dry-run/execução real). Achado
real corrigido: gatilhos de auditoria (`app_feature_role_permissions`/
`app_feature_user_overrides`/`dashboard_user_permissions`) quebravam qualquer
`DELETE FROM workspaces` via CASCADE por FK de `permission_audit_log` — nunca havia
sido exercitado antes. Fechado também o gap de `stevo_whatsapp_calls` (única tabela
com PII direta — telefones — sem nenhum caminho de isolamento por tenant), com
`workspace_id` denormalizado no mesmo padrão da Fase 6. Suite `fase8-workspace-purge.test.ts`
(5/5) prova zero órfãos e zero vazamento cross-tenant. `docs/NIVEIS-DE-ACESSO.md`
criado (gate de documentação de acesso). Detalhe em
`docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`.

## 2026-07-11 BRT — Multi-tenant: Fase 7 — provisionamento `agency-subaccount`

`scripts/provision-new-client.ts` ganha `--mode=agency-subaccount` (padrão continua
`isolated-instance`, comportamento 100% preservado). Prioridade escolhida por análise
própria (validando a leitura do dono): destrava o onboarding do primeiro tenant
adicional dentro do modelo Agency sem esperar a Fase 8 (LGPD/DPA) inteira. Detalhe em
`docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md`.

- Novo modo cria workspace **dentro** da instância Agency já existente — sem projeto
  Supabase novo, sem deploy Vercel novo, sem `GHL_API_KEY` (cliente conecta via BYOK).
- `--agency-id` (obrigatório no modo novo) + `--execute` (necessário para sair do
  dry-run nesse modo, já que `--create-supabase`/`--deploy-vercel` não se aplicam).
- Validação fail-closed: agência precisa existir antes de criar qualquer coisa.
- Vínculo em `agency_workspaces` (`provisioning_mode='manual_byok'`), respeitando o
  índice único de `location_id` ativo (erro claro em vez de erro Postgres cru).
- `docs/REPLICACAO-TECNICA.md` reescrito para documentar os dois modos e quando usar
  cada um (critério de "pronto" da Fase 7).
- Validado com execução real (não só dry-run) contra o banco de TESTE: caminho feliz
  com/sem `location_id`, agência inexistente (falha antes de criar nada), `location_id`
  duplicado (erro claro). Massa de teste limpa ao final.

## 2026-07-11 BRT — Limpeza: remove crons órfãos, function morta e botão de sync quebrado

Fecha os 3 achados colaterais registrados durante o guard de segurança dos crons.
Detalhe em `docs/LIMPEZA-CRONS-ORFAOS-E-CODIGO-MORTO.md`.

- **`enviar-email-contrato-assinado` removida** (dono confirmou) — confirmado antes
  que nenhuma função SQL, cron ou frontend a chama mais (substituída por
  `outbound_webhooks` genérico desde a Fase 2/fatia 7).
- **4 crons órfãos desagendados** via migration
  `20260810000000_remove_orphan_crons_and_dead_functions.sql`:
  `reconcile-vendas-fechamento-cron`, `stevo-process-att1/2/3` (apontavam para
  edge functions inexistentes; os 3 `stevo-*` chamavam sem NENHUM header de auth).
- **Botão manual "Sync" do Meta Ads removido** (`SyncBanner.tsx`) — já retornava
  400 desde a Fase 8 (faltava `workspace_id`) e, após o guard de segurança, nunca
  mais funcionaria mesmo corrigindo isso (a function agora exige `service_role_key`).
  O sync horário via cron já cobre a necessidade. Plumbing morta removida em
  `FilterBar.tsx`/`DashboardPage.tsx`/`useTrafego.ts` (`refreshSyncStatus`).
- Suite de integração: 357 passed | 10 todo (-1 esperado, function removida do
  guard). Unitário/componente: 22 passed, 0 regressão. `tsc -b` limpo.

## 2026-07-11 BRT — CI: corrige gate quebrado da suite de isolamento cross-tenant

Item 4 do plano de segurança pós-Fase 3. `.github/workflows/integration-isolation.yml`
tinha um `paths:` de trigger com um caminho inexistente
(`eb-dash2/supabase/migrations/**` — nunca existiu, as migrations reais ficam em
`supabase/migrations/`) e **não incluía `supabase/functions/**`** — ou seja, PRs que só
alterassem edge functions/migrations (exatamente o tipo dos itens 1–3 desta sessão) não
disparavam a suite automaticamente. Corrigido: `paths` agora inclui
`supabase/migrations/**` e `supabase/functions/**`.

**Limitação documentada (não resolvida por não ser decisão técnica):** branch
protection com required status checks não está disponível no plano atual do GitHub
para este repositório privado (`gh api .../branches/main/protection` retorna 403 —
"Upgrade to GitHub Pro"). Detalhe e opções em `docs/CI-GATE-ISOLAMENTO-CROSS-TENANT.md`.

## 2026-07-11 BRT — Segurança: cutover da chave GHL (env global) para o Vault por workspace

Item 3 do plano de segurança pós-Fase 3. A Fase 2 já tinha migrado toda a LEITURA de
credencial GHL para o Vault por workspace — mas nunca existiu um mecanismo seguro para
de fato SEMEAR essa credencial (só um bloco de SQL manual no runbook, sem guarda de
papel nem validação). Detalhe em `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`.

- Migration `20260809000000_fase2_seed_ghl_credential_env_cutover.sql`: RPC
  `seed_workspace_ghl_credential_service_role(workspace_id, ghl_api_key, ghl_location_id)`
  — mesmo padrão de `save_workspace_credential` (Fase 4), restrita por `GRANT` a
  `service_role` (nunca `anon`/`authenticated`), idempotente (rotaciona ao repetir).
- O segredo real NUNCA entra em migration/git — só a função (schema) é versionada; o
  valor é passado em tempo de execução pelo operador.
- Teste novo `__tests__/integration/ghl-credential-env-cutover.test.ts` (7/7, com
  valores sintéticos, nunca a chave real do GHL).
- Suite de integração: 358 passed | 10 todo (0 regressão).

## 2026-07-11 BRT — Segurança: guard fail-closed nas 5 edge functions administrativas ("classe B")

Item 2 do plano de segurança pós-Fase 3 (item 1 é o guard nas 20 functions de cron, acima).
Detalhe em `docs/SEGURANCA-CLASSE-B-FUNCTIONS-GUARD.md`.

- `recuperacao-corrigir`, `recuperacao-prefetch`, `sync-recuperacao-stages`, `diag-ghl`
  ganharam o mesmo guard `requireServiceRoleCaller` do item 1 — nenhuma tinha qualquer
  checagem de chamador além do `verify_jwt` padrão do Supabase, apesar de escreverem
  dados no GHL (`recuperacao-corrigir`, `sync-recuperacao-stages`) sem nenhuma autorização
  real. `reconcile-contact-opportunities` já estava coberta pelo item 1.
- Teste estrutural novo `__tests__/integration/classe-b-functions-guard.test.ts`.
- Suite de integração: 351 passed | 10 todo (0 regressão). `tsc -b` limpo. `deno check`
  sem erros novos.

## 2026-07-11 BRT — Segurança: guard de chamador autorizado nas 20 edge functions de cron

Achado da auditoria de segurança da Fase 3 (`docs/ROADMAP-MULTI-TENANT.md`, log de execução):
as edge functions chamadas por `pg_cron` via `net.http_post` não validavam o papel do
chamador — o `verify_jwt` padrão do Supabase só confirma a assinatura do JWT, e tanto a
anon key (pública, no bundle JS) quanto a service_role key passam nesse checador. Detalhe
completo em `docs/SEGURANCA-CRON-CALLER-GUARD.md`.

- Novo módulo `supabase/functions/_shared/require-service-role.ts` (+ lógica pura testável
  em Node `require-service-role-logic.ts`): guard fail-closed que só aceita
  `Authorization: Bearer <service_role_key>`.
- Aplicado nas 20 edge functions de cron (18 com guard estrito, 2 dual-mode preservando o
  caminho de usuário autenticado: `sync-ghl-users`, `send-weekly-report-email`).
- Migration `20260808000000_fix_cron_caller_service_role.sql`: corrige os 8 crons que ainda
  enviavam `anon_key`/liam de `app_config` para enviarem `service_role_key`. Achado colateral
  corrigido: `sync-ghl-users-cron` já estava quebrado (enviava body `{}` sem `workspace_id`,
  fail-closed desde a Fase 2) — reescrito para percorrer workspaces com credencial GHL.
- Teste estrutural novo `__tests__/integration/cron-caller-guard.test.ts`: garante as 20
  functions com o guard e trava qualquer cron novo sem guard (via grep nas migrations).
- Achados colaterais não bloqueantes (tarefas separadas): `enviar-email-contrato-assinado`
  está órfã (nenhum caller no banco); botão manual "Sync" do Meta Ads já estava quebrado
  (Fase 8, não regressão); 4 crons órfãos (`reconcile-vendas-fechamento`, `stevo-process-att*`).
- Suite de integração: 346 passed | 10 todo (0 regressão). `tsc -b` limpo. `deno check` sem
  erros novos nas 20 functions alteradas.

## 2026-07-11 BRT — Multi-tenant: Fase 3 implementada — `discover-agency-locations`

Continuação do plano `docs/PLANO-MULTI-TENANT-AGENCY.md`, sempre no banco de **TESTE**
(`fgjbmdsucruvtpywyhhf`) — produção (`qzesffnkqgelmtfblzkr`) nunca foi tocada. Implementa o
próximo passo descrito em `docs/HANDOFF-MULTI-TENANT-2026-07-11.md` (seção 6): a edge function
que descobre sub-contas novas de uma agência via token de agência **só-leitura** (decisão do
dono, `docs/FASE-3-POC-RESULTADOS.md`).

**Backend:**
- Migration `20260804000000_fase3_agency_ghl_credentials.sql`: tabela `agency_ghl_credentials`
  (ponteiro pro Vault, `company_id`, `rotation_version`), RLS só `service_role` — mesmo padrão de
  `workspace_integration_credentials`.
- Migration `20260805000000_fase3_agency_ghl_credential_rpcs.sql`: `save_agency_ghl_credential`
  (self-service — dono/admin da agência cola o próprio token, guarda `is_agency_admin`, nunca
  retorna o token), `get_agency_credential_meta` (só `service_role`), `get_agency_ghl_credential_status`
  (status pra UI, sem o token).
- Migration `20260806000000_fase3_agency_workspaces_location_uniqueness.sql`: índice único
  parcial `uq_agency_workspaces_location_active` — impede a mesma sub-conta GHL ser vinculada a
  duas agências ativas ao mesmo tempo.
- Migration `20260807000000_fase3_discover_agency_locations_cron.sql`: cron a cada 6h.
- Edge function `supabase/functions/discover-agency-locations/index.ts` + helper
  `_shared/resolve-agency-credentials.ts`: para cada agência com credencial, chama
  `GET /locations/search`; sub-conta nova vira workspace com `status='pending'` +
  `provisioning_mode='auto_discovered'`; sub-conta `suspended` **nunca** reativa sozinha; sub-conta
  de outra agência **nunca** é sobrescrita; **NUNCA chama `/users/`** (decisão da seção 5 do
  handoff — o dono recusou dar escopo de edição de usuários ao token de agência).

**Frontend:** card informativo em `AgencyWorkspacesPage.tsx` para sub-contas `pending`/
`auto_discovered`, orientando o cliente a conectar a própria chave em `/workspace/integracoes`
(a agência não tem — nem deveria ter — acesso à chave da sub-conta do cliente).

**Testes:** `agency-ghl-credential-rpcs.test.ts` (9 casos, mesmo roteiro de
`byok-self-service.test.ts`: negativo staff/outra agência, retorno nunca vaza o token, roundtrip
no Vault, rotação de `rotation_version`, token/company_id vazio rejeitado, status sem segredo) +
`discover-agency-locations-structural.test.ts` (3 casos — trava por grep contra regressão futura
da decisão "nunca `/users/`"). Suite de integração **313 → 325 passed** (0 regressão). `deno check`
limpo nos dois arquivos novos; `tsc -b`/`npm run build` limpos.

**Segurança:** auditoria escopada ao diff (`security-report/audit-2026-07-11-fase3.md`, gate
**PASS**). Achado único: dívida arquitetural pré-existente e sistêmica (edge functions de cron,
incluindo `sync-opp-dates` já em `main`, não verificam o papel do chamador além do `verify_jwt`
padrão da plataforma) — não é regressão desta mudança, registrado como ação de projeto separada.

## 2026-07-10 BRT — Multi-tenant: Fase 4 (BYOK completa) + Fase 5 (MVP Agency UI) + 4 PRs abertos

Continuação da execução do plano `docs/PLANO-MULTI-TENANT-AGENCY.md`, sempre no banco de **TESTE**
(`fgjbmdsucruvtpywyhhf`) — produção (`qzesffnkqgelmtfblzkr`) nunca foi tocada. Detalhe completo e log
fase a fase em `docs/ROADMAP-MULTI-TENANT.md`.

**Fase 4 — BYOK self-service (cliente cadastra a própria chave), agora completa no teste:**
- Fatia 1 (`3fc5b28`): RPC `save_workspace_credential` (guarda `is_workspace_admin`, Vault +
  `rotation_version`, nunca retorna o segredo) + `get_workspace_credential_status`.
- Fatia 2 (`2ad5b41`): UI "Chaves de API" (`WorkspaceIntegrationsPage.tsx`) na Sidebar da
  Administração — GHL + Meta (Notion descontinuado).
- Fatia 4 (`df416a2`): edge function `test-workspace-credential` ("Testar conexão"/prova de posse) —
  confirma que a chave cadastrada realmente dá acesso ao `location_id`/`ad_account_id` informado,
  sem nunca expor o segredo. Lógica de interpretação isolada em módulo puro testável em Node
  (`_shared/test-workspace-credential-logic.ts`).
- Fatia 3 (link de intake para terceiro sem login) segue pendente — depende da Fase 5.

**Fase 5 — MVP da área `/agency/*` (`beb0721`):**
- RPCs `suspend_agency_workspace`/`reactivate_agency_workspace` (guarda `is_agency_admin`; reativação
  exige `p_confirmed=true` — nunca automática, seção 3.6 do plano-mãe).
- `invite-user` passou a aceitar também owner/admin de uma agência dona da sub-conta (antes só aceitava
  quem já tinha `workspace_members` na própria sub-conta).
- Área `/agency/workspaces`: lista de sub-contas, suspender com confirmação, reativar exigindo digitar
  o nome exato da sub-conta. Guard `AgencyRoute` garante que o cliente atual (single-tenant, 0 agências)
  nunca vê nem acessa nada disso — sem link em nenhum menu, redireciona pra `/`.
- Novo doc: `docs/FASE-5-AGENCY-UI.md`.

**Testes:** suite de integração no banco de teste passou de 285 → 301 (Fase 4) → 308 (Fase 5), sem
nenhuma regressão. `tsc -b`, `vite build` e `deno check` verdes em cada etapa.

**Organização do repositório:** os PRs #12/#13 (Fase 0, antigos) foram mantidos como estavam, sem mexer.
Abertos 4 PRs novos, **empilhados** (cada um contra o anterior, para revisão incremental e merge em
ordem) — nenhum foi mergeado em `main`:
- [#14](https://github.com/Empire-Business/GHL-SUPABASE/pull/14) Fase 1 → `main`
- [#15](https://github.com/Empire-Business/GHL-SUPABASE/pull/15) Fase 2 → PR #14
- [#16](https://github.com/Empire-Business/GHL-SUPABASE/pull/16) Fase 4 → PR #15
- [#17](https://github.com/Empire-Business/GHL-SUPABASE/pull/17) Fase 5 → PR #16

**O que continua pendente e depende de decisão do dono:** ambiente de staging (projeto Supabase novo),
POC de agência real do GHL (Fase 3), e o cutover em produção (sempre com aval explícito, fase a fase).

---

## 2026-07-09 BRT — Revisão profunda (rodada 2) do plano Multi-Tenant Agency (v3)

O `docs/PLANO-MULTI-TENANT-AGENCY.md` passou por uma **segunda rodada, mais profunda**, de revisão crítica adversarial (agentes de alta capacidade), sobre o texto já revisado da v2. Foco em lacunas de **segunda ordem**: as que só aparecem com escala/volume reais, contradições internas remanescentes, bypasses de segurança de segundo nível e oportunidades de simplificação estratégica do escopo. **29 achados levantados, 29 incorporados, 0 descartados.** Apenas documentação — nenhum código, migration ou edge function foi alterado.

**Achados incorporados por categoria:**
- **data-model (4, todos Alto):** política RLS aditiva de agência sem benchmark/índices sob volume real; gerador de políticas ignorava as 3 tabelas centrais do CRM (predicado por join) e tabelas particionadas; aperto de `NOT NULL` sem tratar o lock `ACCESS EXCLUSIVE` do próprio `ALTER`; backfill histórico/tratamento de órfãos do `workspace_id` denormalizado ausente.
- **ops-compliance (8: 6 Alto, 2 Médio):** ausência de rollback por fase; ausência de staging production-like antes da instância viva; suite de isolamento "em produção" sem garantia de teardown; nenhum plano de disaster recovery/restore seletivo por tenant; offboarding de pessoal da agência sem processo; depreciação/versionamento da API GHL sem detecção; resposta a incidente/comunicação de violação multi-tenant ausente; certificação/auditoria externa (SOC2/ISO/pentest) não considerada.
- **contradiction (4: 1 Alto, 2 Médio, 1 Baixo):** seção 6.2 dizia "três dimensões" mas enumerava quatro (e o próprio Anexo A se autocontradizia); cabeçalho dizia "20 achados" com o Anexo A listando 26; `CREATE TABLE agency_workspaces` mantinha `ghl_location_id` sem o `UNIQUE` que a seção 3.5 mandava aplicar; referência cruzada quebrada na seção 3.4.1 (apontava para a seção errada).
- **security (6: 3 Alto, 3 Médio):** janela MVCC de suspensão de sub-conta; aprovação de admin descoberto sem four-eyes; location squatting (constraint sem prova de posse); canal de entrega do link BYOK sem autenticação; SSRF em `outbound_webhooks` por DNS rebinding; invalidação de cache de credencial superestimava a proteção (faltava rotação no provider upstream).
- **opportunity (7: 4 Alto, 3 Médio):** cortar a Fase 3 do MVP e inverter a ordem (BYOK primeiro); adiar a política RLS aditiva/retrofit de ~90 tabelas; refatoração incremental de credenciais (fail-closed no resto); validar demanda (LOI) antes de comprometer capacidade; métricas de sucesso mensuráveis/gate de break-even; critério objetivo de roteamento de tier; reduzir o escopo do backfill da Fase 6.

**Mudanças mais relevantes no corpo do plano:**
1. Nova seção **10.3 "Caminho de menor risco: MVP recomendado"** — corte explícito do MVP: BYOK (Fase 4) promovido a caminho padrão, Fase 3 (auto-descoberta) e a política RLS aditiva de agência adiadas para pós-MVP com gatilhos de retomada, refatoração de credenciais dividida em classe crítica vs. diferível (fail-closed), backfill da Fase 6 reduzido ao necessário para o 1º tenant.
2. Nova seção **10.4 "Rollback por fase"** — down-migration do retrofit de RLS, dead-letter em vez de descarte no `webhook-ghl`, reversão temporária do segredo global enquanto só há 1 tenant real.
3. Nova seção **12.2 "Critério objetivo de roteamento de tier"** e **12.3 "Assurance externa"** (SOC2/ISO/pentest).
4. Novas seções **18 "Disaster Recovery e Restore Seletivo por Tenant"** e **19 "Resposta a Incidente Multi-Tenant e Offboarding de Pessoal da Agência"**.
5. Seções 3.2, 3.3, 3.3.1, 3.4.1, 3.5 endurecidas com nova seção **3.3.2** (gerador de políticas para tabelas de predicado-por-join) e **3.5.1** (prova de posse contra location squatting); 4.1 (staging production-like, regime de execução da suite); 4.2 (migração online segura de `NOT NULL`); 4.3 (backfill histórico + órfãos); 5.2 (SSRF/DNS rebinding); 5.3 (SLA de revogação + rotação upstream); 6.1 (four-eyes); 6.2 (quatro dimensões de POC + quinta dimensão temporal); 7.1 (canal do link BYOK); 8.1 (smoke-test canário de shape da API).
6. Contradições corrigidas: contagem de achados do cabeçalho, "três vs. quatro dimensões" da seção 6.2 (e a tabela da Fase 3), fonte de verdade de `ghl_location_id` entre `agency_workspaces`/`ghl_integration_settings`, referência cruzada da seção 3.4.1.

**O que foi entregue:**
- `docs/PLANO-MULTI-TENANT-AGENCY.md` — reescrito como v3, com Anexo B documentando os 29 achados desta rodada e o rastreamento de onde cada um foi corrigido no corpo do texto (Anexo A da v2 preservado como registro histórico).
- `CLAUDE.md` — índice atualizado.

---

## 2026-07-09 BRT — Auditoria de permissões: usuário "sistema" resolve escrita via CLI/service role

Resolve a dívida técnica registrada mais cedo: os triggers de auditoria de permissões (`audit_*`) faziam fallback para `'00000000-0000-0000-0000-000000000000'` quando `auth.uid()` era nulo (operação via CLI, service role ou edge function), e a FK `permission_audit_log_performed_by_fkey → auth.users(id)` rejeitava a escrita porque o UUID não existia.

**O que foi entregue:**
- `supabase/migrations/20260709230000_seed_system_audit_user.sql` — cria um usuário técnico "sistema" em `auth.users` com o UUID fixo `00000000-0000-0000-0000-000000000000` (`system@empire.local`, sem senha, e-mail não confirmado, fora de qualquer workspace). Ele existe apenas como ator de auditoria.
- Nenhuma mudança nos triggers: o fallback existente passa a apontar para um usuário real.
- `docs/DASHBOARD-CONTROLE-ACESSO.md` — v1.4, dívida técnica marcada como resolvida com a solução e a validação.

**Efeito:**
- Operações pela UI seguem registradas com o autor humano.
- Operações via CLI/service role passam a ser registradas como "sistema", com a FK satisfeita e a auditoria preservada (nada anônimo).

**Validação:** aplicada via `supabase db push --linked`; UPDATE via CLI sem desabilitar o trigger passou a gerar linha em `permission_audit_log` com `performed_by = 00000000-0000-0000-0000-000000000000`.

---

## 2026-07-09 BRT — Revisão crítica adversarial do plano Multi-Tenant Agency (v2)

O `docs/PLANO-MULTI-TENANT-AGENCY.md` passou por uma rodada de revisão crítica multi-agente: 26 achados de segurança/dados/produto/ops foram levantados e **verificados individualmente** contra o texto do plano e o código real do repositório antes de serem aceitos. **Apenas documentação — nenhum código, migration ou edge function foi alterado.**

**Achados incorporados ao corpo do plano (24 de 26 levantados; 2 rejeitados na verificação):**
- **Críticos (4):** `can_access_workspace_via_agency` ignorava `agency_workspaces.status` (admin de agência mantinha acesso irrestrito a sub-conta suspensa); ausência de constraint contra colisão de `ghl_location_id` entre sub-contas; ausência total de fluxo de offboarding/exclusão real de dados; ausência total de tratamento de LGPD/direitos do titular para leads de terceiros em infraestrutura compartilhada.
- **Altos (9):** cache de credenciais sem invalidação amarrada à revogação; blast radius de bug único na função de RLS compartilhada sem processo de revisão proporcional; auto-descoberta concedia admin automaticamente sem confirmação humana; nenhum modelo de billing por sub-conta; POC da Agency API não cobria consentimento por sub-conta nem modelo de webhook Marketplace; "saúde de sync" sem alerta ativo/SLA; nenhuma estimativa de custo/ROI numérica; nenhum kill-switch para a Fase 2; nenhuma comunicação/consentimento formal ao cliente atual sobre a mudança de arquitetura.
- **Médios (9):** reativação automática de sub-conta suspensa via reaproveitamento de location_id; `outbound_webhooks` sem RLS/filtro de tenant explícito; canal de transporte de credencial BYOK não definido; ausência de seletor para admin de múltiplas agências; ausência de alerta de conectividade; teste de regressão de UX single-tenant ausente; GHL Users API sem confiabilidade confirmada para convite automático; peso insuficiente à alternativa BYOK; ausência de cronograma/alocação de engenharia por fase.
- **Baixos (2):** ausência de rate limit/auditoria no botão de re-descoberta manual; ausência de identificador de suporte para diagnosticar bugs por sub-conta.

**Mudanças mais relevantes no corpo do plano:**
1. Seção 3.3 corrigida (filtro `status='active'`) + nova seção 3.3.1 tratando a função de RLS compartilhada como ponto único de risco máximo.
2. Nova seção 3.5 (constraint de unicidade de `ghl_location_id`) e 3.6 (reativação de sub-conta nunca automática).
3. Seção 6.1 reescrita — convite de admin passa a exigir staging + aprovação humana, nunca automático.
4. Novas seções 14 (billing por sub-conta), 15 (LGPD/DPA) e 16 (offboarding, exclusão de dados, comunicação com cliente atual).
5. Seção 10 ganhou coluna de esforço estimado por fase, nova seção 10.1 (impacto na capacidade de engenharia) e 10.2 (kill switch da Fase 2); seção 12.1 (estimativa de custo/ROI, pendente de validação financeira).

**O que foi entregue:**
- `docs/PLANO-MULTI-TENANT-AGENCY.md` — reescrito como v2, com Anexo A documentando todos os achados (confirmados e rejeitados) e o rastreamento de onde cada um foi corrigido no corpo do texto.
- `CLAUDE.md` — índice atualizado.

**Próximo passo (fora deste estudo):** validar tecnicamente as 3 dimensões da POC da seção 6.2 e levantar os dados reais de billing para a estimativa de custo/ROI da seção 12.1, antes de decidir formalmente o modelo híbrido como política de produto.

---

## 2026-07-09 BRT — Permissões por feature: UI passa a escrever `can_edit`

Corrigido bug em que liberar uma feature editável (ex.: `traqueamento.cods-utm`) para um `member` em `/workspace/users/:id` fazia a aba aparecer, mas os botões de criar/editar ficavam desabilitados. A UI e o hook de permissões por feature só liam/escreviam `can_view`, nunca `can_edit`. Diagnóstico em produção: 9 overrides no sistema (todos de 1 usuário) e **zero** registros com `can_edit = true`.

**O que foi entregue:**
- `eb-dash2/src/hooks/useAppFeaturePermissions.ts` — queries e mutations agora leem/escrevem `can_edit` (tipo `FeaturePermissionValue`); adicionado `useDeleteAppFeatureUserOverride`.
- `eb-dash2/src/pages/workspace/WorkspaceUserDetailPage.tsx` (`FeatureRow`) — toggles **Ver** e **Editar** por feature (Editar só para features com `defaultEditRoles`); invariante editar ⇒ ver; reset remove o override.
- Correção de dado: `app_feature_user_overrides` de `acessos@thetrinity.com.br` com `can_edit = true` em `traqueamento.cods-utm` e `traqueamento.funis`.
- `docs/DASHBOARD-CONTROLE-ACESSO.md` — v1.3, seção sobre a correção + dívida técnica do trigger de auditoria.

**Dívida técnica registrada:** triggers de auditoria de permissões quebram em escrita via CLI/service role (fallback `'00000000-…'` não existe em `users`). No fluxo de UI funciona; manutenção via SQL exige contornar o trigger. Ver `docs/DASHBOARD-CONTROLE-ACESSO.md`. **(Resolvida mais tarde no mesmo dia — ver entrada abaixo.)**

**Validação:** `tsc -b` e `eslint` limpos; UPDATE em produção confirmado via SELECT pós-execução. Teste E2E (login como admin e como o member) pendente de validação manual do usuário.

---

## 2026-07-09 BRT — Estudo de arquitetura: Multi-Tenant Agency + Sub-contas (GHL)

Produzido estudo extenso de arquitetura avaliando a migração do modelo atual ("1 instância Supabase+Vercel por cliente", ver `docs/SINGLE-TENANT-LOCK.md`) para um modelo multi-tenant real dentro de uma única instância, espelhando a estrutura Agency + Sub-contas do próprio GHL. **Apenas documentação — nenhum código, migration ou edge function foi alterado.**

**O que foi entregue:**
- `docs/PLANO-MULTI-TENANT-AGENCY.md` — documento completo cobrindo: estado atual (o que já existe de fundação multi-tenant "adormecida" via `workspaces`/RLS/sub-apps) e os gaps críticos (credenciais globais por env var em 16+ edge functions, webhook outbound hardcoded em SQL, fallback silencioso de resolução de workspace, tabelas sem `workspace_id`); modelo de dados proposto (`agencies`, `agency_members`, `agency_workspaces`); estratégia de isolamento de credenciais por sub-conta via Supabase Vault; auto-descoberta de sub-contas via GHL Agency API; cenário de sub-conta "traga sua própria chave" (BYOK); área de gestão `/agency`; plano de migração em 8 fases; riscos concretos com mitigação; e recomendação de modelo híbrido (Agency multi-tenant + instância isolada como tier enterprise).
- `CLAUDE.md` — índice atualizado.

**Próximo passo (fora deste estudo):** validar tecnicamente qual endpoint da Agency API do GHL suporta descoberta de sub-contas via Private Integration Token antes de iniciar qualquer implementação.

---

## 2026-07-09 BRT — Auditoria SDR IA: universo por mensagem + RPC no backend

A aba **Auditoria IA** do módulo SDR IA agora identifica leads atendidos pela **mensagem enviada**, não pela tag `[CP] SDR IA`. A lógica de detecção dos problemas foi movida para uma função PostgreSQL, eliminando carregamento massivo de comunicações no frontend.

**O que foi entregue:**
- `supabase/migrations/20260709220000_auditoria_sdr_ia_rpc.sql` — cria a RPC `auditoria_sdr_ia()` que agrega os 6 tipos de problema no servidor.
- `supabase/migrations/20260709220100_fix_auditoria_sdr_ia_timezone.sql` e `20260709220200_fix_auditoria_sdr_ia_ambiguidade.sql` — correções na conversão de timezone e resolução de ambiguidade de colunas.
- `eb-dash2/src/hooks/useAuditoriaIA.ts` — reescrito para chamar a RPC uma única vez; remove paginação client-side e queries múltiplas.
- `eb-dash2/src/hooks/useSdrIaConfig.ts` — default de tags agora é vazio (aberto), já que a tag não é mais critério de entrada.
- `eb-dash2/src/pages/sdr-ia/tabs/ConfiguracaoTab.tsx` — texto explicando que o painel detecta automaticamente pela mensagem.
- `eb-dash2/tests/sdr-ia-auditoria.spec.ts` — testes Playwright para o painel de auditoria (login, cards, tabela, filtros).
- `docs/ABA-AUDITORIA-IA.md` — atualizado com a nova arquitetura, queries e regras.
- `docs/diagnostico-sdr-ia-2026-07-09.md` — diagnóstico de dados que fundamentou a mudança.
- `CLAUDE.md` — índice atualizado.

**Regras críticas preservadas:**
- Classificação de "mensagem da IA" usa a mesma regra da view `comunicacoes_com_remetente`: `direction = 'outbound' AND autor = 'automacao'`.
- Tags, pipelines e UTMs continuam como filtros opcionais configuráveis.
- Leads com `erro_entrega` não aparecem como `sem_followup` (deduplicação no frontend).
- `sdr_humano` continua usando `oportunidades.sdr_name` com fallback para `contatos.owner_name`.

**Como validar:**
```bash
cd eb-dash2
npx tsc -b
npx playwright test tests/sdr-ia-auditoria.spec.ts tests/sdr-ia-config.spec.ts
```

---

## 2026-07-09 BRT — Backfill de permissões `member` para apps modulares

Corrigido o bug que fazia usuários com papel `member` verem **"Nenhum app disponível"** no AppHub, mesmo quando o admin já tinha liberado apps por telas antigas.

**Causa:** a migration original de sub-apps (`20260626151259_sub_apps_foundation.sql`) só criou permissões para `owner` e `admin`. O backfill posterior (`20260705000009_seed_new_workspaces.sql`) só cobriu workspaces sem nenhum app configurado, deixando workspaces antigos sem `app_role_permissions.role = 'member'`.

**O que foi entregue:**
- `supabase/migrations/20260709160000_backfill_member_app_permissions.sql` — idempotente, insere `can_view = true` para `member` em todos os apps ativos dos workspaces antigos.
- `docs/SUB-APPS-MODULARES.md` — documenta o histórico do bug, a correção e a regra de liberação de apps por usuário.
- `docs/DASHBOARD-CONTROLE-ACESSO.md` — deixa explícito que o modelo legado `dashboard_user_permissions` não alimenta o AppHub.

**Regras críticas preservadas:**
- AppHub usa apenas `workspace_apps`, `app_role_permissions` e `app_user_overrides`.
- Liberação por usuário deve ser feita em `/admin/permissions` (abas Papéis/Usuários) ou `/workspace/users/:userId`, não em `/admin/users` > "Permissões".
- `owner`/`admin` continuam vendo todos os apps ativos automaticamente.

---

## 2026-07-08 BRT — Rastreamento de agendamentos por IA vs humano

Adicionado rastreamento completo da origem de cada agendamento no GHL, permitindo distinguir visualmente agendamentos feitos pela SDR IA (`conversations_ai`) de agendamentos feitos por humanos (`calendar_page`, `google_calendar`, etc.).

**O que foi entregue:**
- `supabase/migrations/20260708190000_add_agendamento_origem_oportunidades.sql` — adiciona 8 colunas em `oportunidades` para metadados do agendamento e cria a tabela `ghl_calendars` como cache local.
- `supabase/migrations/20260709203000_reset_appointment_sync_for_backfill.sql` — reseta `last_appointment_sync_at` para forçar reprocessamento e popular `agendamento_origem` nos registros existentes.
- `supabase/functions/sync-appointment-dates/index.ts` — enriquece cada appointment com detalhes de `GET /calendars/appointments/{id}`, salva origem/calendário/usuário e usa `ghl_users`/`ghl_calendars` do banco como cache.
- `eb-dash2/src/components/dashboard/AppointmentOriginBreakdown.tsx` — componente visual com 6 cards clicáveis (Agend./Reuniões/Vendas × IA/Humano).
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`, `AquisicaoTab.tsx`, `GeralTab.tsx` — integração do breakdown abaixo dos funis.
- `docs/HANDOFF-AGENDAMENTO-IA-VS-HUMANO.md`, `docs/SYNC-APPOINTMENT-DATES.md`, `CLAUDE.md` atualizados.

**Regras críticas preservadas:**
- A GHL API Key continua não sendo exposta no frontend.
- A função continua não usando `ghl_api_jobs`; chama a API GHL diretamente.
- A função limpa os novos campos quando não há appointment ativo, mantendo consistência com os campos de data.

---

## 2026-07-08 BRT — Assistente de Mapeamento GHL por IA

Nova aba "Assistente IA" na página `/workspace/ghl-config` para permitir que usuários leigos mapeiem campos, pipelines e stages do GHL apenas descrevendo a estrutura deles em português. A IA analisa a descrição junto com os dados descobertos pela API GHL e propõe os mapeamentos corretos.

**O que foi entregue:**
- `supabase/functions/ai-ghl-mapping/index.ts` — edge function que monta o prompt e chama OpenRouter (`qwen/qwen3.6-plus` com fallback para `deepseek/deepseek-v4-flash`).
- `supabase/config.toml` — configuração da nova edge function com validação JWT interna.
- `eb-dash2/src/hooks/useAiGhlMapping.ts` — hook TanStack Query para chamar a edge function.
- `eb-dash2/src/components/ghl-mapping/GhlMappingAssistant.tsx` — orquestração do fluxo conversacional.
- `eb-dash2/src/components/ghl-mapping/GhlMappingChatInput.tsx` — textarea amigável com exemplos de descrição.
- `eb-dash2/src/components/ghl-mapping/GhlMappingProposalReview.tsx` — revisão visual da proposta com indicadores de confiança.
- `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx` — adicionadas abas "Assistente IA" (padrão) e "Mapeamento avançado", mais botão "Verificar novidades no GHL" no card de status.
- `eb-dash2/src/components/ghl-mapping/GhlMappingAssistant.tsx` — detecta itens pendentes, gera proposta só para o que falta e mostra mensagem amigável quando tudo já está mapeado.
- `eb-dash2/src/types/ghl-config.ts` — tipos da proposta (`GhlMappingProposal`, etc.).
- `docs/GHL-MAPPING-ASSISTENTE-IA.md` — documentação técnica completa.
- `docs/GHL-CONFIG-UI.md` e `docs/GHL-MAPPING-WIZARD.md` atualizados para refletir as duas abas.
- `CLAUDE.md` e `docs/MUDANCAS.md` atualizados.

**Regras críticas preservadas:**
- Modelos Anthropic/Claude/OpenAI **não** são usados. O modelo permitido é `qwen/qwen3.6-plus`.
- `GHL_API_KEY` e `OPENROUTER_API_KEY` nunca passam pelo frontend.
- Apenas `owner`/`admin` pode executar o assistente.
- O wizard técnico continua disponível na aba "Mapeamento avançado".

**Como validar:**
```bash
cd eb-dash2
npm run build
npx tsc --noEmit
```

---

## 2026-06-30 BRT — Página Admin redesenhada com GHL como protagonista

Redesenho da página inicial de administração (`/admin`) para tornar a integração GHL o elemento central e separar configurações de negócio das de plataforma. Decisão baseada no Conselho dos Mestres em `conselho-admin-dashboard-2026-06-30/`.

**O que foi entregue:**
- `eb-dash2/src/pages/admin/AdminPage.tsx` — nova estrutura com seções "Negócio" e "Plataforma".
- `eb-dash2/src/components/admin/GhlStatusCard.tsx` — card protagonista com status binário (desconectado/incompleto/conectado) e checklist de setup.
- `eb-dash2/src/components/layout/AdminMenu.tsx` — removido o item "Integração GHL" do dropdown Admin (acesso agora é pela `/admin`).
- `eb-dash2/tests/admin-nav.spec.ts` — testes atualizados para refletir nova navegação e conteúdo da `/admin`.
- `docs/ADMIN-DASHBOARD.md` — documentação técnica completa.
- `CLAUDE.md` e `docs/MUDANCAS.md` atualizados.

**Regras críticas preservadas:**
- A GHL API Key continua não sendo exposta no frontend.
- URL `/workspace/ghl-config` continua funcionando; a `/admin` apenas centraliza o acesso.

**Como validar:**
```bash
cd eb-dash2
npm run build
npx playwright test tests/admin-nav.spec.ts --reporter=line
```

---

## 2026-06-30 BRT — Assistente de Mapeamento GHL com Detecção de Mudanças

Novo wizard de onboarding para mapeamento GHL, pensado para usuários que conectam uma conta GHL do zero e para detectar alterações nos campos/pipelines/stages ao longo do tempo.

**O que foi entregue:**
- `eb-dash2/src/components/ghl-mapping/GhlMappingWizard.tsx` — wizard em 4 steps (obrigatórios, sugestões, pipelines/stages, revisão).
- `eb-dash2/src/components/ghl-mapping/RequiredFieldsStep.tsx` — confirmação de campos obrigatórios do template.
- `eb-dash2/src/components/ghl-mapping/SuggestedFieldsStep.tsx` — revisão de matches automáticos por similaridade.
- `eb-dash2/src/components/ghl-mapping/PipelineStageStep.tsx` — classificação de pipelines e stages.
- `eb-dash2/src/components/ghl-mapping/MappingReviewStep.tsx` — resumo antes do salvamento.
- `eb-dash2/src/lib/ghl-mapping.ts` — utilitários de inferência, cálculo de status e detecção de mudanças (`computeMappingChanges`).
- `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx` — integração do wizard na página de configuração; removida a UI legada de mapeamento.
- `docs/GHL-MAPPING-WIZARD.md` — documentação técnica completa.
- `tests/ghl-mapping-wizard.spec.ts` — testes de integração do wizard.
- `CLAUDE.md` e `docs/MUDANCAS.md` atualizados.

**Regras críticas preservadas:**
- A GHL API Key continua não sendo exposta no frontend.
- Cs testes de segurança existentes (`ghl-config-security.spec.ts`) continuam passando.

**Como validar:**
```bash
cd eb-dash2
npm run build
npx playwright test tests/ghl-mapping-wizard.spec.ts --reporter=line
```

---

## 2026-07-07 BRT — Fase 6: Replicação do Sistema Empire para Novos Clientes

Entrega da Fase 6 do plano de multiplicação do Sistema Empire (Opção A: instância isolada por cliente). Criado o processo/template de replicação para novos clientes, com banco zerado, deploy próprio e conexão facilitada à conta GHL.

**O que foi entregue:**
- `scripts/provision-new-client.ts` — script TypeScript executável via `npx tsx scripts/provision-new-client.ts`.
  - Dry-run por padrão; ações reais apenas com `--create-supabase` e/ou `--deploy-vercel`.
  - Valida inputs obrigatórios e recebe secrets via prompt ou argumentos/env vars.
  - Aplica migrations (`supabase db push`).
  - Configura secrets das edge functions.
  - Faz deploy das edge functions.
  - Cria workspace inicial via RPC `create_workspace_with_owner`.
  - Faz seed de apps/permissões via `setup_workspace_apps_and_permissions`.
  - Importa template `Empire Default` para o workspace.
  - Gera URL do webhook e instruções finais.
  - Prepara/deploya frontend no Vercel.
- `.env.new-client-template` — template de variáveis de ambiente para Vercel com placeholders `<preencher>`.
- `docs/ONBOARDING-NOVO-CLIENTE.md` — passo a passo completo de onboarding.
- `docs/REPLICACAO-TECNICA.md` — arquitetura de replicação e processo de atualização em lote.
- `CLAUDE.md`, `docs/ROADMAP.md` e `docs/MUDANCAS.md` atualizados.

**Regras críticas preservadas:**
- `ghl_api_key`, `SUPABASE_SERVICE_ROLE_KEY` e `WEBHOOK_SECRET` nunca são commitados.
- O script usa prompt/env vars para receber secrets.
- `.env.new-client-template` é um template com placeholders e pode ser versionado.

**Como validar:**
```bash
# Dry-run
npx tsx scripts/provision-new-client.ts \
  --client-name "teste" \
  --workspace-name "Teste Empire" \
  --owner-email "teste@example.com" \
  --supabase-url "https://<ref>.supabase.co" \
  --supabase-anon-key "<anon>" \
  --supabase-service-role-key "<service-role>" \
  --ghl-api-key "<token>" \
  --ghl-location-id "<location>"
```

---

## 2026-07-07 BRT — Fase 5: Credenciais GHL por Workspace e Rastreamento de Webhooks por Location

Entrega da Fase 5 do plano de multiplicação do Sistema Empire (Opção A: instância isolada por cliente). As credenciais GHL continuam sendo secrets da instância, mas agora o sistema registra qual `location_id` enviou cada webhook e oferece uma edge function segura de onboarding.

**O que foi entregue:**
- `supabase/migrations/20260708000006_add_location_id_to_webhooks_ghl.sql` — adiciona coluna `location_id` em `webhooks_ghl` e cria índice `idx_webhooks_ghl_location_id` (sem backfill automático para evitar timeout em tabelas grandes).
- `supabase/functions/webhook-ghl/index.ts` — extrai `locationId` do payload (`locationId`, `location.id`, `location_id`) e grava em `webhooks_ghl.location_id`, mantendo resposta `202` e todo o processamento assíncrono existente.
- `supabase/functions/setup-ghl-integration/index.ts` — nova edge function que recebe `{ workspace_id, ghl_api_key, ghl_location_id, webhook_secret? }`, valida JWT internamente, verifica `owner`/`admin` do workspace e faz upsert em `ghl_integration_settings`. Retorna apenas máscara da API key.
- `supabase/config.toml` — registra `[functions.setup-ghl-integration]` com `verify_jwt = false`.
- `docs/GHL-CREDENCIAIS.md` — documentação técnica completa.
- `CLAUDE.md`, `docs/ROADMAP.md` e `docs/MUDANCAS.md` atualizados.

**Regras críticas preservadas:**
- `ghl_api_key` nunca retorna na resposta da edge function (apenas máscara).
- Apenas `owner`/`admin` do workspace pode chamar `setup-ghl-integration`.
- `webhook-ghl` continua respondendo `202` imediatamente.

**Como validar:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'webhooks_ghl' AND column_name = 'location_id';

SELECT id, location_id FROM webhooks_ghl
WHERE location_id IS NOT NULL ORDER BY created_at DESC LIMIT 5;
```

---

## 2026-07-08 BRT — Fase 4: Refatoração da Extração GHL com Mapeamentos por Workspace

Refatorada a extração de dados dos webhooks GHL para usar os mapeamentos configuráveis por workspace (`ghl_field_mappings`), sem modificar a função `extrair_dados_ghl()` original.

**O que foi entregue:**
- `supabase/migrations/20260708000000_update_empire_default_template_full.sql` — atualização do template `Empire Default` com todos os campos necessários para equivalência exata entre v1 e v2.
- `supabase/migrations/20260708000001_create_ghl_field_mapping_helpers.sql` — helpers SQL:
  - `resolve_ghl_field_value(payload, variations)` — extrai valor do payload tentando variações de chave (simples, aninhadas, custom fields `{{opportunity.xxx}}`).
  - `apply_ghl_field_mappings(workspace_id, payload)` — retorna `{logical_name: valor}` para mapeamentos ativos.
  - `get_workspace_id_by_ghl_location_id(location_id)` — resolve workspace a partir do `locationId` do payload.
- `supabase/migrations/20260708000002_seed_ghl_field_mappings_for_workspaces.sql` — seed do template `Empire Default` para workspaces existentes e trigger para seed automático de novos workspaces.
- `supabase/migrations/20260708000003_create_extrair_dados_ghl_v2.sql` — nova função `extrair_dados_ghl_v2()` com mesma assinatura da v1, populando `contatos` e `oportunidades` via mapeamentos.
- `supabase/migrations/20260708000004_create_test_extrair_dados_ghl_v2.sql` — função `test_extrair_dados_ghl_v2_equivalence(limit)` para comparar v1 e v2 em webhooks reais recentes.
- `supabase/migrations/20260708000005_switch_trigger_to_extrair_dados_ghl_v2.sql` — `trigger_extrair_dados_ghl()` agora chama `extrair_dados_ghl_v2()`.
- `tests/sql/test_extrair_dados_ghl_v2_equivalence.sql` — teste sintético com transação `BEGIN`/`ROLLBACK`.
- `docs/GHL-MAPEAMENTO-REFATORACAO.md` — documentação técnica completa.
- `CLAUDE.md`, `docs/ROADMAP.md` e `docs/MUDANCAS.md` atualizados.

**Regras críticas preservadas:**
- UTM sempre sobrescreve (via variações no mapeamento).
- `pipeline_id` nunca fica NULL no UPDATE (`COALESCE` com valor existente).
- `data_lead_recebido` não vem do webhook.
- Cache de nome/email em oportunidades.
- Enfileiramento de sync SDR (followers) mantido.

**Como validar:**
```sql
BEGIN;
SELECT * FROM test_extrair_dados_ghl_v2_equivalence(50);
ROLLBACK;
```

---

## 2026-07-07 BRT — Fase 3: Interface de Configuração GHL (UI)

Criada a interface do frontend para configurar a integração GoHighLevel e mapear campos, pipelines e stages de forma visual e amigável.

**O que foi entregue:**
- `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx` — página `/workspace/ghl-config` usando `PageShell` e design DS1 Silver Empire v2.0.
  - Seção de configuração de integração com inputs para `ghl_api_key` (type="password", nunca exibida após salva), `ghl_location_id` e `webhook_secret`.
  - Card com URL do webhook `https://<projeto>.supabase.co/functions/v1/webhook-ghl` e botão copiar.
  - Botão "Descobrir campos do GHL" que invoca a edge function `discover-ghl-config`.
  - Tabelas de mapeamento de campos, pipelines e stages com sugestões automáticas por similaridade de nome.
  - Botão "Salvar mapeamentos" que persiste em `ghl_field_mappings`, `ghl_pipeline_mappings` e `ghl_stage_mappings`.
- `eb-dash2/src/hooks/useGhlIntegrationSettings.ts` — CRUD de `ghl_integration_settings` sem expor `ghl_api_key`.
- `eb-dash2/src/hooks/useGhlFieldMappings.ts` — CRUD de `ghl_field_mappings`.
- `eb-dash2/src/hooks/useGhlPipelineMappings.ts` — CRUD de `ghl_pipeline_mappings`.
- `eb-dash2/src/hooks/useGhlStageMappings.ts` — CRUD de `ghl_stage_mappings`.
- `eb-dash2/src/hooks/useGhlDiscovery.ts` — chamada à edge function `discover-ghl-config`.
- `eb-dash2/src/hooks/useGhlFieldMappingTemplates.ts` — listagem do template `Empire Default`.
- `eb-dash2/src/types/ghl-config.ts` — tipagens das tabelas, discovery e enums.
- `eb-dash2/src/App.tsx` — rota `/workspace/ghl-config` protegida por `AdminRoute`.
- `eb-dash2/src/components/layout/WorkspaceLayout.tsx` — item "Integração GHL" no menu do workspace admin.
- `eb-dash2/src/components/layout/AdminMenu.tsx` — atalho no dropdown admin do header.
- `docs/GHL-CONFIG-UI.md` — documentação técnica da interface.
- `CLAUDE.md`, `docs/ROADMAP.md` e `docs/MUDANCAS.md` atualizados.

**Segurança:**
- Página acessível apenas para `owner`/`admin` via `AdminRoute`.
- `ghl_api_key` nunca selecionada nem renderizada em texto legível no frontend.
- Persistência respeita RLS das tabelas de mapeamento.

**Regras críticas:**
- Todos os hooks usam `getWorkspaceId()` para resolver o workspace atual.
- Edge function `discover-ghl-config` é chamada com `workspace_id` no body.

---

## 2026-07-07 BRT — Fase 2: Edge Function `discover-ghl-config`

Criada a edge function `discover-ghl-config` para descoberta automatizada de campos customizados e pipelines de uma conta GoHighLevel, permitindo configurar novos workspaces Empire sem hard-coded fields.

**O que foi entregue:**
- `supabase/functions/discover-ghl-config/index.ts` — edge function que:
  - Valida JWT internamente.
  - Verifica se o usuário é `owner`/`admin` do workspace.
  - Lê `ghl_api_key` e `ghl_location_id` de `ghl_integration_settings` com service role.
  - Consulta a API GHL:
    - `GET /locations/{locationId}/customFields?model=contact`
    - `GET /locations/{locationId}/customFields?model=opportunity`
    - `GET /pipelines` (com fallback para `/opportunities/pipelines?locationId={locationId}`)
  - Aplica rate limiting local básico (130 ms entre requests, retry em 429, timeout 15s).
  - Normaliza a resposta em arrays tipados (`contact_custom_fields`, `opportunity_custom_fields`, `pipelines` com `stages`).
  - Registra cada discovery em `ghl_discovery_runs` com `source`, `payload` e `status`.
  - Retorna mensagens amigáveis em caso de erro e nunca expõe a `ghl_api_key`.
- `supabase/functions/discover-ghl-config/config.toml` — `verify_jwt = false` (validação interna).
- `supabase/config.toml` — registrada `[functions.discover-ghl-config]` e corrigida `[functions.workspace-apps]` para `verify_jwt = false` (alinhado com a documentação existente).
- `docs/GHL-DISCOVERY.md` — documentação técnica completa da edge function.
- `CLAUDE.md`, `docs/ROADMAP.md` e `docs/MUDANCAS.md` atualizados.

**Segurança:**
- `ghl_api_key` lida apenas via service role no servidor.
- Resposta inclui apenas máscara da chave (`ghl_api_key_mask`).
- CORS básico via `_shared/cors.ts`.

**Testes:**
- Validação de sintaxe com `deno check`.
- Testes com mocks realistas da API GHL para validar normalização (sem credenciais reais disponíveis).

---

## 2026-07-07 18:47 BRT — Fase 1: Fundação do mapeamento GHL multi-conta

Criada a base de dados para replicar o Empire em múltiplas contas GoHighLevel sem hard-coded custom fields.

**Tabelas criadas:**
- `ghl_integration_settings` — credenciais e configuração de webhook por workspace.
- `ghl_field_mappings` — mapeamento de campos lógicos do Empire para chaves reais do GHL.
- `ghl_pipeline_mappings` — categorização de pipelines GHL (`pre_vendas`, `vendas`, `recuperacao`, `excluir`, `outro`).
- `ghl_stage_mappings` — mapeamento de estágios/columns GHL para estágios canônicos do Empire.
- `ghl_field_mapping_templates` — templates globais para seed inicial de novos workspaces.
- `ghl_discovery_runs` — log de auditoria das descobertas de campos/pipelines.

**Segurança:**
- RLS ativado em todas as tabelas.
- `SELECT` liberado para qualquer membro ativo do workspace.
- `INSERT`/`UPDATE`/`DELETE` restrito a `owner`/`admin`.
- `service_role` mantém acesso total.
- `ghl_api_key` armazenada em texto, mas **nunca exposta no frontend React**.

**Seed:** template `Empire Default` preenchido com os campos lógicos do Empire (datas de tentativa, conectado, perdido, agendamento, vendas, reunião, UTM/TT, etc.).

**Regras críticas:**
- `extrair_dados_ghl()` ainda **não** foi alterada — adaptação ao mapeamento é da Fase 4.
- Pipeline `excluir` / `is_excluded = true` devem ser ignorados pelos painéis.

**Arquivos:** `supabase/migrations/20260707000000_create_ghl_mapping_foundation.sql`, `docs/GHL-MAPEAMENTO-CAMPOS.md`.

---

## 2026-07-06 BRT — Fix crítico: data_agendamento_reuniao/data_agendamento_vendas sobrescritos silenciosamente pelo webhook

Usuário reportou que adicionar manualmente a tag "agendado" num lead no GHL mudou o KPI "agendamentos nos últimos 7 dias" (Visão Geral/Aquisição/Produtividade). Investigação (2 rodadas de agentes) descobriu que:

- A tag em si nunca é lida como sinal de agendamento em lugar nenhum do código.
- Mas `oportunidades.data_agendamento_reuniao` (o campo que alimenta esse KPI) era preenchido pelo webhook `extrair_dados_ghl` **sem nenhuma guarda** — a cada webhook, o valor era sobrescrito a partir do `customData` daquele payload específico. Se o payload não trouxesse os campos esperados (`mqlreunio_marcada`/`sqlreunio_agendada`), o valor correto de uma sincronização anterior era apagado ou substituído por um snapshot desatualizado. A ação de tagear no GHL provavelmente disparou um webhook cujo `customData` continha um valor de reunião que nunca tinha sido sincronizado antes.
- Query de diagnóstico real (últimos 90 dias, antes da correção): de 271 oportunidades com algum sinal de agendamento, só **20** tinham `data_agendamento_reuniao` e `data_reuniao_agendada` (a fonte confiável, sincronizada com a API GHL a cada 5 min) concordando. 205 tinham os dois campos preenchidos só que **divergentes**.

**Correção** (mesmo padrão já usado pra `data_reuniao_agendada` em março — migration `20260326110000`): em vez de criar um trigger novo baseado em tag (só corrigiria leads tageados manualmente), a edge function `sync-appointment-dates` — que já roda a cada 5 min e já reconfirma com a API GHL — passou a escrever também em `data_agendamento_reuniao` e `data_agendamento_vendas` (os 3 campos sempre recebem o mesmo valor). O webhook parou de tocar nesses 2 campos (migration `20260706000000`).

Rodado backfill manual (3 lotes de 200) pra corrigir o histórico na hora: "ambos os campos concordando" subiu de 20 para 190+ opps em poucos minutos; o resto converge sozinho via cron nos próximos ciclos.

**Arquivos:** `supabase/functions/sync-appointment-dates/index.ts`, migration `20260706000000_remove_data_agendamento_reuniao_vendas_from_webhook.sql`, `docs/SYNC-APPOINTMENT-DATES.md`.

---

## 2026-07-05 BRT — Disparos: "converteu" no lugar de "comprou", custo estimado por mensagem WhatsApp e campos manuais

Três pedidos do usuário no mesmo pacote:

1. **Rename `comprou` → `converteu`** — o significado de tag mais genérico, já que conversão pode ser agendamento, lead qualificado, etc., não só compra. Renomeado em `disparo_tags.significado` (CHECK constraint + dados existentes), `v_disparo_metricas.converteu_count`, e em todos os componentes de UI (`DisparoConfigForm`, `DisparoMetricCards`, `DisparoMetricsTable`, `DisparoBarChart`, `DisparoFunnel`).
   - **Bug latente corrigido de graça:** `disparo_tags` tinha um trigger (`trigger_update_disparo_tags_updated_at`) apontando pra uma coluna `updated_at` que **nunca existiu** na tabela desde a criação do módulo — qualquer `UPDATE` (inclusive upsert de tags) quebrava com `record "NEW" has no field "updated_at"`. Nunca foi percebido porque toda escrita em `disparo_tags` até agora era `INSERT` puro. Corrigido adicionando a coluna.

2. **Custo estimado por disparo** — pesquisado como funciona a cobrança da Meta no WhatsApp Business Platform: desde jul/2025 ela cobra por mensagem de template **entregue** (não mais por conversa de 24h), com preço por categoria (`marketing`, `utility`, `authentication`, `service`) variando por país. Implementado:
   - `disparos.tipo_mensagem` (`marketing`/`utility`) — qual categoria de template aquele disparo usa.
   - Nova tabela `whatsapp_pricing_config` (uma linha por workspace) — o usuário configura quanto paga por mensagem em cada categoria (não dá pra usar uma tabela global, o preço varia por mercado).
   - `v_disparo_metricas.custo_estimado = trigger_count × preço da categoria` — `trigger_count` (contatos com a tag de disparo) é usado como proxy do volume de mensagens entregues; documentada a limitação de não ser reconciliação exata de fatura.
   - Novo card "Custo estimado" em `DisparoMetricCards`, coluna em `DisparoMetricsTable`, e resumo geral agregado (`DisparoResumoGeral`) com custo total e custo por conversão no topo do Dashboard.
   - UI de configuração: `WhatsappPricingCard.tsx`.

3. **Campos manuais customizáveis por disparo** — o usuário pode cadastrar campos extras (texto/número/moeda/data) pra preencher à mão por disparo, sem depender de tag do GHL (ex: "Faturamento confirmado"). Novas tabelas `disparo_campos_custom` (definição, por workspace) e `disparo_campos_custom_valores` (valor por disparo). UI: `DisparoCamposCustomManager.tsx` (gerenciar definições, na aba Configuração), `DisparoCamposCustomEditor.tsx` (preencher valores, na edição do disparo), `DisparoCamposCustomValoresView.tsx` (exibição no Dashboard quando o disparo está selecionado).

**Arquivos:** migration `20260705000021_disparos_converteu_custo_campos_manuais.sql`; novos hooks `useWhatsappPricing.ts`, `useDisparoCamposCustom.ts`; `types/disparos.ts`, `useDisparos.ts`, `docs/PLANO-MODULO-DISPAROS.md` atualizados.

---

## 2026-07-05 BRT — SDR IA: critérios de auditoria (tags/pipelines/UTMs) viram configuráveis

Pedido do usuário: poder escolher livremente quais tags, pipelines e UTMs contam como critério de inclusão na Auditoria IA — inclusive deixando 100% aberto (sem filtro nenhum). Antes disso, `useAuditoriaIA.ts` tinha os critérios hardcoded: tag `ilike('tags', '%[cp] sdr ia%')`, exclusão fixa do pipeline Vendas SQL (`PIPELINE_VENDAS_SQL_ID`) via `buildSdrMap()`, e nenhum filtro de UTM existia.

**Banco:**
- Migration `20260705000020_sdr_ia_config.sql` — tabela `sdr_ia_config` (uma linha por workspace, colunas `tags_filter`/`pipelines_filter`/`utm_source_filter`/`utm_campaign_filter` em `jsonb`, formato `{include:[],exclude:[]}`). Seed automático pros workspaces existentes reproduzindo o comportamento hardcoded anterior (tag `[cp] sdr ia` incluída, pipeline Vendas SQL excluído), pra não mudar silenciosamente o que já aparecia na auditoria. RLS: leitura por qualquer membro do workspace, escrita via nova função `can_write_sdr_ia_config()` (admin/owner OU `can_edit=true` explícito na feature `sdr-ia.configuracao` — mesmo padrão de `can_write_disparos()`).

**Frontend:**
- Novo hook `eb-dash2/src/hooks/useSdrIaConfig.ts` — `useSdrIaConfig()` (lê/grava a config) e `useSdrIaFilterOptions()` (enumera tags/pipelines/UTM source/UTM campaign reais do workspace, paginado, pra popular os seletores).
- `useAuditoriaIA.ts` — todos os 6 fetchers (sem follow-up, erro de entrega, spam, horário inadequado, conversa unilateral, conflito humano) e `buildSdrMap()` passaram a receber a config e aplicá-la: tags via `tagFilterMatches()` (client-side, evita `ilike`/`.or()` com string não escapada, mesmo cuidado do fix em `useDisparoContacts`), pipeline/UTM via `applyIncludeExclude()` (`.in()`/`.neq()` no banco).
- Nova aba **Configuração** em `/sdr-ia?tab=configuracao` (`eb-dash2/src/pages/sdr-ia/tabs/ConfiguracaoTab.tsx`) — 4 `MultiSelectFilter` (Tags, Pipelines, Origem, Campanha) com o mesmo padrão tri-state (incluir/excluir/neutro) usado no resto do dashboard; botão "Deixar 100% aberto" limpa tudo de uma vez. `SdrIaPage.tsx` ganhou abas (Auditoria IA / Configuração) — conteúdo antigo extraído pra `tabs/AuditoriaTab.tsx`.
- Nova feature `sdr-ia.configuracao` registrada em `features.ts` (default: owner/admin) e `navigation.ts`/`types/users.ts` (MODULE_TREE) atualizados.

**Testado via Playwright:** aba Configuração carrega com os valores seedados corretos (chip "[cp] sdr ia" incluído, chip "≠ ZWuCjEXM2VDyLCx8CtGU" excluído), botão "Deixar 100% aberto" limpa e mostra aviso, salvar grava e mostra toast de sucesso. Config restaurada ao valor original depois do teste.

---

## 2026-07-05 BRT — Disparos: campo de tag vira combobox buscável com tags reais do GHL

Pedido do usuário ao ver o formulário "Novo Disparo": "aqui deveria ser mais user-friendly. Deveria ter uma lista buscável de todas as tags do GHL conectado". Antes, os 6 campos de tag (Disparo, Respondeu, Pediu para parar, Erro, Não respondeu, Comprou) eram `<Input>` de texto livre — exigia digitar a tag exatamente como aparece no GHL, sem nenhuma ajuda visual ou validação de existência.

**Implementação:**
- Novo hook `useAllGhlTags()` em `eb-dash2/src/hooks/useDisparos.ts` — pagina `contatos.tags` (filtrado por `workspace_id`, com `.range()` seguindo o padrão anti-truncamento de 1000 linhas do PostgREST), usa `parseTags()` (já existente em `useTrafego.ts`) pra separar cada tag, deduplica num `Set` e retorna ordenado alfabeticamente (`localeCompare` pt-BR).
- Novo componente `eb-dash2/src/pages/disparos/components/TagCombobox.tsx` — combobox de valor único: mostra um `Input` com ícone de busca/loading, abre dropdown ao focar com até 100 opções filtradas por substring conforme o usuário digita, permite clicar numa opção ou continuar digitando um valor que ainda não existe em nenhum contato (útil pra tags que serão aplicadas no GHL só depois de o disparo já estar configurado).
- `DisparoConfigForm.tsx` — os 6 campos de tag trocaram de `<Input>` para `<TagCombobox options={allGhlTags} loading={tagsLoading} />`.

**Testado via Playwright:** dropdown abre ao focar (100+ tags reais carregadas do banco), filtro por substring funciona (`"mql"` → 4 resultados), clicar numa opção preenche o campo corretamente, digitar uma tag inexistente mostra aviso "será usada como digitada" sem bloquear o formulário, dropdown fecha ao clicar fora, zero erros JS no console.

---

## 2026-07-05 BRT — Testado end-to-end: constraint quebrada em creative_tests

Pedido do usuário: "testa logo tudo então. não deixe nenhuma dúvida" — testei os 16 fixes da auditoria via Playwright real (não só `tsc`). Achado um 17º bug no processo, mais grave que o original:

**`creative_tests_status_check`** — a constraint viva em produção só aceitava valores em inglês (`running`, `completed`, `cancelled`, `paused`), mas todo o código do app (`useCreativeTests.ts`, `TestesTab.tsx`) sempre usou português (`em_andamento`, `concluido`, `cancelado`) — nenhuma migration no repo define os valores em inglês, mudança feita fora do fluxo de migrations em algum momento. Resultado: **"Iniciar Teste" nunca funcionou de fato em produção**, mesmo depois do fix do nome de tabela (`notion_creativos` → `notion_creatives`). As 2 linhas existentes com `status='running'` eram artefatos de debug de outra sessão ("codex-status-probe"), sem atividade real — migradas para `cancelado`.

Migration: `20260705000019_fix_creative_tests_status_check.sql`.

**Testes confirmados via Playwright (fluxo real, não só compilação):**
- ✅ Iniciar Teste em Criativos → cria `creative_tests` + `creative_test_history`, atualiza `notion_creatives.status/test_status`, sem erros.
- ✅ Disparos: contato só-com-trigger (sem resposta/compra) aparece em "Últimos contatos" (bug AND/OR corrigido).
- ✅ Disparos: contato com tag parecida por substring (não exata) NÃO aparece por engano (falso positivo corrigido).
- ✅ Validação de tag duplicada bloqueia o submit com mensagem clara.
- ✅ Ranking de Criativos, Leads (Lista/Limpeza), Relatórios (Cohort/Automações) carregam sem erro após os filtros de workspace.
- ✅ Lista de módulos de relatório unificada mostra os 9 itens (Aquisição/SDR/Closer/Metas que faltavam antes).

**Achado não corrigido (fora do escopo dos 16+1 bugs, reportado à parte):** warning de React "duas chaves iguais" em `/relatorios?tab=cohort` (semanas `2026-W21`/`2026-W20` duplicadas) — não trava a tela, mas indica dado duplicado ou key mal formada na tabela de cohort semanal.

---

## 2026-07-05 BRT — Auditoria Completa: 16 Bugs Corrigidos

Usuário pediu uma auditoria completa depois da sequência de bugs encontrados no discador e no Disparos. Rodei 3 investigações paralelas (catálogos duplicados, módulo Disparos, Criativos/Leads/Traqueamento) e confirmei manualmente os achados. Resultado: 16 bugs reais, corrigidos nesta sessão.

**P0 — Funcionalidade quebrada:**
- `useCreativeTests.ts:121` — tabela `notion_creativos` (não existe) → `notion_creatives`. Quebrava "Iniciar Teste" por completo em Criativos e deixava registros órfãos em `creative_tests` (sem transação).
- `useDisparos.ts` (`useDisparoContacts`) — `.filter()` + `.or()` eram ANDados pelo PostgREST, excluindo contatos que só tinham a tag de trigger (ainda sem resposta/compra/etc.) da tabela "Últimos contatos". Reescrito pra filtrar exato client-side com `tagMatches()` — também elimina falsos positivos de match por substring e a interpolação sem escape no `.or()`.

**P1 — Vazamento de dados entre workspaces (usuários com 2+ workspaces):**
- `useCreativeRankingData.ts` — query de `oportunidades` e `vendas_fechamento` no Ranking de Criativos não filtravam por workspace. `utm_campaigns` também sem filtro.
- `useCriativosFilters.ts` — dropdowns de canal/funil/campanha do Ranking sem filtro de workspace.
- RLS de `disparos`/`disparo_tags` — exigia `is_workspace_admin` pra escrita, ignorando overrides de permissão granular (`app_feature_user_overrides`/`app_feature_role_permissions`). Nova função `can_write_disparos()` respeita os dois sistemas.

**P2 — Qualidade de dados:**
- `v_disparo_metricas` — `primeiro_trigger`/`ultimo_trigger` usavam `contatos.date_created` (data de criação do contato) em vez de quando a tag foi aplicada. Trocado por `updated_at`.
- `DisparoConfigForm.tsx` — validação de tag duplicada entre significados antes de submeter (evita erro de constraint cru).

**P3 — Paginação (padrão de bug já documentado no CLAUDE.md — PostgREST corta em 1000 linhas):**
- `useCreativeRankingData.ts` e `useTrafego.ts` (2 ocorrências) — queries de `vendas_fechamento` sem `.range()`.
- `useLeads.ts` — dropdowns de filtro (pipeline/UTM source/closer) com `.limit(1000)` sem paginação.
- `LimpezaTab.tsx` — busca de contatos/oportunidades de teste e validação de bulk-delete sem paginação/chunking.

**P4 — Catálogos duplicados/desatualizados:**
- `useDiscagemScore.ts` importava uma cópia própria dos nomes de pipeline de discagem em vez de `lib/constants.ts` (`PIPELINE_DISCAGEM_NAMES`).
- `AlertasCard.tsx` — comentário documentando por que o alerta de reuniões cobre todos os leads (decisão do usuário), diferente do escopo do discador.
- `MODULE_TREE` (`types/users.ts`) — faltavam 5 apps (organico, criativos, sdr-ia, relatorios, disparos) na tela antiga de permissões.
- Duas listas divergentes de módulos de relatório semanal (`AutomationForm.tsx` só tinha 9, `RelatoriosPage.tsx` só 5) — unificadas em `lib/relatorios/moduleOptions.ts`.

**Migrations:** `20260705000017_disparos_rls_respeita_feature_permission.sql`, `20260705000018_disparo_metricas_trigger_date_fix.sql` — aplicadas em produção.

---

## 2026-07-05 BRT — Fix: App Disparos Não Aparecia (APP_CATALOG Desatualizado)

**Arquivos alterados:**
- `supabase/functions/workspace-apps/index.ts`

### O que mudou

1. Usuário reportou "o app de disparos não funciona". Diagnóstico: `workspace_apps` tinha `disparos` ativo, `app_role_permissions`/permissões estavam OK, mas a edge function `workspace-apps` (que monta a lista de apps retornada ao frontend) tem um `APP_CATALOG` **hardcoded duplicado** do catálogo em `eb-dash2/src/types/apps.ts` — e esse catálogo da edge function nunca foi atualizado quando o módulo Disparos foi criado.
2. Como a função só monta a resposta iterando sobre `APP_CATALOG` (não sobre `workspace_apps` diretamente), `disparos` nunca aparecia na lista de apps do usuário — fazendo `PermissionRoute` redirecionar `/disparos` pra home sempre, independente de estar ativo/permitido no banco.
3. Fix: adicionado `{ slug: 'disparos', label: 'Disparos', icon: 'send' }` ao `APP_CATALOG` da edge function, replicando a entrada que já existia em `types/apps.ts`. Deploy feito via `supabase functions deploy workspace-apps`.
4. Verificado com usuário de teste autenticado: `disparos` agora retorna `is_active: true, allowed: true`.

### Débito técnico

Duas fontes de verdade para `APP_CATALOG` (edge function + frontend) que podem divergir de novo no futuro. Idealmente a edge function deveria derivar o catálogo de uma fonte única (tabela ou config compartilhada) em vez de um array hardcoded duplicado.

---

## 2026-07-05 BRT — lead_novo Ordenado Estritamente por Horário de Chegada

**Arquivos alterados:**
- `supabase/migrations/20260705000015_discagem_recencia_intradiaria.sql` — novo
- `supabase/migrations/20260705000016_discagem_lead_novo_ordem_cronologica.sql` — novo
- `docs/DISCADOR-PRE-VENDAS.md`

### O que mudou

1. Usuário reportou: "os leads 'chegou hoje' têm que ser organizados por horário. os que chegaram neste exato momento têm que ir sempre pro topo". Diagnóstico: o componente "recência" do score composto decaía ao longo de 30 dias inteiros — dois leads chegados no mesmo dia em horários diferentes ficavam com diferença de só ~10 pontos (de 1000), deixando MQL/canal/fadiga decidirem a ordem em vez do horário de chegada.
2. Fix 1 (`20260705000015`): recência passa a decair de 1000 a 0 em 24h (não mais 30 dias). Melhorou, mas MQL/canal/fadiga ainda tinham peso (30%) suficiente pra inverter a ordem em casos reais.
3. Fix 2 (`20260705000016`): `lead_novo` ganhou faixa própria (0-899), igual `horario_marcado` já tinha — decai só pelo tempo desde `data_lead_recebido` (899 → 0 em 24h), sem misturar com sinal/MQL/canal/fadiga. Resultado verificado: 5 leads chegados em horários diferentes hoje ficaram em ordem perfeitamente cronológica (27min→882, 325min→696, 415min→640, 829min→381).
4. Razão exibida no card também melhorou: agora mostra "chegou há X min" em vez de só "Novo hoje" quando o lead ainda não teve nenhuma tentativa.

---

## 2026-07-05 BRT — Corrige Tasks Zumbis e Vazamento Cross-Pipeline no Discador

**Arquivos alterados:**
- `supabase/migrations/20260705000013_discagem_fix_tasks_zumbis.sql` — novo
- `supabase/migrations/20260705000014_discagem_task_oportunidade_mais_recente.sql` — novo
- `docs/DISCADOR-PRE-VENDAS.md`

### O que mudou

1. Usuário reportou "leads antigos acima de leads novos" e "critérios estranhos" na fila após a Recuperação entrar no discador. Investigação: `ghl_tasks` não tem `oportunidade_id` (só `contato_id`). A detecção de `horario_marcado` buscava qualquer task pendente com `due_date <= hoje`, sem limite de quão atrasada.
2. Levantamento: das 192 tasks pendentes no banco, **148 estavam atrasadas entre 31-90 dias** — tasks abandonadas no GHL, nunca marcadas como concluídas — e cada uma dava score fixo 900-1000 pra qualquer oportunidade aberta daquele contato, indefinidamente.
3. Fix 1 (`20260705000013`): task só conta como `horario_marcado` com **até 48h de atraso**. Resultado: tasks ativas caíram de 46 para 8 no total (Pré-Vendas: 29→8, Recuperação: 17→0).
4. Fix 2 (`20260705000014`): regra do usuário — "vale a oportunidade mais recente dele". Task agora só é atribuída à oportunidade **mais recente** do contato entre os pipelines válidos do discador, evitando que a mesma task vaze pra oportunidades antigas de outro pipeline do mesmo contato.
5. Verificação pós-fix: os 8 casos restantes em Pré-Vendas mencionando "de Recuperação" no texto **não são bug** — são contatos cuja única/mais recente oportunidade válida é Pré-Vendas MQL; "Recuperação" no título é o nome de uma campanha/automação de reengajamento do GHL, não o pipeline do contato.

---

## 2026-07-05 BRT — Discador de Recuperação (reaproveitando o motor existente)

**Arquivos alterados:**
- `supabase/migrations/20260705000012_discagem_recuperacao.sql` — novo
- `eb-dash2/src/hooks/useDiscagemScore.ts`, `eb-dash2/src/pages/prevendas/tabs/DiscagemTab.tsx`
- `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx`, `eb-dash2/src/lib/apps/navigation.ts`

### O que mudou

1. Usuário reportou que o discador ficou "muito pobre" após o rewrite — leads do pipeline `Recuperação` com tasks do GHL (respostas de reengajamento) tinham sumido, porque nunca estiveram no filtro (`pipeline_name IN ('Pré-Vendas MQL', 'Auto Agendamento')`).
2. Decisão: leads de Recuperação devem aparecer na fila da **página de Recuperação**, não misturados com Pré-Vendas. Pré-Vendas nMQL continua fora por enquanto.
3. Em vez de duplicar a engine de score/camada, `recalcular_discagem_scores()` foi estendida para também pontuar o pipeline `Recuperação`, marcando cada linha com a nova coluna `discagem_scores.escopo` (`pre_vendas` | `recuperacao`).
4. `useDiscagemScore(sdrFilter, scope)` ganhou o parâmetro `scope` — filtra por `escopo` e pula a busca de reengajamento (`buscar_reengajamento`) quando `scope !== 'pre_vendas'`, já que Recuperação **é** o reengajamento.
5. `DiscagemTab` ganhou prop `scope` (default `'pre_vendas'`) — reaproveitado como `<DiscagemTab scope="recuperacao" />` na nova aba "Discagem" de `RecuperacaoPage.tsx`. Sidebar (`navigation.ts`) atualizado com a nova sub-aba.
6. Resultado após aplicar em produção: 1.820 leads de Recuperação passaram a aparecer na fila (antes: 0).

---

## 2026-07-05 BRT — Score Composto do Discador Baseado em Dados Reais (Wave 3, item 4.5)

**Arquivos alterados:**
- `supabase/migrations/20260705000011_discagem_score_composto.sql` — novo
- `docs/DISCADOR-PRE-VENDAS.md`

### O que mudou

1. **Análise de dados real** (não estimativa): comparei 122 vendas pagas (`vendas_fechamento.data_pagamento_entrada IS NOT NULL`) contra ~6.000 contatos que passaram por pré-vendas/vendas. Achado principal: responder (inbound) é o sinal mais forte e desproporcional (58.8% vs 41.7% dos não-compradores, 5.5x mais mensagens recebidas); velocidade do primeiro contato também importa muito (mediana 5.5d vs 19.9d); tag MQL tem sinal real mas moderado (43.4% vs 34.6%); tentativas de call isoladas **não** preveem venda (compradores tiveram até menos tentativas de call puro).
2. Pesos aprovados pelo usuário com base nesses dados: sinal de resposta 40%, recência/velocidade 30%, qualificação MQL 15%, engajamento por canal certo 10%, fadiga de tentativas 5% (penalidade).
3. `recalcular_discagem_scores()` reescrita: `score` agora é uma soma ponderada única e contínua dos 5 sub-scores (cada um 0-1000), substituindo o esquema anterior de faixas fixas por camada (`respondeu` 0-1000 / `horario_marcado` 0-950 / `lead_novo` 0-900 / `cadencia` 0-80).
4. Exceção: `horario_marcado` (task GHL agendada) continua com prioridade fixa 900-1000 fora do composto — é compromisso operacional, não sinal de qualidade do lead.
5. `camada` agora é só rótulo visual (ícone/cor do card), não limita mais a faixa do score.
6. Nova coluna `discagem_scores.score_qualificacao` (sub-score MQL, para auditoria). `score_fonte` foi ressemantizado de "qualidade do UTM source" (nunca usado de fato) para "engajamento por canal".

### Débito conhecido

- Pesos fixos na função SQL — não há tabela `discagem_config` configurável por workspace (fora do escopo desta rodada).
- **Migration não aplicada em produção ainda** — precisa de `supabase db push` e validação do cron `recalcular-discagem-scores` após o deploy, já que reescreve uma função crítica chamada a cada 2 min.

---

## 2026-07-05 BRT — Isolamento de Workspace no Discador (Wave 3, item 4.3-4.4)

**Arquivos alterados:**
- `supabase/migrations/20260705000010_discagem_scores_workspace_isolation.sql` — novo
- `eb-dash2/src/hooks/useDiscagemScore.ts`
- `eb-dash2/src/hooks/useDiscagem.ts` — removido (código morto, não importado em lugar nenhum)
- `docs/DISCADOR-PRE-VENDAS.md`

### O que mudou

1. **Vazamento cross-tenant corrigido:** `discagem_scores` nunca teve `workspace_id`. A policy de leitura liberava qualquer membro ativo de **qualquer** workspace ver a fila de discagem inteira (nomes, telefones, contexto de conversa) de todos os workspaces. `recalcular_discagem_scores()` e `buscar_reengajamento()` também não filtravam por workspace.
2. Coluna `workspace_id` adicionada em `discagem_scores` (derivada de `contatos.workspace_id`, já que `oportunidades` não tem `workspace_id` direto), com backfill e índice.
3. RLS restrita: `is_workspace_member(workspace_id)`.
4. `recalcular_discagem_scores()` passa a propagar `workspace_id` via `JOIN contatos`.
5. `buscar_reengajamento()` ganhou parâmetro obrigatório `p_workspace_id` (assinatura antiga removida com `DROP FUNCTION`).
6. `useDiscagemScore.ts` filtra a query por workspace e passa `p_workspace_id` na RPC.
7. `useDiscagem.ts` (hook legado, paralelo ao `useDiscagemScore.ts` ativo) removido — confirmado sem nenhuma importação no código.
8. `docs/DISCADOR-PRE-VENDAS.md` atualizado: score real é 0-1000 contínuo (não 0-100 ponderado), e as funções `marcarRetorno`/`cancelarRetorno` documentadas antes nunca existiram na UI — corrigido.

### Próximos passos (Wave 3 restante — pendente de validação do usuário)

- 4.5: score composto considerando qualificação MQL/ICP — pesos propostos aguardando aprovação.
- 4.6: extrair `DiscagemCard`, reintroduzir ação "Marcar retorno" manual, badges de qualificação, paginação.
- 4.7: testes de ordenação da fila.

---

## 2026-07-05 BRT — Controle de can_edit por Feature (Wave 2)

**Arquivos alterados:**
- `supabase/migrations/20260705000008_app_feature_can_edit.sql` — novo (colunas `can_edit`)
- `eb-dash2/src/contexts/PermissionsContext.tsx` — `hasFeatureEditPermission()`
- `eb-dash2/src/App.tsx` — `PermissionRoute` nega rota quando `featureKey` não é `hasFeaturePermission`
- `eb-dash2/src/lib/apps/features.ts` — `defaultEditRoles` em `leads.limpeza`
- `eb-dash2/src/pages/leads/LeadsPage.tsx`, `eb-dash2/src/pages/leads/tabs/LimpezaTab.tsx`
- `eb-dash2/src/pages/criativos/CriativosPage.tsx`, `KanbanBoard.tsx`, `KanbanColumn.tsx`, `BibliotecaTab.tsx`, `KanbanTab.tsx`
- `eb-dash2/src/pages/traqueamento/TraqueamentoPage.tsx`, `CodsUtmTab.tsx`, `OrigemTab.tsx`, `AnunciosTab.tsx`, `OrganicoTab.tsx`, `FunisTab.tsx`

### O que mudou

1. Colunas `can_edit` (BOOLEAN, default `false`) adicionadas em `app_feature_role_permissions` e `app_feature_user_overrides`. Fallback para `FEATURES_CATALOG.defaultEditRoles` quando não há override/permissão explícita.
2. `hasFeatureEditPermission(appSlug, featureKey)` no `PermissionsContext` — owner/admin sempre podem editar; demais papéis dependem de `can_edit`.
3. Todas as sub-abas de Traqueamento (CODS UTM, Origem, Anúncios, Orgânico, Funis) e as abas Biblioteca/Kanban de Criativos e Limpeza de Leads agora escondem ou desabilitam botões de criar/editar/excluir quando `canEdit` é `false`.
4. `PermissionRoute` (App.tsx) passou a aceitar `featureKey` — nega acesso direto via `?tab=` a uma feature sem `can_view`, além do check de app.
5. Isso finaliza o trabalho de Wave 2 do `docs/HANDOFF-OMNX-2026-07-05.md` que estava incompleto/não commitado no working tree.

### Próximos passos

- QA manual: confirmar que rotas `/leads?tab=limpeza`, `/criativos?tab=biblioteca|kanban` e `/traqueamento?tab=...` são negadas sem a feature.
- Aplicar a migration `20260705000008` em produção.
- Seguir para Wave 3 (Discador de Pré-Vendas) — pendente de decisão do usuário sobre quando iniciar.

---

## 2026-07-05 BRT — RLS em Tabelas Administrativas

**Arquivos alterados:**
- `supabase/migrations/20260705000001_rls_admin_tables.sql` — novo
- `docs/SEGURANCA-HARDENING.md`

### O que mudou

1. **RLS ativado** em cinco tabelas administrativas/críticas que estavam sem proteção:
   - `ghl_api_jobs` — fila global da API GHL; acesso restrito a `service_role`.
   - `ghl_opp_reconcile_runs` — execuções de reconciliação; leitura para membros ativos, escrita para admins.
   - `ghl_opp_reconcile_items` — itens de reconciliação; isolamento via `contato_id` → `contatos.workspace_id`.
   - `bot_context` — contexto dinâmico do bot; leitura para membros ativos, escrita para admins.
   - `ghl_custom_field_mappings` — mapeamento de custom fields GHL; leitura para membros ativos, escrita para admins.
2. **Helpers criados:**
   - `is_active_workspace_member_any()` — membro ativo de qualquer workspace.
   - `is_active_workspace_admin_any()` — owner/admin ativo de qualquer workspace.
3. **Policies `service_role_all_*`** mantidas em todas as tabelas para edge functions/syncs.
4. **Índice** `idx_ghl_opp_reconcile_items_contato_id` adicionado para performance da policy.

### Próximos passos

- Aplicar migration no banco de produção em janela de manutenção.
- Avaliar adicionar `workspace_id` direto em `ghl_opp_reconcile_runs` no futuro para isolamento mais fino.

---

## 2026-07-05 BRT — Seletor de Workspace (Fase 2.3)

**Arquivos alterados:**
- `eb-dash2/src/lib/workspace.ts`
- `eb-dash2/src/components/layout/WorkspaceSelector.tsx` — novo
- `eb-dash2/src/components/layout/DashboardLayout.tsx`
- `docs/DASHBOARD-CONTROLE-ACESSO.md`
- `CLAUDE.md`

### O que mudou

1. **Seletor de workspace no header** do dashboard, visível quando o usuário pertence a 2+ workspaces.
2. **Persistência da seleção** em `localStorage` (`eb:selected_workspace_id`).
3. **`getWorkspaceId()` valida a seleção** e cai em fallback no primeiro workspace ativo se a seleção for inválida.
4. **Troca de workspace recarrega a aplicação** para garantir consistência de dados e permissões.

### Próximos passos

- Fase 2.5: implementar auditoria de permissões (`permission_audit_log`).

---

## 2026-07-05 BRT — Módulo de Disparos (Tag-Driven Campaign Analytics)

**Arquivos alterados:**
- `supabase/migrations/20260705000000_create_modulo_disparos.sql` — novo
- `eb-dash2/src/types/disparos.ts` — novo
- `eb-dash2/src/hooks/useDisparos.ts` — novo
- `eb-dash2/src/pages/disparos/DisparosPage.tsx` — novo
- `eb-dash2/src/pages/disparos/tabs/DashboardTab.tsx` — novo
- `eb-dash2/src/pages/disparos/tabs/ConfiguracaoTab.tsx` — novo
- `eb-dash2/src/pages/disparos/components/DisparoMetricCards.tsx` — novo
- `eb-dash2/src/pages/disparos/components/DisparoBarChart.tsx` — novo
- `eb-dash2/src/pages/disparos/components/DisparoFunnel.tsx` — novo
- `eb-dash2/src/pages/disparos/components/DisparoMetricsTable.tsx` — novo
- `eb-dash2/src/pages/disparos/components/DisparoConfigForm.tsx` — novo
- `eb-dash2/src/pages/disparos/components/DisparoContactTable.tsx` — novo
- `eb-dash2/src/types/apps.ts`
- `eb-dash2/src/lib/apps/features.ts`
- `eb-dash2/src/lib/apps/navigation.ts`
- `eb-dash2/src/App.tsx`
- `docs/PLANO-MODULO-DISPAROS.md` — novo
- `docs/ROADMAP.md`
- `CLAUDE.md`

### O que mudou

1. **Novo sub-app Disparos** acessível via `/disparos` no menu principal.
2. **Dashboard** com KPIs, gráficos de barras comparativos, funil e tabela de métricas por disparo.
3. **Configuração** (owner/admin) para criar/editar/excluir disparos e mapear tags aos significados:
   `trigger`, `respondeu`, `parou`, `erro`, `nao_respondeu`, `comprou`.
4. **Métricas calculadas pela view `v_disparo_metricas`**, cruzando `disparo_tags` com `contatos.tags` (TEXT CSV) via função `contato_tem_tag`.
5. **RLS** ativado em `disparos` e `disparo_tags` por `workspace_id`.
6. **Integração com permissões** do workspace: feature `configuracao` restrita a `owner`/`admin`.

### Próximos passos

- Adicionar evolução temporal por dia/semana.
- Adicionar exportação CSV de contatos por disparo.
- Avaliar materialized view se performance degradar com >10k contatos por workspace.

---

## 2026-07-04 BRT — Hardening de Segurança (Fase 1)

**Arquivos alterados:**
- `Guzela/import_leads.py`
- `Guzela/sync-evento-contacts.py`
- `scripts/backfill-comunicacoes.py`
- `scripts/cami-evento-growth-mai26.mjs`
- `check_meta_ads.js`
- `SETUP-SYNC-OPP-PIPELINES.md`
- `docs/APIS-DOCS/ghl-conversations-api.md`
- `docs/GHL_WEBHOOK_SETUP.md`
- `docs/MCP-SUPABASE-SETUP.md`
- `supabase/functions/sync-ghl-conversations/README.md`
- `tests/sub-apps/README.md`
- `eb-dash2/tests/bot-chat.spec.ts`
- `eb-dash2/.gitignore`
- `supabase/migrations/20260601011926_sdr_ia_crons_e_reset_janela.sql`
- `supabase/migrations/20260704000000_rls_data_tables_workspace_isolation.sql` — novo
- `supabase/migrations/20260704000001_rpc_membership_checks.sql` — novo
- `supabase/functions/sync-ghl-users/index.ts`
- `supabase/functions/workspace-apps/index.ts`
- `scripts/security-check.sh` — novo
- `.git/hooks/pre-commit`
- `docs/SEGURANCA-HARDENING.md` — novo
- `CLAUDE.md`

### O que mudou

1. **Remoção de secrets do working tree** — todos os tokens, chaves de API e JWTs reais foram substituídos por variáveis de ambiente ou placeholders.
2. **RLS em tabelas de dados** — ativado RLS em `contatos`, `oportunidades`, `comunicacoes`, `vendas_fechamento` e `ghl_users`, com policies por workspace.
3. **Correção de policy de DELETE** — a policy de limpeza agora verifica o workspace da linha, não só se o usuário é admin em algum workspace.
4. **Proteção de RPCs** — `get_creative_metrics` e `get_max_creative_number` validam workspace membership.
5. **Proteção de edge functions** — `sync-ghl-users` exige autenticação ou cron secret; `workspace-apps` exige `x-workspace-id`.
6. **Pre-commit de segurança** — hook que verifica secrets em arquivos staged.
7. **Documentação** — criado `docs/SEGURANCA-HARDENING.md` com checklist e próximos passos.

> ⚠️ Ainda é necessário rotacionar as credenciais expostas no Supabase Dashboard e no GoHighLevel. Ver `docs/SEGURANCA-HARDENING.md`.

---

## 2026-07-02 BRT — Sub-app Criativos: ranking refeito igual ao Painel de Tráfego

**Arquivos alterados:**
- `eb-dash2/src/pages/criativos/tabs/RankingTab.tsx` — reescrito com ranking completo
- `eb-dash2/src/hooks/useCreativeRankingData.ts` — novo hook de dados brutos
- `eb-dash2/src/lib/creativeRanking.ts` — lógica de agregação reutilizável
- `tests/sub-apps/criativos.spec.ts` — teste da toolbar de ranking

### O que mudou

O ranking do sub-app Criativos foi refeito para ser igual ao da aba Tráfego:

- 14 colunas de métricas (investimento, faturamento, caixa, leads, CPL, MQL, CPMQL, reuniões, vendas, CPV, CTR, CPM, conv. página, video hook)
- Colunas configuráveis (ordem e visibilidade)
- Ordenação por qualquer coluna
- Filtros de campanha, conjunto, anúncio, canal, funil, campanha [cp], MQL
- Botão "Só com MQL"
- Expansão por público (adset)
- Drill-down de leads ao clicar em leads/MQLs/reuniões/vendas
- Link direto para o anúncio no Instagram/Facebook

---

## 2026-07-02 BRT — Sub-app Criativos: 5 abas funcionais + cadastro nativo AN-

**Arquivos alterados:**
- `eb-dash2/src/pages/criativos/CriativosPage.tsx` — 5 abas (Ranking, Biblioteca, Kanban, Testes, Dashboard)
- `eb-dash2/src/pages/criativos/tabs/KanbanTab.tsx` — novo
- `eb-dash2/src/pages/criativos/tabs/TestesTab.tsx` — novo
- `eb-dash2/src/pages/criativos/tabs/DashboardTab.tsx` — novo
- `eb-dash2/src/pages/criativos/components/CreativeFormDialog.tsx` — formulário nativo
- `eb-dash2/src/pages/criativos/components/KanbanBoard.tsx` — board com 12 status
- `eb-dash2/src/hooks/useCreativeTests.ts` — critérios, fila e decisões
- `eb-dash2/src/hooks/useCreativeDashboard.ts` — KPIs, alertas, configuração de reunião
- `eb-dash2/src/types/creatives.ts` — tipos compartilhados
- `supabase/migrations/20260701200000_support_native_creative_prefix.sql` — CR- e AN- nas métricas
- `supabase/migrations/20260702000000_creative_system_base.sql` — workspace_settings, v_creative_status_counts
- `supabase/functions/generate-creative-code/index.ts` — gera próximo AN-/CR-
- `docs/SUB-APP-CRIATIVOS.md` — documentação atualizada

### O que mudou

O sub-app Criativos deixou de ser apenas um ranking e se tornou um sistema completo:

1. **Biblioteca** — criação e edição nativa de criativos com código `AN-XXXX`.
2. **Kanban** — produção visual com 12 status e drag-and-drop.
3. **Testes** — fila de testes com critérios configuráveis e sugestão automática (aprovar/escalar/reprovar/matar).
4. **Dashboard** — KPIs, alertas e dia configurável da reunião semanal.
5. **Ranking** — métricas reais por criativo, agora reconhecendo tanto `CR-` (Notion) quanto `AN-` (nativo).

O sync com Notion continua ativo: criativos do Notion mantêm `CR-` e `source='notion'`; criativos nativos usam `AN-` e `source='native'`.

---

## 2026-06-28 BRT — Discador de Pré-Vendas: 4 Camadas + Timestamps + GHL Auto-detect

**Arquivos alterados:**
- `supabase/migrations/20260627010000_discagem_scores.sql` — tabela base
- `supabase/migrations/20260627010001_recalcular_discagem_scores.sql` — função + cron
- `supabase/migrations/20260627080000_discagem_camadas.sql` — 4 camadas + reengajamento
- `supabase/migrations/20260627090000_discagem_ghl_appointment_ts.sql` — `data_reuniao_agendada_ts` em oportunidades + campos de exibição no card
- `supabase/migrations/20260627100000_discagem_excluir_agendamento_vendas.sql` — revogado/superado
- `supabase/migrations/20260628000000_discagem_incluir_nmql.sql` — revogado (nMQL não incluso)
- `supabase/migrations/20260628010000_discagem_fix_filtros.sql` — filtros finais corretos
- `supabase/functions/sync-appointment-dates/index.ts` — salva timestamp completo GHL em `data_reuniao_agendada_ts`
- `eb-dash2/src/hooks/useDiscagemScore.ts` — reescrito completo
- `eb-dash2/src/pages/prevendas/tabs/DiscagemTab.tsx` — reescrito completo

### O que mudou

**Sistema de discagem refeito do zero** — de uma lista simples para fila de prioridade em 4 camadas:

1. **`horario_marcado`** (violeta) — lead tem retorno combinado (manual SDR ou appointment GHL) na janela de -30min/+60min
2. **`respondeu`** (verde) — lead mandou mensagem inbound há menos de 2h
3. **`lead_novo`** (vermelho pulse) — lead recém-chegado (<30min) sem nenhuma tentativa
4. **`cadencia`** (cinza/verde/laranja por canal) — todos os demais, com canal sugerido por nº de tentativas (T0-2=call, T3-4=WhatsApp, T5+=SMS)

**GHL appointment auto-detect:**
- `sync-appointment-dates` agora salva o **timestamp completo** (hora+data) em `data_reuniao_agendada_ts` — antes só salvava a data
- `recalcular_discagem_scores()` detecta automaticamente `horario_marcado` via `data_reuniao_agendada_ts` sem input manual do SDR
- SDR ainda pode usar botão "Retorno" na UI para casos combinados verbalmente

**Cards com informação rica:**
- Cor dinâmica por MOTIVO (razão), não só por camada
- "Entrou DD/MM HH:MM" — timestamp exato de chegada do lead
- "Retorno DD/MM HH:MM" — horário exato de retorno previsto (GHL ou manual)
- Razão em linguagem humana ("Respondeu há 4 min", "Tentativa 3 — mande WhatsApp")

**Botão GHL (abre contato no CRM):**
- Abre `https://app.gohighlevel.com/v2/location/{id}/contacts/detail/{ghlId}` em nova aba
- Não disca pelo computador

**Reengajamento (fila vazia):**
- Quando a fila esvazia, exibe leads que responderam nos últimos 60 dias (mas esfriaram > 3 dias)
- Mostra trecho da última mensagem como contexto para reabertura
- Função SQL `buscar_reengajamento(p_sdr_name, p_limit)` via RPC

**Filtros de pipeline:**
- Apenas `Pré-Vendas MQL` + `Auto Agendamento` entram na fila
- Leads movidos para `Vendas SQL` são removidos automaticamente na próxima rodada do cron (2 min)
- Leads com 7+ tentativas em 14 dias saem da fila automaticamente

---

## 2026-06-26 BRT — Redesign Glassmorfismo (Liquid Glass UI)

**Arquivos alterados:**
- `eb-dash2/src/index.css`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `eb-dash2/src/components/layout/DashboardLayout.tsx`
- `eb-dash2/src/components/ui/card.tsx`
- `eb-dash2/src/pages/AppHubPage.tsx`

### O que mudou

Refatoração visual completa para glassmorfismo/liquid glass em dark mode.

- **Tokens glass:** `--glass-sidebar-bg`, `--glass-header-bg`, `--glass-card-bg`, `--glass-blur-sm/md/lg`, `--empire-glow-sm/md/primary`
- **Canvas dark:** `#070B11` (azul escuro profundo) com gradiente radial sutil dourado+violeta no fundo
- **Sidebar:** `background: rgba(10,15,22,0.88)` + `backdrop-filter: blur(24px)` + borda `rgba(255,255,255,0.09)`
- **Header:** glass blur com borda e sombra inset suave
- **Cards:** variantes glass com `rgba(255,255,255,0.045)` + `backdrop-blur-sm` + inset highlight no topo + glow dourado nas variantes `glowing`
- **Logo "E":** mudado de fundo void para dourado (`bg-empire-primary`) com glow amarelo sutil
- **AppHub:** fundo com gradiente radial, ícones dos apps com scale e glow no hover
- **CSS utilities:** `.glass-sidebar`, `.glass-header`, `.glass-card` em `@layer components`
- **Keyframes:** `glow-pulse`, `glass-shimmer` adicionados

---

## 2026-06-26 BRT — Tráfego como App Separado + Fix Sidebar + Segurança Webhook

**Arquivos alterados:**
- `eb-dash2/src/components/layout/DashboardLayout.tsx`
- `eb-dash2/src/lib/apps/navigation.ts`
- `eb-dash2/src/types/apps.ts`
- `eb-dash2/src/App.tsx`
- `eb-dash2/src/pages/AppHubPage.tsx`
- `eb-dash2/src/pages/admin/AdminAppsPage.tsx`
- `supabase/functions/webhook-ghl/index.ts`
- `supabase/migrations/20260626200000_add_trafego_app.sql`

### O que mudou

- **Tráfego separado:** App slug `trafego` criado independente do `aquisicao-vendas`
- **Fix sidebar scroll:** `min-h-[100dvh]` → `h-[100dvh]` corrige sidebar que rolava com a página
- **Segurança webhook:** `WEBHOOK_SECRET` vazio agora causa crash no startup; token Bearer vazio não passa mais
- **Migration:** ativa `trafego` em workspaces que já tinham `aquisicao-vendas`

---

## 2026-06-26 BRT — Sub-apps Modulares: Fase 4 (Admin UI de Apps e Permissões)

**Arquivos alterados:**
- `eb-dash2/src/types/apps.ts`
- `eb-dash2/src/components/ui/switch.tsx` (novo)
- `eb-dash2/src/hooks/useWorkspaceApps.ts` (novo)
- `eb-dash2/src/hooks/useAppRolePermissions.ts` (novo)
- `eb-dash2/src/hooks/useAppUserOverrides.ts` (novo)
- `eb-dash2/src/hooks/useWorkspaceMembers.ts` (novo)
- `eb-dash2/src/pages/settings/AppsSettingsPage.tsx` (novo)
- `eb-dash2/src/pages/settings/AppPermissionsPage.tsx` (novo)
- `eb-dash2/src/App.tsx`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `docs/SUB-APPS-MODULARES.md`
- `docs/ROADMAP.md`
- `docs/MUDANCAS.md`
- `CLAUDE.md`

### O que mudou

Criação das telas de administração para gestão de sub-apps e permissões.

- **Tela `/settings/apps`:**
  - Lista o catálogo fixo de apps (`APP_CATALOG`).
  - Permite ativar/desativar cada app, salvando em `workspace_apps.is_active`.
  - Insere registro caso ainda não exista para o workspace.
  - Toggle desabilitado para usuários que não são owner/admin.

- **Tela `/settings/apps/permissions`:**
  - Seletor de app para configuração.
  - Seção "Por papel": tabela com `owner`, `admin`, `member`; owner/admin sempre ativos e informativos.
  - Seção "Por usuário": lista de membros do workspace com toggle de override; badge "Override" quando existe registro em `app_user_overrides`.
  - Permissões de papel e overrides salvos via Supabase client com RLS.

- **Hooks com TanStack Query:**
  - `useWorkspaceApps` e `useUpdateWorkspaceApp` para `workspace_apps`.
  - `useAppRolePermissions` e `useUpdateAppRolePermission` para `app_role_permissions`.
  - `useAppUserOverrides` e `useUpdateAppUserOverride` para `app_user_overrides`.
  - `useWorkspaceMembers` para listar membros do workspace via RPC.

- **Rotas e navegação:**
  - `/settings/apps` e `/settings/apps/permissions` adicionadas em `App.tsx` dentro de `PermissionRoute`.
  - `Sidebar.tsx` atualizada com submenu "Apps" e "Permissões de Apps" sob Configurações.

- **Componente `Switch`:**
  - Criado em `src/components/ui/switch.tsx` pois o projeto não possuía componente de toggle.

### Decisões técnicas

- **Supabase client no frontend em vez de edge functions:** as tabelas já possuem RLS que restringe escrita a owner/admin, então não foi necessário criar edge functions adicionais. Isso reduz complexidade e mantém a lógica perto da UI.
- **Catálogo centralizado:** `APP_CATALOG` em `src/types/apps.ts` é a fonte única de slugs, labels e ícones para admin e futuras telas.
- **Owner/admin sempre com acesso:** na UI, os papéis owner/admin aparecem com toggle ativo e desabilitado, refletindo que eles bypassam as permissões de app.
- **Override mantido mesmo quando `can_view = false`:** um override explícito `false` vence a permissão de papel, então o registro não é deletado ao desmarcar.

### Segurança

- Nenhum secret exposto no código.
- `SUPABASE_SERVICE_ROLE_KEY` não foi utilizada no frontend.
- Escrita em `workspace_apps`, `app_role_permissions` e `app_user_overrides` continua protegida por RLS no Supabase.

### Validação

- `cd eb-dash2 && npm run build` ✅
- `cd eb-dash2 && npm run test -- --run` ✅ (13 tests)

---

## 2026-06-26 BRT — Sub-apps Modulares: Fase 3 (Reorganização de Funcionalidades)

**Arquivos alterados:**
- `eb-dash2/src/pages/sdr-ia/SdrIaPage.tsx` (novo)
- `eb-dash2/src/pages/sdr-ia/components/AuditoriaIaPanel.tsx` (novo)
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx`
- `eb-dash2/src/pages/prevendas/tabs/AuditoriaIATab.tsx` (removido)
- `eb-dash2/src/App.tsx`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `eb-dash2/src/pages/goals/GoalsPage.tsx`
- `eb-dash2/src/components/goals/GoalEditorDialog.tsx`
- `eb-dash2/src/lib/goals/types.ts`
- `eb-dash2/src/lib/goals/catalog.ts`
- `eb-dash2/src/lib/goals/service.ts`
- `supabase/migrations/20260626180000_add_app_slug_to_goal_definitions.sql` (novo)
- `docs/ROADMAP.md`
- `docs/MUDANCAS.md`
- `CLAUDE.md`

### O que mudou

Reorganização das funcionalidades existentes para se adequarem aos sub-apps, sem desfazer lógica de negócio.

- **App SDR IA (`/sdr-ia`):**
  - Nova página dedicada que renderiza o conteúdo da aba Auditoria IA.
  - O componente `AuditoriaIATab` foi movido para `src/pages/sdr-ia/components/AuditoriaIaPanel.tsx` e renomeado para refletir que agora é um painel reutilizável, não apenas uma tab.
  - A aba Auditoria IA continua disponível em `/pre-vendas?tab=auditoria_ia` usando o mesmo painel, garantindo compatibilidade com navegação antiga.
  - Rota `/sdr-ia` protegida por `PermissionRoute moduleKey="sdr-ia"`, que também verifica se o app `sdr-ia` está ativo e permitido.
  - Sidebar ganhou item "SDR IA" com submenu "Auditoria IA".

- **Metas por app:**
  - Adicionada coluna opcional `app_slug` na tabela `goal_definitions` (migration `20260626180000_add_app_slug_to_goal_definitions.sql`).
  - Tipos TypeScript atualizados: `GoalAppSlug`, `GoalDefinition.app_slug`, `GoalEditorInput.appSlug`.
  - Dropdown "App vinculado" adicionado no formulário de cadastro/edição de metas (`GoalEditorDialog`).
  - Filtro por app adicionado na página de metas (`GoalsPage`).
  - Coluna "App" exibida nas tabelas Registry e History de metas.
  - Catálogo de apps permitidos centralizado em `GOAL_APP_OPTIONS` (`src/lib/goals/catalog.ts`).

- **Leads acessível em todos os apps:**
  - App "Leads" já estava no catálogo (`AppHubPage`) e na sidebar; nenhuma alteração estrutural foi necessária.

- **Sidebar dinâmica por app:**
  - O item SDR IA foi adicionado como módulo separado, visualmente indicando que Auditoria IA pertence a esse app.
  - A sidebar continua usando `hasPermission(item.moduleKey)` como guarda principal; itens de apps inativos são ocultos via `PermissionRoute` quando o usuário tenta acessar diretamente.

### Decisões técnicas

- **Manter aba Auditoria IA em Pré-Vendas:** em vez de remover imediatamente, o painel foi compartilhado entre `/sdr-ia` e `/pre-vendas?tab=auditoria_ia`. Isso evita que bookmarks/links antigos quebrem e permite transição gradual.
- **`app_slug` em `goal_definitions` (não em `goal_versions`):** o vínculo com o app é uma propriedade da definição da meta (identidade lógica), não da versão de vigência. Versões sucessivas de uma mesma meta herdam o mesmo app.
- **`app_slug` opcional (nullable):** metas antigas e metas transversais continuam funcionando sem valor.

### Mapeamento de apps × metas

| App slug | Áreas de meta típicas |
|----------|----------------------|
| `aquisicao-vendas` | `trafego`, `vendas`, `organico` |
| `traqueamento` | `trafego` |
| `pre-vendas` | `prevendas` |
| `relatorios` | qualquer (metas usadas em relatórios) |
| `sdr-ia` | `prevendas` (response_time, agendamentos) |
| `metas` | qualquer (cadastro central) |
| `leads` | `prevendas`, `vendas` |

### Segurança

- Nenhum secret exposto no código.
- `SUPABASE_SERVICE_ROLE_KEY` não foi utilizada no frontend.
- Migration adiciona apenas coluna e índice; não altera RLS nem dados existentes.

### Validação

- `cd eb-dash2 && npm run build` ✅
- `cd eb-dash2 && npm run test -- --run` ✅ (13 tests)

---

## 2026-06-26 BRT — Sub-apps Modulares: Fase 2 (Integração Frontend)

**Arquivos alterados:**
- `eb-dash2/src/types/apps.ts` (novo)
- `eb-dash2/src/contexts/PermissionsContext.tsx`
- `eb-dash2/src/pages/AppHubPage.tsx` (novo)
- `eb-dash2/src/components/layout/DashboardLayout.tsx`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `eb-dash2/src/App.tsx`
- `docs/SUB-APPS-MODULARES.md`
- `docs/ROADMAP.md`
- `docs/MUDANCAS.md`

### O que mudou

Integração do frontend com a fundação de sub-apps ativáveis por workspace.

- **Tipos:** criada interface `WorkspaceApp` em `src/types/apps.ts`.
- **`PermissionsContext`:** agora busca a lista de apps permitidos via edge function `workspace-apps` (`POST`) e expõe `apps` e `loadingApps`. Recarrega automaticamente quando `refresh()` é chamado.
- **`AppHubPage`:** tela inicial que exibe cards dos apps permitidos. Se o usuário tiver acesso a apenas um app, é redirecionado automaticamente para a rota inicial dele. Se não houver apps disponíveis, mostra empty state.
- **Seletor de apps:** dropdown no header do `DashboardLayout` lista apps permitidos, destaca o app atual pelo pathname e oferece opção "Todos os apps" para voltar ao hub.
- **`Sidebar`:** logo "Empire" agora linka para `/` (hub) em vez de `/traqueamento`. Navegação continua mostrando todos os itens — filtro por app virá na Fase 3.
- **`App.tsx`:**
  - Rota `/` renderiza `<AppHubPage />`.
  - Rota `*` redireciona para `/`.
  - Adicionada rota `/sdr-ia` (placeholder que redireciona para `/pre-vendas?tab=auditoria_ia`).
  - `PermissionRoute` agora também verifica se o app correspondente ao `moduleKey` está ativo e permitido; se não estiver, redireciona para `/`.

### Mapeamento de apps

| App slug | Rotas/módulos |
|----------|---------------|
| `aquisicao-vendas` | `/aquisicao`, `/vendas`, `/organico`, `/trafego` |
| `traqueamento` | `/traqueamento` |
| `pre-vendas` | `/pre-vendas`, `/recuperacao` |
| `relatorios` | `/relatorios` |
| `metas` | `/metas` |
| `leads` | `/leads` |
| `sdr-ia` | `/sdr-ia` |

### Segurança

- Nenhum secret exposto no código.
- Cliente Supabase existente (`src/lib/supabase.ts`) usado para invocar a edge function; o JWT do usuário é enviado automaticamente.
- `SUPABASE_SERVICE_ROLE_KEY` não foi utilizada no frontend.

### Validação

- `cd eb-dash2 && npm run build` ✅
- `cd eb-dash2 && npm run test -- --run` ✅ (13 tests)

---

## 2026-06-26 BRT — Sub-apps Modulares: Fase 1 (Fundação de Backend)

**Arquivos alterados:**
- `supabase/migrations/20260626151259_sub_apps_foundation.sql`
- `supabase/functions/workspace-apps/index.ts`
- `supabase/config.toml`
- `docs/SUB-APPS-MODULARES.md`
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`
- `docs/MUDANCAS.md`

### O que mudou

Criada a fundação de backend para sub-apps ativáveis por workspace.

- **Tabela `workspace_apps`** controla quais apps estão ativos em cada workspace e armazena `settings` JSONB.
- **Tabela `app_role_permissions`** define permissões default por role (`can_view`).
- **Tabela `app_user_overrides`** permite overrides por usuário, que vencem as permissões de role.
- **RLS** ativado em todas as tabelas: membros autenticados leem; apenas `owner`/`admin` modificam.
- **Seed** ativa todos os apps para workspaces existentes e concede `can_view = true` para `owner` e `admin`.
- **Edge function `workspace-apps`** (`POST /workspace-apps`) lista os apps do catálogo com `is_active` e `allowed` para o usuário autenticado. Valida o JWT internamente e resolve o workspace via header `x-workspace-id` ou primeiro workspace ativo do usuário.
- **Configuração** `[functions.workspace-apps]` adicionada ao `supabase/config.toml` com `verify_jwt = false`.

### Apps catalogados

- Aquisição & Vendas (`aquisicao-vendas`)
- Traqueamento (`traqueamento`)
- Pré-Vendas (`pre-vendas`)
- Relatórios (`relatorios`)
- SDR IA (`sdr-ia`)
- Metas (`metas`)
- Leads (`leads`)

### Segurança

- Nenhum secret exposto no código.
- A edge function usa `SUPABASE_SERVICE_ROLE_KEY` apenas no servidor (ambiente seguro) para validar o JWT e consultar dados.
- RLS garante isolamento entre workspaces.

### Validação

- Build do frontend (`cd eb-dash2 && npm run build`) executado com sucesso.
- Verificação local de migration e edge function limitada pela ausência de Docker/Deno no ambiente.

---

## 2026-06-18 BRT — Meta Ads: extração de investimento por região (estado)

**Arquivos alterados:**
- `supabase/functions/sync-meta-ads/index.ts`
- `supabase/functions/sync-meta-ads-backfill/index.ts`
- `supabase/migrations/20260618175926_meta_ads_region_breakdown.sql`
- `docs/meta-ads/README.md`
- `plans/meta-ads-region-breakdown-plan.md`
- `plans/meta-ads-region-breakdown-qa.md`

### O que mudou

Adicionamos suporte a breakdown geográfico na extração de dados da Meta Ads. Agora é possível obter o investimento detalhado por **região** (estado brasileiro) e cruzar com as vendas do CRM para calcular CPV, ROAS e ROAS CAIXA reais por região.

### Decisões técnicas

- **Edge Function `sync-meta-ads`** ganhou um parâmetro opcional `breakdowns` no body. Quando não informado, o sync padrão de hora em hora continua idêntico.
- **Edge Function `sync-meta-ads-backfill`** também aceita `breakdowns`, permitindo backfill histórico desde nov/2025.
- **Nova RPC `processar_meta_ads_raw_region_breakdown`** agrega os totais por anúncio/dia antes de inserir na `meta_ads_insights`, evitando que múltiplas linhas de região sobrescrevam os totais.
- **Guarda de segurança** na `processar_meta_ads_raw` impede que um raw com breakdowns seja processado pelo caminho errado.
- **Tabela `meta_ads_region_mapping`** mapeia os nomes de região da Meta para UF e região brasileira.
- **Campos calculados/JSONB** da `meta_ads_insights` são preservados quando já existem (proteção contra regressão).

### Execução e resultados

- **Migration aplicada** no projeto `qzesffnkqgelmtfblzkr` via `supabase db push`.
- **Edge functions deployadas** (`sync-meta-ads` e `sync-meta-ads-backfill`).
- **Backfill histórico executado**: 291 dias (2025-09-01 → 2026-06-18) em lotes de 10 dias. Duração total: ~1h13m.
- **Validação de consistência**: entre os 286 dias com breakdown, spend total insights = R$ 357.587,10 e spend total breakdowns = R$ 357.581,00 (diferença de R$ 11,66 ≈ 0,003%).
- **Mapeamento de regiões**: adicionadas variações com/sem acento e sufixo `(state)` devolvidos pela Meta API v18.0; regiões internacionais com spend irrelevante (< 0,1%) permanecem fora do mapeamento brasileiro.
- **Análise real gerada** (`analises/cpv-por-regiao/cpv-real-por-regiao-2026.md`):
  - Investimento total por região: Sudeste R$ 200.287, Sul R$ 63.241, Nordeste R$ 46.703, Centro-Oeste R$ 33.233, Norte R$ 12.940.
  - ROAS CAIXA por região: Sul 4,24; Sudeste 1,61; Centro-Oeste 4,44; Nordeste 0,44; Norte 0,77.
  - CPV médio geral: R$ 5.988.
- **Integração com a Clara** (`query_meta_ads_region`):
  - Nova tool permite perguntas naturais: "qual região tem melhor ROAS", "CPV do Sudeste", "compare regiões".
  - Criada função SQL `analisar_meta_ads_por_regiao(start_date, end_date)` e tabela `estado_uf_normalizacao`.
  - Deploy da edge function `bot-chat-data` atualizado.
  - Testado com sucesso: Clara respondeu análise completa por região (investimento, vendas, CPV, ROAS, ROAS CAIXA) para 2026.

---

## 2026-06-01 BRT — SDR IA: sistema completo funcional (sessão de depuração)

**Arquivos alterados:** `sdr-ia-orchestrator`, `sdr-ia-webhook-handler`, `webhook-ghl`, `sync-ghl-conversations`

### Bugs corrigidos

**1. `ghl_source = 'app'` em mensagens WhatsApp enviadas via API (CRÍTICO)**
O GHL marca mensagens WhatsApp enviadas pela API com `ghl_source = 'app'` (igual a mensagens humanas). O bot interpretava suas próprias respostas como "SDR humano respondeu" e silenciava. Corrigido: a verificação de SDR humano agora compara a data da mensagem humana com o último inbound do lead — só pausa se um humano respondeu **depois** do lead.

**2. Fluxo reativo vs proativo — limites aplicados no lugar errado**
`max_mensagens_por_janela_24h` e `tempo_minimo_entre_mensagens_min` bloqueavam respostas reativas (lead mandou mensagem → bot responde). Esses limites agora se aplicam apenas a follow-ups proativos.

**3. Join PostgREST `contato!inner` quebrado no cron**
O cron usava `contato!inner(...)` para buscar leads elegíveis. O PostgREST resolvia o join como vazio silenciosamente. Substituído por duas queries separadas (comunicacoes → contatos).

**4. Cron não detectava inbound novo via WhatsApp**
O cron scaneava `sdr_ia_conversas.ultima_mensagem_inbound_at` para detectar inbound novo, mas esse campo não era atualizado pelo `sync-ghl-conversations`. Corrigido: `sync-ghl-conversations` agora atualiza `ultima_mensagem_inbound_at` e `janela_24h_ativa` na conversa após upsert de mensagens inbound.

**5. `canal_comunicacao` ignorado na resposta — bot sempre respondia pelo canal do bot, não do lead**
Corrigido: bot sempre responde pelo mesmo canal que o lead usou (SMS → responde SMS, WhatsApp → responde WhatsApp).

**6. Sem cron do orchestrator (CRÍTICO)**
O orchestrator não tinha cron job — follow-ups nunca rodavam. Cron `*/2 * * * *` criado.

**7. `stage_name` inexistente em oportunidades**
Selects usavam coluna inexistente `stage_name`. Corrigido para `pipeline_stage_name`.

**8. Contadores de janela nunca resetavam**
`mensagens_ia_enviadas_na_janela` e `janela_24h_ativa` nunca zerados. Função `reset_sdr_ia_janela_expirada()` criada + cron `*/30 * * * *`.

**9. Webhook-ghl não repassava ContactCreate/ContactUpdate ao sdr-ia-webhook-handler**
Ativação por tag não funcionava para novos contatos. Corrigido: todos os eventos de contato agora repassados.

**10. sync-ghl-conversations: frequência 10 min → 2 min**
Reduzido para eliminar dependência de webhook do GHL para o bot funcionar.

---

## 2026-05-31 BRT — Fix: 4 bugs no sdr-ia-orchestrator e sdr-ia-webhook-handler (modo real)

**Arquivo:** `supabase/functions/sdr-ia-orchestrator/index.ts` e `sdr-ia-webhook-handler/index.ts`

**Bug 1 — Stop conditions de pipeline/stage nunca bloqueavam (sdr-ia-orchestrator):**
- `buscarLeadsElegiveis` e `buscarLeadsElegiveisFollowUp` faziam `.select('pipeline_name, stage_name')` mas passavam `opp.pipeline_id` e `opp.pipeline_stage_id` para `verificarStopConditions` — campos que nunca estavam no resultado.
- `processarContatoEspecifico` passava *nomes* (`pipeline_name`, `stage_name`) em vez de *IDs*, nunca dando match.
- **Fix:** selects agora incluem `pipeline_id, pipeline_stage_id`; `processarContatoEspecifico` passa os IDs corretos.

**Bug 2 — Coluna de filtro stage errada no filtro avançado (sdr-ia-orchestrator):**
- `.eq('stage_id', bot.filtro_stage_id)` — coluna não existe em `oportunidades`; o campo correto é `pipeline_stage_id`.
- **Fix:** corrigido para `.eq('pipeline_stage_id', bot.filtro_stage_id)`.

**Bug 3 — Follow-ups nunca enviados (sdr-ia-orchestrator):**
- `.lt('ultima_mensagem_inbound_at', 'ultima_mensagem_outbound_at')` comparava uma coluna com a string literal `'ultima_mensagem_outbound_at'` — PostgREST não suporta comparação entre colunas via `.lt()`.
- **Fix:** filtro removido da query; comparação feita em JS após fetch.

**Bug 4 — workspace_id hardcoded `00000000...` no log de pausa (sdr-ia-webhook-handler):**
- Log de "SDR humano respondeu — bot pausado" usava UUID inválido no campo `workspace_id`.
- **Fix:** select da query inclui agora `workspace_id`; campo usa `conv.workspace_id`.

**Deploy:** ambas as edge functions reimplantadas em produção.

---

## 2026-05-27 BRT — Fix: Taxa de Comparecimento + No-show somava > 100% no painel de vendas

**Problema:** Os KPIs "Taxa de Comparecimento" e "Taxa No-show" no painel de Vendas podiam somar mais de 100% em alguns períodos/closers.

**Causa raiz:** 52 oportunidades no banco possuem **ambos** os campos `data_realizacao_vendas` e `data_no_show_vendas` preenchidos simultaneamente. O código de contagem de no-show não excluía esses leads, fazendo com que uma mesma oportunidade fosse contada tanto como "reunião realizada" quanto como "no-show".

**Correção aplicada — exclusão mútua:**
- Um lead com reunião realizada (`data_realizacao_vendas` preenchida) **nunca** conta como no-show, mesmo que também tenha `data_no_show_vendas` preenchido.
- A lógica de contagem agora filtra explicitamente `data_realizacao_vendas IS NULL` (ou `!o.data_realizacao_vendas`) ao contar no-shows.

**Regra de negócio fixada:**
```
No-shows = oportunidades com data_no_show_vendas preenchida E SEM data_realizacao_vendas
Reuniões realizadas = oportunidades com data_realizacao_vendas preenchida
Taxa Comparecimento = Reuniões realizadas / Agendados × 100
Taxa No-show = No-shows / Agendados × 100
```
Portanto: `Taxa Comparecimento + Taxa No-show ≤ 100%`.

**Arquivos alterados:**
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx` — filtro de no-show exclui opps com `data_realizacao_vendas`
- `eb-dash2/src/hooks/useCloserLeaderboard.ts` — mesma correção no leaderboard
- `eb-dash2/src/hooks/useCloserProdutividade.ts` — mesma correção na produtividade
- `eb-dash2/src/hooks/useVendasCohort.ts` — mesma correção no cohort
- `supabase/functions/compute-weekly-reports/index.ts` — 14 ocorrências de contagem de no-show agora filtram `.is('data_realizacao_vendas', null)` ou `&& !o.data_realizacao_vendas`

**Impacto:** KPIs de comparecimento e no-show no painel de Vendas agora somam no máximo 100%. Nenhum lead é mais contado duas vezes.

---

## 2026-05-27 — Fase 1.3/1.4/1.5: lado EmpireDesk da ponte (formulário + vínculo)

**O que mudou (projeto EmpireDesk `wuzmckatbmlpkdxtfhqr`):**
1. **Endereço estruturado** (1.3): `vendas_pendentes` ganhou colunas separadas (logradouro, número, complemento, bairro, município, UF, CEP); formulário público com campos separados + máscara de CEP; tela de validação exibe endereço estruturado.
2. **Vínculo + disparo** (1.4): colunas de vínculo (`ghl_oportunidade_id`, `ghl_contato_id`, `ghl_venda_id`, `sincronizado_em`, `sincronizacao_erro`); edge functions intermediárias `vendas-buscar-lead-crm` e `vendas-sincronizar-crm` (guardam o secret no servidor, falam com a ponte do GHL); UI no `VendaModal` busca candidatos e dispara a sincronização ao concluir.
3. **Fila de pendência** (1.5): vendas sem match podem ser concluídas e ficam identificáveis (badge "sem vínculo" na lista), com botão "Enviar ao CRM agora" para resolução posterior.

**Por quê:** completa o lado EmpireDesk da integração `INTEGRACAO-EMPIREDESK-VENDAS.md` — a venda agora atravessa a ponte e alimenta a `vendas_fechamento` do GHL.

**Impacto:** funciona após o secret `EMPIREDESK_BRIDGE_SECRET` estar configurado nos dois projetos. Edge functions do EmpireDesk deployadas; frontend depende do deploy Vercel.

---

## 2026-05-27 — Fase 1.2 e 1.6: ponte EmpireDesk (edge functions + LeadCard)

**O que mudou:**
1. **Edge functions "balcão"** no GHL: `crm-buscar-lead` (match de contato por telefone/e-mail via RPC `buscar_lead_para_venda`) e `crm-registrar-venda` (UPSERT em `vendas_fechamento` + cópia de comprovantes pro bucket). Ambas com `verify_jwt=false` e auth por secret `EMPIREDESK_BRIDGE_SECRET`.
2. **Aba Financeiro do LeadCard** (`eb-dash2`): passa a exibir a lista detalhada de pagamentos (data/valor/forma/plataforma/sinal), o closer e a galeria de comprovantes (signed URLs). Vendas históricas (origem `ghl`) seguem no modelo antigo.

**Por quê:** Fase 1 da integração `INTEGRACAO-EMPIREDESK-VENDAS.md` — construir a ponte segura entre EmpireDesk e GHL e preparar a exibição dos dados ricos.

**Impacto:** As edge functions só funcionam após o secret `EMPIREDESK_BRIDGE_SECRET` ser configurado (passo manual). O LeadCard não muda para registros existentes.

**Arquivos alterados:**
- `supabase/migrations/20260527000001_rpc_buscar_lead_para_venda.sql` (novo)
- `supabase/functions/crm-buscar-lead/index.ts` (novo, deployado)
- `supabase/functions/crm-registrar-venda/index.ts` (novo, deployado)
- `eb-dash2/src/hooks/useLeads.ts` (interface + SELECT)
- `eb-dash2/src/components/leads/LeadCard.tsx` (FinanceiroTab + PagamentosList + ComprovantesGrid)

---

## 2026-05-27 — Fase 1.1: fundação para vendas vindas do EmpireDesk

**O que mudou:** `vendas_fechamento` ganhou 5 colunas novas (`pagamentos` JSONB, `comprovantes` JSONB, `closer_nome`, `closer_email`, `origem` com default `'ghl'`) e foi criado o bucket privado `vendas-comprovantes` com policy de leitura para `authenticated`. Os 4.908 registros históricos foram marcados como `origem='ghl'`.

**Por quê:** Primeira peça da integração em que o formulário de vendas do EmpireDesk passa a alimentar a `vendas_fechamento` (ver `INTEGRACAO-EMPIREDESK-VENDAS.md`). Migração puramente aditiva e idempotente — não altera dados nem campos existentes.

**Impacto:** Nenhum no comportamento atual. As colunas novas ficam vazias até a ponte (Fase 1.2/1.4) começar a gravar vendas do Desk.

**Arquivos alterados:**
- `supabase/migrations/20260527000000_vendas_fechamento_pagamentos_closer_comprovantes.sql` (novo)

---

## 2026-05-18 — Schema de Relatórios Semanais (Tabelas Tipadas por Módulo)

**O que mudou:** Criado o schema completo do módulo de relatórios semanais no Supabase, migrando do design EAV (Entity-Attribute-Value) original para **tabelas tipadas por módulo** com uma tabela central `weekly_snapshots`.

**Schema criado:**
- `weekly_snapshots` — catálogo central. Cada semana comercial gera 2 snapshots (`cohort`, `produtividade`). Rastreia `status`, `data_version`, `computed_at`, `error_message`.
- `weekly_trafego`, `weekly_aquisicao`, `weekly_organico`, `weekly_prevendas`, `weekly_vendas`, `weekly_recuperacao`, `weekly_sdr`, `weekly_closer`, `weekly_metas` — 9 tabelas com colunas tipadas (INTEGER, NUMERIC) + `extras JSONB` para extensibilidade.
- `weekly_cohort_audit` — audit trail de mudanças em cohort. Registra `old_value`, `new_value`, `delta`, `reason`, `trigger_record_id`.
- `weekly_reprocess_queue` — fila de reprocessamento com `priority` (semanas recentes primeiro).
- `v_weekly_dashboard` — view UNION ALL que une todos os módulos em uma "tabela única" para leitura simples.
- `v_weekly_snapshots_status` — visão geral do catálogo (quantos registros cada módulo tem por snapshot).

**RLS:** Todas as 12 tabelas têm Row Level Security habilitado com política `SELECT` para usuários autenticados.

**Índices:** Índices estratégicos em todas as tabelas por módulo (`snapshot_id`, `dimension`, `dimension_value`) e na central (`week_start`, `report_type`, `status`).

**Por quê:** O design EAV original (`weekly_reports` com uma linha por métrica) teria gerado milhares de linhas por semana, queries lentas e perda de type safety. O schema tipado garante performance, auditoria completa e leitura simples via views.

**Impacto:** Nenhum impacto no frontend ainda — as tabelas estão vazias, aguardando edge functions de computação e backfill. Nenhuma tabela ou view existente foi alterada.

**Arquivos alterados:**
- `supabase/migrations/20260518200000_weekly_reports_schema.sql` (novo — 744 linhas)
- `docs/PLANO-RELATORIOS-SEMANAIS.md` (atualizado — schema revisado, tasks ajustadas)
- `docs/ARQUITETURA.md` (atualizado — nova seção no topo)
- `docs/ROADMAP.md` (atualizado — Task 1 da Fase 14 marcada como concluída)
- `CLAUDE.md` (atualizado — descrição do índice do PLANO-RELATORIOS-SEMANAIS.md)

---

## 2026-05-15 — Fix: mensagens de automação ocultas na aba Atividades

**O que mudou:** Removido filtro `ghl_source = 'app'` do hook `useLeadAtividades`. O filtro anterior excluía todas as mensagens outbound de workflow/api/automação, fazendo parecer que muitos leads não tinham mensagens no dashboard mesmo quando o GHL mostrava comunicações. Agora todas as mensagens outbound (humanas e automação) são exibidas — as de automação já possuem o flag `isAutomatico` para diferenciação visual.

**Por quê:** A doc `ABA-ATIVIDADES-PRE-VENDAS.md` especifica que automação deve ser "exibida como 'Automação' — linha com texto indicativo". O código tinha um filtro `.or('and(direction.eq.outbound,ghl_source.eq.app),...')` que contradizia a spec e ocultava 39% das mensagens outbound.

**Impacto:** Aba Atividades do módulo Pré-Vendas passa a mostrar mensagens de workflow e API além das mensagens manuais do SDR. Leads que tinham apenas mensagens de automação agora aparecem na aba.

**Arquivos alterados:**
- `eb-dash2/src/hooks/useLeadAtividades.ts` (linhas 134 e 183)
- `supabase/migrations/20260515100000_relink_orphaned_comunicacoes.sql` (novo — re-linka 61 mensagens com `contato_id=NULL`; requer `supabase db push --password`)

---

## 2026-05-13 — Permissão de gestor de SDRs para Bruno Andrease

**O que mudou:** Bruno Andrease (brunoandrease@gmail.com) passou a ser tratado como gestor de SDRs no módulo Pré-Vendas. Ele agora vê dados de todos os SDRs (sem auto-filtro pelo próprio nome) e pode filtrar por SDR e closer livremente.

**Por quê:** Bruno é gestor do time de SDRs e precisava de visibilidade total do painel sem ter role admin no workspace.

**Impacto:** Apenas o módulo Pré-Vendas para o usuário brunoandrease@gmail.com. Nenhum outro usuário é afetado.

**Arquivos alterados:**
- `supabase/migrations/20260513000001_add_gestor_papel_bruno_andrease.sql`
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx`

---

## 2026-05-08 BRT — Correções múltiplas: criativos, conectado, data_created, duplicados, meta comparecimento

**O que mudou:**

1. **Coluna Reuniões no Ranking de Criativos** (`eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`): nova coluna "Reuniões" entre MQL e Vendas, com contagem de `data_realizacao_vendas` e drill-down modal. Válido em Cohort (any date) e Produtividade (dentro do período).

2. **Corrigir lógica de "conectado"** (`supabase/migrations/20260508000002_fix_conectado_somente_resposta_pos_ia.sql`): trigger `trg_auto_tag_conectado` agora exige ao menos uma mensagem `outbound` prévia antes de marcar o lead como conectado. Leads que enviam a primeira mensagem via botão da página não são mais contados como conectados.

3. **Backfill date_created TIMESTAMPTZ** (`supabase/migrations/20260508000001_backfill_date_created_timestamptz.sql`): corrige contatos onde `date_created` estava armazenado como meia-noite UTC (aparecia "3h a menos" em BRT). Atualiza apenas registros com hora = 00:00:00 UTC.

4. **Safeguard deduplicação leads** (`useAquisicao`, `useOrganico`, `useTrafego`, `usePreVendas`): adicionado filtro `Set<string>` por `opp.id` antes de `setOpps()` — previne duplicatas em caso de edge cases de paginação.

5. **Meta de Comparecimento em Pré-Vendas** (`eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`): novo KPI card "Comparecimento 7d" com janela fixa de 7 dias + 72h de tolerância. Meta: 70%. Card verde quando ≥ 70%, mostra realizados/agendados e aparece em ambos os modos (Cohort e Produtividade).

6. **Guias de diagnóstico**: criados `docs/TROUBLESHOOTING-FUNIL-FORM-FB.md` e `docs/DIAGNOSTICO-DADOS-LEADS.md` com SQLs para investigar funil form-fb e inconsistências gerais nos dados de leads.

**Por quê:** Correções de bugs reportados pelo usuário: funil de conexão inflado, datas erradas, duplicatas visuais, e novos KPIs operacionais solicitados.

**Impacto:** Dashboard de Pré-Vendas, Ranking de Criativos, funil de conexão nos painéis, dados de `date_created` em contatos.

**Arquivos alterados:**
- `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`
- `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`
- `eb-dash2/src/hooks/useAquisicao.ts`
- `eb-dash2/src/hooks/useOrganico.ts`
- `eb-dash2/src/hooks/useTrafego.ts`
- `eb-dash2/src/hooks/usePreVendas.ts`
- `supabase/migrations/20260508000001_backfill_date_created_timestamptz.sql`
- `supabase/migrations/20260508000002_fix_conectado_somente_resposta_pos_ia.sql`
- `docs/TROUBLESHOOTING-FUNIL-FORM-FB.md` (novo)
- `docs/DIAGNOSTICO-DADOS-LEADS.md` (novo)

---

## 2026-05-08 10:17 BRT — Sync automático de usuários GHL + backfill de 5 novos users

### Added

**`supabase/functions/sync-ghl-users/index.ts`** — nova edge function que sincroniza `ghl_users` com a API GHL:
- `GET /users/?locationId={locationId}` → lista completa de usuários do location
- Upsert em `ghl_users` (insert novos / update campos alterados / soft-delete os que saíram)
- Não usa `ghl_api_jobs` (chamada única de listagem, não precisa de fila)

**`supabase/migrations/20260508000000_sync_ghl_users.sql`** — backfill + cron:
- Insere 5 novos usuários que estavam no GHL mas não no banco:
  - Caroline Alves, Gabrielle Oliveira, Ramon Gonçalves, SDR RC1, WEBINAR PRO
- Marca `deleted = true` em 6 usuários que saíram do location:
  - Juninho Dalfré, Marcelo Tetzner, Matheus Alves Webinar, PRY Moraes Webinar, Williams Batista, Leticia Costa
- Registra cron `sync-ghl-users-cron` rodando a cada 6 horas (`0 */6 * * *`)

### Fixed

**Problema:** página Settings > Usuários > "GHL — Time" não mostrava usuários novos adicionados ao GHL após a criação manual da tabela em 2026-03-11.
**Causa:** não existia mecanismo de sincronização automática.
**Solução:** edge function + cron + backfill imediato.

---

## 2026-05-04 09:13 BRT — Fix: filtros não funcionavam em Produtividade — Vendas

**Causa raiz:** `useCloserProdutividade` ignorava todos os filtros dimensionais (campanha, canal, funil, SDR, closer). A assinatura do hook era `(startDate, endDate, enabled)` sem filtros, e o `useEffect` não reagia a mudanças de filtro.

**O que foi corrigido:**
- `useCloserProdutividade.ts`: nova assinatura com `dimensionFilters?`. Carrega `utm_campaigns`, adiciona `utm_campaign` e `sdr_name` ao select dos events, cria `passesFilter()`, aplica `filteredEventOpps` em todos os loops de contagem (leads, eventos de pipeline, comunicações) e filtra `pagoMap` para restringir fechados/faturamento
- `GeralTab.tsx`: passa todos os filtros ao hook; remove `filteredProdRows` useMemo (substituído por `prodRows` direto); simplifica `activeKpis` para usar `prodOverall` (já filter-aware) sem branching por closerFilter
- `MatrizTab.tsx`: aceita `dimensionFilters?: CloserProdutividadeDimensionFilters` e repassa ao hook
- `VendasPage.tsx`: passa `dimensionFilters` com todos os filtros ativos ao MatrizTab

**Resultado:** KPI cards, funil de conversão, tabela de closers e matriz por mês em modo Produtividade agora respondem a todos os filtros (campanha, canal, funil, SDR, closer).

## 2026-04-29 BRT — Clara: streaming SSE + parallel tools + comparação de funis + sistema multi-run

### Performance (toda pergunta)

**`supabase/functions/bot-chat/index.ts`** — 2 melhorias de performance para TODAS as perguntas:
1. **SSE Streaming** (`stream: true`): tokens aparecem em tempo real durante síntese. `callOpenRouterStreaming` faz forward token-by-token via TransformStream. Usuário vê feedback em ~1.5s e primeiros tokens em ~22s, em vez de esperar 36s sem nada.
2. **Parallel tool execution**: tools chamadas pelo modelo agora executam em `Promise.all` em vez de for-loop sequencial. Reduz ~50% do tempo de coleta quando o modelo chama 2+ tools no mesmo round.

**`eb-dash2/src/hooks/useBotChat.ts`** — `callBotChatStreaming` usa `fetch` + ReadableStream para SSE. Mensagem placeholder é atualizada token a token via `updateMessage` com flush a cada 50ms. Toda pergunta simples agora usa streaming automático.

---

## 2026-04-29 BRT — Clara: comparação de funis + sistema multi-run

### Added

**`supabase/functions/bot-chat/index.ts`** — nova tool `query_funnel_comparison`:
- Única chamada que retorna spend Meta, MQLs, reuniões, fechamentos, CPMQL, custo/reunião e conversão agrupados por funil
- `paginatedMetaAds()`: helper paginado para `meta_ads_insights` (evita truncamento PostgREST)
- Sistema de sessão multi-run: salva estado em `ai_analysis_sessions` quando o budget esgotar após coleta mas antes da síntese; frontend auto-retoma
- `session_id` no `ChatRequest` para retomada de sessão

**`supabase/migrations/20260429000000_ai_analysis_sessions.sql`** — tabela `ai_analysis_sessions` com TTL de 1 hora e RLS para service_role.

**`eb-dash2/src/hooks/useBotChat.ts`**:
- `isComplexQuery` não decompõe perguntas do tipo "por funil / compare funis" (perderia contexto cross-funil)
- `callBotChatRaw` aceita `session_id` e faz auto-continue transparente em respostas parciais

**`eb-dash2/tests/clara-funnel.spec.ts`** — 3 testes Playwright que validam a pergunta original sobre funis (todos passando).

### Fixed

**Clara — timeout em perguntas de comparação de funis**
- Causa: `isComplexQuery` só combinava 2 domínios (funil + CPMQL), mandava como chamada única; modelo precisava de 3+ tools em 45s com Qwen → timeout
- Solução: nova tool `query_funnel_comparison` faz tudo em 1 tool call; sistema de sessão garante resiliência mesmo em casos lentos

---

## 2026-04-25 BRT — Módulo Investimento Orgânico + fix Fragment key

### Added

**`docs/MODULO-INVESTIMENTO-ORGANICO.md`** — documentação completa do módulo de custos de equipe orgânica: tabelas, hooks, CustosEquipeModal, `computeOrganicInvestment` e acesso via dashboard.

### Fixed

**`eb-dash2/src/components/organico/CustosEquipeModal.tsx`**
- Fragment sem `key` prop no `.map()` de categorias → substituído por `<Fragment key={cat}>` para eliminar React warning no console.

---

## 2026-04-21 BRT — Fix: Clara — loop otimizado para Qwen 3.6 Plus (FORCE_SYNTHESIS_FROM=2)

### Fixed

**Problema:** Qwen 3.6 Plus gera thinking tokens internos, gastando ~25-35s por round. Com `FORCE_SYNTHESIS_FROM=5` (4 rounds de coleta), o budget de 110s era exaurido antes da síntese chegar a gerar output útil. A síntese retornava empty → fallback.

**Causa raiz confirmada via debug:** round 2 de síntese ficou 110s exatos em `AbortSignal.timeout` — Qwen precisa de 60-90s de thinking antes de escrever qualquer texto em queries analíticas.

**`supabase/functions/bot-chat/index.ts`**
- `FORCE_SYNTHESIS_FROM`: 5 → **2** (1 round de coleta, 1 round de síntese)
- `LOOP_BUDGET_MS`: 110_000 → **135_000** ms (mais margem para Qwen)
- Timeout round de coleta: **45s** (era default 55s)
- Timeout round de síntese: **110s** (dinâmico por budget restante)
- Round de síntese: captura conteúdo independente do `finish_reason` (Qwen pode retornar `tool_calls` mesmo sem tools fornecidas)
- Síntese de emergência: se loop encerrou sem resposta mas havia tool results → 1 call extra
- Atalho perfil de comprador: `messages_per_buyer: 25 → 8`, JSON truncado a 15k chars, timeout `90s → 120s`, fallback gracioso em vez de cair no loop (sem budget após 120s)

**`eb-dash2/tests/bot-chat.spec.ts`**
- Teste 9: query ajustada para 1 domínio focado (funil cohort) — queries multi-domínio são decompostas pelo frontend
- Teste "planejamento 1M": timeout do fetch `110s → 160s`, test timeout `120s → 180s`
- Teste "perfil de comprador": funciona com novos parâmetros do atalho (7050 chars confirmado)
- **Resultado: 10/10 passed** ✅

**`docs/TROCA-DE-MODELO-AI.md`** — seção "Estrutura do loop" e "Continuation mechanism" atualizadas com parâmetros finais

---

## 2026-04-21 BRT — Troca de modelo: Claude Sonnet → Qwen 3.6 Plus (bot-chat)

**Motivo:** custo. Claude Sonnet é 4-5x mais caro. `qwen/qwen3.6-plus` é o modelo obrigatório daqui em diante.

**`supabase/functions/bot-chat/index.ts`**
- `MODEL`: `anthropic/claude-sonnet-4.6` → `qwen/qwen3.6-plus`
- `FORCE_SYNTHESIS_FROM`: `MAX_ROUNDS - 2 = 8` → `5` (Qwen tem ~15-21s/round, forçar síntese mais cedo)
- `timeoutMs` padrão: `75_000` → `55_000` ms por round

**`docs/TROCA-DE-MODELO-AI.md`** — adicionada proibição explícita de modelos Anthropic/Claude/OpenAI

**`CLAUDE.md`** — adicionado bloco de proibição absoluta no topo das regras

---

## 2026-04-21 BRT — Fix: Clara — continuation mechanism para respostas longas + truncate de tool results

### Fixed

**Contexto:** relatórios muito detalhados (perfil de comprador completo, análise multi-KPI, planejamento estratégico) podem ultrapassar 8.192 tokens. Quando isso ocorria, `finish_reason='length'` e o código encerrava com o texto cortado no meio de uma frase.

**`supabase/functions/bot-chat/index.ts`**
- Nova função helper `truncateToolResult(result, maxChars=20_000)` — impede que resultados de tools muito grandes explodam o context window
- Novas variáveis: `continuationCount = 0`, `MAX_CONTINUATIONS = 3`
- Novo bloco para `finish_reason === 'length'`: acumula parcial em `finalAnswer +=`, injeta par `assistant/user` com instrução de continuação, chama `continue` no loop — até esgotar `MAX_CONTINUATIONS` ou budget de 110s
- Resposta normal (`stop`): `finalAnswer +=` para consistência com acumulação

**`eb-dash2/tests/bot-chat.spec.ts`**
- Adicionado Teste 9: solicita relatório completo de março 2026 (multi-KPI) e verifica resposta > 2.000 chars

---

## 2026-04-20 BRT — Fix: Clara — aumentar tokens de síntese para evitar corte em relatórios longos

### Fixed

**Contexto:** relatórios longos (ex: perfil de comprador do trimestre) eram cortados no meio porque os rounds de síntese tinham limite de 3.000 tokens (~2.250 palavras). Rounds intermediários com `tool_calls` não produzem texto longo, então o limite limitava apenas a resposta final.

**`supabase/functions/bot-chat/index.ts`**
- `roundMaxTokens` (rounds ≥ 2): 3.000 → 8.192 tokens
- Round 1 (coleta de dados via tool calls) permanece em 4.096 tokens
- Deploy aplicado: `supabase functions deploy bot-chat --no-verify-jwt`

---

## 2026-04-20 BRT — Fix: Clara — timeout resiliente + decomposição paralela para análises complexas

### Fixed / Feat

**Contexto:** perguntas multi-domínio ("monte uma análise completa de aquisição, orgânico e tráfego") causavam 504 na edge function por exceder o limite de 150s da plataforma. Clara respondia `"Não consegui processar a pergunta. Tente reformular."` mesmo que houvesse dados.

**`supabase/functions/bot-chat/index.ts`**
- Modelo revertido para `anthropic/claude-sonnet-4.6` (2-3s/round vs 11-21s do Qwen)
- `MAX_ROUNDS` aumentado de 5 → 8 para análises que exigem mais ferramentas
- `AbortSignal.timeout(75_000)` por round — nunca mais pendura indefinidamente
- `LOOP_BUDGET_MS = 110_000` — guarda de orçamento total: se restar < 20s, encerra o loop antes de iniciar novo round
- `max_tokens` por round: 4096 (round 1) → 3000 (rounds 2+) para reduzir latência de síntese
- Mensagem de erro orientativa quando budget esgota (em vez de erro genérico)

**`eb-dash2/src/contexts/ChatContext.tsx`**
- `addMessage()` agora retorna o `id` (UUID) da mensagem criada
- Novo `updateMessage(id, content)` — permite editar mensagem existente no array sem re-montar componente

**`eb-dash2/src/hooks/useBotChat.ts`** (arquitetura paralela)
- `isComplexQuery(text)` — detecta ≥3 domínios (aquisição, orgânico, tráfego, vendas) na pergunta
- `buildDomainQuestions(text)` — divide em 4 sub-perguntas focadas (uma por domínio)
- `callBotChatRaw()` — chamada direta à edge function sem gerenciar estado externo
- `sendMessage()` bifurcado: perguntas simples → 1 call normal; perguntas complexas → 4 calls simultâneas via `Promise.allSettled`
- UI progressiva: placeholder inserido imediatamente, atualizado via `updateMessage()` conforme cada domínio conclui (~30s total vs 120s+ sequencial)

---

## 2026-04-16 BRT — Feat: custo-por-etapa nos KPI cards de funil (Aquisição, Pré-Vendas, Vendas)

### Added

Cada KPI card que exibe contagem de uma etapa do funil agora mostra o **custo unitário** (gasto Meta Ads / contagem) como `subValue` abaixo do número principal. O custo aparece apenas quando há spend > 0 registrado para o período e filtros ativos — se não há tráfego pago, os cards ficam sem alteração.

**Arquivos alterados:**

- **`eb-dash2/src/pages/aquisicao/tabs/AquisicaoTab.tsx`**
  - Adicionado helper `cpe(spend, count)` — retorna string compacta (ex: `R$ 1,2k`) ou `undefined` quando spend/count = 0
  - Modo Produtividade: `subValue={cpe(...)}` em Leads, MQLs, Conectados, Agendados, Reuniões, Fechados
  - Modo Cohort: `subValue` em Conectados (abaixo do FunnelViz)

- **`eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`**
  - Importado `computeMetaKpis` (antes `metaRows` chegava como `_metaRows` ignorado)
  - Adicionado `metaKpis = useMemo(...)` + helper `cpe`
  - `subValue` em todos os KpiCards de funil (ambos modos cohort e produtividade)

- **`eb-dash2/src/pages/vendas/tabs/GeralTab.tsx`**
  - Adicionada prop `metaRows?: MetaRow[]` na interface + importado `computeMetaKpis`, `MetaRow`
  - `metaKpis = useMemo(...)` + helper `cpe`
  - `subValue` em Leads, MQLs, Agendados, Reuniões, Fechados

- **`eb-dash2/src/pages/vendas/VendasPage.tsx`**
  - Destructura `metaRows` de `usePreVendas` e passa para `<GeralTab>`

---

## 2026-04-16 BRT — Feat: coluna de Aprovação na tabela Produção (Notion)

### Added

**`eb-dash2/src/pages/traqueamento/tabs/AnunciosTab.tsx`** — nova coluna "Aprovação" na tabela da sub-aba Produção (Notion) em Anúncios/Traqueamento:
- Botão **Sim** (azul quando ativo) e **Não** (vermelho quando ativo) por linha
- Clicar no botão já ativo desfaz a avaliação (volta a null)
- Salva `aprovado` (boolean | null) e `data_avaliacao` (timestamptz) no Supabase com update otimista
- Exibe data/hora da avaliação em BRT abaixo dos botões (azul = aprovado, vermelho = reprovado)

**`supabase/migrations/20260416000003_add_aprovacao_notion_creatives.sql`** — adiciona `aprovado BOOLEAN` e `data_avaliacao TIMESTAMPTZ` na tabela `notion_creatives`.

---

## 2026-04-16 BRT — Fix: sync-contact-attribution excluía leads com contact_source NULL

### Fixed

**`supabase/functions/sync-contact-attribution/index.ts`** — 3 bugs corrigidos:

1. **Bug crítico — `contact_source NULL` = exclusão silenciosa:** leads do Facebook com `contact_source = NULL` (o GHL nem sempre preenche esse campo) eram ignorados pelo cron e pelo trigger sem qualquer erro ou log. O `attribution_attempts` nunca subia e o lead ficava preso para sempre sem UTM. Corrigido no SQL com `.or('contact_source.ilike.facebook%, contact_source.is.null')` e no filtro JavaScript (removido o check de `contact_source` pós-SQL, pois a tag `[cp] form-fb` é suficiente).

2. **Bug crítico — `backfill: true` não mudava a janela de tempo:** o parâmetro `backfill` existia no código mas não alterava os `days_back` — a janela de 30 dias era sempre aplicada. Leads mais antigos com UTM vazia nunca eram processados mesmo no backfill manual. Corrigido: quando `backfill = true`, a janela é ampliada automaticamente para 365 dias.

3. **Bug moderado — filtro de `contact_source` só no JavaScript:** a query SQL buscava até 300 contatos pela tag e depois o JS descartava os que não tinham `contact_source` correto, desperdiçando capacidade de batch. Filtro movido para SQL.

**`supabase/migrations/20260416000001_fix_attribution_trigger_contact_source_null.sql`** — recria `trg_fn_enqueue_attribution_on_contact` com lógica corrigida: aceita `contact_source IS NULL` ou começando com `'facebook'` (a tag `[cp] form-fb` é a fonte de verdade).

**Ação pós-deploy recomendada:**
```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-contact-attribution" \
  -H "Authorization: Bearer {SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"backfill": true, "batch_size": 100, "apply_batch_size": 300}'
```
Repetir até `fetch_enqueued = 0`.

---

## 2026-04-14 BRT — Feature: Aba Cami no módulo Vendas

### Added
- **`eb-dash2/src/hooks/useCamiVendas.ts`:** hook dedicado para o produto Cami Start. Carrega oportunidades com paginação e filtra por tags no cliente:
  - `[cp] cami start` → inscrito
  - `cami start` → comprador
- **`eb-dash2/src/pages/vendas/tabs/CamiTab.tsx`:** aba completa com:
  - 4 KPI cards: Inscritos, Compradores, Taxa de Conversão e Faturamento
  - Gráfico SVG dia-a-dia com barras lado a lado (inscritos/compradores)
  - Tabela completa com busca, ordenação e colunas: Nome, E-mail, Telefone, Status (badge), Inscrição, Compra, Canal, Faturamento
- **`eb-dash2/src/pages/vendas/VendasPage.tsx`:** aba `Cami` adicionada ao array TABS com ícone `Star`. Hook `useCamiVendas` invocado dentro do componente com `startDate`, `endDate` e `activePanel`.
- **`eb-dash2/src/components/layout/Sidebar.tsx`:** link `Cami` adicionado ao children do módulo Vendas.

### Comportamento cohort vs produtividade
- Ambos os modos filtram inscritos e compradores por `data_lead_recebido` no período (não há data de compra no CRM para Cami Start ainda).

### Correções aplicadas pós-deploy
- **Bug: 0 compradores** — inscritos e compradores agora filtrados **independentemente** de `allOpps`. Antes, compradores eram subconjunto dos inscritos (exigiam tag `[cp] cami start`), o que excluía compradores sem essa tag.
- **Faturamento removido** — sem dados de `vendas_fechamento` para Cami Start por ora.
- **Tabela clicável** — `LeadCard` integrado via `selectedOppId`, padrão igual a ReunioesTab.
- **Documentação criada** — `docs/ABA-CAMI.md` com regras de tags, arquitetura e guia de evolução futura.

## 2026-04-13 BRT — Fix: faturamento Produtividade inflado em Vendas

### Fixed
- **`useCloserProdutividade`:** query de `vendas_fechamento` não tinha limite superior em `data_pagamento_entrada`, acumulando pagamentos de abril/mai em diante ao visualizar março. Adicionado `.lte('data_pagamento_entrada', endISO)`.
- **`usePreVendasProducao`:** mesma classe de bug — query sem upper bound e sem paginação. Corrigido com `.lte(endISO)` + loop paginado.
- **Impacto:** aba Vendas (Produtividade) exibia ~R$ 85k a mais que aba Aquisição para o mesmo período; agora ambas convergem.

## 2026-04-13 12:30 BRT — Fix attribution form-fb: trigger imediato + anti-loop skip

### Fixed
- **Leads de formulário FB sem UTM:** a cron `sync-contact-attribution` parou de ser invocada efetivamente entre 09/04 e 13/04 (instabilidade no runtime de edge functions do Supabase). O pg_cron marcava "succeeded" via `net.http_post` fire-and-forget mesmo sem a função rodar. 17 leads ficaram sem UTM nesse período — todos foram backfillados manualmente.

### Added
- **Trigger `trg_attribution_on_contact`:** dispara `AFTER INSERT OR UPDATE` em `contatos`. Quando um lead com tag `[cp] form-fb` + `contact_source LIKE 'facebook%'` + UTM vazia chega, o job `GET /contacts/{id}` é enfileirado **imediatamente** na `ghl_api_jobs`, sem depender do cron de 5 min. Isso torna o processo event-driven para novos leads.
- **Colunas `attribution_attempts` e `attribution_skip` em `contatos`:** quando a edge function não consegue resolver a attribution (GHL sem `attributionSource`) após 10 tentativas, marca `attribution_skip = TRUE` e para de re-enfileirar. Evita loop infinito para contatos como Rubens Cunha e Tatiana Coelho (marcados com `attribution_skip = TRUE, attribution_attempts = 99` na migration `20260413000001`).

### Migration
- `20260413000001_attribution_trigger_and_skip.sql`

## 2026-04-13 10:10 BRT — Score real do MQL na aba Leads

### Added
- **Novo score único de qualidade real do MQL:** a aba `Leads` agora calcula um `score 0-100` por oportunidade MQL com base em resposta, conexão, agendamento, avanço comercial e compra confirmada.
- **Novo util compartilhado `eb-dash2/src/lib/lead-quality-score.ts`:** concentra bucket (`Excelente` → `Critico`), maturidade do lead e normalização por `pontos_elegiveis`.
- **Resumo agregado por filtro na própria aba:** a `LeadsTable` agora mostra score médio e taxas derivadas por `Canal`, `Funil`, `Campanha`, `SDR` e `Estágio`.
- **Nova documentação canônica:** `docs/LEAD-QUALITY-SCORE.md`.

### Changed
- **`useMQLCohortComms`:** além das contagens, o hook agora preserva timestamps inbound por contato para calcular tempo da primeira resposta do lead.
- **`LeadsTable`:** ganhou duas colunas novas (`Score`, `Termômetro`) e um resumo operacional acima da tabela para leitura por filtro.
- **Escopo do score:** considera apenas leads cujo contato tenha tag `MQL`, mantendo a regra do projeto de MQL por tag e compra por `data_pagamento_entrada`.

### Regras de negócio fixadas
- **Universo do score:** apenas MQLs
- **Lógica temporal:** cohort por `data_lead_recebido`, snapshot até hoje
- **Compra real:** somente `vendas_fechamento.data_pagamento_entrada`
- **Lead recente não é penalizado por etapa ainda não maturada:** o score usa `pontos_elegiveis` para liberar cada bloco conforme a idade do lead ou conforme o evento já tenha ocorrido

## 2026-04-13 10:42 BRT — Não conectados ao lado de Conectados em Aquisição, Tráfego e Orgânico

### Added
- **Par operacional `Conectados` + `Não conectados`:** os módulos `Aquisição`, `Tráfego` e `Orgânico` agora exibem `Não conectados` ao lado do card `Conectados` nos blocos operacionais da Visão Geral.
- **Filtro de conexão na tabela de leads:** `LeadsTable` continua com seletor interno de conexão com 3 estados: `Todas conexões`, `Não conectados` e `Conectados`.

### Changed
- **Drilldown de não conectados:** o clique agora abre o mesmo `LeadListModal` já usado por `Conectados`, em vez de navegar para a aba `Leads`.
- **Regra de produtividade para não conectados:** no modo `Produtividade`, o card usa os leads gerados no recorte atual que **ainda não possuem `data_conectado`**.

### Comportamento
- **Não conectado:** oportunidade sem `data_conectado`.
- **Clique no card:** abre lista modal de leads não conectados.
- **Clique no lead:** continua abrindo o `LeadCard` atual, igual ao fluxo de `Conectados`.

## 2026-04-10 — Funil sem Conectados + Taxa de Agendamento por MQL

### Changed
- **Funil de Conversão (todos os módulos):** etapa "Conectados" removida do visual FunnelViz. O funil passa de 6 para 5 etapas: `Leads → MQLs → Agendados → Reuniões → Fechados`. Conectados continua visível como KpiCard separado em todos os painéis.
- **Taxa de Agendamento — nova fórmula:** `agendados / MQLs` (antes: `agendados / conectados`). Mudança aplicada em todos os pontos do sistema:
  - `useCohort.ts` — `agendados_pct`
  - `useProdutividadeMatrix.ts` — `agendados_pct`
  - `useSDRLeaderboard.ts` — `taxa_agendamento` (inclui import de `isMqlByTag`)
  - `useSDRHighlightChart.ts` — `bookingRate` + tooltip
  - `prevendas/GeralTab.tsx` — `taxaAgendamento` em `cohortKpis`
- **`computeFunnel` (useTrafego.ts):** removida a entrada `{ key: 'conectados' }` do array retornado. O `funnelLeadsMap` em `TrafegoTab.tsx` mantém a key `'conectados'` para suportar o modal de drilldown.

### Regras de negócio atualizadas
- **Taxa de agendamento:** `agendados / MQLs` (não mais por conectados)
- **Conectados:** continua rastreado e exibido como KpiCard independente — não faz parte da cascata do funil

---

## 2026-04-10 12:45 BRT — Gráfico de destaque por SDR no topo da aba SDRs

### Added
- **`eb-dash2/src/hooks/useSDRHighlightChart.ts`:** novo hook dedicado ao gráfico de destaque. Consolida 4 métricas por SDR com drilldown por barra: taxa de agendamento, tempo médio de agendamento, contatos tentados e faturamento. No modo `Produtividade`, carrega a base operacional completa sem limitar por `data_lead_recebido`, aplica os filtros globais da página e respeita `data_pagamento_entrada` para faturamento.
- **Gráfico de destaque no topo da aba `SDRs`:** novo bloco visual comparativo com 4 barras por SDR, escalas independentes por métrica, valor fixo acima de cada barra, tooltip no hover e clique para abrir `LeadListModal` com os leads daquela métrica.

### Changed
- **`eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`:** integra o gráfico tanto em `Cohort` quanto em `Produtividade`, reaproveita o modal já existente e mantém a ordenação dos SDRs consistente com a visão principal da aba.
- **`eb-dash2/src/pages/prevendas/PreVendasPage.tsx` e `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx`:** passam `revenueRows` para `SDRsTab`, permitindo que o gráfico use o faturamento cohort sem refetch extra no modo `Cohort`.

### Regras de negócio fixadas
- **Taxa de agendamento:** `agendados / MQLs`
- **Tempo médio de agendamento:** média em dias entre `data_lead_recebido` e `data_agendamento_reuniao`
- **Contatos tentados:** `ligações + mensagens`, obedecendo o toggle global `Apenas MQL`
- **Faturamento em produtividade:** usa `vendas_fechamento.data_pagamento_entrada` no período, não `data_fechado`

---

## 2026-04-10 11:25 BRT — Remoção da aba Estatísticas de Pré-Vendas

### Removed
- **`eb-dash2/src/pages/prevendas/tabs/EstatisticasTab.tsx`:** aba removida do módulo Pré-Vendas.
- **`eb-dash2/src/hooks/useSDREstatisticas.ts`:** hook exclusivo da aba removido.
- **`eb-dash2/src/components/prevendas/SDRTable.tsx`, `SDRScorecardGrid.tsx`, `ScoreExplanation.tsx`, `Top3SDRCards.tsx`, `SDRCorrelationCharts.tsx`, `SDRLeaderboardCard.tsx`:** componentes exclusivos de estatísticas/ranking SDR removidos para evitar código morto.
- **`docs/ABA-ESTATISTICAS-PRE-VENDAS.md`:** documentação da aba removida do índice vivo do projeto.

### Changed
- **`eb-dash2/src/pages/prevendas/PreVendasPage.tsx`:** item `estatisticas` removido do array `TABS` e do fluxo de renderização.
- **`eb-dash2/src/components/layout/Sidebar.tsx`:** submenu `Pré-Vendas > Estatísticas` removido para manter a navegação sincronizada com as tabs reais.
- **`CLAUDE.md`, `docs/DASHBOARD-MODULOS.md`, `docs/ARQUITETURA.md`, `docs/ROADMAP.md`:** referências atualizadas para refletir a remoção da aba.

---

## 2026-04-10 — Aba "Meta MQL" dedicada no módulo Orgânico com seletor de período

### Added
- **`eb-dash2/src/hooks/useOrganicoMetaTab.ts`:** hook que carrega TODOS os períodos de meta cadastrados para `organico.mql_count` (sem filtro de data — independente do filtro global). Retorna `GoalPeriod[]` com `id`, `label`, `startDate`, `endDate`, `globalTarget`, `targetByChannel`. Agrupa versões por `(period_start, period_end)`.
- **`eb-dash2/src/pages/organico/tabs/MetaOrganicoTab.tsx`:** aba dedicada ao acompanhamento de metas. Contém seletor de período (ex: "Abril 2026 · 01/04 → 30/04"), seletor de canal, badge de estado (ativo/encerrado/futuro), carregamento próprio de oportunidades para o período selecionado (independente do filtro global), e exibe `OrganicoMqlGoalChart`.

### Changed
- **`eb-dash2/src/pages/organico/OrganicoPage.tsx`:** `OrganicoMqlGoalChart` removido da aba Visão Geral (era redundante com a aba Meta). Nova aba `Meta MQL` adicionada ao `TABS` array. `useOrganicoMeta` e `activeTarget`/`activeChannelLabel` removidos (agora vivem dentro da `MetaOrganicoTab`).
- **`eb-dash2/src/components/layout/Sidebar.tsx`:** adicionado `{ title: 'Meta MQL', href: '/organico?tab=meta', icon: Target }` nos filhos do item Orgânico.

### Comportamento
- Aba "Meta MQL" no módulo Orgânico: independente do filtro global de datas. O usuário seleciona um período da meta cadastrado (ex: "Abril 2026") e vê os dados reais vs meta para aquele período.
- Auto-seleciona o período atual (se houver sobreposição com hoje) ou o mais recente.
- Se período tiver metas por canal, o seletor de canal mostra apenas os canais com meta cadastrada para aquele período.
- Badge indica se o período está ativo (verde), encerrado (cinza) ou é futuro (cinza).

---

## 2026-04-10 — Metas por canal orgânico + gráfico MQL vs Meta

### Added
- **`supabase/migrations/20260410120000_add_organico_mql_goal_metric.sql`:** nova métrica `organico.mql_count` no catálogo `goal_metric_definitions`. Suporta escopo `workspace` (global) e `channel` (canal orgânico individual). Provider: `organico.mql_count`.
- **`eb-dash2/src/hooks/useOrganicoMeta.ts`:** hook leve que carrega apenas os targets de metas orgânicas para o período ativo. Retorna `targetByChannel` (Map utm_source → valor) e `globalTarget` (soma dos canais, ou versão workspace se cadastrada).
- **`eb-dash2/src/components/organico/OrganicoMqlGoalChart.tsx`:** gráfico SVG de duas linhas (MQLs reais acumulados + ramp ideal linear), com labels numéricas nos pontos, marcador "hoje", 4 chips de resumo (Total Real, Meta, % Atingido, Ideal/dia recalculado), estado sem meta e loading skeleton.

### Changed
- **`eb-dash2/src/lib/goals/types.ts`:** `GoalAreaKey` agora inclui `'organico'`; `GoalScopeOptionsMap` inclui `organicChannel: GoalScopeOption[]`.
- **`eb-dash2/src/lib/goals/catalog.ts`:** adicionado `GOAL_AREA_META['organico']` (azul, label "Orgânico") e case `organico → organicChannel` em `getScopeSourceKey()`.
- **`eb-dash2/src/lib/goals/service.ts`:** `loadGoalScopeOptions()` agora carrega `utm_sources_plain` e retorna `organicChannel`; adicionada função `evaluateOrganicoMqlCount()` seguindo o padrão do tráfego pago; case `organico.mql_count` no dispatcher `evaluateGoalRecord()`; cache `organico` em `EvaluationCaches`.
- **`eb-dash2/src/components/goals/GoalEditorDialog.tsx`:** `getScopeOptionsForMetric()` agora retorna `scopeOptions.organicChannel` quando a área é `'organico'` e o escopo é `'channel'`.
- **`eb-dash2/src/pages/organico/OrganicoPage.tsx`:** integra `useOrganicoMeta` e renderiza `<OrganicoMqlGoalChart>` no topo da aba Visão Geral, acima de `<AquisicaoTab>`. O gráfico responde ao filtro de canal: exibe a meta do canal selecionado ou a global.

### Comportamento
- Na aba **Metas**: nova área "Orgânico" disponível. Cadastrar metas por canal (Instagram, YouTube, etc.) com escopo `Canal`, ou meta global com escopo `Global`.
- A meta global = soma automática das metas por canal (calculada no frontend; sem necessidade de cadastrar separadamente).
- No módulo **Orgânico → Visão Geral**: gráfico aparece sempre. Sem meta cadastrada, exibe CTA para cadastrar.
- Filtro de canal: ao selecionar um canal, gráfico muda para dados + meta daquele canal específico.

---

## 2026-04-09 — Estatísticas SDR v4: produtividade com esforço objetivo

### Changed
- **`useSDREstatisticas.ts`:** nova fórmula oficial do score com 5 blocos: `45% agendamento`, `20% mensagens`, `5% ligações`, `20% velocidade`, `10% vendas`.
- **Esforço documentado e implementado sem abstração:** esforço agora é dividido de forma explícita em `80% mensagens` e `20% ligações`, sempre proporcional à base recebida.
- **Base de proporcionalidade:** usa `MQLs` como base principal e faz fallback para `leads` quando o SDR não tiver MQL no período.
- **`EstatisticasTab.tsx`:** aba reestruturada para leitura operacional, com KPIs enxutos + gráfico comparativo + bloco textual da regra.
- **`ScoreExplanation.tsx`:** explicação reescrita para mostrar a regra oficial da página em linguagem de negócio.

### Added
- **`SDRStatsGroupedBarChart.tsx`:** gráfico de barras agrupadas em SVG puro com 4 dimensões por SDR:
  - taxa de agendamento
  - esforço por base
  - velocidade de agendamento
  - vendas
- **`SDRTable.tsx`:** tabela operacional completa adicionada abaixo do gráfico com ordenação por cabeçalho e drilldown em Base, Agendamentos e Vendas.
- **Destaque local por SDR:** seletor na própria aba que mantém todos os SDRs no gráfico e apenas destaca o escolhido.
- **Novas métricas derivadas no hook:** `baseCount`, `baseLabel`, `mensagensPorMql`, `ligacoesPorMql`, `esforcoPorMql`, `taxaAgendamentoMql`, `velocidadeScore`, `vendasPorAgendamento` e `scoreBreakdown`.

### Removed
- **`SDRRankingCards.tsx`:** cards de ranking removidos da aba; a leitura principal agora é comparativa por barras.

---

## 2026-04-09 — Redesign Estatísticas SDR (v3 — do zero)

### Changed
- **`SDRRankingCards.tsx` (novo):** layout de cards por SDR substituindo todos os gráficos. Cada card mostra: badge de posição, nome, score, barra de progresso (agendamentos/MQLs), contagem bruta de mensagens e ligações, tempo de resposta. Sem métricas normalizadas confusas.
- **`ScoreExplanation.tsx` (reescrito):** explicação em linguagem de negócio com ícones — sem fórmulas cruas no título, com descrição do "porquê" de cada componente.
- **`EstatisticasTab.tsx` (reescrito do zero):** 4 KPIs (Leads, MQLs, Agendamentos, Taxa Média) → Ranking Cards → Fórmula do Score. Todos os gráficos removidos.

### Removed
- `SDRComparisonChart.tsx`, `SDRMetricsTable.tsx` — removidos; visualização simplificada para cards.

---

## 2026-04-09 — Redesign completo da aba Estatísticas SDR (v2)

### Changed
- **`SDRComparisonChart.tsx` (novo):** gráfico de barras agrupado SVG puro substituindo o scatter plot anterior. Mostra 3 barras por SDR lado a lado em escala 0–100: Score (âmbar), Taxa de Agendamento % (verde), Esforço relativo % (azul). Chips de toggle por SDR, tooltip interativo com detalhes completos.
- **`SDRMetricsTable.tsx` (reescrito):** tabela expandida com novas colunas Leads, MQLs, Msgs (absoluto) e Lig. (absoluto), mantendo Msgs/MQL, Taxa Agend., T. Agend. e Score com color coding.
- **`EstatisticasTab.tsx` (reescrito):** nova estrutura KPIs → Bar Chart → Tabela → Fórmula do Score; bug do `Info` import corrigido; filtro global de SDR agora conectado.
- **`PreVendasPage.tsx`:** campo `sdr` incluído no objeto `filters` passado para `EstatisticasTab` — seleção de SDR no dropdown global agora filtra a aba Estatísticas.

### Removed
- **`SDRPerformanceChart.tsx`:** scatter plot removido; substituído pelo `SDRComparisonChart` (grouped bar chart).

### Fixed
- Bug crítico: ícone `Info` usado no estado de erro mas nunca importado em `EstatisticasTab.tsx` → crash silencioso corrigido.
- Filtro global de SDR não era repassado para `useSDREstatisticas` → corrigido passando `sdr: sdr || undefined`.

---

## 2026-04-09 — Auto-tag "conectado" + data_conectado via inbound

### Added
- **Trigger `trg_auto_tag_conectado` em `comunicacoes`:**
  - Dispara em toda mensagem inbound (AFTER INSERT)
  - Verifica se o contato já tem a tag "conectado" (match exato, case-insensitive, via UNNEST para não confundir com "mqlconectado")
  - Se não tiver: atualiza `contatos.tags` localmente + preenche `oportunidades.data_conectado` (se NULL) com a data da mensagem + enfileira `PUT /contacts/{id}` na `ghl_api_jobs` para sincronizar ao GHL
  - Idempotency key `auto-tag-conectado:{contato_id}` evita jobs duplicados na fila
  - Priority 3 na fila (entre urgente=2 e normal=5)

- **Backfill retroativo (migration `20260409160000`):**
  - Cobre todos os contatos com mensagem inbound desde 2026-03-01 sem a tag "conectado"
  - Atualiza `contatos.tags` + `oportunidades.data_conectado` (= data da PRIMEIRA mensagem inbound)
  - Enfileira jobs com priority 10 (backfill lento, não compete com real-time)
  - Worker existente (`ghl-api-worker`) processa automaticamente

### Fixed
- SDRs não precisam mais adicionar a tag "conectado" manualmente quando um lead responde
- `data_conectado` em `oportunidades` é preenchido automaticamente, corrigindo contagem de "conectados" no leaderboard SDR e funil de cohort

---

## 2026-04-09 — Redesign da aba Estatísticas (Pré-Vendas)

### Changed
- **Nova fórmula de score para SDRs (0–100 pts, 3 componentes claros):**
  - Eficiência de Agendamento [45 pts]: `agendamentos ÷ max(mqls, leads)` — premia SDRs que convertem bem
  - Esforço Proporcional [35 pts]: `(ligacoes×2 + mensagens) ÷ leads ÷ 10` — premia esforço proporcional ao volume
  - Volume Absoluto [20 pts]: `agendamentos ÷ 10` — bônus de volume real
  - Removida penalidade por tempo de resposta (métrica agora exibida separadamente)

### Added
- **Novo campo em `SDREstatisticaRow`:**
  - `tempoMedioAgendamentoDias`: média de dias entre `data_lead_recebido` e `data_agendamento_reuniao` para MQLs

- **Novo componente `SDRPerformanceChart`:**
  - Gráfico de barras agrupadas (SVG) com 3 métricas por SDR lado a lado
  - Filtro via chips para mostrar/ocultar SDRs individuais
  - Tooltip com detalhes ao hover
  - Legenda integrada

- **Novo componente `SDRMetricsTable`:**
  - Tabela com: Pos., SDR, Msgs/MQL, Taxa Agend. MQL, Score, T. Médio Agend.
  - Cores contextuais por coluna (verde/âmbar/vermelho conforme valor)
  - Badges de pódio (1º/2º/3º) e indicador IA

- **Documentação atualizada em `ScoreExplanation`:**
  - 3 componentes claros vs. fórmula anterior com penalidades
  - Cap explicado: 100 pts máximo
  - Nota sobre proporcionalidade: SDR com poucos leads pode pontuar alto

### UI Changes
- Aba Estatísticas agora exibe:
  1. KPI cards consolidados (mantidos)
  2. Gráfico de performance comparativa (novo, substitui Top 3 cards)
  3. Tabela de métricas por SDR (novo, substitui ranking com drilldown modal)
  4. Explicação do score (atualizada)

### Migration
- Nenhuma — mudanças apenas em hook `useSDREstatisticas` e componentes React

## 2026-04-09 — Diagnóstico do cron de attribution em produção

### Fixed
- **Diagnóstico do comportamento do cron `sync-contact-attribution`:**
  - **Sintoma observado:** três leads novos de Facebook Form em 2026-04-09 apareceram temporariamente sem `utm_*`, mesmo com o cron ativo.
  - **Causa real:** o fluxo atual não é single-pass. A primeira execução só enfileira e busca o contato remoto; a segunda execução consome esse resultado e aplica os campos.
  - **Validação operacional:** os leads `Domerval Júnior`, `Marcus serrano` e `Diego Alves` foram preenchidos normalmente após a segunda passada.
  - **Conclusão:** o cron não estava parado; o comportamento esperado correto hoje é repair assíncrono em duas passadas.

### Known limitations
- Permanecem 2 contatos sem `utm_*`:
  - `Rubens Cunha`
  - `Tatiana Coelho`
- Nesses dois, o `attributionSource` do GHL não traz `utmContent`, `campaignId` nem `adId`, então a derivação segura não é possível só com a fonte atual.

## 2026-04-08 — Repair de attribution para leads Facebook Form

### Contexto
- Leads de formulário do Facebook estavam entrando com `contact_source = Facebook`, tag `[cp] form-fb` e `utm_*` locais vazios.
- O GHL já armazenava `attributionSource` / `lastAttributionSource` completos no contato remoto, mas isso não estava sendo traduzido para os custom fields do CRM nem refletido de volta em `contatos`.

### Mudanças
- Nova edge function `supabase/functions/sync-contact-attribution/index.ts`
  - drena `GET /contacts/{id}` do GHL via `ghl_api_jobs`
  - traduz o tracking code Meta para o padrão interno do projeto
  - preenche `contatos.utm_*` e `contatos.tt_*` apenas nas lacunas
  - enfileira `PUT /contacts/{id}` para preencher os custom fields equivalentes no GHL apenas quando estiverem vazios
- Nova migration `20260408190000_create_sync_contact_attribution_infra.sql`
  - cria a tabela `ghl_custom_field_mappings`
  - seeda os 10 IDs reais dos custom fields alvo (`utm_*` e `tt_*`)
  - agenda o cron `sync-contact-attribution` a cada 5 minutos
- Nova documentação operacional: `docs/SYNC-CONTACT-ATTRIBUTION.md`

### Regra de negócio aplicada
- Escopo limitado a contatos com tag `[cp] form-fb` e `contact_source` iniciado por `Facebook`
- Sem sobrescrita:
  - não mexe em coluna local já preenchida
  - não mexe em custom field do GHL já preenchido

### Tradução aplicada
- `P29` no tracking code → `utm_sources.public_code` → `utm_source = iads-28`
- `PG32` no tracking code → `utm_campaigns.page_code` → `utm_campaign = 32`
- `O1` → `utm_medium = 1`
- `CR-248` → `utm_content = CR-248`
- código completo → `utm_term`

Formato baseado em [Keep a Changelog](https://keepachangelog.com/)

## [Unreleased]

### 2026-04-08 — FEAT: Produção (Notion) com controle manual de teste de criativos

**Objetivo:** permitir que a operação marque, direto na aba `Traqueamento > Anúncios > Produção (Notion)`, se um criativo já foi testado e em que data o teste começou.

**O que mudou:**
- adicionadas as colunas `creative_tested` e `test_started_at` na tabela `notion_creatives`
- adicionada policy RLS de `UPDATE` para membros autenticados do workspace em `notion_creatives`
- a tabela da sub-aba `Produção (Notion)` agora exibe checkbox `Testado` e campo `Início do Teste`
- ao desmarcar `Testado`, a data de início do teste é limpa automaticamente
- ao preencher `Início do Teste`, o criativo passa a ser marcado como testado
- os campos manuais não entram no sync do Notion e permanecem preservados entre sincronizações

**Arquivos alterados:**
- `eb-dash2/src/pages/traqueamento/tabs/AnunciosTab.tsx`
- `supabase/migrations/20260408164000_add_test_fields_to_notion_creatives.sql`
- `docs/ARQUITETURA.md`
- `docs/DASHBOARD-MODULOS.md`
- `docs/ROADMAP.md`

### 2026-04-08 — REFACTOR: público consolidado dentro do Ranking de Criativos

**Objetivo:** eliminar a duplicação entre `Ranking de Criativos` e `Criativo por Público`, mantendo o recorte de público dentro de uma única tabela.

**O que mudou:**
- removida a aba separada `Criativo por Público`
- adicionada rota de compatibilidade: `?tab=criativos-publico` redireciona para `?tab=criativos`
- adicionada expansão por setinha em cada criativo, exibindo abaixo todas as linhas de públicos e seus resultados
- o ranking agora filtra mídia, CRM e faturamento pelo mesmo `public_code` extraído de `utm_term`/`ad_name`
- navegação do topo e sidebar voltaram a exibir apenas `Ranking de Criativos`

**Arquivos alterados:**
- `eb-dash2/src/pages/dashboard/DashboardPage.tsx`
- `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `docs/PAINEL-TRAFEGO-PAGO.md`
- `docs/DASHBOARD-MODULOS.md`

### 2026-04-06 — BUG FIX CRÍTICO: Tags NULL sistêmico — 78 MQLs invisíveis no dashboard

**Problema:** O cron `sync-tags-from-webhook` estava falhando silenciosamente desde 2026-03-26 (3.130 execuções, 0 sucessos). 92 contatos acumularam `tags = NULL` ou `tags = ''`, sendo 78 com oportunidade em pipeline MQL — invisíveis em todos os painéis.

**Causa raiz:** Migration `20260326000002` criou um segundo overload de `sync_tags_from_latest_webhook()` com assinatura diferente (`p_days_back INT DEFAULT 90`) em vez de substituir a versão original. O PostgreSQL lançava "function is not unique" em cada execução do cron.

**Correções:**
1. `DROP FUNCTION sync_tags_from_latest_webhook()` — remove overload ambíguo
2. Backfill completo com janela de 365 dias para todos os afetados (incluindo `tags = ''`)
3. Cron reagendado e funcional
4. `trigger_extrair_dados_ghl` agora chama `sync_tags_from_webhook_target()` após cada webhook — sincronização em tempo real como defense-in-depth

**Migrations:**
- `supabase/migrations/20260406000001_fix_sync_tags_ambiguity_and_backfill.sql`
- `supabase/migrations/20260406000002_fix_extrair_dados_ghl_tags_on_trigger.sql`

**Documentação:** [`docs/BUG-FIX-TAGS-NULL.md`](BUG-FIX-TAGS-NULL.md)

### 2026-04-06 — BUG FIX: Reuniões com `data_agendamento_vendas = NULL` nunca eram sincronizadas

**Problema:** Oportunidade com `data_agendamento_vendas = NULL`, `data_reuniao_agendada = NULL` e `last_appointment_sync_at = NULL` **nunca era elegível** para o cron `sync-appointment-dates`. Motivo: no PostgreSQL, `NULL >= data` retorna NULL (não TRUE), fazendo a condição `or(data_agendamento_vendas.gte.X, data_reuniao_agendada.gte.X)` falhar mesmo quando `last_appointment_sync_at IS NULL`.

**Caso real:** Matheus (matheus@qualitysmi.com.br) — reunião existente no GHL mas não aparecia no painel "Reuniões".

**Correção:** Alterada a lógica de elegibilidade em `sync-appointment-dates`:
- **Antes:** `condicao_de_data AND (sync_null OR sync_antigo)` — se a data fosse NULL, a condição inteira falhava
- **Depois:** `sync_null OR (condicao_de_data AND sync_antigo)` — opp nunca sincronizada é sempre elegível

**Arquivo alterado:** `supabase/functions/sync-appointment-dates/index.ts`
**Deploy:** ✅ edge function re-implantada em produção

### 2026-04-04 — BUG FIX: Auditoria IA filtrando por tag incorreta + Modal LeadCard + SDR Humano + Exclusão Vendas SQL

**Problema 1:** A aba Auditoria IA filtrava leads por `%sdr ia%` (genérico) em vez de `%[cp] sdr ia%` (tag específica). Isso incluía leads com tag `[FN] SDR IA` que não deveriam aparecer.

**Problema 2:** O modal de detalhes do lead na Auditoria IA não seguia o padrão do sistema (usava modal customizado em vez do componente `LeadCard`).

**Problema 3:** A Auditoria IA não mostrava o SDR humano responsável pelo lead e não excluía leads que já estão no pipeline "Vendas SQL".

**Correções:**
- Alterados 6 filtros `.ilike('tags', '%sdr ia%')` para `.ilike('tags', '%[cp] sdr ia%')` no hook `useAuditoriaIA.ts`
- Alterados 3 filtros `.ilike('contact.tags', '%sdr ia%')` para `.ilike('contact.tags', '%[cp] sdr ia%')`
- Adicionado campo `opp_id` ao tipo `ProblemaIA` para integração com LeadCard
- Adicionado campo `sdr_humano` ao tipo `ProblemaIA` (sdr_name || owner_name)
- Adicionada coluna "SDR Humano" na tabela de problemas
- Criada função `buildSdrMap()` para buscar SDRs em batch (eficiência)
- Leads no pipeline "Vendas SQL" agora são excluídos da Auditoria IA
- Substituído modal customizado pelo componente `LeadCard` padrão
- Adicionada função `parseTags` ao arquivo `dates.ts`

**Arquivos alterados:**
- `eb-dash2/src/hooks/useAuditoriaIA.ts`
- `eb-dash2/src/components/prevendas/AuditoriaTable.tsx`
- `eb-dash2/src/pages/prevendas/tabs/AuditoriaIATab.tsx`
- `eb-dash2/src/lib/utils/dates.ts`
- `docs/ABA-AUDITORIA-IA.md`

---

### 2026-04-04 — BUG FIX: Modal de leads na aba Estatísticas não carrega email/status

**Problema:** Ao clicar no número de leads na tabela da aba Estatísticas (Pré-Vendas), o modal abria com os nomes dos leads, mas não exibia email e status.

**Causas identificadas:**
1. Query de oportunidades não buscava o campo `email` de `contatos`
2. Query não buscava `status` e `pipeline_name` da tabela `oportunidades`
3. Interface `DrilldownLead` não incluía campos `status` e `pipeline_name`
4. Email estava hardcoded como `null` no mapeamento de drilldown

**Correções:**
- Adicionado `email` no select de `contatos` na query de oportunidades (linha 343)
- Adicionado `status` e `pipeline_name` no select de oportunidades
- Atualizada interface `DrilldownLead` com campos `status` e `pipeline_name`
- Atualizada interface `OppRow` com os novos campos
- Criado mapa `oppIdToStatus` para armazenar status/pipeline_name por oportunidade
- STEP 2.5.5: adicionado populamento de `oppIdToStatus` junto com `oppIdToContatos`
- STEP 3.5: adicionaros campos `status` e `pipeline_name` na query de vendas
- STEP 8, 9, 10: todos os `.push()` de arrays de drilldown agora incluem `status` e `pipeline_name`

**Arquivos alterados:**
- `eb-dash2/src/hooks/useSDREstatisticas.ts`

---

### 2026-04-03 — BUG FIX: métricas de funnel e campo CPM corrigidos

**Problema 1:** Métricas de funnel apareciam vazias/zero na tabela de criativos.

**Problema 2:** Campo `CPM` usava chave `cpm` na coluna mas `cpmMeta` na interface — mismatch causava exibição vazia.

**Correções:**
- `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx` —统一接口字段名 `cpmMeta` → `cpm`

**Problema:** As novas métricas (CTR, CPM, Conv. Página, Video Hook) apareciam vazias/zero na tabela de criativos mesmo após o backfill.

**Causa:** Havia 4 queries de `meta_ads_insights` no frontend que não incluíam os novos campos:
- `useTrafego.ts` linha ~666
- `useAquisicao.ts` linha ~307
- `usePreVendas.ts` linhas ~120 e ~347

**Correção:** Adicionados `cpm, landing_page_views, video_views, link_clicks, leads` às queries.

**Arquivos alterados:**
- `eb-dash2/src/hooks/useTrafego.ts` — query na função interna de buildTrafegoDataset
- `eb-dash2/src/hooks/useAquisicao.ts` — query em useAquisicao
- `eb-dash2/src/hooks/usePreVendas.ts` — duas queries em usePreVendas

---

### 2026-04-03 — Tabela de criativos: métricas de funnel (CTR, CPM, Conv. Página, Video Hook)

**Objetivo:** Exibir métricas de funnel do Meta Ads na tabela de ranking de criativos como colunas configuráveis.

**Arquivos alterados:**
- `eb-dash2/src/hooks/useTrafego.ts` — expandida interface `MetaRow` com 5 campos novos (`cpm`, `landing_page_views`, `video_views`, `link_clicks`, `leads`) e query atualizada
- `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx` — adicionadas 4 colunas configuráveis ao final da tabela

**Novas colunas configuráveis:**
| Coluna | Fórmula | Descrição |
|--------|---------|-----------|
| `CTR` | `clicks / impressions × 100` | Taxa de cliques |
| `CPM` | `spend / impressions × 1000` | Custo por 1000 impressões |
| `Conv. Página` | `leads / landing_page_views × 100` | Conversão da landing page |
| `Video Hook` | `video_views / impressions × 100` | Taxa de visualização de vídeo (~3s+) |

**Funcionalidades:**
- Todas as 4 colunas são configuráveis (show/hide/ordem) via menu "Colunas"
- Ordenação funcional por qualquer coluna
- Métricas calculadas como média ponderada (total agregado por criativo)

---

### 2026-04-02 — Meta Ads: novas colunas de action types para métricas de funnel

**Objetivo:** Extrair action types do JSONB `actions` para colunas próprias na tabela `meta_ads_insights`, permitindo queries eficientes de métricas de funnel como conversão da página, connect rate e video hook rate.

**Migration:** `supabase/migrations/20260402000000_add_action_type_columns_meta_ads.sql`

**O que mudou:**

1. **Novas colunas em `meta_ads_insights`:**
   - `landing_page_views INTEGER DEFAULT 0` — visualizações da landing page (action_type: `landing_page_view`)
   - `video_views INTEGER DEFAULT 0` — visualizações de vídeo (action_type: `video_view`) — conta após ~3 segundos
   - `link_clicks INTEGER DEFAULT 0` — cliques em links (action_type: `link_click`)
   - `leads INTEGER DEFAULT 0` — leads gerados (action_type: `lead`)
   - `onsite_web_leads INTEGER DEFAULT 0` — leads no site (action_type: `onsite_web_lead`)
   - `fb_pixel_leads INTEGER DEFAULT 0` — leads via Pixel FB (action_type: `offsite_conversion.fb_pixel_lead`)

2. **Índices criados:**
   - `idx_meta_ads_insights_landing_page_views`
   - `idx_meta_ads_insights_video_views`
   - `idx_meta_ads_insights_link_clicks`
   - `idx_meta_ads_insights_leads`

3. **Função `processar_meta_ads_raw` atualizada:**
   - Usa `jsonb_path_query_first()` para extrair valores específicos do array `actions`
   - Popula as novas colunas via UPSERT em `(ad_id, date, hour)`
   - Mantém compatibilidade com dados existentes (DEFAULT 0)

**Métricas derivadas agora possíveis (via SQL):**
```sql
-- CTR (já existia): ctr ou clicks/impressions
-- CPM (já existia): cpm ou spend/impressions*1000

-- Conversão da página: leads / landing_page_views
ROUND(SUM(leads)::numeric / NULLIF(SUM(landing_page_views), 0) * 100, 2)

-- Connect Rate: landing_page_views / link_clicks
ROUND(SUM(landing_page_views)::numeric / NULLIF(SUM(link_clicks), 0) * 100, 2)

-- Video Hook Rate: video_views / impressions
ROUND(SUM(video_views)::numeric / NULLIF(SUM(impressions), 0) * 100, 2)
```

**Edge functions deployadas:**
- `sync-meta-ads` — sync hourly (usa `processar_meta_ads_raw` atualizada)
- `sync-meta-ads-backfill` — backfill histórico dia por dia

**Backfill histórico:** Executar via edge function para popular dados desde 2025-09-01:
```bash
curl -X POST \
  https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"data_inicio": "2025-09-01", "data_fim": "2026-04-02", "max_dias": 30}'
```

**Documentação atualizada:**
- `docs/meta-ads/MAPEAMENTO-CAMPOS.md` — novas colunas documentadas

---

### 2026-04-02 — Remoção da aba Visão Geral do módulo Pré-Vendas (refactor)

**Decisão:** A aba "Visão Geral" do módulo Pré-Vendas não agregava valor operacional — suas métricas (cohort, alertas, motivos de perda) já estavam disponíveis nas abas MQLs e SDRs. Removida para simplificar a navegação.

**Arquivos alterados:**
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — removido entry `geral` do array TABS, removido import `GeralTab` e `BarChart3`, removido bloco condicional `activeTab === 'geral'`
- `eb-dash2/src/components/layout/Sidebar.tsx` — removida entrada "Visão Geral" da children de Pré-Vendas

**Documentação atualizada:**
- `docs/DASHBOARD-MODULOS.md` — removida linha `pre_vendas.geral` da tabela de abas
- `docs/ARQUITETURA.md` — marcada Visão Geral como ⚠️ REMOVIDA, seção "Análise de Cohort (Pré-Vendas)" atualizada
- `docs/ROADMAP.md` — entradas sobre Visão Geral marcadas como ⚠️ REMOVIDA

**O que NÃO foi removido (sem código morto):**
- `tabs/GeralTab.tsx` — ainda usado pelo módulo **Recuperação**
- `AlertasCard.tsx` — ainda usado pelo `GeralTab` do Recuperação
- `BarChart3` no Sidebar — ainda usado em outras seções

### 2026-04-01 — Correção revenue em Vendas Produtividade (2 fixes)

**Problema duplo:**

1. `useCloserProdutividade` filtrava revenue com `.lte(endISO)` — cortava receita de pagamentos após `endDate`, fazendo o faturamento divergir de Aquisição.

2. `consolidado.faturamento` (usado na UI) somava de `byCloser`, que só inclui closers da lista oficial (`ghl_users` com papel `closer`). Oportunidades sem `vendedor_closer` ou com closer fora da lista eram excluídas — mesmo tendo `data_pagamento_entrada` preenchida em `vendas_fechamento`.

**Correções:**

1. Removido `.lte('data_pagamento_entrada', endISO)` em `useCloserProdutividade.ts:205`. Agora o revenue é queryado com apenas `.gte('data_pagamento_entrada', startISO)` — mesma lógica do `useAquisicao.ts`.

2. Em `GeralTab.tsx`, quando não há filtro de closer, `activeKpis` agora usa `prodOverall.faturamento`, `prodOverall.caixa` e `prodOverall.fechados` (do `pagoMap` direto, sem filtro de closer) em vez de `prodConsolidado` (que é a soma dos per-closer, podendo excluir opps sem closer).

**Resultado:** O faturamento total em "Vendas - Produtividade" deve agora corresponder ao de "Aquisição - Produtividade".

### 2026-04-01 — Gráficos de conversão em barras verticais (Vendas)

**Problema:** Gráficos de conversão (Closer, Funil, Campanha, Canal) eram barras **horizontais** sem paleta consistente com o DS1.

**Solução:** Substituídos por `VerticalBarChart` — barras verticais ordenadas (maior → menor) com legenda lateral completa.

**Arquivos:**
- `eb-dash2/src/components/dashboard/VerticalBarChart.tsx` — **NOVO** componente SVG reutilizável
- `eb-dash2/src/components/dashboard/index.ts` — export do novo componente
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx` — substituídos `ConversaoPorCloser` e `ConversaoBarChart` (inline) por 4 instâncias de `VerticalBarChart`

**Design:**
- SVG `viewBox="0 0 600 120"` com aspect ratio fixo (não distorce)
- Y-axis dinâmico baseado no max real dos dados
- Cores determinísticas por label via `getLabelColor(label)` — paleta `--chart-1` a `--chart-24`
- Legenda abaixo do SVG com label **completa** (não truncada), dot colorido + valor %
- Hover: destaca barra + legenda correspondente
- Limite: top 8 + "+n outros" agregado

**Grid:** `md:grid-cols-2 xl:grid-cols-2` (2 por linha no xl, antes era 4)

---

### 2026-04-01 — DonutChart: "ver mais" sempre visível, scroll só na lista

**Problema:** O botão "ver mais" ficava escondido dentro da área de scroll, só aparecia ao rolar.

**Solução:** Separada a estrutura em duas camadas: (1) `<div>` com `max-h-[6.5rem] overflow-y-auto` envolvendo apenas a `<ul>` — o scroll é só nos items; (2) O botão "ver mais" fica **fora** dessa div, no fluxo normal do flex column — sempre visível, nunca coberto pelo scroll.

**Arquivo:** `eb-dash2/src/components/dashboard/DonutChart.tsx`

---

### 2026-03-31 — Auditoria e correção das datas de oportunidades a partir do CSV `Leads mar:26`

**Motivação:** parte dos leads do formulário bruto de março/2026 virou oportunidade no banco com `oportunidades.data_lead_recebido` divergente do `Submission Date` exportado pelo formulário. A correção precisava ser reproduzível, rastreável e segura contra colisões de leads repetidos/testes.

**O que mudou:**
- novo script `scripts/audit_leads_mar_2026.mjs`
  - lê o CSV bruto `Leads mar:26/820ccff9-010b-4e7e-836a-6c01771aac5d.csv`
  - cruza com `contatos` e `oportunidades` via Supabase `service_role`
  - considera `Submission Date` em BRT (`-03:00`) para evitar falsos positivos induzidos pelo `Timezone` do lead
  - separa automaticamente casos `ok`, `divergente`, `sem_match` e `ambíguo`
- novo relatório `docs/LEADS-MAR-2026-DATAS-OPORTUNIDADES.md`
  - 581 linhas auditadas
  - 544 linhas consistentes após a correção
  - 36 correções aplicadas automaticamente no banco
  - 27 casos ambíguos mantidos sem update automático
  - 10 linhas sem match confiável

**Regra de segurança adotada:**
- só corrigir automaticamente oportunidades que apareçam em **uma única linha casada** do CSV
- se a mesma `oportunidade_id` aparecer em múltiplas linhas do CSV, o caso é marcado como **ambíguo** e não recebe update automático
- durante a validação pós-update, 6 updates foram revertidos exatamente por caírem nessa categoria de ambiguidade

**Resultado líquido no banco:**
- `36` oportunidades tiveram `data_lead_recebido` corrigida
- nenhum caso ambíguo ficou com update automático ativo
- o backlog restante ficou explicitamente separado entre:
  - `27` ambiguidades
  - `10` linhas sem match confiável

**Artefatos gerados:**
- `scripts/audit_leads_mar_2026.mjs`
- `docs/LEADS-MAR-2026-DATAS-OPORTUNIDADES.md`
- `docs/LEADS-MAR-2026-DATAS-OPORTUNIDADES-report.json`

### 2026-03-31 — Hardening do sync de tags: fallback em lote pequeno + retry explícito de timeout

**Motivação:** um lead real (`petterson.souza@yuv.com.br`) chegou com `payload.tags` correto no `webhooks_ghl`, mas ficou com `contatos.tags = NULL` e sumiu da contagem de MQL. O reparo global `sync_tags_from_latest_webhook(90)` também se mostrou vulnerável a `statement timeout`, então o sistema precisava de um caminho previsível de recuperação sem depender de scans amplos.

**Causa raiz operacional:**
- o webhook já trazia `tags`, então a fonte de verdade estava correta
- o fluxo de propagação até `contatos.tags` falhou para esse contato específico
- o backfill SQL global era caro demais para ser o mecanismo principal de correção online
- o worker central da GHL não tinha timeout explícito por request; quando a API travava, o retry dependia só do erro genérico de rede

**O que mudou:**
- nova migration `20260331160000_harden_contact_tags_sync.sql`
  - função `sync_tags_from_webhook_batch(limit, days_back, only_null)` para reparar tags via último webhook em **lotes pequenos**
  - função `sync_tags_from_webhook_target(ghl_id, contact_id, days_back)` para reparo **direcionado** de um contato sem scan global
- `supabase/functions/sync-contact-tags/index.ts`
  - passa a rodar **repair por webhook** antes de depender da API GHL
  - aceita parâmetros operacionais: `webhook_repair_batch_size`, `webhook_repair_days_back`, `webhook_repair_only_null`, `contact_id`, `ghl_id`
  - contatos com `tags IS NULL` ganharam trilho urgente: prioridade maior, `maxAttempts` maior e re-enfileiramento por slot de **15 minutos**
  - contatos já preenchidos continuam no refresh diário, sem custo operacional exagerado
- `supabase/functions/ghl-api-worker/index.ts`
  - todo request à API GHL agora usa timeout explícito de **15s**
  - timeout passa a ser classificado como erro retryável com novo agendamento automático

**Parâmetros operacionais estabelecidos:**
- **Fonte de verdade de tags:** último webhook com `payload.tags`; API GHL é fallback, não caminho primário
- **Repair online do backlog:** lotes pequenos (default 100) por execução do `sync-contact-tags`
- **Contato com `tags IS NULL`:**
  - prioridade `2`
  - `maxAttempts = 8`
  - reprocesso por slot de 15 min
- **Contato com tags já preenchidas:**
  - prioridade `5`
  - `maxAttempts = 4`
  - refresh diário
- **Timeout de API GHL:** 15s por request, com retry automático

**Resultado esperado:**
- um contato não depende mais de backfill global pesado para recuperar tags
- null tags recentes são drenadas continuamente por webhook + fila GHL
- timeouts da API deixam rastro operacional e entram em retry explícito
- reparo pontual de um lead passa a ser suportado pelo próprio sistema, sem update manual ad hoc

### 2026-03-31 — Gráficos por campanha CRM nas visões gerais

**Motivação:** os módulos já mostravam segmentações por funil para vendas, MQLs e reuniões, mas faltava a mesma leitura por campanha CRM nas telas principais. Isso dificultava comparar desempenho de campanhas cadastradas em `utm_campaigns` sem sair da visão operacional.

**O que mudou:**
- novo helper `buildCampaignNameMap()` em `useTrafego.ts` para mapear `contatos.utm_campaign` → `utm_campaigns.nome`
- **Tráfego** (`dashboard/tabs/TrafegoTab.tsx`):
  - novos gráficos `MQLs por campanha`, `Reuniões por campanha` e `Vendas por campanha`
  - a seção de segmentação passou a trabalhar com 4 colunas: funil, campanha, canal e criativo
  - o toggle `Nº Vendas / Faturamento / Caixa` também controla `Vendas por campanha`
- **Aquisição** (`aquisicao/tabs/AquisicaoTab.tsx`):
  - novos gráficos `MQLs por campanha`, `Reuniões por campanha` e `Vendas por campanha`
  - a seção de segmentação agora exibe funil, campanha, origem e mídia
- **Vendas** (`vendas/tabs/GeralTab.tsx`):
  - novo gráfico `Conversão por Campanha`
  - novos donuts `Reuniões por Campanha`, `MQLs por Campanha` e `Fechados por Campanha`
  - `VendasPage.tsx` passou a encaminhar os filtros ativos da página para a tab geral
- **Pré-Vendas / Recuperação** (`prevendas/tabs/GeralTab.tsx`):
  - nova seção `Campanhas`
  - novos donuts `MQLs por campanha`, `Reuniões por campanha` e `Vendas por campanha`
  - produtividade reaproveita `usePreVendasProducao` para manter a leitura por evento
- **Aquisição / Orgânico compartilhados:**
  - `useAquisicao.ts` e `useOrganico.ts` agora expõem `campaignNameMap`
  - `AquisicaoPage.tsx` e `OrganicoPage.tsx` repassam o novo mapa para as tabs compartilhadas

**Regra adotada:**
- a dimensão nova usa **Campanha CRM** (`utm_campaigns.nome`)
- quando `contatos.utm_campaign` não tiver mapeamento válido, o bucket exibido é `Sem campanha`
- nenhuma dessas telas passou a usar `Campanha Meta` como dimensão de segmentação visual

**Validação:** `cd eb-dash2 && npm run build` ✅

**Ajuste visual posterior (2026-03-31):**
- reorganizada a leitura dos gráficos para **colunas por métrica**
- padrão novo:
  - coluna `MQLs`
  - coluna `Reuniões`
  - coluna `Vendas`
- dentro de cada coluna ficam as segmentações disponíveis do módulo (ex: funil, campanha, canal, criativo/origem/mídia)

### 2026-03-31 — Importação manual de vendas antigas

**Contexto:** o usuário disponibilizou um CSV histórico com 40 vendas fechadas fora do fluxo atual do CRM. Essas oportunidades precisavam aparecer corretamente nos painéis sem depender de webhook ou ressincronização com o GHL.

**O que mudou:**
- criado `scripts/import-vendas-antigas.js` para carga idempotente com `service_role`
- leitura direta do CSV `vendas antigas/VENDAS-FALTANTES-UTM-COMPLETO - VENDAS-FALTANTES-UTM-COMPLETO.csv`
- UPSERT em `contatos` por `ghl_id` sintético estável
- UPSERT em `oportunidades` por `ghl_opportunity_id`
- UPSERT em `vendas_fechamento` por `oportunidade_id`
- pipeline fixado como `Vendas SQL` (`ZWuCjEXM2VDyLCx8CtGU`)
- stage inferido da base viva das vendas assinadas: `17b7de75-9d2f-441c-a4f7-b119d439b47f`
- `DATA_OPORTUNIDADE_GHL` mapeada para `data_lead_recebido`
- fallback de `data_lead_recebido` para `DATA_PG_ENTRADA` em 14 linhas
- `DATA_PG_ENTRADA` mapeada para `data_pagamento_entrada`, `data_da_assinatura_do_contrato` e `data_fechado`
- `openclaw_notificado_em` preenchido nos registros importados para impedir disparo retroativo do OpenClaw

**Resultado validado no banco:**
- 40 oportunidades importadas/validadas
- 40 vendas importadas/validadas
- 8 oportunidades com ID sintético estável
- 0 oportunidades com `pipeline_id`/`pipeline_name` nulos
- 0 oportunidades com `data_lead_recebido` nula
- `valor_faturado` total validado: `1605880.06`
- `valor_entrada` total validado: `583403.56`

**Documentação:**
- novo documento `docs/IMPORTACAO-VENDAS-ANTIGAS-2026-03-31.md`

### 2026-03-30 — Toggle de métrica nos gráficos de Vendas (Nº Vendas / Faturamento / Caixa)

**Motivação:** Os gráficos de segmentação de vendas (por funil, por canal, por criativo, por origem) exibiam apenas a contagem de vendas. Não era possível ver qual funil ou criativo gerou mais receita ou mais caixa.

**O que mudou:**
- Adicionado helper `buildRevenueMap(revenueRows)` em `useTrafego.ts` — retorna `Map<oppId, {faturamento, caixa}>`
- `DonutChart` ganhou prop opcional `valueFormatter?: (v: number) => string` — formata os valores numéricos (centro, legenda e total) sem alterar as proporções do gráfico
- **TrafegoTab** (`eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`):
  - Toggle "Nº Vendas / Faturamento / Caixa" acima da seção Vendas
  - `salesByFunnel`, `salesByPublico` e `salesByCriativo` calculam todos os três valores internamente; o campo `count` é selecionado conforme o toggle
  - Funciona em Cohort e Produtividade
- **AquisicaoTab** (`eb-dash2/src/pages/aquisicao/tabs/AquisicaoTab.tsx`):
  - Mesma lógica: toggle + `salesByFunnel`, `salesByOrigin` e `salesByMidia` monetizados
- `DonutChart` exibe moeda compacta (ex: "R$ 45,2k") quando `valueFormatter` está ativo; clique na fatia continua abrindo os leads da segmentação

**Branch:** `feat/sales-chart-metric-toggle`

### 2026-03-31 — sync-appointment-dates endurecido para cancelamentos reais

**Motivação:** O caso do lead `moiseshbp@gmail.com` mostrou que o cron `sync-appointment-dates` já tinha rodado em `2026-03-31`, mas a oportunidade ainda mantinha `data_reuniao_agendada = 2026-03-31`. Isso indica que o endpoint de appointments pode sinalizar cancelamento fora de `appointmentStatus`.

**Correção aplicada:**
- `sync-appointment-dates` agora normaliza cancelamento por `appointmentStatus`, `appointment_status`, `status`, `calendarStatus`, `calendar_status` e flags booleanas (`canceled`, `cancelled`, `isCanceled`, `isCancelled`)
- a função também passou a respeitar `isDeleted`, além de `deleted`
- foi adicionado modo de execução direcionada por `opp_id` e `contact_ghl_id`
- `include_debug` expõe, no response, um resumo dos appointments vistos e quais permaneceram ativos após a normalização

**Impacto prático:** quando o GHL devolver o cancelamento em um campo alternativo, o cron volta a limpar `oportunidades.data_reuniao_agendada` em vez de preservar uma reunião fantasma no painel.

### 2026-03-31 — sync-appointment-dates passa a cobrir o universo real do dashboard

**Motivação:** Os casos de `carlos@eusoucarlosferreira.com.br` e `luciney@infowin.com.br` mostraram o outro lado do problema: havia appointment ativo no GHL e `data_agendamento_vendas` preenchida, mas a reunião não aparecia no dashboard porque o cron só sincronizava oportunidades no pipeline `Vendas SQL`.

**Correção aplicada:**
- o cron agora sincroniza oportunidades fora de Recuperação com sinal de reunião (`data_agendamento_vendas`, `data_reuniao_agendada` ou `last_appointment_sync_at`)
- o modo direcionado por `contact_ghl_id` foi refeito para resolver primeiro o contato na tabela `contatos`
- a regra do backend ficou alinhada com a aba `Reuniões`, que já considerava funis além de `Vendas SQL`

**Impacto prático:** reuniões válidas em funis como `Pré-Vendas MQL` e `[fn] webinário` passam a preencher `data_reuniao_agendada` e aparecem no dashboard sem depender de correção manual por lead.

### 2026-03-31 — sync-appointment-dates prioriza reuniões recentes para não perder o “hoje”

**Motivação:** O caso de `guilherme@egservicosdigitais.com.br` provou que ainda havia um gargalo operacional: o appointment de hoje existia no GHL e a function conseguia lê-lo, mas o banco só foi corrigido após reprocessamento manual.

**Correção aplicada:**
- `SYNC_INTERVAL_MINUTES` caiu de `25` para `10`
- cada request da function agora processa até `3` sublotes (`max_cycles`) antes de responder
- o universo de alta frequência foi reduzido a oportunidades recentes com sinal real de reunião nos últimos `60` dias

**Impacto prático:** leads com reunião atual deixam de competir com histórico antigo no cron rápido, reduzindo a chance de sumirem do painel por atraso de refresh.

### 2026-03-27 — Removida nota de contagem duplicada nos gráficos de funil

**O que mudou:**
- `TrafegoTab.tsx` e `AquisicaoTab.tsx` deixaram de passar a prop `note` nos gráficos "MQLs por funil" e "Vendas por funil"
- A mensagem "O total pode ser maior que o real pois um lead pode pertencer a mais de um funil" não é mais exibida nesses cards

**Impacto prático:** os gráficos de funil continuam com a mesma lógica de dados, mas sem o texto auxiliar abaixo do título.

### 2026-03-27 — sync-appointment-dates passa a limpar reunião cancelada

**Motivação:** Leads podiam continuar aparecendo na aba de reuniões mesmo após o appointment ser cancelado no GHL. O cron `sync-appointment-dates` filtrava apenas `deleted = false`, então um appointment com `appointmentStatus = canceled` ainda era tratado como válido e mantinha `data_reuniao_agendada`.

**Correção aplicada:**
- `sync-appointment-dates` agora descarta appointments cancelados (`canceled` / `cancelled`)
- Quando o contato não tem nenhum appointment ativo restante, a função limpa `oportunidades.data_reuniao_agendada = NULL`
- O response da função agora expõe `cleared` para indicar quantas opps tiveram a data antiga removida
- A documentação do fluxo foi corrigida para refletir a implementação real (chamada direta à API, sem fila `ghl_api_jobs`)

**Impacto prático:** casos como `hitesh.testitout@gmail.com` deixam de aparecer como “reunião agendada” depois do próximo ciclo da cron, porque a fonte de verdade passa a respeitar o cancelamento real do calendário.

### 2026-03-27 — Produtividade passa a ser orientada por data do evento

**Motivação:** As telas de produtividade ainda herdavam uma limitação de cohort: vários hooks buscavam oportunidades por `data_lead_recebido` dentro do período e só depois contavam os eventos. Isso fazia vendas, reuniões, conexões e outros números operacionais ignorarem leads antigos que tiveram atividade no mês.

**Nova regra:**
- Produtividade conta o que **aconteceu no período**
- Cada métrica usa a data do próprio evento
- As etapas são independentes: `Leads`/`MQLs` usam `data_lead_recebido`; `Conectados`, `Agendados`, `Reuniões` e `Fechados` usam a data da própria etapa
- `data_lead_recebido` e MQL não podem limitar métricas operacionais
- Em vendas, "fechado" continua significando `vendas_fechamento.data_pagamento_entrada`

**Frontend ajustado:**
- `useCloserProdutividade` — Vendas deixa de limitar closers por `data_lead_recebido`
- `useSDRProdutividade` — Pré-Vendas/Recuperação deixa de limitar SDRs por `data_lead_recebido`
- `useProdutividadeMatrix` — matriz passa a carregar eventos do pipeline inteiro
- `useProducao` — Tráfego/Aquisição/Orgânico passa a incluir leads com sinal operacional no período e a expor `Leads`/`MQLs` independentes por mês
- `usePreVendasProducao` — mesma correção para Pré-Vendas/Recuperação
- `AquisicaoPage.tsx` e `OrganicoPage.tsx` — loaders de produtividade deixam de cortar a base por `data_lead_recebido`
- `CohortProdToggle.tsx` — tooltip atualizado para a regra nova
- `TrafegoTab.tsx`, `AquisicaoTab.tsx` e `CriativosTab.tsx` — segmentações passam a usar MQL por geração e vendas por pagamento no modo produtividade
- `prevendas/tabs/GeralTab.tsx`, `vendas/tabs/GeralTab.tsx` e `vendas/tabs/MatrizTab.tsx` — produtividade deixa de usar funil, taxa e percentual encadeado; colunas passam a ser independentes

**Validação:** `cd eb-dash2 && npm run build` ✅

### 2026-03-27 — SDR por oportunidade via API GHL Followers

**Motivação:** O campo `contatos.owner_name` armazenava um único SDR por contato. O mesmo lead pode ter múltiplas oportunidades em pipelines diferentes, cada uma tratada por um SDR diferente — o campo único sobrescrevia o histórico. A solução: cada oportunidade tem seu próprio `sdr_name`, populado via `GET /opportunities/{id}/followers` da API GHL.

**Backend:**
- Nova coluna `oportunidades.sdr_name TEXT` (NULL = pendente de backfill)
- Índice parcial `idx_oportunidades_sdr_name_null` para buscas eficientes pelo cron
- Trigger `trg_reset_sdr_name_on_owner_change`: quando `contatos.owner_name` muda → reseta `sdr_name = NULL` em todas as opps daquele contato → cron re-enfileira
- `extrair_dados_ghl()` ganhou PASSO 2.6: todo webhook de oportunidade enfileira `GET /opportunities/{id}/followers` na fila central
- Backfill inicial: `sdr_name` pre-populado com `contatos.owner_name` para evitar flood na API
- Nova edge function `sync-opp-sdr`: padrão 3 fases — drena jobs concluídos, enfileira pendentes, drena novamente
- Novo cron `sync-opp-sdr-cron` no offset `:06` (a cada 10 min)

**Lógica de resolução:** `followers[0].id → ghl_users.nome` → `followers[0].name` → `contatos.owner_name` (fallback)

**Migrations:** `20260327100000` a `20260327100004`

**Frontend — 21 arquivos atualizados:**
- `OppRow` interface: novo campo `sdr_name: string | null`
- OPP_SELECT atualizado em: `useTrafego`, `usePreVendas`, `useAquisicao`, `useOrganico`, `useLeads`, `useProducao`, `usePreVendasProducao`
- SDR filter/display migrado de `contatos?.owner_name` para `sdr_name` em: `useSDRLeaderboard`, `usePreVendas`, `useSDRAtividade`, `useSDRProdutividade`, `useProdutividadeMatrix`, `goals/service.ts`, `SDRsTab`, `GeralTab` (prevendas), `MQLsCohortTab`, `LeadsParadosTab`, `AutoAgendadosTab`, `ReunioesTab` (vendas), `LeadCard`, `usePreVendasProducao`

**`contatos.owner_name` preservado** como fonte de fallback para a API e como campo de contato (ainda exibido no LeadCard via `owner_email`).

**Documentação:** `docs/SYNC-OPP-SDR.md`

---

### 2026-03-26 — Mapeamento de funis migrado de tags para utm_campaign

**Motivação:** A lógica anterior agrupava leads por funil verificando se `contatos.tags` continha o nome do funil. Isso era frágil (depende de tag manual no lead) e inconsistente com o filtro de funil (que já usava `utm_campaign → utm_campaigns.funnels`). A nova lógica usa exclusivamente `utm_campaign` para determinar o funil de cada lead.

**Nova regra:**
- Lead → funil via `contatos.utm_campaign` → lookup em `utm_campaigns.funnels` (JSONB array)
- Se o lead não tem `utm_campaign` ou a campanha não está vinculada a nenhum funil → "Sem funil"
- Uma campanha pode estar vinculada a múltiplos funis → lead aparece em todos eles

**Helper adicionado:** `buildCampaignFunnelMap(campaigns)` em `useTrafego.ts` — constrói `Map<string, string[]>` a partir dos dados de `utm_campaigns`.

**Hooks atualizados:**
- `useAquisicao.ts` — carrega `utm_campaigns`, expõe `campaignFunnelMap`
- `useOrganico.ts` — idem

**Componentes atualizados:**
- `AquisicaoSharedProps` — novo campo `campaignFunnelMap: Map<string, string[]>`
- `AquisicaoPage.tsx` — passa `campaignFunnelMap` para tabs
- `OrganicoPage.tsx` — idem
- `AquisicaoTab.tsx` — `mqlsByFunnel` e `salesByFunnel` agora usam `campaignFunnelMap`
- `TrafegoTab.tsx` — `mqlsByFunnel` e `salesByFunnel` agora usam `campaignFunnelMap`; carrega `utm_campaigns` no lugar de `funnels`
- `vendas/GeralTab.tsx` — `conversionByFunil` agora usa `campaignFunnelMap`; carrega `utm_campaigns` no lugar de `funnels`

**Documentação:** `CLAUDE.md` seção "Funis — Mapeamento via utm_campaign"

---

### 2026-03-26 — sync-appointment-dates: data_reuniao_agendada agora vem da API GHL

**Motivação:** O webhook GHL preenchia `data_reuniao_agendada` de forma não confiável (formato inconsistente, campos ausentes após reagendamento). A API `GET /contacts/{contactId}/appointments` é a fonte de verdade.

**O que mudou:**
- Nova edge function `sync-appointment-dates` que busca todos os appointments de cada lead no pipeline Vendas SQL via API GHL e atualiza `data_reuniao_agendada` com o mais recente
- Cron `sync-appointment-dates-cron` a cada 5 min (offset :03 para evitar thundering herd)
- Nova coluna `oportunidades.last_appointment_sync_at` rastreia quando cada lead foi sincronizado
- Backfill executado em 2026-03-26: todos os leads históricos do pipeline Vendas SQL processados

**Migrations:** `20260326100000` (coluna), `20260326100001` (cron), `20260326110000` (remove campo do webhook), `20260326110001` (limpa dados incorretos do webhook)

**Documentação:** `docs/SYNC-APPOINTMENT-DATES.md`

---

### 2026-03-26 — Produtividade: base de leads mudada para data_lead_recebido (igual ao Cohort)

**Motivação:** Os gráficos de Produtividade buscavam leads pelo OR de datas de evento (data_conectado, data_agendamento, etc.), o que gerava uma base diferente da do Cohort. A nova regra garante consistência: ambos os modos usam a mesma base de leads.

**Nova regra:**
- **COHORT:** filtra por `data_lead_recebido` → conta TODOS os eventos (sem filtro de data nos eventos)
- **PRODUTIVIDADE:** filtra por `data_lead_recebido` (igual ao Cohort) → conta apenas eventos que ocorreram NO período, agrupados pelo mês de ocorrência

**Consequência aceitável:** funis podem aparecer incompletos (ex: lead gerado em março que fechou em abril não aparece como "fechado" em março na Produtividade).

**Arquivos alterados:**
- `eb-dash2/src/hooks/useProducao.ts` — substituído OR de event-dates por `data_lead_recebido BETWEEN`
- `eb-dash2/src/hooks/usePreVendasProducao.ts` — idem
- `eb-dash2/src/hooks/useProdutividadeMatrix.ts` — idem
- `eb-dash2/src/hooks/useSDRProdutividade.ts` — idem
- `eb-dash2/src/hooks/useCloserProdutividade.ts` — idem
- `eb-dash2/src/pages/aquisicao/AquisicaoPage.tsx` — idem (fetch inline)
- `eb-dash2/src/pages/organico/OrganicoPage.tsx` — idem (fetch inline)
- `eb-dash2/src/components/ui/CohortProdToggle.tsx` — tooltip atualizado
- 6 arquivos de tabs — textos explicativos atualizados
- `docs/DASHBOARD-MODULOS.md` — definições e hook de dados atualizados
- `CLAUDE.md` — seção Conceitos de Negócio atualizada

---

### 2026-03-26 — Observação "total por funil pode ser inflado" em todos os gráficos por funil

Adicionado prop `note` no componente `DonutChart`. Todos os gráficos "MQLs por funil" e "Vendas por funil" agora exibem a nota: *"O total pode ser maior que o real pois um lead pode pertencer a mais de um funil."*

**Arquivos modificados:**
- `eb-dash2/src/components/dashboard/DonutChart.tsx` — novo prop `note?: string`, renderizado abaixo do título
- `eb-dash2/src/pages/aquisicao/tabs/AquisicaoTab.tsx` — nota adicionada em "MQLs por funil" e "Vendas por funil"
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx` — nota adicionada em "MQLs por funil" e "Vendas por funil"

---

### 2026-03-26 — Gráficos pizza "MQLs por mídia" e "Vendas por mídia" no módulo Orgânico

Dois novos `DonutChart` adicionados na seção **Segmentação** da aba **Visão Geral** do módulo Orgânico.

**O que mostram:**
- **MQLs por mídia**: leads com tag "MQL" agrupados por `utm_medium`
- **Vendas por mídia**: oportunidades com `data_pagamento_entrada` agrupadas por `utm_medium`
- Entradas sem `utm_medium` aparecem como "Sem mídia"

**Cohort vs Produtividade:**
- Cohort: usa `opps` (filtrado por `data_lead_recebido`) + `paymentDateMap`
- Produtividade: usa `producaoOpps` (filtrado por data do evento) + `producaoPaymentDateMap` com filtro de data

**Visibilidade:** os gráficos só aparecem quando `hasPaidTraffic === false` (módulo Orgânico). Módulo Tráfego Pago não é afetado.

**Arquivos modificados:**
- `eb-dash2/src/pages/aquisicao/tabs/AquisicaoTab.tsx` — 2 novos `useMemo` (`mqlsByMidia`, `salesByMidia`) + 2 novos `DonutChart`

**Bug corrigido na mesma sessão:**
- `useOrganico.ts`: race condition entre Phase 0 (carrega `organicSourceSet`) e Phase 1 (filtra leads) → dados orgânicos apareciam zerados na primeira carga. Solução: `optionsReady` flag nas deps do Phase 1.

---

### 2026-03-31 — Gráfico "Investimento × CPMQL" voltou a usar escala idêntica nos 2 eixos Y

O gráfico `Investimento × CPMQL` da aba Tráfego voltou a usar o mesmo domínio vertical nos dois lados. Agora o eixo esquerdo e o eixo direito sempre compartilham o mesmo `sharedMax`, calculado a partir do maior teto "bonito" entre investimento e CPMQL.

**Resultado prático:** um valor em R$ passa a ocupar exatamente a mesma altura visual nos dois eixos. Isso facilita comparar `Investimento` e `CPMQL` diretamente, sem distorção causada por escalas independentes.

**Arquivo modificado:**
- `eb-dash2/src/components/dashboard/InvestimentoCpmqlChart.tsx` — removidos os domínios independentes no desenho; barras, linha e ticks voltaram a usar `sharedMax`

### 2026-03-31 — Atividades SDR excluem leads do pipeline `Vendas SQL`

As bases de atividade SDR de Pré-Vendas passaram a ignorar oportunidades que já estão no pipeline `Vendas SQL` (`ZWuCjEXM2VDyLCx8CtGU`). A regra foi aplicada nos hooks compartilhados para manter o mesmo comportamento entre o painel principal e Recuperação.

**Impacto prático:**
- a aba `Atividades` deixa de listar comunicações de leads já avançados para `Vendas SQL`
- os agregados de atividade/produtividade dos SDRs também deixam de contar esses leads
- Recuperação continua usando o mesmo código compartilhado, sem divergência funcional

**Arquivos modificados:**
- `eb-dash2/src/lib/constants.ts` — nova constante `PIPELINE_VENDAS_SQL_ID`
- `eb-dash2/src/hooks/useLeadAtividades.ts` — exclusão de `Vendas SQL` na base da aba `Atividades`
- `eb-dash2/src/hooks/useSDRAtividade.ts` — exclusão de `Vendas SQL` nas métricas de atividade SDR
- `eb-dash2/src/hooks/useSDRProdutividade.ts` — exclusão de `Vendas SQL` nos agregados de SDRs

### 2026-03-27 — Ajuste de escala automática no gráfico "Investimento × CPMQL" da aba Tráfego

O eixo Y direito do gráfico `Investimento × CPMQL` deixou de usar a escala compartilhada com investimento. Agora o `CPMQL` usa domínio próprio e autoajustável, calculado a partir dos maiores valores reais de `cpmql` e `ma7cpmql` no período, com folga visual automática.

**Status atual:** comportamento revertido em 2026-03-31 a pedido do usuário. O gráfico voltou a usar escala idêntica nos dois eixos Y.

**Resultado prático:** quando o investimento é muito maior que o `CPMQL`, a linha vermelha e a MA7 não ficam mais achatadas no rodapé. O eixo direito passa a refletir o intervalo real do `CPMQL` exibido no gráfico.

**Arquivo modificado:**
- `eb-dash2/src/components/dashboard/InvestimentoCpmqlChart.tsx` — separados `spendMax` e `cpmqlMax`, com ticks independentes para os eixos esquerdo e direito

### 2026-03-26 — Gráfico dual-eixo "Investimento × CPMQL" na aba Tráfego (feature + fixes)

Novo gráfico SVG full-width adicionado na aba **Tráfego**, posicionado no final da página (após Segmentação).

**O que o gráfico mostra:**
- **Barras** (eixo Y esquerdo, navy `--empire`): investimento diário em R$
- **Linha sólida + dots vermelhos** (eixo Y direito, dourado `--gold`): CPMQL diário — dots aparecem inclusive nos dias sem MQL (na linha de base)
- **Linha tracejada azul** (`#3B82F6`): média móvel 7 dias do CPMQL
- **Header**: total investido, CPMQL médio, tendência ↑↓ e badge de correlação Pearson entre investimento e CPMQL

**Escala compartilhada:** ambos os eixos Y usam o mesmo `sharedMax`, então R$X no eixo esquerdo fica na mesma altura que R$X no eixo direito — comparação direta de valores absolutos

**Preset "Ontem"** adicionado no filtro de datas (entre "Hoje" e "7d")

**Bugs corrigidos durante o desenvolvimento:**
1. `useCallback` após early returns → violação de regras de hooks → crash da aba → todos os hooks movidos para antes dos returns condicionais
2. Cores `rgba(255,255,255,...)` invisíveis no tema claro → substituídas por tokens DS1 (`--ghost`, `--steel`, `--ink`)
3. `maxSpend`/`maxCpmql` removidos mas ainda referenciados nas barras → `ReferenceError` em runtime → substituídos por `sharedMax`

**Arquivos criados:**
- `eb-dash2/src/components/dashboard/InvestimentoCpmqlChart.tsx`

**Arquivos modificados:**
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx` — `computeDailyPoints()` + `useMemo` + inserção do componente
- `eb-dash2/src/pages/dashboard/DashboardPage.tsx` — preset "Ontem"

---

### 2026-03-26 — Bug fix: tags de contatos desatualizadas — sync via último webhook (bugfix crítico)

**Problema:** `contatos.tags` ficava congelado na primeira versão das tags do contato. O `sync-contact-tags` só sincronizava contatos com `tags IS NULL` — uma vez que qualquer valor fosse gravado, o contato nunca mais era re-sincronizado. Tags novas adicionadas no GHL (ex: `mql`) não chegavam ao banco mesmo com webhooks carregando as tags corretas.

**Causa raiz:** filtro `.is('tags', null)` na edge function `sync-contact-tags` + dependência de chamada à API GHL que só rodava para população inicial.

**Solução:**

1. **Nova função SQL `sync_tags_from_latest_webhook(p_days_back INT DEFAULT 90)`** — atualiza `contatos.tags` diretamente dos webhooks armazenados em `webhooks_ghl`, sem chamar a API GHL. Usa `DISTINCT ON (contact_id) ORDER BY created_at DESC` para pegar o webhook mais recente por contato. Só toca registros onde o valor mudou (`IS DISTINCT FROM`).

2. **Cron `sync-tags-from-webhook`** — agendado a cada 5 minutos via `pg_cron`. Chama `sync_tags_from_latest_webhook()` continuamente para manter todas as tags em sincronia.

3. **Índice** `idx_webhooks_ghl_contact_id_created` — índice parcial em `(TRIM(payload->>'contact_id'), created_at DESC)` para o `DISTINCT ON` ser eficiente.

4. **Backfill** executado: **2.604 contatos** atualizados com as tags corretas do último webhook (janela 90 dias).

5. **`sync-contact-tags` (edge function)** — corrigido para não filtrar só `tags IS NULL`, agora usa rotação diária de idempotência (`${CALLER}:${id}:${YYYY-MM-DD}`). Passa a funcionar como camada de fallback via API GHL para contatos sem webhook recente.

**Fonte de verdade para tags:** último webhook recebido por `contact_id`. O cron de 5 min garante propagação em até 5 minutos após qualquer mudança de tag no GHL.

**Migrations:**
- `20260326000001_sync_tags_from_latest_webhook.sql` — função + cron inicial
- `20260326000002_index_and_fix_sync_tags_webhook.sql` — índice + versão otimizada com `p_days_back`
- `20260326000003_backfill_tags_from_webhooks.sql` — backfill de 2.604 contatos

**Edge function:**
- `supabase/functions/sync-contact-tags/index.ts` — corrigido filtro + idempotência diária

---

### 2026-03-26 — Bug fix: modal do funil de conversão exibia "nenhum lead" (bugfix)

**Problema:** Ao clicar em qualquer etapa do funil (Leads gerados, MQLs, Conectados, etc.) na aba Tráfego, o modal abria mas exibia "nenhum lead nessa etapa".

**Causa:** `onClick` de cada step chamava `openModal(s.label, [])` — passando array vazio hard-coded.

**Solução:** Criado `funnelLeadsMap` que mapeia cada `key` do funil (`leads`, `mql`, `conectados`, `agendados`, `reunioes`, `fechados`) para os leads filtrados correspondentes. `onClick` agora passa `funnelLeadsMap[s.key] ?? []`.

**Arquivo:** `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`

---

### 2026-03-26 — Gráfico dual-eixo "Investimento × CPMQL" na aba Tráfego (feature)

Adicionado gráfico SVG full-width na aba **Tráfego** (Visão Geral), posicionado entre os KPI cards e o Funil de Conversão.

**O que o gráfico mostra:**
- **Barras** (eixo Y esquerdo, navy `--empire`): investimento diário em R$ dos `metaRows`
- **Linha sólida com dots** (eixo Y direito, dourado `--gold`): CPMQL diário = spend/MQLs por data SP
- **Linha tracejada azul** (`#3B82F6`): média móvel 7 dias do CPMQL (suaviza ruído)
- **Linha de referência** (dourado, opcional): meta de CPMQL se cadastrada em `useMetas`
- **Header**: chips com total investido, CPMQL médio e tendência (↑↓ comparando 1ª vs 2ª metade do período)
- **Badge de correlação Pearson**: identifica se mais gasto = CPMQL maior/menor/sem relação
- **Tooltip interativo**: data, investimento, MQLs, CPMQL e MA7 ao hover

**Cores diferenciadas (tema claro DS1):**
- Investimento: `--empire` (#0D1829) — navy escuro
- CPMQL diário: `--gold` (#C9A240) — dourado
- MA7 CPMQL: `#3B82F6` — azul, claramente distinto do dourado

**Arquivos criados:**
- `eb-dash2/src/components/dashboard/InvestimentoCpmqlChart.tsx`

**Arquivos modificados:**
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx` — função `computeDailyPoints()` + `useMemo` + inserção do componente

---

### 2026-03-26 — Novo módulo "Orgânico" (feature)

Criado módulo **Orgânico** na sidebar, abaixo de Aquisição. Exibe apenas leads cujo `contatos.utm_source` está cadastrado na tabela `utm_sources_plain` (canais orgânicos). Estrutura idêntica ao módulo Aquisição (abas Visão Geral e Matriz), mas sem dados de Meta Ads.

**Arquivos criados:**
- `eb-dash2/src/hooks/useOrganico.ts` — hook de dados: filtra leads orgânicos, sem Meta Ads, retorna `organicSourceSet`
- `eb-dash2/src/pages/organico/OrganicoPage.tsx` — página principal, reutiliza `AquisicaoTab` e `MatrizTab` com `hasPaidTraffic=false`

**Arquivos modificados:**
- `eb-dash2/src/App.tsx` — nova rota `/organico`
- `eb-dash2/src/components/layout/Sidebar.tsx` — entrada "Orgânico" com ícone `Leaf`, abaixo de "Aquisição"

---

### 2026-03-26 — Fix: filtro de Closer no modo Produtividade de Vendas (bugfix)

O filtro de Closer no dropdown da tela de Vendas não tinha efeito nenhum quando o painel estava em modo **Produtividade**. O leaderboard e os cards de KPI continuavam mostrando dados de **todos** os closers.

**Causa raiz:** O hook `useCloserProdutividade` busca dados direto no banco sem parâmetro de closer. No modo Cohort o filtro funcionava porque era aplicado sobre `opps` vindos do `usePreVendas`. No modo Produtividade o datasource era separado e ignorava o filtro.

**Correção:**
- `filteredProdRows`: memo que filtra `prodRows` pelo closer selecionado antes de renderizar
- `normalizedRows` (leaderboard) passa a usar `filteredProdRows`
- `activeKpis` (cards KPI do topo) agrega de `filteredProdRows` quando há filtro, garantindo que faturamento/reuniões/fechados reflitam apenas o closer selecionado

**Arquivos modificados:**
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx` — prop `closerFilter`, `filteredProdRows`, `normalizedRows` e `activeKpis` corrigidos
- `eb-dash2/src/pages/vendas/VendasPage.tsx` — passa `closerFilter={closer}` para `GeralTab`

---

### 2026-03-26 — Remover ROAS e ROAS Caixa do painel de Vendas (refactor)

Removidos os KPI Cards **ROAS** e **ROAS Caixa** da aba Visão Geral do módulo Vendas. Métricas de ROAS são mais pertinentes ao módulo de Tráfego/Aquisição.

**Arquivos modificados:**
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx` — removidos cálculos de `investimento`/`roas`/`roasCaixa`, prop `metaRows`, import `MetaRow` e `TrendingUp`, 2 KPI cards
- `eb-dash2/src/pages/vendas/VendasPage.tsx` — removida prop `metaRows` do `<GeralTab>`

### 2026-03-25 — Aba Auto Agendados nos módulos Pré-Vendas e Recuperação (feat)

Nova aba **Auto Agendados** nos módulos Pré-Vendas e Recuperação. Filtra leads pela data de auto agendamento com SDR (`data_auto_agendamento`) no período selecionado e mostra o que aconteceu com cada um.

**16 colunas:** Cliente (sticky), SDR, Funil, Canal, Entrada, Auto Agendamento, Conectado, Agendado, Reunião, Status (8 estados), Msgs SDR, Msgs IA, Emails, Ligações, Msgs Lead, Dias na Base, Tempo Conexão.

**Arquivos criados:**
- `eb-dash2/src/pages/prevendas/tabs/AutoAgendadosTab.tsx`

**Arquivos modificados:**
- `eb-dash2/src/hooks/useTrafego.ts` — tipo OppRow + `data_auto_agendamento`
- `eb-dash2/src/hooks/usePreVendas.ts` — campo no select (2 queries)
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — registra aba
- `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx` — registra aba

---

### 2026-03-25 — Novo campo data_auto_agendamento em oportunidades (feat)

Campo `data_auto_agendamento DATE` adicionado à tabela `oportunidades`. Captura a data em que o lead fez auto-agendamento com o SDR via campo GHL `{{ opportunity.mqlauto_agendamento }}`.

**Detalhe técnico:** O webhook envia data+hora, mas `parse_date_flexible()` descarta a hora e retorna apenas `DATE` — padrão do sistema para datas de pipeline.

**Migrations:**
- `20260325210000_add_data_auto_agendamento.sql` — ADD COLUMN + atualiza `extrair_dados_ghl()`
- `20260325210001_backfill_data_auto_agendamento.sql` — backfill de webhooks existentes

---

### 2026-03-25 — Aba Reuniões migrada de Produtividade para Cohort (fix)

A aba **Reuniões** do módulo Vendas agora funciona **exclusivamente em modo Cohort** (antes era Produtividade).

**Motivo:** A aba filtra reuniões pela `data_reuniao_agendada` (data prevista da reunião). Isso é um cohort — você seleciona um período e vê todas as reuniões cuja data prevista cai nele. O modo Produtividade seria para eventos realizados no período, não agendados.

**Arquivos modificados:**
- `eb-dash2/src/pages/vendas/tabs/ReunioesTab.tsx` — renomeado de `ReunioesProdTab.tsx`; condição invertida: bloqueia em `activePanel !== 'cohort'` (antes bloqueava em `!== 'produtividade'`); texto do aviso atualizado; rodapé da tabela atualizado
- `eb-dash2/src/pages/vendas/VendasPage.tsx` — import atualizado para `ReunioesTab`
- `docs/ABA-REUNIOES-VENDAS.md` — seção "Modo de visualização" atualizada com explicação do motivo

---

### 2026-03-25 — Aba MQLs nos módulos Pré-Vendas e Recuperação (feat)

Nova aba **MQLs** nos módulos Pré-Vendas e Recuperação que mostra tabela detalhada de cada lead MQL em modo Cohort. Filtra leads pela data de entrada (`data_lead_recebido`) e exibe tudo que aconteceu com cada um.

**17 colunas:** Cliente (sticky), SDR, Funil, Canal, Entrada, Conectado, Auto Agendou (badge via tag), Agendado, Reunião, Status (8 estados com badge), Msgs SDR, Msgs IA, Emails, Ligações, Msgs Lead, Dias na Base, Tempo Conexão.

**Auto Agendou:** Detecta se o lead tem a tag `"auto agendou"` no campo `contatos.tags`. Exibe badge verde "Sim" ou "—".

**Funcionalidades:** Colunas reordenáveis/ocultáveis (localStorage), ordenação em todas as colunas (numérica para contagens), busca por nome, filtro por status, modo tela cheia, LeadCard ao clicar.

**Arquivos criados:**
- `eb-dash2/src/hooks/useMQLCohortComms.ts` — hook que busca comunicações (3 queries paralelas paginadas) e agrega por lead
- `eb-dash2/src/pages/prevendas/tabs/MQLsCohortTab.tsx` — componente da aba

**Arquivos modificados:**
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — registra 4ª aba "MQLs"
- `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx` — registra 4ª aba "MQLs"
- `docs/DASHBOARD-MODULOS.md` — documenta nova aba

---

### 2026-03-25 — Unificar estrutura Cohort/Produtividade na Visão Geral de Pré-Vendas (fix)

A aba Produtividade da Visão Geral de Pré-Vendas estava completamente diferente da Cohort — mostrava `AtividadeSDRPanel` (ligações/mensagens/pessoas) em vez da Matriz. Corrigido para usar a **mesma estrutura visual** em ambos os modos, mudando apenas a fonte de cálculo dos dados.

**Antes:** Produtividade escondia KPIs (Prazo Médio, MQLs, Taxa Conexão), mostrava funil sem Leads/MQLs, e substituía a Matriz Cohort por um painel de atividade SDR totalmente diferente.

**Depois:** Ambos os modos têm a mesma estrutura: KPIs → Funil → Matriz → Análise. A diferença está apenas nos dados:
- **Cohort:** agrupa por mês de `data_lead_recebido`, conta eventos sem filtro de data
- **Produtividade:** cada coluna conta eventos que aconteceram naquele mês, independente de quando o lead entrou

**Novo hook:** `eb-dash2/src/hooks/useProdutividadeMatrix.ts`
- Retorna `CohortRow[]`-compatible data para a Matriz Produtividade
- Carrega event opps (pipeline events in range) e revenue separadamente
- Filtra por SDR oficial e pipeline (exclui/inclui Recuperação)
- Coluna "Leads" = leads recebidos no mês (produção de novos leads)
- Colunas de eventos = eventos que aconteceram no mês

**Modificado:** `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`
- Removidos guards `{!isProdutividade}` — todos os KPIs visíveis em ambos os modos
- Funil com mesmos 6 steps (Leads → MQLs → Conectados → Agendados → Reuniões → Fechados) em ambos os modos
- Matriz unificada: título muda ("Matriz Cohort" vs "Matriz Produtividade"), dados vêm de hooks diferentes
- Removida dependência de `AtividadeSDRPanel` da Visão Geral

---

### 2026-03-25 — Novos gráficos na aba Visão Geral do módulo Vendas (feat)

Adicionados gráficos de conversão por funil e por canal. Reuniões por Closer convertido de barra para pizza. Novo gráfico pizza de distribuição de MQLs por Closer. Todos os gráficos organizados em seção única, tabela movida para o final.

**O que mudou (`eb-dash2/src/pages/vendas/tabs/GeralTab.tsx`):**
- `parseTags` importado de `useTrafego`
- Novo `useEffect` carrega `utm_sources` (pagos), `utm_sources_plain` (orgânicos) e `funnels`
- `conversionByCanal`: agrupa leads por canal — pagos agrupados como "Tráfego", orgânicos discriminados por nome amigável
- `conversionByFunil`: agrupa leads por tag de funil cadastrada em `funnels`, calcula conversão
- Novo componente `ConversaoBarChart` (barra horizontal genérica com % conversão + contagem)
- `ReuniosPorCloser` (barra) removido → substituído por `DonutChart` (pizza) de reuniões
- Novo `DonutChart` de distribuição de MQLs por closer (apenas modo Cohort)
- Nova seção "Gráficos" agrupa todos os charts juntos (antes da tabela):
  1. Row 1: Conversão por Closer + Conversão por Funil
  2. Row 2: Conversão por Canal (largura total)
  3. Row 3: Reuniões por Closer (pizza) + MQLs por Closer (pizza)
- Seção "Motivos de Perda" mantida após os gráficos
- Tabela de Closers movida para o final ("Section 6")

---

### 2026-03-25 — Remover Leads/MQLs do modo Produtividade em Vendas (fix)

Leads e MQLs não fazem sentido no modo Produtividade — não há como medir um critério inicial de "leads gerados" quando o filtro é por data de evento. Removidos de todas as superfícies de Produtividade no módulo Vendas.

**O que mudou:**

- `eb-dash2/src/hooks/useCloserProdutividade.ts`:
  - Removido `leads`/`mqls` de `CloserProdutividadeRow`, `VendasProdMesRow` e `CloserProdutividadeOverall`
  - Removido cálculo de `oppIds`, `mqlIds`, `allOppMap` (não mais necessários)
  - Limpo acumulador `MesAccum` e loop de eventos (sem tracking de MQL/leads por mês)
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx`:
  - Colunas "Leads" e "MQLs" ocultas na tabela de closers quando `isProdutividade`
  - Funil de Produtividade começa em "Agend. Vendas" (removidos steps "Leads" e "MQLs")
- `eb-dash2/src/pages/vendas/tabs/MatrizTab.tsx`:
  - Removidas colunas "Leads" e "MQLs" do header, corpo e footer da matriz Produtividade

**Sem impacto no modo Cohort** — Leads e MQLs continuam visíveis normalmente.

---

### 2026-03-25 — Meta de % conversão de reuniões no módulo Vendas (feat)

Adicionada métrica `conversion_rate` na área `vendas` do módulo Metas. Suporta escopo **global** (time inteiro) e **por closer** (individual).

**O que mudou:**
- `supabase/migrations/20260325200000_add_vendas_conversion_rate_metric.sql` — insere `vendas.conversion_rate` em `goal_metric_definitions` com `legacy_tipo = 'taxa_conversao_vendas'`
- `eb-dash2/src/lib/goals/catalog.ts` — adicionado `taxa_conversao_vendas` no `LEGACY_GOAL_TYPE_MAP` (aponta para `vendas.conversion_rate`, scope default `workspace`)
- `eb-dash2/src/lib/goals/service.ts`:
  - Novo tipo `VendasConversionRow` + `VendasConversionDataset`
  - Cache `vendasConversion` em `EvaluationCaches`
  - `loadVendasConversionDataset` — busca reuniões (`data_realizacao_vendas`) e fechamentos (`data_pagamento_entrada`) no período
  - `evaluateVendasConversionRate` — calcula `fechados/reunioes * 100`, tracking `snapshot`
  - `tiposComEscopoUser` array para resolver `user` scope em `resolveLegacyGoalInput`
- `eb-dash2/src/pages/vendas/tabs/GeralTab.tsx` — coluna "Tx Conv." no leaderboard de closers agora exibe meta por closer (fallback para meta global), com cor verde/vermelho conforme desempenho

**Como cadastrar metas:**
1. Módulo `/metas` → Registry → Nova meta
2. Indicador: "Taxa de Conversão de Reuniões" (Vendas)
3. Escopo: "Global" para meta do time, ou nome exato do closer para meta individual
4. A meta aparece na aba Visão Geral → KPI "Taxa de Conversão" (global) e no leaderboard por closer

---

### 2026-03-25 — Botão "Limpar filtros" em todos os módulos com filtros (feat)

Adicionado botão **Limpar** (ícone X) que aparece condicionalmente quando há filtros de dimensão ativos. Mantém o período de datas intacto ao limpar.

**Módulos afetados:**
- `eb-dash2/src/components/dashboard/FilterBar.tsx` — Tráfego (já estava, confirmado)
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — Pré-Vendas (já estava, confirmado)
- `eb-dash2/src/pages/vendas/VendasPage.tsx` — Vendas (adicionado)
- `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx` — Recuperação (adicionado)
- `eb-dash2/src/pages/aquisicao/AquisicaoPage.tsx` — Aquisição (adicionado)
- `eb-dash2/src/pages/leads/tabs/ListaTab.tsx` — Lista de Leads (adicionado, limpa search + dropdowns)
- `eb-dash2/src/pages/goals/GoalsPage.tsx` — Metas (adicionado, limpa área/modo/status)

---

### 2026-03-25 — Aba "Análise" removida do módulo Vendas (chore)

Aba removida por decisão do produto. Sem código morto.

**Arquivos removidos/modificados:**
- `eb-dash2/src/pages/vendas/tabs/AnaliseTab.tsx` — arquivo deletado
- `eb-dash2/src/pages/vendas/VendasPage.tsx` — import, entrada no TABS e bloco de render removidos
- `docs/DASHBOARD-MODULOS.md` — linha `vendas.analise` removida

---

### 2026-03-25 — Link de gravação consolidado em vendas_fechamento (refactor)

**Removida** coluna `oportunidades.link_gravacao_call` (nunca populada). Link de gravação da call de vendas fica **exclusivamente** em `vendas_fechamento.link_gravacao_call_vendas`, extraído via trigger.

**Arquivos modificados:**
- `eb-dash2/src/hooks/useTrafego.ts` — `RevenueRow` inclui `link_gravacao_call_vendas`; removido campo `link_gravacao_call` de `OppRow`
- `eb-dash2/src/hooks/usePreVendas.ts` — removido `link_gravacao_call` do OPP_SELECT; queries de revenue incluem novo campo
- `eb-dash2/src/pages/vendas/tabs/ReunioesProdTab.tsx` — usa `gravacaoMap` (de `revenueRows`) em vez de `opp.link_gravacao_call`
- `supabase/migrations/20260325160000_drop_link_gravacao_call_from_oportunidades.sql` — dropa coluna
- `docs/ABA-REUNIOES-VENDAS.md` — atualizado

---

### 2026-03-25 — Aba "Reuniões" no módulo Vendas (feat)

**Nova aba** adicionada ao módulo Vendas para monitorar reuniões de closers.

**Arquivos criados/modificados:**
- `eb-dash2/src/pages/vendas/tabs/ReunioesProdTab.tsx` — componente da aba
- `eb-dash2/src/pages/vendas/VendasPage.tsx` — aba adicionada ao TABS + render
- `eb-dash2/src/components/layout/Sidebar.tsx` — item "Reuniões" adicionado ao menu Vendas
- `eb-dash2/src/hooks/usePreVendas.ts` — `data_reuniao_agendada` adicionado ao `OPP_SELECT`
- `supabase/migrations/20260325140000_add_link_gravacao_call_vendas.sql` — coluna + trigger + backfill em `vendas_fechamento`

**Comportamento:**
- Só funciona em modo Produtividade. Em modo Cohort exibe aviso.
- **Filtro principal:** `data_reuniao_agendada` no período global (startDate/endDate do VendasPage).
- **Filtro secundário (interno):** date range por `data_realizacao_vendas` na toolbar da tabela.
- Colunas: Cliente (fixo, clicável → LeadCard), Closer, Reunião Prevista (`data_reuniao_agendada`), Realizada em (`data_realizacao_vendas`), Status Reunião, Status Lead, Funil, Canal, Gravação.
- Status da reunião derivado por prioridade: Fechado → Perdido → Negociação → Realizada → No-show → Agendada.
- Colunas reordenáveis/ocultáveis. Persiste em localStorage key `eb-dash2:reunioes-tab:columns-v2`.

---

### 2026-03-25 (Docs: correção de documentação dos campos de reunião em oportunidades)

**Problema:** Dois campos existentes no banco não estavam documentados em `TABELAS-SISTEMA.md`:
- `data_reuniao_agendada` — data prevista em que a reunião MQL vai acontecer (`{{ opportunity.data_da_reunio }}`)
- `data_reuniao_realizada` — data em que a reunião de pré-vendas foi realizada (`{{ opportunity.reuniao_realizada }}`)

Além disso, `data_agendamento_reuniao` tinha o fallback errado documentado (`sqlreunio_agendada` em vez de `mqlreunio_marcada`).

**`MAPEAMENTO-CAMPOS.md`** também não tinha nenhum dos campos de datas do pipeline mapeados — adicionados todos os 9 campos de data de pré-vendas e vendas.

**Arquivos:** `docs/TABELAS-SISTEMA.md`, `docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md`

---

### 2026-03-25 (Fix: prioridade de extração de data_realizacao_vendas)

**Problema:** O campo `data_realizacao_vendas` buscava primeiro de `{{ opportunity.sqlreunio_realizada }}`, mas o campo correto com prioridade máxima é `{{ opportunity.data_da_reunio_realizada }}`.

**Correção:** Migration `20260325150000_fix_data_realizacao_vendas_prioridade.sql` altera o `COALESCE` em `extrair_dados_ghl` para 3 níveis de prioridade:
1. `{{ opportunity.data_da_reunio_realizada }}` — **prioridade máxima**
2. `{{ opportunity.sqlreunio_realizada }}` — fallback
3. `{{ opportunity.d_sqlreunio_realizada }}` — último fallback

**Alteração aplicada em 2 pontos:** INSERT (novas oportunidades) e UPDATE (oportunidades existentes).

**Backfill:** Migration `20260325151000_backfill_data_realizacao_vendas_prioridade.sql` recalculou todas as opps a partir do último webhook. Resultado: `data_realizacao_vendas` preenchida passou de **398 → 440** (+42 opps que tinham `data_da_reunio_realizada` mas não `sqlreunio_realizada`).

**Arquivos:** 2 migrations SQL + `docs/MUDANCAS.md` + `docs/TABELAS-SISTEMA.md`

---

### 2026-03-25 (Feat: link da gravação da call de vendas)

**Novo campo `link_gravacao_call_vendas`** adicionado à tabela `vendas_fechamento`.

- Migration `20260325140000_add_link_gravacao_call_vendas.sql`:
  - Coluna `link_gravacao_call_vendas TEXT` adicionada
  - Trigger `extrair_vendas_fechamento_do_webhook()` atualizado para extrair `{{opportunity.link_da_gravao_da_call_de_vendas}}`
  - Guard do trigger ampliado para incluir o novo campo (pode chegar isolado)
  - Backfill preparado (0 webhooks históricos com valor preenchido)

**Nota técnica:** O GHL remove acentos das chaves customData — a variável `{{Op_Link da gravação da call de vendas}}` chega como `{{opportunity.link_da_gravao_da_call_de_vendas}}` (sem "ç" e sem "ã").

**Arquivos:** Migration SQL + `docs/VENDAS-FECHAMENTO.md` + `docs/TABELAS-SISTEMA.md`

---

### 2026-03-25 (Feat/Fix: melhorias no Ranking de Criativos)

**1. Fix: ordenação crescente/decrescente não funcionava**

Causa: `setSortDir` chamado dentro do updater do `setSortKey` — React não garante execução de setState aninhado em updater. Corrigido lendo `sortKey` do closure e chamando os dois setters de forma independente.

**2. Feat: criativos clicáveis no Ranking**

Código `CR-XXX` na coluna Criativo vira link com ícone `ExternalLink` quando `previewUrl` disponível (via `meta_ads_permalinks`). Clicar abre o post no Instagram/Facebook em nova aba. Sem URL: texto simples como antes.

**3. Feat: botão "Só com MQL" no Ranking**

Toggle ativo por padrão — filtra criativos com `mql = 0` para análise limpa de CPMQL. Contador na toolbar mostra `"X criativos (Y sem MQL ocultos)"`. Botão destacado em empire quando ativo.

**Arquivo:** `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`

---

### 2026-03-24 (Feat: sync de permalinks Meta API — links reais dos anúncios)

**Mudança:** URLs dos anúncios nos gráficos de criativos agora vêm da Meta Marketing API em vez do campo manual do Notion. Clicar num criativo abre o post real no Instagram ou Facebook.

**Implementação:**
1. **Migration** `20260324170000_create_meta_ads_permalinks.sql`:
   - Cria tabela `meta_ads_permalinks(ad_id PK, creative_code, instagram_permalink_url, permalink_url, fetched_at)`
   - Índice em `creative_code` para lookup rápido
   - Cron `sync-ad-permalinks-daily` às 05:00 UTC (02:00 BRT)

2. **Edge Function** `supabase/functions/sync-ad-permalinks/index.ts`:
   - Busca todos os `ad_id` + `ad_name` com `CR-XXX` da tabela `meta_ads_insights`
   - Agrupa em lotes de 50 (limite seguro da Meta batch API)
   - Endpoint: `GET /v21.0/?ids=...&fields=creative{permalink_url,instagram_permalink_url}&access_token=META_ACCESS_TOKEN`
   - Upsert em `meta_ads_permalinks` por `ad_id`

3. **Frontend — TrafegoTab.tsx + CriativosTab.tsx:**
   - Adicionada query a `meta_ads_permalinks` em paralelo com `notion_creatives`
   - Prioridade de URL: `instagram_permalink_url` (Meta) > `permalink_url` (Meta) > `final_asset_url` (Google Drive)
   - Fallback Google Drive mantido enquanto Meta ainda não sincronizou

**Prioridade URL (novo padrão):**
```
1. meta_ads_permalinks.instagram_permalink_url  ← post real no Instagram
2. meta_ads_permalinks.permalink_url            ← post real no Facebook
3. notion_creatives.final_asset_url             ← Google Drive (fallback)
```

**Arquivos:**
- `supabase/migrations/20260324170000_create_meta_ads_permalinks.sql` (novo)
- `supabase/functions/sync-ad-permalinks/index.ts` (novo)
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
- `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx`
- `docs/DESIGN-DASHBOARD-COMPONENTS.md`

---

### 2026-03-24 (Feat: aba Ranking de Criativos no módulo Tráfego)

**Mudanca:** Nova aba "Ranking de Criativos" no módulo Tráfego. Tabela completa onde cada linha é um criativo (CR-XXX) e cada coluna é uma métrica de performance.

**Métricas por criativo:**
- Investimento (soma spend Meta Ads agrupado por CR-XXX extraído de `ad_name`)
- Faturamento (`valor_faturado` de `vendas_fechamento` via opp_id → utm_term → CR-XXX)
- Caixa (`valor_entrada` idem)
- MQL (contagem via `isMqlByTag`)
- CPMQL (Investimento / MQL)
- Vendas (contagem via `paymentDateMap`)
- CPV (Investimento / Vendas)

**Features:**
- Header fixo (sticky top-0) + primeira coluna fixa (sticky left-0) com sombra
- Ordenação por qualquer coluna — ícones: crescente, decrescente, inativo
- Popover "Colunas" para mostrar/esconder e reordenar
- Preferências salvas em `localStorage` (`eb-dash2:criativos-tab:columns`)
- Full screen via `createPortal`
- Drill-down: click em MQL ou Vendas abre LeadListModal
- Apenas criativos com investimento > 0 no período
- Respeita toggle Cohort/Produtividade e filtros da FilterBar

**Arquivos:**
- `eb-dash2/src/pages/dashboard/tabs/CriativosTab.tsx` (novo)
- `eb-dash2/src/pages/dashboard/DashboardPage.tsx` (add tab)
- `docs/DASHBOARD-MODULOS.md` (registrar aba)

---

### 2026-03-24 (Feat: post_url em notion_creatives — link real do post no Instagram/Facebook)

**Mudança:** Adicionado campo `post_url` na tabela `notion_creatives` para armazenar o link público do post real no Instagram ou Facebook. Clicar no criativo no dashboard abre agora o post sem exigir login.

**Como funciona:**
1. No Notion, adicionar campo URL chamado **"Link do Anúncio"** na base de criativos pagos
2. Preencher com o link do post no Instagram (`https://www.instagram.com/p/...`) ou Facebook
3. O sync do Notion (`notion-creatives-sync`) extrai e salva em `notion_creatives.post_url`
4. O dashboard usa `post_url` como URL de clique; fallback para `final_asset_url` (Google Drive) se vazio

**Prioridade de URL no clique:**
- `post_url` preenchido → abre o post real (Instagram/Facebook, sem login)
- `post_url` vazio + `final_asset_url` preenchido → abre o arquivo no Drive
- Ambos vazios → clique abre modal de leads

**Migration:** `20260324160000_add_post_url_to_notion_creatives.sql` (aplicada)

**Arquivos:** `notion-creatives-sync/index.ts`, `TrafegoTab.tsx`, `CriativosTab.tsx`, `docs/MUDANCAS.md`, `docs/DESIGN-DASHBOARD-COMPONENTS.md`

---

### 2026-03-24 (Fix: link criativo usa final_asset_url + fix TS CriativosTab)

**Mudanca:** Revertido link de criativo de Meta Ads Manager (exige login) para `notion_creatives.final_asset_url` (arquivo final, tipicamente Google Drive). Para abrir sem pedir senha, o arquivo precisa estar compartilhado como "qualquer pessoa com o link pode ver" no Google Drive.

**Fix TS pré-existente em CriativosTab.tsx:**
- 3 casts `as Record<string, unknown>` → substituídos por `as keyof CreativeTableRow`
- Imports não-usados `MetaRow` e `RevenueRow` removidos

**Arquivos:** `TrafegoTab.tsx`, `CriativosTab.tsx`, `docs/MUDANCAS.md`

---

### 2026-03-24 (Feat: DonutChart criativos — codigo em destaque + link Meta Ads Manager)

**Mudanca:** Graficos de pizza "MQLs por criativo" e "Vendas por criativo" agora exibem o codigo do criativo (`CR-XXX`) em destaque na legenda; o nome completo aparece no tooltip ao passar o mouse. Clicar em um criativo abre o anuncio diretamente no Meta Ads Manager (nao mais a lista de leads).

**Implementacao:**
- `DonutChart` aceita `code?: string` e `previewUrl?: string` por item de data
  - `code` presente → exibe codigo semibold na legenda; `reason` vira tooltip nativo
  - `previewUrl` presente → clique abre URL em nova aba; sem `previewUrl` → chama `onSliceClick` (modal de leads)
  - Hint de rodape adaptativo: "abrir no Meta" vs "ver os leads"
- `TrafegoTab` busca `meta_ads_insights(ad_id, ad_name, account_id)` filtrando `ad_name ILIKE '%CR-%'` ordered by `date DESC` limit 1000
- URL montada como `https://adsmanager.facebook.com/adsmanager/manage/ads?act=<account_id>&selected_ad_ids=<ad_id>`
  - Prefixo `act_` removido do `account_id` automaticamente
  - Primeiro match por `CR-XXX` vence (mais recente)
- Removido uso de `notion_creatives.final_asset_url` (era Google Drive, nao o anuncio real)

**Arquivos:** `DonutChart.tsx`, `TrafegoTab.tsx`, `docs/DESIGN-DASHBOARD-COMPONENTS.md`, `docs/MUDANCAS.md`

---

### 2026-03-24 (Feat: DonutCharts MQLs e Vendas por criativo)

**Mudanca:** Adicionados 2 novos graficos de pizza na secao Segmentacao da aba Trafego: "MQLs por criativo" e "Vendas por criativo". Agrupam leads pelo criativo do anuncio, extraido do `utm_term` via regex `CR-(\d+)` e resolvido para nome amigavel via `notion_creatives.external_id`.

**Implementacao:**
- Helper `extractCreativeId(utmTerm)` extrai `CR-XXX` do codigo estruturado
- `notion_creatives` (database_type='paid') carregado em paralelo com `funnels` no useEffect
- `creativeMap`: Map<external_id, name> para lookup O(1)
- Fallback: leads sem `CR-XXX` vao para "Sem criativo"; com `CR-XXX` mas sem match mostram o codigo

**Arquivos:** `TrafegoTab.tsx`, `docs/MUDANCAS.md`

---

### 2026-03-24 (Fix: aba Matriz do Tráfego faltando na Sidebar)

**Mudanca:** Adicionada aba "Matriz" do módulo Tráfego na Sidebar. A aba já existia no `DashboardPage.tsx` (array `TABS` + componente `MatrizTab`), mas não tinha o child correspondente no array `navigation` do `Sidebar.tsx`, ficando inacessível pela navegação lateral.

**Regra adicionada:** Documentada em `docs/DASHBOARD-MODULOS.md` seção "Regras de Navegação" — toda aba no array `TABS` de um módulo DEVE ter child na Sidebar.

**Arquivos:** `Sidebar.tsx`, `docs/DASHBOARD-MODULOS.md`, `docs/MUDANCAS.md`

---

### 2026-03-24 (Fix visual — KPI cards, donut charts e legenda "ver mais")

**Mudanca:** Corrigidos 3 problemas visuais da aba Trafego apos primeiro redesign.

**Problemas corrigidos:**
1. **KPI Cards cortando numeros** — Grid `xl:grid-cols-11` espremeu demais. Corrigido para `xl:grid-cols-6` (2 linhas de 6+5). Valor voltou para `text-xl` (era `text-lg`). Padding aumentado para `px-3.5 py-3`
2. **Donut charts muito pequenos** — SVG voltou para 160x160px (era 120px). Donut com `outerR=72 innerR=44`. Padding do card voltou para `p-5` com `rounded-xl`
3. **Legenda sem limite** — Quando havia muitos itens (6+), ficava dificil de ver. Agora mostra max 5 itens com botao "Ver mais N" / "Ver menos" usando ChevronDown animado

**Documentacao atualizada:** `docs/DESIGN-DASHBOARD-COMPONENTS.md`

---

### 2026-03-24 (Refinamento visual — aba Trafego mais compacta e profissional)

**Mudanca:** Redesign visual dos componentes da aba Trafego para dashboard mais denso e scanavel.

**Motivacao:** KPI cards muito grandes, funil com cards de alturas diferentes, layout esbanjava espaco vertical. Dashboard nao permitia bater o olho e ver tudo rapido.

**Componentes alterados:**
- `KpiCard.tsx` — Compactado: icone inline com label (sem box), accent bar 2px no topo, valor `text-lg` (era `text-2xl`), padding `px-3 py-2.5` (era `p-4`)
- `FunnelViz.tsx` — Grid com colunas iguais e altura fixa `88px` (era `min-h-[120px]` com flex). Removidas setas ChevronRight entre etapas. % total e conversao em linha unica
- `DonutChart.tsx` — Donut menor (120px, era 160px), padding reduzido, legenda mais compacta
- `MetaTrackingCard.tsx` — Mini bar chart menor (80px, era 110px), boxes info mais compactos, header com accent bar gold
- `TrafegoTab.tsx` — Espaco entre secoes `space-y-5` (era `space-y-8`), grid KPI `xl:grid-cols-11` (era `xl:grid-cols-6`), funil movido para antes do MetaTracking

**Layout reordenado:** Filtros → KPIs → Funil → Metas → Segmentacao (funil subiu para logo apos KPIs)

**Nenhuma funcionalidade alterada** — apenas visual e layout.

**Documentacao atualizada:** `docs/DESIGN-DASHBOARD-COMPONENTS.md`

---

### 2026-03-24 (Redesign completo da pagina de Trafego)

**Mudanca:** Refatoracao visual completa da pagina de Trafego. Arquivo monolitico de 1.571 linhas decomposto em 9 componentes reutilizaveis.

**Motivacao:** Dashboard tinha cores inconsistentes, graficos basicos, sem hierarquia visual clara. Agora segue design profissional com componentes documentados.

**Componentes criados (`eb-dash2/src/components/dashboard/`):**
- `SectionHeader.tsx` — Cabecalho de secao com linha gold
- `KpiCard.tsx` — Card de KPI com variantes semanticas (success/warning/danger/highlight)
- `DonutChart.tsx` — Grafico donut SVG (substitui PieChart)
- `FunnelViz.tsx` — Funil horizontal com barras proporcionais
- `FilterBar.tsx` — Barra de filtros com toggle Cohort/Produtividade integrado
- `SyncBanner.tsx` — Banner de sync Meta Ads
- `CohortMatrix.tsx` — Tabela cohort com sticky headers
- `ProdutividadeMatrix.tsx` — Tabela produtividade
- `index.ts` — Re-exports

**Tokens CSS adicionados:**
- Cores semanticas para dados: `--data-success`, `--data-warning`, `--data-danger`, `--data-info` (+ versoes soft)
- Paleta de graficos: `--chart-1` a `--chart-12`

**Documentacao:** `docs/DESIGN-DASHBOARD-COMPONENTS.md` — guia completo para replicar o design em outras paginas

**Branch:** `redesign/trafego-dashboard`

---

### 2026-03-24 (📊 Matriz extraída para aba separada — Tráfego, Aquisição e Vendas)

**Mudança:** A Matriz Cohort/Produtividade foi movida de dentro da aba "Visão Geral" para uma aba própria chamada "Matriz" em cada módulo.

**Motivação:** Separar a análise de cohort/produtividade da visão rápida de KPIs e gráficos. Cada aba tem seus próprios filtros e toggle independentes.

**Arquivos criados:**
- `eb-dash2/src/pages/dashboard/tabs/MatrizTab.tsx` — Módulo Tráfego
- `eb-dash2/src/pages/aquisicao/tabs/MatrizTab.tsx` — Módulo Aquisição
- `eb-dash2/src/pages/vendas/tabs/MatrizTab.tsx` — Módulo Vendas

**Arquivos modificados:**
- `DashboardPage.tsx`, `AquisicaoPage.tsx`, `VendasPage.tsx` — adicionada aba "Matriz" com ícone `TableProperties`
- `TrafegoTab.tsx`, `AquisicaoTab.tsx`, `GeralTab.tsx` (Vendas) — removidas seções de matriz, FunnelViz totais e leaderboard produtividade

**Comportamento:**
- Visão Geral: KPIs, gráficos de pizza, segmentos (sem matriz)
- Matriz: Toggle Cohort/Produtividade + filtros próprios + tabela completa + FunnelViz totais + LeadListModal

### 2026-03-24 (🔧 KPI Cards Tráfego — reordenação + novos cards + fix MQL)

**Reordenação dos KPI Cards:**
Nova ordem: Investimento → Faturamento → Caixa → MQL → CPMQL → Vendas → CPV → ROAS → ROAS Caixa → Ciclo de Compra → Meta CPMQL

**Novos cards:**
- **Vendas** — número de vendas fechadas (com `data_pagamento_entrada`)
- **CPV** (Custo por Venda) — `investimento / vendas`

**Renomeado:** "Prazo Médio de Compra" → "Ciclo de Compra"

**Fix:** Card MQL agora sempre usa `mqlCount` do funil (`filteredOpps`), não `mqlCountForGoal` (dataset da meta). Corrige inconsistência onde card mostrava 77 MQLs e funil mostrava 123 (meta com período diferente do filtro).

**Arquivos:** `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`, `docs/PAINEL-TRAFEGO-PAGO.md`

### 2026-03-24 (📊 Gráficos de segmentação — Aquisição + Tráfego)

**8 gráficos de pizza (4 por aba) em Aquisição e Tráfego:**

**Aquisição (por origem):**
1. MQLs por funil — funis via tags
2. MQLs por origem — pagos agrupados como "Tráfego Pago", orgânicos individuais (`utm_sources_plain`)
3. Vendas por funil / 4. Vendas por origem — mesma lógica com critério `data_pagamento_entrada`

**Tráfego (por público):**
1. MQLs por funil — funis via tags
2. MQLs por público — cada canal pago individual (`utm_sources`) pelo nome amigável
3. Vendas por funil / 4. Vendas por público — mesma lógica com critério `data_pagamento_entrada`

Todos clicáveis (fatia abre modal com leads). Legenda mostra número absoluto + percentual. Header mostra total.

**Aquisição:** Removidos gráficos de motivos de perda (não pertenciam a Aquisição).

**Arquivos:** `useAquisicao.ts` (carrega `funnels`), `AquisicaoTab.tsx` (4 useMemos + 4 PieCharts), `TrafegoTab.tsx` (PieChart component + useEffect funnels/sources + 4 useMemos + 4 PieCharts)

### 2026-03-24 (🖱️ Tabela Closers clicável por etapa + fix closer classification)

**Fix classificação de closers:** Dropdown de filtro e gráfico de barras da GeralTab agora filtram apenas closers cadastrados em `ghl_users` com `papeis = ['closer']` (antes listava qualquer `vendedor_closer` de oportunidades).

**Fix Larissa Theophilo invisível:** Nome com espaço duplo no banco (`"Larissa  Theophilo"`) causava mismatch com `ghl_users`. Corrigidos 173 registros + normalização preventiva `.replace(/\s+/g, ' ').trim()` nos hooks.

**Tabela Closers clicável por etapa (Cohort + Produtividade):**
- Cada célula numérica é clicável — abre modal com os leads daquela etapa específica
- **Cohort:** Leads, Agend., Reuniões, No-shows, Tx Conv., Faturamento, Caixa
- **Produtividade:** Agend., Reuniões, No-shows, Negociação, Fechados, Faturamento, Caixa
- Células com valor 0 não são clicáveis (sem cursor pointer)
- Feedback visual: hover dourado nas células clicáveis

**Arquivos modificados:**
- `useCloserProdutividade.ts`: novo type `ProdLead`, arrays de leads por etapa no row, select expandido com contatos
- `useCloserLeaderboard.ts`: normalização de espaços em `vendedor_closer`
- `ClosersTab.tsx`: onClick por célula em vez de por linha, `paymentDateMap` para filtrar fechados no cohort
- `GeralTab.tsx`: carrega closers oficiais de `ghl_users`, filtra `CloserBarChart`
- `usePreVendas.ts`: dropdown de closers busca de `ghl_users` com `papeis = ['closer']`

### 2026-03-24 (📊 Gráfico MQLs por Funil na Aquisição)

**Novo gráfico:** Pizza "MQLs por funil" na aba Aquisição — agrupa MQLs pelos funis cadastrados na tabela `funnels`, mapeados via tags do contato (case-insensitive). Clique em fatia abre modal com leads.

**Removido:** Gráficos de "Perdidos sem reunião" e "Perdidos após reunião" da aba Aquisição (motivos de perda pertencem a Pré-Vendas/Vendas, não a Aquisição).

**Arquivos modificados:** `useAquisicao.ts` (carrega `funnels.nome`), `AquisicaoTab.tsx` (novo useMemo + PieChart, remoção dos PieCharts de perda e código órfão)

### 2026-03-24 (🏢 Módulo Vendas + Ajustes Layout Cohort)

**Novo módulo: Vendas** (`/vendas`) — primeiro item no sidebar, acima de Aquisição.

**3 abas:**

1. **Visão Geral**: 8 KPIs (Faturamento Bruto, Caixa Recebido, ROAS, ROAS Caixa, Taxa Conversão, Taxa No-show, Taxa Comparecimento, Taxa Recebimento) + Prazo Médio de Compra (destaque gold) + Totais da Matriz + Funil de Vendas + Motivos de Perda + Distribuição por Closer + Segmentos (canal/funil/produto) + Matriz Cohort (POR ÚLTIMO)
2. **Closers**: Leaderboard com 13 colunas (leads, agendados, reuniões, no-shows, conversão %, faturamento, caixa, msgs, ligações, tempo resposta, % sem resposta) + gráficos de conversão e reuniões por closer
3. **Análise**: Conversão por Canal, Conversão por Funil, MQL vs Não-MQL

**Hooks novos:** `useVendasCohort.ts` (matriz com colunas de vendas), `useCloserLeaderboard.ts` (leaderboard de closers com comunicações)

**Componentes novos:** `PrazoMedioCard.tsx` (compartilhado), `VendasPage.tsx`, `GeralTab.tsx`, `ClosersTab.tsx`, `AnaliseTab.tsx`

**Ajustes em módulos existentes:**
- **Pré-Vendas GeralTab**: Matriz Cohort movida para o final da página. Adicionados Prazo Médio de Compra + Totais da Matriz no topo.
- **Tráfego TrafegoTab**: Matriz Cohort movida para o final da página. PrazoMedioCard no topo (substitui card inline). Totais extraídos para cards no topo.

**Arquivos modificados:** `App.tsx` (rota), `Sidebar.tsx` (nav), `PreVendasPage GeralTab`, `TrafegoTab`

### 2026-03-24 (🔧 Ajustes finais layout + totais produtividade + meta conversão)

**Totais do Período em AMBOS os modos (Cohort + Produtividade) — TODAS as abas:**
- **Aquisição:** Adicionados cards "Totais do Período" para Cohort E Produtividade (não tinha nenhum). PrazoMedioCard em destaque no topo. Segmentos e Motivos de Perda movidos para antes das matrizes. Matrizes agora POR ÚLTIMO. Removido Prazo Médio inline antigo.
- **Tráfego:** Adicionado card "Totais do Período (Produtividade)". Cohort já tinha. PrazoMedioCard movido para antes dos KPIs.
- **Pré-Vendas:** Adicionado card "Totais do Período (Produtividade)" com Conectados, Agendados, Reuniões, Fechados — acima do painel de Atividade SDR. Cohort já tinha.
- **Vendas:** Já tinha totais para ambos os modos.

**Vendas GeralTab:** Integrada meta de taxa de conversão via `useMetas`. Quando a meta `taxa_conversao_vendas` está cadastrada, o KPI card exibe "Meta: X% · Atingida" ou "Faltam Npp", com cor verde/vermelha conforme resultado.

**Arquivos:** `AquisicaoTab.tsx`, `TrafegoTab.tsx`, `vendas/tabs/GeralTab.tsx`, `prevendas/tabs/GeralTab.tsx`

### 2026-03-24 (🔧 Fix: Funis mapeados via tags, não pipeline_name)

**Problema:** "Conversão por Funil" e "Segmento por Funil" usavam `pipeline_name` para agrupar leads — errado. Funis são cadastrados na tabela `funnels` e mapeados via tags do contato.

**Correção:** Agora carrega `funnels.nome` do banco e agrupa leads cuja `contatos.tags` contém uma tag igual ao nome do funil (case-insensitive). Um lead pode pertencer a múltiplos funis.

**Arquivos:** `vendas/tabs/AnaliseTab.tsx`, `vendas/tabs/GeralTab.tsx`, `CLAUDE.md` (documentação)

### 2026-03-24 (🔧 Fix: Canais exibem nome amigável, não código utm_source)

**Problema:** "Por Canal" e "Conversão por Canal" exibiam o código técnico (`fb-1`, `google-1`) em vez do nome amigável cadastrado em `utm_sources.nome` ("Facebook Ads", "Google Ads").

**Correção:** Agora carrega `utm_sources.nome` e `utm_sources.utm_source`, cria mapa `código → nome`, e exibe o nome amigável em todos os charts/tabelas de canal. Fallback para o código se não cadastrado.

**Arquivos:** `vendas/tabs/GeralTab.tsx`, `vendas/tabs/AnaliseTab.tsx`, `CLAUDE.md` (documentação)

---

### 2026-03-24 (⚡ Produtividade SDRs — lógica correta por data de evento)

**O que mudou:**

A aba **SDRs** em Pré-Vendas e Recuperação agora responde ao toggle Cohort/Produtividade corretamente.

**Problema anterior:** O toggle não chegava à aba SDRs — ela sempre usava lógica COHORT (filtrava leads por `data_lead_recebido` e contava eventos sem filtro de data). "Conectados" e "Agendados" mostravam eventos de qualquer época sobre leads que *entraram* no período.

**Comportamento novo:**

| Modo | Conectados | Agendados | Reuniões | Fechados |
|------|-----------|-----------|----------|----------|
| **Cohort** | sem mudança — lógica anterior intacta | idem | idem | idem |
| **Produtividade** | `data_conectado` no período | `data_agendamento_reuniao` no período | `data_realizacao_vendas` no período | `data_pagamento_entrada` no período |

**Novo hook `useSDRProdutividade`:**
- Busca opps onde ALGUM evento de pipeline aconteceu no período (OR query sobre 4 campos DATE)
- Fechados = `vendas_fechamento.data_pagamento_entrada` (não `data_fechado`) — respeita regra crítica do CLAUDE.md
- Comunicações (ligações, msgs, pessoas) = mesma lógica já correta de `useSDRAtividade`
- Paginação obrigatória (PAGE_SIZE=1000) em todas as queries

**Arquivos novos:** `eb-dash2/src/hooks/useSDRProdutividade.ts`

**Arquivos modificados:** `SDRsTab.tsx` (nova prop `activePanel` + `pipelineMode`, view `ProdutividadeView`), `PreVendasPage.tsx`, `RecuperacaoPage.tsx`

---

### 2026-03-24 (📅 Filtros de data melhorados em Pré-Vendas e Recuperação)

**O que mudou:**

Filtros de data mais amigáveis nos módulos Pré-Vendas e Recuperação:

1. **Novos presets:** Adicionados "Ontem" (dia anterior) e "Mês anterior" (mês completo anterior)
2. **Inputs melhorados:** Labels "De"/"Até" com ícone de calendário, cursor pointer, foco visual com cor do DS1

**Arquivos modificados:** `PreVendasPage.tsx`, `RecuperacaoPage.tsx`

---

### 2026-03-24 (🔄 Produtividade real dos SDRs — atividade diária)

**O que mudou:**

O toggle "Produtividade" nos módulos **Pré-Vendas** e **Recuperação** agora mostra **atividade real dos SDRs** em vez de re-agrupar métricas de funil por data de evento.

1. **Novo hook `useSDRAtividade`** — busca comunicações outbound humanas (`ghl_source='app'`, canais `call`/`whatsapp`/`sms`) + mapa `contato_id → SDR`. Agrupa por SDR + dia para calcular ligações, mensagens e pessoas únicas contatadas.

2. **Novo componente `AtividadeSDRPanel`** — substitui a Matriz Produtividade antiga. Exibe:
   - **3 KPI Cards consolidados:** Ligações (total + média/dia), Mensagens (total + média/dia), Pessoas contatadas (total + média/dia)
   - **Tabela por SDR:** ranking com totais e médias/dia
   - **Expandir dia-a-dia:** clique no SDR para ver detalhamento diário

3. **Limpeza:** Removidas referências ao `usePreVendasProducao` nos módulos Pré-Vendas e Recuperação (o hook continua existindo para Tráfego). Motivos de perda e distribuição SDR agora são exibidos apenas no modo Cohort.

**Arquivos criados:** `useSDRAtividade.ts`, `AtividadeSDRPanel.tsx`
**Arquivos modificados:** `GeralTab.tsx`, `PreVendasPage.tsx`, `RecuperacaoPage.tsx`

---

### 2026-03-23 (🔀 Toggle Cohort/Produtividade em Pré-Vendas e Recuperação)

**O que mudou:**

1. **Toggle Cohort/Produtividade** adicionado aos módulos **Pré-Vendas** e **Recuperação** — mesmo padrão visual e comportamental já usado em Tráfego e Aquisição. Card destacado acima dos filtros com dois botões + texto explicativo contextual.

2. **Novo hook `usePreVendasProducao`** — busca oportunidades por data de evento (não de geração), sem filtro de tráfego pago. Aceita `pipelineMode` para funcionar tanto em Pré-Vendas (`exclude_recuperacao`) quanto Recuperação (`only_recuperacao`). Lazy loading: só carrega quando o usuário clica em "Produtividade".

3. **GeralTab estendida** — renderização condicional: modo Cohort exibe Matriz Cohort (como antes), modo Produtividade exibe Matriz Produtividade com colunas Mês/Conectados/Agendados/Reuniões/Fechados/Faturamento + footer com totais. Motivos de perda e distribuição SDR refletem o dataset ativo.

4. **MQL filter** funciona em ambos os modos — aplicado client-side via `applyMqlFilter()`.

5. **Lead count** no filtro reflete o modo ativo (cohort ou produtividade).

**Arquivos criados:** `eb-dash2/src/hooks/usePreVendasProducao.ts`
**Arquivos modificados:** `PreVendasPage.tsx`, `RecuperacaoPage.tsx`, `GeralTab.tsx`, `docs/DASHBOARD-MODULOS.md`

---

### 2026-03-23 (🎨 UI: faturamento com 2 casas decimais + toggle Cohort/Produtividade em destaque)

**O que mudou:**

1. **Faturamento e investimento com 2 casas decimais** — `fmtCurrency` alterado em `TrafegoTab.tsx` e `AquisicaoTab.tsx` para usar `minimumFractionDigits: 2, maximumFractionDigits: 2`. Afeta KPIs de Investimento, Faturamento, Caixa e custo-por-etapa na matriz.

2. **Toggle Cohort/Produtividade movido para o topo** — agora aparece ACIMA dos filtros de data, em um card destacado (`rounded-xl`, `border 1.5px var(--ghost)`, `bg var(--mist)`). Botões maiores (`px-4 py-2 text-sm font-semibold`) com borda gold no ativo. Explicação contextual abaixo dos botões muda conforme o modo selecionado.

**Padrão documentado:**
- Toggle Cohort/Produtividade deve ser SEMPRE o primeiro elemento interativo do painel, acima de qualquer filtro
- Design: card `var(--mist)` com borda `var(--ghost)`, botões `text-sm font-semibold`, explicação `text-xs` abaixo
- Textos: Cohort = "agrupa leads pela data em que foram gerados..." / Produtividade = "agrupa eventos pela data em que ocorreram..."

**Arquivos:** `TrafegoTab.tsx`, `AquisicaoTab.tsx`

---

### 2026-03-23 (🔧 FIX: critério de "venda fechada" = data_pagamento_entrada)

**Problema:** O lead Jaques Grinberg (jaques.jgc@gmail.com) aparecia como "venda fechada" em março porque tinha `oportunidades.data_fechado = 2026-03-23`. Porém, `vendas_fechamento.data_pagamento_entrada = NULL` — sem pagamento confirmado. O critério correto para contar uma venda é `data_pagamento_entrada` preenchida, não apenas `data_fechado`.

**O que mudou:**

Tipo `RevenueRow` (useTrafego.ts):
- Adicionado campo `data_pagamento_entrada: string | null`

Helper `buildPaymentDateMap` (useTrafego.ts):
- Nova função que constrói `Map<oppId, data_pagamento_entrada>` — só inclui opps com pagamento confirmado

Funções puras atualizadas:
- `computeFunnel()` — aceita `paymentDateMap?` para contar fechados por pagamento
- `computeAvgCycle()` — aceita `paymentDateMap?` para usar data de pagamento no cálculo
- `computeProducao()` (useProducao.ts) — agrupa "Fechados" por `data_pagamento_entrada` do mês (não `data_fechado`)
- `useCohort` — conta fechados via `paymentDateMap.has(oppId)`

Queries atualizadas (`.select()` inclui `data_pagamento_entrada`):
- `useTrafego.ts` (2 queries)
- `useAquisicao.ts`
- `useProducao.ts`
- `usePreVendas.ts` (2 queries)
- `goals/service.ts`
- `AquisicaoTab.tsx` (inline producao)

Tabs atualizadas:
- `TrafegoTab.tsx` — KPI rates, avgCycle, avgCycleSales, click "Fechados"
- `AquisicaoTab.tsx` — mesmas correções

Documentação:
- `docs/CONCEITOS-NEGOCIO.md` — regra de "venda fechada" explicitada

**Regra resultante:** Sem `data_pagamento_entrada` preenchida → lead NÃO aparece como venda em nenhum painel.

---

### 2026-03-23 (📊 Novo módulo: Aquisição)

**Contexto:** O módulo Tráfego mostra apenas tráfego pago. A equipe precisa de uma visão unificada de TODAS as fontes (pago, orgânico, direto, desconhecido) com filtros hierárquicos por origem.

**O que mudou:**

Arquivos criados:
- `eb-dash2/src/hooks/useAquisicao.ts` — hook de dados sem filtro paid-only, com hierarquia utm_origins → assignments → channels
- `eb-dash2/src/pages/aquisicao/AquisicaoPage.tsx` — page wrapper com tab navigation
- `eb-dash2/src/pages/aquisicao/tabs/AquisicaoTab.tsx` — tab principal com filtros, KPIs, matrizes cohort/produtividade, segmentos, perdidos, prazo médio

Arquivos modificados:
- `eb-dash2/src/App.tsx` — rota `/aquisicao` + redirect padrão mudou de `/trafego` para `/aquisicao`
- `eb-dash2/src/components/layout/Sidebar.tsx` — item "Aquisição" adicionado acima de Tráfego
- `eb-dash2/src/components/layout/DashboardLayout.tsx` — labels de breadcrumb

**Features:**
- Filtros hierárquicos: Origem (utm_origins) → Sub-categoria (assignments) → Canal (utm_sources + utm_sources_plain)
- Canal pode ser selecionado independentemente
- Leads sem utm_source aparecem como "Desconhecido"
- KPIs exclusivos: Taxa de conversão, no-show, comparecimento, recebimento
- Investimento e ROAS condicionais (só quando filtro inclui tráfego pago)
- Toggle Cohort/Produtividade afeta todos os dados
- Matrizes, segmentos, motivos de perda e prazo médio idênticos ao Tráfego

---

### 2026-03-23 (🎛️ Metas: edição removida dos painéis operacionais)

**Contexto:** após a criação do módulo `/metas`, Tráfego, Pré-Vendas e Recuperação ainda mantinham botões e modais locais para editar meta. Isso deixava a governança contraditória: o módulo `Metas` era a fonte central, mas a escrita ainda estava espalhada.

**O que mudou:**
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
  - remove a capacidade de editar metas pelos cards de MQL e custo/MQL
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx`
  - deixa a aba de SDRs em modo leitura para metas
- `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`
  - remove edição inline da meta global e das metas por SDR
  - remove textos que sugeriam edição local
- `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx`
  - herda o mesmo comportamento somente leitura da aba compartilhada de SDRs
- `eb-dash2/src/components/metas/MetaMqlCountCard.tsx`
  - card de meta de MQL passa a ser somente leitura
- `eb-dash2/src/components/metas/MetaChartCard.tsx`
  - card de custo/MQL passa a ser somente leitura
- `eb-dash2/src/hooks/useMetas.ts`
  - adaptador legado passa a expor somente leitura
- `eb-dash2/src/components/metas/MetaPeriodEditorDialog.tsx`
  - removido por ficar sem uso

**Regra resultante:**
- criar/editar metas: somente em `/metas`
- painéis operacionais: apenas leitura da meta ativa e do acompanhamento

**Validação local:**
- `npm --prefix eb-dash2 run build` ✅
- `npx eslint` focado nos arquivos alterados ✅

---

### 2026-03-23 (🐛 Fix: campos financeiros sumiram da aba Dados do LeadCard)

**Contexto:** Ao refatorar a aba "Dados" do LeadCard para suportar a nova seção "Aplicação" (respostas do formulário via webhook), os campos `faturamento_anual`, `situacao_atual` e `situacao_investimentos` foram removidos acidentalmente da view — esses campos não foram incluídos nos `APPLICATION_FIELDS` nem na seção "Qualificação Complementar".

**O que mudou:**
- `eb-dash2/src/components/leads/LeadCard.tsx`: adicionados de volta os campos `faturamento_anual`, `situacao_atual` e `situacao_investimentos` à seção "Qualificação Complementar" do `DadosTab`
- `hasComplementar` atualizado para incluir os 3 novos campos na lógica de exibição condicional

**Arquivo modificado:** `eb-dash2/src/components/leads/LeadCard.tsx`

---

### 2026-03-23 (🐛 Fix: leads humanos em "Aguardando Resposta do SDR" com ghl_source='api')

**Contexto:** Leads como `cobiak_sp@hotmail.com` apareciam erroneamente no painel "Aguardando Resposta do SDR" mesmo após o time ter enviado SMS manualmente. A causa: o filtro de outbound usava `ghl_source.eq.app`, mas mensagens enviadas via integração GHL API chegam com `ghl_source='api'` — eram descartadas, fazendo o inbound anterior parecer a última mensagem.

**O que mudou:**
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` linha 415: filtro de outbound expandido de `ghl_source.eq.app` para `channel.in.(call,whatsapp,sms)` + `ghl_source.in.(app,api)`
- SMS/WhatsApp/call enviados por humano via app GHL (`app`) ou API GHL (`api`) agora contam como resposta válida
- Mensagens de workflow/IA (`ghl_source='workflow'`) continuam excluídas — há 366 WhatsApp outbound de automação na base

**Arquivo modificado:** `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx`

---

### 2026-03-23 (🧭 Módulo `Metas` unificado com histórico, catálogo e snapshots)

**Contexto:** as metas estavam fragmentadas em cards locais de Tráfego e Pré-Vendas. Faltava um módulo central para cadastrar metas por área, acompanhar histórico, suportar cohort e produtividade no mesmo domínio e preparar futuras áreas como `Vendas`.

**O que mudou:**
- novo módulo `/metas` com 4 visões:
  - `overview`
  - `tracking`
  - `registry`
  - `history`
- novo domínio Supabase para metas:
  - `goal_metric_definitions`
  - `goal_definitions`
  - `goal_versions`
  - `goal_snapshots`
- backfill automático da tabela legada `metas` para o novo domínio
- hook novo `useGoalsModule` para:
  - carregar catálogo de indicadores
  - carregar metas por workspace
  - calcular performance
  - gravar snapshots da meta vigente
- `useMetas` deixou de gravar direto em `metas` e virou adaptador legado para os cards antigos

**Indicadores já suportados:**
- Tráfego:
  - MQLs
  - Custo por MQL
- Pré-Vendas:
  - Agendamentos
  - Tempo médio de resposta
- Vendas:
  - Fechamentos
  - Faturamento fechado

**Regras importantes:**
- cada indicador declara `analysis_mode` (`cohort` ou `produtividade`)
- cada meta guarda sua vigência própria
- versões não podem se sobrepor no mesmo indicador + escopo
- o módulo calcula `ideal/dia` para métricas cumulativas
- `cost_per_mql` calcula teto diário de custo quando existe meta pareada de MQL no mesmo escopo e vigência

**Implementação:**
- migration `20260324110000_create_goals_module.sql`
- novos arquivos:
  - `eb-dash2/src/pages/goals/GoalsPage.tsx`
  - `eb-dash2/src/hooks/useGoalsModule.ts`
  - `eb-dash2/src/lib/goals/*`
  - `eb-dash2/src/components/goals/*`
- navegação:
  - nova rota `/metas`
  - novo item na sidebar
  - breadcrumbs atualizados

**Validação local:**
- `npm --prefix eb-dash2 run build` ✅
- `npx eslint` focado nos arquivos alterados da trilha de metas ✅

### 2026-03-23 (♻️ Módulo Recuperação — gêmeo de Pré-Vendas)

**Contexto:** O pipeline "Recuperação" (`PIPELINE_RECUPERACAO_ID`) contém leads antigos reativados. Antes, esses leads eram excluídos do módulo Pré-Vendas e não tinham nenhum módulo dedicado.

**O que mudou:**
- Novo módulo `/recuperacao` que exibe **somente** leads do pipeline Recuperação
- Pré-Vendas **continua excluindo** leads de Recuperação
- Os dois módulos compartilham 100% do código de UI (tabs, componentes) — são **gêmeos**

**Implementação:**
- `eb-dash2/src/hooks/usePreVendas.ts` — adicionado parâmetro `pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'` (default: `exclude_recuperacao`); aplica `.neq()` ou `.eq()` em pipeline_id conforme o modo
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` — adicionada prop `pipelineMode` com mesmo efeito nas queries internas dos dois quadrantes
- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — passa `pipelineMode='exclude_recuperacao'` explicitamente
- `eb-dash2/src/pages/recuperacao/RecuperacaoPage.tsx` — **criado** — clone mínimo de PreVendasPage com `pipelineMode='only_recuperacao'` e título "Recuperação"
- `eb-dash2/src/App.tsx` — nova rota `/recuperacao`
- `eb-dash2/src/components/layout/Sidebar.tsx` — novo item "Recuperação" com ícone RefreshCw
- `eb-dash2/src/components/layout/DashboardLayout.tsx` — breadcrumb labels para `pre-vendas`, `recuperacao`, `geral`, `sdrs`, `leads_parados`

**Garantia "gêmeos":** qualquer mudança visual ou funcional nas tabs (`GeralTab`, `SDRsTab`, `LeadsParadosTab`) reflete automaticamente em ambos os módulos — não há código de UI duplicado.

---

### 2026-03-23 (🎯 Metas com vigência própria em Tráfego e SDRs)

**Problema:** as metas do dashboard estavam gravadas sem intervalo real e o cálculo de progresso/ideal acabava seguindo o filtro de data visível da página. Na prática, bastava mudar o filtro do painel para a leitura da meta ficar distorcida.

**Correção:**
- migration `20260324040000_add_period_range_to_metas.sql`
  - adiciona `periodo_inicio` e `periodo_fim` em `metas`
  - troca a unicidade antiga por vigência explícita
  - bloqueia sobreposição de metas do mesmo `workspace + tipo + referencia`
- `eb-dash2/src/hooks/useMetas.ts`
  - passa a salvar valor + intervalo
  - expõe seleção da meta ativa por vigência
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
  - cards de meta passam a carregar um dataset dedicado para o período salvo da meta
  - `Meta de MQLs` usa sempre o período salvo da meta
  - `Custo por MQL` ganhou `ideal-dia de custo`
  - o `ideal-dia de custo` usa a meta de MQL do mesmo período como base de orçamento
- `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`
  - meta global e metas por SDR agora aceitam intervalo próprio
  - progresso/ideal deixam de depender do filtro de data da página
- novos componentes:
  - `MetaPeriodEditorDialog.tsx`
  - atualização dos cards `MetaMqlCountCard.tsx` e `MetaChartCard.tsx`

**Resultado:**
- a meta não é mais reescalada pelo filtro de data da tela
- cada card mostra a vigência real que está usando
- o usuário consegue definir meta para qualquer intervalo

**Validação local:**
- `npm --prefix eb-dash2 run build` ✅
- `npx eslint` focado apenas nos arquivos alterados da feature ✅
- `npm --prefix eb-dash2 run lint` continua falhando por problemas antigos em arquivos fora desta entrega

### 2026-03-23 (🛠️ Pré-Vendas: hardening de `Leads Parados` para contatos bloqueados e `Recuperação`)

**Problema:** o quadrante `Aguardando Resposta do SDR` podia mostrar contatos que não deveriam estar na fila operacional. O caso que expôs o bug foi `chrisrodriguessilva@icloud.com`: a última inbound relevante era `Não, bloquear`, o contato já tinha tag `bloquear`, e as oportunidades ativas estavam apenas no pipeline `Recuperação`, que por regra do sistema não entra em pré-vendas.

**Correção:**
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx`
  - passou a excluir `pipeline_id = PIPELINE_RECUPERACAO_ID` também na aba `Leads Parados`
  - passou a ignorar opps com `data_perdido` ou `data_fechado`
  - passou a remover contatos com tag `bloquear` tanto do quadrante `Não Respondem` quanto de `Aguardando Resposta do SDR`

**Impacto:** a aba deixa de sugerir ação comercial em leads que já pediram bloqueio, que já saíram do fluxo, ou que pertencem apenas ao pipeline `Recuperação`.

**Validação local:**
- reprodução do caso `chrisrodriguessilva@icloud.com`: a query de comunicações relevantes ainda encontra a inbound `Não, bloquear`, mas a query de oportunidades elegíveis agora retorna `0` linhas para o contato, então ele deixa de aparecer na lista
- `git diff --check -- eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx docs/ROADMAP.md docs/MUDANCAS.md CLAUDE.md` ✅

### 2026-03-23 (🎨 UI: Matriz Cohort de Pré-Vendas com a mesma estética do cohort de Tráfego)

**Mudança:**
- a tabela cohort da aba `Pré-Vendas > Visão Geral` recebeu o mesmo acabamento visual usado no cohort da aba `Tráfego`
- foram alinhados tipografia, padding, densidade visual, cabeçalho, hover das linhas, destaque dos números e rodapé de médias
- nenhuma regra de negócio foi alterada: conteúdo, colunas, cliques, filtros, cálculos e modal continuam iguais

**Arquivo alterado:**
- `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`

**Validação local:**
- `git diff --check -- eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx` ✅
- `npm --prefix eb-dash2 run build` continua bloqueado por erros TypeScript preexistentes em `src/pages/dashboard/tabs/TrafegoTab.tsx` e `src/pages/prevendas/PreVendasPage.tsx`

### 2026-03-23 (🎯 UI: mover `No-shows pendentes` para `Leads Parados`)

**Mudança:**
- o bloco `No-shows pendentes` saiu do `AlertasCard` da aba `Visão Geral`
- foi criado um card próprio, `NoShowsPendentesCard`, no topo da aba `Leads Parados`
- a experiência existente foi preservada: contador, lista resumida, modal com todos os no-shows e clique em linha abrindo `LeadCard`
- o `AlertasCard` passou a mostrar apenas `Reuniões nas próximas 48h` e `Leads >30d em pré-vendas`

**Arquivos alterados:**
- `eb-dash2/src/components/prevendas/AlertasCard.tsx`
- `eb-dash2/src/components/prevendas/NoShowsPendentesCard.tsx`
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx`
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`
- `docs/MUDANCAS.md`
- `CLAUDE.md`

**Validação local:**
- `npm --prefix eb-dash2 run build` não concluiu por erros TypeScript preexistentes em `src/pages/dashboard/tabs/TrafegoTab.tsx` e `src/pages/prevendas/PreVendasPage.tsx`

### 2026-03-23 (🛠️ Hardening do Painel Cohort de Tráfego)

**Correções implementadas na branch de auditoria:**
- `eb-dash2/src/hooks/useTrafego.ts`
  - paginação de `oportunidades` agora usa ordenação estável por `data_lead_recebido` + `id`
  - filtro `Campanha Meta` sem mapeamento em `utm_campaigns` deixa de manter leads genéricos; o cohort é zerado por segurança
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
  - aviso explícito quando a campanha Meta filtrada não tem mapeamento no CRM

**Resultado:**
- corrige o risco de paginação não determinística no cohort
- elimina o desalinhamento silencioso entre spend filtrado e cohort genérico em `Campanha Meta`
- mantém o painel honesto sem misturar métricas de universos diferentes

**Validação local:** `npm run build` em `eb-dash2` ✅

### 2026-03-23 (✨ UI: LeadCard com tags, SDR/Closer e respostas da aplicação)

**Problema:** o `LeadCard` já tinha alguns dados do contato, mas a leitura comercial ainda estava fragmentada. As tags não ficavam em destaque, o closer associado não era exibido a partir do `contatos`, e as respostas da aplicação apareciam espalhadas em blocos genéricos em vez de ficarem agrupadas como perguntas e respostas.

**Correção:**
- `eb-dash2/src/hooks/useLeads.ts` passou a selecionar também `contatos.closer_name` e `contatos.closer_email` no detalhe do lead
- `eb-dash2/src/hooks/useTrafego.ts` foi atualizado para tipar `closer_name` e `closer_email` no objeto `contatos`
- o cabeçalho do `LeadCard` agora mostra:
  - resumo do SDR (`owner_name` / `owner_email`)
  - resumo do Closer (`closer_name` com fallback para `oportunidades.vendedor_closer`)
  - tags do lead com `parseTags()` para tratar CSV e JSON array com segurança
- a aba `Dados` ganhou uma seção nova de **Aplicação**, exibindo as respostas em formato explícito de pergunta/resposta para os campos pedidos:
  - `contact.perfilinsta`
  - `contact.descricao_seu_negocio_atual`
  - `contact.ja_fez_treinamento_mkt_digital`
  - `contact.resultados_6meses_redes_sociais`
  - `contact.qual__o_seu_plano_para_atingir_esta_meta`
  - `contact.fale_os_3_principais_obstculos_que_esto_impedindo_voc_de_atingir_as_metas_acima`
  - `contact.quanto_tempo_usa_internet_para_crescer_negocio`
  - `contact.ocupacao_contato`
  - `contact.objetivo_contato`
  - `contact.qual_dessas_opes_melhor_descreve_a_situao_atual_do_seu_negcio_em_termos_de_investimentos`
  - `contact.faturamento_anual`
  - `contact.comfirma_comprometimento`
  - `contact.perfeito_para_encerramos_me_diga_qual_o_seu_superheri_favorito`
- para respostas que nunca viraram coluna em `contatos`, o detalhe do lead agora faz um fallback **best-effort** no `webhooks_ghl`, usando a janela próxima do `date_created` do contato

**Importante:** esse fallback no webhook bruto depende de histórico disponível em `webhooks_ghl`. No ambiente atual, a janela acessível pelo app começa em **2026-03-13**, então leads mais antigos continuam mostrando apenas o que já foi desnormalizado em `contatos`.

**Arquivos alterados:**
- `eb-dash2/src/components/leads/LeadCard.tsx`
- `eb-dash2/src/hooks/useLeads.ts`
- `eb-dash2/src/hooks/useTrafego.ts`
- `docs/MUDANCAS.md`
- `docs/ROADMAP.md`
- `CLAUDE.md` (índice)

**Validação local:**
- `npm --prefix eb-dash2 run build` ✅

### 2026-03-23 (🧹 Limpeza de schema: remover `contatos.hashtags`)

**Problema:** a coluna `contatos.hashtags` continuava existindo no banco e ainda era selecionada no detalhe do lead, mas não fazia parte de nenhuma regra de negócio nem de nenhuma rotina atual de ingestão/sync do GHL.

**Verificação feita antes de remover:**
- busca no código confirmou uso apenas visual no `LeadCard`
- busca nas migrations/funções SQL confirmou que o backend não popula mais esse campo
- consulta no banco acessado pelo app retornou `0` linhas para `hashtags IS NOT NULL`
- consulta no banco acessado pelo app retornou `0` linhas para `hashtags = ''`

**Correção:**
- migration `20260324032000_drop_unused_hashtags_from_contatos.sql` remove a coluna `hashtags` de `contatos`
- `eb-dash2/src/components/leads/LeadCard.tsx` deixa de renderizar o bloco "Hashtags"
- `eb-dash2/src/hooks/useLeads.ts` deixa de selecionar `hashtags` no detalhe do lead
- `eb-dash2/src/hooks/useTrafego.ts` remove o campo do tipo `OppRow.contatos`

**Arquivos alterados:**
- `supabase/migrations/20260324032000_drop_unused_hashtags_from_contatos.sql`
- `eb-dash2/src/components/leads/LeadCard.tsx`
- `eb-dash2/src/hooks/useLeads.ts`
- `eb-dash2/src/hooks/useTrafego.ts`
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`
- `CLAUDE.md` (índice)

### 2026-03-23 (🔎 Fix: busca da aba Leads agora enxerga todas as páginas)

**Problema:** a busca da aba `Leads > Lista` só filtrava os `50` registros já carregados na página atual. Na prática, um lead que estivesse na página 5 "sumia" da pesquisa enquanto o usuário estivesse na página 1.

**Causa raiz:** o hook `eb-dash2/src/hooks/useLeads.ts` aplicava `search` e `utmSource` no cliente **depois** da query paginada (`.range(...)`). Isso quebrava dois pontos ao mesmo tempo:
- a busca não atravessava o conjunto completo de leads
- o contador `total` continuava refletindo o banco sem os filtros aninhados de `contatos`

**Correção:**
- a query da lista agora move `search` e `utmSource` para o Supabase antes da paginação
- quando existe filtro em campos de `contatos`, a seleção passa a usar `contatos!inner(...)`
- a busca textual agora roda no banco sobre `contatos.nome`, `contatos.email` e `contatos.utm_source`
- o `total` da paginação passa a refletir o conjunto realmente filtrado

**Arquivos alterados:**
- `eb-dash2/src/hooks/useLeads.ts`
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`
- `CLAUDE.md` (índice)

**Validação local:**
- `npm run build` em `eb-dash2` ✅
- `npm run lint` em `eb-dash2` continua falhando por erros preexistentes em vários arquivos fora deste ajuste

### 2026-03-23 (📋 Auditoria do Painel Cohort de Tráfego — documentação sem mudar a lógica)

**Motivação:** revisar se a lógica de cohort do painel de tráfego podia ser tratada como "perfeita" sem correr o risco de mexer no painel que já está operacional.

**Escopo auditado:**
- `eb-dash2/src/hooks/useTrafego.ts`
- `eb-dash2/src/hooks/useCohort.ts`
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
- `docs/PAINEL-TRAFEGO-PAGO.md`
- `docs/CONCEITOS-NEGOCIO.md`
- `docs/ANALISE-COHORT-MARCO-VS-GABARITO-MQLS.md`

**Conclusão registrada:**
- a lógica central do painel está **coerente** com o modelo de cohort atual
- **não** é correto chamar de "perfeita"
- existem **2 riscos técnicos conhecidos** ainda não corrigidos:
  - paginação de `oportunidades` com `.range()` e ordenação apenas por `data_lead_recebido`
  - possível desalinhamento entre spend e cohort no filtro `Campanha Meta` quando falta mapeamento em `utm_campaigns`

**Documentação criada/atualizada:**
- novo documento: `docs/AUDITORIA-COHORT-PAINEL-TRAFEGO-2026-03-23.md`
- `docs/PAINEL-TRAFEGO-PAGO.md`
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`
- `CLAUDE.md` (índice)

**Importante:** esta etapa **não alterou código de produção** do painel. A decisão foi documentar primeiro e deixar qualquer hardening de lógica para uma etapa separada.

**Validação local:** `npm run build` em `eb-dash2` concluiu com sucesso.

### 2026-03-22 (🔁 OpenClaw so confirma entrega depois da resposta real)

**Problema:** mesmo com o trigger corrigido, um lead novo ainda podia "nao aparecer" no OpenClaw. O banco marcava `openclaw_notificado_em` logo depois de `net.http_post()`, ou seja, tratava fila assíncrona como sucesso definitivo.

**Causa raiz:** `pg_net` so devolve `request_id` no enqueue. A resposta HTTP real vem depois em `net._http_response`. Se o OpenClaw falhasse ou demorasse, a oportunidade ficava travada como "ja enviada" mesmo sem confirmacao.

**Correção:** Migration `20260324030000_make_openclaw_delivery_confirmed_and_retryable.sql`
- adiciona colunas operacionais em `oportunidades`:
  - `openclaw_request_id`
  - `openclaw_enfileirado_em`
  - `openclaw_ultima_resposta_em`
  - `openclaw_ultimo_status_code`
  - `openclaw_ultimo_erro`
- `processar_notificacao_openclaw_contrato_assinado()` agora so marca sucesso depois de resposta `2xx`
- cria `sincronizar_status_openclaw_contrato_assinado()` para fechar o ciclo entre `request_id` e resposta
- cria `reenfileirar_openclaw_contrato_assinado_pendentes()` para retry seguro
- cria cron SQL `openclaw-contrato-assinado-retry` rodando todo minuto
- cria `listar_openclaw_respostas_recentes()` para diagnostico pelo proprio banco

**Validação remota em 2026-03-22 22:21 BRT:**
- migration aplicada no projeto Supabase remoto
- `sincronizar_status_openclaw_contrato_assinado(20)` respondeu `200` com todos os contadores em `0`
- `processar_openclaw_contrato_assinado_job()` respondeu `200`
- nao havia `openclaw_request_id` preso no banco no momento da validacao

**Resultado esperado:** o sistema para de mentir que "enviou". Agora ele so confirma sucesso quando o OpenClaw realmente responde, e qualquer falha volta para retry automatico.

**Ajuste complementar em 2026-03-22 22:28 BRT:** durante o reteste controlado no lead fake `testewfgdfb@teste.xxocom`, o request `19178` falhou com `Timeout of 5000 ms reached`. Isso mostrou que a confiabilidade do fluxo ainda dependia de um timeout maior no `pg_net`.

**Correção complementar:** Migration `20260324031000_increase_openclaw_timeout_to_30s.sql`
- aumenta `timeout_milliseconds` para `30000`
- mantém o mesmo fluxo de confirmacao + retry da migration anterior
- reteste no mesmo lead fake resultou em:
  - `request_id = 19180`
  - `status_code = 200`
  - `openclaw_notificado_em` preenchido
  - resposta do endpoint com `{"ok":true,...}`

### 2026-03-24 (🧷 Backfill: contratos antigos já assinados não devem reenviar ao editar)

**Problema:** depois da implantação da trava `oportunidades.openclaw_notificado_em`, contratos históricos que já tinham sido assinados antes dessa mudança ainda estavam com a trava nula. Ao editar a oportunidade depois, o sistema podia reenviar para o OpenClaw.

**Causa raiz:** faltava uma marcação retroativa de idempotência para oportunidades antigas que já tinham `op_link_do_contrato_assinado` em `vendas_fechamento`.

**Correção:** Migration `20260324020000_backfill_openclaw_notificado_historico.sql`
- marca `openclaw_notificado_em` para oportunidades com link de contrato
- exige também `Assinada` no pipeline `Vendas SQL` ou `data_da_assinatura_do_contrato` preenchida
- evita marcar leads ainda não assinados com link genérico/ruim

**Resultado esperado:** editar uma oportunidade antiga já assinada não dispara um segundo webhook para o OpenClaw.

---

### 2026-03-20 (🩹 Fechada a janela residual entre `processed_at` e `handled_at` nas opps GHL)

**Problema:** durante a auditoria final dos crons, apareceu uma pendência residual de `1` oportunidade
com `pipeline_id` e `data_lead_recebido` nulos, mesmo com jobs já marcados como `done` em
`ghl_api_jobs`.

**Causa raiz:** `sync-opp-dates` e `sync-opp-pipelines` drenavam jobs concluídos só no começo da
request. Se o `ghl-api-worker` terminasse o job durante a própria execução da edge, o resultado só
seria aplicado no próximo cron.

**Implementação:**

- `supabase/functions/sync-opp-dates/index.ts`
  - adiciona segundo `drainCompletedJobs()` no fim da request
  - soma os contadores do drain inicial e final na resposta
- `supabase/functions/sync-opp-pipelines/index.ts`
  - adiciona segundo `drainCompletedJobs()` no fim da request
  - soma os contadores do drain inicial e final na resposta
- `scripts/audit-ghl-sync-health.js`
  - adiciona `ghl_api_jobs.terminal_unhandled`
  - adiciona `ghl_api_jobs.latest_terminal_unhandled`

**Validação real em produção (`2026-03-20 23:07 BRT`):**

- deploy concluído de `sync-opp-dates` e `sync-opp-pipelines`
- `ghl-api-worker` processou `3` jobs reais: `{"processed":3,"succeeded":3,"retried":0,"dead":0,"stale_requeued":0}`
- `sync-opp-pipelines` reaplicou os `3` jobs e respondeu:
  - `processed_jobs = 3`
  - `updated = 3`
  - `remaining = 0`
  - `queue_pending = 0`
- `sync-opp-dates` respondeu com `remaining = 0`
- audit final:
  - `pipeline_id_null = 0`
  - `pipeline_name_null_com_pipeline = 0`
  - `data_lead_recebido_null = 0`
  - `ghl_api_jobs pending = 0`
  - `ghl_api_jobs processing = 0`

**Leitura operacional:** não havia erro de cron. O resíduo era uma janela curta entre worker e
caller, agora fechada na mesma invocação.

### 2026-03-20 (⚡ Vazão do sync-contact-opportunities aumentada sem depender de alterar o cron SQL)

**Problema:** a `contact_opp_sync_queue` não estava quebrada, mas o consumo era baixo demais para rajadas grandes de `ContactCreate`.

- estado observado antes do ajuste: `pending = 7214`, `processing = 0`, `error = 0`
- idade do item mais antigo: ~`11,28h`
- vazão teórica antiga: `20 contatos` a cada `5 min` = ~`240 contatos/h`
- ETA antiga para `6985` pendências: ~`29,1h`

**Implementação:**

- `supabase/functions/sync-contact-opportunities/index.ts`
  - lote efetivo padrão sobe para `50`
  - nova opção `max_batches` com default `2`
  - nova opção `exact_batch_size=true` para testes pequenos
  - cada execução agora processa até `2` batches com limite de tempo (~`110s`)
  - resposta da função passa a expor `batches_run`, `batch_size`, `max_batches`, `elapsed_ms` e `stopped_by_time_limit`

**Validação manual em produção:**

- medição 1: `batch_size=20` antigo → `16,43s`, `done=20/20`, `errored=0`
- medição 2: `batch_size=50` → `45,23s`, `done=50/50`, `errored=0`
- validação final com payload legado do cron `{"batch_size":20,"stale_after_minutes":30}`:
  - `processed = 100`
  - `batches_run = 2`
  - `batch_size = 50`
  - `done = 100`
  - `retried = 0`
  - `errored = 0`
  - `elapsed_ms = 85844`
  - `remaining = 6985`

**Resultado operacional:**

- backlog caiu de `7105` para `6985` durante a validação
- `processing` voltou para `0`
- vazão teórica nova: ~`1200 contatos/h`
- ETA nova para `6985` pendências sem entrada adicional: ~`5,82h`

---

### 2026-03-20 (🚦 Fila GHL central entrou em produção para opp dates, pipelines e tags)

**Objetivo:** parar de depender de rate limit local por função e colocar `sync-opp-dates`, `sync-opp-pipelines` e `sync-contact-tags` no mesmo funil operacional do GHL.

**Implementação:**

- novo helper compartilhado `supabase/functions/_shared/ghl-api-queue.ts`
- `supabase/functions/sync-opp-dates/index.ts`
  - passa a drenar jobs `done` / `dead` de `ghl_api_jobs`
  - passa a enfileirar `GET /opportunities/{id}`
  - aplica `opportunity.createdAt` no banco e marca `handled_at`
- `supabase/functions/sync-opp-pipelines/index.ts`
  - passa a enfileirar `GET /opportunities/{id}`
  - aplica `pipelineId` / `pipelineName` após o worker processar
- `supabase/functions/sync-contact-tags/index.ts`
  - passa a enfileirar `GET /contacts/{id}`
  - aplica `tags` após o worker processar
- `supabase/functions/ghl-api-worker/index.ts`
  - reclaim de jobs stale via `requeue_stale_ghl_api_jobs()`
  - suporte a `context`, `claimed_at`, `handled_at`
  - `401/403` vão para `dead`
  - `404` e `400` com `"Contact not found"` viram `done` com `_meta.not_found`
- migration `20260324000000_harden_ghl_api_queue_and_fix_conversations_cron.sql`
  - endurece a fila central
  - alinha wrapper SQL de `sync-ghl-conversations-incremental`

**Validação manual em produção:**

- `sync-opp-dates` + `ghl-api-worker` + `sync-opp-dates` drenaram oportunidades reais até `data_lead_recebido IS NULL = 0`
- `sync-opp-pipelines` + `ghl-api-worker` + `sync-opp-pipelines` drenaram oportunidades reais até `pipeline_id IS NULL = 0`
- `sync-contact-tags` + `ghl-api-worker` + `sync-contact-tags` drenaram contatos reais até `contatos.tags IS NULL = 0`
- snapshot final:
  - `ghl_api_jobs pending = 0`
  - `ghl_api_jobs processing = 0`
  - último sync de conversas: `success`, `messages_upserted = 3440`

**Nota operacional:** dois jobs `dead` antigos de `sync-contact-tags` permanecem como histórico de auditoria, mas já estão tratados com `handled_at` e não geram retry.

---

### 2026-03-24 (🐛 Fix crítico: drag para "Assinada" voltou a disparar OpenClaw)

**Bug reportado pelo usuário:** ao arrastar os cards no GHL, nada acontecia no OpenClaw.

**Causa raiz:** sobrava no banco o trigger `tr_zz_notify_openclaw_assinada` em `webhooks_ghl`, mas a função `notify_openclaw_contrato_assinado()` foi sobrescrita depois para uso em `vendas_fechamento`. Na prática, o drag do card chamava uma função incompatível com o registro `NEW` de `webhooks_ghl`.

**Causa raiz complementar:** o sistema também ficou dependente demais da ordem dos eventos:
- `link → Assinada`
- `Assinada → link`

**Correção:** Migration `20260324010000_fix_openclaw_stage_and_link_order.sql`
- Criado helper central `processar_notificacao_openclaw_contrato_assinado()`
- Trigger `tr_notify_openclaw_contrato_assinado` em `vendas_fechamento` continua existindo, mas agora só envia se o link entrou e a oportunidade já está em `Assinada`
- Trigger `tr_zz_notify_openclaw_assinada` em `webhooks_ghl` foi recriado com função própria: `notify_openclaw_contrato_assinado_por_stage()`
- Ao entrar em `Assinada`, o sistema busca o link no webhook atual ou em webhooks anteriores da mesma oportunidade
- Idempotência centralizada em `oportunidades.openclaw_notificado_em`

**Resultado esperado:**
- Se o link vier antes do drag, o drag dispara
- Se o drag vier antes do link, a entrada do link dispara
- Uma vez notificado, não duplica

---

### 2026-03-23 (✨ Simplificação: trigger sem restrição de stage para link do contrato)

**Decisão:** Removida toda condição de pipeline/stage do trigger. O processo operacional garantiria a regra.

**Migration:** `20260323201000_simplify_trigger_remove_stage_condition.sql`

**Status posterior:** premissa quebrada em produção. A simplificação foi superada pela migration `20260324010000_fix_openclaw_stage_and_link_order.sql`.

---

### 2026-03-23 (✨ Regra: link do contrato ativado pelo stage "Assinada", busca em webhooks anteriores) *(substituída)*

**Requisito:** link e data de assinatura só devem ser registrados quando a oportunidade entra no estágio "Assinada" / pipeline "Vendas SQL". O link pode ter sido preenchido antes da movimentação de stage.

**Implementação:** Migration `20260323180000_fix_trigger_assinada_busca_link.sql`
- Trigger só processa link/data_assinatura quando `pipeline_id = 'ZWuCjEXM2VDyLCx8CtGU'` E `pipleline_stage = 'Assinada'`
- Busca em 2 etapas: (1) webhook atual, (2) webhooks anteriores da mesma oportunidade
- Dados financeiros: sem restrição de stage

*(Migration 20260323170000 substituída — tinha o problema de exigir que link e stage chegassem no mesmo webhook)*

**Nota técnica:** campo de stage no payload do GHL tem typo: `pipleline_stage` (duplo "pi") — confirmado via `jsonb_object_keys` em 26.834 webhooks.

---

### 2026-03-23 (🐛 Fix: `op_link_do_contrato_assinado` não populava — guard do trigger muito restritivo)

**Causa raiz:** O trigger ignorava qualquer webhook sem dados financeiros (`valor_entrada`, `numero_parcelas`, etc.). O webhook do OpenClaw — que traz o link do contrato assinado — chega **separado e sem dados financeiros**. Resultado: link sempre NULL.

**Correção:** Migration `20260323150000_fix_trigger_guard_e_backfill_link_contrato.sql`
- Condição de guarda ampliada: ignora só se TODOS os campos relevantes (incluindo `link_contrato` e `data_assinatura`) forem NULL
- Backfill: 45 registros corrigidos com link e/ou data_assinatura

---

### 2026-03-23 (🐛 Fix: `op_vencimentos_parcelas` não populava — chave errada)

**Causa raiz:** Trigger usava `{{ opportunity.op_vencimentos_e_parcelas }}` com espaços. GHL envia sem espaços: `{{opportunity.op_vencimentos_e_parcelas}}` (confirmado via 14.283 webhooks reais).

**Correção:** Migration `20260323100000_fix_op_vencimentos_parcelas_key.sql`
- Função `extrair_vendas_fechamento_do_webhook()` corrigida com chave sem espaços
- Backfill: 13 registros corrigidos — 0 pendências

**Documentação:** `docs/VENDAS-FECHAMENTO.md` atualizado (tabela + bugs históricos)

---

### 2026-03-23 (🆕 Payload OpenClaw: campo `data_assinatura_contrato` adicionado)

**Contexto:** O campo `data_da_assinatura_do_contrato` foi adicionado à tabela `vendas_fechamento` em `20260323080000`, mas não estava incluído no payload enviado ao OpenClaw.

**Correção:** Migration `20260323090000_add_data_assinatura_ao_payload_openclaw.sql`
- Função `notify_openclaw_contrato_assinado()` recriada com `CREATE OR REPLACE`
- Campo `data_assinatura_contrato` adicionado ao JSON entre `link_contrato_assinado` e `vencimentos_parcelas`
- Tipo: `DATE` — sem timezone. Serializado com `TO_CHAR(NEW.data_da_assinatura_do_contrato, 'DD/MM/YYYY')` (sem `AT TIME ZONE`)
- Valor `null` quando campo não preenchido (sem backfill histórico)

**Documentação:** `docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md` atualizado com campo na tabela de datas, estrutura JSON e exemplo real.

---

### 2026-03-23 (🐛 Fix: datas do webhook OpenClaw em DD/MM/AAAA fuso BRT)

**Problema:** Datas enviadas ao OpenClaw estavam em ISO 8601 (UTC) — formato e fuso errados.

**Correção:** Migration `20260323070000_fix_datas_dd_mm_aaaa_openclaw.sql`
- `timestamp` → `TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')` → ex: `"23/03/2026 17:15"`
- `data_pagamento_entrada` → `TO_CHAR(... AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')` → ex: `"06/03/2026"`
- Fuso: `America/Sao_Paulo` conforme `docs/PADRAO-TIMEZONE.md`

---

### 2026-03-23 (🆕 Novo campo: data_da_assinatura_do_contrato em vendas_fechamento)

**Contexto:** O GHL vai começar a enviar a data de assinatura do contrato no campo `{{opportunity.data_da_assinatura_do_contrato}}`. O sistema foi preparado para capturar esse campo automaticamente via webhook e exibi-lo na aba Financeiro do LeadCard, dentro da seção "Contrato".

**Chave GHL confirmada pelo usuário:** `{{opportunity.data_da_assinatura_do_contrato}}` — **sem espaços**, igual ao padrão do link do contrato.

**Tipo DATE** (não TIMESTAMPTZ) — data de assinatura não carrega hora. Exibido no frontend como `DD/MM/YYYY` via `fmtDate()`.

**Entregas:**
- `supabase/migrations/20260323080000_add_data_assinatura_to_vendas_fechamento.sql`
  - `ALTER TABLE vendas_fechamento ADD COLUMN IF NOT EXISTS data_da_assinatura_do_contrato DATE`
  - Atualização completa da função `extrair_vendas_fechamento_do_webhook()` com extração do novo campo
  - `ON CONFLICT DO UPDATE` inclui o campo com `COALESCE` (não sobrescreve data existente com NULL)
- `eb-dash2/src/hooks/useLeads.ts` — campo adicionado à interface `VendasFechamento` + SELECT
- `eb-dash2/src/components/leads/LeadCard.tsx` — nova linha "Data de assinatura" na seção "Contrato" da aba Financeiro

**⚠️ Sem backfill** — campo não existe em nenhum webhook histórico. Exibirá "—" até o GHL enviar.

**Migration:** `20260323080000_add_data_assinatura_to_vendas_fechamento.sql`

---

### 2026-03-23 (🔔 Webhook OpenClaw: notificação automática de contrato assinado)

**Contexto:** Quando `op_link_do_contrato_assinado` em `vendas_fechamento` transita de NULL para preenchido, o OpenClaw precisa ser notificado automaticamente para processar o contrato.

**Implementação:**
- Trigger `tr_notify_openclaw_contrato_assinado` — AFTER INSERT OR UPDATE em `vendas_fechamento`
- Função `notify_openclaw_contrato_assinado()` — verifica transição NULL → NOT NULL (idempotente)
- HTTP POST via `pg_net` (assíncrono — não bloqueia a transação)
- Envia todos os dados da aba Financeiro do LeadCard + dados do contato/oportunidade

**Idempotência:** só dispara UMA VEZ — quando o link chega pela primeira vez. Webhooks subsequentes sem o campo não reenviam (COALESCE no trigger principal preserva o valor).

**Destino:** `POST https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado`

**Migration:** `20260323060000_notify_openclaw_contrato_assinado.sql`
**Documentação completa:** `docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md`

---

### 2026-03-23 (🐛 Fix: seção Contrato sempre visível na aba Financeiro do LeadCard)

**Problema:** A seção "Contrato" só aparecia quando o link já estava preenchido. Quando NULL, sumia sem mostrar nenhum indicador.

**Fix:** Removido o condicional — seção sempre renderiza. Quando o link é NULL exibe "—"; quando preenchido exibe link clicável "Abrir contrato assinado ↗".

**Arquivo:** `eb-dash2/src/components/leads/LeadCard.tsx` — função `FinanceiroTab`

---

### 2026-03-23 (🆕 Novo campo: op_link_do_contrato_assinado em vendas_fechamento)

**Contexto:** O GHL vai começar a enviar o link do contrato assinado (gerado pelo Open Claw ou similar) no campo `{{opportunity.op_link_do_contrato_assinado}}`. O sistema foi preparado para capturar esse campo automaticamente via webhook e exibi-lo na aba Financeiro do LeadCard.

**Chave GHL confirmada pelo usuário:** `{{opportunity.op_link_do_contrato_assinado}}` — **sem espaços**, diferente da maioria dos outros campos de contrato.

**Entregas:**
- `supabase/migrations/20260323050000_add_link_contrato_to_vendas_fechamento.sql`
  - `ALTER TABLE vendas_fechamento ADD COLUMN IF NOT EXISTS op_link_do_contrato_assinado TEXT`
  - Atualização completa da função `extrair_vendas_fechamento_do_webhook()` com o novo campo
  - `ON CONFLICT DO UPDATE` inclui o campo com `COALESCE` (não sobrescreve link existente com NULL)
- `eb-dash2/src/hooks/useLeads.ts` — campo adicionado à interface `VendasFechamento` + SELECT
- `eb-dash2/src/components/leads/LeadCard.tsx` — nova seção "Contrato" na aba Financeiro com link clicável (só aparece quando preenchido)

**⚠️ ATENÇÃO — Bug de deploy:** A coluna foi adicionada ao SELECT do TypeScript antes de rodar `supabase db push`. Se o frontend subiu antes da migration, a aba Financeiro mostrará "Sem dados de fechamento." **Solução: rodar `supabase db push` imediatamente.**

**Nenhum backfill necessário** — campo nunca existiu em webhooks históricos.

---

### 2026-03-23 (🎨 UI: reordenar aba Financeiro do LeadCard)

**O que mudou:** A aba "Financeiro" no card do cliente foi reorganizada para seguir a ordem lógica de leitura do contrato.

**Nova ordem:**
1. **Contratante** — Nome + CPF/CNPJ (agora sempre visível, com `—` se não preenchido)
2. **Endereço** — todos os campos de endereço (agora sempre visível)
3. **Faturamento** — valores, parcelas, forma de pagamento, produto vendido
4. **Vencimentos das Parcelas** — campo `op_vencimentos_parcelas` (sempre visível, `—` se GHL não enviou)
5. **Observações** — só aparece se tiver conteúdo

**Arquivo:** `eb-dash2/src/components/leads/LeadCard.tsx` — função `FinanceiroTab`

---

### 2026-03-23 (🐛 Fix: cpf_cnpj_contratante e complemento_endereco sempre NULL)

**Problema:** Campos `cpf_cnpj_contratante` e `complemento_endereco` em `vendas_fechamento` nunca foram preenchidos (todos os 47 registros com venda tinham NULL).

**Causa:** Migration `20260323030000` corrigiu o trigger e fez backfill apenas de `forma_pagamento` + `produto_vendido`. Os outros campos foram esquecidos no backfill.

**Observação sobre `op_vencimentos_parcelas`:** Campo `{{ opportunity.op_vencimentos_e_parcelas }}` não existe em nenhum webhook (0 registros). Ninguém preencheu esse campo no GHL ainda — sem dados para backfillar. Trigger está pronto.

**Entregas:**
- `supabase/migrations/20260323040000_backfill_cpf_complemento_vendas_fechamento.sql`
- Resultado: `sem_cpf: 0`, `sem_complemento: 2` (2 leads sem complemento genuinamente — campo opcional)

---

### 2026-03-23 (🐛 Fix: forma_pagamento e produto_vendido sempre NULL)

**Problema:** Campos `forma_pagamento` e `produto_vendido` em `vendas_fechamento` nunca eram preenchidos mesmo com dados no GHL.

**Causa raiz:** O trigger `extrair_vendas_fechamento_do_webhook()` usava chaves `customData` erradas:
- ❌ `{{opportunity.produto_vendido}}` → ✅ `{{ opportunity.produto_que_foi_vendido }}`
- ❌ `{{opportunity.forma_pagamento}}` → ✅ `{{ opportunity.forma_de_pagamento }}`

**Como foi descoberto:** Lead `flavio.batista@fbconsult.com.br` com `valor_entrada=R$21.000` mas `forma_pagamento=NULL` e `produto_vendido=NULL`. Diagnóstico via `jsonb_object_keys(payload->'customData')` no banco.

**Entregas:**
- `supabase/migrations/20260323030000_fix_forma_pagamento_produto_vendido_keys.sql` — corrige o trigger + backfill de todos os registros afetados
- **Backfill:** 47 registros corrigidos, 0 NULL restantes
- `eb-dash2/src/components/leads/LeadCard.tsx` — adiciona campo `op_vencimentos_parcelas` na aba Financeiro
- `eb-dash2/src/hooks/useLeads.ts` — inclui `op_vencimentos_parcelas` no SELECT e interface `VendasFechamento`
- `docs/VENDAS-FECHAMENTO.md` — atualizado com nomes CORRETOS confirmados via webhook real, histórico completo de bugs

---

### 2026-03-23 (🆕 Novo campo: op_vencimentos_parcelas em vendas_fechamento)

**Contexto:** O GHL começou a enviar o campo `{{ opportunity.op_vencimentos_e_parcelas }}` nos webhooks, contendo o cronograma detalhado de vencimentos e parcelas de boleto em texto livre. O campo pertence a `vendas_fechamento` (dados financeiros de contrato).

**Entregas:**

- `supabase/migrations/20260320100000_add_op_vencimentos_to_vendas_fechamento.sql` — coluna `op_vencimentos_parcelas TEXT` em `vendas_fechamento` + função `extrair_vendas_fechamento_do_webhook()` atualizada com o nome real do campo GHL (antes estava com placeholder `NOME_DO_CAMPO_GHL_AQUI`)
- `docs/VENDAS-FECHAMENTO.md` — novo campo na tabela de mapeamento e no schema

**Exemplo de valor:** `"1ª parcela: 10/04/2026 - R$ 3.000 | 2ª parcela: 10/05/2026 - R$ 3.000"`

---

### 2026-03-20 (📄 Auditoria: cohort de março vs gabarito manual de formulários)

**Contexto:** O painel de Tráfego/Cohort mostrava um número de leads para março que não batia com o CSV manual extraído do formulário GHL. Era preciso separar o que era:

- duplicidade no CSV
- diferença de janela de datas
- divergência de email entre formulário e banco
- contato antigo reaproveitado sem nova oportunidade no cohort
- contato sem oportunidade
- oportunidade nova apenas em Recuperação

**Entregas:**

- novo documento `docs/ANALISE-COHORT-MARCO-VS-GABARITO-MQLS.md`
  - reproduz a lógica real do painel (`useTrafego.ts`)
  - compara CSV bruto, CSV por email único e painel por oportunidade/email
  - mostra números de `01/03-19/03` e `01/03-20/03`
  - detalha as causas da divergência
  - lista nominalmente todos os leads problemáticos, com nome e email

**Resultado principal da auditoria:**

- CSV bruto: `175` linhas
- CSV deduplicado: `169` emails únicos
- painel em `01/03-20/03`: `165` oportunidades pagas / `162` emails únicos
- diferença explicada por:
  - `6` duplicidades no CSV
  - `9` leads do dia `20/03` presentes no painel, mas fora do CSV manual
  - `3` casos de email divergente
  - `13` contatos com oportunidade antiga fora do cohort de março
  - `2` contatos sem oportunidade
  - `1` caso em que março caiu apenas em Recuperação

### 2026-03-20 (🔧 Fix: constraint duplicada ao recolocar itens stale na fila sync-contact-opportunities)

**Problema:** `requeue_stale_contact_opp_sync_queue` falhava com `duplicate key value violates unique constraint "contact_opp_sync_queue_dedup"` quando:
1. Um item ficava preso em `processing` (stale)
2. Um webhook chegava e criava nova entrada `pending` para o mesmo contato
3. A função tentava mover o stale de volta para `pending` — mas o índice parcial único `(ghl_contact_id) WHERE status = 'pending'` bloqueava porque já existia um `pending` para esse contato

**Correção:**

- `supabase/migrations/20260323010000_fix_requeue_stale_contact_opp_sync_queue.sql`
  - nova versão da função `requeue_stale_contact_opp_sync_queue`
  - **Passo 1:** itens stale com `pending` duplicado são **deletados** (a entrada `pending` mais nova já cobre o trabalho)
  - **Passo 2:** itens stale sem conflito são recolocados em `pending` normalmente
  - retorna total de itens tratados (deletados + recolocados)

**Resultado:**

- `sync-contact-opportunities` processou 5 itens sem erro (testado em produção)
- 6 itens stale foram tratados corretamente na mesma chamada

### 2026-03-20 (📚 Governança do índice do CLAUDE.md)

**Problema:** O índice central do `CLAUDE.md` não mostrava quando cada documento tinha sido atualizado por último e ainda carregava alguns links antigos, apontando para caminhos que já não existiam mais na raiz do repositório.

**Correções implementadas:**

- `CLAUDE.md`
  - nova coluna `Atualizado em` para todos os documentos listados no índice
  - padrão explícito: timestamps em **BRT**
  - regra nova: sempre que um arquivo listado mudar, o timestamp correspondente deve ser atualizado no índice
  - correção de links antigos para os caminhos reais atuais dentro de `docs/`

**Resultado esperado:**

- o `CLAUDE.md` passa a funcionar como índice vivo, não só como lista de links
- fica mais fácil identificar documento desatualizado
- links quebrados deixam de atrapalhar auditoria e manutenção

### 2026-03-20 (📊 Contadores de oportunidades por contato para detectar defasagem)

**Problema:** Mesmo com a reconciliação noturna pronta, ainda faltava um indicador simples na própria tabela `contatos` para responder rapidamente quais contatos estão com diferença entre o total de oportunidades do GHL e o total salvo no banco.

**Correções implementadas:**

- `supabase/migrations/20260322010002_add_opportunity_count_fields_to_contatos.sql`
  - adiciona `contatos.total_oportunidades_ghl`
  - adiciona `contatos.total_oportunidades_db`
  - faz backfill inicial de `total_oportunidades_db` com contagem local de `oportunidades`

- `supabase/functions/reconcile-contact-opportunities/index.ts`
  - `mode=write` agora persiste os dois contadores em `contatos`
  - `db_total` passou a refletir a contagem do banco após o `upsert` corretivo da reconciliação

**Resultado esperado após deploy + migration:**

- toda madrugada o sistema atualiza, por contato, quantas oportunidades existem no GHL e quantas existem no banco
- fica fácil localizar defasagem com um `SELECT` simples em `contatos`
- futuros crons corretivos podem filtrar apenas contatos onde `total_oportunidades_ghl IS DISTINCT FROM total_oportunidades_db`

### 2026-03-20 (🛠️ Robustez de oportunidades GHL: fila resiliente + reconciliação/backfill completo)

**Problema 1:** `sync-contact-opportunities` existia, mas não era confiável operacionalmente. A auditoria mostrou milhares de itens presos e vários erros recorrentes:

- `null value in column "nome_contato" of relation "oportunidades" violates not-null constraint`
- `null value in column "contato_id" of relation "oportunidades" violates not-null constraint`
- itens antigos presos em `processing`
- retry quebrado porque a edge function não lia `attempts` da fila corretamente

**Correções implementadas:**

- `supabase/functions/sync-contact-opportunities/index.ts`
  - troca leitura ingênua da fila por claim atômico via RPC
  - usa `claimed_at` para recuperar itens presos em `processing`
  - aplica retry real com `attempts` correto e transição final para `error`
  - faz fallback de contato via `GET /contacts/{ghl_id}` quando necessário
  - garante `nome_contato` e `contato_id` válidos antes do `upsert`
  - mescla payload da API com valores já existentes no banco para evitar sobrescrever campos bons com `null`

- `supabase/migrations/20260322010000_harden_contact_opp_sync_queue_and_create_reconcile_infra.sql`
  - adiciona `claimed_at` na `contact_opp_sync_queue`
  - cria RPCs `requeue_stale_contact_opp_sync_queue()` e `claim_contact_opp_sync_queue()`
  - cria tabelas `ghl_opp_reconcile_runs` e `ghl_opp_reconcile_items`
  - cria RPCs de claim/requeue/counters da reconciliação

**Problema 2:** Não havia um mecanismo confiável para responder à pergunta “temos realmente todas as oportunidades de todos os contatos?” nem para corrigir oportunidades antigas que mudam no GHL sem passar pelo webhook mais recente.

**Correções implementadas:**

- nova edge function `supabase/functions/reconcile-contact-opportunities/index.ts`
  - `action=start` cria um run de reconciliação
  - `action=process` consome batches do run
  - `action=status` resume progresso
  - `mode=audit` compara GHL vs banco sem gravar
  - `mode=write` compara e corrige via `upsert`

- `supabase/migrations/20260322010001_schedule_reconcile_contact_opportunities_crons.sql`
  - cria cron `ghl-opp-reconcile-nightly-start` às **06:00 UTC / 03:00 BRT**
  - cria cron `ghl-opp-reconcile-processor` a cada 5 minutos

**Scripts e documentação:**

- `scripts/audit-ghl-sync-health.js`
  - corrigido para usar contagens exatas da fila
  - agora mostra `contact_opp_sync_queue` sem truncamento de 1000 linhas
  - inclui runs recentes de `ghl_opp_reconcile_runs`

- nova documentação:
  - `docs/SYNC-CONTACT-OPPORTUNITIES.md`

- documentação obrigatória atualizada:
  - `CLAUDE.md`
  - `docs/ARQUITETURA.md`
  - `docs/ROADMAP.md`
  - `docs/CRONS-STATUS.md`
  - `docs/SYNC-OPP-DATES.md`

**Resultado esperado após deploy + migrations:**

- novos contatos continuam sincronizando todas as oportunidades
- itens presos em `processing` deixam de ficar invisíveis para sempre
- erros de `NOT NULL` param de travar a fila inteira
- passa a existir backfill auditável e reexecutável
- oportunidades antigas do mesmo contato podem ser rechecadas automaticamente na madrugada

### 2026-03-20 — Rate Limiting GHL: Escalonamento de Crons + Fila Centralizada

**Problema 1 (Thundering Herd):** Três crons de 10 min disparavam no mesmo segundo (`*/10`). O limite da GHL API é 100 req/10s **compartilhado** — sem coordenação, cada função achava que tinha 100 req disponíveis enquanto as outras já tinham consumido parte.

**Solução 1:** Migration `20260320100001_stagger_ghl_cron_schedules.sql` — escalonou os offsets:
- `sync-ghl-conversations-incremental` → `:00, :10, :20...` (inalterado — mais crítico)
- `sync-opp-dates` → `:02, :12, :22...` (offset +2 min)
- `sync-opp-pipelines-cron` → `:04, :14, :24...` (offset +4 min)

**Problema 2 (Perda de jobs):** Se uma job falha após 4 retries, os dados ficam presos até o próximo cron, sem registro do que falhou.

**Solução 2:** Fila centralizada `ghl_api_jobs`:
- Migration `20260320100002_create_ghl_api_queue.sql` — tabela + função `claim_ghl_api_jobs()` (SKIP LOCKED)
- Edge function `supabase/functions/ghl-api-worker/index.ts` — worker que processa a fila
- Migration `20260320100003_schedule_ghl_api_worker_cron.sql` — cron `ghl-api-worker-cron` (todo minuto)

**Status da fila:** Infraestrutura implementada. Edge functions ainda chamam GHL diretamente (com o rate limiting individual já existente). Migração gradual planejada — ver `docs/GHL-API-QUEUE.md`.

**Arquivos novos:**
- `supabase/migrations/20260320100001_stagger_ghl_cron_schedules.sql`
- `supabase/migrations/20260320100002_create_ghl_api_queue.sql`
- `supabase/migrations/20260320100003_schedule_ghl_api_worker_cron.sql`
- `supabase/functions/ghl-api-worker/index.ts`
- `docs/GHL-API-QUEUE.md`

---

### 2026-03-20 (🔍 Auditoria Webhook/Crons: datas falsas removidas + monitoramento corrigido)

**Problema 1:** `sync-opp-dates` gravava `new Date().toISOString()` quando a API GHL não retornava `createdAt` ou dava erro. Isso mascarava backlog real e podia contaminar o cohort com data inventada.

**Correção:** `supabase/functions/sync-opp-dates/index.ts`
- remove fallback para timestamp fake
- passa a retornar contadores separados: `not_found`, `missing_created_at`, `fetch_errors`
- mantém `data_lead_recebido = NULL` para retry e investigação real
- adiciona guard de ambiente aceitando `SUPABASE_*` e `SB_*`

**Problema 2:** Variáveis de ambiente estavam inconsistentes entre edge functions (`SUPABASE_URL` vs `SB_URL`, `SUPABASE_SERVICE_ROLE_KEY` vs `SB_SERVICE_ROLE_KEY`). Isso aumenta risco de deploy parcial quebrado.

**Correção:** edge functions críticas agora aceitam os dois padrões:
- `supabase/functions/webhook-ghl/index.ts`
- `supabase/functions/sync-opp-dates/index.ts`
- `supabase/functions/sync-opp-pipelines/index.ts`
- `supabase/functions/sync-contact-opportunities/index.ts`
- `supabase/functions/sync-contact-tags/index.ts`
- `supabase/functions/sync-ghl-conversations/index.ts`

**Problema 3:** A checagem de saúde de conversas podia induzir erro ao usar `comunicacoes.created_at` como proxy de último sync.

**Conclusão da auditoria:** o sync de conversas estava operacional em **2026-03-20**; logs recentes mostraram execuções `success` com `messages_upserted = 2312`. O problema era a métrica de verificação, não necessariamente a rotina.

**Correção operacional/documental:**
- `docs/COMUNICACOES-GHL-SYNC.md` agora orienta verificar `ghl_conversations_sync_log`
- `docs/CRONS-STATUS.md` foi ajustado para refletir backlog residual real
- `scripts/audit-ghl-sync-health.js` criado para auditoria consolidada

---

### 2026-03-20 — sync-contact-tags: 2 contatos com erro persistente (decisão: não corrigir)

**Contexto:** Cron `sync-contact-tags` retorna erro nos IDs `v7dkM5B52v6nVqKNqFUl` e `8pQqSW4dHGeC20fbPMGK` a cada execução. Esses contatos foram provavelmente deletados no GHL e retornam 404 na API.

**Impacto:** Nenhum — apenas ruído nos logs. Todos os outros contatos sincronizam normalmente.

**Decisão:** Não corrigir por enquanto. Se o número de contatos com erro crescer, implementar dead-letter (`tags = '__NOT_FOUND__'`). Documentado em `docs/CRONS-STATUS.md`.

---

### 2026-03-20 (🐛 TRIPLE BUG FIX: pipeline_id/pipeline_name — leads invisíveis no painel)

**Contexto:** Investigação de discrepância gabarito vs painel (175 submissões no gabarito, 150 apareciam no painel) revelou 3 bugs encadeados na pipeline de ingestão de webhooks.

---

#### Bug 1 — `sync-opp-pipelines` nunca preencheu `pipeline_name`

**Arquivo:** `supabase/functions/sync-opp-pipelines/index.ts`

**Causa:** Linha 119 do arquivo retornava `pipeline_name: null` hardcoded. A função buscava `pipelineId` da API GHL mas ignorava o campo `pipelineName` na resposta.

```typescript
// ANTES (bug):
return { pipeline_id, pipeline_name: null };

// DEPOIS (corrigido):
const pipeline_name = data?.opportunity?.pipelineName || null;
return { pipeline_id, pipeline_name };
```

**Impacto:** 57+ oportunidades tinham `pipeline_id` preenchido mas `pipeline_name = NULL`, tornando-as invisíveis nos filtros do painel que dependem do nome do pipeline.

**Fix adicional:** O UPDATE no banco passou a não sobrescrever `pipeline_name` existente se a API retornar `null` (guard via `if (pipeline_name) updatePayload.pipeline_name = pipeline_name`).

---

#### Bug 2 — Migration `20260322000000` trocou COALESCE por NULLIF no `pipeline_id`

**Arquivo:** `supabase/migrations/20260322000000_webhook_always_overwrites.sql`

**Causa:** A migration "webhook é sempre fonte de verdade" trocou todos os campos do UPDATE de `COALESCE(NULLIF(...), o.pipeline_id)` para `NULLIF(...)` simples. Correto para campos que o GHL atualiza explicitamente (nome, status, datas), mas **errado para `pipeline_id` e `pipeline_name`**.

**Por quê errado:** Webhooks de atualização de data (ex: SDR registrando `data_conectado`) chegam **sem o campo `pipeline_id`** no payload. Com `NULLIF`, isso sobrescreve o `pipeline_id` existente com `NULL` — o lead desaparece do painel silenciosamente.

**Fix:** `20260320000003_fix_extrair_dados_ghl_pipeline_coalesce.sql` — reverteu apenas `pipeline_id` e `pipeline_name` para `COALESCE(NULLIF(...), o.pipeline_id)`. Todos os outros campos continuam com `NULLIF` (webhook = fonte de verdade).

---

#### Bug 3 — 63 opps com `pipeline_name = NULL` (backlog acumulado pelos dois bugs acima)

**Causa:** Combinação dos bugs 1 e 2 acumulou 63 oportunidades com `pipeline_name = NULL`:
- 57 já tinham `pipeline_id` mas o cron nunca preencheu o nome
- 6 tiveram `pipeline_id` zerado por webhook sem esse campo, depois resolvido

**Correções aplicadas:**
- `20260320000001_backfill_pipeline_name_from_known_ids.sql` — preencheu `pipeline_name` das 57 usando outras opps com o mesmo `pipeline_id` no banco
- `20260320000002_fix_pipeline_null_from_webhooks.sql` — preencheu `pipeline_id` das 6 usando o webhook mais recente com campo preenchido
- `20260320000004_backfill_pipeline_name_known_ids2.sql` — mapeamento direto dos 5 IDs de pipeline que a API do GHL não retornava mais por nome:
  - `smwSHOBdtMWNh64MMpBw` → [fn] webinário
  - `fgh4CfZQ8Un9iRCsgPFw` → Social Selling
  - `QQXqQvYEkwafSCAB1ybC` → Pré-Vendas MQL
  - `sqchZ2kIIZljR6wJ6bko` → Pré-Vendas nMQL
  - `ZWuCjEXM2VDyLCx8CtGU` → Vendas SQL

---

#### Teste de todos os crons (2026-03-20)

| Edge Function | Frequência | Status | Resultado |
|---|---|---|---|
| `sync-opp-pipelines` | 10 min | ✅ OK | `remaining: 0` — nenhum NULL pendente |
| `sync-opp-dates` | 10 min | ✅ OK | Processou 3 novas opps, `remaining: 0` |
| `sync-contact-tags` | 15 min | ⚠️ PARCIAL | 2 contact IDs falham na API GHL (IDs `v7dkM5B52v6nVqKNqFUl`, `8pQqSW4dHGeC20fbPMGK`) — provável deleção no GHL |
| `sync-ghl-conversations` | 10 min | ⚠️ TIMEOUT | Sem resposta em 60s — normal para 78k+ registros, monitorar logs |
| `sync-meta-ads` | 1 hora | ✅ OK | 35 registros inseridos em 5.5s |

**Estado do banco após correções:**
- `pipeline_id = NULL`: **0** ✅
- `pipeline_name = NULL` (com pipeline_id): **0** ✅
- `data_lead_recebido = NULL`: **0 no momento do teste** ✅ (3 novas opps chegaram depois — serão sincronizadas pelo próximo cron)

---

#### Arquivos modificados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `supabase/functions/sync-opp-pipelines/index.ts` | Fix | Extrai `pipelineName` da API GHL; guard contra sobrescrever com null |
| `supabase/migrations/20260320000001_*.sql` | Migration | Backfill pipeline_name dos 57 com pipeline_id conhecido |
| `supabase/migrations/20260320000002_*.sql` | Migration | Backfill pipeline_id dos 6 via webhook mais recente |
| `supabase/migrations/20260320000003_*.sql` | Migration | Fix `extrair_dados_ghl`: COALESCE em pipeline_id/name |
| `supabase/migrations/20260320000004_*.sql` | Migration | Backfill pipeline_name por mapeamento direto de 5 IDs |
| `gabarito-mqls/ANALISE-DISCREPANCIA-MAR2026.md` | Doc | Análise real (cruzamento por telefone): 175→150 com causas identificadas |

---

### 2026-03-17 (🐛 BUG FIX CRÍTICO: SB_SERVICE_ROLE_KEY vazia — sync-opp-dates parado silenciosamente)

**Problema:** A edge function `sync-opp-dates` estava falhando silenciosamente em toda execução (cron e trigger). O secret `SB_SERVICE_ROLE_KEY` no Supabase estava configurado como **string vazia** (hash SHA-256 `e3b0c44...` delata valor vazio). Resultado: `createClient(url, '')` lançava erro antes de qualquer query, nenhuma oportunidade era sincronizada.

**Sintoma observado:** 5 oportunidades com `data_lead_recebido = NULL` persistindo mesmo após várias execuções do cron de 10 minutos. O cron rodava, retornava sem erro, mas não sincronizava nada.

**Causa raiz:** Secret `SB_SERVICE_ROLE_KEY` configurado sem valor.

**Solução:**
```bash
supabase secrets set SB_SERVICE_ROLE_KEY=<service_role_key>
```

**Resultado:** Após correção, chamada manual sincronizou todas as 5 oportunidades pendentes de uma vez (`processed: 5, updated: 5, remaining: 0`).

**Lição:** O hash `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` na lista de secrets é o SHA-256 de string vazia — usar como diagnóstico rápido de secrets não configurados.

---

### 2026-03-17 (📊 ANÁLISE: Cruzamento gabarito MQLs fevereiro/2026 vs banco Supabase)

**O que foi feito:** Cruzamento entre CSV exportado do iAds (gabarito com 126 leads de fevereiro/2026) e o banco Supabase para identificar discrepâncias na detecção de MQLs.

**Resultados:**
- 114 leads (90,5%) encontrados corretamente como MQL no banco
- 12 leads (9,5%) no gabarito mas ausentes no banco como MQL de fevereiro — maioria existe no banco com `data_lead_recebido` anterior a fevereiro (leads que resubmeteram o formulário)
- 531 registros no banco como MQL mas não no gabarito: 43 MQLs reais + 429 nMQLs (pipeline pré-vendas nmql)

**Arquivos adicionados:**
- `gabarito-mqls/leads_fevereiro_iads_400k.csv` — CSV original do gabarito
- `gabarito-mqls/ANALISE-DISCREPANCIA-FEV2026.md` — análise completa
- `docs/plano-correcao-recuperacao/DIAGNOSTICO.md` — reformulado com relatório de cruzamento
- `docs/plano-correcao-recuperacao/REGRAS-CLASSIFICACAO.md` — IDs de pipelines confirmados + regra Social Selling

---

### 2026-03-17 (🛠️ NOVO: Edge functions para diagnóstico e correção de leads em Recuperação)

**Contexto:** 246 leads foram movidos para o pipeline Recuperação em vez de duplicados. Precisam ser corrigidos: mover opp original de volta ao pipeline correto + criar nova opp em Recuperação.

**Edge functions criadas:**
- `supabase/functions/diag-ghl/index.ts` — diagnóstico: lista todos os pipelines GHL com IDs e stages
- `supabase/functions/recuperacao-corrigir/index.ts` — correção: move opps de Recuperação para o pipeline correto com base nas tags do contato

**Modos de execução de `recuperacao-corrigir`:**
- `"test"` → processa 5 leads apenas (validar no GHL antes de rodar full)
- `"full"` → processa todos os leads

---

### 2026-03-17 (⚡ FIX: Sync de mensagens em tempo real via webhook — sync direcionado por contactId)

#### Mensagens agora aparecem no dashboard em ~5 segundos

**Problema:** Quando um lead mandava mensagem, o webhook disparava `mode: 'incremental'` — que precisa varrer todas as conversas recentes antes de achar a nova. Dependendo do volume, podia demorar até o cron de 10 minutos.

**Solução:** Extrair o `contactId` do payload do webhook e passar para o `sync-ghl-conversations` no modo `backfill_by_contact` com `batch_size: 1` — busca somente aquele contato na API do GHL, ignorando tudo o mais.

**Lógica:**
```typescript
const contactId = payload?.contactId
const syncBody = contactId
  ? { mode: 'backfill_by_contact', contactId, batch_size: 1 }
  : { mode: 'incremental' } // fallback se não tiver contactId
```

**Impacto:**
- Antes: mensagem aparecia em ~30 segundos a 10 minutos
- Depois: mensagem aparece em ~5 segundos

**Arquivos:**
- `supabase/functions/webhook-ghl/index.ts` — extrai `contactId` e passa modo direcionado
- `docs/COMUNICACOES-GHL-SYNC.md` — documentação atualizada com novo comportamento

---

### 2026-03-17 (📊 ANÁLISE: Discrepância MQLs — Gabarito vs Banco de Dados)

#### Análise completa de sincronização de tags MQL

**Objetivo:** Validar que 48 MQLs do formulário (fevereiro/2026) estão com tag MQL sincronizada no banco.

**Resultado:** ✅ **Sistema 100% funcional**
- 41 de 48 leads encontrados (85.4%)
- **100% dos 41 com tag MQL sincronizada** (zero discrepâncias de tags)
- 7 leads não chegaram ao banco (problema de webhook, não de sincronização)

**Análise:**
- Implementou script Python `analyze_mqls.py` para extrair dados do gabarito CSV
- Implementou script Node.js `compare_mqls.js` para query + comparação no Supabase
- Gerou relatório Markdown em `gabarito/ANALISE_MQLS.md` com lista completa de 41 leads OK + 7 com problema

**Conclusão:** Edge function `sync-contact-tags` (cron 15 min) está funcionando perfeitamente. Os 7 leads faltantes são problema de webhook não disparado, não de sincronização.

**Arquivos:**
- `gabarito/ANALISE_MQLS.md` — Relatório detalhado
- `gabarito/mqls_fev_26.csv` — Gabarito original (82 linhas, 48 únicos por validação)

---

### 2026-03-17 (🔧 FIX: Paginação no Meta Ads — corrigir truncamento de 1000 linhas)

#### Implementado loop paginado para resolver bug de dados truncados no Tráfego Pago

**Problema:** Query `.limit(5000)` na tabela `meta_ads_insights` era silenciosamente ignorada pelo PostgREST (max_rows=1000), retornando sempre 1000 linhas. Para período 01/01/26 a 16/03/26 (~75 dias), esperava-se ~1875 registros, mas recebia-se apenas 1000 (53% de truncamento).

**Impacto:** Spend, impressões, cliques, CTR, Cost per MQL e ROAS ficavam ~47% abaixo do real.

**Solução:** Implementar loop paginado (padrão obrigatório para queries >1000 rows), seguindo padrão já documentado em `CLAUDE.md` para tabela `oportunidades`.

**Implementação:**
- **Phase 1a:** Buscar `utm_sources` e `utm_campaigns` em paralelo (sem limite)
- **Phase 1b:** Loop paginado para `meta_ads_insights`:
  - `META_PAGE_SIZE = 1000`
  - Cada iteração: `.range(metaPage * 1000, metaPage * 1000 + 999)`
  - Mantém filtros condicionais (`campaign`, `adset`, `ad`) em cada iteração
  - Adiciona `.order('date', { ascending: true })` para ordem determinística
  - Para quando retorna < 1000 registros
- **Phase 1c:** Loop paginado para oportunidades (já existia, apenas renomeado)

**Resultado:** Painel Tráfego Pago agora retorna **100% dos dados**, sem truncamento silencioso.

**Arquivos modificados:**
- `eb-dash2/src/hooks/useTrafego.ts` — linhas 370-405

**Teste:** Abrir Painel Tráfego → filtrar período 01/01/2026 a 16/03/2026 → verificar que spend aumentou significativamente (antes: truncado em 1000 rows, depois: dados completos).

**Referência:** `docs/PAINEL-TRAFEGO-PAGO.md` | `CLAUDE.md` (seção "LIMITE CRÍTICO: PostgREST max_rows = 1000")

---

### 2026-03-17 (🔧 FIX: Classificação MQL via TAG em vez de pipeline)

#### Corrigido sistema de detecção MQL para usar tags do GHL

**Problema:** O sistema classificava MQL apenas por pipeline (`pipeline_name === 'Pré-Vendas MQL'`), perdendo **24+ leads** que tinham a TAG "MQL" mas estavam em outros pipelines (SQL, nMQL, etc.).

**Solução:** Implementado sistema tag-based de detecção MQL:
1. **Helper `isMqlByTag(contato)`** adicionada em `useTrafego.ts` — verifica se contato tem TAG "MQL"
2. **Funções de filtro atualizadas:**
   - `applyMqlFilter()` — agora usa `isMqlByTag()`
   - `computeFunnel()` — coluna MQL conta leads com TAG MQL
   - `computeSmallCards()` — cards de MQL/nMQL agora tag-based
   - `computeCostPerMqlSeries()` — cálculo de Cost Per MQL usa tags
3. **Hook `useCohort`** — coluna MQL na matriz cohort agora tag-based
4. **Documentação:** novo arquivo `docs/MQL-TAG-CLASSIFICATION.md` com guia completo

**Resultado:**
- Dashboard mostra **contagem correta de MQLs** (inclui leads com TAG MQL em qualquer pipeline)
- Leads evoluem de Pré-Vendas MQL → Vendas SQL mas mantêm TAG MQL (tracking histórico)
- Query correta: `.filter(o => isMqlByTag(o.contatos))` em vez de pipeline check

**Arquivos modificados:**
- `eb-dash2/src/hooks/useTrafego.ts` — helper + 4 funções de filtro
- `eb-dash2/src/hooks/useCohort.ts` — linhas de MQL na cohort
- `CLAUDE.md` — seção "Tags GHL — Sistema de Classificação"
- `docs/MQL-TAG-CLASSIFICATION.md` — documentação nova
- `docs/MUDANCAS.md` — este changelog

**Teste:** Verificar se leads com TAG "MQL" em qualquer pipeline aparecem nas contagens e gráficos.

---

### 2026-03-17 (✨ FEATURE: Tags do contato GHL no LeadCard)

#### Tags do GHL agora são armazenadas no banco e exibidas como badges coloridos

**Problema:** As tags do contato no GHL (ex: `mql`, `[fn] aplicação`, `[cp] campanha`) não eram salvas em lugar nenhum no Supabase — coluna inexistente.

**Solução:**
1. **Coluna `tags TEXT`** adicionada à tabela `contatos` (migration `20260319100000`)
2. **Edge function `sync-contact-tags`** — busca `GET /contacts/{ghl_id}` na API GHL e salva tags como string separada por vírgula. Cron: a cada 15 minutos (migration `20260319105000`)
3. **`extrair_dados_ghl` atualizada** — extrai tags via `extract_ghl_tags(w.payload->'tags')` preventivamente. Migrations `20260319110000` + `20260319115000`
4. **Frontend:** `tags` adicionado ao select de detalhes (`useLeads.ts` + tipo em `useTrafego.ts`)
5. **LeadCard** exibe tags como badges coloridos por tipo:
   - 🔵 `[fn]` = Funil (azul)
   - 🟠 `[cp]` = Campanha (laranja)
   - 🟢 `mql`/`sql` = Qualificado (verde)
   - 🔴 `nmql`/`nsql` = Não qualificado (vermelho)
   - ⚫ Outros = cinza

**⚠️ Detalhe crítico — formato das tags no GHL:**
Tags chegam via API como **array JSON** `["mql","[fn] aplicação"]`. O operador simples `->>'tags'` produziria `["mql","[fn] aplicação"]` com colchetes — quebrado. A função `extract_ghl_tags(JSONB)` (migration `20260319115000`) detecta o tipo e converte corretamente:
- Array JSON `["mql","[fn] app"]` → CSV `"mql,[fn] app"` (via `string_agg`)
- String → usa diretamente
- NULL → COALESCE mantém valor existente

**Backfill:** rodando via cron automático (15 min/lote de 100). Status inicial: 1.200 contatos processados, ~5.700 restantes.

**Arquivos:**
- `supabase/migrations/20260319100000_add_tags_to_contatos.sql` — coluna
- `supabase/migrations/20260319105000_schedule_sync_contact_tags_cron.sql` — cron
- `supabase/migrations/20260319110000_extrair_tags_do_webhook.sql` — extração preventiva (v1)
- `supabase/migrations/20260319115000_fix_extrair_tags_array_json.sql` — **FIX: array JSON → `extract_ghl_tags()`**
- `supabase/functions/sync-contact-tags/index.ts` — edge function
- `eb-dash2/src/hooks/useLeads.ts` — select de detalhes
- `eb-dash2/src/hooks/useTrafego.ts` — tipo + `isMqlByTag()`
- `eb-dash2/src/components/leads/LeadCard.tsx` — badges coloridos
- `docs/webhooks-ghl/DECISOES/20260319-tags-contato-ghl.md` — decisão documentada
- `docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md` — campo `tags` adicionado

---

### 2026-03-17 (🔧 FIX: Melhorar clicabilidade do LeadCard e adicionar delete button)

#### Experiência de abertura de leads aprimorada na aba Lista

**O que foi melhorado:**

1. **Clicabilidade em toda a linha (não apenas na data):**
   - Adicionado `onClick={() => setSelectedOppId(lead.id)}` na `<tr>` inteira
   - Agora abre o LeadCard ao clicar em **qualquer célula** (nome, email, pipeline, status, etc.)
   - Antes: só abria ao clicar na coluna de data (UX confusa)

2. **Botão delete no hover da linha:**
   - Adicionada última coluna com ícone lixeira (🗑️) que aparece no hover
   - Clique abre modal de confirmação para deletar o lead individualmente
   - Padrão visual: opacidade 0 → 1 no hover, cor danger, small padding
   - Usa `stopPropagation()` para não abrir LeadCard quando clicar no botão

3. **Sem conflitos com checkbox:**
   - Checkbox continua com `stopPropagation()` próprio
   - Clicar no checkbox NÃO abre LeadCard, apenas seleciona/deseleciona
   - Clicar na célula do checkbox (espaço em torno) SIM abre LeadCard

**Arquivos modificados:**
- `eb-dash2/src/pages/leads/tabs/ListaTab.tsx`
  - Adicionado onClick na `<tr>` (linhas ~450-460)
  - Adicionada última coluna com botão delete (linhas ~513-528)
  - Ajustado colSpan do "nenhum lead" de 9 → 10
  - Ajustado skeleton loading de 9 → 10 colunas

**Resultado visual:**
- Tabela mais intuitiva e responsiva
- Feedback visual claro de clicabilidade (cursor pointer no hover)
- UX consistente com padrão de linhas clicáveis em tabelas modernas

---

### 2026-03-17 (✨ FEATURE: Seção "Limpeza de Leads" no módulo Leads)

#### Nova aba para visualizar e remover leads de teste que poluem os painéis

**O que foi implementado:**

1. **Estrutura de abas no módulo Leads:**
   - `LeadsPage.tsx` transformada em container com navegação por abas
   - URL params: `?tab=lista` (padrão) ou `?tab=limpeza`
   - Padrão visual consistente com Pré-Vendas

2. **Aba "Lista":**
   - Conteúdo anterior migrado para `ListaTab.tsx`
   - Adiciona seleção com checkboxes (individual ou select all)
   - Exclusão em massa com modal de confirmação
   - Barra flutuante mostrando contador de leads selecionados

3. **Aba "Limpeza":**
   - Query busca leads com "teste" em nome/email (ILIKE case-insensitive)
   - Tabela: Nome | Email | Pipeline | Status | Data Lead | Ação
   - Botão delete por linha (ícone lixeira) com modal
   - Botão "Excluir todos (N)" para exclusão em massa
   - Loading states durante carregamento/exclusão
   - Toast feedback (sucesso/erro)

4. **Sidebar:**
   - Item "Leads" agora expandível com children
   - Sub-itens: "Lista" (BarChart3) e "Limpeza" (Trash2)
   - Navegação integrada com query params

5. **Hook useLeads:**
   - Nova função `deleteLeads(ids: string[])` para exclusão via Supabase
   - Auto-reload de leads após exclusão bem-sucedida

**Arquivos criados:**
- `eb-dash2/src/pages/leads/tabs/ListaTab.tsx`
- `eb-dash2/src/pages/leads/tabs/LimpezaTab.tsx`

**Arquivos modificados:**
- `eb-dash2/src/pages/leads/LeadsPage.tsx`
- `eb-dash2/src/components/layout/Sidebar.tsx`
- `eb-dash2/src/hooks/useLeads.ts`

---

### 2026-03-17 (🔧 FIX: Nomes "—" no AlertasCard)

#### Nomes dos contatos apareciam como "—" nos alertas de no-shows e reuniões

**Problema:** O join `contatos(nome)` retorna um objeto (relação many-to-one), mas o código acessava como array com `[0]`, resultando em `undefined` e fallback para "—".

**Solução:** Trocar `(r.contatos as any)?.[0]?.nome` por `(r.contatos as any)?.nome` nas duas ocorrências.

**Arquivo modificado:** `eb-dash2/src/components/prevendas/AlertasCard.tsx` (linhas 81, 86)

---

### 2026-03-16 (🔧 FIX: Filtro de Investimento Meta Ads por Canal)

#### Investimento agora filtra corretamente ao selecionar canal no Painel Tráfego

**Problema:** Ao selecionar canal (ex: "facebook-1"), os leads eram filtrados mas o
investimento (spend) continuava mostrando o total do período — sem refletir o canal.

**Solução:** Cada canal em `utm_sources` tem um `public_code` (ex: "P20").
Esse código aparece embutido no `ad_name` de cada anúncio no Meta Ads.
O hook agora filtra `meta_ads_insights` para manter apenas anúncios cujo
`ad_name` contém o `public_code` do canal selecionado.

**Arquivo modificado:** `eb-dash2/src/hooks/useTrafego.ts`
- `ChannelOption` type: adicionado `publicCode?: string | null`
- filterOptions fetch: `utm_sources` busca `public_code`
- main data fetch: `utm_sources` busca `public_code` + popula `sourcePublicCodeRef`
- Antes de `setMetaRows`: filtra por `ad_name.includes(publicCode)` se canal selecionado

**Fallback seguro:** canal sem `public_code` cadastrado → investimento não filtrado (mantém total).

---

### 2026-03-16 (📚 DOCUMENTAÇÃO: Sistema Completo de Crons + Alertas)

#### Documentação didática de todos os crons automáticos e sistema de monitoramento

**O que foi criado:**
- **Novo arquivo:** `docs/CRONS-SYSTEM.md` — Documentação completa de 4 crons do sistema
  - Lista didática: o que cada cron faz, por que existe, como funciona
  - Frequência: 10min (sync-opp-dates, sync-opp-pipelines), 30min (sync-ghl-conversations), 1h (sync-meta-ads)
  - Custo/consumo: 17k req/dia total (8.5% do limite GHL)
  - Problemas conhecidos: webhook GHL incompleto, rate limit Meta
  - Como monitorar manualmente com SQL

- **Novo arquivo:** `docs/ALERTAS-SYSTEM.md` — Monitoramento e troubleshooting
  - 3 alertas principais: `pipeline_name NULL`, `data_lead_recebido NULL`, cron não rodou
  - Query SQL para dashboard de status (rodada manualmente)
  - Checklist diário/semanal/mensal
  - Troubleshooting rápido (tabela 5 problemas comuns)
  - Sugestões para alertas automáticos (Slack, Grafana, Pagerduty)

**Mudanças de documentação:**
- ✅ `docs/ARQUITETURA.md` — Seção "Integrações Externas" completamente reescrita
  - Adicionadas referências aos novos docs
  - Problema conhecido: webhook GHL incompleto (2026-03-16)
  - Custo de cada cron documentado

- ✅ `docs/MUDANCAS.md` — Este changelog (you are here)

**Context:** Investigação de problemas com `pipeline_name = NULL` levou à criação de documentação completa de toda infraestrutura de crons. Descoberto que sistema é robusto mas webhook GHL chega incompleto às vezes — edge functions sincronizam a cada 10min como rede de segurança automática.

---

### 2026-03-23 (🎨 UI: Renomear Dashboard → Tráfego + Tab Tráfego → Visão Geral)

#### Menu e rota da página de tráfego foram renomeados para melhor clareza de hierarquia

**O que foi mudado:**
- **Menu lateral:** "Dashboard" → "Tráfego" (rota `/dashboard` → `/trafego`)
- **Sub-item:** "Tráfego" → "Visão Geral" (tab key `trafego` → `visao_geral`)
- **Titulo página:** "Dashboard" → "Tráfego"
- **Redirects:** URLs antigas `/dashboard` redirecionam automaticamente para `/trafego`

**Arquivos modificados:**
- ✅ `eb-dash2/src/App.tsx` — rotas (3 mudanças)
- ✅ `eb-dash2/src/components/layout/Sidebar.tsx` — navegação (2 mudanças)
- ✅ `eb-dash2/src/pages/dashboard/DashboardPage.tsx` — tab key, label, DEFAULT_TAB, title, condicional render (5 mudanças)

**Motivação:**
- Clareza hierárquica: "Tráfego" é o módulo (menu), "Visão Geral" é a aba dentro dele
- Alinhamento com padrão de outras seções (Pré-Vendas tem "Visão Geral", "SDRs", "Cohort")
- Nomes internos dos arquivos (`DashboardPage.tsx`, `TrafegoTab.tsx`) foram preservados

**Verificação:**
- ✅ `/trafego` abre corretamente
- ✅ Sidebar exibe "Tráfego" → "Visão Geral"
- ✅ `/` redireciona automaticamente para `/trafego`
- ✅ Parâmetro `?tab=visao_geral` atualizado em todo fluxo

---

### 2026-03-23 (📄 DOCUMENTAÇÃO: Matching de Anúncios — utm_term → Nomes Descritivos)

#### Sistema de correspondência entre códigos de anúncio e nomes catalogados documentado

**O que foi documentado:**
- **Novo arquivo:** Seção "🎯 Matching de Anúncios" adicionado em `docs/ARQUITETURA.md`
- **Problema resolvido:** Como conectar `utm_term` bruto (ex: `M1_O1_P29_CR-248_PG12`) ao nome descritivo do criativo em `notion_creatives`
- **Implementação:** Algoritmo de extração de `creative_id` via regex `CR-(\d+)` + join em memória com `notion_creatives`
- **Cobertura:** Fevereiro 2026 = 972 leads, 37 anúncios distintos, 35 com nomes catalogados (94.6%)

**Mudanças de documentação:**
- ✅ `docs/ARQUITETURA.md` — 60 linhas adicionadas, seção "Matching de Anúncios" com problema, solução, algoritmo, implementação, cobertura de dados, top 5 anúncios
- ✅ Referência cruzada com `docs/CORRELACAO-META-CRM.md` seções 3-5
- ✅ Referência cruzada com `docs/TABELAS-SISTEMA.md` seção "notion_creatives"

**Observação importante:**
- Tabela `ads_catalog` está **incompleta em produção** (muitos `utm_term=NULL`)
- A solução implementada não depende de `ads_catalog` — extrai `creative_id` direto do `utm_term` do contato
- Fallback: Se `creative_id` não encontrado em `notion_creatives`, exibe "(sem nome catalogado)"

---

### 2026-03-22 (✅ BACKFILL SYNC-OPP-PIPELINES: 100% COMPLETO)

#### Todos os 4356 leads com pipeline_id=NULL foram sincronizados — nenhum lead mais invisível

**Resultado Final:**
- ✅ **BACKFILL 100% CONCLUÍDO** em 2026-03-22 ~15:00 UTC
- **Antes:** 4356 oportunidades com `pipeline_id=NULL` (invisíveis no dashboard)
- **Depois:** 0 oportunidades com `pipeline_id=NULL` (100% visíveis)

**Execução:**
1. **Fase 1 — Cron automático** (2026-03-21 21:30 UTC → 2026-03-22 05:00 UTC):
   - Duração: ~7 horas
   - Taxa: 100 opps/10 min
   - Volume: ~3500 oportunidades sincronizadas
   - Comportamento: Cron job rodava automaticamente a cada 10 min, batendo na API GHL

2. **Fase 2 — Backfill acelerado manual** (2026-03-22 ~15:00 UTC):
   - Duração: ~10 minutos
   - Taxa: ~1 opp/segundo
   - Volume: 863 oportunidades sincronizadas
   - Método: Script Node.js com iterações de 100 opps + 5s pause
   - Comando executado:
     ```javascript
     // /tmp/backfill-safe.js
     // 9 iterações × 100 opps = 863 finais
     ```

**Verificação Final:**
```sql
SELECT COUNT(*) FROM oportunidades WHERE pipeline_id IS NULL;
-- Resultado: 0 ✅
```

**Impacto:**
- ✅ Lead `eduardosampaio.mb@gmail.com` agora visível em cohort de vendas
- ✅ Todos os 4356 leads aparecem corretamente em painéis de tráfego/pré-vendas
- ✅ PostgREST queries não filtram mais leads por NULL = UNKNOWN
- ✅ Zero leads invisíveis no dashboard

**Cron continua:**
- Roda a cada 10 minutos como fallback
- Garante que novos webhooks incompletos sejam sincronizados
- Taxa: 100 opps/batch/execução

---

### 2026-03-22 (Diagnóstico: pipeline_stage_id NULL em ~98% das oportunidades)

#### Descoberta: pipeline_stage_id está NULL em quase toda a base

**O que foi descoberto:**

Análise dos dados revelou que **979 de 1000 oportunidades** (≈98%) têm `pipeline_stage_id = NULL`.

**Causa raiz:**

O campo no webhook do GHL chama-se `pipleline_stage` (com typo — falta um 'e'), e o valor que vem é o **nome do estágio**, não um ID:

```json
{ "pipleline_stage": "Reunião agendada" }
{ "pipleline_stage": "NoShow" }
{ "pipleline_stage": "2º contato" }
```

A função `extrair_dados_ghl` mapeia corretamente esse campo (com o typo) para a coluna `pipeline_stage_id`. Porém, a maioria das oportunidades foi **inserida pela edge function `sync-contact-opportunities`** via API GHL — que não inclui o stage. Webhooks chegavam depois, mas o COALESCE antigo não corrigia todos os casos.

**Status:**
- ✅ Com a migration `20260322000000_webhook_always_overwrites.sql`, ao reenviar webhooks o campo será preenchido corretamente
- ⚠️ Campo `pipeline_stage_id` guarda na verdade o **nome** do estágio (ex: "Reunião agendada"), não um ID — nome da coluna é enganoso mas não será renomeado por ora
- ⚠️ Ao reenviar webhooks históricos, o stage que entra é o **da época**, não o atual — para estado atual usar backfill via API GHL

**Ação necessária:**
- Reenviar webhooks do GHL → vai preencher `pipeline_stage_id` automaticamente
- OU criar backfill via `GET /opportunities/{id}` para pegar estado atual

**Números:**
- Total analisado: 1000 oportunidades
- COM pipeline_stage_id: 21 (2%)
- SEM pipeline_stage_id (NULL): 979 (98%)

---

### 2026-03-22 (Banco: Webhook é sempre fonte de verdade)

#### Remover proteção COALESCE — dados do GHL não sofrem fallback

**O que mudou:**

Até agora, quando o webhook chegava com um campo **vazio ou NULL**, o sistema mantinha o valor antigo no banco de dados. Era como um "protetor" que evitava perder dados — mas também **impedia que o banco refletisse mudanças reais do GHL**.

**Exemplo concreto:**
- Você tinha um lead com `nome_contato = "João Silva"` no banco
- GHL apagou o nome (por qualquer razão)
- Webhook chega vazio: `"full_name": ""`
- **Antes:** Sistema mantinha "João Silva" no banco (nunca apagava)
- **Agora:** Sistema coloca NULL no banco (reflete a realidade do GHL)

**Por que fazer isso:**
- O webhook do GHL é a **fonte de verdade** — se GHL mudou, o banco deve mudar
- Fallback antigo causava **dados desatualizados** no dashboard
- Especialmente importante para campos que devem ser preenchidos (ex: pipeline_id — se NULL, lead desaparece dos painéis)

**Mudanças técnicas implementadas:**

Função `extrair_dados_ghl` agora:
- ✅ **UPDATE contatos:** Remove COALESCE de `nome`, `email`, `telefone`, `owner_name`, `owner_email`
  - Agora: `nome = NULLIF(TRIM(w.payload->>'full_name'), '')`
  - Antes: `nome = COALESCE(NULLIF(TRIM(...)), c.nome)` ← protetor antigo

- ✅ **UPDATE oportunidades:** Remove COALESCE de **29 campos**:
  - Campos diretos: `nome_contato`, `email_contato`, `titulo`, `valor`, `status`, `pipeline_id`, `pipeline_stage_id`, `pipeline_name`, `opportunity_source`, `vendedor_closer`, `lost_reason`, `resumo_ia`, `percepcao_closer`, `data_ultima_atividade`
  - Todas 15 datas de pipeline: `data_tentativa_1..8`, `data_no_show`, `data_conectado`, `data_perdido`, `data_qualificado`, etc.

- ✅ **ADICIONADO:** CTE `ultimos_webhooks_opp` com `DISTINCT ON` — garante que sempre usar o **webhook mais recente** se houver múltiplos webhooks para a mesma oportunidade (determinismo)

- ✅ **PRESERVADO:** `data_lead_recebido` **não é alterado pelo webhook** — continua gerenciada exclusivamente pela edge function `sync-opp-dates` (via API GHL)

**UTMs especial:**
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content` mantêm fallback de `lastAttributionSource`
- Motivo: GHL armazena UTMs em dois lugares, e queremos capturar dos dois

**Arquivo alterado:**
- ✅ `supabase/migrations/20260322000000_webhook_always_overwrites.sql` — migration aplicada

**Como verificar:**
```sql
-- Testar: criar webhook com campo vazio, confirmar que fica NULL no banco
SELECT ghl_opportunity_id, nome_contato, pipeline_id, lost_reason
FROM oportunidades
WHERE ghl_opportunity_id = 'algum_id'
LIMIT 1;
```

---

### 2026-03-21 (✅ OPERACIONAL: Cron Job sync-opp-pipelines)

#### Edge function + cron para sincronizar oportunidades com pipeline=NULL

**Problema:**
- 745+ oportunidades no período fevereiro-março chegaram via webhook **sem pipeline_id e pipeline_name**
- PostgREST/PostgreSQL trata `pipeline_id=NULL` como UNKNOWN → silenciosamente exclui do dashboard
- **Resultado:** leads invisíveis em todo painel de tráfego/pré-vendas

**Solução implementada:**
- ✅ **Nova edge function:** `supabase/functions/sync-opp-pipelines/index.ts`
  - Busca dados da API GHL (`GET /opportunities/{id}`)
  - Extrai `pipelineId` + `pipelineName`
  - Popula oportunidades com `pipeline_id=NULL`
  - Mesmo padrão de rate-limiting da `sync-opp-dates`

- ✅ **Cron job automático:** Migration `20260321000000_cron_sync_opp_pipelines.sql`
  - Executa **a cada 10 minutos**
  - Batch de 100 oportunidades por execução
  - Suporta backfill manual via POST com `batch_size: 500`

- ✅ **Documentação:** `docs/SYNC-OPP-PIPELINES.md`
  - Explicação do problema
  - Como monitorar progresso
  - Manual de troubleshooting

**Arquivos novos:**
- `supabase/functions/sync-opp-pipelines/index.ts`
- `supabase/migrations/20260321000000_cron_sync_opp_pipelines.sql`
- `docs/SYNC-OPP-PIPELINES.md`

**Status do Deploy:**
- ✅ Edge function deployada (v2 com env vars corrigidas)
- ✅ Migration de cron job aplicada
- ✅ Secrets GHL_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY configurados
- ✅ **OPERACIONAL desde 2026-03-21 21:30 UTC**

**Status da implementação (seção anterior):**
- Edge function e cron job já implementados em 2026-03-21
- Backfill concluído na seção acima (2026-03-22)
- Cron continua rodando a cada 10 minutos como fallback para novos webhooks

**Como monitorar:**
```sql
-- Ver quantas ainda faltam
SELECT COUNT(*) FROM oportunidades WHERE pipeline_id IS NULL;
```

**Logs:** Supabase Dashboard → Functions → `sync-opp-pipelines` → Logs
- Buscar por `[sync-opp-pipelines]` para ver progresso
- Cada execução do cron mostra: `processed, updated, nodata, remaining`

---

### 2026-03-21 (Documentação + Nova Métrica: % Sem Resposta SDR)

#### Documentação de Tempo Médio de Resposta e nova métrica de leads sem resposta

**Mudança:**
- ✅ **Documentação:** Criado `docs/KPI-SDR-TEMPO-RESPOSTA.md` — explicação completa da metodologia (o que é, definição técnica, cálculo, interpretação, limitações)
- ✅ **Nova métrica:** Adicionada coluna "% Sem Resp." no leaderboard de SDRs — percentual de leads que **nunca** receberam nenhuma mensagem outbound do SDR (humano) no período

**Arquivos alterados:**
- `docs/KPI-SDR-TEMPO-RESPOSTA.md`: CRIADO — documentação completa
- `CLAUDE.md`: adicionada linha na tabela de documentação
- `eb-dash2/src/hooks/useSDRLeaderboard.ts`:
  - Interface `SDRRow`: novos campos `leads_sem_resposta` (contagem) + `pct_sem_resposta` (%)
  - Novo state: `respondeuSet: Set<string>` — tracks quais contatos receberam pelo menos uma mensagem
  - Step 2: dentro do processamento de comunicações, construir `respondeuSet` a partir de `contato_id`
  - Step 3 (merge): calcular leads sem resposta = leads cujo `contato_id ∉ respondeuSet`
  - Percentual: `(leads_sem_resposta / leads_count) * 100`, arredondado

- `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`:
  - Novo helper: `noResponseBadgeClass(pct)` — retorna cor do badge (verde <10%, âmbar, vermelho)
  - Coluna nova: "% Sem Resp." — exibe badge com percentual ou "—" se zero
  - Badge verde quando ≤10% (bom), âmbar quando baixo-médio, vermelho quando ≥10% (muitos leads ignorados)

**Impacto:**
- Leaderboard SDR agora tem **duas métricas complementares:**
  - **Tempo Resp.** = quando responde? (velocidade)
  - **% Sem Resp.** = quantos leva sem resposta? (cobertura/atenção)
- Nenhuma query SQL adicional — reutiliza dados da query existente de comunicações
- Dashboard mantém performance (sem overhead)

---

### 2026-03-20 (UI: Modal clicável de no-shows pendentes)

#### No-shows agora abrem em modal com tabela completa

**Mudança:**
- Card **AlertasCard** agora mostra no-shows pendentes com interatividade total:
  - ✅ Clique no header "No-shows pendentes" → abre modal com **todos** os no-shows
  - ✅ Cada linha da modal é clicável → abre **LeadCard** com detalhes do lead
  - ✅ Mesma experiência que o resto do sistema (Leads, Leads Parados)

**Arquivos alterados:**
- `eb-dash2/src/components/prevendas/AlertasCard.tsx`:
  - Novo estado: `showNoShowsModal` + `selectedOppId`
  - Modificado type de `noShows` para incluir `id: string` de cada oportunidade
  - Clique no header dispara `setShowNoShowsModal(true)`
  - Modal exibe tabela com: Nome | Data agendada
  - Cada linha tem `onClick` que abre LeadCard
  - Botão X fecha modal
  - Imports: adicionados `X` (lucide-react), `LeadCard` (components)

- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx`:
  - Removido import `AlertasCard` (não duplicar)
  - Removido `<AlertasCard />` do final da aba

**Impacto:**
- AlertasCard agora é **totalmente interativo** (leads clicáveis, não apenas informativos)
- Única instância em **Visão Geral** (não duplicado em Leads Parados)
- Abertura de LeadCard mantém modal aberta ou fecha automaticamente (user preference)

---

### 2026-03-20 (UI: Remover KPI Cards de receita da Visão Geral de Pré-Vendas)

#### KPI Cards de Faturamento, Caixa, ROAS e ROAS Caixa removidos

**Mudança:**
- Removidos 4 KPI Cards da aba **Visão Geral** de Pré-Vendas:
  - ❌ Faturamento
  - ❌ Caixa
  - ❌ ROAS
  - ❌ ROAS Caixa

**Por que:**
- Esses KPIs são derivados de `vendas_fechamento`, mas a análise de receita é mais apropriada no módulo **Tráfego** ou em um futuro módulo **Faturamento/Vendas**
- A Visão Geral de Pré-Vendas deve focar em **funil de conversão** (Matriz Cohort) e **análise operacional** (motivos de perda, distribuição por SDR)
- A coluna "Faturamento" permanece na **Matriz Cohort** para análise granular por cohort

**Arquivos alterados:**
- `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`:
  - Removido prop `revenueKpis` de `Props`
  - Removidos imports `DollarSign`, `BarChart2` de lucide-react
  - Removido bloco de 4 KPI Cards (lines ~340-350)
  - Removidos cálculos `roas` e `roasCaixa`
  - Removida importação desnecessária de `RevenueRow` (ainda usada por `useCohort`)

- `eb-dash2/src/pages/prevendas/PreVendasPage.tsx`:
  - Removido prop `revenueKpis={revenueKpis}` ao chamar `<GeralTab />`

**Impacto:**
- Visão Geral agora exibe: **Alertas** → **Matriz Cohort** → **Motivos de Perda** + **Distribuição por SDR**
- Hooks `usePreVendas` e `useCohort` permanecem inalterados (continuam calculando receita para outros usos)
- Supabase queries: sem mudanças (dados continuam sendo buscados, apenas não exibidos nesse módulo)

---

### 2026-03-20 (UI: Mostrar apenas SDRs oficiais na Visão Geral)

#### Inconsistência: Visão Geral mostrava 105 leads, aba SDRs mostrava 102

**Problema:**
- A aba "Visão Geral" exibia leads com qualquer `contatos.owner_name` não-nulo
- A aba "SDRs" filtra APENAS SDRs cadastrados em `ghl_users` com papel `'sdr'`
- Diferença: 3 leads estavam atribuídos a pessoas que **não eram SDRs oficiais**
- Inconsistência de dados entre abas do mesmo módulo

**Solução implementada:**

1. **Carregamento de SDRs oficiais:**
   - Novo estado: `sdrNames: Set<string>` carregado de `ghl_users` com `papeis` contendo `'sdr'`
   - Carregado uma única vez no `useEffect` inicial

2. **Filtro consistente:**
   - `oppsComSdr = opps.filter((o) => sdrNames.has(o.contatos?.owner_name ?? ''))`
   - AGORA consistente com a aba SDRs (ambas filtram por oficiais)

3. **Propagação:**
   - ✅ Matriz Cohort: usa `oppsComSdr`
   - ✅ Motivos de perda: usa `oppsComSdr`
   - ✅ Distribuição por SDR: usa `oppsComSdr`

**Arquivo alterado:**
- `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx`:
  - ✅ Imports: adicionados `useEffect`, `supabase`
  - ✅ Novo estado: `sdrNames: Set<string>`
  - ✅ useEffect: carrega SDRs de `ghl_users` com papel `'sdr'` (uma única vez)
  - ✅ Filtro: `oppsComSdr` agora usa `sdrNames.has()` (dependência em `[opps, sdrNames]`)

**Resultado:**
- ✅ Visão Geral e aba SDRs mostram **exatamente os mesmos leads** (102)
- ✅ Dados unificados e confiáveis em todo o módulo de Pré-Vendas
- ✅ Leads com `owner_name` não-oficial ficam invisíveis (precisam ser cadastrados em `ghl_users` com papel `'sdr'`)

---

### 2026-03-20 (UI: Melhorar LeadCard — Portal + Tela Cheia)

#### LeadCard "travado" no canto superior direito quando página scrollada + sem opção fullscreen

**Problema:**
- Quando o usuário scrollava para baixo em qualquer página, o `LeadCard` (drawer lateral) permanecia fixo no canto superior direito, ficando invisível fora do viewport
- Causa raiz: algum ancestral com `transform`, `filter` ou `will-change` criava novo stacking context, quebrando o positioning `fixed`
- Sem opção de expandir para tela cheia

**Solução implementada:**

1. **Usar `ReactDOM.createPortal`:**
   - Renderizar drawer e backdrop **diretamente no `document.body`**, fora de qualquer ancestral transformado
   - Garante que `fixed` funcione sempre relativo ao viewport (não ao ancestral)

2. **Toggle Tela Cheia:**
   - Novo estado: `isFullscreen` (Boolean)
   - Botão com ícones `Maximize2` / `Minimize2` no header
   - Width dinâmica: `w-[520px]` (padrão) vs `w-screen` (fullscreen)
   - Transição suave: `transition-[transform,width]`
   - Reseta ao fechar/reabrir card

3. **Ajustes de tamanho:**
   - Aumentado width padrão: `480px` → `520px` (melhor UX)
   - Classe CSS: `transition-[transform,width]` (suporta tanto transform quanto width)

**Arquivo alterado:**
- `eb-dash2/src/components/leads/LeadCard.tsx`:
  - ✅ Import: `createPortal` (react-dom), `Maximize2, Minimize2` (lucide-react)
  - ✅ Novo estado: `isFullscreen`
  - ✅ useEffect: reseta `setIsFullscreen(false)` quando `!oppId`
  - ✅ Return envolvido em `createPortal(..., document.body)`
  - ✅ Width dinâmica: `isFullscreen ? 'w-screen' : 'w-[520px]'`
  - ✅ Botão fullscreen no header antes do X

**Testes:**
- ✅ Abrir app em `localhost:3222`
- ✅ Ir para Pré-Vendas → Leads Parados → rolar para baixo
- ✅ Clicar em lead → drawer aparece na lateral direita, visível na viewport
- ✅ Clicar Maximize2 → expande para tela cheia com transição
- ✅ Clicar Minimize2 → volta para tamanho normal
- ✅ Fechar e reabrir → estado fullscreen resetado
- ✅ Testar em Leads, SDRs (LeadListModal), Tráfego, Geral

---

### 2026-03-20 (UI: Acordeão nas Categorias de Leads Parados — Colapsável por Padrão Expandido)

#### Tela de Leads Parados muito longa — difícil navegar entre categorias

**Problema:** O painel **Leads Parados** exibia 3 quadrantes sempre expandidos, causando scroll desnecessário e poluição visual quando havia muitos leads.

**Solução implementada:**
- Adicionado sistema de **acordeão (dropdown colapsável)** em cada quadrante:
  - **Quadrant 1:** "Não Respondem" — com ícone ChevronDown à esquerda (botão "Analisar com IA" continua funcional)
  - **Quadrant 2:** "Aguardando Resposta do SDR" — com ChevronDown à direita
  - **Quadrant 3:** "Alertas" — com ChevronDown à direita

- **Comportamento:**
  - Todos os 3 quadrantes começam **expandidos** por padrão (`open=true`)
  - Clique no cabeçalho expande/recolhe o conteúdo (sem afetar o botão de IA no Quadrant 1)
  - Ícone ChevronDown rotaciona (-90°) quando recolhido (visual feedback)
  - Hover no cabeçalho muda cor de fundo (transição suave)
  - Badges de contagem ficam visíveis mesmo quando recolhido

**Arquivos alterados:**
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx`:
  - Adicionado import: `ChevronDown` (lucide-react, linha 9)
  - Adicionado `useState(true)` em cada quadrante
  - Modificado cabeçalho para ser clicável com `onClick={() => setOpen(o => !o)}`
  - Envolvido conteúdo em `{open && (...)}` condicional

**Benefícios:**
- Reduz poluição visual — usuário controla quais quadrantes ver
- Tela mais curta por padrão — melhor overview inicial
- Padrão reutilizável para outras tabs com múltiplas seções

---

### 2026-03-20 (UI: Melhorar UX dos Gráficos "Evolução de Agendamentos" — Interatividade e Legenda)

#### Gráficos de Agendamentos sem interatividade, eixo X ou legenda clara

**Problema:** Os gráficos sparklines na aba "Evolução de Agendamentos" (SDRsTab) eram pouco informativos:
- Sem tooltip ao passar o mouse (dados ocultos)
- Sem eixo X exibindo datas (difícil saber período de cada barra)
- Legenda genérica no rodapé da seção, longe dos cards
- Aparência "decorativa" — não pareciam interativos
- Cores com baixa visibilidade (`rgba(..., 0.45)` / `rgba(..., 0.5)`)

**Solução implementada (commit `TBD`):**

1. **Tooltip ao hover:**
   - Estado React: `hoveredIdx` para rastrear barra hovereada
   - Exibe data formatada (DD/MM) + contagem de agendamentos
   - Posicionado acima da barra com triangle pointer
   - Opacity reduzida para barras não-hovereadas (feedback visual)

2. **Eixo X com datas:**
   - Padding SVG: `0 0 W H` → `0 0 W H+20`
   - Exibe ~4 datas espaçadas uniformemente (início, 1/3, 2/3, fim)
   - Formato: DD/MM (ex: "01/03", "10/03")
   - Cor: `rgba(0,0,0,0.4)` — sutil mas legível

3. **Legenda integrada em cada card:**
   - Removido texto genérico do rodapé da seção
   - Adicionada mini-legenda com quadrinhos de cor abaixo de cada gráfico:
     - ▪ Verde (`rgba(16,185,129,0.65)`) = acima do ritmo
     - ▪ Âmbar (`rgba(245,158,11,0.65)`) = abaixo do ritmo
     - ── Linha tracejada = ideal/dia (apenas se dailyIdeal > 0)

4. **Cores melhoradas (maior visibilidade):**
   - Verde: `rgba(52,211,153,0.5)` → `rgba(16,185,129,0.65)` (+13% contraste)
   - Âmbar: `rgba(245,158,11,0.45)` → `rgba(245,158,11,0.65)` (+44% contraste)
   - Linha ideal: `rgba(201,151,58,0.7)` → `rgba(201,151,58,0.9)` (mais visível)

5. **Linha de base sutil:**
   - Adicionada linha `y=H` com `stroke="rgba(0,0,0,0.08)"`
   - Visual: marca zero para dias sem agendamento (altura mínima)

**Arquivos alterados:**
- `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` — componentes `SDRSparkline` (linhas 69–140) e `AgendamentosSparklines` (linhas 398–480)

**Impacto:**
- Gráficos agora informativos: dados acessíveis via tooltip, contexto temporal claro, legenda visível
- UX melhorada: feedback visual ao hover, cores mais legíveis
- Sem legenda genérica no rodapé — cada card é auto-contido

---

### 2026-03-20 (UI: Aumentar Gráficos de Evolução de Agendamentos — SDRsTab)

#### Gráficos Evolução de Agendamentos muito pequenos para visualização

**Problema:** Os gráficos de sparklines na aba "Evolução de Agendamentos" eram muito pequenos (120×40 pixels), dificultando visualização clara das tendências de agendamento por SDR.

**Solução implementada (commit `TBD`):**

1. **Aumento de dimensões SVG:**
   - Largura: `120px` → `400px`
   - Altura: `40px` → `120px`
   - Resultado: 4.8× área visual para melhor legibilidade

2. **Ajuste de layout grid:**
   - Grid anterior: `grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4`
   - Grid novo: `grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`
   - Efeito: cada gráfico ocupa mais espaço horizontal, agora com wrapping inteligente

3. **Maior espaçamento e padding:**
   - Card padding: `p-3` → `p-4`
   - Spacing interno: `space-y-2` → `space-y-3`
   - Resultado: visual mais respirado e legível

**Arquivo alterado:** `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` (linhas ~425–430, SVGSparkline rendering)

**Impacto:** Gráficos agora ocupam ~50% da largura de tela em tablets/desktops, permitindo visualização clara de padrões semanais e mensais de agendamento.

---

### 2026-03-19 (Fix: Quadrant 2 "Aguardando Resposta do SDR" — Paginação Unificada)

#### Lista de leads "aguardando resposta" mostrava leads já respondidos

**Problema:** A aba "Leads Parados" → quadrante "Aguardando Resposta do SDR" exibia leads **que já haviam sido respondidos pelo SDR**, causando confusão e ação duplicada.

**Causa raiz:** Lógica com 2 queries separadas usando limites insuficientes:
- **Query 1 (Inbounds):** `.limit(500)` — truncava se houvesse >500 mensagens inbound nos últimos 30 dias
- **Query 2 (Outbounds):** `.limit(inboundContatoIds.length * 3)` — truncava respostas do SDR globalmente

Exemplo: 100 contatos com inbound → busca 300 outbounds no **sistema inteiro**. Se os 300 mais recentes não incluem a resposta do SDR para o contato X, essa resposta fica "invisível" e X entra erroneamente na lista de "aguardando".

**Solução implementada (commit `8dc4c87`):**

1. **Paginação unificada com `PAGE_SIZE=1000`:**
   - Uma única query em lugar de 2 separadas
   - Sem truncamento — busca TODAS as comunicações relevantes dos últimos 30 dias

2. **Filtro unificado:**
   ```typescript
   .or('direction.eq.inbound,and(direction.eq.outbound,ghl_source.eq.app)')
   ```
   - Inbound OU (outbound manual, isto é, app — não IA/automação)

3. **Semântica corrigida:**
   - Rastreia `latestPerContato` — última comunicação de cada contato (já ordenado DESC)
   - Se última = **inbound** → entra na lista (aguardando resposta do SDR)
   - Se última = **outbound** (app) → não entra (SDR já respondeu)

4. **Simplificação:**
   - Removeu verificação desnecessária `if (latestOut && latestOut > inbound.data)` — já é tratada no filtro

**Arquivo alterado:** `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` (linhas 505–603)

**Índices que cobrem a query:**
- ✅ `idx_comunicacoes_direction_source` — filtro `.or(...)`
- ✅ `idx_comunicacoes_data_comunicacao DESC` — ordenação

**Impacto:** Lista agora exibe **apenas leads que de verdade aguardam resposta do SDR**, sem falsos positivos de leads já respondidos.

---

### 2026-03-13 (Fix: Contar Apenas SMS e WhatsApp na Coluna 'Msgs' do Leaderboard SDR)

#### Leaderboard de SDRs contava todos os canais como "mensagens"

**Problema:** A coluna "Msgs" no leaderboard SDR contabilizava **todos os canais de comunicação** como "mensagens":
- SMS ✅
- WhatsApp ✅
- Email ❌ (contado incorretamente)
- Facebook Messenger ❌ (contado incorretamente)
- Instagram DM ❌ (contado incorretamente)
- Chat do site ❌ (contado incorretamente)

Resultado: número inflacionado de "mensagens" por SDR.

**Causa raiz:** O código usava um `else` genérico na contagem:
```typescript
if (c.channel === 'call') entry.ligacoes++
else entry.mensagens++  // ← pega TUDO que não é call
```

**Solução implementada (commit `81f2182`):**

1. **Filtro na query:** Adicionar `.in('channel', ['call', 'whatsapp', 'sms'])` para trazer só esses canais do banco.
2. **Contagem explícita:** Trocar `else` por checagem específica:
   ```typescript
   if (c.channel === 'call') entry.ligacoes++
   else if (c.channel === 'whatsapp' || c.channel === 'sms') entry.mensagens++
   ```

**Filtros mantidos (já estavam corretos):**
- `direction = 'outbound'` → só mensagens enviadas pelo time
- `ghl_source = 'app'` → só digitadas manualmente (não automação/IA)

**Arquivo alterado:** `eb-dash2/src/hooks/useSDRLeaderboard.ts`

**Impacto:** Coluna "Msgs" agora exibe **apenas contagem correta de SMS + WhatsApp enviados manualmente**.

---

### 2026-03-18 (Fix: Restaurar Preenchimento da Tabela vendas_fechamento)

#### Tabela vendas_fechamento estava VAZIA — Trigger recriado com campos CORRETOS

**Problema:** Dashboard não exibia dados de faturamento. Investigação revelou que a tabela `vendas_fechamento` tinha 0 registros de ~4916 oportunidades. Conforme documentação, deveria ser preenchida automaticamente.

**Causa raiz:** Migration `20260317000000` removeu o PASSO 3 de `extrair_dados_ghl()` que tentava preencher `vendas_fechamento`, mas **não criou trigger para substituir** a funcionalidade.

**Solução implementada (2 steps):**

1. **Migration `20260318040000_create_trigger_vendas_fechamento.sql`:**
   - Criado trigger `tr_extrair_vendas_fechamento` que dispara após INSERT em `webhooks_ghl`
   - Função `extrair_vendas_fechamento_do_webhook()` extrai campos de faturamento
   - ⚠️ **Problema descoberto:** Usava nomes de campos ERRADOS (ex: `{{ opportunity.valor_entrada }}` não existia)
   - Resultado: 4.864 registros criados mas TODOS com valor zero

2. **Migration `20260318060000_fix_trigger_vendas_fechamento_correct_field_names.sql` (CORREÇÃO):**
   - Corrigidos nomes de campos para os que REALMENTE existem no GHL:
     - ✅ `{{ opportunity.valor_a_ser_pago_de_entrada }}` (entrada)
     - ✅ `{{ opportunity.numero_parcelas }}` (parcelas)
     - ✅ `{{ opportunity.valor_parcela }}` (valor por parcela)
     - ✅ `{{ opportunity.data_pagamento_entrada }}` (data pagamento)
     - ✅ `{{ opportunity.cpf_ou_cnpj_do_contratante }}` (cpf/cnpj)
     - ✅ `{{ opportunity.complemento_do_endereo }}` (endereço complemento)
   - Backfill reprocessou webhooks com dados reais
   - Resultado: **45 registros com faturamento real**, total de **R$ 1.494.611,15**

**Status FINAL:**
- ✅ Trigger ativo e corrigido — futuros webhooks com faturamento preenchidos automaticamente
- ✅ 45 registros com valores reais preenchidos
- ✅ Total faturado: R$ 1.494.611,15
- ✅ Cálculo: `valor_faturado = valor_entrada + (numero_parcelas × valor_parcela)`
- ✅ Dashboard **já exibe dados de faturamento corretamente**

**Documentação atualizada:** `docs/TABELAS-SISTEMA.md` — seção 2.4 `vendas_fechamento` agora documentar nomes de campos corretos.

---

### 2026-03-17 (Novo: Sincronização Completa de Oportunidades por Contato)

#### Edge function sync-contact-opportunities — Resolvendo leads "invisíveis"

**Problema:** Webhooks GHL enviam apenas **1 oportunidade por evento ContactCreate**. Se um contato foi importado em massa ou é um lead reativado com múltiplas oportunidades em estágios diferentes, somente a primeira opção chega ao banco — as outras ficam invisíveis no dashboard até que webhooks delas cheguem naturalmente (se chegarem).

**Exemplo:** Importação de 1000 contatos, cada um com ~3–5 opps em estágios variados. Dashboard exibe apenas 1 opp por contato. As outras 2000–4000 opps desaparecem.

**Solução implementada:**

1. **Nova tabela `contact_opp_sync_queue`** (deduplicada com `UNIQUE INDEX WHERE status='pending'`)
   - Armazena contatos enfileirados para sincronização
   - Status: `pending` → `processing` → `done` / `error`
   - Max 3 tentativas antes de marcar como erro

2. **Trigger `tr_enqueue_contact_opp_sync`** (automático)
   - Monitora `webhooks_ghl` INSERT com `type='ContactCreate'`
   - Enfileira `contact_id` para sincronização
   - Deduplicação automática: mesmo contato não entra 2x em `pending`

3. **Edge function `sync-contact-opportunities`**
   - Cron: a cada 5 minutos, batch=20 contatos (máximo 50)
   - Para cada contato:
     a. Chama API GHL `GET /opportunities/search?contact_id=X` (paginado)
     b. UPSERT todas as oportunidades retornadas em `oportunidades`
     c. Marca como `done` ou `error` (max 3 tentativas)
   - Rate limit: idêntico ao `sync-opp-dates` (130ms base + adaptativo)

4. **Proteções contra importação em massa:**
   - Deduplicação SQL: `UNIQUE WHERE status='pending'`
   - Batch controlado: 20 contatos/exec (máximo 50)
   - Processamento sequencial: respeita rate limit GHL (100 req/10s)
   - Retry automático: max 3 tentativas, depois `status='error'` (não trava a fila)

**Resultado esperado:**
- Importação de 1000 contatos: ~3 horas até sincronizar TODAS as opps
- Dashboard exibe 100% das oportunidades, não apenas a primeira por contato
- Funcionamento transparente — nenhuma ação manual necessária

**Arquivos adicionados:**
- `supabase/migrations/20260317100000_create_contact_opp_sync_queue.sql` — tabela + índices
- `supabase/migrations/20260317200000_trigger_contact_opp_sync_on_webhook.sql` — trigger + funções + cron
- `supabase/functions/sync-contact-opportunities/index.ts` — edge function (deployed)

**Documentação:**
- `docs/SYNC-OPP-DATES.md` — nova seção completa (endpoint, API, rate limit, monitoramento)

---

### 2026-03-16 (Fix: Bug Sistemático no Nome do Contato)

#### Root cause: UPDATE não-determinístico em modo batch da função extrair_dados_ghl

**Problema identificado:**
Contato `paulopessoanutri@gmail.com` (ghl_id: `dyRsH4a4Eev2eCIUbLTT`) tinha nome **"Juliana Menezes Maia"** no dashboard, quando o correto era **"Paulo Cezar Rodrigues Pessoa"**.

**Causa raiz:**
A função `extrair_dados_ghl()` quando chamada em modo batch (`p_webhook_id IS NULL`) fazia UPDATE com JOIN simples:
```sql
UPDATE contatos c FROM webhooks_ghl w WHERE c.ghl_id = TRIM(w.payload->>'contact_id')
```
Como existiam 14 webhooks diferentes para o mesmo contato com nomes distintos, PostgreSQL **não garantia qual linha do JOIN seria usada**. Se pegasse webhook antigo com "Juliana Menezes Maia", o nome voltava para errado.

**Evidência:** `contatos.updated_at = 2026-03-11 20:44:51` coincide com data da migration `20260311190000` que redefiniu a função sem COALESCE. O cron rodou e pegou webhook antigo aleatoriamente.

**Solução (migration `20260316100000_fix_contatos_nome_update_deterministic.sql`):**
1. **UPDATE determinístico:** Usar `DISTINCT ON (contact_id)` + `ORDER BY created_at DESC` para pegar APENAS o webhook mais recente por contato
2. **Backfill específico:** Contato `paulopessoanutri@gmail.com` corrigido para "Paulo Cezar Rodrigues Pessoa"
3. **Backfill em massa:** Identificar e corrigir todos os contatos onde nome banco ≠ nome do último webhook

**Resultado:**
- ✅ Contato paulopessoanutri@gmail.com: **Paulo Cezar Rodrigues Pessoa**
- ✅ 19 contatos adicionais com divergência foram corrigidos
- ✅ Futuras chamadas de `extrair_dados_ghl()` são determinísticas mesmo em batch

**Arquivos alterados:** `supabase/migrations/20260316100000_fix_contatos_nome_update_deterministic.sql`

---

### 2026-03-15 (Filtro Tráfego Pago + Auditoria de Timezone)

#### Filtro: Painel Tráfego exibe apenas leads com utm_source cadastrado

**Contexto:** O painel exibia todos os leads do período, incluindo orgânicos (utm_source nulo ou sem cadastro em `utm_sources`). A intenção documentada em `docs/PAINEL-TRAFEGO-PAGO.md` é exibir somente tráfego pago.

**Mudança em `eb-dash2/src/hooks/useTrafego.ts`** (linhas 421-437):
- Após paginação, filtra `allRows` para manter apenas leads com `contatos.utm_source` presente em `pagoSources`
- `setExcludedCount` passa a receber o número real de leads excluídos (leads orgânicos/sem UTM)
- Failsafe: se `utm_sources` estiver vazia → sem filtro (comportamento anterior)
- Filtro "Canal" continua funcionando dentro do universo filtrado

**`docs/PAINEL-TRAFEGO-PAGO.md`** — corrigido: filtro é client-side (não server-side como indicava antes) + documentado comportamento de `excludedCount`.

#### 2ª Auditoria de Timezone — Sistema Limpo

Auditoria completa de 9 edge functions + 58 arquivos TypeScript/TSX + 109 migrations. **Nenhum bug remanescente.**

Simplificação de código duplicado (sem mudança de comportamento):
- `TrafegoTab.tsx` e `PreVendasPage.tsx`: preset "Este mês" simplificado de double `toLocaleDateString` para `spToday().slice(0,7)+'-01'`

**`docs/PADRAO-TIMEZONE.md`** — nova seção: "UTC é correto para comparações de duração com TIMESTAMPTZ".

---

### 2026-03-13 (Sync de Comunicações Quase em Tempo Real)

#### Webhook trigger imediato para sync de comunicações

**Contexto:** O cron antigo rodava a cada 30 minutos — mensagens de SDRs podiam demorar até 30 min para aparecer no dashboard.

**Mudanças:**

**1. `supabase/functions/webhook-ghl/index.ts`** — Após salvar o payload no banco, detecta se é evento de mensagem:
- Critério: `payload.conversationId` existe OU `payload.type` é `InboundMessage`/`OutboundMessage`
- Se positivo: dispara `sync-ghl-conversations` com `mode: incremental` em **fire & forget** (sem `await`)
- O GHL recebe o `200 OK` imediatamente; o sync acontece em paralelo em ~5–15 segundos
- Erros do sync são silenciados (`.catch(() => {})`) — o cron de fallback cobre eventuais falhas

**2. `supabase/migrations/20260313250000_update_ghl_sync_cron_to_10min.sql`** — Cron atualizado de `*/30` → `*/10`:
- Funciona como **rede de segurança** para mensagens que o webhook não cobriu
- Consumo: ~23k req/dia (11,5% do limite de 200k da GHL API)

**Fluxo resultante:**
```
GHL envia webhook de mensagem
  → webhook-ghl salva payload + dispara sync (fire & forget)
  → 200 OK enviado ao GHL imediatamente
  → sync-ghl-conversations roda em paralelo: UPSERT em comunicacoes
  → mensagem aparece no dashboard em ~5–15 segundos

[a cada 10 min — fallback]
  → cron cobre qualquer mensagem que o webhook não tenha disparado
```

**Arquivos alterados:** `supabase/functions/webhook-ghl/index.ts`, `supabase/migrations/20260313250000_update_ghl_sync_cron_to_10min.sql`, `docs/COMUNICACOES-GHL-SYNC.md`

---

### 2026-03-15 (Auditoria de Timezone — 2ª Rodada: Sistema Limpo)

#### Resultado: Nenhum bug de timezone remanescente

2ª auditoria completa cobriu 9 edge functions, 58 arquivos TypeScript/TSX e 109 migrations. Todos os falsos alarmes levantados foram verificados e descartados:

- `new Date(Date.now() - Nh).toISOString()` em `LeadsParadosTab.tsx` — **CORRETO** (duração absoluta, não dia de calendário)
- `new Date().toISOString()` em colunas de audit log (`sync-meta-ads`) — **CORRETO** (UTC é TIMESTAMPTZ válido)
- `new Date(startDate + 'T00:00:00')` em `SDRsTab.tsx` — **CORRETO** (browser SP interpreta como local)

#### Refactor: remoção de código duplicado em presets "Este mês"

**`eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`** e **`eb-dash2/src/pages/prevendas/PreVendasPage.tsx`** — preset "Este mês" recalculava `YYYY-MM` via dois `toLocaleDateString()` em vez de reutilizar `spToday()` já importada:

```ts
// ANTES (duplicado)
const now = new Date()
const y = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 4)
const m = now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(5, 7)
return { s: `${y}-${m}-01`, e: spToday() }

// DEPOIS (conciso, comportamento idêntico)
const today = spToday()
return { s: today.slice(0, 7) + '-01', e: today }
```

Comportamento visual: idêntico. `spToday()` já usa `toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })` internamente.

#### Documentação: PADRAO-TIMEZONE.md

Nova seção **"UTC é correto para comparações de duração com TIMESTAMPTZ"** — documenta a distinção entre "duração absoluta" (UTC correto) vs "dia de calendário em SP" (exige `toSPISOStart/End`).

---

### 2026-03-15 (Auditoria de Timezone — 3 Fixes Adicionais)

#### Fix 1 (CRÍTICO) — `useSDRLeaderboard.ts`: offset UTC em queries TIMESTAMPTZ

**Problema:** filtro de `data_comunicacao` usava `+00:00` (UTC), deslocando o período 3h. Ligações e mensagens do início do dia sumiam do leaderboard dos SDRs.

**Correção em `eb-dash2/src/hooks/useSDRLeaderboard.ts`:**
- Import adicionado: `toSPISOStart, toSPISOEnd` de `@/lib/utils/dates`
- `startISO`/`endISO` agora usam `toSPISOStart(startDate)` / `toSPISOEnd(endDate)` → emitem `-03:00`

#### Fix 2 (MÉDIO) — `sync-meta-ads-backfill/index.ts`: `formatDate` retornava dia UTC

**Problema:** `toISOString().split('T')[0]` retorna data em UTC. Após 21:00 SP (00:00 UTC do dia seguinte), `dataFim` sem parâmetro incluía um dia a mais que o esperado.

**Correção em `supabase/functions/sync-meta-ads-backfill/index.ts`:**
- `formatDate` substituída por `toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })` → data sempre em SP

#### Fix 3 (FRÁGIL) — `LeadsParadosTab.tsx`: `new Date/Math.max/toISOString` em colunas DATE

**Problema:** conversão de strings `YYYY-MM-DD` para `Date` (UTC midnight) e de volta para ISO gerava imprecisão de horas em `daysAgo()`.

**Correção em `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx`:**
- `lastTentativa` agora usa `reduce((max, d) => d > max ? d : max)` — strings `YYYY-MM-DD` ordenam lexicograficamente, sem conversão de `Date`

#### Documentação
- `docs/PADRAO-TIMEZONE.md`: nova seção "Armadilha: `+00:00` em queries TIMESTAMPTZ no frontend"

---

### 2026-03-15 (Correção now_brasil() + computeAvgCycle — Bugs de Timezone)

#### Bug crítico no banco: now_brasil() gravava webhooks_ghl.created_at com 3h a menos

**Causa raiz:** `timezone('America/Sao_Paulo', now())` em PostgreSQL retorna `timestamp` **sem** timezone. Declarado como `RETURNS timestamptz`, o Postgres fazia cast implícito reinterpretando a hora local como UTC — resultado 3 horas atrasado.

```sql
-- Exemplo às 18:00 UTC (15:00 SP):
-- timezone('America/Sao_Paulo', now()) = "15:00:00" (sem tz)
-- cast para timestamptz               = "15:00:00+00"  ← 3h errado
```

A migration `20260219093409` definiu esse valor como DEFAULT de `webhooks_ghl.created_at`. Todos os webhooks desde então tinham `created_at` 3 horas antes do real.

**Arquivos criados:**
- `supabase/migrations/20260315500000_fix_now_brasil_e_webhooks_created_at.sql`
  - `webhooks_ghl.created_at` DEFAULT resetado para `now()`
  - `now_brasil()` dropada (sem uso, semanticamente errada)

#### Bug no frontend: computeAvgCycle misturava TIMESTAMPTZ com DATE em cálculo de ms

**Causa raiz:** `new Date("2026-03-07").getTime()` em JS interpreta coluna `DATE` como UTC midnight → imprecisão de horas no cálculo de ciclo médio de vendas.

**Correção em `eb-dash2/src/hooks/useTrafego.ts`:**
- `data_lead_recebido` (TIMESTAMPTZ) → `tsToSPDate()` converte para "YYYY-MM-DD" em SP
- `data_fechado` (DATE) → já é "YYYY-MM-DD", usado direto
- Diferença calculada com `Date.UTC(y, m-1, d)` — determinístico, sem DST

---

### 2026-03-15 (Trigger Imediato para sync-opp-dates)

#### Feature: Disparar sync-opp-dates ao inserir oportunidade nova

**Adição:** Trigger `tr_sync_opp_dates_on_insert` na tabela `oportunidades`.

**Comportamento:** Quando uma oportunidade nova chega via webhook com `data_lead_recebido = NULL` e `ghl_opportunity_id != NULL`, dispara **instantaneamente** a função `sync_opp_dates_job()`.

**Complementaridade com cron:**
- **Trigger (imediato):** Sincroniza dados novos no mesmo segundo que chegam
- **Cron (10 min):** Fallback para oportunidades perdidas, falhas, ou retries

**Arquivo:** `supabase/migrations/20260313235000_add_sync_opp_dates_trigger.sql`

**Documentação:** `docs/SYNC-OPP-DATES.md` (seção "Disparadores")

---

### 2026-03-15 (Correção de Bugs de Timezone no Frontend — Auditoria Completa)

#### Bug: datas exibidas com 1 dia a menos em AnunciosTab e OrganicoTab

**Causa raiz:** `new Date("2026-03-07")` — JavaScript interpreta strings `DATE` como **UTC midnight**. Em SP (UTC-3), isso equivale a 21:00 do dia anterior, fazendo `toLocaleDateString('pt-BR')` exibir o dia errado (ex: 06/03 em vez de 07/03).

**Arquivos corrigidos:**
- `eb-dash2/src/pages/traqueamento/tabs/AnunciosTab.tsx` — `available_date` agora usa `fmtDate()`
- `eb-dash2/src/pages/traqueamento/tabs/OrganicoTab.tsx` — idem

#### Bug: `joined_at` sem timezone em páginas de usuários

**Causa raiz:** `toLocaleDateString('pt-BR')` sem `timeZone: 'America/Sao_Paulo'` usa timezone local do browser — não garante SP.

**Arquivos corrigidos:**
- `eb-dash2/src/pages/SettingsPage.tsx` — `joined_at` agora usa `fmtDate()`
- `eb-dash2/src/pages/settings/UsersPage.tsx` — idem

#### Bug: filtro Supabase em coluna DATE usando `.toISOString()`

**Causa raiz:** `LeadsParadosTab.tsx` filtrava `data_agendamento_reuniao` (coluna `DATE`) com `now.toISOString()` (ex: `"2026-03-13T18:30:00Z"`). PostgreSQL ao comparar `DATE` com timestamp usa cast em UTC, podendo incluir/excluir reuniões do dia errado.

**Arquivo corrigido:**
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` — `loadAlerts()` agora usa `spToday()`, `spDaysAgo(-2)` e `spDaysAgo(30)`

#### Melhoria: `toLocaleDateString('sv-SE')` sem timezone em geração de listas de datas

**Causa:** Dependência implícita do timezone do sistema operacional do browser.

**Arquivos corrigidos:**
- `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` — `toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })`
- `eb-dash2/src/hooks/useTrafego.ts` — idem (`computeCostPerMqlSeries`)

---

### 2026-03-15 (Centralizar Utilitários de Data — Colunas DATE no banco)

#### Mudança Arquitetural: colunas de pipeline de TIMESTAMPTZ para DATE

**Motivação:** Datas de pipeline do GHL (conectado, fechado, tentativas etc.) chegam sem significado de hora. Guardar como `TIMESTAMPTZ` adicionava complexidade desnecessária de timezone em queries e no frontend.

**O que mudou:**
- 23 colunas de pipeline em `oportunidades` alteradas de `TIMESTAMPTZ` para `DATE` (sem hora, sem fuso)
- `parse_safe_date()` e `parse_date_flexible()` agora retornam `DATE` (antes `TIMESTAMPTZ`)
- Frontend: novo arquivo `eb-dash2/src/lib/utils/dates.ts` centraliza todos os utilitários de data
- Queries de filtro por colunas DATE usam YYYY-MM-DD direto (sem offset `-03:00`)
- `data_lead_recebido` **permanece TIMESTAMPTZ** — vem da API GHL via `sync-opp-dates`

**Arquivos criados:**
- `supabase/migrations/20260315100000_alterar_datas_oportunidades_para_date.sql`
- `supabase/migrations/20260315200000_simplificar_parse_safe_date_retorna_date.sql`
- `supabase/migrations/20260315300000_simplificar_parse_date_flexible_retorna_date.sql`
- `supabase/migrations/20260315400000_atualizar_extrair_dados_ghl_para_date.sql`
- `eb-dash2/src/lib/utils/dates.ts` — funções: `fmtDate`, `fmtDateTime`, `fmtMsgDate`, `spToday`, `spDaysAgo`, `tsToSPDate`, `toSPISOStart`, `toSPISOEnd`

**Arquivos modificados:**
- `eb-dash2/src/hooks/useTrafego.ts` — importa utils de `dates.ts`, remove definições locais
- `eb-dash2/src/hooks/usePreVendas.ts` — idem
- `eb-dash2/src/hooks/useCohort.ts` — usa `tsToSPDate` de `dates.ts`
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx` — importa `fmtDateTime` de `dates.ts`
- `eb-dash2/src/components/leads/LeadCard.tsx` — importa `fmtDate`, `fmtDateTime`, `fmtMsgDate`
- `eb-dash2/src/pages/leads/LeadsPage.tsx` — importa `fmtDate`, `spToday`, `spDaysAgo` de `dates.ts`
- `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` — simplifica `data_agendamento_reuniao` (DATE direto)
- `docs/PADRAO-TIMEZONE.md` — reescrito para refletir modelo DATE vs TIMESTAMPTZ

---

### 2026-03-14 (data_lead_recebido via API GHL + Excluir Pipeline Recuperação)

#### Mudança Arquitetural: data_lead_recebido migrada do webhook para API GHL

**Problema:** `data_lead_recebido` era extraída do webhook com fallbacks imprecisos:
- Campos customizados `mqlleads_recebidos` (sujeitos a inversão MM/DD)
- `date_created` do webhook (poderia estar errado, ex: danieltiago107@gmail.com → outubro)
- Resultado: centenas de leads invisíveis nos dashboards por datas incorretas

**Solução:**
- API GHL `GET /opportunities/{id}` retorna `createdAt` — data imutável, confiável, sem ambiguidade
- Nova edge function `sync-opp-dates` busca e preenche `data_lead_recebido` via API
- Webhook (`extrair_dados_ghl`) **não toca mais** em `data_lead_recebido`

**Arquivos criados/modificados:**
- `supabase/migrations/20260314100000_remover_data_lead_recebido_do_webhook.sql` — reescrita de `extrair_dados_ghl()`: INSERT usa NULL, UPDATE não toca o campo
- `supabase/migrations/20260314200000_limpar_data_lead_recebido.sql` — zera todas as datas para repopular via API
- `supabase/functions/sync-opp-dates/index.ts` — nova edge function com rate limiting (130ms/req, backoff 429)
- `supabase/migrations/20260314300000_create_sync_opp_dates_cron.sql` — cron a cada 10 min, batch=100
- `docs/SYNC-OPP-DATES.md` — documentação da nova edge function
- `CLAUDE.md` — removido bloco "Fallbacks obrigatórios", adicionada regra API GHL

**Aviso de downtime:** dashboards ficam sem dados de data durante backfill (~9h cron / ~2h manual com batch=500)

#### Nova Regra: Pipeline Recuperação excluído dos painéis

**Pipeline:** `Sn1Guqcm6zwZNTVOOf5L` ("Recuperação") = leads antigos reativados, não novos leads gerados.

**Arquivos:**
- `eb-dash2/src/lib/constants.ts` — `PIPELINE_RECUPERACAO_ID` e `PIPELINES_EXCLUIDOS`
- `eb-dash2/src/hooks/useTrafego.ts` — `.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)`
- `eb-dash2/src/hooks/usePreVendas.ts` — `.neq('pipeline_id', PIPELINE_RECUPERACAO_ID)`

`useCohort.ts` já é coberto — recebe dados filtrados dos hooks acima, sem query própria.

---

### 2026-03-13 (Datas Inconsistentes — Bug Crítico Sistêmico Corrigido)

#### Bug Crítico: 722+ leads com datas parseadas errado (MM/DD invertido)

**Problema:** Centenas de leads tinham datas em `data_lead_recebido`, `data_conectado`, `data_fechado` etc. parseadas **para meses futuros** — não visíveis no painel.
- Exemplo real: contato criado em fevereiro (2026-02-12), mas `data_lead_recebido = 2026-12-02` ❌
- Causa: GHL envia campo customizado em formato `DD/MM/YYYY`; parser antigo estava tratando como `MM/DD`
- Lead danieltiago107@gmail.com: data parseada para outubro/setembro, invisível em fevereiro

**Escala do impacto:**
- 722 opps com `data_lead_recebido > NOW()+15d`
- 331 opps com `data_conectado > NOW()+15d`
- 232 opps com `data_perdido > NOW()+15d`
- ... e mais em outros campos (total > 1000 registros afetados)
- **Período afetado:** Qualquer lead processado durante versão incorreta do parser

**Root cause identificado:**
1. **Parser MM/DD invertido** — convertia "12/02/2026" → dezembro ao invés de fevereiro
2. **COALESCE "preserva existente"** — UPDATE de opps usava `COALESCE(o.data_conexao, webhook_value)`
   - Isso significa "mantém valor existente se tem, preenche se NULL"
   - **Resultado:** datas erradas NUNCA eram sobrescritas — persistiam forever
3. **Função parse_date_flexible não era controlada** — existia no banco mas sem migration

**Solução implementada (3 migrations):**

1. **Migration 20260313100000** — Criar `parse_date_flexible` como versão controlada
   - Reutiliza `parse_safe_date` (parsing correto DD/MM/YYYY)
   - Adiciona validação de range: rejeita datas < 2020-01-01 ou > NOW()+30d
   - Se validação falha, retorna NULL → permite fallback correto

2. **Migration 20260313200000** — Reescrever `extrair_dados_ghl()` com nova regra
   - **Nova regra:** Webhook é fonte de verdade (não "preserva existente")
   - **COALESCE invertido:** `COALESCE(parse_date_flexible(...), o.data_conectado)`
     - Agora: usa webhook se veio, mantém existente se não veio
     - Resultado: datas erradas podem ser corrigidas na próxima atualização
   - **Adiciona `data_lead_recebido` ao UPDATE** (nunca era atualizada antes!)
   - Aplica a nova regra a **todas as 18 datas de pipeline**

3. **Migration 20260313300000** — Backfill histórico
   - **PRÉ:** 722 opps com `data_lead_recebido` futura
   - **Ação:** Remover todos os valores futuros > 15d em todos os campos de data
   - **PÓS:** ✅ Tudo zerou para 0
   - **Fix explícito:** danieltiago107@gmail.com restaurado para 2026-02-10

#### Recuperação Final: danieltiago107@gmail.com Agora 100% Completo ✅

**Contexto:** Após aplicar backfill, descobriu-se que o lead ainda não aparecia no painel.

**Diagnóstico identificou 3 problemas:**

1. **Mismatch de IDs:**
   - Banco: `ghl_opportunity_id = 73a0bc40-584f-4eed-9e2d-938d2cac7e22` (UUID)
   - Webhooks: `payload_id = ezFeX5Cs2pVHqIFfX6eN` (GHL format)
   - Nenhuma correspondência → webhook não era encontrado

2. **Campos Críticos Faltando:**
   - `data_lead_recebido = NULL` (foi restaurado no backfill anterior, mas precisava confirmação)
   - `data_fechado = NULL` (nunca foi extraído do webhook)

3. **Valor Zerado:**
   - `valor = 0.00` (nenhum webhook tinha lead_value, é normal para esse lead)

**Solução (4 migrations diagnóstico + correção):**

- **20260313400000:** Diagnóstico + restaurar `data_lead_recebido = 2026-02-10` ✅
- **20260313600000:** Buscar todos os webhooks do lead (encontrou 12) ✅
- **20260313800000:** Confirmar que `ghl_opportunity_id = ezFeX5Cs2pVHqIFfX6eN` já estava correto ✅
- **20260313900000:** Extrair `data_fechado = 2026-03-09 12:21:00` dos customData ✅

**Resultado Final:**
```
Email: danieltiago107@gmail.com
Data criação contato: 2026-02-10 14:50:10
Pipeline: Vendas SQL
├─ ghl_opportunity_id: ezFeX5Cs2pVHqIFfX6eN ✅
├─ data_lead_recebido: 2026-02-10 ✅ (FEVEREIRO — agora será filtrado corretamente)
├─ data_fechado: 2026-03-09 12:21 ✅ (venda fechada em março)
├─ status: won ✅
└─ valor: 0.00 (nenhum valor no webhook original)
```

**Por que agora aparece:** O painel Fevereiro filtra `data_lead_recebido BETWEEN 2026-02-01 AND 2026-02-28`. Lead tem `data_lead_recebido = 2026-02-10`, então **aparecerá corretamente** ✅

**Verificação pós-fix:**
```
PRÉ-BACKFILL: 722 opps com data_lead_recebido > NOW()+15d
...
PÓS-BACKFILL: 0 opps com data_lead_recebido > NOW()+15d ✅
```

**Documento de referência:** `docs/webhooks-ghl/REGRAS-EXTRACAO.md` seção "Regras de Atualização"

---

### 2026-03-13 (Frontend — Painel Tráfego: Simplificar filtro MQL)

#### Melhoria de UX: Remover opção nMQL e padronizar filtro com Pré-Vendas

**Mudança:** Painel Tráfego agora segue o mesmo padrão visual e funcional do painel Pré-Vendas para filtro de MQL.

**O que mudou:**
- **Antes:** Filtro com 3 opções (Todos, MQL, nMQL) em linha separada com label "Funil:"
- **Depois:** Filtro com 2 opções (Todos, MQL) integrado na linha de filtros de dimensão, alinhado à direita

**Alterações técnicas:**
- `TrafegoFilters.mqlFilter`: tipo `'all' | 'mql' | 'nmql'` → `'all' | 'mql'`
- `applyMqlFilter()`: removido case para 'nmql'
- `TrafegoTab.tsx`: integrado filtro MQL ao final da row de filtros (com `ml-auto`)
- Removida linha separada com botões MQL/nMQL
- Removida variável não usada `excludedCount`

**Resultado:** Consistência visual entre painéis — ambos seguem mesmo padrão de filtro MQL.

**Referência:** Padrão copiado de `PreVendasPage.tsx` (linhas 224-238)

---

### 2026-03-12 (Painel Tráfego — Discrepância Funil vs Cohort corrigida)

#### Bug: Funil (751) não alinhava com Cohort (748) — 3 leads faltando
- **Problema:** `startOfMonth()` em useCohort.ts usava date-part literal do timestamp UTC, sem converter para SP
  - Um lead com `data_lead_recebido = '2026-03-01T00:30:00Z'` em SP = 28/fev ~21:30 (deveria estar em fevereiro)
  - Mas era agrupado em março → excluído pelo filter `boundedRows` (só mostra período selecionado)
- **Impacto:** Funil mostrava 751 leads, cohort mostrava 748 — discrepância de 3 leads em fronteira de mês
- **Root Cause:** 2 camadas de erro:
  1. `startOfMonth()` não convertia para SP antes de extrair mês
  2. Commit 017f844 adicionou 2ª query de leads sem data + bucket "Sem data" (solução errada)
- **Correção (3 ações):**
  1. **useCohort.ts (46-51):** Corrigir `startOfMonth()` para converter para SP
     ```typescript
     const d = new Date(dateStr)
     const spDate = d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
     return `${spDate.slice(0, 7)}-01`
     ```
  2. **useCohort.ts (73-84, 129-155, 158-160):** Remover bucket "Sem data" — leads sem `data_lead_recebido` não devem aparecer ao filtrar período
  3. **useTrafego.ts (433-461)** + **usePreVendas.ts (178-197):** Reverter queries de leads sem data
- **Resultado:** Funil = Cohort = 751 ✅

### 2026-03-12 (Painel Tráfego — 3 bugs corrigidos)

#### Bug 1: Timezone errado no filtro de data (useTrafego.ts)
- **Problema:** `toSPISOStart/End` usavam `+00:00` (UTC) em vez de `-03:00` (SP)
- **Impacto:** Leads das primeiras 3h de cada dia ficavam fora do cohort selecionado
- **Correção:** `+00:00` → `-03:00` nas duas funções helper

#### Bug 2: Canal filter nunca funcionava (TrafegoTab.tsx)
- **Problema:** `<option value={ch.nome}>` usava nome amigável como value, mas o filtro comparava com `utm_source` (slug)
- **Impacto:** Selecionar qualquer canal retornava 0 leads — comparação sempre falhava
- **Correção:** `value={ch.slug}` com exibição `{ch.nome}{ch.slug !== ch.nome ? ` (${ch.slug})` : ''}`

#### Bug 3: Filtros Meta não cruzavam com leads CRM (useTrafego.ts)
- **Problema:** `filters.ad` e `filters.campaign` filtravam só linhas de Meta Ads; MQLs e funil de leads ficavam sem filtro
- **Impacto:** Custo por MQL incorreto ao filtrar por anúncio ou campanha Meta
- **Correção:** Cross-filter adicionado — `filters.ad` → `contatos.utm_term`; `filters.campaign` → `utm_campaigns` → `contatos.utm_campaign`
- **Nota:** `filters.adset` continua filtrando só Meta Ads (conjuntos não têm campo correspondente em contatos — comportamento correto)

### 2026-03-12

#### Correção: 12 Bugs no Módulo Pré-Vendas

**Data:** 2026-03-12
**Archivos:** 5 arquivos modificados (`useSDRLeaderboard.ts`, `LeadsParadosTab.tsx`, `PreVendasPage.tsx`, `useCohort.ts`, `SDRsTab.tsx`)

##### CRÍTICOS (afetam dados exibidos ao usuário)

- **BUG-01:** `useSDRLeaderboard` — Campo `tipo` não existe em dados novos da API GHL
  - **Problema:** Query usava `.in('tipo', ['ligacao', 'mensagem'])` mas API GHL Conversations (2026-03-11+) usa `channel` (call, whatsapp, sms, etc.)
  - **Impacto:** Colunas "Ligações" e "Mensagens" mostravam ZERO para todos os SDRs pós 2026-03-11
  - **Correção:** Substituído para `.eq('channel', 'call')` para ligações, resto como mensagens

- **BUG-02:** `useSDRLeaderboard` — Usa `created_at` ao invés de `data_comunicacao`
  - **Problema:** `created_at` é o timestamp do Supabase (momento da inserção), não a data real da mensagem
  - **Impacto:** Mensagens de backfill mostravam data incorreta (sync de dias depois)
  - **Correção:** Trocado para `.gte('data_comunicacao', ...)` + timezone `+00:00` para consistência com usePreVendas

- **BUG-03:** `LeadsParadosTab` — Quadrantes 1 & 2 usam `created_at`
  - **Problema:** 4 lugares na query: selects (448, 450), order by (450), filters (502-503), comparações (468)
  - **Impacto:** Leads parados mostravam última comunicação com data incorreta
  - **Correção:** Todos os usos trocados para `data_comunicacao`

##### IMPORTANTES (lógica incorreta)

- **BUG-04:** `LeadsParadosTab` — Quadrante 2 inclui respostas de automação
  - **Problema:** Query de outbound não filtrava `ghl_source`, incluindo bots e workflows
  - **Impacto:** Leads desapareciam da fila "Aguardando SDR" quando bot respondia (mesmo sem SDR ver)
  - **Correção:** Adicionado `.eq('ghl_source', 'app')` para contar apenas respostas humanas

- **BUG-05:** `PreVendasPage` — Revenue KPIs ignoram filtro MQL
  - **Problema:** `computeRevenueKpis(revenueRows)` usando dados não filtrados
  - **Impacto:** Ao ativar "Apenas MQL", faturamento continuava mostrando total (nMQLs inclusos)
  - **Correção:** Criado `filteredRevenueRows` que filtra por `filteredOpps.id` quando modo MQL ativo

##### MENORES (edge cases)

- **BUG-06:** `AlertasQuadrant` — No-shows sem limite de data
  - **Problema:** Query buscava ANY agendamento no passado
  - **Impacto:** Incluía no-shows de anos atrás
  - **Correção:** Adicionado `.gte('data_agendamento_reuniao', d30ago)`

- **BUG-07:** `AlertasQuadrant` — Leads antigos inclui todos pipelines
  - **Problema:** Contagem incluía Vendas SQL, Recuperação, Social Selling
  - **Impacto:** Métrica enganosa (misturava pipelines diferentes)
  - **Correção:** Adicionado `.in('pipeline_name', ['Pré-Vendas MQL', 'Pré-Vendas nMQL'])`

- **BUG-08:** `LeadsParadosTab` — Múltiplas opps por contato mostra não-determinística
  - **Problema:** Map mantinha primeira opp encontrada, sem ORDER BY
  - **Impacto:** Qual opp era exibida dependia da ordem do banco (variável)
  - **Correção:** Adicionado `.order('data_lead_recebido', {desc})` antes de Map, mostra mais recente

- **BUG-09:** `useSDRLeaderboard` — Timezone inconsistente
  - **Problema:** useSDRLeaderboard usava `-03:00`, usePreVendas usava `+00:00`
  - **Impacto:** Mensagens de transição de data (00:00-03:00 UTC) caíam em períodos diferentes
  - **Correção:** Alinhado para `+00:00` (padrão do banco)

- **BUG-10:** `SDRsTab` — Sparkline date parsing sem timezone
  - **Problema:** `new Date(startDate + 'T00:00:00')` interpretava como timezone local do navegador
  - **Impacto:** Gráficos mostravam datas erradas em navegadores com TZ diferente
  - **Correção:** Adicionado `+00:00` suffix e `timeZone: 'America/Sao_Paulo'` ao formatDatetime

- **BUG-11:** `useCohort` — `conectados_pct` pode ultrapassar 100%
  - **Problema:** Denominador era `mqls`, mas `conectados` incluía nMQLs
  - **Impacto:** Se mais nMQLs conectaram do que MQLs existem, pct > 100%
  - **Correção:** Trocado denominador para `leads_count` (sempre >= conectados)

- **BUG-12:** `useCohort` — Última tentativa assume ordem crescente
  - **Problema:** `tentativas[tentativas.length - 1]` usava posição de array, não data
  - **Impacto:** Se tentativa_5 fosse recente mas tentativa_7 nula, mostrava tentativa_5 (errado)
  - **Correção:** Substituído por `Math.max(...dates.map(d => new Date(d).getTime()))`

---

### 2026-03-12 (Anterior)
- removed: `trafego-ai` (edge function) e `TrafegoAIChat` (componente) removidos — feature descartada
- removed: aba `cohort` do módulo Pré-Vendas — tabela cohort consolidada em Visão Geral
- removed: FunnelSVG do módulo Pré-Vendas (Visão Geral) — cálculo de funil mantido mas viz removida
- feat: Matriz Cohort movida para topo de "Visão Geral" (antes: KPIs)
- feat: Visão Geral agora mostra sequência: **Cohort Matrix** → KPIs de receita → Motivos de perda (pre-venda/vendas) + Distribuição SDR
- feat: modelos OpenRouter atualizados em `prevendas-ai` — primário `z-ai/glm-5`, fallback `anthropic/claude-sonnet-4.6`
- docs: integração OpenRouter documentada em `docs/Integracoes/openrouter.md`
- docs: ARQUITETURA.md atualizado — tabs reduzidas de 4 para 3, estrutura Visão Geral explicada

### Added
- **Sync completo de conversas GHL → tabela `comunicacoes`**
  - **Data:** 2026-03-11
  - **Motivo:** A tabela `comunicacoes` só tinha mensagens inbound do lead via webhook. Perdíamos todas as mensagens outbound dos SDRs (WhatsApp, SMS, ligações, email) enviadas pelo GHL.
  - **Solução:** Nova edge function `sync-ghl-conversations` que consome a API REST `/conversations/search` + `/conversations/{id}/messages`
  - **Canais capturados:** WhatsApp, SMS, Email, Ligações (call), Facebook, Instagram, GMB
  - **Campos novos em `comunicacoes`:**
    - `ghl_message_id` TEXT UNIQUE — chave de deduplicação
    - `ghl_conversation_id` TEXT — ID da conversa GHL
    - `channel` TEXT — canal: whatsapp/sms/email/call/facebook/instagram/gmb
    - `data_comunicacao` TIMESTAMPTZ — timestamp real da mensagem no GHL
    - `attachments` JSONB — array de URLs de anexos
    - `usuario_ghl_id` TEXT — ID do usuário GHL que enviou (outbound)
  - **`contato_id` agora nullable** — permite salvar mensagens de contatos históricos
  - **Sync automático:** pg_cron a cada 2h (incremental, usando `startAfterDate` da última execução)
  - **Backfill:** 5.971 conversas × ~40 msg/conv ≈ 200k+ mensagens históricas
  - **Migrações:** 20260311200000 a 20260311200006
  - **Documentação:** `docs/APIS-DOCS/ghl-conversations-api.md`
  - **Secrets configurados:** `GHL_API_KEY`, `GHL_LOCATION_ID`

### Changed
- **DS1 — Silver Empire v2.0: Redesign completo do eb-dash2**
  - **Data:** 2026-03-11
  - **Escopo:** 100% do eb-dash2 — tokens, fontes, layout, todos os primitivos UI, páginas
  - **Filosofia:** Light mode fiel ao DS1 — bone (#F2EFE8) no conteúdo principal, sidebar empire navy escuro, cards brancos, seção login mantida escura
  - **Arquivos modificados:**
    - `eb-dash2/index.html` — adiciona IBM Plex Mono + pesos corretos do DS1
    - `eb-dash2/tailwind.config.js` — paleta DS1, font-mono, radius vars, boxShadow vars; remove darkMode class
    - `eb-dash2/src/index.css` — reescrita completa: raw palette, semantic vars, shadcn compat HSL (light), sidebar HSL dark, autofill light+dark, film grain, `.section-label`, `.dark-glass`, `.stat-card`, animações DS1
    - `eb-dash2/src/components/layout/DashboardLayout.tsx` — remove gradientes radiais dark, header bone/glass, p-8
    - `eb-dash2/src/components/layout/Sidebar.tsx` — bg empire, logo gold badge, labels font-mono platinum, nav links DS1, dropdown dark
    - `eb-dash2/src/components/ui/button.tsx` — 5 variantes DS1 (default/secondary/ghost/destructive/gold) + aliases premium/outline/link
    - `eb-dash2/src/components/ui/card.tsx` — white+ghost default, dark variant empire+gold gradient top, CardTitle font-display, CardDescription steel
    - `eb-dash2/src/components/ui/badge.tsx` — font-mono 10px tracking 0.12em uppercase, variantes DS1
    - `eb-dash2/src/components/ui/input.tsx` — mist bg, ghost border 1.5px, empire focus; glowing variant para contexto escuro
    - `eb-dash2/src/components/ui/tabs.tsx` — TabsList mist, TabsTrigger branco ativo / steel inativo
    - `eb-dash2/src/components/ui/dialog.tsx` — backdrop ink/40, white card, ghost borders
    - `eb-dash2/src/components/ui/dropdown-menu.tsx` — white bg, ghost border, mist hover, ghost separator
    - `eb-dash2/src/components/ui/select.tsx` — mist trigger, white dropdown, mist/empire item hover
    - `eb-dash2/src/components/ui/table.tsx` — ghost border+radius-lg wrapper, mist thead, font-mono th, ink td
    - `eb-dash2/src/components/ui/skeleton.tsx` — ghost bg, radius-md
    - `eb-dash2/src/components/ui/checkbox.tsx` — platinum border inativo, empire checked
    - `eb-dash2/src/components/ui/textarea.tsx` — mist bg, ghost border, empire focus
    - `eb-dash2/src/components/ui/empty-state.tsx` — mist bg, ghost border, steel text
    - `eb-dash2/src/components/ui/label.tsx` — text-13, ink, tracking 0.02em
    - `eb-dash2/src/pages/traqueamento/TraqueamentoPage.tsx` — section-label, h1 ink, tab nav DS1 (gold border ativo)
    - `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — section-label, h1 ink, filtros mist/white, tab nav DS1
    - `eb-dash2/src/pages/LoginPage.tsx` — empire bg context, card dark-glass, inputs dark variant, gold CTAs

### Fixed
- **sync-meta-ads — diagnóstico logs paginados + log de diagnóstico**
  - **Data:** 2026-03-11
  - **Root cause confirmado:** Logs do Supabase Dashboard são paginados por timestamp DESC. As linhas de conclusão de invocações antigas ficam em páginas posteriores. A função sempre funcionou corretamente — sync manual às 22:46 retornou `success, 39 records` em 5.5s.
  - **Sync history confirmado via REST API:**
    - 22:46 → success (39 records) — sync manual pós-diagnóstico
    - 22:00 → success (39 records) — cron
    - 21:00 → error (hour NOT NULL — já corrigido em migration anterior)
    - 20:00 → success (39 records) — cron
    - 19:00 → success (39 records) — cron
  - **Melhoria adicionada:** log imediato após env var checks para confirmar variáveis em futuras investigações
  - **Arquivo:** `supabase/functions/sync-meta-ads/index.ts`

### Added
- **Módulo Pré-Vendas V2** — `eb-dash2` rota `/pre-vendas`
  - **Data:** 2026-03-11
  - **Tabs:** Visão Geral, SDRs, Cohort, Leads Parados
  - **Arquivos criados:**
    - `eb-dash2/src/pages/prevendas/PreVendasPage.tsx` — shell com filtros globais, toggle MQL (URL param), tab nav
    - `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx` — KPIs (Faturamento, Caixa, ROAS, ROAS Caixa), funil SVG clicável, top 5 motivos de perda, distribuição por SDR
    - `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` — leaderboard ranqueado por taxa de agendamento, funil comparativo side-by-side
    - `eb-dash2/src/pages/prevendas/tabs/CohortTab.tsx` — matriz cohort por mês de entrada, color coding abaixo/acima da média, células clicáveis → LeadListModal
    - `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` — Q1 Não respondem, Q2 Aguardando SDR (via `direction`), Q3 Alertas (reuniões 48h, no-shows, leads antigos), integração IA via `prevendas-ai`
    - `eb-dash2/src/hooks/usePreVendas.ts` — hook principal (opps sem filtro pago, revenue, meta spend, filter options)
    - `eb-dash2/src/hooks/useSDRLeaderboard.ts` — métricas por SDR usando `sdr_name` de comunicacoes
    - `eb-dash2/src/hooks/useCohort.ts` — matriz cohort client-side (useMemo)
    - `supabase/functions/prevendas-ai/index.ts` — edge function OpenRouter (Gemini Flash), cache 24h em `prevendas_ai_insights`
    - `supabase/migrations/20260311180000_add_direction_to_comunicacoes.sql` — reintroduz coluna `direction` + índice
    - `supabase/migrations/20260311180001_create_prevendas_ai_insights.sql` — tabela cache com RLS
  - **Arquivos modificados:** `App.tsx`, `Sidebar.tsx`, `types/users.ts` (MODULE_TREE)

### Removed
- **Módulo Pré-Vendas — remoção completa**
  - **Data:** 2026-03-11
  - **Motivo:** Módulo não ficou satisfatório; removido sem código morto.
  - **Banco de dados:**
    - `supabase/migrations/20260311170000_remove_pre_vendas_module.sql` — DROP TABLE `pre_vendas_analise_ia`, DROP INDEX `idx_comunicacoes_contato_direction_tipo`, DROP COLUMN `comunicacoes.direction`, DROP COLUMN `contatos.instagram_handle`, reverte `extrair_dados_ghl` sem instagram_handle
  - **Edge Function:** `analyze-lead` removida do deploy (`supabase functions delete analyze-lead`)
  - **Frontend removido:** `components/pre-vendas/` (7 arquivos), `pages/pre-vendas/` (4 arquivos), `hooks/usePreVendas.ts`, `hooks/useComunicacoes.ts`, `hooks/useAiAnalysis.ts`
  - **Arquivos modificados:** `App.tsx`, `Sidebar.tsx`, `DashboardLayout.tsx`, `types/users.ts`, `LeadCard.tsx`
  - **Docs:** `docs/PRE-VENDAS-MODULO.md` removido

### Fixed
- **Fix: Meta Ads investimento inflado no painel Tráfego**
  - **Data:** 2026-03-11
  - **Causa raiz:** `meta_ads_insights` tinha `UNIQUE(ad_id, date, hour)` onde `hour = EXTRACT(HOUR FROM fetch_finished_at)`. Cada sync horário inseria uma nova linha com o gasto acumulado do dia (sem conflito, pois o hour mudava). `computeMetaKpis()` somava todas as linhas do dia, multiplicando o valor real pelo número de syncs executados.
  - **Arquivos modificados:**
    - `supabase/migrations/20260311150000_fix_meta_ads_insights_dedup.sql` — deduplica dados existentes (mantém row com maior `fetched_at` por `(ad_id, date)`), troca constraint de `(ad_id, date, hour)` para `(ad_id, date)`, corrige função `processar_meta_ads_raw` para usar `ON CONFLICT (ad_id, date)`
    - `eb-dash2/src/hooks/useTrafego.ts` — adiciona `.limit(5000)` na query Meta para evitar truncamento silencioso (default Supabase = 1000 rows)
  - **Campo `hour`:** mantido na tabela para uso futuro com breakdowns horários reais da Meta API; apenas deixa de ser populado no sync diário.

### Added
- **Módulo Pré-Vendas com IA + ScrapeCreators**
  - **Data:** 2026-03-11
  - **Arquivos criados:**
    - `docs/PRE-VENDAS-MODULO.md` — documentação completa do módulo
    - `supabase/migrations/20260311140000_add_direction_to_comunicacoes.sql` — coluna `direction` em `comunicacoes`
    - `supabase/migrations/20260311140001_create_pre_vendas_analise_ia.sql` — tabela de cache de análises IA
    - `supabase/functions/analyze-lead/index.ts` — Edge Function IA (OpenRouter + ScrapeCreators)
    - `eb-dash2/src/hooks/usePreVendas.ts`, `useComunicacoes.ts`, `useAiAnalysis.ts`
    - `eb-dash2/src/components/pre-vendas/` — 7 componentes
    - `eb-dash2/src/pages/pre-vendas/` — PreVendasPage + 3 tabs (Fila, Equipe, Funil)
  - **Arquivos modificados:** App.tsx, types/users.ts, Sidebar.tsx, DashboardLayout.tsx, LeadCard.tsx (aba IA)
  - **Secrets para deploy:** `OPENROUTER_API_KEY`, `SCRAPECREATORS_API_KEY`

### Docs
- **Documentação: Painel Tráfego Pago + correção fluxo de classificação**
  - **Data:** 2026-03-11
  - **Arquivos:** `docs/ARQUITETURA.md`, `docs/AI-INSTRUCTIONS.md`
  - **Mudanças:**
    - `ARQUITETURA.md`: corrigida sub-tab `utm_source_ads` (removida referência incorreta a `utm_source_origin_assignments`); tabela de configuração do Traqueamento reorganizada com `utm_sources` como registro canônico; adicionada nota de aviso sobre uso de `utm_origins` vs filtro do Painel Tráfego
    - `AI-INSTRUCTIONS.md`: corrigido "Fluxo de Classificação de Tráfego" — substitui `utm_source_origin_assignments` por `utm_sources` como whitelist de tráfego pago; adicionada seção completa "Painel Tráfego Pago (eb-dash2)" com SQL de todos os filtros, funil de conversão, Meta Ads e receita COHORT


- **Diagnóstico e guia de configuração: Notion Sync**
  - **Data:** 2026-03-10
  - **Problema:** Edge Function `notion-creatives-sync` retorna erro / não sincroniza criativos do Notion
  - **Causas identificadas (em ordem):**
    1. Função não deployada (`supabase functions deploy notion-creatives-sync`)
    2. Secrets não configurados no Supabase Dashboard (3 variáveis: `NOTION_API_KEY`, `NOTION_DATABASE_ID_PAID`, `NOTION_DATABASE_ID_ORGANIC`)
    3. Integração Notion não conectada aos databases (404 na API)
    4. Campos com nomes errados no database Notion (descarte silencioso)
  - **Documentação atualizada:** `docs/notion/CONFIGURACAO-NOTION.md` — completado com Passos 5-8, checklist completo, curl de teste e tabela de troubleshooting

### Auditoria
- **Auditoria de qualidade pós-backfill de datas — 2026-03-11**
  - **Data:** 2026-03-11
  - **Contexto:** Investigação executada após 4 migrations de fix do `parse_safe_date`. Objetivo: verificar se ainda existem datas com problemas no banco.
  - **Ferramenta de referência:** view `vw_qualidade_datas_oportunidades`

  **Achado 1 — parse_safe_date: CORRETO (sem ação necessária) ✅**
  - Todos os formatos funcionam: GHL D/M/YYYY H:MM AM/PM, ISO8601, YYYY-MM-DD, DD/MM/YYYY.
  - Zero registros com `dia ≤ 12 AND mês > 12` — prova que não há inversão sistemática.

  **Achado 2 — 534 leads em batch no dia 11/11/2025 (data quality, não bug de parse)**
  - Distribuição anômala: dia 11 tem 710 registros vs média de 158.
  - 589 dos 710 são de novembro 2025, concentrados entre 13:27–13:53 UTC (10:27–10:53 BRT).
  - Campo `mqlleads_recebidos` contém `"11/11/2025 10:XX AM"` — parse correto.
  - `data_lead_recebido` é sempre 3h antes de `data_criacao_contato` = offset BRT→UTC normal.
  - **Diagnóstico:** Batch import ou ativação de workflow GHL em 11/11/2025. Operador/automação importou ~534 leads e atribuiu o timestamp do momento do import a todos.
  - **Impacto:** Leads aparecem concentrados em 11/11 nos relatórios de leads por dia; por mês estão corretos (novembro 2025).
  - **Ação:** Nenhuma — dado de origem; correção exigiria datas reais de registro (não disponíveis).

  **Achado 3 — 400 registros com fallback para date_created (data quality, não bug)**
  - 400 registros têm `data_lead_recebido = data_criacao_contato` (diferença < 1 segundo).
  - Causa: campo customizado `mqlleads_recebidos` não setado no GHL para esses leads. Backfill usa `parse_safe_date(payload->>'date_created')` como fallback = mesmo valor de `data_criacao_contato`.
  - Pipelines afetados: Incompleto (130), Recuperação (116), [fn] webinário (73), demais.
  - Para pipelines de reativação (Recuperação, Incompleto) o fallback é semanticamente correto.
  - **Ação:** Nenhuma.

  **Achado 4 — 20 datas futuras em colunas de atividade (aceitável)**
  - Colunas: `data_tentativa_1` (7), `data_perdido` (5), `data_lead_recebido` (2), `data_conectado` (2), `data_agendamento_reuniao` (2), `data_realizacao_vendas` (2).
  - Todos têm `data_criacao_contato` no passado. Dias ≤ 3 com mês futuro — ex: `3/9/2026` = 3 set (parse D/M correto). São follow-ups/reuniões agendadas no GHL ou edge cases de entrada de dados.
  - **Ação:** Nenhuma.

  **Achado 5 — pico hora 13 UTC é NORMAL**
  - Hora 13 UTC = 10h BRT = horário comercial de pico. O aparente "anomalia" era o batch de novembro (Achado 2).

  **Tabela resumo:**
  | Achado | Tipo | Ação |
  |---|---|---|
  | `parse_safe_date` function | Correto | Nenhuma |
  | 534 leads batch Nov 11 | Data quality — batch import | Nenhuma |
  | 400 fallback = date_created | Data quality — campo ausente no GHL | Nenhuma |
  | 20 datas futuras | Atividades GHL agendadas | Nenhuma |

### Fixed
- **Verificação completa pós-fix parse_safe_date — 2026-03-11**
  - **Data:** 2026-03-11
  - **Contexto:** 4 migrations aplicadas hoje para corrigir o formato de data GHL (`D/M/YYYY H:MM AM/PM`): `20260311120000`, `20260311120001` (MM/DD-first — errado, revertido), `20260311130000` (função final correta), `20260311130001` (backfill final).
  - **Resultado das queries de verificação (via Supabase Management API):**

  **1. parse_safe_date — todos os formatos corretos ✅**
  | Entrada | Resultado | Status |
  |---|---|---|
  | `'7/3/2026 08:40 PM'` (GHL D/M/YYYY) | `2026-03-07 20:40+00` | ✅ |
  | `'2026-03-07T23:40:03.361Z'` (ISO8601) | `2026-03-07 23:40+00` | ✅ |
  | `'2026-03-07'` (YYYY-MM-DD) | `2026-03-07 00:00+00` | ✅ |
  | `'07/03/2026'` (DD/MM) | `2026-03-07 00:00+00` | ✅ |
  | `'03/07/2026'` (DD/MM → dia=3, mês=7) | `2026-07-03 00:00+00` | ✅ |
  | `'12/3/2026 02:00 PM'` | `2026-03-12 14:00+00` | ✅ |
  | `'3/12/2026 02:00 PM'` | `2026-12-03 14:00+00` | ✅ |
  | NULL | NULL | ✅ |

  **2. Thiago (`thiagoferrib@gmail.com`) ✅**
  - `data_lead_recebido = 2026-03-07 20:40:00+00` — correto (era julho antes do fix)

  **3. MQLs de março 2026 ✅**
  - **16 MQLs** no pipeline `Pré-Vendas MQL` entre 2026-03-01 e 2026-03-31

  **4. Distribuição mensal — distribuição normalizada ✅**
  | Mês | Total | MQLs | nMQLs |
  |---|---|---|---|
  | 2025-09 | 1 | 0 | 0 |
  | 2025-10 | 198 | 12 | 119 |
  | 2025-11 | 1350 | 257 | 824 |
  | 2025-12 | 1003 | 130 | 609 |
  | 2026-01 | 1046 | 100 | 507 |
  | 2026-02 | 1178 | 74 | 402 |
  | 2026-03 | 116 | 16 | 69 |
  | 2026-04+ | 3 | 0 | 1 |

  **5. Datas futuras residuais — 20 registros em 6 colunas ⚠️**
  | Coluna | Count > NOW()+30d |
  |---|---|
  | `data_lead_recebido` | 2 |
  | `data_tentativa_1` | 7 |
  | `data_conectado` | 2 |
  | `data_agendamento_reuniao` | 2 |
  | `data_realizacao_vendas` | 2 |
  | `data_perdido` | 5 |
  | `data_qualificado`, `data_fechado`, `data_negociacao`, `data_criacao_contato` | **0 ✅** |

  **Análise das datas futuras residuais:** Todos os registros têm `data_criacao_contato` no passado. Os dias são sempre ≤ 3 (ex: `3/9/2026` → 3 de setembro). Podem ser:
  - **Atividades agendadas no futuro** pelo time de vendas no GHL (follow-up, reunião marcada) — plausível para `agendamento_reuniao`, `realizacao_vendas`
  - **Registros edge-case** com datas de `conectado`, `perdido`, `tentativa` no futuro — suspeitos; verificar manualmente no GHL para os emails: `ademaralencqr@gmail.com`, `derek@thew.com.br`, `junior.cocensa@elliotinternational.com.br`, `mariana.hella@yahoo.com.br`, `performancedesenvolvimentosc@gmail.com`
  - **NÃO são erros de parse**: se fossem M/D (americano), `3/9/2026` seria março 9 (passado); com D/M correto é setembro 3 (futuro). Ou o dado é legítimo, ou o GHL inseriu data errada.

  **6. Amostra março 2026 ✅**
  - 10 oportunidades recentes com `data_lead_recebido` em 10-11/03 — datas coerentes

  **7. lead_recebido antes de criacao_contato (> 7 dias) — 2 casos ⚠️**
  - `junior.cocensa@elliotinternational.com.br`: lead 2026-01-02, criação 2026-02-01 (30 dias de diferença — lead importado retroativamente)
  - `mei@originalmei.com`: lead 2025-09-19, criação 2025-12-08 (80 dias — mesmo caso)
  - **Conclusão:** Edge cases legítimos (importação retroativa), não erros de parse.

  **Conclusão geral:** Fix e backfill foram bem-sucedidos. Bulk dos dados está correto. 20 registros com datas futuras em colunas de atividade merecem verificação manual pontual no GHL, mas não indicam falha sistêmica.

- **Correção crítica: Inversão mês/dia em parse_safe_date() para campos customizados GHL**
  - **Data:** 2026-03-11
  - **Problema:** GHL envia datas de campos customizados (ex: `mqlleads_recebidos`) no formato americano `MM/DD/YYYY`. A função `parse_safe_date` tentava `DD/MM/YYYY` antes de `MM/DD/YYYY`, invertendo mês e dia em datas com dia ≤ 12.
  - **Exemplo confirmado:** Thiago (`thiagoferrib@gmail.com`) — GHL envia `"03/07/2026"` (março 7), parse_safe_date lia como julho 3 → leads pagos de março não apareciam no filtro de março no painel Tráfego.
  - **Migrações:**
    - `20260311120000_fix_parse_safe_date_mm_dd_yyyy.sql` — Recria `parse_safe_date` com ordem corrigida: ISO8601 → YYYY-MM-DD → **MM/DD/YYYY** → DD/MM/YYYY
    - `20260311120001_backfill_datas_inversao_mes_dia.sql` — Re-extrai todas as datas de `oportunidades` usando o webhook mais recente de cada oportunidade com a função corrigida (usa nomes de colunas pós-rename: `data_lead_recebido`, `data_tentativa_1..8`, etc.)
  - **Verificação:** `SELECT COUNT(*) FROM oportunidades WHERE data_lead_recebido > NOW() + INTERVAL '30 days'` deve retornar 0
  - **Deploy:** `supabase db push --project-ref qzesffnkqgelmtfblzkr`

- **Correção crítica: Tratamento de datas em webhooks GHL com parse_safe_date()**
  - **Data:** 2026-02-27
  - **Problema identificado:** A função `extrair_dados_ghl()` usava conversão direta `::DATE::TIMESTAMPTZ` que pode inverter mês/dia dependendo do DateStyle do PostgreSQL. Exemplo: `2026-02-12` podia ser interpretado como `12 de fevereiro` ou `2 de dezembro`.
  - **Campos afetados:** 30+ campos de data incluindo `data_lead_recebido`, `data_tentativa_1-8`, `data_conectado`, `data_no_show`, `data_perdido`, `data_qualificado`, `data_agendamento_reuniao`, `data_fechado`, etc.
  - **Solução:**
    - Migration `20260227140000_fix_extrair_dados_ghl_use_parse_safe_date.sql` - Atualiza `extrair_dados_ghl()` para usar `parse_safe_date()` em todas as conversões
    - Migration `20260227150000_backfill_datas_com_parse_safe_date.sql` - Reprocessa todos os webhooks para corrigir dados históricos
    - Migration `20260227160000_validar_correcao_datas.sql` - Cria views de validação e função de teste
    - Migration `fix_parse_safe_date_ambiguous` - Corrige função para não usar conversão direta `::timestamptz` em datas ambíguas (XX/XX/YYYY)
    - Migration `fix_extrair_dados_ghl_column_names` - Atualiza nomes das colunas na função (de `data_mql_*` para `data_*`)
  - **Backfill executado:** 709 registros corrigidos de datas futuras para datas corretas
  - **Views de validação criadas:**
    - `vw_qualidade_datas_oportunidades` - Estatísticas de qualidade das datas
    - `vw_amostra_datas_oportunidades` - Amostra das 100 oportunidades mais recentes
    - `vw_comparacao_datas_webhook_oportunidade` - Comparação entre webhooks e dados processados
  - **Função de teste:** `testar_parse_safe_date()` - Valida comportamento da função com 17 casos de teste
  - **Resultado final:** 0 datas futuras, 4771 oportunidades com data_lead_recebido preenchido
  - **Documentação:** `plans/auditoria-completa-datas-webhook.md`

- **Diagnóstico crítico: spend Meta Ads inflado por dupla contagem**
  - **Data:** 2026-02-26
  - **Problema identificado:** A tabela `meta_ads_insights` armazena o `spend` como valor **acumulado do dia até aquela hora** (não incremental). Ao fazer `SUM(spend)` agrupando todas as horas do dia, o resultado era ~6x inflado (ex: R$ 1.740 em vez de R$ 280,83 real).
  - **Causa raiz:** Comportamento da Meta Marketing API — cada chamada retorna o total acumulado desde 00h até a hora da consulta.
  - **Solução:** Para obter o total do dia, sempre usar apenas a **última hora disponível** (`MAX(hour)`) por `ad_id`.
  - **Query correta:**
    ```sql
    SELECT SUM(spend) FROM meta_ads_insights
    WHERE date = CURRENT_DATE
      AND hour = (SELECT MAX(hour) FROM meta_ads_insights WHERE date = CURRENT_DATE);
    ```
  - **Documentação atualizada:** `docs/AI-INSTRUCTIONS.md` v1.1 — seção "DADOS DE TRÁFEGO (META ADS)" completamente reescrita com regras corretas e exemplos de erros a evitar.


### Added
- **Dashboard Premium Redesign — Fase 7: ProcessoVendas Tab Premium**
  - **Objetivo:** Refinar tab de processo de vendas com design premium
  - **Arquivo modificado:**
    - `eb-dash/app/(dashboard)/traqueamento/page.tsx` - ProcessoVendasTab completo refatorado

  - **Processos Card:**
    - ✅ Card: Premium variant com gradient icon
    - ✅ Input: variant="glowing"
    - ✅ Button: variant="premium" size="lg"
    - ✅ Process tags: glass-elevated com delete reveal on hover
    - ✅ Staggered animations (30ms per item)

  - **Atribuição Card:**
    - ✅ Card: Premium design com BarChart3 gradient icon
    - ✅ Table: glass-elevated com header refinado
    - ✅ Warning badge: Campanhas sem processo destacadas
    - ✅ Staggered animations em linhas (50ms delays)
    - ✅ Select triggers com focus styling aprimorado

- **Dashboard Premium Redesign — Fase 5: Traqueamento Page Premium**
  - **Objetivo:** Refinar página de traqueamento com componentes premium, glassmorfismo e animações coordenadas
  - **Arquivo modificado:**
    - `eb-dash/app/(dashboard)/traqueamento/page.tsx` - Redesign de tabs, cards, inputs e tables

  - **SlugUtmSubTab (Primeira Sub-aba):**
    - ✅ Card: Mudou de `variant="glass"` para `variant="premium"` com shadow dourado
    - ✅ CardHeader: Ícone com gradiente background + border
    - ✅ CardTitle: Estrutura melhorada com subtítulo (nova)
    - ✅ Inputs: Mudaram para `variant="glowing"` com glow no focus
    - ✅ Form fields: Staggered animations (50ms, 100ms, 150ms delays)
    - ✅ Paste section: Nova design com info box gradient + backdrop blur
    - ✅ Table: Glass-elevated container com border e rounded corners
    - ✅ Table header: Improved typography (text-xs, font-semibold, uppercase, tracking-wide)
    - ✅ Table rows: Hover effects (bg-white/3), animated entrance (staggered)
    - ✅ Table rows: Opacity-based action buttons (visíveis no hover)
    - ✅ Empty states: Icons centrados com mensagem

  - **UtmSourceAdsSubTab (Segunda Sub-aba):**
    - ✅ Card: Premium variant com gradient icon
    - ✅ Inputs: All variant="glowing" com font-mono em utm_source/public_code
    - ✅ Select: Improved styling com focus:border-primary/50
    - ✅ Buttons: variant="premium" com shimmer animation
    - ✅ Paste section: Info box com ClipboardPaste icon e gradiente
    - ✅ Table: Refactored completo com glass-elevated
    - ✅ Loading states: Placeholder centrado
    - ✅ Animações: Staggered em todos os elementos (delays 50ms-350ms)

  - **Design Melhorias Gerais:**
    - ✅ Icons em cards: Gradient background (from-primary/20 to-primary/5) + border
    - ✅ Labels: text-xs font-semibold text-muted-foreground/80
    - ✅ Tables: bg-white/2.5 header com border-white/5 separadores
    - ✅ Empty states: Ícones maiores (h-8 w-8) com cor sutilizada
    - ✅ Transições: Todas duration-200
    - ✅ Animações de entrada: animate-fade-in-up com delays (50ms per item)
    - ✅ Hover states: Coordenados com group- prefix

  - **Compatibilidade:**
    - ✅ 100% funcional (nenhuma quebra)
    - ✅ Usa design tokens Fase 1 e 2
    - ✅ Mantém toda lógica de dados/CRUD intacta
    - ✅ Melhora progressiva: aparência premium sem afetar funcionalidade

- **Dashboard Premium Redesign — Fase 4: Dashboard Layout Premium**
  - **Objetivo:** Refinar layout do dashboard com sidebar premium, navegação elegante e header glassmorfismo
  - **Arquivo modificado:**
    - `eb-dash/app/(dashboard)/layout.tsx` - Redesign completo com variantesases premium

  - **Sidebar Header:**
    - ✅ Logo com gradiente: from-primary via-amber-500 to-primary
    - ✅ Glow-pulse animation contínuo
    - ✅ Emerald status dot com border
    - ✅ Link wrapper com hover opacity transition
    - ✅ "Empire Premium" branding com font-black

  - **Sidebar Content:**
    - ✅ Staggered animations em itens (animate-fade-in-up, 50ms delay)
    - ✅ Active state com gradient: from-primary/20 to-transparent
    - ✅ Left border highlight: border-l-2 border-l-primary
    - ✅ Animated pulse dot no lado direito
    - ✅ Child items com text-xs, melhor hierarquia visual

  - **Header:**
    - ✅ Mudou para `glass-elevated` (mais premium que glass-header)
    - ✅ Border-b border-white/5 para separação refinada
    - ✅ Breadcrumbs melhorados: text-sm, font-medium, hover states
    - ✅ SidebarTrigger com transition-colors

  - **User Menu Dropdown:**
    - ✅ Group hover para coordenação de estilos
    - ✅ Avatar com hover:border-primary/50 transition
    - ✅ Dropdown container: glass-elevated border border-white/10 backdrop-blur-xl
    - ✅ User info section com bottom border e melhor spacing
    - ✅ Menu items com transition-colors suaves
    - ✅ Icons consistentes (h-4 w-4)

  - **Animações:**
    - ✅ Todas as transições: duration-200
    - ✅ Staggered item animations: 50ms per item
    - ✅ Glow-pulse no logo (contínuo)
    - ✅ Hover effects suaves em todos os elementos

  - **Compatibilidade:**
    - ✅ 100% funcional (nenhuma quebra)
    - ✅ Usa design tokens Fase 1
    - ✅ Mantém toda lógica de autenticação intacta
    - ✅ Sidebar navigation totalmente interativa

- **Dashboard Premium Redesign — Fase 3: Login Page Premium**
  - **Objetivo:** Refinar página de autenticação com componentes premium, glassmorfismo e animações
  - **Arquivo modificado:**
    - `eb-dash/app/(auth)/login/login-content.tsx` - Redesign completo com variantes Fase 2

  - **Hero & Background:**
    - ✅ Gradient mesh com 4 radiais + 1 linear
    - ✅ Noise texture sutil (opacity 0.02)
    - ✅ 3 animated gradient orbs (pulse + float)
    - ✅ Muted blue orb com `animate-float` (novo)

  - **Card Container:**
    - ✅ Mudou de `premium` para `glowing` (novo efeito)
    - ✅ Glass elevado com gradient overlay dourado
    - ✅ Sombra premium com glow
    - ✅ Animação entrada: `animate-fade-in-up`

  - **Logo Section:**
    - ✅ Logo agora 20x20 (era 16x16)
    - ✅ Gradiente: from-primary via-amber-500 to-primary
    - ✅ Crown badge com `animate-float`
    - ✅ `animate-glow-pulse` contínuo
    - ✅ Staggered animations em sub-elementos

  - **Title & Description:**
    - ✅ Título com `bg-clip-text` + `text-transparent` (gradient text)
    - ✅ Descrição com Sparkles animadas (`animate-pulse`)
    - ✅ Espaçamento refinado (+6 gap no header)

  - **Error State:**
    - ✅ Novo visual: glass + backdrop blur
    - ✅ Ícone de warning
    - ✅ Animação fade-in-up

  - **Google OAuth Button:**
    - ✅ Mudou de `outline` + classes para `outline` puro
    - ✅ Usa nova variante outline com glow no hover

  - **Method Selector:**
    - ✅ Gradient backgrounds na seleção
    - ✅ Icons maiores (h-4 w-4)
    - ✅ Transições suaves (duration-200)
    - ✅ Backdrop blur adicionado

  - **Inputs:**
    - ✅ Mudaram para `variant="glowing"` (novo)
    - ✅ Glow dourado no focus
    - ✅ Placeholder melhorado ("••••••••" para password)
    - ✅ Labels refinadas com font-semibold

  - **Buttons:**
    - ✅ Mudaram para `variant="premium"` com `size="lg"`
    - ✅ Shimmer animado no hover
    - ✅ Estados loading refinados
    - ✅ Textos: "Entrar" / "Autenticando..." / "Enviar código" / "Enviando..."

  - **OTP Form:**
    - ✅ Info box: primary/5 bg + primary/10 border
    - ✅ Melhor visual de contexto
    - ✅ Mail icon destacado

  - **Animações:**
    - ✅ Staggered: logo (100ms), title (150ms), form (fade-in-up)
    - ✅ Float animation nos gradient orbs
    - ✅ Pulse animation nos sparkles
    - ✅ Glow pulse no logo

  - **Compatibilidade:**
    - ✅ 100% funcional (nenhuma quebra)
    - ✅ Usa componentes Fase 2 (Button, Card, Input)
    - ✅ Mantém lógica de autenticação intacta

- **Dashboard Premium Redesign — Fase 2: Componentes Base (Button, Card, Input, Badge)**
  - **Objetivo:** Refazer componentes principais com variantes premium, gradientes, glows e animações
  - **Arquivos modificados:**
    - `eb-dash/components/ui/button.tsx` - 6 variantes refinadas
    - `eb-dash/components/ui/card.tsx` - 7 variantes refinadas
    - `eb-dash/components/ui/input.tsx` - 4 variantes refinadas + novo param `inputSize`
    - `eb-dash/components/ui/badge.tsx` - 9 variantes refinadas

  - **Button Variantes (6):**
    - `default` ⭐ - Gradiente gold + shadow premium + hover glow
    - `premium` ⭐ - Shimmer animado (gradient animado + overlay 200%)
    - `ghost` - Minimalista elegante
    - `outline` - Border com glow dourado no hover
    - `glass` - Glass sutil com hover refinado
    - `destructive` - Gradiente vermelho com sombra profunda

  - **Card Variantes (7):**
    - `default` - Card sólido padrão
    - `glass` - Glass base
    - `glass-elevated` - Glass com blur 32px
    - `premium` ⭐ - Glass elevado + border dourada + shadow premium
    - `interactive` - Glass com hover elevação + translate
    - `stat` - Glass com borda esquerda dourada animada
    - `glowing` ⭐ - Glass elevado + gradient overlay dourado

  - **Input Variantes (4):**
    - `default` - Input padrão com ring focus
    - `glass` - Glass com backdrop blur
    - `glowing` ⭐ - Glass com glow dourado no focus
    - `ghost` - Minimalista transparente
    - **NOVO:** Param `inputSize` (default, sm, lg)

  - **Badge Variantes (9):**
    - `default` - Primário com shadow dourado
    - `empire` ⭐ - Shimmer animado (gradient 200% animado 3s)
    - `glass` - Glass sutil
    - `success` - Verde com shadow tênue
    - `warning` - Âmbar com shadow tênue
    - `error` - Vermelho com shadow tênue
    - `info` - Azul com shadow tênue
    - `muted` - Cinza com border white/10

  - **Melhorias CSS:**
    - ✅ Todos Button usam `rounded-lg` (maior radius)
    - ✅ Todos Card usam `rounded-2xl` (radius maior)
    - ✅ Transições refinadas: `duration-200` padrão
    - ✅ Sombras premium: `shadow-premium` + `shadow-premium-hover` em CTAs
    - ✅ Hover effects: elevação (-translate-y), glow dourado
    - ✅ Active states: `scale-[0.98]` para feedback tátil
    - ✅ Focus rings: ring-2 com offset, remoção de outline

  - **Compatibilidade:**
    - ✅ 95% retrocompatível com código existente
    - ⚠️ Button: nomes iguais mas estilos diferentes (melhoria)
    - ⚠️ Input: novo param `inputSize` (mantém padrão se omitido)
    - ✅ Card: todas as variantes antigas mantidas
    - ✅ Badge: todas as variantes antigas mantidas

- **Dashboard Premium Redesign — Fase 1: Design Tokens & Base CSS**
  - **Objetivo:** Refinar fundação do design system com tokens premium, sombras em camadas e glassmorfismo refinado
  - **Arquivo modificado:**
    - `eb-dash/app/globals.css` - Atualizado completamente com novos tokens e classes
  - **Tokens de Cores - Refinements:**
    - `--empire-gold`: 43 74% 49% → 45 80% 50% (mais vibrante e saturado)
    - `--empire-gold-light`: 50 85% 65% (novo - para highlights premium)
    - `--empire-gold-dark`: 40 75% 35% (novo - para sombras com profundidade)
    - `--empire-blue`: 210 53% 23% → 220 60% 18% (azul mais profundo e corporativo)
    - `--empire-blue-light`: 220 50% 28% (novo - para hover states)
  - **Sistema de Sombras - Camadas:**
    - Sombras refeitas em 6 níveis (xs, sm, md, lg, xl) com profundidade dramática
    - `--shadow-premium`: Border dorado sutil + glow + sombra base (3 camadas)
    - `--shadow-premium-hover`: Variante com glow mais intenso para interações
    - `--shadow-inner` e `--shadow-inner-sm`: Inner shadows para profundidade
    - `--shadow-glow` e `--shadow-glow-strong`: Efeitos de brilho dourado puro
  - **Glassmorfismo - Refinado:**
    - `.glass`: Gradient base + blur 24px + saturate 180%
    - `.glass-gold`: Novo - Glass com tint dourado e border dourada sutil
    - `.glass-elevated`: Gradient top + blur 32px (mais desfoque para elementos destacados)
    - `.glass-glow`: Novo - Glass com efeito glow dourado
    - `.glass-glowing`: Novo - Glass elevado com gradient overlay dourado (antes pseudo-element)
  - **Animações - Spring Physics:**
    - `--ease-spring`: cubic-bezier(0.34, 1.56, 0.64, 1) - Easing elástico
    - `--ease-out-expo`: cubic-bezier(0.16, 1, 0.3, 1) - Easing exponencial out
    - `--ease-in-out-expo`: cubic-bezier(0.87, 0, 0.13, 1) - Easing exponencial in-out
    - `@keyframes glow-pulse`: Refinada com shadow duplo (20px + 40px)
    - `@keyframes float`: Nova - Animação sutil de flutuação (0-4px)
    - `.animate-float`: Nova - Classe para aplicar animação float
  - **Backgrounds - Padrões:**
    - `.bg-gradient-mesh`: Refinado com 4 radiais + 1 linear (mesh mais sofisticado)
    - `.bg-grid`: Novo - Grid 64px com opacity 0.02
    - `.bg-dots`: Novo - Pontos 24px com opacity 0.05
    - `.bg-noise`: Ajustado SVG noise filter para opacity 0.02
  - **Glassmorfismo Tokens Adicionais:**
    - `--glass-blur-elevated`: 32px (para elementos mais destacados)
    - `--glass-border-gold`: rgba com dourado para borders premium
    - `--glass-highlight`: Gradient overlay (135deg, branco com transparência)
  - **Compatibilidade:** 100% retrocompatível - todos os tokens e classes antigos mantidos
  - **Design Principles:**
    - ✅ Profundidade sobre flat (múltiplas camadas de sombras)
    - ✅ Hierarquia clara (cores e tipografia com contraste)
    - ✅ Micro-interações (transições suaves em todos os elementos)
    - ✅ Performance visual (animações CSS a 60fps)
    - ✅ Acessibilidade (contraste WCAG AA+)

- **~~Assistente de IA (Empire AI)~~ [REMOVIDO 2026-02-26]:** Feature abandonada. Todos os arquivos foram removidos do código e banco de dados.
  - Arquivos removidos: `eb-dash/components/ai-assistant/`, `eb-dash/hooks/useAIChat.ts`, `eb-dash/app/(dashboard)/assistente/page.tsx`, `eb-dash/app/api/ai-assistant/`, `supabase/functions/ai-assistant/`, `supabase/functions/ai-index-docs/`
  - Tabelas removidas do banco: `ai_doc_chunks`, `ai_doc_index_status`, `ai_conversations`, `ai_messages`
  - Documentação marcada para deleção: `docs/DELETAR_AI-ASSISTANT-*.md`

- **Módulo de Gestão de Usuários:** Sistema completo para gerenciar membros, permissões e filtros de acesso
  - **Arquivos criados:**
    - `eb-dash/types/users.ts` - Tipos TypeScript para o módulo (WorkspaceMember, ModulePermission, LeadFilter, etc.)
    - `eb-dash/lib/actions/users.ts` - Server Actions para todas as operações de usuário
    - `eb-dash/app/(dashboard)/settings/page.tsx` - Página de redirecionamento para configurações
    - `eb-dash/app/(dashboard)/settings/users/page.tsx` - Página principal de listagem de usuários
    - `eb-dash/components/users/PermissionsEditor.tsx` - Editor de permissões de módulo
    - `eb-dash/components/users/LeadFilterEditor.tsx` - Editor de filtro de leads
    - `eb-dash/contexts/PermissionContext.tsx` - Contexto React para permissões
    - `eb-dash/components/PermissionGate.tsx` - Componente de controle de acesso
  - **Arquivos modificados:**
    - `eb-dash/app/(dashboard)/layout.tsx` - Adicionado link para Configurações na sidebar
  - **Funcionalidades:**
    - Listagem de membros do workspace com busca
    - Convite de novos usuários por email
    - Gestão de roles (owner/admin/member)
    - Editor visual de permissões de módulo (árvore hierárquica)
    - Editor de filtro de leads (múltiplas regras com AND/OR)
    - Componente PermissionGate para controle de acesso em componentes
    - Contexto de permissões (usePermissions) para verificação programática
    - Soft delete de membros (is_active = false)
    - Estatísticas de membros no dashboard
  - **Permissões de Módulo:**
    - Herança descendente (permissão no pai = acesso aos filhos)
    - Dois níveis: can_view e can_edit
    - Árvore completa do módulo Traqueamento
  - **Filtro de Leads:**
    - Campos de contatos e oportunidades
    - 8 operadores (eq, neq, in, nin, contains, starts_with, is_null, is_not_null)
    - Lógica AND/OR entre regras
    - Filtro ativo/inativo por usuário

- **Importação CSV no Traqueamento:** Suporte a colar dados CSV além do Google Sheets existente
  - **Arquivo criado:**
    - `eb-dash/lib/utils/parsers.ts` - Utilitário de parsing com auto-detecção de delimitador
  - **Arquivo modificado:**
    - `eb-dash/app/(dashboard)/traqueamento/page.tsx` - 10 handlers de paste atualizados
  - **Funcionalidades:**
    - Auto-detecção de delimitador: tab (Google Sheets), vírgula (CSV padrão), ponto-e-vírgula (Excel brasileiro)
    - Suporte a campos entre aspas com delimitadores embutidos
    - Remoção de BOM (Byte Order Mark) de exports do Excel
    - Compatibilidade total com o fluxo existente de Google Sheets
  - **Componentes afetados:**
    - SlugUtmSubTab, UtmSourceAdsSubTab, UtmSourceOrganicSubTab, UtmCampaignSubTab
    - UtmMediumSubTab, UtmTermSubTab, UtmObjectiveSubTab, OrigemTab
    - AdsCatalogSubTab, OrganicCatalogSubTab

### Fixed
- **OTP Login - Correção de 6 para 8 dígitos:** Ajuste do frontend para aceitar códigos OTP de 8 dígitos (padrão do Supabase Auth)
  - **Arquivos corrigidos:**
    - `eb-dash/app/(auth)/verify-otp/verify-otp-content.tsx` - Validação, placeholder e mensagens atualizadas de 6 para 8 dígitos
    - `eb-dash/app/(auth)/login/login-content.tsx` - Texto informativo atualizado de "6 dígitos" para "8 dígitos"
  - **Detalhes da correção:**
    - Validação de comprimento mínimo: `length < 6` → `length < 8`
    - Placeholder do input: `000000` → `00000000`
    - Limite de caracteres: `maxLength={6}` → `maxLength={8}`
    - Slice de entrada: `.slice(0, 6)` → `.slice(0, 8)`
    - Botão desabilitado: `token.length !== 6` → `token.length !== 8`
    - Mensagens de erro e descrição atualizadas

### Added
- **Autenticação OTP + Recuperação de Senha:** Sistema completo de autenticação com OTP de 8 dígitos e recuperação de senha funcional
  - **Migrações SQL (4 tabelas):**
    - `auth_otp_codes` - Armazenamento de códigos OTP com expiração (10 min)
    - `auth_password_reset_tokens` - Tokens de reset com expiração (1 hora)
    - `auth_rate_limits` - Proteção contra brute force
    - `auth_audit_log` - Auditoria de eventos de autenticação
  - **Utilitários (lib/auth/):**
    - `otp.ts` - Geração, validação e formatação de OTP
    - `password.ts` - Validação de força de senha, detecção de padrões comuns
    - `tokens.ts` - Geração e validação de tokens seguros
    - `rate-limit.ts` - Implementação de rate limiting
  - **API Routes:**
    - `POST /api/auth/otp/send` - Enviar OTP por email/SMS
    - `POST /api/auth/otp/verify` - Verificar OTP e criar sessão
    - `POST /api/auth/password/forgot` - Solicitar reset de senha
    - `POST /api/auth/password/reset` - Executar reset de senha
  - **Componentes Frontend (Dark Mode):**
    - `OTPInput.tsx` - Input de 8 dígitos com suporte a paste
    - `OTPTimer.tsx` - Contador regressivo com cores dinâmicas
    - `PasswordStrengthIndicator.tsx` - Indicador visual de força de senha
    - `MethodSelector.tsx` - Seletor de método (Email/SMS)
  - **Páginas de Autenticação:**
    - `/auth/verify-otp` - Verificação de OTP
    - `/auth/forgot-password` - Solicitação de reset
    - `/auth/reset-password` - Atualização de senha
  - **Segurança (OWASP):**
    - Rate limiting (max 5 tentativas OTP, bloqueio 15 min)
    - Tokens com expiração curta (OTP: 10 min, Reset: 1 hora)
    - Hashing seguro (bcrypt para senhas, SHA-256 para tokens)
    - RLS policies no Supabase
    - Proteção contra CSRF, XSS, SQL Injection
    - Cookies secure + httpOnly
    - Audit logging completo

- **Dashboard Empire (eb-dash) — Fase 2: Módulo TRAQUEAMENTO - Sub-aba Slug UTM (Template):** Implementação completa da primeira sub-aba do módulo
  - **Arquivos criados:**
    - `eb-dash/app/api/utm-slugs/route.ts` - API CRUD (GET, POST) para UTM slugs
    - `eb-dash/app/api/utm-slugs/[id]/route.ts` - API CRUD (GET, PUT, DELETE) individual
    - `eb-dash/app/api/utm-slugs/batch/route.ts` - API de importação em lote
    - `eb-dash/app/(dashboard)/traqueamento/components/TraqueamentoTabs.tsx` - Navegação de abas
    - `eb-dash/app/(dashboard)/traqueamento/components/SlugUtmTab.tsx` - Sub-aba Slug UTM completa
  - **Arquivos atualizados:**
    - `eb-dash/app/(dashboard)/traqueamento/page.tsx` - Página principal com navegação de abas
  - **Funcionalidades implementadas:**
    - Navegação de abas principal (CODS UTM, ORIGEM, PROCESSO DE VENDAS, ANÚNCIOS, ORGÂNICO, FUNIS)
    - Sub-abas para CODS UTM (Slug UTM, Sources, Sources Plain, Campaigns, Mediums, Terms, Contents)
    - DataTable completa com:
      - Colunas: Nome, Slug, Criado em, Ações
      - Ordenação por nome
      - Busca/filtro
      - Paginação
      - Fullscreen toggle
      - Sticky header
      - Column visibility toggle
    - CRUD completo:
      - Criar novo registro (modal)
      - Editar registro (modal)
      - Deletar registro (com confirmação)
      - Validação de duplicata (case-insensitive)
    - "Colar do Google Sheets":
      - Botão dedicado
      - Modal com textarea
      - Detecção automática de cabeçalho (nome, slug)
      - Validação de duplicatas no lote e contra banco
      - Importação em massa
    - API Routes:
      - `GET /api/utm-slugs` - Listar com busca e ordenação
      - `POST /api/utm-slugs` - Criar com validação
      - `PUT /api/utm-slugs/[id]` - Atualizar
      - `DELETE /api/utm-slugs/[id]` - Excluir
      - `POST /api/utm-slugs/batch` - Importar em massa
    - Controle de permissões via PermissionGate
    - Toast de feedback para ações
    - Estados: loading, vazio, erro
  - **Design:**
    - Usa design tokens (sem cores hard-coded)
    - Componentes reutilizáveis (DataTable, Button, Input, Modal)
    - Glassmorfismo para cards
    - Animações suaves
    - Responsivo
  - **Critérios de aceitação atendidos:**
    - [x] Navegação de abas funciona
    - [x] DataTable exibe dados da tabela `utm_slugs`
    - [x] CRUD completo funciona
    - [x] Colar do Sheets funciona
    - [x] Validação de duplicata
    - [x] API routes funcionais
    - [x] Usa design tokens
    - [x] Responsivo

### Added
- **Dashboard Empire (eb-dash) — Componentes Base de UI:** Criação de todos os componentes base reutilizáveis
  - **Arquivos criados:**
    - `eb-dash/components/ui/Button.tsx` - Botão com variantes (primary, secondary, ghost, destructive, outline, link)
    - `eb-dash/components/ui/Input.tsx` - Campo de entrada com label, ícones, estados de erro/sucesso
    - `eb-dash/components/ui/Select.tsx` - Dropdown com busca e multi-select
    - `eb-dash/components/ui/Skeleton.tsx` - Loading placeholder com shimmer animation
    - `eb-dash/components/ui/Modal.tsx` - Dialog com overlay blur e animações
    - `eb-dash/components/ui/Toast.tsx` - Sistema de notificações
    - `eb-dash/components/ui/DataTable.tsx` - Tabela profissional completa (CRÍTICO)
    - `eb-dash/components/ui/index.ts` - Barrel export
    - `eb-dash/lib/utils.ts` - Utilitários (cn, formatadores, storage helper)
    - `eb-dash/hooks/useToast.tsx` - Hook para gerenciar toasts
    - `eb-dash/docs/UI-COMPONENTS.md` - Documentação completa dos componentes
  - **Funcionalidades do DataTable:**
    - Sticky header + sticky primeira coluna
    - Ordenação por clique no cabeçalho
    - Paginação (10/25/50/100/todos)
    - Fullscreen toggle
    - Visibilidade de colunas (persistida no localStorage)
    - Footer com totalizadores
    - Estados: loading (skeleton), vazio, erro
    - Células clicáveis com modal de detalhes
    - Suporte a "Colar do Google Sheets"
  - **Dependência adicionada:**
    - `class-variance-authority` - Para variantes de componentes
  - **Características:**
    - Todos os componentes usam design tokens (sem cores hard-coded)
    - Glassmorfismo quando apropriado
    - Animações suaves e consistentes
    - Acessibilidade (a11y) considerada
    - Totalmente responsivo

### Fixed
- **Meta Ads Sync — Infraestrutura de Sincronização Automática:** Criada migration para habilitar sync automático
  - **Arquivos criados:**
    - `supabase/migrations/20260225100500_create_meta_ads_sync_infra.sql` - Migration completa com tabelas, funções e pg_cron
    - `supabase/diagnosticos/verificar-meta-ads-sync.sql` - Script de diagnóstico para verificar estado atual
    - `docs/meta-ads/TROUBLESHOOTING-SYNC.md` - Guia de troubleshooting e configuração
  - **Problema resolvido:**
    - A Edge Function `sync-meta-ads` existia mas não havia infraestrutura no banco de dados
    - Não havia job agendado (pg_cron) para execução automática
  - **O que a migration faz:**
    - Cria tabelas: `meta_ads_raw_insights`, `meta_ads_insights`, `meta_ads_insights_breakdowns`, `meta_ads_sync_log`
    - Cria tabelas de backfill: `meta_ads_backfill_controle`, `meta_ads_backfill_log`
    - Cria funções: `processar_meta_ads_raw()`, `registrar_sync_log()`, `criar_backfill_meta_ads()`, `sync_meta_ads_job()`
    - Configura RLS para todas as tabelas
    - Agenda job pg_cron para executar a cada hora (`sync-meta-ads-hourly`)
  - **Ação necessária:** Aplicar a migration e configurar variáveis de ambiente (ver TROUBLESHOOTING-SYNC.md)

### Added
- **Dashboard Empire — Implementação Inicial (MVP):** Primeira versão funcional do módulo TRAQUEAMENTO
  - **Arquivos criados:**
    - `eb-dash/lib/permissions.ts` - Biblioteca de permissões server-side
    - `eb-dash/contexts/PermissionContext.tsx` - Context React para permissões
    - `eb-dash/components/PermissionGate.tsx` - Componente de controle de acesso
    - `eb-dash/components/Providers.tsx` - Wrapper de providers
    - `eb-dash/hooks/useLeadFilter.ts` - Hook para filtro de leads
    - `eb-dash/hooks/useModuleTree.tsx` - Hook para árvore de módulos
    - `eb-dash/app/traqueamento/layout.tsx` - Layout do módulo TRAQUEAMENTO
    - `eb-dash/app/traqueamento/page.tsx` - Página principal do TRAQUEAMENTO
    - `eb-dash/app/traqueamento/components/SlugUtmTab.tsx` - Sub-aba Slug UTM (MVP template)
    - `eb-dash/app/api/utm-slugs/route.ts` - API CRUD para UTM slugs
    - `eb-dash/app/api/utm-slugs/[id]/route.ts` - API CRUD individual
  - **Funcionalidades implementadas:**
    - Sistema de permissões com herança (dot notation: `traqueamento.cods_utm.slug_utm`)
    - PermissionGate para controle de renderização baseado em permissões
    - Filtro de leads com 8 operadores (eq, neq, in, nin, contains, starts_with, is_null, is_not_null)
    - Sub-aba Slug UTM funcional com:
      - Tabela de dados com colunas Nome e Slug
      - Botão "Colar do Sheets" para importação em lote
      - Validação anti-duplicata (no lote e contra banco)
      - Preview antes de salvar
      - Toast de feedback
      - Estados: loading, vazio, erro
      - Edição inline
      - Exclusão com confirmação
    - API RESTful para UTM slugs (GET, POST, PUT, DELETE)
    - RLS (Row Level Security) em todas as tabelas
  - **Arquivos atualizados:**
    - `eb-dash/app/layout.tsx` - Adicionado Providers wrapper

### Added
- **Dashboard Empire — PRD e Documentação Base:** Definição completa do aplicativo Dashboard Empire
  - **Arquivos criados:**
    - `docs/PRD-DASHBOARD-EMPIRE.md` - PRD completo do app com módulo TRAQUEAMENTO
    - `docs/DASHBOARD-CONTROLE-ACESSO.md` - Especificação do sistema de acesso multi-usuário
    - `docs/DASHBOARD-MODULOS.md` - Guia para adição de módulos, sub-módulos e sub-sub-módulos
  - **Escopo do PRD:**
    - Módulo TRAQUEAMENTO com 6 abas principais e 14 sub-abas (CODS UTM, ORIGEM, PROCESSO DE VENDAS, ANÚNCIOS, ORGÂNICO, FUNIS)
    - Sistema de workspace multi-usuário com isolamento por conta
    - Controle granular de permissões por módulo/aba/sub-aba (dot notation: `traqueamento.cods_utm.slug_utm`)
    - Filtro de leads por parâmetros (UTMs, campos de contato, campos de oportunidade)
    - Arquitetura extensível para receber novos módulos sem refatoração
    - Integração com Notion (sync de criativos pagos e orgânicos)
    - Integração com Switchy (encurtamento de URLs UTM)
    - 17 tabelas de dados do módulo Traqueamento documentadas
    - 7 critérios de aceitação (Gherkin) para validação
  - **Controle de Acesso (DASHBOARD-CONTROLE-ACESSO.md):**
    - 3 camadas: Workspace RLS + Permissões de Módulo + Filtro de Leads
    - Modelo de workspace com papéis: owner, admin, member
    - 4 tabelas de controle de acesso: workspaces, workspace_members, dashboard_user_permissions, dashboard_user_lead_filters
    - Schema JSON para regras de filtro de leads (8 operadores, 2 lógicas AND/OR)
    - Checklist de implementação e checklist por módulo
  - **Guia de Módulos (DASHBOARD-MODULOS.md):**
    - Hierarquia de 4 níveis (módulo → aba → sub-aba → sub-sub-aba)
    - Catálogo centralizado de todos os módulos registrados
    - Passo a passo para adicionar módulo (10 passos), aba (7 passos) e sub-aba (5 passos)
    - Convenções e regras de nomenclatura
    - Checklists por nível de adição
    - Templates de estrutura para reutilização

### Added
- **Padrão/Tabelas de Dados:** REGRA e DOCUMENTAÇÃO TÉCNICA para criação de tabelas profissionais
  - **Arquivos criados:**
    - `vibe-coding/PROTOCOLOS/26-TABELAS-DADOS.md` - REGRA obrigatória
    - `docs/TABELAS-DADOS.md` - Documentação técnica completa
  - **Conteúdo da REGRA:**
    - Funcionalidades obrigatórias (estrutura, interatividade, personalização, totalização)
    - Checklist de implementação
    - Fluxo de verificação
    - Responsabilidades (desenvolvedor, designer, tech lead, QA)
    - Exceções permitidas
  - **Conteúdo da DOCUMENTAÇÃO TÉCNICA:**
    - Estrutura de dados (definição de colunas)
    - HTML/CSS semântico
    - Ordenação (sort) - implementação completa
    - Paginação - controles e cálculos
    - Tela cheia (fullscreen)
    - Personalização de colunas (visibilidade, persistência)
    - Formatação de dados (currency, number, percent, multiplier, date)
    - Totalização e métricas derivadas (ROAS, CPL, CTR)
    - Células clicáveis (modais de detalhes)
    - Estados de interface (loading, vazio, erro)
    - Checklist final de implementação

### Changed
- **Documentação/Conceito Lead:** Clarificação fundamental sobre a relação Lead × Oportunidade × Contato
  - **Arquivos atualizados:** `docs/TAGS-GHL.md`, `docs/CORRELACAO-META-CRM.md`, `docs/Document_GHL.md`, `vibe-coding/GLOSSARIO.md`
  - **Regra de Negócio:** **LEAD = OPORTUNIDADE CRIADA**
  - **Conceito:** Um contato pode ter múltiplos leads/oportunidades
  - **Exemplo:** Se João preencher 3 formulários, ele terá 1 contato e 3 leads/oportunidades
  - **Implicação:** Relatórios devem contar oportunidades, não contatos únicos

### Added
- **Documentação/Tags GHL:** Guia completo de tags do GoHighLevel
  - **Arquivo:** `docs/TAGS-GHL.md`
  - **Conteúdo:** Documentação completa de todas as tags do GHL utilizadas no sistema
    - Tags de Qualificação (MQL, NMQL, SQL, NSQL)
    - Tags de Funil (prefixo `[fn]`)
    - Tags de Campanha (prefixo `[cp]`)
    - Tags de Status e Ação (agendado, reagendar-sim, análise gratuita, conectado, bloquear)
    - Tags de Produto/Compra (lead cami start, cami start)
    - Tags de Venda (venda direta, venda externa)
    - Estágios do Pipeline
- **Protocolo/Documentação Tags:** REGRA de documentação obrigatória de tags
  - **Arquivo:** `vibe-coding/PROTOCOLOS/25-DOCUMENTACAO-TAGS.md`
  - **Regra:** Toda tag do GHL PRECISA estar documentada em `docs/TAGS-GHL.md` antes de ser utilizada
  - **Fluxo:** Verificar → Se não documentada, BLOQUEAR até criar documentação
  - **Modelo:** Template de documentação para novas tags
  - **Responsabilidades:** Definidas para desenvolvedor, PM/PO e Tech Lead
  - **Exceções:** Apenas em hotfix críticos, com documentação em até 48h

- **Integração/Meta Ads:** Backfill histórico implementado
  - **Objetivo:** Extrair dados desde setembro/2025 (~5 meses) sem sobrecarregar a API
  - **Estratégia:** 
    - Extrair **dia por dia** (não por hora) → Reduz 24x as chamadas
    - **Rate limiting:** 1 chamada a cada 5 segundos → ~720/hora (dentro do limite da Meta)
    - **Paginação:** Até 50 páginas por dia (25k registros máximo)
    - **Controle de progresso:** Pode parar e retomar depois
  - **Migration:** `criar_controle_backfill_meta_ads`
    - `meta_ads_backfill_controle` - Controle do job de backfill
    - `meta_ads_backfill_log` - Log detalhado por dia
    - Funções: `criar_backfill_meta_ads()`, `atualizar_progresso_backfill()`, `pausar/retomar_backfill_meta_ads()`
  - **Edge Function:** `sync-meta-ads-backfill` deployada
    - Endpoint: `https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads-backfill`
    - Suporta: dry run, lotes (max_dias), continuação (controle_id)
    - Processamento automático após salvar raw
  - **Documentação:** `docs/meta-ads/BACKFILL.md` com guia completo
  - **Tempo estimado:** ~15 minutos para 173 dias (set/2025 a fev/2026)
  - **Uso recomendado:** 30 dias por vez (`max_dias: 30`)

### Fixed
- **Banco/Meta Ads:** Criadas tabelas faltantes no projeto `gestaoprojetos`
  - **Problema:** Tabela `meta_ads_campaigns` estava vazia (0 registros)
  - **Causa Raiz:** As tabelas do Meta Ads **não existiam** no banco de dados do projeto
  - **Solução:** Criada migration `criar_tabelas_meta_ads` com todas as tabelas e funções
  - **Tabelas criadas:**
    1. `meta_ads_raw_insights` - JSON bruto da API (fonte de verdade)
    2. `meta_ads_insights` - Métricas processadas (28 colunas)
    3. `meta_ads_insights_breakdowns` - Segmentações demográficas
    4. `meta_ads_campaigns` - Metadados das campanhas
    5. `meta_ads_sync_log` - Log de execuções
  - **Funções criadas:**
    - `processar_meta_ads_raw(UUID)` - Processa um registro raw
    - `registrar_sync_log(...)` - Registra resultado da sincronização
    - `processar_meta_ads_pendentes()` - Processa todos pendentes
  - **RLS:** Políticas de segurança configuradas em todas as tabelas
  - **Status:** ✅ Tabelas criadas - Próximo passo: deploy da Edge Function e configurar cron

### Added
- **Integração/Meta Ads:** Roadmap completo para integração Meta Marketing API
  - **Objetivo:** Extrair métricas de campanhas Facebook/Instagram a cada 1 hora
  - **Escopo:** Todas as métricas disponíveis (spend, conversions, breakdowns)
  - **Arquitetura:** Fluxo API → Raw → Processed (igual webhooks GHL)
  - **Tabelas planejadas:**
    1. `meta_ads_raw_insights` - JSON bruto da API (fonte de verdade)
    2. `meta_ads_campaigns` - Metadados das campanhas
    3. `meta_ads_insights` - Métricas processadas por hora
    4. `meta_ads_insights_breakdowns` - Segmentações demográficas
    5. `meta_ads_sync_log` - Log de execuções
  - **Fluxo:**
    ```
    Meta API → Edge Function → raw_insights (JSON bruto) 
                                    ↓
                           Processamento → insights + breakdowns
                                    ↓
                               sync_log
    ```
  - **Vantagens da arquitetura Raw:**
    - Fonte de verdade sempre preservada
    - Reprocessamento possível em caso de erro
    - Auditoria e compliance
    - Debug facilitado
    - Evita perda de dados
  - **Credenciais:** Testadas e funcionando (conta: Bm 1 - Conta de anúncios)
  - **Documentação:** `docs/ROADMAP.md` atualizado com schemas completos
  - **Próximo passo:** Fase 1 - Criar tabelas no Supabase

- **Documentação/Meta Ads:** Criada pasta completa `docs/meta-ads/` com documentação didática
  - **Estrutura criada:**
    - `README.md` - Visão geral da integração
    - `EVENTOS.md` - Endpoints da API (insights, campaigns, levels, breakdowns)
    - `EXEMPLOS-PAYLOADS.md` - Exemplos reais de respostas da API
    - `MAPEAMENTO-CAMPOS.md` - Mapeamento API → Banco (todos os campos)
    - `PROCESSO-EXTRACAO.md` - Fluxo completo (API → Raw → Processed)
    - `REGRAS-EXTRACAO.md` - 13 regras de negócio (hourly, raw-first, upsert, etc)
  - **Decisão arquitetural:** ADR-006 - Arquitetura Raw First documentada em `DECISOES/`
  - **Padrão:** Mesmo formato da pasta `webhooks-ghl/` para consistência
  - **Objetivo:** Facilitar manutenção, onboarding e auditoria futura

- **Banco/Meta Ads:** Criada estrutura completa de tabelas e funções
  - **Migrations aplicadas:**
    - `criar_tabelas_meta_ads` - 5 tabelas + views + índices + RLS
    - `criar_funcao_processamento_meta_ads` - Funções de processamento
  - **Tabelas criadas:**
    1. `meta_ads_raw_insights` (12 colunas) - JSON bruto da API
    2. `meta_ads_campaigns` (15 colunas) - Metadados das campanhas
    3. `meta_ads_insights` (28 colunas) - Métricas processadas
    4. `meta_ads_insights_breakdowns` (14 colunas) - Segmentações
    5. `meta_ads_sync_log` (11 colunas) - Log de execuções
  - **Funções criadas:**
    - `processar_meta_ads_raw(UUID)` - Processa um registro raw específico
    - `processar_todos_meta_ads_pendentes()` - Processa todos pendentes (batch)
    - `upsert_meta_ads_campaign(...)` - Atualiza metadados de campanha
    - `registrar_sync_log(...)` - Registra resultado de sincronização
  - **Views criadas:**
    - `v_meta_ads_daily_summary` - Resumo diário por campanha
    - `v_meta_ads_ultimas_syncs` - Últimas 20 sincronizações
  - **Índices:** 17 índices otimizados para queries comuns
  - **RLS:** Políticas de segurança configuradas em todas as tabelas
  - **Próximo passo:** Fase 2 - Criar Edge Function de extração

- **Integração/Meta Ads:** Fase 2 completa - Edge Function e cron jobs
  - **Edge Function:** `sync-meta-ads` criada e deployada
  - **Funcionalidades:**
    - Autenticação com Meta API via access token
    - Busca de insights com todas as métricas (28 campos)
    - Paginação automática (até 100 páginas)
    - Retry com exponential backoff (3 tentativas)
    - Rate limit handling (erro 429)
    - Salva JSON bruto em `meta_ads_raw_insights`
    - Processa dados automaticamente via função PostgreSQL
    - Registra log de execução
  - **Cron jobs configurados:**
    - `sync-meta-ads-hourly` - Toda hora no minuto 0 (extração)
    - `process-meta-ads-pending` - A cada 15 min (processamento fallback)
  - **Deploy realizado:** ✅ Function deployada no Supabase
  - **Endpoint:** `https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads`

- **Integração/Meta Ads:** ✅ IMPLEMENTAÇÃO COMPLETA E FUNCIONANDO
  - **Status:** Sistema 100% operacional
  - **Testes realizados:**
    - ✅ Teste manual com dados simulados
    - ✅ Teste com API Meta real (37 registros buscados)
    - ✅ Processamento automático funcionando
    - ✅ Cron jobs executando corretamente
  - **Dados em produção:**
    - 39 registros de anúncios
    - 10 campanhas diferentes
    - R$ 287,04 em spend
    - 3.483 impressões
    - 81 cliques
    - CTR médio: 2.33%
  - **Variáveis de ambiente:** Configuradas via Supabase CLI
  - **Endpoint ativo:** `https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/sync-meta-ads`
  - **Agendamento:**
    - Extração: Toda hora (12:00, 13:00, 14:00...)
    - Processamento: A cada 15 minutos (fallback)

### Fixed
- **Banco/Correção Critério de Venda:** Função `extrair_dados_ghl()` não populava `vendas_fechamento`
  - **Problema:** Tabela `vendas_fechamento` estava vazia (0 registros) apesar de 445 oportunidades
  - **Causa Raiz:** Função não extraía dados de venda; Document_GHL.md define venda fechada quando `opportunity.data_pagamento_entrada` preenchido
  - **Solução:** 
    - Adicionada lógica na função `extrair_dados_ghl()` para extrair vendas
    - Adicionada constraint UNIQUE em `vendas_fechamento.oportunidade_id` para UPSERT
    - Removida coluna `data_venda` (não existe no Document_GHL.md)
  - **Migrations:** 
    - `adicionar_extracao_vendas_fechamento` - Adiciona lógica de extração
    - `corrigir_nomes_campos_vendas` - Corrige nomes dos campos (formato GHL `{{ opportunity.xxx }}`)
    - `adicionar_unique_oportunidade_vendas` - Constraint UNIQUE necessária para ON CONFLICT
    - `remover_coluna_data_venda` - Remove coluna não especificada no Document_GHL.md
  - **Status:** ✅ Resolvido - 40 vendas extraídas, R$ 668.920,60 em entradas recuperadas
  - **Impacto:** 
    - 40 vendas fechamento extraídas (out/2025 a fev/2026)
    - Produtos: Acelerador Gold, Acelerador Platinum
    - Dados completos: contratante, endereço, produto, valores, parcelas, forma de pagamento, data_pagamento_entrada

### Fixed
- **Banco/Correção Crítica:** Webhooks GHL retornando erro 500
  - **Problema:** Trigger `trigger_extracao_automatica` causava erro `"ON CONFLICT DO UPDATE command cannot affect row a second time"`
  - **Causa:** Trigger processava TODOS os webhooks a cada INSERT, gerando conflito quando 2+ webhooks simultâneos tentavam atualizar a mesma oportunidade
  - **Solução:** Substituído trigger por job `pg_cron` que processa a cada 1 minuto
  - **Migration:** `setup_pg_cron_job` - Remove trigger, cria job cron, adiciona coluna `processado_em`
  - **Status:** ✅ Resolvido - HTTP 200 nos webhooks, 200 webhooks processados retroativamente
  - **Impacto:** +15 contatos e +15 oportunidades recuperados da fila

### Changed
- **Banco/Processamento:** Arquitetura de processamento de webhooks GHL
  - **Antes:** Trigger AFTER INSERT (síncrono, falha em alta carga)
  - **Depois:** Job pg_cron assíncrono (processa a cada 1 min, lote de 100)
  - **Vantagens:** 
    - Não bloqueia INSERT de webhooks
    - Lida com concorrência sem erros
    - Tolerante a falhas (processa em lotes)
    - Traceable (coluna `processado_em` para auditoria)

### Added
- **Banco:** Coluna `processado_em` na tabela `webhooks_ghl`
  - Permite rastrear quais webhooks já foram processados
  - Índice parcial para queries eficientes de pendentes
- **Banco:** Função `processar_webhooks_pendentes()`
  - Processa webhooks em lotes de 100
  - Tratamento de erros por webhook (não para o lote todo)
  - Logging de quantidade processada
- **Banco:** Job cron `processar-webhooks-ghl`
  - Executa a cada minuto (`* * * * *`)
  - Gerenciado via extensão `pg_cron`
  - Status visível em `cron.job` e logs em `cron.job_run_details`
- **Banco:** Tabelas `contatos` e `oportunidades` para integração GHL
  - Relacionamento 1:N (um contato → múltiplas oportunidades)
  - Índices otimizados para busca por ghl_id, email, status
  - RLS ativado com políticas para usuários autenticados
  - Triggers para atualização automática de updated_at
- **Banco:** Função `extrair_dados_ghl()` para popular tabelas a partir de webhooks
  - Extrai dados JSON da tabela `webhooks_ghl`
  - Popula `contatos` (11 registros) e `oportunidades` (10 registros)
  - Idempotente: pode executar múltiplas vezes
- **Banco:** Trigger `trigger_extracao_automatica` para execução automática
  - Dispara AFTER INSERT na tabela `webhooks_ghl`
  - Extrai dados automaticamente sem intervenção manual
  - Fluxo: Webhook → Edge Function → Trigger → Extração → Tabelas
- **Documentação:** Processo completo de extração em `docs/webhooks-ghl/PROCESSO-EXTRACAO.md`
- **Documentação:** Decisão de extração em `DECISOES/20250219-extracao-contatos-oportunidades.md`
- **Documentação:** Meta Marketing API (Facebook/Instagram Ads) completamente documentada
  - Arquivo: `docs/APIS-DOCS/meta-marketing-api.md`
  - Cobertura: 100% dos endpoints, métricas, rate limits
  - Exemplos de código em JavaScript/TypeScript, Python, PHP
  - Inclui: Insights, Campaigns, Ad Sets, Ads, métricas de conversão
- **Infra:** Edge Function `webhook-ghl` para receber webhooks do GoHighLevel (GHL)
- **Banco:** Tabela `webhooks_ghl` para armazenar payloads em JSON bruto
- **Documentação:** Estrutura completa de documentação de webhooks em `docs/webhooks-ghl/`
  - `REGRAS-EXTRACAO.md` - Regras obrigatórias para extração de dados
  - `EVENTOS.md` - Catálogo de eventos GHL
  - `EXEMPLOS-PAYLOADS.md` - Template para documentar payloads
  - `MAPEAMENTO-CAMPOS.md` - Mapeamento técnico de campos
  - `DECISOES/TEMPLATE.md` - Template para decisões de extração
- **Segurança:** RLS configurado na tabela `webhooks_ghl`
- **Arquitetura:** ADR-001, ADR-002, ADR-003 registrados sobre gestão de webhooks GHL
- **Banco:** Implementação completa do Document_GHL.md
  - Tabela `contatos`: +70 colunas (UTMs, SWOT, follow-ups 1-15, análise, atribuição)
  - Tabela `oportunidades`: +25 colunas (datas MQL/SQL com fallback, qualificação)
  - Nova tabela `vendas_fechamento`: dados do contrato (cálculo automático valor_faturado)
  - Nova tabela `comunicacoes`: mensagens, ligações, AI conversations
  - Nova tabela `reunioes`: agendamentos de reuniões
  - Função `extrair_dados_ghl()` atualizada com 100+ campos e fallbacks
  - Decisão documentada: `DECISOES/20250219-implementacao-document-ghl-completa.md`

### Changed
- `docs/ARQUITETURA.md` - Adicionada seção sobre fluxo de dados de webhooks GHL
- `docs/DECISOES.md` - Adicionadas decisões arquiteturais sobre webhooks

---

## [0.1.0] - [Data]
### Added
- Versão inicial do projeto
## 2026-04-08

### Fixed
- **sync-contact-attribution / GHL custom fields:** correção do payload de escrita no GHL
  - **Problema:** a primeira execução do repair de attribution gravava `contatos` localmente, mas parte dos jobs de `PUT /contacts/{id}` morria com `HTTP 422`.
  - **Causa raiz:** o payload enviado ao endpoint de update de contato incluía `locationId`, e esse endpoint rejeita esse campo com `property locationId should not exist`.
  - **Correção aplicada:** a edge function `supabase/functions/sync-contact-attribution/index.ts` passou a enviar somente `customFields` no body.
  - **Ação operacional:** jobs mortos com payload antigo foram reprocessados e os custom fields no GHL foram preenchidos para os contatos resolvíveis.
  - **Resultado validado em 2026-04-08:** contatos `form-fb` com attribution determinística agora ficam com `utm_*` e `tt_*` tanto em `contatos` quanto no GHL; permaneceram apenas 2 leads sem `utm_*` porque o próprio bloco `attributionSource` do GHL não traz `utmContent`, `campaignId` nem `adId`, então não existe derivação segura.
# 2026-07-13 — Auditoria final do delta de staging multi-tenant

## Segurança e validação

- Auditoria focada nas migrations de correção RLS/trigger, na separação de ambiente de teste e no ensaio de staging: `security-report/audit-2026-07-13-staging-rollout-final.md`.
- Veredito da sessão: `security-report/verdict.json` com `gate: FAIL`. A revisão encontrou 3 P0 e 2 P1 preexistentes de sanitização de erros públicos/logs; não foram introduzidos pelas migrations de staging, mas bloqueiam corretamente a produção.
- Evidências repetidas: `npm audit --omit=dev` sem vulnerabilidades, build TypeScript/Vite verde e 47/47 testes críticos de isolamento no staging restaurado.
- O rollout em produção continua bloqueado pela correção/reteste desses erros, pela revisão do aviso de collation no PostgreSQL e pela autorização explícita do dono para a janela; nenhuma escrita foi feita no projeto de produção.
# 2026-07-13 — Sanitização P0/P1 de erros públicos e logs

## Segurança

- Criado `supabase/functions/_shared/safe-error.ts`: respostas públicas genéricas com `request_id`, sem detalhes de Supabase, Auth, banco ou provedores.
- Aplicado aos fluxos críticos de IA, administração, CRM, webhook e sincronização Meta/GHL; mensagens cruas e payloads/PII foram removidos dos logs desses caminhos.
- Criado `eb-dash2/src/lib/errors.ts` e aplicado aos toasts/estados críticos para não exibir `error.message` do backend.
- Criado `__tests__/security/error-sanitization.test.ts`; revalidação no staging: 73/73 testes críticos e de segurança verdes, build verde e `npm audit --omit=dev` sem vulnerabilidades.
- Reauditoria atualizou `security-report/verdict.json` para `gate: PASS`. Produção permanece sem escrita e ainda depende da revisão de collation e de autorização explícita da janela.
# 2026-07-14 — Clara e OpenRouter isolados por subconta

- `bot-chat`, `bot-chat-synthesis` e `bot-chat-data` agora exigem `workspace_id`, validam membership e falham fechados sem a chave OpenRouter cadastrada pela própria conta.
- A Clara usa somente `qwen/qwen3.6-plus`; o fallback anterior com modelos fora do contrato foi removido.
- Migration `20260829000000_isolate_clara_by_workspace.sql` versiona conversas/sessões por conta, faz backfill apenas quando seguro e restringe RLS.
- Consultas SQL livres e análise regional foram desativadas até receberem contrato de isolamento por conta.

# 2026-07-14 — Gestão completa da chave OpenRouter por conta

- Integrações permite testar a chave OpenRouter sem expor o segredo ou consumir IA e removê-la mediante confirmação.
- Migration `20260830000000_revoke_workspace_credential.sql` revoga somente a chave da conta do owner/admin e remove o segredo do Vault na mesma transação.

# 2026-07-14 — Telemetria e isolamento final da Clara

- Criada `workspace_ai_usage_events`: suporte/cobrança por conta com modelo, tokens, duração, status e erro sanitizado; sem prompt, resposta ou credencial.
- Relatórios automáticos e Telegram propagam `workspace_id`; Telegram falha fechado quando não há conta explicitamente mapeada.
- Teste estrutural A→B cobre o contrato de conversas, sessões, workers, chave OpenRouter, RLS e bloqueio de ferramentas ainda não isoladas (7/7 verde).
- Iniciada a migração visível de marca para OMNX: wordmark, telas principais, relatórios e prompts atualizados sem renomear tokens/tabelas internos.
