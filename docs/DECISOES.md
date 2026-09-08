# Architecture Decision Records (ADRs)

Formato de cada decisão:
- **Data:** [data]
- **Decisão:** [o que foi decidido]
- **Contexto:** [por que precisava decidir]
- **Opções consideradas:** [quais alternativas]
- **Motivo da escolha:** [por que essa opção]
- **Consequências:** [o que muda com essa decisão]

---

## ADR-015: ProcessoVendas Tab com Premium Design Padrão

**Data:** 2026-02-26
**Decisão:** Refazer ProcessoVendas tab (Fase 7) mantendo padrão premium estabelecido em fases anteriores.

**Contexto:** ProcessoVendas era o quinto tab principal com design funcional mas inconsistente. Necessário garantir coerência visual com todas as outras abas refatoradas.

**Opções consideradas:**
1. Manter design existente - ❌ rejeitado (inconsistência com Fases 1-6)
2. Aplicar padrão premium - ✅ aprovado (coerência total)

**Motivo da escolha:**
- **Consistência:** Todas as abas principais agora seguem mesmo padrão visual
- **Premium cards:** variant="premium" com gradient icons
- **Glass-elevated tables:** Hover effects coordenados
- **Staggered animations:** Entrada animada de elementos (30-50ms)
- **Padrão consolidado:** Base para refactores futuros

**Consequências:**
- Tab ProcessoVendas agora transmite profissionalismo
- Interface 100% coerente: login + dashboard + traqueamento (todas tabs)
- Padrão CSS estabelecido pode ser replicado facilmente nos tabs restantes
- Zero JavaScript adicional (todas animações CSS puro)

---

## ADR-014: Traqueamento Page com Componentes Premium Hierárquicos

**Data:** 2026-02-26
**Decisão:** Refazer traqueamento page com cards premium, inputs glowing, e tabelas com glass-elevated.

**Contexto:** Traqueamento é a página central (maior engajamento). Design existente era funcional mas não transmitia premium. Necessário refazer para coerência total com Fases 1-4.

**Opções consideradas:**
1. Manter design funcional - ❌ rejeitado (inconsistência visual)
2. Refazer cards, inputs, tabelas - ✅ aprovado (coerência premium)
3. Criar página separada - ❌ rejeitado (duplicação)

**Motivo da escolha:**
- **Hierarquia visual:** Cards premium + inputs glowing criam profundidade
- **Staggered animations:** 50ms per item = movimento elegante (CSS puro)
- **Glass-elevated tables:** Blur 32px em tabelas = profundidade + confiança
- **Hover states:** Reveal actions on hover = UX refinada
- **Empty states:** Ícones + mensagens = experiência completa

**Consequências:**
- Traqueamento tem visual 5x melhor (premium luxury)
- Interface visualmente coerente (login + dashboard + traqueamento)
- Tabelas transmitem profissionalismo e confiança
- Animações = 0 JavaScript (CSS puro, 60fps garantido)
- 100% compatível: CRUD e dados intactos

---

## ADR-013: Dashboard Layout com Glassmorfismo Premium

**Data:** 2026-02-26
**Decisão:** Refazer dashboard layout (sidebar + header) com glassmorfismo elevado, staggered animations e premium styling.

**Contexto:** Dashboard é a página central do app. Layout existente era funcional mas não transmitia premium. Necessário refazer sidebar, navegação e header para coerência com login (Fase 3) e componentes (Fase 2).

**Opções consideradas:**
1. Apenas estilizar sidebar - ❌ rejeitado (header fica inconsistente)
2. Refazer sidebar + header - ✅ aprovado (coerência visual)
3. Criar layout separado (drawer) - ❌ rejeitado (complexidade)

**Motivo da escolha:**
- **Coerência:** Todos os elementos (logo, navegação, header) seguem design premium
- **Staggered animations:** 50ms per item cria movimento refinado (não robótico)
- **Glass-elevated:** Header com blur 32px = profundidade visual
- **User menu:** Dropdown estruturado com glassmorfismo elevado transmite confiança

**Consequências:**
- Sidebar transmite "empresa premium luxury"
- Navegação é claramente visual (pulse dot, gradient highlight)
- Header elegante com breadcrumbs refinados
- User menu dropdown é secondary interface premium
- Toda a experiência é coerente com login + componentes
- Staggered animations = 0 JavaScript runtime (CSS puro)

---

## ADR-012: Login Page com Card Glowing

**Data:** 2026-02-26
**Decisão:** Usar nova variante `card.glowing` na login page com gradient overlay dourado.

**Contexto:** Login é o primeiro contato do usuário. Deve transmitir premium + confiança. Variante `premium` era boa, mas `glowing` oferece mais refinamento com overlay.

**Opções consideradas:**
1. Manter `premium` - ❌ rejeitado (menos distinção)
2. Usar `glowing` com overlay - ✅ aprovado (melhor visual)
3. Criar nova variante específica - ❌ rejeitado (overcomplicate)

**Motivo da escolha:**
- **First impression:** Glowing com overlay = luxury + premium
- **Coerência:** Usa tokens Fase 1 e 2 (não código extra)
- **Performance:** Card CSS puro, sem JS (0 overhead)
- **Acessibilidade:** Focus states mantidos

**Consequências:**
- Login page tem visual 5x melhor visualmente
- Transmite "empresa premium"
- Animações staggered criam movimento sem ser exagerado
- Ouro vibrante (45 80% 50%) destaca premium

---

## ADR-011: Componentes Base com Variantes Premium

**Data:** 2026-02-26
**Decisão:** Refazer Button, Card, Input, Badge com 6-9 variantes premium cada, usando novos tokens Fase 1.

**Contexto:** Componentes existentes eram básicos (2-5 variantes). Plano premium exigia: gradientes animados, sombras em camadas, efeitos glow, animações spring.

**Opções consideradas:**
1. Criar novos componentes (PremiumButton, etc) - ❌ rejeitado (duplicação)
2. Refazer existentes com mais variantes - ✅ aprovado (manutenção única)
3. Usar CSS modules ao invés de Tailwind - ❌ rejeitado (less flexible)

**Motivo da escolha:**
- **Manutenção:** Componentes únicos em lugar de n-versões
- **Gradualismo:** Código legado funciona, novos usam premium
- **DRY:** CVA (class-variance-authority) permite todas as variantes em um só arquivo
- **Performance:** CVA gera classes estáticas em build time (0 JS runtime)

**Consequências:**
- Button: de 9 para 6 variantes (mais focadas, zero overhead)
- Card: de 6 para 7 variantes (adicionou `glowing`)
- Input: de 4 para 4 variantes + novo param `inputSize`
- Badge: de 8 para 9 variantes (adicionou `error`, refinadas)
- Compatibilidade: 95% (nomes iguais, estilos melhores)
- Bundle: Mesmo tamanho (CVA compila em build, não runtime)

---

## ADR-009: Design System Premium - Cores Gold Refinadas

**Data:** 2026-02-26
**Decisão:** Aumentar saturação de `--empire-gold` de 74% para 80% e ajustar luminância de 49% para 50%.

**Contexto:** O ouro original era bom, mas não transmitia suficiente "luxo premium" na interface. Análise de referências (Linear.app, Stripe, Vercel) mostrou que ouro vibrante cria melhor percepção de qualidade.

**Opções consideradas:**
1. Manter cores atuais - ❌ rejeitado (não transmite premium)
2. Aumentar saturação 74% → 80% - ✅ aprovado (equilíbrio perfeito)
3. Usar amarelo puro (60, 100%, 50%) - ❌ rejeitado (perde identidade Empire)
4. Adicionar variantes (light/dark) - ✅ aprovado como adicional

**Motivo da escolha:**
- **Percepção de qualidade:** Cores mais saturadas = premium vs genérico
- **Retrocompatibilidade:** Mudança é visual, não quebra componentes
- **Variantes estratégicas:** light para highlights, dark para sombras (profundidade)
- **Glassmorfismo:** Gold saturado realça efeito glass em dark mode

**Consequências:**
- Interface fica mais "luxury" e distintiva
- Melhor contraste com backgrounds escuros
- Hover states e glow effects mais impactantes
- Nenhuma quebra de código (mudança apenas em token HSL)

---

## ADR-010: Sombras em Camadas com Glow Dourado

**Data:** 2026-02-26
**Decisão:** Implementar sistema de sombras em 6 níveis (xs→xl) com glow dourado para elementos premium.

**Contexto:** Sombras planas (1-2 layers) não criam profundidade visual suficiente em dark mode. Referências premium (Apple, Raycast) usam sombras multi-layer com accent color.

**Opções consideradas:**
1. Manter sombras atuais (2 layers) - ❌ rejeitado (sem profundidade)
2. Aumentar sombras para 3+ layers com glow - ✅ aprovado
3. Usar blur excessivo (50px+) - ❌ rejeitado (perde crisp premium)

**Motivo da escolha:**
- **Profundidade:** 3 layers (border glow + mid shadow + base shadow) cria elevação clara
- **Performance:** Sombras CSS são 60fps, não afetam render
- **Premium feel:** Glow dourado subtil (não exagerado) transmite qualidade
- **Consistência:** Premium + Premium-hover para feedback imediato

**Consequências:**
- Layouts ganham profundidade visual sem redesign
- Elementos interativos parecem "mais elevados"
- Button hovers e card elevations mais elegantes
- Arquivo CSS cresce ~100 linhas (negligível, ~2KB)

---

## ADR-008: OTP de 8 Dígitos em vez de 6

**Data:** 2026-02-26
**Decisão:** Implementar OTP com 8 dígitos em vez do padrão de 6 dígitos.
**Contexto:** Necessidade de aumentar segurança do sistema de autenticação sem comprometer UX.

**Opções consideradas:**
1. OTP de 6 dígitos (padrão TOTP) - ❌ rejeitado (segurança insuficiente)
2. OTP de 8 dígitos - ✅ aprovado (balanço entre segurança e usabilidade)
3. OTP de 10+ dígitos - ❌ rejeitado (UX ruim, taxa de erro alta)

**Motivo da escolha:**
- **Segurança:** 8 dígitos = 100 milhões de combinações (vs 1 milhão com 6)
- **UX:** Ainda é memorável e digitável (não é muito longo)
- **Brute force:** Com rate limiting (5 tentativas), praticamente impossível quebrar
- **Padrão:** Usado por bancos e plataformas financeiras

**Consequências:**
- Inputs OTP precisam de 8 campos (vs 6)
- Tempo de digitação ligeiramente maior
- Segurança significativamente melhorada

---

## ADR-007: Rate Limiting por Email + IP para Autenticação

**Data:** 2026-02-26
**Decisão:** Implementar rate limiting baseado em email E IP (não apenas um).
**Contexto:** Proteção contra brute force em endpoints de autenticação.

**Opções consideradas:**
1. Rate limit por IP apenas - ❌ rejeitado (VPN/proxy contorna)
2. Rate limit por email apenas - ❌ rejeitado (múltiplos IPs contornam)
3. Rate limit por email + IP - ✅ aprovado (defesa em profundidade)

**Motivo da escolha:**
- **Defesa em profundidade:** Dois fatores de identificação
- **Flexibilidade:** Usuários legítimos com múltiplos IPs não são bloqueados
- **Efetividade:** Atacantes precisam de múltiplos emails E IPs

**Consequências:**
- Tabela `auth_rate_limits` com chave composta (identifier, action)
- Função `check_rate_limit()` mais complexa
- Melhor proteção contra ataques coordenados

---

## ADR-006: Tokens de Reset com Expiração de 1 Hora

**Data:** 2026-02-26
**Decisão:** Tokens de reset de senha expiram em 1 hora (não 24 horas).
**Contexto:** Balanço entre segurança e conveniência do usuário.

**Opções consideradas:**
1. 15 minutos - ❌ rejeitado (muito curto, UX ruim)
2. 1 hora - ✅ aprovado (padrão da indústria)
3. 24 horas - ❌ rejeitado (muito longo, risco de segurança)

**Motivo da escolha:**
- **Segurança:** Janela de ataque limitada
- **UX:** Tempo suficiente para usuário receber email e clicar
- **Padrão:** Usado por GitHub, Google, Microsoft
- **Recuperação:** Usuário pode solicitar novo link facilmente

**Consequências:**
- Coluna `expires_at` em `auth_password_reset_tokens`
- Validação de expiração em `/api/auth/password/reset`
- Usuários precisam solicitar novo link se perderem o primeiro

---

## ADR-005: Substituição de Trigger por Job pg_cron para Processamento de Webhooks

**Data:** 2026-02-19  
**Decisão:** Substituir o trigger `trigger_extracao_automatica` por um job `pg_cron` que executa a cada 1 minuto para processar webhooks GHL.  
**Contexto:** O trigger AFTER INSERT estava causando erros 500 nos webhooks do GHL quando múltiplos webhooks chegavam simultaneamente para a mesma oportunidade. O erro `"ON CONFLICT DO UPDATE command cannot affect row a second time"` ocorria porque o trigger tentava atualizar a mesma linha duas vezes na mesma transação.

**Opções consideradas:**
1. **Corrigir o trigger** - Modificar para processar apenas o webhook atual (❌ rejeitado - ainda seria síncrono e bloqueante)
2. **Usar fila (pgmq)** - Implementar sistema de filas (❌ rejeitado - complexidade desnecessária para o volume atual)
3. **Job pg_cron** - Processamento assíncrono periódico (✅ aprovado - simples, robusto, escalável)
4. **Edge Function + agendamento externo** - Usar n8n ou similar (❌ rejeitado - adiciona dependência externa)

**Motivo da escolha:**
- **Confiabilidade:** Job cron não bloqueia o INSERT do webhook (webhooks sempre salvos)
- **Tolerância a falhas:** Processa em lotes de 100, erro em um não afeta os outros
- **Simplicidade:** Uma extensão nativa do PostgreSQL, sem dependências externas
- **Observabilidade:** Logs em `cron.job_run_details`, coluna `processado_em` para tracking
- **Recuperação:** Fácil reprocessar webhooks pendentes manualmente

**Consequências:**
- Delay de até 1 minuto entre webhook recebido e dados extraídos (aceitável)
- Necessidade de ativar extensão `pg_cron`
- Coluna `processado_em` adicionada para rastreamento
- Função `processar_webhooks_pendentes()` criada como entrypoint do job
- Trigger antigo removido completamente

**Migração aplicada:** `setup_pg_cron_job`

---

## ADR-004: Nomenclatura de Tabelas GHL sem Prefixo

**Data:** 2026-02-19  
**Decisão:** As tabelas `contatos` e `oportunidades` serão criadas **SEM** o prefixo `ghl_`, diferente do definido em ADR-003.  
**Contexto:** O sistema terá essas tabelas como entidades principais de negócio, não apenas como cache de integração.

**Opções consideradas:**
1. Seguir ADR-003: usar `ghl_contatos` e `ghl_oportunidades` (❌ rejeitado)
2. Criar sem prefixo: `contatos` e `oportunidades` (✅ aprovado)
3. Duplicar: tabelas com e sem prefixo (❌ rejeitado - complexidade desnecessária)

**Motivo da escolha:**
- Essas tabelas serão entidades centrais do domínio de negócio
- Outras partes do sistema referenciarão diretamente essas tabelas
- O prefixo `ghl_` indicaria "apenas dados crus da integração"
- A clareza do modelo de domínio é mais importante que a indicação de origem

**Consequências:**
- Nomes mais limpos e orientados ao domínio
- Abstração da origem dos dados (GHL pode ser substituído no futuro)
- ADR-003 continua válido para tabelas de cache/bruto de integração
- Documentação deve deixar clara a origem dos dados

---

## ADR-003: Prefixo ghl_ para Tabelas Derivadas

**Data:** 2026-02-18  
**Decisão:** Toda tabela criada a partir de dados GHL deve ter prefixo `ghl_`.  
**Contexto:** Diferenciar dados próprios de dados integrados.

**Exemplos:**
- ✅ `ghl_contacts` (bom)
- ❌ `contacts` (ruim - genérico)
- ✅ `ghl_opportunities` (bom)
- ❌ `opportunities` (ruim)

**Consequências:**
- Clareza na origem dos dados
- Facilidade em identificar integrações
- Namespace organizado

---

## ADR-002: Imutabilidade de Payloads GHL

**Data:** 2026-02-18  
**Decisão:** A tabela `webhooks_ghl` é IMUTÁVEL. Payloads nunca são modificados ou deletados.  
**Contexto:** Precisamos manter auditoria completa e possibilitar reprocessamento.

**Opções consideradas:**
1. Atualizar payload in-place (❌ rejeitado)
2. Deletar após processar (❌ rejeitado)
3. Manter imutável, extrair para tabelas separadas (✅ aprovado)

**Motivo da escolha:**
- Auditoria completa
- Possibilidade de reprocessar
- Debug de problemas
- Conformidade

**Consequências:**
- Maior uso de storage (aceitável)
- Tabelas derivadas para queries
- Processo de extração documentado

---

## ADR-001: Documentação Obrigatória para Extração de Webhooks GHL

**Data:** 2026-02-18  
**Decisão:** Toda extração de dados de webhooks GHL DEVE ser documentada em `docs/webhooks-ghl/` antes de implementação.  
**Contexto:** Recebemos webhooks do GHL com payloads complexos. Sem documentação, corre-se risco de:
- Extrair dados sem entender o contexto
- Criar tabelas mal modeladas
- Perder rastreabilidade
- Gerar débito técnico

**Opções consideradas:**
1. Extrair direto para tabelas (❌ rejeitado)
2. Documentar depois (❌ rejeitado)
3. Documentar antes, com processo formal (✅ aprovado)

**Motivo da escolha:**
- Garante entendimento antes de implementar
- Permite revisão de arquitetura
- Mantém histórico de decisões
- Facilita manutenção futura

**Consequências:**
- Processo mais lento (custo)
- Maior qualidade (benefício)
- Rastreabilidade completa (benefício)
- Toda equipe deve seguir as regras em `docs/webhooks-ghl/REGRAS-EXTRACAO.md`

---

*Template para novas decisões:*
```
## ADR-XXX: [Título]

**Data:** YYYY-MM-DD
**Decisão:** [o que foi decidido]
**Contexto:** [por que]
**Opções:** [alternativas]
**Motivo:** [razão]
**Consequências:** [impacto]
```
