import type { ProjectData, BhaPlanFields } from '../types'
import PACKAGE_LINES from '../data/packageLines.json'

// diamEstampador/diamLocalizador NÃO são mais campos compartilhados via apelido — cada
// pacote relacionado tem seu próprio campo em BhaPlanFields (são medições de operações
// distintas, mesmo quando o mesmo item combina mais de uma seção do formulário).
// Usado por ProjectDataPanel (Field bindings) e nippleDepth (derivação da gabaritagem).
export const DIAM_ESTAMPADOR_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 036': 'diamEstampador036', 'ABAN 037': 'diamEstampador037', 'ABAN 058': 'diamEstampador058',
  'ABAN 059': 'diamEstampador059', 'ABAN 060': 'diamEstampador060', 'ABAN 079': 'diamEstampador079',
  'ABAN 098': 'diamEstampador098', 'ABAN 146': 'diamEstampador146', 'ABAN 194': 'diamEstampador194',
}
export const DIAM_LOCALIZADOR_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 036': 'diamLocalizador036', 'ABAN 037': 'diamLocalizador037', 'ABAN 058': 'diamLocalizador058',
  'ABAN 059': 'diamLocalizador059', 'ABAN 079': 'diamLocalizador079',
}
// Mesma lógica — campo dedicado por pacote em vez de apelido de chave-base compartilhada.
export const MOTOR_FUNDO_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 081': 'motorFundo081', 'ABAN 082': 'motorFundo082', 'ABAN 083': 'motorFundo083',
  'ABAN 084': 'motorFundo084', 'ABAN 124': 'motorFundo124', 'ABAN 232': 'motorFundo232',
}
export const BROCA_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 081': 'broca081', 'ABAN 082': 'broca082', 'ABAN 083': 'broca083',
  'ABAN 084': 'broca084', 'ABAN 124': 'broca124', 'ABAN 232': 'broca232',
}
export const MODELO_BROCA_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 081': 'modeloBroca081', 'ABAN 082': 'modeloBroca082', 'ABAN 083': 'modeloBroca083',
  'ABAN 084': 'modeloBroca084', 'ABAN 124': 'modeloBroca124',
}
export const OGIVA_DIAM_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 081': 'ogivaDiam081', 'ABAN 082': 'ogivaDiam082', 'ABAN 083': 'ogivaDiam083',
  'ABAN 084': 'ogivaDiam084', 'ABAN 157': 'ogivaDiam157',
}
export const INTERVALO_INTERESSE_TOPO_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 081': 'intervaloInteresseTopo081', 'ABAN 082': 'intervaloInteresseTopo082',
  'ABAN 083': 'intervaloInteresseTopo083', 'ABAN 084': 'intervaloInteresseTopo084',
  'ABAN 105': 'intervaloInteresseTopo105',
  'ABAN 106': 'intervaloInteresseTopo106', 'ABAN 107': 'intervaloInteresseTopo107',
}
export const INTERVALO_INTERESSE_BASE_FIELD: Record<string, keyof BhaPlanFields> = {
  'ABAN 081': 'intervaloInteresseBase081', 'ABAN 082': 'intervaloInteresseBase082',
  'ABAN 083': 'intervaloInteresseBase083', 'ABAN 084': 'intervaloInteresseBase084',
  'ABAN 105': 'intervaloInteresseBase105',
  'ABAN 106': 'intervaloInteresseBase106', 'ABAN 107': 'intervaloInteresseBase107',
}

// Campos globais de ProjectData (Etapa "Cimentação") também desdobrados por pacote —
// mesma razão: cada pacote relacionado mede algo distinto, mesmo repartindo um valor
// "genérico" hoje. Ordem dos objetos = ordem de exibição na UI.
export const CIMENT_ALINHAMENTO_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 078': 'cimentAlinhamento078', 'ABAN 083': 'cimentAlinhamento083', 'ABAN 084': 'cimentAlinhamento084',
}
export const CIMENT_PLUG_VOL_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 078': 'cimentPlugVol078', 'ABAN 079': 'cimentPlugVol079',
}
export const CIMENT_PLUG_DENS_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 078': 'cimentPlugDens078', 'ABAN 079': 'cimentPlugDens079',
}
export const CIMENT_FCBA_DENS_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 078': 'cimentFcbaDens078', 'ABAN 079': 'cimentFcbaDens079',
}
export const CR_DIAM_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 155': 'crDiam155', 'ABAN 156': 'crDiam156', 'ABAN 158': 'crDiam158',
}
export const CIMENT_ANULAR_ACIMA_TAMPAO_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 082': 'cimentAnularAcimaTampao082', 'ABAN 084': 'cimentAnularAcimaTampao084',
}
export const CIMENT_TOPO_REVCIM_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 247': 'cimentTopoRevcim247', 'ABAN 248': 'cimentTopoRevcim248',
}
export const TAMPAO_ABANDONO_DENS_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 199': 'tampaoAbandonoDens199', 'ABAN 200': 'tampaoAbandonoDens200',
}
export const TAMPAO_ABANDONO_TOPO_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 199': 'tampaoAbandonoTopo199', 'ABAN 200': 'tampaoAbandonoTopo200',
}
export const TAMPAO_ABANDONO_COMPR_FIELD: Record<string, keyof ProjectData> = {
  'ABAN 199': 'tampaoAbandonoCompr199', 'ABAN 200': 'tampaoAbandonoCompr200',
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens nomeados {{campo=glifo}}
//
// Os textos em packageLines.json carregam tokens auto-descritivos: `campo` nomeia
// a chave (ProjectData ou BhaPlanFields) que preenche o trecho; `glifo` é o texto
// exibido enquanto o campo está vazio (o placeholder original, ex.: "XXX"/"xxx";
// "?" em navegação). A substituição é uma única passada genérica.
//
// Adicionar um campo do assistente = (1) campo em ProjectData + default;
// (2) escrever `{{campo=XXX}}` no texto do packageLines.json; (3) <Field> na UI.
// Nenhuma lógica de substituição precisa mudar.
//
// Tokens especiais:
//   _bopBaixa            → "300" quando pressaoTesteAltaEquipSup preenchido (teste SL/WL/FT)
//   pressaoEst*          → fallback para pressaoProva (teste de estanqueidade pós-instalação)
//   _hpEst*              → "[HOLD POINT - SMAB] " quando flag de Hold Point ativo; "" caso contrário
// ─────────────────────────────────────────────────────────────────────────────

export interface RuleCtx {
  data: ProjectData
  plan: BhaPlanFields    // bhaPlans[uid] já resolvido pelo chamador (ou {})
  pkgId: string
  pkgName: string
}

// SL/WL/FT — teste "alta" de equipamentos de pressão. Consumido por ProjectDataPanel.
export const SLWLFT_HIGH_PKG_IDS: readonly string[] = (() => {
  const pad = (n: number) => `ABAN ${String(n).padStart(3, '0')}`
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => pad(a + i))
  return [
    'ABAN 031A','ABAN 031B','ABAN 032','ABAN 033', // teste BOP de arame + lubrificador
    ...range(36, 60),                               // montagem/teste de trens via QTS
    'ABAN 079',                                     // estampagem paralela via QTS
    ...range(81, 100),                              // perfilagem/CT — posicionar BHA via QTS
    'ABAN 119','ABAN 120','ABAN 121',               // BOP-FT / injetor (flexitubo)
    'ABAN 122','ABAN 123','ABAN 124','ABAN 125',    // acoplar injetor no BOP-FT / teste estanqueidade FT
    // montagem/teste de equipamento de superfície de FT (300 / prova / 5 min) + lubrificador (ABAN 249)
    'ABAN 126','ABAN 127','ABAN 128','ABAN 130','ABAN 131','ABAN 132','ABAN 133','ABAN 134',
    'ABAN 135','ABAN 136','ABAN 137','ABAN 138','ABAN 139','ABAN 140','ABAN 141','ABAN 142',
    'ABAN 143','ABAN 144','ABAN 145','ABAN 146','ABAN 147','ABAN 149','ABAN 151','ABAN 152',
    'ABAN 155','ABAN 156','ABAN 157','ABAN 158','ABAN 159','ABAN 162','ABAN 163','ABAN 164',
    'ABAN 232','ABAN 249',
    'ABAN 237','ABAN 238',                          // TAE / tampão bismuto via QTS
  ]
})()

// Chaves "base" de BhaPlanFields que aparecem como token (resolvem de ctx.plan, não
// data). Várias delas foram desdobradas em tokens por-pacote (ver PLAN_KEY_ALIASES
// logo abaixo) para poderem ter seção/subseção próprias na aba Place Holders — o
// PLAN_KEYS final inclui a chave base (ainda usada por pacotes não desdobrados,
// quando aplicável) e todo apelido.
const BASE_PLAN_KEYS = [
  'prof','taeProf','bpProf','modelo','bppAncoragemKlbf',
  'camDiamInt','camDiamNom',
  'aplicadorCamisao','camTipo','diamCacamba','tipoDesviador','diamJdc','modeloSlidingSleeve','profFinal',
  'vglTipo','vglCamisaoAcoplado',
  // Adicionados (Fase B): campos de BHA usados como token nas linhas
  'canhao','tfaMin','diam','tfa','driftRing','jateamTopo','jateamBase','jateamPassadas',
  'bpDiam','taeDiamNom',
  'pwcCanhoneioTopo','pwcCanhoneioBase',
  // Adicionados (associação de placeholders órfãos aos pacotes): campos com <Field>
  // na Etapa 3 mas que faltavam aqui, então nunca resolviam mesmo com token no texto.
  'tocEstampador','crProf','pwcIcf','pwcCanhaoRecuperado','condicBroca','condicRaspador',
  // diamEstampador/diamLocalizador/motorFundo/broca/modeloBroca/ogivaDiam/intervaloInteresseTopo/
  // intervaloInteresseBase — um campo dedicado por pacote (ver *_FIELD acima), não mais apelidos
  // de uma chave-base compartilhada.
  ...Object.values(DIAM_ESTAMPADOR_FIELD), ...Object.values(DIAM_LOCALIZADOR_FIELD),
  ...Object.values(MOTOR_FUNDO_FIELD), ...Object.values(BROCA_FIELD), ...Object.values(MODELO_BROCA_FIELD),
  ...Object.values(OGIVA_DIAM_FIELD),
  ...Object.values(INTERVALO_INTERESSE_TOPO_FIELD), ...Object.values(INTERVALO_INTERESSE_BASE_FIELD),
]

// Tokens que são "apelidos" de uma chave real de BhaPlanFields — resolvem/gravam no
// MESMO campo (ex.: todos os prefixados "prof..." abaixo leem ctx.plan.prof), só têm
// nome próprio no texto do pacote para permitir organização fina no admin (seção/
// subseção por operação) sem exigir uma chave nova em BhaPlanFields nem mudar a UI
// de preenchimento (ProjectDataPanel) — o admin edita normalmente, o texto é que
// referencia um nome de token diferente por pacote.
export const PLAN_KEY_ALIASES: Record<string, string> = {
  // Piloto original (Instalação/Retirada de STV/plug/BRV em nipple, Arame)
  profInstStvR275: 'prof', profInstStvF281: 'prof', profInstPlugR275: 'prof', profInstPlugF281: 'prof',
  profInstPlugTh375: 'prof', profInstBrvF281: 'prof', profInstBrvR275: 'prof',
  profRetStvR275: 'prof', profRetStvF281: 'prof', profRetPlugR275: 'prof', profRetPlugF281: 'prof',
  profRetPlugTh375: 'prof', profRetBrvF281: 'prof', profRetBrvR275: 'prof',
  // Demais pacotes que usavam "prof" genérico
  prof037: 'prof', prof045: 'prof', prof055: 'prof',
  prof056: 'prof', prof057: 'prof', prof058: 'prof', prof059: 'prof',
  prof060: 'prof', prof079: 'prof', prof081: 'prof', prof082: 'prof',
  prof083: 'prof', prof084: 'prof', prof097: 'prof', prof098: 'prof',
  prof100: 'prof', prof101: 'prof', prof102: 'prof', prof107: 'prof',
  prof108: 'prof', prof109: 'prof', prof136: 'prof', prof137: 'prof',
  prof138: 'prof', prof139: 'prof', prof140: 'prof', prof141: 'prof',
  prof142: 'prof', prof144: 'prof', prof145: 'prof', prof146: 'prof',
  prof147: 'prof', prof149: 'prof', prof151: 'prof', prof152: 'prof',
  prof153: 'prof', prof154: 'prof', prof155: 'prof', prof156: 'prof',
  prof157: 'prof', prof159: 'prof', prof160: 'prof', prof162: 'prof',
  prof163: 'prof', prof164: 'prof', prof194: 'prof', prof195: 'prof',
  prof198: 'prof', prof199: 'prof', prof200: 'prof', prof201: 'prof',
  prof202: 'prof', prof238: 'prof', prof249: 'prof', prof250: 'prof',
  // Demais chaves compartilhadas por-pacote
  canhao101: 'canhao', canhao102: 'canhao',
  canhao153: 'canhao', canhao154: 'canhao', canhao195: 'canhao',
  diamJdc034: 'diamJdc',
  diamJdc056: 'diamJdc', diamJdc057: 'diamJdc', diamJdc094: 'diamJdc', modeloSlidingSleeve058: 'modeloSlidingSleeve',
  modeloSlidingSleeve059: 'modeloSlidingSleeve', modeloSlidingSleeve144: 'modeloSlidingSleeve', modeloSlidingSleeve145: 'modeloSlidingSleeve', bpDiam108: 'bpDiam',
  bpDiam109: 'bpDiam', bpDiam198: 'bpDiam', bpDiam199: 'bpDiam', aplicadorCamisao037: 'aplicadorCamisao',
  aplicadorCamisao097: 'aplicadorCamisao', aplicadorCamisao134: 'aplicadorCamisao', modelo034: 'modelo', modelo042: 'modelo',
  bppAncoragemKlbf108: 'bppAncoragemKlbf', bppAncoragemKlbf109: 'bppAncoragemKlbf', tipoDesviador056: 'tipoDesviador', tipoDesviador057: 'tipoDesviador',
  taeProf237: 'taeProf', camDiamInt037: 'camDiamInt', diamCacamba046: 'diamCacamba',
  taeDiamNom237: 'taeDiamNom',
  crProf158: 'crProf',
  tocEstampador234: 'tocEstampador',
  // Perfuração (tubing puncher) — TFA mínimo e Ø do tubo associados ao ABAN 101
  tfaMin101: 'tfaMin', diam101: 'diam',
}

const PLAN_KEYS = new Set<string>([...BASE_PLAN_KEYS, ...Object.keys(PLAN_KEY_ALIASES)])

/** True se o token resolve/grava em bhaPlans[uid] (campo por-item de BHA); false ⇒ campo
 *  global de ProjectData. Usado pelo assistente orientado a dados para decidir o binding. */
export function isPlanKey(token: string): boolean {
  return PLAN_KEYS.has(token)
}
// Teste de estanqueidade pós-instalação: campo dedicado, com fallback p/ pressaoProva.
const PROOF_EST = new Set<string>([
  'pressaoEstStvR','pressaoEstStvF','pressaoEstPlugR','pressaoEstPlugF','pressaoEstTae','pressaoEstPlugTH',
])
// Tokens de prefixo Hold Point (sempre ativos — sem flag): resolvem sempre para o prefixo.
const ALWAYS_HP: Record<string, string> = {
  _hpEcsBop: '[HOLD POINT - ECS/BOP] ',
}
// Tokens de prefixo Hold Point (condicionais — governados por flag booleana em ProjectData):
// resolvem para prefix quando flag === true; "" caso contrário.
// Não contam como "não preenchidos" — ausência de HP é estado válido.
const HP_PREFIX_FLAG: Record<string, { flag: keyof import('../types').ProjectData; prefix: string }> = {
  _hpEstStvR275: { flag: 'pressaoEstStvRHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpEstStvF281: { flag: 'pressaoEstStvFHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpEstPlugR:  { flag: 'pressaoEstPlugRHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpEstPlugF:  { flag: 'pressaoEstPlugFHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpEstPlugTH: { flag: 'pressaoEstPlugTHHp', prefix: '[HOLD POINT - SMAB] ' },
  _hpEstTae:    { flag: 'pressaoEstTaeHp',    prefix: '[HOLD POINT - SMAB] ' },
  _hpPcabN2:    { flag: 'outrosPcabN2PsiHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpRevcim:    { flag: 'revcimHp',           prefix: '[HOLD POINT - REVCIM] ' },
  _hpRevcim105: { flag: 'revcimHp105',        prefix: '[HOLD POINT - REVCIM] ' },
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Resolve o valor de um token. '' (vazio) → o chamador usa o glifo de fallback. */
function resolveField(field: string, ctx: RuleCtx): string {
  if (field === '_bopBaixa') return ctx.data.pressaoTesteAltaEquipSup ? '300' : ''
  if (field in ALWAYS_HP) return ALWAYS_HP[field]!
  if (field in HP_PREFIX_FLAG) {
    const { flag, prefix } = HP_PREFIX_FLAG[field]!
    const val = (ctx.data as unknown as Record<string, unknown>)[flag]
    // val === true em produção (boolean); string não-vazia aceita a sonda de locate (LOCATE_PROBE)
    return (val === true || (typeof val === 'string' && val !== '')) ? prefix : ''
  }
  if (PROOF_EST.has(field)) return str((ctx.data as unknown as Record<string, unknown>)[field]) || str(ctx.data.pressaoProva)
  // Tipo de camisão: resposta padrão "permanente" quando não respondido.
  if (field === 'camTipo') return str((ctx.plan as Record<string, unknown>).camTipo) || 'permanente'
  if (PLAN_KEYS.has(field)) return str((ctx.plan as Record<string, unknown>)[PLAN_KEY_ALIASES[field] ?? field])
  return str((ctx.data as unknown as Record<string, unknown>)[field])
}

const TOKEN_RE = /\{\{(\w+)=([^}]*)\}\}/g

/** Substitui todos os tokens; campo vazio → glifo de fallback. */
export function fillTokens(template: string, ctx: RuleCtx): string {
  return template.replace(TOKEN_RE, (_m, field: string, glyph: string) => resolveField(field, ctx) || glyph)
}
// Alias de compatibilidade (mesma assinatura usada pelos wrappers do AppContext).
export const applyPlaceholders = fillTokens

/** A linha carrega algum token (logo, recebe template e participa da substituição). */
export function hasTokens(text: string | null | undefined): boolean {
  return typeof text === 'string' && text.includes('{{')
}

/** Algum token da linha está sem valor resolvido (linha incompleta). */
export function hasUnfilledTokens(text: string, ctx: RuleCtx): boolean {
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m[1] in ALWAYS_HP) continue       // prefixo sempre ativo, não conta como incompleto
    if (m[1] in HP_PREFIX_FLAG) continue  // ausência de HP é estado válido
    if (!resolveField(m[1], ctx)) return true
  }
  return false
}

/** Campos de ProjectData que, ao mudar, exigem re-substituição (derivado dos tokens
 *  presentes no packageLines.json). Exclui tokens sintéticos (prefixo _); inclui as
 *  flags de HP que os governam e 'bhaPlans' (gatilho dos campos de BHA por-item). */
export const DATA_SUB_FIELDS: (keyof ProjectData)[] = (() => {
  const found = new Set<string>()
  for (const pkg of Object.values(PACKAGE_LINES as unknown as Record<string, { text?: string }[]>)) {
    for (const ln of pkg) {
      const t = ln?.text
      if (!t) continue
      for (const m of t.matchAll(/\{\{(\w+)=/g)) {
        const f = m[1]
        // Tokens sintéticos (prefixo _) são resolvidos indiretamente; adicionar suas flags reais.
        if (f.startsWith('_')) continue
        if (!PLAN_KEYS.has(f)) found.add(f)
      }
    }
  }
  // Flags de Hold Point — governam os tokens _hpEst* e _hpRevcim
  for (const { flag } of Object.values(HP_PREFIX_FLAG)) found.add(flag as string)
  found.add('bhaPlans')
  return [...found] as (keyof ProjectData)[]
})()
