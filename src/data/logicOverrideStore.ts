import type { LSec, CanvasData } from './logicSecs'

let _overrides: Record<string, LSec[]> = {}
let _customScopes: { scopeId: string; label: string }[] = []
let _canvasData: Record<string, CanvasData> = {}

export function setLogicOverrides(o: Record<string, LSec[]>): void {
  _overrides = o
}

export function getLogicOverride(scopeId: string): LSec[] | null {
  return _overrides[scopeId] ?? null
}

export function setCustomScopesMeta(scopes: { scopeId: string; label: string }[]): void {
  _customScopes = scopes
}

export function getCustomScopesMeta(): { scopeId: string; label: string }[] {
  return _customScopes
}

export function setCanvasData(scopeId: string, data: CanvasData): void {
  _canvasData[scopeId] = data
}

export function getCanvasData(scopeId: string): CanvasData | null {
  return _canvasData[scopeId] ?? null
}
