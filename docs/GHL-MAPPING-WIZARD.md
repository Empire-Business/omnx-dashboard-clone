# Assistente de Mapeamento GHL — Modo Avançado

> **Versão:** 1.1
> **Última atualização:** 2026-07-14 15:22 BRT
> **Público:** Admins técnicos do workspace
> **Local:** `eb-dash2/src/components/ghl-mapping/` + `eb-dash2/src/pages/workspace/WorkspaceGhlConfigPage.tsx`

---

## O que é

O **Wizard de Mapeamento GHL** é a experiência técnica disponível na aba **Mapeamento avançado** da página `/workspace/ghl-config`. Ele guia o admin a mapear manualmente:

1. **Campos obrigatórios** do template Empire Default.
2. **Sugestões automáticas** de campos opcionais (por similaridade de nome/chave).
3. **Pipelines e stages** do GHL para as categorias/stages canônicos do Empire.
4. **Revisão final** antes de salvar.

> Para usuários leigos, prefira a aba **Assistente IA**, que permite descrever a estrutura do GHL em português e receber uma proposta automática. Ver [`docs/GHL-MAPPING-ASSISTENTE-IA.md`](GHL-MAPPING-ASSISTENTE-IA.md).

## Linguagem e uso seguro

O modo avançado continua disponível para ajustes manuais, mas não exige que a
pessoa saiba os nomes internos do sistema. A tela mostra nomes compreensíveis,
como **Nome completo** e **Data da reunião agendada**, em vez de chaves como
`full_name` e `data_reuniao_agendada`.

- A escolha principal usa o texto **"Usar este campo como"**.
- Códigos do GHL ficam escondidos em **"Ver código técnico"** e servem apenas
  para suporte e diagnóstico.
- Os menus de seleção podem ultrapassar o card do wizard, para nunca serem
  cortados sobre o próximo campo ou pelos controles de navegação.
- Se houver dúvida, o caminho recomendado continua sendo **Assistente IA**;
  o modo avançado é para revisar um detalhe específico.

Ele também detecta **mudanças ao longo do tempo**: campos, pipelines ou stages novos/removidos desde o último mapeamento.

---

## Fluxo do usuário

```
Configuração GHL
  └── Preferir "Assistente IA" para descrever a operação em português
        └── Usar "Mapeamento avançado" apenas para ajuste manual
              ├── 1. Campos obrigatórios
              ├── 2. Sugestões automáticas
              ├── 3. Pipelines e stages
              └── 4. Revisão e salvamento
```

### Pré-requisitos

- `GHL_API_KEY` configurada como secret das edge functions do Supabase.
- `ghl_location_id` salvo em `ghl_integration_settings`.

---

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `GhlMappingWizard.tsx` | Orquestra os steps, estados e salvamento. |
| `RequiredFieldsStep.tsx` | Lista campos do template marcados como `is_required` e seus matches no discovery. |
| `SuggestedFieldsStep.tsx` | Mostra matches automáticos para campos descobertos; permite aceitar, ignorar ou escolher outro. |
| `PipelineStageStep.tsx` | Classifica pipelines em categorias (`pre_vendas`, `vendas`, `recuperacao`, `excluir`) e stages em stages canônicos. |
| `MappingReviewStep.tsx` | Resumo executivo do que será salvo e status de completude. |
| `src/lib/ghl-mapping.ts` | Utilitários: normalização, score de similaridade, inferência, status e detecção de mudanças. |

---

## Como a inferência funciona

### Campos

A função `inferLogicalName` compara o nome e a chave do campo descoberto com todos os `logical_name` do template usando `similarityScore`:

- Score ≥ 0.6 → sugestão automática.
- Campos já mapeados em `ghl_field_mappings` têm prioridade (score 1).

### Pipelines

`inferPipelineCategory` normaliza o nome do pipeline e busca padrões como `venda`, `prevenda`, `recuperacao`, `lixo`.

### Stages

`inferSystemStage` normaliza o nome do stage e busca padrões como `novo`, `conectado`, `agendado`, `reuniao_realizada`, `fechado`, `perdido`.

---

## Detecção de mudanças ao longo do tempo

A função `computeMappingChanges` compara o resultado do discovery com os mapeamentos salvos:

- **Campos novos**: descobertos, mas ainda não em `ghl_field_mappings`.
- **Campos removidos**: em `ghl_field_mappings`, mas não mais descobertos.
- **Pipelines novos/removidos**: mesma lógica para `ghl_pipeline_mappings`.
- **Stages novos/removidos**: mesma lógica para `ghl_stage_mappings`.

Quando há mudanças, um banner amarelo aparece no topo do wizard listando o que mudou.

---

## Salvamento

Ao clicar em "Salvar mapeamentos" no step de revisão, o wizard chama três hooks:

- `useSaveGhlFieldMappings`
- `useSaveGhlPipelineMappings`
- `useSaveGhlStageMappings`

Cada um envia um array de mappings para as respectivas tabelas. Apenas itens com valor preenchido são enviados.

### Formato do payload de campos

```ts
{
  logical_name: string
  ghl_field_key: string
  ghl_field_id: string
  field_type: 'contact_field' | 'opportunity_field'
  variations: [ghl_field_key]
}
```

### Formato do payload de pipelines

```ts
{
  ghl_pipeline_id: string
  ghl_pipeline_name: string
  system_category: GhlPipelineCategory
}
```

### Formato do payload de stages

```ts
{
  ghl_pipeline_id: string
  ghl_stage_id: string
  ghl_stage_name: string
  system_stage: GhlSystemStage
}
```

---

## Edge cases

| Cenário | Comportamento |
|---|---|
| Discovery retorna zero campos | Wizard mostra steps vazios; revisão indica status incompleto. |
| Campo obrigatório não encontrado | `RequiredFieldsStep` mostra badge "Pendente" e Select desabilitado. |
| Usuário já tem mapeamentos | Valores iniciais vêm dos mapeamentos existentes; sugestões só preenchem o que está vazio. |
| Campos foram alterados no GHL | Banner de mudanças detectadas é exibido; usuário pode re-mapear. |
| Template tem `ghl_field_key` nulo | Ignorado nos cálculos de status para evitar falsos incompletos. |

---

## Testes

- `tests/ghl-config-security.spec.ts`: valida que a API Key não é exposta na UI.
- `tests/ghl-mapping-wizard.spec.ts`: valida o empty state inicial e a renderização do wizard após discovery.
- `src/lib/ghl-mapping.test.ts`: trava a conversão de chaves internas em rótulos compreensíveis para a interface.

Para rodar:

```bash
cd eb-dash2
npx playwright test tests/ghl-mapping-wizard.spec.ts --reporter=line
```

---

## Próximas melhorias sugeridas

1. **Importação/exportação de mapeamentos**: permitir copiar mapeamentos de outro workspace.
2. **Auditoria de diffs**: mostrar lado a lado o que mudou entre duas discoveries.
3. **Sincronização automática**: job periódico que detecta mudanças e notifica o admin.
4. **Mapeamento de múltiplos locations**: hoje o wizard usa o location configurado nas settings.

---

*Última atualização: 2026-07-14 15:22 BRT*
