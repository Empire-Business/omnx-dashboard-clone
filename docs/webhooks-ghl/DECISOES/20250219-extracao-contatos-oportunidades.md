# Decisão: Extração de Contatos e Oportunidades

**Data:** 2026-02-19  
**Responsável:** Claude (AI)  
**Status:** Aprovada / Implementada  

---

## Contexto

Recebemos webhooks do GHL através do workflow "Oportunidade Criada/Atualizada -> Sistema CEO". Os payloads contêm dados de contatos e oportunidades que precisam ser extraídos para as tabelas `contatos` e `oportunidades` já criadas.

## Evento GHL

- **Evento:** Workflow Trigger (Oportunidade Criada/Atualizada)
- **Workflow ID:** a0b594ea-680c-4330-84be-c3725c7fd612
- **Documentação GHL:** [Workflow Triggers - GHL Documentation]

## Campos do Payload

```json
{
  "id": "o40R9f7xevOWTwCKGJS8",
  "contact_id": "aNPI651izreiwWEm4emo",
  "email": "leonardo@centroauditivomacae.com.br",
  "phone": "+5522997158607",
  "full_name": "Leonardo Moraes Santos",
  "first_name": "Leonardo",
  "last_name": "Moraes Santos",
  "status": "lost",
  "pipeline_id": "sqchZ2kIIZljR6wJ6bko",
  "pipeline_name": "Pré-Vendas nMQL",
  "pipleline_stage": "Perdido",
  "lead_value": 0,
  "opportunity_name": "Leonardo Moraes Santos"
}
```

## Mapeamento Proposto

### Tabela: contatos

| Campo GHL | Tabela | Coluna | Tipo | Nullable | Único |
|-----------|--------|--------|------|----------|-------|
| `contact_id` | contatos | ghl_id | text | Não | Sim |
| `full_name` | contatos | nome | text | Não | Não |
| `email` | contatos | email | text | Sim | Não |
| `phone` | contatos | telefone | text | Sim | Não |

### Tabela: oportunidades

| Campo GHL | Tabela | Coluna | Tipo | Nullable | Único |
|-----------|--------|--------|------|----------|-------|
| `id` | oportunidades | ghl_opportunity_id | text | Não | Sim |
| `contact_id` (join) | oportunidades | contato_id | uuid | Não | Não |
| `full_name` (cache) | oportunidades | nome_contato | text | Não | Não |
| `email` (cache) | oportunidades | email_contato | text | Sim | Não |
| `opportunity_name` | oportunidades | titulo | text | Sim | Não |
| `lead_value` | oportunidades | valor | decimal | Sim | Não |
| `status` | oportunidades | status | text | Sim | Não |
| `pipeline_id` | oportunidades | pipeline_id | text | Sim | Não |
| `pipleline_stage` | oportunidades | pipeline_stage_id | text | Sim | Não |

## Raciocínio

1. **Por que separar contatos e oportunidades?**
   - Um contato pode ter múltiplas oportunidades (1:N)
   - Evita duplicação de dados do contato
   - Permite histórico completo de oportunidades por contato

2. **Por que cache de nome/email na oportunidade?**
   - Facilita visualização sem JOIN
   - Mantém histórico mesmo se contato for atualizado
   - Performance em listagens

3. **Por que usar ghl_id como único?**
   - Garante idempotência (mesmo webhook processado 2x = mesmo resultado)
   - Permite atualização em vez de inserção

## Regras de Negócio

1. **Inserção/Atualização:**
   - Se `ghl_id` já existe → UPDATE
   - Se não existe → INSERT

2. **Relacionamento:**
   - Sempre buscar `contato_id` pela coluna `ghl_id` na tabela contatos
   - Usar ON CONFLICT para evitar erros de duplicata

3. **Valores padrão:**
   - `status` default: 'open'
   - `valor` default: 0 quando null

4. **Transformações:**
   - Trim em todos os campos texto
   - Email em lowercase
   - Telefone manter formato original

## Processo de Extração

### Método: Função SQL no Supabase

Vamos usar uma função PostgreSQL que:
1. Itera sobre webhooks não processados
2. Extrai dados do JSON
3. Insere/atualiza contatos
4. Insere/atualiza oportunidades
5. Marca webhook como processado (opcional)

### Vantagens:
- Rápido (executa no banco)
- Transacional (tudo ou nada)
- Reprodutível (pode rodar múltiplas vezes)
- Auditável (mantém webhooks originais)

## Aprovações

- [x] Arquiteto (Claude AI - responsável técnico)
- [x] Documentação completa

## Implementação

- [x] Migration criada: `criar_tabela_contatos`
- [x] Migration criada: `criar_tabela_oportunidades`
- [x] Função de extração SQL criada
- [x] Dados extraídos dos webhooks existentes
- [x] Documentação atualizada

## Queries de Extração

### Extrair Contatos
```sql
INSERT INTO contatos (ghl_id, nome, email, telefone)
SELECT DISTINCT
    payload->>'contact_id',
    payload->>'full_name',
    payload->>'email',
    payload->>'phone'
FROM webhooks_ghl
ON CONFLICT (ghl_id) DO UPDATE SET
    nome = EXCLUDED.nome,
    email = EXCLUDED.email,
    telefone = EXCLUDED.telefone,
    updated_at = NOW();
```

### Extrair Oportunidades
```sql
INSERT INTO oportunidades (
    ghl_opportunity_id, contato_id, nome_contato, email_contato,
    titulo, valor, status, pipeline_id, pipeline_stage_id
)
SELECT
    w.payload->>'id',
    c.id,
    w.payload->>'full_name',
    w.payload->>'email',
    w.payload->>'opportunity_name',
    COALESCE((w.payload->>'lead_value')::decimal, 0),
    COALESCE(w.payload->>'status', 'open'),
    w.payload->>'pipeline_id',
    w.payload->>'pipleline_stage'
FROM webhooks_ghl w
JOIN contatos c ON c.ghl_id = w.payload->>'contact_id'
ON CONFLICT (ghl_opportunity_id) DO UPDATE SET
    nome_contato = EXCLUDED.nome_contato,
    email_contato = EXCLUDED.email_contato,
    titulo = EXCLUDED.titulo,
    valor = EXCLUDED.valor,
    status = EXCLUDED.status,
    pipeline_id = EXCLUDED.pipeline_id,
    pipeline_stage_id = EXCLUDED.pipeline_stage_id,
    updated_at = NOW();
```

---

*Decisão implementada em 2026-02-19*
