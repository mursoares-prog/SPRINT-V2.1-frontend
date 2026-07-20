import { useState, useEffect, useRef, useMemo } from 'react'
import React from 'react'
import { useApp } from '../context/AppContext'
import type { ScheduleItem } from '../types'
import { PACKAGES, getAllPackages } from '../data/packages'
import { generateSchedule } from '../engines/scheduleRouter'
import type { WizardInputs } from '../types'
import { Undo2, Redo2, BarChart2, Search, ChevronUp, ChevronDown, X, GripVertical, AlertTriangle, PencilRuler } from 'lucide-react'

const normalizeFind = (s: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const MOUNT_IDS    = new Set(Object.values(PACKAGES).filter(p => p.isMountOp).map(p => p.id))
const DISMOUNT_IDS = new Set(Object.values(PACKAGES).filter(p => p.isDismountOp).map(p => p.id))
const TRACKED_MOUNT_TECHS = ['wireline', 'electric', 'ct'] as const
const MOUNT_TECH_LABELS: Record<string, string> = { wireline: 'Arame', electric: 'Cabo', ct: 'FT' }
const CONTING_TEXT = 'text-[#7d1935] dark:text-rose-400'


// Barra padrão das operações normais no Gantt (mesmo azul da antiga "Fase 1A").
const GANTT_BAR = 'bg-sky-600'

export function ScheduleToolbar({ showStats, onToggleStats }: { showStats: boolean; onToggleStats: () => void }) {
  const { dispatch, canUndoInputs, canRedoInputs, state } = useApp()
  const showHours = state.showHours
  const overrideActive = state.scheduleOverrideActive
  const [showDeactivateWarn, setShowDeactivateWarn] = useState(false)

  const rebuildFromLogic = () => {
    try {
      const schedule = generateSchedule(state.inputs as WizardInputs)
      dispatch({ type: 'UPDATE_SCHEDULE', schedule })
    } catch { /* invalid/incomplete state */ }
    dispatch({ type: 'SET_SCHEDULE_OVERRIDE_ACTIVE', active: false })
    setShowDeactivateWarn(false)
  }

  return (
    <div className="flex items-center shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700" style={{ height: '38px' }}>

      {/* Undo/redo */}
      <div className="flex items-center gap-1.5 pl-4 shrink-0">
        <button
          onClick={() => dispatch({ type: 'UNDO_INPUTS' })}
          disabled={!canUndoInputs}
          title="Desfazer (Ctrl+Z)"
          className="flex items-center gap-1 h-7 px-2 rounded text-xs font-normal transition-colors border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 bg-[#fafafa] dark:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed">
          <Undo2 size={12} /><span className="hidden md:inline">Desfazer</span>
        </button>
        <button
          onClick={() => dispatch({ type: 'REDO_INPUTS' })}
          disabled={!canRedoInputs}
          title="Refazer (Ctrl+Y)"
          className="flex items-center gap-1 h-7 px-2 rounded text-xs font-normal transition-colors border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 bg-[#fafafa] dark:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed">
          <Redo2 size={12} /><span className="hidden md:inline">Refazer</span>
        </button>
      </div>

      <div className="flex items-center pl-2 shrink-0">
        <button
          onClick={() => {
            if (overrideActive) setShowDeactivateWarn(true)
            else dispatch({ type: 'SET_SCHEDULE_OVERRIDE_ACTIVE', active: true })
          }}
          title={overrideActive ? 'Desativar edição manual do cronograma' : 'Ativar edição manual do cronograma (reordenar, inserir e excluir pacotes)'}
          className={`flex items-center gap-1 h-7 px-2.5 text-xs rounded border transition-colors ${overrideActive
            ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
            : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500'}`}>
          <PencilRuler size={12} /><span className="hidden md:inline">Override</span>
        </button>
      </div>

      <div className="flex-1" />

      {/* Right: remaining controls */}
      <div className="flex items-center gap-1.5 px-3">
      <div className="flex gap-1 shrink-0">
        <button onClick={() => showHours && dispatch({ type: 'TOGGLE_HOURS' })}
          className={`flex items-center h-7 px-2 text-xs rounded border transition-colors ${!showHours
            ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
            : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500'}`}>d</button>
        <button onClick={() => !showHours && dispatch({ type: 'TOGGLE_HOURS' })}
          className={`flex items-center h-7 px-2 text-xs rounded border transition-colors ${showHours
            ? 'border-slate-500 dark:border-slate-400 bg-slate-100 dark:bg-slate-600 text-slate-800 dark:text-slate-100'
            : 'border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500'}`}>h</button>
      </div>
      <button
        onClick={onToggleStats}
        title={showStats ? 'Ocultar painel de estatísticas' : 'Mostrar painel de estatísticas'}
        className={`flex items-center h-7 px-2 rounded text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700 ${showStats ? 'text-[#0c2340] dark:text-sky-400 border-[#0c2340]/30 dark:border-sky-700' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 hover:border-slate-300 dark:hover:bg-slate-600 dark:hover:border-slate-500'}`}>
        <BarChart2 size={13} />
      </button>
      </div>

      {showDeactivateWarn && (
        <div className="fixed inset-x-0 bottom-0 top-12 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">Desativar edição manual?</p>
                <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed">
                  As edições manuais feitas nos pacotes (reordenação, inserções e exclusões) serão perdidas. O cronograma
                  será remontado somente a partir da árvore de decisão.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeactivateWarn(false)}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                Cancelar
              </button>
              <button
                onClick={rebuildFromLogic}
                className="flex items-center h-8 px-4 rounded-lg text-sm font-semibold transition-colors bg-[#008542] text-white hover:opacity-90 dark:bg-[#1a3a5c] dark:border dark:border-sky-700 dark:text-sky-300 dark:hover:bg-[#1e4570] dark:hover:border-sky-500">
                Desativar e remontar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function ScheduleView({ showStats }: { showStats: boolean }) {
  const { state, dispatch } = useApp()
  const { schedule } = state
  const showHours = state.showHours

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden p-4 md:p-6">
        <PackageList items={schedule} showHours={showHours} overrideActive={state.scheduleOverrideActive}
          onDurationChange={(uid, dur) => dispatch({ type: 'UPDATE_ITEM_DURATION', uid, duration: dur })} />
        {showStats && <ScheduleStatsPanel items={schedule} showHours={showHours} />}
      </div>
    </div>
  )
}

function buildTechRows(
  schedule: ScheduleItem[],
  phases: string[],
  matches: (i: ScheduleItem) => boolean,
  weight: (i: ScheduleItem) => number = () => 1,
  contWeight?: (i: ScheduleItem) => number,
) {
  const rows = phases.map(phase => {
    const counts = Object.fromEntries(
      TRACKED_MOUNT_TECHS.map(tech => [
        tech,
        schedule
          .filter(i => i.phase === phase && i.technology === tech && !i.isContingency && matches(i))
          .reduce((sum, i) => sum + weight(i), 0),
      ])
    ) as Record<string, number>
    return { phase, counts }
  }).filter(row => TRACKED_MOUNT_TECHS.some(t => row.counts[t] > 0))
  const contingTotals = Object.fromEntries(
    TRACKED_MOUNT_TECHS.map(tech => {
      const fromContItems = schedule
        .filter(i => i.technology === tech && i.isContingency && matches(i))
        .reduce((sum, i) => sum + weight(i), 0)
      const fromSubruns = contWeight
        ? schedule
            .filter(i => i.technology === tech && !i.isContingency && matches(i))
            .reduce((sum, i) => sum + contWeight(i), 0)
        : 0
      return [tech, fromContItems + fromSubruns]
    })
  ) as Record<string, number>
  const hasConting = TRACKED_MOUNT_TECHS.some(t => contingTotals[t] > 0)
  return { rows, contingTotals, hasConting }
}

function TechCountSection({
  title, rows, contingTotals, hasConting,
}: {
  title: string
  rows: { phase: string; counts: Record<string, number> }[]
  contingTotals: Record<string, number>
  hasConting: boolean
}) {
  if (rows.length === 0 && !hasConting) return null
  return (
    <>
      <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-[#ebebeb] dark:bg-slate-700 grid grid-cols-4 gap-x-1 items-center">
        <span className="col-span-1 text-xs font-bold text-slate-700 dark:text-slate-300">{title}</span>
        {TRACKED_MOUNT_TECHS.map(t => (
          <span key={t} className="text-xs text-slate-600 dark:text-slate-500 text-center">{MOUNT_TECH_LABELS[t]}</span>
        ))}
      </div>
      <div className="px-3">
        {rows.map(({ phase, counts }) => (
          <div key={phase} className="grid grid-cols-4 gap-x-1 py-1.5 border-t border-slate-200 dark:border-slate-800/60">
            <span className="text-xs text-slate-700 dark:text-slate-400 truncate col-span-1">{phase}</span>
            {TRACKED_MOUNT_TECHS.map(t => (
              <span key={t} className={`text-xs text-center ${counts[t] > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-200 dark:text-slate-700'}`}>
                {counts[t] > 0 ? counts[t] : '—'}
              </span>
            ))}
          </div>
        ))}
        {hasConting && (
          <div className="grid grid-cols-4 gap-x-1 py-1.5 border-t border-slate-200 dark:border-slate-700">
            <span className={`text-xs ${CONTING_TEXT} truncate col-span-1`}>Conting.</span>
            {TRACKED_MOUNT_TECHS.map(t => (
              <span key={t} className={`text-xs text-center ${contingTotals[t] > 0 ? CONTING_TEXT : 'text-slate-200 dark:text-slate-700'}`}>
                {contingTotals[t] > 0 ? contingTotals[t] : '—'}
              </span>
            ))}
          </div>
        )}
        <div className="pb-1" />
      </div>
    </>
  )
}

function ScheduleStatsPanel({ items, showHours }: { items: ScheduleItem[]; showHours: boolean }) {
  const fmt = (d: number) => (showHours ? (d * 24).toFixed(1) : d.toFixed(2)).replace('.', ',')

  const phaseOrder: string[] = []
  const phaseMap = new Map<string, { firme: number; cont: number }>()
  for (const item of items) {
    if (!phaseMap.has(item.phase)) {
      phaseOrder.push(item.phase)
      phaseMap.set(item.phase, { firme: 0, cont: 0 })
    }
    const p = phaseMap.get(item.phase)!
    if (item.isContingency) p.cont += item.duration
    else p.firme += item.duration
  }

  const grandFirme = phaseOrder.reduce((a, p) => a + phaseMap.get(p)!.firme, 0)
  const grandCont  = phaseOrder.reduce((a, p) => a + phaseMap.get(p)!.cont,  0)
  const grandTotal = grandFirme + grandCont

  const phases = [...new Set(items.map(i => i.phase))]
  const nRuns       = (i: ScheduleItem) => PACKAGES[i.packageId]?.nRuns ?? 1
  const nContSubruns = (i: ScheduleItem) => PACKAGES[i.packageId]?.nContSubruns ?? 0
  const mounts = buildTechRows(items, phases, i => MOUNT_IDS.has(i.packageId))
  const runs = buildTechRows(
    items, phases,
    i => !MOUNT_IDS.has(i.packageId) && !DISMOUNT_IDS.has(i.packageId),
    nRuns,
    nContSubruns,
  )

  const totalPkgs  = items.length
  const firmePkgs  = items.filter(i => !i.isContingency).length
  const contPkgs   = items.filter(i =>  i.isContingency).length

  return (
    <div className="w-96 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-custom pb-1">
      {/* Resumo de Tempos */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-[#fafafa] dark:bg-slate-800 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#ebebeb] dark:bg-slate-700 border-b border-slate-200 dark:border-slate-700">
              <th className="py-1.5 px-3 text-left text-xs font-bold text-slate-700 dark:text-slate-300">Resumo de Tempos</th>
              <th className="py-1.5 px-2 text-right text-xs text-blue-700 dark:text-blue-500 whitespace-nowrap">Firme</th>
              <th className="py-1.5 px-2 text-right text-xs text-[#7d1935] dark:text-rose-400 whitespace-nowrap">Cont.</th>
              <th className="py-1.5 px-2 text-right text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">Total</th>
            </tr>
          </thead>
          <tbody>
            {phaseOrder.map(phase => {
              const g = phaseMap.get(phase)!
              const total = g.firme + g.cont
              return (
                <tr key={phase} className="border-b border-slate-200 dark:border-slate-800">
                  <td className="py-1.5 px-3 text-xs text-slate-700 dark:text-slate-400 truncate max-w-0">{phase}</td>
                  <td className="py-1.5 px-2 text-right text-xs text-[#2f5aa8] dark:text-blue-400 whitespace-nowrap">
                    {fmt(g.firme)}
                  </td>
                  <td className="py-1.5 px-2 text-right text-xs text-[#7d1935] dark:text-rose-400 whitespace-nowrap">
                    {g.cont > 0 ? fmt(g.cont) : <span className="text-slate-200 dark:text-slate-700">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {fmt(total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {phaseOrder.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-[#ebebeb] dark:bg-slate-700">
                <td className="py-1.5 px-3 text-xs font-bold text-slate-700 dark:text-slate-300">Total</td>
                <td className="py-1.5 px-2 text-right text-xs text-[#2f5aa8] dark:text-blue-400 whitespace-nowrap">
                  {fmt(grandFirme)}
                </td>
                <td className="py-1.5 px-2 text-right text-xs text-[#7d1935] dark:text-rose-400 whitespace-nowrap">
                  {grandCont > 0 ? fmt(grandCont) : <span className="text-slate-200 dark:text-slate-700">—</span>}
                </td>
                <td className="py-1.5 px-2 text-right text-xs text-[#0c2340] dark:text-white whitespace-nowrap">
                  {fmt(grandTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Montagens */}
      {(mounts.rows.length > 0 || mounts.hasConting) && (
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-[#fafafa] dark:bg-slate-800 overflow-hidden">
          <TechCountSection title="Montagens" rows={mounts.rows} contingTotals={mounts.contingTotals} hasConting={mounts.hasConting} />
        </div>
      )}

      {/* Corridas */}
      {(runs.rows.length > 0 || runs.hasConting) && (
        <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-[#fafafa] dark:bg-slate-800 overflow-hidden">
          <TechCountSection title="Corridas" rows={runs.rows} contingTotals={runs.contingTotals} hasConting={runs.hasConting} />
        </div>
      )}

      {/* Pacotes */}
      <div className="rounded-xl border border-slate-300 dark:border-slate-700 bg-[#fafafa] dark:bg-slate-800 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-[#ebebeb] dark:bg-slate-700">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Pacotes</p>
        </div>
        <div className="px-3 py-3 grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-700">
          <div className="text-center pr-3">
            <p className="text-xl text-slate-800 dark:text-slate-100">{totalPkgs}</p>
            <p className="text-xs text-slate-500 mt-0.5">Total</p>
          </div>
          <div className="text-center px-3">
            <p className="text-xl text-[#2f5aa8] dark:text-blue-400">{firmePkgs}</p>
            <p className="text-xs text-slate-500 mt-0.5">Firme</p>
          </div>
          <div className="text-center pl-3">
            <p className="text-xl text-[#7d1935] dark:text-rose-400">{contPkgs}</p>
            <p className="text-xs text-slate-500 mt-0.5">Cont.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function PackageList({ items, showHours, overrideActive, onDurationChange }: {
  items: ScheduleItem[]
  showHours: boolean
  overrideActive: boolean
  onDurationChange: (uid: string, dur: number) => void
}) {
  const { dispatch } = useApp()
  const fmt = (d: number) => (showHours ? (d * 24).toFixed(1) : d.toFixed(2)).replace('.', ',')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [highlightedUids, setHighlightedUids] = useState<Set<string>>(new Set())
  const prevItemsRef = useRef<ScheduleItem[]>(items)
  const containerRef = useRef<HTMLDivElement>(null)
  const [findQuery, setFindQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [activeMatchUid, setActiveMatchUid] = useState<string | null>(null)
  const dragUidRef = useRef<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ uid: string; x: number; y: number } | null>(null)
  const [pickerAfterUid, setPickerAfterUid] = useState<string | null | 'NONE'>('NONE')

  const handleRowDrop = (targetUid: string) => {
    const dragUid = dragUidRef.current
    dragUidRef.current = null
    if (!dragUid || dragUid === targetUid) return
    const cur = [...items]
    const fromIdx = cur.findIndex(i => i.uid === dragUid)
    if (fromIdx === -1) return
    const [moved] = cur.splice(fromIdx, 1)
    const toIdx = cur.findIndex(i => i.uid === targetUid)
    if (toIdx === -1) return
    cur.splice(toIdx, 0, moved)
    dispatch({ type: 'REORDER_SCHEDULE', items: cur })
  }

  const prevUid = (uid: string): string | null => {
    const idx = items.findIndex(i => i.uid === uid)
    return idx > 0 ? items[idx - 1].uid : null
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const matches = useMemo(() => {
    const q = normalizeFind(findQuery.trim())
    if (!q) return [] as string[]
    return items
      .filter(i => normalizeFind(i.packageName).includes(q) || normalizeFind(i.packageId).includes(q))
      .map(i => i.uid)
  }, [items, findQuery])

  const uidToSectionKey = useMemo(() => {
    const m = new Map<string, string>()
    let lp = ''
    const cnt = new Map<string, number>()
    for (const item of items) {
      if (item.phase !== lp) {
        lp = item.phase
        cnt.set(item.phase, (cnt.get(item.phase) ?? -1) + 1)
      }
      m.set(item.uid, `${item.phase}-${cnt.get(item.phase) ?? 0}`)
    }
    return m
  }, [items])

  const gotoMatch = (idx: number) => {
    if (matches.length === 0) return
    const n = ((idx % matches.length) + matches.length) % matches.length
    setMatchIdx(n)
    setActiveMatchUid(matches[n])
    const key = uidToSectionKey.get(matches[n])
    if (key) setCollapsedPhases(prev => { const next = new Set(prev); next.delete(key); return next })
  }

  useEffect(() => {
    if (matches.length === 0) { setActiveMatchUid(null); setMatchIdx(0); return }
    setMatchIdx(0)
    setActiveMatchUid(matches[0])
    const key = uidToSectionKey.get(matches[0])
    if (key) setCollapsedPhases(prev => { const next = new Set(prev); next.delete(key); return next })
  }, [findQuery])

  useEffect(() => {
    if (!activeMatchUid || !containerRef.current) return
    const el = containerRef.current.querySelector(`[data-uid="${activeMatchUid}"]`) as HTMLElement | null
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeMatchUid])

  const togglePhase = (phase: string) => setCollapsedPhases(prev => {
    const next = new Set(prev)
    next.has(phase) ? next.delete(phase) : next.add(phase)
    return next
  })

  // Detectar pacotes incluídos e realçar apenas eles
  useEffect(() => {
    const prev = prevItemsRef.current
    // Avança o baseline imediatamente: cada edição compara contra o schedule
    // anterior, não contra um baseline obsoleto (evita realce acumulado).
    prevItemsRef.current = items
    const included = new Set<string>()

    // Diff por subsequência comum máxima (LCS) sobre a sequência de
    // (packageId|fase). O LCS identifica o "esqueleto" de pacotes inalterados
    // (presentes em ambos, na mesma ordem); tudo no novo schedule fora desse
    // esqueleto é uma inserção genuína, na posição correta. Diferente da contagem
    // por multiconjunto, isto realça a instância realmente inserida — e não uma
    // ocorrência idêntica distante — o que importa para os pacotes de montagem/
    // desmontagem de tecnologia (arame/perfilagem/FT), altamente repetitivos.
    const keyOf = (i: ScheduleItem) => `${i.packageId}|${i.phase}`
    const a = prev.map(keyOf)
    const b = items.map(keyOf)
    const n = a.length, m = b.length

    // Tabela DP de LCS (comprimentos do sufixo). O(n·m) — schedules têm dezenas
    // de itens, custo desprezível.
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }

    // Backtrack: marca os índices de `items` que pertencem ao LCS (inalterados).
    const matchedNew = new Set<number>()
    let i = 0, j = 0
    while (i < n && j < m) {
      if (a[i] === b[j]) { matchedNew.add(j); i++; j++ }
      else if (dp[i + 1][j] >= dp[i][j + 1]) i++
      else j++
    }

    // Itens fora do LCS = inseridos por esta edição.
    for (let k = 0; k < items.length; k++) {
      if (!matchedNew.has(k)) included.add(items[k].uid)
    }

    if (included.size > 0) {
      setHighlightedUids(included)

      // Expandir as fases dos incluídos
      const includedPhases = new Set<string>()
      for (const item of items) {
        if (included.has(item.uid)) includedPhases.add(item.phase)
      }
      setCollapsedPhases(prev => {
        const next = new Set(prev)
        includedPhases.forEach(p => next.delete(p))
        return next
      })

      // Scroll para o primeiro incluído no topo da tela
      setTimeout(() => {
        if (containerRef.current) {
          const row = Array.from(containerRef.current.querySelectorAll('tr')).find(tr => {
            const uid = tr.getAttribute('data-uid')
            return uid && included.has(uid)
          })
          if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
      }, 0)
    } else {
      // Resetar realces se não houver novos pacotes
      setHighlightedUids(new Set())
    }
  }, [items])

  // Listener para ESC limpar o realce
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHighlightedUids(new Set())
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  type Section = { phase: string; sectionKey: string; items: ScheduleItem[] }
  const sections: Section[] = []
  {
    let lp = ''
    const cnt = new Map<string, number>()
    for (const item of items) {
      if (item.phase !== lp) {
        lp = item.phase
        cnt.set(item.phase, (cnt.get(item.phase) ?? -1) + 1)
        sections.push({ phase: item.phase, sectionKey: `${item.phase}-${cnt.get(item.phase) ?? 0}`, items: [] })
      }
      sections[sections.length - 1].items.push(item)
    }
  }
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-slate-300 dark:border-slate-700 overflow-hidden flex flex-col">
      {/* Único container scrollável com thead sticky — garante alinhamento perfeito */}
      <div ref={containerRef} className="overflow-y-scroll flex-1 bg-[#f5f5f5] dark:bg-slate-900 scrollbar-custom">
      <table className="table-fixed w-full text-xs border-separate border-spacing-0">
          <colgroup>
            <col style={{ width: '2rem' }} />
            <col style={{ width: '5rem' }} />
            <col style={{ width: '3.5rem' }} />
            <col />
            <col style={{ width: '3rem' }} />
            <col style={{ width: '3rem' }} />
            <col style={{ width: '4rem' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#005889] dark:bg-[#0c2340] border-b-2 border-[#004070] dark:border-slate-700">
              <th className="text-left py-1.5 px-3 text-xs font-bold text-white dark:text-slate-300 whitespace-nowrap">#</th>
              <th className="text-left py-1.5 px-3 text-xs font-bold text-white dark:text-slate-300 whitespace-nowrap">Pacote</th>
              <th className="py-1.5 px-2 text-xs font-bold text-white dark:text-slate-300 whitespace-nowrap">Tipo</th>
              <th className="text-left py-1.5 px-3 text-xs font-bold text-white dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <span>Descrição</span>
                  <div className="flex items-center gap-1 ml-auto rounded px-1.5 py-1 bg-[#004070]/60 dark:bg-slate-800/60 focus-within:bg-[#003560]/80">
                    <Search size={11} className="shrink-0 text-white/50" />
                    <input
                      value={findQuery}
                      onChange={e => setFindQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? matchIdx - 1 : matchIdx + 1) }
                        else if (e.key === 'Escape') { e.preventDefault(); setFindQuery('') }
                      }}
                      placeholder="Localizar..."
                      className="w-28 bg-transparent text-xs text-white placeholder:text-white/40 outline-none font-normal"
                    />
                    {findQuery && (
                      <>
                        <span className="shrink-0 text-[10px] font-mono tabular-nums text-white/60">
                          {matches.length ? `${matchIdx + 1}/${matches.length}` : '0/0'}
                        </span>
                        <button onClick={() => gotoMatch(matchIdx - 1)} disabled={!matches.length} title="Anterior (Shift+Enter)"
                          className="shrink-0 text-white/60 hover:text-white disabled:opacity-30 transition-colors">
                          <ChevronUp size={12} />
                        </button>
                        <button onClick={() => gotoMatch(matchIdx + 1)} disabled={!matches.length} title="Próximo (Enter)"
                          className="shrink-0 text-white/60 hover:text-white disabled:opacity-30 transition-colors">
                          <ChevronDown size={12} />
                        </button>
                        <button onClick={() => setFindQuery('')} title="Limpar (Esc)"
                          className="shrink-0 text-white/60 hover:text-white transition-colors">
                          <X size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </th>
              <th className="text-right py-1.5 px-3 text-xs font-bold text-blue-200 dark:text-blue-400 whitespace-nowrap">F</th>
              <th className="text-right py-1.5 px-3 text-xs font-bold text-rose-300 dark:text-rose-400 whitespace-nowrap">C</th>
              <th className="text-right py-1.5 px-3 text-xs font-bold text-white dark:text-slate-300 whitespace-nowrap">Total</th>
            </tr>
          </thead>
        <tbody>
          {(() => {
            let rowNum = 0
            return sections.map(({ phase, sectionKey, items: sItems }) => {
              const isCollapsed = collapsedPhases.has(sectionKey)
              return (
                <React.Fragment key={sectionKey}>
                  {/* Cabeçalho da fase */}
                  <tr onClick={() => togglePhase(sectionKey)} className="cursor-pointer select-none">
                    <td colSpan={7} className="py-2 px-3 bg-[#ebebeb] dark:bg-slate-800 border-y border-slate-300 dark:border-slate-700">
                      <span className="flex items-center gap-1.5">
                        <span className="font-bold text-xs leading-none text-slate-600 dark:text-slate-400">
                          {isCollapsed ? '+' : '−'}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          {phase}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {/* Linhas de itens */}
                  {!isCollapsed && sItems.map(item => {
                    rowNum++
                    const rn = rowNum
                    const rowBorder = 'border-b border-slate-200 dark:border-slate-800'
                    const isMatch = findQuery.trim() && matches.includes(item.uid)
                    const isActive = item.uid === activeMatchUid
                    const rowBg = highlightedUids.has(item.uid) ? 'bg-blue-100 dark:bg-blue-900/50' : isMatch ? 'bg-sky-50 dark:bg-sky-900/20' : ''
                    return (
                      <React.Fragment key={item.uid}>
                        <tr
                          data-uid={item.uid}
                          draggable={overrideActive}
                          onDragStart={overrideActive ? e => { dragUidRef.current = item.uid; e.dataTransfer.effectAllowed = 'move' } : undefined}
                          onDragOver={overrideActive ? e => e.preventDefault() : undefined}
                          onDrop={overrideActive ? e => { e.preventDefault(); handleRowDrop(item.uid) } : undefined}
                          onContextMenu={overrideActive ? e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ uid: item.uid, x: e.clientX, y: e.clientY }) } : undefined}
                          className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${rowBg} ${isActive ? 'outline outline-2 -outline-offset-2 outline-sky-500 dark:outline-sky-400' : ''} ${overrideActive ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                          <td className={`py-2 px-3 text-xs ${rowBorder} ${item.isContingency ? 'text-[#7d1935]/50 dark:text-rose-400/40' : 'text-slate-500 dark:text-slate-600'}`}>
                            {overrideActive
                              ? <GripVertical size={12} className="text-slate-400 dark:text-slate-600" />
                              : rn}
                          </td>
                          <td className={`py-2 px-3 whitespace-nowrap ${rowBorder}`}>
                            <span className={`text-xs font-medium ${item.isContingency ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}>{item.packageId}</span>
                          </td>
                          <td className={`py-2 px-2 text-center ${rowBorder}`}>
                            {item.isContingency ? (
                              <span className="text-xs font-bold px-1 py-0.5 rounded bg-[#7d1935]/10 dark:bg-rose-900/40 text-[#7d1935] dark:text-rose-400">C</span>
                            ) : (
                              <span className="text-xs font-bold text-[#005889] dark:text-blue-400">F</span>
                            )}
                          </td>
                          <td className={`py-2 px-3 text-xs ${rowBorder} ${item.isContingency ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}>
                            {item.packageName}
                          </td>
                          <td className={`py-2 px-3 text-right w-12 ${rowBorder}`}>
                            {item.isContingency
                              ? <span className="text-xs text-[#7d1935]/40 dark:text-rose-400/30 select-none">—</span>
                              : <span className="text-xs text-[#0c2340] dark:text-blue-400">{fmt(item.duration)}</span>
                            }
                          </td>
                          <td className={`py-2 px-3 text-right w-12 ${rowBorder}`}>
                            {item.isContingency
                              ? <span className="text-xs text-[#7d1935] dark:text-rose-400">{fmt(item.duration)}</span>
                              : <span className="text-xs text-slate-200 dark:text-slate-700 select-none">—</span>
                            }
                          </td>
                          <td className={`py-2 px-3 text-right w-16 ${rowBorder}`}>
                            <DurationCell
                              days={item.duration}
                              showHours={showHours}
                              isContingency={item.isContingency}
                              onChange={d => onDurationChange(item.uid, d)}
                            />
                          </td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                </React.Fragment>
              )
            })
          })()}
        </tbody>
        <tfoot>
          {(() => {
            const firmeTotal = items.filter(i => !i.isContingency).reduce((a, i) => a + i.duration, 0)
            const fullTotal  = items.reduce((a, i) => a + i.duration, 0)
            return (
              <tr className="bg-[#ebebeb] dark:bg-slate-800">
                <td colSpan={4} className="py-1.5 px-3 text-xs font-bold text-slate-700 dark:text-slate-400 text-right border-t-2 border-slate-300 dark:border-slate-700">
                  Total
                </td>
                <td className="py-1.5 px-3 text-right text-xs text-[#0c2340] dark:text-blue-400 border-t-2 border-slate-300 dark:border-slate-700">
                  {fmt(firmeTotal)}
                </td>
                <td className="py-1.5 px-3 text-right text-xs text-[#7d1935] dark:text-rose-400 border-t-2 border-slate-300 dark:border-slate-700">
                  {fmt(fullTotal - firmeTotal)}
                </td>
                <td className="py-1.5 px-3 text-right text-xs text-[#0c2340] dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                  {fmt(fullTotal)}
                </td>
              </tr>
            )
          })()}
        </tfoot>
      </table>
      </div>

      {contextMenu && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-50 min-w-[180px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-2xl py-1 flex flex-col">
          <button
            onClick={() => { setPickerAfterUid(prevUid(contextMenu.uid)); setContextMenu(null) }}
            className="text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            ↑ Inserir pacote acima
          </button>
          <button
            onClick={() => { setPickerAfterUid(contextMenu.uid); setContextMenu(null) }}
            className="text-left px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            ↓ Inserir pacote abaixo
          </button>
          <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
          <button
            onClick={() => { dispatch({ type: 'REMOVE_SCHEDULE_ITEM', uid: contextMenu.uid }); setContextMenu(null) }}
            className="text-left px-3 py-1.5 text-xs text-[#7d1935] dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors">
            ✕ Excluir pacote
          </button>
        </div>
      )}

      {pickerAfterUid !== 'NONE' && (
        <SchedulePackagePickerModal afterUid={pickerAfterUid} onClose={() => setPickerAfterUid('NONE')} />
      )}
    </div>
  )
}

function SchedulePackagePickerModal({ afterUid, onClose }: { afterUid: string | null; onClose: () => void }) {
  const { dispatch } = useApp()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const allPackages = useMemo(() => Object.values(getAllPackages()), [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allPackages
    return allPackages.filter(p =>
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
  }, [allPackages, query])

  const grouped = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, typeof filtered>()
    for (const p of filtered) {
      if (!map.has(p.category)) { order.push(p.category); map.set(p.category, []) }
      map.get(p.category)!.push(p)
    }
    return order.map(cat => ({ category: cat, items: map.get(cat)! }))
  }, [filtered])

  const pickPackage = (packageId: string) => {
    dispatch({ type: 'INSERT_SCHEDULE_PKG', afterUid, packageId })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#f5f5f5] dark:bg-slate-900 rounded-xl shadow-2xl w-[min(720px,92vw)] max-h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide" style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", letterSpacing: '0.1em' }}>
              Inserir pacote
            </span>
            <span className="text-xs text-slate-600 dark:text-slate-500">{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</span>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 bg-[#fafafa] dark:bg-slate-800 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700 focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors">
            <Search size={14} className="text-slate-600 dark:text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por ID, nome ou categoria..."
              className="flex-1 bg-transparent text-sm text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-600 dark:placeholder:text-slate-700"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-600 hover:text-slate-600 dark:hover:text-slate-500 shrink-0">
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-custom px-2 py-2">
          {grouped.length === 0 ? (
            <div className="text-center text-xs text-slate-600 dark:text-slate-500 py-8">Nenhum pacote encontrado.</div>
          ) : grouped.map(({ category, items }) => (
            <div key={category} className="mb-3">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest sticky top-0 bg-[#f5f5f5] dark:bg-slate-900 z-10">
                {category}
              </div>
              {items.map(pkg => (
                <button
                  key={pkg.id}
                  onClick={() => pickPackage(pkg.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors group">
                  <span className="text-xs font-medium text-[#2f5aa8] dark:text-blue-400 w-20 shrink-0">{pkg.id}</span>
                  <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 leading-snug">{pkg.name}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DurationCell({ days, showHours, isContingency, onChange }: {
  days: number
  showHours: boolean
  isContingency: boolean
  onChange: (days: number) => void
}) {
  const toDisplay = (d: number) => (showHours ? (d * 24).toFixed(1) : d.toFixed(2)).replace('.', ',')
  const [raw, setRaw] = useState(toDisplay(days))
  useEffect(() => { setRaw(toDisplay(days)) }, [days, showHours])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={e => {
        setRaw(e.target.value)
        const v = parseFloat(e.target.value.replace(',', '.'))
        if (!isNaN(v) && v >= 0) onChange(showHours ? v / 24 : v)
      }}
      onBlur={() => {
        const v = parseFloat(raw.replace(',', '.'))
        if (isNaN(v) || v < 0) { setRaw(toDisplay(days)); return }
        const stored = showHours ? v / 24 : v
        onChange(stored)
        setRaw(toDisplay(stored))
      }}
      className={`w-full text-right text-xs border border-transparent rounded pl-1 pr-0 py-0.5
        hover:border-slate-300 dark:hover:border-slate-600 focus:border-sky-400 focus:outline-none bg-transparent
        ${isContingency ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}
    />
  )
}

export function GanttChart({ items }: { items: ScheduleItem[] }) {
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [labelW, setLabelW] = useState(190)
  const togglePhase = (phase: string) => setCollapsedPhases(prev => {
    const next = new Set(prev)
    next.has(phase) ? next.delete(phase) : next.add(phase)
    return next
  })

  const startLabelResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const startX = e.clientX
    const startW = labelW
    const onMove = (pe: PointerEvent) => {
      const dx = pe.clientX - startX
      setLabelW(Math.max(120, Math.min(480, startW + dx)))
    }
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const total = items.reduce((a, i) => a + i.duration, 0)
  if (total === 0) return null

  type GanttSection = { phase: string; sectionKey: string; sectionItems: ScheduleItem[] }
  const sections: GanttSection[] = []
  {
    let lp = ''
    const cnt = new Map<string, number>()
    for (const item of items) {
      if (item.phase !== lp) {
        lp = item.phase
        cnt.set(item.phase, (cnt.get(item.phase) ?? -1) + 1)
        sections.push({ phase: item.phase, sectionKey: `${item.phase}-${cnt.get(item.phase)}`, sectionItems: [] })
      }
      sections[sections.length - 1].sectionItems.push(item)
    }
  }

  return (
    <div className="flex-1 overflow-auto rounded-xl border border-slate-300 dark:border-slate-700 bg-[#f5f5f5] dark:bg-slate-900 p-4 scrollbar-custom">
      <div style={{ minWidth: 720 }}>
        {/* Header — mesmas cores do cabeçalho do cronograma */}
        <div className="flex items-center rounded-lg bg-[#005889] dark:bg-[#0c2340] mb-3">
          <div className="flex items-center shrink-0" style={{ width: labelW }}>
            <div className="flex-1 text-xs font-bold text-white dark:text-slate-300 uppercase tracking-wider py-2 pl-2">
              Fase / Operação
            </div>
            <div onPointerDown={startLabelResize}
              className="shrink-0 w-2 self-stretch cursor-col-resize group flex items-center justify-center select-none"
              title="Arrastar para redimensionar">
              <div className="w-px h-full bg-white/20 group-hover:bg-white/60 transition-colors" />
            </div>
          </div>
          <div className="flex-1 relative h-full py-2 pr-2">
            {[0, 25, 50, 75, 100].map(p => (
              <div key={p} style={{ left: `${p}%` }}
                className="absolute top-2 text-xs text-white/80 dark:text-slate-300 font-mono -translate-x-1/2">
                {(total * p / 100).toFixed(0)}d
              </div>
            ))}
          </div>
        </div>

        {sections.map(({ phase, sectionKey, sectionItems: phaseItems }) => {
          const phaseStart = phaseItems[0]?.startDay ?? 0
          const phaseEnd = phaseItems[phaseItems.length - 1]?.endDay ?? 0

          return (
            <div key={sectionKey} className="mb-5">
              <div className="flex items-center mb-1.5 cursor-pointer select-none" onClick={() => togglePhase(sectionKey)}>
                <div style={{ width: labelW, fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
                  className="text-xs font-bold px-2 py-1 rounded-l uppercase tracking-widest bg-[#ebebeb] dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0 flex items-center gap-1.5">
                  <span className="font-bold text-sm leading-none">{collapsedPhases.has(sectionKey) ? '+' : '−'}</span>
                  {phase}
                </div>
                <div className="flex-1 h-5 bg-[#fafafa] dark:bg-slate-800 rounded-r relative overflow-hidden">
                  <div
                    className="absolute top-0 h-full bg-slate-400 dark:bg-slate-500 opacity-20 rounded"
                    style={{ left: `${(phaseStart / total) * 100}%`, width: `${((phaseEnd - phaseStart) / total) * 100}%` }}
                  />
                </div>
              </div>

              {!collapsedPhases.has(sectionKey) && phaseItems.map(item => (
                <div key={item.uid} className="flex items-center mb-0.5 group">
                  <div style={{ width: labelW }}
                    className="text-xs text-slate-700 dark:text-slate-400 truncate pr-2 shrink-0 pl-3 flex items-center gap-1"
                    title={item.packageName}>
                    {item.isContingency && <span className="text-rose-400 dark:text-rose-400 text-xs shrink-0">⚠</span>}
                    <span className="truncate text-xs">
                      {item.packageName.includes(' - ')
                        ? item.packageName.split(' - ').slice(1).join(' ')
                        : item.packageName}
                    </span>
                  </div>
                  <div className="flex-1 h-4 relative">
                    <div
                      className={`absolute top-0 h-3.5 rounded
                        ${item.isContingency
                          ? 'border-2 border-dashed border-rose-400 dark:border-rose-500 bg-rose-50 dark:bg-rose-950/50'
                          : GANTT_BAR}`}
                      style={{
                        left: `${(item.startDay / total) * 100}%`,
                        width: `${Math.max((item.duration / total) * 100, 0.5)}%`,
                        minWidth: 2,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
