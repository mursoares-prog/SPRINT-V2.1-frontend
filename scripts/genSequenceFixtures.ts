// Gera golden rodando o TS REAL generateSchedule sobre uma matriz ampla de inputs.
// Consumido por backend/tests/test_sequence_engine.py.
//   node scripts/genSequenceFixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { generateSchedule } from '../src/engines/sequenceEngine.ts'
import type { WizardInputs, ScopeId, IsolationConfig } from '../src/types'

// ── Cópia de getDefaultInputs (App.tsx) — só para produzir inputs variados.
// O que importa para a paridade é que TS e Python recebam os MESMOS inputs
// (a fixture grava os inputs usados; o Python lê exatamente eles).
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
    rigType, operationType, scopeId,
    subseaEquipments: isFS2 ? [] : ['tree_cap'],
    percentile: 75,
    startDate: '2026-01-01',
    ...(!isFS2 && {
      hasTmfPlug: false, hasThPlug: false,
      installCamisao: ['yes'], camisaoMethod: 'wireline',
      anularAMinPressure: 'nonzero', anularFluid: 'inhibited', amortAnularFluid: 'inhibited',
      initialFillFluid: 'diesel_fcba', riserFluid: 'n2', tcapDisposition: 'bottom',
      contingencyTcapHydrate: 'contingency', tubingPerfMethod: 'electric',
      cleanFlowlines: true, flowlineLines: ['flpo', 'flgl'], flowlineMethod: 'direct_pumping',
      flowlineHydrate: 'contingency', flowlineHydrateLines: ['flpo', 'flgl'],
      anmHydrate: 'contingency', anmHydrateBlocks: ['producao', 'anular'],
      anmValveContingency: ['hydrate', 'jateamento', 'gabarit_ft'], anmValveHydrateBlocks: ['producao', 'anular'],
      contingencyGabaritFT: 'contingency', gaugeTech: 'wireline', gaugeContingency: false,
      installTmfPlugEndProd: 'no', installTmfPlugEndAnul: 'no',
    }),
    ...(hasRetrieval && { hasStuckStringRisk: isRCMA ? 'yes' : 'no' }),
    ...(hasCement && { cementMethod: 'params' }),
    ...(rigType === 'DP' && { transponderMode: 'rov', dmmWithEquipment: false }),
    ...(isTT && { csbPrimary: 'stdv', removeANM: false, hasPDI: true, jatearCopCoi: 'yes' }),
    ...(isTTFT && { ttFtCementMode: 'single', loggingMode: 'polias' }),
    ...(isFS1 && { fs1CsbAlreadyInstalled: false, fs1CsbPrimary: 'tae', fs1PerfProfunda: 'yes', fs1PerfRasa: 'yes', fs1CsbSecondary: 'plug_th', removeANM: false }),
    ...((isConvBOP || scopeId === 'FSU_Conv_RCMA' || scopeId === 'FSU_Sup_COP' || scopeId === 'FSU_Sup_PWC') && {
      fs1CsbAlreadyInstalled: false, fs1CsbPrimary: 'tae', fs1PerfProfunda: 'yes', fs1PerfRasa: 'yes', fs1CsbSecondary: 'plug_th',
    }),
    ...(scopeId === 'FSU_Conv_RCMA' && { rcmaCsbPrincipal: 'fluid_csb' }),
    ...(hasBopCement && { bopPwcPreLog: true }),
    ...(isSupPWC && { bopCorrectionMethod: 'convencional' }),
    ...(hasBop && { contingencyFejat: 'no' }),
    ...(isFS2 && { fs2CopCutContingency: 'no', fs2CopCutMethod: 'electric' }),
    ...(hasBopCement && !isSupPWC && { isolationCount: 1, isolations: [{ needsCorrection: false, plugType: 'bpp' }] as IsolationConfig[] }),
    ...(isSupPWC && { isolationCount: 1, isolations: [{ needsCorrection: true, corrMethod: 'pwc', pwcValidation: 'params' }] as IsolationConfig[] }),
  } as Partial<WizardInputs>
}

const SCOPES: ScopeId[] = [
  'FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_BOP', 'FSU_Conv_RCMA', 'FSU_Sup_COP', 'FSU_Sup_PWC',
  'FS1_Mec', 'FS2_Conv_BOP', 'FS2_Conv_RCMA', 'FS2_Sup_COP', 'FS2_Sup_PWC',
]

type Variation = { id: string; rig: 'ANC' | 'DP'; op: 'Generalista' | 'LWO'; scope: ScopeId; over?: Partial<WizardInputs> }

const VARIATIONS: Variation[] = [
  { id: 'ttft_tcap_rov', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { tcapRemovalMethod: 'rov' } },
  { id: 'ttft_tcap_surface_n2', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { tcapDisposition: 'surface', tcapSurfaceFluid: 'n2' } },
  { id: 'ttft_tcap_surface_inhibpost', rig: 'ANC', op: 'Generalista', scope: 'FSU_TT_FT', over: { tcapDisposition: 'surface', tcapSurfaceFluid: 'inhibited_post' } },
  { id: 'ttft_cement_distinct_pe', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { ttFtCementMode: 'distinct', loggingMode: 'pressure_equipment' } },
  { id: 'ttft_cement_successive', rig: 'ANC', op: 'Generalista', scope: 'FSU_TT_FT', over: { ttFtCementMode: 'successive', loggingMode: 'polias' } },
  { id: 'ttft_tmf_plugs', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { hasTmfPlug: true, tmfPlugBores: ['production', 'annular'], tmfPlugContingencyProd: ['stroker', 'ft'], tmfPlugContingencyAnul: ['ft'] } },
  { id: 'ttft_camisao_ct', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { installCamisao: ['contingency'], camisaoMethod: 'ct' } },
  { id: 'ttft_vgl_replace', rig: 'ANC', op: 'Generalista', scope: 'FSU_TT_FT', over: { vglAction: 'replace', vglFishingMethod: 'wireline', vglInstallStv: true, vglRemoveStv: true } },
  { id: 'ttft_tail_fishing', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { tailFishingItems: [{ element: 'stv_f', method: 'wireline' }, { element: 'plug_r', method: 'ct' }, { element: 'camisao', method: 'stroker' }] } },
  { id: 'ttft_invest_logs', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { investigationLogs: ['registro_pressao', 'caliper', 'free_point'], investigationLogMethods: { registro_pressao: 'electric' }, investigationLogContingency: { caliper: true } } },
  { id: 'ttbdc_stdv_keep_anc', rig: 'ANC', op: 'Generalista', scope: 'FSU_TT_BDC', over: { testColumnWithStdv: true, stdvDispositionAfterTest: 'keep' } },
  { id: 'convbop_iso_correction', rig: 'DP', op: 'Generalista', scope: 'FSU_Conv_BOP', over: { isolations: [{ needsCorrection: true, corrMethod: 'convencional' }] as IsolationConfig[] } },
  { id: 'suppwc_iso_pwc_perfil', rig: 'DP', op: 'Generalista', scope: 'FSU_Sup_PWC', over: { isolations: [{ needsCorrection: true, corrMethod: 'pwc', pwcValidation: 'perfil' }] as IsolationConfig[] } },
  { id: 'fs2bop_copcut_ct', rig: 'DP', op: 'Generalista', scope: 'FS2_Conv_BOP', over: { fs2CopCutContingency: 'contingency', fs2CopCutMethod: 'ct', bopTestMethod: 'feth_on_th', fs2ThPlugRemoval: 'yes' } },
  { id: 'fs2rcma_packer_fishing', rig: 'DP', op: 'Generalista', scope: 'FS2_Conv_RCMA', over: { fs2PackerFishing: 'contingency' } },
  { id: 'rcma_cement_plug', rig: 'DP', op: 'Generalista', scope: 'FSU_Conv_RCMA', over: { rcmaCsbPrincipal: 'cement_plug', rcmaCementPkgs: ['ABAN 159', 'ABAN 078', 'ABAN 082'] } },
  { id: 'fs1_perf_wireline', rig: 'DP', op: 'Generalista', scope: 'FS1_Mec', over: { tubingPerfMethod: 'wireline', fs1CsbPrimary: 'cement_plug', fs1CsbSecondary: 'tae' } },
  { id: 'ttft_lwo', rig: 'DP', op: 'LWO', scope: 'FSU_TT_FT', over: { tcapDisposition: 'surface', tcapSurfaceFluid: 'n2' } },
  // Features pós-espelho (337933a): killWellFase1A, ANM force-open, ccapRemovalMethod,
  // fs1CsbSecondaryMode e bopTestMethod para todos os escopos com BOP.
  { id: 'ttft_kill_no', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { killWellFase1A: 'no' } },
  { id: 'ttft_kill_contingency', rig: 'ANC', op: 'Generalista', scope: 'FSU_TT_FT', over: { killWellFase1A: 'contingency' } },
  { id: 'ttft_anm_force', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { anmForceOpen: 'contingency', anmForceMethod: ['hammer', 'motor_broca'] } },
  { id: 'ttft_ccap_cable', rig: 'DP', op: 'Generalista', scope: 'FSU_TT_FT', over: { subseaEquipments: ['tree_cap', 'corrosion_cap'], ccapRemovalMethod: 'cable', contingencyCcapWorkstring: 'yes' } },
  { id: 'fs1_csb2_contingency', rig: 'DP', op: 'Generalista', scope: 'FS1_Mec', over: { fs1CsbSecondaryMode: 'contingency' } },
  { id: 'fs1_csb2_no', rig: 'ANC', op: 'Generalista', scope: 'FS1_Mec', over: { fs1CsbSecondaryMode: 'no' } },
  { id: 'convbop_test_orman', rig: 'DP', op: 'Generalista', scope: 'FSU_Conv_BOP', over: { bopTestMethod: 'ponteira_orman' } },
  { id: 'convbop_test_feth', rig: 'DP', op: 'Generalista', scope: 'FSU_Conv_BOP', over: { bopTestMethod: 'feth_on_th' } },
]

type Fixture = { id: string; inputs: WizardInputs; schedule: unknown }
const fixtures: Fixture[] = []

// Baselines: 11 escopos × {ANC,DP} × {Generalista,LWO}
for (const scope of SCOPES) {
  for (const rig of ['ANC', 'DP'] as const) {
    for (const op of ['Generalista', 'LWO'] as const) {
      const inputs = getDefaultInputs(rig, op, scope) as WizardInputs
      fixtures.push({ id: `base_${scope}_${rig}_${op}`, inputs, schedule: generateSchedule(inputs) })
    }
  }
}
// Variações
for (const v of VARIATIONS) {
  const inputs = { ...getDefaultInputs(v.rig, v.op, v.scope), ...(v.over ?? {}) } as WizardInputs
  fixtures.push({ id: v.id, inputs, schedule: generateSchedule(inputs) })
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../backend/tests/fixtures')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'sequence_engine.json')
writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf-8')
console.log(`Geradas ${fixtures.length} fixtures de cronograma → ${outPath}`)
