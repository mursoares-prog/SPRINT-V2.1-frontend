import React, { useState, useEffect, useRef, useMemo, createContext, useContext } from 'react'
import { X, Crosshair, PanelLeftClose, Search, PocketKnife } from 'lucide-react'
import { useApp, lineIdsForLocate, SLWLFT_HIGH_PKG_IDS, type LocateTarget } from '../context/AppContext'
import type { ProjectData, BhaPlanFields } from '../types'
import { PACKAGES } from '../data/packages'
import { bhaDerivedDepth, camisaoDhsvFields, gabaritoFields } from '../engines/nippleDepth'
import {
  DIAM_ESTAMPADOR_FIELD, DIAM_LOCALIZADOR_FIELD, MOTOR_FUNDO_FIELD, BROCA_FIELD, MODELO_BROCA_FIELD,
  OGIVA_DIAM_FIELD, INTERVALO_INTERESSE_TOPO_FIELD, INTERVALO_INTERESSE_BASE_FIELD,
  CIMENT_ALINHAMENTO_FIELD, CIMENT_PLUG_VOL_FIELD, CIMENT_PLUG_DENS_FIELD, CIMENT_FCBA_DENS_FIELD,
  CR_DIAM_FIELD, CIMENT_ANULAR_ACIMA_TAMPAO_FIELD, CIMENT_TOPO_REVCIM_FIELD,
  TAMPAO_ABANDONO_DENS_FIELD, TAMPAO_ABANDONO_TOPO_FIELD, TAMPAO_ABANDONO_COMPR_FIELD,
  PLAN_KEY_ALIASES,
} from '../engines/placeholders'
import { tokenBinding, tokenUsedByPackages } from '../engines/assistantFields'
import { getPackageLines } from '../data/packageLinesStore'
import { resolvePlaceholderDefs, getPlaceholderDefs } from '../data/placeholderDefsStore'
import type { PlaceholderFieldDef } from '../utils/api'
import { ComboInput } from './ComboInput'
import { WirelineToolsPanel } from './WirelineToolsPanel'

// ── Filtro de seções ──────────────────────────────────────────────────────────
const SectionFilterCtx = createContext('')
const normalizeFilter = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

// Extrai recursivamente todos os labels de Field (e texto de filhos React)
function extractFieldLabels(node: React.ReactNode): string {
  let text = ''
  React.Children.forEach(node, child => {
    if (child === null || child === undefined || typeof child === 'boolean') return
    if (!React.isValidElement(child)) return
    const props = child.props as Record<string, unknown>
    if (typeof props.label === 'string') text += ' ' + props.label
    if (props.children != null) text += ' ' + extractFieldLabels(props.children as React.ReactNode)
  })
  return text
}

// ── Localizar campo → realça linhas relacionadas no cronograma ────────────────
const LocateCtx = createContext<{
  onLocate?: (t: LocateTarget) => void
  onClear?: () => void
  active: LocateTarget | null
  // Só mostra a mira quando o alvo realmente localiza ≥1 linha do projeto (evita miras
  // "mortas"). Usa a mesma fonte da verdade do clique (lineIdsForLocate) — ver
  // ProjectDataPanel (canLocate). Ausente ⇒ comporta-se como sempre-localizável.
  canLocate?: (t: LocateTarget) => boolean
} | null>(null)

/** Mostra a mira? Precisa de onLocate + alvo + (quando há canLocate) que o alvo localize algo. */
function showLocateFor(
  ctx: { onLocate?: (t: LocateTarget) => void; canLocate?: (t: LocateTarget) => boolean } | null,
  target: LocateTarget | undefined,
): boolean {
  if (!ctx?.onLocate || !target) return false
  return ctx.canLocate ? ctx.canLocate(target) : true
}

const locateEq = (a: LocateTarget | null, b: LocateTarget | null): boolean => {
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'data' && b.kind === 'data') return a.field === b.field
  if (a.kind === 'plan' && b.kind === 'plan') return a.uid === b.uid && a.key === b.key
  if (a.kind === 'nipple' && b.kind === 'nipple') return a.depthField === b.depthField
  if (a.kind === 'textMatch' && b.kind === 'textMatch') return a.pattern === b.pattern
  return false
}

// ── Constants ──────────────────────────────────────────────────────────────────
const BHA_TECH: Partial<Record<string, string>> = {
  wireline: 'Arame', electric: 'Perfilagem', ct: 'Flexitubo', workstring: 'Coluna de Trabalho',
}
const BHA_TECH_ORDER = ['wireline', 'electric', 'ct', 'workstring'] as const

// ── Generic field — horizontal layout ─────────────────────────────────────────
function Field({ label, value, onChange, placeholder, unit, readOnly, locate }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; unit?: string; readOnly?: boolean
  locate?: LocateTarget
}) {
  const ctx = useContext(LocateCtx)
  const filter = useContext(SectionFilterCtx)
  const showLocate = showLocateFor(ctx, locate)
  const active = showLocate && locateEq(ctx!.active, locate!)
  const highlighted = !!(filter && normalizeFilter(label).includes(normalizeFilter(filter)))
  return (
    <div className={`flex items-start justify-between gap-2 py-1 border-b border-slate-200 dark:border-slate-800 last:border-0 rounded ${highlighted ? 'bg-sky-50 dark:bg-sky-900/30' : ''}`}>
      <span className={`text-xs leading-snug flex items-center gap-1 min-w-0 flex-1 ${highlighted ? 'text-sky-800 dark:text-sky-300 font-semibold' : 'text-slate-600 dark:text-slate-500'}`}>
        {showLocate && (
          <button type="button"
            onClick={() => ctx!.onLocate!(locate!)}
            title="Localizar linhas relacionadas no cronograma (Esc limpa)"
            className={`shrink-0 self-stretch flex items-center transition-colors ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-600 hover:text-sky-500 dark:hover:text-sky-400'}`}>
            <Crosshair size={11} />
          </button>
        )}
        <span className="min-w-0 break-words">{label}</span>
      </span>
      <div className="flex items-center shrink-0 w-[92px] justify-end">
        <input
          type="text" value={value} placeholder={placeholder ?? '—'}
          readOnly={readOnly}
          onChange={e => { if (!readOnly) onChange(e.target.value) }}
          onFocus={() => ctx?.onClear?.()}
          title={readOnly ? 'Campo preenchido automaticamente' : undefined}
          className={`w-full min-w-0 text-xs font-semibold ${readOnly ? 'text-slate-700 dark:text-slate-400 italic cursor-default' : 'text-slate-700 dark:text-slate-200'} bg-transparent outline-none placeholder:text-slate-500 dark:placeholder:text-slate-600 leading-snug text-right`}
        />
        {unit && (
          <span className="text-[10px] text-slate-600 dark:text-slate-500 shrink-0 ml-1 select-none">{unit}</span>
        )}
      </div>
    </div>
  )
}


// Campo do assistente renderizado 100% a partir de um PlaceholderFieldDef do servidor
// (aba Place Holders). O widget vem de `fieldType`; rótulo/unidade/opções vêm do def.
// Usado pelo renderer orientado a dados das seções de campos GLOBAIS (ProjectData).
function AssistantField({ def, value, onChange }: {
  def: PlaceholderFieldDef; value: string; onChange: (v: string) => void
}) {
  const locate: LocateTarget = { kind: 'data', field: def.token as keyof ProjectData }
  if (def.fieldType === 'boolean') {
    return <BooleanField label={def.label} value={value} onChange={onChange} locate={locate} />
  }
  if (def.fieldType === 'picklist') {
    return <PicklistField label={def.label} value={value} options={def.options} onChange={onChange} locate={locate} />
  }
  // text | number | unit → mesmo input de texto; a unidade (se houver) é exibida ao lado.
  return <Field label={def.label} value={value} onChange={onChange} unit={def.unit ?? undefined} locate={locate} />
}

// Picklist do assistente (combobox: sugere as opções mas aceita texto livre), estilo
// alinhado ao <Field>. Usado por AssistantField quando fieldType === 'picklist'.
function PicklistField({ label, value, options, onChange, locate }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; locate?: LocateTarget
}) {
  const ctx = useContext(LocateCtx)
  const filter = useContext(SectionFilterCtx)
  const showLocate = showLocateFor(ctx, locate)
  const active = showLocate && locateEq(ctx!.active, locate!)
  const highlighted = !!(filter && normalizeFilter(label).includes(normalizeFilter(filter)))
  const listId = `ph-opts-${label.replace(/\W+/g, '-')}`
  return (
    <div className={`flex items-start justify-between gap-2 py-1 border-b border-slate-200 dark:border-slate-800 last:border-0 rounded ${highlighted ? 'bg-sky-50 dark:bg-sky-900/30' : ''}`}>
      <span className={`text-xs leading-snug flex items-center gap-1 min-w-0 flex-1 ${highlighted ? 'text-sky-800 dark:text-sky-300 font-semibold' : 'text-slate-600 dark:text-slate-500'}`}>
        {showLocate && (
          <button type="button" onClick={() => ctx!.onLocate!(locate!)}
            title="Localizar linhas relacionadas no cronograma (Esc limpa)"
            className={`shrink-0 self-stretch flex items-center transition-colors ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-600 hover:text-sky-500 dark:hover:text-sky-400'}`}>
            <Crosshair size={11} />
          </button>
        )}
        <span className="min-w-0 break-words">{label}</span>
      </span>
      <div className="flex items-center shrink-0 w-[92px] justify-end">
        <input type="text" value={value} placeholder="—" list={listId}
          onChange={e => onChange(e.target.value)} onFocus={() => ctx?.onClear?.()}
          className="w-full min-w-0 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-transparent outline-none placeholder:text-slate-500 dark:placeholder:text-slate-600 leading-snug text-right" />
        <datalist id={listId}>{options.map(o => <option key={o} value={o} />)}</datalist>
      </div>
    </div>
  )
}

// Booleano do assistente (radio Sim/Não), estilo alinhado aos toggles de Hold Point.
// Guarda 'sim'/'nao' como string (compatível com o binding genérico de ProjectData).
function BooleanField({ label, value, onChange, locate }: {
  label: string; value: string; onChange: (v: string) => void; locate?: LocateTarget
}) {
  const ctx = useContext(LocateCtx)
  const showLocate = showLocateFor(ctx, locate)
  const active = showLocate && locateEq(ctx!.active, locate!)
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1 flex items-center gap-1">
        {showLocate && (
          <button type="button" onClick={() => ctx!.onLocate!(locate!)}
            title="Localizar linhas relacionadas no cronograma (Esc limpa)"
            className={`shrink-0 transition-colors ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-600 hover:text-sky-500 dark:hover:text-sky-400'}`}>
            <Crosshair size={11} />
          </button>
        )}
        {label}
      </span>
      {(['sim', 'nao'] as const).map(opt => (
        <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
          <input type="radio" checked={value === opt}
            onChange={() => onChange(value === opt ? '' : opt)} className="accent-[#0c2340]" />
          <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
        </label>
      ))}
    </div>
  )
}

// Linha informacional com botão de localização — para itens da seção Hold Points
// que não têm um campo numérico próprio (ex.: REVCIM, ECS/BOP).
function LocateRow({ children, target }: { children: React.ReactNode; target?: LocateTarget }) {
  const ctx = useContext(LocateCtx)
  const filter = useContext(SectionFilterCtx)
  const showLocate = showLocateFor(ctx, target)
  const active = showLocate && locateEq(ctx!.active, target!)
  const text = typeof children === 'string' ? children : ''
  const highlighted = !!(filter && text && normalizeFilter(text).includes(normalizeFilter(filter)))
  return (
    <div className={`text-xs py-0.5 flex items-center gap-1 rounded ${highlighted ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
      {showLocate && (
        <button type="button"
          onClick={() => ctx!.onLocate!(target!)}
          title="Localizar linhas relacionadas no cronograma (Esc limpa)"
          className={`shrink-0 transition-colors ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-600 hover:text-sky-500 dark:hover:text-sky-400'}`}>
          <Crosshair size={11} />
        </button>
      )}
      <span>{children}</span>
    </div>
  )
}

// ── Picklists de tipo de nipple por categoria ─────────────────────────────────
// Combobox (datalist): sugere as opções abaixo mas aceita qualquer texto digitado.
const NIPPLE_OPTS_TMF_PROD = [
  'Nipple F ou DB 3,81"',
  'Nipple F 3,81"',
  'Bore 5" Tree Manifold (Fabricante: Aker / FMC)',
  'Bore 5" 5KSI Tree Manifold (Fabricante: Cameron)',
]
const NIPPLE_OPTS_TMF_ANULAR = [
  'Nipple F 1,87"',
  'Nipple X/XN 1,87"',
]
const NIPPLE_OPTS_TH_PROD = [
  'Nipple F ou DB 3,75"',
  'Bore 5" TH (Fabricante: Aker / FMC)',
  'Bore 5" 5KSI TH (Fabricante: Cameron)',
]
const NIPPLE_OPTS_TH_ANULAR = [
  'Nipple F 1,81"',
  'Nipple R 1,81"',
  'Nipple X/XN 1,81"',
]
const NIPPLE_OPTS_DHSV = [
  'Perfil DB 3,68" (DHSV)',
  'Perfil DB 4,437" (DHSV)',
  'Perfil DB 4,56" (DHSV)',
]
const NIPPLE_OPTS_TSR_CAUDA = [
  'Nipple QN 1,81"',
  'Nipple QN 1,87"',
  'Nipple QN 2,125"',
  'Nipple QN 2,50"',
  'Nipple QN 2,56"',
  'Nipple QN 2,62"',
  'Nipple QN 2,75"',
  'Nipple QN 3,50"',
  'Nipple QN 3,56"',
  'Nipple QN 4,125"',
  'Nipple QN 4,25"',
  'Nipple QN 4,31"',
  'Nipple QN 4,312"',
  'Nipple QN 4,50"',
  'Nipple QN 4,56"',
  'Nipple DB 3,50"',
  'Nipple DB 3,56"',
  'Nipple DB 3,62"',
  'Nipple DB/QN 3,50"',
  'Nipple DB ou F ou QN 2,50"',
  'Nipple DB ou F ou QN 2,56"',
  'Nipple DB ou F ou QN 2,62"',
  'Nipple DB ou F ou QN 2,75"',
  'Nipple DB ou F ou QN 3,50"',
  'Nipple DB ou F ou QN 3,56"',
  'Nipple DB ou F ou QN 3,62"',
  'Nipple DB ou F ou QN 3,68"',
  'Nipple F 2,31"',
  'Nipple F 2,312"',
  'Nipple F 2,62"',
  'Nipple F 2,75"',
  'Nipple F 2,81"',
  'Nipple F 2,87"',
  'Nipple F 3,68"',
  'Nipple F 3,75"',
  'Nipple F ou R 1,81"',
  'Nipple F ou R 1,87"',
  'Nipple F ou R 2,25"',
  'Nipple F ou R 2,62"',
  'Nipple F ou R 2,75"',
  'Nipple F ou R 3,68"',
  'Nipple F ou R 3,81"',
  'Nipple R 1,81"',
  'Nipple R 2"',
  'Nipple R 2,25"',
  'Nipple R 2,56"',
  'Nipple R 2,75"',
  'Nipple R 2,81"',
  'Nipple R 3,312"',
  'Nipple R 3,68"',
  'Nipple X 2,81"',
  'Nipple X/XN 2,31"',
  'Nipple X/XN 2,75"',
]

// ── Linha compacta de Nipple: tipo + profundidade lado a lado ─────────────────
function NippleRow({ label, name, depth, onName, onDepth, namePlaceholder, options, locate }: {
  label: string
  name: string; depth: string
  onName: (v: string) => void; onDepth: (v: string) => void
  namePlaceholder?: string
  options?: string[]
  locate?: LocateTarget
}) {
  const inputCls = 'min-w-0 text-xs text-slate-700 dark:text-slate-200 bg-[#fafafa] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-sky-400 dark:focus:border-sky-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors'
  const na = name.trim().toLowerCase() === 'não aplicável'
  const ctx = useContext(LocateCtx)
  const showLocate = showLocateFor(ctx, locate)
  const active = showLocate && locateEq(ctx!.active, locate!)
  return (
    <div className="flex items-center gap-1.5 py-1 border-b border-slate-200 dark:border-slate-800 last:border-0">
      <span className="text-[11px] text-slate-600 dark:text-slate-500 w-20 shrink-0 leading-tight flex items-center gap-1">
        {showLocate && (
          <button type="button"
            onClick={() => ctx!.onLocate!(locate!)}
            title="Localizar linhas relacionadas no cronograma (Esc limpa)"
            className={`shrink-0 transition-colors ${active ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-600 hover:text-sky-500 dark:hover:text-sky-400'}`}>
            <Crosshair size={11} />
          </button>
        )}
        <span className="min-w-0">{label}</span>
      </span>
      {options ? (
        <ComboInput value={name}
          onChange={v => { onName(v); if (v.trim().toLowerCase() === 'não aplicável' && depth) onDepth('') }}
          options={['Não Aplicável', ...options]}
          placeholder={namePlaceholder ?? 'selecione…'} className={inputCls} />
      ) : (
        <input value={name} onChange={e => onName(e.target.value)}
          placeholder={namePlaceholder ?? 'tipo'}
          className={`${inputCls} flex-1`} />
      )}
      <div className="flex items-center gap-0.5 shrink-0">
        <input value={na ? '' : depth} onChange={e => onDepth(e.target.value)} disabled={na}
          placeholder={na ? '—' : 'prof.'}
          className={`${inputCls} w-14 text-right ${na ? 'opacity-40 cursor-not-allowed' : ''}`} />
        <span className={`text-[10px] select-none ${na ? 'text-slate-300 dark:text-slate-700' : 'text-slate-500 dark:text-slate-500'}`}>m</span>
      </div>
    </div>
  )
}

type NippleRowConf = {
  label: string
  typeField: keyof ProjectData; depthField: keyof ProjectData
  name: string; depth: string
  onName: (v: string) => void; onDepth: (v: string) => void
  options: string[]
}

function InactiveNippleRows({ rows }: { rows: NippleRowConf[] }) {
  const [open, setOpen] = useState(false)
  const isFilled = (v: string) => { const t = v.trim().toLowerCase(); return t !== '' && t !== 'não aplicável' }
  const filledCount = rows.filter(r => isFilled(r.name)).length
  const label = filledCount > 0
    ? `${rows.length} nipple${rows.length > 1 ? 's' : ''} sem operação relacionada (${filledCount} preenchido${filledCount > 1 ? 's' : ''})`
    : `${rows.length} nipple${rows.length > 1 ? 's' : ''} sem operação relacionada`
  return (
    <div className="border-t border-slate-200 dark:border-slate-800">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] text-slate-400 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-500 transition-colors">
        <span className="text-[9px] select-none">{open ? '▾' : '▸'}</span>
        <span>{open ? 'Ocultar não relacionados' : label}</span>
      </button>
      {open && rows.map(r => (
        <NippleRow key={r.typeField as string} label={r.label} name={r.name} depth={r.depth}
          onName={r.onName} onDepth={r.onDepth} options={r.options}
          locate={{ kind: 'nipple', typeField: r.typeField, depthField: r.depthField }} />
      ))}
    </div>
  )
}

// ── Collapsible section with dirty state + Aplicar button ──────────────────────
function Section({ title, searchText, children, defaultOpen = false, isDirty = false, onApply, onDiscard, canApply = true }: {
  title: string; searchText?: string; children: React.ReactNode; defaultOpen?: boolean
  isDirty?: boolean; onApply?: () => void; onDiscard?: () => void; canApply?: boolean
}) {
  const filter = useContext(SectionFilterCtx)
  const [collapsed, setCollapsed] = useState(!defaultOpen)

  const childLabels = filter ? extractFieldLabels(children) : ''
  const matches = !filter || normalizeFilter(title + ' ' + (searchText ?? '') + childLabels).includes(normalizeFilter(filter))
  if (!matches) return null

  const titleHighlighted = !!(filter && normalizeFilter(title + ' ' + (searchText ?? '')).includes(normalizeFilter(filter)))

  // When searching, force expanded so fields are visible for highlighting
  const effectiveCollapsed = filter ? false : collapsed

  const dirty = isDirty && !!onApply
  return (
    <div className={`shrink-0 rounded-xl overflow-hidden shadow-sm ring-1 transition-colors ${
      dirty
        ? 'ring-blue-300 dark:ring-blue-700/70'
        : 'ring-slate-300 dark:ring-slate-700/60'
    }`}>
      <div className={`flex items-center gap-1.5 px-2.5 py-2 ${titleHighlighted ? 'bg-sky-50 dark:bg-sky-900/30' : 'bg-[#ebebeb] dark:bg-slate-800/50'} ${!effectiveCollapsed ? 'border-b border-slate-300 dark:border-slate-700/50' : ''}`}>
        <button onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
          <span className={`w-4 font-bold text-sm leading-none select-none transition-colors ${dirty ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
            {effectiveCollapsed ? '+' : '−'}
          </span>
          <span className={`text-xs font-bold tracking-wide transition-colors ${dirty ? 'text-blue-600 dark:text-blue-400' : titleHighlighted ? 'text-sky-800 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'}`}>
            {title}
          </span>
          {dirty && <span className="text-blue-400 text-[8px] leading-none ml-0.5">●</span>}
        </button>
        {dirty && !effectiveCollapsed && (
          <>
            {onDiscard && (
              <button onClick={onDiscard}
                title="Descartar alterações desta seção"
                className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                Desistir
              </button>
            )}
            <button onClick={canApply ? onApply : undefined}
              disabled={!canApply}
              title={canApply ? undefined : 'Nenhuma linha afetada por essas alterações'}
              className={`shrink-0 flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors ${
                canApply
                  ? 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-500 cursor-not-allowed'
              }`}>
              Aplicar
            </button>
          </>
        )}
      </div>
      {!effectiveCollapsed && <div className="px-2.5 py-1.5 space-y-0.5">{children}</div>}
    </div>
  )
}

// ── Each section just lists its fields (used to know what to patch) ───────────
const SECTION_FIELDS: Record<string, (keyof ProjectData)[]> = {
  sonda:      ['pocoOrigem','poco','distanciaEntrePocos','velocidadeMedia'],
  fluidos:    ['amortFcbaDensidade','pressaoCabecaLimite','limitePressaoBombeio','bullheadVolume','fcbaCorteDens'],
  testes_escp: ['mapecab','pressaoKillChoke','pressaoVgx','pressaoEquipSupBop','pressaoBopPerfuracao'],
  equipamentos_superficie: ['pressaoRiserDpr','pressaoTesteAltaEquipSup'],
  testes_pressao: ['pressaoOverbalanceStvR275','pressaoOverbalanceStvF281','pressaoOverbalancePlugR275','pressaoOverbalancePlugF281',
               'pressaoEstColunaVgl','pressaoEstTampaoBd','pressaoIntegridadeColunaPlt','pressaoEstBppCabo',
               'pressaoEstPlugFtF281','pressaoEstPlugFtR275','pressaoTesteNegPlugTh','pressaoEstStvFtF281',
               'pressaoEstStvFtR275','pressaoEstBppColuna','pressaoTestePacker','pressaoLinhasSupCr',
               'pressaoEstPocoFcba','pressaoEstPlugTmfProd','pressaoEstPlugTmfAnul'],
  nipples:    ['nipple381','nipple381Depth','nipple375','nipple375Depth',
               'nipple281','nipple281Depth','nippleTHanular','nippleTHanularDepth',
               'nippleDhsv','nippleDhsvDepth',
               'nipple275','nipple275Depth','nipplesOutros','nipplesOutrosDepth'],
  holdpoints: ['holdPoints',
               // Fallback genérico de estanqueidade
               'pressaoProva'],
  bha_wireline:   ['bhaPlans',
               // Estanqueidade pós-instalação — STV/Plug (wireline): valor + flag de Hold Point
               'pressaoEstStvR','pressaoEstStvRHp','pressaoEstStvF','pressaoEstStvFHp','pressaoEstPlugR','pressaoEstPlugRHp',
               'pressaoEstPlugF','pressaoEstPlugFHp','pressaoEstPlugTH','pressaoEstPlugTHHp',
               // Pcab N₂ teste de influxo (wireline): valor + flag de Hold Point
               'outrosPcabN2Psi','outrosPcabN2PsiHp',
               'gabaritoNippleDiam','tampaoTipo','profRegistroPressao','numEstacoesRp'],
  bha_electric:   ['bhaPlans','taeTuboDiam',
               // Estanqueidade pós-instalação — TAE (elétrico): valor + flag de Hold Point
               'pressaoEstTae','pressaoEstTaeHp','canhaoModelo',
               // Hold Point REVCIM: governa prefixo {{_hpRevcim=}} nas linhas de avaliação de cimentação
               'revcimHp',
               // Hold Point REVCIM próprio do ABAN 105 (Through Tubing) — separado do flag acima
               'revcimHp105',
               // Tampão de bismuto (ABAN 238 — Perfilagem/Cabo elétrico)
               'bismutoEur','bismutoOverpull'],
  bha_ct:         ['bhaPlans','volBombeioDescidaFt',
               'packerFtDiam159','packerFtDiam164','plugFtDiam','plugFtAplicador','ferramentaBoDuplaDiam','ferramentaBhaFt',
               'marteleteModelo','marteletePonteiraDiam'],
  bha_workstring: ['bhaPlans',
               'colunaTrabalhoDpDiam','adaptadorMc','overpullKlbf','revestimentoDiam',
               'condicIntervaloTopo','condicIntervaloBase','corteBrocaDiam','corteDcSecoes','corteHwdpSecoes'],
  retirada_coluna: ['copCoiTubo'],
  cimentacao: ['cimentTopoAnularA','cimentTopoInteriorColuna','cimentProfPerfuracao',
               'cimentProfBaseCimentacao','cimentCrProfundidade','cimentPlugs','cimentPwc',
               'cimentAlinhamento078','cimentAlinhamento083','cimentAlinhamento084',
               'cimentPlugVol078','cimentPlugVol079','cimentPlugDens078','cimentPlugDens079',
               'cimentFcbaDens078','cimentFcbaDens079',
               'crDiam155','crDiam156','crDiam158',
               'cimentAnularAcimaTampao082','cimentAnularAcimaTampao084',
               'tampaoAbandonoDens199','tampaoAbandonoDens200','tampaoAbandonoTopo199','tampaoAbandonoTopo200',
               'tampaoAbandonoCompr199','tampaoAbandonoCompr200','ecsbFluidoDens',
               'cimentTopoRevcim247','cimentTopoRevcim248','bhaPlans'],
  equipamentos_submarinos: [
               // Movidos da seção Pressões (testes de interface / ANM)
               'pressaoBoreTest','pressaoTmfAnulAnm','outrosDrainB2Psi','pressaoN2Trt',
               // Movido da seção Pressões (LC DHSV)
               'pressaoBullheadDhsv'],
  outros:     ['outrosMegConc','outrosCoolingFlow'],
}

// Navigation packages whose duration is computed from distance / speed
const NAV_PACKAGE_IDS = ['ABAN 003', 'ABAN 208']

// ── Per-field schedule impact ──────────────────────────────────────────────────
// Only fields that actually affect schedule items are listed.
// `packageIds` targets specific Package.id (most precise).
// `cats` matches Package.category, `techs` matches FineTuningItem.technology.
// `navLines: true` flags the navigation line inside DMM/DMA packages.
type FieldImpact = { packageIds?: string[]; cats?: string[]; techs?: string[]; navLines?: boolean }
const FIELD_IMPACT: Partial<Record<keyof ProjectData, FieldImpact>> = {
  // Sonda — distance/speed change schedule (nav package + line); poço/origem change nav line text
  distanciaEntrePocos: { packageIds: NAV_PACKAGE_IDS, navLines: true },
  velocidadeMedia:     { packageIds: NAV_PACKAGE_IDS, navLines: true },
  poco:                { packageIds: NAV_PACKAGE_IDS, navLines: true },
  pocoOrigem:          { packageIds: NAV_PACKAGE_IDS, navLines: true },
  // sonda, mr, mrp, lda — pure metadata, no impact

  // CWO — riser/conjunto WO choice
  cwo: { cats: ['Descida WO','Conexão ANM','Retirada WO'] },

  // Fluidos
  amortFluid:           { cats: ['Limpeza/Amortecimento','Coluna de Trabalho'] },
  amortPeso:            { cats: ['Limpeza/Amortecimento','Coluna de Trabalho'] },
  pressaoFratCapea:     { cats: ['Coluna de Trabalho','Bombeio Direto'] },
  limitePressaoBombeio: { cats: ['Coluna de Trabalho','Bombeio Direto'] },

  // Pressões
  mapecab:           { cats: ['Testes ANM','BOP'] },
  pressaoSuperficie: { cats: ['Testes ANM'] },
  pressaoTrtAnm:     { cats: ['Testes ANM'] },

  // Perfuração / Corte — special handling in applySection: marks lines of pkgs whose name matches "perfura"/"corte"

  // Influxo
  testeInfluxo: { cats: ['Testes ANM','BOP'] },

  // Outros — direct line-text substitution per package
  outrosMegConc:       { packageIds: ['ABAN 216', 'ABAN 217'] },
  outrosCoolingFlow:   { packageIds: ['ABAN 223', 'ABAN 224'] },
  outrosPcabN2Psi:     { packageIds: ['ABAN 220', 'ABAN 221'] },
  outrosDrainB2Psi:    { packageIds: ['ABAN 218'] },

  // Hold points are documentation only — no schedule impact

  // Fluidos operacionais
  bullheadVolume:      { packageIds: ['ABAN 030','ABAN 062'] },
  bullheadDepth:       { packageIds: ['ABAN 030'] },
  amortFcbaDensidade:  { packageIds: ['ABAN 061','ABAN 062','ABAN 063'] },

  // Pressões operacionais
  pressaoBoreTest:    { packageIds: ['ABAN 012','ABAN 013','ABAN 206'] },
  pressaoRiserDpr:    { packageIds: ['ABAN 014','ABAN 015','ABAN 016','ABAN 017','ABAN 206','ABAN 244'] },
  pressaoN2Trt:       { packageIds: ['ABAN 024','ABAN 025'] },
  pressaoTmfAnulAnm:  { packageIds: ['ABAN 027','ABAN 028','ABAN 029'] },
  pressaoBullheadDhsv:{ packageIds: ['ABAN 030'] },
  pressaoTesteAltaEquipSup:{ packageIds: [...SLWLFT_HIGH_PKG_IDS] },
  // Testes de pressão por operação (desmembrados de pressaoProva) — 1 pacote por campo
  pressaoOverbalanceStvR275:   { packageIds: ['ABAN 048'] },
  pressaoOverbalanceStvF281:   { packageIds: ['ABAN 049'] },
  pressaoOverbalancePlugR275:  { packageIds: ['ABAN 050'] },
  pressaoOverbalancePlugF281:  { packageIds: ['ABAN 051'] },
  pressaoEstColunaVgl:         { packageIds: ['ABAN 057'] },
  pressaoEstTampaoBd:          { packageIds: ['ABAN 079'] },
  pressaoIntegridadeColunaPlt: { packageIds: ['ABAN 099'] },
  pressaoEstBppCabo:           { packageIds: ['ABAN 109'] },
  pressaoEstPlugFtF281:        { packageIds: ['ABAN 127'] },
  pressaoEstPlugFtR275:        { packageIds: ['ABAN 128'] },
  pressaoTesteNegPlugTh:       { packageIds: ['ABAN 129'] },
  pressaoEstStvFtF281:         { packageIds: ['ABAN 130'] },
  pressaoEstStvFtR275:         { packageIds: ['ABAN 131'] },
  pressaoEstBppColuna:         { packageIds: ['ABAN 198'] },
  pressaoTestePacker:          { packageIds: ['ABAN 201'] },
  pressaoLinhasSupCr:          { packageIds: ['ABAN 202'] },
  pressaoEstPocoFcba:          { packageIds: ['ABAN 226'] },
  pressaoEstPlugTmfProd:       { packageIds: ['ABAN 249'] },
  pressaoEstPlugTmfAnul:       { packageIds: ['ABAN 250'] },
  pressaoBopPerfuracao:{ packageIds: ['ABAN 228','ABAN 229'] },
  pressaoVgx:         { packageIds: ['ABAN 184'] },
  pressaoKillChoke:   { packageIds: ['ABAN 184'] },
  pressaoEquipSupBop: { packageIds: ['ABAN 184'] },
  pressaoProva:       { techs: ['wireline','electric','ct'] },
  pressaoEstStvR:     { packageIds: ['ABAN 038'] },
  pressaoEstStvRHp:   { packageIds: ['ABAN 038'] },
  pressaoEstStvF:     { packageIds: ['ABAN 039'] },
  pressaoEstStvFHp:   { packageIds: ['ABAN 039'] },
  pressaoEstPlugR:    { packageIds: ['ABAN 040'] },
  pressaoEstPlugRHp:  { packageIds: ['ABAN 040'] },
  pressaoEstPlugF:    { packageIds: ['ABAN 041'] },
  pressaoEstPlugFHp:  { packageIds: ['ABAN 041'] },
  pressaoEstTae:      { packageIds: ['ABAN 237'] },
  pressaoEstTaeHp:    { packageIds: ['ABAN 237'] },
  pressaoEstPlugTH:   { packageIds: ['ABAN 042'] },
  pressaoEstPlugTHHp: { packageIds: ['ABAN 042'] },
  outrosPcabN2PsiHp:  { packageIds: ['ABAN 220','ABAN 221'] },
  revcimHp:           { packageIds: ['ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 106','ABAN 107','ABAN 149','ABAN 231','ABAN 232','ABAN 234'] },
  revcimHp105:        { packageIds: ['ABAN 105'] },

  // Cimentação operacional
  cimentAlinhamento078: { packageIds: ['ABAN 078'] },
  cimentAlinhamento083: { packageIds: ['ABAN 083'] },
  cimentAlinhamento084: { packageIds: ['ABAN 084'] },
  cimentPlugVol078:  { packageIds: ['ABAN 078'] },
  cimentPlugVol079:  { packageIds: ['ABAN 079'] },
  cimentPlugDens078: { packageIds: ['ABAN 078'] },
  cimentPlugDens079: { packageIds: ['ABAN 079'] },
  cimentFcbaDens078: { packageIds: ['ABAN 078'] },
  cimentFcbaDens079: { packageIds: ['ABAN 079'] },

  // Em implementação — campos novos
  colunaTrabalhoDpDiam: { packageIds: ['ABAN 013','ABAN 182','ABAN 185','ABAN 189','ABAN 190','ABAN 191','ABAN 192','ABAN 193','ABAN 194','ABAN 195','ABAN 196','ABAN 197','ABAN 198','ABAN 199','ABAN 200','ABAN 202'] },
  volBombeioDescidaFt:  { packageIds: ['ABAN 124','ABAN 125','ABAN 127','ABAN 128','ABAN 129','ABAN 130','ABAN 131','ABAN 132','ABAN 133','ABAN 135'] },
  crDiam155:            { packageIds: ['ABAN 155'] },
  crDiam156:            { packageIds: ['ABAN 156'] },
  crDiam158:            { packageIds: ['ABAN 158'] },
  packerFtDiam159:      { packageIds: ['ABAN 159'] },
  packerFtDiam164:      { packageIds: ['ABAN 164'] },
  marteleteModelo:      { packageIds: ['ABAN 143'] },
  marteletePonteiraDiam:{ packageIds: ['ABAN 143'] },
  bismutoEur:           { packageIds: ['ABAN 238'] },
  bismutoOverpull:      { packageIds: ['ABAN 238'] },
  fcbaCorteDens:           { packageIds: ['ABAN 186','ABAN 189','ABAN 190','ABAN 235','ABAN 236'] },
  adaptadorMc:             { packageIds: ['ABAN 013'] },
  pressaoCabecaLimite:     { packageIds: ['ABAN 061','ABAN 062'] },
  gabaritoNippleDiam:      { packageIds: ['ABAN 079'] },
  tampaoTipo:              { packageIds: ['ABAN 079'] },
  cimentAnularAcimaTampao082: { packageIds: ['ABAN 082'] },
  cimentAnularAcimaTampao084: { packageIds: ['ABAN 084'] },
  cimentTopoRevcim247:        { packageIds: ['ABAN 247'] },
  cimentTopoRevcim248:        { packageIds: ['ABAN 248'] },
  canhaoModelo:            { packageIds: ['ABAN 102'] },
  plugFtDiam:              { packageIds: ['ABAN 129'] },
  plugFtAplicador:         { packageIds: ['ABAN 129'] },
  ferramentaBoDuplaDiam:   { packageIds: ['ABAN 144','ABAN 145'] },
  overpullKlbf:            { packageIds: ['ABAN 186'] },
  copCoiTubo:              { packageIds: ['ABAN 188','ABAN 189','ABAN 190'] },
  revestimentoDiam:        { packageIds: ['ABAN 196'] },
  tampaoAbandonoDens199:   { packageIds: ['ABAN 199'] },
  tampaoAbandonoDens200:   { packageIds: ['ABAN 200'] },
  tampaoAbandonoTopo199:   { packageIds: ['ABAN 199'] },
  tampaoAbandonoTopo200:   { packageIds: ['ABAN 200'] },
  tampaoAbandonoCompr199:  { packageIds: ['ABAN 199'] },
  tampaoAbandonoCompr200:  { packageIds: ['ABAN 200'] },
  ecsbFluidoDens:          { packageIds: ['ABAN 200'] },
  condicIntervaloTopo:     { packageIds: ['ABAN 233'] },
  condicIntervaloBase:     { packageIds: ['ABAN 233'] },
  ferramentaBhaFt:         { packageIds: ['ABAN 147'] },
  taeTuboDiam:             { packageIds: ['ABAN 237'] },
  profRegistroPressao:     { packageIds: ['ABAN 047'] },
  numEstacoesRp:           { packageIds: ['ABAN 047'] },
  corteBrocaDiam:          { packageIds: ['ABAN 235'] },
  corteDcSecoes:           { packageIds: ['ABAN 235'] },
  corteHwdpSecoes:         { packageIds: ['ABAN 235'] },
  nipple275:               { packageIds: ['ABAN 036'] },
  nipplesOutros:           { packageIds: ['ABAN 036'] },
}

// ── Main panel ─────────────────────────────────────────────────────────────────
export function ProjectDataPanel({ onLocate, onClearLocate, locatedTarget, oneByOneMode = false, setOneByOneMode, onMinimize }: {
  onLocate?: (t: LocateTarget) => void
  onClearLocate?: () => void
  locatedTarget?: LocateTarget | null
  oneByOneMode?: boolean
  setOneByOneMode?: (v: boolean) => void
  onMinimize?: () => void
} = {}) {
  const { state, dispatch } = useApp()
  const inp = state.inputs

  // ── Local staged state ──
  const [draft, setDraft] = useState<ProjectData>(() => state.projectData)
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [collapsedBhaItems, setCollapsedBhaItems] = useState<Set<string>>(new Set())
  const toggleBhaItem = (uid: string) => setCollapsedBhaItems(prev => {
    const next = new Set(prev)
    next.has(uid) ? next.delete(uid) : next.add(uid)
    return next
  })
  const applyingRef = useRef(false)

  // Sync draft when projectData changes externally (RESET, LOAD_PROJECT)
  useEffect(() => {
    if (applyingRef.current) { applyingRef.current = false; return }
    setDraft(state.projectData)
    setDirty({})
  }, [state.projectData])

  // Backfill on mount: preenche campos vazios a partir do MAPECAB já salvo no projeto.
  // Atualizações em tempo real (digitação) são tratadas no onChange do campo MAPECAB.
  useEffect(() => {
    setDraft(prev => {
      if (!prev.mapecab) return prev
      const next = { ...prev }
      let changed = false
      if (!next.pressaoKillChoke)    { next.pressaoKillChoke    = prev.mapecab; changed = true }
      if (!next.pressaoEquipSupBop)  { next.pressaoEquipSupBop  = prev.mapecab; changed = true }
      if (!next.pressaoBopPerfuracao){ next.pressaoBopPerfuracao = prev.mapecab; changed = true }
      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const d = draft

  // Field setter — writes to local draft and marks section dirty
  const setter = (sectionId: string) => (patch: Partial<ProjectData>) => {
    setDraft(prev => ({ ...prev, ...patch }))
    setDirty(prev => ({ ...prev, [sectionId]: true }))
  }

  // BHA por tecnologia: cada tecnologia é uma seção independente (sectionId = 'bha_<tech>'),
  // mas todas escrevem no mesmo objeto bhaPlans. Apply/discard/affects são escopados aos
  // itens (uids) daquela tecnologia.
  const bhaSectionId     = (tech: string) => `bha_${tech}`
  const bhaTechOfSection = (id: string) => id.startsWith('bha_') ? id.slice(4) : null
  const bhaUidsForTech   = (tech: string) =>
    new Set(state.fineTuningItems.filter(i => !i.isBlank && i.technology === tech).map(i => i.uid))

  // Apply a section — patch project data and flag impacted schedule items.
  // Only fields that actually changed (vs current state) drive the highlight,
  // so editing/reverting a value produces no false review prompt.
  const applySection = (sectionId: string) => () => {
    const fields = SECTION_FIELDS[sectionId]
    if (!fields) return
    const patch = Object.fromEntries(fields.map(k => [k, draft[k]])) as Partial<ProjectData>
    // BHA por tecnologia: publica só os planos dos itens daquela tecnologia, mesclando
    // sobre o committed (preserva edições pendentes das outras techs, que compartilham bhaPlans).
    const bhaTech = bhaTechOfSection(sectionId)
    if (bhaTech) {
      const uids = bhaUidsForTech(bhaTech)
      const committed = state.projectData.bhaPlans ?? {}
      const draftPlans = draft.bhaPlans ?? {}
      const merged: Record<string, BhaPlanFields> = { ...committed }
      for (const uid of uids) {
        if (draftPlans[uid] !== undefined) merged[uid] = draftPlans[uid]
        else delete merged[uid]
      }
      patch.bhaPlans = merged
    }
    // Nipples: também grava o prof derivado nos BHAs ligados a nipple, sobre o bhaPlans
    // já persistido (não inclui edições manuais de BHA ainda não aplicadas).
    if (sectionId === 'nipples') {
      const committed = state.projectData.bhaPlans ?? {}
      // Campos derivados do nipple: prof (todos) + Ø nominal e aplicador do camisão (DHSV).
      const updates: Array<[string, Partial<BhaPlanFields>]> = []
      for (const item of state.fineTuningItems) {
        if (item.isBlank) continue
        const cur = committed[item.uid] ?? {}
        const upd: Partial<BhaPlanFields> = {}
        const dep = bhaDerivedDepth(item, draft)
        if (dep != null && (cur.prof ?? '') !== dep) upd.prof = dep
        const cam = camisaoDhsvFields(item, draft)
        if (cam) {
          if ((cur.camDiamNom ?? '') !== cam.camDiamNom) upd.camDiamNom = cam.camDiamNom
          if ((cur.aplicadorCamisao ?? '') !== cam.aplicadorCamisao) upd.aplicadorCamisao = cam.aplicadorCamisao
        }
        const gab = gabaritoFields(item, draft)
        if (gab) {
          const locKey = DIAM_LOCALIZADOR_FIELD[item.packageId]
          const estKey = DIAM_ESTAMPADOR_FIELD[item.packageId]
          if (locKey && gab.diamLocalizador != null && (cur[locKey] ?? '') !== gab.diamLocalizador) (upd as Record<string, string>)[locKey] = gab.diamLocalizador
          if (estKey && gab.diamEstampador != null && (cur[estKey] ?? '') !== gab.diamEstampador) (upd as Record<string, string>)[estKey] = gab.diamEstampador
          if (gab.profFinal != null && (cur.profFinal ?? '') !== gab.profFinal) upd.profFinal = gab.profFinal
        }
        if (Object.keys(upd).length) updates.push([item.uid, upd])
      }
      if (updates.length) {
        const merged = { ...committed }
        for (const [uid, upd] of updates) merged[uid] = { ...(committed[uid] ?? {}), ...upd }
        patch.bhaPlans = merged
        // Mantém o draft coerente com o committed (sem apagar edições manuais de BHA).
        setDraft(prev => {
          const dp = { ...(prev.bhaPlans ?? {}) }
          for (const [uid, upd] of updates) dp[uid] = { ...(dp[uid] ?? {}), ...upd }
          return { ...prev, bhaPlans: dp }
        })
      }
    }
    applyingRef.current = true
    dispatch({ type: 'PROJECT_APPLY_SECTION', patch })
    setDirty(prev => ({ ...prev, [sectionId]: false }))
  }

  // Descarta alterações pendentes da seção, restaurando os valores do state
  const discardSection = (sectionId: string) => () => {
    const fields = SECTION_FIELDS[sectionId]
    if (!fields) return
    // BHA por tecnologia: restaura no draft apenas os planos dos itens daquela tecnologia.
    const bhaTech = bhaTechOfSection(sectionId)
    if (bhaTech) {
      const uids = bhaUidsForTech(bhaTech)
      const committed = state.projectData.bhaPlans ?? {}
      // Campos escalares (não-bhaPlans) desta seção BHA — ex.: revcimHp, canhaoModelo
      const scalarFields = fields.filter(k => k !== 'bhaPlans')
      setDraft(prev => {
        const dp = { ...(prev.bhaPlans ?? {}) }
        for (const uid of uids) {
          if (committed[uid] !== undefined) dp[uid] = committed[uid]
          else delete dp[uid]
        }
        const restored: Partial<ProjectData> = {}
        for (const k of scalarFields) (restored as Record<string, unknown>)[k] = state.projectData[k]
        return { ...prev, bhaPlans: dp, ...restored }
      })
      setDirty(prev => ({ ...prev, [sectionId]: false }))
      return
    }
    setDraft(prev => {
      const next = { ...prev }
      for (const k of fields) (next as Record<string, unknown>)[k] = state.projectData[k]
      return next
    })
    setDirty(prev => ({ ...prev, [sectionId]: false }))
  }

  // True if the section's pending edits affect at least one line
  const sectionAffectsLines = (sectionId: string): boolean => {
    const fields = SECTION_FIELDS[sectionId]
    if (!fields) return false
    const changedFields = fields.filter(k => draft[k] !== state.projectData[k])
    if (changedFields.some(k => {
      const impact = FIELD_IMPACT[k]
      if (impact?.navLines === true) return true
      if (impact?.packageIds) return state.fineTuningItems.some(i => impact.packageIds!.includes(i.packageId) && i.lines.length > 0)
      if (impact?.techs) return state.fineTuningItems.some(i => (impact.techs as string[]).includes(i.technology) && i.lines.length > 0)
      return false
    })) return true
    // Nipples: a profundidade alimenta o prof (derivado) dos BHAs ligados a nipple.
    // Aplicar afeta linhas quando algum prof derivado mudaria vs. o já persistido.
    if (sectionId === 'nipples') {
      const committed = state.projectData.bhaPlans ?? {}
      return state.fineTuningItems.some(item => {
        if (item.isBlank || item.lines.length === 0) return false
        const c = committed[item.uid] ?? {}
        const dep = bhaDerivedDepth(item, draft)
        if (dep != null && (c.prof ?? '') !== dep) return true
        // camisão: aplicador (GS) e Ø nominal são tokens nas linhas → mudança afeta o cronograma.
        const cam = camisaoDhsvFields(item, draft)
        if (cam && ((c.aplicadorCamisao ?? '') !== cam.aplicadorCamisao || (c.camDiamNom ?? '') !== cam.camDiamNom)) return true
        // gabaritagem: localizador/estampador/prof. final são tokens.
        const gab = gabaritoFields(item, draft)
        if (!gab) return false
        const locKey = DIAM_LOCALIZADOR_FIELD[item.packageId]
        const estKey = DIAM_ESTAMPADOR_FIELD[item.packageId]
        return (!!locKey && gab.diamLocalizador != null && (c[locKey] ?? '') !== gab.diamLocalizador)
          || (!!estKey && gab.diamEstampador != null && (c[estKey] ?? '') !== gab.diamEstampador)
          || (gab.profFinal != null && (c.profFinal ?? '') !== gab.profFinal)
      })
    }
    // BHA por tecnologia: mudanças em bhaPlans afetam linhas dos itens daquela tecnologia.
    const bhaTech = bhaTechOfSection(sectionId)
    if (bhaTech) {
      const uids = bhaUidsForTech(bhaTech)
      const draftPlans = draft.bhaPlans ?? {}
      const statePlans = state.projectData.bhaPlans ?? {}
      for (const uid of uids) {
        if (JSON.stringify(draftPlans[uid]) !== JSON.stringify(statePlans[uid])) {
          if (state.fineTuningItems.some(i => i.uid === uid && i.lines.length > 0)) return true
        }
      }
    }
    // Cimentação: topos/pwc/profs afetam todas as linhas de cimentação; cimentPlugs por uid
    if (sectionId === 'cimentacao') {
      const topPwcProfChanged = ['cimentTopoAnularA','cimentTopoInteriorColuna','cimentTopoRevcim247','cimentTopoRevcim248','cimentPwc','cimentProfPerfuracao','cimentProfBaseCimentacao','cimentCrProfundidade',
        'cimentAlinhamento078','cimentAlinhamento083','cimentAlinhamento084',
        'cimentPlugVol078','cimentPlugVol079','cimentPlugDens078','cimentPlugDens079','cimentFcbaDens078','cimentFcbaDens079']
        .some(k => changedFields.includes(k as keyof ProjectData))
      if (topPwcProfChanged) {
        if (state.fineTuningItems.some(i => /cimenta|pwc/i.test(i.packageName) && i.lines.length > 0)) return true
      }
      const draftPlugs = draft.cimentPlugs ?? {}
      const statePlugs = state.projectData.cimentPlugs ?? {}
      for (const uid of new Set([...Object.keys(draftPlugs), ...Object.keys(statePlugs)])) {
        if (JSON.stringify(draftPlugs[uid]) !== JSON.stringify(statePlugs[uid])) {
          if (state.fineTuningItems.some(i => i.uid === uid && i.lines.length > 0)) return true
        }
      }
    }
    return false
  }

  // Per-section setters for cleaner JSX
  const setSonda      = setter('sonda')
  const setFluidos    = setter('fluidos')
  const setTestesEscp = setter('testes_escp')
  const setNipples    = setter('nipples')
  const setCimentacao = setter('cimentacao')
  const setHoldpoints  = setter('holdpoints')
  const setRetirada    = setter('retirada_coluna')
  const hasPkgFn = (...ids: string[]) => state.fineTuningItems.some(i => ids.includes(i.packageId))
  // Ordem cronológica: índice da 1ª ocorrência (no cronograma) de qualquer um dos pacotes.
  // Usado para ordenar os campos das seções de equipamentos conforme o cronograma.
  const pkgOrderOf = (...ids: string[]): number => {
    for (let i = 0; i < state.fineTuningItems.length; i++) {
      if (ids.includes(state.fineTuningItems[i].packageId)) return i
    }
    return Number.POSITIVE_INFINITY
  }

  // ── Assistente orientado a dados (aba Place Holders) ──────────────────────────
  // Config ativa: o snapshot congelado no projeto (criação) ou, na falta, a live do
  // servidor. Pacotes do projeto → visibilidade dos campos derivada dos templates.
  const activeDefs = resolvePlaceholderDefs(state.placeholderDefs)
  const projectPkgIds = new Set(state.fineTuningItems.filter(i => !i.isBlank).map(i => i.packageId))

  // Rótulo do campo: a fonte é a aba Place Holders (admin). Widgets/campos ainda hardcoded
  // no JSX puxam o rótulo do def do token; o texto hardcoded vira só fallback (token sem def).
  // Os RÓTULOS vêm da config LIVE do servidor (getPlaceholderDefs) sobreposta ao snapshot do
  // projeto — assim editar um rótulo na aba propaga na hora, mesmo em projetos já iniciados
  // (o snapshot segue congelando só a ESTRUTURA/visibilidade, não o texto do rótulo).
  const defLabelByToken = new Map<string, string>()
  for (const dd of activeDefs) defLabelByToken.set(dd.token, dd.label)
  for (const dd of getPlaceholderDefs()) defLabelByToken.set(dd.token, dd.label)
  const defLabel = (token: string, fallback: string): string => defLabelByToken.get(token) ?? fallback

  // Token de def que rotula um campo de BHA ligado à chave `key` no pacote do item: o token
  // efetivamente referenciado nas linhas do pacote que resolve para `key` (direto OU via
  // apelido por-pacote em PLAN_KEY_ALIASES). Ex.: key 'modelo' no ABAN 034 → 'modelo034'.
  // Cai na própria `key` quando nada é encontrado (fallback de rótulo continua o hardcoded).
  const defTokenCache = useRef(new Map<string, string>())
  const defTokenForPlanKey = (pkgId: string, key: string): string => {
    const ck = `${pkgId}::${key}`
    const cached = defTokenCache.current.get(ck)
    if (cached !== undefined) return cached
    let found = key
    for (const l of (getPackageLines<{ text?: string }>()[pkgId] ?? [])) {
      const t = l?.text
      if (typeof t !== 'string') continue
      let hit = false
      for (const m of t.matchAll(/\{\{(\w+)=/g)) {
        const tok = m[1]
        if (tok === key || PLAN_KEY_ALIASES[tok] === key) { found = tok; hit = true; break }
      }
      if (hit) break
    }
    defTokenCache.current.set(ck, found)
    return found
  }

  // Toggle booleano Sim/Não (ex.: flags de Hold Point) — rótulo vindo do admin via defLabel.
  const boolToggle = (token: string, fallbackLabel: string, checked: boolean | undefined, onSet: (v: boolean) => void) => (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">{defLabel(token, fallbackLabel)}</span>
      {(['sim', 'nao'] as const).map(opt => (
        <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
          <input type="radio" checked={opt === 'sim' ? checked === true : checked === false}
            onChange={() => onSet(opt === 'sim')} className="accent-[#0c2340]" />
          <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
        </label>
      ))}
    </div>
  )

  // ── Mira "localizar" só onde realmente localiza ───────────────────────────────
  // A mira só aparece quando o alvo destaca ≥1 linha — a MESMA fonte da verdade do
  // clique (lineIdsForLocate), então cobre efeitos indiretos (ex.: pressaoProva como
  // fallback dos tokens pressaoEst*, prof derivado do nipple) sem heurística de token.
  // Memoizado nos dados COMMITTED (state), não no draft: não recomputa a cada tecla no
  // assistente (o draft muda, o committed não até Aplicar); recomputa em load/Aplicar/
  // mudança de cronograma. O cache por alvo evita reprobar o mesmo campo no mesmo render.
  const canLocate = useMemo(() => {
    const cache = new Map<string, boolean>()
    return (t: LocateTarget): boolean => {
      const key = JSON.stringify(t)
      let hit = cache.get(key)
      if (hit === undefined) {
        hit = lineIdsForLocate(t, state.fineTuningItems, state.projectData).size > 0
        cache.set(key, hit)
      }
      return hit
    }
  }, [state.fineTuningItems, state.projectData])

  // Renderiza uma seção de campos GLOBAIS (ProjectData) 100% a partir dos defs do grupo:
  // visibilidade derivada dos templates, rótulo/unidade/tipo/ordem vindos do servidor.
  // Reutiliza a máquina de seção existente (dirty/apply/discard/sectionAffectsLines) via
  // sectionId. Retorna null quando nenhum campo do grupo se aplica ao projeto.
  const renderGlobalSection = (sectionId: string, groupTitle: string, searchText: string): React.ReactNode => {
    const set = setter(sectionId)
    const defs = activeDefs
      .filter(def => (def.group?.trim() || '') === groupTitle && tokenBinding(def.token) === 'global')
      .filter(def => tokenUsedByPackages(def.token, projectPkgIds))
      .sort((a, b) => a.orderIndex - b.orderIndex)
    if (defs.length === 0) return null
    return (
      <Section title={groupTitle} searchText={searchText}
        isDirty={dirty[sectionId]} onApply={applySection(sectionId)} onDiscard={discardSection(sectionId)}
        canApply={sectionAffectsLines(sectionId)}>
        {defs.map(def => (
          <AssistantField key={def.token} def={def}
            value={String((d as unknown as Record<string, unknown>)[def.token] ?? '')}
            onChange={v => set({ [def.token]: v } as Partial<ProjectData>)} />
        ))}
      </Section>
    )
  }

  // Sincronizar nome do poço destino com nome do cronograma
  useEffect(() => {
    if (d.poco.trim() && state.wellName !== d.poco) {
      dispatch({ type: 'SET_WELL_NAME', wellName: d.poco })
    }
  }, [d.poco, state.wellName, dispatch])

  // Nota: a profundidade derivada do nipple é exibida ao vivo (readOnly) via
  // `bhaDerivedDepth` no render e só é gravada em bhaPlans.prof ao Aplicar a seção
  // Nipples (ver applySection/sectionAffectsLines) — por isso o Aplicar aparece em Nipples.

  // ── Confirmar alterações (linhas em revisão após "Aplicar") ─────────────────
  const reviewLineIdSet = new Set<string>()
  for (const item of state.fineTuningItems) for (const line of item.lines) reviewLineIdSet.add(line.id)
  const reviewLineIds = state.pendingReview.filter(id => reviewLineIdSet.has(id))
  const reviewTotal = reviewLineIds.length
  const currentReviewLineId = oneByOneMode && reviewTotal > 0 ? reviewLineIds[0] : null

  const [sectionFilter, setSectionFilter] = useState('')
  const [showTools, setShowTools] = useState(false)
  return (
    <LocateCtx.Provider value={{ onLocate, onClear: onClearLocate, active: locatedTarget ?? null, canLocate }}>
    <div className="flex flex-col h-full bg-[#f5f5f5] dark:bg-slate-900 overflow-hidden">
      {/* Subtítulo */}
      <div className="shrink-0 px-4 py-1.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-400 dark:text-slate-500 tracking-widest uppercase">Assistente de Preenchimento</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowTools(true)}
            title="Ferramentas de arame (aplicação/pescaria por equipamento)"
            className="shrink-0 p-1 -my-1 rounded text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <PocketKnife size={14} />
          </button>
          {onMinimize && (
            <button
              onClick={onMinimize}
              title="Minimizar assistente"
              className="shrink-0 p-1 -my-1 rounded text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      {showTools && (
        <WirelineToolsPanel canEdit={false} onClose={() => setShowTools(false)} />
      )}

      {/* Localizar */}
      <div className="shrink-0 px-3 pt-2 pb-1">
        <div className="flex items-center gap-1 py-1 px-2 rounded border border-slate-200 dark:border-slate-600 bg-[#fafafa] dark:bg-slate-700">
          <Search size={12} className="shrink-0 text-slate-500 dark:text-slate-400" />
          <input
            value={sectionFilter}
            onChange={e => setSectionFilter(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') setSectionFilter('') }}
            placeholder="Localizar..."
            className="flex-1 min-w-0 bg-transparent text-xs text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-500 dark:placeholder:text-slate-500"
          />
          {sectionFilter && (
            <button onClick={() => setSectionFilter('')} className="shrink-0 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Confirmar alterações — linhas em revisão após "Aplicar".
          Layout em 2 linhas (mensagem em cima, botões embaixo com flex-wrap) para não
          quebrar/espremer o texto no painel estreito do assistente. */}
      {reviewTotal > 0 && (
        <div className="shrink-0 flex flex-col gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-slate-600 dark:text-slate-400 text-[10px]">●</span>
            <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold">
              {oneByOneMode
                ? <>Revisando {reviewTotal} {reviewTotal === 1 ? 'item restante' : 'itens restantes'}</>
                : <>{reviewTotal} {reviewTotal === 1 ? 'item aguardando revisão' : 'itens aguardando revisão'}</>}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {oneByOneMode ? (
              <>
                <button
                  onClick={() => currentReviewLineId && dispatch({ type: 'PROJECT_REVIEW_CONFIRM_ONE', uid: currentReviewLineId })}
                  className="text-xs font-semibold text-white bg-slate-700 dark:bg-slate-600 hover:bg-slate-800 dark:hover:bg-slate-500 rounded px-2 py-0.5 transition-colors">
                  Confirmar este
                </button>
                <button
                  onClick={() => { dispatch({ type: 'PROJECT_CLEAR_REVIEW' }); setOneByOneMode?.(false) }}
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  Confirmar todas
                </button>
                <button
                  onClick={() => { dispatch({ type: 'PROJECT_REVERT_REVIEW' }); setOneByOneMode?.(false) }}
                  title="Cancela as alterações aplicadas e em revisão"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  Sair
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setOneByOneMode?.(true)}
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  Revisar 1 por 1
                </button>
                <button
                  onClick={() => dispatch({ type: 'PROJECT_CLEAR_REVIEW' })}
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                  Confirmar todas
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Scrollable body */}
      <SectionFilterCtx.Provider value={sectionFilter}>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 scrollbar-custom">

        {/* ── Nipples ── */}
        {(() => {
          const hasLines = (tf: keyof ProjectData, df: keyof ProjectData) =>
            lineIdsForLocate({ kind: 'nipple', typeField: tf, depthField: df }, state.fineTuningItems, state.projectData).size > 0
          const noItems = state.fineTuningItems.filter(i => !i.isBlank).length === 0
          const rows: NippleRowConf[] = [
            { label:'TMF (prod.)',  typeField:'nipple381',     depthField:'nipple381Depth',     name:d.nipple381,        depth:d.nipple381Depth,      onName:v=>setNipples({nipple381:v}),      onDepth:v=>setNipples({nipple381Depth:v}),      options:NIPPLE_OPTS_TMF_PROD },
            { label:'TMF (anular)', typeField:'nipple375',     depthField:'nipple375Depth',     name:d.nipple375,        depth:d.nipple375Depth,      onName:v=>setNipples({nipple375:v}),      onDepth:v=>setNipples({nipple375Depth:v}),      options:NIPPLE_OPTS_TMF_ANULAR },
            { label:'TH (prod.)',   typeField:'nipple281',     depthField:'nipple281Depth',     name:d.nipple281,        depth:d.nipple281Depth,      onName:v=>setNipples({nipple281:v}),      onDepth:v=>setNipples({nipple281Depth:v}),      options:NIPPLE_OPTS_TH_PROD },
            { label:'TH (anular)',  typeField:'nippleTHanular',depthField:'nippleTHanularDepth',name:d.nippleTHanular,   depth:d.nippleTHanularDepth, onName:v=>setNipples({nippleTHanular:v}), onDepth:v=>setNipples({nippleTHanularDepth:v}), options:NIPPLE_OPTS_TH_ANULAR },
            { label:'DHSV',         typeField:'nippleDhsv',    depthField:'nippleDhsvDepth',    name:d.nippleDhsv??'',   depth:d.nippleDhsvDepth,     onName:v=>setNipples({nippleDhsv:v}),     onDepth:v=>setNipples({nippleDhsvDepth:v}),     options:NIPPLE_OPTS_DHSV },
            { label:'TSR',          typeField:'nipple275',     depthField:'nipple275Depth',     name:d.nipple275,        depth:d.nipple275Depth,      onName:v=>setNipples({nipple275:v}),      onDepth:v=>setNipples({nipple275Depth:v}),      options:NIPPLE_OPTS_TSR_CAUDA },
            { label:'Cauda prod.',  typeField:'nipplesOutros', depthField:'nipplesOutrosDepth', name:d.nipplesOutros,    depth:d.nipplesOutrosDepth,  onName:v=>setNipples({nipplesOutros:v}),  onDepth:v=>setNipples({nipplesOutrosDepth:v}),  options:NIPPLE_OPTS_TSR_CAUDA },
          ]
          const active   = noItems ? rows : rows.filter(r => hasLines(r.typeField, r.depthField))
          const inactive = noItems ? []   : rows.filter(r => !hasLines(r.typeField, r.depthField))
          return (
            <Section title="Nipples" searchText="nipple tmf th dhsv tsr cauda profundidade depth anular produção" defaultOpen={false}              isDirty={dirty['nipples']} onApply={applySection('nipples')} onDiscard={discardSection('nipples')} canApply={sectionAffectsLines('nipples')}>
              <div className="space-y-0">
                {active.map(r => (
                  <NippleRow key={r.typeField as string} label={r.label} name={r.name} depth={r.depth}
                    onName={r.onName} onDepth={r.onDepth} options={r.options}
                    locate={{ kind: 'nipple', typeField: r.typeField, depthField: r.depthField }} />
                ))}
                {inactive.length > 0 && <InactiveNippleRows rows={inactive} />}
              </div>
            </Section>
          )
        })()}

        {/* ── Navegação ── */}
        <Section title="Navegação" searchText="poço origem destino distância velocidade média nós nm sonda"          isDirty={dirty['sonda']} onApply={applySection('sonda')} onDiscard={discardSection('sonda')} canApply={sectionAffectsLines('sonda')}>
          <Field label={defLabel('pocoOrigem', "Poço origem")}            value={d.pocoOrigem}           onChange={v => setSonda({ pocoOrigem: v })} locate={{ kind: 'data', field: 'pocoOrigem' }} />
          <Field label={defLabel('poco', "Poço destino")}           value={d.poco}                 onChange={v => setSonda({ poco: v })} locate={{ kind: 'data', field: 'poco' }} />
          <Field label={defLabel('distanciaEntrePocos', "Distância entre poços")}  value={d.distanciaEntrePocos}  onChange={v => setSonda({ distanciaEntrePocos: v })} unit="NM" locate={{ kind: 'data', field: 'distanciaEntrePocos' }} />
          <Field label={defLabel('velocidadeMedia', "Velocidade média")}       value={d.velocidadeMedia}      onChange={v => setSonda({ velocidadeMedia: v })} unit="nós" locate={{ kind: 'data', field: 'velocidadeMedia' }} />
        </Section>

        {/* ── Equipamentos Submarinos ── (orientado a dados: aba Place Holders) */}
        {renderGlobalSection('equipamentos_submarinos', 'Equipamentos Submarinos', 'pressão trt anm tcap n2 nitrogênio bore bullheading dhsv drain bloco tmf')}

        {/* ── Equipamentos de superfície ── */}
        {(() => {
          const showRiser  = hasPkgFn('ABAN 014','ABAN 015','ABAN 016','ABAN 017','ABAN 206','ABAN 244')
          const showBopAr  = hasPkgFn(...SLWLFT_HIGH_PKG_IDS)
          if (!showRiser && !showBopAr) return null
          const setEquipSup = setter('equipamentos_superficie')
          // Campos ordenados conforme a cronologia do cronograma (1ª ocorrência do pacote)
          const entries: { ord: number; node: React.ReactNode }[] = []
          const push = (show: boolean, pkgs: string[], node: React.ReactNode) => {
            if (show) entries.push({ ord: pkgOrderOf(...pkgs), node })
          }
          push(showRiser,      ['ABAN 014','ABAN 015','ABAN 016','ABAN 017','ABAN 206','ABAN 244'], <Field key="riserDpr" label={defLabel('pressaoRiserDpr', "Teste de linhas de superfície e manifold auxiliar")} value={d.pressaoRiserDpr} onChange={v => setEquipSup({ pressaoRiserDpr: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoRiserDpr' }} />)
          push(showBopAr,      [...SLWLFT_HIGH_PKG_IDS], <Field key="bopArame" label={defLabel('pressaoTesteAltaEquipSup', "Teste alta equipamentos de pressão (SL, WL e FT)")} value={d.pressaoTesteAltaEquipSup} onChange={v => setEquipSup({ pressaoTesteAltaEquipSup: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoTesteAltaEquipSup' }} />)
          entries.sort((a, b) => a.ord - b.ord)
          return (
            <Section title="Equipamentos de Superfície" searchText="pressão riser linhas superfície manifold auxiliar bop arame wireline alta sl wl ft"              isDirty={dirty['equipamentos_superficie']} onApply={applySection('equipamentos_superficie')} onDiscard={discardSection('equipamentos_superficie')} canApply={sectionAffectsLines('equipamentos_superficie')}>
              {entries.map(e => e.node)}
            </Section>
          )
        })()}

        {/* ── Testes de Pressão (por operação — desmembrados de pressaoProva) ── */}
        {renderGlobalSection('testes_pressao', 'Testes de Pressão', 'pressão prova estanqueidade overbalance plug stv bpp coluna packer tampão negativo tmf integridade poço fcba')}

        {/* ── Testes ESCP ── */}
        {(() => {
            const showBop     = hasPkgFn('ABAN 184')
            const showBopPerf = hasPkgFn('ABAN 228','ABAN 229')
            if (!showBop && !showBopPerf) return null
            return (
              <Section title="Testes ESCP" searchText="mapecab pressão kill choke vgx anel bop perfuração equipamentos escp"                isDirty={dirty['testes_escp']} onApply={applySection('testes_escp')} onDiscard={discardSection('testes_escp')} canApply={sectionAffectsLines('testes_escp')}>
                {(showBop || showBopPerf) && <Field label={defLabel('mapecab', 'MAPECAB')} value={d.mapecab} onChange={v => {
                  const upd: Partial<import('../types').ProjectData> = { mapecab: v }
                  if (!d.pressaoKillChoke    || d.pressaoKillChoke    === d.mapecab) { upd.pressaoKillChoke = v; upd.pressaoEquipSupBop = v }
                  if (!d.pressaoBopPerfuracao || d.pressaoBopPerfuracao === d.mapecab) upd.pressaoBopPerfuracao = v
                  setTestesEscp(upd)
                }} unit="psi" locate={{ kind: 'data', field: 'mapecab' }} />}
                {showBop && <Field label={defLabel('pressaoKillChoke', "Equipamentos de superfície e linhas de kill e choke")} value={d.pressaoKillChoke} onChange={v => setTestesEscp({ pressaoKillChoke: v, pressaoEquipSupBop: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoKillChoke' }} />}
                {showBop && <Field label={defLabel('pressaoVgx', "Teste anel VGX do BOP × CSB (menor entre MAPECAB e limite equipamento/poço/CSB)")} value={d.pressaoVgx} onChange={v => setTestesEscp({ pressaoVgx: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoVgx' }} />}
                {showBopPerf && <Field label={defLabel('pressaoBopPerfuracao', "Teste do BOP")} value={d.pressaoBopPerfuracao} onChange={v => setTestesEscp({ pressaoBopPerfuracao: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoBopPerfuracao' }} />}
              </Section>
            )
        })()}

        {/* ── Retirada de Coluna ── */}
        {state.fineTuningItems.some(i => !i.isBlank && ['ABAN 188','ABAN 189','ABAN 190'].includes(i.packageId)) && (
          <Section title="Retirada de Coluna" searchText="diâmetro tubo cop coi identificação retirada coluna"            isDirty={dirty['retirada_coluna']} onApply={applySection('retirada_coluna')} onDiscard={discardSection('retirada_coluna')} canApply={sectionAffectsLines('retirada_coluna')}>
            <Field label={defLabel('copCoiTubo', "Ø/ident. tubo COP/COI (retirada)")} value={d.copCoiTubo} onChange={v => setRetirada({ copCoiTubo: v })} locate={{ kind: 'data', field: 'copCoiTubo' }} />
          </Section>
        )}

        {/* ── Fluidos ── */}
        {(() => {
          const showFcba = hasPkgFn('ABAN 061','ABAN 062','ABAN 063')
          const showLimPcab = hasPkgFn('ABAN 061','ABAN 062')
          return (
            <Section title="Fluidos" searchText="pressão bombeio limite fcba meg amortecimento densidade bullheading volume cabeça corte substituição ppg bbl"              isDirty={dirty['fluidos']} onApply={applySection('fluidos')} onDiscard={discardSection('fluidos')} canApply={sectionAffectsLines('fluidos')}>
              <Field label={defLabel('limitePressaoBombeio', "Limite P. bombeio")} value={d.limitePressaoBombeio} onChange={v => setFluidos({ limitePressaoBombeio: v })} unit="psi" locate={{ kind: 'data', field: 'limitePressaoBombeio' }} />
              {showFcba && <Field label={defLabel('amortFcbaDensidade', "Densidade FCBA/MEG amortecimento")} value={d.amortFcbaDensidade} onChange={v => setFluidos({ amortFcbaDensidade: v })} unit="ppg" locate={{ kind: 'data', field: 'amortFcbaDensidade' }} />}
              {showLimPcab && <Field label={defLabel('pressaoCabecaLimite', "Limite pressão de cabeça (bullheading)")} value={d.pressaoCabecaLimite} onChange={v => setFluidos({ pressaoCabecaLimite: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoCabecaLimite' }} />}
              {hasPkgFn('ABAN 030','ABAN 062') && <Field label={defLabel('bullheadVolume', "Volume diesel/MEG bullheading")} value={d.bullheadVolume} onChange={v => setFluidos({ bullheadVolume: v })} unit="bbl" locate={{ kind: 'data', field: 'bullheadVolume' }} />}
              {hasPkgFn('ABAN 186','ABAN 189','ABAN 190','ABAN 235','ABAN 236') && <Field label={defLabel('fcbaCorteDens', "Densidade FCBA (corte/substituição)")} value={d.fcbaCorteDens} onChange={v => setFluidos({ fcbaCorteDens: v })} unit="ppg" locate={{ kind: 'data', field: 'fcbaCorteDens' }} />}
            </Section>
          )
        })()}

        {/* ── BHAs por tecnologia (uma Section independente por SL/WL/FT/Coluna) ── */}
        {BHA_TECH_ORDER.map(tech => {
          const techItems = state.fineTuningItems.filter(
            i => !i.isBlank && i.technology === tech
              && !PACKAGES[i.packageId]?.isMountOp
              && !PACKAGES[i.packageId]?.isDismountOp
              // Coluna: remover operações FETH / THRT / TH, teste de influxo e PWC (vai para Cimentação)
              && !(tech === 'workstring' && (/\b(feth|thrt|th)\b/i.test(i.packageName) || /teste.*influxo/i.test(i.packageName) || /\bpwc\b/i.test(i.packageName)))
          )
          if (techItems.length === 0) return null

          const sid = bhaSectionId(tech)
          const setBhasTech = setter(sid)
          const updatePlan = (uid: string, key: keyof BhaPlanFields, value: string) => {
            const cur = d.bhaPlans?.[uid] ?? {}
            setBhasTech({ bhaPlans: { ...(d.bhaPlans ?? {}), [uid]: { ...cur, [key]: value } } })
          }

          return (
            <Section key={tech} title={BHA_TECH[tech]!} searchText="bha plano profundidade ferramenta perfuração corte gabarito tae jateamento camisão stroker nipple plug stv brv cimentação pwc condicionamento diâmetro nós"              isDirty={dirty[sid]} onApply={applySection(sid)} onDiscard={discardSection(sid)} canApply={sectionAffectsLines(sid)}>
              {tech === 'workstring' && hasPkgFn('ABAN 013','ABAN 182','ABAN 185','ABAN 189','ABAN 190','ABAN 191','ABAN 192','ABAN 193','ABAN 194','ABAN 195','ABAN 196','ABAN 197','ABAN 198','ABAN 199','ABAN 200','ABAN 202','ABAN 233') && <Field label={defLabel('colunaTrabalhoDpDiam', "Ø coluna de trabalho DP (COT DP)")} value={d.colunaTrabalhoDpDiam} onChange={v => setBhasTech({ colunaTrabalhoDpDiam: v })} unit='"' locate={{ kind: 'data', field: 'colunaTrabalhoDpDiam' }} />}
                        {(() => {
                          // Compute #N and previous uid for duplicate packageIds
                          const totalCounts = new Map<string, number>()
                          for (const it of techItems) totalCounts.set(it.packageId, (totalCounts.get(it.packageId) ?? 0) + 1)
                          const seenCounts = new Map<string, number>()
                          const prevUidByPkg = new Map<string, string>()  // last seen uid per packageId
                          return techItems.map(item => {
                            const seen = (seenCounts.get(item.packageId) ?? 0) + 1
                            seenCounts.set(item.packageId, seen)
                            const previousUid = prevUidByPkg.get(item.packageId)
                            prevUidByPkg.set(item.packageId, item.uid)
                            const dupSuffix = (totalCounts.get(item.packageId) ?? 0) > 1 ? `#${seen}` : ''
                            const name = item.packageName
                            const isFt        = item.technology === 'ct'
                            const isPerf      = /perfura/i.test(name)
                            const isCorte     = /corte/i.test(name)
                            const isGabarit   = /gabarit/i.test(name)
                            const isTae       = /\btae\b|tampão de alta expansão/i.test(name)
                            const isJateam    = /jate/i.test(name)
                            const isCamis     = /camis/i.test(name)
                            const isTocPolias = /toc.*polia|polia.*toc/i.test(name)
                            const isFtGabaritMotorBroca = isFt && /motor.*fundo|broca/i.test(name)
                            const isArameInstRet = item.technology === 'wireline' && /instala|retirada/i.test(name)
                            const isStroker   = /stroker/i.test(name)
                            const isAvalCimentacao = /avalia.*cimenta/i.test(name) || item.packageId === 'ABAN 231'
                            const isRetPlugThCt    = isFt && /retirada.*plug.*\bth\b/i.test(name)
                            // Instalação/retirada de plug/STV/BRV em nipple via FT (TH retirada tem bloco próprio).
                            const isFtPlugProf     = isFt && /(plug|stv|brv)/i.test(name) && /(instala|retirada)/i.test(name) && !isRetPlugThCt
                            const isBpInstFt       = isFt && /instala.*(bpr|bpp)/i.test(name)
                            const isCimentIntCopFt = isFt && /cimenta.*interior.*cop/i.test(name)
                            const isCimentCr       = /cimenta.*\bcr\b/i.test(name)
                            const isVgl       = /\bvgl\b/i.test(name)
                            const isPwc       = /\bpwc\b/i.test(name)
                            const isCondicionamento = /condiciona/i.test(name)
                            const isBpInst    = /instala.*\bbpp\b/i.test(name)  // BPP qualquer tech
                            const isCacambeio = item.technology === 'wireline' && /caçambeio/i.test(name)
                            const isSlidingSleeve = item.technology === 'wireline' && /sliding\s*sleeve/i.test(name)
                            const showEstampador = isGabarit && !isFtGabaritMotorBroca && !(isJateam && isFt)
                            const plan = d.bhaPlans?.[item.uid] ?? {}
                            // Profundidade derivada do nipple relacionado (arame/elétrico/FT): trava o campo.
                            const derivedProf = bhaDerivedDepth(item, d)
                            // Camisão: Ø nominal e aplicador/pescador derivam do tipo do nipple da DHSV.
                            const camFields = camisaoDhsvFields(item, d)
                            // Gabaritagem: localizador/estampador (combinação de nipples) e prof. final (menor Ø).
                            const gab = gabaritoFields(item, d)
                            // Campos dedicados por pacote (operações distintas, mesma medição não se repete).
                            const estKey = DIAM_ESTAMPADOR_FIELD[item.packageId]
                            const locKey = DIAM_LOCALIZADOR_FIELD[item.packageId]
                            const motorFundoKey = MOTOR_FUNDO_FIELD[item.packageId]
                            const brocaKey = BROCA_FIELD[item.packageId]
                            const modeloBrocaKey = MODELO_BROCA_FIELD[item.packageId]
                            const ogivaDiamKey = OGIVA_DIAM_FIELD[item.packageId]
                            const intervaloTopoKey = INTERVALO_INTERESSE_TOPO_FIELD[item.packageId]
                            const intervaloBaseKey = INTERVALO_INTERESSE_BASE_FIELD[item.packageId]
                            const itemCollapsed = collapsedBhaItems.has(item.uid)
                            const hasSubItems = isPerf || isCorte || isGabarit || isTae || isJateam || isCamis || isTocPolias || isFtGabaritMotorBroca || isArameInstRet || isStroker || isAvalCimentacao || isRetPlugThCt || isFtPlugProf || isBpInstFt || isBpInst || isCimentIntCopFt || isCimentCr || isVgl || isPwc || isCondicionamento || isCacambeio || isSlidingSleeve
                            const copyFromPrevious = () => {
                              if (!previousUid) return
                              const prev = d.bhaPlans?.[previousUid] ?? {}
                              setBhasTech({ bhaPlans: { ...(d.bhaPlans ?? {}), [item.uid]: { ...prev } } })
                            }
                            return (
                              <div key={item.uid} className="py-1 border-b border-slate-200 dark:border-slate-800 last:border-0">
                                <div className="flex items-center gap-1.5">
                                  {hasSubItems ? (
                                    <button
                                      type="button"
                                      onClick={() => toggleBhaItem(item.uid)}
                                      className="w-3 text-[10px] font-bold text-slate-600 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-500 select-none leading-none shrink-0">
                                      {itemCollapsed ? '+' : '−'}
                                    </button>
                                  ) : (
                                    <span className="w-3 shrink-0" />
                                  )}
                                  <span className="text-xs text-slate-600 dark:text-slate-400 leading-snug break-words flex-1 min-w-0">
                                    {dupSuffix && <span className="font-mono">{dupSuffix} </span>}{name || <span className="italic text-slate-500">—</span>}
                                  </span>
                                  {previousUid && hasSubItems && (
                                    <button
                                      type="button"
                                      onClick={copyFromPrevious}
                                      title="Copiar respostas da operação anterior"
                                      className="shrink-0 text-[10px] font-semibold text-slate-600 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700 rounded px-1.5 py-0.5 transition-colors">
                                      ↩ copiar #{(seenCounts.get(item.packageId) ?? 1) - 1}
                                    </button>
                                  )}
                                </div>
                                {hasSubItems && !itemCollapsed && (
                                  <div className="ml-3 mt-1 mb-1 pl-2 space-y-0">
                                    {isPerf && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'canhao'), "Diâmetro nominal do canhão")} value={plan.canhao ?? ''} onChange={v => updatePlan(item.uid, 'canhao', v)} locate={{ kind: 'plan', uid: item.uid, key: 'canhao' }} unit="pol" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'tfaMin'), "TFA mínimo")} value={plan.tfaMin ?? ''} onChange={v => updatePlan(item.uid, 'tfaMin', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tfaMin' }} unit="pol²" />
                                      </>
                                    )}
                                    {(isPerf || isCorte) && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade")}     value={plan.prof ?? ''} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'diam'), "Diâmetro do tubo")} value={plan.diam ?? ''} onChange={v => updatePlan(item.uid, 'diam', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diam' }} unit="pol" />
                                        {isCorte && <Field label={defLabel(defTokenForPlanKey(item.packageId, 'tfa'), "TFA")} value={plan.tfa ?? ''} onChange={v => updatePlan(item.uid, 'tfa', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tfa' }} unit="pol²" />}
                                      </>
                                    )}
                                    {isCorte && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'cortadorModelo'), "Modelo do cortador")} value={plan.cortadorModelo ?? ''} onChange={v => updatePlan(item.uid, 'cortadorModelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'cortadorModelo' }} />
                                    )}
                                    {isArameInstRet && !isCamis && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'modelo'), 'Aplicador/Pescador — nome e Ø (ex: "GS 3\"")')} value={plan.modelo ?? ''} onChange={v => updatePlan(item.uid, 'modelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modelo' }} />
                                        {!isPerf && !isCorte && (
                                          <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade")} value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        )}
                                        {/tmf/i.test(name) && (
                                          <Field label={defLabel(defTokenForPlanKey(item.packageId, 'diamJdc'), "Ø JDC (passo inicial)")} value={plan.diamJdc ?? ''} onChange={v => updatePlan(item.uid, 'diamJdc', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamJdc' }} unit="pol" />
                                        )}
                                      </>
                                    )}
                                    {showEstampador && estKey && (
                                      <Field label={defLabel(estKey, "Ø estampador")} value={gab?.diamEstampador ?? plan[estKey] ?? ''} readOnly={gab?.diamEstampador != null} onChange={v => updatePlan(item.uid, estKey, v)} locate={{ kind: 'plan', uid: item.uid, key: estKey }} unit="pol" />
                                    )}
                                    {isGabarit && !isFt && locKey && (
                                      <Field label={defLabel(locKey, "Ø localizador de nipple")} value={gab?.diamLocalizador ?? plan[locKey] ?? ''} readOnly={gab?.diamLocalizador != null} onChange={v => updatePlan(item.uid, locKey, v)} locate={{ kind: 'plan', uid: item.uid, key: locKey }} unit="pol" />
                                    )}
                                    {isGabarit && item.technology === 'wireline' && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'profFinal'), "Profundidade final")} value={gab?.profFinal ?? plan.profFinal ?? ''} readOnly={gab?.profFinal != null} onChange={v => updatePlan(item.uid, 'profFinal', v)} locate={{ kind: 'plan', uid: item.uid, key: 'profFinal' }} unit="m" />
                                    )}
                                    {isGabarit && isFt && !isFtGabaritMotorBroca && item.packageId !== 'ABAN 124' && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'driftRing'), "Drift Ring")} value={plan.driftRing ?? ''} onChange={v => updatePlan(item.uid, 'driftRing', v)} locate={{ kind: 'plan', uid: item.uid, key: 'driftRing' }} unit="pol" />
                                    )}
                                    {(isFtGabaritMotorBroca || item.packageId === 'ABAN 124') && (
                                      <>
                                        {motorFundoKey && <Field label={defLabel(motorFundoKey, "Diâmetro do motor de fundo")} value={plan[motorFundoKey] ?? ''} onChange={v => updatePlan(item.uid, motorFundoKey, v)} locate={{ kind: 'plan', uid: item.uid, key: motorFundoKey }} unit="pol" />}
                                        {brocaKey && <Field label={defLabel(brocaKey, "Diâmetro da broca")}          value={plan[brocaKey] ?? ''}      onChange={v => updatePlan(item.uid, brocaKey, v)}       locate={{ kind: 'plan', uid: item.uid, key: brocaKey }}       unit="pol" />}
                                        {modeloBrocaKey && <Field label={defLabel(modeloBrocaKey, "Modelo da broca")}            value={plan[modeloBrocaKey] ?? ''} onChange={v => updatePlan(item.uid, modeloBrocaKey, v)} locate={{ kind: 'plan', uid: item.uid, key: modeloBrocaKey }} />}
                                      </>
                                    )}
                                    {isTae && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'taeProf'), "TAE — Profundidade")}          value={plan.taeProf ?? ''}    onChange={v => updatePlan(item.uid, 'taeProf', v)}    locate={{ kind: 'plan', uid: item.uid, key: 'taeProf' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'taeDiamNom'), "TAE — Diâmetro nominal")}      value={plan.taeDiamNom ?? ''} onChange={v => updatePlan(item.uid, 'taeDiamNom', v)} locate={{ kind: 'plan', uid: item.uid, key: 'taeDiamNom' }} unit="pol" />
                                        <Field label={defLabel('taeTuboDiam', "Ø nominal do tubo (instalação TAE)")} value={d.taeTuboDiam} onChange={v => setBhasTech({ taeTuboDiam: v })} unit='"' locate={{ kind: 'data', field: 'taeTuboDiam' }} />
                                        <Field label={defLabel('pressaoEstTae', "Estanqueidade — TAE")} value={d.pressaoEstTae} onChange={v => setBhasTech({ pressaoEstTae: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstTae' }} />
                                        {boolToggle('pressaoEstTaeHp', 'Será um Hold Point?', d.pressaoEstTaeHp, v => setBhasTech({ pressaoEstTaeHp: v }))}
                                      </>
                                    )}
                                    {isJateam && !isFt && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'jateadorDiam'), "Diâmetro do jateador")} value={plan.jateadorDiam ?? ''} onChange={v => updatePlan(item.uid, 'jateadorDiam', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateadorDiam' }} unit="pol" />
                                    )}
                                    {isJateam && isFt && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'jateamTopo'), "Intervalo de jateamento — Topo")} value={plan.jateamTopo ?? ''}     onChange={v => updatePlan(item.uid, 'jateamTopo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateamTopo' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'jateamBase'), "Intervalo de jateamento — Base")} value={plan.jateamBase ?? ''}     onChange={v => updatePlan(item.uid, 'jateamBase', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateamBase' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'jateamPassadas'), "Quantidade de passadas")}         value={plan.jateamPassadas ?? ''} onChange={v => updatePlan(item.uid, 'jateamPassadas', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateamPassadas' }} />
                                      </>
                                    )}
                                    {isCamis && item.technology === 'wireline' && (
                                      <>
                                        {locKey && <Field label={defLabel(locKey, "Gabaritagem — Ø localizador (collet)")} value={plan[locKey] ?? ''} onChange={v => updatePlan(item.uid, locKey, v)} locate={{ kind: 'plan', uid: item.uid, key: locKey }} unit="pol" />}
                                        {estKey && <Field label={defLabel(estKey, "Gabaritagem — Ø estampador")}  value={plan[estKey] ?? ''} onChange={v => updatePlan(item.uid, estKey, v)} locate={{ kind: 'plan', uid: item.uid, key: estKey }} unit="pol" />}
                                      </>
                                    )}
                                    {isCamis && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade (DHSV)")} value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'aplicadorCamisao'), 'Instalação/Pescaria — Aplicador (ex: "GS 4"")')} value={camFields ? camFields.aplicadorCamisao : (plan.aplicadorCamisao ?? '')} readOnly={camFields != null} onChange={v => updatePlan(item.uid, 'aplicadorCamisao', v)} locate={{ kind: 'plan', uid: item.uid, key: 'aplicadorCamisao' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'camDiamNom'), "Camisão — Ø nominal")} value={camFields ? camFields.camDiamNom : (plan.camDiamNom ?? '')} readOnly={camFields != null} onChange={v => updatePlan(item.uid, 'camDiamNom', v)} locate={{ kind: 'plan', uid: item.uid, key: 'camDiamNom' }} unit="pol" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'camDiamInt'), "Camisão — Ø interno")} value={plan.camDiamInt ?? ''} onChange={v => updatePlan(item.uid, 'camDiamInt', v)} locate={{ kind: 'plan', uid: item.uid, key: 'camDiamInt' }} unit="pol" />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1 flex items-center gap-1">
                                            {onLocate && (
                                              <button type="button"
                                                onClick={() => onLocate({ kind: 'plan', uid: item.uid, key: 'camTipo' })}
                                                title="Localizar linhas relacionadas no cronograma (Esc limpa)"
                                                className={`shrink-0 transition-colors ${locateEq(locatedTarget ?? null, { kind: 'plan', uid: item.uid, key: 'camTipo' }) ? 'text-sky-500 dark:text-sky-400' : 'text-slate-400 dark:text-slate-600 hover:text-sky-500 dark:hover:text-sky-400'}`}>
                                                <Crosshair size={11} />
                                              </button>
                                            )}
                                            <span className="min-w-0">Camisão — Tipo</span>
                                          </span>
                                          <select
                                            value={plan.camTipo || 'permanente'}
                                            onChange={e => updatePlan(item.uid, 'camTipo', e.target.value)}
                                            className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-[#fafafa] dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-sky-400 dark:focus:border-sky-600 transition-colors">
                                            <option value="permanente">Permanente</option>
                                            <option value="drop-off">Drop-off</option>
                                          </select>
                                        </div>
                                      </>
                                    )}
                                    {isTocPolias && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'tocEstampador'), "Ø estampador")} value={plan.tocEstampador ?? ''} onChange={v => updatePlan(item.uid, 'tocEstampador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tocEstampador' }} unit="pol" />
                                    )}
                                    {isStroker && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'modelo'), "Modelo do aplicador/pescador")} value={plan.modelo ?? ''} onChange={v => updatePlan(item.uid, 'modelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modelo' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade")} value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'strokerAncoragem'), "Ponto de ancoragem")} value={plan.strokerAncoragem ?? ''} onChange={v => updatePlan(item.uid, 'strokerAncoragem', v)} locate={{ kind: 'plan', uid: item.uid, key: 'strokerAncoragem' }} unit="m" />
                                      </>
                                    )}
                                    {isAvalCimentacao && (
                                      <>
                                        {intervaloTopoKey && <Field label={defLabel(intervaloTopoKey, "Intervalo de interesse — Topo")} value={plan[intervaloTopoKey] ?? ''} onChange={v => updatePlan(item.uid, intervaloTopoKey, v)} locate={{ kind: 'plan', uid: item.uid, key: intervaloTopoKey }} unit="m" />}
                                        {intervaloBaseKey && <Field label={defLabel(intervaloBaseKey, "Intervalo de interesse — Base")} value={plan[intervaloBaseKey] ?? ''} onChange={v => updatePlan(item.uid, intervaloBaseKey, v)} locate={{ kind: 'plan', uid: item.uid, key: intervaloBaseKey }} unit="m" />}
                                      </>
                                    )}
                                    {isRetPlugThCt && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'modelo'), 'Aplicador/Pescador — nome e Ø (ex: "GS 4\"")')} value={plan.modelo ?? ''} onChange={v => updatePlan(item.uid, 'modelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modelo' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade")} value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                      </>
                                    )}
                                    {isFtPlugProf && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade")} value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                    )}
                                    {(isBpInstFt || isBpInst) && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'bpProf'), "Profundidade")} value={plan.bpProf ?? ''} onChange={v => updatePlan(item.uid, 'bpProf', v)} locate={{ kind: 'plan', uid: item.uid, key: 'bpProf' }} unit="m" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'bpDiam'), "Diâmetro do tubo")} value={plan.bpDiam ?? ''} onChange={v => updatePlan(item.uid, 'bpDiam', v)} locate={{ kind: 'plan', uid: item.uid, key: 'bpDiam' }} unit="pol" />
                                        {item.technology === 'electric' && (
                                          <Field label={defLabel(defTokenForPlanKey(item.packageId, 'bppAncoragemKlbf'), "Força de ancoragem BPP")} value={plan.bppAncoragemKlbf ?? ''} onChange={v => updatePlan(item.uid, 'bppAncoragemKlbf', v)} locate={{ kind: 'plan', uid: item.uid, key: 'bppAncoragemKlbf' }} unit="klbf" />
                                        )}
                                      </>
                                    )}
                                    {isCimentIntCopFt && ogivaDiamKey && (
                                      <Field label={defLabel(ogivaDiamKey, "Diâmetro da ogiva")} value={plan[ogivaDiamKey] ?? ''} onChange={v => updatePlan(item.uid, ogivaDiamKey, v)} locate={{ kind: 'plan', uid: item.uid, key: ogivaDiamKey }} unit="pol" />
                                    )}
                                    {isCimentCr && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'crProf'), "Profundidade de assentamento do CR")} value={plan.crProf ?? ''} onChange={v => updatePlan(item.uid, 'crProf', v)} locate={{ kind: 'plan', uid: item.uid, key: 'crProf' }} unit="m" />
                                    )}
                                    {isVgl && /instala/i.test(name) && (
                                      <div className="flex items-center gap-2 py-0.5">
                                        <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">{defLabel('vglTipo', 'Tipo de VGL')}</span>
                                        {(['cega','operadora'] as const).map(opt => (
                                          <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                            <input type="radio" checked={plan.vglTipo === opt}
                                              onChange={() => updatePlan(item.uid, 'vglTipo', plan.vglTipo === opt ? '' : opt)}
                                              className="accent-[#0c2340]" />
                                            <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'cega' ? 'Cega' : 'Operadora'}</span>
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                    {isVgl && (() => {
                                      const hasCamisaoInst = state.fineTuningItems.some(i =>
                                        !i.isBlank && /camis/i.test(i.packageName) && /instala/i.test(i.packageName)
                                      ) || (inp.installCamisao ?? []).length > 0
                                      const effective = plan.vglCamisaoAcoplado ?? (hasCamisaoInst ? 'sim' : '')
                                      return (
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">{defLabel('vglCamisaoAcoplado', 'Camisão acoplado')}</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={effective === opt}
                                                onChange={() => updatePlan(item.uid, 'vglCamisaoAcoplado', effective === opt ? '' : opt)}
                                                className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}{!plan.vglCamisaoAcoplado && hasCamisaoInst && opt === 'sim' ? ' (auto)' : ''}</span>
                                            </label>
                                          ))}
                                        </div>
                                      )
                                    })()}
                                    {isPwc && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'pwcCanhoneioTopo'), "Canhoneio — Topo")}    value={plan.pwcCanhoneioTopo ?? ''} onChange={v => updatePlan(item.uid, 'pwcCanhoneioTopo', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioTopo' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'pwcCanhoneioBase'), "Canhoneio — Base")}    value={plan.pwcCanhoneioBase ?? ''} onChange={v => updatePlan(item.uid, 'pwcCanhoneioBase', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioBase' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'pwcIcf'), "Assentamento do ICF")} value={plan.pwcIcf ?? ''}            onChange={v => updatePlan(item.uid, 'pwcIcf', v)} locate={{ kind: 'plan', uid: item.uid, key: 'pwcIcf' }} unit="m" />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">{defLabel('pwcCanhaoRecuperado', 'Canhão será recuperado?')}</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={plan.pwcCanhaoRecuperado === opt}
                                                onChange={() => updatePlan(item.uid, 'pwcCanhaoRecuperado', plan.pwcCanhaoRecuperado === opt ? '' : opt)}
                                                className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {isCondicionamento && (
                                      <>
                                        <Field label={defLabel('condicIntervaloTopo', "Topo do intervalo")}    value={d.condicIntervaloTopo}     onChange={v => setBhasTech({ condicIntervaloTopo: v })} unit="m"   locate={{ kind: 'data', field: 'condicIntervaloTopo' }} />
                                        <Field label={defLabel('condicIntervaloBase', "Base do intervalo")}    value={d.condicIntervaloBase}     onChange={v => setBhasTech({ condicIntervaloBase: v })} unit="m"   locate={{ kind: 'data', field: 'condicIntervaloBase' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'condicBroca'), "Diâmetro da broca")}    value={plan.condicBroca ?? ''}    onChange={v => updatePlan(item.uid, 'condicBroca', v)} locate={{ kind: 'plan', uid: item.uid, key: 'condicBroca' }} unit="pol" />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'condicRaspador'), "Diâmetro do raspador")} value={plan.condicRaspador ?? ''} onChange={v => updatePlan(item.uid, 'condicRaspador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'condicRaspador' }} unit="pol" />
                                      </>
                                    )}
                                    {isVgl && item.technology === 'wireline' && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'tipoDesviador'), "Desviador — Tipo/Modelo")} value={plan.tipoDesviador ?? ''} onChange={v => updatePlan(item.uid, 'tipoDesviador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tipoDesviador' }} />
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'diamJdc'), "Ø JDC")}                   value={plan.diamJdc ?? ''}       onChange={v => updatePlan(item.uid, 'diamJdc', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamJdc' }} unit="pol" />
                                      </>
                                    )}
                                    {isCacambeio && (
                                      <Field label={defLabel(defTokenForPlanKey(item.packageId, 'diamCacamba'), "Ø caçamba")} value={plan.diamCacamba ?? ''} onChange={v => updatePlan(item.uid, 'diamCacamba', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamCacamba' }} unit="pol" />
                                    )}
                                    {isSlidingSleeve && (
                                      <>
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'modeloSlidingSleeve'), "Sliding Sleeve — Modelo")} value={plan.modeloSlidingSleeve ?? ''} onChange={v => updatePlan(item.uid, 'modeloSlidingSleeve', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modeloSlidingSleeve' }} />
                                        {locKey && <Field label={defLabel(locKey, "Ø localizador (collet)")}   value={plan[locKey] ?? ''}    onChange={v => updatePlan(item.uid, locKey, v)} locate={{ kind: 'plan', uid: item.uid, key: locKey }} unit="pol" />}
                                        {estKey && <Field label={defLabel(estKey, "Ø estampador")}             value={plan[estKey] ?? ''}     onChange={v => updatePlan(item.uid, estKey, v)} locate={{ kind: 'plan', uid: item.uid, key: estKey }} unit="pol" />}
                                        <Field label={defLabel(defTokenForPlanKey(item.packageId, 'prof'), "Profundidade")}             value={plan.prof ?? ''}               onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                      </>
                                    )}
                                    {/* Estanqueidade pós-instalação + HP toggle — STV/Plug (wireline) */}
                                    {item.packageId === 'ABAN 038' && (
                                      <>
                                        <Field label={defLabel('pressaoEstStvR', 'Estanqueidade — STV nipple R 2,75"')} value={d.pressaoEstStvR} onChange={v => setBhasTech({ pressaoEstStvR: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstStvR' }} />
                                        {boolToggle('pressaoEstStvRHp', 'Será um Hold Point?', d.pressaoEstStvRHp, v => setBhasTech({ pressaoEstStvRHp: v }))}
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 039' && (
                                      <>
                                        <Field label={defLabel('pressaoEstStvF', 'Estanqueidade — STV nipple F 2,81"')} value={d.pressaoEstStvF} onChange={v => setBhasTech({ pressaoEstStvF: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstStvF' }} />
                                        {boolToggle('pressaoEstStvFHp', 'Será um Hold Point?', d.pressaoEstStvFHp, v => setBhasTech({ pressaoEstStvFHp: v }))}
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 040' && (
                                      <>
                                        <Field label={defLabel('pressaoEstPlugR', 'Estanqueidade — Plug nipple R 2,75"')} value={d.pressaoEstPlugR} onChange={v => setBhasTech({ pressaoEstPlugR: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstPlugR' }} />
                                        {boolToggle('pressaoEstPlugRHp', 'Será um Hold Point?', d.pressaoEstPlugRHp, v => setBhasTech({ pressaoEstPlugRHp: v }))}
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 041' && (
                                      <>
                                        <Field label={defLabel('pressaoEstPlugF', 'Estanqueidade — Plug nipple F 2,81"')} value={d.pressaoEstPlugF} onChange={v => setBhasTech({ pressaoEstPlugF: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstPlugF' }} />
                                        {boolToggle('pressaoEstPlugFHp', 'Será um Hold Point?', d.pressaoEstPlugFHp, v => setBhasTech({ pressaoEstPlugFHp: v }))}
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 042' && (
                                      <>
                                        <Field label={defLabel('pressaoEstPlugTH', 'Estanqueidade — Plug 3,75" no TH')} value={d.pressaoEstPlugTH} onChange={v => setBhasTech({ pressaoEstPlugTH: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstPlugTH' }} />
                                        {boolToggle('pressaoEstPlugTHHp', 'Será um Hold Point?', d.pressaoEstPlugTHHp, v => setBhasTech({ pressaoEstPlugTHHp: v }))}
                                      </>
                                    )}
                                    {/* Pcab N₂ — teste de influxo (ABAN 220 / 221) */}
                                    {(item.packageId === 'ABAN 220' || item.packageId === 'ABAN 221') && (
                                      <>
                                        <Field label={defLabel('outrosPcabN2Psi', "Pcab N₂ — teste de influxo (underbalance)")} value={d.outrosPcabN2Psi} onChange={v => setBhasTech({ outrosPcabN2Psi: v })} unit="psi" locate={{ kind: 'data', field: 'outrosPcabN2Psi' }} />
                                        {boolToggle('outrosPcabN2PsiHp', 'Será um Hold Point?', d.outrosPcabN2PsiHp, v => setBhasTech({ outrosPcabN2PsiHp: v }))}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        })()}
              {tech === 'wireline' && hasPkgFn('ABAN 079') && <Field label={defLabel('gabaritoNippleDiam', "Ø nipple (gabaritagem)")} value={d.gabaritoNippleDiam} onChange={v => setBhasTech({ gabaritoNippleDiam: v })} unit='"' locate={{ kind: 'data', field: 'gabaritoNippleDiam' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 079') && <Field label={defLabel('tampaoTipo', "Tipo de tampão (plug/TAE/bismuto)")} value={d.tampaoTipo} onChange={v => setBhasTech({ tampaoTipo: v })} locate={{ kind: 'data', field: 'tampaoTipo' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 047') && <Field label={defLabel('profRegistroPressao', "Profundidade do registro de pressão")} value={d.profRegistroPressao} onChange={v => setBhasTech({ profRegistroPressao: v })} unit="m" locate={{ kind: 'data', field: 'profRegistroPressao' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 047') && <Field label={defLabel('numEstacoesRp', "Quantidade de estações (RP)")} value={d.numEstacoesRp} onChange={v => setBhasTech({ numEstacoesRp: v })} locate={{ kind: 'data', field: 'numEstacoesRp' }} />}
              {tech === 'electric' && hasPkgFn('ABAN 238') && <Field label={defLabel('bismutoEur', "Tampão bismuto — EUR")} value={d.bismutoEur} onChange={v => setBhasTech({ bismutoEur: v })} unit="m" locate={{ kind: 'data', field: 'bismutoEur' }} />}
              {tech === 'electric' && hasPkgFn('ABAN 238') && <Field label={defLabel('bismutoOverpull', "Tampão bismuto — overpull de liberação")} value={d.bismutoOverpull} onChange={v => setBhasTech({ bismutoOverpull: v })} unit="lbf" locate={{ kind: 'data', field: 'bismutoOverpull' }} />}
              {tech === 'electric' && hasPkgFn('ABAN 102') && <Field label={defLabel('canhaoModelo', "Modelo do canhão")} value={d.canhaoModelo} onChange={v => setBhasTech({ canhaoModelo: v })} locate={{ kind: 'data', field: 'canhaoModelo' }} />}
              {tech === 'electric' && hasPkgFn('ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 106','ABAN 107','ABAN 149','ABAN 231','ABAN 232','ABAN 234') &&
                boolToggle('revcimHp', 'Avaliação de cimentação / topo será Hold Point (REVCIM)?', d.revcimHp, v => setBhasTech({ revcimHp: v }))}
              {tech === 'electric' && hasPkgFn('ABAN 105') &&
                boolToggle('revcimHp105', 'Avaliação de cimentação Through Tubing será Hold Point (REVCIM)?', d.revcimHp105, v => setBhasTech({ revcimHp105: v }))}
              {tech === 'ct' && hasPkgFn('ABAN 124','ABAN 125','ABAN 127','ABAN 128','ABAN 129','ABAN 130','ABAN 131','ABAN 132','ABAN 133','ABAN 135') && <Field label={defLabel('volBombeioDescidaFt', "Volume bombeio na descida com FT")} value={d.volBombeioDescidaFt} onChange={v => setBhasTech({ volBombeioDescidaFt: v })} unit="bbl/500m" locate={{ kind: 'data', field: 'volBombeioDescidaFt' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 159') && <Field label={defLabel('packerFtDiam159', "Ø Packer inflável")} value={d.packerFtDiam159} onChange={v => setBhasTech({ packerFtDiam159: v })} unit='"' locate={{ kind: 'data', field: 'packerFtDiam159' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 164') && <Field label={defLabel('packerFtDiam164', "Ø Packer Multi-set")} value={d.packerFtDiam164} onChange={v => setBhasTech({ packerFtDiam164: v })} unit='"' locate={{ kind: 'data', field: 'packerFtDiam164' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 129') && <Field label={defLabel('plugFtDiam', "Ø plug FT (TH)")} value={d.plugFtDiam} onChange={v => setBhasTech({ plugFtDiam: v })} unit='"' locate={{ kind: 'data', field: 'plugFtDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 129') && <Field label={defLabel('plugFtAplicador', "Aplicador do plug FT")} value={d.plugFtAplicador} onChange={v => setBhasTech({ plugFtAplicador: v })} locate={{ kind: 'data', field: 'plugFtAplicador' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 143') && <Field label={defLabel('marteleteModelo', "Modelo da ponteira (martelete FT)")} value={d.marteleteModelo} onChange={v => setBhasTech({ marteleteModelo: v })} locate={{ kind: 'data', field: 'marteleteModelo' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 143') && <Field label={defLabel('marteletePonteiraDiam', "Ø da ponteira (martelete FT)")} value={d.marteletePonteiraDiam} onChange={v => setBhasTech({ marteletePonteiraDiam: v })} unit='"' locate={{ kind: 'data', field: 'marteletePonteiraDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 144','ABAN 145') && <Field label={defLabel('ferramentaBoDuplaDiam', "Ø ferramenta BO dupla (FT)")} value={d.ferramentaBoDuplaDiam} onChange={v => setBhasTech({ ferramentaBoDuplaDiam: v })} unit='"' locate={{ kind: 'data', field: 'ferramentaBoDuplaDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 147') && <Field label={defLabel('ferramentaBhaFt', "Ferramentas do BHA (FT)")} value={d.ferramentaBhaFt} onChange={v => setBhasTech({ ferramentaBhaFt: v })} locate={{ kind: 'data', field: 'ferramentaBhaFt' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 013') && <Field label={defLabel('adaptadorMc', "Adaptador MC (interface COT)")} value={d.adaptadorMc} onChange={v => setBhasTech({ adaptadorMc: v })} locate={{ kind: 'data', field: 'adaptadorMc' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 186') && <Field label={defLabel('overpullKlbf', "Overpull (retirada COP/COI)")} value={d.overpullKlbf} onChange={v => setBhasTech({ overpullKlbf: v })} unit="klbf" locate={{ kind: 'data', field: 'overpullKlbf' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 196') && <Field label={defLabel('revestimentoDiam', "Ø revestimento (manobra)")} value={d.revestimentoDiam} onChange={v => setBhasTech({ revestimentoDiam: v })} unit='"' locate={{ kind: 'data', field: 'revestimentoDiam' }} />}
{tech === 'workstring' && hasPkgFn('ABAN 235') && <Field label={defLabel('corteBrocaDiam', "Ø broca (corte de cimento)")} value={d.corteBrocaDiam} onChange={v => setBhasTech({ corteBrocaDiam: v })} unit='"' locate={{ kind: 'data', field: 'corteBrocaDiam' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 235') && <Field label={defLabel('corteDcSecoes', 'Nº seções DC 6¾" (corte)')} value={d.corteDcSecoes} onChange={v => setBhasTech({ corteDcSecoes: v })} locate={{ kind: 'data', field: 'corteDcSecoes' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 235') && <Field label={defLabel('corteHwdpSecoes', 'Nº seções HWDP 5" (corte)')} value={d.corteHwdpSecoes} onChange={v => setBhasTech({ corteHwdpSecoes: v })} locate={{ kind: 'data', field: 'corteHwdpSecoes' }} />}
            </Section>
          )
        })}

        {/* ── Cimentação ── */}
        {(() => {
          const pwcItems = state.fineTuningItems.filter(i => !i.isBlank && /\bpwc\b/i.test(i.packageName))
          // Cimentação: exclui avaliação E exclui pacotes PWC (que já aparecem em pwcItems)
          const cimentItems = state.fineTuningItems.filter(i =>
            !i.isBlank
            && /cimenta/i.test(i.packageName)
            && !/avalia/i.test(i.packageName)
            && !/\bpwc\b/i.test(i.packageName)
          )
          const bppItems = state.fineTuningItems.filter(i => !i.isBlank && /instala.*\bbpp\b/i.test(i.packageName))
          if (cimentItems.length === 0 && pwcItems.length === 0 && bppItems.length === 0) return null

          // TT é detectado pelo scopeId (FSU_TT_FT, FSU_TT_BDC)
          const isThroughTubing = /_TT_/.test(inp.scopeId ?? '')
          const updatePlug = (uid: string, key: 'base' | 'topo', value: string) => {
            const cur = d.cimentPlugs?.[uid] ?? {}
            setCimentacao({ cimentPlugs: { ...(d.cimentPlugs ?? {}), [uid]: { ...cur, [key]: value } } })
          }

          // Auto-fill suggestions for TT
          // - Perfuração da coluna: prof do primeiro pacote /perfura/ com bhaPlans[uid].prof preenchido
          // - Base da cimentação: primeiro elemento instalado com profundidade (TAE ou nipple)
          const autoPerfProf = (() => {
            const perfItem = state.fineTuningItems.find(i =>
              !i.isBlank && /perfura/i.test(i.packageName) && !!d.bhaPlans?.[i.uid]?.prof
            )
            return perfItem ? (d.bhaPlans?.[perfItem.uid]?.prof ?? '') : ''
          })()
          const autoBaseProf = (() => {
            // Base da cimentação = profundidade do elemento instalado no CSB primário (etapa 2)
            const csb = inp.csbPrimary
            const matchByElement = (re: RegExp, fieldKey: keyof import('../types').BhaPlanFields = 'prof') => {
              // Para prof, considera o valor derivado do nipple (exibido antes de Aplicar Nipples).
              const profOf = (i: { uid: string; packageName: string; technology: string }) =>
                fieldKey === 'prof'
                  ? (bhaDerivedDepth(i, d) ?? d.bhaPlans?.[i.uid]?.prof ?? '')
                  : (d.bhaPlans?.[i.uid]?.[fieldKey] as string | undefined) ?? ''
              const it = state.fineTuningItems.find(i =>
                !i.isBlank && /instala/i.test(i.packageName) && re.test(i.packageName) && !!profOf(i)
              )
              return it ? profOf(it) : ''
            }
            if (csb === 'tae') return matchByElement(/\btae\b|tampão de alta expansão/i, 'taeProf')
            if (csb === 'stdv') return matchByElement(/\bstv\b/i, 'prof')
            if (csb === 'plug') return matchByElement(/\bplug\b/i, 'prof')
            if (csb === 'inflatable_packer') return matchByElement(/inflat|packer/i, 'prof')
            // Fallback: tenta TAE, depois nipple depths antigos
            const tae = matchByElement(/\btae\b|tampão de alta expansão/i, 'taeProf')
            if (tae) return tae
            return d.nipple275Depth || d.nipple281Depth || d.nippleDhsvDepth || d.nipple375Depth || d.nipple381Depth || ''
          })()
          const autoCrProf = (() => {
            const crItem = state.fineTuningItems.find(i =>
              !i.isBlank && /cimenta.*\bcr\b/i.test(i.packageName) && !!d.bhaPlans?.[i.uid]?.crProf
            )
            return crItem ? (d.bhaPlans?.[crItem.uid]?.crProf ?? '') : ''
          })()
          const updatePwcPlan = (uid: string, key: keyof import('../types').BhaPlanFields, value: string) => {
            const cur = d.bhaPlans?.[uid] ?? {}
            setCimentacao({ bhaPlans: { ...(d.bhaPlans ?? {}), [uid]: { ...cur, [key]: value } } })
          }

          // Compute #N for duplicate cimentItems
          const totalCounts = new Map<string, number>()
          for (const it of cimentItems) totalCounts.set(it.packageId, (totalCounts.get(it.packageId) ?? 0) + 1)
          const seenCounts = new Map<string, number>()

          // "Topo no anular A" aparece quando há cimentação do anular A com FT OU há BPP
          const hasCimentAnularAFt = state.fineTuningItems.some(i =>
            !i.isBlank && i.technology === 'ct' && /cimenta.*anular a/i.test(i.packageName)
          )
          const showTopoAnularA = hasCimentAnularAFt || bppItems.length > 0

          return (
            <Section title="Cimentação" searchText="cimento topo anular interior coluna profundidade base perfuração cr plug bpp diâmetro metro"              isDirty={dirty['cimentacao']} onApply={applySection('cimentacao')} onDiscard={discardSection('cimentacao')} canApply={sectionAffectsLines('cimentacao')}>
              {showTopoAnularA && (
                <Field label={defLabel('cimentTopoAnularA', "Topo no anular A")} value={d.cimentTopoAnularA} onChange={v => setCimentacao({ cimentTopoAnularA: v })} unit="m" locate={{ kind: 'data', field: 'cimentTopoAnularA' }} />
              )}
              {bppItems.map(item => {
                const bpProf = d.bhaPlans?.[item.uid]?.bpProf ?? ''
                const bpDiam = d.bhaPlans?.[item.uid]?.bpDiam ?? ''
                return (
                  <div key={item.uid}>
                    <Field label={`${item.packageName} — Profundidade`} value={bpProf} onChange={() => {}} placeholder="preencha em BHA" unit="m" readOnly locate={{ kind: 'plan', uid: item.uid, key: 'bpProf' }} />
                    <Field label={`${item.packageName} — Diâmetro do tubo`} value={bpDiam} onChange={() => {}} placeholder="preencha em BHA" unit="pol" readOnly locate={{ kind: 'plan', uid: item.uid, key: 'bpDiam' }} />
                  </div>
                )
              })}
              {isThroughTubing ? (
                <>
                  <Field label={defLabel('cimentTopoInteriorColuna', "Topo no interior da coluna")} value={d.cimentTopoInteriorColuna} onChange={v => setCimentacao({ cimentTopoInteriorColuna: v })} unit="m" locate={{ kind: 'data', field: 'cimentTopoInteriorColuna' }} />
                  <Field
                    label="Profundidade da perfuração da coluna"
                    value={autoPerfProf}
                    onChange={() => {}}
                    placeholder="preencha em BHA"
                    unit="m"
                    readOnly
                    locate={{ kind: 'data', field: 'cimentProfPerfuracao' }}
                  />
                  <Field
                    label="Profundidade da base da cimentação"
                    value={autoBaseProf}
                    onChange={() => {}}
                    placeholder="preencha em BHA"
                    unit="m"
                    readOnly
                    locate={{ kind: 'data', field: 'cimentProfBaseCimentacao' }}
                  />
                  {cimentItems.some(i => /cimenta.*\bcr\b/i.test(i.packageName)) && (
                    <Field
                      label="Profundidade de assentamento do CR"
                      value={autoCrProf}
                      onChange={() => {}}
                      placeholder="preencha em BHA"
                      unit="m"
                      readOnly
                      locate={{ kind: 'data', field: 'cimentCrProfundidade' }}
                    />
                  )}
                </>
              ) : (
                <>
                  {cimentItems.map(item => {
                    const seen = (seenCounts.get(item.packageId) ?? 0) + 1
                    seenCounts.set(item.packageId, seen)
                    const dupPrefix = (totalCounts.get(item.packageId) ?? 0) > 1 ? `#${seen} ` : ''
                    const plug = d.cimentPlugs?.[item.uid] ?? {}
                    return (
                      <div key={item.uid}>
                        <Field label={`${dupPrefix}${item.packageName} — Base`} value={plug.base ?? ''} onChange={v => updatePlug(item.uid, 'base', v)} unit="m" />
                        <Field label={`${dupPrefix}${item.packageName} — Topo`} value={plug.topo ?? ''} onChange={v => updatePlug(item.uid, 'topo', v)} unit="m" />
                      </div>
                    )
                  })}
                </>
              )}
              {/* Alinhamento + volumes/densidades de cimentação — campo dedicado por pacote (ABAN 078,079,083,084) */}
              {(() => {
                const alignIds = Object.keys(CIMENT_ALINHAMENTO_FIELD).filter(id => hasPkgFn(id))
                const volIds   = Object.keys(CIMENT_PLUG_VOL_FIELD).filter(id => hasPkgFn(id))
                if (!alignIds.length && !volIds.length) return null
                return (
                  <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">Bombeio</div>
                    {alignIds.map(pkgId => {
                      const key = CIMENT_ALINHAMENTO_FIELD[pkgId]
                      return (
                        <Field
                          key={key}
                          label={`${pkgId} — Alinhamento bombeio ("via xxx > xxx > xxx")`}
                          value={d[key] as string}
                          onChange={v => setCimentacao({ [key]: v })}
                          placeholder="ex: B4 > COP > Formação"
                          locate={{ kind: 'data', field: key }}
                        />
                      )
                    })}
                    {volIds.map(pkgId => {
                      const volKey = CIMENT_PLUG_VOL_FIELD[pkgId]
                      const densKey = CIMENT_PLUG_DENS_FIELD[pkgId]
                      const fcbaKey = CIMENT_FCBA_DENS_FIELD[pkgId]
                      return (
                        <div key={volKey}>
                          <Field label={`${pkgId} — Volume tampão de cimento`}    value={d[volKey] as string}  onChange={v => setCimentacao({ [volKey]: v })}  unit="bbl" locate={{ kind: 'data', field: volKey }} />
                          <Field label={`${pkgId} — Densidade tampão de cimento`} value={d[densKey] as string} onChange={v => setCimentacao({ [densKey]: v })} unit="lb/gal" locate={{ kind: 'data', field: densKey }} />
                          <Field label={`${pkgId} — Densidade deslocamento FCBA`} value={d[fcbaKey] as string} onChange={v => setCimentacao({ [fcbaKey]: v })} unit="lb/gal" locate={{ kind: 'data', field: fcbaKey }} />
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
              {/* PWC: card editável por item */}
              {pwcItems.map(item => {
                const plan = d.bhaPlans?.[item.uid] ?? {}
                const isPwcAval = item.packageId === 'ABAN 231'
                const intervaloTopoKey = INTERVALO_INTERESSE_TOPO_FIELD[item.packageId]
                const intervaloBaseKey = INTERVALO_INTERESSE_BASE_FIELD[item.packageId]
                return (
                  <div key={item.uid} className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1 leading-snug">{item.packageName}</div>
                    <Field label={defLabel(defTokenForPlanKey(item.packageId, 'pwcCanhoneioTopo'), "Canhoneio — Topo")} value={plan.pwcCanhoneioTopo ?? ''} onChange={v => updatePwcPlan(item.uid, 'pwcCanhoneioTopo', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioTopo' }} />
                    <Field label={defLabel(defTokenForPlanKey(item.packageId, 'pwcCanhoneioBase'), "Canhoneio — Base")} value={plan.pwcCanhoneioBase ?? ''} onChange={v => updatePwcPlan(item.uid, 'pwcCanhoneioBase', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioBase' }} />
                    <Field label={defLabel(defTokenForPlanKey(item.packageId, 'pwcIcf'), "Assentamento do ICF")} value={plan.pwcIcf ?? ''} onChange={v => updatePwcPlan(item.uid, 'pwcIcf', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcIcf' }} />
                    {isPwcAval && intervaloTopoKey && (
                      <>
                        <Field label={defLabel(intervaloTopoKey, "Intervalo de interesse — Topo")} value={plan[intervaloTopoKey] ?? ''} onChange={v => updatePwcPlan(item.uid, intervaloTopoKey, v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: intervaloTopoKey }} />
                        {intervaloBaseKey && <Field label={defLabel(intervaloBaseKey, "Intervalo de interesse — Base")} value={plan[intervaloBaseKey] ?? ''} onChange={v => updatePwcPlan(item.uid, intervaloBaseKey, v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: intervaloBaseKey }} />}
                      </>
                    )}
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">{defLabel('pwcCanhaoRecuperado', 'Canhão será recuperado?')}</span>
                      {(['sim','nao'] as const).map(opt => (
                        <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                          <input type="radio" checked={plan.pwcCanhaoRecuperado === opt}
                            onChange={() => updatePwcPlan(item.uid, 'pwcCanhaoRecuperado', plan.pwcCanhaoRecuperado === opt ? '' : opt)}
                            className="accent-[#0c2340]" />
                          <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              {Object.entries(CR_DIAM_FIELD).filter(([id]) => hasPkgFn(id)).map(([id, key]) =>
                <Field key={key} label={`${id} — Ø CR (Cement Retainer)`} value={d[key] as string} onChange={v => setCimentacao({ [key]: v })} unit='"' locate={{ kind: 'data', field: key }} />)}
              {Object.entries(CIMENT_ANULAR_ACIMA_TAMPAO_FIELD).filter(([id]) => hasPkgFn(id)).map(([id, key]) =>
                <Field key={key} label={`${id} — Topo cimento anular acima do tampão`} value={d[key] as string} onChange={v => setCimentacao({ [key]: v })} unit="m" locate={{ kind: 'data', field: key }} />)}
              {Object.entries(CIMENT_TOPO_REVCIM_FIELD).filter(([id]) => hasPkgFn(id)).map(([id, key]) =>
                <Field key={key} label={`${id} — Topo do cimento (REVCIM)`} value={d[key] as string} onChange={v => setCimentacao({ [key]: v })} unit="m" locate={{ kind: 'data', field: key }} />)}
              {Object.entries(TAMPAO_ABANDONO_DENS_FIELD).filter(([id]) => hasPkgFn(id)).map(([id, key]) =>
                <Field key={key} label={`${id} — Tampão abandono — densidade pasta`} value={d[key] as string} onChange={v => setCimentacao({ [key]: v })} unit="ppg" locate={{ kind: 'data', field: key }} />)}
              {Object.entries(TAMPAO_ABANDONO_TOPO_FIELD).filter(([id]) => hasPkgFn(id)).map(([id, key]) =>
                <Field key={key} label={`${id} — Tampão abandono — topo previsto`} value={d[key] as string} onChange={v => setCimentacao({ [key]: v })} unit="m" locate={{ kind: 'data', field: key }} />)}
              {Object.entries(TAMPAO_ABANDONO_COMPR_FIELD).filter(([id]) => hasPkgFn(id)).map(([id, key]) =>
                <Field key={key} label={`${id} — Tampão abandono — comprimento`} value={d[key] as string} onChange={v => setCimentacao({ [key]: v })} unit="m" locate={{ kind: 'data', field: key }} />)}
              {hasPkgFn('ABAN 200') && <Field label={defLabel('ecsbFluidoDens', "Fluido eCSB (mar aberto) — densidade")} value={d.ecsbFluidoDens} onChange={v => setCimentacao({ ecsbFluidoDens: v })} unit="ppg" locate={{ kind: 'data', field: 'ecsbFluidoDens' }} />}
            </Section>
          )
        })()}

        {/* ── Outros ── (orientado a dados: aba Place Holders) */}
        {renderGlobalSection('outros', 'Outros', 'meg concentração fluido inibido vazão resfriamento cimentação bpm pressão plug tmf produção n2 nitrogênio')}

        {/* ── Hold Points ── */}
        {(() => {
          const showEstStvR   = hasPkgFn('ABAN 038')
          const showEstStvF   = hasPkgFn('ABAN 039')
          const showEstPlugR  = hasPkgFn('ABAN 040')
          const showEstPlugF  = hasPkgFn('ABAN 041')
          const showEstTae    = hasPkgFn('ABAN 237')
          const showEstPlugTH = hasPkgFn('ABAN 042')
          const showPcab      = hasPkgFn('ABAN 220','ABAN 221')
          // ECS/BOP: sempre ativos quando os pacotes estão no cronograma
          const showEcsBop184  = hasPkgFn('ABAN 184')
          const showEcsBop228  = hasPkgFn('ABAN 228')
          const showEcsBop229  = hasPkgFn('ABAN 229')
          const showEcsBopAny  = showEcsBop184 || showEcsBop228 || showEcsBop229
          // REVCIM: ativo quando toggle ligado + pacote presente
          const showRevcimEval = d.revcimHp && hasPkgFn('ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 106','ABAN 107','ABAN 149')
          const showRevcimTop  = d.revcimHp && hasPkgFn('ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 231','ABAN 232','ABAN 234')
          const showRevcimEval105 = d.revcimHp105 && hasPkgFn('ABAN 105')
          // Apenas itens marcados como Hold Point (configurado na seção de tecnologia)
          const hpEstItems = [
            { show: showEstStvR   && d.pressaoEstStvRHp,    label: 'Estanqueidade — STV nipple R 2,75"',   value: d.pressaoEstStvR,    field: 'pressaoEstStvR'   as const },
            { show: showEstStvF   && d.pressaoEstStvFHp,    label: 'Estanqueidade — STV nipple F 2,81"',   value: d.pressaoEstStvF,    field: 'pressaoEstStvF'   as const },
            { show: showEstPlugR  && d.pressaoEstPlugRHp,   label: 'Estanqueidade — Plug nipple R 2,75"',  value: d.pressaoEstPlugR,   field: 'pressaoEstPlugR'  as const },
            { show: showEstPlugF  && d.pressaoEstPlugFHp,   label: 'Estanqueidade — Plug nipple F 2,81"',  value: d.pressaoEstPlugF,   field: 'pressaoEstPlugF'  as const },
            { show: showEstTae    && d.pressaoEstTaeHp,     label: 'Estanqueidade — TAE',                   value: d.pressaoEstTae,     field: 'pressaoEstTae'    as const },
            { show: showEstPlugTH && d.pressaoEstPlugTHHp,  label: 'Estanqueidade — Plug 3,75" no TH',     value: d.pressaoEstPlugTH,  field: 'pressaoEstPlugTH' as const },
            { show: showPcab      && d.outrosPcabN2PsiHp,   label: 'Pcab N₂ — teste de influxo (underbalance)', value: d.outrosPcabN2Psi, field: 'outrosPcabN2Psi' as const },
          ].filter(x => x.show)
          return (
            <Section title="Hold Points" searchText="hold point revcim ecs bop estanqueidade stv plug tae testes elementos instalados pcab n2 influxo cimentação avaliação pós-instalação prova pressão"  defaultOpen={false}              isDirty={dirty['holdpoints']} onApply={applySection('holdpoints')} onDiscard={discardSection('holdpoints')} canApply={sectionAffectsLines('holdpoints')}>
              {showEcsBopAny && (
                <div className="pb-2 mb-2 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">ECS/BOP — sempre</div>
                  {showEcsBop184 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Testes de linhas submarinas (JT) — kill/choke/booster/conduítes</LocateRow>}
                  {showEcsBop184 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Teste gavetas cegas e anel VGX do BOP</LocateRow>}
                  {showEcsBop228 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Testes completos do BOP (manobra dedicada com test plug)</LocateRow>}
                  {showEcsBop229 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Teste gaveta de tubos inferior e teste completo BOP (modo perfuração)</LocateRow>}
                </div>
              )}
              {(showRevcimEval || showRevcimTop || showRevcimEval105) && (
                <div className="pb-2 mb-2 border-b border-slate-200 dark:border-slate-800 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">REVCIM</div>
                  {showRevcimEval && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - REVCIM]' }}>Avaliação de cimentação (perfil/perfilagem REVCIM)</LocateRow>}
                  {showRevcimTop  && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - REVCIM]' }}>Checagem de topo do cimento</LocateRow>}
                  {showRevcimEval105 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - REVCIM]' }}>Avaliação de cimentação Through Tubing (REVCIM)</LocateRow>}
                </div>
              )}
              {hpEstItems.length > 0 && (
                <div className="pb-2 mb-2 border-b border-slate-200 dark:border-slate-800 space-y-0">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">Testes de elementos instalados</div>
                  {hpEstItems.map(it => (
                    <Field key={it.field} label={it.label} value={it.value} onChange={() => {}} readOnly unit="psi" locate={{ kind: 'data', field: it.field }} />
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {d.holdPoints.map((pt, i) => (
                  <div key={i} className="py-1 border-b border-slate-200 dark:border-slate-800 last:border-0 flex items-center gap-1 group/hp">
                    <input
                      type="text" value={pt}
                      onChange={e => {
                        const next = [...d.holdPoints]; next[i] = e.target.value
                        setHoldpoints({ holdPoints: next })
                      }}
                      placeholder="Descrever hold point..."
                      className="flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-200 bg-transparent outline-none border-b border-slate-200 dark:border-slate-800 focus:border-blue-300 dark:focus:border-blue-700 transition-colors placeholder:text-slate-500 dark:placeholder:text-slate-600 py-0.5"
                    />
                    <button
                      onClick={() => setHoldpoints({ holdPoints: d.holdPoints.filter((_, j) => j !== i) })}
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-slate-500 dark:text-slate-600 hover:text-red-400 opacity-0 group-hover/hp:opacity-100 transition-all">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )
        })()}

      </div>
      </SectionFilterCtx.Provider>
    </div>
    </LocateCtx.Provider>
  )
}
