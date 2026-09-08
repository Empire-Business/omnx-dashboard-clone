# Integração omnx-desk → Empire — Spec para o desenvolvedor

> **Audiência:** programador do omnx-desk.
> **Objetivo:** toda venda fechada no omnx-desk deve aparecer automaticamente no
> dashboard Empire da conta (tenant) correta, com valor, data de entrada, parcelas
> e comprovantes — e **nunca** no painel de outra conta.
> **Atualizado em:** 2026-07-21 BRT

---

## 1. O que você vai construir

Dois fluxos HTTP (POST JSON), ambos autenticados por **secret por cliente**:

1. **Buscar lead** (opcional, mas recomendado): dado telefone e/ou e-mail do
   comprador, o Empire devolve os candidatos a contato/oportunidade — é daqui que
   sai o `oportunidade_id` necessário para registrar a venda.
2. **Registrar venda**: envia a venda fechada (pagamentos + dados do contratante +
   comprovantes). Idempotente: pode reenviar a mesma venda quantas vezes quiser.

Não há campo de "tenant" no payload: **o secret é a identidade da conta**. Cada
cliente (conta Empire) tem um secret exclusivo — o omnx-desk precisa guardar e
usar **um secret por cliente**.

---

## 2. Endpoints

Base: `https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1`

| Ação | Método | URL |
|---|---|---|
| Registrar venda | POST | `{base}/crm-registrar-venda` |
| Buscar lead | POST | `{base}/crm-buscar-lead` |

Ambos respondem JSON. CORS aberto (`OPTIONS` respondido).

## 3. Autenticação (multi-tenant)

Envie o secret **do cliente dono da venda** em **um** destes headers (ordem de
prioridade usada pelo servidor):

1. `x-omnx-desk-secret: <secret>` ← **canônico, use este**
2. `x-empiredesk-secret: <secret>` (legado, continua aceito)
3. `Authorization: Bearer <secret>` (fallback)

**Como funciona a identificação da conta no servidor:**

```
secret recebido → SHA-256 → lookup do workspace dono do digest
   ├─ encontrou  → caminho isolado: a oportunidade PRECISA pertencer
   │               a esse workspace, senão 403
   └─ não encontrou → fallback: compara com o secret global (legado)
```

- O secret nunca é comparado em texto puro no banco: o servidor guarda só o
  digest SHA-256. Trate o secret como senha: nunca em frontend, log ou repositório.
- **Rotação:** se um secret vazar, o cliente gera outro no painel Empire
  (Administração → Integrações → omnx-desk) e te passa o novo valor. Implemente
  o secret como configuração por cliente, fácil de trocar.
- Existe também um **secret global** (legado, de quando havia uma conta só).
  Clientes antigos podem usá-lo; clientes novos recebem secret próprio. Se o
  secret enviado não estiver cadastrado para nenhuma conta, o servidor tenta o
  global — então trate **401 como "secret errado/ausente"**, não como bug seu.

---

## 4. Buscar lead (resolver o `oportunidade_id`)

A venda precisa do **UUID da oportunidade no Empire** — não o ID do GHL, não o ID
interno do omnx-desk. Se você não tem esse UUID, busque pelo contato:

```http
POST {base}/crm-buscar-lead
Content-Type: application/json
x-omnx-desk-secret: <secret do cliente>

{ "telefone": "+55 11 99999-0000", "email": "comprador@email.com" }
```

- Pelo menos um dos dois campos é obrigatório; pode mandar os dois.
- Resposta: `{ "candidatos": [ ... ] }` — lista de contatos candidatos com suas
  oportunidades. Escolha a oportunidade correta (regra sua: mais recente, a da
  pipeline de vendas, a que bate com o produto, etc.) e use o `id` dela como
  `oportunidade_id`.
- Sem candidatos → lista vazia. Nesse caso **não invente UUID**: registre o caso
  para tratamento manual (a venda será recusada com 404 se o UUID não existir).

---

## 5. Registrar venda

```http
POST {base}/crm-registrar-venda
Content-Type: application/json
x-omnx-desk-secret: <secret do cliente>
```

### 5.1 Estrutura do body (3 partes)

```json
{
  "oportunidade_id": "8f3c9d20-uuid-da-oportunidade-no-empire",
  "venda": {
    "nome_contratante": "Fulano da Silva",
    "cpf_cnpj_contratante": "123.456.789-00",
    "produto_vendido": "Mentoria Empire 12 meses",
    "closer_nome": "Maria Closer",
    "closer_email": "maria@empresa.com",
    "logradouro_rua_avenida": "Rua das Vendas",
    "numero_endereco": "100",
    "complemento_endereco": "Sala 5",
    "bairro": "Centro",
    "municipio": "São Paulo",
    "estado_uf": "SP",
    "cep": "01000-000",
    "observacoes_venda": "Cliente pediu nota fiscal.",
    "pagamentos": [
      { "data": "2026-07-18", "valor": 1000, "forma": "pix",    "sinal": "Entrada" },
      { "data": "2026-08-18", "valor": 500,  "forma": "cartao", "sinal": "Parcela 1" },
      { "data": "2026-09-18", "valor": 500,  "forma": "cartao", "sinal": "Parcela 2" }
    ]
  },
  "comprovantes": [
    {
      "url": "https://cdn.omnxdesk.com/recibos/abc123.jpg",
      "nome_original": "comprovante-entrada.jpg",
      "mime_type": "image/jpeg",
      "sinal": "Entrada"
    }
  ]
}
```

### 5.2 Campos — obrigatórios e regras

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| `oportunidade_id` | string (UUID) | **Sim** | UUID da oportunidade **no Empire**. Precisa existir e ter contato vinculado. |
| `venda.pagamentos` | array | **Sim** | Pelo menos **1** item. É daqui que saem valor e data da venda. |
| `pagamentos[].data` | string `AAAA-MM-DD` | **Sim** (ao menos na entrada) | **Sem data de entrada, a venda é rejeitada (422).** Data civil, sem hora. |
| `pagamentos[].valor` | number | **Sim** | Número puro: `1500` ou `1500.50`. Nunca `"R$ 1.500,00"`. |
| `pagamentos[].sinal` | string | Recomendado | Marque a entrada com texto contendo **"entrada"** (case-insensitive). Se ninguém for marcado, a entrada é o pagamento **mais antigo por `data`**. |
| `pagamentos[].forma` | string | Opcional | Ex.: `pix`, `cartao`, `boleto`. |
| `venda.nome_contratante`, `cpf_cnpj_contratante`, `produto_vendido`, `closer_nome`, `closer_email`, endereço (`logradouro_rua_avenida`, `numero_endereco`, `complemento_endereco`, `bairro`, `municipio`, `estado_uf`, `cep`), `observacoes_venda` | string | Opcional | Texto livre. Ausente vira `null`. |
| `comprovantes` | array | Opcional | Ver §5.4. |
| `comprovantes[].url` | string (URL) | Obrigatório se o item existir | URL **publicamente acessível** — o Empire baixa o arquivo e guarda uma cópia própria. |
| `comprovantes[].nome_original`, `mime_type`, `sinal` | string | Opcional | Metadados do arquivo. |

### 5.3 Como o Empire interpreta os pagamentos

- **Entrada** = o pagamento com `sinal` contendo "entrada"; se nenhum, o mais
  antigo por `data`.
- **`data_pagamento_entrada`** = `data` da entrada (gravada como meio-dia BRT).
  **É ela que torna a venda "fechada" e visível no dashboard.**
- **Parcelas** = os demais pagamentos (`numero_parcelas` = quantidade;
  `valor_parcela` = média).
- **Valor faturado** = soma de todos os pagamentos (calculado no banco).

### 5.4 Comprovantes

- O Empire faz **download da URL** e guarda cópia no storage próprio
  (`vendas-comprovantes`). A URL precisa responder 200 sem autenticação (ou com
  token embutido na própria URL) no momento do envio.
- Falha de download **não** bloqueia a venda — o campo `comprovantes_salvos` da
  resposta informa quantos foram efetivamente copiados (pode ser 0).
- Reenviar a mesma venda com comprovantes novos adiciona as cópias novas.

### 5.5 Idempotência e reenvio (importante)

- O registro é **upsert por `oportunidade_id`**: reenviar a mesma venda atualiza
  o registro existente em vez de duplicar. Pode reenviar à vontade (retry,
  correção de dados, nova parcela paga).
- **Merge protetor no servidor:** campos financeiros que chegarem nulos/derivados
  de lista vazia **não apagam** valores bons já gravados (COALESCE server-side).
- Consequência prática: envie sempre a **lista completa de pagamentos** que você
  conhece daquela venda — o servidor cuida de preservar o que já existia.

---

## 6. Respostas e códigos

### Sucesso — 200

```json
{ "success": true, "id": "uuid-da-venda", "valor_faturado": 2000, "comprovantes_salvos": 1 }
```

### Erros

| HTTP | Quando | O que fazer |
|---|---|---|
| 400 | JSON inválido; `oportunidade_id` ausente; busca sem telefone/email | Corrigir o payload. |
| 401 | Secret ausente, não cadastrado e diferente do global | Conferir o secret do cliente e o header usado. |
| 403 | Secret por conta válido, mas a oportunidade é de **outra conta** | Você enviou o secret do cliente errado para essa oportunidade — ou o lead é de outro tenant. Não reenviar: registrar para análise. |
| 404 | `oportunidade_id` não existe no Empire | Resolver o UUID via `crm-buscar-lead`; não inventar. |
| 422 | Oportunidade sem contato vinculado; **ou** nenhuma `data` de entrada derivável (payload sem data e venda inexistente) | No caso da data: incluir ao menos um pagamento com `data`. |
| 500 | Erro interno (vem com `request_id`) | Pode **retentar** (idempotente). Se persistir, reportar com o `request_id`. |

**Política de retry recomendada:** retentar somente 5xx e timeouts (backoff
exponencial, máx. ~5 tentativas). 4xx é erro de dado — reenviar igual só repete
o erro.

---

## 7. Multi-tenant: o que muda no seu sistema

1. **Um secret por cliente**, guardado na configuração da conta dele no
   omnx-desk (nunca hardcoded, nunca global por padrão).
2. **Onboarding de cliente novo:** o admin da conta gera o secret no painel
   Empire (Administração → Integrações → omnx-desk) e te informa. Você cadastra
   na conta dele e pronto — não é preciso avisar mais ninguém nem alterar nada
   do lado Empire.
3. **Não envie tenant/workspace no payload** — ele não existe no contrato e
   seria ignorado. A identidade é sempre o secret.
4. **403 significa cruzamento de contas**: se acontecer, é sinal de que a venda
   foi montada com o secret do cliente A e a oportunidade do cliente B —
   exatamente o vazamento que o isolamento existe para impedir.

---

## 8. Exemplo completo (curl)

```bash
curl -X POST "https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/crm-registrar-venda" \
  -H "Content-Type: application/json" \
  -H "x-omnx-desk-secret: $SECRET_DO_CLIENTE" \
  -d '{
    "oportunidade_id": "8f3c9d20-0000-0000-0000-000000000000",
    "venda": {
      "nome_contratante": "Fulano da Silva",
      "produto_vendido": "Mentoria Empire 12 meses",
      "closer_nome": "Maria Closer",
      "pagamentos": [
        { "data": "2026-07-21", "valor": 1500, "forma": "pix", "sinal": "Entrada" }
      ]
    },
    "comprovantes": [
      { "url": "https://cdn.omnxdesk.com/recibos/abc123.jpg", "mime_type": "image/jpeg", "sinal": "Entrada" }
    ]
  }'
```

Resposta esperada: `{"success": true, "id": "...", "valor_faturado": 1500, "comprovantes_salvos": 1}`

---

## 9. Checklist de implementação

- [ ] Secret configurável **por cliente**, enviado em `x-omnx-desk-secret`
- [ ] Resolução de `oportunidade_id` via `crm-buscar-lead` (telefone/e-mail) antes do primeiro registro da venda
- [ ] `pagamentos` sempre com ao menos 1 item **com `data` (AAAA-MM-DD) e `valor` numérico**
- [ ] Entrada marcada com `sinal` contendo "entrada"
- [ ] Lista de pagamentos enviada **completa** a cada envio (o servidor faz merge)
- [ ] URLs de comprovante publicamente acessíveis no momento do envio
- [ ] Retry apenas para 5xx/timeout (backoff); 4xx vai para fila de análise com o corpo do erro
- [ ] Tratar 403 como "secret × oportunidade de contas diferentes" — nunca reenviar cego
- [ ] Logar `request_id` das respostas 500 para suporte
- [ ] Teste ponta a ponta: venda de teste → conferir no dashboard Empire (página **Vendas**) da conta certa

---

## 10. Referências (lado Empire)

- Guia do usuário (visão do admin da conta): `docs/CONFIG-OMNX-DESK-USUARIO.md`
- Plano técnico completo da integração: `docs/INTEGRACAO-OMNX-DESK-VENDAS.md`
- Código da edge de registro: `supabase/functions/crm-registrar-venda/index.ts`
- Código da edge de busca: `supabase/functions/crm-buscar-lead/index.ts`
