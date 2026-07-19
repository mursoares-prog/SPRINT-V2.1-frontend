import type { ScopeId, WizardInputs, IsolationConfig, RigType } from '../types'

// Inputs default do wizard para um escopo (movido de App.tsx para reuso no
// ScopeParityChecker — mesma parametrização usada ao iniciar um projeto novo).
export function getDefaultInputs(
  rigType: RigType,
  operationType: 'Generalista' | 'LWO',
  scopeId: ScopeId,
): Partial<WizardInputs> {
  // Sondas de completação seca (PA e demais, quando vierem) usam escopos custom sem
  // perguntas de wizard (decisions-free) — nenhum dos campos de completação molhada
  // abaixo é lido nesse caso; retorna só o mínimo consumido por generateScheduleFromLogic.
  if (rigType !== 'ANC' && rigType !== 'DP') {
    return {
      rigType,
      operationType,
      scopeId,
      subseaEquipments: [],
      cleanFlowlines: false,
      percentile: 75,
      startDate: new Date().toISOString().split('T')[0],
    }
  }

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
