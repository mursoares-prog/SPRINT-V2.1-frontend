import { Check, Moon, Sun, Settings, LogOut, Network } from 'lucide-react'
import { useApp } from '../context/AppContext'

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

function SemisubIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M12 2 L9 8 L15 8 Z" />
      <line x1="10.5" y1="5.5" x2="13.5" y2="5.5" />
      <rect x="3" y="8" width="18" height="1.5" rx="0.4" />
      <rect x="5.5" y="9.5" width="3.5" height="6" rx="0.4" />
      <rect x="15" y="9.5" width="3.5" height="6" rx="0.4" />
      <rect x="2.5" y="15.5" width="9" height="3.5" rx="1.75" />
      <rect x="12.5" y="15.5" width="9" height="3.5" rx="1.75" />
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

export function Sidebar({ isDark, onToggleDark, onOpenConfig, onOpenPackages, onOpenFlowchart, onBeforeStepNav, onLogout }: {
  isDark: boolean; onToggleDark: () => void; onOpenConfig?: () => void
  onOpenPackages?: () => void; onOpenFlowchart?: () => void
  onBeforeStepNav?: (targetView: string) => boolean
  onLogout?: () => void
}) {
  const { state, dispatch } = useApp()
  const activeStep = viewToStep(state.view)
  const hasSchedule = state.schedule.length > 0
  const hasFt = state.fineTuningItems.length > 0

  const canClick = (num: number) => {
    if (num === 1) return true
    if (num === 2) return hasSchedule
    if (num === 3) return hasSchedule && hasFt
    return false
  }

  const handleStepClick = (num: number) => {
    if (!canClick(num)) return
    const targetView = num === 1 ? 'wizard' : num === 2 ? 'schedule' : num === 3 ? 'fine_tuning' : null
    if (!targetView) return
    if (onBeforeStepNav && !onBeforeStepNav(targetView)) return
    dispatch({ type: 'SET_VIEW', view: targetView as 'home' | 'wizard' | 'schedule' | 'fine_tuning' })
  }

  return (
    <aside className="w-16 hidden md:flex flex-col items-center py-5 h-full shrink-0"
      style={{ background: '#0c2340' }}>

      {/* Logo */}
      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-5"
        style={{ background: '#d97706' }}>
        <SemisubIcon size={18} className="text-white" />
      </div>

      {/* Vertical step indicators */}
      <nav className="flex flex-col items-center">
        {[1, 2, 3].map((num, i) => {
          const status = num < activeStep ? 'done' : num === activeStep ? 'active' : 'next'
          const clickable = canClick(num)

          return (
            <div key={num} className="flex flex-col items-center">
              <button
                onClick={() => handleStepClick(num)}
                disabled={!clickable}
                title={`Passo ${num}: ${STEP_LABELS[i]}`}
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                style={{
                  background:
                    status === 'done'   ? '#1a3a5c' :
                    status === 'active' ? '#d97706' : 'transparent',
                  border: status === 'next' ? '1.5px solid #374151' : 'none',
                  cursor: clickable ? 'pointer' : 'default',
                }}>
                {status === 'done'
                  ? <Check size={12} strokeWidth={3} className="text-sky-400" />
                  : <span className={`text-[11px] font-bold select-none ${
                      status === 'active' ? 'text-white' : 'text-slate-700'
                    }`}>{num}</span>
                }
              </button>

              {/* Connector */}
              {i < 2 && (
                <div className="w-px h-4 my-0.5"
                  style={{ background: num < activeStep ? '#1a3a5c' : '#1f2937' }} />
              )}
            </div>
          )
        })}
      </nav>

      {/* Bottom controls */}
      <div className="mt-auto flex flex-col items-center gap-1">
        <button
          onClick={() => onOpenPackages?.()}
          title="Lista de pacotes"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b' }}>
          <LegoIcon size={19} />
        </button>
        <button
          onClick={() => onOpenFlowchart?.()}
          title="Fluxograma"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b' }}>
          <Network size={19} />
        </button>
        <button
          onClick={() => onOpenConfig?.()}
          title="Configurações"
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b' }}>
          <Settings size={19} />
        </button>
        <button
          onClick={onToggleDark}
          title={isDark ? 'Tema claro' : 'Tema escuro'}
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
          style={{ color: '#64748b' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#94a3b8' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b' }}>
          {isDark ? <Sun size={19} /> : <Moon size={19} />}
        </button>
        {onLogout && (
          <button
            onClick={onLogout}
            title="Sair"
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
            style={{ color: '#64748b' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#f87171' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#64748b' }}>
            <LogOut size={19} />
          </button>
        )}
      </div>
    </aside>
  )
}
