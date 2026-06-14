import { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect, useReducer } from 'react'
import { getPackage } from '../data/packages'

// Original/canonical package name (falls back to the flowchart's own label)
const pkgName = (p: LPkg): string => getPackage(p.id)?.name ?? p.name

// Types compatible with AdminView.tsx (structural typing)
type LPkg = { id: string; name: string }
interface LAns { label: string; active?: boolean; note?: string; packages?: LPkg[]; sub?: LDec[] }
interface LDec { question: string; answers: LAns[] }
interface LSec { id: string; label: string; phase: string; color: 'gray'|'blue'|'amber'; always?: LPkg[]; decisions: LDec[] }
// Complete-view decision tree (mirrors logicSecs.ts QNode structurally)
type QLeaf = { kind: 'leaf'; scopeId: string; label: string; secs: LSec[] }
type QDecision = { kind: 'decision'; question: string; branches: { label: string; child: QNode }[] }
type QChain = { kind: 'chain'; secs: LSec[]; child: QNode }
type QNode = QDecision | QLeaf | QChain
export interface LogicGraphProps { secs?: LSec[]; tree?: QNode }

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
const K = () => String(_k++)
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
  return h + BPAD
}
function aSubH(a: LAns): number {
  return (a.sub ?? []).reduce((s, d) => s + SG + dTotalH(d), 0)
}
function aH(a: LAns): number { return LBLH + aBodyH(a) + aSubH(a) }
function dTotalH(d: LDec): number { return DH + AV + Math.max(...d.answers.map(aH)) }
function sAlwH(s: LSec): number {
  if (!s.always?.length) return 0
  return ALWLH + ALWBP + s.always.length * ALWPH + ALWG
}
function sTotalH(s: LSec): number {
  return SHH + SVPAD + sAlwH(s) + s.decisions.reduce((sum, d, i) => sum + dTotalH(d) + (i ? DSQ : 0), 0) + SVPAD
}
function sTotalW(s: LSec): number {
  return Math.max(300, ...s.decisions.map(dW)) + SPAD * 2
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

// Render one answer card (recursive for sub-decisions)
function renderAnswer(
  a: LAns, x: number, y: number, w: number, cx: number,
  pc: PC, els: React.ReactNode[]
): void {
  const p = pal(pc)
  const h = aH(a)
  const bodH = aBodyH(a)
  const act = !!a.active

  // card background
  els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill={act ? p.act : p.ans} stroke={act ? p.hdr : p.ansB} strokeWidth={act ? 2 : 1} />)
  // label bar
  const lbg = act ? p.hdr : p.lbl
  els.push(<rect key={K()} x={x} y={y} width={w} height={LBLH} rx={5} fill={lbg} />)
  els.push(<rect key={K()} x={x} y={y + LBLH - 5} width={w} height={5} fill={lbg} />)
  els.push(
    <text key={K()} x={x + 8} y={y + LBLH * 0.68} fontSize={F_M} fontWeight={700}
      fill={act ? p.hdrT : p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">
      {tr(a.label + (act ? ' ✦' : ''), 28)}
    </text>
  )

  // body content
  let bY = y + LBLH + BPAD
  if (a.note) {
    els.push(
      <text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic"
        fill={act ? p.ansT : p.noteT} fontFamily="ui-sans-serif,system-ui,sans-serif">
        {tr(a.note, 36)}
      </text>
    )
    bY += NOTE_R + 2
  }
  const pkgs = a.packages ?? []
  if (pkgs.length > 0) {
    pkgs.forEach((pkg, i) => {
      const py = bY + i * PKG + PKG * 0.8
      const full = pkgName(pkg)
      els.push(<text key={K()} x={x + 8} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{`${pkg.id} — ${full}`}</title></text>)
      const nx = x + 8 + pkg.id.length * 5.8 + 6
      const mc = Math.max(8, Math.floor((x + w - 10 - nx) / 5.2))
      els.push(
        <text key={K()} x={nx} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={act ? p.actT : p.ansT}>
          {tr(full, mc)}<title>{full}</title>
        </text>
      )
    })
  } else if (!a.note) {
    els.push(<text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
  }

  // sub-decisions nested below body content
  if (a.sub?.length) {
    let sY = y + LBLH + bodH + SG
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
      const saY = sY + DH + AV
      const tW = dW(sub)
      let saX = cx - tW / 2
      fanOut(cx, sY + DH, sub.answers, saX, saY, p.arr, `url(#arr_${pc})`, els)
      saX = cx - tW / 2
      for (const sa of sub.answers) {
        const saw = aW(sa)
        renderAnswer(sa, saX, saY, saw, saX + saw / 2, pc, els)
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
  els.push(
    <polygon key={K()} points={`${cx},${topY} ${x + w},${topY + DH / 2} ${cx},${topY + DH} ${x},${topY + DH / 2}`}
      fill={p.dec} stroke={p.hdr} strokeWidth={1.5} />
  )
  els.push(
    <text key={K()} x={cx} y={topY + DH / 2 + 4} fontSize={F_M} fontWeight={600}
      fill={p.decT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
      {tr(text, 36)}
    </text>
  )
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
    }

    // Section background + header
    els.push(<rect key={K()} x={sx} y={Y} width={sw} height={sh} rx={10} fill={p.bg} stroke={p.bgB} strokeWidth={1.5} />)
    els.push(<rect key={K()} x={sx} y={Y} width={sw} height={SHH} rx={10} fill={p.hdr} />)
    els.push(<rect key={K()} x={sx} y={Y + SHH - 10} width={sw} height={10} fill={p.hdr} />)
    els.push(
      <text key={K()} x={sx + SPAD} y={Y + SHH * 0.63} fontSize={F_L} fontWeight={700}
        fill={p.hdrT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={1.2}>
        {tr(sec.label, 36)}
      </text>
    )
    // Phase badge
    const bl = sec.phase.length * 6.5 + 12
    els.push(<rect key={K()} x={sx + sw - SPAD - bl} y={Y + 9} width={bl} height={17} rx={8} fill={p.bb} />)
    els.push(
      <text key={K()} x={sx + sw - SPAD - bl / 2} y={Y + 21} fontSize={9} fontWeight={700}
        fill={p.bT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
        {sec.phase}
      </text>
    )

    let iY = Y + SHH + SVPAD

    // Always block
    if (sec.always?.length) {
      const alwBH = sAlwH(sec) - ALWG
      const awX = sx + SPAD, awW = sw - SPAD * 2
      els.push(<rect key={K()} x={awX} y={iY} width={awW} height={alwBH} rx={6} fill={p.alw} stroke={p.bgB} strokeWidth={1} />)
      els.push(
        <text key={K()} x={awX + 10} y={iY + ALWLH * 0.75} fontSize={9} fontWeight={700}
          fill={p.hdr} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={1}>
          SEMPRE
        </text>
      )
      sec.always.forEach((pkg, pi) => {
        const py = iY + ALWLH + ALWBP + pi * ALWPH + ALWPH * 0.82
        const full = pkgName(pkg)
        els.push(<text key={K()} x={awX + 10} y={py} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{`${pkg.id} — ${full}`}</title></text>)
        const nx = awX + 10 + pkg.id.length * 5.8 + 6
        const mc = Math.max(10, Math.floor((awX + awW - 10 - nx) / 5.2))
        els.push(
          <text key={K()} x={nx} y={py} fontSize={F_S} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT}>
            {tr(full, mc)}<title>{full}</title>
          </text>
        )
      })
      iY += sAlwH(sec)
    }

    // Decisions
    let prevBotY = iY
    for (let di = 0; di < sec.decisions.length; di++) {
      const dec = sec.decisions[di]
      if (di > 0) iY += DSQ

      const dY = iY

      if (prevBotY < dY - 4) {
        els.push(
          <line key={K()} x1={CX} y1={prevBotY} x2={CX} y2={dY - 5}
            stroke={p.arr} strokeWidth={1.5} markerEnd={`url(#arr_${sec.color})`} />
        )
      }

      drawDiamond(CX, dY, DDW, dec.question, sec.color, els)

      const ansY = dY + DH + AV
      const totAW = dW(dec)
      const firstAnsX = CX - totAW / 2
      fanOut(CX, dY + DH, dec.answers, firstAnsX, ansY, p.arr, `url(#arr_${sec.color})`, els)

      let ax = firstAnsX
      for (const ans of dec.answers) {
        const aw = aW(ans)
        renderAnswer(ans, ax, ansY, aw, ax + aw / 2, sec.color, els)
        ax += aw + AG
      }

      iY += dTotalH(dec)
      prevBotY = iY
    }

    Y += sh + SGAP
  }

  return Y - SGAP
}

// Build full SVG content for a single flowchart (linear LSec[])
function buildSvg(secs: LSec[], dark: boolean): { el: React.ReactNode; svgW: number; svgH: number } {
  _k = 0
  _dark = dark
  const els: React.ReactNode[] = []
  const maxW = Math.max(...secs.map(s => sTotalW(s)))
  const svgW = maxW + MRG * 2
  const bottom = drawFlowColumn(secs, svgW / 2, MRG, els)
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
function buildTreeSvg(tree: QNode, dark: boolean): { el: React.ReactNode; svgW: number; svgH: number } {
  _k = 0
  _dark = dark
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
export function LogicGraphPanel({ secs, tree }: LogicGraphProps) {
  const dark = useDark()
  const [{ tx, ty, scale }, dispatch] = useReducer(vr, { tx: 20, ty: 20, scale: 0.6 })
  const dragRef = useRef<{ lx: number; ly: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
    () => (tree ? buildTreeSvg(tree, dark) : buildSvg(secs ?? [], dark)),
    [secs, tree, dark]
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
        </defs>
        <g transform={`translate(${tx},${ty}) scale(${scale})`} style={{ transformOrigin: '0 0' }}>
          <rect x={0} y={0} width={svgW} height={svgH} fill="transparent" />
          {el}
        </g>
      </svg>
    </div>
  )
}
