# Fase 3 — Resultados da POC da Agency API do GHL

| Campo | Valor |
|-------|-------|
| **Status** | ✅ Decisão tomada (2026-07-11) — token de agência fica **somente leitura**, sem escopo de "Editar usuários" |
| **Data** | 2026-07-11 |
| **Plano base** | [`docs/PLANO-MULTI-TENANT-AGENCY.md`](PLANO-MULTI-TENANT-AGENCY.md) seção 6.2 |
| **Script** | `scripts/poc-fase3-ghl-agency-api.ts` (`npx tsx scripts/poc-fase3-ghl-agency-api.ts`) |
| **Onde rodou** | Contra a API real do GHL, com o token de agência do dono (`.env.test`, nunca commitado). **Não** usa o banco de teste — chama a API do GHL direto. |

> Decisão do dono: sem staging provisionado, esta POC responde as perguntas de **comportamento da API GHL** (não de volume/performance) diretamente com um token real.

---

## Resultado por dimensão (seção 6.2 do plano-mãe)

### Dimensão 1 — Existência/tipo do endpoint de descoberta: ✅ CONFIRMADO (com ressalva)

- `GET /oauth/installedLocations` (o endpoint "oficial" de apps Marketplace/OAuth) → **401**. Confirma a suspeita do plano: esse endpoint específico não aceita Private Integration Token.
- `GET /locations/search?companyId={id}` (endpoint alternativo) → **200 OK**, retornou **5 sub-contas** da agência, todas de uma vez, com o mesmo Private Integration Token.
- `GET /locations/{locationId}` para 3 dessas 5 sub-contas → **200 OK** em todas — o token lê detalhes de qualquer sub-conta da agência, não só uma.

**Conclusão:** existe, sim, um caminho de descoberta agency-wide funcionando com Private Integration Token — só não é o endpoint que o plano original assumia (`installedLocations`), e sim `/locations/search`.

### Dimensão 2 — Modelo de consentimento por sub-conta: 🟡 Indício positivo, não fechado

`/locations/search` retornou as 5 sub-contas já existentes sem nenhuma ação manual de aprovação por location — indício de que a descoberta é "zero toque" para sub-contas **já existentes**. **Não testado ainda:** o caso de uma sub-conta **criada depois** da geração do token (o critério de go/no-go do plano exige isso explicitamente, para confirmar que é descoberta contínua e não só o estado inicial). Requer criar 1 sub-conta de teste nova.

### Dimensão 3 — Modelo de entrega de webhooks (apps Marketplace): ⬜ Não testável nesta rodada

Exige um App Marketplace de fato instalado (não só um Private Integration Token) para observar o payload real de webhook. Fora do escopo deste script — item separado, maior.

### Dimensão 4 — Confiabilidade do campo de admin: ❌ BLOQUEADO (achado real)

`GET /users/?locationId={id}` → **401**, corpo: `{"statusCode":401,"message":"Token's user type mismatch!"}`, repetido nas 3 sub-contas testadas.

**Leitura:** o token consegue listar/ler *locations*, mas não consegue ler *usuários* de cada sub-conta com a configuração atual. Duas hipóteses prováveis (não confirmadas sem mais investigação):
1. O Private Integration foi criado sem o escopo de leitura de "Users"/"Contactos internos" — precisa recriar ou editar o token no painel do GHL incluindo esse escopo.
2. Esse endpoint específico de usuários exige um tipo de token diferente (ex.: token de location, não de agência) — nesse caso, a "descoberta automática de admin por sub-conta" do fluxo original (seção 6.1) não funcionaria com um único token de agência, e o convite de admin continuaria precisando de um passo manual por sub-conta (o que já é o comportamento **BYOK semi-assistido**, plano de fallback previsto na própria seção 6.2).

---

## Decisão do dono (2026-07-11) — token de agência fica só-leitura, dados vêm por BYOK de sub-conta

Ao investigar o bloqueio da dimensão 4, descobriu-se que o painel do GHL só oferece o escopo
**"Editar usuários"** (não existe um escopo "Ler usuários" mais restrito) para conceder ao
Private Integration Token de agência a capacidade de listar admins por sub-conta.

**O dono avaliou e recusou conceder esse escopo.** Motivo: um token de agência com permissão de
**edição** de usuários tem um raio de explosão muito maior do que um token por sub-conta — se
esse único segredo vazar (log, commit acidental, print), um atacante poderia **alterar** usuários
em **todas** as sub-contas da agência de uma vez, não só ler. Isso vai na direção contrária de
tudo que a Fase 2 já construiu (credencial isolada por workspace, nunca uma chave global
poderosa) e do princípio de menor privilégio já seguido no resto do projeto.

**Decisão adotada — modelo híbrido:**

1. **Token de agência (Private Integration, escopo atual, sem "Editar usuários") fica só para
   DESCOBERTA da lista de sub-contas** — o que já funciona hoje via `/locations/search`
   (dimensão 1, confirmada). Serve para a área `/agency/*` mostrar "encontramos N sub-contas
   suas" sem precisar que o dono cadastre cada uma manualmente.
2. **Todo acesso a dados de cada sub-conta (contatos, oportunidades, usuários/admins) continua
   vindo da chave DAQUELA sub-conta especificamente** — via o fluxo BYOK já entregue na Fase 4
   (`/workspace/integracoes`, RPC `save_workspace_credential`). Cada cliente cola a própria
   chave da própria sub-conta.
3. Isso **é exatamente** o caminho "BYOK semi-assistido" que a seção 6.2 do plano-mãe já previa
   como fallback caso a descoberta 100% automática de admins não desse certo — não é um desvio
   do plano, é o próprio plano B, agora confirmado como o caminho real a seguir.
4. **Fase 3, redefinida:** não é mais "auto-descoberta com convite automático de admin". Passa a
   ser "**lista de sub-contas descobertas automaticamente + convite/instrução para o admin de
   cada uma conectar a própria chave**" — reaproveitando 100% da UI e da RPC já existentes da
   Fase 4, sem nenhuma credencial de agência poderosa o suficiente para preocupar.

**Impacto no desenho original (seção 6.1 do plano-mãe):** o passo "chama a API de Usuários do
GHL daquele location para levantar candidatos a admin" deixa de existir — não é mais necessário,
porque não é o token de agência que vai convidar ninguém. Quando uma sub-conta é descoberta
(`agency_workspaces.status='pending'`), a área `/agency/*` mostra um card "conecte a chave desta
sub-conta" em vez de um painel de aprovação de candidatos a admin. Mais simples e mais seguro que
o desenho original.

## Próximos passos concretos (revisados após a decisão acima)

1. ~~Verificar/ajustar o escopo do Private Integration para incluir "Editar usuários"~~ — **descartado deliberadamente** (decisão de segurança acima). O token de agência permanece com o escopo mínimo que já tem hoje.
2. **Criar 1 sub-conta de teste nova** sob a mesma agência e reexecutar o script — fecha a dimensão 2 (descoberta contínua via `/locations/search`), que é a única parte do critério de go/no-go que ainda depende do token de agência.
3. Dimensão 3 (webhook) e dimensão 4 (campo de admin) **saem do critério de go/no-go da Fase 3** — deixaram de ser necessárias, já que o convite de admin não depende mais do token de agência (é sempre BYOK por sub-conta, seção acima).
4. Próximo passo de código (não feito ainda): endpoint/RPC que usa `/locations/search` para popular `agency_workspaces` com `status='pending'` para sub-contas novas, e a UI da área `/agency/*` mostrando "conecte a chave desta sub-conta" para cada uma pendente.

## Critério de go/no-go (revisado)

O critério original do plano-mãe (3+ locations, incluindo 1 criada depois, **mais** webhook e admin confiáveis) foi **substituído** pelo modelo híbrido acima, que é mais simples de fechar:
- Descoberta de locations existentes ✅ (dimensão 1 confirmada).
- Descoberta de location criada **depois** do token ⬜ (único item pendente — passo 2 acima).
- Webhook (dimensão 3) e admin (dimensão 4) — **não são mais gate**, pois o dado sensível sempre vem da chave da própria sub-conta via BYOK, nunca do token de agência.

**Recomendação honesta:** a Dimensão 1 já é uma vitória concreta e inesperadamente positiva (a suposição do plano original — que `installedLocations` seria obrigatório — estava certa em teoria, mas existe um caminho alternativo funcional). A Dimensão 4 bloqueada não impede continuar a POC — só significa que "aprovar automaticamente o admin certo" pode não ser viável com token único, reforçando ainda mais o desenho já existente no plano (candidatos ficam pendentes de aprovação humana, nunca convite automático — seção 6.1, item de correção da v2).
