import { useState, useEffect, useRef, useLayoutEffect, createContext, useContext } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Crosshair, PanelLeftClose, ChevronDown } from 'lucide-react'
import { useApp, lineIdsForLocate, SLWLFT_HIGH_PKG_IDS, type LocateTarget } from '../context/AppContext'
import type { ProjectData, BhaPlanFields } from '../types'
import { PACKAGES } from '../data/packages'
import { bhaDerivedDepth, camisaoDhsvFields, gabaritoFields } from '../engines/nippleDepth'

// ── Localizar campo → realça linhas relacionadas no cronograma ────────────────
const LocateCtx = createContext<{
  onLocate?: (t: LocateTarget) => void
  onClear?: () => void
  active: LocateTarget | null
} | null>(null)

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
  const showLocate = !!(ctx?.onLocate && locate)
  const active = showLocate && locateEq(ctx!.active, locate!)
  return (
    <div className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-600 dark:text-slate-500 shrink-0 leading-snug flex items-center gap-1 min-w-0">
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
      <div className="flex items-center min-w-0">
        <input
          type="text" value={value} placeholder={placeholder ?? '—'}
          readOnly={readOnly}
          onChange={e => { if (!readOnly) onChange(e.target.value) }}
          onFocus={() => ctx?.onClear?.()}
          title={readOnly ? 'Campo preenchido automaticamente' : undefined}
          className={`flex-1 min-w-0 text-xs font-semibold ${readOnly ? 'text-slate-700 dark:text-slate-400 italic cursor-default' : 'text-slate-700 dark:text-slate-200'} bg-transparent outline-none placeholder:text-slate-500 dark:placeholder:text-slate-600 leading-snug text-right`}
        />
        {unit && (
          <span className="text-[10px] text-slate-600 dark:text-slate-500 shrink-0 ml-1 select-none">{unit}</span>
        )}
      </div>
    </div>
  )
}


// Linha informacional com botão de localização — para itens da seção Hold Points
// que não têm um campo numérico próprio (ex.: REVCIM, ECS/BOP).
function LocateRow({ children, target }: { children: React.ReactNode; target?: LocateTarget }) {
  const ctx = useContext(LocateCtx)
  const showLocate = !!(ctx?.onLocate && target)
  const active = showLocate && locateEq(ctx!.active, target!)
  return (
    <div className="text-xs text-slate-700 dark:text-slate-300 py-0.5 flex items-center gap-1">
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

// ── Combobox custom: sugere opções num dropdown temático, mas aceita texto livre ─
// Substitui o <datalist> nativo (não estilizável e que desenhava uma 2ª seta).
function ComboInput({ value, onChange, options, placeholder, className }: {
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

// ── Linha compacta de Nipple: tipo + profundidade lado a lado ─────────────────
function NippleRow({ label, name, depth, onName, onDepth, namePlaceholder, options, locate }: {
  label: string
  name: string; depth: string
  onName: (v: string) => void; onDepth: (v: string) => void
  namePlaceholder?: string
  options?: string[]
  locate?: LocateTarget
}) {
  const inputCls = 'min-w-0 text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-sky-400 dark:focus:border-sky-600 placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors'
  const na = name.trim().toLowerCase() === 'não aplicável'
  const ctx = useContext(LocateCtx)
  const showLocate = !!(ctx?.onLocate && locate)
  const active = showLocate && locateEq(ctx!.active, locate!)
  return (
    <div className="flex items-center gap-1.5 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
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
    <div className="border-t border-slate-100 dark:border-slate-800">
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
function Section({ title, children, defaultOpen = false, isDirty = false, onApply, onDiscard, canApply = true, accent }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean
  isDirty?: boolean; onApply?: () => void; onDiscard?: () => void; canApply?: boolean
  accent?: string
}) {
  const [collapsed, setCollapsed] = useState(!defaultOpen)
  const dirty = isDirty && !!onApply
  return (
    <div className={`shrink-0 rounded-xl overflow-hidden shadow-sm ring-1 transition-colors ${
      dirty
        ? 'ring-amber-300 dark:ring-amber-700/70'
        : 'ring-slate-200/80 dark:ring-slate-700/60'
    } ${accent ? `border-l-[3px] ${accent}` : ''}`}>
      <div className={`flex items-center gap-1.5 px-2.5 py-2 bg-slate-50/90 dark:bg-slate-800/50 ${!collapsed ? 'border-b border-slate-200/70 dark:border-slate-700/50' : ''}`}>
        <button onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left group">
          <span className={`w-4 font-bold text-sm leading-none select-none transition-colors ${dirty ? 'text-amber-500' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`}>
            {collapsed ? '+' : '−'}
          </span>
          <span className={`text-xs font-bold tracking-wide transition-colors ${dirty ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100'}`}>
            {title}
          </span>
          {dirty && <span className="text-amber-400 text-[8px] leading-none ml-0.5">●</span>}
        </button>
        {dirty && !collapsed && (
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
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-500 cursor-not-allowed'
              }`}>
              Aplicar
            </button>
          </>
        )}
      </div>
      {!collapsed && <div className="px-2.5 py-1.5 space-y-0.5">{children}</div>}
    </div>
  )
}

// ── Each section just lists its fields (used to know what to patch) ───────────
const SECTION_FIELDS: Record<string, (keyof ProjectData)[]> = {
  sonda:      ['pocoOrigem','poco','distanciaEntrePocos','velocidadeMedia'],
  fluidos:    ['amortFcbaDensidade','pressaoCabecaLimite','limitePressaoBombeio','bullheadVolume','fcbaCorteDens'],
  testes_escp: ['mapecab','pressaoKillChoke','pressaoVgx','pressaoEquipSupBop','pressaoBopPerfuracao'],
  equipamentos_superficie: ['pressaoRiserDpr','pressaoBopArameHigh'],
  nipples:    ['nipple381','nipple381Depth','nipple375','nipple375Depth',
               'nipple281','nipple281Depth','nippleTHanular','nippleTHanularDepth',
               'nippleDhsv','nippleDhsvDepth',
               'nipple275','nipple275Depth','nipplesOutros','nipplesOutrosDepth'],
  holdpoints: ['holdPoints',
               // Fallback genérico de estanqueidade
               'pressaoProva'],
  bha_wireline:   ['bhaPlans',
               // Estanqueidade pós-instalação — STV/Plug (wireline): valor + flag de Hold Point
               'pressaoEstStvR','pressaoEstStvRHp','pressaoEstPlugR','pressaoEstPlugRHp',
               'pressaoEstPlugF','pressaoEstPlugFHp','pressaoEstPlugTH','pressaoEstPlugTHHp',
               // Pcab N₂ teste de influxo (wireline): valor + flag de Hold Point
               'outrosPcabN2Psi','outrosPcabN2PsiHp',
               'gabaritoNippleDiam','tampaoTipo','profRegistroPressao','numEstacoesRp',
               'bismutoEur','bismutoOverpull'],
  bha_electric:   ['bhaPlans','taeTuboDiam',
               // Estanqueidade pós-instalação — TAE (elétrico): valor + flag de Hold Point
               'pressaoEstTae','pressaoEstTaeHp','canhaoModelo',
               // Hold Point REVCIM: governa prefixo {{_hpRevcim=}} nas linhas de avaliação de cimentação
               'revcimHp'],
  bha_ct:         ['bhaPlans','volBombeioDescidaFt',
               'packerFtDiam','plugFtDiam','plugFtAplicador','ferramentaBoDuplaDiam','ferramentaBhaFt',
               'marteleteModelo','marteletePonteiraDiam'],
  bha_workstring: ['bhaPlans',
               'colunaTrabalhoDpDiam','adaptadorMc','overpullKlbf','revestimentoDiam',
               'condicIntervaloTopo','condicIntervaloBase','corteBrocaDiam','corteDcSecoes','corteHwdpSecoes'],
  retirada_coluna: ['copCoiTubo'],
  cimentacao: ['cimentTopoAnularA','cimentTopoInteriorColuna','cimentProfPerfuracao',
               'cimentProfBaseCimentacao','cimentCrProfundidade','cimentPlugs','cimentPwc',
               'cimentAlinhamento','cimentPlugVol','cimentPlugDens','cimentFcbaDens',
               'crDiam','cimentAnularAcimaTampao','tampaoAbandonoDens','tampaoAbandonoTopo','tampaoAbandonoCompr','ecsbFluidoDens',
               'cimentTopoRevcim','bhaPlans'],
  equipamentos_submarinos: ['outrosTrtWeightTcap','outrosTrtWeightAnm','outrosN2FlowScfm',
               // Movidos da seção Pressões (testes de interface / ANM)
               'pressaoCavFibop','pressaoHcr','pressaoBoreTest','pressaoRiserBores','pressaoRiserCavConexao','pressaoTmfAnulAnm','outrosDrainB2Psi','pressaoN2Trt',
               // Movido da seção Pressões (LC DHSV)
               'pressaoBullheadDhsv',
               // Movidos da seção Equipamentos de superfície
               'pressaoColunaDpr','pressaoColunaRiserDb'],
  outros:     ['outrosMegConc','outrosCoolingFlow',
               // Movido da seção Pressões (plug do TMF)
               'pressaoTmfProd'],
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
  outrosTrtWeightTcap: { packageIds: ['ABAN 018'] },
  outrosTrtWeightAnm:  { packageIds: ['ABAN 023'] },
  outrosMegConc:       { packageIds: ['ABAN 216', 'ABAN 217'] },
  outrosCoolingFlow:   { packageIds: ['ABAN 223', 'ABAN 224'] },
  outrosPcabN2Psi:     { packageIds: ['ABAN 220', 'ABAN 221'] },
  outrosDrainB2Psi:    { packageIds: ['ABAN 218'] },
  outrosN2FlowScfm:    { packageIds: ['ABAN 016'] },

  // Hold points are documentation only — no schedule impact

  // Fluidos operacionais
  bullheadVolume:      { packageIds: ['ABAN 030','ABAN 062'] },
  bullheadDepth:       { packageIds: ['ABAN 030'] },
  amortFcbaDensidade:  { packageIds: ['ABAN 061','ABAN 062','ABAN 063'] },

  // Pressões operacionais
  pressaoCavFibop:    { packageIds: ['ABAN 011','ABAN 012','ABAN 211','ABAN 212'] },
  pressaoBoreTest:    { packageIds: ['ABAN 012','ABAN 013','ABAN 206'] },
  pressaoRiserDpr:    { packageIds: ['ABAN 014','ABAN 015','ABAN 016','ABAN 017','ABAN 206','ABAN 244'] },
  pressaoColunaDpr:   { packageIds: ['ABAN 014'] },
  pressaoColunaRiserDb:{ packageIds: ['ABAN 015'] },
  pressaoN2Trt:       { packageIds: ['ABAN 024','ABAN 025'] },
  pressaoTmfProd:     { packageIds: ['ABAN 026'] },
  pressaoTmfAnulAnm:  { packageIds: ['ABAN 027','ABAN 028','ABAN 029'] },
  pressaoBullheadDhsv:{ packageIds: ['ABAN 030'] },
  pressaoBopArameHigh:{ packageIds: [...SLWLFT_HIGH_PKG_IDS] },
  pressaoBopPerfuracao:{ packageIds: ['ABAN 228','ABAN 229'] },
  pressaoVgx:         { packageIds: ['ABAN 184'] },
  pressaoKillChoke:   { packageIds: ['ABAN 184'] },
  pressaoEquipSupBop: { packageIds: ['ABAN 184'] },
  pressaoProva:       { techs: ['wireline','electric','ct'] },
  pressaoEstStvR:     { packageIds: ['ABAN 038'] },
  pressaoEstStvRHp:   { packageIds: ['ABAN 038'] },
  pressaoEstPlugR:    { packageIds: ['ABAN 040'] },
  pressaoEstPlugRHp:  { packageIds: ['ABAN 040'] },
  pressaoEstPlugF:    { packageIds: ['ABAN 041'] },
  pressaoEstPlugFHp:  { packageIds: ['ABAN 041'] },
  pressaoEstTae:      { packageIds: ['ABAN 237'] },
  pressaoEstTaeHp:    { packageIds: ['ABAN 237'] },
  pressaoEstPlugTH:   { packageIds: ['ABAN 042'] },
  pressaoEstPlugTHHp: { packageIds: ['ABAN 042'] },
  outrosPcabN2PsiHp:  { packageIds: ['ABAN 220','ABAN 221'] },
  revcimHp:           { packageIds: ['ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 105','ABAN 106','ABAN 107','ABAN 149','ABAN 231','ABAN 232','ABAN 234'] },

  // Cimentação operacional
  cimentAlinhamento:  { cats: ['Cimentação'] },
  cimentPlugVol:      { packageIds: ['ABAN 078','ABAN 079'] },
  cimentPlugDens:     { packageIds: ['ABAN 078','ABAN 079'] },
  cimentFcbaDens:     { packageIds: ['ABAN 078','ABAN 079'] },

  // Em implementação — campos novos
  colunaTrabalhoDpDiam: { packageIds: ['ABAN 013','ABAN 182','ABAN 185','ABAN 189','ABAN 190','ABAN 191','ABAN 192','ABAN 193','ABAN 194','ABAN 195','ABAN 196','ABAN 197','ABAN 198','ABAN 199','ABAN 200','ABAN 202'] },
  volBombeioDescidaFt:  { packageIds: ['ABAN 124','ABAN 125','ABAN 127','ABAN 128','ABAN 129','ABAN 130','ABAN 131','ABAN 132','ABAN 133','ABAN 135'] },
  crDiam:               { packageIds: ['ABAN 155','ABAN 156','ABAN 158'] },
  packerFtDiam:         { packageIds: ['ABAN 159','ABAN 164'] },
  marteleteModelo:      { packageIds: ['ABAN 143'] },
  marteletePonteiraDiam:{ packageIds: ['ABAN 143'] },
  bismutoEur:           { packageIds: ['ABAN 238'] },
  bismutoOverpull:      { packageIds: ['ABAN 238'] },
  fcbaCorteDens:           { packageIds: ['ABAN 186','ABAN 189','ABAN 190','ABAN 235','ABAN 236'] },
  adaptadorMc:             { packageIds: ['ABAN 013'] },
  pressaoCabecaLimite:     { packageIds: ['ABAN 061','ABAN 062'] },
  gabaritoNippleDiam:      { packageIds: ['ABAN 079'] },
  tampaoTipo:              { packageIds: ['ABAN 079'] },
  cimentAnularAcimaTampao: { packageIds: ['ABAN 082','ABAN 084'] },
  cimentTopoRevcim:        { packageIds: ['ABAN 247','ABAN 248'] },
  canhaoModelo:            { packageIds: ['ABAN 102'] },
  plugFtDiam:              { packageIds: ['ABAN 129'] },
  plugFtAplicador:         { packageIds: ['ABAN 129'] },
  ferramentaBoDuplaDiam:   { packageIds: ['ABAN 144','ABAN 145'] },
  overpullKlbf:            { packageIds: ['ABAN 186'] },
  copCoiTubo:              { packageIds: ['ABAN 188','ABAN 189','ABAN 190'] },
  revestimentoDiam:        { packageIds: ['ABAN 196'] },
  tampaoAbandonoDens:      { packageIds: ['ABAN 199','ABAN 200'] },
  tampaoAbandonoTopo:      { packageIds: ['ABAN 199','ABAN 200'] },
  tampaoAbandonoCompr:     { packageIds: ['ABAN 199','ABAN 200'] },
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
          if (gab.diamLocalizador != null && (cur.diamLocalizador ?? '') !== gab.diamLocalizador) upd.diamLocalizador = gab.diamLocalizador
          if (gab.diamEstampador != null && (cur.diamEstampador ?? '') !== gab.diamEstampador) upd.diamEstampador = gab.diamEstampador
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
        return !!gab && ((gab.diamLocalizador != null && (c.diamLocalizador ?? '') !== gab.diamLocalizador)
          || (gab.diamEstampador != null && (c.diamEstampador ?? '') !== gab.diamEstampador)
          || (gab.profFinal != null && (c.profFinal ?? '') !== gab.profFinal))
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
      const topPwcProfChanged = ['cimentTopoAnularA','cimentTopoInteriorColuna','cimentTopoRevcim','cimentPwc','cimentProfPerfuracao','cimentProfBaseCimentacao','cimentCrProfundidade',
        'cimentAlinhamento','cimentPlugVol','cimentPlugDens','cimentFcbaDens']
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
  const setOutros      = setter('outros')
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

  return (
    <LocateCtx.Provider value={{ onLocate, onClear: onClearLocate, active: locatedTarget ?? null }}>
    <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-400 uppercase tracking-widest">
          Assistente de Preenchimento
        </span>
        {onMinimize && (
          <button
            onClick={onMinimize}
            title="Minimizar assistente"
            className="shrink-0 -mr-1 p-1 rounded text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* Confirmar alterações — linhas em revisão após "Aplicar" */}
      {reviewTotal > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <span className="text-slate-700 text-[10px]">●</span>
          {oneByOneMode ? (
            <>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold flex-1 min-w-0">
                Revisando {reviewTotal} {reviewTotal === 1 ? 'item restante' : 'itens restantes'}
              </span>
              <button
                onClick={() => currentReviewLineId && dispatch({ type: 'PROJECT_REVIEW_CONFIRM_ONE', uid: currentReviewLineId })}
                className="shrink-0 text-xs font-semibold text-white bg-slate-700 dark:bg-slate-600 hover:bg-slate-800 dark:hover:bg-slate-500 rounded px-2 py-0.5 transition-colors">
                Confirmar este
              </button>
              <button
                onClick={() => { dispatch({ type: 'PROJECT_CLEAR_REVIEW' }); setOneByOneMode?.(false) }}
                className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                Confirmar todas
              </button>
              <button
                onClick={() => { dispatch({ type: 'PROJECT_REVERT_REVIEW' }); setOneByOneMode?.(false) }}
                title="Cancela as alterações aplicadas e em revisão"
                className="shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                Sair
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-slate-700 dark:text-slate-300 font-semibold flex-1 min-w-0">
                {reviewTotal} {reviewTotal === 1 ? 'item aguardando revisão' : 'itens aguardando revisão'}
              </span>
              <button
                onClick={() => setOneByOneMode?.(true)}
                className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                Revisar 1 por 1
              </button>
              <button
                onClick={() => dispatch({ type: 'PROJECT_CLEAR_REVIEW' })}
                className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-300 dark:border-slate-700 rounded px-2 py-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
                Confirmar todas
              </button>
            </>
          )}
        </div>
      )}

      {/* Scrollable body */}
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
            <Section title="Nipples" defaultOpen={false} accent="border-l-amber-500 dark:border-l-amber-400"
              isDirty={dirty['nipples']} onApply={applySection('nipples')} onDiscard={discardSection('nipples')} canApply={sectionAffectsLines('nipples')}>
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
        <Section title="Navegação" accent="border-l-sky-400 dark:border-l-sky-500"
          isDirty={dirty['sonda']} onApply={applySection('sonda')} onDiscard={discardSection('sonda')} canApply={sectionAffectsLines('sonda')}>
          <Field label="Poço origem"            value={d.pocoOrigem}           onChange={v => setSonda({ pocoOrigem: v })} locate={{ kind: 'data', field: 'pocoOrigem' }} />
          <Field label="Poço destino"           value={d.poco}                 onChange={v => setSonda({ poco: v })} locate={{ kind: 'data', field: 'poco' }} />
          <Field label="Distância entre poços"  value={d.distanciaEntrePocos}  onChange={v => setSonda({ distanciaEntrePocos: v })} unit="NM" locate={{ kind: 'data', field: 'distanciaEntrePocos' }} />
          <Field label="Velocidade média"       value={d.velocidadeMedia}      onChange={v => setSonda({ velocidadeMedia: v })} unit="nós" locate={{ kind: 'data', field: 'velocidadeMedia' }} />
        </Section>

        {/* ── Equipamentos Submarinos ── */}
        {(() => {
          const hasTcap    = hasPkgFn('ABAN 018')
          const hasAnm     = hasPkgFn('ABAN 023')
          const hasN2Flow  = hasPkgFn('ABAN 016')
          // Movidos da seção Pressões (testes de interface / ANM)
          const showFibop  = hasPkgFn('ABAN 011','ABAN 012','ABAN 211','ABAN 212')
          const showHcr    = hasPkgFn('ABAN 011','ABAN 211','ABAN 212')
          const showBore   = hasPkgFn('ABAN 013','ABAN 206')
          const showRiserDB = hasPkgFn('ABAN 012')
          const showColDpr = hasPkgFn('ABAN 014')
          const showColRiserDb = hasPkgFn('ABAN 015')
          const showN2Trt  = hasPkgFn('ABAN 024','ABAN 025')
          const showTmfA   = hasPkgFn('ABAN 027','ABAN 028','ABAN 029')
          const showDrain  = hasPkgFn('ABAN 218')
          // Movido da seção Pressões (LC DHSV)
          const showBhDhsv = hasPkgFn('ABAN 030')
          if (!hasTcap && !hasAnm && !hasN2Flow && !showFibop && !showHcr && !showBore && !showRiserDB && !showColDpr && !showColRiserDb && !showN2Trt && !showTmfA && !showDrain && !showBhDhsv) return null
          const setEquip = setter('equipamentos_submarinos')
          // Campos ordenados conforme a cronologia do cronograma (1ª ocorrência do pacote)
          const entries: { ord: number; node: React.ReactNode }[] = []
          const push = (show: boolean, pkgs: string[], node: React.ReactNode) => {
            if (show) entries.push({ ord: pkgOrderOf(...pkgs), node })
          }
          push(hasTcap,   ['ABAN 018'], <Field key="trtTcap" label="Peso liberado com TRT sobre Tree Cap (ABAN 018)" value={d.outrosTrtWeightTcap} onChange={v => setEquip({ outrosTrtWeightTcap: v })} unit="klbf" locate={{ kind: 'data', field: 'outrosTrtWeightTcap' }} />)
          push(hasAnm,    ['ABAN 023'], <Field key="trtAnm" label="Peso liberado com TRT na ANM (ABAN 023)" value={d.outrosTrtWeightAnm} onChange={v => setEquip({ outrosTrtWeightAnm: v })} unit="klbf" locate={{ kind: 'data', field: 'outrosTrtWeightAnm' }} />)
          push(hasN2Flow, ['ABAN 016'], <Field key="n2Flow" label="Vazão N₂ desalagar DPR/HCR" value={d.outrosN2FlowScfm} onChange={v => setEquip({ outrosN2FlowScfm: v })} unit="scf/min" locate={{ kind: 'data', field: 'outrosN2FlowScfm' }} />)
          push(showFibop, ['ABAN 011','ABAN 012','ABAN 211','ABAN 212'], <Field key="cavFibop" label="Cavidade FIBOP/FDR" value={d.pressaoCavFibop} onChange={v => setEquip({ pressaoCavFibop: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoCavFibop' }} />)
          push(showHcr,   ['ABAN 011','ABAN 211','ABAN 212'], <Field key="hcr" label="HCR — estanqueidade (AGMAR)" value={d.pressaoHcr} onChange={v => setEquip({ pressaoHcr: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoHcr' }} />)
          push(showBore,  ['ABAN 013','ABAN 206'], <Field key="boreTest" label='Teste bore 2"/4" e CWO' value={d.pressaoBoreTest} onChange={v => setEquip({ pressaoBoreTest: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoBoreTest' }} />)
          push(showRiserDB, ['ABAN 012'], <Field key="riserBores" label='Riser DB — teste dos bores 4"/2"' value={d.pressaoRiserBores} onChange={v => setEquip({ pressaoRiserBores: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoRiserBores' }} />)
          push(showRiserDB, ['ABAN 012'], <Field key="riserCavConexao" label='Riser DB — cavidade de conexão (descida)' value={d.pressaoRiserCavConexao} onChange={v => setEquip({ pressaoRiserCavConexao: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoRiserCavConexao' }} />)
          push(showColDpr, ['ABAN 014'], <Field key="colDpr" label="Teste de estanqueidade da coluna de DPR" value={d.pressaoColunaDpr} onChange={v => setEquip({ pressaoColunaDpr: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoColunaDpr' }} />)
          push(showColRiserDb, ['ABAN 015'], <Field key="colRiserDb" label="Teste de estanqueidade da coluna de riser DB" value={d.pressaoColunaRiserDb} onChange={v => setEquip({ pressaoColunaRiserDb: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoColunaRiserDb' }} />)
          push(showTmfA,  ['ABAN 027','ABAN 028','ABAN 029'], <Field key="tmfAnulAnm" label="Blocos ANM" value={d.pressaoTmfAnulAnm} onChange={v => setEquip({ pressaoTmfAnulAnm: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoTmfAnulAnm' }} />)
          push(showDrain, ['ABAN 218'], <Field key="drainB2" label='Pressão drenagem B2" equalização via ANM' value={d.outrosDrainB2Psi} onChange={v => setEquip({ outrosDrainB2Psi: v })} unit="psi" locate={{ kind: 'data', field: 'outrosDrainB2Psi' }} />)
          push(showN2Trt, ['ABAN 024','ABAN 025'], <Field key="n2Trt" label="N₂ interface TRT × ANM" value={d.pressaoN2Trt} onChange={v => setEquip({ pressaoN2Trt: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoN2Trt' }} />)
          push(showBhDhsv, ['ABAN 030'], <Field key="lcDhsv" label="Pressão LC DHSV" value={d.pressaoBullheadDhsv} onChange={v => setEquip({ pressaoBullheadDhsv: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoBullheadDhsv' }} />)
          entries.sort((a, b) => a.ord - b.ord)
          return (
            <Section title="Equipamentos Submarinos" accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty['equipamentos_submarinos']} onApply={applySection('equipamentos_submarinos')} onDiscard={discardSection('equipamentos_submarinos')} canApply={sectionAffectsLines('equipamentos_submarinos')}>
              {entries.map(e => e.node)}
            </Section>
          )
        })()}

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
          push(showRiser,      ['ABAN 014','ABAN 015','ABAN 016','ABAN 017','ABAN 206','ABAN 244'], <Field key="riserDpr" label="Teste de linhas de superfície e manifold auxiliar" value={d.pressaoRiserDpr} onChange={v => setEquipSup({ pressaoRiserDpr: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoRiserDpr' }} />)
          push(showBopAr,      [...SLWLFT_HIGH_PKG_IDS], <Field key="bopArame" label="Teste alta equipamentos de pressão (SL, WL e FT)" value={d.pressaoBopArameHigh} onChange={v => setEquipSup({ pressaoBopArameHigh: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoBopArameHigh' }} />)
          entries.sort((a, b) => a.ord - b.ord)
          return (
            <Section title="Equipamentos de Superfície" accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty['equipamentos_superficie']} onApply={applySection('equipamentos_superficie')} onDiscard={discardSection('equipamentos_superficie')} canApply={sectionAffectsLines('equipamentos_superficie')}>
              {entries.map(e => e.node)}
            </Section>
          )
        })()}

        {/* ── Testes ESCP ── */}
        {(() => {
            const showBop     = hasPkgFn('ABAN 184')
            const showBopPerf = hasPkgFn('ABAN 228','ABAN 229')
            if (!showBop && !showBopPerf) return null
            return (
              <Section title="Testes ESCP" accent="border-l-sky-400 dark:border-l-sky-500"
                isDirty={dirty['testes_escp']} onApply={applySection('testes_escp')} onDiscard={discardSection('testes_escp')} canApply={sectionAffectsLines('testes_escp')}>
                {(showBop || showBopPerf) && <Field label="MAPECAB" value={d.mapecab} onChange={v => {
                  const upd: Partial<import('../types').ProjectData> = { mapecab: v }
                  if (!d.pressaoKillChoke    || d.pressaoKillChoke    === d.mapecab) { upd.pressaoKillChoke = v; upd.pressaoEquipSupBop = v }
                  if (!d.pressaoBopPerfuracao || d.pressaoBopPerfuracao === d.mapecab) upd.pressaoBopPerfuracao = v
                  setTestesEscp(upd)
                }} unit="psi" locate={{ kind: 'data', field: 'mapecab' }} />}
                {showBop && <Field label="Equipamentos de superfície e linhas de kill e choke" value={d.pressaoKillChoke} onChange={v => setTestesEscp({ pressaoKillChoke: v, pressaoEquipSupBop: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoKillChoke' }} />}
                {showBop && <Field label="Teste anel VGX do BOP × CSB (menor entre MAPECAB e limite equipamento/poço/CSB)" value={d.pressaoVgx} onChange={v => setTestesEscp({ pressaoVgx: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoVgx' }} />}
                {showBopPerf && <Field label="Teste do BOP" value={d.pressaoBopPerfuracao} onChange={v => setTestesEscp({ pressaoBopPerfuracao: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoBopPerfuracao' }} />}
              </Section>
            )
        })()}

        {/* ── Retirada de Coluna ── */}
        {state.fineTuningItems.some(i => !i.isBlank && ['ABAN 188','ABAN 189','ABAN 190'].includes(i.packageId)) && (
          <Section title="Retirada de Coluna" accent="border-l-sky-400 dark:border-l-sky-500"
            isDirty={dirty['retirada_coluna']} onApply={applySection('retirada_coluna')} onDiscard={discardSection('retirada_coluna')} canApply={sectionAffectsLines('retirada_coluna')}>
            <Field label="Ø/ident. tubo COP/COI (retirada)" value={d.copCoiTubo} onChange={v => setRetirada({ copCoiTubo: v })} locate={{ kind: 'data', field: 'copCoiTubo' }} />
          </Section>
        )}

        {/* ── Fluidos ── */}
        {(() => {
          const showFcba = hasPkgFn('ABAN 061','ABAN 062','ABAN 063')
          const showLimPcab = hasPkgFn('ABAN 061','ABAN 062')
          return (
            <Section title="Fluidos" accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty['fluidos']} onApply={applySection('fluidos')} onDiscard={discardSection('fluidos')} canApply={sectionAffectsLines('fluidos')}>
              <Field label="Limite P. bombeio" value={d.limitePressaoBombeio} onChange={v => setFluidos({ limitePressaoBombeio: v })} unit="psi" locate={{ kind: 'data', field: 'limitePressaoBombeio' }} />
              {showFcba && <Field label="Densidade FCBA/MEG amortecimento" value={d.amortFcbaDensidade} onChange={v => setFluidos({ amortFcbaDensidade: v })} unit="ppg" locate={{ kind: 'data', field: 'amortFcbaDensidade' }} />}
              {showLimPcab && <Field label="Limite pressão de cabeça (bullheading)" value={d.pressaoCabecaLimite} onChange={v => setFluidos({ pressaoCabecaLimite: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoCabecaLimite' }} />}
              {hasPkgFn('ABAN 030','ABAN 062') && <Field label="Volume diesel/MEG bullheading" value={d.bullheadVolume} onChange={v => setFluidos({ bullheadVolume: v })} unit="bbl" locate={{ kind: 'data', field: 'bullheadVolume' }} />}
              {hasPkgFn('ABAN 186','ABAN 189','ABAN 190','ABAN 235','ABAN 236') && <Field label="Densidade FCBA (corte/substituição)" value={d.fcbaCorteDens} onChange={v => setFluidos({ fcbaCorteDens: v })} unit="ppg" locate={{ kind: 'data', field: 'fcbaCorteDens' }} />}
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
            <Section key={tech} title={BHA_TECH[tech]!} accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty[sid]} onApply={applySection(sid)} onDiscard={discardSection(sid)} canApply={sectionAffectsLines(sid)}>
              {tech === 'workstring' && hasPkgFn('ABAN 013','ABAN 182','ABAN 185','ABAN 189','ABAN 190','ABAN 191','ABAN 192','ABAN 193','ABAN 194','ABAN 195','ABAN 196','ABAN 197','ABAN 198','ABAN 199','ABAN 200','ABAN 202','ABAN 233') && <Field label="Ø coluna de trabalho DP (COT DP)" value={d.colunaTrabalhoDpDiam} onChange={v => setBhasTech({ colunaTrabalhoDpDiam: v })} unit='"' locate={{ kind: 'data', field: 'colunaTrabalhoDpDiam' }} />}
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
                            const itemCollapsed = collapsedBhaItems.has(item.uid)
                            const hasSubItems = isPerf || isCorte || isGabarit || isTae || isJateam || isCamis || isTocPolias || isFtGabaritMotorBroca || isArameInstRet || isStroker || isAvalCimentacao || isRetPlugThCt || isFtPlugProf || isBpInstFt || isBpInst || isCimentIntCopFt || isCimentCr || isVgl || isPwc || isCondicionamento || isCacambeio || isSlidingSleeve
                            const copyFromPrevious = () => {
                              if (!previousUid) return
                              const prev = d.bhaPlans?.[previousUid] ?? {}
                              setBhasTech({ bhaPlans: { ...(d.bhaPlans ?? {}), [item.uid]: { ...prev } } })
                            }
                            return (
                              <div key={item.uid} className="py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
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
                                        <Field label="Diâmetro nominal do canhão" value={plan.canhao ?? ''} onChange={v => updatePlan(item.uid, 'canhao', v)} locate={{ kind: 'plan', uid: item.uid, key: 'canhao' }} unit="pol" />
                                        <Field label="TFA mínimo" value={plan.tfaMin ?? ''} onChange={v => updatePlan(item.uid, 'tfaMin', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tfaMin' }} unit="pol²" />
                                      </>
                                    )}
                                    {(isPerf || isCorte) && (
                                      <>
                                        <Field label="Profundidade"     value={plan.prof ?? ''} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        <Field label="Diâmetro do tubo" value={plan.diam ?? ''} onChange={v => updatePlan(item.uid, 'diam', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diam' }} unit="pol" />
                                        {isCorte && <Field label="TFA" value={plan.tfa ?? ''} onChange={v => updatePlan(item.uid, 'tfa', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tfa' }} unit="pol²" />}
                                      </>
                                    )}
                                    {isCorte && (
                                      <Field label="Modelo do cortador" value={plan.cortadorModelo ?? ''} onChange={v => updatePlan(item.uid, 'cortadorModelo', v)} />
                                    )}
                                    {isArameInstRet && !isCamis && (
                                      <>
                                        <Field label='Aplicador/Pescador — nome e Ø (ex: "GS 3\"")' value={plan.modelo ?? ''} onChange={v => updatePlan(item.uid, 'modelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modelo' }} />
                                        {!isPerf && !isCorte && (
                                          <Field label="Profundidade" value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        )}
                                        {/tmf/i.test(name) && (
                                          <Field label="Ø JDC (passo inicial)" value={plan.diamJdc ?? ''} onChange={v => updatePlan(item.uid, 'diamJdc', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamJdc' }} unit="pol" />
                                        )}
                                      </>
                                    )}
                                    {showEstampador && (
                                      <Field label="Ø estampador" value={gab?.diamEstampador ?? plan.diamEstampador ?? ''} readOnly={gab?.diamEstampador != null} onChange={v => updatePlan(item.uid, 'diamEstampador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamEstampador' }} unit="pol" />
                                    )}
                                    {isGabarit && !isFt && (
                                      <Field label="Ø localizador de nipple" value={gab?.diamLocalizador ?? plan.diamLocalizador ?? ''} readOnly={gab?.diamLocalizador != null} onChange={v => updatePlan(item.uid, 'diamLocalizador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamLocalizador' }} unit="pol" />
                                    )}
                                    {isGabarit && item.technology === 'wireline' && (
                                      <Field label="Profundidade final" value={gab?.profFinal ?? plan.profFinal ?? ''} readOnly={gab?.profFinal != null} onChange={v => updatePlan(item.uid, 'profFinal', v)} locate={{ kind: 'plan', uid: item.uid, key: 'profFinal' }} unit="m" />
                                    )}
                                    {isGabarit && isFt && !isFtGabaritMotorBroca && item.packageId !== 'ABAN 124' && (
                                      <Field label="Drift Ring" value={plan.driftRing ?? ''} onChange={v => updatePlan(item.uid, 'driftRing', v)} locate={{ kind: 'plan', uid: item.uid, key: 'driftRing' }} unit="pol" />
                                    )}
                                    {(isFtGabaritMotorBroca || item.packageId === 'ABAN 124') && (
                                      <>
                                        <Field label="Diâmetro do motor de fundo" value={plan.motorFundo ?? ''} onChange={v => updatePlan(item.uid, 'motorFundo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'motorFundo' }} unit="pol" />
                                        <Field label="Diâmetro da broca"          value={plan.broca ?? ''}      onChange={v => updatePlan(item.uid, 'broca', v)}       locate={{ kind: 'plan', uid: item.uid, key: 'broca' }}       unit="pol" />
                                        <Field label="Modelo da broca"            value={plan.modeloBroca ?? ''} onChange={v => updatePlan(item.uid, 'modeloBroca', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modeloBroca' }} />
                                      </>
                                    )}
                                    {isTae && (
                                      <>
                                        <Field label="TAE — Profundidade"          value={plan.taeProf ?? ''}    onChange={v => updatePlan(item.uid, 'taeProf', v)}    locate={{ kind: 'plan', uid: item.uid, key: 'taeProf' }} unit="m" />
                                        <Field label="TAE — Diâmetro nominal"      value={plan.taeDiamNom ?? ''} onChange={v => updatePlan(item.uid, 'taeDiamNom', v)} locate={{ kind: 'plan', uid: item.uid, key: 'taeDiamNom' }} unit="pol" />
                                        <Field label="Ø nominal do tubo (instalação TAE)" value={d.taeTuboDiam} onChange={v => setBhasTech({ taeTuboDiam: v })} unit='"' locate={{ kind: 'data', field: 'taeTuboDiam' }} />
                                        <Field label="Estanqueidade — TAE" value={d.pressaoEstTae} onChange={v => setBhasTech({ pressaoEstTae: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstTae' }} />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Será um Hold Point?</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio"
                                                checked={opt === 'sim' ? d.pressaoEstTaeHp === true : d.pressaoEstTaeHp === false}
                                                onChange={() => setBhasTech({ pressaoEstTaeHp: opt === 'sim' })}
                                                className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {isJateam && !isFt && (
                                      <Field label="Diâmetro do jateador" value={plan.jateadorDiam ?? ''} onChange={v => updatePlan(item.uid, 'jateadorDiam', v)} unit="pol" />
                                    )}
                                    {isJateam && isFt && (
                                      <>
                                        <Field label="Intervalo de jateamento — Topo" value={plan.jateamTopo ?? ''}     onChange={v => updatePlan(item.uid, 'jateamTopo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateamTopo' }} unit="m" />
                                        <Field label="Intervalo de jateamento — Base" value={plan.jateamBase ?? ''}     onChange={v => updatePlan(item.uid, 'jateamBase', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateamBase' }} unit="m" />
                                        <Field label="Quantidade de passadas"         value={plan.jateamPassadas ?? ''} onChange={v => updatePlan(item.uid, 'jateamPassadas', v)} locate={{ kind: 'plan', uid: item.uid, key: 'jateamPassadas' }} />
                                      </>
                                    )}
                                    {isCamis && item.technology === 'wireline' && (
                                      <>
                                        <Field label="Gabaritagem — Ø localizador (collet)" value={plan.diamLocalizador ?? ''} onChange={v => updatePlan(item.uid, 'diamLocalizador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamLocalizador' }} unit="pol" />
                                        <Field label="Gabaritagem — Ø estampador"  value={plan.diamEstampador ?? ''} onChange={v => updatePlan(item.uid, 'diamEstampador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamEstampador' }} unit="pol" />
                                      </>
                                    )}
                                    {isCamis && (
                                      <>
                                        <Field label="Profundidade (DHSV)" value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        <Field label='Instalação/Pescaria — Aplicador (ex: "GS 4"")' value={camFields ? camFields.aplicadorCamisao : (plan.aplicadorCamisao ?? '')} readOnly={camFields != null} onChange={v => updatePlan(item.uid, 'aplicadorCamisao', v)} locate={{ kind: 'plan', uid: item.uid, key: 'aplicadorCamisao' }} />
                                        <Field label="Camisão — Ø nominal" value={camFields ? camFields.camDiamNom : (plan.camDiamNom ?? '')} readOnly={camFields != null} onChange={v => updatePlan(item.uid, 'camDiamNom', v)} locate={{ kind: 'plan', uid: item.uid, key: 'camDiamNom' }} unit="pol" />
                                        <Field label="Camisão — Ø interno" value={plan.camDiamInt ?? ''} onChange={v => updatePlan(item.uid, 'camDiamInt', v)} locate={{ kind: 'plan', uid: item.uid, key: 'camDiamInt' }} unit="pol" />
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
                                            className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 outline-none focus:border-sky-400 dark:focus:border-sky-600 transition-colors">
                                            <option value="permanente">Permanente</option>
                                            <option value="drop-off">Drop-off</option>
                                          </select>
                                        </div>
                                      </>
                                    )}
                                    {isTocPolias && (
                                      <Field label="Ø estampador" value={plan.tocEstampador ?? ''} onChange={v => updatePlan(item.uid, 'tocEstampador', v)} unit="pol" />
                                    )}
                                    {isStroker && (
                                      <>
                                        <Field label="Modelo do aplicador/pescador" value={plan.modelo ?? ''} onChange={v => updatePlan(item.uid, 'modelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modelo' }} />
                                        <Field label="Profundidade" value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                        <Field label="Ponto de ancoragem" value={plan.strokerAncoragem ?? ''} onChange={v => updatePlan(item.uid, 'strokerAncoragem', v)} unit="m" />
                                      </>
                                    )}
                                    {isAvalCimentacao && (
                                      <>
                                        <Field label="Intervalo de interesse — Topo" value={plan.intervaloInteresseTopo ?? ''} onChange={v => updatePlan(item.uid, 'intervaloInteresseTopo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'intervaloInteresseTopo' }} unit="m" />
                                        <Field label="Intervalo de interesse — Base" value={plan.intervaloInteresseBase ?? ''} onChange={v => updatePlan(item.uid, 'intervaloInteresseBase', v)} locate={{ kind: 'plan', uid: item.uid, key: 'intervaloInteresseBase' }} unit="m" />
                                      </>
                                    )}
                                    {isRetPlugThCt && (
                                      <>
                                        <Field label='Aplicador/Pescador — nome e Ø (ex: "GS 4\"")' value={plan.modelo ?? ''} onChange={v => updatePlan(item.uid, 'modelo', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modelo' }} />
                                        <Field label="Profundidade" value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                      </>
                                    )}
                                    {isFtPlugProf && (
                                      <Field label="Profundidade" value={derivedProf ?? plan.prof ?? ''} readOnly={derivedProf != null} onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                    )}
                                    {(isBpInstFt || isBpInst) && (
                                      <>
                                        <Field label="Profundidade" value={plan.bpProf ?? ''} onChange={v => updatePlan(item.uid, 'bpProf', v)} locate={{ kind: 'plan', uid: item.uid, key: 'bpProf' }} unit="m" />
                                        <Field label="Diâmetro do tubo" value={plan.bpDiam ?? ''} onChange={v => updatePlan(item.uid, 'bpDiam', v)} unit="pol" />
                                        {item.technology === 'electric' && (
                                          <Field label="Força de ancoragem BPP" value={plan.bppAncoragemKlbf ?? ''} onChange={v => updatePlan(item.uid, 'bppAncoragemKlbf', v)} locate={{ kind: 'plan', uid: item.uid, key: 'bppAncoragemKlbf' }} unit="klbf" />
                                        )}
                                      </>
                                    )}
                                    {isCimentIntCopFt && (
                                      <Field label="Diâmetro da ogiva" value={plan.ogivaDiam ?? ''} onChange={v => updatePlan(item.uid, 'ogivaDiam', v)} unit="pol" />
                                    )}
                                    {isCimentCr && (
                                      <Field label="Profundidade de assentamento do CR" value={plan.crProf ?? ''} onChange={v => updatePlan(item.uid, 'crProf', v)} unit="m" />
                                    )}
                                    {isVgl && /instala/i.test(name) && (
                                      <div className="flex items-center gap-2 py-0.5">
                                        <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Tipo de VGL</span>
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
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Camisão acoplado</span>
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
                                        <Field label="Canhoneio — Topo"    value={plan.pwcCanhoneioTopo ?? ''} onChange={v => updatePlan(item.uid, 'pwcCanhoneioTopo', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioTopo' }} />
                                        <Field label="Canhoneio — Base"    value={plan.pwcCanhoneioBase ?? ''} onChange={v => updatePlan(item.uid, 'pwcCanhoneioBase', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioBase' }} />
                                        <Field label="Assentamento do ICF" value={plan.pwcIcf ?? ''}            onChange={v => updatePlan(item.uid, 'pwcIcf', v)} unit="m" />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Canhão será recuperado?</span>
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
                                        <Field label="Topo do intervalo"    value={d.condicIntervaloTopo}     onChange={v => setBhasTech({ condicIntervaloTopo: v })} unit="m"   locate={{ kind: 'data', field: 'condicIntervaloTopo' }} />
                                        <Field label="Base do intervalo"    value={d.condicIntervaloBase}     onChange={v => setBhasTech({ condicIntervaloBase: v })} unit="m"   locate={{ kind: 'data', field: 'condicIntervaloBase' }} />
                                        <Field label="Diâmetro da broca"    value={plan.condicBroca ?? ''}    onChange={v => updatePlan(item.uid, 'condicBroca', v)} unit="pol" />
                                        <Field label="Diâmetro do raspador" value={plan.condicRaspador ?? ''} onChange={v => updatePlan(item.uid, 'condicRaspador', v)} unit="pol" />
                                      </>
                                    )}
                                    {isVgl && item.technology === 'wireline' && (
                                      <>
                                        <Field label="Desviador — Tipo/Modelo" value={plan.tipoDesviador ?? ''} onChange={v => updatePlan(item.uid, 'tipoDesviador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'tipoDesviador' }} />
                                        <Field label="Ø JDC"                   value={plan.diamJdc ?? ''}       onChange={v => updatePlan(item.uid, 'diamJdc', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamJdc' }} unit="pol" />
                                      </>
                                    )}
                                    {isCacambeio && (
                                      <Field label="Ø caçamba" value={plan.diamCacamba ?? ''} onChange={v => updatePlan(item.uid, 'diamCacamba', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamCacamba' }} unit="pol" />
                                    )}
                                    {isSlidingSleeve && (
                                      <>
                                        <Field label="Sliding Sleeve — Modelo" value={plan.modeloSlidingSleeve ?? ''} onChange={v => updatePlan(item.uid, 'modeloSlidingSleeve', v)} locate={{ kind: 'plan', uid: item.uid, key: 'modeloSlidingSleeve' }} />
                                        <Field label="Ø localizador (collet)"   value={plan.diamLocalizador ?? ''}    onChange={v => updatePlan(item.uid, 'diamLocalizador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamLocalizador' }} unit="pol" />
                                        <Field label="Ø estampador"             value={plan.diamEstampador ?? ''}     onChange={v => updatePlan(item.uid, 'diamEstampador', v)} locate={{ kind: 'plan', uid: item.uid, key: 'diamEstampador' }} unit="pol" />
                                        <Field label="Profundidade"             value={plan.prof ?? ''}               onChange={v => updatePlan(item.uid, 'prof', v)} locate={{ kind: 'plan', uid: item.uid, key: 'prof' }} unit="m" />
                                      </>
                                    )}
                                    {/* Estanqueidade pós-instalação + HP toggle — STV/Plug (wireline) */}
                                    {item.packageId === 'ABAN 038' && (
                                      <>
                                        <Field label='Estanqueidade — STV nipple R 2,75"' value={d.pressaoEstStvR} onChange={v => setBhasTech({ pressaoEstStvR: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstStvR' }} />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Será um Hold Point?</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={opt === 'sim' ? d.pressaoEstStvRHp === true : d.pressaoEstStvRHp === false} onChange={() => setBhasTech({ pressaoEstStvRHp: opt === 'sim' })} className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 040' && (
                                      <>
                                        <Field label='Estanqueidade — Plug nipple R 2,75"' value={d.pressaoEstPlugR} onChange={v => setBhasTech({ pressaoEstPlugR: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstPlugR' }} />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Será um Hold Point?</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={opt === 'sim' ? d.pressaoEstPlugRHp === true : d.pressaoEstPlugRHp === false} onChange={() => setBhasTech({ pressaoEstPlugRHp: opt === 'sim' })} className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 041' && (
                                      <>
                                        <Field label='Estanqueidade — Plug nipple F 2,81"' value={d.pressaoEstPlugF} onChange={v => setBhasTech({ pressaoEstPlugF: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstPlugF' }} />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Será um Hold Point?</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={opt === 'sim' ? d.pressaoEstPlugFHp === true : d.pressaoEstPlugFHp === false} onChange={() => setBhasTech({ pressaoEstPlugFHp: opt === 'sim' })} className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {item.packageId === 'ABAN 042' && (
                                      <>
                                        <Field label='Estanqueidade — Plug 3,75" no TH' value={d.pressaoEstPlugTH} onChange={v => setBhasTech({ pressaoEstPlugTH: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoEstPlugTH' }} />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Será um Hold Point?</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={opt === 'sim' ? d.pressaoEstPlugTHHp === true : d.pressaoEstPlugTHHp === false} onChange={() => setBhasTech({ pressaoEstPlugTHHp: opt === 'sim' })} className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                    {/* Pcab N₂ — teste de influxo (ABAN 220 / 221) */}
                                    {(item.packageId === 'ABAN 220' || item.packageId === 'ABAN 221') && (
                                      <>
                                        <Field label="Pcab N₂ — teste de influxo (underbalance)" value={d.outrosPcabN2Psi} onChange={v => setBhasTech({ outrosPcabN2Psi: v })} unit="psi" locate={{ kind: 'data', field: 'outrosPcabN2Psi' }} />
                                        <div className="flex items-center gap-2 py-0.5">
                                          <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Será um Hold Point?</span>
                                          {(['sim','nao'] as const).map(opt => (
                                            <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                                              <input type="radio" checked={opt === 'sim' ? d.outrosPcabN2PsiHp === true : d.outrosPcabN2PsiHp === false} onChange={() => setBhasTech({ outrosPcabN2PsiHp: opt === 'sim' })} className="accent-[#0c2340]" />
                                              <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                                            </label>
                                          ))}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        })()}
              {tech === 'wireline' && hasPkgFn('ABAN 079') && <Field label="Ø nipple (gabaritagem)" value={d.gabaritoNippleDiam} onChange={v => setBhasTech({ gabaritoNippleDiam: v })} unit='"' locate={{ kind: 'data', field: 'gabaritoNippleDiam' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 079') && <Field label="Tipo de tampão (plug/TAE/bismuto)" value={d.tampaoTipo} onChange={v => setBhasTech({ tampaoTipo: v })} locate={{ kind: 'data', field: 'tampaoTipo' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 047') && <Field label="Profundidade do registro de pressão" value={d.profRegistroPressao} onChange={v => setBhasTech({ profRegistroPressao: v })} unit="m" locate={{ kind: 'data', field: 'profRegistroPressao' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 047') && <Field label="Quantidade de estações (RP)" value={d.numEstacoesRp} onChange={v => setBhasTech({ numEstacoesRp: v })} locate={{ kind: 'data', field: 'numEstacoesRp' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 238') && <Field label="Tampão bismuto — EUR" value={d.bismutoEur} onChange={v => setBhasTech({ bismutoEur: v })} unit="m" locate={{ kind: 'data', field: 'bismutoEur' }} />}
              {tech === 'wireline' && hasPkgFn('ABAN 238') && <Field label="Tampão bismuto — overpull de liberação" value={d.bismutoOverpull} onChange={v => setBhasTech({ bismutoOverpull: v })} unit="lbf" locate={{ kind: 'data', field: 'bismutoOverpull' }} />}
              {tech === 'electric' && hasPkgFn('ABAN 102') && <Field label="Modelo do canhão" value={d.canhaoModelo} onChange={v => setBhasTech({ canhaoModelo: v })} locate={{ kind: 'data', field: 'canhaoModelo' }} />}
              {tech === 'electric' && hasPkgFn('ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 105','ABAN 106','ABAN 107','ABAN 149','ABAN 231','ABAN 232','ABAN 234') && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Avaliação de cimentação / topo será Hold Point (REVCIM)?</span>
                  {(['sim','nao'] as const).map(opt => (
                    <label key={opt} className="flex items-center gap-1 cursor-pointer select-none">
                      <input type="radio" checked={opt === 'sim' ? d.revcimHp === true : d.revcimHp === false} onChange={() => setBhasTech({ revcimHp: opt === 'sim' })} className="accent-[#0c2340]" />
                      <span className="text-xs text-slate-600 dark:text-slate-400">{opt === 'sim' ? 'Sim' : 'Não'}</span>
                    </label>
                  ))}
                </div>
              )}
              {tech === 'ct' && hasPkgFn('ABAN 124','ABAN 125','ABAN 127','ABAN 128','ABAN 129','ABAN 130','ABAN 131','ABAN 132','ABAN 133','ABAN 135') && <Field label="Volume bombeio na descida com FT" value={d.volBombeioDescidaFt} onChange={v => setBhasTech({ volBombeioDescidaFt: v })} unit="bbl/500m" locate={{ kind: 'data', field: 'volBombeioDescidaFt' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 159','ABAN 164') && <Field label="Ø Packer FT (inflável/multiset)" value={d.packerFtDiam} onChange={v => setBhasTech({ packerFtDiam: v })} unit='"' locate={{ kind: 'data', field: 'packerFtDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 129') && <Field label="Ø plug FT (TH)" value={d.plugFtDiam} onChange={v => setBhasTech({ plugFtDiam: v })} unit='"' locate={{ kind: 'data', field: 'plugFtDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 129') && <Field label="Aplicador do plug FT" value={d.plugFtAplicador} onChange={v => setBhasTech({ plugFtAplicador: v })} locate={{ kind: 'data', field: 'plugFtAplicador' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 143') && <Field label="Modelo da ponteira (martelete FT)" value={d.marteleteModelo} onChange={v => setBhasTech({ marteleteModelo: v })} locate={{ kind: 'data', field: 'marteleteModelo' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 143') && <Field label="Ø da ponteira (martelete FT)" value={d.marteletePonteiraDiam} onChange={v => setBhasTech({ marteletePonteiraDiam: v })} unit='"' locate={{ kind: 'data', field: 'marteletePonteiraDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 144','ABAN 145') && <Field label="Ø ferramenta BO dupla (FT)" value={d.ferramentaBoDuplaDiam} onChange={v => setBhasTech({ ferramentaBoDuplaDiam: v })} unit='"' locate={{ kind: 'data', field: 'ferramentaBoDuplaDiam' }} />}
              {tech === 'ct' && hasPkgFn('ABAN 147') && <Field label="Ferramentas do BHA (FT)" value={d.ferramentaBhaFt} onChange={v => setBhasTech({ ferramentaBhaFt: v })} locate={{ kind: 'data', field: 'ferramentaBhaFt' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 013') && <Field label="Adaptador MC (interface COT)" value={d.adaptadorMc} onChange={v => setBhasTech({ adaptadorMc: v })} locate={{ kind: 'data', field: 'adaptadorMc' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 186') && <Field label="Overpull (retirada COP/COI)" value={d.overpullKlbf} onChange={v => setBhasTech({ overpullKlbf: v })} unit="klbf" locate={{ kind: 'data', field: 'overpullKlbf' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 196') && <Field label="Ø revestimento (manobra)" value={d.revestimentoDiam} onChange={v => setBhasTech({ revestimentoDiam: v })} unit='"' locate={{ kind: 'data', field: 'revestimentoDiam' }} />}
{tech === 'workstring' && hasPkgFn('ABAN 235') && <Field label="Ø broca (corte de cimento)" value={d.corteBrocaDiam} onChange={v => setBhasTech({ corteBrocaDiam: v })} unit='"' locate={{ kind: 'data', field: 'corteBrocaDiam' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 235') && <Field label='Nº seções DC 6¾" (corte)' value={d.corteDcSecoes} onChange={v => setBhasTech({ corteDcSecoes: v })} locate={{ kind: 'data', field: 'corteDcSecoes' }} />}
              {tech === 'workstring' && hasPkgFn('ABAN 235') && <Field label='Nº seções HWDP 5" (corte)' value={d.corteHwdpSecoes} onChange={v => setBhasTech({ corteHwdpSecoes: v })} locate={{ kind: 'data', field: 'corteHwdpSecoes' }} />}
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
            <Section title="Cimentação" accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty['cimentacao']} onApply={applySection('cimentacao')} onDiscard={discardSection('cimentacao')} canApply={sectionAffectsLines('cimentacao')}>
              {showTopoAnularA && (
                <Field label="Topo no anular A" value={d.cimentTopoAnularA} onChange={v => setCimentacao({ cimentTopoAnularA: v })} unit="m" />
              )}
              {bppItems.map(item => {
                const bpProf = d.bhaPlans?.[item.uid]?.bpProf ?? ''
                const bpDiam = d.bhaPlans?.[item.uid]?.bpDiam ?? ''
                return (
                  <div key={item.uid}>
                    <Field label={`${item.packageName} — Profundidade`} value={bpProf} onChange={() => {}} placeholder="preencha em BHA" unit="m" readOnly />
                    <Field label={`${item.packageName} — Diâmetro do tubo`} value={bpDiam} onChange={() => {}} placeholder="preencha em BHA" unit="pol" readOnly />
                  </div>
                )
              })}
              {isThroughTubing ? (
                <>
                  <Field label="Topo no interior da coluna" value={d.cimentTopoInteriorColuna} onChange={v => setCimentacao({ cimentTopoInteriorColuna: v })} unit="m" />
                  <Field
                    label="Profundidade da perfuração da coluna"
                    value={autoPerfProf}
                    onChange={() => {}}
                    placeholder="preencha em BHA"
                    unit="m"
                    readOnly
                  />
                  <Field
                    label="Profundidade da base da cimentação"
                    value={autoBaseProf}
                    onChange={() => {}}
                    placeholder="preencha em BHA"
                    unit="m"
                    readOnly
                  />
                  {cimentItems.some(i => /cimenta.*\bcr\b/i.test(i.packageName)) && (
                    <Field
                      label="Profundidade de assentamento do CR"
                      value={autoCrProf}
                      onChange={() => {}}
                      placeholder="preencha em BHA"
                      unit="m"
                      readOnly
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
              {/* Alinhamento + volumes/densidades de cimentação (ABAN 078-084) */}
              {(() => {
                const showAlign = state.fineTuningItems.some(i =>
                  !i.isBlank && /^ABAN 0(78|79|80|81|82|83|84)$/.test(i.packageId))
                const showVol   = state.fineTuningItems.some(i =>
                  !i.isBlank && /^ABAN 07[89]$/.test(i.packageId))
                if (!showAlign && !showVol) return null
                return (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">Bombeio</div>
                    {showAlign && (
                      <Field
                        label='Alinhamento bombeio ("via xxx > xxx > xxx")'
                        value={d.cimentAlinhamento}
                        onChange={v => setCimentacao({ cimentAlinhamento: v })}
                        placeholder="ex: B4 > COP > Formação"
                        locate={{ kind: 'data', field: 'cimentAlinhamento' }}
                      />
                    )}
                    {showVol && (
                      <>
                        <Field label="Volume tampão de cimento"     value={d.cimentPlugVol}  onChange={v => setCimentacao({ cimentPlugVol: v })}  unit="bbl" locate={{ kind: 'data', field: 'cimentPlugVol' }} />
                        <Field label="Densidade tampão de cimento"  value={d.cimentPlugDens} onChange={v => setCimentacao({ cimentPlugDens: v })} unit="lb/gal" locate={{ kind: 'data', field: 'cimentPlugDens' }} />
                        <Field label="Densidade deslocamento FCBA"  value={d.cimentFcbaDens} onChange={v => setCimentacao({ cimentFcbaDens: v })} unit="lb/gal" locate={{ kind: 'data', field: 'cimentFcbaDens' }} />
                      </>
                    )}
                  </div>
                )
              })()}
              {/* PWC: card editável por item */}
              {pwcItems.map(item => {
                const plan = d.bhaPlans?.[item.uid] ?? {}
                const isPwcAval = item.packageId === 'ABAN 231'
                return (
                  <div key={item.uid} className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1 leading-snug">{item.packageName}</div>
                    <Field label="Canhoneio — Topo" value={plan.pwcCanhoneioTopo ?? ''} onChange={v => updatePwcPlan(item.uid, 'pwcCanhoneioTopo', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioTopo' }} />
                    <Field label="Canhoneio — Base" value={plan.pwcCanhoneioBase ?? ''} onChange={v => updatePwcPlan(item.uid, 'pwcCanhoneioBase', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'pwcCanhoneioBase' }} />
                    <Field label="Assentamento do ICF" value={plan.pwcIcf ?? ''} onChange={v => updatePwcPlan(item.uid, 'pwcIcf', v)} unit="m" />
                    {isPwcAval && (
                      <>
                        <Field label="Intervalo de interesse — Topo" value={plan.intervaloInteresseTopo ?? ''} onChange={v => updatePwcPlan(item.uid, 'intervaloInteresseTopo', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'intervaloInteresseTopo' }} />
                        <Field label="Intervalo de interesse — Base" value={plan.intervaloInteresseBase ?? ''} onChange={v => updatePwcPlan(item.uid, 'intervaloInteresseBase', v)} unit="m" locate={{ kind: 'plan', uid: item.uid, key: 'intervaloInteresseBase' }} />
                      </>
                    )}
                    <div className="flex items-center gap-2 py-0.5">
                      <span className="text-xs text-slate-700 dark:text-slate-400 shrink-0 flex-1">Canhão será recuperado?</span>
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
              {hasPkgFn('ABAN 155','ABAN 156','ABAN 158') && <Field label="Ø CR (Cement Retainer)" value={d.crDiam} onChange={v => setCimentacao({ crDiam: v })} unit='"' locate={{ kind: 'data', field: 'crDiam' }} />}
              {hasPkgFn('ABAN 082','ABAN 084') && <Field label="Topo cimento anular acima do tampão" value={d.cimentAnularAcimaTampao} onChange={v => setCimentacao({ cimentAnularAcimaTampao: v })} unit="m" locate={{ kind: 'data', field: 'cimentAnularAcimaTampao' }} />}
              {hasPkgFn('ABAN 247','ABAN 248') && <Field label="Topo do cimento (REVCIM)" value={d.cimentTopoRevcim} onChange={v => setCimentacao({ cimentTopoRevcim: v })} unit="m" locate={{ kind: 'data', field: 'cimentTopoRevcim' }} />}
              {hasPkgFn('ABAN 199','ABAN 200') && <Field label="Tampão abandono — densidade pasta" value={d.tampaoAbandonoDens} onChange={v => setCimentacao({ tampaoAbandonoDens: v })} unit="ppg" locate={{ kind: 'data', field: 'tampaoAbandonoDens' }} />}
              {hasPkgFn('ABAN 199','ABAN 200') && <Field label="Tampão abandono — topo previsto" value={d.tampaoAbandonoTopo} onChange={v => setCimentacao({ tampaoAbandonoTopo: v })} unit="m" locate={{ kind: 'data', field: 'tampaoAbandonoTopo' }} />}
              {hasPkgFn('ABAN 199','ABAN 200') && <Field label="Tampão abandono — comprimento" value={d.tampaoAbandonoCompr} onChange={v => setCimentacao({ tampaoAbandonoCompr: v })} unit="m" locate={{ kind: 'data', field: 'tampaoAbandonoCompr' }} />}
              {hasPkgFn('ABAN 200') && <Field label="Fluido eCSB (mar aberto) — densidade" value={d.ecsbFluidoDens} onChange={v => setCimentacao({ ecsbFluidoDens: v })} unit="ppg" locate={{ kind: 'data', field: 'ecsbFluidoDens' }} />}
            </Section>
          )
        })()}

        {/* ── Outros ── */}
        {(() => {
          const hasPkg = (...ids: string[]) => state.fineTuningItems.some(i => ids.includes(i.packageId))
          const showMeg      = hasPkg('ABAN 216', 'ABAN 217')
          const showCooling  = hasPkg('ABAN 223', 'ABAN 224')
          const showTmfP     = hasPkg('ABAN 026')
          if (!showMeg && !showCooling && !showTmfP) return null
          return (
            <Section title="Outros" accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty['outros']} onApply={applySection('outros')} onDiscard={discardSection('outros')} canApply={sectionAffectsLines('outros')}>
              {showMeg    && <Field label="Concentração MEG fluido inibido"          value={d.outrosMegConc}       onChange={v => setOutros({ outrosMegConc: v })}        unit="%" locate={{ kind: 'data', field: 'outrosMegConc' }} />}
              {showCooling && <Field label="Vazão circ. resfriamento p/ cimentação" value={d.outrosCoolingFlow}   onChange={v => setOutros({ outrosCoolingFlow: v })}    unit="bpm" locate={{ kind: 'data', field: 'outrosCoolingFlow' }} />}
              {showTmfP   && <Field label="Plug TMF bore produção N₂"               value={d.pressaoTmfProd}      onChange={v => setOutros({ pressaoTmfProd: v })}       unit="psi" locate={{ kind: 'data', field: 'pressaoTmfProd' }} />}
            </Section>
          )
        })()}

        {/* ── Hold Points ── */}
        {(() => {
          const showEstStvR   = hasPkgFn('ABAN 038')
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
          const showRevcimEval = d.revcimHp && hasPkgFn('ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 105','ABAN 106','ABAN 107','ABAN 149')
          const showRevcimTop  = d.revcimHp && hasPkgFn('ABAN 081','ABAN 082','ABAN 083','ABAN 084','ABAN 231','ABAN 232','ABAN 234')
          // Estanqueidade pós-instalação — pressão de prova genérica ({{pressaoProva}}, usada em ~50 pacotes de BHA;
          // também é o fallback dos pressaoEst*). Editável aqui, exibida quando há BHA arame/elétrico/FT no cronograma.
          const showProva = state.fineTuningItems.some(i => ['wireline','electric','ct'].includes(i.technology))
          // Apenas itens marcados como Hold Point (configurado na seção de tecnologia)
          const hpEstItems = [
            { show: showEstStvR   && d.pressaoEstStvRHp,    label: 'Estanqueidade — STV nipple R 2,75"',   value: d.pressaoEstStvR,    field: 'pressaoEstStvR'   as const },
            { show: showEstPlugR  && d.pressaoEstPlugRHp,   label: 'Estanqueidade — Plug nipple R 2,75"',  value: d.pressaoEstPlugR,   field: 'pressaoEstPlugR'  as const },
            { show: showEstPlugF  && d.pressaoEstPlugFHp,   label: 'Estanqueidade — Plug nipple F 2,81"',  value: d.pressaoEstPlugF,   field: 'pressaoEstPlugF'  as const },
            { show: showEstTae    && d.pressaoEstTaeHp,     label: 'Estanqueidade — TAE',                   value: d.pressaoEstTae,     field: 'pressaoEstTae'    as const },
            { show: showEstPlugTH && d.pressaoEstPlugTHHp,  label: 'Estanqueidade — Plug 3,75" no TH',     value: d.pressaoEstPlugTH,  field: 'pressaoEstPlugTH' as const },
            { show: showPcab      && d.outrosPcabN2PsiHp,   label: 'Pcab N₂ — teste de influxo (underbalance)', value: d.outrosPcabN2Psi, field: 'outrosPcabN2Psi' as const },
          ].filter(x => x.show)
          return (
            <Section title="Hold Points" defaultOpen={false} accent="border-l-sky-400 dark:border-l-sky-500"
              isDirty={dirty['holdpoints']} onApply={applySection('holdpoints')} onDiscard={discardSection('holdpoints')} canApply={sectionAffectsLines('holdpoints')}>
              {showEcsBopAny && (
                <div className="pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">ECS/BOP — sempre</div>
                  {showEcsBop184 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Testes de linhas submarinas (JT) — kill/choke/booster/conduítes</LocateRow>}
                  {showEcsBop184 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Teste gavetas cegas e anel VGX do BOP</LocateRow>}
                  {showEcsBop228 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Testes completos do BOP (manobra dedicada com test plug)</LocateRow>}
                  {showEcsBop229 && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - ECS/BOP]' }}>Teste gaveta de tubos inferior e teste completo BOP (modo perfuração)</LocateRow>}
                </div>
              )}
              {(showRevcimEval || showRevcimTop) && (
                <div className="pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">REVCIM</div>
                  {showRevcimEval && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - REVCIM]' }}>Avaliação de cimentação (perfil/perfilagem REVCIM)</LocateRow>}
                  {showRevcimTop  && <LocateRow target={{ kind: 'textMatch', pattern: '[HOLD POINT - REVCIM]' }}>Checagem de topo do cimento</LocateRow>}
                </div>
              )}
              {hpEstItems.length > 0 && (
                <div className="pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 space-y-0">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">Testes de elementos instalados</div>
                  {hpEstItems.map(it => (
                    <Field key={it.field} label={it.label} value={it.value} onChange={() => {}} readOnly unit="psi" locate={{ kind: 'data', field: it.field }} />
                  ))}
                </div>
              )}
              {showProva && (
                <div className="pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-widest mb-1">Estanqueidade pós-instalação</div>
                  <Field label="Pressão de prova (genérica)" value={d.pressaoProva} onChange={v => setHoldpoints({ pressaoProva: v })} unit="psi" locate={{ kind: 'data', field: 'pressaoProva' }} />
                </div>
              )}
              <div className="space-y-1">
                {d.holdPoints.map((pt, i) => (
                  <div key={i} className="py-1 border-b border-slate-100 dark:border-slate-800 last:border-0 flex items-center gap-1 group/hp">
                    <input
                      type="text" value={pt}
                      onChange={e => {
                        const next = [...d.holdPoints]; next[i] = e.target.value
                        setHoldpoints({ holdPoints: next })
                      }}
                      placeholder="Descrever hold point..."
                      className="flex-1 min-w-0 text-xs text-slate-700 dark:text-slate-200 bg-transparent outline-none border-b border-slate-100 dark:border-slate-800 focus:border-blue-300 dark:focus:border-blue-700 transition-colors placeholder:text-slate-500 dark:placeholder:text-slate-600 py-0.5"
                    />
                    <button
                      onClick={() => setHoldpoints({ holdPoints: d.holdPoints.filter((_, j) => j !== i) })}
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-slate-500 dark:text-slate-600 hover:text-red-400 opacity-0 group-hover/hp:opacity-100 transition-all">
                      <X size={10} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setHoldpoints({ holdPoints: [...d.holdPoints, ''] })}
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-400 transition-colors mt-0.5">
                  <Plus size={10} /> Adicionar
                </button>
              </div>
            </Section>
          )
        })()}

      </div>
    </div>
    </LocateCtx.Provider>
  )
}
