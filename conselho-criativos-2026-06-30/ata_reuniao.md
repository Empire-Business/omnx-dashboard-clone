# Ata da Reunião — Conselho dos Mestres

**Tema:** Tornar o app de Criativos autossuficiente, rápido e independente do Notion
**Data:** 30/06/2026
**Presidente:** Steve Jobs
**Membros presentes:** Alex Hormozi, Russell Brunson, Gary Vaynerchuk, Sandro San, Marcel Marcondes, Grant Cardone

---

## 1. Resumo do problema

O usuário tem o projeto GHL-SUPABASE, um dashboard Empire (React + Vite + Supabase) com um sub-app de Criativos recém-criado. Hoje, os criativos de tráfego pago e orgânico (~948 registros) são gerenciados no Notion e sincronizados para a tabela `notion_creatives` via edge function. O app está lento e dependente do Notion. O usuário quer que o app seja autossuficiente: criar/subir criativos direto no app, ter estatísticas e dashboard próprio, sem perder dados antigos e sem depender do Notion.

---

## 2. Rodada 1 — Diagnóstico

### Alex Hormozi
A causa raiz não é o Notion; é o desrespeito pelo ativo criativo. Criativo é a ponta da lança da oferta, e viver no Notion diz que isso é secundário. A maior oportunidade é transformar os 948 criativos em um banco de dados de ângulos, ganchos, promessas e ofertas testadas. Prioridade: congelar o Notion, migrar os 948 uma única vez e desenhar o fluxo ideia → produção → teste → decisão.

### Russell Brunson
O problema é gerenciar criativos como planilha de estoque em vez de um funil de produção de winners. 12 status no Kanban sem critério de passar ou morrer é decoração. A oportunidade é transformar o app no "Creative Funnel" que decide automaticamente quais criativos escalam. Prioridade: desenhar 4 decisões binárias antes de montar o Kanban.

### Gary Vaynerchuk
A causa raiz é construir o negócio de criativos em cima de uma ferramenta de anotações. Notion é aluguel, não ativo. A oportunidade é velocidade de iteração: testar mais, decidir mais rápido, reaprender em ciclos curtos. Prioridade: migrar os 948 sem perder histórico, ativar app nativo imediatamente e descartar Notion como fonte de verdade.

### Sandro San
A causa raiz é delegar a alma do tráfego para um caderno digital que não foi feito para isso. A maior oportunidade é transformar o app no cérebro que decide teste, aprovação e reprovação. Prioridade: transição cirúrgica — migrar 948 como histórico imutável, cortar sincronização como fonte primária no mesmo dia e lançar criação nativa.

### Marcel Marcondes
A causa raiz é escalar a operação de criativos sem escalar a governança. 948 registros são 948 decisões de investimento. A oportunidade é transformar o app na fonte única de verdade do processo criativo, com histórico, critérios de teste e decisão. Prioridade: migrar com histórico intacto e definir 3-4 KPIs antes da próxima feature.

### Grant Cardone
A causa raiz é falta de comprometimento total — ainda de aluguel no Notion. A oportunidade é transformar o departamento de criativos numa máquina de velocidade e decisão, escalando volume de testes 10x. Prioridade: cortar o cordão umbilical com o Notion em uma única jogada, migrar 948, construir criação/editar, kanban e painel de testes.

---

## 3. Rodada 2 — Embates

**Alex Hormozi** rebateu Russell: funil binário só funciona se cada card carregar a pergunta "qual hipótese de oferta esse criativo está testando?". E rebateu Gary: velocidade sem critério queima dinheiro mais rápido. Defendeu metadados de oferta obrigatórios antes de automatizar.

**Russell Brunson** reforçou que dados sem decisão viram museu. Concordou com Alex que metadados de oferta são a gasolina do funil, mas não abriu mão da lógica do Creative Funnel com decisões automáticas.

**Gary Vaynerchuk** concordou com a ação de cortar o Notion, mas discordou de Hormozi: criativo é atenção, não só ângulo de oferta. E alertou Marcel sobre a "KPI-trap" — medir demais e fazer de menos.

**Sandro San** questionou Russell: funil elaborado sem decisão firme é procrastinação. Contestou Grant: corte cirúrgico, não heróico. Reforçou Marcel: KPIs sem dono viram decoração.

**Marcel Marcondes** rebateu Grant: ação sem estrutura gera dívida. Calibrou Gary: velocidade precisa de critério. Defendeu KPIs com dono e cadência.

**Grant Cardone** reforçou corte total, alertou Russell (funil vira burocracia sem volume) e rebateu Marcel (receita financia estrutura; ação primeiro).

---

## 4. Rodada 3 — Réplicas e convergência

**Alex Hormozi** reconheceu Russell e Sandro: dados sem decisão viram museu, e corte sem cérebro é tolice. Não abriu mão de metadados de oferta como unidade central. Cedeu em migrar os 948 como legado sem metadados completos, desde que a estrutura seja obrigatória para novos/editados.

**Russell Brunson** reconheceu Alex: funil sem metadados não decide. Não abriu mão do Creative Funnel com decisões automáticas. Cedeu em simplificar para 2 portões binários iniciais (spend mínimo + CTR).

**Gary Vaynerchuk** reconheceu Russell: dados sem decisão viram museu. Não abriu mão de cortar o Notion como fonte de verdade e manter velocidade/atenção. Cedeu em aceitar funil binário + KPIs enxutos sem burocracia.

**Sandro San** reconheceu Marcel: KPIs sem dono viram decoração. Não abriu mão da soberania total. Cedeu em aceitar funil enxuto de 2-3 portões com gatilho automático e dono definido.

**Marcel Marcondes** reconheceu Russell e Alex com ressalvas. Não abriu mão de migrar 948 como histórico imutável, definir 3-4 KPIs com dono e app como fonte única com RLS. Cedeu na velocidade do corte, aceitando corte em duas etapas.

**Grant Cardone** reconheceu Russell. Não abriu mão do corte total e migração imediata. Cedeu em aceitar gatilhos automáticos como fase 2, com prazo curto e dono.

---

## 5. Decisão do presidente

**Steve Jobs** elegeu o caminho da transição cirúrgica, mas sem hesitação.

> "Vamos fazer um app de Criativos nativo, autossuficiente e soberano."

Decisão:
1. Congelar o Notion como fonte de verdade agora.
2. Migrar os 948 registros como legado histórico imutável.
3. Construir experiência mínima de criação/edição de criativos, com metadados de oferta obrigatórios.
4. Desligar a sincronização com o Notion assim que o app nativo permitir criar, editar e listar criativos sem perda de dados.
5. Em seguida, adicionar o Creative Funnel enxuto com 2 portões automáticos (spend mínimo + CTR) e um dashboard próprio de estatísticas.

---

## 6. Encaminhamentos

- Plano de ação completo: [`plano_acao.md`](./plano_acao.md)
- Versão visual do plano: [`index.html`](./index.html)
- Próximo passo imediato: Matheus congela o Notion e comunica o time; Tech Lead inicia migration de `source` e metadados de oferta.
