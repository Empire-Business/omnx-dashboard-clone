# Deploy controlado — Edge Functions multi-tenant

| Campo | Valor |
|---|---|
| Atualizado em | 2026-07-14 BRT |
| Ambiente alvo | Produção `qzesffnkqgelmtfblzkr` |
| Estado | **Concluído em 2026-07-14**: 19/19 funções publicadas e confirmadas no projeto alvo |

## Por que este deploy é necessário

As migrations de banco já foram promovidas, mas elas não publicam o código das
Edge Functions. O inventário de 2026-07-14 confirmou que
`discover-agency-locations` e `test-workspace-credential` ainda não existem em
produção; `ghl-api-worker` e `webhook-ghl` estão em versões anteriores às
mudanças multi-tenant.

## Lote fechado

O lote contém 19 funções: as 17 da suite `credential-isolation`, além de
`webhook-ghl` e `discover-agency-locations`. A lista exata fica centralizada em
`scripts/deploy-multi-tenant-functions.sh`; o script valida a existência de
cada `index.ts` antes de qualquer deploy.

## Gate obrigatório

Não existe opção segura para adiar a auditoria e ainda publicar em produção.
Antes de usar `--execute`, rodar a auditoria de segurança nesta sessão e obter
`security-report/verdict.json` com `contract_version: 1`, `gate: "PASS"` e
timestamp do dia corrente em BRT. O script recusa executar sem esse artefato.

## Execução

Primeiro, apenas conferir o lote:

```bash
bash scripts/deploy-multi-tenant-functions.sh \
  --project-ref qzesffnkqgelmtfblzkr
```

Depois do gate de segurança PASS e da autorização para a janela de produção:

```bash
bash scripts/deploy-multi-tenant-functions.sh \
  --project-ref qzesffnkqgelmtfblzkr \
  --execute
```

O script preserva a configuração de JWT declarada no projeto e publica uma
função por vez. Na primeira falha, o shell para e nenhuma função posterior é
publicada.

## Resultado da execução

Com autorização explícita do dono, o comando com `--execute` publicou as 19
funções no projeto de produção. A consulta posterior a `supabase functions
list` confirmou **19/19 presentes**, inclusive as duas que não existiam antes
(`discover-agency-locations` e `test-workspace-credential`) e as versões
atualizadas de `ghl-api-worker` e `webhook-ghl`.

O aviso local de Docker indisponível não bloqueou a publicação: o Supabase CLI
enviou os assets e confirmou cada deploy remoto.

## Próximo passo

1. Confirmar as 19 funções em `supabase functions list`.
2. Executar o burn-in em `docs/RUNBOOK-PRODUCAO-PRIMEIRO-TENANT.md` usando uma
   subconta interna.
3. Registrar o resultado em `docs/ROADMAP-MULTI-TENANT.md` antes de liberar
   qualquer cliente pago.
