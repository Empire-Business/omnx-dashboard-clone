# Rascunho — Fase 1 (Modelo de dados Agency)

| Campo | Valor |
|-------|-------|
| **Atualizado em** | 2026-07-09 BRT |
| **Status** | 🟡 RASCUNHO para revisão — **nada aplicado** em produção nem em migrations |
| **Fonte de verdade** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) (v3), seção 3 |
| **Bloqueado por** | Decisão do dono (iniciar Fase 1) + **staging** (projeto de homologação) |

> Este documento **consolida** o que a Fase 1 exige, para facilitar revisão e
> estimativa. **Não é** uma migration e **não deve** ser aplicado. O DDL abaixo é
> copiado do plano v3 (seção 3) — em caso de divergência, o plano vence.

---

## 1. Objetivo

Introduzir a camada **Agency** sem quebrar o modelo atual "1 instância = 1
empresa": uma agência agrupa N workspaces (sub-contas) e seu dono/admin enxerga
todas as **ativas** — sem virar `workspace_members` em cada uma. Critério de
aceite: cliente atual continua **sem nenhuma mudança percebida** (validado pelo
teste de regressão de UX da Fase 0.3) e a suíte da Fase 0 segue verde com a nova
camada.

---

## 2. DDL proposto (plano v3, seção 3.2)

```sql
CREATE TABLE agencies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    ghl_agency_company_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE agency_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
    invited_by UUID REFERENCES auth.users(id),
    joined_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT true NOT NULL,
    UNIQUE(agency_id, user_id)
);

CREATE TABLE agency_workspaces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provisioning_mode TEXT NOT NULL CHECK (provisioning_mode IN ('auto_discovered', 'manual_byok')),
    ghl_location_id TEXT,   -- cache NÃO-autoritativo (fonte de verdade: ghl_integration_settings)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id)    -- 1 workspace pertence a no máximo 1 agência
);
```

Pontos-chave do plano: `UNIQUE(workspace_id)` (sempre 0 ou 1 agência por
workspace); `ghl_location_id` aqui é só cache — a fonte de verdade de resolução é
`ghl_integration_settings`; transferência entre agências só via RPC
`transfer_agency_workspace(...)` `SECURITY DEFINER` + auditoria
(`agency_workspace_transfers`), nunca UPDATE direto.

---

## 3. Funções RLS aditivas (plano v3, seção 3.3)

```sql
CREATE OR REPLACE FUNCTION is_agency_member(p_agency_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM agency_members
    WHERE agency_id = p_agency_id AND user_id = auth.uid() AND is_active = true);
$$;

CREATE OR REPLACE FUNCTION is_agency_admin(p_agency_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM agency_members
    WHERE agency_id = p_agency_id AND user_id = auth.uid()
      AND is_active = true AND role IN ('owner','admin'));
$$;

-- CORRIGIDO na v2: filtra aw.status = 'active' (sub-conta suspensa = acesso zero)
CREATE OR REPLACE FUNCTION can_access_workspace_via_agency(p_workspace_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM agency_workspaces aw
    JOIN agency_members am ON am.agency_id = aw.agency_id
    WHERE aw.workspace_id = p_workspace_id
      AND aw.status = 'active'
      AND am.user_id = auth.uid() AND am.is_active = true
      AND am.role IN ('owner','admin')
  );
$$;
```

**Índices obrigatórios na mesma migration** (sem eles a política aditiva degrada):

```sql
CREATE INDEX idx_agency_members_user_active
  ON agency_members (user_id, agency_id) WHERE is_active = true;
CREATE INDEX idx_agency_workspaces_ws_active
  ON agency_workspaces (workspace_id, agency_id) WHERE status = 'active';
```

**Retrofit das ~90 policies:** as policies atuais
(`USING (is_workspace_member(workspace_id))`) permanecem; adiciona-se uma condição
de agência. O plano recomenda **consolidar** numa única policy
`USING (is_workspace_member(ws) OR can_access_workspace_via_agency(ws))` por
tabela (ordem determinística, caminho barato primeiro), gerada
**programaticamente** (script que lê as tabelas com `is_workspace_member` e emite
o `ALTER/CREATE POLICY`), não à mão.

---

## 4. `resolveTenancyMode(userId)` (plano v3, seção 3.4)

Função nova (ainda não existe — por isso a Fase 0.3 ficou parcial). Regra:
- 1 workspace **e** 0 linhas em `agency_members` → retorna `'single-tenant'` (UX
  atual intacta; o cliente atual vira "a primeira sub-conta" sem perceber).
- `agency_members` presente **ou** 2+ workspaces → retorna modo multi (mostra
  `WorkspaceSelector` e a área `/agency`).

Ao ser criada, destravar o `it.todo` em
[`eb-dash2/src/lib/workspace.test.ts`](../eb-dash2/src/lib/workspace.test.ts).

---

## 5. Ordem de aplicação sugerida (quando a Fase 1 for iniciada)

1. Criar tabelas + índices + funções (migration única, idempotente).
2. **Não** aplicar retrofit das ~90 policies ainda — validar as funções com a
   suíte dedicada da seção 3.3.1 do plano (NULL, membro inativo, agência
   deletada, role fora, `status='suspended'`).
3. `resolveTenancyMode` + teste de regressão de UX (gate de aceite).
4. Só então o retrofit programático das policies, re-rodando a suíte da Fase 0
   (deve seguir **0 vazamento**) + a suíte de agência.
5. Burn-in em staging antes de qualquer tenant real.

---

## 6. O que precisa do dono (não dá para avançar sem)

- **Iniciar a Fase 1** (decisão explícita).
- **Staging** (projeto Supabase de homologação) — pré-requisito declarado no
  roadmap; sem ele, qualquer teste real da Fase 1 seria contra produção.
- Validar o **corte de escopo**: o plano (seção 10.3) sugere BYOK primeiro e
  adiar RLS aditiva/auto-descoberta — mas o dono já disse "plano completo". A
  ordem exata dentro da Fase 1 ainda beneficia de confirmação.

---

## 7. Referências

- [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) — seção 3 (modelo, RLS, índices, tenancy).
- [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — status da Fase 1 e dependências.
- [`docs/BASELINE-REPRODUCIBILIDADE.md`](BASELINE-REPRODUCIBILIDADE.md) — finding que bloqueia setup-do-zero (relevante para a Fase 1 criar migrations corretas).
- [`__tests__/integration/future-phases.skip.test.ts`](../__tests__/integration/future-phases.skip.test.ts) — provas de isolamento da Fase 1 já mapeadas (a destravar).
