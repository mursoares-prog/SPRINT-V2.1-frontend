import { useState } from 'react'
import { CloudUpload, Check, Loader2, AlertTriangle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { buildProjectFile } from '../utils/projectFile'
import { saveServerProject, isApiConfigured } from '../utils/api'
import type { WizardInputs } from '../types'

type Status = 'idle' | 'saving' | 'ok' | 'error'

/** Salva o projeto atual no servidor (cria na 1ª vez, atualiza nas seguintes).
 *  Some quando não há backend configurado (VITE_API_URL vazio). */
export function CloudSaveButton({ compact = false }: { compact?: boolean }) {
  const { state, dispatch } = useApp()
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  if (!isApiConfigured()) return null

  const handleSave = async () => {
    setStatus('saving')
    setError('')
    try {
      const wn = state.wellName || 'projeto'
      const file = buildProjectFile(
        wn,
        state.inputs as WizardInputs,
        state.schedule,
        state.projectData,
        state.fineTuningItems,
      )
      const saved = await saveServerProject(file, state.projectId)
      dispatch({ type: 'SET_PROJECT_ID', projectId: saved.id })
      setStatus('ok')
      setTimeout(() => setStatus('idle'), 2000)
    } catch (e) {
      setError((e as Error).message)
      setStatus('error')
      setTimeout(() => setStatus('idle'), 4000)
    }
  }

  const label = state.projectId ? 'Atualizar na nuvem' : 'Salvar na nuvem'
  const sizeCls = compact ? 'px-3 py-1' : 'h-8 px-3'

  return (
    <div className="relative">
      <button
        onClick={handleSave}
        disabled={status === 'saving'}
        title={state.projectId ? 'Atualizar o projeto salvo no servidor' : 'Salvar o projeto no servidor'}
        className={`flex items-center gap-1.5 ${sizeCls} rounded-lg text-xs font-semibold transition-colors border
          ${status === 'error'
            ? 'border-red-300 text-red-600 bg-red-50 dark:bg-red-950/40'
            : status === 'ok'
              ? 'border-emerald-300 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40'
              : 'border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:border-sky-400 dark:hover:border-sky-500 bg-sky-50 dark:bg-sky-950/40'}
          disabled:opacity-60`}>
        {status === 'saving' && <Loader2 size={14} className="animate-spin" />}
        {status === 'ok' && <Check size={14} />}
        {status === 'error' && <AlertTriangle size={14} />}
        {status === 'idle' && <CloudUpload size={14} />}
        {status === 'ok' ? 'Salvo' : status === 'error' ? 'Falhou' : label}
      </button>
      {status === 'error' && error && (
        <span className="absolute right-0 top-full mt-1 z-10 whitespace-nowrap text-[10px] text-red-500 bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 rounded px-2 py-0.5 shadow">
          {error}
        </span>
      )}
    </div>
  )
}
