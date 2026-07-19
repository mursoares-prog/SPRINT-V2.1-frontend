import { X, Search, ChevronDown } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { getMergedPackageLines, isApiConfigured } from '../utils/api'
import BUNDLED_LINES from '../data/packageLines.json'
import { PACKAGES } from '../data/packages'
import type { Package } from '../types'

type PackageLines = Record<string, { text: string }[]>

function PackageRow({ pkg, lines }: { pkg: Package; lines: string[] }) {
  const [expanded, setExpanded] = useState(false)
  const toggle = lines.length > 0 ? () => setExpanded(v => !v) : undefined
  return (
    <>
      <tr
        onClick={toggle}
        className={`border-b border-slate-100 dark:border-slate-800 transition-colors ${toggle ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}`}>
        <td className="py-1.5 pr-2 w-5 shrink-0">
          {lines.length > 0 ? (
            <ChevronDown size={13} className={`text-slate-400 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} />
          ) : (
            <span className="w-[13px] block" />
          )}
        </td>
        <td className="py-1.5 pr-3 w-24 shrink-0">
          <span className="text-xs font-medium text-[#0c2340] dark:text-blue-400 whitespace-nowrap">{pkg.id}</span>
        </td>
        <td className="py-1.5 pr-3 text-xs text-slate-700 dark:text-slate-300 leading-snug">{pkg.name}</td>
      </tr>
      {expanded && lines.map((desc, i) => (
        <tr key={i} className="bg-slate-50/70 dark:bg-slate-800/30">
          <td />
          <td className="py-0.5 pr-2 align-top">
            <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500 tabular-nums select-none">{String(i + 1).padStart(2, '0')}</span>
          </td>
          <td className="py-0.5 pr-3 text-[11px] text-slate-600 dark:text-slate-400 leading-snug border-b border-slate-100/60 dark:border-slate-700/30">
            {desc}
          </td>
        </tr>
      ))}
    </>
  )
}

function PkgSection({ title, list, activeLines }: {
  title: string; list: Package[]; activeLines: PackageLines
}) {
  const [expanded, setExpanded] = useState(true)
  const getLines = (pkgId: string) =>
    (activeLines[pkgId] ?? []).map(l => l.text).filter(Boolean)
  if (list.length === 0) return null
  return (
    <section>
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-1.5 text-left text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500 mb-2 rounded hover:text-slate-800 dark:hover:text-slate-300 transition-colors">
        <ChevronDown size={14} className={`shrink-0 transition-transform duration-150 ${expanded ? '' : '-rotate-90'}`} />
        {title}
        <span className="font-normal normal-case tracking-normal text-slate-500 dark:text-slate-600">({list.length})</span>
      </button>
      {expanded && (
        <table className="w-full">
          <tbody>
            {list.map(p => <PackageRow key={p.id} pkg={p} lines={getLines(p.id)} />)}
          </tbody>
        </table>
      )}
    </section>
  )
}

function PackagesPanel({ abanList, tabList, activeLines }: {
  abanList: Package[]; tabList: Package[]; activeLines: PackageLines
}) {
  const total = abanList.length + tabList.length
  return (
    <div className="px-5 py-4 space-y-6">
      {total === 0
        ? <p className="text-sm text-slate-600 text-center py-8">Nenhum pacote encontrado.</p>
        : <>
            <PkgSection title="Pacotes ABAN" list={abanList} activeLines={activeLines} />
            <PkgSection title="Pacotes T-AB" list={tabList} activeLines={activeLines} />
          </>
      }
    </div>
  )
}

export function PackagesCatalogModal({ onClose, anchorRect }: { onClose: () => void; anchorRect?: DOMRect }) {
  const [query, setQuery] = useState('')
  const [activeLines, setActiveLines] = useState<PackageLines>(BUNDLED_LINES as PackageLines)

  useEffect(() => {
    if (!isApiConfigured()) return
    // Mescla por cima do bundle local: o servidor tem precedência por pacote
    // (overrides/edições/customizados), mas pacotes ausentes no dump do backend
    // continuam expansíveis pelas linhas locais.
    getMergedPackageLines()
      .then(server => setActiveLines(prev => ({ ...prev, ...server })))
      .catch(() => {})
  }, [])

  const { abanList, tabList } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = Object.values(PACKAGES) as Package[]
    const matches = (p: Package) =>
      !q || p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
    const sorted = (arr: Package[]) =>
      arr.filter(matches).sort((a, b) => {
        const na = parseInt(a.id.replace(/\D/g, ''), 10)
        const nb = parseInt(b.id.replace(/\D/g, ''), 10)
        return na - nb
      })
    return {
      abanList: sorted(all.filter(p => p.id.startsWith('ABAN'))),
      tabList:  sorted(all.filter(p => p.id.startsWith('T-AB'))),
    }
  }, [query])

  const dropdownLeft = anchorRect
    ? Math.min(anchorRect.left, window.innerWidth - 380)
    : 0

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 flex flex-col bg-[#f5f5f5] dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden ring-1 ring-slate-300/60 dark:ring-slate-700/60"
        style={{
          top: anchorRect ? anchorRect.bottom + 4 : 48,
          left: dropdownLeft,
          width: '360px',
          maxHeight: 'calc(100vh - 60px)',
        }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Catálogo de pacotes
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por código ou nome..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#0c2340] dark:focus:border-sky-700"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto scrollbar-custom">
          <PackagesPanel abanList={abanList} tabList={tabList} activeLines={activeLines} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 shrink-0">
          {abanList.length + tabList.length} pacotes encontrados · {abanList.length} ABAN · {tabList.length} T-AB
        </div>
      </div>
    </>
  )
}
