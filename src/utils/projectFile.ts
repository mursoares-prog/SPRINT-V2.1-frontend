import type { WizardInputs, ScheduleItem, ScopeId, ProjectData, FineTuningItem } from '../types'
import type { PlaceholderFieldDef } from './api'

export interface ProjectFile {
  version: '1' | '2'
  wellName: string
  /** Nome do projeto (do sistema externo) — pode haver vários projetos por poço. */
  projectName?: string
  /** Chave do usuário (do sistema externo) que criou/salvou este projeto. */
  userKey?: string
  scopeId: ScopeId
  savedAt: string
  inputs: WizardInputs
  schedule: ScheduleItem[]
  /** Dados do projeto (etapa 3) — ausente em arquivos v1. */
  projectData?: ProjectData
  /** Detalhamento por pacote/linha (etapa 3) — ausente em arquivos v1. */
  fineTuningItems?: FineTuningItem[]
  /** Snapshot da config de placeholders (aba Place Holders) vigente na criação do
   *  projeto — congela a estrutura do assistente da Etapa 3 para este projeto, de modo
   *  que edições posteriores do admin só afetem projetos criados depois. Ausente em
   *  projetos antigos (que caem no fallback da config live do servidor). */
  placeholderDefs?: PlaceholderFieldDef[]
}

export function buildProjectFile(
  wellName: string,
  inputs: WizardInputs,
  schedule: ScheduleItem[],
  projectData?: ProjectData,
  fineTuningItems?: FineTuningItem[],
  projectName?: string,
  placeholderDefs?: PlaceholderFieldDef[],
  userKey?: string,
): ProjectFile {
  return {
    version: '2',
    wellName,
    ...(projectName && { projectName }),
    ...(userKey && { userKey }),
    scopeId: inputs.scopeId,
    savedAt: new Date().toISOString(),
    inputs,
    schedule,
    ...(projectData && { projectData }),
    ...(fineTuningItems && fineTuningItems.length > 0 && { fineTuningItems }),
    ...(placeholderDefs && placeholderDefs.length > 0 && { placeholderDefs }),
  }
}
