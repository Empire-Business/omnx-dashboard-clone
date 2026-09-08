import { useState } from 'react'
import { KeyRound, CheckCircle2, CircleOff, Eye, EyeOff, ShieldCheck, PlugZap, Trash2, Plus, X, XCircle, Dices, Copy } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCredentialsStatus,
  useSaveCredential,
  useTestConnection,
  useRevokeCredential,
  type CredentialProvider,
  type CredentialStatus,
} from '@/hooks/useWorkspaceCredentials'

// ─── Contas Meta (Fase 15 — multi-conta) ─────────────────────
// Mesma regra de leitura do test-workspace-credential-logic.ts (duplicada aqui
// de propósito: o frontend não importa código de edge function).
const META_ACCOUNT_ID_RE = /^act_\d+$/

function extractMetaAccountIds(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) return []
  const out: string[] = []
  const push = (raw: unknown) => {
    if (typeof raw !== 'string') return
    const trimmed = raw.trim()
    if (!trimmed) return
    const withPrefix = trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`
    if (!out.includes(withPrefix)) out.push(withPrefix)
  }
  const list = metadata.ad_account_ids
  if (Array.isArray(list)) list.forEach(push)
  push(metadata.ad_account_id) // fallback legado (singular)
  return out
}

// Normaliza a entrada do usuário: aceita "act_123" ou só "123" (o RPC de save
// aplica a mesma regra) e valida o formato final act_\d+.
function normalizeAccountInput(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withPrefix = trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`
  return META_ACCOUNT_ID_RE.test(withPrefix) ? withPrefix : null
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  } catch {
    return iso
  }
}

// GHL saiu daqui: vive inteiro em /workspace/ghl-config (Passo 1 do fluxo de
// conexão, junto com o mapeamento de campos/pipelines/stages). Esta página
// agora é só para Meta Ads e OpenRouter.
function MetaProviderCard({ status }: { status?: CredentialStatus }) {
  const isConnected = !!status

  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [accounts, setAccounts] = useState<string[]>(() => extractMetaAccountIds(status?.metadata))
  const [newAccount, setNewAccount] = useState('')
  const [accountError, setAccountError] = useState<string | null>(null)

  const save = useSaveCredential()
  const testConnection = useTestConnection()

  const handleAddAccount = () => {
    const normalized = normalizeAccountInput(newAccount)
    if (!normalized) {
      setAccountError('Formato inválido. Use act_ seguido de números (ex.: act_1234567890).')
      return
    }
    if (accounts.includes(normalized)) {
      setAccountError('Esta conta já está na lista.')
      return
    }
    setAccounts((prev) => [...prev, normalized])
    setNewAccount('')
    setAccountError(null)
  }

  const handleRemoveAccount = (accountId: string) => {
    setAccounts((prev) => prev.filter((a) => a !== accountId))
    setAccountError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedSecret = secret.trim()
    if (!trimmedSecret || accounts.length === 0) return
    // Envia as DUAS chaves: `ad_account_ids` é a lista canônica (Fase 15) e
    // `ad_account_id` (primeiro da lista) mantém compat com código que ainda
    // lê o singular — o RPC de save aplica a mesma regra server-side.
    save.mutate(
      {
        provider: 'meta',
        secret: trimmedSecret,
        metadata: { ad_account_ids: accounts, ad_account_id: accounts[0] },
      },
      {
        onSuccess: () => {
          setSecret('') // nunca manter a chave em tela apos salvar
          setShowSecret(false)
        },
      }
    )
  }

  const testAccounts = testConnection.data?.accounts

  return (
    <Card variant="accent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-empire-primary" />
            Meta Ads
          </CardTitle>
          {isConnected ? (
            <Badge className="gap-1 bg-empire-success/15 text-empire-success border-empire-success/30">
              <CheckCircle2 className="h-3 w-3" /> Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <CircleOff className="h-3 w-3" /> Não conectado
            </Badge>
          )}
        </div>
        <CardDescription>Conecta a sua conta de anúncios da Meta (Facebook/Instagram).</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isConnected && (
          <div className="rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 text-[12px] text-empire-muted">
            <div>
              <span className="font-medium text-empire-void">
                Conta{accounts.length !== 1 ? 's' : ''} de anúncios:
              </span>{' '}
              <span className="font-mono">{accounts.length > 0 ? accounts.join(', ') : '—'}</span>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span>
                Última atualização: {formatDate(status!.updated_at)} (versão {status!.rotation_version})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 px-2 py-1 text-[12px]"
                disabled={testConnection.isPending}
                onClick={() => testConnection.mutate('meta')}
              >
                <PlugZap className="h-3.5 w-3.5" />
                {testConnection.isPending ? 'Testando…' : 'Testar conexão'}
              </Button>
            </div>
            {testAccounts && testAccounts.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-empire-border pt-2">
                {testAccounts.map((a) => (
                  <li key={a.account_id} className="flex items-start gap-1.5">
                    {a.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-empire-success" />
                    ) : (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-empire-danger" />
                    )}
                    <span className="font-mono">{a.account_id}</span>
                    {a.ok ? (
                      a.name ? <span className="text-empire-muted">— {a.name}</span> : null
                    ) : (
                      <span className="text-empire-danger">— {a.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="meta-secret">
              {isConnected ? 'Trocar chave' : 'Chave de acesso'}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="meta-secret"
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={isConnected ? 'Cole a nova chave para trocar' : 'Cole a chave aqui'}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="meta-account">Contas de anúncios</Label>
            {accounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {accounts.map((accountId) => (
                  <span
                    key={accountId}
                    className="inline-flex items-center gap-1 rounded-md border border-empire-border bg-empire-elevated/60 px-2 py-1 font-mono text-[12px] text-empire-void"
                  >
                    {accountId}
                    <button
                      type="button"
                      onClick={() => handleRemoveAccount(accountId)}
                      aria-label={`Remover conta ${accountId}`}
                      className="text-empire-subtle transition-colors hover:text-empire-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                id="meta-account"
                value={newAccount}
                onChange={(e) => {
                  setNewAccount(e.target.value)
                  setAccountError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddAccount()
                  }
                }}
                placeholder="Ex.: act_1234567890"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                className="gap-1"
                onClick={handleAddAccount}
                disabled={!newAccount.trim()}
              >
                <Plus className="h-4 w-4" /> Adicionar
              </Button>
            </div>
            {accountError && <p className="text-[12px] text-empire-danger">{accountError}</p>}
            <p className="text-[12px] text-empire-subtle">
              Um token Meta pode atender várias contas — o painel soma o investimento de todas e
              permite filtrar por conta no Tráfego.
              {isConnected && ' Para alterar a lista, cole a chave novamente e salve.'}
            </p>
          </div>

          <Button type="submit" disabled={save.isPending || !secret.trim() || accounts.length === 0}>
            {save.isPending ? 'Salvando…' : isConnected ? 'Salvar nova chave' : 'Conectar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// Cadastro da credencial Notion (sub-app Criativos).
//
// Diferente dos outros providers, o Notion precisa de MAIS que a chave: a
// `notion-creatives-sync` lê os IDs das bases exclusivamente do metadata da credencial
// (`notion_database_id_paid` / `notion_database_id_organic`) — sem eles a function
// responde 422 e o cron não sincroniza nada. Por isso os dois campos ficam aqui, junto
// da chave, em vez de numa tela separada.
//
// Este card não existia até 2026-09-01, e a falta dele foi a causa de o sync do Notion
// ficar ~50 dias morto em silêncio. Ver docs/MUDANCAS.md.
function NotionCard({ status }: { status?: CredentialStatus }) {
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const [dbPaid, setDbPaid] = useState('')
  const [dbOrganic, setDbOrganic] = useState('')
  const save = useSaveCredential()
  const revoke = useRevokeCredential()
  const isConnected = !!status

  const handleRevoke = () => {
    if (!window.confirm('Remover esta chave? A sincronização de criativos com o Notion para de rodar até uma nova chave ser cadastrada.')) return
    revoke.mutate('notion')
  }

  // O ID da base é obrigatório: sem ele a sincronização falha fechada (422).
  const podeSalvar = !!secret.trim() && !!dbPaid.trim()

  return (
    <Card variant="accent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-empire-primary" /> Notion (Criativos)
          </CardTitle>
          {isConnected ? (
            <Badge className="gap-1 bg-empire-success/15 text-empire-success border-empire-success/30">
              <CheckCircle2 className="h-3 w-3" /> Conectada
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><CircleOff className="h-3 w-3" /> Não conectada</Badge>
          )}
        </div>
        <CardDescription>
          Chave da integração interna do Notion + os IDs das bases de criativos. Sem isso a
          sincronização de criativos não roda. A chave nunca volta a aparecer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 text-[12px] text-empire-muted">
            <p>Conectada em {formatDate(status.updated_at)} (versão {status.rotation_version}).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[12px] text-empire-danger hover:text-empire-danger" disabled={revoke.isPending} onClick={handleRevoke}>
                <Trash2 className="h-3.5 w-3.5" /> {revoke.isPending ? 'Removendo…' : 'Remover chave'}
              </Button>
            </div>
          </div>
        )}

        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          if (!podeSalvar) return
          save.mutate({
            provider: 'notion',
            secret: secret.trim(),
            metadata: {
              notion_database_id_paid: dbPaid.trim(),
              // Opcional: só as contas que usam a base orgânica preenchem.
              ...(dbOrganic.trim() ? { notion_database_id_organic: dbOrganic.trim() } : {}),
            },
          }, {
            onSuccess: () => { setSecret(''); setShow(false) },
          })
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="notion-key">{isConnected ? 'Trocar chave' : 'Chave da integração'}</Label>
            <div className="flex gap-2">
              <Input id="notion-key" type={show ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={isConnected ? 'Cole a nova chave para trocar' : 'secret_… ou ntn_…'} autoComplete="off" />
              <Button type="button" variant="outline" size="icon" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar chave' : 'Mostrar chave'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notion-db-paid">ID da base de anúncios (paga)</Label>
            <Input id="notion-db-paid" value={dbPaid} onChange={(e) => setDbPaid(e.target.value)} placeholder="Ex: 1a2b3c4d5e6f7890abcdef1234567890" autoComplete="off" />
            <p className="text-[12px] text-empire-muted">
              Está na URL da base no Notion, entre a barra e o “?”. Obrigatório.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notion-db-organic">ID da base orgânica (opcional)</Label>
            <Input id="notion-db-organic" value={dbOrganic} onChange={(e) => setDbOrganic(e.target.value)} placeholder="Deixe vazio se não usar" autoComplete="off" />
            <p className="text-[12px] text-empire-muted">
              Aceita mais de uma base separada por vírgula.
            </p>
          </div>

          <Button type="submit" disabled={!podeSalvar || save.isPending}>
            {save.isPending ? 'Salvando…' : isConnected ? 'Salvar nova chave' : 'Conectar Notion'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function OpenRouterCard({ status }: { status?: CredentialStatus }) {
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const save = useSaveCredential()
  const testConnection = useTestConnection()
  const revoke = useRevokeCredential()
  const isConnected = !!status

  const handleRevoke = () => {
    if (!window.confirm('Remover esta chave? A Clara e os recursos de IA desta conta serão desativados até uma nova chave ser cadastrada.')) return
    revoke.mutate('openrouter')
  }

  return (
    <Card variant="accent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-empire-primary" /> OpenRouter (IA)
          </CardTitle>
          {isConnected ? (
            <Badge className="gap-1 bg-empire-success/15 text-empire-success border-empire-success/30">
              <CheckCircle2 className="h-3 w-3" /> Conectada
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><CircleOff className="h-3 w-3" /> Não conectada</Badge>
          )}
        </div>
        <CardDescription>Use a chave da sua própria conta OpenRouter. Ela nunca volta a aparecer.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 text-[12px] text-empire-muted">
            <p>Conectada em {formatDate(status.updated_at)} (versão {status.rotation_version}).</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[12px]" disabled={testConnection.isPending} onClick={() => testConnection.mutate('openrouter')}>
                <PlugZap className="h-3.5 w-3.5" /> {testConnection.isPending ? 'Testando…' : 'Testar chave'}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[12px] text-empire-danger hover:text-empire-danger" disabled={revoke.isPending} onClick={handleRevoke}>
                <Trash2 className="h-3.5 w-3.5" /> {revoke.isPending ? 'Removendo…' : 'Remover chave'}
              </Button>
            </div>
          </div>
        )}

        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          if (!secret.trim()) return
          save.mutate({ provider: 'openrouter', secret: secret.trim(), metadata: {} }, {
            onSuccess: () => { setSecret(''); setShow(false) },
          })
        }}>
          <Label htmlFor="openrouter-key">{isConnected ? 'Trocar chave' : 'Chave da API'}</Label>
          <div className="flex gap-2">
            <Input id="openrouter-key" type={show ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={isConnected ? 'Cole a nova chave para trocar' : 'Cole a chave aqui'} autoComplete="off" />
            <Button type="button" variant="outline" size="icon" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar chave' : 'Mostrar chave'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <Button type="submit" disabled={!secret.trim() || save.isPending}>
            {save.isPending ? 'Salvando…' : isConnected ? 'Salvar nova chave' : 'Conectar IA'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function generateStrongSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  } catch {
    toast.error('Não foi possível copiar — selecione e copie manualmente')
  }
}

function OmnxDeskCard({ status }: { status?: CredentialStatus }) {
  const [secret, setSecret] = useState('')
  const [show, setShow] = useState(false)
  const save = useSaveCredential()
  const revoke = useRevokeCredential()
  const isConnected = !!status

  const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-registrar-venda`

  const handleRevoke = () => {
    if (!window.confirm('Remover este secret? O omnx-desk desta conta deixará de registrar vendas até um novo secret ser cadastrado.')) return
    revoke.mutate('omnx_desk')
  }

  const handleGenerate = () => {
    setSecret(generateStrongSecret())
    setShow(true) // mostra para a pessoa copiar ANTES de salvar — depois nunca mais aparece
  }

  return (
    <Card variant="accent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-empire-primary" /> omnx-desk (Vendas)
          </CardTitle>
          {isConnected ? (
            <Badge className="gap-1 bg-empire-success/15 text-empire-success border-empire-success/30">
              <CheckCircle2 className="h-3 w-3" /> Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1"><CircleOff className="h-3 w-3" /> Não conectado</Badge>
          )}
        </div>
        <CardDescription>
          Secret exclusivo desta conta: o omnx-desk o envia no cabeçalho ao registrar vendas fechadas.
          É o que garante que uma venda nunca caia no painel de outra conta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1 rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 pl-7 text-[12px] text-empire-muted">
          <li>Gere um secret forte (ou cole um que você já usa) e <span className="font-medium text-empire-void">anote-o</span> — depois de salvo, ele nunca mais aparece.</li>
          <li>Clique em Conectar para guardá-lo no cofre.</li>
          <li>No omnx-desk, configure a URL e o cabeçalho abaixo com esse secret.</li>
          <li>Envie uma venda de teste e confira na página Vendas.</li>
        </ol>

        <div className="rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 text-[12px] text-empire-muted space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0">
              <span className="font-medium text-empire-void">URL para o omnx-desk:</span>{' '}
              <span className="font-mono break-all">{endpoint}</span>
            </p>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard(endpoint, 'URL')} aria-label="Copiar URL">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0">
              <span className="font-medium text-empire-void">Cabeçalho:</span>{' '}
              <span className="font-mono">x-omnx-desk-secret: &lt;seu secret&gt;</span>
            </p>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => copyToClipboard('x-omnx-desk-secret: ', 'Cabeçalho')} aria-label="Copiar cabeçalho">
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {status && (
          <div className="rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 text-[12px] text-empire-muted">
            <p>Conectado em {formatDate(status.updated_at)} (versão {status.rotation_version}).</p>
            <div className="mt-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[12px] text-empire-danger hover:text-empire-danger" disabled={revoke.isPending} onClick={handleRevoke}>
                <Trash2 className="h-3.5 w-3.5" /> {revoke.isPending ? 'Removendo…' : 'Remover secret'}
              </Button>
            </div>
          </div>
        )}

        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          if (!secret.trim()) return
          save.mutate({ provider: 'omnx_desk', secret: secret.trim(), metadata: {} }, {
            onSuccess: () => { setSecret(''); setShow(false) },
          })
        }}>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="omnx-desk-secret">{isConnected ? 'Trocar secret' : 'Secret da conta'}</Label>
            <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12px]" onClick={handleGenerate}>
              <Dices className="h-3.5 w-3.5" /> Gerar secret forte
            </Button>
          </div>
          <div className="flex gap-2">
            <Input id="omnx-desk-secret" type={show ? 'text' : 'password'} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={isConnected ? 'Cole o novo secret para trocar' : 'Cole ou gere o secret aqui'} autoComplete="off" />
            <Button type="button" variant="outline" size="icon" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar secret' : 'Mostrar secret'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            {secret && (
              <Button type="button" variant="outline" size="icon" onClick={() => copyToClipboard(secret, 'Secret')} aria-label="Copiar secret">
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button type="submit" disabled={!secret.trim() || save.isPending}>
            {save.isPending ? 'Salvando…' : isConnected ? 'Salvar novo secret' : 'Conectar omnx-desk'}
          </Button>
        </form>

        <p className="text-[12px] text-empire-subtle">
          Dúvidas no passo a passo ou no formato do envio? Veja o guia completo em{' '}
          <Link to="/workspace/ghl-config" className="underline hover:text-empire-primary">
            Conectar GHL → aba Documentação → Vendas fechadas (omnx-desk)
          </Link>.
        </p>
      </CardContent>
    </Card>
  )
}

export function WorkspaceIntegrationsPage() {
  const { data, isLoading, isError, error } = useCredentialsStatus()
  const byProvider = new Map<CredentialProvider, CredentialStatus>()
  for (const row of data ?? []) byProvider.set(row.provider, row)

  return (
    <PageShell
      title="Integrações"
      description="Conecte as chaves de acesso externas da conta: Meta Ads, OpenRouter (IA da Clara) e o secret do omnx-desk (registro de vendas). As chaves são guardadas em um cofre seguro e nunca voltam a aparecer na tela. Procurando o GHL? Ele fica em Conectar GHL, no menu."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-empire-primary" />
              Como funciona a segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="text-[13px] text-empire-muted space-y-1">
            <p>
              Ao colar a chave e clicar em Conectar, ela vai direto para um cofre. Ninguém — nem você —
              consegue ler a chave de volta depois; o sistema usa internamente quando precisa.
            </p>
            <p>
              Para trocar uma chave, cole a nova no campo e salve. A troca se espalha em poucos segundos.
            </p>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="py-4 text-sm text-empire-danger">
              Erro ao carregar o status das integrações:{' '}
              {error instanceof Error ? error.message : 'tente novamente'}
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (
          <div className="grid gap-6 md:grid-cols-2">
            <MetaProviderCard status={byProvider.get('meta')} />
            <OpenRouterCard status={byProvider.get('openrouter')} />
            <NotionCard status={byProvider.get('notion')} />
            <OmnxDeskCard status={byProvider.get('omnx_desk')} />
          </div>
        )}
      </div>
    </PageShell>
  )
}
