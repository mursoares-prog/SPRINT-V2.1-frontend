import { Check, Moon, Sun, Settings, Network, Sliders, Download, HelpCircle } from 'lucide-react'
import { BsBoxes } from 'react-icons/bs'
import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '../context/AppContext'
import { isAdmin } from '../utils/auth'
import { buildProjectFacts } from '../utils/projectFacts'

function LegoIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <rect x="2" y="11" width="20" height="10" rx="1.5" />
      <rect x="5" y="6.5" width="5" height="5" rx="1.2" />
      <rect x="14" y="6.5" width="5" height="5" rx="1.2" />
    </svg>
  )
}

const SUPPORT_EMAIL = 'emai@xxx'

function HelpButton() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      // O menu é renderizado via portal (fora do header, que tem overflow-hidden para os
      // cantos arredondados) — por isso o clique-fora também precisa considerar o portal.
      if (wrapRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('[data-help-portal]')) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={toggle}
        title="Ajuda"
        className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/8 dark:hover:bg-white/10 transition-colors">
        <HelpCircle size={17} />
      </button>
      {/* Renderizado via portal: o <header> pai tem overflow-hidden (para os cantos
          arredondados dos dois blocos de cor) e cortaria este menu se ele fosse absolute
          dentro dele — por isso escapa para document.body com position: fixed. */}
      {open && pos && createPortal(
        <div
          data-help-portal
          style={{ position: 'fixed', top: pos.top, right: pos.right }}
          className="z-[300] w-64 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-3">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">Ajuda</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Contato para suporte da aplicação:
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline break-all">
            {SUPPORT_EMAIL}
          </a>
        </div>,
        document.body,
      )}
    </div>
  )
}

const STEP_LABELS = [
  'Criação do cronograma',
  'Organizar pacotes',
  'Aperfeiçoamento',
]

function viewToStep(view: string): number {
  if (view === 'home' || view === 'wizard') return 1
  if (view === 'schedule') return 2
  if (view === 'fine_tuning') return 3
  return 1
}

function StepCircle({ num, status, clickable, title, isDark, onClick }: {
  num: number; status: 'done' | 'active' | 'next'; clickable: boolean; title: string
  isDark: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={!clickable}
      title={title}
      className="w-6 h-6 rounded-full flex items-center justify-center transition-all"
      style={isDark ? {
        background:
          status === 'done'   ? '#1a3a5c' :
          status === 'active' ? '#d97706' : 'transparent',
        border: status === 'next' ? '1.5px solid #374151' : 'none',
        cursor: clickable ? 'pointer' : 'default',
      } : {
        background:
          status === 'done'   ? '#ffffff' :
          status === 'active' ? '#ffffff' : 'transparent',
        border:
          status === 'active' ? '1.5px solid #008542' :
          status === 'next'   ? '1.5px solid #9ca3af' : 'none',
        cursor: clickable ? 'pointer' : 'default',
      }}>
      {status === 'done'
        ? <Check size={10} strokeWidth={3} style={{ color: isDark ? '#38bdf8' : '#008542' }} />
        : <span className="text-[10px] font-bold select-none"
            style={{ color: isDark
              ? (status === 'active' ? '#ffffff' : '#374151')
              : (status === 'active' ? '#008542' : '#9ca3af') }}>
            {num}
          </span>
      }
    </button>
  )
}

export function Sidebar({ isDark, onToggleDark, onOpenConfig, onOpenPackages, onOpenLogicEditor, onBeforeStepNav }: {
  isDark: boolean; onToggleDark: () => void; onOpenConfig?: () => void
  onOpenPackages?: (anchor: DOMRect) => void; onOpenLogicEditor?: () => void
  onBeforeStepNav?: (targetView: string) => boolean
}) {
  const { state, dispatch } = useApp()
  const activeStep = viewToStep(state.view)
  const hasSchedule = state.schedule.length > 0

  const canClick = (num: number) => {
    if (num === 1) return true
    if (num === 2) return hasSchedule
    if (num === 3) return hasSchedule
    return false
  }

  const handleStepClick = (num: number) => {
    if (!canClick(num)) return
    if (num === 3) {
      dispatch({ type: 'ENTER_FINE_TUNING' })
      return
    }
    const targetView = num === 1 ? 'wizard' : num === 2 ? 'schedule' : num === 3 ? 'fine_tuning' : null
    if (!targetView) return
    if (onBeforeStepNav && !onBeforeStepNav(targetView)) return
    dispatch({ type: 'SET_VIEW', view: targetView as 'home' | 'wizard' | 'schedule' | 'fine_tuning' })
  }

  const pkgBtnRef = useRef<HTMLButtonElement>(null)

  const handleExportJson = () => {
    const timesAdjusted = state.ftAdjustMode.firme !== 'none' || state.ftAdjustMode.cont !== 'none'
    if (!timesAdjusted) {
      const confirmed = window.confirm(
        'Você ainda não usou o Ajuste de Tempos (Etapa 3). Deseja finalizar a edição mesmo assim?'
      )
      if (!confirmed) return
    }
    const data = buildProjectFacts(state)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${state.wellName || 'sprint-aban'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header className="flex w-full shrink-0 rounded-tl-lg rounded-tr-lg border-b border-slate-200 dark:border-slate-700 overflow-hidden" style={{ height: '48px' }}>

      {/* Left segment: SPRINT brand */}
      <div className="flex items-center gap-2.5 px-4 shrink-0"
        style={{
          width: '340px',
          background: isDark ? '#0c2340' : '#009957',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.22)',
        }}>
        <BsBoxes size={26} className="text-white" />
        <span style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
          className="text-2xl font-bold tracking-[0.15em] text-white uppercase leading-none select-none">
          SPRINT
        </span>
      </div>

      {/* Right segment: steps + actions */}
      <div className="flex items-center flex-1 px-4"
        style={{ background: isDark ? '#1e293b' : '#d4d4d4' }}>

        {/* Step indicators (horizontal) */}
        <nav className="flex items-center">
          {[1, 2].map((num, i) => (
            <div key={num} className="flex items-center">
              <StepCircle num={num}
                status={num < activeStep ? 'done' : num === activeStep ? 'active' : 'next'}
                clickable={canClick(num)}
                title={`Etapa ${num}: ${STEP_LABELS[i]}`}
                isDark={isDark}
                onClick={() => handleStepClick(num)} />

              {/* Horizontal connector */}
              <div className="h-px w-5 mx-1"
                style={{ background: isDark
                  ? (num < activeStep ? '#1a3a5c' : '#1f2937')
                  : (num < activeStep ? '#008542' : '#b0b0b0') }} />
            </div>
          ))}

          {activeStep === 3 ? (
            <>
              <StepCircle num={3} status="active" clickable={canClick(3)}
                title={`Etapa 3: ${STEP_LABELS[2]}`}
                isDark={isDark}
                onClick={() => handleStepClick(3)} />

              {/* Horizontal connector */}
              <div className="h-px w-5 mx-1" style={{ background: isDark ? '#1a3a5c' : '#008542' }} />

              {/* Finalizar Edição — exporta o JSON do projeto */}
              <button
                onClick={handleExportJson}
                className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-semibold whitespace-nowrap transition-colors bg-[#008542] text-white hover:opacity-90 dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 dark:hover:bg-[#1e4570] dark:hover:border-sky-500">
                <Download size={12} /> Finalizar Edição
              </button>
            </>
          ) : activeStep === 2 ? (
            /* Etapa 3 — leva direto ao Detalhamento do cronograma */
            <button
              onClick={() => handleStepClick(3)}
              disabled={!canClick(3)}
              title={`Etapa 3: ${STEP_LABELS[2]}`}
              className="flex items-center gap-1.5 h-7 px-3 rounded text-xs font-semibold transition-colors bg-[#008542] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40 dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 dark:hover:bg-[#1e4570] dark:hover:border-sky-500">
              <Sliders size={12} />
              <span>Etapa 3</span>
            </button>
          ) : (
            <StepCircle num={3} status="next" clickable={false}
              title={`Etapa 3: ${STEP_LABELS[2]}`}
              isDark={isDark}
              onClick={() => {}} />
          )}
        </nav>

        <div className="flex-1" />

        {/* Action icons */}
        <div className="flex items-center gap-0.5">
          <button
            ref={pkgBtnRef}
            onClick={() => { const r = pkgBtnRef.current?.getBoundingClientRect(); if (r) onOpenPackages?.(r) }}
            title="Lista de pacotes"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/8 dark:hover:bg-white/10 transition-colors">
            <LegoIcon size={17} />
          </button>
          <button
            onClick={() => onOpenLogicEditor?.()}
            title="Árvores de Decisão"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/8 dark:hover:bg-white/10 transition-colors">
            <Network size={17} />
          </button>
          <button
            onClick={onToggleDark}
            title={isDark ? 'Tema claro' : 'Tema escuro'}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/8 dark:hover:bg-white/10 transition-colors">
            {isDark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          {isAdmin() && (
            <button
              onClick={() => onOpenConfig?.()}
              title="Configurações"
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/8 dark:hover:bg-white/10 transition-colors">
              <Settings size={17} />
            </button>
          )}
          <HelpButton />
        </div>
      </div>
    </header>
  )
}
