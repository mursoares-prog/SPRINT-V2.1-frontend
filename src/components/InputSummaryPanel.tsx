import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, FilePlus, FolderOpen } from 'lucide-react'
import { ServerProjectsModal } from './ServerProjectsModal'
import { useApp } from '../context/AppContext'
import { generateSchedule } from '../engines/scheduleRouter'
import { resolveScopeSections, expandScopeRefs, getCustomScopesMeta } from '../data/logicOverrideStore'
import { LogicQuestionsPanel } from './LogicQuestionsPanel'
import type { WizardInputs, FlowlineLine, ScopeId, YesContingencyNo, TmfPlugBore, IsolationPlugType, IsolationCorrMethod, FishingElement, FishingMethod, VglAction, GaugeTech, InvestigationLog, RcmaCsbPrincipal, RcmaCementPkg, TcapSurfaceFluid } from '../types'

const FISHING_ELEMENT_LABELS: Record<FishingElement, string> = {
  camisao: 'Camisão', stv_r: 'STV nipple R 2,75"', stv_f: 'STV nipple F 2,81"',
  plug_r: 'Plug nipple R 2,75"', plug_f: 'Plug nipple F 2,81"',
  brv_f: 'BRV nipple F 2,81"', brv_r: 'BRV nipple R 2,75"',
}
const FISHING_METHOD_LABELS: Record<FishingMethod, string> = {
  wireline: 'Arame', stroker: 'Perfilagem (Stroker)', ct: 'Flexitubo',
}
const FISHING_METHODS_BY_ELEMENT: Record<FishingElement, FishingMethod[]> = {
  camisao: ['wireline', 'stroker', 'ct'],
  stv_r:   ['wireline', 'stroker', 'ct'],
  stv_f:   ['wireline', 'stroker', 'ct'],
  plug_r:  ['wireline', 'stroker', 'ct'],
  plug_f:  ['wireline', 'stroker', 'ct'],
  brv_f:   ['wireline', 'stroker', 'ct'],
  brv_r:   ['wireline', 'stroker', 'ct'],
}
// Diameter groups: Camisão first, then F 2,81" → R 2,75"
const FISHING_GROUPS: { label: string; elements: FishingElement[] }[] = [
  { label: 'Outros',       elements: ['camisao'] },
  { label: 'Nipple F 2,81"', elements: ['stv_f', 'plug_f', 'brv_f'] },
  { label: 'Nipple R 2,75"', elements: ['stv_r', 'plug_r', 'brv_r'] },
]
const FISHING_ELEMENTS: FishingElement[] = ['camisao', 'stv_f', 'plug_f', 'brv_f', 'stv_r', 'plug_r', 'brv_r']
const VGL_ACTION_LABELS: Record<VglAction, string> = { remove: 'Retirar', replace: 'Substituir' }

const TECH_LABELS: Record<string, string> = { wireline: 'Arame', electric: 'Perfilagem', ct: 'Flexitubo' }
const INVESTIGATION_LOG_LABELS: Record<InvestigationLog, string> = {
  registro_pressao: 'Reg. pressão',
  fluxo_anular: 'Fluxo anular A',
  furo_cop: 'Furo na COP',
  caliper: 'Caliper',
  imageamento: 'Imageamento',
  free_point: 'Free Point',
}
const INVESTIGATION_LOG_ORDER: InvestigationLog[] = ['registro_pressao', 'fluxo_anular', 'furo_cop', 'caliper', 'imageamento', 'free_point']
const INVESTIGATION_LOG_METHODS: Record<InvestigationLog, ('wireline' | 'electric' | 'ct')[]> = {
  registro_pressao: ['wireline', 'electric', 'ct'],
  fluxo_anular: ['electric', 'ct'],
  furo_cop: ['electric', 'ct'],
  caliper: [],
  imageamento: [],
  free_point: [],
}
const RCMA_CEMENT_PKG_ORDER: RcmaCementPkg[] = ['ABAN 159', 'ABAN 160', 'ABAN 078', 'ABAN 079', 'ABAN 080', 'ABAN 081', 'ABAN 082', 'ABAN 083', 'ABAN 084']
const RCMA_CEMENT_PKG_LABELS: Record<RcmaCementPkg, string> = {
  'ABAN 159': 'FT — Cim. Int. COP (form. não isolada)',
  'ABAN 160': 'FT — Cim. Int. revest. a mar aberto',
  'ABAN 078': 'BD — Obt. reserv. c/ tampões (combate perda)',
  'ABAN 079': 'BD — Obt. reserv. + fluido eCSB',
  'ABAN 080': 'BD — Cim. COP',
  'ABAN 081': 'BD — Cim. Form + COP + Anular A (parâm.)',
  'ABAN 082': 'BD — Cim. Form + COP + Anular A (perfil.)',
  'ABAN 083': 'BD — Cim. COP + Anular A (parâm.)',
  'ABAN 084': 'BD — Cim. COP + Anular A (perfil.)',
}

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
  const [editing, setEditing] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1400)
  const [showProjectsModal, setShowProjectsModal] = useState(false)

  const apply = (data: Partial<WizardInputs>, autoClose = true) => {
    const merged = { ...inputs, ...data } as WizardInputs
    dispatch({ type: 'UPDATE_INPUTS', inputs: data })
    try {
      const schedule = generateSchedule(merged)
      dispatch({ type: 'UPDATE_SCHEDULE', schedule })
    } catch { /* invalid/incomplete state */ }
    if (autoClose) setEditing(null)
  }

  const toggleLine = (line: FlowlineLine) => {
    const curr = inputs.flowlineLines ?? []
    const updated = curr.includes(line) ? curr.filter(x => x !== line) : [...curr, line]
    apply({ flowlineLines: updated }, false)
  }

  const toggleHydrateLine = (line: FlowlineLine) => {
    const curr = inputs.flowlineHydrateLines ?? []
    const updated = curr.includes(line) ? curr.filter(x => x !== line) : [...curr, line]
    apply({ flowlineHydrateLines: updated }, false)
  }

  const edit = (key: string) => setEditing(prev => prev === key ? null : key)
  const isEd = (key: string) => editing === key

  const ync = (v?: string) => v === 'yes' ? 'Sim' : v === 'contingency' ? 'Conting.' : v === 'no' ? 'Não' : '—'
  const YNC_OPTIONS = [
    { value: 'yes', label: 'Sim' },
    { value: 'contingency', label: 'Contingência' },
    { value: 'no', label: 'Não' },
  ]

  // Derived flags (mirrors Wizard logic)
  const isFS2      = inputs.scopeId?.startsWith('FS2') ?? false
  const isTT       = inputs.scopeId === 'FSU_TT_FT' || inputs.scopeId === 'FSU_TT_BDC'
  const isTTFT     = inputs.scopeId === 'FSU_TT_FT'
  const isTTBDC    = inputs.scopeId === 'FSU_TT_BDC'
  const isFS1Mec   = inputs.scopeId === 'FS1_Mec'
  const isConvBOP  = inputs.scopeId === 'FSU_Conv_BOP'
  const isConvRCMA   = inputs.scopeId === 'FSU_Conv_RCMA'
  const usesFs1Barrier = isFS1Mec || isConvBOP || isConvRCMA
    || inputs.scopeId === 'FSU_Sup_COP' || inputs.scopeId === 'FSU_Sup_PWC'
  const rcmaFluidCsb   = isConvRCMA && inputs.rcmaCsbPrincipal === 'fluid_csb'
  const isSupPWC      = inputs.scopeId === 'FSU_Sup_PWC' || inputs.scopeId === 'FS2_Sup_PWC'
  const isSupScope    = ['FSU_Sup_COP', 'FSU_Sup_PWC', 'FS2_Sup_COP', 'FS2_Sup_PWC'].includes(inputs.scopeId ?? '')
  const isRCMA        = inputs.scopeId === 'FSU_Conv_RCMA' || inputs.scopeId === 'FS2_Conv_RCMA'
  const hasBopCement  = isFS2 || ['FSU_Conv_BOP', 'FSU_Sup_COP', 'FSU_Sup_PWC', 'FSU_Conv_RCMA'].includes(inputs.scopeId ?? '')
  const hasBop        = isFS2 || ['FSU_Conv_BOP', 'FSU_Sup_COP', 'FSU_Sup_PWC'].includes(inputs.scopeId ?? '')
  const isLWO      = inputs.operationType === 'LWO'
  const hasTC      = (inputs.subseaEquipments ?? []).includes('tree_cap')
  const hasCC      = (inputs.subseaEquipments ?? []).includes('corrosion_cap')
  const hasRetrieval = ['FSU_Conv_BOP', 'FSU_Conv_RCMA', 'FSU_Sup_COP', 'FSU_Sup_PWC', 'FS1_Mec'].includes(inputs.scopeId ?? '')
  const hasCement  = inputs.scopeId && inputs.scopeId !== 'FSU_TT_FT'
  const showLog    = isTTFT && !!inputs.ttFtCementMode
  const hasCamisao = (inputs.installCamisao ?? []).some(v => v === 'yes' || v === 'contingency')
const showRemoveANM = isTT || isFS1Mec

  const isLWIV = inputs.operationType === 'LWO'
  const ccapEffectiveMethod = inputs.ccapRemovalMethod ?? (isLWIV ? 'cable' : 'workstring')
  const isCustomScope = !!inputs.scopeId && !(inputs.scopeId in SCOPE_SHORT)
  // Engine 'flowchart' (escopos bundle): substitui o painel wizard pelas perguntas do
  // fluxograma do editor de lógica — idênticas e na mesma ordem do fluxograma.
  const flowStrict = !isCustomScope && (inputs.engineMode ?? 'flowchart') === 'flowchart'
  const useFlowQuestions = isCustomScope || flowStrict
  // Expande seções `ref` (reuso vivo) para que as perguntas/seções do fluxograma incluído
  // (ex.: MOB_descida) também apareçam no passo 2 — mesma expansão usada na geração.
  const customSecs = useFlowQuestions
    ? expandScopeRefs(resolveScopeSections(inputs.scopeId!))
    : null
  const customScopeLabel = isCustomScope
    ? (getCustomScopesMeta().find(s => s.scopeId === inputs.scopeId)?.label ?? inputs.scopeId)
    : null
  const cSecIds = new Set(customSecs?.map(s => s.id) ?? [])
  const hasSec = (...ids: string[]) => !isCustomScope || ids.some(id => cSecIds.has(id))
  const hasSecPhase = (phase: string) => !isCustomScope || (customSecs?.some(s => s.phase === phase) ?? false)

  const scopeOpts = ALL_SCOPE_OPTS.filter(o => !isLWO || LWO_SCOPES.has(o.value))

  if (collapsed && !onClose) {
    return (
      <aside className="w-8 shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex flex-col items-center overflow-hidden">
        <button
          onClick={() => setCollapsed(false)}
          title="Expandir painel de abandono"
          className="flex-1 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors w-full">
          <ChevronRight size={14} />
        </button>
      </aside>
    )
  }

  return (
    <aside className={`${onClose ? 'flex-1' : 'w-96 shrink-0'} border-r border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex flex-col overflow-hidden`}>
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest">Painel de Intervenção</span>
        <div className="flex items-center gap-0.5">
          {!onClose && (
            <button onClick={() => setCollapsed(true)}
              title="Recolher painel"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              <ChevronLeft size={14} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-custom">

        {/* ── Sonda e Escopo ── */}
        <Section label="Sonda e Escopo">
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
                options={[
                  { value: 'PA',      label: 'PA' },
                  { value: 'SPH',     label: 'SPH' },
                  { value: 'SM',      label: 'SM' },
                  { value: 'SPM',     label: 'SPM' },
                  { value: 'Rigless', label: 'Rigless' },
                ]}
                value={inputs.rigType ?? ''}
                onChange={v => apply({ rigType: v as 'PA' | 'SPH' | 'SM' | 'SPM' | 'Rigless' })}
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

          {!isCustomScope && (
            <Row label="Engine de perguntas"
              tooltip="Origem das perguntas desta etapa: Árvores de Lógica, painel wizard, ou nenhum (iniciar direto na etapa 3)"
              value={flowStrict ? 'Árvores de Lógica' : inputs.engineMode === 'none' ? 'Não' : 'Padrão'}
              isEditing={isEd('engineMode')} onEdit={() => edit('engineMode')}>
              <InlineRadio
                options={[
                  { value: 'flowchart', label: 'Árvores de Lógica (padrão)' },
                  { value: 'wizard',    label: 'Padrão (painel wizard)' },
                  { value: 'none',      label: 'Não' },
                ]}
                value={inputs.engineMode ?? 'flowchart'}
                onChange={v => apply({ engineMode: v as WizardInputs['engineMode'] })}
              />
              {inputs.engineMode === 'none' && (
                <div className="mt-2 flex flex-col gap-1.5">
                  <button
                    onClick={() => dispatch({ type: 'ENTER_FINE_TUNING_BLANK' })}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors text-xs font-semibold">
                    <FilePlus size={13} /> Cronograma em branco
                  </button>
                  <button
                    onClick={() => setShowProjectsModal(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors text-xs font-semibold">
                    <FolderOpen size={13} /> Copiar de projeto
                  </button>
                </div>
              )}
            </Row>
          )}
        </Section>

        {!isCustomScope && !flowStrict && <>

        {/* ── Fase 0 — Mobilização (só existe quando há TCap, Fase Única / Fase 1) ── */}
        {inputs.rigType && inputs.scopeId && !isFS2 && hasTC && hasSecPhase('Fase 0') && (
          <Section label="Fase 0" accent="border-amber-400 dark:border-amber-600">
            {inputs.rigType === 'DP' && (
              <Row label="Transponder"
                tooltip="Modo de instalação do transponder acústico: por COT (com garateia) ou por ROV"
                value={inputs.transponderMode === 'cot' ? 'COT' : inputs.transponderMode === 'rov' ? 'ROV' : '—'}
                isEditing={isEd('transponder')} onEdit={() => edit('transponder')}>
                <InlineRadio
                  options={[{ value: 'cot', label: 'COT + garateia' }, { value: 'rov', label: 'ROV' }]}
                  value={inputs.transponderMode ?? ''}
                  onChange={v => apply({ transponderMode: v as WizardInputs['transponderMode'] })}
                />
              </Row>
            )}

            {inputs.rigType === 'DP' && (
              <Row label="Navegar com CWO no fundo?"
                tooltip="A sonda navegou para o local com CWO (conjunto de WO) instalado no fundo? (ABAN 004 em vez de ABAN 003)"
                value={inputs.dmmWithEquipment === true ? 'Sim' : inputs.dmmWithEquipment === false ? 'Não' : '—'}
                isEditing={isEd('dmmEquip')} onEdit={() => edit('dmmEquip')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={inputs.dmmWithEquipment === true ? 'yes' : inputs.dmmWithEquipment === false ? 'no' : ''}
                  onChange={v => apply({ dmmWithEquipment: v === 'yes' })}
                />
              </Row>
            )}

            <Row label="Retirar CCAP?"
              tooltip="Existe CCAP (Corrosion Cap) instalada no poço que precisa ser retirada no início da intervenção?"
              value={ync(inputs.contingencyCcapWorkstring)}
              isEditing={isEd('equipCCAP')} onEdit={() => edit('equipCCAP')}>
              <InlineRadio
                options={YNC_OPTIONS}
                value={inputs.contingencyCcapWorkstring ?? ''}
                onChange={v => {
                  const curr = inputs.subseaEquipments ?? []
                  const isYes = v === 'yes' || v === 'contingency'
                  apply({
                    contingencyCcapWorkstring: v as YesContingencyNo,
                    subseaEquipments: isYes
                      ? (curr.includes('corrosion_cap') ? curr : [...curr, 'corrosion_cap'])
                      : curr.filter(x => x !== 'corrosion_cap'),
                    ...(!isYes && { ccapRemovalMethod: undefined }),
                  })
                }}
              />
            </Row>

            {hasCC && (
              <Row label="Método CCAP"
                tooltip="Método de retirada da CCAP: com coluna de trabalho e garatéia (ABAN 008) ou a cabo (ABAN 009)"
                value={ccapEffectiveMethod === 'cable' ? 'Cabo' : 'Coluna'}
                isEditing={isEd('ccapMethod')} onEdit={() => edit('ccapMethod')}>
                <InlineRadio
                  options={[{ value: 'workstring', label: 'Coluna' }, { value: 'cable', label: 'Cabo' }]}
                  value={ccapEffectiveMethod}
                  onChange={v => apply({ ccapRemovalMethod: v as 'workstring' | 'cable' })}
                />
              </Row>
            )}

            <Row label="Retirar Tree Cap?"
              tooltip="Existe Tree Cap convencional instalado no poço que precisa ser retirado no início da intervenção?"
              value={hasTC ? 'Sim' : 'Não'}
              isEditing={isEd('equipTC')} onEdit={() => edit('equipTC')}>
              <InlineRadio
                options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                value={hasTC ? 'yes' : 'no'}
                onChange={v => {
                  const curr = inputs.subseaEquipments ?? []
                  apply({ subseaEquipments: v === 'yes'
                    ? (curr.includes('tree_cap') ? curr : [...curr, 'tree_cap'])
                    : curr.filter(x => x !== 'tree_cap') }, false)
                }}
              />
            </Row>

            {hasTC && (
              <Row label="Método Tree Cap"
                tooltip="Método de retirada da TCap: pela coluna de WO (desce TRT+CWO, desassenta e fundeia/sobe — ABAN 211) ou diretamente pelo ROV durante a mobilização (ABAN 010)"
                value={inputs.tcapRemovalMethod === 'rov' ? 'ROV' : inputs.tcapRemovalMethod === 'workstring' ? 'TRT' : '—'}
                isEditing={isEd('tcapMethod')} onEdit={() => edit('tcapMethod')}>
                <InlineRadio
                  options={[{ value: 'workstring', label: 'TRT' }, { value: 'rov', label: 'ROV' }]}
                  value={inputs.tcapRemovalMethod ?? ''}
                  onChange={v => apply({ tcapRemovalMethod: v as WizardInputs['tcapRemovalMethod'] })}
                />
              </Row>
            )}

            {hasTC && inputs.tcapRemovalMethod !== 'rov' && (
              <Row label="Destino TCap"
                tooltip="Destino da TCap após desassentamento: fundear no leito marinho ou retirar até a superfície?"
                value={inputs.tcapDisposition === 'bottom' ? 'Fundeio' : inputs.tcapDisposition === 'surface' ? 'Superfície' : '—'}
                isEditing={isEd('tcapDisp')} onEdit={() => edit('tcapDisp')}>
                <InlineRadio
                  options={[{ value: 'bottom', label: 'Fundeio' }, { value: 'surface', label: 'Superfície' }]}
                  value={inputs.tcapDisposition ?? ''}
                  onChange={v => apply({ tcapDisposition: v as WizardInputs['tcapDisposition'] })}
                />
              </Row>
            )}

            {hasTC && inputs.tcapRemovalMethod !== 'rov' && inputs.tcapDisposition === 'surface' && (
              <Row label="Fluido DPR/HCR c/ TCap na sup."
                tooltip="Fluido posicionado no DPR/HCR após subida da TCap à superfície: N₂ (desalagamento), fluido inibido pré-conexão (ABAN 215/209) ou fluido inibido pós-conexão (ABAN 216/217 — após reconexão)"
                value={inputs.tcapSurfaceFluid === 'inhibited_pre' ? 'Inibido pré-conex.' : inputs.tcapSurfaceFluid === 'inhibited_post' ? 'Inibido pós-conex.' : 'N₂'}
                isEditing={isEd('tcapSurfFluid')} onEdit={() => edit('tcapSurfFluid')}>
                <InlineRadio
                  options={[
                    { value: 'n2',            label: 'N₂ (desalagamento)' },
                    { value: 'inhibited_pre',  label: 'Inibido pré-conexão (ABAN 215/209)' },
                    { value: 'inhibited_post', label: 'Inibido pós-conexão (ABAN 216/217)' },
                  ]}
                  value={inputs.tcapSurfaceFluid ?? 'n2'}
                  onChange={v => apply({ tcapSurfaceFluid: v as TcapSurfaceFluid })}
                />
              </Row>
            )}

            {inputs.tcapRemovalMethod !== 'rov' && (
              <Row label="Hidrato conector Tree Cap?"
                tooltip="Prever dissociação de hidrato no conector da TCap com jateamento de água aquecida (ABAN 177), após desassentamento"
                value={ync(inputs.contingencyTcapHydrate)}
                isEditing={isEd('tcapHyd')} onEdit={() => edit('tcapHyd')}>
                <InlineRadio
                  options={YNC_OPTIONS}
                  value={inputs.contingencyTcapHydrate ?? ''}
                  onChange={v => apply({ contingencyTcapHydrate: v as YesContingencyNo })}
                />
              </Row>
            )}
          </Section>
        )}

        {/* ── Fase 1A — Operações de Abandono ── */}
        {inputs.rigType && inputs.scopeId && !isFS2 && hasSecPhase('Fase 1A') && (
          <Section label="Fase 1A" accent="border-sky-500 dark:border-sky-600">
            {/* Sem TCap: mobilização é Fase 1A, itens ficam aqui */}
            {!hasTC && hasSec('mob') && (
              <>
                {inputs.rigType === 'DP' && (
                  <Row label="Transponder"
                    tooltip="Modo de instalação do transponder acústico: por COT (com garateia) ou por ROV"
                    value={inputs.transponderMode === 'cot' ? 'COT' : inputs.transponderMode === 'rov' ? 'ROV' : '—'}
                    isEditing={isEd('transponder')} onEdit={() => edit('transponder')}>
                    <InlineRadio
                      options={[{ value: 'cot', label: 'COT + garateia' }, { value: 'rov', label: 'ROV' }]}
                      value={inputs.transponderMode ?? ''}
                      onChange={v => apply({ transponderMode: v as WizardInputs['transponderMode'] })}
                    />
                  </Row>
                )}

                {inputs.rigType === 'DP' && (
                  <Row label="Navegar com CWO no fundo?"
                    tooltip="A sonda navegou para o local com CWO (conjunto de WO) instalado no fundo? (ABAN 004 em vez de ABAN 003)"
                    value={inputs.dmmWithEquipment === true ? 'Sim' : inputs.dmmWithEquipment === false ? 'Não' : '—'}
                    isEditing={isEd('dmmEquip')} onEdit={() => edit('dmmEquip')}>
                    <InlineRadio
                      options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                      value={inputs.dmmWithEquipment === true ? 'yes' : inputs.dmmWithEquipment === false ? 'no' : ''}
                      onChange={v => apply({ dmmWithEquipment: v === 'yes' })}
                    />
                  </Row>
                )}

                <Row label="Retirar CCAP?"
                  tooltip="Existe CCAP (Corrosion Cap) instalada no poço que precisa ser retirada no início da intervenção?"
                  value={ync(inputs.contingencyCcapWorkstring)}
                  isEditing={isEd('equipCCAP')} onEdit={() => edit('equipCCAP')}>
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.contingencyCcapWorkstring ?? ''}
                    onChange={v => {
                      const curr = inputs.subseaEquipments ?? []
                      const isYes = v === 'yes' || v === 'contingency'
                      apply({
                        contingencyCcapWorkstring: v as YesContingencyNo,
                        subseaEquipments: isYes
                          ? (curr.includes('corrosion_cap') ? curr : [...curr, 'corrosion_cap'])
                          : curr.filter(x => x !== 'corrosion_cap'),
                        ...(!isYes && { ccapRemovalMethod: undefined }),
                      })
                    }}
                  />
                </Row>

                {hasCC && (
                  <Row label="Método CCAP"
                    tooltip="Método de retirada da CCAP: com coluna de trabalho e garatéia (ABAN 008) ou a cabo (ABAN 009)"
                    value={ccapEffectiveMethod === 'cable' ? 'Cabo' : 'Coluna'}
                    isEditing={isEd('ccapMethod')} onEdit={() => edit('ccapMethod')}>
                    <InlineRadio
                      options={[{ value: 'workstring', label: 'Coluna' }, { value: 'cable', label: 'Cabo' }]}
                      value={ccapEffectiveMethod}
                      onChange={v => apply({ ccapRemovalMethod: v as 'workstring' | 'cable' })}
                    />
                  </Row>
                )}
              </>
            )}

            {hasSec('mob', 'desc') && (
              <Row label={inputs.rigType === 'DP' ? 'Fluido no DPR/HCR' : 'Fluido no riser dual bore'}
                tooltip="Fluido de posicionamento no riser de WO após a descida do conjunto (N₂ ou fluido inibido)"
                value={inputs.riserFluid === 'n2' ? 'N₂' : inputs.riserFluid === 'inhibited' ? 'Inibido' : '—'}
                isEditing={isEd('riserFluid')} onEdit={() => edit('riserFluid')}>
                <InlineRadio
                  options={[{ value: 'n2', label: 'N₂' }, { value: 'inhibited', label: 'Inibido' }]}
                  value={inputs.riserFluid ?? ''}
                  onChange={v => apply({ riserFluid: v as WizardInputs['riserFluid'] })}
                />
              </Row>
            )}

            {hasSec('mob', 'conexao') && (<>
            <Row label="Retirar plug do TMF?"
              tooltip="Existe plug instalado no TMF (Tree Manifold — topo da ANM) que precisa ser recuperado no início da intervenção?"
              value={inputs.hasTmfPlug === true ? 'Sim' : inputs.hasTmfPlug === false ? 'Não' : '—'}
              isEditing={isEd('hasTmfPlug')} onEdit={() => edit('hasTmfPlug')}>
              <InlineRadio
                options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                value={inputs.hasTmfPlug === true ? 'yes' : inputs.hasTmfPlug === false ? 'no' : ''}
                onChange={v => apply({ hasTmfPlug: v === 'yes', tmfPlugBores: v === 'no' ? undefined : inputs.tmfPlugBores })}
              />
            </Row>

            {inputs.hasTmfPlug && (
              <Row label="Bore(s) plug TMF"
                tooltip="Em qual(is) bore(s) o plug do TMF está instalado? (seleção múltipla)"
                value={(inputs.tmfPlugBores ?? []).map(b => b === 'production' ? 'Produção' : 'Anular').join(', ') || '—'}
                isEditing={isEd('tmfBore')} onEdit={() => edit('tmfBore')}>
                <InlineCheckboxes
                  options={[
                    { value: 'production', label: 'Bore de produção' },
                    ...(inputs.rigType === 'ANC' ? [{ value: 'annular', label: 'Bore anular' }] : []),
                  ]}
                  values={inputs.tmfPlugBores ?? []}
                  onToggle={v => {
                    const curr = inputs.tmfPlugBores ?? []
                    const key = v as TmfPlugBore
                    const next = curr.includes(key) ? curr.filter(x => x !== key) : [...curr, key]
                    apply({ tmfPlugBores: next.length ? next : undefined }, false)
                  }}
                />
              </Row>
            )}

            {inputs.hasTmfPlug && (inputs.tmfPlugBores ?? []).includes('production') && (
              <Row label={(inputs.tmfPlugBores ?? []).includes('annular') ? 'Conting. plug TMF — Prod.' : 'Conting. plug TMF'}
                tooltip="Prever contingência de retirada do plug do TMF (bore de produção) por método alternativo caso o arame convencional não seja suficiente"
                value={(inputs.tmfPlugContingencyProd ?? []).map(m => m === 'stroker' ? 'Perfilagem (Stroker)' : 'Flexitubo').join(', ') || 'Não'}
                isEditing={isEd('tmfPlugContingProd')} onEdit={() => edit('tmfPlugContingProd')}>
                <InlineCheckboxes
                  options={[
                    { value: 'stroker', label: 'Perfilagem (Stroker)' },
                    { value: 'ft',      label: 'Flexitubo' },
                  ]}
                  values={inputs.tmfPlugContingencyProd ?? []}
                  onToggle={v => {
                    const curr = inputs.tmfPlugContingencyProd ?? []
                    const next = curr.includes(v as 'stroker' | 'ft') ? curr.filter(x => x !== v) : [...curr, v as 'stroker' | 'ft']
                    apply({ tmfPlugContingencyProd: next.length ? next : undefined }, false)
                  }}
                />
              </Row>
            )}

            {inputs.rigType === 'ANC' && inputs.hasTmfPlug && (inputs.tmfPlugBores ?? []).includes('annular') && (
              <Row label={(inputs.tmfPlugBores ?? []).includes('production') ? 'Conting. plug TMF — Anu.' : 'Conting. plug TMF'}
                tooltip="Prever contingência de retirada do plug do TMF (bore de anular) por método alternativo caso o arame convencional não seja suficiente"
                value={(inputs.tmfPlugContingencyAnul ?? []).map(m => m === 'stroker' ? 'Perfilagem (Stroker)' : 'Flexitubo').join(', ') || 'Não'}
                isEditing={isEd('tmfPlugContingAnul')} onEdit={() => edit('tmfPlugContingAnul')}>
                <InlineCheckboxes
                  options={[
                    { value: 'stroker', label: 'Perfilagem (Stroker)' },
                    { value: 'ft',      label: 'Flexitubo' },
                  ]}
                  values={inputs.tmfPlugContingencyAnul ?? []}
                  onToggle={v => {
                    const curr = inputs.tmfPlugContingencyAnul ?? []
                    const next = curr.includes(v as 'stroker' | 'ft') ? curr.filter(x => x !== v) : [...curr, v as 'stroker' | 'ft']
                    apply({ tmfPlugContingencyAnul: next.length ? next : undefined }, false)
                  }}
                />
              </Row>
            )}

            <Row label="Retirar plug do TH?"
              tooltip="Existe plug instalado no TH (Tubing Hanger) que precisa ser recuperado no início da intervenção?"
              value={inputs.hasThPlug === true ? 'Sim' : inputs.hasThPlug === false ? 'Não' : '—'}
              isEditing={isEd('hasThPlug')} onEdit={() => edit('hasThPlug')}>
              <InlineRadio
                options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                value={inputs.hasThPlug === true ? 'yes' : inputs.hasThPlug === false ? 'no' : ''}
                onChange={v => apply({ hasThPlug: v === 'yes', thPlugContingency: v === 'no' ? undefined : inputs.thPlugContingency })}
              />
            </Row>

            {inputs.hasThPlug && (
              <Row label="Conting. plug TH"
                tooltip="Prever contingência de retirada do plug do TH por método alternativo caso o arame convencional não seja suficiente (stroker e/ou FT)"
                value={(inputs.thPlugContingency ?? []).map(m => m === 'stroker' ? 'Perfilagem (Stroker)' : 'Flexitubo').join(', ') || 'Não'}
                isEditing={isEd('thPlugConting')} onEdit={() => edit('thPlugConting')}>
                <InlineCheckboxes
                  options={[
                    { value: 'stroker', label: 'Perfilagem (Stroker)' },
                    { value: 'ft',      label: 'Flexitubo' },
                  ]}
                  values={inputs.thPlugContingency ?? []}
                  onToggle={v => {
                    const curr = inputs.thPlugContingency ?? []
                    const next = curr.includes(v as 'stroker' | 'ft')
                      ? curr.filter(x => x !== v)
                      : [...curr, v as 'stroker' | 'ft']
                    apply({ thPlugContingency: next.length ? next : undefined }, false)
                  }}
                />
              </Row>
            )}

            <Row label="Hidrato na ANM?"
              tooltip="Prever contingências de hidrato na ANM após teste funcional: dissociação direta (ABAN 165/166/169/170) ou jateamento FT (ABAN 125)"
              value={ync(inputs.anmHydrate)}
              isEditing={isEd('anmValve')} onEdit={() => edit('anmValve')}>
              <div className="space-y-2">
                <InlineRadio
                  options={YNC_OPTIONS}
                  value={inputs.anmHydrate ?? ''}
                  onChange={v => apply({
                    anmHydrate: v as YesContingencyNo,
                    anmValveContingency: v === 'no' ? undefined : inputs.anmValveContingency,
                  }, v === 'no')}
                />
                {(inputs.anmHydrate === 'yes' || inputs.anmHydrate === 'contingency') && (
                  <div className="ml-2 border-l-2 border-gray-200 pl-2">
                    <InlineCheckboxes
                      options={[
                        { value: 'hydrate',    label: 'Dissociação de hidrato' },
                        { value: 'jateamento', label: 'Jateamento com FT (ABAN 125)' },
                      ]}
                      values={inputs.anmValveContingency ?? []}
                      onToggle={v => {
                        const curr = inputs.anmValveContingency ?? []
                        const key = v as 'hydrate' | 'jateamento'
                        const next = curr.includes(key) ? curr.filter(x => x !== key) : [...curr, key]
                        apply({ anmValveContingency: next.length ? next : undefined }, false)
                      }}
                    />
                  </div>
                )}
              </div>
            </Row>

            <Row label="Abrir válvula da ANM com FT?"
              tooltip="Prever operação de abertura de válvula da ANM via flexitubo: com martelete (ABAN 143) ou motor de fundo e broca (ABAN 124)"
              value={ync(inputs.anmForceOpen)}
              isEditing={isEd('anmForce')} onEdit={() => edit('anmForce')}>
              <div className="space-y-2">
                <InlineRadio
                  options={YNC_OPTIONS}
                  value={inputs.anmForceOpen ?? ''}
                  onChange={v => apply({
                    anmForceOpen: v as YesContingencyNo,
                    anmForceMethod: v === 'no' ? undefined : inputs.anmForceMethod,
                  }, v === 'no')}
                />
                {(inputs.anmForceOpen === 'yes' || inputs.anmForceOpen === 'contingency') && (
                  <div className="ml-2 border-l-2 border-gray-200 pl-2">
                    <InlineCheckboxes
                      options={[
                        { value: 'hammer',     label: 'Martelete (ABAN 143)' },
                        { value: 'motor_broca', label: 'Motor de fundo e broca (ABAN 124)' },
                      ]}
                      values={inputs.anmForceMethod ?? []}
                      onToggle={v => {
                        const curr = inputs.anmForceMethod ?? []
                        const key = v as 'hammer' | 'motor_broca'
                        const next = curr.includes(key) ? curr.filter(x => x !== key) : [...curr, key]
                        apply({ anmForceMethod: next.length ? next : undefined }, false)
                      }}
                    />
                  </div>
                )}
              </div>
            </Row>
            </>)}

            {hasSec('gab', 'limp') && (<>
            <Row label="Amortecer?"
              tooltip="Amortecimento do poço na Fase 1A (COP/COI ABAN 061/062/219, anular A ABAN 063/064/065 e anular A pós-canhoneio ABAN 255). 'Não' = poço já isolado: dispensa amortecimento e confirma a estanqueidade do poço (ABAN 226) no lugar da despressurização do anular A. 'Contingência' = testa a estanqueidade antes (ABAN 226) e prevê o amortecimento apenas como contingência."
              value={ync(inputs.killWellFase1A ?? 'yes')}
              isEditing={isEd('killWellFase1A')} onEdit={() => edit('killWellFase1A')}>
              <InlineRadio
                options={YNC_OPTIONS}
                value={inputs.killWellFase1A ?? 'yes'}
                onChange={v => apply({ killWellFase1A: v as YesContingencyNo })}
              />
            </Row>

            <Row label="E.O. anular A"
              tooltip="Há restrição de pressão mínima no anular A na profundidade da ANM que exija operação de top kill para preenchimento?"
              value={inputs.anularAMinPressure === 'zero' ? 'Drenar a zero' : inputs.anularAMinPressure === 'nonzero' ? 'Top kill' : '—'}
              isEditing={isEd('anularA')} onEdit={() => edit('anularA')}>
              <InlineRadio
                options={[
                  { value: 'zero',    label: 'Drenar a zero' },
                  { value: 'nonzero', label: 'Top kill' },
                ]}
                value={inputs.anularAMinPressure ?? ''}
                onChange={v => apply({ anularAMinPressure: v as 'zero' | 'nonzero' })}
              />
            </Row>

            {inputs.anularAMinPressure === 'nonzero' && (
              <Row label="Fluido top kill anular A"
                tooltip="Fluido utilizado no preenchimento do anular A durante a operação de top kill (ABAN 064 diesel / ABAN 065 MEG+FCBA)"
                value={inputs.anularFluid === 'diesel' ? 'Diesel' : inputs.anularFluid === 'inhibited' ? 'MEG+FCBA' : inputs.anularFluid === 'diesel_fcba' ? 'Diesel+FCBA' : '—'}
                isEditing={isEd('anularFluid')} onEdit={() => edit('anularFluid')}>
                <InlineRadio
                  options={[
                    { value: 'diesel_fcba', label: 'Diesel + FCBA' },
                    { value: 'diesel',      label: 'Diesel' },
                    { value: 'inhibited',   label: 'Fluido inibido (MEG + FCBA)' },
                  ]}
                  value={inputs.anularFluid ?? ''}
                  onChange={v => apply({ anularFluid: v as WizardInputs['anularFluid'] })}
                />
              </Row>
            )}

            <Row label="Fluido amort. anular A"
              tooltip="Fluido utilizado no bombeio de amortecimento do anular A após canhoneio da COP (pacote ABAN 255 — bullheading FCBA)"
              value={inputs.amortAnularFluid === 'diesel' ? 'Diesel' : inputs.amortAnularFluid === 'inhibited' ? 'MEG+FCBA' : inputs.amortAnularFluid === 'diesel_fcba' ? 'Diesel+FCBA' : '—'}
              isEditing={isEd('amortAnularFluid')} onEdit={() => edit('amortAnularFluid')}>
              <InlineRadio
                options={[
                  { value: 'diesel_fcba', label: 'Diesel + FCBA' },
                  { value: 'diesel',      label: 'Diesel' },
                  { value: 'inhibited',   label: 'Fluido inibido (MEG + FCBA)' },
                ]}
                value={inputs.amortAnularFluid ?? ''}
                onChange={v => apply({ amortAnularFluid: v as WizardInputs['amortAnularFluid'] })}
              />
            </Row>

            {(() => {
              const lockedDiesel = (inputs.installCamisao ?? []).includes('contingency')
              return (
                <Row label="Fluido amort. COP/COI"
                  tooltip={lockedDiesel
                    ? 'Fixado em Diesel+FCBA: camisão contingencial requer amortecimento em diesel para teste de funcionalidade da DHSV'
                    : 'Fluido utilizado na operação de limpeza e amortecimento da COP/COI (preenchimento inicial da coluna)'}
                  value={lockedDiesel ? 'Diesel+FCBA (fixado)' : inputs.initialFillFluid === 'diesel_fcba' ? 'Diesel+FCBA' : inputs.initialFillFluid === 'inhibited' ? 'MEG+FCBA' : inputs.initialFillFluid === 'diesel' ? 'Diesel' : '—'}
                  isEditing={!lockedDiesel && isEd('fillFluid')} onEdit={() => !lockedDiesel && edit('fillFluid')}>
                  <InlineRadio
                    options={[
                      { value: 'diesel_fcba', label: 'Diesel + FCBA' },
                      { value: 'inhibited',   label: 'Inibido (MEG+FCBA)' },
                      { value: 'diesel',      label: 'Diesel' },
                    ]}
                    value={inputs.initialFillFluid ?? ''}
                    onChange={v => apply({ initialFillFluid: v as WizardInputs['initialFillFluid'] })}
                  />
                </Row>
              )
            })()}
            </>)}

            {hasSec('gab') && (<>
            <Row label="Instalar camisão DHSV/BRV?"
              tooltip="Instalar camisão na DHSV ou BRV. Selecione Sim e/ou Contingência simultaneamente para prever instalação contingencial após teste da DHSV."
              value={
                hasCamisao && inputs.camisaoMethod
                  ? `${(inputs.installCamisao ?? []).filter(v => v !== 'no').map(v => v === 'yes' ? 'Sim' : 'Conting.').join(' + ')} (${inputs.camisaoMethod === 'wireline' ? 'Arame' : 'Flexitubo'})`
                  : hasCamisao
                    ? (inputs.installCamisao ?? []).filter(v => v !== 'no').map(v => v === 'yes' ? 'Sim' : 'Conting.').join(' + ')
                    : 'Não'
              }
              isEditing={isEd('camisao')} onEdit={() => edit('camisao')}>
              <div className="space-y-2">
                <InlineCheckboxes
                  options={[
                    { value: 'yes',         label: 'Sim' },
                    { value: 'contingency', label: 'Contingência' },
                    { value: 'no',          label: 'Não' },
                  ]}
                  values={inputs.installCamisao ?? []}
                  onToggle={v => {
                    const curr = inputs.installCamisao ?? []
                    if (v === 'no') {
                      const next = curr.includes('no') ? curr.filter(x => x !== 'no') : ['no']
                      apply({ installCamisao: next as ('yes' | 'contingency' | 'no')[], camisaoMethod: undefined }, false)
                    } else {
                      const withoutNo = curr.filter(x => x !== 'no')
                      const next = withoutNo.includes(v as 'yes' | 'contingency')
                        ? withoutNo.filter(x => x !== v)
                        : [...withoutNo, v as 'yes' | 'contingency']
                      const addingConting = v === 'contingency' && !withoutNo.includes('contingency')
                      apply({
                        installCamisao: next.length ? next : undefined,
                        camisaoMethod: next.length ? inputs.camisaoMethod : undefined,
                        ...(addingConting ? { initialFillFluid: 'diesel_fcba' } : {}),
                      }, false)
                    }
                  }}
                />
                {hasCamisao && (
                  <div className="ml-2 border-l-2 border-gray-200 pl-2">
                    <p className="text-xs font-medium text-gray-500 mb-1">Tecnologia</p>
                    <InlineRadio
                      options={[
                        { value: 'wireline', label: 'Arame' },
                        { value: 'ct',       label: 'Flexitubo' },
                      ]}
                      value={inputs.camisaoMethod ?? ''}
                      onChange={v => apply({ camisaoMethod: v as WizardInputs['camisaoMethod'] })}
                    />
                  </div>
                )}
              </div>
            </Row>

            <Row label="Gabaritar coluna?"
              tooltip="Tecnologia para gabaritagem da coluna após instalação do camisão (Arame → ABAN 036; Perfilagem → ABAN 098; Flexitubo → ABAN 124; Não → omitir gabaritagem)"
              value={
                inputs.gaugeTech === 'no' ? 'Não' :
                inputs.gaugeTech === 'electric'
                  ? `Perfilagem${inputs.gaugeContingency ? ' (Conting.)' : ''}`
                  : inputs.gaugeTech === 'ct'
                    ? `Flexitubo${inputs.gaugeContingency ? ' (Conting.)' : ''}`
                    : `Arame${inputs.gaugeCamisaoAcoplado ? ' (c/ camisão acoplado)' : ''}${inputs.gaugeContingency ? ' (Conting.)' : ''}`
              }
              isEditing={isEd('gaugeTech')} onEdit={() => edit('gaugeTech')}>
              <div className="space-y-2">
                <InlineRadio
                  options={[
                    { value: 'wireline', label: 'Arame' },
                    { value: 'electric', label: 'Perfilagem' },
                    { value: 'ct',       label: 'Flexitubo' },
                    { value: 'no',       label: 'Não' },
                  ]}
                  value={inputs.gaugeTech ?? 'wireline'}
                  onChange={v => apply({
                    gaugeTech: v as GaugeTech,
                    gaugeContingency: v === 'no' ? undefined : inputs.gaugeContingency,
                    gaugeCamisaoAcoplado: v === 'wireline' ? inputs.gaugeCamisaoAcoplado : undefined,
                  }, v === 'no')}
                />
                {inputs.gaugeTech === 'wireline' && (
                  <div className="ml-2 border-l-2 border-gray-200 pl-2">
                    <p className="text-xs font-medium text-gray-500 mb-1">Com camisão acoplado?</p>
                    <InlineRadio
                      options={[{ value: 'no', label: 'Não' }, { value: 'yes', label: 'Sim' }]}
                      value={inputs.gaugeCamisaoAcoplado ? 'yes' : 'no'}
                      onChange={v => apply({ gaugeCamisaoAcoplado: v === 'yes' }, false)}
                    />
                  </div>
                )}
                {inputs.gaugeTech !== 'no' && (
                  <div className="ml-2 border-l-2 border-gray-200 pl-2">
                    <p className="text-xs font-medium text-gray-500 mb-1">Previsão</p>
                    <InlineRadio
                      options={[{ value: 'firm', label: 'Firme' }, { value: 'contingency', label: 'Contingencial' }]}
                      value={inputs.gaugeContingency ? 'contingency' : 'firm'}
                      onChange={v => apply({ gaugeContingency: v === 'contingency' }, false)}
                    />
                  </div>
                )}
              </div>
            </Row>

            <Row label="Gabaritar com FT/MF+broca?"
              tooltip="Prever contingência de gabaritagem com motor de fundo e broca via flexitubo (ABAN 124), após gabaritagem convencional por arame"
              value={ync(inputs.contingencyGabaritFT)}
              isEditing={isEd('gabaritFT')} onEdit={() => edit('gabaritFT')}>
              <InlineRadio
                options={YNC_OPTIONS}
                value={inputs.contingencyGabaritFT ?? ''}
                onChange={v => apply({ contingencyGabaritFT: v as YesContingencyNo })}
              />
            </Row>

            {isTTBDC && (
              <Row label="Testar coluna c/ STDV?"
                tooltip='Prever descida de STV 2,75" e teste de estanqueidade antes do canhoneio'
                value={inputs.testColumnWithStdv === true ? 'Sim' : inputs.testColumnWithStdv === false ? 'Não' : '—'}
                isEditing={isEd('testColumnWithStdv')} onEdit={() => edit('testColumnWithStdv')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={inputs.testColumnWithStdv === true ? 'yes' : inputs.testColumnWithStdv === false ? 'no' : ''}
                  onChange={v => apply({ testColumnWithStdv: v === 'yes', stdvDispositionAfterTest: undefined })}
                />
              </Row>
            )}

            {isTTBDC && inputs.rigType === 'ANC' && inputs.testColumnWithStdv && (
              <div className="ml-3 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-0.5">
                <Row label="STDV após teste"
                  tooltip="Definir se a STDV é retirada ou mantida instalada após o teste de estanqueidade"
                  value={inputs.stdvDispositionAfterTest === 'remove' ? 'Retirar' : inputs.stdvDispositionAfterTest === 'keep' ? 'Manter' : '—'}
                  isEditing={isEd('stdvDispositionAfterTest')} onEdit={() => edit('stdvDispositionAfterTest')}>
                  <InlineRadio
                    options={[
                      { value: 'remove', label: 'Retirar após teste' },
                      { value: 'keep',   label: 'Manter instalada' },
                    ]}
                    value={inputs.stdvDispositionAfterTest ?? ''}
                    onChange={v => apply({ stdvDispositionAfterTest: v as 'remove' | 'keep' })}
                  />
                </Row>
              </div>
            )}

            {isTTBDC && (
              <Row label="Contingência TT-FT?"
                tooltip="Prever contingência de escopo TT-FT caso coluna não estanque no teste com STDV"
                value={inputs.contingencyTtFt === true ? 'Sim' : inputs.contingencyTtFt === false ? 'Não' : '—'}
                isEditing={isEd('contingencyTtFt')} onEdit={() => edit('contingencyTtFt')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={inputs.contingencyTtFt === true ? 'yes' : inputs.contingencyTtFt === false ? 'no' : ''}
                  onChange={v => apply({
                    contingencyTtFt: v === 'yes',
                    ttFtCementMode: v === 'no' ? undefined : inputs.ttFtCementMode,
                    loggingMode: v === 'no' ? undefined : inputs.loggingMode,
                  })}
                />
              </Row>
            )}
            {isTTBDC && inputs.contingencyTtFt && (
              <div className="ml-3 pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-0.5">
                <Row label="Jatear COP/COI"
                  tooltip="Jateamento da COP/COI com FT antes da cimentação (ABAN 125)"
                  value={ync(inputs.jatearCopCoi)}
                  isEditing={isEd('jatearCopCoi')} onEdit={() => edit('jatearCopCoi')}>
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.jatearCopCoi ?? ''}
                    onChange={v => apply({ jatearCopCoi: v as YesContingencyNo })}
                  />
                </Row>
                <Row label="Cimentação FT"
                  tooltip="Estratégia de cimentação do flexitubo (etapa única, duas etapas sucessivas ou duas etapas distintas)"
                  value={inputs.ttFtCementMode === 'single' ? 'Etapa única' : inputs.ttFtCementMode === 'successive' ? '2 sucessivas' : inputs.ttFtCementMode === 'distinct' ? '2 distintas' : '—'}
                  isEditing={isEd('ftMode')} onEdit={() => edit('ftMode')}>
                  <InlineRadio
                    options={[
                      { value: 'single',     label: 'Etapa única' },
                      { value: 'successive', label: '2 etapas sucessivas' },
                      { value: 'distinct',   label: '2 etapas distintas' },
                    ]}
                    value={inputs.ttFtCementMode ?? ''}
                    onChange={v => apply({ ttFtCementMode: v as WizardInputs['ttFtCementMode'], loggingMode: undefined })}
                  />
                </Row>
                {!!inputs.ttFtCementMode && (
                  <Row label="Perfilagem anular A"
                    tooltip="Método de perfilagem para avaliação do topo de cimento do flexitubo (jogo de polias ou equipamento de pressão)"
                    value={inputs.loggingMode === 'polias' ? 'Polias' : inputs.loggingMode === 'pressure_equipment' ? 'Eq. pressão' : '—'}
                    isEditing={isEd('logMode')} onEdit={() => edit('logMode')}>
                    <InlineRadio
                      options={[{ value: 'polias', label: 'Jogo de polias' }, { value: 'pressure_equipment', label: 'Eq. de pressão' }]}
                      value={inputs.loggingMode ?? ''}
                      onChange={v => apply({ loggingMode: v as WizardInputs['loggingMode'] })}
                    />
                  </Row>
                )}
              </div>
            )}

            <Row label="Perfilagens de investigação"
              tooltip="Perfilagens de investigação previstas após gabaritagem da coluna (registro de pressão, fluxo no anular A, furo na COP, caliper, imageamento)"
              value={(inputs.investigationLogs ?? []).length > 0
                ? (inputs.investigationLogs ?? []).map(l => INVESTIGATION_LOG_LABELS[l]).join(', ')
                : 'Nenhuma'}
              isEditing={isEd('investigationLogs')} onEdit={() => edit('investigationLogs')}>
              <div className="space-y-2">
                <InlineCheckboxes
                  options={INVESTIGATION_LOG_ORDER.map(l => ({ value: l, label: INVESTIGATION_LOG_LABELS[l] }))}
                  values={inputs.investigationLogs ?? []}
                  onToggle={v => {
                    const curr = inputs.investigationLogs ?? []
                    const log = v as InvestigationLog
                    const adding = !curr.includes(log)
                    const next = adding ? [...curr, log] : curr.filter(x => x !== log)
                    const newMethods = { ...(inputs.investigationLogMethods ?? {}) }
                    const newConting = { ...(inputs.investigationLogContingency ?? {}) }
                    if (adding && INVESTIGATION_LOG_METHODS[log].length > 0) {
                      newMethods[log] = INVESTIGATION_LOG_METHODS[log][0]
                    } else if (!adding) {
                      delete newMethods[log]
                      delete newConting[log]
                    }
                    apply({
                      investigationLogs: next.length ? next : undefined,
                      investigationLogMethods: Object.keys(newMethods).length ? newMethods as WizardInputs['investigationLogMethods'] : undefined,
                      investigationLogContingency: Object.keys(newConting).length ? newConting as WizardInputs['investigationLogContingency'] : undefined,
                    }, false)
                  }}
                />
                {INVESTIGATION_LOG_ORDER.filter(l => (inputs.investigationLogs ?? []).includes(l)).map(l => (
                  <div key={l} className="ml-2 border-l-2 border-gray-200 pl-2 space-y-1">
                    <p className="text-xs font-medium text-gray-500">{INVESTIGATION_LOG_LABELS[l]}</p>
                    {INVESTIGATION_LOG_METHODS[l].length > 1 && (
                      <>
                        <p className="text-[10px] text-gray-400">Tecnologia</p>
                        <InlineRadio
                          options={INVESTIGATION_LOG_METHODS[l].map(m => ({ value: m, label: TECH_LABELS[m] }))}
                          value={(inputs.investigationLogMethods ?? {})[l] ?? INVESTIGATION_LOG_METHODS[l][0]}
                          onChange={m => apply({
                            investigationLogMethods: { ...inputs.investigationLogMethods, [l]: m as 'wireline' | 'electric' | 'ct' },
                          }, false)}
                        />
                      </>
                    )}
                    <p className="text-[10px] text-gray-400">Previsão</p>
                    <InlineRadio
                      options={[{ value: 'firm', label: 'Firme' }, { value: 'contingency', label: 'Contingencial' }]}
                      value={(inputs.investigationLogContingency ?? {})[l] ? 'contingency' : 'firm'}
                      onChange={v => apply({
                        investigationLogContingency: { ...inputs.investigationLogContingency, [l]: v === 'contingency' },
                      }, false)}
                    />
                  </div>
                ))}
              </div>
            </Row>

            <Row label="Pescaria na coluna/cauda?"
              tooltip="Elementos a serem pescados da coluna/cauda após gabaritagem, com escolha de tecnologia por elemento"
              value={(inputs.tailFishingItems ?? []).length > 0
                ? (inputs.tailFishingItems ?? []).map(fi =>
                    `${FISHING_ELEMENT_LABELS[fi.element]} (${FISHING_METHOD_LABELS[fi.method]})`
                  ).join(', ')
                : 'Nenhum'}
              isEditing={isEd('tailFishing')} onEdit={() => edit('tailFishing')}>
              <div className="space-y-3">
                <div className="space-y-2">
                  {FISHING_GROUPS.map(group => (
                    <div key={group.label}>
                      <p className="text-xs font-medium text-gray-400 mb-1">{group.label}</p>
                      <InlineCheckboxes
                        options={group.elements.map(e => ({ value: e, label: FISHING_ELEMENT_LABELS[e].replace(/ nipple [RF] \d,\d{2}"/, '') }))}
                        values={(inputs.tailFishingItems ?? []).map(fi => fi.element)}
                        onToggle={v => {
                          const elem = v as FishingElement
                          const curr = inputs.tailFishingItems ?? []
                          const exists = curr.find(fi => fi.element === elem)
                          if (exists) {
                            const next = curr.filter(fi => fi.element !== elem)
                            apply({ tailFishingItems: next.length ? next : undefined }, false)
                          } else {
                            apply({ tailFishingItems: [...curr, { element: elem, method: FISHING_METHODS_BY_ELEMENT[elem][0] }] }, false)
                          }
                        }}
                      />
                    </div>
                  ))}
                </div>
                {[...FISHING_ELEMENTS].filter(e => (inputs.tailFishingItems ?? []).some(fi => fi.element === e)).map(e => {
                  const fi = (inputs.tailFishingItems ?? []).find(f => f.element === e)!
                  const methods = FISHING_METHODS_BY_ELEMENT[fi.element]
                  if (methods.length === 1) return null
                  return (
                    <div key={fi.element} className="ml-2 border-l-2 border-gray-200 pl-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">{FISHING_ELEMENT_LABELS[fi.element]} — Tecnologia</p>
                      <InlineRadio
                        options={methods.map(m => ({ value: m, label: FISHING_METHOD_LABELS[m] }))}
                        value={fi.method}
                        onChange={m => {
                          const curr = inputs.tailFishingItems ?? []
                          apply({ tailFishingItems: curr.map(x => x.element === fi.element ? { ...x, method: m as FishingMethod } : x) }, false)
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </Row>
            </>)}

            {hasSec('csb1', 'csb2', 'corte', 'csb1_fs1', 'csb2_fs1', 'corte_fs1', 'rcma_principal') && (
            <Row label="Perfuração da COP/COI"
              tooltip={usesFs1Barrier && !rcmaFluidCsb
                ? 'Canhoneio profundo da coluna (tubing puncher). "Não perfurar" remove o pacote do cronograma.'
                : 'Método de canhoneio da COP/COI para comunicação com a formação (tubing puncher a cabo ou arame DSL)'}
              value={usesFs1Barrier && !rcmaFluidCsb
                ? `${inputs.tubingPerfMethod === 'wireline' ? 'Arame' : inputs.tubingPerfMethod === 'ct' ? 'FT' : 'Cabo'} · Prof. ${inputs.fs1PerfProfunda === 'no' ? 'não' : 'sim'}`
                : inputs.tubingPerfMethod === 'electric' ? 'Perfilagem' : inputs.tubingPerfMethod === 'wireline' ? 'Arame' : '—'}
              isEditing={isEd('perfMethod')} onEdit={() => edit('perfMethod')}>
              {usesFs1Barrier && !rcmaFluidCsb ? (
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-gray-400">Tecnologia (canhoneio)</p>
                    <InlineRadio
                      options={[{ value: 'electric', label: 'Cabo (tubing puncher)' }, { value: 'wireline', label: 'Arame (eFire)' }, { value: 'ct', label: 'Flexitubo (FT)' }]}
                      value={inputs.tubingPerfMethod ?? ''}
                      onChange={v => apply({ tubingPerfMethod: v as WizardInputs['tubingPerfMethod'] }, false)}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">Profunda — {inputs.tubingPerfMethod === 'wireline' ? 'eFire (ABAN 045)' : inputs.tubingPerfMethod === 'ct' ? 'tubing puncher FT (ABAN 154)' : 'tubing puncher (ABAN 101)'} · vem primeiro</p>
                    <InlineRadio
                      options={[{ value: 'yes', label: 'Perfurar' }, { value: 'no', label: 'Não perfurar' }]}
                      value={inputs.fs1PerfProfunda ?? ''}
                      onChange={v => apply({ fs1PerfProfunda: v as 'yes' | 'no' }, false)}
                    />
                  </div>
                </div>
              ) : (
                <InlineRadio
                  options={[{ value: 'electric', label: 'Perfilagem (tubing puncher)' }, { value: 'wireline', label: 'Arame' }]}
                  value={inputs.tubingPerfMethod ?? ''}
                  onChange={v => apply({ tubingPerfMethod: v as WizardInputs['tubingPerfMethod'] })}
                />
              )}
            </Row>
            )}

            {hasSec('gab') && (
            <Row label="VGL — retirar ou substituir?"
              tooltip="Retirar remove o VGL existente; Substituir inclui também a instalação de novo VGL (ABAN 057)"
              value={inputs.vglAction
                ? `${VGL_ACTION_LABELS[inputs.vglAction]}${inputs.vglContingency ? ' (Cont.)' : ' (Firme)'}${inputs.vglInstallStv ? '; STV+coletor' : ''}${inputs.vglInstallStv && inputs.vglRemoveStv ? '+retirada' : ''}`
                : 'Não previsto'}
              isEditing={isEd('vglAction')} onEdit={() => edit('vglAction')}>
              <div className="space-y-2">
                <InlineRadio
                  options={[
                    { value: '', label: 'Não previsto' },
                    { value: 'remove', label: 'Retirar' },
                    { value: 'replace', label: 'Substituir' },
                  ]}
                  value={inputs.vglAction ?? ''}
                  onChange={v => apply({ vglAction: v ? v as VglAction : undefined, vglContingency: v ? inputs.vglContingency : undefined, vglFishingMethod: v ? (inputs.vglFishingMethod ?? 'wireline') : undefined, vglInstallStv: v ? inputs.vglInstallStv : undefined, vglRemoveStv: v ? inputs.vglRemoveStv : undefined }, !v)}
                />
                {inputs.vglAction && (
                  <>
                    <div className="ml-2 border-l-2 border-gray-200 pl-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">É uma operação firme ou contingencial?</p>
                      <InlineRadio
                        options={[
                          { value: 'firme', label: 'Firme' },
                          { value: 'contingency', label: 'Contingencial' },
                        ]}
                        value={inputs.vglContingency ? 'contingency' : 'firme'}
                        onChange={v => apply({ vglContingency: v === 'contingency' }, false)}
                      />
                    </div>
                    <div className="ml-2 border-l-2 border-gray-200 pl-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Instalar STV 2,75" com coletor antes da retirada?</p>
                      <InlineCheckboxes
                        options={[{ value: 'yes', label: 'Sim' }]}
                        values={inputs.vglInstallStv ? ['yes'] : []}
                        onToggle={() => apply({ vglInstallStv: !inputs.vglInstallStv, vglRemoveStv: inputs.vglInstallStv ? undefined : inputs.vglRemoveStv }, false)}
                      />
                    </div>
                    {inputs.vglInstallStv && (
                      <div className="ml-4 border-l-2 border-gray-100 pl-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Remover STV após pescaria/substituição?</p>
                        <InlineCheckboxes
                          options={[{ value: 'yes', label: 'Sim' }]}
                          values={inputs.vglRemoveStv ? ['yes'] : []}
                          onToggle={() => apply({ vglRemoveStv: !inputs.vglRemoveStv }, false)}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </Row>
            )}

            {inputs.scopeId === 'FSU_Conv_RCMA' && (
              <Row label="CSB principal"
                tooltip="Tipo de barreira principal na Fase 1A: não surgência, fluido + CSB mecânico, ou tampão de cimento"
                value={inputs.rcmaCsbPrincipal === 'no_surge' ? 'Não Surgência' : inputs.rcmaCsbPrincipal === 'cement_plug' ? 'Tampão de cimento' : 'Fluido e CSB'}
                isEditing={isEd('rcmaCsbPrincipal')} onEdit={() => edit('rcmaCsbPrincipal')}>
                <div className="space-y-2">
                  <InlineRadio
                    options={[
                      { value: 'no_surge',    label: 'Não Surgência' },
                      { value: 'fluid_csb',   label: 'Fluido e CSB' },
                      { value: 'cement_plug', label: 'Tampão de cimento' },
                    ]}
                    value={inputs.rcmaCsbPrincipal ?? 'fluid_csb'}
                    onChange={v => apply({
                      rcmaCsbPrincipal: v as RcmaCsbPrincipal,
                      rcmaCementPkgs: v !== 'cement_plug' ? undefined : inputs.rcmaCementPkgs,
                      installTmfPlugEndProd: v === 'fluid_csb' ? undefined : inputs.installTmfPlugEndProd,
                      installTmfPlugEndAnul: v === 'fluid_csb' ? undefined : inputs.installTmfPlugEndAnul,
                      fs1CsbSecondary: v === 'fluid_csb' ? undefined : inputs.fs1CsbSecondary,
                    }, v !== 'cement_plug')}
                  />
                  {inputs.rcmaCsbPrincipal === 'cement_plug' && (
                    <div className="ml-2 border-l-2 border-gray-200 pl-2 space-y-1">
                      <p className="text-[10px] text-gray-400">Pacotes de cimentação</p>
                      <InlineCheckboxes
                        options={RCMA_CEMENT_PKG_ORDER.map(p => ({ value: p, label: `${p} — ${RCMA_CEMENT_PKG_LABELS[p]}` }))}
                        values={inputs.rcmaCementPkgs ?? []}
                        onToggle={v => {
                          const curr = inputs.rcmaCementPkgs ?? []
                          const pkg = v as RcmaCementPkg
                          const next = curr.includes(pkg) ? curr.filter(x => x !== pkg) : [...curr, pkg]
                          apply({ rcmaCementPkgs: next.length ? next as RcmaCementPkg[] : undefined }, false)
                        }}
                      />
                    </div>
                  )}
                </div>
              </Row>
            )}

            {usesFs1Barrier && (
              <>
                <Row label="CSB primário"
                  tooltip="Elemento do CSB primário (CSB 1)"
                  value={
                    usesFs1Barrier && inputs.fs1CsbAlreadyInstalled
                      ? 'Já instalado'
                      : inputs.fs1CsbPrimary === 'tae' ? 'TAE'
                      : inputs.fs1CsbPrimary === 'plug' ? 'Plug'
                      : inputs.fs1CsbPrimary === 'stdv' ? 'STDV'
                      : inputs.fs1CsbPrimary === 'cement_plug' ? 'Tampão de cimento'
                      : inputs.fs1CsbPrimary === 'ecsb' ? 'Fluido eCSB'
                      : '—'
                  }
                  isEditing={isEd('fs1Csb1')} onEdit={() => edit('fs1Csb1')}>
                  {usesFs1Barrier ? (
                    <div className="space-y-2">
                      <InlineRadio
                        options={[
                          { value: 'yes', label: 'Já instalado' },
                          { value: 'no',  label: 'Instalar' },
                        ]}
                        value={inputs.fs1CsbAlreadyInstalled === true ? 'yes'
                             : inputs.fs1CsbAlreadyInstalled === false ? 'no' : ''}
                        onChange={v => apply({
                          fs1CsbAlreadyInstalled: v === 'yes',
                          fs1CsbPrimary: v === 'yes' ? undefined : inputs.fs1CsbPrimary,
                        }, v === 'yes')}
                      />
                      {inputs.fs1CsbAlreadyInstalled === false && (
                        <div className="ml-2 border-l-2 border-gray-200 pl-2">
                          <InlineRadio
                            options={[
                              { value: 'stdv',        label: 'STDV' },
                              { value: 'plug',        label: 'Plug mecânico' },
                              { value: 'tae',         label: 'TAE' },
                              // RCMA: cimento e eCSB já são cobertos pela pergunta "CSB principal"
                              ...(isConvRCMA ? [] : [
                                { value: 'cement_plug', label: 'Tampão de cimento' },
                                { value: 'ecsb',        label: 'Fluido eCSB' },
                              ]),
                            ]}
                            value={inputs.fs1CsbPrimary ?? ''}
                            onChange={v => apply({ fs1CsbPrimary: v as WizardInputs['fs1CsbPrimary'] })}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <InlineRadio
                      options={[{ value: 'tae', label: 'TAE' }, { value: 'plug', label: 'Plug mecânico' }]}
                      value={inputs.fs1CsbPrimary ?? ''}
                      onChange={v => apply({ fs1CsbPrimary: v as WizardInputs['fs1CsbPrimary'] })}
                    />
                  )}
                </Row>
              </>
            )}

            {usesFs1Barrier && (
              <Row label="Limpar poço retorno UEP?"
                tooltip="Prever limpeza do poço em conjunto com retorno de fluido via UEP antes da confirmação de limpeza. Selecione os caminhos de limpeza aplicáveis ao cenário."
                value={ync(inputs.cleanWithUep)}
                isEditing={isEd('cleanWithUep')} onEdit={() => edit('cleanWithUep')}>
                <div className="space-y-2">
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.cleanWithUep ?? 'no'}
                    onChange={v => apply({ cleanWithUep: v as YesContingencyNo, cleanWithUepPackages: v === 'no' ? undefined : inputs.cleanWithUepPackages }, v === 'no')}
                  />
                  {(inputs.cleanWithUep === 'yes' || inputs.cleanWithUep === 'contingency') && (
                    <div className="ml-2 border-l-2 border-gray-200 pl-2 space-y-1">
                      <p className="text-[10px] text-gray-400">Caminhos de limpeza</p>
                      <InlineCheckboxes
                        options={[
                          { value: 'ABAN 068', label: 'DPR/B4" > COP > An.A > FLGL' },
                          { value: 'ABAN 069', label: 'DPR/B4" > COP > An.A > PXO > FLPO' },
                          { value: 'ABAN 070', label: 'DPR/B4" > XO > An.A > COP > FLPO' },
                          { value: 'ABAN 071', label: 'DPR/B4" > XO > An.A > COP > PXO > FLGL' },
                          ...(inputs.rigType === 'ANC' ? [
                            { value: 'ABAN 072', label: 'B2" > XO > FLPO' },
                            { value: 'ABAN 073', label: 'B2" > FLGL' },
                            { value: 'ABAN 074', label: 'B2" > XO > COP > An.A > FLGL' },
                            { value: 'ABAN 075', label: 'B2" > XO > COP > An.A > PXO > FLPO' },
                            { value: 'ABAN 076', label: 'B2" > An.A > COP > FLPO' },
                            { value: 'ABAN 077', label: 'B2" > An.A > COP > PXO > FLGL' },
                          ] : []),
                        ]}
                        values={inputs.cleanWithUepPackages ?? []}
                        onToggle={v => {
                          const curr = inputs.cleanWithUepPackages ?? []
                          const next = curr.includes(v) ? curr.filter(x => x !== v) : [...curr, v]
                          apply({ cleanWithUepPackages: next.length ? next : undefined }, false)
                        }}
                      />
                    </div>
                  )}
                </div>
              </Row>
            )}

            {hasRetrieval && (
              <Row label="Cortar COP preventivamente?"
                tooltip="Evita necessidade de descida de cortador de coluna posteriormente via THRT caso COP/COI presa. Selecione 'Contingência' se o corte for apenas contingencial"
                value={ync(inputs.hasStuckStringRisk)}
                isEditing={isEd('stuckRisk')} onEdit={() => edit('stuckRisk')}>
                <InlineRadio
                  options={YNC_OPTIONS}
                  value={inputs.hasStuckStringRisk ?? ''}
                  onChange={v => apply({ hasStuckStringRisk: v as YesContingencyNo })}
                />
              </Row>
            )}

            {usesFs1Barrier && !rcmaFluidCsb && (
              <Row label="Perfuração rasa da COP/COI"
                tooltip="Canhoneio raso da coluna antes da instalação do CSB 2. Usa a mesma tecnologia selecionada na perfuração profunda."
                value={inputs.fs1PerfRasa === 'no' ? 'Não perfurar' : 'Perfurar'}
                isEditing={isEd('perfRasa')} onEdit={() => edit('perfRasa')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Perfurar' }, { value: 'no', label: 'Não perfurar' }]}
                  value={inputs.fs1PerfRasa ?? 'yes'}
                  onChange={v => apply({ fs1PerfRasa: v as 'yes' | 'no' })}
                />
              </Row>
            )}

            {usesFs1Barrier && !rcmaFluidCsb && (
              <Row label="CSB secundário"
                tooltip="CSB 2: plug TH (ABAN 042) ou TAE (ABAN 237). Selecione Não para omitir o CSB 2 do cronograma."
                value={
                  inputs.fs1CsbSecondaryMode === 'no' ? 'Não'
                  : inputs.fs1CsbSecondaryMode === 'contingency'
                    ? `Conting. (${inputs.fs1CsbSecondary === 'tae' ? 'TAE' : 'Plug TH'})`
                    : inputs.fs1CsbSecondary
                      ? (inputs.fs1CsbSecondary === 'tae' ? 'TAE' : 'Plug TH')
                      : '—'
                }
                isEditing={isEd('fs1Csb2')} onEdit={() => edit('fs1Csb2')}>
                <div className="space-y-2">
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.fs1CsbSecondaryMode ?? ''}
                    onChange={v => apply({
                      fs1CsbSecondaryMode: v as YesContingencyNo,
                      fs1CsbSecondary: v === 'no' ? undefined : (inputs.fs1CsbSecondary ?? 'plug_th'),
                    }, v === 'no')}
                  />
                  {(inputs.fs1CsbSecondaryMode === 'yes' || inputs.fs1CsbSecondaryMode === 'contingency') && (
                    <div className="ml-2 border-l-2 border-gray-200 pl-2">
                      <InlineRadio
                        options={[{ value: 'plug_th', label: 'Plug TH (ABAN 042)' }, { value: 'tae', label: 'TAE (ABAN 237)' }]}
                        value={inputs.fs1CsbSecondary ?? 'plug_th'}
                        onChange={v => apply({ fs1CsbSecondary: v as WizardInputs['fs1CsbSecondary'] }, false)}
                      />
                    </div>
                  )}
                </div>
              </Row>
            )}

            {isTTFT && (
              <Row label="Jatear COP/COI"
                tooltip="Jateamento da COP/COI com FT antes da cimentação (ABAN 125)"
                value={ync(inputs.jatearCopCoi)}
                isEditing={isEd('jatearCopCoi')} onEdit={() => edit('jatearCopCoi')}>
                <InlineRadio
                  options={YNC_OPTIONS}
                  value={inputs.jatearCopCoi ?? ''}
                  onChange={v => apply({ jatearCopCoi: v as YesContingencyNo })}
                />
              </Row>
            )}

            {(isTTFT || (isTTBDC && inputs.rigType === 'ANC' && inputs.stdvDispositionAfterTest !== 'keep')) && (
              <Row label="Base para cimentação TT"
                tooltip="Elemento de CSB que será usado como base para a cimentação TT"
                value={inputs.csbPrimary === 'stdv' ? 'STDV' : inputs.csbPrimary === 'plug' ? 'Plug' : inputs.csbPrimary === 'tae' ? 'TAE' : inputs.csbPrimary === 'inflatable_packer' ? 'Packer infl.' : '—'}
                isEditing={isEd('csbPrimary')} onEdit={() => edit('csbPrimary')}>
                <InlineRadio
                  options={[
                    { value: 'stdv',              label: 'STDV' },
                    { value: 'plug',              label: 'Plug mecânico' },
                    { value: 'tae',               label: 'TAE' },
                    { value: 'inflatable_packer', label: 'Packer inflável' },
                  ]}
                  value={inputs.csbPrimary ?? ''}
                  onChange={v => apply({ csbPrimary: v as WizardInputs['csbPrimary'] })}
                />
              </Row>
            )}

            {isTTFT && (
              <Row label="Cimentação FT"
                tooltip="Estratégia de cimentação do flexitubo (etapa única, duas etapas sucessivas ou duas etapas distintas)"
                value={inputs.ttFtCementMode === 'single' ? 'Etapa única' : inputs.ttFtCementMode === 'successive' ? '2 sucessivas' : inputs.ttFtCementMode === 'distinct' ? '2 distintas' : '—'}
                isEditing={isEd('ftMode')} onEdit={() => edit('ftMode')}>
                <InlineRadio
                  options={[
                    { value: 'single',     label: 'Etapa única' },
                    { value: 'successive', label: '2 etapas sucessivas' },
                    { value: 'distinct',   label: '2 etapas distintas' },
                  ]}
                  value={inputs.ttFtCementMode ?? ''}
                  onChange={v => apply({ ttFtCementMode: v as WizardInputs['ttFtCementMode'], loggingMode: undefined })}
                />
              </Row>
            )}

            {showLog && (
              <Row label="Perfilagem anular A"
                tooltip="Método de perfilagem para avaliação do topo de cimento do flexitubo (jogo de polias ou equipamento de pressão)"
                value={inputs.loggingMode === 'polias' ? 'Polias' : inputs.loggingMode === 'pressure_equipment' ? 'Eq. pressão' : '—'}
                isEditing={isEd('logMode')} onEdit={() => edit('logMode')}>
                <InlineRadio
                  options={[{ value: 'polias', label: 'Jogo de polias' }, { value: 'pressure_equipment', label: 'Eq. de pressão' }]}
                  value={inputs.loggingMode ?? ''}
                  onChange={v => apply({ loggingMode: v as WizardInputs['loggingMode'] })}
                />
              </Row>
            )}

            {isTTFT && (
              <Row label="Conting. canhoneio e teste?"
                tooltip="Prever contingência de canhoneio deep penetration (ABAN 153) + BPP inflável com FT (ABAN 162) após avaliação de cimentação a cabo"
                value={inputs.perforationTestContingency === true ? 'Sim' : inputs.perforationTestContingency === false ? 'Não' : '—'}
                isEditing={isEd('perfTestConting')} onEdit={() => edit('perfTestConting')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={inputs.perforationTestContingency === true ? 'yes' : inputs.perforationTestContingency === false ? 'no' : ''}
                  onChange={v => apply({ perforationTestContingency: v === 'yes' })}
                />
              </Row>
            )}

            {hasCement && !isFS1Mec && !isConvBOP && !isRCMA && (!isCustomScope || hasSec('bdc', 'csb1', 'csb2', 'csb1_fs1', 'csb2_fs1')) && (
              <Row label="Método cimento"
                tooltip="Método de avaliação da qualidade do cimento colocado na barreira subsuperficial"
                value={inputs.cementMethod === 'params' ? 'Parâmetros' : inputs.cementMethod === 'logging' ? 'Perfilagem' : inputs.cementMethod === 'perforation_test' ? 'Canh.+teste' : '—'}
                isEditing={isEd('cementMethod')} onEdit={() => edit('cementMethod')}>
                <InlineRadio
                  options={[
                    { value: 'params',  label: 'Parâmetros operacionais' },
                    { value: 'logging', label: 'Perfilagem (CBL)' },
                    ...(!isTT ? [{ value: 'perforation_test', label: 'Canhoneio + teste' }] : []),
                  ]}
                  value={inputs.cementMethod ?? ''}
                  onChange={v => apply({ cementMethod: v as WizardInputs['cementMethod'] })}
                />
              </Row>
            )}

            {isTTBDC && (
              <Row label="Conting. canhoneio e teste?"
                tooltip="Prever contingência de canhoneio deep penetration (ABAN 153) + BPP inflável com FT (ABAN 162) após avaliação de cimentação a cabo"
                value={inputs.perforationTestContingency === true ? 'Sim' : inputs.perforationTestContingency === false ? 'Não' : '—'}
                isEditing={isEd('perfTestConting')} onEdit={() => edit('perfTestConting')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={inputs.perforationTestContingency === true ? 'yes' : inputs.perforationTestContingency === false ? 'no' : ''}
                  onChange={v => apply({ perforationTestContingency: v === 'yes' })}
                />
              </Row>
            )}

            {isTT && (
              <Row label="Cortar coluna abaixo do TH?"
                tooltip="Está previsto corte da coluna de produção abaixo do Tubing Hanger (TH) durante esta intervenção?"
                value={inputs.hasPDI === false ? 'Sim' : inputs.hasPDI === true ? 'Não' : '—'}
                isEditing={isEd('hasPDI')} onEdit={() => edit('hasPDI')}>
                <InlineRadio
                  options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                  value={inputs.hasPDI === false ? 'yes' : inputs.hasPDI === true ? 'no' : ''}
                  onChange={v => apply({ hasPDI: v === 'no' })}
                />
              </Row>
            )}

            {!inputs.removeANM && !(inputs.scopeId === 'FSU_Conv_RCMA' && inputs.rcmaCsbPrincipal === 'fluid_csb') && (
              <>
                <Row label="Plug TMF prod. (final)"
                  tooltip="Instalar plug de abandono no bore de produção do TMF (Tree Manifold) ao final da operação?"
                  value={ync(inputs.installTmfPlugEndProd)}
                  isEditing={isEd('tmfProd')} onEdit={() => edit('tmfProd')}>
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.installTmfPlugEndProd ?? ''}
                    onChange={v => apply({ installTmfPlugEndProd: v as YesContingencyNo })}
                  />
                </Row>
                <Row label="Plug TMF anu. (final)"
                  tooltip="Instalar plug de abandono no bore anular do TMF (Tree Manifold) ao final da operação?"
                  value={ync(inputs.installTmfPlugEndAnul)}
                  isEditing={isEd('tmfAnul')} onEdit={() => edit('tmfAnul')}>
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.installTmfPlugEndAnul ?? ''}
                    onChange={v => apply({ installTmfPlugEndAnul: v as YesContingencyNo })}
                  />
                </Row>
              </>
            )}
          </Section>
        )}

        {/* ── Extra Abandono — Limpeza de Flowlines ── */}
        {inputs.rigType && inputs.scopeId && !isFS2 && hasSec('flow') && (
          <Section label="Extra Abandono" accent="border-teal-500 dark:border-teal-600">
            <Row label="Hidrato na(s) flowline(s)?"
              tooltip="Prever dissociação de hidrato nas flowlines antes da limpeza das linhas (ABAN 167–176, conforme rig e presença de BRV)"
              value={ync(inputs.flowlineHydrate)}
              isEditing={isEd('flHydrate')} onEdit={() => edit('flHydrate')}>
              <InlineRadio
                options={YNC_OPTIONS}
                value={inputs.flowlineHydrate ?? ''}
                onChange={v => apply({
                  flowlineHydrate: v as YesContingencyNo,
                  flowlineHydrateLines: v === 'no' ? undefined : inputs.flowlineHydrateLines,
                })}
              />
            </Row>

            {(inputs.flowlineHydrate === 'yes' || inputs.flowlineHydrate === 'contingency') && (
              <Row label="Linha(s) com hidrato"
                tooltip="Em qual(is) flowline(s) há presença de hidrato a dissociar antes da limpeza?"
                value={(inputs.flowlineHydrateLines ?? []).map(l => l === 'flpo' ? 'FLPO' : 'FLGL').join(', ') || '—'}
                isEditing={isEd('flHydrateLines')} onEdit={() => edit('flHydrateLines')}>
                <InlineCheckboxes
                  options={[{ value: 'flpo', label: 'FLPO (produção)' }, { value: 'flgl', label: 'FLGL (gas lift)' }]}
                  values={inputs.flowlineHydrateLines ?? []}
                  onToggle={v => toggleHydrateLine(v as FlowlineLine)}
                />
              </Row>
            )}

            <Row label="Limpar flowlines"
              tooltip="Realizar limpeza das flowlines antes da retirada do conjunto de WO?"
              value={inputs.cleanFlowlines === true ? 'Sim' : inputs.cleanFlowlines === false ? 'Não' : '—'}
              isEditing={isEd('cleanFL')} onEdit={() => edit('cleanFL')}>
              <InlineRadio
                options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                value={inputs.cleanFlowlines === true ? 'yes' : inputs.cleanFlowlines === false ? 'no' : ''}
                onChange={v => apply({
                  cleanFlowlines:       v === 'yes',
                  flowlineLines:        v === 'no' ? undefined : inputs.flowlineLines,
                  flowlineMethod:       v === 'no' ? undefined : inputs.flowlineMethod,
                })}
              />
            </Row>

            {inputs.cleanFlowlines && (
              <>
                <Row label="Linhas"
                  tooltip="Quais linhas de flowlines serão limpas?"
                  value={(inputs.flowlineLines ?? []).join(', ') || '—'}
                  isEditing={isEd('flLines')} onEdit={() => edit('flLines')}>
                  <InlineCheckboxes
                    options={[{ value: 'flpo', label: 'FLPO (produção)' }, { value: 'flgl', label: 'FLGL (gas lift)' }]}
                    values={inputs.flowlineLines ?? []}
                    onToggle={v => toggleLine(v as FlowlineLine)}
                  />
                </Row>
                <Row label="Método limpeza"
                  tooltip="Método utilizado para limpeza das flowlines"
                  value={inputs.flowlineMethod === 'direct_pumping' ? 'Bombeio direto' : inputs.flowlineMethod === 'n2_lift' ? 'N₂ lift' : '—'}
                  isEditing={isEd('flMethod')} onEdit={() => edit('flMethod')}>
                  <InlineRadio
                    options={[{ value: 'direct_pumping', label: 'Bombeio direto' }, { value: 'n2_lift', label: 'N₂ lift' }]}
                    value={inputs.flowlineMethod ?? ''}
                    onChange={v => apply({ flowlineMethod: v as WizardInputs['flowlineMethod'] })}
                  />
                </Row>
              </>
            )}
          </Section>
        )}

        {/* ── Fase 1B — Retirada do WO ── */}
        {inputs.rigType && inputs.scopeId && !isFS2 && (showRemoveANM || (isCustomScope && (cSecIds.has('ret_conv') || cSecIds.has('ret')))) && (
          <Section label="Fase 1B" accent="border-cyan-500 dark:border-cyan-600">
            <Row label="Retirar ANM"
              tooltip="A ANM (Árvore de Natal Molhada) será retirada ao final da intervenção?"
              value={inputs.removeANM === true ? 'Sim' : inputs.removeANM === false ? 'Não' : '—'}
              isEditing={isEd('removeANM')} onEdit={() => edit('removeANM')}>
              <InlineRadio
                options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                value={inputs.removeANM === true ? 'yes' : inputs.removeANM === false ? 'no' : ''}
                onChange={v => apply({
                  removeANM:             v === 'yes',
                  installTmfPlugEndProd: v === 'yes' ? undefined : inputs.installTmfPlugEndProd,
                  installTmfPlugEndAnul: v === 'yes' ? undefined : inputs.installTmfPlugEndAnul,
                })}
              />
            </Row>
          </Section>
        )}

        {/* ── Fase 2 — BOP / Cimentação ── */}
        {inputs.rigType && inputs.scopeId && (hasBopCement || (isCustomScope && customSecs?.some(s => s.phase === 'Fase 2'))) && (
          <Section label="Fase 2" accent="border-violet-500 dark:border-violet-600">
            {/* FS2: mobilização é Fase 2, equip e CCAP ficam aqui */}
            {isFS2 && (
              <>
                {inputs.rigType === 'DP' && (
                  <Row label="Transponder"
                    tooltip="Modo de instalação do transponder acústico: por COT (com garateia) ou por ROV"
                    value={inputs.transponderMode === 'cot' ? 'COT' : inputs.transponderMode === 'rov' ? 'ROV' : '—'}
                    isEditing={isEd('transponder')} onEdit={() => edit('transponder')}>
                    <InlineRadio
                      options={[{ value: 'cot', label: 'COT + garateia' }, { value: 'rov', label: 'ROV' }]}
                      value={inputs.transponderMode ?? ''}
                      onChange={v => apply({ transponderMode: v as WizardInputs['transponderMode'] })}
                    />
                  </Row>
                )}
                {inputs.rigType === 'DP' && !isRCMA && (
                  <Row label="Naveg. c/ BOP no fundo"
                    tooltip="A sonda navegou para o local com BOP instalado no fundo? (ABAN 005 em vez de ABAN 003)"
                    value={inputs.dmmWithEquipment === true ? 'Sim' : inputs.dmmWithEquipment === false ? 'Não' : '—'}
                    isEditing={isEd('dmmEquip')} onEdit={() => edit('dmmEquip')}>
                    <InlineRadio
                      options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                      value={inputs.dmmWithEquipment === true ? 'yes' : inputs.dmmWithEquipment === false ? 'no' : ''}
                      onChange={v => apply({ dmmWithEquipment: v === 'yes' })}
                    />
                  </Row>
                )}
                <Row label="Retirar CCAP?"
                  tooltip="Existe CCAP (Corrosion Cap) instalada no poço que precisa ser retirada no início da intervenção?"
                  value={ync(inputs.contingencyCcapWorkstring)}
                  isEditing={isEd('equipCCAP')} onEdit={() => edit('equipCCAP')}>
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.contingencyCcapWorkstring ?? ''}
                    onChange={v => {
                      const curr = inputs.subseaEquipments ?? []
                      const isYes = v === 'yes' || v === 'contingency'
                      apply({
                        contingencyCcapWorkstring: v as YesContingencyNo,
                        subseaEquipments: isYes
                          ? (curr.includes('corrosion_cap') ? curr : [...curr, 'corrosion_cap'])
                          : curr.filter(x => x !== 'corrosion_cap'),
                        ...(!isYes && { ccapRemovalMethod: undefined }),
                      })
                    }}
                  />
                </Row>

                {hasCC && (
                  <Row label="Método CCAP"
                    tooltip="Método de retirada da CCAP: com coluna de trabalho e garatéia (ABAN 008) ou a cabo (ABAN 009)"
                    value={ccapEffectiveMethod === 'cable' ? 'Cabo' : 'Coluna'}
                    isEditing={isEd('ccapMethod')} onEdit={() => edit('ccapMethod')}>
                    <InlineRadio
                      options={[{ value: 'workstring', label: 'Coluna' }, { value: 'cable', label: 'Cabo' }]}
                      value={ccapEffectiveMethod}
                      onChange={v => apply({ ccapRemovalMethod: v as 'workstring' | 'cable' })}
                    />
                  </Row>
                )}
              </>
            )}

            {hasBop && !isRCMA && (
              <Row label="BOP — limpeza c/ FEJAT"
                tooltip="Prever jateamento do housing com FEJAT (ABAN 227) antes da preparação e descida do BOP"
                value={ync(inputs.contingencyFejat)}
                isEditing={isEd('fejat')} onEdit={() => edit('fejat')}>
                <InlineRadio
                  options={YNC_OPTIONS}
                  value={inputs.contingencyFejat ?? ''}
                  onChange={v => apply({ contingencyFejat: v as YesContingencyNo })}
                />
              </Row>
            )}

            {hasBop && !isRCMA && (
              <Row label="Teste do BOP"
                tooltip="Método de teste de pressão do BOP (Test Plug → ABAN 228; Ponteira ORMAN → ABAN 240; Coluna flutuada → ABAN 229; FETH sobre TH → ABAN 241 após descida da FETH)"
                value={
                  inputs.bopTestMethod === 'ponteira_orman' ? 'Ponteira de borracha' :
                  inputs.bopTestMethod === 'coluna_flutuada' ? 'Coluna flutuada (sem TH)' :
                  inputs.bopTestMethod === 'feth_on_th' ? 'FETH sobre TH' : 'Teste Plug para TH'
                }
                isEditing={isEd('bopTest')} onEdit={() => edit('bopTest')}>
                <InlineRadio
                  options={[
                    { value: 'test_plug',      label: 'Teste Plug para TH' },
                    { value: 'feth_on_th',     label: 'FETH sobre TH' },
                    { value: 'ponteira_orman', label: 'Ponteira de borracha' },
                    { value: 'coluna_flutuada', label: 'Coluna flutuada (sem TH)' },
                  ]}
                  value={inputs.bopTestMethod ?? 'test_plug'}
                  onChange={v => apply({ bopTestMethod: v as 'test_plug' | 'ponteira_orman' | 'coluna_flutuada' | 'feth_on_th' }, false)}
                />
              </Row>
            )}

            {hasBopCement && (
              <Row label="Corte de COP/COI"
                tooltip="Prever contingência de corte de COP/COI caso o TH não desassente. Inclui retirada da FETH e descida de cortador de coluna."
                value={ync(inputs.fs2CopCutContingency)}
                isEditing={isEd('fs2CopCut')} onEdit={() => edit('fs2CopCut')}>
                <div className="space-y-2">
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.fs2CopCutContingency ?? ''}
                    onChange={v => apply({
                      fs2CopCutContingency: v as YesContingencyNo,
                      fs2CopCutMethod: v ? (inputs.fs2CopCutMethod ?? 'electric') : undefined,
                    }, v === 'no')}
                  />
                  {(inputs.fs2CopCutContingency === 'yes' || inputs.fs2CopCutContingency === 'contingency') && (
                    <div className="ml-2 border-l-2 border-gray-200 pl-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Método de corte</p>
                      <InlineRadio
                        options={[
                          { value: 'electric', label: 'A cabo (elétrico)' },
                          { value: 'slip_shot', label: 'Slip shot (cabo)' },
                          { value: 'string_shot', label: 'String shot (cabo)' },
                          ...(!isRCMA && !isFS2 ? [{ value: 'ct', label: 'Flexitubo (FT)' }] : []),
                        ]}
                        value={inputs.fs2CopCutMethod ?? 'electric'}
                        onChange={v => apply({ fs2CopCutMethod: v as 'electric' | 'ct' | 'slip_shot' | 'string_shot' }, false)}
                      />
                    </div>
                  )}
                  {(inputs.fs2CopCutContingency === 'yes' || inputs.fs2CopCutContingency === 'contingency') && (
                    <div className="ml-2 border-l-2 border-gray-200 pl-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Retirar plug 3,75" no TH com arame?</p>
                      <InlineRadio
                        options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                        value={inputs.fs2ThPlugRemoval ?? 'no'}
                        onChange={v => apply({ fs2ThPlugRemoval: v as YesContingencyNo }, false)}
                      />
                    </div>
                  )}
                </div>
              </Row>
            )}

            {isSupScope && (
              <Row label="Pescar cauda intermediária?"
                tooltip="Prever pescaria de cauda intermediária antes do isolamento. Overshot → ABAN 191; Ferramenta específica → ABAN 192. Contingências de corte e estampagem (193+194) sempre incluídas."
                value={ync(inputs.supIntermTailFishing)}
                isEditing={isEd('supCauda')} onEdit={() => edit('supCauda')}>
                <div className="space-y-2">
                  <InlineRadio
                    options={YNC_OPTIONS}
                    value={inputs.supIntermTailFishing ?? ''}
                    onChange={v => apply({
                      supIntermTailFishing: v as YesContingencyNo,
                      supIntermTailMethod: (v === 'yes' || v === 'contingency') ? (inputs.supIntermTailMethod ?? 'overshot') : undefined,
                    }, v === 'no')}
                  />
                  {(inputs.supIntermTailFishing === 'yes' || inputs.supIntermTailFishing === 'contingency') && (
                    <div className="ml-2 border-l-2 border-gray-200 pl-2">
                      <p className="text-xs font-medium text-gray-500 mb-1">Método de pescaria</p>
                      <InlineRadio
                        options={[
                          { value: 'overshot', label: 'Overshot (ABAN 191)' },
                          { value: 'specific_tool', label: 'Ferramenta específica (ABAN 192)' },
                        ]}
                        value={inputs.supIntermTailMethod ?? 'overshot'}
                        onChange={v => apply({ supIntermTailMethod: v as 'overshot' | 'specific_tool' }, false)}
                      />
                    </div>
                  )}
                </div>
              </Row>
            )}


            <Row label="Aval. cimento a cabo"
              tooltip={isRCMA
                ? "Prever avaliação de cimentação a cabo (ABAN 107) antes do bombeio de cimento em operação a mar aberto?"
                : "Prever avaliação de cimentação (ABAN 106) antes da operação de cimentação em modo BOP?"}
              value={inputs.bopPwcPreLog === false ? 'Não' : 'Sim'}
              isEditing={isEd('bopPwcPreLog')} onEdit={() => edit('bopPwcPreLog')}>
              <InlineRadio
                options={[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }]}
                value={inputs.bopPwcPreLog === false ? 'no' : 'yes'}
                onChange={v => apply({ bopPwcPreLog: v === 'yes' })}
              />
            </Row>

            <Row label="Nº isolamentos"
              tooltip="Número de isolamentos de Fase 2 previstos (cada isolamento tem seu próprio tampão ou correção)"
              value={inputs.isolationCount !== undefined ? String(inputs.isolationCount) : '—'}
              isEditing={isEd('isoCount')} onEdit={() => edit('isoCount')}>
              <InlineRadio
                options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3' }]}
                value={inputs.isolationCount !== undefined ? String(inputs.isolationCount) : ''}
                onChange={v => {
                  const count = parseInt(v)
                  const existing = inputs.isolations ?? []
                  const defIso = isSupPWC
                    ? { needsCorrection: true, corrMethod: 'pwc' as IsolationCorrMethod, pwcValidation: 'params' as const }
                    : { needsCorrection: false, plugType: 'bpp' as IsolationPlugType }
                  const newIsos = Array.from({ length: count }, (_, idx) => existing[idx] ?? defIso)
                  apply({ isolationCount: count, isolations: newIsos })
                }}
              />
            </Row>

            {(inputs.isolations ?? []).map((iso, i) => (
              <div key={i}>
                {!isRCMA && (
                  <Row label={`Iso ${i + 1} — correção?`}
                    tooltip={`Isolamento ${i + 1}: necessita de correção de cimentação antes do tampão final?`}
                    value={!iso.needsCorrection ? 'Não' : iso.corrContingency ? 'Contingencial' : 'Sim'}
                    isEditing={isEd(`iso_${i}_corr`)} onEdit={() => edit(`iso_${i}_corr`)}>
                    <InlineRadio
                      options={[
                        { value: 'yes', label: 'Sim' },
                        { value: 'contingency', label: 'Contingencial' },
                        { value: 'no', label: 'Não' },
                      ]}
                      value={!iso.needsCorrection ? 'no' : iso.corrContingency ? 'contingency' : 'yes'}
                      onChange={v => {
                        const isos = [...(inputs.isolations ?? [])]
                        const needs = v !== 'no'
                        isos[i] = { ...isos[i],
                          needsCorrection: needs,
                          corrContingency: v === 'contingency' ? true : undefined,
                          plugType: needs ? undefined : (isos[i].plugType ?? 'bpp'),
                          corrMethod: needs ? (isos[i].corrMethod ?? (isFS2 ? 'pwc' : 'convencional')) : undefined,
                          pwcValidation: needs ? isos[i].pwcValidation : undefined,
                        }
                        apply({ isolations: isos })
                      }}
                    />
                  </Row>
                )}

                {!iso.needsCorrection && (
                  <Row label={`Iso ${i + 1} — tampão`}
                    tooltip={`Isolamento ${i + 1}: tipo de tampão de cimento (BPP ABAN 199 ou pata de mula ABAN 200)`}
                    value={iso.plugType === 'pata_de_mula' ? 'Pata de mula' : 'BPP'}
                    isEditing={isEd(`iso_${i}_plug`)} onEdit={() => edit(`iso_${i}_plug`)}>
                    <InlineRadio
                      options={[{ value: 'bpp', label: 'BPP (ABAN 199)' }, { value: 'pata_de_mula', label: 'Pata de mula (ABAN 200)' }]}
                      value={iso.plugType ?? 'bpp'}
                      onChange={v => {
                        const isos = [...(inputs.isolations ?? [])]
                        isos[i] = { ...isos[i], plugType: v as IsolationPlugType }
                        apply({ isolations: isos })
                      }}
                    />
                  </Row>
                )}

                {iso.needsCorrection && !isRCMA && (
                  <Row label={`Iso ${i + 1} — método`}
                    tooltip={`Isolamento ${i + 1}: método de correção (recimentação convencional com CR ou PWC)`}
                    value={iso.corrMethod === 'pwc' ? 'PWC' : 'Convencional'}
                    isEditing={isEd(`iso_${i}_meth`)} onEdit={() => edit(`iso_${i}_meth`)}>
                    <InlineRadio
                      options={[{ value: 'convencional', label: 'Convencional (CR)' }, { value: 'pwc', label: 'PWC' }]}
                      value={iso.corrMethod ?? (isFS2 ? 'pwc' : 'convencional')}
                      onChange={v => {
                        const isos = [...(inputs.isolations ?? [])]
                        isos[i] = { ...isos[i], corrMethod: v as IsolationCorrMethod,
                          pwcValidation: v === 'convencional' ? undefined : (isos[i].pwcValidation ?? 'params') }
                        apply({ isolations: isos })
                      }}
                    />
                  </Row>
                )}

                {iso.needsCorrection && iso.corrMethod === 'pwc' && !isRCMA && (
                  <Row label={`Iso ${i + 1} — validação`}
                    tooltip={`Isolamento ${i + 1}: método de validação do PWC (parâmetros ou perfil CBL)`}
                    value={iso.pwcValidation === 'perfil' ? 'Perfilagem' : 'P.O.'}
                    isEditing={isEd(`iso_${i}_val`)} onEdit={() => edit(`iso_${i}_val`)}>
                    <InlineRadio
                      options={[{ value: 'params', label: 'P.O.' }, { value: 'perfil', label: 'Perfilagem' }]}
                      value={iso.pwcValidation ?? 'params'}
                      onChange={v => {
                        const isos = [...(inputs.isolations ?? [])]
                        isos[i] = { ...isos[i], pwcValidation: v as 'params' | 'perfil' }
                        apply({ isolations: isos })
                      }}
                    />
                  </Row>
                )}
              </div>
            ))}
          </Section>
        )}

        </>}

        {/* ── Perguntas do fluxograma (escopos custom e engine 'flowchart') ── */}
        {useFlowQuestions && inputs.rigType && inputs.scopeId && (() => {
          const secs = (customSecs ?? []).filter(sec => {
            if (sec.rigTypes?.length && !sec.rigTypes.includes(inputs.rigType!)) return false
            if (sec.opTypes?.length && !sec.opTypes.includes(inputs.operationType!)) return false
            return sec.decisions.length > 0
          })
          if (!secs.length) return null
          return (
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
          )
        })()}

      </div>
      {showProjectsModal && <ServerProjectsModal onClose={() => setShowProjectsModal(false)} />}
    </aside>
  )
}

function Section({ label, children, accent }: { label: string; children: React.ReactNode; accent?: string }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className={accent ? `pl-2 border-l-2 ${accent}` : ''}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1.5 w-full text-left mb-1.5 px-1 group"
      >
        <span className="text-slate-600 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-500 font-bold text-sm leading-none select-none transition-colors">
          {collapsed ? '+' : '−'}
        </span>
        <span className="text-xs font-bold text-slate-600 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-500 uppercase tracking-widest transition-colors">
          {label}
        </span>
      </button>
      {!collapsed && <div className="space-y-0.5">{children}</div>}
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
    <div className={`rounded-lg transition-colors ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-200 dark:ring-sky-800' : ''}`}>
      <button
        onClick={onEdit}
        className={`w-full flex justify-between items-center py-1.5 px-2 rounded-lg text-left group transition-colors
          ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
      >
        <span
          ref={labelRef}
          className="flex items-center text-xs text-slate-600 dark:text-slate-500 shrink-0 mr-2 cursor-default"
          onMouseEnter={tooltip ? showTip : undefined}
          onMouseLeave={tooltip ? () => setTipVisible(false) : undefined}
          onClick={e => e.stopPropagation()}
        >
          {label}
        </span>
        <span className={`text-xs font-semibold text-right flex items-center gap-1.5 min-w-0
          ${value === '—' ? 'text-slate-500 dark:text-slate-600' : isEditing ? 'text-sky-700 dark:text-sky-400' : 'text-slate-700 dark:text-slate-200'}`}>
          <span className="truncate">{value}</span>
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
              ? 'bg-slate-100 dark:bg-slate-700 text-sky-800 dark:text-sky-300 font-semibold shadow-sm ring-1 ring-sky-200 dark:ring-sky-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800'}`}>
          <input type="radio" checked={value === opt.value} onChange={() => onChange(opt.value)}
            className="accent-[#0c2340] shrink-0" />
          {opt.label}
        </label>
      ))}
    </div>
  )
}

function InlineCheckboxes({ options, values, onToggle }: {
  options: { value: string; label: string }[]
  values: string[]
  onToggle: (v: string) => void
}) {
  return (
    <div className="space-y-0.5">
      {options.map(opt => (
        <label key={opt.value}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs
            ${values.includes(opt.value)
              ? 'bg-slate-100 dark:bg-slate-700 text-sky-800 dark:text-sky-300 font-semibold shadow-sm ring-1 ring-sky-200 dark:ring-sky-700'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800'}`}>
          <input type="checkbox" checked={values.includes(opt.value)} onChange={() => onToggle(opt.value)}
            className="accent-[#0c2340] shrink-0" />
          {opt.label}
        </label>
      ))}
    </div>
  )
}
