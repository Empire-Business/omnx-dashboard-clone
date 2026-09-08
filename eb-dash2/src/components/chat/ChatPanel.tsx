import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react'
import { Send, Trash2, Loader2, Maximize2, Minimize2, X, Download, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatContext } from '@/contexts/ChatContext'
import { useBotChat } from '@/hooks/useBotChat'
import { supabase } from '@/lib/supabase'
import { ChatMessage, renderMarkdown } from './ChatMessage'

interface HistoryConv {
  id: string
  title: string | null
  created_at: string
  message_count: number
}

interface HistoryMsg {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

const SUGGESTIONS = [
  'Quantos MQLs tivemos esse mês?',
  'Qual o faturamento do mês atual?',
  'Mostre o ranking de SDRs',
  'Qual o CPMQL do período?',
  'Quais leads estão parados?',
]

interface ChatPanelProps {
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  onClose?: () => void
}

export function ChatPanel({ isFullscreen, onToggleFullscreen, onClose }: ChatPanelProps) {
  const { messages, clearMessages, loadConversation } = useChatContext()
  const { sendMessage, isLoading } = useBotChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Histórico
  const [showHistory, setShowHistory] = useState(false)
  const [historyConvs, setHistoryConvs] = useState<HistoryConv[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const openHistory = useCallback(async () => {
    setShowHistory(true)
    setHistoryLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setHistoryLoading(false); return }
    const { data } = await supabase
      .from('ai_conversations')
      .select('id, title, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(40)
    // Contar mensagens por conversa
    const convs: HistoryConv[] = []
    for (const conv of data ?? []) {
      const { count } = await supabase
        .from('ai_messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
      convs.push({ ...conv, message_count: count ?? 0 })
    }
    setHistoryConvs(convs)
    setHistoryLoading(false)
  }, [])

  const handleLoadConversation = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('ai_messages')
      .select('role, content, created_at')
      .eq('conversation_id', convId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
    const msgs: HistoryMsg[] = (data ?? []) as HistoryMsg[]
    loadConversation(convId, msgs.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(m.created_at),
    })))
    setShowHistory(false)
  }, [loadConversation])

  // Scroll automático para o fim
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Foca o input ao abrir
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    sendMessage(text)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleDownloadPdf = () => {
    const date = new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })
    const rows = messages.map((msg) => {
      const content =
        msg.role === 'user'
          ? msg.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')
          : renderMarkdown(msg.content)
      const ts = msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      return `<div class="msg ${msg.role}"><div class="bubble ${msg.role}">${content}<div class="ts">${ts}</div></div></div>`
    }).join('')

    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Clara — ${date}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:32px;background:var(--empire-canvas);color:var(--empire-void)}
  h1{font-size:18px;margin:0 0 4px;color:var(--empire-void)}
  .meta{font-size:12px;color:var(--empire-subtle);margin-bottom:24px;border-bottom:1px solid var(--empire-border);padding-bottom:16px}
  .msg{margin-bottom:16px;display:flex}
  .msg.user{justify-content:flex-end}
  .bubble{max-width:80%;padding:10px 14px;border-radius:16px;font-size:13px;line-height:1.55}
  .bubble.user{background:var(--empire-void);color:var(--empire-surface);border-bottom-right-radius:4px}
  .bubble.assistant{background:var(--empire-elevated);border-bottom-left-radius:4px}
  .ts{font-size:10px;color:var(--empire-subtle);margin-top:4px;text-align:right}
  table{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}
  th,td{padding:4px 8px;border-bottom:1px solid var(--empire-border);text-align:left}
  th{font-weight:600}
  pre{background:var(--empire-elevated);border:1px solid var(--empire-border);border-radius:6px;padding:8px 10px;font-size:12px;overflow-x:auto;margin:6px 0}
  code{background:var(--empire-elevated);border:1px solid var(--empire-border);border-radius:3px;padding:1px 4px;font-size:12px}
  p{margin:6px 0}
  @media print{body{padding:0;background:white;color:#1a1a1a}}
</style>
</head><body>
<h1>Clara</h1>
<div class="meta">Exportado em ${date}</div>
${rows}
<script>window.onload=()=>window.print()</script>
</body></html>`

    const win = window.open('', '_blank')
    win?.document.write(html)
    win?.document.close()
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-empire-border px-4 py-3">
        <div>
          <div className="font-semibold text-sm text-empire-void">
            Clara
          </div>
          <div className="text-[11px] text-empire-subtle">
            Consulta dados reais do dashboard
          </div>
        </div>

        {/* Botões do header */}
        <div className="flex items-center gap-1">
          {/* Baixar como PDF */}
          {messages.length > 0 && (
            <button
              onClick={handleDownloadPdf}
              title="Baixar conversa como PDF"
              className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-void/8"
            >
              <Download className="h-4 w-4" />
            </button>
          )}

          {/* Histórico */}
          <button
            onClick={openHistory}
            title="Ver histórico de conversas"
            className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-void/8"
          >
            <Clock className="h-4 w-4" />
          </button>

          {/* Nova conversa */}
          <button
            onClick={clearMessages}
            title="Nova conversa"
            className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-void/8"
          >
            <Trash2 className="h-4 w-4" />
          </button>

          {/* Toggle fullscreen */}
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'Sair da tela cheia (ESC)' : 'Tela cheia'}
              className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-void/8"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}

          {/* Fechar — só em fullscreen (modo normal tem o botão flutuante) */}
          {isFullscreen && onClose && (
            <button
              onClick={onClose}
              title="Fechar"
              className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-void/8"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div
        className={cn(
          'flex-1 overflow-y-auto py-3',
          isFullscreen ? 'px-4 sm:px-8 lg:px-24 xl:px-32' : 'px-4',
        )}
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <div className="text-center text-empire-subtle">
              <div className="mb-1 text-2xl">🧠</div>
              <div className="text-sm font-medium text-empire-void">
                Como posso ajudar?
              </div>
              <div className="text-xs">Pergunte sobre leads, MQLs, faturamento, SDRs...</div>
            </div>
            <div
              className={cn(
                'flex flex-col gap-2',
                isFullscreen ? 'w-full max-w-xl' : 'w-full',
              )}
            >
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  disabled={isLoading}
                  className="rounded-xl border border-empire-border bg-empire-surface px-3 py-2 text-left text-xs text-empire-void transition-colors hover:bg-empire-elevated disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'mx-auto flex flex-col gap-3',
              isFullscreen ? 'max-w-3xl' : 'max-w-full',
            )}
          >
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-empire-elevated px-3 py-2 text-xs text-empire-subtle">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Consultando dados...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className={cn(
          'shrink-0 border-t border-empire-border px-3 pb-3 pt-2',
          isFullscreen ? 'px-4 sm:px-8 lg:px-24 xl:px-32' : 'px-3',
        )}
      >
        <div
          className={cn(
            'mx-auto flex items-end gap-2 rounded-xl border border-empire-border bg-empire-surface px-3 py-2',
            isFullscreen ? 'max-w-3xl' : 'max-w-full',
          )}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pergunte sobre seus dados... (Enter para enviar)"
            disabled={isLoading}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-empire-void outline-none disabled:opacity-50"
            style={{
              maxHeight: 120,
              minHeight: 20,
              lineHeight: '1.5',
            }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={cn(
              'shrink-0 rounded-lg p-1.5 transition-colors disabled:opacity-40',
              input.trim() && !isLoading
                ? 'bg-empire-void text-empire-surface'
                : 'bg-transparent text-empire-subtle',
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1 text-center text-[10px] text-empire-subtle">
          Shift+Enter para nova linha
        </div>
      </div>

      {/* Modal de Histórico */}
      {showHistory && (
        <div className="absolute inset-0 z-10 flex flex-col bg-empire-canvas">
          {/* Header do modal */}
          <div className="flex shrink-0 items-center justify-between border-b border-empire-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-empire-subtle" />
              <span className="font-semibold text-sm text-empire-void">
                Histórico de conversas
              </span>
            </div>
            <button
              onClick={() => setShowHistory(false)}
              className="rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-void/8"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Lista de conversas */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-empire-subtle">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : historyConvs.length === 0 ? (
              <div className="py-12 text-center text-sm text-empire-subtle">
                Nenhuma conversa salva ainda.
              </div>
            ) : historyConvs.map((conv) => (
              <button
                key={conv.id}
                onClick={() => handleLoadConversation(conv.id)}
                className="w-full rounded-xl border border-empire-border px-3 py-2.5 text-left transition-colors hover:bg-empire-elevated"
              >
                <p className="text-xs font-medium leading-snug line-clamp-2 text-empire-void">
                  {conv.title || 'Conversa sem título'}
                </p>
                <p className="mt-0.5 text-[10px] text-empire-subtle">
                  {new Date(conv.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {' · '}{conv.message_count} mensagens
                </p>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-empire-border px-3 pb-3 pt-2">
            <button
              onClick={() => { setShowHistory(false); clearMessages() }}
              className="w-full rounded-xl border border-empire-border py-2 text-sm text-empire-void transition-colors hover:bg-empire-elevated"
            >
              + Nova conversa
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
