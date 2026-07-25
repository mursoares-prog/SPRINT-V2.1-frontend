// Editor admin das definições de campo do assistente de preenchimento (Etapa 3).
// Cada placeholder {{token=glifo}} pode ter um campo associado no assistente
// (ProjectDataPanel); antes isso era hardcoded no componente — aqui o admin
// cadastra rótulo, tipo, unidade, opções de picklist e uma relação simples de
// dependência com outro campo (mostrar/habilitar só quando outro tiver certo valor).
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Plus, Trash2, Loader2, AlertTriangle, GripVertical, Undo2, Redo2, History, X, Undo,
  Columns3, Rows3, FolderInput, CircleOff, ArrowDownWideNarrow, Info, Search, PocketKnife,
} from 'lucide-react'
import {
  isApiConfigured, listPlaceholderFieldDefs, savePlaceholderFieldDef, deletePlaceholderFieldDef,
  reorderPlaceholderFieldDefs, listChangelog, undoChangelog,
  type PlaceholderFieldDef, type PlaceholderFieldType, type PlaceholderReorderItem, type ChangeLogEntry,
} from '../utils/api'
import { authHeader } from '../utils/auth'
import { TagInput } from './TagInput'
import { ComboInput } from './ComboInput'
import { PACKAGES } from '../data/packages'
import { WirelineToolsPanel } from './WirelineToolsPanel'
// Derivação de uso token↔pacote compartilhada com o assistente (engine assistantFields).
import { packagesUsingToken, linesUsingToken } from '../engines/assistantFields'

const TYPE_LABELS: Record<PlaceholderFieldType, string> = {
  text: 'Texto', number: 'Número', unit: 'Número + unidade', picklist: 'Picklist', boolean: 'Booleano (sim/não)',
}
const TYPES: PlaceholderFieldType[] = ['text', 'number', 'unit', 'picklist', 'boolean']
const UNGROUPED = '(sem grupo)'
const LOG_PACOTE = 'placeholder-defs'
const LAYOUT_KEY = 'placeholderDefsMultiCol'

function emptyDraft(): PlaceholderFieldDef {
  return {
    token: '', label: '', fieldType: 'text', unit: null, options: [],
    group: null, subgroup: null, orderIndex: 0, dependsOnToken: null, dependsOnValue: null, author: null,
  }
}

// Agrupa os itens (já ordenados por orderIndex) de uma seção em blocos por
// subgrupo, preservando a ordem de primeira aparição — o segundo nível
// (ex.: "BHA - Arame" > "Gabaritagem") exibido dentro do card da seção.
function clusterBySubgroup(items: PlaceholderFieldDef[]): { subgroup: string | null; items: PlaceholderFieldDef[] }[] {
  const order: (string | null)[] = []
  const map = new Map<string | null, PlaceholderFieldDef[]>()
  for (const it of items) {
    const key = it.subgroup?.trim() || null
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(it)
  }
  return order.map(key => ({ subgroup: key, items: map.get(key)! }))
}

// Busca insensível a acento/caixa sobre token, rótulo, grupo e subgrupo.
const normalizeSearch = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function defMatchesQuery(d: PlaceholderFieldDef, q: string): boolean {
  const nq = normalizeSearch(q)
  return normalizeSearch(d.token).includes(nq)
    || normalizeSearch(d.label).includes(nq)
    || normalizeSearch(d.group ?? '').includes(nq)
    || normalizeSearch(d.subgroup ?? '').includes(nq)
}

type Drag = { kind: 'section'; group: string } | { kind: 'field'; group: string; token: string }
type DropTarget = { kind: 'section'; group: string } | { kind: 'field'; group: string; token: string | null }

// Pilha de desfazer/refazer local (sessão atual). Cada entrada guarda o
// suficiente para reaplicar (`after`) ou reverter (`before`) a ação — usa os
// mesmos endpoints que a UI já chama, então também aparece no log do backend.
type HistoryEntry =
  | { kind: 'create'; after: PlaceholderFieldDef }
  | { kind: 'edit'; before: PlaceholderFieldDef; after: PlaceholderFieldDef }
  | { kind: 'delete'; before: PlaceholderFieldDef }
  | { kind: 'reorder'; before: PlaceholderReorderItem[]; after: PlaceholderReorderItem[] }

export function PlaceholderDefsEditor({ canEdit }: { canEdit: boolean }) {
  const [defs, setDefs] = useState<PlaceholderFieldDef[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [future, setFuture] = useState<HistoryEntry[]>([])
  const [showLog, setShowLog] = useState(false)
  const [logEntries, setLogEntries] = useState<ChangeLogEntry[] | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [multiCol, setMultiCol] = useState(() => localStorage.getItem(LAYOUT_KEY) !== 'false')
  const [usageToken, setUsageToken] = useState<string | null>(null)
  const [onlyUnused, setOnlyUnused] = useState(false)
  const [sortByUsage, setSortByUsage] = useState(false)
  const [query, setQuery] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const [showTools, setShowTools] = useState(false)
  const [editingSubgroup, setEditingSubgroup] = useState<{ group: string; subgroup: string } | null>(null)
  const [subgroupDraft, setSubgroupDraft] = useState('')
  useEffect(() => { localStorage.setItem(LAYOUT_KEY, String(multiCol)) }, [multiCol])
  useEffect(() => {
    if (!showInfo) return
    const close = () => setShowInfo(false)
    // Adia o listener para o próximo tick — evita que o MESMO clique que abriu
    // o popover (ainda se propagando até window) já dispare o fechamento.
    const t = setTimeout(() => window.addEventListener('click', close), 0)
    return () => { clearTimeout(t); window.removeEventListener('click', close) }
  }, [showInfo])

  const load = useCallback(async () => {
    if (!isApiConfigured()) { setDefs([]); setError('Sem backend configurado — as definições não podem ser salvas.'); return }
    try { setDefs(await listPlaceholderFieldDefs()); setError('') }
    catch (e) { setError((e as Error).message); setDefs([]) }
  }, [])
  useEffect(() => { void load() }, [load])

  const loadLog = useCallback(async () => {
    try { setLogEntries((await listChangelog()).filter(e => e.pacote === LOG_PACOTE)) }
    catch (e) { setError((e as Error).message) }
  }, [])
  useEffect(() => { if (showLog) void loadLog() }, [showLog, loadLog])

  const pushHistory = (entry: HistoryEntry) => {
    setHistory(prev => [...prev, entry].slice(-30))
    setFuture([])
  }

  const applyForward = (entry: HistoryEntry) => {
    switch (entry.kind) {
      case 'create': return savePlaceholderFieldDef(entry.after, authHeader())
      case 'edit': return savePlaceholderFieldDef(entry.after, authHeader())
      case 'delete': return deletePlaceholderFieldDef(entry.before.token, authHeader())
      case 'reorder': return reorderPlaceholderFieldDefs(entry.after, authHeader())
    }
  }
  const applyInverse = (entry: HistoryEntry) => {
    switch (entry.kind) {
      case 'create': return deletePlaceholderFieldDef(entry.after.token, authHeader())
      case 'edit': return savePlaceholderFieldDef(entry.before, authHeader())
      case 'delete': return savePlaceholderFieldDef(entry.before, authHeader())
      case 'reorder': return reorderPlaceholderFieldDefs(entry.before, authHeader())
    }
  }

  const handleUndo = useCallback(async () => {
    if (history.length === 0 || busy) return
    const entry = history[history.length - 1]
    setBusy(true); setError('')
    try {
      await applyInverse(entry)
      setHistory(prev => prev.slice(0, -1))
      setFuture(prev => [...prev, entry])
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [history, busy, load])

  const handleRedo = useCallback(async () => {
    if (future.length === 0 || busy) return
    const entry = future[future.length - 1]
    setBusy(true); setError('')
    try {
      await applyForward(entry)
      setFuture(prev => prev.slice(0, -1))
      setHistory(prev => [...prev, entry])
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [future, busy, load])

  // Atalhos de teclado: Cmd/Ctrl+Z desfaz, Cmd/Ctrl+Shift+Z (ou Ctrl+Y) refaz.
  useEffect(() => {
    if (!canEdit) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && e.shiftKey) { e.preventDefault(); void handleRedo() }
      else if (k === 'z') { e.preventDefault(); void handleUndo() }
      else if (k === 'y') { e.preventDefault(); void handleRedo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canEdit, handleUndo, handleRedo])

  const handleDelete = async (token: string) => {
    if (!window.confirm(`Remover a definição do campo {{${token}}}? O placeholder deixa de aparecer no assistente.`)) return
    const before = defs?.find(d => d.token === token)
    if (!before) return
    setBusy(true); setError('')
    try {
      await deletePlaceholderFieldDef(token, authHeader())
      pushHistory({ kind: 'delete', before })
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  // `closeCreate`: usado só pelo formulário de criação, pra fechar o card ao salvar.
  const handleSave = async (draft: PlaceholderFieldDef, closeCreate?: boolean) => {
    setBusy(true); setError('')
    const before = defs?.find(d => d.token === draft.token) ?? null
    try {
      const saved = await savePlaceholderFieldDef(draft, authHeader())
      pushHistory(before ? { kind: 'edit', before, after: saved } : { kind: 'create', after: saved })
      await load()
      if (closeCreate) setCreating(false)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  // Recalcula orderIndex (e group, se um campo mudou de seção) a partir da ordem
  // final desejada e salva em lote (uma única transação/entrada de changelog).
  // `subgroupOverride` força o subgrupo de UM item (o arrastado) para o do alvo
  // do drop — os demais mantêm seu subgroup original (lido do objeto, ainda não
  // mutado; se já viesse pré-mutado a comparação de diff nunca acusaria mudança).
  const persistOrder = async (
    groupOrder: string[],
    itemsByGroup: Map<string, PlaceholderFieldDef[]>,
    subgroupOverride?: { token: string; subgroup: string | null },
  ) => {
    const beforeItems: PlaceholderReorderItem[] = []
    const afterItems: PlaceholderReorderItem[] = []
    let idx = 0
    for (const g of groupOrder) {
      for (const it of itemsByGroup.get(g) ?? []) {
        const newGroup = g === UNGROUPED ? null : g
        const newSubgroup = subgroupOverride?.token === it.token ? subgroupOverride.subgroup : (it.subgroup ?? null)
        if (it.orderIndex !== idx || (it.group ?? null) !== newGroup || (it.subgroup ?? null) !== newSubgroup) {
          beforeItems.push({ token: it.token, orderIndex: it.orderIndex, group: it.group ?? null, subgroup: it.subgroup ?? null })
          afterItems.push({ token: it.token, orderIndex: idx, group: newGroup, subgroup: newSubgroup })
        }
        idx++
      }
    }
    if (afterItems.length === 0) return
    setBusy(true); setError('')
    try {
      await reorderPlaceholderFieldDefs(afterItems, authHeader())
      pushHistory({ kind: 'reorder', before: beforeItems, after: afterItems })
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  // Renomeia uma subseção inteira — atualiza o subgroup de todos os campos que a
  // compartilham, em uma única transação (mesmo endpoint do drag-and-drop).
  const renameSubgroup = async (group: string, oldSubgroup: string, newSubgroup: string) => {
    const trimmed = newSubgroup.trim()
    if (!trimmed || trimmed === oldSubgroup) return
    const arr = groups.get(group) ?? []
    const beforeItems: PlaceholderReorderItem[] = []
    const afterItems: PlaceholderReorderItem[] = []
    for (const it of arr) {
      if ((it.subgroup ?? '').trim() === oldSubgroup) {
        beforeItems.push({ token: it.token, orderIndex: it.orderIndex, group: it.group ?? null, subgroup: it.subgroup ?? null })
        afterItems.push({ token: it.token, orderIndex: it.orderIndex, group: it.group ?? null, subgroup: trimmed })
      }
    }
    if (afterItems.length === 0) return
    setBusy(true); setError('')
    try {
      await reorderPlaceholderFieldDefs(afterItems, authHeader())
      pushHistory({ kind: 'reorder', before: beforeItems, after: afterItems })
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const handleLogUndo = async (id: number) => {
    setBusy(true); setError('')
    try {
      await undoChangelog(id, authHeader())
      // Desfazer pelo log pode reverter qualquer ponto do histórico, não só o
      // topo da pilha local — invalida undo/redo da sessão para não confundir.
      setHistory([]); setFuture([])
      await Promise.all([load(), loadLog()])
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  if (defs === null) {
    return <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
  }

  const groups = new Map<string, PlaceholderFieldDef[]>()
  for (const d of [...defs].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const g = d.group?.trim() || UNGROUPED
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(d)
  }
  const allTokens = defs.map(d => d.token)
  const allGroups = [...new Set(defs.map(d => d.group?.trim()).filter((g): g is string => !!g))].sort()
  const allSubgroups = [...new Set(defs.map(d => d.subgroup?.trim()).filter((g): g is string => !!g))].sort()
  // Busca ativa (filtra os campos por token/rótulo/grupo/subgrupo).
  const q = query.trim()
  const noSearchResults = !!q && !defs.some(d => defMatchesQuery(d, q))
  // Contagem de pacotes por token — badge redonda ao lado do rótulo de cada campo.
  const pkgCountByToken = new Map(defs.map(d => [d.token, packagesUsingToken(d.token).length]))

  const cloneGroups = () => {
    const byGroup = new Map<string, PlaceholderFieldDef[]>()
    for (const [g, items] of groups) byGroup.set(g, [...items])
    return byGroup
  }

  // Move um campo para outra seção/subseção (acionado pelo botão "Mover", não por
  // drag-and-drop) — anexa ao fim da seção de destino, reaproveitando persistOrder.
  const moveField = (token: string, newGroup: string | null, newSubgroup: string | null) => {
    const byGroup = cloneGroups()
    let moved: PlaceholderFieldDef | undefined
    for (const arr of byGroup.values()) {
      const idx = arr.findIndex(d => d.token === token)
      if (idx >= 0) { [moved] = arr.splice(idx, 1); break }
    }
    if (!moved) return
    const targetKey = newGroup?.trim() || UNGROUPED
    if (!byGroup.has(targetKey)) byGroup.set(targetKey, [])
    byGroup.get(targetKey)!.push(moved)
    const groupOrder = [...groups.keys()]
    if (!groupOrder.includes(targetKey)) groupOrder.push(targetKey)
    void persistOrder(groupOrder, byGroup, { token, subgroup: newSubgroup?.trim() || null })
  }

  // Semântica: soltar sobre um item sempre insere a origem logo DEPOIS dele — em
  // ambas as direções. `to` é calculado no array ORIGINAL (antes de remover a
  // origem) e só então ajustado para o array pós-remoção; comparar um índice
  // pré-remoção com um pós-remoção diretamente (sem essa correção) produz um
  // no-op sempre que o alvo é o vizinho imediato seguinte da origem.
  const reinsertAfter = <T,>(arr: T[], fromIdx: number, targetIdx: number): T[] => {
    const next = [...arr]
    const [moved] = next.splice(fromIdx, 1)
    const adjustedTarget = targetIdx > fromIdx ? targetIdx - 1 : targetIdx
    next.splice(adjustedTarget + 1, 0, moved)
    return next
  }

  const endDrag = () => { dragRef.current = null; setDropTarget(null) }

  const handleSectionDrop = (targetGroup: string) => {
    const drag = dragRef.current
    endDrag()
    if (!drag || drag.kind !== 'section' || drag.group === targetGroup) return
    const order = [...groups.keys()]
    const from = order.indexOf(drag.group)
    const to = order.indexOf(targetGroup)
    if (from < 0 || to < 0) return
    void persistOrder(reinsertAfter(order, from, to), groups)
  }

  const handleFieldDrop = (targetGroup: string, targetToken: string | null) => {
    const drag = dragRef.current
    endDrag()
    if (!drag || drag.kind !== 'field') return
    const byGroup = cloneGroups()
    const sourceArr = byGroup.get(drag.group)
    if (!sourceArr) return
    const fromIdx = sourceArr.findIndex(d => d.token === drag.token)
    if (fromIdx < 0) return
    // Soltar sobre um campo herda o SUBGRUPO dele (permite arrastar um campo para
    // dentro de um bloco de subgrupo); soltar na área vazia da seção limpa o subgroup.
    const targetSubgroup = targetToken
      ? (byGroup.get(targetGroup)?.find(d => d.token === targetToken)?.subgroup ?? null)
      : null
    if (drag.group === targetGroup) {
      // Mesma seção: reordena dentro do próprio array.
      const targetIdx = targetToken ? sourceArr.findIndex(d => d.token === targetToken) : sourceArr.length - 1
      byGroup.set(targetGroup, reinsertAfter(sourceArr, fromIdx, targetIdx < 0 ? sourceArr.length - 1 : targetIdx))
    } else {
      // Seção diferente: remove da origem e insere logo após o alvo (ou no fim, se
      // solto na área vazia do card — targetToken null).
      const [moved] = sourceArr.splice(fromIdx, 1)
      if (!byGroup.has(targetGroup)) byGroup.set(targetGroup, [])
      const targetArr = byGroup.get(targetGroup)!
      const targetIdx = targetToken ? targetArr.findIndex(d => d.token === targetToken) : targetArr.length - 1
      targetArr.splice(targetIdx + 1, 0, moved)
    }
    const groupOrder = [...groups.keys()]
    if (!groupOrder.includes(targetGroup)) groupOrder.push(targetGroup)
    void persistOrder(groupOrder, byGroup, { token: drag.token, subgroup: targetSubgroup })
  }

  return (
    <div className="p-3 space-y-3">
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span className="flex-1">{error}</span>
          <button onClick={() => void load()} className="shrink-0 font-semibold underline hover:no-underline">Tentar novamente</button>
        </div>
      )}

      <div className="sticky top-0 z-20 -mx-3 -mt-3 px-3 pt-3 pb-2 flex items-center justify-between gap-3 bg-[#f5f5f5] dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="relative shrink-0">
          <button
            onClick={() => setShowInfo(v => !v)}
            title="Como usar esta aba"
            className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
              showInfo ? 'text-[#005889] dark:text-sky-400 border-[#005889]/40 dark:border-sky-700 bg-[#005889]/5 dark:bg-sky-950/30'
                       : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}>
            <Info size={15} />
          </button>
          {showInfo && (
            <div
              onClick={e => e.stopPropagation()}
              className="absolute left-0 top-9 z-30 w-80 text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 rounded-lg shadow-lg ring-1 ring-slate-200 dark:ring-slate-700 p-3 leading-relaxed">
              Cada campo aqui define como o placeholder <code className="text-[10px]">{'{{token=…}}'}</code> aparece
              no assistente de preenchimento da Etapa 3. Clique no rótulo, tipo ou unidade para editar direto;
              arraste pelo <GripVertical size={10} className="inline -mt-0.5" /> para reordenar; clique na bolinha de
              contagem para ver os pacotes.
            </div>
          )}
        </div>
        {/* Canivete suíço — tabela de referência de ferramentas de arame */}
        <button
          onClick={() => setShowTools(true)}
          title="Ferramentas de arame (aplicação/pescaria por equipamento)"
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <PocketKnife size={15} />
        </button>
        {/* Busca — filtra os campos por token/rótulo/grupo/subgrupo */}
        <div className="flex-1 min-w-0 max-w-xs flex items-center gap-1.5 h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <Search size={13} className="shrink-0 text-slate-400 dark:text-slate-500" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
            placeholder="Buscar campo…"
            className="flex-1 min-w-0 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          {query && (
            <button onClick={() => setQuery('')} title="Limpar busca" className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <select
            value=""
            onChange={e => {
              const g = e.target.value
              if (!g) return
              setCollapsed(prev => { if (!prev.has(g)) return prev; const next = new Set(prev); next.delete(g); return next })
              requestAnimationFrame(() => {
                document.getElementById(`ph-group-${g}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              })
            }}
            title="Ir para seção"
            className="h-8 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors outline-none max-w-[160px]">
            <option value="">Ir para seção…</option>
            {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <button
            onClick={() => setSortByUsage(v => !v)}
            title="Ordenar campos por quantidade de pacotes associados"
            className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold border transition-colors ${
              sortByUsage ? 'text-[#005889] dark:text-sky-400 border-[#005889]/40 dark:border-sky-700 bg-[#005889]/5 dark:bg-sky-950/30'
                          : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}>
            <ArrowDownWideNarrow size={13} /> Por pacotes
          </button>
          <button
            onClick={() => setMultiCol(v => !v)}
            title={multiCol ? 'Exibir em 1 coluna' : 'Exibir em várias colunas'}
            className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            {multiCol ? <><Columns3 size={13} /> Colunas</> : <><Rows3 size={13} /> 1 coluna</>}
          </button>
          <button
            onClick={() => setOnlyUnused(v => !v)}
            title="Mostrar apenas placeholders sem pacote associado"
            className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold border transition-colors ${
              onlyUnused ? 'text-[#005889] dark:text-sky-400 border-[#005889]/40 dark:border-sky-700 bg-[#005889]/5 dark:bg-sky-950/30'
                         : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}>
            <CircleOff size={13} /> Sem pacote
          </button>
          {canEdit && (
          <>
            <button
              onClick={() => void handleUndo()} disabled={history.length === 0 || busy}
              title="Desfazer (Ctrl/Cmd+Z)"
              className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Undo2 size={13} /> Desfazer
            </button>
            <button
              onClick={() => void handleRedo()} disabled={future.length === 0 || busy}
              title="Refazer (Ctrl/Cmd+Shift+Z)"
              className="flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <Redo2 size={13} /> Refazer
            </button>
            <button
              onClick={() => setShowLog(v => !v)}
              title="Log de alterações"
              className={`flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                showLog ? 'text-[#005889] dark:text-sky-400 border-[#005889]/40 dark:border-sky-700 bg-[#005889]/5 dark:bg-sky-950/30'
                        : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}>
              <History size={13} /> Log
            </button>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white bg-[#008542] hover:bg-[#006b35] dark:bg-amber-600 dark:hover:bg-amber-700 transition-colors">
              <Plus size={13} /> Novo campo
            </button>
          </>
          )}
        </div>
      </div>

      {showLog ? (
        <ChangeLogPanel
          entries={logEntries}
          busy={busy}
          onUndo={id => void handleLogUndo(id)}
          onClose={() => setShowLog(false)}
        />
      ) : (
        <>
          {creating && (
            <div className="rounded-xl overflow-hidden shadow-sm ring-1 ring-[#005889]/30 dark:ring-sky-800">
              <DefForm
                draft={emptyDraft()}
                isNew
                allTokens={allTokens}
                allGroups={allGroups}
                busy={busy}
                onCancel={() => setCreating(false)}
                onSave={d => void handleSave(d, true)}
              />
            </div>
          )}

          {defs.length === 0 && !creating && (
            <p className="text-sm text-slate-500 text-center py-10">Nenhum campo cadastrado ainda.</p>
          )}

          {noSearchResults && (
            <p className="text-sm text-slate-500 text-center py-10">Nenhum campo encontrado para “{q}”.</p>
          )}

          {/* Seções em 3 colunas (estilo jornal) no mesmo visual do assistente de
              preenchimento (ProjectDataPanel): card rounded-xl com header +/- e linhas
              rótulo↔valor separadas por borda fina. No modo 1 coluna, metade da
              largura da tela, centralizado. */}
          <div className={`gap-3 [column-fill:balance] ${multiCol ? 'columns-1 md:columns-2 xl:columns-3' : 'columns-1 w-full md:w-1/2 mx-auto'}`}>
          {(sortByUsage
            ? [...groups.entries()].sort(([, a], [, b]) => {
                const maxA = Math.max(0, ...a.map(d => pkgCountByToken.get(d.token) ?? 0))
                const maxB = Math.max(0, ...b.map(d => pkgCountByToken.get(d.token) ?? 0))
                return maxB - maxA
              })
            : [...groups.entries()]
          ).map(([group, allItems]) => {
            let items = onlyUnused ? allItems.filter(d => (pkgCountByToken.get(d.token) ?? 0) === 0) : allItems
            if (q) items = items.filter(d => defMatchesQuery(d, q))
            if (items.length === 0) return null
            if (sortByUsage) {
              items = [...items].sort((a, b) => (pkgCountByToken.get(b.token) ?? 0) - (pkgCountByToken.get(a.token) ?? 0))
            }
            // Durante a busca, sempre expande as seções com resultado (ignora o colapso).
            const isCollapsed = !q && collapsed.has(group)
            const sectionDropActive = dropTarget?.kind === 'section' && dropTarget.group === group
            return (
              // Wrapper não-arrastável: o card em si carrega o drag/drop; a barra fina
              // abaixo dele é o indicador de POSIÇÃO de destino (o vão entre esta seção
              // e a próxima) — evita destacar a seção inteira.
              <div key={group} id={`ph-group-${group}`} className="break-inside-avoid-column mb-3 scroll-mt-16">
                <div
                  className="rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-300 dark:ring-slate-700/60 transition-colors"
                  draggable={canEdit}
                  onDragStart={e => { e.stopPropagation(); dragRef.current = { kind: 'section', group }; e.dataTransfer.effectAllowed = 'move' }}
                  onDragEnd={endDrag}
                  onDragOver={e => {
                    if (!dragRef.current) return
                    e.preventDefault()
                    if (dragRef.current.kind === 'section') setDropTarget({ kind: 'section', group })
                  }}
                  onDrop={e => { e.preventDefault(); e.stopPropagation(); handleSectionDrop(group) }}>
                  <div className={`flex items-center gap-1.5 px-2.5 py-2 bg-[#ebebeb] dark:bg-slate-800/50 ${!isCollapsed ? 'border-b border-slate-300 dark:border-slate-700/50' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                    {canEdit && <GripVertical size={12} className="shrink-0 text-slate-400 dark:text-slate-600" />}
                    <button
                      onClick={() => setCollapsed(prev => {
                        const next = new Set(prev)
                        if (next.has(group)) next.delete(group); else next.add(group)
                        return next
                      })}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
                      <span className="w-4 font-bold text-sm leading-none select-none text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                        {isCollapsed ? '+' : '−'}
                      </span>
                      <span className="text-xs font-bold tracking-wide text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                        {group}
                      </span>
                    </button>
                    <span className="shrink-0 text-[10px] text-slate-500 dark:text-slate-500">{items.length} campo{items.length === 1 ? '' : 's'}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="px-2.5 py-1.5 space-y-0.5"
                      onDragOver={e => {
                        if (dragRef.current?.kind !== 'field') return
                        e.preventDefault()
                        setDropTarget({ kind: 'field', group, token: null })
                      }}
                      onDrop={e => {
                        e.preventDefault()
                        if (dragRef.current?.kind === 'field') { e.stopPropagation(); handleFieldDrop(group, null) }
                      }}>
                    {clusterBySubgroup(items).map((cluster, ci) => (
                      <div key={cluster.subgroup ?? ' '}>
                        {cluster.subgroup && (
                          editingSubgroup?.group === group && editingSubgroup.subgroup === cluster.subgroup ? (
                            <input
                              autoFocus
                              value={subgroupDraft}
                              onChange={e => setSubgroupDraft(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              onBlur={() => { void renameSubgroup(group, cluster.subgroup!, subgroupDraft); setEditingSubgroup(null) }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.currentTarget.blur() }
                                if (e.key === 'Escape') { setEditingSubgroup(null) }
                              }}
                              className={`w-full text-[10px] font-semibold uppercase tracking-wider bg-transparent border-b border-[#005889] dark:border-sky-500 text-slate-600 dark:text-slate-300 mb-1 pl-1 outline-none ${ci === 0 ? '' : 'mt-2'}`}
                            />
                          ) : (
                            <div
                              onClick={() => { if (!canEdit) return; setEditingSubgroup({ group, subgroup: cluster.subgroup! }); setSubgroupDraft(cluster.subgroup!) }}
                              title={canEdit ? 'Clique para renomear a subseção' : undefined}
                              className={`text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 pl-1 ${ci === 0 ? '' : 'mt-2'} ${canEdit ? 'cursor-text hover:text-slate-600 dark:hover:text-slate-300' : ''}`}>
                              {cluster.subgroup}
                            </div>
                          )
                        )}
                        <div className={cluster.subgroup ? 'pl-2 border-l-2 border-slate-200 dark:border-slate-700/60 space-y-0.5' : 'space-y-0.5'}>
                          {cluster.items.map(d => (
                            <FieldRow
                              key={d.token}
                              d={d}
                              canEdit={canEdit}
                              busy={busy}
                              pkgCount={pkgCountByToken.get(d.token) ?? 0}
                              fieldDropActive={dropTarget?.kind === 'field' && dropTarget.group === group && dropTarget.token === d.token}
                              onDragStart={e => { e.stopPropagation(); dragRef.current = { kind: 'field', group, token: d.token }; e.dataTransfer.effectAllowed = 'move' }}
                              onDragEnd={endDrag}
                              onDragOver={e => {
                                if (dragRef.current?.kind !== 'field') { e.preventDefault(); return }
                                e.preventDefault(); e.stopPropagation()
                                setDropTarget({ kind: 'field', group, token: d.token })
                              }}
                              onDrop={e => {
                                e.preventDefault()
                                // Só resolve aqui se for um campo; um drop de seção "vaza" (sem
                                // stopPropagation) para o card da seção, que reordena as seções.
                                if (dragRef.current?.kind === 'field') { e.stopPropagation(); handleFieldDrop(group, d.token) }
                              }}
                              onDelete={() => void handleDelete(d.token)}
                              onSave={patch => void handleSave({ ...d, ...patch })}
                              onOpenUsage={() => setUsageToken(d.token)}
                              onMove={(newGroup, newSubgroup) => moveField(d.token, newGroup, newSubgroup)}
                              allTokens={allTokens}
                              allGroups={allGroups}
                              allSubgroups={allSubgroups}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    {/* Vão após o último campo — soltar aqui anexa ao fim da seção. */}
                    <div className={`h-0.5 rounded-full transition-colors ${
                      dropTarget?.kind === 'field' && dropTarget.group === group && dropTarget.token === null ? 'bg-[#008542] dark:bg-amber-500' : 'bg-transparent'
                    }`} />
                  </div>
                )}
                </div>
                {/* Barra de destino ao arrastar uma seção para logo após esta. */}
                <div className={`h-0.5 mt-1 rounded-full transition-colors ${sectionDropActive ? 'bg-[#008542] dark:bg-amber-500' : 'bg-transparent'}`} />
              </div>
            )
          })}
          </div>
        </>
      )}

      {usageToken && (
        <PackageUsageModal token={usageToken} onClose={() => setUsageToken(null)} />
      )}

      {showTools && (
        <WirelineToolsPanel canEdit={canEdit} onClose={() => setShowTools(false)} />
      )}
    </div>
  )
}

const TIPO_STYLE: Record<string, string> = {
  'criação': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'edição': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'remoção': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'reestruturação': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'reversão': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
}

// Log de alterações dedicado à aba Place Holders (filtra o changelog global pelo
// pacote sintético "placeholder-defs") — cada entrada com revert_data mostra
// "Desfazer", reaproveitando o mesmo endpoint usado pela aba Log do Admin.
function ChangeLogPanel({ entries, busy, onUndo, onClose }: {
  entries: ChangeLogEntry[] | null
  busy: boolean
  onUndo: (id: number) => void
  onClose: () => void
}) {
  return (
    <div className="rounded-xl overflow-hidden shadow-sm ring-1 ring-slate-300 dark:ring-slate-700/60">
      <div className="flex items-center gap-1.5 px-2.5 py-2 bg-[#ebebeb] dark:bg-slate-800/50 border-b border-slate-300 dark:border-slate-700/50">
        <History size={13} className="text-slate-500 dark:text-slate-400" />
        <span className="text-xs font-bold tracking-wide text-slate-700 dark:text-slate-300 flex-1">Log de alterações — Place Holders</span>
        <button onClick={onClose} className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
          <X size={13} />
        </button>
      </div>
      {entries === null ? (
        <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">Nenhuma alteração registrada ainda.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map(e => (
            <li key={e.id} className="px-3 py-2.5 flex items-start gap-2">
              <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIPO_STYLE[e.tipo] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                {e.tipo}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug">{e.resumo}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{e.data} · {e.author ?? '—'}{e.undone ? ' · desfeita' : ''}</p>
              </div>
              {e.undoable && !e.undone && (
                <button
                  onClick={() => onUndo(e.id)}
                  disabled={busy}
                  title="Desfazer esta alteração"
                  className="shrink-0 flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors">
                  <Undo size={11} /> Desfazer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Modal com pacotes que usam o placeholder — código, depois nome (1º clique),
// depois as linhas de texto que o referenciam (2º clique no nome expandido).
function PackageUsageModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const pkgIds = useMemo(() => packagesUsingToken(token), [token])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[75vh] flex flex-col rounded-xl overflow-hidden shadow-2xl ring-1 ring-slate-300 dark:ring-slate-700 bg-[#f5f5f5] dark:bg-slate-900">
        <div className="flex items-center gap-1.5 px-3 py-2.5 bg-[#ebebeb] dark:bg-slate-800/50 border-b border-slate-300 dark:border-slate-700/50">
          <span className="text-xs font-bold tracking-wide text-slate-700 dark:text-slate-300 flex-1">
            Pacotes que usam <code className="font-mono text-[11px] text-[#005889] dark:text-sky-400">{'{{' + token + '}}'}</code>
          </span>
          <button onClick={onClose} className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
            <X size={13} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-custom p-3">
          {pkgIds.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Nenhum pacote usa este placeholder ainda.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {pkgIds.map(id => (
                <div key={id}>
                  <button type="button"
                    onClick={() => {
                      setExpanded(prev => {
                        const next = new Set(prev)
                        if (next.has(id)) next.delete(id); else next.add(id)
                        return next
                      })
                    }}
                    title="Clique para ver as linhas com este placeholder"
                    className={`w-full text-left text-[11px] px-1.5 py-1 rounded transition-colors ${
                      expanded.has(id)
                        ? 'bg-[#005889]/10 dark:bg-sky-900/40 text-[#005889] dark:text-sky-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}>
                    <span className="font-mono">{id}</span>
                    <span className="text-slate-400 dark:text-slate-500"> — </span>
                    {PACKAGES[id]?.name ?? id}
                  </button>
                  {expanded.has(id) && (
                    <div className="mt-0.5 mb-1 pl-3 border-l-2 border-[#005889]/30 dark:border-sky-800 space-y-0.5">
                      {linesUsingToken(id, token).map((text, i) => (
                        <p key={i} className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug text-left">{text}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Linha de um campo — edição direta inline (rótulo, tipo, unidade, opções,
// dependência) em vez de abrir um formulário separado. Cada peça clicável vira
// um input/select no lugar; salva ao confirmar (Enter/blur/onChange) e some. ──
function FieldRow({
  d, canEdit, busy, pkgCount, fieldDropActive, allTokens, allGroups, allSubgroups,
  onDragStart, onDragEnd, onDragOver, onDrop, onDelete, onSave, onOpenUsage, onMove,
}: {
  d: PlaceholderFieldDef
  canEdit: boolean
  busy: boolean
  pkgCount: number
  fieldDropActive: boolean
  allTokens: string[]
  allGroups: string[]
  allSubgroups: string[]
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDelete: () => void
  onSave: (patch: Partial<PlaceholderFieldDef>) => void
  onOpenUsage: () => void
  onMove: (newGroup: string | null, newSubgroup: string | null) => void
}) {
  type EditKind = 'label' | 'type' | 'unit' | 'options' | 'dependsOn' | 'move' | null
  const [editing, setEditing] = useState<EditKind>(null)
  const [labelDraft, setLabelDraft] = useState(d.label)
  const [unitDraft, setUnitDraft] = useState(d.unit ?? '')
  const [depToken, setDepToken] = useState(d.dependsOnToken ?? '')
  const [depValue, setDepValue] = useState(d.dependsOnValue ?? '')
  const [moveGroup, setMoveGroup] = useState(d.group ?? '')
  const [moveSubgroup, setMoveSubgroup] = useState(d.subgroup ?? '')

  const openLabel = () => { setLabelDraft(d.label); setEditing('label') }
  const commitLabel = () => {
    setEditing(null)
    const next = labelDraft.trim()
    if (next && next !== d.label) onSave({ label: next })
  }
  const commitType = (fieldType: PlaceholderFieldType) => {
    setEditing(null)
    if (fieldType === d.fieldType) return
    onSave({ fieldType, unit: fieldType === 'number' || fieldType === 'unit' ? d.unit : null })
  }
  const openUnit = () => { setUnitDraft(d.unit ?? ''); setEditing('unit') }
  const commitUnit = () => {
    setEditing(null)
    const next = unitDraft.trim() || null
    if (next !== d.unit) onSave({ unit: next })
  }
  const openDependsOn = () => { setDepToken(d.dependsOnToken ?? ''); setDepValue(d.dependsOnValue ?? ''); setEditing('dependsOn') }
  const commitDependsOn = () => {
    setEditing(null)
    const nextToken = depToken || null
    const nextValue = nextToken ? (depValue.trim() || null) : null
    if (nextToken !== d.dependsOnToken || nextValue !== d.dependsOnValue) onSave({ dependsOnToken: nextToken, dependsOnValue: nextValue })
  }
  const depCandidates = allTokens.filter(t => t !== d.token)
  const openMove = () => { setMoveGroup(d.group ?? ''); setMoveSubgroup(d.subgroup ?? ''); setEditing('move') }
  const confirmMove = () => {
    setEditing(null)
    onMove(moveGroup.trim() || null, moveSubgroup.trim() || null)
  }

  return (
    <div>
      <div
        draggable={canEdit && editing === null}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className="grid w-full grid-cols-[minmax(80px,1fr)_minmax(70px,1fr)_88px_64px_40px] items-start gap-x-2 py-1 border-b border-slate-200 dark:border-slate-800 last:border-0 rounded group/row">
        <span className="text-xs leading-snug flex items-center gap-1.5 min-w-0 text-slate-600 dark:text-slate-500">
          {canEdit && <GripVertical size={11} className="shrink-0 text-slate-300 dark:text-slate-700 cursor-grab active:cursor-grabbing" />}
          <span className="min-w-0 break-words">
            {editing === 'label' ? (
              <input
                autoFocus value={labelDraft}
                onChange={e => setLabelDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditing(null) }}
                onClick={e => e.stopPropagation()}
                className="w-full text-xs bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1 py-0.5 outline-none text-slate-700 dark:text-slate-200"
              />
            ) : (
              <span onClick={() => canEdit && openLabel()} title={canEdit ? 'Clique para editar o rótulo' : undefined}
                className={canEdit ? 'cursor-pointer hover:underline decoration-dotted' : ''}>
                {d.label}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center flex-wrap gap-1 min-w-0 text-xs">
          <button type="button" onClick={e => { e.stopPropagation(); onOpenUsage() }}
            title={`${pkgCount} pacote${pkgCount === 1 ? '' : 's'} usa${pkgCount === 1 ? '' : 'm'} este campo — clique para ver`}
            className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold align-middle select-none shrink-0 transition-colors ${
              pkgCount > 0
                ? 'bg-[#005889]/10 text-[#005889] dark:bg-sky-900/50 dark:text-sky-300 hover:bg-[#005889]/20 dark:hover:bg-sky-900/80'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}>
            {pkgCount}
          </button>
          <code className="text-[10px] text-[#005889]/70 dark:text-sky-400/70 whitespace-nowrap" title={`{{${d.token}=…}}`}>{'{{' + d.token + '}}'}</code>
          {editing === 'dependsOn' ? (
            <span onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1">
              <select autoFocus value={depToken} onChange={e => setDepToken(e.target.value)} onBlur={commitDependsOn}
                className="text-[10px] bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1 py-0.5 outline-none text-slate-700 dark:text-slate-200">
                <option value="">— nenhum —</option>
                {depCandidates.map(t => <option key={t} value={t}>{'{{' + t + '}}'}</option>)}
              </select>
              {depToken && (
                <input value={depValue} onChange={e => setDepValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitDependsOn(); if (e.key === 'Escape') setEditing(null) }}
                  onBlur={commitDependsOn} placeholder="valor esperado"
                  className="w-20 text-[10px] bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1 py-0.5 outline-none text-slate-700 dark:text-slate-200" />
              )}
            </span>
          ) : d.dependsOnToken ? (
            <span onClick={() => canEdit && openDependsOn()} title={canEdit ? 'Clique para editar a dependência' : undefined}
              className={`text-[10px] text-slate-400 dark:text-slate-500 ${canEdit ? 'cursor-pointer hover:underline decoration-dotted' : ''}`}>
              ↳ {d.dependsOnToken}
            </span>
          ) : canEdit ? (
            <button type="button" onClick={openDependsOn}
              title="Definir dependência de outro campo"
              className="text-[10px] text-slate-300 dark:text-slate-700 opacity-0 group-hover/row:opacity-100 hover:text-slate-500 dark:hover:text-slate-400 transition-opacity">
              + dependência
            </button>
          ) : null}
        </span>
        <div className="flex items-center justify-end">
          {editing === 'type' ? (
            <select autoFocus value={d.fieldType}
              onChange={e => commitType(e.target.value as PlaceholderFieldType)}
              onBlur={() => setEditing(null)}
              onClick={e => e.stopPropagation()}
              className="text-xs bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1 py-0.5 outline-none text-slate-700 dark:text-slate-200">
              {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          ) : (
            <span onClick={() => canEdit && setEditing('type')} title={canEdit ? 'Clique para editar o tipo' : undefined}
              className={`text-xs font-semibold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap ${canEdit ? 'cursor-pointer hover:underline decoration-dotted' : ''}`}>
              {TYPE_LABELS[d.fieldType]}
            </span>
          )}
        </div>
        <div className="flex items-center justify-end">
          {d.fieldType === 'picklist' && (
            <button type="button" onClick={() => canEdit && setEditing(editing === 'options' ? null : 'options')}
              title="Clique para editar as opções do picklist"
              className="text-[10px] text-slate-500 dark:text-slate-400 underline decoration-dotted whitespace-nowrap">
              {d.options.length} opç{d.options.length === 1 ? 'ão' : 'ões'}
            </button>
          )}
          {(d.fieldType === 'number' || d.fieldType === 'unit') && (
            editing === 'unit' ? (
              <input autoFocus value={unitDraft} onChange={e => setUnitDraft(e.target.value)}
                onBlur={commitUnit}
                onKeyDown={e => { if (e.key === 'Enter') commitUnit(); if (e.key === 'Escape') setEditing(null) }}
                onClick={e => e.stopPropagation()}
                placeholder="unidade"
                className="w-14 text-[10px] bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1 py-0.5 outline-none text-slate-700 dark:text-slate-200" />
            ) : (
              <span onClick={() => canEdit && openUnit()} title={canEdit ? 'Clique para editar a unidade' : undefined}
                className={`text-[10px] select-none ${d.unit ? 'text-slate-600 dark:text-slate-500' : 'text-slate-300 dark:text-slate-700'} ${canEdit ? 'cursor-pointer hover:underline decoration-dotted' : ''}`}>
                {d.unit || '—'}
              </span>
            )
          )}
        </div>
        <div className="flex items-center justify-end gap-0.5">
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); openMove() }}
              title="Mover para outra seção/subseção"
              className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-[#005889] dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-700 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <FolderInput size={12} />
            </button>
          )}
          {canEdit && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              disabled={busy}
              className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover/row:opacity-100 transition-opacity">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      {editing === 'options' && (
        <div className="pl-4 pr-2 py-1.5" onClick={e => e.stopPropagation()}>
          <TagInput values={d.options} onChange={v => onSave({ options: v })} options={[]} placeholder="digite e Enter…" />
        </div>
      )}
      {editing === 'move' && (
        <div className="pl-4 pr-2 py-1.5 flex items-center gap-1.5 flex-wrap" onClick={e => e.stopPropagation()}>
          <select autoFocus value={moveGroup} onChange={e => setMoveGroup(e.target.value)}
            className="text-xs bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1.5 py-0.5 outline-none text-slate-700 dark:text-slate-200">
            <option value="">— sem seção —</option>
            {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <div className="w-40">
            <ComboInput value={moveSubgroup} onChange={setMoveSubgroup} options={allSubgroups} placeholder="subseção (opcional)"
              className="text-xs bg-white dark:bg-slate-800 border border-[#005889]/40 dark:border-sky-700 rounded px-1.5 py-0.5 outline-none text-slate-700 dark:text-slate-200 w-full" />
          </div>
          <button type="button" onClick={confirmMove}
            className="text-xs font-semibold px-2 py-0.5 rounded text-white bg-[#008542] hover:bg-[#006b35] dark:bg-amber-600 dark:hover:bg-amber-700 transition-colors">
            Mover
          </button>
          <button type="button" onClick={() => setEditing(null)}
            className="text-xs px-2 py-0.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            Cancelar
          </button>
        </div>
      )}
      <div className={`h-0.5 rounded-full transition-colors ${fieldDropActive ? 'bg-[#008542] dark:bg-amber-500' : 'bg-transparent'}`} />
    </div>
  )
}

// Linha rótulo↔valor no mesmo estilo do <Field> do assistente da Etapa 3
// (label à esquerda, controle compacto à direita, separador fino).
function FormRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-slate-200 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-600 dark:text-slate-500 shrink-0 w-32" title={hint}>{label}</span>
      <div className="flex-1 min-w-0 flex justify-end">{children}</div>
    </div>
  )
}

const inputCls = 'w-full min-w-0 text-xs text-right text-slate-700 dark:text-slate-200 bg-transparent outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 border-b border-transparent focus:border-[#005889] dark:focus:border-sky-500 transition-colors py-0.5'
const selectCls = 'w-full min-w-0 text-xs text-right text-slate-700 dark:text-slate-200 bg-transparent outline-none border-b border-transparent focus:border-[#005889] dark:focus:border-sky-500 transition-colors py-0.5'

const NEW_GROUP = '__new__'

// Formulário completo — usado só para CRIAR um campo novo (edição de campos
// existentes agora é direta na linha, ver FieldRow).
function DefForm({ draft, isNew, allTokens, allGroups, busy, onCancel, onSave }: {
  draft: PlaceholderFieldDef
  isNew?: boolean
  allTokens: string[]
  allGroups: string[]
  busy: boolean
  onCancel: () => void
  onSave: (d: PlaceholderFieldDef) => void
}) {
  const [d, setD] = useState<PlaceholderFieldDef>(draft)
  // Picklist de grupo: "criando novo grupo" fica true se o valor atual não está
  // na lista de grupos já existentes (ex.: campo recém-criado sem grupo ainda).
  const [addingGroup, setAddingGroup] = useState(() => !!draft.group && !allGroups.includes(draft.group))
  const set = <K extends keyof PlaceholderFieldDef>(k: K, v: PlaceholderFieldDef[K]) => setD(prev => ({ ...prev, [k]: v }))
  const canSubmit = d.token.trim().length > 0 && d.label.trim().length > 0 &&
    (d.fieldType !== 'picklist' || d.options.length > 0)
  const depCandidates = allTokens.filter(t => t !== d.token)

  return (
    <div onClick={e => e.stopPropagation()}
      className="rounded-lg border border-[#005889]/30 dark:border-sky-800 bg-[#005889]/5 dark:bg-sky-950/20 px-2.5 py-1">
      <FormRow label="Token" hint="Chave usada em {{token=glifo}}">
        <input
          value={d.token} disabled={!isNew}
          onChange={e => set('token', e.target.value.replace(/[^\w]/g, ''))}
          placeholder="ex: pressaoN2Trt"
          className={`${inputCls} disabled:opacity-60 font-mono`}
        />
      </FormRow>
      <FormRow label="Rótulo exibido">
        <input
          value={d.label}
          onChange={e => set('label', e.target.value)}
          placeholder="ex: N₂ interface TRT × ANM"
          className={inputCls}
        />
      </FormRow>
      <FormRow label="Tipo">
        <select
          value={d.fieldType}
          onChange={e => set('fieldType', e.target.value as PlaceholderFieldType)}
          className={selectCls}>
          {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
        </select>
      </FormRow>
      {(d.fieldType === 'number' || d.fieldType === 'unit') && (
        <FormRow label="Unidade">
          <input
            value={d.unit ?? ''}
            onChange={e => set('unit', e.target.value || null)}
            placeholder="ex: psi"
            className={inputCls}
          />
        </FormRow>
      )}
      <FormRow label="Grupo (seção)">
        {addingGroup ? (
          <div className="flex items-center gap-1.5 flex-1 justify-end">
            {allGroups.length > 0 && (
              <button type="button" onClick={() => { setAddingGroup(false); set('group', null) }}
                title="Escolher uma seção existente" className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={12} />
              </button>
            )}
            <input
              value={d.group ?? ''} autoFocus
              onChange={e => set('group', e.target.value || null)}
              placeholder="nome da nova seção"
              className={inputCls}
            />
          </div>
        ) : (
          <select
            value={d.group && allGroups.includes(d.group) ? d.group : ''}
            onChange={e => {
              if (e.target.value === NEW_GROUP) { set('group', null); setAddingGroup(true) }
              else set('group', e.target.value || null)
            }}
            className={selectCls}>
            <option value="">— nenhum —</option>
            {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
            <option value={NEW_GROUP}>+ Nova seção…</option>
          </select>
        )}
      </FormRow>
      <FormRow label="Subgrupo" hint="Segundo nível dentro da seção — ex: Gabaritagem, Camisão, TAE">
        <input
          value={d.subgroup ?? ''}
          onChange={e => set('subgroup', e.target.value || null)}
          placeholder="ex: Gabaritagem"
          className={inputCls}
        />
      </FormRow>

      {d.fieldType === 'picklist' && (
        <div className="py-1.5 border-b border-slate-200 dark:border-slate-800">
          <span className="text-xs text-slate-600 dark:text-slate-500 block mb-1">Opções do picklist</span>
          <TagInput values={d.options} onChange={v => set('options', v)} options={[]} placeholder="digite e Enter…" />
        </div>
      )}

      <FormRow label="Depende do campo">
        <select
          value={d.dependsOnToken ?? ''}
          onChange={e => set('dependsOnToken', e.target.value || null)}
          className={selectCls}>
          <option value="">— nenhum —</option>
          {depCandidates.map(t => <option key={t} value={t}>{'{{' + t + '}}'}</option>)}
        </select>
      </FormRow>
      {d.dependsOnToken && (
        <FormRow label="Valor esperado">
          <input
            value={d.dependsOnValue ?? ''}
            onChange={e => set('dependsOnValue', e.target.value || null)}
            placeholder="ex: true / Sim / 8-1/2"
            className={inputCls}
          />
        </FormRow>
      )}

      <div className="flex items-center justify-end gap-2 py-2">
        <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
        <button
          onClick={() => onSave(d)}
          disabled={!canSubmit || busy}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-semibold text-white bg-[#008542] hover:bg-[#006b35] dark:bg-amber-600 dark:hover:bg-amber-700 disabled:opacity-40 transition-colors">
          {busy && <Loader2 size={12} className="animate-spin" />} Salvar
        </button>
      </div>
    </div>
  )
}
