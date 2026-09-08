# Mapa de Dados Pessoais — insumo para o DPA (Data Processing Agreement)

> **Prioridade:** OBRIGATÓRIO
> **Público-alvo:** time jurídico, para redigir o DPA e a política de privacidade.
> **O que este documento NÃO é:** não é o DPA em si (texto jurídico) nem uma opinião legal.
> É o levantamento técnico factual — o que o sistema coleta, onde fica, com quem é
> compartilhado e como é expurgado — para o jurídico ter base real ao redigir o contrato.
> **Metodologia:** schema real do banco de teste (`fgjbmdsucruvtpywyhhf`, 133 tabelas),
> leitura de `docs/`, `supabase/migrations/` e `supabase/functions/`. Item 4 da caça a bugs
> pós-PR #35 (2026-07-11).

---

## 1. Dados pessoais coletados e onde ficam armazenados

### 1.1 Leads/contatos do CRM (titular: lead/contato captado via GHL)

| Tabela | Dados pessoais | Observação |
|---|---|---|
| `contatos` (114 colunas) | `nome`, `primeiro_nome`, `ultimo_nome`, `email`, `telefone`, `ip`, `user_agent`, `fbc`/`fbclid`/`fbp`/`gclid`/`gbraid`/`wbraid` (identificadores de rastreamento Meta/Google), `ga_client_id`, `ga_session_id`, `country`, `custom_fields` (JSONB — pode conter qualquer campo customizado do GHL, inclusive PII não mapeado) | Núcleo do PII de lead. Vínculo com equipe interna via `owner_name`/`owner_email`/`closer_name`/`closer_email`. Campos de texto livre (`descricao_negocio`, `situacao_atual`, `perfil_inteligente`, `print_instagram` etc.) podem conter PII incidental não estruturado — ver seção 5. |
| `oportunidades` (64 colunas) | `nome_contato`, `email_contato` (denormalizados do webhook), `agendamento_por_user_email` | Processo comercial do lead; `percepcao_closer`/`resumo_ia`/`lost_reason` são texto livre. |
| `comunicacoes` / view `comunicacoes_com_remetente` | `contato_nome`, `contato_email`, `contato_telefone`, `mensagem_body`, `ai_transcript`, `ai_summary`, dados de chamada (`phone_call_from/to`, cidade/estado de origem) | Histórico completo de mensagens e ligações, incluindo transcrição de IA. |
| `webhooks_ghl` | Payload bruto e **imutável** (coluna `payload` JSONB) | Cópia mais completa e "crua" de PII do sistema — contém qualquer dado que o GHL envie. Por regra do projeto, nunca é alterado/deletado. |
| `webhook_unresolved` | Mesma natureza (payload bruto), para eventos que não resolveram workspace | — |
| `stevo_whatsapp_calls` | `caller`, `receiver` (telefones), `audio_url`/`recording_url` (gravação de voz), `transcription`, `analysis` | Áudio de voz — ver nota sobre dado sensível na seção 5. |
| `ghl_tasks` | `contact_ghl_id` | Tarefas vinculadas ao contato. |
| `reunioes` | `usuario_nome`, `usuario_email` (quem agendou/realizou) | Vinculada a `contato_id`. |
| `ghl_opp_reconcile_items` | `nome_contato`, `email_contato`, `ghl_contact_id` | Cópia de reconciliação. |

### 1.2 Cliente pagante / financeiro (titular: comprador)

| Tabela | Dados pessoais | Observação |
|---|---|---|
| `vendas_fechamento` | `nome_contratante`, **`cpf_cnpj_contratante`** (documento fiscal), endereço completo (`cep`, `logradouro_rua_avenida`, `numero_endereco`, `complemento_endereco`, `bairro`, `municipio`, `estado_uf`), `closer_nome`/`closer_email`, `comprovantes`, `pagamentos` (JSONB), `link_gravacao_call_vendas`, `observacoes_venda` | Bloco mais sensível de PII "documental" do sistema — CPF/CNPJ + endereço completo. |
| `maquina_de_conteudo` | `comprador_nome`, `comprador_sobrenome`, `comprador_email`, `comprador_telefone`, `comprador_documento` (CPF), `comprador_pais/cidade/cep`, `payload` (JSONB bruto) | Compras via Hotmart. Ver `docs/CACA-BUGS-CLASSE-COLUNA-INEXISTENTE.md` (colunas de documento/endereço adicionadas em 2026-07-11). |
| `aplic-acelerador` | `nome`, `email`, `whatsapp`, `form_payload`/`ghl_payload` (JSONB bruto) | Formulário de aplicação/lead magnet. |

### 1.3 Usuário interno / equipe da plataforma (titular: staff/colaborador)

| Tabela | Dados pessoais | Observação |
|---|---|---|
| `ghl_users` | `nome`, `email`, `role_ghl`, vínculo `auth_user_id` | Usuários GHL sincronizados. |
| `workspace_members`, `agency_members` | `user_id` (FK para `auth.users` — gerenciado pelo Supabase Auth, fora do schema `public`) | — |
| `auth_audit_log` | `email`, `ip_address`, `user_agent`, `action`, `error_message` | Log de tentativas de autenticação/ações. |
| `auth_password_reset_tokens` | `ip_address`, `user_agent`, `token_hash` (hash, não o token) | TTL de 1h (housekeeping técnico, não retenção de titular). |
| `creative_audit_log`, `permission_audit_log`, `audit_log` | `ip_address`, `user_agent`, `changed_by`/`performed_by`/`user_id` | Rastro de auditoria administrativa. |
| `telegram_allowed_users` | `nome`, `telegram_user_id` | Allowlist de acesso ao bot via Telegram. |
| `ai_conversations`, `ai_messages`, `ai_analysis_sessions` | `user_id`, `content`/`question`/`final_answer` | Conversas internas com a IA — pode conter PII de leads discutidos em texto livre. |
| `creative_comments` | `user_id`, `content` | Comentários internos. |

### 1.4 Destinatários de e-mail (titular: destinatário de relatório)

`weekly_email_schedules` e `weekly_email_logs` — `recipient_emails` (array de e-mails que
recebem relatório semanal automático). **Nota histórica:** as policies de SELECT dessas
tabelas não filtravam por linha (vazamento cross-tenant); corrigido em 2026-07-11
(`docs/FASE-6-FATIA2-META-WEEKLY-EMAIL.md`).

### 1.5 Dados de campanha/anúncio (sem PII de indivíduo final)

`meta_ads_campaigns`, `meta_ads_insights`, `meta_ads_permalinks`, `notion_creatives` — nomes
de campanha, métricas agregadas, `instagram_permalink_url`. `created_by`/`assigned_to` são
usuário interno, não PII de público-alvo.

### 1.6 Segredos/credenciais (dado sensível de segurança, não PII de titular)

`secrets` (via Vault), `workspace_integration_credentials`, `agency_ghl_credentials` —
chaves de API de terceiros armazenadas via `secret_key_id`, nunca em texto plano na tabela.

---

## 2. Retenção de dados

**Não há política de retenção automática (TTL/expurgo por idade) para nenhuma tabela de
dado pessoal de lead/cliente.** Verificado:

- Nenhum `cron.schedule` faz purge por idade em `contatos`, `oportunidades`, `comunicacoes`,
  `vendas_fechamento`, `webhooks_ghl`, `webhook_unresolved`, `audit_log`, `auth_audit_log`,
  `stevo_whatsapp_calls`.
- Únicas limpezas encontradas nas migrations são execuções **manuais e pontuais** (não
  recorrentes): `20260219122854_limpar_webhooks_teste.sql` e
  `20260311230001_cleanup_webhook_comunicacoes.sql` — limpeza de dados de teste, não
  retenção de produção.
- `docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md` (seção 6, item 3) confirma explicitamente: o
  único prazo que existe hoje é o `grace_period_days` (default 30 dias) entre o **pedido**
  de exclusão de um workspace e a **execução** do purge — não uma retenção geral de dado de
  lead. A definição de "por quanto tempo reter" é descrita no próprio doc técnico como
  **decisão jurídica/de produto pendente**, não uma escolha técnica já feita.

**TTLs técnicos curtos existentes (housekeeping, não retenção de titular):**
`ai_analysis_sessions` (1h), `auth_password_reset_tokens` (1h).

**Conclusão para o DPA:** dados de lead (contatos, oportunidades, comunicações, vendas,
webhooks brutos) ficam retidos **indefinidamente** até um pedido explícito de exclusão de
workspace. Prazo de retenção contratual/jurídico ainda não definido — **decisão pendente
que o jurídico precisa tomar** (não uma lacuna técnica a corrigir em código).

---

## 3. Compartilhamento com terceiros

| Integração | Direção | Dados pessoais que trafegam | Base legal documentada? |
|---|---|---|---|
| **GoHighLevel (GHL)** — webhooks + API (`webhook-ghl`, `sync-opp-*`, `sync-contact-*`, `sync-ghl-*`) | GHL → Supabase | Payload completo de contato/oportunidade: nome, email, telefone, tags, custom fields, histórico de mensagens/ligações (incl. transcrição), dados de agendamento | Não documentada no repositório — presumivelmente coberta pelo contrato do cliente com o GHL (fonte primária do CRM), mas sem menção formal aqui |
| **Meta Ads (Meta Marketing API)** — `sync-meta-ads*` | Meta → Supabase | Métricas agregadas de campanha, **sem PII individual do público-alvo**. Não há uso de Meta Conversions API (envio de dados de cliente hasheados para a Meta) | N/A (fluxo unidirecional, sem PII enviado) |
| **E-mail (Resend)** — `send-weekly-report-email` | Supabase → Resend → destinatário | `recipient_emails`, conteúdo do relatório (métricas de negócio) | Não documentada. Remetente `clara@omnx.pro` |
| **OpenRouter / Qwen (IA)** — `bot-chat`, `bot-chat-data`, `bot-chat-synthesis`, `prevendas-ai` | Supabase → OpenRouter (modelo `qwen/qwen3.6-plus`, obrigatório por regra do CLAUDE.md) | **`prevendas-ai`** monta prompt incluindo `nome` do lead junto com canal/tentativas/dias sem contato — nome de lead trafega para provedor de IA terceiro. `bot-chat`/`bot-chat-synthesis` podem incluir nomes/emails de leads no contexto conforme a pergunta do usuário interno. Sem anonimização/hashing dos nomes antes do envio | Não documentada — nenhuma cláusula de base legal ou anonimização foi encontrada |
| **Notion** — `notion-creatives-sync` | Bidirecional | `created_by`/`assigned_to` (usuário interno), sem PII de lead | N/A |
| **Telegram** — `telegram-bot` | Bidirecional | `telegram_user_id`, `nome` (allowlist); mensagens repassadas ao `bot-chat` (mesmo caminho de exposição à IA acima) | Allowlist é controle de acesso técnico, não consentimento LGPD formal |
| ~~OpenClaw — webhook de contrato assinado~~ | — | — | **Removido em 2026-07-11** (decisão do dono, integração descontinuada — ver `docs/REMOCAO-OPENCLAW.md`). Deixa de compartilhar dados pessoais com este terceiro. |

**Achado transversal relevante:** `docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md` (seção 6, itens
1-2) já registra que **o DPA por sub-conta ainda não existe** e falta **comunicação formal
ao cliente sobre infraestrutura compartilhada** — este documento é o insumo que faltava para
fechar esse gap.

---

## 4. Expurgo/deleção de dados

Fonte: `docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md` (implementado e validado no banco de TESTE
em 2026-07-11; **não aplicado em staging/produção ainda**).

**O que existe:**
- RPC `purge_workspace_data` — apaga **todo o workspace** (contatos com cascade para
  oportunidades/comunicações/vendas/reuniões, tarefas, webhooks, usuários GHL, conversas de
  IA, permissões, e por fim o próprio workspace). Atômico (transação única). `dry_run=true`
  por padrão; hard-delete real só com `--execute` e nome de confirmação exato.
- **Exportação de portabilidade** (`scripts/export-workspace-data.ts`) gera manifesto/export
  de todos os dados pessoais do workspace **antes** da exclusão (Art. 18, IX LGPD).
- Fluxo formal via RPC `request_workspace_deletion` (grava em `workspace_deletion_requests`,
  `grace_period_days` default 30 dias).
- Usuários cuja única membership era aquele workspace têm o registro apagado do
  `auth.users` via Admin API.

**Lacuna confirmada — não existe expurgo em nível de titular individual.** Todo o desenho
de `purge_workspace_data` opera por `workspace_id` inteiro. **Não há RPC para apagar os
dados de um único contato/lead específico** dentro de um workspace que continua ativo — ou
seja, hoje não há caminho técnico pronto para atender ao direito de eliminação (Art. 18, VI)
de um titular individual sem desligar o cliente/workspace inteiro. Isso é uma lacuna real,
não apenas documental, que precisa de decisão de produto + implementação futura.

**Gaps de cobertura já documentados no próprio processo (seção 5 do doc-fonte):**
`meta_ads_backfill_controle`/`meta_ads_backfill_log` e `audit_log` residual — decisão
explícita de não cobrir (baixo risco, sem PII de lead direta). Gaps que **já foram
fechados**: `stevo_whatsapp_calls` e as 4 tabelas de `meta_ads`/`weekly_email` (fechados em
2026-07-11).

---

## 5. Dados sensíveis especiais (LGPD Art. 5º, II)

**Não encontrado** nenhum campo estruturado, tabela ou documentação relacionados a saúde,
biometria, origem racial, convicção religiosa/política ou orientação sexual. O sistema é um
CRM de vendas/marketing — não há indício de coleta estruturada desse tipo de dado.

**Ressalva para o jurídico — campos de texto livre sem triagem de conteúdo:** o sistema não
tem nenhum mecanismo de classificação automática que impeça um dado sensível de entrar
incidentalmente em campos de texto livre preenchidos por IA ou atendente humano:

- `contatos`: `descricao_negocio`, `situacao_atual`, `obstaculos`, `perfil_inteligente`,
  campos de SWOT/análise de gap, `print_instagram` (screenshot pode conter qualquer coisa).
- `oportunidades`: `percepcao_closer`, `resumo_ia`, `lost_reason`.
- `comunicacoes`: `ai_transcript`, `ai_summary`, `mensagem_body` — transcrição de call pode
  revelar qualquer assunto mencionado espontaneamente pelo lead.
- `vendas_fechamento`: `observacoes_venda`.
- `stevo_whatsapp_calls`: `transcription`, `analysis`, `audio_url`/`recording_url` — **áudio
  de voz é considerado dado biométrico por algumas interpretações da LGPD**; recomenda-se
  nota jurídica específica sobre isso.

Não há como o sistema hoje filtrar dado sensível em texto livre — é um ponto que o jurídico
pode querer endereçar via cláusula de "melhor esforço"/política de uso aceitável no DPA.

---

## 6. Resumo do que falta para o jurídico redigir o DPA

1. **Prazo de retenção por tipo de dado de lead** — hoje só existe o "grace period" de 30
   dias entre pedido e execução de exclusão de workspace; não uma retenção geral definida
   (seção 2).
2. **Base legal para envio de nome/dados de lead a provedores de IA terceiros**
   (OpenRouter/Qwen) — hoje sem cláusula ou anonimização (seção 3).
3. **DPA por sub-conta** (arquitetura multi-tenant/agência) — ainda não redigido; e
   comunicação formal ao cliente atual sobre mudança de modelo de infraestrutura
   compartilhada (achado já registrado em `docs/FASE-8-LGPD-EXPURGO-OFFBOARDING.md`).
4. **Direito de eliminação individual** — não existe hoje um caminho técnico para apagar
   dados de UM titular específico sem desligar o workspace inteiro; precisa virar decisão de
   produto (o jurídico pode precisar de uma cláusula transitória até isso ser implementado).
5. **Nota sobre gravação de voz** (`stevo_whatsapp_calls`) como possível dado biométrico.
6. **Cláusula de melhor esforço para campos de texto livre** que podem conter dado sensível
   incidental sem nenhuma triagem automática hoje.
