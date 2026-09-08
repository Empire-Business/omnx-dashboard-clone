# Contrato de Webhook — CRM OMNX

> **Prioridade:** CRÍTICO — este documento é a receita oficial que qualquer conta do CRM OMNX precisa seguir para que os dados apareçam corretamente no painel Empire.
> **Versão do contrato:** 1.0 (2026-10-05)
> **Público:** você (o cliente) e a pessoa técnica que configura o webhook na sua conta do CRM OMNX.

---

## 1. Por que este documento existe

Antes, o sistema tentava **adivinhar** o que cada campo customizado da sua conta do CRM OMNX queria dizer. Isso não funcionava bem: numa conta nova, praticamente nenhum campo batia automaticamente, e alguém sempre precisava configurar tudo manualmente antes do painel funcionar de verdade.

A partir de agora, o caminho é o oposto: **o sistema publica exatamente os nomes de campo que espera receber** (este documento), e a conta do CRM OMNX é configurada para enviá-los com esses nomes exatos. Sem adivinhação — se o campo chegar no formato certo, ele funciona. Se você tiver um campo próprio que não está nesta lista, ele ainda assim é recebido e guardado (seção 6) — só não vira gráfico/métrica automaticamente.

**Resumo em uma frase:** o webhook do seu CRM OMNX precisa enviar os campos desta lista, com estes nomes exatos. Fora isso, qualquer campo extra que você tiver é aceito e guardado, mas fica de fora dos relatórios.

---

## 2. Como o envio funciona

- **Endpoint:** `https://<seu-projeto>.supabase.co/functions/v1/webhook-ghl` (a URL exata de cada conta fica disponível na tela **Configuração → Integração CRM OMNX** do painel).
- **Método:** sempre `POST`, corpo em JSON.
- **Autenticação:** um cabeçalho de segredo, para o sistema confirmar que o envio é realmente da sua conta.
- **Um evento por chamada.** Cada alteração relevante (novo lead, mudança de etapa, atualização de dados) deve gerar uma chamada separada ao webhook.
- **Resposta:** o sistema sempre responde rápido (HTTP 202) confirmando o recebimento. Se algum campo estiver fora do contrato, a resposta inclui um aviso (`warnings`) — isso nunca impede o recebimento do evento, é só um alerta para quem está configurando revisar.

### 2.1 Autenticação

Envie o segredo do webhook em um destes dois formatos (qualquer um funciona):

```
x-webhook-secret: <seu-segredo>
```

ou

```
Authorization: Bearer <seu-segredo>
```

O segredo é único por conta e fica disponível na tela de configuração da integração. **Nunca compartilhe esse segredo** — quem tiver acesso a ele pode enviar dados como se fosse sua conta.

### 2.2 Identificação da sua conta (`locationId`)

Todo evento precisa trazer o identificador da sua conta no CRM OMNX, em um destes três formatos (o sistema aceita qualquer um):

```json
{ "locationId": "abc123" }
{ "location": { "id": "abc123" } }
{ "location_id": "abc123" }
```

Sem isso, o evento é recusado antes mesmo de checar o segredo — o sistema não tem como saber de qual conta o dado é.

### 2.3 Como testar antes de configurar de verdade

Antes de apontar o webhook oficial do CRM OMNX para o endpoint, teste com um `curl` simples para confirmar que o formato está certo:

```bash
curl -X POST "https://<seu-projeto>.supabase.co/functions/v1/webhook-ghl" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: <seu-segredo>" \
  -d '{
    "locationId": "abc123",
    "contact_id": "CT-0001",
    "email": "lead.teste@example.com",
    "full_name": "Lead de Teste",
    "phone": "+5511999999999"
  }'
```

Resposta esperada:

```json
{ "received": true }
```

Se algum campo obrigatório do contrato estiver faltando, a resposta traz também um array `warnings` explicando o que revisar — sem expor nenhum detalhe técnico interno do sistema, só uma referência a este documento.

---

## 3. Identificadores — obrigatórios em todo evento

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `contact_id` | texto | **Sim**, em qualquer evento de contato/lead | ID único do contato na sua conta do CRM OMNX. Sem ele, o contato não é criado nem atualizado. |
| `id` | texto | **Sim**, em qualquer evento de oportunidade/negócio | ID único da oportunidade (negócio/lead no funil) na sua conta. Sem ele, a oportunidade não é criada nem atualizada. |

> Todo evento precisa trazer pelo menos um dos dois. Eventos de mensagem (WhatsApp, e-mail, etc., identificados por `conversationId` ou `type`) são a única exceção — eles têm seu próprio fluxo de identificação.

---

## 4. Campos de Contato

Estes campos alimentam a ficha do lead/contato no painel. Nomes à esquerda são os que o webhook deve enviar (nível raiz do JSON, exceto onde indicado).

| Campo no payload | Tipo | Formato/exemplo | Obrigatório | Observação |
|---|---|---|---|---|
| `contact_id` | texto | `"CT-0001"` | **Sim** | Identificador único e estável do contato |
| `full_name` | texto | `"Maria Silva"` | Recomendado | Se ausente, o sistema usa e-mail ou telefone como nome provisório |
| `email` | texto | `"maria@exemplo.com"` | Recomendado | |
| `phone` | texto | `"+5511988887777"` | Recomendado | Formato internacional recomendado |
| `first_name` | texto | `"Maria"` | Opcional | |
| `last_name` | texto | `"Silva"` | Opcional | |
| `date_created` | data/hora ISO 8601 | `"2026-10-05T14:30:00-03:00"` | Opcional | Data de criação do contato na sua conta |
| `contact_type` | texto | `"lead"` | Opcional | |
| `contact_source` | texto | `"formulário site"` | Opcional | |
| `pipeline_id` | texto | `"pipe-001"` | Opcional | Pipeline em que o contato está (nível contato, diferente do pipeline da oportunidade) |
| `pipeline_name` | texto | `"Pré-Vendas"` | Opcional | |
| `Owner ID` | texto | `"user-123"` | Opcional | ID interno do responsável pelo contato |
| `owner` | texto | `"João Closer"` | Opcional | Nome do responsável — usado como fallback de SDR quando o vínculo por oportunidade ainda não sincronizou |
| `E-mail Owner` | texto | `"joao@empresa.com"` | Opcional | |
| `country` | texto | `"BR"` | Opcional | |
| `tags` | lista de texto | `["mql", "sql", "[fn] webinar"]` | Opcional | Usada para classificação de MQL — a tag `"mql"` (minúscula, sem acento) marca o lead como MQL |

### 4.1 Atribuição de tráfego (UTM / TikTok)

Campos usados para saber de onde veio o lead. Podem vir no nível raiz **ou** dentro de `lastAttributionSource`/`attributionSource` (o sistema tenta os dois automaticamente).

| Campo | Tipo | Exemplo |
|---|---|---|
| `utm_source` | texto | `"facebook"` |
| `utm_medium` | texto | `"cpc"` |
| `utm_campaign` | texto | `"lancamento-outubro"` |
| `utm_term` | texto | `"consultoria+alto+ticket"` |
| `utm_content` | texto | `"criativo-03"` |
| `tt_source`, `tt_medium`, `tt_term`, `tt_content` | texto | equivalentes para campanhas TikTok |
| `fbclid` | texto | ID de clique do Facebook Ads (atribuição) |
| `ip` | texto | IP de origem do lead |
| `url` | texto | URL da página onde o lead converteu |

Todos opcionais, mas **fortemente recomendados** para quem usa tráfego pago — sem eles, o painel de Aquisição/Tráfego não consegue atribuir o lead a uma campanha.

---

## 5. Campos de Oportunidade (negócio/lead no funil)

Estes campos alimentam o funil comercial. `id` é o identificador da oportunidade; os demais campos com prefixo `{{opportunity.x}}` vão dentro de `customData` no payload (é assim que o CRM OMNX envia campos customizados de oportunidade).

### 5.1 Identificação e metadados

| Campo no payload | Tipo | Exemplo | Obrigatório |
|---|---|---|---|
| `id` | texto | `"OPP-0001"` | **Sim** |
| `contact_id` | texto | `"CT-0001"` | **Sim** (vincula a oportunidade ao contato) |
| `opportunity_name` | texto | `"Maria Silva — Consultoria Premium"` | Recomendado |
| `lead_value` | número decimal | `15000.00` | Opcional |
| `status` | texto | `"open"` / `"won"` / `"lost"` | Recomendado |
| `pipeline_id` | texto | `"pipe-vendas"` | Recomendado |
| `pipleline_stage` *(sic — grafia herdada do CRM)* | texto | `"stage-negociacao"` | Opcional |
| `pipeline_name` | texto | `"Vendas"` | Recomendado |
| `date_created` | data/hora ISO 8601 | `"2026-10-05T14:30:00-03:00"` | Opcional |

### 5.2 Campos customizados de texto (dentro de `customData`)

| Chave em `customData` | Tipo | Vira | Observação |
|---|---|---|---|
| `{{opportunity.source}}` | texto | origem da oportunidade | |
| `{{opportunity.assignedToUsersName}}` | texto | vendedor/closer responsável | |
| `{{opportunity.lost_reason}}` | texto | motivo de perda | |
| `{{opportunity.resumo_ia}}` | texto | resumo gerado por IA (se aplicável) | |
| `{{opportunity.percepo_do_closer}}` *(sic, sem acento)* | texto | percepção registrada pelo closer | |
| `{{opportunity.ltima_atividade}}` *(sic, sem acento)* | data/hora | data da última atividade registrada | |

### 5.3 Datas do funil (dentro de `customData`)

Todas as datas abaixo aceitam os formatos `AAAA-MM-DD`, `AAAA-MM-DDTHH:MM:SS±HH:MM` ou `DD/MM/AAAA`.

| Chave em `customData` | Vira no painel |
|---|---|
| `{{opportunity.mqlcontato1}}` até `{{opportunity.mqlcontato8}}` | Tentativas de contato 1 a 8 |
| `{{opportunity.mqlno_show}}` | No-show (pré-vendas) |
| `{{opportunity.mqlconectado}}` | Data em que o lead foi conectado |
| `{{opportunity.mqlperdido}}` | Data de perda (pré-vendas) |
| `{{opportunity.mqlqualificado}}` | Data de qualificação |
| `{{opportunity.sqlpendencias_preenchimento}}` | Pendências de preenchimento (vendas) |
| `{{opportunity.sqlno_show}}` | No-show (vendas) |
| `{{opportunity.sqlperdida}}` | Data de perda (vendas) |
| `{{opportunity.data_da_reunio_realizada}}` | Reunião de vendas realizada |
| `{{opportunity.sqlnegociao}}` | Data de entrada em negociação |
| `{{opportunity.sqlfechada}}` | Data de fechamento |
| `{{opportunity.reuniao_realizada}}` | Reunião realizada (uso geral) |
| `{{opportunity.mqlauto_agendamento}}` | Auto-agendamento |

> **Importante — variações de chave aceitas:** para cada campo acima, o sistema também aceita a variação com prefixo `d_` (ex.: `{{opportunity.d_mqlconectado}}`) e a variação com/sem espaço interno (`{{ opportunity.x }}` ou `{{opportunity.x}}`) — não precisa se preocupar em acertar exatamente um dos dois formatos, os dois funcionam. A lista completa e literal de todas as variações reconhecidas está no **Anexo A**.

> **Nota de negócio:** uma vez que `data_conectado` (mqlconectado) é confirmada, um evento posterior sem esse campo **nunca apaga** a data já registrada — o sistema protege esse marco específico.

---

## 6. Campos de Venda Fechada (financeiro)

Estes campos só disparam a criação de um registro financeiro quando **pelo menos um** deles vem preenchido no mesmo evento. Todos vivem dentro de `customData`. **Atenção ao espaço interno da chave** — está marcado exatamente como o sistema espera (alguns têm espaço, outros não; isso é herdado do histórico da integração e não pode ser alterado sem quebrar contas já configuradas).

| Chave em `customData` (grafia exata) | Tipo | Vira |
|---|---|---|
| `{{opportunity.valor_a_ser_pago_de_entrada}}` | número decimal | Valor de entrada |
| `{{opportunity.numero_parcelas}}` | número inteiro | Número de parcelas |
| `{{opportunity.valor_parcela}}` | número decimal | Valor de cada parcela |
| `{{ opportunity.data_pagamento_entrada }}` | data/hora | Data de pagamento da entrada — **este é o campo que define se a venda conta como fechada no painel** |
| `{{ opportunity.nome_contratante }}` | texto | Nome do contratante |
| `{{ opportunity.cpf_ou_cnpj_do_contratante }}` | texto | CPF/CNPJ |
| `{{ opportunity.produto_que_foi_vendido }}` | texto | Produto vendido |
| `{{ opportunity.forma_de_pagamento }}` | texto | Forma de pagamento |
| `{{ opportunity.logradouro_rua_avenida }}` | texto | Endereço — rua/avenida |
| `{{ opportunity.numero_endereco }}` | texto | Endereço — número |
| `{{ opportunity.complemento_do_endereo }}` *(sic, sem "ç")* | texto | Endereço — complemento |
| `{{ opportunity.bairro }}` | texto | Bairro |
| `{{ opportunity.municipio }}` | texto | Município |
| `{{ opportunity.estado_uf }}` | texto | UF |
| `{{ opportunity.cep }}` | texto | CEP |
| `{{ opportunity.observacoes_venda }}` | texto | Observações |
| `{{opportunity.op_vencimentos_e_parcelas}}` | texto | Vencimentos e parcelas (texto livre) |
| `{{opportunity.op_link_do_contrato_assinado}}` | texto (URL) | Link do contrato assinado |
| `{{opportunity.data_da_assinatura_do_contrato}}` | data | Data de assinatura do contrato |
| `{{opportunity.link_da_gravao_da_call_de_vendas}}` *(sic, sem acentos)* | texto (URL) | Link da gravação da call de vendas |

> **Regra de negócio crítica:** uma oportunidade só aparece como **venda fechada** no painel quando `data_pagamento_entrada` está preenchida — mover a etapa para "Fechado" no CRM OMNX, sozinho, não é suficiente.

---

## 7. Campo de escape — dados extras fora do contrato

Você não precisa remover nenhum campo customizado próprio da sua conta antes de configurar o webhook. Qualquer campo dentro de `customData` que **não** esteja na lista das seções 5 e 6 (Anexo A) é automaticamente:

1. **Recebido e guardado** — nada é descartado.
2. Salvo no perfil da oportunidade, em um espaço reservado para "dados extras" (`custom_extra`).
3. Exibido de forma **passiva** na ficha do lead no painel — visível para quem consulta o lead, mas **nunca** entra em gráfico, funil, meta ou cálculo automático.

**Isso é automático — não precisa configurar nada.** Se no futuro você quiser que um desses campos extras vire uma métrica de verdade no painel, é um pedido de evolução do contrato (uma nova linha nas seções 5/6), não uma configuração no seu lado.

> O mesmo vale para campos de **contato** fora da lista da seção 4: eles podem ser capturados da mesma forma mediante um mapeamento simples feito pela nossa equipe (aba **Configuração → Mapeamento avançado**) — fale com o suporte se precisar disso para um campo específico de contato.

---

## 8. O que acontece se o webhook fugir do contrato

- **O evento nunca é perdido.** Mesmo que falte um campo esperado ou que existam campos fora da lista, o sistema sempre grava o evento recebido.
- **Aviso na hora do teste:** ao testar com `curl` (seção 2.3), a resposta inclui `warnings` quando faltar `contact_id`/`id`, ou quando `customData` trouxer campos fora do contrato — para você corrigir a configuração antes de ativar de vez.
- **Vigilância contínua:** o sistema mantém um registro interno (`webhook_contract_mismatches`) de toda vez que um evento real foge do contrato, e um alerta de contagem (`ghl_mapping_change_alerts`, já existente desde a auditoria de mapeamento de campos) quando o número de campos/pipelines da sua conta muda ao longo do tempo. As duas vigilâncias são complementares: uma olha o formato de cada evento individual; a outra olha a estrutura geral da conta ao longo do tempo. Nenhuma delas bloqueia o recebimento — só sinalizam para o time revisar. **Desde 2026-07-21, as duas aparecem como avisos no topo da tela Configuração → Integração CRM OMNX**, assim que há algo pendente — não é preciso consultar o banco para saber se uma conta está fugindo do contrato.
- **Este próprio documento está embutido no painel** (desde 2026-07-21): aba **Configuração → Integração CRM OMNX → Documentação**, sub-aba "Contrato de Webhook (leads/CRM)" — o conteúdo vem direto deste arquivo (`docs/CONTRATO-WEBHOOK-CRM.md`), então nunca fica desatualizado em relação ao que está aqui. Visível mesmo antes de conectar a chave GHL.

---

## 9. Compatibilidade — nada quebra para quem já está configurado

Este contrato **não remove nenhum campo** que o sistema já consumia antes — ele só documenta oficialmente, com nomes exatos, o que já estava em produção. A conta que já está enviando dados hoje continua funcionando exatamente como antes, sem precisar reconfigurar nada.

---

## Anexo A — Lista completa de chaves `customData` reconhecidas (todas as variações)

<details>
<summary>Clique para expandir a lista completa (56 chaves)</summary>

```
{{opportunity.mqlcontato1}}          {{opportunity.d_mqlcontato1}}
{{opportunity.mqlcontato2}}          {{opportunity.d_mqlcontato2}}
{{opportunity.mqlcontato3}}          {{opportunity.d_mqlcontato3}}
{{opportunity.mqlcontato4}}          {{opportunity.d_mqlcontato4}}
{{opportunity.mqlcontato5}}          {{opportunity.d_mqlcontato5}}
{{opportunity.mqlcontato6}}          {{opportunity.d_mqlcontato6}}
{{opportunity.mqlcontato7}}          {{opportunity.d_mqlcontato7}}
{{opportunity.mqlcontato8}}          {{opportunity.d_mqlcontato8}}
{{opportunity.mqlno_show}}           {{opportunity.d_mqlno_show}}
{{opportunity.mqlconectado}}         {{opportunity.d_mqlconectado}}
{{opportunity.mqlperdido}}           {{opportunity.d_mqlperdido}}
{{opportunity.mqlqualificado}}       {{opportunity.d_mqlqualificado}}
{{opportunity.mqlreunio_marcada}}    {{opportunity.d_mqlreunio_marcada}}
{{opportunity.sqlpendencias_preenchimento}}   {{opportunity.d__sqlpendencias_preenchimento}}
{{opportunity.sqlno_show}}           {{opportunity.d_sqlno_show}}
{{opportunity.sqlperdida}}           {{opportunity.d_sqlperdida}}
{{opportunity.sqlreunio_agendada}}   {{opportunity.d_sqlreunio_agendada}}
{{opportunity.sqlreunio_realizada}}  {{opportunity.d_sqlreunio_realizada}}
{{opportunity.data_da_reunio_realizada}}
{{opportunity.sqlnegociao}}          {{opportunity.d_sqlnegociao}}
{{opportunity.sqlfechada}}           {{opportunity.d_sqlfechada}}
{{opportunity.data_da_reunio}}       {{opportunity.d_data_da_reunio}}
{{opportunity.reuniao_realizada}}    {{opportunity.d_reuniao_realizada}}
{{opportunity.mqlauto_agendamento}}
{{opportunity.assignedToUsersName}}
{{opportunity.lost_reason}}
{{opportunity.resumo_ia}}
{{opportunity.percepo_do_closer}}
{{opportunity.ltima_atividade}}
{{opportunity.source}}
{{opportunity.valor_a_ser_pago_de_entrada}}
{{opportunity.numero_parcelas}}
{{opportunity.valor_parcela}}
{{opportunity.data_pagamento_entrada}}                (aceita com ou sem espaço interno)
{{opportunity.nome_contratante}}                      (aceita com ou sem espaço interno)
{{opportunity.cpf_ou_cnpj_do_contratante}}             (aceita com ou sem espaço interno)
{{opportunity.produto_que_foi_vendido}}                (aceita com ou sem espaço interno)
{{opportunity.forma_de_pagamento}}                     (aceita com ou sem espaço interno)
{{opportunity.logradouro_rua_avenida}}                 (aceita com ou sem espaço interno)
{{opportunity.numero_endereco}}                        (aceita com ou sem espaço interno)
{{opportunity.complemento_do_endereo}}                 (aceita com ou sem espaço interno)
{{opportunity.bairro}}                                 (aceita com ou sem espaço interno)
{{opportunity.municipio}}                              (aceita com ou sem espaço interno)
{{opportunity.estado_uf}}                              (aceita com ou sem espaço interno)
{{opportunity.cep}}                                    (aceita com ou sem espaço interno)
{{opportunity.observacoes_venda}}                      (aceita com ou sem espaço interno)
{{opportunity.op_vencimentos_e_parcelas}}
{{opportunity.op_link_do_contrato_assinado}}
{{opportunity.data_da_assinatura_do_contrato}}
{{opportunity.link_da_gravao_da_call_de_vendas}}
```

</details>

Esta lista é espelhada em código em dois lugares (se um mudar, o outro precisa mudar junto):
- `get_contract_known_customdata_keys()` — `supabase/migrations/20261006000001_contrato_webhook_campo_escape.sql`
- `KNOWN_CUSTOMDATA_KEYS` — `supabase/functions/_shared/webhook-ghl-contract.ts`

---

## Anexo B — Como um cliente novo é integrado agora ("a receita")

1. Ative a integração em **Configuração → Integração CRM OMNX** e copie a URL do webhook e o segredo.
2. Na sua conta do CRM OMNX, configure os campos customizados usando **exatamente** os nomes das seções 4, 5 e 6 deste documento (ou peça para quem administra a conta fazer isso).
3. Configure o webhook de saída do CRM OMNX apontando para a URL do passo 1, enviando o segredo no header `x-webhook-secret`.
4. Teste com o `curl` da seção 2.3 antes de ativar de verdade — confirme que a resposta não traz `warnings`.
5. Ative o disparo automático de eventos reais.
6. Acompanhe a tela **Configuração → Integração CRM OMNX** (quando um evento fugir do contrato, um aviso aparece no topo da página mostrando o quê e quando) — não é bloqueante, mas indica que algo precisa de ajuste na configuração da conta.

Não existe mais etapa de "descoberta automática + IA tentando adivinhar o mapeamento" como pré-requisito — ela continua disponível como ferramenta auxiliar (aba **Mapeamento avançado**) para casos em que você queira capturar um campo específico fora do contrato como métrica, mas deixou de ser o caminho padrão de integração.
