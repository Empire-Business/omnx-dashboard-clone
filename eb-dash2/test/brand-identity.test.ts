import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const frontendRoot = resolve(process.cwd())
const sourceRoot = join(frontendRoot, 'src')
const publicRoot = join(frontendRoot, 'public')

const prohibitedPublicReferences = [
  'acelerador de audiência',
  'empire business',
  'empire.business',
  'logo-aa.webp',
]

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) return collectSourceFiles(path)
    if (entry.name.includes('.test.')) return []
    if (!/\.(?:ts|tsx|html|json|webmanifest)$/.test(entry.name)) return []

    return [path]
  })
}

describe('identidade pública OMNX', () => {
  it('não reintroduz marcas, domínio ou favicon legados no frontend distribuído', () => {
    const files = [
      join(frontendRoot, 'index.html'),
      join(publicRoot, 'manifest.webmanifest'),
      ...collectSourceFiles(sourceRoot),
    ]

    const occurrences = files.flatMap((file) => {
      const content = readFileSync(file, 'utf8').toLocaleLowerCase('pt-BR')

      return prohibitedPublicReferences
        .filter((reference) => content.includes(reference))
        .map((reference) => `${file.replace(`${frontendRoot}/`, '')}: ${reference}`)
    })

    expect(occurrences).toEqual([])
  })
})
