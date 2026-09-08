# Relatório de Erros Encontrados

**Data da auditoria:** 2026-03-20  
**Escopo:** auditoria local do repositório, com leitura completa do `CLAUDE.md`, inspeção estrutural, checagens automáticas e conferência de inconsistências entre documentação e código.  
**Importante:** eu **não alterei nenhum arquivo de código**. Este documento é só diagnóstico.

---

## 1. Resumo em linguagem simples

Se este projeto fosse um carro, o diagnóstico seria este:

- O motor liga: o frontend **builda**.
- O painel está cheio de luz vermelha: o **lint falha com muitos erros**.
- O manual está errado em partes: há **documentação que não bate com o código real**.
- A bancada de testes está mal ligada: os **testes de integração não rodam do jeito que estão**.

### Resultado direto

- `CLAUDE.md` foi lido **100%**.
- O build do app principal **passou**.
- O lint do app principal **quebrou** com **56 erros e 1 aviso**.
- Os testes de integração em TypeScript **não executam** com `node --test`.
- Há **credenciais sensíveis hardcoded** em scripts versionados.
- O fluxo de **OTP está inconsistente**: frontend em `8` dígitos, config local do Supabase em `6`.
- A configuração local de auth/redirect do Supabase **não bate** com a porta real do app (`3222`).
- O `supabase/config.toml` aponta para um **`seed.sql` inexistente**.
- O login perde **query params** da rota original, quebrando retorno exato após autenticação.
- A documentação tem **links quebrados em lote** e arquivos referenciados que não existem.
- Há documentação afirmando que o sistema está “sem bugs remanescentes”, mas o estado atual do código **não confirma isso**.

---

## 2. Como a auditoria foi feita

### Leitura e inspeção

- Leitura integral de `CLAUDE.md` (`309` linhas).
- Inspeção da estrutura do repositório.
- Leitura de arquivos-chave como:
  - `package.json`
  - `eb-dash2/package.json`
  - `README.md`
  - `eb-dash2/eslint.config.js`
  - arquivos que o lint marcou como problemáticos

### Comandos executados

- `npm --prefix eb-dash2 run build`
- `npm --prefix eb-dash2 run lint`
- `node --test __tests__/integration/*.test.ts`
- buscas locais com `rg` para dependências, arquivos e inconsistências

### O que eu não validei

- Não validei serviços externos de verdade em runtime, como Supabase remoto, Vercel e APIs do GHL.
- Não alterei nada para “ver se funciona depois”.
- Não rodei correções automáticas.
- Não consegui validar stack local do Supabase via `supabase status` porque o ambiente respondeu: `Cannot connect to the Docker daemon`.
- Não consegui usar `supabase functions list` como prova de deploy porque a CLI exigiu `SUPABASE_ACCESS_TOKEN`.

---

## 3. O que passou

Nem tudo está quebrado. Isso importa porque evita diagnóstico exagerado.

### Build do frontend

O comando `npm --prefix eb-dash2 run build` terminou com sucesso.

Isso significa:

- TypeScript e Vite conseguem gerar a versão de produção do app.
- O projeto **não está morto**.
- Os problemas encontrados estão muito mais concentrados em **qualidade, manutenção, conformidade com regras de lint e confiabilidade de testes** do que em “o app nem compila”.

### Observação importante do build

Mesmo passando, o build avisou:

- `dist/assets/index-JxDrbfPf.js` ficou com **848.46 kB**
- o Vite avisou que há chunks acima de `500 kB`

Isso **não quebra o sistema agora**, mas é um alerta real de performance e manutenção.

**Sugestão simples:** fazer code splitting com `dynamic import()` ou configurar `manualChunks`.

---

## 4. Erros confirmados

## 4.1. Lint quebrado no app principal

**Gravidade:** Alta  
**Comando:** `npm --prefix eb-dash2 run lint`  
**Resultado:** falha com **56 erros e 1 warning**

### Em português simples

O lint é como um fiscal de qualidade do código. Quando ele quebra com esse volume de erro, o recado é:

- há padrões perigosos ou mal mantidos;
- a base está ficando mais difícil de evoluir;
- novas mudanças podem empilhar mais problemas sem ninguém perceber.

### Tipos de erro encontrados

| Regra | Quantidade | O que isso quer dizer em português claro |
|---|---:|---|
| `react-hooks/set-state-in-effect` | 20 | tem efeito que já entra mudando estado de forma que pode causar render extra e comportamento confuso |
| `@typescript-eslint/no-explicit-any` | 16 | o código está “desligando o detector de tipos” em vários pontos |
| `react-hooks/static-components` | 5 | componentes estão sendo criados dentro do render, o que pode resetar estado e piorar performance |
| `@typescript-eslint/no-unused-vars` | 4 | variável declarada e não usada |
| `react-refresh/only-export-components` | 3 | arquivo de componente está exportando coisa extra que atrapalha Fast Refresh |
| `@typescript-eslint/no-unused-expressions` | 3 | expressão solta sem efeito útil real |
| `react-hooks/exhaustive-deps` | 1 | dependência faltando em `useEffect` |
| `@typescript-eslint/no-empty-object-type` | 1 | tipo vazio desnecessário |
| `prefer-const` | 1 | variável declarada com `let` sem necessidade |
| `no-empty` | 1 | bloco `catch` vazio |
| `react-hooks/immutability` | 1 | variável mutada de forma que o lint considera frágil para render |
| `react-hooks/rules-of-hooks` | 1 | hook chamado de forma condicional, o que é erro importante em React |

### Exemplos concretos mais importantes

#### A. Hook chamado condicionalmente

- Arquivo: `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx`
- Linha marcada pelo lint: `588`

**Problema:** `useMemo` aparece depois de um `if (loading) return ...`.

**Por que isso é sério:** Hook em React tem ordem sagrada. Se ele roda numa render e na outra não roda, o React pode embaralhar estados internos.

**Sugestão:** mover todos os hooks para antes de qualquer retorno condicional.

---

#### B. Componente criado dentro do render

- Arquivo: `eb-dash2/src/pages/ForgotPasswordPage.tsx`
- Trecho: linha `34` define `const Background = () => (...)`
- Uso: linha `45` e linha `83`

- Arquivo: `eb-dash2/src/pages/ResetPasswordPage.tsx`
- Trecho: linha `77` define `const Background = () => (...)`
- Uso: linhas `98`, `121` e `150`

**Problema em linguagem simples:** o componente está sendo “fabricado de novo” toda vez que a tela renderiza.

**O risco:** perda de estado local, render desnecessário e comportamento inconsistente.

**Sugestão:** mover `Background` para fora do componente principal ou extrair para um componente próprio.

---

#### C. `setState` direto dentro de `useEffect`

Exemplos:

- `eb-dash2/src/components/leads/LeadCard.tsx:745-758`
- `eb-dash2/src/components/leads/LeadCard.tsx:925-927`
- `eb-dash2/src/components/ui/select.tsx:48-50`
- `eb-dash2/src/hooks/useSDRLeaderboard.ts:100-103`
- `eb-dash2/src/hooks/useSDRLeaderboard.ts:192-197`
- `eb-dash2/src/pages/SettingsPage.tsx:288-297`
- `eb-dash2/src/pages/settings/UsersPage.tsx:110`
- várias tabs de `traqueamento/`

**Explicação simples:** o efeito entra em ação e já dispara mudança de estado na hora. Em vários casos isso não é fatal, mas é um cheiro ruim porque aumenta a chance de renderização em cascata e código difícil de prever.

**Sugestão:** onde der, transformar em:

- valor derivado;
- inicialização via `useState(() => ...)`;
- ação assíncrona dentro do efeito com callback estável;
- ou reset controlado no evento que abre/fecha a tela, em vez de reagir depois.

---

#### D. `any` espalhado em consultas e mapeamentos

Exemplos:

- `eb-dash2/query_top_ads_v2.ts`
- `eb-dash2/query_top_ads_v3.ts`
- `eb-dash2/query_top_ads_with_names.ts`
- `eb-dash2/src/components/prevendas/AlertasCard.tsx:80-86`
- `eb-dash2/src/hooks/useLeads.ts:207, 310, 311`
- `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx:311, 448`

**Em português claro:** `any` é como desligar o airbag da tipagem. O código continua andando, mas você perde proteção.

**Sugestão:** trocar `any` por tipos de resposta reais do Supabase, interfaces locais ou `unknown` com validação.

---

#### E. Mutação manual durante render

- Arquivo: `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx`
- Linha `245` cria `let cumAngle = ...`
- Linha `252` faz `cumAngle += angle`

**Problema:** o lint considerou isso frágil dentro do render.

**Tradução:** o desenho do gráfico funciona, mas o jeito usado para acumular ângulo não é o mais seguro para o modelo mental do React.

**Sugestão:** substituir por `reduce` ou gerar os ângulos sem mutação externa.

---

### Inventário completo do lint por arquivo

| Arquivo | Erros | Avisos | Regras encontradas |
|---|---:|---:|---|
| `eb-dash2/query_top_ads_v2.ts` | 3 | 0 | `@typescript-eslint/no-explicit-any: 3` |
| `eb-dash2/query_top_ads_v3.ts` | 2 | 0 | `@typescript-eslint/no-explicit-any: 2` |
| `eb-dash2/query_top_ads_with_names.ts` | 2 | 0 | `@typescript-eslint/no-explicit-any: 2` |
| `eb-dash2/src/components/leads/LeadCard.tsx` | 2 | 1 | `react-hooks/set-state-in-effect: 2`, `react-hooks/exhaustive-deps: 1` |
| `eb-dash2/src/components/prevendas/AlertasCard.tsx` | 4 | 0 | `@typescript-eslint/no-explicit-any: 4` |
| `eb-dash2/src/components/ui/badge.tsx` | 1 | 0 | `react-refresh/only-export-components: 1` |
| `eb-dash2/src/components/ui/button.tsx` | 1 | 0 | `react-refresh/only-export-components: 1` |
| `eb-dash2/src/components/ui/label.tsx` | 1 | 0 | `@typescript-eslint/no-empty-object-type: 1` |
| `eb-dash2/src/components/ui/select.tsx` | 1 | 0 | `react-hooks/set-state-in-effect: 1` |
| `eb-dash2/src/contexts/AuthContext.tsx` | 1 | 0 | `react-refresh/only-export-components: 1` |
| `eb-dash2/src/hooks/useLeads.ts` | 3 | 0 | `@typescript-eslint/no-explicit-any: 3` |
| `eb-dash2/src/hooks/usePreVendas.ts` | 1 | 0 | `prefer-const: 1` |
| `eb-dash2/src/hooks/useSDRLeaderboard.ts` | 2 | 0 | `react-hooks/set-state-in-effect: 2` |
| `eb-dash2/src/hooks/useTrafego.ts` | 1 | 0 | `no-empty: 1` |
| `eb-dash2/src/pages/ForgotPasswordPage.tsx` | 2 | 0 | `react-hooks/static-components: 2` |
| `eb-dash2/src/pages/ResetPasswordPage.tsx` | 3 | 0 | `react-hooks/static-components: 3` |
| `eb-dash2/src/pages/SettingsPage.tsx` | 2 | 0 | `react-hooks/set-state-in-effect: 1`, `@typescript-eslint/no-unused-expressions: 1` |
| `eb-dash2/src/pages/dashboard/tabs/TrafegoTab.tsx` | 1 | 0 | `react-hooks/immutability: 1` |
| `eb-dash2/src/pages/leads/tabs/ListaTab.tsx` | 1 | 0 | `@typescript-eslint/no-unused-vars: 1` |
| `eb-dash2/src/pages/prevendas/tabs/GeralTab.tsx` | 2 | 0 | `@typescript-eslint/no-unused-vars: 2` |
| `eb-dash2/src/pages/prevendas/tabs/LeadsParadosTab.tsx` | 2 | 0 | `@typescript-eslint/no-explicit-any: 2` |
| `eb-dash2/src/pages/prevendas/tabs/SDRsTab.tsx` | 2 | 0 | `@typescript-eslint/no-unused-vars: 1`, `react-hooks/rules-of-hooks: 1` |
| `eb-dash2/src/pages/settings/UsersPage.tsx` | 4 | 0 | `react-hooks/set-state-in-effect: 2`, `@typescript-eslint/no-unused-expressions: 2` |
| `eb-dash2/src/pages/traqueamento/tabs/AnunciosTab.tsx` | 2 | 0 | `react-hooks/set-state-in-effect: 2` |
| `eb-dash2/src/pages/traqueamento/tabs/CodsUtmTab.tsx` | 7 | 0 | `react-hooks/set-state-in-effect: 7` |
| `eb-dash2/src/pages/traqueamento/tabs/FunisTab.tsx` | 1 | 0 | `react-hooks/set-state-in-effect: 1` |
| `eb-dash2/src/pages/traqueamento/tabs/OrganicoTab.tsx` | 1 | 0 | `react-hooks/set-state-in-effect: 1` |
| `eb-dash2/src/pages/traqueamento/tabs/OrigemTab.tsx` | 1 | 0 | `react-hooks/set-state-in-effect: 1` |

### Sugestão de ataque para corrigir o lint depois

Ordem sugerida:

1. corrigir `react-hooks/rules-of-hooks`
2. corrigir `react-hooks/static-components`
3. corrigir `react-hooks/set-state-in-effect`
4. reduzir `any`
5. limpar lixo de manutenção (`unused vars`, `prefer-const`, `no-empty`)

Essa ordem é a mais pragmática porque começa pelo que pode gerar comportamento errado, e deixa por último o que é mais “faxina”.

---

## 4.2. Testes de integração não estão executáveis do jeito atual

**Gravidade:** Alta  
**Comando:** `node --test __tests__/integration/*.test.ts`  
**Resultado:** falha com `ERR_UNKNOWN_FILE_EXTENSION` para `.ts`

### Evidências

- A raiz não tem script `test` em `package.json`
- O app `eb-dash2` também não tem script `test` em `eb-dash2/package.json`
- `npm test` na raiz falha com `Missing script: "test"`
- `npm --prefix eb-dash2 test` também falha com `Missing script: "test"`
- `__tests__/integration/permissions.test.ts:25` importa `vitest`
- `__tests__/integration/workspace-isolation.test.ts:17` importa `vitest`
- busca em `package.json`, `package-lock.json`, `eb-dash2/package.json` e `eb-dash2/package-lock.json` não encontrou `vitest`
- `__tests__/helpers/supabase-test-client.ts` diz para usar `.env.test`, mas esse arquivo não existe na raiz
- não foram encontrados testes próprios do app em `eb-dash2` fora de `node_modules`

### Em português simples

Hoje os testes parecem existir, mas a bancada para rodar eles não está montada direito.

É como ter prova impressa, mas faltar:

- a sala;
- o professor;
- ou a chave da porta.

### O que exatamente está errado

1. Os arquivos de teste são `.ts`
2. O comando usado foi `node --test`, que por padrão não entende esse formato aqui
3. Os testes importam `vitest`, mas `vitest` não aparece como dependência declarada localmente
4. Não há script oficial de teste para ninguém descobrir “o jeito certo” de rodar
5. A própria documentação de apoio dos testes aponta para arquivo morto (`docs/HANDOFF-DASHBOARD-EMPIRE.md`)

### Impacto

- você não consegue confiar que regressões importantes estejam sendo testadas;
- dois testes com propósito crítico de permissão/RLS estão presentes, mas na prática não entram em execução nesse estado;
- um time pode achar que “tem teste”, quando na verdade tem só arquivo de teste parado.

### Sugestão

Escolher um caminho e padronizar:

- ou usar **Vitest de verdade** com dependência, config e script;
- ou migrar os testes para o runner nativo do Node com suporte correto ao TypeScript;
- ou compilar os testes antes de executar.

**O pior cenário é o atual:** o projeto aparenta ter testes, mas o fluxo de execução está quebrado.

---

## 4.3. Credenciais sensíveis hardcoded em arquivos versionados

**Gravidade:** Crítica

### Evidências confirmadas

- `scripts/check-backfill.js:3-5` cria client Supabase com **service role key literal**
- `scripts/run-backfill.js:6-9` contém **service role key literal**
- `scripts/run-backfill-pg.js:7` contém **`DATABASE_URL` completo com credencial embutida**
- `scripts/set-user-password.js:4-5` usa `process.env... || '<service role key literal>'`
- `scripts/run-meta-ads-backfill.js:10-12` contém **anon key literal**
- `scripts/backfill-comunicacoes.py:28-37` contém **anon key literal**

### Em português simples

Isso é um erro sério de segurança operacional.

`service role key` é chave de poder alto.  
É como deixar a chave mestra do prédio colada na porta da portaria.

Mesmo a `anon key`, apesar de ser menos sensível, não deveria ficar espalhada em scripts como verdade fixa do sistema. Isso endurece acoplamento com um projeto específico e atrapalha rotação de credenciais.

### Impacto

- risco real de exposição e uso indevido da chave de administração;
- risco real de exposição direta de acesso ao banco;
- dificuldade para girar credenciais depois;
- scripts ficam presos a um projeto Supabase específico;
- aumenta a chance de alguém copiar, reaproveitar ou vazar chave sem perceber.

### Sugestão

- mover tudo para variáveis de ambiente;
- remover fallback com segredo embutido;
- rotacionar a `service role key` que já apareceu em arquivo versionado;
- invalidar também qualquer credencial de banco já exposta por URL literal.

---

## 4.4. Fluxo de OTP inconsistente: frontend pede 8 dígitos, Supabase local está em 6

**Gravidade:** Alta

### Evidências

- `eb-dash2/src/pages/OtpVerifyPage.tsx:8` define `OTP_LENGTH = 8`
- `eb-dash2/src/contexts/AuthContext.tsx:46-64` usa fluxo nativo do Supabase:
  - `supabase.auth.signInWithOtp(...)`
  - `supabase.auth.verifyOtp(...)`
- `supabase/config.toml:210-213` define `otp_length = 6`
- `docs/DECISOES.md` e `docs/ROADMAP.md` também falam em OTP de `8` dígitos

### Em português simples

O formulário e o servidor local estão falando idiomas diferentes.

O frontend espera um código com `8` números.  
O Supabase local está configurado para gerar `6`.

### O que pode acontecer na prática

- o usuário recebe um código de 6 dígitos;
- a tela exige 8;
- ele fica travado e acha que o sistema está quebrado.

### Sugestão

Escolher uma verdade única:

- ou o sistema inteiro usa `6`;
- ou o sistema inteiro usa `8`.

Hoje a documentação e a interface dizem uma coisa, mas a config local diz outra.

---

## 4.5. Redirects de auth locais não batem com a porta real do app

**Gravidade:** Alta

### Evidências

- `CLAUDE.md:307` e `eb-dash2/vite.config.ts:13` apontam desenvolvimento local em `3222`
- `eb-dash2/src/contexts/AuthContext.tsx:77-79` usa `window.location.origin/reset-password`
- `supabase/functions/invite-user/index.ts:91` usa fallback `http://localhost:3222/reset-password`
- `supabase/config.toml:150-152` permite só:
  - `http://127.0.0.1:3000`
  - `https://127.0.0.1:3000`

### Em português simples

O app abre numa porta, mas o guardinha do Supabase só aceita outra.

### O que pode acontecer

- fluxo de reset de senha local falhar;
- link de convite/recuperação ser rejeitado por redirect não autorizado;
- comportamento diferente entre local e produção, o pior tipo de bug para debug.

### Sugestão

Alinhar `site_url` e `additional_redirect_urls` com o host/porta reais usados pelo app local.

---

## 4.6. Documentação contraditória ou enganosa

**Gravidade:** Média para alta  
**Motivo:** documentação errada não quebra o app na hora, mas quebra manutenção, onboarding e tomada de decisão.

### A. `CLAUDE.md` diz React 18, mas o projeto usa React 19

**Evidência:**

- `CLAUDE.md:301` diz `Vite + React 18 + TypeScript`
- `eb-dash2/package.json:20-21` usa:
  - `react: ^19.2.0`
  - `react-dom: ^19.2.0`

**Por que isso é problema:** quem seguir a documentação pode tomar decisões erradas sobre hooks, compatibilidade e comportamento de tooling.

**Sugestão:** alinhar a documentação com o `package.json`, porque o código é a fonte de verdade aqui.

---

### B. `README.md` da raiz parece de outro projeto

**Evidência:**

- `README.md:1` abre com `# Supabase CLI`
- o conteúdo explica o repositório como se fosse o projeto oficial do Supabase CLI
- isso não corresponde ao sistema atual deste repositório

**Por que isso é problema:** alguém novo no projeto lê o README e entende o sistema errado já na primeira página.

**Sugestão:** reescrever o README da raiz para refletir:

- o que este projeto realmente é;
- onde fica o app principal (`eb-dash2`);
- como rodar build/lint/testes;
- quais docs são canônicas.

---

### C. Documentação afirma “nenhum bug remanescente”, mas o estado atual não sustenta isso

**Evidência:**

- `docs/ROADMAP.md:108` diz: `nenhum bug remanescente`
- `docs/MUDANCAS.md:1699` diz: `Nenhum bug remanescente.`
- `docs/MUDANCAS.md:1744-1746` reforça que não há bug de timezone remanescente
- porém, o lint local atual falha com 56 erros e 1 aviso

### Observação honesta

Isso não prova automaticamente que os docs de timezone estão errados no conteúdo técnico deles. O que prova é outra coisa:

- a frase “nenhum bug remanescente” está **forte demais** para o estado atual do repositório;
- a documentação transmite uma sensação de limpeza total que o código local **não confirma**.

**Sugestão:** trocar frases absolutas por algo verificável, por exemplo:

- “nenhum bug de timezone confirmado nesta auditoria específica”
- ou “auditoria concluída para escopo X, sujeito a lint e revisão contínua”

---

## 4.7. `supabase/config.toml` aponta para `seed.sql` que não existe

**Gravidade:** Alta

### Evidências

- `supabase/config.toml:60-65` define:
  - `[db.seed]`
  - `enabled = true`
  - `sql_paths = ["./seed.sql"]`
- o arquivo `supabase/seed.sql` **não existe**

### Em português simples

A configuração manda carregar uma semente que não está no saco.

### O que isso pode causar

- falha ou surpresa em fluxos locais de reset/seed do banco;
- onboarding confuso;
- ambiente local inconsistente entre pessoas do time.

### Sugestão

- ou criar o arquivo esperado;
- ou desligar/ajustar a referência no config.

---

## 4.8. Cobertura de TypeScript incompleta fora do app principal

**Gravidade:** Média

### Evidências

- `eb-dash2/tsconfig.app.json` inclui apenas `src`
- os testes ficam em `__tests__/`
- há vários `.ts` soltos fora de `src`, por exemplo:
  - `eb-dash2/query_top_ads_v2.ts`
  - `eb-dash2/query_top_ads_v3.ts`
  - `eb-dash2/query_top_ads_with_names.ts`

### Em português simples

O build passa, mas ele não olha tudo.

É como revisar só o miolo do livro e fingir que capa, apêndice e anexos não existem.

### Impacto

- parte do repositório pode quebrar sem aparecer no build principal;
- cria falsa sensação de “TypeScript está cobrindo tudo”.

### Sugestão

Declarar claramente o que é código suportado e o que é script solto.  
Se for código importante, ele precisa entrar numa malha oficial de validação.

---

## 4.9. Templates e READMEs genéricos não representam o projeto real

**Gravidade:** Média

### Evidências

- `README.md` da raiz é do Supabase CLI
- `eb-dash2/README.md` é o template padrão de `React + TypeScript + Vite`
- `.env.template` é um template genérico de Next.js/NextAuth:
  - usa `NEXT_PUBLIC_*`
  - fala de `NEXTAUTH_*`
  - manda copiar para `.env.local`
- o app real usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em `eb-dash2/src/lib/supabase.ts`

### Em português simples

Você abre a gaveta procurando o manual do sistema e encontra o manual de outro eletrodoméstico.

### O que pode acontecer

- onboarding errado;
- configuração errada de ambiente;
- tempo perdido seguindo instrução que não serve para este projeto.

### Sugestão

Substituir templates genéricos por documentação mínima, mas verdadeira.

---

## 4.10. Documentação com links quebrados em lote

**Gravidade:** Média

### Evidências

Uma varredura automática de links Markdown dentro de `docs/` encontrou **21 links quebrados**.

Exemplos confirmados:

- `docs/ARQUITETURA.md` → `AI-INSTRUCTIONS.md` inexistente
- `docs/BUG-FIX-PIPELINE-NULL.md` → `../TABELAS-SISTEMA.md` resolve para caminho errado
- `docs/COMUNICACOES-SCHEMA.md` → `../APIS-DOCS/ghl-conversations-api.md` e `../COMUNICACOES-GHL-SYNC.md` com relativo incorreto
- `docs/CONCEITOS-NEGOCIO.md` → `../ANALISE-COHORT-VS-PRODUTIVIDADE.md` quebrado
- `docs/DASHBOARD-MODULOS.md` → `PRD-DASHBOARD-EMPIRE.md` e `PRD-CRM.md` inexistentes
- `docs/KPI-SDR-TEMPO-RESPOSTA.md` → `KPI-SDR-SEM-RESPOSTA.md` inexistente
- `docs/TAGS-GHL.md` → links `docs/...` a partir de arquivo que já está dentro de `docs/`
- `docs/webhooks-ghl/DECISOES/20260226-correcao-extracao-com-fallbacks.md` → relativos quebrados para `supabase/` e `plans/`

### Em português simples

O mapa tem várias placas apontando para ruas que não existem.

### Impacto

- quem tenta estudar o sistema pela documentação cai em beco sem saída;
- handoff, troubleshooting e auditoria ficam mais lentos;
- aumenta a chance de repetir erro já resolvido, porque a trilha documental não fecha.

### Sugestão

Rodar uma checagem de links como etapa padrão de documentação.

---

## 4.11. Testes e docs apontam para arquivo de handoff inexistente

**Gravidade:** Média

### Evidências

- `__tests__/integration/permissions.test.ts:16` referencia `docs/HANDOFF-DASHBOARD-EMPIRE.md`
- `__tests__/integration/workspace-isolation.test.ts:8` referencia o mesmo arquivo
- `docs/HANDOFF-DASHBOARD-EMPIRE.md` **não existe**

### Em português simples

Os próprios testes citam um “manual de instrução” que sumiu.

### Impacto

- piora a rastreabilidade dos testes;
- dificulta entender intenção e critério de aceitação.

### Sugestão

Ou restaurar a referência correta, ou remover a referência morta.

---

## 4.12. Tooling com sinais de configuração incompleta

**Gravidade:** Média

### Evidência

Ao tentar rodar:

- `npm --prefix eb-dash2 run lint -- --format unix`

o ESLint respondeu:

- `The unix formatter is no longer part of core ESLint`

### Em português simples

Isso não é um “bug de produto”, mas mostra que o projeto depende de um conjunto de ferramentas que não está completamente amarrado ou documentado.

### Impacto

- dificulta auditoria automatizada;
- aumenta diferença entre máquina de um desenvolvedor e de outro;
- pode gerar “na minha máquina funciona”.

### Sugestão

- manter scripts oficiais claros no `package.json`;
- documentar o fluxo suportado;
- evitar depender de formatters/runners que não estão instalados.

---

## 4.13. Bundle principal está grande demais

**Gravidade:** Média  
**Comando:** `npm --prefix eb-dash2 run build`

### Evidência

O build passou, mas gerou este alerta:

- `dist/assets/index-JxDrbfPf.js` com **848.46 kB**
- Vite avisou que chunks acima de `500 kB` merecem divisão

### Em português simples

O sistema entra no ar, mas está carregando um bloco grande demais.  
Isso costuma virar:

- carregamento inicial mais pesado;
- pior experiência em internet ruim;
- manutenção mais difícil no longo prazo.

### Sugestão

- dividir telas grandes por rota;
- lazy load em módulos menos usados;
- separar dependências pesadas.

---

## 4.14. Login perde query params da rota protegida

**Gravidade:** Alta

### Evidências

- `AuthGuard.tsx` salva a `location` inteira ao redirecionar para login
- `LoginPage.tsx` recupera apenas `pathname`
- `OtpVerifyPage.tsx` usa o `redirect` já truncado

### Em português simples

Se o usuário entra numa rota com filtros ou aba específica, o sistema lembra só o endereço “base” e esquece o resto.

Exemplo prático:

- usuário tenta abrir `/pre-vendas?tab=sdrs&mql=1`
- cai no login
- depois volta só para `/pre-vendas`

### Impacto

- quebra deep-link;
- perde contexto do usuário;
- filtros/abas podem sumir após autenticação.

### Sugestão

Preservar `pathname + search` no redirecionamento e no retorno.

---

## 4.15. Navegação de `/settings` é inconsistente

**Gravidade:** Média

### Evidências

- a rota `/settings` existe em `App.tsx`
- no sidebar, `Configurações` tem `children`, então o item pai vira botão de expandir, não link real
- a navegação lateral exposta leva para `/settings/users`
- existe também um `navigate('/settings')` no menu do usuário do sidebar

### Em português simples

A sala existe, mas cada porta leva para ela de um jeito diferente.

### Impacto

- a rota não está totalmente morta, mas está escondida de forma inconsistente;
- dependendo de onde o usuário navega, ele acha a tela ou não acha;
- aumenta a sensação de interface “quebrada” sem estar quebrada tecnicamente.

### Sugestão

Decidir um padrão único:

- ou o item pai navega;
- ou ele só expande e a rota pai deixa de existir;
- ou a tela pai vira uma tela-resumo realmente acessível pelos dois caminhos.

---

## 4.16. Fallback hardcoded para `GHL_LOCATION_ID` no frontend e no backend

**Gravidade:** Média

### Evidências

- `LeadCard.tsx` usa fallback fixo para `VITE_GHL_LOCATION_ID`
- `supabase/functions/sync-contact-opportunities/index.ts:15` usa fallback fixo para `GHL_LOCATION_ID`
- `supabase/functions/reconcile-contact-opportunities/index.ts:16` usa fallback fixo para `GHL_LOCATION_ID`
- os valores entram em fluxos que montam URLs/chamadas para o GHL

### Em português simples

Se a variável de ambiente faltar, o sistema não acusa erro.  
Ele segue usando um ID fixo específico de location.

### Impacto

- link pode abrir a conta/local errado;
- edge function pode consultar ou reconciliar location errada;
- erro fica silencioso, o que é pior para suporte.

### Sugestão

Melhor falhar explicitamente do que abrir link para lugar possivelmente errado.

---

## 4.17. Dependências declaradas sem uso no frontend

**Gravidade:** Baixa a média

### Evidências

Declaradas em `eb-dash2/package.json`, mas sem importações encontradas em `eb-dash2/src`:

- `@hookform/resolvers`
- `next-themes`
- `react-hook-form`
- `zod`

### Em português simples

É peso morto na mochila.

### Impacto

- aumenta ruído mental;
- piora manutenção;
- pode esconder tentativa antiga de arquitetura que nunca foi concluída.

### Sugestão

Remover o que não é usado ou documentar por que ainda está aí.

---

## 4.18. Componente órfão no frontend

**Gravidade:** Baixa

### Evidências

- `MetaProgressCard` é exportado
- não foram encontrados imports desse componente em `eb-dash2/src`

### Em português simples

Existe peça fabricada, mas não encaixada em lugar nenhum.

### Sugestão

Confirmar se é legado morto ou componente reservado para uso futuro.

---

## 4.19. Função de diagnóstico com configuração hardcoded e sem falha explícita

**Gravidade:** Média

### Evidências

- `supabase/functions/diag-ghl/index.ts:1` usa `GHL_API_KEY || ''`
- `supabase/functions/diag-ghl/index.ts:2` fixa `LOCATION_ID = 'U8FTcw90CB5QELUnbGUu'`
- `supabase/functions/diag-ghl/index.ts:6` faz request para a API do GHL sem checar se a env existe

### Em português simples

É uma função “de diagnóstico”, mas ela já nasce com um ID preso no código e não reclama claramente se a chave estiver faltando.

### Impacto

- diagnóstico pode consultar location errada;
- em ambiente mal configurado, a função faz request inválido em vez de falhar com mensagem clara;
- troubleshooting vira adivinhação.

### Sugestão

Ferramenta de diagnóstico deveria ser a primeira a falhar alto quando a configuração está errada.

---

## 4.20. Pasta de migrations contém arquivos de teste, deleção e backup versionados

**Gravidade:** Baixa a média

### Evidências

Arquivos rastreados dentro de `supabase/migrations/`:

- `20260219010949_deletar_tabela_teste.sql`
- `20260219122854_limpar_webhooks_teste.sql`
- `20260219081603_criar_tabela_webhooks_ghl.sql.bak`
- `20260219081834_fix_webhooks_ghl.sql.bak`
- `DELETAR_20260226000000_create_ai_assistant_infra.sql`

### Em português simples

A gaveta de migrations oficiais está misturada com rascunho, backup e arquivo com nome de “deletar”.

### Impacto

- aumenta risco de erro humano;
- dificulta auditoria;
- piora confiança sobre o que é migration oficial e o que é entulho histórico.

### Sugestão

Separar claramente material histórico/backup do diretório de migrations operacionais.

---

## 4.21. Migrations SQL estão acopladas ao projeto Supabase específico

**Gravidade:** Média para alta

### Evidências

Há migrations executáveis com URLs hardcoded para o projeto `qzesffnkqgelmtfblzkr`, por exemplo:

- `20260225101000_create_backfill_meta_ads_job.sql`
- `20260314300000_create_sync_opp_dates_cron.sql`
- `20260317200000_trigger_contact_opp_sync_on_webhook.sql`
- `20260319105000_schedule_sync_contact_tags_cron.sql`
- `20260322010001_schedule_reconcile_contact_opportunities_crons.sql`
- `20260323000003_schedule_ghl_api_worker_cron.sql`
- `20260324000000_harden_ghl_api_queue_and_fix_conversations_cron.sql`

### Em português simples

Essas migrations não descrevem só comportamento do banco. Elas já nascem amarradas a um projeto remoto específico.

### Impacto

- migrar ou clonar o projeto para outro ambiente fica arriscado;
- aplicar a migration no lugar errado pode fazer cron chamar o projeto original;
- reduz portabilidade e previsibilidade do setup.

### Sugestão

Evitar que migration carregue endereço absoluto de um projeto específico sem uma camada clara de parametrização.

---

## 4.22. Documentação e planos ainda carregam muito legado de `eb-dash/`

**Gravidade:** Média

### Evidências

- uma busca em `docs/` e `plans/` encontrou **116 referências** à árvore `eb-dash/`
- parte desse conteúdo descreve um frontend antigo ou caminhos que já não existem no repositório atual

### Em português simples

Tem muito mapa velho misturado com mapa novo.

### Impacto

- documentação deixa de ser executável;
- handoff e manutenção ficam sujeitos a seguir caminho morto;
- aumenta retrabalho por contexto antigo.

### Sugestão

Separar claramente documentação viva do sistema atual de histórico/legado arquivado.

---

## 5. Pistas úteis por arquivo

Esta seção não substitui o inventário completo. Ela só aponta exemplos que deixam mais fácil começar a limpeza.

### `eb-dash2/src/components/leads/LeadCard.tsx`

- `745-758`: efeito faz reset e também ativa estado sem incluir `initialTab` nas dependências
- `925-927`: reset de `selectedOppId` dentro de efeito

**Leitura simples:** esse componente já está carregando responsabilidade demais e tem sinais de acoplamento.

### `eb-dash2/src/pages/traqueamento/tabs/CodsUtmTab.tsx`

- `176`
- `297`
- `459`
- `596`
- `729`
- `850`
- `971`

**Leitura simples:** o mesmo padrão problemático foi repetido muitas vezes. Aqui vale mais um refactor de padrão do que correção pontual picada.

### `eb-dash2/src/pages/SettingsPage.tsx` e `eb-dash2/src/pages/settings/UsersPage.tsx`

- `setPerms(initial)` dentro de efeito
- expressão ternária solta dentro de `setExpanded(...)`

**Leitura simples:** há código funcionando, mas escrito de um jeito que o lint está recusando com razão.

### `scripts/check-backfill.js`, `scripts/run-backfill.js` e `scripts/set-user-password.js`

- contêm chave de alto privilégio hardcoded

**Leitura simples:** aqui não é “código feio”; aqui é risco operacional real.

### `supabase/config.toml`

- aponta seed inexistente
- usa `site_url` e redirects em `127.0.0.1:3000`
- define OTP em `6` dígitos

**Leitura simples:** a config local de auth não conversa com o frontend real do projeto.

### `supabase/functions/sync-contact-opportunities/index.ts` e `supabase/functions/reconcile-contact-opportunities/index.ts`

- caem para `GHL_LOCATION_ID` fixo se a env faltar

**Leitura simples:** backend também pode mirar no lugar errado sem reclamar.

### `supabase/functions/diag-ghl/index.ts`

- usa location fixa e não valida env antes de chamar a API

**Leitura simples:** diagnóstico frágil, justamente onde a configuração deveria ser mais explícita.

### `eb-dash2/src/components/auth/AuthGuard.tsx`, `eb-dash2/src/pages/LoginPage.tsx` e `eb-dash2/src/pages/OtpVerifyPage.tsx`

- o redirecionamento pós-login perde query params

**Leitura simples:** o usuário volta para “a página”, mas não para “o estado da página”.

### `eb-dash2/src/components/layout/Sidebar.tsx`

- `/settings` existe, mas a navegação prática expõe só `/settings/users`

**Leitura simples:** rota viva, navegação morta.

---

## 6. Prioridade recomendada

Se a ideia for arrumar isso depois sem desperdiçar tempo, eu seguiria esta ordem:

1. **Fazer os testes rodarem de verdade**
2. **Rotacionar e remover credenciais hardcoded**
3. **Alinhar auth local: OTP, `site_url` e redirects**
4. **Eliminar `react-hooks/rules-of-hooks`**
5. **Eliminar `react-hooks/static-components`**
6. **Limpar `react-hooks/set-state-in-effect` nos componentes mais centrais**
7. **Reduzir `any` onde mexe com dados críticos**
8. **Corrigir bug de retorno pós-login e inconsistências de navegação**
9. **Remover fallbacks perigosos de `GHL_LOCATION_ID` e endurecer env validation**
10. **Corrigir documentação enganosa e links quebrados**
11. **Atacar performance do bundle**

### Motivo

Essa ordem primeiro remove risco grave de segurança e bloqueios funcionais de autenticação, depois recupera confiança mínima do projeto, e só então vai para limpeza e otimização.

---

## 7. Conclusão curta e honesta

O projeto **não está quebrado de forma terminal**, porque o build passa.  
Mas ele **está em estado de alerta técnico real**, porque:

- o lint está quebrado em muitos pontos;
- os testes críticos não rodam;
- há segredo sensível versionado em script;
- a autenticação local está inconsistente;
- a documentação conta uma história mais limpa do que o código atual sustenta.

Traduzindo sem enfeite:

- dá para continuar evoluindo;
- mas continuar sem arrumar isso aumenta a chance de erro escondido, retrabalho e confiança falsa.

---

## 8. Anexo rápido dos comandos e resultados

### `npm --prefix eb-dash2 run build`

- **Status:** passou
- **Observação:** warning de chunk grande (`848.46 kB`)

### `npm --prefix eb-dash2 run lint`

- **Status:** falhou
- **Resultado:** `56 errors`, `1 warning`

### `npm test`

- **Status:** falhou
- **Erro:** `Missing script: "test"`

### `npm --prefix eb-dash2 test`

- **Status:** falhou
- **Erro:** `Missing script: "test"`

### `node --test __tests__/integration/*.test.ts`

- **Status:** falhou
- **Erro:** `ERR_UNKNOWN_FILE_EXTENSION`

### Busca por `vitest`

- **Status:** nenhuma ocorrência encontrada em `package.json` e `package-lock.json` da raiz e do `eb-dash2`

### Varredura de links em `docs/`

- **Status:** `21` links relativos quebrados encontrados

### `supabase status`

- **Status:** falhou por ambiente
- **Erro:** `Cannot connect to the Docker daemon`

### Leitura de `CLAUDE.md`

- **Status:** lido integralmente (`309` linhas)
