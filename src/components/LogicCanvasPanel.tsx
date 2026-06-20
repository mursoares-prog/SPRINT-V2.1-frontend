/**
 * Editor de canvas livre — formas arrastáveis e setas livres
 * Persistência automática em localStorage por escopo.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { Trash2, X } from 'lucide-react'
import type { CanvasNode, CanvasEdge, CanvasNodeType, CanvasData, LSec } from '../data/logicSecs'
import { PACKAGES } from '../data/packages'

// ── Dimensões (largura × altura de cada forma) ────────────────────────────────

const NW: Record<CanvasNodeType, number> = {
  start: 110, end: 110, decision: 174, process: 174, package: 214, note: 174,
}
const NH: Record<CanvasNodeType, number> = {
  start: 40, end: 40, decision: 72, process: 52, package: 54, note: 68,
}

// ── Paleta de cores por tipo ──────────────────────────────────────────────────

const COL: Record<CanvasNodeType, { bg: string; bd: string; tx: string }> = {
  start:    { bg: '#0a1628', bd: '#3b82f6', tx: '#93c5fd' },
  end:      { bg: '#280a0a', bd: '#ef4444', tx: '#fca5a5' },
  decision: { bg: '#0d0d28', bd: '#818cf8', tx: '#c7d2fe' },
  process:  { bg: '#0a280a', bd: '#4ade80', tx: '#86efac' },
  package:  { bg: '#201600', bd: '#d97706', tx: '#fcd34d' },
  note:     { bg: '#10200a', bd: '#84cc16', tx: '#d9f99d' },
}

// ── Ponto de conexão na borda do nó (interseção bbox/rombóide) ───────────────

function edgePoint(node: CanvasNode, tx: number, ty: number) {
  const hw = NW[node.type] / 2, hh = NH[node.type] / 2
  const dx = tx - node.x, dy = ty - node.y
  if (!dx && !dy) return { x: node.x, y: node.y }

  if (node.type === 'decision') {
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh)
    return { x: node.x + t * dx, y: node.y + t * dy }
  }
  if (node.type === 'start' || node.type === 'end') {
    const t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2)
    return { x: node.x + t * dx, y: node.y + t * dy }
  }
  const ta = dx ? Math.abs(hw / dx) : Infinity
  const tb = dy ? Math.abs(hh / dy) : Infinity
  return { x: node.x + Math.min(ta, tb) * dx, y: node.y + Math.min(ta, tb) * dy }
}

function uid() { return `c${Math.random().toString(36).slice(2, 8)}` }

// ── Conversão LSec[] → CanvasData (layout hierárquico automático) ─────────────

function sectionsToCanvas(secs: LSec[]): CanvasData {
  const nodes: CanvasNode[] = []
  const edges: CanvasEdge[] = []
  function cid() { return `cv${Math.random().toString(36).slice(2, 7)}` }

  const COL_W = 620       // largura alocada por seção
  const MX = 100          // margem esquerda
  const MY = 80           // margem superior
  const RGAP = 28         // espaço entre linhas
  const ANS_STEP = 255    // espaçamento horizontal entre respostas
  const PKG_RSTEP = NH.package + 12  // altura de cada linha de pacote

  for (let si = 0; si < secs.length; si++) {
    const sec = secs[si]
    const cx = MX + si * COL_W + COL_W / 2
    let y = MY

    // Cabeçalho da seção
    const hdrId = cid()
    const secLbl = `[${sec.phase}] ${sec.label}`
    nodes.push({ id: hdrId, type: 'process', x: cx, y: y + NH.process / 2, label: secLbl })
    let prevId = hdrId
    y += NH.process + RGAP

    // Pacotes "sempre"
    if (sec.always?.length) {
      const alwId = cid()
      const ids = sec.always.slice(0, 5).map(p => p.id).join(', ') + (sec.always.length > 5 ? '…' : '')
      nodes.push({ id: alwId, type: 'note', x: cx, y: y + NH.note / 2, label: `Sempre: ${ids}` })
      edges.push({ id: cid(), from: prevId, to: alwId })
      prevId = alwId
      y += NH.note + RGAP
    }

    // Decisões
    for (const dec of sec.decisions) {
      const decId = cid()
      nodes.push({ id: decId, type: 'decision', x: cx, y: y + NH.decision / 2, label: dec.question })
      edges.push({ id: cid(), from: prevId, to: decId })
      prevId = decId
      y += NH.decision + RGAP

      const totalW = (dec.answers.length - 1) * ANS_STEP
      const baseX = cx - totalW / 2
      const ansTopY = y
      let maxPkgH = 0

      for (let ai = 0; ai < dec.answers.length; ai++) {
        const ans = dec.answers[ai]
        const ansX = baseX + ai * ANS_STEP
        const ansId = cid()
        nodes.push({ id: ansId, type: 'process', x: ansX, y: ansTopY + NH.process / 2,
          label: ans.label + (ans.active ? ' ✓' : '') })
        edges.push({ id: cid(), from: decId, to: ansId, label: ans.label })

        const pkgs = ans.packages ?? []
        let localH = 0
        for (let pi = 0; pi < pkgs.length; pi++) {
          const pkg = pkgs[pi]
          const pkgCY = ansTopY + NH.process + RGAP + pi * PKG_RSTEP + NH.package / 2
          const pkgId = cid()
          nodes.push({ id: pkgId, type: 'package', x: ansX, y: pkgCY,
            label: `${pkg.id} · ${pkg.name}` })
          edges.push({ id: cid(), from: ansId, to: pkgId })
          localH = (pi + 1) * PKG_RSTEP
        }

        if (ans.sub?.length) {
          const subTopY = ansTopY + NH.process + RGAP + pkgs.length * PKG_RSTEP
          const subId = cid()
          nodes.push({ id: subId, type: 'note', x: ansX, y: subTopY + NH.note / 2,
            label: `↳ ${ans.sub.length} sub-decisão(ões)` })
          edges.push({ id: cid(), from: ansId, to: subId, dashed: true })
          localH = pkgs.length * PKG_RSTEP + RGAP + NH.note
        }

        maxPkgH = Math.max(maxPkgH, localH)
      }

      y += NH.process + (maxPkgH > 0 ? RGAP + maxPkgH : 0) + RGAP
    }
  }

  return { nodes, edges }
}

type Tool = 'cursor' | 'connect' | CanvasNodeType

const DEFAULT_LABEL: Record<string, string> = {
  start: 'Início', end: 'Fim', decision: 'Decisão',
  process: 'Processo', package: 'Pacote', note: 'Nota',
}

// ── Picker de pacote ──────────────────────────────────────────────────────────

function PkgPicker({ onPick, onClose }: { onPick: (label: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const pkgs = Object.values(PACKAGES)
  const filtered = q
    ? pkgs.filter(p => p.id.toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()))
    : pkgs
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
          <span className="text-sm font-semibold text-slate-100 flex-1">Selecionar pacote</span>
          <button onClick={onClose}><X size={14} className="text-slate-400" /></button>
        </div>
        <div className="px-4 py-2 border-b border-slate-700/60">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ID ou nome…"
            className="w-full text-xs bg-slate-800 rounded-lg px-3 py-1.5 text-slate-200 placeholder:text-slate-500 outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.slice(0, 150).map(p => (
            <button key={p.id} onClick={() => { onPick(`${p.id} · ${p.name}`); onClose() }}
              className="w-full flex items-center gap-3 px-4 py-1.5 hover:bg-slate-800 text-left">
              <span className="text-[10px] font-mono text-[#d97706] shrink-0 w-20">{p.id}</span>
              <span className="text-xs text-slate-300 truncate">{p.name}</span>
            </button>
          ))}
          {!filtered.length && <p className="text-xs text-slate-500 px-4 py-4">Nenhum encontrado.</p>}
        </div>
      </div>
    </div>
  )
}

// ── Modal simples de rótulo de seta ──────────────────────────────────────────

function EdgeLabelModal({ initial, onSave, onClose }: {
  initial: string; onSave: (v: string) => void; onClose: () => void
}) {
  const [val, setVal] = useState(initial)
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-80 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Rótulo da seta <span className="text-slate-500">(vazio para remover)</span></p>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(val); if (e.key === 'Escape') onClose() }}
          className="w-full text-sm bg-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none border border-slate-700 focus:border-[#d97706]/60" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-slate-400 px-3 py-1.5 rounded-lg border border-slate-700">Cancelar</button>
          <button onClick={() => onSave(val)} className="text-xs text-white bg-[#d97706] hover:bg-amber-600 px-3 py-1.5 rounded-lg font-semibold">OK</button>
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface Props { scopeId: string; canEdit: boolean; sections?: LSec[] }

export function LogicCanvasPanel({ scopeId, canEdit, sections }: Props) {
  const [nodes, setNodes] = useState<CanvasNode[]>([])
  const [edges, setEdges] = useState<CanvasEdge[]>([])
  const [tool, setTool] = useState<Tool>('cursor')
  const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null)
  const [pan, setPan] = useState({ x: 80, y: 80 })
  const [scale, setScale] = useState(1)
  const [panning, setPanning] = useState(false)
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })
  const [dragging, setDragging] = useState<{ id: string; ox: number; oy: number } | null>(null)
  const [connecting, setConnecting] = useState<{ fromId: string } | null>(null)
  const [mousePt, setMousePt] = useState({ x: 0, y: 0 })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [pkgPickForId, setPkgPickForId] = useState<string | null>(null)
  const [edgeLabelFor, setEdgeLabelFor] = useState<string | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const storageKey = `logic_canvas_v1_${scopeId}`

  // ── Persistência ────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const d: CanvasData = JSON.parse(raw)
        setNodes(d.nodes ?? [])
        setEdges(d.edges ?? [])
      } else {
        setNodes([]); setEdges([])
      }
    } catch { setNodes([]); setEdges([]) }
    setSelected(null); setConnecting(null); setEditingId(null)
  }, [storageKey])

  const persist = useCallback((ns: CanvasNode[], es: CanvasEdge[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify({ nodes: ns, edges: es })) } catch { /* ignore */ }
  }, [storageKey])

  // ── Coordenadas SVG ─────────────────────────────────────────────────────────

  const toPt = useCallback((cx: number, cy: number) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: (cx - r.left - pan.x) / scale, y: (cy - r.top - pan.y) / scale }
  }, [pan, scale])

  // ── Handlers do SVG ─────────────────────────────────────────────────────────

  const onSvgDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    if (editingId) { commitEdit(); return }

    const isBg = (e.target as SVGElement & { dataset: DOMStringMap }).dataset?.bg === '1' || e.target === svgRef.current
    if (!isBg) return

    if (tool === 'cursor') {
      setSelected(null)
      setPanning(true)
      setPanStart({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y })
      return
    }
    if (tool === 'connect') {
      setConnecting(null)
      return
    }

    // Inserir nó
    if (!canEdit) return
    const pt = toPt(e.clientX, e.clientY)
    const node: CanvasNode = {
      id: uid(), type: tool as CanvasNodeType,
      x: pt.x, y: pt.y,
      label: DEFAULT_LABEL[tool] ?? tool,
    }
    const ns = [...nodesRef.current, node]
    setNodes(ns); persist(ns, edgesRef.current)
    setSelected({ kind: 'node', id: node.id })
    if (tool === 'package') setTimeout(() => setPkgPickForId(node.id), 0)
  }

  const onSvgMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panning) {
      setPan({ x: panStart.px + e.clientX - panStart.mx, y: panStart.py + e.clientY - panStart.my })
    } else if (dragging) {
      const pt = toPt(e.clientX, e.clientY)
      setNodes(ns => ns.map(n => n.id === dragging.id
        ? { ...n, x: pt.x - dragging.ox, y: pt.y - dragging.oy } : n))
    }
    setMousePt(toPt(e.clientX, e.clientY))
  }

  const onSvgUp = () => {
    if (panning) setPanning(false)
    if (dragging) { persist(nodesRef.current, edgesRef.current); setDragging(null) }
  }

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const f = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const r = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    setScale(s => {
      const ns = Math.min(3, Math.max(0.12, s * f))
      setPan(p => ({ x: mx - (mx - p.x) * ns / s, y: my - (my - p.y) * ns / s }))
      return ns
    })
  }

  // ── Handlers dos nós ────────────────────────────────────────────────────────

  const onNodeDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (editingId) { commitEdit(); return }

    if (tool === 'connect') {
      if (!connecting) {
        setConnecting({ fromId: id })
      } else if (connecting.fromId !== id) {
        const edge: CanvasEdge = { id: uid(), from: connecting.fromId, to: id }
        const es = [...edgesRef.current, edge]
        setEdges(es); persist(nodesRef.current, es)
        setConnecting(null)
        setSelected({ kind: 'edge', id: edge.id })
      }
      return
    }

    if (tool === 'cursor') {
      setSelected({ kind: 'node', id })
      const node = nodesRef.current.find(n => n.id === id)
      if (!node) return
      const pt = toPt(e.clientX, e.clientY)
      setDragging({ id, ox: pt.x - node.x, oy: pt.y - node.y })
    }
  }

  const onNodeDblClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!canEdit) return
    const node = nodesRef.current.find(n => n.id === id)
    if (!node) return
    setTool('cursor')
    setEditingId(id)
    setEditVal(node.label)
    setTimeout(() => { editInputRef.current?.focus(); editInputRef.current?.select() }, 20)
  }

  const commitEdit = useCallback(() => {
    if (!editingId) return
    const ns = nodesRef.current.map(n => n.id === editingId
      ? { ...n, label: editVal.trim() || n.label } : n)
    setNodes(ns); persist(ns, edgesRef.current)
    setEditingId(null)
  }, [editingId, editVal, persist])

  // ── Handlers das setas ──────────────────────────────────────────────────────

  const onEdgeClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (editingId) { commitEdit(); return }
    setSelected({ kind: 'edge', id })
  }

  const onEdgeDblClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!canEdit) return
    setEdgeLabelFor(id)
  }

  const saveEdgeLabel = (label: string) => {
    const es = edgesRef.current.map(ed => ed.id === edgeLabelFor
      ? { ...ed, label: label.trim() || undefined } : ed)
    setEdges(es); persist(nodesRef.current, es)
    setEdgeLabelFor(null)
  }

  // ── Apagar selecionado ──────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    if (!selected || !canEdit) return
    if (selected.kind === 'node') {
      const ns = nodesRef.current.filter(n => n.id !== selected.id)
      const es = edgesRef.current.filter(e => e.from !== selected.id && e.to !== selected.id)
      setNodes(ns); setEdges(es); persist(ns, es)
    } else {
      const es = edgesRef.current.filter(e => e.id !== selected.id)
      setEdges(es); persist(nodesRef.current, es)
    }
    setSelected(null)
  }, [selected, canEdit, persist])

  // ── Teclas de atalho ────────────────────────────────────────────────────────

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return }
      if (e.key === 'Escape') { setConnecting(null); setEditingId(null); setTool('cursor'); return }

      const map: Record<string, Tool> = {
        v: 'cursor', c: 'connect', s: 'start', e: 'end',
        d: 'decision', p: 'process', a: 'package', n: 'note',
      }
      if (map[e.key.toLowerCase()]) { setTool(map[e.key.toLowerCase()]); setConnecting(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [deleteSelected])

  // ── Ajustar à tela ──────────────────────────────────────────────────────────

  const fitView = (ns?: CanvasNode[]) => {
    const targets = ns ?? nodes
    if (!targets.length || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    const xs = targets.flatMap(n => [n.x - NW[n.type] / 2, n.x + NW[n.type] / 2])
    const ys = targets.flatMap(n => [n.y - NH[n.type] / 2, n.y + NH[n.type] / 2])
    const bx = Math.min(...xs), bX = Math.max(...xs)
    const by = Math.min(...ys), bY = Math.max(...ys)
    const pad = 48
    const s = Math.min(3, (r.width - pad * 2) / (bX - bx || 1), (r.height - pad * 2) / (bY - by || 1))
    setScale(s)
    setPan({ x: r.width / 2 - ((bx + bX) / 2) * s, y: r.height / 2 - ((by + bY) / 2) * s })
  }

  const importFromSections = () => {
    if (!sections?.length) return
    if (nodes.length > 0 && !confirm('O canvas já tem elementos. Substituir pelo conteúdo do Fluxo Estruturado?')) return
    const data = sectionsToCanvas(sections)
    setNodes(data.nodes)
    setEdges(data.edges)
    persist(data.nodes, data.edges)
    setSelected(null)
    setConnecting(null)
    setTimeout(() => fitView(data.nodes), 50)
  }

  // ── Renderização de nós ─────────────────────────────────────────────────────

  const renderNode = (node: CanvasNode) => {
    const w = NW[node.type], h = NH[node.type], hw = w / 2, hh = h / 2
    const c = COL[node.type]
    const sel = selected?.id === node.id && selected.kind === 'node'
    const bd = sel ? '#d97706' : c.bd
    const sw = sel ? 2.5 : 1.5
    const isConn = tool === 'connect'
    const prps = {
      onMouseDown: (e: React.MouseEvent) => onNodeDown(e, node.id),
      onDoubleClick: (e: React.MouseEvent) => onNodeDblClick(e, node.id),
      style: { cursor: tool === 'cursor' ? 'move' : isConn ? 'crosshair' : 'default' },
    }
    const lbl = node.label
    const maxCh = node.type === 'package' ? 30 : 22
    const display = lbl.length > maxCh ? lbl.slice(0, maxCh - 1) + '…' : lbl
    const txt = { fill: c.tx, fontSize: 10, fontFamily: 'sans-serif', pointerEvents: 'none' as const, style: { userSelect: 'none' as const } }

    // Halo de seleção + forma específica
    if (node.type === 'decision') {
      const pts = `${node.x},${node.y - hh} ${node.x + hw},${node.y} ${node.x},${node.y + hh} ${node.x - hw},${node.y}`
      return (
        <g key={node.id} {...prps}>
          {sel && <polygon points={pts} fill="none" stroke="#d97706" strokeWidth={7} opacity={0.18} />}
          <polygon points={pts} fill={c.bg} stroke={bd} strokeWidth={sw} />
          <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" {...txt}>{display}</text>
          {isConn && <polygon points={pts} fill="#d97706" opacity={0.08} />}
        </g>
      )
    }

    if (node.type === 'start' || node.type === 'end') {
      return (
        <g key={node.id} {...prps}>
          {sel && <rect x={node.x - hw - 4} y={node.y - hh - 4} width={w + 8} height={h + 8} rx={hh + 4} fill="none" stroke="#d97706" strokeWidth={5} opacity={0.18} />}
          <rect x={node.x - hw} y={node.y - hh} width={w} height={h} rx={hh} fill={c.bg} stroke={bd} strokeWidth={sw} />
          <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" fontWeight="600" {...txt}>{display}</text>
          {isConn && <rect x={node.x - hw} y={node.y - hh} width={w} height={h} rx={hh} fill="#d97706" opacity={0.08} />}
        </g>
      )
    }

    if (node.type === 'package') {
      return (
        <g key={node.id} {...prps}>
          {sel && <rect x={node.x - hw - 4} y={node.y - hh - 4} width={w + 8} height={h + 8} rx={7} fill="none" stroke="#d97706" strokeWidth={5} opacity={0.18} />}
          <rect x={node.x - hw} y={node.y - hh} width={w} height={h} rx={4} fill={c.bg} stroke={bd} strokeWidth={sw} />
          <rect x={node.x - hw} y={node.y - hh} width={7} height={h} rx={3} fill={c.bd} opacity={0.55} />
          <text x={node.x - hw + 15} y={node.y} dominantBaseline="middle" {...txt} fontFamily="monospace">{display}</text>
          {isConn && <rect x={node.x - hw} y={node.y - hh} width={w} height={h} rx={4} fill="#d97706" opacity={0.08} />}
        </g>
      )
    }

    if (node.type === 'note') {
      const fold = 13
      const pts = [
        `${node.x - hw},${node.y - hh}`,
        `${node.x + hw - fold},${node.y - hh}`,
        `${node.x + hw},${node.y - hh + fold}`,
        `${node.x + hw},${node.y + hh}`,
        `${node.x - hw},${node.y + hh}`,
      ].join(' ')
      return (
        <g key={node.id} {...prps}>
          {sel && <polygon points={pts} fill="none" stroke="#d97706" strokeWidth={5} opacity={0.18} />}
          <polygon points={pts} fill={c.bg} stroke={bd} strokeWidth={sw} />
          <polyline
            points={`${node.x + hw - fold},${node.y - hh} ${node.x + hw - fold},${node.y - hh + fold} ${node.x + hw},${node.y - hh + fold}`}
            fill="none" stroke={bd} strokeWidth={1} opacity={0.35} />
          <text x={node.x - hw + 9} y={node.y} dominantBaseline="middle" {...txt}>{display}</text>
          {isConn && <polygon points={pts} fill="#d97706" opacity={0.08} />}
        </g>
      )
    }

    // process (default)
    return (
      <g key={node.id} {...prps}>
        {sel && <rect x={node.x - hw - 4} y={node.y - hh - 4} width={w + 8} height={h + 8} rx={9} fill="none" stroke="#d97706" strokeWidth={5} opacity={0.18} />}
        <rect x={node.x - hw} y={node.y - hh} width={w} height={h} rx={6} fill={c.bg} stroke={bd} strokeWidth={sw} />
        <text x={node.x} y={node.y} textAnchor="middle" dominantBaseline="middle" {...txt}>{display}</text>
        {isConn && <rect x={node.x - hw} y={node.y - hh} width={w} height={h} rx={6} fill="#d97706" opacity={0.08} />}
      </g>
    )
  }

  // ── Renderização de setas ───────────────────────────────────────────────────

  const renderEdge = (edge: CanvasEdge) => {
    const from = nodes.find(n => n.id === edge.from)
    const to = nodes.find(n => n.id === edge.to)
    if (!from || !to) return null
    const p1 = edgePoint(from, to.x, to.y)
    const p2 = edgePoint(to, from.x, from.y)
    const sel = selected?.id === edge.id && selected.kind === 'edge'
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2
    const stroke = sel ? '#d97706' : '#475569'
    const markerId = sel ? 'arr-sel' : 'arr'
    return (
      <g key={edge.id}
        onClick={(e) => onEdgeClick(e, edge.id)}
        onDoubleClick={(e) => onEdgeDblClick(e, edge.id)}
        style={{ cursor: 'pointer' }}>
        {/* hit area */}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="transparent" strokeWidth={14} />
        {sel && <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#d97706" strokeWidth={6} opacity={0.18} />}
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke={stroke} strokeWidth={sel ? 2.5 : 1.5}
          strokeDasharray={edge.dashed ? '7,3' : undefined}
          markerEnd={`url(#${markerId})`} />
        {edge.label && (
          <text x={mx} y={my - 8} textAnchor="middle" fill={sel ? '#d97706' : '#64748b'}
            fontSize={9} fontFamily="sans-serif" style={{ userSelect: 'none' }}>
            {edge.label}
          </text>
        )}
      </g>
    )
  }

  // ── Posição do editor inline de rótulo ──────────────────────────────────────

  const editNode = editingId ? nodes.find(n => n.id === editingId) : null
  const editSX = editNode ? editNode.x * scale + pan.x : 0
  const editSY = editNode ? editNode.y * scale + pan.y : 0
  const editSW = editNode ? NW[editNode.type] * scale : 120

  // ── Definição dos itens da barra de ferramentas ─────────────────────────────

  type ToolDef = { id: Tool; glyph: string; title: string; color: string; group: number }
  const TOOL_DEFS: ToolDef[] = [
    { id: 'cursor',   glyph: '↖',  title: 'Selecionar / Mover  [V]', color: '#94a3b8', group: 0 },
    { id: 'connect',  glyph: '→',  title: 'Conectar — clique na origem → destino  [C]', color: '#94a3b8', group: 0 },
    { id: 'start',    glyph: '◎',  title: 'Início — clique para inserir  [S]', color: COL.start.tx, group: 1 },
    { id: 'end',      glyph: '✕',  title: 'Fim — clique para inserir  [E]', color: COL.end.tx, group: 1 },
    { id: 'decision', glyph: '◇',  title: 'Decisão (losango) — clique para inserir  [D]', color: COL.decision.tx, group: 1 },
    { id: 'process',  glyph: '▭',  title: 'Processo — clique para inserir  [P]', color: COL.process.tx, group: 1 },
    { id: 'package',  glyph: '▣',  title: 'Pacote — abre seletor de pacote  [A]', color: COL.package.tx, group: 1 },
    { id: 'note',     glyph: '✏',  title: 'Nota — clique para inserir  [N]', color: COL.note.tx, group: 1 },
  ]

  const toggleDashedEdge = () => {
    if (!selected || selected.kind !== 'edge') return
    const es = edgesRef.current.map(ed => ed.id === selected.id ? { ...ed, dashed: !ed.dashed } : ed)
    setEdges(es); persist(nodesRef.current, es)
  }

  const clearCanvas = () => {
    if (!canEdit) return
    if (!confirm('Apagar todos os elementos do canvas?')) return
    setNodes([]); setEdges([]); persist([], [])
    setSelected(null); setConnecting(null)
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative select-none">

      {/* ── Barra de ferramentas ─────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/80 border-b border-slate-700/50">

        {/* Grupo 0: cursor + connect */}
        <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-xl p-0.5">
          {TOOL_DEFS.filter(t => t.group === 0).map(t => (
            <button key={t.id} title={t.title}
              onClick={() => { setTool(t.id); setConnecting(null) }}
              className={`w-8 h-7 rounded-lg text-sm font-bold flex items-center justify-center transition-all
                ${tool === t.id
                  ? 'bg-[#d97706] text-slate-900 shadow'
                  : 'hover:bg-slate-700/60'}`}
              style={{ color: tool === t.id ? '#1e293b' : t.color }}>
              {t.glyph}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-slate-700/50" />

        {/* Grupo 1: formas (só em modo edição) */}
        <div className="flex items-center gap-0.5 bg-slate-800/60 rounded-xl p-0.5">
          {canEdit ? TOOL_DEFS.filter(t => t.group === 1).map(t => (
            <button key={t.id} title={t.title}
              onClick={() => { setTool(t.id); setConnecting(null) }}
              className={`w-8 h-7 rounded-lg text-sm font-bold flex items-center justify-center transition-all
                ${tool === t.id
                  ? 'bg-[#d97706] text-slate-900 shadow'
                  : 'hover:bg-slate-700/60'}`}
              style={{ color: tool === t.id ? '#1e293b' : t.color }}>
              {t.glyph}
            </button>
          )) : (
            <span className="text-[9px] text-slate-500 px-2">somente leitura</span>
          )}
        </div>

        <div className="w-px h-5 bg-slate-700/50" />

        {/* Ações contextuais */}
        {canEdit && (
          <>
            <button title="Excluir selecionado  [Del]"
              disabled={!selected}
              onClick={deleteSelected}
              className="w-8 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 disabled:opacity-25 transition-colors">
              <Trash2 size={13} />
            </button>
            {selected?.kind === 'edge' && (
              <button title="Alternar seta tracejada"
                onClick={toggleDashedEdge}
                className="px-2 h-7 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 border border-dashed border-slate-600 transition-colors">
                - - -
              </button>
            )}
            {selected?.kind === 'edge' && (
              <button title="Editar rótulo da seta"
                onClick={() => setEdgeLabelFor(selected.id)}
                className="px-2 h-7 rounded-lg text-[10px] text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors">
                rótulo
              </button>
            )}
          </>
        )}

        <div className="w-px h-5 bg-slate-700/50" />

        {/* Importar do fluxo estruturado */}
        {sections && sections.length > 0 && (
          <button
            title="Importar estrutura do Fluxo Estruturado como canvas editável"
            onClick={importFromSections}
            className="flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-[10px] font-semibold text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 border border-amber-700/40 hover:border-amber-500/60 transition-colors">
            ↓ importar fluxo
          </button>
        )}

        <div className="w-px h-5 bg-slate-700/50" />

        {/* Controles de zoom */}
        <button title="Zoom +" onClick={() => setScale(s => Math.min(3, s * 1.2))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors text-sm font-bold">
          +
        </button>
        <button title="Zoom −" onClick={() => setScale(s => Math.max(0.12, s / 1.2))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors text-sm font-bold">
          −
        </button>
        <button title="Ajustar à tela" onClick={fitView}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors text-xs font-bold">
          ⊡
        </button>

        {/* Status */}
        <div className="ml-auto flex items-center gap-3 text-[10px]">
          {connecting && (
            <span className="text-amber-400 animate-pulse font-medium">● clique no nó destino…</span>
          )}
          {tool !== 'cursor' && tool !== 'connect' && canEdit && (
            <span className="text-slate-500">clique na tela para inserir · <kbd className="text-slate-400 bg-slate-800 px-0.5 rounded">Esc</kbd> cancela</span>
          )}
          <span className="text-slate-600">{Math.round(scale * 100)}%</span>
          <span className="text-slate-600">{nodes.length}n · {edges.length}e</span>
          {canEdit && nodes.length > 0 && (
            <button onClick={clearCanvas} title="Limpar canvas" className="text-slate-700 hover:text-rose-500 transition-colors">✕ limpar</button>
          )}
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <svg
          ref={svgRef}
          width="100%" height="100%"
          className={`bg-slate-950 ${panning ? 'cursor-grabbing' : tool === 'cursor' ? 'cursor-default' : 'cursor-crosshair'}`}
          onMouseDown={onSvgDown}
          onMouseMove={onSvgMove}
          onMouseUp={onSvgUp}
          onMouseLeave={onSvgUp}
          onWheel={onWheel}>

          <defs>
            {/* Grade de pontos que acompanha o pan */}
            <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"
              x={((pan.x % 24) + 24) % 24} y={((pan.y % 24) + 24) % 24}>
              <circle cx="1" cy="1" r="0.7" fill="#334155" opacity="0.55" />
            </pattern>
            {/* Marcadores de seta */}
            <marker id="arr" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
              <path d="M0,0.5 L0,5.5 L7,3 z" fill="#475569" />
            </marker>
            <marker id="arr-sel" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
              <path d="M0,0.5 L0,5.5 L7,3 z" fill="#d97706" />
            </marker>
            <marker id="arr-preview" markerWidth="7" markerHeight="7" refX="5.5" refY="3" orient="auto">
              <path d="M0,0.5 L0,5.5 L7,3 z" fill="#d97706" opacity="0.6" />
            </marker>
          </defs>

          {/* Fundo com grade */}
          <rect width="100%" height="100%" fill="url(#dots)" data-bg="1" />

          {/* Grupo transformado (pan + scale) */}
          <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>

            {/* Setas */}
            {edges.map(renderEdge)}

            {/* Preview de conexão em curso */}
            {connecting && (() => {
              const from = nodes.find(n => n.id === connecting.fromId)
              if (!from) return null
              const p = edgePoint(from, mousePt.x, mousePt.y)
              return (
                <line x1={p.x} y1={p.y} x2={mousePt.x} y2={mousePt.y}
                  stroke="#d97706" strokeWidth={1.5} strokeDasharray="6,3" opacity={0.75}
                  markerEnd="url(#arr-preview)" pointerEvents="none" />
              )
            })()}

            {/* Nós */}
            {nodes.map(renderNode)}
          </g>
        </svg>

        {/* Editor inline de rótulo (overlay absoluto sobre o SVG) */}
        {editingId && editNode && (
          <div className="absolute z-30" style={{
            left: editSX - editSW / 2,
            top: editSY - 14,
            width: editSW,
          }}>
            <input
              ref={editInputRef}
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') setEditingId(null)
              }}
              className="w-full text-xs bg-slate-800/95 border border-[#d97706] rounded-lg px-2 py-1 text-slate-100 outline-none text-center shadow-xl backdrop-blur-sm"
            />
          </div>
        )}

        {/* Estado vazio */}
        {nodes.length === 0 && !connecting && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-4">
              {/* Importar do fluxo — botão primário quando há seções */}
              {sections && sections.length > 0 ? (
                <div className="space-y-3">
                  <div className="text-3xl tracking-widest opacity-30">◇ ▭ ▣</div>
                  <button
                    onClick={importFromSections}
                    className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl bg-[#d97706] hover:bg-amber-500 text-slate-900 text-sm font-semibold shadow-lg transition-colors">
                    ↓ Importar estrutura do Fluxo Estruturado
                  </button>
                  {canEdit && (
                    <p className="text-[10px] text-slate-600">
                      ou selecione uma forma na barra e clique na tela para começar do zero
                    </p>
                  )}
                </div>
              ) : (
                <div className="opacity-25 space-y-2">
                  <div className="text-4xl tracking-widest">◇ ▭ ▣</div>
                  <p className="text-xs text-slate-400">
                    {canEdit
                      ? 'Selecione uma forma na barra de ferramentas e clique na tela para inserir'
                      : 'Canvas vazio'}
                  </p>
                  {canEdit && (
                    <p className="text-[10px] text-slate-500">
                      V · cursor · C · conectar · D · decisão · P · processo · A · pacote · N · nota
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modais ──────────────────────────────────────────────────────────── */}
      {pkgPickForId && (
        <PkgPicker
          onPick={label => {
            const ns = nodesRef.current.map(n => n.id === pkgPickForId ? { ...n, label } : n)
            setNodes(ns); persist(ns, edgesRef.current)
          }}
          onClose={() => setPkgPickForId(null)}
        />
      )}
      {edgeLabelFor && (() => {
        const edge = edges.find(e => e.id === edgeLabelFor)
        return (
          <EdgeLabelModal
            initial={edge?.label ?? ''}
            onSave={saveEdgeLabel}
            onClose={() => setEdgeLabelFor(null)}
          />
        )
      })()}
    </div>
  )
}
