# Conselho dos Mestres — Rodada 1: Diagnóstico
## Marcel Marcondes

> Tese: crescimento sem disciplina é sorte. KPIs claros, foco em poucos objetivos.

---

### 1. Causa raiz

Bruno, deixa eu ser direto com você, porque acho que o problema aqui não é técnico — é de arquitetura de decisão. O seu sistema cresceu por acréscimo. Você tinha um app, virou oito, e a cada novo módulo você empilhou mais uma camada de controle: workspace_apps, app_role_permissions, app_user_overrides. Cada uma delas foi uma resposta certa para uma pergunta pontual. O problema é que ninguém parou para perguntar qual é o modelo mental único que governa tudo isso. Quando você como CEO olha e diz "não entendi nada", não é porque você é leigo em tecnologia. É porque não existe um modelo conceitual claro por baixo — e se não existe na cabeça de quem construiu, não vai existir na tela. Interface confusa é quase sempre o sintoma visível de uma falta de disciplina conceitual lá atrás.

A segunda raiz, que é a que mais me incomoda, é que essas três tabelas controlam o ACESSO AO APP, mas não controlam o que aparece DENTRO dele. Isso significa que você tem um sistema de permissão que responde "sim ou não, esse cara entra nessa porta", mas não responde "o que esse cara vê depois que entrou". Para um negócio que vive de dados sensíveis — pré-vendas, faturamento, performance de SDR —, essa é uma lacuna que vai te morder. Não é organização de tela: é governança de informação mal definida.

### 2. Oportunidade

Aqui está a parte boa, e eu sempre gosto de olhar pelo lado da oportunidade. Você ainda está cedo o suficiente para não ter sofrido um incidente sério, e tem um sistema que JÁ funciona. Isso é ouro. A maioria das empresas só resolve permissão depois que vazou um relatório ou que um vendedor viu o salário do outro. Você tem a chance rara de impor disciplina antes do caos, não depois. A oportunidade real não é "deixar a tela mais bonita" — é transformar permissão em um ativo de governança que escala com a empresa. Quando você define isso com clareza, cada novo app, cada nova contratação, cada novo nível hierárquico entra num trilho que já existe. Você para de tomar decisão caso a caso e passa a operar por princípio. Isso é o que separa empresa que cresce por sorte de empresa que cresce por método.

E tem um ganho de tempo concreto: o seu objetivo declarado é que o admin gerencie sozinho, sem suporte técnico. Isso só acontece quando o modelo é simples o suficiente para caber na cabeça de uma pessoa não-técnica. Se você acertar a fundação conceitual, a economia de horas do seu único dev ao longo de um ano é enorme — ele para de ser o gargalo de toda mudança de permissão.

### 3. Primeiro conselho

Meu primeiro conselho é contraintuitivo: não comece pela tela. Antes de tocar em qualquer React, você senta e desenha em uma folha de papel o modelo de permissão em UMA frase que um leigo entenda. Algo como: "cada PESSOA tem um PAPEL, cada papel vê um conjunto de APPS, e dentro de cada app vê um conjunto de VISÕES." Se você não consegue dizer isso em uma frase limpa, a tela nunca vai ser clara — porque a confusão está no conceito, não no código. Foco em poucos objetivos: o objetivo desta rodada não é construir nada, é definir o modelo. Um só.

Na prática, eu faria três coisas nesta semana. Primeiro, listar os papéis reais que existem na sua operação hoje — não os teóricos, os reais: admin, gestor de pré-vendas, SDR, closer, e por aí. Provavelmente são cinco ou seis, não vinte. Segundo, para cada papel, definir em uma linha o que ele PRECISA ver para fazer o trabalho dele — e o que ele não pode ver. Terceiro, e esse é o KPI desta fase: medir quantos cliques e quanto tempo um admin leva hoje para dar permissão a um novo funcionário. Anote esse número. Esse é o seu baseline. Toda a reforma que vier depois tem que reduzir esse número de forma medível, senão foi estética e não disciplina. Sem métrica de antes, você nunca vai saber se melhorou de verdade ou se só trocou uma confusão por outra mais bonita.
