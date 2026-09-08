# Plano de Arquitetura: Multi-Tenant "Agency + Sub-contas" (espelhando o GHL) — v3

> **Status:** Estudo de arquitetura — nenhum código foi alterado ainda. Este documento é uma base de decisão, não uma implementação. Passou por **duas rodadas de revisão crítica adversarial**: a **1ª rodada** (verificação linha a linha dos achados registrados no [Anexo A](#anexo-a-revisão-crítica-multi-agente-2026-07-09): **26 incorporados ao plano e 2 descartados** após verificação) e a **2ª rodada, mais profunda** (agentes de alta capacidade — **29 achados incorporados e 0 descartados**, registrados no [Anexo B](#anexo-b-revisão-profunda-rodada-2--agentes-de-alta-capacidade)), ambas em 2026-07-09. Esta é a **versão 3**, com as correções das duas rodadas incorporadas diretamente no corpo do plano (não apenas anexadas).
> **Data do estudo original:** 2026-07-09 BRT
> **Data da 1ª revisão crítica:** 2026-07-09 BRT
> **Data da 2ª revisão profunda (rodada 2):** 2026-07-09 BRT
> **Autor:** Claude Code (OMNX), a pedido de Bruno (Aliança de Alto Valor)

---

## 1. Resumo executivo

Hoje o Empire funciona no modelo **"1 instância = 1 empresa"**: cada cliente tem seu próprio projeto Supabase e seu próprio deploy Vercel, totalmente isolados fisicamente (ver [`docs/SINGLE-TENANT-LOCK.md`](SINGLE-TENANT-LOCK.md) e [`docs/REPLICACAO-TECNICA.md`](REPLICACAO-TECNICA.md)). Isso dá isolamento perfeito "de graça" — não existe superfície de bug que vaze dados entre clientes, porque eles literalmente não compartilham banco.

Este estudo avalia migrar para um modelo **multi-tenant real dentro de uma única instância**, espelhando a estrutura do próprio GoHighLevel (GHL): uma **Agency** no topo, com N **sub-contas** (tenants) isoladas por dentro, cada uma com seus próprios dados, usuários, admin e integrações (GHL, Meta Ads, OpenRouter, webhooks de entrada/saída).

**A boa notícia:** boa parte da fundação já existe e já funciona hoje, só está desligada no frontend. As tabelas `workspaces`/`workspace_members`, o padrão de RLS (`is_workspace_member`/`is_workspace_admin`/`is_workspace_owner`), o sistema de sub-apps ativáveis por workspace, e até o seletor de workspace no frontend — tudo isso já foi construído em algum momento e depois escondido atrás de uma única flag: `SINGLE_WORKSPACE_MODE = true` em `eb-dash2/src/lib/workspace.ts`.

**A má notícia — e o motivo de este ser um estudo cuidadoso, não uma tarefa de 2 dias:** hoje **todas as integrações externas são globais por instância**, não por workspace. A chave de API do GHL, o token do Meta Ads, a chave do OpenRouter, o segredo de webhook — tudo isso é lido de variáveis de ambiente **únicas para a instância inteira**, dentro de 16+ edge functions. Isso significa que a proteção real contra "vazar dados/ações de um cliente para outro" hoje depende 100% do RLS do banco — e nenhuma chamada real à API do GHL/Meta/OpenRouter sabe "de qual cliente" ela é. Transformar isso em multi-tenant seguro é o cerne deste plano, e é também onde mora o maior risco.

**O que a revisão crítica mudou nesta v2 (resumo):** a v1 tinha uma falha crítica de RLS (a política de acesso da agência ignorava sub-contas suspensas), nenhum tratamento de LGPD/direitos do titular, nenhum modelo de billing por sub-conta, nenhum fluxo de offboarding/exclusão real de dados, um fluxo de auto-descoberta que concedia admin automaticamente sem revisão humana, e nenhuma estimativa de custo/prazo/kill-switch para a decisão de investimento. Todos esses pontos foram corrigidos no corpo deste documento — ver seções 3.3, 4.1, 5.2, 5.3, 6.1, 6.2, 7, 8, 10, 10.1, 10.2, 11, 12.1, 14, 15, 16 (novas ou reescritas) e o Anexo A para o rastreamento completo.

**O que a 2ª rodada de revisão profunda mudou nesta v3 (resumo):** a v2 ainda tinha lacunas de segunda ordem que só aparecem com escala e volume reais — (1) a política RLS aditiva de agência não tinha índices de suporte nem benchmark sob volume production-like; (2) o gerador programático do retrofit de políticas ignorava silenciosamente as 3 tabelas centrais do CRM (predicado por join) e tabelas particionadas; (3) o aperto de `NOT NULL` não tratava o lock `ACCESS EXCLUSIVE` do próprio `ALTER` contra ingestão viva; (4) não havia backfill histórico nem tratamento de órfãos para o `workspace_id` denormalizado; (5) não havia rollback por fase, ambiente de staging production-like, plano de disaster recovery/restore seletivo, offboarding de pessoa da agência, tratamento de depreciação da API GHL, nem resposta a incidente multi-tenant; (6) faltavam controles de segurança — janela MVCC de suspensão, four-eyes na concessão de admin, prova de posse contra location squatting, canal de entrega do link BYOK, SSRF por DNS rebinding, e rotação de credencial no provider upstream. Além disso, esta v3 adiciona a seção **"Caminho de menor risco: MVP recomendado" (seção 10.3)**, que corta a Fase 3 e a política RLS aditiva do caminho crítico e propõe um MVP substancialmente mais enxuto via BYOK. Ver seções 3.3, 3.3.1, 3.5, 4.1, 4.2, 4.3, 5.2, 5.3, 6.1, 6.2, 8, 10.3, 10.4, 12.2, 18, 19 e o Anexo B para o rastreamento completo.

**Recomendação central:** não migrar tudo de uma vez, e não migrar todo mundo. Adotar um **modelo híbrido**:
- **Agency multi-tenant** (este plano) para a maioria dos clientes — mais barato de operar, mais rápido de escalar, com um processo rigoroso de fases e testes de isolamento antes de cada novo tenant.
- **Instância isolada** (modelo atual) mantida como **tier "enterprise"/alto risco** para clientes que exigem isolamento físico garantido por contrato ou por sensibilidade de dados.

Este documento detalha o que já existe, o que falta, o modelo de dados proposto, a estratégia de isolamento de credenciais, o fluxo de auto-descoberta via API de Agency do GHL, o cenário de sub-conta "traga sua própria chave" (BYOK), a área de gestão Agency, o plano de migração em fases (com estimativa de esforço e critério de abandono), os riscos concretos com mitigação, os trade-offs honestos do modelo (com estimativa de custo/ROI), o modelo de billing por sub-conta, o tratamento de LGPD/DPA/offboarding, e o plano de observabilidade.

---

## 2. Estado atual (baseline) — o que já existe e o que falta

### 2.1 O que já existe e funciona (fundação "adormecida")

| Peça | Onde está | Status |
|---|---|---|
| Tabela `workspaces` (id, name, owner_id, settings JSONB) | `supabase/migrations/20260225100000_create_workspaces_and_members.sql` | ✅ Em produção |
| Tabela `workspace_members` (workspace_id, user_id, role: owner/admin/member, is_active) | mesma migration | ✅ Em produção |
| RPC atômica `create_workspace_with_owner(name, settings)` | mesma migration | ✅ Em produção, já usada pelo script de provisionamento |
| Funções RLS `is_workspace_member/admin/owner(workspace_id)` (SECURITY DEFINER, evita recursão) | `supabase/migrations/20260225102000_fix_workspace_members_rls_recursion.sql` | ✅ Padrão usado em ~90 tabelas |
| Sub-apps ativáveis por workspace (`workspace_apps`, `app_role_permissions`, `app_user_overrides`, `app_feature_role_permissions`, `app_feature_user_overrides`) | `docs/SUB-APPS-MODULARES.md`, `docs/APP-STORE-EXPERIENCE.md` | ✅ Em produção, com seed automático via trigger `trg_new_workspace_setup_apps` |
| Seletor de workspace no frontend, multi-workspace por usuário, seleção persistida em `localStorage` | `eb-dash2/src/lib/workspace.ts`, `eb-dash2/src/components/layout/WorkspaceSelector.tsx` | ✅ Construído, mas **escondido** por `SINGLE_WORKSPACE_MODE = true` |
| Mapeamento GHL multi-conta (campos, pipelines, estágios) por workspace | `ghl_field_mappings`, `ghl_pipeline_mappings`, `ghl_stage_mappings`, `ghl_field_mapping_templates` com seed automático | ✅ Em produção — esta é a peça **mais madura** para reaproveitar |
| Resolução de workspace a partir do `location_id` do GHL | função SQL `get_workspace_id_by_ghl_location_id(location_id)`, usada em `extrair_dados_ghl_v2()` | ⚠️ Existe, mas com fallback frágil (ver 2.2) e **sem constraint de unicidade de `location_id`** (ver seção 3.5, achado crítico da revisão) |

Ou seja: **a arquitetura de dados e permissões já foi pensada para multi-tenant desde o início**. O trabalho não é "inventar multi-tenancy do zero" — é "reativar e endurecer o que já existe, e fechar os gaps de credenciais".

### 2.2 Os gaps críticos (o que falta para multi-tenant real e seguro)

Estes são os pontos que hoje **assumem implicitamente que existe só 1 cliente por instância**, e que precisam mudar antes de um segundo tenant real coexistir com segurança:

1. **Credenciais de integração são globais por instância, não por workspace.** A `GHL_API_KEY`, `GHL_LOCATION_ID`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `OPENROUTER_API_KEY`, `NOTION_API_KEY` — todas são variáveis de ambiente **únicas**, lidas como constantes de módulo (uma vez, no cold start) em 16+ edge functions. Nenhuma delas recebe `workspace_id` para decidir qual credencial usar.
2. **O webhook de entrada (`webhook-ghl`) valida um único segredo global** (`WEBHOOK_SECRET`), não um segredo por sub-conta/location. O `locationId` do payload só é usado para auditoria no momento da ingestão.
3. **A resolução real de workspace a partir do `location_id`** (`get_workspace_id_by_ghl_location_id`) tem um **fallback silencioso**: quando não encontra match exato, cai para "o workspace mais antigo" (determinístico via `ORDER BY created_at ASC LIMIT 1` — não é aleatório, é sempre o mais antigo, silenciosamente, para sempre). Isso é seguro hoje porque só existe 1 workspace real — mas é uma bomba-relógio de vazamento entre tenants no dia em que houver 2+. **Adicionalmente identificado na revisão crítica: nada impede o caso inverso — dois registros com o mesmo `location_id`** (ver seção 3.5).
4. **O webhook de saída (outbound) do OpenClaw** tem URL e token **hardcoded como string literal dentro de ~7 migrations SQL diferentes** — o pior caso de todos, nem env var é.
5. **~12 tabelas têm `workspace_id` como coluna nullable, adicionada tardiamente, e NÃO POPULADA** (`meta_ads_*`, `weekly_*`) — o próprio texto das migrations reconhece o gap ("GAP IDENTIFICADO... Não popula workspace_id automaticamente").
6. **~20-25 tabelas de infraestrutura não têm `workspace_id` nenhum** (`ghl_tasks`, `ghl_api_jobs`, `contact_opp_sync_queue`, `webhooks_ghl`, logs de sync, tabelas de bots de IA) — presumem 1 único tenant por banco.
7. **As tabelas centrais do CRM** (`oportunidades`, `comunicacoes`, `vendas_fechamento`) não têm coluna `workspace_id` própria — resolvem via join indireto (`get_contact_workspace_id(contato_id)`). Funciona para RLS de leitura, mas escala mal e é um ponto cego para registros órfãos.
8. **O provisionamento atual sempre cria uma instância nova** (`scripts/provision-new-client.ts`) — não existe hoje um fluxo de "criar um novo tenant dentro de uma instância Agency já existente".
9. **Não existe nenhum conceito de "Agency"** no schema atual — é um modelo flat: usuário pertence a N workspaces via `workspace_members`, todos no mesmo nível. Não há papel "dono de agência que vê todas as sub-contas automaticamente".
10. **Não existe nenhuma integração com a Agency API/OAuth do GHL** — nem client_id/secret, nem refresh token, nem chamada a endpoints de nível agência. Isso precisa ser construído do zero.
11. **(Novo, identificado na revisão crítica) Não existe nenhum modelo de billing/atribuição de custo por sub-conta**, nenhum tratamento de LGPD/DPA para dados de leads de terceiros coexistindo na mesma infraestrutura, e nenhum fluxo de offboarding com exclusão real de dados — ver seções 14, 15 e 16.

---

## 3. Modelo de dados proposto

### 3.1 Decisão de design: `agencies` como camada nova, não self-reference em `workspaces`

Duas opções foram avaliadas:

- **(A) Self-reference em `workspaces`** (`parent_agency_id UUID REFERENCES workspaces(id)`): reaproveita a tabela existente, mas força toda função de RLS a distinguir "isso é um nó agência ou uma sub-conta folha?" — introduz ambiguidade estrutural exatamente no lugar que mais precisa ser inequívoco.
- **(B) Nova tabela `agencies`** separada, com uma tabela de junção `agency_workspaces`: mantém `workspaces` como está hoje (zero risco de regressão nas ~90 políticas de RLS existentes), e trata "Agency" pelo que ela semanticamente é — uma entidade de governança/integração/billing que **não guarda leads nem dados de negócio diretamente**, apenas administra um conjunto de sub-contas.

**Decisão: opção (B).** É mais trabalho inicial (mais uma tabela, mais uma camada de RLS), mas é estruturalmente mais seguro e mais fácil de auditar — "isso pertence a uma Agency" e "isso é uma sub-conta com dados" nunca se confundem no mesmo campo.

### 3.2 Novas tabelas

```sql
-- Agência: entidade de topo, sem dados de negócio próprios
CREATE TABLE agencies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    ghl_agency_company_id TEXT,             -- companyId do GHL, quando aplicável
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb NOT NULL
);

-- Membros da agência (espelha workspace_members)
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

-- Junção Agency <-> Workspace (sub-conta)
CREATE TABLE agency_workspaces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provisioning_mode TEXT NOT NULL CHECK (provisioning_mode IN ('auto_discovered', 'manual_byok')),
    ghl_location_id TEXT,   -- CACHE NÃO-AUTORITATIVO de exibição; NÃO é a fonte de verdade da resolução (ver 3.5)
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id)   -- 1 workspace pertence a no máximo 1 agência
);
```

`UNIQUE(workspace_id)` em `agency_workspaces` é uma decisão deliberada: simplifica toda a lógica de RLS porque nunca existe ambiguidade de "sob qual agência este workspace está" — sempre 0 ou 1.

**Fonte de verdade de `ghl_location_id` (corrigido na v3 — a v2 mandava aplicar constraint aqui mas não a aplicava, gerando inconsistência interna):** `agency_workspaces.ghl_location_id` é apenas **cache não-autoritativo de exibição**. A **única fonte de verdade** para resolução de credencial e detecção de colisão é `ghl_integration_settings.ghl_location_id`, que é a tabela que a função viva `get_workspace_id_by_ghl_location_id` consulta — e é ela que recebe a constraint de unicidade parcial e a validação de prova de posse da seção 3.5. A função de resolução **nunca** consulta `agency_workspaces` para rotear webhooks. Consequentemente, a guarda de colisão do discovery (seção 6.1) é fechada pela constraint/pré-checagem em `ghl_integration_settings` no passo que popula essa tabela, não pelo insert em `agency_workspaces`.

**Transferência de sub-conta entre agências (cenário real de revenda, cliente troca de agência dona no GHL):** como `UNIQUE(workspace_id)` só permite uma linha por workspace, mudar de agência é um `UPDATE agency_workspaces SET agency_id = <nova>` na mesma linha — nunca um insert paralelo. Essa operação **deve ser exclusivamente feita por uma RPC `SECURITY DEFINER` dedicada** (`transfer_agency_workspace(p_workspace_id, p_new_agency_id)`), nunca por UPDATE direto de um admin de agência via PostgREST, e deve gravar uma linha imutável em uma tabela de auditoria (`agency_workspace_transfers`: workspace_id, old_agency_id, new_agency_id, transferred_by, transferred_at). Um teste de isolamento dedicado (seção 4.1) confirma que, imediatamente após a transferência, a agência antiga perde 100% do acesso àquele workspace na próxima query (RLS reavaliado por sessão, sem cache que mascare a mudança).

### 3.3 Funções de RLS adicionais (aditivas, não substitutas)

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
        AND is_active = true AND role IN ('owner', 'admin'));
$$;

-- v2: CORRIGIDO — a v1 desta função não filtrava por agency_workspaces.status,
-- o que dava a qualquer agency_admin ativo leitura E escrita irrestritas sobre
-- uma sub-conta marcada 'suspended' (achado CRÍTICO da revisão, ver Anexo A).
CREATE OR REPLACE FUNCTION can_access_workspace_via_agency(p_workspace_id UUID) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
    SELECT EXISTS (
      SELECT 1 FROM agency_workspaces aw
      JOIN agency_members am ON am.agency_id = aw.agency_id
      WHERE aw.workspace_id = p_workspace_id
        AND aw.status = 'active'                          -- ← linha nova, obrigatória
        AND am.user_id = auth.uid() AND am.is_active = true
        AND am.role IN ('owner', 'admin')
    );
$$;
```

**Regra de aplicação:** as políticas RLS existentes (`USING (is_workspace_member(workspace_id))`) **permanecem intactas**. Adiciona-se uma **segunda política permissiva** `USING (can_access_workspace_via_agency(workspace_id))` em cada tabela que já usa `is_workspace_member`. Isso dá ao dono da agência acesso a todas as sub-contas **ativas** — sem precisar virar `workspace_members` em cada uma (evitaria poluir a lista de membros de cada sub-conta com o dono da agência).

**Consolidação recomendada em uma única política (novo na v3):** como o Postgres combina políticas `PERMISSIVE` com `OR` e a ordem de avaliação depende do planner (curto-circuito não garantido), avaliar consolidar as duas condições numa **única política** `USING (is_workspace_member(ws) OR can_access_workspace_via_agency(ws))` por tabela. Isso torna a ordem de avaliação determinística (`is_workspace_member` primeiro, o caminho barato para o membro comum, antes de tocar o `EXISTS` correlacionado de agência) e reduz a dependência do curto-circuito implícito. Vale para ambas as abordagens: o gerador programático (abaixo) pode emitir tanto a política irmã separada quanto a condição consolidada — decidir uma e documentar.

**Decisão explícita sobre sub-conta `suspended` (antes implícita e não aplicada — corrigido na v2; janela MVCC documentada na v3):** uma sub-conta suspensa tem, para **novos statements após o commit da suspensão**, acesso zero via a política aditiva de agência — nenhuma leitura, nenhuma escrita, até reativação explícita (ver seção 3.6, fluxo de reativação com confirmação humana). **Ressalva de consistência (v3):** por semântica MVCC do Postgres, um statement de longa duração (ex.: export/streaming de milhares de linhas de `comunicacoes`) que **já começou a varrer antes do commit** continua sob seu snapshot até terminar, e uma transação em `REPEATABLE READ`/`SERIALIZABLE` mantém o snapshot de início da transação — ou seja, a suspensão **não corta acesso já em execução instantaneamente**. Como neste stack Supabase/PostgREST as queries rodam em `READ COMMITTED` e são limitadas por `statement_timeout`, a janela é curta na prática, mas não é zero. Mitigações: (a) na RPC de suspensão, além do `UPDATE status='suspended'`, considerar encerrar sessões em voo do `agency_admin` associado via `pg_terminate_backend` (item de médio prazo, não bloqueante), ou aceitar explicitamente a consistência eventual limitada por `statement_timeout`; (b) teste concorrente na suite da seção 4.1 — abrir statement longo como `agency_admin`, suspender no meio e afirmar o comportamento (idealmente falha após o commit; no mínimo, documentar a janela). Se o negócio precisar de leitura histórica de uma sub-conta suspensa (ex.: export final de faturamento antes de desligar o cliente), isso deve passar por uma **RPC dedicada, chamada explicitamente pelo admin da agência, que loga a ação** — nunca por uma política RLS ampla reaberta com escopo "reduzido".

**Índices de suporte obrigatórios para as funções de agência (novo na v3 — sem eles a política aditiva degrada sob volume):** como `can_access_workspace_via_agency` faz um `EXISTS` correlacionado com `JOIN agency_workspaces × agency_members` avaliado por linha varrida no pior caso (admin de agência, quando `is_workspace_member` é falso e o segundo `EXISTS` realmente executa), a **mesma migration** que cria as tabelas de agência deve versionar os índices de suporte:

```sql
CREATE INDEX idx_agency_members_user_active
  ON agency_members (user_id, agency_id) WHERE is_active = true;
CREATE INDEX idx_agency_workspaces_ws_active
  ON agency_workspaces (workspace_id, agency_id) WHERE status = 'active';
-- Confirmar que workspace_members(user_id, workspace_id) já é indexado (é hoje).
```

**Fazer esse retrofit à mão em ~90 tabelas é um convite a erro.** Gerar a migration programaticamente — mas o gerador **não pode** assumir que a política irmã é sempre `can_access_workspace_via_agency(workspace_id)` (corrigido na v3, ver seção 3.3.2 abaixo, pois 3 tabelas centrais do CRM resolvem workspace por join, não por coluna direta). O gerador deve extrair o argumento real de cada política que referencia `is_workspace_member`/`is_workspace_admin` e emitir a irmã com o **mesmo argumento**, além de emitir um **relatório de cobertura** que faz a migration falhar se qualquer tabela protegida por RLS de workspace ficar sem política de agência.

As políticas `service_role USING (true)` permanecem intocadas — continuam corretas e necessárias para as edge functions.

### 3.3.1 `can_access_workspace_via_agency` é um ponto único de risco máximo — tratamento de processo diferenciado

A revisão crítica identificou que, como o Postgres combina múltiplas políticas `PERMISSIVE` na mesma tabela com `OR`, um único bug de lógica nesta função (ou em `is_agency_member`/`is_agency_admin`, das quais ela depende) abre ou fecha acesso cross-tenant em **todas as ~90 tabelas simultaneamente**, de uma vez só — sem precisar de bug em nenhuma tabela individual. Isso é qualitativamente diferente de um bug em uma política isolada de uma única tabela, e o plano precisa tratar essas 3 funções com um rigor de processo maior do que o resto do schema:

1. **Revisão obrigatória de 2 pessoas** em qualquer PR/migration que altere o corpo dessas 3 funções — travar via CODEOWNERS no(s) arquivo(s) de migration que as define(m), não depender de lembrete manual.
2. **Suite de testes unitários SQL dedicada e exaustiva**, separada da suite de isolamento A/B genérica da seção 4.1. Casos obrigatórios: `p_workspace_id`/`p_agency_id`/`auth.uid()` NULL; usuário com múltiplas linhas em `agency_members` (uma ativa, uma inativa) — a inativa nunca deve conceder acesso; `agency_workspaces` apontando para agência deletada (`ON DELETE CASCADE`); role fora de `('owner','admin')`, incluindo `'staff'` (já previsto no `CHECK` da tabela) — teste que falha explicitamente se a condição de role for ampliada sem atualização do teste; e o caso central desta correção — `status != 'active'` nunca concede acesso mesmo com `role='owner'` e `is_active=true`.
3. Esta suite roda em CI a cada mudança nessas 3 funções especificamente, não apenas como parte da suite geral de isolamento por workspace (ver item novo na seção 4.1).
4. **Alternativa de médio prazo, não bloqueante para a Fase 1:** considerar substituir o acesso "silencioso" via RLS por uma ação de **impersonation explícita e auditada** — o admin de agência aciona uma RPC que emite um token de sessão de escopo limitado (`workspace_id` alvo, TTL curto) e grava linha em `agency_impersonation_log`, em vez de a política RLS conceder acesso irrestrito o tempo todo. Isso não substitui os itens 1-3 (que continuam necessários enquanto a política aditiva existir), mas reduz a janela de exposição de um bug futuro na função de dias/semanas de rollout para o tempo de vida de um token de impersonation.
5. **Dimensão de desempenho, não só de segurança (novo na v3):** a mesma amplificação por `OR` que torna essa função um risco de segurança máximo a torna também um risco de **desempenho** máximo — no pior caso (admin de agência, `is_workspace_member` falso) o `EXISTS` correlacionado executa por linha varrida sobre tabelas grandes (`comunicacoes` ~78k, `oportunidades` ~4770). Portanto, a Fase 1 **não é declarada "pronta" sem um gate de performance**: (a) versionar os índices de suporte da seção 3.3 na mesma migration; (b) rodar `EXPLAIN (ANALYZE, BUFFERS)` antes/depois em `comunicacoes` e `oportunidades` sob dataset **production-like** (o ambiente de staging da seção 4.1, não os 2 workspaces sintéticos da CI), incluindo explicitamente o caminho do admin de agência (pior caso); (c) registrar os números baseline — sem eles, não há como provar ausência de regressão.

### 3.3.2 Gerador de políticas deve tratar as 3 tabelas centrais do CRM (predicado por join) — corrigido na v3

A revisão profunda identificou que o gerador ingênuo da seção 3.3 (emitir sempre `can_access_workspace_via_agency(workspace_id)`) **quebra ou gera política incorreta** para as 3 tabelas centrais do CRM, cujas políticas RLS resolvem workspace por **argumento de função**, não por coluna `workspace_id` direta (confirmado no código real, `supabase/migrations/20260704000000_rls_data_tables_workspace_isolation.sql`):

- `oportunidades` e `comunicacoes`: `is_workspace_member(get_contact_workspace_id(contato_id))`.
- `vendas_fechamento`: predicado **combinado** — `is_workspace_member(get_contact_workspace_id(contato_id)) OR is_workspace_member(get_opportunity_workspace_id(oportunidade_id))`.

Na Fase 1 essas tabelas **nem têm** a coluna `workspace_id` (a denormalização só vem na Fase 6, seção 4.3), então um template com argumento `workspace_id` faria a migration falhar ou emitiria uma política que não concede acesso de agência justamente ao **funil, às mensagens e ao faturamento** — o dado que a Agency existe para administrar — e "revisar o SQL gerado" não detecta uma tabela ausente/errada. Regras obrigatórias do gerador:

1. **Reconstruir o argumento real** de cada política: emitir `can_access_workspace_via_agency(get_contact_workspace_id(contato_id))` para `oportunidades`/`comunicacoes`, e reproduzir o predicado combinado com `OR` para `vendas_fechamento` (`... via_agency(get_contact_workspace_id(contato_id)) OR ... via_agency(get_opportunity_workspace_id(oportunidade_id))`). Como `can_access_workspace_via_agency` recebe um `workspace_id` **já resolvido**, funciona igual para argumento por coluna ou por função.
2. **Enumerar alvos por presença de RLS de workspace** (não por match textual), e manter um **catálogo explícito** das tabelas de predicado-por-join (as 3 do CRM + qualquer outra que use `get_*_workspace_id`) como casos especiais conhecidos.
3. **Relatório de cobertura que FALHA a migration** se qualquer tabela com RLS de workspace ficar sem política irmã de agência — em vez de depender de revisão humana, que não detecta ausência.
4. **Tabelas particionadas**: tratar explicitamente política na parent vs. children, e nomes de política não padronizados.
5. **Resolver a dependência de ordem** com a denormalização da seção 4.3: adotamos a opção de **manter a ordem atual** (denormalização das 3 tabelas só na Fase 6) e o gerador usa o **argumento por função** nessas tabelas já na Fase 1. Fica documentado que, quando a Fase 6 adicionar a coluna `workspace_id` direta e confiável a essas tabelas, as políticas podem (opcionalmente) ser reescritas para a coluna, reexecutando toda a suite de isolamento da seção 4.1.
6. **Teste de isolamento dedicado (seção 4.1):** `agency_admin` de sub-conta **ativa** consegue LER `oportunidades`/`comunicacoes`/`vendas_fechamento` daquela sub-conta (e ZERO de sub-conta suspensa/de outra agência) — cobrindo exatamente as 3 tabelas que o gerador ingênuo deixaria de fora.

### 3.4 Frontend: `SINGLE_WORKSPACE_MODE` vira uma função, não uma constante

Hoje: `export const SINGLE_WORKSPACE_MODE = true` (booleano fixo).

Proposto: `resolveTenancyMode(userId)` — se o usuário está em exatamente 1 workspace e não é membro de nenhuma `agency_members`, mantém a UX single-tenant atual **sem nenhuma mudança visual** (isso preserva 100% da experiência do cliente atual, que passa a ser tratado como "a primeira sub-conta da Agency" sem perceber diferença). Se o usuário tem `agency_members` ou pertence a 2+ workspaces, mostra o `WorkspaceSelector` (que já existe, só estava escondido) e a nova área `/agency`.

**Verificação obrigatória desta afirmação (gap identificado na revisão — a suite de isolamento da Fase 0 não testava isso):** ver o novo item 4 da suite de testes na seção 4.1 — um teste de regressão de UX dedicado que confirma programaticamente que `resolveTenancyMode` retorna `'single-tenant'` para o seed fiel ao cliente atual, e que `WorkspaceSelector`/rotas `/agency` não renderizam nesse cenário. Sem esse teste, a promessa "sem nenhuma mudança percebida" nunca foi de fato verificável — era apenas uma alegação de intenção.

### 3.4.1 Múltiplas agências por usuário — Agency Selector (novo, identificado na revisão)

`agency_members` permite, via `UNIQUE(agency_id, user_id)`, que o mesmo usuário seja membro/admin de **N agências diferentes** (cenário real: consultor freelancer atendendo duas agências-cliente distintas da Alto Valor). A seção 8 (área `/agency/*`) precisa de um conceito de "agência ativa", análogo ao `WorkspaceSelector` já existente:

1. Novo helper `getActiveAgencyId()` em `eb-dash2/src/lib/agency.ts`, espelhando `getWorkspaceId()`: lê `agency_id` selecionado de `localStorage` (`eb:selected_agency_id`), valida contra as linhas atuais de `agency_members` do usuário, e se inválido/ausente cai para a única agência (se houver exatamente 1) ou força seleção explícita via UI se houver 2+.
2. Componente `AgencySelector.tsx` no header da área `/agency/*`, visível sempre que `agency_members` do usuário tiver 2+ linhas ativas.
3. **Toda** query/RPC da área `/agency/*` deve receber `agency_id` explícito como parâmetro — nunca inferir "a primeira/única `agency_members` do usuário" via `LIMIT 1` sem filtro (mesma classe de bug do fallback "workspace mais antigo" descrito nas seções 2.2/3.5/5.4).
4. Teste de isolamento dedicado (seção 4.1): usuário membro de agências A e B simultaneamente — trocar a agência ativa no seletor nunca vaza dado de uma agência na tela da outra.

### 3.5 Colisão de `ghl_location_id` entre sub-contas (novo, achado crítico da revisão)

`agency_workspaces` e a tabela viva que hoje resolve credenciais por location (`ghl_integration_settings`) só têm `UNIQUE(workspace_id)` — nenhuma delas impede que **duas sub-contas diferentes acabem com o mesmo `ghl_location_id`**, seja por erro de digitação de um operador no fluxo BYOK (seção 7) ou por um match errado no discovery automático (seção 6). Como `get_workspace_id_by_ghl_location_id` já usa `ORDER BY created_at ASC LIMIT 1`, uma duplicata não gera comportamento aleatório — gera um roteamento **deterministicamente errado e silencioso**: o workspace mais antigo com aquele `location_id` vence para sempre, e webhooks/eventos do cliente B passam a ser processados e potencialmente escritos no workspace do cliente A.

**Correção obrigatória, a aplicar antes de qualquer fluxo BYOK ou de auto-descoberta entrar em produção:**

```sql
CREATE UNIQUE INDEX uq_ghl_integration_settings_location_id
  ON ghl_integration_settings (ghl_location_id)
  WHERE ghl_location_id IS NOT NULL AND is_active = true;
```

(`WHERE is_active = true`, não apenas `IS NOT NULL`, para permitir suspender/reativar uma sub-conta sem colisão perene com um registro desativado — consistente com o padrão `status`/`is_active` já usado em `agency_workspaces`.) **A fonte de verdade é `ghl_integration_settings`** (ver decisão explícita na seção 3.2); `agency_workspaces.ghl_location_id` é só cache não-autoritativo e **não** recebe constraint de resolução — a função de roteamento nunca o consulta.

Além da constraint de banco: o fluxo BYOK (seção 7, passo 2) deve fazer uma pré-checagem (`SELECT 1 FROM ghl_integration_settings WHERE ghl_location_id = :novo AND is_active = true`) e retornar erro amigável ao operador **antes** de tentar o insert — não depender só do erro `23505` do Postgres estourando na UI.

### 3.5.1 Prova de posse do location — contra "location squatting" (novo, achado de segurança da rodada 2)

A constraint de unicidade impede duplicata, mas **não** exige prova de que quem cadastra um `ghl_location_id` realmente controla aquele location no GHL. Sem isso, um operador/tenant adversário pode registrar o `locationId` (semi-público — aparece em webhooks/URLs) de outra empresa, causando: (1) **DoS** — o dono legítimo fica impedido de conectar seu próprio location porque a constraint o rejeita; (2) **interceptação** — no caminho Marketplace App (seção 5.4, `auto_discovered`), como o roteamento é determinístico (`ORDER BY created_at ASC LIMIT 1` sobre linhas `is_active`), o squatter que registrou primeiro captura os webhooks reais do location assim que a agência instalar o app no location verdadeiro. A verificação de titularidade da seção 3.6 cobre só **reativação** de sub-conta suspensa, não o cadastro inicial. Correção — exigir prova de posse **antes** de gravar `ghl_location_id` com `is_active=true`, em TODOS os fluxos:

1. **BYOK (seção 7):** após o intake da credencial (7.1), chamar a API do GHL com essa credencial e confirmar que o token/location retornado corresponde exatamente ao `locationId` cadastrado (ex.: `GET /locations/{locationId}` ou o location próprio do token). Rejeitar o cadastro se não houver match — a chave já está disponível no fluxo, então a validação é barata e fecha squatting **e** erro de digitação.
2. **Marketplace/`auto_discovered` (seção 5.4/6):** só marcar `is_active=true` após confirmar instalação/consentimento do App naquele location específico (o próprio evento de install é a prova).
3. **Estado intermediário:** gravar como `status='pending_verification'` até a prova. `get_workspace_id_by_ghl_location_id` **nunca** roteia para linha não verificada — uma linha pending jamais pode vencer o `ORDER BY created_at ASC LIMIT 1`.
4. **Resolução de colisão explícita** (substitui o vago "gera alerta" da seção 6.1): quando um requerente **com prova de posse atual** colide com uma linha existente **não verificada/squatter**, a prova de posse atual vence e a linha antiga é revogada/desativada — nunca deixar o mais antigo vencer só por ser mais antigo.
5. **Teste de squatting na suite (seção 4.1):** tenant X registra o `locationId` de Y sem posse → cadastro rejeitado; e um `locationId` pending nunca captura o roteamento de webhooks reais de Y.

### 3.6 Reativação de sub-conta suspensa nunca é automática (novo, identificado na revisão)

Combinado ao ponto anterior: uma sub-conta `suspended` **preserva 100% do histórico de negócio do tenant anterior** (regra da seção 6.1, item 4). Se o mesmo `ghl_location_id` reaparecer no discovery (reaproveitamento de sub-conta no GHL por outro cliente, ou erro de matching), o sistema **nunca deve reativar/reconectar automaticamente** um workspace `suspended` a um novo location_id:

1. Se um `locationId` que já existe em `agency_workspaces` com `status='suspended'` reaparecer no discovery, o fluxo **para e sinaliza** (linha em tabela de pendências de revisão manual / notificação ao dono da agência) — nunca reconecta silenciosamente.
2. Reativação manual (botão "reativar sub-conta" da seção 8) exige confirmação humana explícita, comparando lado a lado nome/company_id/e-mail do owner original (de `workspace_members` antes da suspensão) contra os metadados atuais retornados pela API do GHL para aquele `locationId`.
3. Se a confirmação indicar empresa diferente (ou não houver confirmação), o sistema **sempre cria um `agency_workspaces` novo**, deixando o workspace suspenso antigo intocado e nunca reconectado ao novo `location_id`.
4. Este risco entra explicitamente na tabela de riscos da seção 11.

---

## 4. Isolamento de dados hermético

### 4.1 Estratégia de defesa em profundidade

Não confiar só no RLS. Quatro camadas obrigatórias (item 4 é novo — corrige gap identificado na revisão crítica):

1. **RLS no banco** (linha de defesa primária) — já existe, precisa ser estendido às tabelas do gap (seção 2.2, itens 5-7) e ter o fallback frágil eliminado (item 3).
2. **Filtro explícito no client** — já é regra documentada no projeto (`docs/DASHBOARD-CONTROLE-ACESSO.md`, seção 9: *"RLS protege no banco, mas o frontend também deve filtrar"*). Continua valendo e se torna ainda mais crítico com múltiplos tenants ativos simultaneamente na mesma sessão de navegador (troca de sub-conta).
3. **Suite de testes automatizados de isolamento** (nova, é a peça que falta hoje) — testes que, para dois workspaces semeados A e B com um usuário só em A, garantem:
   - Toda tabela protegida por RLS retorna **zero linhas** ao tentar ler dados de B autenticado como usuário de A.
   - Chamadas diretas ao PostgREST com o JWT de A contra `workspace_id` de B retornam 0 linhas (não apenas erro 403 — checar que não vaza nem um registro).
   - **Teste de credencial cross-tenant**: mockar duas credenciais de API GHL distintas para dois workspaces e confirmar que a chamada de cada workspace usa a chave correta — isso é mais importante ainda que o teste de RLS, porque uma falha aqui não é "ler dado errado", é "**escrever/chamar a API do cliente errado**".
   - **Suite dedicada de `can_access_workspace_via_agency`/`is_agency_member`/`is_agency_admin`** (seção 3.3.1): parâmetros NULL, membro inativo, agência deletada, role fora do esperado, e — o caso central da correção desta v2 — **workspace com `agency_workspaces.status='suspended'` não é gravável nem legível por nenhum `agency_member`, mesmo com `role=admin` e `is_active=true`**. Roda antes de cada fase, igual aos demais testes de isolamento A/B.
   - **Teste de transferência de sub-conta entre agências** (seção 3.2): após `transfer_agency_workspace`, a agência antiga perde 100% do acesso na próxima query.
   - **Teste de troca de agência ativa** (seção 3.4.1): usuário membro de 2 agências nunca vê dado de uma na tela da outra.
   - **Teste de regressão de UX single-tenant** (gap identificado na revisão — a v1 não tinha isso): com um seed fiel ao cliente atual (1 workspace, 1 usuário, zero linhas em `agency_members`), `resolveTenancyMode(userId)` deve retornar exatamente `'single-tenant'`, e um teste de componente deve confirmar que `WorkspaceSelector` e qualquer rota `/agency` não renderizam nesse cenário. Este teste roda na Fase 0 (baseline) e é reexecutado como gate de aceite da Fase 1 — sem ele, a promessa "cliente atual sem nenhuma mudança percebida" (seção 3.4) não é verificável, é só uma alegação de intenção.
   - **Teste de isolamento de `outbound_webhooks`** (seção 5.2): dois workspaces A e B, cada um com seu webhook para `contrato_assinado`; disparar evento no workspace A e confirmar programaticamente que só o endpoint mock de A recebeu request (B recebeu zero chamadas) — necessário porque a trigger que dispara os webhooks é `SECURITY DEFINER` e roda fora do contexto de RLS de sessão, então o teste genérico de RLS não cobre esse caminho.
   - Esse suite roda **antes de cada fase** deste plano e continua rodando **periodicamente** (não é um teste que se roda uma vez e esquece). **Regime de execução (novo na v3):** preferencialmente contra o projeto de **staging isolado** (ver abaixo), não contra o banco de produção do cliente. Quando rodar em produção, é obrigatório: (a) usar **exclusivamente tenants sintéticos efêmeros** com teardown garantido — transação com `ROLLBACK` ou `DELETE` determinístico por prefixo/marcador ao fim de cada execução, com verificação pós-run de que zero linhas de teste permaneceram; (b) **jamais** ler ou mutar linhas de tenants reais; (c) **nenhum passo** da suite faz chamada externa não mockada — estender a garantia de mock (hoje citada só nos testes de credencial cross-tenant e `outbound_webhooks`) a **toda** a suite, com um assert que falha se qualquer `net.http_post` real for tentado. Documentar na seção 15 que os dados sintéticos ficam segregados/expurgados e não contam para a superfície de isolamento nem para relatórios (fecha a alegação de segregação LGPD).

**Pré-requisito de ambiente de homologação/staging (novo na v3 — a v2 ia de CI sintética direto para produção):** antes de aplicar qualquer migration/refatoração de cada fase na instância viva do cliente pagante, provisionar um **projeto Supabase de staging** (reaproveitando `scripts/provision-new-client.ts --create-supabase`) que espelhe o schema do cliente atual e receba um **snapshot ANONIMIZADO com volume production-like** (ordem de 78k `comunicacoes`, 4770 `oportunidades`, ~90 políticas RLS reais). A anonimização é **obrigatória** para não violar as seções 15/16 (LGPD) ao copiar dados de terceiros. **Regra de gate entre fases:** toda migration/refatoração (retrofit de RLS, `ALTER SET NOT NULL`, isolamento de credenciais) é aplicada **primeiro em staging**, onde rodam (a) a suite de isolamento acima, (b) **benchmarks de latência de query sob volume real** para detectar regressão de RLS (seção 3.3.1, item 5), (c) **medição da duração do lock do `ALTER`** sob carga simulada de webhooks (seção 4.2), e (d) um **ensaio completo de rollback** (seção 10.4). Só promover à instância de produção do cliente após "green" em staging. A CI com 2 workspaces sintéticos **não** reproduz regressão de performance de RLS, duração de lock nem rollback — por isso o staging é indispensável.

### 4.2 Backfill das tabelas com gap

Para as ~12 tabelas com `workspace_id` nullable não populado (`meta_ads_*`, `weekly_*`):
1. Escrever migration de backfill reaproveitando os mesmos joins já usados em `get_contact_workspace_id`.
2. Validar cobertura 100% (`SELECT count(*) WHERE workspace_id IS NULL` deve ser 0).
3. Só então apertar para `NOT NULL` — e só depois de o contador ficar em 0 por pelo menos 2 dias seguidos em produção (evita a corrida de **cobertura**: processos que ainda estejam inserindo sem o campo).

**Migração online segura do aperto `NOT NULL` (novo na v3 — a "corrida dos 2 dias" trata só a cobertura, não o lock do próprio `ALTER`):** `ALTER COLUMN ... SET NOT NULL` direto adquire `ACCESS EXCLUSIVE` e faz um full table scan de validação, bloqueando **todos os reads/writes** durante a validação — inaceitável em tabelas de alto volume/append-only como `webhooks_ghl` e na fila `ghl_api_jobs`, onde travaria a ingestão viva do cliente. Padrão obrigatório nessas tabelas (e recomendado em `comunicacoes`):
   1. **Deploy antes do ALTER** do código que já popula `workspace_id` (edge functions/webhook gravando a coluna), para que nenhum INSERT concorrente aterrisse com NULL entre o `count(*)=0` e o ALTER.
   2. **Não** usar `SET NOT NULL` direto: `ALTER TABLE t ADD CONSTRAINT t_ws_not_null CHECK (workspace_id IS NOT NULL) NOT VALID;` (`ACCESS EXCLUSIVE` apenas instantâneo, sem scan) → depois `ALTER TABLE t VALIDATE CONSTRAINT t_ws_not_null;` (usa `SHARE UPDATE EXCLUSIVE`, não bloqueia reads/writes) → e só então, opcionalmente, `SET NOT NULL` (que aproveita a CHECK já validada e pula o full scan sob `ACCESS EXCLUSIVE`, PG12+).
   3. **Sempre** preceder cada DDL de `SET lock_timeout = '2s';` com retry em backoff, para o ALTER não empilhar na fila de lock atrás de uma transação longa (ex.: worker no meio de um batch em `ghl_api_jobs`) e bloquear todas as queries novas.
   4. Agendar em janela de baixo tráfego e **medir a duração real do lock em staging** (seção 4.1) antes de produção.
   5. Avaliar se `webhooks_ghl` (append-only/imutável) realmente precisa de `NOT NULL` nas linhas históricas ou se basta a constraint em novos INSERTs via default/trigger — evitando reescrever/validar a tabela inteira.

Para as ~20-25 tabelas de infraestrutura sem `workspace_id` (`ghl_tasks`, `ghl_api_jobs`, `contact_opp_sync_queue`, `webhooks_ghl`, logs de sync, tabelas de bots de IA):
1. Adicionar coluna nullable.
2. Fazer backfill via a entidade que a linha referencia (contato/oportunidade → workspace).
3. Adicionar RLS `is_workspace_member`.
4. Apertar para `NOT NULL` depois de validado.
5. Priorizar as tabelas que o **frontend consulta diretamente** (maior risco de exposição); tabelas puramente internas de fila, acessadas só por `service_role`, são mais seguras hoje (só o `service_role` as toca), mas devem ganhar a coluna de qualquer forma — no dia em que a fila precisar processar por tenant com rate limit próprio (ver seção 11) **e no dia em que precisar de atribuição de custo por sub-conta (ver seção 14)**, a coluna já vai estar lá.

### 4.3 As tabelas centrais do CRM (`oportunidades`, `comunicacoes`, `vendas_fechamento`)

Hoje resolvem workspace via join (`get_contact_workspace_id(contato_id)`). Isso é seguro para RLS, mas:
- Não escala bem em performance quando há muitas sub-contas e volume alto (join extra em toda query).
- Não permite associar um registro "órfão" (contato deletado) a um workspace.

**Recomendação:** adicionar coluna `workspace_id` denormalizada, populada por trigger a partir de `contatos.workspace_id` no momento da inserção. É uma melhoria de performance/simplicidade, não um requisito de segurança **para leitura** (o join RLS já é seguro) — por isso fica priorizada **depois** da Fase de credenciais (seção 5), mas **antes** de aceitar muitas sub-contas simultâneas (Fase 6). **Nota adicional (revisão crítica):** essa denormalização também é pré-requisito de segurança para o hard-delete seguro descrito na seção 16.3 — sem `workspace_id` direto e confiável nessas tabelas, um delete por workspace depende do mesmo join indireto, aumentando o risco de apagar dados do tenant errado numa operação destrutiva.

**Backfill histórico e tratamento de órfãos (novo na v3 — a v2 só descrevia a trigger para linhas NOVAS):** a trigger acima cobre inserções futuras, mas **não** as linhas históricas (`oportunidades` ~4770, `comunicacoes` ~78k, `vendas_fechamento`). Sem um backfill explícito, a Fase 6 lista essas tabelas sob o gate "count NULL = 0" sem caminho para chegar a 0. Correção:

1. **Migration de backfill histórica e paginada** para as 3 tabelas, reaproveitando o mesmo join de `get_contact_workspace_id` — respeitando o limite PostgREST/lote SQL (>1000 rows → batch em SQL puro via `UPDATE ... FROM contatos`, ou `.range()` se via edge function), exatamente como a seção 4.2 já descreve para `meta_ads_*`/`weekly_*`.
2. **Estratégia explícita para órfãos** (contato deletado → o join retorna NULL, o que a própria seção admite não ter solução automática): como **hoje há só 1 workspace vivo** (janela single-tenant garantida pela "regra de ouro" da seção 10 de não aceitar 2º tenant antes das Fases 2/8), a migração inicial pode atribuir com segurança o `workspace_id` do único workspace ativo a toda linha órfã — **mas somente se executada antes da existência de qualquer 2º tenant**. Documentar que, após o 1º tenant adicional, órfãos **não** podem mais ser auto-atribuídos: precisam de resolução via `webhooks_ghl.payload` (contact_id histórico) ou **quarentena explícita**, nunca fallback silencioso.
3. **Resolver a tensão do gate `NOT NULL`:** decisão explícita — essas 3 tabelas **entram** no gate `NOT NULL` da Fase 6, e por isso a estratégia de órfãos do item 2 é **pré-requisito obrigatório** (sem ela o `count NULL = 0` nunca fecha, travando o `SET NOT NULL`). Aplicar aqui o mesmo padrão de migração online da seção 4.2.
4. **Nunca trocar a RLS dessas tabelas para a coluna denormalizada enquanto existirem linhas com `workspace_id` NULL** — `is_workspace_member(NULL)=false` esconderia silenciosamente opps/comunicações históricas do dashboard (a mesma classe do bug `pipeline_id` NULL documentado no `CLAUDE.md`, 745 opps invisíveis). A RLS mantém o join seguro até o backfill fechar em 0.
5. **Completude da 16.3:** o export/hard-delete que "varre todas as tabelas com `workspace_id`" **omite silenciosamente** linhas NULL — deixando dado pessoal para trás num pedido de eliminação LGPD (Art. 18). Adicionar um teste de completude (0 linhas dessas 3 tabelas com `workspace_id` NULL após backfill) como pré-condição do fluxo de exclusão.

---

## 5. Isolamento de credenciais/integrações por sub-conta (a fase mais crítica)

Esta é a parte que transforma "isolamento só de leitura via RLS" em **isolamento real de ação** — porque hoje, mesmo que o RLS proteja perfeitamente a leitura de dados, uma chamada de **escrita** para a API do GHL usa **uma única chave para todos os tenants**. Um bug de resolução de workspace não vaza só uma leitura indevida — pode **escrever no CRM do cliente errado**.

### 5.1 Nova tabela de credenciais, com segredo real via Vault

```sql
CREATE TABLE workspace_integration_credentials (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('ghl', 'meta', 'openrouter', 'notion', 'outbound_webhook')),
    secret_key_id UUID NOT NULL,   -- referência a vault.secrets, nunca o valor em texto plano
    metadata JSONB DEFAULT '{}'::jsonb,  -- ex: location_id, ad_account_id, database_id (não sensível)
    rotation_version INTEGER DEFAULT 1 NOT NULL,   -- v2: incrementado a cada rotação/revogação (ver 5.3)
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,  -- v2: trigger de auto-update
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(workspace_id, provider)
);
```

- O segredo real (API key, token) é armazenado via **Supabase Vault** (`pgsodium`/`vault.create_secret`), referenciado por `secret_key_id` — nunca uma coluna de texto plano. Isso segue a mesma decisão de segurança que já levou o time a **remover** `ghl_api_key` da tabela `ghl_integration_settings` (`supabase/migrations/20260709120000_remove_ghl_api_key_from_settings.sql`) — não estamos reabrindo aquele risco, estamos formalizando a versão correta dele.
- **Nunca exposta a `authenticated` via PostgREST.** Só `service_role` pode decifrar. Teste negativo obrigatório: um JWT autenticado normal (mesmo owner do workspace) não deve conseguir `SELECT` desta tabela nem indiretamente via qualquer view.
- **`rotation_version`/`updated_at` são novos na v2** — motivo na seção 5.3.

### 5.2 Webhook outbound (OpenClaw) sai do hardcode SQL — com RLS e filtro de tenant explícitos (endurecido na v2)

Hoje: URL e token do OpenClaw estão literalmente escritos dentro de ~7 migrations SQL diferentes (`net.http_post(url := 'https://openclaw-...', headers := ..., 'x-openclaw-token', 'hooks_...')`).

Proposto:
```sql
CREATE TABLE outbound_webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,          -- ex: 'contrato_assinado'
    url TEXT NOT NULL,
    secret_key_id UUID,                -- referência a vault, se precisar de token
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- v2: RLS explícita, sem política aditiva de agência para escrita
ALTER TABLE outbound_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY outbound_webhooks_select ON outbound_webhooks
  FOR SELECT USING (is_workspace_member(workspace_id));
CREATE POLICY outbound_webhooks_write ON outbound_webhooks
  FOR ALL USING (is_workspace_admin(workspace_id)) WITH CHECK (is_workspace_admin(workspace_id));
```

**Correção da v2 — a v1 não definia RLS para esta tabela nem garantia explicitamente que a trigger filtra por tenant** (achado da revisão: como a função que dispara o webhook é `SECURITY DEFINER`, ela roda fora do contexto de RLS de sessão, então a única defesa real é a query da própria trigger filtrar corretamente). Migração em três etapas:

1. Popular a tabela com os valores hoje hardcoded, para o cliente atual continuar funcionando sem interrupção.
2. Reescrever a trigger (`processar_notificacao_openclaw_contrato_assinado()`) para ler da tabela **com filtro explícito de `workspace_id` do evento que disparou a notificação**, nunca uma busca sem esse filtro:
   ```sql
   SELECT url, secret_key_id FROM outbound_webhooks
   WHERE workspace_id = v_workspace_id   -- workspace da oportunidade/venda que disparou o evento
     AND event_type = 'contrato_assinado' AND is_active;
   ```
3. **Validação de URL contra SSRF** antes de qualquer `net.http_post`: bloquear ranges de IP privados/loopback e o endpoint de metadata `169.254.169.254`, exigir esquema `https://` — a URL é cadastrada pelo próprio tenant (BYOK ou auto-descoberta), então precisa ser tratada como entrada não confiável. **Correção da v3 — a validação textual em SQL NÃO defende contra DNS rebinding:** `net.http_post` é **assíncrono** — enfileira, e um worker de background faz a requisição depois, com **resolução DNS própria e independente** da validação. Isso abre uma janela TOCTOU clássica: um hostname do tenant (`https://rebind.evil.com`) resolve para IP público no instante da validação e para `169.254.169.254`/`10.x`/serviço interno no instante do disparo real; além disso, "bloquear ranges de IP" em plpgsql só se aplica a IP **literal** — um hostname passa trivialmente porque o Postgres não tem resolvedor DNS nativo. **Solução (resolve-then-connect):** rotear todo webhook outbound por uma **edge function (Deno)** que (a) resolve o hostname, (b) valida o IP resolvido contra deny-list (privados/loopback/link-local/`169.254.169.254`), (c) conecta **direto ao IP validado** enviando o `Host` header — eliminando a re-resolução no disparo. Padrão preferível: **allowlist de destinos por-tenant** (domínios pré-aprovados/verificados, deny-by-default) em vez de deny-list de IPs. Adicionar à suite da seção 4.1 um **teste de rebinding**: host cuja resolução muda entre a validação e o disparo → destino interno recusado.
4. Só trocar a trigger de fato depois de confirmar que a tabela está correta para o tenant existente, e depois que o teste de isolamento dedicado (seção 4.1, novo item) passar.

### 5.3 Refatoração das edge functions (o "PR pattern" aplicado 16+ vezes) — cache de credenciais com invalidação real (endurecido na v2)

Hoje, o padrão em todas as edge functions de sync GHL é:
```ts
// nível de módulo — lido 1x no cold start, compartilhado por todas as requisições
const GHL_API_KEY = Deno.env.get('GHL_API_KEY') || '';
const GHL_LOCATION_ID = Deno.env.get('GHL_LOCATION_ID') || 'U8FTcw90CB5QELUnbGUu'; // fallback hardcoded!
```

Isso é **incompatível por construção** com credenciais por tenant — escopo de módulo é por processo, compartilhado entre todas as requisições que aquele processo "quente" atender, não importa de qual tenant sejam.

**Mudança necessária:** mover a resolução de credencial para **dentro do handler da requisição**, chaveada pelo `workspace_id` recebido no payload/job, via um helper compartilhado:

```ts
// supabase/functions/_shared/resolve-workspace-credentials.ts
export async function resolveGhlCredentials(workspaceId: string): Promise<{ apiKey: string; locationId: string }> {
  // lookup em workspace_integration_credentials + vault
  // chave de cache = `${workspaceId}:ghl:${rotation_version}` — nunca `${workspaceId}:ghl` sozinho
  // TTL curto (60-120s) como camada adicional de defesa, não como único mecanismo
}
```

**Correção da v2 — invalidação de cache amarrada à revogação:** a v1 propunha só "cache LRU curto (poucos minutos)" sem definir como o cache é invalidado no momento em que uma credencial é trocada/revogada. Isso é insuficiente porque (a) uma linha atualizada em `workspace_integration_credentials` não muda a chave de cache automaticamente, e (b) isolates Deno de funções de baixo tráfego podem ficar "quentes" por muito mais tempo que o TTL nominal, tornando o TTL uma garantia fraca. Correção:

1. **Chave de cache inclui `rotation_version`** (coluna nova da seção 5.1, incrementada a cada rotação/revogação): `${workspace_id}:${provider}:${rotation_version}`. **Ressalva honesta (v3):** isso só invalida um isolate quente se o resolver **relê o `rotation_version` a cada request** (leitura barata de um `int`) para recompor a chave. Se o isolate cachear a resolução inteira por `workspace_id` sem reler o `rotation_version`, ele continua servindo o plaintext antigo até o TTL — ou seja, a `rotation_version`-na-chave sozinha não fecha a janela. **Decisão desta v3:** o caminho de credencial relê o `rotation_version` por request (via read leve/denylist compartilhada) e usa **TTL curto (poucos segundos)**, de modo que a chave de cache reflita a revogação quase imediatamente.
2. **A garantia efetiva contra credencial obsoleta é a janela de TTL declarada**, não o DELETE no Vault. Como o helper cacheia o **plaintext resolvido** (`Promise<{apiKey, locationId}>`), deletar a secret do Vault **não** apaga o plaintext já em memória do isolate — a afirmação da v2 de que "a próxima chamada falha ao decifrar" só valeria se cada chamada decifrasse do Vault, o que anularia o benefício do cache. Corrigido: declarar e testar a **janela máxima real de exposição pós-revogação como um SLA** (ex.: `<= 10s`).
3. **⚠️ Revogação de emergência — o passo PRIMÁRIO é rotacionar no PRÓPRIO PROVIDER (novo na v3):** deletar a secret do Vault **NÃO mata uma chave já exfiltrada** — uma chave vazada continua 100% válida no GHL/Meta/OpenRouter até ser **rotacionada/revogada lá**. Cenário real (ex-funcionário levou a chave GHL): (a) o passo obrigatório e primeiro do runbook é **rotacionar/revogar a chave no provider upstream**; (b) o DELETE no Vault + incremento de `rotation_version` são passos **secundários** que impedem o próprio Empire de reusar a chave; (c) sem (a), o atacante segue usando a chave diretamente contra a API do provider indefinidamente. O runbook (e um checklist/teste) deve verificar explicitamente que a rotação upstream está incluída.
4. **Teste explícito na suite de isolamento (seção 4.1):** revogar credencial e confirmar que nenhuma chamada subsequente usa a chave antiga com sucesso **dentro da janela de SLA declarada** (ex.: `<= 10s`), não apenas "antes do TTL genérico". Incluir no checklist que o runbook cobre a rotação no provider upstream.

Aplicar este mesmo padrão nas 16 edge functions GHL (`sync-contact-opportunities`, `sync-opp-dates`, `sync-opp-pipelines`, `sync-opp-sdr`, `sync-ghl-users`, `sync-ghl-conversations`, `sync-contact-tags`, `sync-contact-tasks`, `sync-contact-attribution`, `sync-appointment-dates`, `sync-recuperacao-stages`, `recuperacao-corrigir`, `recuperacao-prefetch`, `reconcile-contact-opportunities`, `ghl-api-worker`, `diag-ghl`), usando `discover-ghl-config` como referência (já recebe `workspace_id`, só falta parar de usar a chave global também).

### 5.4 `webhook-ghl`: validação por sub-conta, sem fallback — dois caminhos conforme o modo de provisionamento (revisado na v2)

Hoje: valida um único `WEBHOOK_SECRET` global.

Proposto, com **dois caminhos de validação explícitos**, associados ao `provisioning_mode` de `agency_workspaces` (a v1 assumia um único modelo — segredo simples por `location_id` — que pode não ser aplicável se a Fase 3 migrar para um Marketplace App OAuth; ver nota de risco 6.2):

1. **`manual_byok` (modelo atual, confirmado):** extrair `locationId` do payload **antes** da validação de autenticação; buscar o `webhook_secret` daquele workspace específico em `ghl_integration_settings`; se não achar match → **rejeitar com 401 e descartar o evento** (log, sem processar). Isso substitui o comportamento atual, em que a resolução de workspace acontece depois, na trigger SQL `extrair_dados_ghl_v2()`, com o fallback "workspace mais antigo" — que precisa deixar de existir silenciosamente. Esse fallback é, isoladamente, **o ponto mais perigoso de todo o sistema** para um cenário multi-tenant, e precisa virar falha dura antes de qualquer segundo tenant real entrar em produção.
2. **`auto_discovered` via Marketplace App (a confirmar na POC da seção 6.2):** se o GHL entregar webhooks de apps Marketplace por um endpoint único por App (não por sub-conta), com verificação criptográfica de assinatura do payload em vez de segredo por location — validar a assinatura do App primeiro, e só então resolver o workspace via `locationId` do payload já autenticado, **sem depender de um `webhook_secret` por sub-conta que nunca existiria nesse fluxo**.

A POC da seção 6.2 precisa confirmar **qual dos dois modelos** se aplica antes de a Fase 2 considerar esse item "pronto" para sub-contas auto-descobertas — caso contrário, o risco é que sub-contas auto-descobertas (o caminho "fácil" do plano) fiquem permanentemente bloqueadas com 401 por falta de um segredo que nunca seria configurado nesse fluxo, enquanto só as sub-contas BYOK funcionam.

### 5.5 Meta Ads / OpenRouter / Notion — mesmo padrão, prioridade menor

Aplicar o mesmo mecanismo de resolução por workspace (incluindo `rotation_version` na chave de cache, seção 5.3). Prioridade um degrau abaixo de GHL porque hoje Meta/OpenRouter não escrevem de volta em sistemas financeiros/CRM do cliente da forma que o GHL faz — mas vazar o token de anúncios do cliente A para uma chamada em nome do cliente B ainda é um problema real de custo e de compliance (LGPD: dados de campanha publicitária de um cliente aparecendo associados a outro — ver também seção 15). Fazer nesta mesma fase, mas só depois de o conjunto de testes de isolamento (seção 4.1) confirmar que o caminho GHL está seguro.

---

## 6. Auto-descoberta via GHL Agency API

> ⚠️ **Nota de atualização (2026-07-11) — decisão do dono redefine este fluxo.** A POC real
> (`docs/FASE-3-POC-RESULTADOS.md`) confirmou a dimensão 1 (descoberta funciona com Private
> Integration Token via `/locations/search`), mas a dimensão 4 (campo de admin, item 3 do fluxo
> abaixo) exigiria conceder ao token de agência o escopo **"Editar usuários"** — o GHL não
> oferece um escopo de leitura mais restrito. **O dono recusou conceder esse escopo** (uma
> credencial de agência com poder de EDIÇÃO sobre todas as sub-contas é um raio de explosão
> incompatível com o isolamento por workspace já construído na Fase 2). **Decisão: o token de
> agência fica só para listar sub-contas (item 3 abaixo, sem o passo de "chamar a API de
> Usuários"); todo acesso a dado de cada sub-conta — incluindo usuários/admins — vem sempre da
> própria chave daquela sub-conta via BYOK (Fase 4).** Isso é o caminho "BYOK semi-assistido" que
> a seção 6.2 já previa como fallback — a correção de v2/v3 sobre "não convidar admin
> automaticamente" (abaixo) continua valendo, só que agora não há sequer a tentativa de ler
> candidatos via token de agência. O texto original desta seção é mantido como registro histórico
> do desenho avaliado; a implementação real segue a versão redefinida.

### 6.1 Fluxo desejado (revisado na v2 — convite de admin deixa de ser 100% automático)

1. O dono da agência fornece um token de nível Agency (Private Integration ou OAuth — **ver nota de risco na seção 6.2**, isso precisa ser validado tecnicamente antes de implementar).
2. Nova tabela `agency_ghl_credentials` (agency_id, integration_type: `private_integration_token` | `oauth`, secret_key_id via Vault, company_id, installed_at).
3. Nova edge function `discover-agency-locations`: chama o endpoint de listagem de sub-contas da Agency API do GHL (equivalente a `GET /oauth/installedLocations`), compara com o que já está em `agency_workspaces`, e para cada `locationId` novo:
   - Se já existir em `agency_workspaces` com `status='suspended'` → **não reconecta automaticamente** (seção 3.6) — gera pendência de revisão manual.
   - Se colidir com um `ghl_location_id` já ativo em outra sub-conta → bloqueado pela constraint da seção 3.5, gera alerta em vez de falhar silenciosamente.
   - Caso contrário, cria um workspace via `create_workspace_with_owner` (owner inicial = dono da agência).
   - Insere linha em `agency_workspaces` com `provisioning_mode='auto_discovered'`, `status='pending'` (não `'active'` ainda — ver correção do passo de admin abaixo).
   - Popula `ghl_integration_settings` daquele workspace.
   - **(v2 — corrigido) Chama a API de Usuários do GHL daquele location** (reaproveitando o padrão já usado em `sync-ghl-users`) **para levantar candidatos a admin, mas não convida automaticamente.** Ver correção detalhada abaixo.
4. Reexecuta periodicamente (reaproveitando a infraestrutura de cron já existente, ex. padrão `admin-cron-health`) para capturar sub-contas novas ou removidas. Sub-conta removida da agência → `agency_workspaces.status = 'suspended'`, **nunca deleta dados** (ver também seção 16 para o fluxo de exclusão real sob pedido do titular/LGPD, que é um processo **separado e não automático**).
5. Rate limiting: reaproveitar a fila já existente `ghl_api_jobs`/`ghl-api-worker` (já implementa pacing ~7.7 req/s e backoff adaptativo por `x-ratelimit-remaining` — ver detalhe na seção 6.2) em vez de criar um mecanismo de fila novo. Jobs de descoberta devem usar prioridade mais baixa (`priority=10`, backfill lento) para não competir com sync em tempo real de tenants já ativos. Para agências com muitas sub-contas (centenas), tratar a primeira descoberta como job assíncrono de longa duração, com a UI (seção 8) mostrando progresso ("descoberta em andamento: X/N sub-contas processadas") em vez de esperar resposta síncrona rápida.

**Correção crítica da v2 — auto-convite de admin sem confirmação humana (achado de severidade alta da revisão):** a v1 concedia `role='admin'` no workspace Empire automaticamente a quem quer que a API do GHL reportasse como "admin" daquele location — sem qualquer confirmação do lado Empire/agência, e sem validar se aquele usuário deveria de fato ter acesso aos dados do Empire (que incluem dados além do GHL, como `vendas_fechamento` e credenciais de outras integrações). Isso também assumia uma granularidade de `roles.role` na API de Usuários do GHL que nunca foi auditada (pode haver 0 ou múltiplos "admins" por location, incluindo o próprio dono da agência replicado em todas as sub-contas). Correção:

1. `discover-agency-locations` grava os candidatos retornados (nome, e-mail, `role_ghl` bruto) em uma tabela de staging `agency_admin_discovery_proposals` (workspace_id, ghl_user_id, nome, email, role_sugerida, status: `'pending_review'`/`'approved'`/`'rejected'`, discovered_at) — **sem** criar `workspace_members` nem disparar `invite-user` diretamente.
2. A área `/agency/*` (seção 8) ganha um painel **"Admins detectados aguardando aprovação"**, onde um `agency_admin` humano aprova (dispara `invite-user`) ou rejeita cada candidato.
3. Enquanto pendente, o workspace fica com `agency_workspaces.status='pending'` e sem nenhum `workspace_members` além do owner da agência (já dono via `create_workspace_with_owner`) — garantindo que a sub-conta não fica sem ninguém com acesso, mas também não concede admin a um terceiro desconhecido automaticamente.
4. Toda aprovação/rejeição grava registro imutável (quem aprovou, quando, dados do usuário GHL na época) em tabela de auditoria.
5. O cron de reexecução periódica (item 4) gera **novas propostas** ao detectar mudança na lista de admins do GHL — nunca reenvia convites automaticamente nem substitui silenciosamente uma aprovação já feita.
6. **Idempotência de convite:** nunca reenviar convite ao mesmo e-mail só porque o botão de re-descoberta foi clicado de novo sem novas sub-contas/admins detectados (mitiga também o risco de rate limiting/spam de convite da seção 6.3).
7. **Four-eyes para QUALQUER concessão de admin em sub-conta (novo na v3):** um único `agency_admin` (owner comprometido por phishing, ou owner malicioso) não pode conceder `role='admin'` a um e-mail cúmplice arbitrário. Isso cobre **tanto** a aprovação de candidato descoberto (esta seção) **quanto** o convite direto da seção 8 — senão o four-eyes é contornável pelo caminho direto. Concretamente:
   1. A aprovação/convite de um admin de sub-conta cria estado `pending_second_approval`; só dispara `invite-user` após confirmação de um **segundo `agency_admin` distinto**. Bloquear aprovador == solicitante (**anti-auto-aprovação**).
   2. Registrar **ambos** os aprovadores na auditoria imutável (item 4).
   3. **Notificar automaticamente por e-mail** o(s) `workspace_members` `role='owner'` atuais da sub-conta sempre que um novo admin for concedido, com **janela de veto** — este é o controle de maior valor incremental, pois é o único que detecta grant a um cúmplice externo/persistente.
   4. Priorizar four-eyes especialmente para sub-contas `status='pending'`/`pending_verification`, que **não** são alcançáveis pela política RLS de agência (que exige `status='active'`): para elas, a aprovação é o único caminho de acesso.
   5. Para agências com um único admin, exigir **step-up/2FA out-of-band** do dono da agência para grant cross-tenant.
   6. **Premissa registrada:** um `agency_admin` já tem leitura das sub-contas **ativas** (seção 3.3); estes controles visam **persistência**, concessão a **não-membros** e **detecção** — não fingem fechar um vazamento de leitura que a RLS de agência já permite.

### 6.2 Nota de risco técnico (a validar antes de implementar) — quatro dimensões de POC + uma quinta dimensão temporal contínua (corrigido na v3: a v2 dizia "três" mas já enumerava quatro; esta rodada separa explicitamente a 5ª dimensão, de ciclo de vida/versionamento, como monitoramento contínuo, não gate de POC)

O plano acima assume que a Agency API do GHL suporta descoberta de sub-contas via **Private Integration Token de nível agência**. Isso **não foi confirmado tecnicamente** neste estudo — é uma suposição de design a validar na prática, com **quatro dimensões** distintas que a POC precisa cobrir **antes do go/no-go da Fase 3** (a v1 só cobria a primeira), mais uma **quinta dimensão de natureza temporal** (item 5 abaixo) que não se resolve com uma POC pontual — é tratada como monitoramento contínuo (seção 8.1), não como bloqueio de entrada na Fase 3:

1. **Existência e tipo do endpoint de descoberta.** É possível que o endpoint (`installedLocations` ou equivalente) só esteja disponível para apps **Marketplace com OAuth** (fluxo com `client_id`/`client_secret`/`refresh_token`), e não para Private Integration Tokens simples.
2. **Modelo de consentimento por sub-conta.** Mesmo que o endpoint exista via OAuth Marketplace, é preciso confirmar se a "auto-descoberta zero toque" realmente funciona sem aprovação individual de cada admin de location — o GHL pode exigir instalação/consentimento por sub-conta em vez de um único token que enxergue automaticamente todas as locations da agência. Se isso for necessário, a auto-descoberta deixa de ser "zero toque" e vira, na prática, um BYOK assistido por sub-conta — o que muda a estimativa de esforço/cronograma da Fase 3 (seção 10.1).
3. **Modelo de entrega e autenticação de webhooks para apps Marketplace.** Apps Marketplace tipicamente registram **um único endpoint de webhook por App inteiro** (não por sub-conta), com todos os eventos de todas as locations instaladas chegando ali, autenticados por assinatura criptográfica do payload (chave do App), não por um segredo simples por location. Se for esse o caso, o modelo da seção 5.4 (item 1, segredo por sub-conta) **não se aplica** ao caminho `auto_discovered` — daí a bifurcação explícita da seção 5.4 nesta v2.
4. **Confiabilidade/granularidade do campo de "admin" na API de Usuários.** Não confirmado se há sempre exatamente 1 admin claro por location, ou se o dono da agência aparece replicado como admin em todas as sub-contas — daí a correção da seção 6.1 (candidatos, não convite automático).
5. **Ciclo de vida/versionamento da API (dimensão temporal, novo na v3).** As quatro dimensões acima perguntam "o endpoint existe/funciona **hoje**?". Falta a pergunta inversa: um endpoint que hoje funciona ser **depreciado** ou ter o **contrato de resposta alterado** (campo renomeado, paginação mudada) pela GHL amanhã. Isso é uma modalidade de risco distinta (dependência externa fora do controle da equipe) e precisa de tratamento próprio — ver seção 8.1 (smoke-test canário de shape) e a linha dedicada na tabela de riscos da seção 11. Onde a Agency API suportar, **fixar a versão de API GHL** usada por cada edge function (header `Version`/data) e monitorar o changelog/anúncios de sunset da GHL. Nota honesta: uma depreciação atinge **ambos** os modelos (instância isolada e multi-tenant) simultaneamente, já que compartilham o mesmo código de edge function; o que o modelo multi-tenant perde é a capacidade de **canariar o fix por instância** — daí a importância da degradação graciosa por feature (uma sync quebrada não deve derrubar o dashboard inteiro).

**Critério de go/no-go mensurável para a POC (substituindo o critério vago "PoC validada" da v1):** antes de iniciar a Fase 3, o token/app de agência precisa, **sem qualquer ação manual do admin de cada sub-conta de teste**, conseguir listar e ler dados de pelo menos 3 locations de teste distintos dentro da mesma agência — incluindo 1 location criado **depois** da instalação inicial (testa o caso de descoberta contínua, não só o estado inicial) — e o comportamento de entrega de webhook (dimensão 3) precisa estar documentado com um exemplo real de payload recebido. **Plano de fallback se a POC falhar:** reclassificar a Fase 3 de "auto-descoberta automática" para "BYOK semi-assistido" (fluxo da seção 7, com um botão de convite/instruções para o admin de cada sub-conta), e atualizar a estimativa de cronograma/custo da seção 10.1 para refletir que o onboarding de N sub-contas passa a ter um passo manual por sub-conta.

**Nota sobre rate limit em descoberta em massa:** o `ghl-api-worker` já implementa pacing (~7.7 req/s, abaixo do limite documentado de 100 req/10s), backoff adaptativo por `x-ratelimit-remaining` e limite de 50 jobs por execução de cron — enfileirar centenas de jobs de descoberta não gera um burst simultâneo, o worker drena a fila de forma espalhada. O ponto ainda em aberto (não confirmável sem acesso à API real) é se o rate limit de 100 req/10s documentado é medido **por token** ou **por location de destino** — um token de Agency chamando N locations diferentes pode ter comportamento diferente do modelo atual (1 token = 1 location). Validar isso como parte da mesma POC.

### 6.3 Rate limiting e auditoria de ações manuais de nível agência (novo, identificado na revisão)

O botão "re-executar descoberta agora" (seção 8) deve **sempre** passar pela mesma fila `ghl_api_jobs` com o mesmo rate limit por agência da reexecução periódica automática — nunca um caminho síncrono que ignore a fila. Adicionalmente:

1. Cooldown explícito por agência (ex: 1 execução manual a cada 15-30 min), persistido com timestamp da última execução; a UI desabilita o botão e mostra o tempo restante durante o cooldown.
2. Toda execução manual é registrada em log de auditoria (`user_id`, `agency_id`, `timestamp`, resultado).
3. Idempotência no envio de convites (já coberta na seção 6.1, item 6) evita que cliques repetidos gerem spam de convite para os mesmos e-mails de admins de sub-conta — o que, além de incomodar, cria familiaridade com e-mails de convite que um atacante poderia explorar para phishing.

---

## 7. Cenário BYOK — sub-conta de outra agência GHL

Fluxo manual, sem depender da auto-descoberta:

1. Nova UI na área Agency: "Adicionar sub-conta manualmente" — cria um workspace novo (fora do fluxo de descoberta), com `agency_workspaces.provisioning_mode = 'manual_byok'`.
2. O operador do Empire (não o GHL da sub-conta) preenche manualmente:
   - `ghl_integration_settings` (location_id daquela sub-conta) — com a pré-checagem de colisão da seção 3.5 antes de salvar.
   - A credencial própria em `workspace_integration_credentials` — recebida via o **canal de intake dedicado** descrito abaixo (correção da v2 — a v1 só recomendava "de forma segura, se possível", sem mecanismo técnico).
3. O Empire gera um `webhook_secret` próprio para aquele workspace; o dono da sub-conta (ou o time dele) configura manualmente o webhook correspondente no GHL dele.
4. O operador adiciona manualmente as linhas de `workspace_members` (owner/admin) daquela sub-conta — **sem** auto-descoberta de admins, exatamente como pedido: "eu devo ser capaz de setar a conta/users dele manualmente".

Este fluxo não exige nenhuma peça nova além do que já foi desenhado nas seções 3 e 5 — é a mesma estrutura de dados, só populada manualmente em vez de via `discover-agency-locations`.

### 7.1 Canal de intake da credencial BYOK — obrigatório, não "se possível" (novo, corrigido na v2)

A v1 tratava a entrega da API key do dono da sub-conta como algo que acontece "por fora do sistema... nunca colada em chat/e-mail em texto plano **se possível**" — uma recomendação condicional, não um mecanismo garantido. Isso deixava em aberto o canal mais comum na prática (e-mail, WhatsApp, ticket de suporte), que retém a chave indefinidamente fora de qualquer controle do Vault. Correção — **é proibido receber a API key por e-mail, WhatsApp, Slack ou qualquer texto livre; a única via aceita é o link de intake de uso único abaixo**:

1. Nova edge function `byok-secret-intake` (padrão das demais edge functions do projeto): ao criar o workspace `manual_byok`, gera um link de uso único com token aleatório (armazenado hasheado, expiração **1h** — reduzida de 24h na v3) associado a `workspace_id` + `provider`. **Entropia mínima do token >= 128 bits**, e rate limit por token/IP na edge function.
2. Página frontend mínima e isolada onde o dono da sub-conta cola a API key. O submit vai direto (HTTPS) para a edge function, que chama `vault.create_secret` e grava só o `secret_key_id` — a chave em texto plano nunca é vista, logada ou armazenada pelo operador do Empire, nunca passa por ferramentas de suporte/chat.
3. Token de intake é de uso único (marca `used_at` na primeira submissão) e expira automaticamente.
4. **Fechar a lacuna do próprio LINK, não só da chave (novo na v3):** a v2 proibia enviar a **chave** por e-mail/WhatsApp/Slack, mas nunca especificava por qual canal o **link** chega ao dono da sub-conta — e a página não tem login, então o token do link **é** a única credencial de acesso ao intake. Se o operador entregar o link pelos canais banidos para a chave, qualquer um que o intercepte em até 1h pode (a) submeter a própria chave (**poisoning**) ou (b) só consumir o token de uso único (**DoS**: a submissão legítima falha). Correção:
   1. **Restringir o canal de entrega do link:** gerar/exibir o link apenas dentro de uma sessão autenticada do Empire (para o operador copiar) **ou** enviá-lo somente ao **e-mail já verificado** do owner cadastrado em `workspace_members` — nunca por texto livre repassável.
   2. **Step-up na página:** exigir um código enviado ao e-mail verificado do destinatário antes de aceitar o submit, amarrando o token à identidade.
   3. **Notificar o owner** por canal independente no momento do uso (`used_at`) e ao expirar.
   4. **Prova de posse (liga com 3.5.1):** antes de ativar, testar a chave submetida contra o `location_id` preenchido pelo operador e **rejeitar** se a chave não tiver acesso àquele location — bloqueia chave-lixo (DoS/corrupção) e qualquer tentativa de redirecionar para location de terceiro.
5. Esse fluxo entra explicitamente na tabela de riscos (seção 11).

---

## 8. Área de gestão "Agency"

Nova área de frontend `/agency/*`, paralela às áreas já existentes `/workspace/*` e `/admin/*`, com acesso restrito a quem tem linha em `agency_members` (respeitando o Agency Selector da seção 3.4.1 quando o usuário pertence a 2+ agências):

- **Lista de sub-contas** — nome, status (`active`/`suspended`/`pending`), modo de provisionamento (`auto_discovered`/`manual_byok`), saúde de cada integração (última sincronização GHL bem-sucedida, último webhook recebido, status da conexão Meta Ads, uso recente de OpenRouter) — reaproveitando as tabelas de log de sync que já existem por workspace.
- **Painel "Admins detectados aguardando aprovação"** (novo, seção 6.1) — lista de candidatos a admin por sub-conta recém-descoberta, com ação de aprovar/rejeitar.
- **Criar/suspender/reativar sub-conta** — reativação exige o passo de confirmação humana da seção 3.6 (nunca automática quando o `location_id` reaparece no discovery).
- **Convidar admin de uma sub-conta específica** — reaproveita a função `invite-user` já existente, só adiciona um ponto de entrada no contexto da agência.
- **Gestão de credenciais de nível agência** — rotação do token GHL de agência, botão "re-executar descoberta agora" (com cooldown e auditoria, seção 6.3).
- **Painel de custo/uso por sub-conta** (novo, ver seção 14) — não apenas saúde de integração, também atribuição de custo de API por workspace.
- **Identificador de correlação de suporte** (novo, ver seção 13.1).

Esta camada é majoritariamente trabalho de frontend React sobre padrões que já existem (`WorkspaceUsersPage.tsx`, `WorkspaceAppsPage.tsx`) — não exige nenhum conceito novo de permissão além do que a seção 3.3 já define.

### 8.1 Alerta ativo de saúde de integração (novo, identificado na revisão)

A lista de "saúde de sync" acima é **passiva** — só é útil se alguém abrir a tela. Sem notificação ativa, um token expirado numa sexta à noite pode gerar dias de webhooks falhando silenciosamente (401, seção 5.4) antes que o cliente reclame na segunda-feira. Correção:

1. Nova tabela leve `workspace_integration_health_alerts` (workspace_id, provider, alert_type, last_triggered_at, resolved_at) para deduplicar alertas.
2. Estender o cron de saúde (padrão `admin-cron-health`, ou um cron dedicado `agency-integration-health-check`) para, por workspace: verificar tempo desde o último webhook recebido (limiar configurável, ex. 6h), verificar status 401/403 recorrentes nas chamadas de sync, e verificar expiração conhecida de token quando o provider expuser essa informação.
3. Ao detectar problema, notificar via `net.http_post` (mesmo padrão do webhook outbound) o(s) admin(s) daquele workspace (e-mail) e um canal Slack interno da Alto Valor — reaproveitando a fila/infra de cron já existente.
4. Adicionado como item da Fase 5 (seção 10) — depende de credenciais por workspace já estarem funcionando (Fase 2) para distinguir "token realmente expirado" de "sub-conta sem lead há dias por motivo comercial normal".
5. **Smoke-test canário de mudança silenciosa de contrato da API GHL (novo na v3 — liga com a 5ª dimensão da seção 6.2):** os checks acima (401/403, tempo desde o último webhook) não detectam uma depreciação que retorna HTTP 200 com o **shape** da resposta alterado (campo renomeado, paginação mudada). Adicionar ao cron diário um smoke-test por endpoint crítico (`opportunities`, `appointments`, `followers`, `users`, `installedLocations`) que valida a **presença dos campos esperados** na resposta, não só o status HTTP — e alerta se o shape mudar, mesmo sem erro HTTP.

---

## 9. Admin por sub-conta controlando seus próprios usuários

Este requisito **já está coberto pelo mecanismo atual**, sem necessidade de mudança de schema: `workspace_members.role IN ('owner', 'admin')` já governa quem pode gerenciar usuários dentro de uma sub-conta (confirmado nas políticas de `supabase/migrations/20260225100000_create_workspaces_and_members.sql`). O trabalho restante é praticamente só de UI — garantir que a tela de gestão de usuários de uma sub-conta continue disponível e funcional para o admin daquela sub-conta especificamente, mesmo quando ele não tem nenhuma visibilidade sobre outras sub-contas da mesma agência (o que já é o comportamento correto por padrão, já que `is_workspace_admin` só enxerga o próprio workspace).

---

## 10. Plano de fases de migração

Ordem pensada para minimizar risco: sempre validar isolamento antes de aumentar a superfície de ataque, e nunca quebrar o cliente atual (que passa a ser tratado como "a primeira sub-conta"). **A ordem entre a Fase 3 (auto-descoberta) e a Fase 4 (BYOK manual) foi mantida como estava** porque o gate de POC (critério de "pronto" da Fase 3) já impede que código de produção da Fase 3 seja escrito sem validação técnica prévia — mas fica registrado explicitamente que a **Fase 4 (BYOK) é o caminho de menor risco e menor dependência técnica**, e pode ser adiantada isoladamente se a POC da Fase 3 atrasar, já que cobre o mesmo requisito de negócio ("setar a conta/users manualmente") sem nenhuma das quatro incertezas da seção 6.2.

| Fase | O que entrega | Critério de "pronto" | Esforço estimado* |
|---|---|---|---|
| **Fase 0 — Fundação de testes** | Suite automatizada de isolamento cross-tenant (seção 4.1), incluindo os testes novos de agência/status/UX single-tenant, rodando contra 2 workspaces semeados (nenhum real ainda) | Suite roda em CI, 0 vazamento detectado nos testes sintéticos | 1-2 semanas |
| **Fase 1 — Modelo de dados Agency** | Tabelas `agencies`, `agency_members`, `agency_workspaces` + funções RLS aditivas com filtro de `status` (seção 3) + geração programática do retrofit de políticas | Cliente atual continua funcionando sem nenhuma mudança percebida (validado pelo teste de regressão de UX da seção 4.1, não apenas alegado); suite da Fase 0 passa com a nova camada, incluindo a suite dedicada da seção 3.3.1 | 2-3 semanas |
| **Fase 2 — Isolamento de credenciais** (mais crítica) | `workspace_integration_credentials` via Vault com `rotation_version`, refatoração das 16 edge functions GHL + Meta/OpenRouter/Notion, `webhook-ghl` por location sem fallback, `outbound_webhooks` com RLS e filtro de tenant na trigger | Teste de "credencial certa para o tenant certo" (seção 4.1) passa, incluindo teste de revogação; fallback "workspace mais antigo" removido e substituído por falha dura; constraint de unicidade de `location_id` (seção 3.5) aplicada | 4-6 semanas |
| **Fase 3 — Auto-descoberta GHL** *(pós-MVP — ver seção 10.3)* | `agency_ghl_credentials`, edge function `discover-agency-locations`, staging de candidatos a admin (sem convite automático) | POC das **4 dimensões** da seção 6.2 validada com critério mensurável **antes de começar** (a 5ª dimensão, versionamento, não é gate — é monitoramento contínuo via 8.1); descoberta rodando em sandbox com sub-conta de teste | 3-5 semanas **se a POC confirmar Private Integration Token**; 6-10+ semanas **se exigir Marketplace App OAuth completo** (ver plano de fallback na seção 6.2) |
| **Fase 4 — BYOK manual** | UI "adicionar sub-conta manualmente" (seção 7) + canal de intake de segredo (seção 7.1) | Onboarding manual de 1 sub-conta de teste completo, ponta a ponta, sem nenhuma credencial transitando fora do link de intake | 2-3 semanas |
| **Fase 5 — UI de gestão Agency** | Área `/agency/*` completa (seção 8), incluindo painel de aprovação de admin, alerta ativo de saúde (8.1) e painel de custo (14) | Dono da agência consegue operar tudo sem tocar no banco diretamente | 3-4 semanas |
| **Fase 6 — Backfill das tabelas restantes** | `workspace_id` nas ~12 tabelas nullable + ~20-25 tabelas de infra + denormalização em `oportunidades`/`comunicacoes`/`vendas_fechamento` (seção 4.2, 4.3) + `workspace_id` em `ghl_api_jobs` para billing/rate-limit | Contagem de `workspace_id IS NULL` em 0 por 2+ dias antes de `NOT NULL` | 2-4 semanas |
| **Fase 7 — Reescrita do provisionamento** | `scripts/provision-new-client.ts` ganha `--mode=isolated-instance` (comportamento atual) vs `--mode=agency-subaccount --agency-id=<uuid>` (cria tenant na instância existente) | `docs/REPLICACAO-TECNICA.md` documenta quando usar cada modo | 1-2 semanas |
| **Fase 8 — LGPD/DPA e offboarding** (nova, seção 16) | DPA por sub-conta, runbook de expurgo de titular, fluxo de exclusão/exportação de dados | Runbook testado ponta a ponta com um workspace sintético; DPA assinado antes de aceitar o 2º tenant real pagante | 2-3 semanas |

*Faixas de pessoa-semana, com 1 engenheiro sênior dedicado; ajustar conforme alocação real. São estimativas de ordem de grandeza para viabilizar a decisão de investimento (seção 10.1/12.1), não compromissos de prazo fechado — refinar ao final de cada fase antes de comprometer a próxima.

### 10.0 Status de execução (atualizado em 2026-07-11)

Acompanhamento real da execução deste plano. Tudo abaixo foi feito **apenas no banco de TESTE** (`fgjbmdsucruvtpywyhhf`); produção (`qzesffnkqgelmtfblzkr`) não foi tocada.

| Fase / fatia | Status | Onde está | Validação |
|---|---|---|---|
| Fase 2 — cofre de credenciais por workspace (9 fatias) | ✅ **Entregue no teste** | tabela `workspace_integration_credentials` (Vault), RPCs service_role, helper `_shared/resolve-workspace-credentials.ts`, refatoração das edge functions classe A | Suite de integração: **285 passed \| 10 todo** |
| **Fase 4 — Fatia 1: porteiro RPC self-service** | ✅ **Entregue no teste** | migration `20260731000000_fase4_save_workspace_credential.sql` (RPCs `save_workspace_credential` e `get_workspace_credential_status`, GRANT `authenticated`, guarda `is_workspace_admin`, nonce no `vault.create_secret`) | testes de integração verdes; commit `3fc5b28` |
| **Fase 4 — Fatia 2: UI "Chaves de API"** | ✅ **Entregue no teste (frontend)** | `eb-dash2/src/pages/workspace/WorkspaceIntegrationsPage.tsx`, hook `useWorkspaceCredentials`, rota `/workspace/integracoes`, item na Sidebar do `WorkspaceLayout` (GHL + Meta; Notion fora da UI) | `tsc -b` OK; `npm run build` OK (2091 módulos); commit `2ad5b41` |
| **Fase 4 — Fatia 4: botão "Testar conexão" (prova de posse)** | ✅ **Entregue no teste** | edge function `test-workspace-credential` (JWT + owner/admin + `resolveWorkspaceCredential` fail-closed + chamada à API do provedor, nunca expõe o segredo) + lógica pura `_shared/test-workspace-credential-logic.ts` + botão na UI | teste `test-workspace-credential` (**15/15**); suite completa **301 passed \| 10 todo** (era 285); `tsc -b`/`vite build`/`deno check` OK |
| Fase 4 — Fatia 3/5: cutover da chave atual → cofre | ⏳ Antes de ligar em produção | migração seed (não é via UI) preservando dados legados | pendente |
| **Fase 5 — MVP área `/agency/*`** | ✅ **Entregue no teste** | migration `20260801000000_fase5_agency_admin_rpcs.sql` (RPCs `suspend_agency_workspace`/`reactivate_agency_workspace`, reativação exige `p_confirmed=true` — seção 3.6), `invite-user` com fallback de admin de agência, `eb-dash2/src/hooks/useAgency.ts`, `eb-dash2/src/pages/agency/` (`AgencyRoute`, `AgencyWorkspacesPage`), `eb-dash2/src/components/layout/AgencyLayout.tsx`, rotas `/agency` e `/agency/workspaces` | teste `agency-admin-rpcs.test.ts` (**7/7**); suite completa **308 passed \| 10 todo** (era 301); `tsc -b`/`npm run build`/`deno check` OK |
| **Fases 1, 2, 4, 5 — mergeadas em `main`** | ✅ **Mergeado (não é só teste)** | PRs #14 (Fase 1) → #15 (Fase 2) → #16 (Fase 4) → #17 (Fase 5), empilhadas e mergeadas em ordem em 2026-07-10 | gate de segurança (`security-auditor`) rodado antes do merge: **PASS** (achado real corrigido — `auth.uid()` sem wrapper nas 3 funções de RLS de agência); relatório em `security-report/audit-2026-07-10-fase5.md` (não versionado). **Nada foi para produção** — só o histórico do GitHub |
| Vulnerabilidades npm (pré-existentes, achadas na auditoria) | ✅ **Corrigidas e mergeadas (PR #18)** | `npm audit fix`: `react-router-dom`→7.18.1 (RCE crítica), `ws`→8.21.0, `form-data`→4.0.6, `js-yaml`→4.3.0, `postcss`→8.5.16 | 8/12 resolvidas sem breaking change; restam 4 isoladas em ferramenta de dev (`vitest`/`esbuild`), não bloqueante |
| **Fase 6 — Fatia 1: denormalização `workspace_id` no CRM** | ✅ **Entregue no teste** | migration `20260803000000_fase6_denormaliza_workspace_id_crm.sql` (coluna + backfill + guard de órfãos fail-closed + `NOT NULL` seguro + trigger `BEFORE INSERT`) em `oportunidades`/`comunicacoes`/`vendas_fechamento`; `docs/FASE-6-DENORMALIZACAO-CRM.md` | teste `fase6-denormalizacao-crm-workspace-id.test.ts` (**3/3**); suite completa **313 passed \| 10 todo** (era 310) |
| Fase 6 — restante (tabelas nullable + infra) | ⬜ Pendente | `meta_ads_*`/`weekly_*` (~12 tabelas) + ~20-25 tabelas de infraestrutura | fatias futuras |
| Fase 3 — POC da Agency API (seção 6.2) | ✅ Decisão tomada (2026-07-11) | script `scripts/poc-fase3-ghl-agency-api.ts` | dimensão 1 ✅ confirmada; dimensão 4 exigia escopo "Editar usuários" no token de agência — **dono recusou** (raio de explosão maior que 1 credencial por sub-conta). **Decisão: token de agência só para descobrir a lista de sub-contas; dado de cada uma sempre vem de BYOK por sub-conta (Fase 4)** — dimensões 3/4 saem do gate. Detalhe em `docs/FASE-3-POC-RESULTADOS.md` |
| **Fase 3 — Descoberta de sub-contas (implementação, redefinida)** | 🟢 **Implementada no teste** | edge function `discover-agency-locations` (só leitura, `agency_ghl_credentials` sem escopo de edição), cron 6h, card "conecte a chave" no frontend | suite completa **325 passed \| 10 todo** (era 313); falta mergear/aplicar em staging-produção. Detalhe em `docs/FASE-3-POC-RESULTADOS.md` |
| Itens de segurança separados (achado da Fase 3): guard service_role nas 20 edge functions de cron (PR #25); guard fail-closed nas 5 functions administrativas "classe B" (PR #26); RPC de seed do cutover GHL→Vault (PR #27); fix do gate de CI de isolamento (PR #28) | ✅ **Mergeados em `main`** | `supabase/functions/_shared/require-service-role.ts` aplicado nas 20+5 functions; RPC `seed_workspace_ghl_credential_service_role`; `.github/workflows/integration-isolation.yml` com `paths` corrigido | suite **358 passed \| 10 todo** ao final do item #27 (0 regressão acumulada). Detalhe em `docs/SEGURANCA-CRON-CALLER-GUARD.md`, `docs/SEGURANCA-CLASSE-B-FUNCTIONS-GUARD.md`, `docs/FASE-2-SEED-CREDENCIAIS-POR-WORKSPACE.md`, `docs/CI-GATE-ISOLAMENTO-CROSS-TENANT.md` |
| Limpeza pós-guard: function órfã removida, 4 crons órfãos desagendados, botão de sync Meta Ads quebrado removido | ✅ **Mergeado em `main` (PR #29)** | migration `20260810000000_remove_orphan_crons_and_dead_functions.sql` + `SyncBanner.tsx` removido | suite **357 passed \| 10 todo** (-1 esperado). Detalhe em `docs/LIMPEZA-CRONS-ORFAOS-E-CODIGO-MORTO.md` |
| **Fase 7 — Reescrita do provisionamento (`--mode=agency-subaccount`)** | ✅ **Implementada e validada no teste (PR #30)**; **item P2 (não-atomicidade) corrigido (PR #32)** | `scripts/provision-new-client.ts` com rollback compensatório automático (reusa `purge_workspace_data` da Fase 8) quando o vínculo com a agência falha | validado com execução REAL contra o banco de teste, incl. falha real induzida (colisão de `location_id`) com zero órfãos confirmado. Detalhe em `docs/FASE-7-PROVISIONAMENTO-AGENCY-SUBACCOUNT.md` e `docs/FASE-7-P2-ATOMICIDADE.md` |
| **Fase 8 — LGPD/DPA e offboarding (parte técnica)** | 🟡 **Runbook técnico implementado e validado no teste (PR #31)**; DPA/comunicação ao cliente e burn-in em produção seguem pendentes (fora de engenharia) | RPC `purge_workspace_data` (atômica, dry-run transacional), `workspace_deletion_requests`, scripts `export-workspace-data.ts`/`purge-workspace.ts` | suite `fase8-workspace-purge.test.ts` (**5/5**), zero órfãos/zero vazamento cross-tenant; suite completa **362 passed \| 10 todo** (era 357). Detalhe em `docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md` |
| **Fase 6 — fatia adicional: `workspace_id` em `stevo_whatsapp_calls`** | ✅ **Entregue no teste (PR #31)** | migration `20260812000000_fase6_workspace_id_stevo_whatsapp_calls.sql` — única tabela do gap com PII direta (telefones) sem nenhum caminho de isolamento, fechada com o mesmo padrão seguro da fatia 1 | coberta por `purge_workspace_data`/`export_workspace_data_manifest`; suite completa **362 passed** |

> Log completo, commit a commit, de todos os itens desta tabela: `docs/ROADMAP-MULTI-TENANT.md` seção 6 ("Log de execução") — esta tabela (10.0) é o resumo por fase, aquele é o histórico cronológico detalhado.

**Decisões de produto já fechadas nesta execução:** (a) a chave de cada cliente é cadastrada **pelo próprio cliente via UI** (não por operador/SQL); (b) **Notion descontinuado** como integração de primeiro momento (fora da UI; a RPC ainda aceita `notion` só por compatibilidade — não remover à toa); (c) a chave **atual** (env global/`ghl_integration_settings`) é preservada e migrada para o cofre no cutover (não pela UI); (d) `sync-meta-ads-backfill` é residual (grava `workspace_id NULL`) — não mexer salvo pedido. Detalhes e próximos passos em `docs/HANDOFF-FASE-4-BYOK.md`.

**Regra de ouro entre fases:** nunca aceitar uma segunda sub-conta **real/paga** na mesma instância antes de a Fase 2 (**e a Fase 8, LGPD/DPA**) estarem completas e com burn-in — ou seja, mesmo que as Fases 3-6 avancem, o primeiro tenant adicional de verdade deveria ser **interno/de baixo risco**, mantido rodando por um período definido com a suite de isolamento em execução periódica (não só uma vez), antes de qualquer cliente pagante real ser a segunda sub-conta. **O gatilho para exigir DPA/comunicação formal ao cliente atual (seção 16.1) é este mesmo marco** — a aceitação da 2ª sub-conta real na mesma instância — não a Fase 1 isoladamente, que ainda não move dados reais de terceiros para coexistência.

### 10.1 Impacto na capacidade de engenharia

O time que executaria este plano é o mesmo que hoje mantém os módulos já em produção listados no `docs/ROADMAP.md` (Relatórios, Disparos, Criativos, SDR IA, etc.). Somando as faixas da tabela acima (excluindo o cenário pessimista da Fase 3), o projeto completo (Fases 0-8) consome **na ordem de 20-30 semanas-pessoa** com 1 engenheiro sênior dedicado (proporcionalmente menos com mais pessoas, mas a Fase 2 em particular não paraleliza bem por ser uma refatoração sequencial de 16 edge functions com o mesmo padrão de risco). Isso **compete diretamente pela mesma capacidade de engenharia** que hoje sustenta o roadmap corrente — a decisão de iniciar a Fase 0 deve ser explicitamente priorizada frente a essas outras entregas, não tratada como trabalho "adicional" sem custo de oportunidade.

**Marco de decisão go/no-go entre fases:** ao final de cada fase, além do "critério de pronto" técnico já listado, registrar uma decisão explícita de negócio: seguir para a próxima fase, pausar para reavaliar prioridade frente ao roadmap corrente, ou (only para a Fase 2, ver 10.2) abandonar.

### 10.2 Critério de abandono (kill switch) da Fase 2

A Fase 2 é a mais crítica e a que concentra o maior risco de nunca "fechar" de verdade (isolamento de credenciais é um alvo difícil de acertar 100%). Critério de abandono explícito, ausente na v1:

> Se, após **2 ciclos completos de correção** (cada ciclo = tentativa de fix + nova rodada completa da suite de isolamento da seção 4.1), a suite ainda apresentar qualquer falha de **(a) vazamento de leitura cross-tenant**, ou **(b) uso da credencial de um workspace para uma chamada de outro** (o teste mais crítico da seção 4.1), então a Fase 2 é declarada **não-viável no prazo/orçamento atual**. Ação obrigatória: pausar o projeto na Fase 2, não avançar para Fase 3+, e manter o modelo de instância isolada (seção 1) como padrão de produto para todos os clientes — inclusive os que já estariam na fila para migrar. Reabrir o estudo exige uma **nova decisão formal de produto**, documentando qual classe de falha impediu o sucesso.

Isso evita que a pressão de sunk cost empurre a equipe a aceitar um nível de isolamento inferior ao exigido pela própria seção 4.1 só para "entregar algo" — o pior desfecho possível seria um vazamento real de dados entre clientes pagantes por causa dessa pressão.

### 10.3 Caminho de menor risco: MVP recomendado (novo na v3 — corte explícito do escopo)

A revisão profunda identificou quatro oportunidades de simplificação que, somadas, cortam substancialmente o caminho crítico do primeiro valor entregável sem abrir mão de nenhuma garantia de isolamento. Esta seção consolida as quatro num único corte de MVP explícito — o que fica **dentro** e o que fica **adiado**, e sob qual gatilho cada item adiado é retomado.

**Dentro do MVP (primeira sub-conta paga operável):**

| Fase/peça | Por quê entra no MVP |
|---|---|
| Fase 0 (suite de isolamento) | Pré-requisito de tudo, custo baixo, sem ela nada mais é verificável |
| Fase 1 (`agencies`/`agency_workspaces`/`agency_members`) **sem** a política RLS aditiva de agência | As tabelas continuam necessárias para billing, transferência de sub-conta e suspensão — só a política `can_access_workspace_via_agency` e o retrofit de ~90 tabelas ficam de fora (ver corte 2 abaixo) |
| Fase 2, **subconjunto crítico-para-1º-tenant** das 16 edge functions | Ver corte 3 abaixo — não as 16 de uma vez |
| **Fase 4 (BYOK manual)**, promovida a caminho padrão do MVP | Cobre 100% do requisito de negócio ("setar a conta/users manualmente") sem nenhuma das 4 incertezas da seção 6.2; 2-3 semanas vs. 3-10+ semanas da Fase 3 |
| Fase 5 mínima (UI de gestão Agency) | Necessária para o operador não depender do banco diretamente |
| Denormalização de `workspace_id` nas 3 tabelas centrais do CRM (parte da Fase 6/seção 4.3) | Mais barata e segura **agora** (single-tenant, volume atual) do que depois, com múltiplos tenants vivos; pré-requisito do hard-delete seguro (16.3) |
| Fase 8 parcial (DPA + runbook de expurgo + tabletop de incidente) | Gate contratual/legal do 2º tenant real pagante — não pode ser adiado além desse marco |

**Adiado para pós-MVP, com gatilho explícito de quando retomar:**

1. **Fase 3 (auto-descoberta via Agency API do GHL)** — adiada e reclassificada de "próxima fase" para **condicionada a dois gatilhos simultâneos**: (a) POC das 4 dimensões da seção 6.2 aprovada com o critério mensurável já definido, **e** (b) demanda comprovada (5+ sub-contas ativas via BYOK tornando o passo manual custoso o suficiente para justificar pagar a POC arriscada). Sem os dois, BYOK continua sendo o único caminho de onboarding.
2. **Política RLS aditiva de agência (`can_access_workspace_via_agency`) e o retrofit programático de ~90 tabelas** — adiados. No MVP, o acesso do dono da agência a cada sub-conta se dá inserindo-o como `role='admin'` em `workspace_members` daquela sub-conta (via a mesma RPC de provisionamento da Fase 4/7), reusando o caminho `is_workspace_member` já testado em produção nas ~90 tabelas — sem introduzir a função de risco máximo da seção 3.3.1, sem o retrofit de políticas, sem a suite de teste dedicada exaustiva, sem a exigência de CODEOWNERS/2-revisores. **Suspensão de sub-conta** no MVP: desativar (`is_active=false`) a linha de `workspace_members` do dono da agência naquela sub-conta — reusa o padrão `is_active` existente e evita de saída a classe de bug do filtro `status` na função de risco máximo. **Gatilho de retomada:** manutenção manual de membros virar dor operacional real, na ordem de **8-10+ sub-contas ativas**. Ao atingir o gatilho, implementar a seção 3.3/3.3.1 como especificado (índices, 2 revisores, suite dedicada, benchmark) e reexecutar toda a suite de isolamento da seção 4.1 na migração de `workspace_members`-manual para política aditiva. **Nota de UI:** no modelo whitelabel, filtrar as linhas de membro pertencentes ao dono da agência na tela de usuários da sub-conta (`WorkspaceUsersPage`), para não expor o operador da agência ao admin da sub-conta.
3. **Refatoração incremental das 16 edge functions GHL (Fase 2):** dividir em classe A (crítico-para-1º-tenant, refatorar já) — `webhook-ghl`, `sync-contact-opportunities`, `sync-opp-dates`, `sync-opp-pipelines`, `sync-ghl-users`, `sync-opp-sdr`, `sync-contact-tags`, `sync-appointment-dates` e obrigatoriamente `ghl-api-worker` (worker central da fila `ghl_api_jobs`, não pode ser diferido, pois executa jobs de todas as syncs) — e classe B (diferível just-in-time) — `recuperacao-corrigir`, `recuperacao-prefetch`, `sync-recuperacao-stages`, `reconcile-contact-opportunities`, `diag-ghl`. Nas functions da classe B, em vez da refatoração completa agora, adicionar um **guard fail-closed** no início do handler: `if (workspaceId !== LEGACY_WORKSPACE_ID) throw new Error('function not yet multi-tenant enabled')`. Refatorar cada uma just-in-time quando uma sub-conta real acionar o fluxo correspondente. Adicionar à suite da seção 4.1 um teste que confirma que uma function diferível **recusa** (não processa, não usa a chave global) um workspace novo. Economia realista: ~1-2 semanas do gargalo da Fase 2 (não 2-3 — o subconjunto crítico é maior do que um corte ingênuo sugeriria, por incluir `ghl-api-worker` e as syncs que alimentam `sdr_name`/tags/MQL).
4. **Backfill completo da Fase 6** (as ~20-25 tabelas puramente internas de fila, acessadas só por `service_role` — `contact_opp_sync_queue`, logs de sync, etc.) — adiado. Mantêm o join indireto/RLS de `service_role`, já seguro hoje. **Fica dentro do MVP**, por outro lado, a denormalização das 3 tabelas centrais do CRM (ver tabela acima) e o `workspace_id` em `ghl_api_jobs` (rate-limit/billing do 1º tenant) — essas duas não são adiadas porque (a) a denormalização do CRM é pré-requisito de segurança do hard-delete (16.3) e é mais barata para migrar agora, com menos volume e um único tenant vivo, e (b) `ghl_api_jobs` é a fila viva usada por billing/rate-limit desde a Fase 5. **Gatilho de retomada** do restante: volume alto de fila **ou** entrada do 2º cliente pagante.

**Validação de demanda antes de tudo (novo — resíduo do achado de "des-riscar com sub-conta interna"):** antes de abrir a Fase 0, obter compromisso verbal/LOI de 2-3 prospects de que pagariam por um tier mais barato (ver seção 17, item 3) — se não houver disposição de pagamento comprovada, nenhum dos cortes acima importa, porque o projeto inteiro não se justifica. A prática de usar uma **sub-conta interna da própria Alto Valor** (ex.: uma segunda marca interna) como primeiro tenant adicional de burn-in **já era exigida pela "regra de ouro"** desta seção 10 e pela tabela de riscos da seção 11 — este corte de MVP não muda isso, apenas reforça que o DPA (Fase 8) roda em paralelo e não bloqueia esse burn-in interno, só o 2º tenant real pagante.

**Efeito agregado estimado:** reduz o MVP de ~20-30 semanas-pessoa (Fases 0-8 completas) para uma faixa substancialmente menor ao remover do caminho crítico a Fase 3 inteira (3-10+ semanas), a suite/retrofit de RLS aditiva (parte da Fase 1, ~1 semana), e ~1-2 semanas do gargalo da Fase 2 — sem tocar no DPA/Fase 8, que continua obrigatório antes do 2º tenant real pagante.

### 10.4 Rollback por fase (novo na v3 — o kill-switch da Fase 2 só decide "não avançar", não reverte o que já está aplicado)

A seção 10.2 define um kill-switch **para frente** (não iniciar a Fase 3+, manter o modelo de instância isolada como padrão). Isso não cobre reverter uma migration/deploy **já aplicado** na instância de produção do cliente atual — que é onde todas as Fases 1-2 realmente rodam, por ser a única instância viva até a "regra de ouro" liberar o 2º tenant. Nenhuma migration de Fase 1-2 deve tocar a instância do cliente pagante sem o caminho de reversão abaixo ensaiado em staging (seção 4.1):

1. **Down-migration versionada para o retrofit de políticas** (seção 3.3/3.3.2): gerar, junto com a migration programática que cria as políticas de agência, o `DROP POLICY` correspondente, e ensaiá-lo em staging antes de aplicar em produção.
2. **Dead-letter em vez de descarte no `webhook-ghl`** (seção 5.4): eventos não resolvidos por falha de credencial/location (401) vão para uma tabela `webhook_unresolved` com reprocessamento, em vez de "log e descarta". Isso protege contra perda total de eventos numa janela de bug na resolução de credencial — o cenário mais provável de precisar de rollback rápido.
3. **Reversão temporária do segredo global do webhook:** enquanto ainda existe apenas **um** tenant real (Fases 1-2, antes da "regra de ouro" liberar o 2º tenant), manter a possibilidade de reverter para o segredo global por configuração/flag, sem redeploy — seguro justamente porque só há um tenant nessa janela; deixa de ser aceitável assim que o 2º tenant real entrar.
4. **Pré-condição de gate:** nenhuma migration/refatoração de Fase 1-2 é aplicada na instância do cliente pagante sem o caminho de reversão correspondente ter sido ensaiado em staging (seção 4.1) — isso complementa, não substitui, o kill-switch de "não avançar" da seção 10.2.

---

## 11. Riscos concretos e mitigação

| Risco | Por que é grave | Mitigação |
|---|---|---|
| **Fallback silencioso "workspace mais antigo"** em `get_workspace_id_by_ghl_location_id` | É o maior vetor de vazamento hoje — silencioso, sem log de alarme | Fase 2: virar falha dura (rejeitar + logar) antes do 2º tenant real |
| **Colisão de `ghl_location_id` entre duas sub-contas** (novo, seção 3.5) | Roteamento determinístico e silencioso para o workspace errado — o mesmo tipo de falha do item anterior, na direção oposta | Constraint `UNIQUE(ghl_location_id) WHERE is_active` em `ghl_integration_settings` + pré-checagem no fluxo BYOK antes do insert |
| **`can_access_workspace_via_agency` ignora `agency_workspaces.status`** (novo, crítico, corrigido nesta v2) | Admin de agência mantém acesso irrestrito a sub-conta suspensa/desligada indefinidamente | Filtro `AND aw.status='active'` na função (seção 3.3) + suite de teste dedicada (3.3.1) + tratamento como função de risco máximo (2 revisores, testes exaustivos) |
| **Cache de credenciais sem invalidação amarrada à rotação** (novo, corrigido nesta v2) | Credencial revogada/vazada continua servida enquanto isolate Deno ficar "quente", além do TTL nominal | Chave de cache com `rotation_version` + revogação física no Vault (seção 5.3) |
| **Reativação automática de sub-conta suspensa via reaproveitamento de `location_id`** (novo, seção 3.6) | Empresa nova herda acesso ao histórico de CRM de empresa antiga não relacionada | Nunca reativar automaticamente; exigir confirmação humana comparando titularidade antes de reconectar |
| **Convite automático de admin baseado em dado não confirmado da API do GHL** (novo, corrigido nesta v2) | Concede admin no Empire (acesso a dados financeiros, credenciais) sem validação humana, baseado em campo de API nunca auditado | Staging de candidatos + aprovação manual explícita (seção 6.1) |
| **Credencial em constante de módulo** reintroduzida por engano em refatoração futura | Um bug de "esqueci de mover pra dentro do handler" reintroduz exatamente o problema que a Fase 2 resolve, mas de forma que *parece* multi-tenant (o código lê workspace_id em algum lugar, só não usa pra credencial) | Teste automatizado específico (seção 4.1) que verifica qual chave foi realmente usada em cada chamada, não só que o RLS bloqueou leitura |
| **Vault exposto via PostgREST** por erro de política | Vazaria segredo de todos os tenants de uma vez | Teste negativo explícito: JWT autenticado normal, mesmo sendo owner do workspace, não pode `SELECT` `workspace_integration_credentials` |
| **`outbound_webhooks` sem RLS ou sem filtro de tenant na trigger** (novo, corrigido nesta v2) | Uma sub-conta poderia cadastrar URL própria e receber payload de contrato assinado de outro cliente | RLS explícita + filtro de `workspace_id` na query da trigger + SSRF hardening (seção 5.2) + teste dedicado (4.1) |
| **Canal de transporte da credencial BYOK não seguro** (novo, corrigido nesta v2) | Chave GHL de terceiro trafega por e-mail/WhatsApp/suporte antes de chegar ao Vault | Link de intake de uso único, proibição explícita de canais de texto livre (seção 7.1) |
| **Blast radius compartilhado** — um bug de RLS ou um deploy ruim de edge function agora afeta todos os tenants ao mesmo tempo, vs. hoje em que um bug fica contido a 1 projeto Supabase | Este é o trade-off estrutural do modelo multi-tenant | Rollout escalonado: primeiro tenant adicional interno/baixo risco, burn-in monitorado, só depois clientes pagantes reais; ver também tratamento de risco máximo da seção 3.3.1 |
| **Rate limits/cotas compartilhadas** (GHL, Meta, OpenRouter) — um cliente com sync pesado pode throttlear outro ("noisy neighbor") | Afeta disponibilidade, não só segurança | Adicionar `workspace_id` na fila `ghl_api_jobs` (Fase 6) e implementar rate limit por workspace (token bucket) na fila já existente; estender ao acionamento manual de descoberta (seção 6.3) |
| **Ausência de alerta ativo de saúde de integração** (novo, corrigido nesta v2) | Token expira, sync para silenciosamente, cliente só percebe dias depois | Cron de health check + notificação ativa (seção 8.1) |
| **Retrofit manual de ~90 políticas RLS** | Editar 90+ arquivos à mão é fonte garantida de erro humano | Gerar a migration a partir de `pg_policies` programaticamente, revisar o SQL gerado, nunca escrever à mão tabela por tabela |
| **Endpoint da Agency API do GHL não confirmado** (seção 6.2) | Investir na Fase 3 sem validar a suposição técnica pode gerar retrabalho | Prova de conceito isolada com o token real antes de desenhar a edge function definitiva, cobrindo as 4 dimensões da seção 6.2, com critério de go/no-go mensurável |
| **Ausência de billing/atribuição de custo por sub-conta** (novo, seção 14) | Impossível saber qual sub-conta gera custo de API, decidir repasse ou suspender abuso | `workspace_usage_metrics` agregado a partir da fila já existente com `workspace_id` |
| **LGPD/direitos do titular não tratados em infraestrutura compartilhada** (novo, seção 15) | Exposição legal (multa até 2% do faturamento) e reputacional | DPA por sub-conta, runbook de expurgo, base legal documentada |
| **Ausência de offboarding real (hard-delete)** (novo, seção 16) | Impossível atender pedido de exclusão LGPD sem risco de apagar dados do tenant errado | Fluxo de exclusão desacoplado do status de provisionamento, com export prévio e prazo de carência |
| **Ausência de comunicação/consentimento com o cliente atual sobre a mudança de arquitetura** (novo, seção 16.1) | Ruptura de confiança e risco de violação do dever de transparência da LGPD se descoberto após incidente | Atualização de contrato/termos + comunicação formal antes do 2º tenant real |
| **Restore pós-incidente num banco compartilhado força escolha entre perder dados do tenant afetado ou reverter escritas legítimas de todos os demais** (novo na v3, seção 18) | PITR/snapshot do Supabase é do banco inteiro — sem primitivo nativo de restore seletivo por workspace | Restore lógico por workspace via instância paralela + export periódico por tenant; RPO/RTO definidos e testados antes do 2º tenant real (seção 18) |
| **Bug na função de RLS compartilhada vaza dados entre N sub-contas simultaneamente e não há runbook de resposta/comunicação em massa** (novo na v3, seção 19) | No modelo atual, no máximo 1 cliente é afetado por incidente; no modelo Agency, um único bug obriga notificar ANPD e N controladoras ao mesmo tempo | On-call, severidade dedicada "afeta N tenants", template de comunicação, tabletop obrigatório antes do 2º tenant real (seção 19) |
| **Offboarding de pessoa da própria Alto Valor (agency_member) sem processo de revogação** (novo na v3, seção 19) | Um `agency_admin` desligado mantém, tecnicamente, acesso cross-tenant a todas as sub-contas ativas se ninguém desativar a linha | Checklist de desligamento (is_active=false, invalidação de sessão, rotação de segredo de agência, auditoria de acesso) — seção 19 |
| **Depreciação/mudança silenciosa de contrato da API do GHL quebra todas as sub-contas ao mesmo tempo** (novo na v3, seção 6.2 item 5) | Smoke-tests de status (8.1) não pegam um HTTP 200 com campo renomeado/paginação alterada | Smoke-test canário de *shape* de resposta por endpoint crítico + monitoramento de changelog/sunset da GHL (seção 6.2, 8.1) |

---

## 12. Trade-offs honestos vs. o modelo atual

| Dimensão | Modelo atual (1 instância por cliente) | Modelo Agency multi-tenant (proposto) |
|---|---|---|
| Isolamento de dados | Perfeito "de graça" (bancos fisicamente separados) | Depende de RLS + credenciais corretas — exige disciplina e testes contínuos |
| Custo de infraestrutura por cliente novo | Alto (novo Supabase + novo Vercel + secrets próprios) — ver estimativa numérica na seção 12.1 | Baixo (novo tenant na instância existente) — ver estimativa numérica na seção 12.1 |
| Velocidade de onboarding de cliente pequeno | Lenta (provisionar instância inteira) | Rápida (criar workspace + credenciais) |
| Blast radius de um bug | Contido a 1 cliente | Potencialmente todos os tenants simultaneamente (mitigado parcialmente pela seção 3.3.1) |
| Complexidade operacional | Baixa por instância, mas replicada N vezes | Alta concentrada em 1 lugar (Vault, RLS, filas por tenant) |
| Esforço de engenharia para migrar | — | Grande e sustentado: 16+ edge functions tocadas, ~35 tabelas tocadas, operação nova de Vault/secrets — ver faixa estimada por fase na seção 10 |
| Billing/atribuição de custo por cliente | Trivial (fatura da instância = custo do cliente) | Exige instrumentação nova (seção 14) |
| Compliance LGPD (isolamento físico vs. lógico) | Isolamento físico facilita alegação de segregação | Exige DPA formal e runbook de expurgo (seção 15, 16) |
| Adequado para clientes grandes/sensíveis (exigência contratual de isolamento físico) | Sim, nativamente | Não recomendado sem tier separado |

**Recomendação final:** adotar o modelo híbrido explicitamente como decisão de produto, não como situação transitória — Agency multi-tenant para a maioria dos clientes (onde o custo por instância é a dor real), instância isolada mantida como oferta premium/enterprise para quem exige garantia física de isolamento. Isso também reduz o risco do próprio rollout: os primeiros tenants a entrar na Agency devem ser os de menor sensibilidade, não os maiores contratos. **Esta recomendação deve ser confirmada pela estimativa de custo/ROI da seção 12.1 antes de virar decisão formal** — o texto acima descreve a direção qualitativa, não substitui a conta numérica.

### 12.1 Estimativa de custo/ROI (nova — pendente de validação financeira)

A v1 não continha nenhum número sustentando a recomendação do modelo híbrido — apenas rótulos qualitativos ("Alto"/"Baixo"). Para uma decisão de investimento real, isto precisa ser expresso em valores, mesmo que aproximados:

1. **Custo mensal real hoje de 1 instância isolada por cliente** — levantar do faturamento real da Vercel/Supabase de 2-3 clientes existentes (plano Supabase por projeto, egress médio, invocações de edge functions, domínio Vercel). *Não estimado neste documento — depende de acesso a billing real, marcado como pendente.*
2. **Custo marginal de adicionar 1 tenant a uma instância Agency já existente** — storage adicional, execuções extras de cron/edge function, chamadas a Vault, eventual necessidade de upgrade de plano por número de conexões/RLS overhead. *Também pendente.*
3. **Ponto de equilíbrio:** quantos tenants adicionais, ao longo de quantos meses, são necessários para a economia acumulada de infraestrutura superar o custo de engenharia das Fases 0-8 (usando a faixa de pessoa-semana da seção 10 × custo/hora estimado do time, como ordem de grandeza).

**Esta subseção fica marcada como pendente de validação financeira com o time responsável pelo billing** — adicionado como item obrigatório na lista de "Próximos passos sugeridos" (seção 17), antes de decidir formalmente o modelo híbrido como política de produto.

### 12.2 Critério objetivo de roteamento de tier (novo na v3)

O modelo híbrido (seção 12) recomenda "instância isolada para quem exige isolamento físico", mas não definia nenhum critério **objetivo** de em qual tier um cliente novo entra — ficava implícito e sujeito a decisão caso a caso sob pressão comercial, o que arrisca exatamente o erro que a "Recomendação final" da seção 12 já identifica (colocar um cliente grande/sensível na infra compartilhada). Regra de roteamento:

**DEFAULT:** todo cliente novo entra como sub-conta multi-tenant (Agency, via BYOK — seção 10.3).

**Roteia obrigatoriamente para instância isolada** se **qualquer** destes gatilhos for verdadeiro:
1. Exigência contratual explícita de isolamento físico.
2. Volume de leads/mês acima de um teto definido — o mesmo eixo do risco "noisy neighbor" da seção 11, para não deixar um consumidor desproporcional de compute/rate-limit compartilhado no pool.
3. Dado regulado / alta sensibilidade, conforme a classificação de sensibilidade do DPA (seção 15).
4. Ticket mensal acima de um limiar no qual o custo de uma instância dedicada já se paga — limiar derivado do ponto de equilíbrio da seção 12.1.

**Regra de desempate:** na dúvida, isolar (mais caro, nunca menos seguro).

Os limiares numéricos dos itens 2 e 4 ficam **pendentes** até o billing real da seção 12.1 estar levantado (seção 17, item 2). Qualquer exceção a esta regra (colocar um cliente que dispara um gatilho no multi-tenant mesmo assim) exige aprovação explícita e registrada, análoga ao marco go/no-go da seção 10.1.

### 12.3 Assurance externa (SOC2/ISO/pentest) — quando o isolamento lógico precisa ser provado a terceiros (novo na v3)

O isolamento do modelo atual é **físico e auto-evidente** (bancos separados) — não precisa ser provado a ninguém. No modelo Agency, o isolamento passa a ser **lógico** (RLS + credenciais), e para ser vendido como "seguro" a um cliente externo não-trivial normalmente é preciso **evidência independente**, não apenas a suíte de isolamento interna (seção 4.1) ou a própria revisão adversarial deste documento (Anexos A/B) — ambas auto-declaradas. Ações recomendadas, sem bloquear o MVP (seção 10.3), mas como pré-requisito de vender o tier multi-tenant a clientes maiores:

1. **Pentest de terceiro** focado especificamente em isolamento multi-tenant (cross-tenant via RLS, `can_access_workspace_via_agency` quando implementada, vazamento de credenciais no Vault) como gate antes de aceitar o primeiro cliente pagante **externo** na Agency — complementar à Fase 0/4.1, não substituto.
2. Avaliar o custo/prazo de **SOC2 Type II ou ISO 27001** como item da conta de ROI (seção 12.1) — não é só custo, é viabilizador comercial para clientes de maior ticket que exigem esse tipo de evidência.
3. Deixar explícito que "auditoria" neste documento, até este ponto, significa log/revisão interna — assurance externa independente é categoria distinta, complementar ao DPA (seção 15), e ainda não endereçada além desta nota.

---

## 13. Arquivos e tabelas críticos referenciados neste plano

- `supabase/migrations/20260225100000_create_workspaces_and_members.sql` — schema raiz de workspaces
- `supabase/migrations/20260225102000_fix_workspace_members_rls_recursion.sql` — funções RLS `is_workspace_member/admin/owner`
- `supabase/migrations/20260709120000_remove_ghl_api_key_from_settings.sql` — decisão de segurança que motiva o uso de Vault na seção 5
- `eb-dash2/src/lib/workspace.ts` — `SINGLE_WORKSPACE_MODE`, seletor de workspace
- `eb-dash2/src/components/layout/WorkspaceSelector.tsx` — já existe, hoje escondido
- `supabase/functions/sync-contact-opportunities/index.ts` — padrão de credencial global a refatorar, repetido em outras 15 functions GHL
- `supabase/functions/discover-ghl-config/index.ts` — referência mais próxima de resolução por workspace (ainda incompleta)
- `supabase/functions/webhook-ghl/index.ts` — validação de webhook de entrada a tornar por sub-conta
- `scripts/provision-new-client.ts` — provisionamento atual, a estender com modo `agency-subaccount`
- `docs/SINGLE-TENANT-LOCK.md` — decisão histórica que este plano propõe suceder
- `docs/GHL-CREDENCIAIS.md` — estado atual de credenciais GHL por workspace (metadados sim, segredo não)
- `docs/REPLICACAO-TECNICA.md` — arquitetura de replicação atual, a atualizar com o modo híbrido
- `docs/GHL-MAPEAMENTO-CAMPOS.md` / `docs/GHL-MAPEAMENTO-REFATORACAO.md` — camada de mapeamento multi-conta já madura, base a reaproveitar
- `docs/APIS-DOCS/ghl-conversations-api.md` — rate limit documentado (100 req/10s), referenciado na análise de risco da seção 6.2
- `supabase/functions/ghl-api-worker/index.ts` — worker de fila com throttling/backoff já implementado, reaproveitado nas seções 6.1/6.3

### 13.1 Identificador de correlação para suporte operacional (novo, identificado na revisão)

O plano não desenhava como o suporte da Alto Valor identifica rapidamente "qual sub-conta é essa" quando um usuário final reporta um problema, num mundo onde dezenas de sub-contas coexistem na mesma instância (ao contrário do modelo atual, onde 1 instância = 1 cliente elimina essa ambiguidade por construção). Correção: um código curto e estável (ex: slug de 6-8 caracteres tipo `#AV-7K2Q`, não o UUID cru de `workspace_id`, para não contradizer a filosofia de `SINGLE_WORKSPACE_MODE` de esconder terminologia multi-tenant do usuário final) exibido discretamente no rodapé/menu de conta do dashboard do cliente, incluído automaticamente em toasts/telas de erro relevantes e num botão "Copiar informações de suporte" no menu de ajuda.

---

## 14. Billing e atribuição de custo por sub-conta (nova seção — gap identificado na revisão)

A v1 nunca discutia como o custo de infraestrutura compartilhada (compute do Supabase, chamadas de API GHL/Meta/OpenRouter) é medido, atribuído ou cobrado por sub-conta — uma lacuna funcional grave para um modelo explicitamente chamado de "Agency com múltiplos clientes".

1. `workspace_id` obrigatório em toda tabela de log/fila de chamada de API externa paga (GHL, Meta, OpenRouter) — já recomendado na Fase 6 por motivo de rate-limit (seção 11); reaproveitar o mesmo campo para custo, não criar coluna duplicada, e reclassificar essa mudança também como pré-requisito de billing.
2. Nova tabela `workspace_usage_metrics` (workspace_id, provider, date, request_count, tokens_ou_unidades, custo_estimado), agregada diariamente via cron a partir dos logs/fila já existentes (`ghl_api_jobs`, logs de chamada OpenRouter no `bot-chat`/`prevendas-ai`).
3. **Decisão de produto explícita, antes do rollout Agency para clientes reais:** custo repassado por sub-conta, incluído em mensalidade fixa com teto de uso (com alerta/suspensão automática ao estourar), ou absorvido pela Alto Valor. Isso muda a viabilidade econômica descrita na seção 12/12.1 e deve constar como mais uma linha da tabela de trade-offs.
4. Painel de custo/uso por sub-conta na área `/agency/*` (seção 8), reaproveitando `workspace_usage_metrics` — não apenas "saúde de integração".

---

## 15. LGPD, direitos do titular e Acordo de Processamento de Dados (nova seção — gap crítico identificado na revisão)

A v1 tratava "isolamento de dados" exclusivamente como um problema técnico de RLS/credenciais entre sub-contas, mas nunca abordava que os dados armazenados são **dados pessoais de leads** — pessoas físicas terceiras que nunca deram consentimento para que seus dados coexistam na mesma infraestrutura física de outras empresas clientes da Alto Valor. Isso é agravado pelo fato de a Alto Valor, como Agency, passar a ter acesso técnico a todas as sub-contas simultaneamente (seção 3.3).

1. **Data Processing Agreement (DPA) por sub-conta**, formalizando: a infraestrutura é compartilhada com outras empresas clientes; a Alto Valor atua como operadora; a sub-conta é controladora dos dados dos próprios leads; o acesso técnico via `can_access_workspace_via_agency` implica responsabilidade compartilhada por incidentes.
2. **Runbook técnico de expurgo de titular específico**, cobrindo todas as tabelas que guardam ou derivam dado pessoal — incluindo a **colisão explícita com a regra "`webhooks_ghl.payload` é IMUTÁVEL, nunca alterar ou deletar"** já documentada no `CLAUDE.md` deste projeto. Decisão necessária: anonimização em vez de deleção física para essa tabela específica, ou exceção documentada de retenção legal. O runbook também precisa cobrir `comunicacoes`, `oportunidades`, `vendas_fechamento`, `ghl_tasks`, filas de sync e backups.
3. Definição de bases legais e prazos de retenção por tipo de dado de lead, referenciada como pré-requisito da Fase 8 (seção 10).
4. Este runbook alimenta diretamente o fluxo de offboarding/exclusão da seção 16.

---

## 16. Offboarding, exclusão de dados e comunicação com o cliente atual (nova seção — gap crítico identificado na revisão)

### 16.1 Comunicação/consentimento com o cliente atual sobre a mudança de arquitetura

A seção 3.4 preserva deliberadamente a UX do cliente atual "sem nenhuma mudança percebida" — mas isso não deve significar **nenhuma comunicação** sobre uma mudança material na forma como os dados são processados e armazenados (de instância física isolada para infraestrutura logicamente compartilhada). Antes de qualquer sub-conta paga/real adicional coexistir na mesma instância do cliente atual (o marco já definido como "regra de ouro" na seção 10):

1. Atualizar contrato/termos de serviço prevendo explicitamente infraestrutura compartilhada multi-tenant com isolamento lógico (RLS), em vez de isolamento físico.
2. Comunicar formalmente ao cliente atual essa mudança — mesmo que a UX não mude — atendendo ao princípio da transparência da LGPD (art. 6º, IX) e ao direito de informação sobre o tratamento (art. 9º).
3. Oferecer, na mesma comunicação, a opção contratual de permanecer no tier de instância isolada (seção 12, oferta enterprise), possivelmente com custo adicional.
4. Registrar esse aceite/comunicação como pré-requisito formal de "pronto" da Fase 8 (seção 10), ao lado dos critérios técnicos.

### 16.2 Offboarding formal — desacoplado do status de provisionamento

O modelo hoje só define `agency_workspaces.status='suspended'` para sub-contas removidas ("nunca deleta dados") — sem fluxo de cancelamento definitivo com exportação e exclusão real, uma obrigação comum de contrato de agência e uma obrigação legal de LGPD (direito à eliminação, Art. 18). Correção — tratar exclusão como um **processo paralelo e auditável**, não como mais um valor de `agency_workspaces.status` (que é sobre *provisionamento*, não sobre *ciclo de vida de dados pessoais* — misturar as duas semânticas é um risco em si):

```sql
CREATE TABLE workspace_deletion_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    requested_by UUID NOT NULL REFERENCES auth.users(id),
    requested_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'export_pending'
        CHECK (status IN ('export_pending', 'export_done', 'grace_period', 'deleted')),
    scheduled_deletion_at TIMESTAMPTZ
);
```

### 16.3 Fluxo de exportação + hard-delete

1. Edge function/RPC `export-workspace-data`: varre todas as tabelas com `workspace_id` (diretas + as do gap da seção 4.2/4.3, uma vez populadas) e gera um pacote assinado, entregue ao solicitante antes de qualquer exclusão — pré-requisito obrigatório de LGPD (art. 18, IX).
2. Hard-delete só roda depois de (a) export confirmado e (b) prazo de carência configurável (ex: 30 dias) vencido — aproveitando os `ON DELETE CASCADE` já definidos a partir de `workspaces`/`agency_workspaces`, mas exigindo auditoria linha-a-linha de cada tabela do gap da seção 4.2 antes de habilitar em produção (a mesma seção já reconhece que essas tabelas não têm `workspace_id` consistente hoje).
3. Este fluxo é parte da Fase 8 (seção 10), já que depende de `workspace_id` populado e `NOT NULL` nas tabelas do gap para ser seguro — hard-delete antes disso corre o mesmo risco de "apagar tabela errada" que a seção 4.2 já identifica para leitura via RLS.

---

## 17. Próximos passos sugeridos (fora deste estudo)

1. Validar tecnicamente as **quatro dimensões de POC** da seção 6.2 (endpoint real da Agency API do GHL, modelo de consentimento por sub-conta, modelo de entrega de webhooks Marketplace, confiabilidade/granularidade do campo de admin) com o token de agência do usuário, em ambiente de teste, usando o critério de go/no-go mensurável definido ali. A 5ª dimensão (ciclo de vida/versionamento da API) não é um gate desta POC — vira monitoramento contínuo via seção 8.1. **Dado o corte de MVP da seção 10.3, este item só é necessário quando a Fase 3 (pós-MVP) for de fato priorizada — não bloqueia o início do MVP via BYOK.**
2. Levantar os dados reais de billing (Supabase/Vercel) para preencher a estimativa de custo/ROI pendente da seção 12.1, incluindo a meta de tempo de onboarding em horas (hoje só qualitativa na tabela de trade-offs da seção 12) e os limiares numéricos de volume/ticket do critério de roteamento de tier (seção 12.2).
3. **Validar demanda antes de comprometer capacidade (novo na v3):** obter compromisso verbal/LOI de 2-3 prospects de que pagariam ~$X/mês por um tier multi-tenant mais barato. Sem disposição de pagamento comprovada, o modelo híbrido não se justifica economicamente, independentemente do ponto de equilíbrio de infraestrutura da seção 12.1. Se o break-even (12.1, item 3) exigir mais sub-contas do que o pipeline comercial real de 12 meses comporta, reescopar para BYOK-only (seção 10.3) ou adiar o projeto.
4. Redigir e revisar juridicamente o DPA por sub-conta e o runbook de expurgo (seção 15) — pré-requisito da Fase 8, mas que pode começar em paralelo às Fases 0-2 por não depender de código. Amarrar a isso o desenho do runbook de resposta a incidente multi-tenant (seção 19) e ao menos um exercício de mesa (tabletop) simulando vazamento cross-tenant, ambos pré-requisito do mesmo marco ("regra de ouro", seção 10).
5. Avaliar, como parte da decisão de investimento, se o tier multi-tenant precisa de assurance externa (pentest de terceiro focado em isolamento multi-tenant, e/ou SOC2 Type II/ISO 27001 a médio prazo) para ser vendável a clientes de maior porte — ver seção 12.3.
6. Decidir formalmente o modelo híbrido (seção 12) como política de produto antes de iniciar a Fase 0, condicionado aos itens 1-3 acima.
7. Só então abrir a primeira tarefa de implementação real: Fase 0 (suite de testes de isolamento, já incluindo os casos novos de agência/status/UX single-tenant), seguindo o **corte de MVP recomendado na seção 10.3** (BYOK primeiro, RLS aditiva e Fase 3 adiadas) — pré-requisito de tudo o resto.
8. **(item planejado, futuro, 2026-07-14):** "Inscrições no Formulário" — leitura, dentro do dashboard, de leads capturados por um formulário externo próprio de cada sub-conta. Decisão confirmada do dono: a tabela `aplic-acelerador` (hoje single-tenant, exclusiva da instância atual) **não vira multi-tenant**; cada sub-conta que quiser o mesmo recurso replica sua própria infraestrutura (Supabase + Vercel próprios, mesmo padrão da skill `/ghl-form-integration`) e conecta essa tabela externa ao nosso sistema só para leitura, fornecendo a service role key do próprio projeto dela (guardada em Vault, nunca exposta). Desenho técnico completo, decisões já tomadas e pontos em aberto: ver seção 8 (`## 8. PLANEJADO (futuro, não iniciado) — Inscrições no Formulário`) de [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md). Não bloqueia nem depende de nenhuma fase 0-8 deste plano — é um recurso de produto ortogonal ao isolamento de dados aqui descrito.

---

## 18. Disaster Recovery e Restore Seletivo por Tenant (nova seção — gap identificado na revisão profunda)

O plano trata exaustivamente a exclusão **deliberada** de dados (seção 16: export, hard-delete, `ON DELETE CASCADE`, carência) e cita "backups" uma única vez, apenas no contexto de expurgo LGPD (seção 15). Nunca aborda a operação inversa: **restaurar** dados após um incidente (corrupção, deleção acidental, migration destrutiva, bug de trigger).

**A incompatibilidade estrutural:** no modelo atual "1 instância = 1 empresa", restaurar via PITR/snapshot do Supabase é trivial e isolado — restaura-se o projeto daquele cliente sem tocar em ninguém. No modelo Agency, o snapshot/PITR é do **banco inteiro**: não existe primitivo nativo de "restaurar apenas as linhas do workspace X para o ponto T". Um incidente que corrompa/apague dados da sub-conta B forçaria escolher entre perder os dados de B ou reverter o banco inteiro, desfazendo também as escritas legítimas de todos os outros tenants desde então.

**Correções obrigatórias:**

1. **Reconhecer a limitação na tabela de trade-offs (seção 12):** nova linha "Recuperação de desastre / restore pós-incidente" — modelo atual = restore isolado e trivial; modelo Agency = PITR do banco inteiro, sem restore seletivo nativo.
2. **Estratégia de recuperação lógica por workspace:** restaurar o snapshot/PITR para uma instância paralela/staging (a mesma da seção 4.1) e copiar seletivamente por `workspace_id` de volta para produção. A denormalização de `workspace_id` nas 3 tabelas centrais do CRM (seção 4.3, já dentro do MVP — seção 10.3) é pré-requisito também para restore seletivo, pela mesma razão que já é pré-requisito do hard-delete seguro (16.3): sem coluna direta e confiável, a cópia seletiva depende de join indireto e corre o mesmo risco de tocar o tenant errado.
3. **Export periódico automatizado por tenant** (reusando `export-workspace-data` da seção 16.3) como ponto de recuperação lógico granular, complementar ao PITR global.
4. **RPO/RTO por tenant definidos e um runbook de restore testado ponta a ponta** com workspace sintético — adicionado como critério de "pronto" da Fase 8 (seção 10) e como gate da "regra de ouro" (seção 10), ao lado dos critérios de LGPD/DPA já exigidos ali, antes de aceitar o 2º tenant real na mesma instância.

---

## 19. Resposta a Incidente Multi-Tenant e Offboarding de Pessoal da Agência (nova seção — gap identificado na revisão profunda)

### 19.1 Resposta a incidente e comunicação de violação que atinge múltiplos tenants

A seção 8.1 cobre apenas **monitoramento interno passivo/ativo** (alerta de saúde de integração, Slack interno da Alto Valor) — não é um processo de **resposta** a incidente nem de **comunicação** aos clientes afetados. O plano nunca desenhava o que acontece quando um incidente (bug na função de RLS compartilhada da seção 3.3.1, vazamento cross-tenant, indisponibilidade) atinge simultaneamente N sub-contas — cenário impossível no modelo atual (1 instância = no máximo 1 cliente afetado, 1 comunicação). Sob LGPD, um vazamento cross-tenant obriga notificar a ANPD (art. 48) e cada sub-conta afetada (controladora dos próprios leads, conforme o DPA da seção 15) em prazo razoável — e cada uma ainda precisa notificar seus próprios titulares.

**Correções:**

1. **Estrutura de on-call e severidade de incidente**, com uma severidade especial "afeta N tenants" que eleva automaticamente a prioridade — amarrada ao ponto de risco máximo já reconhecido na seção 3.3.1 (`can_access_workspace_via_agency`, quando/se implementada — seção 10.3) e ao vetor de vazamento por fallback de `location_id` (seção 11).
2. **Runbook de comunicação em massa:** template de notificação de violação, contato DPO/jurídico obrigatório por sub-conta cadastrado no onboarding (Fase 4/BYOK e Fase 6), e coordenação com o dever de cada controladora notificar seus próprios titulares — reconhecendo que, pela seção 15, a Alto Valor é operadora e cada sub-conta é controladora.
3. **Fluxo de notificação à ANPD** dentro do prazo do art. 48 da LGPD para incidente que envolve múltiplos controladores, incluindo quem coordena e quem assina.
4. **Gate obrigatório:** nenhum 2º tenant real/pagante na mesma instância antes de este runbook existir **e** ter sido validado por um **exercício de mesa (tabletop)** simulando um vazamento cross-tenant — o mesmo padrão de "runbook testado ponta a ponta com workspace sintético" que a Fase 8 já exige para o expurgo (seção 15/16) e que a seção 18 exige para restore.

### 19.2 Offboarding de pessoa da própria Alto Valor (`agency_member`)

O plano desenha com cuidado a **concessão** de acesso de agência (staging de admins da seção 6.1, four-eyes) e a revogação de **credenciais de integração** vazadas (seção 5.3), mas nunca o offboarding de um **funcionário/colaborador** da própria Alto Valor que seja `agency_member`. Isso é crítico porque, mesmo no MVP (onde a política aditiva de agência é adiada — seção 10.3), o dono da agência acessa cada sub-conta via `workspace_members`, e um `agency_admin` (quando a política aditiva existir) tem acesso de leitura/escrita a **todas** as sub-contas ativas simultaneamente — poder que não existe no modelo atual.

**Runbook de desligamento:**

1. Gatilho/checklist de desligamento que executa `UPDATE agency_members SET is_active=false` para todas as agências do usuário e remove eventuais linhas diretas em `workspace_members` (o caminho do MVP) — via RPC `SECURITY DEFINER` dedicada e auditada, nunca UPDATE manual avulso. Como as funções RLS leem `is_active` a cada query, isso já corta o caminho de acesso na próxima requisição.
2. **Invalidação ativa de sessões/refresh tokens** do usuário via Supabase Auth admin API — defesa em profundidade obrigatória para qualquer token de impersonation de escopo limitado (seção 3.3.1, item 4) ou caminho que cacheie a associação, que não dependem só do `is_active` do banco.
3. **Rotação de qualquer segredo de nível agência** que a pessoa possa ter visto (token GHL de agência, seção 8) — reaproveitando `rotation_version`/revogação física no Vault (seção 5.3), incluindo o passo primário de rotacionar no provider upstream.
4. **Auditoria:** revisar `agency_impersonation_log` e logs de acesso/sync por workspace no período anterior à saída, para detectar acesso indevido cross-tenant.
5. Pré-requisito de "pronto" da Fase 5 (área `/agency`) e da Fase 8 (LGPD/offboarding) — nova linha na tabela de riscos (seção 11).

---

## Anexo A: Revisão Crítica Multi-Agente (2026-07-09)

Esta seção documenta a rodada de verificação adversarial que originou a v2 deste plano. Um conjunto de agentes revisou o documento original em busca de falhas de segurança, lacunas de modelo de dados, viabilidade técnica e completude de produto/compliance; cada achado foi então **verificado individualmente** contra o texto real do plano e, quando aplicável, contra o código real do repositório, antes de ser aceito.

### Achados confirmados/plausíveis, incorporados ao corpo do plano

| # | Título (resumo) | Categoria | Severidade | Onde foi corrigido |
|---|---|---|---|---|
| 1 | `can_access_workspace_via_agency` ignora `status` da sub-conta — admin de agência mantém acesso irrestrito a sub-conta suspensa | security | **Crítico** | Seção 3.3 (filtro `status='active'`), 3.3.1 (tratamento como função de risco máximo), 4.1 (teste dedicado) |
| 2 | Cache de credenciais sem invalidação amarrada à revogação — chave vazada continua ativa | security | Alto | Seção 5.1 (`rotation_version`), 5.3 (chave de cache + revogação física no Vault) |
| 3 | Amplificação de blast radius — bug único na função compartilhada expõe ~90 tabelas de uma vez, sem processo de revisão proporcional | security | Alto | Seção 3.3.1 (2 revisores, suite de teste dedicada, alternativa de impersonation) |
| 4 | Auto-descoberta concede admin no Empire baseado em dado da API do GHL, sem confirmação humana | security | Alto | Seção 6.1 (staging de candidatos + aprovação manual), 8 (painel de aprovação) |
| 5 | Reaproveitamento de `ghl_location_id` após churn pode reativar sub-conta suspensa para empresa diferente | security | Médio | Seção 3.6 (nunca reativa automaticamente, confirmação humana obrigatória) |
| 6 | `outbound_webhooks` sem RLS especificada e sem garantia de filtro de tenant na trigger | security | Médio | Seção 5.2 (RLS explícita, filtro na query, SSRF hardening), 4.1 (teste dedicado) |
| 7 | Canal de transporte da credencial BYOK não definido — "por fora do sistema" não é mecanismo garantido | security | Médio | Seção 7.1 (link de intake de uso único, proibição de canais de texto livre) |
| 8 | Ausência de rate limit no botão "re-executar descoberta agora" e no spam de convites | security | Baixo | Seção 6.3 (cooldown, auditoria, idempotência) |
| 9 | Colisão de `location_id` entre sub-contas não é impedida | data-model | **Crítico** | Seção 3.5 (constraint de unicidade parcial + pré-checagem) |
| 10 | Nenhum modelo de billing/atribuição de custo por sub-conta | functionality | Alto | Seção 14 (nova) |
| 11 | Offboarding real (delete definitivo + exportação LGPD) nunca é desenhado | data-model | **Crítico** | Seção 16.2, 16.3 (novas) |
| 12 | Ausência de seletor/gestão para usuário admin de múltiplas agências simultaneamente | functionality | Médio | Seção 3.4.1 (Agency Selector) |
| 13 | Nota de risco da seção 6.2 ignora a política de consentimento por sub-conta no GHL | feasibility | Alto | Seção 6.2 (3 dimensões + critério de go/no-go mensurável + plano de fallback) |
| 14 | Nenhum mecanismo pró-ativo de alerta para perda de conectividade de integração | functionality | Médio | Seção 8.1 (nova) |
| 15 | Afirmação "cliente atual sem nenhuma mudança percebida" não tem plano de verificação | ops-compliance | Médio | Seção 3.4, 4.1 (teste de regressão de UX dedicado) |
| 16 | Nenhum identificador visível de sub-conta para suporte diagnosticar bugs | ops-compliance | Baixo | Seção 13.1 (nova) |
| 17 | Descoberta inicial de N sub-contas pode violar rate limit medido (100 req/10s) | feasibility | Alto | Seção 6.1/6.2 (nota sobre pacing já implementado no worker + pergunta em aberto sobre limite por token) |
| 18 | Modelo de webhook assume segredo por sub-conta, incompatível com Marketplace App | feasibility | Alto | Seção 5.4 (dois caminhos de validação, conforme `provisioning_mode`), 6.2 (dimensão 3 da POC) |
| 19 | GHL Users API pode não expor role/admin de forma confiável para convite automático | feasibility | Médio | Seção 6.1 (staging de candidatos), 6.2 (dimensão 4 da POC) |
| 20 | Plano não pesa o suficiente a alternativa de manter BYOK como caminho único na v1 | feasibility | Médio | Seção 10 (nota explícita sobre BYOK como caminho de menor risco/dependência) |
| 21 | Ausência total de tratamento de direitos do titular (LGPD) para leads de terceiros em infraestrutura compartilhada | data-model | **Crítico** | Seção 15 (nova) |
| 22 | "Saúde de sync" sem instrumentação real de observabilidade nem SLA de incidente | ops-compliance | Alto | Seção 8.1 (alerta ativo) |
| 23 | Nenhuma estimativa de custo/benefício numérica sustentando o modelo híbrido | ops-compliance | Alto | Seção 12.1 (nova, marcada como pendente de validação financeira) |
| 24 | Ausência de cronograma/alocação de pessoas para as 8 fases | ops-compliance | Médio | Seção 10 (coluna de esforço estimado), 10.1 (impacto na capacidade de engenharia) |
| 25 | Nenhum critério explícito de "quando desistir" (kill switch) se a Fase 2 falhar | ops-compliance | Alto | Seção 10.2 (nova) |
| 26 | Nenhuma menção a comunicação/consentimento com o cliente atual sobre a mudança de arquitetura | ops-compliance | Alto | Seção 16.1 (nova) |

### Achados descartados na verificação (não incorporados)

Dois achados foram levantados pela primeira leva de revisão mas **rejeitados** após verificação linha a linha do texto real do plano e do código real do repositório — mantidos aqui apenas para registro histórico, não como lacunas pendentes:

1. **"Convite automático de admin não define fluxo para usuário sem conta prévia no Empire"** — verificado como falso: o código real de `supabase/functions/invite-user/index.ts` já implementa os dois sub-fluxos (usuário existente vs. `inviteUserByEmail` para usuário novo), na ordem correta (cria a conta antes de inserir `workspace_members`). Não havia lacuna funcional real, apenas uma oportunidade cosmética de deixar isso mais explícito no texto — o achado #4 desta lista (que trata da **ausência de aprovação humana**, um problema real e diferente) foi mantido e incorporado.
2. **"PIT de nível agência com escopo de `installedLocations` provavelmente não existe — a premissa da Fase 3 já deveria ser tratada como bloqueador"** — verificado como já coberto: a seção 6.2 original já tratava essa incerteza como gate bloqueante explícito (critério de "pronto" da Fase 3, item #1 dos "próximos passos", entrada na tabela de riscos) — não era uma "nota de rodapé" como a alegação descrevia. A v2 manteve e **ampliou** esse tratamento (3 dimensões de POC + critério mensurável), mas o achado original, como formulado, não correspondia ao texto real.

### Nota sobre severidade "crítica" neste anexo

Este plano é, até o momento, **um documento de estudo — nenhuma migration foi aplicada, nenhuma edge function foi alterada**. As severidades "crítica"/"alta" atribuídas acima descrevem o que aconteceria **se o plano fosse implementado como escrito na v1**, não uma vulnerabilidade já explorável em produção hoje. Isso não reduz a importância da correção — é exatamente a função de uma revisão crítica de plano de arquitetura: identificar e corrigir a falha antes que vire código.

---

## Anexo B: Revisão Profunda (Rodada 2 — agentes de alta capacidade)

Esta seção documenta a **2ª rodada** de revisão crítica adversarial, mais profunda que a 1ª (Anexo A): agentes de alta capacidade focaram em lacunas de **segunda ordem** — as que só aparecem com escala/volume reais, contradições internas remanescentes da v2, bypasses de segurança de segundo nível, e oportunidades de simplificação estratégica do próprio escopo do plano. Cada achado foi verificado individualmente contra o texto real da v2 (e, quando aplicável, contra o código real do repositório) antes de ser aceito. **29 achados incorporados, 0 descartados.** Apenas documentação — nenhum código, migration ou edge function foi alterado.

### Achados incorporados ao corpo do plano

| # | Título (resumo) | Categoria | Severidade | Onde foi corrigido |
|---|---|---|---|---|
| 1 | Política RLS aditiva de agência sem benchmark nem índices de suporte sob volume real | data-model | Alto | Seção 3.3 (índices de suporte), 3.3.1 item 5 (gate de performance), 4.1 (staging production-like) |
| 2 | Gerador de políticas ignorava silenciosamente as 3 tabelas centrais do CRM (predicado por join) e tabelas particionadas | data-model | Alto | Seção 3.3.2 (nova) |
| 3 | Aperto de `NOT NULL` não tratava o lock `ACCESS EXCLUSIVE` do próprio `ALTER` contra ingestão viva | data-model | Alto | Seção 4.2 (migração online segura: `NOT VALID` + `VALIDATE CONSTRAINT` + `lock_timeout`) |
| 4 | Nenhum plano de rollback por fase — kill-switch da Fase 2 só decide "não avançar" | ops-compliance | Alto | Seção 10.4 (nova) |
| 5 | Nenhum ambiente de staging/homologação com volume production-like antes da instância viva | ops-compliance | Alto | Seção 4.1 (pré-requisito de staging) |
| 6 | Backfill histórico e tratamento de órfãos do `workspace_id` denormalizado nas 3 tabelas do CRM não desenhado | data-model | Alto | Seção 4.3 (backfill paginado + estratégia de órfãos + resolução do gate NOT NULL) |
| 7 | Suite de isolamento "rodando em produção" sem garantia de teardown nem de ausência de chamada externa real | ops-compliance | Médio | Seção 4.1 (regime de execução: tenants sintéticos efêmeros, teardown, mock obrigatório) |
| 8 | Seção 6.2 dizia "três dimensões" mas enumerava quatro (e o próprio Anexo A se autocontradizia) | contradiction | Alto | Seção 6.2 (quatro dimensões de POC + quinta dimensão temporal contínua), Fase 3 (tabela seção 10), seção 17 item 1 |
| 9 | Cabeçalho dizia "20 achados" enquanto o Anexo A listava 26 | contradiction | Médio | Cabeçalho/Status corrigido para refletir a contagem real do Anexo A (26) e desta rodada (29) |
| 10 | `CREATE TABLE agency_workspaces` mantinha `ghl_location_id` sem o `UNIQUE` que a seção 3.5 mandava aplicar | contradiction | Médio | Seção 3.2 (declaração explícita de fonte de verdade: `ghl_integration_settings`, `agency_workspaces.ghl_location_id` é só cache) |
| 11 | Referência cruzada quebrada: seção 3.4.1 apontava para "seção 3.6" (assunto errado) em vez de 3.5 | contradiction | Baixo | Seção 3.4.1 item 3 (referência corrigida para 2.2/3.5/5.4) |
| 12 | Suspensão de sub-conta não interrompe sessões/transações já abertas (janela MVCC) | security | Médio | Seção 3.3 (ressalva de consistência MVCC + mitigações) |
| 13 | Aprovação de admin descoberto dependia de um único `agency_admin` — sem four-eyes | security | Alto | Seção 6.1 item 7 (four-eyes, anti-auto-aprovação, notificação ao owner) |
| 14 | Location squatting — constraint de unicidade sem prova de posse do location | security | Alto | Seção 3.5.1 (nova) |
| 15 | Canal de entrega do link de intake BYOK não especificado; página sem autenticação | security | Médio | Seção 7.1 item 4 (restrição de canal, step-up, notificação, prova de posse) |
| 16 | SSRF em `outbound_webhooks` vulnerável a DNS rebinding — validação textual não cobre hostnames | security | Médio | Seção 5.2 item 3 (resolve-then-connect via edge function, allowlist de destino) |
| 17 | Invalidação de cache de credencial superestimava a proteção do `rotation_version`/Vault-delete; faltava rotação upstream | security | Alto | Seção 5.3 itens 1-4 (SLA de janela real, rotação no provider como passo primário) |
| 18 | Nenhum plano de disaster recovery / restore seletivo por tenant em banco compartilhado | ops-compliance | Alto | Seção 18 (nova) |
| 19 | Revogação de acesso por saída de funcionário da Alto Valor (`agency_member`) sem processo | ops-compliance | Alto | Seção 19.2 (nova) |
| 20 | Depreciação/versionamento da API do GHL pode quebrar N sub-contas simultaneamente sem detecção | ops-compliance | Alto | Seção 6.2 item 5, 8.1 item 5, seção 11 (nova linha de risco) |
| 21 | Resposta a incidente e comunicação de violação multi-tenant não desenhada | ops-compliance | Alto | Seção 19.1 (nova) |
| 22 | Certificação/auditoria externa (SOC2/ISO/pentest) não considerada como pré-requisito de vender isolamento lógico | ops-compliance | Médio | Seção 12.3 (nova) |
| 23 | Oportunidade: cortar a Fase 3 do MVP e inverter a ordem — BYOK primeiro | opportunity | Alto | Seção 10.3 (nova — corte de MVP) |
| 24 | Oportunidade: adiar a política RLS aditiva e o retrofit de ~90 tabelas — usar `workspace_members` comum no MVP | opportunity | Alto | Seção 10.3 (corte 2) |
| 25 | Oportunidade: refatoração incremental de credenciais — só o caminho crítico do 1º tenant, fail-closed no resto | opportunity | Alto | Seção 10.3 (corte 3) |
| 26 | Oportunidade: validar demanda (LOI) e des-riscar com sub-conta interna antes de qualquer gasto jurídico | opportunity | Alto | Seção 10.3 (validação de demanda), seção 17 item 3 |
| 27 | Oportunidade: métricas de sucesso mensuráveis e gate de break-even vs. pipeline comercial | opportunity | Médio | Seção 12.1 (meta de onboarding em horas), 17 item 3 (gate de break-even vs. pipeline) |
| 28 | Oportunidade: critério objetivo de roteamento de tier (multi-tenant vs. instância isolada) | opportunity | Médio | Seção 12.2 (nova) |
| 29 | Oportunidade: reduzir o escopo do backfill da Fase 6 ao necessário para o 1º tenant | opportunity | Médio | Seção 10.3 (corte 4) |

### Achados descartados nesta rodada

Nenhum. Todos os 29 achados levantados nesta rodada foram verificados como reais (confirmados ou plausíveis) contra o texto da v2 e incorporados ao corpo do plano — nenhum foi rejeitado na verificação.

### Nota sobre redundância com o Anexo A

Vários achados desta rodada são refinamentos de segunda ordem de correções já feitas na v2 (ex.: o achado #12 aprofunda a correção de `status='suspended'` do Anexo A #3; o achado #17 aprofunda a correção de cache/rotação do Anexo A #2). Nesses casos, a correção foi **integrada à redação já existente** no corpo do plano (não duplicada em uma seção nova), preservando o texto da v2 e adicionando a ressalva/mitigação da rodada 2 no mesmo lugar. Novas seções (3.3.2, 3.5.1, 10.3, 10.4, 12.2, 12.3, 18, 19) só foram criadas para lacunas genuinamente ausentes na v2.
