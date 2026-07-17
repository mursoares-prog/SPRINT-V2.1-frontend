import type { WizardInputs, ScheduleItem, Phase, Technology, SubseaEquipment, OperationMode, Percentile, ScopeId, YesContingencyNo, InvestigationLog, RcmaCementPkg, RigType } from '../types'
import { SEQUENCES } from '../data/sequences'
import { getPackage, getDuration } from '../data/packages'

let uid = 0
const nextUid = () => `item-${++uid}`

const yesOrConting = (v?: YesContingencyNo) => v === 'yes' || v === 'contingency'
const isConting = (v?: YesContingencyNo) => v === 'contingency'

function deriveBaseMode(scopeId: ScopeId): OperationMode {
  return scopeId.startsWith('FS2') ? 'through_casing' : 'through_tubing'
}

function getMountPackage(tech: Technology, rigType: RigType, opType: 'Generalista' | 'LWO', _mode: OperationMode): string | null {
  if (tech === 'wireline') {
    if (opType === 'LWO') return 'ABAN 031B'
    return rigType === 'ANC' ? 'ABAN 032' : 'ABAN 031A'
  }
  if (tech === 'ct') return rigType === 'ANC' ? 'ABAN 121' : 'ABAN 119'
  if (tech === 'electric') {
    if (_mode === 'through_casing') return null
    return rigType === 'ANC' ? 'ABAN 086' : 'ABAN 085'
  }
  return null
}

function getDismountPackage(tech: Technology, _rigType: RigType, opType: 'Generalista' | 'LWO', _mode: OperationMode): string | null {
  if (tech === 'wireline') return opType === 'LWO' ? 'ABAN 205' : 'ABAN 204'
  if (tech === 'electric') {
    if (_mode === 'through_casing') return null
    return opType === 'LWO' ? 'ABAN 242' : 'ABAN 243'
  }
  if (tech === 'ct') return opType === 'LWO' ? 'ABAN 148' : 'ABAN 161'
  return null
}

function addItem(
  items: ScheduleItem[],
  packageId: string,
  phase: Phase,
  percentile: Percentile,
  opts: Partial<Pick<ScheduleItem, 'isContingency' | 'contingencyReason' | 'autoInserted' | 'transitionTechnology' | 'annularBore'>> = {}
) {
  const pkg = getPackage(packageId)
  if (!pkg) return
  items.push({
    uid: nextUid(),
    packageId,
    packageName: pkg.name,
    category: pkg.category,
    technology: pkg.technology,
    transitionTechnology: opts.transitionTechnology,
    phase,
    duration: getDuration(packageId, percentile),
    isContingency: opts.isContingency ?? false,
    contingencyReason: opts.contingencyReason,
    autoInserted: opts.autoInserted,
    annularBore: opts.annularBore,
    startDay: 0,
    endDay: 0,
  })
}

export function applyTimeline(items: ScheduleItem[]): ScheduleItem[] {
  let day = 0
  return items.map(item => {
    const start = day
    day += item.duration
    return { ...item, startDay: start, endDay: day }
  })
}

export function generateSchedule(inputs: WizardInputs): ScheduleItem[] {
  uid = 0
  const { rigType, operationType, scopeId, percentile } = inputs
  const equipments: SubseaEquipment[] = inputs.subseaEquipments ?? []
  const baseMode = deriveBaseMode(scopeId)
  // Escopos que compartilham a Fase 1 do FS1_Mec (CSB primário/secundário + perfuração profunda/rasa)
  const usesFs1Barrier = scopeId === 'FS1_Mec' || scopeId === 'FSU_Conv_BOP' || scopeId === 'FSU_Conv_RCMA'
    || scopeId === 'FSU_Sup_COP' || scopeId === 'FSU_Sup_PWC'
  const rcmaFluidCsb = scopeId === 'FSU_Conv_RCMA' && inputs.rcmaCsbPrincipal === 'fluid_csb'
  const seq = SEQUENCES[scopeId]
  if (!seq) return []
  const steps = rigType === 'ANC' ? seq.ANC : seq.DP

  const items: ScheduleItem[] = []
  let currentTech: Technology = 'none'
  let bopActive = false
  let postPerfProcessed = false  // true após PERF_INJECT; controla skip do amortecimento de coluna pós-canhoneio

  for (const step of steps) {
    // ─── Condições ────────────────────────────────────────────────
    if (step.condition === 'clean_flowlines' && !inputs.cleanFlowlines) continue
    if (step.condition === 'remove_anm'     && !inputs.removeANM)       continue
    if (step.condition === 'not_remove_anm' && inputs.removeANM)        continue
    if (step.condition === 'no_pdi'         && inputs.hasPDI !== false)  continue
    if (step.condition === 'stuck_risk'     && !yesOrConting(inputs.hasStuckStringRisk)) continue
    if (step.condition === 'dhsv_no_sleeve'  && (inputs.installCamisao ?? []).some(v => v === 'yes' || v === 'contingency')) continue
    if (step.condition === 'transponder_cot' && inputs.transponderMode === 'rov') continue
    if (step.condition === 'transponder_rov' && inputs.transponderMode !== 'rov') continue
    if (step.condition === 'fejat'           && !yesOrConting(inputs.contingencyFejat)) continue

    // ─── Injeção pós-mobilização (CCAP + TCap por ROV) ──────────
    if (step.packageId === 'POST_MOB_INJECT') {
      const hasCC = equipments.includes('corrosion_cap')
      if (hasCC) {
        const ccapMethod = inputs.ccapRemovalMethod ?? (operationType === 'LWO' ? 'cable' : 'workstring')
        const ccapPkg = ccapMethod === 'cable' ? 'ABAN 009' : 'ABAN 008'
        const ccapContingReason = ccapMethod === 'cable'
          ? 'Contingência: retirada de CCAP a cabo'
          : 'Contingência: retirada de CCAP com coluna de trabalho (garatéia)'
        if (inputs.corrosionCapBeforeIntervention === false) {
          // CCAP retirada durante a intervenção (não pela embarcação de apoio)
          addItem(items, ccapPkg, 'Fase 0', percentile)
        } else if (inputs.corrosionCapBeforeIntervention === true) {
          // CCAP retirada antes pela embarcação — contingências se falhar
          if (inputs.includeCcapBackup !== false) {
            addItem(items, ccapPkg, 'Fase 0', percentile, {
              isContingency: true,
              contingencyReason: 'Contingência: CCAP não retirada pela embarcação de apoio',
            })
          }
          if (yesOrConting(inputs.contingencyCcapWorkstring)) {
            const ccapConting = isConting(inputs.contingencyCcapWorkstring)
            addItem(items, ccapPkg, 'Fase 0', percentile, {
              isContingency: ccapConting,
              contingencyReason: ccapConting ? ccapContingReason : undefined,
            })
          }
        } else {
          // corrosionCapBeforeIntervention não definido (ex: FS2) — usa contingencyCcapWorkstring
          if (yesOrConting(inputs.contingencyCcapWorkstring)) {
            const ccapConting = isConting(inputs.contingencyCcapWorkstring)
            addItem(items, ccapPkg, 'Fase 0', percentile, {
              isContingency: ccapConting,
              contingencyReason: ccapConting ? ccapContingReason : undefined,
            })
          }
        }
      }
      // TCap retirada por ROV durante a intervenção: ABAN 010 vem após a CCAP
      const hasTreeCap = equipments.includes('tree_cap') || equipments.includes('mini_tree_cap')
      if (hasTreeCap && inputs.tcapRemovalMethod === 'rov') {
        addItem(items, 'ABAN 010', 'Fase 0', percentile)
      }
      continue
    }

    // ─── Montagem de ITF (LWO) + flush do riser na descida (DP) ──────────────────
    // Emite ABAN 206 na descida apenas quando não há TCap de coluna de trabalho; nesse caso o
    // TCAP_INJECT emite ABAN 206 após o fundeio/re-descida. O flush do DPR/HCR (ABAN 014, só DP)
    // segue a mesma regra, em LWO e Generalista: com TCap de coluna ele é adiado ao TCAP_INJECT
    // (lá fica após o desassentamento, imediatamente antes do ABAN 023). Sem TCap de coluna o
    // flush é emitido na descida — já imediatamente antes do ABAN 023, pois nada se interpõe.
    // LWO: flush sempre APÓS o ITF (ABAN 206). ANC: flush (ABAN 015) em RISER_FLUID_INJECT.
    if (step.packageId === 'ITF_INJECT') {
      const hasWorkstringTcap = equipments.includes('tree_cap') && inputs.tcapRemovalMethod !== 'rov'
      // TCap de ANC retirada por ROV: TCAP_INJECT retorna cedo e RISER_FLUID_INJECT é pulado
      // (ANC + tree_cap), então o arranjo de superfície e o flush (ABAN 015) são emitidos aqui,
      // na descida — análogo ao ABAN 015 que seria emitido nos demais cenários ANC.
      const ancTcapByRov = rigType === 'ANC' && equipments.includes('tree_cap') && inputs.tcapRemovalMethod === 'rov'
      if (operationType === 'LWO') {
        if (!hasWorkstringTcap) {
          addItem(items, 'ABAN 206', step.phase, percentile)
          if (rigType === 'DP') addItem(items, 'ABAN 014', step.phase, percentile)
          else if (ancTcapByRov) addItem(items, 'ABAN 015', step.phase, percentile)
        }
      } else if (rigType === 'DP' && !hasWorkstringTcap) {
        // Generalista: montagem de SFT e arranjo de superfície (ABAN 246) antes do flush —
        // análogo ao ABAN 206 (Montagem de ITF) usado em LWO.
        addItem(items, 'ABAN 246', step.phase, percentile)
        addItem(items, 'ABAN 014', step.phase, percentile)
      } else if (ancTcapByRov) {
        // Generalista, ANC com TCap por ROV: montagem do Terminal Head (ABAN 247) e flush na descida.
        addItem(items, 'ABAN 247', step.phase, percentile)
        addItem(items, 'ABAN 015', step.phase, percentile)
      }
      continue
    }

    // ─── Dissociação de hidrato na ANM (após teste funcional) ────────
    // Controlado por anmHydrate (gate) + opção 'hydrate' em anmValveContingency.
    // Blocos padrão: produção e anular (seleção removida da UI).
    if (step.packageId === 'ANM_HYDRATE_INJECT') {
      if (yesOrConting(inputs.anmHydrate) && (inputs.anmValveContingency ?? []).includes('hydrate')) {
        const conting = isConting(inputs.anmHydrate)
        const blocks: ('producao' | 'anular')[] = ['producao', 'anular']
        for (const block of blocks) {
          if (block === 'producao') addItem(items, rigType === 'ANC' ? 'ABAN 169' : 'ABAN 165', step.phase, percentile, {
            isContingency: conting,
            contingencyReason: conting ? 'Contingência: dissociação de hidrato na ANM — bloco de produção' : undefined,
          })
          if (block === 'anular') addItem(items, rigType === 'ANC' ? 'ABAN 170' : 'ABAN 166', step.phase, percentile, {
            isContingency: conting,
            contingencyReason: conting ? 'Contingência: dissociação de hidrato na ANM — bloco de anular' : undefined,
          })
        }
      }
      continue
    }

    // ─── Jateamento/gabaritagem FT para abertura de válvulas da ANM ─
    if (step.packageId === 'ANM_VALVE_INJECT') {
      // Espelha o Python: com plug no bore de produção do TMF as válvulas não são abertas.
      const hasProdBorePlug = !!inputs.hasTmfPlug && (inputs.tmfPlugBores ?? []).includes('production')
      if (!hasProdBorePlug) {
        const conts = inputs.anmValveContingency ?? []
        if (conts.includes('jateamento'))
          addItem(items, 'ABAN 125', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: jateamento com flexitubo para abertura de válvulas da ANM' })
        if (conts.includes('gabarit_ft'))
          addItem(items, 'ABAN 124', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: gabaritagem com motor de fundo e broca para abertura de válvulas da ANM' })
      }
      continue
    }

    // ─── Abertura de válvula da ANM com FT (após testes de bloco) ────
    if (step.packageId === 'ANM_FORCE_INJECT') {
      if (yesOrConting(inputs.anmForceOpen)) {
        const forceConting = isConting(inputs.anmForceOpen)
        const methods = inputs.anmForceMethod ?? []
        if (methods.includes('hammer'))
          addItem(items, 'ABAN 143', step.phase, percentile, { isContingency: forceConting, contingencyReason: forceConting ? 'Contingência: abertura de válvula da ANM com martelete (FT)' : undefined })
        if (methods.includes('motor_broca'))
          addItem(items, 'ABAN 124', step.phase, percentile, { isContingency: forceConting, contingencyReason: forceConting ? 'Contingência: gabaritagem com motor de fundo e broca para abertura de válvulas da ANM' : undefined })
      }
      continue
    }

    // ─── Retirada de TCap (após descida do WO, nunca antes da TRT) ─
    if (step.packageId === 'TCAP_INJECT') {
      if (inputs.tcapRemovalMethod === 'rov') continue  // ROV: ABAN 010 já inserido em POST_MOB_INJECT
      const hasTC = equipments.includes('tree_cap')
      if (hasTC) {
        // Descida do conjunto de WO para retirada da TCAP:
        // DP com DPR/HCR (ABAN 244); ANC com Riser Dual Bore (ABAN 245)
        addItem(items, rigType === 'ANC' ? 'ABAN 245' : 'ABAN 244', step.phase, percentile)
        addItem(items, 'ABAN 018', step.phase, percentile)
        addItem(items, 'ABAN 019', step.phase, percentile)
        // Hidrato no conector da TCap: dissociado APÓS o desassentamento da TCap (ABAN 020/021/022).
        const emitTcapHydrateContingency = () => {
          if (yesOrConting(inputs.contingencyTcapHydrate)) {
            addItem(items, 'ABAN 177', step.phase, percentile, {
              isContingency: isConting(inputs.contingencyTcapHydrate),
              contingencyReason: isConting(inputs.contingencyTcapHydrate)
                ? 'Contingência: dissociação de hidrato no conector da TCap — jateamento de água aquecida'
                : undefined,
            })
          }
        }
        if (inputs.tcapDisposition === 'surface') {
          addItem(items, rigType === 'ANC' ? 'ABAN 022' : 'ABAN 021', step.phase, percentile)
          emitTcapHydrateContingency()
          // Re-descida do conjunto de WO após subida da TCap à superfície (sem re-prep separado)
          addItem(items, rigType === 'ANC' ? 'ABAN 012' : 'ABAN 011', step.phase, percentile)
          // Arranjo de superfície antes do flush: LWO monta o ITF (ABAN 206); Generalista monta
          // o SFT (DP → ABAN 246) ou o Terminal Head (ANC → ABAN 247).
          if (operationType === 'LWO') addItem(items, 'ABAN 206', step.phase, percentile)
          else addItem(items, rigType === 'ANC' ? 'ABAN 247' : 'ABAN 246', step.phase, percentile)
          // Flush (ANC: ABAN 015 / DP: ABAN 014) imediatamente antes do fluido (ABAN 017/209/217).
          // A descida inicial do WO para retirada da TCAP está contida em ABAN 244/245.
          addItem(items, rigType === 'ANC' ? 'ABAN 015' : 'ABAN 014', step.phase, percentile)
          const surfFluid = inputs.tcapSurfaceFluid ?? 'n2'
          if (surfFluid === 'n2') {
            addItem(items, rigType === 'ANC' ? 'ABAN 017' : 'ABAN 016', step.phase, percentile)
          } else if (surfFluid === 'inhibited_pre') {
            addItem(items, rigType === 'ANC' ? 'ABAN 209' : 'ABAN 215', step.phase, percentile)
          }
          // inhibited_post: o fluido inibido pós-conexão (ABAN 217/216) só é posicionado APÓS a
          // reentrada na ANM (ABAN 023) — emitido em POST_ANM_FLUID_INJECT, não aqui. O flush
          // acima permanece (independente do fluido pós-conexão).
        } else {
          addItem(items, 'ABAN 020', step.phase, percentile)  // fundeio
          emitTcapHydrateContingency()
          // Arranjo de superfície antes do flush: LWO monta o ITF (ABAN 206); Generalista monta
          // o SFT (DP → ABAN 246) ou o Terminal Head (ANC → ABAN 247).
          if (operationType === 'LWO') addItem(items, 'ABAN 206', step.phase, percentile)
          else addItem(items, rigType === 'ANC' ? 'ABAN 247' : 'ABAN 246', step.phase, percentile)
          // Flush (ANC: ABAN 015 / DP: ABAN 014) imediatamente antes do posicionamento de fluido
          // (ABAN 017/209) após o desassentamento da TCap — na Fase 1A.
          addItem(items, rigType === 'ANC' ? 'ABAN 015' : 'ABAN 014', step.phase, percentile)
          if (!inputs.riserFluid || inputs.riserFluid === 'n2') {
            addItem(items, rigType === 'ANC' ? 'ABAN 017' : 'ABAN 016', step.phase, percentile)
          } else {
            addItem(items, rigType === 'ANC' ? 'ABAN 209' : 'ABAN 215', step.phase, percentile)
          }
        }
      }
      continue
    }

    // ─── Fluido inibido pós-conexão (após reentrada na ANM) ───────
    // ABAN 217 (ANC) / ABAN 216 (DP): só pode ser previsto APÓS o ABAN 023 (reentrada na ANM),
    // quando a TCap foi disposta em superfície com fluido inibido pós-conexão. Sem relação com o flush.
    if (step.packageId === 'POST_ANM_FLUID_INJECT') {
      if (equipments.includes('tree_cap') && inputs.tcapRemovalMethod !== 'rov' &&
          inputs.tcapDisposition === 'surface' && inputs.tcapSurfaceFluid === 'inhibited_post') {
        addItem(items, rigType === 'ANC' ? 'ABAN 217' : 'ABAN 216', step.phase, percentile)
      }
      continue
    }

    // ─── Injeção de limpeza de flowlines ──────────────────────────
    if (step.packageId === 'FLOWLINE_INJECT') {
      const lines  = inputs.flowlineLines  ?? ['flpo']
      const method = inputs.flowlineMethod ?? 'direct_pumping'

      // Dissociação de hidrato nas flowlines antes da limpeza (se previsto)
      if (yesOrConting(inputs.flowlineHydrate)) {
        const flConting = isConting(inputs.flowlineHydrate)
        const hasBrv = inputs.dhsvBrvType === 'insertable'
        const hydrateLines = inputs.flowlineHydrateLines ?? lines
        for (const line of hydrateLines) {
          if (line === 'flpo') addItem(items, rigType === 'ANC'
            ? (hasBrv ? 'ABAN 175' : 'ABAN 171')
            : (hasBrv ? 'ABAN 173' : 'ABAN 167'), step.phase, percentile,
            { isContingency: flConting, contingencyReason: flConting ? 'Contingência: dissociação de hidrato na flowline de produção' : undefined })
          if (line === 'flgl') addItem(items, rigType === 'ANC'
            ? (hasBrv ? 'ABAN 176' : 'ABAN 172')
            : (hasBrv ? 'ABAN 174' : 'ABAN 168'), step.phase, percentile,
            { isContingency: flConting, contingencyReason: flConting ? 'Contingência: dissociação de hidrato na flowline de gas lift' : undefined })
        }
      }

      if (method === 'n2_lift') {
        addItem(items, 'ABAN 254', step.phase, percentile)
      } else {
        if (lines.includes('flpo')) addItem(items, 'ABAN 066', step.phase, percentile)
        if (lines.includes('flgl')) addItem(items, 'ABAN 067', step.phase, percentile)
      }
      continue
    }

    // ─── Fluido de posicionamento no riser ────────────────────────
    if (step.packageId === 'RISER_FLUID_INJECT') {
      // ANC com TCap: flush e desalagamento só após desassentamento (em TCAP_INJECT)
      if (rigType === 'ANC' && equipments.includes('tree_cap')) continue
      // DP com TCap de coluna de trabalho (LWO ou Generalista): o fluido (ABAN 016/215) é emitido
      // em TCAP_INJECT após o desassentamento — imediatamente antes do ABAN 023 (e, em LWO, após o
      // ITF/ABAN 206). Sem TCap de coluna, o fluido fica na descida, já imediatamente antes do 023.
      if (rigType === 'DP' &&
          equipments.includes('tree_cap') && inputs.tcapRemovalMethod !== 'rov') continue
      if (rigType === 'ANC') {
        // Generalista: montagem do Terminal Head e arranjo de superfície (ABAN 247) antes do
        // flush — análogo ao ABAN 206 (Montagem de ITF) usado em LWO.
        if (operationType !== 'LWO') addItem(items, 'ABAN 247', step.phase, percentile)
        addItem(items, 'ABAN 015', step.phase, percentile)
      }
      if (!inputs.riserFluid || inputs.riserFluid === 'n2') {
        addItem(items, rigType === 'ANC' ? 'ABAN 017' : 'ABAN 016', step.phase, percentile)
      } else {
        addItem(items, rigType === 'ANC' ? 'ABAN 209' : 'ABAN 215', step.phase, percentile)
      }
      continue
    }

    // ─── Limpeza/Amortecimento COP: diesel / diesel+FCBA / MEG+FCBA ─
    if (step.packageId === 'LIMPEZA_INJECT') {
      // Poço já isolado: não amortecer na Fase 1A
      if (inputs.killWellFase1A === 'no') continue
      // STDV mantida instalada (BDC/ANC): skip do amortecimento de coluna pós-canhoneio
      if (postPerfProcessed && scopeId === 'FSU_TT_BDC' && rigType === 'ANC' && inputs.stdvDispositionAfterTest === 'keep') {
        continue
      }
      const hasCamisaoConting = (inputs.installCamisao ?? []).includes('contingency')
      // Se camisão contingencial: forçar diesel (ABAN 061), independente do input
      const pkg = hasCamisaoConting ? 'ABAN 061'
        : inputs.initialFillFluid === 'inhibited' ? 'ABAN 062'
        : inputs.initialFillFluid === 'diesel' ? 'ABAN 219'
        : 'ABAN 061'
      const killConting = inputs.killWellFase1A === 'contingency'
      addItem(items, pkg, step.phase, percentile, killConting
        ? { isContingency: true, contingencyReason: 'Contingência: amortecimento da COP/COI' }
        : {})
      continue
    }

    // ─── Teste de funcionalidade da DHSV após amortecimento (camisão contingencial) ──
    if (step.packageId === 'DHSV_TEST_INJECT') {
      if ((inputs.installCamisao ?? []).includes('contingency')) {
        addItem(items, 'ABAN 030', step.phase, percentile)
      }
      continue
    }

    // ─── Anular A: despressurização + preenchimento (063/064/065 mutuamente exclusivos) ─
    if (step.packageId === 'ANULAR_A_INJECT') {
      // Poço já isolado (não amortecer): no lugar da despressurização do anular A,
      // confirma a estanqueidade do poço (ABAN 226).
      if (inputs.killWellFase1A === 'no') {
        addItem(items, 'ABAN 226', step.phase, percentile)
        continue
      }
      const killConting = inputs.killWellFase1A === 'contingency'
      // Amortecimento contingencial: testar estanqueidade antes (firme); só amortecer se reprovar.
      if (killConting) addItem(items, 'ABAN 226', step.phase, percentile)
      const pkg = inputs.anularAMinPressure === 'nonzero'
        ? (inputs.anularFluid === 'diesel' ? 'ABAN 064' : 'ABAN 065')
        : 'ABAN 063'
      addItem(items, pkg, step.phase, percentile, killConting
        ? { isContingency: true, contingencyReason: 'Contingência: despressurização/preenchimento do anular A' }
        : {})
      continue
    }

    // ─── Teste de coluna com STDV antes do canhoneio (TT-BDC) ────────────────
    if (step.packageId === 'STDV_TEST_INJECT') {
      if (inputs.testColumnWithStdv) {
        addItem(items, 'ABAN 038', step.phase, percentile)  // descida STV 2,75" (preferencial)
        if (inputs.stdvDispositionAfterTest !== 'keep') {
          addItem(items, 'ABAN 048', step.phase, percentile)  // retirada de STV (somente se não mantida)
        }
      }
      continue
    }

    // ─── Perfuração da COP/COI: eFire (arame) ou tubing puncher (cabo elétrico) ──
    if (step.packageId === 'PERF_INJECT') {
      const eff: OperationMode = bopActive ? 'through_casing' : baseMode
      const amortPkg = 'ABAN 255'  // amortecimento de Anular A pós-canhoneio (bullheading FCBA)
      // Amortecimento da Fase 1A: 'no' = poço já isolado (não amortecer); 'contingency' = só contingência
      const killNo = inputs.killWellFase1A === 'no'
      const killAmortOpts = inputs.killWellFase1A === 'contingency'
        ? { isContingency: true as const, contingencyReason: 'Contingência: amortecimento do anular A pós-canhoneio' }
        : {}
      // Fase 1 (FS1_Mec / Conv / RCMA): canhoneio profundo da coluna, controlado por fs1PerfProfunda.
      // A tecnologia segue tubingPerfMethod — a cabo: tubing puncher (ABAN 101); a arame: eFire
      // (ABAN 045); flexitubo: tubing puncher FT (ABAN 154). O canhoneio raso é feito depois, antes
      // do CSB secundário. "Não perfurar" remove o pacote e o amortecimento de anular a ele associado.
      // RCMA com CSB principal = fluido eCSB: sem perfuração.
      if (usesFs1Barrier) {
        if (!rcmaFluidCsb && (inputs.fs1PerfProfunda ?? 'yes') === 'yes') {
          const method = inputs.tubingPerfMethod ?? 'electric'
          const perfTech: Technology = method === 'wireline' ? 'wireline' : method === 'ct' ? 'ct' : 'electric'
          const perfPkg = method === 'wireline' ? 'ABAN 045' : method === 'ct' ? 'ABAN 154' : 'ABAN 101'
          if (currentTech !== perfTech) {
            if (currentTech !== 'none') {
              const dis = getDismountPackage(currentTech, rigType, operationType, eff)
              if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
            }
            const mnt = getMountPackage(perfTech, rigType, operationType, eff)
            if (mnt) addItem(items, mnt, step.phase, percentile, { autoInserted: true })
            currentTech = perfTech
          }
          addItem(items, perfPkg, step.phase, percentile)
          if (!killNo) addItem(items, amortPkg, step.phase, percentile, killAmortOpts)
        }
        postPerfProcessed = true
        continue
      }
      // STDV mantida instalada após teste (BDC/ANC): amortecimento de anular pós-canhoneio não previsto
      const skipAmort = scopeId === 'FSU_TT_BDC' && rigType === 'ANC' && inputs.stdvDispositionAfterTest === 'keep'
      if (inputs.tubingPerfMethod === 'wireline') {
        addItem(items, 'ABAN 045', step.phase, percentile)
        if (!skipAmort && !killNo) addItem(items, amortPkg, step.phase, percentile, killAmortOpts)
      } else {
        // cabo elétrico (ABAN 101) ou flexitubo (ABAN 154), com transição da tecnologia ativa
        const perfTech: Technology = inputs.tubingPerfMethod === 'ct' ? 'ct' : 'electric'
        const perfPkg = inputs.tubingPerfMethod === 'ct' ? 'ABAN 154' : 'ABAN 101'
        if (currentTech !== perfTech) {
          if (currentTech !== 'none') {
            const dis = getDismountPackage(currentTech, rigType, operationType, eff)
            if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
          }
          const mnt = getMountPackage(perfTech, rigType, operationType, eff)
          if (mnt) addItem(items, mnt, step.phase, percentile, { autoInserted: true })
          currentTech = perfTech
        }
        addItem(items, perfPkg, step.phase, percentile)
        if (!skipAmort && !killNo) addItem(items, amortPkg, step.phase, percentile, killAmortOpts)
      }
      postPerfProcessed = true
      continue
    }

    // ─── Jateamento pré-cimentação ────────────────────────────────────────────
    if (step.packageId === 'JATEAR_INJECT') {
      if (inputs.csbPrimary !== 'inflatable_packer' && yesOrConting(inputs.jatearCopCoi)) {
        const conting125 = isConting(inputs.jatearCopCoi)
        addItem(items, 'ABAN 125', step.phase, percentile, {
          isContingency: conting125,
          contingencyReason: conting125 ? 'Contingência: jateamento COP/COI com FT' : undefined,
        })
      }
      continue
    }

    // ─── CSB primário (STDV / plug / TAE / packer) ────────────────
    if (step.packageId === 'CSB_INJECT') {
      // STDV mantida instalada após teste (BDC/ANC): base já instalada, pular CSB
      if (scopeId === 'FSU_TT_BDC' && rigType === 'ANC' && inputs.stdvDispositionAfterTest === 'keep') {
        continue
      }
      // TT-BDC em sonda DP: base para cimentação TT sempre com TAE (padronizado)
      const csb = (scopeId === 'FSU_TT_BDC' && rigType === 'DP') ? 'tae' : (inputs.csbPrimary ?? 'stdv')
      const csbPkgId = csb === 'plug' ? 'ABAN 040'
        : csb === 'tae' ? 'ABAN 237'
        : csb === 'inflatable_packer' ? 'ABAN 162'
        : 'ABAN 038'
      const csbPkg = getPackage(csbPkgId)
      if (csbPkg) {
        const newTech = csbPkg.technology
        const effectiveModeNow: OperationMode = bopActive ? 'through_casing' : baseMode
        if (newTech !== 'none' && newTech !== currentTech) {
          if (currentTech !== 'none') {
            const dis = getDismountPackage(currentTech, rigType, operationType, effectiveModeNow)
            if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
          }
          const mnt = getMountPackage(newTech, rigType, operationType, effectiveModeNow)
          if (mnt) addItem(items, mnt, step.phase, percentile, { autoInserted: true })
          currentTech = newTech
        }
        if (csb === 'inflatable_packer') {
          addItem(items, 'ABAN 125', step.phase, percentile)
        }
        addItem(items, csbPkgId, step.phase, percentile)
      }
      continue
    }

    // ─── Cimentação FT: single / successive / distinct ───────────
    if (step.packageId === 'FT_CEMENT_INJECT') {
      const ftMode = inputs.ttFtCementMode ?? 'single'
      const loggingMode = inputs.loggingMode ?? 'polias'
      const eff: OperationMode = bopActive ? 'through_casing' : baseMode

      const transition = (toTech: Technology, opts: Partial<Pick<ScheduleItem, 'isContingency' | 'contingencyReason'>> = {}) => {
        if (toTech === currentTech || toTech === 'none') return
        if (currentTech !== 'none') {
          const d = getDismountPackage(currentTech, rigType, operationType, eff)
          if (d) addItem(items, d, step.phase, percentile, { autoInserted: true, ...opts })
        }
        const m = getMountPackage(toTech, rigType, operationType, eff)
        if (m) addItem(items, m, step.phase, percentile, { autoInserted: true, ...opts })
        currentTech = toTech
      }

      // Desmobiliza tecnologia ativa antes das operações com jogo de polias
      const dismountForPolias = (opts: Partial<Pick<ScheduleItem, 'isContingency' | 'contingencyReason'>> = {}) => {
        if (currentTech !== 'none') {
          const dis = getDismountPackage(currentTech, rigType, operationType, eff)
          if (dis) addItem(items, dis, step.phase, percentile, opts)
          currentTech = 'none'
        }
      }

      if (ftMode === 'single') {
        addItem(items, 'ABAN 156', step.phase, percentile)
        if (loggingMode === 'pressure_equipment') {
          // Equipamento de pressão: monta unidade sobre TH (ABAN 086) → avaliação de cimento
          transition('electric')
          addItem(items, 'ABAN 105', step.phase, percentile)
        } else {
          // Jogo de polias: desmobiliza o que estiver montado, opera sem montagem de unidade
          dismountForPolias()
          addItem(items, 'ABAN 234', step.phase, percentile, { transitionTechnology: 'none' as Technology })
          addItem(items, 'ABAN 105', step.phase, percentile, { transitionTechnology: 'none' as Technology })
        }
      } else if (ftMode === 'distinct') {
        addItem(items, 'ABAN 155', step.phase, percentile)
        if (loggingMode === 'pressure_equipment') {
          transition('electric')
          addItem(items, 'ABAN 105', step.phase, percentile)
          transition('ct')
          addItem(items, 'ABAN 157', step.phase, percentile)
        } else {
          dismountForPolias()
          addItem(items, 'ABAN 105', step.phase, percentile, { transitionTechnology: 'none' as Technology })
          transition('ct')
          addItem(items, 'ABAN 157', step.phase, percentile)
          dismountForPolias()
          addItem(items, 'ABAN 234', step.phase, percentile, { transitionTechnology: 'none' as Technology })
        }
      } else {
        // Duas etapas sucessivas: perfilagem contingencial após 1ª etapa
        addItem(items, 'ABAN 155', step.phase, percentile)
        const evalConting = {
          isContingency: true,
          contingencyReason: 'Contingência: perfilagem de cimento se parâmetros da 1ª etapa inconclusivos',
        }
        if (loggingMode === 'polias') {
          if (currentTech !== 'none') {
            const dis = getDismountPackage(currentTech, rigType, operationType, eff)
            if (dis) addItem(items, dis, step.phase, percentile, evalConting)
            currentTech = 'none'
          }
        }
        addItem(items, 'ABAN 105', step.phase, percentile, {
          ...evalConting,
          transitionTechnology: loggingMode === 'polias' ? 'none' as Technology : undefined,
        })
        if (loggingMode === 'polias') {
          const m = getMountPackage('ct', rigType, operationType, eff)
          if (m) addItem(items, m, step.phase, percentile, evalConting)
          currentTech = 'ct'
        }
        addItem(items, 'ABAN 157', step.phase, percentile)
        if (loggingMode !== 'pressure_equipment') {
          dismountForPolias()
          addItem(items, 'ABAN 234', step.phase, percentile, { transitionTechnology: 'none' as Technology })
        }
      }

      if (inputs.perforationTestContingency) {
        const pOpts = { isContingency: true as const, contingencyReason: 'Contingência: canhoneio deep penetration (cabo elétrico) + BPP inflável com FT' }
        addItem(items, 'ABAN 102', step.phase, percentile, pOpts)
        addItem(items, 'ABAN 162', step.phase, percentile, pOpts)
      }

      // Desmonta tecnologia ativa com item não-autoInserted para posicionar antes da retirada do WO
      if (currentTech !== 'none' && currentTech !== 'bop') {
        const dis = getDismountPackage(currentTech, rigType, operationType, eff)
        if (dis) addItem(items, dis, step.phase, percentile)
        currentTech = 'none'
      }
      continue
    }

    // ─── Cimentação BDC: parâmetros (083) ou perfilagem (084) ────
    if (step.packageId === 'BDC_CEMENT_INJECT') {
      addItem(items, inputs.cementMethod === 'logging' ? 'ABAN 084' : 'ABAN 083', step.phase, percentile)
      if (inputs.perforationTestContingency) {
        const pOpts = { isContingency: true as const, contingencyReason: 'Contingência: canhoneio deep penetration (cabo elétrico) + BPP inflável com FT' }
        addItem(items, 'ABAN 102', step.phase, percentile, pOpts)
        addItem(items, 'ABAN 162', step.phase, percentile, pOpts)
      }
      continue
    }

    // ─── Contingência TT-FT para TT-BDC (coluna não estanque) ───
    if (step.packageId === 'BDC_FT_CONTING_INJECT') {
      if (inputs.contingencyTtFt) {
        const ftMode = inputs.ttFtCementMode ?? 'single'
        const loggingMode = inputs.loggingMode ?? 'polias'
        const conting = {
          isContingency: true as const,
          contingencyReason: 'Contingência TT-FT: coluna não estanque — jateamento e cimentação com FT',
        }
        const contPolias = { ...conting, transitionTechnology: 'none' as Technology }

        addItem(items, 'ABAN 125', step.phase, percentile, conting)

        if (ftMode === 'single') {
          addItem(items, 'ABAN 156', step.phase, percentile, conting)
          if (loggingMode === 'pressure_equipment') {
            addItem(items, 'ABAN 105', step.phase, percentile, conting)
          } else {
            addItem(items, 'ABAN 234', step.phase, percentile, contPolias)
            addItem(items, 'ABAN 105', step.phase, percentile, contPolias)
          }
        } else if (ftMode === 'distinct') {
          addItem(items, 'ABAN 155', step.phase, percentile, conting)
          if (loggingMode === 'pressure_equipment') {
            addItem(items, 'ABAN 105', step.phase, percentile, conting)
            addItem(items, 'ABAN 157', step.phase, percentile, conting)
          } else {
            addItem(items, 'ABAN 105', step.phase, percentile, contPolias)
            addItem(items, 'ABAN 157', step.phase, percentile, conting)
            addItem(items, 'ABAN 234', step.phase, percentile, contPolias)
          }
        } else {
          // successive
          addItem(items, 'ABAN 155', step.phase, percentile, conting)
          addItem(items, 'ABAN 105', step.phase, percentile,
            loggingMode === 'polias' ? contPolias : conting)
          addItem(items, 'ABAN 157', step.phase, percentile, conting)
          if (loggingMode !== 'pressure_equipment') {
            addItem(items, 'ABAN 234', step.phase, percentile, contPolias)
          }
        }

        if (inputs.perforationTestContingency) {
          addItem(items, 'ABAN 102', step.phase, percentile, conting)
          addItem(items, 'ABAN 162', step.phase, percentile, conting)
        }
      }
      continue
    }

    // ─── CSB principal RCMA (Não Surgência / Fluido e CSB / Tampão de cimento) ──
    if (step.packageId === 'RCMA_CSB_PRINCIPAL_INJECT') {
      if (inputs.rcmaCsbPrincipal === 'cement_plug') {
        const PKG_ORDER: RcmaCementPkg[] = ['ABAN 159', 'ABAN 160', 'ABAN 078', 'ABAN 079', 'ABAN 080', 'ABAN 081', 'ABAN 082', 'ABAN 083', 'ABAN 084']
        for (const pkgId of PKG_ORDER) {
          if ((inputs.rcmaCementPkgs ?? []).includes(pkgId)) {
            addItem(items, pkgId, step.phase, percentile)
          }
        }
      }
      continue
    }

    // ─── CSB primário FS1_Mec (já instalado / STDV / plug / TAE / tampão de cimento) ──
    if (step.packageId === 'FS1_CSB_PRIMARY_INJECT') {
      if (inputs.fs1CsbAlreadyInstalled === true) { continue }
      const csb = inputs.fs1CsbPrimary ?? 'tae'
      const effMode: OperationMode = bopActive ? 'through_casing' : baseMode
      const trans = (toTech: Technology) => {
        if (toTech === currentTech || toTech === 'none') return
        if (currentTech !== 'none') {
          const d = getDismountPackage(currentTech, rigType, operationType, effMode)
          if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
        }
        const m = getMountPackage(toTech, rigType, operationType, effMode)
        if (m) addItem(items, m, step.phase, percentile, { autoInserted: true })
        currentTech = toTech
      }
      if (csb === 'tae') {
        trans('electric')
        addItem(items, 'ABAN 237', step.phase, percentile)
      } else if (csb === 'stdv') {
        addItem(items, 'ABAN 038', step.phase, percentile)
      } else if (csb === 'cement_plug') {
        trans('ct')
        addItem(items, 'ABAN 156', step.phase, percentile)
        // Checagem de TOC com jogo de polias (ABAN 234): desmobiliza o FT e opera sem unidade montada
        if (currentTech !== 'none') {
          const dis = getDismountPackage(currentTech, rigType, operationType, effMode)
          if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
          currentTech = 'none'
        }
        addItem(items, 'ABAN 234', step.phase, percentile, { transitionTechnology: 'none' as Technology })
      } else if (csb === 'ecsb') {
        // Bombeio direto de fluido eCSB (ABAN 079): opera sem unidade montada
        if (currentTech !== 'none') {
          const dis = getDismountPackage(currentTech, rigType, operationType, effMode)
          if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
          currentTech = 'none'
        }
        addItem(items, 'ABAN 079', step.phase, percentile, { transitionTechnology: 'none' as Technology })
      } else {  // plug
        addItem(items, 'ABAN 040', step.phase, percentile)
        addItem(items, rigType === 'ANC' ? 'ABAN 220' : 'ABAN 221', step.phase, percentile)
      }
      continue
    }

    // ─── CSB secundário FS1_Mec (plug TH / TAE) ──────────────────
    if (step.packageId === 'FS1_CSB_SECONDARY_INJECT') {
      // RCMA fase única com CSB principal = fluido eCSB: não prever CSB secundário (sem canhoneio, sem plug/TAE)
      const isRCMAFluidPrincipal = inputs.scopeId === 'FSU_Conv_RCMA' && inputs.rcmaCsbPrincipal === 'fluid_csb'
      if (isRCMAFluidPrincipal) continue
      // Não previsto: pula canhoneio raso e instalação de CSB 2
      if (inputs.fs1CsbSecondaryMode === 'no') continue
      const csb2Conting = inputs.fs1CsbSecondaryMode === 'contingency'
      const csb2 = inputs.fs1CsbSecondary ?? 'plug_th'
      const effMode: OperationMode = bopActive ? 'through_casing' : baseMode

      // Canhoneio raso da coluna antes da instalação do CSB secundário (FS1_Mec / Conv / RCMA):
      // controlado por fs1PerfRasa ("Não perfurar" remove o pacote) e pela tecnologia tubingPerfMethod
      // (a cabo: tubing puncher ABAN 101; a arame: eFire ABAN 045; flexitubo: tubing puncher FT
      // ABAN 154); o canhoneio profundo já foi feito antes (PERF_INJECT).
      const doRasaPerf = !usesFs1Barrier || (inputs.fs1PerfRasa ?? 'yes') === 'yes'
      if (doRasaPerf) {
        const method = usesFs1Barrier ? (inputs.tubingPerfMethod ?? 'electric') : 'electric'
        const rasaTech: Technology = method === 'wireline' ? 'wireline' : method === 'ct' ? 'ct' : 'electric'
        const rasaPkg = method === 'wireline' ? 'ABAN 045' : method === 'ct' ? 'ABAN 154' : 'ABAN 101'
        if (currentTech !== rasaTech) {
          if (currentTech !== 'none') {
            const d = getDismountPackage(currentTech, rigType, operationType, effMode)
            if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
          }
          const m = getMountPackage(rasaTech, rigType, operationType, effMode)
          if (m) addItem(items, m, step.phase, percentile, { autoInserted: true })
          currentTech = rasaTech
        }
        addItem(items, rasaPkg, step.phase, percentile)
      }
      const trans2 = (toTech: Technology) => {
        if (toTech === currentTech || toTech === 'none') return
        if (currentTech !== 'none') {
          const d = getDismountPackage(currentTech, rigType, operationType, effMode)
          if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
        }
        const m = getMountPackage(toTech, rigType, operationType, effMode)
        if (m) addItem(items, m, step.phase, percentile, { autoInserted: true })
        currentTech = toTech
      }
      if (csb2 === 'tae') {
        trans2('electric')
        addItem(items, 'ABAN 237', step.phase, percentile, csb2Conting ? { isContingency: true, contingencyReason: 'Contingência: instalação de TAE como CSB 2' } : undefined)
      } else {  // plug_th
        trans2('wireline')
        addItem(items, 'ABAN 042', step.phase, percentile, csb2Conting ? { isContingency: true, contingencyReason: 'Contingência: instalação de plug TH como CSB 2' } : undefined)
      }
      continue
    }

    // ─── Avaliação de cimento a cabo antes do bombeio RCMA (mar aberto, ABAN 107) ──
    // Sem montagem de terminal head / SFT: operação a mar aberto, cabo desce direto.
    if (step.packageId === 'RCMA_CEMENT_LOG_INJECT') {
      if (inputs.bopPwcPreLog !== false) {
        addItem(items, 'ABAN 107', step.phase, percentile, { transitionTechnology: 'none' as Technology })
        currentTech = 'none'
      }
      continue
    }

    // ─── Perfilagem opcional antes da cimentação BOP (todos escopos com 199) ──
    if (step.packageId === 'PRE_CEMENT_LOG_INJECT') {
      if (inputs.bopPwcPreLog !== false) {
        const effMode: OperationMode = bopActive ? 'through_casing' : baseMode
        if (currentTech !== 'electric') {
          if (currentTech !== 'none') {
            const d = getDismountPackage(currentTech, rigType, operationType, effMode)
            if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
          }
          const m = getMountPackage('electric', rigType, operationType, effMode)
          if (m) addItem(items, m, step.phase, percentile, { autoInserted: true })
          currentTech = 'electric'
        }
        addItem(items, 'ABAN 106', step.phase, percentile)
        currentTech = 'none'
      }
      continue
    }

    // ─── Pescaria de cauda intermediária (escopos Sup) ───────────
    if (step.packageId === 'CAUDA_INTER_INJECT') {
      if (yesOrConting(inputs.supIntermTailFishing)) {
        const isContig = isConting(inputs.supIntermTailFishing)
        const mainPkg = inputs.supIntermTailMethod === 'specific_tool' ? 'ABAN 192' : 'ABAN 191'
        addItem(items, mainPkg, step.phase, percentile, {
          isContingency: isContig,
          contingencyReason: isContig ? 'Contingência: pescaria de cauda intermediária' : undefined,
        })
        const contigOpts = { isContingency: true as const, contingencyReason: 'Contingência: corte / estampagem de cauda intermediária' }
        addItem(items, 'ABAN 193', step.phase, percentile, contigOpts)
        addItem(items, 'ABAN 194', step.phase, percentile, contigOpts)
      }
      continue
    }

    // ─── Pescaria de packer (FS2, antes do isolamento) ───────────
    if (step.packageId === 'PACKER_FISHING_INJECT') {
      if (yesOrConting(inputs.fs2PackerFishing)) {
        const isContig = isConting(inputs.fs2PackerFishing)
        const mainOpts = { isContingency: isContig, contingencyReason: isContig ? 'Contingência: pescaria de packer' : undefined }
        addItem(items, 'ABAN 192', step.phase, percentile, mainOpts)
        // Corte de packer e estampagem sempre como contingência
        const contigOpts = { isContingency: true as const, contingencyReason: 'Contingência: corte de packer c/ sapata de lavagem / estampagem' }
        addItem(items, 'ABAN 193', step.phase, percentile, contigOpts)
        addItem(items, 'ABAN 194', step.phase, percentile, contigOpts)
      }
      continue
    }

    // ─── Por isolamento: tampão de cimento ou correção na Fase 2 ────────────────
    if (step.packageId === 'ISOLATION_INJECT') {
      const effMode: OperationMode = bopActive ? 'through_casing' : baseMode
      const isRcmaScope = inputs.scopeId === 'FSU_Conv_RCMA' || inputs.scopeId === 'FS2_Conv_RCMA'
      const defaultIso: import('../types').IsolationConfig = { needsCorrection: false, plugType: 'bpp' }
      const isolations = inputs.isolations?.length ? inputs.isolations : [defaultIso]

      const ensureIsoTech = (tech: Technology, opts: Partial<Pick<ScheduleItem, 'isContingency' | 'contingencyReason'>> = {}) => {
        if (currentTech === tech) return
        if (currentTech !== 'none') {
          const d = getDismountPackage(currentTech, rigType, operationType, effMode)
          if (d) addItem(items, d, step.phase, percentile, { autoInserted: true, ...opts })
        }
        const m = getMountPackage(tech, rigType, operationType, effMode)
        if (m) addItem(items, m, step.phase, percentile, { autoInserted: true, ...opts })
        currentTech = tech
      }

      // Avaliação de cimentação após retirada da COP (uma vez, antes dos isolamentos)
      if (inputs.bopPwcPreLog !== false && !isRcmaScope) {
        ensureIsoTech('electric')
        addItem(items, 'ABAN 106', step.phase, percentile)
        currentTech = 'none'
      }

      for (const iso of isolations) {
        const isoConting = iso.corrContingency === true
        const corrOpts = isoConting
          ? { isContingency: true, contingencyReason: 'Contingência: correção de cimentação antes do tampão final' }
          : {}
        const condConting = { isContingency: true, contingencyReason: 'Contingência: condicionamento do revestimento após avaliação de cimentação' }

        if (!iso.needsCorrection) {
          ensureIsoTech('workstring')
          addItem(items, iso.plugType === 'pata_de_mula' ? 'ABAN 200' : 'ABAN 199', step.phase, percentile)
        } else {
          const method = iso.corrMethod ?? (scopeId.startsWith('FS2') ? 'pwc' : 'convencional')
          // ABAN 106 intra-bloco só quando o pre-log global não rodou (bopPwcPreLog=false ou RCMA)
          const needsInBlockLog = inputs.bopPwcPreLog === false || isRcmaScope
          if (method === 'convencional') {
            if (needsInBlockLog) {
              ensureIsoTech('electric', corrOpts)
              addItem(items, 'ABAN 106', step.phase, percentile, corrOpts)
              currentTech = 'none'
            }
            ensureIsoTech('workstring', corrOpts)
            addItem(items, 'ABAN 233', step.phase, percentile, condConting)
            ensureIsoTech('electric', corrOpts)
            addItem(items, 'ABAN 103', step.phase, percentile, corrOpts)
            currentTech = 'none'
            ensureIsoTech('workstring', corrOpts)
            addItem(items, 'ABAN 202', step.phase, percentile, corrOpts)
            addItem(items, 'ABAN 200', step.phase, percentile, corrOpts)
          } else {
            // PWC: avaliação de cimentação → condicionamento (contingência) → PWC → validação
            if (needsInBlockLog) {
              ensureIsoTech('electric', corrOpts)
              addItem(items, 'ABAN 106', step.phase, percentile, corrOpts)
              currentTech = 'none'
              ensureIsoTech('workstring', corrOpts)
              addItem(items, 'ABAN 233', step.phase, percentile, condConting)
            }
            ensureIsoTech('workstring', corrOpts)
            addItem(items, 'ABAN 231', step.phase, percentile, corrOpts)
            if (iso.pwcValidation === 'perfil') {
              ensureIsoTech('workstring', corrOpts)
              addItem(items, 'ABAN 200', step.phase, percentile, corrOpts)
            } else {
              ensureIsoTech('workstring', corrOpts)
              addItem(items, 'ABAN 200', step.phase, percentile, { ...corrOpts, isContingency: true as const, contingencyReason: 'Contingência: tampão final após correção de cimentação PWC' })
            }
          }
        }
      }
      continue
    }

    // ─── Correção de cimento em modo BOP (convencional ou PWC) ───
    if (step.packageId === 'BOP_CORRECTION_INJECT') {
      const effMode: OperationMode = 'through_casing'
      const method = inputs.bopCorrectionMethod ?? 'convencional'

      const ensureTech = (tech: Technology) => {
        if (currentTech === tech) return
        if (currentTech !== 'none') {
          const d = getDismountPackage(currentTech, rigType, operationType, effMode)
          if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
        }
        const m = getMountPackage(tech, rigType, operationType, effMode)
        if (m) addItem(items, m, step.phase, percentile, { autoInserted: true })
        currentTech = tech
      }

      if (method === 'convencional') {
        // Perfilagem geral opcional antes do processo de correção
        if (inputs.bopPwcPreLog !== false) {
          ensureTech('electric')
          addItem(items, 'ABAN 106', step.phase, percentile)
          currentTech = 'none'
        }
        ensureTech('electric')
        addItem(items, 'ABAN 103', step.phase, percentile)
        currentTech = 'none'
        ensureTech('workstring')
        addItem(items, 'ABAN 202', step.phase, percentile)
        addItem(items, 'ABAN 200', step.phase, percentile)
        ensureTech('electric')
        addItem(items, 'ABAN 106', step.phase, percentile)
        currentTech = 'none'
      } else {
        // PWC: perfilagem antes da cimentação (opcional, padrão: sim)
        if (inputs.bopPwcPreLog !== false) {
          ensureTech('electric')
          addItem(items, 'ABAN 106', step.phase, percentile)
          currentTech = 'none'
        }
        ensureTech('workstring')
        addItem(items, 'ABAN 231', step.phase, percentile)
        const validation = inputs.bopPwcValidation ?? 'params'
        if (validation === 'perfil') {
          ensureTech('electric')
          addItem(items, 'ABAN 106', step.phase, percentile)
          currentTech = 'none'
          ensureTech('workstring')
          addItem(items, 'ABAN 200', step.phase, percentile)
        } else {
          ensureTech('electric')
          addItem(items, 'ABAN 106', step.phase, percentile)
          currentTech = 'none'
          ensureTech('workstring')
          addItem(items, 'ABAN 200', step.phase, percentile, { isContingency: true as const, contingencyReason: 'Contingência: tampão final após correção de cimentação PWC' })
        }
      }
      continue
    }

    // ─── Desmonta tecnologia ativa sem montar outra ───────────────
    if (step.packageId === 'DISMOUNT_INJECT') {
      if (currentTech !== 'none' && currentTech !== 'bop') {
        const effectiveModeNow: OperationMode = bopActive ? 'through_casing' : baseMode
        const dis = getDismountPackage(currentTech, rigType, operationType, effectiveModeNow)
        if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
        currentTech = 'none'
      }
      continue
    }

    // ─── Recuperação de plugs (TMF e TH) ─────────────────────────
    if (step.packageId === 'PLUG_INJECT') {
      if (inputs.hasTmfPlug) {
        const hasProdPlug = (inputs.tmfPlugBores ?? []).includes('production')
        const hasAnulPlug = (inputs.tmfPlugBores ?? []).includes('annular')

        // Bore ANULAR primeiro: montagem da unidade de arame no bore anular (única op neste bore).
        // applyTransitions usará ABAN 033 (ANC) para o mount graças ao flag annularBore: true.
        if (hasAnulPlug) {
          addItem(items, 'ABAN 035', step.phase, percentile, { annularBore: true })
          for (const m of inputs.tmfPlugContingencyAnul ?? []) {
            if (m === 'stroker') addItem(items, 'ABAN 089', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (anular) com stroker', annularBore: true })
            if (m === 'ft')      addItem(items, 'ABAN 122', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (anular) com flexitubo' })
          }
          // DP + bore anular: limpeza do anular com flexitubo (BPR) após retirada do plug
          if (rigType === 'DP') {
            const effMode: OperationMode = bopActive ? 'through_casing' : baseMode
            const dis = getDismountPackage(currentTech, rigType, operationType, effMode)
            if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
            const ctMnt = getMountPackage('ct', rigType, operationType, effMode)
            if (ctMnt) addItem(items, ctMnt, step.phase, percentile, { autoInserted: true })
            currentTech = 'ct'
            addItem(items, 'ABAN 125', step.phase, percentile)
            addItem(items, 'ABAN 162', step.phase, percentile)
            const ctDis = getDismountPackage('ct', rigType, operationType, effMode)
            if (ctDis) addItem(items, ctDis, step.phase, percentile, { autoInserted: true })
            const wireMnt = getMountPackage('wireline', rigType, operationType, effMode)
            if (wireMnt) addItem(items, wireMnt, step.phase, percentile, { autoInserted: true })
            currentTech = 'wireline'
          }
          // Teste de bloco do anular da ANM adiado: executado após retirada do plug anular
          addItem(items, 'ABAN 029', step.phase, percentile)
        }

        // Bore de PRODUÇÃO após troca para o bore de produção
        if (hasProdPlug) {
          addItem(items, 'ABAN 034', step.phase, percentile)
          for (const m of inputs.tmfPlugContingencyProd ?? []) {
            if (m === 'stroker') addItem(items, 'ABAN 088', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (produção) com stroker' })
            if (m === 'ft')      addItem(items, 'ABAN 123', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: retirada de plug do TMF (produção) com flexitubo' })
          }
          // Teste de bloco de produção da ANM adiado: executado após retirada do plug de produção
          addItem(items, 'ABAN 028', step.phase, percentile)
        }
      }
      // Plug de produção do TMF removido — injeta contingências de válvulas da ANM que foram adiadas
      if (inputs.hasTmfPlug && (inputs.tmfPlugBores ?? []).includes('production')) {
        const conts = inputs.anmValveContingency ?? []
        if (conts.includes('jateamento'))
          addItem(items, 'ABAN 125', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: jateamento com flexitubo para abertura de válvulas da ANM' })
        if (conts.includes('gabarit_ft'))
          addItem(items, 'ABAN 124', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: gabaritagem com motor de fundo e broca para abertura de válvulas da ANM' })
      }
      if (inputs.hasThPlug) {
        addItem(items, 'ABAN 052', step.phase, percentile)
        for (const m of inputs.thPlugContingency ?? []) {
          if (m === 'stroker') addItem(items, 'ABAN 094', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: retirada de plug do TH com stroker' })
          if (m === 'ft')      addItem(items, 'ABAN 140', step.phase, percentile, { isContingency: true, contingencyReason: 'Contingência: retirada de plug do TH com flexitubo' })
        }
      }
      continue
    }

    // ─── Instalação de camisão (DHSV/BRV) + gabaritagem ─────────
    if (step.packageId === 'CAMISAO_INJECT') {
      const camisaoArr = (inputs.installCamisao ?? []).filter(v => v !== 'no') as ('yes' | 'contingency')[]
      const effectiveModeNow: OperationMode = bopActive ? 'through_casing' : baseMode
      for (const slot of ['yes', 'contingency'] as const) {
        if (!camisaoArr.includes(slot)) continue
        const isContingency = slot === 'contingency'
        if (!inputs.camisaoMethod || inputs.camisaoMethod === 'wireline') {
          addItem(items, 'ABAN 037', step.phase, percentile, { isContingency })
        } else {
          // CT: transição wireline → CT → back to wireline
          const dis = getDismountPackage(currentTech, rigType, operationType, effectiveModeNow)
          if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
          const ctMount = getMountPackage('ct', rigType, operationType, effectiveModeNow)
          if (ctMount) addItem(items, ctMount, step.phase, percentile, { autoInserted: true })
          addItem(items, 'ABAN 126', step.phase, percentile, { isContingency })
          const ctDis = getDismountPackage('ct', rigType, operationType, effectiveModeNow)
          if (ctDis) addItem(items, ctDis, step.phase, percentile, { autoInserted: true })
          const wireMnt = getMountPackage('wireline', rigType, operationType, effectiveModeNow)
          if (wireMnt) addItem(items, wireMnt, step.phase, percentile, { autoInserted: true })
          currentTech = 'wireline'
        }
      }
      // gabaritagem da coluna (arame/perfilagem/flexitubo conforme gaugeTech; omitir se 'no')
      if (inputs.gaugeTech !== 'no') {
        const gaugePackage = inputs.gaugeTech === 'electric' ? 'ABAN 098' : inputs.gaugeTech === 'ct' ? 'ABAN 124' : 'ABAN 036'
        addItem(items, gaugePackage, step.phase, percentile, { isContingency: inputs.gaugeContingency === true })
      }
      if (yesOrConting(inputs.contingencyGabaritFT)) {
        addItem(items, 'ABAN 124', step.phase, percentile, {
          isContingency: isConting(inputs.contingencyGabaritFT),
          contingencyReason: isConting(inputs.contingencyGabaritFT) ? 'Contingência: gabaritagem com motor de fundo e broca via flexitubo' : undefined,
        })
      }
      continue
    }

    // ─── Plug no TMF ao final (após limpeza de flowlines, antes da retirada) ──
    if (step.packageId === 'TMF_PLUG_END_INJECT') {
      if (yesOrConting(inputs.installTmfPlugEndProd) || yesOrConting(inputs.installTmfPlugEndAnul)) {
        const effMode: OperationMode = bopActive ? 'through_casing' : baseMode
        const ensureWireline = () => {
          if (currentTech !== 'wireline') {
            if (currentTech !== 'none') {
              const d = getDismountPackage(currentTech, rigType, operationType, effMode)
              if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
            }
            const m = getMountPackage('wireline', rigType, operationType, effMode)
            if (m) addItem(items, m, step.phase, percentile, { autoInserted: true })
            currentTech = 'wireline'
          }
        }
        if (yesOrConting(inputs.installTmfPlugEndProd)) {
          ensureWireline()
          addItem(items, 'ABAN 249', step.phase, percentile, { isContingency: isConting(inputs.installTmfPlugEndProd) })
        }
        if (rigType === 'DP' && yesOrConting(inputs.installTmfPlugEndAnul)) {
          // DP: plug anular instalado após desassentamento do conjunto de WO.
          // O ABAN 213 da retirada (já na sequência consolidada) representa a nova desconexão.
          const conting = isConting(inputs.installTmfPlugEndAnul)
          // Dismount wireline before desassentamento (se montado para plug prod)
          if (currentTech !== 'none') {
            const d = getDismountPackage(currentTech, rigType, operationType, effMode)
            if (d) addItem(items, d, step.phase, percentile, { autoInserted: true })
            currentTech = 'none'
          }
          addItem(items, 'ABAN 213', step.phase, percentile, { isContingency: conting })  // desassentamento WO
          ensureWireline()
          addItem(items, 'ABAN 250', step.phase, percentile, { isContingency: conting })
          // Teste de interface: bore produção (S1 ou contra plug se instalado), bore anular (contra plug instalado)
          const hasProdPlug = yesOrConting(inputs.installTmfPlugEndProd)
          addItem(items, hasProdPlug ? 'ABAN 026' : 'ABAN 024', step.phase, percentile, { isContingency: conting })
          addItem(items, 'ABAN 027', step.phase, percentile, { isContingency: conting })
        } else if (rigType !== 'DP' && yesOrConting(inputs.installTmfPlugEndAnul)) {
          ensureWireline()
          addItem(items, 'ABAN 250', step.phase, percentile, { isContingency: isConting(inputs.installTmfPlugEndAnul) })
        }
      }
      continue
    }

    // ─── Pescaria de elementos na cauda/coluna (após gabaritagem) ─
    if (step.packageId === 'TAIL_FISHING_INJECT') {
      const FISHING_PKG: Record<string, string> = {
        'camisao_wireline': 'ABAN 055', 'camisao_stroker': 'ABAN 097', 'camisao_ct': 'ABAN 134',
        'stv_r_wireline':   'ABAN 048', 'stv_r_stroker':   'ABAN 090', 'stv_r_ct':   'ABAN 136',
        'stv_f_wireline':   'ABAN 049', 'stv_f_stroker':   'ABAN 091', 'stv_f_ct':   'ABAN 137',
        'plug_r_wireline':  'ABAN 050', 'plug_r_stroker':  'ABAN 092', 'plug_r_ct':  'ABAN 138',
        'plug_f_wireline':  'ABAN 051', 'plug_f_stroker':  'ABAN 093', 'plug_f_ct':  'ABAN 139',
        'brv_f_wireline':   'ABAN 053', 'brv_f_stroker':   'ABAN 095', 'brv_f_ct':   'ABAN 141',
        'brv_r_wireline':   'ABAN 054', 'brv_r_stroker':   'ABAN 096', 'brv_r_ct':   'ABAN 142',
      }
      const ELEMENT_ORDER: Record<string, number> = {
        stv_f: 0, plug_f: 1, brv_f: 2,
        stv_r: 3, plug_r: 4, brv_r: 5,
        camisao: 6,
      }
      const METHOD_ORDER: Record<string, number> = { wireline: 0, stroker: 1, ct: 2 }
      const sorted = [...(inputs.tailFishingItems ?? [])].sort((a, b) => {
        const elemDiff = (ELEMENT_ORDER[a.element] ?? 99) - (ELEMENT_ORDER[b.element] ?? 99)
        if (elemDiff !== 0) return elemDiff
        return (METHOD_ORDER[a.method] ?? 0) - (METHOD_ORDER[b.method] ?? 0)
      })
      for (const fi of sorted) {
        const pkgId = FISHING_PKG[`${fi.element}_${fi.method}`]
        if (pkgId) addItem(items, pkgId, step.phase, percentile)
      }
      continue
    }

    // ─── Retirada e/ou substituição de VGL ───────────────────────
    if (step.packageId === 'VGL_INJECT') {
      if (inputs.vglAction === 'remove' || inputs.vglAction === 'replace') {
        const hasCamisao = (inputs.installCamisao ?? []).some(v => v === 'yes' || v === 'contingency')
        const CAMISAO_REMOVE_PKG: Record<string, string> = { wireline: 'ABAN 055', ct: 'ABAN 134' }
        const CAMISAO_INSTALL_PKG: Record<string, string> = { wireline: 'ABAN 037', ct: 'ABAN 126' }
        const camisaoMethod = inputs.camisaoMethod ?? 'wireline'
        const vglOpts = { isContingency: inputs.vglContingency === true }

        if (inputs.vglInstallStv) addItem(items, 'ABAN 038', step.phase, percentile, vglOpts)
        // Retirada do camisão antes da pescaria da VGL
        if (hasCamisao) addItem(items, CAMISAO_REMOVE_PKG[camisaoMethod], step.phase, percentile, vglOpts)
        const VGL_FISHING_PKG: Record<string, string> = { wireline: 'ABAN 056', stroker: 'ABAN 114' }
        const pkgId = VGL_FISHING_PKG[inputs.vglFishingMethod ?? 'wireline']
        if (pkgId) addItem(items, pkgId, step.phase, percentile, vglOpts)
        if (inputs.vglAction === 'replace') addItem(items, 'ABAN 057', step.phase, percentile, vglOpts)
        // Reinstalação do camisão após operação de VGL
        if (hasCamisao) addItem(items, CAMISAO_INSTALL_PKG[camisaoMethod], step.phase, percentile, vglOpts)
        if (inputs.vglInstallStv && inputs.vglRemoveStv) addItem(items, 'ABAN 048', step.phase, percentile, vglOpts)
      }
      continue
    }

    // ─── Teste do BOP após descida do BOP (todos exceto feth_on_th) ─
    // Marcador presente apenas em escopos com BOP (FSU/FS2 Conv-BOP e Sup); RCMA usa FIBAP.
    if (step.packageId === 'BOP_TEST_INJECT') {
      if (inputs.bopTestMethod === 'feth_on_th') {
        // teste deslocado para após a FETH — BOP_TEST_FETH_INJECT cuida disso
      } else if (inputs.bopTestMethod === 'ponteira_orman') {
        addItem(items, 'ABAN 240', step.phase, percentile)
      } else if (inputs.bopTestMethod === 'coluna_flutuada') {
        addItem(items, 'ABAN 229', step.phase, percentile)
      } else {
        addItem(items, 'ABAN 228', step.phase, percentile)
      }
      continue
    }

    // ─── Teste do BOP com FETH apoiada no TH (após descida da FETH) ─
    if (step.packageId === 'BOP_TEST_FETH_INJECT') {
      if (inputs.bopTestMethod === 'feth_on_th') {
        addItem(items, 'ABAN 241', step.phase, percentile)
      }
      continue
    }

    // ─── Corte de COP/COI após tentativa de desassentamento do TH ─
    if (step.packageId === 'COP_CUT_INJECT') {
      if (yesOrConting(inputs.fs2CopCutContingency)) {
        const isContig = isConting(inputs.fs2CopCutContingency)
        const cutOpts = {
          isContingency: isContig,
          contingencyReason: isContig ? 'Contingência: corte de COP/COI após falha de desassentamento do TH' : undefined,
        }
        const isRcma = scopeId === 'FS2_Conv_RCMA'
        if (isRcma) {
          // RCMA (mar aberto): falha da FIBAP já na sequência → corte → descer FIBAP → retirar COP
          addItem(items, 'ABAN 252', step.phase, percentile, cutOpts)
          addItem(items, 'ABAN 183', step.phase, percentile, cutOpts)
          addItem(items, 'ABAN 188', step.phase, percentile, cutOpts)
        } else {
          // BOP: descer THRT → [retirar plug TH] → free point → cortar → retirar COP com THRT
          addItem(items, 'ABAN 186', step.phase, percentile, cutOpts)
          if (yesOrConting(inputs.fs2ThPlugRemoval)) {
            const isPlugConting = isConting(inputs.fs2ThPlugRemoval)
            addItem(items, 'ABAN 052', step.phase, percentile, {
              ...cutOpts,
              ...(isPlugConting ? { isContingency: true, contingencyReason: 'Contingência: retirada de plug 3,75" no TH antes do free point' } : {}),
            })
          }
          addItem(items, 'ABAN 251', step.phase, percentile, cutOpts)
          if (inputs.fs2CopCutMethod === 'ct') {
            addItem(items, rigType === 'ANC' ? 'ABAN 121' : 'ABAN 119', step.phase, percentile, cutOpts)
            addItem(items, 'ABAN 150', step.phase, percentile, cutOpts)
            addItem(items, operationType === 'LWO' ? 'ABAN 148' : 'ABAN 161', step.phase, percentile, cutOpts)
          } else if (inputs.fs2CopCutMethod === 'slip_shot') {
            addItem(items, 'ABAN 115', step.phase, percentile, cutOpts)
          } else if (inputs.fs2CopCutMethod === 'string_shot') {
            addItem(items, 'ABAN 116', step.phase, percentile, cutOpts)
          } else {
            addItem(items, 'ABAN 113', step.phase, percentile, cutOpts)
          }
          addItem(items, 'ABAN 190', step.phase, percentile, cutOpts)
        }
      }
      continue
    }

    // ─── Limpeza do poço com UEP (FS1_Mec, antes da confirmação) ─
    if (step.packageId === 'UEP_CLEAN_INJECT') {
      if (yesOrConting(inputs.cleanWithUep)) {
        const isContig = isConting(inputs.cleanWithUep)
        const opts = { isContingency: isContig, contingencyReason: isContig ? 'Contingência: limpeza do poço em conjunto com UEP' : undefined }
        for (const pkgId of inputs.cleanWithUepPackages ?? []) {
          addItem(items, pkgId, step.phase, percentile, opts)
        }
      }
      continue
    }

    // ─── Perfilagens de investigação (após gabaritagem) ──────────
    if (step.packageId === 'INVESTIGATION_INJECT') {
      const logs = inputs.investigationLogs ?? []
      const methods = inputs.investigationLogMethods ?? {}
      const contingency = inputs.investigationLogContingency ?? {}
      const LOG_ORDER: InvestigationLog[] = ['registro_pressao', 'fluxo_anular', 'furo_cop', 'caliper', 'imageamento', 'free_point']
      for (const log of LOG_ORDER) {
        if (!logs.includes(log)) continue
        const method = methods[log]
        const isConting = contingency[log] === true
        let pkgId: string | null = null
        if (log === 'registro_pressao') {
          pkgId = method === 'electric' ? 'ABAN 104' : method === 'ct' ? 'ABAN 147' : 'ABAN 047'
        } else if (log === 'fluxo_anular') {
          pkgId = method === 'ct' ? 'ABAN 151' : 'ABAN 100'
        } else if (log === 'furo_cop') {
          pkgId = method === 'ct' ? 'ABAN 152' : 'ABAN 099'
        } else if (log === 'caliper') {
          pkgId = 'ABAN 111'
        } else if (log === 'imageamento') {
          pkgId = 'ABAN 112'
        } else if (log === 'free_point') {
          pkgId = 'ABAN 251'
        }
        if (pkgId) addItem(items, pkgId, step.phase, percentile, { isContingency: isConting })
      }
      continue
    }

    // ─── Retirada de BRV insertável (após gabaritagem) ───────────
    if (step.packageId === 'BRV_INSERTABLE_INJECT') {
      if (inputs.dhsvBrvType === 'insertable') {
        addItem(items, 'ABAN 054', step.phase, percentile)
      }
      continue
    }

    let effectivePkgId = step.packageId
    if (effectivePkgId === 'ABAN 031A' && operationType === 'LWO') effectivePkgId = 'ABAN 031B'
    // LWO (LWIV): FIBAP substitui FETH em operações a mar aberto
    if (operationType === 'LWO') {
      if (effectivePkgId === 'ABAN 182') effectivePkgId = 'ABAN 183'
      if (effectivePkgId === 'ABAN 187') effectivePkgId = 'ABAN 188'
    }
    // Navegação com equipamento no fundo: DMM com SSUB (Fase 1) ou BOP (Fase 2)
    if (effectivePkgId === 'ABAN 003' && inputs.dmmWithEquipment) {
      effectivePkgId = scopeId.startsWith('FS2') ? 'ABAN 005' : 'ABAN 004'
    }
    // Plug no TMF: substitui teste de interface pelo bore correspondente ao plug
    if (inputs.hasTmfPlug) {
      const tmfBores = inputs.tmfPlugBores ?? []
      if (effectivePkgId === 'ABAN 024' && tmfBores.includes('production')) effectivePkgId = 'ABAN 026'
      if (effectivePkgId === 'ABAN 025' && tmfBores.includes('annular'))    effectivePkgId = 'ABAN 027'
    }
    // Teste de bloco da ANM adiado: executado após retirada do plug (injetado em PLUG_INJECT)
    if (inputs.hasTmfPlug) {
      const tmfBores = inputs.tmfPlugBores ?? []
      if (effectivePkgId === 'ABAN 028' && tmfBores.includes('production')) continue
      if (effectivePkgId === 'ABAN 029' && tmfBores.includes('annular'))    continue
    }
    // ABAN 211 (prep CWO+TRT Fase 0, com TCap): suprimido quando não há TCap a retirar pelo WO.
    if (effectivePkgId === 'ABAN 211' &&
        (!equipments.includes('tree_cap') || inputs.tcapRemovalMethod === 'rov')) continue

    // ABAN 212 (prep CWO+TRT reentrada, Fase 1A, sem TCap): suprimido quando há TCap a retirar pelo WO.
    if (effectivePkgId === 'ABAN 212' &&
        equipments.includes('tree_cap') && inputs.tcapRemovalMethod !== 'rov') continue

    // Descida do WO para retirada da TCap está contida em ABAN 244/245 (injetados em TCAP_INJECT);
    // ABAN 011/012 da sequência base são suprimidos para evitar dupla-previsão.
    if ((effectivePkgId === 'ABAN 011' || effectivePkgId === 'ABAN 012') &&
        equipments.includes('tree_cap') && inputs.tcapRemovalMethod !== 'rov') continue

    const pkg = getPackage(effectivePkgId)
    if (!pkg) continue

    const newTech = pkg.technology
    const effectiveMode: OperationMode = bopActive ? 'through_casing' : baseMode

    // ─── Gestão de tecnologia ─────────────────────────────────────
    if (pkg.isMountOp) {
      if (currentTech === newTech) continue  // já montado, pular duplicata
      if (currentTech !== 'none') {
        const dis = getDismountPackage(currentTech, rigType, operationType, effectiveMode)
        if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
      }
      if (newTech === 'bop') bopActive = true
      currentTech = newTech
    } else if (pkg.isDismountOp) {
      if (newTech === 'bop') bopActive = false
      currentTech = 'none'
    } else if (newTech !== 'none' && newTech !== currentTech) {
      if (currentTech !== 'none') {
        const dis = getDismountPackage(currentTech, rigType, operationType, effectiveMode)
        if (dis) addItem(items, dis, step.phase, percentile, { autoInserted: true })
      }
      const mnt = getMountPackage(newTech, rigType, operationType, effectiveMode)
      if (mnt) addItem(items, mnt, step.phase, percentile, { autoInserted: true })
      currentTech = newTech
    }

    const finalIsContingency = step.condition === 'stuck_risk'
      ? isConting(inputs.hasStuckStringRisk)
      : step.condition === 'fejat'
      ? isConting(inputs.contingencyFejat)
      : (step.isContingency ?? false)
    const finalContingencyReason = (step.condition === 'stuck_risk' && isConting(inputs.hasStuckStringRisk))
      ? 'Corte preventivo de coluna marcado como contingência pelo projetista'
      : step.contingencyReason
    addItem(items, effectivePkgId, step.phase, percentile, {
      isContingency: finalIsContingency,
      contingencyReason: finalContingencyReason,
      transitionTechnology: step.transitionTechnology,
    })
    if (pkg.noDismountAfter) currentTech = 'none'
  }

  // Strip auto-inserted items e reconstrói montagens/desmontagens com as regras corretas
  const baseItems = items.filter(i => !i.autoInserted)
  const rebuiltItems = applyTransitions(baseItems, rigType, operationType, percentile, baseMode)

  // Fase 0 vai até a retirada da TCap (inclusive) e abrange a dissociação de hidrato no
  // conector da TCap (ABAN 177), que ocorre logo após o desassentamento mas ainda integra a Fase 0.
  // Se não há TCap, reclassifica todos os itens Fase 0 para a fase inicial do escopo.
  // NB: esta reclassificação de fase é a fonte de verdade da owFase dos pacotes de mobilização
  // (DMM). A owFase deles NÃO é fixa no JSON — é derivada desta fase em AppContext (deriveOwFase
  // + FASE_TO_OW): com TCap → Fase 0/AP.0; sem TCap → Fase 1A/AP.1A; FS2 → Fase 2/AP.2.
  return normalizeScopePhases(applyTimeline(rebuiltItems), scopeId)
}

// Normalização final de fases (compartilhada com a logicEngine):
// A âncora cobre as duas formas de retirar a TCap, mantendo o mesmo critério da emissão do prep
// (211 por coluna / 010 por ROV): retirada por coluna termina em 020 (fundeio) ou 021/022
// (desassentamento/superfície); retirada por ROV é o próprio 010 (Fase 0, pós-mobilização).
// Tudo até a âncora (inclusive) é Fase 0; sem âncora, Fase 0 é promovida à fase inicial do escopo.
export function normalizeScopePhases(items: ScheduleItem[], scopeId: string): ScheduleItem[] {
  const tcapUnseatingIds = new Set(['ABAN 010', 'ABAN 020', 'ABAN 021', 'ABAN 022', 'ABAN 177'])
  const lastTcapIdx = items.reduce((acc, item, i) =>
    tcapUnseatingIds.has(item.packageId) ? i : acc, -1)

  if (lastTcapIdx >= 0) {
    return items.map((item, i) =>
      i <= lastTcapIdx ? { ...item, phase: 'Fase 0' as Phase } : item
    )
  }

  const startPhase: Phase = scopeId.startsWith('FS2') ? 'Fase 2' : 'Fase 1A'
  return items.map(item =>
    item.phase === 'Fase 0' ? { ...item, phase: startPhase } : item
  )
}

function makeAutoItem(packageId: string, phase: Phase, percentile: Percentile, isContingency = false): ScheduleItem {
  const pkg = getPackage(packageId)!
  return {
    uid: `auto-${packageId}-${Math.random().toString(36).slice(2, 8)}`,
    packageId,
    packageName: pkg.name,
    category: pkg.category,
    technology: pkg.technology,
    phase,
    duration: getDuration(packageId, percentile),
    isContingency,
    autoInserted: true,
    startDay: 0,
    endDay: 0,
  }
}

/**
 * Etapa de revisão das montagens/desmontagens de equipamento de pressão (arame, perfilagem, FT)
 * sobre SFT/Terminal Head. Reconstrói toda a camada de mount/dismount a partir das operações reais,
 * descartando montagens/desmontagens explícitas anteriores (exceto BOP).
 *
 * Regras:
 *   1. Operações de arame, perfilagem ou FT exigem o equipamento da tecnologia montado, salvo
 *      quando marcadas como jogo de polias (transitionTechnology === 'none' em pacote WL/electric/CT),
 *      caso em que o equipamento deve estar desmontado.
 *   2. Montagem e desmontagem só são inseridas se houver pelo menos uma operação da tecnologia
 *      entre elas (sem ciclos vazios de mount+dismount).
 *   3. A desmontagem ocorre somente quando o uso sequencial da tecnologia termina (transição para
 *      outra tecnologia, polias, BOP ou fim do cronograma).
 *   4. Operações sem requisito de equipamento (technology === 'none') NÃO forçam desmontagem —
 *      o equipamento permanece montado caso vá ser usado novamente em seguida.
 */
export function applyTransitions(
  base: ScheduleItem[],
  rigType: RigType,
  operationType: 'Generalista' | 'LWO',
  percentile: Percentile,
  baseMode: OperationMode = 'through_tubing',
): ScheduleItem[] {
  // Descartar montagens/desmontagens explícitas de WL/electric/CT — esta função as reconstrói.
  // Mantém apenas mount/dismount de BOP (são marcos de fase, controlados pelas sequências).
  const cleaned = base.filter(item => {
    const pkg = getPackage(item.packageId)
    if (!pkg) return true
    if (pkg.technology === 'bop') return true
    return !pkg.isMountOp && !pkg.isDismountOp
  })

  const result: ScheduleItem[] = []
  let mountedTech: Technology = 'none'
  let bopActive = false
  // Tracks whether the current technology session was mounted by a contingency op,
  // and whether any non-contingency op has used it since. The dismount is contingency
  // only if the mount was contingency AND no non-contingency op used the tech.
  let mountIsContingency = false
  let sessionHasNonContingency = false
  let mountItemIdx = -1  // índice em result[] da montagem da sessão atual
  // ANC: rastreia se a sessão atual de wireline está no bore anular (ABAN 033) ou de produção (ABAN 032)
  let annularBoreSession = false
  // Overlay contingencial: quando uma op contingencial exige tech diferente da sessão firme ativa,
  // monta a tech como overlay sem desmontar a sessão firme subjacente.
  let overlayTech: Technology = 'none'
  let overlayAnnularBore = false
  // Polias contingencial força desmontagem da tech firme; a remontagem subsequente também é contingência
  let pendingContingencyRemountTech: Technology = 'none'
  // Indica que a sessão atual foi montada como restauração após contingência polias (não deve ser promovida a firme)
  let mountIsContingencyRestoration = false

  const mode = (): OperationMode => bopActive ? 'through_casing' : baseMode
  const isFirmSession = () => mountedTech !== 'none' && (!mountIsContingency || sessionHasNonContingency)

  const resolveMountPkg = (tech: Technology, useAnnularBore: boolean): string | null => {
    if (tech === 'wireline' && rigType === 'ANC' && useAnnularBore) {
      return operationType === 'LWO' ? 'ABAN 031B' : 'ABAN 033'
    }
    return getMountPackage(tech, rigType, operationType, mode())
  }

  const dismountOverlay = (phase: Phase) => {
    if (overlayTech === 'none') return
    const d = getDismountPackage(overlayTech, rigType, operationType, mode())
    if (d) result.push(makeAutoItem(d, phase, percentile, true))
    overlayTech = 'none'
    overlayAnnularBore = false
  }

  const promoteMountToFirm = () => {
    if (mountIsContingencyRestoration) return
    if (mountIsContingency && !sessionHasNonContingency && mountItemIdx >= 0) {
      result[mountItemIdx] = { ...result[mountItemIdx], isContingency: false }
    }
  }

  const dismount = (phase: Phase, forceContingency = false) => {
    dismountOverlay(phase)
    if (mountedTech === 'none' || mountedTech === 'bop') { mountedTech = 'none'; return }
    const isConting = forceContingency || (mountIsContingency && !sessionHasNonContingency)
    const d = getDismountPackage(mountedTech, rigType, operationType, mode())
    if (d) result.push(makeAutoItem(d, phase, percentile, isConting))
    mountedTech = 'none'
    annularBoreSession = false
    mountIsContingency = false
    sessionHasNonContingency = false
    mountItemIdx = -1
    mountIsContingencyRestoration = false
  }

  const ensureMount = (tech: Technology, phase: Phase, triggerIsContingency: boolean, useAnnularBore = false) => {
    const originalTriggerIsContingency = triggerIsContingency
    // Se tech foi desmontada por contingência polias e está sendo restaurada agora, marcar montagem como contingência
    let isContingencyRestoration = false
    if (mountedTech === 'none' && overlayTech === 'none' && pendingContingencyRemountTech === tech) {
      triggerIsContingency = true
      isContingencyRestoration = true
      pendingContingencyRemountTech = 'none'  // consome apenas quando a tech restaurada é a correta
    }
    const sameFirmBore = tech !== 'wireline' || rigType !== 'ANC' || annularBoreSession === useAnnularBore
    const sameOverlayBore = tech !== 'wireline' || rigType !== 'ANC' || overlayAnnularBore === useAnnularBore

    // --- Overlay ativo ---
    if (overlayTech !== 'none') {
      if (tech === overlayTech && sameOverlayBore) return  // continua usando overlay

      // Op firma retornando para a tech firme: desmonta overlay e retoma sessão firme
      if (tech === mountedTech && sameFirmBore && !triggerIsContingency) {
        dismountOverlay(phase)
        promoteMountToFirm()
        sessionHasNonContingency = true
        return
      }
      // Troca de overlay ou tech diferente: desmonta overlay atual
      dismountOverlay(phase)
      // Verifica se agora estamos na tech firme
      if (tech === mountedTech && sameFirmBore) {
        if (!triggerIsContingency) { promoteMountToFirm(); sessionHasNonContingency = true }
        return
      }
      // Contingência com tech diferente da firme → novo overlay
      if (triggerIsContingency && isFirmSession()) {
        const m = resolveMountPkg(tech, useAnnularBore)
        if (m) result.push(makeAutoItem(m, phase, percentile, true))
        overlayTech = tech; overlayAnnularBore = useAnnularBore
        return
      }
      // Op firme com tech diferente: encerra sessão firme e monta nova
    }

    // --- Sem overlay ---
    if (tech === mountedTech && sameFirmBore) {
      if (!triggerIsContingency) { promoteMountToFirm(); sessionHasNonContingency = true }
      return
    }
    // Contingência com tech diferente enquanto sessão firme ativa → overlay sem desmontar firme
    if (triggerIsContingency && isFirmSession()) {
      const m = resolveMountPkg(tech, useAnnularBore)
      if (m) result.push(makeAutoItem(m, phase, percentile, true))
      overlayTech = tech; overlayAnnularBore = useAnnularBore
      return
    }
    // Caminho normal: desmonta atual (inclui dismountOverlay via dismount) e monta novo
    if (mountedTech !== 'none') dismount(phase)
    const m = resolveMountPkg(tech, useAnnularBore)
    if (m) {
      result.push(makeAutoItem(m, phase, percentile, triggerIsContingency))
      mountItemIdx = result.length - 1
    } else {
      mountItemIdx = -1
    }
    mountedTech = tech
    annularBoreSession = tech === 'wireline' && useAnnularBore
    mountIsContingency = triggerIsContingency
    sessionHasNonContingency = !originalTriggerIsContingency
    mountIsContingencyRestoration = isContingencyRestoration
  }

  // Retorna true SOMENTE se, após o bloco de contingências com tech diferente, a tech firme atual
  // é retomada em uma op firme. Nesse caso o dismount deve ser adiado para depois do overlay.
  // Se a tech firme não volta (ex.: muda para electric firme após CT contingencial), retorna false
  // e o dismount ocorre normalmente antes da contingência.
  const nextTechIsContingencyOverlay = (fromIdx: number, currentTech: Technology): boolean => {
    let seenContingencyDifferentTech = false
    for (let i = fromIdx; i < cleaned.length; i++) {
      const p = getPackage(cleaned[i].packageId)
      if (!p) continue
      if (p.isMountOp || p.isDismountOp) return false
      if (p.technology === 'bop') continue
      const effTech: Technology = cleaned[i].transitionTechnology !== undefined
        ? cleaned[i].transitionTechnology!
        : p.technology
      if (effTech === 'none') continue
      const isPolias = cleaned[i].transitionTechnology === 'none' &&
        (p.technology === 'wireline' || p.technology === 'electric' || p.technology === 'ct')
      if (isPolias) return false
      if (cleaned[i].isContingency) {
        if (effTech !== currentTech) seenContingencyDifferentTech = true
      } else {
        // Primeira op firme após o bloco: só adia se for da tech firme atual
        return seenContingencyDifferentTech && effTech === currentTech
      }
    }
    return false
  }

  // Verifica se ainda há op futura que exige `tech` montada no mesmo contexto de bore,
  // sem cruzar uma troca de tecnologia firme (op firme com tech diferente encerra a sessão).
  // BOP install/retire e polias também interrompem o look-ahead.
  const needsTechAhead = (fromIdx: number, tech: Technology, currentAnnularBore = false): boolean => {
    for (let i = fromIdx; i < cleaned.length; i++) {
      const p = getPackage(cleaned[i].packageId)
      if (!p) continue
      if (p.isMountOp || p.isDismountOp) return false  // BOP install/retire interrompe a sessão
      if (p.technology === 'bop') continue  // ABAN 228/236: coexistem, não consomem o equipamento
      const effTech: Technology = cleaned[i].transitionTechnology !== undefined
        ? cleaned[i].transitionTechnology!
        : p.technology
      const isPoliasAhead = cleaned[i].transitionTechnology === 'none' &&
        (p.technology === 'wireline' || p.technology === 'electric' || p.technology === 'ct')
      if (isPoliasAhead) return false  // polias: desmontagem obrigatória, encerra sessão
      if (effTech === tech) {
        // ANC wireline: troca de bore exige dismount → informa que não há "mesmo bore" à frente
        if (tech === 'wireline' && rigType === 'ANC' && !!cleaned[i].annularBore !== currentAnnularBore) return false
        return true
      }
      // Op firme com tech diferente (não 'none') encerra a sessão atual sem possibilidade de retorno
      if (!cleaned[i].isContingency && effTech !== 'none') return false
    }
    return false
  }

  for (let idx = 0; idx < cleaned.length; idx++) {
    const item = cleaned[idx]
    const pkg = getPackage(item.packageId)
    if (!pkg) { result.push(item); continue }

    // BOP install/retire (explícito): dismount equipamento sobreposto, alterna bopActive
    if (pkg.technology === 'bop' && pkg.isMountOp) {
      dismount(item.phase); bopActive = true; result.push(item); continue
    }
    if (pkg.technology === 'bop' && pkg.isDismountOp) {
      dismount(item.phase); bopActive = false; result.push(item); continue
    }

    // Tech efetiva (transitionTechnology pode forçar 'none' = polias, ou outra sobreposição)
    const effectiveTech: Technology = item.transitionTechnology !== undefined
      ? item.transitionTechnology
      : pkg.technology

    // Jogo de polias: pacote WL/electric/CT com transitionTechnology = 'none' → equipamento desmontado
    const isPolias = item.transitionTechnology === 'none' &&
      (pkg.technology === 'wireline' || pkg.technology === 'electric' || pkg.technology === 'ct')

    if (isPolias) {
      // Se polias é contingência e a tech firme será necessária novamente, dismount + remount formam par contingencial
      if (item.isContingency && mountedTech !== 'none' && mountedTech !== 'bop' &&
          needsTechAhead(idx + 1, mountedTech, annularBoreSession)) {
        pendingContingencyRemountTech = mountedTech
        dismount(item.phase, true)
      } else {
        dismount(item.phase)
      }
      result.push(item)
      continue
    }

    // Operação que requer equipamento de pressão
    if (effectiveTech === 'wireline' || effectiveTech === 'electric' || effectiveTech === 'ct') {
      // Contingência com tech diferente da sessão firme e tech firme necessária adiante:
      // força desmontagem contingencial e marca remontagem — unidades de pressão são fisicamente
      // exclusivas no TH/SFT, overlay simultâneo não é possível.
      if (item.isContingency && overlayTech === 'none' && isFirmSession() &&
          (effectiveTech as Technology) !== mountedTech &&
          needsTechAhead(idx + 1, mountedTech, annularBoreSession)) {
        pendingContingencyRemountTech = mountedTech
        dismount(item.phase, true)
      }
      ensureMount(effectiveTech, item.phase, item.isContingency, item.annularBore === true)
      result.push(item)
      if (pkg.noDismountAfter) { overlayTech = 'none'; overlayAnnularBore = false; mountedTech = 'none'; annularBoreSession = false; mountIsContingency = false; sessionHasNonContingency = false }
    } else {
      // Demais operações (none, workstring, bop sem isMountOp/isDismountOp): mantém estado
      result.push(item)
    }

    // Regra 3: dismount imediatamente após a última operação que precisava do equipamento.
    // Verifica overlay primeiro; dismount() do firme também limpa overlay automaticamente.
    if (overlayTech !== 'none' && !needsTechAhead(idx + 1, overlayTech, overlayAnnularBore)) {
      dismountOverlay(item.phase)
    }
    if (mountedTech !== 'none' && mountedTech !== 'bop' && !needsTechAhead(idx + 1, mountedTech, annularBoreSession)) {
      // Não desmontar se a próxima op é contingência com tech diferente — ela criará um overlay
      // e a sessão firme deve permanecer ativa por baixo até o overlay terminar.
      if (!nextTechIsContingencyOverlay(idx + 1, mountedTech)) {
        dismount(item.phase)
      }
    }
  }

  return result
}

export function recomputeTransitions(
  items: ScheduleItem[],
  rigType: RigType,
  operationType: 'Generalista' | 'LWO',
  percentile: Percentile,
  scopeId?: ScopeId,
): ScheduleItem[] {
  const base = items.filter(i => !i.autoInserted)
  return applyTimeline(applyTransitions(base, rigType, operationType, percentile, scopeId ? deriveBaseMode(scopeId) : 'through_tubing'))
}
