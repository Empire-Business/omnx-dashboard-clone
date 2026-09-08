// Renderizador de markdown sem dependências externas — mesma filosofia de
// ChatMessage.tsx (renderMarkdown), mas mais completo: suporta blockquote,
// links, <details>/<summary> e linha horizontal, que os documentos em
// docs/*.md (ex: CONTRATO-WEBHOOK-CRM.md) usam e o renderer do chat não
// cobre. Não reaproveita/edita o renderer do chat para não arriscar
// regressão numa feature já em produção.

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function renderInline(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code class="docs-md-inline-code">$1</code>')
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const isExternal = /^https?:\/\//.test(href)
    // Links para outro arquivo .md do repo não têm pra onde apontar dentro do
    // painel (essa tela só embute os 2 docs de webhook) — vira texto com o
    // nome do arquivo entre parênteses em vez de link quebrado.
    if (!isExternal) {
      return `${label} <span class="docs-md-file-ref">(${href})</span>`
    }
    return `<a href="${href}" class="docs-md-link" target="_blank" rel="noreferrer">${label}</a>`
  })
  return html
}

function renderTable(rows: string[]): string {
  const header = rows[0]
  const body = rows.slice(2)
  const headerTrimmed = header.trim().replace(/^\|/, '').replace(/\|$/, '')
  const thCells = headerTrimmed
    .split('|')
    .map((c) => `<th class="docs-md-th">${renderInline(c.trim())}</th>`)
    .join('')
  const trRows = body
    .map((row) => {
      // Remove só o pipe de abertura/fechamento da linha (não filtra células
      // vazias legítimas no meio da tabela).
      const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '')
      const cells = trimmed.split('|').map((c) => c.trim())
      const tds = cells.map((c) => `<td class="docs-md-td">${renderInline(c)}</td>`).join('')
      return `<tr>${tds}</tr>`
    })
    .join('')
  return `<table class="docs-md-table"><thead><tr>${thCells}</tr></thead><tbody>${trRows}</tbody></table>`
}

/**
 * Converte um documento markdown (como docs/CONTRATO-WEBHOOK-CRM.md) em HTML
 * para exibição dentro do painel. Não é um parser markdown genérico — cobre
 * só a sintaxe usada nos documentos do projeto (headers, tabelas, listas,
 * código, blockquote, links, <details>, linha horizontal).
 */
export function renderDocsMarkdown(source: string): string {
  // <details>...</details> passa direto (bloco HTML já pronto no doc) — protegido
  // via placeholder para não ser escapado nem processado como texto normal.
  const detailsBlocks: string[] = []
  const text = source.replace(
    /<details>\n<summary>(.*)<\/summary>\n?([\s\S]*?)<\/details>/g,
    (_m, summary: string, inner: string) => {
      const codeBody = inner.trim().replace(/^```\n?/, '').replace(/\n?```$/, '')
      const html = `<details class="docs-md-details"><summary>${escapeHtml(summary)}</summary><pre class="docs-md-pre">${escapeHtml(codeBody)}</pre></details>`
      detailsBlocks.push(html)
      return `@@DETAILS_${detailsBlocks.length - 1}@@`
    },
  )

  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  let inList: 'ul' | 'ol' | null = null

  const closeList = () => {
    if (inList) {
      out.push(inList === 'ul' ? '</ul>' : '</ol>')
      inList = null
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Placeholder de <details>
    const detailsMatch = line.match(/^@@DETAILS_(\d+)@@$/)
    if (detailsMatch) {
      closeList()
      out.push(detailsBlocks[Number(detailsMatch[1])])
      i++
      continue
    }

    // Bloco de código ```...```
    if (line.trim().startsWith('```')) {
      closeList()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // pula a linha de fechamento ```
      out.push(`<pre class="docs-md-pre">${escapeHtml(codeLines.join('\n'))}</pre>`)
      continue
    }

    // Tabela
    if (/^\|.+\|$/.test(line.trim()) && lines[i + 1] && /^\|?[-| :]+\|?$/.test(lines[i + 1].trim())) {
      closeList()
      const tableLines: string[] = [line]
      i++
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        tableLines.push(lines[i])
        i++
      }
      out.push(renderTable(tableLines))
      continue
    }

    // Linha horizontal
    if (/^---+$/.test(line.trim())) {
      closeList()
      out.push('<hr class="docs-md-hr" />')
      i++
      continue
    }

    // Headers
    const h = line.match(/^(#{1,4}) (.+)$/)
    if (h) {
      closeList()
      const level = h[1].length
      out.push(`<h${level} class="docs-md-h${level}">${renderInline(h[2])}</h${level}>`)
      i++
      continue
    }

    // Blockquote (pode ter várias linhas consecutivas com >)
    if (line.trim().startsWith('>')) {
      closeList()
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      out.push(`<blockquote class="docs-md-quote">${renderInline(quoteLines.join(' '))}</blockquote>`)
      continue
    }

    // Listas
    const ulMatch = line.match(/^[-*] (.+)$/)
    const olMatch = line.match(/^\d+\. (.+)$/)
    if (ulMatch || olMatch) {
      const kind = ulMatch ? 'ul' : 'ol'
      if (inList !== kind) {
        closeList()
        out.push(kind === 'ul' ? '<ul class="docs-md-ul">' : '<ol class="docs-md-ol">')
        inList = kind
      }
      out.push(`<li>${renderInline((ulMatch ?? olMatch)![1])}</li>`)
      i++
      continue
    }

    // Linha vazia
    if (line.trim() === '') {
      closeList()
      i++
      continue
    }

    // Parágrafo comum
    closeList()
    out.push(`<p class="docs-md-p">${renderInline(line)}</p>`)
    i++
  }
  closeList()

  return out.join('\n')
}
