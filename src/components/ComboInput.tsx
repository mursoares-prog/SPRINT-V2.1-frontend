import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

// ── Combobox custom: sugere opções num dropdown temático, mas aceita texto livre ─
// Substitui o <datalist> nativo (não estilizável e que desenhava uma 2ª seta).
export function ComboInput({ value, onChange, options, placeholder, className }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; below: boolean }>({ left: 0, top: 0, width: 0, below: true })
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Filtra pelo texto digitado; se o texto for igual a uma opção, mostra todas.
  const q = value.trim().toLowerCase()
  const filtered = q && !options.some(o => o.toLowerCase() === q)
    ? options.filter(o => o.toLowerCase().includes(q))
    : options

  // Posiciona o dropdown (portal, position:fixed) acima ou abaixo do campo conforme o espaço.
  const reposition = () => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const below = spaceBelow >= 210 || spaceBelow >= r.top
    setPos({ left: r.left, top: below ? r.bottom + 4 : r.top - 4, width: r.width, below })
  }

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    const onScroll = () => reposition()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Mantém o item ativo visível ao navegar com o teclado.
  useEffect(() => {
    if (!open || active < 0) return
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const choose = (opt: string) => { onChange(opt); setOpen(false); setActive(-1) }

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <input value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1) }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, filtered.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
          else if (e.key === 'Enter' && open && active >= 0) { e.preventDefault(); choose(filtered[active]) }
          else if (e.key === 'Escape') { setOpen(false); setActive(-1) }
        }}
        placeholder={placeholder ?? 'selecione…'}
        className={`${className ?? ''} w-full pr-5`} />
      <ChevronDown onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
        className={`absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-slate-500 cursor-pointer transition-transform ${open ? 'rotate-180' : ''}`} />
      {open && filtered.length > 0 && createPortal(
        <ul ref={listRef}
          style={{
            position: 'fixed', left: pos.left, width: pos.width,
            ...(pos.below ? { top: pos.top } : { bottom: window.innerHeight - pos.top }),
          }}
          className="z-[60] max-h-52 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-0.5">
          {filtered.map((opt, i) => (
            <li key={opt}>
              <button type="button"
                onMouseDown={e => { e.preventDefault(); choose(opt) }}
                onMouseEnter={() => setActive(i)}
                className={`block w-full text-left text-xs px-2 py-1 transition-colors ${
                  i === active
                    ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                    : value === opt
                      ? 'text-sky-600 dark:text-sky-400 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                }`}>
                {opt}
              </button>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  )
}
