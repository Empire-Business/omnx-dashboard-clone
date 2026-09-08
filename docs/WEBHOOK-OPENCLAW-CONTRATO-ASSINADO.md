# Webhook OpenClaw — Contrato Assinado

> **Status:** ❌ REMOVIDO em 2026-07-11 (decisão do dono — integração descontinuada)
> **Última atualização:** 2026-03-22 22:28 BRT (conteúdo abaixo é histórico)
> **Migration de remoção:** `supabase/migrations/20260824000000_remove_openclaw_integration.sql`
> **Ver:** [`docs/REMOCAO-OPENCLAW.md`](REMOCAO-OPENCLAW.md) para o que foi removido, o
> que foi preservado (dados de `vendas_fechamento` usados no LeadCard continuam
> intactos) e o estado em produção.
>
> O conteúdo abaixo descreve o mecanismo como ele existia antes da remoção — mantido
> como registro histórico, não reflete mais o sistema atual.

---

## O que faz

Quando um contrato é assinado no GHL, o sistema envia um POST automático ao OpenClaw com os dados financeiros e contratuais do cliente.

O envio agora cobre as duas ordens reais do processo:

1. O closer preenche o link primeiro e depois arrasta o card para `Assinada`
2. O closer arrasta para `Assinada` primeiro e o link chega depois

---

## Condição de Disparo — Idempotência Garantida

O sistema envia **UMA VEZ por oportunidade confirmada**, usando `oportunidades.openclaw_notificado_em` como trava de idempotência.

Desde `20260324030000`, `openclaw_notificado_em` deixou de significar "request enfileirado" e passou a significar **"OpenClaw respondeu com sucesso (2xx)"**.

| Situação | Envia? |
|---|---|
| Card entra em `Assinada` e o link já existe no webhook atual, em `vendas_fechamento` ou em webhook anterior | ✅ **SIM** |
| Oportunidade já está em `Assinada` e o link entra em `vendas_fechamento` depois | ✅ **SIM** |
| Card entra em `Assinada` mas ainda não existe link em lugar nenhum | ❌ NÃO |
| Request já está pendente no `pg_net` e ainda dentro da janela de espera | ⏳ AGUARDA |
| OpenClaw/pg_net falhou ou expirou | 🔁 RETRY AUTOMÁTICO |
| Oportunidade já foi confirmada antes pelo OpenClaw | ❌ NÃO |

### Backfill Histórico

Em `20260324020000`, oportunidades que **já estavam assinadas antes da trava de idempotência existir** passaram a receber `openclaw_notificado_em` por backfill.

Critério usado no backfill:
- tem `op_link_do_contrato_assinado`
- e está em `Assinada` no pipeline `Vendas SQL`
- ou já tem `data_da_assinatura_do_contrato`

Isso evita reenvio quando alguém edita uma oportunidade antiga que já tinha sido assinada.

### Entrega Confirmada e Retry Automático

Em `20260324030000`, o fluxo passou a guardar estado operacional em `oportunidades`:

- `openclaw_request_id` — request atual do `pg_net`
- `openclaw_enfileirado_em` — quando entrou na fila
- `openclaw_ultima_resposta_em` — quando a resposta foi observada
- `openclaw_ultimo_status_code` — último status HTTP
- `openclaw_ultimo_erro` — último erro/corpo resumido de falha

O sistema agora funciona assim:

1. trigger enfileira o POST e grava `openclaw_request_id`
2. `openclaw_notificado_em` continua `NULL` nesse momento
3. job SQL `openclaw-contrato-assinado-retry` roda a cada minuto
4. se o OpenClaw responder `2xx`, o job preenche `openclaw_notificado_em`
5. se houver erro/timeout, o job limpa o request pendente e reenfileira com segurança

### Timeout do OpenClaw

Na validacao real de `2026-03-22 22:25 BRT`, o lead fake `testewfgdfb@teste.xxocom` falhou com timeout padrao de `5000 ms` do `pg_net`.

Em `20260324031000`, o helper passou a usar:

```sql
timeout_milliseconds := 30000
```

Resultado do reteste real no mesmo lead fake:
- `request_id = 19180`
- `status_code = 200`
- `openclaw_notificado_em = 2026-03-23 01:26:00.950828+00`
- resposta do endpoint: `{"ok":true,...}`

---

## Destino

```
POST https://openclaw-tjm2.srv1482547.hstgr.cloud/hooks/contrato-assinado
Content-Type: application/json
x-openclaw-token: hooks_YH3NtL1B1sa8o1KCJVXv2SOTLX8NCuWM
```

## Formato de Datas

Todas as datas são enviadas no **fuso América/São Paulo (BRT, UTC-3)**, conforme padrão do sistema (`docs/PADRAO-TIMEZONE.md`):

| Campo | Tipo no banco | Formato enviado | Exemplo |
|---|---|---|---|
| `timestamp` | `NOW()` (TIMESTAMPTZ) | `DD/MM/AAAA HH:MM` | `23/03/2026 17:15` |
| `data_pagamento_entrada` | `TIMESTAMPTZ` | `DD/MM/AAAA` | `06/03/2026` |
| `data_assinatura_contrato` | `DATE` | `DD/MM/AAAA` | `23/03/2026` |

**SQL usado no trigger:**
```sql
TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
TO_CHAR(NEW.data_pagamento_entrada AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
-- data_assinatura_contrato é DATE (sem hora/fuso) — TO_CHAR direto, sem AT TIME ZONE:
TO_CHAR(NEW.data_da_assinatura_do_contrato, 'DD/MM/YYYY')
```

---

## Mecanismo Técnico

- **Helper central:** `processar_notificacao_openclaw_contrato_assinado()`
- **Trigger 1:** `tr_notify_openclaw_contrato_assinado` — AFTER INSERT OR UPDATE em `vendas_fechamento`
- **Função 1:** `notify_openclaw_contrato_assinado()` — só envia se o link entrou e a oportunidade já está em `Assinada`
- **Trigger 2:** `tr_zz_notify_openclaw_assinada` — AFTER INSERT em `webhooks_ghl`
- **Função 2:** `notify_openclaw_contrato_assinado_por_stage()` — ao receber stage `Assinada`, procura o link no webhook atual ou no histórico
- **HTTP:** `pg_net` via `net.http_post()` — chamada **assíncrona**, não bloqueia a transação
- **Timeout HTTP:** `30000 ms` desde `20260324031000`
- **Sync de resposta:** `sincronizar_status_openclaw_contrato_assinado()` — confirma `2xx`, libera falhas e expira pendências antigas
- **Retry automático:** `reenfileirar_openclaw_contrato_assinado_pendentes()` — reenfileira contratos assinados ainda sem confirmação
- **Cron SQL:** `openclaw-contrato-assinado-retry` — roda `* * * * *`
- **Diagnóstico público:** `listar_openclaw_respostas_recentes()` — consulta status do OpenClaw por oportunidade
- **Erro handling:** exceptions capturadas com `RAISE WARNING` — erro na notificação nunca cancela o webhook nem a venda

---

## Payload Enviado

### Estrutura

```json
{
  "evento": "contrato_assinado",
  "timestamp": "<ISO 8601 UTC>",

  "nome": "<nome do contato no GHL>",
  "email": "<email>",
  "telefone": "<telefone>",
  "ghl_opportunity_id": "<id da oportunidade>",
  "pipeline": "<nome do pipeline>",

  "nome_contratante": "<nome no contrato>",
  "cpf_cnpj_contratante": "<CPF ou CNPJ>",

  "logradouro": "<rua/avenida>",
  "numero_endereco": "<número>",
  "complemento": "<complemento>",
  "bairro": "<bairro>",
  "municipio": "<cidade>",
  "estado_uf": "<UF>",
  "cep": "<CEP>",

  "valor_faturado": <número>,
  "valor_entrada": <número>,
  "numero_parcelas": <inteiro>,
  "valor_parcela": <número>,
  "forma_pagamento": "<texto>",
  "produto_vendido": "<texto>",
  "data_pagamento_entrada": "<ISO 8601>",

  "link_contrato_assinado": "<URL>",
  "data_assinatura_contrato": "<DD/MM/AAAA ou null>",
  "vencimentos_parcelas": "<texto ou null>",
  "observacoes": "<texto ou null>"
}
```

### Exemplo Real (baseado em lead real do sistema)

```json
{
  "evento": "contrato_assinado",
  "timestamp": "23/03/2026 17:15",

  "nome": "DANIEL TIAGO RIBEIRO DOS SANTOS",
  "email": "danieltiago107@gmail.com",
  "telefone": "+5531992783904",
  "ghl_opportunity_id": "ezFeX5Cs2pVHqIFfX6eN",
  "pipeline": "Vendas SQL",

  "nome_contratante": "DANIEL TIAGO RIBEIRO DOS SANTOS",
  "cpf_cnpj_contratante": "8693799681",

  "logradouro": "RUA ibirati",
  "numero_endereco": "473",
  "complemento": "apto 502",
  "bairro": "Renascenca",
  "municipio": "belo horizonte",
  "estado_uf": "MG",
  "cep": "31130660",

  "valor_faturado": 33333.40,
  "valor_entrada": 3333.34,
  "numero_parcelas": 9,
  "valor_parcela": 3333.34,
  "forma_pagamento": "Parcelado (Somente parcelamento no boleto)",
  "produto_vendido": "Acelerador Gold",
  "data_pagamento_entrada": "06/03/2026",

  "link_contrato_assinado": "https://openclaw-tjm2.srv1482547.hstgr.cloud/contratos/xyz123.pdf",
  "data_assinatura_contrato": "23/03/2026",
  "vencimentos_parcelas": "1ª: 10/04/2026 - R$ 3.333,34 | 2ª: 10/05/2026 - R$ 3.333,34 | ...",
  "observacoes": "Nome completo: DANIEL TIAGO RIBEIRO DOS SANTOS\nNascimento: 15/02/1992\nCPF: 08693799681\nEndereço completo:RUA ibirati 473, apto 502 Renascenca, belo horizonte, cep31130660"
}
```

---

## Cálculo de `valor_faturado`

```
valor_faturado = valor_entrada + (numero_parcelas × valor_parcela)
Exemplo: 3.333,34 + (9 × 3.333,34) = R$ 33.333,40
```

---

## Fluxo Completo

```
Caso A: link antes do drag

GHL preenche o link
        ↓
vendas_fechamento guarda o link
        ↓
closer arrasta o card para "Assinada"
        ↓
webhooks_ghl recebe stage = Assinada
        ↓
tr_zz_notify_openclaw_assinada busca link atual/histórico
        ↓
helper central envia POST ao OpenClaw

Caso B: drag antes do link

closer arrasta o card para "Assinada"
        ↓
oportunidade fica marcada em Assinada
        ↓
link chega depois em vendas_fechamento
        ↓
tr_notify_openclaw_contrato_assinado detecta NULL → URL
        ↓
helper central envia POST ao OpenClaw
```

---

## Troubleshooting

**Webhook não chegou ao OpenClaw?**
```sql
SELECT *
FROM public.listar_openclaw_respostas_recentes(20);
```

**Verificar se trigger existe:**
```sql
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name IN (
  'tr_notify_openclaw_contrato_assinado',
  'tr_zz_notify_openclaw_assinada'
);
```

**Verificar idempotência:**
```sql
SELECT
  ghl_opportunity_id,
  pipeline_stage_id,
  openclaw_notificado_em,
  openclaw_request_id,
  openclaw_enfileirado_em,
  openclaw_ultima_resposta_em,
  openclaw_ultimo_status_code,
  openclaw_ultimo_erro
FROM oportunidades
WHERE ghl_opportunity_id = '<ghl_opp_id>';
```

**Forçar reenvio manualmente (em caso de falha):**
```sql
UPDATE oportunidades
SET openclaw_notificado_em = NULL,
    openclaw_request_id = NULL,
    openclaw_enfileirado_em = NULL,
    openclaw_ultima_resposta_em = NULL,
    openclaw_ultimo_status_code = NULL,
    openclaw_ultimo_erro = NULL
WHERE id = '<uuid>';

-- depois, repetir o evento:
-- 1) arrastar de novo para Assinada, OU
-- 2) reenviar o webhook/link manualmente
```
