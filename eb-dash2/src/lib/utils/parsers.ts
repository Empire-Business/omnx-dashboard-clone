export function parseDelimitedContent(content: string): string[][] {
  content = content.replace(/^\uFEFF/, '').trim()
  if (!content) return []
  const delimiter = detectDelimiter(content)
  return parseCSV(content, delimiter)
}

function detectDelimiter(content: string): string {
  const firstLine = content.split('\n')[0]
  const tabCount = (firstLine.match(/\t/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const semicolonCount = (firstLine.match(/;/g) || []).length
  if (tabCount > 0 && tabCount >= commaCount && tabCount >= semicolonCount) return '\t'
  if (semicolonCount > commaCount) return ';'
  return ','
}

function parseCSV(content: string, delimiter: string): string[][] {
  const lines: string[][] = []
  let currentLine: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') { currentField += '"'; i++ }
        else { inQuotes = false }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === delimiter) {
        currentLine.push(currentField.trim())
        currentField = ''
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentLine.push(currentField.trim())
        lines.push(currentLine)
        currentLine = []
        currentField = ''
        if (char === '\r') i++
      } else if (char === '\r') {
        currentLine.push(currentField.trim())
        lines.push(currentLine)
        currentLine = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }

  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField.trim())
    lines.push(currentLine)
  }

  return lines
}
