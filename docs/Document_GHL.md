*orquestrar - Vou te passar algumas regras, aí você vai documentando e atualizando as edge functions necessárias.

# Instruções gerais

Todos os campos que chegam com "opportunity." são campos de oportunidade. Exemplo: {{opportunity.mqlno_show}}

Os demais campos são campos de contato.

---

## ⚠️ CONCEITO FUNDAMENTAL: Lead = Oportunidade Criada

> **REGRA DE NEGÓCIO:** Neste sistema, **LEAD = OPORTUNIDADE CRIADA**.

### O que isso significa na prática?

1. **Lead** é sinônimo de **Oportunidade** no nosso sistema
2. Um **Contato** pode ter **múltiplos Leads/Oportunidades**
3. Cada vez que uma pessoa preenche um formulário, uma **nova oportunidade (lead)** é criada

### Exemplo

```
João Silva (Contato único)
├── Oportunidade ID: abc123 (Lead #1) - Formulário preenchido em 01/02/2026
├── Oportunidade ID: def456 (Lead #2) - Formulário preenchido em 15/02/2026
└── Oportunidade ID: ghi789 (Lead #3) - Formulário preenchido em 20/02/2026
```

### Implicações para o banco de dados

- A tabela `contatos` guarda informações da **pessoa** (1 registro por pessoa)
- A tabela `oportunidades` guarda informações do **lead** (N registros por pessoa)
- Relacionamento: `contatos.id` ← `oportunidades.contato_id` (1:N)

---

## Alerta
TEM QUE TOMAR MUITO CUIDADO PARA NÃO CONFUNDIR A DATA DE CRIAÇÃO DE ITENS NO SUPABASE COM AS DATAS DE CRIAÇÃO DE OPORTUNIDADE E DO CONTATO.

\#\# O que fazer ao receber webhook

Ao receber um webhook, sua atitude deve ser:

\#\#\# 1  
analisar se já existe contato (se já houver, atualizar de acordo com as regras de extração). Se não houver, criar novo contato  
\#\#\# 2  
analisar se há uma oportunidade naquele webhook, ou seja, se {{[opportunity.id](http://opportunity.id)}} está preenchido.  
\#\#\# 3  
Se {{[opportunity.id](http://opportunity.id)}} estiver preenchido, analisar se já existe aquela oportunidade na tabela de oportunidades. Se houver, atualize os campos. Se não houver, crie nova oportunidade com aquele ID para aquele contato.

\#\# Colunas que você deve criar nas tabelas (contato ou oportunidade) e o que elas significam. \-\> Para estas colunas, você deve atualizar a edge function que extrai dados do webhook. Crie nomes nas tabelas que sejam claros e correlatos com os campos abaixo. Documente tudo.

\#\#\# Oportunidade

{{ opportunity.pipeline\_id }} \-\> Indica em qual pipeline o lead está

{{[opportunity.id](http://opportunity.id)}} \-\> Id da oportunidade

{{ opportunity.pipeline\_stage\_id }} \-\> indica em qual coluna do pipeline o lead está

{{ opportunity.status }} \-\> Indica o status da oportunidade

{{opportunity.mqlno\_show}} ou {{ opportunity.sqlno\_show }} ou {{ opportunity.d\_mqlno\_show }} ou {{ opportunity.d\_sqlno\_show }} \- use um como fallback do outro-\> Indica o momento que o lead deu no show (registro de tempo)

{{opportunity.mqlleads\_recebidos}} ou {{ opportunity.d\_mqlleads\_recebidos }} \-\> indica o momento que a oportunidade foi criada (se estiver vazio e houver oportunity id, usar a data de criação do contato como fallback)

{{opportunity.mqlcontato1}} ou {{ opportunity.d\_mqlcontato1 }}  \- use um como fallback do outro \-\> indica o momento que tentamos realizar o 1º contato 

{{opportunity.mqlcontato2}} ou {{ opportunity.d\_mqlcontato2 }} \- use um como fallback do outro   \-\> indica o momento que tentamos realizar o 2º contato 

{{opportunity.mqlcontato3}} ou {{ opportunity.d\_mqlcontato3 }}  \- use um como fallback do outro \-\> indica o momento que tentamos realizar o 3º contato 

{{opportunity.mqlcontato4}} ou {{ opportunity.d\_mqlcontato4 }}  \- use um como fallback do outro \-\> indica o momento que tentamos realizar o 4º contato 

{{opportunity.mqlcontato5}} ou {{ opportunity.d\_mqlcontato5 }}  \- use um como fallback do outro \-\> indica o momento que tentamos realizar o 5º contato 

{{opportunity.mqlcontato6}} ou {{ opportunity.d\_mqlcontato6 }}  \- use um como fallback do outro  \-\> indica o momento que tentamos realizar o 6º contato 

{{opportunity.mqlcontato7}} ou {{ opportunity.d\_mqlcontato7 }}  \- use um como fallback do outro  \-\> indica o momento que tentamos realizar o 7º contato 

{{opportunity.mqlcontato8}} ou {{ opportunity.d\_mqlcontato8 }}  \- use um como fallback do outro  \-\> indica o momento que tentamos realizar o 8º contato 

{{ opportunity.mqlconectado }} \-\> indica o momento que o lead foi conectado, ou seja, conseguimos falar com ele.

{{ opportunity.mqlreunio\_marcada }} ou {{opportunity.sqlreunio\_agendada}} ou {{ opportunity.d\_mqlreunio\_marcada }}- use um como fallback do outro \-\> o momento que a reunião foi marcada (que é diferente da data que vai acontecer a reunião)

{{ opportunity.mqlperdido }} ou {{ opportunity.d\_mqlperdido }} \- use um como fallback do outro \-\> indica o momento que o lead foi marcado como perdido na pré venda

{{ opportunity.sqlperdida }} ou {{ opportunity.d\_sqlperdida }} \- use um como fallback do outro \-\> indica o momento que o lead foi marcado como perdido depois de já ter marcado uma reunião

{{ opportunity.sqlreunio\_realizada }} \-\> 

{{ opportunity.sqlnegociao }} ou {{ opportunity.d\_sqlnegociao }} \- use como fallback um do outro \-\> indica o momento que o lead foi movido para o estágio de negociação

{{ opportunity.sqlpendencias\_preenchimento }} ou {{ opportunity.d\_\_sqlpendencias\_preenchimento }} \-  use como fallback um do outro  \-\> indica o momento que o lead ficou pendência de preenchimento. Ou seja, o vendedor esqueceu de preencher algum campo essencial.

{{ opportunity.name }} \-\> Nome da oportunidade

{{ opportunity.status }} \-\> Status da oportunidade

{{opportunity.assignedToUsersName}} \-\> Vendedor (Closer) \- Atribuído como owner da oportunidade

{{ opportunity.data\_da\_reunio }} \-\> Data para a qual o SDR (pré venda) agendou a reunião com o vendedor (data prevista para acontecer a reunião)

{{ opportunity.reuniao\_realizada }} \-\> Data, marcada pelo vendedor, como a data quando a reunião de fato aconteceu. 

{{ opportunity.percepo\_do\_closer }} \-\> Closer (vendedor) preenche a percepção que ele teve da reunião com o lead

{{ opportunity.resumo\_ia }} \-\> Campo de resumo que uma IA faz sobre o Lead

{{ opportunity.ltima\_atividade }} \-\> ultima atividade da oportunidade

{{opportunity.lead\_value}} \-\> Valor possível do lead

\#\#\#\# Dados de fechamento, ainda dentro de oportunidades. Aqui o Closer preenche os dados da venda que ele fechou, para que sirva de base para construir o contrato depois. — faz sentido por esses dados em uma tabela separada, linkado pedo UUID da oportunidade do supabase.

---> Para uma venda ser considerada fechada, ela deve ter o campo de data de pagamento da entrada preenchido

{{ opportunity.nome\_contratante }} \-\> Nome do contratante que deve sair no contrato

{{ opportunity.cpf\_ou\_cnpj\_do\_contratante }} \-\> Cpf ou cnpj do contratante

{{ opportunity.logradouro\_rua\_avenida }} \-\> Endereço do contratante

{{ opportunity.numero\_endereco }} \-\> Número do endereço

{{ opportunity.complemento\_do\_endereo }} \-\> Complemento do endereço

{{ opportunity.bairro }} \- \> Bairro

{{ opportunity.municipio }} \-\> Município

{{ opportunity.estado\_uf }} \-\> Estado

{{ opportunity.cep }} \-\> CEP

{{ opportunity.produto\_que\_foi\_vendido }} \-\> Nome do produto que foi vendido

{{ opportunity.observacoes\_venda }} \-\> Observações da venda, preenchidas pelo closer

{{ opportunity.forma\_de\_pagamento }} \-\> Forma de pagamento escolhida

{{opportunity.valor\_a\_ser\_pago\_de\_entrada}} \-\> Valor a ser pago de entrada

{{opportunity.numero\_parcelas}} \-\> número de parcelas que serão feitas

{{opportunity.valor\_parcela}} \-\> Valor de cada parcela

Atenção: o valor total faturado é calculado da seguinte forma: {{opportunity.valor\_a\_ser\_pago\_de\_entrada}} \+ \[{{opportunity.numero\_parcelas}}\]x\[{{opportunity.valor\_parcela}}\] \-\> sugiro que uma função calcule isso automaticamente e preencha uma coluna “Valor faturado”

Obs: se a venda for à vista, o closer irá preencher apenas o valor da entrada, então o valor faturado será igual ao valor da entrada.

{{ opportunity.data\_pagamento\_entrada }} \-\> Data que a entrada foi paga

\#\#\# Contato

 "ip": \- autoexplicativo  
     "url": \- autoexplicativo  
"adId": \- autoexplicativo  
     "gclid": \- autoexplicativo  
     "adName": \- autoexplicativo  
     "fbclid": \- autoexplicativo

 "lastAttributionSource": {  
     "ip": \- autoexplicativo  
     "url": \- autoexplicativo  
     "adId": \- autoexplicativo  
     "gclid": \- autoexplicativo  
     "adName": \- autoexplicativo  
     "fbclid": \- autoexplicativo  
     "gbraid": \- autoexplicativo  
     "wbraid": \- autoexplicativo  
     "referrer": \- autoexplicativo  
     "adGroupId": \- autoexplicativo     
   }

"country": \- autoexplicativo   
 "tt\_term": \- codigo da plataforma de anuncio  
 "Hashtags": \- autoexplicativo   
 "utm\_term": — esse é o utm term que vale (não confundir com o da URL ou outros que aparecem no webhook)  
"full\_name": \- autoexplicativo   
 "last\_name": \- autoexplicativo   
 "tt\_medium": \- codigo da plataforma de anuncio  
 "tt\_source": \- codigo da plataforma de anuncio  
 "contact\_id": \- autoexplicativo 

"first\_name": \- autoexplicativo   
 "tt\_content": \- código da plataforma de anuncio  
 "utm\_medium": — esse é o utm medium que vale (não confundir com o da URL ou outros que aparecem no webhook)  
 "utm\_source": — esse é o utm source que vale (não confundir com o da URL ou outros que aparecem no webhook)  
 "Follow Up 2": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 3": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 4": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 5": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 6": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 7": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 8": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 9": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow up 1": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "ID Análise": \- oferecemos análise gratuita para alguns leads na página de obrigado ou como Isca. Nesses casos, aparece o ID aqui.  
 "pipeline\_id": \- autoexplicativo  
 "triggerData": \- autoexplicativo  
 "tt\_campaign": \- codigo da plataforma de anuncio  
 "utm\_content": — esse é o utm content que vale (não confundir com o da URL ou outros que aparecem no webhook)  
 "E-mail Owner": \- e-mail do SDR (owner do contato)  
 "Follow Up 10": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 11": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 12": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.   
 "Follow Up 13": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.  
 "Follow Up 14": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.  
 "Follow Up 15": \- mensagem de follow up que planejamos enviar pro lead em caso dele não responder. Não necessariamente foi enviada.  
 "SWOT Forças": \- autoexplicativo  
 "date\_created": \- autoexplicativo data de criação do contato  
 "utm\_campaign": — esse é o utm campaing que vale (não confundir com o da URL ou outros que aparecem no webhook)  
 "SWOT Ameaças": \- autoexplicativo  
 "Social Seller": \- autoexplicativo (nome do social seller)  
 "pipeline\_name": \- autoexplicativo  
 "SWOT Fraquezas": \- autoexplicativo  
 "pipleline\_stage": \- autoexplicativo  
 "Data da Análise": \- autoexplicativo  
 "Link da Análise": \- autoexplicativo  
 "Situação Atual": \- autoexplicativo  
 "opportunity\_name": \- autoexplicativo  
 "Como nos conheceu": \- autoexplicativo  
 "Owner (SDR ou SS)": \- autoexplicativo (Nome do SDR \- owner do contato ou social seller, que fica no mesmo campo)  
 "attributionSource": {},  
 "Faturamento anual:": \- autoexplicativo  
 "Print do Instagram": \- autoexplicativo  
 "SWOT Oportunidades": \- autoexplicativo  
 "Status da Análise": \- autoexplicativo  
 "Possíveis Objeções": \- autoexplicativo  
 "Preciso de ajuda para:": \- autoexplicativo  
 "Comunicação: Veredito": \- autoexplicativo  
 "Perfil Inteligente do Lead": \- autoexplicativo  
 "Comunicação: Erros Atuais": \- autoexplicativo  
 "Transcrição da Ligação ": \- autoexplicativo  
 "Análise da Oferta Principal": \- autoexplicativo  
 "Banco de Ideias de Conteúdo": \- autoexplicativo  
 "Canais de Venda Recomendados": \- autoexplicativo  
 "Qual é o seu @ do instagram?": \- autoexplicativo  
 "Plano de Ação: Passo a Passo": \- autoexplicativo  
 "Análise de GAP e Pontos Fracos": \- autoexplicativo  
 "Estudo Detalhado de Concorrentes": \- autoexplicativo  
 "Possui quantos clientes atualmente?":\- autoexplicativo  
 "Comunicação: Tendência de Mercado": \- autoexplicativo  
 "Estratégia Anti-Objeção (Scripts)": \- autoexplicativo  
 "Concorrente 1: Pontos Fortes Detalhados": \- autoexplicativo  
 "Concorrente 2: Pontos Fortes Detalhados": "",  
 "Concorrente 3: Pontos Fortes Detalhados": "",  
 "Atua como social media há quanto tempo?": "",  
 "Qual é o seu plano para atingir esta meta?": "Postar recorrente no instagram e contratar uma assessoria de imprensa ",  
 "Qual das opções abaixo melhor descreve você?": "Empresa de tecnologia",  
 "Na sua opinião, o que não pode faltar no workshop?": \- autoexplicativo  
 "Cite alguns cases de sucesso seu e comente sobre eles": \- autoexplicativo  
 "Quanto, em média, você investe em tráfego por mês?": \- autoexplicativo  
 "Já fez algum treinamento de marketing digital? Se sim, qual?": \- autoexplicativo  
 "Perfeito\! Para encerramos, me diga qual o seu super-herói favorito?": \- autoexplicativo  
 "Tem disponibilidade para trabalhar presencialmente na Barra da Tijuca?": \- autoexplicativo  
"Conte um pouco sobre o seu negócio e o que espera conseguir com a nossa ajuda": \- autoexplicativo  
 "Fale os 3 principais obstáculos que estão impedindo você de atingir as metas acima?": \- autoexplicativo  
 "Como você gostaria de ver suas redes sociais nos próximos 6 meses? (Marca e Resultado Financeiro)": \- autoexplicativo  
 "Qual dessas opções melhor descreve a situação atual do seu negócio em termos de investimentos?": \- autoexplicativo  
 "Faça uma breve descrição do seu negócio atual: O que você vende, quem são seus clientes e quanto você cobra em média. ": \- autoexplicativo  
 "Há quanto tempo você usa a internet para crescer o seu negócio? Escreva também quais os tipos de ações de marketing que você já tentou fazer ou faz atualmente.": \- autoexplicativo  
 "Um membro da nossa equipe vai te chamar no horário combinado, somos muito sérios em relação a isso. Se você está realmente comprometido em comparecer a essa chamada, por favor, escreva a seguinte frase no campo abaixo: “Sim, eu estou\!”": \- autoexplicativo

\#\#\#\# Mensagens e ligações \- São campos do contato \- mas faz sentido ter uma nova tabela com link do UUID do contato

{{message.body}} \- nome autoexplicativo

{{message.subject}} \- nome autoexplicativo

{{message.attachments}} \- nome autoexplicativo

{{conversations\_ai.summary}} \- nome autoexplicativo

{{conversations\_ai.transcript}} \- nome autoexplicativo

{{phoneCall.duration}} \- nome autoexplicativo

{{phoneCall.from}} \- nome autoexplicativo

{{[phoneCall.to](http://phoneCall.to)}} \- nome autoexplicativo

{{phoneCall.fromCity}} \- nome autoexplicativo

{{phoneCall.fromState}} \- nome autoexplicativo

{{phoneCall.answeredBy.phone}} \- nome autoexplicativo

{{[phoneCall.answeredBy.user.name](http://phoneCall.answeredBy.user.name)}} \- nome autoexplicativo

{{phoneCall.startTime}} \- nome autoexplicativo

{{phoneCall.endTime}} \- nome autoexplicativo

{{phoneCall.callStatus}} \- nome autoexplicativo

{{phoneCall.dispositions}} \- nome autoexplicativo

\#\#\#\# Reuniões \- São campos do contato \- mas faz sentido ter uma nova tabela com link do UUID do contato

{{[appointment.id](http://appointment.id)}} \- nome autoexplicativo

{{appointment.title}} \- nome autoexplicativo

{{appointment.notes}} \- nome autoexplicativo

{{[appointment.user.name](http://appointment.user.name)}} \- nome autoexplicativo