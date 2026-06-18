import { useState, useEffect } from 'react'
import { AppProvider, useApp } from './context/AppContext'
import { LoginScreen } from './components/LoginScreen'
import { Sidebar } from './components/Sidebar'
import { ScheduleView } from './components/ScheduleView'
import { FineTuningView } from './components/FineTuningView'
import { AdminView } from './components/AdminView'
import { PackagesCatalogModal } from './components/PackagesCatalogModal'
import { FlowchartModal } from './components/FlowchartModal'
import { InputSummaryPanel } from './components/InputSummaryPanel'
import { generateSchedule } from './engines/sequenceEngine'
import type { ScopeId, WizardInputs, IsolationConfig } from './types'
import { ArrowRight, FileText, Settings2, FolderOpen, AlertTriangle, Server } from 'lucide-react'
import { loadProjectFromFile } from './utils/projectFile'
import { isApiConfigured, getMergedPackageLines, getBaseOverrides, getBasePackageOverrides, getCustomPackages } from './utils/api'
import { getSession, clearSession, isAdmin } from './utils/auth'
import { setPackageLines } from './data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from './data/lineDetailsStore'
import { setExtraPackages, metaToPackage } from './data/packages'
import { ServerProjectsModal } from './components/ServerProjectsModal'

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
export const SCOPE_LABEL: Record<ScopeId, string> = {
  FSU_TT_FT:    'TT Flexitubo (TT-FT)',
  FSU_TT_BDC:   'TT Bombeio Direto (TT-BDC)',
  FSU_Conv_BOP:  'Convencional com BOP',
  FSU_Conv_RCMA: 'Convencional com RCMA',
  FSU_Sup_COP:   'Superconvencional (COP Interior/Inferior)',
  FSU_Sup_PWC:   'Superconvencional (Recimentação/PWC)',
  FS1_Mec:       'Tampões Mecânicos',
  FS2_Conv_BOP:  'Convencional com BOP',
  FS2_Conv_RCMA: 'Convencional com RCMA',
  FS2_Sup_COP:   'Superconvencional (COP Interior/Inferior)',
  FS2_Sup_PWC:   'Superconvencional (Recimentação/PWC)',
}

// ── Default inputs por escopo ─────────────────────────────────────────────────
function getDefaultInputs(
  rigType: 'ANC' | 'DP',
  operationType: 'Generalista' | 'LWO',
  scopeId: ScopeId,
): Partial<WizardInputs> {
  const isFS2        = scopeId.startsWith('FS2')
  const isTT         = scopeId === 'FSU_TT_FT' || scopeId === 'FSU_TT_BDC'
  const isTTFT       = scopeId === 'FSU_TT_FT'
  const isFS1        = scopeId === 'FS1_Mec'
  const isConvBOP    = scopeId === 'FSU_Conv_BOP'
  const isRCMA       = scopeId === 'FSU_Conv_RCMA' || scopeId === 'FS2_Conv_RCMA'
  const isSupPWC     = scopeId === 'FSU_Sup_PWC' || scopeId === 'FS2_Sup_PWC'
  const hasBopCement = isFS2 || ['FSU_Conv_BOP', 'FSU_Sup_COP', 'FSU_Sup_PWC', 'FSU_Conv_RCMA'].includes(scopeId)
  const hasBop       = isFS2 || ['FSU_Conv_BOP', 'FSU_Sup_COP', 'FSU_Sup_PWC'].includes(scopeId)
  const hasCement    = scopeId !== 'FSU_TT_FT' && !isFS2
  const hasRetrieval = ['FSU_Conv_BOP', 'FSU_Conv_RCMA', 'FSU_Sup_COP', 'FSU_Sup_PWC', 'FS1_Mec'].includes(scopeId)

  return {
    rigType,
    operationType,
    scopeId,
    subseaEquipments: isFS2 ? [] : ['tree_cap'],
    percentile: 75,
    startDate: new Date().toISOString().split('T')[0],

    ...(!isFS2 && {
      hasTmfPlug:            false,
      hasThPlug:             false,
      installCamisao:        ['yes'],
      camisaoMethod:         'wireline',
      anularAMinPressure:    'nonzero',
      anularFluid:           'inhibited',
      amortAnularFluid:      'inhibited',
      initialFillFluid:      'diesel_fcba',
      riserFluid:            'n2',
      tcapRemovalMethod:     'workstring',
      tcapDisposition:       'bottom',
      contingencyTcapHydrate: 'contingency',
      tubingPerfMethod:      'electric',
      cleanFlowlines:        true,
      flowlineLines:         ['flpo', 'flgl'] as ('flpo' | 'flgl')[],
      flowlineMethod:        'direct_pumping',
      flowlineHydrate:       'contingency',
      flowlineHydrateLines:  ['flpo', 'flgl'] as ('flpo' | 'flgl')[],
      anmHydrate:            'contingency',
      anmHydrateBlocks:      ['producao', 'anular'] as ('producao' | 'anular')[],
      anmValveContingency:   ['hydrate', 'jateamento'] as ('hydrate' | 'jateamento')[],
      anmValveHydrateBlocks: ['producao', 'anular'] as ('producao' | 'anular')[],
      contingencyGabaritFT:  'contingency',
      gaugeTech:             'wireline',
      gaugeContingency:      false,
      installTmfPlugEndProd: 'no',
      installTmfPlugEndAnul: 'no',
    }),

    ...(hasRetrieval && { hasStuckStringRisk: isRCMA ? 'yes' : 'no' }),
    ...(hasCement    && { cementMethod: 'params' }),
    ...(rigType === 'DP' && { transponderMode: 'rov', dmmWithEquipment: false }),

    ...(isTT && {
      csbPrimary:    'stdv',
      removeANM:     false,
      hasPDI:        true,
      jatearCopCoi:  'yes',
    }),

    ...(isTTFT && {
      ttFtCementMode: 'single',
      loggingMode:    'polias',
    }),

    ...(isFS1 && {
      fs1CsbAlreadyInstalled: false,
      fs1CsbPrimary:          'tae',
      fs1PerfProfunda:        'yes',
      fs1PerfRasa:            'yes',
      fs1CsbSecondary:        'plug_th',
      removeANM:              false,
    }),

    ...((isConvBOP || scopeId === 'FSU_Conv_RCMA' || scopeId === 'FSU_Sup_COP' || scopeId === 'FSU_Sup_PWC') && {
      fs1CsbAlreadyInstalled: false,
      fs1CsbPrimary:   'tae',
      fs1PerfProfunda: 'yes',
      fs1PerfRasa:     'yes',
      fs1CsbSecondary: 'plug_th',
    }),

    ...(scopeId === 'FSU_Conv_RCMA' && {
      rcmaCsbPrincipal: 'fluid_csb' as const,
    }),

    ...(hasBopCement && { bopPwcPreLog: true }),
    ...(isSupPWC && { bopCorrectionMethod: 'convencional' }),
    ...(hasBop && { contingencyFejat: 'no' }),
    ...(isFS2 && { fs2CopCutContingency: 'no' as const, fs2CopCutMethod: 'electric' as const }),

    ...(hasBopCement && !isSupPWC && {
      isolationCount: 1,
      isolations: [{ needsCorrection: false, plugType: 'bpp' }] as IsolationConfig[],
    }),
    ...(isSupPWC && {
      isolationCount: 1,
      isolations: [{ needsCorrection: true, corrMethod: 'pwc', pwcValidation: 'params' }] as IsolationConfig[],
    }),
  } as Partial<WizardInputs>
}

// ── Home ──────────────────────────────────────────────────────────────────────
function Home() {
  const session = getSession()
  const { dispatch } = useApp()
  const [selecting, setSelecting] = useState(false)
  const [askingWell, setAskingWell] = useState(false)
  const [wellName,    setWellName]    = useState('')
  const [rigType,     setRigType]     = useState<'ANC' | 'DP' | ''>('')
  const [opType,      setOpType]      = useState<'Generalista' | 'LWO'>('Generalista')
  const [phaseFilter, setPhaseFilter] = useState<'fase_unica' | 'fase_1' | 'fase_2' | ''>('')
  const [scopeId,     setScopeId]     = useState<ScopeId | ''>('')
  const [openError,   setOpenError]   = useState<string | null>(null)
  const [showServer,  setShowServer]  = useState(false)

  const reset = () => {
    setRigType(''); setOpType('Generalista'); setPhaseFilter(''); setScopeId(''); setWellName('')
  }

  const handleStartNew = () => {
    if (!wellName.trim()) return
    setAskingWell(false)
    setSelecting(true)
  }

  const handleRigChange = (v: 'ANC' | 'DP') => {
    setRigType(v)
    if (v === 'ANC') setOpType('Generalista')
    setPhaseFilter(''); setScopeId('')
  }
  const handleOpChange = (v: 'Generalista' | 'LWO') => {
    setOpType(v); setPhaseFilter(''); setScopeId('')
  }
  const handlePhaseChange = (v: typeof phaseFilter) => {
    setPhaseFilter(v); setScopeId('')
  }

  const handleGenerate = () => {
    if (!rigType || !scopeId) return
    const defaults = getDefaultInputs(rigType, opType, scopeId)
    dispatch({ type: 'RESET' })
    dispatch({ type: 'SET_WELL_NAME', wellName: wellName.trim() })
    dispatch({ type: 'PROJECT_UPDATE_DATA', patch: { poco: wellName.trim() } })
    dispatch({ type: 'UPDATE_INPUTS', inputs: defaults })
    try {
      const schedule = generateSchedule(defaults as WizardInputs)
      dispatch({ type: 'SET_SCHEDULE', schedule })
    } catch { /* incomplete state */ }
  }

  const handleOpenFile = async () => {
    setOpenError(null)
    try {
      const project = await loadProjectFromFile()
      dispatch({
        type: 'LOAD_PROJECT',
        wellName: project.wellName,
        inputs: project.inputs,
        schedule: project.schedule,
        projectData: project.projectData,
        fineTuningItems: project.fineTuningItems,
      })
    } catch (err) {
      const msg = (err as Error).message
      if (msg !== 'Nenhum arquivo selecionado') setOpenError(msg)
    }
  }

  const scopeMap = opType === 'LWO' ? SCOPE_BY_PHASE_LWO : SCOPE_BY_PHASE
  const scopeOptions = phaseFilter ? scopeMap[phaseFilter] ?? [] : []
  const canGenerate = !!rigType && !!scopeId

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
              SPRINT ABAN
            </h1>
          </div>
          <p className="text-xs font-semibold tracking-[0.2em] text-[#d97706] uppercase mb-3">
            Sistema de Planejamento Responsivo de Intervenções de Abandono
          </p>
          <p className="text-slate-700 dark:text-slate-400 max-w-sm mx-auto text-sm leading-relaxed text-center">
            Geração automática de cronogramas para intervenções de abandono de poços submarinos.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setAskingWell(true)}
            className="flex items-center gap-2 px-7 py-3 bg-[#0c2340] text-white rounded-xl font-semibold tracking-wide hover:bg-[#0e3a60] transition-colors shadow-lg">
            Novo Projeto <ArrowRight size={16} />
          </button>
          <button
            onClick={handleOpenFile}
            className="flex items-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-semibold border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
            <FolderOpen size={16} /> Abrir
          </button>
          {isApiConfigured() && (
            <button
              onClick={() => setShowServer(true)}
              className="flex items-center gap-2 px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-semibold border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shadow-sm">
              <Server size={16} /> Servidor
            </button>
          )}
        </div>

        {showServer && <ServerProjectsModal onClose={() => setShowServer(false)} />}

        {openError && (
          <p className="text-xs text-red-500 font-semibold -mt-4">{openError}</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
          {[
            { icon: <FileText size={18} />, title: 'Escopos suportados', value: '11 modalidades' },
            { icon: <Settings2 size={18} />, title: 'Pacotes ABAN', value: '236+ operações' },
            { icon: <SemisubIcon size={18} />, title: 'Tipos de sonda', value: 'ANC + DP' },
          ].map(card => (
            <div key={card.title} className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm text-center">
              <div className="text-[#d97706] flex justify-center mb-2">{card.icon}</div>
              <p className="text-lg font-bold text-[#0c2340] dark:text-white">{card.value}</p>
              <p className="text-xs text-slate-700 dark:text-slate-400 mt-0.5">{card.title}</p>
            </div>
          ))}
        </div>

        {session && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {session.username} · <span className={session.role === 'admin' ? 'text-[#d97706] font-semibold' : ''}>{session.role === 'admin' ? 'admin' : 'projetista'}</span>
          </p>
        )}

        {/* Modal: nome do poço */}
        {askingWell && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => { setAskingWell(false); setWellName('') }}>
            <div onClick={e => e.stopPropagation()}
              className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
              <input
                autoFocus
                value={wellName}
                onChange={e => setWellName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleStartNew() }}
                placeholder="Nome do poço"
                className="w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0c2340] dark:focus:border-sky-700" />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setAskingWell(false); setWellName('') }}
                  className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleStartNew}
                  disabled={!wellName.trim()}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold bg-[#0c2340] text-white hover:bg-[#0e3a60] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  Continuar <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
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
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
            className="text-2xl font-bold text-[#0c2340] dark:text-white uppercase tracking-wide">
            Novo Cronograma
          </h2>
        </div>

        <div className="bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-7 space-y-6">

          {/* Posicionamento */}
          <SelGroup label="Tipo de posicionamento">
            <div className="flex gap-3">
              {(['ANC', 'DP'] as const).map(v => (
                <SelChip key={v} active={rigType === v} onClick={() => handleRigChange(v)}>
                  {v === 'ANC' ? 'Ancorada (ANC)' : 'Posicionamento Dinâmico (DP)'}
                </SelChip>
              ))}
            </div>
          </SelGroup>

          {/* Tipo de sonda */}
          {rigType === 'DP' && (
            <SelGroup label="Tipo de sonda">
              <div className="flex flex-wrap gap-3">
                {(['Generalista', 'LWO'] as const).map(v => (
                  <SelChip key={v} active={opType === v} onClick={() => handleOpChange(v)}>
                    {v === 'LWO' ? 'LWIV (NS-51 / NS-52)' : v}
                  </SelChip>
                ))}
              </div>
            </SelGroup>
          )}

          {/* Fase */}
          {rigType && (
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

          {/* Escopo */}
          {phaseFilter && scopeOptions.length > 0 && (
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
  const [showAdmin, setShowAdmin] = useState(false)
  const [showPackages, setShowPackages] = useState(false)
  const [showFlowchart, setShowFlowchart] = useState(false)
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
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-[#e4e9e3] dark:bg-slate-950">

      {/* Content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          isDark={isDark}
          onToggleDark={toggleDark}
          onOpenConfig={() => setShowAdmin(true)}
          onOpenPackages={() => setShowPackages(true)}
          onOpenFlowchart={() => setShowFlowchart(true)}
          onBeforeStepNav={handleBeforeStepNav}
          onLogout={onLogout}
        />
        {showAdmin && isAdmin() && <AdminView onClose={() => setShowAdmin(false)} />}
        {showPackages && <PackagesCatalogModal onClose={() => setShowPackages(false)} />}
        {showFlowchart && isAdmin() && <FlowchartModal onClose={() => setShowFlowchart(false)} />}

        {state.view === 'schedule' && (
          <div className="flex">
            <InputSummaryPanel />
          </div>
        )}

        <main className={`flex-1 overflow-hidden flex flex-col bg-[#e4e9e3] dark:bg-slate-950${state.view !== 'fine_tuning' ? ' p-4 md:p-8' : ''}`}>
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
