# Decisão: Implementação Completa do Document_GHL.md

**Data:** 2026-02-19  
**Responsável:** Claude (AI)  
**Status:** Implementada  
**Referência:** `docs/Document_GHL.md`

---

## Contexto

O documento `Document_GHL.md` especifica todos os campos que devem ser extraídos dos webhooks GHL, organizados em:
- Campos de contato (atribuição, UTMs, SWOT, follow-ups, etc.)
- Campos de oportunidade (datas de follow-up, status, etc.)
- Campos de vendas/fechamento (dados do contrato)
- Comunicações (mensagens, ligações)
- Reuniões (agendamentos)

## Implementação Realizada

### 1. Alterações na Tabela `contatos`

**Colunas adicionadas (70+ campos):**

| Categoria | Campos |
|-----------|--------|
| **Atribuição** | ip, url, ad_id, gclid, ad_name, fbclid, gbraid, wbraid, referrer, ad_group_id, user_agent, fbc, fbp, ga_client_id, ga_session_id |
| **UTMs** | utm_source, utm_medium, utm_campaign, utm_term, utm_content, utm_keyword, utm_matchtype |
| **Meta Ads (tt_)** | tt_term, tt_medium, tt_source, tt_content, tt_campaign |
| **Identificação** | country, date_created, contact_type, contact_source, pipeline_id_contato, pipeline_name, pipeline_stage, location_id, location_name, timezone |
| **Owner/SDR** | owner_id, owner_name, owner_email, social_seller |
| **SWOT** | swot_forcas, swot_fraquezas, swot_oportunidades, swot_ameacas |
| **Análise** | id_analise, data_analise, link_analise, status_analise, situacao_atual, perfil_inteligente, como_nos_conheceu, possiveis_objecoes, preciso_ajuda_para, faturamento_anual |
| **Follow-ups** | follow_up_1 a follow_up_15 |
| **Comunicação** | comunicacao_veredito, comunicacao_erros_atuais, comunicacao_tendencia_mercado, analise_oferta_principal, banco_ideias_conteudo, canais_venda_recomendados, analise_gap_pontos_fracos, estudo_concorrentes, estrategia_antibrjection_scripts, plano_acao_passo_a_passo |
| **Outros** | primeiro_nome, ultimo_nome, hashtags, print_instagram, instagram_handle, descricao_negocio, tempo_usa_internet, investe_trafego, treinamento_marketing, super_heroi_favorito, disponibilidade_barra, tipo_empresa, plano_meta, obstaculos, visao_6_meses, situacao_investimentos |

### 2. Alterações na Tabela `oportunidades`

**Colunas adicionadas:**

| Categoria | Campos |
|-----------|--------|
| **Datas MQL** | data_mql_lead_recebido, data_mql_contato_1 a 8, data_mql_no_show, data_mql_conectado, data_mql_perdido, data_mql_qualificado, data_mql_reuniao_marcada |
| **Datas SQL** | data_sql_no_show, data_sql_perdido, data_sql_reuniao_agendada, data_sql_reuniao_realizada, data_sql_negociacao, data_sql_fechada |
| **Qualificação** | vendedor_closer, data_pendencias_preenchimento, data_ultima_atividade |
| **IA/Análise** | resumo_ia, percepcao_closer, lost_reason |
| **Outros** | opportunity_source, pipeline_name, data_criacao_contato |

**Regras de Fallback (conforme Document_GHL.md):**
- `data_mql_no_show`: fallback mqlno_show → sqlno_show → d_mqlno_show → d_sqlno_show
- `data_mql_contato_X`: fallback mqlcontatoX → d_mqlcontatoX
- `data_sql_reuniao_agendada`: fallback sqlreunio_agendada → d_sqlreunio_agendada → mqlreunio_marcada → d_mqlreunio_marcada

### 3. Nova Tabela: `vendas_fechamento`

**Motivação:** Separar dados do contrato da oportunidade (sugerido no Document_GHL.md)

**Colunas:**
- Relacionamento: `oportunidade_id` (FK), `contato_id` (FK)
- Contratante: `nome_contratante`, `cpf_cnpj_contratante`
- Endereço: `logradouro_rua_avenida`, `numero_endereco`, `complemento_endereco`, `bairro`, `municipio`, `estado_uf`, `cep`
- Venda: `produto_vendido`, `observacoes_venda`, `forma_pagamento`
- Valores: `valor_entrada`, `numero_parcelas`, `valor_parcela`, `valor_faturado` (calculado)
- Datas: `data_pagamento_entrada`, `data_venda`

**Cálculo automático:**
```sql
valor_faturado = valor_entrada + (numero_parcelas × valor_parcela)
```

### 4. Nova Tabela: `comunicacoes`

**Motivação:** Separar mensagens/ligações do contato (sugerido no Document_GHL.md)

**Colunas:**
- `contato_id` (FK)
- `tipo`: mensagem | ligacao | ai_conversation
- Mensagem: `mensagem_body`, `mensagem_subject`, `mensagem_attachments`
- AI: `ai_summary`, `ai_transcript`
- Ligação: `phone_call_from`, `phone_call_to`, `phone_call_duration`, `phone_call_from_city`, `phone_call_from_state`, `phone_call_answered_by_phone`, `phone_call_answered_by_name`, `phone_call_start_time`, `phone_call_end_time`, `phone_call_status`, `phone_call_dispositions`

### 5. Nova Tabela: `reunioes`

**Motivação:** Separar agendamentos do contato (sugerido no Document_GHL.md)

**Colunas:**
- `contato_id` (FK), `oportunidade_id` (FK)
- `ghl_appointment_id`
- `titulo`, `notas`
- `usuario_nome`, `usuario_email`
- `data_agendada`, `data_realizada`
- `status`: agendada | realizada | cancelada | no_show

### 6. Função de Extração Atualizada

**Arquivo:** Migration `atualizar_funcao_extracao_completa`

**Novos retornos:**
- contatos_inseridos
- contatos_atualizados
- oportunidades_inseridas
- oportunidades_atualizadas
- vendas_inseridas
- comunicacoes_inseridas
- reunioes_inseridas

**Processo:**
1. Extrai contatos com todos os novos campos
2. Extrai oportunidades com fallback de datas
3. Extrai vendas_fechamento quando houver dados
4. Extrai comunicações (mensagens, AI, ligações)
5. Extrai reuniões

## Estrutura do Banco Atual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            webhooks_ghl                                     │
│                         (JSON bruto - imutável)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼ TRIGGER
┌─────────────────────────────────────────────────────────────────────────────┐
│                         extrair_dados_ghl()                                 │
└─────────────────────────────────────────────────────────────────────────────┘
       │              │              │              │              │
       ▼              ▼              ▼              ▼              ▼
┌──────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────┐
│ contatos │  │oportunidades │  │vendas_        │  │comunicacoes  │  │reunioes  │
│  (1:N)   │◄─┤  (N por      │  │fechamento     │  │             │  │          │
│          │  │   contato)   │  │  (0-1 por     │  │  (N por      │  │ (N por   │
│          │  │              │  │  oportunidade)│  │  contato)    │  │ contato) │
└──────────┘  └──────────────┘  └───────────────┘  └──────────────┘  └──────────┘
```

## Mapeamento de Campos GHL → Colunas

### Contatos - Atribuição (com fallback)
```sql
ip = COALESCE(lastAttributionSource.ip, attributionSource.ip)
url = COALESCE(lastAttributionSource.url, attributionSource.url)
utm_source = COALESCE(root.utm_source, lastAttributionSource.utmSource)
```

### Oportunidades - Datas (com fallback)
```sql
data_mql_contato_1 = COALESCE(customData.{{opportunity.mqlcontato1}}, 
                              customData.{{ opportunity.d_mqlcontato1 }})
```

### Vendas - Extração condicional
```sql
-- Só insere se houver nome_contratante OU valor_entrada
WHERE customData.{{ opportunity.nome_contratante }} IS NOT NULL
   OR customData.{{opportunity.valor_a_ser_pago_de_entrada}} IS NOT NULL
```

## Testes Realizados

- ✅ Migration aplicada com sucesso
- ✅ Função criada sem erros
- ✅ Trigger automático continua ativo
- ✅ Todas as tabelas com RLS configurado

## Próximos Passos

1. Testar fluxo completo com webhook real
2. Verificar extração de todos os campos
3. Validar cálculo de valor_faturado
4. Documentar queries comuns

---

*Implementação concluída em 2026-02-19*
