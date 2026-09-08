/* eslint-disable react-refresh/only-export-components -- arquivo exporta Provider+hook/variantes por padrão de projeto */
import { useState } from 'react'
import { Copy, Check, Download } from 'lucide-react'
import { type ChatMessage as ChatMessageType } from '@/contexts/ChatContext'
import { cn } from '@/lib/utils'

interface Props {
  message: ChatMessageType
}

// Renderizador simples de markdown sem dependências externas
export function renderMarkdown(text: string): string {
  let html = text
    // Escapar HTML básico
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Blocos de código ```...```
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.slice(3, -3).replace(/^[a-z]*\n/, '')
    return `<pre style="background:var(--empire-elevated);border:1px solid var(--empire-border);border-radius:6px;padding:8px 10px;overflow-x:auto;font-size:12px;font-family:var(--font-mono);margin:6px 0;color:var(--empire-void)">${code}</pre>`
  })

  // Inline code `...`
  html = html.replace(/`([^`]+)`/g, '<code style="background:var(--empire-elevated);border:1px solid var(--empire-border);border-radius:3px;padding:1px 4px;font-size:12px;font-family:var(--font-mono);color:var(--empire-void)">$1</code>')

  // Negrito **...**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  // Itálico *...* (não processamos _..._ para não quebrar nomes de colunas como data_lead_recebido)
  html = html.replace(/\*([^*]+?)\*/g, '<em>$1</em>')

  // Tabelas markdown simples
  html = html.replace(/(\|[^\n]+\|\n?\|[-| :]+\|\n?(?:\|[^\n]+\|\n?)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split('\n').filter(Boolean)
    const header = rows[0]
    const body = rows.slice(2)
    const thCells = header.split('|').filter((c) => c.trim()).map((c) => `<th style="padding:4px 8px;text-align:left;border-bottom:1px solid var(--empire-border);font-weight:600;color:var(--empire-void)">${c.trim()}</th>`).join('')
    const trRows = body.map((row) => {
      const cells = row.split('|').filter((c) => c.trim()).map((c) => `<td style="padding:4px 8px;border-bottom:1px solid var(--empire-border);color:var(--empire-void)">${c.trim()}</td>`).join('')
      return `<tr>${cells}</tr>`
    }).join('')
    return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:6px 0"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table>`
  })

  // Headers ## e ###
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;margin:8px 0 4px;color:var(--empire-void)">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:14px;font-weight:700;margin:10px 0 4px;color:var(--empire-void)">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:15px;font-weight:700;margin:10px 0 4px;color:var(--empire-void)">$1</h1>')

  // Listas com - ou *
  html = html.replace(/^[-*] (.+)$/gm, '<li style="margin-left:16px;list-style:disc;margin-bottom:2px;color:var(--empire-void)">$1</li>')
  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="margin:4px 0">${match}</ul>`)

  // Parágrafos (linhas duplas)
  html = html.replace(/\n\n+/g, '</p><p style="margin:6px 0;color:var(--empire-void)">')

  // Quebras de linha simples
  html = html.replace(/\n/g, '<br>')

  return `<p style="margin:0;color:var(--empire-void)">${html}</p>`
}

export function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleDownloadPdf = () => {
    const date = new Date().toLocaleDateString('pt-BR', { dateStyle: 'long' })
    const ts = message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    const html = `<!DOCTYPE html><html lang="pt-BR"><head>
<meta charset="UTF-8">
<title>Clara — ${date}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:800px;margin:0 auto;padding:32px;color:var(--empire-void);background:var(--empire-canvas)}
  h1{font-size:18px;margin:0 0 4px;color:var(--empire-void)}
  .meta{font-size:12px;color:var(--empire-subtle);margin-bottom:24px;border-bottom:1px solid var(--empire-border);padding-bottom:16px}
  .bubble{background:var(--empire-elevated);border-radius:16px;border-bottom-left-radius:4px;padding:14px 18px;font-size:13px;line-height:1.6;color:var(--empire-void)}
  .ts{font-size:10px;color:var(--empire-subtle);margin-top:8px;text-align:right}
  table{border-collapse:collapse;width:100%;font-size:12px;margin:6px 0}
  th,td{padding:4px 8px;border-bottom:1px solid var(--empire-border);text-align:left}
  th{font-weight:600}
  pre{background:var(--empire-elevated);border:1px solid var(--empire-border);border-radius:6px;padding:8px 10px;font-size:12px;overflow-x:auto;margin:6px 0}
  code{background:var(--empire-elevated);border:1px solid var(--empire-border);border-radius:3px;padding:1px 4px;font-size:12px}
  p{margin:6px 0;color:var(--empire-void)}
  @media print{body{padding:0;background:white;color:#1a1a1a}}
</style>
</head><body>
<h1>Clara</h1>
<div class="meta">Exportado em ${date}</div>
<div class="bubble">${renderMarkdown(message.content)}<div class="ts">${ts}</div></div>
<script>window.onload=()=>window.print()</script>
</body></html>`
    const win = window.open('', '_blank')
    win?.document.write(html)
    win?.document.close()
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-empire-void px-3 py-2 text-sm leading-relaxed text-empire-surface">
          <span style={{ whiteSpace: 'pre-wrap' }}>{message.content}</span>
          <div className="mt-1 text-right text-[10px] text-empire-subtle opacity-70">
            {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col items-start gap-0.5">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-empire-elevated px-3 py-2 text-sm leading-relaxed text-empire-void">
        <div
          className="text-[13px] leading-[1.55]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
        />
        <div className="mt-1 text-right text-[10px] text-empire-subtle opacity-70">
          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Barra de ações — aparece no hover */}
      <div className="flex items-center px-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={handleCopy}
          title="Copiar como Markdown"
          className={cn(
            'flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-empire-void/8 text-[10px]',
            copied ? 'text-empire-success' : 'text-empire-subtle',
          )}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
        <button
          onClick={handleDownloadPdf}
          title="Baixar resposta como PDF"
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-empire-subtle transition-colors hover:bg-empire-void/8"
        >
          <Download className="h-3 w-3" />
          PDF
        </button>
      </div>
    </div>
  )
}
