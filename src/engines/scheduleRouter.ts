import type { WizardInputs, ScheduleItem, BundleScopeId } from '../types'
import { generateSchedule as generateScheduleBundle } from './sequenceEngine'
import { generateScheduleFromLogic } from './logicEngine'
import { getLogicOverride, expandScopeRefs } from '../data/logicOverrideStore'
import { LOGIC_BY_SCOPE, type LSec } from '../data/logicSecs'

const BUNDLE_SCOPES = new Set<string>([
  'FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_BOP', 'FSU_Conv_RCMA',
  'FSU_Sup_COP', 'FSU_Sup_PWC', 'FS1_Mec',
  'FS2_Conv_BOP', 'FS2_Conv_RCMA', 'FS2_Sup_COP', 'FS2_Sup_PWC',
] satisfies BundleScopeId[])

export function generateSchedule(inputs: WizardInputs): ScheduleItem[] {
  const scopeId = inputs.scopeId ?? ''

  // Escopos fora do catálogo de bundles são custom: dirigidos por logicAnswers + default
  // `active` do fluxograma, sem o resolver de inputs do wizard (QUESTION_LABEL_RESOLVER).
  const isCustom = !BUNDLE_SCOPES.has(scopeId)

  // 1. Backend-saved logic override (custom scopes edited via admin)
  //    Expande seções `ref` (reuso vivo) antes de avaliar — um escopo só com placeholder
  //    de inclusão tem decisions vazio no topo, mas ganha decisões ao expandir.
  //    Only use if sections have actual decisions (avoids empty-section overrides blocking fallback)
  const override = getLogicOverride(scopeId)
  const hasDecisions = (secs: LSec[]) => secs.some(s => s.decisions.length > 0 || (s.always?.length ?? 0) > 0)
  if (override?.length) {
    const expanded = expandScopeRefs(override)
    if (hasDecisions(expanded)) return generateScheduleFromLogic(inputs, expanded, isCustom)
  }

  // 2. Static logic definition fallback (for scopes in LOGIC_BY_SCOPE not yet saved to backend,
  //    or where backend sections lack decisions)
  if (isCustom) {
    const staticLogic = LOGIC_BY_SCOPE[scopeId]
    if (staticLogic) return generateScheduleFromLogic(inputs, staticLogic, isCustom)
  }

  // 3. Standard sequence engine for predefined bundle scopes
  return generateScheduleBundle(inputs)
}
