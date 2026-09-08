# 09 — Construtor de Formulários

> **O que este documento cobre:** O form builder nativo do Empire CRM — criação de formulários drag-and-drop, captura de UTMs, embed, e o mais importante: a API completa para criação de leads a partir de formulários externos.

---

## Por que um Form Builder próprio?

Hoje, o GHL tem formulários próprios, mas eles têm limitações:
- Não dão acesso fácil à API de submissão
- Customização visual limitada
- Sem controle sobre o código gerado (iframe/embed)

O Empire CRM resolve isso com um **Form Builder nativo** que:
1. É visualmente simples (drag-and-drop)
2. Gera uma **API de submissão** para cada formulário
3. Pode ser embutido em qualquer site via iframe ou JavaScript
4. Captura UTMs automaticamente da URL
5. Permite criação de leads via API externa (formulário 100% customizado)

---

## 1. Interface do Form Builder

```
┌──────────────────────────────────────────────────────────────────────┐
│  Form Builder — Formulário CDAV Janeiro 2026                        │
├──────────────────────┬─────────────────────────────────────────────┤
│  CAMPOS              │  PREVIEW                                     │
│  ──────────────       │  ─────────────────────────────────────       │
│  Básicos:            │                                              │
│  [A] Texto           │  ┌───────────────────────────────────────┐  │
│  [@] Email           │  │  Formulário CDAV                      │  │
│  [📱] Telefone       │  │  ───────────────────────────────      │  │
│  [#] Número          │  │  Seu nome completo *                  │  │
│  [⬇] Select          │  │  [______________________________]     │  │
│  [≡] Multi-select    │  │                                       │  │
│  [📝] Textarea       │  │  E-mail *                             │  │
│  [☑] Checkbox        │  │  [______________________________]     │  │
│  [📅] Data           │  │                                       │  │
│                       │  │  WhatsApp *                          │  │
│  Especiais:          │  │  [______________________________]     │  │
│  [🔗] UTM Hidden     │  │                                       │  │
│  [📋] Título         │  │  Faturamento anual *                  │  │
│  [─] Divisor         │  │  [Selecione... ▾                   ]  │  │
│                       │  │    Até 100k                          │  │
│  [+ Adicionar campo]  │  │    100k - 500k                       │  │
│                       │  │    500k - 2M                         │  │
│                       │  │    Acima de 2M                       │  │
│                       │  │                                       │  │
│                       │  │  [   QUERO MINHA CONSULTORIA   ]     │  │
│                       │  └───────────────────────────────────┘  │  │
├──────────────────────┴─────────────────────────────────────────────┤
│  Configurações:                                                     │
│  Pipeline destino: [Pré-Vendas MQL ▾]  Stage: [Novo Lead ▾]       │
│  Tags iniciais: [mql] [facebook-lead]  SDR padrão: [Karina ▾]     │
│  Notificar: [✓ SDR responsável] [✓ Email: ops@empire.com]         │
│  Após envio: [Redirecionar para: https://... ]                     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tipos de Campos

### 2.1 Campos Padrão (mapeados para contatos/oportunidades)

| Tipo | Campo de destino | Comportamento especial |
|------|-----------------|----------------------|
| Texto | `contato.nome` | — |
| Email | `contato.email` | Valida formato de email |
| Telefone | `contato.telefone` | Máscara, normalização automática |
| Número | `oportunidade.valor` ou campo customizado | — |
| Select | `contato.custom_field.*` | Opções configuráveis |
| Multi-select | Tags (cada opção selecionada vira tag) | — |
| Textarea | `contato.observacoes` ou campo customizado | — |
| Checkbox | `contato.aceite_termos` | Pode ser obrigatório |
| Data | Campo customizado | — |

### 2.2 Campos Especiais

**Campo UTM Hidden:** Um campo invisível para o usuário que captura automaticamente os parâmetros UTM da URL da página onde o formulário está embutido.

```javascript
// Quando o formulário carrega, este script roda automaticamente:
function captureUTMs() {
  const params = new URLSearchParams(window.location.search)
  return {
    utm_source:   params.get('utm_source')   || getCookie('utm_source'),
    utm_medium:   params.get('utm_medium')   || getCookie('utm_medium'),
    utm_campaign: params.get('utm_campaign') || getCookie('utm_campaign'),
    utm_term:     params.get('utm_term')     || getCookie('utm_term'),
    utm_content:  params.get('utm_content')  || getCookie('utm_content'),
    fbclid:       params.get('fbclid')       || '',
    gclid:        params.get('gclid')        || '',
  }
}
// UTMs são armazenados em cookie por 30 dias
// (para capturar mesmo quando o lead volta sem UTM depois)
```

---

## 3. Embed — Colocar o Formulário no Site

O formulário pode ser embutido em qualquer site de três formas:

### Opção A: Iframe (mais simples)

```html
<!-- Copie e cole no seu site -->
<iframe 
  src="https://empire-crm.app/f/cdav-janeiro" 
  width="100%" 
  height="600"
  frameborder="0"
  scrolling="no">
</iframe>
```

**Limitação:** UTMs precisam ser passados como parâmetros na URL do iframe:
```html
<iframe 
  src="https://empire-crm.app/f/cdav-janeiro?utm_source=facebook&utm_campaign=cdav-jan"
  ...>
```

### Opção B: Script JavaScript (recomendado)

```html
<!-- 1. Adicionar o script no <head> do site -->
<script src="https://empire-crm.app/embed.js"></script>

<!-- 2. Criar uma div onde o formulário vai aparecer -->
<div id="empire-form" data-form-id="form-uuid-aqui"></div>

<!-- 3. O script detecta e injeta o formulário automaticamente -->
<!-- UTMs são capturados automaticamente da URL da página -->
```

**Vantagem:** O script captura UTMs da página automaticamente, sem precisar passar na URL.

### Opção C: API direta (máxima customização)

Para quando você quer criar seu próprio formulário 100% customizado (React, Vue, HTML puro) e só precisar da API para submeter:

```javascript
// Exemplo: submissão manual via fetch
const response = await fetch('https://api.empire-crm.app/v1/forms/form-uuid/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
    // Não precisa de Authorization para formulários públicos!
  },
  body: JSON.stringify({
    nome: 'João Silva',
    email: 'joao@email.com',
    telefone: '11999999999',
    faturamento: '500k-1M',
    // UTMs capturados do seu site:
    utm_source: 'facebook',
    utm_medium: 'cpc',
    utm_campaign: 'cdav-jan-2026',
    utm_term: 'M01_O1_P29_CR-248',
    utm_content: 'video-1',
    fbclid: 'IwAR123...',
    // Campos personalizados do formulário:
    como_nos_conheceu: 'Instagram'
  })
})

const result = await response.json()
// { success: true, contact_id: "uuid", opportunity_id: "uuid" }
```

---

## 4. API Completa de Submissão

### 4.1 Submissão via Formulário

**Endpoint público** (sem autenticação — qualquer site pode chamar):
```
POST /api/v1/forms/{form_id}/submit
```

**Body (todos os campos do formulário + UTMs):**
```json
{
  "nome": "João Silva",
  "email": "joao@email.com",
  "telefone": "11999999999",
  
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "cdav-jan-2026",
  "utm_term": "M01_O1_P29_CR-248_PG5",
  "utm_content": "creative-v2",
  "fbclid": "IwAR...",
  "gclid": "",
  
  "campos_customizados": {
    "faturamento_anual": "500k-1M",
    "como_nos_conheceu": "Instagram"
  }
}
```

**Resposta de sucesso:**
```json
{
  "success": true,
  "contact_id": "abc-123",
  "opportunity_id": "def-456",
  "created": true,
  "message": "Lead criado com sucesso"
}
```

**Resposta de duplicata:**
```json
{
  "success": true,
  "contact_id": "abc-123",
  "opportunity_id": "ghi-789",
  "created": false,
  "message": "Contato existente encontrado, nova oportunidade criada"
}
```

**Resposta de erro de validação:**
```json
{
  "success": false,
  "errors": {
    "email": "Email inválido",
    "telefone": "Telefone obrigatório"
  }
}
```

### 4.2 API Direta de Contatos (autenticada)

Para sistemas que precisam criar leads programaticamente com controle total:

```
POST /api/v1/contacts
Authorization: Bearer emp_live_xxxx
```

```json
{
  "nome": "João Silva",
  "email": "joao@email.com",
  "telefone": "11999999999",
  "utm_source": "facebook",
  "utm_campaign": "cdav-jan-2026",
  "tags": ["mql"],
  "pipeline_id": "uuid-pipeline",
  "stage_id": "uuid-stage",
  "custom_fields": {
    "faturamento_anual": "500k-1M"
  }
}
```

### 4.3 API de Atualização de UTM (para repair de atribuição)

Para corrigir UTMs de leads que chegaram sem atribuição ou com atribuição errada:

```
PUT /api/v1/contacts/{id}/attribution
Authorization: Bearer emp_live_xxxx
```

```json
{
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "cdav-jan-2026",
  "utm_term": "M01_O1_P29_CR-248",
  "fbclid": "IwAR..."
}
```

---

## 5. Proteção Anti-Spam

**RF-FORM-001:** Rate limiting por IP: máximo 5 submissões por hora por IP.

**RF-FORM-002:** Rate limiting por email: máximo 3 submissões do mesmo email em 24h.

**RF-FORM-003:** Honeypot field — um campo invisível para humanos mas visível para bots:
```html
<!-- Campo invisível para humanos (CSS: display: none) -->
<input type="text" name="_hp" class="empire-hp-field" tabindex="-1" />
```
Se o campo `_hp` vier preenchido → é bot → rejeitar silenciosamente.

**RF-FORM-004:** reCAPTCHA v3 opcional (configurável por formulário).

---

## 6. Webhook de Novo Lead

**RF-FORM-005:** Ao receber uma submissão de formulário com sucesso, o sistema dispara webhooks de saída configurados para o evento `formulario.submetido`.

**Payload do webhook:**
```json
{
  "event": "formulario.submetido",
  "timestamp": "2026-04-15T14:32:00Z",
  "formulario": {
    "id": "form-uuid",
    "nome": "Formulário CDAV Janeiro"
  },
  "contato": {
    "id": "contact-uuid",
    "nome": "João Silva",
    "email": "joao@email.com",
    "telefone": "5511999999999",
    "created": true
  },
  "oportunidade": {
    "id": "opp-uuid",
    "pipeline": "Pré-Vendas MQL",
    "stage": "Novo Lead",
    "valor": 0
  },
  "utm": {
    "utm_source": "facebook",
    "utm_campaign": "cdav-jan-2026"
  }
}
```

---

## 7. Casos de Uso

### Caso 1: Formulário na landing page da campanha CDAV

```
Situação: Campanha de anúncios no Facebook com landing page própria (ex: WebFlow)
          A landing page tem URL com UTMs: ?utm_source=facebook&utm_campaign=cdav-jan

Solução:
1. Criar formulário no Empire CRM: "Captação CDAV Janeiro 2026"
2. Configurar: pipeline "Pré-Vendas MQL", stage "Novo Lead", tags: ["mql"]
3. Copiar código de embed (opção Script JS)
4. Colar na landing page do WebFlow
5. UTMs capturados automaticamente da URL
6. Lead criado → SDR notificado → aparece no CRM
```

### Caso 2: Integração com Hotmart/Kiwify (compra de infoproduto)

```
Situação: Lead compra um produto de entrada e deve virar lead no CRM

Solução:
1. Hotmart/Kiwify tem webhook de nova compra
2. Configurar o webhook para chamar a API do Empire CRM:
   POST /api/v1/contacts
   { nome, email, telefone, utm_source: "hotmart", tags: ["comprador_produto_entrada"] }
3. Lead criado automaticamente no CRM com pipeline de "Nurturing Compradores"
```

### Caso 3: Formulário React totalmente customizado

```
Situação: Desenvolvedor quer criar formulário com visual diferente (React + sua lógica)
          Mas quer que o lead vá para o Empire CRM

Solução:
1. Criar o formulário em React normalmente
2. No onSubmit, fazer fetch para:
   POST https://api.empire-crm.app/v1/forms/{form_id}/submit
   com os dados do formulário + UTMs capturados via JS
3. Tratar resposta: { success: true } → redirecionar para página de obrigado
```

---

## 8. Critérios de Aceite

- [ ] Formulário criado no builder aparece corretamente no preview
- [ ] Embed via script JS funciona em HTML puro (sem framework)
- [ ] UTMs são capturados da URL e enviados no POST de submissão
- [ ] Deduplicação por email funciona: segundo formulário do mesmo email não cria contato novo
- [ ] Rate limit de 5 submissões/hora por IP funciona
- [ ] Honeypot rejeita bots silenciosamente
- [ ] API de submissão retorna `contact_id` e `opportunity_id`
- [ ] Webhook de novo lead é disparado com payload completo
- [ ] SDR é notificado (email + push) ao receber novo lead

---

*Próximo: [10 — Webhooks & API](./10-WEBHOOKS-API.md)*
