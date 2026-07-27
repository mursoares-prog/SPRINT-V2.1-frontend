// ⚠️ ─────────────────────────────────────────────────────────────────────────────
// TEMPORÁRIO — MODO DEMONSTRAÇÃO. REMOVER quando o backend for conectado em produção.
// ──────────────────────────────────────────────────────────────────────────────
// Permite rodar o programa como se estivesse conectado ao servidor, MESMO com o
// backend desativado (sem VITE_API_URL / servidor fora do ar) — para demonstrações.
//
// Os stores de linhas, escopos e árvores de decisão já caem nos JSONs EMPACOTADOS
// (bundle) por padrão, então a Etapa 1 e os fluxogramas já têm dados offline. O único
// que o boot pula sem servidor é a organização de PASTAS de escopos (grupos), que no
// fluxo online vem de getLogicScopeGroups(). Aqui aplicamos a config que o editor de
// Árvores de Decisão persiste localmente (localStorage); sem ela, o SEED do store assume.
//
// AO CONECTAR O BACKEND: remover este módulo, o toggle no TestIdentityModal e o ramo
// `isDemoMode()` do boot em [src/App.tsx].
import { setScopeGroupsData } from '../data/logicOverrideStore'
import type { ScopeGroupNode } from '../data/logicOverrideStore'

const DEMO_KEY = 'sprint_demo_mode'

/** Modo demonstração ligado? Persistido em localStorage (sobrevive a reloads). */
export function isDemoMode(): boolean {
  try { return localStorage.getItem(DEMO_KEY) === '1' } catch { return false }
}

export function setDemoMode(on: boolean): void {
  try { on ? localStorage.setItem(DEMO_KEY, '1') : localStorage.removeItem(DEMO_KEY) } catch { /* storage indisponível */ }
}

// Organização de pastas que o editor de Árvores de Decisão persiste localmente
// (mesma chave lida pelo fallback offline do App).
function readLocalScopeGroups(): { groups?: ScopeGroupNode[]; memberships?: Record<string, string | null> } {
  try { const raw = localStorage.getItem('lep-scope-groups'); return raw ? JSON.parse(raw) : {} }
  catch { return {} }
}

/** Semeia os stores para a demonstração. Linhas/escopos/árvores já usam o bundle por
 *  padrão; aqui só falta aplicar as pastas de escopos (grupos) da Etapa 1. */
export function seedDemoData(): void {
  const gs = readLocalScopeGroups()
  const groups = Array.isArray(gs.groups) ? gs.groups : []
  setScopeGroupsData(groups, gs.memberships ?? {})
}
