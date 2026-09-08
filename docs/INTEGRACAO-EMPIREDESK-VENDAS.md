# Integração EmpireDesk → `vendas_fechamento`

> **Documento de plano** — desenho aprovado, Fase 1 em andamento.
> Última atualização: 2026-05-27 BRT
> Status: 🛠️ FASE 1 EM ANDAMENTO

## Progresso da construção

| Passo | Descrição | Status |
|-------|-----------|--------|
| 1.1 | Fundação no banco do GHL (colunas `pagamentos`/`comprovantes`/`closer`/`origem` + bucket) | ✅ Concluído (2026-05-27) — migration `20260527000000` |
| 1.2 | Edge functions "balcão" (`crm-buscar-lead` / `crm-registrar-venda`) | ✅ Concluído (2026-05-27) — deployadas no GHL, `verify_jwt=false`, auth por secret `EMPIREDESK_BRIDGE_SECRET`; RPC `buscar_lead_para_venda` (migration `20260527000001`) |
| 1.2b | Configurar secret `EMPIREDESK_BRIDGE_SECRET` nos dois projetos | ✅ Concluído (2026-05-27) — configurado nos dois projetos; **smoke test da ponte OK** (buscar-lead 200, registrar-venda gravou venda fictícia com `valor_faturado` correto e foi limpa) |

### Nota técnica — `valor_faturado` é GENERATED

A coluna `vendas_fechamento.valor_faturado` é `GENERATED ALWAYS AS (valor_entrada + numero_parcelas * valor_parcela)` — não pode ser gravada diretamente. A `crm-registrar-venda` **não** insere `valor_faturado` e grava `valor_parcela` = **média das parcelas** (soma das parcelas ÷ nº de parcelas), de forma que a fórmula gerada bata com a soma real dos pagamentos mesmo quando as parcelas têm valores diferentes. A verdade detalhada fica em `pagamentos` (JSONB).
| 1.3 | Endereço estruturado no formulário (EmpireDesk) | ✅ Concluído (2026-05-27) — migration `20260527000000`, formulário + máscara CEP, edge function `vendas-publicas-create` v8 deployada, tela de validação exibe endereço estruturado; type-check ok |
| 1.4 | Passo de vínculo na validação + disparo ao concluir (EmpireDesk) | ✅ Concluído (2026-05-27) — migration `20260527000001` (colunas de vínculo); edge functions intermediárias `vendas-buscar-lead-crm` + `vendas-sincronizar-crm` (deployadas, `verify_jwt=true`); UI de vínculo no `VendaModal` (busca candidatos, opp mais recente pré-selecionada, "Concluir + CRM") |
| 1.5 | Fila de pendência de vínculo (EmpireDesk) | ✅ Concluído (2026-05-27) — vendas sem match podem ser concluídas e ficam com `ghl_oportunidade_id` NULL; aviso no modal, badge "sem vínculo" na lista, botão "Enviar ao CRM agora" para resolução posterior |
| 1.6 | Aba Financeiro do LeadCard (pagamentos + plataforma + closer + comprovantes) | ✅ Concluído (2026-05-27) — `useLeads` + `LeadCard.FinanceiroTab`; type-check ok; falta teste visual (depende de venda do Desk gravada) |

---

## 1. Objetivo

O **formulário de vendas do EmpireDesk** passa a ser a fonte das vendas fechadas, no lugar do GHL/OpenClaw. Cada venda validada é **vinculada ao lead que já existe no GHL**, alimentando os painéis de funil, cohort, atribuição e faturamento — com dados de pagamento mais ricos e novos campos (comprovantes, closer, plataforma).

**Premissa que se mantém:** os **leads do tráfego continuam vindo do GHL** (webhook). O GHL deixa de ser fonte apenas das *vendas*, não dos *leads*. É isso que preserva o funil completo.

---

## 2. Os dois bancos envolvidos

| Papel | Projeto Supabase | Ref |
|-------|------------------|-----|
| **Banco A** — dashboard, painéis, `vendas_fechamento`, CRM (contatos/oportunidades) | "Dash novo EmpireBusiness (OpenClaw)" | `qzesffnkqgelmtfblzkr` |
| **Banco B** — formulário de venda, `vendas_pendentes`, comprovantes | "EmpireDesk" | `wuzmckatbmlpkdxtfhqr` |

São **bancos separados** — por isso o plano exige uma "ponte" entre eles.

---

## 3. Arquitetura

```
EmpireDesk (banco B)                          Dash EmpireBusiness (banco A)
─────────────────────                         ─────────────────────────────
Leads do tráfego ──────(continuam vindo do GHL)───────►  contatos / oportunidades
                                                                  ▲
1. Closer registra a venda (formulário)                          │ match por
2. Atendimento valida + VINCULA ao lead ──────ponte──────►       │ telefone/e-mail
3. (Fase 2) Contrato assinado no Desk ────────ponte──────►  vendas_fechamento
                                                                  │
                                                                  ▼
                                          LeadCard + painéis: funil, cohort, $$, comprovantes
```

---

## 4. O match (vínculo venda → lead)

O "fio" que liga a venda (vinda do formulário) ao lead que já existe no CRM. O dado precisa existir **nos dois lados** pra servir de fio.

| Fio | Formulário (venda) | Lead (GHL) | Serve? |
|-----|--------------------|-----------|--------|
| **Telefone** | `cliente_whatsapp` (E.164 `+55…`) | `contatos.telefone` (E.164 `+55…`, 85,4% preenchido) | ✅ **Principal** |
| **E-mail** | `cliente_email` | `contatos.email` (76% preenchido) | ✅ Reforço |
| **CPF** | `cliente_cpf_cnpj` | ❌ não existe nos contatos (só em `vendas_fechamento`) | ❌ Não (hoje) |

**Regras do match:**
- Comparação de telefone **normalizada** (trata o nono dígito do celular; compara dígitos, não a string crua).
- O **atendente confirma** na tela de validação quando houver mais de um candidato.
- Sem nenhum match → a venda vai pra uma **fila de pendência de vínculo** (nunca é descartada).
- O CPF continua sendo coletado e salvo (necessário pro contrato), só **não entra na busca** enquanto os leads do GHL não tiverem CPF.

**Dados medidos em 2026-05-27 (`contatos` do banco A):** 9.840 contatos · 8.402 com telefone (85,4%) · 7.466 com e-mail. Telefone no formato `+5511975808073`.

---

## 5. Modelo de pagamento (rico)

O modelo antigo do GHL "achata" o pagamento em 3 caixinhas (`valor_entrada`, `numero_parcelas`, `valor_parcela`) — perde forma, plataforma e o que é sinal vs parcela. O formulário do Desk faz certo: cada pagamento é uma linha com **data, valor, forma, plataforma, sinal**.

**Plano:**
- Adicionar coluna `pagamentos` (lista/JSONB) na `vendas_fechamento`, espelhando o Desk.
- `valor_faturado` = **soma de todos os pagamentos** (continua alimentando os painéis de faturamento).
- `data_pagamento_entrada` = data do pagamento marcado como **"Entrada"** (continua sendo o gatilho de "venda fechada de verdade" — ver regra crítica no `CLAUDE.md`).
- Campos antigos (entrada/parcelas/valor parcela) ficam **derivados** temporariamente, pra não quebrar nada que ainda os use.
- Tela de Faturamento passa a exibir a **lista detalhada** (incluindo a **plataforma** de cada pagamento).

---

## 6. Endereço estruturado

O formulário hoje coleta endereço como **texto único** (`cliente_endereco`). O LeadCard e o contrato precisam de campos **separados**.

**Plano:** evoluir o formulário do Desk pra coletar logradouro, número, complemento, bairro, município, UF e CEP **separados** (com máscara de CEP). Dado limpo, pronto pro contrato (Fase 2) e pro LeadCard.

---

## 7. Campos novos na aba Financeiro do LeadCard

Confirmado em 2026-05-27: a aba Financeiro tem hoje as seções **Contratante, Endereço, Faturamento, Contrato, Vencimentos das Parcelas, Observações**. **Não há** seção de mídia/comprovante, e o banco A **não tem nenhum bucket de storage**.

**Plano:**
- **Comprovantes:** criar **seção nova** "Comprovantes" exibindo as imagens vindas do formulário.
- **Closer:** mostrar quem fechou a venda.
- **Plataforma:** mostrar a plataforma de cada pagamento na lista.

---

## 8. Mapeamento campo a campo (LeadCard ⟷ formulário)

| Campo no LeadCard | Formulário preenche? | Observação |
|---|---|---|
| Contratante — Nome | ✅ | `cliente_nome` (+ `cliente_razao_social`) |
| CPF/CNPJ | ✅ | `cliente_cpf_cnpj` |
| Endereço (7 campos) | ⚠️ → ✅ | hoje texto único; será estruturado (item 6) |
| Valor faturado | ✅ | soma dos pagamentos |
| Valor entrada | ✅ | pagamento "Entrada" |
| Nº parcelas / Valor parcela | ✅ | derivado da lista |
| Forma de pagamento | ✅ | por pagamento, com plataforma |
| Produto vendido | ✅ | `produto_nome` |
| Data pagamento entrada | ✅ | data do pagamento "Entrada" |
| Contrato — Data assinatura | ⏳ Fase 2 | nasce no Desk |
| Vencimentos das parcelas | ✅ (gerado) | montado a partir da lista |
| Observações | ✅ | `observacoes` |
| Comprovantes (mídia) | ✅ → criar seção | item 7 |
| Closer | ✅ → mostrar | item 7 |
| Link gravação da call | ❌ | nenhum lado coleta no formulário |

---

## 9. Peças a construir

| # | Peça | Onde |
|---|------|------|
| 1 | Ponte de leitura (busca lead por telefone/e-mail) | Banco A |
| 2 | Passo de vínculo na tela de validação | EmpireDesk (UI) |
| 3 | Ponte de escrita (grava a venda) + comprovantes | Banco A ↔ B |
| 4 | Coluna `pagamentos` + derivação de `valor_faturado`/`data_pagamento_entrada` | Banco A |
| 5 | Endereço estruturado no formulário | EmpireDesk (UI) |
| 6 | Aba Financeiro: lista de pagamentos + plataforma + closer + seção Comprovantes | eb-dash2 (UI) |
| 7 | Storage de comprovantes no lado GHL (bucket novo) ou link do Desk | Banco A |
| 8 | Fila de pendência de vínculo (vendas sem match) | EmpireDesk (UI) |

---

## 10. Faseamento

- **Fase 1:** ponte + match + gravação + pagamentos ricos + comprovantes/closer/plataforma + endereço estruturado → venda aparece nos painéis com funil completo.
- **Fase 2:** contrato nasce no Desk → completa a linha (link, data de assinatura, dados do contratante).
- **Fase 3:** aposentar o OpenClaw como fonte da venda, com período de convivência pra garantir que nada some.

---

## 11. Pendências a decidir na construção da Fase 1

1. Quando o cliente tem **várias oportunidades** no CRM — qual vincular. *Recomendação: o atendente escolhe na tela, com a mais recente pré-selecionada.*
2. **Detalhe técnico da ponte** entre os dois bancos (edge function + chamada autenticada).
3. **Onde guardar os comprovantes** pro GHL exibir — copiar pra um bucket novo no banco A, ou exibir via link assinado do bucket `vendas-comprovantes` do banco B.

---

## 12. Referências

- Tabela alvo: [`docs/VENDAS-FECHAMENTO.md`](VENDAS-FECHAMENTO.md)
- Regra "venda fechada = `data_pagamento_entrada`": ver `CLAUDE.md` e [`docs/CONCEITOS-NEGOCIO.md`](CONCEITOS-NEGOCIO.md)
- Origem (EmpireDesk): `src/pages/vendas/NovaVendaPublicaPage.tsx`, `src/pages/vendas/VendasPendentesPage.tsx`, `supabase/migrations/20260515120000_vendas_pendentes.sql`
