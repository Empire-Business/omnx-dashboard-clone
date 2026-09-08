# 04 — Módulo: Contatos

> **O que este documento cobre:** Tudo sobre a gestão de contatos no Empire CRM — criar, editar, buscar, organizar, histórico de atividades, tags, campos customizados, importação e API.

---

## O que é um Contato?

Um **contato** é uma pessoa real que entrou em contato com a Empire Business. Pode ser um lead que preencheu um formulário, alguém que mandou mensagem no WhatsApp, ou um cliente que já comprou.

**Regra importante:** Um contato pode ter **várias oportunidades**. Isso é normal! A mesma pessoa pode ter feito 3 formulários em momentos diferentes (ex: "João Silva" se inscreveu em janeiro, depois em março, depois em junho). Cada inscrição gera uma oportunidade separada, mas é o mesmo contato João Silva.

**Diferença entre Contato e Lead:**
- **Contato** = A PESSOA (nome, email, telefone, histórico completo)
- **Lead/Oportunidade** = A INTENÇÃO de compra em um momento específico

---

## 1. Requisitos Funcionais

### 1.1 Criação de Contatos

**RF-CONT-001:** O sistema deve criar um contato ao receber uma submissão de formulário.

**RF-CONT-002:** O sistema deve criar um contato ao receber uma mensagem de WhatsApp de um número desconhecido.

**RF-CONT-003:** Um usuário com permissão de escrita pode criar um contato manualmente na interface.

**RF-CONT-004:** O sistema deve aceitar criação de contato via API REST:
```
POST /api/v1/contacts
Authorization: Bearer emp_live_xxxx

{
  "nome": "João Silva",
  "email": "joao@email.com",
  "telefone": "11999999999",
  "utm_source": "facebook",
  "utm_campaign": "cdav-jan-2026",
  "utm_term": "M01_O1_P29_CR-248_PG5",
  "tags": ["mql"],
  "custom_fields": {
    "faturamento_anual": "500k-1M"
  }
}
```

**RF-CONT-005:** Ao criar um contato, o sistema normaliza o telefone:
- Remove todos os caracteres não-numéricos: `(11) 9 9999-9999` → `11999999999`
- Se não tiver DDI, assume `55` (Brasil): `11999999999` → `5511999999999`
- Armazena o original em `telefone_raw` e o normalizado em `telefone`

### 1.2 Deduplicação

**RF-CONT-006:** Antes de criar um contato, o sistema verifica duplicatas:
1. Busca por `email` exato (case-insensitive) no mesmo workspace
2. Busca por `telefone` normalizado no mesmo workspace
3. Se encontrar duplicata: atualiza o contato existente com os novos dados (não cria novo)
4. A oportunidade é criada vinculada ao contato existente

**RF-CONT-007:** A deduplicação é configurável por formulário:
- `allow_duplicates: true` → cria novo contato mesmo se existir igual (para casos específicos)
- `allow_duplicates: false` (padrão) → merge com contato existente

**RF-CONT-008:** A interface mostra quando um contato tem possíveis duplicatas (mesmo nome + sem email/telefone igual) e permite ao usuário fazer merge manual.

### 1.3 Visualização de Contatos

**RF-CONT-009:** A página de contatos exibe uma lista paginada com:
- Nome
- Email
- Telefone
- Tags (como badges coloridos)
- Número de oportunidades
- Última atividade
- SDR responsável

**RF-CONT-010:** O usuário pode filtrar contatos por:
- Texto livre (busca server-side por nome, email, telefone)
- Tags
- Canal de origem (utm_source)
- SDR responsável
- Data de criação
- Ter ou não ter oportunidade ativa

**RF-CONT-011:** A busca por texto usa `ILIKE` no PostgreSQL (server-side), não filtro no frontend. Isso garante que encontra leads em qualquer página, não só na atual.

### 1.4 Perfil do Contato

**RF-CONT-012:** Ao clicar em um contato, o usuário vê o perfil completo com:

**Seção 1: Dados Pessoais**
- Nome, email, telefone, empresa, cargo, cidade/estado

**Seção 2: Atribuição de Tráfego**
- utm_source (com nome amigável: "Facebook Ads")
- utm_medium, utm_campaign, utm_term, utm_content
- tt_source, tt_medium, tt_campaign, tt_term, tt_content
- fbclid, gclid, ttclid
- **Badge "Ver histórico de atribuições"** → abre seção expandível com todas as atribuições passadas (tabela `contato_atribuicoes`), cada uma mostrando: data, origem (formulário, webhook, manual), UTMs, click IDs, e se é a atribuição ativa
- Cada linha do histórico é editável inline — o usuário pode corrigir UTMs de qualquer atribuição (não só a ativa)
- Ao editar uma atribuição, o sistema pede um motivo (obrigatório) e registra: valor anterior, valor novo, quem editou, quando, e o motivo

**Seção 3: Tags**
- Todas as tags do contato como badges
- Botão para adicionar/remover tag

**Seção 4: Oportunidades**
- Lista de todas as oportunidades do contato
- Cada oportunidade mostra: pipeline, stage atual, data de criação, valor

**Seção 5: Timeline de Atividades**
- Todas as comunicações (mensagens, ligações, emails)
- Movimentos de pipeline
- Tags adicionadas/removidas
- Reuniões agendadas
- Notas da equipe
- Ordenado cronologicamente (mais recente primeiro)

**Seção 6: Campos Customizados**
- Todos os campos customizados do workspace
- Editáveis inline

**RF-CONT-013:** O perfil do contato é uma gaveta lateral (drawer) que abre sem sair da página atual.

### 1.5 Edição de Contatos

**RF-CONT-014:** Todo campo do contato pode ser editado inline no perfil (clica no campo, edita, pressiona Enter para salvar).

**RF-CONT-015:** Adição/remoção de tags acontece em tempo real:
- Clica no campo de tags
- Digita ou seleciona do catálogo
- Tag aparece imediatamente

**RF-CONT-016:** Ao adicionar a tag "mql" manualmente, o sistema:
- Adiciona a tag
- Identifica a oportunidade ativa do contato
- Sincroniza a tag via webhook/API para o ActiveCampaign (se configurado)

### 1.5a Edição Manual de UTMs

**Por que é necessário:** UTMs chegam automaticamente via formulários e webhooks, mas erros de configuração na landing page, tags incorretas no anúncio ou leads sem atribuição exigem correção manual. Sem essa funcionalidade, leads ficam com atribuição errada permanentemente e os painéis de tráfego/reportes ficam distorcidos.

**RF-CONT-017a:** No perfil do contato, a seção "Atribuição de Tráfego" (UTMs) deve ser editável inline — mesmo comportamento dos outros campos (clica, edita, Enter para salvar). Todos os campos de UTM são editáveis: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `tt_source`, `tt_medium`, `tt_campaign`, `tt_term`, `tt_content`, `fbclid`, `gclid`, `ttclid`.

**RF-CONT-017b:** O usuário também pode limpar um campo de UTM individualmente (apagar o valor e salvar) para remover uma atribuição incorreta.

**RF-CONT-017c:** Edição em massa de UTMs: a listagem de contatos deve ter uma ação de "Editar UTMs em massa" que permite:
1. Selecionar múltiplos contatos (checkbox)
2. Escolher qual campo UTM alterar (utm_source, utm_campaign, etc.)
3. Definir o novo valor (ou "Limpar" para remover)
4. Preview: mostrar contagem de quantos contatos serão afetados
5. Confirmar → atualiza todos os contatos selecionados de uma vez
6. Log da alteração em massa é registrado na timeline de cada contato afetado

**RF-CONT-017d:** A API de contatos (`PUT /api/v1/contacts/:id`) permite atualizar qualquer campo de UTM individualmente. Para edição em massa, usar:
```
POST /api/v1/contacts/bulk-update-utms
Authorization: Bearer emp_live_xxxx

{
  "contact_ids": ["uuid-1", "uuid-2", "..."],
  "updates": {
    "utm_source": "facebook",
    "utm_campaign": "cdav-jan-2026"
  },
  "clear_fields": ["tt_source"]
}

Retorna: { "updated": 42 }
```

**RF-CONT-017e:** Ao editar UTMs manualmente, o sistema registra na timeline do contato uma entrada "[Usuário] editou utm_source de "google" para "facebook"" para auditoria. Isso é essencial porque UTMs são a fonte de verdade para atribuição de tráfego e qualquer alteração deve ser rastreável.

**RF-CONT-017f:** O sistema mantém um histórico completo de atribuição na tabela `contato_atribuicoes`. Cada vez que um contato se cadastra ou recadastra por um formulário/webhook com UTMs, uma nova linha é criada — mesmo que o contato já exista. A atribuição mais recente é marcada como `is_ativa = TRUE` e seus valores são espelhados nos campos `utm_*` da tabela `contatos`.

**RF-CONT-017g:** O perfil do contato mostra, na seção de Atribuição de Tráfego, um histórico expandível com TODAS as atribuições já registradas (cliques/cadastros). Cada entrada mostra: data, origem (formulário, webhook, API, edição manual), todos os UTMs e click IDs, e um indicador visual se é a atribuição ativa.

**RF-CONT-017h:** Qualquer atribuição no histórico pode ser editada — não só a ativa. O usuário pode corrigir UTMs de um cadastro antigo. Ao editar, o sistema exige um "Motivo da edição" e salva: valor original em `valor_original`, quem editou em `editado_por`, quando em `editado_em`, e o motivo em `motivo_edicao`. Se a atribuição editada for a ativa, os campos `utm_*` do contato são atualizados para refletir a correção.

**RF-CONT-017i:** O usuário pode alternar qual atribuição é a "ativa" clicando em "Usar como atribuição atual" em qualquer entrada do histórico. Isso atualiza `is_ativa = FALSE` em todas as outras e `is_ativa = TRUE` na selecionada, e espelha os novos UTMs nos campos do contato.

**RF-CONT-017j:** Edição em massa de UTMs também funciona sobre o histórico de atribuições. O endpoint `POST /api/v1/contacts/bulk-update-utms` aceita o parâmetro opcional `scope`:
- `"contato"` (padrão) — atualiza os campos `utm_*` do contato e a atribuição ativa
- `"atribuicoes"` — atualiza as atribuições selecionadas pelo filtro (ex: todas de uma determinada campanha)

### 1.6 Importação via CSV

**RF-CONT-017:** O sistema aceita importação de contatos via arquivo CSV.

**Fluxo de importação:**
```
1. Usuário faz upload do CSV
2. Sistema detecta automaticamente as colunas
3. Usuário mapeia colunas CSV → campos do CRM
   Ex: "Nome Completo" → contatos.nome
       "Celular" → contatos.telefone
       "Email corporativo" → contatos.email
4. Preview: mostrar 5 primeiras linhas com o mapeamento aplicado
5. Validação: contar erros (emails inválidos, telefones impossíveis)
6. Opções:
   - Pular registros com erro
   - Criar pipeline/stage para os importados
   - Tags adicionadas automaticamente a todos
7. Importação em background (não bloqueia a interface)
8. Relatório final: X criados, Y atualizados, Z erros
```

**RF-CONT-018:** A importação também faz deduplicação (mesmo comportamento da criação manual).

### 1.7 API de Contatos

**RF-CONT-019:** Os seguintes endpoints devem estar disponíveis na API pública:

```
GET /api/v1/contacts
  ?page=1&limit=50
  ?search=joão
  ?tags=mql,conectado
  ?utm_source=facebook
  ?created_after=2026-01-01
  Retorna: { data: [Contact], total, page, has_more }

GET /api/v1/contacts/:id
  Retorna: Contact completo com custom_fields e atribuições (histórico)

GET /api/v1/contacts/:id/attributions
  Retorna: Todas as atribuições do contato ordenadas por data (mais recente primeiro)
  Cada entrada: { id, origem, utm_*, click_ids, is_ativa, editado_por, editado_em, valor_original, motivo_edicao, created_at }

POST /api/v1/contacts
  Body: { nome, email, telefone, utm_source, utm_campaign, ... }
  Automaticamente cria uma linha em contato_atribuicoes com os UTMs
  Retorna: { id, created: true } ou { id, created: false } (se era duplicata)

PUT /api/v1/contacts/:id
  Body: campos a atualizar (partial update)
  Retorna: Contact atualizado

PUT /api/v1/contacts/:id/attributions/:attribution_id
  Body: { utm_source, utm_campaign, ..., motivo_edicao: "UTMs incorretos" }
  Edita uma atribuição específica do histórico. Obrigatório informar motivo_edicao.
  Se a atribuição editada for a ativa, espelha os novos valores nos campos utm_* do contato.
  Salva valor_original automaticamente.
  Retorna: Atribuição atualizada

POST /api/v1/contacts/:id/attributions/:attribution_id/activate
  Define esta atribuição como ativa (is_ativa = TRUE) e desativa as demais.
  Espelha os UTMs da atribuição ativada nos campos utm_* do contato.
  Retorna: Contact atualizado

DELETE /api/v1/contacts/:id
  Soft delete (deleted_at = NOW())
  Retorna: { success: true }

POST /api/v1/contacts/:id/tags
  Body: { tags: ["mql", "conectado"] }
  Retorna: Contact com tags atualizadas

DELETE /api/v1/contacts/:id/tags/:tag
  Retorna: Contact com tag removida

POST /api/v1/contacts/bulk-update-utms
  Body: {
    contact_ids: ["uuid-1", "uuid-2", ...],
    scope: "contato" | "atribuicoes",
    updates: { utm_source: "facebook", utm_campaign: "cdav-jan-2026" },
    clear_fields: ["tt_source"],
    motivo_edicao: "Correção de UTMs da campanha de janeiro"
  }
  scope "contato": atualiza campos utm_* do contato + atribuição ativa
  scope "atribuicoes": atualiza atribuições filtradas (requer filtros adicionais)
  Retorna: { updated: 42 }
```

---

## 1.8 Busca Global

**RF-CONT-020:** O sistema possui busca global acessível de qualquer tela do CRM (header bar com ícone de lupa e atalho `Ctrl+K` / `Cmd+K`).

**O que a busca encontra:**
- Contatos (por nome, email, telefone, empresa)
- Oportunidades (por título, nome do contato)
- Conversas (por conteúdo de mensagem, nome do contato)
- Tarefas (por título)

**Implementação:**
```
Endpoint: GET /api/v1/search?q=joão&types=contacts,opportunities,conversations

Parâmetros:
  q       — termo de busca (mínimo 2 caracteres)
  types   — tipos de entidade para buscar (default: todos)
  limit   — máximo de resultados por tipo (default: 10, máximo: 50)
```

**Backend (PostgreSQL full-text search):**
```sql
-- Busca unificada usando tsvector + tsquery
-- Índices GIN criados nas tabelas relevantes

-- Contatos:
SELECT id, nome, email, telefone, 'contato' as tipo,
       ts_rank_cd(to_tsvector('simple', nome || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')), websearch_to_tsquery('simple', $1)) as rank
FROM contatos
WHERE workspace_id = $2 AND deleted_at IS NULL
  AND to_tsvector('simple', nome || ' ' || COALESCE(email,'') || ' ' || COALESCE(telefone,'')) @@ websearch_to_tsquery('simple', $1)
ORDER BY rank DESC
LIMIT 10;

-- Similar para oportunidades (título, pipeline_name, stage_name)
-- Similar para comunicacoes (mensagem_body dos últimos 90 dias)
-- Similar para tarefas (título)
```

**Experiência do usuário:**
1. `Ctrl+K` abre o campo de busca no topo da tela
2. Digitar "joão" mostra resultados agrupados: Contatos (3), Oportunidades (1), Conversas (5)
3. Clicar em um resultado navega direto para a entidade (contato, oportunidade, conversa)
4. Últimas 5 buscas salvas no localStorage para acesso rápido

**RF-CONT-021:** Itens recentes — ao abrir a busca sem digitar nada, o sistema mostra os últimos 10 contatos/oportunidades/conversas acessados pelo usuário. Implementação via `activity_log` filtrado por `autor_id = usuário atual`.

---

## 2. Requisitos Não-Funcionais

| Requisito | Especificação |
|-----------|--------------|
| Performance da busca | Resultados em < 500ms para até 100k contatos |
| Tamanho máximo de import | 50.000 registros por arquivo CSV |
| Paginação | Máximo 1000 registros por página (padrão: 50) |
| Rate limit da API | 1000 requisições/minuto por API key |
| Retenção de soft-deleted | 90 dias antes de purge definitivo |

---

## 3. Fluxo de Dados — Deduplicação

```
POST /api/v1/contacts
{ nome: "João Silva", email: "joao@email.com", telefone: "11999999999" }
         ↓
1. Normalizar telefone: "11999999999" → "5511999999999"
         ↓
2. Buscar duplicata:
   SELECT id FROM contatos
   WHERE workspace_id = $1
     AND deleted_at IS NULL
     AND (
       (email IS NOT NULL AND LOWER(email) = LOWER($2))
       OR
       (telefone IS NOT NULL AND telefone = $3)
     )
   LIMIT 1
         ↓
3a. SE ENCONTROU duplicata:
    UPDATE contatos SET
      nome = COALESCE(NULLIF($nome, ''), nome),
      -- Atualiza só UTMs (fonte de verdade = dado mais recente)
      utm_source = $utm_source,
      utm_campaign = $utm_campaign,
      updated_at = NOW()
    WHERE id = $duplicata_id
    RETURNING id
    → retorna { id: "uuid-existente", created: false }
    
3b. SE NÃO ENCONTROU duplicata:
    INSERT INTO contatos (workspace_id, nome, email, telefone, ...)
    VALUES (...)
    RETURNING id
    → retorna { id: "uuid-novo", created: true }
```

---

## 4. Auto-tag "conectado"

Quando uma mensagem inbound (lead → SDR) chega:

```sql
-- Trigger: trg_auto_tag_conectado
-- Disparado: AFTER INSERT em comunicacoes WHERE direction = 'inbound'

CREATE OR REPLACE FUNCTION fn_auto_tag_conectado()
RETURNS TRIGGER AS $$
DECLARE
  v_contato_id UUID;
  v_tags TEXT;
  v_tags_array TEXT[];
BEGIN
  -- 1. Buscar tags atuais do contato
  SELECT id, tags INTO v_contato_id, v_tags
  FROM contatos WHERE id = NEW.contato_id;
  
  -- 2. Verificar se já tem tag "conectado"
  v_tags_array := string_to_array(LOWER(v_tags), ',');
  IF 'conectado' = ANY(v_tags_array) THEN
    RETURN NEW; -- Já tem, nada a fazer
  END IF;
  
  -- 3. Adicionar tag "conectado"
  UPDATE contatos SET
    tags = CASE
      WHEN tags IS NULL OR tags = '' THEN 'conectado'
      ELSE tags || ',conectado'
    END,
    updated_at = NOW()
  WHERE id = NEW.contato_id;
  
  -- 4. Atualizar data_conectado na oportunidade ativa
  UPDATE oportunidades SET
    data_conectado = NEW.data_comunicacao::DATE
  WHERE contato_id = NEW.contato_id
    AND deleted_at IS NULL
    AND data_conectado IS NULL
    AND status = 'open'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 5. Casos de Uso Reais

### Caso 1: Lead chega via formulário Facebook

```
1. João preenche formulário na landing page CDAV
   → utm_source=facebook, utm_campaign=cdav-jan-2026
   
2. POST /api/v1/forms/form-uuid/submit chega com os dados

3. Sistema verifica: existe contato com email joao@email.com?
   → Não encontrado

4. Cria contato: 
   { nome: "João", email: "joao@email.com", utm_source: "facebook", ... }

5. Cria oportunidade no pipeline "Pré-Vendas MQL", stage "Novo Lead"

6. Dispara notificação para SDR (email + push na interface)

7. SDR Karina vê o lead aparecer em tempo real no seu inbox
```

### Caso 2: Mesmo João se inscreve de novo 3 meses depois

```
1. João preenche formulário de novo
   → utm_source=google, utm_campaign=cdav-abr-2026

2. POST /api/v1/forms/form-uuid/submit chega com os dados

3. Sistema verifica: existe contato com email joao@email.com?
   → SIM, encontrado (id: abc-123)

4. Atualiza o contato existente:
   - utm_source muda para "google" (nova atribuição ativa)
   - outros dados: mesclados inteligentemente

5. Cria NOVA entrada em contato_atribuicoes:
   { contato_id: abc-123, utm_source: "google", utm_campaign: "cdav-abr-2026",
     origem: "formulario", is_ativa: TRUE }
   → A atribuição antiga (facebook/cdav-jan-2026) perde is_ativa, mas NÃO é apagada

6. Cria NOVA oportunidade vinculada ao mesmo contato
   → Contato abc-123 agora tem 2 oportunidades e 2 atribuições no histórico

7. SDR vê no perfil: "João tem 2 oportunidades"
   → Pode ver todo o histórico da primeira tentativa
   → Pode ver que João chegou primeiro via Facebook e depois via Google
   → Pode corrigir UTMs de qualquer uma das duas atribuições se estiverem erradas
```

### Caso 2a: SDR corrige UTMs de um cadastro antigo

```
1. SDR abre perfil do João e clica em "Ver histórico de atribuições"

2. Vê duas entradas:
   - 15/01/2026 | Facebook | cdav-jan-2026 | Formulário | Ativa: ✔
   - 05/04/2026 | Google   | cdav-abr-2026 | Formulário | Ativa: ✘

3. SDR percebe que a primeira attribuição está errada — era "google", não "facebook"

4. Clica na primeira atribuição, edita utm_source de "facebook" para "google"
   → Sistema pede motivo: "Lead informou que clicou no anúncio do Google, não Facebook"

5. Sistema salva:
   - valor_original: { utm_source: "facebook" }
   - editado_por: uuid-do-sdr
   - editado_em: 2026-04-15T14:30:00Z
   - motivo_edicao: "Lead informou que clicou no anúncio do Google, não Facebook"

6. Como NÃO é a atribuição ativa, os campos utm_* do contato não mudam
   → Mas o histórico agora está correto para relatórios retroativos
```

### Caso 3: Lead manda mensagem no WhatsApp sem ter preenchido formulário

```
1. Número desconhecido manda: "Oi, vi sobre a consultoria de vocês"

2. UAZAPI envia webhook para o Empire CRM

3. Sistema busca: existe contato com telefone 5511999999999?
   → Não encontrado

4. Cria contato automaticamente:
   { nome: "5511999999999" (temporário), telefone: "5511999999999" }
   (O SDR vai completar o nome depois)

5. Cria oportunidade no pipeline "Inbound WhatsApp", stage "Novo Lead"

6. Dispara notificação para SDR de plantão

7. SDR abre o chat, responde, e preenche o nome do contato
```

---

## 6. Critérios de Aceite

- [ ] Criar contato manualmente na interface em < 30 segundos
- [ ] Busca de texto retorna resultados em < 500ms para base com 10.000 contatos
- [ ] Importação de 1.000 contatos via CSV em < 2 minutos
- [ ] Deduplicação por email E telefone funciona corretamente
- [ ] API de criação retorna `created: false` quando duplicata encontrada
- [ ] Timeline mostra todas as atividades (mensagens, reuniões, movimentos de pipeline)
- [ ] Auto-tag "conectado" dispara ao receber primeira mensagem inbound
- [ ] Campos customizados salvam e exibem corretamente
- [ ] Soft delete não remove da tabela, apenas seta `deleted_at`
- [ ] Histórico de atribuições visível no perfil do contato (todas as entradas de UTMs)
- [ ] Editar UTMs de qualquer atribuição (ativa ou antiga) exige motivo e salva auditoria
- [ ] Alternar atribuição ativa atualiza os campos utm_* do contato
- [ ] Edição em massa de UTMs funciona para contatos e atribuições
- [ ] Cada novo cadastro com UTMs gera nova linha em contato_atribuicoes (nunca sobrescreve)

---

*Próximo: [05 — Módulo Oportunidades](./05-MODULO-OPORTUNIDADES.md)*
