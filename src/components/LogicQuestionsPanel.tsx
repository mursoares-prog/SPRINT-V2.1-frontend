import { useState } from 'react'
import type { LSec, LDec, LAns, LPkg, LSeqEntry } from '../data/logicSecs'
import { conditionMatches } from '../data/logicSecs'
import { buildDecisionKey } from '../engines/logicEngine'

function collectPkgs(dec: LDec): LPkg[] {
  const out: LPkg[] = []
  const pushSeq = (seq?: LSeqEntry[]) => seq?.forEach(e => {
    if (e.packages) out.push(...e.packages)
    e.sub?.forEach(d => out.push(...collectPkgs(d)))
    e.afterSub?.forEach(d => out.push(...collectPkgs(d)))
  })
  if (dec.packages) out.push(...dec.packages)
  pushSeq(dec.after)
  dec.afterDec?.forEach(d => out.push(...collectPkgs(d)))
  for (const ans of dec.answers) {
    if (ans.packages) out.push(...ans.packages)
    ans.sub?.forEach(d => out.push(...collectPkgs(d)))
    ans.afterSub?.forEach(d => out.push(...collectPkgs(d)))
    pushSeq(ans.seq)
    pushSeq(ans.after)
  }
  return out
}

function decVisible(dec: LDec, rigType?: string, opType?: string): boolean {
  const pkgs = collectPkgs(dec)
  if (!pkgs.length) return true
  return pkgs.some(p => conditionMatches(p.condition, rigType, opType))
}

// Coleta as chaves de todas as sub-perguntas visíveis na subárvore (caminho selecionado).
function collectVisibleKeys(
  dec: LDec, pathPrefix: string, decIndex: number,
  answers: Record<string, string>, rigType?: string, opType?: string
): string[] {
  if (dec.reuseScope) return []
  const key = buildDecisionKey(pathPrefix, decIndex, dec.question)
  const keys = [key]
  const selected = answers[key]
  const selectedAns = dec.answers.find(a => a.label === selected)
    ?? dec.answers.find(a => a.active)
    ?? dec.answers[0]
  selectedAns?.sub?.forEach((sub, si) => {
    if (decVisible(sub, rigType, opType))
      keys.push(...collectVisibleKeys(sub, `${key}::${selectedAns.label}`, si, answers, rigType, opType))
  })
  dec.afterDec?.forEach((ad, ai) => {
    if (decVisible(ad, rigType, opType))
      keys.push(...collectVisibleKeys(ad, `${key}::after`, ai, answers, rigType, opType))
  })
  return keys
}

const PHASE_ACCENT: Record<string, string> = {
  'Mobilização':    'border-slate-400 dark:border-slate-600',
  'Fase 0':         'border-gray-400 dark:border-gray-600',
  'Fase 1A':        'border-blue-400 dark:border-blue-600',
  'Fase 1B':        'border-amber-400 dark:border-amber-600',
  'Fase 2':         'border-violet-500 dark:border-violet-600',
  'Extra Abandono': 'border-rose-400 dark:border-rose-600',
  'Desmobilização': 'border-slate-400 dark:border-slate-600',
}

interface Props {
  sections: LSec[]
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  showSectionLabels?: boolean
  rigType?: string
  operationType?: string
}

export function LogicQuestionsPanel({ sections, answers, onAnswer, rigType, operationType }: Props) {
  if (!sections.length) return null

  const [openKey, setOpenKey] = useState<string | null>(null)
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set())
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set())

  const phaseOrder: string[] = []
  const byPhase: Record<string, LSec[]> = {}
  for (const sec of sections) {
    if (!byPhase[sec.phase]) { byPhase[sec.phase] = []; phaseOrder.push(sec.phase) }
    byPhase[sec.phase].push(sec)
  }

  const allCollapsed = collapsedPhases.size >= phaseOrder.length

  const toggleAll = () => allCollapsed
    ? setCollapsedPhases(new Set())
    : setCollapsedPhases(new Set(phaseOrder))

  const togglePhase = (phase: string) => setCollapsedPhases(prev => {
    const n = new Set(prev); n.has(phase) ? n.delete(phase) : n.add(phase); return n
  })

  // Recebe array de chaves (raiz + sub-perguntas visíveis).
  // Se a raiz já está marcada → desmarca tudo; senão → marca tudo e fecha qualquer painel aberto.
  const handleCheck = (keys: string[]) => {
    const rootChecked = checkedKeys.has(keys[0])
    setCheckedKeys(prev => {
      const n = new Set(prev)
      if (rootChecked) keys.forEach(k => n.delete(k))
      else keys.forEach(k => n.add(k))
      return n
    })
    if (!rootChecked && openKey && keys.includes(openKey)) setOpenKey(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between px-2 py-1 mb-0.5">
        <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-600 uppercase tracking-widest">Definições</span>
        <button
          onClick={toggleAll}
          className="text-[10px] text-slate-500 dark:text-slate-600 hover:text-slate-700 dark:hover:text-slate-400 transition-colors"
          title={allCollapsed ? 'Expandir tudo' : 'Compactar tudo'}
        >
          {allCollapsed ? '+ Expandir tudo' : '− Compactar tudo'}
        </button>
      </div>
      <div className="space-y-3">
        {phaseOrder.map(phase => (
          <PhaseGroup
            key={phase}
            phase={phase}
            sections={byPhase[phase]}
            answers={answers}
            onAnswer={onAnswer}
            rigType={rigType}
            operationType={operationType}
            collapsed={collapsedPhases.has(phase)}
            onToggleCollapse={() => togglePhase(phase)}
            openKey={openKey}
            setOpenKey={setOpenKey}
            checkedKeys={checkedKeys}
            onCheck={handleCheck}
          />
        ))}
      </div>
    </div>
  )
}

function PhaseGroup({ phase, sections, answers, onAnswer, rigType, operationType, collapsed, onToggleCollapse, openKey, setOpenKey, checkedKeys, onCheck }: {
  phase: string; sections: LSec[]; answers: Record<string, string>
  onAnswer: (key: string, label: string) => void; rigType?: string; operationType?: string
  collapsed: boolean; onToggleCollapse: () => void
  openKey: string | null; setOpenKey: (k: string | null) => void
  checkedKeys: Set<string>; onCheck: (keys: string[]) => void
}) {
  const accent = PHASE_ACCENT[phase] ?? 'border-slate-400 dark:border-slate-500'
  return (
    <div className={`pl-1.5 border-l-2 ${accent}`}>
      <button onClick={onToggleCollapse} className="flex items-center gap-1 w-full text-left mb-1.5 px-1">
        <span className="text-slate-600 dark:text-slate-500 font-bold text-sm leading-none select-none">{collapsed ? '+' : '−'}</span>
        <span className="text-[10px] font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">{phase}</span>
      </button>
      {!collapsed && (
        <div>
          {sections.map(sec => (
            <SectionDecisions
              key={sec.id}
              sec={sec}
              answers={answers}
              onAnswer={onAnswer}
              rigType={rigType}
              operationType={operationType}
              openKey={openKey}
              setOpenKey={setOpenKey}
              checkedKeys={checkedKeys}
              onCheck={onCheck}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionDecisions({ sec, answers, onAnswer, rigType, operationType, openKey, setOpenKey, checkedKeys, onCheck }: {
  sec: LSec; answers: Record<string, string>; onAnswer: (key: string, label: string) => void
  rigType?: string; operationType?: string
  openKey: string | null; setOpenKey: (k: string | null) => void
  checkedKeys: Set<string>; onCheck: (keys: string[]) => void
}) {
  if (!sec.decisions.length) return null
  return (
    <div>
      {sec.decisions.map((dec, i) =>
        decVisible(dec, rigType, operationType) ? (
          <DecisionRow
            key={i}
            dec={dec}
            pathPrefix={sec.id}
            decIndex={i}
            answers={answers}
            onAnswer={onAnswer}
            depth={0}
            rigType={rigType}
            operationType={operationType}
            openKey={openKey}
            setOpenKey={setOpenKey}
            checkedKeys={checkedKeys}
            onCheck={onCheck}
          />
        ) : null
      )}
    </div>
  )
}

function DecisionRow({ dec, pathPrefix, decIndex, answers, onAnswer, depth, rigType, operationType, openKey, setOpenKey, checkedKeys, onCheck }: {
  dec: LDec; pathPrefix: string; decIndex: number
  answers: Record<string, string>; onAnswer: (key: string, label: string) => void
  depth: number; rigType?: string; operationType?: string
  openKey: string | null; setOpenKey: (k: string | null) => void
  checkedKeys: Set<string>; onCheck: (keys: string[]) => void
}) {
  if (dec.reuseScope) return null
  const key = buildDecisionKey(pathPrefix, decIndex, dec.question)
  const selected = answers[key]
  const selectedAns: LAns | undefined = dec.answers.find(a => a.label === selected)
    ?? dec.answers.find(a => a.active)
    ?? dec.answers[0]
  const hasDefault = dec.answers.some(a => a.active)
  const isChecked = checkedKeys.has(key)
  const isEditing = openKey === key

  const handleRootCheck = () => {
    onCheck([key])
  }

  return (
    <div>
      <div className={`rounded transition-all ${isChecked ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : isEditing ? 'bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-200 dark:ring-sky-800' : ''}`}>
        <div className={`flex items-center w-full py-1.5 px-1 rounded transition-colors ${!isEditing ? 'hover:bg-slate-50 dark:hover:bg-slate-800' : ''}`}>

          <button
              onClick={handleRootCheck}
              className={`shrink-0 mr-1.5 w-3 h-3 rounded border transition-colors flex items-center justify-center ${
                isChecked
                  ? 'bg-emerald-500 dark:bg-emerald-600 border-emerald-500 dark:border-emerald-600'
                  : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500'
              }`}
              title={isChecked ? 'Desmarcar revisão' : 'Marcar como revisado'}
            >
              {isChecked && <span className="text-white leading-none select-none" style={{ fontSize: 8 }}>✓</span>}
            </button>

          {/* Pergunta */}
          <button
            onClick={() => setOpenKey(isEditing ? null : key)}
            className="flex-1 flex justify-between items-center text-left gap-1.5 min-w-0"
          >
            <span className={`flex items-center gap-1 leading-tight min-w-0 ${
              isChecked
                ? 'text-[11px] text-slate-400 dark:text-slate-600'
                : 'text-[11px] font-semibold text-slate-700 dark:text-slate-400'
            }`}>
              {!hasDefault && !isChecked && (
                <span title="Sem resposta padrão definida" className="shrink-0 text-amber-500 dark:text-amber-400 font-bold leading-none" style={{ fontSize: 10 }}>⚠</span>
              )}
              <span className="truncate">{dec.question}</span>
            </span>
            {!isEditing && (
              <span className={`text-[10px] font-medium shrink-0 ${
                isChecked
                  ? 'text-emerald-600 dark:text-emerald-500'
                  : !selected && !selectedAns
                    ? 'text-slate-400 dark:text-slate-600'
                    : 'text-slate-600 dark:text-white'
              }`}>
                {selected ?? selectedAns?.label ?? '—'}
              </span>
            )}
          </button>
        </div>

        {isEditing && (
          <div className="px-2 pb-1 pt-0.5 space-y-px">
            {dec.answers.map(ans => (
              <label key={ans.label}
                className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-colors text-[10px]
                  ${(selected ?? selectedAns?.label) === ans.label
                    ? 'bg-slate-100 dark:bg-slate-700 text-sky-800 dark:text-sky-300 font-semibold ring-1 ring-sky-200 dark:ring-sky-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800'}`}>
                <input
                  type="radio"
                  checked={(selected ?? selectedAns?.label) === ans.label}
                  onChange={() => { onAnswer(key, ans.label); setOpenKey(null); if (!isChecked) onCheck([key]) }}
                  className="accent-[#0c2340] shrink-0"
                />
                {ans.label}
                {ans.note && <span className="text-slate-400 dark:text-slate-500 font-normal">— {ans.note}</span>}
              </label>
            ))}
          </div>
        )}
      </div>

      {selectedAns?.sub?.map((subDec, si) =>
        decVisible(subDec, rigType, operationType) ? (
          <DecisionRow key={si} dec={subDec} pathPrefix={`${key}::${selectedAns.label}`} decIndex={si}
            answers={answers} onAnswer={onAnswer} depth={depth + 1}
            rigType={rigType} operationType={operationType}
            openKey={openKey} setOpenKey={setOpenKey} checkedKeys={checkedKeys} onCheck={onCheck} />
        ) : null
      )}

      {dec.afterDec?.map((adDec, ai) =>
        decVisible(adDec, rigType, operationType) ? (
          <DecisionRow key={`ad${ai}`} dec={adDec} pathPrefix={`${key}::after`} decIndex={ai}
            answers={answers} onAnswer={onAnswer} depth={depth + 1}
            rigType={rigType} operationType={operationType}
            openKey={openKey} setOpenKey={setOpenKey} checkedKeys={checkedKeys} onCheck={onCheck} />
        ) : null
      )}
    </div>
  )
}
