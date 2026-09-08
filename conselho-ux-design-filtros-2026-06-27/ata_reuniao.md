# ATA DA REUNIÃO DO CONSELHO
## Sessão Extraordinária — UX/Design, Filtros Meta, Filtros Ativos e Limpeza de Leads

---

**Data:** 27 de junho de 2026
**Tema:** UX/Design, Filtros Meta, Filtros Ativos e Limpeza de Leads
**Presidente:** Steve Jobs
**Membros presentes:** Alex Hormozi, Russell Brunson, Gary Vaynerchuk, Sandro San, Marcel Marcondes, Grant Cardone
**Quórum:** Completo (6/6 membros)

---

## 1. Resumo do Problema

O produto Empire Dashboard enfrenta quatro sintomas interligados que, em conjunto, revelam uma causa raiz única: o sistema foi construído para funcionar, não para ser usado. O design atual transmite amadorismo não por ausência de efeitos visuais, mas por falta de hierarquia de informação — a tela não diz ao olho do usuário onde olhar primeiro, o que paralisa a tomada de decisão do gestor que abre o painel às 8h da manhã com uma pergunta objetiva na cabeça e não encontra a resposta em menos de três segundos.

O segundo problema compromete diretamente a proposta de valor do produto: o filtro de campanhas Meta Ads não está funcionando de ponta a ponta. O gestor de marketing que tenta cruzar performance de campanha com resultado de leads no CRM recebe dados incompletos — ou nenhum dado — sem nenhum aviso de que algo está errado. Isso não é apenas um bug técnico; é uma ruptura de confiança operacional que força o usuário a abrir o Meta Ads Manager em outra aba para fazer o trabalho que o dashboard deveria fazer por ele. Quando o usuário cria um processo paralelo, o produto começa a morrer na rotina de quem deveria depender dele.

Os dois problemas complementares — filtros exibindo dezenas de itens sem dado no período selecionado, e um botão de limpeza de leads que executava silenciosamente sem feedback, confirmação ou log — completam o quadro. O primeiro transfere para o usuário o trabalho de encontrar informação relevante no meio do ruído, o que é o oposto de uma ferramenta de decisão. O segundo revelou ausência total de governança sobre operações destrutivas: botão que falha em silêncio treina o usuário a duvidar de tudo que o produto exibe, incluindo as métricas nas quais ele deveria confiar cegamente. Nenhum desses problemas é acidental — são consequências de um produto que cresceu por inércia, sem um ponto de vista claro sobre quem ele serve e qual pergunta ele responde.

---

## 2. Rodada 1 — Diagnóstico Individual dos Membros

### Alex Hormozi

**Design amador** é problema de clareza de propósito, não de ferramenta. Glassmorphism, gradientes e sombras são fantasia. O usuário que acessa o painel às 22h de uma terça-feira não quer arte — quer saber onde estão caindo os leads e por quê. Hierarquia visual não é estética, é matemática de atenção. Resolve-se com regra, não com efeito: identificar a informação mais importante da tela e fazer tudo o que não é essa informação desaparecer.

**O filtro de campanhas Meta** não é bug técnico — é a proposta de valor falhando em tempo real. Quando o gestor clica no filtro e nada acontece, ele para de usar o filtro. Quando para de usar o filtro, para de confiar nos dados. Quando para de confiar nos dados, volta para a planilha. O produto deixa de existir na cabeça dele mesmo que continue rodando no servidor.

**Filtros com itens inativos** revelam que o produto foi construído para quem o fez, não para quem usa. Toda opção sem dado no período selecionado é uma mentira implícita. Filtrar dinamicamente baseado no período ativo é uma hora de trabalho. A razão para não ter sido feita ainda é priorização, não complexidade.

**O bug de exclusão de leads** revelou ausência de cultura de teste em produção. O botão não funcionava e ninguém percebeu — o que indica que ninguém testou os fluxos destrutivos após o lançamento. A política de DELETE faltando foi o sintoma; a causa raiz é ausência de dogfooding sistemático da própria equipe.

---

### Russell Brunson

**O glassmorphism** não é solução — é sintoma do problema real. Quem o adiciona está tentando pintar a fachada de uma casa sem fundação. A causa raiz do design amador é falta de hierarquia de informação: o usuário abre o dashboard e os olhos não sabem para onde ir. Tudo tem o mesmo peso. Design profissional não é sobre efeito, é sobre sequência. Framework proposto: toda tela precisa de um herói visual claro, dois ou três elementos de suporte e um call-to-action óbvio.

**O filtro de campanhas Meta** quebrado é muito mais grave do que parece porque o único motivo pelo qual um gestor de marketing abre um analytics é para decidir onde colocar o próximo real de investimento. Bug técnico vira bug estratégico: o gestor toma decisões erradas por meses sem saber, como aconteceu na ClickFunnels quando os relatórios de tráfego excluíam parte do Facebook Ads por UTM incorreto. O cruzamento no backend não é opcional — é obrigatório.

**Filtros com 50 itens sendo que 47 não têm dado relevante no período** revelam confusão filosófica sobre para quem o produto existe. O dashboard não é catálogo do que já aconteceu; é ferramenta de decisão sobre o que está acontecendo agora. Filtrar por período e exibir apenas itens com dados reais deveria ser o comportamento padrão.

**O bug de limpeza de leads** é uma radiografia da maturidade do sistema. Produto maduro tem três camadas: o que o sistema faz, o que o usuário vê que o sistema fez, e o que fica registrado para auditoria. Aqui parece que apenas a primeira camada foi construída.

---

### Gary Vaynerchuk

**A causa raiz do design amador** é que o produto foi construído para funcionar, não para ser sentido. Quando o dev também é o designer, o resultado é funcional e sem alma — porque o cérebro que resolve lógica de cohort não é o mesmo que pensa em hierarquia de atenção e estado emocional do usuário. Ninguém ainda perguntou: "o que o gestor sente quando abre esse painel às 8h antes de uma reunião com o CEO?"

**O filtro de campanhas Meta** não funcionando revela uma falha de arquitetura mental: dois mundos de dados que não conversam. O gestor abre o Meta Ads Manager numa aba ao lado e ignora o dashboard. Quando o usuário cria um workaround, a batalha está perdida. O produto SaaS precisa ser a fonte de verdade.

**Filtros com itens inativos** revelam que o produto não tem opinião. O filtro deveria filtrar o filtro. Você tem os dados de performance por período — basta cruzar. Uma tarde de trabalho. O que falta não é complexidade técnica; é decisão do CEO de que isso é prioridade antes de qualquer nova feature.

**O bug de limpeza de leads silencioso** revela ausência de cultura de auditoria. Toda operação destrutiva precisa ter: confirmação humana, registro de quem fez e quando, e possibilidade de rastrear depois. Não porque a lei manda — porque o produto vai escalar e não haverá como explicar individualmente o que aconteceu com os dados de cada usuário.

---

### Sandro San

**O design amador** não é problema de componente — é problema de convicção. Quando um produto não tem ponto de vista sobre quem ele serve, vira painel genérico cheio de features que ninguém pediu. A causa raiz é simples e dura: ninguém sentou com o usuário e perguntou "qual é a primeira coisa que você precisa saber quando chega de manhã?" — e construiu o produto a partir daí. Sem essa âncora, acumulam-se telas, não produto.

**O filtro de campanha Meta** não funcionar é grave porque revela que o produto foi construído em dois mundos que nunca conversaram. A pergunta mais importante do gestor de tráfego — "esse investimento está gerando resultado real, não só clique?" — fica sem resposta. Produto de analytics que não responde à pergunta central do seu usuário vai ser abandonado assim que aparecer um concorrente que a responda.

**Filtros com itens inativos** comunicam uma mensagem implícita devastadora: "você que se vire." Quando o gestor vê 50 campanhas e 47 têm zero resultado no período, o produto está tratando-o como operador de banco de dados, não como tomador de decisão. Filtro inteligente é respeito pelo tempo de quem usa — não feature avançada, básico de produto que se importa.

**O bug da limpeza de leads** indica que o produto cresceu sem governança. Toda operação destrutiva precisa de três camadas antes de existir: confirmação humana visível, registro de quem fez e quando, feedback claro do resultado. Silêncio nunca é resposta. Produto que falha em silêncio treina o usuário a duvidar de tudo — inclusive das métricas.

---

### Marcel Marcondes

Os quatro problemas não são quatro questões independentes — são quatro sintomas de uma causa raiz só: o produto cresceu por inércia, não por design intencional.

**O design amador** decorre de o produto ter sido construído de dentro para fora — o dev conhece os dados e empilhou informação sem questionar a jornada do usuário. Hierarquia visual é consequência de hierarquia de decisão. Se não se sabe o que o usuário precisa decidir primeiro, tudo fica na mesma altura visual. A pergunta que precisa ser respondida antes de qualquer pixel: qual é a ação mais importante que o usuário faz nesta tela?

**O filtro de campanhas Meta** é dívida estratégica. A integração principal de tráfego pago não está funcionando de ponta a ponta. Não é dívida técnica — é dívida de produto. Se esse produto fosse para um cliente externo hoje, essa falha seria o primeiro motivo de churn.

**Filtros com itens inativos** comunicam que o produto foi projetado por quem o construiu. O sistema tem os dados do período, sabe quais campanhas têm investimento e resultado. A curadoria deveria ser automática. Mostrar tudo é decisão preguiçosa disfarçada de flexibilidade.

**O bug de limpeza de leads** revela ausência de protocolo de operações destrutivas. Produto maduro tem confirmação explícita, log de auditoria e reversibilidade. A pergunta real: quantas outras operações críticas no produto têm o mesmo nível de governança zero?

---

### Grant Cardone

**Design amador** é falta de intenção — não de glassmorphism, não de sombra, não de animação. Design amador é feito por alguém que não decidiu o que quer que o usuário sinta ao abrir o produto. Hierarquia visual existe para dizer ao olho: "olha aqui primeiro, depois aqui." Os melhores produtos do mundo têm menos, não mais. Espaço em branco é confiança. Bagunça é medo. Esse produto provavelmente tem 12 KPIs na tela quando deveria ter 3 na frente e 9 escondidos atrás de um clique.

**O filtro Meta** é grave porque concentra os dados mais valiosos que um gestor de marketing tem e entrega uma experiência quebrada exatamente no momento em que ele mais precisa de resposta. O CEO que olha o painel e o filtro não responde não pensa "que pena, problema técnico." Ele pensa "esse produto não funciona." Você tem segundos para convencer alguém de que sua ferramenta vale o tempo dela.

**Filtros cheios de itens inativos** revelam que o produto não tem opinião sobre o que é crítico. Isso não é software — é arquivo Excel mal formatado com interface por cima. Filtro inteligente não é feature; é respeito pelo tempo do usuário. E tempo é a única coisa que ninguém pode comprar de volta.

**O bug de limpeza silenciosa** é o problema mais sério: o produto não tem opinião sobre o que é crítico. Significa que ninguém parou e perguntou "o que acontece se der errado aqui?" Operação destrutiva sem confirmação, sem log, sem rollback, em produto com dados reais, é roleta-russa. Ação concreta imediata: listar toda operação destrutiva, colocar confirmação em texto explícito e log no Slack ou email do admin — quatro horas de trabalho.

---

## 3. Rodada 2 — Embates

### Alex Hormozi responde ao grupo

**A Russell:** o diagnóstico está certo, o remédio está errado. O framework "herói, suporte, call-to-action" funciona para landing page de oferta. Dashboard operacional é diferente — o gestor não abre o painel para ser convencido de nada. Ele abre para tomar uma decisão específica em menos de 60 segundos. A pergunta certa não é "onde está o herói visual?" mas sim "qual é a decisão mais frequente que esse usuário toma, e o dado que responde essa decisão está a zero cliques da abertura?"

**A Gary:** focar em "o que o gestor sente às 8h" vende experiência antes de ter utilidade. A sequência correta é: primeiro fecha o loop de dados Meta+CRM cruzados no backend, segundo remove o ruído dos filtros, terceiro refina a hierarquia visual. Inverter essa ordem resulta em painel bonito com dados errados — que é pior que feio com dados certos, porque o usuário toma decisão errada com confiança.

**Sobre os deletes silenciosos:** um nível anterior ao que todos mencionaram foi ignorado — por que existe um botão de deletar leads de teste em produção? Se o ambiente é misto (dados reais + dados de teste), nenhuma policy de RLS resolve completamente. O fix correto de longo prazo é separar contexto. O botão de delete revelou o sintoma; a causa é que não existe separação de ambiente.

**Sobre os filtros com itens inativos:** a solução técnica é simples — filtrar dinamicamente pelo período, mostrar apenas campanhas com pelo menos um evento. Mas o design da lógica importa: "sem dado no período" não é o mesmo que "campanha inativa". Uma campanha pausada há seis meses pode ter dado histórico relevante se o usuário está auditando aquele período. Filtro inteligente respeita o contexto temporal, não infere inatividade permanente.

---

### Russell Brunson responde ao grupo

**A Alex:** a causa do design amador não é falta de regra — é falta de funil dentro do próprio produto. Qual é o hook? O que o produto grita para o olho do gestor dizendo "você está no lugar certo, aqui está sua resposta"? Sem esse hook, o restante da tela é objeção não tratada.

**A Gary:** a percepção de "produto sem ponto de vista" é precisa, especialmente aplicada ao filtro Meta e aos itens inativos — que são na verdade o mesmo problema com duas faces. O produto foi construído com dois value ladders separados que nunca convergiram: CRM de um lado, performance de tráfego pago do outro. O filtro que exibe 50 itens inativos é como página de vendas que mostra depoimentos irrelevantes para o avatar. Você não qualifica — transfere o trabalho de qualificação para o usuário. E usuário que trabalha demais em produto que deveria facilitar a vida vai embora.

**Sobre o bug de delete:** todos trataram como problema de cultura e governança, mas é problema de funil interno. Operação destrutiva sem confirmação é como botão de "comprar" sem página de checkout. Quando se adiciona "Tem certeza? Essa ação não pode ser desfeita" com botão vermelho, não se protege apenas os dados — cria-se um ritual de intenção. O usuário para, pensa, confirma. UX que educa comportamento. Primeiro desenha-se o fluxo intencional, depois aplica-se a política técnica.

---

### Gary Vaynerchuk responde ao grupo

**A Alex:** enquadrar o bug de exclusão como problema de "dogfooding" é intelectualmente desonesto. Dogfooding pressupõe que a equipe tem tempo para usar o produto livremente. Equipe pequena com um dev não tem esse luxo. O problema real não é que ninguém testou — é que o produto cresceu sem definir quais operações são de alto risco e precisam de proteção adicional antes de existir. Isso é arquitetura de produto, e arquitetura é decisão do dono.

**A Russell:** a observação sobre credibilidade percebida é o ponto que ninguém havia articulado. O gestor de marketing olha Meta Ads Manager, Google Analytics e dashboards do Shopify todos os dias — ele tem referência visual alta. Quando abre um produto interno que parece inferior ao que usa gratuitamente, inconscientemente desqualifica o dado. Não dá para separar design de confiança nesse contexto.

**Sobre os filtros inativos:** o que está faltando não é complexidade técnica — é decisão do CEO de que isso é prioridade 1 antes de qualquer nova feature. Uma query com JOIN e GROUP BY. Uma tarde de trabalho.

**A conclusão:** os quatro problemas são um problema só — o produto foi construído para funcionar, não para ser usado. Funcionar é responsabilidade do dev. Ser usado é responsabilidade do dono do produto. A pergunta central é: qual das quatro coisas, resolvida sozinha esta semana, muda como o usuário sente o produto? Resposta: o filtro Meta. Dado incompleto mata confiança. Confiança morta não volta com glassmorphism.

---

### Sandro San responde ao grupo

**A Hormozi:** acertou na causa do design, mas parou antes do passo seguinte. Não é só "o que tirar da tela" — é "quem usa isso, para decidir o quê, com qual frequência." Antes de mexer em pixel, o dev precisa sentar com o usuário por 30 minutos e mapear as três perguntas que ele faz toda manhã. O design resolve sozinho depois disso.

**A Russell e Marcel:** convergência certa sobre o filtro Meta, mas ambos pararam na metade. Qual é o identificador de ligação entre a campanha da Meta e o lead no CRM? Se o `utm_campaign` não chega limpo nos dois lados, qualquer cruzamento vai produzir dados que parecem certos mas não são. Antes de codificar o cruzamento, é obrigatório mapear se esse identificador chega íntegro em ambos os sistemas. Dado errado exibido com confiança é mais perigoso do que ausência de dado.

**Sobre filtros com itens inativos:** a decisão de exibir 50 opções quando só 3 são relevantes não é técnica — nunca foi tomada. E não foi tomada porque ninguém perguntou: o que custa ao usuário não achar o que precisa em 5 segundos? Em produto de alto valor, a resposta é perda de confiança. E produto sem confiança, independentemente de quanto custa, vira linha de custo que o CFO corta na próxima reunião.

**Sobre o bug de delete:** Grant usou o tom catastrófico mas não apontou o que fazer. O princípio é simples: operação destrutiva precisa de três camadas antes de existir — confirmação humana visível, registro de quem fez e quando, feedback claro do resultado. Silêncio nunca é resposta.

---

### Marcel Marcondes responde ao grupo

**A Hormozi:** o diagnóstico de "clareza de propósito" está certo, mas o remédio implícito de "tire tudo e mostre só o número" é limitado. Esse gestor tem três perguntas simultâneas: onde estão os leads hoje, qual campanha está performando, e o que o SDR está fazendo com o que chegou. São três contextos legítimos numa mesma ferramenta. O que falta não é eliminar — é sequenciar. Qual é a pergunta que o usuário traz quando abre essa tela específica? A resposta muda por módulo.

**A Gary:** o risco estratégico vai além do que foi dito. Quando o filtro de campanhas Meta não funciona, o gestor não abandona o filtro — ele cria processo paralelo. Em seis meses a equipe usa o dashboard para ver SDR e o Meta Ads Manager para ver campanha, e alguém pergunta "para que serve esse dashboard mesmo?" Isso é risco real de tornar o produto redundante. A solução de cruzar no backend é correta e inegociável. Mas antes disso: definir o identificador único que conecta campanha Meta ao lead no CRM — `utm_campaign`, `ad_id`, ou outro campo — e tratar essa regra de match como ativo de governança com versionamento e documentação.

**Sobre os filtros com itens inativos:** a solução mais honesta com o usuário é dois estados distintos — itens ativos no período com contagem visível, itens sem dado colapsados com opção de expandir. Isso preserva a possibilidade de o usuário buscar campanha específica que sabe que existiu, sem poluir o dropdown padrão. Diferença entre esconder e hierarquizar.

**Sobre o bug de delete:** o risco real não é catástrofe — é erosão de confiança gradual. Operação que falha silenciosamente ensina o usuário a não confiar no feedback do sistema inteiro. A solução não é só confirmação e log — é padrão sistêmico de feedback para toda operação de escrita: estado intermediário visível, confirmação de sucesso explícita, erro legível se falhar.

---

### Grant Cardone responde ao grupo

**A Hormozi:** "matemática de atenção" sem urgência de fechamento é academia. O gestor não quer entender onde os leads caem — quer saber se tem meta para bater essa semana. A hierarquia visual que o produto precisa não é sobre limpar a tela; é sobre colocar o número mais importante — custo por lead qualificado, reuniões agendadas, taxa de fechamento — em tamanho 10X maior que o resto.

**A Russell:** quando o usuário abre outra aba, não se perdeu a batalha de UX — perdeu-se a oportunidade de ser a ferramenta que fecha venda. Gestor de marketing que vai no Meta Ads Manager separado usa o produto para fazer relatório e a Meta para trabalhar de verdade. Produto que serve só para relatório vai ser substituído por planilha assim que alguém tiver tempo. A integração Meta-CRM cruzada no backend não é feature — é a razão de existir do produto.

**A Marcel:** o problema com os filtros inativos não é só de produto — é de obsessão. Equipe obcecada com o usuário percebe isso em dois dias de uso. O problema não é apenas o filtro cheio de lixo — é que ninguém ficou dentro do produto tempo suficiente para sentir a dor. Use o produto todo dia. Use para tomar decisão real. O dropdown que dá trabalho aparece em 30 segundos.

**Sobre o bug de delete:** todo mundo diagnosticou certo, mas ninguém disse o que fazer amanhã de manhã. A ação: listar toda operação destrutiva do produto hoje, colocar confirmação em texto explícito e log no Slack ou email do admin toda vez que acontecer. Quatro horas de trabalho. Ação massiva agora vale mais que arquitetura perfeita em três meses.

---

## 4. Rodada 3 — Convergência

### Alex Hormozi — réplica e convergência

**Reconhecimento válido:** Sandro San acertou o ponto que havia sido pulado — qual é o identificador que liga campanha da Meta ao lead no CRM? Se o `utm_campaign` não chega limpo nos dois lados, qualquer cruzamento técnico produzirá uma mentira com visual de verdade. Dado errado exibido com confiança é mais destrutivo que dado ausente. O ponto é válido e não havia sido levantado.

**Posição inabalável:** sequência de prioridade. O cruzamento Meta+CRM no backend com `utm_campaign` como identificador confiável é o único ponto que, resolvido, aumenta o valor percebido do produto inteiro. Design, filtros inativos e operações destrutivas são qualidade de execução — importantes, mas não são o que faz o produto existir na cabeça do gestor.

**Concessão a Marcel:** a proposta de dois estados de filtro — itens ativos visíveis, itens sem dado colapsados mas acessíveis — é mais honesta que "esconder tudo sem dado." Preserva a saída de emergência para quem precisa buscar campanha de período histórico. Aceito.

**Plano resultante:**
1. Garantir `utm_campaign` limpo nos dois lados antes de codificar qualquer cruzamento
2. Cruzamento Meta+CRM no backend com regra de match documentada como ativo de governança
3. Filtros com dois estados conforme proposta de Marcel
4. Confirmação visível + log em toda operação destrutiva
5. Hierarquia visual resolvida por pergunta — qual decisão o usuário toma primeiro aqui? — não por efeito
Nessa ordem. Sem pular etapa.

---

### Russell Brunson — réplica e convergência

**Reconhecimento válido:** Alex acertou sobre separação de ambiente — o botão de delete revelou que dados de teste e dados reais vivem no mesmo espaço, e nenhuma policy de DELETE resolve isso completamente. Gary também acertou: não é culpa do dev, é decisão de arquitetura, e arquitetura é responsabilidade do dono. As duas coisas precisam existir simultaneamente: separação de contexto no backend e camada de UX com confirmação, feedback e log.

**Posição inabalável:** o filtro Meta cruzado no backend deve ser tratado como núcleo da proposta de valor, não como feature de sprint. É a resposta para a pergunta que o usuário faz toda vez que abre o produto: "meu investimento está virando resultado?" Sem isso, o produto não é analytics — é relatório bonito. E relatório ninguém paga SaaS para ter.

**Concessão sobre timing do design:** Sandro e Marcel estão certos — não se descobre a hierarquia certa sem sentar com o usuário por 30 minutos e mapear as três perguntas que ele faz toda manhã. Isso deve vir primeiro.

**Plano resultante:**
- Semana 1: conversa com o usuário e mapeamento das perguntas que movem o negócio
- Semana 2: cruzamento Meta+CRM no backend com identificador correto
- Semana 3: filtros dinâmicos por período
- Somente então: design com fundação real

---

### Gary Vaynerchuk — réplica e convergência

**Reconhecimento válido:** Marcel foi preciso sobre o identificador de ligação — antes de cruzar dados no backend, é necessário validar se o `utm_campaign` da Meta chega idêntico ao que o CRM registra. Um espaço extra, truncamento ou diferença de capitalização e o JOIN retorna zero. Todos acharão que a integração está quebrada quando na verdade é problema de string. A regra de match é ativo de governança, não detalhe.

**Posição inabalável:** filtro Meta cruzado no backend vem primeiro, antes de qualquer refinamento visual. Segundo: filtro de itens inativos, porque é uma tarde de trabalho que multiplica a confiança de forma desproporcional. Terceiro: padrão de feedback em operações destrutivas. Design visual vem por último.

**Concessão:** Hormozi e Russell estão certos que é preciso saber qual pergunta cada tela responde antes de mexer em qualquer pixel. A etapa mais simples e brutal: sentar 30 minutos com quem usa o produto e perguntar "qual é a primeira coisa que você quer saber quando abre isso?" Sem essa resposta, qualquer esforço de design é decoração sobre estrutura não resolvida.

**Plano resultante:** dado certo primeiro, estrutura de decisão segundo, experiência visual terceiro. Nessa ordem. Sem pular.

---

### Sandro San — réplica e convergência

**Reconhecimento válido:** Marcel acertou que filtro inteligente não é só "sumir com o que tem zero dado" — é hierarquizar com saída de emergência. Mostrar itens ativos com contagem e colapsar os inativos com opção de expandir é mais sofisticado que simplesmente remover a opção. É a diferença entre produto com opinião e produto arrogante. Gary Vee também acertou no risco mais concreto do bug de delete: erosão de confiança silenciosa é mais perigosa que falha catastrófica porque é invisível até ser irreversível.

**Posição inabalável:** sequência. A ordem é: cruzamento Meta+CRM no backend primeiro; filtros dinâmicos por período segundo; protocolo de operações destrutivas em todas as ações de escrita terceiro; hierarquia visual quarto. E a pergunta que ainda não foi feita com clareza suficiente: qual é o identificador de ligação confiável entre campanha Meta e lead no CRM? Esse mapeamento precisa ser documentado como regra de negócio antes de virar código.

**Concessão sobre redesign:** aceita-se que o redesign visual fique para depois, desde que o dev identifique uma tela — só uma — e reposicione a informação mais importante para o topo com máximo destaque visual. Uma mudança. Não um sprint de design.

---

### Marcel Marcondes — réplica e convergência

**Reconhecimento válido:** Sandro San foi o mais preciso sobre o identificador de ligação e a necessidade de tratar o mapeamento como governança. Gary Vee acertou no risco de o produto virar redundante na rotina de quem deveria depender dele. Hormozi distinguiu corretamente que "sem dado no período" não significa "campanha inativa" — o filtro precisa respeitar contexto temporal, não inferir inatividade permanente.

**Posição inabalável:** sequência de prioridade com rigor. Primeiro fecha o loop de dados: cruzamento Meta+CRM no backend com regra de match documentada e versionada — sem isso qualquer melhoria de UX é cosmética sobre dado incompleto. Segundo: filtros com dois estados. Terceiro: padrão sistêmico de feedback para toda operação de escrita. Quarto, e só quarto: hierarquia visual — porque design serve para comunicar dados que o usuário já confia.

**Concessão a Grant:** ação agora vale mais que arquitetura perfeita em três meses para o caso das operações destrutivas. O padrão de confirmação, log e feedback pode ser implementado em dois turnos de trabalho. Mas o cruzamento Meta+CRM não pode ser gambiarra no frontend — tem que ser no backend, com regra de match explícita, testada e documentada.

---

### Grant Cardone — réplica e convergência

**Reconhecimento válido:** Sandro San fez o ponto mais cirúrgico do debate: o bug do delete silencioso treina o usuário a duvidar de tudo que o produto diz. Quando o usuário perde confiança no feedback do sistema, para de agir com base no dado. E quando para de agir, o produto vira decoração. Dashboard de vendas que não inspira confiança operacional não é ferramenta de decisão — é relatório de PowerPoint caro.

**Posição inabalável:** a integração Meta-CRM cruzada no backend e a eliminação dos filtros inativos precisam acontecer agora. Essas duas coisas juntas resolvem o maior buraco de confiança do produto: o gestor finalmente consegue olhar para uma tela e responder "esse real de investimento virou resultado?"

**Concessão sobre hierarquia visual:** design visual é problema que se resolve depois que o dado está certo e o filtro está funcionando. Não se reforma a vitrine enquanto o estoque está errado.

**Plano resultante:**
- Dia 1: cruzamento Meta no backend
- Dia 2: filtros inativos eliminados
- Dia 3: confirmação e log em toda operação destrutiva
- Semana seguinte: design refinado

---

## 5. Decisão do Presidente

### Avaliação dos caminhos

O debate produziu três caminhos distintos. O primeiro — de Hormozi e Grant — é radical: corta tudo o que não é essencial, fecha o loop de dados Meta+CRM imediatamente, age com velocidade máxima. O segundo — de Russell e Marcel — é sequencial e mais cuidadoso: mapeia primeiro o identificador de ligação, define a regra de match como governança, depois constrói em camadas. O terceiro — de Gary e Sandro — é centrado no usuário: antes de qualquer código, senta com quem usa o produto e descobre a pergunta que ele faz toda manhã.

### Caminho escolhido

**Escolho o segundo caminho, com a urgência do primeiro.**

O raciocínio: produto bom não é produto rápido. É produto que não mente. E esse produto hoje mente em dois lugares — o filtro de campanha da Meta não funciona, e os filtros mostram opções que não existem no período. Não se conserta isso com velocidade; conserta-se com rigor. O cruzamento Meta+CRM no backend só funciona se o `utm_campaign` chegar limpo nos dois lados. Se não se mapear isso antes de codificar, a integração vai retornar zero resultados e todo mundo vai achar que é bug quando na verdade é string com espaço extra. Isso destrói mais confiança do que a ausência da feature. Marcel e Sandro foram os únicos que disseram isso com clareza. Estão certos.

### Aproveitamento por membro

| Membro | Contribuição incorporada | Contribuição descartada |
|---|---|---|
| **Hormozi** | Hierarquia visual como matemática de atenção | Ideia de que o dev descobre a hierarquia certa sozinho, sem o usuário |
| **Russell** | Loop de dados como núcleo da proposta de valor | Framework "herói, suporte, ação" — linguagem de landing page, não de dashboard operacional |
| **Gary** | "O produto foi construído para funcionar, não para ser usado" — melhor frase do debate | Tom de urgência que ignora a qualidade do match de dados |
| **Sandro** | A pergunta sobre o identificador de ligação é obrigatória antes de qualquer linha de código | — |
| **Marcel** | Dois estados de filtro — ativos visíveis com contagem, inativos colapsados com saída de emergência — é a solução mais honesta | — |
| **Grant** | Lista de operações destrutivas hoje, confirmação e log em dois turnos de trabalho — não precisa de sprint | — |

### Decisão final

Esta semana, nesta ordem, sem inversão:

1. **Validar o identificador de ligação.** Comparar strings reais de `utm_campaign` entre o banco do CRM e a tabela de Meta Ads. Não assumir — verificar. Documentar a regra de match e tratá-la como contrato de dados, não detalhe de código.

2. **Com a regra validada, fazer o cruzamento no backend.** O filtro de campanha Meta precisa fechar o loop de dados com o CRM. Esta é a razão de existir do produto.

3. **Refatorar o dropdown de filtros para dois estados.** Campanhas com dado no período selecionado aparecem com contagem visível. Campanhas sem dado ficam colapsadas sob "Ver mais." Nenhuma opção desaparece permanentemente — apenas se hierarquiza.

4. **Listar toda operação destrutiva do produto e aplicar o padrão em cada uma.** Confirmação explícita com texto do impacto, log de quem fez e quando, feedback claro de sucesso ou falha. Duas horas de trabalho por operação. Não precisa de sprint.

5. **Somente após os quatro pontos acima:** sentar trinta minutos com quem usa o produto, perguntar qual é a primeira coisa que ele quer saber ao abrir o dashboard, e reposicionar esse dado no topo da tela com destaque visual radical. Uma tela. Uma mudança. Nada mais por ora.

> Design sem dado confiável é cosmético. Dado sem clareza de uso é ruído. Os dois juntos, nessa ordem, são produto. Não há atalho.

---

## 6. Encaminhamentos

| # | Ação | Responsável | Prazo | Critério de conclusão |
|---|---|---|---|---|
| 1 | Extrair amostra de `utm_campaign` da tabela de Meta Ads e do CRM, comparar strings lado a lado e documentar discrepâncias encontradas | Dev responsável | Dia 1 após a reunião | Documento com mapeamento de variações e regra de match formalizada |
| 2 | Implementar cruzamento Meta+CRM no backend usando a regra de match validada no passo 1 | Dev responsável | Dias 2–3 após a reunião | Filtro de campanha Meta funcional, retornando leads vinculados; regra versionada e documentada |
| 3 | Refatorar dropdown de filtros de campanhas para dois estados: ativos no período (com contagem) e inativos colapsados (com opção "Ver mais") | Dev responsável | Dias 4–5 após a reunião | Dropdown exibe apenas campanhas com dado no período por padrão; itens inativos acessíveis mas não poluem a lista |
| 4 | Levantar todas as operações destrutivas do produto (delete, limpeza em lote, remoção de metas, etc.) e aplicar em cada uma: confirmação explícita, log com autor e timestamp, feedback de sucesso ou erro visível | Dev responsável | Dias 5–6 após a reunião | Nenhuma operação destrutiva executa sem confirmação; toda execução gera registro auditável |
| 5 | Realizar sessão de 30 minutos com o gestor principal usuário do dashboard para mapear as três perguntas que ele faz toda manhã ao abrir o produto | CEO + Dev responsável | Semana 2 | Documento com as três perguntas mapeadas e a hierarquia de informação por tela derivada delas |
| 6 | Selecionar uma tela prioritária e reposicionar o dado mais importante (conforme mapeamento do item 5) no topo com destaque visual radical | Dev responsável | Semana 2 — após item 5 | Uma tela com hierarquia visual clara, validada com o usuário |
| 7 | Avaliar separação de ambiente entre dados de teste e dados reais para eliminar o risco estrutural revelado pelo bug de delete | CEO | Semana 3 | Decisão documentada: manter ambiente único com controles rígidos ou criar ambiente de homologação separado |
| 8 | Atualizar `docs/MUDANCAS.md` e `docs/ARQUITETURA.md` ao concluir os itens 2, 3 e 4 | Dev responsável | Na conclusão de cada item | Documentação reflete o estado atual do sistema |

---

*Ata lavrada em 27 de junho de 2026. Aprovada por Steve Jobs, presidente da sessão.*
