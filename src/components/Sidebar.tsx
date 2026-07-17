import { Check, Moon, Sun, Settings, Network } from 'lucide-react'
import { LuNetwork } from 'react-icons/lu'
import { useRef } from 'react'
import { useApp } from '../context/AppContext'
import { isAdmin } from '../utils/auth'

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

  return (
    <header className="flex w-full shrink-0 rounded-tl-lg rounded-tr-lg border-b border-slate-200 dark:border-slate-700 overflow-hidden" style={{ height: '48px' }}>

      {/* Left segment: SPRINT brand */}
      <div className="flex items-center gap-2.5 px-4 shrink-0"
        style={{
          width: '340px',
          background: isDark ? '#0c2340' : '#009957',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.22)',
        }}>
        <LuNetwork size={26} className="text-white" />
        <span style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
          className="text-2xl font-bold tracking-[0.15em] text-white uppercase leading-none select-none">
          SPRINT
        </span>
      </div>

      {/* Right segment: steps + actions */}
      <div className="flex items-center flex-1 px-4"
        style={{ background: isDark ? '#1e293b' : '#d4d4d4' }}>

        {/* Step indicators (horizontal) */}
        <nav className="flex items-center">
          {[1, 2, 3].map((num, i) => {
            const status = num < activeStep ? 'done' : num === activeStep ? 'active' : 'next'
            const clickable = canClick(num)

            return (
              <div key={num} className="flex items-center">
                <button
                  onClick={() => handleStepClick(num)}
                  disabled={!clickable}
                  title={`Passo ${num}: ${STEP_LABELS[i]}`}
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

                {/* Horizontal connector */}
                {i < 2 && (
                  <div className="h-px w-5 mx-1"
                    style={{ background: isDark
                      ? (num < activeStep ? '#1a3a5c' : '#1f2937')
                      : (num < activeStep ? '#008542' : '#b0b0b0') }} />
                )}
              </div>
            )
          })}
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
        </div>
      </div>
    </header>
  )
}
