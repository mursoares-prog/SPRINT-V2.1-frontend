import type { WizardInputs, ScheduleItem, ScopeId, ProjectData, FineTuningItem } from '../types'
import type { PlaceholderFieldDef } from './api'

export interface ProjectFile {
  version: '1' | '2'
  wellName: string
  /** Nome do projeto (do sistema externo) — pode haver vários projetos por poço. */
  projectName?: string
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

const RECENT_KEY = 'sprint_recent_projects'
const MAX_RECENT = 8

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, '_').slice(0, 80)
}

export function buildProjectFile(
  wellName: string,
  inputs: WizardInputs,
  schedule: ScheduleItem[],
  projectData?: ProjectData,
  fineTuningItems?: FineTuningItem[],
  projectName?: string,
  placeholderDefs?: PlaceholderFieldDef[],
): ProjectFile {
  return {
    version: '2',
    wellName,
    ...(projectName && { projectName }),
    scopeId: inputs.scopeId,
    savedAt: new Date().toISOString(),
    inputs,
    schedule,
    ...(projectData && { projectData }),
    ...(fineTuningItems && fineTuningItems.length > 0 && { fineTuningItems }),
    ...(placeholderDefs && placeholderDefs.length > 0 && { placeholderDefs }),
  }
}

export function downloadProject(project: ProjectFile): void {
  const filename = `${sanitize(project.wellName)}_${project.scopeId}.json`
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
  pushToRecent(project)
}

export function loadProjectFromFile(): Promise<ProjectFile> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) { reject(new Error('Nenhum arquivo selecionado')); return }
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string) as ProjectFile
          if (!data.version || !data.wellName || !data.inputs || !data.schedule) {
            reject(new Error('Arquivo inválido')); return
          }
          pushToRecent(data)
          resolve(data)
        } catch {
          reject(new Error('Arquivo JSON inválido'))
        }
      }
      reader.readAsText(file)
    }
    input.click()
  })
}

function getRecentProjects(): ProjectFile[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as ProjectFile[]
  } catch {
    return []
  }
}

function pushToRecent(project: ProjectFile): void {
  const recent = getRecentProjects().filter(
    p => !(p.wellName === project.wellName && p.scopeId === project.scopeId)
  )
  recent.unshift({ ...project, savedAt: new Date().toISOString() })
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
  } catch { /* localStorage cheio */ }
}

export function removeFromRecent(wellName: string, scopeId: string): void {
  const recent = getRecentProjects().filter(
    p => !(p.wellName === wellName && p.scopeId === scopeId)
  )
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}
