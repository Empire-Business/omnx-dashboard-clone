// Indexa documentação interna para o RAG da Clara.
// Uso: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/index-clara-docs.ts

import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const ROOT = process.cwd()
const DOC_PATHS = ['CLAUDE.md', 'docs', 'plans']

interface DocFile {
  path: string
  content: string
  hash: string
}

async function walk(dir: string): Promise<string[]> {
  const files: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'test-results', '.temp'].includes(entry.name)) continue
      files.push(...await walk(fullPath))
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }
  return files
}

async function collectFiles(): Promise<DocFile[]> {
  const paths = new Set<string>()
  for (const p of DOC_PATHS) {
    const full = path.join(ROOT, p)
    try {
      const stat = await fs.stat(full)
      if (stat.isDirectory()) {
        const walked = await walk(full)
        walked.forEach((w) => paths.add(path.relative(ROOT, w)))
      } else if (stat.isFile()) {
        paths.add(p)
      }
    } catch {
      console.warn(`⚠️ Ignorando ${full}`)
    }
  }

  const docs: DocFile[] = []
  for (const relPath of paths) {
    try {
      const content = await fs.readFile(path.join(ROOT, relPath), 'utf-8')
      const hash = crypto.createHash('sha256').update(content).digest('hex')
      docs.push({ path: relPath, content, hash })
    } catch (err) {
      console.warn(`⚠️ Não foi possível ler ${relPath}:`, err)
    }
  }
  return docs
}

function chunkByHeaders(content: string, docPath: string): { title: string; content: string; index: number }[] {
  const lines = content.split('\n')
  const chunks: { title: string; content: string; index: number }[] = []
  let current: { title: string; lines: string[] } = { title: docPath, lines: [] }
  let index = 0

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line)) {
      if (current.lines.length > 0) {
        chunks.push({
          title: current.title,
          content: current.lines.join('\n').trim(),
          index,
        })
        index++
      }
      current = { title: line.replace(/^#+\s*/, '').trim(), lines: [line] }
    } else {
      current.lines.push(line)
    }
  }

  if (current.lines.length > 0) {
    chunks.push({
      title: current.title,
      content: current.lines.join('\n').trim(),
      index,
    })
  }

  return chunks
}

async function indexDoc(doc: DocFile) {
  const { data: existing } = await supabase
    .from('ai_doc_index_status')
    .select('file_hash')
    .eq('doc_path', doc.path)
    .maybeSingle()

  if (existing?.file_hash === doc.hash) {
    console.log(`⏭️  ${doc.path} (sem alterações)`)
    return
  }

  const chunks = chunkByHeaders(doc.content, doc.path)
  console.log(`🔄 Indexando ${doc.path} (${chunks.length} chunks)`)

  await supabase.from('ai_doc_chunks').delete().eq('doc_path', doc.path)

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from('ai_doc_chunks').insert(
      chunks.map((c) => ({
        doc_path: doc.path,
        chunk_index: c.index,
        title: c.title,
        content: c.content,
        metadata: { file_hash: doc.hash },
      }))
    )
    if (insertError) {
      console.error(`❌ Erro ao inserir chunks de ${doc.path}:`, insertError.message)
      return
    }
  }

  await supabase.from('ai_doc_index_status').upsert({
    doc_path: doc.path,
    file_hash: doc.hash,
    last_indexed_at: new Date().toISOString(),
    chunk_count: chunks.length,
    status: 'indexed',
  })
}

async function cleanupRemovedDocs(docs: DocFile[]) {
  const { data: statuses } = await supabase.from('ai_doc_index_status').select('doc_path')
  const currentPaths = new Set(docs.map((d) => d.path))
  const toRemove = (statuses || []).filter((s) => !currentPaths.has(s.doc_path))
  for (const s of toRemove) {
    console.log(`🗑️  Removendo ${s.doc_path}`)
    await supabase.from('ai_doc_chunks').delete().eq('doc_path', s.doc_path)
    await supabase.from('ai_doc_index_status').delete().eq('doc_path', s.doc_path)
  }
}

async function main() {
  console.log('📚 Indexando documentação da Clara...')
  const docs = await collectFiles()
  console.log(`📄 ${docs.length} arquivos encontrados`)

  for (const doc of docs) {
    await indexDoc(doc)
  }

  await cleanupRemovedDocs(docs)
  console.log('✅ Indexação concluída')
}

main().catch((err) => {
  console.error('❌ Erro:', err)
  process.exit(1)
})
