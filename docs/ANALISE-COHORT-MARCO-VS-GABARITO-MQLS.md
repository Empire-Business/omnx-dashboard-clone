# Analise: Cohort de Marco vs Gabarito MQLs

**Data da analise:** 2026-03-20 15:33 BRT

## Fontes usadas

- `gabarito-mqls/leads marco.csv`
- `eb-dash2/src/hooks/useTrafego.ts`
- tabelas `oportunidades`, `contatos` e `utm_sources` no Supabase

## Resumo executivo

O numero do painel **nao bate** com o CSV porque as duas fontes estao medindo coisas diferentes:

- o **CSV** mede preenchimentos de formulario
- o **painel cohort** mede **oportunidades pagas** cuja `data_lead_recebido` caiu no periodo, excluindo Recuperacao e mantendo apenas `utm_source` paga cadastrada em `utm_sources`

Os numeros fechados ficaram assim:

| Visao | Regra | Total |
|---|---|---:|
| CSV bruto | linhas do arquivo | 175 |
| CSV deduplicado | emails unicos | 169 |
| Painel 01/03 a 19/03 | oportunidades pagas | 156 |
| Painel 01/03 a 19/03 | emails unicos | 153 |
| Painel 01/03 a 20/03 | oportunidades pagas | 165 |
| Painel 01/03 a 20/03 | emails unicos | 162 |
| Painel 01/03 a 20/03 | oportunidades MQL por tag | 54 |

Leitura pratica:

- se voce comparar **175 linhas do CSV** com **162 emails unicos do painel**, a diferenca aparente e `13`
- se voce primeiro limpar duplicidade do CSV, fica **169 vs 162**, diferenca liquida de `7`
- essa diferenca liquida de `7` **nao e um unico bug**
- por baixo dela existem **19 emails do CSV que nao entram no painel** e **12 emails do painel que nao estao no CSV**

## Como o painel realmente conta

O painel de trafego usa a logica real do hook `useTrafego.ts`:

1. filtra `oportunidades.data_lead_recebido` pelo periodo
2. exclui `pipeline_id = 'Sn1Guqcm6zwZNTVOOf5L'` (Recuperacao)
3. mantem so trafego pago, isto e, `contatos.utm_source` presente em `utm_sources`
4. conta leads por **oportunidade/cohort**, nao por contato e nao por envio de formulario
5. quando o filtro MQL esta ativo, usa **tag `mql` em `contatos.tags`**, nao o pipeline

Em portugues simples:

- **formulario preenchido em marco** nao significa automaticamente **lead novo do cohort de marco**
- se a pessoa ja existia e o CRM manteve a oportunidade antiga, o painel vai continuar olhando para a `data_lead_recebido` antiga
- se em marco so apareceu oportunidade em **Recuperacao**, o painel nao conta
- se o contato existe sem oportunidade, o painel nao conta
- se o email chegou diferente no banco, a reconciliacao por email quebra

## O que explica a diferenca

### 1. O CSV tem duplicidade interna

Duplicidades encontradas no arquivo:

- `jadson.santana@lidderacont.com.br`: 2 linhas
- `lica.cavalcabti@gmail.com`: 2 linhas
- `mikaelysl466@gmail.com`: 5 linhas

So aqui o CSV bruto ja fica **6 linhas acima** do numero de emails unicos.

### 2. O CSV manual vai ate 19/03, mas o painel visto em 20/03 ja inclui o dia 20

Essa foi a principal causa do bloco de extras do painel:

- entre `01/03` e `19/03`, o painel tem `153` emails unicos
- entre `01/03` e `20/03`, o painel sobe para `162`

Ou seja:

- **9 leads entraram no painel em 20/03/2026**
- esses 9 nao aparecem no CSV manual entregue
- isso sozinho ja explica boa parte da sensacao de que o painel "tem lead a mais"

### 3. Mesmo alinhando a janela ate 19/03, ainda sobram 16 divergencias estruturais

Quando voce tira o efeito do dia 20, a diferenca que sobra nao e de data. Ela e de regra de negocio/qualidade de dado:

- `13` casos: contato existe, mas a oportunidade ligada a ele e antiga e ficou fora do cohort de marco
- `2` casos: contato existe, mas nao existe oportunidade
- `1` caso: em marco so houve oportunidade em Recuperacao, que o painel exclui

### 4. Ha tambem divergencia de email entre CSV e banco

Foram encontrados **3 casos claros** em que o mesmo nome existe dos dois lados, mas com email diferente:

- `Bruno Saraiva`: CSV `bsaraiva@gmail.com` vs banco `bsaraiva@gmail.combsaraiva`
- `Maria Clara Antunes`: CSV `mariaclara@antungestao.com` vs banco `mariaclara@antungestao.commariaclaramariaclara`
- `Victor Gimenez`: CSV `victor@construcode.com.br` vs banco `victor@construcode.com`

Esses casos baguncam a reconciliacao por email e fazem o mesmo lead parecer:

- **faltando** quando voce olha o CSV
- e ao mesmo tempo **extra** quando voce olha o painel

## Lista nominal dos casos problematicos

## A. Esta no CSV, mas nao entra no painel

### A1. Divergencia de email

- `Bruno Saraiva <bsaraiva@gmail.com>`: no banco existe como `bsaraiva@gmail.combsaraiva`; o contato tem `utm_source = iads-28`, tag `mql` e oportunidade em `2026-02-01`, entao nem o email bate, nem a oportunidade cai no cohort de marco.
- `Maria Clara Antunes <mariaclara@antungestao.com>`: no banco existe como `mariaclara@antungestao.commariaclaramariaclara`; a oportunidade valida do painel entrou em `2026-03-12`, mas com o email errado no banco.
- `Victor Gimenez <victor@construcode.com.br>`: no banco existe como `victor@construcode.com`; a oportunidade entrou em `2026-03-13`, mas com o email diferente.

### A2. Contato existe, mas a oportunidade e antiga e ficou fora do cohort de marco

- `Daniel <ceo@camisetasem12horas.com.br>`: oportunidade em `2026-01-24`, pipeline `Pre-Vendas nMQL`.
- `Ruan Diego <contato@dnhair.com.br>`: oportunidade em `2025-12-23`, pipeline `Pre-Vendas MQL`.
- `Luiz Roberto Saraiva <contato@luizrobertosaraiva.com>`: oportunidade em `2026-02-15`, pipeline `Pre-Vendas nMQL`.
- `Davi Laranjeira <davi@laranjeiracafe.com.br>`: oportunidade em `2025-11-11`, pipeline `Pre-Vendas MQL`.
- `Sandro ferraz <ferraz.med@gmail.com>`: oportunidade em `2025-12-28`, pipeline `Pre-Vendas MQL`; no banco o `utm_source` esta como `iorg-9`, diferente do `iads-28` do CSV.
- `Johnny Lima <j.carlosdeloma@jmlima.com.br>`: oportunidade em `2025-12-17`, pipeline `Pre-Vendas MQL`.
- `Joao Galdino <joao@genesisz.net>`: oportunidade em `2025-11-16`, pipeline `Pre-Vendas nMQL`.
- `Luan azevedo <luan.azevedo@dsmarketing.com.br>`: oportunidade em `2025-11-11`, pipeline `Vendas SQL`.
- `Marcos Antonio dos Santos <marcosrenascere@gmail.com>`: oportunidade em `2025-12-19`, pipeline `Pre-Vendas nMQL`.
- `Moises Nery dos Santos <moises.nery@trademaster.com.br>`: oportunidade em `2026-02-04`, pipeline `Pre-Vendas nMQL`.
- `Paulo Morera <paulomorera.digital@gmail.com>`: oportunidade em `2026-01-21`, pipeline `Vendas SQL`.
- `Ricardo Agripino <ricardo.fagripino01@gmail.com>`: oportunidade em `2026-01-25`, pipeline `Pre-Vendas nMQL`.
- `Sandro Mendes <sandroconsultor@icloud.com>`: oportunidade em `2025-11-11`, pipeline `Pre-Vendas nMQL`.

Interpretacao desses 13 casos:

- o formulario foi preenchido em marco
- mas o CRM nao criou uma nova oportunidade de marco para o cohort
- na pratica, o contato ficou amarrado a uma oportunidade antiga

### A3. Contato existe, mas sem oportunidade

- `Vanessa da Silva <lucianoaguinaldo7@gmail.com>`: contato existe, `utm_source = iads-1`, mas nao ha oportunidade associada.
- `Melquesedek william lemos <melque@pnde.com.br>`: contato existe, `utm_source = iads-32`, tag `mql`, mas nao ha oportunidade associada.

Aqui a explicacao e objetiva:

- o painel cohort conta **oportunidades**
- contato sem oportunidade nao entra

### A4. Em marco so houve Recuperacao, que o painel exclui

- `Neir Junior <neirjr@yahoo.com.br>`: existe uma oportunidade antiga em `2025-11-11` e uma nova em `2026-03-06`, mas a de marco caiu no pipeline `Recuperacao`, que o painel exclui por regra.

## B. Esta no painel, mas nao esta no CSV manual

### B1. Leads que entraram no painel em 20/03/2026

Esses 9 casos parecem "lead a mais" no painel, mas na verdade sao **leads do dia 20** que nao estavam no CSV manual:

- `Andre Alcalde <andre@trinomiovarejo.com.br>`: entrou no painel em `2026-03-20`.
- `Ederson Fernando Rodrigues <fernando@gasparinirodrigues.com.br>`: entrou no painel em `2026-03-20`.
- `Gustavo Machado Souza Faria <gustavomachado@orientefarma.com.br>`: entrou no painel em `2026-03-20`.
- `Kairam Cabral <kairam@kairamcabral.com.br>`: entrou no painel em `2026-03-20`.
- `Kenedi Araujo da costa junior <kenediacjr2511@gmail.com>`: entrou no painel em `2026-03-20`.
- `pedro pralong eiras <pedro.pralong@gmail.com>`: entrou no painel em `2026-03-20`.
- `Ricardo Monteiro <rmonteiro@unifuturo.edu.br>`: entrou no painel em `2026-03-20`.
- `Pedro Henrique Ponte Fragelli <souatmosphera@gmail.com>`: entrou no painel em `2026-03-20`.
- `Thiago Mota <thiagomotabrasilbr@gmail.com>`: entrou no painel em `2026-03-20`.

Esses 9 explicam exatamente a diferenca entre:

- `153` emails unicos no painel ate `19/03`
- `162` emails unicos no painel ate `20/03`

### B2. Leads que aparecem no painel com email divergente em relacao ao CSV

- `Maria Clara Antunes <mariaclara@antungestao.commariaclaramariaclara>`: no CSV o nome aparece como `mariaclara@antungestao.com`.
- `Victor Gimenez <victor@construcode.com>`: no CSV o nome aparece como `victor@construcode.com.br`.
- `teste <teste@hotmail.comlll>`: no CSV existe `teste@hotmail.com`; no painel/banco existe `teste@hotmail.comlll`, com oportunidade em `2026-03-12`.

O caso `teste` merece observacao especial:

- e um lead claramente de teste
- tecnicamente ele entra no painel porque existe oportunidade paga no periodo
- se voce quiser uma visao "so leads reais", vale considerar esse email como ruido operacional

## Duplicidades do CSV

As linhas abaixo estao repetidas no CSV e precisam ser tratadas como um unico lead quando a comparacao e por email:

- `jadson.santana@lidderacont.com.br`: 2 ocorrencias
- `lica.cavalcabti@gmail.com`: 2 ocorrencias
- `mikaelysl466@gmail.com`: 5 ocorrencias

Sem essa limpeza, qualquer comparacao com o painel fica artificialmente inflada.

## Conclusao final

O painel **nao esta simplesmente "errado"**. O que acontece e isto:

1. o CSV mede **envios de formulario**
2. o painel mede **oportunidades pagas no cohort**
3. houve **6 duplicidades** no CSV
4. houve **9 leads do dia 20** que estavam no painel e nao no CSV manual
5. houve **3 divergencias de email**
6. houve **16 casos estruturais** em que o formulario de marco nao virou nova oportunidade valida para o cohort de marco

Em termos praticos, a diferenca e explicada por:

- duplicidade de formulario
- janela temporal diferente
- email sujo/divergente
- contato antigo reaproveitado sem nova oportunidade de marco
- contato sem oportunidade
- oportunidade nova apenas em Recuperacao

Se a pergunta for:

- **"quantos formularios foram preenchidos?"** -> o CSV e a fonte certa
- **"quantos novos leads pagos entraram no cohort do CRM?"** -> o painel e a fonte certa

Hoje essas duas respostas **nao podem ser comparadas como se fossem a mesma metrica**.
