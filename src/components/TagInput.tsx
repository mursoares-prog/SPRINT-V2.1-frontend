import { useState } from 'react'
import { X } from 'lucide-react'
import { ComboInput } from './ComboInput'

// ── Lista de tags livres: pills fixas sempre visíveis (presets) + chips removíveis
// para valores extras + campo para adicionar um valor novo ("outra") ──────────────
// Usado para classificações de múltiplo valor definidas pelo admin (ex.: "Tipo de
// sonda" de um escopo customizado) — os presets cobrem os casos comuns como toggle
// de um clique; qualquer texto digitado no campo vira uma tag nova ("outra"), sem
// precisar de um campo separado.
export function TagInput({ values, onChange, presets, options, placeholder }: {
  values: string[]
  onChange: (next: string[]) => void
  presets?: string[]
  options: string[]
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const presetList = presets ?? []
  const extraValues = values.filter(v => !presetList.includes(v))

  const add = (raw: string) => {
    const v = raw.trim()
    if (!v || values.includes(v)) { setDraft(''); return }
    onChange([...values, v])
    setDraft('')
  }
  const remove = (v: string) => onChange(values.filter(x => x !== v))
  const togglePreset = (v: string) => onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v])

  const handleComboChange = (v: string) => {
    setDraft(v)
    const trimmed = v.trim()
    if (trimmed && options.includes(trimmed) && !values.includes(trimmed)) add(trimmed)
  }

  return (
    <div className="space-y-1.5">
      {presetList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {presetList.map(p => {
            const checked = values.includes(p)
            return (
              <label key={p} className={`flex items-center justify-center py-1 px-2 rounded-md border text-[10px] cursor-pointer transition-colors ${
                checked ? 'border-[#005889] bg-[#005889]/10 text-[#005889] dark:border-[#d97706]/60 dark:bg-[#d97706]/10 dark:text-[#d97706]' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => togglePreset(p)} />
                {p}
              </label>
            )
          })}
        </div>
      )}
      {extraValues.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {extraValues.map(v => (
            <span key={v}
              className="flex items-center gap-1 py-1 px-2 rounded-md border text-[10px] border-[#005889] bg-[#005889]/10 text-[#005889] dark:border-[#d97706]/60 dark:bg-[#d97706]/10 dark:text-[#d97706]">
              {v}
              <button type="button" onClick={() => remove(v)} className="hover:opacity-60 transition-opacity" title="Remover">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div onKeyDown={e => {
        if (e.key === 'Enter' && !e.defaultPrevented && draft.trim()) { e.preventDefault(); add(draft) }
      }}>
        <ComboInput
          value={draft}
          onChange={handleComboChange}
          options={options.filter(o => !values.includes(o))}
          placeholder={placeholder ?? 'outra…'}
          className="text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-slate-800 dark:text-slate-200 outline-none focus:border-[#005889]/60"
        />
      </div>
    </div>
  )
}
