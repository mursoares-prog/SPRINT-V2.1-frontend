// Editor inline da base de linhas dos pacotes (Admin → Variáveis dos pacotes).
//
// Substitui o antigo modal por edição na própria tela (estilo etapa 3): cada
// pacote pode ser aberto para editar todas as linhas inline (sem modal, exceto o
// popover de placeholders), adicionar/excluir/reordenar linhas, copiar/colar linhas
// entre pacotes, e — para pacotes CUSTOMIZADOS — editar nome/categoria/tecnologia,
// criar, duplicar e apagar. Salva o array completo por pacote (savePackageLines).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Plus, Check, Loader2, AlertTriangle, X, ChevronDown, ChevronRight, Copy, ClipboardPaste, ArrowUp, ArrowDown, CopyPlus, FilePlus2, Braces, FolderPlus } from 'lucide-react'
import {
  savePackageLines, createPackage, updatePackageMeta, deletePackage,
  createPackageGroup, deletePackageGroup,
  type BaseLine, type CustomPackageMeta, type LineOverride, type PackageLines, type PackageGroupInfo,
} from '../utils/api'
import { authHeader } from '../utils/auth'
import { PACKAGES } from '../data/packages'
import { SCOPE_CATEGORIES, categoryOfPackage } from '../data/scopeCategories'
import { PLACEHOLDER_CATALOG } from '../data/placeholderCatalog'
import { owFases, owAtividades, owOperacoes, owEtapas } from '../utils/ontologyReview'
import PACKAGE_LINES from '../data/packageLines.json'
import PACKAGE_LINE_DETAILS from '../data/packageLineDetails.json'

const PKG_LINES = PACKAGE_LINES as unknown as Record<string, (BaseLine & Record<string, unknown>)[]>
const PKG_DETAILS = PACKAGE_LINE_DETAILS as unknown as Record<string, ({ rec: string; pad: string } | null)[]>

const TECH_OPTIONS: { value: string; label: string }[] = [
  { value: 'none',       label: '—' },
  { value: 'wireline',   label: 'Arame (SL)' },
  { value: 'electric',   label: 'Cabo elétrico (WL)' },
  { value: 'ct',         label: 'Flexitubo (FT)' },
  { value: 'workstring', label: 'Coluna de Trabalho' },
  { value: 'bop',        label: 'BOP' },
]
const blankLine = (): EditLine => ({
  _id: uid(), text: '', duration: null, bop: null, compensando: null,
  isContingency: null, isParallel: null, owFase: null, owAtividade: null,
  owOperacao: null, owEtapa: null, genOperacao: null, genOperacaoDual: null, rec: '', pad: '',
})

type EditLine = BaseLine & { _id: string }
let _seq = 0
function uid() { return `el_${Date.now().toString(36)}_${(_seq++).toString(36)}` }
const stripId = (l: EditLine): BaseLine => { const { _id, ...rest } = l; void _id; return rest }
const numFromPrefix = (id: string) => parseInt(id.replace(/\D/g, ''), 10) || 0

export function AdminVarsEditor({ query, serverBase, pkgOverrides, legacyOverrides, customMetas, customGroups, fields, canEdit, reload }: {
  query: string
  serverBase: PackageLines | null
  pkgOverrides: Record<string, BaseLine[]>
  legacyOverrides: Map<string, LineOverride>
  customMetas: CustomPackageMeta[]
  customGroups: PackageGroupInfo[]
  fields: string[]
  canEdit: boolean
  reload: () => Promise<void>
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Record<string, EditLine[]>>({})
  const [metaDrafts, setMetaDrafts] = useState<Record<string, { name: string; technology: string }>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [clipboard, setClipboard] = useState<EditLine[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())  // `${pkgId}::${_id}`
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [ph, setPh] = useState<{ pkgId: string; lineId: string } | null>(null)
  const taRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const pkgRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [scrollTarget, setScrollTarget] = useState<string | null>(null)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const toggleCat = (id: string) => setCollapsedCats(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const [showNewGroupForm, setShowNewGroupForm] = useState(false)
  const [newGroupLabel, setNewGroupLabel] = useState('')

  useEffect(() => {
    if (!scrollTarget) return
    const el = pkgRefs.current[scrollTarget]
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setScrollTarget(null) }
  }, [scrollTarget, open])

  const customIds = useMemo(() => new Set(customMetas.map(m => m.pkgId)), [customMetas])
  const metaOf = (pkgId: string) => customMetas.find(m => m.pkgId === pkgId)
  const nameOf = (pkgId: string) => customIds.has(pkgId) ? (metaOf(pkgId)?.name ?? pkgId) : (PACKAGES[pkgId]?.name ?? '')


  const pkgIds = useMemo(() => {
    const ids = [...new Set([...Object.keys(PKG_LINES), ...customMetas.map(m => m.pkgId)])]
    return ids.sort((a, b) => numFromPrefix(a) - numFromPrefix(b))
  }, [customMetas])

  const buildLines = (pkgId: string): EditLine[] => {
    const ov = pkgOverrides[pkgId]
    if (ov) return ov.map(l => ({ ...l, _id: uid() }))
    const base = (serverBase?.[pkgId] as (BaseLine & Record<string, unknown>)[] | undefined) ?? PKG_LINES[pkgId] ?? []
    const det = PKG_DETAILS[pkgId] ?? []
    return base.map((l, i) => {
      const leg = legacyOverrides.get(`${pkgId}|${i}`)
      return {
        _id: uid(),
        text: l.text ?? '', duration: l.duration ?? null, bop: l.bop ?? null, compensando: l.compensando ?? null,
        isContingency: l.isContingency ?? null, isParallel: l.isParallel ?? null,
        owFase: l.owFase ?? null, owAtividade: l.owAtividade ?? null, owOperacao: l.owOperacao ?? null, owEtapa: l.owEtapa ?? null,
        genOperacao: l.genOperacao ?? null, genOperacaoDual: l.genOperacaoDual ?? null,
        rec: leg?.rec ?? det[i]?.rec ?? '', pad: leg?.pad ?? det[i]?.pad ?? '',
      }
    })
  }

  const openPkg = (pkgId: string) => {
    setOpen(prev => {
      const n = new Set(prev)
      if (n.has(pkgId)) { n.delete(pkgId); return n }
      n.add(pkgId)
      return n
    })
    if (!drafts[pkgId]) setDrafts(prev => ({ ...prev, [pkgId]: buildLines(pkgId) }))
    if (customIds.has(pkgId) && !metaDrafts[pkgId]) {
      const m = metaOf(pkgId)!
      setMetaDrafts(prev => ({ ...prev, [pkgId]: { name: m.name, technology: m.technology } }))
    }
  }

  const markDirty = (pkgId: string) => setDirty(prev => new Set(prev).add(pkgId))
  const setLines = (pkgId: string, fn: (ls: EditLine[]) => EditLine[]) => {
    setDrafts(prev => ({ ...prev, [pkgId]: fn(prev[pkgId] ?? []) }))
    markDirty(pkgId)
  }
  const patchLine = (pkgId: string, id: string, patch: Partial<EditLine>) =>
    setLines(pkgId, ls => ls.map(l => l._id === id ? { ...l, ...patch } : l))
  const insertAfter = (pkgId: string, id: string) => setLines(pkgId, ls => {
    const i = ls.findIndex(l => l._id === id)
    return [...ls.slice(0, i + 1), blankLine(), ...ls.slice(i + 1)]
  })
  const removeLine = (pkgId: string, id: string) => setLines(pkgId, ls => ls.filter(l => l._id !== id))
  const move = (pkgId: string, id: string, dir: -1 | 1) => setLines(pkgId, ls => {
    const i = ls.findIndex(l => l._id === id); const j = i + dir
    if (i < 0 || j < 0 || j >= ls.length) return ls
    const n = ls.slice(); [n[i], n[j]] = [n[j], n[i]]; return n
  })

  const toggleSel = (pkgId: string, id: string) => setSelected(prev => {
    const k = `${pkgId}::${id}`; const n = new Set(prev)
    n.has(k) ? n.delete(k) : n.add(k); return n
  })
  const copySelected = () => {
    const lines: EditLine[] = []
    for (const pkgId of open) for (const l of drafts[pkgId] ?? []) if (selected.has(`${pkgId}::${l._id}`)) lines.push(l)
    if (lines.length) setClipboard(lines.map(l => ({ ...l })))
  }
  const pasteInto = (pkgId: string, afterId: string | null) => {
    if (!clipboard) return
    const clones = clipboard.map(l => ({ ...l, _id: uid() }))
    setLines(pkgId, ls => {
      if (afterId === null) return [...ls, ...clones]
      const i = ls.findIndex(l => l._id === afterId)
      return [...ls.slice(0, i + 1), ...clones, ...ls.slice(i + 1)]
    })
  }

  const insertToken = (token: string) => {
    if (!ph) return
    const key = `${ph.pkgId}::${ph.lineId}`
    const ta = taRefs.current[key]
    const cur = (drafts[ph.pkgId] ?? []).find(l => l._id === ph.lineId)?.text ?? ''
    const start = ta?.selectionStart ?? cur.length
    const end = ta?.selectionEnd ?? cur.length
    const tok = `{{${token}=XXX}}`
    const next = cur.slice(0, start) + tok + cur.slice(end)
    patchLine(ph.pkgId, ph.lineId, { text: next })
    setTimeout(() => { ta?.focus(); ta?.setSelectionRange(start + tok.length, start + tok.length) }, 0)
  }

  const savePkg = async (pkgId: string) => {
    setBusy(pkgId); setError('')
    try {
      if (customIds.has(pkgId) && metaDrafts[pkgId]) {
        const m = metaOf(pkgId)!; const md = metaDrafts[pkgId]
        if (md.name !== m.name || md.technology !== m.technology)
          await updatePackageMeta(pkgId, md, authHeader())
      }
      await savePackageLines(pkgId, (drafts[pkgId] ?? []).map(stripId), authHeader())
      await reload()
      setDirty(prev => { const n = new Set(prev); n.delete(pkgId); return n })
      setDrafts(prev => { const n = { ...prev }; delete n[pkgId]; return n })
      setMetaDrafts(prev => { const n = { ...prev }; delete n[pkgId]; return n })
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  const revertPkg = (pkgId: string) => {
    setDrafts(prev => ({ ...prev, [pkgId]: buildLines(pkgId) }))
    if (customIds.has(pkgId)) { const m = metaOf(pkgId)!; setMetaDrafts(prev => ({ ...prev, [pkgId]: { name: m.name, technology: m.technology } })) }
    setDirty(prev => { const n = new Set(prev); n.delete(pkgId); return n })
  }

  const createNew = async () => {
    setBusy('__new__'); setError('')
    try {
      const meta = { name: 'Novo pacote', category: '', technology: 'none' }
      const r = await createPackage(meta, [], authHeader())
      await reload()
      setOpen(prev => { const n = new Set(prev); n.add(r.pkgId); return n })
      setDrafts(prev => ({ ...prev, [r.pkgId]: [blankLine()] }))
      setMetaDrafts(prev => ({ ...prev, [r.pkgId]: { name: 'Novo pacote', technology: 'none' } }))
      setScrollTarget(r.pkgId)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  const duplicate = async (pkgId: string) => {
    setBusy(pkgId); setError('')
    try {
      const technology = (customIds.has(pkgId) ? metaOf(pkgId)!.technology : PACKAGES[pkgId]?.technology) ?? 'none'
      const meta = { name: `Cópia de ${nameOf(pkgId)}`, category: '', technology }
      const lines = buildLines(pkgId).map(stripId)
      const r = await createPackage(meta, lines, authHeader())
      await reload()
      setOpen(prev => { const n = new Set(prev); n.add(r.pkgId); return n })
      setDrafts(prev => ({ ...prev, [r.pkgId]: lines.map(l => ({ ...l, _id: uid() })) }))
      setMetaDrafts(prev => ({ ...prev, [r.pkgId]: { name: meta.name, technology } }))
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }
  const removePkg = async (pkgId: string) => {
    setBusy(pkgId); setError('')
    try { await deletePackage(pkgId, authHeader()); await reload(); setOpen(prev => { const n = new Set(prev); n.delete(pkgId); return n }) }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const submitNewGroup = async () => {
    const label = newGroupLabel.trim()
    if (!label) return
    setBusy('__newgroup__'); setError('')
    try {
      await createPackageGroup(label, authHeader())
      await reload()
      setNewGroupLabel('')
      setShowNewGroupForm(false)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const removeGroup = async (id: string) => {
    setBusy(`__group__${id}`); setError('')
    try { await deletePackageGroup(id, authHeader()); await reload() }
    catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  const q = query.trim().toLowerCase()
  const visible = pkgIds.filter(id => !q || id.toLowerCase().includes(q) || nameOf(id).toLowerCase().includes(q))

  return (
    <div className="p-3 space-y-2">
      {canEdit && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <button onClick={createNew} disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0c2340] hover:bg-[#0e3a60] transition-colors disabled:opacity-50">
              <FilePlus2 size={13} /> Novo pacote
            </button>
            <button onClick={() => { setShowNewGroupForm(v => !v); setNewGroupLabel('') }} disabled={!!busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-[#0c2340] hover:text-[#0c2340] dark:hover:border-sky-400 dark:hover:text-sky-400 transition-colors disabled:opacity-50">
              <FolderPlus size={13} /> Novo grupo
            </button>
            <button onClick={copySelected} disabled={selected.size === 0}
              title="Copiar linhas selecionadas"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-[#d97706] hover:text-[#d97706] transition-colors disabled:opacity-40">
              <Copy size={13} /> Copiar ({selected.size})
            </button>
            {clipboard && <span className="text-[11px] text-slate-500">{clipboard.length} linha(s) na área de transferência</span>}
          </div>
          {showNewGroupForm && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                placeholder="Nome do grupo..."
                value={newGroupLabel}
                onChange={e => setNewGroupLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') void submitNewGroup(); if (e.key === 'Escape') setShowNewGroupForm(false) }}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#0c2340] dark:focus:border-sky-500 w-56"
              />
              <button onClick={() => void submitNewGroup()} disabled={!newGroupLabel.trim() || !!busy}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#008542] hover:bg-[#006b35] transition-colors disabled:opacity-40">
                <Check size={12} /> Criar
              </button>
              <button onClick={() => setShowNewGroupForm(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {SCOPE_CATEGORIES.map(cat => {
        const items = visible.filter(id => categoryOfPackage(id) === cat.id)
        const collapsed = collapsedCats.has(cat.id)
        return (
        <div key={cat.id} className="space-y-2">
          <button onClick={() => toggleCat(cat.id)}
            className="w-full flex items-center gap-1.5 pt-1 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
            {collapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
            <span className="text-[11px] font-bold uppercase tracking-wider">{cat.label}</span>
            {items.length > 0 && <span className="text-[10px] text-slate-400 tabular-nums">{items.length}</span>}
          </button>
          {!collapsed && (items.length === 0 ? (
            <p className="pl-6 text-[11px] text-slate-400 italic">vazio</p>
          ) : items.map(pkgId => {
        const isCustom = customIds.has(pkgId)
        const isOpen = open.has(pkgId)
        const lines = drafts[pkgId] ?? []
        const md = metaDrafts[pkgId]
        return (
          <div key={pkgId} ref={el => { pkgRefs.current[pkgId] = el }} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Cabeçalho do pacote */}
            <div className="flex items-center gap-2 px-3 py-2 bg-[#f5f5f5] dark:bg-slate-800/60">
              <button onClick={() => openPkg(pkgId)} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
              <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">{pkgId}</span>
              {isOpen && isCustom && md ? (
                <input value={md.name} onChange={e => { setMetaDrafts(prev => ({ ...prev, [pkgId]: { ...md, name: e.target.value } })); markDirty(pkgId) }}
                  className="flex-1 min-w-0 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-800 dark:text-slate-100" />
              ) : (
                <span className="flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-300 truncate">{nameOf(pkgId)}</span>
              )}
              {canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => duplicate(pkgId)} disabled={!!busy} title="Duplicar como novo pacote"
                    className="p-1 rounded text-slate-400 hover:text-[#d97706] hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><CopyPlus size={14} /></button>
                  {isCustom && (
                    <button onClick={() => removePkg(pkgId)} disabled={!!busy} title="Apagar pacote customizado"
                      className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"><Trash2 size={14} /></button>
                  )}
                </div>
              )}
            </div>

            {isOpen && (
              <div className="p-2 space-y-2">
                {isCustom && md && (
                  <div className="flex flex-wrap items-end gap-2 px-1">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Tecnologia</span>
                      <select value={md.technology} onChange={e => { setMetaDrafts(prev => ({ ...prev, [pkgId]: { ...md, technology: e.target.value } })); markDirty(pkgId) }}
                        className="rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-800 dark:text-slate-100">
                        {TECH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>
                )}

                <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-700">
                  <table className="w-full table-fixed border-collapse">
                    <colgroup>
                      <col className="w-7" /><col className="w-6" />
                      <col style={{ width: '24%' }} /><col className="w-12" /><col className="w-12" />
                      <col style={{ width: '15%' }} /><col style={{ width: '15%' }} />
                      <col style={{ width: '9%' }} /><col style={{ width: '11%' }} />
                      <col style={{ width: '11%' }} /><col style={{ width: '11%' }} /><col className="w-14" />
                    </colgroup>
                    <thead>
                      <tr className="text-left border-b border-slate-200 dark:border-slate-700">
                        <th /><th className={thCls}>#</th>
                        <th className={thCls}>Descrição</th>
                        <th className={`${thCls} text-right`}>Dur</th>
                        <th className={`${thCls} text-center`} title="Contingência / Paralela">C/P</th>
                        <th className={thCls}>Recomendações</th>
                        <th className={thCls}>Padrões</th>
                        <th className={thCls}>OW Fase</th>
                        <th className={thCls}>OW Atividade</th>
                        <th className={thCls}>OW Operação</th>
                        <th className={thCls}>OW Etapa</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const key = `${pkgId}::${l._id}`
                        return (
                          <tr key={l._id} className="align-top border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-800/25">
                            <td className="px-1 py-1"><input type="checkbox" checked={selected.has(key)} onChange={() => toggleSel(pkgId, l._id)} className="mt-1 accent-[#0c2340]" title="Selecionar (copiar)" /></td>
                            <td className="px-1 py-1 text-[10px] font-mono text-slate-400">{i + 1}</td>
                            <td className="px-0.5 py-0.5">
                              <div className="flex items-start gap-0.5">
                                <textarea ref={el => { taRefs.current[key] = el }} value={l.text} onChange={e => patchLine(pkgId, l._id, { text: e.target.value })} rows={2} className={cellCls} />
                                <button onClick={() => setPh({ pkgId, lineId: l._id })} title="Inserir placeholder" className="shrink-0 mt-0.5 p-0.5 rounded text-slate-400 hover:text-[#d97706]"><Braces size={13} /></button>
                              </div>
                            </td>
                            <td className="px-0.5 py-0.5"><input type="number" min={0} step="0.01" value={l.duration ?? ''} title="Duração (h)" onChange={e => patchLine(pkgId, l._id, { duration: e.target.value === '' ? null : parseFloat(e.target.value) })} className={`${cellCls} text-right`} /></td>
                            <td className="px-0.5 py-1">
                              <div className="flex items-center justify-center gap-1.5">
                                <input type="checkbox" title="Contingência" checked={!!l.isContingency} onChange={e => patchLine(pkgId, l._id, { isContingency: e.target.checked })} className="accent-[#0c2340]" />
                                <input type="checkbox" title="Paralela" checked={!!l.isParallel} onChange={e => patchLine(pkgId, l._id, { isParallel: e.target.checked })} className="accent-[#0c2340]" />
                              </div>
                            </td>
                            <td className="px-0.5 py-0.5"><textarea value={l.rec ?? ''} title="Recomendações" onChange={e => patchLine(pkgId, l._id, { rec: e.target.value })} rows={2} className={cellCls} /></td>
                            <td className="px-0.5 py-0.5"><textarea value={l.pad ?? ''} title="Padrões" onChange={e => patchLine(pkgId, l._id, { pad: e.target.value })} rows={2} className={cellCls} /></td>
                            <td className="px-0.5 py-0.5"><OntCell value={l.owFase ?? ''} options={owFases()} onChange={v => patchLine(pkgId, l._id, { owFase: v, owAtividade: '', owOperacao: '', owEtapa: '' })} /></td>
                            <td className="px-0.5 py-0.5"><OntCell value={l.owAtividade ?? ''} options={owAtividades(l.owFase ?? '')} onChange={v => patchLine(pkgId, l._id, { owAtividade: v, owOperacao: '', owEtapa: '' })} /></td>
                            <td className="px-0.5 py-0.5"><OntCell value={l.owOperacao ?? ''} options={owOperacoes(l.owFase ?? '', l.owAtividade ?? '')} onChange={v => patchLine(pkgId, l._id, { owOperacao: v, owEtapa: '' })} /></td>
                            <td className="px-0.5 py-0.5"><OntCell value={l.owEtapa ?? ''} options={owEtapas(l.owFase ?? '', l.owAtividade ?? '', l.owOperacao ?? '')} onChange={v => patchLine(pkgId, l._id, { owEtapa: v })} /></td>
                            <td className="px-1 py-1">
                              <div className="flex flex-wrap gap-0.5 w-12">
                                <button onClick={() => move(pkgId, l._id, -1)} title="Subir" className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><ArrowUp size={12} /></button>
                                <button onClick={() => move(pkgId, l._id, 1)} title="Descer" className="p-0.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><ArrowDown size={12} /></button>
                                <button onClick={() => insertAfter(pkgId, l._id)} title="Inserir linha abaixo" className="p-0.5 rounded text-slate-400 hover:text-emerald-600"><Plus size={12} /></button>
                                {clipboard && <button onClick={() => pasteInto(pkgId, l._id)} title="Colar abaixo" className="p-0.5 rounded text-slate-400 hover:text-sky-600"><ClipboardPaste size={12} /></button>}
                                <button onClick={() => removeLine(pkgId, l._id)} title="Excluir linha" className="p-0.5 rounded text-slate-400 hover:text-rose-600"><Trash2 size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé do pacote */}
                <div className="flex items-center gap-2 pt-1">
                  {clipboard && <button onClick={() => pasteInto(pkgId, null)} className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-sky-400 hover:text-sky-600"><ClipboardPaste size={12} /> Colar no fim</button>}
                  <div className="ml-auto flex items-center gap-2">
                    {dirty.has(pkgId) && <span className="text-[11px] text-amber-600">não salvo</span>}
                    <button onClick={() => revertPkg(pkgId)} disabled={busy === pkgId || !dirty.has(pkgId)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40">Reverter</button>
                    <button onClick={() => savePkg(pkgId)} disabled={busy === pkgId || !dirty.has(pkgId)}
                      className="flex items-center gap-1.5 px-4 py-1 rounded-lg text-xs font-semibold text-white bg-[#0c2340] hover:bg-[#0e3a60] disabled:opacity-40">
                      {busy === pkgId ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Salvar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      }))}
        </div>
        )
      })}

      {customGroups.map(grp => {
        const collapsed = collapsedCats.has(grp.id)
        return (
          <div key={grp.id} className="space-y-2">
            <div className="w-full flex items-center gap-1.5 pt-1">
              <button onClick={() => toggleCat(grp.id)} className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
                {collapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
                <span className="text-[11px] font-bold uppercase tracking-wider">{grp.label}</span>
              </button>
              {canEdit && (
                <button onClick={() => void removeGroup(grp.id)} disabled={!!busy} title="Remover grupo"
                  className="ml-1 p-0.5 rounded text-slate-400 hover:text-rose-600 transition-colors disabled:opacity-40">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            {!collapsed && (
              <p className="pl-6 text-[11px] text-slate-400 italic">vazio</p>
            )}
          </div>
        )
      })}

      {/* Popover de placeholders */}
      {ph && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setPh(null)}>
          <div onClick={e => e.stopPropagation()} className="bg-[#f5f5f5] dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md max-h-[70vh] flex flex-col">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700">
              <Braces size={14} className="text-[#d97706]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex-1">Inserir placeholder</h3>
              <button onClick={() => setPh(null)} className="p-1 rounded text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><X size={15} /></button>
            </div>
            <div className="p-3 overflow-y-auto scrollbar-custom space-y-2">
              {PLACEHOLDER_CATALOG.map(g => {
                const fs = fields.length > 0 ? g.fields.filter(f => fields.includes(f.token)) : g.fields
                if (!fs.length) return null
                return (
                  <div key={g.title}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{g.title}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {fs.map(f => (
                        <button key={f.token} onClick={() => insertToken(f.token)} title={`{{${f.token}=XXX}}`}
                          className="flex flex-col items-start text-left px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-[#d97706] hover:text-[#d97706] min-w-0">
                          <span className="text-[11px] leading-tight truncate w-full">{f.label}</span>
                          <span className="text-[9px] font-mono text-slate-400 truncate w-full">{f.token}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Estilo "planilha": controles sem borda, fundo transparente; realce só no hover/foco.
const cellCls = 'w-full bg-transparent rounded px-1 py-0.5 text-xs text-slate-600 dark:text-slate-400 leading-snug outline-none hover:bg-white dark:hover:bg-slate-800/60 focus:bg-white dark:focus:bg-slate-800 focus:ring-1 focus:ring-sky-400 resize-y'
const thCls = 'px-1 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 align-bottom'

// Célula de ontologia (select sem rótulo). Inclui o valor atual mesmo fora da lista.
function OntCell({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const opts = value && !options.includes(value) ? [value, ...options] : options
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={cellCls}>
      <option value="">—</option>
      {opts.map(op => <option key={op} value={op}>{op}</option>)}
    </select>
  )
}
