import { useState, useRef, useCallback } from 'react'
import {
  Upload, X, Check, Braces, AlertTriangle, Loader2, FileJson,
  ChevronDown, ChevronRight, Plus, Wand2,
} from 'lucide-react'
import { PLACEHOLDER_CATALOG, type PlaceholderField } from '../data/placeholderCatalog'
import { importPackages, type BaseLine } from '../utils/api'
import { authHeader } from '../utils/auth'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ImportLine {
  text: string; duration: number | null
  bop?: boolean | null; compensando?: boolean | null
  isContingency?: boolean | null; isParallel?: boolean | null
  owFase?: string | null; owAtividade?: string | null
  owOperacao?: string | null; owEtapa?: string | null
  genOperacao?: string | null; genOperacaoDual?: string | null
  rec?: string; pad?: string
}
interface ImportPkg { pkgId: string; name: string; category?: string; technology?: string; lines: ImportLine[] }
interface EnrichLine extends ImportLine { _id: string }
interface EnrichPkg extends Omit<ImportPkg, 'lines'> { lines: EnrichLine[]; isNew: boolean }

type TextareaRef = { el: HTMLTextAreaElement; selStart: number; selEnd: number }
type PickerState =
  | { mode: 'cursor'; pkgId: string; lineId: string }
  | { mode: 'candidate'; pkgId: string; lineId: string; value: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _seq = 0
function uid() { return `il_${Date.now().toString(36)}_${(_seq++).toString(36)}` }

const UNIT_RE = /\b\d+(?:[.,]\d+)?\s*(?:psi|lbf|ppg|bbl|scfm|kN|klbf)\b/gi
const NUM_RE  = /\b[1-9]\d{2,}(?:[.,]\d+)?\b/g

function detectCandidates(text: string): string[] {
  const clean = text.replace(/\{\{[^}]+\}\}/g, '\x00'.repeat)
  // replace placeholder regions with same-length null bytes to preserve offsets
  const stripped = text.replace(/\{\{[^}]+\}\}/g, m => '\x00'.repeat(m.length))
  const seen = new Set<string>()
  const results: string[] = []
  for (const re of [new RegExp(UNIT_RE.source, 'gi'), new RegExp(NUM_RE.source, 'g')]) {
    for (const m of stripped.matchAll(re)) {
      const v = m[0].trim()
      if (!seen.has(v)) { seen.add(v); results.push(v) }
    }
  }
  void clean
  return results
}

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

// ─── Validation (ProjectFacts format from Etapa 3 export) ────────────────────
//
// Input: { project_eid: string, facts: [entity, attribute, value][] }
// Entities prefixed with "entity/" carry line-level attributes; the rest are
// project-level facts and are ignored here.
//
// Package grouping: entities sharing the same "package/name" belong to the same
// package. Within each package, entities are ordered by "child/order".
// pkgId is extracted from "[ABAN 001] - Name" pattern when present.

function validateImport(raw: unknown): EnrichPkg[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('JSON deve ser um objeto ProjectFacts com "project_eid" e "facts"')
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.facts))
    throw new Error('Campo "facts" não encontrado ou inválido — verifique se o arquivo está no formato ProjectFacts (objeto com "project_eid" e "facts")')

  // Build entity → attributes map (skip project-level facts)
  const entityMap = new Map<string, Record<string, unknown>>()
  for (const fact of obj.facts as unknown[]) {
    if (!Array.isArray(fact) || fact.length < 3) continue
    const [eid, attr, value] = fact as [unknown, unknown, unknown]
    if (typeof eid !== 'string' || typeof attr !== 'string') continue
    if (!eid.startsWith('entity/')) continue
    if (!entityMap.has(eid)) entityMap.set(eid, {})
    entityMap.get(eid)![attr] = value
  }

  if (entityMap.size === 0)
    throw new Error('Nenhuma entidade de linha encontrada. Verifique se o arquivo está no formato ProjectFacts correto.')

  // Group entities by package/name, tracking insertion order for package sorting
  const pkgOrder = new Map<string, number>()
  const pkgEntities = new Map<string, Array<{ attrs: Record<string, unknown>; order: number }>>()

  for (const attrs of entityMap.values()) {
    const pkgName = typeof attrs['package/name'] === 'string' ? attrs['package/name'] : null
    if (!pkgName) continue
    if (!pkgOrder.has(pkgName)) { pkgOrder.set(pkgName, pkgOrder.size); pkgEntities.set(pkgName, []) }
    pkgEntities.get(pkgName)!.push({
      attrs,
      order: typeof attrs['child/order'] === 'number' ? attrs['child/order'] as number : 0,
    })
  }

  if (pkgEntities.size === 0)
    throw new Error('Nenhum pacote identificado. Verifique se as entidades possuem o atributo "package/name".')

  // Build EnrichPkg[], sort packages by first appearance in facts
  const PKG_NAME_RE = /^\[([^\]]+)\]\s*-\s*(.+)$/

  return [...pkgEntities.entries()]
    .sort(([a], [b]) => (pkgOrder.get(a) ?? 0) - (pkgOrder.get(b) ?? 0))
    .map(([pkgName, entities]) => {
      entities.sort((a, b) => a.order - b.order)

      const match = pkgName.match(PKG_NAME_RE)
      const pkgId = match ? match[1].trim() : pkgName.replace(/[^\w]/g, '_').toUpperCase()
      const name  = match ? match[2].trim() : pkgName

      const str = (v: unknown) => typeof v === 'string' ? v : null
      const bool = (v: unknown) => v != null ? Boolean(v) : null

      const lines: EnrichLine[] = entities.map(({ attrs }) => ({
        _id: uid(),
        text: str(attrs['activity/label']) ?? '',
        duration: typeof attrs['activity/duration'] === 'number' ? attrs['activity/duration'] as number : null,
        bop: null,
        compensando: bool(attrs['activity/compensating']),
        isContingency: bool(attrs['activity/is_contingency']),
        isParallel: bool(attrs['activity/parallel']),
        owFase: str(attrs['openwells/phase']),
        owAtividade: str(attrs['openwells/activity']),
        owOperacao: str(attrs['openwells/operation']),
        owEtapa: str(attrs['openwells/step']),
        genOperacao: str(attrs['genesis/operation']),
        genOperacaoDual: null,
        rec: '', pad: '',
      }))

      return { pkgId, name, category: 'Geral', technology: 'none', lines, isNew: true }
    })
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function ImportPackagesModal({ onClose, onDone, existingPkgIds }: {
  onClose: () => void
  onDone: () => void
  existingPkgIds: string[]
}) {
  const [step, setStep] = useState<'upload' | 'enrich'>('upload')
  const [pkgs, setPkgs] = useState<EnrichPkg[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [openPkg, setOpenPkg] = useState<string | null>(null)
  const [picker, setPicker] = useState<PickerState | null>(null)
  const [extraTokens, setExtraTokens] = useState<PlaceholderField[]>([])
  const [saving, setSaving] = useState(false)
  const [saveErrors, setSaveErrors] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)
  const textareaRefs = useRef<Map<string, TextareaRef>>(new Map())

  const processFile = useCallback((file: File) => {
    setParseError(null)
    file.text().then(raw => {
      try {
        const data = JSON.parse(raw)
        const enriched = validateImport(data).map(p => ({
          ...p, isNew: !existingPkgIds.includes(p.pkgId),
        }))
        setPkgs(enriched)
        setOpenPkg(enriched[0]?.pkgId ?? null)
        setStep('enrich')
      } catch (e) {
        setParseError(e instanceof Error ? e.message : 'Erro ao processar JSON')
      }
    })
  }, [existingPkgIds])

  const updateLineText = useCallback((pkgId: string, lineId: string, text: string) => {
    setPkgs(prev => prev.map(p =>
      p.pkgId !== pkgId ? p : { ...p, lines: p.lines.map(l => l._id !== lineId ? l : { ...l, text }) }
    ))
  }, [])

  const handlePick = useCallback((token: string) => {
    if (!picker) return
    if (picker.mode === 'cursor') {
      const ref = textareaRefs.current.get(picker.lineId)
      const insertion = `{{${token}=XXX}}`
      if (ref) {
        const before = ref.el.value.slice(0, ref.selStart)
        const after = ref.el.value.slice(ref.selEnd)
        updateLineText(picker.pkgId, picker.lineId, before + insertion + after)
        const cursor = ref.selStart + insertion.length
        setTimeout(() => { ref.el.focus(); ref.el.setSelectionRange(cursor, cursor) }, 0)
      } else {
        const pkg = pkgs.find(p => p.pkgId === picker.pkgId)
        const line = pkg?.lines.find(l => l._id === picker.lineId)
        if (line) updateLineText(picker.pkgId, picker.lineId, line.text + insertion)
      }
    } else {
      const { pkgId, lineId, value } = picker
      const pkg = pkgs.find(p => p.pkgId === pkgId)
      const line = pkg?.lines.find(l => l._id === lineId)
      if (line) {
        const newText = line.text.replace(new RegExp(escapeRe(value)), `{{${token}=${value}}}`)
        updateLineText(pkgId, lineId, newText)
      }
    }
    setPicker(null)
  }, [picker, pkgs, updateLineText])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveErrors([])
    try {
      const auth = authHeader()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const packages = pkgs.map(({ isNew: _, ...pkg }) => ({
        pkgId: pkg.pkgId,
        name: pkg.name,
        category: pkg.category ?? 'Geral',
        technology: pkg.technology ?? 'none',
        lines: pkg.lines.map(({ _id: _id2, ...line }) => line as BaseLine),
      }))
      await importPackages(packages, auth)
      onDone()
    } catch (e) {
      setSaveErrors([e instanceof Error ? e.message : 'Erro ao importar pacotes'])
    } finally {
      setSaving(false)
    }
  }, [pkgs, onDone])

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-center gap-2">
              <FileJson size={18} className="text-[#d97706]" />
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Importar pacotes</h2>
              {step === 'enrich' && (
                <span className="text-xs text-slate-400 dark:text-slate-500">— {pkgs.length} pacote(s)</span>
              )}
            </div>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto scrollbar-custom">
            {step === 'upload' ? (
              <UploadStep
                isDragOver={isDragOver}
                parseError={parseError}
                onDragEnter={() => { dragCounter.current++; setIsDragOver(true) }}
                onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false) }}
                onDrop={e => { e.preventDefault(); dragCounter.current = 0; setIsDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
                onFileSelect={processFile}
              />
            ) : (
              <EnrichStep
                pkgs={pkgs}
                openPkg={openPkg}
                setOpenPkg={setOpenPkg}
                updateLineText={updateLineText}
                onOpenPicker={setPicker}
                textareaRefs={textareaRefs}
              />
            )}
          </div>

          {/* Footer */}
          {step === 'enrich' && (
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => { setStep('upload'); setPkgs([]) }}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                ← Carregar outro JSON
              </button>
              <div className="flex items-center gap-3">
                {saveErrors.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                    <AlertTriangle size={13} />
                    <span>Erro em {saveErrors.length} pacote(s)</span>
                  </div>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || pkgs.length === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d97706] hover:bg-amber-600 text-white text-xs font-semibold disabled:opacity-50 transition-colors">
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {saving ? 'Salvando…' : `Importar ${pkgs.length} pacote(s)`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <TokenPickerModal
          title={picker.mode === 'candidate' ? `Substituir "${picker.value}" por placeholder` : 'Inserir placeholder'}
          extraTokens={extraTokens}
          onSetExtraTokens={setExtraTokens}
          onPick={handlePick}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  )
}

// ─── Upload step ──────────────────────────────────────────────────────────────

const JSON_EXAMPLE = `{
  "project_eid": "sprint-abc123",
  "facts": [
    ["entity/uid1", "package/name", "[ABAN 001] - Nome do pacote"],
    ["entity/uid1", "activity/label", "Testar BOP com 1500 psi"],
    ["entity/uid1", "activity/duration", 2.0],
    ["entity/uid1", "activity/is_contingency", false],
    ["entity/uid1", "openwells/phase", "AP.1A"],
    ["entity/uid1", "openwells/activity", "Teste de BOP"],
    ["entity/uid1", "child/order", 0],

    ["entity/uid2", "package/name", "[ABAN 001] - Nome do pacote"],
    ["entity/uid2", "activity/label", "Conectar equipamento"],
    ["entity/uid2", "activity/duration", 1.0],
    ["entity/uid2", "child/order", 1]
  ]
}`

function UploadStep({ isDragOver, parseError, onDragEnter, onDragLeave, onDrop, onFileSelect }: {
  isDragOver: boolean
  parseError: string | null
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onFileSelect: (f: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="p-6 flex flex-col items-center gap-4">
      <div
        onDragEnter={onDragEnter}
        onDragOver={e => e.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors
          ${isDragOver
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
            : 'border-slate-300 dark:border-slate-600 hover:border-amber-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
      >
        <Upload size={32} className={`transition-colors ${isDragOver ? 'text-amber-500' : 'text-slate-400'}`} />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Arraste o JSON aqui ou clique para selecionar</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Formato: ProjectFacts — objeto com "project_eid" e "facts" (datoms)</p>
        </div>
        <input ref={inputRef} type="file" accept=".json,application/json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f) }} />
      </div>

      {parseError && (
        <div className="w-full max-w-lg flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-900/20 px-3 py-2.5">
          <AlertTriangle size={14} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-xs text-rose-700 dark:text-rose-300 leading-snug">{parseError}</p>
        </div>
      )}

      <details className="w-full max-w-lg">
        <summary className="text-xs text-slate-400 dark:text-slate-500 cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none">
          Ver formato esperado do JSON
        </summary>
        <pre className="mt-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-4 overflow-x-auto text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 font-mono scrollbar-custom">
          {JSON_EXAMPLE}
        </pre>
      </details>
    </div>
  )
}

// ─── Enrich step ──────────────────────────────────────────────────────────────

function EnrichStep({ pkgs, openPkg, setOpenPkg, updateLineText, onOpenPicker, textareaRefs }: {
  pkgs: EnrichPkg[]
  openPkg: string | null
  setOpenPkg: (id: string | null) => void
  updateLineText: (pkgId: string, lineId: string, text: string) => void
  onOpenPicker: (state: PickerState) => void
  textareaRefs: React.MutableRefObject<Map<string, TextareaRef>>
}) {
  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">
        Abra cada pacote para revisar as linhas. Chips em âmbar = valores detectados — clique para associar um token.
        Use <Braces size={11} className="inline mx-0.5 align-text-bottom" /> para inserir um placeholder em qualquer posição do texto.
      </p>
      {pkgs.map(pkg => (
        <PackageEnrichCard
          key={pkg.pkgId}
          pkg={pkg}
          isOpen={openPkg === pkg.pkgId}
          onToggle={() => setOpenPkg(openPkg === pkg.pkgId ? null : pkg.pkgId)}
          updateLineText={updateLineText}
          onOpenPicker={onOpenPicker}
          textareaRefs={textareaRefs}
        />
      ))}
    </div>
  )
}

// ─── Package card ─────────────────────────────────────────────────────────────

function PackageEnrichCard({ pkg, isOpen, onToggle, updateLineText, onOpenPicker, textareaRefs }: {
  pkg: EnrichPkg
  isOpen: boolean
  onToggle: () => void
  updateLineText: (pkgId: string, lineId: string, text: string) => void
  onOpenPicker: (state: PickerState) => void
  textareaRefs: React.MutableRefObject<Map<string, TextareaRef>>
}) {
  const totalCandidates = pkg.lines.reduce((acc, l) => acc + detectCandidates(l.text).length, 0)
  const totalPh = pkg.lines.reduce((acc, l) => acc + (l.text.match(/\{\{/g)?.length ?? 0), 0)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors">
        {isOpen
          ? <ChevronDown size={14} className="text-slate-400 shrink-0" />
          : <ChevronRight size={14} className="text-slate-400 shrink-0" />}
        <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{pkg.pkgId}</span>
        <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex-1 truncate">{pkg.name}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{pkg.lines.length} linha(s)</span>
        {totalCandidates > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 shrink-0">
            {totalCandidates} candidato(s)
          </span>
        )}
        {totalPh > 0 && (
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 shrink-0">
            {totalPh} ph
          </span>
        )}
        {!pkg.isNew && (
          <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0">
            override
          </span>
        )}
      </button>
      {isOpen && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {pkg.lines.map((line, idx) => (
            <LineEnrichRow
              key={line._id}
              pkgId={pkg.pkgId}
              line={line}
              idx={idx}
              updateLineText={updateLineText}
              onOpenPicker={onOpenPicker}
              textareaRefs={textareaRefs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Line row ─────────────────────────────────────────────────────────────────

function LineEnrichRow({ pkgId, line, idx, updateLineText, onOpenPicker, textareaRefs }: {
  pkgId: string
  line: EnrichLine
  idx: number
  updateLineText: (pkgId: string, lineId: string, text: string) => void
  onOpenPicker: (state: PickerState) => void
  textareaRefs: React.MutableRefObject<Map<string, TextareaRef>>
}) {
  const candidates = detectCandidates(line.text)
  const existingPhs = [...line.text.matchAll(/\{\{(\w+)=([^}]*)\}\}/g)]

  const handleRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) textareaRefs.current.set(line._id, { el, selStart: 0, selEnd: 0 })
    else textareaRefs.current.delete(line._id)
  }, [line._id, textareaRefs])

  const trackSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const ref = textareaRefs.current.get(line._id)
    if (ref) { ref.selStart = el.selectionStart; ref.selEnd = el.selectionEnd }
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-2 shrink-0 w-5 text-right">{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1">
            <textarea
              ref={handleRef}
              value={line.text}
              rows={2}
              onChange={e => updateLineText(pkgId, line._id, e.target.value)}
              onSelect={trackSelection}
              onMouseUp={trackSelection}
              onKeyUp={trackSelection}
              className="flex-1 text-xs font-mono text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 dark:focus:ring-amber-500 leading-relaxed"
            />
            <button
              onClick={() => onOpenPicker({ mode: 'cursor', pkgId, lineId: line._id })}
              title="Inserir placeholder"
              className="shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors">
              <Braces size={13} />
            </button>
          </div>

          {candidates.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Candidatos:</span>
              {candidates.map(v => (
                <button
                  key={v}
                  onClick={() => onOpenPicker({ mode: 'candidate', pkgId, lineId: line._id, value: v })}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/60 border border-amber-200 dark:border-amber-700/50 transition-colors">
                  <Wand2 size={9} />
                  {v}
                </button>
              ))}
            </div>
          )}

          {existingPhs.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {existingPhs.map((m, i) => (
                <span key={i}
                  className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700/50">
                  {'{{'}{m[1]}{'}}'}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Token picker modal ───────────────────────────────────────────────────────

function TokenPickerModal({ title, extraTokens, onSetExtraTokens, onPick, onClose }: {
  title: string
  extraTokens: PlaceholderField[]
  onSetExtraTokens: (t: PlaceholderField[]) => void
  onPick: (token: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const q = search.trim().toLowerCase()
  const allGroups = [
    ...(extraTokens.length > 0 ? [{ id: '_import', title: 'Tokens do import', fields: extraTokens }] : []),
    ...PLACEHOLDER_CATALOG,
  ]
  const filteredGroups = q
    ? allGroups
        .map(g => ({ ...g, fields: g.fields.filter(f => f.token.toLowerCase().includes(q) || f.label.toLowerCase().includes(q)) }))
        .filter(g => g.fields.length > 0)
    : allGroups

  const handleCreate = () => {
    const tok = newToken.trim().replace(/\s+/g, '_')
    const lbl = newLabel.trim()
    if (!tok || !lbl) return
    onSetExtraTokens([...extraTokens, { token: tok, label: lbl }])
    onPick(tok)
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <Braces size={15} className="text-[#d97706] shrink-0" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-1 truncate">{title}</span>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
            <X size={14} />
          </button>
        </div>

        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <input
            autoFocus
            type="text"
            placeholder="Buscar token ou rótulo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-1.5 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
          />
        </div>

        <div className="flex-1 overflow-auto scrollbar-custom px-2 py-2 space-y-3">
          {filteredGroups.map(g => (
            <div key={g.id}>
              <p className="text-[9px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500 px-2 mb-1">{g.title}</p>
              <div className="grid grid-cols-2 gap-0.5">
                {g.fields.map(f => (
                  <button
                    key={f.token}
                    onClick={() => onPick(f.token)}
                    className="text-left px-2 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 group transition-colors">
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200 group-hover:text-amber-700 dark:group-hover:text-amber-300 leading-tight truncate">{f.label}</p>
                    <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 leading-tight truncate">{f.token}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredGroups.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-4">Nenhum token encontrado</p>
          )}
        </div>

        <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 shrink-0">
          {creating ? (
            <div className="space-y-1.5">
              <input
                autoFocus
                placeholder="Nome do token (camelCase)"
                value={newToken}
                onChange={e => setNewToken(e.target.value)}
                className="w-full text-xs font-mono bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-1.5 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              />
              <input
                placeholder="Rótulo legível"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                className="w-full text-xs bg-slate-100 dark:bg-slate-800 rounded-lg px-2.5 py-1.5 outline-none text-slate-700 dark:text-slate-200 placeholder:text-slate-400"
              />
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={handleCreate}
                  disabled={!newToken.trim() || !newLabel.trim()}
                  className="flex-1 text-xs py-1.5 rounded-lg bg-[#d97706] hover:bg-amber-600 text-white font-semibold disabled:opacity-50 transition-colors">
                  Criar e inserir
                </button>
                <button
                  onClick={() => { setCreating(false); setNewToken(''); setNewLabel('') }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 py-1 transition-colors">
              <Plus size={13} />
              Criar novo token
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
