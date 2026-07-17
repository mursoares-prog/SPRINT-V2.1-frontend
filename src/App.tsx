import { useState, useEffect, useMemo } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { Sidebar } from './components/Sidebar'
import { ScheduleView, ScheduleToolbar } from './components/ScheduleView'
import { FineTuningView } from './components/FineTuningView'
import { AdminView } from './components/AdminView'
import { PackagesCatalogModal } from './components/PackagesCatalogModal'
import { InputSummaryPanel } from './components/InputSummaryPanel'
import { generateSchedule } from './engines/scheduleRouter'
import type { ScopeId, WizardInputs, RigType } from './types'
import { ArrowRight, AlertTriangle, Plus, FilePlus } from 'lucide-react'
import { getDefaultInputs } from './utils/defaultInputs'
import { isApiConfigured, getMergedPackageLines, getBaseOverrides, getBasePackageOverrides, getCustomPackages, getLogicScopes, getLogicScope } from './utils/api'
import { ensureDefaultSession } from './utils/auth'
import { LoginModal } from './components/LoginModal'
import { setPackageLines } from './data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from './data/lineDetailsStore'
import { setExtraPackages, metaToPackage } from './data/packages'
import { setLogicOverrides, setCustomScopesMeta, getCustomScopesMeta, isBlockScope, setScopeLabels } from './data/logicOverrideStore'
import { SCOPE_LABEL } from './data/scopeLabels'

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
// ── Step 1 wizard panel ───────────────────────────────────────────────────────
function WizardPanel() {
  const { dispatch } = useApp()
  const [started,     setStarted]     = useState(false)
  const [wizardMode,  setWizardMode]  = useState<'auto' | null>(null)
  const [tipoPoco,    setTipoPoco]    = useState<'molhada' | 'molhada_nordeste' | 'seca' | ''>('')
  const [rigType,     setRigType]     = useState<RigType | ''>('')
  const [opType,      setOpType]      = useState<'Generalista' | 'LWO'>('Generalista')
  const [phaseFilter, setPhaseFilter] = useState<'fase_unica' | 'fase_1' | 'fase_2' | ''>('')
  const [scopeId,     setScopeId]     = useState<ScopeId | ''>('')

  const isMolhada = tipoPoco === 'molhada'

  const handleTipoPocoChange = (v: typeof tipoPoco) => {
    setTipoPoco(v); setRigType(''); setOpType('Generalista'); setPhaseFilter(''); setScopeId('')
  }
  const handleRigChange = (rig: RigType, op: 'Generalista' | 'LWO' = 'Generalista') => {
    setRigType(rig); setOpType(op); setPhaseFilter(''); setScopeId('')
  }
  const handlePhaseChange = (v: 'fase_unica' | 'fase_1' | 'fase_2') => {
    setPhaseFilter(v); setScopeId('')
  }

  const scopeMap = opType === 'LWO' ? SCOPE_BY_PHASE_LWO : SCOPE_BY_PHASE
  const scopeOptions = phaseFilter ? scopeMap[phaseFilter] ?? [] : []
  const customScopes = useMemo(() => {
    if (!isMolhada || !rigType) return []
    return getCustomScopesMeta().filter(cs => {
      if (cs.fase && phaseFilter && cs.fase !== phaseFilter) return false
      if (cs.opTypes?.length && !cs.opTypes.includes(opType)) return false
      return true
    })
  }, [isMolhada, rigType, phaseFilter, opType])

  const canGenerate = isMolhada && (rigType === 'ANC' || rigType === 'DP') && !!scopeId

  const handleNew = () => {
    setTipoPoco(''); setRigType(''); setOpType('Generalista'); setPhaseFilter(''); setScopeId('')
    setStarted(true); setWizardMode(null)
  }

  const handleGenerate = () => {
    if (!rigType || !scopeId || (rigType !== 'ANC' && rigType !== 'DP')) return
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

  return (
    <aside className="shrink-0 border-r border-slate-200 dark:border-slate-700 bg-[#f5f5f5] dark:bg-slate-900 flex flex-col overflow-hidden"
      style={{ width: '340px' }}>

      {/* Header — same height as ScheduleToolbar */}
      <div className="shrink-0 flex items-center justify-center px-3 border-b border-slate-200 dark:border-slate-700" style={{ height: '38px' }}>
        <button
          onClick={handleNew}
          className="w-full flex items-center justify-center gap-1.5 h-7 rounded text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 bg-[#fafafa] dark:bg-slate-700">
          <Plus size={13} /> Novo Cronograma
        </button>
      </div>

      {/* Escolha inicial após clicar em Novo Cronograma */}
      {started && wizardMode === null && (
        <div className="flex-1 flex flex-col gap-3 p-4 pt-6">
          <button
            onClick={() => setWizardMode('auto')}
            className="w-full flex flex-col items-center justify-center gap-1 py-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#005889] dark:hover:border-sky-500 hover:text-[#005889] dark:hover:text-sky-400 transition-colors">
            <ArrowRight size={18} className="mb-0.5" />
            <span className="text-sm font-semibold">Gerador automatizado</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Preencha os parâmetros do poço</span>
          </button>
          <button
            onClick={() => dispatch({ type: 'ENTER_FINE_TUNING_BLANK' })}
            className="w-full flex flex-col items-center justify-center gap-1 py-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-[#005889] dark:hover:border-sky-500 hover:text-[#005889] dark:hover:text-sky-400 transition-colors">
            <FilePlus size={18} className="mb-0.5" />
            <span className="text-sm font-semibold">Cronograma em branco</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Montar manualmente do zero</span>
          </button>
        </div>
      )}

      {/* Wizard do gerador automatizado */}
      {started && wizardMode === 'auto' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-custom">

          {/* ── Divisão: Poço e Sonda ── */}
          <div className="pl-2 border-l-2 border-slate-300 dark:border-slate-600 space-y-4">

            <WizStep label="Tipo de intervenção">
              <WizOption active onClick={() => {}}>Abandono</WizOption>
            </WizStep>

            <WizStep label="Tipo de poço">
              <WizOption active={tipoPoco === 'molhada'}          onClick={() => handleTipoPocoChange('molhada')}>Completação Molhada</WizOption>
              <WizOption active={tipoPoco === 'molhada_nordeste'} onClick={() => handleTipoPocoChange('molhada_nordeste')}>Completação Molhada Nordeste</WizOption>
              <WizOption active={tipoPoco === 'seca'}             onClick={() => handleTipoPocoChange('seca')}>Completação Seca</WizOption>
            </WizStep>

            {isMolhada && (
              <WizStep label="Tipo de sonda">
                <WizOption active={rigType === 'ANC'}                            onClick={() => handleRigChange('ANC')}>Ancorada</WizOption>
                <WizOption active={rigType === 'DP' && opType === 'Generalista'} onClick={() => handleRigChange('DP', 'Generalista')}>DP Generalista</WizOption>
                <WizOption active={rigType === 'DP' && opType === 'LWO'}         onClick={() => handleRigChange('DP', 'LWO')}>DP LWIV</WizOption>
              </WizStep>
            )}

            {(tipoPoco === 'seca' || tipoPoco === 'molhada_nordeste') && (
              <div className="flex items-center justify-center py-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <span className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase">Em desenvolvimento</span>
              </div>
            )}

          </div>

          {/* ── Escopo ── */}
          {isMolhada && (rigType === 'ANC' || rigType === 'DP') && (
            <WizStep label="Fase da intervenção">
              <WizOption active={phaseFilter === 'fase_1'}     onClick={() => handlePhaseChange('fase_1')}>Fase 1</WizOption>
              <WizOption active={phaseFilter === 'fase_2'}     onClick={() => handlePhaseChange('fase_2')}>Fase 2</WizOption>
              <WizOption active={phaseFilter === 'fase_unica'} onClick={() => handlePhaseChange('fase_unica')}>Fase Única (FSU)</WizOption>
            </WizStep>
          )}

          {isMolhada && phaseFilter && scopeOptions.length > 0 && (
            <WizStep label="Escopo previsto">
              {scopeOptions.map(id => (
                <WizOption key={id} active={scopeId === id} onClick={() => setScopeId(id)}>
                  {SCOPE_LABEL[id]}
                </WizOption>
              ))}
            </WizStep>
          )}

          {customScopes.length > 0 && (
            <WizStep label="Fluxogramas customizados">
              {customScopes.map(cs => (
                <WizOption key={cs.scopeId} active={scopeId === cs.scopeId} onClick={() => setScopeId(cs.scopeId)}>
                  <span className="flex flex-col min-w-0">
                    <span>{cs.label}</span>
                    {(cs.fase || cs.opTypes?.length) && (
                      <span className="text-[10px] opacity-60 font-normal mt-0.5">
                        {[
                          cs.fase === 'fase_1' ? 'Fase 1' : cs.fase === 'fase_2' ? 'Fase 2' : cs.fase === 'fase_unica' ? 'Fase Única' : null,
                          cs.opTypes?.join(' / '),
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                </WizOption>
              ))}
            </WizStep>
          )}

        </div>
      )}

      {started && wizardMode === 'auto' && (
        <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold transition-colors bg-[#008542] text-white hover:opacity-90 dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 dark:hover:bg-[#1e4570] dark:hover:border-sky-500 disabled:opacity-30 disabled:cursor-not-allowed">
            Gerar Cronograma <ArrowRight size={14} />
          </button>
        </div>
      )}
    </aside>
  )
}

function WizStep({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-1.5 px-1">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function WizOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left text-xs transition-colors
        ${active
          ? 'bg-[#005889] text-white dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 font-semibold'
          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'}`}>
      <span className={`shrink-0 w-3 h-3 rounded-full border-2 flex items-center justify-center
        ${active ? 'border-white' : 'border-slate-400 dark:border-slate-600'}`}>
        {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      {children}
    </button>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────

function Main() {
  const { state, dispatch } = useApp()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('sprint_theme') !== 'light')
  const [adminTab, setAdminTab] = useState<'vars' | 'engine'>('vars')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [pkgAnchor, setPkgAnchor] = useState<DOMRect | null>(null)
  const [navWarnTarget, setNavWarnTarget] = useState<'home' | 'wizard' | 'schedule' | 'fine_tuning' | null>(null)
  const [navWarnFrom, setNavWarnFrom] = useState<'schedule' | 'fine_tuning' | null>(null)
  const [showStats, setShowStats] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1400)
  const toggleDark = () => setIsDark(d => !d)

  const handleBeforeStepNav = (targetView: string): boolean => {
    if (state.view === 'fine_tuning' && (targetView === 'schedule' || targetView === 'wizard')) {
      setNavWarnFrom('fine_tuning')
      setNavWarnTarget(targetView as 'schedule' | 'wizard')
      return false
    }
    if (state.view === 'schedule' && (targetView === 'wizard' || targetView === 'home') && state.schedule.length > 0) {
      setNavWarnFrom('schedule')
      setNavWarnTarget(targetView as 'wizard' | 'home')
      return false
    }
    return true
  }

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('sprint_theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <div className="flex flex-col h-[100dvh] overflow-y-hidden overflow-x-auto bg-[#fafafa] dark:bg-slate-950">

      <Sidebar
        isDark={isDark}
        onToggleDark={toggleDark}
        onOpenConfig={() => { setAdminTab('vars'); setShowAdmin(true) }}
        onOpenPackages={(rect) => { setPkgAnchor(rect); setShowPackages(true) }}
        onOpenLogicEditor={() => { setAdminTab('engine'); setShowAdmin(true) }}
        onBeforeStepNav={handleBeforeStepNav}
      />

      {/* Content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showAdmin && <AdminView initialTab={adminTab} onClose={() => setShowAdmin(false)} />}
        {showPackages && pkgAnchor && <PackagesCatalogModal anchorRect={pkgAnchor} onClose={() => setShowPackages(false)} />}

        {/* Left panels */}
        {(state.view === 'home' || state.view === 'wizard') && <WizardPanel />}
        {state.view === 'schedule' && <InputSummaryPanel />}

        {/* Right: toolbar + main */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {state.view === 'schedule' && (
            <ScheduleToolbar showStats={showStats} onToggleStats={() => setShowStats(s => !s)} />
          )}

          <main className="grow min-w-0 overflow-hidden flex flex-col bg-[#fafafa] dark:bg-slate-950">
            {state.view === 'schedule' && <ScheduleView showStats={showStats} />}
            {state.view === 'fine_tuning' && <FineTuningView />}
          </main>
        </div>

      </div>

      {/* Navigation warning modal */}
      {navWarnTarget && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                  {navWarnFrom === 'schedule' ? 'Retornar à Etapa 1?' : 'Retornar ao Cronograma?'}
                </p>
                <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed">
                  {navWarnFrom === 'schedule'
                    ? 'Retornar à Etapa 1 e alterar os parâmetros irá regenerar o cronograma, descartando os ajustes feitos na Etapa 2.'
                    : 'Não é recomendado voltar à Etapa 2 após iniciar o Aperfeiçoamento. Qualquer regeneração do cronograma irá descartar os dados preenchidos nesta etapa.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setNavWarnTarget(null); setNavWarnFrom(null) }}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={() => { const t = navWarnTarget; setNavWarnTarget(null); setNavWarnFrom(null); dispatch({ type: 'SET_VIEW', view: t }) }}
                className="flex items-center h-8 px-4 rounded-lg text-sm font-semibold transition-colors bg-[#008542] text-white hover:opacity-90 dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 dark:hover:bg-[#1e4570] dark:hover:border-sky-500">
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
  ensureDefaultSession()
  const [showLoginModal, setShowLoginModal] = useState(false)

  useEffect(() => {
    const handle = () => setShowLoginModal(true)
    window.addEventListener('sprint:auth-error', handle)
    return () => window.removeEventListener('sprint:auth-error', handle)
  }, [])

  useEffect(() => {
    if (!isApiConfigured()) return
    getMergedPackageLines().then(setPackageLines).catch(() => {})
    getBaseOverrides().then(applyDetailOverrides).catch(() => {})
    getBasePackageOverrides().then(applyPackageOverrides).catch(() => {})
    getCustomPackages().then(ms => setExtraPackages(
      Object.fromEntries(ms.map(m => [m.pkgId, metaToPackage(m)])),
    )).catch(() => {})
    getLogicScopes().then(scopes => {
      setCustomScopesMeta(scopes.filter(s => s.isCustom && !isBlockScope(s.scopeId)).map(s => ({ scopeId: s.scopeId, label: s.label ?? s.scopeId, fase: s.fase, opTypes: s.opTypes })))
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
  }, [])

  return (
    <AppProvider>
      <Main />
      {showLoginModal && (
        <LoginModal
          onLogin={session => {
            void session
            setShowLoginModal(false)
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </AppProvider>
  )
}
