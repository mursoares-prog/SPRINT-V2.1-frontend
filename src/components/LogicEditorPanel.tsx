/**
 * Editor de engine de sequenciamento — Admin UI
 * Usa o mesmo fluxograma SVG interativo: clique para editar perguntas, respostas
 * e pacotes; botões para adicionar/remover decisões e pernas de resposta.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Layers, GitBranch, Plus, Trash2, Save, RotateCcw, Check, Copy, X, AlertCircle, Download, ChevronLeft } from 'lucide-react'
import type { LSec, LDec, LAns, LPkg } from '../data/logicSecs'
import { LOGIC_BY_SCOPE } from '../data/logicSecs'
import {
  getLogicScopes, getLogicScope, saveLogicScope,
  createLogicScope, deleteLogicScope, type LogicScopeMeta,
} from '../utils/api'
import { isAdmin, authHeader } from '../utils/auth'
import { PACKAGES } from '../data/packages'
import { setLogicOverrides, getLogicOverride } from '../data/logicOverrideStore'
import { LogicGraphPanel, type EditAction } from './LogicGraphPanel'
import { LogicCanvasPanel } from './LogicCanvasPanel'

// ─── Constantes ───────────────────────────────────────────────────────────────

const BUNDLE_LABELS: Record<string, string> = {
  FSU_TT_FT: 'FSU · TT-FT', FSU_TT_BDC: 'FSU · TT-BDC',
  FSU_Conv_BOP: 'FSU · Conv-BOP', FSU_Conv_RCMA: 'FSU · Conv-RCMA',
  FSU_Sup_COP: 'FSU · Sup-COP', FSU_Sup_PWC: 'FSU · Sup-PWC',
  FS1_Mec: 'FS1 · Mec',
  FS2_Conv_BOP: 'FS2 · Conv-BOP', FS2_Conv_RCMA: 'FS2 · Conv-RCMA',
  FS2_Sup_COP: 'FS2 · Sup-COP', FS2_Sup_PWC: 'FS2 · Sup-PWC',
  MOB_DESCIDA: 'MOB · Descida',
}
const BUNDLE_IDS = Object.keys(BUNDLE_LABELS)

function uid() { return `_${Math.random().toString(36).slice(2,9)}` }
function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }

function emptyDec(): LDec {
  return { question: 'Nova pergunta', answers: [{ label: 'Sim', packages: [] }, { label: 'Não', active: true, packages: [] }] }
}

function emptySection(): LSec {
  return { id: `sec_${uid()}`, label: 'Nova seção', phase: 'Fase 1A', color: 'blue', decisions: [] }
}

// Catálogo de decisões de todos os bundles (deduplicated by question)
function buildDecisionTemplates(): LDec[] {
  const seen = new Set<string>()
  const result: LDec[] = []
  for (const secs of Object.values(LOGIC_BY_SCOPE)) {
    for (const sec of secs) {
      for (const dec of sec.decisions) {
        if (!seen.has(dec.question)) {
          seen.add(dec.question)
          result.push({ ...dec, answers: dec.answers.map(a => ({ ...a, packages: [] })) })
        }
      }
    }
  }
  return result
}

// ─── Package picker modal ─────────────────────────────────────────────────────

function PackagePicker({ onSelect, onClose }: {
  onSelect: (id: string, name: string) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const pkgs = Object.values(PACKAGES)
  const filtered = q.trim()
    ? pkgs.filter(p => p.id.toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()))
    : pkgs
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[75vh]">
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
            <button key={p.id} onClick={() => { onSelect(p.id, p.name); onClose() }}
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

// ─── Modal de edição de texto (pergunta ou rótulo de resposta) ────────────────

// ─── Goto picker modal ────────────────────────────────────────────────────────

function GoToPickerModal({ secs, onSelect, onClose }: {
  secs: LSec[]; onSelect: (question: string) => void; onClose: () => void
}) {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const filtered = secs.map(sec => ({
    ...sec,
    decisions: sec.decisions.filter(d => !ql || d.question.toLowerCase().includes(ql)),
  })).filter(sec => sec.decisions.length > 0)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[70vh]"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
          <span className="text-sm font-semibold text-amber-400 flex-1">⇢ Ligar a pergunta</span>
          <button onClick={onClose}><X size={14} className="text-slate-400" /></button>
        </div>
        <div className="px-3 py-2 border-b border-slate-700/60">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && (q ? setQ('') : onClose())}
            placeholder="Filtrar perguntas…"
            className="w-full text-xs bg-slate-800 rounded-lg px-3 py-1.5 text-slate-200 placeholder:text-slate-500 outline-none border border-slate-700 focus:border-amber-500"
          />
        </div>
        <div className="overflow-y-auto p-3 space-y-3">
          {filtered.map((sec, si) => (
            <div key={si}>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 px-1">{sec.label}</div>
              {sec.decisions.map((dec, di) => (
                <button key={di} onClick={() => onSelect(dec.question)}
                  className="w-full text-left text-xs px-3 py-1.5 rounded-lg hover:bg-amber-600/20 hover:text-amber-300 text-slate-300 border border-transparent hover:border-amber-600/30 transition-colors">
                  {dec.question}
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-[11px] text-slate-500 px-3 py-2">Nenhuma pergunta encontrada.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Text edit modal ──────────────────────────────────────────────────────────

function TextEditModal({ title, initial, onSave, onClose }: {
  title: string; initial: string; onSave: (v: string) => void; onClose: () => void
}) {
  const [val, setVal] = useState(initial)
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-400">{title}</p>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSave(val.trim() || initial); if (e.key === 'Escape') onClose() }}
          className="w-full text-sm bg-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none border border-slate-700 focus:border-[#d97706]/60" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-slate-400 px-3 py-1.5 rounded-lg border border-slate-700">Cancelar</button>
          <button onClick={() => onSave(val.trim() || initial)}
            className="text-xs text-white bg-[#d97706] hover:bg-amber-600 px-3 py-1.5 rounded-lg font-semibold">OK</button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal seletor de fase ────────────────────────────────────────────────────

const PHASES: { label: string; color: 'gray' | 'blue' | 'amber' }[] = [
  { label: 'Fase 0',          color: 'gray'  },
  { label: 'Fase 1A',         color: 'blue'  },
  { label: 'Fase 1B',         color: 'blue'  },
  { label: 'Fase 2',          color: 'amber' },
  { label: 'Extra Abandono',  color: 'amber' },
  { label: 'Mobilização',     color: 'gray'  },
  { label: 'Desmobilização',  color: 'gray'  },
]

const PHASE_COLOR_MAP: Record<string, 'gray' | 'blue' | 'amber'> = Object.fromEntries(
  PHASES.map(p => [p.label, p.color])
)

function PhasePickerModal({ current, onPick, onClose }: {
  current: string; onPick: (phase: string, color: 'gray' | 'blue' | 'amber') => void; onClose: () => void
}) {
  const colorDot: Record<'gray'|'blue'|'amber', string> = {
    gray: 'bg-slate-400', blue: 'bg-indigo-400', amber: 'bg-amber-400'
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-72 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-300">Selecionar fase</p>
          <button onClick={onClose}><X size={13} className="text-slate-400" /></button>
        </div>
        <div className="space-y-1">
          {PHASES.map(p => (
            <button key={p.label} onClick={() => onPick(p.label, p.color)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors
                ${current === p.label
                  ? 'bg-slate-700 text-slate-100 ring-1 ring-[#d97706]/60'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${colorDot[p.color]}`} />
              <span className="text-xs font-medium">{p.label}</span>
              {current === p.label && <span className="ml-auto text-[#d97706] text-xs">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Modal seletor de decisão (template, em branco ou de outro escopo) ────────

function DecisionPickerModal({ overrides, currentScopeId, loadScopeSections, onPick, onClose }: {
  overrides: LogicScopeMeta[]
  currentScopeId: string | null
  loadScopeSections: (id: string) => Promise<LSec[]>
  onPick: (dec: LDec) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<'library' | 'scope'>('library')
  const [q, setQ] = useState('')
  const templates = useMemo(buildDecisionTemplates, [])
  const filtered = q.trim()
    ? templates.filter(t => t.question.toLowerCase().includes(q.toLowerCase()))
    : templates

  // State for "De outro escopo" tab
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [sourceSecs, setSourceSecs] = useState<LSec[]>([])
  const [secIdx, setSecIdx] = useState<number | null>(null)
  const [loadingSrc, setLoadingSrc] = useState(false)

  const scopeOptions = [
    ...BUNDLE_IDS.filter(id => id !== currentScopeId).map(id => ({ id, label: BUNDLE_LABELS[id], isCustom: false })),
    ...overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId).map(o => ({ id: o.scopeId, label: o.label ?? o.scopeId, isCustom: true })),
  ]

  const handleSelectSource = async (id: string) => {
    setSourceId(id); setSecIdx(null); setLoadingSrc(true)
    try { setSourceSecs(await loadScopeSections(id)) } catch { setSourceSecs([]) }
    finally { setLoadingSrc(false) }
  }

  const selectedSec = secIdx !== null ? sourceSecs[secIdx] : null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
          <span className="text-sm font-semibold text-slate-100 flex-1">Adicionar decisão</span>
          <button onClick={onClose}><X size={14} className="text-slate-400" /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 pt-3 pb-2">
          <button onClick={() => setTab('library')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all
              ${tab === 'library' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            Biblioteca
          </button>
          <button onClick={() => setTab('scope')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all
              ${tab === 'scope' ? 'bg-[#d97706] text-slate-900' : 'text-slate-500 hover:text-slate-300'}`}>
            De outro escopo
          </button>
        </div>

        {tab === 'library' ? (
          <>
            <div className="px-4 pb-2 space-y-2 border-b border-slate-700/60">
              <button onClick={() => onPick(emptyDec())}
                className="w-full text-left text-xs text-[#d97706] font-semibold py-2 px-3 rounded-xl border border-dashed border-[#d97706]/40 hover:bg-[#d97706]/10 transition-colors">
                ✦ Nova decisão em branco (Sim / Não)
              </button>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrar decisões pré-existentes…"
                className="w-full text-xs bg-slate-800 rounded-lg px-3 py-1.5 text-slate-200 placeholder:text-slate-500 outline-none" />
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              <p className="text-[9px] text-slate-600 uppercase tracking-widest px-4 py-1.5">
                Biblioteca de decisões (pacotes zerados)
              </p>
              {filtered.map((t, i) => (
                <button key={i} onClick={() => onPick(t)}
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-800 transition-colors border-b border-slate-800/60 last:border-0">
                  <p className="text-xs text-slate-200 font-medium">{t.question}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{t.answers.map(a => a.label).join(' · ')}</p>
                </button>
              ))}
              {!filtered.length && <p className="text-xs text-slate-500 px-4 py-4">Nenhuma decisão encontrada.</p>}
            </div>
          </>
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Scope list */}
            <div className="w-40 shrink-0 border-r border-slate-700/40 py-1 overflow-y-auto">
              {scopeOptions.filter(s => !s.isCustom).length > 0 && (
                <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 py-1">Bundle</p>
              )}
              {scopeOptions.filter(s => !s.isCustom).map(s => (
                <button key={s.id} onClick={() => handleSelectSource(s.id)}
                  className={`w-full text-left px-3 py-2 text-[11px] transition-colors
                    ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                  {s.label}
                </button>
              ))}
              {scopeOptions.some(s => s.isCustom) && (
                <>
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 pt-2 pb-1">Customizados</p>
                  {scopeOptions.filter(s => s.isCustom).map(s => (
                    <button key={s.id} onClick={() => handleSelectSource(s.id)}
                      className={`w-full text-left px-3 py-2 text-[11px] transition-colors
                        ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                      {s.label}
                    </button>
                  ))}
                </>
              )}
            </div>

            {/* Section / decision browser */}
            <div className="flex-1 flex flex-col min-h-0">
              {!sourceId && (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-xs text-center px-4">
                  Selecione um escopo para ver suas decisões
                </div>
              )}
              {sourceId && loadingSrc && (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Carregando…</div>
              )}
              {sourceId && !loadingSrc && !selectedSec && (
                <div className="flex-1 overflow-y-auto py-1">
                  {sourceSecs.map((sec, i) => (
                    <button key={i} onClick={() => setSecIdx(i)}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-800 border-b border-slate-800/60 last:border-0 transition-colors">
                      <p className="text-xs font-medium text-slate-200">{sec.label}</p>
                      <p className="text-[10px] text-slate-500">{sec.phase} · {sec.decisions.length} decisões</p>
                    </button>
                  ))}
                  {sourceSecs.length === 0 && (
                    <p className="text-xs text-slate-500 px-3 py-4">Nenhuma seção encontrada.</p>
                  )}
                </div>
              )}
              {sourceId && !loadingSrc && selectedSec && (
                <>
                  <div className="px-3 py-2 border-b border-slate-700/40 flex items-center gap-1.5">
                    <button onClick={() => setSecIdx(null)}
                      className="text-slate-400 hover:text-slate-200 transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-[11px] font-semibold text-slate-300 truncate">{selectedSec.label}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto py-1">
                    {selectedSec.decisions.map((dec, i) => (
                      <button key={i} onClick={() => onPick(deepClone(dec))}
                        className="w-full text-left px-3 py-2.5 hover:bg-slate-800 border-b border-slate-800/60 last:border-0 transition-colors">
                        <p className="text-xs font-medium text-slate-200">{dec.question}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {dec.answers.map(a => `${a.label}${(a.packages?.length ?? 0) > 0 ? ` (${a.packages!.length} pkgs)` : ''}`).join(' · ')}
                        </p>
                      </button>
                    ))}
                    {selectedSec.decisions.length === 0 && (
                      <p className="text-xs text-slate-500 px-3 py-4">Nenhuma decisão nesta seção.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Modal: importar seções de outro escopo ───────────────────────────────────

function ImportSectionModal({ overrides, currentScopeId, loadScopeSections, onImport, onClose }: {
  overrides: LogicScopeMeta[]
  currentScopeId: string | null
  loadScopeSections: (id: string) => Promise<LSec[]>
  onImport: (sections: LSec[]) => void
  onClose: () => void
}) {
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [sourceSecs, setSourceSecs] = useState<LSec[]>([])
  const [loadingSrc, setLoadingSrc] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const scopeOptions = [
    ...BUNDLE_IDS.filter(id => id !== currentScopeId).map(id => ({ id, label: BUNDLE_LABELS[id], isCustom: false })),
    ...overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId).map(o => ({ id: o.scopeId, label: o.label ?? o.scopeId, isCustom: true })),
  ]

  const handleSelectSource = async (id: string) => {
    setSourceId(id); setSelected(new Set()); setLoadingSrc(true)
    try { setSourceSecs(await loadScopeSections(id)) } catch { setSourceSecs([]) }
    finally { setLoadingSrc(false) }
  }

  const toggleSec = (i: number) =>
    setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const handleImport = () => {
    const secs = sourceSecs.filter((_, i) => selected.has(i))
    if (secs.length > 0) onImport(deepClone(secs))
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
          <Download size={14} className="text-[#d97706]" />
          <span className="text-sm font-semibold text-slate-100 flex-1">Importar seções de outro escopo</span>
          <button onClick={onClose}><X size={14} className="text-slate-400" /></button>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* Scope list */}
          <div className="w-44 shrink-0 border-r border-slate-700/40 py-2 overflow-y-auto">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 pb-1">Bundle</p>
            {scopeOptions.filter(s => !s.isCustom).map(s => (
              <button key={s.id} onClick={() => handleSelectSource(s.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors
                  ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                {s.label}
              </button>
            ))}
            {scopeOptions.some(s => s.isCustom) && (
              <>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 pt-3 pb-1">Customizados</p>
                {scopeOptions.filter(s => s.isCustom).map(s => (
                  <button key={s.id} onClick={() => handleSelectSource(s.id)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors
                      ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                    {s.label}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Section selector */}
          <div className="flex-1 flex flex-col min-h-0">
            {!sourceId && (
              <div className="flex-1 flex items-center justify-center text-slate-600 text-xs text-center px-4">
                Selecione um escopo à esquerda
              </div>
            )}
            {sourceId && loadingSrc && (
              <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">Carregando…</div>
            )}
            {sourceId && !loadingSrc && (
              <>
                <div className="px-4 py-2 border-b border-slate-700/40">
                  <p className="text-[10px] text-slate-400">Selecione as seções a importar (serão adicionadas ao final)</p>
                </div>
                <div className="flex-1 overflow-y-auto py-1">
                  {sourceSecs.map((sec, i) => (
                    <button key={i} onClick={() => toggleSec(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-2
                        ${selected.has(i) ? 'bg-[#d97706]/10 border-[#d97706]' : 'hover:bg-slate-800 border-transparent'}`}>
                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border
                        ${selected.has(i) ? 'bg-[#d97706] border-[#d97706]' : 'border-slate-600'}`}>
                        {selected.has(i) && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-200">{sec.label}</p>
                        <p className="text-[10px] text-slate-500">
                          {sec.phase} · {sec.decisions.length} decisões{sec.always?.length ? ` · ${sec.always.length} sempre` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                  {sourceSecs.length === 0 && (
                    <p className="text-xs text-slate-500 px-4 py-4">Nenhuma seção encontrada.</p>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-slate-700/40 flex justify-end gap-2">
                  <button onClick={onClose} className="text-xs text-slate-400 px-3 py-1.5 rounded-lg border border-slate-700">Cancelar</button>
                  <button disabled={selected.size === 0} onClick={handleImport}
                    className="text-xs text-white bg-[#d97706] hover:bg-amber-600 px-4 py-1.5 rounded-lg font-semibold disabled:opacity-40">
                    Importar {selected.size > 0 ? `(${selected.size})` : ''}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Modal: escolher escopo base ──────────────────────────────────────────────

function BasePickerModal({ overrides, currentScopeId, onPick, onClose }: {
  overrides: LogicScopeMeta[]; currentScopeId: string | null
  onPick: (sourceId: string) => void; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-700">
          <Copy size={14} className="text-[#d97706]" />
          <span className="text-sm font-semibold text-slate-100 flex-1">Escolher escopo base</span>
          <button onClick={onClose}><X size={14} className="text-slate-400" /></button>
        </div>
        <p className="text-[11px] text-slate-500 px-5 pt-3 pb-1">
          As seções e decisões deste escopo serão copiadas como ponto de partida.
        </p>
        <div className="flex-1 overflow-y-auto py-2">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest px-5 py-1">Bundle</p>
          {BUNDLE_IDS.filter(id => id !== currentScopeId).map(id => (
            <button key={id} onClick={() => onPick(id)}
              className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800 text-left transition-colors">
              <Layers size={12} className="text-slate-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-200">{BUNDLE_LABELS[id]}</p>
                <p className="text-[10px] text-slate-500">{(LOGIC_BY_SCOPE[id] ?? []).length} seções</p>
              </div>
            </button>
          ))}
          {overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId).length > 0 && (
            <>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest px-5 py-1 mt-1">Customizados</p>
              {overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId).map(o => (
                <button key={o.scopeId} onClick={() => onPick(o.scopeId)}
                  className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800 text-left transition-colors">
                  <GitBranch size={12} className="text-[#d97706] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-200">{o.label ?? o.scopeId}</p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal: novo escopo customizado ──────────────────────────────────────────

function NewScopeModal({ onSave, onClose }: {
  onSave: (scopeId: string, label: string) => void; onClose: () => void
}) {
  const [scopeId, setScopeId] = useState('')
  const [label, setLabel] = useState('')
  const valid = scopeId.trim() && label.trim() && !BUNDLE_IDS.includes(scopeId.trim())
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-[#d97706]" />
          <span className="text-sm font-semibold text-slate-100">Novo escopo customizado</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Após criar, escolha um escopo base e edite no fluxograma.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-slate-400">ID único</label>
            <input value={scopeId} onChange={e => setScopeId(e.target.value.replace(/\s/g,''))}
              placeholder="ex: FSU_Custom_01"
              className="w-full mt-1 text-sm bg-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none border border-slate-700 focus:border-[#d97706]/60" />
            {scopeId && BUNDLE_IDS.includes(scopeId) && <p className="text-[10px] text-rose-400 mt-0.5">ID reservado.</p>}
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Rótulo</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: FSU customizado"
              className="w-full mt-1 text-sm bg-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none border border-slate-700 focus:border-[#d97706]/60" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-slate-400 rounded-lg border border-slate-700">Cancelar</button>
          <button disabled={!valid} onClick={() => valid && onSave(scopeId.trim(), label.trim())}
            className="px-4 py-1.5 text-sm bg-[#d97706] hover:bg-amber-600 text-white rounded-lg disabled:opacity-40 font-semibold">
            Criar
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export function LogicEditorPanel({ canEdit }: { canEdit: boolean }) {
  const [overrides, setOverrides] = useState<LogicScopeMeta[]>([])
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const [sections, setSections] = useState<LSec[]>([])
  const [baseLabel, setBaseLabel] = useState<string | null>(null)
  const [mode, setMode] = useState<'flow' | 'canvas'>('flow')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNewScope, setShowNewScope] = useState(false)
  const [showBasePicker, setShowBasePicker] = useState(false)
  const [showImportSection, setShowImportSection] = useState(false)
  const [pendingGoto, setPendingGoto] = useState<{ si: number; di: number; ai: number } | null>(null)

  // Add-package pending location
  const [pendingAdd, setPendingAdd] = useState<
    | { kind: 'pkg'; secIdx: number; decIdx: number; ansIdx: number }
    | { kind: 'always'; secIdx: number }
    | { kind: 'seq_pkg'; secIdx: number; decIdx: number; ansIdx: number; seqIdx: number }
    | { kind: 'dec_after_pkg'; secIdx: number; decIdx: number; afterIdx: number }
    | null
  >(null)

  // Text editing modal
  const [textEdit, setTextEdit] = useState<{
    title: string; initial: string
    onSave: (v: string) => void
  } | null>(null)

  // Decision picker pending location
  const [pendingDec, setPendingDec] = useState<{ secIdx: number; afterDecIdx: number } | null>(null)

  // Phase picker
  const [phasePick, setPhasePick] = useState<{ secIdx: number; current: string } | null>(null)

  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  const scopeList = [
    ...BUNDLE_IDS.map(id => ({ scopeId: id, label: BUNDLE_LABELS[id], isCustom: false })),
    ...overrides.filter(o => o.isCustom).map(o => ({ scopeId: o.scopeId, label: o.label ?? o.scopeId, isCustom: true })),
  ]

  const hasOverride = (scopeId: string) => overrides.some(o => o.scopeId === scopeId)

  const loadScopes = useCallback(async () => {
    try { setOverrides(await getLogicScopes()) } catch { /* offline */ }
  }, [])

  useEffect(() => { void loadScopes() }, [loadScopes])

  const selectScope = async (scopeId: string) => {
    if (dirty && !confirm('Há alterações não salvas. Descartar?')) return
    setSelectedScope(scopeId)
    setSections([])
    setDirty(false); setError(null); setBaseLabel(null)

    const memOverride = getLogicOverride(scopeId)
    if (memOverride) { setSections(memOverride as LSec[]); setBaseLabel('override salvo'); return }
    if (hasOverride(scopeId)) {
      setLoading(true)
      try { const d = await getLogicScope(scopeId); setSections(d.sections as LSec[]); setBaseLabel('override salvo')
      } catch { setError('Erro ao carregar override.') } finally { setLoading(false) }
      return
    }
    if (BUNDLE_IDS.includes(scopeId)) {
      setSections(deepClone(LOGIC_BY_SCOPE[scopeId] ?? []))
      setBaseLabel('bundle (não modificado)'); return
    }
    setShowBasePicker(true)
  }

  const loadScopeSections = useCallback(async (sourceId: string): Promise<LSec[]> => {
    if (hasOverride(sourceId)) {
      return deepClone((await getLogicScope(sourceId)).sections as LSec[])
    }
    return deepClone(LOGIC_BY_SCOPE[sourceId] ?? [])
  }, [overrides]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyBase = async (sourceId: string) => {
    setShowBasePicker(false); setLoading(true)
    try {
      let src: LSec[] = hasOverride(sourceId)
        ? deepClone((await getLogicScope(sourceId)).sections as LSec[])
        : deepClone(LOGIC_BY_SCOPE[sourceId] ?? [])
      setSections(src)
      setBaseLabel(`baseado em ${BUNDLE_LABELS[sourceId] ?? sourceId}`)
      setDirty(true)
    } catch { setError('Erro ao carregar escopo base.') } finally { setLoading(false) }
  }

  // ── Handler central de edições do fluxograma ──────────────────────────────

  const handleEditAction = useCallback((action: EditAction) => {
    const secs: LSec[] = deepClone(sectionsRef.current)

    switch (action.type) {

      case 'remove_pkg': {
        const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]
        if (!ans) return
        ans.packages = (ans.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      case 'remove_always': {
        const sec = secs[action.secIdx]; if (!sec) return
        sec.always = (sec.always ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      case 'add_pkg':
        setPendingAdd({ kind: 'pkg', secIdx: action.secIdx, decIdx: action.decIdx, ansIdx: action.ansIdx })
        return

      case 'add_always':
        setPendingAdd({ kind: 'always', secIdx: action.secIdx })
        return

      case 'edit_question': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        setTextEdit({
          title: 'Editar pergunta',
          initial: action.current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const d2 = s2[action.secIdx]?.decisions[action.decIdx]; if (!d2) return
            d2.question = v; setSections(s2); setDirty(true); setTextEdit(null)
          },
        })
        return
      }

      case 'edit_answer': {
        const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]; if (!ans) return
        setTextEdit({
          title: 'Editar rótulo da resposta',
          initial: action.current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const a2 = s2[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]; if (!a2) return
            a2.label = v; setSections(s2); setDirty(true); setTextEdit(null)
          },
        })
        return
      }

      case 'toggle_default': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        dec.answers.forEach((a, i) => { a.active = (i === action.ansIdx) ? !a.active : false })
        break
      }

      case 'remove_answer': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        if (dec.answers.length <= 1) { alert('A decisão precisa ter ao menos uma resposta.'); return }
        dec.answers = dec.answers.filter((_, i) => i !== action.ansIdx)
        break
      }

      case 'add_answer': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        dec.answers.push({ label: 'Nova resposta', packages: [] })
        break
      }

      case 'remove_decision': {
        const sec = secs[action.secIdx]; if (!sec) return
        sec.decisions = sec.decisions.filter((_, i) => i !== action.decIdx)
        break
      }

      case 'remove_section': {
        if (secs.length <= 1) { alert('O escopo precisa ter ao menos uma seção.'); return }
        secs.splice(action.secIdx, 1)
        break
      }

      case 'edit_section_phase':
        setPhasePick({ secIdx: action.secIdx, current: action.current })
        return

      case 'add_decision':
        setPendingDec({ secIdx: action.secIdx, afterDecIdx: action.afterDecIdx })
        return

      case 'add_section':
        secs.splice(action.afterSecIdx + 1, 0, emptySection())
        break

      case 'move_section': {
        const target = action.dir === 'up' ? action.secIdx - 1 : action.secIdx + 1
        if (target < 0 || target >= secs.length) return
        ;[secs[action.secIdx], secs[target]] = [secs[target], secs[action.secIdx]]
        break
      }

      case 'edit_section_label': {
        setTextEdit({
          title: 'Editar nome da seção',
          initial: action.current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const sec = s2[action.secIdx]; if (!sec) return
            sec.label = v; setSections(s2); setDirty(true); setTextEdit(null)
          },
        })
        return
      }

      case 'set_goto': {
        if (action.current !== undefined) {
          // Clear existing goto
          const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]
          if (!ans) return
          ans.goto = undefined
          break
        }
        // Open picker to choose target
        setPendingGoto({ si: action.secIdx, di: action.decIdx, ai: action.ansIdx })
        return
      }

      case 'add_seq': {
        const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]
        if (!ans) return
        ans.seq = [...(ans.seq ?? []), { label: 'Sequencial', packages: [] }]
        break
      }

      case 'remove_seq': {
        const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]
        if (!ans) return
        ans.seq = (ans.seq ?? []).filter((_, i) => i !== action.seqIdx)
        if (ans.seq.length === 0) delete ans.seq
        break
      }

      case 'edit_seq_label': {
        const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]
        if (!ans) return
        setTextEdit({
          title: 'Editar rótulo da resposta sequencial',
          initial: action.current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const se = s2[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]?.seq?.[action.seqIdx]
            if (!se) return
            se.label = v; setSections(s2); setDirty(true); setTextEdit(null)
          },
        })
        return
      }

      case 'add_seq_pkg':
        setPendingAdd({ kind: 'seq_pkg', secIdx: action.secIdx, decIdx: action.decIdx, ansIdx: action.ansIdx, seqIdx: action.seqIdx })
        return

      case 'remove_seq_pkg': {
        const ans = secs[action.secIdx]?.decisions[action.decIdx]?.answers[action.ansIdx]
        const se = ans?.seq?.[action.seqIdx]
        if (!se) return
        se.packages = (se.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      case 'add_dec_after': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]
        if (!dec) return
        dec.after = [...(dec.after ?? []), { label: 'Após convergência', packages: [] }]
        break
      }

      case 'remove_dec_after': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]
        if (!dec) return
        dec.after = (dec.after ?? []).filter((_, i) => i !== action.afterIdx)
        if (dec.after.length === 0) delete dec.after
        break
      }

      case 'edit_dec_after_label': {
        setTextEdit({
          title: 'Editar rótulo após convergência',
          initial: action.current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const ae = s2[action.secIdx]?.decisions[action.decIdx]?.after?.[action.afterIdx]
            if (!ae) return
            ae.label = v; setSections(s2); setDirty(true); setTextEdit(null)
          },
        })
        return
      }

      case 'add_dec_after_pkg':
        setPendingAdd({ kind: 'dec_after_pkg', secIdx: action.secIdx, decIdx: action.decIdx, afterIdx: action.afterIdx })
        return

      case 'remove_dec_after_pkg': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]
        const ae = dec?.after?.[action.afterIdx]
        if (!ae) return
        ae.packages = (ae.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      default: return
    }

    setSections(secs); setDirty(true)
  }, [])

  // Alterar fase de uma seção
  const handlePhasePick = (phase: string, color: 'gray' | 'blue' | 'amber') => {
    if (!phasePick) return
    const secs = deepClone(sectionsRef.current) as LSec[]
    const sec = secs[phasePick.secIdx]; if (!sec) return
    sec.phase = phase; sec.color = color
    setSections(secs); setDirty(true); setPhasePick(null)
  }

  // Inserir decisão (do picker) na posição certa
  const handleInsertDecision = (dec: LDec) => {
    if (!pendingDec) return
    const secs = deepClone(sectionsRef.current) as LSec[]
    const sec = secs[pendingDec.secIdx]; if (!sec) return
    sec.decisions.splice(pendingDec.afterDecIdx + 1, 0, dec)
    setSections(secs); setDirty(true); setPendingDec(null)
  }

  // Adicionar pacote (do picker) na posição certa
  const handlePackagePick = (id: string, name: string) => {
    if (!pendingAdd) return
    const pkg: LPkg = { id, name }
    const secs = deepClone(sectionsRef.current) as LSec[]
    if (pendingAdd.kind === 'always') {
      const sec = secs[pendingAdd.secIdx]; if (!sec) return
      sec.always = [...(sec.always ?? []), pkg]
    } else if (pendingAdd.kind === 'seq_pkg') {
      const se = secs[pendingAdd.secIdx]?.decisions[pendingAdd.decIdx]?.answers[pendingAdd.ansIdx]?.seq?.[pendingAdd.seqIdx]
      if (!se) return
      se.packages = [...(se.packages ?? []), pkg]
    } else if (pendingAdd.kind === 'dec_after_pkg') {
      const ae = secs[pendingAdd.secIdx]?.decisions[pendingAdd.decIdx]?.after?.[pendingAdd.afterIdx]
      if (!ae) return
      ae.packages = [...(ae.packages ?? []), pkg]
    } else {
      const ans = secs[pendingAdd.secIdx]?.decisions[pendingAdd.decIdx]?.answers[pendingAdd.ansIdx]; if (!ans) return
      ans.packages = [...(ans.packages ?? []), pkg]
    }
    setSections(secs); setDirty(true); setPendingAdd(null)
  }

  const save = async () => {
    if (!selectedScope || !canEdit) return
    setSaving(true); setError(null)
    try {
      await saveLogicScope(selectedScope, sections as unknown[], authHeader())
      const map: Record<string, unknown[]> = {}
      scopeList.forEach(s => { const ov = getLogicOverride(s.scopeId); if (ov) map[s.scopeId] = ov as unknown[] })
      map[selectedScope] = sections
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLogicOverrides(map as any)
      setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 2500)
      await loadScopes()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const restore = async () => {
    if (!selectedScope || !confirm('Restaurar ao bundle original?')) return
    try {
      await deleteLogicScope(selectedScope, authHeader())
      const map: Record<string, unknown[]> = {}
      scopeList.forEach(s => { const ov = getLogicOverride(s.scopeId); if (ov && s.scopeId !== selectedScope) map[s.scopeId] = ov as unknown[] })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLogicOverrides(map as any)
      await loadScopes()
      setSections(deepClone(LOGIC_BY_SCOPE[selectedScope] ?? []))
      setBaseLabel('bundle (restaurado)'); setDirty(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao restaurar') }
  }

  const handleImportSections = (importedSecs: LSec[]) => {
    const secs = deepClone(sectionsRef.current) as LSec[]
    for (const sec of importedSecs) secs.push({ ...sec, id: `sec_${uid()}` })
    setSections(secs); setDirty(true); setShowImportSection(false)
  }

  const handleCreateScope = async (scopeId: string, label: string) => {
    try {
      await createLogicScope({ scopeId, label, sections: [] }, authHeader())
      setShowNewScope(false); await loadScopes()
      setSelectedScope(scopeId); setSections([]); setDirty(false); setError(null); setBaseLabel(null)
      setShowBasePicker(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao criar escopo') }
  }

  const handleDeleteCustom = async (scopeId: string) => {
    if (!confirm(`Apagar "${scopeId}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteLogicScope(scopeId, authHeader())
      if (selectedScope === scopeId) { setSelectedScope(null); setSections([]) }
      await loadScopes()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao apagar') }
  }

  const selectedMeta = scopeList.find(s => s.scopeId === selectedScope)

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar ── */}
      <div className="w-52 shrink-0 border-r border-slate-700/40 flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-700/30 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Escopos</span>
          {isAdmin() && (
            <button onClick={() => setShowNewScope(true)} title="Novo escopo"
              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#d97706] hover:bg-slate-700/50 transition-colors">
              <Plus size={13} />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          <p className="text-[9px] px-3 pt-2 pb-0.5 text-slate-600 uppercase tracking-widest">Bundle</p>
          {scopeList.filter(s => !s.isCustom).map(s => (
            <button key={s.scopeId} onClick={() => selectScope(s.scopeId)}
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors rounded-lg mx-1 w-[calc(100%-0.5rem)]
                ${selectedScope === s.scopeId ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
              <Layers size={10} className="shrink-0 opacity-50" />
              <span className="flex-1 truncate">{s.label}</span>
              {hasOverride(s.scopeId) && <span className="w-1.5 h-1.5 rounded-full bg-[#d97706] shrink-0" title="Override ativo" />}
            </button>
          ))}
          {scopeList.some(s => s.isCustom) && (
            <>
              <p className="text-[9px] px-3 pt-3 pb-0.5 text-slate-600 uppercase tracking-widest">Customizados</p>
              {scopeList.filter(s => s.isCustom).map(s => (
                <div key={s.scopeId}
                  className={`flex items-center rounded-lg mx-1 group transition-colors
                    ${selectedScope === s.scopeId ? 'bg-slate-700/60' : 'hover:bg-slate-800/50'}`}>
                  <button onClick={() => selectScope(s.scopeId)}
                    className="flex-1 flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 min-w-0">
                    <GitBranch size={10} className="shrink-0 text-[#d97706]/70" />
                    <span className="flex-1 truncate">{s.label}</span>
                  </button>
                  {isAdmin() && (
                    <button onClick={() => handleDeleteCustom(s.scopeId)}
                      className="shrink-0 pr-2 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-rose-400 transition-opacity">
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Área principal ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {!selectedScope ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center space-y-2">
              <Layers size={28} className="opacity-20 mx-auto" />
              <p className="text-sm">Selecione um escopo para configurar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-700/40 shrink-0 flex-wrap">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold text-slate-100">{selectedMeta?.label ?? selectedScope}</h2>
                {baseLabel && mode === 'flow' && <p className="text-[10px] text-slate-500 mt-0.5">Base: {baseLabel}</p>}
              </div>

              {/* Tabs fluxo / canvas */}
              <div className="flex items-center bg-slate-800/70 rounded-xl p-0.5 gap-0.5">
                <button onClick={() => setMode('flow')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all
                    ${mode === 'flow' ? 'bg-slate-700 text-slate-100 shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                  Fluxo estruturado
                </button>
                <button onClick={() => setMode('canvas')}
                  className={`px-3 py-1 rounded-lg text-[10px] font-semibold transition-all
                    ${mode === 'canvas' ? 'bg-[#d97706] text-slate-900 shadow' : 'text-slate-500 hover:text-slate-300'}`}>
                  Canvas livre
                </button>
              </div>

              {mode === 'flow' && (
                <>
                  {canEdit && sections.length > 0 && (
                    <button onClick={() => setShowBasePicker(true)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#d97706] border border-slate-700 hover:border-[#d97706]/40 rounded-lg px-2 py-1.5 transition-colors">
                      <Copy size={10} /> Trocar base
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => setShowImportSection(true)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#d97706] border border-slate-700 hover:border-[#d97706]/40 rounded-lg px-2 py-1.5 transition-colors">
                      <Download size={10} /> Importar seção
                    </button>
                  )}
                  {canEdit && hasOverride(selectedScope) && !selectedMeta?.isCustom && (
                    <button onClick={restore}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 transition-colors">
                      <RotateCcw size={10} /> Restaurar bundle
                    </button>
                  )}
                  {error && <p className="text-[10px] text-rose-400 shrink-0">{error}</p>}
                  {canEdit && sections.length > 0 && (
                    <button disabled={!dirty || saving} onClick={save}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 bg-[#d97706] hover:bg-amber-600 text-white">
                      {saved ? <Check size={12} /> : <Save size={12} />}
                      {saved ? 'Salvo!' : saving ? 'Salvando…' : 'Salvar'}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Legenda de interações (só no modo fluxo) */}
            {mode === 'flow' && canEdit && sections.length > 0 && (
              <div className="shrink-0 px-4 py-1 bg-slate-800/30 border-b border-slate-700/30">
                <span className="text-[10px] text-slate-500 leading-relaxed">
                  <span className="text-rose-400 font-semibold">×</span> remove ·
                  {' '}<span className="text-[#d97706] font-semibold">✦</span> marca padrão ·
                  {' '}Clique no <span className="text-slate-300">texto</span> da pergunta ou resposta para editar ·
                  {' '}Clique em <span className="text-[#d97706]">+ pacote</span> / <span className="text-[#d97706]">+ resposta</span> / <span className="text-[#d97706]">+ decisão</span> para adicionar
                </span>
              </div>
            )}

            {/* Conteúdo: Fluxo estruturado OU Canvas livre */}
            <div className="flex-1 min-h-0">
              {mode === 'canvas' ? (
                <LogicCanvasPanel scopeId={selectedScope} canEdit={canEdit} sections={sections.length > 0 ? sections : undefined} />
              ) : (
                <>
                  {loading && (
                    <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando…</div>
                  )}
                  {!loading && sections.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                      <AlertCircle size={24} className="opacity-30" />
                      <p className="text-sm">Nenhuma seção carregada.</p>
                      {canEdit && (
                        <button onClick={() => setShowBasePicker(true)}
                          className="flex items-center gap-1.5 text-sm text-[#d97706] hover:text-amber-400 transition-colors">
                          <Copy size={14} /> Escolher escopo base
                        </button>
                      )}
                    </div>
                  )}
                  {!loading && sections.length > 0 && (
                    <LogicGraphPanel secs={sections} editCb={canEdit ? handleEditAction : undefined} />
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Modais ── */}
      {showNewScope && <NewScopeModal onSave={handleCreateScope} onClose={() => setShowNewScope(false)} />}
      {showBasePicker && selectedScope && (
        <BasePickerModal overrides={overrides} currentScopeId={selectedScope}
          onPick={applyBase} onClose={() => setShowBasePicker(false)} />
      )}
      {pendingAdd && (
        <PackagePicker onSelect={handlePackagePick} onClose={() => setPendingAdd(null)} />
      )}
      {textEdit && (
        <TextEditModal title={textEdit.title} initial={textEdit.initial}
          onSave={textEdit.onSave} onClose={() => setTextEdit(null)} />
      )}
      {pendingDec && (
        <DecisionPickerModal
          overrides={overrides}
          currentScopeId={selectedScope}
          loadScopeSections={loadScopeSections}
          onPick={handleInsertDecision}
          onClose={() => setPendingDec(null)}
        />
      )}
      {showImportSection && selectedScope && (
        <ImportSectionModal
          overrides={overrides}
          currentScopeId={selectedScope}
          loadScopeSections={loadScopeSections}
          onImport={handleImportSections}
          onClose={() => setShowImportSection(false)}
        />
      )}
      {phasePick && (
        <PhasePickerModal current={phasePick.current} onPick={handlePhasePick} onClose={() => setPhasePick(null)} />
      )}
      {pendingGoto && (
        <GoToPickerModal
          secs={sections}
          onSelect={(question) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const ans = s2[pendingGoto.si]?.decisions[pendingGoto.di]?.answers[pendingGoto.ai]
            if (ans) { ans.goto = question; setSections(s2); setDirty(true) }
            setPendingGoto(null)
          }}
          onClose={() => setPendingGoto(null)}
        />
      )}
    </div>
  )
}
