# Auditoria do Painel Cohort de Tráfego

**Data da auditoria:** 2026-03-23 14:12 BRT

## Escopo

Revisão estática da lógica real do painel em:

- `eb-dash2/src/hooks/useTrafego.ts`
- `eb-dash2/src/hooks/useCohort.ts`
- `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
- `eb-dash2/src/lib/utils/dates.ts`
- `docs/PAINEL-TRAFEGO-PAGO.md`
- `docs/CONCEITOS-NEGOCIO.md`
- `docs/ANALISE-COHORT-MARCO-VS-GABARITO-MQLS.md`

## Resposta curta

**Nao.**

O painel **nao esta conceitualmente quebrado**. A logica central de cohort esta alinhada com a regra de negocio atual. Mas **nao e correto chamar de "funciona perfeitamente"** porque ainda existem riscos tecnicos conhecidos e falta cobertura automatizada.

## Atualizacao da branch (2026-03-23 14:53 BRT)

Depois da auditoria inicial, esta branch recebeu as 2 correcoes de hardening que estavam pendentes:

1. a paginacao de `oportunidades` agora usa ordenacao deterministica por `data_lead_recebido` + `id`
2. o filtro `Campanha Meta` agora tem comportamento explicito quando falta mapeamento em `utm_campaigns`: o cohort e zerado por seguranca e a UI mostra aviso

Leitura pratica:

- **na base auditada inicialmente:** nao dava para chamar de "perfeito"
- **nesta branch corrigida:** os 2 riscos logicos identificados na auditoria foram tratados
- **risco remanescente:** ainda faltam testes automatizados protegendo essa regra

## O que esta correto hoje

### 1. O filtro principal do cohort usa a data certa

O painel filtra por `oportunidades.data_lead_recebido`, que e a data de geracao do lead, e nao por data do evento comercial.

- `useTrafego.ts` monta `startISO` e `endISO` com offset de Sao Paulo
- a query principal usa `.gte('data_lead_recebido', startISO)` e `.lte('data_lead_recebido', endISO)`

Isso esta alinhado com a definicao de **COHORT** em `docs/CONCEITOS-NEGOCIO.md`.

### 2. Recuperacao continua fora das contagens

O painel exclui `pipeline_id = PIPELINE_RECUPERACAO_ID`, evitando misturar reativacao de lead antigo com lead novo.

### 3. O filtro de trafego pago esta coerente com a regra atual

Depois de carregar as oportunidades do periodo, o hook mantem apenas contatos cujo `utm_source` existe em `utm_sources`.

Leitura pratica:

- se o lead nao estiver numa fonte paga cadastrada, ele nao entra no painel
- se `utm_sources` estiver vazia, o hook cai no fallback e nao filtra

### 4. MQL esta sendo calculado por tag, nao por pipeline

O helper `isMqlByTag()` verifica a tag `mql` em `contatos.tags`.

Isso esta correto e alinhado com:

- `docs/CONCEITOS-NEGOCIO.md`
- `CLAUDE.md`
- `docs/ANALISE-COHORT-MARCO-VS-GABARITO-MQLS.md`

### 5. O agrupamento mensal do cohort respeita timezone

`useCohort.ts` usa `tsToSPDate()` antes de extrair o mes.

Isso evita o erro classico de:

- lead criado perto de `00:00Z`
- cair no dia anterior em Sao Paulo
- ser agrupado no mes errado

### 6. O faturamento segue modelo cohort

O hook busca `vendas_fechamento` a partir da data inicial do periodo, sem limite superior, e depois filtra pelos IDs das oportunidades do cohort.

Leitura pratica:

- um lead de janeiro que fecha em marco continua pertencendo ao cohort de janeiro
- isso e comportamento esperado para analise de cohort

## O que impede dizer que esta "perfeito"

### 1. Paginacao de oportunidades ainda nao esta deterministicamente segura

O hook pagina `oportunidades` com `.range()` e ordena apenas por `data_lead_recebido`.

Risco:

- se muitas oportunidades tiverem o mesmo timestamp
- o banco pode devolver empates em ordem nao deterministica entre paginas
- resultado possivel: pular ou duplicar linhas silenciosamente em periodos grandes

Isso contradiz a propria regra operacional registrada em `CLAUDE.md`, que exige ordenacao deterministica quando ha paginacao.

**Importante:** isso nao prova que o painel esteja errando hoje em todos os casos. Significa que a implementacao atual ainda tem uma fragilidade real.

### 2. O filtro `Campanha Meta` pode desalinha o spend do cohort

O comportamento atual e:

- `meta_ads_insights` filtra direto por `campaign_name`
- os leads do CRM so filtram se existir mapeamento correspondente em `utm_campaigns`
- se nao existir mapeamento, o hook mantem todos os leads

Risco:

- investimento filtrado
- cohort nao filtrado na mesma proporcao
- custo por MQL, ROAS e leitura da matriz ficam enviesados

Isso nao quebra o painel inteiro, mas impede chamar a leitura de "perfeita" quando esse caso ocorre.

### 3. A documentacao antiga do painel estava parcialmente divergente da logica real

Antes desta auditoria, `docs/PAINEL-TRAFEGO-PAGO.md` ainda citava MQL por pipeline em trechos importantes.

O codigo real usa **tag**.

Quando a documentacao e o codigo divergem, a manutencao futura fica mais arriscada mesmo que o comportamento atual esteja certo.

### 4. Nao ha testes automatizados para proteger essa regra

Nao foram encontrados testes de `useTrafego` ou `useCohort`.

Consequencia:

- a confianca hoje depende de leitura manual
- regressao futura pode passar despercebida

## Conclusao operacional

Hoje a descricao mais honesta e:

> O painel cohort de trafego **funciona bem nas regras centrais**, mas **nao deve ser tratado como perfeito**.

Estado atual:

- regra de negocio central: **coerente**
- timezone do cohort: **coerente**
- MQL por tag: **correto**
- faturamento cohort: **correto**
- robustez tecnica total: **ainda nao**

## Recomendacoes seguras

### Prioridade 1

Corrigir a paginacao de `oportunidades` para usar ordenacao deterministica por chave unica junto com `data_lead_recebido`.

### Prioridade 2

Definir comportamento explicito para `Campanha Meta` sem mapeamento em `utm_campaigns`.

Opcoes validas:

- zerar leads tambem
- mostrar aviso de desalinhamento
- bloquear a combinacao de filtro enquanto nao houver mapeamento

### Prioridade 3

Criar testes unitarios minimos para:

- `isMqlByTag()`
- filtro cohort por `data_lead_recebido`
- agrupamento mensal com timezone SP
- fallback de `Campanha Meta`

## O que NAO foi feito nesta auditoria

- nao houve alteracao de codigo de producao
- nao houve migration
- nao houve mudanca de comportamento do painel

Decisao intencional: como o painel esta operacional e o pedido foi de auditoria/documentacao com cuidado, a mudanca segura nesta etapa foi **documentar com precisao antes de mexer na logica**.
