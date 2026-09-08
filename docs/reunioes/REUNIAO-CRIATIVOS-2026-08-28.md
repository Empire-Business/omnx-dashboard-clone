# Reunião — App Criativos (OMNX): dúvidas e melhorias

> **Data:** 28/08/2026, 13h36 BRT
> **Duração:** 47 min 21 s
> **Sala Google Meet:** `vfu-zxkf-gfn`
> **Fonte:** gravação em vídeo (1920×1080) — transcrição de áudio + leitura das telas compartilhadas
> **Transcrição bruta:** [`transcricao-criativos-2026-08-28.txt`](transcricao-criativos-2026-08-28.txt)
> **Documento gerado em:** 01/09/2026 às 11h20 BRT

---

## 1. Do que se trata esta reunião

Foi uma **sessão de apresentação e dúvidas do app Criativos** da plataforma OMNX. Uma pessoa
do time de criativos abriu a plataforma, passou tela por tela, e foi dizendo o que entendeu,
o que não entendeu, o que não funciona e o que ela mudaria. Do outro lado, o responsável
técnico ia explicando, anotando os bugs e consultando a equipe em tempo real.

Não foi uma reunião de decisão fechada — foi um **levantamento de melhorias**. Quase tudo que
saiu dela é pedido de ajuste, correção de bug ou pergunta que ficou em aberto.

A frase que resume o tom da reunião veio do usuário:

> *"Eu tomei um pouco um susto quando vi tanta opção de coisa pra preencher. E a maioria eu
> não acho tão relevante."* — 00:37:29
>
> *"Se tem muita informação, acaba que dificulta às vezes. Se não tem relevância, utilidade
> pra mim, não tem por que estar aqui."* — 00:19:25

---

## 2. Quem participou

| Papel na conversa | Nome exibido no Meet | O que faz |
| --- | --- | --- |
| **Time da plataforma** (dev/suporte) | Gildásio Junior | Explica as funcionalidades, anota os bugs, consulta a equipe durante a call, promete corrigir |
| **Time de criativos** (usuário) | Contato Exos Consultoria | Compartilhou a tela, navegou pela plataforma, levantou as dúvidas e os pedidos de melhoria |

> A conta logada na plataforma durante a demonstração era **`matheus@zlk.com.br`**.
> A associação entre nome exibido e papel foi inferida do contexto da conversa (quem
> compartilha a tela é quem tem as dúvidas e mostra o próprio Notion da Exos).

**Pessoas citadas, mas ausentes:**

- **Bruno Guzela** — quem construiu a base da plataforma. *"Quem começou, desde a base ali, foi o Bruno"* (00:01:10). Foi sugerido consultá-lo sobre as mudanças propostas.
- **Davi** — usa a plataforma; foi para ele que se adicionou a visão de vendas.
- **Andreas** — manda dúvidas sobre dados e tráfego pago.
- **"O cara do tráfego"** — contato recorrente quando os dados divergem entre a Meta e a plataforma.
- **Cami** — sistema para onde as demandas de clientes migraram do Notion.

---

## 3. O que apareceu na tela (transcrição visual)

A tela compartilhada mostrou dois sistemas, alternando entre eles.

### 3.1 A plataforma OMNX

Layout escuro, roxo/violeta, logo **OMNX** no topo da barra lateral.

**Barra lateral:** `Todos os apps` · `Admin` · **MENU** → `Criativos` (expandido com
`Dashboard`, `Ranking`, `Biblioteca`, `Kanban`, `Testes`). No rodapé, a conta logada
(`matheus@zlk.com.br`) e o botão de sair.

**Cabeçalho:** breadcrumb `Criativos / <aba>`, botão de tema claro/escuro, botão `Admin` e
seletor de app `Criativos` no canto superior direito.

**Título da página:** "Criativos — Controle e teste de criativos de anúncios", com as 5 abas
logo abaixo.

#### Aba Dashboard

| Bloco | O que exibia |
| --- | --- |
| **Meta semanal** | `0 / 18 validados` · selo vermelho `0% · Atrasado` |
| **Validados / semana** | `0` · Meta: 18 · `0% vs semana anterior` |
| **Lead time** | `—` (vazio) · legenda "Ideia → decisão" |
| **Cycle time** | `—` (vazio) · legenda "Teste → decisão" |
| **Yield rate** | `0%` · "0 aprovados / 0 testados" |
| **WIP** | `976` · "Criativos em andamento" |
| **Total de criativos** | `1000` · "985 Notion · 15 Nativos" |
| **Tempo até teste** | `—` (vazio) · "Pronto → início do teste" |
| **Funil de produção + testes** | "Fluxo de ideia até escalar/pausar" — Ideia `8` (61,5%), Roteiro `4` (30,8%), Produzindo `1` (7,7%), Revisão `0`, Ajustes `0`, Aprovado `0`, Pronto `0`, Em Teste `0`, Testado `0`, Escalar `0` |
| **Throughput diário** | "Criativos validados nos últimos 15 dias" |
| **Throughput semanal** | "Criativos validados por semana vs meta" |
| **CPL médio por formato** | Custo por lead por formato |

> Note a contradição visível na própria tela: o card **Total de criativos** diz `1000` e o
> **WIP** diz `976`, mas o **Funil** soma apenas `13` (8 + 4 + 1). Foi exatamente isso que
> ninguém na reunião conseguiu explicar.

#### Aba Ranking

Filtros de período (`Hoje`, `Ontem`, `7 dias`, `30 dias` — selecionado, `90 dias`,
`Este mês`, `Mês passado`, seletor de ano/mês) com intervalo `30/07/2026` até `28/08/2026`.

Filtros adicionais: `Campanha Meta`, `Conjunto`, `Anúncio`, `Canal`, `Funil [fn]`,
`Campanha [cp]`, `Pré-vendedor`, `Closer`. Classificação: "Todos os leads".

**Ranking de Criativos** — "10 criativos (53 sem MQL ocultos)", com o botão `Só com MQL`
ativo, `Colunas` e `Tela cheia`.

Colunas: `CRIATIVO`, `INVESTIMENTO`, `FATURAMENTO`, `CAIXA`, `LEADS`, `CPL`, `MQL`,
`CPMQL`, `REU…`

Primeira linha visível: **CR-248** (1 público) — Investimento `R$ 11.396,89` ·
Faturamento `R$ 0,00` · Caixa `R$ 0,00` · Leads `114` · CPL `R$ 99,97` · MQL `107` ·
CPMQL `R$ 106,51`.

#### Aba Biblioteca

Cabeçalho: **"Produção (Pago) — Notion"** · `1000 registros.` · botões `+ Novo Criativo` e
`Sincronizar` (este último aparecendo esmaecido/desabilitado).

Busca: "Buscar por nome, ID…" e um seletor `Todos`.

Colunas da tabela: `ID`, `NOME`, `STATUS`, `FORMATO`, `OBJETIVO`, `DISPONÍVEL`, `TESTADO`,
`INÍCIO DO TESTE`, `APROVAÇÃO` (botões `✓ Sim` / `✗ Não`), `LINKS` (`Vídeos`, `Asset`), e
mais colunas cortadas à direita.

Exemplos de linhas: `CR-2 [TR] (Davi)` e `CR-3 (Davi)` — Concluído · Reels ·
"Reunião Secreta" · 23/10/2025; mais abaixo `CR-1085` a `CR-1090` — `[Bruno] H3: Advogado…`,
`[Bruno] H4: Se você é…`, `[Bruno] H1: O tanto d…`, `[Bruno] H2: Você post…` — todos
"Não iniciado" · Reels · "Acelerador de Marca".

#### Aba Kanban

**"Produção — Kanban"** com busca "Buscar por nome ou código…" e filtro `all`.

Colunas: `Ideia` · `Roteiro` · `Produzindo` · `Revisão` · `Ajustes` · `Aprovado` (e mais à
direita, acessíveis pela barra de rolagem horizontal). Todas com contador `0` no início.

Card criado durante a reunião: **`AN-0017 · TESTE 1`** — etiquetas `Reels` e `Nativo`,
marcação `nao_testado`, `Sem responsável`. Foi arrastado de `Ideia` → `Roteiro` →
`Produzindo`, exibindo o toast verde **"Status atualizado"**.

#### Aba Testes

**"Testes de Criativos"** — "Gerencie testes A/B, compare métricas com critérios e tome
decisões." Busca por "nome, código, formato".

**Parâmetros de teste configurados** (exibidos como etiquetas):

| Parâmetro | Valor |
| --- | --- |
| CPL alvo | R$ 70,00 |
| Budget mínimo | R$ 50,00 |
| Budget máximo | R$ 100,00 |
| Janela | 3–5 dias |
| Stop antecipado | CPL ≥ 150x após R$ 30,00 |

Seções: **Fila de testes** → estado vazio com ícone de frasco, "Fila vazia — Nenhum criativo
pronto para iniciar teste"; e **Testes em andamento**, igualmente vazia.

#### Modal "Novo Criativo"

Campos, na ordem em que aparecem:

| Campo | Tipo | Placeholder / opções |
| --- | --- | --- |
| **Nome** * (obrigatório) | texto | — (foi preenchido com `TESTE 1`) |
| **Formato** | seleção | `Reels` |
| **Campanha** | seleção | "Selecione a campanha" — **vazia** |
| **Objetivo / CTA** | texto | "Ex: conversão, awareness" |
| **Perfil** | texto | "Perfil/avatar do criativo" |
| **Rede social** | texto | "Ex: Meta, Google, TikTok" |
| **Estágio do funil** | texto | "Ex: topo, meio, fundo" |
| **Pilar de conteúdo** | texto | "Ex: educação, depoimento" |
| **Tipo criativo** | seleção | "Selecione o tipo" |
| **MVP status** | seleção | "Selecione o status" (aprovado / reprovado) |
| **Copy** | textarea | "Texto principal do criativo" |
| **Hook** | textarea | "Gancho inicial" |
| **CTA text** | textarea | "Chamada para ação" |
| **Observações** | textarea | "Notas internas sobre o criativo" |
| **Links** | 3 campos | "Pasta de vídeos" · "Asset final" · "Asset bruto" |

### 3.2 O Notion (base atual do time de criativos)

Página **"Criativos - EmpireMedia"** dentro do workspace `databases - HTC`, **publicada no
domínio `exosconsultoria.notion.site`**.

Abas da base: `Geral` · `Kanban` · `Calendário` · `Tabela` · `Evento` · `Postagem`.

Colunas: `ID` · `Nome` · `Status` · `Formato` · `Objetivo CTA` · `Editor/Designer` ·
`Pasta dos vídeos` · `Arquivo B…`

Filtros ativos durante a demonstração: `Formato: Estático`, `Objetivo CTA: Aplicação`,
agrupado por `Sem Prazo Edição` e por `ago. de 2026`.

**Registros vistos:**

- `CR-180` a `CR-200` — "O Acelerador de Audiência cuida do seu conteúdo", "Qual dos dois vc acha que vende mais", "(Pedro) Dependente de tráfego pago", "(Davi) Lead cada vez mais caro", "Comparação Médico", "Comparação Advogado", "Empresários na plateia", "Cansado de ficar calado?" — todos `Concluído` · `Estático` · `Aplicação`, com editores **Breno Carvalho** e **Pedro Paracampos**. Contagem: 8.
- `CR-1246` a `CR-1256` — `AD 34 CÓDIGO EST`, `PRIME AD 01` a `PRIME AD 10` — todos
  `Concluído` · `Estático` · `Aplicação`. Contagem: 24.

**Status observados no Notion:** `Concluído`, `Não iniciado`, `Revisar edição`, `Postado`,
`Postado no Trial`, e registros **sem status nenhum**.

**Objetivos/campanhas observados:** `Código da Audiência`, `Aplicação`, `BPO`, `Máfia Russa`,
`Acelerador de Marca`, `Reunião Secreta`.

---

## 4. Perguntas respondidas durante a reunião

Estas ficaram **esclarecidas** — valem como documentação das métricas.

| Métrica | Definição confirmada na reunião |
| --- | --- |
| **Validados / semana** | *"São os testes decididos como aprovados."* (00:04:26) |
| **Lead time** | Tempo do zero até o veredito. *"Média é a esteira por completo: ideia, roteiro, gravação, edição, aprovação."* (00:04:36 / 00:05:11) |
| **Cycle time** | Só a fase de teste. *"Média dos dias entre iniciar o teste e bater o martelo."* (00:04:46) |
| **Yield rate** | *"De tudo que eu testei, quanto prestou. De quantos testes foram feitos, o percentual que foi aprovado."* (00:04:54) |
| **WIP** | Work in Progress — *"o estoque; os criativos que começaram e não foram terminados."* (00:07:33) |
| **Regra do WIP** | **Tudo que não está em `escalar` nem em `arquivado`.** Só esses dois status são fim de linha; todo o resto conta como trabalho em andamento (00:12:30) |
| **O que fica fora do WIP** | `Escalar`, `Arquivado`, `Postado`, `Concluído`, **criativos sem status** e `Postado no Trial` (00:12:58) |
| **O que entra no WIP** | Ideia, Roteiro, Produzindo, Revisão, Ajustes, Aprovado, Pronto, Em Teste, Testado (00:12:43) |
| **Total de criativos** | `1000` = 985 vindos do Notion + 15 nativos (criados direto na plataforma) |
| **App Store / Todos os apps** | Mecanismo multi-tenant: *"como essa plataforma também vai ter outros clientes, pra ele ter a opção de habilitar ou desabilitar algumas abas."* (00:01:50) |
| **Isolamento de dados** | Confirmado: os dados da Empire continuam separados, sem conflito com outros clientes (00:03:28) |
| **Regra do código do criativo** | O código **nasce na plataforma**, antes de subir na Meta, e deve ser usado igual nos dois lugares. *"Se subir primeiro [na Meta] e cadastrar depois, quase sempre o código não entra no nome"* (00:37:22). Criativos nativos recebem ID no formato `AN-00XX` (`AN-0017` foi o 17º criado) |

### Fluxo de status entendido pelo time

```
Roteiro → Gravação → Edição  ──►  CONCLUÍDO      (o vídeo está pronto)
                                      │
                                      ▼
                              "APROVAÇÃO" = Sim   (o tráfego pegou e subiu no anúncio)
                                      │
                                      ▼
                                  TESTADO         (o teste rodou e houve veredito)
```

> *"O status concluído é quando está pronto, o vídeo está pronto. Daí, aprovação é quando o
> pessoal do tráfego pegou esse vídeo e já botou pra rodar no tráfego."* — 00:23:08

---

## 5. Bugs encontrados

Ordenados por gravidade. Todos foram reproduzidos ao vivo durante a reunião.

### 🔴 BUG-01 — Criativo aprovado não aparece na aba Testes

**Gravidade:** Alta — quebra o fluxo principal da aba.

O criativo `AN-0017 / TESTE 1` foi levado até o fim do fluxo: movido no Kanban até
`Aprovado`, marcado como **Testado**, com **data de início do teste** preenchida (28/08) e
**Aprovação = Sim**. Mesmo assim, a aba **Testes** continuou exibindo *"Fila vazia — Nenhum
criativo pronto para iniciar teste"*.

> *"Será que agora aparece em testes, definitivamente? — Também não. Por que não aparece em
> testes?"* — 00:44:18

**Status:** o time da plataforma assumiu a investigação. *"Vou ver isso"* (00:41:05).

---

### 🔴 BUG-02 — Sincronização com o Notion trava em 1.000 registros

**Gravidade:** Alta — a base fica incompleta e os números do dashboard ficam errados.

O card "Total de criativos" mostra exatamente `1000` (985 Notion + 15 nativos), mas o Notion
tem mais que isso — na tela apareceram registros até **`CR-1256`**. Os criativos estáticos
recentes (a faixa `CR-1246`–`CR-1256`, incluindo `PRIME AD 01` a `PRIME AD 10`) **não
apareciam na plataforma**.

Ao clicar em **Sincronizar**, a operação parou de novo em 1.000 e **exibiu um erro na tela**.

> *"Pô, parou em 1000. Aí deu problema, então é isso mesmo."* — 00:30:51
> *"Bem estranho, porque estava mostrando o total de mil criativos, só que tem mais de mil aí."* — 00:29:43

**Hipótese:** limite de paginação não tratado na integração com a API do Notion (1.000 é um
número redondo demais para ser coincidência).

**Status:** em investigação pelo time da plataforma.

---

### 🟠 BUG-03 — Os 15 criativos "nativos" não apareciam no Kanban

**Gravidade:** Média.

O dashboard contabiliza 15 criativos nativos, mas o Kanban aparecia vazio (todas as colunas
em `0`) antes da criação do card de teste.

> *"Eu não sei, porque ali diz que tem 15 nativos. Pra mim, eu tinha entendido que subiram 15
> criativos aqui. Mas não sei, porque eu não estou vendo."* — 00:24:58
> *"Não, vou dar uma olhada nisso, porque tinha que aparecer pelo menos alguma coisa aí."* — 00:25:07

---

### 🟠 BUG-04 — Falta barra de rolagem horizontal na Biblioteca

**Gravidade:** Média — impede o uso em mouse comum.

A tabela da Biblioteca tem mais colunas do que cabe na tela, mas **não existe barra de
rolagem horizontal**. O usuário só conseguiu ver as colunas da direita depois de habilitar
manualmente o gesto do touchpad do notebook.

> *"Eu não consigo arrastar pro lado sem o touch do teclado… Teria que ter um scroll ali pra
> eu conseguir ver o que tem mais pro lado."* — 00:15:20 / 00:16:08

---

### 🟡 BUG-05 — Cards do "Funil de produção + testes" não são clicáveis

**Gravidade:** Baixa (mas ligada ao item de usabilidade UX-01).

Tentou-se clicar nos cards e ao lado deles para entender de onde vinham os números. Nada
acontece — não há detalhamento nem drill-down.

> *"Aperta nesse card aí, vai que abre alguma coisa. — Não, não tem clique, né?"* — 00:14:38

---

### 🟡 BUG-06 — Arrastar cards no Kanban é difícil

**Gravidade:** Baixa — atrito de usabilidade.

O drag-and-drop funciona, mas é travado, e só permite mover um card por vez.

> *"O problema é que é complicado de arrastar ele; pelo visto tem que arrastar de um em um."* — 00:40:31

---

## 6. Melhorias pedidas

### 6.1 Formulário "Novo Criativo" — enxugar e corrigir

Este foi o ponto com mais pedidos concretos. O veredito geral: **campos demais, e a maioria
sem utilidade para quem cadastra.**

| # | Campo | Pedido | Justificativa (fala do usuário) |
| --- | --- | --- | --- |
| **MEL-01** | **Campanha** | **Preencher com as campanhas reais** e permitir filtrar por elas | O seletor está vazio. As campanhas reais são `Código da Audiência`, `Aplicação`, `BPO`, `Máfia Russa` — e no Notion elas estão gravadas no campo **"Objetivo"**, não em "Campanha". *"O ideal seria eu conseguir filtrar por campanha… cada criativo fica marcado com a tag da campanha."* (00:34:10) |
| **MEL-02** | **Objetivo / CTA** | **Remover** | Vira redundante assim que a campanha estiver preenchida. *"Esse objetivo realmente não precisaria preencher, porque já vai estar na campanha."* (00:34:52) |
| **MEL-03** | **Tipo criativo** | **Remover** | Duplica o campo **Formato**, que já existe. *"Já tem o formato, entendeu? Acho que não faz sentido estar isso aqui."* (00:36:57) |
| **MEL-04** | **Hook** | **Remover** | *"Esse Hook aqui também não acho relevante."* (00:38:43) |
| **MEL-05** | **CTA text** | **Remover** | *"E essa CTA também não acho relevante."* (00:38:49) |
| **MEL-06** | **MVP status** | **Revisar ou remover** | Não é usado pelo time, e não está claro se é para preencher no cadastro ou depois. *"Cara, eu não [uso]."* (00:36:13) |
| **MEL-07** | **Copy** | **Manter, mas definir o que é** | Há ambiguidade: é o roteiro do vídeo ou a legenda do post? Conclusão da conversa: é o texto da postagem. (00:38:22) |
| **MEL-08** | **Legenda do anúncio** | **CRIAR campo novo** | É o texto que aparece acima do criativo no anúncio veiculado — hoje não existe campo para isso. *"Acho que teria que ter legenda do anúncio, porque aí a pessoa coloca o texto que vai em cima daquele anúncio."* (00:38:51) |
| **MEL-09** | **Perfil** | Baixa prioridade | *"Perfil também não sei se é tão interessante."* (00:36:28) |
| **MEL-10** | **Estágio do funil** | Manter, desde que opcional | *"Também não acho interessante pra mim, mas pode deixar aí — contanto que não seja obrigatório, tá ok."* (00:36:34) |
| **MEL-11** | **Rede social** | Manter | *"Rede social, tá, beleza, pode deixar."* (00:36:34) |
| **MEL-12** | **Observações** | Manter | *"Pode deixar observações, eu acho."* (00:39:05) |
| **MEL-13** | **Links (bruto/final)** | Manter — está claro | Asset bruto = original; Asset final = vídeo já editado. (00:39:14) |
| **MEL-14** | **Obrigatoriedade** | **Nenhum campo obrigatório além do Nome** | Regra transversal: o excesso de campos faz a pessoa achar que precisa preencher tudo. *"Às vezes a pessoa pode achar que tem que preencher tudo."* (00:37:24) |

---

### 6.2 Nomenclatura

**MEL-15 — Renomear a coluna "Aprovação".** 🟠 *Alta relevância*

O nome induz ao erro: parece indicar que o criativo foi **validado / deu certo**, quando na
verdade significa apenas que **o time de tráfego pegou o criativo e subiu no anúncio**.

> *"Aprovação fica muito parecido… fica parecendo que ele foi validado, tipo, parece que deu
> certo."* — 00:23:36

**Sugestão levantada na própria reunião:** `Publicado` (ou algo equivalente que indique
"subiu para o tráfego").

---

### 6.3 Biblioteca — filtros e ordenação

**MEL-16 — Ordenação por data.** Hoje a listagem é fixa em ordem crescente de entrada (do mais
antigo para o mais novo). Falta poder inverter.

> *"Não dá pra filtrar ali, tipo, dos mais recentes, dos mais antigos — aí só fica dos mais
> antigos."* — 00:30:01

**MEL-17 — Filtrar por formato.** Reels, estático, etc.

**MEL-18 — Filtrar por objetivo/campanha.** Hoje só existe busca por nome e ID.

> *"Tem só como colocar por nome, pelo ID. Mas não tem como filtrar por objetivo."* — 00:30:31

---

### 6.4 Kanban e fluxo de status

**MEL-19 — Permitir escolher o status inicial no cadastro.** 🟠 *Alta relevância*

Todo criativo novo cai automaticamente em **Ideia**, e o status só pode ser alterado
arrastando o card no Kanban. Mas o fluxo real do time é outro: frequentemente o criativo já é
cadastrado **pronto**.

> *"Pra mim, a partir do momento que eu subo o criativo, ele tá pronto… eu já subiria o
> criativo pronto."* — 00:42:03 / 00:42:34

**MEL-20 — Permitir editar o status fora do Kanban** (na Biblioteca ou na edição do criativo).

> *"Não tem como mudar o status, tipo, ele já vai direto pra ideia… eu só posso mudar ali no
> Kanban."* — 00:41:43

---

### 6.5 Ordem dos campos de teste está invertida

**MEL-21 — Desacoplar "Início do teste" de "Testado".** 🟠 *Lógica invertida*

Hoje o campo **Início do teste** só fica editável **depois** de marcar o criativo como
**Testado** — o que é logicamente ao contrário: quando o teste começa, ele ainda não foi
testado.

> *"Pra eu conseguir colocar a data de início do teste, eu tenho que marcar como testado
> primeiro. O que é meio esquisito, né? Ele ainda não foi testado."* — 00:43:51

---

### 6.6 Dashboard — simplificar

**UX-01 — Explicar ou remover o "Funil de produção + testes".** 🔴 *Ninguém entendeu*

O bloco soma apenas 13 criativos (8 Ideia + 4 Roteiro + 1 Produzindo) enquanto o resto do
dashboard fala em 976 e 1000. Não há explicação na tela, não há clique, e a conversa não
chegou a uma conclusão.

> *"Esse aqui, cara, eu não entendi nada… Eu não entendi a utilidade disso aqui. Se não tem
> relevância, utilidade pra mim, não tem por que estar aqui."* — 00:13:37 / 00:19:20

**UX-02 — Princípio geral: menos é mais.** Pedido transversal de reduzir a densidade de
informação e tornar a interface mais intuitiva.

> *"Talvez deixar um pouco mais simples, tirar o que não for relevante… deixar mais
> intuitivo."* — 00:45:09

---

## 7. Questões estratégicas em aberto

Estas **não foram resolvidas** na reunião e precisam de decisão.

### Q1 — Manter ou abandonar a integração com o Notion?

Para **novos clientes** a decisão já está tomada: eles cadastram direto na plataforma, sem
Notion. *"Fazer essa transferência de lá pra cá é um pouco complicado, assim, diretão."*
(00:11:10)

Para a **Empire**, ficou em aberto. O argumento contra manter:

> *"A gente tem vários anúncios lá no Notion, mas a maioria não está sendo usada. Então não
> sei se é interessante vincular o Notion mesmo. Porque tem esse problema: a gente não sabe o
> que ele está relacionando nos status, qual status significa o que nessa plataforma."* — 00:11:52

**Risco identificado:** repetir o que aconteceu com o Cami — parte do time trabalhando num
sistema e parte em outro, gerando incongruência. *"Foi migrado pra Cami, aí ficou meio que
nessa incongruência, porque tem gente que faz num, que faz no outro."* (00:11:34)

### Q2 — Qual é o mapeamento oficial de status Notion → plataforma?

Este é o **nó central** de várias dúvidas da reunião. O Notion tem `Concluído`,
`Não iniciado`, `Revisar edição`, `Postado`, `Postado no Trial` e registros **sem status
nenhum** — e não está documentado como cada um se traduz nos status da plataforma.

Consequência prática já observada: criativos **sem status no Notion** simplesmente não entram
nas contas do dashboard. *"Se não tiver status algum criativo, também não vai entrar aqui."*
(00:12:58)

### Q3 — Como o time de tráfego entra no fluxo?

A plataforma pressupõe operação a quatro mãos: o time de criativos cadastra e produz; o time
de tráfego preenche o que só ele tem acesso (início do teste, aprovação, CPL, investimento).

> *"Essa plataforma seria gerenciada pela pessoa que está fazendo os criativos e pelo time de
> tráfego também, porque eles precisam colocar algumas informações aqui que só eles têm
> acesso."* — 00:06:11

**Duas propostas surgiram:**

1. **Automatizar via webhook** puxando direto do gerenciador de anúncios da Meta.
   *"Você deve ter um webhook aqui já implementado, que deve puxar direto já."* (00:06:03)
2. **Treinar o time de tráfego** na plataforma. *"Provavelmente vai ter que ter uma explicação
   aí pra ele também, para entender como é que funciona a plataforma."* (00:07:01)

**Contexto relevante:** já existe um histórico de divergência de dados entre a Meta e a
plataforma. *"Às vezes bate lá, não bate aqui. Às vezes bate aqui, não bate lá."* (00:06:40)

### Q4 — Qual é o nível real de adoção da plataforma hoje?

Ficou sem resposta clara. Sabe-se que o Davi usa, e que a galera do tráfego consulta alguns
dados, mas não se sabe a frequência.

> *"Eu não sei quantas pessoas estão usando, tipo assim, constantemente."* — 00:46:30

---

## 8. Próximos passos combinados

| # | Ação | Responsável | Prazo acordado |
| --- | --- | --- | --- |
| 1 | Enviar a gravação da reunião | Time de criativos | Mesmo dia (28/08) — *"demora uma hora e meia, duas horas pra ficar disponível"* |
| 2 | Investigar e corrigir os bugs levantados | Time da plataforma | A partir do recebimento da gravação |
| 3 | Conversar sobre o andamento | Ambos | **Segunda-feira (31/08)** |
| 4 | Enviar dúvidas adicionais por mensagem | Time de criativos | Ao longo da semana |
| 5 | Consultar Bruno Guzela sobre as mudanças propostas | Time da plataforma | — |

> *"Manda aqui hoje mesmo já, tento ir melhorando aqui já. Final do dia eu te mando mensagem;
> na segunda-feira eu falo com você também."* — 00:46:43

---

## 9. Resumo executivo — backlog priorizado

### 🔴 Bloqueadores (quebram o fluxo)

1. **BUG-01** — Criativo aprovado + testado + com data não aparece na aba Testes
2. **BUG-02** — Sincronização com o Notion trava em 1.000 registros e retorna erro
3. **UX-01** — Bloco "Funil de produção + testes": explicar de onde vêm os números, ou remover

### 🟠 Alta prioridade

4. **BUG-03** — 15 criativos nativos não aparecem no Kanban
5. **BUG-04** — Sem barra de rolagem horizontal na Biblioteca
6. **MEL-01** — Popular o seletor de Campanha com as campanhas reais + permitir filtrar
7. **MEL-15** — Renomear "Aprovação" para "Publicado" (ou equivalente)
8. **MEL-19** — Permitir escolher o status inicial ao cadastrar o criativo
9. **MEL-21** — Desacoplar "Início do teste" de "Testado"
10. **Q2** — Documentar o mapeamento de status Notion → plataforma

### 🟡 Média prioridade

11. **MEL-02 a MEL-06** — Remover os campos redundantes/irrelevantes do formulário (Objetivo/CTA, Tipo criativo, Hook, CTA text, MVP status)
12. **MEL-08** — Criar o campo "Legenda do anúncio"
13. **MEL-16 a MEL-18** — Ordenação por data e filtros por formato e campanha na Biblioteca
14. **MEL-14** — Garantir que nenhum campo além do Nome seja obrigatório
15. **MEL-20** — Permitir editar status fora do Kanban

### 🔵 Baixa prioridade

16. **BUG-05** — Tornar os cards do funil clicáveis (drill-down)
17. **BUG-06** — Melhorar o drag-and-drop do Kanban
18. **MEL-07** — Documentar o que é o campo "Copy"

### 📋 Decisões pendentes (não são tarefas de código)

19. **Q1** — Manter ou abandonar o Notion para a Empire
20. **Q3** — Definir como o time de tráfego entra no fluxo (webhook automático vs. preenchimento manual + treinamento)
21. **Q4** — Levantar a adoção real da plataforma

---

## 10. Observações sobre a fidelidade deste documento

- A transcrição de áudio foi gerada por **Whisper (modelo `medium`, português)** rodando
  localmente. Trechos com ruído ou fala sobreposta podem conter imprecisões.
- **Erros de transcrição já identificados e corrigidos neste documento:** "Notion" aparece na
  transcrição bruta como *"No Show"*, *"Nojo"*, *"luxo"*, *"Trial"*; "Kanban" como *"Canban"*,
  *"cambam"*, *"cambão"*; "WIP" como *"Wimpy"*, *"weeper"*, *"EP"*; "Hook" como *"Hulk"*;
  "Guzela" como *"Gusella"*, *"Guzel"*; "asset" como *"assete"*.
- Todas as citações trazem o **timestamp** para conferência contra a gravação original.
- Os valores numéricos das telas (métricas, IDs, parâmetros de teste) foram lidos diretamente
  dos frames do vídeo, não da transcrição de áudio.
