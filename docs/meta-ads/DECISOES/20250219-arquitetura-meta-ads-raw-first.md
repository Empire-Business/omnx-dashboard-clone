# Decisão Técnica: Arquitetura Meta Ads - Raw First

| Campo | Valor |
|-------|-------|
| **Data** | 2026-02-19 |
| **Decisão** | ADR-006 - Arquitetura "Raw First" para Meta Ads |
| **Status** | Aceita |
| **Responsável** | [Seu nome] |

---

## Contexto

Precisamos integrar a Meta Marketing API para extrair métricas de campanhas Facebook/Instagram a cada 1 hora.

Questão central: **Devemos salvar o JSON bruto da API antes de processar?**

---

## Opções Consideradas

### Opção 1: Processamento Direto (API → Processed)

**Fluxo:**
```
Meta API → Edge Function → [Processa] → meta_ads_insights
```

**Prós:**
- Mais simples (menos uma tabela)
- Menos passos no pipeline

**Contras:**
- ❌ Se processamento falhar, perdemos os dados da API
- ❌ Sem fonte de verdade para auditoria
- ❌ Impossível reprocessar dados históricos se mudar regra de negócio
- ❌ Dificuldade para debug (não sabemos o que a API realmente retornou)

---

### Opção 2: Arquitetura Raw First (API → Raw → Processed) ✅ Escolhida

**Fluxo:**
```
Meta API → Edge Function → [Salva Raw] → meta_ads_raw_insights → [Processa] → meta_ads_insights
```

**Prós:**
- ✅ Fonte de verdade sempre preservada
- ✅ Reprocessamento possível em caso de erro
- ✅ Auditoria e compliance (temos o payload exato)
- ✅ Debug facilitado (podemos ver exatamente o que a API retornou)
- ✅ Flexibilidade para mudar lógica de processamento no futuro
- ✅ Segue mesmo padrão usado com sucesso nos webhooks GHL

**Contras:**
- Mais uma tabela (custo de storage)
- Processamento em 2 etapas (um pouco mais complexo)

---

## Decisão

**Escolhemos a Opção 2: Arquitetura Raw First**

**Justificativa:**
A complexidade adicional é justificada pelos benefícios de auditoria, reprocessamento e debug. Este é o mesmo padrão que usamos com sucesso para os webhooks GHL (`webhooks_ghl` → `contatos`/`oportunidades`), que nos salvou múltiplas vezes quando houve necessidade de reprocessar dados ou investigar bugs.

---

## Implementação

### Tabelas Criadas

1. **`meta_ads_raw_insights`** - JSON bruto da API
2. **`meta_ads_insights`** - Métricas processadas
3. **`meta_ads_insights_breakdowns`** - Segmentações
4. **`meta_ads_campaigns`** - Metadados (atualização separada)
5. **`meta_ads_sync_log`** - Log de execuções

### Fluxo

```
1. Cron job (1h) → Chama Edge Function
2. Edge Function → Chama Meta API
3. Edge Function → Salva JSON em raw_insights (processado_em = NULL)
4. Função PostgreSQL → Processa raw → insights + breakdowns
5. Marca raw como processado (processado_em = NOW())
6. Log de execução em sync_log
```

---

## Consequências

### Positivas
- Podemos reprocessar dados históricos se necessário
- Auditoria completa de todos os dados recebidos da Meta
- Facilidade para debug de problemas
- Flexibilidade para evoluir o schema de processed sem perder dados

### Negativas
- Storage adicional para JSON bruto (estimativa: ~1MB/dia)
- Complexidade adicional no pipeline
- Necessidade de limpar dados antigos de raw (retenção)

---

## Alternativas Futuras

Se o volume de dados crescer muito, podemos:
1. Compactar o JSON bruto (usar TOAST do PostgreSQL)
2. Mover dados antigos do raw para cold storage (S3)
3. Definir política de retenção (ex: manter raw dos últimos 90 dias apenas)

---

## Referências

- Padrão usado em: `webhooks_ghl` → `contatos`/`oportunidades` (webhooks-ghl/)
- Documentação: `docs/meta-ads/PROCESSO-EXTRACAO.md`
- Roadmap: `docs/ROADMAP.md` (seção Meta Ads)

---

## Aprovação

| Papel | Nome | Data | Assinatura |
|-------|------|------|------------|
| Tech Lead | | | |
| Product Owner | | | |

---

*Decisão registrada em: 2026-02-19*