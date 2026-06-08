import { useState, useEffect, useRef } from 'react'
import React from 'react'
import { useApp } from '../context/AppContext'
import type { ScheduleItem, WizardInputs } from '../types'
import { getPackage, getDuration, PACKAGE_ALTERNATES, FLUID_VARIANT, PACKAGES } from '../data/packages'
import { recomputeTransitions } from '../engines/sequenceEngine'
import { Save, Sliders } from 'lucide-react'
import { buildProjectFile, downloadProject } from '../utils/projectFile'
import { CloudSaveButton } from './CloudSaveButton'

const MOUNT_IDS = new Set(Object.values(PACKAGES).filter(p => p.isMountOp).map(p => p.id))
const TRACKED_MOUNT_TECHS = ['wireline', 'electric', 'ct'] as const
const MOUNT_TECH_LABELS: Record<string, string> = { wireline: 'Arame', electric: 'Perfil', ct: 'FT' }
const CONTING_TEXT = 'text-[#7d1935] dark:text-rose-400'

const CSB_MECH_PKGS = new Set([
  'ABAN 038', 'ABAN 039', 'ABAN 040', 'ABAN 041', 'ABAN 042',
  'ABAN 127', 'ABAN 128', 'ABAN 129', 'ABAN 130', 'ABAN 131',
  'ABAN 237',
])

const PHASE_COLORS: Record<string, { bg: string; text: string; bar: string; stripe: string }> = {
  'Mobilização':    { bg: 'bg-slate-100 dark:bg-slate-800',   text: 'text-slate-600 dark:text-slate-300',  bar: 'bg-slate-400',  stripe: '#94a3b8' },
  'Fase 0':         { bg: 'bg-slate-50 dark:bg-slate-950/40', text: 'text-slate-700 dark:text-slate-400',  bar: 'bg-slate-600',  stripe: '#64748b' },
  'Fase 1A':        { bg: 'bg-sky-50 dark:bg-sky-950/40',     text: 'text-sky-800 dark:text-sky-400',      bar: 'bg-sky-600',    stripe: '#0284c7' },
  'Fase 1B':        { bg: 'bg-cyan-50 dark:bg-cyan-950/40',   text: 'text-cyan-800 dark:text-cyan-400',    bar: 'bg-cyan-500',   stripe: '#06b6d4' },
  'Fase 2':         { bg: 'bg-teal-50 dark:bg-teal-950/40',   text: 'text-teal-800 dark:text-teal-400',    bar: 'bg-teal-500',   stripe: '#14b8a6' },
  'Extra Abandono': { bg: 'bg-violet-50 dark:bg-violet-950/40', text: 'text-violet-800 dark:text-violet-400', bar: 'bg-violet-500', stripe: '#8b5cf6' },
  'Desmobilização': { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300', bar: 'bg-slate-400', stripe: '#94a3b8' },
}

type TechBadgeEntry = { bg: string; text: string; label: string }
const TECH_BADGE: Record<string, TechBadgeEntry> = {
  wireline:   { bg: 'bg-blue-100 dark:bg-blue-950',     text: 'text-blue-700 dark:text-blue-300',   label: 'SL' },
  ct:         { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300', label: 'FT' },
  electric:   { bg: 'bg-green-100 dark:bg-green-950',   text: 'text-green-700 dark:text-green-300',  label: 'WL' },
  workstring: { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300', label: 'Coluna' },
  bop:        { bg: 'bg-rose-100 dark:bg-rose-950',     text: 'text-rose-700 dark:text-rose-300',    label: 'BOP' },
  none:       { bg: '',              text: '',                 label: '' },
}


export function ScheduleView() {
  const { state, dispatch } = useApp()
  const { schedule } = state

  const total = schedule.reduce((a, i) => a + i.duration, 0)
  const pct: number = state.inputs.percentile ?? 75
  const showHours = state.showHours
  const unit = showHours ? 'h' : 'd'
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)

  const handleSwap = (uid: string, newPkgId: string) => {
    const newPkg = getPackage(newPkgId)
    if (!newPkg) return
    const updated = state.schedule.map(item =>
      item.uid === uid ? {
        ...item,
        packageId: newPkgId,
        packageName: newPkg.name,
        technology: newPkg.technology,
        duration: getDuration(newPkgId, pct),
      } : item
    )
    const recomputed = recomputeTransitions(
      updated,
      state.inputs.rigType as 'ANC' | 'DP',
      state.inputs.operationType as 'Generalista' | 'LWO',
      pct,
      state.inputs.scopeId,
    )
    dispatch({ type: 'UPDATE_SCHEDULE', schedule: recomputed })

    // Sync CSB inputs when swapping an eCSB mecânico element
    const swappedItem = state.schedule.find(s => s.uid === uid)
    if (swappedItem && FLUID_VARIANT[swappedItem.packageId]?.heading === 'Trocar eCSB mecânico') {
      const itemIdx = state.schedule.findIndex(s => s.uid === uid)
      const priorCsbCount = state.schedule.slice(0, itemIdx).filter(s => CSB_MECH_PKGS.has(s.packageId)).length
      const isTae = newPkgId === 'ABAN 237'
      const isSTV = ['ABAN 038', 'ABAN 039', 'ABAN 130', 'ABAN 131'].includes(newPkgId)
      if (state.inputs.scopeId === 'FS1_Mec') {
        if (priorCsbCount >= 1) {
          dispatch({ type: 'UPDATE_INPUTS', inputs: { fs1CsbSecondary: isTae ? 'tae' : 'plug_th' } })
        } else {
          dispatch({ type: 'UPDATE_INPUTS', inputs: {
            fs1CsbPrimary: isTae ? 'tae' : isSTV ? 'stdv' : 'plug',
            fs1CsbAlreadyInstalled: false,
          } })
        }
      } else {
        dispatch({ type: 'UPDATE_INPUTS', inputs: { csbPrimary: isTae ? 'tae' : isSTV ? 'stdv' : 'plug' } })
      }
    }
  }

  const handleSave = () => {
    const wn = state.wellName || 'projeto'
    downloadProject(buildProjectFile(wn, state.inputs as WizardInputs, state.schedule))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 md:mb-5 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0">
              <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif" }}
                className="text-xl md:text-2xl font-bold text-[#0c2340] dark:text-white uppercase tracking-wide truncate max-w-[14rem] md:max-w-sm">
                {state.wellName || 'Cronograma Gerado'}
              </h2>
              <p className="text-xs text-slate-600 font-mono mt-0.5">
                {schedule.length} pacotes · {fmt(total)} {unit} · P{pct}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 items-center">
            <button
              onClick={handleSave}
              title="Salvar projeto como arquivo"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500 bg-slate-100 dark:bg-slate-800">
              <Save size={14} /> Salvar
            </button>
            <CloudSaveButton />
            <div className="flex h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600">
              <button
                onClick={() => showHours && dispatch({ type: 'TOGGLE_HOURS' })}
                className={`flex items-center px-2.5 text-xs font-bold transition-colors ${!showHours ? 'bg-[#0c2340] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                d
              </button>
              <button
                onClick={() => !showHours && dispatch({ type: 'TOGGLE_HOURS' })}
                className={`flex items-center px-2.5 text-xs font-bold transition-colors ${showHours ? 'bg-[#0c2340] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                h
              </button>
            </div>
            <button
              onClick={() => dispatch({ type: 'ENTER_FINE_TUNING' })}
              className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: '#d97706' }}>
              <Sliders size={14} /> Ir para Detalhamento do cronograma
            </button>
          </div>
        </div>

      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        <PackageList items={schedule} showHours={showHours}
          onDurationChange={(uid, dur) => dispatch({ type: 'UPDATE_ITEM_DURATION', uid, duration: dur })}
          onSwap={handleSwap} />
        <ScheduleStatsPanel items={schedule} showHours={showHours} />
      </div>
    </div>
  )
}

function buildTechRows(
  schedule: ScheduleItem[],
  phases: string[],
  matches: (i: ScheduleItem) => boolean,
) {
  const rows = phases.map(phase => {
    const counts = Object.fromEntries(
      TRACKED_MOUNT_TECHS.map(tech => [
        tech,
        schedule.filter(i => i.phase === phase && i.technology === tech && !i.isContingency && matches(i)).length,
      ])
    ) as Record<string, number>
    return { phase, counts }
  }).filter(row => TRACKED_MOUNT_TECHS.some(t => row.counts[t] > 0))
  const contingTotals = Object.fromEntries(
    TRACKED_MOUNT_TECHS.map(tech => [
      tech,
      schedule.filter(i => i.technology === tech && i.isContingency && matches(i)).length,
    ])
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
    <div className="px-3 pb-3">
      <p className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest pt-3 pb-2 border-t border-slate-100 dark:border-slate-700">{title}</p>
      <div className="grid grid-cols-4 gap-x-1 mb-1">
        <span className="col-span-1" />
        {TRACKED_MOUNT_TECHS.map(t => (
          <span key={t} className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase text-center">{MOUNT_TECH_LABELS[t]}</span>
        ))}
      </div>
      {rows.map(({ phase, counts }) => (
        <div key={phase} className="grid grid-cols-4 gap-x-1 py-1 border-t border-slate-50 dark:border-slate-800/60">
          <span className="text-[10px] text-slate-700 dark:text-slate-400 truncate col-span-1">{phase}</span>
          {TRACKED_MOUNT_TECHS.map(t => (
            <span key={t} className={`text-xs font-mono text-center font-semibold ${counts[t] > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-200 dark:text-slate-700'}`}>
              {counts[t] > 0 ? counts[t] : '—'}
            </span>
          ))}
        </div>
      ))}
      {hasConting && (
        <div className="grid grid-cols-4 gap-x-1 py-1 mt-1 border-t border-slate-100 dark:border-slate-800/60">
          <span className={`text-[10px] font-semibold ${CONTING_TEXT} truncate col-span-1`}>Conting.</span>
          {TRACKED_MOUNT_TECHS.map(t => (
            <span key={t} className={`text-xs font-mono text-center font-semibold ${contingTotals[t] > 0 ? CONTING_TEXT : 'text-slate-200 dark:text-slate-700'}`}>
              {contingTotals[t] > 0 ? contingTotals[t] : '—'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ScheduleStatsPanel({ items, showHours }: { items: ScheduleItem[]; showHours: boolean }) {
  const unit = showHours ? 'h' : 'd'
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)

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
  const mounts = buildTechRows(items, phases, i => MOUNT_IDS.has(i.packageId))

  return (
    <div className="w-96 shrink-0 flex flex-col gap-3 overflow-y-auto scrollbar-custom pb-1">
      {/* Resumo de Tempos */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Resumo de Tempos</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
              <th className="py-1.5 px-2 text-left text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider"></th>
              <th className="py-1.5 px-2 text-right text-[9px] font-bold text-blue-400 dark:text-blue-500 uppercase tracking-wider">Firme</th>
              <th className="py-1.5 px-2 text-right text-[9px] font-bold text-[#7d1935] dark:text-rose-400 uppercase tracking-wider">Cont.</th>
              <th className="py-1.5 px-2 text-right text-[9px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody>
            {phaseOrder.map(phase => {
              const g = phaseMap.get(phase)!
              const total = g.firme + g.cont
              const colors = PHASE_COLORS[phase] ?? PHASE_COLORS['Mobilização']
              return (
                <React.Fragment key={phase}>
                  <tr className={`${colors.bg} border-y border-slate-100 dark:border-slate-800`}>
                    <td colSpan={4} className={`py-1 px-2 text-[9px] font-bold uppercase tracking-widest ${colors.text}`}
                      style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
                      {phase}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 px-2" />
                    <td className="py-1.5 px-2 text-right font-mono text-xs font-bold text-[#2f5aa8] dark:text-blue-400">
                      {fmt(g.firme)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs font-bold text-[#7d1935] dark:text-rose-400">
                      {g.cont > 0
                        ? <>{fmt(g.cont)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span></>
                        : <span className="text-slate-200 dark:text-slate-700">—</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {fmt(total)}<span className="text-slate-600 dark:text-slate-500 font-normal text-[9px] ml-0.5">{unit}</span>
                    </td>
                  </tr>
                </React.Fragment>
              )
            })}
          </tbody>
          {phaseOrder.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/50">
                <td className="py-2 px-2 text-[10px] font-bold text-slate-700 dark:text-slate-400 uppercase tracking-wider">Total</td>
                <td className="py-2 px-2 text-right font-mono text-sm font-bold text-[#2f5aa8] dark:text-blue-400">
                  {fmt(grandFirme)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span>
                </td>
                <td className="py-2 px-2 text-right font-mono text-sm font-bold text-[#7d1935] dark:text-rose-400">
                  {grandCont > 0
                    ? <>{fmt(grandCont)}<span className="text-slate-500 dark:text-slate-600 font-normal text-[9px] ml-0.5">{unit}</span></>
                    : <span className="text-slate-200 dark:text-slate-700 text-xs">—</span>}
                </td>
                <td className="py-2 px-2 text-right font-mono text-sm font-bold text-[#0c2340] dark:text-white">
                  {fmt(grandTotal)}<span className="text-slate-700 dark:text-slate-400 font-normal text-[9px] ml-0.5">{unit}</span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Montagens */}
      {(mounts.rows.length > 0 || mounts.hasConting) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
          <TechCountSection title="Montagens" rows={mounts.rows} contingTotals={mounts.contingTotals} hasConting={mounts.hasConting} />
        </div>
      )}
    </div>
  )
}

function PackageList({ items, showHours, onDurationChange, onSwap }: {
  items: ScheduleItem[]
  showHours: boolean
  onDurationChange: (uid: string, dur: number) => void
  onSwap: (uid: string, newPkgId: string) => void
}) {
  const unit = showHours ? 'h' : 'd'
  const fmt = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)
  const [swappingUid, setSwappingUid] = useState<string | null>(null)
  const [fluidUid, setFluidUid] = useState<string | null>(null)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const [highlightedUids, setHighlightedUids] = useState<Set<string>>(new Set())
  const pickerRef = useRef<HTMLDivElement>(null)
  const fluidPickerRef = useRef<HTMLDivElement>(null)
  const prevItemsRef = useRef<ScheduleItem[]>(items)
  const containerRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!swappingUid) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setSwappingUid(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [swappingUid])

  useEffect(() => {
    if (!fluidUid) return
    const onDown = (e: MouseEvent) => {
      if (fluidPickerRef.current && !fluidPickerRef.current.contains(e.target as Node)) setFluidUid(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [fluidUid])

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
    <div ref={containerRef} className="overflow-auto flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 scrollbar-custom">
      <table className="w-full min-w-[660px] text-sm border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <th className="text-left py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider w-10">#</th>
            <th className="text-left py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider w-24">Pacote</th>
            <th className="py-2.5 px-2 text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider w-12">Tech</th>
            <th className="py-2.5 px-2 text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider w-14">Tipo</th>
            <th className="text-left py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Descrição</th>
            <th className="text-right py-2.5 px-3 text-xs font-bold text-blue-400 dark:text-blue-500 uppercase tracking-wider w-20">Firme (<span className="normal-case">{unit}</span>)</th>
            <th className="text-right py-2.5 px-3 text-xs font-bold text-[#7d1935] dark:text-rose-400 uppercase tracking-wider w-20">Cont. (<span className="normal-case">{unit}</span>)</th>
            <th className="text-right py-2.5 px-3 text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider w-20">Total (<span className="normal-case">{unit}</span>)</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            let rowNum = 0
            return sections.map(({ phase, sectionKey, items: sItems }) => {
              const colors = PHASE_COLORS[phase] ?? PHASE_COLORS['Fase 0']
              const isCollapsed = collapsedPhases.has(sectionKey)
              const secFirme = sItems.filter(i => !i.isContingency).reduce((a, i) => a + i.duration, 0)
              const secTotal = sItems.reduce((a, i) => a + i.duration, 0)
              return (
                <React.Fragment key={sectionKey}>
                  {/* Cabeçalho da fase */}
                  <tr onClick={() => togglePhase(sectionKey)} className="cursor-pointer select-none">
                    <td colSpan={8} className={`py-2 px-3 ${colors.bg} border-y border-slate-100 dark:border-slate-700`}>
                      <span className="flex items-center gap-1.5">
                        <span className={`font-bold text-sm leading-none ${colors.text}`}>
                          {isCollapsed ? '+' : '−'}
                        </span>
                        <span className={`text-xs font-bold uppercase tracking-widest ${colors.text}`}
                          style={{ fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.1em' }}>
                          {phase}
                        </span>
                      </span>
                    </td>
                  </tr>
                  {/* Linhas de itens */}
                  {!isCollapsed && sItems.map(item => {
                    rowNum++
                    const rn = rowNum
                    const tech = TECH_BADGE[item.technology]
                    const alts = PACKAGE_ALTERNATES[item.packageId] ?? []
                    const isSwapping = swappingUid === item.uid
                    return (
                      <React.Fragment key={item.uid}>
                        <tr data-uid={item.uid} className={`border-b border-slate-100 dark:border-slate-800 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60
                          ${highlightedUids.has(item.uid) ? 'bg-blue-100 dark:bg-blue-900/50' : item.autoInserted ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}>
                          <td className={`py-2 px-3 text-xs font-mono ${item.isContingency ? 'text-[#7d1935]/50 dark:text-rose-400/40' : 'text-slate-500 dark:text-slate-600'}`}>{rn}</td>
                          <td className="py-2 px-3">
                            <span className={`font-mono text-xs font-medium ${item.isContingency ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}>{item.packageId}</span>
                          </td>
                          <td className="py-2 px-2 text-center relative">
                            {tech.label && (
                              <div className="inline-block relative" ref={isSwapping ? pickerRef : undefined}>
                                <button
                                  onClick={() => alts.length > 0 && setSwappingUid(prev => prev === item.uid ? null : item.uid)}
                                  title={alts.length > 0 ? 'Clique para trocar tecnologia' : undefined}
                                  className={`text-xs px-1.5 py-0.5 rounded font-bold leading-none
                                    ${tech.bg} ${tech.text}
                                    ${alts.length > 0 ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                                  {tech.label}
                                </button>
                                {isSwapping && alts.length > 0 && (
                                  <div className="absolute z-30 left-0 top-8 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[220px]">
                                    <p className="text-xs text-slate-600 dark:text-slate-500 px-3 py-1 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 mb-1">
                                      Trocar por
                                    </p>
                                    {alts.map(altId => {
                                      const altPkg = getPackage(altId)
                                      if (!altPkg) return null
                                      const altBadge = TECH_BADGE[altPkg.technology]
                                      return (
                                        <button key={altId}
                                          onClick={() => { onSwap(item.uid, altId); setSwappingUid(null) }}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-left">
                                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold shrink-0 ${altBadge.bg} ${altBadge.text}`}>{altBadge.label}</span>
                                          <span className="text-xs text-slate-600 dark:text-slate-300 leading-tight">{altPkg.name}</span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {item.isContingency ? (
                              <span className="text-xs font-bold px-1 py-0.5 rounded bg-[#7d1935]/10 dark:bg-rose-900/40 text-[#7d1935] dark:text-rose-400">Cont.</span>
                            ) : (
                              <span className="text-xs font-bold px-1 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">Firme</span>
                            )}
                          </td>
                          <td className={`py-2 px-3 text-sm ${item.isContingency ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}>
                            {(() => {
                              const fv = FLUID_VARIANT[item.packageId]
                              if (!fv) return item.packageName
                              const fi = item.packageName.indexOf(fv.label)
                              if (fi < 0) return item.packageName
                              const before = item.packageName.slice(0, fi)
                              const after  = item.packageName.slice(fi + fv.label.length)
                              const isFluid = fluidUid === item.uid
                              return (
                                <>
                                  {before}
                                  <span className="relative inline-block" ref={isFluid ? fluidPickerRef : undefined}>
                                    <button
                                      onClick={() => setFluidUid(prev => prev === item.uid ? null : item.uid)}
                                      className="underline decoration-dotted underline-offset-2 text-teal-700 dark:text-teal-400 font-medium hover:text-teal-900 dark:hover:text-teal-300 transition-colors cursor-pointer">
                                      {fv.label}
                                    </button>
                                    {isFluid && (
                                      <div className="absolute z-30 left-0 top-5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[180px]">
                                        <p className="text-xs text-slate-600 dark:text-slate-500 px-3 py-1 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-700 mb-1">
                                          {fv.heading ?? 'Trocar fluido'}
                                        </p>
                                        {fv.alts.map(altId => {
                                          const altFv = FLUID_VARIANT[altId]
                                          if (!altFv) return null
                                          return (
                                            <button key={altId}
                                              onClick={() => { onSwap(item.uid, altId); setFluidUid(null) }}
                                              className="w-full px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 text-left text-xs text-slate-600 dark:text-slate-300">
                                              {altFv.label}
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </span>
                                  {after}
                                </>
                              )
                            })()}
                          </td>
                          <td className="py-2 px-3 text-right w-20">
                            {item.isContingency
                              ? <span className="text-xs font-mono text-[#7d1935]/40 dark:text-rose-400/30 select-none">—</span>
                              : <span className="text-sm font-mono text-[#0c2340] dark:text-blue-400">{fmt(item.duration)}</span>
                            }
                          </td>
                          <td className="py-2 px-3 text-right w-20">
                            {item.isContingency
                              ? <span className="text-sm font-mono text-[#7d1935] dark:text-rose-400">{fmt(item.duration)}</span>
                              : <span className="text-xs font-mono text-slate-200 dark:text-slate-700 select-none">—</span>
                            }
                          </td>
                          <td className="py-2 px-3 text-right w-20">
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
                  {/* Subtotal da fase */}
                  {!isCollapsed && (
                    <tr className={`${colors.bg} border-b-2 border-slate-200 dark:border-slate-600`}>
                      <td colSpan={5} className={`py-1.5 px-3 text-right text-[10px] font-bold uppercase tracking-widest ${colors.text} opacity-60`}>
                        Subtotal
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs font-bold font-mono text-blue-700 dark:text-blue-300">
                        {fmt(secFirme)} {unit}
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs font-bold font-mono text-[#7d1935] dark:text-rose-400">
                        {(secTotal - secFirme) > 0 ? `${fmt(secTotal - secFirme)} ${unit}` : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right text-xs font-bold font-mono text-slate-700 dark:text-slate-200">
                        {fmt(secTotal)} {unit}
                      </td>
                    </tr>
                  )}
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
              <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                <td colSpan={5} className="py-3 px-3 text-sm font-bold text-slate-600 dark:text-slate-400 text-right uppercase tracking-wide">
                  Total
                </td>
                <td className="py-3 px-3 text-right text-base font-bold font-mono text-[#0c2340] dark:text-blue-400">
                  {fmt(firmeTotal)} {unit}
                </td>
                <td className="py-3 px-3 text-right text-base font-bold font-mono text-[#7d1935] dark:text-rose-400">
                  {fmt(fullTotal - firmeTotal)} {unit}
                </td>
                <td className="py-3 px-3 text-right text-base font-bold font-mono text-[#0c2340] dark:text-white">
                  {fmt(fullTotal)} {unit}
                </td>
              </tr>
            )
          })()}
        </tfoot>
      </table>
    </div>
  )
}

function DurationCell({ days, showHours, isContingency, onChange }: {
  days: number
  showHours: boolean
  isContingency: boolean
  onChange: (days: number) => void
}) {
  const toDisplay = (d: number) => showHours ? (d * 24).toFixed(1) : d.toFixed(2)
  const [raw, setRaw] = useState(toDisplay(days))
  useEffect(() => { setRaw(toDisplay(days)) }, [days, showHours])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={e => {
        setRaw(e.target.value)
        const v = parseFloat(e.target.value)
        if (!isNaN(v) && v >= 0) onChange(showHours ? v / 24 : v)
      }}
      onBlur={() => {
        const v = parseFloat(raw)
        if (isNaN(v) || v < 0) { setRaw(toDisplay(days)); return }
        const stored = showHours ? v / 24 : v
        onChange(stored)
        setRaw(toDisplay(stored))
      }}
      className={`w-14 text-right text-sm font-mono border border-transparent rounded px-1 py-0.5
        hover:border-slate-300 dark:hover:border-slate-600 focus:border-sky-400 focus:outline-none bg-transparent
        ${isContingency ? 'text-[#7d1935] dark:text-rose-400' : 'text-[#0c2340] dark:text-blue-400'}`}
    />
  )
}

export function GanttChart({ items }: { items: ScheduleItem[] }) {
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())
  const togglePhase = (phase: string) => setCollapsedPhases(prev => {
    const next = new Set(prev)
    next.has(phase) ? next.delete(phase) : next.add(phase)
    return next
  })

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
  const LABEL_W = 190

  return (
    <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 p-4 scrollbar-custom">
      <div style={{ minWidth: 720 }}>
        {/* Header */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-700 pb-2 mb-3">
          <div style={{ width: LABEL_W }} className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-wider shrink-0">
            Fase / Operação
          </div>
          <div className="flex-1 relative h-5">
            {[0, 25, 50, 75, 100].map(p => (
              <div key={p} style={{ left: `${p}%` }}
                className="absolute top-0 text-xs text-slate-500 dark:text-slate-600 font-mono -translate-x-1/2">
                {(total * p / 100).toFixed(0)}d
              </div>
            ))}
          </div>
        </div>

        {sections.map(({ phase, sectionKey, sectionItems: phaseItems }) => {
          const phaseStart = phaseItems[0]?.startDay ?? 0
          const phaseEnd = phaseItems[phaseItems.length - 1]?.endDay ?? 0
          const colors = PHASE_COLORS[phase] ?? PHASE_COLORS['Fase 0']

          return (
            <div key={sectionKey} className="mb-5">
              <div className="flex items-center mb-1.5 cursor-pointer select-none" onClick={() => togglePhase(sectionKey)}>
                <div style={{ width: LABEL_W, fontFamily: "'Barlow Condensed', sans-serif" }}
                  className={`text-xs font-bold px-2 py-1 rounded-l uppercase tracking-widest ${colors.bg} ${colors.text} shrink-0 flex items-center gap-1.5`}>
                  <span className="font-bold text-sm leading-none">{collapsedPhases.has(sectionKey) ? '+' : '−'}</span>
                  {phase}
                </div>
                <div className="flex-1 h-5 bg-slate-50 dark:bg-slate-800 rounded-r relative overflow-hidden">
                  <div
                    className={`absolute top-0 h-full ${colors.bar} opacity-20 rounded`}
                    style={{ left: `${(phaseStart / total) * 100}%`, width: `${((phaseEnd - phaseStart) / total) * 100}%` }}
                  />
                </div>
              </div>

              {!collapsedPhases.has(sectionKey) && phaseItems.map(item => (
                <div key={item.uid} className="flex items-center mb-0.5 group">
                  <div style={{ width: LABEL_W }}
                    className="text-xs text-slate-700 dark:text-slate-400 truncate pr-2 shrink-0 pl-3 flex items-center gap-1"
                    title={item.packageName}>
                    {item.isContingency && <span className="text-rose-400 dark:text-rose-400 text-xs shrink-0">⚠</span>}
                    {item.autoInserted && <span className="text-slate-500 dark:text-slate-600 text-xs shrink-0">⚙</span>}
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
                          : colors.bar}`}
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
