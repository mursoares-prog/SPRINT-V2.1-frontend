import { useState } from 'react'
import type { LSec, LDec, LAns, LPkg, LSeqEntry } from '../data/logicSecs'
import { conditionMatches } from '../data/logicSecs'
import { buildDecisionKey } from '../engines/logicEngine'

// Coleta todos os pacotes alcançáveis na subárvore de uma decisão (respostas, subs,
// sequenciais e blocos `after`/`afterDec`). Usado para saber se a decisão tem qualquer
// impacto no cronograma para a sonda/operação atuais.
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

// Uma decisão condicionada por sonda (ex.: "Modo do transponder?", pacotes rig_dp) só
// deve aparecer na etapa 2 se pelo menos um pacote da sua subárvore for emitido para a
// sonda/operação atuais — espelha o filtro checkCondition do engine. Decisões sem pacote
// algum (gates estruturais) são mantidas.
function decVisible(dec: LDec, rigType?: string, opType?: string): boolean {
  const pkgs = collectPkgs(dec)
  if (!pkgs.length) return true
  return pkgs.some(p => conditionMatches(p.condition, rigType, opType))
}

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
  // Sonda/operação atuais — usadas para ocultar perguntas cujos pacotes são todos
  // condicionados a outra sonda/operação (espelha o filtro do engine).
  rigType?: string
  operationType?: string
}

export function LogicQuestionsPanel({ sections, answers, onAnswer, showSectionLabels = false, rigType, operationType }: Props) {
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
          rigType={rigType}
          operationType={operationType}
        />
      ))}
    </div>
  )
}

function PhaseGroup({ phase, sections, answers, onAnswer, showSectionLabels, rigType, operationType }: {
  phase: string
  sections: LSec[]
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  showSectionLabels: boolean
  rigType?: string
  operationType?: string
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
              rigType={rigType}
              operationType={operationType}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SectionDecisions({ sec, answers, onAnswer, showLabel, rigType, operationType }: {
  sec: LSec
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  showLabel: boolean
  rigType?: string
  operationType?: string
}) {
  if (!sec.decisions.length) return null
  return (
    <div className="space-y-0.5">
      {showLabel && sec.label && (
        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wider px-2 pt-1">
          {sec.label}
        </p>
      )}
      {/* Índice original preservado (decIndex) mesmo ao ocultar decisões condicionadas —
          a chave da resposta deve casar com a do engine (buildDecisionKey). */}
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
          />
        ) : null
      )}
    </div>
  )
}

function DecisionRow({ dec, pathPrefix, decIndex, answers, onAnswer, depth, rigType, operationType }: {
  dec: LDec
  pathPrefix: string
  decIndex: number
  answers: Record<string, string>
  onAnswer: (key: string, label: string) => void
  depth: number
  rigType?: string
  operationType?: string
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
  const hasDefault = dec.answers.some(a => a.active)

  return (
    <div className={depth > 0 ? 'ml-3 pl-2 border-l border-slate-200 dark:border-slate-700' : ''}>
      <div className={`rounded-lg transition-colors ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40 ring-1 ring-sky-200 dark:ring-sky-800' : ''}`}>
        <button
          onClick={() => setIsEditing(e => !e)}
          className={`w-full flex justify-between items-center py-1.5 px-2 rounded-lg text-left group transition-colors
            ${isEditing ? 'bg-sky-50 dark:bg-sky-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
        >
          <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-500 shrink-0 mr-2 leading-tight">
            {!hasDefault && (
              <span
                title="Sem resposta padrão definida"
                className="shrink-0 text-amber-500 dark:text-amber-400 font-bold leading-none"
                style={{ fontSize: 11 }}
              >⚠</span>
            )}
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
      {selectedAns?.sub?.map((subDec, si) =>
        decVisible(subDec, rigType, operationType) ? (
          <DecisionRow
            key={si}
            dec={subDec}
            pathPrefix={`${key}::${selectedAns.label}`}
            decIndex={si}
            answers={answers}
            onAnswer={onAnswer}
            depth={depth + 1}
            rigType={rigType}
            operationType={operationType}
          />
        ) : null
      )}

      {/* Perguntas após convergência (afterDec) — fluem independentemente da resposta
          escolhida; precisam aparecer no stage 2 com a MESMA chave usada pelo engine
          (pathPrefix `${key}::after`, ver walkDecisions/logicEngine). */}
      {dec.afterDec?.map((adDec, ai) =>
        decVisible(adDec, rigType, operationType) ? (
          <DecisionRow
            key={`ad${ai}`}
            dec={adDec}
            pathPrefix={`${key}::after`}
            decIndex={ai}
            answers={answers}
            onAnswer={onAnswer}
            depth={depth + 1}
            rigType={rigType}
            operationType={operationType}
          />
        ) : null
      )}
    </div>
  )
}
