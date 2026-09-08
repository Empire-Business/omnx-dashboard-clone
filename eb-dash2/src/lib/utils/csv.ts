/**
 * Utilitário de exportação CSV.
 *
 * Gera um arquivo CSV no próprio navegador (sem servidor) e dispara o download.
 * Usa ponto-e-vírgula como separador e BOM UTF-8 porque é o formato que o
 * Excel em português abre corretamente sem pedir importação manual.
 */

export type CsvColumn<T> = {
  /** Cabeçalho exibido na primeira linha do arquivo */
  header: string
  /** Como extrair o valor da linha */
  value: (row: T) => string | number | null | undefined
}

const SEPARATOR = ';'

/** Escapa um valor para uma célula CSV segura. */
function escapeCell(raw: string | number | null | undefined): string {
  if (raw == null) return ''
  let text = String(raw)
  // Proteção contra CSV injection (fórmulas executadas pelo Excel/Sheets)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  // Aspas duplas viram duplicadas; sempre envolvemos em aspas
  return `"${text.replace(/"/g, '""')}"`
}

/** Monta o conteúdo textual do CSV a partir das linhas e colunas. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(SEPARATOR)
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(SEPARATOR))
  return [head, ...body].join('\r\n')
}

/** Gera o CSV e dispara o download no navegador. */
export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const csv = buildCsv(rows, columns)
  // BOM para o Excel reconhecer UTF-8 (acentos)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/** Sufixo de data (AAAA-MM-DD) para nomear o arquivo exportado. */
export function csvDateStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
