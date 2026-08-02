import { useState, useEffect } from 'react'
import type { IconType } from 'react-icons'
import { MdOutlineAnchor } from 'react-icons/md'
import { PiFan, PiXBold } from 'react-icons/pi'
import { SiCodeship } from 'react-icons/si'
import { IoIosGitNetwork } from 'react-icons/io'
import {
  LuSquareArrowLeft, LuSquareArrowRight, LuSquareArrowUp, LuSquareArrowDown,
  LuPackage, LuTrash2, LuPlus, LuDiamond, LuCopy, LuCornerUpLeft, LuListOrdered,
  LuMinimize2, LuMaximize2, LuSquareCheck,
} from 'react-icons/lu'
import { GiOffshorePlatform } from 'react-icons/gi'
import { getPackage } from '../data/packages'
import { CONDITION_LABELS } from '../data/logicSecs'
import type { LCondition } from '../data/logicSecs'

// Original/canonical package name (falls back to the flowchart's own label)
export const pkgName = (p: LPkg): string => getPackage(p.id)?.name ?? p.name
// Rótulo humano da condição de emissão de um pacote (fallback: chave crua)
const condLabel = (c?: string): string | null =>
  c ? ((CONDITION_LABELS as Record<string, string>)[c] ?? c) : null

// Ícone (react-icons) que marca a condição de emissão de um pacote, no lugar do
// antigo losango azul ◈. Um por condição de sonda/operação.
const CONDITION_ICONS: Record<string, IconType> = {
  rig_anc: MdOutlineAnchor,  // Sonda ancorada (ANC)
  rig_dp:  PiFan,            // Sonda DP (qualquer)
}

// Condições que exigem dois ícones lado a lado: [DP, específico].
const CONDITION_ICON_PAIRS: Record<string, [IconType, IconType]> = {
  rig_dp_gen: [PiFan, GiOffshorePlatform],  // DP Generalista
  rig_lwo:    [PiFan, SiCodeship],          // DP LWIV
}

// Mapa dos antigos glyphs (emoji/unicode) dos menus para ícones react-icons (Lucide).
// A chave é o próprio glyph usado nos MenuItem, evitando alterar todos os call sites.
// Exportado para o LogicFlowEditor (editor ReactFlow) usar o MESMO vocabulário visual.
// Todos neutros — a cor é decidida no render do menu (ClassicSidePanel), não aqui.
const GLYPH_ICONS: Record<string, IconType> = {
  '📦': LuPackage,           // adicionar pacote
  '×': LuTrash2,             // remover
  '➕': LuPlus,               // adicionar resposta/decisão
  '◇': LuDiamond,            // inserir sub-pergunta
  '↑': LuSquareArrowUp,      // inserir acima
  '↓': LuSquareArrowDown,    // inserir abaixo
  '⬆': LuSquareArrowUp,      // mover acima
  '⬇': LuSquareArrowDown,    // mover abaixo
  '⬅': LuSquareArrowLeft,    // mover resposta para a esquerda
  '➡': LuSquareArrowRight,   // mover resposta para a direita
  '⧉': LuCopy,               // copiar
  '⤿': LuCornerUpLeft,       // mover pergunta para cá
  '⤵': LuListOrdered,        // sequencial / após convergência
  '⤡': LuMinimize2,          // recolher visualização
  '⤢': LuMaximize2,          // expandir para visualização
  '☑': LuSquareCheck,        // marcar/desmarcar "já respondida no escopo"
  '⑂': IoIosGitNetwork,      // adicionar campo após convergência
}

// Ícone de condição para contexto HTML (dropdown/painéis). No SVG do fluxograma o
// ícone é renderizado inline (com x/y/size) em drawPkgRow.
export function ConditionIcon({ condition, className, size = 11 }: { condition: string; className?: string; size?: number }) {
  const title = `Condicional: ${condLabel(condition)}`
  const pair = CONDITION_ICON_PAIRS[condition]
  if (pair) {
    const [A, B] = pair
    return (
      <span className={`inline-flex items-center gap-px ${className ?? ''}`} title={title}>
        <A size={size} /><B size={size} />
      </span>
    )
  }
  const Ic = CONDITION_ICONS[condition]
  return Ic
    ? <Ic className={className} size={size} title={title} />
    : <span className={className} title={title}>◈</span>
}

// Types compatible with AdminView.tsx (structural typing)
type LPkg = { id: string; name: string; isContingency?: boolean; condition?: LCondition }
type LSeqEntry = { label: string; note?: string; packages?: LPkg[]; sub?: LDec[]; afterSub?: LDec[]; contingency?: boolean }
interface LAns { label: string; active?: boolean; note?: string; packages?: LPkg[]; sub?: LDec[]; afterSub?: LDec[]; seq?: LSeqEntry[]; after?: LSeqEntry[]; goto?: string; contingency?: boolean; _dirty?: boolean }
interface LDec { question: string; answers: LAns[]; packages?: LPkg[]; after?: LSeqEntry[]; afterDec?: LDec[]; reuseScope?: boolean; _dirty?: boolean }
interface LSec { id: string; label: string; phase: string; color: 'gray'|'blue'|'amber'; always?: LPkg[]; decisions: LDec[]; ref?: { scopeId: string; label?: string } }
// Referência a uma decisão por caminho: raiz = sec.decisions[decIdx] (ou .afterDec[adIdx]
// quando adIdx definido); `sub` navega a subárvore em pares [ansIdx, subIdx, …] (vazio = raiz).
// Endereçamento usado por todas as ações de edição de nó → profundidade ilimitada.
export type DecRef = { secIdx: number; decIdx: number; adIdx?: number; sub: number[]; aeRef?: { afterIdx: number; isAfterSub: boolean; subIdx: number } }

export function resolveRef(secs: LSec[], ref: DecRef): LDec | null {
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
  | { type: 'p_move_seq';        ref: DecRef; ansIdx: number; seqIdx: number; dir: 'up' | 'down' }
  | { type: 'p_set_seq_label';   ref: DecRef; ansIdx: number; seqIdx: number; value: string }
  | { type: 'p_add_seq_pkg';     ref: DecRef; ansIdx: number; seqIdx: number }
  | { type: 'p_remove_seq_pkg';  ref: DecRef; ansIdx: number; seqIdx: number; pkgIdx: number }
  | { type: 'p_move_seq_pkg';   ref: DecRef; ansIdx: number; seqIdx: number; pkgIdx: number; dir: 'up' | 'down' }
  // Blocos "após convergência" da resposta (a.after) — pacotes/sequenciais no rodapé do chip.
  | { type: 'p_add_after';       ref: DecRef; ansIdx: number; atIdx?: number }
  | { type: 'p_add_after_pkg';   ref: DecRef; ansIdx: number; afterIdx: number }
  | { type: 'p_remove_after';    ref: DecRef; ansIdx: number; afterIdx: number }
  | { type: 'p_move_after';      ref: DecRef; ansIdx: number; afterIdx: number; dir: 'up' | 'down' }
  | { type: 'p_set_after_label'; ref: DecRef; ansIdx: number; afterIdx: number; value: string }
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
  // Inserção relativa ao chip SEMPRE: abre o picker e ajusta alwaysAfterIdx atomicamente
  | { type: 'ins_near_sempre';    secIdx: number; above: boolean }
  // Reposicionamento do chip SEMPRE dentro da seção
  | { type: 'p_move_sempre_pos';  secIdx: number; dir: 'up' | 'down' }
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
  // Abre o seletor de blocos existentes para inserir uma nova seção `ref` logo abaixo.
  | { type: 'insert_ref_section_pick'; afterSecIdx: number }
  // Mover/copiar em 2 cliques: 1º escolhe o DESTINO no menu do chip (transfer_target),
  // 2º clica na pergunta de ORIGEM (pick_source). `ref`+`ansIdx` = a resposta destino.
  | { type: 'transfer_target';  mode: 'move' | 'copy'; ref: DecRef; ansIdx: number }
  | { type: 'transfer_target_sec'; mode: 'move' | 'copy'; secIdx: number }
  // Destino = outra PERGUNTA: 'below' insere como irmã logo abaixo dela; 'replace'
  // substitui o conteúdo da pergunta destino pelo da origem (pergunta + respostas + subárvore).
  | { type: 'transfer_target_dec'; mode: 'move' | 'copy'; ref: DecRef; placement: 'below' | 'replace' }
  | { type: 'pick_source';      ref: DecRef; question: string }
  // Ações genéricas de pergunta por caminho — válidas em QUALQUER nível de aninhamento
  // (topo, sub, afterSub, afterDec, aeRef). Operam na lista que contém a decisão.
  | { type: 'p_move_dec';       ref: DecRef; dir: 'up' | 'down' }
  | { type: 'p_copy_dec';       ref: DecRef }
  | { type: 'p_ins_dec';        ref: DecRef; offset: 0 | 1 }
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
  | { type: 'p_reorder_pkg';        ref: DecRef; ansIdx: number; from: number; to: number }
  | { type: 'p_reorder_dec_pkg';    ref: DecRef; from: number; to: number }
  | { type: 'reorder_always';       secIdx: number; from: number; to: number }
  | { type: 'p_dec_reorder_after_pkg'; ref: DecRef; afterIdx: number; from: number; to: number }
  | { type: 'p_reorder_seq_pkg';    ref: DecRef; ansIdx: number; seqIdx: number; from: number; to: number }
  | { type: 'p_reorder_after_pkg';  ref: DecRef; ansIdx: number; afterIdx: number; from: number; to: number }
  | { type: 'p_add_pkg_direct';     ref: DecRef; ansIdx: number; pkgId: string; pkgName: string }
  | { type: 'p_ins_ans';            ref: DecRef; atIdx: number }
  | { type: 'add_dec_after_chip_sub'; ref: DecRef; afterIdx: number; isAfterSub?: boolean }
  | { type: 'remove_dec_after_chip_sub'; ref: DecRef; afterIdx: number; isAfterSub: boolean; subIdx: number }
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
  // Condição de emissão de pacote em campos de campo (dec.after / ans.seq / ans.after)
  | { type: 'p_set_dec_after_pkg_condition'; ref: DecRef; afterIdx: number; pkgIdx: number; condition?: string }
  | { type: 'p_set_seq_pkg_condition'; ref: DecRef; ansIdx: number; seqIdx: number; pkgIdx: number; condition?: string }
  | { type: 'p_set_after_pkg_condition'; ref: DecRef; ansIdx: number; afterIdx: number; pkgIdx: number; condition?: string }
  // Fase OW de um pacote (LPkgPhase) — paralelo às actions de condition
  | { type: 'p_set_pkg_phase'; ref: DecRef; ansIdx?: number; pkgIdx: number; phase?: string }
  | { type: 'p_set_dec_after_pkg_phase'; ref: DecRef; afterIdx: number; pkgIdx: number; phase?: string }
  | { type: 'p_set_seq_pkg_phase'; ref: DecRef; ansIdx: number; seqIdx: number; pkgIdx: number; phase?: string }
  | { type: 'p_set_after_pkg_phase'; ref: DecRef; ansIdx: number; afterIdx: number; pkgIdx: number; phase?: string }
  // Campo SEMPRE da seção (sec.always) — mesma edição por pacote dos demais campos
  | { type: 'p_set_always_pkg_condition'; secIdx: number; pkgIdx: number; condition?: string }
  | { type: 'p_set_always_pkg_phase'; secIdx: number; pkgIdx: number; phase?: string }
  | { type: 'p_toggle_always_pkg_contingency'; secIdx: number; pkgIdx: number }
  // ── Contingência de CAMPO (LSeqEntry: dec.after / ans.after / ans.seq) ──────
  | { type: 'p_toggle_dec_after_conting'; ref: DecRef; afterIdx: number }
  | { type: 'p_toggle_ans_after_conting'; ref: DecRef; ansIdx: number; afterIdx: number }
  | { type: 'p_toggle_ans_seq_conting';   ref: DecRef; ansIdx: number; seqIdx: number }
  // ── Colar (clipboard interno do LogicFlowEditor: Ctrl+C/Ctrl+V) ─────────────
  // O payload é um deep-clone feito na cópia; o editor clona de novo ao colar.
  | { type: 'p_paste_dec';     ref: DecRef; dec: LDec }                 // cola pergunta como irmã abaixo de ref
  | { type: 'p_paste_sub_dec'; ref: DecRef; ansIdx: number; dec: LDec } // cola como sub-pergunta da resposta
  | { type: 'p_paste_ans';     ref: DecRef; ans: LAns }                 // cola resposta ao final da pergunta

export type FlowNodeTarget =
  | { kind: 'sec'; secIdx: number }
  | { kind: 'q'; ref: DecRef }
  | { kind: 'a'; ref: DecRef; ansIdx: number }
  | { kind: 'conv'; ref: DecRef }

// Color palettes (SVG hex values) — exportadas para o LogicFlowEditor (mesmas cores)
export type PC = 'gray'|'blue'|'amber'
export type PEntry = {
  hdr: string; hdrT: string; dec: string; decT: string
  ans: string; ansB: string; ansT: string; act: string; actT: string
  alw: string; bg: string; bgB: string; code: string
  arr: string; bb: string; bT: string
  lbl: string; lblT: string; empty: string; noteT: string
}

export const PAL: Record<PC, PEntry> = {
  gray:  { hdr:'#334155', hdrT:'#fafafa', dec:'#475569', decT:'#f1f5f9', ans:'#f1f5f9', ansB:'#94a3b8', ansT:'#1e293b', act:'#1e3a8a', actT:'#f0f9ff', alw:'#e2e8f0', bg:'#fafafa', bgB:'#cbd5e1', code:'#2563eb', arr:'#64748b', bb:'#cbd5e1', bT:'#1e293b', lbl:'#e2e8f0', lblT:'#1e293b', empty:'#94a3b8', noteT:'#64748b' },
  blue:  { hdr:'#312e81', hdrT:'#eef2ff',  dec:'#4338ca', decT:'#eef2ff',  ans:'#f1f5f9', ansB:'#94a3b8', ansT:'#1e293b', act:'#312e81', actT:'#eef2ff',  alw:'#e0e7ff', bg:'#eef2ff', bgB:'#a5b4fc', code:'#3730a3', arr:'#818cf8', bb:'#a5b4fc', bT:'#1e1b4b', lbl:'#e2e8f0', lblT:'#1e293b', empty:'#94a3b8', noteT:'#64748b' },
  amber: { hdr:'#92400e', hdrT:'#fff',    dec:'#b45309', decT:'#fff',    ans:'#fefce8', ansB:'#fcd34d', ansT:'#451a03', act:'#92400e', actT:'#fef3c7', alw:'#fde68a', bg:'#fffbeb', bgB:'#fcd34d', code:'#b45309', arr:'#d97706', bb:'#fcd34d', bT:'#451a03', lbl:'#fde68a', lblT:'#451a03', empty:'#d97706', noteT:'#b45309' },
}

export const DARK_PAL: Record<PC, PEntry> = {
  gray:  { hdr:'#1e293b', hdrT:'#e2e8f0', dec:'#334155', decT:'#e2e8f0', ans:'#1e293b', ansB:'#334155', ansT:'#cbd5e1', act:'#2563eb', actT:'#eff6ff', alw:'#0f172a', bg:'#0f172a', bgB:'#334155', code:'#60a5fa', arr:'#475569', bb:'#334155', bT:'#94a3b8', lbl:'#334155', lblT:'#94a3b8', empty:'#475569', noteT:'#64748b' },
  blue:  { hdr:'#1e1b4b', hdrT:'#e0e7ff',  dec:'#312e81', decT:'#e0e7ff',  ans:'#1e293b', ansB:'#334155', ansT:'#cbd5e1', act:'#4338ca', actT:'#eef2ff',  alw:'#0f0e2b', bg:'#0d0c24', bgB:'#312e81', code:'#818cf8', arr:'#4f46e5', bb:'#1e1b4b', bT:'#a5b4fc', lbl:'#334155', lblT:'#94a3b8', empty:'#475569', noteT:'#64748b' },
  amber: { hdr:'#78350f', hdrT:'#fef3c7', dec:'#92400e', decT:'#fef3c7', ans:'#1c1007', ansB:'#92400e', ansT:'#fde68a', act:'#b45309', actT:'#fef3c7', alw:'#1c1007', bg:'#0c0802', bgB:'#78350f', code:'#fbbf24', arr:'#d97706', bb:'#292010', bT:'#fcd34d', lbl:'#422006', lblT:'#fde68a', empty:'#b45309', noteT:'#f59e0b' },
}

let _editCb: ((a: EditAction) => void) | null = null
// Floating action menu — a single "＋" per card opens a labeled list of actions,
// replacing the dense row of cryptic icon buttons.
export type MenuItem = { label: string; glyph?: string; color?: string; danger?: boolean; onClick: () => void }
// Resolved version passed to ClassicSidePanel (list already computed from current secs)
export type ResolvedPkgList = {
  list: LPkg[]; onAdd: () => void; onMove: (idx: number, dir: 'up' | 'down') => void
  onRemove: (idx: number) => void; onCondition?: (idx: number, condition?: string) => void
  onPhase?: (idx: number, phase?: string) => void
  onReorder?: (from: number, to: number) => void
}
// Menu padrão de PERGUNTA (losango) — o MESMO conjunto de ações em todos os níveis
// (pergunta de topo, sub-pergunta, sub após pacotes, pós-convergência, dentro de chips).
// Todas as ações são genéricas por DecRef e resolvidas por identidade no editor.
// `fireCb` permite o LogicFlowEditor reutilizar o mesmo menu com seu próprio callback.
export function qMenuItems(ref: DecRef, fireCb?: (a: EditAction) => void, opts?: { isFirstInSection?: boolean; noAddAnswer?: boolean }): MenuItem[] {
  const fire = fireCb ?? _editCb!
  return [
    ...(!opts?.noAddAnswer ? [{ label: 'Adicionar resposta', glyph: '➕', color: '#0ea5e9', onClick: () => fire({ type: 'p_add_ans', ref }) }] : []),
    ...(opts?.isFirstInSection ? [{ label: 'Adicionar campo acima', glyph: '📦', color: '#f97316', onClick: () => fire({ type: 'p_add_dec_pkg', ref }) }] : []),
    { label: 'Inserir pergunta acima', glyph: '↑', color: '#22d3ee', onClick: () => fire({ type: 'p_ins_dec', ref, offset: 0 }) },
    { label: 'Mover pergunta acima', glyph: '⬆', color: '#94a3b8', onClick: () => fire({ type: 'p_move_dec', ref, dir: 'up' }) },
    { label: 'Mover pergunta abaixo', glyph: '⬇', color: '#94a3b8', onClick: () => fire({ type: 'p_move_dec', ref, dir: 'down' }) },
    { label: 'Duplicar pergunta', glyph: '⧉', color: '#14b8a6', onClick: () => fire({ type: 'p_copy_dec', ref }) },
    { label: 'Mover pergunta para cá (abaixo desta)', glyph: '⤿', color: '#a855f7', onClick: () => fire({ type: 'transfer_target_dec', mode: 'move', ref, placement: 'below' }) },
    { label: 'Remover pergunta', glyph: '×', color: '#ef4444', danger: true, onClick: () => fire({ type: 'p_remove_dec', ref }) },
  ]
}

export function useDark() {
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

export function ClassicSidePanel({ title, items, pkgs, onClose, dark, pos, onTitleChange }: {
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
              <span className="w-4 flex items-center justify-center shrink-0" style={{ color: it.danger ? '#fb7185' : '#94a3b8' }}>
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
              <span className="w-4 flex items-center justify-center shrink-0" style={{ color: '#94a3b8' }}><LuPackage size={15} /></span>
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
