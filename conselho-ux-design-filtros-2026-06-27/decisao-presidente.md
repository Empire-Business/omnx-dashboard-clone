# Decisão — Steve Jobs

O debate foi longo e a maioria dos pontos convergiu. Mas vocês continuam falando ao mesmo tempo e ninguém tomou a decisão. Esse é o trabalho do presidente. Então vou fazer isso agora.

**Os caminhos que emergiram**

Três caminhos distintos: o primeiro, do Hormozi e do Grant, é radical — corta tudo o que não é essencial, fecha o loop de dados Meta-CRM imediatamente, age com velocidade máxima. O segundo, do Russell e do Marcel, é sequencial e mais cuidadoso — mapeia primeiro o identificador de ligação, define a regra de match como governança, depois constrói em camadas. O terceiro, do Gary e do Sandro, é centrado no usuário — antes de qualquer código, senta com quem usa o produto e descobre a pergunta que ele faz toda manhã. Design, filtro e dado vêm como resposta a essa pergunta, não como feature.

**O que escolho e por quê**

Escolho o segundo caminho, mas com a urgência do primeiro. Aqui está o raciocínio: produto bom não é produto rápido. É produto que não mente. E esse produto hoje mente em dois lugares: o filtro de campanha da Meta não funciona, e os filtros mostram opções que não existem no período. Você não conserta isso com velocidade — conserta com rigor. O cruzamento Meta-CRM no backend só funciona se o `utm_campaign` chegar limpo nos dois lados. Se não mapear isso antes de codificar, você vai entregar uma integração que retorna zero resultados e todo mundo vai achar que é bug quando na verdade é string com espaço extra. Isso destrói mais confiança do que a ausência da feature. O Marcel e o Sandro foram os únicos que disseram isso com clareza. Estão certos.

**O que incorporo e o que descarto de cada membro**

Do Hormozi: a hierarquia visual como matemática de atenção é correta. Descarto a ideia de que você resolve isso sozinho, sem sentar com o usuário. Do Russell: o loop de dados como núcleo da proposta de valor. Descarto o framework de "herói, suporte, ação" — isso é linguagem de landing page, não de dashboard operacional. Do Gary: a frase "o produto foi construído para funcionar, não para ser usado" é a melhor do debate inteiro. Descarto o tom de urgência que ignora a qualidade do match de dados. Do Sandro: a pergunta sobre o identificador de ligação é obrigatória antes de qualquer linha de código. Do Marcel: os dois estados de filtro — ativos visíveis, inativos colapsados com saída de emergência — é a solução mais honesta com o usuário. Do Grant: a lista de operações destrutivas hoje, com confirmação e log, em dois turnos de trabalho. Isso não precisa de sprint.

**A decisão**

Esta semana, em ordem: primeiro, valida se `utm_campaign` chega idêntico no banco do CRM e na tabela de Meta Ads — compara strings reais, não assume. Documenta a regra de match e trata isso como contrato de dados, não detalhe de código. Segundo, com a regra validada, faz o cruzamento no backend. Terceiro, refatora o dropdown de filtros para dois estados: campanhas com dado no período selecionado aparecem com contagem; as sem dado ficam colapsadas sob "Ver mais". Quarto, lista toda operação destrutiva do produto e coloca confirmação explícita com log em cada uma — duas horas de trabalho, não um sprint. Quinto, e só quinto: senta trinta minutos com quem usa o produto, pergunta qual é a primeira coisa que ele quer saber ao abrir o dashboard, e reposiciona esse dado no topo da tela com destaque visual radical. Uma tela. Uma mudança. Nada mais.

O design sem dado confiável é cosmético. Dado sem clareza de uso é ruído. Os dois juntos, nessa ordem, são produto. Não tem atalho.
