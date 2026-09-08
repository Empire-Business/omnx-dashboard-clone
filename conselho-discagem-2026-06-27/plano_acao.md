# Plano de Ação — Fila de Discagem SDR

**Data:** 2026-06-27  
**Presidente:** Jeff Bezos  
**Membros:** Alex Hormozi, Russell Brunson, Gary Vaynerchuk, Sandro San, Marcel Marcondes, Grant Cardone  
**Tema:** Redesign da aba de Discagem — de relatório para fila operacional

---

## Visão da Decisão

A aba de Discagem atual funciona como um relatório de leads: exibe informações, organiza por estado (ligue_agora / ligue_hoje / mensagem) e deixa o SDR decidir quem chamar. Esse é o problema central. Quando o operador decide a prioridade em tempo real, ele estrategiza onde deveria executar. O custo desse atrito é invisível mas constante: leads quentes esfriam enquanto o SDR pondera, e leads com horário marcado se perdem no meio da lista.

A decisão do conselho é construir uma **fila de 4 camadas ordenada pelo motor**, onde o sistema decide e o SDR executa o topo. O card de cada lead fala linguagem humana, indica o estágio da cadência e adapta seu destaque visual conforme a camada. Toda ação do SDR gera um evento que retroalimenta o motor em tempo real.

Essa mudança não é cosmética — é uma mudança de responsabilidade. A priorização sai da cabeça do operador e entra no código.

---

## Objetivos

**Macro:** SDR bate o olho na tela e sabe o que fazer — sem escolha, sem dúvida, sem fila vazia.

| Prazo | Objetivo |
|-------|----------|
| **30 dias** | Fila em 4 camadas em produção, card com linguagem humana, loop de feedback ativo |
| **60 dias** | Instrumentação completa (eventos por camada, taxa de conexão por camada, score calibrado) |
| **90 dias** | Primeira análise de dados → ajuste de hierarquia ou score se evidência justificar |

---

## Pilares de Ação

### Pilar 1 — Motor de Prioridade (Backend)

Reescrever a lógica que popula `discagem_scores` para implementar 4 camadas explícitas.

| Ação | Por que importa | Responsável | Prazo | Métrica |
|------|----------------|-------------|-------|---------|
| Definir campo de "horário de retorno marcado" no banco (coluna em `oportunidades` ou parsing de `comunicacoes`) | Camada 1 é impossível sem detectar compromisso explícito do lead | Dev backend | 48h | Campo preenchido em >90% dos leads com retorno marcado |
| Implementar detecção de "respondeu recentemente" (última mensagem inbound em comunicacoes < X min) | Camada 2 — mão levantada em tempo real | Dev backend | 48h | Lead com resposta recente aparece no topo em <30s após resposta |
| Implementar SLA de speed-to-lead (data_lead_recebido → agora, threshold configurável) | Camada 3 — lead novo esfria em minutos | Dev backend | 48h | Lead novo aparece no topo em <1 min após criação |
| Implementar detecção de camada de cadência por data_tentativa_N + regra de canal | Camada 4 — cadência roteirizada, não improviso | Dev backend | 72h | Score de cadência correto para 100% dos leads em follow-up |
| Score financeiro dentro de cada camada: prob_atender × prob_fechar × ticket ÷ minutos_esforço | Elimina sub-escolha dentro da camada (Hormozi) | Dev backend | 1 semana | Score correlacionado com taxa de conexão histórica |

### Pilar 2 — Card em Linguagem Humana (Frontend)

Redesenhar o card da DiscagemTab para comunicar a decisão do motor, não os dados brutos.

| Ação | Por que importa | Responsável | Prazo | Métrica |
|------|----------------|-------------|-------|---------|
| Card em modo "lead novo": cronômetro speed-to-lead em destaque + "Lead novo — ligue agora" | Lead novo precisa de urgência visual (Russell + Hormozi) | Dev frontend | 3 dias | SDR disca lead novo em <5 min após chegada |
| Card em modo "follow-up": estágio da cadência em destaque + canal sugerido ("Tentativa 3 — mande WhatsApp") | SDR não improvisa canal (Russell) | Dev frontend | 3 dias | Tentativas no canal certo aumentam 20%+ |
| Motivo em linguagem humana por camada: "Marcou retorno para agora" / "Respondeu há 4 min" / "Lead novo" / "Tentativa X de 6" | Card que não fala humano não é seguido (Gary) | Dev frontend | 3 dias | SDR não ignora fila (medido por % de toques no topo) |
| Botão único e visível: "Ligar" / "Enviar WhatsApp" / "Enviar SMS" conforme camada | Reduce tempo entre decisão do motor e ação do SDR | Dev frontend | 3 dias | Tempo entre abrir card e iniciar chamada < 10s |
| Tela nunca vazia: quando fila de alta prioridade zera, mostra próxima camada automaticamente | SDR parado é o maior desperdício (Sandro) | Dev frontend | 3 dias | Zero "telas vazias" em horário comercial |

### Pilar 3 — Loop de Feedback (Tempo Real)

O motor reordena a fila em resposta às ações do SDR.

| Ação | Por que importa | Responsável | Prazo | Métrica |
|------|----------------|-------------|-------|---------|
| "Discou — não conectou" → marca data_tentativa_N → motor reordena | Sem loop, fila vira foto, não filme (Marcel) | Dev backend | 1 semana | Reordenação em <5s após ação do SDR |
| "Lead atendeu" → remove da fila ativa | Evita religue desnecessário | Dev backend | 1 semana | Zero leads atendidos na fila |
| Polling/realtime na DiscagemTab (30s ou Supabase realtime) | Fila do SDR reflete estado atual, não estado de 30 min atrás | Dev frontend | 3 dias | Latência máxima da fila = 30s |

### Pilar 4 — Instrumentação (Desde o Dia 1)

Toda ação da fila gera evento. Sem instrumentação, não há aprendizado.

| Ação | Por que importa | Responsável | Prazo | Métrica |
|------|----------------|-------------|-------|---------|
| Log de evento por linha servida: camada, score, motivo, SDR, timestamp | Régua antes do experimento (Marcel) | Dev backend | Junto com deploy | 100% das ações logadas desde o primeiro dia |
| Dashboard de gestão (não do SDR): taxa de conexão por camada, tempo médio de resposta, leads por camada | Gestão enxerga o que o motor está fazendo | Dev frontend | 2 semanas | Gestor consegue auditar hierarquia sem pedir SQL |
| Alerta automático se camada 1 (horário marcado) ficar sem ação por >15 min | Horário marcado é compromisso com o lead — furar é dano de marca | Dev backend | 2 semanas | 0 violações de SLA de camada 1 |

### Pilar 5 — Cadência Roteirizada (Configuração)

As 6 tentativas têm canal e script definido — o SDR executa, não decide.

| Ação | Por que importa | Responsável | Prazo | Métrica |
|------|----------------|-------------|-------|---------|
| Definir cadência padrão: T1-T2 telefone, T3-T4 WhatsApp + valor, T5-T6 break-up | Tentativa 1 e 8 com mesma energia queima o lead (Russell + Grant) | Gestão comercial + Dev | 1 semana | Cadência documentada e implementada no motor |
| Card mostra script resumido por tentativa (1 linha) | SDR não inventa abordagem no calor do momento | Dev frontend | 2 semanas | Script seguido em >80% das tentativas |

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Campo de "horário de retorno" não existe no banco — leads marcam horário no WhatsApp em texto livre | Alta | Parser de mensagens + campo manual de confirmação pelo SDR; no curto prazo, camada 1 usa só campo customizado de oportunidade |
| SDR ignora a fila e continua escolhendo na mão | Média | Gestão monitora % de toques no topo da fila vs total de ligações; conversa de onboarding antes do deploy |
| Score financeiro requer dados de fechamento por lead — base pode ser pequena inicialmente | Média | Score começa simples (prob_atender baseado em camada + tentativa) e evolui com dados reais nas semanas seguintes |

---

## Próximo Passo Imediato (48h)

**Definir e implementar a detecção das 4 camadas na lógica do motor de `discagem_scores`**, usando dados já disponíveis:

1. **Camada 1** — `oportunidades` campo customizado de horário de retorno (ou parsing de última mensagem inbound com texto de hora)
2. **Camada 2** — `comunicacoes` WHERE direction='inbound' AND data_comunicacao > NOW() - INTERVAL '60 min'
3. **Camada 3** — `oportunidades.data_lead_recebido` > NOW() - INTERVAL configurável (ex: 30 min)
4. **Camada 4** — count de data_tentativa_N preenchidos → define T atual → define canal sugerido

O card da DiscagemTab passa a mostrar apenas: nome do lead, motivo em português, botão de ação. Uma linha, sem jargão.

---

## Backlog v2 (Não é MVP)

- Contador motivacional ("você tá voando hoje — X de Y leads trabalhados")
- A/B test da hierarquia de camadas com dado limpo (após 30 dias)
- Score financeiro calibrado com histórico real de fechamento
- Script completo por tentativa no card
