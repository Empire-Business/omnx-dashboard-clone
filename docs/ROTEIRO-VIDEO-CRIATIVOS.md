# Roteiro do vídeo — Tour pelo Dashboard de Criativos (ceo.omnx.pro)

> **Para:** Matheus Carvalho
> **Duração alvo:** 12 a 16 minutos
> **Atualizado em:** 2026-08-27 BRT
> **Documento complementar:** [`docs/guias/GUIA-DASHBOARD-CRIATIVOS.md`](guias/GUIA-DASHBOARD-CRIATIVOS.md) (versão PDF entregue junto com o vídeo)

---

## Antes de apertar o REC (checklist de 2 minutos)

- [ ] Logado em `https://ceo.omnx.pro/criativos` com um usuário que enxerga as 5 abas.
- [ ] Período do Ranking já posicionado em **30 dias** (tem dado bom pra mostrar).
- [ ] Fechar abas e notificações que apareçam na gravação.
- [ ] Ter na mão **1 criativo campeão** e **1 criativo ruim** pra usar de exemplo real.
- [ ] Gravar com áudio + tela cheia. Loom, OBS ou o Gravador do Windows resolvem.

---

## Bloco 0 — Abertura (30 a 45 segundos)

> "Fala Matheus! Esse é o tour do app de **Criativos** do dashboard. A ideia dele é uma só: **fazer criativo deixar de ser achismo e virar número**. Cada peça que a gente sobe tem um código, esse código aparece no nome do anúncio, e o sistema cruza o gasto do Meta com o que aconteceu dentro do CRM — lead, MQL, reunião e venda. No fim, você olha uma tabela e sabe qual criativo bota dinheiro no caixa e qual só queima verba.
>
> São 5 abas. Vou passar por todas, mas o resumo é: **Dashboard** é a saúde da produção, **Ranking** é o dinheiro, **Biblioteca** é o cadastro, **Kanban** é a esteira de produção e **Testes** é onde a gente decide se o criativo vive ou morre."

---

## Bloco 1 — Como o dado chega aqui (1 a 2 minutos) — NÃO PULE ESSE

> Mostre a tela do Ranking parada enquanto explica.

Pontos a falar:

1. Todo criativo tem um **código**: `CR-1234` (os que vêm do Notion) ou `AN-1234` (os cadastrados direto aqui no app).
2. Esse código **entra no nome do anúncio dentro do Meta**. É isso que amarra tudo.
3. Quando o lead chega pelo anúncio, o código vem grudado na UTM dele (`utm_term`) e é gravado no contato dentro do CRM.
4. O sistema então junta as duas pontas:
   - lado **Meta**: investimento, impressões, cliques, CTR, CPM, visualizações de vídeo;
   - lado **CRM**: leads, MQLs, reuniões, vendas e faturamento.
5. Frase de ouro pro vídeo: **"se o código não estiver no nome do anúncio, o criativo não aparece no ranking"**. Não é bug — é falta de nomenclatura.
6. O terceiro bloco do nome do anúncio (separado por `_`) é o **código do público**. É por isso que dá pra abrir cada criativo e ver o desempenho público a público.

---

## Bloco 2 — Aba Dashboard (2 minutos)

> "Essa é a aba que eu abriria numa reunião de segunda de manhã. Ela não fala de dinheiro — fala de **ritmo de produção**."

Mostrar e explicar, nessa ordem:

| Card | O que falar |
|---|---|
| **Validados / semana** | Quantos criativos foram efetivamente decididos e aprovados na semana, comparado com a meta semanal configurada. |
| **Lead time** | Média de dias entre criar o criativo e ter uma decisão sobre ele. Mede a esteira inteira. |
| **Cycle time** | Média de dias entre **iniciar o teste** e **decidir**. Mede só a fase de teste. |
| **Yield rate** | Taxa de aproveitamento: de tudo que foi decidido, quantos foram aprovados. |
| **WIP** | Trabalho em andamento — tudo que não foi escalado nem arquivado. WIP alto significa esteira entupida. |
| **Tempo até teste** | Quanto tempo o criativo fica pronto na prateleira antes de alguém subir ele. |

Depois:
- Mostrar o **gráfico de distribuição por status** — onde a produção está empilhando.
- Mostrar o **funil de produção** (ideia, roteiro, produzindo, revisão, ajustes, aprovado, pronto, em teste, testado, escalar).
- Mostrar os **alertas**: critérios não configurados, criativo pronto parado esperando teste, teste rodando sem lead.
- Mostrar o seletor de **dia da reunião semanal** — "aqui você escolhe o dia em que o time revisa criativo; o app usa isso pros alertas".

---

## Bloco 3 — Aba Ranking (4 a 5 minutos) — é o coração do vídeo

> "Aqui é onde o dinheiro aparece. Essa tabela responde: **qual criativo se paga?**"

Passo a passo na tela:

1. **Escolher o período** no topo (Hoje, Ontem, 7, 30, 90 dias, Este mês, Mês passado, ou datas manuais).
2. Explicar o **toggle Cohort × Produtividade** — a parte que mais confunde:
   - **Cohort**: "peguei os leads que chegaram nesse período e sigo eles pra frente, não importa quando fecharam". Serve pra avaliar **qualidade do criativo**.
   - **Produtividade**: "conto o que aconteceu dentro desse período — venda de ontem entra no mês de ontem, mesmo que o lead seja de 3 meses atrás". Serve pra bater com **caixa e financeiro**.
   - Frase pronta: *"Cohort julga o criativo. Produtividade julga o mês."*
3. Passar coluna a coluna, rápido, sem decorar (o PDF tem tudo):
   Investimento, Faturamento, Caixa, Leads, CPL, MQL, CPMQL, Reuniões, Vendas, CPV, CTR, CPM, Conv. Página e Video Hook.
4. Mostrar o botão **"Colunas"** — dá pra ligar/desligar e reordenar o que aparece.
5. Mostrar o botão **"Só com MQL"** — esconde criativo que não gerou lead qualificado.
6. **Clicar no cabeçalho** de uma coluna pra ordenar. Ordene por **CPV** ou **Caixa** e diga: "é assim que eu acho o campeão".
7. **Clicar no número** de Leads, MQLs, Reuniões ou Vendas abre a **lista nominal dos leads**. Falar: "não é número solto, dá pra ver quem é".
8. **Clicar na setinha** ao lado do criativo abre o **desempenho por público**. Falar: "às vezes o criativo não é ruim, o público é que está errado".
9. Se o criativo tiver link, **clicar no código** abre o anúncio no Instagram ou Facebook.
10. Avisar: **só aparece no ranking criativo que teve investimento no período**. Criativo parado some da lista — é de propósito.

---

## Bloco 4 — Aba Biblioteca (1 a 2 minutos)

> "Esse é o cadastro, o RG de cada criativo."

- Tabela com todos os criativos pagos, com busca por nome ou código.
- Filtros por status, formato, perfil e campanha.
- Botão **"Novo Criativo"** gera automaticamente o código `AN-XXXX`.
- Botão **"Editar"** abre nome, copy, hook, CTA, formato, campanha, links, pilar de conteúdo e etapa do funil.
- Botão de sincronizar com o Notion (pros criativos `CR-`).
- Dica pra falar: **"o campo que mais importa aqui é o código — é ele que precisa ir pro nome do anúncio no Meta."**

---

## Bloco 5 — Aba Kanban (1 a 2 minutos)

> "Essa é a esteira de produção, igual a um Trello."

- 12 colunas: Ideia, Roteiro, Produzindo, Revisão, Ajustes, Aprovado, Reprovado, Pronto, Em teste, Testado, Escalar e Arquivado.
- **Arrastar o card** muda o status no banco na hora.
- Filtro por origem (Notion, Nativo, Import) e busca por nome ou código.
- **Avisar honestamente:** hoje o arrastar-e-soltar **só funciona no computador**. No celular e no tablet não funciona — está na fila de correção.

---

## Bloco 6 — Aba Testes (2 a 3 minutos)

> "Aqui é onde o app deixa de ser relatório e vira decisão."

- A fila mostra criativos **prontos** e **em teste**.
- Botão **"Iniciar Teste"** marca o começo e passa a cronometrar.
- O sistema compara os números reais com os **critérios configurados** (CPL alvo, orçamento mínimo, gasto de corte antecipado) e sugere:
  - **APROVADO / ESCALAR** (verde) — CPL dentro do alvo;
  - **REPROVADO / MATAR** (vermelho) — CPL acima do alvo, ou gastou o orçamento mínimo sem gerar lead;
  - **AGUARDE** (amarelo) — ainda não gastou o suficiente pra ter conclusão.
- A decisão é **sempre humana**: você clica e escreve o motivo. Esse motivo vira histórico.
- Falar: *"a sugestão é o parecer da máquina; a assinatura é sua."*

---

## Bloco 7 — Fechamento: a rotina semanal (1 minuto)

> "Se você fizer só isso toda semana, já extrai 90% do valor:"

1. **Dashboard** — a esteira está andando? Tem alerta vermelho?
2. **Kanban** — puxar o que está travado, empurrar o que está pronto.
3. **Testes** — subir os prontos, decidir os que já têm número.
4. **Ranking (Cohort, 30 dias)** — quem escalar e quem cortar.
5. **Biblioteca** — cadastrar as peças novas da semana já com código.

Encerramento:

> "Mandei junto um PDF com tudo isso escrito, inclusive a conta de cada métrica. Qualquer dúvida me chama que eu abro a tela com você."

---

## Erros comuns pra citar no vídeo (dá muita credibilidade)

- **"Meu criativo não aparece no ranking"** — 90% das vezes é o código faltando no nome do anúncio no Meta, ou o criativo não teve investimento no período selecionado.
- **"O número aqui não bate com o do painel de Tráfego"** — confira se os dois estão no mesmo modo (Cohort × Produtividade) e no mesmo período.
- **"Vendeu mas não aparece como venda"** — venda só conta quando existe **pagamento de entrada** registrado. Contrato movido de etapa no CRM, sozinho, não é venda.
