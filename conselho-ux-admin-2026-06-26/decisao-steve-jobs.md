# Decisão do Presidente — Conselho de UX/Produto

**Tema:** Governança de administração e permissões do Empire Dashboard (sistema multi-app)
**Data:** 2026-06-26
**Presidente:** Steve Jobs
**Status:** APROVADO

---

## A decisão

Olha pra isso. Um administrador entra para dar acesso a uma pessoa e tem que escolher um *app* primeiro? Isso é loucura. O app não é a pessoa. **A coisa mais importante aqui é uma só: a unidade de governança é o ser humano, não o software.** Quando você quer dar poder a alguém, você pensa "o que o João pode fazer" — você não pensa "quem pode usar o app de Vendas". A máquina foi desenhada para a conveniência do banco de dados, não para a mente de quem usa. Isso acaba hoje.

Está **aprovado**: um portal de administração separado, com layout próprio, sem a sidebar de nenhum app, vivendo em `/workspace/*`. A tela inicial é **Pessoas** — o hub. Você clica numa pessoa e vê, de uma vez só, numa única matriz, todos os apps e todas as funções dela. Liga, desliga, pronto. A decisão de eixo — usuário-primeiro — não é fase 2 de nada, não é um "nice to have", é a fundação. Vem primeiro porque tudo se apoia nela.

Está **descartado**: o admin embutido dentro dos apps; a navegação app-primeiro; e qualquer debate sobre "quantas telas". Telas não importam. O que importa é **cliques-até-poder** — quantos cliques um admin gasta entre "quero dar acesso" e "o acesso está dado". Essa é a única régua. Meta: conceder acesso total a um usuário em **menos de 3 cliques**. Descartei também o vocabulário de "funil" do Brunson e o de "tela única" do Marcel — o primeiro confunde governança com conversão, o segundo otimiza a coisa errada. Ficamos com "estado de contexto" do Sandro e com a métrica de fricção do Marcel. Cada um cedeu no acessório e manteve o essencial. É assim que se decide.

E uma última coisa: ninguém escreve cinquenta telas antes de provar a fundação. **Um dia** de estrutura mínima — o modelo de permissão no banco e o esqueleto da tela Pessoas — antes de qualquer execução em massa. Cardone e Hormozi querem velocidade; velocidade sem fundação é só pressa. Construímos a base num dia e depois corremos. Aprovado.

---

## O que foi aprovado

1. **Portal de admin separado** — layout próprio (`WorkspaceLayout`), sem sidebar de app, em `/workspace/*`.
2. **Permissões user-first** — seleciona a pessoa → vê e edita todos os apps e funções de uma vez.
3. **Eixo usuário-primeiro é a fundação** — decisão binária, vem antes de tudo.
4. **Entidade central = USUÁRIO**, não o app.
5. **Métrica de aceite = cliques-até-poder** — alvo < 3 cliques para acesso total.
6. **Um dia de estrutura mínima** (banco + esqueleto) antes da execução massiva.

## O que foi descartado

- Admin embutido dentro dos apps com a sidebar deles.
- Navegação app-primeiro nas permissões.
- Debate sobre contagem de telas como métrica.
- Vocabulário de "funil" (Brunson) — substituído por "estado de contexto" (Sandro).
- "Uma tela só" (Marcel) — substituído por "cliques-até-poder".
