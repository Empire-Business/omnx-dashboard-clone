# Tags do GoHighLevel (GHL) - Guia Completo

> **Versão:** 1.0
> **Última Atualização:** 14 de julho de 2026
> **Público:** Usuários não-técnicos e desenvolvedores
> **Origem:** Documentação baseada no sistema OMNX

---

## Introdução

Quando você olha os dados na OMNX, está vendo informações que vêm do **GoHighLevel (GHL)**, que é o sistema de CRM usado para gerenciar leads e oportunidades. O GHL usa **tags** e **campos** para classificar e rastrear cada lead ao longo do processo de vendas.

Este documento explica, de forma simples e didática, o significado de cada uma dessas tags e campos.

---

## ⚠️ Conceito Fundamental: Lead = Oportunidade Criada

> **REGRA DE NEGÓCIO:** Neste sistema, **LEAD = OPORTUNIDADE CRIADA**.

### O que isso significa?

- **Lead** é sinônimo de **Oportunidade** no nosso sistema
- Um **Contato** pode ter **múltiplos Leads/Oportunidades**
- Cada vez que uma pessoa preenche um formulário, uma **nova oportunidade (lead)** é criada

### Exemplo Prático

```
João Silva (Contato)
├── Oportunidade 1 (Lead) - Preencheu formulário em 01/02/2026
├── Oportunidade 2 (Lead) - Preencheu formulário em 15/02/2026
└── Oportunidade 3 (Lead) - Preencheu formulário em 20/02/2026
```

**Por que isso importa?**
- O mesmo contato pode entrar no funil múltiplas vezes
- Cada entrada é uma nova oportunidade de venda
- Relatórios devem contar **oportunidades**, não contatos únicos

---

## Índice

1. [Tags de Qualificação (MQL/SQL)](#1-tags-de-qualificação-mqlsql)
2. [Tags de Funil (prefixo `[fn]`)](##2-tags-de-funil-prefixo-fn)
3. [Tags de Campanha (prefixo `[cp]`)](##3-tags-de-campanha-prefixo-cp)
4. [Tags de Status e Ação](#4-tags-de-status-e-ação)
5. [Tags de Produto/Compra](#5-tags-de-produtocompra)
6. [Tags de Comunicação](#6-tags-de-comunicação)
7. [Estágios do Pipeline (Stages)](#7-estágios-do-pipeline-stages)
8. [Glossário](#glossário)

---

## 1. Tags de Qualificação (MQL/SQL)

São rótulos que o sistema coloca em cada lead para identificar em que estágio de qualificação ele está. As tags aparecem como uma lista separada por vírgulas.

⚠️ **CRÍTICO:** As tags MQL/SQL definem o **status de qualificação do lead**, independente do pipeline em que ele está. Um MQL pode ter evoluído para Vendas SQL, mas continua com a tag MQL (e ganha a tag SQL também). As tags são **permanentes** (ou seja, histórico de qualificação).

### 1.1 MQL e NMQL

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **MQL** | Marketing Qualified Lead | Lead que passou pela triagem inicial do marketing e está pronto para ser passado para a equipe de vendas. É um lead "quente" que demonstrou interesse real. **Permanece como MQL** mesmo que evolua para SQL ou outro pipeline. |
| **NMQL** | Não é MQL | Lead que **não** foi classificado como MQL. Pode ser um lead novo que ainda precisa ser qualificado ou que não atende aos critérios. |

### 1.2 SQL e NSQL

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **SQL** | Sales Qualified Lead | Lead que foi aprovado pela equipe de vendas como uma oportunidade real de negócio. Está pronto para entrar em negociação. |
| **NSQL** | Não é SQL | Lead que não foi classificado como SQL. Pode estar em estágio anterior de qualificação. |

### 1.3 Exemplo de Uso

```
Tags: "nmql,sql"
→ Este lead foi classificado como "não MQL", mas é um "SQL" (ou seja, uma oportunidade válida)
```

---

## 2. Tags de Funil (prefixo `[fn]`)

O prefixo **`[fn]`** indica em qual **funil** o lead está. O funil é como uma "pista" ou "jornada" que o lead está percorrendo.

| Tag `[fn]` | Significado |
|------------|-------------|
| `[fn] isca` | Funil de isca (material gratuito) |
| `[fn] aplicação` | Funil de aplicação/inscrição |
| `[fn] webinário` | Funil de webinar |
| `[fn] funil1`, `[fn] funil2` | Funis personalizados |

> **Importante:** Quando um lead tem várias tags `[fn]`, o sistema considera apenas a **última** (a mais recente) para fins de filtro e análise.

---

## 3. Tags de Campanha (prefixo `[cp]`)

O prefixo **`[cp]`** indica de qual **campanha** o lead veio.

| Tag `[cp]` | Significado |
|------------|-------------|
| `[cp] aplicação` | Campanha de aplicação |
| `[cp] ws-100/100-11-25` | Webinar específico (ex: 100/100 no dia 25/11) |
| `[cp] campaign1` | Campanha genérica |

> **Importante:** Assim como `[fn]`, se houver múltiplas tags `[cp]`, o sistema usa a **última** (mais recente).

---

## 4. Tags de Status e Ação

### 4.1 Tags de Agendamento

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **agendado** | Agendou reunião | Lead que agendou uma reunião com a equipe |
| **reagendar-sim** | Aceitou reagendar | Lead aceitou reagendar uma reunião que havia cancelado ou faltado |

### 4.2 Tags de Análise

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **análise gratuita** | Fez análise gratuita | Lead que fez a análise gratuita oferecida na página de obrigado. O SDR possui essa análise para entrar em contato e tentar marcar reunião |

### 4.3 Tags de Comunicação

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **conectado** | Teve contato | Lead que respondeu qualquer coisa em algum momento. Indica que conseguimos algum contato com ele |
| **bloquear** | Bloquear lead | Lead que pediu para não ser mais incomodado. Não deve ser contatado |

---

## 5. Tags de Produto/Compra

### 5.1 Cami Start

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **lead cami start** | Interessado em Cami Start | Lead que preencheu o formulário para comprar a Cami Start, mas não necessariamente comprou |
| **cami start** | Comprou Cami Start | Lead que efetivamente comprou a Cami Start |

> **Como verificar se comprou:** Verificar se tem a tag "cami start" (comprou) vs apenas "lead cami start" (apenas interestedo)

---

## 6. Tags de Venda

| Tag | Significado | Explicação |
|-----|-------------|-------------|
| **venda direta** | Venda direta | Venda feita diretamente (sem passar pelo pipeline) |
| **venda externa** | Venda externa | Venda feita fora do pipeline (por outro canal) |

> **Nota:** Ambas as tags indicam vendas que não passaram pelo funil normal do CRM.

---

## 7. Estágios do Pipeline (Stages)

No GHL, as oportunidades passam por diferentes **estágios** (também chamados de "pipeline stages"). Cada estágio representa uma fase do processo de vendas.

| Stage | Significado |
|-------|-------------|
| Novo Lead | Lead recém-criado no sistema |
| Contato Inicial | Primeiro contato realizado |
| Qualificação | Etapa de qualificação do lead |
| Reunião Agendada | Reunião agendada com o lead |
| Proposta Enviada | Proposta comercial enviada |
| Negociação | Em fase de negociação |
| Fechamento | Próximo ao fechamento |
| Cliente Ganho | Lead virou cliente |
| Cliente Perdido | Lead não virou cliente |

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **GHL** | GoHighLevel - Sistema de CRM utilizado |
| **Contato** | Uma pessoa no sistema (identificada por email/telefone). Um contato pode ter múltiplos leads/oportunidades |
| **Lead** | **= Oportunidade Criada**. Cada vez que um contato preenche um formulário, um novo lead/oportunidade é criado |
| **Oportunidade** | Sinônimo de Lead neste sistema. Representa uma entrada no pipeline de vendas |
| **MQL** | Marketing Qualified Lead - Lead qualificado pelo marketing |
| **SQL** | Sales Qualified Lead - Lead qualificado pela equipe de vendas |
| **Funil** | Jornada que o lead está percorrendo |
| **Campanha** | Ação de marketing específica |
| **Pipeline** | Funil de vendas com etapas definidas |
| **SDR** | Sales Development Representative - Profissional de vendas |

---

## Referências

- [Documentação GHL](docs/Document_GHL.md)
- [Webhooks GHL](docs/webhooks-ghl/README.md)
- [Mapeamento de Campos](docs/webhooks-ghl/MAPEAMENTO-CAMPOS.md)

---

## Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0 | Fevereiro 2026 | Versão inicial do documento |
