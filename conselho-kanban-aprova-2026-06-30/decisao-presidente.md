# Decisão do Presidente — Steve Jobs

## Data
2026-06-30

## Deliberação

O problema é claro: não sabemos, dentro da coluna de aprovação, se estamos aprovando roteiro ou edição. A solução não é criar mais colunas — isso só espaguetiza o Kanban. A solução é dar visibilidade ao substatus sem mexer na estrutura das colunas.

Três caminhos emergiram do conselho. O primeiro: tags visíveis de substatus no card, com ações manuais de aprovar e pedir revisão, começando apenas pela aprovação de roteiro. O segundo: aprovação via tags, mas com revisão automaticamente movendo o card para a coluna Ajustes. O terceiro: fluxo ainda mais enxuto, apenas a tag de "Roteiro em aprovação" e o botão de aprovar, deixando edição para o próximo ciclo.

**Vamos fazer o caminho 1, com a alma do 3.**

Tag visível no card: **"Roteiro em aprovação"**. Dois botões diretos no card: **"Aprovar roteiro"** e **"Pedir revisão"**. Ao aprovar, a tag vira **"Roteiro aprovado"** — o card não muda de coluna, mas agora todo mundo sabe que pode ir para edição. Ao pedir revisão, a tag vira **"Revisão solicitada"** e abre um campo de observação obrigatório — o card continua na mesma coluna, com a revisão documentada no próprio card. Nenhuma automação. Nenhuma coluna nova. Métricas por uma semana: tempo médio com cada tag, quantos pedidos de revisão, quantos aprovados de primeira. Depois disso, e só depois, discutimos aprovação de edição.

Isso incorpora o essencial de cada membro: a visibilidade e medição do Alex, o card fixo na coluna do Russell, a simplicidade radical do Gary, a tag + observação do Sandro, o foco em roteiro primeiro do Marcel, e os botões de ação direta do Grant. Descarta o que é inútil agora: automação prematura, mover o card para Ajustes automaticamente, substatus invisíveis e a tentação de fazer roteiro e edição ao mesmo tempo.

**Vamos fazer: tag visível de substatus + ações manuais no card, começando só com aprovação de roteiro, medindo por uma semana antes de qualquer automação ou expansão para edição.**
