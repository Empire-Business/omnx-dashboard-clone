# 01 — Visão do Produto: Empire CRM

> **O que este documento cobre:** Por que construir o Empire CRM, para quem ele é feito, quais problemas resolve, e como saberemos se foi um sucesso.

---

## 1. Por que construir um CRM próprio?

### 1.1 O contexto atual

A Empire Business hoje opera com uma combinação de ferramentas:

1. **GHL (GoHighLevel)** — CRM americano que gerencia contatos, oportunidades, pipelines, formulários e comunicações
2. **Supabase (eb-dash2)** — Banco de dados próprio com um dashboard analítico customizado, que foi construído *justamente porque* o GHL não fornecia os dados e painéis necessários

Esta dupla dependência cria problemas reais:

**Problema 1: Dois sistemas, dados duplicados**
Os dados ficam espalhados: alguns no GHL, alguns no Supabase, alguns nos dois. Quando você quer saber "quantos MQLs conectaram essa semana?", você precisa que o GHL envie o webhook, o Supabase processe, e o eb-dash2 exiba — são 3 sistemas trabalhando juntos que podem falhar em qualquer ponto.

**Problema 2: O GHL não foi feito para o nosso modelo**
O conceito de "MQL por tag" (não por pipeline) é algo que inventamos como workaround. O conceito de "cohort vs produtividade" como modo de análise não existe no GHL. O Lead Quality Score que calculamos não existe no GHL. Estamos sempre "hackeando" uma ferramenta que não foi projetada para o que fazemos.

**Problema 3: Custo em dólar com câmbio volátil**
O GHL cobra em dólar. Com o câmbio oscilando, o custo pode aumentar significativamente de um mês para o outro, sem que você tenha mudado nada.

**Problema 4: Sem WhatsApp nativo de qualidade**
A integração do GHL com WhatsApp é limitada. Não temos controle completo sobre as conversas, templates, ou automações via WhatsApp.

**Problema 5: Dependência de terceiro para mudanças**
Quer mudar um campo? Depende do GHL. Quer adicionar uma métrica nova? Depende do eb-dash2. Quer criar um novo tipo de automação? Depende do GHL. O ritmo de desenvolvimento fica travado por ferramentas externas.

### 1.2 A visão do Empire CRM

> **O Empire CRM é o único sistema que a Empire Business precisará para gerir leads, comunicações, vendas e análises — construído especificamente para o nosso modelo de negócio, com total controle e customização.**

Em termos simples: imagine que hoje você usa uma casa alugada (GHL) que não pode reformar. O Empire CRM é a casa própria — construída do jeito que você quer, que você pode reformar quando quiser, e que não tem aluguel crescendo mês a mês.

---

## 2. Personas — Para quem estamos construindo

Uma **persona** é uma descrição de um tipo de usuário real que vai usar o sistema. Entender as personas é fundamental para tomar boas decisões de design.

### Persona 1: Karina — a SDR

**Quem é:** Karina tem 24 anos, trabalha como SDR (Pré-Vendas) há 1 ano. Ela não tem formação técnica. Usa o computador principalmente para trabalhar no CRM e no WhatsApp.

**O que ela faz no dia a dia:**
- Abre o sistema de manhã e vê quantos novos leads chegaram
- Entra em contato com os leads pelo WhatsApp ou telefone
- Registra tentativas de contato (tentativa 1, 2, 3...)
- Quando conecta com o lead, qualifica ele (é MQL?) e agenda uma reunião
- Atualiza o status do lead no pipeline

**O que ela precisa do sistema:**
- Ver seus leads rapidamente, sem precisar de filtros complicados
- Enviar WhatsApp diretamente do CRM, sem precisar abrir outro app
- Registrar uma tentativa de contato com 1 clique
- Ver o histórico de conversas com o lead em um lugar só
- Receber notificação quando um novo lead chega

**Frustrações com o sistema atual (GHL):**
- O GHL é lento e confuso
- Às vezes o WhatsApp desconecta e ela não percebe
- Não consegue ver o histórico completo do lead em uma tela só
- Tem que alternar entre o GHL e o WhatsApp Web

**O que tornaria seu dia muito melhor:**
- Caixa de entrada unificada: todos os leads que precisam de atenção hoje, em uma tela
- Enviar WhatsApp, anotar tentativa e mover de stage com 3 cliques
- Notificação sonora quando lead novo chega

---

### Persona 2: Rafael — o Closer

**Quem é:** Rafael tem 28 anos, é closer (vendedor) senior. Faz reuniões de vendas o dia todo. Usa bem o computador, mas não é técnico.

**O que ele faz no dia a dia:**
- Verifica a agenda de reuniões do dia
- Antes da reunião, lê o histórico do lead (mensagens, qualificação, contexto)
- Conduz reunião de venda (geralmente via Zoom ou presencial)
- Registra resultado (fechou? perdeu? qual motivo?)
- Preenche os dados financeiros do contrato (valor de entrada, parcelas)
- Acompanha leads em negociação

**O que ele precisa do sistema:**
- Visualizar claramente o pipeline de vendas (quem está em qual etapa)
- Acessar o histórico completo de um lead antes da reunião
- Registrar dados do contrato de forma rápida
- Ver seu próprio desempenho (quantas reuniões, quantos fechamentos, taxa de conversão)

**Frustrações com o sistema atual:**
- Os dados do contrato ficam espalhados em campos confusos no GHL
- Não tem uma visão clara do seu próprio pipeline
- Fica dependendo do time de tráfego para saber se o lead é "bom"

---

### Persona 3: Mariana — a Gestora de Tráfego

**Quem é:** Mariana tem 30 anos, gerencia as campanhas de anúncios (Meta Ads, Google). É analítica, tem domínio de Excel/planilhas, não é desenvolvedora mas entende bem de dados.

**O que ela faz no dia a dia:**
- Verifica diariamente o gasto com anúncios e o resultado (CPMQL, ROAS)
- Compara performance entre campanhas, criativos e públicos
- Decide onde aumentar ou diminuir orçamento
- Analisa quais criativos estão gerando os melhores leads (não só cliques — leads que compram)

**O que ela precisa do sistema:**
- Painel de Tráfego com: investimento, MQLs, CPMQL, ROAS
- Filtro por campanha, criativo, público
- Visão de funil: Lead → MQL → Agendado → Reunião → Venda
- Dados do dia atual (não pode esperar o relatório de amanhã)
- Análise cohort: "Os leads que chegaram em março — quantos viraram venda?"

**Frustrações com o sistema atual:**
- Precisa cruzar dados do Meta Ads Manager com o eb-dash2 manualmente
- Nem sempre sabe se um lead que "fechou" veio realmente do anúncio que ela rodou
- O painel às vezes carrega lento

---

### Persona 4: Bruno — o CEO / Dono

**Quem é:** Bruno é o fundador da Empire Business. Tem visão estratégica, não opera o dia a dia, mas precisa entender os números rapidamente.

**O que ele precisa do sistema:**
- Uma tela de overview: faturamento, leads, MQLs, vendas — do mês atual
- Comparação com mês anterior
- Ver se as metas estão sendo batidas
- Entender o funil de conversão de ponta a ponta

**O que ele NÃO precisa:**
- Detalhes operacionais (quem ligou para quem, qual mensagem foi enviada)
- Configurações técnicas

---

## 3. Jobs-to-be-Done

O framework "Jobs-to-be-Done" descreve o que o usuário está tentando **fazer** (não o que quer de uma feature). É uma forma de entender o problema real por trás de um pedido.

| Persona | Quando... | Quero... | Para que... |
|---------|-----------|---------|------------|
| SDR | chego ao trabalho de manhã | ver imediatamente quais leads preciso contatar hoje | não perder nenhum lead quente |
| SDR | recebo um novo lead | ser notificada na hora | entrar em contato o mais rápido possível (velocidade = conversão) |
| SDR | vou enviar uma mensagem | poder fazer isso sem sair do CRM | não perder o contexto e poupar tempo |
| SDR | registro uma tentativa | fazer isso com 1 clique | não desperdiçar tempo em burocracia |
| Closer | tenho reunião em 10 minutos | ver todo o histórico do lead em 30 segundos | entrar preparado na reunião |
| Closer | fecho uma venda | registrar os dados do contrato agora | não perder a informação na correria |
| Gestor Tráfego | checo o desempenho do dia | ver CPMQL, ROAS e MQLs do dia atual | ajustar orçamento de campanha no mesmo dia |
| Gestor Tráfego | analiso um criativo | saber se os leads que ele gerou compraram | alocar budget nos criativos que realmente convertem |
| CEO | tenho reunião de resultado | ver o número de faturamento do mês em 1 tela | apresentar resultado sem precisar de planilha |
| CEO | comparo períodos | ver mês atual vs mês anterior | entender tendência |

---

## 4. Diferenciação vs GHL

Esta tabela mostra as diferenças entre o GHL e o que o Empire CRM propõe:

| Recurso | GHL | Empire CRM |
|---------|-----|-----------|
| **Custo** | Dólar, planos fixos, limite de usuários | Custo de infraestrutura (Supabase + Vercel) — escala linear |
| **Customização** | Limitada — você configura dentro do que eles permitem | Total — qualquer mudança pode ser implementada |
| **Analytics** | Básico, sem cohort/produtividade | Planejado — será desenvolvido em fase futura |
| **MQL por tag** | Não é um conceito nativo | Nativo — tag "MQL" classifica automaticamente |
| **Lead Quality Score** | Não existe | Planejado para fase futura |
| **WhatsApp** | Integração limitada, instável | UAZAPI + Oficial, com inbox unificado |
| **API** | Limitada, com rate limits rígidos | Ilimitada, sem restrições artificiais |
| **Webhooks** | Limitado por plano | Ilimitados, com log de entregas e retry |
| **Form Builder** | Sim, mas sem API de criação | Sim, com API completa para criação de lead via formulário externo |
| **Automações** | Sim, mas complexas e lentas | Sim, visuais e rápidas |
| **Multi-tenant** | Sim (agências) | Sim, por workspace |
| **Controle dos dados** | Dados no servidor deles | Dados 100% no nosso Supabase |
| **ActiveCampaign** | Integração superficial | Sync bidirecional completo |
| **Velocidade de mudança** | Dependemos do roadmap deles | Implementamos o que quiser, quando quiser |

---

## 5. Métricas de Sucesso do Produto

Como saberemos que o Empire CRM foi bem construído e está cumprindo seu papel?

### 5.1 Métricas de adoção (usabilidade)

| Métrica | Meta | Por que importa |
|---------|------|-----------------|
| % de leads criados via Empire CRM (vs GHL) | 100% em 6 meses | Indica migração completa |
| % de mensagens enviadas pelo CRM | >80% | SDRs usando o inbox nativo |
| Tempo médio para registrar tentativa de contato | <30 segundos | Eficiência operacional |
| NPS dos SDRs (satisfação com o sistema) | >7 | Adoção do time |

### 5.2 Métricas de integridade dos dados

| Métrica | Meta | Por que importa |
|---------|------|-----------------|
| % de leads com data_lead_recebido preenchida | 100% | Rastreamento correto de leads |
| % de leads com utm_source preenchido | >95% | Atribuição de tráfego |
| Latência do webhook (tempo até aparecer no CRM) | <5 segundos | Dados em tempo real |
| % de webhooks entregues com sucesso | >99.9% | Confiabilidade |

### 5.3 Métricas de negócio (impacto)

| Métrica | Meta | Por que importa |
|---------|------|-----------------|
| Redução de custo com ferramentas | >40% | ROI do projeto |
| Tempo gasto em relatórios manuais | Zero | Relatórios automatizados substituem planilhas |
| Leads "invisíveis" (sem pipeline_id, etc.) | Zero | Qualidade dos dados |

---

## 6. Fora de escopo (o que NÃO vamos construir)

Para manter o foco, estas funcionalidades ficam **explicitamente fora do escopo** do Empire CRM (ao menos inicialmente):

- **Integrações com Google Ads** (Fase 4+ ou nunca)
- **App mobile nativo** (iOS/Android) — o sistema será responsivo para uso mobile no browser
- **VoIP nativo** (ligar pelo sistema) — integramos com gravação, mas não discagem
- **Geração de contratos/documentos** — integra com DocuSign/OpenClaw via webhook
- **E-commerce** — não é um CRM para vendas recorrentes/produtos físicos
- **Chat ao vivo no site** (webchat) — Fase 3
- **Integração nativa com Calendly** — captura a reunião via webhook, mas o agendamento fica no Calendly

---

*Próximo: [02 — Arquitetura Técnica](./02-ARQUITETURA-TECNICA.md)*
