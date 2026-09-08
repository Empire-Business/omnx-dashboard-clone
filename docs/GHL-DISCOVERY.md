# GHL Discovery — Edge Function

> Edge function `discover-ghl-config` para descoberta automatizada de campos customizados e pipelines de uma conta GoHighLevel (GHL), parte da **Fase 2** da expansão multi-conta do Empire.

---

## 🎯 Propósito

A função consulta a API GHL de uma conta e retorna um JSON normalizado com:

- **Custom fields de contato** (`GET /locations/{locationId}/customFields?model=contact`)
- **Custom fields de oportunidade** (`GET /locations/{locationId}/customFields?model=opportunity`)
- **Pipelines e stages** (`GET /pipelines` ou fallback `GET /opportunities/pipelines?locationId={locationId}`)

Cada execução registra o resultado em `ghl_discovery_runs` para auditoria.

---

## 📁 Arquivos

- `supabase/functions/discover-ghl-config/index.ts` — implementação da edge function.
- `supabase/functions/discover-ghl-config/config.toml` — configuração local (`verify_jwt = false`).
- `supabase/config.toml` — registro central da função.

---

## 🔐 Segurança

- `verify_jwt = false` no `config.toml`; a validação do JWT é feita **dentro** da função.
- Só aceita requisições autenticadas com `Authorization: Bearer <jwt>` válido.
- O usuário deve ser `owner` ou `admin` do workspace solicitado.
- A `ghl_api_key` é lida com **service role** e **nunca** é retornada na resposta.
- A resposta inclui apenas uma máscara da chave (`ghl_api_key_mask`), por segurança.

---

## 🚀 Como usar

### Requisição

```http
POST /functions/v1/discover-ghl-config
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "workspace_id": "<uuid>",
  "include_payload": false
}
```

> `include_payload` é opcional. Quando `true`, o payload bruto da API GHL é armazenado em `ghl_discovery_runs.payload`. O padrão é `false` (salva apenas contagem e URL).

### Resposta de sucesso

```json
{
  "contact_custom_fields": [
    { "id": "abc", "name": "Data de Nascimento", "key": "data_de_nascimento", "field_type": "DATE", "placeholder": null }
  ],
  "opportunity_custom_fields": [
    { "id": "def", "name": "MQL Conectado", "key": "mqlconectado", "field_type": "DATE", "placeholder": "Data do primeiro contato" }
  ],
  "pipelines": [
    {
      "id": "pip123",
      "name": "Pré-Vendas",
      "stages": [
        { "id": "stg1", "name": "Novo" },
        { "id": "stg2", "name": "Conectado" }
      ]
    }
  ],
  "errors": [],
  "status": "success",
  "workspace_id": "<uuid>",
  "location_id": "<ghl_location_id>",
  "ghl_api_key_mask": "abcd...wxyz"
}
```

### Resposta parcial (alguns endpoints falharam)

```json
{
  "contact_custom_fields": [...],
  "opportunity_custom_fields": [],
  "pipelines": [...],
  "errors": [
    "opportunity_custom_fields: Erro da API GHL (500): ..."
  ],
  "status": "partial",
  "workspace_id": "<uuid>",
  "location_id": "<ghl_location_id>",
  "ghl_api_key_mask": "abcd...wxyz"
}
```

---

## ⚙️ Rate Limiting

A função implementa rate limiting local básico:

- Delay base de **130 ms** entre requisições (~7.7 req/s, abaixo do limite de 10 req/s da GHL).
- Retry automático em **429** com backoff, respeitando o header `Retry-After`.
- Timeout de **15 segundos** por requisição.

---

## 🗄️ Auditoria

Cada fonte descoberta gera um registro em `ghl_discovery_runs`:

| source | descrição |
|--------|-----------|
| `contact_custom_fields` | Campos customizados de contato |
| `opportunity_custom_fields` | Campos customizados de oportunidade |
| `pipelines` | Pipelines e stages |

A coluna `status` pode ser `success`, `error` ou `partial`.

---

## 🧪 Testes locais com mocks

Para validar a estrutura sem credenciais reais, disponibilizamos um script de teste que simula respostas reais da API GHL e valida a normalização:

```bash
# Instalar Deno localmente (se ainda não estiver disponível)
curl -fsSL https://deno.land/install.sh | DENO_INSTALL=.tools/deno sh

# Validar tipos da edge function
.tools/deno/bin/deno check supabase/functions/discover-ghl-config/index.ts

# Rodar testes de normalização com mocks
.tools/deno/bin/deno run scripts/test-discover-ghl-config-mock.ts
```

Resultado esperado:

```
✅ Todos os testes de normalização passaram.
Contact fields: 2
Opportunity fields: 2
Pipelines: 2
```

> **Importante:** a função sempre tenta chamar a API GHL real em produção. Mocks são apenas para desenvolvimento/teste.

---

## ⚠️ Regras Críticas

1. **Nunca exponha `ghl_api_key`** na resposta ou em logs.
2. **Sempre valide JWT internamente** — não confie apenas no `verify_jwt = true` do Supabase.
3. **Verifique owner/admin** antes de executar discovery.
4. **Use service role apenas no servidor** (edge function), nunca no frontend.
5. **CORS básico** ativado via `../_shared/cors.ts`.

---

## 📚 Relacionados

- [`docs/GHL-MAPEAMENTO-CAMPOS.md`](GHL-MAPEAMENTO-CAMPOS.md) — tabelas de mapeamento multi-conta.
- [`docs/SUB-APPS-MODULARES.md`](SUB-APPS-MODULARES.md) — arquitetura de sub-apps e workspace.
- [`docs/ROADMAP.md`](ROADMAP.md) — progresso das fases multi-conta.

---

*Última atualização: 2026-07-07 BRT*
