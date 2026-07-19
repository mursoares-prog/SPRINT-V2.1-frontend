import { createContext, useContext, type ReactNode } from 'react'
import { useProjectAutosave, type AutosaveStatus } from '../hooks/useProjectAutosave'

interface AutosaveValue {
  status: AutosaveStatus
  lastSavedAt: number | null
  retry: () => void
}

const Ctx = createContext<AutosaveValue | null>(null)

/** Roda o autosave (dentro do AppProvider) e expõe o status para a UI. */
export function AutosaveProvider({ children }: { children: ReactNode }) {
  const value = useProjectAutosave()
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Status do autosave. Fora do provider retorna um valor neutro (sem quebrar). */
export function useAutosaveStatus(): AutosaveValue {
  return useContext(Ctx) ?? { status: 'idle', lastSavedAt: null, retry: () => {} }
}
