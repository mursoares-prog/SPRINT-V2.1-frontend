// Revisão da ontologia OpenWells contra a fase do cronograma (Etapa 3).
//
// Cada linha de pacote carrega uma classificação estática (owFase/owAtividade/owOperacao/owEtapa)
// vinda de packageLines.json, mas o pacote é posicionado dinamicamente numa fase do cronograma.
// Quando a owFase da linha diverge da fase em que o pacote caiu, há inconsistência. Este módulo
// concentra: o mapeamento fase→OW, a detecção de divergência e a correção automática (escolhendo
// uma atividade/operação/etapa válida na fase-alvo, reaproveitando os valores atuais ou derivando
// da descrição da linha). Lógica pura, sem React — o reducer apenas aplica reviewItems().

import type { FineTuningItem, FineTuningLine, Phase } from '../types'
import OW_TREE_JSON from '../data/owOntology.json'

// Ontologia OpenWells (hierárquica) — fonte: "Nova Ontologia de Abandono V6 3.xlsx"
// Fase → Atividade → Operação → [Etapas]; listas em cascata (dependentes).
export type OwTree = Record<string, Record<string, Record<string, string[]>>>
export const OW_TREE = OW_TREE_JSON as OwTree

export const owFases = () => Object.keys(OW_TREE)
export const owAtividades = (f: string) => Object.keys(OW_TREE[f] ?? {})
export const owOperacoes = (f: string, a: string) => Object.keys(OW_TREE[f]?.[a] ?? {})
export const owEtapas = (f: string, a: string, o: string) => OW_TREE[f]?.[a]?.[o] ?? []

// Mapeamento fase do cronograma → fase OW. Apenas as fases numeradas têm correspondência
// verificável; as demais (Extra Abandono, Mobilização, Desmobilização) não são checadas nem
// corrigidas — DMM/DMA/EXTRA-ABANDONO existem em todas as fases OW, então não há "fase certa".
export const FASE_TO_OW: Partial<Record<Phase, string>> = {
  'Fase 0':  'AP. 0',
  'Fase 1A': 'AP. 1A',
  'Fase 1B': 'AP. 1B',
  'Fase 2':  'AP. 2',
}

export function expectedOwFase(phase: Phase): string | undefined {
  return FASE_TO_OW[phase]
}

// true só quando a fase tem correspondência, a linha tem owFase preenchida e ela diverge.
// Linhas sem owFase (manuais/em branco) nunca são sinalizadas.
export function isOntologyMismatch(line: FineTuningLine, phase: Phase): boolean {
  const expected = expectedOwFase(phase)
  if (!expected || !line.owFase) return false
  return line.owFase !== expected
}

// ── Similaridade de texto (overlap de tokens normalizados) ─────────────────────
const STOPWORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os', 'na', 'no', 'nas', 'nos',
  'em', 'com', 'para', 'por', 'ao', 'aos', 'um', 'uma', 'que', 'se',
])

// Minúsculas, sem acentos — base para tokenização e para o casamento de palavras-chave de calibração.
export function normalizeText(s: string): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t))
}

// Similaridade tipo cosseno sobre conjuntos de tokens: interseção / sqrt(|a|·|b|), em [0,1].
export function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return inter / Math.sqrt(ta.size * tb.size)
}

// ── Calibração de domínio ──────────────────────────────────────────────────────
// Regras explícitas, fornecidas pelo especialista, que têm prioridade sobre o casamento fuzzy.
// O fuzzy erra quando uma mesma etapa existe sob várias operações e o nome da operação de origem
// puxa para a operação errada; estas regras fixam a atividade/operação correta por fase a partir
// de palavras-chave da descrição da linha. A etapa, se não fixada, ainda é derivada por
// similaridade dentro da operação escolhida.
//
// Para calibrar: acrescente entradas aqui. `keywords` casa por palavra inteira (todas precisam
// aparecer) sobre o texto normalizado da linha; `excludeKeywords` (opcional) veta a regra.
interface CalibrationHint {
  fase: string              // fase OW alvo (ex.: 'AP. 0')
  keywords: string[]        // todas devem aparecer no texto (palavra inteira, sem acento)
  excludeKeywords?: string[] // se qualquer uma aparecer, a regra é ignorada
  atividade: string
  operacao: string
  etapa?: string            // se omitida, a etapa é escolhida por similaridade dentro da operação
}

const CALIBRATION_HINTS: CalibrationHint[] = [
  // Fase 0: preparação e descida do conjunto de WO (TRT+CWO) → Desconexão e Fundeio de TCAP.
  { fase: 'AP. 0', keywords: ['conjunto', 'wo'], atividade: 'Retirada de TCAP', operacao: 'Desconexão e Fundeio de TCAP' },
]

// Casa palavra inteira no texto normalizado (trata 'wo', 'trt' etc. sem casar dentro de outra palavra).
function matchesKeyword(normText: string, keyword: string): boolean {
  const k = normalizeText(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${k}\\b`).test(normText)
}

function matchHint(targetFase: string, line: FineTuningLine): CalibrationHint | null {
  const t = normalizeText(line.text ?? '')
  for (const h of CALIBRATION_HINTS) {
    if (h.fase !== targetFase) continue
    if (!h.keywords.every(k => matchesKeyword(t, k))) continue
    if (h.excludeKeywords?.some(k => matchesKeyword(t, k))) continue
    return h
  }
  return null
}

// Etapa dentro de uma (atividade, operação), escolhida DEPOIS da operação. A etapa SEMPRE pertence
// à operação escolhida (respeita o vínculo fase>atividade>operação>etapa). Retorna:
//   '' se a operação não tiver etapas (folha de nível operação);
//   a etapa atual, se válida na operação;
//   a etapa mais parecida com [etapa atual + descrição] se houver algum sinal;
//   null se a lista não é vazia mas não há sinal — o caller decide o fallback (herda de linha-irmã
//   do grupo ou usa a etapa default do grupo), nunca um valor fora da lista.
function deriveEtapa(fase: string, a: string, o: string, curE: string, text: string): string | null {
  const ets = owEtapas(fase, a, o)
  if (ets.length === 0) return ''
  if (curE && ets.includes(curE)) return curE
  let best: string | null = null, bestScore = 0
  for (const e of ets) {
    const s = similarity(`${curE} ${text}`, e)
    if (s > bestScore) { bestScore = s; best = e }
  }
  return best
}

// Etapa default do grupo: a mais parecida com o texto representativo; senão a primeira da operação.
// Sempre um valor válido da operação (ou '' se não houver etapas).
function defaultEtapa(fase: string, a: string, o: string, sampleText: string): string {
  const ets = owEtapas(fase, a, o)
  if (ets.length === 0) return ''
  let best: string | null = null, bestScore = 0
  for (const e of ets) {
    const s = similarity(sampleText, e)
    if (s > bestScore) { bestScore = s; best = e }
  }
  return best ?? ets[0]
}

// Operações "raras" — tempo não-produtivo (clima, espera, manutenção), reparo após falha e
// desconexões/reinstalações programadas. Têm nomes de etapa genéricos ("Preparando...", "Inspeção
// com ROV", "Descendo...") que o fuzzy casa por engano, mas raramente fazem parte de um cronograma
// planejado. São EXCLUÍDAS como candidatas da derivação automática (continuam selecionáveis à mão e
// preservadas por carry-over quando a linha de origem já é uma delas). Calibrável: edite o conjunto.
const RARE_OPERATIONS = new Set([
  'Aguardo de operação paralela de equipamentos submarinos',
  'Condições climáticas',
  'Fatores Externos',
  'Manutenção',
  'Reparo',
  'Situações logísticas',
  'Dissociação/Prevenção Hidrato',
  'Instalação de TRT após reparo',
  'Instalação de CWO após reparo',
  'Instalação de BOP após reparo',
  'Desconexão/Retirada de CWO para reparo',
  'Desconexão/Retirada de TRT para reparo',
  'Retirada de BOP para reparo',
  'Desconexão programada do CWO',
  'Instalação de CWO após desconexão programada',
  'Desassentamento do TH com Ferramenta de Emergência',
].map(normalizeText))

function isRareOperation(op: string): boolean {
  return RARE_OPERATIONS.has(normalizeText(op))
}

type OntTarget = { atividade: string; operacao: string }

// Escolhe a OPERAÇÃO (atividade·operação) na fase-alvo por similaridade contra [atividade+operação
// de origem + texto representativo], com bônus quando a atividade reaparece igual. Operações raras
// são puladas como candidatas. SEMPRE retorna uma operação válida da fase-alvo — a integridade do
// vínculo tem prioridade sobre preservar a classificação de origem.
function pickOperation(targetFase: string, curA: string, curO: string, sampleText: string): OntTarget {
  let best: OntTarget | null = null
  let bestScore = -1
  for (const a of owAtividades(targetFase)) {
    for (const o of owOperacoes(targetFase, a)) {
      if (o !== curO && isRareOperation(o)) continue
      const leaf = `${a} ${o}`
      let s = similarity(`${curA} ${curO}`, leaf) + 0.5 * similarity(sampleText, leaf)
      if (a === curA) s += 0.5
      if (s > bestScore) { bestScore = s; best = { atividade: a, operacao: o } }
    }
  }
  // Fallback defensivo (nunca deve ocorrer para fases com ontologia): primeira atividade válida.
  return best ?? { atividade: owAtividades(targetFase)[0] ?? '', operacao: '' }
}

// Resolve a operação-alvo para um GRUPO de linhas que compartilham a operação de origem — a operação
// é uma propriedade do contexto (pacote), não da linha isolada. Prioridade:
//  1. Calibração: se QUALQUER linha do grupo casa uma regra, ela vale para o grupo todo.
//  2. Carry-over: se a operação de origem já existe na fase-alvo, mantém-na.
//  3. Similaridade de operação (pickOperation) — sempre uma operação válida da fase-alvo.
// A etapa é decidida depois, por linha — operação antes da etapa.
function resolveGroupOperation(
  targetFase: string,
  groupLines: FineTuningLine[],
): OntTarget & { etapa?: string } {
  for (const line of groupLines) {
    const hint = matchHint(targetFase, line)
    if (hint && OW_TREE[targetFase]?.[hint.atividade]?.[hint.operacao])
      return { atividade: hint.atividade, operacao: hint.operacao, etapa: hint.etapa }
  }
  const curA = groupLines[0].owAtividade ?? ''
  const curO = groupLines[0].owOperacao ?? ''
  if (curO && owOperacoes(targetFase, curA).includes(curO))
    return { atividade: curA, operacao: curO }
  const sampleText = groupLines.map(l => l.text ?? '').join(' ').slice(0, 400)
  return pickOperation(targetFase, curA, curO, sampleText)
}

// Conveniência para uma única linha (sem contexto de pacote). Mantida para reuso/testes.
export function pickOntologyPath(
  targetFase: string,
  line: FineTuningLine,
): { atividade: string; operacao: string; etapa: string } {
  const curE = line.owEtapa ?? '', text = line.text ?? ''
  if (owAtividades(targetFase).length === 0)
    return { atividade: line.owAtividade ?? '', operacao: line.owOperacao ?? '', etapa: curE }
  const res = resolveGroupOperation(targetFase, [line])
  const etapa = res.etapa
    ?? deriveEtapa(targetFase, res.atividade, res.operacao, curE, text)
    ?? defaultEtapa(targetFase, res.atividade, res.operacao, text)
  return { atividade: res.atividade, operacao: res.operacao, etapa }
}

// Conta quantas linhas divergem (para o badge do botão de revisão).
export function countMismatches(items: FineTuningItem[]): number {
  let n = 0
  for (const item of items) {
    if (item.isBlank) continue
    for (const line of item.lines) if (isOntologyMismatch(line, item.phase)) n++
  }
  return n
}

// Corrige apenas as linhas divergentes, retornando uma nova lista de itens (imutável).
// A operação-alvo é resolvida por GRUPO de linhas que compartilham a operação de origem dentro do
// pacote (propagando regras/decisão para todo o grupo); a etapa é derivada por linha em seguida.
// Itens/linhas sem divergência são preservados por referência.
export function reviewItems(items: FineTuningItem[]): FineTuningItem[] {
  return items.map(item => {
    if (item.isBlank) return item
    const expected = expectedOwFase(item.phase)
    if (!expected) return item

    const mismatched = item.lines.filter(l => isOntologyMismatch(l, item.phase))
    if (mismatched.length === 0) return item

    // Agrupa linhas divergentes pela operação de origem (atividade+operação) e resolve uma vez por grupo.
    const groups = new Map<string, FineTuningLine[]>()
    for (const l of mismatched) {
      const key = `${l.owAtividade ?? ''}|||${l.owOperacao ?? ''}`
      const g = groups.get(key)
      if (g) g.push(l); else groups.set(key, [l])
    }
    type GroupRes = OntTarget & { etapa?: string; defaultEtapa: string }
    const resolved = new Map<string, GroupRes>()
    for (const [key, gLines] of groups) {
      const r = resolveGroupOperation(expected, gLines)
      const sample = gLines.map(l => l.text ?? '').join(' ').slice(0, 400)
      resolved.set(key, { ...r, defaultEtapa: defaultEtapa(expected, r.atividade, r.operacao, sample) })
    }

    // Etapa decidida por linha; quando uma linha não tem etapa equivalente, herda a última etapa
    // válida já atribuída ao grupo (carry-forward) e, na falta, a etapa default do grupo — sempre
    // um valor que pertence à operação (vínculo respeitado em todos os níveis).
    const carry = new Map<string, string>()
    const lines = item.lines.map(line => {
      if (!isOntologyMismatch(line, item.phase)) return line
      const key = `${line.owAtividade ?? ''}|||${line.owOperacao ?? ''}`
      const res = resolved.get(key)!
      let etapa: string
      if (res.etapa !== undefined) {
        etapa = res.etapa
      } else {
        const d = deriveEtapa(expected, res.atividade, res.operacao, line.owEtapa ?? '', line.text ?? '')
        if (d !== null) { etapa = d; if (d) carry.set(key, d) }
        else etapa = carry.get(key) ?? res.defaultEtapa
      }
      return { ...line, owFase: expected, owAtividade: res.atividade, owOperacao: res.operacao, owEtapa: etapa }
    })
    return { ...item, lines }
  })
}
