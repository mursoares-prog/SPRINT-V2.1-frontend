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
          <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">{pkg.id}</span>
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

function PackagesPanel({ abanList, activeLines }: {
  abanList: Package[]; activeLines: PackageLines
}) {
  const getLines = (pkgId: string) =>
    (activeLines[pkgId] ?? []).map(l => l.text).filter(Boolean)
  return (
    <div className="px-5 py-4 space-y-6">
      {abanList.length > 0 && (
        <section>
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500 mb-2">
            Pacotes ABAN
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-500 dark:text-slate-600">({abanList.length})</span>
          </h3>
          <table className="w-full">
            <tbody>
              {abanList.map(p => <PackageRow key={p.id} pkg={p} lines={getLines(p.id)} />)}
            </tbody>
          </table>
        </section>
      )}
      {abanList.length === 0 && (
        <p className="text-sm text-slate-600 text-center py-8">Nenhum pacote encontrado.</p>
      )}
    </div>
  )
}

export function PackagesCatalogModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [activeLines, setActiveLines] = useState<PackageLines>(BUNDLED_LINES as PackageLines)

  useEffect(() => {
    if (!isApiConfigured()) return
    getMergedPackageLines().then(setActiveLines).catch(() => {})
  }, [])

  const { abanList } = useMemo(() => {
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
    }
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-start pl-4 bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[26rem] max-h-[90vh] overflow-hidden">

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
          <PackagesPanel abanList={abanList} activeLines={activeLines} />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 shrink-0">
          {abanList.length} pacotes encontrados
        </div>
      </div>
    </div>
  )
}
