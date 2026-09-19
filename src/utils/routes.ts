// Navegação por URL entre projetos: cada projeto salvo tem uma única URL —
// /projects/:id — onde :id é o identificador único gerado pelo servidor (UUID),
// independente do nome do projeto ou do poço. Isso importa porque poços diferentes
// podem ter projetos com o mesmo nome (dados vêm da entrada simulada/externa) — só
// o id garante uma URL única por projeto.
export const ROUTE_HOME = '/'
export const PROJECT_ROUTE_PREFIX = '/projects/'

export function projectPath(id: string): string {
  return `${PROJECT_ROUTE_PREFIX}${id}`
}

// Rota → id do projeto (ou null se a rota não for de projeto).
export function projectIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(PROJECT_ROUTE_PREFIX)) return null
  const id = pathname.slice(PROJECT_ROUTE_PREFIX.length)
  return id || null
}
