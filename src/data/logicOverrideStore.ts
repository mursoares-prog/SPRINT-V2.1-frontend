import type { LSec } from './logicSecs'
import LOGIC_BUNDLE from './logicScopesBundle.json'

// ── Blocos de lógica reutilizáveis ──────────────────────────────────────────
// Um "bloco" é uma unidade de lógica definida UMA vez e incluída (via ref vivo) em
// vários escopos: editar o bloco propaga para todos que o usam. É armazenado como um
// escopo comum (mesma tabela/ferramenta), mas distinguido pelo prefixo do scopeId —
// assim NÃO aparece como escopo selecionável no gerador e ganha categoria própria na UI.
export const BLOCK_PREFIX = 'BLK_'
export function isBlockScope(scopeId: string): boolean {
  return scopeId.startsWith(BLOCK_PREFIX)
}

// `wellClass`: classe de "Tipo de poço" (etapa 1) — texto livre definido pelo admin no
// editor. null/ausente = bucket legado "seca" (mantém escopos criados antes desse campo
// existir, ex.: PGA5_Abandono_Seca_PA, funcionando sem re-classificação).
// `rigTypes`: tags de "Tipo de sonda" (etapa 1) às quais o escopo se aplica — um escopo
// pode ter mais de uma. null/[] no bucket legado "seca" = comportamento antigo (nenhum
// escopo aparece até ser marcado). Ambos os campos são livres (não um enum fixo): o admin
// cria classes novas no editor (LogicEditorPanel) e elas aparecem dinamicamente na
// Etapa 1 do wizard (App.tsx) — ver getKnownWellClasses/getKnownRigTags abaixo.
type CustomScopeMeta = { scopeId: string; label: string; fase: string | null; opTypes: string[] | null; rigTypes: string[] | null; wellClass: string | null }

// Estado inicial (fallback offline) vem do bundle gerado pelo backend (dump do DB).
// Com o servidor disponível, o App sobrepõe tudo via setLogicOverrides/setCustomScopesMeta.
// No modelo unificado, TODO escopo não-bloco com rótulo é selecionável no gerador — não
// há mais distinção bundle/custom.
let _overrides: Record<string, LSec[]> = LOGIC_BUNDLE.overrides as Record<string, LSec[]>
let _customScopes: CustomScopeMeta[] =
  (LOGIC_BUNDLE.scopes as Array<{ scopeId: string; label: string | null; fase: string | null; opTypes: string[] | null; rigTypes?: string[] | null; wellClass?: string | null }>)
    .filter(s => !s.scopeId.startsWith(BLOCK_PREFIX) && s.label !== null)
    .map(s => ({ scopeId: s.scopeId, label: s.label!, fase: s.fase, opTypes: s.opTypes, rigTypes: s.rigTypes ?? null, wellClass: s.wellClass ?? null }))

export function setLogicOverrides(o: Record<string, LSec[]>): void {
  _overrides = o
}

// Todas as seções carregadas (DB), por scopeId. Usado para catálogos derivados de todo o
// acervo (ex.: templates de perguntas no editor).
export function getAllScopeSections(): Record<string, LSec[]> {
  return _overrides
}

export function getLogicOverride(scopeId: string): LSec[] | null {
  const ov = _overrides[scopeId]
  // [] = escopo sem lógica (ex.: linha metadata-only criada por um PATCH de rename antes
  // do primeiro save) → tratado como "sem lógica" para a geração.
  if (ov && ov.length > 0) return ov
  return null
}

// Rótulo ATUAL de cada escopo/bloco (nome editável), mantido pela UI. Usado pela renderização
// dos cards de inclusão (`ref`) para exibir o nome vivo do bloco pelo scopeId — assim, ao
// renomear um bloco, todos os fluxogramas que o incluem passam a mostrar o novo nome sem
// perder o vínculo (que é sempre pelo scopeId, nunca pelo label cacheado no placeholder).
let _scopeLabels: Record<string, string> = Object.fromEntries(
  (LOGIC_BUNDLE.scopes as Array<{ scopeId: string; label: string | null }>)
    .filter(s => s.label !== null)
    .map(s => [s.scopeId, s.label as string])
)
// Merge (não substitui): App e editor contribuem com rótulos sem apagar os do outro.
export function setScopeLabels(map: Record<string, string>): void { _scopeLabels = { ..._scopeLabels, ...map } }
export function getScopeLabel(scopeId: string): string | null { return _scopeLabels[scopeId] ?? null }

export function setCustomScopesMeta(scopes: { scopeId: string; label: string; fase?: string | null; opTypes?: string[] | null; rigTypes?: string[] | null; wellClass?: string | null }[]): void {
  _customScopes = scopes.map(s => ({ ...s, fase: s.fase ?? null, opTypes: s.opTypes ?? null, rigTypes: s.rigTypes ?? null, wellClass: s.wellClass ?? null }))
}

export function getCustomScopesMeta(): CustomScopeMeta[] {
  return _customScopes
}

export function updateCustomScopeMeta(scopeId: string, patch: { fase?: string | null; opTypes?: string[] | null; rigTypes?: string[] | null; wellClass?: string | null }): void {
  _customScopes = _customScopes.map(s => s.scopeId === scopeId ? { ...s, ...patch } : s)
}

// Bucket implícito quando `wellClass` é null (compatibilidade com escopos criados antes
// desse campo existir, ex.: PGA5_Abandono_Seca_PA — ver comentário em CustomScopeMeta).
// Igual ao rótulo exibido no botão "Completação Seca" da Etapa 1 (App.tsx), para que
// null e o valor explícito resolvam para o mesmo bucket.
export const DEFAULT_WELL_CLASS = 'Completação Seca'

// Classes de "Tipo de poço" (etapa 1) já usadas por algum escopo custom — usado tanto para
// sugestões no editor (ComboInput) quanto para os botões extras na Etapa 1 do wizard.
export function getKnownWellClasses(): string[] {
  return [...new Set(_customScopes.map(s => s.wellClass).filter((w): w is string => !!w))].sort()
}

// Tags de "Tipo de sonda" (etapa 1) já usadas por escopos de uma classe de poço (ou de
// todas, se omitido) — usado para sugestões no editor e para os botões de sonda no wizard.
export function getKnownRigTags(wellClass?: string | null): string[] {
  const target = wellClass ?? DEFAULT_WELL_CLASS
  return [...new Set(
    _customScopes
      .filter(s => (s.wellClass ?? DEFAULT_WELL_CLASS) === target)
      .flatMap(s => s.rigTypes ?? []),
  )].sort()
}

// ── Pastas (grupos) de escopos — organização definida no editor de Árvores de
// Decisão (LogicEditorPanel) e persistida no servidor/localStorage. Na Etapa 1 do
// wizard (App.tsx), as pastas de topo viram os botões de "Tipo de intervenção".
// Espelha o `GroupStorage` do editor; aqui só precisamos de groups + memberships.
export type ScopeGroupNode = { id: string; name: string; parentId: string | null }

// Seed default — mesmos nomes/ids do SEED_GROUPS do LogicEditorPanel, usado só como
// fallback de cold-start (App carregando antes de o editor semear o localStorage e sem
// config no servidor). Mantido em sincronia manual com o editor.
const SEED_SCOPE_GROUPS: ScopeGroupNode[] = [
  { id: 'cat_molhada',  name: 'Abandono Completação Molhada', parentId: null },
  { id: 'cat_seca',     name: 'Abandono Completação Seca',    parentId: null },
  { id: 'cat_workover', name: 'Workover',                     parentId: null },
]
const SEED_MOLHADA_SCOPES = [
  'FSU_TT_FT', 'FSU_TT_BDC', 'FSU_Conv_BOP', 'FSU_Conv_RCMA', 'FSU_Sup_COP', 'FSU_Sup_PWC',
  'FS1_Mec', 'FS2_Conv_BOP', 'FS2_Conv_RCMA', 'FS2_Sup_COP', 'FS2_Sup_PWC',
]

let _scopeGroups: ScopeGroupNode[] = SEED_SCOPE_GROUPS
let _scopeMemberships: Record<string, string | null> =
  Object.fromEntries(SEED_MOLHADA_SCOPES.map(id => [id, 'cat_molhada']))

// Substitui a organização de pastas (chamado pelo App após buscar do servidor/localStorage).
// Grupos vazios preservam o seed — assim os botões não somem em ambientes sem config salva.
export function setScopeGroupsData(groups: ScopeGroupNode[], memberships: Record<string, string | null>): void {
  if (groups.length) {
    _scopeGroups = groups
    _scopeMemberships = memberships ?? {}
  }
}

// Pastas de topo (parentId === null), na ordem cadastrada.
export function getTopScopeGroups(): ScopeGroupNode[] {
  return _scopeGroups.filter(g => g.parentId === null)
}

// scopeIds cujo membership cai na subárvore de `groupId` (o próprio grupo ou descendentes).
export function getScopeIdsInGroup(groupId: string): Set<string> {
  const subtree = new Set<string>([groupId])
  for (let changed = true; changed;) {
    changed = false
    for (const g of _scopeGroups) {
      if (g.parentId && subtree.has(g.parentId) && !subtree.has(g.id)) { subtree.add(g.id); changed = true }
    }
  }
  return new Set(
    Object.entries(_scopeMemberships)
      .filter(([, gid]) => gid != null && subtree.has(gid))
      .map(([sid]) => sid),
  )
}

// scopeIds sem pasta (bucket "Outros" no wizard).
export function getUngroupedScopeIds(): Set<string> {
  const grouped = new Set(
    Object.entries(_scopeMemberships).filter(([, gid]) => gid != null).map(([sid]) => sid),
  )
  return new Set(_customScopes.map(s => s.scopeId).filter(sid => !grouped.has(sid)))
}

// ── Reuso vivo de fluxogramas (seções `ref`) ────────────────────────────────
// Seções de um escopo, sem expandir refs. Fonte única: o DB (via _overrides, populado
// no boot pelo App; bundle JSON como fallback offline). Sem árvore hardcoded no código.
export function resolveScopeSections(scopeId: string): LSec[] {
  return _overrides[scopeId] ?? []
}

// Expande recursivamente as seções `ref` (placeholders que incluem outro escopo) pelas
// seções atuais do escopo referenciado. Guarda de ciclo via `seen` (um escopo não se
// inclui direta/indiretamente mais de uma vez). Use ao CONSUMIR (geração/perguntas),
// nunca ao editar (o editor mantém o placeholder para preservar o vínculo vivo).
export function expandScopeRefs(sections: LSec[], seen: Set<string> = new Set()): LSec[] {
  const out: LSec[] = []
  for (const sec of sections) {
    const refId = sec.ref?.scopeId
    if (refId) {
      if (seen.has(refId)) continue   // ciclo: ignora a re-inclusão
      out.push(...expandScopeRefs(resolveScopeSections(refId), new Set(seen).add(refId)))
    } else {
      out.push(sec)
    }
  }
  return out
}
