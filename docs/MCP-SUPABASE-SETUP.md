# MCP Supabase - Setup Completo (Claude Code)

**Data:** 2026-02-26
**Status:** ✅ Configurado com controle total
**Projeto:** qzesffnkqgelmtfblzkr

---

## O que foi configurado

### 1. Servidor MCP Supabase
- **Pacote:** `@supabase/mcp-server-supabase@0.5.5`
- **Local:** `.kilocode/mcp.json`
- **Access Token:** Lido do `.env.local` (`SUPABASE_ACCESS_TOKEN`)

### 2. Permissões Concedidas (Controle Total)

O Claude agora tem acesso a:

#### 🗂️ Estrutura do Banco
- `list_projects` - Ver todos os projetos
- `list_tables` - Listar tabelas
- `get_project_info` - Informações do projeto
- `search_docs` - Buscar documentação

#### 📝 Operações em Tabelas
- `create_table` - Criar tabelas
- `alter_table` - Modificar estrutura
- `drop_table` - Deletar tabelas
- `execute_sql` - Executar SQL direto

#### ⚙️ Funções & Triggers
- `create_function` - Criar funções PostgreSQL
- `delete_function` - Deletar funções
- `list_edge_functions` - Ver Edge Functions
- `deploy_edge_function` - Deploy de funções

#### 🔐 Segurança & RLS
- `create_role` - Criar roles de usuário
- `alter_role` - Modificar roles
- `create_policy` - Criar políticas RLS
- `alter_policy` - Modificar políticas RLS
- `delete_policy` - Deletar políticas

#### 🔔 Webhooks & Logs
- `list_migrations` - Ver histórico de migrations
- `get_logs` - Acessar logs do projeto
- `create_webhook` - Criar webhooks
- `delete_webhook` - Deletar webhooks

---

## Credenciais Utilizadas

```bash
# Projeto
Project Reference: qzesffnkqgelmtfblzkr
Project URL: https://qzesffnkqgelmtfblzkr.supabase.co

# Tokens (no .env.local)
SUPABASE_ACCESS_TOKEN=<SEU_SUPABASE_ACCESS_TOKEN_AQUI>
SUPABASE_SERVICE_ROLE_KEY=<SEU_SUPABASE_SERVICE_ROLE_KEY_AQUI>
```

> ⚠️ Nunca commite valores reais. Mantenha essas chaves apenas no `.env.local` (já no `.gitignore`).

---

## Como Usar

### Exemplos de Comandos

```
# Solicitar informações do banco
"Mostre a estrutura completa do meu banco de dados"

# Criar tabela
"Crie uma tabela chamada 'clientes' com campos: id, nome, email, telefone"

# Executar SQL
"Execute essa query: SELECT COUNT(*) FROM usuarios WHERE ativo = true"

# Configurar RLS
"Configure RLS para a tabela 'pedidos' de forma que cada usuário veja só seus pedidos"

# Ver logs
"Mostre os últimos 50 logs do meu projeto"

# Listar migrations
"Liste todas as migrations que rodaram no meu banco"
```

---

## Segurança & Melhores Práticas

### ✅ O que está protegido:
- Chaves no `.env.local` (nunca commitadas)
- RLS policies continuam em vigência
- Auditoria de todas as ações no Supabase
- Rate limiting nativo do Supabase

### ⚠️ O que é importante:
- Claude pode criar/modificar/deletar **qualquer coisa** no banco
- Sempre revise ações críticas antes de confirmar
- Mantenha backups regularmente
- RLS é a camada final de proteção

### 🔒 Recomendações:
1. Use RLS em **todas as tabelas** com dados de usuário
2. Revise migrations antes de aplicar em produção
3. Teste mudanças em ambiente local primeiro
4. Mantenha `.env.local` seguro (nunca share!)

---

## Troubleshooting

### Erro: "Access denied"
```
Causa: Token expirou ou não tem permissão
Solução: Gere novo token em https://supabase.com/dashboard/account/tokens
```

### Erro: "Connection refused"
```
Causa: Servidor MCP não está rodando
Solução: Reinicie o Claude Code (⌘Q ou Ctrl+Q)
```

### Erro: "Unknown permission"
```
Causa: Versão do MCP desatualizada
Solução: Atualize via "npm install -D @supabase/mcp-server-supabase@latest"
```

---

## Próximas Etapas Recomendadas

- [ ] Criar tabelas base com RLS
- [ ] Configurar Edge Functions para lógica complexa
- [ ] Implementar webhooks para integrações
- [ ] Fazer backup regular (Supabase → Settings → Backups)
- [ ] Testar RLS policies com diferentes usuários

---

## Referências

- [Supabase Docs](https://supabase.com/docs)
- [MCP Protocol](https://modelcontextprotocol.io)
- [PostgreSQL Functions](https://www.postgresql.org/docs/current/sql-functions.html)
- [RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)

---

**Criado por:** Claude Code
**Tipo:** Setup Documentation
**Versão:** 1.0.0
