// Lógica de tempo firme/contingencial da Etapa 3 (Ajuste de Tempos).
// Fica num módulo à parte (em vez de duplicada em FineTuningView.tsx e no reducer
// de AppContext.tsx) para garantir que o total exibido na UI (StatsPanel, Resumo de
// Tempos, rodapé da tabela) seja SEMPRE igual à base usada pelo rateio em
// FT_RESCALE_TIMES — qualquer divergência entre esses cálculos faz o "novo tempo
// total" digitado pelo usuário não bater com o total exibido depois de aplicado.
// Por isso buildTimeCarriers() soma exatamente os mesmos itens/linhas que
// pkgFirme()/pkgCont() somam para exibição — nenhuma exceção (ex.: pacotes de
// navegação) só de um dos lados.
import type { FineTuningItem } from '../types'

export type TimeCarrier = { uid: string; lineId?: string; dur: number }

// Retorna true quando todas as linhas não-nav do pacote estão marcadas como paralelas.
export function allLinesParallel(item: FineTuningItem): boolean {
  const opLines = item.lines.filter(l => !l.isNavLine)
  return opLines.length > 0 && opLines.every(l => l.isParallel)
}

// Carriers de tempo FIRME de um pacote: cada carrier é o pacote inteiro (nível
// pacote) OU uma de suas linhas (nível linha) — nunca os dois ao mesmo tempo,
// mesma regra usada para exibir o tempo do pacote.
function itemFirmeCarriers(item: FineTuningItem): TimeCarrier[] {
  if (item.isBlank || item.isContingency || item.isParallel) return []
  if (item.lines.length === 0) return item.duration > 0 ? [{ uid: item.uid, dur: item.duration }] : []
  const hasTime = item.lines.some(l => (l.duration ?? 0) > 0)
  if (!hasTime) {
    if (allLinesParallel(item)) return []
    return item.duration > 0 ? [{ uid: item.uid, dur: item.duration }] : []
  }
  return item.lines
    .filter(l => !l.isContingency && !l.isParallel && (l.duration ?? 0) > 0)
    .map(l => ({ uid: item.uid, lineId: l.id, dur: l.duration! }))
}

// Carriers de tempo CONTINGENCIAL — mesma ideia, para pacotes/linhas de contingência.
function itemContCarriers(item: FineTuningItem): TimeCarrier[] {
  if (item.isBlank || item.isParallel) return []
  if (item.lines.length === 0) {
    if (!item.isContingency) return []
    return item.duration > 0 ? [{ uid: item.uid, dur: item.duration }] : []
  }
  const hasTime = item.lines.some(l => (l.duration ?? 0) > 0)
  if (!hasTime) {
    if (item.isContingency && !allLinesParallel(item)) return item.duration > 0 ? [{ uid: item.uid, dur: item.duration }] : []
    return []
  }
  if (item.isContingency) {
    return item.lines
      .filter(l => !l.isParallel && (l.duration ?? 0) > 0)
      .map(l => ({ uid: item.uid, lineId: l.id, dur: l.duration! }))
  }
  return item.lines
    .filter(l => l.isContingency && !l.isParallel && (l.duration ?? 0) > 0)
    .map(l => ({ uid: item.uid, lineId: l.id, dur: l.duration! }))
}

export function pkgFirme(item: FineTuningItem): number {
  return itemFirmeCarriers(item).reduce((s, c) => s + c.dur, 0)
}
export function pkgCont(item: FineTuningItem): number {
  return itemContCarriers(item).reduce((s, c) => s + c.dur, 0)
}

// Carriers de TODOS os pacotes, para o ajuste de tempo TOTAL — soma exatamente os
// mesmos itens que compõem o grandFirme/grandCont exibidos (sum de pkgFirme/pkgCont).
export function buildTimeCarriers(items: FineTuningItem[], kind: 'firme' | 'cont'): TimeCarrier[] {
  const carriers: TimeCarrier[] = []
  for (const item of items) {
    carriers.push(...(kind === 'firme' ? itemFirmeCarriers(item) : itemContCarriers(item)))
  }
  return carriers
}
