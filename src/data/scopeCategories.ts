// Categorias de operação para agrupar os escopos (editor de lógica) e os pacotes
// (Admin → Variáveis dos pacotes). Hoje é apenas agrupamento VISUAL: todos os escopos
// bundle e todos os pacotes ABAN pertencem a 'aban_molhada'; as outras duas categorias
// começam vazias. Quando a atribuição por item for implementada, basta as funções
// `categoryOfScope`/`categoryOfPackage` passarem a ler a categoria persistida.

export type ScopeCategoryId = 'aban_molhada' | 'aban_seca' | 'workover'

export interface ScopeCategory {
  id: ScopeCategoryId
  label: string
}

export const SCOPE_CATEGORIES: ScopeCategory[] = [
  { id: 'aban_molhada', label: 'Abandono completação molhada' },
  { id: 'aban_seca',    label: 'Abandono completação seca' },
  { id: 'workover',     label: 'Workover' },
]

// Categoria default — recebe todos os itens existentes (escopos bundle e pacotes ABAN).
export const DEFAULT_SCOPE_CATEGORY: ScopeCategoryId = 'aban_molhada'

// Categoria de um escopo no editor de lógica. Por enquanto todos → molhada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function categoryOfScope(_scopeId: string): ScopeCategoryId {
  return DEFAULT_SCOPE_CATEGORY
}

// Categoria de um pacote na aba Variáveis. Por enquanto todos os ABAN → molhada.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function categoryOfPackage(_pkgId: string): ScopeCategoryId {
  return DEFAULT_SCOPE_CATEGORY
}
