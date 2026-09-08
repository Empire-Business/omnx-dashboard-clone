# Alex Hormozi — Rodada 1

Aqui está o diagnóstico. Sem rodeios.

---

**A causa raiz não é o software — é ausência de modelo mental sobre velocidade de contato.**

O discador atual trata todos os leads como se tivessem o mesmo valor de tempo. Não têm. Um lead que chegou há 8 minutos e um que chegou há 6 horas não são o mesmo ativo. O primeiro vale três vezes mais porque a janela de resposta ainda está aberta. Pesquisas de vendas outbound mostram que ligar nos primeiros 5 minutos aumenta taxa de contato em 9x comparado com ligar em 30 minutos. Nove vezes. Com o mesmo lead, o mesmo SDR, o mesmo script. A empresa está pagando pelo lead duas vezes: uma vez no Meta Ads, e outra vez destruindo a conversão com um sistema que ignora o fator mais crítico — tempo. O bloco estático de "Prioridade Alta" é ficção administrativa. Ninguém na equipe de produto parou e perguntou: "o que faz um lead urgente ser urgente minuto a minuto?" Sem responder isso, qualquer interface é decoração.

**Aqui está a lógica de prioridade que eu usaria — score de 0 a 100, calculado a cada 60 segundos:**

Regra 1 — Sinal quente recente (vale 40 pontos): se o lead respondeu WhatsApp, abriu email ou clicou em link nas últimas 2 horas, score máximo nessa dimensão. Esse lead está no celular agora. Ligar agora. Regra 2 — Decay de tempo sem contato (vale 35 pontos): o score sobe a cada 15 minutos sem tentativa de ligação, com pico nos primeiros 90 minutos após entrada no CRM, depois cai progressivamente até o dia seguinte. A lógica é: lead novo sem resposta gera urgência crescente; lead velho sem resposta sem sinal quente entra em modo de manutenção, não urgência. Regra 3 — Tentativas falhadas com intervalo inteligente (vale 25 pontos): se o SDR ligou e não atendeu, o lead precisa de um cooldown de 45 minutos antes de subir novamente na fila. Não 5 minutos. Não 4 horas. 45 minutos — tempo suficiente para o lead terminar o que estava fazendo. Após a 3ª tentativa sem resposta, o lead sai da fila de ligação e entra na fila de WhatsApp. Tentativa 4 é mensagem, não ligação. Isso é matemática de conversão, não opinião.

**Sobre saída da fila — a resposta é: tick manual com detecção automática como fallback, nessa ordem.**

Detecção automática sozinha falha porque o GHL tem latência de webhook de 30 segundos a 3 minutos em pico. O SDR faz a ligação, o webhook não chegou, o lead ainda aparece na fila, o SDR fica confuso. Manual tick imediato resolve isso. Um botão. Um clique. "Liguei" — e o lead some da fila principal, entra no log de tentativas, e aparece de volta em 45 minutos se não houve resposta. A detecção automática via webhook funciona como confirmação: se o webhook de ligação chega, sincroniza o estado automaticamente. Se o SDR esqueceu de clicar, o webhook fecha o ciclo. As duas coisas juntas. O erro é escolher uma só.

**Simulação de turno real com 40 leads ativos:**

Início de turno (08h00): o SDR abre o discador e vê 5 leads no topo — todos com sinal quente acumulado durante a noite (responderam WhatsApp depois das 22h, abriram email às 07h45). O sistema diz: "Ligue agora para Marcos Silva — respondeu WhatsApp há 12 minutos." Número 1, número 2, número 3 com nomes reais e razão específica. Não "Prioridade Alta". Razão. Os 35 leads restantes estão ordenados por score, visíveis mas em cinza. O SDR não precisa pensar — só executar.

Meio do turno (12h30): 3 leads novos entraram nas últimas 2 horas, com score máximo. Eles pulam para o topo automaticamente. 8 leads de cooldown estão retornando para a fila. O SDR vê a fila reorganizar em tempo real. Um lead que estava no posição 12 às 08h agora está na posição 2 porque respondeu ao WhatsApp às 12h15. O sistema destaca esse lead em verde com o texto "respondeu há 15 minutos". Isso não é mágica — é realtime query no Supabase com atualização a cada 60 segundos.

Final de tarde (17h00): a fila de ligação está menor. Os leads que não responderam em 3 tentativas foram movidos para fila de WhatsApp — o SDR vê uma segunda lista: "Mensagens para enviar (12 leads)". Nenhum desses 12 vai tocar o telefone hoje. Vão receber uma mensagem personalizada. O SDR termina o turno com clareza absoluta: quantos conectou, quantos agendou, quantos estão em cooldown para amanhã. Sem lead perdido no ruído, sem fila infinita de nomes sem contexto.

A pergunta que você precisa responder antes de construir qualquer interface é essa: o SDR está tomando quantas decisões por hora agora? Se a resposta for mais de duas, o sistema está errado. O trabalho do SDR é ligar, qualificar e agendar. Qualquer decisão que ele tome sobre para quem ligar é decisão que o software falhou em tomar por ele.
