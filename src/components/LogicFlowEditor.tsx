/**
 * TESTE — Editor visual de fluxograma (ReactFlow)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import ReactFlow, {
  MiniMap, Controls, Background, Panel,
  useNodesState, useEdgesState,
  MarkerType, Position, Handle,
  type Node, type Edge, type NodeProps, type Connection,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { LSec, LDec, LAns } from '../data/logicSecs'
import type { EditAction, DecRef } from './LogicGraphPanel'
import { PACKAGES } from '../data/packages'
import { Plus, Trash2, GitBranch, X, RefreshCw, Link2, ChevronUp, ChevronDown, Copy } from 'lucide-react'

// ─── Layout constants ────────────────────────────────────────────────────────
const Q_W = 240, Q_H = 72
const A_W = 210, A_BASE_H = 90, PKG_ROW = 20
const H_GAP = 36
const V_GAP_QA = 60
const V_GAP_AQ = 70
const V_GAP_DEC = 52
const V_GAP_CONV = 40
const CONV_W = 220, CONV_H = 52
const SEC_H = 48
const SEC_V_GAP = 72

// ─── Node data types ─────────────────────────────────────────────────────────
type QData = { dec: LDec; ref: DecRef; secColor: LSec['color'] }
type AData = { ans: LAns; ref: DecRef; ansIdx: number; secColor: LSec['color'] }
type SData = { sec: LSec; secIdx: number }
type ConvData = { dec: LDec; ref: DecRef; secColor: LSec['color'] }

// ─── Layout helpers ──────────────────────────────────────────────────────────
function ansNodeH(ans: LAns) { return A_BASE_H + (ans.packages?.length ?? 0) * PKG_ROW }

function ansColW(ans: LAns): number {
  if (!ans.sub?.length) return A_W
  return Math.max(A_W, ...ans.sub.map(decSubW))
}
function decSubW(dec: LDec): number {
  if (!dec.answers.length) return Q_W
  const total = dec.answers.reduce((s, a) => s + ansColW(a), 0) + H_GAP * (dec.answers.length - 1)
  return Math.max(Q_W, total)
}

function qKey(ref: DecRef) {
  return `q|${ref.secIdx}|${ref.decIdx}|${ref.adIdx ?? 'x'}|${ref.sub.join('.')}`
}
function aKey(ref: DecRef, ai: number) {
  return `a|${ref.secIdx}|${ref.decIdx}|${ref.adIdx ?? 'x'}|${ref.sub.join('.')}|${ai}`
}
function convKey(ref: DecRef) {
  return `conv|${ref.secIdx}|${ref.decIdx}|${ref.adIdx ?? 'x'}|${ref.sub.join('.')}`
}

function layoutDec(
  dec: LDec, cx: number, topY: number, ref: DecRef,
  nodes: Node[], edges: Edge[], secColor: LSec['color'],
): number {
  const qId = qKey(ref)
  nodes.push({
    id: qId, type: 'qnode',
    position: { x: cx - Q_W / 2, y: topY },
    data: { dec, ref, secColor } as QData,
  })

  if (!dec.answers.length) return topY + Q_H

  const widths = dec.answers.map(ansColW)
  const totalW = widths.reduce((s, w) => s + w, 0) + H_GAP * (dec.answers.length - 1)
  const ansTopY = topY + Q_H + V_GAP_QA
  let ax = cx - totalW / 2
  let maxBottom = ansTopY
  const ansIds: string[] = []

  for (let ai = 0; ai < dec.answers.length; ai++) {
    const ans = dec.answers[ai]
    const aw = widths[ai]
    const acx = ax + aw / 2
    const aH = ansNodeH(ans)
    const aId = aKey(ref, ai)
    ansIds.push(aId)

    nodes.push({
      id: aId, type: 'anode',
      position: { x: acx - A_W / 2, y: ansTopY },
      data: { ans, ref, ansIdx: ai, secColor } as AData,
    })

    edges.push({
      id: `e-${qId}-${aId}`, source: qId, target: aId,
      sourceHandle: 'bottom', targetHandle: 'top',
      markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#475569' },
      style: { stroke: '#475569', strokeWidth: 1.5 },
    })

    let childY = ansTopY + aH + V_GAP_AQ
    if (ans.sub?.length) {
      for (let si = 0; si < ans.sub.length; si++) {
        const subRef: DecRef = { ...ref, sub: [...ref.sub, ai, si] }
        const subBottom = layoutDec(ans.sub[si], acx, childY, subRef, nodes, edges, secColor)
        edges.push({
          id: `e-${aId}-${qKey(subRef)}`, source: aId, target: qKey(subRef),
          sourceHandle: 'bottom', targetHandle: 'top',
          markerEnd: { type: MarkerType.ArrowClosed, width: 10, height: 10, color: '#334155' },
          style: { stroke: '#334155', strokeWidth: 1.2, strokeDasharray: '5,3' },
        })
        childY = subBottom + V_GAP_AQ
      }
      maxBottom = Math.max(maxBottom, childY - V_GAP_AQ)
    } else {
      maxBottom = Math.max(maxBottom, ansTopY + aH)
    }
    ax += aw + H_GAP
  }

  // Convergence node: shown when ≥2 answers or dec.after has items
  const showConv = dec.answers.length >= 2 || (dec.after?.length ?? 0) > 0
  if (showConv) {
    const convY = maxBottom + V_GAP_CONV
    const convId = convKey(ref)
    nodes.push({
      id: convId, type: 'convnode',
      position: { x: cx - CONV_W / 2, y: convY },
      data: { dec, ref, secColor } as ConvData,
    })
    for (const aId of ansIds) {
      edges.push({
        id: `e-conv-${aId}-${convId}`,
        source: aId, target: convId,
        sourceHandle: 'bottom', targetHandle: 'top',
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 9, height: 9, color: '#7c3aed' },
        style: { stroke: '#7c3aed', strokeWidth: 1.2, strokeDasharray: '6,3', opacity: 0.7 },
      })
    }
    return convY + CONV_H
  }

  return maxBottom
}

function buildLayout(sections: LSec[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  let y = 0
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si]
    const totalW = sec.decisions.length
      ? Math.max(360, sec.decisions.reduce((m, d) => Math.max(m, decSubW(d)), 0))
      : 360
    nodes.push({
      id: `sec-${si}`, type: 'snode',
      position: { x: -totalW / 2, y },
      data: { sec, secIdx: si } as SData,
      style: { width: totalW },
    })
    y += SEC_H + 24
    let decY = y
    for (let di = 0; di < sec.decisions.length; di++) {
      const ref: DecRef = { secIdx: si, decIdx: di, sub: [] }
      const bottom = layoutDec(sec.decisions[di], 0, decY, ref, nodes, edges, sec.color)
      decY = bottom + V_GAP_DEC
    }
    y = (sec.decisions.length ? decY : y + 40) + SEC_V_GAP
  }
  return { nodes, edges }
}

// ─── Colour palette ───────────────────────────────────────────────────────────
const PAL = {
  gray:  { accent: '#94a3b8', qBg: 'bg-slate-800/80', qBorder: 'border-slate-500', aBorder: 'border-slate-600', secBg: 'bg-slate-700/40 border-slate-600' },
  blue:  { accent: '#38bdf8', qBg: 'bg-sky-950/70',   qBorder: 'border-sky-500/70', aBorder: 'border-sky-700/50', secBg: 'bg-sky-900/30 border-sky-700/40' },
  amber: { accent: '#f59e0b', qBg: 'bg-amber-950/60', qBorder: 'border-amber-500/70', aBorder: 'border-amber-700/50', secBg: 'bg-amber-900/20 border-amber-700/40' },
}
const p = (c: LSec['color']) => PAL[c] ?? PAL.blue

// ─── QuestionNode ─────────────────────────────────────────────────────────────
function QuestionNode({ data, selected }: NodeProps<QData>) {
  const pal = p(data.secColor)
  return (
    <div className={`relative rounded-xl border-2 flex flex-col items-center justify-center text-center px-3 py-2.5 cursor-default select-none ${pal.qBg} ${pal.qBorder}`}
      style={{ width: Q_W, minHeight: Q_H, outline: selected ? `2px solid ${pal.accent}` : 'none', outlineOffset: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ background: pal.accent, width: 9, height: 9, border: '2px solid #0f172a', top: -5 }} />
      <p className="text-[9px] font-bold uppercase tracking-widest mb-1 opacity-50" style={{ color: pal.accent }}>❖ Pergunta</p>
      <p className="text-sm font-semibold leading-snug" style={{ color: pal.accent }}>
        {data.dec.question || <span className="italic opacity-40">Sem texto</span>}
      </p>
      {data.dec.answers.length > 0 && (
        <p className="text-[10px] mt-1 opacity-35">{data.dec.answers.length} resposta{data.dec.answers.length !== 1 ? 's' : ''}</p>
      )}
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ background: pal.accent, width: 9, height: 9, border: '2px solid #0f172a', bottom: -5 }} />
    </div>
  )
}

// ─── AnswerNode ───────────────────────────────────────────────────────────────
function AnswerNode({ data, selected }: NodeProps<AData>) {
  const pal = p(data.secColor)
  const pkgs = data.ans.packages ?? []
  return (
    <div className={`relative rounded-lg border flex flex-col cursor-default select-none bg-slate-800 ${pal.aBorder}`}
      style={{ width: A_W, outline: selected ? `2px solid ${pal.accent}` : 'none', outlineOffset: 3, boxShadow: '0 1px 6px rgba(0,0,0,0.35)' }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ background: '#475569', width: 8, height: 8, border: '2px solid #0f172a', top: -4 }} />

      <div className="px-3 py-2 border-b border-slate-700/60 flex items-center gap-1.5">
        <span className="text-xs font-semibold text-slate-200 flex-1 truncate">{data.ans.label || '—'}</span>
        {data.ans.active && <span className="text-yellow-400 text-[9px]">✦</span>}
        {data.ans.contingency && <span className="text-orange-400 text-[9px]">⚑</span>}
      </div>

      {pkgs.length > 0 && (
        <div className="px-2.5 py-1.5 space-y-0.5">
          {pkgs.map((pkg, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className="font-mono font-bold text-blue-400 shrink-0">{pkg.id}</span>
              <span className="text-slate-500 truncate">{pkg.name}</span>
            </div>
          ))}
        </div>
      )}
      {pkgs.length === 0 && !data.ans.sub?.length && (
        <div className="px-3 py-1.5 text-[10px] text-slate-600 italic">sem pacotes</div>
      )}
      {!!data.ans.sub?.length && (
        <div className="px-3 py-1.5 text-[10px] text-slate-500 flex items-center gap-1">
          <GitBranch size={9} /> {data.ans.sub.length} sub-pergunta{data.ans.sub.length !== 1 ? 's' : ''}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ background: '#475569', width: 8, height: 8, border: '2px solid #0f172a', bottom: -4 }} />
    </div>
  )
}

// ─── SectionNode ──────────────────────────────────────────────────────────────
function SectionNode({ data }: NodeProps<SData>) {
  const pal = p(data.sec.color)
  return (
    <div className={`rounded-xl border px-4 flex items-center gap-3 ${pal.secBg}`}
      style={{ height: SEC_H, borderLeft: `3px solid ${pal.accent}` }}>
      <span className="text-sm font-bold" style={{ color: pal.accent }}>{data.sec.label}</span>
      <span className="text-[10px] text-slate-500 border border-slate-600/60 px-1.5 py-0.5 rounded">{data.sec.phase}</span>
      <span className="text-[10px] text-slate-600 ml-auto">{data.sec.decisions.length} pergunta{data.sec.decisions.length !== 1 ? 's' : ''}</span>
    </div>
  )
}

// ─── ConvNode ─────────────────────────────────────────────────────────────────
function ConvNode({ data, selected }: NodeProps<ConvData>) {
  const afterItems = data.dec.after ?? []
  const pkgCount = afterItems.reduce((s, e) => s + (e.packages?.length ?? 0), 0)
  return (
    <div className="relative flex flex-col items-center cursor-default select-none"
      style={{ width: CONV_W, outline: selected ? '2px solid #8b5cf6' : 'none', outlineOffset: 3, borderRadius: 12 }}>
      <Handle type="target" position={Position.Top} id="top"
        style={{ background: '#7c3aed', width: 8, height: 8, border: '2px solid #0f172a', top: -4 }} />
      <div className="w-full rounded-xl border border-violet-700/60 bg-violet-950/50 flex items-center gap-3 px-3 py-2.5"
        style={{ minHeight: CONV_H }}>
        <span className="text-violet-400 text-base leading-none shrink-0">⊛</span>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-widest text-violet-500 mb-0.5">Convergência</p>
          {pkgCount > 0 ? (
            <p className="text-[10px] text-violet-300">{pkgCount} pacote{pkgCount !== 1 ? 's' : ''} compartilhado{pkgCount !== 1 ? 's' : ''}</p>
          ) : afterItems.length > 0 ? (
            <p className="text-[10px] text-violet-400">{afterItems.length} bloco{afterItems.length !== 1 ? 's' : ''} configurado{afterItems.length !== 1 ? 's' : ''}</p>
          ) : (
            <p className="text-[10px] text-violet-800 italic">clique para adicionar pacotes</p>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom"
        style={{ background: '#7c3aed', width: 8, height: 8, border: '2px solid #0f172a', bottom: -4 }} />
    </div>
  )
}

const NODE_TYPES = { qnode: QuestionNode, anode: AnswerNode, snode: SectionNode, convnode: ConvNode }

// ─── Fases disponíveis para seções ───────────────────────────────────────────
const SIDE_PHASES: { label: string; color: 'gray' | 'blue' | 'amber' }[] = [
  { label: 'Fase 0',         color: 'gray'  },
  { label: 'Fase 1A',        color: 'blue'  },
  { label: 'Fase 1B',        color: 'blue'  },
  { label: 'Fase 2',         color: 'amber' },
  { label: 'Extra Abandono', color: 'amber' },
  { label: 'Mobilização',    color: 'gray'  },
  { label: 'Desmobilização', color: 'gray'  },
]

// ─── Panel UI helpers ─────────────────────────────────────────────────────────
function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="w-72 bg-slate-900 border-l border-slate-700/60 flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</span>
        <button onClick={onClose} className="ml-auto text-slate-600 hover:text-slate-300 transition-colors"><X size={14} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-xs text-slate-300">{children}</div>
    </div>
  )
}
function SideSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 pb-3 border-b border-slate-700/40 last:border-0 last:pb-0">
      <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">{label}</p>
      {children}
    </div>
  )
}
function Btn({ children, icon, danger, onClick, disabled }: {
  children: React.ReactNode; icon?: React.ReactNode; danger?: boolean; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed
        ${danger ? 'text-rose-400 border border-rose-900/60 hover:bg-rose-900/20' : 'text-slate-300 border border-slate-700 hover:bg-slate-800 hover:border-slate-600'}`}>
      {icon}{children}
    </button>
  )
}

// ─── QuestionPanel ────────────────────────────────────────────────────────────
function QuestionPanel({ d, dec, secLen, fire, onClose }: {
  d: QData; dec: LDec; secLen: number
  fire: (a: EditAction) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(dec.question)
  const isTopLevel = d.ref.sub.length === 0 && d.ref.adIdx === undefined

  const save = () => {
    const v = draft.trim() || dec.question
    if (v !== dec.question) fire({ type: 'p_set_q', ref: d.ref, value: v })
  }

  return (
    <Shell title="Pergunta" onClose={onClose}>
      <SideSection label="Texto">
        <textarea value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save(); (e.target as HTMLTextAreaElement).blur() } }}
          rows={3}
          className="w-full text-xs bg-slate-800 border border-slate-700 focus:border-sky-500/60 rounded-lg px-2.5 py-1.5 text-slate-100 outline-none resize-none leading-relaxed" />
      </SideSection>

      <SideSection label={`Respostas (${dec.answers.length})`}>
        <div className="space-y-1 mb-1.5">
          {dec.answers.map((a, ai) => (
            <div key={ai} className="text-[11px] text-slate-400 flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/40">
              <span className="w-4 h-4 flex-shrink-0 rounded-full bg-slate-700 flex items-center justify-center text-[9px]">{ai + 1}</span>
              <span className="flex-1 truncate">{a.label}</span>
              {a.active && <span className="text-yellow-500 text-[9px]">✦</span>}
            </div>
          ))}
        </div>
        <Btn icon={<Plus size={12} />} onClick={() => fire({ type: 'p_add_ans', ref: d.ref })}>
          Adicionar resposta ao final
        </Btn>
        <Btn icon={<Plus size={12} />} onClick={() => fire({ type: 'p_add_ans', ref: d.ref, atStart: true })}>
          Inserir resposta no início
        </Btn>
      </SideSection>

      {isTopLevel && (
        <SideSection label="Inserir no fluxo">
          <Btn icon={<Plus size={12} />}
            onClick={() => fire({ type: 'add_blank_decision', secIdx: d.ref.secIdx, afterDecIdx: d.ref.decIdx - 1 })}>
            Nova pergunta acima
          </Btn>
          <Btn icon={<Plus size={12} />}
            onClick={() => fire({ type: 'add_blank_decision', secIdx: d.ref.secIdx, afterDecIdx: d.ref.decIdx })}>
            Nova pergunta abaixo
          </Btn>
        </SideSection>
      )}

      {isTopLevel && secLen > 1 && (
        <SideSection label="Ordenação">
          <div className="grid grid-cols-2 gap-1.5">
            <Btn icon={<ChevronUp size={12} />} disabled={d.ref.decIdx === 0}
              onClick={() => fire({ type: 'move_decision', secIdx: d.ref.secIdx, decIdx: d.ref.decIdx, dir: 'up' })}>
              Acima
            </Btn>
            <Btn icon={<ChevronDown size={12} />} disabled={d.ref.decIdx >= secLen - 1}
              onClick={() => fire({ type: 'move_decision', secIdx: d.ref.secIdx, decIdx: d.ref.decIdx, dir: 'down' })}>
              Abaixo
            </Btn>
          </div>
          <Btn icon={<Copy size={12} />}
            onClick={() => fire({ type: 'copy_decision', secIdx: d.ref.secIdx, decIdx: d.ref.decIdx })}>
            Copiar decisão
          </Btn>
        </SideSection>
      )}

      <Btn danger icon={<Trash2 size={12} />} onClick={() => { fire({ type: 'p_remove_dec', ref: d.ref }); onClose() }}>
        Remover pergunta
      </Btn>
    </Shell>
  )
}

// ─── AnswerPanel ──────────────────────────────────────────────────────────────
function AnswerPanel({ d, ans, totalAns, fire, onClose }: {
  d: AData; ans: LAns; totalAns: number
  fire: (a: EditAction) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(ans.label)
  const [pkgQ, setPkgQ] = useState('')
  const [addingPkg, setAddingPkg] = useState(false)
  const pkgs = ans.packages ?? []
  const allPkgs = Object.values(PACKAGES)
  const filteredPkgs = pkgQ
    ? allPkgs.filter(p => p.id.toLowerCase().includes(pkgQ.toLowerCase()) || p.name.toLowerCase().includes(pkgQ.toLowerCase()))
    : allPkgs.slice(0, 40)

  const save = () => {
    const v = draft.trim() || ans.label
    if (v !== ans.label) fire({ type: 'p_set_ans', ref: d.ref, ansIdx: d.ansIdx, value: v })
  }

  return (
    <Shell title="Resposta" onClose={onClose}>
      <SideSection label="Rótulo">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur() } }}
          className="w-full text-xs bg-slate-800 border border-slate-700 focus:border-sky-500/60 rounded-lg px-2.5 py-1.5 text-slate-100 outline-none" />
      </SideSection>

      <SideSection label={`Pacotes (${pkgs.length})`}>
        <div className="space-y-1 mb-2">
          {pkgs.map((pkg, pi) => (
            <div key={pi} className="flex items-center gap-0.5 text-[11px] bg-slate-800/60 rounded px-2 py-1">
              <span className="font-mono font-bold text-blue-400 shrink-0 text-[10px]">{pkg.id}</span>
              <span className="text-slate-400 flex-1 truncate text-[10px] ml-1.5">{pkg.name}</span>
              <button disabled={pi === 0}
                onClick={() => fire({ type: 'p_move_pkg', ref: d.ref, ansIdx: d.ansIdx, pkgIdx: pi, dir: 'up' })}
                className="text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors p-0.5">
                <ChevronUp size={9} />
              </button>
              <button disabled={pi === pkgs.length - 1}
                onClick={() => fire({ type: 'p_move_pkg', ref: d.ref, ansIdx: d.ansIdx, pkgIdx: pi, dir: 'down' })}
                className="text-slate-600 hover:text-slate-300 disabled:opacity-20 disabled:cursor-not-allowed transition-colors p-0.5">
                <ChevronDown size={9} />
              </button>
              <button onClick={() => fire({ type: 'p_remove_pkg', ref: d.ref, ansIdx: d.ansIdx, pkgIdx: pi })}
                className="text-slate-600 hover:text-rose-400 transition-colors p-0.5">
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
        {addingPkg ? (
          <div className="space-y-1.5">
            <input autoFocus value={pkgQ} onChange={e => setPkgQ(e.target.value)}
              placeholder="Buscar pacote…"
              className="w-full text-xs bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-sky-500/60" />
            <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-lg border border-slate-700 bg-slate-900">
              {filteredPkgs.map(pk => (
                <button key={pk.id} onClick={() => {
                  fire({ type: 'p_add_pkg_direct', ref: d.ref, ansIdx: d.ansIdx, pkgId: pk.id, pkgName: pk.name })
                  setPkgQ('')
                }}
                className="w-full text-left text-[11px] px-2.5 py-1.5 hover:bg-slate-800 flex gap-2 transition-colors">
                  <span className="font-mono text-blue-400 shrink-0 w-14 truncate">{pk.id}</span>
                  <span className="text-slate-400 truncate">{pk.name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setAddingPkg(false); setPkgQ('') }}
              className="text-[10px] text-slate-600 hover:text-slate-400">Cancelar</button>
          </div>
        ) : (
          <button onClick={() => setAddingPkg(true)}
            className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors">
            <Plus size={10} /> Adicionar pacote
          </button>
        )}
      </SideSection>

      <SideSection label="Inserir no fluxo">
        <Btn icon={<Plus size={12} />} onClick={() => fire({ type: 'p_ins_ans', ref: d.ref, atIdx: d.ansIdx })}>
          Nova resposta acima
        </Btn>
        <Btn icon={<Plus size={12} />} onClick={() => fire({ type: 'p_ins_ans', ref: d.ref, atIdx: d.ansIdx + 1 })}>
          Nova resposta abaixo
        </Btn>
      </SideSection>

      {totalAns > 1 && (
        <SideSection label="Ordenar resposta">
          <div className="grid grid-cols-2 gap-1.5">
            <Btn icon={<ChevronUp size={12} />} disabled={d.ansIdx === 0}
              onClick={() => fire({ type: 'p_move_ans', ref: d.ref, ansIdx: d.ansIdx, dir: 'up' })}>
              Acima
            </Btn>
            <Btn icon={<ChevronDown size={12} />} disabled={d.ansIdx >= totalAns - 1}
              onClick={() => fire({ type: 'p_move_ans', ref: d.ref, ansIdx: d.ansIdx, dir: 'down' })}>
              Abaixo
            </Btn>
          </div>
        </SideSection>
      )}

      <SideSection label="Expandir">
        <Btn icon={<GitBranch size={12} />} onClick={() => fire({ type: 'p_add_sub_dec', ref: d.ref, ansIdx: d.ansIdx })}>
          Adicionar sub-pergunta
        </Btn>
        <Btn icon={<Link2 size={12} />} onClick={() => fire({ type: 'p_add_after', ref: d.ref, ansIdx: d.ansIdx })}>
          Bloco após convergência
        </Btn>
      </SideSection>

      <Btn danger icon={<Trash2 size={12} />} onClick={() => { fire({ type: 'p_remove_ans', ref: d.ref, ansIdx: d.ansIdx }); onClose() }}>
        Remover resposta
      </Btn>
    </Shell>
  )
}

// ─── SectionPanel ─────────────────────────────────────────────────────────────
function SectionPanel({ d, sections, fire, onClose }: {
  d: SData; sections: LSec[]; fire: (a: EditAction) => void; onClose: () => void
}) {
  const [draft, setDraft] = useState(d.sec.label)
  const totalSecs = sections.length

  const save = () => {
    const v = draft.trim() || d.sec.label
    if (v !== d.sec.label) fire({ type: 'p_set_section_label', secIdx: d.secIdx, value: v })
  }

  return (
    <Shell title="Seção" onClose={onClose}>
      <SideSection label="Nome">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') { save(); (e.target as HTMLInputElement).blur() } }}
          className="w-full text-xs bg-slate-800 border border-slate-700 focus:border-sky-500/60 rounded-lg px-2.5 py-1.5 text-slate-100 outline-none" />
      </SideSection>

      <SideSection label="Fase">
        <select value={d.sec.phase}
          onChange={e => {
            const ph = SIDE_PHASES.find(p => p.label === e.target.value)
            if (ph) fire({ type: 'p_set_section_phase', secIdx: d.secIdx, phase: ph.label, color: ph.color })
          }}
          className="w-full text-xs bg-slate-800 border border-slate-700 focus:border-sky-500/60 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none cursor-pointer">
          {SIDE_PHASES.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
        </select>
      </SideSection>

      <div className="text-[11px] text-slate-500 -mt-1">
        {d.sec.decisions.length} pergunta{d.sec.decisions.length !== 1 ? 's' : ''}
      </div>

      {totalSecs > 1 && (
        <SideSection label="Ordenação">
          <div className="grid grid-cols-2 gap-1.5">
            <Btn icon={<ChevronUp size={12} />} disabled={d.secIdx === 0}
              onClick={() => fire({ type: 'move_section', secIdx: d.secIdx, dir: 'up' })}>
              Acima
            </Btn>
            <Btn icon={<ChevronDown size={12} />} disabled={d.secIdx >= totalSecs - 1}
              onClick={() => fire({ type: 'move_section', secIdx: d.secIdx, dir: 'down' })}>
              Abaixo
            </Btn>
          </div>
        </SideSection>
      )}

      <SideSection label="Conteúdo">
        <Btn icon={<Plus size={12} />}
          onClick={() => fire({ type: 'add_blank_decision', secIdx: d.secIdx, afterDecIdx: d.sec.decisions.length - 1 })}>
          Adicionar pergunta
        </Btn>
      </SideSection>

      <Btn danger icon={<Trash2 size={12} />}
        onClick={() => { fire({ type: 'remove_section', secIdx: d.secIdx }); onClose() }}>
        Remover seção
      </Btn>
    </Shell>
  )
}

// ─── Side panel (dispatcher) ──────────────────────────────────────────────────
function SidePanel({ node, sections, fire, onClose }: {
  node: Node; sections: LSec[]; fire: (a: EditAction) => void; onClose: () => void
}) {
  if (node.type === 'qnode') {
    const d = node.data as QData
    const dec = resolveRef(sections, d.ref)
    if (!dec) return null
    const secLen = d.ref.sub.length === 0 && d.ref.adIdx === undefined
      ? (sections[d.ref.secIdx]?.decisions.length ?? 0) : 0
    return <QuestionPanel d={d} dec={dec} secLen={secLen} fire={fire} onClose={onClose} />
  }

  if (node.type === 'anode') {
    const d = node.data as AData
    const dec = resolveRef(sections, d.ref)
    const ans = dec?.answers[d.ansIdx]
    if (!ans) return null
    return <AnswerPanel d={d} ans={ans} totalAns={dec?.answers.length ?? 0} fire={fire} onClose={onClose} />
  }

  if (node.type === 'snode') {
    const d = node.data as SData
    return <SectionPanel d={d} sections={sections} fire={fire} onClose={onClose} />
  }

  if (node.type === 'convnode') {
    const d = node.data as ConvData
    const dec = resolveRef(sections, d.ref)
    if (!dec) return null
    const afterItems = dec.after ?? []
    return (
      <Shell title="Convergência" onClose={onClose}>
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Pacotes aplicados após <em>todas</em> as respostas desta pergunta convergirem.
        </p>

        {afterItems.length === 0 && (
          <div className="text-[11px] text-slate-600 italic px-1">Nenhum bloco configurado.</div>
        )}

        {afterItems.map((entry, ei) => (
          <div key={ei} className="rounded-lg border border-violet-900/60 bg-violet-950/30 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-violet-900/40 flex items-center gap-2">
              <span className="text-[10px] font-semibold text-violet-300 flex-1 truncate">{entry.label || 'Sem rótulo'}</span>
              <button onClick={() => fire({ type: 'p_dec_remove_after', ref: d.ref, afterIdx: ei })}
                className="text-slate-600 hover:text-rose-400 transition-colors"><X size={10} /></button>
            </div>
            <div className="px-3 py-2 space-y-0.5">
              {(entry.packages ?? []).length === 0 && <p className="text-[10px] text-slate-600 italic">sem pacotes</p>}
              {(entry.packages ?? []).map((pkg, pi) => (
                <div key={pi} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono font-bold text-blue-400 shrink-0">{pkg.id}</span>
                  <span className="text-slate-400 truncate">{pkg.name}</span>
                </div>
              ))}
              <button onClick={() => fire({ type: 'p_dec_add_after_pkg', ref: d.ref, afterIdx: ei })}
                className="mt-1 flex items-center gap-1 text-[10px] text-sky-500 hover:text-sky-400 transition-colors">
                <Plus size={9} /> Adicionar pacote neste bloco
              </button>
            </div>
          </div>
        ))}

        <div className="space-y-2">
          <Btn icon={<Plus size={12} />} onClick={() => fire({ type: 'p_dec_add_after_pkg', ref: d.ref, afterIdx: -1 })}>
            Adicionar pacote
          </Btn>
          <Btn icon={<Plus size={12} />} onClick={() => fire({ type: 'p_dec_add_after', ref: d.ref })}>
            Novo bloco após convergência
          </Btn>
        </div>
      </Shell>
    )
  }

  return null
}

// ─── Resolve DecRef ───────────────────────────────────────────────────────────
function resolveRef(secs: LSec[], ref: DecRef): LDec | null {
  const sec = secs[ref.secIdx]; if (!sec) return null
  let dec: LDec | null = ref.adIdx !== undefined
    ? (sec.decisions[ref.decIdx]?.afterDec?.[ref.adIdx] ?? null)
    : (sec.decisions[ref.decIdx] ?? null)
  if (!dec) return null
  for (let i = 0; i + 1 < ref.sub.length; i += 2) {
    const ansIdx = ref.sub[i], subIdx = ref.sub[i + 1]
    dec = subIdx < 0
      ? (dec.answers[ansIdx]?.afterSub?.[-(subIdx + 1)] ?? null)
      : (dec.answers[ansIdx]?.sub?.[subIdx] ?? null)
    if (!dec) return null
  }
  return dec
}

// ─── Main component ───────────────────────────────────────────────────────────
export function LogicFlowEditor({ sections, editCb }: {
  sections: LSec[]
  editCb?: (action: EditAction) => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const rfRef = useRef<ReactFlowInstance | null>(null)
  const layoutKeyRef = useRef(0)
  const canEdit = !!editCb

  const fire = useCallback((action: EditAction) => editCb?.(action), [editCb])

  const reLayout = useCallback((fit = true) => {
    const { nodes: n, edges: e } = buildLayout(sections)
    setNodes(n)
    setEdges(e)
    if (fit) setTimeout(() => rfRef.current?.fitView({ padding: 0.14, duration: 350, maxZoom: 1.1 }), 60)
  }, [sections, setNodes, setEdges])

  // Rebuild on sections change; fit only on first load or major structural change
  useEffect(() => {
    const key = JSON.stringify(sections.map(s => ({ id: s.id, dLen: s.decisions.length, label: s.label })))
    const isStructural = key !== layoutKeyRef.current.toString()
    layoutKeyRef.current = key as unknown as number
    reLayout(isStructural)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections])

  // Keep selectedNode data fresh after sections change
  useEffect(() => {
    if (!selectedNode) return
    const fresh = nodes.find(n => n.id === selectedNode.id)
    if (fresh) setSelectedNode(fresh)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  const onPaneClick = useCallback(() => setSelectedNode(null), [])

  // Handle new connections drawn by user: answer → creates sub-question; answer→answer is invalid
  const onConnect = useCallback((conn: Connection) => {
    if (!canEdit || !conn.source || !conn.target) return
    const srcNode = nodes.find(n => n.id === conn.source)
    if (!srcNode) return
    if (srcNode.type === 'anode') {
      const d = srcNode.data as AData
      fire({ type: 'p_add_sub_dec', ref: d.ref, ansIdx: d.ansIdx })
    }
  }, [canEdit, nodes, fire])

  return (
    <div className="flex h-full w-full bg-slate-950 overflow-hidden" style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
      <div className="flex-1 min-w-0 relative">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onConnect={onConnect}
          onInit={inst => { rfRef.current = inst }}
          nodeTypes={NODE_TYPES}
          nodesDraggable
          nodesConnectable={canEdit}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.14, maxZoom: 1.1 }}
          minZoom={0.08}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1e293b" gap={24} size={1} />
          <Controls showInteractive={false}
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
          <MiniMap
            nodeColor={n => n.type === 'snode' ? '#334155' : n.type === 'qnode' ? '#0ea5e9' : '#475569'}
            maskColor="rgba(15,23,42,0.7)"
            style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />

          {/* Toolbar */}
          <Panel position="top-left">
            <div className="flex items-center gap-1.5 bg-slate-900/95 border border-slate-700 rounded-xl px-3 py-2 backdrop-blur shadow-xl">
              <TBtn icon={<RefreshCw size={11} />} onClick={() => reLayout(true)} tip="Re-organizar layout">Layout</TBtn>
              {canEdit && (
                <>
                  <Sep />
                  <TBtn icon={<Plus size={11} />} onClick={() => fire({ type: 'add_section', afterSecIdx: sections.length - 1 })} tip="Adicionar seção">Seção</TBtn>
                  {sections.length > 0 && (
                    <TBtn icon={<Plus size={11} />}
                      onClick={() => fire({ type: 'add_blank_decision', secIdx: sections.length - 1, afterDecIdx: (sections[sections.length - 1]?.decisions.length ?? 1) - 1 })}
                      tip="Adicionar pergunta na última seção">Pergunta</TBtn>
                  )}
                </>
              )}
            </div>
          </Panel>

          {/* Hint */}
          {nodes.length > 0 && !selectedNode && (
            <Panel position="bottom-center">
              <p className="text-[10px] text-slate-600 bg-slate-900/80 px-3 py-1.5 rounded-full border border-slate-800">
                {canEdit ? 'Clique para editar · Arraste o ponto ● para conectar respostas a novas perguntas' : 'Modo leitura — selecione o escopo como editor para editar'}
              </p>
            </Panel>
          )}

          {/* Empty state */}
          {nodes.length === 0 && (
            <Panel position="top-center">
              <div className="flex flex-col items-center gap-3 mt-24 text-center">
                <GitBranch size={28} className="text-slate-700" />
                <p className="text-slate-500 text-sm">Nenhuma seção carregada.</p>
                <p className="text-slate-600 text-xs">Selecione um escopo na coluna esquerda ou carregue um escopo base.</p>
                {canEdit && (
                  <button onClick={() => fire({ type: 'add_section', afterSecIdx: -1 })}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-700/20 border border-amber-600/40 text-amber-400 text-sm font-semibold hover:bg-amber-700/30 transition-colors">
                    <Plus size={14} /> Nova seção
                  </button>
                )}
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>

      {selectedNode && (
        <SidePanel key={selectedNode.id} node={selectedNode} sections={sections} fire={fire} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  )
}

function Sep() { return <div className="w-px h-4 bg-slate-700 mx-0.5" /> }
function TBtn({ children, icon, onClick, tip }: { children: React.ReactNode; icon?: React.ReactNode; onClick: () => void; tip?: string }) {
  return (
    <button onClick={onClick} title={tip}
      className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded-lg hover:bg-slate-800">
      {icon}{children}
    </button>
  )
}
