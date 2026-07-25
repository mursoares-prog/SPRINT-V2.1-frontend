// Engine do assistente de preenchimento (Etapa 3) orientado a dados.
//
// A estrutura do assistente vem dos PlaceholderFieldDef do servidor (aba Place Holders);
// este módulo deriva, a partir dos templates dos pacotes, QUAIS campos se aplicam a um
// projeto (visibilidade) e COMO o valor de cada token faz binding (global em ProjectData
// vs por-item em bhaPlans[uid]). Reaproveitado tanto pelo assistente quanto pelo editor
// admin (contagem de uso), evitando lógica duplicada.
import { getPackageLines } from '../data/packageLinesStore'
import { PLAN_KEY_ALIASES, isPlanKey } from './placeholders'
import type { PlaceholderFieldDef } from '../utils/api'

// token-base → apelidos por-pacote que resolvem para ele (inverso de PLAN_KEY_ALIASES).
// Ex.: 'prof' → ['prof037','prof045',...]. Usado para casar o uso de um token-base nos
// templates que na verdade referenciam um apelido por-pacote.
const ALIASES_BY_BASE: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {}
  for (const [alias, base] of Object.entries(PLAN_KEY_ALIASES)) {
    ;(map[base] ??= []).push(alias)
  }
  return map
})()

const reCache = new Map<string, RegExp>()

/** Regex que casa {{token=...}} OU qualquer apelido por-pacote que resolva para o token. */
export function tokenOrAliasRe(token: string): RegExp {
  let re = reCache.get(token)
  if (!re) {
    const names = [token, ...(ALIASES_BY_BASE[token] ?? [])]
    re = new RegExp(`\\{\\{(?:${names.map(escapeRe).join('|')})=`)
    reCache.set(token, re)
  }
  return re
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Pacotes (base ativa, mesclada do servidor) cujo texto de alguma linha referencia o
 *  token (ou um apelido por-pacote dele). */
export function packagesUsingToken(token: string): string[] {
  if (!token) return []
  const re = tokenOrAliasRe(token)
  const lines = getPackageLines<{ text?: string }>()
  return Object.keys(lines)
    .filter(pkgId => lines[pkgId].some(l => typeof l?.text === 'string' && re.test(l.text!)))
    .sort()
}

/** Texto das linhas de `pkgId` que referenciam o token (ou apelido) — para exibir sob o
 *  nome do pacote no editor admin. */
export function linesUsingToken(pkgId: string, token: string): string[] {
  if (!token) return []
  const re = tokenOrAliasRe(token)
  const lines = getPackageLines<{ text?: string }>()
  return (lines[pkgId] ?? [])
    .filter(l => typeof l?.text === 'string' && re.test(l.text!))
    .map(l => l.text as string)
}

/** True se o token aparece em algum template de algum dos pacotes do projeto — critério
 *  de visibilidade do campo no assistente (associação derivada dos templates). */
export function tokenUsedByPackages(token: string, projectPackageIds: Set<string>): boolean {
  const re = tokenOrAliasRe(token)
  const lines = getPackageLines<{ text?: string }>()
  for (const pkgId of projectPackageIds) {
    const pkgLines = lines[pkgId]
    if (pkgLines && pkgLines.some(l => typeof l?.text === 'string' && re.test(l.text!))) return true
  }
  return false
}

/** Onde o valor de um token vive: 'perItem' (bhaPlans[uid][token]) ou 'global' (ProjectData[token]). */
export function tokenBinding(token: string): 'perItem' | 'global' {
  return isPlanKey(token) ? 'perItem' : 'global'
}

/** Def agrupado para render: seção (group) → subgrupos → campos, na ordem de orderIndex. */
export interface AssistantSection {
  group: string | null
  subgroups: { subgroup: string | null; fields: PlaceholderFieldDef[] }[]
}

/** Organiza os defs (já filtrados por visibilidade) em seções/subgrupos ordenados,
 *  preservando a ordem de primeira aparição de cada grupo/subgrupo por orderIndex. */
export function groupAssistantDefs(defs: PlaceholderFieldDef[]): AssistantSection[] {
  const sorted = [...defs].sort((a, b) => a.orderIndex - b.orderIndex)
  const groupOrder: (string | null)[] = []
  const byGroup = new Map<string | null, PlaceholderFieldDef[]>()
  for (const d of sorted) {
    const g = d.group?.trim() || null
    if (!byGroup.has(g)) { byGroup.set(g, []); groupOrder.push(g) }
    byGroup.get(g)!.push(d)
  }
  return groupOrder.map(group => {
    const items = byGroup.get(group)!
    const subOrder: (string | null)[] = []
    const bySub = new Map<string | null, PlaceholderFieldDef[]>()
    for (const d of items) {
      const s = d.subgroup?.trim() || null
      if (!bySub.has(s)) { bySub.set(s, []); subOrder.push(s) }
      bySub.get(s)!.push(d)
    }
    return { group, subgroups: subOrder.map(subgroup => ({ subgroup, fields: bySub.get(subgroup)! })) }
  })
}
