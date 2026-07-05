import { useRef, useState, useCallback, useMemo, useEffect, useLayoutEffect, useReducer } from 'react'
import type { IconType } from 'react-icons'
import { MdOutlineAnchor } from 'react-icons/md'
import {
  PiFan, PiLegoFill, PiTrashFill, PiPlusCircleFill, PiDiamondFill,
  PiArrowLineUp, PiArrowLineDown, PiArrowFatUp, PiArrowFatDown,
  PiCopySimpleFill, PiArrowUUpLeftFill, PiListNumbersFill,
  PiStarFill, PiFlagPennantFill, PiListDashesFill, PiPlusBold, PiXBold,
} from 'react-icons/pi'
import { SiCodeship } from 'react-icons/si'
import { GiOffshorePlatform } from 'react-icons/gi'
import { getPackage } from '../data/packages'
import { resolveScopeSections, expandScopeRefs, getScopeLabel } from '../data/logicOverrideStore'
import { CONDITION_LABELS } from '../data/logicSecs'

// Original/canonical package name (falls back to the flowchart's own label)
const pkgName = (p: LPkg): string => getPackage(p.id)?.name ?? p.name
// Rótulo humano da condição de emissão de um pacote (fallback: chave crua)
const condLabel = (c?: string): string | null =>
  c ? ((CONDITION_LABELS as Record<string, string>)[c] ?? c) : null

// Ícone (react-icons) que marca a condição de emissão de um pacote, no lugar do
// antigo losango azul ◈. Um por condição de sonda/operação.
const CONDITION_ICONS: Record<string, IconType> = {
  rig_anc: MdOutlineAnchor,      // Sonda ancorada (ANC)
  rig_dp: PiFan,                 // Sonda DP
  op_lwo: SiCodeship,            // Operação LWIV (LWO)
  op_generalista: GiOffshorePlatform, // Operação Generalista
}

// Mapa dos antigos glyphs (emoji/unicode) dos menus para ícones react-icons (Phosphor Fill).
// A chave é o próprio glyph usado nos MenuItem, evitando alterar todos os call sites.
const GLYPH_ICONS: Record<string, IconType> = {
  '📦': PiLegoFill,          // adicionar pacote
  '×': PiTrashFill,          // remover
  '➕': PiPlusCircleFill,     // adicionar resposta/decisão
  '◇': PiDiamondFill,        // inserir sub-pergunta
  '↑': PiArrowLineUp,        // inserir acima
  '↓': PiArrowLineDown,      // inserir abaixo
  '⬆': PiArrowFatUp,         // mover acima
  '⬇': PiArrowFatDown,       // mover abaixo
  '⧉': PiCopySimpleFill,     // copiar
  '⤿': PiArrowUUpLeftFill,   // mover pergunta para cá
  '⤵': PiListNumbersFill,    // sequencial / após convergência
}

// Renderiza um ícone react-icons centrado num ponto do SVG. `cx`/`cyText` são as mesmas
// coordenadas usadas no antigo <text> (que tinha textAnchor="middle" e baseline +3.5);
// descontamos o baseline para centralizar verticalmente. Substitui os glyphs × / + / ⚑…
function svgIco(Icon: IconType, cx: number, cyText: number, size: number, color: string, opacity = 1) {
  return <Icon key={K()} x={cx - size / 2} y={cyText - 3.5 - size / 2} size={size} color={color}
    style={{ pointerEvents: 'none', opacity }} />
}

// Ícone de condição para contexto HTML (dropdown/painéis). No SVG do fluxograma o
// ícone é renderizado inline (com x/y/size) em drawPkgRow.
export function ConditionIcon({ condition, className, size = 11 }: { condition: string; className?: string; size?: number }) {
  const Ic = CONDITION_ICONS[condition]
  const title = `Condicional: ${condLabel(condition)}`
  return Ic
    ? <Ic className={className} size={size} title={title} />
    : <span className={className} title={title}>◈</span>
}

// Deep equality helpers for merging identical Sim/Contingência answers
function _pkgEq(a: LPkg[] | undefined, b: LPkg[] | undefined): boolean {
  if (!a && !b) return true
  if (!a || !b || a.length !== b.length) return false
  return a.every((p, i) => p.id === b[i].id)
}
function _ansEq(a: LAns, b: LAns): boolean {
  if (!_pkgEq(a.packages, b.packages)) return false
  if ((a.sub?.length ?? 0) !== (b.sub?.length ?? 0)) return false
  return (a.sub ?? []).every((d, i) => {
    const bd = (b.sub ?? [])[i]
    return d.answers.length === bd.answers.length && d.answers.every((ai, j) => _ansEq(ai, bd.answers[j]))
  })
}
type DisplayAns = { ans: LAns; label2?: string }
function toDisplayList(answers: LAns[]): DisplayAns[] {
  const out: DisplayAns[] = []
  let i = 0
  while (i < answers.length) {
    const a = answers[i], b = answers[i + 1]
    if (b && a.label === 'Sim' && b.label === 'Contingência' && _ansEq(a, b)) {
      out.push({ ans: a, label2: 'Contingência' })
      i += 2
    } else {
      out.push({ ans: a })
      i++
    }
  }
  return out
}

// Types compatible with AdminView.tsx (structural typing)
type LPkg = { id: string; name: string; isContingency?: boolean; condition?: string }
type LSeqEntry = { label: string; note?: string; packages?: LPkg[]; sub?: LDec[]; afterSub?: LDec[] }
interface LAns { label: string; active?: boolean; note?: string; packages?: LPkg[]; sub?: LDec[]; afterSub?: LDec[]; seq?: LSeqEntry[]; after?: LSeqEntry[]; goto?: string; contingency?: boolean; _dirty?: boolean }
interface LDec { question: string; answers: LAns[]; packages?: LPkg[]; after?: LSeqEntry[]; afterDec?: LDec[]; reuseScope?: boolean; _dirty?: boolean }
interface LSec { id: string; label: string; phase: string; color: 'gray'|'blue'|'amber'; always?: LPkg[]; decisions: LDec[]; ref?: { scopeId: string; label?: string } }
// Complete-view decision tree (mirrors logicSecs.ts QNode structurally)
type QLeaf = { kind: 'leaf'; scopeId: string; label: string; secs: LSec[] }
type QDecision = { kind: 'decision'; question: string; branches: { label: string; child: QNode }[] }
type QChain = { kind: 'chain'; secs: LSec[]; child: QNode }
type QNode = QDecision | QLeaf | QChain

// Referência a uma decisão por caminho: raiz = sec.decisions[decIdx] (ou .afterDec[adIdx]
// quando adIdx definido); `sub` navega a subárvore em pares [ansIdx, subIdx, …] (vazio = raiz).
// Endereçamento usado por todas as ações de edição de nó → profundidade ilimitada.
export type DecRef = { secIdx: number; decIdx: number; adIdx?: number; sub: number[]; aeRef?: { afterIdx: number; isAfterSub: boolean; subIdx: number } }

function resolveRef(secs: LSec[], ref: DecRef): LDec | null {
  const sec = secs[ref.secIdx]; if (!sec) return null
  let dec: LDec | null = ref.adIdx !== undefined
    ? (sec.decisions[ref.decIdx]?.afterDec?.[ref.adIdx] ?? null)
    : (sec.decisions[ref.decIdx] ?? null)
  if (!dec) return null
  for (let i = 0; i + 1 < ref.sub.length; i += 2) {
    const ansIdx = ref.sub[i], subIdx = ref.sub[i + 1]
    dec = subIdx < 0
      ? (dec.answers[ansIdx]?.afterSub?.[-(subIdx + 1)] ?? null)
      : (dec.answers[ansIdx]?.sub?.[subIdx] ?? null)
    if (!dec) return null
  }
  if (ref.aeRef) {
    const ae = dec.after?.[ref.aeRef.afterIdx]; if (!ae) return null
    const list = ref.aeRef.isAfterSub ? ae.afterSub : ae.sub
    return list?.[ref.aeRef.subIdx] ?? null
  }
  return dec
}

// Edit actions fired when admin clicks on interactive elements
export type EditAction =
  // ── Ações por caminho (decisão = DecRef; resposta = DecRef + ansIdx). Qualquer profundidade.
  | { type: 'p_edit_q';          ref: DecRef; current: string }
  | { type: 'p_remove_dec';      ref: DecRef }
  | { type: 'p_add_ans';         ref: DecRef; atStart?: boolean }
  | { type: 'p_toggle_reuse';    ref: DecRef }
  | { type: 'p_toggle_default';      ref: DecRef; ansIdx: number }
  | { type: 'p_toggle_contingency';  ref: DecRef; ansIdx: number }
  | { type: 'p_edit_ans';        ref: DecRef; ansIdx: number; current: string }
  | { type: 'p_remove_ans';      ref: DecRef; ansIdx: number }
  | { type: 'p_add_pkg';         ref: DecRef; ansIdx: number }
  | { type: 'p_remove_pkg';      ref: DecRef; ansIdx: number; pkgIdx: number }
  | { type: 'p_add_sub_dec';     ref: DecRef; ansIdx: number }
  | { type: 'p_insert_sub_dec';  ref: DecRef; ansIdx: number; subIdx: number }
| { type: 'p_add_seq';         ref: DecRef; ansIdx: number; atIdx?: number }
  | { type: 'p_remove_seq';      ref: DecRef; ansIdx: number; seqIdx: number }
  | { type: 'p_edit_seq_label';  ref: DecRef; ansIdx: number; seqIdx: number; current: string }
  | { type: 'p_add_seq_pkg';     ref: DecRef; ansIdx: number; seqIdx: number }
  | { type: 'p_remove_seq_pkg';  ref: DecRef; ansIdx: number; seqIdx: number; pkgIdx: number }
  | { type: 'p_move_seq_pkg';   ref: DecRef; ansIdx: number; seqIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  // Blocos "após convergência" da resposta (a.after) — pacotes/sequenciais no rodapé do chip.
  | { type: 'p_add_after';       ref: DecRef; ansIdx: number; atIdx?: number }
  | { type: 'p_add_after_pkg';   ref: DecRef; ansIdx: number; afterIdx: number }
  | { type: 'p_remove_after';    ref: DecRef; ansIdx: number; afterIdx: number }
  | { type: 'p_edit_after_label';ref: DecRef; ansIdx: number; afterIdx: number; current: string }
  | { type: 'p_remove_after_pkg';ref: DecRef; ansIdx: number; afterIdx: number; pkgIdx: number }
  | { type: 'p_move_after_pkg';  ref: DecRef; ansIdx: number; afterIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  // Blocos "após convergência" de uma DECISÃO (dec.after, path-based) — pacotes que se aplicam
  // após a convergência das respostas de uma (sub-)pergunta, em qualquer nível de aninhamento.
  | { type: 'p_add_aftersub_dec';      ref: DecRef; ansIdx: number }
  | { type: 'p_remove_aftersub_dec';   ref: DecRef; ansIdx: number; afterSubIdx: number }
  | { type: 'p_dec_add_after';        ref: DecRef; atIdx?: number }
  | { type: 'p_dec_add_after_pkg';    ref: DecRef; afterIdx: number }
  | { type: 'p_dec_remove_after';     ref: DecRef; afterIdx: number }
  | { type: 'p_dec_move_after';       ref: DecRef; afterIdx: number; dir: 'up' | 'down' }
  | { type: 'p_dec_edit_after_label'; ref: DecRef; afterIdx: number; current: string }
  | { type: 'p_dec_remove_after_pkg'; ref: DecRef; afterIdx: number; pkgIdx: number }
  | { type: 'p_dec_move_after_pkg';   ref: DecRef; afterIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  | { type: 'remove_pkg';       secIdx: number; decIdx: number; ansIdx: number; pkgIdx: number }
  | { type: 'remove_always';    secIdx: number; pkgIdx: number }
  | { type: 'move_always';      secIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  | { type: 'add_pkg';          secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'add_always';       secIdx: number }
  | { type: 'move_dec_after_pkg'; secIdx: number; decIdx: number; afterIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  | { type: 'edit_question';    secIdx: number; decIdx: number; current: string }
  | { type: 'edit_answer';      secIdx: number; decIdx: number; ansIdx: number; current: string }
  | { type: 'toggle_default';   secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'toggle_contingency'; secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'remove_answer';    secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'add_answer';       secIdx: number; decIdx: number; atStart?: boolean }
  | { type: 'remove_decision';  secIdx: number; decIdx: number }
  | { type: 'add_decision';       secIdx: number; afterDecIdx: number }
  | { type: 'add_blank_decision'; secIdx: number; afterDecIdx: number }
  // "Já respondida no escopo" — alterna LDec.reuseScope (pergunta repetida) em cada nível
  | { type: 'toggle_reuse_scope';         secIdx: number; decIdx: number }
  | { type: 'toggle_reuse_scope_sub';     secIdx: number; decIdx: number; ansIdx: number; subIdx: number }
  | { type: 'toggle_reuse_scope_sub_sub'; secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number }
  | { type: 'toggle_reuse_scope_after_dec'; secIdx: number; decIdx: number; adIdx: number }
  | { type: 'remove_section';   secIdx: number }
  | { type: 'edit_section_phase'; secIdx: number; current: string }
  | { type: 'edit_section_label'; secIdx: number; current: string }
  | { type: 'add_section';      afterSecIdx: number }
  | { type: 'move_section';     secIdx: number; dir: 'up' | 'down' }
  // Blocos de lógica (seções `ref`): desanexar substitui o placeholder pelas seções
  // expandidas (cópia local, edição só neste escopo); editar bloco navega ao escopo BLK_.
  | { type: 'detach_ref_section'; secIdx: number }
  | { type: 'edit_ref_block';     scopeId: string }
  // Mover/copiar em 2 cliques: 1º escolhe o DESTINO no menu do chip (transfer_target),
  // 2º clica na pergunta de ORIGEM (pick_source). `ref`+`ansIdx` = a resposta destino.
  | { type: 'transfer_target';  mode: 'move' | 'copy'; ref: DecRef; ansIdx: number }
  | { type: 'transfer_target_sec'; mode: 'move' | 'copy'; secIdx: number }
  | { type: 'pick_source';      ref: DecRef; question: string }
// Sequential answer actions (within an answer card)
  | { type: 'add_seq';          secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'remove_seq';       secIdx: number; decIdx: number; ansIdx: number; seqIdx: number }
  | { type: 'edit_seq_label';   secIdx: number; decIdx: number; ansIdx: number; seqIdx: number; current: string }
  | { type: 'add_seq_pkg';      secIdx: number; decIdx: number; ansIdx: number; seqIdx: number }
  | { type: 'remove_seq_pkg';   secIdx: number; decIdx: number; ansIdx: number; seqIdx: number; pkgIdx: number }
  // After-convergence sequential entries (after all answers of a decision merge)
  | { type: 'add_dec_after';         secIdx: number; decIdx: number; atIdx?: number }
  | { type: 'add_dec_after_dec';     secIdx: number; decIdx: number; atIdx?: number }
  // After-convergence DECISIONS (dec.afterDec[adIdx]) — perguntas após a convergência
  | { type: 'remove_after_dec';        secIdx: number; decIdx: number; adIdx: number }
  | { type: 'edit_after_dec_q';        secIdx: number; decIdx: number; adIdx: number; current: string }
  | { type: 'add_after_dec_ans';       secIdx: number; decIdx: number; adIdx: number; atStart?: boolean }
  | { type: 'remove_after_dec_ans';    secIdx: number; decIdx: number; adIdx: number; ansIdx: number }
  | { type: 'edit_after_dec_ans';      secIdx: number; decIdx: number; adIdx: number; ansIdx: number; current: string }
  | { type: 'toggle_after_dec_default';     secIdx: number; decIdx: number; adIdx: number; ansIdx: number }
  | { type: 'toggle_after_dec_contingency'; secIdx: number; decIdx: number; adIdx: number; ansIdx: number }
  | { type: 'add_after_dec_pkg';       secIdx: number; decIdx: number; adIdx: number; ansIdx: number }
  | { type: 'remove_after_dec_pkg';    secIdx: number; decIdx: number; adIdx: number; ansIdx: number; pkgIdx: number }
  | { type: 'remove_dec_after';      secIdx: number; decIdx: number; afterIdx: number }
  | { type: 'move_dec_after';        secIdx: number; decIdx: number; afterIdx: number; dir: 'up' | 'down' }
  | { type: 'edit_dec_after_label';  secIdx: number; decIdx: number; afterIdx: number; current: string }
  | { type: 'add_dec_after_pkg';     secIdx: number; decIdx: number; afterIdx: number }
  | { type: 'remove_dec_after_pkg';  secIdx: number; decIdx: number; afterIdx: number; pkgIdx: number }
  // Sub-decision actions (LDec nested inside an LAns.sub[])
  | { type: 'add_sub_dec';        secIdx: number; decIdx: number; ansIdx: number }
  | { type: 'remove_sub_dec';     secIdx: number; decIdx: number; ansIdx: number; subIdx: number }
  | { type: 'edit_sub_question';  secIdx: number; decIdx: number; ansIdx: number; subIdx: number; current: string }
  | { type: 'add_sub_ans';        secIdx: number; decIdx: number; ansIdx: number; subIdx: number; atStart?: boolean }
  | { type: 'remove_sub_ans';     secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number }
  | { type: 'edit_sub_answer';    secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; current: string }
  | { type: 'add_sub_pkg';        secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number }
  | { type: 'remove_sub_pkg';     secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; pkgIdx: number }
  | { type: 'toggle_sub_default'; secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number }
  | { type: 'toggle_sub_contingency'; secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number }
  // Sub-sub-decision actions (LDec nested inside a sub-answer)
  | { type: 'add_sub_sub_dec';       secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number }
  | { type: 'remove_sub_sub_dec';    secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number }
  | { type: 'edit_sub_sub_question'; secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; current: string }
  // Sub-sub-answer actions (LAns nested inside a sub-sub-decision)
  | { type: 'add_sub_sub_ans';        secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; atStart?: boolean }
  | { type: 'toggle_sub_sub_default'; secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; subSubAnsIdx: number }
  | { type: 'toggle_sub_sub_contingency'; secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; subSubAnsIdx: number }
  | { type: 'edit_sub_sub_answer';    secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; subSubAnsIdx: number; current: string }
  | { type: 'remove_sub_sub_ans';     secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; subSubAnsIdx: number }
  | { type: 'add_sub_sub_pkg';        secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; subSubAnsIdx: number }
  | { type: 'remove_sub_sub_pkg';     secIdx: number; decIdx: number; ansIdx: number; subIdx: number; subAnsIdx: number; subSubIdx: number; subSubAnsIdx: number; pkgIdx: number }
  // ── Ações diretas (sem modal) — usadas pelo SidePanel do FlowEditor ──────────
  | { type: 'p_set_q';              ref: DecRef; value: string }
  | { type: 'p_set_ans';            ref: DecRef; ansIdx: number; value: string }
  | { type: 'p_set_section_label';  secIdx: number; value: string }
  | { type: 'p_set_section_phase';  secIdx: number; phase: string; color: 'gray' | 'blue' | 'amber' }
  | { type: 'p_set_dec_after_label'; ref: DecRef; afterIdx: number; value: string }
  | { type: 'set_dec_after_label';   secIdx: number; decIdx: number; afterIdx: number; value: string }
  | { type: 'move_decision';        secIdx: number; decIdx: number; dir: 'up' | 'down' }
  | { type: 'copy_decision';        secIdx: number; decIdx: number }
  | { type: 'p_move_ans';           ref: DecRef; ansIdx: number; dir: 'up' | 'down' }
  | { type: 'p_move_pkg';           ref: DecRef; ansIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  | { type: 'p_add_pkg_direct';     ref: DecRef; ansIdx: number; pkgId: string; pkgName: string }
  | { type: 'p_ins_ans';            ref: DecRef; atIdx: number }
  | { type: 'add_dec_after_chip_sub'; secIdx: number; decIdx: number; afterIdx: number; isAfterSub?: boolean }
  | { type: 'remove_dec_after_chip_sub'; secIdx: number; decIdx: number; afterIdx: number; isAfterSub: boolean; subIdx: number }
  // Decision-level packages (dec.packages) — chip PACOTES acima do diamante
  | { type: 'p_add_dec_pkg';         ref: DecRef }
  | { type: 'p_add_dec_pkg_direct';  ref: DecRef; pkgId: string; pkgName: string }
  | { type: 'p_remove_dec_pkg';      ref: DecRef; pkgIdx: number }
  | { type: 'p_move_dec_pkg';        ref: DecRef; pkgIdx: number; dir: 'up' | 'down' }
  | { type: 'p_clear_dec_pkgs';      ref: DecRef }
  // Per-package contingency toggle
  | { type: 'p_toggle_ans_pkg_contingency'; ref: DecRef; ansIdx: number; pkgIdx: number }
  | { type: 'p_toggle_dec_pkg_contingency'; ref: DecRef; pkgIdx: number }
  // Delete entire packages chip from an answer
  | { type: 'p_clear_ans_pkgs'; ref: DecRef; ansIdx: number }
  // ── Editor de fluxo (ReactFlow): posições manuais de nós ─────────────────────
  // set_node_pos NÃO entra no histórico de undo (arrastar nós não é edição de lógica).
  | { type: 'set_node_pos'; target: FlowNodeTarget; pos: { x: number; y: number } }
  | { type: 'clear_node_pos' }  // remove todas as posições manuais do escopo (re-layout)
  // Campo/valor de resolução automática da resposta a partir de WizardInputs
  | { type: 'p_set_ans_field'; ref: DecRef; ansIdx: number; field?: string; value?: unknown }
  // Condição de emissão de um pacote (LCondition) — em dec.packages ou ans.packages
  | { type: 'p_set_pkg_condition'; ref: DecRef; ansIdx?: number; pkgIdx: number; condition?: string }

export type FlowNodeTarget =
  | { kind: 'sec'; secIdx: number }
  | { kind: 'q'; ref: DecRef }
  | { kind: 'a'; ref: DecRef; ansIdx: number }
  | { kind: 'conv'; ref: DecRef }

export interface LogicGraphProps { secs?: LSec[]; tree?: QNode; editCb?: (a: EditAction) => void; pickMode?: boolean; selRef?: DecRef | null }

// Color palettes (SVG hex values)
type PC = 'gray'|'blue'|'amber'
type PEntry = {
  hdr: string; hdrT: string; dec: string; decT: string
  ans: string; ansB: string; ansT: string; act: string; actT: string
  alw: string; bg: string; bgB: string; code: string
  arr: string; bb: string; bT: string
  lbl: string; lblT: string; empty: string; noteT: string
}

const PAL: Record<PC, PEntry> = {
  gray:  { hdr:'#334155', hdrT:'#f8fafc', dec:'#475569', decT:'#f1f5f9', ans:'#f1f5f9', ansB:'#94a3b8', ansT:'#1e293b', act:'#1e3a8a', actT:'#f0f9ff', alw:'#e2e8f0', bg:'#f8fafc', bgB:'#cbd5e1', code:'#2563eb', arr:'#64748b', bb:'#cbd5e1', bT:'#1e293b', lbl:'#e2e8f0', lblT:'#1e293b', empty:'#94a3b8', noteT:'#64748b' },
  blue:  { hdr:'#312e81', hdrT:'#eef2ff',  dec:'#4338ca', decT:'#eef2ff',  ans:'#f1f5f9', ansB:'#94a3b8', ansT:'#1e293b', act:'#312e81', actT:'#eef2ff',  alw:'#e0e7ff', bg:'#eef2ff', bgB:'#a5b4fc', code:'#3730a3', arr:'#818cf8', bb:'#a5b4fc', bT:'#1e1b4b', lbl:'#e2e8f0', lblT:'#1e293b', empty:'#94a3b8', noteT:'#64748b' },
  amber: { hdr:'#92400e', hdrT:'#fff',    dec:'#b45309', decT:'#fff',    ans:'#fefce8', ansB:'#fcd34d', ansT:'#451a03', act:'#92400e', actT:'#fef3c7', alw:'#fde68a', bg:'#fffbeb', bgB:'#fcd34d', code:'#b45309', arr:'#d97706', bb:'#fcd34d', bT:'#451a03', lbl:'#fde68a', lblT:'#451a03', empty:'#d97706', noteT:'#b45309' },
}

const DARK_PAL: Record<PC, PEntry> = {
  gray:  { hdr:'#1e293b', hdrT:'#e2e8f0', dec:'#334155', decT:'#e2e8f0', ans:'#1e293b', ansB:'#334155', ansT:'#cbd5e1', act:'#2563eb', actT:'#eff6ff', alw:'#0f172a', bg:'#0f172a', bgB:'#334155', code:'#60a5fa', arr:'#475569', bb:'#334155', bT:'#94a3b8', lbl:'#334155', lblT:'#94a3b8', empty:'#475569', noteT:'#64748b' },
  blue:  { hdr:'#1e1b4b', hdrT:'#e0e7ff',  dec:'#312e81', decT:'#e0e7ff',  ans:'#1e293b', ansB:'#334155', ansT:'#cbd5e1', act:'#4338ca', actT:'#eef2ff',  alw:'#0f0e2b', bg:'#0d0c24', bgB:'#312e81', code:'#818cf8', arr:'#4f46e5', bb:'#1e1b4b', bT:'#a5b4fc', lbl:'#334155', lblT:'#94a3b8', empty:'#475569', noteT:'#64748b' },
  amber: { hdr:'#78350f', hdrT:'#fef3c7', dec:'#92400e', decT:'#fef3c7', ans:'#1c1007', ansB:'#92400e', ansT:'#fde68a', act:'#b45309', actT:'#fef3c7', alw:'#1c1007', bg:'#0c0802', bgB:'#78350f', code:'#fbbf24', arr:'#d97706', bb:'#292010', bT:'#fcd34d', lbl:'#422006', lblT:'#fde68a', empty:'#b45309', noteT:'#f59e0b' },
}

// Cor dos diamantes de PERGUNTA (incl. sub-perguntas e perguntas após convergência) — âmbar
// discreto, de baixo contraste, só para diferenciá-los dos demais campos sem chamar atenção.
function qDec(): { fill: string; stroke: string; text: string } {
  return _dark
    ? { fill: '#5c3a13', stroke: '#92400e', text: '#fde9c8' }
    : { fill: '#fde9c0', stroke: '#e7c896', text: '#7c4a13' }
}

// Perguntas de tipo de sonda ("Tipo de sonda?", "Tipo de sonda DP") — detectadas
// automaticamente no fluxograma e destacadas com cor própria + ícone de torre.
const RIG_TYPE_Q_RE = /^tipo de sonda/i
function rigQDec(): { fill: string; stroke: string; text: string } {
  // Fundo: cor da barra lateral (#0c2340) · borda: cinza claro · texto/ícone: laranja (#d97706)
  return { fill: '#0c2340', stroke: '#64748b', text: '#d97706' }
}

// SemisubIcon em miniatura — mesmo ícone exibido na etapa 1 ao lado de "Tipo de sonda".
// Centralizado em (bx, by); size=12px (viewBox 0 0 24 24 → scale 0.5).
function drawDerrickIcon(bx: number, by: number, color: string, els: React.ReactNode[]): void {
  const size = 12
  const s = size / 24   // scale factor: 0.5
  const sw = 1.3 / s    // strokeWidth compensado para que o traço apareça como ~1.3 px
  els.push(
    <g key={K()} transform={`translate(${bx - size / 2},${by - size / 2}) scale(${s})`}
       fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 L9 8 L15 8 Z" />
      <line x1="10.5" y1="5.5" x2="13.5" y2="5.5" />
      <rect x="3" y="8" width="18" height="1.5" rx="0.4" />
      <rect x="5.5" y="9.5" width="3.5" height="6" rx="0.4" />
      <rect x="15" y="9.5" width="3.5" height="6" rx="0.4" />
      <rect x="2.5" y="15.5" width="9" height="3.5" rx="1.75" />
      <rect x="12.5" y="15.5" width="9" height="3.5" rx="1.75" />
    </g>
  )
}

// Module-level state for buildSvg (set before each call, used by renderAnswer)
let _k = 0
let _dark = false
let _editCb: ((a: EditAction) => void) | null = null
let _search = ''
// Mover/copiar: modo "clique na origem" (após escolher o destino) e referência da origem
// destacada (subárvore que será movida/copiada).
let _pickMode = false
let _selRef: DecRef | null = null
// Blocos de lógica (seções `ref`) expandidos inline no fluxo — chave = scopeId do bloco.
// Estado de UI puro (mantido no componente), não altera as seções do escopo.
let _expandedRefs = new Set<string>()
let _toggleRefExpand: ((scopeId: string) => void) | null = null
// `ref` está dentro da subárvore de `sel` (ou é a própria raiz)? Usado p/ destacar a origem.
function refUnder(ref: DecRef, sel: DecRef): boolean {
  if (ref.secIdx !== sel.secIdx || ref.decIdx !== sel.decIdx || (ref.adIdx ?? -1) !== (sel.adIdx ?? -1)) return false
  if (ref.sub.length < sel.sub.length) return false
  return sel.sub.every((v, i) => ref.sub[i] === v)
}
// Textos de pergunta que aparecem em mais de uma decisão no escopo (qualquer nível).
// Só nesses nós exibimos o toggle "Já respondida no escopo". Recalculado em buildSvg.
let _dupQuestions = new Set<string>()
// Tooltip callback — set by LogicGraphPanel component, called by action buttons
let _tooltipCb: ((info: { text: string; x: number; y: number } | null) => void) | null = null
const _decPos = new Map<string, { cx: number; topY: number }>()
// Índice de navegação (painel "Índice"): seções e perguntas de nível 1 com suas
// coordenadas Y no SVG — repovoado em cada buildSvg por drawFlowColumn.
export type FlowIndexSection = {
  secIdx: number; label: string; phase: string; y: number
  questions: { decIdx: number; question: string; y: number; subs: { q: string; depth: number }[] }[]
}

// Coleta sub-perguntas recursivamente (até maxDepth) a partir de um LDec.
// As sub-perguntas não têm Y próprio — no índice navegam até o pai.
function collectSubQs(dec: LDec, depth = 1, out: { q: string; depth: number }[] = [], max = 3): { q: string; depth: number }[] {
  if (depth > max) return out
  for (const ans of dec.answers) {
    for (const sub of ans.sub ?? []) { out.push({ q: sub.question, depth }); collectSubQs(sub, depth + 1, out, max) }
    for (const sub of ans.afterSub ?? []) { out.push({ q: sub.question, depth }); collectSubQs(sub, depth + 1, out, max) }
  }
  for (const ad of dec.afterDec ?? []) { out.push({ q: ad.question, depth }); collectSubQs(ad, depth + 1, out, max) }
  return out
}
let _flowIndex: FlowIndexSection[] = []
const K = () => String(_k++)
const HIT_STROKE = '#d97706'
// Destaque de "alterado e ainda não salvo" — tom azul escuro da coluna esquerda do app
// (#0c2340), com borda azul viva para ressaltar contra o fundo escuro do fluxograma.
const DIRTY_CARD = '#0c2340'
const DIRTY_BAR = '#1e3a8a'
const DIRTY_STROKE = '#3b82f6'
// Destaque da origem selecionada para mover/copiar (subárvore a ser transferida).
const SEL_STROKE = '#22c55e'
const hit = (s: string): boolean => !!_search && !!s && s.toLowerCase().includes(_search)
// Prevents the pan/zoom container's onMouseDown from treating a button-click as a drag start
function stopMD(e: React.MouseEvent) { e.stopPropagation() }
function pal(pc: PC): PEntry { return (_dark ? DARK_PAL : PAL)[pc] }
// Hover tooltip helper — spread onto any interactive <g>. Replaces native SVG `title`
// (which renders inconsistently) with the custom floating tooltip used across the canvas.
function tipAttrs(text: string) {
  return {
    onMouseEnter: (e: React.MouseEvent) => _tooltipCb?.({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => _tooltipCb?.(null),
  }
}

// Floating action menu — a single "＋" per card opens a labeled list of actions,
// replacing the dense row of cryptic icon buttons.
export type MenuItem = { label: string; glyph?: string; color?: string; danger?: boolean; onClick: () => void }
export type MenuPkgList = {
  getList: (secs: LSec[]) => LPkg[]
  onAdd: () => void
  onMove: (idx: number, dir: 'up' | 'down') => void
  onRemove: (idx: number) => void
  // Presente apenas onde a condição do pacote é editável (chips de pergunta e resposta)
  onCondition?: (idx: number, condition?: string) => void
}
// Resolved version passed to ClassicSidePanel (list already computed from current secs)
type ResolvedPkgList = {
  list: LPkg[]; onAdd: () => void; onMove: (idx: number, dir: 'up' | 'down') => void
  onRemove: (idx: number) => void; onCondition?: (idx: number, condition?: string) => void
}
export type MenuState = { title?: string; items: MenuItem[]; pkgs?: MenuPkgList; pos?: { x: number; y: number }; hlKey?: string; onTitleChange?: (v: string) => void }
let _menuCb: ((m: MenuState | null) => void) | null = null
// Key of the currently-selected element — highlighted with amber ring in the SVG
let _hlKey: string | null = null
function openMenu(e: React.MouseEvent, title: string, items: MenuItem[], pkgs?: MenuPkgList, hlKey?: string, onTitleChange?: (v: string) => void) {
  e.stopPropagation()
  _menuCb?.({ title, items, pkgs, pos: { x: e.clientX, y: e.clientY }, hlKey, onTitleChange })
}
// Anel âmbar em volta de um chip rectangular selecionado (card aberto no menu flutuante)
function chipHighlight(key: string, x: number, y: number, w: number, h: number, els: React.ReactNode[]) {
  if (_hlKey !== key) return
  els.push(<rect key={K()} x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={6} fill="rgba(251,191,36,0.10)" />)
  els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={4} fill="none" stroke="#fbbf24" strokeWidth={2.5} opacity={0.9} />)
}

// Conta quantas vezes cada texto de pergunta aparece no escopo, em todos os níveis
// (decisões de topo, sub, sub-sub e afterDec). Usado para detectar perguntas repetidas.
function collectQuestionCounts(secs: LSec[]): Map<string, number> {
  const counts = new Map<string, number>()
  const bump = (q: string) => counts.set(q.trim(), (counts.get(q.trim()) ?? 0) + 1)
  const walk = (decs: LDec[] | undefined) => {
    for (const dec of decs ?? []) {
      bump(dec.question)
      for (const ans of dec.answers) { walk(ans.sub); walk(ans.afterSub) }
      walk(dec.afterDec)
    }
  }
  for (const sec of secs) walk(sec.decisions)
  return counts
}

// Toggle "Já respondida no escopo" sobre uma decisão repetida (glifo ⟲).
function drawReuseToggle(cx: number, cy: number, isOn: boolean, onClick: () => void, els: React.ReactNode[]) {
  const col = isOn ? '#d97706' : '#94a3b8'
  els.push(
    <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); onClick() }}
       style={{ cursor: 'pointer' }}
       {...tipAttrs(isOn
         ? 'Já respondida no escopo — herda a resposta da 1ª ocorrência e não é perguntada de novo (clique para reverter)'
         : 'Pergunta repetida — marcar como "já respondida no escopo" (não perguntar de novo no passo 2)')}>
      <circle cx={cx} cy={cy} r={9} fill={isOn ? '#d97706' : 'transparent'} opacity={isOn ? 0.92 : 1} stroke={col} strokeWidth={1.2} />
      <text x={cx} y={cy + 3.4} fontSize={11} fontWeight={800} textAnchor="middle" fill={isOn ? 'white' : col}>⟲</text>
    </g>
  )
}

// Layout constants
const AW = 290      // answer card min width
const AG = 12       // gap between answer cards
const PKG = 44      // px per package row: ID (linha 1) + nome (linhas 2-3 com wrap)
const NOTE_R = 13   // note row height
const LBLH = 22     // label bar height
const BPAD = 8      // body vertical padding
const DH = 46       // decision diamond bounding-box height
const DDW = 280     // standard diamond width (all diamonds same size)
const AV = 60       // gap: decision bottom → answer top (folga p/ os botões ‹ › caberem livres)
const SG = 28       // gap: answer body → sub-decision
const DSQ = 24      // sequential decisions gap within section
const SHH = 36      // section header height
const ALWG = 18     // gap below SEMPRE chip
const SPAD = 18     // section horizontal padding
const SVPAD = 22    // section vertical padding
const SGAP = 120    // gap between sections (arrow space)
const CR = 12       // corner radius for 90° bends
const MRG = 32      // SVG outer margin
const COLGAP = 90   // gap between scope flowchart columns (complete view)
const LEVELGAP = 88 // vertical gap between decision-tree diamond levels
const TLBLH = 18    // tree branch-label pill height
const F_S = 9.5     // small font (packages)
const F_M = 10.5    // medium font (answer labels, notes)
const F_L = 11      // large font (section header)
const SEQ_GAP = 10  // gap: answer body bottom → seq entry top (arrow space)
const AFTER_GAP = 22 // gap used for after-convergence entries (larger for breathing room)
const DEC_PKG_GAP = 18 // gap between PACOTES chip bottom and diamond top (needs space for arrowhead)

// Size helpers
function aW(a: LAns): number {
  const allSubs = [...(a.sub ?? []), ...(a.afterSub ?? [])]
  if (!allSubs.length) return AW
  return Math.max(AW, ...allSubs.map(d => dW(d)))
}
function dW(d: LDec): number {
  return d.answers.reduce((s, a, i) => s + aW(a) + (i ? AG : 0), 0)
}
function aBodyH(a: LAns): number {
  let h = BPAD
  if (a.note) h += NOTE_R + 2
  const hasSub = !!(a.sub?.length)
  // When sub-questions exist, packages are shown in a separate chip above the first sub-question
  const n = hasSub ? 0 : (a.packages?.length ?? 0)
  if (n) h += n * PKG + 2
  else if (!a.note && !hasSub) h += NOTE_R   // placeholder "—"
  h += BPAD
  return h
}
function seqEntryH(s: LSeqEntry): number {
  const subH = (s.sub ?? []).reduce((acc, d) => acc + AFTER_GAP + dSubRenderedH(d), 0)
  let chipH = LBLH + BPAD
  const n = s.packages?.length ?? 0
  chipH += n ? n * PKG + 2 : NOTE_R
  chipH += BPAD
  const afterSubH = (s.afterSub ?? []).reduce((acc, d) => acc + AFTER_GAP + dSubRenderedH(d), 0)
  return subH + chipH + afterSubH
}
function seqH(a: LAns): number {
  return (a.seq ?? []).reduce((h, s) => h + SEQ_GAP + seqEntryH(s), 0)
}
// Altura de uma sub-pergunta COMO É RENDERIZADA dentro do chip: diamante + respostas +
// (se houver convergência) o vão do fan-in. NÃO inclui afterDec/after/botões de borda — que
// só existem em decisões de topo —, evitando o espaço em branco que sobrava com dTotalH.
// Height of the PACOTES chip rendered above a decision diamond (zero when no dec.packages).
function dDecPkgH(d: LDec): number {
  const n = d.packages?.length ?? 0
  return n > 0 ? alwChipH(n) + DEC_PKG_GAP : 0
}
function dSubRenderedH(d: LDec): number {
  const convPad = d.answers.length > 1 ? (CR + 14) : 0
  let h = dDecPkgH(d) + DH + AV + Math.max(...d.answers.map(aH)) + convPad
  // Zona "após convergência" da sub-pergunta: blocos d.after (chips de pacotes).
  h += (d.after ?? []).reduce((acc, s) => acc + AFTER_GAP + seqEntryH(s), 0)
  return h
}
// Height of the package chip card rendered above sub-questions (when sub + packages coexist).
function aPkgChipH(n: number): number {
  let h = LBLH + BPAD
  h += n > 0 ? n * PKG + 2 : NOTE_R
  h += BPAD
  return h
}
// Altura do chip "SEMPRE" — mesmo formato/altura dos demais chips (label bar + linhas de
// pacote PKG ou, vazio, uma linha "—"). Idêntico ao padrão de seqEntryH.
function alwChipH(n: number): number {
  let h = LBLH + BPAD
  h += n > 0 ? n * PKG + 2 : NOTE_R
  h += BPAD
  return h
}
function aSubH(a: LAns): number {
  const n = a.packages?.length ?? 0
  const showPkgChip = !!a.sub?.length && n > 0
  const pkgSection = showPkgChip ? SG + aPkgChipH(n) : 0
  return pkgSection + (a.sub ?? []).reduce((s, d) => s + SG + dSubRenderedH(d), 0)
}
// Zona "após convergência" no rodapé do chip: blocos a.after.
function aAfterH(a: LAns): number {
  return (a.after ?? []).reduce((acc, s) => acc + SEQ_GAP + seqEntryH(s), 0)
}
// Sub-perguntas APÓS o chip de Pacotes (ans.afterSub), dentro do card da resposta.
function aAfterSubH(a: LAns): number {
  return (a.afterSub ?? []).reduce((s, d) => s + SG + dSubRenderedH(d), 0)
}
function aH(a: LAns): number { return LBLH + aBodyH(a) + seqH(a) + aSubH(a) + aAfterSubH(a) + aAfterH(a) }
// Height of one after-convergence decision (diamond + answer cards row + fanIn arc).
// O convPad reserva o vão do arco de convergência (igual às decisões de topo), garantindo
// que o próximo passo não sobreponha a linha de reconvergência.
function afterDecH(ad: LDec): number {
  const convPad = ad.answers.length > 1 ? (CR + 14) : 0
  return AFTER_GAP + dDecPkgH(ad) + DH + AV + Math.max(0, ...ad.answers.map(aH)) + convPad
}
function dAfterH(d: LDec): number {
  // For multi-answer decisions, reserve space for the fanIn arc (which lands at mergeY + CR + 4)
  const convPad = d.answers.length > 1 ? (CR + 14) : 0
  const afterDecs = (d.afterDec ?? []).reduce((h, ad) => h + afterDecH(ad), 0)
  const entries = (d.after ?? []).reduce((h, s) => h + AFTER_GAP + seqEntryH(s), 0)
  return convPad + afterDecs + entries
}
function dTotalH(d: LDec): number { return dDecPkgH(d) + DH + AV + Math.max(...d.answers.map(aH)) + dAfterH(d) }
function sAlwH(s: LSec): number {
  if (s.always?.length) return alwChipH(s.always.length) + ALWG
  // Chip "SEMPRE" vazio só aparece em modo edição quando a seção ainda não tem decisões.
  if (_editCb && !s.decisions.length) return alwChipH(0) + ALWG
  return 0
}
const REF_SEC_H = SHH + 60   // altura compacta do card de "fluxograma incluído"
const REF_EXP_TOP = 30       // espaço entre o header do bloco e a 1ª seção interna (expandido)
const REF_EXP_BOT = 24       // padding inferior do container do bloco expandido
// Seções internas de um bloco `ref`, já expandindo refs aninhadas (mesma fonte do preview).
function refInnerSecs(scopeId: string): LSec[] {
  return expandScopeRefs(resolveScopeSections(scopeId))
}
// Altura da coluna de seções internas de um bloco expandido. Calcula com `_editCb` nulo
// pois o conteúdo é renderizado read-only (sem os paddings de edição das seções).
function refExpandedContentH(scopeId: string): number {
  const inner = refInnerSecs(scopeId)
  if (!inner.length) return 40
  const saved = _editCb; _editCb = null
  const h = inner.reduce((sum, s, i) => sum + sTotalH(s) + (i ? SGAP : 0), 0)
  _editCb = saved
  return h
}
function refIsExpanded(s: LSec): boolean {
  return !!s.ref?.scopeId && _expandedRefs.has(s.ref.scopeId)
}
function sTotalH(s: LSec): number {
  if (s.ref) {
    if (refIsExpanded(s)) return SHH + REF_EXP_TOP + refExpandedContentH(s.ref!.scopeId) + REF_EXP_BOT
    return REF_SEC_H
  }
  const editPad = _editCb ? 30 : 0  // espaço para "+ decisão ao final"
  return SHH + SVPAD + sAlwH(s) + s.decisions.reduce((sum, d, i) => sum + dTotalH(d) + (i ? DSQ : 0), 0) + SVPAD + editPad
}
function sTotalW(s: LSec): number {
  if (s.ref) {
    const base = 440 + (_editCb ? 70 : 0)
    if (refIsExpanded(s)) {
      const inner = refInnerSecs(s.ref!.scopeId)
      const saved = _editCb; _editCb = null
      const innerW = inner.length ? Math.max(...inner.map(sTotalW)) : 0
      _editCb = saved
      return Math.max(base, innerW + SPAD * 2)
    }
    return base
  }
  // When editing, add 70px on the right so the "× decisão" pill (60px + margin) fits
  return Math.max(300, ...s.decisions.map(dW)) + SPAD * 2 + (_editCb ? 70 : 0)
}

// Helpers
function tr(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '…' : s }

// Renderiza o rótulo de uma pergunta centralizado DENTRO do losango, ajustando a quebra de
// linha e o tamanho da fonte para o texto nunca ultrapassar as arestas inclinadas do diamante.
// topY = Y da aresta superior do losango; a largura do diamante é fixa (DDW).
const DIA_CHAR = 0.56  // largura média de caractere ≈ 0.56×fontSize (sans-serif)
// Largura útil do losango numa faixa horizontal a `d` px (vertical) do centro do diamante.
function diaWidthAt(d: number): number {
  return DDW * (1 - Math.min(1, Math.abs(d) / (DH / 2)))
}
// Máximo de caracteres que cabem numa linha de fonte `fs` centrada na faixa a `d` px do centro.
function diaCap(fs: number, d: number): number {
  return Math.max(3, Math.floor((diaWidthAt(d) - 12) / (fs * DIA_CHAR)))
}
function drawDiamondLabel(cx: number, topY: number, text: string, fill: string, els: React.ReactNode[]): void {
  const t = text.trim()
  const cy = topY + DH / 2
  // 1 linha — cabe na faixa central com a fonte padrão?
  if (t.length <= diaCap(F_M, Math.abs(4 - 0.72 * F_M))) {
    els.push(
      <text key={K()} x={cx} y={cy + 4} fontSize={F_M} fontWeight={600} fill={fill}
        textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif"><title>{t}</title>{t}</text>
    )
    return
  }
  // 2 linhas — quebra próxima ao meio, preferindo limite de palavra.
  const half = Math.ceil(t.length / 2)
  let bp = t.lastIndexOf(' ', half + 6)
  if (bp < half - 12 || bp <= 0) bp = t.indexOf(' ', half - 6)
  let l1 = bp > 0 ? t.slice(0, bp).trim() : t.slice(0, half).trim()
  let l2 = bp > 0 ? t.slice(bp + 1).trim() : t.slice(half).trim()
  // Escolhe a maior fonte em que ambas as linhas cabem nas faixas superior/inferior do losango.
  const need = Math.max(l1.length, l2.length)
  let fs = F_M
  for (const cand of [F_M, 9.5, 8.5, 7.8]) {
    fs = cand
    if (need <= Math.min(diaCap(cand, 2 + 0.72 * cand), diaCap(cand, 10 + 0.24 * cand))) break
  }
  const cap = Math.min(diaCap(fs, 2 + 0.72 * fs), diaCap(fs, 10 + 0.24 * fs))
  l1 = tr(l1, cap); l2 = tr(l2, cap)
  els.push(
    <text key={K()} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif" fill={fill} fontSize={fs} fontWeight={600}>
      <title>{t}</title>
      <tspan x={cx} y={cy - 2}>{l1}</tspan>
      <tspan x={cx} dy={fs + 1.5}>{l2}</tspan>
    </text>
  )
}

// Renderiza uma linha de pacote em 2 linhas: ID (monospace, negrito) acima + nome abaixo.
// topY: Y do topo desta linha específica; rowH: altura total da linha (PKG).
function drawPkgRow(
  leftX: number, topY: number, rowH: number, w: number,
  pkg: LPkg, p: PEntry, isHit: boolean,
  onClick: ((e: React.MouseEvent) => void) | null,
  onFlagToggle: (() => void) | null,
  els: React.ReactNode[]
): void {
  const full = pkgName(pkg)
  const maxChars = Math.floor((w - 16) / 4.8)
  const canWrap = rowH >= 40
  let nameLine1 = canWrap ? full : tr(full, maxChars)
  let nameLine2: string | undefined
  if (canWrap && full.length > maxChars) {
    let bp = full.lastIndexOf(' ', maxChars)
    if (bp < maxChars * 0.4) bp = maxChars
    nameLine1 = full.slice(0, bp).trim()
    nameLine2 = tr(full.slice(bp).trim(), maxChars)
  }
  const idY    = topY + (canWrap ? 10 : rowH * 0.38)
  const nameY  = topY + (canWrap ? 23 : rowH * 0.76)
  const name2Y = topY + 36
  // Flag position: inline after the ID code (monospace ≈5.6px/char, max 50px for ID)
  const flagX  = leftX + 8 + Math.min(pkg.id.length * 5.6 + 4, 54)
  const flagY  = idY

  if (isHit) {
    els.push(<rect key={K()} x={leftX + 4} y={topY + 1} width={w - 8} height={rowH - 2} rx={3}
      fill={HIT_STROKE} opacity={0.22} style={{ pointerEvents: 'none' }} />)
  }
  if (onClick) {
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); onClick(e) }} style={{ cursor: 'pointer' }}
         {...tipAttrs(`${pkg.id}${pkg.condition ? ` · condição: ${condLabel(pkg.condition)}` : ''} — clique para opções`)}>
        <rect x={leftX + 4} y={topY + 1} width={w - 8} height={rowH - 2} rx={3} fill="transparent" />
        <text x={leftX + 8} y={idY} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}</text>
        <text x={leftX + 8} y={nameY} fontSize={F_S - 0.5} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT} opacity={0.85}>{nameLine1}</text>
        {nameLine2 && <text x={leftX + 8} y={name2Y} fontSize={F_S - 0.5} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT} opacity={0.72}>{nameLine2}</text>}
      </g>
    )
  } else {
    els.push(
      <g key={K()}>
        <text x={leftX + 8} y={idY} fontSize={F_S} fontFamily="ui-monospace,monospace" fontWeight={600} fill={p.code}>{pkg.id}<title>{`${pkg.id} — ${full}`}</title></text>
        <text x={leftX + 8} y={nameY} fontSize={F_S - 0.5} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT} opacity={0.85}>{nameLine1}{!nameLine2 && <title>{full}</title>}</text>
        {nameLine2 && <text x={leftX + 8} y={name2Y} fontSize={F_S - 0.5} fontFamily="ui-sans-serif,system-ui,sans-serif" fill={p.ansT} opacity={0.72}>{nameLine2}<title>{full}</title></text>}
      </g>
    )
  }
  // Flag: shown next to ID. Clickable overlay is rendered separately (after zone rect) for correct z-order.
  // Here we only render the visual indicator for read-only mode when pkg.isContingency is already set.
  if (!onFlagToggle && pkg.isContingency) {
    els.push(
      <PiFlagPennantFill key={K()} x={flagX} y={flagY - 10} size={11} color="#f97316" style={{ pointerEvents: 'none' }} />
    )
  }
  // Condição de emissão (pkg.condition): ícone react-icons (sonda/operação) no canto
  // direito da linha do pacote, na mesma cor azul do código do pacote (p.code).
  if (pkg.condition) {
    const CondIcon = CONDITION_ICONS[pkg.condition]
    const ic = 12
    els.push(CondIcon
      ? <CondIcon key={K()} x={leftX + w - 8 - ic} y={idY - ic + 2} size={ic} color={p.code}
          title={`Condicional: ${condLabel(pkg.condition)}`} style={{ pointerEvents: 'none' }} />
      : <text key={K()} x={leftX + w - 8} y={idY} fontSize={9} fontWeight={700} textAnchor="end"
          fill={p.code} style={{ pointerEvents: 'none' }}>
          ◈<title>{`Condicional: ${condLabel(pkg.condition)}`}</title>
        </text>
    )
  }
}

// Render interactive ⚑ flag overlays for a package list.
// MUST be called AFTER the zone-rect <g> so overlays sit on top (higher z-order in SVG).
function pushPkgFlagOverlays(
  leftX: number, bY: number, pkgs: LPkg[], p: PEntry,
  onToggle: (pkgIdx: number) => void,
  els: React.ReactNode[]
) {
  pkgs.forEach((pkg, i) => {
    const capI = i
    const flagX = leftX + 8 + Math.min(pkg.id.length * 5.6 + 4, 54)
    const flagY = bY + i * PKG + 10  // idY: PKG=44≥40 so canWrap=true
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { e.stopPropagation(); onToggle(capI) }}
         style={{ cursor: 'pointer' }}
         {...tipAttrs(pkg.isContingency ? 'Pacote contingencial — clique para remover' : 'Marcar pacote como contingencial')}>
        <rect x={flagX - 4} y={bY + i * PKG + 1} width={14} height={PKG - 2} rx={2} fill="transparent" />
        <PiFlagPennantFill x={flagX} y={flagY - 10} size={11} color={pkg.isContingency ? '#f97316' : p.lblT}
          style={{ pointerEvents: 'none', opacity: pkg.isContingency ? 1 : 0.28 }} />
      </g>
    )
  })
}

// Fan-out connector: trunk → curved 90° branches to each answer
function fanOut(
  decBotX: number, decBotY: number,
  answers: LAns[], firstAnsX: number, ansY: number,
  stroke: string, markerUrl: string, els: React.ReactNode[]
): void {
  // junction Y: where trunk ends and horizontal routing begins
  const jY = decBotY + AV * 0.40
  const AP = 3  // gap between path end and arrowhead tip

  if (answers.length === 1) {
    const cx = firstAnsX + aW(answers[0]) / 2
    els.push(<line key={K()} x1={cx} y1={decBotY} x2={cx} y2={ansY - AP}
      stroke={stroke} strokeWidth={1.5} markerEnd={markerUrl} />)
    return
  }

  // Trunk: diamond bottom → junction Y (no arrowhead)
  els.push(<line key={K()} x1={decBotX} y1={decBotY} x2={decBotX} y2={jY}
    stroke={stroke} strokeWidth={1.5} />)

  // Compute answer center X positions
  let x = firstAnsX
  const cxs: number[] = answers.map(a => { const c = x + aW(a) / 2; x += aW(a) + AG; return c })

  // One path per branch with rounded 90° corner where horizontal meets vertical
  for (const cx of cxs) {
    const diff = cx - decBotX
    const r = Math.min(CR, Math.max(2, Math.abs(diff) - 2))
    let d: string
    if (Math.abs(diff) < 2) {
      // Center: straight down continuation of trunk
      d = `M${cx},${jY} V${ansY - AP}`
    } else if (diff < 0) {
      // Branch goes left then curves down
      d = `M${decBotX},${jY} H${cx + r} Q${cx},${jY} ${cx},${jY + r} V${ansY - AP}`
    } else {
      // Branch goes right then curves down
      d = `M${decBotX},${jY} H${cx - r} Q${cx},${jY} ${cx},${jY + r} V${ansY - AP}`
    }
    els.push(<path key={K()} d={d} stroke={stroke} strokeWidth={1.5} fill="none" markerEnd={markerUrl} />)
  }
}

// Fan-in connector: each answer bottom → vertical down → curved 90° → horizontal to mergeX.
// Mirrors fanOut geometry. jY is set below mergeY so V-segments always go downward.
function fanIn(
  answers: LAns[], firstAnsX: number, ansY: number,
  mergeY: number, mergeX: number,
  stroke: string, els: React.ReactNode[]
): void {
  if (answers.length <= 1) return

  let x = firstAnsX
  const cxs: number[] = answers.map(a => {
    const c = x + aW(a) / 2
    x += aW(a) + AG
    return c
  })

  // Junction Y below all card bottoms: ensures V{jY-r} always goes DOWN
  // (r ≤ CR=12, so jY-r ≥ mergeY+4 > mergeY ≥ botY for any answer)
  const jY = mergeY + CR + 4

  for (let i = 0; i < answers.length; i++) {
    const acx = cxs[i]
    const botY = ansY + aH(answers[i])
    const diff = acx - mergeX

    if (Math.abs(diff) < 2) {
      // Center column: trunk line covers mergeY onward; only draw stub if shorter
      if (botY + 1 < jY) {
        els.push(<line key={K()} x1={acx} y1={botY} x2={acx} y2={jY}
          stroke={stroke} strokeWidth={1.5} />)
      }
    } else {
      // Off-center: vertical down to (jY-r), rounded 90° turn horizontal to mergeX
      const r = Math.min(CR, Math.max(2, Math.abs(diff) - 2))
      const d = diff < 0
        ? `M${acx},${botY} V${jY - r} Q${acx},${jY} ${acx + r},${jY} H${mergeX}`
        : `M${acx},${botY} V${jY - r} Q${acx},${jY} ${acx - r},${jY} H${mergeX}`
      els.push(<path key={K()} d={d} stroke={stroke} strokeWidth={1.5} fill="none" />)
    }
  }
}

// Render one answer card (recursive for sub-decisions).
// `ref` é a decisão à qual esta resposta pertence; `ai` é o índice da resposta. As ações de
// edição são endereçadas por caminho (ref + ai), então a profundidade é ilimitada.
function renderAnswer(
  a: LAns, x: number, y: number, w: number, cx: number,
  pc: PC, els: React.ReactNode[],
  ref: DecRef, ai: number,
  label2?: string,
): void {
  const p = pal(pc)
  const h = aH(a)
  const bodH = aBodyH(a)
  const act = !!a.active

  const canEdit = _editCb !== null
  const fire = (act2: EditAction) => _editCb!(act2)
  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => _tooltipCb?.({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => _tooltipCb?.(null),
  })

  // Search highlight flags
  const labelHit = hit(a.label)
  const pkgs = a.packages ?? []
  const pkgHitIdx = new Set(pkgs.map((pkg, i) => ({ pkg, i })).filter(({ pkg }) => hit(pkg.id) || hit(pkgName(pkg))).map(({ i }) => i))
  const cardHit = labelHit || pkgHitIdx.size > 0

  // card background — uniform for all answers (azul escuro quando alterado/não salvo)
  const dirty = !!a._dirty
  els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill={dirty ? DIRTY_CARD : p.ans} stroke={dirty ? DIRTY_STROKE : p.ansB} strokeWidth={dirty ? 1.6 : 1} />)
  // label bar
  const lbg = labelHit ? HIT_STROKE : dirty ? DIRTY_BAR : p.lbl
  els.push(<rect key={K()} x={x} y={y} width={w} height={LBLH} rx={5} fill={lbg} />)
  els.push(<rect key={K()} x={x} y={y + LBLH - 5} width={w} height={5} fill={lbg} />)
  const cont = !!a.contingency
  const contLabel = label2 ?? (cont ? 'Contingência' : undefined)
  const lblTextX = canEdit ? x + 34 : x + 8
  if (contLabel) {
    els.push(
      <text key={K()} x={lblTextX} y={y + LBLH * 0.68} fontSize={F_M} fontFamily="ui-sans-serif,system-ui,sans-serif">
        <tspan fontWeight={700} fill={p.lblT}>{tr(a.label, canEdit ? 18 : 24)} / </tspan>
        <tspan fontWeight={600} fill="#d97706" fontSize={F_M - 0.5}>{contLabel}</tspan>
      </text>
    )
  } else {
    els.push(
      <text key={K()} x={lblTextX} y={y + LBLH * 0.68} fontSize={F_M} fontWeight={700}
        fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">
        {tr(a.label, canEdit ? 28 : 44)}
      </text>
    )
  }
  if (canEdit) {
    // ✦ toggle-default button (left of label)
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => {
        e.stopPropagation()
        fire({ type: 'p_toggle_default', ref, ansIdx: ai })
      }} style={{ cursor: 'pointer' }} {...tip('Marcar como padrão')}>
        {svgIco(PiStarFill, x + 10, y + LBLH * 0.72, 13, act ? '#facc15' : p.lblT, act ? 1 : 0.35)}
      </g>
    )
    // ⚑ toggle-contingency button (right of ✦) — marca a resposta como variante de contingência
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => {
        e.stopPropagation()
        fire({ type: 'p_toggle_contingency', ref, ansIdx: ai })
      }} style={{ cursor: 'pointer' }} {...tip('Duplicar à direita como variante de contingência')}>
        {svgIco(PiFlagPennantFill, x + 23, y + LBLH * 0.74, 13, cont ? '#d97706' : p.lblT, cont ? 1 : 0.35)}
      </g>
    )
    // Label bar click → opens sidebar with all answer actions
    const ansMenuItems: MenuItem[] = [
      { label: 'Adicionar pacote', glyph: '📦', color: '#0ea5e9', onClick: () => fire({ type: 'p_add_pkg', ref, ansIdx: ai }) },
      { label: 'Inserir sub-pergunta acima', glyph: '↑', color: '#22d3ee', onClick: () => fire({ type: 'p_insert_sub_dec', ref, ansIdx: ai, subIdx: 0 }) },
      { label: 'Inserir sub-pergunta abaixo', glyph: '↓', color: '#22d3ee', onClick: () => fire({ type: 'p_add_aftersub_dec', ref, ansIdx: ai }) },
      { label: 'Adicionar resposta sequencial', glyph: '⤵', color: '#7c3aed', onClick: () => fire({ type: 'p_add_seq', ref, ansIdx: ai, atIdx: 0 }) },
      { label: 'Adicionar entrada após convergência', glyph: '⤵', color: '#6366f1', onClick: () => fire({ type: 'p_dec_add_after', ref }) },
      { label: 'Mover resposta acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_move_ans', ref, ansIdx: ai, dir: 'up' }) },
      { label: 'Mover resposta abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_move_ans', ref, ansIdx: ai, dir: 'down' }) },
      { label: 'Mover pergunta para cá', glyph: '⤿', color: '#a855f7', onClick: () => fire({ type: 'transfer_target', mode: 'move', ref, ansIdx: ai }) },
      { label: 'Copiar pergunta para cá', glyph: '⧉', color: '#14b8a6', onClick: () => fire({ type: 'transfer_target', mode: 'copy', ref, ansIdx: ai }) },
      { label: 'Remover resposta', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_ans', ref, ansIdx: ai }) },
    ]
    const capAnsHlKey = `a:${ref.secIdx}:${ref.decIdx}:${ref.sub.join(',')}:${ai}`
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); openMenu(e, a.label, ansMenuItems, undefined, capAnsHlKey, (v) => fire({ type: 'p_set_ans', ref, ansIdx: ai, value: v })) }}
         style={{ cursor: 'pointer' }} {...tip('Ações da resposta')}>
        <rect x={x + 32} y={y + 1} width={w - 44} height={LBLH - 2} rx={2} fill="transparent" />
      </g>
    )
    // × remove answer button (right of label)
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => {
        e.stopPropagation()
        fire({ type: 'p_remove_ans', ref, ansIdx: ai })
      }} style={{ cursor: 'pointer' }} {...tip('Remover resposta')}>
        <circle cx={x + w - 9} cy={y + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
        {svgIco(PiTrashFill, x + w - 9, y + LBLH / 2 + 3.5, 10, 'white')}
      </g>
    )
  }

  // body content — abaixo da label bar
  let bY = y + LBLH + BPAD
  if (a.note) {
    els.push(
      <text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic"
        fill={p.noteT} fontFamily="ui-sans-serif,system-ui,sans-serif">
        {tr(a.note, 36)}
      </text>
    )
    bY += NOTE_R + 2
  }
  const hasSub = !!(a.sub?.length)
  if (!hasSub && (pkgs.length > 0 || canEdit)) {
    pkgs.forEach((pkg, i) => {
      drawPkgRow(x, bY + i * PKG, PKG, w, pkg, p, pkgHitIdx.has(i), null, null, els)
    })
    if (pkgs.length === 0 && !a.note) {
      els.push(<text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
    }
    if (canEdit) {
      const capRef = ref, capAi = ai
      const zoneH = pkgs.length > 0 ? pkgs.length * PKG + 4 : NOTE_R + 4
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, a.label, [], {
          getList: (s) => resolveRef(s, capRef)?.answers[capAi]?.packages ?? [],
          onAdd: () => fire({ type: 'p_add_pkg', ref, ansIdx: ai }),
          onMove: (idx, dir) => fire({ type: 'p_move_pkg', ref, ansIdx: ai, pkgIdx: idx, dir }),
          onRemove: (idx) => fire({ type: 'p_remove_pkg', ref, ansIdx: ai, pkgIdx: idx }),
          onCondition: (idx, condition) => fire({ type: 'p_set_pkg_condition', ref, ansIdx: ai, pkgIdx: idx, condition }),
        })} style={{ cursor: 'pointer' }} {...tipAttrs(pkgs.length > 0 ? 'Gerenciar pacotes' : 'Adicionar pacote')}>
          <rect x={x + 4} y={bY - 2} width={w - 8} height={zoneH} rx={3} fill="transparent" />
        </g>
      )
      // Flag overlays rendered AFTER zone rect so they sit on top in SVG z-order
      if (pkgs.length > 0) {
        pushPkgFlagOverlays(x, bY, pkgs, p,
          (pi) => fire({ type: 'p_toggle_ans_pkg_contingency', ref, ansIdx: ai, pkgIdx: pi }), els)
      }
    }
  } else if (!a.note && !hasSub) {
    els.push(<text key={K()} x={x + 8} y={bY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
  }
  // Card glow ring for search hit (rendered last, on top of content)
  if (cardHit) {
    els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill="none" stroke={HIT_STROKE} strokeWidth={2} opacity={0.9} />)
  }
  // Destaque da origem selecionada (subárvore que será movida/copiada)
  if (_selRef && refUnder(ref, _selRef)) {
    els.push(<rect key={K()} x={x - 1} y={y - 1} width={w + 2} height={h + 2} rx={6} fill={SEL_STROKE} opacity={0.1} />)
    els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill="none" stroke={SEL_STROKE} strokeWidth={2.2} opacity={0.95} />)
  }
  // Destaque da resposta cujo menu está aberto (janela flutuante)
  const ansHlKey = `a:${ref.secIdx}:${ref.decIdx}:${ref.sub.join(',')}:${ai}`
  if (_hlKey === ansHlKey) {
    els.push(<rect key={K()} x={x - 2} y={y - 2} width={w + 4} height={h + 4} rx={7} fill="rgba(251,191,36,0.10)" />)
    els.push(<rect key={K()} x={x} y={y} width={w} height={h} rx={5} fill="none" stroke="#fbbf24" strokeWidth={2.5} opacity={0.9} />)
  }

  // Sequential entries — renderizadas ABAIXO das perguntas aninhadas e do chip Pacotes
  // (perguntas em cima). Posição por coordenada Y: começam após toda a zona de sub-perguntas
  // (aSubH), independentemente da ordem em que são empilhadas no código.
  if (a.seq?.length || (canEdit && seqH(a) > 0)) {
    const seqStart = y + LBLH + bodH + aSubH(a) + aAfterSubH(a)
    let seqY = seqStart
    const seqList = a.seq ?? []
    for (let sei = 0; sei < seqList.length; sei++) {
      const se = seqList[sei]
      const seH = seqEntryH(se)
      const seCardY = seqY + SEQ_GAP
      // Chip compacto e centrado, idêntico ao chip "Pacotes" (largura fixa AW-8) — evita que
      // a resposta sequencial estique até a largura total quando a resposta é larga (com sub-perguntas).
      const seW = AW - 8, seX = cx - seW / 2

      // Arrow from body bottom (or previous seq) down to this card
      els.push(<line key={K()} x1={cx} y1={seqY} x2={cx} y2={seCardY - 4}
        stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)

      // Card background
      els.push(<rect key={K()} x={seX} y={seCardY} width={seW} height={seH} rx={4}
        fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
      // Label bar — mesma cor dos demais chips secundários (p.alw, igual ao chip "Pacotes")
      els.push(<rect key={K()} x={seX} y={seCardY} width={seW} height={LBLH} rx={4} fill={p.lbl} />)
      els.push(<rect key={K()} x={seX} y={seCardY + LBLH - 4} width={seW} height={4} fill={p.lbl} />)

      if (canEdit) {
        const capSei = sei
        // × remove seq entry
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); fire({ type: 'p_remove_seq', ref, ansIdx: ai, seqIdx: capSei }) }}
             style={{ cursor: 'pointer' }} {...tipAttrs('Remover entrada sequencial')}>
            <circle cx={seX + seW - 9} cy={seCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
            {svgIco(PiTrashFill, seX + seW - 9, seCardY + LBLH / 2 + 3.5, 10, 'white')}
          </g>
        )
        // Click label to edit
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); fire({ type: 'p_edit_seq_label', ref, ansIdx: ai, seqIdx: capSei, current: se.label }) }}
             style={{ cursor: 'text' }}>
            <rect x={seX + 8} y={seCardY + 1} width={seW - 28} height={LBLH - 2} rx={2} fill="transparent" />
          </g>
        )
      }

      // Label text
      els.push(
        <text key={K()} x={canEdit ? seX + 22 : seX + 8} y={seCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600}
          fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">
          {tr(se.label, canEdit ? 24 : 44)}
        </text>
      )

      // Packages
      const sePkgs = se.packages ?? []
      const seBY = seCardY + LBLH + BPAD
      const seqHlKey = `chip:seq:${ref.secIdx}:${ref.decIdx}:${ref.sub.join(',')}:${ai}:${sei}`
      if (sePkgs.length > 0 || canEdit) {
        sePkgs.forEach((pkg, pi) => {
          drawPkgRow(seX, seBY + pi * PKG, PKG, seW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
        })
        if (sePkgs.length === 0) {
          els.push(<text key={K()} x={seX + 8} y={seBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
        }
        if (canEdit) {
          const capSei2 = sei, capRef = ref, capAi = ai, capSeLabel = se.label
          const seZoneH = sePkgs.length > 0 ? sePkgs.length * PKG + 4 : NOTE_R + 4
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capSeLabel, [], {
              getList: (s) => resolveRef(s, capRef)?.answers[capAi]?.seq?.[capSei2]?.packages ?? [],
              onAdd: () => fire({ type: 'p_add_seq_pkg', ref, ansIdx: ai, seqIdx: capSei2 }),
              onMove: (idx, dir) => fire({ type: 'p_move_seq_pkg', ref, ansIdx: ai, seqIdx: capSei2, pkgIdx: idx, dir }),
              onRemove: (idx) => fire({ type: 'p_remove_seq_pkg', ref, ansIdx: ai, seqIdx: capSei2, pkgIdx: idx }),
            }, seqHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs(sePkgs.length > 0 ? 'Gerenciar pacotes' : 'Adicionar pacote')}>
              <rect x={seX + 4} y={seBY - 2} width={seW - 8} height={seZoneH} rx={3} fill="transparent" />
            </g>
          )
        }
      } else {
        els.push(<text key={K()} x={seX + 8} y={seBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
      }
      chipHighlight(seqHlKey, seX, seCardY, seW, seH, els)
      seqY = seCardY + seH
    }
  }

  // sub-decisions nested below body content — perguntas logo após o corpo (em cima)
  let afterZoneY = y + LBLH + bodH
  if (a.sub?.length) {
    let sY = afterZoneY + SG
    const subList = a.sub
    for (let subDi = 0; subDi < subList.length; subDi++) {
      const sub = subList[subDi]
      const sdW = DDW          // mesmo tamanho do diamante top-level
      const sdX = cx - sdW / 2

      // PACOTES chip above sub-decision diamond
      const subPkgChipH = dDecPkgH(sub)
      if (subPkgChipH > 0) {
        const schipW = AW - 8, schipX = cx - schipW / 2
        const schipH = alwChipH(sub.packages!.length)
        const schipCardY = sY
        const subCapRef: DecRef = { ...ref, sub: [...ref.sub, ai, subDi] }
        const subPkgHlKey = `chip:decpkg:${subCapRef.secIdx}:${subCapRef.decIdx}:${subCapRef.sub.join(',')}`
        els.push(<line key={K()} x1={cx} y1={sY - SG + 4} x2={cx} y2={schipCardY - 5} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
        els.push(<rect key={K()} x={schipX} y={schipCardY} width={schipW} height={schipH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
        els.push(<rect key={K()} x={schipX} y={schipCardY} width={schipW} height={LBLH} rx={4} fill={p.lbl} />)
        els.push(<rect key={K()} x={schipX} y={schipCardY + LBLH - 4} width={schipW} height={4} fill={p.lbl} />)
        els.push(<text key={K()} x={schipX + 8} y={schipCardY + LBLH * 0.68} fontSize={F_M} fontWeight={700} fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={0.8}>PACOTES</text>)
        const sPkgBY = schipCardY + LBLH + BPAD
        sub.packages!.forEach((pkg, pi) => {
          drawPkgRow(schipX, sPkgBY + pi * PKG, PKG, schipW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
        })
        if (canEdit) {
          const capSubRef2 = subCapRef
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, 'PACOTES', [], {
              getList: (s) => resolveRef(s, capSubRef2)?.packages ?? [],
              onAdd: () => fire({ type: 'p_add_dec_pkg', ref: capSubRef2 }),
              onMove: (idx, dir) => fire({ type: 'p_move_dec_pkg', ref: capSubRef2, pkgIdx: idx, dir }),
              onRemove: (idx) => fire({ type: 'p_remove_dec_pkg', ref: capSubRef2, pkgIdx: idx }),
              onCondition: (idx, condition) => fire({ type: 'p_set_pkg_condition', ref: capSubRef2, pkgIdx: idx, condition }),
            }, subPkgHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs('Gerenciar pacotes da sub-pergunta')}>
              <rect x={schipX + 4} y={schipCardY + 4} width={schipW - 30} height={LBLH - 8} rx={2} fill="transparent" />
            </g>
          )
          // × excluir chip de pacotes (canto direito, igual aos demais chips)
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_clear_dec_pkgs', ref: capSubRef2 }) }}
               style={{ cursor: 'pointer' }} {...tipAttrs('Excluir chip de pacotes')}>
              <circle cx={schipX + schipW - 9} cy={schipCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
              {svgIco(PiTrashFill, schipX + schipW - 9, schipCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          pushPkgFlagOverlays(schipX, sPkgBY, sub.packages!, p,
            (pi) => fire({ type: 'p_toggle_dec_pkg_contingency', ref: subCapRef, pkgIdx: pi }), els)
        }
        chipHighlight(subPkgHlKey, schipX, schipCardY, schipW, schipH, els)
        els.push(<line key={K()} x1={cx} y1={schipCardY + schipH + 2} x2={cx} y2={sY + subPkgChipH - 5}
          stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
      } else {
        els.push(<line key={K()} x1={cx} y1={sY - SG + 4} x2={cx} y2={sY - 5} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
      }

      const actualSY = sY + subPkgChipH
      const subDirty = !!sub._dirty
      const isSubRigQ = RIG_TYPE_Q_RE.test(sub.question.trim())
      const subQd = isSubRigQ ? rigQDec() : qDec()
      els.push(
        <polygon key={K()} points={`${cx},${actualSY} ${sdX + sdW},${actualSY + DH / 2} ${cx},${actualSY + DH} ${sdX},${actualSY + DH / 2}`}
          fill={subDirty ? DIRTY_CARD : subQd.fill} stroke={subDirty ? DIRTY_STROKE : subQd.stroke} strokeWidth={subDirty ? 2 : (isSubRigQ ? 2 : 1.5)} />
      )
      // Mesma posição do ícone que no top-level (fonte e largura agora idênticas)
      if (isSubRigQ) drawDerrickIcon(cx - 62, actualSY + DH / 2, subQd.text, els)
      drawNoDefaultWarn(sub.answers, cx, actualSY, sdW, els)
      drawDiamondLabel(cx, actualSY, sub.question, subQd.text, els)
      // Referência da sub-decisão = decisão atual + passo [resposta atual, índice da sub].
      const childRef: DecRef = { ...ref, sub: [...ref.sub, ai, subDi] }
      if (canEdit) {
        const capSubDi = subDi
        // × remove sub-decision diamond
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); fire({ type: 'p_remove_dec', ref: childRef }) }}
             style={{ cursor: 'pointer' }} {...tip('Remover pergunta')}>
            <circle cx={sdX + sdW + 11} cy={actualSY + DH / 2} r={9} fill="#ef4444" opacity={0.9} />
            {svgIco(PiTrashFill, sdX + sdW + 11, actualSY + DH / 2 + 3.5, 12, 'white')}
          </g>
        )
        // ⟲ "já respondida no escopo" (só em sub-perguntas repetidas)
        if (_dupQuestions.has(sub.question.trim())) {
          drawReuseToggle(sdX + sdW + 11, actualSY + DH / 2 + 26, !!sub.reuseScope,
            () => fire({ type: 'p_toggle_reuse', ref: childRef }), els)
        }
        // Clique no diamante da sub-pergunta: em modo "clique na origem" seleciona a origem; caso contrário, abre sidebar.
        const capSubQ = sub.question
        const subHlKey = `q:${childRef.secIdx}:${childRef.decIdx}:${childRef.sub.join(',')}`
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => {
            e.stopPropagation()
            if (_pickMode) { fire({ type: 'pick_source', ref: childRef, question: capSubQ }); return }
            const subItems: MenuItem[] = [
              { label: 'Adicionar resposta', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'p_add_ans', ref: childRef }) },
              { label: 'Adicionar pacote à sub-pergunta', glyph: '📦', color: '#f97316', onClick: () => fire({ type: 'p_add_dec_pkg', ref: childRef }) },
              { label: 'Adicionar entrada após convergência', glyph: '⤵', color: '#7c3aed', onClick: () => fire({ type: 'p_dec_add_after', ref: childRef }) },
              { label: 'Inserir sub-pergunta acima', glyph: '↑', color: '#22d3ee', onClick: () => fire({ type: 'p_insert_sub_dec', ref, ansIdx: ai, subIdx: capSubDi }) },
              { label: 'Inserir sub-pergunta abaixo', glyph: '↓', color: '#22d3ee', onClick: () => fire({ type: 'p_insert_sub_dec', ref, ansIdx: ai, subIdx: capSubDi + 1 }) },
              { label: 'Remover pergunta', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_dec', ref: childRef }) },
            ]
            openMenu(e, capSubQ, subItems, undefined, subHlKey, (v) => fire({ type: 'p_set_q', ref: childRef, value: v }))
          }} style={{ cursor: _pickMode ? 'copy' : 'pointer' }} {...tip(_pickMode ? 'Selecionar como origem' : 'Ações da pergunta')}>
            <polygon points={`${cx},${actualSY} ${sdX + sdW - 14},${actualSY + DH / 2} ${cx},${actualSY + DH} ${sdX + 14},${actualSY + DH / 2}`}
              fill="transparent" />
          </g>
        )
        // Anel de destaque da sub-pergunta selecionada
        if (_hlKey === subHlKey) {
          els.push(<polygon key={K()}
            points={`${cx},${actualSY - 3} ${sdX + sdW + 3},${actualSY + DH / 2} ${cx},${actualSY + DH + 3} ${sdX - 3},${actualSY + DH / 2}`}
            fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth={2.5} />)
        }
      }
      const subDisp = canEdit ? sub.answers.map(a => ({ ans: a } as DisplayAns)) : toDisplayList(sub.answers)
      const saY = actualSY + DH + AV
      const tW = subDisp.reduce((s, da, i) => s + aW(da.ans) + (i ? AG : 0), 0)
      let saX = cx - tW / 2
      fanOut(cx, actualSY + DH, subDisp.map(d => d.ans), saX, saY, p.arr, `url(#arr_${pc})`, els)
      saX = cx - tW / 2
      for (let subAi = 0; subAi < subDisp.length; subAi++) {
        const sda = subDisp[subAi]
        const saw = aW(sda.ans)
        const subAnsIdx = canEdit ? subAi : sub.answers.indexOf(sda.ans)
        renderAnswer(sda.ans, saX, saY, saw, saX + saw / 2, pc, els, childRef, subAnsIdx, sda.label2)
        saX += saw + AG
      }
      // Convergência das respostas da sub-pergunta (fan-in) → linha contínua após a sub-árvore.
      const subMaxAH = Math.max(...subDisp.map(d => aH(d.ans)))
      const subMergeY = saY + subMaxAH
      fanIn(subDisp.map(d => d.ans), cx - tW / 2, saY, subMergeY, cx, p.arr, els)
      const subConvPad = subDisp.length > 1 ? (CR + 14) : 0
      if (subConvPad > 0) {
        els.push(<line key={K()} x1={cx} y1={subMergeY + CR + 4} x2={cx} y2={subMergeY + subConvPad - 1} stroke={p.arr} strokeWidth={1.5} />)
      }
      // ── Zona "após convergência" da SUB-PERGUNTA (sub.after): chips de pacotes que se aplicam
      //    após a convergência das respostas desta sub-pergunta, + botão ＋ para adicionar. ──
      let subAfterY = subMergeY + subConvPad
      const subAfterList = sub.after ?? []
      const safW = AW - 8, safX = cx - safW / 2
      for (let safi = 0; safi < subAfterList.length; safi++) {
        const saf = subAfterList[safi]
        const safH = seqEntryH(saf)
        const safCardY = subAfterY + AFTER_GAP
        els.push(<line key={K()} x1={cx} y1={subAfterY} x2={cx} y2={safCardY - 4} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
        els.push(<rect key={K()} x={safX} y={safCardY} width={safW} height={safH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
        els.push(<rect key={K()} x={safX} y={safCardY} width={safW} height={LBLH} rx={4} fill={p.lbl} />)
        els.push(<rect key={K()} x={safX} y={safCardY + LBLH - 4} width={safW} height={4} fill={p.lbl} />)
        const safHlKey = `chip:saf:${childRef.secIdx}:${childRef.decIdx}:${childRef.sub.join(',')}:${safi}`
        if (canEdit) {
          const capSafi = safi, capSafLabel = saf.label, capChildRef2 = childRef
          const safMenuItems: MenuItem[] = [
            { label: 'Adicionar pacote', glyph: '📦', color: '#0ea5e9', onClick: () => fire({ type: 'p_dec_add_after_pkg', ref: capChildRef2, afterIdx: capSafi }) },
            { label: 'Inserir bloco antes', glyph: '↑', color: '#22d3ee', onClick: () => fire({ type: 'p_dec_add_after', ref: childRef, atIdx: capSafi }) },
            { label: 'Inserir bloco depois', glyph: '↓', color: '#22d3ee', onClick: () => fire({ type: 'p_dec_add_after', ref: childRef, atIdx: capSafi + 1 }) },
            { label: 'Mover bloco acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_dec_move_after', ref: childRef, afterIdx: capSafi, dir: 'up' }) },
            { label: 'Mover bloco abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_dec_move_after', ref: childRef, afterIdx: capSafi, dir: 'down' }) },
            { label: 'Remover bloco', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_dec_remove_after', ref: childRef, afterIdx: capSafi }) },
          ]
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_dec_add_after', ref: childRef, atIdx: capSafi }) }} style={{ cursor: 'pointer' }} {...tipAttrs('Inserir bloco após convergência antes deste')}>
              <circle cx={safX + 10} cy={safCardY + LBLH / 2} r={6.5} fill={p.code} opacity={0.85} />
              {svgIco(PiPlusBold, safX + 10, safCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_dec_remove_after', ref: childRef, afterIdx: capSafi }) }} style={{ cursor: 'pointer' }} {...tipAttrs('Remover bloco')}>
              <circle cx={safX + safW - 9} cy={safCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
              {svgIco(PiTrashFill, safX + safW - 9, safCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capSafLabel || 'Após convergência', safMenuItems, {
              getList: (s) => resolveRef(s, capChildRef2)?.after?.[capSafi]?.packages ?? [],
              onAdd: () => fire({ type: 'p_dec_add_after_pkg', ref: capChildRef2, afterIdx: capSafi }),
              onMove: (idx, dir) => fire({ type: 'p_dec_move_after_pkg', ref: capChildRef2, afterIdx: capSafi, pkgIdx: idx, dir }),
              onRemove: (idx) => fire({ type: 'p_dec_remove_after_pkg', ref: capChildRef2, afterIdx: capSafi, pkgIdx: idx }),
            }, safHlKey, (v) => fire({ type: 'p_set_dec_after_label', ref: childRef, afterIdx: capSafi, value: v }))} style={{ cursor: 'pointer' }} {...tipAttrs('Opções do bloco')}>
              <rect x={safX + 22} y={safCardY + 1} width={safW - 42} height={LBLH - 2} rx={2} fill="transparent" />
            </g>
          )
        }
        els.push(<text key={K()} x={canEdit ? safX + 22 : safX + 8} y={safCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600} fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">{tr(saf.label || 'Após convergência', canEdit ? 20 : 40)}</text>)
        const safPkgs = saf.packages ?? []
        const safBY = safCardY + LBLH + BPAD
        if (safPkgs.length || canEdit) {
          safPkgs.forEach((pkg, pi) => {
            drawPkgRow(safX, safBY + pi * PKG, PKG, safW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
          })
          if (!safPkgs.length) {
            els.push(<text key={K()} x={safX + 8} y={safBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
          }
          if (canEdit) {
            const capSafi2 = safi, capChildRef = childRef, capSafLabel2 = saf.label
            els.push(
              <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capSafLabel2 || 'Após convergência', [], {
                getList: (s) => resolveRef(s, capChildRef)?.after?.[capSafi2]?.packages ?? [],
                onAdd: () => fire({ type: 'p_dec_add_after_pkg', ref: capChildRef, afterIdx: capSafi2 }),
                onMove: (idx, dir) => fire({ type: 'p_dec_move_after_pkg', ref: capChildRef, afterIdx: capSafi2, pkgIdx: idx, dir }),
                onRemove: (idx) => fire({ type: 'p_dec_remove_after_pkg', ref: capChildRef, afterIdx: capSafi2, pkgIdx: idx }),
              }, safHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs(safPkgs.length ? 'Gerenciar pacotes' : 'Adicionar pacote')}>
                <rect x={safX + 4} y={safBY - 2} width={safW - 8} height={Math.max(safPkgs.length * PKG, NOTE_R) + 4} rx={3} fill="transparent" />
              </g>
            )
          }
        } else {
          els.push(<text key={K()} x={safX + 8} y={safBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
        }
        chipHighlight(safHlKey, safX, safCardY, safW, safH, els)
        subAfterY = safCardY + safH
      }
      sY = subAfterY + SG   // próximo diamante
    }
    afterZoneY = sY - SG
    // Chip "Pacotes" APÓS as perguntas aninhadas: só exibido quando há pacotes (não mais auto-vazio).
    if (pkgs.length > 0) {
      const chipH = aPkgChipH(pkgs.length)
      const chipCardY = afterZoneY + SG
      const chipW = AW - 8, chipX = cx - chipW / 2
      els.push(<line key={K()} x1={cx} y1={afterZoneY} x2={cx} y2={chipCardY - 4}
        stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
      els.push(<rect key={K()} x={chipX} y={chipCardY} width={chipW} height={chipH} rx={4}
        fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
      els.push(<rect key={K()} x={chipX} y={chipCardY} width={chipW} height={LBLH} rx={4} fill={p.lbl} />)
      els.push(<rect key={K()} x={chipX} y={chipCardY + LBLH - 4} width={chipW} height={4} fill={p.lbl} />)
      els.push(
        <text key={K()} x={chipX + 8} y={chipCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600}
          fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">
          Pacotes
        </text>
      )
      const pkgBY = chipCardY + LBLH + BPAD
      if (pkgs.length > 0) {
        pkgs.forEach((pkg, i) => {
          drawPkgRow(chipX, pkgBY + i * PKG, PKG, chipW, pkg, p, pkgHitIdx.has(i), null, null, els)
        })
      } else {
        els.push(<text key={K()} x={chipX + 8} y={pkgBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
      }
      const pkgChipHlKey = `chip:pkg:${ref.secIdx}:${ref.decIdx}:${ref.sub.join(',')}:${ai}`
      if (canEdit) {
        const capRef2 = ref, capAi2 = ai, capSubLen = a.sub?.length ?? 0
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, 'Pacotes', [
            { label: 'Inserir sub-pergunta acima dos pacotes', glyph: '↑', color: '#22d3ee',
              onClick: () => fire({ type: 'p_insert_sub_dec', ref, ansIdx: ai, subIdx: capSubLen }) },
            { label: 'Inserir sub-pergunta abaixo dos pacotes', glyph: '↓', color: '#22d3ee',
              onClick: () => fire({ type: 'p_add_aftersub_dec', ref, ansIdx: ai }) },
          ], {
            getList: (s) => resolveRef(s, capRef2)?.answers[capAi2]?.packages ?? [],
            onAdd: () => fire({ type: 'p_add_pkg', ref, ansIdx: ai }),
            onMove: (idx, dir) => fire({ type: 'p_move_pkg', ref, ansIdx: ai, pkgIdx: idx, dir }),
            onRemove: (idx) => fire({ type: 'p_remove_pkg', ref, ansIdx: ai, pkgIdx: idx }),
            onCondition: (idx, condition) => fire({ type: 'p_set_pkg_condition', ref, ansIdx: ai, pkgIdx: idx, condition }),
          }, pkgChipHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs('Gerenciar pacotes')}>
            <rect x={chipX + 4} y={chipCardY + 4} width={chipW - 30} height={LBLH - 8} rx={2} fill="transparent" />
          </g>
        )
        // Zona clicável sobre a área de pacotes → abre o gerenciador direto
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, 'Pacotes', [], {
            getList: (s) => resolveRef(s, capRef2)?.answers[capAi2]?.packages ?? [],
            onAdd: () => fire({ type: 'p_add_pkg', ref, ansIdx: ai }),
            onMove: (idx, dir) => fire({ type: 'p_move_pkg', ref, ansIdx: ai, pkgIdx: idx, dir }),
            onRemove: (idx) => fire({ type: 'p_remove_pkg', ref, ansIdx: ai, pkgIdx: idx }),
            onCondition: (idx, condition) => fire({ type: 'p_set_pkg_condition', ref, ansIdx: ai, pkgIdx: idx, condition }),
          }, pkgChipHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs('Gerenciar pacotes')}>
            <rect x={chipX + 4} y={pkgBY - 2} width={chipW - 8} height={Math.max(pkgs.length * PKG, NOTE_R) + 4} rx={3} fill="transparent" />
          </g>
        )
        // × excluir chip de pacotes (canto direito, igual aos demais chips)
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_clear_ans_pkgs', ref, ansIdx: ai }) }}
             style={{ cursor: 'pointer' }} {...tipAttrs('Excluir chip de pacotes')}>
            <circle cx={chipX + chipW - 9} cy={chipCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
            {svgIco(PiTrashFill, chipX + chipW - 9, chipCardY + LBLH / 2 + 3.5, 10, 'white')}
          </g>
        )
        if (pkgs.length > 0) {
          pushPkgFlagOverlays(chipX, pkgBY, pkgs, p,
            (pi) => fire({ type: 'p_toggle_ans_pkg_contingency', ref, ansIdx: ai, pkgIdx: pi }), els)
        }
      }
      chipHighlight(pkgChipHlKey, chipX, chipCardY, chipW, chipH, els)
      afterZoneY = chipCardY + chipH
    }
  }

  // Sub-perguntas APÓS o chip de Pacotes (ans.afterSub) — mesma renderização de a.sub
  // mas com índices negativos no childRef: afterSub[i] → subIdx = -(i+1).
  // Renderizado fora do bloco a.sub para funcionar mesmo sem sub-perguntas.
  {
    const afterSubList = a.afterSub ?? []
    for (let asDi = 0; asDi < afterSubList.length; asDi++) {
      const asSub = afterSubList[asDi]
      const asSY = afterZoneY + SG
      els.push(<line key={K()} x1={cx} y1={afterZoneY} x2={cx} y2={asSY - 5} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
      const asQd = RIG_TYPE_Q_RE.test(asSub.question.trim()) ? rigQDec() : qDec()
      const asX = cx - DDW / 2
      els.push(
        <polygon key={K()} points={`${cx},${asSY} ${asX + DDW},${asSY + DH / 2} ${cx},${asSY + DH} ${asX},${asSY + DH / 2}`}
          fill={asSub._dirty ? DIRTY_CARD : asQd.fill} stroke={asSub._dirty ? DIRTY_STROKE : asQd.stroke} strokeWidth={1.5} />
      )
      drawDiamondLabel(cx, asSY, asSub.question, asQd.text, els)
      const asChildRef: DecRef = { ...ref, sub: [...ref.sub, ai, -(asDi + 1)] }
      if (canEdit) {
        const capAsQ = asSub.question, capAsDi = asDi
        els.push(
          <g key={K()} onMouseDown={stopMD}
            onClick={(e) => { e.stopPropagation(); fire({ type: 'p_remove_aftersub_dec', ref, ansIdx: ai, afterSubIdx: capAsDi }) }}
            style={{ cursor: 'pointer' }} {...tip('Remover pergunta')}>
            <circle cx={asX + DDW + 11} cy={asSY + DH / 2} r={9} fill="#ef4444" opacity={0.9} />
            {svgIco(PiTrashFill, asX + DDW + 11, asSY + DH / 2 + 3.5, 12, 'white')}
          </g>
        )
        const capAsHlKey = `q:${asChildRef.secIdx}:${asChildRef.decIdx}:${asChildRef.sub.join(',')}`
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => {
            e.stopPropagation()
            openMenu(e, capAsQ, [
              { label: 'Adicionar resposta', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'p_add_ans', ref: asChildRef }) },
              { label: 'Adicionar entrada após convergência', glyph: '⤵', color: '#7c3aed', onClick: () => fire({ type: 'p_dec_add_after', ref: asChildRef }) },
              { label: 'Remover pergunta', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_aftersub_dec', ref, ansIdx: ai, afterSubIdx: capAsDi }) },
            ], undefined, capAsHlKey, (v) => fire({ type: 'p_set_q', ref: asChildRef, value: v }))
          }} style={{ cursor: 'pointer' }} {...tip('Ações da pergunta')}>
            <polygon points={`${cx},${asSY} ${asX + DDW - 14},${asSY + DH / 2} ${cx},${asSY + DH} ${asX + 14},${asSY + DH / 2}`} fill="transparent" />
          </g>
        )
        // Anel de destaque
        if (_hlKey === capAsHlKey) {
          els.push(<polygon key={K()}
            points={`${cx},${asSY - 3} ${asX + DDW + 3},${asSY + DH / 2} ${cx},${asSY + DH + 3} ${asX - 3},${asSY + DH / 2}`}
            fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth={2.5} />)
        }
      }
      const asDisp = canEdit ? asSub.answers.map(a => ({ ans: a } as DisplayAns)) : toDisplayList(asSub.answers)
      const asAnsY = asSY + DH + AV
      const asTW = asDisp.reduce((s, da, i) => s + aW(da.ans) + (i ? AG : 0), 0)
      let asAX = cx - asTW / 2
      fanOut(cx, asSY + DH, asDisp.map(d => d.ans), asAX, asAnsY, p.arr, `url(#arr_${pc})`, els)
      asAX = cx - asTW / 2
      for (let asAi = 0; asAi < asDisp.length; asAi++) {
        const asDA = asDisp[asAi]
        const asAW = aW(asDA.ans)
        const asAnsIdx = canEdit ? asAi : asSub.answers.indexOf(asDA.ans)
        renderAnswer(asDA.ans, asAX, asAnsY, asAW, asAX + asAW / 2, pc, els, asChildRef, asAnsIdx, asDA.label2)
        asAX += asAW + AG
      }
      const asMaxAH = Math.max(...asDisp.map(d => aH(d.ans)))
      const asMergeY = asAnsY + asMaxAH
      fanIn(asDisp.map(d => d.ans), cx - asTW / 2, asAnsY, asMergeY, cx, p.arr, els)
      const asConvPad = asDisp.length > 1 ? (CR + 14) : 0
      if (asConvPad > 0) {
        els.push(<line key={K()} x1={cx} y1={asMergeY + CR + 4} x2={cx} y2={asMergeY + asConvPad - 1} stroke={p.arr} strokeWidth={1.5} />)
      }
      afterZoneY = asMergeY + asConvPad
      // ── Zona "após convergência" do afterSub (asSub.after): chips de pacotes ──
      const asSubAfterList = asSub.after ?? []
      const asSafW = AW - 8, asSafX = cx - asSafW / 2
      for (let asSafi = 0; asSafi < asSubAfterList.length; asSafi++) {
        const asSaf = asSubAfterList[asSafi]
        const asSafH = seqEntryH(asSaf)
        const asSafCardY = afterZoneY + AFTER_GAP
        els.push(<line key={K()} x1={cx} y1={afterZoneY} x2={cx} y2={asSafCardY - 4} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
        els.push(<rect key={K()} x={asSafX} y={asSafCardY} width={asSafW} height={asSafH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
        els.push(<rect key={K()} x={asSafX} y={asSafCardY} width={asSafW} height={LBLH} rx={4} fill={p.lbl} />)
        els.push(<rect key={K()} x={asSafX} y={asSafCardY + LBLH - 4} width={asSafW} height={4} fill={p.lbl} />)
        const asSafHlKey = `chip:assaf:${asChildRef.secIdx}:${asChildRef.decIdx}:${asChildRef.sub.join(',')}:${asSafi}`
        if (canEdit) {
          const capAsSafi = asSafi, capAsSafLabel = asSaf.label, capAsChildRef3 = asChildRef
          const asSafMenuItems: MenuItem[] = [
            { label: 'Adicionar pacote', glyph: '📦', color: '#0ea5e9', onClick: () => fire({ type: 'p_dec_add_after_pkg', ref: capAsChildRef3, afterIdx: capAsSafi }) },
            { label: 'Inserir bloco antes', glyph: '↑', color: '#22d3ee', onClick: () => fire({ type: 'p_dec_add_after', ref: asChildRef, atIdx: capAsSafi }) },
            { label: 'Inserir bloco depois', glyph: '↓', color: '#22d3ee', onClick: () => fire({ type: 'p_dec_add_after', ref: asChildRef, atIdx: capAsSafi + 1 }) },
            { label: 'Mover bloco acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_dec_move_after', ref: asChildRef, afterIdx: capAsSafi, dir: 'up' }) },
            { label: 'Mover bloco abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_dec_move_after', ref: asChildRef, afterIdx: capAsSafi, dir: 'down' }) },
            { label: 'Remover bloco', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_dec_remove_after', ref: asChildRef, afterIdx: capAsSafi }) },
          ]
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_dec_add_after', ref: asChildRef, atIdx: capAsSafi }) }} style={{ cursor: 'pointer' }} {...tipAttrs('Inserir bloco após convergência antes deste')}>
              <circle cx={asSafX + 10} cy={asSafCardY + LBLH / 2} r={6.5} fill={p.code} opacity={0.85} />
              {svgIco(PiPlusBold, asSafX + 10, asSafCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_dec_remove_after', ref: asChildRef, afterIdx: capAsSafi }) }} style={{ cursor: 'pointer' }} {...tipAttrs('Remover bloco')}>
              <circle cx={asSafX + asSafW - 9} cy={asSafCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
              {svgIco(PiTrashFill, asSafX + asSafW - 9, asSafCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capAsSafLabel || 'Após convergência', asSafMenuItems, {
              getList: (s) => resolveRef(s, capAsChildRef3)?.after?.[capAsSafi]?.packages ?? [],
              onAdd: () => fire({ type: 'p_dec_add_after_pkg', ref: capAsChildRef3, afterIdx: capAsSafi }),
              onMove: (idx, dir) => fire({ type: 'p_dec_move_after_pkg', ref: capAsChildRef3, afterIdx: capAsSafi, pkgIdx: idx, dir }),
              onRemove: (idx) => fire({ type: 'p_dec_remove_after_pkg', ref: capAsChildRef3, afterIdx: capAsSafi, pkgIdx: idx }),
            }, asSafHlKey, (v) => fire({ type: 'p_set_dec_after_label', ref: asChildRef, afterIdx: capAsSafi, value: v }))} style={{ cursor: 'pointer' }} {...tipAttrs('Opções do bloco')}>
              <rect x={asSafX + 22} y={asSafCardY + 1} width={asSafW - 42} height={LBLH - 2} rx={2} fill="transparent" />
            </g>
          )
        }
        els.push(<text key={K()} x={canEdit ? asSafX + 22 : asSafX + 8} y={asSafCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600} fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">{tr(asSaf.label || 'Após convergência', canEdit ? 20 : 40)}</text>)
        const asSafPkgs = asSaf.packages ?? []
        const asSafBY = asSafCardY + LBLH + BPAD
        if (asSafPkgs.length || canEdit) {
          asSafPkgs.forEach((pkg, pi) => {
            drawPkgRow(asSafX, asSafBY + pi * PKG, PKG, asSafW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
          })
          if (!asSafPkgs.length) {
            els.push(<text key={K()} x={asSafX + 8} y={asSafBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
          }
          if (canEdit) {
            const capAsSafi2 = asSafi, capAsChildRef2 = asChildRef, capAsSafLabel2 = asSaf.label
            els.push(
              <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capAsSafLabel2 || 'Após convergência', [], {
                getList: (s) => resolveRef(s, capAsChildRef2)?.after?.[capAsSafi2]?.packages ?? [],
                onAdd: () => fire({ type: 'p_dec_add_after_pkg', ref: capAsChildRef2, afterIdx: capAsSafi2 }),
                onMove: (idx, dir) => fire({ type: 'p_dec_move_after_pkg', ref: capAsChildRef2, afterIdx: capAsSafi2, pkgIdx: idx, dir }),
                onRemove: (idx) => fire({ type: 'p_dec_remove_after_pkg', ref: capAsChildRef2, afterIdx: capAsSafi2, pkgIdx: idx }),
              }, asSafHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs(asSafPkgs.length ? 'Gerenciar pacotes' : 'Adicionar pacote')}>
                <rect x={asSafX + 4} y={asSafBY - 2} width={asSafW - 8} height={Math.max(asSafPkgs.length * PKG, NOTE_R) + 4} rx={3} fill="transparent" />
              </g>
            )
          }
        } else {
          els.push(<text key={K()} x={asSafX + 8} y={asSafBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
        }
        chipHighlight(asSafHlKey, asSafX, asSafCardY, asSafW, asSafH, els)
        afterZoneY = asSafCardY + asSafH
      }
    }
  }
  // Reserva o espaço das entradas sequenciais (renderizadas acima, abaixo do chip Pacotes):
  // a zona "após convergência" deve começar abaixo delas.
  afterZoneY += seqH(a)

  // ── Zona "após convergência" (a.after): blocos de pacotes/sequenciais no rodapé do chip,
  //    + botão ＋ com o menu de ações nesta posição (após toda a subárvore do chip). ──
  {
    const afterList = a.after ?? []
    let afY = afterZoneY
    for (let afi = 0; afi < afterList.length; afi++) {
      const af = afterList[afi]
      const afH = seqEntryH(af)
      const afCardY = afY + SEQ_GAP
      // Chip compacto e centrado (largura fixa AW-8), igual aos demais chips secundários.
      const afW = AW - 8, afX = cx - afW / 2
      els.push(<line key={K()} x1={cx} y1={afY} x2={cx} y2={afCardY - 4} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
      els.push(<rect key={K()} x={afX} y={afCardY} width={afW} height={afH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
      els.push(<rect key={K()} x={afX} y={afCardY} width={afW} height={LBLH} rx={4} fill={p.lbl} />)
      els.push(<rect key={K()} x={afX} y={afCardY + LBLH - 4} width={afW} height={4} fill={p.lbl} />)
      if (canEdit) {
        const capAfi = afi
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_remove_after', ref, ansIdx: ai, afterIdx: capAfi }) }} style={{ cursor: 'pointer' }} {...tipAttrs('Remover bloco')}>
            <circle cx={afX + afW - 9} cy={afCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
            {svgIco(PiTrashFill, afX + afW - 9, afCardY + LBLH / 2 + 3.5, 10, 'white')}
          </g>
        )
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); fire({ type: 'p_edit_after_label', ref, ansIdx: ai, afterIdx: capAfi, current: af.label }) }} style={{ cursor: 'text' }}>
            <rect x={afX + 8} y={afCardY + 1} width={afW - 28} height={LBLH - 2} rx={2} fill="transparent" />
          </g>
        )
      }
      els.push(<text key={K()} x={afX + 8} y={afCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600} fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">{tr(af.label || 'Após convergência', 40)}</text>)
      const afPkgs = af.packages ?? []
      const afBY = afCardY + LBLH + BPAD
      const afHlKey = `chip:af:${ref.secIdx}:${ref.decIdx}:${ref.sub.join(',')}:${ai}:${afi}`
      if (afPkgs.length || canEdit) {
        afPkgs.forEach((pkg, pi) => {
          drawPkgRow(afX, afBY + pi * PKG, PKG, afW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
        })
        if (!afPkgs.length) {
          els.push(<text key={K()} x={afX + 8} y={afBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
        }
        if (canEdit) {
          const capAfi2 = afi, capRef3 = ref, capAi3 = ai, capAfLabel = af.label
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capAfLabel || 'Após convergência', [], {
              getList: (s) => resolveRef(s, capRef3)?.answers[capAi3]?.after?.[capAfi2]?.packages ?? [],
              onAdd: () => fire({ type: 'p_add_after_pkg', ref, ansIdx: ai, afterIdx: capAfi2 }),
              onMove: (idx, dir) => fire({ type: 'p_move_after_pkg', ref, ansIdx: ai, afterIdx: capAfi2, pkgIdx: idx, dir }),
              onRemove: (idx) => fire({ type: 'p_remove_after_pkg', ref, ansIdx: ai, afterIdx: capAfi2, pkgIdx: idx }),
            }, afHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs(afPkgs.length ? 'Gerenciar pacotes' : 'Adicionar pacote')}>
              <rect x={afX + 4} y={afBY - 2} width={afW - 8} height={Math.max(afPkgs.length * PKG, NOTE_R) + 4} rx={3} fill="transparent" />
            </g>
          )
        }
      } else {
        els.push(<text key={K()} x={afX + 8} y={afBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
      }
      chipHighlight(afHlKey, afX, afCardY, afW, afH, els)
      afY = afCardY + afH
    }
  }
}

// Draw a single decision diamond centered at (cx, topY)
function drawDiamond(cx: number, topY: number, w: number, text: string, _pc: PC, els: React.ReactNode[], dirty = false): void {
  const x = cx - w / 2
  const isRigQ = RIG_TYPE_Q_RE.test(text.trim())
  const qd = isRigQ ? rigQDec() : qDec()
  const pts = `${cx},${topY} ${x + w},${topY + DH / 2} ${cx},${topY + DH} ${x},${topY + DH / 2}`
  els.push(<polygon key={K()} points={pts} fill={dirty ? DIRTY_CARD : qd.fill} stroke={dirty ? DIRTY_STROKE : qd.stroke} strokeWidth={dirty ? 2 : (isRigQ ? 2 : 1.5)} />)
  if (isRigQ) drawDerrickIcon(cx - 62, topY + DH / 2, qd.text, els)
  drawDiamondLabel(cx, topY, text, qd.text, els)
  if (hit(text)) {
    els.push(<polygon key={K()} points={pts} fill="none" stroke={HIT_STROKE} strokeWidth={2.5} opacity={0.9} />)
  }
  _decPos.set(text, { cx, topY })
}

// Realça (modo edição) uma decisão sem resposta padrão (✦) — guia a montagem e evita
// que o stage 2 caia num default não-intencional. Anel âmbar tracejado + badge ⚠.
function drawNoDefaultWarn(answers: LAns[], cx: number, topY: number, w: number, els: React.ReactNode[]): void {
  if (!_editCb || answers.some(a => a.active)) return
  const x = cx - w / 2
  const pts = `${cx},${topY} ${x + w},${topY + DH / 2} ${cx},${topY + DH} ${x},${topY + DH / 2}`
  els.push(<polygon key={K()} points={pts} fill="none" stroke="#f59e0b" strokeWidth={1.6} strokeDasharray="4,2" opacity={0.85} />)
  // Badge ancorado ao meio da aresta superior-esquerda do losango (fica sobre a borda real,
  // não na quina vazia do bounding-box) — leitura clara de "pertence a esta pergunta".
  const bx = cx - w / 4, by = topY + DH / 4
  els.push(
    <g key={K()} {...tipAttrs('Sem resposta padrão — marque uma resposta com ✦')}>
      <circle cx={bx} cy={by} r={7} fill="#f59e0b" />
      <text x={bx} y={by + 3.5} fontSize={10} fontWeight={800} textAnchor="middle" fill="#1c1007">!</text>
    </g>
  )
}

// Draw one after-convergence DECISION (dec.afterDec[adIdx]): diamond + answer cards.
// Single level (sem sub/seq/goto). Returns the Y of the bottom edge.
function drawAfterDecision(
  ad: LDec, cx: number, topY: number, pc: PC,
  si: number, di: number, adIdx: number, els: React.ReactNode[],
  aeRef?: { afterIdx: number; isAfterSub: boolean; subIdx: number },
): number {
  const p = pal(pc)
  const edit = _editCb !== null
  const tip = (text: string) => ({
    onMouseEnter: (e: React.MouseEvent) => _tooltipCb?.({ text, x: e.clientX, y: e.clientY }),
    onMouseLeave: () => _tooltipCb?.(null),
  })
  const dY = topY + AFTER_GAP
  const dw = DDW   // mesma largura das demais perguntas (topo e sub) — consistência visual
  const dx = cx - dw / 2
  const ref: DecRef = aeRef
    ? { secIdx: si, decIdx: di, sub: [], aeRef }
    : { secIdx: si, decIdx: di, adIdx, sub: [] }
  const adHlKey = aeRef
    ? `q:ae:${si}:${di}:${aeRef.afterIdx}:${aeRef.isAfterSub ? 'as' : 's'}:${aeRef.subIdx}`
    : `q:${si}:${di}:ad${adIdx}`

  // Arrow from convergence trunk down to chip or diamond
  const adPkgChipH = dDecPkgH(ad)
  if (adPkgChipH > 0) {
    const achipW = AW - 8, achipX = cx - achipW / 2
    const achipH = alwChipH(ad.packages!.length)
    const achipCardY = topY + AFTER_GAP
    const adPkgHlKey = aeRef
      ? `chip:decpkg:ae:${si}:${di}:${aeRef.afterIdx}:${aeRef.subIdx}`
      : `chip:decpkg:ad:${si}:${di}:${adIdx}`
    const capAdRef: DecRef = ref
    els.push(<line key={K()} x1={cx} y1={topY} x2={cx} y2={achipCardY - 5} stroke={p.arr} strokeWidth={1.4} markerEnd={`url(#arr_${pc})`} />)
    els.push(<rect key={K()} x={achipX} y={achipCardY} width={achipW} height={achipH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
    els.push(<rect key={K()} x={achipX} y={achipCardY} width={achipW} height={LBLH} rx={4} fill={p.lbl} />)
    els.push(<rect key={K()} x={achipX} y={achipCardY + LBLH - 4} width={achipW} height={4} fill={p.lbl} />)
    els.push(<text key={K()} x={achipX + 8} y={achipCardY + LBLH * 0.68} fontSize={F_M} fontWeight={700} fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={0.8}>PACOTES</text>)
    const adPkgBY = achipCardY + LBLH + BPAD
    ad.packages!.forEach((pkg, pi) => {
      drawPkgRow(achipX, adPkgBY + pi * PKG, PKG, achipW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
    })
    if (edit) {
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, 'PACOTES', [], {
          getList: (s) => resolveRef(s, capAdRef)?.packages ?? [],
          onAdd: () => _editCb!({ type: 'p_add_dec_pkg', ref: capAdRef }),
          onMove: (idx, dir) => _editCb!({ type: 'p_move_dec_pkg', ref: capAdRef, pkgIdx: idx, dir }),
          onRemove: (idx) => _editCb!({ type: 'p_remove_dec_pkg', ref: capAdRef, pkgIdx: idx }),
        }, adPkgHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs('Gerenciar pacotes da pergunta')}>
          <rect x={achipX + 4} y={achipCardY + 4} width={achipW - 30} height={LBLH - 8} rx={2} fill="transparent" />
        </g>
      )
      // × excluir chip de pacotes (canto direito, igual aos demais chips)
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'p_clear_dec_pkgs', ref: capAdRef }) }}
           style={{ cursor: 'pointer' }} {...tipAttrs('Excluir chip de pacotes')}>
          <circle cx={achipX + achipW - 9} cy={achipCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
          {svgIco(PiTrashFill, achipX + achipW - 9, achipCardY + LBLH / 2 + 3.5, 10, 'white')}
        </g>
      )
      pushPkgFlagOverlays(achipX, adPkgBY, ad.packages!, p,
        (pi) => _editCb!({ type: 'p_toggle_dec_pkg_contingency', ref: capAdRef, pkgIdx: pi }), els)
    }
    chipHighlight(adPkgHlKey, achipX, achipCardY, achipW, achipH, els)
    els.push(<line key={K()} x1={cx} y1={achipCardY + achipH + 2} x2={cx} y2={dY - 5} stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${pc})`} />)
  } else {
    // Arrow from convergence trunk down to the diamond
    els.push(<line key={K()} x1={cx} y1={topY} x2={cx} y2={dY - 5} stroke={p.arr} strokeWidth={1.4} markerEnd={`url(#arr_${pc})`} />)
  }

  // Diamond (cor de pergunta; destaque quando alterado/não salvo)
  const adDirty = !!ad._dirty
  const adQd = qDec()
  els.push(<polygon key={K()} points={`${cx},${dY} ${dx + dw},${dY + DH / 2} ${cx},${dY + DH} ${dx},${dY + DH / 2}`} fill={adDirty ? DIRTY_CARD : adQd.fill} stroke={adDirty ? DIRTY_STROKE : adQd.stroke} strokeWidth={adDirty ? 2 : 1.5} />)
  drawNoDefaultWarn(ad.answers, cx, dY, dw, els)
  drawDiamondLabel(cx, dY, ad.question, adQd.text, els)
  if (hit(ad.question)) {
    els.push(<polygon key={K()} points={`${cx},${dY} ${dx + dw},${dY + DH / 2} ${cx},${dY + DH} ${dx},${dY + DH / 2}`} fill="none" stroke={HIT_STROKE} strokeWidth={2.5} opacity={0.9} />)
  }
  if (edit) {
    // Clique no diamante após-convergência: seleciona origem em pickMode; caso contrário, abre sidebar.
    const capAdQ = ad.question
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => {
        e.stopPropagation()
        if (_pickMode) { _editCb!({ type: 'pick_source', ref, question: capAdQ }); return }
        const adItems: MenuItem[] = [
          { label: 'Adicionar resposta', glyph: '➕', color: '#0ea5e9', onClick: () => _editCb!({ type: 'p_add_ans', ref }) },
          { label: 'Adicionar pacote à pergunta', glyph: '📦', color: '#f97316', onClick: () => _editCb!({ type: 'p_add_dec_pkg', ref }) },
          { label: 'Remover pergunta', glyph: '×', color: '#ef4444', danger: true, onClick: () => _editCb!({ type: 'p_remove_dec', ref }) },
        ]
        openMenu(e, capAdQ, adItems, undefined, adHlKey, (v) => _editCb!({ type: 'p_set_q', ref, value: v }))
      }} style={{ cursor: _pickMode ? 'copy' : 'pointer' }} {...tip(_pickMode ? 'Selecionar como origem' : 'Ações da pergunta')}>
        <polygon points={`${cx},${dY} ${cx + dw / 2 - 14},${dY + DH / 2} ${cx},${dY + DH} ${cx - dw / 2 + 14},${dY + DH / 2}`} fill="transparent" />
      </g>
    )
    // Anel de destaque
    if (_hlKey === adHlKey) {
      const hw = dw / 2
      els.push(<polygon key={K()}
        points={`${cx},${dY - 3} ${cx + hw + 3},${dY + DH / 2} ${cx},${dY + DH + 3} ${cx - hw - 3},${dY + DH / 2}`}
        fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth={2.5} />)
    }
    // remove decision
    els.push(
      <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'p_remove_dec', ref }) }}
         style={{ cursor: 'pointer' }} {...tip('Remover pergunta')}>
        <circle cx={dx + dw + 11} cy={dY + DH / 2} r={9} fill="#ef4444" opacity={0.9} />
        {svgIco(PiTrashFill, dx + dw + 11, dY + DH / 2 + 3.5, 12, 'white')}
      </g>
    )
    // ⟲ "já respondida no escopo" (só em perguntas afterDec repetidas)
    if (_dupQuestions.has(ad.question.trim())) {
      drawReuseToggle(dx + dw + 11, dY + DH / 2 + 26, !!ad.reuseScope,
        () => _editCb!({ type: 'p_toggle_reuse', ref }), els)
    }
  }

  // Answers row
  const disp = edit ? ad.answers.map(a => ({ ans: a } as DisplayAns)) : toDisplayList(ad.answers)
  const ansY = dY + DH + AV
  const totW = disp.reduce((s, da, i) => s + aW(da.ans) + (i ? AG : 0), 0)
  let ax = cx - totW / 2
  fanOut(cx, dY + DH, disp.map(d => d.ans), ax, ansY, p.arr, `url(#arr_${pc})`, els)
  ax = cx - totW / 2
  for (let ai = 0; ai < disp.length; ai++) {
    const a = disp[ai].ans
    const aw = aW(a)
    const ax0 = ax
    const ansIdx = edit ? ai : ad.answers.indexOf(a)
    renderAnswer(a, ax0, ansY, aw, ax0 + aw / 2, pc, els, ref, ansIdx, disp[ai].label2)
    ax += aw + AG
  }
  const maxAH = Math.max(0, ...disp.map(d => aH(d.ans)))
  const mergeY = ansY + maxAH
  // Fan-in: reconverge as respostas ao tronco central. Sem isto a linha de fluxo "quebrava"
  // após uma pergunta de convergência com 2+ respostas (cards divergiam e nada os reunia
  // de volta ao centro antes do próximo passo).
  fanIn(disp.map(d => d.ans), cx - totW / 2, ansY, mergeY, cx, p.arr, els)
  const convPad = disp.length > 1 ? (CR + 14) : 0
  if (convPad > 0) {
    const jY = mergeY + CR + 4   // Y onde o fanIn converge ao centro
    els.push(<line key={K()} x1={cx} y1={jY} x2={cx} y2={mergeY + convPad - 1} stroke={p.arr} strokeWidth={1.5} />)
  }
  return mergeY + convPad
}


// Resumo do escopo referenciado por uma seção `ref` (rótulos das seções + nº de decisões),
// já expandindo refs aninhadas, para o preview do card de inclusão.
function refSourceInfo(scopeId: string): { labels: string[]; decisions: number } {
  const expanded = expandScopeRefs(resolveScopeSections(scopeId))
  let n = 0
  const walk = (decs?: LDec[]) => {
    for (const d of decs ?? []) { n++; for (const a of d.answers) walk(a.sub); walk(d.afterDec) }
  }
  for (const s of expanded) walk(s.decisions)
  return { labels: expanded.map(s => s.label), decisions: n }
}

// Menu de opções do bloco `ref` (botão ⋯ no header): expandir/colapsar, desanexar
// (editar só neste escopo) e editar o bloco geral (todos os escopos que o incluem).
function openRefBlockMenu(e: React.MouseEvent, sec: LSec, si: number): void {
  const scopeId = sec.ref!.scopeId
  const expanded = _expandedRefs.has(scopeId)
  const items: MenuItem[] = [
    { label: expanded ? 'Colapsar conteúdo' : 'Expandir conteúdo', glyph: expanded ? '↑' : '↓', color: '#818cf8',
      onClick: () => _toggleRefExpand?.(scopeId) },
  ]
  if (_editCb) {
    items.push(
      { label: 'Editar só neste escopo (desanexar)', glyph: '⤿', color: '#f59e0b',
        onClick: () => _editCb!({ type: 'detach_ref_section', secIdx: si }) },
      { label: 'Editar bloco — todos os escopos', glyph: '◇', color: '#6366f1',
        onClick: () => _editCb!({ type: 'edit_ref_block', scopeId }) },
    )
  }
  openMenu(e, `Bloco: ${getScopeLabel(scopeId) ?? sec.ref!.label ?? scopeId}`, items)
}

// Card de "bloco de lógica incluído" (seção `ref`). Colapsado: resumo compacto. Expandido:
// renderiza as seções internas read-only (vínculo vivo — não editável inline aqui). Um botão
// ⋯ abre o menu com desanexar (editar só neste escopo) ou editar o bloco geral.
function drawRefSection(sec: LSec, CX: number, Y: number, sw: number, si: number, total: number, els: React.ReactNode[]): void {
  const sx = CX - sw / 2
  const col = '#6366f1'
  const scopeId = sec.ref!.scopeId
  const info = refSourceInfo(scopeId)
  // Nome VIVO do bloco (resolvido pelo scopeId) — reflete renomeações; o label cacheado no
  // placeholder é só fallback (ex.: offline / bloco ainda não carregado).
  const title = getScopeLabel(scopeId) ?? sec.ref?.label ?? scopeId ?? sec.label
  const expanded = refIsExpanded(sec)
  const totalH = sTotalH(sec)
  const capSi = si

  // Container (borda tracejada) + header
  els.push(<rect key={K()} x={sx} y={Y} width={sw} height={totalH} rx={10}
    fill={_dark ? '#1e1b4b' : '#eef2ff'} stroke={col} strokeWidth={1.5} strokeDasharray="5,3" />)
  els.push(<rect key={K()} x={sx} y={Y} width={sw} height={SHH} rx={10} fill={col} />)
  els.push(<rect key={K()} x={sx} y={Y + SHH - 10} width={sw} height={10} fill={col} />)

  // Header clicável → alterna expandir/colapsar. Chevron indica o estado.
  const cy = Y + SHH / 2
  els.push(
    <g key={K()} onMouseDown={stopMD}
       onClick={(e) => { e.stopPropagation(); _toggleRefExpand?.(scopeId) }}
       style={{ cursor: 'pointer' }} {...tipAttrs(expanded ? 'Clique para colapsar o bloco' : 'Clique para expandir e ver o conteúdo do bloco')}>
      <rect x={sx} y={Y} width={sw - (_editCb ? 90 : 34)} height={SHH} fill="transparent" />
      <text x={sx + SPAD} y={Y + SHH * 0.63} fontSize={F_L} fontWeight={700}
        fill="white" fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={0.6}>
        {`${expanded ? '▾' : '▸'} 🔗 ${tr('Bloco: ' + title, _editCb ? 26 : 42)}`}
      </text>
    </g>
  )

  // Botão ⋯ (opções do bloco) — sempre presente
  const optX = sx + sw - SPAD - 12
  els.push(
    <g key={K()} onMouseDown={stopMD}
       onClick={(e) => { e.stopPropagation(); openRefBlockMenu(e, sec, capSi) }}
       style={{ cursor: 'pointer' }} {...tipAttrs('Opções do bloco')}>
      <circle cx={optX} cy={cy} r={9} fill="white" opacity={0.16} />
      {svgIco(PiListDashesFill, optX, cy + 3.5, 12, 'white')}
    </g>
  )

  // Modo edição: mover ↑↓ à esquerda do botão de opções
  if (_editCb) {
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { if (si > 0) { e.stopPropagation(); _editCb!({ type: 'move_section', secIdx: capSi, dir: 'up' }) } }}
         style={{ cursor: si > 0 ? 'pointer' : 'default' }} {...tipAttrs('Mover para cima')}>
        <circle cx={optX - 46} cy={cy} r={8} fill={col} stroke="white" strokeWidth={0.7} opacity={si > 0 ? 0.85 : 0.3} />
        <text x={optX - 46} y={cy + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="white" opacity={si > 0 ? 1 : 0.35}>↑</text>
      </g>
    )
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { if (si < total - 1) { e.stopPropagation(); _editCb!({ type: 'move_section', secIdx: capSi, dir: 'down' }) } }}
         style={{ cursor: si < total - 1 ? 'pointer' : 'default' }} {...tipAttrs('Mover para baixo')}>
        <circle cx={optX - 26} cy={cy} r={8} fill={col} stroke="white" strokeWidth={0.7} opacity={si < total - 1 ? 0.85 : 0.3} />
        <text x={optX - 26} y={cy + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="white" opacity={si < total - 1 ? 1 : 0.35}>↓</text>
      </g>
    )
  }

  if (!expanded) {
    // Resumo compacto (colapsado)
    const bodyY = Y + SHH + 16
    els.push(
      <text key={K()} x={sx + SPAD} y={bodyY} fontSize={F_M} fill={_dark ? '#c7d2fe' : '#4338ca'}
        fontFamily="ui-sans-serif,system-ui,sans-serif">
        {tr(info.labels.join(' · ') || '(bloco vazio)', Math.floor((sw - SPAD * 2) / 5.6))}
      </text>
    )
    els.push(
      <text key={K()} x={sx + SPAD} y={bodyY + 18} fontSize={F_S} fill={_dark ? '#818cf8' : '#6366f1'}
        fontFamily="ui-sans-serif,system-ui,sans-serif">
        {`atualiza automaticamente · ${info.labels.length} seção(ões) · ${info.decisions} decisão(ões)`}
      </text>
    )
    return
  }

  // Expandido: renderiza as seções internas read-only (salva/restaura _editCb e _flowIndex
  // para não permitir edição inline nem poluir o índice de navegação do escopo pai).
  els.push(
    <text key={K()} x={sx + SPAD} y={Y + SHH + 18} fontSize={F_S} fill={_dark ? '#818cf8' : '#6366f1'}
      fontFamily="ui-sans-serif,system-ui,sans-serif" fontStyle="italic">
      somente leitura · use “⋯ › Editar bloco” para modificar
    </text>
  )
  const inner = refInnerSecs(scopeId)
  const savedCb = _editCb, savedIdx = _flowIndex
  _editCb = null
  _flowIndex = []
  drawFlowColumn(inner, CX, Y + SHH + REF_EXP_TOP, els)
  _editCb = savedCb
  _flowIndex = savedIdx
}

// Draw a vertical flowchart (LSec[]) centered at colCX starting at topY.
// Returns the Y of the bottom edge of the last section.
function drawFlowColumn(secs: LSec[], colCX: number, topY: number, els: React.ReactNode[]): number {
  const CX = colCX
  let Y = topY

  // "+ inserir seção acima" button above the first section (edit mode only)
  if (_editCb && secs.length > 0) {
    const btnCY = Y + 12
    els.push(
      <g key={K()} onMouseDown={stopMD}
         onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_section', afterSecIdx: -1 }) }}
         style={{ cursor: 'pointer' }} {...tipAttrs('Inserir seção acima')}>
        <circle cx={CX} cy={btnCY} r={12} fill="#0f172a" opacity={0.95} />
        <circle cx={CX} cy={btnCY} r={12} fill="none" stroke="#60a5fa" strokeWidth={1.4} opacity={0.75} />
        <text x={CX} y={btnCY + 4.5} fontSize={15} fontWeight={700} textAnchor="middle" fill="#60a5fa" opacity={0.95}>+</text>
      </g>
    )
    Y += 32
  }

  for (let si = 0; si < secs.length; si++) {
    const sec = secs[si]
    const p = pal(sec.color)
    const sh = sTotalH(sec)
    const sw = sTotalW(sec)
    const sx = CX - sw / 2
    _flowIndex.push({ secIdx: si, label: sec.label, phase: sec.phase, y: Y, questions: [] })

    if (si > 0) {
      els.push(
        <line key={K()} x1={CX} y1={Y - SGAP + 6} x2={CX} y2={Y - 6}
          stroke={_dark ? '#475569' : '#94a3b8'} strokeWidth={2} markerEnd="url(#arr_inter)" />
      )
      // "+ inserir seção aqui" button in the gap between sections
      if (_editCb) {
        const capSiPrev = si - 1
        const btnCY = Y - SGAP / 2
        els.push(
          <g key={K()} onMouseDown={stopMD}
             onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'add_section', afterSecIdx: capSiPrev }) }}
             style={{ cursor: 'pointer' }} {...tipAttrs('Inserir seção aqui')}>
            <circle cx={CX} cy={btnCY} r={12} fill="#0f172a" opacity={0.95} />
            <circle cx={CX} cy={btnCY} r={12} fill="none" stroke="#60a5fa" strokeWidth={1.4} opacity={0.75} />
            {svgIco(PiPlusBold, CX, btnCY + 4.5, 14, '#60a5fa', 0.95)}
          </g>
        )
      }
    }

    // Seção de inclusão (ref): card compacto read-only, sem cabeçalho/decisões normais.
    if (sec.ref) {
      drawRefSection(sec, CX, Y, sw, si, secs.length, els)
      Y += sh + SGAP
      continue
    }

    // Section background + header
    const secHit = hit(sec.label)
    els.push(<rect key={K()} x={sx} y={Y} width={sw} height={sh} rx={10} fill={p.bg} stroke={secHit ? HIT_STROKE : p.bgB} strokeWidth={secHit ? 2.5 : 1.5} />)
    els.push(<rect key={K()} x={sx} y={Y} width={sw} height={SHH} rx={10} fill={secHit ? HIT_STROKE : p.hdr} />)
    els.push(<rect key={K()} x={sx} y={Y + SHH - 10} width={sw} height={10} fill={secHit ? HIT_STROKE : p.hdr} />)

    // Phase badge dimensions — computed before label so badgeX is available for truncation
    const bl = sec.phase.length * 6.5 + 12
    // Edit mode: reserve 112px on right for × seção(68) + gap(4) + ↓(16) + gap(2) + ↑(16) + gap(6)
    const badgeX = sx + sw - SPAD - bl - (_editCb ? 112 : 0)
    // Limite dinâmico: uso a largura disponível real entre o início do rótulo e o badge.
    // Preserva espaço de 10px antes do badge. F_L≈11px × 0.62 ≈ 6.8px/char.
    const maxLblChars = Math.max(14, Math.floor((badgeX - sx - SPAD - 10) / (F_L * 0.62)))

    els.push(
      <text key={K()} x={sx + SPAD} y={Y + SHH * 0.63} fontSize={F_L} fontWeight={700}
        fill={p.hdrT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={1.2}>
        {tr(sec.label, maxLblChars)}
      </text>
    )

    // Phase badge
    if (_editCb) {
      const capSi = si, capPhase = sec.phase, capLbl = sec.label
      const movBtnCY = Y + SHH / 2
      const movUpCX = sx + sw - 116   // ↑ center X (right-to-left: SPAD+×seção+gap+↓+gap+half)
      const movDnCX = sx + sw - 98    // ↓ center X

      // Phase badge (clickable)
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'edit_section_phase', secIdx: capSi, current: capPhase }) }}
           style={{ cursor: 'pointer' }} {...tipAttrs('Editar fase')}>
          <rect x={badgeX} y={Y + 9} width={bl} height={17} rx={8} fill={p.bb} stroke="white" strokeWidth={1} strokeDasharray="3,2" opacity={0.9} />
          <text x={badgeX + bl / 2} y={Y + 21} fontSize={9} fontWeight={700}
            fill={p.bT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
            {sec.phase}
          </text>
        </g>
      )
      // ↑ move up
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => { if (si > 0) { e.stopPropagation(); _editCb!({ type: 'move_section', secIdx: capSi, dir: 'up' }) } }}
           style={{ cursor: si > 0 ? 'pointer' : 'default' }} {...tipAttrs('Mover seção para cima')}>
          <circle cx={movUpCX} cy={movBtnCY} r={8} fill={p.hdr} stroke="white" strokeWidth={0.7} opacity={si > 0 ? 0.85 : 0.3} />
          <text x={movUpCX} y={movBtnCY + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="white" opacity={si > 0 ? 1 : 0.35}>↑</text>
        </g>
      )
      // ↓ move down
      const totalSecs = secs.length
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => { if (si < totalSecs - 1) { e.stopPropagation(); _editCb!({ type: 'move_section', secIdx: capSi, dir: 'down' }) } }}
           style={{ cursor: si < secs.length - 1 ? 'pointer' : 'default' }} {...tipAttrs('Mover seção para baixo')}>
          <circle cx={movDnCX} cy={movBtnCY} r={8} fill={p.hdr} stroke="white" strokeWidth={0.7} opacity={si < secs.length - 1 ? 0.85 : 0.3} />
          <text x={movDnCX} y={movBtnCY + 4} fontSize={11} fontWeight={700} textAnchor="middle" fill="white" opacity={si < secs.length - 1 ? 1 : 0.35}>↓</text>
        </g>
      )
      // × remove section (circle button)
      els.push(
        <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_section', secIdx: capSi }) }}
           style={{ cursor: 'pointer' }} {...tipAttrs('Remover seção')}>
          <circle cx={sx + sw - SPAD - 34} cy={Y + SHH / 2} r={9} fill="#ef4444" opacity={0.88} />
          {svgIco(PiTrashFill, sx + sw - SPAD - 34, Y + SHH / 2 + 3.5, 12, 'white')}
        </g>
      )
      // Transparent overlay on label text → opens sidebar with section actions
      const capLastDec = sec.decisions.length - 1
      els.push(
        <g key={K()} onMouseDown={stopMD}
           onClick={(e) => {
             e.stopPropagation()
             const secSideItems: MenuItem[] = [
               { label: 'Adicionar decisão', glyph: '➕', color: p.code, onClick: () => _editCb!({ type: 'add_decision', secIdx: capSi, afterDecIdx: capLastDec }) },
               { label: 'Nova seção acima', glyph: '↑', color: '#22d3ee', onClick: () => _editCb!({ type: 'add_section', afterSecIdx: capSi - 1 }) },
               { label: 'Nova seção abaixo', glyph: '↓', color: '#22d3ee', onClick: () => _editCb!({ type: 'add_section', afterSecIdx: capSi }) },
               { label: 'Mover pergunta para cá', glyph: '⤿', color: '#a855f7', onClick: () => _editCb!({ type: 'transfer_target_sec', mode: 'move', secIdx: capSi }) },
               { label: 'Copiar pergunta para cá', glyph: '⧉', color: '#14b8a6', onClick: () => _editCb!({ type: 'transfer_target_sec', mode: 'copy', secIdx: capSi }) },
             ]
             openMenu(e, capLbl, secSideItems, undefined, undefined, (v) => _editCb!({ type: 'p_set_section_label', secIdx: capSi, value: v }))
           }}
           style={{ cursor: 'pointer' }} {...tipAttrs('Ações da seção')}>
          <rect x={sx + SPAD} y={Y + 4} width={Math.max(10, badgeX - sx - SPAD - 10)} height={SHH - 8} rx={3} fill="transparent" />
        </g>
      )
    } else {
      els.push(<rect key={K()} x={badgeX} y={Y + 9} width={bl} height={17} rx={8} fill={p.bb} />)
      els.push(
        <text key={K()} x={badgeX + bl / 2} y={Y + 21} fontSize={9} fontWeight={700}
          fill={p.bT} textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
          {sec.phase}
        </text>
      )
    }

    let iY = Y + SHH + SVPAD

    // Bloco "SEMPRE" — renderizado como um chip padrão (mesma largura AW-8 centrada e mesmas
    // cores do chip "Pacotes": corpo p.ans, label bar p.alw, borda p.ansB, linhas de pacote PKG).
    if (sec.always?.length || (_editCb && !sec.decisions.length)) {
      const n = sec.always?.length ?? 0
      const chipW = AW - 8, chipX = CX - chipW / 2
      const chipH = alwChipH(n)
      els.push(<rect key={K()} x={chipX} y={iY} width={chipW} height={chipH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
      els.push(<rect key={K()} x={chipX} y={iY} width={chipW} height={LBLH} rx={4} fill={p.lbl} />)
      els.push(<rect key={K()} x={chipX} y={iY + LBLH - 4} width={chipW} height={4} fill={p.lbl} />)
      els.push(
        <text key={K()} x={chipX + 8} y={iY + LBLH * 0.68} fontSize={F_M} fontWeight={700}
          fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={1}>
          SEMPRE
        </text>
      )
      const pkgBY = iY + LBLH + BPAD
      const alwHlKey = `chip:always:${si}`
      if (n > 0) {
        ;(sec.always ?? []).forEach((pkg, pi) => {
          drawPkgRow(chipX, pkgBY + pi * PKG, PKG, chipW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
        })
      } else {
        els.push(<text key={K()} x={chipX + 8} y={pkgBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
      }
      if (_editCb) {
        const capSi = si
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, 'SEMPRE', [], {
            getList: (s) => s[capSi]?.always ?? [],
            onAdd: () => _editCb!({ type: 'add_always', secIdx: capSi }),
            onMove: (idx, dir) => _editCb!({ type: 'move_always', secIdx: capSi, pkgIdx: idx, dir }),
            onRemove: (idx) => _editCb!({ type: 'remove_always', secIdx: capSi, pkgIdx: idx }),
          }, alwHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs(n > 0 ? 'Gerenciar pacotes SEMPRE' : 'Adicionar pacote SEMPRE')}>
            <rect x={chipX + 4} y={iY + 4} width={chipW - 8} height={LBLH - 8} rx={2} fill="transparent" />
          </g>
        )
      }
      chipHighlight(alwHlKey, chipX, iY, chipW, chipH, els)
      iY += sAlwH(sec)
    }

    // Decisions — para inserir/editar clique no diamante para abrir o painel lateral.
    let prevBotY = iY
    for (let di = 0; di < sec.decisions.length; di++) {
      const dec = sec.decisions[di]
      if (di > 0) iY += DSQ

      // PACOTES chip above the diamond (dec.packages)
      const decPkgChipH = dDecPkgH(dec)
      if (decPkgChipH > 0) {
        const chipW = AW - 8, chipX = CX - chipW / 2
        const chipH = alwChipH(dec.packages!.length)
        const chipCardY = iY
        const pkgBY = chipCardY + LBLH + BPAD
        const capRefForChip: DecRef = { secIdx: si, decIdx: di, sub: [] }
        const decPkgHlKey = `chip:decpkg:${si}:${di}`
        els.push(<rect key={K()} x={chipX} y={chipCardY} width={chipW} height={chipH} rx={4} fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
        els.push(<rect key={K()} x={chipX} y={chipCardY} width={chipW} height={LBLH} rx={4} fill={p.lbl} />)
        els.push(<rect key={K()} x={chipX} y={chipCardY + LBLH - 4} width={chipW} height={4} fill={p.lbl} />)
        els.push(<text key={K()} x={chipX + 8} y={chipCardY + LBLH * 0.68} fontSize={F_M} fontWeight={700} fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing={0.8}>PACOTES</text>)
        dec.packages!.forEach((pkg, pi) => {
          drawPkgRow(chipX, pkgBY + pi * PKG, PKG, chipW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
        })
        if (_editCb) {
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, 'PACOTES', [], {
              getList: (s) => resolveRef(s, capRefForChip)?.packages ?? [],
              onAdd: () => _editCb!({ type: 'p_add_dec_pkg', ref: capRefForChip }),
              onMove: (idx, dir) => _editCb!({ type: 'p_move_dec_pkg', ref: capRefForChip, pkgIdx: idx, dir }),
              onRemove: (idx) => _editCb!({ type: 'p_remove_dec_pkg', ref: capRefForChip, pkgIdx: idx }),
              onCondition: (idx, condition) => _editCb!({ type: 'p_set_pkg_condition', ref: capRefForChip, pkgIdx: idx, condition }),
            }, decPkgHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs('Gerenciar pacotes da pergunta')}>
              <rect x={chipX + 4} y={chipCardY + 4} width={chipW - 30} height={LBLH - 8} rx={2} fill="transparent" />
            </g>
          )
          // × excluir chip de pacotes (canto direito, igual aos demais chips)
          els.push(
            <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'p_clear_dec_pkgs', ref: capRefForChip }) }}
               style={{ cursor: 'pointer' }} {...tipAttrs('Excluir chip de pacotes')}>
              <circle cx={chipX + chipW - 9} cy={chipCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
              {svgIco(PiTrashFill, chipX + chipW - 9, chipCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          pushPkgFlagOverlays(chipX, pkgBY, dec.packages!, p,
            (pi) => _editCb!({ type: 'p_toggle_dec_pkg_contingency', ref: capRefForChip, pkgIdx: pi }), els)
        }
        chipHighlight(decPkgHlKey, chipX, chipCardY, chipW, chipH, els)
        // Arrow from chip bottom to diamond top
        els.push(<line key={K()} x1={CX} y1={chipCardY + chipH + 2} x2={CX} y2={iY + decPkgChipH - 5}
          stroke={p.arr} strokeWidth={1.2} markerEnd={`url(#arr_${sec.color})`} />)
      }

      const dY = iY + decPkgChipH
      _flowIndex[_flowIndex.length - 1]?.questions.push({ decIdx: di, question: dec.question, y: dY, subs: collectSubQs(dec) })

      if (prevBotY < (decPkgChipH > 0 ? iY : dY) - 4) {
        els.push(
          <line key={K()} x1={CX} y1={prevBotY} x2={CX} y2={(decPkgChipH > 0 ? iY : dY) - 5}
            stroke={p.arr} strokeWidth={1.5} markerEnd={`url(#arr_${sec.color})`} />
        )
      }

      drawDiamond(CX, dY, DDW, dec.question, sec.color, els, !!dec._dirty)
      drawNoDefaultWarn(dec.answers, CX, dY, DDW, els)

      const ref: DecRef = { secIdx: si, decIdx: di, sub: [] }
      // Edit overlays on the diamond
      if (_editCb) {
        const capSi = si, capDi = di, capQ = dec.question
        const decHlKey = `q:${si}:${di}`
        // Clique no diamante: em modo "clique na origem" seleciona a origem; caso contrário, abre sidebar.
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => {
            e.stopPropagation()
            if (_pickMode) { _editCb!({ type: 'pick_source', ref, question: capQ }); return }
            const decItems: MenuItem[] = [
              { label: 'Adicionar resposta', glyph: '➕', color: '#0ea5e9', onClick: () => _editCb!({ type: 'p_add_ans', ref }) },
              { label: 'Adicionar pacote à pergunta', glyph: '📦', color: '#f97316', onClick: () => _editCb!({ type: 'p_add_dec_pkg', ref }) },
              { label: 'Inserir pergunta acima', glyph: '↑', color: '#22d3ee', onClick: () => _editCb!({ type: 'add_decision', secIdx: capSi, afterDecIdx: capDi - 1 }) },
              { label: 'Inserir pergunta abaixo', glyph: '↓', color: '#22d3ee', onClick: () => _editCb!({ type: 'add_decision', secIdx: capSi, afterDecIdx: capDi }) },
              { label: 'Mover pergunta acima', glyph: '⬆', color: '#94a3b8', onClick: () => _editCb!({ type: 'move_decision', secIdx: capSi, decIdx: capDi, dir: 'up' }) },
              { label: 'Mover pergunta abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => _editCb!({ type: 'move_decision', secIdx: capSi, decIdx: capDi, dir: 'down' }) },
              { label: 'Copiar pergunta', glyph: '⧉', color: '#14b8a6', onClick: () => _editCb!({ type: 'copy_decision', secIdx: capSi, decIdx: capDi }) },
              { label: 'Remover pergunta', glyph: '×', color: '#ef4444', danger: true, onClick: () => _editCb!({ type: 'p_remove_dec', ref }) },
            ]
            openMenu(e, capQ, decItems, undefined, decHlKey, (v) => _editCb!({ type: 'p_set_q', ref, value: v }))
          }} style={{ cursor: _pickMode ? 'copy' : 'pointer' }} {...tipAttrs(_pickMode ? 'Selecionar como origem' : 'Ações da pergunta')}>
            <polygon points={`${CX},${dY} ${CX+DDW/2-14},${dY+DH/2} ${CX},${dY+DH} ${CX-DDW/2+14},${dY+DH/2}`}
              fill="transparent" />
          </g>
        )
        // Anel de destaque da pergunta selecionada
        if (_hlKey === decHlKey) {
          const hw = DDW / 2 - 14
          els.push(<polygon key={K()}
            points={`${CX},${dY-3} ${CX+hw+3},${dY+DH/2} ${CX},${dY+DH+3} ${CX-hw-3},${dY+DH/2}`}
            fill="rgba(251,191,36,0.12)" stroke="#fbbf24" strokeWidth={2.5} />)
        }
        // × remove decision (circle at right diamond vertex)
        els.push(
          <g key={K()} onMouseDown={stopMD} onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'p_remove_dec', ref }) }}
             style={{ cursor: 'pointer' }} {...tipAttrs('Remover decisão')}>
            <circle cx={CX + DDW/2 + 11} cy={dY + DH/2} r={9} fill="#ef4444" opacity={0.9} />
            {svgIco(PiTrashFill, CX + DDW/2 + 11, dY + DH/2 + 3.5, 12, 'white')}
          </g>
        )
        // ⟲ "já respondida no escopo" (só em perguntas repetidas)
        if (_dupQuestions.has(capQ.trim())) {
          drawReuseToggle(CX + DDW/2 + 11, dY + DH/2 + 26, !!dec.reuseScope,
            () => _editCb!({ type: 'p_toggle_reuse', ref }), els)
        }
      }

      const dispAnswers = _editCb ? dec.answers.map(a => ({ ans: a } as DisplayAns)) : toDisplayList(dec.answers)
      const ansY = dY + DH + AV
      const totAW = dispAnswers.reduce((s, da, i) => s + aW(da.ans) + (i ? AG : 0), 0)
      const firstAnsX = CX - totAW / 2
      fanOut(CX, dY + DH, dispAnswers.map(d => d.ans), firstAnsX, ansY, p.arr, `url(#arr_${sec.color})`, els)
      let ax = firstAnsX
      for (let dai = 0; dai < dispAnswers.length; dai++) {
        const da = dispAnswers[dai]
        const aw = aW(da.ans)
        const aiOrig = _editCb ? dai : dec.answers.indexOf(da.ans)
        renderAnswer(da.ans, ax, ansY, aw, ax + aw / 2, sec.color, els, ref, aiOrig, da.label2)
        ax += aw + AG
      }

      // Fan-in: converging lines from each answer bottom back to center
      const maxAH = Math.max(...dispAnswers.map(da => aH(da.ans)))
      const mergeY = ansY + maxAH
      fanIn(dispAnswers.map(d => d.ans), firstAnsX, ansY, mergeY, CX, p.arr, els)

      // For multi-answer decisions the fanIn arc lands at jY = mergeY + CR + 4.
      // We offset afterY past that point and draw a stub trunk so the flow is continuous.
      const convPad = dispAnswers.length > 1 ? (CR + 14) : 0
      const jY = mergeY + CR + 4   // fanIn horizontal merge Y
      if (convPad > 0) {
        els.push(<line key={K()} x1={CX} y1={jY} x2={CX} y2={mergeY + convPad - 1}
          stroke={p.arr} strokeWidth={1.5} />)
      }

      // After-convergence DECISIONS (dec.afterDec) — perguntas após convergência, antes dos chips
      let afterY = mergeY + convPad   // starts BELOW fanIn arc endpoint
      const decAfterDecs = dec.afterDec ?? []
      for (let adi = 0; adi < decAfterDecs.length; adi++) {
        afterY = drawAfterDecision(decAfterDecs[adi], CX, afterY, sec.color, si, di, adi, els)
      }

      // After-convergence sequential entries (dec.after)
      const decAfterList = dec.after ?? []

      for (let afi = 0; afi < decAfterList.length; afi++) {
        const ae = decAfterList[afi]
        const aeH = seqEntryH(ae)
        const aeW = Math.min(DDW + 20, sTotalW(sec) - SPAD * 4)
        const aeX = CX - aeW / 2
        const aeHlKey = `chip:ae:${si}:${di}:${afi}`

        // Sub-questions BEFORE chip (ae.sub[])
        const aeSubs = ae.sub ?? []
        const aeAfterSubs = ae.afterSub ?? []
        const aeSubH = aeSubs.reduce((acc, d) => acc + AFTER_GAP + dSubRenderedH(d), 0)
        const aeAfterSubH = aeAfterSubs.reduce((acc, d) => acc + AFTER_GAP + dSubRenderedH(d), 0)
        const aeChipH = aeH - aeSubH - aeAfterSubH

        let subY = afterY
        for (let si2 = 0; si2 < aeSubs.length; si2++) {
          const capAeRef = { afterIdx: afi, isAfterSub: false as const, subIdx: si2 }
          subY = drawAfterDecision(aeSubs[si2], CX, subY, sec.color, si, di, 0, els, capAeRef)
        }

        const aeCardY = subY + AFTER_GAP

        // Arrow from subY (or afterY when no subs) down to this card
        els.push(<line key={K()} x1={CX} y1={subY} x2={CX} y2={aeCardY - 4}
          stroke={p.arr} strokeWidth={1.5} markerEnd={`url(#arr_${sec.color})`} />)

        // Card background + label bar
        els.push(<rect key={K()} x={aeX} y={aeCardY} width={aeW} height={aeChipH} rx={4}
          fill={p.ans} stroke={p.ansB} strokeWidth={1} />)
        els.push(<rect key={K()} x={aeX} y={aeCardY} width={aeW} height={LBLH} rx={4} fill={p.lbl} />)
        els.push(<rect key={K()} x={aeX} y={aeCardY + LBLH - 4} width={aeW} height={4} fill={p.lbl} />)

        if (_editCb) {
          const capSi = si, capDi = di, capAfi = afi, capAeLabel = ae.label
          const aeMenuItems: MenuItem[] = [
            { label: 'Adicionar pacote', glyph: '📦', color: '#0ea5e9', onClick: () => _editCb!({ type: 'add_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi }) },
            { label: 'Inserir sub-pergunta acima', glyph: '◇', color: '#7c3aed', onClick: () => _editCb!({ type: 'add_dec_after_chip_sub', secIdx: capSi, decIdx: capDi, afterIdx: capAfi }) },
            { label: 'Inserir sub-pergunta abaixo', glyph: '◇', color: '#7c3aed', onClick: () => _editCb!({ type: 'add_dec_after_chip_sub', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, isAfterSub: true }) },
            { label: 'Inserir bloco antes', glyph: '↑', color: '#22d3ee', onClick: () => _editCb!({ type: 'add_dec_after', secIdx: capSi, decIdx: capDi, atIdx: capAfi }) },
            { label: 'Inserir bloco depois', glyph: '↓', color: '#22d3ee', onClick: () => _editCb!({ type: 'add_dec_after', secIdx: capSi, decIdx: capDi, atIdx: capAfi + 1 }) },
            { label: 'Inserir pergunta acima', glyph: '◇', color: '#7c3aed', onClick: () => _editCb!({ type: 'add_dec_after_dec', secIdx: capSi, decIdx: capDi }) },
            { label: 'Mover bloco acima', glyph: '⬆', color: '#94a3b8', onClick: () => _editCb!({ type: 'move_dec_after', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, dir: 'up' }) },
            { label: 'Mover bloco abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => _editCb!({ type: 'move_dec_after', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, dir: 'down' }) },
            { label: 'Remover bloco', glyph: '×', color: '#ef4444', danger: true, onClick: () => _editCb!({ type: 'remove_dec_after', secIdx: capSi, decIdx: capDi, afterIdx: capAfi }) },
          ]
          els.push(
            <g key={K()} onMouseDown={stopMD}
               onClick={(e) => { e.stopPropagation(); _editCb!({ type: 'remove_dec_after', secIdx: capSi, decIdx: capDi, afterIdx: capAfi }) }}
               style={{ cursor: 'pointer' }} {...tipAttrs('Remover bloco')}>
              <circle cx={aeX + aeW - 9} cy={aeCardY + LBLH / 2} r={6.5} fill="#ef4444" opacity={0.82} />
              {svgIco(PiTrashFill, aeX + aeW - 9, aeCardY + LBLH / 2 + 3.5, 10, 'white')}
            </g>
          )
          els.push(
            <g key={K()} onMouseDown={stopMD}
               onClick={(e) => openMenu(e, capAeLabel || 'Após convergência', aeMenuItems, {
                 getList: (s) => s[capSi]?.decisions[capDi]?.after?.[capAfi]?.packages ?? [],
                 onAdd: () => _editCb!({ type: 'add_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi }),
                 onMove: (idx, dir) => _editCb!({ type: 'move_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, pkgIdx: idx, dir }),
                 onRemove: (idx) => _editCb!({ type: 'remove_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, pkgIdx: idx }),
               }, aeHlKey, (v) => _editCb!({ type: 'set_dec_after_label', secIdx: capSi, decIdx: capDi, afterIdx: capAfi, value: v }))}
               style={{ cursor: 'pointer' }} {...tipAttrs('Opções do bloco')}>
              <rect x={aeX + 8} y={aeCardY + 1} width={aeW - 28} height={LBLH - 2} rx={2} fill="transparent" />
            </g>
          )
        }

        // Label text
        els.push(
          <text key={K()} x={aeX + 8} y={aeCardY + LBLH * 0.68} fontSize={F_M} fontWeight={600}
            fill={p.lblT} fontFamily="ui-sans-serif,system-ui,sans-serif">
            {tr(ae.label, 48)}
          </text>
        )

        // Packages
        const aePkgs = ae.packages ?? []
        const aeBY = aeCardY + LBLH + BPAD
        if (aePkgs.length > 0 || _editCb) {
          aePkgs.forEach((pkg, pi) => {
            drawPkgRow(aeX, aeBY + pi * PKG, PKG, aeW, pkg, p, hit(pkg.id) || hit(pkgName(pkg)), null, null, els)
          })
          if (aePkgs.length === 0) {
            els.push(<text key={K()} x={aeX + 8} y={aeBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
          }
          if (_editCb) {
            const capSi = si, capDi = di, capAfi2 = afi, capAeLabel = ae.label
            els.push(
              <g key={K()} onMouseDown={stopMD} onClick={(e) => openMenu(e, capAeLabel || 'Após convergência', [], {
                getList: (s) => s[capSi]?.decisions[capDi]?.after?.[capAfi2]?.packages ?? [],
                onAdd: () => _editCb!({ type: 'add_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi2 }),
                onMove: (idx, dir) => _editCb!({ type: 'move_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi2, pkgIdx: idx, dir }),
                onRemove: (idx) => _editCb!({ type: 'remove_dec_after_pkg', secIdx: capSi, decIdx: capDi, afterIdx: capAfi2, pkgIdx: idx }),
              }, aeHlKey)} style={{ cursor: 'pointer' }} {...tipAttrs(aePkgs.length > 0 ? 'Gerenciar pacotes' : 'Adicionar pacote')}>
                <rect x={aeX + 4} y={aeBY - 2} width={aeW - 8} height={Math.max(aePkgs.length * PKG, NOTE_R) + 4} rx={3} fill="transparent" />
              </g>
            )
          }
        } else {
          els.push(<text key={K()} x={aeX + 8} y={aeBY + NOTE_R * 0.8} fontSize={F_S} fontStyle="italic" fill={p.empty}>—</text>)
        }
        chipHighlight(aeHlKey, aeX, aeCardY, aeW, aeChipH, els)

        // Sub-questions AFTER chip (ae.afterSub[])
        let afterSubY = aeCardY + aeChipH
        for (let si2 = 0; si2 < aeAfterSubs.length; si2++) {
          const capAeRef = { afterIdx: afi, isAfterSub: true as const, subIdx: si2 }
          afterSubY = drawAfterDecision(aeAfterSubs[si2], CX, afterSubY, sec.color, si, di, 0, els, capAeRef)
        }
        afterY = afterSubY
      }

      iY += dTotalH(dec)
      prevBotY = afterY
    }

    Y += sh + SGAP
  }

  return Y - SGAP
}

// Build full SVG content for a single flowchart (linear LSec[])
function buildSvg(secs: LSec[], dark: boolean, editCb?: (a: EditAction) => void, search = '', selRef: DecRef | null = null, pickMode = false, hlKey: string | null = null, expandedRefs: Set<string> = new Set()): { el: React.ReactNode; svgW: number; svgH: number; flowIndex: FlowIndexSection[] } {
  _k = 0
  _dark = dark
  _editCb = editCb ?? null
  _search = search.toLowerCase().trim()
  _selRef = selRef
  _pickMode = pickMode
  _hlKey = hlKey
  _expandedRefs = expandedRefs
  _dupQuestions = new Set([...collectQuestionCounts(secs)].filter(([, n]) => n > 1).map(([q]) => q))
  _decPos.clear()
  _flowIndex = []
  const els: React.ReactNode[] = []
  const maxW = Math.max(...secs.map(s => sTotalW(s)))
  const svgW = maxW + MRG * 2
  const bottom = drawFlowColumn(secs, svgW / 2, MRG, els)
  return { el: <>{els}</>, svgW, svgH: bottom + MRG, flowIndex: _flowIndex }
}

// ── Complete-view tree layout ───────────────────────────────────────────────

const _treeLabelW = (t: string) => tr(t, 26).length * 6 + 16

function colWidth(secs: LSec[]): number {
  return secs.length ? Math.max(...secs.map(s => sTotalW(s))) : 300
}
// Subtree width: leaf = widest section; chain = max(own column, child subtree);
// decision = sum of children + gaps.
function nodeW(n: QNode): number {
  if (n.kind === 'leaf') return colWidth(n.secs)
  if (n.kind === 'chain') return Math.max(colWidth(n.secs), nodeW(n.child))
  return n.branches.reduce((s, b, i) => s + nodeW(b.child) + (i ? COLGAP : 0), 0)
}

// Edge label: rounded pill + centered text, on the connector toward a child.
function drawBranchLabel(cx: number, cy: number, text: string, els: React.ReactNode[]): void {
  const p = pal('gray')
  const t = tr(text, 26)
  const w = _treeLabelW(text)
  els.push(<rect key={K()} x={cx - w / 2} y={cy - TLBLH / 2} width={w} height={TLBLH} rx={TLBLH / 2}
    fill={p.lbl} stroke={p.bgB} strokeWidth={1} />)
  els.push(
    <text key={K()} x={cx} y={cy + 4} fontSize={F_M} fontWeight={600} fill={p.lblT}
      textAnchor="middle" fontFamily="ui-sans-serif,system-ui,sans-serif">
      {t}
    </text>
  )
}

// Connectors from a parent diamond bottom fanning to each child top, with labels.
function drawTreeBranches(
  px: number, pBot: number, children: { label: string; cx: number }[], childTop: number,
  els: React.ReactNode[]
): void {
  const p = pal('gray')
  const stroke = p.arr
  const marker = 'url(#arr_gray)'
  const AP = 3
  const jY = pBot + (childTop - pBot) * 0.45

  if (children.length === 1) {
    const cx = children[0].cx
    els.push(<line key={K()} x1={cx} y1={pBot} x2={cx} y2={childTop - AP} stroke={stroke} strokeWidth={1.5} markerEnd={marker} />)
    drawBranchLabel(cx, (pBot + childTop) / 2, children[0].label, els)
    return
  }

  els.push(<line key={K()} x1={px} y1={pBot} x2={px} y2={jY} stroke={stroke} strokeWidth={1.5} />)
  for (const c of children) {
    const diff = c.cx - px
    const r = Math.min(CR, Math.max(2, Math.abs(diff) - 2))
    let d: string
    if (Math.abs(diff) < 2) d = `M${c.cx},${jY} V${childTop - AP}`
    else if (diff < 0) d = `M${px},${jY} H${c.cx + r} Q${c.cx},${jY} ${c.cx},${jY + r} V${childTop - AP}`
    else d = `M${px},${jY} H${c.cx - r} Q${c.cx},${jY} ${c.cx},${jY + r} V${childTop - AP}`
    els.push(<path key={K()} d={d} stroke={stroke} strokeWidth={1.5} fill="none" markerEnd={marker} />)
    drawBranchLabel(c.cx, (jY + childTop) / 2, c.label, els)
  }
}

// Build full SVG content for a complete-view decision tree (vertical flow).
// Two passes: (1) assign each node a center X (post-order, left-to-right leaves);
// (2) draw with flowing Y so chains (shared section runs) push their child down.
function buildTreeSvg(tree: QNode, dark: boolean, search = ''): { el: React.ReactNode; svgW: number; svgH: number } {
  _k = 0
  _dark = dark
  _search = search.toLowerCase().trim()
  const els: React.ReactNode[] = []
  const cxOf = new Map<QNode, number>()
  let cursorX = MRG

  // Pass 1: assign center X. Leaves consume width left-to-right; chains center on
  // their child; decisions center on the span of their children.
  function assignX(n: QNode): number {
    let cx: number
    if (n.kind === 'leaf') { const w = colWidth(n.secs); cx = cursorX + w / 2; cursorX += w + COLGAP }
    else if (n.kind === 'chain') { cx = assignX(n.child) }
    else { const cxs = n.branches.map(b => assignX(b.child)); cx = (cxs[0] + cxs[cxs.length - 1]) / 2 }
    cxOf.set(n, cx)
    return cx
  }

  // Pass 2: draw from topY downward; returns the bottom Y reached.
  function draw(n: QNode, topY: number): number {
    const cx = cxOf.get(n)!
    if (n.kind === 'leaf') return drawFlowColumn(n.secs, cx, topY, els)
    if (n.kind === 'chain') {
      const bottom = drawFlowColumn(n.secs, cx, topY, els)
      const childTop = bottom + SGAP
      els.push(<line key={K()} x1={cx} y1={bottom} x2={cx} y2={childTop - 5}
        stroke={dark ? '#475569' : '#94a3b8'} strokeWidth={2} markerEnd="url(#arr_inter)" />)
      return draw(n.child, childTop)
    }
    // decision: diamond at topY, branches fan out to children at childTop
    drawDiamond(cx, topY, DDW, n.question, 'gray', els)
    const childTop = topY + DH + LEVELGAP
    drawTreeBranches(cx, topY + DH, n.branches.map(b => ({ label: b.label, cx: cxOf.get(b.child)! })), childTop, els)
    let bottom = childTop
    for (const b of n.branches) bottom = Math.max(bottom, draw(b.child, childTop))
    return bottom
  }

  assignX(tree)
  const bottom = draw(tree, MRG)
  return { el: <>{els}</>, svgW: nodeW(tree) + MRG * 2, svgH: bottom + MRG }
}

// Detect dark mode via Tailwind's class on <html>
function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// View state managed atomically to guarantee zoom-at-cursor correctness
type VS = { tx: number; ty: number; scale: number }
type VA =
  | { type: 'zoom'; mx: number; my: number; factor: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'reset' }
  | { type: 'center'; tx: number; ty: number; scale?: number }

function vr(s: VS, a: VA): VS {
  if (a.type === 'zoom') {
    const next = Math.max(0.1, Math.min(3, s.scale * a.factor))
    const ratio = next / s.scale
    return { scale: next, tx: a.mx + (s.tx - a.mx) * ratio, ty: a.my + (s.ty - a.my) * ratio }
  }
  if (a.type === 'pan') return { ...s, tx: s.tx + a.dx, ty: s.ty + a.dy }
  if (a.type === 'center') return { ...s, tx: a.tx, ty: a.ty, ...(a.scale != null && { scale: a.scale }) }
  return { tx: 20, ty: 20, scale: 0.6 }
}

// Pan/zoom graph component
function ClassicSidePanel({ title, items, pkgs, onClose, dark, pos, onTitleChange }: {
  title?: string; items: MenuItem[]; pkgs?: ResolvedPkgList; onClose: () => void; dark: boolean; pos?: { x: number; y: number }; onTitleChange?: (v: string) => void
}) {
  const PANEL_W = 320
  const PANEL_MAX_H = 420
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  // Position panel to the opposite side of the click — prevents it from covering the selected element
  const CANVAS_LEFT = 216
  const left = pos
    ? pos.x > vw / 2
      ? Math.max(pos.x - PANEL_W - 40, CANVAS_LEFT)  // right half → panel to the left
      : Math.min(pos.x + 40, vw - PANEL_W - 12)       // left half → panel to the right
    : undefined
  const top = pos ? Math.min(Math.max(pos.y - 20, 80), vh - PANEL_MAX_H - 12) : undefined
  return (
    <div
      className="z-50 flex flex-col shadow-2xl rounded-xl overflow-hidden"
      style={{
        position: pos ? 'fixed' : 'absolute',
        ...(pos ? { left, top, width: PANEL_W, maxHeight: PANEL_MAX_H } : { top: 0, right: 0, bottom: 0, width: 208 }),
        background: dark ? '#0f172a' : '#1e293b',
        border: '1px solid rgba(255,255,255,0.14)',
      }}
      onMouseDown={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 min-h-[38px]">
        {onTitleChange ? (
          <input
            className="flex-1 text-[11px] font-semibold text-slate-100 bg-white/10 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-blue-400/60 min-w-0"
            defaultValue={title ?? ''}
            placeholder="Rótulo…"
            onBlur={(e) => { onTitleChange(e.target.value); onClose() }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { onTitleChange(e.currentTarget.value); onClose() }
              if (e.key === 'Escape') onClose()
            }}
          />
        ) : (
          <span className="flex-1 text-[11px] font-semibold text-slate-300 truncate">{title ?? 'Ações'}</span>
        )}
        <button onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Fechar">
          <PiXBold size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {items.map((it, i) => {
          const Icon = it.glyph ? GLYPH_ICONS[it.glyph] : undefined
          return (
            <button key={i} onClick={() => { it.onClick(); onClose() }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-white/10 ${it.danger ? 'text-rose-300' : 'text-slate-200'}`}>
              <span className="w-4 flex items-center justify-center shrink-0" style={{ color: it.color }}>
                {Icon ? <Icon size={15} /> : <span className="text-[13px]">{it.glyph}</span>}
              </span>
              <span>{it.label}</span>
            </button>
          )
        })}
        {pkgs && (
          <>
            {items.length > 0 && <div className="border-t border-white/10 my-1" />}
            <button onClick={() => pkgs.onAdd()}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-white/10 text-slate-200">
              <span className="w-4 flex items-center justify-center shrink-0" style={{ color: '#3b82f6' }}><PiLegoFill size={15} /></span>
              <span>Adicionar pacote</span>
            </button>
            {pkgs.list.length > 0 && <div className="border-t border-white/10 my-1" />}
            {pkgs.list.map((pkg, i) => (
              <div key={i} className="px-3 py-1.5 group">
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9px] text-blue-400 leading-tight break-all">
                      {pkg.id}
                      {pkg.condition && <ConditionIcon condition={pkg.condition} className="inline ml-1 align-text-bottom text-blue-400" />}
                    </div>
                    <div className="text-[10px] text-slate-300 leading-snug break-words">{pkgName(pkg)}</div>
                  </div>
                  <button onClick={() => pkgs.onMove(i, 'up')}
                    className="flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-white/10 shrink-0 text-xs"
                    title="Mover acima">↑</button>
                  <button onClick={() => pkgs.onMove(i, 'down')}
                    className="flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-white hover:bg-white/10 shrink-0 text-xs"
                    title="Mover abaixo">↓</button>
                  <button onClick={() => pkgs.onRemove(i)}
                    className="flex items-center justify-center w-5 h-5 rounded text-rose-400 hover:text-rose-300 hover:bg-white/10 shrink-0 text-xs"
                    title="Remover">×</button>
                </div>
                {pkgs.onCondition && (
                  <select
                    value={pkg.condition ?? ''}
                    onChange={e => pkgs.onCondition!(i, e.target.value || undefined)}
                    title="Condição de emissão — o pacote só é emitido quando a condição vale"
                    className={`mt-1 w-full text-[9px] rounded border px-1 py-0.5 outline-none cursor-pointer ${
                      pkg.condition
                        ? 'border-sky-600/60 bg-sky-950/40 text-sky-300'
                        : 'border-white/10 bg-transparent text-slate-500'
                    }`}>
                    <option value="">Sem condição</option>
                    {Object.entries(CONDITION_LABELS).map(([k, lbl]) => (
                      <option key={k} value={k}>{lbl}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export function LogicGraphPanel({ secs, tree, editCb, pickMode, selRef }: LogicGraphProps) {
  const dark = useDark()
  const [{ tx, ty, scale }, dispatch] = useReducer(vr, { tx: 20, ty: 20, scale: 0.6 })
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ lx: number; ly: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Índice de perguntas (navegação rápida)
  const [showIndex, setShowIndex] = useState(false)
  const [navHl, setNavHl] = useState<string | null>(null)
  const navHlTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ctrl+F / Cmd+F opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (e.key === 'Escape') setSearch('')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Keep module-level _editCb in sync so onClick handlers (which read it at call-time) always
  // have the current callback even between useMemo re-runs.
  useEffect(() => { _editCb = editCb ?? null }, [editCb])
  // _pickMode é lido nos handlers de clique (em tempo de clique) → mantém sincronizado.
  useEffect(() => { _pickMode = !!pickMode }, [pickMode])

  // Blocos de lógica (`ref`) expandidos inline — estado de UI. O toggle é lido em tempo de
  // clique via _toggleRefExpand; o Set é passado ao buildSvg e entra na dep list do useMemo.
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    _toggleRefExpand = (scopeId: string) => setExpandedRefs(prev => {
      const n = new Set(prev); n.has(scopeId) ? n.delete(scopeId) : n.add(scopeId); return n
    })
    return () => { _toggleRefExpand = null }
  }, [])

  const [btnTooltip, setBtnTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => {
    _tooltipCb = setBtnTooltip
    return () => { _tooltipCb = null }
  }, [])

  const [menu, setMenu] = useState<MenuState | null>(null)
  useEffect(() => {
    _menuCb = (m) => { setBtnTooltip(null); setMenu(m) }
    return () => { _menuCb = null }
  }, [])

  // Native wheel listener with passive:false so preventDefault actually works
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      dispatch({ type: 'zoom', mx: e.clientX - rect.left, my: e.clientY - rect.top, factor: e.deltaY < 0 ? 1.12 : 0.89 })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Fit to viewport, center horizontally and pin to top on first render
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (!cw || !ch) return
    // Fit by width (so the wide complete view fits); keep ≤0.6 for narrow charts
    const s = Math.max(0.1, Math.min(0.6, (cw - 40) / svgW))
    dispatch({
      type: 'center',
      scale: s,
      tx: (cw - svgW * s) / 2,
      ty: svgH * s > ch ? 20 : (ch - svgH * s) / 2,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    dragRef.current = { lx: e.clientX, ly: e.clientY }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dispatch({ type: 'pan', dx: e.clientX - dragRef.current.lx, dy: e.clientY - dragRef.current.ly })
    dragRef.current = { lx: e.clientX, ly: e.clientY }
  }, [])

  const stopDrag = useCallback(() => { dragRef.current = null }, [])

  const hlKey = menu?.hlKey ?? navHl

  const { el, svgW, svgH, flowIndex } = useMemo(
    () => (tree
      ? { ...buildTreeSvg(tree, dark, search), flowIndex: [] as FlowIndexSection[] }
      : buildSvg(secs ?? [], dark, editCb, search, selRef ?? null, !!pickMode, hlKey, expandedRefs)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [secs, tree, dark, editCb, search, selRef, pickMode, hlKey, expandedRefs]
  )

  // Navega até uma coordenada Y do fluxograma (coluna central), com destaque temporário.
  const goTo = useCallback((y: number, hl: string | null) => {
    const c = containerRef.current
    if (!c) return
    const s = Math.max(scale, 0.5)
    const cx = svgW / 2
    // O índice agora é uma sidebar docada (flex sibling): containerRef já mede só
    // a largura do canvas, então não é preciso compensar a largura do painel.
    dispatch({
      type: 'center',
      scale: s,
      tx: c.clientWidth / 2 - cx * s,
      ty: c.clientHeight * 0.28 - y * s,
    })
    if (navHlTimer.current) clearTimeout(navHlTimer.current)
    setNavHl(hl)
    if (hl) navHlTimer.current = setTimeout(() => setNavHl(null), 2200)
  }, [scale, svgW])

  const bg = dark ? '#020617' : '#dde3ea'
  const btnCls = dark
    ? 'w-7 h-7 flex items-center justify-center rounded border border-slate-600 bg-slate-800 text-slate-200 text-sm font-bold shadow-sm hover:bg-slate-700 select-none'
    : 'w-7 h-7 flex items-center justify-center rounded border border-slate-300 bg-white text-slate-700 text-sm font-bold shadow-sm hover:bg-slate-50 select-none'
  const btnSm = dark
    ? 'h-7 px-2 rounded border border-slate-600 bg-slate-800 text-slate-300 text-[11px] shadow-sm hover:bg-slate-700 select-none'
    : 'h-7 px-2 rounded border border-slate-300 bg-white text-slate-600 text-[11px] shadow-sm hover:bg-slate-50 select-none'
  const pctCls = dark
    ? 'text-[10px] text-slate-400 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded pointer-events-none'
    : 'text-[10px] text-slate-500 font-mono bg-white/80 px-1.5 py-0.5 rounded pointer-events-none'
  const hintCls = dark ? 'text-[10px] text-slate-500 pointer-events-none' : 'text-[10px] text-slate-400 pointer-events-none'
  const searchCls = dark
    ? 'h-7 w-48 pl-6 pr-6 rounded border border-slate-600 bg-slate-800 text-slate-200 text-[11px] placeholder-slate-500 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
    : 'h-7 w-48 pl-6 pr-6 rounded border border-slate-300 bg-white text-slate-700 text-[11px] placeholder-slate-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500'

  return (
    <div className="flex w-full h-full overflow-hidden" style={{ background: bg }}>
      {/* Índice de navegação — sidebar docada à esquerda (seções e perguntas de nível 1) */}
      {showIndex && !tree && (
        <aside
          className={`h-full w-60 shrink-0 overflow-y-auto scrollbar-custom border-r ${
            dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300'
          }`}
          onMouseDown={e => e.stopPropagation()}
        >
          <div className={`sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b ${
            dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${dark ? 'text-slate-300' : 'text-slate-700'}`}>Índice</span>
            <button onClick={() => setShowIndex(false)}
              className={`flex items-center justify-center w-5 h-5 rounded ${dark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
              title="Fechar índice">
              <PiXBold size={13} />
            </button>
          </div>
          {flowIndex.map(secEntry => (
            <div key={secEntry.secIdx} className="py-1">
              <button onClick={() => goTo(secEntry.y, null)}
                className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                  dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'
                }`}>
                <span className={`flex-1 truncate text-[11px] font-bold uppercase tracking-wide ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {secEntry.label}
                </span>
                <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded border ${dark ? 'text-slate-500 border-slate-700' : 'text-slate-500 border-slate-300'}`}>
                  {secEntry.phase}
                </span>
              </button>
              {secEntry.questions.map(q => (
                <div key={q.decIdx}>
                  <button
                    onClick={() => goTo(q.y, `q:${secEntry.secIdx}:${q.decIdx}`)}
                    className={`w-full text-left pl-6 pr-3 py-1 text-[11px] leading-snug truncate transition-colors ${
                      dark ? 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/60' : 'text-slate-500 hover:text-amber-700 hover:bg-slate-50'
                    }`}
                    title={q.question}>
                    {q.question || '(sem texto)'}
                  </button>
                  {q.subs.map((sub, si) => (
                    <button key={si}
                      onClick={() => goTo(q.y, `q:${secEntry.secIdx}:${q.decIdx}`)}
                      style={{ paddingLeft: `${1.5 + sub.depth * 0.65}rem` }}
                      className={`w-full text-left pr-3 py-0.5 text-[10px] leading-snug truncate transition-colors ${
                        sub.depth === 1
                          ? dark ? 'text-slate-500 hover:text-amber-400 hover:bg-slate-800/50' : 'text-slate-400 hover:text-amber-700 hover:bg-slate-50'
                          : dark ? 'text-slate-600 hover:text-amber-500 hover:bg-slate-800/40' : 'text-slate-400/70 hover:text-amber-700 hover:bg-slate-50'
                      }`}
                      title={sub.q}>
                      {'└ '}{sub.q || '(sem texto)'}
                    </button>
                  ))}
                </div>
              ))}
              {secEntry.questions.length === 0 && (
                <p className={`pl-6 pr-3 py-0.5 text-[10px] italic ${dark ? 'text-slate-700' : 'text-slate-400'}`}>sem perguntas</p>
              )}
            </div>
          ))}
        </aside>
      )}

      <div ref={containerRef} className="relative flex-1 h-full overflow-hidden"
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={stopDrag} onMouseLeave={stopDrag}
        onClick={() => setMenu(null)}
      >
      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex gap-1.5 items-center pointer-events-none">
        <div className="flex gap-1 pointer-events-auto">
          {[
            { label: '+', fn: () => dispatch({ type: 'zoom', mx: (containerRef.current?.clientWidth ?? 400) / 2, my: (containerRef.current?.clientHeight ?? 300) / 2, factor: 1.2 }) },
            { label: '−', fn: () => dispatch({ type: 'zoom', mx: (containerRef.current?.clientWidth ?? 400) / 2, my: (containerRef.current?.clientHeight ?? 300) / 2, factor: 1 / 1.2 }) },
          ].map(({ label, fn }) => (
            <button key={label} onClick={fn} className={btnCls}>{label}</button>
          ))}
          <button onClick={() => dispatch({ type: 'reset' })} className={btnSm}>
            Reset
          </button>
          {!tree && flowIndex.length > 0 && (
            <button onClick={() => setShowIndex(v => !v)}
              className={`${btnSm} inline-flex items-center gap-1 ${showIndex ? (dark ? '!border-amber-500 !text-amber-400' : '!border-amber-500 !text-amber-600') : ''}`}
              title="Índice de seções e perguntas">
              <PiListDashesFill size={13} /> Índice
            </button>
          )}
        </div>
        <span className={pctCls}>{Math.round(scale * 100)}%</span>
      </div>

      {/* Search field */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 pointer-events-auto" onMouseDown={e => e.stopPropagation()}>
        <div className="relative flex items-center">
          <svg className="absolute left-1.5 w-3.5 h-3.5 pointer-events-none" style={{ color: dark ? '#94a3b8' : '#94a3b8' }}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <circle cx={11} cy={11} r={7} /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar… (Ctrl+F)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setSearch('')}
            className={searchCls}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-slate-600"
              title="Limpar busca"
            >
              <PiXBold size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Hint */}
      <div className={`absolute bottom-3 left-3 z-10 ${hintCls}`}>
        Arraste para mover · Scroll para zoom
      </div>

      {/* Button tooltip overlay */}
      {btnTooltip && (
        <div
          className="fixed z-50 pointer-events-none px-2 py-1 rounded text-[11px] font-medium shadow-lg"
          style={{
            left: btnTooltip.x + 12,
            top: btnTooltip.y - 28,
            background: dark ? '#1e293b' : '#1e293b',
            color: '#f1f5f9',
            border: '1px solid rgba(255,255,255,0.12)',
            whiteSpace: 'nowrap',
          }}
        >
          {btnTooltip.text}
        </div>
      )}

      {/* Right sidebar — opens when clicking a card or diamond in edit mode */}
      {menu && (
        <ClassicSidePanel
          title={menu.title}
          items={menu.items}
          pkgs={menu.pkgs ? { list: menu.pkgs.getList(secs ?? []), onAdd: menu.pkgs.onAdd, onMove: menu.pkgs.onMove, onRemove: menu.pkgs.onRemove, onCondition: menu.pkgs.onCondition } : undefined}
          onClose={() => setMenu(null)}
          dark={dark}
          pos={menu.pos}
          onTitleChange={menu.onTitleChange}
        />
      )}

      <svg width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          {(['gray', 'blue', 'amber'] as PC[]).map(c => (
            <marker key={c} id={`arr_${c}`} markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
              <polygon points="0 0, 5 2, 0 4" fill={(dark ? DARK_PAL : PAL)[c].arr} />
            </marker>
          ))}
          <marker id="arr_inter" markerWidth="5" markerHeight="4" refX="4.5" refY="2" orient="auto">
            <polygon points="0 0, 5 2, 0 4" fill={dark ? '#475569' : '#94a3b8'} />
          </marker>
        </defs>
        <g transform={`translate(${tx},${ty}) scale(${scale})`} style={{ transformOrigin: '0 0' }}>
          <rect x={0} y={0} width={svgW} height={svgH} fill="transparent" />
          {el}
        </g>
      </svg>
      </div>
    </div>
  )
}
