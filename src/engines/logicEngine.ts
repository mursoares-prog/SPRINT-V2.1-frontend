import type { WizardInputs, ScheduleItem, Phase, Technology, Percentile } from '../types'
import type { LSec, LDec, LAns, LPkg, LCondition } from '../data/logicSecs'
import { getPackage, getDuration } from '../data/packages'
import { expandScopeRefs } from '../data/logicOverrideStore'
import { applyTransitions, applyTimeline, normalizeScopePhases } from './sequenceEngine'

let _uid = 0
const nextUid = () => `logic-${++_uid}`

function checkCondition(condition: LCondition | undefined, inputs: WizardInputs): boolean {
  if (!condition) return true
  switch (condition) {
    // Variantes por sonda/operação — permitem um único fluxo cobrir ANC/DP e LWO/Generalista
    case 'rig_anc':            return inputs.rigType === 'ANC'
    case 'rig_dp':             return inputs.rigType === 'DP'
    case 'op_lwo':             return inputs.operationType === 'LWO'
    case 'op_generalista':     return inputs.operationType !== 'LWO'
    // Compostas (sonda + Generalista): SFT/Terminal Head só em operação Generalista.
    case 'rig_dp_generalista':  return inputs.rigType === 'DP'  && inputs.operationType !== 'LWO'
    case 'rig_anc_generalista': return inputs.rigType === 'ANC' && inputs.operationType !== 'LWO'
    default:                   return true
  }
}

// Campos de WizardInputs utilizáveis em LAns.field (resolução automática de resposta).
// Exclui campos de controle que não representam decisões (scopeId, startDate, percentile,
// logicAnswers). Usado pelo editor de fluxo para sugerir campos ao admin.
export const WIZARD_LOGIC_FIELDS: string[] = [
  'amortAnularFluid', 'anmForceMethod', 'anmForceOpen', 'anmHydrate', 'anmHydrateBlocks',
  'anmValveContingency', 'anmValveHydrateBlocks', 'anularAMinPressure', 'anularFillFluid',
  'anularFluid', 'bopCorrectionMethod', 'bopPwcPreLog', 'bopPwcValidation', 'bopTestMethod',
  'camisaoMethod', 'ccapRemovalMethod', 'cementMethod', 'cleanFlowlines', 'cleanWithUep',
  'contingencyCcapWorkstring', 'contingencyFejat', 'contingencyGabaritFT',
  'contingencyTcapHydrate', 'contingencyTtFt', 'corrosionCapBeforeIntervention', 'csbPrimary',
  'dhsvBrvType', 'dmmWithEquipment', 'flowlineHydrate', 'flowlineMethod',
  'fs1CsbAlreadyInstalled', 'fs1CsbPrimary', 'fs1CsbSecondary', 'fs1CsbSecondaryMode',
  'fs1PerfProfunda', 'fs1PerfRasa', 'fs2CopCutContingency', 'fs2CopCutMethod',
  'fs2PackerFishing', 'fs2ThPlugRemoval', 'gaugeCamisaoAcoplado', 'gaugeContingency',
  'gaugeTech', 'hasPDI', 'hasStuckStringRisk', 'hasThPlug', 'hasTmfPlug', 'includeCcapBackup',
  'initialFillFluid', 'installCamisao', 'installTmfPlugEndAnul', 'installTmfPlugEndProd',
  'investigationLogContingency', 'investigationLogMethods', 'investigationLogs',
  'jatearCopCoi', 'killWellFase1A', 'loggingMode', 'operationType',
  'perforationTestContingency', 'rcmaCsbPrincipal', 'removeANM', 'rigType', 'riserFluid',
  'stdvDispositionAfterTest', 'subseaEquipments', 'supIntermTailFishing', 'supIntermTailMethod',
  'tcapDisposition', 'tcapRemovalMethod', 'tcapSurfaceFluid', 'testColumnWithStdv',
  'thPlugContingency', 'tmfPlugBores', 'tmfPlugContingencyAnul', 'tmfPlugContingencyProd',
  'transponderMode', 'treeCapBeforeIntervention', 'ttFtCementMode', 'tubingPerfMethod',
  'vglAction', 'vglContingency', 'vglFishingMethod', 'vglInstallStv', 'vglRemoveStv',
]

// Amortecimento COP/COI (LIMPEZA_INJECT): camisão contingencial força diesel+FCBA;
// kill 'no' suprime; 'contingency' escolhe a variante contingencial do mesmo fluido.
function _amortCopResolver(inp: WizardInputs): string | null {
  if (inp.killWellFase1A === 'no') return 'Não / N.A.'
  const hasCamisaoConting = (inp.installCamisao ?? []).includes('contingency')
  const fluido = hasCamisaoConting ? 'Diesel + FCBA'
    : inp.initialFillFluid === 'inhibited' ? 'MEG + FCBA'
    : inp.initialFillFluid === 'diesel' ? 'Diesel puro'
    : 'Diesel + FCBA'
  if (inp.killWellFase1A === 'contingency') {
    // 219 (diesel puro) não tem variante contingencial dedicada — usa diesel + FCBA
    return fluido === 'Diesel puro' ? 'Contingência — Diesel + FCBA' : `Contingência — ${fluido}`
  }
  return fluido
}

// Perfis de investigação (INVESTIGATION_INJECT): rótulo pelo método do log; prefixo
// "Contingência — " quando o log está marcado como contingencial. Logs sem variação de
// método usam o rótulo simples ('Sim'/'Contingência').
function _invLogResolver(
  inp: WizardInputs,
  log: string,
  methodLabels: Record<string, string>,
  defaultLabel: string,
): string {
  const logs = (inp.investigationLogs ?? []) as string[]
  if (!logs.includes(log)) return 'Não'
  const method = (inp.investigationLogMethods as Record<string, string> | undefined)?.[log]
  const label = (method && methodLabels[method]) || defaultLabel
  const conting = (inp.investigationLogContingency as Record<string, boolean> | undefined)?.[log] === true
  if (!conting) return label
  return label === 'Sim' ? 'Contingência' : `Contingência — ${label}`
}

// STDV mantida instalada após o teste (TT-BDC em ANC): pula limpeza/amortecimento pós-canhoneio.
const _stdvKeptInstalled = (inp: WizardInputs) =>
  inp.scopeId === 'FSU_TT_BDC' && inp.rigType === 'ANC' && inp.stdvDispositionAfterTest === 'keep'

// Plugs no TMF (PLUG_INJECT Fase 1A): bores plugados condicionam testes/válvulas.
const _hasProdBorePlug = (inp: WizardInputs) => !!inp.hasTmfPlug && (inp.tmfPlugBores ?? []).includes('production')
const _hasAnulBorePlug = (inp: WizardInputs) => !!inp.hasTmfPlug && (inp.tmfPlugBores ?? []).includes('annular')

// Pescaria de cauda (TAIL_FISHING_INJECT): método do elemento em inputs.tailFishingItems.
function _tailResolver(inp: WizardInputs, element: string): string {
  const item = (inp.tailFishingItems as { element: string; method: string }[] | undefined)
    ?.find(it => it.element === element)
  if (!item) return 'Não'
  return item.method === 'stroker' ? 'Stroker' : item.method === 'ct' ? 'Flexitubo' : 'Arame'
}

// Maps decision question text → a function that resolves the answer label from WizardInputs.
// Covers all decisions in logicSecs.ts that have no field/value set on their answers.
const QUESTION_LABEL_RESOLVER: Record<string, (inp: WizardInputs) => string | string[] | null> = {
  // ── MOB DP ──────────────────────────────────────────────────────────────────
  'Modo do transponder?':              inp => inp.transponderMode === 'cot' ? 'COT' : inp.transponderMode === 'rov' ? 'ROV' : null,
  'DMM — equipamento subsea no fundo?': inp => !inp.dmmWithEquipment ? 'Não' : 'Sim — Fase 1',
  'Cap de corrosão (CCAP)?':           inp => (inp.contingencyCcapWorkstring === 'yes' || inp.contingencyCcapWorkstring === 'contingency') ? 'Sim' : 'Não',
  'Método de retirada da CCAP?':       inp => inp.ccapRemovalMethod === 'cable' ? 'Cabo' : 'Coluna de trabalho',
  // TCap é retirada sempre que o poço tem tree_cap; método default é por coluna (espelha TCAP_INJECT)
  'Retirar TCap?':                      inp => (inp.subseaEquipments ?? []).includes('tree_cap') ? 'Sim' : 'Não / N.A.',
  'Método de retirada da TCap?':        inp => inp.tcapRemovalMethod === 'rov' ? 'ROV' : 'Coluna (TRT)',
  'Destino da TCap?':                   inp => inp.tcapDisposition === 'surface' ? 'Superfície' : 'Fundeio',
  'Hidrato no conector TCap?':          inp => inp.contingencyTcapHydrate === 'contingency' ? 'Contingência' : inp.contingencyTcapHydrate === 'yes' ? 'Sim' : 'Não',
  'Fluido no riser (TCap à superfície)?': inp =>
    inp.tcapSurfaceFluid === 'inhibited_pre' ? 'Inibido (pré-conexão)'
    : inp.tcapSurfaceFluid === 'inhibited_post' ? 'Inibido (pós-conexão)' : 'N₂',
  // ── DESCIDA ─────────────────────────────────────────────────────────────────
  'Fluido de riser inibido?':          inp => inp.riserFluid === 'inhibited' ? 'Sim' : 'N₂ / sem fluido',
  // ── CONEXÃO ─────────────────────────────────────────────────────────────────
  'Hidrato na ANM?':                   inp => inp.anmHydrate === 'contingency' ? 'Contingência' : inp.anmHydrate === 'yes' ? 'Sim' : 'Não',
  // Válvulas da ANM (ANM_VALVE_INJECT): adiadas quando há plug de produção no TMF
  'Contingência de jateamento (válvulas ANM)?': inp =>
    (!_hasProdBorePlug(inp) && (inp.anmValveContingency ?? []).includes('jateamento')) ? 'Sim' : 'Não',
  'Contingência de gabaritagem FT (válvulas ANM)?': inp =>
    (!_hasProdBorePlug(inp) && (inp.anmValveContingency ?? []).includes('gabarit_ft')) ? 'Sim' : 'Não',
  'Conting. jateamento (pós-plug)?': inp =>
    (_hasProdBorePlug(inp) && (inp.anmValveContingency ?? []).includes('jateamento')) ? 'Sim' : 'Não',
  'Conting. gabaritagem FT (pós-plug)?': inp =>
    (_hasProdBorePlug(inp) && (inp.anmValveContingency ?? []).includes('gabarit_ft')) ? 'Sim' : 'Não',
  // Testes de interface e de bloco com plugs no TMF
  'Teste de interface — produção?': inp => _hasProdBorePlug(inp) ? 'Com plug no TMF' : 'Padrão (sem plug)',
  'Teste de interface — anular?':   inp => _hasAnulBorePlug(inp) ? 'Com plug no TMF' : 'Padrão (sem plug)',
  'Retirar plug do TMF — anular?':   inp => _hasAnulBorePlug(inp) ? 'Sim' : 'Não',
  'Retirar plug do TMF — produção?': inp => _hasProdBorePlug(inp) ? 'Sim' : 'Não',
  'Teste de bloco de produção da ANM?': inp => _hasProdBorePlug(inp) ? 'Adiado (plug no TMF)' : 'Executar',
  'Teste de bloco do anular da ANM?':   inp => _hasAnulBorePlug(inp) ? 'Adiado (plug no TMF)' : 'Executar',
  'Abrir válvula da ANM com FT?': inp =>
    inp.anmForceOpen === 'contingency' ? 'Contingência' : inp.anmForceOpen === 'yes' ? 'Sim' : 'Não',
  'Instalação de camisão na DHSV?': inp => {
    const v = inp.installCamisao ?? []
    if (v.includes('yes') && !v.includes('contingency')) return 'Sim'
    if (v.includes('contingency')) return 'Contingência'
    return 'Não'
  },
  // ── GAB / ANULAR ────────────────────────────────────────────────────────────
  'Plug no TH?':                       inp => inp.hasThPlug === true ? 'Sim' : 'Não',
  'Gabaritar coluna?': inp => {
    switch (inp.gaugeTech) {
      case 'wireline': return 'Arame'
      case 'electric': return 'Perfilagem'
      case 'ct':       return 'Flexitubo'
      default:         return 'Não'
    }
  },
  'Amortecimento COP — fluido?': _amortCopResolver,
  // STDV mantida instalada (BDC/ANC): pula limpeza e amortecimento pós-canhoneio
  'Limpeza pós-canhoneio — fluido?': inp => _stdvKeptInstalled(inp) ? 'Não / N.A.' : _amortCopResolver(inp),
  'Teste de coluna com STDV?': inp => !inp.testColumnWithStdv ? 'Não'
    : inp.stdvDispositionAfterTest === 'keep' ? 'Sim — manter instalada' : 'Sim — retirar após teste',
  'Pressão no anular A?': inp => {
    if (inp.killWellFase1A === 'no') return 'Poço isolado (não amortecer)'
    const variant = inp.anularAMinPressure === 'nonzero'
      ? (inp.anularFluid === 'diesel' ? 'top kill diesel' : 'top kill MEG')
      : 'zero'
    if (inp.killWellFase1A === 'contingency') return `Contingência — ${variant}`
    return variant === 'zero' ? 'Zero' : variant === 'top kill diesel' ? 'Top kill — diesel' : 'Top kill — MEG'
  },
  'Amortecimento do anular pós-canhoneio?': inp =>
    _stdvKeptInstalled(inp) ? 'Não previsto (STDV mantida)'
    : inp.killWellFase1A === 'no' ? 'Não — poço isolado'
    : inp.killWellFase1A === 'contingency' ? 'Contingência' : 'Sim',
  // ── Perfis de investigação (espelha INVESTIGATION_INJECT; método+contingência por log) ──
  'Investigação — registro de pressão?': inp => _invLogResolver(inp, 'registro_pressao', { electric: 'Cabo elétrico', ct: 'Flexitubo' }, 'Arame'),
  'Investigação — fluxo pelo anular?':   inp => _invLogResolver(inp, 'fluxo_anular', { ct: 'Flexitubo' }, 'Arame'),
  'Investigação — furo na COP?':         inp => _invLogResolver(inp, 'furo_cop', { ct: 'Flexitubo' }, 'Arame'),
  'Investigação — caliper?':             inp => _invLogResolver(inp, 'caliper', {}, 'Sim'),
  'Investigação — imageamento?':         inp => _invLogResolver(inp, 'imageamento', {}, 'Sim'),
  'Investigação — free point?':          inp => _invLogResolver(inp, 'free_point', {}, 'Sim'),
  // ── Pescaria de cauda (TAIL_FISHING_INJECT) — uma decisão por elemento ──
  'Pescaria de cauda — STV F?':   inp => _tailResolver(inp, 'stv_f'),
  'Pescaria de cauda — plug F?':  inp => _tailResolver(inp, 'plug_f'),
  'Pescaria de cauda — BRV F?':   inp => _tailResolver(inp, 'brv_f'),
  'Pescaria de cauda — STV R?':   inp => _tailResolver(inp, 'stv_r'),
  'Pescaria de cauda — plug R?':  inp => _tailResolver(inp, 'plug_r'),
  'Pescaria de cauda — BRV R?':   inp => _tailResolver(inp, 'brv_r'),
  'Pescaria de cauda — camisão?': inp => _tailResolver(inp, 'camisao'),
  // ── Operação de VGL (VGL_INJECT) ──
  'Operação de VGL?': inp => inp.vglAction === 'replace' ? 'Substituir' : inp.vglAction === 'remove' ? 'Retirar' : 'Não',
  'Descer STV para a operação de VGL?': inp => inp.vglInstallStv ? 'Sim' : 'Não',
  'Retirar camisão para a VGL?': inp => {
    const hasCamisao = (inp.installCamisao ?? []).some(v => v === 'yes' || v === 'contingency')
    if (!hasCamisao) return 'Não'
    return inp.camisaoMethod === 'ct' ? 'Flexitubo' : 'Arame'
  },
  'Reinstalar camisão pós-VGL?': inp => {
    const hasCamisao = (inp.installCamisao ?? []).some(v => v === 'yes' || v === 'contingency')
    if (!hasCamisao) return 'Não'
    return inp.camisaoMethod === 'ct' ? 'Flexitubo' : 'Arame'
  },
  'Retirar STV pós-VGL?': inp => (inp.vglInstallStv && inp.vglRemoveStv) ? 'Sim' : 'Não',
  // ── FLOWLINES ───────────────────────────────────────────────────────────────
  'Limpar flowlines?':                 inp => inp.cleanFlowlines === true ? 'Sim' : inp.cleanFlowlines === false ? 'Não' : null,
  'Hidrato nas flowlines?':            inp => inp.flowlineHydrate === 'contingency' ? 'Contingência' : inp.flowlineHydrate === 'yes' ? 'Sim' : 'Não',
  'Método de limpeza?':                inp => inp.flowlineMethod === 'n2_lift' ? 'N₂ lift' : 'Bombeio direto',
  // ── TMF ─────────────────────────────────────────────────────────────────────
  'Instalar plug no TMF — anular?': inp => {
    if (inp.installTmfPlugEndAnul === 'yes')         return 'Sim'
    if (inp.installTmfPlugEndAnul === 'contingency') return 'Contingência'
    return 'Não'
  },
  'Instalar plug no TMF — produção?':  inp => (inp.installTmfPlugEndProd === 'yes' || inp.installTmfPlugEndProd === 'contingency') ? 'Sim / Conting.' : 'Não',
  // ── CSB PRIMÁRIO ────────────────────────────────────────────────────────────
  'CSB Primário já instalado?':        inp => inp.fs1CsbAlreadyInstalled === true ? 'Sim' : inp.fs1CsbAlreadyInstalled === false ? 'Não' : null,
  'Tipo de CSB Primário?': inp => {
    switch (inp.fs1CsbPrimary) {
      case 'tae':         return 'TAE'
      case 'plug':        return ['Plug wireline', 'Plug mec.']
      case 'stdv':        return 'STV wireline'
      case 'cement_plug': return 'Cimento FT'
      case 'ecsb':        return ['eCSB bombeio', 'eCSB']
      default:            return null
    }
  },
  // ── CORTE ───────────────────────────────────────────────────────────────────
  'Cortar coluna abaixo do TH?':       inp => inp.hasPDI === false ? 'Sim — sem PDI' : 'Não — há PDI',
  'Risco de aprisionamento de coluna?': inp =>
    inp.hasStuckStringRisk === 'contingency' ? 'Contingência' : inp.hasStuckStringRisk === 'yes' ? 'Sim' : 'Não / N.A.',
  // ── CSB SECUNDÁRIO (TT) ─────────────────────────────────────────────────────
  'Canhoneio raso (tubingPerf)?': inp => {
    if (!inp.fs1PerfRasa || inp.fs1PerfRasa === 'no') return 'Não'
    switch (inp.tubingPerfMethod) {
      case 'electric': return 'Sim — cabo elétrico'
      case 'wireline': return 'Sim — arame'
      case 'ct':       return 'Sim — FT'
      default:         return 'Não'
    }
  },
  'Tipo de CSB Secundário?': inp => inp.fs1CsbSecondary === 'tae' ? 'TAE' : 'Plug TH',
  // ── CSB SECUNDÁRIO (FS1) ────────────────────────────────────────────────────
  'Perfuração profunda da coluna?': inp => {
    // RCMA com CSB principal por fluido eCSB: sem perfuração (espelha PERF_INJECT)
    if (inp.scopeId === 'FSU_Conv_RCMA' && inp.rcmaCsbPrincipal === 'fluid_csb') return 'Não perfurar'
    if (inp.fs1PerfProfunda === 'no') return 'Não perfurar'
    switch (inp.tubingPerfMethod) {
      case 'wireline': return 'Arame (eFire)'
      case 'ct':       return 'Flexitubo'
      default:         return 'Cabo elétrico'
    }
  },
  'CSB secundário (FS1)?': inp => {
    if (inp.scopeId === 'FSU_Conv_RCMA' && inp.rcmaCsbPrincipal === 'fluid_csb') return 'Não previsto'
    if (inp.fs1CsbSecondaryMode === 'no') return 'Não previsto'
    return inp.fs1CsbSecondaryMode === 'contingency' ? 'Contingência' : 'Executar'
  },
  'Canhoneio raso da coluna?': inp => {
    if (inp.fs1PerfRasa === 'no') return 'Não'
    switch (inp.tubingPerfMethod) {
      case 'wireline': return 'Arame (eFire)'
      case 'ct':       return 'Flexitubo'
      default:         return 'Cabo elétrico'
    }
  },
  // ── RETIRADA ────────────────────────────────────────────────────────────────
  'Retirar ANM?':                      inp => inp.removeANM === true ? 'Sim' : inp.removeANM === false ? 'Não' : null,
  // ── BDC ─────────────────────────────────────────────────────────────────────
  'Contingência TT-FT (coluna não estanque)?': inp => inp.contingencyTtFt ? 'Sim / Conting.' : 'Não prevista',
  // CSB do BDC (CSB_INJECT): DP força TAE; ANC com STDV mantida pula; senão csbPrimary.
  'CSB primário (BDC)?': inp => {
    if (inp.rigType === 'ANC' && inp.stdvDispositionAfterTest === 'keep') return 'Mantida (STDV instalada)'
    if (inp.rigType === 'DP') return 'TAE'
    switch (inp.csbPrimary) {
      case 'plug': return 'Plug wireline'
      case 'tae':  return 'TAE'
      default:     return 'STV wireline'
    }
  },
  'Avaliação de cimentação BDC?': inp => inp.cementMethod === 'logging' ? 'Perfilagem' : 'Parâmetros',
  // ── RCMA ────────────────────────────────────────────────────────────────────
  'Tipo de CSB Principal RCMA?': inp => {
    switch (inp.rcmaCsbPrincipal) {
      case 'no_surge':    return 'Não Surgência'
      case 'fluid_csb':   return 'Fluido + CSB'
      case 'cement_plug': return 'Tampão de cimento'
      default:            return null
    }
  },
  // ── FASE 2 ──────────────────────────────────────────────────────────────────
  'Método de teste do BOP?': inp => {
    switch (inp.bopTestMethod) {
      case 'test_plug':       return 'Test plug'
      case 'ponteira_orman':  return 'Ponteira ORMAN'
      case 'coluna_flutuada': return 'Coluna flutuada'
      case 'feth_on_th':      return 'FETH no TH'
      default:                return null
    }
  },
  'Coluna presa — corte? (conting.)':  inp => inp.fs2CopCutContingency === 'contingency' ? 'Contingência' : inp.fs2CopCutContingency === 'yes' ? 'Sim' : 'Não',
  // ── ISOLAMENTO (espelha ISOLATION_INJECT; isolamento único = isolations[0]) ──
  'Avaliação de cimento antes do tampão?': inp => {
    const isRcma = inp.scopeId === 'FSU_Conv_RCMA' || inp.scopeId === 'FS2_Conv_RCMA'
    return (inp.bopPwcPreLog !== false && !isRcma) ? 'Sim (padrão)' : 'Não'
  },
  'Precisa correção de cimentação?': inp => {
    const iso = inp.isolations?.[0]
    if (!iso?.needsCorrection) return 'Não'
    const method = iso.corrMethod ?? ((inp.scopeId ?? '').startsWith('FS2') ? 'pwc' : 'convencional')
    if (method === 'convencional') return 'Convencional'
    return iso.pwcValidation === 'perfil' ? 'PWC — validação por perfilagem' : 'PWC — validação por parâmetros'
  },
  'Tipo de tampão de isolamento?': inp =>
    inp.isolations?.[0]?.plugType === 'pata_de_mula' ? 'Pata de Mula' : 'BPP',
  'Retirar plug 3,75" no TH (Fase 2)?': inp => inp.fs2ThPlugRemoval === 'contingency' ? 'Contingência' : inp.fs2ThPlugRemoval === 'yes' ? 'Sim' : 'Não',
  'Pescaria de packer?':               inp => inp.fs2PackerFishing === 'contingency' ? 'Contingência' : inp.fs2PackerFishing === 'yes' ? 'Sim' : 'Não',
  'Avaliação de cimento antes do bombeio (RCMA)?': inp => inp.bopPwcPreLog !== false ? 'Sim (padrão)' : 'Não',
}

function resolveAnswer(dec: LDec, inputs: WizardInputs, key: string): LAns | undefined {
  const inp = inputs as unknown as Record<string, unknown>

  // 0. Check explicit user answer from custom logic UI (keyed by tree path — ver buildDecisionKey)
  const userLabel = inputs.logicAnswers?.[key]
  if (userLabel !== undefined) {
    const byUser = dec.answers.find(a => a.label === userLabel)
    if (byUser) return byUser
  }

  // 1. Try explicit field/value on each answer (populated by admin editor or future enrichment)
  const byField = dec.answers.find(ans => {
    if (ans.field === undefined) return false
    const val = inp[ans.field]
    if (Array.isArray(ans.value)) {
      return Array.isArray(val)
        ? (ans.value as unknown[]).some(v => (val as unknown[]).includes(v))
        : (ans.value as unknown[]).includes(val)
    }
    if (Array.isArray(val)) return (val as unknown[]).includes(ans.value)
    return val === ans.value
  })
  if (byField) return byField

  // 2. Try question-based label resolver (maps wizard bundle inputs → answer label).
  //    Applies to all scopes: custom scopes use logicAnswers first (step 0), so the resolver
  //    acts as a fallback that makes bundle-style inputs (transponder, DMM, etc.) drive custom
  //    scope decisions when the user hasn't explicitly answered via LogicQuestionsPanel.
  const resolver = QUESTION_LABEL_RESOLVER[dec.question]
  if (resolver) {
    const label = resolver(inputs)
    if (label !== null) {
      const labels = Array.isArray(label) ? label : [label]
      const byLabel = dec.answers.find(a => labels.includes(a.label))
      if (byLabel) return byLabel
    }
  }

  // 3. Fall back to the answer marked active: true, then to the first answer
  return dec.answers.find(a => a.active) ?? dec.answers[0]
}

// Respostas que classificam o ramo como contingência (fluxograma: Sim / Contingência / Não).
// Só rótulos puramente contingenciais ("Contingência", "Contingencial", "Conting."); rótulos
// combinados (ex.: "Sim / Contingência") representam execução firme com modo contingencial.
function isContingencyLabel(label: string): boolean {
  const l = label.toLowerCase()
  if (!/conting/.test(l)) return false
  if (/\bsim\b|\bn[ãa]o\b/.test(l)) return false
  return true
}

function emitPkg(
  pkg: LPkg,
  fallbackPhase: Phase,
  percentile: Percentile,
  items: ScheduleItem[],
  inputs: WizardInputs,
  branchContingency?: { reason: string },
): void {
  if (!checkCondition(pkg.condition, inputs)) return
  const pkgData = getPackage(pkg.id)
  if (!pkgData) return
  const phase: Phase = (pkg.phase as Phase | undefined) ?? fallbackPhase
  // O ramo contingencial do fluxograma força a contingência; pkg.isContingency a mantém.
  const isContingency = (pkg.isContingency ?? false) || !!branchContingency
  items.push({
    uid: nextUid(),
    packageId: pkg.id,
    packageName: pkgData.name,
    category: pkgData.category,
    technology: (pkg.technology as Technology | undefined) ?? pkgData.technology,
    transitionTechnology: pkg.transitionTechnology as Technology | undefined,
    phase,
    duration: getDuration(pkg.id, percentile),
    isContingency,
    contingencyReason: pkg.contingencyReason ?? branchContingency?.reason,
    startDay: 0,
    endDay: 0,
  })
}

// Chave estável de uma decisão = caminho na árvore (prefixo) + índice + texto da
// pergunta. O índice/prefixo garantem unicidade mesmo entre perguntas homônimas
// (ex.: vários "Como?" em ramos diferentes). DEVE casar com LogicQuestionsPanel.
export function buildDecisionKey(pathPrefix: string, decIndex: number, question: string): string {
  return `${pathPrefix}::${decIndex}::${question}`
}

function walkDecisions(
  decisions: LDec[],
  inputs: WizardInputs,
  fallbackPhase: Phase,
  percentile: Percentile,
  items: ScheduleItem[],
  pathPrefix: string,
  isCustom: boolean,
  scopeAnswers: Map<string, string>,
  parentContingency = false,
  parentReason?: string,
): void {
  decisions.forEach((dec, di) => {
    const key = buildDecisionKey(pathPrefix, di, dec.question)
    // "Já respondida no escopo": herda o rótulo já resolvido para a MESMA pergunta numa
    // ocorrência anterior do escopo (registrado em scopeAnswers). Se ainda não houver
    // âncora (ex.: marcada na 1ª ocorrência), cai no fluxo normal e vira a própria âncora.
    const norm = dec.question.trim()
    let ans: LAns | undefined
    if (isCustom && dec.reuseScope && scopeAnswers.has(norm)) {
      const scoped = scopeAnswers.get(norm)
      ans = dec.answers.find(a => a.label === scoped) ?? dec.answers.find(a => a.active) ?? dec.answers[0]
    } else {
      ans = resolveAnswer(dec, inputs, key)
      if (isCustom && ans && !scopeAnswers.has(norm)) scopeAnswers.set(norm, ans.label)
    }
    // Pacotes sempre emitidos ao atingir esta decisão (independente da resposta)
    for (const pkg of dec.packages ?? []) {
      const pkgIsContingency = parentContingency || !!pkg.isContingency
      emitPkg(pkg, fallbackPhase, percentile, items, inputs,
        pkgIsContingency ? { reason: parentReason ?? 'Contingência' } : undefined)
    }
    if (ans) {
      // Em escopo custom, a resposta "Contingência" (label) marca o ramo como contingência.
      // O flag ans.contingency marca apenas os pacotes DESTE chip como contingenciais (não propaga
      // para sub-decisões). Pacotes individuais também podem ser contingenciais via pkg.isContingency.
      const contingency = parentContingency || (isCustom && isContingencyLabel(ans.label))
      const chipContingency = !!ans.contingency
      const reason = contingency ? (parentContingency ? parentReason : `Contingência: ${dec.question}`) : undefined
      for (const pkg of ans.packages ?? []) {
        const pkgIsContingency = contingency || chipContingency || !!pkg.isContingency
        emitPkg(pkg, fallbackPhase, percentile, items, inputs,
          pkgIsContingency ? { reason: reason ?? 'Contingência' } : undefined)
      }
      if (ans.sub?.length) {
        // O ramo segue pela resposta resolvida — o rótulo dela estende o caminho.
        walkDecisions(ans.sub, inputs, fallbackPhase, percentile, items, `${key}::${ans.label}`, isCustom, scopeAnswers, contingency, reason)
      }
      // Pacotes "após convergência" desta resposta — emitidos depois de toda a subárvore.
      for (const entry of ans.after ?? []) {
        for (const pkg of entry.packages ?? []) {
          const pkgIsContingency = contingency || !!pkg.isContingency
          emitPkg(pkg, fallbackPhase, percentile, items, inputs,
            pkgIsContingency ? { reason: reason ?? 'Contingência' } : undefined)
        }
      }
    }
    // Perguntas após a convergência (dec.afterDec): fluem independentemente da resposta
    // escolhida acima — avaliadas após o ramo resolvido e antes dos chips `after`.
    if (dec.afterDec?.length) {
      walkDecisions(dec.afterDec, inputs, fallbackPhase, percentile, items, `${key}::after`, isCustom, scopeAnswers, parentContingency, parentReason)
    }
    // Entradas sequenciais após a convergência das respostas (dec.after): fluem
    // independentemente da resposta escolhida — emitidas após o ramo resolvido.
    for (const entry of dec.after ?? []) {
      for (const pkg of entry.packages ?? []) {
        emitPkg(pkg, fallbackPhase, percentile, items, inputs)
      }
    }
  })
}

export function generateScheduleFromLogic(
  inputs: WizardInputs,
  sections: LSec[],
  isCustom = false,
): ScheduleItem[] {
  _uid = 0
  const { rigType, operationType, percentile } = inputs

  // Seções `ref` (blocos de reuso vivo) são expandidas aqui — idempotente para chamadas
  // que já expandiram (seções expandidas não têm ref). Garante que TODOS os callers
  // (scheduleRouter estático, parity.ts, dumpCase) resolvam blocos.
  const expanded = expandScopeRefs(sections)

  const filtered = expanded.filter(sec => {
    if (sec.rigTypes?.length && !sec.rigTypes.includes(rigType)) return false
    if (sec.opTypes?.length && !sec.opTypes.includes(operationType)) return false
    return true
  })

  const items: ScheduleItem[] = []
  // Respostas resolvidas por pergunta no escopo — alimenta as decisões `reuseScope`
  // (perguntas repetidas marcadas como "Já respondida no escopo"). Compartilhado entre seções.
  const scopeAnswers = new Map<string, string>()
  for (const sec of filtered) {
    const fallbackPhase = sec.phase as Phase
    for (const pkg of sec.always ?? []) {
      emitPkg(pkg, fallbackPhase, percentile, items, inputs)
    }
    walkDecisions(sec.decisions, inputs, fallbackPhase, percentile, items, sec.id, isCustom, scopeAnswers)
  }

  const base = items.filter(i => !i.autoInserted)
  const rebuilt = applyTransitions(base, rigType, operationType, percentile)
  // Mesma normalização final de fases da sequence engine (âncora da TCap / promoção
  // da Fase 0) — mantém o fluxo custom equivalente à engine sem exigir que o admin
  // modele a regra de fases manualmente.
  return normalizeScopePhases(applyTimeline(rebuilt), inputs.scopeId ?? '')
}
