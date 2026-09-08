# Plano de Ação — Dashboard Empire Analytics
**Baseado na decisão presidencial de 26/06/2026**

---

## 1. Visão da Decisão

O debate convergiu em diagnósticos corretos e divergiu em remédios. A decisão escolhe o caminho sequencial com urgência, porque produto bom não é produto rápido — é produto que não mente. Hoje esse produto mente em dois lugares: o filtro de campanha da Meta não funciona, e os filtros apresentam opções que não existem no período selecionado. Corrigir isso exige rigor antes de velocidade, porque uma integração de dados construída sobre `utm_campaign` com espaço extra ou capitalização inconsistente vai retornar zero resultados e destruir mais confiança do que a ausência da feature teria feito.

A hierarquia de prioridade é inegociável: dado confiável primeiro, estrutura de decisão segundo, experiência visual terceiro. Design bonito sobre dado suspeito não é refinamento — é acelerador de churn. O gestor que abre o painel e aplica o filtro de campanha Meta sem resposta não conclui "bug técnico". Ele conclui "esse produto não funciona" e abre o Ads Manager em outra aba. Quando cria o workaround, o produto deixou de existir como ferramenta de decisão. O que ficou é um relatório caro.

A execução começa pela validação do contrato de dados — comparar strings reais de `utm_campaign` nos dois lados antes de uma linha de código ser escrita. Essa regra de match é um ativo de governança, não um detalhe de implementação. Se ela mudar, todos os relatórios históricos mudam junto. Tratar como contrato documentado e versionado, não como variável de configuração. Somente com essa fundação estabelecida, o cruzamento no backend faz sentido, os filtros podem ser refatorados com honestidade, e o redesign visual terá dados sobre os quais pode construir hierarquia real.

---

## 2. Objetivo Macro

> **Transformar o dashboard em ferramenta de decisão confiável**, fechando o loop Meta-CRM com dado limpo, eliminando ruído nos filtros e auditando operações destrutivas — antes de qualquer refinamento visual.

### Objetivos Mensuráveis

| Horizonte | Objetivo | Métrica de Sucesso |
|-----------|----------|--------------------|
| **30 dias** | Filtro de campanha Meta funciona no painel de Tráfego sem quebrar cohort/produtividade | 100% das campanhas Meta aparece no dropdown com contagem correta para qualquer período selecionado |
| **60 dias** | Filtros dinâmicos por período ativos em todos os dropdowns, com dois estados (ativo/colapsado) | Zero campanhas com `count = 0` no estado padrão do dropdown; usuário encontra campanha relevante em menos de 5 segundos |
| **90 dias** | Toda operação destrutiva tem confirmação visível, log de auditoria e feedback explícito — e a tela principal exibe o número mais importante do dia em destaque radical | Zero operações de escrita sem estado intermediário, confirmação e log; gestor identifica KPI principal em menos de 3 segundos de abertura |

---

## 3. Pilares de Ação

---

### Pilar 1 — Filtros Meta (Dado Confiável)

**Por que vem primeiro:** sem dado confiável, qualquer melhoria nos outros pilares é cosmética. O filtro Meta quebrado é a proposta de valor falhando em tempo real.

---

**Acao 1.1 — Validar contrato de dados utm_campaign**

- **O que fazer:** Exportar amostra de 50 campanhas dos dois lados — tabela `meta_ads` e tabela `contatos` — e comparar strings de `utm_campaign` lado a lado. Documentar: existem diferenças de capitalização? Espaços extras? Acentos? Truncamentos? Registrar a regra de normalização que faz os dois lados coincidirem como documento em `docs/CONTRATO-MATCH-META-CRM.md`.
- **Por que importa:** cruzar dados no backend com strings inconsistentes retorna zero resultados sem erro — o pior tipo de bug, porque parece estar funcionando. Um espaço extra em "campanha X" destrói o JOIN silenciosamente.
- **Responsavel:** dev
- **Prazo:** Dias 1-2
- **Metrica de sucesso:** documento criado com exemplos reais de strings de ambos os lados, regra de normalização definida (ex: `LOWER(TRIM(utm_campaign))`), e confirmação de que pelo menos 80% das campanhas ativas tem match limpo antes de qualquer código ser escrito.

---

**Acao 1.2 — Implementar cruzamento Meta+CRM no backend**

- **O que fazer:** Criar função Supabase (RPC ou view materializada) que cruza `meta_ads_insights` com `oportunidades` via `utm_campaign` normalizado. A função deve receber `start_date`, `end_date` e retornar campanhas com métricas unificadas: investimento (Meta), leads gerados (CRM), MQLs (CRM), reunioes (CRM), fechamentos (CRM). Aplicar a regra de normalização do documento gerado na acao 1.1. Nunca fazer esse cruzamento no frontend.
- **Por que importa:** cruzamento no frontend cria inconsistência — o mesmo dado aparece diferente dependendo de onde o usuário olha. Backend como fonte única de verdade garante que cohort e produtividade continuam com a mesma lógica atual, apenas enriquecidos com dados Meta.
- **Responsavel:** dev
- **Prazo:** Dias 3-5
- **Metrica de sucesso:** RPC ou view retorna dados para pelo menos uma campanha Meta com métricas de ambos os lados preenchidas corretamente, validado contra planilha manual do gestor para o mesmo período.

---

**Acao 1.3 — Conectar cruzamento ao filtro do painel de Trafego**

- **O que fazer:** Substituir a query atual do hook `useTrafego` que filtra por campanhas cadastradas manualmente para usar a nova RPC/view. O filtro de campanha passa a usar `utm_campaign` normalizado como identificador — não o ID interno. Testar: selecionar campanha Meta no dropdown e confirmar que os números do funil (leads, MQLs, reunioes, fechamentos) correspondem à realidade do CRM para aquele período.
- **Por que importa:** o filtro que não responde à fonte principal de dados torna o produto redundante. Gestor que cria workaround (Ads Manager em outra aba) não volta.
- **Responsavel:** dev
- **Prazo:** Dias 6-7
- **Metrica de sucesso:** gestor seleciona qualquer campanha Meta ativa no dropdown e o funil atualiza com dados corretos. Zero divergencia entre o que o painel mostra e o que o gestor calcula manualmente na planilha.

---

### Pilar 2 — Filtros Ativos (Eliminar Ruido)

**Por que vem segundo:** depois que o dado esta certo, o filtro precisa ser honesto sobre o que existe no periodo. Mostrar 50 campanhas quando 3 sao relevantes e transferir trabalho de curadoria para o usuario — o oposto de produto com opiniao.

---

**Acao 2.1 — Implementar contagem de registros por item de filtro no periodo selecionado**

- **O que fazer:** Para cada dropdown (campanhas, origens, SDRs, funis), adicionar query que conta registros no periodo ativo antes de renderizar as opcoes. A query recebe `start_date` e `end_date` como parametros e retorna `{ value, label, count }` para cada opcao. Opcoes com `count = 0` recebem flag `inactive: true`.
- **Por que importa:** o filtro que exibe opcoes sem dado no periodo mente implicitamente — sugere que aquela campanha e relevante quando nao e. Esse e ruido, nao informacao.
- **Responsavel:** dev
- **Prazo:** Dias 8-9
- **Metrica de sucesso:** query retorna contagem correta para pelo menos os dropdowns de campanha e origem, validada contra contagem manual no Supabase para o mesmo periodo.

---

**Acao 2.2 — Implementar dois estados no dropdown (ativo visivel / inativo colapsado)**

- **O que fazer:** Refatorar o componente `MultiSelectFilter` para renderizar dois grupos: (1) itens com `count > 0` aparecem primeiro, com contagem visivel ao lado do label — ex: "Campanha X (47)"; (2) itens com `count = 0` ficam colapsados sob link "Ver mais (32 sem dado no periodo)". Clicar no link expande o segundo grupo sem redesenhar a tela. A selecao de item inativo continua funcionando — o usuario que precisa buscar uma campanha historica especifica consegue.
- **Por que importa:** esconder itens sem dado cria frustracao quando o usuario precisa buscar periodo historico. Hierarquizar com saida de emergencia respeita contexto e preserva acesso. E a diferenca entre produto com opiniao e produto arrogante.
- **Responsavel:** dev + designer (ou dev solo)
- **Prazo:** Dias 10-11
- **Metrica de sucesso:** usuario encontra campanha relevante para o periodo ativo em menos de 5 segundos sem scroll excessivo. Campanha historica de periodo anterior ainda acessivel via "Ver mais".

---

**Acao 2.3 — Aplicar filtro dinamico em todos os dropdowns do painel**

- **O que fazer:** Replicar o padrao dos dois estados para todos os dropdowns do painel de Trafego (origens, funis, SDRs) e, em sequencia, para os demais modulos que usam MultiSelectFilter. Nao criar logica diferente por modulo — usar o mesmo componente com a prop `periodCounts` recebendo os dados da query de contagem.
- **Por que importa:** consistencia de comportamento e confianca. Se um dropdown tem curadoria inteligente e outro nao, o usuario fica inseguro sobre o que o produto esta omitindo.
- **Responsavel:** dev
- **Prazo:** Dias 12-14
- **Metrica de sucesso:** zero dropdown em qualquer modulo exibe opcao com `count = 0` no estado padrao (sem o usuario ter clicado em "Ver mais").

---

### Pilar 3 — Seguranca e Auditoria (Operacoes Destrutiveis)

**Por que vem terceiro:** duas horas de trabalho. Nao precisa de sprint. O unico motivo para nao ter sido feito antes e ausencia de processo minimo — que muda agora.

---

**Acao 3.1 — Mapear todas as operacoes destrutivas do produto**

- **O que fazer:** Percorrer o codigo do frontend e listar cada componente que chama `.delete()`, `.update()` em dado critico, ou edge function destrutiva. Criar arquivo `docs/OPERACOES-DESTRUTIVEIS.md` com: nome da operacao, componente, tabela afetada, se tem confirmacao, se tem log, se tem feedback de erro. Esse documento e o inventario de divida de seguranca.
- **Por que importa:** nao da para proteger o que nao esta mapeado. O bug de limpeza de leads revelou que existem operacoes criticas sem camada de protecao — a questao e quantas outras.
- **Responsavel:** dev
- **Prazo:** Dia 15 (uma manha)
- **Metrica de sucesso:** documento criado com lista completa. Pelo menos 5 operacoes identificadas e classificadas por nivel de risco.

---

**Acao 3.2 — Implementar confirmacao explicita e feedback de resultado em todas as operacoes destrutiveis**

- **O que fazer:** Para cada operacao mapeada: (1) adicionar dialog de confirmacao com texto explicito — "Voce vai excluir X leads. Essa acao nao pode ser desfeita." com botao vermelho confirmando; (2) adicionar estado de loading visivel durante a operacao; (3) exibir toast de sucesso com detalhe do que foi feito, ou mensagem de erro legivel (nao "Something went wrong") se falhar. Usar o componente Sonner ja instalado para os toasts.
- **Por que importa:** operacao que falha em silencio nao e so um bug — e um treinamento. O usuario que ve silencio repetidamente para de confiar no feedback do sistema inteiro, incluindo das metricas. Erosao de confianca e mais perigosa que falha catastrofica porque e invisivel ate ser irreversivel.
- **Responsavel:** dev
- **Prazo:** Dias 15-16
- **Metrica de sucesso:** zero operacao destrutiva no produto executa sem confirmacao explicita e sem feedback de resultado (sucesso ou erro legivel).

---

**Acao 3.3 — Implementar log de auditoria para operacoes de escrita criticas**

- **O que fazer:** Criar tabela `audit_log` no Supabase com campos: `id`, `user_id`, `action` (ex: "delete_lead"), `table_name`, `record_id`, `payload_before` (JSONB), `created_at`. Adicionar trigger ou chamada explicita nas operacoes mapeadas para inserir registro antes de executar a operacao destrutiva. O log deve ser imutavel (sem UPDATE ou DELETE na propria tabela).
- **Por que importa:** quando um dado desaparece e alguem pergunta "o que aconteceu?", a resposta nao pode ser "nao sabemos". Log de auditoria transforma pergunta impossivel em pesquisa de 30 segundos.
- **Responsavel:** dev
- **Prazo:** Dias 17-18
- **Metrica de sucesso:** qualquer operacao destrutiva gera registro em `audit_log` com `user_id`, `action`, `record_id` e timestamp correto. Verificado via query direta no Supabase.

---

### Pilar 4 — Design e Hierarquia Visual (Uma Tela, Uma Mudanca)

**Por que vem por ultimo:** design sem dado confiavel e maquiagem. Hierarquia visual so tem base real quando o usuario confia nos numeros que esta olhando. Uma mudanca cirurgica agora — o redesign completo depois.

---

**Acao 4.1 — Sentar 30 minutos com o usuario e mapear a pergunta mais importante**

- **O que fazer:** Agendar conversa com o gestor que mais usa o produto. Fazer uma pergunta: "Quando voce abre esse dashboard de manha, qual e a primeira coisa que voce precisa saber?" Registrar a resposta exata, em palavras do usuario, nao em termos tecnicos. Identificar qual tela responde a essa pergunta e qual componente exibe o dado. Esse e o candidato a mudanca visual.
- **Por que importa:** hierarquia visual e consequencia de hierarquia de decisao. Sem saber qual e a decisao mais importante, qualquer refinamento e suposicao — e suposicao de designer e pior que ausencia de design porque cria falsa confianca.
- **Responsavel:** CEO ou product owner (nao o dev)
- **Prazo:** Dias 19-20
- **Metrica de sucesso:** uma frase documentada em `docs/PERGUNTA-PRINCIPAL-USUARIO.md` com a resposta do usuario e a tela/componente identificado.

---

**Acao 4.2 — Reposicionar o dado mais importante no topo com destaque radical**

- **O que fazer:** Na tela identificada na acao 4.1, mover o KPI que responde a pergunta principal do usuario para o topo absoluto da pagina. Aumentar o tamanho do numero para pelo menos 2.5x o tamanho atual. Remover qualquer elemento acima dele na hierarquia visual. Nao adicionar nada — so mover e aumentar. Uma mudanca. Nada mais.
- **Por que importa:** se o usuario abre o dashboard e precisa cacar o numero mais importante do dia, o produto falhou antes de qualquer hover state. Espazo e confianca. Dar espaco pro numero que importa e dizer ao usuario "eu sei o que voce precisa".
- **Responsavel:** dev (com ou sem designer)
- **Prazo:** Dias 20-21
- **Metrica de sucesso:** usuario abre o dashboard e identifica o numero principal em menos de 3 segundos, sem scroll, sem busca visual. Validado observando o usuario abrindo o produto pela primeira vez no dia.

---

**Acao 4.3 — Auditoria de hierarquia visual no modulo principal**

- **O que fazer:** Percorrer o modulo mais usado (provavelmente Trafego ou Pre-Vendas) e responder para cada elemento da tela: "qual decisao esse elemento apoia?" Elementos que nao tem resposta clara saem ou ficam colapsados por padrao. Elementos que suportam decisoes secundarias perdem destaque visual (tamanho, cor, peso). Nao redesenhar — auditar e reduzir.
- **Por que importa:** tudo gritando ao mesmo tempo e nada comunicando. Hierarquia e remover, nao adicionar. O produto provavelmente tem 12 elementos disputando atencao quando 3 sao suficientes para a decisao principal.
- **Responsavel:** dev + designer (ou so dev)
- **Prazo:** Dias 22-25
- **Metrica de sucesso:** para cada tela do modulo auditado, e possivel apontar imediatamente o elemento principal, dois elementos de suporte e um proximo passo. Verificado pedindo para o gestor apontar o elemento principal sem orientacao.

---

## 4. Riscos e Mitigacoes

---

**Risco 1 — utm_campaign chega inconsistente nos dois lados e o cruzamento retorna poucos matches**

- **Probabilidade:** alta. Sistemas distintos (Meta API e GHL webhook) nunca foram desenhados para falar a mesma lingua.
- **Impacto:** o cruzamento no backend retorna dados parciais ou zero, criando falsa impressao de que campanhas Meta nao geram leads.
- **Mitigacao:** a acao 1.1 e obrigatoria e nao pode ser pulada. Se a taxa de match for abaixo de 70% apos normalizacao, escalar o problema antes de prosseguir — pode ser necessario criar tabela de mapeamento manual `meta_campaign_aliases` com chave de relacionamento explicita para campanhas que divergem nos dois sistemas. Documento de contrato de dados e o artefato que previne esse cenario de escalar em producao.

---

**Risco 2 — Filtro dinamico por periodo adiciona latencia perceptivel ao dropdown**

- **Probabilidade:** media. Query de contagem adicional por dropdown pode adicionar 200-500ms dependendo do volume de dados.
- **Impacto:** dropdown parece lento, usuario clica varias vezes, experiencia piora em vez de melhorar.
- **Mitigacao:** (1) fazer a query de contagem junto com a query principal do modulo, nao como chamada separada ao abrir o dropdown; (2) memoizar o resultado de contagem enquanto o periodo nao mudar; (3) se latencia persistir, usar skeleton loader no dropdown enquanto contagens carregam — melhor esperar com feedback do que ter dropdown vazio ou com dados desatualizados.

---

**Risco 3 — Equipe de um dev nao consegue executar os quatro pilares sem degradar qualidade**

- **Probabilidade:** alta em execucao paralela, baixa em execucao sequencial.
- **Impacto:** pilares executados em paralelo resultam em codigo com bugs, retrabalho e mais divida tecnica.
- **Mitigacao:** a sequencia definida neste plano nao e sugestao — e restricao de dependencia. Pilar 2 (filtros) depende de Pilar 1 (dado certo). Pilar 4 (design) depende de Pilar 1 (confianca no dado). Pilar 3 (auditoria) e o unico independente e pode comecar qualquer dia, mas nao deve competir com Pilar 1. Regra operacional: um pilar ativo por vez. Entrega de Pilar 1 completa (acao 1.3 validada) antes de comecar Pilar 2.

---

## 5. Proxima Acao Imediata (24-48 horas)

**O que fazer agora, antes de qualquer codigo:**

Abrir o Supabase e executar duas queries:

```sql
-- Lado CRM: amostra de utm_campaign dos ultimos 30 dias
SELECT DISTINCT utm_campaign, COUNT(*) as leads
FROM contatos
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND utm_campaign IS NOT NULL
GROUP BY utm_campaign
ORDER BY leads DESC
LIMIT 50;

-- Lado Meta: amostra de campaign_name dos ultimos 30 dias
SELECT DISTINCT campaign_name, SUM(spend) as investimento
FROM meta_ads_insights
WHERE date_start >= CURRENT_DATE - 30
  AND campaign_name IS NOT NULL
GROUP BY campaign_name
ORDER BY investimento DESC
LIMIT 50;
```

Exportar os dois resultados para uma planilha. Criar coluna de match manual: para cada campanha Meta, encontrar (ou nao encontrar) o equivalente exato no CRM. Registrar o padrao da divergencia — e maiuscula/minuscula? Espaco? Prefixo diferente? Abreviacao?

Essa planilha e o contrato de dados. Sem ela, o cruzamento no backend e uma aposta. Com ela, e uma implementacao com resultado previsivel.

**Tempo estimado:** 2 horas.

**Criterio de avanco:** se o match manual for maior que 80%, seguir para acao 1.2 com normalizacao via `LOWER(TRIM())`. Se for menor, documentar o padrao de divergencia e criar tabela de aliases antes de qualquer cruzamento automatico.

---

*Plano elaborado em 26/06/2026. Revisao em 30 dias ou ao concluir Pilar 1.*
