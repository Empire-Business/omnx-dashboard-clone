# 14 — Controle de Acesso

> **O que este documento cobre:** Modelo de 3 camadas de acesso, roles completos, matriz de permissões, visibilidade de campos sensíveis, herança de permissões, filtros de dados, enforcement no backend e frontend, convites, permissões temporárias, gestão de sessões, MFA, e portal do cliente.

---

## Índice

1. [Modelo de 3 camadas](#1-modelo-de-3-camadas)
2. [Roles — o que cada um pode fazer](#2-roles--o-que-cada-um-pode-fazer)
3. [Matriz completa: role × recurso × ação](#3-matriz-completa-role--recurso--ação)
4. [Visibilidade de campos sensíveis](#4-visibilidade-de-campos-sensíveis)
5. [Herança e precedência de permissões](#5-herança-e-precedência-de-permissões)
6. [Filtros de dados por usuário](#6-filtros-de-dados-por-usuário)
7. [Enforcement no backend](#7-enforcement-no-backend)
8. [Enforcement no frontend](#8-enforcement-no-frontend)
9. [Convite de membros](#9-convite-de-membros)
10. [Permissões temporárias](#10-permissões-temporárias)
11. [Gestão de sessões](#11-gestão-de-sessões)
12. [MFA / Autenticação de dois fatores](#12-mfa--autenticação-de-dois-fatores)
13. [Portal do cliente](#13-portal-do-cliente)
14. [Critérios de aceite](#14-critérios-de-aceite)

---

## 1. Modelo de 3 camadas

O controle de acesso do Empire CRM funciona em 3 camadas empilhadas. Cada camada afunila mais o que o usuário pode ver e fazer.

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 1 — WORKSPACE                                       │
│  "Você pertence a este workspace?"                          │
│  → workspace_members + RLS no banco                        │
│  → Se não pertence: acesso negado total                     │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 2 — ROLE + PERMISSÕES                               │
│  "O que você pode fazer dentro do workspace?"               │
│  → Role padrão (Owner, Admin, SDR…)                        │
│  → Override granular por módulo/ação (configurado pelo Admin)│
│  → Se não tem permissão: botão oculto, rota bloqueada, 403  │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 3 — FILTROS DE DADOS                                │
│  "Quais registros dentro do workspace você enxerga?"        │
│  → Todos os leads / só seus leads / só pipeline específico  │
│  → Se filtro ativo: query retorna subset, não tudo          │
└─────────────────────────────────────────────────────────────┘
```

**Regra de ouro:** as 3 camadas são **cumulativas**. Passar na camada 1 não garante passar na 2. Passar na 2 não garante ver todos os dados da 3. O acesso mais restrito sempre vence.

---

## 2. Roles — o que cada um pode fazer

### Tabela resumida

| Role | Quem é | Acesso geral |
|------|--------|-------------|
| **Owner** | Fundador / dono da conta | Tudo — billing, deletar workspace, configurações globais |
| **Admin** | Gerente sênior / CTO | Tudo exceto billing e exclusão do workspace |
| **Gerente** | Coordenador de equipe | Ver todos os dados, configurar pipelines e formulários, sem configurações de sistema |
| **SDR** | Pré-vendedor | Seus leads, inbox, enviar mensagens, sem configurações |
| **Closer** | Vendedor | Seus deals no pipeline de vendas, registrar fechamentos |
| **Viewer** | Observador / stakeholder | Leitura em tudo que o role permite, sem nenhuma edição |

### Detalhamento por módulo

#### Owner
- Acesso irrestrito a todos os módulos
- Único que pode: alterar plano, ver histórico de billing, deletar o workspace, transferir ownership
- Pode criar e revogar API keys de qualquer escopo
- Pode ver e exportar todos os dados

#### Admin
- Igual ao Owner em tudo exceto: billing e exclusão do workspace
- Pode convidar membros, alterar roles, configurar permissões granulares
- Pode criar pipelines, formulários, automações, webhooks
- Pode ver todos os leads independente de filtro de SDR

#### Gerente
- Ver e exportar todos os dados de contatos, oportunidades, comunicações
- Configurar pipelines e stages, formulários
- **Não pode:** alterar configurações de sistema, criar API keys, criar integrações, ver billing, convidar membros

#### SDR
- Ver e editar contatos e oportunidades **do seu filtro de dados** (por padrão: seus próprios leads)
- Inbox: ver e enviar mensagens dos seus leads
- Mover oportunidades de stage dentro dos pipelines autorizados
- **Não pode:** deletar contatos/oportunidades, criar pipelines, ver leads de outros SDRs (salvo override do admin), ver configurações

#### Closer
- Ver oportunidades no pipeline de vendas (stages de negociação em diante)
- Registrar resultado de reuniões (realizada, no-show, fechado, perdido)
- Ver o contato e o histórico de comunicações dos seus deals
- **Não pode:** ver o pipeline de pré-vendas de outros SDRs, acessar configurações, criar/deletar contatos

#### Viewer
- Leitura em tudo que o role base permite
- Sem nenhum botão de criar, editar ou deletar habilitado
- Útil para stakeholders, investidores, membros de outro time que precisam consultar dados

---

## 3. Matriz completa: role × recurso × ação

Legenda: ✅ permitido | ❌ bloqueado | ⚠️ depende do filtro de dados

### CRM — Contatos

| Ação | Owner | Admin | Gerente | SDR | Closer | Viewer |
|------|-------|-------|---------|-----|--------|--------|
| Listar contatos | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Ver detalhes do contato | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Criar contato | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Editar contato | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ |
| Deletar contato | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Importar via CSV | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Exportar contatos | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Adicionar/remover tags | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ |

### CRM — Oportunidades

| Ação | Owner | Admin | Gerente | SDR | Closer | Viewer |
|------|-------|-------|---------|-----|--------|--------|
| Listar oportunidades | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Ver detalhes da oportunidade | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Criar oportunidade | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mover de stage | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Editar campos da oportunidade | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Registrar fechamento/perda | ✅ | ✅ | ✅ | ❌ | ⚠️ | ❌ |
| Deletar oportunidade | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Comunicações

| Ação | Owner | Admin | Gerente | SDR | Closer | Viewer |
|------|-------|-------|---------|-----|--------|--------|
| Ver inbox | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Enviar mensagem WhatsApp | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Enviar email | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ❌ |
| Ver histórico de conversas | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Criar template de mensagem | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

### Reuniões (Video Meet)

| Ação | Owner | Admin | Gerente | SDR | Closer | Viewer |
|------|-------|-------|---------|-----|--------|--------|
| Criar reunião | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Entrar como host | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Entrar como observer | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver gravação | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ |
| Deletar gravação | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

### Configurações do Workspace

| Ação | Owner | Admin | Gerente | SDR | Closer | Viewer |
|------|-------|-------|---------|-----|--------|--------|
| Editar nome/logo/timezone | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Criar/editar pipelines | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Criar/editar formulários | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Criar/revogar API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar webhooks de saída | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Configurar integrações (UAZAPI, etc.) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Criar/editar automações | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Convidar membros | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Alterar role de membros | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Remover membros | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Ver audit log | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ver billing / alterar plano | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Deletar workspace | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Transferir ownership | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Visibilidade de campos sensíveis

Alguns campos contêm dados financeiros, pessoais ou estratégicos que não devem ser visíveis para todos os roles. O controle é feito no **frontend** (campos omitidos da UI) e opcionalmente no **backend** (campos excluídos do SELECT).

### Campos de oportunidade

| Campo | Owner | Admin | Gerente | SDR | Closer | Viewer |
|-------|-------|-------|---------|-----|--------|--------|
| Nome do lead | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Email do lead | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Telefone completo | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ (truncado) |
| Valor do contrato | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Número de parcelas | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Link do contrato assinado | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| UTM / origem do lead | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| SDR responsável | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notas internas | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Campos de contato

| Campo | Owner | Admin | Gerente | SDR | Closer | Viewer |
|-------|-------|-------|---------|-----|--------|--------|
| Nome | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Email | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Telefone | ✅ | ✅ | ✅ | ✅ | ✅ | `+55 11 ●●●●●-1234` |
| Tags | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Campos customizados | ✅ | ✅ | ✅ | configurável | configurável | ❌ |

> **Implementação:** campos bloqueados para um role são omitidos na query do backend (não retornados no JSON) e ocultos na UI. Usar a função `filterFieldsByRole(data, role)` no layer de serviço.

---

## 5. Herança e precedência de permissões

Quando há múltiplas fontes de permissão em conflito, a regra é **a restrição mais específica vence**.

### Hierarquia (do mais genérico para o mais específico)

```
1. Role padrão (Owner, Admin, SDR…)         ← base
2. Override de permissão pelo admin          ← sobrescreve o role
3. Filtro de dados (SDR, pipeline, stage)    ← restringe o que é visível
```

### Exemplos práticos

**Exemplo 1 — Expandir acesso:**
- Role base do SDR: não pode ver dados de outros SDRs
- Admin configura override: "este SDR pode ver todos os leads do pipeline X"
- Resultado: SDR vê todos os leads do pipeline X (acesso expandido)

**Exemplo 2 — Restringir acesso:**
- Role base do Gerente: pode ver todos os dados
- Admin configura filtro: "este Gerente vê apenas leads do pipeline Pré-Vendas"
- Resultado: Gerente não vê o pipeline de Vendas (acesso restrito)

**Exemplo 3 — Conflito entre override e filtro:**
- Override diz "pode editar contatos"
- Filtro de dados diz "só enxerga seus leads"
- Resultado: pode editar, mas apenas os contatos que o filtro permite enxergar

### Armazenamento no banco

```
workspace_members
  role         TEXT    — role base (owner, admin, gerente, sdr, closer, viewer)
  permissions  JSONB   — overrides do admin sobre o role base
  data_filters JSONB   — filtros de visibilidade de dados
```

Formato do campo `permissions`:
```json
{
  "contacts.delete": true,
  "opportunities.view_value": false,
  "settings.pipelines": true
}
```

Formato do campo `data_filters`:
```json
{
  "sdr": "self",
  "pipeline_ids": ["uuid-pipeline-1", "uuid-pipeline-2"],
  "stage_ids": null
}
```

**Algoritmo de resolução:**
```
function canDo(user, action):
  1. Checar camada 1: user.status == 'active' e workspace_id bate → senão NEGADO
  2. Checar permissões customizadas: se action in user.permissions → usar valor
  3. Senão, usar permissão padrão do role base para a action
  4. Se resultado = true → checar filtros de dados para o registro específico
  5. Retornar resultado final
```

---

## 6. Filtros de dados por usuário

Além das permissões de módulo (o que pode fazer), o admin pode restringir **quais registros** o usuário enxerga.

### Tipos de filtro disponíveis

```
Configurações → Usuários → [Nome] → Filtros de dados

┌──────────────────────────────────────────────────────┐
│  Visibilidade de leads                               │
│                                                      │
│  ◉ Todos os leads do workspace                      │
│  ○ Apenas leads onde SDR = este usuário              │
│  ○ Apenas leads dos pipelines:                       │
│    [✓] Pré-Vendas MQL  [✗] Vendas SQL               │
│  ○ Apenas leads dos stages:                          │
│    [✓] Novo  [✓] Conectado  [✗] Qualificado         │
└──────────────────────────────────────────────────────┘
```

### Implementação via RLS

```sql
-- Filtro de SDR: usuário só vê seus próprios leads
CREATE POLICY "sdr_data_filter" ON oportunidades
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
    AND (
      -- Sem filtro de SDR configurado: vê tudo do workspace
      NOT EXISTS (
        SELECT 1 FROM workspace_members
        WHERE user_id = auth.uid()
          AND data_filters->>'sdr' = 'self'
      )
      OR
      -- Com filtro: só vê seus leads
      sdr_name = (
        SELECT full_name FROM workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );
```

### Filtros compostos

Filtros podem ser combinados. Um usuário pode estar limitado a:
- Pipeline X + apenas seus leads → verá somente seus leads dentro do pipeline X
- Pipelines X e Y + sem filtro de SDR → verá todos os leads dos pipelines X e Y

---

## 7. Enforcement no backend

Permissões precisam ser verificadas nas Edge Functions — não apenas no banco via RLS.

### Padrão obrigatório em Edge Functions

```typescript
// Helper centralizado — src/lib/auth/permissions.ts
async function requirePermission(
  req: Request,
  action: string,
  workspaceId: string
): Promise<{ userId: string; role: string; permissions: Record<string, boolean> }> {
  // 1. Verificar JWT do usuário
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) throw new PermissionError(401, 'Não autenticado')

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new PermissionError(401, 'Token inválido')

  // 2. Verificar membership no workspace
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role, permissions, status')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .single()

  if (!member) throw new PermissionError(403, 'Sem acesso a este workspace')

  // 3. Resolver permissão para a ação
  const allowed = resolvePermission(member.role, member.permissions, action)
  if (!allowed) throw new PermissionError(403, `Sem permissão para: ${action}`)

  return { userId: user.id, role: member.role, permissions: member.permissions }
}

// Uso em qualquer Edge Function:
const { userId, role } = await requirePermission(req, 'contacts.delete', workspaceId)
```

### Ações que sempre precisam de check explícito

| Ação | Check obrigatório |
|------|------------------|
| Deletar qualquer registro | `requirePermission(req, 'X.delete', wid)` |
| Criar/revogar API key | `requirePermission(req, 'api_keys.manage', wid)` |
| Alterar role de membro | `requirePermission(req, 'members.manage', wid)` |
| Criar/editar automação | `requirePermission(req, 'automations.write', wid)` |
| Exportar dados | `requirePermission(req, 'data.export', wid)` |
| Ver dados financeiros | `requirePermission(req, 'opportunities.view_value', wid)` |

> **Regra:** nunca confiar apenas no RLS para operações destrutivas ou sensíveis. O check explícito na Edge Function garante a mensagem de erro correta e o registro no audit log.

---

## 8. Enforcement no frontend

### Hook `usePermission`

```typescript
// src/hooks/usePermission.ts
export function usePermission(action: string): boolean {
  const { member } = useCurrentMember() // lê workspace_members do contexto
  return resolvePermission(member.role, member.permissions, action)
}

// Uso em componentes:
const canDelete = usePermission('contacts.delete')
const canViewValue = usePermission('opportunities.view_value')
```

### Padrão para botões e elementos de UI

```tsx
// Botão visível apenas com permissão
{canDelete && (
  <button onClick={handleDelete}>Deletar</button>
)}

// Botão desabilitado (visível mas inativo) — para deixar claro que existe mas não está disponível
<button disabled={!canEdit} onClick={handleEdit}>
  Editar
</button>

// Rota protegida — redireciona se não tem acesso
<ProtectedRoute action="settings.pipelines">
  <PipelinesPage />
</ProtectedRoute>
```

### Componente `ProtectedRoute`

```tsx
// src/components/auth/ProtectedRoute.tsx
export function ProtectedRoute({ action, children }: { action: string; children: ReactNode }) {
  const allowed = usePermission(action)
  if (!allowed) return <Navigate to="/403" replace />
  return <>{children}</>
}
```

### Regra: ocultar vs. desabilitar

| Situação | Padrão |
|----------|--------|
| Funcionalidade que o role nunca terá | **Ocultar** (não renderizar) |
| Funcionalidade disponível mas bloqueada por filtro de dados | **Desabilitar** com tooltip explicando o motivo |
| Funcionalidade de plano superior | **Mostrar com lock** e CTA para upgrade |

---

## 9. Convite de membros

```
Configurações → Usuários → Convidar Membro

┌─────────────────────────────────────────────────┐
│  Convidar Novo Membro                           │
│  ────────────────────────────────────────────── │
│  Email           [karina@empresa.com          ] │
│  Nome (opcional) [Karina Lima                 ] │
│  Role            [SDR ▾                       ] │
│  Acesso expira   [Sem expiração ▾             ] │
│                                                  │
│  [Enviar Convite]                               │
└─────────────────────────────────────────────────┘
```

**Fluxo:**
1. Admin insere email + role (+ expiração opcional)
2. Sistema cria `workspace_members` com `status = 'invited'`
3. Email de convite enviado via Resend com link único (token de 7 dias)
4. Destinatário clica → cria conta se não tiver, ou faz login
5. `status` muda para `'active'`, permissões do role aplicadas automaticamente
6. Se convite expirar sem aceite → `status = 'expired'`, acesso nunca concedido

**Regras:**
- Convite expira em **7 dias** — janela suficiente para o convidado aceitar sem pressa, com opção de reenvio
- Owner não pode ser convidado — precisa ser criado via signup ou transferência de ownership
- Admin não pode convidar outro Admin — somente Owner pode promover para Admin
- Email de convite reenviável pelo Admin até 3x antes de precisar criar novo convite

---

## 10. Permissões temporárias

Permite dar acesso por um período limitado, sem precisar lembrar de remover manualmente.

**Casos de uso:**
- Freelancer contratado por 30 dias
- Auditor externo com acesso somente-leitura por 1 semana
- Acesso emergencial de suporte por 24h

```
Configurações → Usuários → [Nome] → Acesso

┌─────────────────────────────────────────────────┐
│  Acesso temporário — Karina Lima                │
│  ────────────────────────────────────────────── │
│  Status       ● Ativo (expira em 12/05/2026)    │
│  Expira em    [12/05/2026 23:59 ▾]             │
│  Após expirar [Suspender ▾]                    │
│                 ○ Suspender  ○ Remover          │
│                                                  │
│  [Salvar]  [Revogar acesso agora]               │
└─────────────────────────────────────────────────┘
```

**Campo no banco:** `workspace_members.expires_at TIMESTAMPTZ`

**Job de verificação:** cron a cada hora verifica `expires_at < NOW()` e muda `status` para `'suspended'` ou `'removed'` conforme configurado.

**Enforcement:** a query de membership já filtra `status = 'active'`, então usuário expirado perde acesso automaticamente na próxima requisição.

---

## 11. Gestão de sessões

### Expiração de token

- **JWT de acesso:** expira em **1 hora** (padrão Supabase Auth)
- **Refresh token:** expira em **7 dias** de inatividade
- Após 7 dias sem usar o app: usuário precisa fazer login novamente

### Logout forçado (remoção imediata de acesso)

Quando um Admin remove ou suspende um membro, o acesso precisa ser revogado **imediatamente** — não apenas na próxima expiração do JWT.

```
Mecanismo: invalidação de sessão via Supabase Auth Admin API

await supabase.auth.admin.signOut(userId, 'global')
// 'global' = invalida TODOS os devices do usuário
```

Este endpoint deve ser chamado automaticamente quando:
- Membro é removido do workspace
- Membro é suspenso
- Role é rebaixado para Viewer (opcional, configurável)
- Owner suspeita de comprometimento de conta

### Dispositivos ativos

```
Configurações → Minha Conta → Sessões ativas

┌─────────────────────────────────────────────────────┐
│  Sessões ativas                                     │
│  ────────────────────────────────────────────────── │
│  ● Chrome / macOS          São Paulo  Agora mesmo   │
│  ○ Safari / iPhone         São Paulo  há 2 dias     │
│  ○ Chrome / Windows        [IP externo]  há 5 dias  │
│                                                      │
│  [Encerrar todas as outras sessões]                 │
└─────────────────────────────────────────────────────┘
```

### Timeout por inatividade

Configurável por workspace (Admin):
- Padrão: sem timeout
- Opções: 30 min, 1h, 4h, 8h
- Útil para workspaces com dados sensíveis (clínicas, jurídico, financeiro)

---

## 12. MFA / Autenticação de dois fatores

### Quando é recomendado (não obrigatório por padrão)

| Situação | Recomendação |
|----------|-------------|
| Owner e Admin de qualquer workspace | **Fortemente recomendado** |
| Qualquer usuário com acesso a API keys | Obrigatório |
| Workspaces do plano Enterprise | Admin pode **tornar obrigatório** para todos |

### Métodos suportados

| Método | Suporte |
|--------|---------|
| TOTP (Google Authenticator, Authy) | ✅ Fase 2 |
| SMS (código via WhatsApp/SMS) | ✅ Fase 2 |
| Email OTP | ✅ Disponível via Supabase Auth |
| Passkey (WebAuthn) | Fase 3 |

### Configuração por workspace (Enterprise)

```
Configurações → Segurança → Autenticação

┌─────────────────────────────────────────────────────┐
│  Autenticação de dois fatores                       │
│  ────────────────────────────────────────────────── │
│  MFA obrigatório para:                              │
│    [✓] Owners e Admins                              │
│    [✗] Todos os membros                             │
│                                                      │
│  Prazo para configurar: [7 dias ▾]                 │
│  (membros sem MFA após prazo ficam suspensos)       │
└─────────────────────────────────────────────────────┘
```

---

## 13. Portal do cliente

O **portal do cliente** permite que um lead/cliente externo acesse um link privado para acompanhar o status do próprio processo — sem precisar de conta no CRM.

### O que o cliente pode ver

```
https://empirecrm.com.br/portal/<token-unico>

┌─────────────────────────────────────────────────────┐
│  Olá, João Silva                                    │
│  ────────────────────────────────────────────────── │
│  Seu processo:                                      │
│                                                      │
│  ✅ Lead recebido         12/04/2026                │
│  ✅ Conectado com SDR     13/04/2026                │
│  ✅ Reunião realizada     15/04/2026                │
│  ⏳ Em análise / negociação                         │
│  ○  Contrato              —                         │
│                                                      │
│  Próximo passo: aguardar contato do nosso time      │
│                                                      │
│  Dúvidas? WhatsApp: [Falar com o time]             │
└─────────────────────────────────────────────────────┘
```

### O que o cliente NÃO vê

- Outros leads ou contatos (isolamento total)
- Dados internos: valor do contrato, notas do SDR, tags, UTM
- Informações de outros membros do workspace

### Implementação

- Token único por oportunidade, gerado no momento da criação do lead
- Armazenado em `oportunidades.portal_token TEXT UNIQUE`
- Link: `/portal/<token>` — sem autenticação (o token é a prova de acesso)
- Token pode ser regenerado pelo Admin (invalida o anterior)
- Expiração configurável: nunca / 30 dias / 90 dias

**Campos visíveis no portal (configurável por workspace):**
- Nome do lead ✅
- Status/stage atual ✅
- Datas de cada etapa ✅
- Nome do SDR/closer responsável (configurável)
- Link para entrar na sala de reunião (quando agendada)

---

## 14. Critérios de aceite

### Isolamento de workspace

- [ ] Usuário do workspace A nunca recebe dados do workspace B em nenhuma query
- [ ] RLS ativo em todas as tabelas (verificar: `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity`)
- [ ] Teste: criar dois workspaces com mesmo nome de contato → cada um vê apenas o seu

### Roles e permissões

- [ ] Cada role tem acesso exato ao definido na matriz da seção 3
- [ ] Admin pode expandir ou restringir permissões de qualquer membro (exceto Owner)
- [ ] Override do admin sobrescreve o role padrão corretamente
- [ ] Permissão mais restrita sempre vence (teste: Gerente com filtro de pipeline só vê aquele pipeline)

### Campos sensíveis

- [ ] SDR não vê `valor_contrato` nem `numero_parcelas` na UI nem na resposta da API
- [ ] Telefone aparece truncado para Viewer
- [ ] Campo customizado marcado como "restrito" não aparece para roles não autorizados

### Frontend

- [ ] Botões de ações bloqueadas estão ocultos (não apenas desabilitados) para roles sem permissão
- [ ] Rota `/configuracoes` redireciona para 403 para SDR e Closer
- [ ] `usePermission('contacts.delete')` retorna `false` para SDR

### Backend

- [ ] Edge Function de delete de contato retorna 403 para SDR mesmo com requisição direta (sem UI)
- [ ] Campos financeiros não retornados no JSON para roles sem permissão `opportunities.view_value`

### Convites e sessões

- [ ] Convite expira após 7 dias sem aceite
- [ ] Remover membro invalida sessão imediatamente (usuário é deslogado)
- [ ] Membro com `expires_at` no passado perde acesso automaticamente sem ação manual
- [ ] Admin pode forçar logout de qualquer membro

### MFA

- [ ] Owner e Admin conseguem ativar TOTP na conta
- [ ] Workspace Enterprise consegue tornar MFA obrigatório
- [ ] Membro sem MFA após prazo é suspenso automaticamente

### Portal do cliente

- [ ] Token único por oportunidade gerado corretamente
- [ ] Link do portal exibe apenas dados da oportunidade vinculada ao token
- [ ] Não é possível enumerar outros tokens ou acessar outros leads
- [ ] Regenerar token invalida o anterior imediatamente

---

*Próximo: [15 — Migração do GHL](./15-MIGRACAO-GHL.md)*
