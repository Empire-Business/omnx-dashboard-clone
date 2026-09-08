# Módulo de Disparos (Tag-Driven Campaign Analytics)

| Campo | Valor |
|-------|-------|
| **Versão** | 1.1 |
| **Data** | 2026-07-05 |
| **Status** | Implementado |
| **Relacionado** | SUB-APPS-MODULARES.md, DASHBOARD-CONTROLE-ACESSO.md |

---

## 1. Visão Geral

Módulo para acompanhar campanhas de disparo (blasts) baseadas exclusivamente em **tags dos contatos**. Cada disparo é uma configuração que associa tags a significados operacionais:

- `trigger` — tag que indica que o contato entrou no disparo
- `respondeu` — tag que indica resposta do lead
- `parou` — tag de opt-out / "pediu para parar"
- `erro` — tag de erro na entrega
- `nao_respondeu` — tag de não resposta (explicitamente marcada)
- `converteu` — tag de conversão (renomeado de `comprou` em 2026-07-05: conversão pode significar mais que só compra — agendamento, lead qualificado, etc.)

O usuário pode criar **quantos disparos quiser**, configurando as tags e seus significados livremente. O módulo gera estatísticas completas e gráficos para cada disparo.

---

## 2. Exemplo de Uso

### Disparo: "Black Friday 2026"

| Significado | Tag configurada |
|-------------|-----------------|
| trigger | `disparo_bf_2026` |
| respondeu | `bf_2026_respondeu` |
| parou | `bf_2026_parou` |
| erro | `bf_2026_erro` |
| nao_respondeu | `bf_2026_nao_respondeu` |
| converteu | `bf_2026_converteu` |

### Métricas esperadas

- **Enviados (trigger)**: contatos com a tag `disparo_bf_2026`
- **Respondidos**: subset dos enviados com `bf_2026_respondeu`
- **Opt-out**: subset dos enviados com `bf_2026_parou`
- **Erros**: subset dos enviados com `bf_2026_erro`
- **Não responderam (explícito)**: subset dos enviados com `bf_2026_nao_respondeu`
- **Converteram**: subset dos enviados com `bf_2026_converteu`
- **Taxas**: resposta%, opt-out%, erro%, conversão%

---

## 3. Modelo de Dados

### 3.1 Tabela `disparos`

```sql
CREATE TABLE disparos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(workspace_id, nome)
);
```

### 3.2 Tabela `disparo_tags`

```sql
CREATE TABLE disparo_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  disparo_id UUID NOT NULL REFERENCES disparos(id) ON DELETE CASCADE,
  significado TEXT NOT NULL CHECK (significado IN (
    'trigger', 'respondeu', 'parou', 'erro', 'nao_respondeu', 'converteu'
  )),
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(workspace_id, disparo_id, significado),
  UNIQUE(workspace_id, disparo_id, tag)
);
```

> **Por que tag em vez de comunicações?** Tags são o "linguagem" já usada pelo GHL e pelas automações do usuário. Não precisamos rastrear envio individual — basta saber quem recebeu a tag de trigger e quais tags de resultado foram aplicadas depois.

### 3.3 Função helper `contato_tem_tag`

Como `contatos.tags` é `TEXT` CSV, a view usa uma função para comparar tags de forma case-insensitive e tolerante a espaços:

```sql
CREATE OR REPLACE FUNCTION contato_tem_tag(tags_text TEXT, tag_buscada TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  normalizada TEXT := lower(trim(tag_buscada));
  item TEXT;
BEGIN
  IF tags_text IS NULL OR normalizada IS NULL OR normalizada = '' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT trim(both ' ' from value::text) FROM jsonb_array_elements_text(to_jsonb(string_to_array(tags_text, ',')))
  LOOP
    IF lower(trim(item)) = normalizada THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

### 3.4 View `v_disparo_metricas`

View normal que cruza `contatos.tags` com `disparo_tags`. Para cada disparo, conta quantos contatos do workspace possuem a tag de trigger e, dentro desse grupo, quantos possuem cada tag de resultado.

```sql
CREATE OR REPLACE VIEW v_disparo_metricas AS
SELECT
  d.workspace_id,
  d.id AS disparo_id,
  d.nome AS disparo_nome,
  d.descricao,
  d.cor,
  d.is_active,
  d.created_at,
  d.updated_at,
  MAX(CASE WHEN dt.significado = 'trigger' THEN dt.tag END) AS tag_trigger,
  ...
  COUNT(DISTINCT CASE WHEN contato_tem_tag(c.tags, trigger_tag.tag) THEN c.id END) AS trigger_count,
  ...
FROM disparos d
JOIN disparo_tags trigger_tag ...
LEFT JOIN contatos c ...
LEFT JOIN disparo_tags dt ...
GROUP BY d.id, d.workspace_id, ...
```

Ver a migração completa em `supabase/migrations/20260705000000_create_modulo_disparos.sql`.

---

## 4. Arquitetura Frontend

### 4.1 Localização

Sub-app `disparos`, registrado em:
- `eb-dash2/src/lib/apps/features.ts` → `FEATURES_CATALOG`
- `eb-dash2/src/lib/apps/navigation.ts` → menu principal
- `eb-dash2/src/types/apps.ts` → `APP_CATALOG`
- Rota: `/disparos` em `eb-dash2/src/App.tsx`

### 4.2 Páginas/Abas

1. **Dashboard** (`/disparos?tab=dashboard`)
   - Cards com KPIs do disparo selecionado
   - Gráficos de barras comparando disparos
   - Funil por disparo
   - Tabela detalhada com taxas
   - Tabela de contatos do disparo selecionado

2. **Configuração** (`/disparos?tab=configuracao`)
   - Lista de disparos (CRUD)
   - Form para criar/editar disparo + tags
   - Apenas owner/admin

### 4.3 Componentes

- `DisparoMetricCards` — cards de métricas do disparo selecionado
- `DisparoBarChart` — comparação entre disparos
- `DisparoFunnel` — funil trigger → respondeu → converteu
- `DisparoMetricsTable` — tabela de métricas com seleção
- `DisparoConfigForm` — criação/edição de disparo e tags
- `DisparoContactTable` — lista de contatos do disparo

### 4.4 Hooks

- `useDisparos()` — lista de disparos + tags
- `useDisparoMetrics()` — métricas agregadas via `v_disparo_metricas`
- `useDisparoContacts({ disparoId, limit? })` — contatos de um disparo
- `useDisparoMutations()` — create, update, delete

---

## 5. Regras de Negócio

1. Um contato pode estar em múltiplos disparos ao mesmo tempo.
2. As tags de resultado são sempre avaliadas em relação aos contatos que têm a tag de trigger.
3. Se um contato tiver tag `trigger` e `converteu`, ele conta em ambos e na conversão.
4. Tags são case-insensitive na comparação (normalizar para lowercase).
5. Apenas `trigger` é obrigatório; os demais significados são opcionais.
6. Exclusão de disparo não afeta tags dos contatos — apenas remove a configuração.
7. Somente usuários com papel `owner` ou `admin` podem acessar, criar, editar ou excluir disparos e suas tags.

---

## 6. Segurança

- RLS em `disparos` e `disparo_tags` por `workspace_id`.
- SELECT em `disparos` e `disparo_tags` é permitido a qualquer membro ativo do workspace.
- INSERT, UPDATE e DELETE em `disparos` e `disparo_tags` são permitidos apenas a `owner`/`admin` (`is_workspace_admin`).
- View `v_disparo_metricas` filtra `contatos.workspace_id`.
- Integração com `app_role_permissions` / `app_user_overrides` via `PermissionsContext`.

---

## 7. Custo estimado por mensagem (2026-07-05)

Cada `disparo` tem um `tipo_mensagem` (`marketing` ou `utility`) — a categoria de template do WhatsApp Business Platform usada naquela campanha. Desde jul/2025 a Meta cobra por mensagem de template **entregue**, com preço variando por categoria e por país.

- Tabela `whatsapp_pricing_config` (uma linha por workspace): `preco_marketing`, `preco_utility` — o que o workspace realmente paga por mensagem em cada categoria, configurado na aba Configuração.
- `v_disparo_metricas.custo_estimado = trigger_count × preço da categoria do disparo`.
- Limitação conhecida: `trigger_count` é o número de contatos com a tag de trigger, uma aproximação do volume de mensagens entregues — não é uma reconciliação exata com a fatura da Meta (não há coluna de categoria de mensagem em `comunicacoes`).

## 8. Campos manuais customizáveis (2026-07-05)

Além das métricas derivadas de tags, o usuário pode definir campos extras pra preencher à mão por disparo (ex: "Faturamento confirmado", "Observações") — úteis pra métricas que não têm tag correspondente no GHL.

- `disparo_campos_custom` (definição, por workspace): `nome_campo`, `tipo` (`texto`/`numero`/`moeda`/`data`).
- `disparo_campos_custom_valores` (valor por disparo): `disparo_id`, `campo_id`, `valor` (TEXT, um valor por combinação).
- Gerenciado na aba Configuração ("Campos manuais"); preenchido na edição de cada disparo e exibido no Dashboard quando o disparo está selecionado.
- Feature `configuracao` restrita a `owner` e `admin` no `FEATURES_CATALOG`.
- `ConfiguracaoTab.tsx` e `useDisparoMutations()` verificam `hasFeaturePermission('disparos', 'configuracao')` antes de executar ações de escrita.
- `DisparosPage.tsx` oculta a aba **Configuração** e redireciona `/disparos?tab=configuracao` para o dashboard quando o usuário não tem permissão.

---

## 7. Decisões / Propostas

| # | Tópico | Decisão |
|---|--------|---------|
| 1 | Local no menu | Novo app **"Disparos"** no menu principal, ao lado de Pré-Vendas e Vendas. |
| 2 | Formato de `contatos.tags` | Confirmado: `TEXT` CSV. Comparação case-insensitive via `contato_tem_tag`. |
| 3 | View materializada | **View normal** no MVP. Se performance degradar (>10k contatos por workspace), migrar para materialized view com refresh manual/botão. |
| 4 | Evolução temporal | V1 usa `contatos.date_created` como proxy para a data de entrada no disparo (tag trigger). V2 pode rastrear histórico de tags se necessário. |
| 5 | Exportar CSV | Futuro. Botão pode ser adicionado no detalhe do disparo. |

---

## 8. Arquivos

- `supabase/migrations/20260705000000_create_modulo_disparos.sql`
- `eb-dash2/src/types/disparos.ts`
- `eb-dash2/src/hooks/useDisparos.ts`
- `eb-dash2/src/pages/disparos/DisparosPage.tsx`
- `eb-dash2/src/pages/disparos/tabs/DashboardTab.tsx`
- `eb-dash2/src/pages/disparos/tabs/ConfiguracaoTab.tsx`
- `eb-dash2/src/pages/disparos/components/*.tsx`
- `eb-dash2/src/lib/apps/features.ts`
- `eb-dash2/src/lib/apps/navigation.ts`
- `eb-dash2/src/types/apps.ts`
- `eb-dash2/src/App.tsx`

---

## 9. Validação

- `npx tsc --noEmit` executado sem erros no `eb-dash2`.
- Commit: `feat: implementa módulo de Disparos com tags configuráveis`.
