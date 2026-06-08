// Gera fixtures "golden" rodando o engine TS REAL (placeholders.ts) sobre casos
// representativos + os derivados de dados (SLWLFT_HIGH_PKG_IDS, DATA_SUB_FIELDS).
// Consumido por backend/tests/test_placeholders.py.
//
// Rodar (placeholders.ts importa packageLines.json → usar tsx/esbuild):
//   npx --yes tsx scripts/genPlaceholderFixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  fillTokens, hasTokens, hasUnfilledTokens, SLWLFT_HIGH_PKG_IDS, DATA_SUB_FIELDS,
} from '../src/engines/placeholders.ts'

type Ctx = { data: Record<string, unknown>; plan: Record<string, unknown>; pkgId: string; pkgName: string }
type Case = { id: string; template: string; data?: Record<string, unknown>; plan?: Record<string, unknown> }

const CASES: Case[] = [
  { id: 'data_filled', template: 'Pressão de {{pressaoProva=XXX}} psi', data: { pressaoProva: '2000' } },
  { id: 'data_empty_glyph', template: 'Pressão de {{pressaoProva=XXX}} psi', data: {} },
  { id: 'plan_filled', template: 'Profundidade {{prof=xxx}} m', plan: { prof: '3500' } },
  { id: 'plan_empty_glyph', template: 'Profundidade {{prof=xxx}} m', plan: {} },
  { id: 'bopbaixa_on', template: 'Teste baixa {{_bopBaixa=YYY}} psi', data: { pressaoBopArameHigh: '5000' } },
  { id: 'bopbaixa_off', template: 'Teste baixa {{_bopBaixa=YYY}} psi', data: {} },
  { id: 'always_hp', template: '{{_hpEcsBop=}}Operação crítica' },
  { id: 'hp_flag_true', template: '{{_hpEstStvR=}}Teste STV', data: { pressaoEstStvRHp: true } },
  { id: 'hp_flag_false', template: '{{_hpEstStvR=}}Teste STV', data: { pressaoEstStvRHp: false } },
  { id: 'proof_own_value', template: 'Estanqueidade {{pressaoEstPlugR=XXX}} psi', data: { pressaoEstPlugR: '1500' } },
  { id: 'proof_fallback', template: 'Estanqueidade {{pressaoEstPlugR=XXX}} psi', data: { pressaoProva: '2500' } },
  { id: 'proof_both_empty', template: 'Estanqueidade {{pressaoEstPlugR=XXX}} psi', data: {} },
  { id: 'camtipo_plan', template: 'Camisão {{camTipo=tipo}}', plan: { camTipo: 'drop-off' } },
  { id: 'camtipo_default', template: 'Camisão {{camTipo=tipo}}', plan: {} },
  { id: 'multi_tokens', template: '{{_hpRevcim=}}Avaliar de {{intervaloInteresseTopo=T}} a {{intervaloInteresseBase=B}} m com {{pressaoProva=PPP}} psi',
    data: { revcimHp: true, pressaoProva: '3000' }, plan: { intervaloInteresseTopo: '1000' } },
  { id: 'nav_glyph', template: 'Navegar de {{pocoOrigem=?}} para {{poco=?}}', data: { pocoOrigem: 'POCO-A', poco: 'POCO-B' } },
  { id: 'empty_glyph', template: 'X{{pressaoProva=}}Y', data: {} },
  { id: 'no_tokens', template: 'Texto simples sem token' },
]

const cases = CASES.map(c => {
  const ctx: Ctx = { data: c.data ?? {}, plan: c.plan ?? {}, pkgId: '', pkgName: '' }
  return {
    id: c.id,
    template: c.template,
    data: c.data ?? {},
    plan: c.plan ?? {},
    fill: fillTokens(c.template, ctx as never),
    hasTok: hasTokens(c.template),
    unfilled: hasUnfilledTokens(c.template, ctx as never),
  }
})

const fixtures = {
  cases,
  slwlftHighPkgIds: SLWLFT_HIGH_PKG_IDS,
  dataSubFields: DATA_SUB_FIELDS,
}

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../backend/tests/fixtures')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'placeholders.json')
writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf-8')
console.log(`Geradas ${cases.length} fixtures + ${SLWLFT_HIGH_PKG_IDS.length} ids + ${DATA_SUB_FIELDS.length} campos → ${outPath}`)
