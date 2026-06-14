// Store mutável dos detalhes por linha (Recomendações → rec, Padrões → pad).
//
// Por padrão usa o packageLineDetails.json empacotado (funciona offline). No boot,
// o app pode sobrepor os overrides do servidor (rec/pad editados no Admin) sobre o
// bundle, via setLineDetails — assim as edições refletem nos cronogramas NOVOS.
// Leitura síncrona (getLineDetails) preserva o uso atual no AppContext.
//
// IMPORTANTE: como o packageLinesStore, este store só é consumido ao CONSTRUIR
// itens novos; projetos salvos carregam seu próprio snapshot e não são afetados.
import BUNDLED from './packageLineDetails.json'

export type LineDetail = { rec: string; pad: string } | null

let active: unknown = BUNDLED

/** Detalhes ativos (mesclados do servidor se carregados; senão o bundle). */
export function getLineDetails<T = LineDetail>(): Record<string, T[]> {
  return active as Record<string, T[]>
}

/** Substitui os detalhes ativos (chamado no boot com o bundle + overrides). */
export function setLineDetails(details: unknown): void {
  if (details && typeof details === 'object') active = details
}

/** Override de rec/pad de uma linha (subconjunto de api.LineOverride). */
type DetailOverride = { pkgId: string; lineIndex: number; rec: string | null; pad: string | null }

/** Mescla os overrides rec/pad sobre o BUNDLE e ativa o resultado.
 *  Só os pacotes/linhas com rec ou pad no override são copiados (cópia rasa);
 *  o restante referencia o bundle. Chamado no boot. */
export function applyDetailOverrides(overrides: DetailOverride[]): void {
  const relevant = overrides.filter(o => o.rec != null || o.pad != null)
  if (relevant.length === 0) { active = BUNDLED; return }
  const bundle = BUNDLED as unknown as Record<string, LineDetail[]>
  const merged: Record<string, LineDetail[]> = { ...bundle }
  for (const o of relevant) {
    const lines = (merged[o.pkgId] ?? []).slice()
    const base = lines[o.lineIndex] ?? { rec: '', pad: '' }
    lines[o.lineIndex] = {
      rec: o.rec != null ? o.rec : base.rec,
      pad: o.pad != null ? o.pad : base.pad,
    }
    merged[o.pkgId] = lines
  }
  active = merged
}

/** Override por PACOTE: substitui inteiro o array de detalhes (rec/pad) dos
 *  pacotes editados, compondo sobre os detalhes ativos (bundle + legados). Cada
 *  pacote vem com a lista completa de linhas (alinhada às linhas do pacote). */
export function applyPackageOverrides(
  overrides: { pkgId: string; lines: { rec: string | null; pad: string | null }[] }[],
): void {
  if (!overrides || overrides.length === 0) return
  const cur = active as Record<string, LineDetail[]>
  const merged: Record<string, LineDetail[]> = { ...cur }
  for (const o of overrides) {
    merged[o.pkgId] = o.lines.map(l => ({ rec: l.rec ?? '', pad: l.pad ?? '' }))
  }
  active = merged
}
