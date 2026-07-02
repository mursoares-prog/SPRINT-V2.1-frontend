/**
 * Editor de engine de sequenciamento — Admin UI
 * Usa o mesmo fluxograma SVG interativo: clique para editar perguntas, respostas
 * e pacotes; botões para adicionar/remover decisões e pernas de resposta.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Layers, GitBranch, Puzzle, Plus, Trash2, Save, RotateCcw, RotateCw, Check, Copy, X, AlertCircle, Download, ChevronLeft, ChevronDown, ChevronRight, HelpCircle, Pencil } from 'lucide-react'
import { SCOPE_CATEGORIES, categoryOfScope } from '../data/scopeCategories'
import type { LSec, LDec, LAns, LPkg } from '../data/logicSecs'
import { LOGIC_BY_SCOPE } from '../data/logicSecs'
import {
  getLogicScopes, getLogicScope, saveLogicScope, saveLogicScopeMeta,
  createLogicScope, deleteLogicScope, type LogicScopeMeta,
} from '../utils/api'
import { isAdmin, authHeader } from '../utils/auth'
import { updateCustomScopeMeta } from '../data/logicOverrideStore'
import { PACKAGES } from '../data/packages'
import { setLogicOverrides, getLogicOverride } from '../data/logicOverrideStore'
import { LogicGraphPanel, type EditAction, type DecRef } from './LogicGraphPanel'

// ─── Constantes ───────────────────────────────────────────────────────────────

const BUNDLE_LABELS: Record<string, string> = {
  FSU_TT_FT: 'FSU · TT-FT', FSU_TT_BDC: 'FSU · TT-BDC',
  FSU_Conv_BOP: 'FSU · Conv-BOP', FSU_Conv_RCMA: 'FSU · Conv-RCMA',
  FSU_Sup_COP: 'FSU · Sup-COP', FSU_Sup_PWC: 'FSU · Sup-PWC',
  FS1_Mec: 'FS1 · Mec',
  FS2_Conv_BOP: 'FS2 · Conv-BOP', FS2_Conv_RCMA: 'FS2 · Conv-RCMA',
  FS2_Sup_COP: 'FS2 · Sup-COP', FS2_Sup_PWC: 'FS2 · Sup-PWC',
}
const BUNDLE_IDS = Object.keys(BUNDLE_LABELS)

const BLOCK_LABELS: Record<string, string> = {
  MOB_DESCIDA:       'MOB · Descida (DP)',
  MOB_REENTRADA_ANC: 'MOB · Reentrada (ANC)',
}
const BLOCK_IDS = Object.keys(BLOCK_LABELS)

function isReservedId(id: string) { return BUNDLE_IDS.includes(id) || BLOCK_IDS.includes(id) }
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
        <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
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
    ...BUNDLE_IDS.filter(id => id !== currentScopeId).map(id => ({ id, label: BUNDLE_LABELS[id], isCustom: false, isBlock: false })),
    ...BLOCK_IDS.filter(id => id !== currentScopeId).map(id => ({ id, label: BLOCK_LABELS[id], isCustom: false, isBlock: true })),
    ...overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId && !isReservedId(o.scopeId)).map(o => ({ id: o.scopeId, label: o.label ?? o.scopeId, isCustom: true, isBlock: false })),
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
            <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
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
            <div className="w-40 shrink-0 border-r border-slate-700/40 py-1 overflow-y-auto scrollbar-custom">
              {scopeOptions.filter(s => !s.isCustom && !s.isBlock).length > 0 && (
                <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 py-1">Bundle</p>
              )}
              {scopeOptions.filter(s => !s.isCustom && !s.isBlock).map(s => (
                <button key={s.id} onClick={() => handleSelectSource(s.id)}
                  className={`w-full text-left px-3 py-2 text-[11px] transition-colors
                    ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                  {s.label}
                </button>
              ))}
              {scopeOptions.some(s => s.isBlock) && (
                <>
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 pt-2 pb-1">Blocos de lógica</p>
                  {scopeOptions.filter(s => s.isBlock).map(s => (
                    <button key={s.id} onClick={() => handleSelectSource(s.id)}
                      className={`w-full text-left px-3 py-2 text-[11px] transition-colors
                        ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                      {s.label}
                    </button>
                  ))}
                </>
              )}
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
                <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
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
                  <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
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
    ...BUNDLE_IDS.filter(id => id !== currentScopeId).map(id => ({ id, label: BUNDLE_LABELS[id], isCustom: false, isBlock: false })),
    ...BLOCK_IDS.filter(id => id !== currentScopeId).map(id => ({ id, label: BLOCK_LABELS[id], isCustom: false, isBlock: true })),
    ...overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId && !isReservedId(o.scopeId)).map(o => ({ id: o.scopeId, label: o.label ?? o.scopeId, isCustom: true, isBlock: false })),
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
          <div className="w-44 shrink-0 border-r border-slate-700/40 py-2 overflow-y-auto scrollbar-custom">
            <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 pb-1">Bundle</p>
            {scopeOptions.filter(s => !s.isCustom && !s.isBlock).map(s => (
              <button key={s.id} onClick={() => handleSelectSource(s.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors
                  ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                {s.label}
              </button>
            ))}
            {scopeOptions.some(s => s.isBlock) && (
              <>
                <p className="text-[9px] text-slate-600 uppercase tracking-widest px-3 pt-3 pb-1">Blocos de lógica</p>
                {scopeOptions.filter(s => s.isBlock).map(s => (
                  <button key={s.id} onClick={() => handleSelectSource(s.id)}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors
                      ${sourceId === s.id ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                    {s.label}
                  </button>
                ))}
              </>
            )}
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
                <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
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
        <div className="flex-1 overflow-y-auto scrollbar-custom py-2">
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
          {BLOCK_IDS.filter(id => id !== currentScopeId).length > 0 && (
            <>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest px-5 py-1 mt-1">Blocos de lógica</p>
              {BLOCK_IDS.filter(id => id !== currentScopeId).map(id => (
                <button key={id} onClick={() => onPick(id)}
                  className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-800 text-left transition-colors">
                  <Puzzle size={12} className="text-[#d97706]/70 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-200">{BLOCK_LABELS[id]}</p>
                    <p className="text-[10px] text-slate-500">{(LOGIC_BY_SCOPE[id] ?? []).length} seções</p>
                  </div>
                </button>
              ))}
            </>
          )}
          {overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId && !isReservedId(o.scopeId)).length > 0 && (
            <>
              <p className="text-[9px] text-slate-600 uppercase tracking-widest px-5 py-1 mt-1">Customizados</p>
              {overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId && !isReservedId(o.scopeId)).map(o => (
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
  onSave: (scopeId: string, label: string) => Promise<void>; onClose: () => void
}) {
  const [scopeId, setScopeId] = useState('')
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const valid = !creating && scopeId.trim() && label.trim() && !BUNDLE_IDS.includes(scopeId.trim()) && !BLOCK_IDS.includes(scopeId.trim())

  const handleCreate = async () => {
    if (!valid) return
    setCreating(true); setLocalError(null)
    try { await onSave(scopeId.trim(), label.trim()) }
    catch (e) { setLocalError(e instanceof Error ? e.message : 'Erro ao criar escopo'); setCreating(false) }
  }

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
            <input value={scopeId} onChange={e => { setScopeId(e.target.value.replace(/\s/g,'')); setLocalError(null) }}
              placeholder="ex: FSU_Custom_01"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full mt-1 text-sm bg-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none border border-slate-700 focus:border-[#d97706]/60" />
            {scopeId && (BUNDLE_IDS.includes(scopeId) || BLOCK_IDS.includes(scopeId)) && <p className="text-[10px] text-rose-400 mt-0.5">ID reservado.</p>}
          </div>
          <div>
            <label className="text-[10px] text-slate-400">Rótulo</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="ex: FSU customizado"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              className="w-full mt-1 text-sm bg-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none border border-slate-700 focus:border-[#d97706]/60" />
          </div>
        </div>
        {localError && <p className="text-[11px] text-rose-400">{localError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={creating} className="px-3 py-1.5 text-sm text-slate-400 rounded-lg border border-slate-700 disabled:opacity-40">Cancelar</button>
          <button disabled={!valid} onClick={handleCreate}
            className="px-4 py-1.5 text-sm bg-[#d97706] hover:bg-amber-600 text-white rounded-lg disabled:opacity-40 font-semibold">
            {creating ? 'Criando…' : 'Criar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Path-based ref resolution ───────────────────────────────────────────────

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
  if (ref.aeRef) {
    const ae = dec.after?.[ref.aeRef.afterIdx]; if (!ae) return null
    const list = ref.aeRef.isAfterSub ? ae.afterSub : ae.sub
    return list?.[ref.aeRef.subIdx] ?? null
  }
  return dec
}

type PendingTransfer = {
  mode: 'move' | 'copy'
  target: { ref: DecRef; ansIdx: number } | { secIdx: number }
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export function LogicEditorPanel({ canEdit }: { canEdit: boolean }) {
  const [overrides, setOverrides] = useState<LogicScopeMeta[]>([])
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const [sections, setSections] = useState<LSec[]>([])
  const [baseLabel, setBaseLabel] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showScopePanel, setShowScopePanel] = useState(false)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const toggleCat = (id: string) => setCollapsedCats(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const scopePanelRef = useRef<HTMLDivElement>(null)
  const renameCancelledRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNewScope, setShowNewScope] = useState(false)
  const [showBasePicker, setShowBasePicker] = useState(false)
  const [showImportSection, setShowImportSection] = useState(false)
  const [editingLabel, setEditingLabel] = useState<string | null>(null)

  // Add-package pending location
  const [pendingAdd, setPendingAdd] = useState<
    | { kind: 'pkg'; secIdx: number; decIdx: number; ansIdx: number }
    | { kind: 'always'; secIdx: number }
    | { kind: 'seq_pkg'; secIdx: number; decIdx: number; ansIdx: number; seqIdx: number }
    | { kind: 'dec_after_pkg'; secIdx: number; decIdx: number; afterIdx: number }
    // Path-based (ref) kinds for deep navigation
    | { kind: 'ref_pkg'; ref: DecRef; ansIdx: number }
    | { kind: 'ref_seq_pkg'; ref: DecRef; ansIdx: number; seqIdx: number }
    | { kind: 'ref_after_pkg'; ref: DecRef; ansIdx: number; afterIdx: number }
    | { kind: 'ref_dec_after_pkg'; ref: DecRef; afterIdx: number }
    | null
  >(null)

  // Pending move/copy transfer (2-click flow: pick target → pick source)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const pendingTransferRef = useRef<PendingTransfer | null>(null)
  pendingTransferRef.current = pendingTransfer

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

  // ── Histórico de undo/redo ─────────────────────────────────────────────────
  const [past, setPast] = useState<LSec[][]>([])
  const [future, setFuture] = useState<LSec[][]>([])
  // Refs espelham o estado para que os callbacks sempre leiam o valor atual
  // sem precisar de closures atualizadas (evita chamar setters dentro de updaters).
  const pastRef = useRef<LSec[][]>([])
  const futureRef = useRef<LSec[][]>([])
  pastRef.current = past
  futureRef.current = future

  const commitSections = useCallback((next: LSec[]) => {
    const newPast = [...pastRef.current.slice(-49), deepClone(sectionsRef.current)]
    pastRef.current = newPast
    futureRef.current = []
    setPast(newPast)
    setFuture([])
    setSections(next)
    setDirty(true)
  }, [])

  const undo = useCallback(() => {
    const p = pastRef.current
    if (p.length === 0) return
    const prev = p[p.length - 1]
    const newPast = p.slice(0, -1)
    const newFuture = [deepClone(sectionsRef.current), ...futureRef.current.slice(0, 49)]
    pastRef.current = newPast
    futureRef.current = newFuture
    setPast(newPast)
    setFuture(newFuture)
    setSections(prev)
    setDirty(true)
  }, [])

  const redo = useCallback(() => {
    const f = futureRef.current
    if (f.length === 0) return
    const next = f[0]
    const newPast = [...pastRef.current.slice(-49), deepClone(sectionsRef.current)]
    const newFuture = f.slice(1)
    pastRef.current = newPast
    futureRef.current = newFuture
    setPast(newPast)
    setFuture(newFuture)
    setSections(next)
    setDirty(true)
  }, [])

  // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if (e.key === 'z' && e.shiftKey)  { e.preventDefault(); redo() }
      if (e.key === 'y')                 { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const scopeList = [
    ...BUNDLE_IDS.map(id => ({ scopeId: id, label: BUNDLE_LABELS[id], isCustom: false, isBlock: false })),
    ...BLOCK_IDS.map(id => {
      const serverMeta = overrides.find(o => o.scopeId === id)
      return { scopeId: id, label: serverMeta?.label ?? BLOCK_LABELS[id], isCustom: false, isBlock: true }
    }),
    ...overrides.filter(o => o.isCustom && !isReservedId(o.scopeId)).map(o => ({ scopeId: o.scopeId, label: o.label ?? o.scopeId, isCustom: true, isBlock: false })),
  ]

  const hasOverride = (scopeId: string) => overrides.some(o => o.scopeId === scopeId)

  const loadScopes = useCallback(async () => {
    try { setOverrides(await getLogicScopes()) } catch { /* offline */ }
  }, [])

  useEffect(() => { void loadScopes() }, [loadScopes])

  useEffect(() => {
    if (!showScopePanel) return
    const handler = (e: MouseEvent) => {
      if (scopePanelRef.current && !scopePanelRef.current.contains(e.target as Node)) {
        setShowScopePanel(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showScopePanel])

  const selectScope = async (scopeId: string) => {
    if (dirty && !confirm('Há alterações não salvas. Descartar?')) return
    setShowScopePanel(false)
    setSelectedScope(scopeId)
    setSections([])
    setPast([]); setFuture([])
    setDirty(false); setError(null); setBaseLabel(null)

    const memOverride = getLogicOverride(scopeId)
    if (memOverride) { setSections(memOverride as LSec[]); setBaseLabel('override salvo'); return }
    if (hasOverride(scopeId)) {
      setLoading(true)
      try { const d = await getLogicScope(scopeId); setSections(d.sections as LSec[]); setBaseLabel('override salvo')
      } catch { setError('Erro ao carregar override.') } finally { setLoading(false) }
      return
    }
    if (BUNDLE_IDS.includes(scopeId) || BLOCK_IDS.includes(scopeId)) {
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
      commitSections(src)
      setBaseLabel(`baseado em ${BUNDLE_LABELS[sourceId] ?? BLOCK_LABELS[sourceId] ?? sourceId}`)
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
            d2.question = v; commitSections(s2); setTextEdit(null)
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
            a2.label = v; commitSections(s2); setTextEdit(null)
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

      case 'add_blank_decision': {
        const sec = secs[action.secIdx]; if (!sec) return
        sec.decisions.splice(action.afterDecIdx + 1, 0, emptyDec())
        break
      }

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
            sec.label = v; commitSections(s2); setTextEdit(null)
          },
        })
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
            se.label = v; commitSections(s2); setTextEdit(null)
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
        const arr = [...(dec.after ?? [])]
        const at = action.atIdx ?? arr.length
        arr.splice(at, 0, { label: 'Após convergência', packages: [] })
        dec.after = arr
        break
      }

      case 'add_dec_after_dec': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]
        if (!dec) return
        const arr = [...(dec.afterDec ?? [])]
        const at = action.atIdx ?? arr.length
        arr.splice(at, 0, emptyDec())
        dec.afterDec = arr
        break
      }

      case 'remove_dec_after': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]
        if (!dec) return
        dec.after = (dec.after ?? []).filter((_, i) => i !== action.afterIdx)
        if (dec.after.length === 0) delete dec.after
        break
      }

      case 'move_dec_after': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        const arr = [...(dec.after ?? [])]
        const to = action.dir === 'up' ? action.afterIdx - 1 : action.afterIdx + 1
        if (to < 0 || to >= arr.length) return
        ;[arr[action.afterIdx], arr[to]] = [arr[to], arr[action.afterIdx]]
        dec.after = arr
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
            ae.label = v; commitSections(s2); setTextEdit(null)
          },
        })
        return
      }

      case 'add_dec_after_pkg':
        if (action.afterIdx < 0) {
          // Cria um chip "após convergência" e abre o seletor de pacote para ele.
          const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
          dec.after = [...(dec.after ?? []), { label: 'Após convergência', packages: [] }]
          const newIdx = dec.after.length - 1
          commitSections(secs)
          setPendingAdd({ kind: 'dec_after_pkg', secIdx: action.secIdx, decIdx: action.decIdx, afterIdx: newIdx })
          return
        }
        setPendingAdd({ kind: 'dec_after_pkg', secIdx: action.secIdx, decIdx: action.decIdx, afterIdx: action.afterIdx })
        return

      case 'remove_dec_after_pkg': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]
        const ae = dec?.after?.[action.afterIdx]
        if (!ae) return
        ae.packages = (ae.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      // ── Path-based actions (p_ prefix — uses DecRef for unlimited depth) ──

      case 'p_edit_q': {
        const { ref, current } = action
        setTextEdit({
          title: 'Editar pergunta',
          initial: current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const dec = resolveRef(s2, ref); if (!dec) return
            dec.question = v; commitSections(s2); setTextEdit(null)
          },
        })
        return
      }

      case 'p_remove_dec': {
        const { ref } = action
        const sec = secs[ref.secIdx]; if (!sec) return
        if (ref.aeRef) {
          // Remove from dec.after[afterIdx].sub[] or .afterSub[]
          const parentRef: DecRef = { ...ref, aeRef: undefined }
          const parentDec = resolveRef(secs, parentRef); if (!parentDec) return
          const ae = parentDec.after?.[ref.aeRef.afterIdx]; if (!ae) return
          if (ref.aeRef.isAfterSub) {
            ae.afterSub = (ae.afterSub ?? []).filter((_, i) => i !== ref.aeRef!.subIdx)
            if (!ae.afterSub.length) delete ae.afterSub
          } else {
            ae.sub = (ae.sub ?? []).filter((_, i) => i !== ref.aeRef!.subIdx)
            if (!ae.sub.length) delete ae.sub
          }
        } else if (ref.sub.length === 0 && ref.adIdx === undefined) {
          sec.decisions = sec.decisions.filter((_, i) => i !== ref.decIdx)
        } else if (ref.sub.length === 0 && ref.adIdx !== undefined) {
          const pd = sec.decisions[ref.decIdx]; if (!pd) return
          pd.afterDec = (pd.afterDec ?? []).filter((_, i) => i !== ref.adIdx!)
          if (pd.afterDec.length === 0) delete pd.afterDec
        } else {
          const parentPath = ref.sub.slice(0, -2)
          const lastAi = ref.sub[ref.sub.length - 2]
          const lastSi = ref.sub[ref.sub.length - 1]
          const parentDec = resolveRef(secs, { ...ref, sub: parentPath }); if (!parentDec) return
          const parentAns = parentDec.answers[lastAi]; if (!parentAns) return
          if (lastSi < 0) {
            const idx = -(lastSi + 1)
            parentAns.afterSub = (parentAns.afterSub ?? []).filter((_, i) => i !== idx)
            if (!parentAns.afterSub!.length) delete parentAns.afterSub
          } else {
            if (!parentAns.sub) return
            parentAns.sub = parentAns.sub.filter((_, i) => i !== lastSi)
            if (parentAns.sub.length === 0) delete parentAns.sub
          }
        }
        break
      }

      case 'p_add_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const newAns: LAns = { label: 'Nova resposta', packages: [] }
        if (action.atStart) dec.answers.unshift(newAns)
        else dec.answers.push(newAns)
        break
      }

      case 'p_toggle_reuse': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.reuseScope = !dec.reuseScope
        break
      }

      case 'p_toggle_default': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.answers.forEach((a, i) => { a.active = (i === action.ansIdx) ? !a.active : false })
        break
      }

      case 'p_toggle_contingency': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.contingency = !ans.contingency
        break
      }

      case 'p_edit_ans': {
        const { ref, ansIdx, current } = action
        setTextEdit({
          title: 'Editar rótulo da resposta',
          initial: current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const dec = resolveRef(s2, ref); if (!dec) return
            const a = dec.answers[ansIdx]; if (!a) return
            a.label = v; commitSections(s2); setTextEdit(null)
          },
        })
        return
      }

      case 'p_remove_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        if (dec.answers.length <= 1) { alert('A decisão precisa ter ao menos uma resposta.'); return }
        dec.answers = dec.answers.filter((_, i) => i !== action.ansIdx)
        break
      }

      case 'p_add_pkg':
        setPendingAdd({ kind: 'ref_pkg', ref: action.ref, ansIdx: action.ansIdx })
        return

      case 'p_remove_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.packages = (ans.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      case 'p_add_sub_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.sub = [...(ans.sub ?? []), emptyDec()]
        break
      }

      case 'p_insert_sub_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        const arr = [...(ans.sub ?? [])]
        arr.splice(action.subIdx, 0, emptyDec())
        ans.sub = arr
        break
      }

      case 'p_add_seq': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        const arr = [...(ans.seq ?? [])]
        const at = action.atIdx ?? arr.length
        arr.splice(at, 0, { label: 'Sequencial', packages: [] })
        ans.seq = arr
        break
      }

      case 'p_remove_seq': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.seq = (ans.seq ?? []).filter((_, i) => i !== action.seqIdx)
        if (ans.seq.length === 0) delete ans.seq
        break
      }

      case 'p_edit_seq_label': {
        const { ref, ansIdx, seqIdx, current } = action
        setTextEdit({
          title: 'Editar rótulo da resposta sequencial',
          initial: current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const dec = resolveRef(s2, ref); if (!dec) return
            const se = dec.answers[ansIdx]?.seq?.[seqIdx]; if (!se) return
            se.label = v; commitSections(s2); setTextEdit(null)
          },
        })
        return
      }

      case 'p_add_seq_pkg':
        setPendingAdd({ kind: 'ref_seq_pkg', ref: action.ref, ansIdx: action.ansIdx, seqIdx: action.seqIdx })
        return

      case 'p_remove_seq_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const se = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]; if (!se) return
        se.packages = (se.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      case 'p_add_after': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        const arr = [...(ans.after ?? [])]
        const at = action.atIdx ?? arr.length
        arr.splice(at, 0, { label: 'Após convergência', packages: [] })
        ans.after = arr
        break
      }

      case 'p_add_after_pkg': {
        if (action.afterIdx < 0) {
          // Create new after entry first, then open picker for it
          const dec = resolveRef(secs, action.ref); if (!dec) return
          const ans = dec.answers[action.ansIdx]; if (!ans) return
          ans.after = [...(ans.after ?? []), { label: 'Após convergência', packages: [] }]
          const newIdx = ans.after.length - 1
          commitSections(secs)
          setPendingAdd({ kind: 'ref_after_pkg', ref: action.ref, ansIdx: action.ansIdx, afterIdx: newIdx })
          return
        }
        setPendingAdd({ kind: 'ref_after_pkg', ref: action.ref, ansIdx: action.ansIdx, afterIdx: action.afterIdx })
        return
      }

      case 'p_remove_after': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.after = (ans.after ?? []).filter((_, i) => i !== action.afterIdx)
        if (ans.after.length === 0) delete ans.after
        break
      }

      case 'p_edit_after_label': {
        const { ref, ansIdx, afterIdx, current } = action
        setTextEdit({
          title: 'Editar rótulo após convergência',
          initial: current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const dec = resolveRef(s2, ref); if (!dec) return
            const ae = dec.answers[ansIdx]?.after?.[afterIdx]; if (!ae) return
            ae.label = v; commitSections(s2); setTextEdit(null)
          },
        })
        return
      }

      case 'p_remove_after_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.answers[action.ansIdx]?.after?.[action.afterIdx]; if (!ae) return
        ae.packages = (ae.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      // ── "Após convergência" de uma DECISÃO/sub-pergunta (dec.after, path-based) ──────────
      case 'p_add_aftersub_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.afterSub = [...(ans.afterSub ?? []), emptyDec()]
        break
      }

      case 'p_remove_aftersub_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans?.afterSub) return
        ans.afterSub = ans.afterSub.filter((_, i) => i !== action.afterSubIdx)
        if (!ans.afterSub.length) delete ans.afterSub
        break
      }

      case 'p_dec_add_after': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const arr = [...(dec.after ?? [])]
        const at = action.atIdx ?? arr.length
        arr.splice(at, 0, { label: 'Após convergência', packages: [] })
        dec.after = arr
        break
      }

      case 'p_dec_add_after_pkg': {
        if (action.afterIdx < 0) {
          const dec = resolveRef(secs, action.ref); if (!dec) return
          dec.after = [...(dec.after ?? []), { label: 'Após convergência', packages: [] }]
          const newIdx = dec.after.length - 1
          commitSections(secs)
          setPendingAdd({ kind: 'ref_dec_after_pkg', ref: action.ref, afterIdx: newIdx })
          return
        }
        setPendingAdd({ kind: 'ref_dec_after_pkg', ref: action.ref, afterIdx: action.afterIdx })
        return
      }

      case 'p_dec_remove_after': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.after = (dec.after ?? []).filter((_, i) => i !== action.afterIdx)
        if (dec.after.length === 0) delete dec.after
        break
      }

      case 'p_dec_move_after': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const arr = [...(dec.after ?? [])]
        const to = action.dir === 'up' ? action.afterIdx - 1 : action.afterIdx + 1
        if (to < 0 || to >= arr.length) return
        ;[arr[action.afterIdx], arr[to]] = [arr[to], arr[action.afterIdx]]
        dec.after = arr
        break
      }

      case 'p_dec_edit_after_label': {
        const { ref, afterIdx, current } = action
        setTextEdit({
          title: 'Editar rótulo após convergência',
          initial: current,
          onSave: (v) => {
            const s2 = deepClone(sectionsRef.current) as LSec[]
            const dec = resolveRef(s2, ref); if (!dec) return
            const ae = dec.after?.[afterIdx]; if (!ae) return
            ae.label = v; commitSections(s2); setTextEdit(null)
          },
        })
        return
      }

      case 'p_dec_remove_after_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        ae.packages = (ae.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        break
      }

      case 'p_move_seq_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const se = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]; if (!se) return
        const pkgs = se.packages ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        se.packages = pkgs
        break
      }

      case 'p_move_after_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.answers[action.ansIdx]?.after?.[action.afterIdx]; if (!ae) return
        const pkgs = ae.packages ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        ae.packages = pkgs
        break
      }

      case 'p_dec_move_after_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        const pkgs = ae.packages ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        ae.packages = pkgs
        break
      }

      case 'move_always': {
        const sec = secs[action.secIdx]; if (!sec) return
        const pkgs = sec.always ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        sec.always = pkgs
        break
      }

      case 'move_dec_after_pkg': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        const pkgs = ae.packages ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        ae.packages = pkgs
        break
      }

      // ── Move/copy (2-click): escolher destino → clicar na origem ─────────────

      case 'transfer_target':
        setPendingTransfer({ mode: action.mode, target: { ref: action.ref, ansIdx: action.ansIdx } })
        return

      case 'transfer_target_sec':
        setPendingTransfer({ mode: action.mode, target: { secIdx: action.secIdx } })
        return

      case 'pick_source': {
        const pt = pendingTransferRef.current; if (!pt) return
        const { mode, target } = pt
        const srcRef = action.ref
        const srcDec = resolveRef(secs, srcRef)
        if (!srcDec) { setPendingTransfer(null); return }
        const cloned = deepClone(srcDec) as LDec
        if ('secIdx' in target) {
          const sec = secs[target.secIdx]; if (!sec) { setPendingTransfer(null); return }
          sec.decisions.push(cloned)
        } else {
          const tgtDec = resolveRef(secs, target.ref); if (!tgtDec) { setPendingTransfer(null); return }
          const tgtAns = tgtDec.answers[target.ansIdx]; if (!tgtAns) { setPendingTransfer(null); return }
          tgtAns.sub = [...(tgtAns.sub ?? []), cloned]
        }
        if (mode === 'move') {
          const sec2 = secs[srcRef.secIdx]
          if (sec2) {
            if (srcRef.sub.length === 0 && srcRef.adIdx === undefined) {
              sec2.decisions = sec2.decisions.filter((_, i) => i !== srcRef.decIdx)
            } else if (srcRef.sub.length === 0 && srcRef.adIdx !== undefined) {
              const pd = sec2.decisions[srcRef.decIdx]
              if (pd) {
                pd.afterDec = (pd.afterDec ?? []).filter((_, i) => i !== srcRef.adIdx!)
                if (pd.afterDec.length === 0) delete pd.afterDec
              }
            } else {
              const parentPath2 = srcRef.sub.slice(0, -2)
              const lastAi2 = srcRef.sub[srcRef.sub.length - 2]
              const lastSi2 = srcRef.sub[srcRef.sub.length - 1]
              const pd2 = resolveRef(secs, { ...srcRef, sub: parentPath2 })
              if (pd2) {
                const pa2 = pd2.answers[lastAi2]
                if (pa2?.sub) {
                  pa2.sub = pa2.sub.filter((_, i) => i !== lastSi2)
                  if (pa2.sub.length === 0) delete pa2.sub
                }
              }
            }
          }
        }
        setPendingTransfer(null)
        break
      }

      // ── Ações diretas (sem modal) — disparadas pelo SidePanel do FlowEditor ──

      case 'p_set_q': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.question = action.value
        break
      }

      case 'p_set_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.label = action.value
        break
      }

      case 'p_set_section_label': {
        const sec = secs[action.secIdx]; if (!sec) return
        sec.label = action.value
        break
      }

      case 'p_set_section_phase': {
        const sec = secs[action.secIdx]; if (!sec) return
        sec.phase = action.phase; sec.color = action.color
        break
      }

      case 'p_set_dec_after_label': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        ae.label = action.value
        break
      }

      case 'set_dec_after_label': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        ae.label = action.value
        break
      }

      case 'add_dec_after_chip_sub': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        const newDec: LDec = { question: 'Nova pergunta', answers: [{ label: 'Sim', packages: [] }, { label: 'Não', packages: [] }] }
        if (action.isAfterSub) {
          ae.afterSub = [...(ae.afterSub ?? []), newDec]
        } else {
          ae.sub = [...(ae.sub ?? []), newDec]
        }
        break
      }

      case 'remove_dec_after_chip_sub': {
        const dec = secs[action.secIdx]?.decisions[action.decIdx]; if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        if (action.isAfterSub) {
          ae.afterSub = (ae.afterSub ?? []).filter((_, i) => i !== action.subIdx)
          if (!ae.afterSub.length) delete ae.afterSub
        } else {
          ae.sub = (ae.sub ?? []).filter((_, i) => i !== action.subIdx)
          if (!ae.sub.length) delete ae.sub
        }
        break
      }

      case 'move_decision': {
        const sec = secs[action.secIdx]; if (!sec) return
        const target = action.dir === 'up' ? action.decIdx - 1 : action.decIdx + 1
        if (target < 0 || target >= sec.decisions.length) return
        ;[sec.decisions[action.decIdx], sec.decisions[target]] = [sec.decisions[target], sec.decisions[action.decIdx]]
        break
      }

      case 'copy_decision': {
        const sec = secs[action.secIdx]; if (!sec) return
        const dec = sec.decisions[action.decIdx]; if (!dec) return
        sec.decisions.push(deepClone(dec))
        break
      }

      case 'p_move_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const target = action.dir === 'up' ? action.ansIdx - 1 : action.ansIdx + 1
        if (target < 0 || target >= dec.answers.length) return
        ;[dec.answers[action.ansIdx], dec.answers[target]] = [dec.answers[target], dec.answers[action.ansIdx]]
        break
      }

      case 'p_move_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        const pkgs = ans.packages ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        ans.packages = pkgs
        break
      }

      case 'p_add_pkg_direct': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.packages = [...(ans.packages ?? []), { id: action.pkgId, name: action.pkgName }]
        break
      }

      case 'p_ins_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.answers.splice(action.atIdx, 0, { label: 'Nova resposta', packages: [] })
        break
      }

      default: return
    }

    commitSections(secs)
  }, [commitSections])

  // Alterar fase de uma seção
  const handlePhasePick = (phase: string, color: 'gray' | 'blue' | 'amber') => {
    if (!phasePick) return
    const secs = deepClone(sectionsRef.current) as LSec[]
    const sec = secs[phasePick.secIdx]; if (!sec) return
    sec.phase = phase; sec.color = color
    commitSections(secs); setPhasePick(null)
  }

  // Inserir decisão (do picker) na posição certa
  const handleInsertDecision = (dec: LDec) => {
    if (!pendingDec) return
    const secs = deepClone(sectionsRef.current) as LSec[]
    const sec = secs[pendingDec.secIdx]; if (!sec) return
    sec.decisions.splice(pendingDec.afterDecIdx + 1, 0, dec)
    commitSections(secs); setPendingDec(null)
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
    } else if (pendingAdd.kind === 'ref_pkg') {
      const dec = resolveRef(secs, pendingAdd.ref); if (!dec) return
      const ans = dec.answers[pendingAdd.ansIdx]; if (!ans) return
      ans.packages = [...(ans.packages ?? []), pkg]
    } else if (pendingAdd.kind === 'ref_seq_pkg') {
      const dec = resolveRef(secs, pendingAdd.ref); if (!dec) return
      const se = dec.answers[pendingAdd.ansIdx]?.seq?.[pendingAdd.seqIdx]; if (!se) return
      se.packages = [...(se.packages ?? []), pkg]
    } else if (pendingAdd.kind === 'ref_after_pkg') {
      const dec = resolveRef(secs, pendingAdd.ref); if (!dec) return
      const ae = dec.answers[pendingAdd.ansIdx]?.after?.[pendingAdd.afterIdx]; if (!ae) return
      ae.packages = [...(ae.packages ?? []), pkg]
    } else if (pendingAdd.kind === 'ref_dec_after_pkg') {
      const dec = resolveRef(secs, pendingAdd.ref); if (!dec) return
      const ae = dec.after?.[pendingAdd.afterIdx]; if (!ae) return
      ae.packages = [...(ae.packages ?? []), pkg]
    } else {
      const ans = secs[pendingAdd.secIdx]?.decisions[pendingAdd.decIdx]?.answers[pendingAdd.ansIdx]; if (!ans) return
      ans.packages = [...(ans.packages ?? []), pkg]
    }
    commitSections(secs); setPendingAdd(null)
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
    commitSections(secs); setShowImportSection(false)
  }

  const handleCreateScope = async (scopeId: string, label: string) => {
    await createLogicScope({ scopeId, label, sections: [] }, authHeader())
    setShowNewScope(false); await loadScopes()
    setSelectedScope(scopeId); setSections([]); setDirty(false); setError(null); setBaseLabel(null)
  }

  const handleDeleteCustom = async (scopeId: string) => {
    if (!confirm(`Apagar "${scopeId}"? Esta ação não pode ser desfeita.`)) return
    try {
      await deleteLogicScope(scopeId, authHeader())
      if (selectedScope === scopeId) { setSelectedScope(null); setSections([]) }
      await loadScopes()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao apagar') }
  }

  const commitRename = async (labelSnapshot: string | null) => {
    if (!selectedScope || !canEdit || labelSnapshot === null) return
    const trimmed = labelSnapshot.trim()
    if (!trimmed) return
    try {
      await saveLogicScopeMeta(selectedScope, { label: trimmed }, authHeader())
      setOverrides(prev => {
        const exists = prev.some(o => o.scopeId === selectedScope)
        if (exists) return prev.map(o => o.scopeId === selectedScope ? { ...o, label: trimmed } : o)
        return [...prev, { scopeId: selectedScope, isCustom: false, label: trimmed, fase: null, opTypes: null, sectionCount: 0, author: null, updatedAt: '' }]
      })
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao renomear') }
  }

  const selectedMeta = scopeList.find(s => s.scopeId === selectedScope)
  const selectedFullMeta = overrides.find(o => o.scopeId === selectedScope)

  const handleSaveMeta = useCallback(async (fase: string | null, opTypes: string[] | null) => {
    if (!selectedScope || !canEdit) return
    try {
      await saveLogicScopeMeta(selectedScope, { fase, opTypes }, authHeader())
      setOverrides(prev => prev.map(o => o.scopeId === selectedScope ? { ...o, fase, opTypes } : o))
      updateCustomScopeMeta(selectedScope, { fase, opTypes })
    } catch { /* offline */ }
  }, [selectedScope, canEdit])

  const handleInsertOpTypeQuestion = useCallback(() => {
    if (!canEdit || sections.length === 0) return
    const opTypeQuestion: LDec = {
      question: 'Tipo de sonda DP',
      answers: [
        { label: 'Generalista', active: true, field: 'operationType', value: 'Generalista' },
        { label: 'LWO (NS-51/NS-52)', field: 'operationType', value: 'LWO' },
      ],
    }
    const s2 = deepClone(sections) as LSec[]
    s2[0].decisions.unshift(opTypeQuestion)
    commitSections(s2)
  }, [canEdit, sections, commitSections])

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
        <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
          {SCOPE_CATEGORIES.map(cat => {
            const items = scopeList.filter(s => !s.isCustom && !s.isBlock && categoryOfScope(s.scopeId) === cat.id)
            const collapsed = collapsedCats.has(cat.id)
            return (
              <div key={cat.id}>
                <button onClick={() => toggleCat(cat.id)}
                  className="w-full flex items-center gap-1 px-3 pt-3 pb-0.5 text-slate-600 hover:text-slate-400 transition-colors">
                  {collapsed ? <ChevronRight size={9} className="shrink-0" /> : <ChevronDown size={9} className="shrink-0" />}
                  <span className="flex-1 text-left text-[9px] uppercase tracking-widest truncate">{cat.label}</span>
                  {items.length > 0 && <span className="text-[9px] text-slate-700 tabular-nums">{items.length}</span>}
                </button>
                {!collapsed && (items.length > 0 ? items.map(s => (
                  <button key={s.scopeId} onClick={() => selectScope(s.scopeId)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors rounded-lg mx-1 w-[calc(100%-0.5rem)]
                      ${selectedScope === s.scopeId ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
                    <Layers size={10} className="shrink-0 opacity-50" />
                    <span className="flex-1 truncate">{s.label}</span>
                    {hasOverride(s.scopeId) && <span className="w-1.5 h-1.5 rounded-full bg-[#d97706] shrink-0" title="Override ativo" />}
                  </button>
                )) : (
                  <p className="px-3 pl-6 py-1 text-[10px] text-slate-700 italic">vazio</p>
                ))}
              </div>
            )
          })}
          {scopeList.some(s => s.isBlock) && (
            <>
              <p className="text-[9px] px-3 pt-3 pb-0.5 text-slate-600 uppercase tracking-widest">Blocos de lógica</p>
              {scopeList.filter(s => s.isBlock).map(s => (
                <button key={s.scopeId} onClick={() => selectScope(s.scopeId)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs transition-colors rounded-lg mx-1 w-[calc(100%-0.5rem)]
                    ${selectedScope === s.scopeId ? 'bg-slate-700/60 text-slate-100' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
                  <Puzzle size={10} className="shrink-0 text-[#d97706]/70" />
                  <span className="flex-1 truncate">{s.label}</span>
                </button>
              ))}
            </>
          )}
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
                    <button onClick={e => { e.stopPropagation(); void handleDeleteCustom(s.scopeId) }}
                      title="Excluir escopo"
                      className={`shrink-0 pr-2 transition-all hover:text-rose-400 ${selectedScope === s.scopeId ? 'opacity-50 hover:opacity-100 text-slate-500' : 'opacity-0 group-hover:opacity-100 text-slate-600'}`}>
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
                {editingLabel !== null ? (
                  <input
                    autoFocus
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onBlur={e => {
                      if (renameCancelledRef.current) { renameCancelledRef.current = false; return }
                      const snap = e.currentTarget.value
                      setEditingLabel(null)
                      void commitRename(snap)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); const snap = editingLabel; setEditingLabel(null); void commitRename(snap) }
                      if (e.key === 'Escape') { renameCancelledRef.current = true; setEditingLabel(null) }
                    }}
                    className="w-full text-sm font-semibold bg-slate-800 border border-[#d97706]/60 rounded-md px-2 py-0.5 text-slate-100 outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 group/rename">
                    <h2 className="text-sm font-semibold text-slate-100 truncate">{selectedMeta?.label ?? selectedScope}</h2>
                    {canEdit && (selectedMeta?.isBlock || selectedMeta?.isCustom) && (
                      <button
                        onClick={() => setEditingLabel(selectedMeta?.label ?? selectedScope ?? '')}
                        title="Renomear"
                        className="opacity-0 group-hover/rename:opacity-100 text-slate-500 hover:text-[#d97706] transition-opacity shrink-0">
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
                {baseLabel && <p className="text-[10px] text-slate-500 mt-0.5">Base: {baseLabel}</p>}
              </div>

              {(
                <>
                  {canEdit && (selectedMeta?.isCustom || selectedMeta?.isBlock) && (
                    <button onClick={() => setShowBasePicker(true)}
                      className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-[#d97706] border border-slate-700 hover:border-[#d97706]/40 rounded-lg px-2 py-1.5 transition-colors">
                      <Copy size={10} /> Importar base
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
                  {isAdmin() && selectedMeta?.isCustom && selectedScope && (
                    <button onClick={() => void handleDeleteCustom(selectedScope)}
                      className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-rose-400 border border-slate-700/50 hover:border-rose-500/40 rounded-lg px-2 py-1.5 transition-colors">
                      <Trash2 size={10} /> Excluir
                    </button>
                  )}
                  {error && <p className="text-[10px] text-rose-400 shrink-0">{error}</p>}
                  {canEdit && selectedMeta?.isCustom && selectedFullMeta && (
                    <div className="relative" ref={scopePanelRef}>
                      <button
                        onClick={() => setShowScopePanel(v => !v)}
                        className={`flex items-center gap-1 text-[10px] border rounded-lg px-2 py-1.5 transition-colors ${
                          showScopePanel
                            ? 'border-[#d97706]/60 bg-[#d97706]/10 text-[#d97706]'
                            : 'text-slate-400 hover:text-amber-300 border-slate-700 hover:border-amber-600/40'
                        }`}>
                        Sonda/Escopo
                      </button>
                      {showScopePanel && (
                        <div className="absolute right-0 top-full mt-1.5 z-30 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 space-y-3"
                             onClick={e => e.stopPropagation()}>
                          {/* Fase */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Fase (etapa 1)</p>
                            <select
                              value={selectedFullMeta.fase ?? ''}
                              onChange={e => handleSaveMeta(e.target.value || null, selectedFullMeta.opTypes ?? null)}
                              className="w-full text-[10px] bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-200 outline-none focus:border-[#d97706]/60">
                              <option value="">Qualquer fase</option>
                              <option value="fase_1">Fase 1</option>
                              <option value="fase_2">Fase 2</option>
                              <option value="fase_unica">Fase Única (FSU)</option>
                            </select>
                          </div>

                          {/* Tipo de sonda */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Tipo de sonda (etapa 1)</p>
                            <div className="flex gap-1.5">
                              {(['Generalista', 'LWO'] as const).map(op => {
                                const cur = selectedFullMeta.opTypes ?? []
                                const checked = cur.includes(op)
                                const toggle = () => {
                                  const next = checked ? cur.filter(v => v !== op) : [...cur, op]
                                  handleSaveMeta(selectedFullMeta.fase ?? null, next.length ? next : null)
                                }
                                return (
                                  <label key={op} className={`flex-1 flex items-center justify-center py-1 rounded-md border text-[10px] cursor-pointer transition-colors ${
                                    checked ? 'border-[#d97706]/60 bg-[#d97706]/10 text-[#d97706]' : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                                  }`}>
                                    <input type="checkbox" className="sr-only" checked={checked} onChange={toggle} />
                                    {op}
                                  </label>
                                )
                              })}
                            </div>
                          </div>

                          {/* Inserir pergunta padrão */}
                          {sections.length > 0 && (
                            <div className="pt-1 border-t border-slate-700/60">
                              <button
                                onClick={() => { handleInsertOpTypeQuestion(); setShowScopePanel(false) }}
                                className="w-full text-left text-[10px] text-slate-400 hover:text-amber-300 px-1 py-0.5 transition-colors">
                                + Inserir pergunta "Tipo de sonda DP" no fluxo
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={past.length === 0}
                        onClick={undo}
                        title="Desfazer (Ctrl+Z)"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <RotateCcw size={11} />
                      </button>
                      <button
                        disabled={future.length === 0}
                        onClick={redo}
                        title="Refazer (Ctrl+Shift+Z)"
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <RotateCw size={11} />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setShowHelp(true)}
                    title="Ajuda — símbolos e botões do fluxograma"
                    className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 transition-colors">
                    <HelpCircle size={10} />
                    Ajuda
                  </button>
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

            {/* Conteúdo */}
            <div className="flex-1 min-h-0">
              {loading && (
                <div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando…</div>
              )}
              {!loading && sections.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600">
                  <div className="flex flex-col items-center gap-2">
                    <Layers size={28} className="opacity-20" />
                    <p className="text-sm text-slate-500">Escopo vazio</p>
                  </div>
                  {canEdit && (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        onClick={() => {
                          const sec = emptySection()
                          sec.decisions = [emptyDec()]
                          commitSections([sec])
                        }}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#d97706] hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow">
                        <Plus size={15} /> Inserir primeiro elemento
                      </button>
                      <button onClick={() => setShowBasePicker(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#d97706] transition-colors">
                        <Copy size={12} /> Importar de escopo base ou bloco
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!loading && sections.length > 0 && (
                <LogicGraphPanel
                  secs={sections}
                  editCb={canEdit ? handleEditAction : undefined}
                  pickMode={!!pendingTransfer}
                  selRef={null}
                />
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
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ─── Modal de ajuda ───────────────────────────────────────────────────────────
function HelpModal({ onClose }: { onClose: () => void }) {
  const SYMBOLS = [
    { sym: '✦', color: '#facc15', desc: 'Marca a resposta como padrão (caminho default do fluxo)' },
    { sym: '⚑', color: '#f97316', desc: 'Duplica a resposta como variante de contingência' },
    { sym: '×', color: '#ef4444', desc: 'Remove o item (resposta, pacote, pergunta ou entrada sequencial)' },
  ]
  const MENUS = [
    { glyph: '📦', color: '#3b82f6', label: 'Adicionar pacote', desc: 'Inclui um pacote de serviços nesta resposta ou ponto de convergência' },
    { glyph: '❓', color: '#0ea5e9', label: 'Adicionar pergunta', desc: 'Insere uma pergunta dentro desta resposta' },
    { glyph: '⤵', color: '#7c3aed', label: 'Adicionar sequencial', desc: 'Adiciona uma entrada sequencial (etapa ordenada) nesta resposta' },
    { glyph: '↑', color: '#0ea5e9', label: 'Inserir pergunta acima', desc: 'Cria uma nova pergunta imediatamente antes desta no fluxo' },
    { glyph: '➕', color: '#d97706', label: 'Adicionar decisão', desc: 'Inclui uma nova pergunta ao final de uma seção' },
    { glyph: '⤿', color: '#a855f7', label: 'Mover pergunta', desc: 'Move uma pergunta existente para este ponto do fluxo' },
    { glyph: '⧉', color: '#14b8a6', label: 'Copiar pergunta', desc: 'Copia uma pergunta existente para este ponto do fluxo' },
  ]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto scrollbar-custom m-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
          <HelpCircle size={15} className="text-[#d97706]" />
          <span className="text-sm font-semibold text-slate-100">Ajuda — Editor de Lógica</span>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-200 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Símbolos inline */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Símbolos no fluxograma</h3>
            <div className="space-y-1.5">
              {SYMBOLS.map(s => (
                <div key={s.sym} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 text-center text-base font-bold leading-none mt-0.5" style={{ color: s.color }}>{s.sym}</span>
                  <span className="text-[11px] text-slate-300 leading-snug">{s.desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Menus de contexto */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Itens de menu (clique na resposta)</h3>
            <div className="space-y-1.5">
              {MENUS.map(m => (
                <div key={m.label} className="flex items-start gap-3">
                  <span className="shrink-0 w-6 text-center text-base leading-none mt-0.5">{m.glyph}</span>
                  <div>
                    <span className="text-[11px] font-semibold leading-none" style={{ color: m.color }}>{m.label}</span>
                    <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
