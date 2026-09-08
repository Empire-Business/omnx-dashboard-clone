# Baseline de schema (alvo de paridade da Fase 0.7)

> Atualizado em: 2026-07-09 BRT · Status: referência de paridade (não é migration)

## O que é

`prod-schema.manifest.txt` é a **lista de objetos** do schema `public` de produção,
extraída de um `pg_dump --schema-only --no-privileges` (PG 17.6, 24.882 linhas):

| Objeto | Quantidade |
|--------|-----------:|
| Tabelas | 112 |
| Funções | 189 |
| Índices (CREATE INDEX explícitos) | 289 |
| Triggers | 66 |
| Policies | 386 |

É o **alvo de paridade** da Fase 0.7: o setup-do-zero (`supabase start` limpo +
`supabase db push` das migrations) deve reproduzir exatamente este conjunto.

## Por que só estrutura (sem GRANTs)

O dump foi feito com `--no-privileges`, então o manifest **não** lista `GRANT`s. Isso
é intencional: os privilégios **já são versionados pelas migrations**
(ver `docs/BASELINE-REPRODUCIBILIDADE.md` — 5× `GRANT ALL ON ALL TABLES TO service_role`
+ GRANTs por tabela para `authenticated`, sem `ALTER DEFAULT PRIVILEGES`). A paridade de
privilégios é garantida pelas migrations, não por este manifest.

## Como usar

- **Hoje (sanidade):** `scripts/check-schema-parity.sh "$TEST_DB_URL"` deve sair com
  diff ≈ 0 (o projeto de teste foi populado a partir deste mesmo dump).
- **Critério de pronto da 0.7:** apontar o mesmo script para um banco criado do zero
  pelas migrations e obter diff = 0 — sem dump/seeds manuais.

## Observações

- Índices implícitos (criados por `PRIMARY KEY`/`UNIQUE`) não entram na contagem de
  `CREATE INDEX` do dump; o checker trata índices como **informativo**, não como diff
  duro, para evitar falso-positivo.
- O manifest é derivado do dump; a fonte viva do dump está fora do repositório
  (`/tmp`, gerado na Fase 0). Não versionamos o dump bruto (876K) por ruído/tamanho.
