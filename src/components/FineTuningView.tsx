import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import {
  Plus, Minus, ChevronDown, ChevronRight, ChevronUp,
  X, Trash2, Check, Undo2, Redo2, FileText, Download, Search, PencilLine,
  PanelLeftOpen, PanelRightClose, PanelRightOpen, GripVertical,
} from 'lucide-react'

import { useApp, lineIdsForLocate, NAV_PACKAGE_IDS, type LocateTarget } from '../context/AppContext'
import type { FineTuningItem, FineTuningLine, WizardInputs, Phase } from '../types'
import { ProjectDataPanel } from './ProjectDataPanel'
import { GanttChart } from './ScheduleView'
import { PACKAGES, getAllPackages } from '../data/packages'
import { EDS_TYPES } from '../data/edsTypes'
import { SCOPE_LABEL } from '../data/scopeLabels'
import { buildProjectFacts } from '../utils/projectFacts'
import {
  owFases, owAtividades, owOperacoes, owEtapas,
  isOntologyMismatch, expectedOwFase, countMismatches,
} from '../utils/ontologyReview'
import { BiDetail } from 'react-icons/bi'
// ── Constants ─────────────────────────────────────────────────────────────────
// Corretor de ontologia (correção automática via "Revisar ontologia" → FT_REVIEW_ONTOLOGY)
// desativado temporariamente. O alerta de erro na fase (realce âmbar do campo OW Fase em
// LineOntologyCell) continua ativo — só a correção automática está suspensa. Reative com `true`.
const ONTOLOGY_CORRECTOR_ENABLED = false
const TECH_LABEL: Record<string, string> = {
  wireline: 'SL', ct: 'FT', electric: 'WL', workstring: 'Coluna', bop: 'BOP', none: '',
}
const TECH_COLORS: Record<string, string> = {
  wireline:   'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
  ct:         'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300',
  electric:   'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300',
  workstring: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300',
  bop:        'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300',
  none:       '',
}

type ScheduleColumn = 'number' | 'package' | 'type' | 'description' | 'firm' | 'contingency' | 'total'

// ── Phase colors — full palette, mirrors step 2 ───────────────────────────────
const PHASE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  'Mobilização':    { bg: 'bg-[#f5f5f5] dark:bg-slate-800',   text: 'text-slate-600 dark:text-slate-300',   bar: 'bg-slate-400'  },
  'Fase 0':         { bg: 'bg-[#fafafa] dark:bg-slate-950',    text: 'text-slate-700 dark:text-slate-400',   bar: 'bg-slate-600'  },
  'Fase 1A':        { bg: 'bg-sky-50 dark:bg-sky-950',        text: 'text-sky-800 dark:text-sky-400',       bar: 'bg-sky-600'    },
  'Fase 1B':        { bg: 'bg-cyan-50 dark:bg-cyan-950',      text: 'text-cyan-800 dark:text-cyan-400',     bar: 'bg-cyan-500'   },
  'Fase 2':         { bg: 'bg-teal-50 dark:bg-teal-950',      text: 'text-teal-800 dark:text-teal-400',     bar: 'bg-teal-500'   },
  'Extra Abandono': { bg: 'bg-violet-50 dark:bg-violet-950',  text: 'text-violet-800 dark:text-violet-400', bar: 'bg-violet-500' },
  'Desmobilização': { bg: 'bg-[#f5f5f5] dark:bg-slate-800',   text: 'text-slate-600 dark:text-slate-300',   bar: 'bg-slate-400'  },
}

// ── Clone helpers ─────────────────────────────────────────────────────────────
function clonePkg(item: FineTuningItem): FineTuningItem {
  const uid = `clone_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return { ...item, uid, lines: item.lines.map((l, i) => ({ ...l, id: `${uid}_l${i}` })) }
}
function cloneLine(line: FineTuningLine, pkgUid: string, salt: number): FineTuningLine {
  return { ...line, id: `${pkgUid}_lc${Date.now()}_${salt}` }
}
type CopyBuffer =
  | { kind: 'pkg';  items: FineTuningItem[] }
  | { kind: 'line'; lines: FineTuningLine[] }

// ── DnD types ─────────────────────────────────────────────────────────────────
type DndDrag = { kind: 'pkg'; uid: string } | { kind: 'line'; uid: string; lineId: string }
type DndDrop = { kind: 'pkg'; uid: string; pos: 'above' | 'below' } | { kind: 'line'; uid: string; lineId: string; pos: 'above' | 'below' }

function DropIndicatorRow({ colSpan = 7 }: { colSpan?: number }) {
  return (
    <tr className="pointer-events-none select-none" aria-hidden>
      <td colSpan={colSpan} className="p-0 h-0 relative">
        <div className="absolute inset-x-1 top-0 h-0.5 bg-blue-500 rounded-full z-20" />
      </td>
    </tr>
  )
}

// ── Inline editable field ─────────────────────────────────────────────────────
function InlineEdit({
  value, onCommit, className = '', inputClassName = '', type = 'text', placeholder = '', editKey, onEnterCommit, onEditStart, style,
}: {
  value: string; onCommit: (v: string) => void
  className?: string; inputClassName?: string; type?: 'text' | 'number'; placeholder?: string
  editKey?: number
  onEnterCommit?: () => void
  onEditStart?: () => void
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.select() }, [editing])
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => {
    if (editKey) {
      setDraft(value)
      setEditing(true)
      onEditStart?.()
    }
  }, [editKey])

  const commit = () => { setEditing(false); if (draft !== value) onCommit(draft) }

  if (!editing) return (
    <span
      className={`cursor-text hover:bg-slate-100 dark:hover:bg-slate-700 rounded px-0.5 transition-colors ${className}`}
      style={style}
      onClick={() => { onEditStart?.(); setDraft(value); setEditing(true) }}
      title="Clique para editar">
      {value || <span className="text-slate-500 dark:text-slate-600 italic">{placeholder}</span>}
    </span>
  )
  return (
    <input
      ref={ref} type={type} value={draft} placeholder={placeholder}
      onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { commit(); onEnterCommit?.() }
        if (e.key === 'Escape') setEditing(false)
      }}
      className={`outline-none border border-blue-400 rounded px-1 bg-[#f5f5f5] dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${inputClassName}`}
    />
  )
}


function ParallelLinesIcon() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none" className="pointer-events-none">
      <line x1="1" y1="3" x2="11" y2="3" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" />
      <line x1="1" y1="7" x2="11" y2="7" strokeWidth="1.5" stroke="currentColor" strokeLinecap="round" />
    </svg>
  )
}


function lineIsCont(line: FineTuningLine, pkgIsCont: boolean): boolean {
  return pkgIsCont || !!line.isContingency
}

// Retorna true quando todas as linhas não-nav do pacote estão marcadas como paralelas.
function allLinesParallel(item: FineTuningItem): boolean {
  const opLines = item.lines.filter(l => !l.isNavLine)
  return opLines.length > 0 && opLines.every(l => l.isParallel)
}

function pkgFirme(item: FineTuningItem): number {
  if (item.isBlank) return 0
  if (item.isContingency) return 0
  if (item.isParallel) return 0
  if (NAV_PACKAGE_IDS.has(item.packageId)) return 0
  if (item.lines.length === 0) return item.duration
  const hasTime = item.lines.some(l => (l.duration ?? 0) > 0)
  // Quando nenhuma linha tem duração individual: se todas as linhas forem paralelas,
  // o pacote não contribui com tempo firme.
  if (!hasTime) return allLinesParallel(item) ? 0 : item.duration
  return item.lines.filter(l => !lineIsCont(l, false) && !l.isParallel).reduce((s, l) => s + (l.duration ?? 0), 0)
}
function pkgCont(item: FineTuningItem): number {
  if (item.isBlank) return 0
  if (item.isParallel) return 0
  if (item.lines.length === 0) return item.isContingency ? item.duration : 0
  const hasTime = item.lines.some(l => (l.duration ?? 0) > 0)
  if (!hasTime) return (!allLinesParallel(item) && item.isContingency) ? item.duration : 0
  if (item.isContingency) return item.lines.filter(l => !l.isParallel).reduce((s, l) => s + (l.duration ?? 0), 0)
  return item.lines.filter(l => l.isContingency && !l.isParallel).reduce((s, l) => s + (l.duration ?? 0), 0)
}

const CONTING_TEXT = 'text-[#7d1935] dark:text-rose-400'

function hasIncompleteOntology(line: FineTuningLine, phase: Phase): boolean {
  if (line.isNavLine) return false
  if (!expectedOwFase(phase)) return false
  return !line.owFase || !line.owAtividade || !line.owOperacao || !line.owEtapa
}

// ── Row highlight colors ───────────────────────────────────────────────────────
// Tema claro: o realce pinta o FUNDO da linha (bg). Tema escuro: pinta o TEXTO
// (text) com tons claros de alto contraste, sem mexer no fundo.
type HighlightKey = 'yellow' | 'green' | 'blue' | 'orange' | 'rose'
type HighlightDef = { bg: string; text: string; ring: string; label: string }
const HIGHLIGHT_COLORS_LIGHT: Record<HighlightKey, HighlightDef> = {
  yellow: { bg: '#fde047', text: '#713f12', ring: '#ca8a04', label: 'Amarelo' },
  green:  { bg: '#bbf7d0', text: '#15803d', ring: '#16a34a', label: 'Verde'   },
  blue:   { bg: '#e2e8f0', text: '#334155', ring: '#94a3b8', label: 'Branco'  },
  orange: { bg: '#cffafe', text: '#155e75', ring: '#0891b2', label: 'Ciano'   },
  rose:   { bg: '#fae8ff', text: '#a21caf', ring: '#c026d3', label: 'Fúcsia'  },
}
const HIGHLIGHT_COLORS_DARK: Record<HighlightKey, HighlightDef> = {
  yellow: { bg: '', text: '#fde047', ring: '#fde047', label: 'Amarelo' },  // amarelo forte
  green:  { bg: '', text: '#00ff41', ring: '#00ff41', label: 'Verde'   },  // verde Matrix
  blue:   { bg: '', text: '#ffffff', ring: '#ffffff', label: 'Branco'  },  // branco (azul = cor padrão das operações)
  orange: { bg: '', text: '#22d3ee', ring: '#22d3ee', label: 'Ciano'   },
  rose:   { bg: '', text: '#d43bf6', ring: '#d43bf6', label: 'Fúcsia'  },
}
const isDarkMode = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
const getHighlightColors = () => isDarkMode() ? HIGHLIGHT_COLORS_DARK : HIGHLIGHT_COLORS_LIGHT
const HIGHLIGHT_KEYS: HighlightKey[] = ['yellow', 'green', 'blue', 'orange', 'rose']

// Estilo do realce numa linha (<tr>): fundo só no tema claro.
const highlightRowStyle = (key?: HighlightKey | null): React.CSSProperties | undefined =>
  (!key || isDarkMode()) ? undefined : { backgroundColor: HIGHLIGHT_COLORS_LIGHT[key].bg }
// Estilo do realce no texto: cor só no tema escuro.
const highlightTextStyle = (key?: HighlightKey | null): React.CSSProperties | undefined =>
  (!key || !isDarkMode()) ? undefined : { color: HIGHLIGHT_COLORS_DARK[key].text }
// Realce de um pacote = realce comum a todas as suas linhas (se uniforme).
const pkgHighlight = (item: FineTuningItem): HighlightKey | undefined => {
  if (item.lines.length === 0) return undefined
  const h = item.lines[0].highlight
  return h && item.lines.every(l => l.highlight === h) ? (h as HighlightKey) : undefined
}

const MOUNT_IDS = new Set(Object.values(PACKAGES).filter(p => p.isMountOp).map(p => p.id))
const DISMOUNT_IDS = new Set(Object.values(PACKAGES).filter(p => p.isDismountOp).map(p => p.id))
const MOUNT_TECH_LABELS: Record<string, string> = { wireline: 'Arame', electric: 'Perfil', ct: 'FT' }
const TRACKED_MOUNT_TECHS = ['wireline', 'electric', 'ct'] as const

// Normaliza texto para busca: remove acentos e caixa
const normalizeFind = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// ── Expand/collapse all toolbar ───────────────────────────────────────────────
// ── Detail panels ─────────────────────────────────────────────────────────────
// Opções do seletor "Tipo de EDS" — derivadas da fonte única EDS_TYPES (índice 0-based).
const EDS_OPTIONS: { value: number; label: string }[] = EDS_TYPES.map((label, value) => ({ value, label }))

function DetailField({ label, value, onChange, rows = 3, resetKey = 0, grow = false }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; resetKey?: number; grow?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  // Sync external value changes only when the field is not focused
  useEffect(() => {
    if (ref.current && document.activeElement === ref.current) return
    setDraft(value)
  }, [value])

  // resetKey forces reset (e.g. on cancel in multi-select confirmation)
  useEffect(() => { setDraft(value) }, [resetKey])  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`flex flex-col gap-1 ${grow ? 'flex-1 min-h-[110px]' : ''}`}>
      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{label}</label>
      <textarea
        ref={ref}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onChange(draft) }}
        rows={grow ? undefined : rows}
        className={`text-xs text-slate-700 dark:text-slate-200 bg-[#fafafa] dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder:text-slate-500 dark:placeholder:text-slate-600 ${grow ? 'flex-1 min-h-0' : ''}`}
        placeholder="..."
      />
    </div>
  )
}

// ── Rich text field with toolbar and image-paste support ──────────────────────
const RICH_COLORS: { label: string; value: string }[] = [
  { label: 'Preto (branco no tema escuro)', value: '#ffffff' },
  { label: 'Vermelho',                      value: '#dc2626' },
  { label: 'Azul',                          value: '#1d4ed8' },
]
const RICH_FONT_SIZES: { label: string; value: string }[] = [
  { label: '8',  value: '1' },
  { label: '10', value: '2' },
  { label: '12', value: '3' },
  { label: '14', value: '4' },
  { label: '18', value: '5' },
  { label: '24', value: '6' },
  { label: '36', value: '7' },
]

function RichTextField({ label, value, onChange, resetKey = 0 }: {
  label: string; value: string; onChange: (v: string) => void; resetKey?: number
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const lastValueRef = useRef(value)
  const [fontSize, setFontSize] = useState('')
  const [colorOpen, setColorOpen] = useState(false)
  const colorBtnRef = useRef<HTMLButtonElement>(null)

  // Initialize on mount
  useLayoutEffect(() => {
    const el = editorRef.current
    if (el) { el.innerHTML = value; lastValueRef.current = value }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external value when not focused
  useEffect(() => {
    const el = editorRef.current
    if (!el || document.activeElement === el) return
    if (value !== lastValueRef.current) { el.innerHTML = value; lastValueRef.current = value }
  }, [value])

  // Force reset (cancelled multi-edit)
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = value; lastValueRef.current = value
  }, [resetKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    const html = editorRef.current?.innerHTML ?? ''
    if (html !== lastValueRef.current) { lastValueRef.current = html; onChange(html) }
  }

  const exec = (cmd: string, arg?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, arg)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const imgItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const file = imgItem.getAsFile()
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      exec('insertHTML', `<img src="${src}" style="max-width:100%;border-radius:4px;margin:4px 0;" />`)
      commit()
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-col gap-1 flex-1 min-h-0">
      <label className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest shrink-0">{label}</label>
      <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden focus-within:ring-1 focus-within:ring-blue-400">
        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-1 px-1.5 py-1 bg-[#f5f5f5] dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <button type="button" title="Negrito (Ctrl+B)"
            onMouseDown={e => { e.preventDefault(); exec('bold') }}
            className="w-6 h-6 flex items-center justify-center rounded text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            B
          </button>
          <button type="button" title="Itálico (Ctrl+I)"
            onMouseDown={e => { e.preventDefault(); exec('italic') }}
            className="w-6 h-6 flex items-center justify-center rounded text-xs italic text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
            I
          </button>
          <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-600 shrink-0" />
          <select value={fontSize} title="Tamanho da fonte"
            onMouseDown={e => e.stopPropagation()}
            onChange={e => {
              const v = e.target.value
              if (!v) return
              exec('fontSize', v)
              setFontSize('')
              setTimeout(() => editorRef.current?.focus(), 0)
            }}
            className="h-6 text-[10px] rounded px-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 outline-none cursor-pointer">
            <option value="">Tam.</option>
            {RICH_FONT_SIZES.map(s => <option key={s.value} value={s.value}>{s.label}px</option>)}
          </select>
          <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-600 shrink-0" />
          <button ref={colorBtnRef} type="button" title="Cor do texto"
            onMouseDown={e => { e.preventDefault(); setColorOpen(o => !o) }}
            className={`h-6 px-1.5 flex items-center gap-1 rounded border transition-colors cursor-pointer text-[10px] ${colorOpen ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-300' : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300'}`}>
            Cor
            <svg width="8" height="5" viewBox="0 0 8 5" className="text-slate-400 shrink-0"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round"/></svg>
          </button>
          {colorOpen && RICH_COLORS.map(c => (
            <button key={c.value} type="button" title={c.label}
              onMouseDown={e => {
                e.preventDefault()
                exec('foreColor', c.value)
                setColorOpen(false)
                setTimeout(() => editorRef.current?.focus(), 0)
              }}
              style={{ backgroundColor: c.value }}
              className="w-5 h-5 rounded-full border-2 border-slate-300 dark:border-slate-500 hover:scale-110 transition-transform shadow-sm shrink-0"
            />
          ))}
          <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-600 shrink-0" />
          <button type="button" title="Limpar formatação"
            onMouseDown={e => { e.preventDefault(); exec('removeFormat') }}
            className="h-6 px-1.5 flex items-center justify-center rounded text-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors font-medium whitespace-nowrap">
            Limpar
          </button>
        </div>
        {/* Editable area */}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onPaste={handlePaste}
          onBlur={commit}
          className="flex-1 min-h-[80px] text-xs text-slate-700 dark:text-slate-200 bg-[#fafafa] dark:bg-slate-800 px-2 py-1.5 focus:outline-none overflow-y-auto"
        />
      </div>
    </div>
  )
}

function LineDetailPanel({ uid, lineId, checkedLines, onCollapse }: { uid: string; lineId: string; checkedLines: Set<string>; onCollapse?: () => void }) {
  const { state, dispatch } = useApp()
  const item = state.fineTuningItems.find(i => i.uid === uid)
  const line = item?.lines.find(l => l.id === lineId)

  type MultiPatch = Partial<Pick<FineTuningLine, 'procedures' | 'details' | 'bha'>>
  const [pendingEdit, setPendingEdit] = useState<{ patch: MultiPatch; fieldLabel: string } | null>(null)
  const [resetKey, setResetKey] = useState(0)

  if (!item || !line) return null

  const multiSelect = checkedLines.size > 1

  // Linhas atualmente selecionadas (na seleção única, só a linha em foco).
  const selectedLines = multiSelect
    ? state.fineTuningItems.flatMap(it => it.lines).filter(l => checkedLines.has(l.id))
    : [line]

  // Na seleção múltipla, só exibe o valor de um campo quando ele é IDÊNTICO em todas
  // as linhas selecionadas; se divergir, mostra vazio (a edição, ao confirmar, aplica
  // a todas). Na seleção única, devolve o valor da própria linha.
  const fieldVal = (key: keyof FineTuningLine): string => {
    const vals = selectedLines.map(l => (l[key] as string | undefined) ?? '')
    return vals.every(v => v === vals[0]) ? vals[0] : ''
  }

  const commitChange = (patch: MultiPatch, fieldLabel: string) => {
    if (multiSelect) {
      setPendingEdit({ patch, fieldLabel })
    } else {
      dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid, lineId, patch })
    }
  }

  const confirmMultiEdit = () => {
    if (!pendingEdit) return
    for (const it of state.fineTuningItems)
      for (const l of it.lines)
        if (checkedLines.has(l.id))
          dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: it.uid, lineId: l.id, patch: pendingEdit.patch })
    setPendingEdit(null)
  }

  const cancelMultiEdit = () => { setPendingEdit(null); setResetKey(k => k + 1) }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest">Detalhamento</span>
        {onCollapse && (
          <button onClick={onCollapse} title="Minimizar detalhamento"
            className="shrink-0 -mr-1 p-1 rounded text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <PanelRightClose size={15} />
          </button>
        )}
      </div>

      {multiSelect && (
        <div className="shrink-0 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <span className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-semibold">{checkedLines.size} linhas selecionadas</span> — edições afetarão múltiplas operações
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-3 scrollbar-custom">
        {!multiSelect && <>
          <p className="text-[10px] text-slate-600 dark:text-slate-500 leading-snug truncate">{item.packageName}</p>
          <p className={`text-xs font-semibold leading-snug ${line.isContingency ? CONTING_TEXT : 'text-slate-700 dark:text-slate-200'}`}>
            {line.text || <span className="italic text-slate-500 dark:text-slate-600">—</span>}
          </p>
        </>}
        <DetailField label="Procedimentos" grow value={fieldVal('procedures')} resetKey={resetKey}
          onChange={v => commitChange({ procedures: v }, 'Procedimentos')} />
        <RichTextField label="Recomendações" value={fieldVal('details')} resetKey={resetKey}
          onChange={v => commitChange({ details: v }, 'Recomendações')} />
      </div>

      {pendingEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 max-w-xs w-full mx-4 flex flex-col gap-4">
            <div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                Aplicar a {checkedLines.size} linhas?
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed">
                A edição em <span className="font-medium">"{pendingEdit.fieldLabel}"</span> será aplicada a todas as {checkedLines.size} linhas selecionadas.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={cancelMultiEdit}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button onClick={confirmMultiEdit}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-blue-500 hover:bg-blue-600 text-white transition-colors">
                Aplicar a todas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ontology inline cells (schedule line rows, replaces time columns) ─────────
function OntSelect({ label, value, options, onChange, width, mismatch, empty, title }: { label: string; value: string; options: string[]; onChange: (v: string) => void; width: number; mismatch?: boolean; empty?: boolean; title?: string }) {
  return (
    <label className="flex flex-col gap-0.5 shrink-0" style={{ width }} onClick={e => e.stopPropagation()} title={title}>
      <span className={`text-[8px] font-bold uppercase tracking-wider truncate leading-none ${mismatch ? 'text-amber-600 dark:text-amber-400' : empty ? 'text-amber-500 dark:text-amber-500' : 'text-slate-500 dark:text-slate-600'}`}>{label}</span>
      <div className={`rounded ${mismatch ? 'ring-2 ring-amber-400 dark:ring-amber-500' : empty ? 'ring-2 ring-amber-300 dark:ring-amber-600' : ''}`}>
        <select value={value} onChange={e => onChange(e.target.value)}
          className={`w-full text-[11px] rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer ${
            mismatch
              ? 'text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border border-amber-400 dark:border-amber-600'
              : empty
                ? 'bg-amber-50 dark:bg-amber-950/40 text-slate-700 dark:text-slate-200 border border-amber-300 dark:border-amber-600/70'
                : 'text-slate-700 dark:text-slate-200 bg-[#fafafa] dark:bg-slate-800 border border-slate-200 dark:border-slate-700'
          }`}>
          <option value="">—</option>
          {value && !options.includes(value) && <option value={value}>{value}</option>}
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    </label>
  )
}

// Edição multi-linha: quando várias linhas estão selecionadas, os pick lists
// aparecem só na primeira (líder) e replicam a edição a todas via `targets`.
type CellTargets = { uid: string; line: FineTuningLine }[]

function MultiEditBadge({ count }: { count: number }) {
  return (
    <span className="self-end mb-0.5 shrink-0 text-[8px] font-bold leading-none px-1 py-0.5 rounded bg-blue-500 text-white"
      title={`Edição replicada para ${count} linhas selecionadas`}>{count}×</span>
  )
}

function LineOntologyCell({ uid, line, phase, targets }: { uid: string; line: FineTuningLine; phase: Phase; targets?: CellTargets }) {
  const { dispatch } = useApp()
  const src: CellTargets = targets && targets.length > 0 ? targets : [{ uid, line }]
  const multi = src.length > 1
  // Em multi, mostra o valor só quando idêntico em todas; se divergir, vazio.
  const val = (key: keyof FineTuningLine): string => {
    const vals = src.map(t => (t.line[key] as string | undefined) ?? '')
    return vals.every(v => v === vals[0]) ? vals[0] : ''
  }
  const f = val('owFase'), a = val('owAtividade'), o = val('owOperacao')
  const mismatch = multi ? false : isOntologyMismatch(line, phase)
  const mismatchTitle = mismatch
    ? `Fase OW (${line.owFase}) difere da fase do cronograma (${phase} → esperado ${expectedOwFase(phase)})`
    : undefined
  const showEmpty = !multi && !!expectedOwFase(phase)
  const upd = (patch: Partial<Pick<FineTuningLine, 'owFase' | 'owAtividade' | 'owOperacao' | 'owEtapa'>>) => {
    for (const t of src) dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: t.uid, lineId: t.line.id, patch })
  }
  return (
    <td colSpan={3} className="py-1 px-2 align-top">
      <div className="flex gap-x-1.5" onClick={e => e.stopPropagation()}>
        {multi && <MultiEditBadge count={src.length} />}
        {/* Cascata: mudar o pai limpa os filhos */}
        <OntSelect width={85}  label="OW Fase"      options={owFases()}        value={f} mismatch={mismatch} empty={showEmpty && !f} title={mismatchTitle} onChange={v => upd({ owFase: v, owAtividade: '', owOperacao: '', owEtapa: '' })} />
        <OntSelect width={130} label="OW Atividade" options={owAtividades(f)}  value={a} empty={showEmpty && !a} onChange={v => upd({ owAtividade: v, owOperacao: '', owEtapa: '' })} />
        <OntSelect width={190} label="OW Operação"  options={owOperacoes(f, a)} value={o} empty={showEmpty && !o} onChange={v => upd({ owOperacao: v, owEtapa: '' })} />
        <OntSelect width={190} label="OW Etapa"     options={owEtapas(f, a, o)} value={val('owEtapa')} empty={showEmpty && !val('owEtapa')} onChange={v => upd({ owEtapa: v })} />
      </div>
    </td>
  )
}

// ── Inline cells (schedule line rows, replaces time columns) — EDS / CSB ──────
const CELL_LABEL = 'text-[8px] font-bold uppercase tracking-wider truncate leading-none text-slate-500 dark:text-slate-600'
const CELL_INPUT = 'w-full text-[11px] rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 dark:text-slate-200 bg-[#fafafa] dark:bg-slate-800 border border-slate-200 dark:border-slate-700'

function CellText({ label, value, onCommit, width }: { label: string; value: string; onCommit: (v: string) => void; width: number }) {
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (document.activeElement !== ref.current) setDraft(value) }, [value])
  return (
    <label className="flex flex-col gap-0.5 shrink-0" style={{ width }} onClick={e => e.stopPropagation()}>
      <span className={CELL_LABEL}>{label}</span>
      <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onCommit(draft) }} className={CELL_INPUT} />
    </label>
  )
}

function LineEdsCell({ uid, line, targets }: { uid: string; line: FineTuningLine; targets?: CellTargets }) {
  const { dispatch } = useApp()
  const src: CellTargets = targets && targets.length > 0 ? targets : [{ uid, line }]
  const multi = src.length > 1
  const upd = (patch: Partial<Pick<FineTuningLine, 'edsNumber' | 'edsComment' | 'compensando'>>) => {
    for (const t of src) dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: t.uid, lineId: t.line.id, patch })
  }
  // Em multi, exibe valor só quando idêntico em todas as linhas; senão, vazio.
  const sameEds = src.every(t => t.line.edsNumber === src[0].line.edsNumber)
  const edsVal = sameEds && src[0].line.edsNumber != null ? String(src[0].line.edsNumber) : ''
  const sameComp = src.every(t => t.line.compensando === src[0].line.compensando)
  const compVal = !sameComp ? 'null' : src[0].line.compensando === true ? 'true' : src[0].line.compensando === false ? 'false' : 'null'
  const sameComment = src.every(t => (t.line.edsComment ?? '') === (src[0].line.edsComment ?? ''))
  const commentVal = sameComment ? (src[0].line.edsComment ?? '') : ''
  return (
    <td colSpan={3} className="py-1 px-2 align-top">
      <div className="flex gap-x-1.5" onClick={e => e.stopPropagation()}>
        {multi && <MultiEditBadge count={src.length} />}
        <label className="flex flex-col gap-0.5 shrink-0" style={{ width: 110 }}>
          <span className={CELL_LABEL}>Compensando</span>
          <select value={compVal} className={`${CELL_INPUT} cursor-pointer`}
            onChange={e => upd({ compensando: e.target.value === 'true' ? true : e.target.value === 'false' ? false : null })}>
            <option value="null"></option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </label>
        <label className="flex flex-col gap-0.5 shrink-0" style={{ width: 170 }}>
          <span className={CELL_LABEL}>Tipo de EDS</span>
          <select value={edsVal} className={`${CELL_INPUT} cursor-pointer`}
            onChange={e => upd({ edsNumber: e.target.value === '' ? undefined : Number(e.target.value) })}>
            <option value=""></option>
            {EDS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <CellText label="Coment. EDS" width={210} value={commentVal} onCommit={v => upd({ edsComment: v })} />
      </div>
    </td>
  )
}

function LineCsbCell({ uid, line, targets }: { uid: string; line: FineTuningLine; targets?: CellTargets }) {
  const { dispatch } = useApp()
  const src: CellTargets = targets && targets.length > 0 ? targets : [{ uid, line }]
  const multi = src.length > 1
  const upd = (patch: Partial<Pick<FineTuningLine, 'csbPrimario' | 'csbSecundario'>>) => {
    for (const t of src) dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: t.uid, lineId: t.line.id, patch })
  }
  const val = (key: 'csbPrimario' | 'csbSecundario') => {
    const vals = src.map(t => t.line[key] ?? '')
    return vals.every(v => v === vals[0]) ? vals[0] : ''
  }
  return (
    <td colSpan={3} className="py-1 px-2 align-top">
      <div className="flex gap-x-1.5" onClick={e => e.stopPropagation()}>
        {multi && <MultiEditBadge count={src.length} />}
        <CellText label="CSB Primário"   width={290} value={val('csbPrimario')}   onCommit={v => upd({ csbPrimario: v })} />
        <CellText label="CSB Secundário" width={290} value={val('csbSecundario')} onCommit={v => upd({ csbSecundario: v })} />
      </div>
    </td>
  )
}

function TimeAdjustRow({ label, currentDays, unit, fmt, kind }: {
  label: string; currentDays: number; unit: string; fmt: (d: number) => string
  kind: 'firme' | 'cont'
}) {
  const { dispatch } = useApp()
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)

  const currentDisplay = fmt(currentDays)
  const accentCls = kind === 'firme' ? 'text-[#2f5aa8] dark:text-blue-400' : 'text-[#7d1935] dark:text-rose-400'

  const apply = () => {
    const val = parseFloat(draft.replace(',', '.'))
    if (isNaN(val) || val <= 0) { setError(true); return }
    setError(false)
    const targetDays = unit === 'h' ? val / 24 : val
    dispatch({ type: 'FT_RESCALE_TIMES', kind, targetDays })
    setDraft(String(val))
  }

  const restore = () => dispatch({ type: 'FT_RESTORE_TIMES', kind })

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-widest ${accentCls}`}>{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-400">
            {currentDisplay}<span className="text-[9px] ml-0.5 text-slate-600 dark:text-slate-600">{unit}</span>
          </span>
          <button
            onClick={restore}
            title="Restaurar tempos originais"
            className="text-[11px] text-slate-600 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors leading-none"
          >↺</button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`flex-1 flex items-center rounded-lg border px-2 py-1 gap-1 bg-[#f5f5f5] dark:bg-slate-900 transition-colors ${error ? 'border-red-400' : 'border-slate-200 dark:border-slate-700 focus-within:border-blue-400'}`}>
          <input
            type="number" min="0" step="0.01"
            value={draft}
            onChange={e => { setDraft(e.target.value); setError(false) }}
            onKeyDown={e => { if (e.key === 'Enter') apply() }}
            placeholder={currentDisplay}
            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-600"
          />
          <span className="text-[10px] text-slate-600 dark:text-slate-600 shrink-0">{unit}</span>
        </div>
        <button
          onClick={apply}
          className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold bg-[#f5f5f5] dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-blue-500 hover:text-white transition-colors">
          ↵
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400">Valor inválido</p>}
    </div>
  )
}

function StatsPanel({ onCollapse }: { onCollapse?: () => void }) {
  const { state, dispatch } = useApp()
  const items = state.fineTuningItems.filter(i => !i.isBlank)
  const showHours = state.showHours
  const unit = showHours ? 'h' : 'd'
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)
  const [contExpanded, setContExpanded] = useState(false)

  const editPkgCont = (item: FineTuningItem, targetDays: number) => {
    const current = pkgCont(item)
    if (current <= 0 || targetDays <= 0) return
    const scale = targetDays / current
    if (item.isContingency) {
      const hasLineTimes = item.lines.some(l => !l.isParallel && (l.duration ?? 0) > 0)
      if (hasLineTimes) {
        for (const line of item.lines)
          if (!line.isParallel && (line.duration ?? 0) > 0)
            dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: item.uid, lineId: line.id, patch: { duration: (line.duration ?? 0) * scale } })
      } else {
        dispatch({ type: 'FT_UPDATE_ITEM', uid: item.uid, patch: { duration: targetDays } })
      }
    } else {
      for (const line of item.lines)
        if (line.isContingency && !line.isParallel && (line.duration ?? 0) > 0)
          dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: item.uid, lineId: line.id, patch: { duration: (line.duration ?? 0) * scale } })
    }
  }

  const phases = [...new Set(items.map(i => i.phase))]

  // Usa fineTuningItems como fonte de verdade: reflete duplicatas e inserções manuais
  // que o usuário faz na etapa 3 e que não retornam para state.schedule.
  const nRuns = (i: FineTuningItem) => PACKAGES[i.packageId]?.nRuns ?? 1
  const nContSubruns = (i: FineTuningItem) => PACKAGES[i.packageId]?.nContSubruns ?? 0

  const buildTechRows = (matches: (i: FineTuningItem) => boolean) => {
    const rows = phases.map(phase => {
      const counts = Object.fromEntries(
        TRACKED_MOUNT_TECHS.map(tech => [
          tech,
          items
            .filter(i => i.phase === phase && i.technology === tech && !i.isContingency && !i.isParallel && !allLinesParallel(i) && matches(i))
            .reduce((sum, i) => sum + nRuns(i), 0),
        ])
      ) as Record<string, number>
      return { phase, counts }
    }).filter(row => TRACKED_MOUNT_TECHS.some(t => row.counts[t] > 0))

    // Corridas contingenciais = itens de contingência + sub-corridas embutidas em itens firmes
    const contingTotals = Object.fromEntries(
      TRACKED_MOUNT_TECHS.map(tech => {
        const fromContItems = items
          .filter(i => i.technology === tech && i.isContingency && !i.isParallel && !allLinesParallel(i) && matches(i))
          .reduce((sum, i) => sum + nRuns(i), 0)
        const fromSubruns = items
          .filter(i => i.technology === tech && !i.isContingency && !i.isParallel && !allLinesParallel(i) && matches(i))
          .reduce((sum, i) => sum + nContSubruns(i), 0)
        return [tech, fromContItems + fromSubruns]
      })
    ) as Record<string, number>

    const hasConting = TRACKED_MOUNT_TECHS.some(t => contingTotals[t] > 0)
    return { rows, contingTotals, hasConting }
  }

  // Montagem = rig-up da unidade (pacote isMountOp). Corrida = cada operação real da
  // tecnologia no poço (qualquer pacote que não seja montagem nem desmontagem).
  const mounts = buildTechRows(i => MOUNT_IDS.has(i.packageId))
  const runs = buildTechRows(i => !MOUNT_IDS.has(i.packageId) && !DISMOUNT_IDS.has(i.packageId))

  // Aggregate per phase in order of first appearance
  const phaseOrder: string[] = []
  const phaseMap = new Map<string, { firme: number; cont: number }>()
  for (const item of items) {
    if (!phaseMap.has(item.phase)) {
      phaseOrder.push(item.phase)
      phaseMap.set(item.phase, { firme: 0, cont: 0 })
    }
    const g = phaseMap.get(item.phase)!
    g.firme += pkgFirme(item)
    g.cont  += pkgCont(item)
  }

  const grandFirme = phaseOrder.reduce((a, p) => a + phaseMap.get(p)!.firme, 0)
  const grandCont  = phaseOrder.reduce((a, p) => a + phaseMap.get(p)!.cont,  0)
  const grandTotal = grandFirme + grandCont

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest">Estatísticas</span>
        {onCollapse && (
          <button onClick={onCollapse} title="Minimizar estatísticas"
            className="shrink-0 -mr-1 p-1 rounded text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <PanelRightClose size={15} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-custom p-3 flex flex-col gap-4">

        {/* ── Ajuste de Tempos ── */}
        <div>
          <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-2">Ajuste de Tempos</p>
          <div className="rounded-lg bg-[#fafafa] dark:bg-slate-800 px-3 py-3 flex flex-col gap-3">
            <TimeAdjustRow label="Firme" currentDays={grandFirme} unit={unit} fmt={fmt} kind="firme" />
            {grandCont > 0 && (
              <>
                <TimeAdjustRow label="Cont." currentDays={grandCont} unit={unit} fmt={fmt} kind="cont" />
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => setContExpanded(v => !v)}
                    className={`flex items-center gap-1 text-[10px] font-semibold transition-colors self-start px-1 py-0.5 rounded ${
                      contExpanded
                        ? 'text-[#7d1935] dark:text-rose-400 bg-[#7d1935]/8 dark:bg-rose-900/30'
                        : 'text-slate-500 dark:text-slate-600 hover:text-[#7d1935] dark:hover:text-rose-400'
                    }`}
                    title={contExpanded ? 'Recolher pacotes' : 'Expandir pacotes com contingência'}>
                    <span>{contExpanded ? '▴' : '▾'}</span>
                    <span>{items.filter(i => !i.isBlank && pkgCont(i) > 0).length} pacotes</span>
                  </button>
                  {contExpanded && (
                    <div className="flex flex-col gap-0.5 pl-2 border-l-2 border-[#7d1935]/25 dark:border-rose-800/50 mt-0.5">
                      {items.filter(i => !i.isBlank && pkgCont(i) > 0).map(item => {
                        const cont = pkgCont(item)
                        return (
                          <div key={item.uid} className="flex items-center gap-1 py-0.5">
                            <span className="text-[10px] text-slate-600 dark:text-slate-500 truncate flex-1 min-w-0" title={item.packageName}>
                              {item.packageName}
                            </span>
                            <InlineEdit
                              value={fmt(cont)}
                              type="number"
                              onCommit={v => {
                                const n = parseFloat(v.replace(',', '.'))
                                if (!isNaN(n) && n > 0) editPkgCont(item, showHours ? n / 24 : n)
                              }}
                              className={`font-mono text-[10px] ${CONTING_TEXT} shrink-0`}
                              inputClassName="text-[10px] w-12 text-right font-mono"
                            />
                            <span className="text-[9px] text-slate-500 dark:text-slate-600 shrink-0">{unit}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-600 pt-2 mt-1">
              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">Total</span>
              <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                {fmt(grandTotal)}<span className="text-[9px] ml-0.5 text-slate-600 dark:text-slate-600">{unit}</span>
              </span>
            </div>
          </div>
        </div>

        {/* ── Resumo de Tempos ── */}
        {phaseOrder.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-2">Resumo de Tempos</p>
            <div className="rounded-lg bg-[#fafafa] dark:bg-slate-800 overflow-hidden">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="py-1.5 px-2 text-left text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider"></th>
                    <th className="py-1.5 px-2 text-right text-[9px] font-bold text-blue-400 dark:text-blue-500 uppercase tracking-wider">Firme</th>
                    <th className="py-1.5 px-2 text-right text-[9px] font-bold text-[#7d1935] dark:text-rose-400 uppercase tracking-wider">Cont.</th>
                    <th className="py-1.5 px-2 text-right text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseOrder.map(phase => {
                    const g = phaseMap.get(phase)!
                    const total = g.firme + g.cont
                    const colors = PHASE_COLORS[phase] ?? PHASE_COLORS['Mobilização']
                    return (
                      <React.Fragment key={phase}>
                        <tr className={`${colors.bg} border-y border-slate-200/60 dark:border-slate-700`}>
                          <td colSpan={4} className={`py-1 px-2 text-[9px] font-bold uppercase tracking-widest ${colors.text}`}
                            style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
                            {phase}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-200/40 dark:border-slate-700/50">
                          <td className="py-1.5 px-2" />
                          <td className="py-1.5 px-2 text-right font-mono text-xs font-bold text-[#2f5aa8] dark:text-blue-400">
                            {fmt(g.firme)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span>
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs font-bold text-[#7d1935] dark:text-rose-400">
                            {g.cont > 0
                              ? <>{fmt(g.cont)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span></>
                              : <span className="text-slate-200 dark:text-slate-700">—</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {fmt(total)}<span className="text-slate-600 dark:text-slate-500 font-normal text-[9px] ml-0.5">{unit}</span>
                          </td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td className="py-2 px-2 text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Total</td>
                    <td className="py-2 px-2 text-right font-mono text-sm font-bold text-[#2f5aa8] dark:text-blue-400">
                      {fmt(grandFirme)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span>
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-sm font-bold text-[#7d1935] dark:text-rose-400">
                      {grandCont > 0
                        ? <>{fmt(grandCont)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span></>
                        : <span className="text-slate-200 dark:text-slate-700 text-xs">—</span>}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-sm font-bold text-[#0c2340] dark:text-white">
                      {fmt(grandTotal)}<span className="text-slate-700 dark:text-slate-400 font-normal text-[9px] ml-0.5">{unit}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── Montagens por tecnologia (rig-up da unidade) ── */}
        <TechCountSection title="Montagens" rows={mounts.rows} contingTotals={mounts.contingTotals} hasConting={mounts.hasConting} />

        {/* ── Corridas por tecnologia (trens/BHAs operados) ── */}
        <TechCountSection title="Corridas" rows={runs.rows} contingTotals={runs.contingTotals} hasConting={runs.hasConting} />

      </div>
    </div>
  )
}

// Bloco de contagem por tecnologia (Montagens / Corridas): linhas por fase contam
// apenas firmes; contingenciais agregadas numa linha à parte.
function TechCountSection({
  title, rows, contingTotals, hasConting,
}: {
  title: string
  rows: { phase: string; counts: Record<string, number> }[]
  contingTotals: Record<string, number>
  hasConting: boolean
}) {
  if (rows.length === 0 && !hasConting) return null
  return (
    <div>
      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-2">{title}</p>
      <div className="rounded-lg bg-[#fafafa] dark:bg-slate-800 px-3 py-2.5">
        <div className="grid grid-cols-4 gap-x-1 mb-1.5">
          <span className="col-span-1" />
          {TRACKED_MOUNT_TECHS.map(t => (
            <span key={t} className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase text-center">{MOUNT_TECH_LABELS[t]}</span>
          ))}
        </div>
        {rows.map(({ phase, counts }) => (
          <div key={phase} className="grid grid-cols-4 gap-x-1 py-1 border-t border-slate-200/60 dark:border-slate-700/50">
            <span className="text-[10px] text-slate-700 dark:text-slate-400 truncate col-span-1">{phase}</span>
            {TRACKED_MOUNT_TECHS.map(t => (
              <span key={t} className={`text-xs font-mono text-center font-semibold ${counts[t] > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-200 dark:text-slate-700'}`}>
                {counts[t] > 0 ? counts[t] : '—'}
              </span>
            ))}
          </div>
        ))}
        {hasConting && (
          <div className="grid grid-cols-4 gap-x-1 py-1 mt-1 border-t border-slate-200 dark:border-slate-600">
            <span className={`text-[10px] font-semibold ${CONTING_TEXT} truncate col-span-1`}>Conting.</span>
            {TRACKED_MOUNT_TECHS.map(t => (
              <span key={t} className={`text-xs font-mono text-center font-semibold ${contingTotals[t] > 0 ? CONTING_TEXT : 'text-slate-200 dark:text-slate-700'}`}>
                {contingTotals[t] > 0 ? contingTotals[t] : '—'}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Resize handle ─────────────────────────────────────────────────────────────
function ResizeHandle({ onPointerDown }: { onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className="shrink-0 w-2 cursor-col-resize group flex items-center justify-center select-none"
      title="Arrastar para redimensionar">
      <div className="w-px h-full bg-slate-200 dark:bg-slate-700 group-hover:bg-blue-400 transition-colors" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIC LAYOUT — mirrors step 2 styling (bigger fonts, full phase colors,
// PACOTE id + TECH + TIPO + DESCRIÇÃO + FIRME + CONT. + TOTAL columns).
// ─────────────────────────────────────────────────────────────────────────────

function PackagePickerModal({ afterUid, onClose }: { afterUid: string | null; onClose: () => void }) {
  const { dispatch } = useApp()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Inclui pacotes customizados (criados no Admin) para inserção manual.
  const allPackages = useMemo(() => Object.values(getAllPackages()), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allPackages
    return allPackages.filter(p =>
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
  }, [allPackages, query])

  // Group by category preserving order of first appearance
  const grouped = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, typeof filtered>()
    for (const p of filtered) {
      if (!map.has(p.category)) { order.push(p.category); map.set(p.category, []) }
      map.get(p.category)!.push(p)
    }
    return order.map(cat => ({ category: cat, items: map.get(cat)! }))
  }, [filtered])

  const pickPackage = (packageId: string) => {
    dispatch({ type: 'FT_INSERT_PKG', afterUid, packageId })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#f5f5f5] dark:bg-slate-900 rounded-xl shadow-2xl w-[min(720px,92vw)] max-h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide" style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
              Inserir pacote
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-500">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 bg-[#fafafa] dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors">
            <Search size={14} className="text-slate-600 dark:text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por ID, nome ou categoria..."
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-600 dark:placeholder:text-slate-700"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-600 hover:text-slate-600 dark:hover:text-slate-500 shrink-0">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto scrollbar-custom px-2 py-2">
          {grouped.length === 0 ? (
            <div className="text-center text-xs text-slate-600 dark:text-slate-500 py-8">Nenhum pacote encontrado.</div>
          ) : grouped.map(({ category, items }) => (
            <div key={category} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest sticky top-0 bg-[#f5f5f5] dark:bg-slate-900 z-10">
                {category}
              </div>
              {items.map(pkg => {
                const techLabel = TECH_LABEL[pkg.technology]
                const techColor = TECH_COLORS[pkg.technology]
                return (
                  <button
                    key={pkg.id}
                    onClick={() => pickPackage(pkg.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors group">
                    <span className="font-mono text-xs font-medium text-[#2f5aa8] dark:text-blue-400 w-20 shrink-0">{pkg.id}</span>
                    {techLabel ? (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${techColor}`}>{techLabel}</span>
                    ) : <span className="w-8 shrink-0" />}
                    <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 leading-snug">{pkg.name}</span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Sinaliza, no cronograma, que a linha tem algum campo de Detalhamento preenchido
// (Referências Técnicas/Procedimentos, Detalhes ou CSBs).
function lineDetailLabels(line: FineTuningLine): string[] {
  const labels: string[] = []
  if (line.procedures?.trim())    labels.push('Referências Técnicas')
  if (line.details?.trim())       labels.push('Detalhes')
  return labels
}

function DetailIndicator({ line }: { line: FineTuningLine }) {
  const labels = lineDetailLabels(line)
  if (labels.length === 0) return null
  return (
    <span
      className="absolute left-1 top-1/2 -translate-y-1/2 leading-none text-[#005889] dark:text-sky-400 pointer-events-none select-none"
      title={`Detalhamento preenchido: ${labels.join(', ')}`}
      aria-label="Detalhamento preenchido">
      <BiDetail size={12} />
    </span>
  )
}

function ClassicLineRow({ line, itemUid, itemPhase, subNum, onSelectLine, isChecked, onToggleCheck, pkgIsParallel, pkgIsCont, kbEditTick, isLastLine, onEnterFromLastLine, onDeleteRequest, showOntology, showEds, showCsb, bopActiveLineIds, showPkgCol, checkedLines, multiEditLeadId, currentReviewUid, matchRowId, highlightIds, onContextMenu, isDragging, onDragHandleStart, onDragHandleEnd, onRowDragOver, onRowDrop }: {
  line: FineTuningLine; itemUid: string; itemPhase: Phase
  subNum: string
  onSelectLine: () => void
  isChecked: boolean; onToggleCheck: () => void
  pkgIsParallel?: boolean
  pkgIsCont?: boolean
  kbEditTick?: number
  isLastLine?: boolean
  onEnterFromLastLine?: () => void
  onDeleteRequest: () => void
  showOntology: boolean
  showEds: boolean
  showCsb: boolean
  bopActiveLineIds: Set<string>
  showPkgCol: boolean
  checkedLines: Set<string>
  multiEditLeadId: string | null
  currentReviewUid?: string | null
  matchRowId?: string | null
  highlightIds?: Set<string> | null
  onContextMenu?: (e: React.MouseEvent) => void
  isDragging?: boolean
  onDragHandleStart?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragHandleEnd?: () => void
  onRowDragOver?: (e: React.DragEvent<HTMLTableRowElement>) => void
  onRowDrop?: (e: React.DragEvent<HTMLTableRowElement>) => void
}) {
  const { state, dispatch } = useApp()
  const showHours = state.showHours
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)
  const isCont = line.isContingency || !!pkgIsCont
  const dur = line.duration ?? 0

  const isLinePending = state.pendingReview.includes(line.id)
  const isInReview = currentReviewUid === line.id
  const rowBg = isInReview
    ? 'bg-amber-200 dark:bg-amber-700/70 outline outline-2 -outline-offset-2 outline-amber-500 dark:outline-amber-400 font-medium'
    : isChecked
      ? 'bg-blue-100 dark:bg-blue-900/50'
      : isLinePending
        ? 'bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-900/40'
        : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'

  return (
    <tr data-row-id={line.id}
      onClick={() => onSelectLine()}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e) }}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); onRowDragOver?.(e) }}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); onRowDrop?.(e) }}
      className={`group border-b border-slate-100 dark:border-slate-800 cursor-pointer transition-colors ${isDragging ? 'opacity-40' : ''} ${rowBg} ${matchRowId === line.id || highlightIds?.has(line.id) ? 'outline outline-2 -outline-offset-2 outline-sky-500 dark:outline-sky-400' : ''}`}
      style={!isChecked && !isLinePending ? highlightRowStyle(line.highlight) : undefined}>
      {/* # — spacer (=chevron width) + checkbox + sub-number (grip substitui o nº no hover) */}
      <td className="py-1 px-1">
        <div className="flex items-center gap-1">
          <div className="shrink-0 w-3.5" />
          <button onClick={e => { e.stopPropagation(); onToggleCheck() }}
            className={`shrink-0 w-3 h-3 flex items-center justify-center rounded border transition-all focus:outline-none ${
              isChecked ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
            }`}>
            {isChecked && <Check size={6} strokeWidth={3} />}
          </button>
          <div className="relative w-5 flex items-center justify-center">
            <span className={`font-mono text-[9px] transition-opacity group-hover:opacity-0 ${isCont ? 'text-[#7d1935]/40 dark:text-rose-400/30' : 'text-slate-200 dark:text-slate-700'}`}>{subNum}</span>
            <button draggable
              onDragStart={e => { e.stopPropagation(); onDragHandleStart?.(e) }}
              onDragEnd={e => { e.stopPropagation(); onDragHandleEnd?.() }}
              onClick={e => e.stopPropagation()}
              className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Arrastar para mover">
              <GripVertical size={9} />
            </button>
          </div>
        </div>
      </td>
      {showPkgCol && <td className="py-1.5 px-2" />}
      {/* Tipo — contingencial + paralelo (icon toggles) */}
      <td className="py-1.5 px-1 text-center">
        <div className="inline-flex items-center gap-0.5">
          <button onClick={e => { e.stopPropagation(); dispatch({ type: 'FT_TOGGLE_LINE_CONTINGENCY', uid: itemUid, lineId: line.id }) }}
            title={isCont ? 'Contingencial — clique para Firme' : 'Firme — clique para Contingencial'}
            className={`w-4 h-4 flex items-center justify-center rounded transition-all ${
              isCont ? 'bg-[#7d1935]/10 dark:bg-rose-900/50 text-[#7d1935] dark:text-rose-400'
                     : 'text-slate-700 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}>
            <span className="text-[10px] font-bold leading-none">C</span>
          </button>
          <button onClick={e => { e.stopPropagation(); dispatch({ type: 'FT_TOGGLE_LINE_PARALLEL', uid: itemUid, lineId: line.id }) }}
            title={line.isParallel ? 'Paralelo — clique para desativar' : 'Principal — clique para paralelo'}
            className={`w-4 h-4 flex items-center justify-center rounded transition-all ${
              line.isParallel ? 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                              : 'text-slate-700 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}>
            <ParallelLinesIcon />
          </button>
        </div>
      </td>
      {/* Descrição — indented relative to package name */}
      <td className="py-1.5 pl-7 pr-3 relative">
        <DetailIndicator line={line} />
        <InlineEdit value={line.text} placeholder="Descrição..."
          onCommit={text => dispatch({ type: 'FT_UPDATE_LINE', uid: itemUid, lineId: line.id, text })}
          className={`text-xs leading-snug ${
            isCont ? CONTING_TEXT
            : (line.isParallel || pkgIsParallel) ? 'text-slate-400 dark:text-slate-500'
            : isLinePending ? 'text-slate-700 dark:text-slate-300'
            : 'text-[#0c2340] dark:text-blue-400'
          }`}
          style={!isChecked && !isLinePending ? highlightTextStyle(line.highlight) : undefined}
          inputClassName="text-xs w-full"
          editKey={kbEditTick}
          onEnterCommit={() => {
            if (isLastLine && onEnterFromLastLine) onEnterFromLastLine()
            else setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })), 0)
          }}
        />
      </td>
      {(showOntology || showEds || showCsb) ? (() => {
        const multiSelect = checkedLines.size > 1
        // Linha "seguidora": selecionada mas não é a líder → oculta os pick lists.
        if (multiSelect && isChecked && line.id !== multiEditLeadId) return <td colSpan={3} />
        // Linha líder: replica a edição a todas as selecionadas (em EDS, só às que
        // têm BOP ativo, pois só nelas o EDS é editável).
        const targets: CellTargets | undefined = (multiSelect && line.id === multiEditLeadId)
          ? state.fineTuningItems.flatMap(it => it.lines.map(l => ({ uid: it.uid, line: l })))
              .filter(t => checkedLines.has(t.line.id) && (!showEds || bopActiveLineIds.has(t.line.id)))
          : undefined
        if (showOntology) return <LineOntologyCell uid={itemUid} line={line} phase={itemPhase} targets={targets} />
        if (showEds) return bopActiveLineIds.has(line.id)
          ? <LineEdsCell uid={itemUid} line={line} targets={targets} />
          : <td colSpan={3} />
        return <LineCsbCell uid={itemUid} line={line} targets={targets} />
      })() : (
        <>
          {/* Firme */}
          <td className="py-1.5 px-3 text-right">
            {!isCont ? (
              <InlineEdit value={fmt(dur)} type="number"
                onCommit={v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0) dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: itemUid, lineId: line.id, patch: { duration: showHours ? n / 24 : n } }) }}
                className={`text-xs ${(line.isParallel || pkgIsParallel) ? 'text-slate-400 dark:text-slate-600' : 'text-[#0c2340] dark:text-blue-400'}`}
                inputClassName="text-xs w-14 text-right"
              />
            ) : <span className="text-xs text-slate-200 dark:text-slate-700 select-none">—</span>}
          </td>
          {/* Cont */}
          <td className="py-1.5 px-3 text-right">
            {isCont ? (
              <InlineEdit value={fmt(dur)} type="number"
                onCommit={v => { const n = parseFloat(v); if (!isNaN(n) && n >= 0) dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: itemUid, lineId: line.id, patch: { duration: showHours ? n / 24 : n } }) }}
                className={`text-xs ${CONTING_TEXT} ${(line.isParallel || pkgIsParallel) ? 'opacity-60' : ''}`}
                inputClassName="text-xs w-14 text-right"
              />
            ) : <span className="text-xs text-slate-200 dark:text-slate-700 select-none">—</span>}
          </td>
          <td className="py-1.5 px-3 text-right">
            <span className={`text-xs ${isCont ? 'text-[#7d1935] dark:text-rose-400' : 'text-slate-700 dark:text-slate-400'}`}>{fmt(dur)}</span>
          </td>
        </>
      )}
    </tr>
  )
}

function ClassicPkgRow({ item, rowNum, isChecked, onToggleCheck, onSelectLine, checkedLines, multiEditLeadId, onToggleLine, kbNavLineId, kbNavTick, nameEditTick, onEnterFromLastLine, onDeleteRequest, onDeleteLine, showOntology, showEds, showCsb, bopActiveLineIds, showPkgCol, isPendingReview, currentReviewUid, matchRowId, highlightIds, onContextMenu, onContextMenuLine, isDragging, onDragHandleStart, onDragHandleEnd, onRowDragOver, onRowDrop, lineDropTarget, onLineDragHandleStart, onLineDragHandleEnd, onLineDragOver, onLineDrop, isDraggingLine }: {
  item: FineTuningItem; rowNum: number | null
  isChecked: boolean; onToggleCheck: () => void
  onSelectLine: (lineId: string) => void
  checkedLines: Set<string>; multiEditLeadId: string | null; onToggleLine: (lineId: string) => void
  kbNavLineId?: string | null; kbNavTick?: number
  nameEditTick?: number
  onEnterFromLastLine?: () => void
  onDeleteRequest: () => void; onDeleteLine: (lineId: string) => void
  showOntology: boolean
  showEds: boolean
  showCsb: boolean
  bopActiveLineIds: Set<string>
  showPkgCol: boolean
  isPendingReview?: boolean
  currentReviewUid?: string | null
  matchRowId?: string | null
  highlightIds?: Set<string> | null
  onContextMenu?: (e: React.MouseEvent) => void
  onContextMenuLine?: (uid: string, lineId: string, x: number, y: number) => void
  isDragging?: boolean
  onDragHandleStart?: (e: React.DragEvent<HTMLButtonElement>) => void
  onDragHandleEnd?: () => void
  onRowDragOver?: (e: React.DragEvent<HTMLTableRowElement>) => void
  onRowDrop?: (e: React.DragEvent<HTMLTableRowElement>) => void
  lineDropTarget?: { lineId: string; pos: 'above' | 'below' } | null
  onLineDragHandleStart?: (e: React.DragEvent<HTMLButtonElement>, lineId: string) => void
  onLineDragHandleEnd?: () => void
  onLineDragOver?: (e: React.DragEvent<HTMLTableRowElement>, lineId: string) => void
  onLineDrop?: (e: React.DragEvent<HTMLTableRowElement>, lineId: string) => void
  isDraggingLine?: (lineId: string) => boolean
}) {
  const { state, dispatch } = useApp()
  const showHours = state.showHours
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)
  const trRef = useRef<HTMLTableRowElement>(null)
  const scrollAnchor = useRef<{ container: HTMLElement; offset: number } | null>(null)

  const handleExpand = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isChecked && item.expanded) return
    const tr = trRef.current
    const container = tr?.closest('.overflow-auto') as HTMLElement | null
    if (tr && container) {
      scrollAnchor.current = { container, offset: tr.getBoundingClientRect().top - container.getBoundingClientRect().top }
    }
    dispatch({ type: 'FT_TOGGLE_EXPAND', uid: item.uid })
  }

  useLayoutEffect(() => {
    const a = scrollAnchor.current
    if (!a || !trRef.current) { scrollAnchor.current = null; return }
    const newOffset = trRef.current.getBoundingClientRect().top - a.container.getBoundingClientRect().top
    const delta = newOffset - a.offset
    if (Math.abs(delta) > 0.5) a.container.scrollTop += delta
    scrollAnchor.current = null
  }, [item.expanded])

  if (item.isBlank) return (
    <tr ref={trRef} data-row-id={item.uid} className="group border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
      <td colSpan={showPkgCol ? 6 : 5} className="py-2 px-3">
        <InlineEdit value={item.packageName} placeholder="Nota / linha em branco..."
          onCommit={v => dispatch({ type: 'FT_UPDATE_ITEM', uid: item.uid, patch: { packageName: v } })}
          className="text-xs text-slate-600 italic" inputClassName="text-xs w-full" />
      </td>
      <td className="py-2 px-2 text-right" />
    </tr>
  )

  const firme = pkgFirme(item)
  const cont  = pkgCont(item)
  const total = firme + cont
  const isCont = item.isContingency

  const isInReview = currentReviewUid === item.uid
  const pkgHl = pkgHighlight(item)
  const showPkgHl = !isChecked && !isInReview && !isPendingReview
  const rowBg = isInReview
    ? 'bg-amber-200 dark:bg-amber-700/70 outline outline-2 -outline-offset-2 outline-amber-500 dark:outline-amber-400 font-medium'
    : isChecked
      ? 'bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/50'
      : isPendingReview
        ? 'bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-50 dark:hover:bg-amber-900/40'
        : item.isParallel
          ? 'bg-slate-50/70 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'

  return (
    <>
      <tr ref={trRef} data-row-id={item.uid}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu?.(e) }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); onRowDragOver?.(e) }}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); onRowDrop?.(e) }}
        className={`group border-b border-slate-100 dark:border-slate-800 transition-colors ${isDragging ? 'opacity-40' : ''} ${rowBg} ${matchRowId === item.uid ? 'outline outline-2 -outline-offset-2 outline-sky-500 dark:outline-sky-400' : ''}`}
        style={showPkgHl ? highlightRowStyle(pkgHl) : undefined}>
        {/* # — chevron + checkbox + row number (grip substitui o nº no hover) */}
        <td className="py-2 px-1">
          <div className="flex items-center gap-1">
            <button onClick={handleExpand} title={item.expanded ? 'Recolher' : 'Expandir'}
              className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              {item.expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            <button onClick={e => { e.stopPropagation(); onToggleCheck() }}
              className={`shrink-0 w-3 h-3 flex items-center justify-center rounded border transition-all focus:outline-none ${
                isChecked ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
              }`}>
              {isChecked && <Check size={6} strokeWidth={3} />}
            </button>
            <div className="relative w-5 flex items-center justify-center">
              <span className={`font-mono text-xs transition-opacity group-hover:opacity-0 ${isCont ? 'text-[#7d1935]/50 dark:text-rose-400/40' : 'text-slate-500 dark:text-slate-600'}`}>{rowNum}</span>
              <button draggable
                onDragStart={e => { e.stopPropagation(); onDragHandleStart?.(e) }}
                onDragEnd={e => { e.stopPropagation(); onDragHandleEnd?.() }}
                onClick={e => e.stopPropagation()}
                className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Arrastar para reposicionar">
                <GripVertical size={11} />
              </button>
            </div>
          </div>
        </td>
        {showPkgCol && (
          <td className="py-2 px-2">
            <span className={`font-mono text-xs font-medium ${isCont ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}>
              {(item.packageId === 'BLANK' || item.packageId === 'MANUAL') ? '—' : item.packageId}
            </span>
          </td>
        )}
        {/* Tipo — contingencial + paralelo (icon toggles) */}
        <td className="py-2 px-1 text-center">
          <div className="inline-flex items-center gap-0.5">
            <button onClick={e => { e.stopPropagation(); dispatch({ type: 'FT_UPDATE_ITEM', uid: item.uid, patch: { isContingency: !isCont } }) }}
              title={isCont ? 'Contingencial — clique para Firme' : 'Firme — clique para Contingencial'}
              className={`w-4 h-4 flex items-center justify-center rounded transition-all ${
                isCont ? 'bg-[#7d1935]/10 dark:bg-rose-900/50 text-[#7d1935] dark:text-rose-400'
                       : 'text-slate-700 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}>
              <span className="text-[10px] font-bold leading-none">C</span>
            </button>
            <button onClick={e => { e.stopPropagation(); dispatch({ type: 'FT_TOGGLE_PARALLEL', uid: item.uid }) }}
              title={item.isParallel ? 'Paralelo — clique para desativar' : 'Principal — clique para paralelo'}
              className={`w-4 h-4 flex items-center justify-center rounded transition-all ${
                item.isParallel ? 'bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300'
                                : 'text-slate-700 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}>
              <ParallelLinesIcon />
            </button>
          </div>
        </td>
        {/* Descrição (package name) */}
        <td className="py-2 px-3">
          <InlineEdit value={item.packageName} placeholder={item.packageId === 'MANUAL' ? 'Descrever' : 'Nome do pacote...'}
            editKey={nameEditTick}
            onCommit={v => dispatch({ type: 'FT_UPDATE_ITEM', uid: item.uid, patch: { packageName: v } })}
            className={`text-xs ${
              isCont ? CONTING_TEXT
              : item.isParallel ? 'text-slate-400 dark:text-slate-500'
              : isPendingReview ? 'text-slate-700 dark:text-slate-300'
              : 'text-[#0c2340] dark:text-blue-400'
            }`}
            style={showPkgHl ? highlightTextStyle(pkgHl) : undefined}
            inputClassName="text-xs w-full" />
        </td>
        {(showOntology || showEds || showCsb) ? (
          <td colSpan={3} className="py-2 px-3 text-right" />
        ) : (
          <>
            {/* Firme */}
            <td className="py-2 px-3 text-right">
              {firme > 0
                ? <span className="text-xs text-[#0c2340] dark:text-blue-400">{fmt(firme)}</span>
                : <span className="text-xs text-slate-200 dark:text-slate-700 select-none">—</span>
              }
            </td>
            {/* Cont */}
            <td className="py-2 px-3 text-right">
              {cont > 0
                ? <span className="text-xs text-[#7d1935] dark:text-rose-400">{fmt(cont)}</span>
                : <span className="text-xs text-slate-200 dark:text-slate-700 select-none">—</span>
              }
            </td>
            {/* Total */}
            <td className="py-2 px-3 text-right">
              <span className={`text-xs ${isCont ? 'text-[#7d1935] dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                {fmt(total)}
              </span>
            </td>
          </>
        )}
      </tr>
      {/* Expanded line rows */}
      {item.expanded && (
        <>
          {item.lines.map((line, idx) => (
            <React.Fragment key={line.id}>
              {lineDropTarget?.lineId === line.id && lineDropTarget.pos === 'above' && <DropIndicatorRow colSpan={showPkgCol ? 7 : 6} />}
              <ClassicLineRow
                line={line} itemUid={item.uid} itemPhase={item.phase}
                subNum={`${rowNum}.${idx + 1}`}
                onSelectLine={() => onSelectLine(line.id)}
                isChecked={checkedLines.has(line.id)}
                onToggleCheck={() => onToggleLine(line.id)}
                checkedLines={checkedLines}
                multiEditLeadId={multiEditLeadId}
                pkgIsParallel={item.isParallel}
                pkgIsCont={item.isContingency}
                kbEditTick={kbNavLineId === line.id ? kbNavTick : undefined}
                isLastLine={idx === item.lines.length - 1}
                onEnterFromLastLine={onEnterFromLastLine}
                onDeleteRequest={() => onDeleteLine(line.id)}
                showOntology={showOntology}
                showEds={showEds}
                showCsb={showCsb}
                bopActiveLineIds={bopActiveLineIds}
                showPkgCol={showPkgCol}
                currentReviewUid={currentReviewUid}
                matchRowId={matchRowId}
                highlightIds={highlightIds}
                onContextMenu={e => onContextMenuLine?.(item.uid, line.id, e.clientX, e.clientY)}
                isDragging={isDraggingLine?.(line.id)}
                onDragHandleStart={e => onLineDragHandleStart?.(e, line.id)}
                onDragHandleEnd={onLineDragHandleEnd}
                onRowDragOver={e => onLineDragOver?.(e, line.id)}
                onRowDrop={e => onLineDrop?.(e, line.id)}
              />
              {lineDropTarget?.lineId === line.id && lineDropTarget.pos === 'below' && <DropIndicatorRow colSpan={showPkgCol ? 7 : 6} />}
            </React.Fragment>
          ))}
        </>
      )}
    </>
  )
}

function ClassicSchedulePanel({
  selectedLine, checkedPkgs, checkedLines,
  handleSelectLine, togglePkg, toggleLine, onToggleAll, kbNav, nameEdit, setDeleteTarget,
  onEnterFromLastLine, onInsertManual, activeTab, onTabChange, setShowDetail, showOntology, showEds, showCsb,
  locateTick, located, oneByOneMode, setOneByOneMode,
  copyBuffer, setCopyBuffer, setCheckedPkgs, setCheckedLines, setSelectedLine,
  findQuery, setFindQuery, gotoMatchRef, onMatchChange,
}: {
  selectedLine: { uid: string; lineId: string } | null
  checkedPkgs: Set<string>; checkedLines: Set<string>
  handleSelectLine: (uid: string, lineId: string) => void
  togglePkg: (uid: string) => void; toggleLine: (lineId: string) => void
  onToggleAll: () => void
  kbNav: { lineId: string; tick: number } | null
  nameEdit: { uid: string; tick: number } | null
  setDeleteTarget: (t: DeleteTarget) => void
  onEnterFromLastLine: (pkgUid: string) => void
  onInsertManual: (afterUid: string | null) => void
  activeTab: 'list' | 'gantt'
  onTabChange: (tab: 'list' | 'gantt') => void
  setShowDetail: (v: boolean) => void
  showOntology: boolean
  showEds: boolean
  showCsb: boolean
  locateTick: { uid: string; n: number } | null
  located: { target: LocateTarget; n: number; cursor: number } | null
  oneByOneMode: boolean
  setOneByOneMode: (v: boolean) => void
  copyBuffer: CopyBuffer | null
  setCopyBuffer: (buf: CopyBuffer | null) => void
  setCheckedPkgs: (s: Set<string>) => void
  setCheckedLines: (s: Set<string>) => void
  setSelectedLine: (l: { uid: string; lineId: string } | null) => void
  findQuery: string
  setFindQuery: (q: string) => void
  gotoMatchRef: React.MutableRefObject<((idx: number) => void) | null>
  onMatchChange: (count: number, idx: number) => void
}) {
  const { state, dispatch } = useApp()
  const items = state.fineTuningItems
  const showHours = state.showHours
  // Ontologia e EDS ocupam o mesmo trio de colunas (no lugar dos tempos) — modo "largo".
  const wideCols = showOntology || showEds || showCsb
  // Linhas dentro do intervalo de uso do BOP de perfuração (entre CONNECT_BOP e DISCONNECT_BOP,
  // ambos inclusive, na ordem do cronograma). Só essas linhas exibem os campos de EDS.
  const bopActiveLineIds = useMemo(() => {
    const set = new Set<string>()
    let active = false
    for (const it of items) {
      for (const ln of it.lines) {
        if (ln.bopMarker === 'CONNECT_BOP') active = true
        if (active) set.add(ln.id)
        if (ln.bopMarker === 'DISCONNECT_BOP') active = false
      }
    }
    return set
  }, [items])

  // Líder da edição multi-linha: a primeira linha selecionada (em ordem de
  // cronograma) que recebe o conjunto único de pick lists. Em EDS, considera só
  // linhas com BOP ativo, pois é onde o EDS é editável.
  const multiEditLeadId = useMemo(() => {
    if (checkedLines.size <= 1) return null
    const flat = items.flatMap(it => it.lines)
    const checked = flat.filter(l => checkedLines.has(l.id))
    if (showEds) return checked.find(l => bopActiveLineIds.has(l.id))?.id ?? null
    return checked[0]?.id ?? null
  }, [items, checkedLines, showEds, bopActiveLineIds])

  const unit = showHours ? 'h' : 'd'
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [showPkgCol, setShowPkgCol] = useState(false)
  const columnWidths: Record<ScheduleColumn, number> = {
    number: 52, package: 88, type: 42, description: 640,
    firm: 84, contingency: 84, total: 92,
  }

  const visibleColumnWidths = {
    ...columnWidths,
    firm: wideCols ? Math.max(columnWidths.firm, 200) : columnWidths.firm,
    contingency: wideCols ? Math.max(columnWidths.contingency, 200) : columnWidths.contingency,
    total: wideCols ? Math.max(columnWidths.total, 220) : columnWidths.total,
  }
  // Soma das colunas exceto "Descrição" (a flexível).
  const fixedColsWidth = visibleColumnWidths.number
    + (showPkgCol ? visibleColumnWidths.package : 0)
    + visibleColumnWidths.type
    + visibleColumnWidths.firm + visibleColumnWidths.contingency + visibleColumnWidths.total

  // Largura do container (rolagem) observada — determina a largura da coluna
  // "Descrição". Calcular em JS evita o bug do table-layout:fixed, que sob min-width
  // não expande a coluna auto para preencher, deixando espaço vazio à direita.
  const [containerW, setContainerW] = useState(0)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setContainerW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Descrição preenche a folga quando o painel é largo; abaixo do mínimo, mantém a
  // largura padrão e a tabela rola horizontalmente.
  const descriptionWidth = Math.max(visibleColumnWidths.description, containerW - fixedColsWidth)
  const tableContentWidth = fixedColsWidth + descriptionWidth
  const tableStyle = { tableLayout: 'fixed' as const, width: `${tableContentWidth}px` }

  // Ao entrar em qualquer modo de colunas (Ontologia/EDS/CSB), expande todo o cronograma:
  // os itens já são expandidos pelos botões; aqui limpamos as seções colapsadas para que
  // nenhuma linha fique oculta.
  useEffect(() => {
    if (showOntology || showEds || showCsb) setCollapsedSections(new Set())
  }, [showOntology, showEds, showCsb])

  // ── Localizar (busca por pacote / linha) ──────────────────────────────────
  const [matchIdx, setMatchIdx] = useState(0)
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null)

  // ── Context menu ──────────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    kind: 'pkg' | 'line'
    uid: string
    lineId?: string
    x: number
    y: number
  } | null>(null)
  const [pickerAfterUid, setPickerAfterUid] = useState<string | null | 'NONE'>('NONE')

  // ── Drag-and-drop ─────────────────────────────────────────────────────────
  // dndDragRef: fonte de verdade usada nos handlers (evita stale closure);
  // dndDrag / dndDrop: estado para re-render visual (indicadores e opacidade).
  const dndDragRef = useRef<DndDrag | null>(null)
  const [dndDrag, setDndDrag] = useState<DndDrag | null>(null)
  const [dndDrop, setDndDrop] = useState<DndDrop | null>(null)

  const endDnd = () => { dndDragRef.current = null; setDndDrag(null); setDndDrop(null) }
  const rowMidPos = (e: React.DragEvent): 'above' | 'below' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
  }

  const handlePkgDragStart = (e: React.DragEvent<HTMLButtonElement>, uid: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', uid)
    const drag: DndDrag = { kind: 'pkg', uid }
    dndDragRef.current = drag
    setDndDrag(drag)
    // Ícone de arrasto mostrando quantos pacotes serão movidos
    const count = checkedPkgs.size > 1 && checkedPkgs.has(uid) ? checkedPkgs.size : 1
    if (count > 1) {
      const ghost = document.createElement('div')
      ghost.textContent = `${count} pacotes`
      ghost.style.cssText = 'position:fixed;top:-1000px;padding:3px 10px;background:#3b82f6;color:#fff;border-radius:6px;font-size:12px;font-family:sans-serif;white-space:nowrap;'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 14)
      setTimeout(() => document.body.removeChild(ghost), 0)
    }
  }
  const handlePkgDragOver = (e: React.DragEvent<HTMLTableRowElement>, uid: string) => {
    e.preventDefault(); e.stopPropagation()
    const drag = dndDragRef.current
    if (!drag) return
    const pos = drag.kind === 'pkg' ? rowMidPos(e) : 'below'
    setDndDrop({ kind: 'pkg', uid, pos })
  }
  const handlePkgDrop = (e: React.DragEvent<HTMLTableRowElement>, uid: string) => {
    e.preventDefault(); e.stopPropagation()
    const drag = dndDragRef.current
    if (!drag) { endDnd(); return }
    const pos = rowMidPos(e)
    if (drag.kind === 'pkg') {
      const draggedUids = checkedPkgs.size > 0 && checkedPkgs.has(drag.uid)
        ? new Set([...checkedPkgs]) : new Set([drag.uid])
      const selected = items.filter(i => draggedUids.has(i.uid))
      const rest = items.filter(i => !draggedUids.has(i.uid))
      const targetIdx = rest.findIndex(i => i.uid === uid)
      if (targetIdx >= 0) {
        const at = pos === 'above' ? targetIdx : targetIdx + 1
        dispatch({ type: 'FT_REORDER', items: [...rest.slice(0, at), ...selected, ...rest.slice(at)] })
      }
    } else {
      // Linha arrastada para cima de um pacote → anexa ao final
      const allDraggedIds = checkedLines.size > 0 && checkedLines.has(drag.lineId)
        ? new Set([...checkedLines]) : new Set([drag.lineId])
      const allDragged: FineTuningLine[] = []
      for (const it of items) for (const l of it.lines) if (allDraggedIds.has(l.id)) allDragged.push(l)
      const newItems = items.map(it => ({ ...it, lines: it.lines.filter(l => !allDraggedIds.has(l.id)) }))
      const targetItemIdx = newItems.findIndex(i => i.uid === uid)
      if (targetItemIdx >= 0) {
        const targetItem = newItems[targetItemIdx]
        const moved = allDragged.map((l, i) => ({ ...l, id: `${uid}_mv${Date.now()}_${i}` }))
        newItems[targetItemIdx] = { ...targetItem, expanded: true, lines: [...targetItem.lines, ...moved] }
        dispatch({ type: 'FT_REORDER', items: newItems })
        setCheckedLines(new Set(moved.map(l => l.id))); setCheckedPkgs(new Set())
      }
    }
    endDnd()
  }
  const handleLineDragStart = (e: React.DragEvent<HTMLButtonElement>, uid: string, lineId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `${uid}:${lineId}`)
    const drag: DndDrag = { kind: 'line', uid, lineId }
    dndDragRef.current = drag
    setDndDrag(drag)
    const count = checkedLines.size > 1 && checkedLines.has(lineId) ? checkedLines.size : 1
    if (count > 1) {
      const ghost = document.createElement('div')
      ghost.textContent = `${count} linhas`
      ghost.style.cssText = 'position:fixed;top:-1000px;padding:3px 10px;background:#6366f1;color:#fff;border-radius:6px;font-size:12px;font-family:sans-serif;white-space:nowrap;'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 14)
      setTimeout(() => document.body.removeChild(ghost), 0)
    }
  }
  const handleLineDragOver = (e: React.DragEvent<HTMLTableRowElement>, uid: string, lineId: string) => {
    e.preventDefault(); e.stopPropagation()
    if (dndDragRef.current?.kind !== 'line') return
    const pos = rowMidPos(e)
    setDndDrop({ kind: 'line', uid, lineId, pos })
  }
  const handleLineDrop = (e: React.DragEvent<HTMLTableRowElement>, targetUid: string, targetLineId: string) => {
    e.preventDefault(); e.stopPropagation()
    const drag = dndDragRef.current
    if (!drag || drag.kind !== 'line') { endDnd(); return }
    const pos = rowMidPos(e)
    const allDraggedIds = checkedLines.size > 0 && checkedLines.has(drag.lineId)
      ? new Set([...checkedLines]) : new Set([drag.lineId])
    const allDragged: FineTuningLine[] = []
    for (const it of items) for (const l of it.lines) if (allDraggedIds.has(l.id)) allDragged.push(l)
    const newItems = items.map(it => ({ ...it, lines: it.lines.filter(l => !allDraggedIds.has(l.id)) }))
    const targetItemIdx = newItems.findIndex(i => i.uid === targetUid)
    if (targetItemIdx >= 0) {
      const targetItem = newItems[targetItemIdx]
      const targetLineIdx = targetItem.lines.findIndex(l => l.id === targetLineId)
      const at = targetLineIdx < 0 ? targetItem.lines.length : (pos === 'above' ? targetLineIdx : targetLineIdx + 1)
      const moved = allDragged.map((l, i) => ({ ...l, id: `${targetUid}_mv${Date.now()}_${i}` }))
      newItems[targetItemIdx] = { ...targetItem, expanded: true, lines: [...targetItem.lines.slice(0, at), ...moved, ...targetItem.lines.slice(at)] }
      dispatch({ type: 'FT_REORDER', items: newItems })
      setCheckedLines(new Set(moved.map(l => l.id))); setCheckedPkgs(new Set())
    }
    endDnd()
  }

  useEffect(() => {
    if (!contextMenu) return
    const dismiss = () => setContextMenu(null)
    window.addEventListener('click', dismiss)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null) }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('click', dismiss); window.removeEventListener('keydown', onKey) }
  }, [contextMenu])

  const prevPkgUid = (uid: string): string | null => {
    const realItems = items.filter(i => !i.isBlank)
    const idx = realItems.findIndex(i => i.uid === uid)
    return idx > 0 ? realItems[idx - 1].uid : null
  }
  const prevLineId = (uid: string, lineId: string): string | null => {
    const item = items.find(i => i.uid === uid)
    if (!item) return null
    const idx = item.lines.findIndex(l => l.id === lineId)
    return idx > 0 ? item.lines[idx - 1].id : null
  }

  const matches = useMemo(() => {
    const q = normalizeFind(findQuery.trim())
    if (!q) return [] as { id: string; uid: string }[]
    const res: { id: string; uid: string }[] = []
    for (const item of items) {
      if (item.isBlank) {
        if (normalizeFind(item.packageName).includes(q)) res.push({ id: item.uid, uid: item.uid })
        continue
      }
      if (normalizeFind(item.packageName).includes(q) || normalizeFind(item.packageId).includes(q))
        res.push({ id: item.uid, uid: item.uid })
      for (const line of item.lines)
        if (normalizeFind(line.text).includes(q)) res.push({ id: line.id, uid: item.uid })
    }
    return res
  }, [items, findQuery])

  // uid → sectionKey (mesma lógica do agrupamento por fase)
  const itemToSectionKeyMap = useMemo(() => {
    const m = new Map<string, string>()
    let lp: string | null = null
    const cnt = new Map<string, number>()
    for (const item of items) {
      if (item.isBlank) continue
      if (item.phase !== lp) {
        lp = item.phase
        cnt.set(item.phase, (cnt.get(item.phase) ?? -1) + 1)
      }
      m.set(item.uid, `${item.phase}-${cnt.get(item.phase) ?? 0}`)
    }
    return m
  }, [items])

  const expandSectionForUid = (uid: string) => {
    const key = itemToSectionKeyMap.get(uid)
    if (key) setCollapsedSections(prev => { const n = new Set(prev); n.delete(key); return n })
  }

  const gotoMatch = (idx: number) => {
    if (matches.length === 0) return
    const n = ((idx % matches.length) + matches.length) % matches.length
    setMatchIdx(n)
    const m = matches[n]
    setActiveMatchId(m.id)
    expandSectionForUid(m.uid)
    if (m.id !== m.uid) {
      const parent = items.find(i => i.uid === m.uid)
      if (parent && !parent.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: m.uid })
    }
    if (activeTab !== 'list') onTabChange('list')
  }

  // Ao alterar o termo, salta para o primeiro resultado (ou limpa o realce)
  useEffect(() => {
    if (matches.length === 0) { setActiveMatchId(null); setMatchIdx(0); return }
    gotoMatch(0)
  }, [findQuery])

  // Mantém a referência sempre atual (captura o closure mais recente)
  useEffect(() => { gotoMatchRef.current = gotoMatch })
  // Reporta contagem e índice ao pai apenas quando mudam
  useEffect(() => { onMatchChange(matches.length, matchIdx) }, [matches.length, matchIdx])

  // Scroll até o resultado ativo (com retry: a expansão do pacote é assíncrona)
  useEffect(() => {
    if (!activeMatchId) return
    let cancelled = false, attempts = 0
    let t: ReturnType<typeof setTimeout>
    const tryScroll = () => {
      if (cancelled || !scrollRef.current) return
      const el = scrollRef.current.querySelector(`[data-row-id="${activeMatchId}"]`) as HTMLElement | null
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
      if (attempts++ < 40) t = setTimeout(tryScroll, 50)
    }
    t = setTimeout(tryScroll, 30)
    return () => { cancelled = true; clearTimeout(t) }
  }, [activeMatchId])

  // Map line id -> parent pkg uid, and filter pendingReview to keep only line ids
  const lineToItemMap = new Map<string, string>()
  for (const item of items) for (const line of item.lines) lineToItemMap.set(line.id, item.uid)
  const reviewLineIds = state.pendingReview.filter(id => lineToItemMap.has(id))

  const firstReviewId = reviewLineIds[0] ?? null
  const currentReviewLineId = oneByOneMode && reviewLineIds.length > 0 ? reviewLineIds[0] : null

  useEffect(() => {
    if (reviewLineIds.length === 0) setOneByOneMode(false)
  }, [reviewLineIds.length])

  // Ativa modo 1 a 1 automaticamente quando novos itens de revisão chegam (após "Aplicar")
  const prevReviewLenRef = useRef(0)
  useEffect(() => {
    if (reviewLineIds.length > prevReviewLenRef.current && reviewLineIds.length > 0) {
      setOneByOneMode(true)
    }
    prevReviewLenRef.current = reviewLineIds.length
  }, [reviewLineIds.length])

  // Quando há um item pendente (novo apply ou avanço no modo 1 a 1), expande a seção e o pacote pai,
  // garante a aba Lista e faz scroll até a linha. Em modo 1 a 1, também seleciona a linha e abre o painel de detalhamento.
  useEffect(() => {
    if (!firstReviewId) return
    const itemUid = lineToItemMap.get(firstReviewId)
    if (!itemUid) return
    expandSectionForUid(itemUid)
    const item = items.find(i => i.uid === itemUid)
    if (item && !item.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: itemUid })
    if (activeTab !== 'list') onTabChange('list')
    if (oneByOneMode) {
      handleSelectLine(itemUid, firstReviewId)
      setShowDetail(true)
    }
  }, [firstReviewId, oneByOneMode])

  // Scroll separado para aguardar que a expansão de seção/pacote e mudança de aba estejam renderizadas
  useEffect(() => {
    if (!firstReviewId || activeTab !== 'list') return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>
    const tryScroll = (attempts: number) => {
      if (cancelled || !scrollRef.current) return
      const el = scrollRef.current.querySelector(`[data-row-id="${firstReviewId}"]`) as HTMLElement | null
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
      if (attempts < 40) timeoutId = setTimeout(() => tryScroll(attempts + 1), 50)
    }
    timeoutId = setTimeout(() => tryScroll(0), 100)
    return () => { cancelled = true; clearTimeout(timeoutId) }
  }, [firstReviewId, items, activeTab])

  useEffect(() => {
    if (!scrollRef.current) return
    const id = selectedLine?.lineId ?? (checkedPkgs.size === 1 ? [...checkedPkgs][0] : null)
    if (!id) return
    const el = scrollRef.current.querySelector(`[data-row-id="${id}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedLine?.lineId, selectedLine?.uid, checkedPkgs])

  // Locate: expand section and retry-scroll when notice is clicked
  useEffect(() => {
    if (!locateTick) return
    expandSectionForUid(locateTick.uid)
    if (activeTab !== 'list') onTabChange('list')
    const scrollTarget = selectedLine?.lineId ?? (checkedPkgs.size === 1 ? [...checkedPkgs][0] : null) ?? locateTick.uid
    let cancelled = false, attempts = 0
    let t: ReturnType<typeof setTimeout>
    const tryScroll = () => {
      if (cancelled || !scrollRef.current) return
      const el = scrollRef.current.querySelector(`[data-row-id="${scrollTarget}"]`) as HTMLElement | null
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
      if (attempts++ < 40) t = setTimeout(tryScroll, 50)
    }
    t = setTimeout(tryScroll, 30)
    return () => { cancelled = true; clearTimeout(t) }
  }, [locateTick])

  // ── Localizar campo do assistente: realça as linhas relacionadas ────────────
  const locateLineIds = useMemo(
    () => located ? lineIdsForLocate(located.target, items, state.projectData) : null,
    [located, items, state.projectData],
  )

  // Ao acionar o localizar de um campo: expande as seções/pacotes com linhas
  // realçadas, garante a aba Lista e salta para a primeira ocorrência.
  useEffect(() => {
    if (!locateLineIds || locateLineIds.size === 0) return
    const matchedIds: string[] = []   // em ordem do cronograma
    for (const item of items) {
      if (item.isBlank) continue
      const matched = item.lines.filter(l => locateLineIds.has(l.id))
      if (matched.length === 0) continue
      expandSectionForUid(item.uid)
      if (!item.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: item.uid })
      for (const l of matched) matchedIds.push(l.id)
    }
    if (activeTab !== 'list') onTabChange('list')
    if (matchedIds.length === 0) return
    // Cliques consecutivos na mesma mira percorrem as linhas destacadas (com wrap)
    const targetLineId = matchedIds[(located?.cursor ?? 0) % matchedIds.length]
    let cancelled = false, attempts = 0
    let t: ReturnType<typeof setTimeout>
    const tryScroll = () => {
      if (cancelled || !scrollRef.current) return
      const el = scrollRef.current.querySelector(`[data-row-id="${targetLineId}"]`) as HTMLElement | null
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
      if (attempts++ < 40) t = setTimeout(tryScroll, 50)
    }
    t = setTimeout(tryScroll, 30)
    return () => { cancelled = true; clearTimeout(t) }
  }, [located?.n])

  // Group items by phase (sections); blank items attach to last section
  type Section = { phase: string; sectionKey: string; items: FineTuningItem[] }
  const sections: Section[] = []
  {
    let lp: string | null = null
    const cnt = new Map<string, number>()
    for (const item of items) {
      if (item.isBlank) {
        if (sections.length > 0) sections[sections.length - 1].items.push(item)
        continue
      }
      if (item.phase !== lp) {
        lp = item.phase
        cnt.set(item.phase, (cnt.get(item.phase) ?? -1) + 1)
        sections.push({ phase: item.phase, sectionKey: `${item.phase}-${cnt.get(item.phase) ?? 0}`, items: [] })
      }
      sections[sections.length - 1].items.push(item)
    }
  }

  const toggleSection = (key: string) => setCollapsedSections(prev => {
    const next = new Set(prev)
    if (next.has(key)) {
      next.delete(key)
    } else {
      const sec = sections.find(s => s.sectionKey === key)
      if (sec?.items.some(i => checkedPkgs.has(i.uid))) return prev
      next.add(key)
    }
    return next
  })

  const grandFirme = items.filter(i => !i.isBlank).reduce((s, i) => s + pkgFirme(i), 0)
  const grandCont  = items.filter(i => !i.isBlank).reduce((s, i) => s + pkgCont(i),  0)
  const grandTotal = grandFirme + grandCont

  const realItems = items.filter(i => !i.isBlank)
  const allPkgsChecked = realItems.length > 0 && realItems.every(i => checkedPkgs.has(i.uid))
  const allLinesChecked = realItems.length > 0 && realItems.flatMap(i => i.lines).every(l => checkedLines.has(l.id))
  const anySelected = checkedPkgs.size > 0 || checkedLines.size > 0
  const allSelected = allPkgsChecked && allLinesChecked
  const allExpanded = realItems.length > 0 && realItems.every(i => i.expanded)
  const toggleAllExpand = () => {
    const next = !allExpanded
    realItems.forEach(it => { if (it.expanded !== next) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: it.uid }) })
  }

  // Aplica (ou remove, com key=undefined) o realce a todas as linhas selecionadas
  // e a todas as linhas dos pacotes selecionados.
  const applyHighlight = (key: HighlightKey | undefined) => {
    for (const it of items) {
      const pkgChecked = checkedPkgs.has(it.uid)
      for (const l of it.lines)
        if (pkgChecked || checkedLines.has(l.id))
          dispatch({ type: 'FT_UPDATE_LINE_FIELDS', uid: it.uid, lineId: l.id, patch: { highlight: key } })
    }
  }

  return (
    <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-[#f5f5f5] dark:bg-slate-900 flex flex-col min-w-0">
      {activeTab === 'gantt' ? (
        <div className="flex-1 overflow-hidden min-h-0">
          <GanttChart items={state.schedule} />
        </div>
      ) : (
        <>
      {/* Cabeçalho separado do scroll para que a barra vertical comece abaixo do azul */}
      <div ref={headerScrollRef} className="shrink-0 overflow-hidden">
        <table className="text-xs border-collapse" style={tableStyle}>
          <colgroup>
            <col style={{ width: visibleColumnWidths.number }} />
            {showPkgCol && <col style={{ width: visibleColumnWidths.package }} />}
            <col style={{ width: visibleColumnWidths.type }} />
            <col style={{ width: descriptionWidth }} />
            <col style={{ width: visibleColumnWidths.firm }} />
            <col style={{ width: visibleColumnWidths.contingency }} />
            <col style={{ width: visibleColumnWidths.total }} />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-[#004070] dark:border-slate-700 bg-[#005889] dark:bg-[#0c2340]">
              {/* Expandir/recolher todos — também abriga restauração de colunas ocultas */}
              <th className="text-left py-1 px-1 text-xs font-bold text-white dark:text-slate-300">
                <div className="flex items-center gap-1">
                  <button onClick={toggleAllExpand}
                    title={allExpanded ? 'Recolher todos os pacotes' : 'Expandir todos os pacotes'}
                    className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded text-white/70 hover:text-white dark:text-slate-400 dark:hover:text-blue-400 transition-colors">
                    {allExpanded ? <Minus size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={3} />}
                  </button>
                  <button onClick={onToggleAll}
                    title={anySelected ? 'Cancelar seleção' : 'Selecionar todas as linhas'}
                    className={`shrink-0 w-3 h-3 flex items-center justify-center rounded border transition-all ${
                      anySelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-300 dark:border-slate-600 hover:border-blue-400'
                    }`}>
                    {allSelected ? <Check size={6} strokeWidth={3} /> : anySelected ? <Minus size={6} strokeWidth={3} /> : null}
                  </button>
                  {!showPkgCol && (
                    <button onClick={() => setShowPkgCol(true)} title="Mostrar coluna Pacote"
                      className="text-[7px] font-bold text-white/60 hover:text-white dark:text-slate-600 dark:hover:text-slate-400 transition-colors select-none ml-0.5">
                      ▸P
                    </button>
                  )}
                </div>
              </th>
              {showPkgCol && (
                <th className="text-left py-1 px-2 text-xs font-bold text-white dark:text-slate-300">
                  <button onClick={() => setShowPkgCol(false)} title="Ocultar coluna Pacote"
                    className="flex items-center gap-1 group hover:text-slate-600 dark:hover:text-slate-500 transition-colors">
                    Pacote
                    <span className="opacity-0 group-hover:opacity-60 text-[9px] font-normal normal-case tracking-normal">✕</span>
                  </button>
                </th>
              )}
              <th className="py-1 px-1 text-xs font-bold text-white dark:text-slate-300">Tipo</th>
              <th className="text-left py-1 px-3 text-xs font-bold text-white dark:text-slate-300">Descrição</th>
              {showOntology ? (
                <th colSpan={3} className="text-left py-1 px-3 text-xs font-bold text-white dark:text-slate-300">Ontologia (OpenWells)</th>
              ) : showEds ? (
                <th colSpan={3} className="text-left py-1 px-3 text-xs font-bold text-white dark:text-slate-300">EDS</th>
              ) : showCsb ? (
                <th colSpan={3} className="text-left py-1 px-3 text-xs font-bold text-white dark:text-slate-300">CSB</th>
              ) : (
                <>
                  <th className="text-right py-1 px-3 text-xs font-bold text-white dark:text-blue-400">F ({unit})</th>
                  <th className="text-right py-1 px-3 text-xs font-bold text-white dark:text-rose-400">C ({unit})</th>
                  <th className="text-right py-1 px-3 text-xs font-bold text-white dark:text-slate-300">Total ({unit})</th>
                </>
              )}
            </tr>
          </thead>
        </table>
      </div>
      {/* Corpo scrollável — barra vertical começa aqui, abaixo do cabeçalho */}
      <div ref={scrollRef} className="flex-1 overflow-auto scrollbar-custom"
        onScroll={e => { if (headerScrollRef.current) headerScrollRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft }}>
        <table className="text-xs border-collapse" style={tableStyle}>
          <colgroup>
            <col style={{ width: visibleColumnWidths.number }} />
            {showPkgCol && <col style={{ width: visibleColumnWidths.package }} />}
            <col style={{ width: visibleColumnWidths.type }} />
            <col style={{ width: descriptionWidth }} />
            <col style={{ width: visibleColumnWidths.firm }} />
            <col style={{ width: visibleColumnWidths.contingency }} />
            <col style={{ width: visibleColumnWidths.total }} />
          </colgroup>
          <tbody>
            {(() => {
              let rowNum = 0
              return (
                <>
                  {sections.map(({ phase, sectionKey, items: sItems }) => {
                    const colors = PHASE_COLORS[phase] ?? PHASE_COLORS['Fase 0']
                    const isCollapsed = collapsedSections.has(sectionKey)
                    return (
                      <React.Fragment key={sectionKey}>
                        {/* Phase header — apenas a fase atual fica fixa no topo (sticky). */}
                        <tr onClick={() => toggleSection(sectionKey)} className="cursor-pointer select-none">
                          <td colSpan={showPkgCol ? 7 : 6}
                            className="py-2 px-3 bg-[#ebebeb] dark:bg-slate-800 border-y border-slate-300 dark:border-slate-700">
                            <span className="flex items-center gap-1.5">
                              <span className="font-bold text-xs leading-none text-slate-600 dark:text-slate-400">{isCollapsed ? '+' : '−'}</span>
                              <span className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">{phase}</span>
                            </span>
                          </td>
                        </tr>
                        {!isCollapsed && sItems.map(item => {
                          const rn = item.isBlank ? null : ++rowNum
                          const isPkgBeingDragged = dndDrag?.kind === 'pkg' && (
                            dndDrag.uid === item.uid || (checkedPkgs.has(dndDrag.uid) && checkedPkgs.has(item.uid))
                          )
                          const pkgDropAbove = dndDrop?.kind === 'pkg' && dndDrop.uid === item.uid && dndDrop.pos === 'above'
                          const pkgDropBelow = dndDrop?.kind === 'pkg' && dndDrop.uid === item.uid && dndDrop.pos === 'below'
                          const lineDropTarget = (dndDrop?.kind === 'line' && dndDrop.uid === item.uid)
                            ? { lineId: dndDrop.lineId, pos: dndDrop.pos }
                            : null
                          return (
                            <React.Fragment key={item.uid}>
                              {pkgDropAbove && <DropIndicatorRow colSpan={showPkgCol ? 7 : 6} />}
                              <ClassicPkgRow
                                item={item}
                                rowNum={rn}
                                isChecked={checkedPkgs.has(item.uid)}
                                onToggleCheck={() => togglePkg(item.uid)}
                                onSelectLine={lineId => handleSelectLine(item.uid, lineId)}
                                checkedLines={checkedLines}
                                multiEditLeadId={multiEditLeadId}
                                onToggleLine={toggleLine}
                                kbNavLineId={kbNav?.lineId}
                                kbNavTick={kbNav?.tick}
                                nameEditTick={nameEdit?.uid === item.uid ? nameEdit.tick : undefined}
                                onEnterFromLastLine={() => onEnterFromLastLine(item.uid)}
                                onDeleteRequest={() => setDeleteTarget({ kind: 'pkg', uid: item.uid, name: item.packageName || '(sem nome)' })}
                                onDeleteLine={lineId => {
                                  const text = item.lines.find(l => l.id === lineId)?.text ?? ''
                                  setDeleteTarget({ kind: 'line', uid: item.uid, lineId, text })
                                }}
                                showOntology={showOntology}
                                showEds={showEds}
                                showCsb={showCsb}
                                bopActiveLineIds={bopActiveLineIds}
                                showPkgCol={showPkgCol}
                                isPendingReview={state.pendingReview.includes(item.uid)}
                                currentReviewUid={currentReviewLineId}
                                matchRowId={activeMatchId}
                                highlightIds={locateLineIds}
                                onContextMenu={e => setContextMenu({ kind: 'pkg', uid: item.uid, x: e.clientX, y: e.clientY })}
                                onContextMenuLine={(uid, lineId, x, y) => setContextMenu({ kind: 'line', uid, lineId, x, y })}
                                isDragging={isPkgBeingDragged}
                                onDragHandleStart={e => handlePkgDragStart(e, item.uid)}
                                onDragHandleEnd={endDnd}
                                onRowDragOver={e => handlePkgDragOver(e, item.uid)}
                                onRowDrop={e => handlePkgDrop(e, item.uid)}
                                lineDropTarget={lineDropTarget}
                                onLineDragHandleStart={(e, lineId) => handleLineDragStart(e, item.uid, lineId)}
                                onLineDragHandleEnd={endDnd}
                                onLineDragOver={(e, lineId) => handleLineDragOver(e, item.uid, lineId)}
                                onLineDrop={(e, lineId) => handleLineDrop(e, item.uid, lineId)}
                                isDraggingLine={lineId => dndDrag?.kind === 'line' && (
                                  dndDrag.lineId === lineId || (checkedLines.has(dndDrag.lineId) && checkedLines.has(lineId))
                                )}
                              />
                              {pkgDropBelow && <DropIndicatorRow colSpan={showPkgCol ? 7 : 6} />}
                            </React.Fragment>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </>
              )
            })()}
          </tbody>
          {!showOntology && !showEds && !showCsb && items.some(i => !i.isBlank) && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-[#fafafa] dark:bg-slate-800">
                <td colSpan={showPkgCol ? 4 : 3} className="py-2 px-3 text-xs font-bold text-slate-600 dark:text-slate-400 text-right uppercase tracking-wide">
                  Total
                </td>
                <td className="py-2 px-3 text-right text-xs font-bold font-mono text-[#0c2340] dark:text-blue-400">
                  {grandFirme > 0 ? <>{fmt(grandFirme)}<span className="text-[9px] ml-0.5 text-slate-500 dark:text-slate-600 font-normal">{unit}</span></> : <span className="text-slate-300 dark:text-slate-700 select-none">—</span>}
                </td>
                <td className="py-2 px-3 text-right text-xs font-bold font-mono text-[#7d1935] dark:text-rose-400">
                  {grandCont > 0 ? <>{fmt(grandCont)}<span className="text-[9px] ml-0.5 text-slate-500 dark:text-slate-600 font-normal">{unit}</span></> : <span className="text-slate-300 dark:text-slate-700 select-none">—</span>}
                </td>
                <td className="py-2 px-3 text-right text-xs font-bold font-mono text-[#0c2340] dark:text-white">
                  {fmt(grandTotal)}<span className="text-[9px] ml-0.5 text-slate-500 dark:text-slate-600 font-normal">{unit}</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
        </>
      )}
      {/* Context menu */}
      {contextMenu && (() => {
        const isTargetSelected = contextMenu.kind === 'pkg'
          ? checkedPkgs.has(contextMenu.uid)
          : (contextMenu.lineId ? checkedLines.has(contextMenu.lineId) : false)
        const hasSelection = checkedPkgs.size > 0 || checkedLines.size > 0
        const showMoveOptions = !isTargetSelected && hasSelection

        const handleCopyCtx = () => {
          if (contextMenu.kind === 'pkg') {
            const toCopy = checkedPkgs.size > 0 ? items.filter(i => checkedPkgs.has(i.uid)) : items.filter(i => i.uid === contextMenu.uid)
            setCopyBuffer({ kind: 'pkg', items: toCopy })
            setCheckedPkgs(new Set()); setCheckedLines(new Set())
          } else {
            const toCopy = checkedLines.size > 0
              ? items.flatMap(i => i.lines).filter(l => checkedLines.has(l.id))
              : contextMenu.lineId ? items.flatMap(i => i.lines).filter(l => l.id === contextMenu.lineId) : []
            if (toCopy.length) { setCopyBuffer({ kind: 'line', lines: toCopy }); setCheckedLines(new Set()); setSelectedLine(null) }
          }
          setContextMenu(null)
        }

        const handlePasteCtx = (above: boolean) => {
          if (!copyBuffer) return
          if (copyBuffer.kind === 'pkg') {
            const clones = copyBuffer.items.map(clonePkg)
            const idx = items.findIndex(i => i.uid === contextMenu.uid)
            const at = above ? Math.max(0, idx) : idx + 1
            dispatch({ type: 'FT_REORDER', items: [...items.slice(0, at), ...clones, ...items.slice(at)] })
            setCheckedPkgs(new Set(clones.map(c => c.uid))); setCheckedLines(new Set())
          } else {
            const targetUid = contextMenu.uid
            const targetItem = items.find(i => i.uid === targetUid)
            if (!targetItem || !contextMenu.lineId) return
            const clones = copyBuffer.lines.map((l, i) => cloneLine(l, targetUid, i))
            const lineIdx = targetItem.lines.findIndex(l => l.id === contextMenu.lineId)
            const at = above ? lineIdx : lineIdx + 1
            if (!targetItem.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: targetUid })
            dispatch({ type: 'FT_REORDER_LINES', uid: targetUid, lines: [...targetItem.lines.slice(0, at), ...clones, ...targetItem.lines.slice(at)] })
            setCheckedLines(new Set(clones.map(c => c.id))); setCheckedPkgs(new Set())
          }
          setCopyBuffer(null); setContextMenu(null)
        }

        const handleMoveCtx = (above: boolean) => {
          if (checkedPkgs.size > 0 && contextMenu.kind === 'pkg') {
            const selectedUids = new Set([...checkedPkgs])
            const selected = items.filter(i => selectedUids.has(i.uid))
            const rest = items.filter(i => !selectedUids.has(i.uid))
            const restIdx = rest.findIndex(i => i.uid === contextMenu.uid)
            if (restIdx < 0) return
            const at = above ? restIdx : restIdx + 1
            dispatch({ type: 'FT_REORDER', items: [...rest.slice(0, at), ...selected, ...rest.slice(at)] })
          } else if (checkedLines.size > 0 && contextMenu.kind === 'line' && contextMenu.lineId) {
            // Cross-package move: collect selected lines in schedule order, remove from all packages,
            // insert at target position (which may be in a different package)
            const allSelected: FineTuningLine[] = []
            for (const it of items)
              for (const l of it.lines)
                if (checkedLines.has(l.id)) allSelected.push(l)

            const newItems = items.map(it => ({ ...it, lines: it.lines.filter(l => !checkedLines.has(l.id)) }))
            const targetItemIdx = newItems.findIndex(i => i.uid === contextMenu.uid)
            if (targetItemIdx < 0) return
            const targetItem = newItems[targetItemIdx]
            const targetLineIdx = targetItem.lines.findIndex(l => l.id === contextMenu.lineId)
            const at = targetLineIdx < 0
              ? (above ? 0 : targetItem.lines.length)
              : (above ? targetLineIdx : targetLineIdx + 1)
            const moved = allSelected.map((l, i) => ({ ...l, id: `${contextMenu.uid}_mv${Date.now()}_${i}` }))
            newItems[targetItemIdx] = { ...targetItem, expanded: true, lines: [...targetItem.lines.slice(0, at), ...moved, ...targetItem.lines.slice(at)] }
            dispatch({ type: 'FT_REORDER', items: newItems })
            setCheckedLines(new Set(moved.map(l => l.id)))
            setCheckedPkgs(new Set())
          }
          setContextMenu(null)
        }

        // Split current package at the clicked line and open picker between the two halves
        const handleSplitInsert = (above: boolean) => {
          if (contextMenu.kind !== 'line' || !contextMenu.lineId) return
          const origItem = items.find(i => i.uid === contextMenu.uid)
          if (!origItem) return
          const lineIdx = origItem.lines.findIndex(l => l.id === contextMenu.lineId)
          if (lineIdx < 0) return
          const splitAt = above ? lineIdx : lineIdx + 1
          const linesA = origItem.lines.slice(0, splitAt)
          const linesB = origItem.lines.slice(splitAt)
          // Edge: clicking the very first or last line → just insert at package boundary
          if (linesA.length === 0) { setPickerAfterUid(prevPkgUid(contextMenu.uid)); setContextMenu(null); return }
          if (linesB.length === 0) { setPickerAfterUid(contextMenu.uid); setContextMenu(null); return }
          const uidB = `${origItem.uid}_sp${Date.now()}`
          const pkgA = { ...origItem, lines: linesA }
          const pkgB = { ...origItem, uid: uidB, lines: linesB.map((l, i) => ({ ...l, id: `${uidB}_l${i}` })) }
          const pkgIdx = items.findIndex(i => i.uid === contextMenu.uid)
          dispatch({ type: 'FT_REORDER', items: [...items.slice(0, pkgIdx), pkgA, pkgB, ...items.slice(pkgIdx + 1)] })
          // Open picker to insert between the two halves (after pkgA = origItem.uid)
          setPickerAfterUid(origItem.uid)
          setContextMenu(null)
        }

        const btn = 'w-full text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors'
        const btnSec = 'w-full text-left px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors'
        const btnMove = 'w-full text-left px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 transition-colors'
        const sep = <div className="border-t border-slate-200 dark:border-slate-700 my-1" />

        return (
          <div
            className="fixed z-50 bg-[#f5f5f5] dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 py-1 min-w-[200px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}>
            {showMoveOptions ? (
              <>
                <button className={btnMove} onClick={() => handleMoveCtx(true)}>↑ Mover selecionados acima</button>
                <button className={btnMove} onClick={() => handleMoveCtx(false)}>↓ Mover selecionados abaixo</button>
                {sep}
              </>
            ) : null}
            {contextMenu.kind === 'line' && (
              <>
                <button className={btn} onClick={() => {
                  if (contextMenu.lineId) dispatch({ type: 'FT_INSERT_LINE_AFTER', uid: contextMenu.uid, afterLineId: prevLineId(contextMenu.uid, contextMenu.lineId) })
                  setContextMenu(null)
                }}>↑ Inserir linha acima</button>
                <button className={btn} onClick={() => {
                  if (contextMenu.lineId) dispatch({ type: 'FT_INSERT_LINE_AFTER', uid: contextMenu.uid, afterLineId: contextMenu.lineId })
                  setContextMenu(null)
                }}>↓ Inserir linha abaixo</button>
                {sep}
              </>
            )}
            <button className={btn} onClick={() => { setPickerAfterUid(prevPkgUid(contextMenu.uid)); setContextMenu(null) }}>↑ Inserir pacote acima</button>
            <button className={btn} onClick={() => { setPickerAfterUid(contextMenu.uid); setContextMenu(null) }}>↓ Inserir pacote abaixo</button>
            {contextMenu.kind === 'line' && (
              <>
                <button className={btnSec} onClick={() => handleSplitInsert(true)}>↑ Dividir pacote e inserir acima desta linha</button>
                <button className={btnSec} onClick={() => handleSplitInsert(false)}>↓ Dividir pacote e inserir abaixo desta linha</button>
              </>
            )}
            <button className={btnSec} onClick={() => { onInsertManual(prevPkgUid(contextMenu.uid)); setContextMenu(null) }}>↑ Inserir manualmente acima</button>
            <button className={btnSec} onClick={() => { onInsertManual(contextMenu.uid); setContextMenu(null) }}>↓ Inserir manualmente abaixo</button>
            {sep}
            <button className={btn} onClick={handleCopyCtx}>⎘ Copiar</button>
            {copyBuffer && (
              <>
                {sep}
                <button className={btn} onClick={() => handlePasteCtx(true)}>↑ Colar acima</button>
                <button className={btn} onClick={() => handlePasteCtx(false)}>↓ Colar abaixo</button>
              </>
            )}
            {/* Cores de realce */}
            {(checkedPkgs.size > 0 || checkedLines.size > 0) && (
              <>
                {sep}
                <div className="px-3 py-1.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-wider shrink-0">Cor</span>
                  {HIGHLIGHT_KEYS.map(key => {
                    const c = getHighlightColors()[key]
                    return (
                      <button
                        key={key}
                        onClick={() => { applyHighlight(key); setContextMenu(null) }}
                        title={c.label}
                        style={{ backgroundColor: isDarkMode() ? c.text : c.bg, boxShadow: `0 0 0 1.5px ${c.ring}` }}
                        className="w-4 h-4 rounded-full transition-transform hover:scale-110 focus:outline-none shrink-0"
                      />
                    )
                  })}
                  <button
                    onClick={() => { applyHighlight(undefined); setContextMenu(null) }}
                    title="Remover cor"
                    className="w-4 h-4 rounded-full flex items-center justify-center border border-slate-300 dark:border-slate-600 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors bg-white dark:bg-slate-800 shrink-0"
                  >
                    <X size={8} />
                  </button>
                </div>
              </>
            )}
            {/* Excluir */}
            {sep}
            {isTargetSelected && (checkedPkgs.size > 0 || checkedLines.size > 0) ? (
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                onClick={() => { setDeleteTarget({ kind: 'bulk', pkgCount: checkedPkgs.size, lineCount: checkedLines.size }); setContextMenu(null) }}>
                <span className="flex items-center gap-1.5"><Trash2 size={11} /> Excluir selecionados ({checkedPkgs.size + checkedLines.size})</span>
              </button>
            ) : contextMenu.kind === 'pkg' ? (
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                onClick={() => {
                  const item = items.find(i => i.uid === contextMenu.uid)
                  if (item) setDeleteTarget({ kind: 'pkg', uid: contextMenu.uid, name: item.packageName })
                  setContextMenu(null)
                }}>
                <span className="flex items-center gap-1.5"><Trash2 size={11} /> Excluir pacote</span>
              </button>
            ) : contextMenu.lineId ? (
              <button
                className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                onClick={() => {
                  const line = items.find(i => i.uid === contextMenu.uid)?.lines.find(l => l.id === contextMenu.lineId)
                  if (line) setDeleteTarget({ kind: 'line', uid: contextMenu.uid, lineId: contextMenu.lineId!, text: line.text })
                  setContextMenu(null)
                }}>
                <span className="flex items-center gap-1.5"><Trash2 size={11} /> Excluir linha</span>
              </button>
            ) : null}
          </div>
        )
      })()}
      {pickerAfterUid !== 'NONE' && (
        <PackagePickerModal afterUid={pickerAfterUid as string | null} onClose={() => setPickerAfterUid('NONE')} />
      )}
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────

type DeleteTarget =
  | { kind: 'pkg';  uid: string; name: string }
  | { kind: 'line'; uid: string; lineId: string; text: string }
  | { kind: 'bulk'; pkgCount: number; lineCount: number }

export function FineTuningView() {
  const { state, dispatch, canUndo, canRedo } = useApp()
  const items = state.fineTuningItems

  const [selectedLine,  setSelectedLine]  = useState<{ uid: string; lineId: string } | null>(null)
  const [checkedPkgs,   setCheckedPkgs]   = useState<Set<string>>(new Set())
  const [checkedLines,  setCheckedLines]  = useState<Set<string>>(new Set())
  const [copyBuffer,    setCopyBuffer]    = useState<CopyBuffer | null>(null)
  const [locateTick,    setLocateTick]    = useState<{ uid: string; n: number } | null>(null)
  const [located,       setLocated]       = useState<{ target: LocateTarget; n: number; cursor: number } | null>(null)
  const [kbNav,         setKbNav]         = useState<{ lineId: string; tick: number } | null>(null)
  const [nameEdit,      setNameEdit]      = useState<{ uid: string; tick: number } | null>(null)
  const [deleteTarget,  setDeleteTarget]  = useState<DeleteTarget | null>(null)
  const [activeTab,     setActiveTab]     = useState<'list' | 'gantt'>('list')
  const [findQuery,     setFindQuery]     = useState('')
  const [matchCount,    setMatchCount]    = useState(0)
  const [matchIdx,      setMatchIdx]      = useState(0)
  const gotoMatchRef = useRef<((idx: number) => void) | null>(null)
  const [showDetail,    setShowDetail]    = useState(false)
  const [showStats,     setShowStats]     = useState(false)
  const [showOntology,  setShowOntology]  = useState(false)
  const [showEds,       setShowEds]       = useState(false)
  const [showCsb,       setShowCsb]       = useState(false)
  const [oneByOneMode,  setOneByOneMode]  = useState(false) // revisão de alterações (barra no assistente)

  // Alterna os modos de colunas (Ontologia/EDS/CSB), mutuamente exclusivos. Ao ativar um,
  // oculta as estatísticas e expande TODOS os pacotes. Os efeitos colaterais ficam no
  // handler do clique (não dentro de um updater de setState — que roda 2× em StrictMode e
  // anularia o FT_TOGGLE_EXPAND).
  const enterColMode = (target: 'ontology' | 'eds' | 'csb') => {
    const turnOn = target === 'ontology' ? !showOntology : target === 'eds' ? !showEds : !showCsb
    setShowOntology(turnOn && target === 'ontology')
    setShowEds(turnOn && target === 'eds')
    setShowCsb(turnOn && target === 'csb')
    if (turnOn) {
      setShowStats(false)
      items.forEach(it => { if (!it.isBlank && !it.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: it.uid }) })
    }
  }
  const [assistMin,     setAssistMin]     = useState(false) // assistente de preenchimento minimizado

  // Linha representativa do painel de Detalhamento: a linha selecionada ou, quando
  // não há seleção única mas há linhas marcadas (inclusive todas as linhas dos pacotes
  // selecionados — togglePkg marca cada linha do pacote), a primeira linha marcada em
  // ordem do cronograma. Assim o painel abre na seleção múltipla e as edições, via
  // confirmação, são aplicadas a todas as linhas marcadas em conjunto.
  const detailLine = useMemo(() => {
    if (selectedLine) return selectedLine
    if (checkedLines.size === 0) return null
    for (const it of items)
      for (const l of it.lines)
        if (checkedLines.has(l.id)) return { uid: it.uid, lineId: l.id }
    return null
  }, [selectedLine, checkedLines, items])

  // ── Contagens de atenção para os botões Ontologia / EDS / CSB ────────────────
  // Ontologia: linhas em fases mapeadas com qualquer campo (fase/atividade/operação/etapa) vazio.
  const nOntology = useMemo(() => {
    let n = 0
    for (const item of items) {
      if (item.isBlank) continue
      for (const line of item.lines)
        if (hasIncompleteOntology(line, item.phase)) n++
    }
    return n
  }, [items])

  // Intervalo BOP ativo (para filtrar linhas com EDS relevante).
  const bopLineIdsForBadge = useMemo(() => {
    const set = new Set<string>()
    let active = false
    for (const it of items) {
      for (const ln of it.lines) {
        if (ln.bopMarker === 'CONNECT_BOP') active = true
        if (active) set.add(ln.id)
        if (ln.bopMarker === 'DISCONNECT_BOP') active = false
      }
    }
    return set
  }, [items])

  // EDS: linhas com BOP ativo onde edsNumber ainda não foi selecionado (undefined).
  const nEds = useMemo(() =>
    items.filter(i => !i.isBlank).flatMap(i => i.lines)
      .filter(l => bopLineIdsForBadge.has(l.id) && l.edsNumber == null).length
  , [items, bopLineIdsForBadge])

  // CSB: linhas operacionais (não-nav) com csbPrimario ou csbSecundario em branco.
  const nCsb = useMemo(() =>
    items.filter(i => !i.isBlank).flatMap(i => i.lines)
      .filter(l => !l.isNavLine && (!l.csbPrimario || !l.csbSecundario)).length
  , [items])

  // Ao marcar pacote(s), abre o painel de Detalhamento para edição em conjunto.
  useEffect(() => {
    if (checkedPkgs.size > 0) setShowDetail(true)
  }, [checkedPkgs])

  // Ao marcar qualquer checkbox, retrair o assistente de preenchimento.
  useEffect(() => {
    if (checkedPkgs.size > 0 || checkedLines.size > 0) setAssistMin(true)
  }, [checkedPkgs, checkedLines])

  // Refs de navegação por teclado (âncora e cursor para seleção com Shift)
  const navAnchorRef = useRef<number>(-1)
  const navCursorRef = useRef<number>(-1)


  // Panel widths
  const containerRef = useRef<HTMLDivElement>(null)
  const [leftPct,   setLeftPct]   = useState(22)
  const [rightPct,  setRightPct]  = useState(20)
  const [detailPct, setDetailPct] = useState(20)
  const [firmeColW, setFirmeColW] = useState(52)
  const [contColW,  setContColW]  = useState(52)

  const startResize = (side: 'left' | 'right' | 'detail' | 'firme' | 'cont') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const snap = { leftPct, rightPct, detailPct, firmeColW, contColW }
    const containerW = containerRef.current?.offsetWidth ?? window.innerWidth
    const onMove = (pe: PointerEvent) => {
      const dx = pe.clientX - startX
      const dxPct = (dx / containerW) * 100
      if      (side === 'left')   setLeftPct(Math.max(12, Math.min(45, snap.leftPct + dxPct)))
      else if (side === 'right')  setRightPct(Math.max(12, Math.min(45, snap.rightPct - dxPct)))
      else if (side === 'detail') setDetailPct(Math.max(12, Math.min(45, snap.detailPct - dxPct)))
      else if (side === 'firme')  setFirmeColW(Math.max(32, Math.min(140, snap.firmeColW - dx)))
      else                        setContColW(Math.max(32, Math.min(140, snap.contColW - dx)))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const togglePkg = (uid: string) => {
    navAnchorRef.current = -1; navCursorRef.current = -1
    setSelectedLine(null)
    setCheckedPkgs(prev => {
      const s = new Set(prev)
      const wasChecked = s.has(uid)
      wasChecked ? s.delete(uid) : s.add(uid)
      const pkg = items.find(i => i.uid === uid)
      if (pkg) {
        setCheckedLines(prevLines => {
          const ls = new Set(prevLines)
          for (const line of pkg.lines) wasChecked ? ls.delete(line.id) : ls.add(line.id)
          return ls
        })
      }
      return s
    })
  }
  const toggleLine = (lineId: string) => {
    setCheckedPkgs(new Set())
    const willCheck = !checkedLines.has(lineId)
    setCheckedLines(prev => { const s = new Set(prev); willCheck ? s.add(lineId) : s.delete(lineId); return s })
    // Ao MARCAR, foca a linha e abre o detalhamento; ao DESMARCAR, limpa a seleção
    // para o painel não continuar mostrando a linha quando nada está selecionado.
    if (willCheck) {
      const parent = items.find(it => it.lines.some(l => l.id === lineId))
      if (parent) { setSelectedLine({ uid: parent.uid, lineId }); setShowDetail(true) }
    } else {
      setSelectedLine(null)
    }
  }

  const toggleAllPkgs = () => {
    // Havendo qualquer seleção (pacotes ou linhas), cancela tudo; senão, seleciona tudo.
    if (checkedPkgs.size > 0 || checkedLines.size > 0) {
      setCheckedPkgs(new Set())
      setCheckedLines(new Set())
    } else {
      const realItems = items.filter(i => !i.isBlank)
      setCheckedPkgs(new Set(realItems.map(i => i.uid)))
      setCheckedLines(new Set(realItems.flatMap(i => i.lines.map(l => l.id))))
    }
  }

  const handleSelectLine = (uid: string, lineId: string) => {
    navAnchorRef.current = -1; navCursorRef.current = -1
    setSelectedLine({ uid, lineId })
    setCheckedPkgs(new Set())
    setCheckedLines(new Set([lineId]))
    setShowDetail(true)
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Esc limpa o realce de "localizar campo" (mesmo com foco num input do assistente)
      if (e.key === 'Escape' && located) setLocated(null)
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key === 'Escape') {
        setCheckedPkgs(new Set())
        setCheckedLines(new Set())
        setSelectedLine(null)
        return
      }

      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
        return
      }

      // Refazer: Ctrl+Y ou Ctrl+Shift+Z
      if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey))
        || ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }

      if (e.key === 'Enter') {
        const enterTarget = checkedPkgs.size === 1 ? [...checkedPkgs][0] : null
        if (enterTarget) {
          e.preventDefault()
          dispatch({ type: 'FT_TOGGLE_EXPAND', uid: enterTarget })
          return
        }
        if (selectedLine) {
          e.preventDefault()
          setKbNav(prev => ({ lineId: selectedLine.lineId, tick: (prev?.tick ?? 0) + 1 }))
        }
        return
      }

      if (e.key === 'Delete') {
        if (checkedPkgs.size > 0 || checkedLines.size > 0) {
          e.preventDefault()
          setDeleteTarget({ kind: 'bulk', pkgCount: checkedPkgs.size, lineCount: checkedLines.size })
        } else if (selectedLine) {
          e.preventDefault()
          const lineItem = items.find(i => i.uid === selectedLine.uid)
          const lineObj  = lineItem?.lines.find(l => l.id === selectedLine.lineId)
          setDeleteTarget({ kind: 'line', uid: selectedLine.uid, lineId: selectedLine.lineId, text: lineObj?.text ?? '' })
        }
        return
      }

      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        if (checkedPkgs.size > 0) {
          e.preventDefault()
          const copied = items.filter(i => checkedPkgs.has(i.uid))
          setCopyBuffer({ kind: 'pkg', items: copied })
          setCheckedPkgs(new Set())
          setCheckedLines(new Set())
        } else if (checkedLines.size > 0) {
          e.preventDefault()
          const lines: FineTuningLine[] = []
          for (const item of items) for (const l of item.lines) if (checkedLines.has(l.id)) lines.push(l)
          if (lines.length > 0) {
            setCopyBuffer({ kind: 'line', lines })
            setCheckedLines(new Set())
            setSelectedLine(null)
          }
        }
        return
      }

      if (e.key === 'x' && (e.ctrlKey || e.metaKey)) {
        if (checkedPkgs.size > 0) {
          e.preventDefault()
          setCopyBuffer({ kind: 'pkg', items: items.filter(i => checkedPkgs.has(i.uid)) })
          for (const uid of checkedPkgs) dispatch({ type: 'FT_REMOVE_ITEM', uid })
          setCheckedPkgs(new Set())
        } else if (checkedLines.size > 0) {
          e.preventDefault()
          const lines: FineTuningLine[] = []
          for (const item of items) for (const l of item.lines) if (checkedLines.has(l.id)) lines.push(l)
          if (lines.length > 0) {
            setCopyBuffer({ kind: 'line', lines })
            for (const item of items)
              for (const line of item.lines)
                if (checkedLines.has(line.id)) dispatch({ type: 'FT_REMOVE_LINE', uid: item.uid, lineId: line.id })
            setCheckedLines(new Set())
          }
        }
        return
      }

      if (e.key === 'v' && (e.ctrlKey || e.metaKey) && copyBuffer) {
        e.preventDefault()
        if (copyBuffer.kind === 'pkg') {
          const clones = copyBuffer.items.map(clonePkg)
          // posição = após o destino marcado, ignorando os próprios itens copiados
          const copiedUids = new Set(copyBuffer.items.map(i => i.uid))
          const destChecked = [...checkedPkgs].filter(uid => !copiedUids.has(uid))
          const checkedIdxs = destChecked.map(uid => items.findIndex(i => i.uid === uid)).filter(n => n >= 0)
          const lastIdx = checkedIdxs.length > 0 ? Math.max(...checkedIdxs) : items.length - 1
          const at = lastIdx < 0 ? items.length : lastIdx + 1
          dispatch({ type: 'FT_REORDER', items: [...items.slice(0, at), ...clones, ...items.slice(at)] })
          setCopyBuffer(null)
          // Selecionar os itens colados (realce = checkbox)
          const firstCloneUid = clones[0]?.uid ?? null
          setCheckedPkgs(new Set(clones.map(c => c.uid)))
          setCheckedLines(new Set(clones.flatMap(c => c.lines.map(l => l.id))))
          if (firstCloneUid) setLocateTick(prev => ({ uid: firstCloneUid, n: (prev?.n ?? 0) + 1 }))
        } else {
          const copiedIds = new Set(copyBuffer.lines.map(l => l.id))
          const destLineIds = [...checkedLines].filter(id => !copiedIds.has(id))
          const targetUid = selectedLine?.uid
            ?? (destLineIds.length ? (items.find(it => it.lines.some(l => l.id === destLineIds[destLineIds.length - 1]))?.uid ?? null) : null)
          if (!targetUid) return
          const targetItem = items.find(i => i.uid === targetUid)
          if (!targetItem) return
          const clones = copyBuffer.lines.map((l, i) => cloneLine(l, targetUid, i))
          const destInTarget = destLineIds.map(id => targetItem.lines.findIndex(l => l.id === id)).filter(n => n >= 0)
          const lastLineIdx = destInTarget.length > 0
            ? Math.max(...destInTarget)
            : selectedLine
              ? targetItem.lines.findIndex(l => l.id === selectedLine.lineId)
              : targetItem.lines.length - 1
          const at = lastLineIdx + 1
          if (!targetItem.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: targetUid })
          dispatch({ type: 'FT_REORDER_LINES', uid: targetUid, lines: [...targetItem.lines.slice(0, at), ...clones, ...targetItem.lines.slice(at)] })
          setCopyBuffer(null)
          // Selecionar as linhas coladas (realce = checkbox)
          const firstCloneId = clones[0]?.id ?? null
          setCheckedPkgs(new Set())
          setCheckedLines(new Set(clones.map(c => c.id)))
          if (firstCloneId) {
            setSelectedLine({ uid: targetUid, lineId: firstCloneId })
            setLocateTick(prev => ({ uid: targetUid, n: (prev?.n ?? 0) + 1 }))
          }
        }
        return
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      type NavItem = { kind: 'pkg'; uid: string } | { kind: 'line'; uid: string; lineId: string }
      const nav: NavItem[] = []
      for (const item of items) {
        if (item.isBlank) continue
        nav.push({ kind: 'pkg', uid: item.uid })
        if (item.expanded) for (const line of item.lines) nav.push({ kind: 'line', uid: item.uid, lineId: line.id })
      }
      if (nav.length === 0) return

      // Cursor: prefere ref (válido em modo multi-seleção), cai para estado
      const primaryFocused = checkedPkgs.size === 1 ? [...checkedPkgs][0] : null
      const stateCur = selectedLine
        ? nav.findIndex(n => n.kind === 'line' && n.uid === selectedLine.uid && (n as Extract<NavItem, { kind: 'line' }>).lineId === selectedLine.lineId)
        : primaryFocused ? nav.findIndex(n => n.kind === 'pkg' && n.uid === primaryFocused) : -1
      const cur = navCursorRef.current >= 0 && stateCur < 0 ? navCursorRef.current : stateCur

      const nextIdx = e.key === 'ArrowDown' ? (cur < nav.length - 1 ? cur + 1 : 0) : (cur > 0 ? cur - 1 : nav.length - 1)
      const next = nav[nextIdx]
      navCursorRef.current = nextIdx

      if (e.shiftKey) {
        // Inicializa âncora na primeira pressão com Shift
        if (navAnchorRef.current < 0) navAnchorRef.current = cur >= 0 ? cur : nextIdx
        const from = Math.min(navAnchorRef.current, nextIdx)
        const to   = Math.max(navAnchorRef.current, nextIdx)
        const range = nav.slice(from, to + 1)
        setCheckedPkgs(new Set(range.filter(n => n.kind === 'pkg').map(n => n.uid)))
        setCheckedLines(new Set(range.filter(n => n.kind === 'line').map(n => (n as Extract<NavItem, { kind: 'line' }>).lineId)))
        if (next.kind === 'line') setSelectedLine({ uid: next.uid, lineId: (next as Extract<NavItem, { kind: 'line' }>).lineId })
        else setSelectedLine(null)
      } else {
        // Navegação normal — reposiciona âncora e cursor
        navAnchorRef.current = nextIdx
        if (next.kind === 'line') {
          const lineId = (next as Extract<NavItem, { kind: 'line' }>).lineId
          setSelectedLine({ uid: next.uid, lineId })
          setCheckedPkgs(new Set())
          setCheckedLines(new Set([lineId]))
        } else {
          setSelectedLine(null)
          setCheckedPkgs(new Set([next.uid]))
          setCheckedLines(new Set())
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [items, selectedLine, checkedPkgs, checkedLines, copyBuffer, dispatch, located])

  const handleInsertManual = (afterUid: string | null) => {
    const uid = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const lineId = `${uid}_l${Date.now()}`
    dispatch({ type: 'FT_INSERT_ITEM', afterUid, uid, lineId })
    setTimeout(() => {
      setSelectedLine({ uid, lineId })
      setNameEdit(prev => ({ uid, tick: (prev?.tick ?? 0) + 1 }))
    }, 30)
  }

  const handleEnterFromLastLineOfPkg = (pkgUid: string) => {
    const nonBlank = items.filter(i => !i.isBlank)
    const idx = nonBlank.findIndex(i => i.uid === pkgUid)
    const nextPkg = nonBlank[idx + 1]
    if (!nextPkg || nextPkg.lines.length === 0) return
    const firstLineId = nextPkg.lines[0].id
    if (!nextPkg.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: nextPkg.uid })
    setTimeout(() => {
      setSelectedLine({ uid: nextPkg.uid, lineId: firstLineId })
      setKbNav(prev => ({ lineId: firstLineId, tick: (prev?.tick ?? 0) + 1 }))
    }, 30)
  }

  const pct = state.inputs.percentile ?? 75

  const handleExportJson = () => {
    const data = buildProjectFacts(state)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.wellName || 'sprint-aban'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div ref={containerRef} className="flex h-full min-w-0 overflow-hidden">

      {/* Left — project data — full height (ou rail minimizado) */}
      {assistMin ? (
        <button
          onClick={() => setAssistMin(false)}
          title="Expandir assistente de preenchimento"
          className="shrink-0 w-9 flex flex-col items-center gap-3 py-3 bg-[#f5f5f5] dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors">
          <PanelLeftOpen size={16} />
          <span className="[writing-mode:vertical-rl] text-[10px] font-bold uppercase tracking-widest">
            Assistente de Preenchimento
          </span>
        </button>
      ) : (
        <>
          <div style={{ width: '340px' }}
            className="shrink-0 flex flex-col overflow-hidden bg-[#f5f5f5] dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700">
            <ProjectDataPanel
              locatedTarget={located?.target ?? null}
              onLocate={target => setLocated(prev => {
                // Clique consecutivo na mesma mira → avança para a próxima linha destacada
                const same = prev != null && JSON.stringify(prev.target) === JSON.stringify(target)
                return { target, n: (prev?.n ?? 0) + 1, cursor: same ? prev!.cursor + 1 : 0 }
              })}
              onClearLocate={() => setLocated(null)}
              oneByOneMode={oneByOneMode}
              setOneByOneMode={setOneByOneMode}
              onMinimize={() => setAssistMin(true)}
            />
          </div>
        </>
      )}

      {/* Center — toolbar (only here) + schedule or Gantt */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* White toolbar */}
        <div className="shrink-0 flex flex-col gap-1 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-1.5">
          {/* Buttons row */}
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={!canUndo}
              title="Desfazer (Ctrl+Z)"
              className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-700 dark:hover:text-slate-500 transition-colors px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-[#f5f5f5] dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <Undo2 size={12} /> Desfazer
            </button>
            <button
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={!canRedo}
              title="Refazer (Ctrl+Y)"
              className="flex items-center gap-1 text-xs text-slate-700 hover:text-slate-700 dark:hover:text-slate-500 transition-colors px-2 py-1 rounded border border-slate-200 dark:border-slate-600 bg-[#f5f5f5] dark:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed">
              <Redo2 size={12} /> Refazer
            </button>
            {/* Localizar */}
            {activeTab === 'list' && (
              <div className="flex items-center gap-1 py-1 px-2 rounded border border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700">
                <Search size={12} className="shrink-0 text-slate-500 dark:text-slate-400" />
                <input
                  value={findQuery}
                  onChange={e => setFindQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); gotoMatchRef.current?.(e.shiftKey ? matchIdx - 1 : matchIdx + 1) }
                    else if (e.key === 'Escape') { e.preventDefault(); setFindQuery('') }
                  }}
                  placeholder="Localizar..."
                  className="w-32 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-500"
                />
                {findQuery && (
                  <>
                    <span className="shrink-0 text-[10px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                      {matchCount ? `${matchIdx + 1}/${matchCount}` : '0/0'}
                    </span>
                    <button onClick={() => gotoMatchRef.current?.(matchIdx - 1)} disabled={!matchCount} title="Anterior (Shift+Enter)"
                      className="shrink-0 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 transition-colors">
                      <ChevronUp size={13} />
                    </button>
                    <button onClick={() => gotoMatchRef.current?.(matchIdx + 1)} disabled={!matchCount} title="Próximo (Enter)"
                      className="shrink-0 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 transition-colors">
                      <ChevronDown size={13} />
                    </button>
                    <button onClick={() => setFindQuery('')} title="Limpar (Esc)"
                      className="shrink-0 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              {/* Lista / Gantt */}
              <div className="flex gap-1 shrink-0">
                <button onClick={() => setActiveTab('list')}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${activeTab === 'list'
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                  Lista
                </button>
                <button onClick={() => setActiveTab('gantt')}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${activeTab === 'gantt'
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'}`}>
                  Gantt
                </button>
              </div>
              <button
                onClick={() => enterColMode('ontology')}
                title={showOntology
                  ? 'Voltar a exibir os tempos no cronograma'
                  : nOntology > 0
                    ? `Exibir campos de ontologia — ${nOntology} linha(s) com divergência ou sem resposta`
                    : 'Exibir campos de ontologia (OW/Genesis) no lugar dos tempos'}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  showOntology
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'
                }`}>
                Ontologia
                {!showOntology && nOntology > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-900">{nOntology}</span>
                )}
              </button>
              <button
                onClick={() => enterColMode('eds')}
                title={showEds
                  ? 'Voltar a exibir os tempos no cronograma'
                  : nEds > 0
                    ? `Exibir campos de EDS — ${nEds} linha(s) com BOP ativo sem tipo de EDS definido`
                    : 'Exibir campos de EDS (Tipo de EDS, Comentário, Compensando) no lugar dos tempos'}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  showEds
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'
                }`}>
                EDS
                {!showEds && nEds > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-900">{nEds}</span>
                )}
              </button>
              <button
                onClick={() => enterColMode('csb')}
                title={showCsb
                  ? 'Voltar a exibir os tempos no cronograma'
                  : nCsb > 0
                    ? `Exibir campos de CSB — ${nCsb} linha(s) com CSB Primário ou Secundário em branco`
                    : 'Exibir campos de CSB (Primário e Secundário) no lugar dos tempos'}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                  showCsb
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'
                }`}>
                CSB
                {!showCsb && nCsb > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-yellow-400 text-yellow-900">{nCsb}</span>
                )}
              </button>
              {showOntology && ONTOLOGY_CORRECTOR_ENABLED && (() => {
                const nMismatch = countMismatches(items)
                return (
                  <button
                    onClick={() => { if (nMismatch > 0) dispatch({ type: 'FT_REVIEW_ONTOLOGY' }) }}
                    disabled={nMismatch === 0}
                    title={nMismatch === 0
                      ? 'Ontologia coerente com as fases do cronograma'
                      : `Revisar ${nMismatch} linha(s) cuja fase OW diverge da fase do cronograma — ajusta fase, atividade, operação e etapa`}
                    className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border transition-colors ${
                      nMismatch === 0
                        ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 bg-[#f5f5f5] dark:bg-slate-800 cursor-not-allowed'
                        : 'border-amber-400 dark:border-amber-600 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900'
                    }`}>
                    <Check size={12} /> Revisar ontologia
                    {nMismatch > 0 && (
                      <span className="ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold bg-amber-500 text-white">{nMismatch}</span>
                    )}
                  </button>
                )
              })()}
              <div className="flex gap-1 shrink-0">
                <button onClick={() => state.showHours && dispatch({ type: 'TOGGLE_HOURS' })}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${!state.showHours
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'}`}>d</button>
                <button onClick={() => !state.showHours && dispatch({ type: 'TOGGLE_HOURS' })}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${state.showHours
                    ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
                    : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:border-slate-500'}`}>h</button>
              </div>
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors bg-[#008542] text-white dark:border dark:border-cyan-600/50 dark:bg-slate-700 dark:text-cyan-400 hover:opacity-90 dark:hover:border-cyan-400">
                <Download size={12} /> Finalizar Edição
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0 p-4 md:p-6 gap-3">

        {/* Copy buffer notice */}
        {copyBuffer && (
          <div
            onClick={() => {
              if (copyBuffer.kind === 'pkg' && copyBuffer.items.length > 0) {
                const uid = copyBuffer.items[0].uid
                setLocateTick(prev => ({ uid, n: (prev?.n ?? 0) + 1 }))
              } else if (copyBuffer.kind === 'line' && copyBuffer.lines.length > 0) {
                const firstLineId = copyBuffer.lines[0].id
                const parent = items.find(i => i.lines.some(l => l.id === firstLineId))
                if (parent) {
                  if (!parent.expanded) dispatch({ type: 'FT_TOGGLE_EXPAND', uid: parent.uid })
                  setSelectedLine({ uid: parent.uid, lineId: firstLineId })
                  setLocateTick(prev => ({ uid: parent.uid, n: (prev?.n ?? 0) + 1 }))
                }
              }
            }}
            className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 rounded-lg cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/40 transition-colors select-none">
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              {copyBuffer.kind === 'pkg'
                ? `${copyBuffer.items.length} pacote${copyBuffer.items.length !== 1 ? 's' : ''} copiado${copyBuffer.items.length !== 1 ? 's' : ''}`
                : `${copyBuffer.lines.length} linha${copyBuffer.lines.length !== 1 ? 's' : ''} copiada${copyBuffer.lines.length !== 1 ? 's' : ''}`}
            </span>
            <span className="text-xs text-sky-600 dark:text-sky-400">— clique aqui para localizar · marque o destino e pressione Ctrl+V</span>
            <button onClick={e => { e.stopPropagation(); setCopyBuffer(null) }} title="Cancelar cópia"
              className="ml-auto shrink-0 text-sky-400 hover:text-sky-700 dark:hover:text-sky-200 transition-colors">
              <X size={13} />
            </button>
          </div>
        )}

        {/* Main content */}
        <ClassicSchedulePanel
          selectedLine={selectedLine}
          checkedPkgs={checkedPkgs}
          checkedLines={checkedLines}
          handleSelectLine={handleSelectLine}
          togglePkg={togglePkg}
          toggleLine={toggleLine}
          onToggleAll={toggleAllPkgs}
          locateTick={locateTick}
          located={located}
          oneByOneMode={oneByOneMode}
          setOneByOneMode={setOneByOneMode}
          kbNav={kbNav}
          nameEdit={nameEdit}
          setDeleteTarget={setDeleteTarget}
          onEnterFromLastLine={handleEnterFromLastLineOfPkg}
          onInsertManual={handleInsertManual}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          setShowDetail={setShowDetail}
          showOntology={showOntology}
          showEds={showEds}
          showCsb={showCsb}
          copyBuffer={copyBuffer}
          setCopyBuffer={setCopyBuffer}
          setCheckedPkgs={setCheckedPkgs}
          setCheckedLines={setCheckedLines}
          setSelectedLine={setSelectedLine}
          findQuery={findQuery}
          setFindQuery={setFindQuery}
          gotoMatchRef={gotoMatchRef}
          onMatchChange={(count, idx) => { setMatchCount(count); setMatchIdx(idx) }}
        />
        </div>
      </div>

      {/* Detalhamento — expansível à direita / trilho quando minimizado */}
      {showDetail ? (
        <>
          <ResizeHandle onPointerDown={startResize('detail')} />
          <div style={{ width: `${detailPct}%` }}
            className="shrink-0 flex flex-col overflow-hidden bg-[#f5f5f5] dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700">
            {detailLine
              ? <LineDetailPanel uid={detailLine.uid} lineId={detailLine.lineId} checkedLines={checkedLines} onCollapse={() => setShowDetail(false)} />
              : (
                <div className="flex flex-col h-full">
                  <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest">Detalhamento</span>
                    <button onClick={() => setShowDetail(false)} title="Minimizar detalhamento"
                      className="shrink-0 -mr-1 p-1 rounded text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
                      <PanelRightClose size={15} />
                    </button>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-500 dark:text-slate-600 px-4">
                    <FileText size={28} strokeWidth={1.5} />
                    <p className="text-xs text-center leading-snug">Selecione uma linha ou pacote no cronograma para ver o detalhamento</p>
                  </div>
                </div>
              )
            }
          </div>
        </>
      ) : (
        <button onClick={() => setShowDetail(true)} title="Expandir detalhamento"
          className="shrink-0 w-9 flex flex-col items-center gap-3 py-3 bg-[#f5f5f5] dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors">
          <PanelRightOpen size={16} />
          <span className="[writing-mode:vertical-rl] text-[10px] font-bold uppercase tracking-widest">Detalhamento</span>
        </button>
      )}

      {/* Estatísticas — expansível à direita / trilho quando minimizado */}
      {showStats ? (
        <>
          <ResizeHandle onPointerDown={startResize('right')} />
          <div style={{ width: `${rightPct}%` }}
            className="shrink-0 flex flex-col overflow-hidden bg-[#f5f5f5] dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700">
            <StatsPanel onCollapse={() => setShowStats(false)} />
          </div>
        </>
      ) : (
        <button onClick={() => setShowStats(true)} title="Expandir estatísticas"
          className="shrink-0 w-9 flex flex-col items-center gap-3 py-3 bg-[#f5f5f5] dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors">
          <PanelRightOpen size={16} />
          <span className="[writing-mode:vertical-rl] text-[10px] font-bold uppercase tracking-widest">Estatísticas</span>
        </button>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-5 max-w-xs w-full mx-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <Trash2 size={18} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                  {deleteTarget.kind === 'pkg'  ? 'Remover pacote?'
                  : deleteTarget.kind === 'line' ? 'Remover linha?'
                  : `Remover ${deleteTarget.pkgCount + deleteTarget.lineCount} item(s)?`}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed line-clamp-2">
                  {deleteTarget.kind === 'pkg'  ? deleteTarget.name
                  : deleteTarget.kind === 'line' ? (deleteTarget.text || '(sem texto)')
                  : [
                      deleteTarget.pkgCount > 0 ? `${deleteTarget.pkgCount} pacote(s)` : '',
                      deleteTarget.lineCount > 0 ? `${deleteTarget.lineCount} linha(s)` : '',
                    ].filter(Boolean).join(' e ')}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (deleteTarget.kind === 'pkg') {
                    dispatch({ type: 'FT_REMOVE_ITEM', uid: deleteTarget.uid })
                  } else if (deleteTarget.kind === 'line') {
                    dispatch({ type: 'FT_REMOVE_LINE', uid: deleteTarget.uid, lineId: deleteTarget.lineId })
                  } else {
                    for (const uid of checkedPkgs) dispatch({ type: 'FT_REMOVE_ITEM', uid })
                    for (const item of items)
                      for (const line of item.lines)
                        if (checkedLines.has(line.id)) dispatch({ type: 'FT_REMOVE_LINE', uid: item.uid, lineId: line.id })
                    setCheckedPkgs(new Set())
                    setCheckedLines(new Set())
                  }
                  setDeleteTarget(null)
                }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition-colors">
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
