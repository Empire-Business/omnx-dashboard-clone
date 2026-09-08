# Relatório Comparativo: Formulário GHL vs Painel de Tráfego

**Data da análise:** 2026-03-23  
**Período comparado:** 2026-03-01 a 2026-03-19  
**Objetivo:** identificar quais leads estão faltando no painel e quais estão faltando no formulário exportado do GHL.

## Fontes usadas

- `CLAUDE.md`
- `gabarito-mqls/leads marco.csv`
- `eb-dash2/src/hooks/useTrafego.ts`
- tabelas Supabase: `contatos`, `oportunidades`, `utm_sources`

## Metodologia usada

Eu reproduzi a lógica real do painel de tráfego do hook `useTrafego.ts`:

1. filtra `oportunidades.data_lead_recebido` entre `2026-03-01T00:00:00-03:00` e `2026-03-19T23:59:59-03:00`
2. exclui `pipeline_id = Sn1Guqcm6zwZNTVOOf5L` (`Recuperação`)
3. mantém apenas contatos cuja `utm_source` está cadastrada em `utm_sources`
4. compara o CSV por lead, usando email como chave principal e telefone/nome como reconciliação secundária

Importante:

- o **CSV** mede preenchimentos/export do formulário
- o **painel** mede **oportunidades pagas elegíveis no cohort**
- o painel conta **oportunidades**, não necessariamente pessoas únicas nem envios únicos de formulário

## Resumo executivo

O número do painel **157** foi reproduzido com a regra real do frontend.

| Visão | Critério | Total |
|---|---|---:|
| CSV bruto | linhas do arquivo | 175 |
| CSV deduplicado | leads únicos | 169 |
| Painel bruto | oportunidades elegíveis | 157 |
| Painel deduplicado | identidades únicas | 156 |
| Sobreposição exata | email/chave exata presente nos 2 lados | 149 |

Leitura prática:

- o CSV tem **6 linhas duplicadas**
- o painel tem **1 duplicidade interna**: `teste@hotmail.com` entrou com **2 oportunidades** no período, então o bruto fica `157`, mas as identidades únicas ficam `156`
- comparando por chave exata, existem:
  - **20 leads no CSV que não aparecem no painel**
  - **7 leads no painel que não aparecem no CSV**
- quando eu reconcilio os casos de **email sujo / email divergente / email nulo**, a divergência real cai para:
  - **15 leads realmente presentes no CSV e fora do painel**
  - **2 leads realmente presentes no painel e fora do CSV**

## O que mais explica a diferença

### 1. O CSV tem duplicidade interna

| Email | Ocorrências |
|---|---:|
| `mikaelysl466@gmail.com` | 5 |
| `jadson.santana@lidderacont.com.br` | 2 |
| `lica.cavalcabti@gmail.com` | 2 |

Essas duplicidades somam **6 linhas extras** no CSV bruto.

### 2. O painel está contando oportunidades, não apenas pessoas únicas

Houve **1 duplicidade interna no painel**:

| Lead | Observação |
|---|---|
| `teste@hotmail.com` | entrou com 2 oportunidades no período e foi contado 2 vezes no bruto |

Por isso:

- painel bruto = **157**
- painel por identidade = **156**

### 3. Não encontrei “lead do CSV totalmente perdido do banco”

Isso é importante para a investigação:

- **nenhum** lead do CSV caiu na categoria “não encontrado no banco”
- ou seja, o problema principal **não parece ser perda total de webhook**
- a divergência está concentrada em:
  - oportunidade antiga reaproveitada
  - pipeline excluído
  - `utm_source` fora da whitelist paga
  - contato sem oportunidade
  - email/identificador corrompido
  - escopo diferente entre export do formulário e escopo do painel

## A. Leads do formulário que não entram no painel

### A1. Casos realmente fora do painel depois da reconciliação

Esses são os casos que continuam faltando mesmo depois de eu eliminar o ruído de email divergente.

| Nome | Email do CSV | Motivo principal | Evidência |
|---|---|---|---|
| Daniel | `ceo@camisetasem12horas.com.br` | oportunidade antiga | última opp em `2026-01-24`, pipeline `Pré-Vendas nMQL` |
| Ruan Diego | `contato@dnhair.com.br` | oportunidade antiga | última opp em `2025-12-23`, pipeline `Pré-Vendas MQL` |
| Luiz Roberto Saraiva | `contato@luizrobertosaraiva.com` | oportunidade antiga | última opp em `2026-02-15`, pipeline `Pré-Vendas nMQL` |
| Davi Laranjeira | `davi@laranjeiracafe.com.br` | oportunidade antiga | última opp em `2025-11-11`, pipeline `Pré-Vendas MQL` |
| Isake batista | `isakerapmaker@gmail.com` | `utm_source` fora da whitelist paga | CSV veio como `iads-32`, mas no banco o contato está com `utm_source = iorg-3` |
| Johnny Lima | `j.carlosdeloma@jmlima.com.br` | oportunidade antiga | última opp em `2025-12-17`, pipeline `Pré-Vendas MQL` |
| João Galdino | `joao@genesisz.net` | oportunidade antiga | última opp em `2025-11-16`, pipeline `Pré-Vendas nMQL` |
| Luan azevedo | `luan.azevedo@dsmarketing.com.br` | oportunidade antiga | última opp em `2025-11-11`, pipeline `Vendas SQL` |
| Marcos Antônio dos Santos | `marcosrenascere@gmail.com` | oportunidade antiga | última opp em `2025-12-19`, pipeline `Pré-Vendas nMQL` |
| Melquesedek william lemos | `melque@pnde.com.br` | contato sem oportunidade | contato existe com `utm_source = iads-32`, mas não há oportunidade |
| Moises Nery dos Santos | `moises.nery@trademaster.com.br` | oportunidade antiga | última opp em `2026-02-04`, pipeline `Pré-Vendas nMQL` |
| Neir Junior | `neirjr@yahoo.com.br` | só tem opp de março em `Recuperação` | opp nova em `2026-03-06`, mas no pipeline excluído |
| Paulo Morera | `paulomorera.digital@gmail.com` | oportunidade antiga | última opp em `2026-01-21`, pipeline `Vendas SQL` |
| Ricardo Agripino | `ricardo.fagripino01@gmail.com` | oportunidade antiga | última opp em `2026-01-25`, pipeline `Pré-Vendas nMQL` |
| Sandro Mendes | `sandroconsultor@icloud.com` | oportunidade antiga | última opp em `2025-11-11`, pipeline `Pré-Vendas nMQL` |

Leitura operacional desse bloco:

- **12 casos** são claramente **reenvio de formulário com oportunidade antiga**
- **1 caso** foi excluído porque a oportunidade de março caiu em `Recuperação`
- **1 caso** foi excluído porque a `utm_source` do contato foi parar fora da whitelist paga
- **1 caso** criou contato, mas não criou oportunidade

### A2. Casos com email/identificador divergente

Esses casos parecem “faltando” quando a comparação é por email exato, mas o telefone/nome mostra que o lead existe do outro lado.

| Nome | CSV | Painel / Banco | Observação |
|---|---|---|---|
| Sandro ferraz | `ferraz.med@gmail.com` | email `NULL`, mesmo telefone | está no painel em `2026-03-09` |
| Vanessa da Silva | `lucianoaguinaldo7@gmail.com` | email `NULL`, mesmo telefone | está no painel em `2026-03-17` |
| Maria Clara Antunes | `mariaclara@antungestao.com` | `mariaclara@antungestao.commariaclaramariaclara` | está no painel em `2026-03-12` |
| Victor Gimenez | `victor@construcode.com.br` | `victor@construcode.com` | está no painel em `2026-03-13` |
| Bruno Saraiva | `bsaraiva@gmail.com` | banco: `bsaraiva@gmail.combsaraiva` | além do email sujo, a opp válida é antiga (`2026-02-01`) |

Observação importante sobre o Bruno:

- ele tem **duplo problema**
- o email no banco está corrompido
- e, mesmo corrigindo o email, ele **não entraria no painel de março**, porque a oportunidade vinculada é de `2026-02-01`

## B. Leads do painel que não estão no CSV

### B1. Casos realmente ausentes no CSV exportado

Esses são os casos que permanecem no painel mesmo depois de eu descartar ruído de email divergente.

| Nome | Email no painel | Evidência | Hipótese mais forte |
|---|---|---|---|
| Ariane Marta | `ariane@brasct.com.br` | opp em `2026-03-15`, pipeline `Cami`, tags `lead cami start` / `[fn] low ticket`, `utm_source = iads-5` | o painel está incluindo lead de outro funil/formulário que não está nesse CSV |
| Ezekiel Santos | `zekadbs@gmail.com` | opp em `2026-03-10`, pipeline `Pré-Vendas nMQL`, tags `[fn] aplicação`, `utm_source = iads-28` | forte candidato a export incompleto do formulário, outra instância do form, ou lead criado fora desse CSV |

Observação:

- o caso **Ariane Marta** é o sinal mais forte de **escopo diferente** entre o CSV e o painel, porque ela está em um funil/pipeline (`Cami`) que foge do padrão da exportação analisada
- o caso **Ezekiel Santos** é mais sensível, porque ele parece pertencer ao mesmo universo de aplicação; esse é o caso que eu investigaria primeiro no GHL export

### B2. Casos que existem no CSV, mas com identificador sujo no painel

| Nome | Painel | CSV | Observação |
|---|---|---|---|
| Maria Clara Antunes | `mariaclara@antungestao.commariaclaramariaclara` | `mariaclara@antungestao.com` | mesmo telefone |
| Sandro ferraz | email `NULL` | `ferraz.med@gmail.com` | mesmo telefone |
| Vanessa da Silva | email `NULL` | `lucianoaguinaldo7@gmail.com` | mesmo telefone |
| Victor Gimenez | `victor@construcode.com` | `victor@construcode.com.br` | mesmo telefone |
| teste | `teste@hotmail.comlll` | `teste@hotmail.com` | lead claramente de teste / dado sujo |

## C. Causas prováveis dos problemas

### 1. Métricas diferentes

Essa é a causa estrutural mais importante.

- o CSV mede **envio/export de formulário**
- o painel mede **oportunidade paga elegível no cohort**

Então o simples fato de alguém preencher o formulário em março **não obriga** o painel a contar esse lead em março.

### 2. Reaproveitamento de contato/oportunidade antiga

Esse foi o maior bloco da divergência.

Quando o contato já existia e o CRM reaproveitou a oportunidade antiga:

- o formulário aparece no CSV em março
- mas a `data_lead_recebido` da oportunidade continua em janeiro, fevereiro ou até novembro/dezembro
- o painel de março não conta

Esse padrão explica **12 casos** diretamente.

### 3. Pipeline `Recuperação` excluído por regra

O painel explicitamente exclui `pipeline_id = Sn1Guqcm6zwZNTVOOf5L`.

Isso explica o caso:

- `Neir Junior`

### 4. `utm_source` mutada para fora da whitelist paga

O painel só mostra leads cujo `contatos.utm_source` existe em `utm_sources`.

Caso crítico:

- `Isake batista`
- no CSV ele veio com `iads-32`
- no banco o contato está com `utm_source = iorg-3`
- como `iorg-3` não é pago/cadastrado em `utm_sources`, o painel exclui

Isso aponta para investigação de:

- sobrescrita indevida de UTM
- reatribuição do contato
- contato antigo reaproveitado com source mais nova/mais velha

### 5. Contato sem oportunidade

Caso:

- `Melquesedek william lemos`

Isso normalmente indica um destes cenários:

- o contato foi criado, mas a automação de criação de oportunidade não disparou
- a oportunidade foi criada e não sincronizou
- a oportunidade foi removida/mesclada no GHL antes da sincronização

### 6. Email sujo, nulo ou concatenado

Esse foi o segundo maior bloco de ruído.

Padrões observados:

- email concatenado: `mariaclara@antungestao.commariaclaramariaclara`
- domínio truncado: `victor@construcode.com`
- email com lixo anexado: `bsaraiva@gmail.combsaraiva`
- email ausente no painel: `NULL`
- email de teste sujo: `teste@hotmail.comlll`

Esse tipo de sujeira faz o mesmo lead parecer:

- faltando no painel
- e, ao mesmo tempo, faltando no CSV

### 7. Escopo diferente entre o CSV exportado e o universo do painel

O painel inclui **qualquer oportunidade paga elegível**, desde que:

- esteja no período
- não esteja em `Recuperação`
- tenha `utm_source` paga cadastrada

Ele **não exige** que o lead venha exatamente do mesmo formulário exportado no CSV.

O caso mais evidente é:

- `Ariane Marta`
- pipeline `Cami`
- tags `lead cami start` / `[fn] low ticket`

Isso é um forte indício de que:

- o CSV analisado não cobre todo o universo de leads pagos que o painel mostra

### 8. Export incompleto ou origem paralela do mesmo funil

O caso mais suspeito aqui é:

- `Ezekiel Santos`

Porque ele:

- está no painel
- está em `Pré-Vendas nMQL`
- tem tags `[fn] aplicação`
- tem `utm_source = iads-28`

Ou seja, ele parece muito mais com “lead que deveria estar no CSV” do que o caso da Ariane.

### 9. Dados de teste contaminando a comparação

O nome `teste` apareceu com múltiplas variações:

- `teste@hotmail.com`
- `teste@hotmail.comlll`
- múltiplas oportunidades

Isso produz:

- ruído no bruto do painel
- divergência falsa de email
- distorção da comparação se o objetivo for “leads reais”

## D. Prioridade de investigação

Se eu fosse investigar agora no GHL, eu começaria nesta ordem:

1. **Ezekiel Santos**  
   Porque ele parece pertencer ao mesmo funil do CSV e mesmo assim não está na exportação.

2. **Isake batista**  
   Porque a troca de `iads-32` para `iorg-3` aponta problema de atribuição/overwrite de `utm_source`.

3. **Melquesedek william lemos**  
   Porque existe contato, mas não existe oportunidade.

4. **Bloco de email sujo**  
   `Bruno Saraiva`, `Maria Clara Antunes`, `Victor Gimenez`, `Sandro ferraz`, `Vanessa da Silva`, `teste`.

5. **Regra de reaproveitamento de oportunidade antiga**  
   Esse é o maior motivo da diferença estrutural e vale validar se o comportamento desejado do GHL é esse mesmo.

6. **Escopo do export do formulário**  
   Confirmar se o CSV vem:
   - de um único formulário
   - de uma única landing page
   - de um único funil
   - ou se o painel está propositalmente agregando mais origens pagas do que o export manual

## Conclusão final

O painel não está simplesmente “errado”, e o CSV também não está simplesmente “errado”. Hoje as duas fontes estão medindo universos parcialmente diferentes.

O diagnóstico consolidado ficou assim:

- **175** linhas no CSV
- **169** leads únicos no CSV
- **157** linhas no painel
- **156** identidades únicas no painel
- **149** batem por chave exata
- depois de reconciliar sujeira de identificador, sobram:
  - **15 leads realmente no formulário e fora do painel**
  - **2 leads realmente no painel e fora do CSV**

As causas reais observadas foram:

- reenvio de formulário com oportunidade antiga reaproveitada
- exclusão do pipeline `Recuperação`
- `utm_source` fora da whitelist paga
- contato sem oportunidade
- email nulo/sujo/concatenado
- escopo diferente entre export do formulário e escopo do painel
- ruído de dados de teste

Não alterei código. Este relatório foi gerado apenas para investigação operacional.
