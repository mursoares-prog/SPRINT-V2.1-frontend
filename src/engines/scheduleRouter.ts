import type { WizardInputs, ScheduleItem, BundleScopeId } from '../types'
import { generateScheduleFromLogic } from './logicEngine'
import { getLogicOverride, expandScopeRefs } from '../data/logicOverrideStore'
import type { LSec } from '../data/logicSecs'

// MODO DE GERAÇÃO (não é distinção de fonte/gerência): estes escopos foram authorados
// para o modo strict do logicEngine — o fluxograma é seguido rigorosamente (perguntas na
// mesma ordem), sem o resolver de inputs do wizard. Demais escopos são dirigidos por
// logicAnswers + defaults `active`. Chaveado por scopeId como getDefaultInputs; a árvore de
// lógica em si vem sempre do DB (não há mais definição estática no código).
const STRICT_FLOW_SCOPES = new Set<string>([
  'FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_BOP', 'FSU_Conv_RCMA',
  'FSU_Sup_COP', 'FSU_Sup_PWC', 'FS1_Mec',
  'FS2_Conv_BOP', 'FS2_Conv_RCMA', 'FS2_Sup_COP', 'FS2_Sup_PWC',
] satisfies BundleScopeId[])

export function generateSchedule(inputs: WizardInputs): ScheduleItem[] {
  const scopeId = inputs.scopeId ?? ''
  const strictFlow = STRICT_FLOW_SCOPES.has(scopeId)
  const asCustom = true

  // Fonte única da lógica: o override salvo no DB (carregado no boot). Expande seções `ref`
  // (reuso vivo) antes de avaliar — um escopo só com placeholder de inclusão tem decisions
  // vazio no topo, mas ganha decisões ao expandir.
  const override = getLogicOverride(scopeId)
  const hasDecisions = (secs: LSec[]) => secs.some(s => s.decisions.length > 0 || (s.always?.length ?? 0) > 0)
  if (override?.length) {
    const expanded = expandScopeRefs(override)
    if (hasDecisions(expanded)) return generateScheduleFromLogic(inputs, expanded, asCustom, strictFlow)
  }

  // Sem árvore de decisão para o escopo — não há como gerar. Todo escopo válido deve ter
  // lógica salva no DB.
  console.error(`generateSchedule: nenhuma lógica de decisão definida para o escopo "${scopeId}".`)
  return []
}
