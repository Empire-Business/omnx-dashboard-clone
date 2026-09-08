# Bug fix crítico: webhook com UTM vazia apagava a atribuição do lead

> **Atualizado em:** 2026-08-03 BRT
> **Severidade:** CRÍTICO (perda silenciosa de atribuição em todo o sistema)
> **Migration:** `20261012000000_preservar_atribuicao_utm_webhook_vazio.sql`
> **Status:** ✅ Correção aplicada em produção + backfill executado

---

## 1. Como o problema apareceu

Em 2026-08-03 o gestor de tráfego reportou, por WhatsApp, uma divergência grande
na campanha **Código da Audiência** (`CA_AGO26_CAPTACAO_LEAD_QUENTE` no Meta →
`utm_campaign = 58`, página `PG58`, pipeline `[fn] webinário`):

| Fonte | Leads (30/07 a 02/08) |
|---|---|
| Gerenciador de Anúncios (Meta) | **62** |
| Dash (tráfego pago, campanha 58) | **26** |

A suspeita natural era "leads não estão chegando na dash". **Não era isso.**
Os leads chegavam normalmente, entravam no pipeline correto e ficavam
disponíveis para a operação. O que se perdia era a **etiqueta de origem** —
e, sem origem, o lead some de todo relatório de tráfego.

---

## 2. Causa raiz

O GHL dispara webhooks de **atualização** do mesmo contato alguns minutos
depois da criação. Nesses webhooks de atualização, os campos `utm_*` chegam
como **string vazia**.

A função `extrair_dados_ghl()` grava a atribuição assim:

```sql
utm_source = COALESCE(
    NULLIF(TRIM(w.payload->>'utm_source'), ''),
    NULLIF(TRIM(w.payload->'lastAttributionSource'->>'utmSource'), '')
)
```

Não existe fallback para o valor **já gravado**. Logo: webhook sem UTM → `NULL`
→ a atribuição correta, que já estava no banco, é **apagada**.

### Prova (contato `E0aRiR1ss9TCUcX38GJm`, "Camila Marchi", 2026-08-03)

| Horário (UTC) | `utm_source` | `utm_campaign` | Efeito |
|---|---|---|---|
| 10:19:39 | `iads-25` | `58` | grava correto |
| 10:19:46 | `iads-25` | `58` | mantém correto |
| **10:29:43** | *(vazio)* | *(vazio)* | **apaga a origem** |

O `webhooks_ghl.payload` é imutável, então a evidência ficou toda preservada —
foi ela que permitiu tanto o diagnóstico quanto o backfill.

### Por que a regra estava assim

A regra 4 do `CLAUDE.md` diz, corretamente, que **o webhook é a fonte de
verdade** e que `COALESCE(c.utm_source, ...)` está errado porque impediria a
re-atribuição de um lead. A regra está certa; o que faltava era distinguir
"webhook trouxe uma origem nova" de "webhook não trouxe origem nenhuma".

A ordem correta é `COALESCE(valor_novo_não_vazio, valor_antigo)` — preserva a
re-atribuição **e** não apaga.

---

## 3. Impacto medido (janela 29/07 a 03/08)

| Origem apagada | Leads |
|---|---|
| `iads-25` — pago, Código da Audiência | **34** |
| `import-23` | 13 |
| `iorg-3` — orgânico | 12 |
| demais (`iorg-1`, `iorg-9`, `iads-28`…) | 6 |

Conferência da conta do gestor:

```
26 leads pagos visíveis + 34 com origem apagada = 60 leads pagos
Meta reportou 62 no mesmo período → diferença residual normal
(janela de atribuição do Meta e deduplicação de contato).
```

O bug **não era exclusivo dessa campanha** — atingia toda a atribuição do
sistema, pago e orgânico, desde que essa versão da função entrou em operação.

---

## 4. Correção aplicada

### Por que um trigger e não a edição da função

`extrair_dados_ghl()` tem ~30 KB em produção e **já divergiu do arquivo
versionado** (drift entre banco e repositório). Reescrever a função inteira
para corrigir 5 atribuições colocaria em risco todo o caminho de ingestão do
sistema.

O guard escolhido é:

- **aditivo** — não toca em nenhuma função existente;
- **abrangente** — cobre qualquer caminho de escrita (função de extração, cron,
  edge function, backfill manual);
- **reversível** — some com um `DROP TRIGGER`.

### O que foi criado

`public.preservar_atribuicao_contato()` + trigger `BEFORE UPDATE` em `contatos`:

| Situação | Comportamento |
|---|---|
| Webhook traz valor preenchido | **Grava** (re-atribuição continua funcionando) |
| Webhook traz vazio/NULL e já existe valor | **Preserva** o valor existente |
| Webhook traz vazio/NULL e não existe valor | Continua `NULL` |

Colunas protegidas: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`,
`utm_content`, `utm_keyword`, `utm_matchtype`, `tt_source`, `tt_medium`,
`tt_campaign`, `tt_term`, `tt_content`, `ad_id`, `ad_name`, `ad_group_id`,
`fbclid`, `gclid`, `gbraid`, `wbraid`, `referrer`, `url`.

### Validação do guard (executada em produção)

Teste com contato real, nos dois sentidos:

1. `UPDATE contatos SET utm_source = ''` → valor **preservado** ✅
2. `UPDATE contatos SET utm_source = 'TESTE-REATRIBUICAO'` → valor **sobrescrito** ✅
3. Valor original restaurado ao fim do teste ✅

---

## 5. Backfill

Recuperação da origem a partir de `webhooks_ghl` (último webhook do contato que
trouxe `utm_source` não-vazio), aplicada aos contatos com `utm_source IS NULL`.

O backfill roda **depois** do guard estar ativo, então o resultado não corre o
risco de ser apagado pelo próximo webhook de atualização.

---

## 6. Reversão

```sql
DROP TRIGGER IF EXISTS trg_preservar_atribuicao_contato ON public.contatos;
```

O backfill não é revertido automaticamente (nem deve ser — ele restaura dados
que já eram verdadeiros e estão comprovados no payload imutável).

---

## 7. Lição aprendida

Vale para toda coluna alimentada por webhook de atualização:

> **"Sobrescrever sempre" e "aceitar vazio como valor" são coisas diferentes.**
> Um webhook parcial não pode apagar um dado que ele simplesmente não carrega.

Mesma classe de bug já documentada em
[`BUG-FIX-LEADS-CONECTADOS.md`](BUG-FIX-LEADS-CONECTADOS.md) (falta de
`COALESCE` no UPDATE) e na regra 5 do `CLAUDE.md` (`pipeline_id` que não pode
virar NULL). É um padrão recorrente neste sistema — ao adicionar campo novo
alimentado por webhook, verificar sempre o comportamento com payload parcial.

---

## Referências

- `supabase/migrations/20261012000000_preservar_atribuicao_utm_webhook_vazio.sql`
- [`docs/webhooks-ghl/REGRAS-EXTRACAO.md`](webhooks-ghl/REGRAS-EXTRACAO.md)
- [`docs/SYNC-CONTACT-ATTRIBUTION.md`](SYNC-CONTACT-ATTRIBUTION.md)
- [`docs/BUG-FIX-LEADS-CONECTADOS.md`](BUG-FIX-LEADS-CONECTADOS.md)
