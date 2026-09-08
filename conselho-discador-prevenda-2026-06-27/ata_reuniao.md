# ATA DA REUNIÃO DO CONSELHO DOS MESTRES

---

**Data:** 27 de junho de 2026
**Tema:** Lógica do Discador de Pré-Vendas
**Presidente:** Jeff Bezos
**Membros presentes:** Alex Hormozi · Russell Brunson · Gary Vaynerchuk · Sandro San · Marcel Marcondes · Grant Cardone
**Formato:** Três rodadas de deliberação com decisão presidencial ao final

---

## RESUMO DO PROBLEMA

O sistema de discagem de pré-vendas em operação trata todos os leads como equivalentes no tempo — um lead que chegou há 8 minutos e um que chegou há 6 horas recebem a mesma classificação estática de "Prioridade Alta". Essa lógica ignora o fator mais crítico de conversão em vendas consultivas de alto ticket: a janela de atenção do lead, que começa a fechar após 30 minutos da entrada no CRM e colapsa quase completamente em 4 horas.

Os problemas estruturais identificados antes do início do debate foram:

- Fila estática sem recalculo dinâmico por comportamento do lead
- Ausência de lógica de sinal quente (resposta de WhatsApp, abertura de email, clique em link)
- Ausência de cooldown inteligente entre tentativas
- Decisão de prioridade transferida ao SDR em vez de ao sistema
- Ambiguidade sobre como um lead sai da fila após uma tentativa (tick manual vs. detecção automática)
- Risco de colisão de abordagem em operações com múltiplos SDRs simultâneos

---

## RODADA 1 — DIAGNÓSTICO E PROPOSTAS INICIAIS

### Alex Hormozi

**Diagnóstico:** A causa raiz não é tecnológica — é a ausência de modelo mental sobre velocidade de contato. O discador atual não diferencia o valor de um lead por tempo decorrido. Pesquisas de vendas outbound demonstram que ligar nos primeiros 5 minutos aumenta a taxa de contato em 9x em relação a ligar em 30 minutos. A empresa está pagando pelo lead duas vezes: uma vez no Meta Ads, e outra vez destruindo a conversão com um sistema que ignora o tempo.

**Lógica de prioridade proposta — Score de 0 a 100, recalculado a cada 60 segundos:**

- **Sinal quente recente (40 pontos):** se o lead respondeu WhatsApp, abriu email ou clicou em link nas últimas 2 horas, score máximo nessa dimensão.
- **Decay de tempo sem contato (35 pontos):** score sobe a cada 15 minutos sem tentativa de ligação, com pico nos primeiros 90 minutos após entrada no CRM, caindo progressivamente até o dia seguinte.
- **Tentativas falhadas com intervalo inteligente (25 pontos):** cooldown de 45 minutos entre tentativas. Após a 3ª tentativa sem resposta, o lead sai da fila de ligação e entra na fila de WhatsApp — tentativa 4 é mensagem, não ligação.

**Sobre saída da fila:** Tick manual imediato como padrão, com detecção automática via webhook como confirmação. Um clique — "Liguei" — e o lead sai da fila principal, entra no log de tentativas, e retorna em 45 minutos se não houver resposta. Dependência de disciplina humana constante sob pressão é falha de design de sistema.

**Simulação de turno (40 leads ativos):** Início às 8h — SDR vê 5 leads no topo com sinal quente acumulado durante a noite, cada um com razão específica visível. Meio do turno às 12h30 — 3 leads novos pulsam para o topo automaticamente; um lead que estava na posição 12 às 8h está agora na posição 2 porque respondeu WhatsApp às 12h15, destacado em verde com "respondeu há 15 minutos". Final às 17h — fila de ligação menor, leads sem resposta em 3 tentativas movidos para fila de WhatsApp. SDR encerra com clareza absoluta: conectados, agendados, em cooldown para amanhã.

---

### Russell Brunson

**Diagnóstico:** O problema é um funil sem pressão de tempo. O sistema trata todos os leads como iguais no momento em que chegam e não muda de opinião conforme o tempo passa. Os primeiros 5 minutos de contato valem mais do que os próximos 5 dias combinados. O discador atual opera como se tivesse 5 dias para todo mundo.

**Lógica de prioridade proposta — Urgency Score em quatro camadas:**

- **Camada 1 — Tempo sem contato:** 0–30 min = 100pt / 30–60 min = 80pt / 1–3h = 60pt / 3–6h = 40pt / acima de 6h = 20pt base.
- **Camada 2 — Sinal quente recente:** respondeu WhatsApp nos últimos 15 min = +50pt / abriu email em 30 min = +30pt / clicou em link = +40pt.
- **Camada 3 — Tentativas sem sucesso:** 1 a 3 tentativas aumenta prioridade (+20pt cada); acima de 5 tentativas em 48h, lead entra em fila de recuperação.
- **Camada 4 — Qualificação parcial:** SDR já conectou e confirmou capacidade financeira, mas sem agendamento = score mínimo de 70pt independente do tempo.

**Sobre saída da fila:** Ambos os mecanismos, com hierarquia. Detecção automática via webhook como gatilho principal — lead muda de "aguardando chamada" para "em follow-up" automaticamente. Tick manual como fallback obrigatório: três botões de resultado (Conectou / Não atendeu / Agendou), sem formulários. SDR sob pressão com 40 leads vai esquecer de tickar — quando isso acontece, o lead volta ao topo e o SDR liga duas vezes em 10 minutos para a mesma pessoa, queimando o lead e a reputação.

**Conceito central — "fila viva":** a fila não é uma lista que o SDR cria de manhã e executa linearmente. É um organismo que respira, reage a sinais em tempo real e retira do SDR a carga cognitiva de decidir quem é prioridade. O sistema decide, o SDR executa.

**Simulação de turno:** Início às 8h45 — 12 leads, topo com "Carla Mendes — respondeu WhatsApp há 4 minutos: 'Pode ser amanhã?'" (Score 148). Meio-dia — fila reorganizada por completo, leads novos no topo, SDR no ritmo de 1 chamada a cada 4–5 minutos sem tomar decisão alguma. Final às 17h15 — "Ana Paula — respondeu Instagram há 6 min: 'Quero saber mais'" pulou a fila inteira por sinal de reengajamento tardio.

---

### Gary Vaynerchuk

**Diagnóstico:** A causa raiz não é tecnológica — é psicológica. O discador foi construído com a lógica de quem nunca trabalhou num turno de SDR sob pressão. A causa real: o sistema está centrado na fila, não no sinal do lead. Um lead que responde WhatsApp às 13h47 está quente naquele momento — não em 20 minutos, não amanhã.

**Lógica de prioridade proposta — Score de 0 a 280, cinco critérios:**

1. Resposta de WhatsApp/SMS nas últimas 2 horas = 100 pontos.
2. Tempo desde o opt-in: 0–30min = 80pt / 30min–2h = 50pt / 2–8h = 20pt / acima de 8h sem contato = 5pt.
3. Tentativas anteriores frustradas: 0 = neutro / 1–2 = -10pt / 3+ = -30pt.
4. Reengajamento — abriu email ou clicou em algo nas últimas 4h = +40pt.
5. No-show de reunião nas últimas 48h = +60pt — prioridade absoluta.

**Sobre saída da fila:** Hibridismo com viés automático pesado. Detecção automática via webhook como trabalho pesado — ao detectar chamada, lead muda para "Tentativa Registrada" e sai da fila ativa por 2 horas. Tick manual existe para um caso específico: SDR conversou fora do sistema (WhatsApp pessoal, ligação por número pessoal). O tick manual é o override humano, não o fluxo padrão. Dependência de tick manual como padrão resulta em 40% de leads desaparecendo da fila sem registro real.

**Simulação de turno:** Início às 8h — "Marcos Oliveira, 87 pontos — respondeu WhatsApp às 7h52, disse 'ok, me liga'." SDR não pensa, liga para o Marcos. Meio-dia — três leads novos com 70+ pontos entram no topo; um lead morto desde segunda-feira aparece com 88 pontos porque abriu email às 13h12 — sinal de vida, volta para cima. Final às 17h — sistema sugere último WhatsApp de texto antes de arquivar para leads com baixo engajamento, dois leads novos do fim do dia têm prioridade absoluta. Clareza total, zero decisão sobre "quem ligar."

---

### Sandro San

**Diagnóstico:** A causa raiz não é tecnológica — é conceitual. Alguém construiu um "organizador de leads" quando precisava construir uma máquina de chamadas. São coisas completamente diferentes. Organizador você olha e decide. Máquina você obedece. SDR sob pressão não tem tempo para decidir — ele precisa de ordem, não de grade. Sistema que exige julgamento do SDR é sistema que falha no turno da tarde quando ele está cansado, estressado e com 40 leads simultâneos.

**Lógica de prioridade proposta — Score com quatro componentes e pesos fixos:**

- **Score = (Urgência de Tempo × 40) + (Sinal Quente × 30) + (Tentativas Anteriores × 20) + (Valor Potencial × 10)**
- Urgência de Tempo: 0–15min = 100pt / 15–60min = 80pt / 1–3h = 60pt / 3–8h = 40pt / 8–24h = 20pt / acima de 24h sem sinal quente = 5pt.
- Sinal Quente: respondeu WhatsApp nos últimos 30 min = 100pt instantâneos — lead sobe ao topo independente do resto. Áudio = 90pt. Abriu link de calendário = 70pt.
- Tentativas: 0 = 100pt / 1 = 70pt / 2 = 40pt / 3+ = 10pt. Lead com 4+ tentativas sem sinal consome energia sem retorno.
- Valor Potencial: inferido pelo canal de origem — campanha CDAV vale mais que formulário orgânico genérico. Ajustável no painel do gestor após 30 dias de dados.

**Sobre saída da fila:** Os dois mecanismos em camadas. Automático como gatilho principal — webhook de chamada move lead para "Aguardando resultado" por 4 horas; mensagem via GHL move para "Aguardando resposta" por 2 horas. Tick manual para casos fora do CRM: um botão, um clique, quatro opções (Conectei / Não atendeu / Agendei / Perdi). Complexidade zero na ponta do usuário, lógica toda no backend.

**Simulação de turno (40 leads ativos):** Início às 9h — 8 leads no topo, sistema indica "João Silva — respondeu WhatsApp às 22h47. Ligue agora." Sem interpretação. Meio do turno às 13h — fila reorganizou automaticamente enquanto o SDR almoçava; ele senta e a realidade do momento já está refletida, sem ação manual. Final às 17h — leads com score abaixo de 30 em modo "Dormindo", fila ativa com apenas os 6 que têm chance real de conversão naquele dia. Score mínimo para fila ativa: 30 pontos.

---

### Marcel Marcondes

**Diagnóstico:** O problema é de governança de processo, não tecnológico. O discador trata todos os leads como iguais no tempo, o que viola o princípio básico de customer centricity. Quando se deixa o SDR decidir subjetivamente quem ligar primeiro — baseado em grade estática — a métrica mais crítica do negócio (tempo de resposta) é entregue ao acaso. Isso não é processo, é caos com cara de painel.

**Lógica de prioridade proposta — Score único de 0 a 100, quatro variáveis ponderadas:**

- **T — Urgência de tempo (40 pontos):** 0–30min = 40pt / 30min–2h = 25pt / 2h–6h = 10pt / acima de 6h = 5pt.
- **S — Sinal de calor (30 pontos):** respondeu WhatsApp = 30pt / abriu email = 15pt / clicou em link = 10pt / sem sinal = 0pt.
- **A — Tentativas realizadas (20 pontos, inversamente proporcional):** 0 = 20pt / 1 = 15pt / 2 = 8pt / 3+ = 3pt.
- **Q — Qualidade do lead (10 pontos):** MQL com tag de alta intenção = 10pt / MQL padrão = 6pt / lead frio = 2pt.

Score recalculado a cada 5 minutos via Supabase Realtime. Lead novo com resposta de WhatsApp entra direto no topo com 70pt. Lead de ontem sem sinal fica em espera com 8pt.

**Sobre saída da fila:** Tick manual obrigatório de 1 clique, detecção automática como camada complementar de auditoria gerencial. Em ambiente com 3–6 SDRs simultâneos, webhook com atraso de 3 minutos gera colisão de abordagem — dois SDRs ligando para o mesmo lead. Tick manual elimina essa ambiguidade. O processo inteiro deve levar menos de 8 segundos entre uma ligação e a próxima. Dois botões: "Não atendeu" ou "Em andamento."

**Simulação de turno:** Início às 8h — 7 leads acima de 50pt, sistema exibe "1. Ana Lima — respondeu WhatsApp há 12min, 1 tentativa anterior. 2. Carlos Mota — lead novo, chegou 8h02. 3. Fernanda Reis — respondeu email há 28min." Sem dúvida, sem decisão. Meio do turno às 12h30 — fila de follow-up com sequência de 90 segundos por lead, próximo já carregado enquanto atual é registrado. Final às 17h30 — leads com 5+ tentativas e zero resposta marcados automaticamente como "Pausado — revisão amanhã", retirando-os da fila ativa. **KPI central:** percentual de leads contactados em até 30 minutos — a única métrica que não deixa escapatória.

---

### Grant Cardone

**Diagnóstico:** O problema não é tecnológico — é filosófico. O sistema foi construído com lógica que trata todos os leads como iguais, sem colocar TEMPO como variável principal. A taxa de contato nos primeiros 5 minutos é de 78%. Depois de 30 minutos cai para 36%. Depois de 24 horas, o lead foi perdido. Blocos fixos de "prioridade" são uma mentira bonita que diz ao SDR "tá tudo bem, você ainda tem tempo." Não tem.

**Lógica de prioridade proposta — Score de 0 a 100, calculado em tempo real:**

- Tempo desde o lead entrar sem primeiro contato (40 pontos) — decai 1 ponto a cada 15 segundos sem toque.
- Sinal quente nas últimas 2 horas — WhatsApp respondido, email aberto, retorno ao site (35 pontos) — decai linearmente em 2 horas.
- Número de tentativas já feitas (25 pontos) — começa em 25, perde 5 por tentativa fracassada, volta a 20 se houver novo sinal.

Lead novo sem contato = score 100 imediatamente. Lead de 3 dias que acabou de responder WhatsApp = score 75, no top 5 da fila em menos de 1 minuto.

**Sobre saída da fila:** Hibridismo com viés automático pesado. Webhook do GHL registra a ligação e move o lead automaticamente para "tentativa feita" — desaparece da fila por 45 minutos sem resposta, ou definitivamente se agendou. Tick manual existe em uma única situação: SDR falou no WhatsApp sem ligar. Um botão enorme, verde, chamado "TENTATIVA FEITA" — não checkbox no canto da tela. Tudo que exige mais de 1 clique mata a velocidade do SDR.

**Modelo de estados:** Dois estados primários visíveis. "Ligue agora" = qualquer lead com resposta de WhatsApp nas últimas 2 horas ou lead novo com menos de 15 minutos. "Próximo da fila" = todo o resto, ordenado por tempo sem contato.

**Simulação de turno:** Início às 8h — "Lucas Mendes — abriu email 22 min atrás, 2 tentativas ontem, ligue AGORA." Meio-dia — 38 leads novos integrados, SDR vê frescos no topo misturados com leads de 48h que mandaram WhatsApp durante o almoço. Final às 17h — 8 leads acima de score 50, outros em cadência automática de texto. Sistema mostra: "Faltam 3 leads no topo da fila. Complete isso e você termina o turno com 9 agendamentos." Número concreto. Meta visível.

---

## RODADA 2 — DEBATE CRUZADO E REFINAMENTO

### Alex Hormozi

Crítica direta a Russell Brunson: um score de 148 pontos para a Carla Mendes parece sofisticado no papel e é exatamente por isso que vai quebrar no mundo real. Quando o SDR vê "Score 148", ele não sabe se aquele número veio de sinal quente ou de tentativas — e isso importa porque o comportamento muda: sinal quente exige ligar agora, 4 tentativas sem resposta exige mudar o canal antes de ligar. Colapsar tudo num único número sem transparência do componente principal é substituir a decisão errada do SDR por uma caixa preta.

Crítica direta a Grant Cardone: o cooldown fixo de 45 minutos é tempo arbitrário que não reflete comportamento de lead. Em operação com 3–6 SDRs e 200 leads por dia, o lead que tentou às 9h volta no slot de outro SDR às 9h45, causando duplicação de abordagem no mesmo dia — o que é pior do que não abordar. Além disso, o decaimento de 1 ponto a cada 15 segundos cria filas completamente diferentes para SDRs que abriram o sistema com 5 minutos de diferença sem motivo estratégico. O decaimento deve ser por minuto, não por segundo.

Ponto que todos acertaram mas ninguém levou à conclusão prática: o contexto do lead tem que aparecer em 3 segundos ou o SDR não usa. A linha de contexto obrigatória no card do lead não deve ser a última mensagem completa nem o histórico em popup — deve ser uma linha. "Respondeu WA 4min: 'Pode ser amanhã?'" ou "3 tentativas, último contato seg, abriu email 8h38." O SDR lê enquanto o telefone está chamando.

Sobre tick manual vs. automático: Marcel está errado ao fazer o tick manual obrigatório por medo de colisão entre SDRs. Colisão resolve com travamento de lead — quando SDR A está com o lead X ativo na tela, lead X fica bloqueado para SDR B. Problema de concorrência de banco de dados, não de processo humano. Tick manual como fluxo principal garante que na segunda-feira de manhã com 80 leads acumulados os SDRs vão esquecer de tickar e a fila vai ficar suja. Detecção automática via webhook é o padrão. Tick manual é a exceção documentada.

---

### Russell Brunson

Crítica a Alex Hormozi: score de 0 a 100 com decay de 15 em 15 minutos é matematicamente elegante e vai destruir a confiança do SDR em dois dias. O SDR vai ligar para o lead com score alto, o lead não vai atender, o score vai cair. Na próxima vez com score 40, o SDR aprendeu inconscientemente que "alto score não significa nada." Isso é Pavlov invertido — treinando o SDR a ignorar a fila. O score precisa significar probabilidade real de conversão, não velocidade de decaimento.

Crítica a Grant Cardone: o dado de "78% de taxa de contato em 5 minutos" é de outbound frio B2B norte-americano de 2007. Leads de tráfego pago Meta Ads que preencheram um formulário pedindo contato têm comportamento completamente diferente. O problema não é velocidade de ligação nos primeiros 5 minutos — é o que acontece na ligação. A métrica "percentual contactado em 30 minutos" como KPI único cria incentivo perverso: SDR liga em 4 minutos, faz uma abertura ruim porque está no modo máquina, e o lead desqualifica em 90 segundos.

Ponto que ninguém adicionou: o contexto narrativo do lead é inegociável. Ao lado do nome e do score, três campos imutáveis são necessários: funil de origem, gancho do anúncio, e última mensagem recebida. Um lead que veio de um VSL de 45 minutos sobre "sair do emprego em 90 dias" tem conversa completamente diferente de um que preencheu formulário genérico. O discador tem que permitir que o SDR continue a história que o marketing já começou.

Sobre tick manual versus automático: o tick manual não existe para cobrir falha de webhook. Ele existe porque o desfecho da ligação é uma informação qualitativa que o sistema não consegue inferir automaticamente. "Não atendeu" e "atendeu mas não quer saber" são dois estados radicalmente diferentes para o próximo follow-up — e o webhook do GHL não distingue. Solução: detecção automática move o lead para "Em processamento" em 30 segundos; SDR tem 60 segundos para categorizar em quatro botões de toque único — Agendou / Vai pensar / Não atendeu / Descartado.

---

### Gary Vaynerchuk

Crítica a Alex Hormozi: a lógica de 45 minutos de cooldown trata o lead como comportamento uniforme quando ele não é. Lead que não atendeu às 9h porque estava no trânsito não é igual a lead que estava em reunião até meio-dia. Sinal quente resolve isso — mas Hormozi colocou sinal quente como fator secundário (40 pontos contra 35 de urgência de tempo). Isso deve ser invertido: contexto de resposta vale mais que decaimento de tempo. Um lead de 6 horas que mandou áudio no WhatsApp agora vale 10x mais que um lead de 20 minutos que não fez nada.

Crítica a Russell Brunson: a estrutura de Urgency Score em quatro camadas é a mais próxima do correto, mas adiciona complexidade onde se precisa de clareza. Quatro camadas, pesos fixos, cálculo a cada 5 minutos é produto bonito para apresentação em board, não ferramenta para SDR de 23 anos que fez 18 ligações em 3 horas. O que move a agulha não é o score de 0 a 100 — é o SDR entender em 2 segundos POR QUÊ esse lead está no topo. "João — respondeu áudio agora" o SDR entende e age. "João — score 87" o SDR vê e ignora mentalmente.

Sobre tick manual versus automático: todo mundo concordou em "hibridismo" e ficou satisfeito com a própria resposta. O problema não endereçado: o SDR conversou no WhatsApp pessoal, o lead pediu "me liga quinta às 14h", o SDR voltou ao discador 3 minutos depois. O GHL não registrou nada, o lead voltou ao topo da fila, e o próximo SDR que abrir o sistema vai ligar para esse lead de novo. Isso acontece todo dia em operações com 3+ SDRs. A solução real é tick manual com fricção zero mais confirmação de contexto obrigatória em uma linha — "O que combinaram?" com 4 botões. Sem isso, tem-se dado de atividade sem dado de resultado.

Maior risco não mencionado: o SDR não confiar no sistema. Se ele achar que a fila está errada — e vai achar no início, porque vai estar — ele começa a trabalhar fora da fila, por feeling. Antes de qualquer arquitetura técnica, é necessária uma semana de acompanhamento lado a lado com um SDR top para mapear quais sinais ele considera quentes e urgentes. O algoritmo se constrói sobre o que funciona, não o contrário.

---

### Sandro San

Crítica central ao grupo: Hormozi, Russell e Cardone constroem sistemas para SDRs que executam bem. O problema não nomeado: um SDR em alta pressão com 40 leads não tem problema de informação — tem problema de decisão sob carga cognitiva máxima. Score de 0 a 100 calculado a cada 60 segundos com 3 dimensões ponderadas é sistema que analista entende na apresentação e que o SDR ignora completamente na prática. O SDR não liga para o número — liga para o nome que aparece primeiro. Se o número não tiver significado intuitivo imediato, ele vai ligar pela ordem visual, que é exatamente o que o sistema atual já faz.

Crítica direta a Marcel: propor tick manual de 1 clique como padrão e detecção automática como "auditoria gerencial" inverte a prioridade. Auditoria gerencial não salva agendamento — conta agendamento perdido. Se o SDR faz 8 ligações em 40 minutos e esquece de clicar em 3, há 3 leads fantasmas no topo da fila quando o próximo SDR do turno abre o sistema. Colisão de abordagem em high-ticket é fatal — ligar duas vezes para o mesmo lead em 20 minutos com SDRs diferentes e scripts diferentes transforma lead quente em lead morto. Detecção automática é o fluxo principal. Tick manual é o override de exceção.

Crítica a Gary Vaynerchuk: resposta de WhatsApp depois de quanto tempo? Uma resposta 14 horas após a primeira mensagem tem valor completamente diferente de uma resposta 3 minutos depois. O sinal quente não é o canal — é a velocidade de reação do lead. Um lead que respondeu em 4 minutos tem janela de atenção aberta agora. Um lead que respondeu depois de dormir, acordar e tomar café está em modo de processamento passivo. Tratar os dois com o mesmo peso de 100 pontos cria fila que parece precisa e não é.

**Proposta alternativa:** Apenas três estados visíveis para o SDR, sem score exposto — Ligue Agora (verde, máximo 5 leads), Ligue Hoje (amarelo), e Mensagem (cinza, abordagem textual porque ligação não converteu). Com razão em linguagem humana: "Fernanda — respondeu há 8 min", "Carlos — 3ª tentativa, cooldown até 14h30." O score existe por baixo, calculado pelo sistema, mas o SDR nunca o vê. Sistema que exige que o SDR interprete números está terceirizando a decisão para quem tem menos contexto para tomá-la.

---

### Marcel Marcondes

Crítica a Alex Hormozi: o sistema pressupõe que o SDR vai confiar cegamente no algoritmo desde o primeiro dia. Não vai. SDR desenvolve ao longo de meses intuições sobre seus leads. Quando o sistema coloca João Silva no topo com score 73 e o SDR sente que Ricardo Ferreira — no slot 8 com score 61 — vai atender porque sempre atende no horário de almoço, o SDR ignora a fila e começa a reordenar manualmente. O sistema vira decoração. Está faltando um mecanismo de calibração de confiança — o SDR precisa ver o sistema acertar antes de obedecer cegamente.

Crítica a Gary Vaynerchuk: score até 280 pontos cria complexidade de interpretação excessiva. O SDR vai olhar para "Marcus Alves, 88 pontos" e "Carla Mendes, 121 pontos" e perguntar "quanto é bom? quanto é excelente?" — porque 88 num sistema de 280 parece mediano. O overhead cognitivo vai ser fatal no final do turno com energia baixa. Score simples de 0 a 100 com faixas visuais claras — vermelho, âmbar, verde — é suficiente. A sofisticação fica no backend, não na tela do SDR.

Sobre tick manual versus automático: os dois estão certos na direção, mas errados na ênfase. O ponto real não endereçado: quando o webhook do GHL chega com 4 minutos de atraso em pico de tráfego, o SDR já está na próxima ligação e o sistema ainda mostra o lead anterior como pendente. Quando o webhook finalmente chega, o registro de resultado vai ficar em branco porque ninguém registrou. Resultado: fila tecnicamente atualizada com histórico inútil. A solução correta é um terceiro caminho: detecção automática para mover o lead da fila, mais prompt imediato de resultado — notificação que aparece ao SDR 30 segundos após a detecção perguntando "como foi essa ligação?" com 3 botões.

Ponto não tocado por ninguém: a fila mais inteligente do mundo falha se o SDR não sabe por que um lead está no topo. "Score 91" não é contexto. "Respondeu WhatsApp há 8 minutos dizendo 'pode me ligar?'" é contexto. A diferença entre um SDR que converte 30% e um que converte 15% não é a velocidade de discagem — é o que ele fala nos primeiros 10 segundos da chamada.

---

### Grant Cardone

Crítica a Alex Hormozi: o cooldown de 45 minutos é pensamento que mantém empresas medíocres. "Tentativa 4 é mensagem, não ligação" é desistência disfarçada de estratégia. Call centers de alta performance mostram que a quarta tentativa com abordagem diferente em 20 minutos converte mais do que 45 minutos de silêncio. Mensagem não cria urgência. Voz cria urgência.

Crítica a Marcel Marcondes: o tick manual obrigatório adiciona 8 segundos de fricção entre cada chamada — em 60 chamadas por turno, são 8 minutos de fricção acumulada, fora o erro humano em momentos de alta performance. Além disso, a variável de qualidade por tag de MQL tem um problema crítico de dados: tags do GHL chegam com 2 horas de delay no webhook. O score vai classificar lead frio como MQL quente porque a tag não sincronizou ainda. Isso não é edge case — é a realidade diária de qualquer operação com GHL. Antes de construir fórmula elegante, é necessário resolver a confiabilidade dos dados que a alimentam.

Proposta simplificada: dois estados, sem burocracia. Estado 1: "Ligue agora" — lead com resposta de WhatsApp nas últimas 2 horas ou lead novo com menos de 15 minutos. Estado 2: "Próximo da fila" — todo o resto, ordenado por tempo sem contato. Sem score de 280 pontos, sem quatro camadas de ponderação. SDR não é analista de dados — é atleta de vendas. A complexidade vai gerar o que se chama de "paralisia de prioridade" — o SDR vai olhar para o lead 1 com 148 pontos e o lead 2 com 143 e vai perguntar ao gestor qual dos dois ligar.

Ponto final inegociável: o discador não vai resolver agendamento baixo se o SDR não acredita no produto. O sistema mais simples possível coloca o lead certo na frente do SDR certo no momento certo — e o restante da energia deve ser investido em treinar o SDR para ser imparável quando o lead atende. Velocidade de contato abre a porta. Convicção fecha o agendamento. Na ordem certa.

---

## RODADA 3 — CONVERGÊNCIA E POSIÇÕES FINAIS

### Alex Hormozi

**Convergência principal:** A proposta do Sandro San é a mais sólida do grupo. Ele foi o único que separou o score (backend) da interface (SDR). Todo mundo — incluindo eu mesmo — cometeu o erro de mostrar o número na tela. O SDR que vê "score 73" vai perguntar "isso é bom?" O SDR que vê "Fernanda — respondeu há 8 min" vai discar imediatamente. A diferença entre esses dois sistemas não é a lógica por baixo — é o que aparece na tela.

Gary Vaynerchuk também acertou em algo subestimado: a velocidade de reação do lead importa mais que o canal. Resposta de WhatsApp em 4 minutos é diferente de resposta em 14 horas no mesmo canal.

**O que mantenho:** Cooldown por evento, não por tempo fixo. Grant errou feio aqui — quarta tentativa em 20 minutos não é persistência, é desperdício de lead e de SDR. Dados de call centers de high-ticket mostram que segunda tentativa em menos de 30 minutos tem taxa de atendimento 12% menor que a primeira. Cooldown de 45 minutos não é arbitrário: é a mediana empírica de quanto tempo leva para alguém terminar o contexto que o impediu de atender.

**Fórmula final aceita — score calculado no backend, nunca visível ao SDR:**

**Score = (Recência do Sinal × 45) + (Velocidade de Reação do Lead × 35) + (Tentativas Anteriores × 20)**

- Recência do sinal: sinal em até 30 min = 100pt / 30min–2h = 70pt / lead novo sem sinal = 60pt / sem sinal 2–8h = 30pt / sem sinal acima de 8h = 10pt.
- Velocidade de reação: respondeu em menos de 15 min de qualquer mensagem = 100pt / 15–60 min = 70pt / 1–4h = 40pt / nunca respondeu = 20pt.
- Tentativas anteriores: 0 = 100pt / 1 = 75pt / 2 = 50pt / 3 = 25pt / 4+ sem nenhuma resposta = 10pt.

Score acima de 70 = "Ligue Agora" em verde. Entre 40 e 70 = "Ligue Hoje" em amarelo. Abaixo de 40 = "Mensagem" em cinza. O número nunca aparece na tela — o SDR vê o estado e uma linha de razão em linguagem humana.

---

### Russell Brunson

**Convergência principal:** A proposta mais respeitável é a do Sandro San — ele foi o único que parou de otimizar o algoritmo e perguntou o que o SDR realmente vê quando está no 30º lead do turno. A ideia de três estados visuais sem número exposto resolve o problema que eu mesmo criei: Urgency Score de quatro camadas com 148 pontos é legível numa apresentação e invisível na prática de uma terça-feira às 15h com 40 leads. O Sandro entendeu que o score serve ao sistema, não ao SDR.

**O que mantenho sem negociação:** O contexto narrativo do lead como campo obrigatório. Nenhum dos outros membros resolveu isso de forma satisfatória. Três campos imutáveis ao lado do nome: funil de origem, gancho do anúncio, e última mensagem recebida. Um lead que assistiu VSL de 40 minutos sobre liberdade financeira tem conversa completamente diferente de um que preencheu formulário genérico. Se o SDR abre a ligação sem saber onde o lead está na história, ele começa do zero numa conversa que o marketing já avançou.

**Fórmula final aceita:**

**Score = (Sinal Quente × 50) + (Janela de Tempo × 35) + (Tentativas × 15)**

- Sinal Quente: respondeu qualquer canal em até 30 min = 50pt / 30min–2h = 30pt / 2h–6h = 10pt / sem sinal = 0pt.
- Janela de Tempo desde opt-in sem primeiro contato: 0–20min = 35pt / 20–60min = 25pt / 1–3h = 15pt / 3–8h = 8pt / acima de 8h = 2pt.
- Tentativas: 0 = 15pt / 1 = 10pt / 2 = 5pt / 3+ = 0pt, entra automaticamente no estado Mensagem.

Score acima de 60 = "Ligue Agora" (vermelho, máximo 5 leads visíveis). Entre 25 e 60 = "Ligue Hoje" (âmbar). Abaixo de 25 = "Mensagem" (cinza). O SDR nunca vê o número — vê o estado e uma linha de razão. Recalculo a cada 3 minutos via Supabase Realtime. Sinal quente tem peso maior que tempo porque intenção de engajamento no momento presente vale mais que velocidade de chegada.

---

### Gary Vaynerchuk

**Convergência principal:** O Sandro chegou mais perto da verdade operacional do que qualquer um. Propor esconder o score do SDR é contraintuitivo mas brilhante — porque o SDR sob pressão não processa número, processa instrução. "Fernanda — respondeu há 8 min" é instrução. "Score 87" é abstração. O Sandro entendeu que a interface e o algoritmo são dois produtos diferentes: o algoritmo pode ser complexo, a interface tem que ser idiota-proof.

**Divergência com Sandro:** Três estados é um a mais do que necessário. "Ligue Agora" e "Próximo" resolve. O estado "Mensagem" cria uma segunda fila que o SDR vai ignorar ou misturar com a principal — e aí voltou-se para grade estática com outro nome.

**O que mantenho sem negociação:** Dois princípios. Primeiro: sinal quente de resposta recente tem peso absoluto, não relativo — se o lead mandou WhatsApp agora, ele vai ao topo, sem cálculo ponderado, sem concorrência com decay de tempo. É um override, não uma variável. Segundo: tick manual só existe para o que aconteceu fora do GHL, não como fluxo padrão. Lock de lead por SDR ativo resolve colisão, não tick manual obrigatório.

**Fórmula final aceita:**

**Score = Override(100 se respondeu WA/SMS nos últimos 30min) OU (Tempo × 45) + (Engajamento × 35) + (Tentativas × 20)**

- Tempo: 0–15min = 100pt / 15–60min = 75pt / 1–3h = 50pt / 3–8h = 25pt / acima de 8h sem sinal = 5pt.
- Engajamento: respondeu WA/SMS em 30min–2h = 100pt / abriu email ou clicou link em 4h = 60pt / no-show nas últimas 48h = 80pt / nenhum sinal = 0pt.
- Tentativas: 0 = 100pt / 1 = 75pt / 2 = 40pt / 3 = 15pt / 4+ = 0pt e lead vai para fila de WhatsApp automático.

Score mínimo para aparecer na fila ativa: 25 pontos. Abaixo disso, dorme até sinal quente. O SDR vê só o nome, a razão em uma linha, e o estado — verde ou amarelo.

---

### Sandro San

**Convergência principal:** A proposta mais sólida é a do Marcel — especificamente o prompt imediato de resultado pós-detecção automática, levantado na segunda rodada. Não porque seja a mais completa, mas porque é a única que resolve o problema que todos os outros ignoraram: ter dado de atividade sem dado de resultado é relatório de vaidade. Webhook detecta a ligação, sistema move o lead, em 30 segundos aparece notificação com três botões — Conectei, Não atendeu, Agendei. Esse dado qualitativo alimenta o score da próxima tentativa. Sem ele, o sistema recalcula com base em fantasmas.

**O que mantenho:** O princípio central — score existe no backend, o SDR nunca vê número. O que o SDR vê é estado e razão em linguagem humana. Sistema que exige que o usuário interprete métrica para agir não é sistema — é relatório interativo. E relatório não agenda reunião.

**Fórmula final aceita — quatro componentes com pesos fixos revisáveis após 30 dias de dados reais:**

**Score = (Tempo sem contato × 0,35) + (Velocidade de resposta do lead × 0,35) + (Tentativas anteriores × 0,20) + (Fonte de tráfego × 0,10)**

- Tempo sem contato: 0–15min = 100 / 15–60min = 75 / 1–4h = 45 / 4–12h = 20 / acima de 12h sem sinal = 5.
- Velocidade de resposta: respondeu em menos de 10 min após contato = 100 / 10–60 min = 80 / 1–4h = 50 / resposta espontânea sem contato prévio = 90.
- Tentativas: 0 = 100 / 1 = 70 / 2 = 40 / 3+ = 10.
- Fonte: campanha de alta intenção (CDAV equivalente) = 100 / orgânico qualificado = 70 / tráfego frio = 40.

Score acima de 65 = "Ligue Agora" em verde. De 35 a 65 = "Ligue Hoje" em âmbar. Abaixo de 35 = "Mensagem" em cinza. O SDR vê três listas, nunca um número. O sistema decide qual lista, o SDR decide qual tom de voz usar quando o lead atende. Essa é a divisão correta de inteligência entre máquina e humano.

---

### Marcel Marcondes

**Convergência principal:** A proposta mais sólida em estrutura conceitual é a do Sandro San — não pelos números, mas pela separação entre o que o sistema decide e o que o SDR vê. Quando ele propõe três estados visíveis com razão em linguagem humana, está aplicando o mesmo princípio que qualquer marca bem construída aplica no ponto de venda: reduzir o atrito cognitivo no momento de decisão. Confiança não vem de score de 148 pontos bem explicado em treinamento. Vem de abrir o sistema, ligar para quem aparece primeiro, e a taxa de atendimento ser consistentemente superior ao que ele conseguia com o feeling próprio.

**O que mantenho:** Foco em uma métrica única de governança — percentual de leads contactados em até 30 minutos. Não porque é a mais sofisticada — é porque não deixa escapatória. Score de prioridade se pode debater por horas. Percentual contactado em 30 minutos se mede, se mostra no painel do gestor, e em duas semanas sabe-se se o sistema está funcionando ou não. E o prompt de resultado pós-ligação é inegociável — mas eu errei ao chamá-lo de "tick manual." O prompt correto aparece automaticamente 30 segundos após o webhook detectar a chamada, com quatro ícones sem texto: calendário (Agendou), seta circular (Retornar), telefone cruzado (Não atendeu), X (Descartado). Um toque, zero leitura.

**Fórmula final aceita:**

**Score = (T × 0,35) + (S × 0,35) + (A × 0,20) + (Q × 0,10)**

- T (Tempo sem contato): 0–15min = 100 / 15–60min = 80 / 1–3h = 55 / 3–8h = 25 / acima de 8h = 8.
- S (Sinal quente — velocidade de reação): respondeu em até 30min do contato anterior = 100 / respondeu em 30min–4h = 65 / abriu email ou link em 2h sem responder = 30 / sem sinal = 0.
- A (Histórico de tentativas): 0 = 100 / 1 = 70 / 2 = 40 / 3 = 15 / 4+ = 5.
- Q (Qualidade da fonte): MQL com tag de alta intenção = 100 / MQL padrão = 60 / lead orgânico sem qualificação = 30.

Score acima de 65 = verde (Ligue Agora). Entre 35 e 64 = âmbar (Ligue Hoje). Abaixo de 35 = cinza (Mensagem ou Pausa). Ao lado do nome, linha de contexto gerada pelo componente de maior peso: se S dominou, mostra "respondeu há 8 min". Se T dominou, mostra "lead novo, 12 minutos sem contato." O algoritmo decide. O SDR executa. A gestão mede.

---

### Grant Cardone

**Convergência principal:** O Sandro San chegou mais perto da verdade operacional do que qualquer um. Não pela fórmula — mas pelo princípio fundamental: o SDR nunca deve ver o score, só o estado e a razão em linguagem humana. Gary acertou ao dizer que sinal quente vale mais que decaimento de tempo. Marcel foi o único que mencionou o prompt imediato de resultado pós-detecção automática — funcionalidade real, não teoria.

**O que mantenho:** Dois estados primários visíveis, decisão zero para o SDR. Não três estados — dois. "Ligue agora" e "Próximo." A complexidade fica inteiramente no backend. Também mantenho a posição sobre cooldown por evento, não por tempo fixo — o lead volta para a fila quando dá sinal de vida ou quando o gestor decide que é hora de nova tentativa com intenção declarada. Cooldown de 45 minutos é gerência de CRM disfarçada de sistema.

**Fórmula final aceita:**

**Score = (Sinal Quente × 50) + (Urgência de Tempo × 35) + (Tentativas Inversas × 15)**

- Sinal Quente: respondeu qualquer canal em até 30 min = 50pt / 30min–2h = 30pt / 2h–8h = 10pt / sem sinal = 0pt.
- Urgência de Tempo: 0–15 min sem primeiro contato = 35pt / 15–60 min = 25pt / 1–4h = 15pt / acima de 4h = 5pt.
- Tentativas Inversas: 0 = 15pt / 1–2 = 10pt / 3–4 = 5pt / 5+ = 0pt, vai automaticamente para fila de mensagem.

Score acima de 60 = "Ligue Agora" em verde. Score 20–59 = "Próximo" em amarelo. Abaixo de 20 = fila de mensagem automática, sem ligação. Sem número visível para o SDR — só a cor, o nome, e uma linha: "Respondeu WA 12 min" ou "Lead novo, sem contato." O algoritmo pensa. O SDR executa.

---

## DECISÃO DO PRESIDENTE — JEFF BEZOS

Ouvi cada um de vocês com atenção. Hormozi trouxe rigor matemático. Russell trouxe contexto narrativo. Gary trouxe realismo operacional. Sandro trouxe o insight mais valioso do debate inteiro. Marcel trouxe governança. Cardone trouxe volume e velocidade. Encerro com decisão — não com consenso, porque consenso é o que comitês produzem quando ninguém quer ser responsável pelo resultado.

**Dois caminhos emergiram com clareza. O terceiro foi ruído.**

O primeiro caminho é o da complexidade visível: score de 0 a 280, quatro camadas ponderadas, número na tela do SDR. Hormozi, Russell e Grant variaram nesse espectro. O problema com todos eles é o mesmo: confundem a inteligência do sistema com a interface do sistema. Na Amazon aprendemos cedo que o cliente não quer ver o algoritmo de recomendação — ele quer ver "você pode gostar disso." A lógica fica embaixo. A ação fica em cima.

O segundo caminho — e o correto — é o que o Sandro articulou com precisão: score calculado no backend, estado traduzido em linguagem humana na interface. O SDR nunca vê número. Vê instrução.

O terceiro caminho, do Marcel, é o mais completo em governança, mas errou ao fazer o tick manual o fluxo padrão — decisão que vai custar agendamentos toda segunda-feira de manhã quando os SDRs estiverem com 80 leads acumulados e esquecendo de clicar.

---

### A Fórmula Adotada

Score calculado a cada dois minutos via Supabase Realtime, nunca visível ao SDR. Quatro componentes:

| Componente | Peso | Critérios |
|---|---|---|
| **Sinal Quente** | 40% | Respondeu qualquer canal em até 30 min = 100pt / Resposta espontânea sem contato prévio = 90pt / Respondeu entre 30 min e 2h = 60pt / Abriu email ou link nas últimas 2h sem responder = 30pt / Nenhum sinal = 0pt |
| **Urgência de Tempo** | 35% | 0–15 min sem primeiro contato = 100pt / 15–60 min = 75pt / 1–4h = 45pt / 4–12h = 20pt / Acima de 12h sem sinal quente = 5pt |
| **Histórico de Tentativas** | 20% | 0 tentativas = 100pt / 1 = 70pt / 2 = 40pt / 3 = 15pt / 4+ sem nenhuma resposta = 0pt — lead sai da fila de ligação automaticamente, entra em fila de mensagem |
| **Fonte de Tráfego** | 5% | Campanha de alta intenção qualificada = 100pt / Orgânico qualificado = 70pt / Tráfego frio = 40pt |

**Estados visíveis na interface:**
- Score acima de 65 = estado verde **"Ligue Agora"**
- Score entre 30 e 64 = estado amarelo **"Ligue Hoje"**
- Score abaixo de 30 = estado cinza **"Mensagem"**

A interface mostra três listas, nunca um número. Ao lado de cada nome, uma linha gerada pelo componente de maior peso naquele cálculo: "respondeu WhatsApp há 8 min", "lead novo, 14 minutos sem contato", "3ª tentativa — cooldown até 14h30."

---

### Sobre Tick Manual vs. Automático

**A resposta certa é: automático como padrão, prompt de resultado como confirmação, manual como exceção documentada.**

1. Detecção automática via webhook do GHL move o lead de "aguardando" para "em processamento" assim que a ligação é registrada.
2. Trinta segundos depois, aparece automaticamente um prompt com quatro ícones — sem texto, apenas ícones universais: calendário (agendou), seta circular (retornar), telefone cruzado (não atendeu), X (descartado). Um toque. Zero leitura.
3. Esse dado qualitativo realimenta o score do próximo ciclo. Sem ele, o sistema recalcula com base em fantasmas.
4. O tick manual existe em exatamente uma situação: o SDR fez a ligação fora do GHL — celular pessoal, WhatsApp pessoal, encontro presencial. Um botão explícito "Registrar contato externo" com os mesmos quatro ícones. Não é o fluxo normal — é o override de exceção.
5. Travamento de lead por SDR ativo resolve colisão entre SDRs sem necessidade de nenhum tick: quando o SDR A tem o lead X em tela ativa, o lead X fica bloqueado para o SDR B. Problema de concorrência de banco de dados, não de processo humano.

---

### Como Seria o Turno do SDR com 40 Leads Ativos

**Início de turno — 8h45:** O SDR abre o discador e vê a lista verde com quatro nomes. No topo: "Carla Mendes — respondeu WhatsApp há 6 min." Abaixo: "João Alves — lead novo, 11 minutos sem contato." Terceiro: "Fernanda Costa — respondeu email às 8h38, 1 tentativa anterior." A lista amarela mostra mais doze nomes. A lista cinza está escondida por padrão — um clique para abrir se o SDR quiser ver. O SDR não toma nenhuma decisão. Liga para a Carla. Em 30 segundos após a ligação registrada, aparece o prompt com quatro ícones. O SDR toca em "seta circular" porque a Carla não atendeu. O sistema move a Carla para cooldown por evento — ela reaparece quando der sinal de vida ou quando o sistema detectar que passaram 90 minutos sem sinal.

**Meio do turno — 12h00:** A lista verde reorganizou sozinha. Três leads novos que chegaram entre 10h e 12h estão no topo, mais um lead da lista amarela que respondeu WhatsApp às 11h47 e subiu automaticamente. O SDR não sabe que isso aconteceu — só vê que a lista mudou e o próximo a ligar é diferente do que estava há duas horas.

**Final de tarde — 17h00:** A lista verde tem dois nomes — leads que chegaram após as 16h. A lista amarela tem seis, todos com duas ou mais tentativas. A lista cinza tem doze — quatro ou mais tentativas sem resposta. O sistema já enviou automaticamente uma mensagem de WhatsApp para os doze cinzas durante o turno, sem o SDR precisar agir. O SDR termina o turno com zero dúvida sobre o que foi trabalhado: histórico de tentativas completo, prompts de resultado respondidos, e o gestor vê no painel o percentual de leads contactados em até 30 minutos — a única métrica que importa para avaliar se o sistema está funcionando.

---

### Princípio Decisório Final

**O sistema decide tudo que é lógica. O SDR executa tudo que é humano. Qualquer parte do design que force o SDR a raciocinar sobre prioridade é falha de produto, não falha de SDR.**

---

## ENCAMINHAMENTOS

| # | Ação | Responsável | Prazo |
|---|---|---|---|
| 1 | Implementar o score de quatro componentes com pesos definidos (Sinal Quente 40%, Urgência de Tempo 35%, Tentativas 20%, Fonte 5%) no backend via Supabase, recalculo a cada 2 minutos | Time de produto | Sprint atual |
| 2 | Construir a interface com três listas (verde/amarelo/cinza) sem exposição do número do score — apenas estado e linha de contexto gerada pelo componente dominante | Time de frontend | Sprint atual |
| 3 | Implementar detecção automática via webhook do GHL para mover lead de "aguardando" para "em processamento" ao detectar chamada registrada | Time de backend | Sprint atual |
| 4 | Implementar prompt de resultado pós-chamada com quatro ícones (Agendou / Retornar / Não atendeu / Descartado) aparecendo automaticamente 30 segundos após detecção do webhook | Time de produto | Sprint atual |
| 5 | Implementar travamento de lead por SDR ativo (lock no banco de dados) para eliminar risco de colisão de abordagem em operações com múltiplos SDRs simultâneos | Time de backend | Sprint atual |
| 6 | Implementar botão de override "Registrar contato externo" para casos em que a ligação ocorreu fora do GHL — mesmos quatro ícones de resultado, fluxo de exceção documentado | Time de produto | Sprint seguinte |
| 7 | Definir o campo de contexto narrativo ao lado do nome do lead: funil de origem, gancho do anúncio, e última mensagem recebida (proposta Russell Brunson, aceita pelo presidente) | Time de produto | Sprint seguinte |
| 8 | Configurar painel de gestão com KPI único de governança: percentual de leads contactados em até 30 minutos — visível diariamente | Time de dados | Sprint seguinte |
| 9 | Acompanhar SDR top por uma semana após lançamento para mapear divergências entre o feeling do SDR e a ordenação do algoritmo — dado qualitativo para calibração dos pesos | Gestão de pré-vendas | Pós-lançamento |
| 10 | Revisão dos pesos do score após 30 dias de dados reais de conversão — os pesos atuais são hipótese inicial, não definição permanente | Time de dados + produto | D+30 do lançamento |

---

*Ata lavrada em 27 de junho de 2026. Aprovada pelo Presidente do Conselho.*

*Jeff Bezos — Presidente*
