import { X, Search, ShieldCheck, History, Table2, Pencil, Trash2, Plus } from 'lucide-react'
import { useState, useMemo } from 'react'
import { PACKAGES } from '../data/packages'
import PACKAGE_LINES from '../data/packageLines.json'
import PACKAGE_LINE_DETAILS from '../data/packageLineDetails.json'
import CHANGE_LOG from '../data/changeLog.json'

// Reference data shapes (read straight from the master JSON sources).
interface RawLine {
  text: string
  duration: number | null        // já em HORAS na fonte
  owFase: string | null
  owAtividade: string | null
  owOperacao: string | null
  owEtapa: string | null
}
type LineDetail = { rec: string; pad: string } | null

const PKG_LINES = PACKAGE_LINES as unknown as Record<string, RawLine[]>
const PKG_DETAILS = PACKAGE_LINE_DETAILS as unknown as Record<string, LineDetail[]>

// Nome completo: [código] - nome. O nome do pacote já inclui o prefixo de
// tecnologia (ex.: "Arame - ..."), então não o repetimos — igual à exportação
// JSON da Etapa 3.
const fullPkgName = (pkgId: string): string => {
  const pkg = PACKAGES[pkgId]
  const name = pkg?.name ?? ''
  return `[${pkgId}] - ${name}`
}

interface AdminRow {
  pkgId: string
  pkgName: string
  descricao: string
  duracao: number | null
  recomendacoes: string
  padroes: string
  fase: string
  atividade: string
  operacao: string
  etapa: string
}

function buildRows(): AdminRow[] {
  const rows: AdminRow[] = []
  const ids = Object.keys(PKG_LINES).sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ''), 10)
    const nb = parseInt(b.replace(/\D/g, ''), 10)
    return na - nb
  })
  for (const pkgId of ids) {
    const pkgName = fullPkgName(pkgId)
    const lines = PKG_LINES[pkgId] ?? []
    const details = PKG_DETAILS[pkgId] ?? []
    lines.forEach((line, i) => {
      const d = details[i]
      rows.push({
        pkgId,
        pkgName,
        descricao: line.text ?? '',
        duracao: line.duration ?? null,
        recomendacoes: d?.rec ?? '',
        padroes: d?.pad ?? '',
        fase: line.owFase ?? '',
        atividade: line.owAtividade ?? '',
        operacao: line.owOperacao ?? '',
        etapa: line.owEtapa ?? '',
      })
    })
  }
  return rows
}

const fmtDur = (d: number | null) =>
  d == null ? '' : Number.isInteger(d) ? String(d) : d.toFixed(2)

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

type Tab = 'vars' | 'log'

export function AdminView({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('vars')
  const [query, setQuery] = useState('')
  const rows = useMemo(buildRows, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.pkgId.toLowerCase().includes(q) ||
      r.pkgName.toLowerCase().includes(q) ||
      r.descricao.toLowerCase().includes(q) ||
      r.recomendacoes.toLowerCase().includes(q) ||
      r.padroes.toLowerCase().includes(q) ||
      r.fase.toLowerCase().includes(q) ||
      r.atividade.toLowerCase().includes(q) ||
      r.operacao.toLowerCase().includes(q) ||
      r.etapa.toLowerCase().includes(q),
    )
  }, [rows, query])

  const filteredLog = useMemo(() => {
    const sorted = [...LOG].sort((a, b) => b.id - a.id) // mais recentes primeiro
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
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[95vw] mx-4 max-h-[90vh] overflow-hidden">

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
              {LOG.length}
            </span>
          </TabButton>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            <Search size={14} className="text-slate-600 shrink-0" />
            <input
              type="text"
              placeholder={tab === 'vars'
                ? 'Buscar por pacote, descrição, padrão, fase, atividade...'
                : 'Buscar no log por pacote, tipo, texto, data...'}
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
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-auto scrollbar-custom">
        {tab === 'log' ? (
          <LogPanel entries={filteredLog} />
        ) : filtered.length > 0 ? (
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-200 dark:bg-slate-800 text-left">
                  <Th className="min-w-[220px]">Pacote</Th>
                  <Th className="min-w-[260px]">Descrição</Th>
                  <Th className="w-20 text-right">Duração (h)</Th>
                  <Th className="min-w-[240px]">Recomendações</Th>
                  <Th className="min-w-[220px]">Padrões</Th>
                  <Th className="w-28">Fase (OW)</Th>
                  <Th className="w-32">Atividade (OW)</Th>
                  <Th className="w-36">Operação (OW)</Th>
                  <Th className="w-36">Etapa (OW)</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const firstOfPkg = i === 0 || filtered[i - 1].pkgId !== r.pkgId
                  return (
                    <tr key={i}
                      className={`align-top border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${firstOfPkg ? 'border-t-2 border-t-slate-300 dark:border-t-slate-700' : ''}`}>
                      <Td>
                        {firstOfPkg && (
                          <span className="font-semibold text-blue-700 dark:text-blue-400 leading-snug">
                            {r.pkgName}
                          </span>
                        )}
                      </Td>
                      <Td className="text-slate-700 dark:text-slate-200 leading-snug">{r.descricao}</Td>
                      <Td className="text-right font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtDur(r.duracao)}</Td>
                      <Td className="text-slate-700 dark:text-slate-300 leading-snug whitespace-pre-line">{r.recomendacoes}</Td>
                      <Td className="text-slate-600 dark:text-slate-400 leading-snug whitespace-pre-line">{r.padroes}</Td>
                      <Td className="text-slate-700 dark:text-slate-300">{r.fase}</Td>
                      <Td className="text-slate-700 dark:text-slate-300">{r.atividade}</Td>
                      <Td className="text-slate-700 dark:text-slate-300">{r.operacao}</Td>
                      <Td className="text-slate-700 dark:text-slate-300">{r.etapa}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-600 text-center py-8">Nenhuma linha encontrada.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 shrink-0">
          {tab === 'log'
            ? `${filteredLog.length} de ${LOG.length} alteração(ões)`
            : `${filtered.length} de ${rows.length} linhas`}
        </div>
      </div>
    </div>
  )
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 border-b border-slate-300 dark:border-slate-700 ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>
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
