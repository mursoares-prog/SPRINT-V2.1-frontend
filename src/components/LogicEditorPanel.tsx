/**
 * Editor de engine de sequenciamento — Admin UI
 * Usa o mesmo fluxograma SVG interativo: clique para editar perguntas, respostas
 * e pacotes; botões para adicionar/remover decisões e pernas de resposta.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
// Ícones padronizados na biblioteca react-icons (Phosphor), com alias para os nomes
// antes vindos de lucide-react — mantém todos os call sites (<Save/>, <Layers/>…) intactos.
import {
  PiStackFill as Layers,
  PiGitBranchFill as GitBranch,
  PiPuzzlePieceFill as Puzzle,
  PiPlusBold as Plus,
  PiTrashFill as Trash2,
  PiFloppyDiskFill as Save,
  PiArrowCounterClockwiseBold as RotateCcw,
  PiArrowClockwiseBold as RotateCw,
  PiCheckBold as Check,
  PiCopyFill as Copy,
  PiX as X,
  PiDownloadSimpleFill as Download,
  PiCaretLeftBold as ChevronLeft,
  PiCaretDownBold as ChevronDown,
  PiCaretUpBold as ChevronUp,
  PiCaretRightBold as ChevronRight,
  PiPencilSimpleFill as Pencil,
  PiFolderFill,
  PiFolderOpenFill,
  PiFolderPlusFill,
  PiClockCounterClockwiseBold as History,
  PiTreeStructureFill as LayoutDashboard,
} from 'react-icons/pi'
import {
  PiListDashesFill, PiInfoBold,
} from 'react-icons/pi'
import type { LSec, LDec, LAns, LPkg, LCondition, LSeqEntry } from '../data/logicSecs'
import { LOGIC_BY_SCOPE } from '../data/logicSecs'
import {
  getLogicScopes, getLogicScope, saveLogicScope, saveLogicScopeMeta,
  createLogicScope, deleteLogicScope, type LogicScopeMeta,
  getLogicScopeVersions, getLogicScopeVersion, restoreLogicScopeVersion,
  type LogicScopeVersionMeta,
  getLogicScopeGroups, saveLogicScopeGroups, isApiConfigured,
} from '../utils/api'
import { isAdmin, authHeader } from '../utils/auth'
import { updateCustomScopeMeta, getKnownWellClasses, getKnownRigTags, DEFAULT_WELL_CLASS } from '../data/logicOverrideStore'
import { PACKAGES } from '../data/packages'
import { setLogicOverrides, getLogicOverride, expandScopeRefs, resolveScopeSections, setScopeLabels } from '../data/logicOverrideStore'
import { type EditAction, type DecRef } from './LogicGraphPanel'
import { LogicFlowEditor, type LogicFlowEditorHandle } from './LogicFlowEditor'
import { ComboInput } from './ComboInput'
import { TagInput } from './TagInput'

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
  // Bloco de MOB por condicionais de sonda — usado (via ref) no início dos escopos FSU/FS1.
  BLK_MOB_DESCIDA_DP_COND: 'MOB · Descida DP (condicionais por sonda)',
  // Blocos fatorados de subsequências repetidas entre escopos.
  BLK_ACESSO_AMORTEC: 'Acesso inicial e amortecimento',
  BLK_CORTE_MEC_FS1: 'Corte Mecânico (FS1)',
  BLK_MOB_FS2:       'Mobilização (Fase 2)',
  BLK_BOP_INSTALA:   'BOP · Instalação',
  BLK_RET_COLUNA:    'Retirada de coluna (FETH + COP)',
  BLK_ISOLAMENTO:    'Isolamento (tampão)',
  BLK_BOP_RETIRA:    'BOP · Retirada',
}
const BLOCK_IDS = Object.keys(BLOCK_LABELS)

// Sugestões fixas para os campos "Tipo de poço"/"Tipo de sonda" do popover Sonda/Escopo —
// espelham as opções hardcoded da Etapa 1 do wizard (App.tsx). Ambos os campos aceitam
// qualquer texto livre além dessas sugestões (classes/sondas novas criadas pelo admin).
const WELL_CLASS_PRESETS = ['Completação Molhada', 'Completação Molhada Nordeste', DEFAULT_WELL_CLASS]
const RIG_TAG_PRESETS = ['Ancorada', 'DP Generalista', 'DP LWIV', 'PA', 'SPH', 'SPM/SM', 'Rigless']

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

// ─── Modal unificado de importação (base ou seções) ──────────────────────────

function UnifiedImportModal({ overrides, currentScopeId, loadScopeSections, allowBase, onImport, onBase, onClose }: {
  overrides: LogicScopeMeta[]
  currentScopeId: string | null
  loadScopeSections: (id: string) => Promise<LSec[]>
  allowBase: boolean
  onImport: (sections: LSec[]) => void
  onBase: (sourceId: string) => void
  onClose: () => void
}) {
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [sourceSecs, setSourceSecs] = useState<LSec[]>([])
  const [loadingSrc, setLoadingSrc] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const bundles = BUNDLE_IDS.filter(id => id !== currentScopeId)
  const blocks = BLOCK_IDS.filter(id => id !== currentScopeId)
  const customs = overrides.filter(o => o.isCustom && o.scopeId !== currentScopeId && !isReservedId(o.scopeId))

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

  const scopeItemCls = (id: string) =>
    `w-full text-left px-3 py-2 text-xs transition-colors ${sourceId === id ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'}`

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <Download size={14} className="text-[#d97706]" />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex-1">Importar de outro escopo</span>
          <button onClick={onClose}><X size={14} className="text-slate-500 dark:text-slate-400" /></button>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* Scope list */}
          <div className="w-48 shrink-0 border-r border-slate-200 dark:border-slate-700/40 py-2 overflow-y-auto scrollbar-custom">
            {bundles.length > 0 && (
              <>
                <p className="text-[9px] text-slate-400 dark:text-slate-600 uppercase tracking-widest px-3 pb-1">Bundle</p>
                {bundles.map(id => (
                  <button key={id} onClick={() => handleSelectSource(id)} className={scopeItemCls(id)}>
                    <span className="flex items-center gap-1.5"><Layers size={9} className="opacity-40 shrink-0" />{BUNDLE_LABELS[id]}</span>
                  </button>
                ))}
              </>
            )}
            {blocks.length > 0 && (
              <>
                <p className="text-[9px] text-slate-400 dark:text-slate-600 uppercase tracking-widest px-3 pt-3 pb-1">Blocos de lógica</p>
                {blocks.map(id => (
                  <button key={id} onClick={() => handleSelectSource(id)} className={scopeItemCls(id)}>
                    <span className="flex items-center gap-1.5"><Puzzle size={9} className="text-[#d97706]/50 shrink-0" />{BLOCK_LABELS[id]}</span>
                  </button>
                ))}
              </>
            )}
            {customs.length > 0 && (
              <>
                <p className="text-[9px] text-slate-400 dark:text-slate-600 uppercase tracking-widest px-3 pt-3 pb-1">Customizados</p>
                {customs.map(o => (
                  <button key={o.scopeId} onClick={() => handleSelectSource(o.scopeId)} className={scopeItemCls(o.scopeId)}>
                    <span className="flex items-center gap-1.5"><GitBranch size={9} className="text-[#d97706]/50 shrink-0" />{o.label ?? o.scopeId}</span>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Section selector */}
          <div className="flex-1 flex flex-col min-h-0">
            {!sourceId && (
              <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs text-center px-4">
                Selecione um escopo ou bloco à esquerda
              </div>
            )}
            {sourceId && loadingSrc && (
              <div className="flex-1 flex items-center justify-center text-slate-500 dark:text-slate-500 text-xs">Carregando…</div>
            )}
            {sourceId && !loadingSrc && (
              <>
                <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700/40">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Selecione as seções a adicionar ao final do fluxo atual</p>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-custom py-1">
                  {sourceSecs.map((sec, i) => (
                    <button key={i} onClick={() => toggleSec(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-2
                        ${selected.has(i) ? 'bg-[#d97706]/10 border-[#d97706]' : 'hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent'}`}>
                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border
                        ${selected.has(i) ? 'bg-[#d97706] border-[#d97706]' : 'border-slate-300 dark:border-slate-600'}`}>
                        {selected.has(i) && <Check size={10} className="text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{sec.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-500">
                          {sec.phase} · {sec.decisions.length} decisões{sec.always?.length ? ` · ${sec.always.length} sempre` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                  {sourceSecs.length === 0 && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 px-4 py-4">Nenhuma seção encontrada.</p>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700/40 flex items-center gap-2 justify-end">
                  {allowBase && sourceId && (
                    <button onClick={() => onBase(sourceId)}
                      title="Substitui todo o conteúdo atual pelo deste escopo"
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-amber-600 border border-slate-200 hover:border-amber-400/60 dark:text-slate-400 dark:hover:text-amber-300 dark:border-slate-700 dark:hover:border-amber-600/40 rounded-lg px-3 py-1.5 transition-colors">
                      <Copy size={11} /> Usar como base
                    </button>
                  )}
                  <button onClick={onClose} className="text-xs text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">Cancelar</button>
                  <button disabled={selected.size === 0} onClick={handleImport}
                    className="text-xs text-white bg-[#d97706] hover:bg-amber-600 px-4 py-1.5 rounded-lg font-semibold disabled:opacity-40">
                    Adicionar {selected.size > 0 ? `(${selected.size})` : 'seções'}
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

// ─── Modal: novo escopo customizado ──────────────────────────────────────────

// Deriva um ID técnico a partir do nome digitado pelo usuário (único campo do modal) —
// remove acentos (normalize NFD) antes de descartar caracteres não alfanuméricos, para
// que "Único" vire "Unico_..." em vez de perder a primeira letra.
const slugifyId = (s: string) => s.trim()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')

function NewScopeModal({ kind, onSave, onClose }: {
  kind: 'scope' | 'block'
  onSave: (scopeId: string, label: string) => Promise<void>; onClose: () => void
}) {
  const isBlock = kind === 'block'
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const trimmedName = name.trim()
  const slug = slugifyId(trimmedName)
  // Blocos usam prefixo obrigatório 'BLK_' (a UI os classifica como bloco por esse
  // prefixo) — gerado automaticamente a partir do nome, sem o usuário precisar sabê-lo.
  const id = slug ? (isBlock ? `BLK_${slug}` : slug) : ''
  const reserved = !!id && (BUNDLE_IDS.includes(id) || BLOCK_IDS.includes(id))
  const valid = !creating && !!trimmedName && !!id && !reserved

  const handleCreate = async () => {
    if (!valid) return
    setCreating(true); setLocalError(null)
    try { await onSave(id, trimmedName) }
    catch (e) { setLocalError(e instanceof Error ? e.message : `Erro ao criar ${isBlock ? 'bloco' : 'escopo'}`); setCreating(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          {isBlock ? <Puzzle size={14} className="text-[#008542] dark:text-[#d97706]" /> : <Plus size={14} className="text-[#008542] dark:text-[#d97706]" />}
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{isBlock ? 'Novo bloco de lógica' : 'Novo escopo customizado'}</span>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-500">
          {isBlock
            ? 'Um bloco é reutilizável: pode ser incluído em vários escopos. Após criar, edite o fluxograma do bloco.'
            : 'Após criar, escolha um escopo base e edite no fluxograma.'}
        </p>
        <div>
          <label className="text-[10px] text-slate-500 dark:text-slate-400">Nome</label>
          <input autoFocus value={name} onChange={e => { setName(e.target.value); setLocalError(null) }}
            placeholder={isBlock ? 'ex: Meu bloco reutilizável' : 'ex: Escopo customizado'}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="w-full mt-1 text-sm bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-100 outline-none border border-slate-200 dark:border-slate-700 focus:border-[#008542]/60 dark:focus:border-[#d97706]/60" />
          {reserved && <p className="text-[10px] text-rose-500 dark:text-rose-400 mt-0.5">Esse nome já está em uso — escolha outro.</p>}
        </div>
        {localError && <p className="text-[11px] text-rose-500 dark:text-rose-400">{localError}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={creating} className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40">Cancelar</button>
          <button disabled={!valid} onClick={handleCreate}
            className="px-4 py-1.5 text-sm bg-[#008542] hover:bg-[#006a35] dark:bg-[#d97706] dark:hover:bg-amber-600 text-white rounded-lg disabled:opacity-40 font-semibold">
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
  target: { ref: DecRef; ansIdx: number } | { secIdx: number } | { decRef: DecRef; placement: 'below' | 'replace' }
}

// Localiza, POR IDENTIDADE, a lista de decisões que contém `dec`, em qualquer nível da
// árvore: seções, afterDec, ans.sub/afterSub e entradas sequenciais/após-convergência
// (ans.seq, ans.after, dec.after). Robusto a mudanças de índice — usado pelas ações
// genéricas (mover/duplicar/inserir/transferir). `cleanup` apaga listas opcionais vazias.
type DecListHit = { list: LDec[]; idx: number; cleanup: () => void }
function findDecList(secs: LSec[], dec: LDec): DecListHit | null {
  let found: DecListHit | null = null
  const inList = (owner: { sub?: LDec[]; afterSub?: LDec[]; afterDec?: LDec[] } | LSec, key: 'sub' | 'afterSub' | 'afterDec' | 'decisions'): boolean => {
    const list = (owner as Record<string, LDec[] | undefined>)[key]
    if (!list) return false
    const i = list.indexOf(dec)
    if (i >= 0) {
      found = {
        list, idx: i,
        cleanup: key === 'decisions' ? () => {} : () => { if (!list.length) delete (owner as Record<string, LDec[] | undefined>)[key] },
      }
      return true
    }
    return list.some(inDec)
  }
  const inSeq = (entries?: LSeqEntry[]): boolean =>
    (entries ?? []).some(e => inList(e, 'sub') || inList(e, 'afterSub'))
  const inDec = (d: LDec): boolean => {
    for (const a of d.answers) {
      if (inList(a, 'sub') || inList(a, 'afterSub')) return true
      if (inSeq(a.seq) || inSeq(a.after)) return true
    }
    return inSeq(d.after) || inList(d, 'afterDec')
  }
  for (const sec of secs) if (inList(sec, 'decisions')) break
  return found
}

// `target` está na subárvore de `root` (ou é o próprio)? Bloqueia ciclos ao mover uma
// pergunta para dentro dela mesma (a origem sumiria junto com o destino).
function decInSubtree(root: LDec, target: LDec): boolean {
  if (root === target) return true
  const inSeq = (es?: LSeqEntry[]): boolean =>
    (es ?? []).some(e => [...(e.sub ?? []), ...(e.afterSub ?? [])].some(d => decInSubtree(d, target)))
  for (const a of root.answers) {
    if ([...(a.sub ?? []), ...(a.afterSub ?? [])].some(d => decInSubtree(d, target))) return true
    if (inSeq(a.seq) || inSeq(a.after)) return true
  }
  return inSeq(root.after) || (root.afterDec ?? []).some(d => decInSubtree(d, target))
}

// Marca (val=true) ou desmarca (val=false) como contingência TODOS os pacotes na subárvore
// de uma resposta: pacotes diretos, sequenciais (seq/after), e de TODAS as sub-perguntas em
// qualquer nível. Alimenta a bandeira de contingência do cabeçalho do chip.
function setAnswerSubtreeContingency(ans: LAns, val: boolean): void {
  const mark = (pkgs?: LPkg[]) => (pkgs ?? []).forEach(p => { p.isContingency = val })
  const walkSeq = (es?: LSeqEntry[]) => (es ?? []).forEach(e => {
    mark(e.packages)
    ;(e.sub ?? []).forEach(walkDec)
    ;(e.afterSub ?? []).forEach(walkDec)
  })
  const walkAns = (a: LAns) => {
    mark(a.packages)
    walkSeq(a.seq)
    walkSeq(a.after)
    ;(a.sub ?? []).forEach(walkDec)
    ;(a.afterSub ?? []).forEach(walkDec)
  }
  function walkDec(dec: LDec) {
    mark(dec.packages)
    walkSeq(dec.after)
    ;(dec.afterDec ?? []).forEach(walkDec)
    dec.answers.forEach(walkAns)
  }
  walkAns(ans)
}

// ─── Grupos de escopos (organização em pastas, persistido em localStorage) ───
type ScopeGroup = { id: string; name: string; parentId: string | null }
// `order` guarda a posição (ordinal) preferida de cada escopo DENTRO do seu grupo/sub-grupo.
// Materializado por grupo na 1ª reordenação; ausente → usa a ordem padrão (blocos primeiro).
type GroupStorage = { groups: ScopeGroup[]; memberships: Record<string, string | null>; order?: Record<string, number>; _v?: number }
const EMPTY_GS: GroupStorage = { groups: [], memberships: {} }

// Grupos pré-existentes (ex-categorias hard-coded → agora grupos de usuário)
const SEED_GROUPS: ScopeGroup[] = [
  { id: 'cat_molhada',  name: 'Abandono Completação Molhada', parentId: null },
  { id: 'cat_seca',     name: 'Abandono Completação Seca',    parentId: null },
  { id: 'cat_workover', name: 'Workover',                     parentId: null },
]
const SEED_V = 1

function loadGroupStorage(): GroupStorage {
  try {
    const raw = localStorage.getItem('lep-scope-groups')
    const stored: GroupStorage = raw ? JSON.parse(raw) : EMPTY_GS
    if ((stored._v ?? 0) < SEED_V) {
      // Semeia os grupos padrão preservando o que o usuário já criou. Dedup por id E por
      // nome: evita recriar "Abandono Completação Molhada" (etc.) se já houver uma pasta
      // com esse nome — mesmo que com outro id (blinda estados de localStorage legados).
      const existingIds = new Set(stored.groups.map(g => g.id))
      const existingNames = new Set(stored.groups.map(g => g.name))
      const newGroups = [...stored.groups, ...SEED_GROUPS.filter(g => !existingIds.has(g.id) && !existingNames.has(g.name))]
      // Todos os bundles vão para "Completação Molhada" se ainda sem grupo
      const newMem = { ...stored.memberships }
      for (const id of BUNDLE_IDS) { if (!newMem[id]) newMem[id] = 'cat_molhada' }
      const next: GroupStorage = { groups: newGroups, memberships: newMem, _v: SEED_V }
      localStorage.setItem('lep-scope-groups', JSON.stringify(next))
      return next
    }
    return stored
  } catch { return EMPTY_GS }
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export function LogicEditorPanel({ canEdit }: { canEdit: boolean }) {
  const [overrides, setOverrides] = useState<LogicScopeMeta[]>([])
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const [sections, setSections] = useState<LSec[]>([])
  const [baseLabel, setBaseLabel] = useState<string | null>(null)
  const [showScopePanel, setShowScopePanel] = useState(false)
  const [showScopeSidebar, setShowScopeSidebar] = useState(true)
  const [showFlowIndex, setShowFlowIndex] = useState(false)
  const [showFlowLegend, setShowFlowLegend] = useState(false)
  const flowEditorRef = useRef<LogicFlowEditorHandle>(null)
  // Largura da sidebar de escopos (px), redimensionável por mouse e persistida.
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = Number(localStorage.getItem('lep-sidebar-w'))
    return v >= 160 && v <= 520 ? v : 208
  })
  const [scopeGroups, setScopeGroups] = useState<GroupStorage>(loadGroupStorage)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [editingGroupId, setEditingGroupId] = useState<{ id: string; draft: string } | null>(null)
  const [creatingGroup, setCreatingGroup] = useState<{ parentId: string | null; draft: string } | null>(null)
  const [movingScopeId, setMovingScopeId] = useState<string | null>(null)
  const [movingGroupId, setMovingGroupId] = useState<string | null>(null)
  const scopePanelRef = useRef<HTMLDivElement>(null)
  const renameCancelledRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newScopeKind, setNewScopeKind] = useState<'scope' | 'block' | null>(null)
  // Histórico de versões (snapshots dos fluxogramas)
  const [showHistory, setShowHistory] = useState(false)
  const [versions, setVersions] = useState<LogicScopeVersionMeta[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
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
    | { kind: 'ref_dec_pkg'; ref: DecRef }
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
  // Inserção de pergunta via picker: no topo de uma seção ({secIdx, afterDecIdx}) ou em
  // qualquer nível, relativa a uma pergunta existente ({ref, offset: 0=acima, 1=abaixo}).
  const [pendingDec, setPendingDec] = useState<{ secIdx: number; afterDecIdx: number } | { ref: DecRef; offset: 0 | 1 } | { secIdx: number; aboveSempre: boolean } | null>(null)

  // Phase picker
  const [phasePick, setPhasePick] = useState<{ secIdx: number; current: string } | null>(null)

  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  // Ref para selectScope (definido adiante) — usada por handleEditAction (memoizado) ao
  // navegar para o escopo de um bloco, sem capturar uma closure obsoleta.
  const selectScopeRef = useRef<((id: string) => Promise<void>) | null>(null)

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

  // `deletable`: só overrides criados pelo usuário (não bundles/blocos hardcoded do código).
  // Blocos custom = override cujo scopeId começa com 'BLK_' → aparecem na seção "Blocos".
  const scopeList = [
    ...BUNDLE_IDS.map(id => ({ scopeId: id, label: BUNDLE_LABELS[id], isCustom: false, isBlock: false, deletable: false })),
    ...BLOCK_IDS.map(id => {
      const serverMeta = overrides.find(o => o.scopeId === id)
      return { scopeId: id, label: serverMeta?.label ?? BLOCK_LABELS[id], isCustom: false, isBlock: true, deletable: false }
    }),
    ...overrides.filter(o => o.isCustom && !isReservedId(o.scopeId)).map(o => {
      const isBlk = o.scopeId.startsWith('BLK_')
      return { scopeId: o.scopeId, label: o.label ?? o.scopeId, isCustom: !isBlk, isBlock: isBlk, deletable: true }
    }),
  ]

  const hasOverride = (scopeId: string) => overrides.some(o => o.scopeId === scopeId)
  // scopeIds de blocos incluídos (via `ref`) nas seções de um escopo (não expandidas).
  const refUsers = (scopeId: string): string[] =>
    resolveScopeSections(scopeId).filter(s => s.ref).map(s => s.ref!.scopeId)

  // ── Gestão de grupos ──────────────────────────────────────────────────────
  // Timer de debounce para o save no servidor (evita chamadas repetidas em reordenações).
  const groupSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Usa updater funcional para evitar closure stale (duas operações antes do re-render).
  const saveGroups = (updater: (prev: GroupStorage) => GroupStorage) => {
    setScopeGroups(prev => {
      // Força o marcador de versão em TODA escrita: sem isso, um updater que reconstrói o
      // objeto (ex.: groupDelete) perderia `_v`, e o próximo load re-semearia os grupos
      // padrão — fazendo a pasta "Abandono Completação Molhada" reaparecer vazia.
      const next = { ...updater(prev), _v: SEED_V }
      localStorage.setItem('lep-scope-groups', JSON.stringify(next))
      // Sincroniza com o servidor (debounced 600ms para aguentar reordenações rápidas).
      if (isApiConfigured() && isAdmin()) {
        if (groupSaveTimerRef.current) clearTimeout(groupSaveTimerRef.current)
        groupSaveTimerRef.current = setTimeout(() => {
          void saveLogicScopeGroups(next as unknown as Record<string, unknown>, authHeader())
        }, 600)
      }
      return next
    })
  }
  const groupCreate = (name: string, parentId: string | null) => {
    const id = `g${Date.now()}`
    saveGroups(prev => ({ ...prev, groups: [...prev.groups, { id, name: name.trim(), parentId }] }))
  }
  const groupRename = (id: string, name: string) => {
    saveGroups(prev => ({ ...prev, groups: prev.groups.map(g => g.id === id ? { ...g, name: name.trim() } : g) }))
  }
  const groupDelete = (id: string) => {
    saveGroups(prev => {
      const toDelete = new Set<string>()
      const collect = (gid: string) => { toDelete.add(gid); prev.groups.filter(g => g.parentId === gid).forEach(g => collect(g.id)) }
      collect(id)
      const newMem = { ...prev.memberships }
      for (const [sid, gid] of Object.entries(newMem)) { if (gid && toDelete.has(gid)) delete newMem[sid] }
      return { groups: prev.groups.filter(g => !toDelete.has(g.id)), memberships: newMem }
    })
  }
  const groupAssign = (scopeId: string, groupId: string | null) => {
    saveGroups(prev => {
      // Limpa a ordem antiga: no novo grupo o escopo entra ao fim (sem posição herdada).
      const order = { ...(prev.order ?? {}) }
      delete order[scopeId]
      return { ...prev, memberships: { ...prev.memberships, [scopeId]: groupId }, order }
    })
    setMovingScopeId(null)
  }
  const groupReparent = (groupId: string, newParentId: string | null) => {
    saveGroups(prev => {
      // Coleta descendentes para impedir referência circular
      const descendants = new Set<string>()
      const collect = (gid: string) => { descendants.add(gid); prev.groups.filter(g => g.parentId === gid).forEach(g => collect(g.id)) }
      collect(groupId)
      if (newParentId !== null && descendants.has(newParentId)) return prev
      return { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, parentId: newParentId } : g) }
    })
    setMovingGroupId(null)
  }
  const toggleGroupCollapse = (id: string) => setCollapsedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  // ── Ordenação dos escopos dentro de um grupo/sub-grupo ────────────────────
  // Escopos de um grupo (memberships === groupId), na ordem de exibição: padrão
  // (blocos primeiro, ordem de scopeList) e, por cima, a ordem preferida do usuário.
  // `.sort` é estável: quando ambos não têm ordem explícita, mantém-se o padrão.
  const membersOfGroup = (groupId: string | null) => {
    const order = scopeGroups.order ?? {}
    return scopeList
      .filter(s => (scopeGroups.memberships[s.scopeId] ?? null) === groupId)
      .sort((a, b) => (a.isBlock === b.isBlock ? 0 : a.isBlock ? -1 : 1))
      .sort((a, b) => {
        const oa = order[a.scopeId], ob = order[b.scopeId]
        if (oa == null && ob == null) return 0
        if (oa == null) return 1
        if (ob == null) return -1
        return oa - ob
      })
  }
  // Move um escopo uma posição (dir = -1 acima, +1 abaixo) dentro do seu grupo.
  // Materializa a ordem de todos os irmãos e troca os dois adjacentes.
  const moveScopeInGroup = (scopeId: string, dir: -1 | 1) => {
    const groupId = scopeGroups.memberships[scopeId] ?? null
    const members = membersOfGroup(groupId)
    const idx = members.findIndex(s => s.scopeId === scopeId)
    const swap = idx + dir
    if (idx < 0 || swap < 0 || swap >= members.length) return
    saveGroups(prev => {
      const order: Record<string, number> = { ...(prev.order ?? {}) }
      members.forEach((s, i) => { order[s.scopeId] = i })
      const a = members[idx].scopeId, b = members[swap].scopeId
      ;[order[a], order[b]] = [order[b], order[a]]
      return { ...prev, order }
    })
  }

  // ── Resize da sidebar por mouse (arrasta a borda direita) ─────────────────
  const startSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    let lastW = startW
    const onMove = (ev: MouseEvent) => {
      lastW = Math.min(520, Math.max(160, startW + (ev.clientX - startX)))
      setSidebarWidth(lastW)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.userSelect = ''
      localStorage.setItem('lep-sidebar-w', String(lastW))
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.userSelect = 'none'
  }

  // ── Tree picker inline para atribuição de grupo ───────────────────────────
  // Exibe a hierarquia completa de grupos com indentação; fecha ao clicar fora
  // (handler de mousedown adicionado em useEffect quando algum picker está aberto).
  const renderGroupPicker = (
    currentGroupId: string | null,
    onSelect: (id: string | null) => void,
    excludeIds: Set<string> = new Set(),
  ): React.ReactNode => {
    const renderNode = (group: ScopeGroup, d: number): React.ReactNode => {
      if (excludeIds.has(group.id)) return null
      const children = scopeGroups.groups.filter(g => g.parentId === group.id)
      const isCurrent = currentGroupId === group.id
      return (
        <div key={group.id}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => onSelect(group.id)}
            className={`w-full text-left flex items-center gap-1 py-0.5 rounded transition-colors
              ${isCurrent ? 'text-[#006a35] dark:text-amber-300 bg-amber-500/10' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/60'}`}
            style={{ paddingLeft: `${6 + d * 10}px` }}>
            {isCurrent
              ? <PiFolderOpenFill size={9} className="text-[#008542] dark:text-amber-400 shrink-0" />
              : <PiFolderFill size={9} className="text-amber-500/40 shrink-0" />}
            <span className="text-[10px] truncate">{group.name}</span>
          </button>
          {children.map(g => renderNode(g, d + 1))}
        </div>
      )
    }
    return (
      <div data-group-picker
        className="mt-0.5 bg-slate-100 dark:bg-slate-800 border border-[#008542]/30 dark:border-[#d97706]/30 rounded-lg shadow-xl overflow-hidden">
        <div className="max-h-44 overflow-y-auto py-1 scrollbar-custom">
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => onSelect(null)}
            className={`w-full text-left flex items-center gap-1 px-2 py-0.5 text-[10px] rounded transition-colors
              ${currentGroupId === null ? 'text-[#006a35] dark:text-amber-300 bg-amber-500/10' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/80 dark:hover:bg-slate-700/60'}`}>
            <PiFolderOpenFill size={9} className={currentGroupId === null ? 'text-[#008542] dark:text-amber-400' : 'opacity-30'} />
            Sem grupo
          </button>
          {scopeGroups.groups.filter(g => g.parentId === null && !excludeIds.has(g.id)).map(g => renderNode(g, 0))}
        </div>
      </div>
    )
  }

  // ── Renderizadores da árvore de grupos (funções inline p/ acessar estado) ─
  const renderScopeItem = (s: { scopeId: string; label: string; isCustom: boolean; isBlock: boolean; deletable?: boolean }, depth: number) => {
    const currentGroup = scopeGroups.memberships[s.scopeId] ?? null
    // Posição dentro do grupo (para reordenar). Só reordena quando está num grupo e há irmãos.
    const siblings = currentGroup !== null ? membersOfGroup(currentGroup) : []
    const pos = siblings.findIndex(x => x.scopeId === s.scopeId)
    const canReorder = currentGroup !== null && siblings.length > 1
    const Icon = s.isBlock ? Puzzle : s.isCustom ? GitBranch : Layers
    const iconCls = s.isBlock || s.isCustom ? 'text-[#008542] dark:text-[#d97706]/70' : 'opacity-50'
    // Só mostra excluir se não houver outros escopos que dependem deste bloco.
    const usedBy = s.deletable && s.isBlock ? scopeList.filter(o => refUsers(o.scopeId).includes(s.scopeId)) : []
    const canDelete = s.deletable && usedBy.length === 0
    return (
      <div key={s.scopeId}>
        <div className={`flex items-center rounded-lg mx-1 group/item transition-colors
          ${selectedScope === s.scopeId ? 'bg-slate-200/80 dark:bg-slate-700/60' : 'hover:bg-slate-100/80 dark:hover:bg-slate-800/50'}`}
          style={{ paddingLeft: `${depth * 10}px` }}>
          <button onClick={() => selectScope(s.scopeId)}
            className="flex-1 text-left flex items-center gap-2 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 min-w-0">
            <Icon size={10} className={`shrink-0 ${iconCls}`} />
            <span className="flex-1 truncate">{s.label}</span>
            {hasOverride(s.scopeId) && !s.isCustom && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#008542] dark:bg-[#d97706] shrink-0" title="Override ativo" />
            )}
          </button>
          <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
            {canReorder && (
              <>
                <button onClick={e => { e.stopPropagation(); if (pos > 0) moveScopeInGroup(s.scopeId, -1) }}
                  disabled={pos <= 0} title="Mover para cima"
                  className={`flex items-center transition-colors ${pos <= 0 ? 'text-slate-700 cursor-default' : 'text-slate-400 dark:text-slate-600 hover:text-[#008542] dark:hover:text-amber-400'}`}>
                  <ChevronUp size={11} />
                </button>
                <button onClick={e => { e.stopPropagation(); if (pos < siblings.length - 1) moveScopeInGroup(s.scopeId, 1) }}
                  disabled={pos >= siblings.length - 1} title="Mover para baixo"
                  className={`flex items-center transition-colors ${pos >= siblings.length - 1 ? 'text-slate-700 cursor-default' : 'text-slate-400 dark:text-slate-600 hover:text-[#008542] dark:hover:text-amber-400'}`}>
                  <ChevronDown size={11} />
                </button>
              </>
            )}
            {isAdmin() && (
              <>
                <button onClick={() => setMovingScopeId(movingScopeId === s.scopeId ? null : s.scopeId)}
                  title="Mover para grupo"
                  className="flex items-center text-slate-400 dark:text-slate-600 hover:text-[#008542] dark:hover:text-amber-400 transition-colors">
                  <PiFolderOpenFill size={11} />
                </button>
                {canDelete && (
                  <button onClick={e => { e.stopPropagation(); void handleDeleteCustom(s.scopeId) }}
                    title={s.isBlock ? 'Excluir bloco' : 'Excluir escopo'}
                    className="flex items-center text-slate-400 dark:text-slate-600 hover:text-rose-400 transition-colors">
                    <Trash2 size={10} />
                  </button>
                )}
                {s.deletable && !canDelete && usedBy.length > 0 && (
                  <span title={`Em uso por: ${usedBy.map(o => o.label).join(', ')}`}
                    className="flex items-center text-slate-700 cursor-not-allowed">
                    <Trash2 size={10} />
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {movingScopeId === s.scopeId && (
          <div className="mx-2 mb-1" style={{ paddingLeft: `${depth * 10}px` }}>
            {renderGroupPicker(currentGroup, (id) => groupAssign(s.scopeId, id))}
          </div>
        )}
      </div>
    )
  }

  const renderScopeGroup = (group: ScopeGroup, depth: number): React.ReactNode => {
    const collapsed = collapsedGroups.has(group.id)
    // Blocos de lógica não aparecem aqui — têm seção própria, fisicamente separada
    // (ver groupHasNonBlockContent / seção "Blocos de lógica" mais abaixo).
    const childScopes = membersOfGroup(group.id).filter(s => !s.isBlock)
    const childGroups = scopeGroups.groups.filter(g => g.parentId === group.id && groupHasNonBlockContent(g.id))
    const isEditing = editingGroupId?.id === group.id
    return (
      <div key={group.id} style={{ paddingLeft: `${depth * 10}px` }}>
        <div className="flex items-center gap-0.5 mx-1 rounded-lg group/grp hover:bg-slate-100/80 dark:hover:bg-slate-800/30 transition-colors">
          <button onClick={() => toggleGroupCollapse(group.id)} className="text-left flex items-center gap-1 flex-1 min-w-0 px-2 py-1.5">
            {collapsed
              ? <><ChevronRight size={9} className="text-slate-400 dark:text-slate-600 shrink-0" /><PiFolderFill size={12} className="text-amber-500/70 shrink-0" /></>
              : <><ChevronDown size={9} className="text-slate-400 dark:text-slate-600 shrink-0" /><PiFolderOpenFill size={12} className="text-amber-500/70 shrink-0" /></>}
            {isEditing ? (
              <input autoFocus value={editingGroupId!.draft}
                onChange={e => setEditingGroupId({ ...editingGroupId!, draft: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') { renameCancelledRef.current = true; groupRename(group.id, editingGroupId!.draft); setEditingGroupId(null) } if (e.key === 'Escape') { renameCancelledRef.current = true; setEditingGroupId(null) } }}
                onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; setEditingGroupId(null); return } if (editingGroupId?.draft.trim()) groupRename(group.id, editingGroupId!.draft); setEditingGroupId(null) }}
                onClick={e => e.stopPropagation()}
                className="flex-1 text-[11px] bg-slate-100 dark:bg-slate-800 border border-[#008542]/40 dark:border-[#d97706]/40 rounded px-1 text-slate-800 dark:text-slate-200 outline-none min-w-0" />
            ) : (
              <span className="flex-1 truncate text-[11px] text-slate-600 dark:text-slate-400">{group.name}</span>
            )}
          </button>
          {isAdmin() && (
            <div className="flex items-center gap-0.5 pr-1.5 opacity-0 group-hover/grp:opacity-100 transition-opacity">
              <button onClick={() => setCreatingGroup({ parentId: group.id, draft: '' })} title="Criar sub-grupo"
                className="flex items-center text-slate-400 dark:text-slate-600 hover:text-[#008542] dark:hover:text-amber-400 transition-colors"><PiFolderPlusFill size={10} /></button>
              <button onClick={() => setMovingGroupId(movingGroupId === group.id ? null : group.id)} title="Mover grupo"
                className={`flex items-center transition-colors ${movingGroupId === group.id ? 'text-[#008542] dark:text-amber-400' : 'text-slate-400 dark:text-slate-600 hover:text-[#008542] dark:hover:text-amber-400'}`}><PiFolderOpenFill size={10} /></button>
              <button onClick={() => setEditingGroupId({ id: group.id, draft: group.name })} title="Renomear"
                className="flex items-center text-slate-400 dark:text-slate-600 hover:text-[#008542] dark:hover:text-amber-400 transition-colors"><Pencil size={10} /></button>
              <button onClick={() => groupDelete(group.id)} title="Excluir grupo"
                className="flex items-center text-slate-400 dark:text-slate-600 hover:text-rose-400 transition-colors"><Trash2 size={10} /></button>
            </div>
          )}
        </div>
        {movingGroupId === group.id && (() => {
          // Coleta o grupo e todos seus descendentes para excluir do picker (evitar ciclos)
          const excluded = new Set<string>()
          const collect = (gid: string) => { excluded.add(gid); scopeGroups.groups.filter(g => g.parentId === gid).forEach(g => collect(g.id)) }
          collect(group.id)
          return (
            <div className="mx-2 mb-1">
              {renderGroupPicker(group.parentId, (id) => groupReparent(group.id, id), excluded)}
            </div>
          )
        })()}
        {!collapsed && (
          <div>
            {childScopes.map(s => renderScopeItem(s, depth + 1))}
            {childGroups.map(g => renderScopeGroup(g, depth + 1))}
            {creatingGroup?.parentId === group.id && (
              <div className="mx-3 my-0.5" style={{ paddingLeft: `${(depth + 1) * 10}px` }}>
                <input autoFocus value={creatingGroup.draft}
                  onChange={e => setCreatingGroup({ ...creatingGroup, draft: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter' && creatingGroup.draft.trim()) { renameCancelledRef.current = true; groupCreate(creatingGroup.draft, group.id); setCreatingGroup(null) } if (e.key === 'Escape') { renameCancelledRef.current = true; setCreatingGroup(null) } }}
                  onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; setCreatingGroup(null); return } if (creatingGroup?.draft.trim()) groupCreate(creatingGroup.draft, group.id); setCreatingGroup(null) }}
                  placeholder="Nome do sub-grupo…"
                  className="w-full text-[11px] bg-slate-100 dark:bg-slate-800 border border-[#008542]/40 dark:border-[#d97706]/40 rounded px-2 py-0.5 text-slate-800 dark:text-slate-200 outline-none" />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const loadScopes = useCallback(async () => {
    try { setOverrides(await getLogicScopes()) } catch { /* offline */ }
  }, [])

  useEffect(() => { void loadScopes() }, [loadScopes])

  // Carrega a configuração de grupos do servidor na montagem — sobrescreve o localStorage
  // para que múltiplos navegadores/sessões vejam sempre a mesma organização de pastas.
  useEffect(() => {
    if (!isApiConfigured()) return
    void getLogicScopeGroups().then(raw => {
      if (!raw || typeof raw !== 'object' || !Array.isArray((raw as GroupStorage).groups)) return
      const server = raw as GroupStorage
      // Aplica a mesma migração de seed que loadGroupStorage faz no boot local.
      if ((server._v ?? 0) < SEED_V) return
      setScopeGroups(server)
      localStorage.setItem('lep-scope-groups', JSON.stringify(server))
    }).catch(() => { /* servidor indisponível — mantém o localStorage */ })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém o registro global de rótulos em sincronia com os overrides — os cards de bloco
  // (`ref`) resolvem o nome vivo por scopeId, refletindo renomeações em todos os fluxogramas.
  useEffect(() => {
    const labels: Record<string, string> = {}
    for (const id of BUNDLE_IDS) labels[id] = BUNDLE_LABELS[id]
    for (const id of BLOCK_IDS) labels[id] = overrides.find(o => o.scopeId === id)?.label ?? BLOCK_LABELS[id]
    for (const o of overrides) if (o.label) labels[o.scopeId] = o.label
    setScopeLabels(labels)
  }, [overrides])

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

  // Fecha o tree picker de grupo ao clicar fora do elemento [data-group-picker]
  useEffect(() => {
    if (!movingScopeId && !movingGroupId) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-group-picker]')) {
        setMovingScopeId(null)
        setMovingGroupId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [movingScopeId, movingGroupId])

  const selectScope = async (scopeId: string) => {
    if (dirty && !confirm('Há alterações não salvas. Descartar?')) return
    setShowScopePanel(false)
    setShowFlowIndex(true)
    setSelectedScope(scopeId)
    setSections([])
    setPast([]); setFuture([])
    setDirty(false); setError(null); setBaseLabel(null)
    // Encerra qualquer preview/histórico do escopo anterior.
    previewSnapshotRef.current = null
    setPreviewVersionId(null); setShowHistory(false)

    const memOverride = getLogicOverride(scopeId)
    if (memOverride) { setSections(memOverride as LSec[]); setBaseLabel('override salvo'); return }
    if (hasOverride(scopeId)) {
      setLoading(true)
      try {
        const d = await getLogicScope(scopeId)
        const secs = d.sections as LSec[]
        // Override vazio (ex.: criado por edição de metadados) não deve mascarar o bundle
        // do código — carrega o bundle quando existe.
        if (secs.length > 0) { setSections(secs); setBaseLabel('override salvo') }
        else if (LOGIC_BY_SCOPE[scopeId]) { setSections(deepClone(LOGIC_BY_SCOPE[scopeId])); setBaseLabel('bundle (não modificado)') }
        else { setSections([]); setBaseLabel('override salvo') }
      } catch { setError('Erro ao carregar override.') } finally { setLoading(false) }
      return
    }
    if (BUNDLE_IDS.includes(scopeId) || BLOCK_IDS.includes(scopeId)) {
      setSections(deepClone(LOGIC_BY_SCOPE[scopeId] ?? []))
      setBaseLabel('bundle (não modificado)'); return
    }
    setShowImport(true)
  }
  selectScopeRef.current = selectScope

  const loadScopeSections = useCallback(async (sourceId: string): Promise<LSec[]> => {
    if (hasOverride(sourceId)) {
      return deepClone((await getLogicScope(sourceId)).sections as LSec[])
    }
    return deepClone(LOGIC_BY_SCOPE[sourceId] ?? [])
  }, [overrides]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyBase = async (sourceId: string) => {
    setShowImport(false); setLoading(true)
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

      case 'ins_near_sempre':
        setPendingDec({ secIdx: action.secIdx, aboveSempre: action.above })
        return

      case 'p_move_sempre_pos': {
        const sec = secs[action.secIdx]; if (!sec) return
        const cur = sec.alwaysAfterIdx ?? -1
        sec.alwaysAfterIdx = action.dir === 'up'
          ? Math.max(-1, cur - 1)
          : Math.min(sec.decisions.length - 1, cur + 1)
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

      // Desanexar bloco: substitui o placeholder `ref` pelas seções expandidas (cópia local).
      // A partir daqui as seções são editáveis só neste escopo (perde o vínculo vivo).
      case 'detach_ref_section': {
        const sec = secs[action.secIdx]
        if (!sec?.ref) return
        const inner = deepClone(expandScopeRefs(resolveScopeSections(sec.ref.scopeId))) as LSec[]
        if (!inner.length) { alert('Bloco vazio — nada a desanexar.'); return }
        secs.splice(action.secIdx, 1, ...inner)
        break
      }

      // Editar bloco geral: navega ao escopo BLK_ (edições lá propagam a todos que o incluem).
      case 'edit_ref_block':
        void selectScopeRef.current?.(action.scopeId)
        return

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
        // A bandeira do cabeçalho é o toggle mestre do chip: propaga a contingência para
        // TODOS os pacotes da subárvore da resposta (todos os níveis), não só os diretos.
        const target = !ans.contingency
        ans.contingency = target
        setAnswerSubtreeContingency(ans, target)
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

      case 'p_move_seq': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const arr = dec.answers[action.ansIdx]?.seq; if (!arr) return
        const t = action.dir === 'up' ? action.seqIdx - 1 : action.seqIdx + 1
        if (t < 0 || t >= arr.length) return
        ;[arr[action.seqIdx], arr[t]] = [arr[t], arr[action.seqIdx]]
        break
      }

      case 'p_set_seq_label': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const se = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]; if (!se) return
        se.label = action.value
        break
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

      case 'p_move_after': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const arr = dec.answers[action.ansIdx]?.after; if (!arr) return
        const t = action.dir === 'up' ? action.afterIdx - 1 : action.afterIdx + 1
        if (t < 0 || t >= arr.length) return
        ;[arr[action.afterIdx], arr[t]] = [arr[t], arr[action.afterIdx]]
        break
      }

      case 'p_set_after_label': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.answers[action.ansIdx]?.after?.[action.afterIdx]; if (!ae) return
        ae.label = action.value
        break
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
        ans.sub = [emptyDec(), ...(ans.sub ?? [])]
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

      case 'p_reorder_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkgs = dec.answers[action.ansIdx]?.packages; if (!pkgs) return
        const [item] = pkgs.splice(action.from, 1); pkgs.splice(action.to, 0, item)
        break
      }

      case 'p_reorder_dec_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkgs = dec.packages; if (!pkgs) return
        const [item] = pkgs.splice(action.from, 1); pkgs.splice(action.to, 0, item)
        break
      }

      case 'reorder_always': {
        const sec = secs[action.secIdx]; if (!sec) return
        const pkgs = sec.always; if (!pkgs) return
        const [item] = pkgs.splice(action.from, 1); pkgs.splice(action.to, 0, item)
        break
      }

      case 'p_dec_reorder_after_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkgs = dec.after?.[action.afterIdx]?.packages; if (!pkgs) return
        const [item] = pkgs.splice(action.from, 1); pkgs.splice(action.to, 0, item)
        break
      }

      case 'p_reorder_seq_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkgs = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]?.packages; if (!pkgs) return
        const [item] = pkgs.splice(action.from, 1); pkgs.splice(action.to, 0, item)
        break
      }

      case 'p_reorder_after_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkgs = dec.answers[action.ansIdx]?.after?.[action.afterIdx]?.packages; if (!pkgs) return
        const [item] = pkgs.splice(action.from, 1); pkgs.splice(action.to, 0, item)
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

      case 'transfer_target_dec':
        setPendingTransfer({ mode: action.mode, target: { decRef: action.ref, placement: action.placement } })
        return

      case 'pick_source': {
        const pt = pendingTransferRef.current; if (!pt) return
        setPendingTransfer(null)
        const { mode, target } = pt
        const srcDec = resolveRef(secs, action.ref); if (!srcDec) return

        // Resolve o objeto-destino ANTES de qualquer mutação (identidade sobrevive a splices)
        let tgtDec: LDec | null = null
        let tgtAns: LAns | null = null
        if ('ref' in target) {
          tgtDec = resolveRef(secs, target.ref)
          tgtAns = tgtDec?.answers[target.ansIdx] ?? null
          if (!tgtAns) return
        } else if ('decRef' in target) {
          tgtDec = resolveRef(secs, target.decRef); if (!tgtDec) return
        }
        // Guardas de ciclo/no-op. Mover uma pergunta para dentro da própria subárvore
        // apagaria origem e destino de uma vez; substituir por si mesma é um no-op.
        // (Substituir uma pergunta por uma sub-pergunta DELA é permitido — o conteúdo
        // antigo do destino é descartado por inteiro na troca.)
        const tgtInsideSrc = !!tgtDec && decInSubtree(srcDec, tgtDec)
        if ('decRef' in target && target.placement === 'replace') {
          if (tgtDec === srcDec) { alert('Origem e destino são a mesma pergunta.'); return }
          if (mode === 'move' && tgtInsideSrc) { alert('Não é possível substituir uma pergunta pelo conteúdo de uma pergunta que a contém.'); return }
        } else if (mode === 'move' && tgtInsideSrc) {
          alert('Não é possível mover uma pergunta para dentro dela mesma.')
          return
        }

        // MOVER: remove a origem da lista atual (por identidade) antes de inserir.
        // Exceção: substituição onde a origem está DENTRO do destino — o conteúdo antigo
        // do destino (que inclui a origem) é descartado por inteiro na troca.
        const replaceTarget = 'decRef' in target && target.placement === 'replace' ? tgtDec : null
        const srcInsideReplaceTgt = !!replaceTarget && decInSubtree(replaceTarget, srcDec)
        if (mode === 'move' && !srcInsideReplaceTgt) {
          const srcHit = findDecList(secs, srcDec); if (!srcHit) return
          srcHit.list.splice(srcHit.idx, 1)
          srcHit.cleanup()
        }
        const payload = mode === 'copy' ? (deepClone(srcDec) as LDec) : srcDec

        if ('secIdx' in target) {
          const sec = secs[target.secIdx]; if (!sec) return
          sec.decisions.push(payload)
        } else if ('decRef' in target) {
          if (target.placement === 'replace') {
            const t = tgtDec!
            t.question = payload.question
            t.answers = payload.answers
            for (const k of ['packages', 'after', 'afterDec', 'reuseScope'] as const) {
              if (payload[k] !== undefined) (t as unknown as Record<string, unknown>)[k] = payload[k]
              else delete (t as unknown as Record<string, unknown>)[k]
            }
          } else {
            const tgtHit = findDecList(secs, tgtDec!); if (!tgtHit) return
            tgtHit.list.splice(tgtHit.idx + 1, 0, payload)
          }
        } else {
          tgtAns!.sub = [...(tgtAns!.sub ?? []), payload]
        }
        break
      }

      // ── Ações genéricas de pergunta (qualquer nível, resolvidas por identidade) ──

      case 'p_move_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const hit = findDecList(secs, dec); if (!hit) return
        const t = action.dir === 'up' ? hit.idx - 1 : hit.idx + 1
        if (t < 0 || t >= hit.list.length) return
        ;[hit.list[hit.idx], hit.list[t]] = [hit.list[t], hit.list[hit.idx]]
        break
      }

      case 'p_copy_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const hit = findDecList(secs, dec); if (!hit) return
        hit.list.splice(hit.idx + 1, 0, deepClone(dec))
        break
      }

      case 'p_ins_dec':
        setPendingDec({ ref: action.ref, offset: action.offset })
        return

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
        const dec = resolveRef(secs, action.ref); if (!dec) return
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
        const dec = resolveRef(secs, action.ref); if (!dec) return
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

      case 'p_add_dec_pkg':
        setPendingAdd({ kind: 'ref_dec_pkg', ref: action.ref })
        return

      case 'p_add_dec_pkg_direct': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.packages = [...(dec.packages ?? []), { id: action.pkgId, name: action.pkgName }]
        break
      }

      case 'p_remove_dec_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.packages = (dec.packages ?? []).filter((_, i) => i !== action.pkgIdx)
        if (!dec.packages.length) delete dec.packages
        break
      }

      case 'p_move_dec_pkg': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkgs = dec.packages ?? []; if (!pkgs.length) return
        const target = action.dir === 'up' ? action.pkgIdx - 1 : action.pkgIdx + 1
        if (target < 0 || target >= pkgs.length) return
        ;[pkgs[action.pkgIdx], pkgs[target]] = [pkgs[target], pkgs[action.pkgIdx]]
        dec.packages = pkgs
        break
      }

      case 'p_clear_dec_pkgs': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        delete dec.packages
        break
      }

      case 'p_clear_ans_pkgs': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        delete ans.packages
        break
      }

      case 'p_toggle_ans_pkg_contingency': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.answers[action.ansIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        pkg.isContingency = !pkg.isContingency
        if (!pkg.isContingency) delete pkg.isContingency
        break
      }

      case 'p_toggle_dec_pkg_contingency': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.packages?.[action.pkgIdx]; if (!pkg) return
        pkg.isContingency = !pkg.isContingency
        if (!pkg.isContingency) delete pkg.isContingency
        break
      }

      case 'p_ins_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.answers.splice(action.atIdx, 0, { label: 'Nova resposta', packages: [] })
        break
      }

      // ── Editor de fluxo: posições manuais ────────────────────────────────────
      case 'set_node_pos': {
        const t = action.target
        if (t.kind === 'sec') {
          const sec = secs[t.secIdx]; if (!sec) return
          sec._pos = action.pos
        } else {
          const dec = resolveRef(secs, t.ref); if (!dec) return
          if (t.kind === 'q') dec._pos = action.pos
          else if (t.kind === 'conv') dec._convPos = action.pos
          else {
            const ans = dec.answers[t.ansIdx]; if (!ans) return
            ans._pos = action.pos
          }
        }
        // Arrastar nós não entra no histórico de undo — atualização direta do estado.
        sectionsRef.current = secs
        setSections(secs)
        setDirty(true)
        return
      }

      case 'clear_node_pos': {
        const stripEntry = (e: { sub?: LDec[]; afterSub?: LDec[] }) => {
          e.sub?.forEach(stripDec); e.afterSub?.forEach(stripDec)
        }
        function stripDec(d: LDec) {
          delete d._pos; delete d._convPos
          for (const a of d.answers) {
            delete a._pos
            a.sub?.forEach(stripDec); a.afterSub?.forEach(stripDec)
            a.after?.forEach(stripEntry); a.seq?.forEach(stripEntry)
          }
          d.afterDec?.forEach(stripDec)
          d.after?.forEach(stripEntry)
        }
        for (const sec of secs) { delete sec._pos; sec.decisions.forEach(stripDec) }
        break
      }

      case 'p_set_ans_field': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        if (action.field) { ans.field = action.field; ans.value = action.value }
        else { delete ans.field; delete ans.value }
        break
      }

      case 'p_set_pkg_condition': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = action.ansIdx !== undefined
          ? dec.answers[action.ansIdx]?.packages?.[action.pkgIdx]
          : dec.packages?.[action.pkgIdx]
        if (!pkg) return
        if (action.condition) pkg.condition = action.condition as LCondition
        else delete pkg.condition
        break
      }

      case 'p_set_dec_after_pkg_condition': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.after?.[action.afterIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        if (action.condition) pkg.condition = action.condition as LCondition
        else delete pkg.condition
        break
      }

      case 'p_set_seq_pkg_condition': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        if (action.condition) pkg.condition = action.condition as LCondition
        else delete pkg.condition
        break
      }

      case 'p_set_after_pkg_condition': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.answers[action.ansIdx]?.after?.[action.afterIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        if (action.condition) pkg.condition = action.condition as LCondition
        else delete pkg.condition
        break
      }

      case 'p_set_pkg_phase': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = action.ansIdx !== undefined
          ? dec.answers[action.ansIdx]?.packages?.[action.pkgIdx]
          : dec.packages?.[action.pkgIdx]
        if (!pkg) return
        if (action.phase) pkg.phase = action.phase as import('../data/logicSecs').LPkgPhase
        else delete pkg.phase
        break
      }

      case 'p_set_dec_after_pkg_phase': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.after?.[action.afterIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        if (action.phase) pkg.phase = action.phase as import('../data/logicSecs').LPkgPhase
        else delete pkg.phase
        break
      }

      case 'p_set_seq_pkg_phase': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        if (action.phase) pkg.phase = action.phase as import('../data/logicSecs').LPkgPhase
        else delete pkg.phase
        break
      }

      case 'p_set_after_pkg_phase': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const pkg = dec.answers[action.ansIdx]?.after?.[action.afterIdx]?.packages?.[action.pkgIdx]; if (!pkg) return
        if (action.phase) pkg.phase = action.phase as import('../data/logicSecs').LPkgPhase
        else delete pkg.phase
        break
      }

      // ── Contingência de CAMPO (LSeqEntry) ──────────────────────────────────
      case 'p_toggle_dec_after_conting': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.after?.[action.afterIdx]; if (!ae) return
        ae.contingency = !ae.contingency
        if (!ae.contingency) delete ae.contingency
        break
      }

      case 'p_toggle_ans_after_conting': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ae = dec.answers[action.ansIdx]?.after?.[action.afterIdx]; if (!ae) return
        ae.contingency = !ae.contingency
        if (!ae.contingency) delete ae.contingency
        break
      }

      case 'p_toggle_ans_seq_conting': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const se = dec.answers[action.ansIdx]?.seq?.[action.seqIdx]; if (!se) return
        se.contingency = !se.contingency
        if (!se.contingency) delete se.contingency
        break
      }

      // ── Colar (clipboard interno do LogicFlowEditor: Ctrl+C/Ctrl+V) ─────────
      case 'p_paste_dec': {
        const anchor = resolveRef(secs, action.ref); if (!anchor) return
        const hit = findDecList(secs, anchor); if (!hit) return
        hit.list.splice(hit.idx + 1, 0, deepClone(action.dec) as unknown as LDec)
        break
      }

      case 'p_paste_sub_dec': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        const ans = dec.answers[action.ansIdx]; if (!ans) return
        ans.sub = [...(ans.sub ?? []), deepClone(action.dec) as unknown as LDec]
        break
      }

      case 'p_paste_ans': {
        const dec = resolveRef(secs, action.ref); if (!dec) return
        dec.answers.push(deepClone(action.ans) as unknown as LAns)
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

  // Inserir decisão (do picker) na posição certa — em seção ou relativa a outra pergunta
  const handleInsertDecision = (dec: LDec) => {
    if (!pendingDec) return
    const secs = deepClone(sectionsRef.current) as LSec[]
    if ('ref' in pendingDec) {
      const anchor = resolveRef(secs, pendingDec.ref); if (!anchor) return
      const hit = findDecList(secs, anchor); if (!hit) return
      hit.list.splice(hit.idx + pendingDec.offset, 0, dec)
    } else if ('aboveSempre' in pendingDec) {
      // Inserção relativa ao chip SEMPRE: splice após decisions[alwaysAfterIdx] e,
      // se above=true, incrementa alwaysAfterIdx para SEMPRE ficar após a nova pergunta.
      const sec = secs[pendingDec.secIdx]; if (!sec) return
      const curPos = sec.alwaysAfterIdx ?? -1
      sec.decisions.splice(curPos + 1, 0, dec)
      if (pendingDec.aboveSempre) sec.alwaysAfterIdx = curPos + 1
    } else {
      const sec = secs[pendingDec.secIdx]; if (!sec) return
      sec.decisions.splice(pendingDec.afterDecIdx + 1, 0, dec)
    }
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
    } else if (pendingAdd.kind === 'ref_dec_pkg') {
      const dec = resolveRef(secs, pendingAdd.ref); if (!dec) return
      dec.packages = [...(dec.packages ?? []), pkg]
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
      // Histórico de undo é descartado após persistir — o estado salvo vira a base.
      pastRef.current = []; futureRef.current = []
      setPast([]); setFuture([])
      await loadScopes()
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  // ── Histórico de versões ────────────────────────────────────────────────────
  // Estado do fluxograma antes de entrar no preview de uma versão, para poder voltar.
  const previewSnapshotRef = useRef<{ sections: LSec[]; dirty: boolean } | null>(null)

  const openHistory = async () => {
    if (!selectedScope) return
    setShowHistory(true); setVersionsLoading(true); setError(null)
    try { setVersions(await getLogicScopeVersions(selectedScope)) }
    catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar histórico'); setVersions([]) }
    finally { setVersionsLoading(false) }
  }

  const previewVersion = async (versionId: string) => {
    if (!selectedScope) return
    try {
      const v = await getLogicScopeVersion(selectedScope, versionId)
      // Guarda o estado editável atual só na 1ª entrada em preview (não sobrescreve ao trocar).
      if (!previewVersionId) previewSnapshotRef.current = { sections: sectionsRef.current, dirty }
      setSections(v.sections as LSec[])
      setPreviewVersionId(versionId)
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao carregar versão') }
  }

  const exitPreview = () => {
    const snap = previewSnapshotRef.current
    if (snap) { setSections(snap.sections); setDirty(snap.dirty) }
    previewSnapshotRef.current = null
    setPreviewVersionId(null)
  }

  const restoreVersion = async (versionId: string) => {
    if (!selectedScope || !canEdit) return
    if (!confirm('Restaurar o escopo a esta versão? O estado atual será salvo no histórico.')) return
    try {
      const r = await restoreLogicScopeVersion(selectedScope, versionId, authHeader())
      previewSnapshotRef.current = null
      setPreviewVersionId(null)
      // Recarrega as seções restauradas do servidor e atualiza o cache de overrides.
      const d = await getLogicScope(selectedScope)
      setSections(d.sections as LSec[])
      const map: Record<string, unknown[]> = {}
      scopeList.forEach(s => { const ov = getLogicOverride(s.scopeId); if (ov) map[s.scopeId] = ov as unknown[] })
      map[selectedScope] = d.sections
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLogicOverrides(map as any)
      setDirty(false); setBaseLabel('override salvo (restaurado)')
      setPast([]); setFuture([]); pastRef.current = []; futureRef.current = []
      await loadScopes()
      await openHistory()  // recarrega a lista (nova versão de restauração aparece no topo)
      void r
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao restaurar versão') }
  }

  const handleImportSections = (importedSecs: LSec[]) => {
    const secs = deepClone(sectionsRef.current) as LSec[]
    for (const sec of importedSecs) secs.push({ ...sec, id: `sec_${uid()}` })
    commitSections(secs); setShowImport(false)
  }

  const handleCreateScope = async (scopeId: string, label: string) => {
    await createLogicScope({ scopeId, label, sections: [] }, authHeader())
    setNewScopeKind(null); await loadScopes()
    setSelectedScope(scopeId); setSections([]); setDirty(false); setError(null); setBaseLabel(null)
  }

  const handleDeleteCustom = async (scopeId: string) => {
    const isBlk = scopeId.startsWith('BLK_')
    // Blocos podem estar incluídos (via `ref`) em outros escopos — avisa antes de excluir.
    const users = isBlk ? scopeList.filter(s => refUsers(s.scopeId).includes(scopeId)).map(s => s.label) : []
    const msg = isBlk
      ? `Apagar o bloco "${scopeId}"?` +
        (users.length ? `\n\nEle é usado por: ${users.join(', ')}. Esses escopos ficarão sem o conteúdo do bloco.` : '') +
        `\n\nEsta ação não pode ser desfeita.`
      : `Apagar "${scopeId}"? Esta ação não pode ser desfeita.`
    if (!confirm(msg)) return
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
        return [...prev, { scopeId: selectedScope, isCustom: false, label: trimmed, fase: null, opTypes: null, rigTypes: null, wellClass: null, sectionCount: 0, author: null, updatedAt: '' }]
      })
    } catch (e) { setError(e instanceof Error ? e.message : 'Erro ao renomear') }
  }

  const selectedMeta = scopeList.find(s => s.scopeId === selectedScope)
  const selectedFullMeta = overrides.find(o => o.scopeId === selectedScope)

  const handleSaveMeta = useCallback(async (fase: string | null, opTypes: string[] | null, rigTypes: string[] | null, wellClass: string | null) => {
    if (!selectedScope || !canEdit) return
    try {
      await saveLogicScopeMeta(selectedScope, { fase, opTypes, rigTypes, wellClass }, authHeader())
      setOverrides(prev => prev.map(o => o.scopeId === selectedScope ? { ...o, fase, opTypes, rigTypes, wellClass } : o))
      updateCustomScopeMeta(selectedScope, { fase, opTypes, rigTypes, wellClass })
    } catch { /* offline */ }
  }, [selectedScope, canEdit])

  // Um grupo só aparece na árvore de Escopos se tiver, direta ou recursivamente, algum
  // item que NÃO seja bloco — blocos de lógica têm seção própria (ver abaixo), separada
  // fisicamente da árvore de escopos.
  const groupHasNonBlockContent = (groupId: string): boolean => {
    if (membersOfGroup(groupId).some(s => !s.isBlock)) return true
    return scopeGroups.groups.filter(g => g.parentId === groupId).some(g => groupHasNonBlockContent(g.id))
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Sidebar de escopos ── */}
      {showScopeSidebar ? (
      <div className="shrink-0 border-r border-slate-200 dark:border-slate-700/40 flex flex-col min-h-0 relative" style={{ width: sidebarWidth }}>
        <div className="px-3 py-2.5 border-b border-slate-200 dark:border-slate-700/30 flex items-center gap-1">
          <span className="flex-1 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Escopos</span>
          {isAdmin() && (
            <>
              <button onClick={() => setCreatingGroup({ parentId: null, draft: '' })} title="Criar grupo"
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-500 hover:text-[#008542] dark:hover:text-[#d97706] hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors">
                <PiFolderPlusFill size={12} />
              </button>
              <button onClick={() => setNewScopeKind('scope')} title="Novo escopo customizado"
                className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-[#008542] dark:hover:text-[#d97706] hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors">
                <Plus size={13} />
              </button>
            </>
          )}
          <button onClick={() => setShowScopeSidebar(false)} title="Ocultar sidebar de escopos"
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors">
            <ChevronLeft size={12} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-custom py-1 min-h-0">

          {/* ── Grupos do usuário (aparecem primeiro, contêm qualquer tipo de escopo) ── */}
          {scopeGroups.groups.filter(g => g.parentId === null && groupHasNonBlockContent(g.id)).map(g => renderScopeGroup(g, 0))}
          {creatingGroup?.parentId === null && (
            <div className="mx-3 my-1">
              <input autoFocus value={creatingGroup.draft}
                onChange={e => setCreatingGroup({ ...creatingGroup, draft: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' && creatingGroup.draft.trim()) { renameCancelledRef.current = true; groupCreate(creatingGroup.draft, null); setCreatingGroup(null) } if (e.key === 'Escape') { renameCancelledRef.current = true; setCreatingGroup(null) } }}
                onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; setCreatingGroup(null); return } if (creatingGroup?.draft.trim()) groupCreate(creatingGroup.draft, null); setCreatingGroup(null) }}
                placeholder="Nome do grupo…"
                className="w-full text-[11px] bg-slate-100 dark:bg-slate-800 border border-[#008542]/40 dark:border-[#d97706]/40 rounded px-2 py-0.5 text-slate-800 dark:text-slate-200 outline-none" />
            </div>
          )}

          {/* ── Bundles não agrupados (fallback — normalmente vazio, pois todos estão em grupos) ── */}
          {scopeList.some(s => !s.isCustom && !s.isBlock && (scopeGroups.memberships[s.scopeId] ?? null) === null) && (
            <>
              <p className="text-[9px] px-3 pt-3 pb-0.5 text-slate-400 dark:text-slate-600 uppercase tracking-widest">Escopos</p>
              {scopeList.filter(s => !s.isCustom && !s.isBlock && (scopeGroups.memberships[s.scopeId] ?? null) === null).map(s => renderScopeItem(s, 0))}
            </>
          )}

          {/* ── Customizados não agrupados ── */}
          {scopeList.some(s => s.isCustom && (scopeGroups.memberships[s.scopeId] ?? null) === null) && (
            <>
              <p className="text-[9px] px-3 pt-3 pb-0.5 text-slate-400 dark:text-slate-600 uppercase tracking-widest">Customizados</p>
              {scopeList.filter(s => s.isCustom && (scopeGroups.memberships[s.scopeId] ?? null) === null).map(s => renderScopeItem(s, 0))}
            </>
          )}

          {/* ── Blocos de lógica — menu próprio, fisicamente separado (borda) da árvore
              de Escopos acima, logo abaixo dela; mesma formatação do cabeçalho de
              Escopos. Lista TODOS os blocos, independentemente de agrupamento antigo. ── */}
          <div className="mt-1 pt-2.5 border-t border-slate-200 dark:border-slate-700/30">
            <div className="px-3 pb-1 flex items-center gap-1">
              <span className="flex-1 text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Blocos de lógica</span>
              {isAdmin() && (
                <button onClick={() => setNewScopeKind('block')} title="Novo bloco de lógica"
                  className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-[#008542] dark:hover:text-[#d97706] hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors">
                  <Puzzle size={12} />
                </button>
              )}
            </div>
            {scopeList.filter(s => s.isBlock).map(s => renderScopeItem(s, 0))}
          </div>
        </div>

        {/* Handle de redimensionamento — arraste a borda direita da sidebar */}
        <div onMouseDown={startSidebarResize}
          title="Arraste para redimensionar"
          className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-[#006a35] dark:hover:bg-[#d97706]/50 active:bg-[#008542]/70 dark:active:bg-[#d97706]/70 transition-colors" />
      </div>
      ) : (
        /* Sidebar colapsada — tira só 8px, botão para expandir */
        <div className="border-r border-slate-200 dark:border-slate-700/40 flex flex-col items-center py-2 w-8 shrink-0 gap-1">
          <button onClick={() => setShowScopeSidebar(true)} title="Mostrar escopos"
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors">
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* ── Área principal ── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {!selectedScope ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-600">
            <div className="text-center space-y-2">
              <Layers size={28} className="opacity-20 mx-auto" />
              <p className="text-sm">Selecione um escopo para configurar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-700/40 shrink-0 flex-wrap">
              <div className={`min-w-0 ${editingLabel !== null ? 'w-full max-w-md' : 'max-w-xs'}`}>
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
                    className="w-full text-sm font-semibold bg-slate-100 dark:bg-slate-800 border border-[#008542]/60 dark:border-[#d97706]/60 rounded-md px-2 py-0.5 text-slate-900 dark:text-slate-100 outline-none"
                  />
                ) : (
                  <div className="flex items-center gap-1.5 group/rename">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedMeta?.label ?? selectedScope}</h2>
                    {canEdit && (selectedMeta?.isBlock || selectedMeta?.isCustom) && (
                      <button
                        onClick={() => setEditingLabel(selectedMeta?.label ?? selectedScope ?? '')}
                        title="Renomear"
                        className="opacity-0 group-hover/rename:opacity-100 text-slate-500 hover:text-[#008542] dark:hover:text-[#d97706] transition-opacity shrink-0">
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                )}
                {baseLabel && <p className="text-[10px] text-slate-500 mt-0.5">Base: {baseLabel}</p>}
              </div>

              {/* Desfazer / Refazer — lado esquerdo, logo após o título */}
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button
                    disabled={past.length === 0}
                    onClick={undo}
                    title="Desfazer (Ctrl+Z)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <RotateCcw size={11} />
                  </button>
                  <button
                    disabled={future.length === 0}
                    onClick={redo}
                    title="Refazer (Ctrl+Shift+Z)"
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                    <RotateCw size={11} />
                  </button>
                </div>
              )}

              {dirty && (
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#008542] dark:text-amber-400 bg-[#008542]/10 dark:bg-amber-900/25 border border-[#008542]/40 dark:border-amber-700/40 rounded-full px-2 py-0.5">
                  não salvo
                </span>
              )}

              {/* Separador flexível — empurra os botões de ação para a direita */}
              <div className="flex-1" />

              {(
                <>
                  {canEdit && (
                    <button onClick={() => setShowImport(true)}
                      className="flex items-center gap-1 text-[10px] text-white bg-[#005889] hover:bg-[#004a75] dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-lg px-2 py-1.5 transition-colors">
                      <Download size={10} /> Importar
                    </button>
                  )}
                  {error && <p className="text-[10px] text-rose-400 shrink-0">{error}</p>}
                  {canEdit && selectedMeta?.isCustom && selectedFullMeta && (
                    <div className="relative" ref={scopePanelRef}>
                      <button
                        onClick={() => setShowScopePanel(v => !v)}
                        className={`flex items-center gap-1 text-[10px] rounded-lg px-2 py-1.5 transition-colors ${
                          showScopePanel
                            ? 'bg-[#004a75] text-white'
                            : 'text-white bg-[#005889] hover:bg-[#004a75]'
                        }`}>
                        Sonda/Escopo
                      </button>
                      {showScopePanel && (
                        <div className="absolute right-0 top-full mt-1.5 z-30 w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 space-y-3"
                             onClick={e => e.stopPropagation()}>
                          {/* Tipo de poço — classificação livre. Vazio = bucket legado
                              "Completação Seca" (compat. com escopos criados antes deste
                              campo, ex.: PGA5). Opções fixas espelham a Etapa 1 do wizard;
                              qualquer outro texto digitado vira uma classe nova. */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Tipo de poço</p>
                            <ComboInput
                              value={selectedFullMeta.wellClass ?? ''}
                              onChange={v => handleSaveMeta(selectedFullMeta.fase ?? null, selectedFullMeta.opTypes ?? null, selectedFullMeta.rigTypes ?? null, v.trim() || null)}
                              options={[...new Set([...WELL_CLASS_PRESETS, ...getKnownWellClasses()])]}
                              placeholder={`${DEFAULT_WELL_CLASS} (padrão)`}
                              className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 outline-none focus:border-[#005889]/60"
                            />
                          </div>

                          {/* Fase */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Fase</p>
                            <select
                              value={selectedFullMeta.fase ?? ''}
                              onChange={e => handleSaveMeta(e.target.value || null, selectedFullMeta.opTypes ?? null, selectedFullMeta.rigTypes ?? null, selectedFullMeta.wellClass ?? null)}
                              className="w-full text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 outline-none focus:border-[#005889]/60">
                              <option value="">Qualquer fase</option>
                              <option value="fase_1">Fase 1</option>
                              <option value="fase_2">Fase 2</option>
                              <option value="fase_unica">Fase Única (FSU)</option>
                            </select>
                          </div>

                          {/* Tipo de sonda — classificação livre e multivalor, escopada
                              pelo Tipo de poço acima (sugestões de outros escopos da
                              mesma classe). Opções fixas cobrem os casos comuns; qualquer
                              texto digitado que não esteja na lista vira uma sonda nova
                              ("outra"), sem precisar de outro campo. */}
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1">Tipo de sonda</p>
                            <TagInput
                              values={selectedFullMeta.rigTypes ?? []}
                              onChange={next => handleSaveMeta(selectedFullMeta.fase ?? null, selectedFullMeta.opTypes ?? null, next.length ? next : null, selectedFullMeta.wellClass ?? null)}
                              presets={RIG_TAG_PRESETS}
                              options={getKnownRigTags(selectedFullMeta.wellClass).filter(t => !RIG_TAG_PRESETS.includes(t))}
                              placeholder="outra…"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => setShowFlowIndex(v => !v)}
                    title="Índice de perguntas (busca integrada)"
                    className={`flex items-center gap-1 text-[10px] rounded-lg px-2 py-1.5 transition-colors ${showFlowIndex ? 'bg-[#004a75] text-white dark:bg-slate-600 dark:text-slate-100' : 'text-white bg-[#005889] hover:bg-[#004a75] dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}>
                    <PiListDashesFill size={10} />
                    Índice
                  </button>
                  <button
                    onClick={() => setShowFlowLegend(v => !v)}
                    title="Legenda"
                    className={`flex items-center gap-1 text-[10px] rounded-lg px-2 py-1.5 transition-colors ${showFlowLegend ? 'bg-[#004a75] text-white dark:bg-slate-600 dark:text-slate-100' : 'text-white bg-[#005889] hover:bg-[#004a75] dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'}`}>
                    <PiInfoBold size={10} />
                    Legenda
                  </button>
                  <button
                    onClick={() => flowEditorRef.current?.reorganize()}
                    title="Reorganizar: reposiciona todos os nós automaticamente e centraliza a visão"
                    className="flex items-center gap-1 text-[10px] text-white bg-[#005889] hover:bg-[#004a75] dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-lg px-2 py-1.5 transition-colors">
                    <LayoutDashboard size={10} />
                    Reorganizar
                  </button>
                  <button
                    onClick={openHistory}
                    title="Histórico de versões — voltar a um estado anterior"
                    className="flex items-center gap-1 text-[10px] text-white bg-[#005889] hover:bg-[#004a75] dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-lg px-2 py-1.5 transition-colors">
                    <History size={10} />
                    Histórico
                  </button>
                  {canEdit && sections.length > 0 && (
                    <button disabled={!dirty || saving} onClick={save}
                      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1.5 rounded-lg transition-colors disabled:opacity-40 bg-[#008542] hover:bg-[#006a35] dark:bg-slate-700 dark:hover:bg-slate-600 text-white dark:text-slate-300">
                      {saved ? <Check size={10} /> : <Save size={10} />}
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
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-400 dark:text-slate-600">
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
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#008542] dark:bg-[#d97706] hover:bg-[#006a35] dark:hover:bg-amber-600 text-white text-sm font-semibold transition-colors shadow">
                        <Plus size={15} /> Inserir primeiro elemento
                      </button>
                      <button onClick={() => setShowImport(true)}
                        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#008542] dark:hover:text-[#d97706] transition-colors">
                        <Copy size={12} /> Importar de escopo base ou bloco
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!loading && sections.length > 0 && (
                <div className="relative h-full">
                  {pendingTransfer && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-950/90 border border-purple-500/60 shadow-lg">
                      <span className="text-[11px] text-purple-100 font-medium">
                        {pendingTransfer.mode === 'move' ? 'Mover' : 'Copiar'} pergunta — clique na pergunta de ORIGEM no fluxograma
                      </span>
                      <button onClick={() => setPendingTransfer(null)}
                        className="text-[10px] text-purple-200 hover:text-white border border-purple-500/50 rounded px-2 py-0.5 transition-colors">
                        Cancelar
                      </button>
                    </div>
                  )}
                  {previewVersionId && (
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-900/90 border border-amber-600/60 shadow-lg">
                      <History size={12} className="text-[#006a35] dark:text-amber-300" />
                      <span className="text-[11px] text-amber-100 font-medium">Visualizando versão anterior (somente leitura)</span>
                      {canEdit && (
                        <button onClick={() => restoreVersion(previewVersionId)}
                          className="text-[10px] font-semibold text-white bg-[#008542] dark:bg-[#d97706] hover:bg-[#006a35] dark:hover:bg-amber-600 rounded px-2 py-0.5 transition-colors">
                          Restaurar esta
                        </button>
                      )}
                      <button onClick={exitPreview}
                        className="text-[10px] text-amber-200 hover:text-white border border-amber-600/50 rounded px-2 py-0.5 transition-colors">
                        Voltar ao atual
                      </button>
                    </div>
                  )}
                  <LogicFlowEditor
                    ref={flowEditorRef}
                    sections={sections}
                    editCb={canEdit && !previewVersionId ? handleEditAction : undefined}
                    pickMode={!!pendingTransfer}
                    showIndex={showFlowIndex}
                    onToggleIndex={() => setShowFlowIndex(v => !v)}
                    showLegend={showFlowLegend}
                    onToggleLegend={() => setShowFlowLegend(v => !v)}
                  />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Histórico de versões (drawer lateral) ── */}
      {showHistory && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => { setShowHistory(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-80 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col"
               onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700/50">
              <History size={15} className="text-[#008542] dark:text-[#d97706]" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Histórico de versões</h3>
                <p className="text-[10px] text-slate-500 truncate">{selectedMeta?.label ?? selectedScope}</p>
              </div>
              <button onClick={() => setShowHistory(false)}
                className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-custom p-2 space-y-1.5">
              {versionsLoading && <p className="text-xs text-slate-500 text-center py-6">Carregando…</p>}
              {!versionsLoading && versions.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">
                  Nenhuma versão registrada ainda.<br />
                  <span className="text-[10px] text-slate-400 dark:text-slate-600">Cada save cria um snapshot automaticamente.</span>
                </p>
              )}
              {!versionsLoading && versions.map((v, i) => {
                const isActive = previewVersionId === v.id
                const when = new Date(v.createdAt).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
                })
                return (
                  <div key={v.id}
                    className={`rounded-lg border px-3 py-2 transition-colors ${
                      isActive ? 'border-[#008542]/60 dark:border-[#d97706]/60 bg-[#008542]/10 dark:bg-[#d97706]/10' : 'border-slate-200 dark:border-slate-700/60 bg-slate-100/80 dark:bg-slate-800/40 hover:border-slate-600'
                    }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500 shrink-0">
                        {i === 0 ? 'atual' : `#${versions.length - i}`}
                      </span>
                      <span className="flex-1 text-[11px] text-slate-800 dark:text-slate-200 truncate font-medium">{v.note ?? 'Save'}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {when} · {v.author ?? '—'} · {v.sectionCount} seção(ões)
                    </p>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <button onClick={() => previewVersion(v.id)}
                        className="text-[10px] text-slate-700 dark:text-slate-300 hover:text-[#008542] dark:hover:text-[#d97706] border border-slate-200 dark:border-slate-700 hover:border-[#008542]/40 dark:border-[#d97706]/40 rounded px-2 py-0.5 transition-colors">
                        {isActive ? 'Visualizando' : 'Visualizar'}
                      </button>
                      {canEdit && (
                        <button onClick={() => restoreVersion(v.id)}
                          className="text-[10px] text-white bg-[#008542]/80 dark:bg-[#d97706]/80 hover:bg-[#006a35] dark:hover:bg-[#d97706] rounded px-2 py-0.5 transition-colors">
                          Restaurar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modais ── */}
      {newScopeKind && <NewScopeModal kind={newScopeKind} onSave={handleCreateScope} onClose={() => setNewScopeKind(null)} />}
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
      {showImport && selectedScope && (
        <UnifiedImportModal
          overrides={overrides}
          currentScopeId={selectedScope}
          loadScopeSections={loadScopeSections}
          allowBase={!!(selectedMeta?.isCustom || selectedMeta?.isBlock)}
          onImport={handleImportSections}
          onBase={applyBase}
          onClose={() => setShowImport(false)}
        />
      )}
      {phasePick && (
        <PhasePickerModal current={phasePick.current} onPick={handlePhasePick} onClose={() => setPhasePick(null)} />
      )}
    </div>
  )
}

