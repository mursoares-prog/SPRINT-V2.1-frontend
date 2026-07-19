import { useState, useEffect, useMemo } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { AutosaveProvider } from './context/AutosaveContext'
import { Sidebar } from './components/Sidebar'
import { ScheduleView, ScheduleToolbar } from './components/ScheduleView'
import { FineTuningView } from './components/FineTuningView'
import { AdminView } from './components/AdminView'
import { PackagesCatalogModal } from './components/PackagesCatalogModal'
import { InputSummaryPanel } from './components/InputSummaryPanel'
import { ProjectNameField } from './components/ProjectNameField'
import { TestIdentityModal } from './components/TestIdentityModal'
import { generateSchedule } from './engines/scheduleRouter'
import type { ScopeId, WizardInputs, RigType } from './types'
import { ArrowRight, AlertTriangle, FilePlus } from 'lucide-react'
import { LuNetwork } from 'react-icons/lu'
import { getDefaultInputs } from './utils/defaultInputs'
import { isApiConfigured, getMergedPackageLines, getBaseOverrides, getBasePackageOverrides, getCustomPackages, getLogicScopes, getLogicScope } from './utils/api'
import { ensureDefaultSession } from './utils/auth'
import { LoginModal } from './components/LoginModal'
import { setPackageLines } from './data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from './data/lineDetailsStore'
import { setExtraPackages, metaToPackage } from './data/packages'
import { setLogicOverrides, setCustomScopesMeta, getCustomScopesMeta, getKnownWellClasses, getKnownRigTags, isBlockScope, setScopeLabels, DEFAULT_WELL_CLASS } from './data/logicOverrideStore'

// ── Step 1 wizard panel ───────────────────────────────────────────────────────
function WizardPanel() {
  const { state, dispatch } = useApp()
  const [wizardMode,  setWizardMode]  = useState<'auto' | null>(null)
  // Tipo de poço: "Completação Molhada" é o único caminho com engine hardcoded (bundle
  // ANC/DP/Fase/Escopo previsto — WET_CLASS abaixo); qualquer outro valor (Molhada
  // Nordeste, Seca, ou uma classe nova criada pelo admin) passa pelo motor de escopo
  // customizado genérico — ver `isGenericCustom`. Os valores canônicos são o próprio
  // texto exibido nos botões, para casar 1:1 com o `wellClass` gravado no editor.
  const WET_CLASS = 'Completação Molhada'
  const HARDCODED_WELL_CLASSES = [WET_CLASS, 'Completação Molhada Nordeste', DEFAULT_WELL_CLASS]
  const [tipoPoco,    setTipoPoco]    = useState<string>('')
  const [rigType,     setRigType]     = useState<RigType | ''>('')
  const [opType,      setOpType]      = useState<'Generalista' | 'LWO'>('Generalista')
  const [phaseFilter, setPhaseFilter] = useState<'fase_unica' | 'fase_1' | 'fase_2' | ''>('')
  const [scopeId,     setScopeId]     = useState<ScopeId | ''>('')

  const isMolhada = tipoPoco === WET_CLASS
  const isGenericCustom = !!tipoPoco && tipoPoco !== WET_CLASS

  const handleTipoPocoChange = (v: string) => {
    setTipoPoco(v); setRigType(''); setOpType('Generalista'); setPhaseFilter(''); setScopeId('')
  }
  const handleRigChange = (rig: RigType, op: 'Generalista' | 'LWO' = 'Generalista') => {
    setRigType(rig); setOpType(op); setPhaseFilter(''); setScopeId('')
  }
  const handlePhaseChange = (v: 'fase_unica' | 'fase_1' | 'fase_2') => {
    setPhaseFilter(v); setScopeId('')
  }

  // Classes de "Tipo de poço" extras (além das 3 hardcoded) já usadas por algum escopo
  // customizado — viram botões adicionais no wizard automaticamente. Lista pequena
  // (poucos escopos custom): computada direto no render, sem memoização, para sempre
  // refletir o estado atual do store (que é populado assincronamente pelo App).
  const dynamicWellClasses = getKnownWellClasses().filter(w => !HARDCODED_WELL_CLASSES.includes(w))
  // Tag única correspondente à sonda ANC/DP selecionada na etapa hardcoded de Completação
  // Molhada — usada para casar com o "Tipo de sonda" (rigTypes) unificado gravado no editor.
  const molhadaRigTag = rigType === 'ANC' ? 'Ancorada'
    : rigType === 'DP' && opType === 'Generalista' ? 'DP Generalista'
    : rigType === 'DP' && opType === 'LWO' ? 'DP LWIV'
    : null
  // Tags de "Tipo de sonda" cadastradas para a classe de poço selecionada (bucket
  // DEFAULT_WELL_CLASS quando tipoPoco==='Completação Seca'; qualquer outra classe usa
  // seu próprio nome como chave).
  const rigTagsForClass = isGenericCustom ? getKnownRigTags(tipoPoco) : []

  // Lista única de escopos selecionáveis, DB-driven (não há mais catálogo hardcoded).
  // Completação Molhada: filtra por classe + sonda (tag) + fase escolhida — os 11 escopos
  // antes "bundle" agora vêm do DB com esses metadados, junto de quaisquer escopos novos
  // classificados como Molhada. Demais classes: por classe + sonda.
  const customScopes = useMemo(() => {
    if (isMolhada && molhadaRigTag) {
      if (!phaseFilter) return []
      return getCustomScopesMeta().filter(cs => {
        if ((cs.wellClass ?? DEFAULT_WELL_CLASS) !== WET_CLASS) return false
        if (!cs.rigTypes?.includes(molhadaRigTag)) return false
        if (cs.fase && cs.fase !== phaseFilter) return false
        return true
      })
    }
    if (isGenericCustom && rigType) {
      return getCustomScopesMeta().filter(cs => (cs.wellClass ?? DEFAULT_WELL_CLASS) === tipoPoco && cs.rigTypes?.includes(rigType))
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMolhada, isGenericCustom, tipoPoco, rigType, molhadaRigTag, phaseFilter])

  const canGenerate = ((isMolhada && (rigType === 'ANC' || rigType === 'DP')) || (isGenericCustom && !!rigType)) && !!scopeId

  const handleGenerate = () => {
    if (!rigType || !scopeId || !(rigType === 'ANC' || rigType === 'DP' || isGenericCustom)) return
    const defaults = getDefaultInputs(rigType, opType, scopeId)
    // RESET limpa wellName/projectName/projectId para o estado inicial — preserva o que
    // já estava definido (hoje, pelo pop-up de teste; futuramente, pelo sistema externo)
    // em vez de sobrescrever com o placeholder fixo 'Poço' e perder o vínculo com o
    // projeto já salvo no servidor (o que faria o autosave criar um registro duplicado).
    const wellName = state.wellName || 'Poço'
    const projectName = state.projectName
    const projectId = state.projectId
    dispatch({ type: 'RESET' })
    dispatch({ type: 'SET_WELL_NAME', wellName })
    if (projectName) dispatch({ type: 'SET_PROJECT_NAME', projectName })
    if (projectId) dispatch({ type: 'SET_PROJECT_ID', projectId })
    dispatch({ type: 'PROJECT_UPDATE_DATA', patch: { poco: wellName } })
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
      <ProjectNameField />
      <div className="shrink-0 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800">
        <span className="text-[10px] tracking-widest uppercase text-slate-400 dark:text-slate-500">Novo Cronograma</span>
      </div>

      {/* Escolha inicial */}
      {wizardMode === null && (
        <div className="flex-1 flex flex-col gap-3 p-4 pt-6">
          <button
            onClick={() => setWizardMode('auto')}
            className="w-full flex flex-col items-center justify-center gap-1 py-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500 transition-colors">
            <LuNetwork size={18} className="mb-0.5" />
            <span className="text-sm">Cronograma por Árvores de Decisão</span>
          </button>
          <button
            onClick={() => dispatch({ type: 'ENTER_FINE_TUNING_BLANK' })}
            className="w-full flex flex-col items-center justify-center gap-1 py-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500 transition-colors">
            <FilePlus size={18} className="mb-0.5" />
            <span className="text-sm">Cronograma em branco</span>
          </button>
        </div>
      )}

      {/* Wizard do gerador automatizado */}
      {wizardMode === 'auto' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-custom">

          {/* ── Divisão: Poço e Sonda ── */}
          <div className="pl-2 border-l-2 border-slate-300 dark:border-slate-600 space-y-4">

            <WizStep label="Tipo de intervenção">
              <WizOption active onClick={() => {}}>Abandono</WizOption>
            </WizStep>

            <WizStep label="Tipo de poço">
              <WizOption active={tipoPoco === 'Completação Molhada'}          onClick={() => handleTipoPocoChange('Completação Molhada')}>Completação Molhada</WizOption>
              <WizOption active={tipoPoco === 'Completação Molhada Nordeste'} onClick={() => handleTipoPocoChange('Completação Molhada Nordeste')}>Completação Molhada Nordeste</WizOption>
              <WizOption active={tipoPoco === DEFAULT_WELL_CLASS}             onClick={() => handleTipoPocoChange(DEFAULT_WELL_CLASS)}>Completação Seca</WizOption>
              {/* Classes extras definidas livremente pelo admin no editor de Árvores de
                  Decisão (Tipo de poço de um escopo customizado) — aparecem aqui assim
                  que algum escopo for classificado com esse valor. */}
              {dynamicWellClasses.map(w => (
                <WizOption key={w} active={tipoPoco === w} onClick={() => handleTipoPocoChange(w)}>{w}</WizOption>
              ))}
            </WizStep>

            {isMolhada && (
              <WizStep label="Tipo de sonda">
                <WizOption active={rigType === 'ANC'}                            onClick={() => handleRigChange('ANC')}>Ancorada</WizOption>
                <WizOption active={rigType === 'DP' && opType === 'Generalista'} onClick={() => handleRigChange('DP', 'Generalista')}>DP Generalista</WizOption>
                <WizOption active={rigType === 'DP' && opType === 'LWO'}         onClick={() => handleRigChange('DP', 'LWO')}>DP LWIV</WizOption>
              </WizStep>
            )}

            {isGenericCustom && (
              <WizStep label="Tipo de sonda">
                {rigTagsForClass.length > 0 ? rigTagsForClass.map(rig => (
                  <WizOption key={rig} active={rigType === rig} onClick={() => handleRigChange(rig)}>{rig}</WizOption>
                )) : (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1 py-1">
                    Nenhuma sonda cadastrada para "{tipoPoco}" ainda — classifique um escopo no editor de Árvores de Decisão.
                  </p>
                )}
              </WizStep>
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

          {customScopes.length > 0 && (
            <WizStep label="Escopo previsto">
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

      {wizardMode === 'auto' && (
        <div className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={handleGenerate}
            disabled={!canGenerate}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-sm transition-colors bg-[#008542] text-white hover:opacity-90 dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 dark:hover:bg-[#1e4570] dark:hover:border-sky-500 disabled:opacity-30 disabled:cursor-not-allowed">
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
      <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-1.5 px-1">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function WizOption({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2.5 py-1.5 px-2 rounded-lg text-left text-xs border transition-colors
        ${active
          ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
          : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500'}`}>
      <span className={`shrink-0 w-3 h-3 rounded-full border-2 flex items-center justify-center
        ${active ? 'border-slate-800 dark:border-slate-100' : 'border-slate-400 dark:border-slate-600'}`}>
        {active && <span className="w-1.5 h-1.5 rounded-full bg-slate-800 dark:bg-slate-100" />}
      </span>
      {children}
    </button>
  )
}

// ── Main layout ───────────────────────────────────────────────────────────────

function Main() {
  const { state, dispatch } = useApp()
  const [isDark, setIsDark] = useState(() => localStorage.getItem('sprint_theme') === 'dark')
  const [adminTab, setAdminTab] = useState<'vars' | 'engine'>('vars')
  const [showAdmin, setShowAdmin] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [pkgAnchor, setPkgAnchor] = useState<DOMRect | null>(null)
  const [navWarnTarget, setNavWarnTarget] = useState<'home' | 'wizard' | 'schedule' | 'fine_tuning' | null>(null)
  const [navWarnFrom, setNavWarnFrom] = useState<'schedule' | 'fine_tuning' | null>(null)
  const [showStats, setShowStats] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1400)
  // TEMPORÁRIO (harness de teste — ver TestIdentityModal): exibido uma vez ao abrir a
  // página, simulando a entrada do sistema externo (poço, projeto, papel).
  const [showIdentityModal, setShowIdentityModal] = useState(true)
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

      {showIdentityModal && (
        <TestIdentityModal onClose={() => setShowIdentityModal(false)} />
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
      setCustomScopesMeta(scopes.filter(s => !isBlockScope(s.scopeId)).map(s => ({ scopeId: s.scopeId, label: s.label ?? s.scopeId, fase: s.fase, opTypes: s.opTypes, rigTypes: s.rigTypes, wellClass: s.wellClass })))
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
      <AutosaveProvider>
        <Main />
      </AutosaveProvider>
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
