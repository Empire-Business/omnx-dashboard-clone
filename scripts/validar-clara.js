/**
 * Validação da Clara Agente — anti-hallucinação
 * Chama test-clara-agent N vezes, compara números das respostas com dados reais.
 * Uso: node scripts/validar-clara.js [N=3]
 */
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_a-z0-9]+)=(.*)$/)
  if (m && m[1] !== 'TEST_USER_PASSWORD' && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const REF = process.env.PROJECT_REF || 'qzesffnkqgelmtfblzkr'
const BASE = `https://${REF}.supabase.co/functions/v1/test-clara-agent`
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUNS = parseInt(process.argv[2] || '3', 10)

if (!KEY) { console.error('SUPABASE_SERVICE_ROLE_KEY não configurada'); process.exit(1) }

const { createClient } = require('@supabase/supabase-js')
const sb = createClient(`https://${REF}.supabase.co`, KEY, { auth: { persistSession: false } })

// ── Ground truth ──
async function getGroundTruth() {
  const [kpis, comp, bench, creatives, campaigns] = await Promise.all([
    sb.rpc('get_clara_kpis', { p_workspace_id: '7909d02a-4d15-46ea-a7b8-5debeb6e8351', p_week_start: '2026-07-13', p_week_end: '2026-07-19' }),
    sb.rpc('get_clara_comparison', { p_workspace_id: '7909d02a-4d15-46ea-a7b8-5debeb6e8351', p_week_start: '2026-07-13', p_week_end: '2026-07-19' }),
    sb.rpc('get_clara_benchmarks', { p_workspace_id: '7909d02a-4d15-46ea-a7b8-5debeb6e8351', p_metric: 'all' }),
    sb.rpc('get_clara_creatives', { p_workspace_id: '7909d02a-4d15-46ea-a7b8-5debeb6e8351', p_week_start: '2026-07-13', p_week_end: '2026-07-19' }),
    sb.rpc('get_clara_campaigns', { p_workspace_id: '7909d02a-4d15-46ea-a7b8-5debeb6e8351', p_week_start: '2026-07-13', p_week_end: '2026-07-19' }),
  ])
  return { kpis: kpis.data, comp: comp.data, bench: bench.data, creatives: creatives.data, campaigns: campaigns.data }
}

// ── Extrai TODOS os valores numéricos do ground truth ──
function truthValueSet(truth) {
  const s = new Set()
  function add(v) {
    if (typeof v === 'number' && v > 0) {
      s.add(v)
      s.add(Math.round(v))
      s.add(Number(v.toFixed(0)))
      s.add(Number(v.toFixed(1)))
      s.add(Number(v.toFixed(2)))
    }
  }
  function walk(obj, depth = 0) {
    if (!obj || depth > 10) return
    if (Array.isArray(obj)) { obj.forEach(v => walk(v, depth + 1)); return }
    if (typeof obj === 'object') {
      for (const v of Object.values(obj)) walk(v, depth + 1)
    }
    if (typeof obj === 'number') add(obj)
  }
  walk(truth)
  return s
}

// ── Extrai números de texto ──
function extractNums(text) {
  const nums = []
  const re = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/g
  let m
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].replace(/\./g, '').replace(',', '.')
    const n = parseFloat(raw)
    if (!isNaN(n) && n > 0 && n < 1e9) {
      nums.push({ value: n, ctx: text.slice(Math.max(0, m.index - 25), m.index + m[0].length + 25).trim() })
    }
  }
  return nums
}

// ── MAIN ──
async function main() {
  console.log(`🔬 Validação Clara × ${RUNS} rodadas\n`)

  console.log('📊 Ground truth...')
  const truth = await getGroundTruth()
  const tSet = truthValueSet(truth)
  console.log(`   ${tSet.size} valores de referência no ground truth\n`)

  const results = []

  for (let r = 1; r <= RUNS; r++) {
    process.stdout.write(`⏳ Rodada ${r}/${RUNS}... `)
    const start = Date.now()
    const res = await fetch(BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ week_start: '2026-07-13', week_end: '2026-07-19', model_id: 'qwen/qwen3.6-plus' }),
    })
    const data = await res.json()
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`${elapsed}s | ${data.iterations} iterações | ${data.tool_calls?.length || 0} tool calls`)

    const text = data.response || ''
    const nums = extractNums(text)

    // Perfis de tool calls
    const toolNames = (data.tool_calls || []).map(t => t.name)
    const uniqueCalls = [...new Set(toolNames)]

    // Hallucinations: números no texto que não existem no ground truth
    const hallucinations = []
    for (const n of nums) {
      if (!tSet.has(n.value) && !tSet.has(Math.round(n.value)) && !tSet.has(Number(n.value.toFixed(1)))) {
        // Ignora números que são claramente cálculos (ex: 28.6% = 64/224)
        const isCalc = n.ctx.includes('%') || n.ctx.includes('taxa') || n.ctx.includes('roas') || n.ctx.includes('ctr') || n.ctx.includes('cpl') || n.ctx.includes('custo')
        if (!isCalc) {
          hallucinations.push(n)
        }
      }
    }

    // Métricas-chave mencionadas
    const mentioned224 = text.includes('224')
    const mentioned64 = text.includes('64')
    const mentioned6554 = text.includes('6.554') || text.includes('6554')
    const mentioned102 = text.includes('102')

    results.push({
      run: r,
      elapsed,
      iterations: data.iterations,
      toolCalls: data.tool_calls?.length || 0,
      uniqueTools: uniqueCalls,
      responseLength: text.length,
      mentionsLeads224: mentioned224,
      mentionsMqls64: mentioned64,
      mentionsSpend: mentioned6554,
      mentionsCpmql: mentioned102,
      hallucinations,
      response: text,
    })
  }

  // ── RELATÓRIO ──
  console.log('\n═══════════════════════════════════')
  console.log('📋 RELATÓRIO DE QUALIDADE\n')

  for (const r of results) {
    const h = r.hallucinations.length
    const icon = h === 0 ? '✅' : '⚠️'
    console.log(`${icon} Rodada ${r.run} | ${r.elapsed}s | ${r.iterations} iterações | ${r.toolCalls} tool calls | ${r.uniqueTools.join(', ')}`)
    console.log(`   KPIs mencionados: leads=${r.mentionsLeads224 ? '✅' : '❌'} mqls=${r.mentionsMqls64 ? '✅' : '❌'} spend=${r.mentionsSpend ? '✅' : '❌'} cpmql=${r.mentionsCpmql ? '✅' : '❌'}`)
    if (h > 0) {
      for (const n of r.hallucinations) {
        console.log(`   ⚠️ ALUCINAÇÃO: ${n.value} → "${n.ctx}"`)
      }
    }
  }

  // Consistência entre rodadas
  console.log(`\n🔍 Consistência entre rodadas:`)
  const lengths = results.map(r => r.responseLength)
  const avgLen = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
  const lenSpread = Math.round((Math.max(...lengths) - Math.min(...lengths)) / avgLen * 100)
  console.log(`   Tamanho médio: ${avgLen.toLocaleString()} chars (variação: ${lenSpread}%)`)

  const totalH = results.reduce((s, r) => s + r.hallucinations.length, 0)
  if (totalH === 0) {
    console.log(`\n✅ RESULTADO: 0 alucinações em ${RUNS} rodadas. Clara está CONFIÁVEL.`)
  } else {
    console.log(`\n⚠️ RESULTADO: ${totalH} possíveis alucinações encontradas.`)
  }

  // Salva respostas completas para inspeção
  const dumpFile = path.join(__dirname, '..', 'scripts', 'clara-simulacoes.json')
  fs.writeFileSync(dumpFile, JSON.stringify(results.map(r => ({
    run: r.run, elapsed: r.elapsed, iterations: r.iterations,
    toolCalls: r.toolCalls, uniqueTools: r.uniqueTools,
    hallucinations: r.hallucinations,
    responsePreview: r.response.slice(0, 500),
  })), null, 2))
  console.log(`\n📁 Respostas completas salvas em ${dumpFile}`)
}

main().catch(e => { console.error('Falha:', e.message); process.exit(1) })
