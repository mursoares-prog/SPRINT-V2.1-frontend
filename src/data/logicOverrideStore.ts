import type { LSec } from './logicSecs'
import { LOGIC_BY_SCOPE } from './logicSecs'

// ── Blocos de lógica reutilizáveis ──────────────────────────────────────────
// Um "bloco" é uma unidade de lógica definida UMA vez e incluída (via ref vivo) em
// vários escopos: editar o bloco propaga para todos que o usam. É armazenado como um
// escopo custom (mesma tabela/ferramenta), mas distinguido pelo prefixo do scopeId —
// assim NÃO aparece como escopo selecionável no gerador e ganha categoria própria na UI.
export const BLOCK_PREFIX = 'BLK_'
export function isBlockScope(scopeId: string): boolean {
  return scopeId.startsWith(BLOCK_PREFIX)
}

let _overrides: Record<string, LSec[]> = {}
let _customScopes: { scopeId: string; label: string; fase: string | null; opTypes: string[] | null }[] = []

export function setLogicOverrides(o: Record<string, LSec[]>): void {
  _overrides = o
}

export function getLogicOverride(scopeId: string): LSec[] | null {
  return _overrides[scopeId] ?? null
}

export function setCustomScopesMeta(scopes: { scopeId: string; label: string; fase?: string | null; opTypes?: string[] | null }[]): void {
  _customScopes = scopes.map(s => ({ ...s, fase: s.fase ?? null, opTypes: s.opTypes ?? null }))
}

export function getCustomScopesMeta(): { scopeId: string; label: string; fase: string | null; opTypes: string[] | null }[] {
  return _customScopes
}

export function updateCustomScopeMeta(scopeId: string, patch: { fase?: string | null; opTypes?: string[] | null }): void {
  _customScopes = _customScopes.map(s => s.scopeId === scopeId ? { ...s, ...patch } : s)
}

// ── Reuso vivo de fluxogramas (seções `ref`) ────────────────────────────────
// Seções de um escopo, sem expandir refs: override salvo (memória/backend) ou bundle.
export function resolveScopeSections(scopeId: string): LSec[] {
  return _overrides[scopeId] ?? LOGIC_BY_SCOPE[scopeId] ?? []
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
