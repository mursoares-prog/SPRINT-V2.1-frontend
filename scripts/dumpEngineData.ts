// Exporta os dados que o sequenceEngine consome (SEQUENCES, PACKAGES, PACKAGE_DURATIONS)
// para JSON, de modo que o port Python leia EXATAMENTE os mesmos dados — sem retradução
// manual. Rodar quando os dados mudarem:
//   node scripts/dumpEngineData.ts
import { writeFileSync, mkdirSync } from 'node:fs'
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
console.log(`Dump OK: ${Object.keys(SEQUENCES).length} escopos, ${Object.keys(PACKAGES).length} pacotes, ${Object.keys(PACKAGE_DURATIONS).length} durações → ${outDir}`)
