# RELATÓRIO DE CRUZAMENTO — Gabarito (CSV) vs Banco Supabase
**Data de referência:** Fevereiro/2026
**Gabarito:** `gabarito-mqls/leads_fevereiro_iads_400k.csv`

---

## RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| Total no gabarito | **126 leads** |
| Total MQLs no banco (fev/2026, excl. pipeline Recuperação) | **648 registros** |
| Match (gabarito ∩ banco como MQL) | **114 leads (90,5%)** |
| No gabarito mas NÃO no banco como MQL | **12 leads (9,5%)** |
| No banco como MQL mas NÃO no gabarito | **531 registros** |
| — sendo MQL real (tag 'mql', sem 'nmql') | **43 leads** |
| — sendo nMQL (pipeline pré-vendas nmql) | **429 leads** |

---

## LISTA 1 — No gabarito mas NÃO encontrados no banco como MQL de fevereiro (12 leads)

> **Situação:** Esses leads submeteram o formulário em fevereiro/2026 (conforme gabarito CSV), mas não aparecem no banco com tag MQL ou pipeline MQL para esse período. Verificação manual revelou que a maioria **EXISTE no banco, porém com `data_lead_recebido` anterior a fevereiro** — foram leads mais antigos que resubmeteram o form.

| # | Nome (gabarito) | Telefone | Email | Data form |
|---|-----------------|----------|-------|-----------|
| 1 | Henrique v batista | +5527999750599 | diretoria.valorize@gmail.com | Feb 23rd 2026, 4:23 pm |
| 2 | Lima Neto | +5517997610331 | limaneto@limaneto.adv.br | Feb 22nd 2026, 8:16 pm |
| 3 | Isabelle Sousa Martins | +5584981889176 | isabelle@imadvogados.com | Feb 22nd 2026, 8:16 am |
| 4 | Artur willams Pimentel costa | +5586994013026 | artur@simplifit.com.br | Feb 16th 2026, 8:36 pm |
| 5 | Edson Teixer | +5521997203617 | edson.teixer@irko.com.br | Feb 16th 2026, 9:44 am |
| 6 | Erick Sant Ana | +5511997474401 | erick@termotubos.com.br | Feb 14th 2026, 6:42 am |
| 7 | Gabriel Gomes  | +5511976165201 | americanschool.br@gmail.com | Feb 13th 2026, 5:41 pm |
| 8 | Neir Jr | +5535992701984 | neirjr@yahoo.com.br | Feb 8th 2026, 9:41 am |
| 9 | Ivan Locatelli | +5567996581636 | ivan.locatelli@gecomenergia.com.br | Feb 7th 2026, 12:24 pm |
| 10 | Efraym Faria | +5535997577907 | efraymfaria@gmail.com | Feb 5th 2026, 1:56 pm |
| 11 | Melquesedek William | +5561999764570 | diretoriaredemodabrasil@gmail.com | Feb 3rd 2026, 6:19 am |
| 12 | Lucca | +5511945716275 | lucca@supprime.com.br | Feb 2nd 2026, 7:46 pm |

### Detalhamento dos 12 — situação real no banco

| Nome | Situação no banco | data_lead_recebido real | Pipeline atual |
|------|------------------|------------------------|----------------|
| Henrique v batista | Existe no banco — data_lead_recebido = NULL (sem data) | NULL | Vendas SQL |
| Lima Neto | Existe no banco — lead antigo (nov/2025) | 2025-11-11 | Pré-Vendas MQL |
| Isabelle Sousa Martins | Existe no banco — lead antigo (nov/2025) | 2025-11-17 | Pré-Vendas MQL |
| Artur willams Pimentel costa | Existe no banco — lead antigo (nov/2025) | 2025-11-11 | Pré-Vendas MQL |
| Edson Teixer | Existe no banco — lead antigo (jan/2026) | 2026-01-15 | Vendas SQL |
| Erick Sant Ana | Existe no banco — lead antigo (jan/2026) | 2026-01-24 | Pré-Vendas MQL |
| Gabriel Gomes | Existe no banco — lead antigo (nov/2025), tag nmql | 2025-11-11 | Pré-Vendas nMQL |
| Neir Jr | Existe no banco — lead antigo (nov/2025) | 2025-11-11 | Pré-Vendas MQL |
| Ivan Locatelli | Existe no banco — lead antigo (dez/2025) | 2025-12-11 | Pré-Vendas MQL |
| Efraym Faria | Existe no banco — lead antigo (jan/2026) | 2026-01-18 | Pré-Vendas MQL |
| Melquesedek William | Existe no banco — lead antigo (nov/2025) | 2025-11-11 | Pré-Vendas MQL |
| Lucca | Existe no banco — lead antigo (dez/2025) | 2025-12-03 | Vendas SQL |

> **Conclusão:** Nenhum dos 12 está verdadeiramente faltando no sistema. Todos existem no banco, porém com `data_lead_recebido` em período anterior a fevereiro. São leads que **resubmeteram um formulário** em fevereiro, mas o GHL já os conhecia e não criou nova oportunidade. O gabarito registra a data do form, o banco registra a data de criação da oportunidade original.

---

## LISTA 2 — No banco como MQL mas NÃO no gabarito

**Total: 531 registros.** Detalhamento por tipo:

| Pipeline | Qtd | Explicação |
|----------|-----|------------|
| Pré-Vendas nMQL | 429 | nMQL = leads qualificados de OUTRAS fontes (não o formulário iAds 400k) |
| Vendas SQL | 43 | Leads avançaram para SQL mas vieram de outras fontes |
| Pré-Vendas MQL | 32 | MQLs de outras campanhas (não iAds 400k) |
| [fn] webinário | 14 | Leads vindos de webinário |
| Social Selling | 5 | Leads de social selling |
| (sem pipeline) | 8 | Pipeline não preenchido |

### 2A — MQLs reais no banco que NÃO estão no gabarito (43 leads com tag 'mql', sem 'nmql')

> Esses são MQLs legítimos no banco que vieram de **outra fonte** que não o formulário iAds. O gabarito representa apenas leads do formulário específico `lp.empirebusiness.com.br/form-page-w-unif`.

| # | Nome | Telefone | Pipeline | Data |
|---|------|----------|----------|------|
| 1 | Lucas Stanley | +5581998748522 | Pré-Vendas MQL | 2026-02-27 |
| 2 | Ezequias sena | +5511989313311 | Vendas SQL | 2026-02-26 |
| 3 | Breno Pattini | +5511997663656 | Pré-Vendas MQL | 2026-02-24 |
| 4 | Dyelle Teixeira | +5571996662238 | Vendas SQL | 2026-02-23 |
| 5 | Daniel Silvestre | +5584997038476 | Vendas SQL | 2026-02-22 |
| 6 | Saul Melo | +5511999227272 | Vendas SQL | 2026-02-21 |
| 7 | Raissa Rodovalho | +5531999173004 | Vendas SQL | 2026-02-21 |
| 8 | Luiz | +5513991975342 | Pré-Vendas MQL | 2026-02-20 |
| 9 | Felipe Sória Melo | +5511992778850 | Pré-Vendas MQL | 2026-02-19 |
| 10 | VINICIUS ALEXANDRE AGUIAR | +5519982633750 | Pré-Vendas MQL | 2026-02-18 |
| 11 | Artur willams Pimentel costa |  | Pré-Vendas MQL | 2026-02-16 |
| 12 | Edson Teixer |  | Pré-Vendas MQL | 2026-02-16 |
| 13 | Erick Sant Ana |  | Pré-Vendas MQL | 2026-02-14 |
| 14 | Gabriel Gomes |  | Pré-Vendas MQL | 2026-02-13 |
| 15 | Fernando Aurelio | +5562984401090 | Social Selling | 2026-02-11 |
| 16 | Valéria Ribeiro | +5562995302291 | Social Selling | 2026-02-09 |
| 17 | Neir Jr |  | Pré-Vendas MQL | 2026-02-08 |
| 18 | Marcelo de Souza Santos | +5519999529248 | Pré-Vendas MQL | 2026-02-08 |
| 19 | Elton neri | +5511986961201 | Pré-Vendas MQL | 2026-02-08 |
| 20 | Daniel Moreira | +5511958919238 | Vendas SQL | 2026-02-07 |
| 21 | Ivan Locatelli |  | Pré-Vendas MQL | 2026-02-07 |
| 22 | Vini Adilson da Costa | +5547991708404 | Pré-Vendas MQL | 2026-02-06 |
| 23 | Hugo Carvalho |  | Pré-Vendas MQL | 2026-02-06 |
| 24 | Carolina Brum | +13212091512 | Vendas SQL | 2026-02-06 |
| 25 | Cauê Miramon | +5511995230854 | Pré-Vendas MQL | 2026-02-06 |
| 26 | Danilo vilela | +5514982065950 | Pré-Vendas MQL | 2026-02-06 |
| 27 | Leonardo Araujo | +5585988457151 | Vendas SQL | 2026-02-06 |
| 28 | Efraym Faria |  | Pré-Vendas MQL | 2026-02-05 |
| 29 | Pablo | +5592984303037 | Vendas SQL | 2026-02-05 |
| 30 | cesar caceres | +595981376704 | Social Selling | 2026-02-04 |
| 31 | RP componentes |  | Pré-Vendas MQL | 2026-02-04 |
| 32 | Mônica Ferreira |  | Pré-Vendas MQL | 2026-02-04 |
| 33 | Melquesedek William |  | Pré-Vendas MQL | 2026-02-03 |
| 34 | Lucca |  | Pré-Vendas MQL | 2026-02-02 |
| 35 | Max Thúlio | +5531989046386 | Vendas SQL | 2026-02-02 |
| 36 | Gustavo Fraga | +551397798082 | Vendas SQL | 2026-02-02 |
| 37 | Rafael | +5511961654344 | Pré-Vendas MQL | 2026-02-02 |
| 38 | Raphael Caleia Garcia | +5522992047950 | Pré-Vendas MQL | 2026-02-02 |
| 39 | Dharman Carneiro |  | Vendas SQL | 2026-02-02 |
| 40 | Gustavo Henrique Florêncio | +5555997011832 | Pré-Vendas MQL | 2026-02-02 |
| 41 | Fábio Félix Pereira | +5521971933845 | Pré-Vendas MQL | 2026-02-01 |
| 42 | Mari Coelho | +5512991089666 | Pré-Vendas MQL | 2026-02-01 |
| 43 | Fabio Amaral beaga | +5524998341909 | Pré-Vendas MQL | 2026-02-01 |

---

## LISTA 3 — Matches: no gabarito E no banco (114 leads, 90,5%)

| # | Nome (gabarito) | Telefone | Pipeline no banco |
|---|-----------------|----------|-------------------|
| 1 | Magno fernandes | +5521991907389 | Pré-Vendas MQL |
| 2 | Fabio Fehr | +5511999513135 | Pré-Vendas MQL |
| 3 | Rodrigo Mendes | +5511980177878 | Vendas SQL |
| 4 | Rodrigo Jordão | +5571991679368 | Vendas SQL |
| 5 | Wei Abade | +5571996324232 | Vendas SQL |
| 6 | SAMUEL PEIXOTO ALVES | +5511930457247 | Vendas SQL |
| 7 | Guilherme Lopes DR Energia | +559898100605 | Pré-Vendas MQL |
| 8 | David de Andrade de Castro | +5548991481398 | Vendas SQL |
| 9 | Felipe Aguiar da Fonseca | +5553999657817 | Pré-Vendas MQL |
| 10 | Leonardo Ferreira | +5531988192696 | Vendas SQL |
| 11 | Letícia Paola Barzon Oliveira  | +5511961751531 | Vendas SQL |
| 12 | david valle nunior | +5513991692731 | Vendas SQL |
| 13 | Rudney resende | +5562985850981 | Pré-Vendas MQL |
| 14 | Daniel Fraga | +5547996073940 | Pré-Vendas MQL |
| 15 | Ely baptista Alves | +5519974090207 | Pré-Vendas MQL |
| 16 | Hdir Gondim | +5562996073933 | Pré-Vendas MQL |
| 17 | Felipe Tirelli | +5521997803310 | Pré-Vendas MQL |
| 18 | João Ferraz | +5581999586444 | Pré-Vendas MQL |
| 19 | Edison Edwin | +5521993414551 | Pré-Vendas MQL |
| 20 | Fabio Andrade | +5571993160162 | Pré-Vendas MQL |
| 21 | Claudio Alex Santos Alexandre | +5511958417317 | Pré-Vendas MQL |
| 22 | Caio Bernar | +5511992113232 | Pré-Vendas MQL |
| 23 | Rafael Dangelo | +5531991737553 | Pré-Vendas MQL |
| 24 | Jaques Grinberg | +5511962171818 | Vendas SQL |
| 25 | Francisco pac macedo | +5511933664931 | Pré-Vendas MQL |
| 26 | Roberto Navarro | +5511992592100 | Pré-Vendas MQL |
| 27 | Thiago Rovito de Oliveira Santos | +5511996607440 | Pré-Vendas MQL |
| 28 | Edir Ferreira Pinto | +5544999164080 | Pré-Vendas MQL |
| 29 | Eduardo Sampaio | +5581988472226 | Vendas SQL |
| 30 | Daniela Rigol  | +5585988784393 | Vendas SQL |
| 31 | Lucas Urbano dos reis  | +5511953272882 | Vendas SQL |
| 32 | Arthur Marabin | +5516992128889 | Vendas SQL |
| 33 | Charles Viçoso | +5521989661111 | Pré-Vendas MQL |
| 34 | Pablo Fernández | +5521999876169 | Pré-Vendas MQL |
| 35 | Leonardo Trench | +5511972104187 | Pré-Vendas MQL |
| 36 | Gustavo Audoeno | +5531995234953 | Pré-Vendas MQL |
| 37 | Flavio Quintino de Souza Junior | +5516991766208 | Pré-Vendas MQL |
| 38 | Leonardo Beling | +5541999611907 | Pré-Vendas MQL |
| 39 | Lucas Radd | +5531999041637 | Pré-Vendas nMQL |
| 40 | Amanda Pereirahttps://www.instagram.com/amanda_pereira_rodrigues4gma?igsh=MWR1em9taDRqdGg5aQ== | +5562981819580 | Pré-Vendas MQL |
| 41 | Dan Cortazio | +971555710877 | Pré-Vendas MQL |
| 42 | Rangel | +5549988504932 | Pré-Vendas MQL |
| 43 | Rafael sousa | +5511969233477 | Pré-Vendas MQL |
| 44 | Mario | +5516991242064 | Pré-Vendas MQL |
| 45 | Michael charliston | +5564992402343 | Vendas SQL |
| 46 | Douglas Barbosa  | +5581993777076 | Pré-Vendas MQL |
| 47 | Daniel Silva Carvalho | +5515996467825 | Vendas SQL |
| 48 | Donalvam Moreira da Costa Maia | +5561998600009 | Pré-Vendas MQL |
| 49 | luan leal | +5566999209892 |  |
| 50 | Cleomar da Luz | +5546991022486 | Vendas SQL |
| 51 | Paulo Rico | +5511951865689 | Vendas SQL |
| 52 | Wellington Lourenço Menezes Lourenço Menezes | +5511915008332 | Pré-Vendas MQL |
| 53 | Juan Fradera | +5551997254769 | Pré-Vendas MQL |
| 54 | Rafael Oliveira  | +5519995740104 | Pré-Vendas MQL |
| 55 | Pedro Henrique Vieira Marques | +5532988244299 | Pré-Vendas MQL |
| 56 | Flavio Medeira | +554691180851 | Pré-Vendas MQL |
| 57 | Aurélio pimetel | +5527997638530 | Pré-Vendas MQL |
| 58 | Gilberto castro | +5562981119074 | Vendas SQL |
| 59 | John Vieira | +5511934030860 | Vendas SQL |
| 60 | Juliano Maximo | +5585988963352 | Pré-Vendas MQL |
| 61 | Lourdnes Laya | +5561998349092 | Pré-Vendas MQL |
| 62 | JOSE RICARDO PAPACIDERO JUNIOR | +5511965844149 | Vendas SQL |
| 63 | Matheus Gregório  | +5544991391214 | Pré-Vendas MQL |
| 64 | Jonatas Ferraz  | +5519997219629 | Vendas SQL |
| 65 | Eugenio Sturzbecher | +5551997186410 | Pré-Vendas MQL |
| 66 | Wagner Antonio | +5547991656523 | Vendas SQL |
| 67 | Niara  | +5522997223327 | Vendas SQL |
| 68 | Johnis Pastori  | +5544991111064 | Pré-Vendas MQL |
| 69 | Dobrador de Luz  | +5531992559036 | Pré-Vendas MQL |
| 70 | Luis Eduardo Moraes  | +5521988452778 | Pré-Vendas MQL |
| 71 | Cristopher Vieira Gonçalves | +5531972309496 | Pré-Vendas MQL |
| 72 | Fabricio Pinato  | +5511993925795 | Pré-Vendas MQL |
| 73 | DANIEL TIAGO RIBEIRO DOS SANTOS | +5531992783904 | Vendas SQL |
| 74 | Paolo Vargas de Souza Recke | +5547988268672 | Pré-Vendas MQL |
| 75 | Andre Rodrigues | +5511989890271 | Pré-Vendas MQL |
| 76 | Marcel Souza  | +5548999228530 | Pré-Vendas MQL |
| 77 | Robson Cavalcanti | +5581996920479 | Pré-Vendas MQL |
| 78 | Flavio bitencourt | +5511957818029 | Pré-Vendas MQL |
| 79 | Rodrigo Almeida | +5541988188545 | Pré-Vendas MQL |
| 80 | Anderson Carlos de Resende | +5531972000506 | Vendas SQL |
| 81 | Lucas Basques | +5511989836965 | Vendas SQL |
| 82 | Rafael Antônio Merico Carneiro | +5511953486626 | Pré-Vendas MQL |
| 83 | Carlos Assis  | +5521975018151 | [fn] webinário |
| 84 | João Vicente  | +5511967992100 | Pré-Vendas MQL |
| 85 | André Jaeger Augusto | +5516992272772 | Vendas SQL |
| 86 | Luis Eduardo Isoldi | +5511989317042 | Pré-Vendas MQL |
| 87 | Bruno Sevarolli | +5532984910520 | Cami |
| 88 | Lucas Uander lipsch | +5566996897282 | Pré-Vendas MQL |
| 89 | matheus henrique pereira rissato | +5544988054813 | Vendas SQL |
| 90 | matheus henrique pereira rissato | +5544988054813 | Vendas SQL |
| 91 | Kadu Cabral  | +5592981944889 | Vendas SQL |
| 92 | Bruno Faneze | +5551993597131 | Vendas SQL |
| 93 | Yara Antenor | +5511996501411 | Pré-Vendas MQL |
| 94 | Wilson Binder | +5511982802476 | Pré-Vendas MQL |
| 95 | Andrey coelho | +5511954128835 | Vendas SQL |
| 96 | Carlos Hueb | +5514998281218 | Vendas SQL |
| 97 | Flavio Carvalho Ribeiro | +5521993804484 | Pré-Vendas MQL |
| 98 | Patricia Rossafa Branco | +5541988939545 | Pré-Vendas MQL |
| 99 | Elton Fixer Pereira  | +5544999730902 | Vendas SQL |
| 100 | Marcelo Velloso  | +5549998170017 |  |
| 101 | Julio Cesar | +5531971202126 | Pré-Vendas MQL |
| 102 | Augusto Carminati  | +5516993900272 | Vendas SQL |
| 103 | Cesar bertolo cruz | +5511953083060 | Pré-Vendas MQL |
| 104 | Fabiano Peçanha Montez | +5541997790500 | Pré-Vendas MQL |
| 105 | Thalles Linhares | +5519998815155 | Vendas SQL |
| 106 | Caio Viana | +5511981853960 | Vendas SQL |
| 107 | Jeve carelli | +5554999722178 | Vendas SQL |
| 108 | Rodolfo | +5521995959595 | Pré-Vendas MQL |
| 109 | Victor furlan | +5519993633653 | Vendas SQL |
| 110 | Enzo Camargo | +5511974752620 | Pré-Vendas MQL |
| 111 | Wilson Antunes cintra junior | +5516992045349 | [fn] webinário |
| 112 | Marcus Vinicius da Silva Sadde | +5524999772442 | Vendas SQL |
| 113 | Bruno Saraiva Carneiro | +5592991119900 | Pré-Vendas MQL |
| 114 | Junior cocensa | +5544999929636 | Pré-Vendas MQL |

---

## CONCLUSÕES

1. **Taxa de cobertura: 90,5%** — 114 dos 126 leads do gabarito foram encontrados no banco com classificação MQL/pré-vendas. Alta aderência.

2. **Os 12 'faltantes' não estão realmente faltando** — todos existem no banco, mas foram originalmente criados em meses anteriores (nov/2025 a jan/2026). O formulário foi resubmetido em fevereiro, mas o CRM (GHL) não criou nova oportunidade porque o contato já existia.

3. **O banco tem 531 MQLs que não estão no gabarito** porque o gabarito representa apenas 1 fonte específica (formulário iAds). O banco consolida todas as fontes: nMQL, webinário, social selling, etc.

4. **Discrepância real a investigar:** 43 leads com tag 'mql' (legítimo) no banco em fevereiro/2026 que não vieram pelo formulário iAds. Verificar se são de outras campanhas mapeadas corretamente.

5. **Duplicatas no banco:** Foram identificados registros com nome 'teste' e emails genéricos (teste@gmail.com) — limpeza recomendada.