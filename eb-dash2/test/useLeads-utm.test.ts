import { describe, expect, it } from 'vitest'

import { buildUtmMaps, resolveUtmName, type UtmMaps } from '@/hooks/useLeads'

// ─── Helpers ──────────────────────────────────────────────────────────────

function emptyMaps(): UtmMaps {
  return { sources: new Map(), campaigns: new Map(), mediums: new Map() }
}

// ─── buildUtmMaps ─────────────────────────────────────────────────────────

describe('buildUtmMaps', () => {
  it('monta mapas de sources, campaigns e mediums a partir das tabelas de mapeamento', () => {
    const maps = buildUtmMaps({
      sources: [{ utm_source: 'fb', nome: 'Meta Ads' }],
      sourcesPlain: [],
      campaigns: [{ utm_campaign: 'cmp_01', nome: 'Lançamento Março' }],
      mediums: [{ utm_medium: 'cpc', nome: 'CPC' }],
    })

    expect(maps.sources.get('fb')).toBe('Meta Ads')
    expect(maps.campaigns.get('cmp_01')).toBe('Lançamento Março')
    expect(maps.mediums.get('cpc')).toBe('CPC')
  })

  it('utm_sources_plain tem precedência sobre utm_sources no mesmo código', () => {
    const maps = buildUtmMaps({
      sources: [{ utm_source: 'ig', nome: 'Instagram Ads' }],
      sourcesPlain: [{ utm_source: 'ig', nome: 'Instagram Orgânico' }],
      campaigns: [],
      mediums: [],
    })

    expect(maps.sources.get('ig')).toBe('Instagram Orgânico')
  })

  it('converte utm_campaign numérico para string (padrão Inscrições)', () => {
    const maps = buildUtmMaps({
      sources: [],
      sourcesPlain: [],
      campaigns: [{ utm_campaign: 12345, nome: 'Campanha Numérica' }],
      mediums: [],
    })

    expect(maps.campaigns.get('12345')).toBe('Campanha Numérica')
  })

  it('ignora linhas com código nulo e usa o próprio código quando nome é vazio', () => {
    const maps = buildUtmMaps({
      sources: [
        { utm_source: null, nome: 'Sem código' },
        { utm_source: 'tt', nome: null },
      ],
      sourcesPlain: [],
      campaigns: [],
      mediums: [{ utm_medium: 'stories', nome: '' }],
    })

    expect(maps.sources.size).toBe(1)
    expect(maps.sources.get('tt')).toBe('tt')
    expect(maps.mediums.get('stories')).toBe('stories')
  })
})

// ─── resolveUtmName ───────────────────────────────────────────────────────

describe('resolveUtmName', () => {
  const maps = buildUtmMaps({
    sources: [{ utm_source: 'fb', nome: 'Meta Ads' }],
    sourcesPlain: [],
    campaigns: [{ utm_campaign: 'cmp_01', nome: 'Lançamento Março' }],
    mediums: [{ utm_medium: 'cpc', nome: 'CPC' }],
  })

  it('retorna o nome amigável quando o código está mapeado', () => {
    expect(resolveUtmName(maps, 'sources', 'fb')).toBe('Meta Ads')
    expect(resolveUtmName(maps, 'campaigns', 'cmp_01')).toBe('Lançamento Março')
    expect(resolveUtmName(maps, 'mediums', 'cpc')).toBe('CPC')
  })

  it('retorna o código cru quando não há mapeamento', () => {
    expect(resolveUtmName(maps, 'sources', 'google')).toBe('google')
    expect(resolveUtmName(maps, 'campaigns', 'cmp_99')).toBe('cmp_99')
    expect(resolveUtmName(maps, 'mediums', 'email')).toBe('email')
  })

  it('retorna "—" para código nulo, indefinido ou vazio', () => {
    expect(resolveUtmName(maps, 'sources', null)).toBe('—')
    expect(resolveUtmName(maps, 'campaigns', undefined)).toBe('—')
    expect(resolveUtmName(maps, 'mediums', '')).toBe('—')
  })

  it('funciona com mapas vazios (fallback para o código cru)', () => {
    const maps = emptyMaps()
    expect(resolveUtmName(maps, 'sources', 'fb')).toBe('fb')
    expect(resolveUtmName(maps, 'sources', null)).toBe('—')
  })
})
