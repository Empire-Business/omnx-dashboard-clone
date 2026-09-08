# 18 — Multi-Tenancy: Múltiplas Empresas no Mesmo CRM

> **O que este documento cobre:** Como o Empire CRM suporta múltiplas empresas no mesmo sistema sem misturar dados — workspace lifecycle, planos e limites, isolamento por RLS, API keys com escopos, webhook signature, audit log, rate limiting e portabilidade de dados.

---

## O que é multi-tenancy? (explicação simples)

**Pense num prédio de apartamentos.**

- O prédio é o sistema Empire CRM — uma única infraestrutura, um único banco de dados.
- Cada apartamento é um **workspace** — o espaço isolado de uma empresa.
- Os moradores são os usuários daquela empresa.
- O porteiro é o **Row Level Security (RLS)** — garante que nenhum morador entre no apartamento errado, mesmo que tente.

O morador do apartamento 301 nunca vê o que tem no 302. Mesmo que ambos usem o mesmo elevador (mesma infra), os dados são completamente separados.

---

## Índice

1. [O Workspace como unidade central](#1-o-workspace-como-unidade-central)
2. [Ciclo de vida de um workspace](#2-ciclo-de-vida-de-um-workspace)
3. [Planos e limites](#3-planos-e-limites)
4. [Isolamento de dados: workspace_id + RLS](#4-isolamento-de-dados-workspace_id--rls)
5. [Roles e permissões](#5-roles-e-permissões)
6. [Workspace switching](#6-workspace-switching)
7. [API Keys com escopos](#7-api-keys-com-escopos)
8. [Webhook signature por workspace](#8-webhook-signature-por-workspace)
9. [Audit log](#9-audit-log)
10. [Rate limiting por workspace](#10-rate-limiting-por-workspace)
11. [Portabilidade e exclusão de dados](#11-portabilidade-e-exclusão-de-dados)
12. [Critérios de aceite](#12-critérios-de-aceite)

---

## 1. O Workspace como unidade central

Um **workspace** representa uma empresa (ou equipe autônoma) dentro do Empire CRM. Tudo no sistema pertence a um workspace — não existe dado "solto" fora de um.

### O que um workspace contém

| Recurso | Isolado por workspace? |
|---------|----------------------|
| Contatos e oportunidades | ✅ Sim |
| Pipelines e stages | ✅ Sim |
| Comunicações (inbox) | ✅ Sim |
| Formulários | ✅ Sim |
| Automações | ✅ Sim |
| Metas | ✅ Sim |
| API Keys | ✅ Sim |
| Webhooks de saída | ✅ Sim |
| Usuários / membros | ✅ Sim (via `workspace_members`) |
| Integrações (WhatsApp, Meta Ads) | ✅ Sim |
| Arquivos e gravações | ✅ Sim |

### Campos da tabela `workspaces`

```
workspaces
  id                       UUID (chave primária)
  nome                     TEXT — "Empire Business"
  slug                     TEXT UNIQUE — "empire-business" (usado em URLs)
  plano                    TEXT — 'free' | 'pro' | 'enterprise'
  status                   TEXT — 'active' | 'trial' | 'suspended' | 'deleted'
  timezone                 TEXT — padrão 'America/Sao_Paulo'
  logo_url                 TEXT — URL do logo da empresa
  whatsapp_default_instance TEXT — instância UAZAPI padrão
  pipeline_default_id      UUID — pipeline padrão para novos leads
  trial_ends_at            TIMESTAMPTZ — quando o trial expira (se aplicável)
  created_at               TIMESTAMPTZ
  updated_at               TIMESTAMPTZ
```

---

## 2. Ciclo de vida de um workspace

### 2.1 Criação (signup de nova empresa)

```
Fluxo de cadastro:

1. Responsável da empresa acessa /signup
2. Preenche: nome da empresa, seu email, senha
3. Sistema cria:
   - Registro em auth.users (Supabase Auth)
   - Registro em workspaces (nome, slug, plano='trial')
   - Registro em workspace_members (role='owner', status='active')
4. Redireciona para o onboarding
```

**Regra:** o primeiro usuário de um workspace sempre recebe o role `owner`. Não é possível criar um workspace sem owner.

### 2.2 Onboarding (wizard de configuração)

Após criar o workspace, um wizard guia o owner pelos passos iniciais:

```
Passo 1 — Configurações básicas
  • Nome do workspace (editável)
  • Timezone
  • Upload de logo

Passo 2 — Primeiro pipeline
  • Nome do pipeline (ex: "Pré-Vendas")
  • Stages padrão sugeridos (editáveis)

Passo 3 — Convidar time
  • Emails dos SDRs e closers
  • Role de cada um

Passo 4 — Integração WhatsApp
  • Configurar instância UAZAPI ou API Oficial
  • (pode pular para depois)

Passo 5 — Pronto
  • Resumo do que foi configurado
  • Link para o painel principal
```

### 2.3 Estados de um workspace

```
trial ──────► active ──────► suspended ──────► deleted
  │                              ▲
  │                              │
  └──── (trial expirou) ─────────┘
```

| Estado | O que significa | O que acontece |
|--------|----------------|----------------|
| `trial` | Período gratuito de avaliação | Acesso completo por N dias |
| `active` | Plano pago ativo | Acesso normal |
| `suspended` | Pagamento em atraso ou violação | Somente leitura; sem envio de mensagens |
| `deleted` | Workspace excluído pelo owner | Dados retidos por 30 dias, depois apagados permanentemente |

### 2.4 Suspensão

Quando um workspace é suspenso:
- Todos os usuários ainda conseguem **logar e ver** os dados (somente leitura)
- **Não** é possível criar/editar contatos, enviar mensagens, disparar automações
- Owner recebe email de aviso com link para regularizar
- Após 30 dias suspenso sem regularização → workspace marcado como `deleted`

### 2.5 Transferência de ownership

```
Configurações → Workspace → Transferir ownership

1. Owner atual informa email do novo owner
2. Novo owner deve ser membro ativo do workspace
3. Email de confirmação enviado para o novo owner
4. Novo owner confirma → role atualizado automaticamente
5. Owner anterior vira Admin (não é removido do workspace)
```

**Regra:** um workspace nunca pode ficar sem owner. A transferência só é concluída após a confirmação do novo owner.

### 2.6 Exclusão de workspace

```
Configurações → Workspace → Excluir workspace

1. Somente o Owner pode excluir
2. Sistema exige digitar o slug do workspace para confirmar
3. Workspace marcado como status='deleted' (soft delete)
4. Dados ficam retidos por 30 dias (possibilidade de recuperação)
5. Após 30 dias: job de limpeza remove todos os dados permanentemente
```

---

## 3. Planos e limites

O Empire CRM oferece três planos. Cada workspace está em um plano e sofre as restrições correspondentes.

| Limite | Free | Pro | Enterprise |
|--------|------|-----|------------|
| **Usuários (membros)** | 3 | 15 | Ilimitado |
| **Contatos ativos** | 1.000 | 25.000 | Ilimitado |
| **Mensagens WhatsApp/mês** | 500 | 10.000 | Ilimitado |
| **Formulários** | 2 | 20 | Ilimitado |
| **Pipelines** | 2 | 10 | Ilimitado |
| **Automações ativas** | 0 | 10 | Ilimitado |
| **Webhooks de saída** | 2 | 20 | Ilimitado |
| **API calls/mês** | 10.000 | 500.000 | Ilimitado |
| **Integrações** | WhatsApp | WhatsApp + Meta Ads | Todas |
| **Analytics** | *(deferido para fase futura)* | *(deferido)* | *(deferido)* |
| **Reuniões (Video Meet)** | 0 | 100/mês | Ilimitado |
| **Audit log** | ✗ | 90 dias | 1 ano |
| **Exportação de dados** | ✗ | ✅ | ✅ |
| **SLA de suporte** | Comunidade | Email 48h | Email 8h + chat |

### Como os limites são aplicados

- **Hard limits** (bloqueiam a ação): usuários, formulários, pipelines, automações, webhooks
- **Soft limits** (alertam mas não bloqueiam imediatamente): contatos, mensagens, API calls
- Quando um soft limit é atingido: banner de aviso no sistema + email para o owner
- Quando um soft limit ultrapassa 120% do limite: bloqueio automático + email urgente

---

## 4. Isolamento de dados: workspace_id + RLS

### 4.1 A regra de ouro

**Toda tabela de negócio tem `workspace_id UUID NOT NULL`.**

Isso significa que cada linha de dados está explicitamente vinculada a um workspace. Não existe contato, oportunidade, mensagem, formulário, automação ou meta "órfão" sem dono.

### 4.2 Duas camadas de proteção

```
Camada 1 (código): toda query filtra por workspace_id explicitamente
  → ex: .eq('workspace_id', currentWorkspaceId)

Camada 2 (banco): RLS garante que mesmo se o código falhar, o banco bloqueia
  → políticas PostgreSQL verificam workspace_id antes de retornar qualquer linha
```

Nunca depender só de uma camada. Se o código esquecer o filtro, o RLS é a última barreira. Se o RLS estiver mal configurado, o filtro no código ainda protege.

### 4.3 Políticas RLS obrigatórias

O padrão para **todas** as tabelas de negócio:

```sql
-- Habilitar RLS (obrigatório em toda tabela)
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

-- Policy de leitura: usuário vê só dados do seu workspace
CREATE POLICY "<tabela>_read" ON <tabela>
  FOR SELECT TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Policy de escrita: usuário escreve só no seu workspace
CREATE POLICY "<tabela>_write" ON <tabela>
  FOR INSERT TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Policy de atualização
CREATE POLICY "<tabela>_update" ON <tabela>
  FOR UPDATE TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Policy de exclusão (mais restrita — somente owner/admin)
CREATE POLICY "<tabela>_delete" ON <tabela>
  FOR DELETE TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
        AND status = 'active'
        AND role IN ('owner', 'admin')
    )
  );
```

### 4.4 Tabelas que precisam de política especial

| Tabela | Observação |
|--------|-----------|
| `workspaces` | Owner pode editar; outros membros só leitura |
| `workspace_members` | Owner/Admin gerenciam; membros veem a lista |
| `api_keys` | Somente Owner/Admin criam e revogam |
| `audit_log` | Somente leitura para todos; escrita somente via service role |
| `webhooks_raw` | Imutável — somente inserção via service role, nenhuma atualização/deleção |

### 4.5 Service role vs. authenticated role

- **`authenticated`**: o usuário logado. Sujeito a todas as políticas RLS.
- **`service_role`**: usado apenas pelas Edge Functions do backend. Bypassa RLS. **Nunca expor a chave service_role no frontend.**

Edge Functions usam `service_role` para operações que precisam cruzar workspaces (ex: job de limpeza de workspaces deletados) ou operar sem usuário logado (ex: webhook recebido de sistema externo).

---

## 5. Roles e permissões

Documentado em detalhe em [`14-CONTROLE-ACESSO.md`](./14-CONTROLE-ACESSO.md).

**Resumo dos 6 roles:**

| Role | Acesso |
|------|--------|
| **Owner** | Tudo, incluindo billing e exclusão do workspace |
| **Admin** | Tudo, exceto billing |
| **Gerente** | Ver todos os dados, configurar pipelines e formulários |
| **SDR** | Seus leads, mensagens, sem configurações |
| **Closer** | Seus deals no pipeline de vendas |
| **Viewer** | Somente leitura |

---

## 6. Workspace switching

Um usuário pode ser membro de **múltiplos workspaces** (ex: freelancer que atende duas empresas, ou gestor que supervisiona dois times). O sistema precisa suportar isso sem exigir múltiplos emails.

### 6.1 Como funciona

- Um `auth.users` pode ter N registros em `workspace_members` (um por workspace)
- O **workspace ativo** é armazenado no `localStorage` do navegador como `empire_active_workspace`
- Toda query usa o `workspace_id` do workspace ativo

### 6.2 Seletor de workspace na UI

```
┌─────────────────────────────────────────────┐
│  [Logo Empire Business ▾]  João Silva       │
│  ─────────────────────────────────────────   │
│  ✓ Empire Business          (Owner)         │
│    Consultoria XYZ          (Admin)          │
│    Startup ABC              (SDR)            │
│  ─────────────────────────────────────────   │
│  + Criar novo workspace                     │
│    Aceitar convite pendente (1)              │
└─────────────────────────────────────────────┘
```

- Seletor fica no canto superior esquerdo da sidebar
- Trocar de workspace recarrega toda a aplicação com o novo contexto
- Se há convite pendente, aparece badge numérico

### 6.3 Fluxo de aceitar convite

```
1. Admin envia convite para email@empresa.com com role SDR
2. Sistema cria workspace_members com status='invited'
3. Email enviado com link único válido por 7 dias
4. Destinatário clica no link:
   a. Se não tem conta → criar conta (email já pré-preenchido)
   b. Se já tem conta → fazer login
5. Status muda para 'active'
6. Workspace aparece no seletor
```

---

## 7. API Keys com escopos

API Keys permitem que sistemas externos (Hotmart, checkout, outros sistemas) interajam com o Empire CRM programaticamente. Cada key pertence a um workspace e tem escopos que limitam o que ela pode fazer.

### 7.1 Estrutura da tabela `api_keys`

```
api_keys
  id              UUID
  workspace_id    UUID — a qual workspace pertence
  nome            TEXT — "Integração Hotmart"
  key_hash        TEXT — hash SHA-256 da key (nunca armazenar a key em plain text)
  key_prefix      TEXT — primeiros 8 chars para identificação — "emp_live_"
  scopes          TEXT[] — lista de escopos autorizados
  status          TEXT — 'active' | 'revoked'
  expires_at      TIMESTAMPTZ — NULL = sem expiração
  last_used_at    TIMESTAMPTZ
  created_by      UUID — quem criou
  created_at      TIMESTAMPTZ
```

### 7.2 Formato da key

```
emp_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
│   │    └─────────────────────────────── 32 chars aleatórios
│   └──────────────────────────────────── ambiente: live | test
└──────────────────────────────────────── prefixo fixo
```

A key é exibida **uma única vez** no momento da criação. Depois, o sistema armazena apenas o hash.

### 7.3 Escopos disponíveis

| Escopo | O que permite |
|--------|--------------|
| `contacts:read` | Listar e buscar contatos |
| `contacts:write` | Criar e atualizar contatos |
| `opportunities:read` | Listar oportunidades |
| `opportunities:write` | Criar e atualizar oportunidades |
| `messages:read` | Listar comunicações |
| `messages:write` | Enviar mensagens |
| `forms:submit` | Submeter formulários (para embeds externos) |
| `webhooks:manage` | Criar e gerenciar webhooks de saída |
| `analytics:read` | Acessar dados analíticos via API (fase futura) |
| `*` (wildcard) | Acesso total — somente para Owner, com atenção |

### 7.4 Validação da key nas Edge Functions

```
Toda requisição com API key:
1. Extrai o header: Authorization: Bearer emp_live_xxxxx
2. Calcula SHA-256 da key recebida
3. Busca em api_keys WHERE key_hash = $hash AND status = 'active' AND workspace_id = $wid
4. Verifica se o escopo necessário está em api_keys.scopes
5. Atualiza last_used_at
6. Injeta workspace_id no contexto da requisição
```

---

## 8. Webhook signature por workspace

Quando um sistema externo (Hotmart, OpenClaw, checkout) envia um webhook para o Empire CRM, precisamos garantir que:
1. O payload realmente veio do sistema esperado (autenticidade)
2. O payload pertence ao workspace correto (isolamento)

### 8.1 Como funciona

Cada workspace que recebe webhooks externos tem um **webhook secret** — uma string aleatória de 32 bytes, única por workspace.

```
Fluxo de recebimento de webhook:

1. Sistema externo assina o payload com o secret do workspace:
   signature = HMAC-SHA256(secret, payload_body)
   Header: X-Empire-Signature: sha256=<hex>

2. Edge Function recebe o webhook:
   a. Extrai workspace_id da URL: /webhook/contrato-assinado?wid=<uuid>
   b. Busca o secret no banco pelo workspace_id
   c. Recalcula a assinatura com o mesmo payload
   d. Compara usando comparação em tempo constante (evita timing attacks)
   e. Se não bater → rejeita com 401

3. Payload salvo em webhooks_raw (imutável)
4. Processamento acontece de forma assíncrona
```

### 8.2 Estrutura do secret

```
webhook_secrets
  id              UUID
  workspace_id    UUID UNIQUE — um secret por workspace
  secret_hash     TEXT — hash do secret (não armazenar plain text)
  created_at      TIMESTAMPTZ
  rotated_at      TIMESTAMPTZ — quando foi rotacionado pela última vez
```

O secret é exibido **uma única vez** na criação. O owner pode rotacionar a qualquer momento — o antigo é invalidado imediatamente.

---

## 9. Audit log

O audit log registra **quem fez o quê e quando** dentro do workspace. É essencial para rastrear ações críticas e para compliance.

### 9.1 Por que na Fase 2 (não Fase 4)

O audit log precisa estar presente desde cedo porque:
- Workspaces com múltiplos usuários precisam de rastreabilidade desde o dia 1
- Ações irreversíveis (exclusão de contato, revogação de API key) precisam de rastro
- Clientes enterprise exigem auditoria como requisito de contratação

### 9.2 Tabela `audit_log`

```sql
CREATE TABLE audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  user_id      UUID REFERENCES auth.users(id),  -- NULL se foi ação de sistema
  user_email   TEXT,                             -- snapshot do email no momento
  action       TEXT NOT NULL,                   -- ex: 'contact.deleted'
  resource     TEXT NOT NULL,                   -- ex: 'contact'
  resource_id  UUID,                            -- ID do registro afetado
  metadata     JSONB DEFAULT '{}',              -- dados adicionais (ex: valores antes/depois)
  ip_address   INET,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_workspace ON audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_user      ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_resource  ON audit_log(resource, resource_id);
```

> **RLS do audit_log:** somente leitura para usuários autenticados do workspace. Escrita exclusiva via `service_role` (nunca pelo frontend diretamente).

### 9.3 Ações obrigatórias de registrar

| Categoria | Ações |
|-----------|-------|
| **Autenticação** | Login, logout, troca de workspace |
| **Membros** | Convite enviado, convite aceito, membro removido, role alterado |
| **Dados críticos** | Contato deletado, oportunidade deletada, pipeline deletado |
| **Segurança** | API key criada, API key revogada, webhook secret rotacionado |
| **Workspace** | Configurações alteradas, plano alterado, ownership transferido, workspace suspenso/excluído |
| **Automações** | Automação ativada/desativada, workflow editado |

### 9.4 Retenção por plano

| Plano | Retenção do audit log |
|-------|-----------------------|
| Free | Não inclui |
| Pro | 90 dias |
| Enterprise | 1 ano |

---

## 10. Rate limiting por workspace

Rate limiting protege o sistema de uso abusivo e garante que um workspace com alto volume não prejudique outros.

### 10.1 Limites por plano

| Endpoint | Free | Pro | Enterprise |
|----------|------|-----|------------|
| **API REST** (geral) | 100 req/min | 1.000 req/min | 10.000 req/min |
| **Envio de mensagens** | 10 msg/min | 100 msg/min | 1.000 msg/min |
| **Webhooks recebidos** | 50 req/min | 500 req/min | ilimitado |
| **Edge Functions** | 200 req/min | 2.000 req/min | 20.000 req/min |

### 10.2 Como aplicar

O rate limiting é aplicado na camada de Edge Function, usando uma combinação de `workspace_id` + `endpoint` como chave:

```
Chave do rate limit: workspace:<workspace_id>:endpoint:<nome>
Janela: 60 segundos (sliding window)
Storage: Upstash Redis (ou pg_cron + tabela de contadores)
```

Quando o limite é atingido:
- HTTP `429 Too Many Requests`
- Header `Retry-After: <segundos>` indicando quando tentar novamente
- Evento registrado no audit log

---

## 11. Portabilidade e exclusão de dados

Todo workspace tem o direito de exportar seus dados ou excluir tudo.

### 11.1 Exportação de dados

Disponível para planos Pro e Enterprise.

```
Configurações → Workspace → Exportar dados

Formatos disponíveis:
  • Contatos e oportunidades → CSV
  • Comunicações → CSV
  • Formulários (estrutura + submissões) → JSON
  • Automações (estrutura) → JSON
  • Todos os dados → ZIP com múltiplos arquivos

Processo:
1. Owner/Admin solicita exportação
2. Job assíncrono gera os arquivos (pode levar minutos)
3. Email enviado com link de download (válido por 24h)
4. Arquivo deletado automaticamente após o download ou após 24h
```

### 11.2 Exclusão de workspace

Quando um workspace é excluído (após confirmação), o processo de limpeza:

```
Imediato (no momento da solicitação):
  • status = 'deleted'
  • Todos os membros perdem acesso
  • API keys revogadas
  • Webhooks desativados

Após 30 dias (job agendado):
  • Deletar em ordem (respeitar FK):
    1. audit_log, webhooks_raw, webhooks_outbound
    2. comunicacoes
    3. oportunidades
    4. contatos
    5. formularios, automacoes, metas
    6. api_keys, webhook_secrets
    7. workspace_members
    8. workspaces (último)
  • Arquivos no Storage deletados
  • Gravações no R2 deletadas
```

**Regra LGPD:** o workspace pode solicitar a exclusão imediata (sem esperar 30 dias) por razões de privacidade. Nesse caso, o processo acima é executado imediatamente.

---

## 12. Critérios de aceite

Antes de abrir o sistema para múltiplas empresas, confirmar:

### Isolamento de dados
- [ ] Usuário logado no workspace A nunca recebe dados do workspace B em nenhuma query
- [ ] RLS ativo em **todas** as tabelas de negócio (verificar via `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`)
- [ ] Edge Functions com `service_role` não usam o cliente autenticado do usuário
- [ ] Teste: criar dois workspaces com mesmo nome de contato → cada workspace vê apenas o seu

### Workspace lifecycle
- [ ] Signup cria workspace + owner + registro em workspace_members corretamente
- [ ] Onboarding wizard funciona do início ao fim
- [ ] Convite por email expira após 7 dias
- [ ] Remover membro bloqueia acesso imediatamente (sem cache)
- [ ] Transferência de ownership funciona com confirmação do novo owner
- [ ] Workspace suspenso: membros veem dados mas não conseguem criar/editar
- [ ] Exclusão: soft delete + limpeza após 30 dias

### Planos e limites
- [ ] Workspace no plano Free não consegue criar mais de 3 membros
- [ ] Banner de aviso aparece quando soft limits são atingidos
- [ ] Email enviado ao owner ao atingir 80% do limite de contatos

### API Keys
- [ ] Key exibida apenas uma vez na criação
- [ ] Requests sem escopo correto retornam 403
- [ ] Key revogada retorna 401 imediatamente
- [ ] `last_used_at` atualizado a cada uso

### Webhook signature
- [ ] Webhook sem header `X-Empire-Signature` retorna 401
- [ ] Webhook com assinatura incorreta retorna 401
- [ ] Webhook com assinatura correta é aceito e salvo em `webhooks_raw`

### Audit log
- [ ] Exclusão de contato gera registro em `audit_log`
- [ ] Criação/revogação de API key gera registro
- [ ] Membros do workspace conseguem consultar o audit log na UI
- [ ] Workspaces Free não têm acesso ao audit log

### Rate limiting
- [ ] Workspace Free recebe 429 após 100 req/min
- [ ] Header `Retry-After` presente em todas as respostas 429

---

*Documento criado em Abril/2026 — Empire Business*
