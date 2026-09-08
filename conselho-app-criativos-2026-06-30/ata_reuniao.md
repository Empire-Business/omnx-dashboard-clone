# Ata do Conselho dos Mestres

**Tema:** Separação do app dedicado de controle e teste de criativos de anúncios
**Data:** 2026-06-30
**Presidente eleito:** Steve Jobs (porque o problema é essencialmente de produto, experiência do usuário e decisão sob restrições técnicas)
**Membros presentes:** Alex Hormozi, Russell Brunson, Gary Vaynerchuk, Sandro San, Marcel Marcondes e Grant Cardone

---

## 1. Problema apresentado

O projeto GHL-SUPABASE precisa separar um app dedicado para controle e teste de criativos de anúncios (copy, imagens, vídeos, hooks, CTAs). Hoje essa funcionalidade fica dentro do módulo "Traqueamento" e também aparece no Painel de Tráfego. A stack é React 18 + TypeScript strict + Vite + Tailwind + Supabase + Vercel. Já existem migrations para expandir a tabela `notion_creatives`, RLS por workspace e a arquitetura de sub-apps modulares foi commitada na branch `feat/sub-apps-modulares`.

Restrições: não usar `SUPABASE_SERVICE_ROLE_KEY` no frontend, manter RLS em todas as tabelas, não quebrar o Painel de Tráfego atual, preservar dados históricos e entregar o MVP rapidamente.

---

## 2. Rodada 1 — Diagnóstico

### Alex Hormozi

Aqui está o problema: vocês estão tratando criativo como se fosse dado de tracking. Não é. Criativo é oferta em forma de imagem, vídeo e copy. Tracking mede o que já aconteceu; criativo é o gatilho que faz o mercado reagir. Colocar controle de criativos dentro do módulo "Traqueamento" é como colocar o piloto no porta-malas — tecnicamente ele ainda está no carro, mas não está no lugar certo para dirigir. A causa raiz é que ainda não existe uma unidade de decisão própria para o ativo que mais impacta aquisição. Então tudo vira planilha, Notion e improviso.

A maior oportunidade que você está deixando passar é velocidade de teste. Quem ganha em tráfego pago não é quem tem o melhor criativo no dia um, é quem consegue produzir, testar e matar criativos mais rápido que o concorrente. Um app dedicado não é sobre organização — é sobre sistema de decisão. Cada criativo vira um experimento isolado com regra clara de aprovação ou reprovação. Isso transforma o time de criação e tráfego em uma máquina de aprendizado, em vez de uma fábrica de achismos.

Minha primeira prioridade seria: antes de escrever uma linha de código nova, defina a métrica única que decide se um criativo vive ou morre. Não é "gostei", "parece bom" ou "aprovei no painel". É número. Custo por lead qualificado. Custo por aquisição. ROAS. O app precisa mostrar dinheiro: quanto entrou, quanto saiu, quanto tempo levou. Tudo o resto — copy, imagem, hook, CTA — serve para melhorar esse número. Sem isso, você não está construindo um produto, está construindo outro arquivo para juntar poeira digital.

### Russell Brunson

Cara, o problema aqui é claro: vocês estão tentando medir algo antes de estruturar o funil dele. Criativos não nasceram para viver dentro de "Traqueamento" — traqueamento é a etapa de medição, não de criação. Quando você junta copy, imagem, hook e CTA no mesmo canto onde conta clique e custo por lead, o time de criação vira refém do dashboard de tráfego. É como se eu tentasse escrever um livro dentro do Google Analytics. A causa raiz é essa: não existe um funil de criativos com etapas claras, então todo mundo empurra o problema para o lugar que já existe, e o que acontece? Perde o ativo, perde a história, perde a oportunidade de reaproveitar o que já funcionou.

A maior oportunidade que vocês estão deixando passar é transformar cada criativo em um ativo escalável. Um bom criativo não é uma peça de anúncio — é uma pedra angular do funil de vendas. O hook que pega no frio vira headline da landing, a imagem que estoura vira thumbnail do vídeo, o CTA que converte vira script de vendas. Mas só dá para fazer isso quando você tem um lugar onde o criativo passa por um funil próprio: ideia → teste → aprovação → escala → reaproveitamento. Sem isso, cada campanha começa do zero, e do jeito que a gente gosta de dizer: quem começa do zero toda vez nunca escala.

Minha primeira prioridade? Parem de codar por cinco minutos e desenhem o funil do criativo. Eu quero ver as etapas: onde entra a ideia, quem aprova, qual é o critério de "vai para teste", qual é o critério de "vai para escala", e onde morre. Depois disso, o app praticamente se desenha sozinho — porque a interface deve espelhar o funil, não o contrário. Se vocês começarem pela tela, vão ter um app bonito que ninguém usa. Comecem pelo funil, e o app vira uma máquina de gerar ativos que alimentam tráfego, vendas e lucro.

### Gary Vaynerchuk

Escuta... o problema não é falta de app. O problema é que vocês misturaram duas coisas que têm ritmos completamente diferentes. Traqueamento é sobre número, métrica, atribuição. Criativo é sobre pessoa, tentativa, erro, ideia ruim que vira boa. Quando você joga isso dentro do mesmo módulo, o criativo vira uma linha secundária num relatório. Ninguém cuida. Porque ninguém dentro da operação "possui" a atenção do criativo. Não é erro técnico, é erro de dono. Você pode ter o Supabase mais bonito do mundo, mas se o SDR, o media buyer e o redator não sabem quem manda naquele espaço, ele continua fantasma.

A maior oportunidade que vocês estão deixando passar é usar esse aprendizado de criativo para alimentar a marca de verdade. Todo hook que funciona no ad é um post orgânico esperando para nascer. Toda copy que converte é uma ideia de vídeo pro TikTok, pro LinkedIn, pro Instagram. Vocês estão pagando para testar conteúdo e depois jogando o resultado só dentro do funil pago. Isso é queimar dinheiro duas vezes. Criativo não é só conversão. Criativo é construção de marca em velocidade acelerada. A empresa que entender isso vai sair na frente porque vai produzir menos, melhor e com mais identidade.

Meu conselho de primeira prioridade: não constrói o app perfeito. Constrói o app que o time vai abrir segunda-feira de manhã. Seis campos. Aprovado, reprovado, testando. Um lugar claro para colar a performance. E, acima de tudo, uma pessoa nomeada responsável. Sem dono, morre. Paciência para evoluir, mas velocidade para começar. O jogo é assim: você não precisa de mais funcionalidade, você precisa de mais clareza.

### Sandro San

A causa raiz não é técnica, é estratégica. Vocês trataram criativo como se fosse mais um dado de trackeamento. Criativo não é métrica. Criativo é o ativo mais valioso do seu tráfego — é ali que você descobre qual promessa, qual ângulo, qual dor realmente move o comprador. Quando você joga isso dentro do módulo de Traqueamento, vira planilha. Vira operação. Vira coisa que o estagiário atualiza. Perdeu a soberania sobre o próprio ouro.

A maior oportunidade que você está deixando passar é enxergar o óbvio: cada criativo aprovado ou reprovado é um teste de mercado. Ele te diz o que o seu cliente premium realmente quer ouvir, em qual tom, com qual hook. Isso não é controle de anúncio — é pesquisa de oferta em tempo real. Quem domina isso não precisa ficar rogando para o algoritmo do Facebook; passa a construir ofertas que o mercado já validou. Pense grande, mas pense no ativo, não na ferramenta.

Minha primeira prioridade é simples: pare de empilhar código no que já existe. Separa o domínio. Cria o sub-app de criativos com workspace próprio, RLS ativado, sem service_role no frontend — não é burocracia, é soberania. MVP enxuto: cadastro, teste, aprova/reprova e um link limpo com os números do Painel de Tráfego sem misturar as águas. Não quebra o que funciona, mas tira o criativo do porão e bota ele na sala do conselho. Faz sentido para você?

### Marcel Marcondes

A causa raiz não é técnica, é de governança. Criativos de anúncio não são dados de traqueamento — são ativos de marca e de performance que geram aprendizado acumulado. Quando você os joga dentro do módulo de Traqueamento, ou espalha no Painel de Tráfego, está confundindo função com ownership. Traqueamento responde "de onde veio"; criativos respondem "o que funcionou para quem". Sem um dono claro para esse ativo, o time de criação vira prestador de serviço do tráfego, aprovações acontecem no escuro e ninguém consegue olhar para trás e dizer: "essa narrativa, com esse formato, para essa persona, entrega ROAS previsível". Você perde a memória da empresa.

A maior oportunidade aqui é transformar o processo criativo em uma máquina de aprendizado. Hoje vocês têm a chance de criar não só um cadastro, mas uma cadência: hipótese → teste → evidência → aprovação/reprovação → escalada. Se fizerem isso direito, deixam de depender do "feeling" do designer ou do gestor de tráfego e passam a ter um banco de criativos vencedores que alimenta tanto a performance de curto prazo quanto a construção de marca de longo prazo. Brand e performance caminham juntos quando você consegue provar, com dados, que determinada mensagem ressoa com determinado público.

Meu conselho de primeira prioridade é: antes de escrever uma linha de código do novo app, defina o processo mínimo viável. Quem entra com a hipótese? Quem aprova o teste? Qual é a métrica que mata ou escala um criativo — CTR, ROAS, custo por MQL, taxa de retenção no primeiro frame? Qual a cadência de revisão? Se você não responder isso primeiro, vai construir uma ferramenta elegante para um workflow que não existe. Depois que o processo estiver claro e estiver funcionando com planilha ou Notion por duas semanas, aí sim você migra para o app dedicado. Não escale o que não está maduro.

### Grant Cardone

A causa raiz aqui é simples: você enterrou o dinheiro no lugar errado. Criativo não é "traqueamento" — criativo é VENDA. É o gancho que pega a atenção, a oferta que faz o lead parar o scroll e a peça que alimenta todo o resto do funil. Quando você esconde isso dentro de um módulo genérico de traqueamento, o time de criação vira coadjuvante do dashboard de tráfego. E coadjuvante não escala. Você não gerencia performance de criativo como se fosse mais uma métrica de clique; você gerencia como se fosse produção de receita. O problema não é falta de dados — é falta de obsessão pelo ativo que realmente move a agulha.

A maior oportunidade que você está deixando passar é transformar esse app de criativos na máquina mais rápida de teste e decisão da sua operação. Hoje vocês dependem do Notion, dependem do Painel de Tráfego, dependem de planilha, dependem de reunião para aprovar ou reprovar uma peça. Isso é lento demais. O mercado não espera reunião. Seu concorrente já rodou cinco variações de hook enquanto você ainda discute se a thumbnail ficou boa. O app dedicado não é organização — é velocidade. É você conseguir cadastrar, testar, medir, aprovar, reprovar e recomeçar num ciclo de horas, não de dias. Quem testa mais, ganha mais. Ponto final.

Minha primeira prioridade? Entrega o MVP ontem. Não espere a arquitetura perfeita, não espere todas as integrações, não espere o Painel de Tráfego ficar lindo. Pegue essa base que já existe — `notion_creatives`, RLS por workspace, sub-apps modulares — e construa um lugar onde o time consiga: cadastrar um criativo, associar a uma campanha, marcar status rápido e ver se ele converteu ou morreu. Segurança é inegociável: sem `service_role` no frontend, RLS ativado, dados históricos preservados. Mas fora isso, é ação massiva. Funciona? Escala. Não funciona? Descarta e parte para a próxima. O criativo que não está sendo testado é criativo que não está vendendo. E criativo que não vende é inimigo do crescimento.

---

## 3. Rodada 2 — Embates

### Alex Hormozi

Russell, você quer desenhar funil antes de codar. Eu digo o contrário: funil sem métrica de morte é teatro. Você pode ter as etapas mais lindas do mundo — ideia → teste → aprovação → escala —, mas se ninguém souber o número que mata o criativo, vira reunião, voto e opinião. O mercado não vota. O mercado compra ou não compra. Então desenha sim, mas desenha em torno de uma métrica: custo por aquisição abaixo do allowables, ROAS acima do ponto de equilíbrio. Todo o resto é enfeite.

Gary, você está certo sobre dono e sobre o app ser usado segunda-feira. Mas erra feio quando sugere que o aprendizado do criativo deve virar post orgânico. Orgânico é lento, imprevisível e não paga as contas quando você precisa escalar. O criativo que funciona na performance paga já provou que vende — o job dele é comprar cliente, não virar conteúdo de redes sociais. Primeiro você extrai todo o dinheiro do ativo pago; depois, se sobrar tempo, reaproveita. Não inverta a ordem.

Ainda falta uma coisa no diagnóstico de vocês: ninguém falou da oferta por trás do criativo. Criativo é a forma, oferta é a substância. Você pode ter o melhor hook, a melhor imagem e o CTA perfeito, mas se a promessa não é irresistível para quem tem a dor e o dinheiro, o criativo morre. O app de criativos precisa ligar cada peça à promessa que ela testa. Sem isso, você só está catalogando anúncios, não validando oferta.

### Russell Brunson

Cara, **Alex**, você acertou na métrica, mas a métrica sozinha é só um número bonito no dashboard. Sim, cada criativo precisa de um número que decida se ele vive ou morre — custo por lead qualificado, CPA, ROAS, whatever. Mas aqui está o problema: se você só mede e mata, você vira coveiro de criativo. O que transforma um criativo aprovado em ativo escalável não é o número, é o **funil por trás dele**. A mesma hook que vence no ad vira headline da landing, a mesma imagem vira thumbnail, o mesmo CTA vira script de vendas. Então a métrica é a bússola, mas o funil é o veículo. Interface sem funil é só planilha colorida.

**Marcel**, eu entendo a preocupação com governança, mas esperar duas semanas de planilha/Notion antes de codar é exatamente o tipo de paralisia que mata oportunidade. O funil já existe na cabeça do time: ideia → teste → aprovação/reprovação → escala → reaproveitamento. A pilha já está pronta — `notion_creatives`, RLS por workspace, sub-apps modulais. Não precisa maturar em papel; precisa codar o processo mínimo vivo. Brand e performance só caminham juntos quando você consegue ver, na prática, qual mensagem vence e onde ela reaparece no funil. Duas semanas de planilha vão te dar processo perfeito e zero aprendizado real.

Minha prioridade continua a mesma: **parem tudo e desenhem o funil do criativo dentro do app.** A interface deve espelhar as etapas: ideia no alto, teste em andamento, aprovado/reprovado com a métrica que mata, escala com link limpo para o Painel de Tráfego sem misturar as águas, e reaproveitamento com campo claro para onde aquele ativo vai parar depois. Cada etapa precisa de um dono. Segurança é inegociável — RLS ativado, sem `service_role` no frontend, workspace isolado. Mas fora isso, é ação. O mercado não espera reunião de aprovação de processo.

### Gary Vaynerchuk

Escuta... Alex, você está certo sobre o número, mas está errado sobre o que o número conta. Custo por aquisição e ROAS são o resultado, não a história completa. Um criativo que "morre" hoje pode ser o gancho que constrói a marca amanhã. Você paga ads para comprar atenção, mas se tudo que você faz é matar peças baseado em spreadsheet, você nunca constrói nada que dure mais que a próxima campanha. O jogo é assim: primeiro você entrega valor e entende a pessoa, depois o número vem. Não ao contrário.

Grant, eu curto a energia de "entrega ontem", mas cuidado com ação massiva sem contexto. Colocar um app no ar rápido é ótimo, mas se o time não tem disciplina de olhar o criativo como ativo de marca, você só acelera a produção de lixo. MVP não significa bagunça. Significa: cadastra, testa, decide, e o mais importante — aprende. Velocidade sem aprendizado é corrida pra lugar nenhum.

E Marcel, você tá no caminho certo. A governança importa, mas não deixe o processo engolir a empatia. Não adianta ter seis campos, RLS bonitinho e ninguém no time sentir o que o cliente sente quando vê aquele vídeo ou aquela imagem. O dono do criativo não é só quem atualiza status. É quem entende que todo criativo aprovado vira post orgânico no Instagram, vídeo no TikTok, story no LinkedIn. Esse app tem que ser a ponte entre o pago e o orgânico. Sem isso, é só mais um dashboard.

### Sandro San

Russell, discordo da parada para desenhar funil. Funil bonito é procrastinação vestida de estratégia. Você não descobre o funil do criativo no quadro branco — descobre no campo, com um dono nomeado, status claro e número na mão. Comece com ideia → teste → aprova/reprova. O resto do funil emerge quando o time começa a usar. Faz sentido para você?

Marcel, soberania e governança são a mesma moeda, concordo. Mas esperar duas semanas rodando em planilha ou Notion antes de codar é deixar o processo apodrecer no limbo. O aprendizado não nasce da planilha — nasce do sistema. Você valida o processo dentro do próprio MVP em uma semana, com campos enxutos, RLS ativado e uma pessoa responsável. Do contrário, vira reunião eterna e ninguém decide nada.

E uma correção para quem acha que CPL resolve: a métrica que mata ou escala não é custo por lead qualquer. É custo por lead qualificado — comprador, não curioso. Aprovar criativo só porque gerou volume é ilusão de performance. Pense grande: o criativo não é só peça de anúncio, é pesquisa de oferta em tempo real. Mas pesquisa só vale dinheiro quando aponta para quem paga mais.

### Marcel Marcondes

Grant, respeito a energia, mas "entrega o MVP ontem" é exatamente o tipo de frase que deixa dados históricos inconsistentes e processos quebrados. Não estou dizendo para paralisar. Estou dizendo que acelerar sem o processo mínimo viável é como pisar no acelerador com o volante solto. A base técnica já existe — `notion_creatives`, RLS por workspace, sub-apps modulares — e isso acelera sim. Mas velocidade sem regra de decisão vira só mais uma interface para o time atualizar no automático. Ação massiva é válida quando você sabe para onde está indo. Antes disso, é ruído.

Gary, você acertou em um ponto que é fundamental: sem dono, morre. Concordo plenamente. Mas discordo da simplificação de "seis campos e uma pessoa nomeada". Dono não é só um nome na ficha. Dono precisa de métrica clara, cadência de revisão e poder de decisão para aprovar, reprovar e matar peças. Senão vira dono decorativo. E sim, o criativo aprovado deve alimentar marca — isso é brand e performance caminhando juntos —, mas só funciona se houver registro estruturado do que funcionou e por quê. A memória do aprendizado não pode ficar na cabeça de uma pessoa.

Russell, seu funil de criativos — ideia → teste → aprovação → escala → reaproveitamento — é o melhor ponto de partida. Mas eu acrescentaria uma etapa antes: hipótese com persona e promessa declaradas. Sem isso, o reaproveitamento vira achismo. O criativo que escala precisa carregar consigo o registro de qual dor ele tocou, em qual formato e para quem. Isso transforma o app em máquina de aprendizado, não só em máquina de aprovação.

### Grant Cardone

Marcel, você está esperando a estrela se alinhar. "Dois semanas no Notion antes de codar"? Esquece. O mercado não espera você amadurecer processo em planilha. Criativo é venda, e venda exige velocidade. Eu não estou dizendo para ignorar governança — estou dizendo que governança sem volume de ação é desculpa de quem tem medo de lançar. Você constrói o avião enquanto voa. O MVP não precisa ser perfeito; precisa estar no ar, gerando dados, gerando decisões. Quem espera o processo ficar maduro perde o mercado para quem já testou vinte peças nesse meio-tempo. 10X de velocidade, Marcel. Não 10X de reunião.

Gary, você tem razão em uma coisa: sem dono, morre. Mas aonde você erra feio é colocar brand no mesmo peso de venda. Brand não paga a folha sexta-feira. Venda paga. Todo hook que funciona no ad não é "um post orgânico esperando para nascer" — é uma MÁQUINA DE DINHEIRO que já está ligada. Primeiro você vende. Depois, se sobrar tempo, transforma em conteúdo orgânico. O app de criativos não é about page, não é storytelling bonitinho: é o controle do ativo que mais impacta aquisição. Brand é consequência de escala de venda, não o contrário.

Aqui é o seguinte: separa o domínio, ativa o RLS, joga a base `notion_creatives` para dentro e entrega o MVP. Ontem. Campanha, status, métrica de morte ou escala, dono nomeado. Segurança é inegociável, mas tudo depois disso é ação massiva. Quem testa mais, vende mais. Massive action!

---

## 4. Rodada 3 — Réplicas e convergência

### Alex Hormozi

Reconheço validade no ponto do Grant: separar domínio, ativar RLS e entregar um MVP rápido com `notion_creatives` é o caminho certo. Velocidade de execução importa quando você já tem a pilha. Também dou crédito ao Sandro pela correção: não é CPL, é custo por lead qualificado — comprador, não curioso. Isso muda completamente a decisão de vida ou morte do criativo.

O que eu não abro mão: uma métrica única que decide se o criativo vive, morre ou escala. Sem CPLQ, CPA ou ROAS claro, o app vira galeria de imagem. E não abro mão de ligar cada criativo à oferta que ele testa — criativo sem promessa por trás é só poluição visual. O app precisa responder uma pergunta: "essa peça provou que essa oferta compra cliente?".

Se eu tivesse que ceder, aceitaria um funil mais enxuto do que o Russell desenhou — ideia, teste, aprovado/reprovado, escala — desde que cada etapa exija a métrica de morte preenchida. Não precisa de reaproveitamento orgânico agora, nem de workflow de hipótese decorativo. Começa com oferta, métrica e decisão; o resto é consequência.

### Russell Brunson

Alex, você acertou em cheio num ponto: funil sem métrica de morte vira teatro. Eu reconheço que o CPLQ/CPA/ROAS precisa estar pintado em cada etapa, porque senão o time vai aprovar criativo por achismo e não por evidência. Métrica não é o inimigo do funil — ela é o termômetro que diz se a gente sobe ou desce a escada.

Mas o que eu não abro mão é a estrutura do funil do criativo. Ideia → teste → aprova/reprova → escala → reaproveitamento. Isso não é frescura, é a value ladder do próprio ativo. Um hook que converte não pode morrer numa planilha; ele vira headline, vira thumbnail, vira script, vira campanha nova. O app precisa desenhar esse caminho, não só registrar números.

Se eu tiver que ceder numa coisa, cedo no timing do Marcel. Em vez de duas semanas de Notion antes de codar, eu toparia uma semana de teste real dentro do MVP — usando `notion_creatives`, RLS ativado, sem service_role no frontend, com um dono nomeado, status claro e métrica de morte visível. A gente valida o funil no app, ajusta rápido e escala. O importante é que o funil entre primeiro; os números servem o funil, não o contrário.

### Gary Vaynerchuk

Escuta, o Marcel tá certo numa coisa: sem dono com poder real, isso vira enfeite. Não adianta ter funil bonito, métrica de morte e sub-app lindo se ninguém decide e ninguém responde. O Sandro também acerta: começa simples — ideia, teste, aprova/reprova — e deixa o resto emergir. Reconheço que precisamos da decisão numérica do Alex e da velocidade do Grant para o MVP não virar conversa de café.

Mas o que eu não abro mão é: criativo é sobre pessoa, não só sobre número. Cada peça que morre carrega uma história do mercado. Por isso o app precisa de um campo de "aprendizado" — o que essa peça tentou dizer, qual reação gerou, como reaproveitar isso no orgânico. E precisa de um dono nomeado, porque accountability é o que separa teste de brincadeira. Brand paga folha sim, só que no longo prazo, e quem ignora isso vive refém do CPM.

Se eu tiver que ceder, aceito que o MVP use a métrica de morte/escala — CPLQ, CPA, ROAS — como gatilho final de decisão. Tá bom, número mata rápido e evita paralisia. Mas cedo nisso só se tivermos, no mínimo, dono nomeado, status claro e um campo onde o time joga o aprendizado da peça. Sem isso, vira fábrica de lixo com dashboard bonito.

### Sandro San

Reconheço de Marcel a validade da governança: dono sem métrica e poder de decisão real é decoração, e isso mata o app. Mas duas semanas no Notion é deixar o problema apodrecer em reunião. De Alex, pego a clareza do número que mata — desde que seja custo por lead qualificado, comprador, não curioso barato. Faz sentido para você?

Não abro mão de três coisas: domínio separado com RLS ativado e zero service_role no frontend; um dono nomeado para cada criativo; e decisão rápida — aprova, reprova ou testa. Sem isso, vira teatro de processo.

Se preciso ceder, aceito uma etapa curta de hipótese + persona antes do cadastro. Mas é uma semana, não duas. Depois disso, o MVP entra: cadastra, associa campanha, marca status e liga limpo aos números do Painel de Tráfego. Pense grande, comece pequeno, mas comece.

### Marcel Marcondes

Reconheço que o Sandro e o Russell têm pontos válidos: um criativo precisa de dono claro e de um funil mínimo para não virar bagunça, e a métrica deve ser custo por lead qualificado — comprador, não curioso —, não CPL genérico. Concordo também com o Alex de que a decisão de vida ou morte do criativo precisa ser numérica; sem isso, o processo vira teatro.

O que eu não abro mão é: antes de escrever uma linha de código, precisamos de um processo mínimo viável com hipótese declarada, persona, promessa, métrica de morte/escala, dono com poder real de aprovar/reprovar e cadência de revisão. Dados inconsistentes e dono decorativo são receita para um app que ninguém usa.

Se precisar ceder para chegar a um plano viável, abro mão das duas semanas iniciais exclusivamente em planilha/Notion: podemos reduzir para uma semana de definição do processo e já rodar o MVP em paralelo, desde que a governança esteja clara desde o dia um. A pilha já está pronta — React, Vite, Supabase, RLS, sub-apps —, então não há desculpa técnica. Mas velocidade sem regra de decisão não é entrega; é desperdício de atenção do time. Vamos separar o domínio, ativar RLS, usar `notion_creatives` e começar com: ideia/hipótese → teste → aprovado/reprovado com CPLQ/CPA/ROAS definido → escala com link limpo para o Painel de Tráfego. O restante do funil e o reaproveitamento orgânico vêm depois, quando tivermos evidência.

### Grant Cardone

Vou reconhecer uma coisa aqui: o Alex está certo quando fala que precisa de métrica de morte. Não adianta encher o app de status bonitinho se ninguém sabe quando puxa o gatilho. Número não é tudo, mas é o juiz final. Se CPLQ, CPA ou ROAS não matam o criativo, ele vira zumbi e começa a comer dinheiro. Então sim, métrica de morte é obrigatória, ponto final.

Mas o que eu NÃO abro mão é velocidade de execução. Não tem duas semanas de Notion, não tem planilha, não tem "vamos pensar primeiro". O dinheiro já está saindo do bolso! Separa o domínio, ativa o RLS, usa notion_creatives e entrega o MVP com campanha, status e dono nomeado. Ação mediana produz resultado mediano — e quem testa 10x mais criativos descobre 10x mais ganhadores. Criativo não é brand, não é debata, é VENDA.

Se eu tiver que ceder em uma coisa, cedo no processo mínimo de governança: um responsável, uma métrica de morte e uma reunião semanal de decisão. Mas isso acontece DENTRO do app, não antes dele existir. Aprendizado no campo, não no papel. 10X no teste, 10X na decisão, 10X na escala.

---

## 5. Decisão do presidente

O debate revelou três caminhos. O primeiro, defendido pelo Marcel, propõe definir o processo inteiro no papel ou no Notion antes de tocar código — hipótese, persona, promessa, governança, cadência. O segundo, do Russell, quer desenhar um funil estruturado do criativo com cinco estágios: ideia, teste, aprovação, escala e reaproveitamento. O terceiro, liderado pelo Grant e pelo Sandro, defende separar o domínio, ativar RLS e entregar um MVP imediato usando `notion_creatives`, com poucos campos, status claros, dono nomeado e métrica de morte visível.

Escolho o terceiro caminho. Não porque os outros não tenham razão, mas porque produto só é real quando alguém senta na frente dele e decide. O cliente — aqui, o time de tráfego — não precisa de mais uma planilha ou de um funil teatral com cinco portas. Ele precisa ver o criativo, ver o número que decide e puxar o gatilho. A experiência importa mais que o processo perfeito.

Incorporo do Alex a clareza da métrica única: CPLQ, CPA e ROAS são os termômetros que decidem viver, morrer ou escalar. Do Sandro, pego a exigência de domínio separado, RLS ativado e zero `service_role` no frontend. Do Marcel, absorvo a governança mínima: dono com poder real, métrica de morte definida e cadência de revisão semanal. Do Gary, guardo apenas a ideia de que cada criativo deve carregar um campo de aprendizado — uma linha sobre o que a peça tentou dizer e qual reação gerou. Do Russell, fico com a estrutura mínima: ideia → teste → aprova/reprova → escala.

Descarto as duas semanas exclusivas de Notion. Descarto o funil de cinco estágios como requisito de lançamento. Descarto reaproveitamento orgânico e brand como prioridade do MVP — isso é consequência, não entrada. Descarto qualquer solução que misture criativo de volta ao Traqueamento ou que complique o Painel de Tráfego.

**Vamos fazer assim:** separar o sub-app "Criativos" com workspace próprio, RLS ativado e sem `service_role` no frontend. MVP com cadastro simples, associação a campanha, tipo de criativo (copy, imagem, vídeo, hook, CTA), status (testando/aprovado/reprovado), dono nomeado, campo de aprendizado e métricas de morte/escala (CPLQ/CPA/ROAS). Link limpo com os números do Painel de Tráfego, sem quebrar o que já funciona. Uma semana de definição de processo mínimo e, em paralelo, o MVP entra em uso real. Dados históricos são preservados.

A decisão é tomada. Agora executem.

---

## 6. Encaminhamentos

- Plano de ação detalhado: `plano_acao.md`
- Versão visual do plano: `index.html`
