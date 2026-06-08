import { createContext, useContext, useReducer, useRef, useState, type ReactNode } from 'react'
import type {
  AppState, WizardInputs, ScheduleItem,
  FineTuningItem, FineTuningLine, Technology, Phase,
  ProjectSection, ProjectField, ProjectData,
} from '../types'
import { getPackage, getDuration } from '../data/packages'
import {
  applyPlaceholders, hasTokens, DATA_SUB_FIELDS,
} from '../engines/placeholders'
import { bhaDerivedDepth } from '../engines/nippleDepth'
export { SLWLFT_HIGH_PKG_IDS } from '../engines/placeholders'
import PACKAGE_LINES from '../data/packageLines.json'
import PACKAGE_LINE_DETAILS from '../data/packageLineDetails.json'
import { reviewItems, FASE_TO_OW } from '../utils/ontologyReview'

type RawLine = {
  text: string
  duration: number | null
  bop: 'CONNECT_BOP' | 'DISCONNECT_BOP' | null
  compensando: boolean | null
  isContingency: boolean | null
  isParallel: boolean | null
  owFase: string | null
  owAtividade: string | null
  owOperacao: string | null
  owEtapa: string | null
  genOperacao: string | null
  genOperacaoDual: string | null
}
const PKG_LINES = PACKAGE_LINES as unknown as Record<string, RawLine[]>

// Detalhamento por linha (etapa 3): Recomendações → "Detalhes" (details),
// Padrões → "Referências Técnicas" (procedures). Alinhado POSICIONALMENTE com
// PKG_LINES (índice N ↔ linha N). Gerado por scripts/genLineDetails.mjs.
// Tratado como base: re-aplicado a cada (re)construção das linhas, igual aos
// demais campos de packageLines.json.
type LineDetail = { rec: string; pad: string } | null
const PKG_DETAILS = PACKAGE_LINE_DETAILS as unknown as Record<string, LineDetail[]>
const lineDetailAt = (pkgId: string, i: number): { procedures?: string; details?: string } => {
  const d = PKG_DETAILS[pkgId]?.[i]
  if (!d) return {}
  return { procedures: d.pad || undefined, details: d.rec || undefined }
}

// ── Navigation packages — duration computed from distance / speed ─────────────
// 1 knot = 1 NM/h → days = distNM / speedKnots / 24
export const NAV_PACKAGE_IDS = new Set(['ABAN 003', 'ABAN 208'])
// All packages that have lines with navigation placeholders (includes tool-in-hole nav)
const NAV_ALL_PACKAGE_IDS = new Set(['ABAN 003', 'ABAN 004', 'ABAN 005', 'ABAN 208'])
// owEtapa values that mark the actual sailing line (receives computed duration)
const NAV_ETAPAS = new Set(['Navegando', 'Navegando com BOP/Ferramenta no fundo'])
// owEtapa values that have nav placeholders but are not the main sailing line
const NAV_PREP_ETAPAS = new Set(['Preparando para navegar'])

// ── DMM/Mobilização — owFase segue a fase do cronograma ───────────────────────
// A mobilização inicia o cronograma e cai em fases diferentes conforme escopo/TCap
// (com TCap → Fase 0; sem TCap → Fase 1A; FS2 → Fase 2 — reclassificação já feita no
// engine, ver sequenceEngine.ts). A atividade DMM/DMA e as operações "Mobilização de
// sonda DP/ancorada" existem em TODAS as fases OW com as MESMAS etapas, então só a
// owFase precisa acompanhar a fase — evitando duplicar pacotes só para variar a
// ontologia. owAtividade/owOperacao/owEtapa são preservados (cadeia válida na fase-alvo).
const MOB_PACKAGE_IDS = new Set(['ABAN 001', 'ABAN 002', 'ABAN 003', 'ABAN 004', 'ABAN 005', 'ABAN 006', 'ABAN 007', 'ABAN 208'])
function deriveOwFase(packageId: string, phase: Phase, staticOwFase: string | null): string | undefined {
  if (MOB_PACKAGE_IDS.has(packageId)) return FASE_TO_OW[phase] ?? staticOwFase ?? undefined
  return staticOwFase ?? undefined
}

// ── Substituição por tokens {{campo=glifo}} (../engines/placeholders) ─────────
// O canal "outros" foi fundido no canal "data": toda linha com token (que não seja
// de navegação) usa dataTemplate e o gatilho DATA_SUB_FIELDS. Wrapper fino: resolve
// o plano de BHA do item (bhaPlans[uid]) para o RuleCtx.
function applyDataPlaceholders(
  template: string,
  uid: string,
  pkgId: string,
  pkgName: string,
  data: ProjectData,
): string {
  return applyPlaceholders(template, { data, plan: (data.bhaPlans ?? {})[uid] ?? {}, pkgId, pkgName })
}

function applyDataToLines(
  lines: import('../types').FineTuningLine[],
  uid: string,
  pkgId: string,
  pkgName: string,
  data: ProjectData,
): import('../types').FineTuningLine[] {
  return lines.map(l => {
    if (!l.dataTemplate) return l
    return { ...l, text: applyDataPlaceholders(l.dataTemplate, uid, pkgId, pkgName, data) }
  })
}

// Migração: atualiza dataTemplate de itens salvos para a versão atual de packageLines.json.
// Necessário quando novos tokens são adicionados a linhas já existentes — projetos salvos
// antes da adição carregam dataTemplate antigo (sem os novos tokens), causando falha na
// substituição. Chamada no LOAD_PROJECT para garantir que projetos existentes herdem os tokens.
function syncDataTemplates(
  items: import('../types').FineTuningItem[],
  data: ProjectData,
): import('../types').FineTuningItem[] {
  return items.map(item => {
    const rawLines = PKG_LINES[item.packageId] ?? []
    if (!rawLines.length) return item
    const isNavPkg = NAV_ALL_PACKAGE_IDS.has(item.packageId)
    let changed = false
    const lines = item.lines.map((l, i) => {
      const r = rawLines[i]
      if (!r) return l
      const isNavLine = isNavPkg && (NAV_ETAPAS.has(r.owEtapa ?? '') || NAV_PREP_ETAPAS.has(r.owEtapa ?? ''))
      const navTmpl = (isNavPkg && (isNavLine || hasTokens(r.text))) ? r.text : undefined
      const newTmpl = (!navTmpl && hasTokens(r.text)) ? r.text : undefined
      if (newTmpl === l.dataTemplate) return l
      changed = true
      return {
        ...l,
        dataTemplate: newTmpl,
        text: newTmpl
          ? applyDataPlaceholders(newTmpl, item.uid, item.packageId, item.packageName, data)
          : l.text,
      }
    })
    return changed ? { ...item, lines } : item
  })
}

// ── Localizar linhas relacionadas a um campo do assistente ────────────────────
// A line is "related" to a field when filling that field would change the line's
// text. We detect this generically by re-running the same substitution functions
// with the target empty vs. a sentinel value and diffing — so it always tracks the
// real placeholder logic, no per-field regex duplication.
export type LocateTarget =
  | { kind: 'data'; field: keyof ProjectData }   // ProjectData scalar (pressão, outros, fluido…)
  | { kind: 'plan'; uid: string; key: string }   // bhaPlans[uid][key] (campo de BHA por pacote)
  // Linha de nipple (seção Nipples): tipo + profundidade. Realça as linhas que usam o
  // token do tipo (ex.: {{nipple275}}) E as linhas cujo {{prof}} de BHA deriva deste nipple.
  | { kind: 'nipple'; typeField: keyof ProjectData; depthField: keyof ProjectData }
  // Correspondência direta no texto renderizado — usado na seção Hold Points para realçar
  // somente linhas que contêm o marcador [HOLD POINT - ...].
  | { kind: 'textMatch'; pattern: string }

const NAV_LOCATE_FIELDS = new Set(['poco', 'pocoOrigem', 'distanciaEntrePocos', 'velocidadeMedia'])
const LOCATE_PROBE = '█LOC█' // sentinel improvável de aparecer em qualquer template

export function lineIdsForLocate(
  target: LocateTarget,
  items: FineTuningItem[],
  data: ProjectData,
): Set<string> {
  const ids = new Set<string>()

  // Correspondência direta no texto renderizado — realça linhas cujo .text contém o padrão.
  if (target.kind === 'textMatch') {
    for (const item of items)
      for (const line of item.lines)
        if (line.text.includes(target.pattern)) ids.add(line.id)
    return ids
  }

  // Nipple → união de (1) o token do tipo (ex.: {{nipple275}} no gabarito) e (2) as linhas
  // cujo {{prof}} de BHA deriva da profundidade deste nipple (tratado pela ramificação 'data'
  // ciente da derivação abaixo).
  if (target.kind === 'nipple') {
    for (const id of lineIdsForLocate({ kind: 'data', field: target.typeField }, items, data)) ids.add(id)
    for (const id of lineIdsForLocate({ kind: 'data', field: target.depthField }, items, data)) ids.add(id)
    return ids
  }

  // Campos de navegação → todas as linhas de navegação (que carregam navTemplate).
  if (target.kind === 'data' && NAV_LOCATE_FIELDS.has(target.field as string)) {
    for (const item of items)
      for (const line of item.lines)
        if (line.navTemplate) ids.add(line.id)
    return ids
  }

  // Demais campos → probe (vazio vs. sentinela) sobre as funções de substituição.
  const dataA: ProjectData = (() => {
    if (target.kind === 'plan') {
      const plan = (data.bhaPlans ?? {})[target.uid] ?? {}
      return { ...data, bhaPlans: { ...(data.bhaPlans ?? {}), [target.uid]: { ...plan, [target.key]: '' } } }
    }
    return { ...data, [target.field]: '' }
  })()
  const dataB: ProjectData = (() => {
    if (target.kind === 'plan') {
      const plan = (data.bhaPlans ?? {})[target.uid] ?? {}
      return { ...data, bhaPlans: { ...(data.bhaPlans ?? {}), [target.uid]: { ...plan, [target.key]: LOCATE_PROBE } } }
    }
    return { ...data, [target.field]: LOCATE_PROBE }
  })()

  // Injeta o prof derivado do nipple no bhaPlans[uid] (usado quando o alvo é um campo de
  // nipple: o {{prof}} da linha deriva da profundidade, não é um token direto do campo).
  const withProf = (d: ProjectData, uid: string, prof: string): ProjectData =>
    ({ ...d, bhaPlans: { ...(d.bhaPlans ?? {}), [uid]: { ...((d.bhaPlans ?? {})[uid] ?? {}), prof } } })

  for (const item of items) {
    // Campos de BHA só afetam as linhas do próprio pacote (bhaPlans é indexado por uid).
    if (target.kind === 'plan' && item.uid !== target.uid) continue
    // Para alvos 'data', recomputa o prof derivado do nipple sob A e B; só difere quando o
    // alvo é a profundidade do nipple de onde este BHA deriva (caso contrário A == B).
    let dA = dataA, dB = dataB
    if (target.kind === 'data') {
      const profA = bhaDerivedDepth(item, dataA)
      const profB = bhaDerivedDepth(item, dataB)
      if (profA != null) dA = withProf(dataA, item.uid, profA)
      if (profB != null) dB = withProf(dataB, item.uid, profB)
    }
    for (const line of item.lines) {
      if (line.dataTemplate) {
        const a = applyDataPlaceholders(line.dataTemplate, item.uid, item.packageId, item.packageName, dA)
        const b = applyDataPlaceholders(line.dataTemplate, item.uid, item.packageId, item.packageName, dB)
        if (a !== b) ids.add(line.id)
      }
    }
  }
  return ids
}

// Linhas de navegação carregam tokens {{pocoOrigem}}/{{poco}}/{{distanciaEntrePocos}}
// (glifo de fallback "?"); o texto é preenchido por fillTokens como as demais.
function applyNavToLines(
  lines: FineTuningLine[],
  data: ProjectData,
  navDays: number | undefined,
): FineTuningLine[] {
  return lines.map(l => {
    const template = l.navTemplate
    if (!template) return l
    const newText = applyPlaceholders(template, { data, plan: {}, pkgId: '', pkgName: '' })
    const isNavEtapa = NAV_ETAPAS.has(l.owEtapa ?? '')
    return {
      ...l,
      text: newText,
      duration: isNavEtapa && navDays !== undefined ? navDays : l.duration,
    }
  })
}

function makeFineTuningItems(schedule: ScheduleItem[], projectData: ProjectData): FineTuningItem[] {
  const speed     = parseFloat(projectData.velocidadeMedia ?? '')
  const dist      = parseFloat(projectData.distanciaEntrePocos ?? '')
  const navDays   = (!isNaN(dist) && !isNaN(speed) && dist > 0 && speed > 0)
    ? dist / speed / 24
    : undefined

  return schedule.map(item => {
    const raw = PKG_LINES[item.packageId] ?? []
    const isNavPkg = NAV_ALL_PACKAGE_IDS.has(item.packageId)
    const lines: FineTuningLine[] = raw.map((r, i) => {
      const isNavLine = isNavPkg && (NAV_ETAPAS.has(r.owEtapa ?? '') || NAV_PREP_ETAPAS.has(r.owEtapa ?? ''))
      const navTmpl = (isNavPkg && (isNavLine || hasTokens(r.text))) ? r.text : undefined
      const dataTmpl = (!navTmpl && hasTokens(r.text)) ? r.text : undefined
      const text = navTmpl
        ? applyPlaceholders(navTmpl, { data: projectData, plan: {}, pkgId: item.packageId, pkgName: item.packageName })
        : dataTmpl
        ? applyDataPlaceholders(dataTmpl, item.uid, item.packageId, item.packageName, projectData)
        : r.text
      // packageLines.json stores durations in hours; internal unit is days
      const rawDays = r.duration != null ? r.duration / 24 : undefined
      const duration = NAV_ETAPAS.has(r.owEtapa ?? '') && navDays !== undefined
        ? navDays
        : rawDays
      return {
        id: `${item.uid}_l${i}`,
        text,
        navTemplate: navTmpl,
        dataTemplate: dataTmpl,
        technology: item.technology,
        duration,
        isContingency: r.isContingency ?? undefined,
        isParallel: r.isParallel ?? undefined,
        compensando: r.compensando ?? null,
        bopMarker: r.bop ?? undefined,
        owFase: deriveOwFase(item.packageId, item.phase, r.owFase),
        owAtividade: r.owAtividade ?? undefined,
        owOperacao: r.owOperacao ?? undefined,
        owEtapa: r.owEtapa ?? undefined,
        genOperacao: r.genOperacao ?? undefined,
        genOperacaoDual: r.genOperacaoDual ?? undefined,
        ...lineDetailAt(item.packageId, i),
      }
    })
    return {
      uid: item.uid,
      packageId: item.packageId,
      packageName: item.packageName,
      phase: item.phase,
      technology: item.technology,
      duration: item.duration,
      isContingency: item.isContingency,
      lines,
      expanded: false,
    }
  })
}

function manualFtItem(phase: Phase, uid?: string, lineId?: string): FineTuningItem {
  const itemUid = uid ?? `manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  return {
    uid: itemUid, packageId: 'MANUAL', packageName: '', phase,
    technology: 'none', duration: 0, isContingency: false,
    lines: [{ id: lineId ?? `${itemUid}_l${Date.now()}`, text: '', technology: 'none' }],
    expanded: true,
  }
}

function pkgFtItem(packageId: string, phase: Phase, percentile: number, data: ProjectData): FineTuningItem {
  const pkg = getPackage(packageId)
  const uid = `pkg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const packageName = pkg ? pkg.name : packageId
  const technology = (pkg?.technology ?? 'none') as Technology

  const speed = parseFloat(data.velocidadeMedia ?? '')
  const dist = parseFloat(data.distanciaEntrePocos ?? '')
  const navDays = (!isNaN(dist) && !isNaN(speed) && dist > 0 && speed > 0) ? dist / speed / 24 : undefined
  const isNavPkg = NAV_ALL_PACKAGE_IDS.has(packageId)

  const raw = PKG_LINES[packageId] ?? []
  const lines: FineTuningLine[] = raw.map((r, i) => {
    const isNavLine = isNavPkg && (NAV_ETAPAS.has(r.owEtapa ?? '') || NAV_PREP_ETAPAS.has(r.owEtapa ?? ''))
    const navTmpl = (isNavPkg && (isNavLine || hasTokens(r.text))) ? r.text : undefined
    const dataTmpl = (!navTmpl && hasTokens(r.text)) ? r.text : undefined
    const text = navTmpl
      ? applyPlaceholders(navTmpl, { data, plan: {}, pkgId: packageId, pkgName: packageName })
      : dataTmpl
        ? applyDataPlaceholders(dataTmpl, uid, packageId, packageName, data)
        : r.text
    const rawDays = r.duration != null ? r.duration / 24 : undefined
    const duration = NAV_ETAPAS.has(r.owEtapa ?? '') && navDays !== undefined ? navDays : rawDays
    return {
      id: `${uid}_l${i}`,
      text,
      navTemplate: navTmpl,
      dataTemplate: dataTmpl,
      technology,
      duration,
      isContingency: r.isContingency ?? undefined,
      isParallel: r.isParallel ?? undefined,
      compensando: r.compensando ?? null,
      bopMarker: r.bop ?? undefined,
      owFase: deriveOwFase(packageId, phase, r.owFase),
      owAtividade: r.owAtividade ?? undefined,
      owOperacao: r.owOperacao ?? undefined,
      owEtapa: r.owEtapa ?? undefined,
      genOperacao: r.genOperacao ?? undefined,
      genOperacaoDual: r.genOperacaoDual ?? undefined,
      ...lineDetailAt(packageId, i),
    }
  })

  return {
    uid,
    packageId,
    packageName,
    phase,
    technology,
    duration: getDuration(packageId, percentile),
    isContingency: false,
    lines,
    expanded: false,
  }
}

// ── Project sections defaults (kept for backwards compat) ────────────────────
const DEFAULT_PROJECT_SECTIONS: ProjectSection[] = []

// ── Project data defaults ─────────────────────────────────────────────────────
const DEFAULT_PROJECT_DATA: ProjectData = {
  sonda: '', mr: '', poco: '', mrp: '', lda: '',
  pocoOrigem: '', distanciaEntrePocos: '', velocidadeMedia: '',
  cwo: '',
  fluidoPeso: '',
  topKillFluid: '', topKillPeso: '',
  amortFluid: '', amortPeso: '',
  pressaoFratCapea: '', limitePressaoBombeio: '',
  mapecab: '', pressaoSuperficie: '', pressaoTrtAnm: '', pressaoSuperficieTechs: [],
  bhaPlans: {},
  nipple381: 'Nipple F 3,81"', nipple381Depth: '',
  nipple375: 'Nipple F 1,87"', nipple375Depth: '',
  nippleDhsv: 'Perfil DB 3,68" (DHSV)', nippleDhsvDepth: '',
  nipple281: 'Nipple F ou DB 3,75"', nipple281Depth: '',
  nippleTHanular: 'Não Aplicável', nippleTHanularDepth: '',
  nipple275: 'Nipple F 2,81"', nipple275Depth: '',
  nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '',
  insertNipple: '', camisaoId: '',
  cimentTopoAnularA: '', cimentTopoInteriorColuna: '',
  cimentProfPerfuracao: '', cimentProfBaseCimentacao: '', cimentCrProfundidade: '',
  cimentPlugs: {}, cimentPwc: '',
  testeInfluxo: '',
  hpNavFundo: false, hpSsub: false, hpCsbPrimario: false, hpCsbSecundario: false,
  holdPoints: [],
  outrosTrtWeightTcap: '', outrosTrtWeightAnm: '', outrosMegConc: '', outrosCoolingFlow: '',
  outrosPcabN2Psi: '', outrosDrainB2Psi: '', outrosN2FlowScfm: '',
  pressaoCavFibop: '', pressaoHcr: '', pressaoBoreTest: '', pressaoRiserBores: '', pressaoRiserCavConexao: '', pressaoRiserDpr: '', pressaoColunaDpr: '', pressaoColunaRiserDb: '', pressaoN2Trt: '',

  pressaoTmfProd: '', pressaoTmfAnulAnm: '', pressaoBullheadDhsv: '',
  pressaoBopArameHigh: '', pressaoBopPerfuracao: '', pressaoVgx: '', pressaoKillChoke: '', pressaoEquipSupBop: '', pressaoProva: '',
  pressaoEstStvR: '', pressaoEstPlugR: '', pressaoEstPlugF: '', pressaoEstPlugTH: '',
  pressaoEstTae: '', pressaoEstTmfProd: '', pressaoEstTmfAnul: '',
  bullheadVolume: '', bullheadDepth: '', amortFcbaDensidade: '',
  cimentAlinhamento: '', cimentPlugVol: '', cimentPlugDens: '', cimentFcbaDens: '',
  colunaTrabalhoDpDiam: '', volBombeioDescidaFt: '', crDiam: '', packerFtDiam: '',
  bismutoEur: '', bismutoOverpull: '',
  fcbaCorteDens: '', adaptadorMc: '', pressaoCabecaLimite: '', gabaritoNippleDiam: '',
  tampaoTipo: '', cimentAnularAcimaTampao: '', canhaoModelo: '', plugFtDiam: '', plugFtAplicador: '',
  ferramentaBoDuplaDiam: '', overpullKlbf: '', copCoiTubo: '', revestimentoDiam: '',
  tampaoAbandonoDens: '', tampaoAbandonoTopo: '', tampaoAbandonoCompr: '', ecsbFluidoDens: '',
  condicIntervaloTopo: '', condicIntervaloBase: '',
  ferramentaBhaFt: '', taeTuboDiam: '',
  profRegistroPressao: '', numEstacoesRp: '', corteBrocaDiam: '', corteDcSecoes: '', corteHwdpSecoes: '',
}

// ── Undo history ─────────────────────────────────────────────────────────────
const UNDOABLE_ACTIONS = new Set([
  'FT_UPDATE_ITEM', 'FT_UPDATE_LINE', 'FT_UPDATE_LINE_FIELDS',
  'FT_INSERT_ITEM', 'FT_INSERT_PKG', 'FT_REMOVE_ITEM', 'FT_INSERT_LINE_AFTER',
  'FT_REMOVE_LINE', 'FT_TOGGLE_PARALLEL', 'FT_TOGGLE_LINE_CONTINGENCY',
  'FT_TOGGLE_LINE_PARALLEL', 'FT_REORDER', 'FT_REORDER_LINES',
  'FT_RESCALE_TIMES', 'FT_RESTORE_TIMES', 'FT_REVIEW_ONTOLOGY',
])

// ── Action type ───────────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_VIEW'; view: AppState['view'] }
  | { type: 'SET_STEP'; step: number }
  | { type: 'UPDATE_INPUTS'; inputs: Partial<WizardInputs> }
  | { type: 'SET_SCHEDULE'; schedule: ScheduleItem[] }
  | { type: 'UPDATE_SCHEDULE'; schedule: ScheduleItem[] }
  | { type: 'UPDATE_ITEM_DURATION'; uid: string; duration: number }
  | { type: 'SET_WELL_NAME'; wellName: string }
  | { type: 'SET_PROJECT_ID'; projectId: string | undefined }
  | { type: 'LOAD_PROJECT'; wellName: string; inputs: WizardInputs; schedule: ScheduleItem[]; projectData?: ProjectData; fineTuningItems?: FineTuningItem[]; projectId?: string }
  | { type: 'TOGGLE_HOURS' }
  | { type: 'RESET' }
  // Fine Tuning — package level
  | { type: 'ENTER_FINE_TUNING' }
  | { type: 'FT_REORDER'; items: FineTuningItem[] }
  | { type: 'FT_UPDATE_ITEM'; uid: string; patch: Partial<Pick<FineTuningItem, 'packageName' | 'duration' | 'technology' | 'isContingency' | 'isParallel' | 'procedures' | 'details' | 'normas' | 'observacoes'>> }
  | { type: 'FT_TOGGLE_PARALLEL'; uid: string }
  | { type: 'FT_TOGGLE_EXPAND'; uid: string }
  | { type: 'FT_INSERT_ITEM'; afterUid: string | null; uid?: string; lineId?: string }
  | { type: 'FT_INSERT_PKG'; afterUid: string | null; packageId: string }
  | { type: 'FT_REMOVE_ITEM'; uid: string }
  // Fine Tuning — line level
  | { type: 'FT_ADD_LINE'; uid: string }
  | { type: 'FT_REMOVE_LINE'; uid: string; lineId: string }
  | { type: 'FT_UPDATE_LINE'; uid: string; lineId: string; text: string }
  | { type: 'FT_UPDATE_LINE_TECH'; uid: string; lineId: string; technology: Technology }
  | { type: 'FT_REORDER_LINES'; uid: string; lines: FineTuningLine[] }
  | { type: 'FT_INSERT_LINE_AFTER'; uid: string; afterLineId: string | null }
  | { type: 'FT_TOGGLE_LINE_CONTINGENCY'; uid: string; lineId: string }
  | { type: 'FT_TOGGLE_LINE_PARALLEL'; uid: string; lineId: string }
  | { type: 'FT_UPDATE_LINE_FIELDS'; uid: string; lineId: string; patch: Partial<Pick<FineTuningLine, 'duration' | 'procedures' | 'details' | 'normas' | 'observacoes' | 'csbPrimario' | 'csbSecundario' | 'bha' | 'edsNumber' | 'edsComment' | 'compensando' | 'owFase' | 'owAtividade' | 'owOperacao' | 'owEtapa' | 'genOperacao' | 'genOperacaoDual' | 'highlight'>> }
  | { type: 'FT_RESCALE_TIMES'; kind: 'firme' | 'cont'; targetDays: number }
  | { type: 'FT_RESTORE_TIMES'; kind: 'firme' | 'cont' }
  | { type: 'FT_REVIEW_ONTOLOGY' }
  // Project data panel
  | { type: 'PROJECT_UPDATE_DATA'; patch: Partial<ProjectData> }
  | { type: 'PROJECT_APPLY_SECTION'; patch: Partial<ProjectData>; reviewUids?: string[] }
  | { type: 'PROJECT_CLEAR_REVIEW' }
  | { type: 'PROJECT_REVERT_REVIEW' }
  | { type: 'PROJECT_REVIEW_CONFIRM_ONE'; uid: string }
  // Legacy section actions (kept for type safety, no-op in reducer)
  | { type: 'PROJECT_UPDATE_FIELD'; sectionId: string; fieldId: string; value: string }
  | { type: 'PROJECT_UPDATE_LABEL'; sectionId: string; fieldId: string; label: string }
  | { type: 'PROJECT_TOGGLE_SECTION'; sectionId: string }
  | { type: 'PROJECT_ADD_FIELD'; sectionId: string }
  | { type: 'PROJECT_REMOVE_FIELD'; sectionId: string; fieldId: string }
  | { type: 'PROJECT_ADD_SECTION' }
  | { type: 'PROJECT_REMOVE_SECTION'; sectionId: string }
  | { type: 'PROJECT_UPDATE_SECTION_TITLE'; sectionId: string; title: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESTORE_STATE'; snapshot: FineTuningItem[] }

const initial: AppState = {
  view: 'home',
  wizardStep: 1,
  inputs: { percentile: 75, startDate: new Date().toISOString().split('T')[0] },
  schedule: [],
  fineTuningItems: [],
  projectSections: DEFAULT_PROJECT_SECTIONS,
  projectData: DEFAULT_PROJECT_DATA,
  wellName: '',
  showHours: true,
  pendingReview: [],
  reviewSnapshot: null,
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function updateFtItem(
  items: FineTuningItem[], uid: string,
  fn: (item: FineTuningItem) => FineTuningItem,
): FineTuningItem[] {
  return items.map(it => it.uid === uid ? fn(it) : it)
}

function updateSection(
  sections: ProjectSection[], sectionId: string,
  fn: (s: ProjectSection) => ProjectSection,
): ProjectSection[] {
  return sections.map(s => s.id === sectionId ? fn(s) : s)
}

function updateField(
  sections: ProjectSection[], sectionId: string, fieldId: string,
  fn: (f: ProjectField) => ProjectField,
): ProjectSection[] {
  return updateSection(sections, sectionId, s => ({
    ...s, fields: s.fields.map(f => f.id === fieldId ? fn(f) : f),
  }))
}

// ── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_VIEW': return { ...state, view: action.view }
    case 'SET_STEP': return { ...state, wizardStep: action.step }
    case 'UPDATE_INPUTS': return { ...state, inputs: { ...state.inputs, ...action.inputs } }
    case 'SET_SCHEDULE': return { ...state, schedule: action.schedule, view: 'schedule' }
    case 'UPDATE_SCHEDULE': return { ...state, schedule: action.schedule }
    case 'UPDATE_ITEM_DURATION': return {
      ...state,
      schedule: state.schedule.map(item =>
        item.uid === action.uid ? { ...item, duration: action.duration } : item
      ),
    }
    case 'SET_WELL_NAME': return { ...state, wellName: action.wellName }
    case 'SET_PROJECT_ID': return { ...state, projectId: action.projectId }
    case 'LOAD_PROJECT': {
      const hasFt = !!action.fineTuningItems && action.fineTuningItems.length > 0
      const pd = action.projectData ?? DEFAULT_PROJECT_DATA
      return {
        ...state, wellName: action.wellName, inputs: action.inputs,
        projectId: action.projectId,
        schedule: action.schedule,
        projectData: pd,
        fineTuningItems: syncDataTemplates(action.fineTuningItems ?? [], pd),
        // Arquivo com detalhamento → abrir direto na etapa 3 para continuar;
        // arquivo legado (só cronograma) → etapa 2.
        view: hasFt ? 'fine_tuning' : 'schedule',
        wizardStep: 1,
        pendingReview: [], reviewSnapshot: null,
      }
    }
    case 'TOGGLE_HOURS': return { ...state, showHours: !state.showHours }
    case 'RESET': return {
      ...initial,
      projectSections: DEFAULT_PROJECT_SECTIONS,
      projectData: DEFAULT_PROJECT_DATA,
      pendingReview: [],
      inputs: { percentile: 75, startDate: new Date().toISOString().split('T')[0] },
    }

    // ── Fine Tuning — package ─────────────────────────────────────────
    case 'ENTER_FINE_TUNING': {
      // Regenera fineTuningItems quando o schedule mudou (uids diferentes do que estava salvo).
      // Garante que alterações na etapa 2 sejam refletidas ao retornar à etapa 3.
      const scheduleUids = new Set(state.schedule.map(i => i.uid))
      const ftUids = new Set(state.fineTuningItems.filter(i => !i.isBlank).map(i => i.uid))
      const scheduleChanged =
        scheduleUids.size !== ftUids.size
        || [...scheduleUids].some(u => !ftUids.has(u))
        || [...ftUids].some(u => !scheduleUids.has(u))
      const ftItems = (!scheduleChanged && state.fineTuningItems.length > 0)
        ? state.fineTuningItems
        : makeFineTuningItems(state.schedule, state.projectData)
      return { ...state, fineTuningItems: ftItems, view: 'fine_tuning' }
    }
    case 'FT_REORDER': return { ...state, fineTuningItems: action.items }
    case 'FT_UPDATE_ITEM': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => {
        const updated = { ...it, ...action.patch }
        if ('isContingency' in action.patch)
          updated.lines = it.lines.map(l => ({ ...l, isContingency: !!action.patch.isContingency }))
        return updated
      }),
    }
    case 'FT_TOGGLE_EXPAND': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({ ...it, expanded: !it.expanded })),
    }
    case 'FT_TOGGLE_PARALLEL': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => {
        const next = !it.isParallel
        return { ...it, isParallel: next, lines: it.lines.map(l => ({ ...l, isParallel: next })) }
      }),
    }
    case 'FT_INSERT_ITEM': {
      // Determine phase from neighboring item so manual items stay in same section
      let phase: Phase = 'Mobilização'
      if (action.afterUid === null) {
        phase = state.fineTuningItems.find(i => !i.isBlank)?.phase ?? 'Mobilização'
      } else {
        const idx = state.fineTuningItems.findIndex(i => i.uid === action.afterUid)
        const after = state.fineTuningItems[idx]
        const before = state.fineTuningItems.slice(idx + 1).find(i => !i.isBlank)
        phase = (after && !after.isBlank ? after.phase : null) ?? before?.phase ?? 'Mobilização'
      }
      const newItem = manualFtItem(phase, action.uid, action.lineId)
      if (action.afterUid === null) return { ...state, fineTuningItems: [newItem, ...state.fineTuningItems] }
      const idx = state.fineTuningItems.findIndex(i => i.uid === action.afterUid)
      return {
        ...state,
        fineTuningItems: [
          ...state.fineTuningItems.slice(0, idx + 1),
          newItem,
          ...state.fineTuningItems.slice(idx + 1),
        ],
      }
    }
    case 'FT_INSERT_PKG': {
      const percentile = state.inputs.percentile ?? 75
      // Determine phase from neighboring item (after, or fallback to before, or first item, or 'Mobilização')
      let phase: Phase = 'Mobilização'
      if (action.afterUid === null) {
        phase = state.fineTuningItems.find(i => !i.isBlank)?.phase ?? 'Mobilização'
      } else {
        const idx = state.fineTuningItems.findIndex(i => i.uid === action.afterUid)
        const after = state.fineTuningItems[idx]
        const before = state.fineTuningItems.slice(idx + 1).find(i => !i.isBlank)
        phase = (after && !after.isBlank ? after.phase : null) ?? before?.phase ?? 'Mobilização'
      }
      const newItem = pkgFtItem(action.packageId, phase, percentile, state.projectData)
      if (action.afterUid === null) return { ...state, fineTuningItems: [newItem, ...state.fineTuningItems] }
      const idx = state.fineTuningItems.findIndex(i => i.uid === action.afterUid)
      return {
        ...state,
        fineTuningItems: [
          ...state.fineTuningItems.slice(0, idx + 1),
          newItem,
          ...state.fineTuningItems.slice(idx + 1),
        ],
      }
    }
    case 'FT_REMOVE_ITEM': return {
      ...state, fineTuningItems: state.fineTuningItems.filter(i => i.uid !== action.uid),
    }

    // ── Fine Tuning — lines ───────────────────────────────────────────
    case 'FT_ADD_LINE': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it,
        lines: [...it.lines, { id: `${it.uid}_l${Date.now()}`, text: '', technology: 'none' as Technology }],
      })),
    }
    case 'FT_REMOVE_LINE': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it, lines: it.lines.filter(l => l.id !== action.lineId),
      })),
    }
    case 'FT_UPDATE_LINE': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it, lines: it.lines.map(l => l.id === action.lineId ? { ...l, text: action.text } : l),
      })),
    }
    case 'FT_UPDATE_LINE_TECH': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it, lines: it.lines.map(l => l.id === action.lineId ? { ...l, technology: action.technology } : l),
      })),
    }
    case 'FT_REORDER_LINES': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({ ...it, lines: action.lines })),
    }
    case 'FT_TOGGLE_LINE_CONTINGENCY': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it, lines: it.lines.map(l => l.id === action.lineId ? { ...l, isContingency: !l.isContingency } : l),
      })),
    }
    case 'FT_TOGGLE_LINE_PARALLEL': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it, lines: it.lines.map(l => l.id === action.lineId ? { ...l, isParallel: !l.isParallel } : l),
      })),
    }
    case 'FT_UPDATE_LINE_FIELDS': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => ({
        ...it, lines: it.lines.map(l => l.id === action.lineId ? { ...l, ...action.patch } : l),
      })),
    }
    case 'FT_INSERT_LINE_AFTER': return {
      ...state,
      fineTuningItems: updateFtItem(state.fineTuningItems, action.uid, it => {
        const newLine: FineTuningLine = { id: `${it.uid}_l${Date.now()}`, text: '', technology: 'none' }
        if (action.afterLineId === null) return { ...it, lines: [newLine, ...it.lines] }
        const idx = it.lines.findIndex(l => l.id === action.afterLineId)
        return {
          ...it,
          lines: [...it.lines.slice(0, idx + 1), newLine, ...it.lines.slice(idx + 1)],
        }
      }),
    }

    // ── Project data ──────────────────────────────────────────────────
    case 'PROJECT_UPDATE_DATA': {
      const newData = { ...state.projectData, ...action.patch }
      let ftItems = state.fineTuningItems

      const navFieldChanged = ['poco', 'pocoOrigem', 'distanciaEntrePocos', 'velocidadeMedia']
        .some(k => k in action.patch)
      if (navFieldChanged && ftItems.length > 0) {
        const dist  = parseFloat(newData.distanciaEntrePocos)
        const speed = parseFloat(newData.velocidadeMedia)
        const navDays = (!isNaN(dist) && !isNaN(speed) && dist > 0 && speed > 0)
          ? dist / speed / 24
          : undefined
        ftItems = ftItems.map(item => {
          if (!NAV_ALL_PACKAGE_IDS.has(item.packageId)) return item
          const newLines = applyNavToLines(item.lines, newData, navDays)
          const itemDuration = NAV_PACKAGE_IDS.has(item.packageId) && navDays !== undefined
            ? navDays
            : item.duration
          return { ...item, duration: itemDuration, lines: newLines }
        })
      }

      const dataFieldChanged = (DATA_SUB_FIELDS as string[]).some(k => k in action.patch)
      if (dataFieldChanged && ftItems.length > 0) {
        ftItems = ftItems.map(item => {
          if (!item.lines.some(l => l.dataTemplate)) return item
          return { ...item, lines: applyDataToLines(item.lines, item.uid, item.packageId, item.packageName, newData) }
        })
      }

      return { ...state, projectData: newData, fineTuningItems: ftItems }
    }
    case 'PROJECT_APPLY_SECTION': {
      const newData = { ...state.projectData, ...action.patch }
      const prevItems = state.fineTuningItems
      let ftItems = prevItems
      const navFieldChanged = ['poco', 'pocoOrigem', 'distanciaEntrePocos', 'velocidadeMedia']
        .some(k => k in action.patch)
      if (navFieldChanged && ftItems.length > 0) {
        const dist  = parseFloat(newData.distanciaEntrePocos)
        const speed = parseFloat(newData.velocidadeMedia)
        const navDays = (!isNaN(dist) && !isNaN(speed) && dist > 0 && speed > 0)
          ? dist / speed / 24
          : undefined
        ftItems = ftItems.map(item => {
          if (!NAV_ALL_PACKAGE_IDS.has(item.packageId)) return item
          const newLines = applyNavToLines(item.lines, newData, navDays)
          const itemDuration = NAV_PACKAGE_IDS.has(item.packageId) && navDays !== undefined
            ? navDays
            : item.duration
          return { ...item, duration: itemDuration, lines: newLines }
        })
      }
      const dataFieldChanged2 = (DATA_SUB_FIELDS as string[]).some(k => k in action.patch)
      if (dataFieldChanged2 && ftItems.length > 0) {
        ftItems = ftItems.map(item => {
          if (!item.lines.some(l => l.dataTemplate)) return item
          return { ...item, lines: applyDataToLines(item.lines, item.uid, item.packageId, item.packageName, newData) }
        })
      }

      // Compute review list from actual diff: only lines whose text or duration changed
      const prevLineMap = new Map<string, { text: string; duration: number | undefined }>()
      for (const item of prevItems)
        for (const l of item.lines) prevLineMap.set(l.id, { text: l.text, duration: l.duration })
      const changedLineIds: string[] = []
      for (const item of ftItems)
        for (const l of item.lines) {
          const prev = prevLineMap.get(l.id)
          if (prev && (l.text !== prev.text || l.duration !== prev.duration))
            changedLineIds.push(l.id)
        }
      // Guarda o estado anterior só quando há linhas em revisão (permite "Sair" cancelar)
      return {
        ...state, projectData: newData, fineTuningItems: ftItems, pendingReview: changedLineIds,
        reviewSnapshot: changedLineIds.length > 0
          ? { projectData: state.projectData, fineTuningItems: prevItems }
          : null,
      }
    }
    case 'PROJECT_CLEAR_REVIEW': return { ...state, pendingReview: [], reviewSnapshot: null }

    case 'PROJECT_REVERT_REVIEW': {
      if (!state.reviewSnapshot) return { ...state, pendingReview: [] }
      return {
        ...state,
        projectData: state.reviewSnapshot.projectData,
        fineTuningItems: state.reviewSnapshot.fineTuningItems,
        pendingReview: [],
        reviewSnapshot: null,
      }
    }

    case 'PROJECT_REVIEW_CONFIRM_ONE': {
      const pendingReview = state.pendingReview.filter(id => id !== action.uid)
      return { ...state, pendingReview, reviewSnapshot: pendingReview.length > 0 ? state.reviewSnapshot : null }
    }

    case 'PROJECT_UPDATE_FIELD': return {
      ...state,
      projectSections: updateField(state.projectSections, action.sectionId, action.fieldId, f => ({ ...f, value: action.value })),
    }
    case 'PROJECT_UPDATE_LABEL': return {
      ...state,
      projectSections: updateField(state.projectSections, action.sectionId, action.fieldId, f => ({ ...f, label: action.label })),
    }
    case 'PROJECT_TOGGLE_SECTION': return {
      ...state,
      projectSections: updateSection(state.projectSections, action.sectionId, s => ({ ...s, collapsed: !s.collapsed })),
    }
    case 'PROJECT_ADD_FIELD': return {
      ...state,
      projectSections: updateSection(state.projectSections, action.sectionId, s => ({
        ...s,
        fields: [...s.fields, { id: `field_${Date.now()}`, label: 'Novo campo', value: '' }],
      })),
    }
    case 'PROJECT_REMOVE_FIELD': return {
      ...state,
      projectSections: updateSection(state.projectSections, action.sectionId, s => ({
        ...s, fields: s.fields.filter(f => f.id !== action.fieldId),
      })),
    }
    case 'PROJECT_ADD_SECTION': return {
      ...state,
      projectSections: [
        ...state.projectSections,
        { id: `sec_${Date.now()}`, title: 'Nova seção', collapsed: false, fields: [] },
      ],
    }
    case 'PROJECT_REMOVE_SECTION': return {
      ...state, projectSections: state.projectSections.filter(s => s.id !== action.sectionId),
    }
    case 'PROJECT_UPDATE_SECTION_TITLE': return {
      ...state,
      projectSections: updateSection(state.projectSections, action.sectionId, s => ({ ...s, title: action.title })),
    }

    case 'FT_RESCALE_TIMES': {
      const { kind, targetDays } = action
      type Carrier = { uid: string; lineId?: string; dur: number }
      const carriers: Carrier[] = []

      for (const item of state.fineTuningItems) {
        if (item.isBlank || item.isParallel || NAV_PACKAGE_IDS.has(item.packageId)) continue
        const linesWithTime = item.lines.filter(l => (l.duration ?? 0) > 0)

        if (kind === 'firme') {
          if (item.isContingency) continue
          if (linesWithTime.length === 0) {
            if (item.duration > 0) carriers.push({ uid: item.uid, dur: item.duration })
          } else {
            for (const l of item.lines)
              if (!l.isContingency && !l.isParallel && (l.duration ?? 0) > 0)
                carriers.push({ uid: item.uid, lineId: l.id, dur: l.duration! })
          }
        } else {
          if (item.isContingency) {
            if (linesWithTime.length === 0) {
              if (item.duration > 0) carriers.push({ uid: item.uid, dur: item.duration })
            } else {
              for (const l of item.lines)
                if (!l.isParallel && (l.duration ?? 0) > 0)
                  carriers.push({ uid: item.uid, lineId: l.id, dur: l.duration! })
            }
          } else {
            for (const l of item.lines)
              if (l.isContingency && !l.isParallel && (l.duration ?? 0) > 0)
                carriers.push({ uid: item.uid, lineId: l.id, dur: l.duration! })
          }
        }
      }

      const totalDays = carriers.reduce((s, c) => s + c.dur, 0)
      if (totalDays === 0 || targetDays <= 0) return state
      const ratio = targetDays / totalDays

      const newItems = state.fineTuningItems.map(item => {
        const pkgCarriers = carriers.filter(c => c.uid === item.uid)
        if (pkgCarriers.length === 0) return item
        const pkgLevel  = pkgCarriers.find(c => !c.lineId)
        const lineLevel = pkgCarriers.filter(c => !!c.lineId)
        return {
          ...item,
          duration: pkgLevel ? pkgLevel.dur * ratio : item.duration,
          lines: lineLevel.length > 0
            ? item.lines.map(l => {
                const c = lineLevel.find(lc => lc.lineId === l.id)
                return c ? { ...l, duration: c.dur * ratio } : l
              })
            : item.lines,
        }
      })
      return { ...state, fineTuningItems: newItems }
    }

    case 'FT_RESTORE_TIMES': {
      const { kind } = action
      const newItems = state.fineTuningItems.map(item => {
        if (item.isBlank || NAV_PACKAGE_IDS.has(item.packageId)) return item
        const origDuration = state.schedule.find(s => s.uid === item.uid)?.duration ?? item.duration
        if (kind === 'firme') {
          if (item.isContingency) return item
          return {
            ...item,
            duration: origDuration,
            lines: item.lines.map(l => l.isContingency ? l : { ...l, duration: undefined }),
          }
        } else {
          if (item.isContingency) {
            return {
              ...item,
              duration: origDuration,
              lines: item.lines.map(l => ({ ...l, duration: undefined })),
            }
          }
          return {
            ...item,
            lines: item.lines.map(l => l.isContingency ? { ...l, duration: undefined } : l),
          }
        }
      })
      return { ...state, fineTuningItems: newItems }
    }

    case 'FT_REVIEW_ONTOLOGY':
      return { ...state, fineTuningItems: reviewItems(state.fineTuningItems) }

    case 'RESTORE_STATE': return { ...state, fineTuningItems: action.snapshot }

    default: return state
  }
}

const Ctx = createContext<{
  state: AppState
  dispatch: (action: Action) => void
  canUndo: boolean
  canRedo: boolean
} | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const historyRef = useRef<FineTuningItem[][]>([])
  const redoRef = useRef<FineTuningItem[][]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const appDispatch = (action: Action) => {
    if (action.type === 'UNDO') {
      const h = historyRef.current
      if (h.length === 0) return
      const prev = h[h.length - 1]
      historyRef.current = h.slice(0, -1)
      redoRef.current = [...redoRef.current.slice(-19), state.fineTuningItems]
      setCanUndo(historyRef.current.length > 0)
      setCanRedo(true)
      dispatch({ type: 'RESTORE_STATE', snapshot: prev })
      return
    }
    if (action.type === 'REDO') {
      const r = redoRef.current
      if (r.length === 0) return
      const next = r[r.length - 1]
      redoRef.current = r.slice(0, -1)
      historyRef.current = [...historyRef.current.slice(-19), state.fineTuningItems]
      setCanRedo(redoRef.current.length > 0)
      setCanUndo(true)
      dispatch({ type: 'RESTORE_STATE', snapshot: next })
      return
    }
    if (UNDOABLE_ACTIONS.has(action.type)) {
      historyRef.current = [...historyRef.current.slice(-19), state.fineTuningItems]
      redoRef.current = []  // nova edição invalida a pilha de refazer
      setCanUndo(true)
      setCanRedo(false)
    }
    dispatch(action)
  }

  return <Ctx.Provider value={{ state, dispatch: appDispatch, canUndo, canRedo }}>{children}</Ctx.Provider>
}

export function useApp() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx  // { state, dispatch, canUndo, canRedo }
}
