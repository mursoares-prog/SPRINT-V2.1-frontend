import { useEffect, useState, type ReactNode } from 'react'
import { Check, CloudUpload, RotateCw, TriangleAlert } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useAutosaveStatus } from '../context/AutosaveContext'

// Exibe a identidade do projeto (poço · projeto), preenchida por um SISTEMA EXTERNO
// em produção. Enquanto essa integração não existe, os valores vêm do pop-up de teste
// exibido ao abrir a página — ver [src/components/TestIdentityModal.tsx] (TEMPORÁRIO,
// remover junto com aquele componente quando a integração for conectada). Ao lado,
// mostra o status do autosave.
// `after`: slot opcional para controles extras (ex.: botão de minimizar do assistente
// na etapa 3) — renderizado na mesma linha, ao lado do indicador, em vez de sobreposto.
export function ProjectNameField({ after }: { after?: ReactNode } = {}) {
  const { state } = useApp()
  const { status, lastSavedAt, retry } = useAutosaveStatus()

  const identityLabel = [state.wellName, state.projectName].filter(Boolean).join(' · ') || '—'

  return (
    <div className="shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center gap-1.5 px-3" style={{ height: '38px' }}>
      <span
        className="flex-1 min-w-0 text-xs text-left text-slate-700 dark:text-slate-200 truncate"
        title={`${identityLabel} — recebido do sistema integrado, usado para salvar o cronograma no servidor do Sprint`}
      >
        {identityLabel}
      </span>
      <AutosaveIndicator status={status} lastSavedAt={lastSavedAt} onRetry={retry} />
      {after}
    </div>
  )
}

function AutosaveIndicator({
  status,
  lastSavedAt,
  onRetry,
}: {
  status: ReturnType<typeof useAutosaveStatus>['status']
  lastSavedAt: number | null
  onRetry: () => void
}) {
  // Re-renderiza a cada 15s para atualizar o "há Xs" quando ocioso.
  const [, force] = useState(0)
  useEffect(() => {
    if (status !== 'saved') return
    const t = setInterval(() => force(n => n + 1), 15000)
    return () => clearInterval(t)
  }, [status])

  if (status === 'idle') return null

  const base = 'shrink-0 flex items-center gap-1 text-[10px] font-medium'

  if (status === 'saving') {
    return (
      <span className={`${base} text-slate-400 dark:text-slate-500`} title="Salvando no servidor…">
        <CloudUpload size={12} className="animate-pulse" />
        Salvando…
      </span>
    )
  }

  if (status === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={`${base} text-rose-500 hover:text-rose-600 dark:hover:text-rose-400`}
        title="Falha ao salvar — clique para tentar de novo"
      >
        <TriangleAlert size={12} />
        Erro
        <RotateCw size={11} />
      </button>
    )
  }

  // saved
  return (
    <span
      className={`${base} text-slate-400 dark:text-slate-500`}
      title={lastSavedAt ? `Salvo em ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Salvo'}
    >
      <Check size={12} />
      {relativeSaved(lastSavedAt)}
    </span>
  )
}

function relativeSaved(ts: number | null): string {
  if (!ts) return 'Salvo'
  const secs = Math.round((Date.now() - ts) / 1000)
  if (secs < 5) return 'Salvo'
  if (secs < 60) return `Salvo há ${secs}s`
  const mins = Math.round(secs / 60)
  return `Salvo há ${mins}min`
}
