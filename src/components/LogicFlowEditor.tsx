/**
 * LogicFlowEditor — editor de fluxograma de lógica baseado em ReactFlow (@xyflow/react).
 *
 * Segunda opção de edição (selecionável no LogicEditorPanel), alternativa ao editor
 * clássico em SVG (LogicGraphPanel). Emite as MESMAS EditActions do clássico — toda a
 * mutação/undo/persistência continua centralizada no LogicEditorPanel — e preserva o
 * vocabulário visual: paletas por seção (gray/blue/amber), losango âmbar de pergunta,
 * estrela de resposta padrão, bandeira de contingência, ícones de condição de emissão,
 * ⟲ "já respondida no escopo" e o painel lateral de ações (ClassicSidePanel).
 *
 * Estrutura visual: cada seção é uma MOLDURA (frame) que delimita seu fluxograma, com o
 * cabeçalho integrado no topo; molduras consecutivas são ligadas por seta (fluxo entre
 * seções). Não há nó de "convergência": os ramos de uma pergunta ligam-se diretamente ao
 * próximo passo (próxima decisão / bloco após convergência), formando o fan-in natural.
 *
 * Extras do modo fluxo: arrastar nós (posições persistidas em _pos via set_node_pos),
 * minimapa, re-layout automático (clear_node_pos), Ctrl+C/Ctrl+V (p_paste_*), Delete.
 */
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Controls, MiniMap, Panel,
  Handle, Position, MarkerType, applyNodeChanges, BaseEdge,
  type Node, type Edge, type NodeProps, type NodeChange, type EdgeProps, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { PiStarFill, PiFlagPennantFill, PiXBold, PiPencilSimpleFill } from 'react-icons/pi'
import type { LSec, LDec, LAns, LSeqEntry, LPkg } from '../data/logicSecs'
import { CONDITION_LABELS } from '../data/logicSecs'
import { resolveScopeSections, getScopeLabel } from '../data/logicOverrideStore'
import {
  PAL, DARK_PAL, type PC, type PEntry,
  ClassicSidePanel, ConditionIcon, qMenuItems, resolveRef, useDark, pkgName,
  type EditAction, type DecRef, type FlowNodeTarget, type MenuItem, type ResolvedPkgList,
} from './LogicGraphPanel'

// ─── Context para editor inline de chip (clique esquerdo) ────────────────────
type ChipEditorCtxValue = {
  nodeId: string
  title?: string
  onTitleChange?: (v: string) => void
  items: MenuItem[]
  pkgs?: ResolvedPkgList
  pkgsRefresh?: () => LPkg[]
  onFlagPkg?: (i: number) => void   // toggle contingência por pacote (só onde suportado)
  onClose: () => void
} | null
const ChipEditorCtx = createContext<ChipEditorCtxValue>(null)

// ─── Constantes de layout (mesmas proporções do clássico) ────────────────────
const AW = 290          // largura do card de resposta e dos chips
const QW = 280          // largura do losango de pergunta (DDW)
const QH = 46           // altura do losango (DH)
const LBLH = 22         // altura da barra de rótulo dos chips
const BPAD = 8          // padding vertical do corpo
const PKG = 44          // altura de uma linha de pacote (código + nome em 2 linhas)
const NOTE = 15         // linha de nota / placeholder "—"
const AG = 16           // vão horizontal entre colunas de resposta
const V_QA = 56         // pergunta → respostas (folga p/ a barra do fan-out)
const V_SUB = 44        // resposta → sub-pergunta
const V_DEC = 58        // vão entre decisões sequenciais / após convergência
const V_AFTER = 34      // vão até um bloco "após convergência" (dec.after)
const V_CONV = 30       // vão do ramo mais fundo até a barra de convergência
const CR = 10           // raio dos cantos arredondados das arestas ortogonais
const FRAME_HEADER = 42 // faixa de cabeçalho da moldura de seção
const FRAME_PAD = 26    // respiro interno da moldura em torno do conteúdo
const SEC_GAP = 128     // vão vertical entre molduras de seção (espaço da seta)

const RIG_TYPE_Q_RE = /^tipo de sonda/i

const tr = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const deepClone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const pal = (dark: boolean, pc: PC): PEntry => (dark ? DARK_PAL : PAL)[pc]
const contingCode = (dark: boolean) => (dark ? '#fb7185' : '#7d1935')

// ─── Alturas estimadas (usadas no layout E fixadas no render → sem drift) ────
// Chips não têm cabeçalho — só pacotes. Altura = padding + linhas de pacote + padding.
const chipH = (n: number) => BPAD + (n > 0 ? n * PKG : NOTE) + BPAD

// Altura só do CARD da resposta (rótulo + nota + pacotes). Os campos seq/after NÃO entram
// aqui — são renderizados como nós autônomos consecutivos abaixo da resposta.
function ansH(a: LAns): number {
  let h = LBLH + BPAD
  if (a.note) h += NOTE + 2
  const n = a.packages?.length ?? 0
  if (n) h += n * PKG
  else if (!a.note) h += NOTE
  h += BPAD
  return h
}
// dec.packages agora é um nó autônomo acima do losango — a altura do nó de pergunta é só QH.

// ─── Larguras de subárvore ────────────────────────────────────────────────────
function colW(a: LAns): number {
  const subs = [...(a.sub ?? []), ...(a.afterSub ?? [])]
  if (!subs.length) return AW
  return Math.max(AW, ...subs.map(decW))
}
function decW(d: LDec): number {
  if (!d.answers.length) return QW
  const row = d.answers.reduce((s, a, i) => s + colW(a) + (i ? AG : 0), 0)
  let w = Math.max(QW, row)
  for (const ad of d.afterDec ?? []) w = Math.max(w, decW(ad))
  return w
}

// ─── Identificação de nós ─────────────────────────────────────────────────────
function refKey(ref: DecRef): string {
  const ae = ref.aeRef ? `|ae${ref.aeRef.afterIdx}.${ref.aeRef.isAfterSub ? 1 : 0}.${ref.aeRef.subIdx}` : ''
  return `${ref.secIdx}|${ref.decIdx}|${ref.adIdx ?? 'x'}|${ref.sub.join('.')}${ae}`
}

// Metadados por nó — resolvidos em tempo de clique/drag a partir do id.
type NodeMeta =
  | { kind: 'sec'; secIdx: number }        // moldura de seção (cabeçalho)
  | { kind: 'sempre'; secIdx: number }     // campo SEMPRE
  | { kind: 'q'; ref: DecRef }
  | { kind: 'decpkg'; ref: DecRef }        // campo de pacotes da decisão (nó acima do losango)
  | { kind: 'a'; ref: DecRef; ansIdx: number }
  | { kind: 'decafter'; ref: DecRef; afterIdx: number }                              // campo dec.after
  | { kind: 'ansfield'; ref: DecRef; ansIdx: number; ftype: 'seq' | 'after'; idx: number } // campo da resposta
  | { kind: 'free' }   // nó sem endereço (aninhado além do DecRef) — somente leitura

// ─── Dados dos nós custom ─────────────────────────────────────────────────────
type QData = {
  dec: LDec; ref: DecRef | null; pc: PC; dark: boolean; hit: boolean
  dup: boolean; pick: boolean; canEdit: boolean; hasDefault: boolean
}
type AData = {
  ans: LAns; ref: DecRef | null; ansIdx: number; pc: PC; dark: boolean; hit: boolean
  canEdit: boolean; label2?: string; secPhase?: string
  onFlagPkg?: (pkgIdx: number) => void
  onStar?: () => void
  onFlag?: () => void
}
type FData = {
  sec: LSec; secIdx: number; pc: PC; dark: boolean; hit: boolean
  width: number; height: number; canEdit: boolean
  expanded?: boolean                            // bloco ref expandido inline
  onClick?: (e: React.MouseEvent) => void       // clique esquerdo (editar rótulo / expandir ref)
  onContext?: (e: React.MouseEvent) => void     // clique direito (menu completo)
  onNameClick?: (e: React.MouseEvent) => void   // clique no nome de um bloco ref (ir ao editor do bloco)
}
type ChipData = {
  label: string; pkgs: LPkg[]; pc: PC; dark: boolean; canEdit: boolean; hit: boolean
  variant: 'sempre' | 'after'; secPhase?: string
  contingency?: boolean
  clickable?: boolean
  onFlag?: () => void
  onFlagPkg?: (i: number) => void
}

// Abreviações OW Fase para exibição compacta ao lado de cada pacote
const PHASE_ABBREV: Record<string, string> = {
  'Fase 0':           'Fase 0',
  'Fase 1A':          'Fase 1A',
  'Fase 1B':          'Fase 1B',
  'Fase 2':           'Fase 2',
  'Extra Abandono':   'Extra',
  'Mobilização':      'Mob.',
  'Desmobilização':   'Desmob.',
}

const PHASE_ORDER = ['Mobilização', 'Fase 0', 'Fase 1A', 'Fase 1B', 'Fase 2', 'Extra Abandono', 'Desmobilização']

function collectSectionPhases(sec: LSec): string[] {
  const phases = new Set<string>()
  const scanPkgs = (pkgs?: LPkg[]) => pkgs?.forEach(p => { if (p.phase) phases.add(p.phase) })
  const scanSeq  = (seq?: LSeqEntry[]) => seq?.forEach(e => { scanPkgs(e.packages); e.sub?.forEach(scanDec); e.afterSub?.forEach(scanDec) })
  function scanDec(dec: LDec) {
    scanPkgs(dec.packages)
    scanSeq(dec.after)
    dec.afterDec?.forEach(scanDec)
    for (const ans of dec.answers) {
      scanPkgs(ans.packages)
      ans.sub?.forEach(scanDec)
      ans.afterSub?.forEach(scanDec)
      scanSeq(ans.seq)
      scanSeq(ans.after)
    }
  }
  scanPkgs(sec.always)
  sec.decisions.forEach(scanDec)
  const explicit = Array.from(phases).sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b))
  // Fases explícitas + fase-padrão da seção, deduplicadas e ordenadas.
  const all = Array.from(new Set([sec.phase, ...explicit]))
    .sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b))
  return all
}

function formatPhases(phases: string[]): string {
  if (phases.length <= 1) return phases[0] ?? ''
  return phases.slice(0, -1).join(', ') + ' e ' + phases[phases.length - 1]
}

// Fases de uma seção para exibição no cabeçalho da moldura. Para seções `ref` (bloco
// incluído por referência), a própria seção fica "vazia" (decisions: []) — o conteúdo real
// vive no escopo referenciado — então as fases precisam ser coletadas de lá, senão o
// cabeçalho mostra só a fase-padrão do placeholder em vez das fases reais do bloco.
function displayPhases(sec: LSec): string[] {
  if (!sec.ref) return collectSectionPhases(sec)
  const refSections = resolveScopeSections(sec.ref.scopeId)
  const phases = new Set<string>()
  refSections.forEach(rs => collectSectionPhases(rs).forEach(ph => phases.add(ph)))
  return Array.from(phases).sort((a, b) => PHASE_ORDER.indexOf(a) - PHASE_ORDER.indexOf(b))
}

// ─── Linha de pacote (mesma anatomia do clássico: código + condição + nome) ──
function PkgRow({ pkg, p, dark, canEdit, secPhase, onFlag }: {
  pkg: LPkg; p: PEntry; dark: boolean; canEdit: boolean; secPhase?: string; onFlag?: () => void
}) {
  const code = pkg.isContingency ? contingCode(dark) : p.code
  const showFlag = canEdit || pkg.isContingency
  return (
    <div className="flex items-start gap-1 px-1.5" style={{ height: PKG }}>
      {showFlag && (
        <button
          className="shrink-0 mt-[3px] nodrag"
          title={pkg.isContingency ? 'Pacote contingencial — clique para remover' : 'Marcar pacote como contingencial'}
          onClick={(e) => { e.stopPropagation(); onFlag?.() }}
          disabled={!onFlag}
          style={{ cursor: onFlag ? 'pointer' : 'default' }}>
          <PiFlagPennantFill size={11} color={pkg.isContingency ? '#f97316' : p.lblT}
            style={{ opacity: pkg.isContingency ? 1 : 0.28 }} />
        </button>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-1">
          <span className="font-mono font-semibold" style={{ fontSize: 9.5, color: code }}>{pkg.id}</span>
          {pkg.condition && <ConditionIcon condition={pkg.condition} size={11} className="shrink-0" />}
          {(pkg.phase ?? secPhase) && (
            <span style={{
              fontSize: 7, fontWeight: 600, color: p.lblT, opacity: 0.6,
              border: `1px solid ${p.ansB}`, borderRadius: 2,
              padding: '0 2px', lineHeight: '11px', display: 'inline-block',
              position: 'relative', top: -1
            }}>{pkg.phase ?? secPhase}</span>
          )}
        </div>
        <div className="truncate" style={{ fontSize: 9, color: p.ansT, opacity: 0.85 }} title={pkgName(pkg)}>
          {pkgName(pkg)}
        </div>
      </div>
    </div>
  )
}

// Campo sem cabeçalho — apenas linhas de pacote dentro de um retângulo.
// A contingência é indicada pela cor da borda (laranja) e pelo flag em cada pacote.
function ChipBody({ pkgs, p, dark, canEdit, clickable, contingency, secPhase, onFlagPkg, height }: {
  pkgs: LPkg[]; p: PEntry; dark: boolean; canEdit: boolean
  clickable?: boolean; contingency?: boolean; secPhase?: string
  onFlagPkg?: (i: number) => void
  height?: number
}) {
  return (
    <div
      className={`rounded overflow-hidden ${clickable ? 'cursor-pointer' : ''}`}
      style={{ background: p.ans, border: `1px solid ${contingency ? '#f97316' : p.ansB}`, height: height ?? chipH(pkgs.length) }}
      title={clickable ? 'Esquerdo: editar pacotes · Direito: mais ações' : undefined}>
      <div style={{ paddingTop: BPAD, paddingBottom: BPAD }}>
        {pkgs.map((pkg, i) => (
          <PkgRow key={i} pkg={pkg} p={p} dark={dark} canEdit={canEdit} secPhase={secPhase} onFlag={onFlagPkg ? () => onFlagPkg(i) : undefined} />
        ))}
        {pkgs.length === 0 && (
          <div className="px-2 italic" style={{ fontSize: 9.5, color: p.empty, height: NOTE }}>—</div>
        )}
      </div>
    </div>
  )
}

const hiddenHandle = { opacity: 0, pointerEvents: 'none' as const, width: 1, height: 1, minWidth: 1, minHeight: 1, border: 'none', background: 'transparent' }

// ─── Nó MOLDURA de seção (delimita o fluxograma + cabeçalho integrado) ──────
function FrameNode({ data }: NodeProps) {
  const d = data as unknown as FData
  const p = pal(d.dark, d.pc)
  const isRef = !!d.sec.ref
  // Fundo tênue da cor da fase + borda na cor da seção. Delimita o fluxograma sem
  // "caixa dura": preenchimento suave, cantos arredondados, header como topo da moldura.
  const bodyBg = d.dark
    ? (d.pc === 'gray' ? 'rgba(51,65,85,0.10)' : d.pc === 'blue' ? 'rgba(49,46,129,0.14)' : 'rgba(120,53,15,0.12)')
    : (d.pc === 'gray' ? 'rgba(148,163,184,0.08)' : d.pc === 'blue' ? 'rgba(99,102,241,0.07)' : 'rgba(217,119,6,0.06)')
  return (
    // pointerEvents:none no wrapper → cliques na área vazia da moldura atravessam para o
    // canvas (pan); só o cabeçalho reativa os eventos (abre o menu da seção).
    <div style={{ width: d.width, height: d.height, pointerEvents: 'none' }}>
      <Handle type="target" position={Position.Top} id="top" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
      <div className="rounded-2xl overflow-hidden h-full flex flex-col"
        style={{
          border: `1.6px ${isRef ? 'dashed' : 'solid'} ${d.hit ? '#d97706' : p.bgB}`,
          background: bodyBg,
          boxShadow: d.dark ? 'inset 0 0 0 1px rgba(255,255,255,0.02)' : 'inset 0 0 0 1px rgba(255,255,255,0.4)',
        }}>
        <div
          className="flex items-center gap-2 px-3 shrink-0"
          style={{ height: FRAME_HEADER, background: p.hdr, color: p.hdrT, pointerEvents: 'auto', cursor: d.canEdit ? 'pointer' : 'default' }}
          title={isRef ? (d.expanded ? 'Esquerdo: recolher visualização · Direito: ações da seção · Nome: abrir bloco' : 'Esquerdo: expandir para visualização · Direito: ações da seção · Nome: abrir bloco') : d.canEdit ? 'Esquerdo: editar rótulo · Direito: ações da seção' : undefined}
          onClick={(e) => d.onClick?.(e)}
          onContextMenu={(e) => { e.preventDefault(); d.onContext?.(e) }}>
          <span className="font-bold uppercase tracking-wide truncate" style={{ fontSize: 11, cursor: isRef ? 'pointer' : undefined, textDecoration: isRef ? 'underline' : undefined, textDecorationStyle: isRef ? 'dotted' : undefined, textUnderlineOffset: isRef ? 2 : undefined }}
            title={isRef ? 'Abrir o editor deste bloco de lógica' : undefined}
            onClick={isRef ? (e) => { e.stopPropagation(); d.onNameClick?.(e) } : undefined}>
            {isRef ? (getScopeLabel(d.sec.ref!.scopeId) ?? d.sec.ref!.label ?? d.sec.label) : d.sec.label}
          </span>
          <span className="shrink-0 rounded px-1.5 py-0.5" style={{ fontSize: 9, border: '1px solid rgba(255,255,255,0.35)' }}>
            {formatPhases(displayPhases(d.sec))}
          </span>
          {!isRef && (
            <span className="ml-auto shrink-0" style={{ fontSize: 9, opacity: 0.7 }}>
              {`${d.sec.decisions.length} pergunta${d.sec.decisions.length !== 1 ? 's' : ''}`}
            </span>
          )}
        </div>
        <div className="flex-1" />
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
    </div>
  )
}

// ─── Linhas de pacote editáveis: flag + botão-de-condição + ↑↓× ──────────────
// Reutilizado tanto no InlinePkgEditor (ChipNode) quanto no AnswerNode inline.
// Layout idêntico ao PkgRow (px-1.5 / items-start / fontes 9.5/9) — apenas adiciona
// controles de edição sem deslocar o conteúdo existente.
function PkgEditRows({ pkgList, p, dark, secPhase, onFlagPkg, onCondition, onPhase, onReorder, onRemove, onAdd }: {
  pkgList: LPkg[]; p: PEntry; dark: boolean; secPhase?: string
  onFlagPkg?: (i: number) => void
  onCondition?: (i: number, condition?: string) => void
  onPhase?: (i: number, phase?: string) => void
  onReorder?: (from: number, to: number) => void
  onRemove: (i: number) => void
  onAdd?: () => void
}) {
  const [editCondIdx, setEditCondIdx] = useState<number | null>(null)
  const [editPhaseIdx, setEditPhaseIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  // paddingBottom só quando não há botão "+" (para que o strip de adição use esse espaço)
  return (
    <div style={{ paddingTop: BPAD, paddingBottom: onAdd ? 0 : BPAD }}>
      {pkgList.map((pkg, i) => (
        // Mesmas classes do PkgRow: items-start gap-1 px-1.5 height:PKG
        <div key={i}
          className="flex items-start gap-1 px-1.5"
          style={{
            height: PKG,
            opacity: dragIdx === i ? 0.35 : 1,
            boxShadow: dragOverIdx === i && dragIdx !== null && dragIdx !== i ? 'inset 0 2px 0 #3b82f6' : undefined,
          }}
          draggable={!!onReorder}
          onDragStart={onReorder ? e => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDragIdx(i) } : undefined}
          onDragOver={onReorder ? e => { e.preventDefault(); e.stopPropagation(); setDragOverIdx(i) } : undefined}
          onDrop={onReorder ? e => { e.preventDefault(); e.stopPropagation(); if (dragIdx !== null && dragIdx !== i) onReorder(dragIdx, i); setDragIdx(null); setDragOverIdx(null) } : undefined}
          onDragEnd={onReorder ? () => { setDragIdx(null); setDragOverIdx(null) } : undefined}
        >
          {/* Grip de drag — visível apenas quando onReorder disponível */}
          {onReorder && (
            <span className="nodrag shrink-0 mt-[3px] select-none"
              style={{ fontSize: 10, color: p.lblT, opacity: 0.35, cursor: 'grab', lineHeight: 1 }}>⠿</span>
          )}
          {/* Bandeira — mesma condição do PkgRow (canEdit→onFlagPkg || isContingency) */}
          {(onFlagPkg || pkg.isContingency) && (
            <button
              className="nodrag shrink-0 mt-[3px]"
              title={pkg.isContingency ? 'Remover marcação de contingência' : 'Marcar pacote como contingencial'}
              disabled={!onFlagPkg}
              style={{ cursor: onFlagPkg ? 'pointer' : 'default' }}
              onClick={e => { e.stopPropagation(); onFlagPkg?.(i) }}>
              <PiFlagPennantFill size={11} color={pkg.isContingency ? '#f97316' : p.lblT}
                style={{ opacity: pkg.isContingency ? 1 : 0.28 }} />
            </button>
          )}

          {/* Conteúdo do pacote: código + badges (condição, fase) + nome */}
          <div className="min-w-0 flex-1 leading-tight">
            {editCondIdx === i && onCondition ? (
              <select
                className="nodrag w-full rounded px-1 outline-none cursor-pointer"
                style={{ fontSize: 9, height: PKG - 6, border: `1px solid #3b82f6`, background: p.ans, color: p.ansT }}
                ref={el => { if (el) { el.focus(); try { (el as HTMLSelectElement & { showPicker(): void }).showPicker() } catch {} } }}
                value={pkg.condition ?? ''}
                onChange={e => { onCondition(i, e.target.value || undefined); setEditCondIdx(null) }}
                onBlur={() => setEditCondIdx(null)}>
                <option value="">— sem condição —</option>
                {Object.entries(CONDITION_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>{lbl}</option>
                ))}
              </select>
            ) : editPhaseIdx === i && onPhase ? (
              <select
                className="nodrag w-full rounded px-1 outline-none cursor-pointer"
                style={{ fontSize: 9, height: PKG - 6, border: `1px solid #a855f7`, background: p.ans, color: p.ansT }}
                ref={el => { if (el) { el.focus(); try { (el as HTMLSelectElement & { showPicker(): void }).showPicker() } catch {} } }}
                value={pkg.phase ?? ''}
                onChange={e => { onPhase(i, e.target.value || undefined); setEditPhaseIdx(null) }}
                onBlur={() => setEditPhaseIdx(null)}>
                <option value="">— sem fase —</option>
                {Object.keys(PHASE_ABBREV).map(ph => (
                  <option key={ph} value={ph}>{ph}</option>
                ))}
              </select>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-semibold"
                    style={{ fontSize: 9.5, color: pkg.isContingency ? contingCode(dark) : p.code }}>
                    {pkg.id}
                  </span>
                  {/* Badge condicional: IF (sem condição) ou ConditionIcon */}
                  {(onCondition || pkg.condition) && (
                    <button
                      className="nodrag shrink-0 flex items-center"
                      title={pkg.condition ? `Condicional: ${CONDITION_LABELS[pkg.condition] ?? pkg.condition} — clique para alterar` : 'Definir condição de emissão'}
                      disabled={!onCondition}
                      style={{ cursor: onCondition ? 'pointer' : 'default' }}
                      onClick={e => { e.stopPropagation(); if (onCondition) setEditCondIdx(i) }}>
                      {pkg.condition
                        ? <ConditionIcon condition={pkg.condition} size={11} className="shrink-0" />
                        : <span style={{
                            fontSize: 7, fontWeight: 800, fontFamily: 'monospace',
                            color: '#3b82f6', letterSpacing: '-0.5px',
                            border: '1px solid rgba(59,130,246,0.55)', borderRadius: 2,
                            padding: '1px 2px 0', lineHeight: 1, display: 'block',
                            opacity: 0.75, position: 'relative', top: -1
                          }}>IF</span>}
                    </button>
                  )}
                  {/* Badge fase OW: sempre visível em modo edição, clicável quando onPhase disponível */}
                  {(onPhase || pkg.phase || secPhase) && (
                    <button
                      className="nodrag shrink-0 flex items-center"
                      title={(pkg.phase ?? secPhase) ? `Fase: ${pkg.phase ?? secPhase} — clique para alterar` : 'Definir fase OW'}
                      disabled={!onPhase}
                      style={{ cursor: onPhase ? 'pointer' : 'default' }}
                      onClick={e => { e.stopPropagation(); if (onPhase) setEditPhaseIdx(i) }}>
                      {(() => {
                        const ph = pkg.phase ?? secPhase
                        return <span style={{
                          fontSize: 7, fontWeight: 600, color: p.lblT, opacity: ph ? 0.6 : 0.35,
                          border: `1px solid ${p.ansB}`, borderRadius: 2,
                          padding: '0 2px', lineHeight: '11px', display: 'inline-block',
                          position: 'relative', top: -1
                        }}>{ph ?? '?'}</span>
                      })()}
                    </button>
                  )}
                </div>
                <div className="truncate" style={{ fontSize: 9, color: p.ansT, opacity: 0.85 }} title={pkgName(pkg)}>
                  {pkgName(pkg)}
                </div>
              </>
            )}
          </div>

          {/* Botão remover */}
          <button className="nodrag shrink-0 w-4 h-4 mt-[3px] flex items-center justify-center rounded hover:bg-red-500/20"
            title="Remover" onClick={e => { e.stopPropagation(); onRemove(i) }}>
            <span style={{ fontSize: 11, color: '#ef4444', lineHeight: 1 }}>×</span>
          </button>
        </div>
      ))}
      {/* Lista vazia: ocupa NOTE+BPAD (= placeholder + padding inferior) */}
      {pkgList.length === 0 && (
        onAdd ? (
          <button className="nodrag w-full flex items-center gap-1 px-2"
            style={{ height: NOTE + BPAD, color: '#3b82f6', fontSize: 9, background: 'transparent', opacity: 0.8 }}
            onClick={e => { e.stopPropagation(); onAdd() }}>
            <span style={{ fontSize: 12, lineHeight: 1 }}>+</span>
            <span>Adicionar pacote</span>
          </button>
        ) : (
          <div className="px-2 italic" style={{ fontSize: 9.5, color: p.empty, height: NOTE }}>—</div>
        )
      )}
      {/* Strip de "adicionar" — substitui o paddingBottom quando há pacotes, mantendo a altura total */}
      {pkgList.length > 0 && onAdd && (
        <button className="nodrag w-full flex items-center justify-center gap-1"
          style={{ height: BPAD, color: '#3b82f6', fontSize: 8, background: 'transparent', opacity: 0.65 }}
          onClick={e => { e.stopPropagation(); onAdd() }}>
          <span style={{ fontSize: 10, lineHeight: 1 }}>+</span>
        </button>
      )}
    </div>
  )
}

// ─── Editor inline de pacotes — sobrepõe o conteúdo do chip em modo edição ────
// Visualmente idêntico ao ChipBody: mesma borda, mesmo fundo, mesmo padding.
// Apenas adiciona os controles de edição (flag, condição, ↑↓×) nas linhas já existentes.
function InlinePkgEditor({ editor, p, dark, contingency, secPhase }: {
  editor: NonNullable<ChipEditorCtxValue>; p: PEntry; dark: boolean; contingency?: boolean; secPhase?: string
}) {
  const pkgList = editor.pkgsRefresh ? editor.pkgsRefresh() : (editor.pkgs?.list ?? [])
  return (
    // Mesma borda e fundo do ChipBody — só o outline externo (no ChipNode) sinaliza seleção
    <div
      className="rounded overflow-hidden"
      style={{ background: p.ans, border: `1px solid ${contingency ? '#f97316' : p.ansB}` }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {editor.pkgs && (
        <PkgEditRows
          pkgList={pkgList}
          p={p}
          dark={dark}
          secPhase={secPhase}
          onFlagPkg={editor.onFlagPkg}
          onCondition={editor.pkgs.onCondition}
          onPhase={editor.pkgs.onPhase}
          onReorder={editor.pkgs.onReorder}
          onRemove={i => editor.pkgs!.onRemove(i)}
          onAdd={editor.pkgs.onAdd}
        />
      )}
    </div>
  )
}

// ─── Nó CAMPO autônomo (SEMPRE da seção; campos "após convergência" da decisão) ─
// Um campo pode conter pacotes e/ou perguntas; as perguntas do campo são renderizadas
// como nós ligados logo abaixo dele (endereçadas via aeRef no modelo).
function ChipNode({ data, id, selected }: NodeProps) {
  const d = data as unknown as ChipData
  const p = pal(d.dark, d.pc)
  const editor = useContext(ChipEditorCtx)
  const isActive = !!editor && editor.nodeId === id

  return (
    <div style={{ width: AW }} className="rounded relative select-none">
      <Handle type="target" position={Position.Top} id="top" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
      <div style={{
        outline: isActive ? '2px solid #3b82f6' : selected ? '2px solid #fbbf24' : d.hit ? '2px solid #d97706' : 'none',
        outlineOffset: 2, borderRadius: 4
      }}>
        {isActive ? (
          <InlinePkgEditor editor={editor} p={p} dark={d.dark} contingency={d.contingency} secPhase={d.secPhase} />
        ) : (
          <ChipBody
            pkgs={d.pkgs} p={p} dark={d.dark} canEdit={d.canEdit}
            clickable={d.clickable} contingency={d.contingency} secPhase={d.secPhase}
            onFlagPkg={d.canEdit ? d.onFlagPkg : undefined}
          />
        )}
      </div>
      {/* Botão fechar — posicionado fora do corpo do chip para não alterar seu layout */}
      {isActive && editor && (
        <button
          className="nodrag absolute z-20 flex items-center justify-center rounded-full"
          style={{ top: -9, right: -9, width: 18, height: 18, background: '#3b82f6', border: '1.5px solid white', cursor: 'pointer' }}
          title="Fechar editor"
          onClick={e => { e.stopPropagation(); editor.onClose() }}>
          <PiXBold size={8} color="white" />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
    </div>
  )
}

// ─── Nó de PERGUNTA (losango, cores do clássico) ─────────────────────────────
function QuestionNode({ data, id, selected }: NodeProps) {
  const d = data as unknown as QData
  const p = pal(d.dark, d.pc)
  const editor = useContext(ChipEditorCtx)
  const isActive = !!editor && editor.nodeId === id
  const isRigQ = RIG_TYPE_Q_RE.test(d.dec.question)
  const qc = isRigQ
    ? { fill: '#0c2340', stroke: '#64748b', text: '#d97706' }
    : d.dark
      ? { fill: '#5c3a13', stroke: '#92400e', text: '#fde9c8' }
      : { fill: '#fde9c0', stroke: '#e7c896', text: '#7c4a13' }
  const dirty = !!d.dec._dirty
  const reuse = !!d.dec.reuseScope
  const reuseFill = d.dark ? '#475569' : '#e2e8f0'
  const reuseText = d.dark ? '#f1f5f9' : '#1e293b'
  const nestedAfterDec = (d.dec.afterDec?.length ?? 0) > 0 && (d.ref ? (d.ref.sub.length > 0 || d.ref.adIdx !== undefined || !!d.ref.aeRef) : true)
  return (
    <div style={{ width: QW }} className="relative select-none">
      <Handle type="target" position={Position.Top} id="top" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
      <div className="relative" style={{ width: QW, height: QH }}>
        <svg width={QW} height={QH} className="absolute inset-0">
          <polygon
            points={`${QW / 2},1 ${QW - 1},${QH / 2} ${QW / 2},${QH - 1} 1,${QH / 2}`}
            fill={dirty ? '#0c2340' : reuse ? reuseFill : qc.fill}
            stroke={isActive ? '#3b82f6' : selected ? '#fbbf24' : d.pick ? '#22c55e' : dirty ? '#3b82f6' : d.hit ? '#d97706' : qc.stroke}
            strokeWidth={isActive || selected || d.pick || dirty || d.hit ? 2.2 : 1.4}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-8 text-center"
          onMouseDown={isActive ? e => e.stopPropagation() : undefined}
          onClick={isActive ? e => e.stopPropagation() : undefined}>
          {isActive && editor?.onTitleChange ? (
            <textarea
              className="nodrag w-full bg-transparent outline-none border-none resize-none text-center font-semibold leading-tight"
              style={{
                fontSize: 10.5, color: dirty ? '#bfdbfe' : reuse ? reuseText : qc.text,
                padding: 0, margin: 0, boxSizing: 'border-box', lineHeight: 1.25,
              }}
              rows={2}
              defaultValue={editor.title ?? d.dec.question}
              placeholder="Texto da pergunta…"
              autoFocus
              onFocus={e => e.currentTarget.select()}
              onBlur={e => editor.onTitleChange!(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); editor.onTitleChange!(e.currentTarget.value); editor.onClose() }
                if (e.key === 'Escape') editor.onClose()
              }}
            />
          ) : (
            <span className="font-semibold leading-tight" style={{ fontSize: 10.5, color: dirty ? '#bfdbfe' : reuse ? reuseText : qc.text }} title={d.dec.question}>
              {tr(d.dec.question || '(sem texto)', 72)}
            </span>
          )}
        </div>
        {!d.hasDefault && !reuse && (
          <span className="absolute -top-2 -left-2 font-bold leading-none"
            style={{ fontSize: 12, color: '#f59e0b' }}
            title="Sem resposta padrão definida">⚠</span>
        )}
        {nestedAfterDec && (
          <span className="absolute -bottom-2 -right-2 rounded px-1 font-semibold"
            style={{ fontSize: 8.5, background: p.lbl, color: p.lblT, border: `1px solid ${p.ansB}` }}
            title="Perguntas após convergência aninhadas (edite no modo clássico)">
            +{d.dec.afterDec!.length} pós-conv.
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
    </div>
  )
}

// ─── Nó de RESPOSTA (card com barra de rótulo, nota, pacotes, chips) ─────────
function AnswerNode({ data, id, selected }: NodeProps) {
  const d = data as unknown as AData
  const a = d.ans
  const p = pal(d.dark, d.pc)
  const act = !!a.active
  const pkgs = a.packages ?? []
  const dirty = !!a._dirty
  const barBg = dirty ? '#1e3a8a' : act ? p.act : p.lbl
  const barTx = dirty ? '#dbeafe' : act ? p.actT : p.lblT
  const editor = useContext(ChipEditorCtx)
  const isActive = !!editor && editor.nodeId === id
  const pkgList = isActive && editor?.pkgsRefresh ? editor.pkgsRefresh() : pkgs

  return (
    <div className="select-none rounded relative"
      style={{
        width: AW,
        background: dirty ? '#0c2340' : p.ans,
        border: `1.2px solid ${isActive ? '#3b82f6' : selected ? '#fbbf24' : dirty ? '#3b82f6' : d.hit ? '#d97706' : p.ansB}`,
        boxShadow: selected ? '0 0 0 3px rgba(251,191,36,0.15)' : '0 1px 5px rgba(0,0,0,0.25)',
      }}>
      <Handle type="target" position={Position.Top} id="top" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />

      {/* Barra de rótulo — em modo edição o texto vira input */}
      <div className="flex items-center gap-1 px-1.5 rounded-t" style={{ height: LBLH, background: barBg, color: barTx }}>
        {d.canEdit && !isActive ? (
          <>
            <button className="nodrag shrink-0" title={a.contingency ? 'Resposta contingencial (clique para desmarcar)' : 'Marcar como contingência'}
              onClick={(e) => { e.stopPropagation(); d.onFlag?.() }}>
              <PiFlagPennantFill size={12} color={a.contingency ? '#f97316' : barTx} style={{ opacity: a.contingency ? 1 : 0.35 }} />
            </button>
            <button className="nodrag shrink-0" title="Marcar como resposta padrão"
              onClick={(e) => { e.stopPropagation(); d.onStar?.() }}>
              <PiStarFill size={12} color={act ? '#facc15' : barTx} style={{ opacity: act ? 1 : 0.35 }} />
            </button>
          </>
        ) : (
          <>
            {a.contingency && <PiFlagPennantFill size={12} color="#f97316" className="shrink-0" />}
            {act && <PiStarFill size={12} color="#facc15" className="shrink-0" />}
          </>
        )}
        {isActive && editor?.onTitleChange ? (
          <input
            className="nodrag flex-1 text-[10.5px] font-semibold bg-transparent outline-none min-w-0"
            style={{ color: barTx }}
            defaultValue={editor.title ?? a.label}
            placeholder="Rótulo da resposta…"
            autoFocus
            onBlur={e => editor.onTitleChange!(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { editor.onTitleChange!(e.currentTarget.value); editor.onClose() }
              if (e.key === 'Escape') editor.onClose()
            }}
          />
        ) : (
          <span className="flex-1 truncate font-semibold" style={{ fontSize: 10.5 }} title={a.label}>
            {a.label}{d.label2 ? ` / ${d.label2}` : ''}
          </span>
        )}
        {a.goto && !isActive && <span className="shrink-0" style={{ fontSize: 9, opacity: 0.75 }} title={`Vai para: ${a.goto}`}>↪</span>}
      </div>

      {/* Corpo: nota + pacotes (com controles inline em modo edição) */}
      <div onMouseDown={isActive ? e => e.stopPropagation() : undefined}
        onClick={isActive ? e => e.stopPropagation() : undefined}
        onContextMenu={isActive ? e => e.preventDefault() : undefined}>
        {a.note && (
          <div className="px-2 italic truncate" style={{ fontSize: 9.5, color: p.noteT, height: NOTE + 2, paddingTop: BPAD }} title={a.note}>{a.note}</div>
        )}
        {isActive && editor ? (
          <PkgEditRows
            pkgList={pkgList}
            p={p}
            dark={d.dark}
            secPhase={d.secPhase}
            onFlagPkg={editor.onFlagPkg}
            onCondition={editor.pkgs?.onCondition}
            onPhase={editor.pkgs?.onPhase}
            onReorder={editor.pkgs?.onReorder}
            onRemove={i => editor.pkgs!.onRemove(i)}
            onAdd={editor.pkgs?.onAdd}
          />
        ) : (
          <div style={{ paddingTop: a.note ? 0 : BPAD, paddingBottom: BPAD }}>
            {pkgs.map((pkg, i) => (
              <PkgRow key={i} pkg={pkg} p={p} dark={d.dark} canEdit={d.canEdit} secPhase={d.secPhase} onFlag={d.canEdit && d.onFlagPkg ? () => d.onFlagPkg!(i) : undefined} />
            ))}
            {pkgs.length === 0 && !a.note && (
              <div className="px-2 italic" style={{ fontSize: 9.5, color: p.empty, height: NOTE }}>—</div>
            )}
          </div>
        )}
      </div>
      {/* Botão fechar — absoluto fora do corpo para não deslocar o conteúdo */}
      {isActive && editor && (
        <button
          className="nodrag absolute z-20 flex items-center justify-center rounded-full"
          style={{ top: -9, right: -9, width: 18, height: 18, background: '#3b82f6', border: '1.5px solid white', cursor: 'pointer' }}
          title="Fechar editor"
          onClick={e => { e.stopPropagation(); editor.onClose() }}>
          <PiXBold size={8} color="white" />
        </button>
      )}
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
    </div>
  )
}

// ─── Nó JUNÇÃO — ponto (quase invisível) onde os ramos de uma pergunta se unem ─
// Ancora as arestas de convergência (entram pelo topo) e o único traço de saída (sai
// pela base). Reproduz o ponto de encontro do fan-in do editor clássico, sem "pill".
const JUNCTION_W = 10
function JunctionNode() {
  return (
    <div style={{ width: JUNCTION_W, height: 1, pointerEvents: 'none' }}>
      <Handle type="target" position={Position.Top} id="top" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" isConnectable={false} style={{ ...hiddenHandle, left: '50%' }} />
    </div>
  )
}

const NODE_TYPES = { framenode: FrameNode, qnode: QuestionNode, anode: AnswerNode, chipnode: ChipNode, junction: JunctionNode }

// ─── Arestas ortogonais (replicam o fan-out/fan-in em "pente" do clássico) ──────
// Constrói um caminho ortogonal (só segmentos H/V) com cantos arredondados.
function orthoPath(pts: [number, number][], r: number): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0][0]},${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1]
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1)
    if (l1 < 0.5 || l2 < 0.5) { d += ` L ${x1},${y1}`; continue }
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const p1x = x1 - ((x1 - x0) / l1) * rr, p1y = y1 - ((y1 - y0) / l1) * rr
    const p2x = x1 + ((x2 - x1) / l2) * rr, p2y = y1 + ((y2 - y1) / l2) * rr
    d += ` L ${p1x},${p1y} Q ${x1},${y1} ${p2x},${p2y}`
  }
  const last = pts[pts.length - 1]
  d += ` L ${last[0]},${last[1]}`
  return d
}

// Fan-out: tronco desce do losango até a barra (junctionY), segue horizontal até a coluna
// da resposta e desce. Todas as arestas irmãs compartilham junctionY → uma única barra.
function DivergeEdge({ sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps) {
  const jY = (data?.junctionY as number | undefined) ?? sourceY + (targetY - sourceY) * 0.45
  const d = orthoPath([[sourceX, sourceY], [sourceX, jY], [targetX, jY], [targetX, targetY]], CR)
  return <BaseEdge path={d} markerEnd={markerEnd} style={style} />
}

// Fan-in: cada ramo desce até targetY (a barra, = topo da junção) e segue horizontal até
// a junção. Como todas compartilham o mesmo targetY e targetX, formam UM traço horizontal.
function ConvergeEdge({ sourceX, sourceY, targetX, targetY, style }: EdgeProps) {
  const d = orthoPath([[sourceX, sourceY], [sourceX, targetY], [targetX, targetY]], CR)
  return <BaseEdge path={d} style={style} />
}

const EDGE_TYPES = { diverge: DivergeEdge, converge: ConvergeEdge }

// ─── Busca ─────────────────────────────────────────────────────────────────────
function decHit(d: LDec, s: string): boolean {
  return d.question.toLowerCase().includes(s) || (d.packages ?? []).some(pk => pk.id.toLowerCase().includes(s) || pkgName(pk).toLowerCase().includes(s))
}
function ansHit(a: LAns, s: string): boolean {
  if (a.label.toLowerCase().includes(s)) return true
  const all = [...(a.packages ?? []), ...(a.seq ?? []).flatMap(e => e.packages ?? []), ...(a.after ?? []).flatMap(e => e.packages ?? [])]
  return all.some(pk => pk.id.toLowerCase().includes(s) || pkgName(pk).toLowerCase().includes(s))
}
function pkgsHit(pkgs: LPkg[] | undefined, s: string): boolean {
  return (pkgs ?? []).some(pk => pk.id.toLowerCase().includes(s) || pkgName(pk).toLowerCase().includes(s))
}

// Clipboard interno (module-level: sobrevive a remounts do editor na sessão).
type ClipDec = Extract<EditAction, { type: 'p_paste_dec' }>['dec']
type ClipAns = Extract<EditAction, { type: 'p_paste_ans' }>['ans']
let _clipboard: { kind: 'dec'; dec: ClipDec } | { kind: 'ans'; ans: ClipAns } | null = null

// ─── Índice de perguntas (idêntico ao clássico) ─────────────────────────────
type IdxSub = { q: string; depth: number; ref: DecRef | null; hasDefault: boolean }
type IdxSection = { secIdx: number; label: string; phase: string; questions: { decIdx: number; question: string; ref: DecRef; subs: IdxSub[]; hasDefault: boolean }[] }

function collectSubQs(dec: LDec, base: DecRef | null, depth = 1, out: IdxSub[] = [], max = 3): IdxSub[] {
  if (depth > max) return out
  dec.answers.forEach((ans, ai) => {
    (ans.sub ?? []).forEach((sub, si) => {
      const r = base ? { ...base, sub: [...base.sub, ai, si] } : null
      out.push({ q: sub.question, depth, ref: r, hasDefault: sub.answers.some(a => a.active) })
      collectSubQs(sub, r, depth + 1, out, max)
    })
    ;(ans.afterSub ?? []).forEach((sub, si) => {
      const r = base ? { ...base, sub: [...base.sub, ai, -(si + 1)] } : null
      out.push({ q: sub.question, depth, ref: r, hasDefault: sub.answers.some(a => a.active) })
      collectSubQs(sub, r, depth + 1, out, max)
    })
  })
  ;(dec.afterDec ?? []).forEach((ad, i) => {
    const r = base && base.sub.length === 0 && base.adIdx === undefined && !base.aeRef ? { ...base, adIdx: i } : null
    out.push({ q: ad.question, depth, ref: r, hasDefault: ad.answers.some(a => a.active) })
    collectSubQs(ad, r, depth + 1, out, max)
  })
  return out
}

function buildQuestionIndex(sections: LSec[]): IdxSection[] {
  return sections.map((sec, secIdx) => ({
    secIdx, label: sec.ref ? (getScopeLabel(sec.ref.scopeId) ?? sec.ref.label ?? sec.label) : sec.label, phase: sec.phase,
    questions: sec.ref ? [] : sec.decisions.map((dec, decIdx) => {
      const ref: DecRef = { secIdx, decIdx, sub: [] }
      return { decIdx, question: dec.question, ref, subs: collectSubQs(dec, ref), hasDefault: dec.answers.some(a => a.active) }
    }),
  }))
}

// Linha do índice — navega até o nó e (em edição) edita o texto da pergunta inline.
function IndexRow({ text, prefix = '', dark, onNav, onCommit, cls, style, warn }: {
  text: string; prefix?: string; dark: boolean; onNav: () => void
  onCommit?: (v: string) => void; cls: string; style?: React.CSSProperties; warn?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(text)
  const commit = () => { setEditing(false); const v = draft.trim(); if (v && v !== text) onCommit?.(v) }
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); e.stopPropagation() }}
        onBlur={commit}
        className={`w-full my-0.5 px-1.5 py-0.5 rounded text-[11px] leading-snug outline-none border ${
          dark ? 'bg-slate-800 border-amber-600 text-slate-100' : 'bg-white border-amber-500 text-slate-800'}`} />
    )
  }
  return (
    <div className="group/idx flex items-center min-w-0">
      <button onClick={onNav} className={`${cls} flex-1 min-w-0 truncate flex items-center gap-1`} style={style} title={text}>
        {warn && <span className="shrink-0 text-amber-500 dark:text-amber-400 font-bold" style={{ fontSize: 10 }} title="Sem resposta padrão definida">⚠</span>}
        <span className="truncate">{prefix}{text || '(sem texto)'}</span>
      </button>
      {onCommit && (
        <button onClick={() => { setDraft(text); setEditing(true) }}
          className={`shrink-0 mr-1.5 p-0.5 rounded opacity-0 group-hover/idx:opacity-100 ${dark ? 'text-slate-500 hover:text-amber-400' : 'text-slate-400 hover:text-amber-600'}`}
          title="Editar texto da pergunta">
          <PiPencilSimpleFill size={11} />
        </button>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export interface LogicFlowEditorHandle {
  reorganize: () => void
}

export const LogicFlowEditor = forwardRef<LogicFlowEditorHandle, {
  sections: LSec[]
  editCb?: (a: EditAction) => void
  pickMode?: boolean
  showIndex?: boolean
  onToggleIndex?: () => void
  showLegend?: boolean
  onToggleLegend?: () => void
}>(function LogicFlowEditor({ sections, editCb, pickMode, showIndex = false, onToggleIndex, showLegend = false }, fwdRef) {
  const dark = useDark()
  const canEdit = !!editCb
  const [search, setSearch] = useState('')
  const [indexWidth, setIndexWidth] = useState(240)
  const resizingIndexRef = useRef(false)
  const onIndexResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    resizingIndexRef.current = true
    const startX = e.clientX
    const startW = indexWidth
    const onMove = (ev: MouseEvent) => {
      if (!resizingIndexRef.current) return
      const w = startW + (ev.clientX - startX)
      setIndexWidth(Math.min(480, Math.max(160, w)))
    }
    const onUp = () => {
      resizingIndexRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [indexWidth])
  const [expandedRefs, setExpandedRefs] = useState<Set<number>>(new Set())
  const [menu, setMenu] = useState<{
    title?: string; items: MenuItem[]; pkgs?: ResolvedPkgList
    pkgsRefresh?: () => LPkg[]  // lê sempre de sectionsRef.current → lista sempre atualizada
    pos?: { x: number; y: number }; onTitleChange?: (v: string) => void
  } | null>(null)
  const [activeChip, setActiveChip] = useState<Omit<NonNullable<ChipEditorCtxValue>, 'onClose'> | null>(null)
  const closeChip = useCallback(() => setActiveChip(null), [])
  const [nodes, setNodes] = useState<Node[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const metaRef = useRef<Map<string, NodeMeta>>(new Map())
  const selectedRef = useRef<NodeMeta | null>(null)
  const [, setSelTick] = useState(0)
  const didFitRef = useRef(false)
  const rfRef = useRef<ReactFlowInstance | null>(null)
  // Ref sempre atualizado — usada pelos callbacks pkgsRefresh para ler os dados correntes.
  const sectionsRef = useRef(sections)
  sectionsRef.current = sections

  const fire = useCallback((a: EditAction) => editCb?.(a), [editCb])

  useImperativeHandle(fwdRef, () => ({
    reorganize: () => {
      fire({ type: 'clear_node_pos' })
      setTimeout(() => rfRef.current?.fitView({ padding: 0.12, maxZoom: 0.9 }), 120)
    },
  }), [fire])

  // Índice de perguntas (idêntico ao clássico) — navega centralizando o nó no fluxo.
  const questionIndex = useMemo(() => buildQuestionIndex(sections), [sections])
  const navTo = useCallback((ref: DecRef) => {
    const id = `q|${refKey(ref)}`
    const inst = rfRef.current
    if (!inst || !inst.getNode(id)) return
    inst.fitView({ nodes: [{ id }], duration: 400, maxZoom: 0.85, minZoom: 0.5 })
  }, [])

  // Perguntas repetidas no escopo (para o badge ⟲), como no clássico
  const dupQuestions = useMemo(() => {
    const counts = new Map<string, number>()
    const walk = (decs?: LDec[]) => {
      for (const d of decs ?? []) {
        counts.set(d.question.trim(), (counts.get(d.question.trim()) ?? 0) + 1)
        for (const a of d.answers) { walk(a.sub); walk(a.afterSub) }
        walk(d.afterDec)
      }
    }
    for (const s of sections) walk(s.decisions)
    return new Set([...counts].filter(([, n]) => n > 1).map(([q]) => q))
  }, [sections])

  // ── Editor inline de chip (clique ESQUERDO em campos de pacotes) ─────────────
  // Só gerencia pacotes — ações estruturais ficam exclusivamente no clique direito.
  const openChipInline = useCallback((nodeId: string, m: NodeMeta) => {
    if (m.kind === 'q') {
      const dec = resolveRef(sections, m.ref)
      if (!dec) return
      setActiveChip({
        nodeId,
        title: dec.question,
        onTitleChange: (v) => fire({ type: 'p_set_q', ref: m.ref, value: v }),
        items: [],
      })
    } else if (m.kind === 'a') {
      const dec = resolveRef(sections, m.ref)
      const a = dec?.answers[m.ansIdx]
      if (!a) return
      setActiveChip({
        nodeId,
        title: a.label,
        onTitleChange: (v) => fire({ type: 'p_set_ans', ref: m.ref, ansIdx: m.ansIdx, value: v }),
        items: [],
        pkgs: {
          list: a.packages ?? [],
          onAdd: () => fire({ type: 'p_add_pkg', ref: m.ref, ansIdx: m.ansIdx }),
          onMove: (i, dir) => fire({ type: 'p_move_pkg', ref: m.ref, ansIdx: m.ansIdx, pkgIdx: i, dir }),
          onReorder: (from, to) => fire({ type: 'p_reorder_pkg', ref: m.ref, ansIdx: m.ansIdx, from, to }),
          onRemove: (i) => fire({ type: 'p_remove_pkg', ref: m.ref, ansIdx: m.ansIdx, pkgIdx: i }),
          onCondition: (i, condition) => fire({ type: 'p_set_pkg_condition', ref: m.ref, ansIdx: m.ansIdx, pkgIdx: i, condition }),
          onPhase: (i, phase) => fire({ type: 'p_set_pkg_phase', ref: m.ref, ansIdx: m.ansIdx, pkgIdx: i, phase }),
        },
        pkgsRefresh: () => resolveRef(sectionsRef.current, m.ref)?.answers[m.ansIdx]?.packages ?? [],
        onFlagPkg: (i) => fire({ type: 'p_toggle_ans_pkg_contingency', ref: m.ref, ansIdx: m.ansIdx, pkgIdx: i }),
      })
    } else if (m.kind === 'decpkg') {
      const dec = resolveRef(sections, m.ref)
      if (!dec) return
      setActiveChip({
        nodeId,
        items: [],
        pkgs: {
          list: dec.packages ?? [],
          onAdd: () => fire({ type: 'p_add_dec_pkg', ref: m.ref }),
          onMove: (i, dir) => fire({ type: 'p_move_dec_pkg', ref: m.ref, pkgIdx: i, dir }),
          onReorder: (from, to) => fire({ type: 'p_reorder_dec_pkg', ref: m.ref, from, to }),
          onRemove: (i) => fire({ type: 'p_remove_dec_pkg', ref: m.ref, pkgIdx: i }),
          onCondition: (i, condition) => fire({ type: 'p_set_pkg_condition', ref: m.ref, pkgIdx: i, condition }),
          onPhase: (i, phase) => fire({ type: 'p_set_pkg_phase', ref: m.ref, pkgIdx: i, phase }),
        },
        pkgsRefresh: () => resolveRef(sectionsRef.current, m.ref)?.packages ?? [],
      })
    } else if (m.kind === 'sempre') {
      const sec = sections[m.secIdx]
      if (!sec) return
      setActiveChip({
        nodeId,
        items: [],
        pkgs: {
          list: sec.always ?? [],
          onAdd: () => fire({ type: 'add_always', secIdx: m.secIdx }),
          onMove: (i, dir) => fire({ type: 'move_always', secIdx: m.secIdx, pkgIdx: i, dir }),
          onReorder: (from, to) => fire({ type: 'reorder_always', secIdx: m.secIdx, from, to }),
          onRemove: (i) => fire({ type: 'remove_always', secIdx: m.secIdx, pkgIdx: i }),
        },
        pkgsRefresh: () => sectionsRef.current[m.secIdx]?.always ?? [],
      })
    } else if (m.kind === 'decafter') {
      const dec = resolveRef(sections, m.ref)
      const ae = dec?.after?.[m.afterIdx]
      if (!ae) return
      setActiveChip({
        nodeId,
        title: ae.label || 'Após convergência',
        onTitleChange: (v) => fire({ type: 'p_set_dec_after_label', ref: m.ref, afterIdx: m.afterIdx, value: v }),
        items: [],
        pkgs: {
          list: ae.packages ?? [],
          onAdd: () => fire({ type: 'p_dec_add_after_pkg', ref: m.ref, afterIdx: m.afterIdx }),
          onMove: (i, dir) => fire({ type: 'p_dec_move_after_pkg', ref: m.ref, afterIdx: m.afterIdx, pkgIdx: i, dir }),
          onReorder: (from, to) => fire({ type: 'p_dec_reorder_after_pkg', ref: m.ref, afterIdx: m.afterIdx, from, to }),
          onRemove: (i) => fire({ type: 'p_dec_remove_after_pkg', ref: m.ref, afterIdx: m.afterIdx, pkgIdx: i }),
          onCondition: (i, condition) => fire({ type: 'p_set_dec_after_pkg_condition', ref: m.ref, afterIdx: m.afterIdx, pkgIdx: i, condition }),
          onPhase: (i, phase) => fire({ type: 'p_set_dec_after_pkg_phase', ref: m.ref, afterIdx: m.afterIdx, pkgIdx: i, phase }),
        },
        pkgsRefresh: () => resolveRef(sectionsRef.current, m.ref)?.after?.[m.afterIdx]?.packages ?? [],
      })
    } else if (m.kind === 'ansfield') {
      const dec = resolveRef(sections, m.ref)
      const a = dec?.answers[m.ansIdx]
      if (!a) return
      if (m.ftype === 'seq') {
        const se = a.seq?.[m.idx]
        if (!se) return
        setActiveChip({
          nodeId,
          title: se.label || 'Sequencial',
          onTitleChange: (v) => fire({ type: 'p_set_seq_label', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx, value: v }),
          items: [],
          pkgs: {
            list: se.packages ?? [],
            onAdd: () => fire({ type: 'p_add_seq_pkg', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx }),
            onMove: (i, dir) => fire({ type: 'p_move_seq_pkg', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx, pkgIdx: i, dir }),
            onReorder: (from, to) => fire({ type: 'p_reorder_seq_pkg', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx, from, to }),
            onRemove: (i) => fire({ type: 'p_remove_seq_pkg', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx, pkgIdx: i }),
            onCondition: (i, condition) => fire({ type: 'p_set_seq_pkg_condition', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx, pkgIdx: i, condition }),
            onPhase: (i, phase) => fire({ type: 'p_set_seq_pkg_phase', ref: m.ref, ansIdx: m.ansIdx, seqIdx: m.idx, pkgIdx: i, phase }),
          },
          pkgsRefresh: () => resolveRef(sectionsRef.current, m.ref)?.answers[m.ansIdx]?.seq?.[m.idx]?.packages ?? [],
        })
      } else {
        const ae = a.after?.[m.idx]
        if (!ae) return
        setActiveChip({
          nodeId,
          title: ae.label || 'Após convergência',
          onTitleChange: (v) => fire({ type: 'p_set_after_label', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx, value: v }),
          items: [],
          pkgs: {
            list: ae.packages ?? [],
            onAdd: () => fire({ type: 'p_add_after_pkg', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx }),
            onMove: (i, dir) => fire({ type: 'p_move_after_pkg', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx, pkgIdx: i, dir }),
            onReorder: (from, to) => fire({ type: 'p_reorder_after_pkg', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx, from, to }),
            onRemove: (i) => fire({ type: 'p_remove_after_pkg', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx, pkgIdx: i }),
            onCondition: (i, condition) => fire({ type: 'p_set_after_pkg_condition', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx, pkgIdx: i, condition }),
            onPhase: (i, phase) => fire({ type: 'p_set_after_pkg_phase', ref: m.ref, ansIdx: m.ansIdx, afterIdx: m.idx, pkgIdx: i, phase }),
          },
          pkgsRefresh: () => resolveRef(sectionsRef.current, m.ref)?.answers[m.ansIdx]?.after?.[m.idx]?.packages ?? [],
        })
      }
    }
  }, [sections, fire])

  // ── Menu lateral (clique DIREITO) — ações estruturais (inserir/mover/remover/contingência…).
  // Edição do texto da pergunta (clique ESQUERDO) é inline, no próprio losango — ver openChipInline.
  const openQMenu = useCallback((e: React.MouseEvent, ref: DecRef, opts?: { noAddAnswer?: boolean; noTitle?: boolean }) => {
    e.stopPropagation()
    const dec = resolveRef(sections, ref)
    if (!dec) return
    const isFirstInSection = ref.sub.length === 0 && ref.adIdx === undefined && !ref.aeRef && ref.decIdx === 0
    const items: MenuItem[] = qMenuItems(ref, fire, { isFirstInSection, noAddAnswer: opts?.noAddAnswer })
    if (dupQuestions.has(dec.question.trim())) {
      items.splice(2, 0, {
        label: dec.reuseScope ? 'Desmarcar "já respondida no escopo"' : 'Marcar "já respondida no escopo"',
        glyph: '☑', onClick: () => fire({ type: 'p_toggle_reuse', ref }),
      })
    }
    const titleProps = opts?.noTitle ? {} : { title: dec.question, onTitleChange: (v: string) => fire({ type: 'p_set_q', ref, value: v }) }
    setMenu({ ...titleProps, items, pos: { x: e.clientX, y: e.clientY } })
  }, [sections, fire, dupQuestions])

  // Clique esquerdo no campo PACOTES da decisão (nó acima do losango) — sem título.

  const openAMenu = useCallback((e: React.MouseEvent, ref: DecRef, ai: number, mode: 'quick' | 'full') => {
    e.stopPropagation()
    const dec = resolveRef(sections, ref)
    const a = dec?.answers[ai]
    if (!dec || !a) return
    const pkgs = {
      list: a.packages ?? [],
      onAdd: () => fire({ type: 'p_add_pkg', ref, ansIdx: ai }),
      onMove: (i: number, dir: 'up' | 'down') => fire({ type: 'p_move_pkg', ref, ansIdx: ai, pkgIdx: i, dir }),
      onRemove: (i: number) => fire({ type: 'p_remove_pkg', ref, ansIdx: ai, pkgIdx: i }),
      onCondition: (i: number, condition?: string) => fire({ type: 'p_set_pkg_condition', ref, ansIdx: ai, pkgIdx: i, condition }),
    }
    if (mode === 'quick') {
      setMenu({ title: a.label, items: [], pkgs, pkgsRefresh: () => resolveRef(sectionsRef.current, ref)?.answers[ai]?.packages ?? [], pos: { x: e.clientX, y: e.clientY }, onTitleChange: (v) => fire({ type: 'p_set_ans', ref, ansIdx: ai, value: v }) })
      return
    }
    const items: MenuItem[] = [
      { label: 'Inserir sub-pergunta abaixo', glyph: '↓', color: '#22d3ee', onClick: () => fire({ type: 'p_add_aftersub_dec', ref, ansIdx: ai }) },
      { label: 'Adicionar campo após convergência', glyph: '⑂', onClick: () => fire({ type: 'p_dec_add_after', ref, atIdx: 0 }) },
      { label: 'Mover resposta para a esquerda', glyph: '⬅', color: '#94a3b8', onClick: () => fire({ type: 'p_move_ans', ref, ansIdx: ai, dir: 'up' }) },
      { label: 'Mover resposta para a direita', glyph: '➡', color: '#94a3b8', onClick: () => fire({ type: 'p_move_ans', ref, ansIdx: ai, dir: 'down' }) },
      { label: 'Mover pergunta para cá (como sub-pergunta)', glyph: '⤿', color: '#a855f7', onClick: () => fire({ type: 'transfer_target', mode: 'move', ref, ansIdx: ai }) },
      { label: 'Remover resposta', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_ans', ref, ansIdx: ai }) },
    ]
    setMenu({ items, pos: { x: e.clientX, y: e.clientY } })
  }, [sections, fire])

  // Clique esquerdo no campo SEMPRE → lista de pacotes; direito → ações de posicionamento.
  const openSempreMenu = useCallback((e: React.MouseEvent, secIdx: number, mode: 'quick' | 'full' = 'quick') => {
    e.stopPropagation()
    const sec = sections[secIdx]
    if (!sec) return
    const cur = sec.alwaysAfterIdx ?? -1
    const items: MenuItem[] = mode === 'quick' ? [] : [
      { label: 'Inserir pergunta acima deste campo', glyph: '↑', color: '#22d3ee',
        onClick: () => fire({ type: 'ins_near_sempre', secIdx, above: true }) },
      { label: 'Inserir pergunta abaixo deste campo', glyph: '↓', color: '#22d3ee',
        onClick: () => fire({ type: 'ins_near_sempre', secIdx, above: false }) },
      ...(cur > -1 ? [{ label: 'Mover campo acima', glyph: '⬆', color: '#94a3b8' as const,
        onClick: () => fire({ type: 'p_move_sempre_pos', secIdx, dir: 'up' as const }) }] : []),
      ...(cur < sec.decisions.length - 1 ? [{ label: 'Mover campo abaixo', glyph: '⬇', color: '#94a3b8' as const,
        onClick: () => fire({ type: 'p_move_sempre_pos', secIdx, dir: 'down' as const }) }] : []),
    ]
    setMenu({
      title: mode === 'full' ? 'Ações' : undefined,
      items,
      pkgs: {
        list: sec.always ?? [],
        onAdd: () => fire({ type: 'add_always', secIdx }),
        onMove: (i, dir) => fire({ type: 'move_always', secIdx, pkgIdx: i, dir }),
        onRemove: (i) => fire({ type: 'remove_always', secIdx, pkgIdx: i }),
      },
      pkgsRefresh: () => sectionsRef.current[secIdx]?.always ?? [],
      pos: { x: e.clientX, y: e.clientY },
    })
  }, [sections, fire])

  const openSecMenu = useCallback((e: React.MouseEvent, secIdx: number, mode: 'quick' | 'full' = 'full') => {
    e.stopPropagation()
    const sec = sections[secIdx]
    if (!sec) return
    if (mode === 'quick') {
      // Edição do rótulo da seção — clique esquerdo no cabeçalho.
      setMenu({ title: sec.label, items: [], pos: { x: e.clientX, y: e.clientY }, onTitleChange: (v) => fire({ type: 'p_set_section_label', secIdx, value: v }) })
      return
    }
    if (sec.ref) {
      const isExpanded = expandedRefs.has(secIdx)
      const toggleExpand = () => {
        setExpandedRefs(prev => { const n = new Set(prev); n.has(secIdx) ? n.delete(secIdx) : n.add(secIdx); return n })
        setMenu(null)
      }
      setMenu({
        title: getScopeLabel(sec.ref.scopeId) ?? sec.ref.label ?? sec.label,
        items: [
          { label: isExpanded ? 'Recolher visualização' : 'Expandir para visualização', glyph: isExpanded ? '⤡' : '⤢', color: '#22d3ee', onClick: toggleExpand },
          { label: 'Editar bloco (abre o escopo do bloco)', glyph: '◇', color: '#0ea5e9', onClick: () => fire({ type: 'edit_ref_block', scopeId: sec.ref!.scopeId }) },
          { label: 'Desanexar (vira cópia local editável)', glyph: '⧉', color: '#f59e0b', onClick: () => fire({ type: 'detach_ref_section', secIdx }) },
          { label: 'Mover seção acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'move_section', secIdx, dir: 'up' }) },
          { label: 'Mover seção abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'move_section', secIdx, dir: 'down' }) },
          { label: 'Adicionar seção abaixo', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'add_section', afterSecIdx: secIdx }) },
          { label: 'Remover seção', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'remove_section', secIdx }) },
        ],
        pos: { x: e.clientX, y: e.clientY },
      })
      return
    }
    setMenu({
      title: sec.label,
      items: [
        { label: 'Adicionar pergunta (modelos)', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'add_decision', secIdx, afterDecIdx: sec.decisions.length - 1 }) },
        { label: `Alterar fase (${sec.phase})`, glyph: '⤵', color: '#f59e0b', onClick: () => fire({ type: 'edit_section_phase', secIdx, current: sec.phase }) },
        { label: 'Adicionar seção abaixo', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'add_section', afterSecIdx: secIdx }) },
        { label: 'Mover seção acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'move_section', secIdx, dir: 'up' }) },
        { label: 'Mover seção abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'move_section', secIdx, dir: 'down' }) },
        { label: 'Mover pergunta para cá (final da seção)', glyph: '⤿', color: '#a855f7', onClick: () => fire({ type: 'transfer_target_sec', mode: 'move', secIdx }) },
        { label: 'Copiar pergunta para cá (final da seção)', glyph: '⧉', color: '#14b8a6', onClick: () => fire({ type: 'transfer_target_sec', mode: 'copy', secIdx }) },
        { label: 'Remover seção', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'remove_section', secIdx }) },
      ],
      pkgs: {
        list: sec.always ?? [],
        onAdd: () => fire({ type: 'add_always', secIdx }),
        onMove: (i, dir) => fire({ type: 'move_always', secIdx, pkgIdx: i, dir }),
        onRemove: (i) => fire({ type: 'remove_always', secIdx, pkgIdx: i }),
      },
      pos: { x: e.clientX, y: e.clientY },
      onTitleChange: (v) => fire({ type: 'p_set_section_label', secIdx, value: v }),
    })
  }, [sections, fire, expandedRefs, setExpandedRefs])

  // Campo "após convergência" da decisão (dec.after[afterIdx]) — campo autônomo que pode
  // conter pacotes e/ou perguntas (as perguntas do campo aparecem ligadas logo abaixo).
  const openDecAfterChipMenu = useCallback((e: React.MouseEvent, ref: DecRef, afterIdx: number, mode: 'quick' | 'full' = 'full') => {
    e.stopPropagation()
    const dec = resolveRef(sections, ref)
    const ae = dec?.after?.[afterIdx]
    if (!ae) return
    // quick (clique esquerdo) = só a lista de pacotes; full (direito) = ações + pacotes.
    const items: MenuItem[] = mode === 'quick' ? [] : [
      { label: 'Mover campo acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_dec_move_after', ref, afterIdx, dir: 'up' }) },
      { label: 'Mover campo abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_dec_move_after', ref, afterIdx, dir: 'down' }) },
      { label: ae.contingency ? 'Desmarcar contingência do campo' : 'Marcar campo como contingência', glyph: '➕', color: '#f97316', onClick: () => fire({ type: 'p_toggle_dec_after_conting', ref, afterIdx }) },
      { label: 'Remover campo', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_dec_remove_after', ref, afterIdx }) },
    ]
    if (mode === 'full') {
      items.splice(2, 0,
        { label: 'Inserir pergunta acima', glyph: '◇', color: '#22d3ee',
          onClick: () => fire({ type: 'add_dec_after_chip_sub', ref, afterIdx }) },
        { label: 'Inserir pergunta abaixo', glyph: '◇', color: '#22d3ee',
          onClick: () => fire({ type: 'add_dec_after_chip_sub', ref, afterIdx, isAfterSub: true }) },
      )
    }
    setMenu({
      title: mode === 'full' ? 'Ações' : undefined,
      items,
      pkgs: mode === 'quick' ? {
        list: ae.packages ?? [],
        onAdd: () => fire({ type: 'p_dec_add_after_pkg', ref, afterIdx }),
        onMove: (i, dir) => fire({ type: 'p_dec_move_after_pkg', ref, afterIdx, pkgIdx: i, dir }),
        onRemove: (i) => fire({ type: 'p_dec_remove_after_pkg', ref, afterIdx, pkgIdx: i }),
        onCondition: (i, condition) => fire({ type: 'p_set_dec_after_pkg_condition', ref, afterIdx, pkgIdx: i, condition }),
      } : undefined,
      pkgsRefresh: mode === 'quick' ? () => resolveRef(sectionsRef.current, ref)?.after?.[afterIdx]?.packages ?? [] : undefined,
      pos: { x: e.clientX, y: e.clientY },
      onTitleChange: (v) => fire({ type: 'p_set_dec_after_label', ref, afterIdx, value: v }),
    })
  }, [sections, fire])

  // Campos da resposta (a.seq / a.after) — nós autônomos abaixo da resposta.
  const openAnsChipMenu = useCallback((e: React.MouseEvent, ref: DecRef, ai: number, chip: { type: 'seq' | 'after'; idx: number }, mode: 'quick' | 'full' = 'full') => {
    e.stopPropagation()
    const dec = resolveRef(sections, ref)
    const a = dec?.answers[ai]
    if (!a) return
    if (chip.type === 'seq') {
      const se = a.seq?.[chip.idx]
      if (!se) return
      const items: MenuItem[] = mode === 'quick' ? [] : [
        { label: 'Inserir entrada sequencial antes desta', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'p_add_seq', ref, ansIdx: ai, atIdx: chip.idx }) },
        { label: 'Mover acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_move_seq', ref, ansIdx: ai, seqIdx: chip.idx, dir: 'up' }) },
        { label: 'Mover abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_move_seq', ref, ansIdx: ai, seqIdx: chip.idx, dir: 'down' }) },
        { label: se.contingency ? 'Desmarcar contingência do campo' : 'Marcar campo como contingência', glyph: '➕', color: '#f97316', onClick: () => fire({ type: 'p_toggle_ans_seq_conting', ref, ansIdx: ai, seqIdx: chip.idx }) },
        { label: 'Remover entrada', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_seq', ref, ansIdx: ai, seqIdx: chip.idx }) },
      ]
      setMenu({
        title: mode === 'full' ? (se.label || 'Sequencial') : undefined,
        items,
        pkgs: mode === 'quick' ? {
          list: se.packages ?? [],
          onAdd: () => fire({ type: 'p_add_seq_pkg', ref, ansIdx: ai, seqIdx: chip.idx }),
          onMove: (i, dir) => fire({ type: 'p_move_seq_pkg', ref, ansIdx: ai, seqIdx: chip.idx, pkgIdx: i, dir }),
          onRemove: (i) => fire({ type: 'p_remove_seq_pkg', ref, ansIdx: ai, seqIdx: chip.idx, pkgIdx: i }),
          onCondition: (i, condition) => fire({ type: 'p_set_seq_pkg_condition', ref, ansIdx: ai, seqIdx: chip.idx, pkgIdx: i, condition }),
        } : undefined,
        pkgsRefresh: mode === 'quick' ? () => resolveRef(sectionsRef.current, ref)?.answers[ai]?.seq?.[chip.idx]?.packages ?? [] : undefined,
        pos: { x: e.clientX, y: e.clientY },
        onTitleChange: (v) => fire({ type: 'p_set_seq_label', ref, ansIdx: ai, seqIdx: chip.idx, value: v }),
      })
    } else {
      const ae = a.after?.[chip.idx]
      if (!ae) return
      const items: MenuItem[] = mode === 'quick' ? [] : [
        { label: 'Mover acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_move_after', ref, ansIdx: ai, afterIdx: chip.idx, dir: 'up' }) },
        { label: 'Mover abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_move_after', ref, ansIdx: ai, afterIdx: chip.idx, dir: 'down' }) },
        { label: ae.contingency ? 'Desmarcar contingência do campo' : 'Marcar campo como contingência', glyph: '➕', color: '#f97316', onClick: () => fire({ type: 'p_toggle_ans_after_conting', ref, ansIdx: ai, afterIdx: chip.idx }) },
        { label: 'Remover campo', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_after', ref, ansIdx: ai, afterIdx: chip.idx }) },
      ]
      setMenu({
        title: mode === 'full' ? (ae.label || 'Após convergência') : undefined,
        items,
        pkgs: mode === 'quick' ? {
          list: ae.packages ?? [],
          onAdd: () => fire({ type: 'p_add_after_pkg', ref, ansIdx: ai, afterIdx: chip.idx }),
          onMove: (i, dir) => fire({ type: 'p_move_after_pkg', ref, ansIdx: ai, afterIdx: chip.idx, pkgIdx: i, dir }),
          onRemove: (i) => fire({ type: 'p_remove_after_pkg', ref, ansIdx: ai, afterIdx: chip.idx, pkgIdx: i }),
          onCondition: (i, condition) => fire({ type: 'p_set_after_pkg_condition', ref, ansIdx: ai, afterIdx: chip.idx, pkgIdx: i, condition }),
        } : undefined,
        pkgsRefresh: mode === 'quick' ? () => resolveRef(sectionsRef.current, ref)?.answers[ai]?.after?.[chip.idx]?.packages ?? [] : undefined,
        pos: { x: e.clientX, y: e.clientY },
        onTitleChange: (v) => fire({ type: 'p_set_after_label', ref, ansIdx: ai, afterIdx: chip.idx, value: v }),
      })
    }
  }, [sections, fire])

  // ── Layout: recursivo (como o clássico) com override por _pos ──────────────
  // Cada layoutDec devolve { entryId, exitIds, bottom }: entryId = losango da decisão;
  // exitIds = nós-terminais dos ramos (onde o fluxo sai da decisão), usados para ligar ao
  // PRÓXIMO passo (fan-in), dispensando um nó de "convergência".
  const buildGraph = useCallback(() => {
    const ns: Node[] = []
    const frames: Node[] = []
    const es: Edge[] = []
    const meta = new Map<string, NodeMeta>()
    const dims = new Map<string, [number, number]>()
    const s = search.toLowerCase().trim()
    const qByText = new Map<string, string>()
    const gotoLinks: { fromId: string; question: string }[] = []
    const arrColor = dark ? '#64748b' : '#64748b'
    const seen = new Set<string>()

    const push = (node: Node, w: number, h: number, m: NodeMeta) => {
      ns.push(node); dims.set(node.id, [w, h]); meta.set(node.id, m)
    }
    const edge = (src: string, dst: string, opts?: Partial<Edge>) => {
      const id = `e|${src}|${dst}`
      if (seen.has(id)) return
      seen.add(id)
      es.push({
        id, source: src, target: dst, sourceHandle: 'bottom', targetHandle: 'top',
        type: 'smoothstep', pathOptions: { borderRadius: 14 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: arrColor },
        style: { stroke: arrColor, strokeWidth: 1.4 },
        ...opts,
      } as Edge)
    }
    // Fan-out (losango → resposta): todas as arestas irmãs partilham `junctionY` → 1 barra.
    const divergeEdge = (src: string, dst: string, junctionY: number) => {
      const id = `d|${src}|${dst}`
      if (seen.has(id)) return
      seen.add(id)
      es.push({
        id, source: src, target: dst, sourceHandle: 'bottom', targetHandle: 'top',
        type: 'diverge', data: { junctionY },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: arrColor },
        style: { stroke: arrColor, strokeWidth: 1.4 },
      } as Edge)
    }
    // Fan-in (ramo → junção): sem seta; o traço de saída (junção → próximo) leva a seta.
    const convergeEdge = (src: string, dst: string) => {
      const id = `c|${src}|${dst}`
      if (seen.has(id)) return
      seen.add(id)
      es.push({
        id, source: src, target: dst, sourceHandle: 'bottom', targetHandle: 'top',
        type: 'converge', style: { stroke: arrColor, strokeWidth: 1.4 },
      } as Edge)
    }

    function layoutDec(dec: LDec, cx: number, top: number, ref: DecRef | null, pc: PC, key: string, secPhase?: string): { entryId: string; exitIds: string[]; bottom: number } {
      const qid = ref ? `q|${refKey(ref)}` : `qf|${key}`
      const decPkgs = dec.packages ?? []
      const hasPkgChip = decPkgs.length > 0
      const pkgChipId = ref ? `dpkg|${refKey(ref)}` : `dpkgf|${key}`
      const pkgChipH = hasPkgChip ? chipH(decPkgs.length) : 0
      const PKG_GAP = hasPkgChip ? 14 : 0
      const qTop = top + pkgChipH + PKG_GAP

      // Nó de pacotes da decisão — chipnode independente, posicionado acima do losango.
      if (hasPkgChip) {
        push({
          id: pkgChipId, type: 'chipnode', position: { x: cx - AW / 2, y: top },
          draggable: false, selectable: !!ref,
          data: {
            label: 'PACOTES', pkgs: decPkgs, pc, dark, canEdit, secPhase: secPhase,
            hit: !!s && pkgsHit(decPkgs, s), variant: 'after' as const,
            clickable: !!ref && canEdit, contingency: false,
            onFlag: undefined, onFlagPkg: undefined,
          } satisfies ChipData as unknown as Record<string, unknown>,
        }, AW, pkgChipH, ref ? { kind: 'decpkg', ref } : { kind: 'free' })
      }

      const qpos = dec._pos ?? { x: cx - QW / 2, y: qTop }
      push({
        id: qid, type: 'qnode', position: qpos, draggable: false,
        data: { dec, ref, pc, dark, hit: !!s && decHit(dec, s), dup: dupQuestions.has(dec.question.trim()), pick: !!pickMode, canEdit, hasDefault: dec.answers.some(a => a.active) } satisfies QData as unknown as Record<string, unknown>,
      }, QW, QH, ref ? { kind: 'q', ref } : { kind: 'free' })
      if (!qByText.has(dec.question.trim())) qByText.set(dec.question.trim(), qid)
      if (hasPkgChip) edge(pkgChipId, qid)

      const decEntryId = hasPkgChip ? pkgChipId : qid
      if (!dec.answers.length) return { entryId: decEntryId, exitIds: [qid], bottom: qTop + QH }

      const widths = dec.answers.map(colW)
      const rowW = widths.reduce((a, b) => a + b, 0) + AG * (dec.answers.length - 1)
      const ansTop = qTop + QH + V_QA
      const foutJ = (qTop + QH) + Math.min(22, V_QA * 0.42)
      let ax = cx - rowW / 2
      let maxBottom = ansTop
      const branchExits: string[] = []

      dec.answers.forEach((a, ai) => {
        const cw = widths[ai]
        const acx = ax + cw / 2
        const aid = ref ? `a|${refKey(ref)}|${ai}` : `af|${key}|${ai}`
        const apos = a._pos ?? { x: acx - AW / 2, y: ansTop }
        push({
          id: aid, type: 'anode', position: apos, draggable: canEdit && !!ref,
          data: {
            ans: a, ref, ansIdx: ai, pc, dark, hit: !!s && ansHit(a, s), canEdit, secPhase: secPhase,
            onFlagPkg: ref ? (pi: number) => fire({ type: 'p_toggle_ans_pkg_contingency', ref, ansIdx: ai, pkgIdx: pi }) : undefined,
            onStar: ref ? () => fire({ type: 'p_toggle_default', ref, ansIdx: ai }) : undefined,
            onFlag: ref ? () => fire({ type: 'p_toggle_contingency', ref, ansIdx: ai }) : undefined,
          } satisfies AData as unknown as Record<string, unknown>,
        }, AW, ansH(a), ref ? { kind: 'a', ref, ansIdx: ai } : { kind: 'free' })
        divergeEdge(qid, aid, foutJ)
        if (a.goto) gotoLinks.push({ fromId: aid, question: a.goto.trim() })

        // Encadeia sub-perguntas e, em seguida, os CAMPOS da resposta (seq/after) como nós
        // autônomos e consecutivos — nunca empilhados dentro do card. Ordem espelha o clássico
        // e o engine: resposta → sub-perguntas → campos seq → campos após convergência.
        let inputs = [aid]
        let childY = ansTop + ansH(a) + V_SUB
        const subList = [
          ...(a.sub ?? []).map((sub, si) => ({ sub, r: ref ? { ...ref, sub: [...ref.sub, ai, si] } : null, k: `${key}.${ai}.${si}` })),
          ...(a.afterSub ?? []).map((sub, si) => ({ sub, r: ref ? { ...ref, sub: [...ref.sub, ai, -(si + 1)] } : null, k: `${key}.${ai}.n${si}` })),
        ]
        for (const { sub, r, k } of subList) {
          const res = layoutDec(sub, acx, childY, r, pc, k, secPhase)
          for (const inp of inputs) edge(inp, res.entryId)
          inputs = res.exitIds
          childY = res.bottom + V_SUB
        }
        // Campos da resposta: cada entrada seq/after vira um nó "campo" autônomo, ligado em
        // sequência ao passo anterior (não um campo dentro do outro).
        const ansFields: { entry: LSeqEntry; kind: 'seq' | 'after'; idx: number }[] = [
          ...(a.seq ?? []).map((entry, idx) => ({ entry, kind: 'seq' as const, idx })),
          ...(a.after ?? []).map((entry, idx) => ({ entry, kind: 'after' as const, idx })),
        ]
        ansFields.forEach(({ entry, kind, idx }, fi) => {
          const fId = ref ? `af|${refKey(ref)}|${ai}|${kind}|${idx}` : `aff|${key}|${ai}|${kind}|${idx}`
          const fh = chipH(entry.packages?.length ?? 0)
          const capRef = ref, capAi = ai
          push({
            id: fId, type: 'chipnode', position: { x: acx - AW / 2, y: childY }, draggable: false, selectable: !!ref,
            data: {
              label: entry.label || (kind === 'seq' ? 'Sequencial' : 'Após convergência'),
              pkgs: entry.packages ?? [], pc, dark, canEdit, secPhase: secPhase,
              hit: !!s && (entry.label.toLowerCase().includes(s) || pkgsHit(entry.packages, s)), variant: 'after',
              clickable: !!ref, contingency: !!entry.contingency,
              onFlag: ref ? () => fire(kind === 'seq'
                ? { type: 'p_toggle_ans_seq_conting', ref: capRef!, ansIdx: capAi, seqIdx: idx }
                : { type: 'p_toggle_ans_after_conting', ref: capRef!, ansIdx: capAi, afterIdx: idx }) : undefined,
              onFlagPkg: undefined,
            } satisfies ChipData as unknown as Record<string, unknown>,
          }, AW, fh, ref ? { kind: 'ansfield', ref, ansIdx: ai, ftype: kind, idx } : { kind: 'free' })
          for (const inp of inputs) edge(inp, fId)
          inputs = [fId]
          childY += fh + (fi < ansFields.length - 1 ? V_AFTER : 0)
        })
        maxBottom = Math.max(maxBottom, childY, ansTop + ansH(a))
        branchExits.push(...inputs)
        ax += cw + AG
      })

      // Convergência: quando há ≥2 ramos, todos descem até UMA barra horizontal (num único
      // Y) e se unem num ponto-junção; daí sai um único traço para o próximo passo. Espelha
      // o fan-in do editor clássico (uma linha horizontal unindo os campos acima).
      let inputs = branchExits
      let runY = maxBottom
      let bottom = maxBottom
      if (branchExits.length > 1) {
        const jY = maxBottom + V_CONV
        const jId = ref ? `j|${refKey(ref)}` : `jf|${key}`
        push({
          id: jId, type: 'junction', position: { x: cx - JUNCTION_W / 2, y: jY },
          draggable: false, selectable: false, connectable: false,
          data: {} as Record<string, unknown>,
        }, JUNCTION_W, 1, { kind: 'free' })
        for (const be of branchExits) convergeEdge(be, jId)
        inputs = [jId]
        runY = jY
        bottom = jY
      }
      const isRoot = !!ref && ref.sub.length === 0 && ref.adIdx === undefined && !ref.aeRef

      ;(dec.after ?? []).forEach((ae: LSeqEntry, aeIdx: number) => {
        const chipId = ref ? `da|${refKey(ref)}|${aeIdx}` : `daf|${key}|${aeIdx}`
        const ch = chipH(ae.packages?.length ?? 0)
        const capRefAe = ref

        // ae.sub aparece ACIMA do chip (igual ao editor clássico)
        for (let si = 0; si < (ae.sub ?? []).length; si++) {
          const aeDecRef: DecRef | null = ref && !ref.aeRef ? { ...ref, aeRef: { afterIdx: aeIdx, isAfterSub: false, subIdx: si } } : null
          const res = layoutDec(ae.sub![si], cx, runY + V_DEC, aeDecRef, pc, `${key}.ae${aeIdx}.${si}`, secPhase)
          for (const inp of inputs) edge(inp, res.entryId)
          inputs = res.exitIds
          runY = res.bottom
          bottom = runY
        }

        // Chip node posicionado após ae.sub
        const cy = runY + V_AFTER
        push({
          id: chipId, type: 'chipnode', position: { x: cx - AW / 2, y: cy }, draggable: false, selectable: !!ref,
          data: {
            label: ae.label || 'Após convergência', pkgs: ae.packages ?? [], pc, dark, canEdit, secPhase: secPhase,
            hit: !!s && (ae.label.toLowerCase().includes(s) || pkgsHit(ae.packages, s)), variant: 'after',
            clickable: !!ref, contingency: !!ae.contingency,
            onFlag: ref ? () => fire({ type: 'p_toggle_dec_after_conting', ref: capRefAe!, afterIdx: aeIdx }) : undefined,
            onFlagPkg: undefined,
          } satisfies ChipData as unknown as Record<string, unknown>,
        }, AW, ch, ref ? { kind: 'decafter', ref, afterIdx: aeIdx } : { kind: 'free' })
        for (const inp of inputs) edge(inp, chipId)
        inputs = [chipId]
        runY = cy + ch
        bottom = runY

        // ae.afterSub aparece ABAIXO do chip
        for (let si = 0; si < (ae.afterSub ?? []).length; si++) {
          const aeDecRef: DecRef | null = ref && !ref.aeRef ? { ...ref, aeRef: { afterIdx: aeIdx, isAfterSub: true, subIdx: si } } : null
          const res = layoutDec(ae.afterSub![si], cx, runY + V_DEC, aeDecRef, pc, `${key}.ae${aeIdx}.n${si}`, secPhase)
          for (const inp of inputs) edge(inp, res.entryId)
          inputs = res.exitIds
          runY = res.bottom
          bottom = runY
        }
      })

      // Perguntas após convergência (dec.afterDec) — endereçáveis só na decisão raiz.
      if (isRoot && dec.afterDec?.length) {
        dec.afterDec.forEach((ad, adi) => {
          const adRef: DecRef = { secIdx: ref!.secIdx, decIdx: ref!.decIdx, adIdx: adi, sub: [] }
          const res = layoutDec(ad, cx, runY + V_DEC, adRef, pc, `${key}.ad${adi}`, secPhase)
          for (const inp of inputs) edge(inp, res.entryId)
          inputs = res.exitIds
          runY = res.bottom
          bottom = runY
        })
      }

      return { entryId: decEntryId, exitIds: inputs, bottom }
    }

    // ── Seções: moldura + conteúdo + ligação entre seções ─────────────────────
    // O fluxo é encadeado pelo CONTEÚDO: SEMPRE → 1ª pergunta → … → última saída, e a
    // última saída de uma seção liga-se à entrada da seguinte (nunca deixa o SEMPRE solto).
    let y = 0
    let prevSectionExit: string | null = null
    sections.forEach((sec, si) => {
      const pc: PC = sec.color ?? 'gray'
      const startIdx = ns.length
      const frameTop = y
      const contentTop = y + FRAME_HEADER + FRAME_PAD

      // Para refs expandidos: carrega as decisões do escopo referenciado.
      const isExpanded = sec.ref ? expandedRefs.has(si) : false
      const refDecisions = isExpanded ? resolveScopeSections(sec.ref!.scopeId).flatMap(rs => rs.decisions) : []

      const secW = (sec.ref && !isExpanded) ? 480
        : isExpanded ? Math.max(460, ...refDecisions.map(decW))
          : Math.max(460, ...sec.decisions.map(decW))

      // SEMPRE é posicionado por alwaysAfterIdx (omisso/-1 = antes de tudo, topo).
      // O layout intercala decisões e SEMPRE na ordem correta.
      const alwaysPos = sec.always?.length ? (sec.alwaysAfterIdx ?? -1) : -2
      const entryId = (sec.ref && !isExpanded) ? `frame|${si}`
        : isExpanded ? (refDecisions.length ? `q|xref${si}.0` : `frame|${si}`)
          : (alwaysPos === -1) ? `sem|${si}`          // SEMPRE primeiro
            : sec.decisions.length ? `q|${refKey({ secIdx: si, decIdx: 0, sub: [] })}`
              : sec.always?.length ? `sem|${si}`
                : `frame|${si}`

      let decTop = contentTop
      let semId: string | null = null

      let sectionExit: string = entryId
      if (isExpanded) {
        // Expansão inline: renderiza as decisões do escopo referenciado sem ref editável.
        let prevExits: string[] = []
        for (let di = 0; di < refDecisions.length; di++) {
          const res = layoutDec(refDecisions[di], 0, decTop, null, pc, `xref${si}.${di}`, sec.phase)
          if (prevExits.length) for (const inp of prevExits) edge(inp, res.entryId)
          prevExits = res.exitIds
          decTop = res.bottom + V_DEC
        }
        sectionExit = prevExits.length ? prevExits[prevExits.length - 1] : `frame|${si}`
      } else if (!sec.ref) {
        let prevExits: string[] = []
        let di = 0

        // Decisões[0..alwaysPos] (se alwaysPos=-1, nenhuma antes do SEMPRE)
        for (; di <= alwaysPos && di < sec.decisions.length; di++) {
          const ref: DecRef = { secIdx: si, decIdx: di, sub: [] }
          const res = layoutDec(sec.decisions[di], 0, decTop, ref, pc, `${si}.${di}`, sec.phase)
          if (prevExits.length) for (const inp of prevExits) edge(inp, res.entryId)
          prevExits = res.exitIds
          decTop = res.bottom + V_DEC
        }

        // Chip SEMPRE na posição certa
        if (sec.always?.length) {
          semId = `sem|${si}`
          const sh = chipH(sec.always.length)
          push({
            id: semId, type: 'chipnode', position: { x: -AW / 2, y: decTop }, draggable: false, selectable: false,
            data: {
              label: 'SEMPRE', pkgs: sec.always, pc, dark, canEdit, secPhase: sec.phase,
              hit: !!s && pkgsHit(sec.always, s), variant: 'sempre',
              clickable: canEdit,
              onFlagPkg: undefined,
            } satisfies ChipData as unknown as Record<string, unknown>,
          }, AW, sh, { kind: 'sempre', secIdx: si })
          if (prevExits.length) for (const inp of prevExits) edge(inp, semId)
          prevExits = [semId]
          decTop = decTop + sh + 24
        }

        // Decisões[alwaysPos+1..]
        for (; di < sec.decisions.length; di++) {
          const ref: DecRef = { secIdx: si, decIdx: di, sub: [] }
          const res = layoutDec(sec.decisions[di], 0, decTop, ref, pc, `${si}.${di}`, sec.phase)
          if (prevExits.length) for (const inp of prevExits) edge(inp, res.entryId)
          prevExits = res.exitIds
          decTop = res.bottom + V_DEC
        }

        sectionExit = prevExits.length ? prevExits[prevExits.length - 1] : (semId ?? entryId)
      }

      // Liga a saída da seção anterior à entrada desta (fluxo contínuo entre seções).
      if (prevSectionExit) edge(prevSectionExit, entryId)
      prevSectionExit = sectionExit

      // Bounding box do conteúdo → dimensões da moldura (envolve todo o fluxograma).
      let minX = Infinity, maxX = -Infinity, maxY = -Infinity
      for (let i = startIdx; i < ns.length; i++) {
        const n = ns[i]; const [w, hh] = dims.get(n.id) ?? [0, 0]
        minX = Math.min(minX, n.position.x)
        maxX = Math.max(maxX, n.position.x + w)
        maxY = Math.max(maxY, n.position.y + hh)
      }
      const hasContent = isFinite(minX)
      const fLeft = (hasContent ? Math.min(-secW / 2, minX) : -secW / 2) - FRAME_PAD
      const fRight = (hasContent ? Math.max(secW / 2, maxX) : secW / 2) + FRAME_PAD
      const fBottom = (hasContent ? maxY : contentTop + 40) + FRAME_PAD
      const fw = fRight - fLeft
      const fh = fBottom - frameTop

      frames.push({
        id: `frame|${si}`, type: 'framenode', position: { x: fLeft, y: frameTop },
        draggable: false, selectable: false, connectable: false,
        // pointerEvents:none no nó inteiro → só o cabeçalho (que reativa os eventos) abre o
        // menu; cliques na área do quadro atravessam para o canvas (pan) e não abrem menu.
        style: { pointerEvents: 'none' },
        data: {
          sec, secIdx: si, pc, dark, hit: !!s && (sec.label.toLowerCase().includes(s) || pkgsHit(sec.always, s)),
          width: fw, height: fh, canEdit, expanded: isExpanded,
          onClick: sec.ref
            ? (e: React.MouseEvent) => { e.stopPropagation(); setExpandedRefs(prev => { const n = new Set(prev); n.has(si) ? n.delete(si) : n.add(si); return n }) }
            : canEdit ? (e: React.MouseEvent) => openSecMenu(e, si, 'quick') : undefined,
          onContext: canEdit ? (e: React.MouseEvent) => openSecMenu(e, si, 'full') : undefined,
          onNameClick: sec.ref
            ? () => {
                if (confirm('Sair do editor deste escopo e ir para o editor do bloco de lógica referenciado?')) {
                  fire({ type: 'edit_ref_block', scopeId: sec.ref!.scopeId })
                }
              }
            : undefined,
        } satisfies FData as unknown as Record<string, unknown>,
      })
      meta.set(`frame|${si}`, { kind: 'sec', secIdx: si })

      y = frameTop + fh + SEC_GAP
    })

    // (A ligação entre seções é feita pelo fluxo do conteúdo, no laço acima.)

    // Links "goto" (resposta → pergunta destino) — referência visual do clássico
    for (const g of gotoLinks) {
      const target = qByText.get(g.question)
      if (!target) continue
      // Traço contínuo e estreito como os demais; cor âmbar + rótulo distinguem o "goto".
      es.push({
        id: `goto|${g.fromId}|${target}`, source: g.fromId, target, sourceHandle: 'bottom', targetHandle: 'top',
        type: 'bezier',
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#d97706' },
        style: { stroke: '#d97706', strokeWidth: 1.4 },
        label: 'vai para', labelStyle: { fontSize: 8, fill: '#d97706' },
        labelBgStyle: { fill: dark ? '#0f172a' : '#fafafa', fillOpacity: 0.85 },
      } as Edge)
    }

    metaRef.current = meta
    // Molduras primeiro (z-index atrás), conteúdo por cima.
    return { ns: [...frames, ...ns], es }
  }, [sections, dark, search, canEdit, pickMode, dupQuestions, fire, openSecMenu, expandedRefs])

  useEffect(() => {
    const { ns, es } = buildGraph()
    setNodes(prev => {
      const sel = new Set(prev.filter(n => n.selected).map(n => n.id))
      return ns.map(n => (sel.has(n.id) ? { ...n, selected: true } : n))
    })
    setEdges(es)
  }, [buildGraph])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds))
    for (const ch of changes) {
      if (ch.type === 'select') {
        if (ch.selected) selectedRef.current = metaRef.current.get(ch.id) ?? null
        else if (selectedRef.current === metaRef.current.get(ch.id)) selectedRef.current = null
        setSelTick(t => t + 1)
      }
    }
  }, [])

  const onNodeDragStop = useCallback((_: unknown, node: Node) => {
    if (!canEdit) return
    const m = metaRef.current.get(node.id)
    if (!m || (m.kind !== 'q' && m.kind !== 'a')) return
    const target: FlowNodeTarget = m.kind === 'q' ? { kind: 'q', ref: m.ref } : { kind: 'a', ref: m.ref, ansIdx: m.ansIdx }
    fire({ type: 'set_node_pos', target, pos: { x: Math.round(node.position.x), y: Math.round(node.position.y) } })
  }, [canEdit, fire])

  // Clique ESQUERDO → editor inline no próprio nó (pergunta, resposta ou chip de pacotes).
  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type === 'framenode') return  // moldura: tratada pelo próprio cabeçalho
    const m = metaRef.current.get(node.id)
    if (!m) return
    if (pickMode && m.kind === 'q') {
      const dec = resolveRef(sections, m.ref)
      if (dec) fire({ type: 'pick_source', ref: m.ref, question: dec.question })
      return
    }
    if (!canEdit || m.kind === 'free') return
    setActiveChip(null)
    openChipInline(node.id, m)
  }, [pickMode, canEdit, sections, fire, openChipInline])

  // Clique DIREITO → menu completo (full) com todas as ações.
  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: Node) => {
    e.preventDefault()
    setActiveChip(null)  // fecha editor inline se estiver aberto
    if (node.type === 'framenode') return  // moldura: tratada pelo cabeçalho (onContextMenu)
    const m = metaRef.current.get(node.id)
    if (!m || !canEdit || m.kind === 'free') return
    if (m.kind === 'q') openQMenu(e, m.ref)
    else if (m.kind === 'decpkg') openQMenu(e, m.ref, { noAddAnswer: true, noTitle: true })
    else if (m.kind === 'a') openAMenu(e, m.ref, m.ansIdx, 'full')
    else if (m.kind === 'sempre') openSempreMenu(e, m.secIdx, 'full')
    else if (m.kind === 'decafter') openDecAfterChipMenu(e, m.ref, m.afterIdx, 'full')
    else if (m.kind === 'ansfield') openAnsChipMenu(e, m.ref, m.ansIdx, { type: m.ftype, idx: m.idx }, 'full')
  }, [canEdit, fire, openQMenu, openAMenu, openSecMenu, openSempreMenu, openDecAfterChipMenu, openAnsChipMenu])

  // ── Teclado: Ctrl+C / Ctrl+V / Delete sobre o nó selecionado ────────────────
  useEffect(() => {
    if (!canEdit) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const sel = selectedRef.current
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'c') {
        if (!sel) return
        if (sel.kind === 'q') {
          const dec = resolveRef(sections, sel.ref)
          if (dec) { _clipboard = { kind: 'dec', dec: deepClone(dec) }; e.preventDefault() }
        } else if (sel.kind === 'a') {
          const ans = resolveRef(sections, sel.ref)?.answers[sel.ansIdx]
          if (ans) { _clipboard = { kind: 'ans', ans: deepClone(ans) }; e.preventDefault() }
        }
      }
      if (mod && e.key === 'v') {
        if (!sel || !_clipboard) return
        if (sel.kind === 'q') {
          if (_clipboard.kind === 'dec') fire({ type: 'p_paste_dec', ref: sel.ref, dec: deepClone(_clipboard.dec) })
          else fire({ type: 'p_paste_ans', ref: sel.ref, ans: deepClone(_clipboard.ans) })
          e.preventDefault()
        } else if (sel.kind === 'a' && _clipboard.kind === 'dec') {
          fire({ type: 'p_paste_sub_dec', ref: sel.ref, ansIdx: sel.ansIdx, dec: deepClone(_clipboard.dec) })
          e.preventDefault()
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        if (sel.kind === 'q') { fire({ type: 'p_remove_dec', ref: sel.ref }); selectedRef.current = null; e.preventDefault() }
        else if (sel.kind === 'a') { fire({ type: 'p_remove_ans', ref: sel.ref, ansIdx: sel.ansIdx }); selectedRef.current = null; e.preventDefault() }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [canEdit, sections, fire])

  const bg = dark ? '#020617' : '#dde3ea'
  const panelCls = dark
    ? 'bg-slate-900/95 border border-slate-700 text-slate-300'
    : 'bg-white/95 border border-slate-300 text-slate-600'

  return (
    <div className="flex w-full h-full overflow-hidden" style={{ background: bg }}>
      {/* Índice de perguntas — sidebar docada à esquerda (idêntico ao clássico) */}
      {showIndex && (
        <aside className={`relative h-full shrink-0 flex flex-col border-r ${dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'}`}
          style={{ width: indexWidth }}>
          <div className={`shrink-0 px-3 pt-2 pb-1.5 border-b ${dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className={`text-[11px] font-bold uppercase tracking-wide ${dark ? 'text-slate-300' : 'text-slate-700'}`}>Índice</span>
              <button onClick={onToggleIndex}
                className={`flex items-center justify-center w-5 h-5 rounded ${dark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
                title="Fechar índice"><PiXBold size={13} /></button>
            </div>
            <div className="relative flex items-center">
              <input type="text" placeholder="Buscar…" value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setSearch('')}
                className={`w-full h-6 pl-2 pr-6 rounded text-[11px] outline-none ${
                  dark ? 'border border-slate-600 bg-slate-800 text-slate-200 placeholder-slate-500 focus:border-amber-500'
                    : 'border border-slate-300 bg-[#fafafa] text-slate-700 placeholder-slate-400 focus:border-amber-500'}`} />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-1.5 text-slate-400 hover:text-slate-600" title="Limpar busca">
                  <PiXBold size={10} />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-custom">
          {questionIndex.map(secEntry => (
            <div key={secEntry.secIdx} className="py-1">
              <div className={`w-full text-left px-3 py-1.5 flex items-center gap-2 ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                <span className="flex-1 truncate text-[11px] font-bold uppercase tracking-wide">{secEntry.label}</span>
                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border ${dark ? 'text-slate-500 border-slate-700' : 'text-slate-500 border-slate-300'}`}>{secEntry.phase}</span>
              </div>
              {secEntry.questions.map(q => (
                <div key={q.decIdx}>
                  <IndexRow text={q.question} dark={dark} warn={!q.hasDefault}
                    onNav={() => navTo(q.ref)}
                    onCommit={canEdit ? (v => fire({ type: 'p_set_q', ref: q.ref, value: v })) : undefined}
                    cls={`text-left pl-6 pr-1 py-1 text-[11px] leading-snug transition-colors ${dark ? 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/60' : 'text-slate-500 hover:text-amber-700 hover:bg-slate-50'}`} />
                  {q.subs.map((sub, si) => (
                    <IndexRow key={si} text={sub.q} prefix="└ " dark={dark} warn={!sub.hasDefault}
                      onNav={() => sub.ref ? navTo(sub.ref) : navTo(q.ref)}
                      onCommit={canEdit && sub.ref ? (v => fire({ type: 'p_set_q', ref: sub.ref!, value: v })) : undefined}
                      style={{ paddingLeft: `${1.5 + sub.depth * 0.65}rem` }}
                      cls={`text-left pr-1 py-0.5 text-[10px] leading-snug transition-colors ${dark ? 'text-slate-500 hover:text-amber-400 hover:bg-slate-800/50' : 'text-slate-400 hover:text-amber-700 hover:bg-slate-50'}`} />
                  ))}
                </div>
              ))}
            </div>
          ))}
          </div>{/* flex-1 overflow-y-auto */}
          <div onMouseDown={onIndexResizeStart}
            className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-amber-500/40 active:bg-amber-500/60 z-10"
            style={{ transform: 'translateX(50%)' }}
            title="Arrastar para redimensionar" />
        </aside>
      )}

      <div className="flex flex-col flex-1 h-full overflow-hidden">
        {/* Canvas ReactFlow */}
        <div className="relative flex-1 min-h-0">
        <ChipEditorCtx.Provider value={activeChip ? { ...activeChip, onClose: closeChip } : null}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={() => { setMenu(null); setActiveChip(null); selectedRef.current = null }}
          onPaneContextMenu={(e) => e.preventDefault()}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          minZoom={0.05}
          maxZoom={2.5}
          onInit={(inst) => { rfRef.current = inst; if (!didFitRef.current) { didFitRef.current = true; inst.fitView({ padding: 0.12, maxZoom: 0.9 }) } }}
          proOptions={{ hideAttribution: true }}
        >
          <Controls showInteractive={false}
            style={{ background: dark ? '#1e293b' : '#fff', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, borderRadius: 8 }} />
          <MiniMap
            nodeColor={(n) =>
              n.type === 'framenode' ? (dark ? '#334155' : '#94a3b8')
                : n.type === 'qnode' ? '#d97706'
                  : n.type === 'chipnode' ? '#7c3aed'
                    : dark ? '#1e293b' : '#cbd5e1'}
            maskColor={dark ? 'rgba(2,6,23,0.75)' : 'rgba(221,227,234,0.75)'}
            style={{ width: 110, height: 170, background: dark ? '#0f172a' : '#f1f5f9', border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`, borderRadius: 6 }}
            pannable zoomable />

          {showLegend && (
            <Panel position="bottom-right">
              <div className={`rounded-xl px-3 py-2.5 shadow-lg space-y-1.5 text-[10px] ${panelCls}`} style={{ maxWidth: 250 }}>
                <p className="font-bold uppercase tracking-wide text-[9px] opacity-70">Legenda</p>
                <div className="flex items-center gap-2"><PiStarFill size={11} color="#facc15" /> Resposta padrão</div>
                <div className="flex items-center gap-2"><PiFlagPennantFill size={11} color="#f97316" /> Contingência</div>
                <div className="flex items-center gap-2">
                  <span style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 11 }}>⚠</span>
                  Sem resposta padrão definida
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded" style={{ width: 12, height: 12, background: dark ? '#475569' : '#e2e8f0', border: `1.5px solid ${dark ? '#64748b' : '#94a3b8'}`, transform: 'rotate(45deg)' }} />
                  Já respondida no escopo (não repete pergunta no índice)
                </div>
                <p className="font-bold uppercase tracking-wide text-[9px] opacity-70 pt-1">Condicionais</p>
                {Object.entries(CONDITION_LABELS).slice(0, 4).map(([k, lbl]) => (
                  <div key={k} className="flex items-center gap-2"><ConditionIcon condition={k} size={11} /> {lbl}</div>
                ))}
              </div>
            </Panel>
          )}

          {pickMode && (
            <Panel position="bottom-center">
              <p className={`text-[10px] px-3 py-1 rounded-full shadow ${panelCls}`}>
                Clique na PERGUNTA de origem para mover/copiar
              </p>
            </Panel>
          )}
        </ReactFlow>
        </ChipEditorCtx.Provider>

        {menu && (
          <ClassicSidePanel
            title={menu.title}
            items={menu.items}
            pkgs={menu.pkgs && menu.pkgsRefresh
              ? { ...menu.pkgs, list: menu.pkgsRefresh() }
              : menu.pkgs}
            onClose={() => setMenu(null)}
            dark={dark}
            pos={menu.pos}
            onTitleChange={menu.onTitleChange}
          />
        )}
        </div>{/* canvas */}
      </div>
    </div>
  )
})
