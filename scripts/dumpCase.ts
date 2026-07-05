// Uso: npx tsx scripts/dumpCase.ts <fixtureId> [--base] — engine × fluxo lado a lado.
// 'A' marca item auto-inserido (mount/dismount reconstruído); --base filtra os autos.
import fs from 'node:fs'
import { generateSchedule } from '../src/engines/sequenceEngine'
import { generateScheduleFromLogic } from '../src/engines/logicEngine'
import { LOGIC_BY_SCOPE } from '../src/data/logicSecs'
const id = process.argv[2] ?? 'base_FSU_TT_FT_DP_Generalista'
const BASE = process.argv.includes('--base')
const fixtures = JSON.parse(fs.readFileSync('../backend/tests/fixtures/sequence_engine.json', 'utf8'))
const fx = fixtures.find((f: any) => f.id === id)
if (!fx) { console.error('fixture não encontrada:', id); process.exit(1) }
const filt = (arr: any[]) => BASE ? arr.filter(it => !it.autoInserted) : arr
const eng = filt(generateSchedule(fx.inputs))
const flow = filt(generateScheduleFromLogic(fx.inputs, LOGIC_BY_SCOPE[fx.inputs.scopeId], false))
const fmt = (it: any) => it ? `${it.packageId} ${it.phase}${it.isContingency ? ' C' : ''}${it.autoInserted ? ' A' : ''}`.padEnd(32) : ''.padEnd(32)
console.log('ENGINE'.padEnd(32), 'FLUXO')
for (let i = 0; i < Math.max(eng.length, flow.length); i++) console.log(fmt(eng[i]), fmt(flow[i]))
