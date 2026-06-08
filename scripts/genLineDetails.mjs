// Gera src/data/packageLineDetails.json diretamente do .xlsx fonte.
// Aba "Planejamento": A=Pacote, B=Operação(Genesis), C=Recomendações, D=Padrões.
//   Recomendações (C) → details ("Detalhes")
//   Padrões      (D) → procedures ("Referências Técnicas (Procedimentos e Normas)")
// Linhas agrupadas por pacote (col A) na ordem da planilha; alinhamento POSICIONAL
// com packageLines.json (índice N ↔ linha N). Valida contagem por pacote e aborta
// em divergência (protege contra desalinhamento silencioso).
//
// Uso: node scripts/genLineDetails.mjs "<caminho do .xlsx>"
//   (default: C:\Users\murso\Downloads\Todos os pacotes, com procedimentos e recomendações (limpo).xlsx)

import { readZipEntry, parseSharedStrings, parseSheet } from './xlsxLib.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_LINES_PATH = resolve(__dirname, '../src/data/packageLines.json')
const OUT_PATH = resolve(__dirname, '../src/data/packageLineDetails.json')
const DEFAULT_XLSX = 'C:/Users/murso/Downloads/Todos os pacotes, com procedimentos e recomendações (limpo).xlsx'

const xlsxPath = process.argv[2] || DEFAULT_XLSX

function normalizePkgId(label) {
  const m = (label ?? '').match(/ABAN\s*(\d+)\s*([A-Za-z])?/i)
  if (!m) return null
  return `ABAN ${m[1].padStart(3, '0')}${m[2] ? m[2].toUpperCase() : ''}`
}

const pkgLines = JSON.parse(readFileSync(PKG_LINES_PATH, 'utf8'))
const shared = parseSharedStrings(readZipEntry(xlsxPath, 'xl/sharedStrings.xml'))
const rows = parseSheet(readZipEntry(xlsxPath, 'xl/worksheets/sheet1.xml'), shared)

// localiza colunas pelo cabeçalho (linha 1)
const header = rows.find(r => r.r === 1)?.cells ?? {}
const colOf = name => Object.entries(header).find(([, v]) => String(v).trim().toLowerCase() === name)?.[0]
const colPkg = colOf('pacote') ?? 'A'
const colRec = colOf('recomendações') ?? 'C'
const colPad = colOf('padrões') ?? 'D'

// Pacotes cujo detalhamento é mantido À MÃO porque o xlsx está dessincronizado do
// packageLines.json (versão antiga/expandida na planilha). O gerador os IGNORA e a
// lógica de preservação (abaixo) mantém as entradas curadas no JSON.
const MANUAL_PINNED = new Set(['ABAN 012', 'ABAN 015'])

const grouped = {}   // pkgId -> [{rec,pad}]
for (const row of rows) {
  if (row.r === 1) continue
  const label = row.cells[colPkg]
  const pkgId = normalizePkgId(label)
  if (!pkgId) continue   // linha sem pacote (vazia)
  if (MANUAL_PINNED.has(pkgId)) continue   // detalhamento manual — preservado, não vem do xlsx
  const rec = (row.cells[colRec] ?? '').trim()
  const pad = (row.cells[colPad] ?? '').trim()
  ;(grouped[pkgId] ??= []).push({ rec, pad })
}

// Validação + reconciliação de alinhamento.
// Divergências aceitas (com aviso), pois o xlsx é a fonte das recomendações e o
// packageLines.json pode ter pequenas diferenças estruturais conhecidas:
//   • xlsx = N×want com blocos IDÊNTICOS  → variantes colapsadas (ex.: ABAN 127 "1"/"2")
//   • xlsx < want                         → linhas finais (contingências) sem recomendação → pad vazio
// Qualquer outra divergência ABORTA para inspeção manual.
const errors = []
const warnings = []
const reconciled = {}
for (const pkgId of Object.keys(grouped)) {
  if (!pkgLines[pkgId]) { errors.push(`Pacote "${pkgId}" no xlsx não existe em packageLines.json`); continue }
  const want = pkgLines[pkgId].length
  let arr = grouped[pkgId]
  if (arr.length === want) {
    // ok
  } else if (arr.length > want && arr.length % want === 0) {
    const blocks = []
    for (let i = 0; i < arr.length; i += want) blocks.push(arr.slice(i, i + want))
    const same = blocks.every(b => JSON.stringify(b) === JSON.stringify(blocks[0]))
    if (!same) { errors.push(`"${pkgId}": ${arr.length} linhas no xlsx, esperado ${want} (blocos NÃO idênticos)`); continue }
    warnings.push(`${pkgId}: ${arr.length} linhas (${blocks.length} blocos idênticos) → colapsado para ${want}`)
    arr = blocks[0]
  } else if (arr.length < want) {
    const padN = want - arr.length
    warnings.push(`${pkgId}: ${arr.length} no xlsx vs ${want} no packageLines → ${padN} linha(s) final(is) sem detalhamento`)
    arr = [...arr, ...Array.from({ length: padN }, () => ({ rec: '', pad: '' }))]
  } else {
    errors.push(`"${pkgId}": ${arr.length} linhas no xlsx, esperado ${want}`); continue
  }
  reconciled[pkgId] = arr
}
const missing = Object.keys(pkgLines).filter(k => !grouped[k] && !MANUAL_PINNED.has(k))
if (errors.length) {
  console.error('FALHA DE VALIDAÇÃO — geração abortada:\n' + errors.map(e => '  • ' + e).join('\n'))
  process.exit(1)
}
if (warnings.length) console.warn('Reconciliações aplicadas:\n' + warnings.map(w => '  • ' + w).join('\n'))
if (missing.length) console.warn(`Aviso: ${missing.length} pacotes sem linhas no xlsx (sem detalhamento): ${missing.join(', ')}`)

// Saída: array por pacote, alinhado por índice; entrada vazia => null
const out = {}
for (const pkgId of Object.keys(reconciled)) {
  const arr = reconciled[pkgId].map(({ rec, pad }) => (rec || pad) ? { rec, pad } : null)
  if (arr.some(Boolean)) out[pkgId] = arr
}

// Preserva o detalhamento curado à mão de pacotes que NÃO estão no xlsx mas existem
// em packageLines.json (ex.: ids "NOVO", que normalizePkgId não reconhece). Sem isto,
// a regeneração (overwrite total) apagaria esse detalhamento. Só preserva se o nº de
// linhas ainda casar com packageLines.json (protege contra entradas desalinhadas).
const preserved = []
try {
  const existing = JSON.parse(readFileSync(OUT_PATH, 'utf8'))
  for (const k of Object.keys(existing)) {
    if (grouped[k] || !pkgLines[k]) continue   // veio do xlsx, ou pacote inexistente
    if (existing[k].length !== pkgLines[k].length) {
      console.warn(`Aviso: detalhamento manual de "${k}" NÃO preservado (${existing[k].length} ≠ ${pkgLines[k].length} linhas)`)
      continue
    }
    out[k] = existing[k]
    preserved.push(k)
  }
} catch { /* OUT_PATH ainda não existe — primeira geração */ }
if (preserved.length) console.warn(`Detalhamento manual preservado (fora do xlsx): ${preserved.join(', ')}`)

// Ordena por número do pacote (depois alfabético); NOVO/ABAN intercalam pelo número.
const sortedOut = {}
for (const pkgId of Object.keys(out).sort((a, b) => {
  const na = parseInt(a.match(/\d+/)?.[0] ?? '0', 10), nb = parseInt(b.match(/\d+/)?.[0] ?? '0', 10)
  return na - nb || a.localeCompare(b)
})) sortedOut[pkgId] = out[pkgId]

writeFileSync(OUT_PATH, JSON.stringify(sortedOut, null, 2) + '\n', 'utf8')
const recN = Object.values(sortedOut).reduce((s, a) => s + a.filter(x => x && x.rec).length, 0)
const padN = Object.values(sortedOut).reduce((s, a) => s + a.filter(x => x && x.pad).length, 0)
console.log(`OK: ${Object.keys(sortedOut).length} pacotes; ${recN} linhas c/ Recomendações, ${padN} c/ Padrões → ${OUT_PATH}`)
