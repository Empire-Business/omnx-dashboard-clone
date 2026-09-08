# Vigilância automática de mudanças de campos GHL

| Campo | Valor |
|-------|-------|
| **Status** | ✅ **Aplicado e operacional em produção** (`qzesffnkqgelmtfblzkr`). Achado da sessão de 2026-07-21: este documento dizia "não aplicado em produção", mas a migration, os 2 crons e o banner do frontend já estavam rodando ao vivo — a documentação é quem estava desatualizada, não o código. Ver §6. |
| **Origem** | Item 4 do pedido do dono sobre mapeamento de campos GHL (2026-07-12), após auditoria confirmar que a detecção de mudanças existente só rodava sob clique manual. |
| **Migration** | `supabase/migrations/20260819000000_ghl_mapping_vigilancia.sql` |

---

## 1. O que existia antes

`computeMappingChanges` (`eb-dash2/src/lib/ghl-mapping.ts`) já sabia calcular a
diferença item-a-item entre um resultado de discovery e os mapeamentos salvos —
mas só era chamado com o resultado de um discovery **manual**, disparado por um
clique do usuário na UI (`useGhlDiscovery`, um `useMutation`, não um `useQuery`
que carrega algo salvo automaticamente). Sem ninguém clicar, nada era verificado
— e nenhum cron existia para isso (o único cron de "discovery" do projeto,
`discover_agency_locations_job`, descobre novas *sub-contas* de uma agência, não
campos customizados de uma conta já configurada).

## 2. Decisão de escopo: alerta de contagem, não diff item-a-item no cron

Reimplementar o diff item-a-item completo em SQL puro (comparando o JSON bruto
de cada endpoint do GHL — cada um com formato diferente) seria frágil e não
testável sem uma credencial GHL real disponível no ambiente. Em vez disso:

- O **cron** roda um discovery leve (`include_payload: false`, só conta quantos
  itens existem) e compara a contagem atual com a da última verificação. Se
  mudou, gera um **alerta de 1º nível**: "campos de contato: 10 → 13, revise".
- O **diff preciso** (quais campos exatos apareceram/sumiram) continua sendo o
  já existente `computeMappingChanges`, que roda quando o admin clica em
  "Revisar mapeamento" a partir do alerta — reaproveitando código já testado em
  vez de duplicar lógica de parsing por fornecedor.

Esse desenho é 100% testável com dados sintéticos (contagens), sem depender de
uma conta GHL real — `__tests__/integration/ghl-mapping-vigilancia.test.ts`
prova o comportamento completo semeando linhas de `ghl_discovery_runs`
diretamente.

## 3. Peças novas

### 3.1 Banco
- **Tabela `ghl_mapping_change_alerts`** — um alerta por `(workspace_id,
  source)` quando a contagem muda entre os 2 discovery runs mais recentes.
  Guarda `previous_count`/`current_count`/`delta` (coluna gerada),
  `acknowledged_at`/`acknowledged_by` (o admin marca como revisado). RLS:
  owner/admin do workspace lê e atualiza (só o próprio); `service_role` tem
  acesso total; `anon` sem acesso.
- **Função `detect_ghl_mapping_changes(p_workspace_id uuid)`** — compara os 2
  runs mais recentes com `status='success'` de cada `source`
  (`contact_custom_fields`, `opportunity_custom_fields`, `pipelines`) e grava
  um alerta se a contagem mudou. **Idempotente**: não duplica alerta para o
  mesmo par exato de runs (mesmo rodando de novo sobre os mesmos dados). Não
  gera alerta na primeira verificação de um source (sem "anterior" para
  comparar) nem quando a contagem não muda.
- **Função `ghl_mapping_discovery_watch_job()`** (dispatch) — para cada
  workspace com `ghl_integration_settings.is_active = true`, chama
  `discover-ghl-config` via `net.http_post` com `Authorization: Bearer
  <service_role_key>` e `include_payload: false`.
- **Função `ghl_mapping_detect_changes_job()`** (reconciliação) — roda
  `detect_ghl_mapping_changes` para cada workspace com credencial ativa.
- **2 crons**: `ghl-mapping-discovery-watch` às 04:00 UTC (dispatch) e
  `ghl-mapping-detect-changes` às 04:30 UTC (reconciliação, 30min depois —
  tempo suficiente para o dispatch, que é assíncrono via `pg_net`, terminar).

### 3.2 Edge function — `discover-ghl-config` agora aceita chamador `service_role`
A função original só aceitava JWT de um usuário owner/admin do workspace
(`auth.getUser(token)` + checagem de `workspace_members`). O cron não tem
usuário logado — foi adicionado um caminho dual, seguindo o padrão já
estabelecido no projeto (`isServiceRoleCaller`, o mesmo helper usado em todas
as edge functions de cron): se o chamador apresenta o `service_role_key`, pula
a checagem de membership (service_role já é confiado por definição) e segue
direto para resolver a credencial GHL do workspace informado no body. O
caminho manual (usuário autenticado pela UI) continua idêntico.

### 3.3 Frontend
- **`useGhlMappingAlerts()`** — lê `ghl_mapping_change_alerts` pendentes
  (`acknowledged_at IS NULL`) do workspace atual.
- **`useAcknowledgeGhlMappingAlerts()`** — marca alertas como revisados.
- **Banner em `WorkspaceGhlConfigPage`** — aparece assim que a página carrega
  (sem precisar clicar em nada) quando há alerta pendente: lista os
  `source`s afetados com a variação de contagem, e dois botões — "Revisar
  mapeamento" (leva para a aba de mapeamento avançado, onde o admin roda um
  discovery manual e vê o diff item-a-item de sempre) e "Já revisei,
  dispensar" (marca os alertas como reconhecidos sem precisar remapear, para
  o caso de a mudança ser irrelevante).

## 4. O que ainda não faz (limite honesto do escopo)

- O alerta não diz **quais** campos mudaram, só a contagem — a granularidade
  fina fica para quando o admin abre o wizard. Para a maioria dos casos
  ("apareceu 1 campo novo") isso já é suficiente para saber que precisa olhar;
  para mudanças mais complexas (ex: 2 campos trocados de nome ao mesmo tempo,
  contagem líquida igual a zero), o alerta de contagem não dispara — limitação
  conhecida, documentada aqui em vez de escondida.
- Não há notificação por e-mail/push — o alerta só aparece dentro do
  dashboard, na página de configuração GHL. Se o dono quiser alerta por
  e-mail, é extensão futura (reaproveitando a infraestrutura de
  `send-weekly-report-email`/Resend já existente).
- O cron roda uma vez por dia (04:00 UTC) — não é tempo real. Suficiente para
  o caso de uso (campo customizado do GHL não muda a cada minuto), mas é uma
  escolha de frequência, não um limite técnico.

## 5. Como aplicar em produção — histórico (já feito, ver §6)

```bash
supabase link --project-ref qzesffnkqgelmtfblzkr
supabase db push   # aplica a migration 20260819000000 (cria tabela/funções/crons)
supabase functions deploy discover-ghl-config --project-ref qzesffnkqgelmtfblzkr
```

Este era o plano de aplicação original, escrito quando a feature só existia no
banco de teste. Ele já foi executado — provavelmente junto com um dos lotes de
promoção de migrations descritos em `docs/MANIFESTO-RELEASE-MULTI-TENANT.md` —
sem que este documento fosse atualizado depois. Ver §6 para a confirmação.

## 6. Confirmação de que está rodando (verificado em 2026-07-21)

Consulta direta em produção via API de Management do Supabase:

- `supabase migration list --linked` mostra `20260819000000` com Local = Remote
  (migration aplicada).
- `cron.job` tem os 2 crons ativos: `ghl-mapping-discovery-watch` (jobid 90,
  `0 4 * * *`) e `ghl-mapping-detect-changes` (jobid 91, `30 4 * * *`).
- `cron.job_run_details` mostra as duas execuções **succeeded** todos os dias
  desde pelo menos 2026-07-17 até 2026-07-21 (a data mais antiga verificada),
  sem falha registrada.
- `ghl_discovery_runs` tem registros reais de `contact_custom_fields`,
  `opportunity_custom_fields`, `pipelines`, `tags`, `calendars`, `users`
  gravados pelo cron às 04:00 UTC — confirmando que `discover-ghl-config`
  aceita o chamador `service_role` em produção, não só em teste. (O source
  `field_folders` falha com `status='error'` consistentemente — endpoint do
  GHL não coberto por este discovery; não afeta os 3 sources que a vigilância
  monitora.)
- `ghl_mapping_change_alerts` tem **0 linhas** até agora — não é um sinal de
  bug, é o resultado esperado quando a contagem de campos/pipelines não mudou
  entre verificações consecutivas.
- No frontend, `eb-dash2/src/hooks/useGhlMappingAlerts.ts` e o banner
  `GhlMappingAlertsBanner` (em `WorkspaceGhlConfigPage.tsx`) já existiam e
  já estavam corretamente wireados — nada precisou ser criado nesta sessão
  para esta parte.

**Conclusão:** a vigilância de mudança de campos GHL está 100% operacional
desde antes desta sessão. O único problema real era este documento (e a linha
correspondente em `CLAUDE.md`) dizerem o contrário — corrigido em 2026-07-21.
