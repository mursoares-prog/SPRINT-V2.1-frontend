// Gera fixtures "golden" rodando o engine TS REAL (nippleDepth.ts) sobre um
// conjunto de casos representativos. A saída é consumida pelo teste de paridade
// em backend/tests/test_nipple_depth.py, que confere a porta Python contra ela.
//
// Rodar (Node 23+ faz type-stripping nativo):
//   node scripts/genNippleFixtures.ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  nippleDepthForBha, camisaoDhsvFields, gabaritoFields, bhaDerivedDepth,
} from '../src/engines/nippleDepth.ts'

const DEFAULT_NIPPLES = {
  nipple381: '', nipple381Depth: '',
  nipple375: '', nipple375Depth: '',
  nipple281: '', nipple281Depth: '',
  nippleTHanular: '', nippleTHanularDepth: '',
  nippleDhsv: '', nippleDhsvDepth: '',
  nipple275: '', nipple275Depth: '',
  nipplesOutros: '', nipplesOutrosDepth: '',
}

type Case = {
  id: string
  fn: 'nippleDepthForBha' | 'camisaoDhsvFields' | 'gabaritoFields' | 'bhaDerivedDepth'
  name: string
  technology?: string
  data: Record<string, string>
}

const CASES: Case[] = [
  // ── nippleDepthForBha: tamanho explícito no nome ──────────────────────────
  { id: 'size_match_outros_2_75', fn: 'nippleDepthForBha',
    name: 'Instalação de STV em nipple R 2,75"',
    data: { nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '3500' } },
  { id: 'size_match_skip_empty_depth', fn: 'nippleDepthForBha',
    name: 'Instalação de STV em nipple R 2,75"',
    data: { nipple275: 'Nipple F 2,75"', nipple275Depth: '', nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '3500' } },
  { id: 'size_match_no_depth_null', fn: 'nippleDepthForBha',
    name: 'Instalação de STV em nipple R 2,75"',
    data: { nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '' } },
  { id: 'size_match_plug_th_3_75', fn: 'nippleDepthForBha',
    name: 'Retirada de plug 3,75" no TH',
    data: { nipple281: 'Nipple F ou DB 3,75"', nipple281Depth: '2810' } },
  { id: 'size_match_dot_separator', fn: 'nippleDepthForBha',
    name: 'Instalação de plug em nipple F 3,81"',
    data: { nipple381: 'Nipple F 3.81"', nipple381Depth: '3810' } },
  // ── nippleDepthForBha: por LOCAL (TMF/TH) ─────────────────────────────────
  { id: 'tmf_anular', fn: 'nippleDepthForBha',
    name: 'Instalação de plug TMF anular',
    data: { nipple375: '', nipple375Depth: '2000' } },
  { id: 'tmf_producao', fn: 'nippleDepthForBha',
    name: 'Instalação de plug TMF produção',
    data: { nipple381: '', nipple381Depth: '1900' } },
  { id: 'th_anular', fn: 'nippleDepthForBha',
    name: 'Plug no TH anular',
    data: { nippleTHanular: '', nippleTHanularDepth: '2100' } },
  { id: 'th_producao', fn: 'nippleDepthForBha',
    name: 'Instalação de plug no TH',
    data: { nipple281: '', nipple281Depth: '2200' } },
  { id: 'th_na_null', fn: 'nippleDepthForBha',
    name: 'Instalação de plug no TH',
    data: { nipple281: 'Não Aplicável', nipple281Depth: '2200' } },
  // ── nippleDepthForBha: camisão / nenhum ───────────────────────────────────
  { id: 'camisao_dhsv', fn: 'nippleDepthForBha',
    name: 'Instalação de camisão',
    data: { nippleDhsv: 'Perfil DB 3,68" (DHSV)', nippleDhsvDepth: '1500' } },
  { id: 'no_match', fn: 'nippleDepthForBha',
    name: 'Mobilização de sonda',
    data: {} },

  // ── camisaoDhsvFields ─────────────────────────────────────────────────────
  { id: 'cam_fields_gs4', fn: 'camisaoDhsvFields',
    name: 'Instalação de camisão',
    data: { nippleDhsv: 'Perfil DB 3,68" (DHSV)', nippleDhsvDepth: '1500' } },
  { id: 'cam_fields_gs5', fn: 'camisaoDhsvFields',
    name: 'Retirada de camisão',
    data: { nippleDhsv: 'Perfil 5,00"' } },
  { id: 'cam_fields_not_camisao', fn: 'camisaoDhsvFields',
    name: 'Instalação de plug', data: { nippleDhsv: 'Perfil DB 3,68"' } },
  { id: 'cam_fields_na', fn: 'camisaoDhsvFields',
    name: 'Instalação de camisão', data: { nippleDhsv: 'Não Aplicável' } },

  // ── gabaritoFields ────────────────────────────────────────────────────────
  { id: 'gab_combo_275_281', fn: 'gabaritoFields',
    name: 'Gabaritagem da cauda',
    data: { nipple275: 'Nipple F 2,75"', nipple275Depth: '2750', nipplesOutros: 'Nipple R 2,81"', nipplesOutrosDepth: '2810' } },
  { id: 'gab_combo_350_356', fn: 'gabaritoFields',
    name: 'Gabaritagem da cauda',
    data: { nipple275: 'Nipple 3,50"', nipple275Depth: '3500', nipplesOutros: 'Nipple 3,56"', nipplesOutrosDepth: '3560' } },
  { id: 'gab_no_combo_only_prof', fn: 'gabaritoFields',
    name: 'Gabaritagem da cauda',
    data: { nipple275: 'Nipple 4,00"', nipple275Depth: '4000', nipplesOutros: 'Nipple 5,00"', nipplesOutrosDepth: '5000' } },
  { id: 'gab_not_gabarito', fn: 'gabaritoFields',
    name: 'Instalação de plug', data: { nipple275: 'Nipple F 2,75"', nipple275Depth: '2750' } },

  // ── bhaDerivedDepth: gating por tecnologia ────────────────────────────────
  { id: 'bha_wireline_instala', fn: 'bhaDerivedDepth', technology: 'wireline',
    name: 'Instalação de STV em nipple R 2,75"',
    data: { nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '3500' } },
  { id: 'bha_wireline_no_action', fn: 'bhaDerivedDepth', technology: 'wireline',
    name: 'Gabaritagem da cauda',
    data: { nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '3500' } },
  { id: 'bha_electric_stroker', fn: 'bhaDerivedDepth', technology: 'electric',
    name: 'Stroker para plug 3,75" no TH',
    data: { nipple281: 'Nipple F ou DB 3,75"', nipple281Depth: '2810' } },
  { id: 'bha_ct_plug_instala', fn: 'bhaDerivedDepth', technology: 'ct',
    name: 'Instalação de plug em nipple R 2,75" com FT',
    data: { nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '3500' } },
  { id: 'bha_ct_plug_no_action', fn: 'bhaDerivedDepth', technology: 'ct',
    name: 'Gabaritagem com plug', data: { nipplesOutros: 'Nipple R 2,75"', nipplesOutrosDepth: '3500' } },
]

function run(c: Case): unknown {
  const data = { ...DEFAULT_NIPPLES, ...c.data } as any
  switch (c.fn) {
    case 'nippleDepthForBha': return nippleDepthForBha(c.name, data)
    case 'camisaoDhsvFields': return camisaoDhsvFields({ packageName: c.name }, data)
    case 'gabaritoFields': return gabaritoFields({ packageName: c.name }, data)
    case 'bhaDerivedDepth': return bhaDerivedDepth({ packageName: c.name, technology: c.technology ?? 'none' }, data)
  }
}

const fixtures = CASES.map(c => ({
  id: c.id, fn: c.fn, name: c.name, technology: c.technology ?? null,
  data: c.data,
  expected: run(c) ?? null,
}))

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../backend/tests/fixtures')
mkdirSync(outDir, { recursive: true })
const outPath = resolve(outDir, 'nipple_depth.json')
writeFileSync(outPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf-8')
console.log(`Geradas ${fixtures.length} fixtures → ${outPath}`)
