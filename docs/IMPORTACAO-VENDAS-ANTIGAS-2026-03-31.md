# Importacao Manual — Vendas Antigas (2026-03-31)

> Status: concluido em 2026-03-31 09:54 BRT
> Fonte: `vendas antigas/VENDAS-FALTANTES-UTM-COMPLETO - VENDAS-FALTANTES-UTM-COMPLETO.csv`

## Objetivo

Inserir manualmente no banco os leads/vendas historicos que ficaram fora do CRM, garantindo que aparecam corretamente nos paineis que dependem de:

- `oportunidades.data_lead_recebido`
- `oportunidades.pipeline_id`
- `oportunidades.pipeline_name`
- `vendas_fechamento.data_pagamento_entrada`
- `contatos.utm_source`
- `contatos.utm_campaign`

## Regras desta carga

- Pipeline fixo: `Vendas SQL` (`ZWuCjEXM2VDyLCx8CtGU`)
- Stage operacional: `17b7de75-9d2f-441c-a4f7-b119d439b47f`
  - escolhido automaticamente a partir da base viva como stage dominante das vendas assinadas do proprio pipeline
- `DATA_PG_ENTRADA`:
  - `vendas_fechamento.data_pagamento_entrada`
  - `vendas_fechamento.data_da_assinatura_do_contrato`
  - `oportunidades.data_fechado`
- `DATA_OPORTUNIDADE_GHL`:
  - `oportunidades.data_lead_recebido`
- Fallback de entrada do lead:
  - quando `DATA_OPORTUNIDADE_GHL` estiver vazia, usar `DATA_PG_ENTRADA`

## Tabelas populadas

### `contatos`

Campos minimos desta carga:

- `ghl_id`
- `nome`
- `email`
- `telefone`
- `date_created`
- `utm_source`
- `utm_campaign`
- `owner_name`
- `closer_name`

Observacao:
- como o CSV nao traz `contact_id` canonico do GHL, todos os contatos usam `ghl_id` sintetico estavel com prefixo `manual-legacy-contact-`

### `oportunidades`

Campos minimos desta carga:

- `ghl_opportunity_id`
- `contato_id`
- `nome_contato`
- `email_contato`
- `titulo`
- `valor`
- `status = 'won'`
- `pipeline_id`
- `pipeline_name`
- `pipeline_stage_id`
- `opportunity_source = 'importacao_manual_vendas_antigas_2026_03_31'`
- `vendedor_closer`
- `data_lead_recebido`
- `data_fechado`
- `openclaw_notificado_em`

Observacoes:
- quando existir `GHL_ID` no CSV, ele vira `ghl_opportunity_id`
- quando nao existir, a carga gera um ID sintetico estavel com prefixo `manual-legacy-opp-`
- `openclaw_notificado_em` e preenchido preventivamente para evitar reenvio indevido do OpenClaw em contratos historicos

### `vendas_fechamento`

Campos minimos desta carga:

- `oportunidade_id`
- `contato_id`
- `nome_contratante`
- `cpf_cnpj_contratante`
- `produto_vendido`
- `forma_pagamento`
- `valor_entrada`
- `numero_parcelas`
- `valor_parcela`
- `data_pagamento_entrada`
- `data_da_assinatura_do_contrato`
- `op_link_do_contrato_assinado`

Observacao:
- `valor_faturado` nao e gravado manualmente porque a coluna e calculada automaticamente pelo proprio banco

## Idempotencia

A carga usa UPSERT em todas as tabelas:

- `contatos` por `ghl_id`
- `oportunidades` por `ghl_opportunity_id`
- `vendas_fechamento` por `oportunidade_id`

Isso permite reexecucao sem duplicar registros.

## Script operacional

Arquivo:

- `scripts/import-vendas-antigas.js`

Modos:

- dry-run: `node scripts/import-vendas-antigas.js`
- aplicacao real: `node scripts/import-vendas-antigas.js --apply`

## Resultado real da execucao

- 40 contatos upsertados
- 40 oportunidades validadas
- 40 vendas em `vendas_fechamento`
- 8 oportunidades com ID sintetico estavel
- 14 oportunidades com fallback de `data_lead_recebido` a partir de `DATA_PG_ENTRADA`
- 0 oportunidades com `pipeline_id` ou `pipeline_name` nulos
- 0 oportunidades com `data_lead_recebido` nula
- 40 oportunidades protegidas contra reenvio do OpenClaw via `openclaw_notificado_em`
- soma validada em `vendas_fechamento.valor_faturado`: `1605880.06`
- soma validada em `vendas_fechamento.valor_entrada`: `583403.56`

## Validacoes obrigatorias

- total de linhas do CSV importadas
- total de oportunidades validadas no banco
- total de vendas validadas no banco
- `pipeline_id` e `pipeline_name` preenchidos
- `data_lead_recebido` preenchida inclusive nos casos de fallback
- `data_pagamento_entrada` preenchida em `vendas_fechamento`

## Riscos controlados

- OpenClaw: bloqueado via `openclaw_notificado_em`
- IDs ausentes: resolvidos com identificadores sinteticos estaveis
- UTMs: conferidas contra o catalogo vivo antes da carga
