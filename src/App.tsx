import { useState, useEffect, useMemo } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { LoginScreen } from './components/LoginScreen'
import { Sidebar } from './components/Sidebar'
import { ScheduleView } from './components/ScheduleView'
import { FineTuningView } from './components/FineTuningView'
import { AdminView } from './components/AdminView'
import { PackagesCatalogModal } from './components/PackagesCatalogModal'
import { InputSummaryPanel } from './components/InputSummaryPanel'
import { generateSchedule } from './engines/scheduleRouter'
import type { ScopeId, WizardInputs, RigType } from './types'
import { ArrowRight, FileText, Settings2, AlertTriangle } from 'lucide-react'
import { getDefaultInputs } from './utils/defaultInputs'
import { isApiConfigured, getMergedPackageLines, getBaseOverrides, getBasePackageOverrides, getCustomPackages, getLogicScopes, getLogicScope } from './utils/api'
import { getSession, clearSession } from './utils/auth'
import { setPackageLines } from './data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from './data/lineDetailsStore'
import { setExtraPackages, metaToPackage, PACKAGES } from './data/packages'
import { setLogicOverrides, setCustomScopesMeta, getCustomScopesMeta, isBlockScope, setScopeLabels } from './data/logicOverrideStore'
import { SCOPE_LABEL } from './data/scopeLabels'

function SemisubIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      {/* Derrick – A-frame */}
      <path d="M12 2 L9 8 L15 8 Z" />
      {/* Bracing interno */}
      <line x1="10.5" y1="5.5" x2="13.5" y2="5.5" />
      {/* Deck principal */}
      <rect x="3" y="8" width="18" height="1.5" rx="0.4" />
      {/* Coluna esquerda */}
      <rect x="5.5" y="9.5" width="3.5" height="6" rx="0.4" />
      {/* Coluna direita */}
      <rect x="15" y="9.5" width="3.5" height="6" rx="0.4" />
      {/* Pontão esquerdo */}
      <rect x="2.5" y="15.5" width="9" height="3.5" rx="1.75" />
      {/* Pontão direito */}
      <rect x="12.5" y="15.5" width="9" height="3.5" rx="1.75" />
    </svg>
  )
}

// ── Scope data ────────────────────────────────────────────────────────────────
const SCOPE_BY_PHASE: Record<string, ScopeId[]> = {
  fase_unica: ['FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_BOP', 'FSU_Conv_RCMA', 'FSU_Sup_COP', 'FSU_Sup_PWC'],
  fase_1:     ['FS1_Mec'],
  fase_2:     ['FS2_Conv_BOP', 'FS2_Conv_RCMA', 'FS2_Sup_COP', 'FS2_Sup_PWC'],
}
const SCOPE_BY_PHASE_LWO: Record<string, ScopeId[]> = {
  fase_unica: ['FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_RCMA'],
  fase_1:     ['FS1_Mec'],
  fase_2:     ['FS2_Conv_RCMA'],
}
// ── Home ──────────────────────────────────────────────────────────────────────
function Home() {
  const session = getSession()
  const { dispatch } = useApp()
  const [selecting, setSelecting] = useState(false)
  const [interventionType, setInterventionType] = useState<'abandono_molhada' | 'abandono_seca' | 'workover' | ''>('')
  const [rigType,     setRigType]     = useState<RigType | ''>('')
  const [opType,      setOpType]      = useState<'Generalista' | 'LWO'>('Generalista')
  const [phaseFilter, setPhaseFilter] = useState<'fase_unica' | 'fase_1' | 'fase_2' | ''>('')
  const [scopeId,     setScopeId]     = useState<ScopeId | ''>('')

  const reset = () => {
    setInterventionType(''); setRigType(''); setOpType('Generalista'); setPhaseFilter(''); setScopeId('')
  }

  const handleRigChange = (v: RigType) => {
    setRigType(v)
    if (v !== 'DP') setOpType('Generalista')
    setPhaseFilter(''); setScopeId('')
  }
  const handleOpChange = (v: 'Generalista' | 'LWO') => {
    setOpType(v); setPhaseFilter(''); setScopeId('')
  }
  const handlePhaseChange = (v: typeof phaseFilter) => {
    setPhaseFilter(v); setScopeId('')
  }
  const handleInterventionChange = (v: 'abandono_molhada' | 'abandono_seca' | 'workover') => {
    setInterventionType(v)
    setRigType(v === 'abandono_molhada' ? 'ANC' : v === 'abandono_seca' ? 'Rigless' : '')
    setOpType('Generalista'); setPhaseFilter(''); setScopeId('')
  }

  const handleGenerate = () => {
    if (!rigType || !scopeId) return
    if (rigType !== 'ANC' && rigType !== 'DP') return   // PA/SPH/SM/SPM/Rigless ainda não têm fluxo de geração
    const defaults = getDefaultInputs(rigType, opType, scopeId)
    dispatch({ type: 'RESET' })
    dispatch({ type: 'SET_WELL_NAME', wellName: 'Poço' })
    dispatch({ type: 'PROJECT_UPDATE_DATA', patch: { poco: 'Poço' } })
    dispatch({ type: 'UPDATE_INPUTS', inputs: defaults })
    try {
      const schedule = generateSchedule(defaults as WizardInputs)
      dispatch({ type: 'SET_SCHEDULE', schedule })
    } catch { /* incomplete state */ }
  }

  const scopeMap = opType === 'LWO' ? SCOPE_BY_PHASE_LWO : SCOPE_BY_PHASE
  const scopeOptions = phaseFilter ? scopeMap[phaseFilter] ?? [] : []
  const filteredCustomScopes = useMemo(() => {
    const all = selecting ? getCustomScopesMeta() : []
    return all.filter(cs => {
      if (cs.fase && phaseFilter && cs.fase !== phaseFilter) return false
      if (cs.opTypes?.length && opType && !cs.opTypes.includes(opType)) return false
      return true
    })
  }, [selecting, phaseFilter, opType])
  const canGenerate = interventionType === 'abandono_molhada' && !!rigType && !!scopeId

  if (!selecting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-full gap-8 py-10 px-4 sm:gap-10 sm:py-16 sm:px-0">
        <div className="text-center">
          <div className="flex flex-col items-center gap-3 mb-5">
            <div className="w-14 h-14 rounded-2xl bg-[#0c2340] flex items-center justify-center shadow-lg">
              <SemisubIcon size={28} className="text-[#d97706]" />
            </div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              className="text-5xl font-bold tracking-[0.15em] text-[#0c2340] dark:text-white uppercase">
              SPRINT
            </h1>
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] text-[#d97706] uppercase mb-3">
            Sistema de Planejamento Responsivo de Intervenções
          </p>
          <p className="text-slate-700 dark:text-slate-400 max-w-sm mx-auto text-sm leading-relaxed text-center">
            Geração automatizada de cronogramas para intervenções de abandono e workover de poços submarinos
          </p>
        </div>

        <div className="w-full max-w-lg">
          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-500 uppercase tracking-[0.2em] mb-3 text-center">Tipo de intervenção</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {([
              ['abandono_molhada', 'Abandono', 'Comp. Molhada'],
              ['abandono_seca',    'Abandono', 'Comp. Seca'],
              ['workover',         'Workover', ''],
            ] as ['abandono_molhada' | 'abandono_seca' | 'workover', string, string][]).map(([v, title, subtitle]) => (
              <button
                key={v}
                onClick={() => { handleInterventionChange(v); setSelecting(true) }}
                className={`min-h-20 flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl text-center border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#0c2340] hover:bg-[#0c2340] hover:text-white dark:hover:border-sky-700 dark:hover:bg-sky-900/40 dark:hover:text-white transition-colors shadow-sm ${v === 'workover' ? 'col-span-2 sm:col-span-1' : ''}`}>
                <span className="text-sm font-semibold leading-tight">{title}</span>
                {subtitle && <span className="text-[11px] leading-tight opacity-65">{subtitle}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
          {[
            { icon: <FileText size={18} />, title: 'Escopos', value: '11' },
            { icon: <Settings2 size={18} />, title: 'Pacotes', value: `${Object.keys(PACKAGES).length}` },
            { icon: <SemisubIcon size={18} />, title: 'Tipos de sonda', value: '7' },
          ].map(card => (
            <div key={card.title} className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
              <div className="text-[#d97706] flex justify-center mb-2">{card.icon}</div>
              <p className="text-lg font-bold text-[#0c2340] dark:text-white">{card.value}</p>
              <p className="text-xs font-bold text-[#0c2340] dark:text-white mt-0.5">{card.title}</p>
            </div>
          ))}
        </div>

        {session && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {session.username} · <span className={session.role === 'admin' ? 'text-[#d97706] font-semibold' : ''}>{session.role === 'admin' ? 'admin' : 'projetista'}</span>
          </p>
        )}

      </div>
    )
  }

  // ── Scope selector ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center justify-center min-h-full py-6 px-4 sm:py-12 sm:px-0">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded-lg bg-[#0c2340] flex items-center justify-center">
            <SemisubIcon size={14} className="text-[#d97706]" />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
              className="text-2xl font-bold text-[#0c2340] dark:text-white uppercase tracking-wide leading-tight">
              {interventionType === 'abandono_molhada' ? 'Abandono Comp. Molhada'
                : interventionType === 'abandono_seca' ? 'Abandono Comp. Seca'
                : interventionType === 'workover' ? 'Workover'
                : 'Novo Cronograma'}
            </h2>
          </div>
        </div>

        <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7 space-y-6">

          {/* Workover: em desenvolvimento */}
          {interventionType === 'workover' && (
            <div className="flex items-center justify-center py-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
              <span className="text-xs font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Em desenvolvimento</span>
            </div>
          )}

          {/* Completação Molhada: seletor flat ANC / DP Generalista / DP LWIV */}
          {interventionType === 'abandono_molhada' && (
            <SelGroup label="Tipo de sonda">
              <div className="flex flex-wrap gap-3">
                <SelChip active={rigType === 'ANC'} onClick={() => { setRigType('ANC'); setOpType('Generalista'); setPhaseFilter(''); setScopeId('') }}>
                  ANC
                </SelChip>
                <SelChip active={rigType === 'DP' && opType === 'Generalista'} onClick={() => { setRigType('DP'); setOpType('Generalista'); setPhaseFilter(''); setScopeId('') }}>
                  DP Generalista
                </SelChip>
                <SelChip active={rigType === 'DP' && opType === 'LWO'} onClick={() => { setRigType('DP'); setOpType('LWO'); setPhaseFilter(''); setScopeId('') }}>
                  DP LWIV
                </SelChip>
              </div>
            </SelGroup>
          )}

          {/* Completação Seca: seletor PA / SPH / SM / SPM / Rigless */}
          {interventionType === 'abandono_seca' && (
            <SelGroup label="Tipo de sonda">
              <div className="flex flex-wrap gap-3">
                <SelChip active={rigType === 'PA'}      onClick={() => handleRigChange('PA')}>Auto Elevatória (PA)</SelChip>
                <SelChip active={rigType === 'SPH'}     onClick={() => handleRigChange('SPH')}>Prod. Hidráulica (SPH)</SelChip>
                <SelChip active={rigType === 'SM'}      onClick={() => handleRigChange('SM')}>SM</SelChip>
                <SelChip active={rigType === 'SPM'}     onClick={() => handleRigChange('SPM')}>SPM</SelChip>
                <SelChip active={rigType === 'Rigless'} onClick={() => handleRigChange('Rigless')}>Rigless</SelChip>
              </div>
            </SelGroup>
          )}

          {/* Sondas de Completação Seca: em desenvolvimento */}
          {interventionType === 'abandono_seca' && rigType !== '' && (
            <div className="flex items-center justify-center py-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
              <span className="text-xs font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Em desenvolvimento</span>
            </div>
          )}

          {/* Fase */}
          {interventionType === 'abandono_molhada' && (rigType === 'ANC' || rigType === 'DP') && (
            <SelGroup label="Fase da intervenção">
              <div className="flex flex-wrap gap-3">
                {([
                  ['fase_1',     'Fase 1'],
                  ['fase_2',     'Fase 2'],
                  ['fase_unica', 'Fase Única (FSU)'],
                ] as [typeof phaseFilter, string][]).map(([v, label]) => (
                  <SelChip key={v} active={phaseFilter === v} onClick={() => handlePhaseChange(v)}>
                    {label}
                  </SelChip>
                ))}
              </div>
            </SelGroup>
          )}

          {/* Escopo bundle */}
          {interventionType === 'abandono_molhada' && phaseFilter && scopeOptions.length > 0 && (
            <SelGroup label="Escopo previsto">
              <div className="space-y-2">
                {scopeOptions.map(id => (
                  <label key={id}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                      ${scopeId === id
                        ? 'border-[#0c2340] bg-sky-50 dark:bg-sky-950 dark:border-sky-700'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                    <input type="radio" name="scope" value={id} checked={scopeId === id}
                      onChange={() => setScopeId(id)} className="accent-[#0c2340]" />
                    <span className="text-sm text-slate-700 dark:text-slate-200">{SCOPE_LABEL[id]}</span>
                  </label>
                ))}
              </div>
            </SelGroup>
          )}

          {/* Escopos customizados — filtrados por fase e tipo de sonda quando configurados */}
          {interventionType === 'abandono_molhada' && (rigType === 'ANC' || rigType === 'DP') && filteredCustomScopes.length > 0 && (
            <SelGroup label="Fluxogramas customizados">
              <div className="space-y-2">
                {filteredCustomScopes.map(cs => (
                  <label key={cs.scopeId}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors
                      ${scopeId === cs.scopeId
                        ? 'border-[#d97706] bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}>
                    <input type="radio" name="scope" value={cs.scopeId} checked={scopeId === cs.scopeId}
                      onChange={() => setScopeId(cs.scopeId)} className="accent-[#d97706]" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-slate-700 dark:text-slate-200">{cs.label}</span>
                      {(cs.fase || cs.opTypes?.length) && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                          {[
                            cs.fase === 'fase_1' ? 'Fase 1' : cs.fase === 'fase_2' ? 'Fase 2' : cs.fase === 'fase_unica' ? 'Fase Única' : null,
                            cs.opTypes?.join(' / '),
                          ].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </SelGroup>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between mt-5">
          <button
            onClick={() => { reset(); setSelecting(false) }}
            className="text-sm text-slate-600 hover:text-slate-600 transition-colors">
            ← Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-semibold
              hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity shadow-sm"
            style={{ background: '#0c2340' }}>
            Gerar Cronograma <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function SelGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-2.5">{label}</p>
      {children}
    </div>
  )
}

function SelChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold border transition-colors
        ${active
          ? 'border-[#0c2340] bg-[#0c2340] text-white shadow-sm'
          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 bg-slate-100 dark:bg-slate-800'}`}>
      {children}
    </button>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────

function Main({ onLogout }: { onLogout: () => void }) {
  const { state, dispatch } = useApp()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('sprint_theme') !== 'light')
  const [adminTab, setAdminTab] = useState<'vars' | 'engine'>('vars')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [navWarnTarget, setNavWarnTarget] = useState<'home' | 'wizard' | 'schedule' | 'fine_tuning' | null>(null)
  const toggleDark = () => setIsDark(d => !d)

  const handleBeforeStepNav = (targetView: string): boolean => {
    if (state.view === 'fine_tuning' && (targetView === 'schedule' || targetView === 'wizard')) {
      setNavWarnTarget(targetView as 'schedule' | 'wizard')
      return false
    }
    return true
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('sprint_theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-hidden overflow-x-auto bg-[#e4e9e3] dark:bg-slate-950">

      {/* Content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          isDark={isDark}
          onToggleDark={toggleDark}
          onOpenConfig={() => { setAdminTab('vars'); setShowAdmin(true) }}
          onOpenPackages={() => setShowPackages(true)}
          onOpenLogicEditor={() => { setAdminTab('engine'); setShowAdmin(true) }}
          onBeforeStepNav={handleBeforeStepNav}
          onLogout={onLogout}
        />
        {showAdmin && <AdminView initialTab={adminTab} onClose={() => setShowAdmin(false)} />}
        {showPackages && <PackagesCatalogModal onClose={() => setShowPackages(false)} />}

        {state.view === 'schedule' && (
          <div className="flex shrink-0">
            <InputSummaryPanel />
          </div>
        )}

        <main className={`grow min-w-0 overflow-hidden flex flex-col bg-[#e4e9e3] dark:bg-slate-950${state.view !== 'fine_tuning' ? ' p-4 md:p-8' : ''}`}>
          {(state.view === 'home' || state.view === 'wizard') && (
            <div className="flex-1 overflow-y-auto scrollbar-custom"><Home /></div>
          )}
          {state.view === 'schedule' && <ScheduleView />}
          {state.view === 'fine_tuning' && <FineTuningView />}
        </main>

      </div>

      {/* Navigation warning modal */}
      {navWarnTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Retornar ao Cronograma?</p>
                <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed">
                  Não é recomendado voltar à Etapa 2 após iniciar o Aperfeiçoamento. Qualquer regeneração do cronograma irá descartar os dados preenchidos nesta etapa.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNavWarnTarget(null)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => { const t = navWarnTarget; setNavWarnTarget(null); dispatch({ type: 'SET_VIEW', view: t }) }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors">
                Retornar mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(() => getSession())

  // Boot: carrega a base mesclada (bundled + overrides) do servidor uma vez, para
  // as edições da base refletirem nos cronogramas NOVOS. Falha/offline → mantém o
  // bundle. Texto/duração/ontologia vêm mesclados em package-lines; rec/pad são
  // mesclados sobre o bundle de detalhes a partir dos overrides.
  useEffect(() => {
    if (!session || !isApiConfigured()) return
    getMergedPackageLines().then(setPackageLines).catch(() => { /* mantém bundle */ })
    // rec/pad: legados por linha primeiro, depois override por pacote (precedência).
    getBaseOverrides().then(applyDetailOverrides).catch(() => {})
    getBasePackageOverrides().then(applyPackageOverrides).catch(() => {})
    // Pacotes customizados → registro dinâmico (inserção manual na etapa 3).
    getCustomPackages().then(ms => setExtraPackages(
      Object.fromEntries(ms.map(m => [m.pkgId, metaToPackage(m)])),
    )).catch(() => {})
    // Overrides de engine (LSec[]) → store para routing engine antiga/nova.
    getLogicScopes().then(scopes => {
      // Expõe escopos customizados ao picker do wizard (blocos de lógica são
      // building-blocks, não escopos geráveis — ficam de fora).
      setCustomScopesMeta(scopes.filter(s => s.isCustom && !isBlockScope(s.scopeId)).map(s => ({ scopeId: s.scopeId, label: s.label ?? s.scopeId, fase: s.fase, opTypes: s.opTypes })))
      // Rótulos vivos (nome editável) dos escopos/blocos → cards `ref` mostram o nome atual.
      setScopeLabels(Object.fromEntries(scopes.filter(s => s.label).map(s => [s.scopeId, s.label as string])))
      const active = scopes.filter(s => s.sectionCount > 0)
      if (!active.length) return
      Promise.all(active.map(s => getLogicScope(s.scopeId))).then(results => {
        const map: Record<string, unknown[]> = {}
        active.forEach((s, i) => { map[s.scopeId] = results[i].sections })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setLogicOverrides(map as any)
      }).catch(() => {})
    }).catch(() => {})
  }, [session])

  if (!session) {
    return <LoginScreen onLogin={s => setSession(s)} />
  }

  return (
    <AppProvider>
      <Main onLogout={() => { clearSession(); setSession(null) }} />
    </AppProvider>
  )
}
