import type { ProjectData } from '../types'

// ── Auto-preenchimento de profundidade dos BHAs a partir dos nipples ──────────
// O nome do pacote referencia o nipple-alvo, por tamanho ("...em nipple R 2,75\"",
// "...plug 3,75\" no TH") ou por local (TMF/TH + bore). Casamos pelo tamanho contido
// no TEXTO DO TIPO do nipple (não pelo nome do campo) e devolvemos sua profundidade,
// desde que o nipple esteja preenchido e não seja "Não Aplicável".
//
// Compartilhado entre ProjectDataPanel (preenche o campo Profundidade do BHA) e
// AppContext.lineIdsForLocate (localizador da seção Nipples: realça as linhas cujo
// {{prof}} deriva do nipple).
export function nippleDepthForBha(name: string, d: ProjectData): string | null {
  const n = name.toLowerCase()
  const usable = (type: string, depth: string): string | null =>
    type && type.trim().toLowerCase() !== 'não aplicável' && depth.trim() ? depth.trim() : null
  // Para casamento por LOCAL (TMF/TH): o nome do pacote já identifica a linha do nipple,
  // então basta a profundidade preenchida — o tipo do nipple do TMF/bore costuma ficar vazio
  // (não há diâmetro a digitar). Só exige que a linha não esteja marcada "Não Aplicável".
  const usableLoc = (type: string, depth: string): string | null =>
    type.trim().toLowerCase() !== 'não aplicável' && depth.trim() ? depth.trim() : null
  // Compara o tamanho normalizando o separador decimal (aceita "2.75" e "2,75").
  const sizeInType = (type: string, size: string): boolean => type.replace(/\./g, ',').includes(size)
  // Ordem de prioridade de busca por tamanho.
  const all: Array<[string, string]> = [
    [d.nipple381, d.nipple381Depth],            // TMF prod.
    [d.nipple375, d.nipple375Depth],            // TMF anular
    [d.nipple281, d.nipple281Depth],            // TH prod.
    [d.nippleTHanular, d.nippleTHanularDepth],  // TH anular
    [d.nippleDhsv, d.nippleDhsvDepth],          // DHSV
    [d.nipple275, d.nipple275Depth],            // TSR
    [d.nipplesOutros, d.nipplesOutrosDepth],    // cauda prod.
  ]
  // 1) Tamanho explícito no nome do pacote.
  const sizeMatch = n.match(/nipple\s+\S+\s+(\d+,\d+)\s*"/) ?? n.match(/\b(?:plug|stv|brv)\s+(\d+,\d+)\s*"/)
  if (sizeMatch) {
    const size = sizeMatch[1]
    // Pode haver mais de um nipple do mesmo tamanho (ex.: TSR e Cauda prod., ambos 2,75").
    // Usa o primeiro do tamanho casado que tenha profundidade preenchida — não para no
    // primeiro do tamanho se ele estiver sem prof. (senão derivaria null e travaria vazio).
    for (const [type, depth] of all) {
      if (type && sizeInType(type, size)) {
        const u = usable(type, depth)
        if (u) return u
      }
    }
    return null
  }
  // 2) Local: TMF/TH + bore. A linha vem do nome do pacote ⇒ usa só a profundidade (usableLoc).
  if (/\btmf\b/.test(n)) {
    if (/anular/.test(n)) return usableLoc(d.nipple375, d.nipple375Depth)
    if (/produ/.test(n))  return usableLoc(d.nipple381, d.nipple381Depth)
  }
  if (/\bth\b/.test(n)) {
    if (/anular/.test(n)) return usableLoc(d.nippleTHanular, d.nippleTHanularDepth)
    return usableLoc(d.nipple281, d.nipple281Depth)  // TH = bore de produção
  }
  // 3) Camisão: instalado/retirado no perfil da DHSV → profundidade do nipple da DHSV.
  if (/camis/.test(n)) return usableLoc(d.nippleDhsv ?? '', d.nippleDhsvDepth ?? '')
  return null
}

// Campos do camisão derivados do TIPO do nipple da DHSV (seção Nipples):
//   • Ø nominal do camisão = Ø do nipple da DHSV (ex.: "Perfil DB 3,68\"" → "3,68").
//   • Aplicador (instalação) / pescador (retirada) = GS 4" (DHSV 3,68") ou GS 5" (maiores).
// null ⇒ não é camisão, ou DHSV vazio/Não Aplicável (campos manuais).
export function camisaoDhsvFields(
  item: { packageName: string },
  d: ProjectData,
): { camDiamNom: string; aplicadorCamisao: string } | null {
  if (!/camis/i.test(item.packageName)) return null
  const t = (d.nippleDhsv ?? '').trim()
  if (!t || t.toLowerCase() === 'não aplicável') return null
  const m = t.match(/(\d+,\d+)/)
  if (!m) return null
  const size = m[1]
  const gs = parseFloat(size.replace(',', '.')) < 4 ? 'GS 4"' : 'GS 5"'
  return { camDiamNom: size, aplicadorCamisao: gs }
}

// Gabaritagem (ABAN 036): localizador + estampador derivam da COMBINAÇÃO dos nipples da
// cauda de produção (TSR = nipple275 + Cauda prod. = nipplesOutros) — tabela de combos
// conhecidos; combos fora da tabela ⇒ campos manuais. profFinal = profundidade do nipple
// de MENOR diâmetro entre os dois. null ⇒ não é gabaritagem / nada a derivar.
export function gabaritoFields(
  item: { packageName: string },
  d: ProjectData,
): { diamLocalizador?: string; diamEstampador?: string; profFinal?: string } | null {
  if (!/gabarit/i.test(item.packageName)) return null
  const sizeOf = (t?: string) => { const m = (t ?? '').match(/(\d+,\d+)/); return m ? m[1] : null }
  const out: { diamLocalizador?: string; diamEstampador?: string; profFinal?: string } = {}
  // Localizador + estampador: lookup pela combinação {TSR, Cauda prod.}.
  const s1 = sizeOf(d.nipple275), s2 = sizeOf(d.nipplesOutros)
  if (s1 && s2) {
    const set = new Set([s1, s2])
    const COMBOS: Array<{ nips: [string, string]; loc: string; est: string }> = [
      { nips: ['2,75', '2,81'], loc: '2,81', est: '2,50' },
      { nips: ['3,50', '3,56'], loc: '3,56', est: '3,00' },
    ]
    const hit = COMBOS.find(c => c.nips.every(n => set.has(n)))
    if (hit) { out.diamLocalizador = hit.loc; out.diamEstampador = hit.est }
  }
  // Profundidade final: nipple de menor diâmetro (entre TSR e Cauda prod.) com prof preenchida.
  const cands = ([[d.nipple275, d.nipple275Depth], [d.nipplesOutros, d.nipplesOutrosDepth]] as Array<[string, string]>)
    .map(([t, dep]) => { const s = sizeOf(t); return s && (dep ?? '').trim() ? { size: parseFloat(s.replace(',', '.')), depth: dep.trim() } : null })
    .filter((x): x is { size: number; depth: string } => x != null)
  if (cands.length) { cands.sort((a, b) => a.size - b.size); out.profFinal = cands[0].depth }
  return Object.keys(out).length ? out : null
}

// Profundidade derivada do nipple para um BHA, apenas nas operações de arame/elétrico/
// flexitubo que têm campo "Profundidade" relacionado a nipple. null ⇒ campo manual.
export function bhaDerivedDepth(item: { packageName: string; technology: string }, d: ProjectData): string | null {
  const name = item.packageName
  const hasNippleProf =
    // arame: instala/retirada de plug/STV/BRV/camisão (camisão → nipple da DHSV)
    (item.technology === 'wireline' && /instala|retirada/i.test(name)) ||
    (item.technology === 'electric' && /stroker/i.test(name)) ||
    (item.technology === 'ct' && /(plug|stv|brv|camis)/i.test(name) && /(instala|retirada)/i.test(name))
  return hasNippleProf ? nippleDepthForBha(name, d) : null
}
