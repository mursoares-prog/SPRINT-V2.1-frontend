import { X, Search, ShieldCheck, Table2, Pencil, Trash2, Plus, Workflow, Undo2, AlertTriangle, Loader2 } from 'lucide-react'
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  isApiConfigured, listChangelog, getMergedPackageLines, getBaseFields,
  getBaseOverrides, getBasePackageOverrides, getCustomPackages, listPackageGroups, undoChangelog,
  type PackageLines, type LineOverride, type BaseLine, type CustomPackageMeta, type PackageGroupInfo,
} from '../utils/api'
import { isAdmin, authHeader } from '../utils/auth'
import { setExtraPackages, metaToPackage } from '../data/packages'
import { setPackageLines } from '../data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from '../data/lineDetailsStore'
import { AdminVarsEditor } from './AdminVarsEditor'
import { LogicEditorPanel } from './LogicEditorPanel'
import CHANGE_LOG from '../data/changeLog.json'

// Chave dos overrides legados por linha (rec/pad de fallback no editor).
type OverridesMap = Map<string, LineOverride>
const ovKey = (pkgId: string, i: number) => `${pkgId}|${i}`

// ─── Log de alterações ───────────────────────────────────────────────────────
// Registro auditável de toda mudança feita nas descrições das linhas dos pacotes
// (edição, remoção, inclusão). Fonte: src/data/changeLog.json — cada pedido de
// alteração executado nas fontes JSON deve acrescentar uma entrada aqui.
interface LogEntry {
  id: number
  data: string          // ISO yyyy-mm-dd
  pacote: string
  linha: number | null  // posição (1-based) na lista do pacote; null se N/A
  tipo: string          // 'edição' | 'remoção' | 'inclusão'
  resumo: string
  antes?: string
  depois?: string
  undoable?: boolean
  undone?: boolean
}
const LOG = (CHANGE_LOG as unknown as LogEntry[])

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

const TIPO_STYLE: Record<string, { label: string; cls: string; Icon: typeof Pencil }> = {
  'edição':         { label: 'Edição',         cls: 'bg-green-100 text-green-700 dark:bg-amber-900/40 dark:text-amber-300',      Icon: Pencil },
  'remoção':        { label: 'Remoção',        cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',         Icon: Trash2 },
  'inclusão':       { label: 'Inclusão',       cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: Plus },
  'criação':        { label: 'Criação',        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',         Icon: Plus },
  'reestruturação': { label: 'Reestruturação', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', Icon: Pencil },
  'metadado':       { label: 'Metadado',       cls: 'bg-[#f5f5f5] text-slate-600 dark:bg-slate-800 dark:text-slate-400',        Icon: Pencil },
  'reversão':       { label: 'Reversão',       cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',             Icon: Undo2 },
}

type Tab = 'vars' | 'log' | 'engine'

export function AdminView({ onClose, initialTab = 'vars' }: { onClose: () => void; initialTab?: 'vars' | 'engine' }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [query, setQuery] = useState('')
  // Base mesclada (bundled + overrides) e log: priorizam o servidor; caem no
  // bundle (packageLines/changeLog.json) quando não há backend ou a chamada falha.
  const [serverBase, setServerBase] = useState<PackageLines | null>(null)
  const [serverOverrides, setServerOverrides] = useState<OverridesMap>(new Map())
  const [pkgOverrides, setPkgOverrides] = useState<Record<string, BaseLine[]>>({})
  const [customMetas, setCustomMetas] = useState<CustomPackageMeta[]>([])
  const [customGroups, setCustomGroups] = useState<PackageGroupInfo[]>([])
  const [serverLog, setServerLog] = useState<LogEntry[] | null>(null)
  const [fields, setFields] = useState<string[]>([])
  const canEdit = isAdmin() && isApiConfigured()

  const reload = useCallback(async () => {
    if (!isApiConfigured()) return
    try {
      const [base, ovs, pkgOvs, metas, logs, groups] = await Promise.all([
        getMergedPackageLines(), getBaseOverrides(), getBasePackageOverrides(),
        getCustomPackages(), listChangelog(), listPackageGroups(),
      ])
      setServerBase(base)
      setServerOverrides(new Map(ovs.map(o => [ovKey(o.pkgId, o.lineIndex), o])))
      setPkgOverrides(Object.fromEntries(pkgOvs.map(o => [o.pkgId, o.lines])))
      setCustomMetas(metas)
      setCustomGroups(groups)
      setServerLog(logs as LogEntry[])
      // Sincroniza os stores globais usados pela geração de cronograma, para que
      // edições do Admin reflitam em cronogramas NOVOS na mesma sessão (sem F5).
      // (Não afeta projetos salvos: LOAD_PROJECT usa o snapshot do projeto.)
      setPackageLines(base)
      applyDetailOverrides(ovs)
      applyPackageOverrides(pkgOvs)
      setExtraPackages(Object.fromEntries(metas.map(m => [m.pkgId, metaToPackage(m)])))
    } catch { /* offline/erro → mantém bundle */ }
  }, [])

  useEffect(() => {
    void reload()
    if (isApiConfigured()) getBaseFields().then(setFields).catch(() => {})
  }, [reload])

  const log = serverLog ?? LOG

  const filteredLog = useMemo(() => {
    const sorted = [...log].sort((a, b) => b.id - a.id) // mais recentes primeiro
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(e =>
      e.pacote.toLowerCase().includes(q) ||
      e.tipo.toLowerCase().includes(q) ||
      e.resumo.toLowerCase().includes(q) ||
      (e.antes ?? '').toLowerCase().includes(q) ||
      (e.depois ?? '').toLowerCase().includes(q) ||
      e.data.includes(q),
    )
  }, [query, log])

  return (
    <div className="fixed inset-x-0 bottom-0 top-12 z-50 flex items-center bg-black/40 backdrop-blur-sm p-0">
      <div className="relative flex flex-col bg-[#f5f5f5] dark:bg-slate-900 shadow-2xl overflow-hidden w-full h-full rounded-none">

        {/* Header + Tabs combinados em uma linha */}
        <div className="flex items-center gap-1 px-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-1.5 shrink-0 pr-3 mr-1 border-r border-slate-200 dark:border-slate-700 py-2">
            <ShieldCheck size={13} className="text-[#005889] dark:text-[#d97706]" />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">Admin</span>
          </div>
          <TabButton active={tab === 'vars'} onClick={() => setTab('vars')} Icon={Table2}>
            Variáveis dos pacotes
          </TabButton>
          <TabButton active={tab === 'engine'} onClick={() => setTab('engine')} Icon={Workflow}>
            Árvores de Decisão
          </TabButton>
          <button
            onClick={onClose}
            className="ml-auto shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Search */}
        {tab !== 'engine' && <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#f5f5f5] dark:bg-slate-800">
            <Search size={14} className="text-slate-600 shrink-0" />
            <input
              type="text"
              placeholder={
                tab === 'vars' ? 'Buscar por pacote, descrição, padrão, fase, atividade...' :
                                 'Buscar no log por pacote, tipo, texto, data...'}
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-600 outline-none"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-slate-600 hover:text-slate-600 dark:hover:text-slate-500">
                <X size={12} />
              </button>
            )}
          </div>
        </div>}

        {/* Conteúdo */}
        <div className={`flex-1 min-h-0 ${tab === 'engine' ? 'overflow-hidden' : 'overflow-auto scrollbar-custom'}`}>
        {tab === 'log' ? (
          <LogPanel entries={filteredLog} canUndo={serverLog != null} onUndo={reload} />
        ) : tab === 'engine' ? (
          <LogicEditorPanel canEdit={canEdit} />
        ) : (
          <>
            <AdminVarsEditor
              query={query} serverBase={serverBase} pkgOverrides={pkgOverrides}
              legacyOverrides={serverOverrides} customMetas={customMetas}
              customGroups={customGroups}
              fields={fields} canEdit={canEdit} reload={reload}
              onOpenLog={() => setTab('log')} logCount={log.length}
            />
          </>
        )}
        </div>

        {/* Footer */}
        {tab !== 'engine' && (
          <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 shrink-0">
            {tab === 'log'
              ? `${filteredLog.length} de ${log.length} alteração(ões)`
              : `${customMetas.length} pacote(s) customizado(s)`}
          </div>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, Icon, children, className = '' }: {
  active: boolean
  onClick: () => void
  Icon: typeof Table2
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-xs font-medium rounded-t-lg border-b-2 transition-colors shrink-0 ${
        active
          ? 'border-[#005889] text-[#005889] dark:border-[#d97706] dark:text-[#d97706]'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      } ${className}`}>
      <Icon size={14} />
      {children}
    </button>
  )
}

function LogPanel({ entries, canUndo, onUndo }: {
  entries: LogEntry[]
  canUndo: boolean
  onUndo: () => Promise<void>
}) {
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const handleUndo = async (id: number) => {
    setBusyId(id); setError('')
    try {
      await undoChangelog(id, authHeader())
      await onUndo()
    } catch (e) { setError((e as Error).message) } finally { setBusyId(null) }
  }

  if (entries.length === 0) {
    return <p className="text-sm text-slate-600 text-center py-8">Nenhuma alteração registrada.</p>
  }
  return (
    <div>
      {error && (
        <div className="flex items-start gap-2 mx-5 mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {entries.map(e => {
          const style = TIPO_STYLE[e.tipo] ?? TIPO_STYLE['edição']
          const { Icon } = style
          return (
            <li key={e.id} className="px-5 py-4">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${style.cls}`}>
                  <Icon size={11} />
                  {style.label}
                </span>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">{e.pacote}</span>
                {e.linha != null && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">linha {e.linha}</span>
                )}
                {e.undone && (
                  <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">desfeita</span>
                )}
                <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{fmtData(e.data)}</span>
                {canUndo && e.undoable && !e.undone && (
                  <button
                    onClick={() => { if (window.confirm('Desfazer esta alteração e restaurar o estado anterior?')) void handleUndo(e.id) }}
                    disabled={busyId === e.id}
                    title="Desfazer esta alteração"
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
                    {busyId === e.id ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                    Desfazer
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-200 leading-snug mb-2">{e.resumo}</p>
              {(e.antes || e.depois) && (
                <div className="grid sm:grid-cols-2 gap-2">
                  {e.antes && (
                    <div className="rounded-md border border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-900/15 px-2.5 py-2">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-rose-500 dark:text-rose-400 mb-1">Antes</span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug whitespace-pre-line">{e.antes}</p>
                    </div>
                  )}
                  {e.depois && (
                    <div className="rounded-md border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-900/15 px-2.5 py-2">
                      <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 mb-1">Depois</span>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug whitespace-pre-line">{e.depois}</p>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
