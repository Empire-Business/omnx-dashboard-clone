# Plano de Implementação: Autenticação OTP + Recuperação de Senha

## 📋 Contexto

**Problema:** Usuário não consegue recuperar a senha de `ferramentas@aliancadealtovalor.com.br` - link de recuperação não funciona.

**Objetivo:** Implementar sistema robusto de autenticação com OTP (8 dígitos) e recuperação de senha funcional, seguindo padrões de segurança OWASP e integrado com Supabase Auth.

**Stack:** Next.js 14, TypeScript, Tailwind CSS, shadcn/ui, Supabase Auth, Dark Mode Only

---

## 🏗️ Arquitetura Proposta

### 1. Fluxo de Autenticação OTP (8 dígitos)

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO OTP (8 DÍGITOS)                        │
└─────────────────────────────────────────────────────────────────┘

1. TELA DE LOGIN
   ├─ Email/Telefone
   ├─ Botão "Enviar OTP"
   └─ Método: SMS ou Email

2. ENVIO OTP
   ├─ Gerar código 8 dígitos (criptograficamente seguro)
   ├─ Salvar em tabela `auth_otp_codes` com:
   │  ├─ id (UUID)
   │  ├─ email/phone (TEXT)
   │  ├─ code (VARCHAR(8))
   │  ├─ created_at (TIMESTAMPTZ)
   │  ├─ expires_at (TIMESTAMPTZ) - 10 minutos
   │  ├─ attempts (INT) - max 5
   │  ├─ verified_at (TIMESTAMPTZ)
   │  └─ used (BOOLEAN)
   ├─ Enviar via Supabase Auth (email) ou Twilio (SMS)
   └─ Retornar sucesso

3. TELA DE VERIFICAÇÃO OTP
   ├─ Input de 8 dígitos (com máscara visual)
   ├─ Contador regressivo (10 min)
   ├─ Botão "Reenviar" (após 30s)
   └─ Validação em tempo real

4. VERIFICAÇÃO OTP
   ├─ Validar código contra `auth_otp_codes`
   ├─ Verificar:
   │  ├─ Código correto
   │  ├─ Não expirado
   │  ├─ Tentativas < 5
   │  └─ Não já usado
   ├─ Se válido:
   │  ├─ Marcar como verified_at = NOW()
   │  ├─ Criar sessão Supabase Auth
   │  └─ Redirecionar para dashboard
   └─ Se inválido:
       ├─ Incrementar attempts
       └─ Retornar erro

5. RATE LIMITING
   ├─ Max 5 tentativas por OTP
   ├─ Max 3 OTPs por email em 1 hora
   ├─ Bloqueio de 15 min após 3 falhas
   └─ Implementar via Redis ou tabela `auth_rate_limits`
```

### 2. Fluxo de Recuperação de Senha

```
┌─────────────────────────────────────────────────────────────────┐
│              FLUXO RECUPERAÇÃO DE SENHA                         │
└─────────────────────────────────────────────────────────────────┘

1. TELA "ESQUECI MINHA SENHA"
   ├─ Input: Email
   ├─ Botão: "Enviar Link de Recuperação"
   └─ Mensagem: "Verifique seu email"

2. GERAÇÃO DE TOKEN
   ├─ Gerar token seguro (UUID v4 + hash)
   ├─ Salvar em tabela `auth_password_reset_tokens` com:
   │  ├─ id (UUID)
   │  ├─ user_id (UUID) - FK auth.users
   │  ├─ token (VARCHAR(255)) - hash do token
   │  ├─ created_at (TIMESTAMPTZ)
   │  ├─ expires_at (TIMESTAMPTZ) - 1 hora
   │  ├─ used_at (TIMESTAMPTZ)
   │  └─ ip_address (INET)
   ├─ Enviar email com link:
   │  └─ https://app.com/auth/reset-password?token=<token>
   └─ Retornar sucesso (sem revelar se email existe)

3. TELA DE RESET DE SENHA
   ├─ Validar token (não expirado, não usado)
   ├─ Inputs:
   │  ├─ Nova Senha (com validação)
   │  ├─ Confirmar Senha
   │  └─ Botão "Atualizar Senha"
   └─ Validações:
       ├─ Min 12 caracteres
       ├─ Maiúscula + minúscula + número + símbolo
       └─ Não reutilizar últimas 5 senhas

4. ATUALIZAÇÃO DE SENHA
   ├─ Validar token novamente
   ├─ Hash nova senha (bcrypt)
   ├─ Atualizar em `auth.users`
   ├─ Marcar token como used_at = NOW()
   ├─ Invalidar todas as sessões ativas
   ├─ Enviar email de confirmação
   └─ Redirecionar para login

5. SEGURANÇA
   ├─ Tokens com expiração curta (1 hora)
   ├─ Tokens one-time use
   ├─ Rastreamento de IP
   ├─ Logs de auditoria
   └─ Proteção contra brute force
```

---

## 📊 Tabelas Necessárias (Migrações)

### Tabela 1: `auth_otp_codes`

```sql
CREATE TABLE auth_otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  phone TEXT,
  code VARCHAR(8) NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('email', 'sms')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  attempts INT DEFAULT 0 NOT NULL,
  used BOOLEAN DEFAULT false NOT NULL,
  ip_address INET,
  user_agent TEXT,
  
  -- Índices
  CONSTRAINT otp_not_expired CHECK (expires_at > now()),
  CONSTRAINT otp_max_attempts CHECK (attempts <= 5)
);

CREATE INDEX idx_auth_otp_codes_email_created ON auth_otp_codes(email, created_at DESC);
CREATE INDEX idx_auth_otp_codes_code ON auth_otp_codes(code);
CREATE INDEX idx_auth_otp_codes_expires ON auth_otp_codes(expires_at);
```

### Tabela 2: `auth_password_reset_tokens`

```sql
CREATE TABLE auth_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  
  -- Índices
  CONSTRAINT token_not_expired CHECK (expires_at > now())
);

CREATE INDEX idx_auth_password_reset_tokens_user_id ON auth_password_reset_tokens(user_id);
CREATE INDEX idx_auth_password_reset_tokens_token_hash ON auth_password_reset_tokens(token_hash);
CREATE INDEX idx_auth_password_reset_tokens_expires ON auth_password_reset_tokens(expires_at);
```

### Tabela 3: `auth_rate_limits`

```sql
CREATE TABLE auth_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- email ou IP
  action TEXT NOT NULL, -- 'otp_request', 'otp_verify', 'password_reset'
  attempt_count INT DEFAULT 1 NOT NULL,
  first_attempt_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  last_attempt_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  blocked_until TIMESTAMPTZ,
  
  UNIQUE(identifier, action)
);

CREATE INDEX idx_auth_rate_limits_identifier_action ON auth_rate_limits(identifier, action);
CREATE INDEX idx_auth_rate_limits_blocked_until ON auth_rate_limits(blocked_until);
```

### Tabela 4: `auth_audit_log`

```sql
CREATE TABLE auth_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'otp_sent', 'otp_verified', 'password_reset_requested', 'password_reset_completed'
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  email TEXT,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_auth_audit_log_user_id ON auth_audit_log(user_id);
CREATE INDEX idx_auth_audit_log_action ON auth_audit_log(action);
CREATE INDEX idx_auth_audit_log_created_at ON auth_audit_log(created_at DESC);
```

---

## 🎨 Componentes Frontend (Dark Mode)

### 1. Página de Login Atualizada
- **Arquivo:** `eb-dash/app/(auth)/login/page.tsx`
- **Componentes:**
  - `LoginContent` - Seletor de método (Email/OTP ou Email/Senha)
  - `OTPInput` - Input de 8 dígitos com máscara
  - `OTPTimer` - Contador regressivo
  - `PasswordStrengthIndicator` - Validação de força de senha

### 2. Página de Verificação OTP
- **Arquivo:** `eb-dash/app/(auth)/verify-otp/page.tsx`
- **Componentes:**
  - `VerifyOTPContent` - Formulário de verificação
  - `OTPResendButton` - Reenviar OTP com cooldown

### 3. Página de Recuperação de Senha
- **Arquivo:** `eb-dash/app/(auth)/forgot-password/page.tsx`
- **Componentes:**
  - `ForgotPasswordContent` - Formulário de email
  - `PasswordResetForm` - Formulário de nova senha

### 4. Página de Reset de Senha
- **Arquivo:** `eb-dash/app/(auth)/reset-password/page.tsx`
- **Componentes:**
  - `ResetPasswordContent` - Validação de token + formulário

---

## 🔌 API Routes (Server Actions)

### 1. Envio de OTP
- **Endpoint:** `POST /api/auth/otp/send`
- **Payload:** `{ email: string, method: 'email' | 'sms' }`
- **Resposta:** `{ success: boolean, message: string, expiresIn: number }`
- **Validações:**
  - Email válido
  - Rate limiting (max 3 por hora)
  - Usuário existe ou criar novo

### 2. Verificação de OTP
- **Endpoint:** `POST /api/auth/otp/verify`
- **Payload:** `{ email: string, code: string }`
- **Resposta:** `{ success: boolean, sessionToken?: string }`
- **Validações:**
  - Código correto
  - Não expirado
  - Tentativas < 5

### 3. Solicitação de Reset de Senha
- **Endpoint:** `POST /api/auth/password/forgot`
- **Payload:** `{ email: string }`
- **Resposta:** `{ success: boolean, message: string }`
- **Validações:**
  - Email existe
  - Rate limiting

### 4. Reset de Senha
- **Endpoint:** `POST /api/auth/password/reset`
- **Payload:** `{ token: string, password: string }`
- **Resposta:** `{ success: boolean, message: string }`
- **Validações:**
  - Token válido
  - Senha forte
  - Não reutilizar

---

## 🔐 Segurança (OWASP)

### Implementações Obrigatórias

| Requisito | Implementação |
|-----------|---------------|
| **Rate Limiting** | Tabela `auth_rate_limits` + middleware |
| **CSRF Protection** | Next.js built-in + SameSite cookies |
| **XSS Prevention** | React sanitization + CSP headers |
| **SQL Injection** | Supabase parameterized queries |
| **Brute Force** | Max 5 tentativas OTP, bloqueio 15 min |
| **Token Expiration** | OTP: 10 min, Reset: 1 hora |
| **Secure Hashing** | bcrypt para senhas, SHA-256 para tokens |
| **HTTPS Only** | Cookies secure + httpOnly |
| **Audit Logging** | Tabela `auth_audit_log` |
| **RLS** | Políticas no Supabase para tabelas auth |

### RLS Policies

```sql
-- auth_otp_codes: apenas service_role pode ler/escrever
CREATE POLICY "Service role only" ON auth_otp_codes
  FOR ALL TO service_role USING (true);

-- auth_password_reset_tokens: apenas service_role
CREATE POLICY "Service role only" ON auth_password_reset_tokens
  FOR ALL TO service_role USING (true);

-- auth_rate_limits: apenas service_role
CREATE POLICY "Service role only" ON auth_rate_limits
  FOR ALL TO service_role USING (true);

-- auth_audit_log: usuários podem ver seus próprios logs
CREATE POLICY "Users can view own logs" ON auth_audit_log
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

---

## 📁 Estrutura de Arquivos

```
eb-dash/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   ├── page.tsx (atualizado)
│   │   │   └── login-content.tsx (atualizado)
│   │   ├── verify-otp/
│   │   │   ├── page.tsx (novo)
│   │   │   └── verify-otp-content.tsx (novo)
│   │   ├── forgot-password/
│   │   │   ├── page.tsx (novo)
│   │   │   └── forgot-password-content.tsx (novo)
│   │   └── reset-password/
│   │       ├── page.tsx (novo)
│   │       └── reset-password-content.tsx (novo)
│   └── api/
│       └── auth/
│           ├── otp/
│           │   ├── send/route.ts (novo)
│           │   └── verify/route.ts (novo)
│           └── password/
│               ├── forgot/route.ts (novo)
│               └── reset/route.ts (novo)
├── components/
│   ├── auth/
│   │   ├── OTPInput.tsx (novo)
│   │   ├── OTPTimer.tsx (novo)
│   │   ├── PasswordStrengthIndicator.tsx (novo)
│   │   └── MethodSelector.tsx (novo)
│   └── ui/ (existentes)
├── lib/
│   ├── auth/
│   │   ├── otp.ts (novo) - Geração e validação OTP
│   │   ├── password.ts (novo) - Validação e hash de senha
│   │   ├── tokens.ts (novo) - Geração de tokens
│   │   └── rate-limit.ts (novo) - Rate limiting
│   └── supabase/ (existentes)
└── types/
    └── auth.ts (novo) - Types para autenticação
```

---

## 📚 Documentação a Atualizar

### 1. `docs/DESIGN_TOKENS.md`
- Adicionar tokens para estados de OTP (loading, error, success)
- Adicionar cores para inputs de OTP
- Adicionar animações para timer

### 2. `docs/PRD-eb-dash.md`
- Seção: "Autenticação OTP + Recuperação de Senha"
- Fluxos de usuário
- Requisitos de segurança

### 3. `docs/ARQUITETURA.md`
- Diagrama de fluxo OTP
- Diagrama de fluxo recuperação de senha
- Tabelas de autenticação

### 4. `docs/DECISOES.md`
- **ADR-006:** Por que OTP em vez de apenas email/senha
- **ADR-007:** Por que 8 dígitos (vs 6)
- **ADR-008:** Rate limiting strategy

### 5. `docs/MUDANCAS.md`
- Adicionar seção "Autenticação OTP + Recuperação de Senha"
- Listar todos os arquivos criados/modificados

### 6. `docs/ROADMAP.md`
- Atualizar status de autenticação
- Adicionar fase de OTP

---

## ✅ Checklist de Implementação

### Fase 1: Migrações & Backend
- [ ] Criar migration `20260226_create_auth_otp_codes.sql`
- [ ] Criar migration `20260226_create_auth_password_reset_tokens.sql`
- [ ] Criar migration `20260226_create_auth_rate_limits.sql`
- [ ] Criar migration `20260226_create_auth_audit_log.sql`
- [ ] Implementar RLS policies
- [ ] Criar funções auxiliares (cleanup de OTPs expirados)

### Fase 2: Utilitários & Validações
- [ ] `lib/auth/otp.ts` - Geração e validação
- [ ] `lib/auth/password.ts` - Validação e hash
- [ ] `lib/auth/tokens.ts` - Geração de tokens
- [ ] `lib/auth/rate-limit.ts` - Rate limiting
- [ ] `types/auth.ts` - Types TypeScript

### Fase 3: API Routes
- [ ] `api/auth/otp/send/route.ts`
- [ ] `api/auth/otp/verify/route.ts`
- [ ] `api/auth/password/forgot/route.ts`
- [ ] `api/auth/password/reset/route.ts`

### Fase 4: Componentes Frontend
- [ ] `components/auth/OTPInput.tsx`
- [ ] `components/auth/OTPTimer.tsx`
- [ ] `components/auth/PasswordStrengthIndicator.tsx`
- [ ] `components/auth/MethodSelector.tsx`

### Fase 5: Páginas
- [ ] `app/(auth)/verify-otp/page.tsx`
- [ ] `app/(auth)/forgot-password/page.tsx`
- [ ] `app/(auth)/reset-password/page.tsx`
- [ ] Atualizar `app/(auth)/login/page.tsx`

### Fase 6: Testes & Segurança
- [ ] Testes unitários para OTP
- [ ] Testes unitários para password reset
- [ ] Testes de rate limiting
- [ ] Teste de segurança (OWASP)
- [ ] Teste de expiração de tokens

### Fase 7: Documentação
- [ ] Atualizar `DESIGN_TOKENS.md`
- [ ] Atualizar `PRD-eb-dash.md`
- [ ] Atualizar `ARQUITETURA.md`
- [ ] Adicionar ADRs em `DECISOES.md`
- [ ] Atualizar `MUDANCAS.md`
- [ ] Atualizar `ROADMAP.md`

---

## 🎯 Critérios de Sucesso

1. ✅ Usuário consegue fazer login via OTP (8 dígitos)
2. ✅ Usuário consegue recuperar senha via email
3. ✅ Link de reset de senha funciona e expira após 1 hora
4. ✅ Rate limiting previne brute force
5. ✅ Todas as páginas em dark mode (conforme design system)
6. ✅ Documentação completa e atualizada
7. ✅ Segurança OWASP validada
8. ✅ Testes passando

---

## 🚀 Próximos Passos

1. **Aprovação do plano** - Validar com stakeholders
2. **Implementação** - Seguir checklist em ordem
3. **Testes** - Validar segurança e UX
4. **Deploy** - Publicar em produção
5. **Monitoramento** - Acompanhar logs de autenticação

