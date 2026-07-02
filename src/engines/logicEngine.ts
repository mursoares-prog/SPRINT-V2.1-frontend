import type { WizardInputs, ScheduleItem, Phase, Technology, Percentile } from '../types'
import type { LSec, LDec, LAns, LPkg, LCondition } from '../data/logicSecs'
import { getPackage, getDuration } from '../data/packages'
import { applyTransitions, applyTimeline } from './sequenceEngine'

let _uid = 0
const nextUid = () => `logic-${++_uid}`

function checkCondition(condition: LCondition | undefined, inputs: WizardInputs): boolean {
  if (!condition) return true
  const yesOrConting = (v?: string) => v === 'yes' || v === 'contingency'
  switch (condition) {
    case 'clean_flowlines':    return !!inputs.cleanFlowlines
    case 'remove_anm':         return !!inputs.removeANM
    case 'not_remove_anm':     return !inputs.removeANM
    case 'no_pdi':             return inputs.hasPDI === false
    case 'stuck_risk':         return yesOrConting(inputs.hasStuckStringRisk)
    case 'dhsv_no_sleeve':     return !(inputs.installCamisao ?? []).some(v => v === 'yes' || v === 'contingency')
    case 'transponder_cot':    return inputs.transponderMode !== 'rov'
    case 'transponder_rov':    return inputs.transponderMode === 'rov'
    default:                   return true
  }
}

// Maps decision question text → a function that resolves the answer label from WizardInputs.
// Covers all decisions in logicSecs.ts that have no field/value set on their answers.
const QUESTION_LABEL_RESOLVER: Record<string, (inp: WizardInputs) => string | string[] | null> = {
  // ── MOB DP ──────────────────────────────────────────────────────────────────
  'Modo do transponder?':              inp => inp.transponderMode === 'cot' ? 'COT' : inp.transponderMode === 'rov' ? 'ROV' : null,
  'DMM — equipamento subsea no fundo?': inp => !inp.dmmWithEquipment ? 'Não' : 'Sim — Fase 1',
  'Cap de corrosão (CCAP)?':           inp => (inp.contingencyCcapWorkstring === 'yes' || inp.contingencyCcapWorkstring === 'contingency') ? 'Sim' : 'Não',
  'Retirar TCap?':                      inp => inp.tcapRemovalMethod ? 'Sim' : 'Não / N.A.',
  'Método de retirada da TCap?':        inp => inp.tcapRemovalMethod === 'rov' ? 'ROV' : 'TRT',
  'Destino da TCap?':                   inp => inp.tcapDisposition === 'surface' ? 'Superfície' : 'Fundeio',
  // ── DESCIDA ─────────────────────────────────────────────────────────────────
  'Fluido de riser inibido?':          inp => inp.riserFluid === 'inhibited' ? 'Sim' : 'N₂ / sem fluido',
  // ── CONEXÃO ─────────────────────────────────────────────────────────────────
  'Hidrato na ANM?':                   inp => inp.anmHydrate === 'no' ? 'Não' : (inp.anmHydrate === 'yes' || inp.anmHydrate === 'contingency') ? 'Sim' : null,
  'Contingência de válvula ANM?':      inp => (inp.anmValveContingency ?? []).includes('jateamento') ? 'Jateamento' : 'Nenhuma',
  'Instalação de camisão na DHSV?': inp => {
    const v = inp.installCamisao ?? []
    if (v.includes('yes') && !v.includes('contingency')) return 'Sim'
    if (v.includes('contingency')) return 'Contingência'
    return 'Não'
  },
  // ── GAB / ANULAR ────────────────────────────────────────────────────────────
  'Plug no TH?':                       inp => inp.hasThPlug === true ? 'Sim' : 'Não',
  'Amortecimento COP — fluido?': inp => {
    if (inp.initialFillFluid === 'diesel_fcba') return 'Diesel + FCBA'
    if (inp.initialFillFluid === 'inhibited')   return 'MEG + FCBA'
    if (inp.initialFillFluid === 'diesel')       return 'Diesel puro'
    return null
  },
  'Pressão no anular A?': inp => {
    if (inp.anularAMinPressure === 'zero') return 'Zero'
    if (inp.anularAMinPressure === 'nonzero') {
      return (inp.anularFluid === 'diesel' || inp.anularFluid === 'diesel_fcba') ? 'Top kill — diesel' : 'Top kill — MEG'
    }
    return null
  },
  'Realizar Registro de Pressão?':      inp => (inp.investigationLogs ?? []).includes('registro_pressao') ? 'Sim' : 'Não',
  // ── FLOWLINES ───────────────────────────────────────────────────────────────
  'Limpar flowlines?':                 inp => inp.cleanFlowlines === true ? 'Sim' : inp.cleanFlowlines === false ? 'Não' : null,
  'Hidrato nas flowlines?':            inp => (inp.flowlineHydrate === 'yes' || inp.flowlineHydrate === 'contingency') ? 'Sim / Conting.' : 'Não',
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
  'Risco de aprisionamento de coluna?': inp => (inp.hasStuckStringRisk === 'yes' || inp.hasStuckStringRisk === 'contingency') ? 'Sim / Conting.' : 'Não / N.A.',
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
    if (inp.fs1PerfProfunda === 'no') return 'Não perfurar'
    switch (inp.tubingPerfMethod) {
      case 'electric': return 'Cabo elétrico'
      case 'wireline': return 'Arame (eFire)'
      case 'ct':       return 'Flexitubo'
      default:         return null
    }
  },
  'Canhoneio raso + CSB Secundário?': inp => {
    const perf = inp.fs1PerfRasa !== 'no'
    const isTae = inp.fs1CsbSecondary === 'tae'
    if (perf && isTae)  return 'Perf. + TAE'
    if (perf)           return 'Perf. + Plug TH'
    if (isTae)          return 'S/ perf. + TAE'
    return 'S/ perf. + Plug TH'
  },
  // ── RETIRADA ────────────────────────────────────────────────────────────────
  'Retirar ANM?':                      inp => inp.removeANM === true ? 'Sim' : inp.removeANM === false ? 'Não' : null,
  // ── BDC ─────────────────────────────────────────────────────────────────────
  'Contingência TT-FT (coluna não estanque)?': inp => inp.contingencyTtFt ? 'Sim / Conting.' : 'Não prevista',
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
  'Coluna presa — corte? (conting.)':  inp => (inp.fs2CopCutContingency === 'yes' || inp.fs2CopCutContingency === 'contingency') ? 'Sim / Conting.' : 'Não',
  'Pescaria de packer?':               inp => (inp.fs2PackerFishing === 'yes' || inp.fs2PackerFishing === 'contingency') ? 'Sim / Conting.' : 'Não',
}

function resolveAnswer(dec: LDec, inputs: WizardInputs, key: string, isCustom: boolean): LAns | undefined {
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

  // 2. Try question-based label resolver (covers all bundle decisions without field/value).
  //    Em escopos custom o fluxo é definido por logicAnswers (passo 0) + o default `active`
  //    salvo no fluxograma — o resolver (mapeia inputs do wizard de bundle) não se aplica.
  if (!isCustom) {
    const resolver = QUESTION_LABEL_RESOLVER[dec.question]
    if (resolver) {
      const label = resolver(inputs)
      if (label !== null) {
        const labels = Array.isArray(label) ? label : [label]
        const byLabel = dec.answers.find(a => labels.includes(a.label))
        if (byLabel) return byLabel
      }
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
      ans = resolveAnswer(dec, inputs, key, isCustom)
      if (isCustom && ans && !scopeAnswers.has(norm)) scopeAnswers.set(norm, ans.label)
    }
    if (ans) {
      // Em escopo custom, a resposta "Contingência" (ou marcada com a flag `contingency`)
      // marca o ramo (e seus subníveis) como contingência, sem duplicar o bloco.
      const contingency = parentContingency || (isCustom && (isContingencyLabel(ans.label) || !!ans.contingency))
      const reason = contingency ? (parentContingency ? parentReason : `Contingência: ${dec.question}`) : undefined
      const ctx = contingency ? { reason: reason ?? 'Contingência' } : undefined
      for (const pkg of ans.packages ?? []) {
        emitPkg(pkg, fallbackPhase, percentile, items, inputs, ctx)
      }
      if (ans.sub?.length) {
        // O ramo segue pela resposta resolvida — o rótulo dela estende o caminho.
        walkDecisions(ans.sub, inputs, fallbackPhase, percentile, items, `${key}::${ans.label}`, isCustom, scopeAnswers, contingency, reason)
      }
      // Pacotes "após convergência" desta resposta — emitidos depois de toda a subárvore.
      for (const entry of ans.after ?? []) {
        for (const pkg of entry.packages ?? []) {
          emitPkg(pkg, fallbackPhase, percentile, items, inputs, ctx)
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

  const filtered = sections.filter(sec => {
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
  return applyTimeline(rebuilt)
}
