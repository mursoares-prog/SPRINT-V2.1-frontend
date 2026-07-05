/**
 * Estatística de condições de emissão de pacotes (losango azul ◈).
 * Percorre LOGIC_BY_SCOPE e localiza cada pacote com `condition`, registrando
 * o caminho (escopo → seção → pergunta → sub-pergunta → resposta → local).
 *
 * Como seções são COMPARTILHADAS entre escopos, a saída deduplica por local físico
 * (secId + pergunta + resposta + local + pacote) e mostra em quantos/quais escopos
 * cada ocorrência aparece.
 *
 * Uso: cd abandono-app && npx tsx scripts/condStats.ts
 */
import { LOGIC_BY_SCOPE, CONDITION_LABELS } from '../src/data/logicSecs'
import type { LSec, LDec, LAns, LPkg, LSeqEntry } from '../src/data/logicSecs'

type Ctx = { scope: string; secId: string; phase: string; section: string }
type Hit = Ctx & { cond: string; pkgId: string; question: string; answer: string; where: string }
const hits: Hit[] = []

function pushPkgs(pkgs: LPkg[] | undefined, base: Omit<Hit, 'cond' | 'pkgId'>) {
  for (const pk of pkgs ?? []) if (pk.condition) hits.push({ cond: pk.condition, pkgId: pk.id, ...base })
}

function walkDec(dec: LDec, ctx: Ctx & { qpath: string }) {
  const question = ctx.qpath ? `${ctx.qpath} › ${dec.question}` : dec.question
  pushPkgs(dec.packages, { ...ctx, question, answer: '—', where: 'decisão.packages' })
  for (const ans of dec.answers) walkAns(ans, { ...ctx, question })
  for (const ad of dec.afterDec ?? []) walkDec(ad, { ...ctx, qpath: `${question} (afterDec)` })
  walkSeq(dec.after, { ...ctx, question, answer: '—', where: 'decisão.after' })
}

function walkAns(ans: LAns, ctx: Ctx & { question: string }) {
  const base = { ...ctx, answer: ans.label }
  pushPkgs(ans.packages, { ...base, where: 'resposta.packages' })
  walkSeq(ans.seq, { ...base, where: 'resposta.seq' })
  walkSeq(ans.after, { ...base, where: 'resposta.after' })
  for (const sd of ans.sub ?? []) walkDec(sd, { ...ctx, qpath: `${ctx.question} → [${ans.label}]` })
  for (const asd of ans.afterSub ?? []) walkDec(asd, { ...ctx, qpath: `${ctx.question} → [${ans.label}] (afterSub)` })
}

function walkSeq(seq: LSeqEntry[] | undefined, base: Omit<Hit, 'cond' | 'pkgId'>) {
  for (const se of seq ?? []) {
    pushPkgs(se.packages, { ...base, where: `${base.where}(${se.label})` })
    for (const sd of se.sub ?? []) walkDec(sd, { scope: base.scope, secId: base.secId, phase: base.phase, section: base.section, qpath: `${base.question} :: ${se.label}` })
  }
}

for (const [scope, secs] of Object.entries(LOGIC_BY_SCOPE)) {
  for (const sec of secs as LSec[]) {
    const ctx: Ctx = { scope, secId: sec.id, phase: sec.phase, section: sec.label }
    pushPkgs(sec.always, { ...ctx, question: '—', answer: '—', where: 'seção.always' })
    for (const dec of sec.decisions) walkDec(dec, { ...ctx, qpath: '' })
  }
}

// ── Totais brutos (todos os fluxogramas expandidos) ─────────────────────────
const perCond = new Map<string, number>()
for (const h of hits) perCond.set(h.cond, (perCond.get(h.cond) ?? 0) + 1)
console.log(`\n=== TOTAL BRUTO (expandindo cada escopo) : ${hits.length} ocorrências ===`)
for (const [c, n] of [...perCond].sort((a, b) => b[1] - a[1]))
  console.log(`  ${n.toString().padStart(4)}  ${c}  ${(CONDITION_LABELS as Record<string, string>)[c] ?? ''}`)

// ── Locais DISTINTOS (deduplicados por seção compartilhada) ─────────────────
type Loc = { cond: string; phase: string; section: string; question: string; answer: string; where: string; pkgs: Set<string>; scopes: Set<string> }
const locs = new Map<string, Loc>()
for (const h of hits) {
  const key = `${h.secId}||${h.question}||${h.answer}||${h.where}||${h.cond}||${h.pkgId}`
  let l = locs.get(key)
  if (!l) { l = { cond: h.cond, phase: h.phase, section: h.section, question: h.question, answer: h.answer, where: h.where, pkgs: new Set(), scopes: new Set() }; locs.set(key, l) }
  l.pkgs.add(h.pkgId); l.scopes.add(h.scope)
}
const distinct = [...locs.values()]
const perCondDistinct = new Map<string, number>()
for (const l of distinct) perCondDistinct.set(l.cond, (perCondDistinct.get(l.cond) ?? 0) + 1)
console.log(`\n=== LOCAIS DISTINTOS (seções compartilhadas contam 1x) : ${distinct.length} ===`)
for (const [c, n] of [...perCondDistinct].sort((a, b) => b[1] - a[1]))
  console.log(`  ${n.toString().padStart(3)}  ${c}  ${(CONDITION_LABELS as Record<string, string>)[c] ?? ''}`)

console.log('\n── DETALHE DOS LOCAIS DISTINTOS ──')
const order = ['rig_dp', 'rig_anc', 'op_generalista', 'op_lwo']
for (const cond of order) {
  const list = distinct.filter(l => l.cond === cond)
  if (!list.length) continue
  console.log(`\n◈ ${cond} — ${(CONDITION_LABELS as Record<string, string>)[cond] ?? cond}  (${list.length} locais, aparece em ${new Set(list.flatMap(l => [...l.scopes])).size} escopos)`)
  for (const l of list) {
    console.log(`   • [${l.phase}] ${l.section}`)
    console.log(`       pergunta: ${l.question}`)
    console.log(`       resposta: ${l.answer}  ·  local: ${l.where}  ·  pacotes: ${[...l.pkgs].join(', ')}`)
    console.log(`       escopos (${l.scopes.size}): ${[...l.scopes].join(', ')}`)
  }
}
