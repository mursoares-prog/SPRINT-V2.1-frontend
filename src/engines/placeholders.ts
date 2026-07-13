import type { ProjectData, BhaPlanFields } from '../types'
import PACKAGE_LINES from '../data/packageLines.json'

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
//   _bopBaixa            → "300" quando pressaoBopArameHigh preenchido (teste SL/WL/FT)
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
    'ABAN 237','ABAN 238',                          // TAE / tampão bismuto via QTS
  ]
})()

// Chaves de BhaPlanFields que aparecem como token (resolvem de ctx.plan, não data).
const PLAN_KEYS = new Set<string>([
  'prof','taeProf','bpProf','modelo','bppAncoragemKlbf','intervaloInteresseTopo',
  'intervaloInteresseBase','broca','diamLocalizador','diamEstampador','camDiamInt','camDiamNom',
  'aplicadorCamisao','camTipo','diamCacamba','tipoDesviador','diamJdc','modeloSlidingSleeve','profFinal',
  // Adicionados (Fase B): campos de BHA usados como token nas linhas
  'canhao','tfaMin','diam','tfa','driftRing','jateamTopo','jateamBase','jateamPassadas',
  'motorFundo','modeloBroca',
  'bpDiam','taeDiamNom',
  'pwcCanhoneioTopo','pwcCanhoneioBase',
])
// Teste de estanqueidade pós-instalação: campo dedicado, com fallback p/ pressaoProva.
const PROOF_EST = new Set<string>([
  'pressaoEstStvR','pressaoEstPlugR','pressaoEstPlugF','pressaoEstTae','pressaoEstPlugTH',
])
// Tokens de prefixo Hold Point (sempre ativos — sem flag): resolvem sempre para o prefixo.
const ALWAYS_HP: Record<string, string> = {
  _hpEcsBop: '[HOLD POINT - ECS/BOP] ',
}
// Tokens de prefixo Hold Point (condicionais — governados por flag booleana em ProjectData):
// resolvem para prefix quando flag === true; "" caso contrário.
// Não contam como "não preenchidos" — ausência de HP é estado válido.
const HP_PREFIX_FLAG: Record<string, { flag: keyof import('../types').ProjectData; prefix: string }> = {
  _hpEstStvR:   { flag: 'pressaoEstStvRHp',   prefix: '[HOLD POINT - SMAB] ' },
  _hpEstPlugR:  { flag: 'pressaoEstPlugRHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpEstPlugF:  { flag: 'pressaoEstPlugFHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpEstPlugTH: { flag: 'pressaoEstPlugTHHp', prefix: '[HOLD POINT - SMAB] ' },
  _hpEstTae:    { flag: 'pressaoEstTaeHp',    prefix: '[HOLD POINT - SMAB] ' },
  _hpPcabN2:    { flag: 'outrosPcabN2PsiHp',  prefix: '[HOLD POINT - SMAB] ' },
  _hpRevcim:    { flag: 'revcimHp',           prefix: '[HOLD POINT - REVCIM] ' },
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** Resolve o valor de um token. '' (vazio) → o chamador usa o glifo de fallback. */
function resolveField(field: string, ctx: RuleCtx): string {
  if (field === '_bopBaixa') return ctx.data.pressaoBopArameHigh ? '300' : ''
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
  if (PLAN_KEYS.has(field)) return str((ctx.plan as Record<string, unknown>)[field])
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
