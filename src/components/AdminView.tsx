import { X, Search, ShieldCheck, History, Table2, Pencil, Trash2, Plus, GitBranch } from 'lucide-react'
import { LOGIC_SECS, type LPkg, type LAns, type LDec, type LSec } from '../data/logicSecs'
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  isApiConfigured, listChangelog, getMergedPackageLines, getBaseFields,
  getBaseOverrides, getBasePackageOverrides, getCustomPackages,
  type PackageLines, type LineOverride, type BaseLine, type CustomPackageMeta,
} from '../utils/api'
import { isAdmin } from '../utils/auth'
import { setExtraPackages, metaToPackage } from '../data/packages'
import { setPackageLines } from '../data/packageLinesStore'
import { applyDetailOverrides, applyPackageOverrides } from '../data/lineDetailsStore'
import { AdminVarsEditor } from './AdminVarsEditor'
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
}
const LOG = (CHANGE_LOG as unknown as LogEntry[])

const fmtData = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

const TIPO_STYLE: Record<string, { label: string; cls: string; Icon: typeof Pencil }> = {
  'edição':         { label: 'Edição',         cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',     Icon: Pencil },
  'remoção':        { label: 'Remoção',        cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',         Icon: Trash2 },
  'inclusão':       { label: 'Inclusão',       cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', Icon: Plus },
  'criação':        { label: 'Criação',        cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',         Icon: Plus },
  'reestruturação': { label: 'Reestruturação', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300', Icon: Pencil },
  'metadado':       { label: 'Metadado',       cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',        Icon: Pencil },
}

type Tab = 'vars' | 'log' | 'logic'

export function AdminView({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('vars')
  const [query, setQuery] = useState('')
  // Base mesclada (bundled + overrides) e log: priorizam o servidor; caem no
  // bundle (packageLines/changeLog.json) quando não há backend ou a chamada falha.
  const [serverBase, setServerBase] = useState<PackageLines | null>(null)
  const [serverOverrides, setServerOverrides] = useState<OverridesMap>(new Map())
  const [pkgOverrides, setPkgOverrides] = useState<Record<string, BaseLine[]>>({})
  const [customMetas, setCustomMetas] = useState<CustomPackageMeta[]>([])
  const [serverLog, setServerLog] = useState<LogEntry[] | null>(null)
  const [fields, setFields] = useState<string[]>([])
  const canEdit = isAdmin() && isApiConfigured()

  const reload = useCallback(async () => {
    if (!isApiConfigured()) return
    try {
      const [base, ovs, pkgOvs, metas, logs] = await Promise.all([
        getMergedPackageLines(), getBaseOverrides(), getBasePackageOverrides(),
        getCustomPackages(), listChangelog(),
      ])
      setServerBase(base)
      setServerOverrides(new Map(ovs.map(o => [ovKey(o.pkgId, o.lineIndex), o])))
      setPkgOverrides(Object.fromEntries(pkgOvs.map(o => [o.pkgId, o.lines])))
      setCustomMetas(metas)
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
    <div className="fixed inset-0 z-50 flex items-center justify-start pl-4 bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[calc(95vw-1rem)] max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#d97706]" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Admin
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <TabButton active={tab === 'vars'} onClick={() => setTab('vars')} Icon={Table2}>
            Variáveis dos pacotes
          </TabButton>
          <TabButton active={tab === 'log'} onClick={() => setTab('log')} Icon={History}>
            Log de alterações
            <span className="ml-1.5 px-1.5 py-px rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              {log.length}
            </span>
          </TabButton>
          <TabButton active={tab === 'logic'} onClick={() => setTab('logic')} Icon={GitBranch}>
            Teste de lógica
          </TabButton>
        </div>

        {/* Search */}
        {tab !== 'logic' && <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
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
        <div className="flex-1 overflow-auto scrollbar-custom">
        {tab === 'log' ? (
          <LogPanel entries={filteredLog} />
        ) : tab === 'logic' ? (
          <LogicTestPanel />
        ) : (
          <>
            {canEdit && (
              <div className="m-3 flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-900/15 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                <Pencil size={13} className="shrink-0" />
                <span>Modo admin: abra um pacote para editar suas linhas inline (texto/placeholders, duração, recomendações, padrões, ontologia), adicionar/excluir/reordenar e copiar/colar linhas. Use <strong>Novo pacote</strong> ou <strong>Duplicar</strong> para criar pacotes customizados.</span>
              </div>
            )}
            <AdminVarsEditor
              query={query} serverBase={serverBase} pkgOverrides={pkgOverrides}
              legacyOverrides={serverOverrides} customMetas={customMetas}
              fields={fields} canEdit={canEdit} reload={reload}
            />
          </>
        )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 shrink-0">
          {tab === 'log'
            ? `${filteredLog.length} de ${log.length} alteração(ões)`
            : tab === 'logic'
            ? 'Visualizador estático — FS1_Mec · DP Generalista'
            : `${customMetas.length} pacote(s) customizado(s)`}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, Icon, children }: {
  active: boolean
  onClick: () => void
  Icon: typeof Table2
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 -mb-px text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
        active
          ? 'border-[#d97706] text-[#d97706]'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
      }`}>
      <Icon size={14} />
      {children}
    </button>
  )
}

function LogPanel({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-slate-600 text-center py-8">Nenhuma alteração registrada.</p>
  }
  return (
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
              <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">{fmtData(e.data)}</span>
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
  )
}

// ─── Teste de Lógica ────────────────────────────────────────────────────────
// ─── Estilos por cor de fase ─────────────────────────────────────────────────
const PHASE_STYLE: Record<string, {
  sectionBorder: string; sectionHeader: string; phaseBadge: string
  activeBorder: string; activeHeader: string; activeRing: string
}> = {
  gray: {
    sectionBorder: 'border-slate-300 dark:border-slate-600',
    sectionHeader: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
    phaseBadge:    'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    activeBorder:  'border-slate-500 dark:border-slate-400',
    activeHeader:  'bg-slate-500 dark:bg-slate-500 text-white',
    activeRing:    'ring-1 ring-slate-400 dark:ring-slate-500',
  },
  blue: {
    sectionBorder: 'border-blue-300 dark:border-blue-700',
    sectionHeader: 'bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200',
    phaseBadge:    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    activeBorder:  'border-blue-500 dark:border-blue-400',
    activeHeader:  'bg-blue-600 dark:bg-blue-600 text-white',
    activeRing:    'ring-1 ring-blue-400 dark:ring-blue-500',
  },
  amber: {
    sectionBorder: 'border-amber-300 dark:border-amber-700',
    sectionHeader: 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200',
    phaseBadge:    'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
    activeBorder:  'border-amber-500 dark:border-amber-400',
    activeHeader:  'bg-amber-500 dark:bg-amber-600 text-white',
    activeRing:    'ring-1 ring-amber-400 dark:ring-amber-500',
  },
}

// ─── Pkg row ──────────────────────────────────────────────────────────────────
function PkgRow({ pkg, active }: { pkg: LPkg; active?: boolean }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className={`font-mono text-[9.5px] font-semibold min-w-[3.8rem] shrink-0 ${
        active ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'
      }`}>{pkg.id}</span>
      <span className={`text-[10px] leading-snug ${
        active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'
      }`}>{pkg.name}</span>
    </div>
  )
}

// ─── Answer card (recursive) ──────────────────────────────────────────────────
function AnsCard({ ans, color, depth }: { ans: LAns; color: 'gray'|'blue'|'amber'; depth: number }) {
  const s = PHASE_STYLE[color]
  const hasContent = !!(ans.packages?.length || ans.note || ans.sub?.length)
  return (
    <div className={`flex-1 min-w-[110px] flex flex-col rounded border overflow-hidden ${
      ans.active
        ? `${s.activeBorder} ${s.activeRing} bg-white dark:bg-slate-900`
        : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30'
    }`}>
      <div className={`px-2 py-0.5 text-[10px] font-bold leading-none whitespace-nowrap ${
        ans.active ? s.activeHeader : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
      }`}>
        {ans.label}{ans.active && <span className="ml-1 opacity-70">✦</span>}
      </div>
      <div className="px-1.5 py-1 space-y-0.5 flex-1">
        {ans.note && (
          <p className={`text-[9.5px] italic leading-snug ${
            ans.active ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'
          }`}>{ans.note}</p>
        )}
        {ans.packages?.map((p, i) => <PkgRow key={p.id + i} pkg={p} active={ans.active} />)}
        {!hasContent && <p className="text-[9.5px] text-slate-300 dark:text-slate-600 italic">—</p>}
        {ans.sub && ans.sub.length > 0 && (
          <div className={`mt-1.5 pt-1 space-y-2${depth > 0 ? ' pl-1.5 border-l border-slate-200 dark:border-slate-700' : ''}`}>
            {ans.sub.map((d, j) => <DecRow key={j} dec={d} color={color} depth={depth + 1} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Decision row (recursive) ─────────────────────────────────────────────────
function DecRow({ dec, color, depth = 0 }: { dec: LDec; color: 'gray'|'blue'|'amber'; depth?: number }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">{dec.question}</p>
      <div className="flex gap-1.5">
        {dec.answers.map((ans, i) => <AnsCard key={i} ans={ans} color={color} depth={depth} />)}
      </div>
    </div>
  )
}

// ─── Section block ────────────────────────────────────────────────────────────
function SecBlock({ sec }: { sec: LSec }) {
  const s = PHASE_STYLE[sec.color]
  return (
    <div className={`rounded-xl border ${s.sectionBorder} overflow-hidden shadow-sm bg-white dark:bg-slate-900`}>
      <div className={`flex items-center gap-2 px-3 py-2 border-b ${s.sectionBorder} ${s.sectionHeader}`}>
        <span className="text-[11px] font-bold uppercase tracking-widest flex-1">{sec.label}</span>
        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${s.phaseBadge}`}>{sec.phase}</span>
      </div>
      <div className="p-2 space-y-2">
        {sec.always && sec.always.length > 0 && (
          <div className={`rounded border px-2 py-1.5 space-y-0.5 ${s.sectionBorder} bg-white dark:bg-slate-900`}>
            <p className="text-[9px] uppercase tracking-widest font-semibold text-slate-400 dark:text-slate-500 mb-1">Sempre</p>
            {sec.always.map((p, i) => <PkgRow key={p.id + i} pkg={p} active />)}
          </div>
        )}
        {sec.decisions.map((dec, i) => <DecRow key={i} dec={dec} color={sec.color} />)}
      </div>
    </div>
  )
}

// ─── Connector arrow ──────────────────────────────────────────────────────────
function LArrow() {
  return (
    <div className="flex flex-col items-center shrink-0" aria-hidden>
      <div className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
      <svg width="10" height="7" viewBox="0 0 10 7" className="text-slate-300 dark:text-slate-600" fill="currentColor">
        <path d="M5 7L0 0h10L5 7z" />
      </svg>
    </div>
  )
}

// ─── Panel principal ──────────────────────────────────────────────────────────
function LogicTestPanel() {
  return (
    <div className="px-4 py-4">
      <div className="mb-3">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Escopo de exemplo: FS1_Mec · DP Generalista</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Todas as ramificações e sub-perguntas — ✦ = caminho padrão</p>
      </div>
      <div className="flex flex-col">
        {LOGIC_SECS.map((sec, i) => (
          <div key={sec.id}>
            <SecBlock sec={sec} />
            {i < LOGIC_SECS.length - 1 && <LArrow />}
          </div>
        ))}
      </div>
    </div>
  )
}
