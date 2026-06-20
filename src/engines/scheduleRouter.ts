import type { WizardInputs, ScheduleItem } from '../types'
import { generateSchedule as generateScheduleBundle } from './sequenceEngine'
import { generateScheduleFromLogic } from './logicEngine'
import { getLogicOverride } from '../data/logicOverrideStore'

export function generateSchedule(inputs: WizardInputs): ScheduleItem[] {
  const override = getLogicOverride(inputs.scopeId)
  if (override) return generateScheduleFromLogic(inputs, override)
  return generateScheduleBundle(inputs)
}
