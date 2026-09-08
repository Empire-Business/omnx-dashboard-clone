# Ata da Reunião — Conselho dos Mestres

**Data:** 2026-06-27  
**Tema:** Redesign da fila de discagem SDR — de relatório para sistema operacional  
**Presidente:** Jeff Bezos  
**Membros presentes:** Alex Hormozi, Russell Brunson, Gary Vaynerchuk, Sandro San, Marcel Marcondes, Grant Cardone  

---

## Resumo do Problema

A aba de Discagem do CRM da Empire Business (React + Supabase) exibe leads em 3 buckets (ligue_agora / ligue_hoje / mensagem) mas funciona como um relatório — o SDR escolhe quem ligar. A empresa atua com mentoria de alto ticket; cada lead custa dinheiro de tráfego pago. O SDR precisa "bater o olho e saber o que fazer." Dados disponíveis: data_lead_recebido, 8 tentativas de contato, data_conectado, comunicações (ligações/WhatsApp/SMS) e discagem_scores com score/estado/razao.

---

## Rodada 1 — Diagnóstico

**Grant Cardone:** Dados não fecham venda, AÇÃO fecha. O problema é o SDR que pensa quando deveria ligar. Precisa de uma fila onde ele nunca para — 10X de discagens. A fortuna está no follow-up: 92% das vendas acontecem depois do quinto contato. As colunas data_tentativa_1 a 8 existem para empurrar o SDR de volta ao telefone, não para virar dashboard. Solução: volume massivo, cadência obrigatória, SDR sem momento de inércia.

**Alex Hormozi:** Confundiram "ter dados" com "ter decisão." O sistema coleta tudo mas não decide nada — transferiu a decisão para o operador. Uma fila, um motivo por linha. Score como valor esperado: prob_atender × prob_fechar × ticket ÷ minutos de esforço. Speed-to-lead bate volume todo dia da semana. Ordem proposta: lead recém-entrado → horário marcado → respondeu → score. Volume negociado, velocidade ganha.

**Sandro San:** Construíram relatório, não fila. Relatório informa. Fila manda. SDR vê: nome, motivo em uma linha, botão ligar. Score e histórico ficam no motor, invisíveis ao operador. SDR parado é o maior desperdício possível. O sistema decide a guerra; o SDR aperta o gatilho. Nunca terceirizar para o operador a decisão de quem ligar.

**Marcel Marcondes:** Erro de governança — a decisão de priorização não pertence ao operador. Speed-to-lead é a métrica que separa sistemas bons de ruins. Hierarquia proposta: horário marcado → lead novo com SLA → respondeu. O score ordena dentro da camada, nunca substitui a hierarquia temporal. Loop de feedback obrigatório: discou e não conectou → motor reordena imediatamente.

**Russell Brunson:** A fila atual é um funil quebrado com excesso de escolha. Hook = lead certo, Story = motivo claro, Offer = botão único. Cadência roteirizada: tentativa 1-2 telefone, 3-4 WhatsApp com valor diferente, 5-6 break-up. Estágio visível no card ("Tentativa 2 de 6 — use WhatsApp agora"). Ordem: horário marcado → respondeu recentemente → lead novo → score.

**Gary Vaynerchuk:** Linguagem humana no card é o que separa ferramenta de artefato. "Acabou de preencher, tá quente agora" vs timestamp frio — o SDR que lê o primeiro entra na ligação diferente. Contador motivacional ("4 de 12 hoje"), não opressivo. Uma tela, um card, um motivo. Empatia com o operador escala.

---

## Rodada 2 — Embates

**Grant** atacou o consenso de "card único": esconde a profundidade da fila, ensina preguiça. Cedeu no topo para speed-to-lead. Manteve contador de volume e follow-up roteirizado nas tentativas 4-8.

**Hormozi** atacou Grant: "10X cego é tanque furado — mais ligação do lead errado é mais desperdício mais rápido." Atacou o card único de Russell/Gary: "sem ver o backlog, SDR perde noção de urgência." Propôs "12 de 40 trabalhados hoje" como alternativa motivacional. Score financeiro por minuto como critério de ordenação dentro da camada.

**Sandro** atacou Grant: volume sem estratégia é desperdício x10. Lead de alto ticket custou dinheiro — queimar com ligação errada é prejuízo duplo. Concordou com Russell no diagnóstico de "funil quebrado." Horário marcado > lead novo: compromisso explícito bate velocidade. Sistema decide, SDR executa, ponto final.

**Marcel** propôs A/B test na hierarquia de camadas. Pediu loop de feedback imediato como requisito não-negociável. Atacou Grant: volume cego tem custo de oportunidade. Score deve ser medido em reais fechados por hora de SDR, não em ligações feitas.

**Russell** atacou Grant: "tentativa 1 e 8 com a mesma energia queima o lead." Cadência roteirizada com variação de canal é o diferencial. Card em Hook-Story-Offer: cronômetro é o Hook, estágio é a Story, botão é a Offer. Ligeiramente discordou de Marcel na ordem: "respondeu" sobe acima de "lead novo".

**Gary** atacou o número bruto na tela: "47 pendentes cria ansiedade, não performance." Concordou com Russell na cadência. Adicionou: linguagem do card muda como o SDR age — empatia com o operador não é detalhe, é adoção.

---

## Rodada 3 — Réplicas e Convergência

**Grant:** Aceitou speed-to-lead no topo. Manteve follow-up roteirizado (canal muda por tentativa) e contador de volume. Cedeu: lead novo SLA pode liderar o topo da fila.

**Hormozi:** Reconheceu cadência roteirizada do Russell e linguagem humana do Gary como válidos. Manteve score financeiro por minuto e cronômetro de speed-to-lead. Cedeu: contador motivacional (não opressivo), linguagem humana no card.

**Sandro:** Reconheceu loop de feedback do Marcel como o que "sustenta tudo o resto." Manteve linguagem humana e uma linha por card. Cedeu: cronômetro discreto na camada de lead novo.

**Marcel:** Reconheceu score financeiro do Hormozi como forma de tornar a hierarquia econômica, não teológica. Reconheceu Gary: linguagem humana = adoção. Manteve instrumentação desde o dia 1 e loop de feedback. Cedeu: A/B test só após semanas de dado limpo, não no dia 1.

**Russell:** Reconheceu cronômetro do Hormozi como Hook do card. Score financeiro como moeda, não enfeite. Propôs card em dois modos: lead novo = cronômetro lidera; follow-up = cadência lidera. Cedeu: speed-to-lead lidera o card na camada 3.

**Gary:** Reconheceu Hormozi: "valor esperado por minuto é o norte verdadeiro." Reconheceu Russell: estágio da cadência é contexto, não firula. Manteve linguagem humana como piso inegociável. Cedeu: contador motivacional vai para backlog v2.

---

## Decisão do Presidente

**Jeff Bezos** ouviu o debate completo e decidiu:

"Na Amazon, temos uma frase: 'Good intentions don't work, mechanisms do.' O problema desta fila não é falta de intenção dos SDRs — é a ausência de um mecanismo que retire a decisão do operador e a coloque no sistema."

**Decisão:** Construir fila em 4 camadas com score financeiro, card em linguagem humana e instrumentação desde o primeiro dia.

**Incorporado:**
- Hierarquia de 4 camadas: horário marcado → respondeu recentemente → lead novo no SLA → cadência roteirizada
- Score como valor esperado por minuto (Hormozi): ordena dentro da camada, nunca substitui
- Card em dois modos: lead novo = cronômetro; follow-up = estágio da cadência
- Linguagem humana: "Marcou retorno para agora", "Respondeu há 4 min", "Tentativa 3 — mande WhatsApp"
- Loop de feedback: não conectou → motor reordena em tempo real
- Instrumentação desde o dia 1: evento por linha servida com camada, score, resultado

**Descartado:**
- Contador de volume opressivo: "47 pendentes" gera ansiedade. Vai para backlog v2 como contador motivacional
- A/B test no dia 1: semanas de dado limpo primeiro
- Score visível para o SDR: motor usa, tela esconde

**Primeira ação (48h):** Detectar as 4 camadas com dados existentes e redesenhar card para mostrar nome + motivo em português + botão. Uma linha. Sem jargão.

---

## Encaminhamentos

- **Plano de ação completo:** [`plano_acao.md`](./plano_acao.md)
- **HTML visual:** [`index.html`](./index.html)
- **Decisão do presidente:** [`decisao-presidente.md`](./decisao-presidente.md)
