# Decisão do Presidente — Jeff Bezos

**Presidente eleito: Jeff Bezos**, porque o problema é essencialmente de design operacional de sistema — transformar dados em decisão automatizada que escala com zero variância humana.

---

Três caminhos emergiram deste debate. O primeiro, defendido pelo Grant, é aumentar o volume: mais discagens, mais follow-up, SDR na trincheira. O segundo, proposto pelo Hormozi e Sandro, é uma fila única com hierarquia clara e score financeiro — o sistema decide, o humano executa. O terceiro, trazido pelo Russell e Gary, é adicionar camadas de contexto ao card: estágio da cadência, linguagem humana, countdown visual. Esses não são caminhos opostos — são uma hierarquia de problemas. Resolver volume sem resolver a fila é como aumentar o throughput de um armazém sem consertar o sistema de picking. Você trabalha mais e entrega menos.

Na Amazon, nós temos uma frase: "Good intentions don't work, mechanisms do." O problema desta aba de discagem não é falta de intenção dos SDRs. É a ausência de um mecanismo que retire a decisão do operador e a coloque no sistema. Quando o SDR olha para uma tela com 47 leads e precisa escolher quem ligar, ele não está executando — ele está estrategizando. E estratégia em tempo real, sem dados, por operadores treinados para fechar, é o maior desperdício desta operação.

**Minha decisão: Vamos construir a fila em camadas, com score financeiro, card em linguagem humana, e instrumentação desde o primeiro dia.**

Incorporo integralmente do debate:
- **Hierarquia de 4 camadas** (Sandro + Marcel + Russell): (1) horário marcado → (2) respondeu recentemente → (3) lead novo no SLA → (4) cadência roteirizada
- **Score como valor esperado por minuto** (Hormozi): prob_atender × prob_fechar × ticket ÷ esforço. Score ordena dentro da camada, nunca substitui a camada.
- **Card em dois modos** (Russell): lead novo = cronômetro speed-to-lead em destaque; follow-up = estágio da cadência em destaque ("Tentativa 3 de 6 — use WhatsApp agora")
- **Linguagem humana** (Gary): "Marcou retorno para agora", "Respondeu há 4 min", "Lead novo — ligue agora", "Tentativa 3 — mande WhatsApp". Nunca timestamps crus.
- **Loop de feedback** (Marcel): marcou "discado" e não conectou → motor reordena em tempo real
- **Instrumentação desde o dia 1** (Marcel): cada linha servida gera evento com camada, score, resultado. Régua primeiro, experimento depois.

Descarto:
- **Contador de volume opressivo** (Grant): "47 pendentes" na face do SDR gera ansiedade, não performance. O Grant tem razão que follow-up 4-8 é onde a fortuna mora — mas isso é resolvido pela hierarquia da camada 4, não por um placar. Contador motivacional entra na v2.
- **A/B test no dia 1** (Marcel): valioso como ferramenta, prematuro como requisito de lançamento. Semanas de dado limpo primeiro.
- **Score visível para o SDR** (Hormozi rodada 1): o motor usa, a tela esconde. SDR vê motivo em português, não número.

**Primeira ação nas próximas 48h:** Reescrever a lógica de ordenação do `discagem_scores` para implementar as 4 camadas com campos já existentes no banco (`comunicacoes` para detectar resposta recente, `oportunidades` para horário marcado via campo customizado, `data_lead_recebido` para SLA, `data_tentativa_N` para detectar camada de cadência). O card da DiscagemTab passa a exibir o motivo em linguagem humana gerado pelo motor — uma linha, um botão. Tela nunca vazia.

— Jeff Bezos
