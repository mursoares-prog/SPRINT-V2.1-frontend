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
    if (res.status === 401 || res.status === 403) {
      window.dispatchEvent(new CustomEvent('sprint:auth-error'))
    }
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

/** Acrescenta uma entrada (append-only). `authHeaders` deve trazer o Bearer de um admin. */
export function addChangelog(entry: ChangeLogInput, authHeaders: Record<string, string>): Promise<ChangeLogEntry> {
  return req<ChangeLogEntry>('/api/changelog', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(entry),
  })
}

// ── Edição da base das linhas dos pacotes (overrides) ────────────────────────
export type PackageLines = Record<string, Array<Record<string, unknown> & { text: string }>>

/** Base mesclada (bundled + overrides do servidor). */
export function getMergedPackageLines(): Promise<PackageLines> {
  return req<PackageLines>('/api/base/package-lines')
}

/** Campos válidos para tokens {{campo=glifo}} (para o seletor do editor). */
export function getBaseFields(): Promise<string[]> {
  return req<string[]>('/api/base/fields')
}

/** Override completo de uma linha da base (todos os campos editáveis). */
export interface LineOverride {
  pkgId: string
  lineIndex: number
  text: string | null
  duration: number | null
  rec: string | null
  pad: string | null
  owFase: string | null
  owAtividade: string | null
  owOperacao: string | null
  owEtapa: string | null
  author?: string | null
  updatedAt?: string | null
}

/** Patch parcial enviado ao editar uma linha (campos omitidos ficam inalterados). */
export type LineEditPatch = Partial<Pick<LineOverride,
  'text' | 'duration' | 'rec' | 'pad' | 'owFase' | 'owAtividade' | 'owOperacao' | 'owEtapa'>>

/** Salva um override parcial de uma linha (texto, duração, rec/pad, ontologia). */
export function editBaseLine(pkgId: string, lineIndex: number, patch: LineEditPatch, authHeaders: Record<string, string>) {
  return req<LineOverride & { unchanged?: boolean }>(
    `/api/base/package-lines/${encodeURIComponent(pkgId)}/${lineIndex}`,
    { method: 'PUT', headers: authHeaders, body: JSON.stringify(patch) },
  )
}

/** Todos os overrides da base (para mesclar rec/pad no front e refletir no Admin). */
export function getBaseOverrides(): Promise<LineOverride[]> {
  return req<LineOverride[]>('/api/base/overrides')
}

/** Reverte a linha ao texto original (remove o override). */
export function resetBaseLine(pkgId: string, lineIndex: number, authHeaders: Record<string, string>) {
  return req<{ pkgId: string; lineIndex: number; text: string; reverted: boolean }>(
    `/api/base/package-lines/${encodeURIComponent(pkgId)}/${lineIndex}`,
    { method: 'DELETE', headers: authHeaders },
  )
}

// ── Edição estrutural por pacote + pacotes customizados ────────────────────────

/** Linha completa da base (12 campos de package_lines + rec/pad de detalhes). */
export interface BaseLine {
  text: string
  duration: number | null
  bop: string | null
  compensando: boolean | null
  isContingency: boolean | null
  isParallel: boolean | null
  owFase: string | null
  owAtividade: string | null
  owOperacao: string | null
  owEtapa: string | null
  genOperacao: string | null
  genOperacaoDual: string | null
  rec: string | null
  pad: string | null
}

export interface PackageOverride { pkgId: string; lines: BaseLine[]; author?: string | null; updatedAt?: string | null }
export interface CustomPackageMeta { pkgId: string; name: string; category: string; technology: string }

/** Arrays completos de linhas por pacote editado (para preencher stores no boot). */
export function getBasePackageOverrides(): Promise<PackageOverride[]> {
  return req<PackageOverride[]>('/api/base/package-overrides')
}

/** Metas dos pacotes customizados (criados/duplicados no Admin). */
export function getCustomPackages(): Promise<CustomPackageMeta[]> {
  return req<CustomPackageMeta[]>('/api/base/packages')
}

/** Grava o array COMPLETO de linhas de um pacote (estrutural: add/del/reorder). */
export function savePackageLines(pkgId: string, lines: BaseLine[], authHeaders: Record<string, string>) {
  return req<{ pkgId: string; lines: BaseLine[] }>(
    `/api/base/packages/${encodeURIComponent(pkgId)}/lines`,
    { method: 'PUT', headers: authHeaders, body: JSON.stringify({ lines }) },
  )
}

/** Reverte as linhas de um pacote do bundle ao original. */
export function resetPackageLines(pkgId: string, authHeaders: Record<string, string>) {
  return req<{ pkgId: string; reverted: boolean }>(
    `/api/base/packages/${encodeURIComponent(pkgId)}/lines`,
    { method: 'DELETE', headers: authHeaders },
  )
}

/** Importa um batch de pacotes do sistema externo (formato ProjectFacts enriquecido). */
export function importPackages(
  packages: Array<{ pkgId: string; name: string; category: string; technology: string; lines: BaseLine[] }>,
  authHeaders: Record<string, string>,
) {
  return req<{ imported: number; packages: Array<{ pkgId: string; tipo: string; lines: number }> }>(
    '/api/base/import',
    { method: 'POST', headers: authHeaders, body: JSON.stringify({ packages }) },
  )
}

/** Cria um pacote customizado (em branco ou duplicando linhas). */
export function createPackage(meta: { name: string; category: string; technology: string }, lines: BaseLine[], authHeaders: Record<string, string>) {
  return req<CustomPackageMeta & { lines: BaseLine[] }>(
    '/api/base/packages',
    { method: 'POST', headers: authHeaders, body: JSON.stringify({ ...meta, lines }) },
  )
}

/** Edita nome/categoria/tecnologia de um pacote customizado. */
export function updatePackageMeta(pkgId: string, patch: Partial<{ name: string; category: string; technology: string }>, authHeaders: Record<string, string>) {
  return req<CustomPackageMeta>(
    `/api/base/packages/${encodeURIComponent(pkgId)}`,
    { method: 'PATCH', headers: authHeaders, body: JSON.stringify(patch) },
  )
}

/** Apaga um pacote customizado (meta + linhas). */
export function deletePackage(pkgId: string, authHeaders: Record<string, string>) {
  return req<{ pkgId: string; deleted: boolean }>(
    `/api/base/packages/${encodeURIComponent(pkgId)}`,
    { method: 'DELETE', headers: authHeaders },
  )
}

// ─── Grupos de pacotes ────────────────────────────────────────────────────────

export interface PackageGroupInfo { id: string; label: string }

export function listPackageGroups(): Promise<PackageGroupInfo[]> {
  return req<PackageGroupInfo[]>('/api/base/package-groups')
}

export function createPackageGroup(label: string, authHeaders: Record<string, string>): Promise<PackageGroupInfo> {
  return req<PackageGroupInfo>('/api/base/package-groups', {
    method: 'POST', headers: authHeaders, body: JSON.stringify({ label }),
  })
}

export function deletePackageGroup(id: string, authHeaders: Record<string, string>): Promise<void> {
  return req<void>(`/api/base/package-groups/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: authHeaders,
  })
}

// ─── Logic Scope API ─────────────────────────────────────────────────────────

export interface LogicScopeMeta {
  scopeId: string
  isCustom: boolean
  label: string | null
  fase: string | null
  opTypes: string[] | null
  sectionCount: number
  author: string | null
  updatedAt: string
}

export function getLogicScopes() {
  return req<LogicScopeMeta[]>('/api/logic/scopes')
}

export function getLogicScope(scopeId: string) {
  return req<{ scopeId: string; isCustom: boolean; label: string | null; sections: unknown[] }>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}`,
  )
}

export function saveLogicScope(scopeId: string, sections: unknown[], authHeaders: Record<string, string>) {
  return req<{ scopeId: string; isCustom: boolean; sectionCount: number }>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}`,
    { method: 'PUT', headers: authHeaders, body: JSON.stringify({ sections }) },
  )
}

export function createLogicScope(meta: { scopeId: string; label: string; sections?: unknown[] }, authHeaders: Record<string, string>) {
  return req<{ scopeId: string; isCustom: boolean; label: string; sectionCount: number }>(
    '/api/logic/scopes',
    { method: 'POST', headers: authHeaders, body: JSON.stringify(meta) },
  )
}

export function saveLogicScopeMeta(
  scopeId: string,
  meta: { fase?: string | null; opTypes?: string[] | null; label?: string | null },
  authHeaders: Record<string, string>,
) {
  return req<{ scopeId: string; fase: string | null; opTypes: string[] | null; label: string | null }>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}/meta`,
    { method: 'PATCH', headers: authHeaders, body: JSON.stringify(meta) },
  )
}

export function deleteLogicScope(scopeId: string, authHeaders: Record<string, string>) {
  return req<{ scopeId: string; deleted: boolean; wasCustom: boolean }>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}`,
    { method: 'DELETE', headers: authHeaders },
  )
}

// ── Versionamento (histórico de snapshots dos fluxogramas) ──────────────────
export interface LogicScopeVersionMeta {
  id: string
  scopeId: string
  label: string | null
  note: string | null
  author: string | null
  sectionCount: number
  createdAt: string
}

export function getLogicScopeVersions(scopeId: string) {
  return req<LogicScopeVersionMeta[]>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}/versions`,
  )
}

export function getLogicScopeVersion(scopeId: string, versionId: string) {
  return req<LogicScopeVersionMeta & { sections: unknown[] }>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}/versions/${encodeURIComponent(versionId)}`,
  )
}

export function restoreLogicScopeVersion(scopeId: string, versionId: string, authHeaders: Record<string, string>) {
  return req<{ scopeId: string; isCustom: boolean; sectionCount: number }>(
    `/api/logic/scopes/${encodeURIComponent(scopeId)}/versions/${encodeURIComponent(versionId)}/restore`,
    { method: 'POST', headers: authHeaders },
  )
}

export function getLogicScopeGroups() {
  return req<Record<string, unknown>>('/api/logic/scope-groups')
}

export function saveLogicScopeGroups(data: Record<string, unknown>, authHeaders: Record<string, string>) {
  return req<{ ok: boolean }>('/api/logic/scope-groups', {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({ data }),
  })
}
