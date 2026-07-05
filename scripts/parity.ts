/**
 * Harness de paridade — Etapa 4 do plano de independência da engine.
 *
 * Para cada fixture de backend/tests/fixtures/sequence_engine.json (62 casos):
 *   1. sanity: sequenceEngine (frontend) × fixture.schedule (engine Python)
 *   2. paridade: generateScheduleFromLogic(inputs, LOGIC_BY_SCOPE[scopeId]) × sequenceEngine
 *
 * Uso:  cd abandono-app && npx tsx scripts/parity.ts [--verbose] [--scope FSU_TT_FT] [--strict]
 *
 * Exit code: 1 se houver falha de SANITY (regressão entre engines espelho) — gate de CI.
 * Falhas de PARIDADE (fluxo × engine) são o backlog da migração (Etapa 4) e só derrubam
 * o exit code com --strict.
 */
import fs from 'node:fs'
import path from 'node:path'
import { generateSchedule as generateScheduleBundle } from '../src/engines/sequenceEngine'
import { generateScheduleFromLogic } from '../src/engines/logicEngine'
import { LOGIC_BY_SCOPE } from '../src/data/logicSecs'
import type { WizardInputs, ScheduleItem } from '../src/types'

type Fixture = { id: string; inputs: WizardInputs; schedule: ScheduleItem[] }

const args = process.argv.slice(2)
const VERBOSE = args.includes('--verbose')
const SCOPE_FILTER = args.includes('--scope') ? args[args.indexOf('--scope') + 1] : null

const fixturePath = path.resolve(process.cwd(), '../backend/tests/fixtures/sequence_engine.json')
const fixtures: Fixture[] = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

// Assinatura de um item para comparação (ignora uid/startDay/endDay — timeline deriva da ordem)
const sig = (it: ScheduleItem) =>
  `${it.packageId}|${it.phase}|${it.duration}|${it.isContingency ? 'C' : '-'}`

// Diff ordem-preservante (LCS por packageId) — mesmo algoritmo do ScopeParityChecker
function diff(a: ScheduleItem[], b: ScheduleItem[]): string[] {
  const n = a.length, m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].packageId === b[j].packageId ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: string[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i].packageId === b[j].packageId) {
      if (sig(a[i]) !== sig(b[j])) out.push(`  ~ ${sig(a[i])}  →  ${sig(b[j])}`)
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`  - ${sig(a[i])}   (só engine)`); i++
    } else {
      out.push(`  + ${sig(b[j])}   (só fluxo)`); j++
    }
  }
  while (i < n) out.push(`  - ${sig(a[i++])}   (só engine)`)
  while (j < m) out.push(`  + ${sig(b[j++])}   (só fluxo)`)
  return out
}

type ScopeStats = { total: number; sanityFail: number; parityFail: number; failures: string[] }
const byScope = new Map<string, ScopeStats>()
const stat = (s: string) => {
  if (!byScope.has(s)) byScope.set(s, { total: 0, sanityFail: 0, parityFail: 0, failures: [] })
  return byScope.get(s)!
}

for (const fx of fixtures) {
  const scopeId = fx.inputs.scopeId
  if (SCOPE_FILTER && scopeId !== SCOPE_FILTER) continue
  const st = stat(scopeId)
  st.total++

  const engineOut = generateScheduleBundle(fx.inputs)

  // 1. Sanity: espelho frontend × fixture Python
  const sanityDiff = diff(fx.schedule, engineOut)
  if (sanityDiff.length) {
    st.sanityFail++
    st.failures.push(`SANITY ${fx.id}: ${sanityDiff.length} divergências (fixture × sequenceEngine TS)`)
    if (VERBOSE) st.failures.push(...sanityDiff.map(l => `    ${l}`))
  }

  // 2. Paridade: fluxo de lógica × engine
  const logicSecs = LOGIC_BY_SCOPE[scopeId]
  if (!logicSecs) {
    st.parityFail++
    st.failures.push(`PARITY ${fx.id}: sem fluxo em LOGIC_BY_SCOPE`)
    continue
  }
  let logicOut: ScheduleItem[]
  try {
    logicOut = generateScheduleFromLogic(fx.inputs, logicSecs, false)
  } catch (e) {
    st.parityFail++
    st.failures.push(`PARITY ${fx.id}: EXCEÇÃO ${e instanceof Error ? e.message : e}`)
    continue
  }
  const parityDiff = diff(engineOut, logicOut)
  if (parityDiff.length) {
    st.parityFail++
    st.failures.push(`PARITY ${fx.id}: ${parityDiff.length} divergências (engine × fluxo)`)
    st.failures.push(...parityDiff.map(l => `  ${l}`))
  }
}

// ── Relatório ────────────────────────────────────────────────────────────────
let totalCases = 0, totalSanityFail = 0, totalParityFail = 0
const scopes = [...byScope.keys()].sort()
for (const s of scopes) {
  const st = byScope.get(s)!
  totalCases += st.total; totalSanityFail += st.sanityFail; totalParityFail += st.parityFail
  const ok = st.sanityFail === 0 && st.parityFail === 0
  console.log(`${ok ? '✅' : '❌'} ${s.padEnd(14)} casos=${st.total}  sanity-fail=${st.sanityFail}  parity-fail=${st.parityFail}`)
  if (!ok && (VERBOSE || st.parityFail > 0)) {
    for (const f of st.failures) console.log(`   ${f}`)
  }
}
console.log('─'.repeat(60))
console.log(`TOTAL: ${totalCases} casos · sanity-fail=${totalSanityFail} · parity-fail=${totalParityFail}`)
const STRICT = args.includes('--strict')
process.exit(totalSanityFail > 0 || (STRICT && totalParityFail > 0) ? 1 : 0)
