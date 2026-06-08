// Store mutável da base de linhas dos pacotes.
//
// Por padrão usa o packageLines.json empacotado (funciona offline). No boot, o
// app pode substituí-lo pela base MESCLADA do servidor (bundled + overrides de
// editores), via setPackageLines — assim as edições da Fase 3c refletem nos
// cronogramas. Leitura síncrona (getPackageLines) preserva o uso atual nos engines.
import BUNDLED from './packageLines.json'

let active: unknown = BUNDLED

/** Base ativa (mesclada do servidor se carregada; senão o bundle). */
export function getPackageLines<T = unknown>(): Record<string, T[]> {
  return active as Record<string, T[]>
}

/** Substitui a base ativa (chamado no boot com a versão mesclada do servidor). */
export function setPackageLines(lines: unknown): void {
  if (lines && typeof lines === 'object') active = lines
}
