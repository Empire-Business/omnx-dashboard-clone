# Admin Dashboard

> **Versão:** 1.0
> **Última atualização:** 2026-06-30
> **Público:** Desenvolvedores e admins
> **Local:** `eb-dash2/src/pages/admin/AdminPage.tsx`, `eb-dash2/src/components/admin/GhlStatusCard.tsx`

---

## Visão geral

A página `/admin` é a central de gestão do Empire. Ela foi redesenhada para priorizar o que move dinheiro — a integração com o GoHighLevel (GHL) — e separar visualmente as configurações de **negócio** das configurações de **plataforma**.

A estrutura segue a decisão do Conselho dos Mestres (ver `conselho-admin-dashboard-2026-06-30/`):

- **Negócio:** integração GHL, com status binário e checklist de setup.
- **Plataforma:** Usuários, Apps e Permissões.

---

## Componentes

| Arquivo | Responsabilidade |
|---|---|
| `AdminPage.tsx` | Orquestra as seções Negócio e Plataforma. Busca dados de settings, campos, pipelines e stages. |
| `GhlStatusCard.tsx` | Card protagonista que mostra o status da integração GHL e o checklist de setup. |
| `AdminLayout.tsx` | Layout com sidebar própria para a área admin. |
| `AdminMenu.tsx` | Dropdown no header dos apps. Agora só contém atalhos secundários (Pessoas, Apps) e logout. |

---

## Status da integração GHL

O `GhlStatusCard` calcula o status a partir dos hooks existentes:

- **`disconnected`**: não há `ghl_location_id` salvo.
- **`incomplete`**: há `ghl_location_id`, mas faltam campos, pipelines ou stages mapeados.
- **`connected`**: `ghl_location_id` + campos + pipelines + stages mapeados.

### Checklist de setup

| Item | Regra de concluído |
|---|---|
| Location ID salvo | `settings?.ghl_location_id` existe |
| API Key configurada | assume-se verdadeiro quando há settings (a chave é secret das edge functions) |
| Campos obrigatórios mapeados | `fieldMappings.length > 0` |
| Pipelines e stages classificados | `pipelineMappings.length > 0 && stageMappings.length > 0` |
| Webhook GHL configurado | assume-se verdadeiro quando há settings (a URL é gerada automaticamente) |

> **Nota:** a regra de "campos obrigatórios" é simplificada. Futuramente pode ser refinada para verificar campos específicos do template Empire Default.

---

## Navegação

A Integração GHL não está mais no dropdown Admin. O caminho principal é:

```
Apps → Admin (menu lateral/header) → /admin → card "Conectar ao GoHighLevel"
```

A URL `/workspace/ghl-config` continua funcionando e é acessada pelo botão do card.

---

## KPIs

Métricas a serem acompanhadas:

- **Tempo médio para setup GHL verde** — desde o primeiro acesso do admin até o status "connected".
- **Taxa de ativação em 7 dias** — percentual de contas que deixam o status verde na primeira semana.
- **Taxa de self-service** — contas que configuram sem abrir ticket.

---

## Testes

- `tests/admin-nav.spec.ts`: valida navegação do dropdown Admin e conteúdo da `/admin`.
- `tests/ghl-config-security.spec.ts`: valida que a API Key não é exposta.
- `tests/ghl-mapping-wizard.spec.ts`: valida o wizard de mapeamento acessado pelo card.

---

## Próximas melhorias

1. Refinar a regra de "campos obrigatórios" comparando com o template Empire Default.
2. Adicionar status de última sincronização e alertas de erro da integração.
3. Expandir a seção Negócio para outras integrações futuras.
