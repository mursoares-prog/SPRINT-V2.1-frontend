import type { LSec } from './logicSecs'
import { LOGIC_BY_SCOPE } from './logicSecs'
import LOGIC_BUNDLE from './logicScopesBundle.json'

// ── Blocos de lógica reutilizáveis ──────────────────────────────────────────
// Um "bloco" é uma unidade de lógica definida UMA vez e incluída (via ref vivo) em
// vários escopos: editar o bloco propaga para todos que o usam. É armazenado como um
// escopo custom (mesma tabela/ferramenta), mas distinguido pelo prefixo do scopeId —
// assim NÃO aparece como escopo selecionável no gerador e ganha categoria própria na UI.
export const BLOCK_PREFIX = 'BLK_'
export function isBlockScope(scopeId: string): boolean {
  return scopeId.startsWith(BLOCK_PREFIX)
}

type CustomScopeMeta = { scopeId: string; label: string; fase: string | null; opTypes: string[] | null }

// Estado inicial vem do bundle gerado pelo admin (dump do backend).
// O backend, quando disponível, sobrepõe esses valores via setLogicOverrides/setCustomScopesMeta.
let _overrides: Record<string, LSec[]> = LOGIC_BUNDLE.overrides as Record<string, LSec[]>
let _customScopes: CustomScopeMeta[] =
  (LOGIC_BUNDLE.scopes as Array<{ scopeId: string; isCustom: boolean; label: string | null; fase: string | null; opTypes: string[] | null }>)
    .filter(s => s.isCustom && !s.scopeId.startsWith(BLOCK_PREFIX) && s.label !== null)
    .map(s => ({ scopeId: s.scopeId, label: s.label!, fase: s.fase, opTypes: s.opTypes }))

export function setLogicOverrides(o: Record<string, LSec[]>): void {
  _overrides = o
}

export function getLogicOverride(scopeId: string): LSec[] | null {
  const ov = _overrides[scopeId]
  // Um override VAZIO não é uma edição válida: ele costuma ser criado como efeito colateral
  // (ex.: PATCH de metadados cria a linha com sections=[]) e NÃO deve mascarar o bundle do
  // código. Tratamos [] como "sem override" quando existe um bundle para o escopo.
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
// Um override VAZIO não mascara o bundle: só usamos o override quando ele tem conteúdo
// (evita que um override acidental com sections=[] apague o bloco definido no código).
// Blocos custom (sem bundle) permanecem podendo ficar vazios — caem no `ov ?? []` final.
export function resolveScopeSections(scopeId: string): LSec[] {
  const ov = _overrides[scopeId]
  if (ov && ov.length > 0) return ov
  return LOGIC_BY_SCOPE[scopeId] ?? ov ?? []
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
