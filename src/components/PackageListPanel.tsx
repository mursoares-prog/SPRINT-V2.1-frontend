import { X, Search } from 'lucide-react'
import { useState, useMemo } from 'react'
import { PACKAGES } from '../data/packages'
import type { Package } from '../types'

function PackageRow({ pkg }: { pkg: Package }) {
  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <td className="py-1.5 pr-3 w-24 shrink-0">
        <span className="font-mono text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap">
          {pkg.id}
        </span>
      </td>
      <td className="py-1.5 pr-3 text-xs text-slate-700 dark:text-slate-300 leading-snug">{pkg.name}</td>
      <td className="py-1.5 pr-3 text-xs text-slate-700 dark:text-slate-400 whitespace-nowrap">{pkg.category}</td>
    </tr>
  )
}

export function PackageListPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')

  const { abanList, novoList } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = Object.values(PACKAGES)
    const matches = (p: Package) =>
      !q ||
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)

    const sorted = (arr: Package[]) =>
      arr.filter(matches).sort((a, b) => {
        const na = parseInt(a.id.replace(/\D/g, ''), 10)
        const nb = parseInt(b.id.replace(/\D/g, ''), 10)
        return na - nb
      })

    return {
      abanList: sorted(all.filter(p => p.id.startsWith('ABAN'))),
      novoList: sorted(all.filter(p => p.id.startsWith('NOVO'))),
    }
  }, [query])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative flex flex-col bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
            Lista de pacotes
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            <Search size={14} className="text-slate-600 shrink-0" />
            <input
              type="text"
              placeholder="Buscar por código, nome ou categoria..."
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 scrollbar-custom">

          {abanList.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500 mb-2">
                Pacotes ABAN
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-500 dark:text-slate-600">
                  ({abanList.length})
                </span>
              </h3>
              <table className="w-full">
                <tbody>
                  {abanList.map(p => <PackageRow key={p.id} pkg={p} />)}
                </tbody>
              </table>
            </section>
          )}

          {novoList.length > 0 && (
            <section>
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500 mb-2">
                Pacotes NOVO
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-500 dark:text-slate-600">
                  ({novoList.length})
                </span>
              </h3>
              <table className="w-full">
                <tbody>
                  {novoList.map(p => <PackageRow key={p.id} pkg={p} />)}
                </tbody>
              </table>
            </section>
          )}

          {abanList.length === 0 && novoList.length === 0 && (
            <p className="text-sm text-slate-600 text-center py-8">Nenhum pacote encontrado.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-600 shrink-0">
          {abanList.length + novoList.length} pacotes encontrados
        </div>
      </div>
    </div>
  )
}
