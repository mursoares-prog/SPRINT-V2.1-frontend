import type { ScheduleItem, Phase, Technology, OperationMode, Percentile, RigType } from '../types'
import { getPackage, getDuration } from '../data/packages'

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

export function applyTimeline(items: ScheduleItem[]): ScheduleItem[] {
  let day = 0
  return items.map(item => {
    const start = day
    day += item.duration
    return { ...item, startDay: start, endDay: day }
  })
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
