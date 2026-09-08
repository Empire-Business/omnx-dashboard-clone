# Regras de Classificação — Pipeline Original

> Como determinar para qual pipeline cada lead deve voltar.

---

## Árvore de decisão

```
Lead só em Recuperação
│
├── Tem data_reuniao_agendada OU data_agendamento_reuniao?
│   └── SIM → Pipeline: Vendas MQL
│               Stage: "Perdido" (stage de perdido de Vendas MQL)
│
└── NÃO → Verificar tags do contato
    │
    ├── Tag "mql" presente (sem "nmql")?
    │   └── SIM → Pipeline: Pré-Vendas MQL
    │               Stage: "Perdido"
    │
    ├── Tag "nmql" presente?
    │   └── SIM → Pipeline: Pré-Vendas nMQL
    │               Stage: "Perdido"
    │
    └── Tag `[fn] social selling` ou `[cp] social selling`?
        └── SIM → Pipeline: Social Selling
                    Stage: "Perdido"
        └── NÃO → ⚠️ Sem classificação — revisar manualmente (caso raro)
```

---

## Pipelines e IDs

| Pipeline | ID | Stage "Perdido" ID |
|----------|----|--------------------|
| Pré-Vendas MQL | `QQXqQvYEkwafSCAB1ybC` | `fa46b2f5-a110-4eda-b3ed-233bf0dbbec0` |
| Pré-Vendas nMQL | `sqchZ2kIIZljR6wJ6bko` | `92207089-d034-4fe3-859e-c784eefcbe33` |
| Vendas SQL | `ZWuCjEXM2VDyLCx8CtGU` | `5bcee2fb-eefd-4df0-82f8-4303e1f5c8cf` ("Perdida") |
| Social Selling | `fgh4CfZQ8Un9iRCsgPFw` | `76a45114-30f1-45a2-97e1-965cf3b13b4b` |
| Recuperação | `Sn1Guqcm6zwZNTVOOf5L` | — |

> ✅ IDs confirmados via `GET /opportunities/pipelines?locationId=U8FTcw90CB5QELUnbGUu`

---

## Stage "Perdido"

Cada pipeline tem seu próprio stage "Perdido" com um ID diferente. Precisamos coletar esses IDs via:

```
GET /pipelines/{pipeline_id}
```

Isso retorna todos os stages com seus IDs. Precisamos do stage chamado "Perdido" (ou equivalente) em cada pipeline.

---

## Regra para o estágio na cópia de Recuperação

Quando duplicarmos a opp de volta para Recuperação, o novo registro deve entrar no **mesmo estágio em que está hoje** — para não perder o progresso no pipeline de recuperação.

Isso é obtido via: `GET /opportunities/{ghl_opportunity_id}` → campo `pipelineStageId`.
