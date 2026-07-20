import type { AppState } from '../types'
import { EDS_TYPES } from '../data/edsTypes'
import { pkgFirme } from './fineTuningTime'

// A single datom: [entity, attribute, value] — the unit exported to JSON at the
// end of Etapa 3. Kept as a shared builder so the export and the Admin view
// always render exactly the same variables.
export type Fact = [string, string, unknown]

export interface ProjectFacts {
  project_eid: string
  facts: Fact[]
}

// packageName já inclui o prefixo de tecnologia (ex.: "Arame - Gabaritagem"),
// vindo direto do nome original do pacote — então não o prefixamos novamente.
// Pacotes NOVO (packageId começa com "NOVO") e itens inseridos manualmente
// (packageId === "MANUAL") são exportados SOMENTE com o nome, sem código no início;
// os demais (ABAN) mantêm o prefixo "[código] - ".
const fullPkgName = (item: { packageId: string; packageName: string }) =>
  item.packageId.startsWith('NOVO') || item.packageId === 'MANUAL'
    ? item.packageName
    : `[${item.packageId}] - ${item.packageName}`

/**
 * Builds the full list of facts ([entity, attribute, value]) describing the
 * current project. This is the single source of truth shared by the JSON export
 * (Etapa 3) and the Admin view.
 */
export function buildProjectFacts(state: Pick<AppState, 'wellName' | 'fineTuningItems'>): ProjectFacts {
  const now = new Date().toISOString()
  const projectEid = `sprint-${Date.now().toString(36)}`
  const facts: Fact[] = []

  const pkgEid = (uid: string) => `entity/${uid}`

  const activeItems = state.fineTuningItems.filter(it => !it.isBlank)

  // Mesmo cálculo do total "Firme" exibido na Etapa 3 (soma por linha quando o
  // pacote tem tempos individuais, não apenas item.duration) — evita que o tempo
  // exportado divirja do que o usuário viu/ajustou na tela.
  const totalTime = activeItems.reduce((sum, it) => sum + pkgFirme(it), 0)

  // Project-level facts
  facts.push([projectEid, 'project/name', state.wellName])
  facts.push([projectEid, 'project/created_at', now])
  facts.push([projectEid, 'project/updated_at', now])
  facts.push([projectEid, 'project/is_published', false])
  facts.push([projectEid, 'project/logic', 'logic/workover'])
  facts.push([projectEid, 'workover/intervetion_scenario', 'workover.intervention_scenario/pre-salt'])
  facts.push([projectEid, 'sequence/package_stacker_used', true])
  facts.push([projectEid, 'probabilistic/apply_total_time', true])
  facts.push([projectEid, 'probabilistic/apply_package_probabilistic_time', false])
  facts.push([projectEid, 'probabilistic/total_time', Math.round(totalTime * 100) / 100])

  // sequence/items — one fact per LINE entity (pattern confirmed: same package/name
  // repeats across multiple entities, each with its own activity/label and step)
  for (const item of activeItems) {
    for (const line of item.lines) {
      facts.push([projectEid, 'sequence/items', pkgEid(line.id)])
    }
  }

  // Per-line facts: each FineTuningLine → ONE entity with both package/* and activity/* facts
  // package/name is the parent item name (repeated across all lines of the same item)
  let globalOrder = 0
  let prevEid: string | null = null

  for (const item of activeItems) {
    const name = fullPkgName(item)

    for (const line of item.lines) {
      const eid = pkgEid(line.id)

      // package/* facts (same name repeated for all lines of this item)
      facts.push([eid, 'package/name', name])
      facts.push([eid, 'package/label', name])

      // activity/* facts (line-specific)
      facts.push([eid, 'activity/name', name])
      facts.push([eid, 'activity/label', line.text])
      facts.push([eid, 'activity/duration', line.duration ?? 0])
      facts.push([eid, 'activity/ptime', 0.0])
      facts.push([eid, 'activity/is_contingency', line.isContingency ?? item.isContingency])
      facts.push([eid, 'activity/compensating', line.compensando ?? null])
      if (line.isParallel) facts.push([eid, 'activity/parallel', true])
      facts.push([eid, 'activity/autoshear', []])
      // EDS: a seleção viaja em activity/eds.info[].selected = [índice, rótulo] (formato do
      // sistema importador). Corte (índice > 0) → CONNECTED com a seleção; 0/Sem Corte → NOT_CONNECTED.
      // O estado é só placeholder — o sistema recalcula CONNECTED/NOT_CONNECTED pelo contexto de BOP.
      const edsN = line.edsNumber   // undefined/null = sem resposta (campo em branco)
      facts.push([eid, 'activity/eds', (edsN != null && edsN > 0)
        ? { state: 'CONNECTED', info: [{ selected: [edsN, EDS_TYPES[edsN] ?? ''] }] }
        : { state: 'NOT_CONNECTED' }])
      facts.push([eid, 'activity/eds_number', edsN ?? null])
      if (line.edsComment?.trim()) facts.push([eid, 'activity/eds_comment', line.edsComment.trim()])
      if (line.bopMarker) facts.push([eid, 'activity/bop_state', line.bopMarker])
      facts.push([eid, 'activity/was_modified_by_user', true])
      const noteParts = [
        line.csbPrimario && `CSB Primário: ${line.csbPrimario}`,
        line.csbSecundario && `CSB Secundário: ${line.csbSecundario}`,
        line.details,
      ].filter(Boolean)
      const notesHtml = noteParts.map(p => `<p>${p}</p>`).join('\n\n')
      if (notesHtml) facts.push([eid, 'activity/notes', notesHtml])
      const standards = line.procedures ?? item.normas
      if (standards) facts.push([eid, 'activity/standards', standards])

      // Ontology (line-level)
      facts.push([eid, 'openwells/phase', line.owFase ?? item.phase])
      if (line.owAtividade) facts.push([eid, 'openwells/activity', line.owAtividade])
      if (line.owOperacao)  facts.push([eid, 'openwells/operation', line.owOperacao])
      if (line.owEtapa)     facts.push([eid, 'openwells/step', line.owEtapa])
      if (line.genOperacao) facts.push([eid, 'genesis/operation', line.genOperacao])

      // Sequence
      facts.push([eid, 'child/order', globalOrder++])
      if (prevEid) facts.push([eid, 'item/prev', prevEid])

      prevEid = eid
    }
  }

  return { project_eid: projectEid, facts }
}
