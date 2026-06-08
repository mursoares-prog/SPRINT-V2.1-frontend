// Cliente da API de persistência (backend FastAPI).
// A URL base vem de VITE_API_URL; se não estiver definida, a persistência no
// servidor fica desativada (a UI cai de volta para salvar/abrir arquivo).
import type { ProjectFile } from './projectFile'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

export interface ProjectSummary {
  id: string
  wellName: string
  scopeId: string
  savedAt: string
  updatedAt: string
}

/** Projeto completo retornado pelo servidor: o ProjectFile salvo + o id. */
export type StoredProject = ProjectFile & { id: string }

/** Há backend configurado? Controla a exibição dos recursos de servidor. */
export function isApiConfigured(): boolean {
  return API_URL.length > 0
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { headers, ...rest } = init ?? {}
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string> | undefined) },
    ...rest,
  })
  if (!res.ok) {
    let detail = `Erro ${res.status}`
    try {
      const body = await res.json()
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch { /* corpo não-JSON */ }
    throw new Error(detail)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function listServerProjects(): Promise<ProjectSummary[]> {
  return req<ProjectSummary[]>('/api/projects')
}

export function getServerProject(id: string): Promise<StoredProject> {
  return req<StoredProject>(`/api/projects/${id}`)
}

export function deleteServerProject(id: string): Promise<void> {
  return req<void>(`/api/projects/${id}`, { method: 'DELETE' })
}

/** Cria (sem id) ou atualiza (com id) um projeto no servidor. */
export function saveServerProject(project: ProjectFile, id?: string): Promise<StoredProject> {
  const body = JSON.stringify(project)
  return id
    ? req<StoredProject>(`/api/projects/${id}`, { method: 'PUT', body })
    : req<StoredProject>('/api/projects', { method: 'POST', body })
}

// ── Log de alterações (changeLog server-side) ────────────────────────────────
export interface ChangeLogEntry {
  id: number
  data: string
  pacote: string
  linha: number | null
  tipo: string
  resumo: string
  antes?: string | null
  depois?: string | null
  author?: string | null
}

export type ChangeLogInput = Omit<ChangeLogEntry, 'id' | 'data' | 'author'>

export function listChangelog(): Promise<ChangeLogEntry[]> {
  return req<ChangeLogEntry[]>('/api/changelog')
}

/** Acrescenta uma entrada (append-only). `authHeaders` deve trazer o Bearer de um editor. */
export function addChangelog(entry: ChangeLogInput, authHeaders: Record<string, string>): Promise<ChangeLogEntry> {
  return req<ChangeLogEntry>('/api/changelog', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(entry),
  })
}
