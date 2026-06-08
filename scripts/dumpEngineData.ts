// Exporta os dados que o sequenceEngine consome (SEQUENCES, PACKAGES, PACKAGE_DURATIONS)
// para JSON, de modo que o port Python leia EXATAMENTE os mesmos dados — sem retradução
// manual. Rodar quando os dados mudarem:
//   node scripts/dumpEngineData.ts
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { SEQUENCES } from '../src/data/sequences.ts'
import { PACKAGES, PACKAGE_DURATIONS } from '../src/data/packages.ts'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../../backend/app/data')
mkdirSync(outDir, { recursive: true })

const write = (name: string, data: unknown) => {
  const p = resolve(outDir, name)
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf-8')
  return p
}

write('sequences.json', SEQUENCES)
write('packages.json', PACKAGES)
write('package_durations.json', PACKAGE_DURATIONS)

// packageLines.json (fonte das linhas; tem BOM) → copia limpa para o backend.
const plRaw = readFileSync(resolve(here, '../src/data/packageLines.json'), 'utf-8').replace(/^﻿/, '')
const packageLines = JSON.parse(plRaw)
write('package_lines.json', packageLines)

// changeLog.json (histórico; tem BOM) → copia para o backend seedar sem depender do front.
const clRaw = readFileSync(resolve(here, '../src/data/changeLog.json'), 'utf-8').replace(/^﻿/, '')
const changeLog = JSON.parse(clRaw)
write('change_log.json', changeLog)

console.log(`Dump OK: ${Object.keys(SEQUENCES).length} escopos, ${Object.keys(PACKAGES).length} pacotes, ${Object.keys(PACKAGE_DURATIONS).length} durações, ${Object.keys(packageLines).length} pacotes-linhas, ${changeLog.length} entradas de log → ${outDir}`)
