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
import { isApiConfigured, getMergedPackageLines, getBaseOverrides, getBasePackageOverrides, getCustomPackages, getLogicScopes, getLogicScope, getLogicScopeGroups } from './utils/api'
import { ensureDefaultSession } from './utils/auth'
import { LoginModal } from './components/LoginModal'
import { setPackageLines } from './data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from './data/lineDetailsStore'
import { setExtraPackages, metaToPackage } from './data/packages'
import { setLogicOverrides, setCustomScopesMeta, getCustomScopesMeta, isBlockScope, setScopeLabels, setScopeGroupsData, getTopScopeGroups, getScopeIdsInGroup, getUngroupedScopeIds } from './data/logicOverrideStore'
import type { ScopeGroupNode } from './data/logicOverrideStore'

// Aplica a config de pastas (grupos de escopos) vinda do servidor/localStorage ao store.
// Formato = GroupStorage do LogicEditorPanel: { groups, memberships, ... }.
function applyScopeGroups(gs: unknown): void {
  const obj = (gs ?? {}) as { groups?: ScopeGroupNode[]; memberships?: Record<string, string | null> }
  const groups = Array.isArray(obj.groups) ? obj.groups : []
  setScopeGroupsData(groups, obj.memberships ?? {})
}

// Fallback: a config de pastas que o editor persiste localmente (usado quando o servidor
// não responde/não tem config salva ainda).
function readLocalScopeGroups(): unknown {
  try {
    const raw = localStorage.getItem('lep-scope-groups')
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

// Rótulos das fases canônicas exibidas na Etapa 1 (chave = valor gravado em cada escopo).
const PHASE_LABELS: Record<string, string> = {
  fase_1: 'Fase 1',
  fase_2: 'Fase 2',
  fase_unica: 'Fase Única (FSU)',
}

// ── Step 1 wizard panel ───────────────────────────────────────────────────────
function WizardPanel() {
  const { state, dispatch } = useApp()
  const [wizardMode,  setWizardMode]  = useState<'auto' | null>(null)
  // Etapa 1 dirigida pelas PASTAS do editor de Árvores de Decisão: cada pasta de topo é um
  // "Tipo de intervenção". Selecionar uma pasta restringe o conjunto de escopos aos que
  // estão arquivados nela (membership). Os passos seguintes (sonda → fase → escopo) filtram
  // dentro desse conjunto pelos metadados de cada escopo (rigTypes/fase). Não há mais a
  // etapa de "Tipo de poço" (wellClass): a organização por pasta a substitui.
  const UNGROUPED = '__ungrouped__'   // bucket "Outros" (escopos fora de qualquer pasta)
  const [folderId,    setFolderId]    = useState<string>('')
  const [rigTag,      setRigTag]      = useState<string>('')
  const [phaseFilter, setPhaseFilter] = useState<string>('')
  const [scopeId,     setScopeId]     = useState<ScopeId | ''>('')

  const handleFolderChange = (v: string) => {
    setFolderId(v); setRigTag(''); setPhaseFilter(''); setScopeId('')
  }
  const handleRigChange = (tag: string) => {
    setRigTag(tag); setPhaseFilter(''); setScopeId('')
  }
  const handlePhaseChange = (v: string) => {
    setPhaseFilter(v); setScopeId('')
  }

  // Pastas de topo que possuem ao menos um escopo selecionável (direto ou em sub-pastas),
  // + o bucket "Outros" quando há escopos fora de qualquer pasta. Computado no render (store
  // populado assincronamente pelo App; re-render disparado pela interação do usuário).
  const topFolders = getTopScopeGroups()
    .map(g => ({ id: g.id, name: g.name, ids: getScopeIdsInGroup(g.id) }))
    .filter(g => getCustomScopesMeta().some(cs => g.ids.has(cs.scopeId)))
  const ungroupedIds = getUngroupedScopeIds()
  const hasUngrouped = getCustomScopesMeta().some(cs => ungroupedIds.has(cs.scopeId))

  // Mapeia uma tag de "Tipo de sonda" para (rigType, opType) do motor. Tags de completação
  // molhada resolvem para ANC/DP + opType (caminho com perguntas de wizard); qualquer outra
  // tag é passada como rigType livre (escopos decisions-free — ver getDefaultInputs).
  const resolveRig = (tag: string): { rigType: RigType | ''; opType: 'Generalista' | 'LWO' } =>
    tag === 'Ancorada'       ? { rigType: 'ANC', opType: 'Generalista' }
    : tag === 'DP Generalista' ? { rigType: 'DP',  opType: 'Generalista' }
    : tag === 'DP LWIV'        ? { rigType: 'DP',  opType: 'LWO' }
    : { rigType: tag as RigType, opType: 'Generalista' }

  // Escopos da pasta selecionada (ou "Outros"), antes dos filtros de sonda/fase.
  const folderScopes = useMemo(() => {
    if (!folderId) return []
    const ids = folderId === UNGROUPED ? getUngroupedScopeIds() : getScopeIdsInGroup(folderId)
    return getCustomScopesMeta().filter(cs => ids.has(cs.scopeId))
  }, [folderId])

  // Tags de sonda disponíveis na pasta. Vazio → pasta sem escopos com sonda; pula a etapa.
  const rigTagsForFolder = useMemo(
    () => [...new Set(folderScopes.flatMap(cs => cs.rigTypes ?? []))].sort(),
    [folderScopes],
  )
  const needsRig = rigTagsForFolder.length > 0

  // Escopos após o filtro de sonda (quando a pasta tem sondas).
  const rigScopes = useMemo(
    () => needsRig ? folderScopes.filter(cs => rigTag && cs.rigTypes?.includes(rigTag)) : folderScopes,
    [folderScopes, needsRig, rigTag],
  )

  // Fases disponíveis entre os escopos filtrados por sonda (escopos sem fase passam por todas).
  const phasesForFolder = useMemo(
    () => [...new Set(rigScopes.map(cs => cs.fase).filter((f): f is string => !!f))],
    [rigScopes],
  )
  const needsPhase = phasesForFolder.length > 0

  // Lista final de escopos selecionáveis (aplica o filtro de fase quando aplicável).
  const customScopes = useMemo(() => {
    if (needsRig && !rigTag) return []
    if (!needsPhase) return rigScopes
    if (!phaseFilter) return []
    return rigScopes.filter(cs => !cs.fase || cs.fase === phaseFilter)
  }, [rigScopes, needsRig, rigTag, needsPhase, phaseFilter])

  const canGenerate = !!folderId && (!needsRig || !!rigTag) && !!scopeId

  const handleGenerate = () => {
    if (!scopeId) return
    const { rigType, opType } = resolveRig(rigTag)
    const defaults = getDefaultInputs(rigType as RigType, opType, scopeId)
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

          {/* ── Divisão: Intervenção (pasta) e Sonda ── */}
          <div className="pl-2 border-l-2 border-slate-300 dark:border-slate-600 space-y-4">

            {/* Tipo de intervenção = pastas de topo do editor de Árvores de Decisão
                (Abandono Completação Molhada, Completação Seca, Workover, …). */}
            <WizStep label="Tipo de intervenção">
              {topFolders.length > 0 || hasUngrouped ? (
                <>
                  {topFolders.map(f => (
                    <WizOption key={f.id} active={folderId === f.id} onClick={() => handleFolderChange(f.id)}>{f.name}</WizOption>
                  ))}
                  {hasUngrouped && (
                    <WizOption active={folderId === UNGROUPED} onClick={() => handleFolderChange(UNGROUPED)}>Outros</WizOption>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 px-1 py-1">
                  Nenhuma pasta de escopos cadastrada ainda — organize os escopos no editor de Árvores de Decisão.
                </p>
              )}
            </WizStep>

            {folderId && needsRig && (
              <WizStep label="Tipo de sonda">
                {rigTagsForFolder.map(tag => (
                  <WizOption key={tag} active={rigTag === tag} onClick={() => handleRigChange(tag)}>{tag}</WizOption>
                ))}
              </WizStep>
            )}

          </div>

          {/* ── Escopo ── */}
          {folderId && (!needsRig || !!rigTag) && needsPhase && (
            <WizStep label="Fase da intervenção">
              {(['fase_1', 'fase_2', 'fase_unica'] as const)
                .filter(f => phasesForFolder.includes(f))
                .map(f => (
                  <WizOption key={f} active={phaseFilter === f} onClick={() => handlePhaseChange(f)}>{PHASE_LABELS[f]}</WizOption>
                ))}
              {/* Fases fora do trio canônico (definidas livremente no editor) também aparecem. */}
              {phasesForFolder.filter(f => !(['fase_1', 'fase_2', 'fase_unica'] as string[]).includes(f)).map(f => (
                <WizOption key={f} active={phaseFilter === f} onClick={() => handlePhaseChange(f)}>{f}</WizOption>
              ))}
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
    // Pastas de escopos (organização do editor de Árvores de Decisão) → botões de "Tipo
    // de intervenção" na Etapa 1. Servidor é a fonte; localStorage do editor é o fallback.
    getLogicScopeGroups()
      .then(gs => applyScopeGroups(gs))
      .catch(() => applyScopeGroups(readLocalScopeGroups()))
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
