import { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect, useReducer } from 'react'
import { getPackage } from '../data/packages'

// Original/canonical package name (falls back to the flowchart's own label)
const pkgName = (p: LPkg): string => getPackage(p.id)?.name ?? p.name

// Deep equality helpers for merging identical Sim/Contingência answers
function _pkgEq(a: LPkg[] | undefined, b: LPkg[] | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.id === b[i].id)
}
function _ansEq(a: LAns, b: LAns): boolean {
  if (!_pkgEq(a.packages, b.packages)) return false
  if ((a.sub?.length ?? 0) !== (b.sub?.length ?? 0)) return false
  return (a.sub ?? []).every((d, i) => {
    const bd = (b.sub ?? [])[i]
    return d.answers.length === bd.answers.length && d.answers.every((ai, j) => _ansEq(ai, bd.answers[j]))
  })
}
type DisplayAns = { ans: LAns; label2?: string }
function toDisplayList(answers: LAns[]): DisplayAns[] {
  const out: DisplayAns[] = []
  let i = 0
  while (i < answers.length) {
    const a = answers[i], b = answers[i + 1]
    if (b && a.label === 'Sim' && b.label === 'Contingência' && _ansEq(a, b)) {
      out.push({ ans: a, label2: 'Contingência' })
      i += 2
    } else {
      out.push({ ans: a })
      i++
    }
  }
  return out
}

// Types compatible with AdminView.tsx (structural typing)
type LPkg = { id: string; name: string }
type LSeqEntry = { label: string; note?: string; packages?: LPkg[] }
interface LAns { label: string; active?: boolean; note?: string; packages?: LPkg[]; sub?: LDec[]; seq?: LSeqEntry[]; goto?: string }
interface LDec { question: string; answers: LAns[]; after?: LSeqEntry[] }
interface LSec { id: string; label: string; phase: string; color: 'gray'|'blue'|'amber'; always?: LPkg[]; decisions: LDec[] }
// Complete-view decision tree (mirrors logicSecs.ts QNode structurally)
type QLeaf = { kind: 'leaf'; scopeId: string; label: string; secs: LSec[] }
type QDecision = { kind: 'decision'; question: string; branches: { label: string; child: QNode }[] }
type QChain = { kind: 'chain'; secs: LSec[]; child: QNode }
type QNode = QDecision | QLeaf | QChain

// Edit actions fired when admin clicks on interactive elements
export type EditAction =
  | { type: 'remove_pkg';       secIdx: number; decIdx: number; ansIdx: number; pkgIdx: number }
  | { type: 'remove_always';    secIdx: number; pkgIdx: number }
  | { type: 'add_pkg';          secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'add_always';       secIdx: number }
  | { type: 'edit_question';    secIdx: number; decIdx: number; current: string }
  | { type: 'edit_answer';      secIdx: number; decIdx: number; ansIdx: number; current: string }
  | { type: 'toggle_default';   secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'remove_answer';    secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'add_answer';       secIdx: number; decIdx: number }
  | { type: 'remove_decision';  secIdx: number; decIdx: number }
  | { type: 'add_decision';     secIdx: number; afterDecIdx: number }
  | { type: 'remove_section';   secIdx: number }
  | { type: 'edit_section_phase'; secIdx: number; current: string }
  | { type: 'edit_section_label'; secIdx: number; current: string }
  | { type: 'add_section';      afterSecIdx: number }
  | { type: 'move_section';     secIdx: number; dir: 'up' | 'down' }
  | { type: 'set_goto';         secIdx: number; decIdx: number; ansIdx: number; current: string | undefined }
  // Sequential answer actions (within an answer card)
  | { type: 'add_seq';          secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'remove_seq';       secIdx: number; decIdx: number; ansIdx: number; seqIdx: number }
  | { type: 'edit_seq_label';   secIdx: number; decIdx: number; ansIdx: number; seqIdx: number; current: string }
  | { type: 'add_seq_pkg';      secIdx: number; decIdx: number; ansIdx: number; seqIdx: number }
  | { type: 'remove_seq_pkg';   secIdx: number; decIdx: number; ansIdx: number; seqIdx: number; pkgIdx: number }
  // After-convergence sequential entries (after all answers of a decision merge)
  | { type: 'add_dec_after';         secIdx: number; decIdx: number }
  | { type: 'remove_dec_after';      secIdx: number; decIdx: number; afterIdx: number }
  | { type: 'edit_dec_after_label';  secIdx: number; decIdx: number; afterIdx: number; current: string }
  | { type: 'add_dec_after_pkg';     secIdx: number; decIdx: number; afterIdx: number }
  | { type: 'remove_dec_after_pkg';  secIdx: number; decIdx: number; afterIdx: number; pkgIdx: number }

export interface LogicGraphProps { secs?: LSec[]; tree?: QNode; editCb?: (a: EditAction) => void }

// Color palettes (SVG hex values)
type PC = 'gray'|'blue'|'amber'
type PEntry = {
  hdr: string; hdrT: string; dec: string; decT: string
  ans: string; ansB: string; ansT: string; act: string; actT: string
  alw: string; bg: string; bgB: string; code: string
  arr: string; bb: string; bT: string
  lbl: string; lblT: string; empty: string; noteT: string
}

const PAL: Record<PC, PEntry> = {
  gray:  { hdr:'#334155', hdrT:'#f8fafc', dec:'#475569', decT:'#f1f5f9', ans:'#f1f5f9', ansB:'#94a3b8', ansT:'#1e293b', act:'#1e3a8a', actT:'#f0f9ff', alw:'#e2e8f0', bg:'#f8fafc', bgB:'#cbd5e1', code:'#2563eb', arr:'#64748b', bb:'#cbd5e1', bT:'#1e293b', lbl:'#e2e8f0', lblT:'#1e293b', empty:'#94a3b8', noteT:'#64748b' },
  blue:  { hdr:'#312e81', hdrT:'#eef2ff',  dec:'#4338ca', decT:'#eef2ff',  ans:'#f1f5f9', ansB:'#94a3b8', ansT:'#1e293b', act:'#312e81', actT:'#eef2ff',  alw:'#e0e7ff', bg:'#eef2ff', bgB:'#a5b4fc', code:'#3730a3', arr:'#818cf8', bb:'#a5b4fc', bT:'#1e1b4b', lbl:'#e2e8f0', lblT:'#1e293b', empty:'#94a3b8', noteT:'#64748b' },
  amber: { hdr:'#92400e', hdrT:'#fff',    dec:'#b45309', decT:'#fff',    ans:'#fefce8', ansB:'#fcd34d', ansT:'#451a03', act:'#92400e', actT:'#fef3c7', alw:'#fde68a', bg:'#fffbeb', bgB:'#fcd34d', code:'#b45309', arr:'#d97706', bb:'#fcd34d', bT:'#451a03', lbl:'#fde68a', lblT:'#451a03', empty:'#d97706', noteT:'#b45309' },
}

const DARK_PAL: Record<PC, PEntry> = {
  gray:  { hdr:'#1e293b', hdrT:'#e2e8f0', dec:'#334155', decT:'#e2e8f0', ans:'#1e293b', ansB:'#334155', ansT:'#cbd5e1', act:'#2563eb', actT:'#eff6ff', alw:'#0f172a', bg:'#0f172a', bgB:'#334155', code:'#60a5fa', arr:'#475569', bb:'#334155', bT:'#94a3b8', lbl:'#334155', lblT:'#94a3b8', empty:'#475569', noteT:'#64748b' },
  blue:  { hdr:'#1e1b4b', hdrT:'#e0e7ff',  dec:'#312e81', decT:'#e0e7ff',  ans:'#1e293b', ansB:'#334155', ansT:'#cbd5e1', act:'#4338ca', actT:'#eef2ff',  alw:'#0f0e2b', bg:'#0d0c24', bgB:'#312e81', code:'#818cf8', arr:'#4f46e5', bb:'#1e1b4b', bT:'#a5b4fc', lbl:'#334155', lblT:'#94a3b8', empty:'#475569', noteT:'#64748b' },
  amber: { hdr:'#78350f', hdrT:'#fef3c7', dec:'#92400e', decT:'#fef3c7', ans:'#1c1007', ansB:'#92400e', ansT:'#fde68a', act:'#b45309', actT:'#fef3c7', alw:'#1c1007', bg:'#0c0802', bgB:'#78350f', code:'#fbbf24', arr:'#d97706', bb:'#292010', bT:'#fcd34d', lbl:'#422006', lblT:'#fde68a', empty:'#b45309', noteT:'#f59e0b' },
}

// Module-level state for buildSvg (set before each call, used by renderAnswer)
let _k = 0
let _dark = false
let _editCb: ((a: EditAction) => void) | null = null
let _search = ''
// Position tracking for goto arrows (keyed by question text / "si_di_ai")
const _decPos = new Map<string, { cx: number; topY: number }>()
const _ansGotoPos = new Map<string, { rx: number; my: number }>()
const K = () => String(_k++)
const HIT_STROKE = '#d97706'
const hit = (s: string): boolean => !!_search && !!s && s.toLowerCase().includes(_search)
// Prevents the pan/zoom container's onMouseDown from treating a button-click as a drag start
function stopMD(e: React.MouseEvent) { e.stopPropagation() }
function pal(pc: PC): PEntry { return (_dark ? DARK_PAL : PAL)[pc] }

// Layout constants
const AW = 220      // answer card min width
const AG = 12       // gap between answer cards
const PKG = 16      // px per package row
const NOTE_R = 13   // note row height
const LBLH = 22     // label bar height
const BPAD = 8      // body vertical padding
const DH = 46       // decision diamond bounding-box height
const DDW = 230     // standard diamond width (all diamonds same size)
const AV = 56       // gap: decision bottom → answer top
const SG = 38       // gap: answer body → sub-decision
const DSQ = 70      // sequential decisions gap within section
const SHH = 36      // section header height
const ALWLH = 18    // always block label row height
const ALWPH = 15    // always block per-pkg row
const ALWBP = 8     // always block body padding
const ALWG = 18     // gap below always block
const SPAD = 18     // section horizontal padding
const SVPAD = 22    // section vertical padding
const SGAP = 120    // gap between sections (arrow space)
const CR = 12       // corner radius for 90° bends
const MRG = 32      // SVG outer margin
const COLGAP = 90   // gap between scope flowchart columns (complete view)
const LEVELGAP = 88 // vertical gap between decision-tree diamond levels
const TLBLH = 18    // tree branch-label pill height
const F_S = 9.5     // small font (packages)
const F_M = 10.5    // medium font (answer labels, notes)
const F_L = 11      // large font (section header)
const GOTO_H = 13   // goto indicator row height
const SEQ_GAP = 10  // gap: answer body bottom → seq entry top (arrow space)

// Size helpers
function aW(a: LAns): number {
  if (!a.sub?.length) return AW
  return Math.max(AW, ...a.sub.map(d => dW(d)))
}
function dW(d: LDec): number {
  return d.answers.reduce((s, a, i) => s + aW(a) + (i ? AG : 0), 0)
}
function aBodyH(a: LAns): number {
  let h = BPAD
  if (a.note) h += NOTE_R + 2
  const n = a.packages?.length ?? 0
  h += n ? n * PKG + 2 : NOTE_R
  if (a.goto) h += GOTO_H + 2   // goto indicator row
  h += BPAD
  if (_editCb) h += 28  // two rows: (+ pacote / ⇢ link) + (+ sequencial)
  return h
}
function seqEntryH(s: LSeqEntry): number {
  let h = LBLH + BPAD
  const n = s.packages?.length ?? 0
  h += n ? n * PKG + 2 : NOTE_R
  h += BPAD
  if (_editCb) h += 14  // + pacote button for seq entry
  return h
}
function seqH(a: LAns): number {
  return (a.seq ?? []).reduce((h, s) => h + SEQ_GAP + seqEntryH(s), 0)
}
function aSubH(a: LAns): number {
  return (a.sub ?? []).reduce((s, d) => s + SG + dTotalH(d), 0)
}
function aH(a: LAns): number { return LBLH + aBodyH(a) + seqH(a) + aSubH(a) }
function dAfterH(d: LDec): number {
  const entries = (d.after ?? []).reduce((h, s) => h + SEQ_GAP + seqEntryH(s), 0)
  return entries + (_editCb ? SEQ_GAP + 16 : 0)  // space for "+ seq após convergência" button in edit mode
}
function dTotalH(d: LDec): number { return DH + AV + Math.max(...d.answers.map(aH)) + dAfterH(d) }
function sAlwH(s: LSec): number {
  if (!s.always?.length) return 0
  return ALWLH + ALWBP + s.always.length * ALWPH + ALWG
}
function sTotalH(s: LSec): number {
  const editPad = _editCb ? 30 : 0  // space for "+ decisão" at section bottom
  return SHH + SVPAD + sAlwH(s) + s.decisions.reduce((sum, d, i) => sum + dTotalH(d) + (i ? DSQ : 0), 0) + SVPAD + editPad
}
function sTotalW(s: LSec): number {
  // When editing, add 70px on the right so the "× decisão" pill (60px + margin) fits
  return Math.max(300, ...s.decisions.map(dW)) + SPAD * 2 + (_editCb ? 70 : 0)
}

// Helpers
function tr(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

// Fan-out connector: trunk → curved 90° branches to each answer
function fanOut(
  decBotX: number, decBotY: number,
  answers: LAns[], firstAnsX: number, ansY: number,
  stroke: string, markerUrl: string, els: React.ReactNode[]
): void {
  // junction Y: where trunk ends and horizontal routing begins
  const jY = decBotY + AV * 0.40
  const AP = 3  // gap between path end and arrowhead tip

  if (answers.length === 1) {
    const cx = firstAnsX + aW(answers[0]) / 2
    els.push(<line key={K()} x1={cx} y1={decBotY} x2={cx} y2={ansY - AP}
      stroke={stroke} strokeWidth={1.5} markerEnd={markerUrl} />)
    return
  }

  // Trunk: diamond bottom → junction Y (no arrowhead)
  els.push(<line key={K()} x1={decBotX} y1={decBotY} x2={decBotX} y2={jY}
    stroke={stroke} strokeWidth={1.5} />)

  // Compute answer center X positions
  let x = firstAnsX
  const cxs: number[] = answers.map(a => { const c = x + aW(a) / 2; x += aW(a) + AG; return c })

  // One path per branch with rounded 90° corner where horizontal meets vertical
  for (const cx of cxs) {
    const diff = cx - decBotX
    const r = Math.min(CR, Math.max(2, Math.abs(diff) - 2))
    let d: string
    if (Math.abs(diff) < 2) {
      // Center: straight down continuation of trunk
      d = `M${cx},${jY} V${ansY - AP}`
    } else if (diff < 0) {
      // Branch goes left then curves down
      d = `M${decBotX},${jY} H${cx + r} Q${cx},${jY} ${cx},${jY + r} V${ansY - AP}`
    } else {
      // Branch goes right then curves down
      d = `M${decBotX},${jY} H${cx - r} Q${cx},${jY} ${cx},${jY + r} V${ansY - AP}`
    }
    els.push(<path key={K()} d={d} stroke={stroke} strokeWidth={1.5} fill="none" markerEnd={markerUrl} />)
  }
}

// Fan-in connector: each answer bottom → vertical down → curved 90° → horizontal to mergeX.
// Mirrors fanOut geometry. jY is set below mergeY so V-segments always go downward.
function fanIn(
  answers: LAns[], firstAnsX: number, ansY: number,
  mergeY: number, mergeX: number,
  stroke: string, els: React.ReactNode[]
): void {
  if (answers.length <= 1) return

  let x = firstAnsX
  const cxs: number[] = answers.map(a => {
    const c = x + aW(a) / 2
    x += aW(a) + AG
    return c
  })

  // Junction Y below all card bottoms: ensures V{jY-r} always goes DOWN
  // (r ≤ CR=12, so jY-r ≥ mergeY+4 > mergeY ≥ botY for any answer)
  const jY = mergeY + CR + 4

  for (let i = 0; i < answers.length; i++) {
    const acx = cxs[i]
    const botY = ansY + aH(answers[i])
    const diff = acx - mergeX

    if (Math.abs(diff) < 2) {
      // Center column: trunk line covers mergeY onward; only draw stub if shorter
      if (botY + 1 < jY) {
        els.push(<line key={K()} x1={acx} y1={botY} x2={acx} y2={jY}
          stroke={stroke} strokeWidth={1.5} />)
      }
    } else {
      // Off-center: vertical down to (jY-r), rounded 90° turn horizontal to mergeX
      const r = Math.min(CR, Math.max(2, Math.abs(diff) - 2))
      const d = diff < 0
        ? `M${acx},${botY} V${jY - r} Q${acx},${jY} ${acx + r},${jY} H${mergeX}`
        : `M${acx},${botY} V${jY - r} Q${acx},${jY} ${acx - r},${jY} H${mergeX}`
      els.push(<path key={K()} d={d} stroke={stroke} strokeWidth={1.5} fill="none" />)
    }
  }
}

// Render one answer card (recursive for sub-decisions)
// secIdx / decIdx / ansIdx are -1 when edit is not supported at this level
function renderAnswer(
  a: LAns, x: number, y: number, w: number, cx: number,
  pc: PC, els: React.ReactNode[],
  secIdx = -1, decIdx = -1, ansIdx = -1,
  label2?: string,
): void {
  const p = pal(pc)
  const h = aH(a)
  const bodH = aBodyH(a)
  const act = !!a.active
  const canEdit = _editCb !== null && secIdx >= 0 && decIdx >= 0 && ansIdx >= 0

  // Search highlight flags
  const labelHit = hit(a.label)
  const pkgs = a.packages ?? []
  const pkgHitIdx = new Set(pkgs.map((pkg, i) => ({ pkg, i })).filter(({ pkg }) => hit(pkg.id) || hit(pkgName(pkg))).map(({ i }) => i))
  const cardHit = labelHit || pkgHitIdx.size > 0

  // card background — uniform for all answers
  els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
  // label bar
  const lbg = labelHit ? HIT_STROKE : p.lbl
  els.push(<rect key={K()} x={x} y={y} width={w} height={LBLH} rx={5} fill={lbg} />)
  els.push(<rect key={K()} x={x} y={y + LBLH - 5} width={w} height={5} fill={lbg} />)
  if (label2) {
    els.push(
      <text key={K()} x={x + 8} y={y + LBLH * 0.68} fontSize={F_M} fontFamily="ui-sans-serif,system-ui,sans-serif">
        <tspan fontWeight={700} fill={p.lblT}>{a.label} / </tspan>
        <tspan fontWeight={600} fill="#d97706" fontSize={F_M - 0.5}>{label2}</tspan>
      </text>
    )
  } else {
    els.push(
      <text key={K()} x={canEdit ? x + 20 : x + 8} y={y + LBLH * 0.68} fontSize={F_M} fontWeight={700}
        fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">
        {tr(a.label, canEdit ? 20 : 28)}
      </text>
    )
  }
  if (canEdit) {
    // ✦ toggle-default button (left of label)
    const capSi = secIdx, capDi = decIdx, capAi = ansIdx
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'toggle_default', secIdx: capSi, decIdx: capDi, ansIdx: capAi }) }}
         style={{ cursor: 'pointer' }} title="Marcar como padrão">
        <text x={x + 10} y={y + LBLH * 0.72} fontSize={11} textAnchor="middle"
          fill={act ? '#facc15' : p.lblT} opacity={act ? 1 : 0.35}>✦</text>
      </g>
    )
    // Pencil area — click label text to edit
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_answer', secIdx: capSi, decIdx: capDi, ansIdx: capAi, current: a.label }) }}
         style={{ cursor: 'text' }}>
        <rect x={x + 18} y={y + 1} width={w - 30} height={LBLH - 2} rx={2} fill="transparent" />
      </g>
    )
    // × remove answer button (right of label)
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_answer', secIdx: capSi, decIdx: capDi, ansIdx: capAi }) }}
         style={{ cursor: 'pointer' }}>
        <circle cx={x + w - 9} cy={y + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
        <text x={x + w - 9} y={y + LBLH / 2 + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill="white">×</text>
      </g>
    )
  }

  // body content
  let bY = y + LBLH + BPAD
  if (a.note) {
    els.push(
      <text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic"
        fill={p.noteT} fontFamily="ui-sans-serif,system-ui,sans-serif">
        {tr(a.note, 36)}
      </text>
    )
    bY += NOTE_R + 2
  }
  if (pkgs.length > 0) {
    pkgs.forEach((pkg, i) => {
      const py = bY + i * PKG + PKG * 0.8
      const full = pkgName(pkg)
      const kid = K()
      if (pkgHitIdx.has(i)) {
        els.push(<rect key={K()} x={x + 4} y={py - PKG * 0.85} width={w - 8} height={PKG} rx={3} fill={HIT_STROKE} opacity={0.22} />)
      }
      if (canEdit) {
        // Entire pkg row is clickable (remove on click)
        const si = secIdx, di = decIdx, ai = ansIdx, pi = i
        els.push(
          <g key={kid} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_pkg', secIdx: si, decIdx: di, ansIdx: ai, pkgIdx: pi }) }}
            style={{ cursor: 'pointer' }}>
            <rect x={x + 4} y={py - PKG * 0.85} width={w - 8} height={PKG} rx={3} fill="transparent" />
            <text x={x + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{`Clique para remover ${pkg.id}`}</title></text>
            <text x={x + 8 + pkg.id.length * 5.8 + 6} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
              {tr(full, Math.max(8, Math.floor((x + w - 10 - (x + 8 + pkg.id.length * 5.8 + 6)) / 5.2)))}<title>{full}</title>
            </text>
            <text x={x + w - 10} y={py} fontSize={10} fontWeight={700} textAnchor="middle" fill="#ef4444" opacity={0.7}>×</text>
          </g>
        )
      } else {
        els.push(<text key={kid} x={x + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{`${pkg.id} — ${full}`}</title></text>)
        const nx = x + 8 + pkg.id.length * 5.8 + 6
        const mc = Math.max(8, Math.floor((x + w - 10 - nx) / 5.2))
        els.push(
          <text key={K()} x={nx} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
            {tr(full, mc)}<title>{full}</title>
          </text>
        )
      }
    })
  } else if (!a.note) {
    els.push(<text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
  }
  // goto indicator row (read-only and edit mode)
  if (a.goto) {
    const gotoY = y + LBLH + bodH - BPAD - (canEdit ? 28 : 0) - GOTO_H
    els.push(
      <rect key={K()} x={x + 4} y={gotoY} width={w - 8} height={GOTO_H} rx={3} fill="#d97706" opacity={0.1} />
    )
    els.push(
      <text key={K()} x={x + 12} y={gotoY + GOTO_H * 0.75} fontSize={F_S} fontWeight={600}
        fill="#d97706" fontFamily="ui-sans-serif,system-ui,sans-serif">
        {`⇢ ${tr(a.goto, 28)}`}
      </text>
    )
    if (canEdit) {
      const capSi = secIdx, capDi = decIdx, capAi = ansIdx, capGoto = a.goto
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'set_goto', secIdx: capSi, decIdx: capDi, ansIdx: capAi, current: capGoto }) }}
           style={{ cursor: 'pointer' }} title="Remover link">
          <text x={x + w - 12} y={gotoY + GOTO_H * 0.75} fontSize={9} fontWeight={700} textAnchor="middle" fill="#ef4444" opacity={0.7}>×</text>
        </g>
      )
    }
  }
  // Card glow ring for search hit (rendered last, on top of content)
  if (cardHit) {
    els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill="none" stroke={HIT_STROKE} strokeWidth={2} opacity={0.9} />)
  }

  // Record answer position for goto arrow routing (when answer is top-level in a section)
  if (secIdx >= 0) {
    _ansGotoPos.set(`${secIdx}_${decIdx}_${ansIdx}`, { rx: x + w, my: y + h / 2 })
  }

  // Action buttons: row 1 (+ pacote | ⇢ link), row 2 (+ sequencial)
  if (canEdit) {
    const btn1Y = y + LBLH + bodH - 28 + 1   // first row baseline
    const btn2Y = y + LBLH + bodH - 14 + 1   // second row baseline
    const si = secIdx, di = decIdx, ai = ansIdx
    const halfW = (w - 16) / 2
    // + pacote (left, row 1)
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_pkg', secIdx: si, decIdx: di, ansIdx: ai }) }}
        style={{ cursor: 'pointer' }}>
        <rect x={x + 6} y={btn1Y - 7} width={halfW} height={13} rx={4} fill={p.code} opacity={0.12} />
        <rect x={x + 6} y={btn1Y - 7} width={halfW} height={13} rx={4} fill="none" stroke={p.code} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.4} />
        <text x={x + 6 + halfW / 2} y={btn1Y + 2.5} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.8}>+ pacote</text>
      </g>
    )
    // ⇢ link (right, row 1)
    const capSi = si, capDi = di, capAi = ai, capGoto = a.goto
    const hasGoto = !!a.goto
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'set_goto', secIdx: capSi, decIdx: capDi, ansIdx: capAi, current: capGoto }) }}
         style={{ cursor: 'pointer' }} title={hasGoto ? 'Remover link' : 'Ligar a outra pergunta'}>
        <rect x={x + 10 + halfW} y={btn1Y - 7} width={halfW} height={13} rx={4} fill={hasGoto ? '#d97706' : p.code} opacity={hasGoto ? 0.22 : 0.12} />
        <rect x={x + 10 + halfW} y={btn1Y - 7} width={halfW} height={13} rx={4} fill="none" stroke={hasGoto ? '#d97706' : p.code} strokeWidth={0.8} strokeDasharray="3,2" opacity={hasGoto ? 0.7 : 0.4} />
        <text x={x + 10 + halfW + halfW / 2} y={btn1Y + 2.5} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={hasGoto ? '#d97706' : p.code} opacity={0.9}>⇢ link</text>
      </g>
    )
    // + sequencial (full width, row 2)
    const capSi2 = si, capDi2 = di, capAi2 = ai
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_seq', secIdx: capSi2, decIdx: capDi2, ansIdx: capAi2 }) }}
         style={{ cursor: 'pointer' }} title="Adicionar resposta sequencial abaixo">
        <rect x={x + 6} y={btn2Y - 7} width={w - 12} height={13} rx={4} fill="#7c3aed" opacity={0.1} />
        <rect x={x + 6} y={btn2Y - 7} width={w - 12} height={13} rx={4} fill="none" stroke="#7c3aed" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.4} />
        <text x={cx} y={btn2Y + 2.5} fontSize={8.5} fontWeight={700} textAnchor="middle" fill="#7c3aed" opacity={0.85}>+ sequencial</text>
      </g>
    )
  }

  // Sequential entries (rendered after main body, before sub-decisions)
  if (a.seq?.length || (canEdit && seqH(a) > 0)) {
    const seqStart = y + LBLH + bodH
    let seqY = seqStart
    const seqList = a.seq ?? []
    for (let sei = 0; sei < seqList.length; sei++) {
      const se = seqList[sei]
      const seH = seqEntryH(se)
      const seCardY = seqY + SEQ_GAP
      const seX = x + 4, seW = w - 8

      // Arrow from body bottom (or previous seq) down to this card
      els.push(<line key={K()} x1={cx} y1={seqY} x2={cx} y2={seCardY - 4}
        stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)

      // Card background
      els.push(<rect key={K()} x={seX} y={seCardY} width={seW} height={seH} rx={4}
        fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
      // Label bar (using alw color to distinguish from main answer)
      els.push(<rect key={K()} x={seX} y={seCardY} width={seW} height={LBLH} rx={4} fill={p.alw} />)
      els.push(<rect key={K()} x={seX} y={seCardY + LBLH - 4} width={seW} height={4} fill={p.alw} />)

      if (canEdit) {
        const capSi = secIdx, capDi = decIdx, capAi = ansIdx, capSei = sei
        // × remove seq entry
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_seq', secIdx: capSi, decIdx: capDi, ansIdx: capAi, seqIdx: capSei }) }}
             style={{ cursor: 'pointer' }}>
            <circle cx={seX + seW - 9} cy={seCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
            <text x={seX + seW - 9} y={seCardY + LBLH / 2 + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill="white">×</text>
          </g>
        )
        // Click label to edit
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_seq_label', secIdx: capSi, decIdx: capDi, ansIdx: capAi, seqIdx: capSei, current: se.label }) }}
             style={{ cursor: 'text' }}>
            <rect x={seX + 4} y={seCardY + 1} width={seW - 24} height={LBLH - 2} rx={2} fill="transparent" />
          </g>
        )
      }

      // Label text
      els.push(
        <text key={K()} x={seX + 8} y={seCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600}
          fill={p.hdr} fontFamily="ui-sans-serif,system-ui,sans-serif">
          {tr(se.label, canEdit ? 20 : 26)}
        </text>
      )

      // Packages
      const sePkgs = se.packages ?? []
      let seBY = seCardY + LBLH + BPAD
      if (sePkgs.length > 0) {
        sePkgs.forEach((pkg, pi) => {
          const py = seBY + pi * PKG + PKG * 0.8
          const full = pkgName(pkg)
          if (hit(pkg.id) || hit(full)) {
            els.push(<rect key={K()} x={seX + 4} y={py - PKG * 0.85} width={seW - 8} height={PKG} rx={3} fill={HIT_STROKE} opacity={0.22} />)
          }
          if (canEdit) {
            const capSi = secIdx, capDi = decIdx, capAi = ansIdx, capSei2 = sei, capPi = pi
            els.push(
              <g key={K()} onMouseDown={stopMD}
                 onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_seq_pkg', secIdx: capSi, decIdx: capDi, ansIdx: capAi, seqIdx: capSei2, pkgIdx: capPi }) }}
                 style={{ cursor: 'pointer' }}>
                <rect x={seX + 4} y={py - PKG * 0.85} width={seW - 8} height={PKG} rx={3} fill="transparent" />
                <text x={seX + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}</text>
                <text x={seX + 8 + pkg.id.length * 5.8 + 6} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
                  {tr(full, Math.max(8, Math.floor((seX + seW - 14 - (seX + 8 + pkg.id.length * 5.8 + 6)) / 5.2)))}
                </text>
                <text x={seX + seW - 10} y={py} fontSize={10} fontWeight={700} textAnchor="middle" fill="#ef4444" opacity={0.7}>×</text>
              </g>
            )
          } else {
            els.push(<text key={K()} x={seX + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{full}</title></text>)
            const nx = seX + 8 + pkg.id.length * 5.8 + 6
            els.push(<text key={K()} x={nx} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>{tr(full, Math.max(8, Math.floor((seX + seW - 10 - nx) / 5.2)))}<title>{full}</title></text>)
          }
        })
      } else {
        els.push(<text key={K()} x={seX + 8} y={seBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
      }

      // + pacote button for this seq entry (edit mode)
      if (canEdit) {
        const seBtnY = seCardY + seH - 14 + 1
        const capSi = secIdx, capDi = decIdx, capAi = ansIdx, capSei3 = sei
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_seq_pkg', secIdx: capSi, decIdx: capDi, ansIdx: capAi, seqIdx: capSei3 }) }}
             style={{ cursor: 'pointer' }}>
            <rect x={seX + 6} y={seBtnY - 7} width={seW - 12} height={13} rx={4} fill={p.code} opacity={0.12} />
            <rect x={seX + 6} y={seBtnY - 7} width={seW - 12} height={13} rx={4} fill="none" stroke={p.code} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.4} />
            <text x={seX + seW / 2} y={seBtnY + 2.5} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.8}>+ pacote</text>
          </g>
        )
      }

      seqY = seCardY + seH
    }
  }

  // sub-decisions nested below body content
  if (a.sub?.length) {
    let sY = y + LBLH + bodH + seqH(a) + SG
    for (const sub of a.sub) {
      const sdW = Math.min(DDW, w - 16)
      const sdX = cx - sdW / 2
      els.push(<line key={K()} x1={cx} y1={sY - SG + 4} x2={cx} y2={sY - 5} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
      els.push(
        <polygon key={K()} points={`${cx},${sY} ${sdX + sdW},${sY + DH / 2} ${cx},${sY + DH} ${sdX},${sY + DH / 2}`}
          fill={p.dec} stroke={p.hdr} strokeWidth={1.5} />
      )
      els.push(
        <text key={K()} x={cx} y={sY + DH / 2 + 4} fontSize={9} fontWeight={600} fill={p.decT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
          {tr(sub.question, 30)}
        </text>
      )
      const subDisp = toDisplayList(sub.answers)
      const saY = sY + DH + AV
      const tW = subDisp.reduce((s, da, i) => s + aW(da.ans) + (i ? AG : 0), 0)
      let saX = cx - tW / 2
      fanOut(cx, sY + DH, subDisp.map(d => d.ans), saX, saY, p.arr, `url(#arr_${pc})`, els)
      saX = cx - tW / 2
      for (const sda of subDisp) {
        const saw = aW(sda.ans)
        renderAnswer(sda.ans, saX, saY, saw, saX + saw / 2, pc, els, -1, -1, -1, sda.label2)
        saX += saw + AG
      }
      sY += SG + dTotalH(sub)
    }
  }
}

// Draw a single decision diamond centered at (cx, topY)
function drawDiamond(cx: number, topY: number, w: number, text: string, pc: PC, els: React.ReactNode[]): void {
  const p = pal(pc)
  const x = cx - w / 2
  const pts = `${cx},${topY} ${x + w},${topY + DH / 2} ${cx},${topY + DH} ${x},${topY + DH / 2}`
  els.push(<polygon key={K()} points={pts} fill={p.dec} stroke={p.hdr} strokeWidth={1.5} />)
  els.push(
    <text key={K()} x={cx} y={topY + DH / 2 + 4} fontSize={F_M} fontWeight={600}
      fill={p.decT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
      {tr(text, 36)}
    </text>
  )
  if (hit(text)) {
    els.push(<polygon key={K()} points={pts} fill="none" stroke={HIT_STROKE} strokeWidth={2.5} opacity={0.9} />)
  }
  _decPos.set(text, { cx, topY })
}

// Draw a vertical flowchart (LSec[]) centered at colCX starting at topY.
// Returns the Y of the bottom edge of the last section.
function drawFlowColumn(secs: LSec[], colCX: number, topY: number, els: React.ReactNode[]): number {
  const CX = colCX
  let Y = topY

  for (let si = 0; si < secs.length; si++) {
    const sec = secs[si]
    const p = pal(sec.color)
    const sh = sTotalH(sec)
    const sw = sTotalW(sec)
    const sx = CX - sw / 2

    if (si > 0) {
      els.push(
        <line key={K()} x1={CX} y1={Y - SGAP + 6} x2={CX} y2={Y - 6}
          stroke={_dark ? '#475569' : '#94a3b8'} strokeWidth={2} markerEnd="url(#arr_inter)" />
      )
      // "+ inserir seção aqui" button in the gap between sections
      if (_editCb) {
        const capSiPrev = si - 1
        const btnCY = Y - SGAP / 2
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_section', afterSecIdx: capSiPrev }) }}
             style={{ cursor: 'pointer' }}>
            <rect x={CX - 66} y={btnCY - 8} width={132} height={16} rx={8} fill="#1e293b" opacity={0.9} />
            <rect x={CX - 66} y={btnCY - 8} width={132} height={16} rx={8} fill="none" stroke="#60a5fa" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
            <text x={CX} y={btnCY + 4} fontSize={8.5} fontWeight={700} textAnchor="middle" fill="#60a5fa" opacity={0.9}>＋ inserir seção aqui</text>
          </g>
        )
      }
    }

    // Section background + header
    const secHit = hit(sec.label)
    els.push(<rect key={K()} x={sx} y={Y} width={sw} height={sh} rx={10} fill={p.bg} stroke={secHit ? HIT_STROKE : p.bgB} strokeWidth={secHit ? 2.5 : 1.5} />)
    els.push(<rect key={K()} x={sx} y={Y} width={sw} height={SHH} rx={10} fill={secHit ? HIT_STROKE : p.hdr} />)
    els.push(<rect key={K()} x={sx} y={Y + SHH - 10} width={sw} height={10} fill={secHit ? HIT_STROKE : p.hdr} />)

    // Phase badge dimensions — computed before label so badgeX is available for truncation
    const bl = sec.phase.length * 6.5 + 12
    // Edit mode: reserve 112px on right for × seção(68) + gap(4) + ↓(16) + gap(2) + ↑(16) + gap(6)
    const badgeX = sx + sw - SPAD - bl - (_editCb ? 112 : 0)

    els.push(
      <text key={K()} x={sx + SPAD} y={Y + SHH * 0.63} fontSize={F_L} fontWeight={700}
        fill={p.hdrT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={1.2}>
        {tr(sec.label, _editCb ? 22 : 36)}
      </text>
    )

    // Phase badge
    if (_editCb) {
      const capSi = si, capPhase = sec.phase, capLbl = sec.label
      const movBtnCY = Y + SHH / 2
      const movUpCX = sx + sw - 116   // ↑ center X (right-to-left: SPAD+×seção+gap+↓+gap+half)
      const movDnCX = sx + sw - 98    // ↓ center X

      // Phase badge (clickable)
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_section_phase', secIdx: capSi, current: capPhase }) }}
           style={{ cursor: 'pointer' }} title="Editar fase">
          <rect x={badgeX} y={Y + 9} width={bl} height={17} rx={8} fill={p.bb} stroke="white" strokeWidth={1} strokeDasharray="3,2" opacity={0.9} />
          <text x={badgeX + bl / 2} y={Y + 21} fontSize={9} fontWeight={700}
            fill={p.bT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
            {sec.phase}
          </text>
          <text x={badgeX + bl + 3} y={Y + 21} fontSize={8} fill="white" opacity={0.6}>✎</text>
        </g>
      )
      // ↑ move up
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => { if (si > 0) { e.stopPropagation(); _editCb!({ type: 'move_section', secIdx: capSi, dir: 'up' }) } }}
           style={{ cursor: si > 0 ? 'pointer' : 'default' }} title="Mover seção para cima">
          <circle cx={movUpCX} cy={movBtnCY} r={8} fill={p.hdr} stroke="white" strokeWidth={0.7} opacity={si > 0 ? 0.85 : 0.3} />
          <text x={movUpCX} y={movBtnCY + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="white" opacity={si > 0 ? 1 : 0.35}>↑</text>
        </g>
      )
      // ↓ move down
      const totalSecs = secs.length
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => { if (si < totalSecs - 1) { e.stopPropagation(); _editCb!({ type: 'move_section', secIdx: capSi, dir: 'down' }) } }}
           style={{ cursor: si < secs.length - 1 ? 'pointer' : 'default' }} title="Mover seção para baixo">
          <circle cx={movDnCX} cy={movBtnCY} r={8} fill={p.hdr} stroke="white" strokeWidth={0.7} opacity={si < secs.length - 1 ? 0.85 : 0.3} />
          <text x={movDnCX} y={movBtnCY + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="white" opacity={si < secs.length - 1 ? 1 : 0.35}>↓</text>
        </g>
      )
      // × Remover seção
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_section', secIdx: capSi }) }}
           style={{ cursor: 'pointer' }}>
          <rect x={sx + sw - SPAD - 68} y={Y + 9} width={68} height={17} rx={8} fill="#ef4444" opacity={0.85} />
          <text x={sx + sw - SPAD - 34} y={Y + 21} fontSize={9} fontWeight={700} textAnchor="middle" fill="white">× seção</text>
        </g>
      )
      // Transparent overlay on label text → edit section label
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_section_label', secIdx: capSi, current: capLbl }) }}
           style={{ cursor: 'text' }} title="Clique para editar nome">
          <rect x={sx + SPAD} y={Y + 4} width={Math.max(10, badgeX - sx - SPAD - 10)} height={SHH - 8} rx={3} fill="transparent" />
        </g>
      )
    } else {
      els.push(<rect key={K()} x={badgeX} y={Y + 9} width={bl} height={17} rx={8} fill={p.bb} />)
      els.push(
        <text key={K()} x={badgeX + bl / 2} y={Y + 21} fontSize={9} fontWeight={700}
          fill={p.bT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
          {sec.phase}
        </text>
      )
    }

    let iY = Y + SHH + SVPAD

    // Always block
    if (sec.always?.length || (_editCb && !sec.decisions.length)) {
      const alwBH = Math.max(ALWLH + ALWBP + ALWG, sAlwH(sec)) - ALWG
      const awX = sx + SPAD, awW = sw - SPAD * 2
      els.push(<rect key={K()} x={awX} y={iY} width={awW} height={alwBH} rx={6} fill={p.alw} stroke={p.bgB} strokeWidth={1} />)
      els.push(
        <text key={K()} x={awX + 10} y={iY + ALWLH * 0.75} fontSize={9} fontWeight={700}
          fill={p.hdr} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={1}>
          SEMPRE
        </text>
      );
      (sec.always ?? []).forEach((pkg, pi) => {
        const py = iY + ALWLH + ALWBP + pi * ALWPH + ALWPH * 0.82
        const full = pkgName(pkg)
        if (hit(pkg.id) || hit(full)) {
          els.push(<rect key={K()} x={awX + 4} y={py - ALWPH * 0.85} width={awW - 8} height={ALWPH} rx={2} fill={HIT_STROKE} opacity={0.22} />)
        }
        if (_editCb) {
          const capSi = si, capPi = pi
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_always', secIdx: capSi, pkgIdx: capPi }) }}
               style={{ cursor: 'pointer' }}>
              <rect x={awX + 4} y={py - ALWPH * 0.85} width={awW - 8} height={ALWPH} rx={2} fill="transparent" />
              <text x={awX + 10} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}</text>
              <text x={awX + 10 + pkg.id.length * 5.8 + 6} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
                {tr(full, Math.max(10, Math.floor((awX + awW - 10 - (awX + 10 + pkg.id.length * 5.8 + 6)) / 5.2)))}
              </text>
              <text x={awX + awW - 8} y={py} fontSize={10} fontWeight={700} textAnchor="middle" fill="#ef4444" opacity={0.7}>×</text>
            </g>
          )
        } else {
          els.push(<text key={K()} x={awX + 10} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{`${pkg.id} — ${full}`}</title></text>)
          const nx = awX + 10 + pkg.id.length * 5.8 + 6
          const mc = Math.max(10, Math.floor((awX + awW - 10 - nx) / 5.2))
          els.push(
            <text key={K()} x={nx} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
              {tr(full, mc)}<title>{full}</title>
            </text>
          )
        }
      })
      // "+ pacote" for always block
      if (_editCb) {
        const btnY = iY + alwBH - 9
        const capSi = si
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_always', secIdx: capSi }) }}
             style={{ cursor: 'pointer' }}>
            <rect x={awX + 6} y={btnY - 6} width={awW - 12} height={13} rx={4} fill={p.code} opacity={0.12} />
            <rect x={awX + 6} y={btnY - 6} width={awW - 12} height={13} rx={4} fill="none" stroke={p.code} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.4} />
            <text x={awX + awW / 2} y={btnY + 3} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.8}>+ pacote</text>
          </g>
        )
      }
      iY += (sec.always?.length ? sAlwH(sec) : ALWLH + ALWBP + ALWG + ALWG)
    }

    // Decisions
    let prevBotY = iY
    for (let di = 0; di < sec.decisions.length; di++) {
      const dec = sec.decisions[di]
      if (di > 0) {
        // "+ decisão" button in the DSQ gap between decisions
        if (_editCb) {
          const midY = prevBotY + DSQ * 0.48
          const capSi = si, capDi = di - 1
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_decision', secIdx: capSi, afterDecIdx: capDi }) }}
               style={{ cursor: 'pointer' }}>
              <rect x={CX - 46} y={midY - 8} width={92} height={15} rx={7} fill={p.code} opacity={0.12} />
              <rect x={CX - 46} y={midY - 8} width={92} height={15} rx={7} fill="none" stroke={p.code} strokeWidth={0.7} strokeDasharray="3,2" opacity={0.35} />
              <text x={CX} y={midY + 3.5} fontSize={8} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.75}>+ inserir decisão</text>
            </g>
          )
        }
        iY += DSQ
      }

      const dY = iY

      if (prevBotY < dY - 4) {
        els.push(
          <line key={K()} x1={CX} y1={prevBotY} x2={CX} y2={dY - 5}
            stroke={p.arr} strokeWidth={1.5} markerEnd={`url(#arr_${sec.color})`} />
        )
      }

      drawDiamond(CX, dY, DDW, dec.question, sec.color, els)

      // Edit overlays on the diamond
      if (_editCb) {
        const capSi = si, capDi = di, capQ = dec.question
        // Transparent click zone over diamond → edit question
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_question', secIdx: capSi, decIdx: capDi, current: capQ }) }}
             style={{ cursor: 'text' }}>
            <polygon points={`${CX},${dY} ${CX+DDW/2-14},${dY+DH/2} ${CX},${dY+DH} ${CX-DDW/2+14},${dY+DH/2}`}
              fill="transparent" />
          </g>
        )
        // × pill at the right vertex of the diamond — remove this decision block
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_decision', secIdx: capSi, decIdx: capDi }) }}
             style={{ cursor: 'pointer' }}>
            <rect x={CX + DDW/2 + 4} y={dY + DH/2 - 9} width={60} height={18} rx={9} fill="#ef4444" opacity={0.92} />
            <text x={CX + DDW/2 + 34} y={dY + DH/2 + 4.5} fontSize={9} fontWeight={700} textAnchor="middle" fill="white">× decisão</text>
          </g>
        )
        // "+ resposta" button in the AV gap (between diamond bottom and answer cards)
        const addAnsY = dY + DH + AV * 0.55
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_answer', secIdx: capSi, decIdx: capDi }) }}
             style={{ cursor: 'pointer' }}>
            <rect x={CX - 42} y={addAnsY - 9} width={84} height={16} rx={8} fill={p.code} opacity={0.12} />
            <rect x={CX - 42} y={addAnsY - 9} width={84} height={16} rx={8} fill="none" stroke={p.code} strokeWidth={0.7} strokeDasharray="3,2" opacity={0.4} />
            <text x={CX} y={addAnsY + 3.5} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.85}>+ resposta</text>
          </g>
        )
      }

      const dispAnswers = _editCb ? dec.answers.map(a => ({ ans: a } as DisplayAns)) : toDisplayList(dec.answers)
      const ansY = dY + DH + AV
      const totAW = dispAnswers.reduce((s, da, i) => s + aW(da.ans) + (i ? AG : 0), 0)
      const firstAnsX = CX - totAW / 2
      fanOut(CX, dY + DH, dispAnswers.map(d => d.ans), firstAnsX, ansY, p.arr, `url(#arr_${sec.color})`, els)

      let ax = firstAnsX
      for (let dai = 0; dai < dispAnswers.length; dai++) {
        const da = dispAnswers[dai]
        const aw = aW(da.ans)
        const aiOrig = _editCb ? dai : dec.answers.indexOf(da.ans)
        renderAnswer(da.ans, ax, ansY, aw, ax + aw / 2, sec.color, els, si, di, aiOrig, da.label2)
        ax += aw + AG
      }

      // Fan-in: converging lines from each answer bottom back to center
      const maxAH = Math.max(...dispAnswers.map(da => aH(da.ans)))
      const mergeY = ansY + maxAH
      fanIn(dispAnswers.map(d => d.ans), firstAnsX, ansY, mergeY, CX, p.arr, els)

      // After-convergence sequential entries (dec.after)
      const decAfterList = dec.after ?? []
      let afterY = mergeY

      for (let afi = 0; afi < decAfterList.length; afi++) {
        const ae = decAfterList[afi]
        const aeH = seqEntryH(ae)
        const aeCardY = afterY + SEQ_GAP
        const aeW = Math.min(DDW + 20, sTotalW(sec) - SPAD * 4)
        const aeX = CX - aeW / 2

        // Arrow from convergence/prev entry down to this card
        els.push(<line key={K()} x1={CX} y1={afterY} x2={CX} y2={aeCardY - 4}
          stroke={p.arr} strokeWidth={1.5} markerEnd={`url(#arr_${sec.color})`} />)

        // Card background + label bar
        els.push(<rect key={K()} x={aeX} y={aeCardY} width={aeW} height={aeH} rx={4}
          fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
        els.push(<rect key={K()} x={aeX} y={aeCardY} width={aeW} height={LBLH} rx={4} fill={p.alw} />)
        els.push(<rect key={K()} x={aeX} y={aeCardY + LBLH - 4} width={aeW} height={4} fill={p.alw} />)

        if (_editCb) {
          const capSi = si, capDi = di, capAfi = afi
          els.push(
            <g key={K()} onMouseDown={stopMD}
               onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_dec_after', secIdx: capSi, decIdx: capDi, afterIdx: capAfi }) }}
               style={{ cursor: 'pointer' }}>
              <circle cx={aeX + aeW - 9} cy={aeCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
              <text x={aeX + aeW - 9} y={aeCardY + LBLH / 2 + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill="white">×</text>
            </g>
          )
          els.push(
            <g key={K()} onMouseDown={stopMD}
               onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_dec_after_label', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, current: ae.label }) }}
               style={{ cursor: 'text' }}>
              <rect x={aeX + 4} y={aeCardY + 1} width={aeW - 24} height={LBLH - 2} rx={2} fill="transparent" />
            </g>
          )
        }

        // Label text
        els.push(
          <text key={K()} x={aeX + 8} y={aeCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600}
            fill={p.hdr} fontFamily="ui-sans-serif,system-ui,sans-serif">
            {tr(ae.label, _editCb ? 20 : 28)}
          </text>
        )

        // Packages
        const aePkgs = ae.packages ?? []
        let aeBY = aeCardY + LBLH + BPAD
        if (aePkgs.length > 0) {
          aePkgs.forEach((pkg, pi) => {
            const py = aeBY + pi * PKG + PKG * 0.8
            const full = pkgName(pkg)
            if (hit(pkg.id) || hit(full)) {
              els.push(<rect key={K()} x={aeX + 4} y={py - PKG * 0.85} width={aeW - 8} height={PKG} rx={3} fill={HIT_STROKE} opacity={0.22} />)
            }
            if (_editCb) {
              const capSi = si, capDi = di, capAfi2 = afi, capPi = pi
              els.push(
                <g key={K()} onMouseDown={stopMD}
                   onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi2, pkgIdx: capPi }) }}
                   style={{ cursor: 'pointer' }}>
                  <rect x={aeX + 4} y={py - PKG * 0.85} width={aeW - 8} height={PKG} rx={3} fill="transparent" />
                  <text x={aeX + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}</text>
                  <text x={aeX + 8 + pkg.id.length * 5.8 + 6} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
                    {tr(full, Math.max(8, Math.floor((aeX + aeW - 14 - (aeX + 8 + pkg.id.length * 5.8 + 6)) / 5.2)))}
                  </text>
                  <text x={aeX + aeW - 10} y={py} fontSize={10} fontWeight={700} textAnchor="middle" fill="#ef4444" opacity={0.7}>×</text>
                </g>
              )
            } else {
              els.push(<text key={K()} x={aeX + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{full}</title></text>)
              const nx = aeX + 8 + pkg.id.length * 5.8 + 6
              els.push(<text key={K()} x={nx} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>{tr(full, Math.max(8, Math.floor((aeX + aeW - 10 - nx) / 5.2)))}<title>{full}</title></text>)
            }
          })
        } else {
          els.push(<text key={K()} x={aeX + 8} y={aeBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
        }

        // + pacote button for after entry
        if (_editCb) {
          const aeBtnY = aeCardY + aeH - 14 + 1
          const capSi = si, capDi = di, capAfi3 = afi
          els.push(
            <g key={K()} onMouseDown={stopMD}
               onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi3 }) }}
               style={{ cursor: 'pointer' }}>
              <rect x={aeX + 6} y={aeBtnY - 7} width={aeW - 12} height={13} rx={4} fill={p.code} opacity={0.12} />
              <rect x={aeX + 6} y={aeBtnY - 7} width={aeW - 12} height={13} rx={4} fill="none" stroke={p.code} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.4} />
              <text x={CX} y={aeBtnY + 2.5} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.8}>+ pacote</text>
            </g>
          )
        }

        afterY = aeCardY + aeH
      }

      // "+ seq após convergência" button (edit mode only, below after entries)
      if (_editCb) {
        const addAftBtnY = afterY + SEQ_GAP / 2 + 4
        const capSi = si, capDi = di
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_dec_after', secIdx: capSi, decIdx: capDi }) }}
             style={{ cursor: 'pointer' }}>
            <rect x={CX - 68} y={addAftBtnY - 8} width={136} height={16} rx={8} fill="#7c3aed" opacity={0.12} />
            <rect x={CX - 68} y={addAftBtnY - 8} width={136} height={16} rx={8} fill="none" stroke="#7c3aed" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.42} />
            <text x={CX} y={addAftBtnY + 4} fontSize={8.5} fontWeight={700} textAnchor="middle" fill="#7c3aed" opacity={0.85}>+ seq após convergência</text>
          </g>
        )
      }

      iY += dTotalH(dec)
      prevBotY = iY
    }

    // "+ decisão" button at end of section
    if (_editCb) {
      const btnY = Y + sh - (sh > 0 ? SVPAD : 4) - 4
      const capSi = si, capLast = sec.decisions.length - 1
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_decision', secIdx: capSi, afterDecIdx: capLast }) }}
           style={{ cursor: 'pointer' }}>
          <rect x={CX - 52} y={btnY - 8} width={104} height={16} rx={8} fill={p.code} opacity={0.14} />
          <rect x={CX - 52} y={btnY - 8} width={104} height={16} rx={8} fill="none" stroke={p.code} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.4} />
          <text x={CX} y={btnY + 4} fontSize={8.5} fontWeight={700} textAnchor="middle" fill={p.code} opacity={0.85}>+ decisão ao final</text>
        </g>
      )
    }

    Y += sh + SGAP
  }

  return Y - SGAP
}

// Draw dashed goto arrows after all sections are rendered
function drawGotoArrows(secs: LSec[], els: React.ReactNode[]): void {
  const STROKE = '#d97706'
  for (let si = 0; si < secs.length; si++) {
    for (let di = 0; di < secs[si].decisions.length; di++) {
      for (let ai = 0; ai < secs[si].decisions[di].answers.length; ai++) {
        const a = secs[si].decisions[di].answers[ai]
        if (!a.goto) continue
        const from = _ansGotoPos.get(`${si}_${di}_${ai}`)
        const to = _decPos.get(a.goto)
        if (!from || !to) continue
        // Route: right from answer → vertical to diamond level → left to diamond right vertex
        const sx = from.rx + 4
        const sy = from.my
        const dx = to.cx + DDW / 2 - 2
        const dy = to.topY + DH / 2
        const ox = Math.max(sx, dx) + 56  // off-screen x routing point
        const d = `M${sx},${sy} H${ox} V${dy} H${dx}`
        els.push(
          <path key={K()} d={d} stroke={STROKE} strokeWidth={1.5} strokeDasharray="5,3"
            fill="none" markerEnd="url(#arr_goto)" opacity={0.75} strokeLinejoin="round" />
        )
        // Label near the horizontal segment
        const labelX = (sx + ox) / 2
        els.push(
          <text key={K()} x={labelX} y={sy - 3} fontSize={8} fontWeight={600} textAnchor="middle"
            fill={STROKE} fontFamily="ui-sans-serif,system-ui,sans-serif" opacity={0.8}>
            {tr(a.goto, 24)}
          </text>
        )
      }
    }
  }
}

// Build full SVG content for a single flowchart (linear LSec[])
function buildSvg(secs: LSec[], dark: boolean, editCb?: (a: EditAction) => void, search = ''): { el: React.ReactNode; svgW: number; svgH: number } {
  _k = 0
  _dark = dark
  _editCb = editCb ?? null
  _search = search.toLowerCase().trim()
  _decPos.clear()
  _ansGotoPos.clear()
  const els: React.ReactNode[] = []
  const maxW = Math.max(...secs.map(s => sTotalW(s)))
  const svgW = maxW + MRG * 2
  const bottom = drawFlowColumn(secs, svgW / 2, MRG, els)
  drawGotoArrows(secs, els)
  // "+ nova seção ao final" button below the last section (edit mode)
  if (_editCb && secs.length > 0) {
    const capLast = secs.length - 1
    const btnCY = bottom + 34
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_section', afterSecIdx: capLast }) }}
         style={{ cursor: 'pointer' }}>
        <rect x={svgW / 2 - 72} y={btnCY - 8} width={144} height={16} rx={8} fill="#1e293b" opacity={0.9} />
        <rect x={svgW / 2 - 72} y={btnCY - 8} width={144} height={16} rx={8} fill="none" stroke="#60a5fa" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5} />
        <text x={svgW / 2} y={btnCY + 4} fontSize={9} fontWeight={700} textAnchor="middle" fill="#60a5fa" opacity={0.9}>＋ nova seção ao final</text>
      </g>
    )
    // _editCb intentionally NOT reset — onClick handlers reference it at call time
    return { el: <>{els}</>, svgW, svgH: bottom + 58 + MRG }
  }
  // _editCb is intentionally NOT reset here — onClick handlers reference it at call time,
  // and resetting it here would make all clicks silently fail after buildSvg returns.
  return { el: <>{els}</>, svgW, svgH: bottom + MRG }
}

// ── Complete-view tree layout ───────────────────────────────────────────────

const _treeLabelW = (t: string) => tr(t, 26).length * 6 + 16

function colWidth(secs: LSec[]): number {
  return secs.length ? Math.max(...secs.map(s => sTotalW(s))) : 300
}
// Subtree width: leaf = widest section; chain = max(own column, child subtree);
// decision = sum of children + gaps.
function nodeW(n: QNode): number {
  if (n.kind === 'leaf') return colWidth(n.secs)
  if (n.kind === 'chain') return Math.max(colWidth(n.secs), nodeW(n.child))
  return n.branches.reduce((s, b, i) => s + nodeW(b.child) + (i ? COLGAP : 0), 0)
}

// Edge label: rounded pill + centered text, on the connector toward a child.
function drawBranchLabel(cx: number, cy: number, text: string, els: React.ReactNode[]): void {
  const p = pal('gray')
  const t = tr(text, 26)
  const w = _treeLabelW(text)
  els.push(<rect key={K()} x={cx - w / 2} y={cy - TLBLH / 2} width={w} height={TLBLH} rx={TLBLH / 2}
    fill={p.lbl} stroke={p.bgB} strokeWidth={1} />)
  els.push(
    <text key={K()} x={cx} y={cy + 4} fontSize={F_M} fontWeight={600} fill={p.lblT}
      textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
      {t}
    </text>
  )
}

// Connectors from a parent diamond bottom fanning to each child top, with labels.
function drawTreeBranches(
  px: number, pBot: number, children: { label: string; cx: number }[], childTop: number,
  els: React.ReactNode[]
): void {
  const p = pal('gray')
  const stroke = p.arr
  const marker = 'url(#arr_gray)'
  const AP = 3
  const jY = pBot + (childTop - pBot) * 0.45

  if (children.length === 1) {
    const cx = children[0].cx
    els.push(<line key={K()} x1={cx} y1={pBot} x2={cx} y2={childTop - AP} stroke={stroke} strokeWidth={1.5} markerEnd={marker} />)
    drawBranchLabel(cx, (pBot + childTop) / 2, children[0].label, els)
    return
  }

  els.push(<line key={K()} x1={px} y1={pBot} x2={px} y2={jY} stroke={stroke} strokeWidth={1.5} />)
  for (const c of children) {
    const diff = c.cx - px
    const r = Math.min(CR, Math.max(2, Math.abs(diff) - 2))
    let d: string
    if (Math.abs(diff) < 2) d = `M${c.cx},${jY} V${childTop - AP}`
    else if (diff < 0) d = `M${px},${jY} H${c.cx + r} Q${c.cx},${jY} ${c.cx},${jY + r} V${childTop - AP}`
    else d = `M${px},${jY} H${c.cx - r} Q${c.cx},${jY} ${c.cx},${jY + r} V${childTop - AP}`
    els.push(<path key={K()} d={d} stroke={stroke} strokeWidth={1.5} fill="none" markerEnd={marker} />)
    drawBranchLabel(c.cx, (jY + childTop) / 2, c.label, els)
  }
}

// Build full SVG content for a complete-view decision tree (vertical flow).
// Two passes: (1) assign each node a center X (post-order, left-to-right leaves);
// (2) draw with flowing Y so chains (shared section runs) push their child down.
function buildTreeSvg(tree: QNode, dark: boolean, search = ''): { el: React.ReactNode; svgW: number; svgH: number } {
  _k = 0
  _dark = dark
  _search = search.toLowerCase().trim()
  const els: React.ReactNode[] = []
  const cxOf = new Map<QNode, number>()
  let cursorX = MRG

  // Pass 1: assign center X. Leaves consume width left-to-right; chains center on
  // their child; decisions center on the span of their children.
  function assignX(n: QNode): number {
    let cx: number
    if (n.kind === 'leaf') { const w = colWidth(n.secs); cx = cursorX + w / 2; cursorX += w + COLGAP }
    else if (n.kind === 'chain') { cx = assignX(n.child) }
    else { const cxs = n.branches.map(b => assignX(b.child)); cx = (cxs[0] + cxs[cxs.length - 1]) / 2 }
    cxOf.set(n, cx)
    return cx
  }

  // Pass 2: draw from topY downward; returns the bottom Y reached.
  function draw(n: QNode, topY: number): number {
    const cx = cxOf.get(n)!
    if (n.kind === 'leaf') return drawFlowColumn(n.secs, cx, topY, els)
    if (n.kind === 'chain') {
      const bottom = drawFlowColumn(n.secs, cx, topY, els)
      const childTop = bottom + SGAP
      els.push(<line key={K()} x1={cx} y1={bottom} x2={cx} y2={childTop - 5}
        stroke={dark ? '#475569' : '#94a3b8'} strokeWidth={2} markerEnd="url(#arr_inter)" />)
      return draw(n.child, childTop)
    }
    // decision: diamond at topY, branches fan out to children at childTop
    drawDiamond(cx, topY, DDW, n.question, 'gray', els)
    const childTop = topY + DH + LEVELGAP
    drawTreeBranches(cx, topY + DH, n.branches.map(b => ({ label: b.label, cx: cxOf.get(b.child)! })), childTop, els)
    let bottom = childTop
    for (const b of n.branches) bottom = Math.max(bottom, draw(b.child, childTop))
    return bottom
  }

  assignX(tree)
  const bottom = draw(tree, MRG)
  return { el: <>{els}</>, svgW: nodeW(tree) + MRG * 2, svgH: bottom + MRG }
}

// Detect dark mode via Tailwind's class on <html>
function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// View state managed atomically to guarantee zoom-at-cursor correctness
type VS = { tx: number; ty: number; scale: number }
type VA =
  | { type: 'zoom'; mx: number; my: number; factor: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'reset' }
  | { type: 'center'; tx: number; ty: number; scale?: number }

function vr(s: VS, a: VA): VS {
  if (a.type === 'zoom') {
    const next = Math.max(0.1, Math.min(3, s.scale * a.factor))
    const ratio = next / s.scale
    return { scale: next, tx: a.mx + (s.tx - a.mx) * ratio, ty: a.my + (s.ty - a.my) * ratio }
  }
  if (a.type === 'pan') return { ...s, tx: s.tx + a.dx, ty: s.ty + a.dy }
  if (a.type === 'center') return { ...s, tx: a.tx, ty: a.ty, ...(a.scale != null && { scale: a.scale }) }
  return { tx: 20, ty: 20, scale: 0.6 }
}

// Pan/zoom graph component
export function LogicGraphPanel({ secs, tree, editCb }: LogicGraphProps) {
  const dark = useDark()
  const [{ tx, ty, scale }, dispatch] = useReducer(vr, { tx: 20, ty: 20, scale: 0.6 })
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ lx: number; ly: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Ctrl+F / Cmd+F opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (e.key === 'Escape') setSearch('')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Keep module-level _editCb in sync so onClick handlers (which read it at call-time) always
  // have the current callback even between useMemo re-runs.
  useEffect(() => { _editCb = editCb ?? null }, [editCb])

  // Native wheel listener with passive:false so preventDefault actually works
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      dispatch({ type: 'zoom', mx: e.clientX - rect.left, my: e.clientY - rect.top, factor: e.deltaY < 0 ? 1.12 : 0.89 })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Fit to viewport, center horizontally and pin to top on first render
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (!cw || !ch) return
    // Fit by width (so the wide complete view fits); keep ≤0.6 for narrow charts
    const s = Math.max(0.1, Math.min(0.6, (cw - 40) / svgW))
    dispatch({
      type: 'center',
      scale: s,
      tx: (cw - svgW * s) / 2,
      ty: svgH * s > ch ? 20 : (ch - svgH * s) / 2,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragRef.current = { lx: e.clientX, ly: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dispatch({ type: 'pan', dx: e.clientX - dragRef.current.lx, dy: e.clientY - dragRef.current.ly })
    dragRef.current = { lx: e.clientX, ly: e.clientY }
  }, [])

  const stopDrag = useCallback(() => { dragRef.current = null }, [])

  const { el, svgW, svgH } = useMemo(
    () => (tree ? buildTreeSvg(tree, dark, search) : buildSvg(secs ?? [], dark, editCb, search)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secs, tree, dark, editCb, search]
  )

  const bg = dark ? '#020617' : '#dde3ea'
  const btnCls = dark
    ? 'w-7 h-7 flex items-center justify-center rounded border border-slate-600 bg-slate-800 text-slate-200 text-sm font-bold shadow-sm hover:bg-slate-700 select-none'
    : 'w-7 h-7 flex items-center justify-center rounded border border-slate-300 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 select-none'
  const btnSm = dark
    ? 'h-7 px-2 rounded border border-slate-600 bg-slate-800 text-slate-300 text-[11px] shadow-sm hover:bg-slate-700 select-none'
    : 'h-7 px-2 rounded border border-slate-300 bg-white text-slate-600 text-[11px] shadow-sm hover:bg-slate-50 select-none'
  const pctCls = dark
    ? 'text-[10px] text-slate-400 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded pointer-events-none'
    : 'text-[10px] text-slate-500 font-mono bg-white/80 px-1.5 py-0.5 rounded pointer-events-none'
  const hintCls = dark ? 'text-[10px] text-slate-500 pointer-events-none' : 'text-[10px] text-slate-400 pointer-events-none'
  const searchCls = dark
    ? 'h-7 w-48 pl-6 pr-6 rounded border border-slate-600 bg-slate-800 text-slate-200 text-[11px] placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
    : 'h-7 w-48 pl-6 pr-6 rounded border border-slate-300 bg-white text-slate-700 text-[11px] placeholder-slate-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500'

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden"
      style={{ background: bg, cursor: dragRef.current ? 'grabbing' : 'grab' }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={stopDrag} onMouseLeave={stopDrag}
    >
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5 items-center pointer-events-none">
        <div className="flex gap-1 pointer-events-auto">
          {[
            { label: '+', fn: () => dispatch({ type: 'zoom', mx: (containerRef.current?.clientWidth ?? 400) / 2, my: (containerRef.current?.clientHeight ?? 300) / 2, factor: 1.2 }) },
            { label: '−', fn: () => dispatch({ type: 'zoom', mx: (containerRef.current?.clientWidth ?? 400) / 2, my: (containerRef.current?.clientHeight ?? 300) / 2, factor: 1 / 1.2 }) },
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn} className={btnCls}>{label}</button>
          ))}
          <button onClick={() => dispatch({ type: 'reset' })} className={btnSm}>
            Reset
          </button>
        </div>
        <span className={pctCls}>{Math.round(scale * 100)}%</span>
      </div>

      {/* Search field */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 pointer-events-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="relative flex items-center">
          <svg className="absolute left-1.5 w-3.5 h-3.5 pointer-events-none" style={{ color: dark ? '#94a3b8' : '#94a3b8' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <circle cx={11} cy={11} r={7} /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar… (Ctrl+F)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setSearch('')}
            className={searchCls}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-slate-600"
              title="Limpar busca"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-3 h-3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Hint */}
      <div className={`absolute bottom-3 left-3 z-10 ${hintCls}`}>
        Arraste para mover · Scroll para zoom
      </div>

      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          {(['gray', 'blue', 'amber'] as PC[]).map(c => (
            <marker key={c} id={`arr_${c}`} markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
              <polygon points="0 0, 5 2, 0 4" fill={(dark ? DARK_PAL : PAL)[c].arr} />
            </marker>
          ))}
          <marker id="arr_inter" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
            <polygon points="0 0, 5 2, 0 4" fill={dark ? '#475569' : '#94a3b8'} />
          </marker>
          <marker id="arr_goto" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
            <polygon points="0 0, 5 2, 0 4" fill="#d97706" />
          </marker>
        </defs>
        <g transform={`translate(${tx},${ty}) scale(${scale})`} style={{ transformOrigin: '0 0' }}>
          <rect x={0} y={0} width={svgW} height={svgH} fill="transparent" />
          {el}
        </g>
      </svg>
    </div>
  )
}
