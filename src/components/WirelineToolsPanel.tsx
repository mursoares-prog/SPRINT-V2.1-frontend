// Painel "canivete suíço" da aba Place Holders: tabela de referência de ferramentas
// de arame — para cada equipamento a instalar/retirar (tampão/plug, camisão, válvula
// de retenção, insert nipple, haste de equalização...), a ferramenta de aplicação
// (running tool), a de pescaria (pulling tool), correlacionadas, nipple e local (Onde).
//
// Consulta para todos; edição (criar/editar/remover) para admin — persiste no backend
// com o mesmo mecanismo de changelog/undo do resto do Admin (ver routers/wireline_tools.py).
import { useState, useEffect, useCallback, useMemo, useDeferredValue, type Key } from 'react'
import {
  X, Search, Loader2, AlertTriangle, Plus, Pencil, Trash2, Check, PocketKnife,
} from 'lucide-react'
import {
  isApiConfigured, listWirelineTools, createWirelineTool, updateWirelineTool, deleteWirelineTool,
  type WirelineTool, type WirelineToolInput,
} from '../utils/api'
import { authHeader } from '../utils/auth'
import BUNDLED from '../data/wirelineTools.json'

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function matches(t: WirelineTool, q: string): boolean {
  const nq = normalize(q)
  return [t.equipamento, t.aplicacao, t.pescaria, t.correlacionadas, t.nipples, t.onde, t.categoria]
    .some(v => v && normalize(v).includes(nq))
}

function emptyInput(categoria: string | null): WirelineToolInput {
  return {
    categoria, equipamento: '', aplicacao: '', pescaria: '',
    correlacionadas: '', nipples: '', onde: '', orderIndex: 0,
  }
}

// Sticky por CÉLULA (não no <thead>/<tr>, que é inconsistente entre navegadores):
// cada th gruda no topo do container de scroll com fundo opaco e borda contínua.
const th = 'sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left font-semibold text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400'
const td = 'px-2 py-1.5 align-top text-slate-700 dark:text-slate-200'

export function WirelineToolsPanel({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const [tools, setTools] = useState<WirelineTool[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [cat, setCat] = useState<string>('')       // filtro de categoria ('' = todas)
  const [editId, setEditId] = useState<number | null>(null)   // linha em edição
  const [draft, setDraft] = useState<WirelineToolInput | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!isApiConfigured()) {
      // Sem backend: usa o snapshot empacotado (só leitura).
      setTools(BUNDLED as unknown as WirelineTool[])
      setError('Sem backend configurado — exibindo a tabela empacotada (somente leitura).')
      return
    }
    try { setTools(await listWirelineTools()); setError('') }
    catch (e) { setError((e as Error).message); setTools(BUNDLED as unknown as WirelineTool[]) }
  }, [])
  useEffect(() => { void load() }, [load])

  // Fecha no ESC.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const t of tools ?? []) if (t.categoria) set.add(t.categoria)
    return [...set].sort((a, b) => a.localeCompare(b, 'pt'))
  }, [tools])

  const filtered = useMemo(() => {
    let list = tools ?? []
    if (cat) list = list.filter(t => (t.categoria ?? '') === cat)
    if (deferredQuery.trim()) list = list.filter(t => matches(t, deferredQuery))
    return list
  }, [tools, cat, deferredQuery])

  const startEdit = (t: WirelineTool) => {
    setCreating(false)
    setEditId(t.id)
    setDraft({
      categoria: t.categoria, equipamento: t.equipamento, aplicacao: t.aplicacao,
      pescaria: t.pescaria, correlacionadas: t.correlacionadas, nipples: t.nipples,
      onde: t.onde, orderIndex: t.orderIndex,
    })
  }
  const startCreate = () => {
    setEditId(null)
    setCreating(true)
    setDraft(emptyInput(cat || null))
  }
  const cancel = () => { setEditId(null); setCreating(false); setDraft(null) }

  const save = async () => {
    if (!draft || !draft.equipamento.trim()) { setError('Equipamento é obrigatório.'); return }
    setBusy(true); setError('')
    try {
      if (creating) {
        const created = await createWirelineTool(draft, authHeader())
        setTools(prev => [...(prev ?? []), created])
      } else if (editId != null) {
        const updated = await updateWirelineTool(editId, draft, authHeader())
        setTools(prev => (prev ?? []).map(t => (t.id === editId ? updated : t)))
      }
      cancel()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const remove = async (t: WirelineTool) => {
    if (!window.confirm(`Remover "${t.equipamento}" da tabela de ferramentas?`)) return
    setBusy(true); setError('')
    try {
      await deleteWirelineTool(t.id, authHeader())
      setTools(prev => (prev ?? []).filter(x => x.id !== t.id))
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  const cell = (v: string | null) => v || <span className="text-slate-300 dark:text-slate-600">—</span>

  const draftInput = (key: keyof WirelineToolInput, placeholder: string) => (
    <input
      value={(draft?.[key] as string) ?? ''}
      onChange={e => setDraft(d => (d ? { ...d, [key]: e.target.value } : d))}
      placeholder={placeholder}
      className="w-full min-w-[7rem] px-1.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 outline-none focus:border-[#005889] dark:focus:border-sky-500"
    />
  )

  const editRow = (key?: Key) => (
    <tr key={key} className="bg-[#005889]/5 dark:bg-sky-950/30">
      <td className={td}>{draftInput('equipamento', 'Equipamento *')}</td>
      <td className={td}>{draftInput('aplicacao', 'Ferramenta de aplicação')}</td>
      <td className={td}>{draftInput('pescaria', 'Ferramenta de pescaria')}</td>
      <td className={td}>{draftInput('correlacionadas', 'Correlacionadas')}</td>
      <td className={td}>{draftInput('nipples', 'Nipple relacionado')}</td>
      <td className={td}>{draftInput('onde', 'Onde')}</td>
      <td className={`${td} whitespace-nowrap`}>
        <div className="flex items-center gap-1">
          <input
            value={draft?.categoria ?? ''}
            onChange={e => setDraft(d => (d ? { ...d, categoria: e.target.value } : d))}
            list="wl-cats"
            placeholder="Categoria"
            className="w-28 px-1.5 py-1 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-100 outline-none"
          />
          <button onClick={() => void save()} disabled={busy} title="Salvar"
            className="p-1 rounded text-white bg-[#008542] hover:bg-[#006b35] disabled:opacity-40">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button onClick={cancel} title="Cancelar"
            className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"><X size={13} /></button>
        </div>
      </td>
    </tr>
  )

  // Ancorado ao topo (items-start), não centralizado: ao filtrar, o topo da janela
  // fica fixo e só a base varia com a altura do conteúdo.
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-[5vh]" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="flex flex-col w-full max-w-6xl max-h-[90vh] rounded-xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-700">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <PocketKnife size={18} className="text-[#005889] dark:text-sky-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Ferramentas de arame</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              Aplicação / pescaria por equipamento a instalar ou retirar, com nipple relacionado
            </p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape' && query) { e.stopPropagation(); setQuery('') } }}
              placeholder="Buscar equipamento, ferramenta, nipple…"
              className="w-64 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400"
            />
            {query && <button onClick={() => setQuery('')} title="Limpar"><X size={13} className="text-slate-400 hover:text-slate-600" /></button>}
          </div>
          {canEdit && (
            <button onClick={startCreate}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-white bg-[#008542] hover:bg-[#006b35] dark:bg-amber-600 dark:hover:bg-amber-700 transition-colors">
              <Plus size={13} /> Nova
            </button>
          )}
          <button onClick={onClose} title="Fechar (Esc)"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>
        </div>

        {/* Filtro por categoria — fixo, quebra em várias linhas (sem scroll) */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <button onClick={() => setCat('')}
            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
              cat === '' ? 'text-white bg-[#005889] border-[#005889] dark:bg-sky-600 dark:border-sky-600'
                         : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}>Todas</button>
          {categories.map(c => (
            <button key={c} onClick={() => setCat(c)}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                cat === c ? 'text-white bg-[#005889] border-[#005889] dark:bg-sky-600 dark:border-sky-600'
                          : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}>{c}</button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 mx-4 mt-3 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span className="flex-1">{error}</span>
          </div>
        )}

        {/* Tabela — sem padding no topo: o cabeçalho sticky gruda direto na borda superior */}
        <div className="flex-1 overflow-auto px-4 pb-3">
          {tools == null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className={th}>Equipamento</th>
                  <th className={th}>Aplicação</th>
                  <th className={th}>Pescaria</th>
                  <th className={th}>Correlacionadas</th>
                  <th className={th}>Nipple</th>
                  <th className={th}>Onde</th>
                  <th className={`${th} w-px`}>{canEdit ? 'Ações' : ''}</th>
                </tr>
              </thead>
              <tbody>
                {creating && editRow('__new__')}
                {filtered.map(t => (
                  editId === t.id ? editRow(t.id) : (
                    <tr key={t.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className={`${td} font-medium`}>{cell(t.equipamento)}</td>
                      <td className={td}>{cell(t.aplicacao)}</td>
                      <td className={td}>{cell(t.pescaria)}</td>
                      <td className={td}>{cell(t.correlacionadas)}</td>
                      <td className={td}>{cell(t.nipples)}</td>
                      <td className={`${td} whitespace-nowrap`}>{cell(t.onde)}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(t)} title="Editar"
                              className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"><Pencil size={13} /></button>
                            <button onClick={() => void remove(t)} title="Remover"
                              className="p-1 rounded text-red-500 hover:bg-red-100 dark:hover:bg-red-950/50"><Trash2 size={13} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                ))}
                {filtered.length === 0 && !creating && (
                  <tr><td colSpan={7} className="py-12 text-center text-sm text-slate-400">Nenhuma ferramenta encontrada.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <datalist id="wl-cats">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
          {filtered.length} de {tools?.length ?? 0} ferramenta(s){cat ? ` · ${cat}` : ''}
        </div>
      </div>
    </div>
  )
}
