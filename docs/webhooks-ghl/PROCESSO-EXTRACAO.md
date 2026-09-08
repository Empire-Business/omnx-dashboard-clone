# Processo de Extração de Dados GHL

> Documentação completa do processo de extração de webhooks para tabelas estruturadas

---

## 🎯 Visão Geral

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│  webhooks_ghl   │────▶│  extrair_dados_ghl  │────▶│   contatos      │
│  (JSON bruto)   │     │    (função SQL)     │     │  (11 registros) │
└─────────────────┘     └─────────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌─────────────────┐
                        │  oportunidades  │
                        │ (10 registros)  │
                        └─────────────────┘
```

---

## 📊 Estatísticas Atuais

| Tabela | Registros | Fonte |
|--------|-----------|-------|
| webhooks_ghl | 13 | Webhooks recebidos do GHL |
| contatos | 11 | Extraídos de webhooks |
| oportunidades | 10 | Extraídos de webhooks |

**Nota:** A diferença entre webhooks e registros ocorre porque alguns webhooks podem não ter todos os campos obrigatórios ou são eventos de teste.

---

## 🔧 Como Funciona

### Função SQL: `extrair_dados_ghl()`

Local: `supabase/migrations/20250219_criar_funcao_extrair_ghl.sql`

**O que faz:**
1. Lê todos os webhooks da tabela `webhooks_ghl`
2. Extrai campos do JSON (`payload`)
3. Insere/atualiza contatos (tabela `contatos`)
4. Insere/atualiza oportunidades (tabela `oportunidades`)
5. Retorna estatísticas da operação

**Retorno:**
```sql
(contatos_inseridos, contatos_atualizados, oportunidades_inseridas, oportunidades_atualizadas)
```

---

## 🚀 Como Usar

### Executar Extração Manual

```sql
-- Executar a função (pode rodar múltiplas vezes - é idempotente)
SELECT * FROM extrair_dados_ghl();

-- Resultado esperado:
-- contatos_inseridos | contatos_atualizados | oportunidades_inseridas | oportunidades_atualizadas
-- -------------------+----------------------+-------------------------+--------------------------
--         0          |          0           |            0            |            0
-- (valores variam conforme novos webhooks)
```

### Verificar Dados Extraídos

```sql
-- Listar contatos
SELECT * FROM contatos ORDER BY updated_at DESC LIMIT 10;

-- Listar oportunidades com dados do contato
SELECT 
    o.titulo,
    o.nome_contato,
    o.status,
    o.valor,
    c.ghl_id
FROM oportunidades o
JOIN contatos c ON c.id = o.contato_id
ORDER BY o.updated_at DESC;

-- Contar oportunidades por status
SELECT status, COUNT(*) FROM oportunidades GROUP BY status;
```

---

## 🔄 Fluxo Automatizado ✅ IMPLEMENTADO

### ✅ Opção 1: Trigger no webhooks_ghl (ATIVO)

**Status:** ✅ Implementado e ativo

```sql
-- Trigger criado automaticamente
-- Nome: trigger_extracao_automatica
-- Evento: AFTER INSERT ON webhooks_ghl
-- Ação: EXECUTE FUNCTION trigger_extrair_dados_ghl()
```

**Como funciona:**
1. GHL envia webhook
2. Edge Function salva em `webhooks_ghl`
3. Trigger dispara automaticamente
4. Função `extrair_dados_ghl()` executa
5. Tabelas `contatos` e `oportunidades` são populadas

**Prós:** 
- ✅ Instantâneo (dados disponíveis imediatamente)
- ✅ Não requer manutenção
- ✅ Sempre sincronizado

**Contras:**
- Pode ter leve delay em alta carga (aceitável)

### Opção 2: Job Periódico (Alternativa)
```sql
-- Executar a cada 5 minutos via pg_cron (se habilitado)
SELECT cron.schedule('extrair-ghl', '*/5 * * * *', 'SELECT extrair_dados_ghl()');
```

**Prós:** Controlado, não bloqueia inserts  
**Contras:** Delay de até 5 minutos

### Opção 3: Edge Function
```sql
-- Chamar função SQL via HTTP quando necessário
-- (implementação futura)
```

**Prós:** Flexível, pode ter lógica adicional  
**Contras:** Mais complexo

---

## 📋 Mapeamento de Campos

### Contatos

| Campo GHL (JSON) | Coluna | Transformação |
|------------------|--------|---------------|
| `contact_id` | `ghl_id` | TRIM |
| `full_name` | `nome` | TRIM |
| `email` | `email` | TRIM → LOWERCASE |
| `phone` | `telefone` | TRIM |

### Oportunidades

| Campo GHL (JSON) | Coluna | Transformação |
|------------------|--------|---------------|
| `id` | `ghl_opportunity_id` | TRIM |
| `contact_id` (join) | `contato_id` | FK → contatos.id |
| `full_name` | `nome_contato` | TRIM (cache) |
| `email` | `email_contato` | TRIM (cache) |
| `opportunity_name` | `titulo` | TRIM |
| `lead_value` | `valor` | COALESCE(valor, 0) |
| `status` | `status` | COALESCE(status, 'open') |
| `pipeline_id` | `pipeline_id` | TRIM |
| `pipleline_stage` | `pipeline_stage_id` | TRIM |

---

## 🛡️ Idempotência

A função é **idempotente**: pode ser executada múltiplas vezes sem problemas.

**Como funciona:**
- Usa `ON CONFLICT (ghl_id) DO NOTHING/UPDATE`
- Verifica se dados realmente mudaram antes de atualizar
- Não cria duplicatas

**Quando executar:**
- ✅ Novos webhooks chegaram
- ✅ Quer garantir que tudo está sincronizado
- ✅ Após alterações na estrutura das tabelas

---

## 📁 Arquivos Relacionados

| Arquivo | Descrição |
|---------|-----------|
| `MAPEAMENTO-CAMPOS.md` | Mapeamento técnico completo |
| `DECISOES/20250219-extracao-contatos-oportunidades.md` | Decisão arquitetural |
| `EXEMPLOS-PAYLOADS.md` | Exemplos de payloads GHL |
| `supabase/migrations/*extrair_ghl.sql` | Migration da função SQL |

---

## 📝 Changelog

| Data | Mudança |
|------|---------|
| 2026-02-19 | Criação das tabelas `contatos` e `oportunidades` |
| 2026-02-19 | Criação da função `extrair_dados_ghl()` |
| 2026-02-19 | Extração inicial: 11 contatos, 10 oportunidades |

---

## ❓ FAQ

**Q: Posso executar a função várias vezes?**  
R: Sim, é idempotente. Não cria duplicatas.

**Q: E se o webhook não tiver email?**  
R: O campo permite NULL. Será inserido como NULL.

**Q: Como atualizo um contato que mudou no GHL?**  
R: Basta executar `SELECT extrair_dados_ghl()` novamente. A função fará UPDATE.

**Q: Posso adicionar mais campos?**  
R: Sim, mas precisa: 1) Alterar a tabela, 2) Alterar a função, 3) Documentar em DECISOES/.

---

*Processo documentado em 2026-02-19*
