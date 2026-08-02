// Auto-preenchimento de aplicador (instalação) / pescador (retirada) de plugs/tampões
// de arame, a partir da tabela Ferramentas de arame (WirelineTool). Dado o pacote
// (nome traz o nipple, ex.: "...nipple R 2,75\""), lista os modelos de plug/tampão
// compatíveis (mesmo tipo+diâmetro de nipple) e, escolhido um, deriva o aplicador ou
// pescador correspondente. Ver uso em ProjectDataPanel (subseções de plug de arame).
import type { WirelineTool } from '../utils/api'

// Tipo de equipamento tratado e as categorias correspondentes na tabela.
export type ToolKind = 'plug' | 'stv'
const CATEGORIES: Record<ToolKind, Set<string>> = {
  // Plug = tampão: a categoria "Plug" foi unificada em "Tampão" na tabela; 'Plug'
  // segue aceito só para bases que ainda não passaram pela migração.
  plug: new Set(['Tampão', 'Plug']),
  stv: new Set(['Válvula de Retenção']),    // STV = standing valve
}

export interface NippleSpec { type: string; diam: string }

/** Tipo+diâmetro do nipple a partir de um texto (nome do pacote ou coluna `nipples`).
 *  Ex.: "…nipple R 2,75\"" → { type: 'R', diam: '2.75' }. */
export function nippleSpec(text: string | null | undefined): NippleSpec | null {
  const s = String(text ?? '')
  const m = s.match(/nipples?\s+([A-Za-z/]+)\s*[-\s]?\s*(\d+[.,]\d+)/i)
          ?? s.match(/\b(XN|QN|DB|R|F|X)\b[^\d]{0,8}(\d+[.,]\d+)/i)
  if (!m) return null
  return { type: m[1].toUpperCase().trim(), diam: m[2].replace(',', '.') }
}

// Compara diâmetros truncando na 2ª casa decimal (ignora milésimos) — a tabela é a
// referência; o nome do pacote às vezes traz casas a mais (ex.: 1,875 ↔ 1,87).
const diam2 = (s: string): string => {
  const n = parseFloat(s)
  return isNaN(n) ? s : (Math.trunc(n * 100) / 100).toFixed(2)
}
const sameSpec = (a: NippleSpec, b: NippleSpec) =>
  diam2(a.diam) === diam2(b.diam) && (a.type === b.type || a.type.includes(b.type) || b.type.includes(a.type))

/** Modelos (WirelineTool) do tipo `kind` compatíveis com o nipple do pacote. `override`
 *  fixa o nipple quando o nome do pacote não o traz (ex.: TH). */
export function toolsForPackage(tools: WirelineTool[], packageName: string, kind: ToolKind,
                               override?: NippleSpec): WirelineTool[] {
  const want = override ?? nippleSpec(packageName)
  if (!want) return []
  const cats = CATEGORIES[kind]
  return tools.filter(t => {
    if (!cats.has((t.categoria ?? '').trim())) return false
    const got = nippleSpec(t.nipples)
    return got != null && sameSpec(got, want)
  })
}

/** Nome curto do modelo p/ inserir na linha (remove o prefixo de categoria:
 *  "Tampão "/"Plug "/"Válvula de Retenção "/"STV ", e o "de " que às vezes o segue —
 *  "Tampão de Teste FMC 4,995"" → "Teste FMC 4,995""). */
export function plugShortName(equipamento: string): string {
  return equipamento.replace(/^\s*(Tampão|Plug|Válvula de Retenção|STV)\s+(?:de\s+)?/i, '').trim()
}

const norm = (s: string | null | undefined) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Haste de equalização correspondente a um plug. Na tabela, a haste NÃO tem nipple —
 *  o `equipamento` referencia o modelo do plug (ex.: "Haste de equalização p/ RKH 2.75\"").
 *  Casa pelo modelo curto do plug (normalizado, ignorando pontuação/aspas). */
export function hasteToolForPlug(tools: WirelineTool[], plugEquipamento: string): WirelineTool | null {
  const key = norm(plugShortName(plugEquipamento))
  if (!key) return null
  return tools.find(t => (t.categoria ?? '').trim() === 'Haste de equalização'
    && norm(t.equipamento).includes(key)) ?? null
}

/** Valores derivados de um modelo escolhido: modelo curto (p/ o texto), o aplicador
 *  (instalação) ou pescador (retirada) do plug, e idem da sua haste de equalização. */
export function plugDerived(tools: WirelineTool[], tool: WirelineTool, isInstall: boolean):
    { plugModelo: string; modelo: string; hasteModelo: string } {
  const haste = hasteToolForPlug(tools, tool.equipamento)
  return {
    plugModelo: plugShortName(tool.equipamento),
    modelo: ((isInstall ? tool.aplicacao : tool.pescaria) ?? '').trim(),
    hasteModelo: haste ? ((isInstall ? haste.aplicacao : haste.pescaria) ?? '').trim() : '',
  }
}
