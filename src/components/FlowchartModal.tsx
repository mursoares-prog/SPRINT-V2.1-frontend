import { useState } from 'react'
import { X } from 'lucide-react'
import { LogicGraphPanel } from './LogicGraphPanel'
import { LOGIC_BY_SCOPE, LOGIC_COMPLETO_TREE, LOGIC_COMPLETO_GROUPED_TREE } from '../data/logicSecs'

type ScopeEntry = { id: string; label: string }
type ScopeGroup = { group: string; scopes: ScopeEntry[] }

const SCOPE_GROUPS: ScopeGroup[] = [
  {
    group: 'Fase Única — Through Tubing',
    scopes: [
      { id: 'FSU_TT_FT',  label: 'TT Flexitubo (TT-FT)' },
      { id: 'FSU_TT_BDC', label: 'TT Bombeio Direto (TT-BDC)' },
    ],
  },
  {
    group: 'Fase Única — Conv. / Superconv.',
    scopes: [
      { id: 'FSU_Conv_BOP',  label: 'Convencional c/ BOP' },
      { id: 'FSU_Conv_RCMA', label: 'Convencional c/ RCMA' },
      { id: 'FSU_Sup_COP',   label: 'Superconv. — COP Int./Inf.' },
      { id: 'FSU_Sup_PWC',   label: 'Superconv. — Reciment./PWC' },
    ],
  },
  {
    group: 'Fase 1 — Tampões Mecânicos',
    scopes: [
      { id: 'FS1_Mec', label: 'Tampões Mecânicos' },
    ],
  },
  {
    group: 'Fase 2',
    scopes: [
      { id: 'FS2_Conv_BOP',  label: 'Convencional c/ BOP' },
      { id: 'FS2_Conv_RCMA', label: 'Convencional c/ RCMA' },
      { id: 'FS2_Sup_COP',   label: 'Superconv. — COP Int./Inf.' },
      { id: 'FS2_Sup_PWC',   label: 'Superconv. — Reciment./PWC' },
    ],
  },
]

const COMPLETE_KEY = '__COMPLETE__'
const GROUPED_KEY = '__GROUPED__'
const DEFAULT_SCOPE = 'FSU_TT_FT'

export function FlowchartModal({ onClose }: { onClose: () => void }) {
  const [scopeId, setScopeId] = useState(DEFAULT_SCOPE)

  const isComplete = scopeId === COMPLETE_KEY
  const isGrouped = scopeId === GROUPED_KEY
  const secs = LOGIC_BY_SCOPE[scopeId] ?? LOGIC_BY_SCOPE[DEFAULT_SCOPE]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0 flex-wrap">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 shrink-0">
            Lógica de decisão
          </h2>

          {/* Scope selector */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">Escopo:</span>
            <select
              value={scopeId}
              onChange={e => setScopeId(e.target.value)}
              className="flex-1 min-w-0 max-w-xs text-[13px] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value={COMPLETE_KEY}>★ Completo — todos os escopos</option>
              <option value={GROUPED_KEY}>★ Completo agrupado — blocos comuns fatorados</option>
              {SCOPE_GROUPS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.scopes.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {isComplete
            ? <LogicGraphPanel key="__complete__" tree={LOGIC_COMPLETO_TREE} />
            : isGrouped
              ? <LogicGraphPanel key="__grouped__" tree={LOGIC_COMPLETO_GROUPED_TREE} />
              : <LogicGraphPanel key={scopeId} secs={secs} />}
        </div>
      </div>
    </div>
  )
}
