// Cliente da API de persistência (backend FastAPI).
// A URL base vem de VITE_API_URL; se não estiver definida, a persistência no
// servidor fica desativada (a UI cai de volta para salvar/abrir arquivo).
import type { ProjectFile } from './projectFile'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** Projeto completo retornado pelo servidor: o ProjectFile salvo + o id. */
export type StoredProject = ProjectFile & { id: string }

/** Há backend configurado? Controla a exibição dos recursos de servidor. */
export function isApiConfigured(): boolean {
  return API_URL.length > 0
}

type ReqInit = RequestInit & { timeoutMs?: number }

async function req<T>(path: string, init?: ReqInit): Promise<T> {
  const { headers, timeoutMs, ...rest } = init ?? {}
  // Timeout opcional: aborta a requisição se o servidor não responder a tempo, para
  // que uma conexão travada não deixe o chamador (ex.: autosave) preso para sempre.
  const controller = timeoutMs != null ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(headers as Record<string, string> | undefined) },
      ...(controller && { signal: controller.signal }),
      ...rest,
    })
  } catch (e) {
    if (controller?.signal.aborted) throw new Error('Tempo de conexão esgotado', { cause: e })
    throw e
  } finally {
    if (timer) clearTimeout(timer)
  }
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

/** Busca um projeto existente por poço+projeto exatos (identidade do sistema externo).
 * `null` quando não há projeto salvo para esse par — não é erro. */
export function lookupServerProject(wellName: string, projectName: string): Promise<StoredProject | null> {
  const qs = new URLSearchParams({ wellName, projectName })
  return req<StoredProject | null>(`/api/projects/lookup?${qs}`)
}

/** Timeout do autosave: conexão travada cai em erro em vez de ficar presa "Salvando…". */
const SAVE_TIMEOUT_MS = 15000

/** Cria (sem id) ou atualiza (com id) um projeto no servidor. */
export function saveServerProject(
  project: ProjectFile,
  id?: string,
  authHeaders?: Record<string, string>,
): Promise<StoredProject> {
  const body = JSON.stringify(project)
  return id
    ? req<StoredProject>(`/api/projects/${id}`, { method: 'PUT', body, headers: authHeaders, timeoutMs: SAVE_TIMEOUT_MS })
    : req<StoredProject>('/api/projects', { method: 'POST', body, headers: authHeaders, timeoutMs: SAVE_TIMEOUT_MS })
}

// ── Log de alterações (changeLog server-side) ────────────────────────────────
export interface ChangeLogEntry {
  id: number
  data: string
  created_at?: string | null
  pacote: string
  linha: number | null
  tipo: string
  resumo: string
  antes?: string | null
  depois?: string | null
  author?: string | null
  undoable?: boolean
  undone?: boolean
}

export function listChangelog(): Promise<ChangeLogEntry[]> {
  return req<ChangeLogEntry[]>('/api/changelog')
}

/** Desfaz a alteração registrada em `entryId`, restaurando o estado anterior. */
export function undoChangelog(entryId: number, authHeaders: Record<string, string>): Promise<ChangeLogEntry> {
  return req<ChangeLogEntry>(`/api/changelog/${entryId}/undo`, {
    method: 'POST',
    headers: authHeaders,
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

/** Todos os overrides da base (para mesclar rec/pad no front e refletir no Admin). */
export function getBaseOverrides(): Promise<LineOverride[]> {
  return req<LineOverride[]>('/api/base/overrides')
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
  edsNumber: number | null
  edsComment: string | null
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

// ─── Placeholders customizados ────────────────────────────────────────────────

/** Placeholder criado pelo admin: token, rótulo e id da categoria (grupo do catálogo). */
export interface CustomPlaceholder { token: string; label: string; category: string }

export function listCustomPlaceholders(): Promise<CustomPlaceholder[]> {
  return req<CustomPlaceholder[]>('/api/base/placeholders')
}

export function deleteCustomPlaceholder(token: string, authHeaders: Record<string, string>): Promise<void> {
  return req<void>(`/api/base/placeholders/${encodeURIComponent(token)}`, {
    method: 'DELETE', headers: authHeaders,
  })
}

// ─── Definições de campo do assistente de preenchimento (Etapa 3) ────────────

export type PlaceholderFieldType = 'text' | 'number' | 'unit' | 'picklist' | 'boolean'

/** Como o campo de um placeholder {{token=glifo}} deve aparecer no assistente. */
export interface PlaceholderFieldDef {
  token: string
  label: string
  fieldType: PlaceholderFieldType
  unit: string | null
  options: string[]
  group: string | null
  /** Segundo nível, opcional — ex.: seção "BHA - Arame" > subgrupo "Gabaritagem". */
  subgroup: string | null
  orderIndex: number
  /** Token de outro campo do qual este depende (relação simples entre campos). */
  dependsOnToken: string | null
  /** Valor esperado do campo dependente para este campo aparecer/habilitar. */
  dependsOnValue: string | null
  author: string | null
}

export function listPlaceholderFieldDefs(): Promise<PlaceholderFieldDef[]> {
  return req<PlaceholderFieldDef[]>('/api/placeholder-defs')
}

export function savePlaceholderFieldDef(
  def: PlaceholderFieldDef,
  authHeaders: Record<string, string>,
): Promise<PlaceholderFieldDef> {
  const { token, ...body } = def
  return req<PlaceholderFieldDef>(`/api/placeholder-defs/${encodeURIComponent(token)}`, {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({
      token,
      label: body.label,
      field_type: body.fieldType,
      unit: body.unit,
      options: body.options,
      group: body.group,
      subgroup: body.subgroup,
      order_index: body.orderIndex,
      depends_on_token: body.dependsOnToken,
      depends_on_value: body.dependsOnValue,
    }),
  })
}

export function deletePlaceholderFieldDef(token: string, authHeaders: Record<string, string>): Promise<void> {
  return req<void>(`/api/placeholder-defs/${encodeURIComponent(token)}`, {
    method: 'DELETE', headers: authHeaders,
  })
}

export interface PlaceholderReorderItem { token: string; orderIndex: number; group: string | null; subgroup: string | null }

/** Aplica uma reordenação (drag-and-drop) em lote — uma única transação/entrada
 * de changelog no backend, em vez de N PUTs individuais concorrentes. */
export function reorderPlaceholderFieldDefs(
  items: PlaceholderReorderItem[],
  authHeaders: Record<string, string>,
): Promise<{ changed: number }> {
  return req<{ changed: number }>('/api/placeholder-defs/reorder', {
    method: 'PUT', headers: authHeaders,
    body: JSON.stringify({ items: items.map(i => ({ token: i.token, order_index: i.orderIndex, group: i.group, subgroup: i.subgroup })) }),
  })
}

// ─── Wireline Tools API (canivete suíço) ─────────────────────────────────────

/** Linha da tabela de referência de ferramentas de arame: equipamento a
 *  instalar/retirar → ferramenta de aplicação, de pescaria, correlacionadas,
 *  nipple relacionado e local (Onde). */
export interface WirelineTool {
  id: number
  categoria: string | null
  equipamento: string
  aplicacao: string | null
  pescaria: string | null
  correlacionadas: string | null
  nipples: string | null
  onde: string | null
  orderIndex: number
  author: string | null
}

export type WirelineToolInput = Omit<WirelineTool, 'id' | 'author'>

export function listWirelineTools(): Promise<WirelineTool[]> {
  return req<WirelineTool[]>('/api/wireline-tools')
}

function wirelineBody(t: WirelineToolInput) {
  return JSON.stringify({
    categoria: t.categoria,
    equipamento: t.equipamento,
    aplicacao: t.aplicacao,
    pescaria: t.pescaria,
    correlacionadas: t.correlacionadas,
    nipples: t.nipples,
    onde: t.onde,
    order_index: t.orderIndex,
  })
}

export function createWirelineTool(t: WirelineToolInput, authHeaders: Record<string, string>): Promise<WirelineTool> {
  return req<WirelineTool>('/api/wireline-tools', { method: 'POST', headers: authHeaders, body: wirelineBody(t) })
}

export function updateWirelineTool(id: number, t: WirelineToolInput, authHeaders: Record<string, string>): Promise<WirelineTool> {
  return req<WirelineTool>(`/api/wireline-tools/${id}`, { method: 'PUT', headers: authHeaders, body: wirelineBody(t) })
}

export function deleteWirelineTool(id: number, authHeaders: Record<string, string>): Promise<void> {
  return req<void>(`/api/wireline-tools/${id}`, { method: 'DELETE', headers: authHeaders })
}

// ─── Logic Scope API ─────────────────────────────────────────────────────────

export interface LogicScopeMeta {
  scopeId: string
  isCustom: boolean
  label: string | null
  fase: string | null
  opTypes: string[] | null
  rigTypes: string[] | null
  wellClass: string | null
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
  meta: { fase?: string | null; opTypes?: string[] | null; rigTypes?: string[] | null; wellClass?: string | null; label?: string | null },
  authHeaders: Record<string, string>,
) {
  return req<{ scopeId: string; fase: string | null; opTypes: string[] | null; rigTypes: string[] | null; wellClass: string | null; label: string | null }>(
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
