# Status Multi-Tenant — 2026-07-19 (leitura pós-varredura round 3)

| Campo | Valor |
|-------|-------|
| **Base** | `docs/ROADMAP-MULTI-TENANT.md` (log de execução completo), `docs/PLANO-MULTI-TENANT-AGENCY.md` (plano v3), `docs/VALIDACAO-MULTITENANT.md`, `docs/VALIDACAO-META-MULTITENANT.md`, `docs/VARREDURA-CROSS-TENANT-COMPLETA.md` |
| **Escopo desta leitura** | Só leitura de produção (`qzesffnkqgelmtfblzkr`) + documentação. Nenhuma escrita. |
| **Objetivo** | Responder de forma honesta: o que falta de fato antes de aceitar um 2º tenant real pagante. |

---

## Resumo em uma frase

O hardening de isolamento de dados (RLS + RPCs `SECURITY DEFINER` + views + webhook fail-closed) está **fechado e aplicado em produção** em 3 rodadas (2026-07-17, 2026-07-18/19, 2026-07-19 round 3). O que falta **não é mais achar buracos de isolamento de linha** — é (1) dois riscos residuais documentados e aceitos conscientemente, (2) itens de produto adiados (Fases 3/6/7/8 parcialmente implementadas só no ambiente de teste, nunca promovidas), e (3) itens 100% operacionais do dono (DPA, burn-in, branch protection) que não são código.

---

## 1. O que bloqueia aceitar um 2º tenant real pagante

### 1.1 Bloqueadores ainda abertos (poucos, mas reais)

| Item | Situação | Por que bloqueia |
|---|---|---|
| **Burn-in do 1º tenant interno (MT-P3.7)** | ⬜ Não executado. `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md` está pronto; workspace "Burn-in Interno" já existe em produção (0 linhas nas 4 tabelas centrais), mas o ciclo de observação (crons, RLS, jobs, export/purge por pelo menos 1 ciclo) nunca rodou de ponta a ponta com dado real. | É o único portão que prova, na prática e não só em teoria, que o isolamento aguenta uso real antes de um cliente pagante depender dele. |
| **DPA/LGPD assinado (MT-P3.4)** | ⬜ Jurídico não iniciou. `docs/MAPA-DADOS-PESSOAIS-DPA.md` já entrega o insumo técnico completo (mapa de dados pessoais, retenção, compartilhamento com terceiros, gap de expurgo individual). | É uma exigência de compliance, não técnica — mas o roadmap trata como gate formal antes do 2º tenant **pago** (tenant interno/de baixo risco não precisa esperar isso). |

### 1.2 Riscos residuais aceitos e documentados (não bloqueiam, mas devem ser lidos antes de decidir)

Estes dois itens foram encontrados na validação adversarial de 2026-07-18/19 e **conscientemente não corrigidos ainda** — estão registrados como dívida, não escondidos:

- **Funções "oráculo" (`get_contact_workspace_id`, `get_opportunity_workspace_id`, família `get_user_*_workspace_ids`).** Revelam a qual workspace um ID pertence (vazamento de metadado), não o conteúdo do dado. Não foram corrigidas porque são usadas dentro de 30+ policies RLS de `comunicacoes`/`oportunidades`/`vendas_fechamento`/`ghl_opp_reconcile_items` — revogar `EXECUTE` de `authenticated` quebraria toda leitura/escrita autenticada nessas 4 tabelas. Precisa de desenho dedicado (não é um `DROP POLICY` direto).
- **Família de RPCs `analisar_*` (15 funções, ex. `analisar_meta_ads_por_regiao`) sem `REVOKE` explícito de `PUBLIC`/`anon`/`authenticated`.** Hoje não vazam porque são `SECURITY INVOKER` (rodam sob o RLS de quem chama, que está correto) — mas isso deixa a segurança 100% dependente do RLS nunca ter um buraco, e este mesmo documento já registrou 3 rodadas de buracos de RLS/RPC em menos de 3 dias. Recomendação registrada: aplicar o mesmo padrão de `REVOKE`/`GRANT` explícito que `bot_query` já tem, como defesa em profundidade.

**Recomendação desta leitura:** nenhum dos dois é um vazamento confirmado hoje — mas ambos deveriam ser fechados **antes**, não depois, do 2º tenant pago, dado o histórico recente da mesma classe de bug reaparecer em superfícies não cobertas por auditorias anteriores.

### 1.3 O que JÁ está fechado (não é mais um bloqueador)

- Leitura cross-tenant em `contatos`/`oportunidades`/`comunicacoes`/`vendas_fechamento` + 8 tabelas adicionais (round 1, migration `20260927000000`) — ✅ produção.
- Leitura/DELETE cross-tenant nas mesmas 4 tabelas centrais + `meta_ads_raw_insights`/`meta_ads_backfill_controle`/`meta_ads_backfill_log`/`ghl_opp_reconcile_runs`/`ghl_custom_field_mappings` (round 2, migration `20261004000000`) — ✅ produção, 2026-07-19.
- RPCs `SECURITY DEFINER` sem checagem de posse: `get_lead_full`, `get_opp_id_by_email`, `buscar_lead_para_venda`, `auditoria_sdr_ia`, `list_weekly_email_schedules`, `delete_weekly_email_schedule` (a única com `DELETE` real cross-tenant confirmado) + 5 views sem `security_invoker` (migration `20261004000002`) — ✅ produção, 2026-07-19.
- Brecha residual `anon`-bypass no próprio fix anterior (`auth.uid() IS NULL OR is_workspace_member(...)` também era `true` para chamada anônima sem login): 6 funções incluindo `DELETE`, mais 12 funções adicionais em categorias B–F, fechadas por varredura sistemática das 161 `SECURITY DEFINER` + 13 views de produção (round 3, migration `20261006000000`) — ✅ produção, 2026-07-19, validado com chamadas funcionais reais (`anon` bloqueado, `authenticated` funcional, tentativas de IDOR bloqueadas).
- Isolamento de credenciais (GHL/Meta/OpenRouter via Vault, `workspace_integration_credentials`) — ✅ produção desde 2026-07-14.
- Webhook GHL fail-closed por `location_id` + `webhook_secret` (sem fallback "workspace mais antigo") — ✅ produção desde 2026-07-16.
- Isolamento Meta Ads (RPCs `analisar_meta_*` cross-tenant, achado P0 do PR #51) — ✅ produção, 2026-07-19 (`docs/VALIDACAO-META-MULTITENANT.md`).
- Isolamento de dados da Clara (bot-chat via `service_role` + guard de aplicação, tools perigosas bloqueadas, `run_sql_query`/`bot_query` restrito a `service_role`) — ✅ validado, PASS.
- PITR de 7 dias ativo em produção, usado como pré-condição em todas as 3 aplicações acima.

---

## 2. O que é trabalho operacional do dono (não é código, não é gate de engenharia)

| Item | Status | Ação necessária |
|---|---|---|
| Burn-in do primeiro tenant interno (seção 1.1 acima) | ⬜ Pendente | Rodar `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md` ponta a ponta |
| DPA/LGPD (seção 1.1 acima) | ⬜ Pendente | Jurídico assina antes do 2º tenant **pago** |
| Excluir projeto Supabase efêmero `DELETAR-validacao-cross-tenant-sweep` (`xigyntpcuusouswwcblw`) | ⬜ Pendente | Confirmar e excluir manualmente pelo painel Supabase (nunca automatizado — regra da skill) |
| Chave Resend nova (MT-P3.2) | ⬜ Pendente | Bloqueia só o relatório semanal por e-mail, não o isolamento |
| Branch protection (MT-P3.5) | ⬜ Avaliar | Plano GitHub atual não suporta required checks em repo privado — decisão de custo do dono |
| Bug pré-existente em `buscar_reengajamento` (`c.body` não existe, deveria ser `mensagem_body`) | ⬜ Sinalizado, não corrigido | Achado colateral da round 3 (2026-07-19) — feature de reengajamento do discador quebrada há ~2 semanas, não é um problema de segurança |

---

## 3. O que já está feito (fundação sólida, não precisa refazer)

- **Fase 0 (fundação de testes):** suite de isolamento existiu e passou 592/602 (98,3%) contra projeto efêmero completo em 2026-07-19 — mas **não há mais banco de teste/staging persistente** (decisão `docs/DECISAO-SO-PRODUCAO-2026-07-18.md`); toda validação recente foi feita ou por projeto efêmero descartável ou por introspecção read-only direta em produção.
- **Fase 1 (modelo Agency):** `agencies`/`agency_members`/`agency_workspaces` + RLS aditiva (198 policies em 85 tabelas) + `resolveTenancyMode` — em produção desde 2026-07-13.
- **Fase 2 (isolamento de credenciais):** completa e em produção — a fase mais crítica do plano.
- **Fase 3 (descoberta de sub-contas):** decisão do dono já tomada (token de agência só-leitura, sem escopo de edição de usuários); implementação validada só no banco de teste (que não existe mais) — **precisa reimplementar/reverificar e mergear em `main`** quando o 2º tenant real for provisionado.
- **Fase 4 (BYOK self-service):** fatias 1/2/4 em produção. Falta só a fatia 3 (link de intake para terceiro conectar a própria chave) — não bloqueia, é conveniência de onboarding.
- **Fase 5 (UI Agency):** MVP em produção (`suspend`/`reactivate_agency_workspace`, área `/agency/*`).
- **Fase 6 (denormalização):** fatia 1 (CRM: `oportunidades`/`comunicacoes`/`vendas_fechamento`) e fatia 2 (Meta Ads/weekly email) em produção. RLS dessas tabelas continua via join, não via coluna — decisão consciente, não dívida.
- **Fase 7 (provisionamento agency-subaccount):** validada no banco de teste com rollback automático testado; ainda não usada em produção porque não houve 2º tenant real ainda.
- **Fase 8 (LGPD técnico — purge/export):** RPC `purge_workspace_data` validada (zero órfãos, zero vazamento) no banco de teste; falta só a parte jurídica (DPA, item 1.1).

---

## 4. Backlog de produto adjacente (não bloqueia multi-tenant, mas está no mesmo roadmap)

Do backlog P1 (`docs/ROADMAP-MULTI-TENANT.md` seção 3.1):

- **MT-P1.2 — Matrizes de eficiência (Funis/Campanhas em Vendas/Aquisição/Tráfego)** → entregue nesta sessão, ver seção "Parte B" do commit/PR.
- MT-P1.3 (filtros globais Closer/Pré-vendedor), MT-P1.4 (clarificar filtro "só MQL"), MT-P1.5 (atribuição de agendamentos), MT-P1.6 (auditoria de Relatórios), MT-P1.7 (seletor de workspace na 1ª tela) — ⬜ nenhum iniciado, nenhum bloqueia o 2º tenant.
- P2 (rebranding OMNX, logos, design system) — ⬜ trabalho de marca, sem relação com isolamento de dado.

---

## 5. Recomendação final desta leitura

1. Antes de aceitar o 2º tenant **pago**: rodar o burn-in (seção 1.1) e fechar o DPA. Nenhum dos dois é código.
2. Antes disso, ou em paralelo: fechar os 2 riscos residuais aceitos (seção 1.2) — funções-oráculo e `REVOKE` da família `analisar_*`. Não são vazamentos confirmados, mas o padrão histórico (3 rodadas de bugs de RLS/RPC em superfícies "quase cobertas" em menos de 3 dias) pesa a favor de fechar agora, com o mesmo time que já mapeou o problema, em vez de esperar uma 4ª rodada de auditoria adversarial encontrar o mesmo padrão de novo.
3. Excluir o projeto Supabase efêmero pendente (item operacional simples, sem risco).
4. Fases 3 e 7 (descoberta de sub-contas, provisionamento agency-subaccount) precisam de reverificação prática (não só re-leitura de documento) no momento em que o 2º tenant real for de fato provisionado — a validação que existe hoje rodou contra um banco de teste que não existe mais.
