import { useState, useRef, useEffect, useCallback, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, ChevronUp, ChevronDown, Lock } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { generateSchedule } from '../engines/scheduleRouter'
import { resolveScopeSections, expandScopeRefs, getCustomScopesMeta } from '../data/logicOverrideStore'
import { LogicQuestionsPanel } from './LogicQuestionsPanel'
import { ProjectNameField } from './ProjectNameField'
import type { WizardInputs, ScopeId, IsolationPlugType, IsolationCorrMethod } from '../types'

export const SearchCtx = createContext('')

const SCOPE_SHORT: Record<ScopeId, string> = {
  FSU_TT_FT:    'TT-FT',
  FSU_TT_BDC:   'TT-BDC',
  FSU_Conv_BOP:  'Conv. BOP',
  FSU_Conv_RCMA: 'Conv. RCMA',
  FSU_Sup_COP:   'Sup. COP',
  FSU_Sup_PWC:   'Sup. PWC',
  FS1_Mec:       'FS1 Mec.',
  FS2_Conv_BOP:  'FS2 BOP',
  FS2_Conv_RCMA: 'FS2 RCMA',
  FS2_Sup_COP:   'FS2 COP',
  FS2_Sup_PWC:   'FS2 PWC',
}

const LWO_SCOPES = new Set<ScopeId>(['FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_RCMA', 'FS1_Mec', 'FS2_Conv_RCMA'])

const ALL_SCOPE_OPTS: { value: ScopeId; label: string }[] = [
  { value: 'FS1_Mec',       label: 'FS1 — Tampões Mecânicos' },
  { value: 'FS2_Conv_BOP',  label: 'FS2 — Convencional BOP' },
  { value: 'FS2_Conv_RCMA', label: 'FS2 — Convencional RCMA' },
  { value: 'FS2_Sup_COP',   label: 'FS2 — Superconv. COP' },
  { value: 'FS2_Sup_PWC',   label: 'FS2 — Superconv. PWC' },
  { value: 'FSU_TT_FT',    label: 'FSU — TT Flexitubo' },
  { value: 'FSU_TT_BDC',   label: 'FSU — TT Bombeio Direto' },
  { value: 'FSU_Conv_BOP',  label: 'FSU — Convencional BOP' },
  { value: 'FSU_Conv_RCMA', label: 'FSU — Convencional RCMA' },
  { value: 'FSU_Sup_COP',   label: 'FSU — Superconv. COP' },
  { value: 'FSU_Sup_PWC',   label: 'FSU — Superconv. PWC' },
]

export function InputSummaryPanel({ onClose }: { onClose?: () => void }) {
  const { state, dispatch } = useApp()
  const { inputs } = state
  const overrideActive = state.scheduleOverrideActive
  const [editing, setEditing] = useState<string | null>(null)

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('sprint_left_panel_width')
    return saved ? Math.max(220, Math.min(600, parseInt(saved))) : 340
  })
  const widthRef = useRef(panelWidth)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widthRef.current
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(220, Math.min(600, startW + ev.clientX - startX))
      widthRef.current = newW
      setPanelWidth(newW)
    }
    const onUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      localStorage.setItem('sprint_left_panel_width', String(widthRef.current))
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const apply = (data: Partial<WizardInputs>, autoClose = true) => {
    if (overrideActive) return
    const merged = { ...inputs, ...data } as WizardInputs
    dispatch({ type: 'UPDATE_INPUTS', inputs: data })
    try {
      const schedule = generateSchedule(merged)
      dispatch({ type: 'UPDATE_SCHEDULE', schedule })
    } catch { /* invalid/incomplete state */ }
    if (autoClose) setEditing(null)
  }

  const edit = (key: string) => { if (!overrideActive) setEditing(prev => prev === key ? null : key) }
  const isEd = (key: string) => editing === key

  // Derived flags (mirrors Wizard logic)
  const isLWO      = inputs.operationType === 'LWO'

  const isCustomScope = !!inputs.scopeId && !(inputs.scopeId in SCOPE_SHORT)
  // Engine 'flowchart' (escopos bundle): as perguntas do painel vêm do fluxograma do editor
  // de lógica — idênticas e na mesma ordem do fluxograma. A engine antiga (wizard) foi
  // aposentada, então todo escopo bundle usa sempre o fluxograma.
  const flowStrict = !isCustomScope
  const useFlowQuestions = isCustomScope || flowStrict
  // Expande seções `ref` (reuso vivo) para que as perguntas/seções do fluxograma incluído
  // (ex.: MOB_descida) também apareçam no passo 2 — mesma expansão usada na geração.
  const customSecs = useFlowQuestions
    ? expandScopeRefs(resolveScopeSections(inputs.scopeId!))
    : null
  const customScopeLabel = isCustomScope
    ? (getCustomScopesMeta().find(s => s.scopeId === inputs.scopeId)?.label ?? inputs.scopeId)
    : null

  const scopeOpts = ALL_SCOPE_OPTS.filter(o => !isLWO || LWO_SCOPES.has(o.value))

  // ── Search ──
  const [search, setSearch] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const activeContainerRef = useRef<HTMLElement | null>(null)

  const applyHighlight = useCallback((idx: number, matches: Element[]) => {
    if (activeContainerRef.current) {
      activeContainerRef.current.style.outline = ''
      activeContainerRef.current = null
    }
    if (matches.length === 0) return
    const label = matches[idx]
    const container = label.closest('[data-isp-container]') as HTMLElement | null
    if (container) {
      container.style.outline = '2px solid #009957'
      container.style.outlineOffset = '-1px'
      container.style.borderRadius = '6px'
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      activeContainerRef.current = container
    }
  }, [])

  useEffect(() => {
    if (activeContainerRef.current) {
      activeContainerRef.current.style.outline = ''
      activeContainerRef.current = null
    }
    if (!search.trim() || !scrollAreaRef.current) { setMatchCount(0); setMatchIdx(0); return }
    const q = search.toLowerCase()
    const matches = Array.from(scrollAreaRef.current.querySelectorAll('[data-isp-label]'))
      .filter(el => el.textContent?.toLowerCase().includes(q))
    setMatchCount(matches.length)
    setMatchIdx(0)
    applyHighlight(0, matches)
  }, [search, applyHighlight])

  const navigate = (dir: 1 | -1) => {
    if (matchCount === 0 || !scrollAreaRef.current) return
    const q = search.toLowerCase()
    const matches = Array.from(scrollAreaRef.current.querySelectorAll('[data-isp-label]'))
      .filter(el => el.textContent?.toLowerCase().includes(q))
    const next = ((matchIdx + dir) % matchCount + matchCount) % matchCount
    setMatchIdx(next)
    applyHighlight(next, matches)
  }

  return (
    <aside className={`${onClose ? 'flex-1' : 'shrink-0'} relative border-r border-slate-200 dark:border-slate-700 bg-[#f5f5f5] dark:bg-slate-900 flex flex-col`}
      style={!onClose ? { width: `${panelWidth}px` } : undefined}>

      {!onClose && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 h-full z-20 cursor-col-resize group/resize"
          style={{ right: '-5px', width: '10px' }}
        >
          <div className="absolute inset-y-0 inset-x-0 transition-colors group-hover/resize:bg-[#005889]/30" />
        </div>
      )}

      {onClose && (
        <button onClick={onClose}
          className="absolute top-2 right-2 z-10 p-1 rounded hover:bg-[#f5f5f5] dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
          <X size={16} />
        </button>
      )}

      <ProjectNameField />

      {/* Search bar */}
      <div className="px-4 shrink-0 flex items-center" style={{ height: '38px' }}>
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 h-7 w-full">
          <Search size={12} className="text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Localizar"
            value={search}
            onChange={e => { setSearch(e.target.value) }}
            onKeyDown={e => { if (e.key === 'Enter') navigate(e.shiftKey ? -1 : 1) }}
            className="flex-1 text-xs bg-transparent outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          />
          {search && (
            <>
              <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                {matchCount > 0 ? `${matchIdx + 1}/${matchCount}` : '0'}
              </span>
              <button onClick={() => navigate(-1)} title="Anterior (Shift+Enter)"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <ChevronUp size={12} />
              </button>
              <button onClick={() => navigate(1)} title="Próximo (Enter)"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <ChevronDown size={12} />
              </button>
              <button onClick={() => setSearch('')} title="Limpar busca"
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <X size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {overrideActive && (
        <div className="mx-4 mb-3 shrink-0 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-2">
          <Lock size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            Campos bloqueados (override ativado).
          </p>
        </div>
      )}

      <SearchCtx.Provider value={search}>
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-custom">

        <div className={overrideActive ? 'opacity-60 pointer-events-none select-none space-y-5' : 'space-y-5'}>

        {/* ── Sonda e Escopo ── */}
        <Section label="Sonda e Escopo" defaultExpanded>
          <Row label="Tipo de intervenção"
            tooltip="Completação molhada (ANM submersa — ANC/DP) ou completação seca (árvore de natal seca — outras sondas)"
            value={(['ANC', 'DP'] as string[]).includes(inputs.rigType ?? '') ? 'Abandono Comp. Molhada' : inputs.rigType ? 'Abandono Comp. Seca' : '—'}
            isEditing={isEd('abandonType')} onEdit={() => edit('abandonType')}>
            <InlineRadio
              options={[
                { value: 'molhada', label: 'Abandono Completação Molhada' },
                { value: 'seca',    label: 'Abandono Completação Seca' },
              ]}
              value={(['ANC', 'DP'] as string[]).includes(inputs.rigType ?? '') ? 'molhada' : inputs.rigType ? 'seca' : ''}
              onChange={v => apply({
                rigType: v === 'molhada' ? 'ANC' : 'Rigless',
                operationType: 'Generalista',
              })}
            />
          </Row>

          {(['ANC', 'DP'] as string[]).includes(inputs.rigType ?? '') && (
            <Row label="Tipo de sonda"
              tooltip="Sonda Ancorada (ANC), DP Generalista ou DP LWIV"
              value={
                inputs.rigType === 'ANC' ? 'ANC'
                : inputs.operationType === 'LWO' ? 'DP LWIV'
                : inputs.rigType === 'DP' ? 'DP Generalista'
                : '—'
              }
              isEditing={isEd('rigType')} onEdit={() => edit('rigType')}>
              <InlineRadio
                options={[
                  { value: 'ANC',     label: 'ANC' },
                  { value: 'DP_GEN',  label: 'DP Generalista' },
                  { value: 'DP_LWIV', label: 'DP LWIV' },
                ]}
                value={
                  inputs.rigType === 'ANC' ? 'ANC'
                  : inputs.operationType === 'LWO' ? 'DP_LWIV'
                  : inputs.rigType === 'DP' ? 'DP_GEN'
                  : ''
                }
                onChange={v => apply(
                  v === 'ANC'     ? { rigType: 'ANC', operationType: 'Generalista' }
                  : v === 'DP_GEN'  ? { rigType: 'DP',  operationType: 'Generalista' }
                  : /* DP_LWIV */    { rigType: 'DP',  operationType: 'LWO' }
                )}
              />
            </Row>
          )}

          {!(['ANC', 'DP'] as string[]).includes(inputs.rigType ?? '') && inputs.rigType && (
            <Row label="Tipo de sonda"
              tooltip="Tipo de sonda para completação seca"
              value={inputs.rigType}
              isEditing={isEd('rigTypeSeca')} onEdit={() => edit('rigTypeSeca')}>
              <InlineRadio
                // Tags de "Tipo de sonda" já usadas por algum escopo customizado (qualquer
                // classe de poço), definidas livremente pelo admin no editor de Árvores de
                // Decisão — não é mais uma lista fixa.
                options={[...new Set(getCustomScopesMeta().flatMap(cs => cs.rigTypes ?? []))]
                  .sort()
                  .map(rig => ({ value: rig, label: rig }))}
                value={inputs.rigType ?? ''}
                onChange={v => apply({ rigType: v })}
              />
            </Row>
          )}

          {isCustomScope ? (
            <div className="flex justify-between items-center py-1.5 px-2 text-xs">
              <span className="text-slate-600 dark:text-slate-500">Escopo</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200 text-right truncate ml-2">{customScopeLabel}</span>
            </div>
          ) : (
            <Row label="Escopo"
              tooltip="Sequência genérica de intervenção"
              value={inputs.scopeId ? (SCOPE_SHORT[inputs.scopeId as ScopeId] ?? inputs.scopeId) : '—'}
              isEditing={isEd('scopeId')} onEdit={() => edit('scopeId')}>
              <InlineRadio
                options={scopeOpts}
                value={inputs.scopeId ?? ''}
                onChange={v => {
                  const isNewFS2 = (v as string).startsWith('FS2')
                  const defIso = v === 'FS2_Sup_PWC'
                    ? { needsCorrection: true, corrMethod: 'pwc' as IsolationCorrMethod, pwcValidation: 'params' as const }
                    : { needsCorrection: false, plugType: 'bpp' as IsolationPlugType }
                  apply({ scopeId: v as ScopeId, logicAnswers: {}, ...(isNewFS2 && {
                    contingencyFejat: 'no', fs2CopCutContingency: 'no', fs2CopCutMethod: 'electric', fs2PackerFishing: 'no',
                    transponderMode: 'rov', dmmWithEquipment: false, isolationCount: 1, isolations: [defIso],
                    bopTestMethod: 'test_plug',
                  }) })
                }}
              />
            </Row>
          )}

        </Section>

        {/* ── Definições ── */}
        {useFlowQuestions && inputs.rigType && inputs.scopeId && (() => {
          const secs = (customSecs ?? []).filter(sec => {
            if (sec.rigTypes?.length && !sec.rigTypes.includes(inputs.rigType!)) return false
            if (sec.opTypes?.length && !sec.opTypes.includes(inputs.operationType!)) return false
            return sec.decisions.length > 0
          })
          if (!secs.length) return null
          return (
            <Section label="Definições" defaultExpanded>
              <LogicQuestionsPanel
                sections={secs}
                showSectionLabels={flowStrict}
                rigType={inputs.rigType}
                operationType={inputs.operationType}
                answers={inputs.logicAnswers ?? {}}
                onAnswer={(key, label) => {
                  apply({ logicAnswers: { ...(inputs.logicAnswers ?? {}), [key]: label } }, false)
                }}
              />
            </Section>
          )
        })()}

        </div>
      </div>
      </SearchCtx.Provider>
    </aside>
  )
}

function Section({ label, children, collapsible = true, defaultExpanded = false }: {
  label: string; children: React.ReactNode; collapsible?: boolean; defaultExpanded?: boolean
}) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded)
  const searchTerm = useContext(SearchCtx)
  const isExpanded = !collapsible || !collapsed || !!searchTerm.trim()
  return (
    <div data-isp-container className="rounded-xl overflow-hidden shadow-sm ring-1 transition-colors ring-slate-300 dark:ring-slate-700/60">
      <div className={`flex items-center gap-1.5 px-2.5 py-2 bg-[#ebebeb] dark:bg-slate-800/50 ${isExpanded ? 'border-b border-slate-300 dark:border-slate-700/50' : ''}`}>
        {collapsible ? (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left group"
          >
            <span className="w-4 font-bold text-sm leading-none select-none transition-colors text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300">
              {isExpanded ? '−' : '+'}
            </span>
            <span data-isp-label className="text-xs font-bold tracking-wide transition-colors text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100">
              {label}
            </span>
          </button>
        ) : (
          <span data-isp-label className="text-xs font-bold tracking-wide text-slate-700 dark:text-slate-300">
            {label}
          </span>
        )}
      </div>
      {isExpanded && <div className="px-2.5 py-1.5 space-y-0.5">{children}</div>}
    </div>
  )
}

function Row({ label, value, isEditing, onEdit, children, tooltip }: {
  label: string
  value: string
  isEditing: boolean
  onEdit: () => void
  children: React.ReactNode
  tooltip?: string
}) {
  const [tipVisible, setTipVisible] = useState(false)
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 })
  const labelRef = useRef<HTMLSpanElement>(null)

  const showTip = () => {
    if (labelRef.current) {
      const r = labelRef.current.getBoundingClientRect()
      setTipPos({ top: r.top - 6, left: r.left + r.width / 2 })
    }
    setTipVisible(true)
  }

  return (
    <div data-isp-container className={`rounded-lg border-b border-slate-200 dark:border-slate-800 last:border-0 transition-colors ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-200 dark:ring-sky-800' : ''}`}>
      <button
        onClick={onEdit}
        className={`w-full flex justify-between items-center py-1.5 px-2 rounded-lg text-left group transition-colors
          ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
      >
        <span
          ref={labelRef}
          data-isp-label
          title={label}
          className="text-xs text-slate-600 dark:text-slate-500 shrink-0 mr-2 cursor-default whitespace-nowrap"
          onMouseEnter={tooltip ? showTip : undefined}
          onMouseLeave={tooltip ? () => setTipVisible(false) : undefined}
          onClick={e => e.stopPropagation()}
        >
          {label}
        </span>
        <span className={`text-xs font-semibold text-right flex items-center gap-1.5 min-w-0
          ${value === '—' ? 'text-slate-500 dark:text-slate-600' : isEditing ? 'text-sky-700 dark:text-sky-400' : 'text-slate-700 dark:text-slate-200'}`}>
          <span className="text-right truncate min-w-0">{value}</span>
          <span className="text-slate-500 dark:text-slate-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0">✎</span>
        </span>
      </button>
      {isEditing && (
        <div className="px-2 pb-2 pt-0.5">
          {children}
        </div>
      )}
      {tooltip && tipVisible && createPortal(
        <span
          style={{ position: 'fixed', top: tipPos.top, left: tipPos.left, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
          className="w-56 bg-slate-800 text-white text-[11px] rounded-lg px-2.5 py-2 leading-relaxed shadow-xl whitespace-normal pointer-events-none">
          {tooltip}
        </span>,
        document.body
      )}
    </div>
  )
}

function InlineRadio({ options, value, onChange }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {options.map(opt => (
        <label key={opt.value}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs
            ${value === opt.value
              ? 'bg-[#f5f5f5] dark:bg-slate-700 text-sky-800 dark:text-sky-300 font-semibold shadow-sm ring-1 ring-sky-200 dark:ring-sky-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800'}`}>
          <input type="radio" checked={value === opt.value} onChange={() => onChange(opt.value)}
            className="accent-[#0c2340] shrink-0" />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

