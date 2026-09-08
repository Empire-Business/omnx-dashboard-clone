# Plano de Reimplementação - Dashboard Empire

## Situação Atual

O usuário informou que a implementação atual em `eb-dash/` **não corresponde ao que ele quer** e quer excluir a pasta e recomeçar do zero.

## Análise da Implementação Atual

A implementação atual em `eb-dash/` inclui:
- Sistema de permissões complexo com RLS e workspace isolation
- Context providers para permissões
- Componentes como `SlugUtmTab.tsx` com ~576 linhas
- Múltiplos hooks e utilities

## Questões Pendentes

Aguardando resposta do usuário sobre:
1. O PRD está correto ou precisa ser reescrito?
2. O que especificamente não atendia?
3. Qual o escopo mínimo do MVP?
4. Manter as migrações do Supabase?

---

## Plano de Reimplementação (Rascunho)

### Fase 1: Setup
- [ ] Excluir pasta `eb-dash/`
- [ ] Criar novo projeto Next.js 14+ com App Router
- [ ] Configurar Supabase client
- [ ] Setup de autenticação

### Fase 2: Layout Base
- [ ] Layout principal com navegação
- [ ] Sidebar/Menu para módulos
- [ ] Sistema de abas para sub-módulos

### Fase 3: Módulo TRAQUEAMENTO
- [ ] Aba CODS UTM com 7 sub-abas
- [ ] Sub-aba Slug UTM (MVP)
- [ ] Demais sub-abas
- [ ] Abas ORIGEM, PROCESSO DE VENDAS, etc.

### Fase 4: Funcionalidades
- [ ] "Colar do Sheets" 
- [ ] Validação anti-duplicata
- [ ] Auto-geração de códigos

---

*Atualizado: 2026-02-25*
