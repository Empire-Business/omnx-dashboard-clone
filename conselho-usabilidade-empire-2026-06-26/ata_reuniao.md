# Ata do Conselho dos Mestres

**Tema:** Usabilidade, navegação e arquitetura de informação do dashboard Empire
**Data:** 26 de junho de 2026
**Presidente eleito:** Steve Jobs
**Membros presentes:** Alex Hormozi, Gary Vaynerchuk, Grant Cardone, Marcel Marcondes, Russell Brunson, Sandro San

---

## 1. Problema apresentado

O dashboard Empire acumulou problemas de usabilidade que vão além de botões mal posicionados. Os principais sintomas relatados foram:

- Configurações globais de apps, usuários e permissões estavam escondidas dentro de um app específico (`/settings`), dificultando o acesso e gerando confusão sobre o que é plataforma e o que é módulo.
- O seletor de apps apresentava falhas visuais, como dropdown saindo da viewport.
- A sidebar rolava junto com o conteúdo da página, perdendo referência de navegação.
- Botões de ação primários apareciam desproporcionais ou cortados.
- A operação sentia que o produto estava sendo desenhado pela estrutura do código, não pela jornada do usuário.

A meta do usuário: transformar o Empire de uma coleção de módulos em uma plataforma clara, onde quem opera ache o que precisa sem pensar e quem administre sinta que governa o território, não que procura chave dentro de gaveta.

---

## 2. Rodada 1 — Diagnóstico

### Alex Hormozi
A causa raiz é confundir o lugar de execução com o lugar de decisão. Configurar apps dentro de um app específico é como colocar o termostato da casa dentro de um só cômodo. A prioridade é separar o que é global do que é contextual: apps, usuários e permissões são globais e precisam de um ponto de entrada único e fixo, fora de qualquer módulo operacional. A regra deve ser: se afeta mais de um app, é global e sai da sidebar.

### Gary Vaynerchuk
O problema é empático, não técnico. O time construiu o dashboard pensando em onde o código guarda as coisas, não em onde a cabeça do usuário procura. A prioridade é colocar um hub de configurações no topo, fora da sidebar de módulos, e validar com usuários reais se acham o caminho em até três segundos.

### Grant Cardone
A causa raiz é medo de decidir quem manda no produto. Configuração de apps dentro de um app é como colocar o volante do carro no porta-malas: atrasa receita disfarçado de bug de interface. A prioridade é separar configuração global de execução operacional e colocar tudo em um espaço de admin claro, acessível por ícone fixo no topo.

### Marcel Marcondes
O problema é de governança projetada na tela. Existem decisões do indivíduo, do tenant e do contexto operacional — e o dashboard as confunde. A prioridade é criar uma camada acima do app para conta, usuários, apps, permissões e integrações, e deixar dentro de cada módulo apenas o que faz sentido naquele contexto.

### Russell Brunson
A causa raiz é ausência de hierarquia de contexto. O usuário não sabe se está no "quente" (operando) ou no "frio" (configurando). A prioridade é extrair o global para um nível acima do app, criando uma jornada clara: AppHub → app selecionado → ferramentas daquele contexto.

### Sandro San
O problema é construir uma ferramenta como se ainda estivesse vendendo feature. Configurar apps dentro de um app é guardar a chave mestra dentro de uma gaveta do quarto. A prioridade é criar uma camada de administração soberana, visível e separada, e estabelecer a regra de ouro: cada app cuida só do seu território.

---

## 3. Rodada 2 — Embates

### Alex Hormozi
Concordou com Sandro sobre separar terreno da casa, mas enfatizou que separar não basta: é preciso cronometrar segundos e cliques. Empatia sem decisão arquitetural é procrastinação. A solução é matemática: global sobe, contextual desce. Discordou de Russell sobre forçar metáfora de funil de vendas — aqui é sistema operacional, não checkout.

### Gary Vaynerchuk
Deu crédito a Hormozi pela velocidade, mas alertou que velocidade sem contexto é acelerar no escuro. Enfatizou que o lugar da decisão precisa respeitar o mapa mental do operador. Defendeu testes rápidos no WhatsApp da operação e iteração com quem usa de verdade.

### Grant Cardone
Manteve tom de urgência: governança sem velocidade de execução é burocracia com perfume de estratégia. Defendeu sidebar puramente operacional e admin no topo, fora do caminho do vendedor. Medir tempo perdido é essencial para justificar a mudança.

### Marcel Marcondes
Reforçou que governança precisa de métrica. Duas entrevistas sem hipótese clara trocam opinião de desenvolvedor por opinião de usuário. Defendeu teste controlado com objetivo, responsável e pass/fail. Escalar confusão só muda o endereço do problema.

### Russell Brunson
Defendeu hierarquia visual como redução de atrito cognitivo. Propôs o "Funil de Navegação Empire": topo = conta/admin, meio = AppHub/seletor, fundo = execução no app. Destacou a importância de redirecionamentos inteligentes para não quebrar o músculo de memória dos usuários.

### Sandro San
Discordou de Russell sobre funil em tela de configuração: aqui se governa, não se vende. Defendeu que admin global é o trono, apps são vassalos. Enfatizou que o produto precisa decidir se é ferramenta ou plataforma — e o Empire precisa parecer uma plataforma.

---

## 4. Rodada 3 — Réplicas e convergência

### Alex Hormozi
Aceitou a hierarquia visual de Russell, mas não negociou a arquitetura: se toca mais de um app, não mora dentro de nenhum app. Concordou em fazer a transição em duas fases: primeiro move o global para admin soberano com redirecionamentos, depois refina hierarquia visual e atalhos.

### Gary Vaynerchuk
Deu crédito a Sandro pela noção de território. Manteve a defesa da empatia real: gravar telas de cinco usuários reais e iterar. Cedeu na velocidade de implementação — prefere fazer simples e claro primeiro, depois polir com feedback.

### Grant Cardone
Deu crédito a Russell pelo funil de navegação, mas não abriu mão da regra soberana. Manteve a urgência, mas cedeu no prazo: aceitou cinco dias com teste real em três usuários e métrica de tempo/cliques, em vez de 48h.

### Marcel Marcondes
Reconheceu Hormozi (decisão vs. execução) e Russell (hierarquia visual). Manteve as três camadas de governança e a exigência de métrica. Aceitou rollout em fases desde que cada uma tenha objetivo claro, responsável e pass/fail.

### Russell Brunson
Reconheceu a soberania de Sandro e a métrica de Hormozi. Manteve a hierarquia visual como não negociável, mas cedeu na complexidade dos redirecionamentos inteligentes na primeira versão: básico impecável primeiro, otimização depois.

### Sandro San
Reconheceu Gary sobre o viés empático. Manteve a linha soberana como princípio absoluto. Cedeu no ritmo: não precisa redesenhar tudo em 48h, mas precisa entregar primeiro o portal de administração soberano e validar com três usuários reais.

---

## 5. Decisão do presidente

Steve Jobs decidiu:

> A configuração global deixa de existir dentro de qualquer app. Criamos uma camada de administração soberana no topo — acessível por um ícone de engrenagem fixo no header, independente de qual app ou módulo o usuário esteja. Apps, usuários e permissões de apps moram ali. Cada app cuida apenas do seu próprio território operacional. A sidebar continua operacional. O seletor de apps continua sendo o ponto de transição entre territórios. E, acima de tudo isso, fica a conta.

A implementação será em fases, não big bang. Primeiro, extraem-se as configurações globais do lugar errado e cria-se a nova entrada. Depois, polimos transições e redirecionamentos. Em cada fase, testamos com usuários reais. O Empire não é uma coleção de módulos. É uma plataforma. É hora de ele parecer uma.

---

## 6. Encaminhamentos

- Plano de ação detalhado: `plano_acao.md`
- Versão visual do plano: `index.html`
