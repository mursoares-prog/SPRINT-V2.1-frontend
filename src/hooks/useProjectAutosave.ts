import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { buildProjectFile, type ProjectFile } from '../utils/projectFile'
import { saveServerProject, isApiConfigured } from '../utils/api'
import { authHeader } from '../utils/auth'
import type { WizardInputs } from '../types'

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Tempo de espera após a última edição antes de disparar o save (ms). */
const DEBOUNCE_MS = 1000

/** scopeId usado no payload quando o projeto não tem escopo (caminho "em branco"). */
const BLANK_SCOPE_ID = 'em_branco'

/** Chave de comparação estável: o ProjectFile com `savedAt` neutralizado (muda a cada build). */
function payloadKey(file: ProjectFile): string {
  return JSON.stringify({ ...file, savedAt: '' })
}

/**
 * Autosave do projeto inteiro no servidor. Debounce + coalescência de saves em voo +
 * pulo de payloads idênticos, para não gerar uma requisição por edição.
 * Deve ser usado dentro do AppProvider.
 */
export function useProjectAutosave() {
  const { state, dispatch } = useApp()
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef<{ file: ProjectFile; key: string } | null>(null)
  const baselineRef = useRef<string | null>(null) // key do último payload salvo/carregado
  const inFlightRef = useRef(false)
  const pendingRef = useRef(false)
  const seededRef = useRef(false)
  const idRef = useRef<string | undefined>(state.projectId)

  // Refs estáveis (o autosave lê tudo de refs → o callback não precisa de deps).
  const dispatchRef = useRef(dispatch)
  const flushRef = useRef<() => void>(() => {})
  useEffect(() => { dispatchRef.current = dispatch }, [dispatch])

  // Mantém o id do servidor sincronizado (ex.: após LOAD_PROJECT).
  useEffect(() => { idRef.current = state.projectId }, [state.projectId])

  const flush = useCallback(async () => {
    const latest = latestRef.current
    if (!latest) return
    if (inFlightRef.current) { pendingRef.current = true; return }
    inFlightRef.current = true
    setStatus('saving')
    try {
      const saved = await saveServerProject(latest.file, idRef.current, authHeader())
      if (!idRef.current && saved?.id) {
        idRef.current = saved.id
        dispatchRef.current({ type: 'SET_PROJECT_ID', projectId: saved.id })
      }
      baselineRef.current = latest.key
      setStatus('saved')
      setLastSavedAt(Date.now())
    } catch {
      setStatus('error') // mantém o payload pendente; reenvia na próxima edição/retry
    } finally {
      inFlightRef.current = false
      if (pendingRef.current) { pendingRef.current = false; void flushRef.current() }
    }
  }, [])
  useEffect(() => { flushRef.current = flush }, [flush])

  useEffect(() => {
    if (!isApiConfigured()) return

    const file = buildProjectFile(
      state.wellName,
      state.inputs as WizardInputs,
      state.schedule,
      state.projectData,
      state.fineTuningItems,
      state.projectName,
    )
    // Caminho "em branco" não escolhe escopo; o backend exige scopeId não-vazio.
    if (!file.scopeId) file.scopeId = BLANK_SCOPE_ID
    const key = payloadKey(file)

    // No 1º run, apenas registra o estado atual como baseline — o estado inicial
    // (pristine, ou o projeto recém-carregado do servidor) nunca é re-salvo.
    // A partir daí, qualquer mudança (auto = schedule; em branco = projectData/
    // fineTuningItems) dispara o autosave.
    if (!seededRef.current) {
      seededRef.current = true
      baselineRef.current = key
      return
    }

    if (key === baselineRef.current) return // nada mudou → no-op
    // O backend exige wellName; wellName é preenchido pela aplicação externa (e, até
    // ela existir, pelos placeholders dos dois caminhos de entrada).
    if (!state.wellName) return
    // Nada a persistir ainda em 'home'/'wizard' (poço/projeto sendo digitados, escopo
    // sendo escolhido — sem cronograma nem dados de projeto). Sem essa trava, digitar no
    // popup de identidade (SET_WELL_NAME/SET_PROJECT_NAME a cada tecla) já dispara o
    // autosave e cria um registro "fantasma" vazio no servidor, que passa a competir com
    // o projeto real na busca por poço+projeto mais recente (ver lookupServerProject).
    if (state.view === 'home' || state.view === 'wizard') return

    latestRef.current = { file, key }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { void flushRef.current() }, DEBOUNCE_MS)
  }, [
    state.wellName,
    state.projectName,
    state.inputs,
    state.schedule,
    state.projectData,
    state.fineTuningItems,
    state.view,
  ])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  /** Força um novo envio do último payload (usado pelo botão de retry no erro). */
  const retry = useCallback(() => { void flush() }, [flush])

  return { status, lastSavedAt, retry }
}
