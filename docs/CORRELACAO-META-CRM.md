# Sistema de Classificação de Tráfego - Guia Didático

> **Versão:** 1.0
> **Última Atualização:** Fevereiro 2026

---

## Índice

1. [Introdução - O Problema que Precisamos Resolver](#1-introdução---o-problema-que-precisamos-resolver)
2. [Conceitos Básicos](#2-conceitos-básicos)
3. [A Estrutura do Nome do Anúncio](#3-a-estrutura-do-núncio)
4. [O Sistema de Normalização](#4-o-sistema-de-normalização)
5. [Como Conectamos o UTM Term ao Anúncio](#5-como-conectamos-o-utm-term-ao-anúncio)
6. [Classificando: Pago vs Orgânico](#6-classificando-pago-vs-orgânico)
7. [A Hierarquia de Priorização](#7-a-hierarquia-de-priorização)
8. [Resumo Visual do Fluxo](#8-resumo-visual-do-fluxo)

---

## 1. Introdução - O Problema que Precisamos Resolver

Imagine que você está gerenciando campanhas de anúncios no Facebook e Instagram. Cada vez que alguém clica em um anúncio, o Facebook registra **de onde veio** aquele clique usando parâmetros chamados **UTM**.

O problema é:

1. **O Facebook nos dá apenas o UTM Term** - um código como `M01_O1_P13_CR-408_PG5`
2. **Mas precisamos saber QUAL ANÚNCIO específico foi exibido** - o nome completo como "M01_O1_P13_CR-408_PG5 - Produto X - Público Y"
3. **E também precisamos saber se o tráfego é Pago (anúncio) ou Orgânico** (visitas naturais, sem pago)

É como se você recebesse apenas o **CPF de uma pessoa** e precisasse descobrir o **nome completo, endereço e histórico** dessa pessoa.

---

## 2. Conceitos Básicos

### 2.1 O que é UTM?

**UTM (Urchin Tracking Module)** é um código que fica no final da URL e serve para rastrear de onde veio o visitante. É composto por:

| Parâmetro | Exemplo | Significado |
|-----------|---------|-------------|
| `utm_source` | `facebook` | De qual plataforma veio |
| `utm_medium` | `9` | Código do meio (ex: "botão") |
| `utm_campaign` | `12` | Código da campanha |
| `utm_term` | `M01_O1_P13_CR-408_P5` | **Código do anúncio** ✨ |
| `utm_content` | `banner-top` | Conteúdo específico |

### 2.2 O que é o UTM Term?

O `utm_term` é o mais importante para nós. Ele contém um **código estruturado** que identifica o anúncio específico:

```
M01_O1_P13_CR-408_PG5
│  │  │   │    │   │
│  │  │   │    │   └── PG = Público/Ad Group (grupo de público)
│  │  │   │    └────── CR = Criativo (o design do anúncio)
│  │  │   └────────── P = Página (página de destino)
│  │  └────────────── O = Objetivo (o que quer alcançar)
│  └────────────────── M = Meta Account (conta do Facebook)
```

### 2.3 O que é "Pago" vs "Orgânico"?

| Tipo | Descrição | Exemplo |
|------|-----------|---------|
| **Pago** | Visitante que clicou em um anúncio | Alguém viu um anúncio no Facebook e clicou |
| **Orgânico** | Visitante que chegou naturalmente | Alguém encontrou sua página no Google sem clicar em anúncio |

---

## 3. A Estrutura do Nome do Anúncio

No Meta Ads (Facebook/Instagram), nomeamos os anúncios seguindo um padrão. Cada parte do nome tem um significado:

```
M01_O1_P13_CR-408_PG5
```

| Parte | Significado | Exemplo de Valor |
|-------|-------------|------------------|
| `M` | Mês | `01` = Janeiro |
| `O` | Objetivo | `1` = Conversão |
| `P` | Página | `13` = Página de vendas X |
| `CR` | Criativo | `408` = Design do anúncio #408 |
| `PG` | Público/Ad Group | `5` = Grupo de público #5 |

**Exemplo completo de nome de anúncio no sistema:**
```
M01_O1_P13_CR-408_PG5 - Apostila Enem - Interestadual
```

---

## 4. O Sistema de Normalização

### 4.1 Por que precisamos normalizar?

Porque o mesmo texto pode aparecer de formas diferentes:

| Fonte | Texto |
|-------|-------|
| Nome do anúncio no Meta | `M01_O1_P13_CR-408_PG5 - Apostila Enem` |
| UTM Term no banco | `m01_o1_p13_cr-408_pg5` |
| UTM Term (outro sistema) | `M01_O1_P13_CR_408_PG5` |

Todos esses **devem ser considerados iguais**. A normalização transforma tudo em um formato padrão.

### 4.2 Como funciona a normalização?

O sistema faz 5 etapas:

```typescript
// 1. Decodifica URL-encoded (ex: %20 → espaço)
decodeURIComponent("M01%5FO1") → "M01_O1"

// 2. Tudo minúsculo
"M01_O1_P13" → "m01_o1_p13"

// 3. Remove acentos
"ação" → "acao"

// 4. Substitui caracteres especiais por underscore
"m01!o1@p13" → "m01_o1_p13"

// 5. Remove underscores duplicados e das bordas
"__m01_o1__" → "m01_o1"
```

**Resultado:** `M01_O1_P13_CR-408_PG5` e `m01_o1_p13_cr-408_pg5` viram exatamente o mesmo: `m01_o1_p13_cr_408_pg5`

---

## 5. Como Conectamos o UTM Term ao Anúncio

### 5.1 O Problema da Conexão

Quando um lead entra no sistema, temos:
- **UTM Term:** `M01_O1_P13_CR-408_PG5`
- **Precizamos saber:** Qual era o nome COMPLETO do anúncio?

### 5.2 Estratégias de Match

O sistema tenta encontrar a correspondência usando **3 estratégias**, em ordem de prioridade:

#### Estratégia 1: Match Exato (Prioridade: Mais Alta)

Compara os códigos já normalizados. Se forem **idênticos**, encontrado!

```
UTM Term:     m01_o1_p13_cr_408_pg5
Nome Anúncio: m01_o1_p13_cr_408_pg5
Resultado:    ✅ ENCONTRADO!
```

#### Estratégia 2: Match por "Contains" (Prioridade: Média)

Se não achou exato, verifica se um está contido no outro:

```
UTM Term:     p13_cr_408
Nome Anúncio: m01_o1_p13_cr_408_pg5
Resultado:    ✅ CONTIDO - ENCONTRADO!
```

> **Regra:** Aplica apenas se o texto tiver pelo menos 8 caracteres, para evitar falsos positivos.

#### Estratégia 3: Similaridade de Tokens (Prioridade: Fuzzy)

Se ainda não achou, calcula a **similaridade entre palavras**:

```
UTM Term:     m01 o1 p13 cr 408 pg5
Nome Anúncio: m01 o1 p13 cr 408 pg5 apostila enem

Tokens UTM:   {m01, o1, p13, cr, 408, pg5}
Tokens Nome:  {m01, o1, p13, cr, 408, pg5, apostila, enem}

Interseção:   {m01, o1, p13, cr, 408, pg5}
Similaridade: 6/6 = 100% ✅
```

> **Threshold:** Se a similaridade for **maior ou igual a 80%**, considera como match.

### 5.3 Fluxo de Matching

```
┌─────────────────────────────────────────────┐
│         UTM TERM DO LEAD                    │
│         "M01_O1_P13_CR-408_PG5"              │
└─────────────────┬───────────────────────────┘
                  │
                  ▼
         ┌────────────────┐
         │  NORMALIZAR    │
         │ (minúsculas,   │
         │  sem acentos)  │
         └────────┬───────┘
                  │
                  ▼
    ┌─────────────────────────────────┐
    │  ESTRATÉGIA 1: MATCH EXATO       │
    │  UTM == Nome Anúncio?            │
    └──────────────┬──────────────────┘
                   │
         ┌────────┴────────┐
         │ SIM             │ NÃO
         ▼                 ▼
    ┌─────────┐    ┌─────────────────────────┐
    │ ✅ RETORNA│    │ ESTRATÉGIA 2: CONTAINS  │
    │ ANÚNCIO │    │ UTM contido no Nome ou   │
    └─────────┘    │ vice-versa? (mín 8 chars)│
                   └────────────┬─────────────┘
                              │
                    ┌──────────┴──────────┐
                    │ SIM                 │ NÃO
                    ▼                     ▼
               ┌─────────┐      ┌─────────────────────────┐
               │ ✅ RETORNA│     │ ESTRATÉGIA 3: FUZZY    │
               │ ANÚNCIO │      │ Similaridade >= 80%?   │
               └─────────┘      └────────────┬────────────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │ SIM               │ NÃO
                                    ▼                   ▼
                               ┌─────────┐        ┌─────────────┐
                               │ ✅ RETORNA│        │ ❌ NÃO      │
                               │ ANÚNCIO  │        │ ENCONTRADO  │
                               └─────────┘        └─────────────┘
```

---

## 6. Classificando: Pago vs Orgânico

### 6.1 Por que isso importa?

Porque:
1. **Gastos com anúncios** (Pago) precisam ser rastreados para calcular ROI
2. **Tráfego Orgânico** não tem custo de anúncio
3. **Relatórios precisam separar** esses dois tipos

### 6.2 Como o sistema classifica?

O sistema olha para o **UTM Term** e verifica se ele corresponde a um anúncio válido:

```
// Verifica se o utm_term é um código de anúncio válido
1. Tem o formato de código de anúncio? (ex: M01_O1_P13_CR-408_PG5)
2. Esse código existe na lista de anúncios válidos?

Se ambos SIM → TRÁFEGO PAGO
Se não → TRÁFEGO ORGÂNICO
```

### 6.3 Padrão do Código de Anúncio

O código segue o formato regex:
```
^M\d+_O\d+_P\d+_CR-\d+_PG\d+$
```

Exemplos válidos:
- `M01_O1_P13_CR-408_PG5`
- `M02_O3_P05_CR-100_PG1`

Exemplos inválidos:
- `facebook` (não tem formato de código)
- `promocao-de-verao` (texto livre)
- `M01` (incompleto)

### 6.4 Regra de Inclusão/Exclusão

Quando o usuário filtra por "Tráfego Pago" ou "Orgânico":

| Cenário | UTM Term é Anúncio? | Filtro | Resultado |
|---------|:-------------------:|--------|-----------|
| 1 | ✅ Sim | Pago | ✅ Incluir |
| 2 | ✅ Sim | Orgânico | ❌ Excluir |
| 3 | ❌ Não | Pago | ❌ Excluir |
| 4 | ❌ Não | Orgânico | ✅ Incluir |

---

## 7. A Hierarquia de Priorização

### 7.1 O Problema da Duplicidade

Às vezes, um lead pode ter dados conflitantes:
- `utm_source`: `@odavilouback` (Instagram do vendedor)
- `utm_term`: `M01_O1_P13_CR-408_PG5` (código de anúncio)
- Na oportunidade: `op_utm_source`: `facebook` (ajuste manual)

**Qual usar?** O sistema usa uma **hierarquia** (ordem de prioridade):

### 7.2 Hierarquia de Priorização

```
1️⃣ P-Code no UTM Term (MAIOR PRIORIDADE)
   └── Exemplo: _P13_ no utm_term indica que veio do público P13
   └── Mapeia para: facebook (porque P13 = Facebook)

2️⃣ override_utm_source na Oportunidade
   └── Se alguém alterou manualmente o canal na oportunidade

3️⃣ utm_source Original do Contato (FALLBACK)
   └── O que veio do Facebook/Instagram originalmente
```

### 7.3 Mapeamento de P-Codes

Cada P-Code (código de público) mapeia para uma plataforma:

| P-Code | Plataforma |
|--------|-------------|
| P1-P10 | Facebook/Instagram |
| P11-P20 | Instagram |
| P21-P30 | Messenger |

> **Nota:** O mapeamento exato depende da configuração do sistema.

### 7.4 Exemplo Prático

```
Lead com:
- utm_term: "M01_O1_P13_CR-408_PG5"
- utm_source: "@odavilouback"
- opportunity.override_utm_source: null

Sistema:
1. Verifica P-Code: _P13_ → mapeia para "facebook" ✅
2. Retorna: "facebook" (não usa @odavilouback!)
```

**Por que isso importa?**

Se o lead clicou num anúncio do Facebook mas o `utm_source` mostra `@odavilouback` (porque a pessoa viu o stories do vendedor), o sistema ainda reconhece como **tráfego Pago do Facebook** porque olha primeiro para o código do anúncio.

---

## 8. Resumo Visual do Fluxo

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUXO COMPLETO DO SISTEMA                        │
└─────────────────────────────────────────────────────────────────────┘

     USUÁRIO CLICA EM ANÚNCIO
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. FACEBOOK REGISTRA OS DADOS                                       │
│    utm_source = "facebook"                                          │
│    utm_term  = "M01_O1_P13_CR-408_PG5"                              │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. LEAD ENTRA NO SISTEMA (GHL)                                      │
│    Contact {                                                         │
│      utm_source: "facebook",                                         │
│      utm_term: "M01_O1_P13_CR-408_PG5"                              │
│    }                                                                 │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. SISTEMA NORMALIZA O UTM TERM                                     │
│    "M01_O1_P13_CR-408_PG5" → "m01_o1_p13_cr_408_pg5"               │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. BUSCA CORRESPONDÊNCIA (3 estratégias)                           │
│                                                                       │
│    a) Exato: m01_o1_p13_cr_408_pg5 == m01_o1_p13_cr_408_pg5 ✅     │
│                                                                       │
│    (Se não achasse, tentaria "contains" e "similaridade")          │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. IDENTIFICA TIPO DE TRÁFEGO                                       │
│                                                                       │
│    - UTM Term é código de anúncio? SIM → TRÁFEGO PAGO               │
│    - UTM Term não existe? → TRÁFEGO ORGÂNICO                        │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 6. APLICA HIERARQUIA DE CANAL                                        │
│                                                                       │
│    1. P-Code (_P13_) → "facebook"                                   │
│    2. override_utm_source (se existir)                             │
│    3. utm_source original                                           │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 7. DISTRIBUI GASTO (se for pago)                                    │
│                                                                       │
│    Total gasto do anúncio ÷ Total cliques = Custo por lead          │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
     RESULTADO NO DASHBOARD
     - Lead contado como "Facebook"
     - Gasto proporcional atribuído ao lead
```

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **UTM** | Parâmetros de rastreamento (Urchin Tracking Module) |
| **UTM Term** | Parâmetro que identifica o anúncio específico |
| **P-Code** | Código do público (P1, P2, P13, etc.) |
| **Match** | Correspondência encontrada entre UTM Term e nome do anúncio |
| **Normalizar** | Transformar texto em formato padrão (minúsculo, sem acentos) |
| **Fuzzy Match** | Correspondência por similaridade (não exacta) |
| **Tráfego Pago** | Visitantes vindos de anúncios pagos |
| **Tráfego Orgânico** | Visitantes vindos naturalmente (sem anúncios) |
| **ROI** | Retorno sobre investimento |
| **Impression** | Vezes que o anúncio foi exibido |
| **Click** | Clique no anúncio |
| **Contato** | Uma pessoa no sistema (identificada por email/telefone). Um contato pode ter múltiplos leads/oportunidades |
| **Lead** | **= Oportunidade Criada**. Cada vez que um contato preenche um formulário, um novo lead/oportunidade é criado |
| **Oportunidade** | Sinônimo de Lead neste sistema. Representa uma entrada no pipeline de vendas |

---

## Referências de Implementação

Para detalhes de implementação, consulte:

| Componente | Função |
|------------|--------|
| **Normalização** | Transforma UTM Term em formato padrão |
| **Matching Engine** | Executa as 3 estratégias de correspondência |
| **Classificador** | Determina se tráfego é Pago ou Orgânico |
| **Atribuidor** | Aplica hierarquia de canais |

---

## Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | Fevereiro 2026 | Versão inicial do documento |
