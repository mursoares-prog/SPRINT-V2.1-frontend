import { useState } from 'react'
import type { LSec, LDec, LAns } from '../data/logicSecs'
import { buildDecisionKey } from '../engines/logicEngine'

// ── Fase colors matching the schedule phase palette ──────────────────────────
const PHASE_ACCENT: Record<string, string> = {
  'Mobilização':      'border-slate-400 dark:border-slate-600',
  'Fase 0':           'border-gray-400 dark:border-gray-600',
  'Fase 1A':          'border-blue-400 dark:border-blue-600',
  'Fase 1B':          'border-amber-400 dark:border-amber-600',
  'Fase 2':           'border-violet-500 dark:border-violet-600',
  'Extra Abandono':   'border-rose-400 dark:border-rose-600',
  'Desmobilização':   'border-slate-400 dark:border-slate-600',
}

interface Props {
  sections: LSec[]
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  showSectionLabels?: boolean
}

export function LogicQuestionsPanel({ sections, answers, onAnswer, showSectionLabels = false }: Props) {
  if (!sections.length) return null

  // Group sections by phase preserving order
  const phaseOrder: string[] = []
  const byPhase: Record<string, LSec[]> = {}
  for (const sec of sections) {
    if (!byPhase[sec.phase]) {
      byPhase[sec.phase] = []
      phaseOrder.push(sec.phase)
    }
    byPhase[sec.phase].push(sec)
  }

  return (
    <div className="space-y-4">
      {phaseOrder.map(phase => (
        <PhaseGroup
          key={phase}
          phase={phase}
          sections={byPhase[phase]}
          answers={answers}
          onAnswer={onAnswer}
          showSectionLabels={showSectionLabels}
        />
      ))}
    </div>
  )
}

function PhaseGroup({ phase, sections, answers, onAnswer, showSectionLabels }: {
  phase: string
  sections: LSec[]
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  showSectionLabels: boolean
}) {
  const [collapsed, setCollapsed] = useState(false)
  const accent = PHASE_ACCENT[phase] ?? 'border-slate-400 dark:border-slate-500'
  return (
    <div className={`pl-2 border-l-2 ${accent}`}>
      <button
        onClick={() => setCollapsed(c => !c)}
        className="flex items-center gap-1.5 w-full text-left mb-1.5 px-1 group"
      >
        <span className="text-slate-600 dark:text-slate-500 font-bold text-sm leading-none select-none">
          {collapsed ? '+' : '−'}
        </span>
        <span className="text-xs font-bold text-slate-600 dark:text-slate-500 uppercase tracking-widest">
          {phase}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-3">
          {sections.map(sec => (
            <SectionDecisions
              key={sec.id}
              sec={sec}
              answers={answers}
              onAnswer={onAnswer}
              showLabel={showSectionLabels}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionDecisions({ sec, answers, onAnswer, showLabel }: {
  sec: LSec
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  showLabel: boolean
}) {
  if (!sec.decisions.length) return null
  return (
    <div className="space-y-0.5">
      {showLabel && sec.label && (
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wider px-2 pt-1">
          {sec.label}
        </p>
      )}
      {sec.decisions.map((dec, i) => (
        <DecisionRow
          key={i}
          dec={dec}
          pathPrefix={sec.id}
          decIndex={i}
          answers={answers}
          onAnswer={onAnswer}
          depth={0}
        />
      ))}
    </div>
  )
}

function DecisionRow({ dec, pathPrefix, decIndex, answers, onAnswer, depth }: {
  dec: LDec
  pathPrefix: string
  decIndex: number
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  depth: number
}) {
  const [isEditing, setIsEditing] = useState(false)
  // "Já respondida no escopo": pergunta repetida que herda a resposta da 1ª ocorrência —
  // não é exibida aqui (o engine resolve sozinho via scopeAnswers).
  if (dec.reuseScope) return null
  const key = buildDecisionKey(pathPrefix, decIndex, dec.question)
  const selected = answers[key]
  const selectedAns: LAns | undefined = dec.answers.find(a => a.label === selected)
    ?? dec.answers.find(a => a.active)
    ?? dec.answers[0]

  return (
    <div className={depth > 0 ? 'ml-3 pl-2 border-l border-slate-200 dark:border-slate-700' : ''}>
      <div className={`rounded-lg transition-colors ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-200 dark:ring-sky-800' : ''}`}>
        <button
          onClick={() => setIsEditing(e => !e)}
          className={`w-full flex justify-between items-center py-1.5 px-2 rounded-lg text-left group transition-colors
            ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          <span className="text-xs text-slate-600 dark:text-slate-500 shrink-0 mr-2 leading-tight">
            {dec.question}
          </span>
          <span className={`text-xs font-semibold text-right flex items-center gap-1.5 shrink-0
            ${!selected && !selectedAns ? 'text-slate-400 dark:text-slate-600' : isEditing ? 'text-sky-700 dark:text-sky-400' : 'text-slate-700 dark:text-slate-200'}`}>
            <span>{selected ?? selectedAns?.label ?? '—'}</span>
            <span className="text-slate-400 text-xs opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
          </span>
        </button>
        {isEditing && (
          <div className="px-2 pb-2 pt-0.5 space-y-0.5">
            {dec.answers.map(ans => (
              <label key={ans.label}
                className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-xs
                  ${(selected ?? selectedAns?.label) === ans.label
                    ? 'bg-slate-100 dark:bg-slate-700 text-sky-800 dark:text-sky-300 font-semibold shadow-sm ring-1 ring-sky-200 dark:ring-sky-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800'}`}>
                <input
                  type="radio"
                  checked={(selected ?? selectedAns?.label) === ans.label}
                  onChange={() => {
                    onAnswer(key, ans.label)
                    setIsEditing(false)
                  }}
                  className="accent-[#0c2340] shrink-0"
                />
                {ans.label}
                {ans.note && (
                  <span className="text-slate-400 dark:text-slate-500 font-normal">— {ans.note}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Sub-decisions of the selected answer — o caminho segue pelo rótulo da resposta */}
      {selectedAns?.sub?.map((subDec, si) => (
        <DecisionRow
          key={si}
          dec={subDec}
          pathPrefix={`${key}::${selectedAns.label}`}
          decIndex={si}
          answers={answers}
          onAnswer={onAnswer}
          depth={depth + 1}
        />
      ))}

      {/* Perguntas após convergência (afterDec) — fluem independentemente da resposta
          escolhida; precisam aparecer no stage 2 com a MESMA chave usada pelo engine
          (pathPrefix `${key}::after`, ver walkDecisions/logicEngine). */}
      {dec.afterDec?.map((adDec, ai) => (
        <DecisionRow
          key={`ad${ai}`}
          dec={adDec}
          pathPrefix={`${key}::after`}
          decIndex={ai}
          answers={answers}
          onAnswer={onAnswer}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}
