import { useMemo, useState } from 'react'
import { BarChart3, X, MapPin } from 'lucide-react'
import { LOGIC_BY_SCOPE, CONDITION_LABELS } from '../data/logicSecs'
import type { LSec, LDec, LAns, LPkg, LSeqEntry } from '../data/logicSecs'
import { ConditionIcon } from './LogicGraphPanel'

// ── Walker: localiza cada pacote com `condition` (losango azul ◈) ────────────
type Ctx = { scope: string; secId: string; phase: string; section: string }
type Hit = Ctx & { cond: string; pkgId: string; question: string; answer: string; where: string }

function collectHits(entries: [string, LSec[]][]): Hit[] {
  const hits: Hit[] = []
  const pushPkgs = (pkgs: LPkg[] | undefined, base: Omit<Hit, 'cond' | 'pkgId'>) => {
    for (const pk of pkgs ?? []) if (pk.condition) hits.push({ cond: pk.condition, pkgId: pk.id, ...base })
  }
  const walkSeq = (seq: LSeqEntry[] | undefined, base: Omit<Hit, 'cond' | 'pkgId'>) => {
    for (const se of seq ?? []) {
      pushPkgs(se.packages, { ...base, where: `${base.where} · ${se.label}` })
      for (const sd of se.sub ?? []) walkDec(sd, { scope: base.scope, secId: base.secId, phase: base.phase, section: base.section, qpath: `${base.question} :: ${se.label}` })
    }
  }
  const walkAns = (ans: LAns, ctx: Ctx & { question: string }) => {
    const base = { ...ctx, answer: ans.label }
    pushPkgs(ans.packages, { ...base, where: 'resposta' })
    walkSeq(ans.seq, { ...base, where: 'sequencial' })
    walkSeq(ans.after, { ...base, where: 'após convergência' })
    for (const sd of ans.sub ?? []) walkDec(sd, { ...ctx, qpath: `${ctx.question} → [${ans.label}]` })
    for (const asd of ans.afterSub ?? []) walkDec(asd, { ...ctx, qpath: `${ctx.question} → [${ans.label}] (afterSub)` })
  }
  function walkDec(dec: LDec, ctx: Ctx & { qpath: string }) {
    const question = ctx.qpath ? `${ctx.qpath} › ${dec.question}` : dec.question
    pushPkgs(dec.packages, { ...ctx, question, answer: '—', where: 'pergunta' })
    for (const ans of dec.answers) walkAns(ans, { ...ctx, question })
    for (const ad of dec.afterDec ?? []) walkDec(ad, { ...ctx, qpath: `${question} (afterDec)` })
    walkSeq(dec.after, { ...ctx, question, answer: '—', where: 'pergunta · após convergência' })
  }
  for (const [scope, secs] of entries) {
    for (const sec of secs) {
      const ctx: Ctx = { scope, secId: sec.id, phase: sec.phase, section: sec.label }
      pushPkgs(sec.always, { ...ctx, question: '—', answer: 'SEMPRE', where: 'seção' })
      for (const dec of sec.decisions) walkDec(dec, { ...ctx, qpath: '' })
    }
  }
  return hits
}

type Loc = { cond: string; phase: string; section: string; question: string; answer: string; where: string; pkgs: Set<string>; scopes: Set<string> }
function dedupe(hits: Hit[]): Loc[] {
  const locs = new Map<string, Loc>()
  for (const h of hits) {
    const key = `${h.secId}|${h.question}|${h.answer}|${h.where}|${h.cond}|${h.pkgId}`
    let l = locs.get(key)
    if (!l) { l = { cond: h.cond, phase: h.phase, section: h.section, question: h.question, answer: h.answer, where: h.where, pkgs: new Set(), scopes: new Set() }; locs.set(key, l) }
    l.pkgs.add(h.pkgId); l.scopes.add(h.scope)
  }
  return [...locs.values()]
}

const COND_COLORS: Record<string, string> = {
  rig_dp: '#38bdf8', rig_anc: '#22d3ee', op_generalista: '#a78bfa', op_lwo: '#f472b6',
}
const condColor = (c: string) => COND_COLORS[c] ?? '#94a3b8'

export function ConditionAuditPanel({ sections, scopeLabel, scopeId, onClose }: {
  sections: LSec[]; scopeLabel: string; scopeId: string | null; onClose: () => void
}) {
  const [scopeMode, setScopeMode] = useState<'this' | 'all'>('all')

  const { hits, locs, byCond, allConds } = useMemo(() => {
    const entries: [string, LSec[]][] = scopeMode === 'all'
      ? Object.entries(LOGIC_BY_SCOPE)
      : [[scopeId ?? 'escopo atual', sections]]
    const hits = collectHits(entries)
    const locs = dedupe(hits)
    const byCond = new Map<string, Loc[]>()
    for (const l of locs) (byCond.get(l.cond) ?? byCond.set(l.cond, []).get(l.cond)!).push(l)
    // ordena locais dentro de cada condição por fase/seção
    for (const list of byCond.values()) list.sort((a, b) => (a.phase + a.section).localeCompare(b.phase + b.section))
    const allConds = Object.keys(CONDITION_LABELS)
    return { hits, locs, byCond, allConds }
  }, [scopeMode, sections, scopeId])

  const usedConds = [...byCond.keys()].sort((a, b) => (byCond.get(b)!.length) - (byCond.get(a)!.length))
  const unusedConds = allConds.filter(c => !byCond.has(c))
  const rawByCond = useMemo(() => {
    const m = new Map<string, number>()
    for (const h of hits) m.set(h.cond, (m.get(h.cond) ?? 0) + 1)
    return m
  }, [hits])

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col m-4"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-700">
          <BarChart3 size={15} className="text-sky-400" />
          <span className="text-sm font-semibold text-slate-100">Auditoria de condições</span>
          <span className="text-[11px] text-slate-500">— pacotes com condição de emissão</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-[10px]">
              <button onClick={() => setScopeMode('all')}
                className={`px-2.5 py-1 transition-colors ${scopeMode === 'all' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                Todos os escopos
              </button>
              <button onClick={() => setScopeMode('this')}
                className={`px-2.5 py-1 transition-colors ${scopeMode === 'this' ? 'bg-sky-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {scopeLabel}
              </button>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200"><X size={16} /></button>
          </div>
        </div>

        {/* Resumo */}
        <div className="px-5 py-3 border-b border-slate-800 grid grid-cols-3 gap-3">
          <Stat label="Ocorrências (expandidas)" value={hits.length} hint="somando repetições em todos os fluxos" />
          <Stat label="Locais distintos" value={locs.length} hint="seções compartilhadas contam 1×" />
          <Stat label="Condições em uso" value={`${usedConds.length}/${allConds.length}`} hint={`${unusedConds.length} nunca usadas`} />
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto scrollbar-custom px-5 py-4">
          {usedConds.length === 0 && (
            <div className="text-center text-slate-500 text-sm py-10">Nenhum pacote condicional neste escopo.</div>
          )}

          {/* Ranking */}
          {usedConds.length > 0 && (
            <div className="mb-5">
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Ranking</h4>
              <div className="space-y-1.5">
                {usedConds.map(c => {
                  const raw = rawByCond.get(c) ?? 0
                  const max = Math.max(...usedConds.map(x => rawByCond.get(x) ?? 0))
                  return (
                    <div key={c} className="flex items-center gap-2 text-xs">
                      <span className="shrink-0 flex items-center justify-center w-4" style={{ color: condColor(c) }}>
                        <ConditionIcon condition={c} size={14} />
                      </span>
                      <span className="w-40 shrink-0 text-slate-300 truncate">{(CONDITION_LABELS as Record<string, string>)[c] ?? c}</span>
                      <div className="flex-1 h-4 bg-slate-800 rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${(raw / max) * 100}%`, background: condColor(c), opacity: 0.55 }} />
                      </div>
                      <span className="w-24 text-right text-slate-400 tabular-nums">{raw} <span className="text-slate-600">· {byCond.get(c)!.length} locais</span></span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Detalhe por condição */}
          {usedConds.map(cond => {
            const list = byCond.get(cond)!
            return (
              <div key={cond} className="mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex items-center justify-center w-4" style={{ color: condColor(cond) }}>
                    <ConditionIcon condition={cond} size={14} />
                  </span>
                  <span className="text-xs font-semibold text-slate-200">{(CONDITION_LABELS as Record<string, string>)[cond] ?? cond}</span>
                  <code className="text-[10px] text-slate-500">{cond}</code>
                  <span className="text-[10px] text-slate-500">— {list.length} locais</span>
                </div>
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-slate-800/60 text-slate-400 text-left">
                        <th className="px-2 py-1.5 font-medium">Fase</th>
                        <th className="px-2 py-1.5 font-medium">Seção</th>
                        <th className="px-2 py-1.5 font-medium">Pergunta / sub-pergunta</th>
                        <th className="px-2 py-1.5 font-medium">Resposta</th>
                        <th className="px-2 py-1.5 font-medium">Local</th>
                        <th className="px-2 py-1.5 font-medium">Pacotes</th>
                        {scopeMode === 'all' && <th className="px-2 py-1.5 font-medium text-right">Escopos</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((l, i) => (
                        <tr key={i} className="border-t border-slate-800/70 align-top hover:bg-slate-800/30">
                          <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{l.phase}</td>
                          <td className="px-2 py-1.5 text-slate-300">{l.section}</td>
                          <td className="px-2 py-1.5 text-slate-300">{l.question}</td>
                          <td className="px-2 py-1.5 text-slate-400 whitespace-nowrap">{l.answer}</td>
                          <td className="px-2 py-1.5 text-slate-500 whitespace-nowrap">{l.where}</td>
                          <td className="px-2 py-1.5 text-sky-300 font-mono whitespace-nowrap">{[...l.pkgs].join(', ')}</td>
                          {scopeMode === 'all' && (
                            <td className="px-2 py-1.5 text-right text-slate-400">
                              <span className="inline-flex items-center gap-0.5" title={[...l.scopes].join(', ')}>
                                <MapPin size={9} className="text-slate-600" />{l.scopes.size}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Não usadas */}
          {unusedConds.length > 0 && (
            <div className="mt-2 pt-3 border-t border-slate-800">
              <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Definidas mas nunca usadas ({unusedConds.length})</h4>
              <div className="flex flex-wrap gap-1.5">
                {unusedConds.map(c => (
                  <span key={c} className="text-[10px] text-slate-500 bg-slate-800/60 border border-slate-700/60 rounded px-1.5 py-0.5">
                    {(CONDITION_LABELS as Record<string, string>)[c] ?? c} <code className="text-slate-600">{c}</code>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <div className="bg-slate-800/40 border border-slate-800 rounded-lg px-3 py-2">
      <div className="text-lg font-bold text-slate-100 tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] text-slate-400 leading-tight">{label}</div>
      <div className="text-[9px] text-slate-600 leading-tight mt-0.5">{hint}</div>
    </div>
  )
}
