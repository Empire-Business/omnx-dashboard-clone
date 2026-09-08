# Documentação de Webhooks GHL

## 📋 Propósito

Esta pasta contém a documentação completa sobre os webhooks recebidos do **GoHighLevel (GHL)** e as regras para extração de dados.

> ⚠️ **ATENÇÃO**: Nenhuma extração de dados dos webhooks deve ser feita sem documentação prévia nesta pasta.

---

## 📁 Estrutura

```
docs/webhooks-ghl/
├── README.md                 # Este arquivo
├── REGRAS-EXTRACAO.md        # Regras obrigatórias para extração
├── EVENTOS.md                # Catálogo de eventos GHL
├── EXEMPLOS-PAYLOADS.md      # Exemplos reais de payloads
├── MAPEAMENTO-CAMPOS.md      # Mapeamento de campos para tabelas (futuro)
└── DECISOES/                 # Decisões de extração documentadas
    └── YYYYMMDD-nome-da-decisao.md
```

---

## 🚨 Regra de Ouro

```
❌ PROIBIDO: Criar tabela ou extrair campo sem documentação
✅ OBRIGATÓRIO: Documentar antes de implementar qualquer extração
```

**Antes de criar qualquer tabela a partir de webhooks:**
1. Leia `REGRAS-EXTRACAO.md`
2. Documente o campo/evento em `MAPEAMENTO-CAMPOS.md`
3. Registre a decisão em `DECISOES/`
4. Só então implemente

---

## 🔄 Fluxo de Trabalho

```
Receber webhook → Salvar em webhooks_ghl (json bruto) 
                      ↓
         Identificar necessidade de extração
                      ↓
         Documentar em docs/webhooks-ghl/
                      ↓
         Revisar e aprovar arquitetura
                      ↓
         Criar tabela e extrair dados
```

---

## 📚 Arquivos Principais

| Arquivo | Descrição |
|---------|-----------|
| [REGRAS-EXTRACAO.md](./REGRAS-EXTRACAO.md) | Regras obrigatórias para extração de dados |
| [EVENTOS.md](./EVENTOS.md) | Catálogo completo de eventos GHL |
| [EXEMPLOS-PAYLOADS.md](./EXEMPLOS-PAYLOADS.md) | Payloads reais para análise |
| [MAPEAMENTO-CAMPOS.md](./MAPEAMENTO-CAMPOS.md) | Mapeamento de campos → tabelas |

---

## 🎯 Próximos Passos

1. Ler `REGRAS-EXTRACAO.md`
2. Familiarizar-se com os eventos em `EVENTOS.md`
3. Analisar payloads de exemplo
4. Quando identificar necessidade de extração, seguir o fluxo documentado

---

*Criado em: 2026-02-18*  
*Responsável: Arquiteto de Dados + Product Owner*
