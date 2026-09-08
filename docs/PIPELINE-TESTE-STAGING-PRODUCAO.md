# Pipeline de migração segura — Teste → Staging → Produção

> ⚠️ **DECISÃO DO DONO (2026-07-18): bancos de TESTE e STAGING serão DELETADOS.**
> A partir de agora o projeto opera **apenas com o banco de produção**
> (`qzesffnkqgelmtfblzkr`). Este pipeline de 3 fases (Teste → Staging → Produção)
> fica **HISTÓRICO** — não há mais ambiente pré-produção para validar migrations.
>
> **Implicação (risco assumido pelo dono):** toda migration futura é aplicada
> **direto em produção, sem rede de segurança** — sem `db reset` de teste, sem
> ensaio de rollback em staging. Mitigações obrigatórias no novo modo:
> **(1)** migration sempre idempotente (`IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP ... IF EXISTS`);
> **(2)** backup/snapshot do banco de produção **antes** de qualquer DDL destrutivo (`DROP`/`ALTER TYPE`/backfill);
> **(3)** preferir mudanças aditivas e reversíveis; **(4)** aval explícito do dono por janela.
> Ver [`docs/DECISAO-SO-PRODUCAO-2026-07-18.md`](DECISAO-SO-PRODUCAO-2026-07-18.md).

| Campo | Valor |
|-------|-------|
| **Atualizado em** | 2026-07-18 BRT |
| **Status** | HISTÓRICO — substituído pelo modo "só produção" (decisão do dono 2026-07-18); processo original aprovado em 2026-07-09 |
| **Escopo** | Como cada fase do plano multi-tenant é construída, validada e aplicada |
| **Relacionado** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) · [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) · [`docs/BASELINE-REPRODUCIBILIDADE.md`](BASELINE-REPRODUCIBILIDADE.md) |

> Regra-mãe: **nada chega em produção que não tenha rodado verde no teste e no
> staging**, e **nada** vai para produção por SQL manual — só por
> `supabase db push` de migration versionada e revisada em PR.

---

## 1. Os três ambientes

| Ambiente | Projeto | Para que serve |
|---|---|---|
| **Teste** | `fgjbmdsucruvtpywyhhf` | Validar que a migration **roda** e que a suíte de isolamento segue **0 vazamento**. Schema de produção, dados sintéticos. |
| **Staging** | _(a criar)_ | Validar **performance e comportamento sob volume real** com dados production-like **anonimizados**; ensaiar down-migration; burn-in. |
| **Produção** | `qzesffnkqgelmtfblzkr` | Só recebe migration versionada, fase a fase, com backup e reversão prontos. |

```
[branch da fase] → [TESTE] → [STAGING] → [PRODUÇÃO]
 migration+testes   roda + suíte 0 vaz.  carga + down-migration + burn-in   db push revisado
```

---

## 2. Pré-condições (gates antes de qualquer migration nova em produção)

1. **Migrations como fonte de verdade (Fase 0.7).** Hoje o schema base não está
   nas migrations (ver [`docs/BASELINE-REPRODUCIBILIDADE.md`](BASELINE-REPRODUCIBILIDADE.md)).
   **Gate:** `supabase start` limpo + `supabase db push` reproduzem as 112
   tabelas / 386 policies / GRANTs, e a suíte passa contra esse banco local sem
   dump/seeds manuais. Sem isso, nenhuma migration de Fase 1+ toca produção.
2. **Staging production-like anonimizado** antes da Fase 1 (deixa de ser "decisão
   pendente" e vira pré-requisito concreto).
3. **Produção só via migration versionada, fase a fase, com down-migration
   ensaiada e backup.** Nunca tudo de uma vez; nunca SQL manual.

---

## 3. Ritual de cada fase

1. **Branch** da fase a partir da ponta (`feat/...`, `fix/...`).
2. **Migration(s) idempotente(s)** + testes novos (destravar `it.todo` mapeados na
   Fase 0.6 em `__tests__/integration/future-phases.skip.test.ts`).
3. **Teste:** aplicar a migration em `fgjbmdsucruvtpywyhhf` + rodar a suíte (0
   vazamento) + testes da fase.
4. **Staging:** aplicar a mesma migration + suíte + carga + **ensaiar
   down-migration** (reverter e reaplicar) + burn-in.
5. **PR** com migration + testes + doc; revisão (retrofit de policies da Fase 1 e
   Fase 2 = 2 revisores, plano v3 seção 3.3.1).
6. **Produção (só com aval explícito do dono na hora):** backup/PITR →
   `supabase db push` da migration revisada → verificação pós (contagens, suíte
   smoke) → burn-in → decisão go/no-go da próxima fase (plano v3 seção 10.1).

---

## 4. Leitura de risco por fase

| Fase | Risco | Notas |
|---|---|---|
| **1 — tabelas Agency** | Baixo | Aditiva; não mexe em dados existentes. Estreia ideal do pipeline. |
| **1 — retrofit de ~90 policies** | Sensível | Mexe em policies existentes; gerar programaticamente de `pg_policies` (nunca à mão) + down-migration ensaiada. |
| **2 — credenciais** | Alto | Fluxo completo + kill-switch (10.2) + flag de reversão (10.4); janela e rollback prontos. |
| **3-8** | Segue o ritual | Fase 3 ainda depende de POC (seção 6.2). |

---

## 5. Regras de aplicação em produção (inegociáveis)

- Só `supabase db push` de migration **versionada e revisada em PR**.
- **Uma fase por vez.**
- Backup/PITR confirmado antes; down-migration ensaiada em staging antes.
- Burn-in e suíte smoke pós-aplicação.
- **Regra de ouro:** 1º tenant adicional interno/baixo risco; 2º tenant real
  pagante só após Fase 2 **e** Fase 8 completas com burn-in.
- **Aval explícito do dono na hora** de cada aplicação em produção.

---

## 6. Staging — como montar (quando o dono criar o projeto)

1. Projeto Supabase novo de homologação.
2. `supabase db push` (após a Fase 0.7) — prova de que as migrations bastam.
3. **Snapshot anonimizado:** dump de produção → script de anonimização
   (emails/nomes/telefones/tags → sintéticos determinísticos, preservando volumes
   e distribuições) → restore no staging.
4. Secrets `STAGING_*` no GitHub (mesmo padrão dos `TEST_*`); a suíte pode rodar
   contra staging sob demanda (o `safe-guard` precisa reconhecer o ref de staging).

---

## 7. Referências

- [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) — seções 10 (fases/rollback), 11 (riscos).
- [`docs/ROADMAP-MULTI-TENANT.md`](ROADMAP-MULTI-TENANT.md) — status e pré-requisitos por fase.
- [`docs/BASELINE-REPRODUCIBILIDADE.md`](BASELINE-REPRODUCIBILIDADE.md) — finding que a Fase 0.7 resolve.
- [`__tests__/ENV-SETUP.md`](../__tests__/ENV-SETUP.md) — ambiente de teste atual.
