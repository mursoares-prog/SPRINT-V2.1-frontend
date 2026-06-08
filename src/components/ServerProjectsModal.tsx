import { useEffect, useState, useCallback } from 'react'
import { Server, Trash2, FolderOpen, Loader2, RefreshCw, X, AlertTriangle } from 'lucide-react'
import { useApp } from '../context/AppContext'
import {
  listServerProjects, getServerProject, deleteServerProject,
  type ProjectSummary,
} from '../utils/api'

/** Modal: lista os projetos salvos no servidor e permite abrir/excluir. */
export function ServerProjectsModal({ onClose }: { onClose: () => void }) {
  const { dispatch } = useApp()
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setProjects(await listServerProjects())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const handleOpen = async (id: string) => {
    setBusyId(id)
    setError('')
    try {
      const proj = await getServerProject(id)
      dispatch({
        type: 'LOAD_PROJECT',
        wellName: proj.wellName,
        inputs: proj.inputs,
        schedule: proj.schedule,
        projectData: proj.projectData,
        fineTuningItems: proj.fineTuningItems,
        projectId: proj.id,
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusyId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setBusyId(id)
    setError('')
    try {
      await deleteServerProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-8 h-8 rounded-lg bg-[#0c2340] flex items-center justify-center">
            <Server size={15} className="text-[#d97706]" />
          </div>
          <h2 className="text-base font-bold text-[#0c2340] dark:text-white flex-1">Projetos no servidor</h2>
          <button onClick={() => void refresh()} title="Atualizar lista"
            className="p-1.5 rounded-lg text-slate-500 hover:text-[#d97706] hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw size={15} />
          </button>
          <button onClick={onClose} title="Fechar"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 scrollbar-custom">
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2 mb-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-500 text-sm">
              <Loader2 size={16} className="animate-spin" /> Carregando…
            </div>
          ) : projects.length === 0 && !error ? (
            <p className="text-center text-sm text-slate-500 py-10">Nenhum projeto salvo no servidor ainda.</p>
          ) : (
            <ul className="space-y-2">
              {projects.map(p => (
                <li key={p.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{p.wellName}</p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {p.scopeId} · {fmtDate(p.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => void handleOpen(p.id)}
                    disabled={busyId === p.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0c2340] hover:bg-[#0e3a60] transition-colors disabled:opacity-50">
                    {busyId === p.id ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                    Abrir
                  </button>
                  <button
                    onClick={() => void handleDelete(p.id)}
                    disabled={busyId === p.id}
                    title="Excluir do servidor"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50">
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
