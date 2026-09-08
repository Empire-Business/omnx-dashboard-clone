# Testes E2E — Sub-apps Modulares

Este diretório contém os testes Playwright da **Fase 5** do épico de Sub-apps Modulares.

## O que é testado

- `access.spec.ts` — controle de acesso aos sub-apps por persona:
  - Admin master visualiza todos os apps, ativa/desativa apps e vê reflexo no seletor.
  - Gestor vê apenas apps permitidos e não consegue acessar `/settings/apps`.
  - SDR vê apps de pré-vendas, mas não vendas/relatórios, e `/vendas` redireciona para `/`.
  - App desativado pelo admin desaparece do hub para outro usuário.
- `goals-app.spec.ts` — cadastro de meta vinculada a um app e filtragem por app na tela de Metas.

## Pré-requisitos

1. O dashboard `eb-dash2` deve estar rodando em `http://localhost:3222`.
2. Playwright instalado na raiz do projeto (`npm install` já foi executado).
3. Credenciais de usuários de teste configuradas (veja abaixo).

## Configuração automática de usuários de teste

Existe um script que cria os 3 usuários de teste e configura as permissões no Supabase:

```bash
# 1. Certifique-se de que .env.local tem seu PAT e service role key
#    SUPABASE_ACCESS_TOKEN=<SEU_SUPABASE_ACCESS_TOKEN_AQUI>
#    SUPABASE_SERVICE_ROLE_KEY=<SEU_SUPABASE_SERVICE_ROLE_KEY_AQUI>
#
# 2. Rode o script
node scripts/sub-apps/setup-test-users.mjs

# 3. O script vai imprimir uma linha PLAYWRIGHT_TEST_USERS=...
#    Adicione essa linha ao seu .env.local
```

> ⚠️ **Nunca commite o .env.local.** Ele já está no `.gitignore` da raiz.

## Configuração manual de usuários de teste

Se preferir criar os usuários manualmente, os testes precisam de três usuários reais no workspace de teste:

| Persona | Role esperada | Acesso esperado |
|---------|---------------|-----------------|
| `admin_master` | `owner` ou `admin` | Todos os apps + `/settings/apps` |
| `gestor` | `member` (ou outra role não-admin) | Alguns apps, mas **não** `/settings/apps` |
| `sdr` | `member` com permissão limitada | Apps de pré-vendas, sem vendas/relatórios |

### Opção 1 — variável única em JSON

```bash
export PLAYWRIGHT_TEST_USERS='{
  "admin_master": {"email": "admin@exemplo.com", "password": "senhaSegura"},
  "gestor": {"email": "gestor@exemplo.com", "password": "senhaSegura"},
  "sdr": {"email": "sdr@exemplo.com", "password": "senhaSegura"}
}'
```

### Opção 2 — variáveis individuais

```bash
export PLAYWRIGHT_ADMIN_MASTER_EMAIL="admin@exemplo.com"
export PLAYWRIGHT_ADMIN_MASTER_PASSWORD="senhaSegura"
export PLAYWRIGHT_GESTOR_EMAIL="gestor@exemplo.com"
export PLAYWRIGHT_GESTOR_PASSWORD="senhaSegura"
export PLAYWRIGHT_SDR_EMAIL="sdr@exemplo.com"
export PLAYWRIGHT_SDR_PASSWORD="senhaSegura"
```

## Como rodar

### Apenas os testes de sub-apps

```bash
npx playwright test tests/sub-apps --project=chromium
```

### Com servidor dev embutido (se não houver nada rodando)

```bash
# Na pasta eb-dash2
npm run dev

# Em outro terminal, na raiz do projeto
npx playwright test tests/sub-apps --project=chromium
```

### Todos os testes do projeto

```bash
npx playwright test
```

## Limitações conhecidas

- Os testes de gestor/SDR assumem que as permissões de role (`app_role_permissions`) e permissões de módulo (`dashboard_user_permissions`) estão configuradas conforme a persona. Se as permissões reais forem diferentes, os testes de negação ainda passam, mas os testes de presença de apps específicos podem precisar de ajustes.
- O teste de metas cria um registro real no banco. Ele utiliza a área "Pré-Vendas" e app "Pré-Vendas"; caso o catálogo de indicadores mude, o teste pode precisar ser atualizado.

## Estrutura

```
tests/sub-apps/
├── README.md
├── access.spec.ts
├── goals-app.spec.ts
└── helpers/
    ├── login.ts
    └── users.ts
```
