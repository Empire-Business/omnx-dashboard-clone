# Runbook: cadastrar uma chave nova do Resend (e-mail de relatório semanal)

> **Para quem não é desenvolvedor.** Siga os passos na ordem, sem pular nenhum. Tudo
> aqui é feito clicando em painéis web — não precisa de terminal nem de código.

## O problema, em uma frase

O relatório semanal que deveria chegar por e-mail parou de ser enviado porque a chave
de acesso ao Resend (o serviço que efetivamente manda o e-mail) está inválida/expirada.
O relatório em si continua sendo calculado normalmente — ele só não está sendo
enviado por e-mail. Você pode ver os números na aba **Relatórios** do dashboard a
qualquer momento; só o envio automático por e-mail está parado.

---

## Passo 1 — Gerar uma chave nova no painel do Resend

1. Acesse [resend.com](https://resend.com) e faça login na conta que a empresa usa.
2. No menu lateral, clique em **API Keys**.
3. Clique em **Create API Key** (botão geralmente no canto superior direito).
4. Dê um nome que ajude a identificar depois, por exemplo: `producao-relatorio-semanal`.
5. Em **Permission**, escolha **Full access** (ou, se o painel oferecer uma opção mais
   restrita chamada algo como "Sending access"/"Send emails only", essa também serve —
   o sistema só precisa poder *enviar* e-mails, não gerenciar a conta).
6. Se o painel pedir para escolher um **domínio** (Domain), escolha o domínio que a
   empresa já usa para enviar esses e-mails (o remetente atual é algo como
   `clara@omnx.pro` — se não tiver certeza de qual domínio escolher, escolha "All
   domains"/"Todos os domínios" se essa opção existir).
7. Clique em **Add**/**Create**. O Resend vai mostrar a chave nova **uma única vez**,
   começando com `re_`. Copie essa chave agora (clique no ícone de copiar) e cole
   temporariamente num lugar seguro (ex: um gerenciador de senhas) — você vai precisar
   dela no Passo 2. Se fechar essa tela sem copiar, terá que gerar outra.

### Verificar se o domínio de envio está confirmado (importante)

Ainda no painel do Resend, no menu lateral clique em **Domains**.

- Procure o domínio do remetente (o que aparece depois do `@` no endereço que envia o
  relatório — hoje é `omnx.pro`, a menos que isso tenha sido alterado).
- O status ao lado do domínio precisa estar **Verified** (verde). Se estiver
  **Pending** ou algo diferente de verificado, o envio vai continuar falhando mesmo
  com a chave nova — nesse caso, seria necessário configurar os registros DNS que o
  Resend pede na tela de detalhe do domínio (isso normalmente é feito por quem
  administra o domínio `omnx.pro`, não pela chave de API). Se não souber mexer nisso,
  pode pedir ajuda numa próxima sessão de desenvolvimento — não precisa resolver
  sozinho.

---

## Passo 2 — Cadastrar a chave nova no Supabase (produção)

A chave **não** fica em nenhum arquivo do código nem em nenhuma tabela do banco de
dados — ela é um "segredo" (secret) configurado direto no painel do Supabase, do
projeto de **produção**.

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) e faça login.
2. Selecione o projeto de produção: **`qzesffnkqgelmtfblzkr`** (aparece com o nome
   "Dash novo EmpireBusiness (OpenClaw)" ou similar na lista de projetos — confirme
   pelo ID/ref antes de continuar, para não mexer no projeto errado).
3. No menu lateral esquerdo, procure **Edge Functions**.
4. Dentro de Edge Functions, procure uma aba ou seção chamada **Secrets** (às vezes
   fica em "Manage secrets" ou um ícone de engrenagem/cadeado no topo da página de
   Edge Functions).
5. Você vai ver uma lista de segredos já cadastrados, incluindo um chamado
   **`RESEND_API_KEY`** (esse é o que está inválido).
6. Clique para **editar** esse segredo (ou, se o painel só permitir substituir,
   apague o antigo e crie um novo com exatamente o mesmo nome — o nome tem que ser
   idêntico, letra por letra: `RESEND_API_KEY`, tudo maiúsculo, com underscore).
7. Cole a chave nova que você copiou no Passo 1 (a que começa com `re_`) e salve.

**Não mexa em nenhum outro segredo desta lista.** Em especial, existe um outro
chamado `RESEND_API_KEY_DASHBOARD` — esse é **diferente**, usado para outra coisa
(convite de usuários), e não deve ser alterado neste runbook.

### Só se você quiser trocar o remetente (opcional, normalmente não precisa)

Existe também um segredo `RESEND_FROM_EMAIL`, que define o endereço que aparece como
remetente do e-mail (hoje configurado com um valor já definido). Só mexa nele se
quiser mudar o "de:" do e-mail — não é necessário para resolver o problema da chave
inválida.

---

## Passo 3 — Verificar que funcionou

Você não precisa esperar a próxima hora cheia (o envio automático roda uma vez por
hora). Dá para testar na hora:

1. No dashboard do Empire, vá em **Relatórios** → aba **Automações**.
2. Encontre um agendamento de relatório semanal já cadastrado (ou crie um, se ainda
   não existir nenhum).
3. Clique no botão **Testar** ao lado do agendamento.
4. Se aparecer uma mensagem de sucesso na tela, **funcionou** — a chave nova está
   correta. Confira também se o e-mail chegou na caixa de entrada configurada
   (verifique a caixa de spam também, principalmente no primeiro envio depois da
   troca de domínio/chave).
5. Se aparecer uma mensagem de erro na tela, veja o Passo 4 abaixo.

### Se quiser confirmar por outro caminho (mais técnico, opcional)

No painel do Supabase (produção), vá em **Table Editor** → tabela
`weekly_email_logs` → ordene por `created_at` do mais recente para o mais antigo. A
linha mais recente deve mostrar `status = sent`. Se mostrar `status = failed`, a
coluna `error_message` ao lado explica o motivo.

---

## Passo 4 — Se continuar falhando

- **Mensagem de erro mencionando "API key is invalid" ou "401"**: a chave não foi
  colada corretamente no Passo 2, ou foi colada no segredo errado. Volte ao Passo 2 e
  confira o nome exato (`RESEND_API_KEY`) e se não sobrou espaço em branco antes/depois
  da chave ao colar.
- **Mensagem de erro mencionando "domain not verified" ou parecido**: volte à
  verificação de domínio no Passo 1 — o domínio do remetente ainda não está
  confirmado no Resend.
- **Nenhuma mensagem de erro clara, ou e-mail não chega mesmo com "sucesso" na
  tela**: pode ser um problema diferente (ex: endereço de destino errado, e-mail
  caindo em spam, ou algo na configuração do agendamento). Nesse caso, é melhor pedir
  para revisar numa sessão de desenvolvimento, levando a mensagem de erro exata que
  apareceu.

---

## Referência técnica (para quem for revisar isso depois)

- Edge function que envia o e-mail: `supabase/functions/send-weekly-report-email/index.ts`
  — lê `RESEND_API_KEY` e `RESEND_FROM_EMAIL` via `Deno.env.get(...)` (segredos de
  Edge Function, não variável de ambiente do frontend nem tabela do banco).
- Cron que dispara o envio automático: `weekly-email-dispatcher` (roda a cada hora,
  chama `weekly_email_dispatcher_job()` no banco, que por sua vez chama a edge function
  acima para cada agendamento ativo com `next_run_at` vencido).
- Tabelas envolvidas: `weekly_email_schedules` (configuração dos agendamentos),
  `weekly_email_logs` (histórico de envios, com `status`/`error_message`/`resend_message_id`).
- Confirmado nesta sessão (2026-07-11) via `net._http_response` em produção: o erro
  atual é `502` com corpo `{"error":"Erro ao enviar email","detail":{"statusCode":401,"name":"validation_error","message":"API key is invalid"}}`
  — exatamente o sintoma de uma `RESEND_API_KEY` inválida/expirada, não um bug de
  código.
