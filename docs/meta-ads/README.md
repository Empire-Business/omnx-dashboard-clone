# Meta Ads - Documentação de Integração

| Campo | Valor |
|-------|-------|
| **Integração** | Meta Marketing API (Facebook/Instagram Ads) |
| **Versão API** | v18.0+ |
| **Frequência** | A cada 1 hora |
| **Status** | Em desenvolvimento |
| **Responsável** | [Seu nome] |

---

## 📚 Documentação Disponível

| Arquivo | Descrição |
|---------|-----------|
| [EVENTOS.md](./EVENTOS.md) | Endpoints da API e eventos disponíveis |
| [EXEMPLOS-PAYLOADS.md](./EXEMPLOS-PAYLOADS.md) | Exemplos de respostas da API Meta |
| [MAPEAMENTO-CAMPOS.md](./MAPEAMENTO-CAMPOS.md) | Mapeamento de campos API → Banco de dados |
| [PROCESSO-EXTRACAO.md](./PROCESSO-EXTRACAO.md) | Fluxo completo de extração de dados |
| [REGRAS-EXTRACAO.md](./REGRAS-EXTRACAO.md) | Regras de negócio para extração |

---

## 🎯 Objetivo da Integração

Extrair **todas as métricas disponíveis** das campanhas Meta Ads (Facebook e Instagram) para:

1. **Análise de performance** - CAC, CTR, CPC, ROAS
2. **Controle de gastos** - Spend por campanha/adset/criativo
3. **Otimização** - Identificar melhores audiências e criativos
4. **Matching com GHL** - No futuro, unir custo com leads convertidos

---

## 🏗️ Arquitetura da Integração

```
┌─────────────────────────────────────────────────────────────┐
│                     META MARKETING API                       │
│                   (graph.facebook.com)                       │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Edge Function: sync-meta-ads                │
│                  (Supabase Edge Functions)                   │
│                                                              │
│  1. Autentica com Access Token                               │
│  2. Chama /insights com todas as métricas                    │
│  3. Lida com paginação e rate limits                         │
│  4. Salva JSON bruto em meta_ads_raw_insights                │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                     │
│                                                              │
│  ┌──────────────────────┐    ┌──────────────────────────┐   │
│  │ meta_ads_raw_insights│───▶│  meta_ads_insights       │   │
│  │ (JSON bruto da API)  │    │  (métricas processadas)  │   │
│  └──────────────────────┘    └──────────────────────────┘   │
│                                       │                      │
│                                       ▼                      │
│                         ┌──────────────────────────┐        │
│                         │  insights_breakdowns     │        │
│                         │  (segmentações)          │        │
│                         └──────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Fluxo de Dados

### Por que "Raw → Processed"?

Seguimos o mesmo padrão dos **webhooks GHL** (`webhooks_ghl` → `contatos`/`oportunidades`):

1. **Preservação** - Temos sempre a fonte original da Meta
2. **Reprocessamento** - Se der erro no processamento, reprocessamos do raw
3. **Auditoria** - Podemos verificar exatamente o que a API retornou
4. **Debug** - Facilita identificar problemas

---

## 📊 Tabelas Criadas

| Tabela | Função | Dados |
|--------|--------|-------|
| `meta_ads_raw_insights` | Fonte de verdade | JSON completo da API |
| `meta_ads_campaigns` | Metadados | Nome, status, orçamento, objetivo |
| `meta_ads_insights` | Métricas | Spend, impressões, cliques, conversões |
| `meta_ads_insights_breakdowns` | Segmentações | Age, gender, country, region, device, platform |
| `meta_ads_region_mapping` | Mapeamento geográfico | Nome da região Meta → UF → região brasileira |
| `meta_ads_sync_log` | Monitoramento | Sucesso/erro de cada execução |

---

## ⚙️ Configuração

### Variáveis de Ambiente (.env.local)

```bash
# Meta Marketing API
META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_ACCESS_TOKEN=EAAG... (token longo)
META_AD_ACCOUNT_ID=act_716772443330289
```

### Permissões Necessárias

- `ads_read` - Ler dados de anúncios (obrigatória)

---

## 🚀 Como Testar

```bash
# Testar conexão
curl -G \
  -d "access_token=SEU_TOKEN" \
  -d "fields=id,name" \
  "https://graph.facebook.com/v18.0/act_SUA_CONTA"

# Testar insights
curl -G \
  -d "access_token=SEU_TOKEN" \
  -d "fields=campaign_name,spend,impressions" \
  -d "level=campaign" \
  -d "date_preset=today" \
  "https://graph.facebook.com/v18.0/act_SUA_CONTA/insights"
```

---

## 🌍 Breakdown por Região (Estado)

> Adicionado em: 2026-06-18

A partir de agora é possível extrair o investimento da Meta Ads detalhado por **região** (estado brasileiro). Isso permite calcular CPV, ROAS e ROAS CAIXA reais por região, cruzando com as vendas do CRM.

### Como funciona

1. A edge function `sync-meta-ads` aceita um parâmetro opcional `breakdowns` no body.
2. Quando `breakdowns` inclui `country` e/ou `region`, a Meta API devolve uma linha por estado.
3. A edge function salva o JSON bruto normalmente em `meta_ads_raw_insights`.
4. Uma função dedicada no banco (`processar_meta_ads_raw_region_breakdown`) agrega os totais por anúncio/dia e insere os detalhes por região em `meta_ads_insights_breakdowns`.
5. O sync padrão de hora em hora **não usa breakdown** e continua funcionando exatamente igual.

### Chamada de exemplo

```bash
# Sync de 1 dia com breakdown por região
curl -X POST https://<projeto>.supabase.co/functions/v1/sync-meta-ads \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "time_range": {
      "since": "2026-06-01",
      "until": "2026-06-01"
    },
    "breakdowns": ["country", "region"]
  }'
```

### Backfill histórico

Use a edge function `sync-meta-ads-backfill` para extrair dados antigos:

```bash
curl -X POST https://<projeto>.supabase.co/functions/v1/sync-meta-ads-backfill \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "data_inicio": "2025-11-01",
    "data_fim": "2026-06-18",
    "breakdowns": ["country", "region"],
    "max_dias": 30
  }'
```

### Tabelas envolvidas

| Tabela | Papel |
|--------|-------|
| `meta_ads_raw_insights` | Guarda o JSON bruto com as linhas por região |
| `meta_ads_insights` | Total agregado por anúncio/dia (protegido contra sobrescrita) |
| `meta_ads_insights_breakdowns` | Cada região com seu `spend`, `impressions`, `clicks`, `reach` |
| `meta_ads_region_mapping` | Mapeia o nome da região da Meta para UF e região brasileira |

### Segurança

- O sync padrão (cron horário) **não é afetado**.
- A função `processar_meta_ads_raw` ganhou uma guarda: se receber um raw com `breakdowns`, ela lança erro em vez de corromper os totais.
- Campos calculados/JSONB da tabela principal são preservados quando já existem.

---

## 🤖 Pergunte à Clara

> A partir de 2026-06-18, a Clara consegue responder análises completas de investimento e vendas por **região brasileira**.

### O que ela sabe responder

- "Quanto investimos e quanto vendemos por região em 2026?"
- "Qual região tem o melhor ROAS CAIXA?"
- "Qual o CPV do Sudeste no 2º trimestre?"
- "Compare ROAS por região no último trimestre"

### Como funciona

1. A Clara chama a tool `query_meta_ads_region`.
2. A tool executa a função `analisar_meta_ads_por_regiao(start_date, end_date)` no banco.
3. A função cruza:
   - **Investimento real** da Meta Ads (breakdown por estado, tabela `meta_ads_insights_breakdowns`)
   - **Vendas de tráfego pago** do CRM (`vendas_fechamento` filtradas por `utm_source` de tráfego pago)
4. Retorna: investimento, vendas, faturamento, entrada (caixa), CPV, ROAS e ROAS CAIXA por região.

### Limitações

- O investimento é por **localização de exibição do anúncio** (Meta), não necessariamente pelo endereço do comprador.
- Vendas são limitadas a leads de **tráfego pago** (utm_source nos sources configurados).
- Estados não mapeados ou ausentes aparecem como "Indefinido".

---

## 📁 Pasta DECISOES

Decisões técnicas documentadas:
- [20250219-arquitetura-meta-ads-raw-first.md](./DECISOES/)

---

## 🔗 Links Úteis

- [Documentação oficial Meta Marketing API](https://developers.facebook.com/docs/marketing-api/)
- [Insights API Reference](https://developers.facebook.com/docs/marketing-api/insights/)
- [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
- Documentação geral: `docs/APIS-DOCS/meta-marketing-api.md`
- Roadmap completo: `docs/ROADMAP.md` (seção Meta Ads)

---

*Documentação criada em: 2026-02-19*  
*Última atualização: 2026-06-18*