# Decisão do Presidente — Steve Jobs

**Tema:** Visibilidade e acessibilidade do painel de administração
**Data:** 2026-06-27

---

O debate foi produtivo, mas produziu complexidade desnecessária em cima de um problema simples. A maioria dos membros chegou perto da resposta, mas nenhum chegou até o fim. O problema não é técnico. É um problema de arrogância de produto — alguém construiu a funcionalidade e assumiu que o usuário ia descobrir. Isso é o oposto de design.

O consenso de "duas camadas" está certo, mas pelos motivos errados. Não são duas camadas porque existem dois perfis de usuário. São duas camadas porque existem dois contextos: o contexto de trabalho operacional (dentro de um app, executando uma tarefa) e o contexto de configuração de plataforma (fora dos apps, definindo a estrutura). Confundir esses dois contextos é o erro de base. A sidebar de um app é contexto operacional. Não deve ter link de admin — isso polui o espaço de trabalho com preocupações de governança. O AppHub é contexto neutro — está entre apps, é o lugar natural para o ponto de entrada de configuração.

A decisão é: um único ponto de entrada global no header, presente em qualquer tela, com label visível — não um ícone ambíguo de usuário, mas um ícone de engrenagem com a palavra "Admin" ao lado, visível somente para admins e owners. E um card de configuração destacado no AppHub para o primeiro acesso. Só isso. Não sidebar, não onboarding em múltiplas etapas, não cor diferenciada que grita amadorismo. O ícone de engrenagem é uma linguagem universal. Qualquer admin no mundo sabe o que significa.

A sidebar continua operacional, sem contaminação de links de admin. O AppHub ganha um estado claro para o admin com apps não configurados — não um popup irritante, mas um estado permanente e elegante do card "Configurar Workspace". Quando todos os apps estiverem configurados, o card ainda existe mas em modo secundário. Visibilidade constante, não onboarding pontual.

O que descarto: cor diferenciada no botão (não — é poluição visual sem ganho funcional), sequência de onboarding guiado (não — admin não é lead, não precisa de funil), sidebar inferior com links de admin (não — polui o contexto operacional dos SDRs quando não são admin e cria assimetria visual).

Vamos fazer isto: ícone de engrenagem com label "Admin" no header para admins, card "Configurar Workspace" no AppHub, e mais nada. Dois toques. Descoberto em menos de 5 segundos por qualquer admin novo. Invisível para quem não precisa ver.
