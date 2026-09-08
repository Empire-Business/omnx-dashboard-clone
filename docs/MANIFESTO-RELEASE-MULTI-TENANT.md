# Manifesto de release — Multi-tenant em produção

| Campo | Estado |
|---|---|
| Atualizado em | 2026-07-13 BRT |
| Ambiente alvo | Produção `qzesffnkqgelmtfblzkr` |
| Pré-condição cumprida | PITR de 7 dias ativo; baselines *squash* reconciliados apenas no histórico |
| Estado | Grupos A–D aplicados em produção em 2026-07-13: 34 migrations aprovadas, após dry-run por grupo; burn-in do primeiro tenant interno ainda pendente |

## 1. Por que este manifesto existe

Após a reconciliação dos baselines, o dry-run de produção listou 38 migrations
pendentes. Quatro delas não fazem parte da promoção multi-tenant. O CLI do
Supabase não oferece filtro para aplicar somente parte dessa fila. Portanto,
executar `supabase db push` publicaria mudanças fora do escopo e é proibido.

Este arquivo congela o conjunto autorizado para revisão. Ele não substitui uma
migration, não executa SQL e não autoriza promoção automática.

## 2. Conjunto candidato à promoção multi-tenant

Aplicar somente na ordem versionada, com validação entre grupos:

| Grupo | Migrations | Verificação obrigatória antes de avançar |
|---|---|---|
| A — fundação de agência e credenciais | `20260720000000`, `20260721000000`, `20260721120000`, `20260722000000`, `20260723000000`, `20260724000000`, `20260725000000`, `20260726000000`, `20260727000000`, `20260728000000`, `20260729000000`, `20260730000000`, `20260731000000`, `20260801000000`, `20260802000000`, `20260802500000` | Smoke de RLS, credencial Vault e permissões da agência; nenhuma leitura/escrita cruzada |
| B — dados, descoberta e crons protegidos | `20260803000000`, `20260804000000`, `20260805000000`, `20260806000000`, `20260807000000`, `20260808000000`, `20260809000000`, `20260810000000`, `20260811000000`, `20260812000000`, `20260813000000`, `20260814000000` | Backfill fail-closed, credencial por workspace, cron com `service_role`, dry-run de expurgo |
| C — hardening final | `20260815000000`, `20260816000000`, `20260817000000`, `20260818000000` | Regressão de grants, webhook e prevenção de escalada de privilégios (5/5) |
| D — adoção e Meta Ads | `20260822000000`, `20260823000000` | Adoção reversível (3/3), isolamento de credenciais (39/39) e Meta Ads isolado por `workspace_id` |

## 3. Exclusões explícitas

Estas migrations aparecem no dry-run, mas não pertencem a este rollout:

- `20260819000000_ghl_mapping_vigilancia.sql`: somente teste;
- `20260820000000_reseed_empire_default_template.sql`: somente teste;
- `20260821000000_fix_data_conectado_mapping_spacing_e_coalesce.sql`: correção funcional independente, exige release próprio;
- `20260824000000_remove_openclaw_integration.sql`: remoção OpenClaw, exige release próprio.

## 4. Método aprovado para ensaio

O único método compatível com a CLI atual é o bundle transitório gerado por
`scripts/build-multi-tenant-release-bundle.sh`. O script copia byte a byte o
histórico já registrado em produção até `20260713170448` e somente as migrations
novas do grupo solicitado para um diretório temporário externo ao repositório.
Ele confere o SHA-256 de cada migration nova e cria o link técnico do projeto
alvo. Ele não executa SQL, não move/edita migrations versionadas e não altera o
histórico remoto.

Para cada grupo, gerar um bundle novo e rodar primeiro somente o dry-run. Para B, C e D, o bundle também inclui localmente os grupos anteriores já aplicados, para o CLI preservar a continuidade do histórico; o dry-run lista somente as migrations ainda pendentes:

```bash
bundle="$(bash scripts/build-multi-tenant-release-bundle.sh --group a --project-ref <ref> | awk -F': ' '/Bundle criado/{print $2}')"
supabase --workdir "$bundle" db push --dry-run --linked
```

O resultado deve listar somente o grupo solicitado. O staging atual já recebeu
migrations posteriores, inclusive as exclusões de teste, e por isso não serve
para validar um bundle parcial: a CLI detecta corretamente esse histórico a
mais como divergência. O ensaio de aplicação precisa ocorrer numa cópia limpa
da produção, restaurada antes do rollout. O mesmo bundle nunca é reutilizado
entre ambientes ou grupos. A aplicação real exige autorização explícita para a
janela, gate de segurança `PASS` da sessão e smoke/rollback do grupo anterior.
Nunca marcar migrations como aplicadas sem executar seus SQLs.

### Evidência de 2026-07-13

- Grupo A: dry-run e aplicação de exatamente 16 migrations, de
  `20260720000000` até `20260802500000`.
- Grupo B: dry-run e aplicação de exatamente 12 migrations, de
  `20260803000000` até `20260814000000`.
- Grupo C: dry-run e aplicação de exatamente 4 migrations, de
  `20260815000000` até `20260818000000`.
- Grupo D: dry-run e aplicação de exatamente 2 migrations,
  `20260822000000` e `20260823000000`.
- A leitura final do histórico remoto confirmou as 34 versões. Nenhum bundle
  listou ou aplicou `20260819000000`, `20260820000000`, `20260821000000` ou
  `20260824000000`.

## 5. Checklist por janela

1. Confirmar `security-report/verdict.json` com `gate: PASS` para o commit que
   será promovido.
2. Confirmar PITR ativo e uma pessoa responsável pelo acompanhamento.
3. Registrar contagens/manifesto do workspace atual antes do grupo.
4. Executar somente um grupo, aplicar o smoke correspondente e registrar o
   resultado no `docs/ROADMAP-MULTI-TENANT.md`.
5. Na primeira falha, parar. Não improvisar SQL; preservar logs e retornar ao
   `2-staging`.
6. Só após o grupo D, fazer o burn-in do primeiro tenant interno/de baixo risco
   antes de qualquer segundo tenant pago.

Referências: `docs/ROLLOUT-MULTI-TENANT-PRODUCAO.md`,
`docs/HANDOFF-MULTI-TENANT-META-ADS-ACCOUNT-DAILY.md`,
`docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md` e `docs/NIVEIS-DE-ACESSO.md`.
