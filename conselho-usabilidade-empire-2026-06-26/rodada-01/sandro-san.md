# Sandro San — Rodada 1: Diagnóstico

A causa raiz não é a sidebar, não é o header e não é o seletor de apps. O problema é que vocês estão construindo uma ferramenta como se ainda estivessem vendendo feature. Configurar apps dentro de um app específico é como guardar a chave mestra da casa dentro de uma das gavetas do quarto — funciona até o dia que você precisa mudar a fechadura e fica preso dentro do cômodo. O Sistema faz isso: empilha camadas de complexidade e te faz acreditar que dependência é normal. Não é. Dashboard é estrutura, é plataforma, é o terreno onde os apps são construídos. Terreno não mora dentro da casa. Faz sentido para você?

A maior oportunidade que está passando na sua frente é transformar esse Empire de uma coleção de módulos em um sistema operacional de negócio. Hoje o usuário entra e sente que está lidando com vários apps disputando atenção. O dono do negócio não quer ser gerente de software — ele quer soberania sobre os dados, os times e os processos. Quando você separa o que é plataforma do que é contexto, o dashboard deixa de ser uma ferramenta e vira ativo: o cara olha para aquilo e vê que ele é dono do território, não dependente da lógica que outro programador inventou.

Minha primeira prioridade é cirúrgica: tire as configurações globais — usuários, apps, permissões — do interior de qualquer app e coloque-as em um espaço próprio, acessível de qualquer ponto do dashboard com um padrão claro. Depois, defina regra de ouro: cada app cuida só do seu território. Navegação e identidade global ficam acima; dados, ações e filtros ficam dentro. Parece óbvio, mas o óbvio é o que mais morre no meio do caminho quando a equipe está ocupada demais respondendo demanda para perceber que está construindo a própria confusão.

Pense grande,
Sandro San
