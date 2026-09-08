# Plano de Correção — Pipeline Recuperação

> **Problema:** O time moveu oportunidades para o pipeline Recuperação em vez de duplicá-las.
> **Objetivo:** Para os leads que foram movidos (sem par em outro pipeline), restaurar no pipeline original e duplicar para Recuperação.

---

## Documentos deste plano

| Arquivo | Descrição |
|---------|-----------|
| [DIAGNOSTICO.md](DIAGNOSTICO.md) | Números exatos — quem precisa de correção e quem já está OK |
| [VIABILIDADE-TECNICA.md](VIABILIDADE-TECNICA.md) | Verificação de que a operação é possível com os dados disponíveis |
| [REGRAS-CLASSIFICACAO.md](REGRAS-CLASSIFICACAO.md) | Como determinar o pipeline original de cada lead |
| [PLANO-EXECUCAO.md](PLANO-EXECUCAO.md) | Passo a passo: fase de teste (5 leads) → validação → escala total |
| [API-PERMISSOES.md](API-PERMISSOES.md) | Quais permissões adicionar na API Key já configurada |
| [ROLLBACK.md](ROLLBACK.md) | Como desfazer tudo se algo der errado |

---

## Escopo da operação

```
382 leads em Recuperação
├── 136 → FORA DO ESCOPO ✅ (já têm opp em outro pipeline = foram duplicados corretamente)
└── 246 → ALVO DA CORREÇÃO ❌ (só estão em Recuperação = foram movidos, não duplicados)
```

## O que vai acontecer com cada um dos 246

```
ANTES:    [Recuperação] ← única opp, criada em data original

DEPOIS:   [Pipeline Original] ← mesma opp, mesma data de criação, estágio "Perdido"
          [Recuperação]       ← nova opp duplicada, data de hoje, estágio copiado da atual
```

## Status da execução

- [ ] Permissões de API adicionadas (ver [API-PERMISSOES.md](API-PERMISSOES.md))
- [ ] IDs dos stages "Perdido" coletados via `GET /pipelines`
- [ ] **FASE 1 — Teste com 5 leads** executada e validada
- [ ] Decisão tomada sobre os 26 leads "sem tag clara"
- [ ] **FASE 2 — Execução completa** (220 leads com classificação clara)
- [ ] Validação pós-execução no banco
