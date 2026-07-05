/**
 * Validador de paridade: engine de sequenciamento (autoridade) × fluxo de lógica.
 *
 * Compara, para um conjunto de inputs default do wizard, a saída da sequence
 * engine (espelho frontend da engine Python, coberta pelos fixtures do backend)
 * com a saída do fluxo em edição (logicEngine). Usado na migração dos escopos
 * bundle para fluxos custom: 0 divergências = paridade alcançada.
 */
import { useMemo, useState } from 'react'
import { X, Scale, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { LSec } from '../data/logicSecs'
import type { WizardInputs, ScheduleItem, ScopeId } from '../types'
import { generateSchedule as generateScheduleBundle } from '../engines/sequenceEngine'
import { generateScheduleFromLogic } from '../engines/logicEngine'
import { expandScopeRefs } from '../data/logicOverrideStore'
import { getDefaultInputs } from '../utils/defaultInputs'

const BUNDLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'FSU_TT_FT', label: 'FSU · TT-FT' }, { id: 'FSU_TT_BDC', label: 'FSU · TT-BDC' },
  { id: 'FSU_Conv_BOP', label: 'FSU · Conv-BOP' }, { id: 'FSU_Conv_RCMA', label: 'FSU · Conv-RCMA' },
  { id: 'FSU_Sup_COP', label: 'FSU · Sup-COP' }, { id: 'FSU_Sup_PWC', label: 'FSU · Sup-PWC' },
  { id: 'FS1_Mec', label: 'FS1 · Mec' },
  { id: 'FS2_Conv_BOP', label: 'FS2 · Conv-BOP' }, { id: 'FS2_Conv_RCMA', label: 'FS2 · Conv-RCMA' },
  { id: 'FS2_Sup_COP', label: 'FS2 · Sup-COP' }, { id: 'FS2_Sup_PWC', label: 'FS2 · Sup-PWC' },
]

type RowState = 'match' | 'attr' | 'engine' | 'logic'
type DiffRow = { state: RowState; left?: ScheduleItem; right?: ScheduleItem }

// Alinhamento ordem-preservante por packageId (LCS). match = mesmo pacote na mesma
// posição relativa; attr = pacote igual mas fase/contingência/duração divergem.
function diffSchedules(a: ScheduleItem[], b: ScheduleItem[]): DiffRow[] {
  const n = a.length, m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i].packageId === b[j].packageId
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const rows: DiffRow[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i].packageId === b[j].packageId) {
      const attrsDiffer =
        a[i].phase !== b[j].phase ||
        !!a[i].isContingency !== !!b[j].isContingency ||
        a[i].duration !== b[j].duration
      rows.push({ state: attrsDiffer ? 'attr' : 'match', left: a[i], right: b[j] })
      i++; j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ state: 'engine', left: a[i] }); i++
    } else {
      rows.push({ state: 'logic', right: b[j] }); j++
    }
  }
  while (i < n) { rows.push({ state: 'engine', left: a[i] }); i++ }
  while (j < m) { rows.push({ state: 'logic', right: b[j] }); j++ }
  return rows
}

function metrics(items: ScheduleItem[]) {
  return {
    total: items.length,
    contingency: items.filter(it => it.isContingency).length,
    days: items.reduce((mx, it) => Math.max(mx, it.endDay), 0),
  }
}

const ROW_STYLE: Record<RowState, string> = {
  match:  'bg-emerald-900/15 border-emerald-800/30',
  attr:   'bg-amber-900/20 border-amber-700/40',
  engine: 'bg-slate-800/40 border-slate-700/40',
  logic:  'bg-rose-900/20 border-rose-800/40',
}

function ItemCell({ it, dim }: { it?: ScheduleItem; dim?: boolean }) {
  if (!it) return <div className="flex-1 min-w-0 px-2 py-1 text-[10px] text-slate-700 italic">—</div>
  return (
    <div className={`flex-1 min-w-0 px-2 py-1 ${dim ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] font-bold text-blue-400 shrink-0">{it.packageId}</span>
        {it.isContingency && <span className="text-orange-400 text-[9px]" title={it.contingencyReason}>⚑</span>}
        <span className="text-[9px] text-slate-500 ml-auto shrink-0">{it.phase} · {it.duration}d</span>
      </div>
      <div className="text-[10px] text-slate-400 truncate">{it.packageName}</div>
    </div>
  )
}

export function ScopeParityChecker({ scopeLabel, sections, isCustomScope, defaultRef, onClose }: {
  scopeLabel: string
  sections: LSec[]
  isCustomScope: boolean          // espelha scheduleRouter: escopo fora do catálogo bundle
  defaultRef?: string             // bundle de referência pré-selecionado (se o escopo editado for bundle)
  onClose: () => void
}) {
  const [refScope, setRefScope] = useState<string>(defaultRef ?? 'FSU_TT_FT')
  const [rigType, setRigType] = useState<'ANC' | 'DP'>('ANC')
  const [opType, setOpType] = useState<'Generalista' | 'LWO'>('Generalista')
  const [onlyDiff, setOnlyDiff] = useState(false)

  const result = useMemo(() => {
    try {
      const inputs = getDefaultInputs(rigType, opType, refScope as ScopeId) as WizardInputs
      const engineOut = generateScheduleBundle(inputs)
      const logicOut = generateScheduleFromLogic(inputs, expandScopeRefs(sections) as LSec[], isCustomScope)
      return { rows: diffSchedules(engineOut, logicOut), eng: metrics(engineOut), log: metrics(logicOut), error: null }
    } catch (e) {
      return { rows: [] as DiffRow[], eng: metrics([]), log: metrics([]), error: e instanceof Error ? e.message : String(e) }
    }
  }, [refScope, rigType, opType, sections, isCustomScope])

  const divergences = result.rows.filter(r => r.state !== 'match').length
  const shownRows = onlyDiff ? result.rows.filter(r => r.state !== 'match') : result.rows

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[88vh] flex flex-col m-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-700 shrink-0">
          <Scale size={15} className="text-[#d97706]" />
          <span className="text-sm font-semibold text-slate-100">Paridade engine × fluxo</span>
          <span className="text-[11px] text-slate-500 truncate">— {scopeLabel}</span>
          <button onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-200 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-700/60 shrink-0 flex-wrap">
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            Referência (engine)
            <select value={refScope} onChange={e => setRefScope(e.target.value)}
              className="text-[10px] bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-slate-200 outline-none focus:border-[#d97706]/60 cursor-pointer">
              {BUNDLE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            Sonda
            <select value={rigType} onChange={e => setRigType(e.target.value as 'ANC' | 'DP')}
              className="text-[10px] bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-slate-200 outline-none focus:border-[#d97706]/60 cursor-pointer">
              <option value="ANC">ANC</option>
              <option value="DP">DP</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400">
            Operação
            <select value={opType} onChange={e => setOpType(e.target.value as 'Generalista' | 'LWO')}
              className="text-[10px] bg-slate-800 border border-slate-700 rounded-md px-1.5 py-1 text-slate-200 outline-none focus:border-[#d97706]/60 cursor-pointer">
              <option value="Generalista">Generalista</option>
              <option value="LWO">LWO</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-slate-400 cursor-pointer ml-auto">
            <input type="checkbox" checked={onlyDiff} onChange={e => setOnlyDiff(e.target.checked)}
              className="accent-[#d97706]" />
            Só divergências
          </label>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-700/60 shrink-0 flex-wrap">
          {divergences === 0 && !result.error ? (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 size={13} /> Paridade total — 0 divergências
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
              <AlertTriangle size={13} /> {divergences} divergência{divergences !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-slate-500">
            Engine: {result.eng.total} pacotes · {result.eng.contingency} conting. · {result.eng.days}d
          </span>
          <span className="text-[10px] text-slate-500">
            Fluxo: {result.log.total} pacotes · {result.log.contingency} conting. · {result.log.days}d
          </span>
          {result.error && <span className="text-[10px] text-rose-400">Erro: {result.error}</span>}
        </div>

        {/* Column headers */}
        <div className="flex px-5 pt-2 pb-1 shrink-0">
          <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Engine (autoridade)</span>
          <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 pl-2">Fluxo de lógica</span>
        </div>

        {/* Diff rows */}
        <div className="flex-1 overflow-y-auto scrollbar-custom px-5 pb-4 space-y-1">
          {shownRows.length === 0 && (
            <p className="text-[11px] text-slate-600 italic py-4 text-center">
              {onlyDiff ? 'Nenhuma divergência.' : 'Nenhum pacote gerado.'}
            </p>
          )}
          {shownRows.map((row, i) => (
            <div key={i} className={`flex items-stretch rounded-lg border ${ROW_STYLE[row.state]}`}>
              <ItemCell it={row.left} dim={row.state === 'engine'} />
              <div className="w-px bg-slate-700/50 shrink-0" />
              <ItemCell it={row.right} dim={false} />
              <span className="w-16 shrink-0 flex items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                {row.state === 'match' ? '✓' : row.state === 'attr' ? 'atributos' : row.state === 'engine' ? 'só engine' : 'só fluxo'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
