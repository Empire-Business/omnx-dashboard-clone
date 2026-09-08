# Campos extras GHL — reconciliação de campos sem correspondência

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Implementado, validado no banco de teste (`fgjbmdsucruvtpywyhhf`) e **aplicado em produção em 2026-07-14** (`qzesffnkqgelmtfblzkr`), junto com `20260821000000` — ver seção "Dependência com o bug fix de data_conectado" e [`docs/BUG-FIX-LEADS-CONECTADOS.md`](BUG-FIX-LEADS-CONECTADOS.md). |
| **Origem** | Pergunta do dono durante o burn-in (2026-07-14): "como fica se um campo mapeado pelo usuário tiver um significado totalmente diferente de tudo que já existe no sistema?" |
| **Migration** | `supabase/migrations/20260827000000_add_ghl_extra_fields_extraction.sql` |
| **Decisão do dono** | Por ora, campo extra é **só exibição passiva** no LeadCard. Nunca entra em métrica, funil ou cálculo — "adicionar funções pra eles é arriscado". |

---

## 1. O problema

O Empire só sabe interpretar um vocabulário fixo de `logical_name` (o template "Empire Default" e qualquer customização por workspace). Quando um cliente tem um campo customizado no GHL que não corresponde a nada desse vocabulário, antes desta feature só existiam duas saídas ruins:

- **"Não mapeado"** — o dado nunca sai do GHL, o Empire nem sabe que ele existe.
- **Forçar num `logical_name` existente que não é bem aquilo** — corrompe silenciosamente as métricas de quem usa esse campo de verdade.

## 2. Causa raiz técnica (por que era assim)

Investigação real do código (não suposição) mostrou que o gargalo **não** era onde parecia:

- `apply_ghl_field_mappings()` (`supabase/migrations/20260708000001_create_ghl_field_mapping_helpers.sql`) já é **100% data-driven** — itera `ghl_field_mappings` e aceita **qualquer** `logical_name`, sem lista fixa, montando um JSONB genérico `{logical_name: valor}`.
- O gargalo real estava em `extrair_dados_ghl_v2()` — ela extraía uma **lista fixa** de `mapped->>'chave_conhecida'` para colunas fixas de `contatos`/`oportunidades`. Qualquer `logical_name` fora dessa lista ficava presente no JSONB `mapped` mas era **descartado em silêncio** — o mapeamento "funcionava" (a IA/wizard salvava a linha em `ghl_field_mappings`), mas o dado nunca chegava a lugar nenhum.
- `contatos.custom_fields jsonb` já existia desde a Fase 6 (`20260710000000_baseline_contatos_oportunidades.sql`) — schema pronto, **nunca escrito por nenhum fluxo**. `oportunidades` não tem coluna equivalente (fora de escopo desta v1, ver seção 6).
- Nenhum tipo TypeScript nem constraint SQL trava `logical_name` numa lista fechada — a única restrição era de UI (dropdown fechado no wizard) e de prompt (a IA é instruída a escolher "APENAS" da lista do template).

## 3. Solução: prefixo reservado `extra.`

- `eb-dash2/src/lib/ghl-mapping.ts`: `EXTRA_FIELD_LOGICAL_NAME_PREFIX = 'extra.'`, `buildExtraFieldLogicalName({source, key})` gera `extra.<source>_<slug>` (ex.: `extra.contact_signo`), `isExtraFieldLogicalName()` para checagens de UI.
- Nenhuma lógica de negócio existente lê esse prefixo — é puramente um namespace dentro do mesmo campo `logical_name` (texto livre, sem CHECK/enum).
- **Wizard manual** (`SuggestedFieldsStep.tsx`): novo item no dropdown, "+ Guardar como campo extra (só exibição, não entra em métricas)". Ao escolher, grava `logical_name = extra.<source>_<slug>` em vez de forçar um `logical_name` do template. Badge distinto ("Extra", ícone `Archive`) para diferenciar de um mapeamento real ("OK").
- **Assistente IA**: **não foi alterado nesta v1** — continua restrito ao vocabulário do template, com "Abrir modo avançado" como saída para o usuário mapear manualmente um campo extra. Extensão futura natural (seção 6).

## 4. Extração — `extrair_dados_ghl_v2` + `extract_ghl_extra_fields`

Nova função `extract_ghl_extra_fields(mapped jsonb) RETURNS jsonb` (`IMMUTABLE`, sem side effect): varre o JSONB `mapped` (já populado por `apply_ghl_field_mappings`), filtra chaves com prefixo `extra.` e devolve um novo objeto **sem** o prefixo — pronto para gravar direto em `custom_fields`.

`extrair_dados_ghl_v2` chama esse helper em dois pontos (PASSO 1 e PASSO 1b — INSERT e UPDATE de `contatos`), gravando o resultado em `contatos.custom_fields`. Comportamento:

- **Sobrescreve por completo a cada webhook** (não faz merge) — mesmo padrão já usado em todo o resto da função ("webhook é a fonte de verdade", regra 4 do `CLAUDE.md`). Um webhook do GHL manda o estado atual de todos os campos customizados, não um diff.
- Campos de **contato e de oportunidade** (`{{opportunity.xxx}}`) que forem marcados como "extra" acabam ambos em `contatos.custom_fields`, porque `mapped` é um único JSONB compartilhado pelos dois fluxos de extração dentro da mesma chamada. Isso é uma simplificação consciente de v1 — ver seção 6.
- Nenhuma métrica, funil, RPC de negócio ou dashboard lê essa coluna. É estritamente exibição.

## 5. Exibição — LeadCard

`eb-dash2/src/components/leads/LeadCard.tsx`, aba "Dados": nova seção condicional "Campos extras do GHL" (só aparece se `contato.custom_fields` tiver alguma chave), reaproveitando os componentes já existentes `SectionTitle`/`InfoRow` — sem componente novo. Cada chave vira um label legível (`_` → espaço).

`custom_fields` foi adicionado a:
- `OppRow['contatos']` (`eb-dash2/src/hooks/useTrafego.ts`) — tipo `Record<string, string> | null`.
- `CONTATOS_SELECT_DETAIL` (`eb-dash2/src/hooks/useLeads.ts`) — só na busca de detalhe (`fetchLeadWithVendas`), não na listagem (mesmo padrão dos outros "Extended fields — only fetched in detail view" já existentes).

## 6. Dependência com o bug fix de `data_conectado` (achado ao implementar)

`extrair_dados_ghl_v2` tinha **duas versões divergentes** quando esta feature começou a ser escrita:

- **Produção** rodava a versão de `20260708000003_create_extrair_dados_ghl_v2.sql`.
- **Banco de teste** já tinha a versão de `20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql` — o bug fix **CRÍTICO** documentado em `docs/BUG-FIX-LEADS-CONECTADOS.md` (321/2.251 oportunidades abertas afetadas), aplicado no teste mas **deliberadamente segurado fora de produção** ("exige release funcional próprio").

Como as duas mexem na mesma função, escrever `20260827000000` em cima da versão errada reverteria uma das duas (no teste ou em produção) sem intenção. **Decisão do dono (2026-07-14): promover as duas juntas.** `20260827000000` usa como base o corpo de `20260821000000` (já com o `COALESCE` de `data_conectado`), só acrescentando os dois pontos de `custom_fields`.

**Consequência prática:** em produção, `20260821000000` precisa ser aplicada **antes ou junto** de `20260827000000` — nunca esta sozinha sem aquela. O backfill cirúrgico de `20260821000000` (parte "c" daquela migration, recalcula `data_conectado` para oportunidades com o campo `NULL`) é um passo **separado**, que roda uma vez no momento da promoção — não foi reincluído em `20260827000000`.

## 7. Fora de escopo desta v1 (decisão consciente, não omissão)

- **Métricas/funil não leem `custom_fields`.** Se algum dia um campo extra precisar virar métrica de verdade, o caminho é promovê-lo para um `logical_name` real do template — não ensinar o painel a ler campos arbitrários.
- **`oportunidades` não tem `custom_fields` própria.** Campos extras de origem `opportunity` acabam em `contatos.custom_fields` mesmo assim (ver seção 4) — suficiente para o caso de uso "ver no LeadCard", mas não distingue de qual entidade GHL o campo veio.
- **Assistente IA não propõe "campo extra" automaticamente** — só o wizard manual. Extensão natural: instruir o prompt a sugerir `extra.<slug>` quando a confiança de match no template for baixa, em vez de simplesmente não sugerir nada.
- **Sem fila de revisão/promoção.** Não existe hoje uma tela "campos extras encontrados nos últimos 30 dias, promova algum a `logical_name` de verdade" — cogitado na conversa original, descartado por ora a pedido do dono.

## 8. Testes

`__tests__/integration/ghl-extra-fields.test.ts` (4 provas, contra banco real):
- `extract_ghl_extra_fields` isolada: extrai só chaves `extra.*`, remove o prefixo; `{}`/`null` → `{}`.
- Webhook com campo extra mapeado popula `contatos.custom_fields` (INSERT) **e** o mapeamento normal (`full_name`) continua indo pra coluna fixa — sem regressão do fluxo existente.
- Segundo webhook atualiza `custom_fields` (não é write-once).

Suite de integração completa validada sem regressão (**475/475** após a migration, incluindo `data-conectado-mapping-spacing.test.ts` 4/4 intacto).

---

*Última atualização: 2026-07-14 BRT*
