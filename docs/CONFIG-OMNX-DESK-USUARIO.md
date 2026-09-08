# Guia de Configuração — Integração omnx-desk → Empire (Vendas)

> **Atualizado em:** 2026-07-21 BRT
> **Para quem:** dono/admin que vai conectar uma conta **omnx-desk** ao Empire para que
> as vendas fechadas lá apareçam automaticamente no dashboard.
> **Plano técnico (para desenvolvedores):** [`docs/INTEGRACAO-OMNX-DESK-VENDAS.md`](INTEGRACAO-OMNX-DESK-VENDAS.md)

Este guia foi escrito para **não deixar dúvida**. Ele explica, em ordem: (1) o que é a
integração, (2) o que você precisa fazer para configurar, e (3) **exatamente** em que
formato os dados precisam chegar — com exemplos que funcionam e exemplos que quebram.

---

## 1. O que essa integração faz (em linguagem simples)

Pense no omnx-desk como o "balcão" onde o time registra uma venda fechada (com valores,
parcelas e comprovantes). Toda vez que uma venda é registrada lá, o omnx-desk **avisa o
Empire** enviando um pacote de dados. O Empire guarda essa venda e ela passa a contar no
faturamento do dashboard.

Para esse aviso funcionar, três coisas precisam estar certas:
1. O omnx-desk precisa saber **o endereço** para onde enviar (a URL da função).
2. O omnx-desk precisa enviar **uma senha** (o "secret") para provar que é ele.
3. Os dados precisam vir **no formato certo** — senão a venda entra "cega" e não aparece.

---

## 2. Passo a passo de configuração

### Passo 1 — Endereço (URL) para onde o omnx-desk envia

```
POST https://qzesffnkqgelmtfblzkr.supabase.co/functions/v1/crm-registrar-venda
```

> Se você trocar de projeto Supabase, o `qzesffnkqgelmtfblzkr` muda para o ref do novo projeto.

### Passo 2 — Senha (secret) da integração

O envio precisa carregar um secret. Ele vai em **um** destes cabeçalhos (headers):

```
x-omnx-desk-secret: <SEU_SECRET>
```
ou
```
Authorization: Bearer <SEU_SECRET>
```

> **Onde esse secret mora:** hoje ele é um segredo configurado nas edge functions do
> Supabase (`OMNX_DESK_BRIDGE_SECRET`; o antigo `EMPIREDESK_BRIDGE_SECRET` continua aceito
> durante a transição). **Nunca** coloque esse secret no frontend nem no navegador — ele é
> secreto e só o omnx-desk (servidor) deve conhecê-lo.

### Passo 3 — Secret próprio por conta (isolamento multi-tenant)

Cada conta omnx-desk pode ter **um secret próprio**, amarrado ao workspace dela — garantindo que a
conta de um cliente **nunca** grave venda no dado de outro. O cadastro é self-service:

1. No painel Empire, vá em **Administração → Integrações → omnx-desk (Vendas)**.
2. Gere um secret forte (ex.: 32+ caracteres aleatórios) e cole no campo **Secret da conta**.
3. Clique em **Conectar omnx-desk**. O secret vai para o cofre e nunca mais aparece na tela.
4. No omnx-desk, configure a URL e o cabeçalho `x-omnx-desk-secret` com esse secret (a tela de
   Integrações mostra os dois valores prontos para copiar).

A partir do primeiro secret cadastrado, toda venda que chega com esse secret é validada contra a
conta dona dele: se a oportunidade não pertencer à mesma conta, o registro é recusado (erro 403).
Enquanto nenhum secret por conta for cadastrado, o secret global dos Passos 1 e 2 continua valendo
(comportamento antigo, sem regressão). Para trocar ou remover o secret, use a mesma tela.

### Passo 4 — Testar

Envie uma venda de teste (exemplo válido na seção 4). A resposta de sucesso é:

```json
{ "success": true, "id": "<uuid da venda>", "valor_faturado": 1500, "comprovantes_salvos": 1 }
```

Depois, confira no dashboard (página de **Vendas**) se a venda apareceu.

---

## 3. Como os dados devem chegar (formato do envio)

O corpo (body) do POST é um JSON com **3 partes**: `oportunidade_id`, `venda` e
`comprovantes`.

```json
{
  "oportunidade_id": "8f3c...-uuid-da-oportunidade-no-empire",
  "venda": {
    "nome_contratante": "Fulano da Silva",
    "cpf_cnpj_contratante": "123.456.789-00",
    "produto_vendido": "Mentoria Empire 12 meses",
    "forma_pagamento": "pix + cartão",
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
      { "data": "2026-08-18", "valor": 500,  "forma": "cartao", "sinal": "Parcela 1" }
    ]
  },
  "comprovantes": [
    { "url": "https://.../comprovante-entrada.jpg", "nome_original": "entrada.jpg", "mime_type": "image/jpeg", "sinal": "Entrada" }
  ]
}
```

### Campos, um por um

| Campo | Obrigatório | Regra |
|---|---|---|
| `oportunidade_id` | **Sim** | UUID da **oportunidade no Empire** (não o ID do GHL). A oportunidade precisa já existir e ter um contato vinculado. |
| `venda.pagamentos` | **Sim** | Lista com **pelo menos 1** pagamento. É daqui que sai o valor e a data da venda. |
| `venda.pagamentos[].data` | **Sim** (na entrada) | Data no formato **`AAAA-MM-DD`**. **Sem isso, a venda não aparece no dashboard.** |
| `venda.pagamentos[].valor` | **Sim** | Número (ex: `1000` ou `1000.50`). Não enviar como texto com "R$". |
| `venda.pagamentos[].sinal` | Recomendado | Marque a entrada com algo que contenha a palavra **"entrada"** (ex: `"Entrada"`). Se ninguém for marcado, o Empire assume que a **entrada é o pagamento mais antigo por data**. |
| `venda.pagamentos[].forma` | Opcional | Ex: `pix`, `cartao`, `boleto`. |
| `venda.nome_contratante`, `cpf_cnpj_contratante`, endereço, `produto_vendido`, `observacoes_venda`, `closer_nome`, `closer_email` | Opcional | Texto livre. |
| `comprovantes[].url` | Opcional | URL de onde o Empire baixa o comprovante e guarda no cofre próprio. |
| `comprovantes[].nome_original` / `mime_type` / `sinal` | Opcional | Metadados do arquivo. |

### Como o Empire calcula a venda a partir dos pagamentos
- **Entrada** = o pagamento marcado com `sinal` contendo "entrada"; se nenhum, o **mais antigo por `data`**.
- **`data_pagamento_entrada`** (o que torna a venda "fechada" e visível) = a `data` da entrada.
- **Parcelas** = todos os outros pagamentos.
- **Valor faturado** = soma de todos os pagamentos (calculado automaticamente no banco).

---

## 4. Exemplos — o que funciona e o que quebra

### ✅ Válido (aparece no dashboard)
```json
{
  "oportunidade_id": "8f3c9d20-....",
  "venda": {
    "produto_vendido": "Mentoria",
    "pagamentos": [ { "data": "2026-07-18", "valor": 1500, "sinal": "Entrada" } ]
  }
}
```
Tem `oportunidade_id` válido e uma entrada **com `data`** → `data_pagamento_entrada` é
preenchida → venda visível.

### ❌ Inválido 1 — `pagamentos` vazio
```json
{ "oportunidade_id": "8f3c...", "venda": { "produto_vendido": "Mentoria", "pagamentos": [] } }
```
Sem pagamento não há data de entrada → a venda é salva "cega" e **não aparece**. *(Após a
correção planejada, esse envio passa a ser **rejeitado com erro 422** para você perceber na hora.)*

### ❌ Inválido 2 — pagamento sem `data`
```json
{ "oportunidade_id": "8f3c...", "venda": { "pagamentos": [ { "valor": 1500, "sinal": "Entrada" } ] } }
```
Tem valor, mas **falta a `data`** → `data_pagamento_entrada` fica nula → **invisível**.

### ❌ Inválido 3 — `oportunidade_id` que não existe / sem contato
Retorna **404** ("Oportunidade não encontrada") ou **422** ("Oportunidade sem contato
vinculado"). A venda **não** é gravada. Confirme que você está enviando o UUID da
oportunidade **do Empire**, não o ID do GHL.

### ❌ Inválido 4 — `valor` como texto
```json
{ "pagamentos": [ { "data": "2026-07-18", "valor": "R$ 1.500,00" } ] }
```
Envie número puro (`1500`), sem "R$", sem ponto de milhar, usando ponto como decimal.

---

## 5. Checklist rápido antes de enviar cada venda
- [ ] `oportunidade_id` é o UUID da oportunidade **no Empire** e ela tem contato vinculado.
- [ ] `pagamentos` tem pelo menos 1 item.
- [ ] O pagamento de **entrada** tem `data` no formato `AAAA-MM-DD`.
- [ ] `valor` é número (sem "R$").
- [ ] O secret vai no header (`x-omnx-desk-secret` ou `Authorization: Bearer`), nunca no frontend.

---

## 6. "Registrei a venda e não apareceu" — o que checar
1. A venda é de um **lead orgânico** ou está na pipeline **Recuperação**? Então ela aparece na página de **Vendas/Faturamento**, mas **não** nos painéis de **Tráfego** (esses só mostram tráfego pago, por design). Ver a seção 3 do [plano técnico](INTEGRACAO-OMNX-DESK-VENDAS.md).
2. O pagamento de entrada tinha `data`? Sem data, some (seção 4 acima).
3. O período selecionado no dashboard cobre a **data de pagamento** da venda?
4. Se nada disso explica, avise o time técnico: pode ser o bug de Produtividade em investigação (seção 4.4 do plano técnico).
