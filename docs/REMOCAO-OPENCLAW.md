# Remoção da integração OpenClaw

| Campo | Valor |
|-------|-------|
| **Status** | Removido do banco de **TESTE** (`fgjbmdsucruvtpywyhhf`). **Produção (`qzesffnkqgelmtfblzkr`) não foi tocada** — aguarda autorização explícita do dono. |
| **Decisão** | Do dono, 2026-07-11: descontinuar por completo a integração com o OpenClaw. |
| **Migration** | `supabase/migrations/20260824000000_remove_openclaw_integration.sql` |
| **Branch** | `chore/remove-resend-openclaw-integrations` (não mergeada em `main`) |

---

## 1. O que era o OpenClaw

Quando um contrato era assinado no GHL, o sistema disparava automaticamente um POST
(via `pg_net`, dentro do próprio Postgres — sem edge function própria) para um webhook
externo do OpenClaw, notificando o link do contrato assinado e a data de assinatura.
Havia um cron (`openclaw-contrato-assinado-retry`, rodando a cada minuto) para
confirmar entregas e reenfileirar falhas. Documentação original (agora histórica):
[`docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md`](WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md).

## 2. O que foi removido

Todo o **mecanismo de disparo/retry**, especificamente:

**Funções PL/pgSQL:**
- `notify_openclaw_contrato_assinado()`
- `notify_openclaw_contrato_assinado_por_stage()`
- `processar_notificacao_openclaw_contrato_assinado(uuid, text, date)`
- `sincronizar_status_openclaw_contrato_assinado(integer)`
- `reenfileirar_openclaw_contrato_assinado_pendentes(integer)`
- `processar_openclaw_contrato_assinado_job()`
- `listar_openclaw_respostas_recentes(integer)`

**Triggers:**
- `tr_notify_openclaw_contrato_assinado` (em `vendas_fechamento`)
- `tr_zz_notify_openclaw_assinada` (em `webhooks_ghl`)

**Cron:**
- `openclaw-contrato-assinado-retry` (`* * * * *`)

**Colunas operacionais em `oportunidades`** (confirmado, sem nenhum uso de negócio fora
deste mecanismo — nem no frontend, nem em outras funções):
- `openclaw_notificado_em`, `openclaw_request_id`, `openclaw_enfileirado_em`,
  `openclaw_ultima_resposta_em`, `openclaw_ultimo_status_code`, `openclaw_ultimo_erro`

**Índice:**
- `idx_oportunidades_openclaw_pendentes`

**Dado de configuração:**
- Linha em `outbound_webhooks` com `event_key = 'contrato_assinado'` (a infraestrutura
  genérica da tabela permanece — ver seção 3). O segredo correspondente no Vault fica
  órfão (sem custo, sem risco — nenhuma linha mais o referencia).

Nenhuma migration histórica já aplicada foi editada ou apagada — a remoção é feita por
uma migration **nova** (`20260824000000_...`), que dá `DROP`/`cron.unschedule` sobre o
que as migrations antigas criaram. Isso preserva o histórico real de como o sistema
evoluiu (princípio já seguido no resto do projeto).

## 3. O que foi preservado (de propósito)

### 3.1 Dados de negócio em `vendas_fechamento`
`op_link_do_contrato_assinado`, `data_da_assinatura_do_contrato`,
`op_vencimentos_parcelas`, `observacoes_venda` e os campos financeiros/endereço
(`valor_entrada`, `numero_parcelas`, `valor_parcela`, `forma_pagamento`,
`produto_vendido`, `nome_contratante`, `cpf_cnpj_contratante` etc.) **continuam
existindo e em uso** — são consumidos por `LeadCard.tsx`, `useLeads.ts` e pelos
relatórios de faturamento, sem qualquer relação com o OpenClaw. Só o **disparo
automático** que lia esses campos para notificar o OpenClaw foi removido.

### 3.2 Infraestrutura genérica `outbound_webhooks`
A tabela `public.outbound_webhooks` (webhooks de saída por workspace, com segredo no
Vault), a função de guarda SSRF `assert_outbound_url_safe()` e o cadastro
`register_outbound_webhook()` **foram mantidos** — são infraestrutura multi-tenant
reutilizável para qualquer webhook de saída futuro, e têm teste dedicado
(`__tests__/integration/outbound-webhooks-isolation.test.ts`). Só a linha de dados do
OpenClaw foi apagada da tabela; ela mesma continua funcional e vazia.

### 3.3 Trigger genérico `extrair_vendas_fechamento_do_webhook`
Este trigger **não é específico do OpenClaw** — é o extrator geral de dados de venda a
partir de qualquer webhook do GHL. Sua condição de guarda foi ampliada em 2026-03-23
para não ignorar um webhook que só traz link+data (motivado pelo comportamento do
OpenClaw na época), mas essa guarda continua correta e útil para qualquer webhook
futuro nesse mesmo formato. **Não foi tocado.**

## 4. Estado em produção — ⚠️ AÇÃO PENDENTE DO DONO

A migration `20260824000000_remove_openclaw_integration.sql` foi **aplicada apenas no
banco de TESTE** (`fgjbmdsucruvtpywyhhf`), para validar que a remoção não quebra nada.
**Produção (`qzesffnkqgelmtfblzkr`) continua com o mecanismo antigo rodando** — cron
`openclaw-contrato-assinado-retry` a cada minuto, triggers ativos, colunas presentes.

Isso é intencional: esta sessão tinha instrução explícita de não tocar produção. Para
aplicar a remoção em produção, alguém precisa rodar (fora desta sessão, com autorização
do dono):

```bash
supabase link --project-ref qzesffnkqgelmtfblzkr
supabase db push
```

Enquanto isso não acontece, o cron de produção continua rodando (e falhando ao tentar
notificar o OpenClaw, já que o endpoint externo não resolve DNS — ver histórico de
diagnóstico na sessão de 2026-07-11). Isso é apenas ruído operacional, sem custo real:
a tabela `net._http_response` tem TTL automático de 6h (não cresce sem limite) e o
volume de dados por falha é pequeno (dezenas de KB/hora). Não há urgência técnica para
aplicar a migration em produção — é uma questão de decisão e momento do dono.

## 5. Testes e documentação ajustados

- `docs/CRONS-STATUS.md` — linha do cron removida da tabela, seção detalhada marcada
  como histórica (`<details>`).
- `docs/TABELAS-SISTEMA.md` — as 6 colunas `openclaw_*` de `oportunidades` removidas da
  documentação.
- `docs/WEBHOOK-OPENCLAW-CONTRATO-ASSINADO.md` — marcado como removido/histórico no
  cabeçalho, conteúdo preservado como registro.
- `docs/VENDAS-FECHAMENTO.md` — nota adicionada no topo; changelog histórico (seção 9)
  não foi reescrito.
- `docs/MAPA-DADOS-PESSOAIS-DPA.md` — OpenClaw removido da lista de terceiros que
  recebem dados pessoais (relevante para o jurídico).
- `CLAUDE.md` — seção "OpenClaw — cobrir as duas ordens do processo" marcada como
  removida; índice de documentos atualizado.
- `__tests__/integration/credential-isolation.test.ts` — o teste que valida
  `processar_notificacao_openclaw_contrato_assinado` (linha ~291) permanece: ele lê o
  conteúdo da migration histórica `20260727000000_fase7_outbound_webhooks.sql` (não
  editada), então continua passando como prova histórica de que aquele código, quando
  existia, tinha filtro de `workspace_id` e guarda SSRF. Não precisa de ajuste.
