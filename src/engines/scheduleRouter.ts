import type { WizardInputs, ScheduleItem, BundleScopeId } from '../types'
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

  // A engine antiga (wizard) foi aposentada: todo escopo bundle segue rigorosamente o
  // fluxograma do escopo — perguntas idênticas e na mesma ordem do editor de lógica,
  // respostas via logicAnswers + defaults `active` (modo strict do logicEngine, sem
  // resolver do wizard). Escopos custom já são dirigidos por logicAnswers.
  const strictFlow = !isCustom
  const asCustom = true

  // 1. Override de lógica salvo no backend (escopos custom editados no admin).
  //    Expande seções `ref` (reuso vivo) antes de avaliar — um escopo só com placeholder
  //    de inclusão tem decisions vazio no topo, mas ganha decisões ao expandir.
  //    Só usa se houver decisões de fato (evita override de seção vazia bloquear o estático).
  const override = getLogicOverride(scopeId)
  const hasDecisions = (secs: LSec[]) => secs.some(s => s.decisions.length > 0 || (s.always?.length ?? 0) > 0)
  if (override?.length) {
    const expanded = expandScopeRefs(override)
    if (hasDecisions(expanded)) return generateScheduleFromLogic(inputs, expanded, asCustom, strictFlow)
  }

  // 2. Definição estática da lógica (escopos bundle via LOGIC_BY_SCOPE; custom também).
  const staticLogic = LOGIC_BY_SCOPE[scopeId]
  if (staticLogic) return generateScheduleFromLogic(inputs, staticLogic, asCustom, strictFlow)

  // Sem árvore de decisão definida para o escopo — não há como gerar. Retorna vazio e
  // registra: todo escopo válido deve ter lógica (bundle ou override).
  console.error(`generateSchedule: nenhuma lógica de decisão definida para o escopo "${scopeId}".`)
  return []
}
