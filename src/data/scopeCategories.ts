// Categorias de operação para agrupar os escopos (editor de lógica) e os pacotes
// (Admin → Variáveis dos pacotes). Hoje é apenas agrupamento VISUAL: os pacotes T-AB
// caem em 'aban_seca' (Abandono Completação Seca) e o restante (escopos bundle e
// pacotes ABAN) em 'aban_molhada'; 'workover' começa vazia. Quando a atribuição por
// item for implementada, basta as funções `categoryOfScope`/`categoryOfPackage`
// passarem a ler a categoria persistida.

export type ScopeCategoryId = 'aban_molhada' | 'aban_seca'

export interface ScopeCategory {
  id: ScopeCategoryId
  label: string
}

export const SCOPE_CATEGORIES: ScopeCategory[] = [
  { id: 'aban_molhada', label: 'Pacotes ABAN' },
  { id: 'aban_seca',    label: 'Pacotes T-AB' },
]

// Categoria default — recebe todos os itens existentes (escopos bundle e pacotes ABAN).
export const DEFAULT_SCOPE_CATEGORY: ScopeCategoryId = 'aban_molhada'

// Categoria de um escopo no editor de lógica. Por enquanto todos → molhada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function categoryOfScope(_scopeId: string): ScopeCategoryId {
  return DEFAULT_SCOPE_CATEGORY
}

// Categoria de um pacote na aba Variáveis. Os pacotes T-AB são de Abandono
// Completação Seca; os ABAN (e demais) caem no default (molhada).
export function categoryOfPackage(pkgId: string): ScopeCategoryId {
  if (pkgId.startsWith('T-AB')) return 'aban_seca'
  return DEFAULT_SCOPE_CATEGORY
}
