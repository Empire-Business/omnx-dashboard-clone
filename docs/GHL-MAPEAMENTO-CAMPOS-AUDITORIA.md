# Auditoria do sistema de mapeamento de campos GHL (2026-07-12)

| Campo | Valor |
|-------|-------|
| **Motivação** | Dono apontou que cada sub-conta do GHL tem campos customizados diferentes — bloqueio real do multi-tenant, não melhoria de UX. Pedido: auditar o que já existe antes de redesenhar. |
| **Veredito** | **Não é enfeite — o núcleo funciona de verdade.** Incompleto em pontos específicos, não quebrado por inteiro. |

---

## Como cada peça foi avaliada

| Peça | Veredito |
|---|---|
| Schema (`ghl_field_mappings`, `ghl_pipeline_mappings`, `ghl_stage_mappings`, `ghl_field_mapping_templates`, `ghl_discovery_runs`) | ✅ Implementado de verdade, bate com a documentação |
| Discovery (`discover-ghl-config`) | ✅ Funciona de verdade, mas **só rodava sob clique manual** — sem agendamento (corrigido, ver `docs/GHL-MAPEAMENTO-VIGILANCIA.md`) |
| Assistente de mapeamento por IA (`ai-ghl-mapping`) | ✅ Conectado, mas frágil: parsing de JSON por regex sem retry, e bug onde `model_used` sempre reportava o modelo primário mesmo no fallback (corrigidos nesta sessão) |
| Wizard técnico / modo avançado | ✅ Implementado de verdade — componentes reais, lógica de inferência real |
| Detecção de mudanças (`computeMappingChanges`) | ⚠️ Implementada, mas só reativa a um discovery manual na mesma sessão — não é vigilância automática (corrigido, ver `docs/GHL-MAPEAMENTO-VIGILANCIA.md`) |
| Ligação com o extrator real (`extrair_dados_ghl_v2`) | ✅ **O ponto mais crítico da auditoria — passa no teste.** O trigger de produção chama `extrair_dados_ghl_v2`, que lê genuinamente `ghl_field_mappings` via `apply_ghl_field_mappings`/`resolve_ghl_field_value`. Não há nome de campo GHL hardcoded no caminho principal |

## Achados que motivaram correções nesta sessão

1. **Sem vigilância automática** — corrigido: `docs/GHL-MAPEAMENTO-VIGILANCIA.md` (2 crons diários + tabela de alertas + banner na UI).
2. **Assistente de IA frágil** (parsing sem retry, `model_used` mentiroso) — corrigido: `supabase/functions/_shared/ai-ghl-mapping-logic.ts` (módulo puro testável, retry com instrução reforçada, `model_used` reporta o modelo que realmente respondeu).
3. **Sem guia para leigo na primeira conexão** — corrigido: `WorkspaceIntegrationsPage.tsx` agora sugere "Mapear agora" com toast + navegação assim que o teste de conexão do GHL é confirmado pela primeira vez.
4. **`ghl_field_mapping_templates` vazia no banco de teste** — causa raiz e correção documentadas abaixo (seção "Divergência do template vazio").
5. **Fallback perigoso em `get_workspace_id_by_ghl_location_id`** — achado relacionado, mas de severidade maior, tratado à parte em `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`.

## Divergência do template vazio — causa raiz confirmada

A tabela `ghl_field_mapping_templates` estava com **0 linhas** no banco de teste,
apesar das migrations `20260707000000_create_ghl_mapping_foundation.sql` e
`20260708000000_update_empire_default_template_full.sql` conterem os `INSERT`
de seed do template "Empire Default" (63 campos, os nomes reais da conta GHL do
dono).

**Causa raiz:** `20260218000000_baseline_public_schema.sql` — um dump
consolidado de **estrutura** gerado numa data posterior às migrations acima,
apesar do nome — já contém `CREATE TABLE ghl_field_mapping_templates`. Quando o
banco de teste foi montado a partir desse baseline, a tabela já existia, então
as migrations de seed (que só têm `CREATE TABLE IF NOT EXISTS` + os `INSERT`s)
nunca chegaram a rodar de fato — aparecem como "não aplicadas" em `supabase
migration list`, e os `INSERT`s nunca executaram. O baseline capturou a
estrutura, não os dados. Mesma classe de problema já documentada em
`docs/BASELINE-REPRODUCIBILIDADE.md` para outras tabelas.

**Correção:** `supabase/migrations/20260820000000_reseed_empire_default_template.sql`
reaplica exatamente os mesmos `INSERT`s (conteúdo idêntico às migrations
originais, só copiados para uma migration nova — nunca se edita uma migration
já "aplicada" mesmo que os dados não tenham realmente entrado). Aplicada e
confirmada no banco de teste: **63 registros**, 2 obrigatórios
(`opportunity_id`, `pipeline_id_opp`). Teste de regressão:
`__tests__/integration/ghl-field-mapping-templates-seed.test.ts`.

Esse template — usando os nomes reais de campo já documentados em
`docs/Document_GHL.md` e `docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md` — **é** o
caso de referência real pedido pelo dono: mapear os próprios campos usando a
documentação que já existia no repositório.

## Risco lateral encontrado (fora do escopo desta frente, registrado para o futuro)

`get_workspace_id_by_ghl_location_id` tem histórico de um fallback perigoso
("workspace mais antigo" quando não há match de `location_id`) — já corrigido
no código (ver `docs/SEGURANCA-FALLBACK-WORKSPACE-LOCATION-ID.md`), mas achado
durante esta auditoria: nenhuma outra função crítica do fluxo de mapeamento
depende desse padrão de fallback silencioso.
