// Codemod (uso único): reescreve packageLines.json trocando placeholders por
// tokens {{campo=glifo}}. Ordem ESPECÍFICO-PRIMEIRO; o teste genérico "com XXX psi"
// (proof) por último → corrige o sombreamento do pressaoProva.
//
// O glifo é o texto original do placeholder (preserva o estado vazio byte-idêntico
// para data/outros). Linhas de navegação usam o tokenizador posicional (glifo '?',
// como o app renderiza nav vazio hoje).
//
// Gera packageLines.tokenized.json (NÃO sobrescreve o original) p/ verificação.
import fs from 'node:fs'

const DIR = new URL('../src/data/', import.meta.url)
const SRC = new URL('packageLines.json', DIR)
const OUT = new URL('packageLines.tokenized.json', DIR)

const pkgNames = (() => {
  const src = fs.readFileSync(new URL('packages.ts', DIR), 'utf8')
  const map = {}
  const re = /'([^']+)':\s*\{\s*id:\s*'[^']+',\s*name:\s*'(.*?)',\s*category/g
  let m; while ((m = re.exec(src))) map[m[1]] = m[2]
  return map
})()

// ── escopos ──────────────────────────────────────────────────────────────────
const set = (...a) => new Set(a)
const SLWLFT = (() => {
  const pad = n => `ABAN ${String(n).padStart(3,'0')}`
  const range = (a,b) => Array.from({length:b-a+1},(_,i)=>pad(a+i))
  return new Set(['ABAN 031A','ABAN 031B','ABAN 032','ABAN 033',...range(36,60),'ABAN 079',...range(81,100),'ABAN 119','ABAN 120','ABAN 121','ABAN 237','ABAN 238'])
})()
const PROOF_FIELD = { 'ABAN 038':'pressaoEstStvR','ABAN 040':'pressaoEstPlugR','ABAN 041':'pressaoEstPlugF','ABAN 237':'pressaoEstTae','ABAN 042':'pressaoEstPlugTH' }
const inScope = (scope, id) => scope === true ? true : scope instanceof Set ? scope.has(id) : scope instanceof RegExp ? scope.test(id) : false

const NAV_PKGS = new Set(['ABAN 003','ABAN 004','ABAN 005','ABAN 208'])
const NAV_ETAPAS = new Set(['Navegando','Navegando com BOP/Ferramenta no fundo'])
const NAV_PREP = new Set(['Preparando para navegar'])
const hasNavPh = t => /XXX|XXXX|xx NM|XX NM/i.test(t)

// helper de wrap: re com grupos (pre, glyph, post) → pre + {{field=glyph}} + post
const TK = (field, glyph) => `{{${field}=${glyph}}}`
function wrap(text, re, fieldFn) {
  return text.replace(re, (...args) => {
    const groups = args.slice(1, -2)        // grupos capturados
    const [pre, glyph, post] = groups
    const field = typeof fieldFn === 'function' ? fieldFn(glyph, groups) : fieldFn
    return `${pre}${TK(field, glyph)}${post ?? ''}`
  })
}

const depthField = name =>
  /\btae\b|tampão de alta expansão/i.test(name) ? 'taeProf'
  : /instala.*(bpr|bpp)/i.test(name) ? 'bpProf'
  : 'prof'

// ── tabela de posse (ordem importa; proof por ÚLTIMO) ─────────────────────────
// Cada entrada: { scope, guard?, run(text, pkgId, pkgName) -> text }
const RULES = [
  // BHA depth
  { scope:true, run:(t,id,nm)=>{ t=wrap(t,/(@\s*)(x{2,4})(\s+m\b)/gi, ()=>depthField(nm)); return wrap(t,/(até\s+)(x{2,4})(\s+m\b)/gi, ()=>depthField(nm)) } },
  // fishing model
  { scope:true, run:t=>wrap(t,/(pescador\s+)(XXX)(\b)/g,'modelo') },
  // BPP anchor
  { scope:set('ABAN 109'), run:t=>wrap(t,/(\b)(xxx)(\s+klbf\b)/gi,'bppAncoragemKlbf') },
  // cement interval (dois campos)
  { scope:true, run:t=>t.replace(/\b(XXX)(\s+a\s+)(XXX)(\s+m)\b/g,(_,g1,sep,g2,post)=>`${TK('intervaloInteresseTopo',g1)}${sep}${TK('intervaloInteresseBase',g2)}${post}`) },
  // broca
  { scope:true, run:t=>wrap(t,/(\bBroca\s+)(XXX)(")/gi,'broca') },
  // SL/WL/FT alta (+ baixa). Espelha o regex legado: lo = dígitos (literal, mantém)
  // OU placeholder x{2,4} (vira {{_bopBaixa}} → '300' quando alta preenchida).
  { scope:SLWLFT, run:t=>{
      t = t.replace(/(\d{2,4}|x{2,4})(\s*\/\s*)(x{2,4})(\s*psi)/gi,(_,lo,sep,hi,psi)=>{
        const loOut = /^x+$/i.test(lo) ? TK('_bopBaixa', lo) : lo
        return `${loOut}${sep}${TK('pressaoBopArameHigh', hi)}${psi}`
      })
      // alta "x psi / 10 min" (baixa já literal "300 psi / 5 min")
      t = t.replace(/\b(x{2,4})(\s*psi\s*\/\s*10\s*min)/gi,(_,hi,tail)=>`${TK('pressaoBopArameHigh', hi)}${tail}`)
      return t
  } },
  // cavidade FIBOP (apenas linhas com "cavidade")
  { scope:/^ABAN (011|012|211|212)$/, guard:/cavidade/i, run:t=>wrap(t,/()(XXXX)(\s+psi)/g,'pressaoCavFibop') },
  // HCR (linhas com HCR)
  { scope:/^ABAN (011|211|212)$/, guard:/\bHCR\b/, run:t=>wrap(t,/()(XXXX)(\s+psi)/g,'pressaoHcr') },
  // Riser DB descida (ABAN 012)
  { scope:set('ABAN 012'), run:t=>{
      t=wrap(t,/(cavidade de cada conex[ãa]o com\s+)(x{2,4})(\s+psi)/gi,'pressaoRiserCavConexao')
      return wrap(t,/(bores? 4" e 2"[^.]*?com\s+)(x{2,4})(\s+psi)/gi,'pressaoRiserBores')
  } },
  // bore test
  { scope:/^ABAN (013|206)$/, run:t=>wrap(t,/()(XXX)(\s+psi)/gi,'pressaoBoreTest') },
  // riser DPR
  { scope:/^ABAN 01[4567]$/, run:t=>wrap(t,/()(xxx)(\s+psi)/g,'pressaoRiserDpr') },
  // N2 TRT
  { scope:/^ABAN 02[45]$/, run:t=>wrap(t,/()(xxx)(\s+psi)/g,'pressaoN2Trt') },
  // TMF prod
  { scope:set('ABAN 026'), run:t=>wrap(t,/()(xxxx)(\s+psi)/g,'pressaoTmfProd') },
  // blocos ANM
  { scope:/^ABAN 02[789]$/, run:t=>wrap(t,/()(xxx)(\s+psi)/g,'pressaoTmfAnulAnm') },
  // bullhead DHSV (030)
  { scope:set('ABAN 030'), run:t=>{
      t=wrap(t,/(\b)(XX)(\s+bbl\b)/g,'bullheadVolume')
      t=wrap(t,/(\b)(XXX)(\s+m\s+abaixo\b)/gi,'bullheadDepth')
      return wrap(t,/(\b)(XXXX)(\s+psi\b)/g,'pressaoBullheadDhsv')
  } },
  // BOP perf (228/229)
  { scope:/^ABAN 22[89]$/, run:t=>wrap(t,/(\b)(x{3,4})(\s+psi\b)/gi,'pressaoBopPerfuracao') },
  // BOP descent (184)
  { scope:set('ABAN 184'), run:t=>{
      t=wrap(t,/(linhas de kill e choke com 300\s*\/\s*)(x{2,4})(\s*psi)/gi,'pressaoKillChoke')
      t=wrap(t,/(linha de Kill contra válvula submarina com 300\s*\/\s*)(x{2,4})(\s*psi)/gi,'pressaoKillChoke')
      t=wrap(t,/(anel VGX do BOP contra CSB do poço com 300\s*\/\s*)(x{2,4})(\s*psi)/gi,'pressaoVgx')
      return wrap(t,/(equipamentos de superfície com 300\s*\/\s*)(x{2,4})(\s*psi)/gi,'pressaoEquipSupBop')
  } },
  // bullhead MEG (062)
  { scope:set('ABAN 062'), run:t=>wrap(t,/(\b)(XX)(\s+bbl\b)/g,'bullheadVolume') },
  // FCBA dens (061-063)
  { scope:/^ABAN 06[123]$/, run:t=>{
      t=wrap(t,/(\b)(X,X)(\s+ppg\b)/g,'amortFcbaDensidade')
      return wrap(t,/(\b)(XX)(\s+ppg\b)/g,'amortFcbaDensidade')
  } },
  // cement alignment (078-084)
  { scope:/^ABAN 0(78|79|80|81|82|83|84)$/, run:t=>wrap(t,/(via\s+)(xxx\s*>\s*xxx\s*>\s*xxx)()/gi,'cimentAlinhamento') },
  // cement plug (078/079) — FCBA primeiro
  { scope:/^ABAN 07[89]$/, run:t=>{
      t=wrap(t,/(FCBA\s+)(XXX)(\s+lb\/gal\b)/gi,'cimentFcbaDens')
      t=wrap(t,/(\b)(XXX|xxx)(\s+bbl\b)/g,'cimentPlugVol')
      return wrap(t,/(\b)(XXX|xxx)(\s+lb\/gal\b)/g,'cimentPlugDens')
  } },
  // diâmetros de ferramenta (arame)
  { scope:true, run:t=>{
      t=wrap(t,/(collet\s+)([xX]{1,3})(["”])/g,'diamLocalizador')
      t=wrap(t,/(estampador\s+)([xX]{1,3}(?:[,.][xX]{1,2})?)(["”])/gi,'diamEstampador')
      t=wrap(t,/(ID\s+do\s+camisão\s+)([xX])(["”])/g,'camDiamInt')
      t=wrap(t,/()(pescador\s+[xX][“”])()/g,'aplicadorCamisao')   // substitui o trecho inteiro
      t=wrap(t,/(caçamba\s+)([xX][,.][xX]{1,2})(["”])/gi,'diamCacamba')
      t=wrap(t,/(desviador\s+)([xX]{2})(\b)/g,'tipoDesviador')
      t=wrap(t,/(JDC\s+)([xX])(["”])/g,'diamJdc')
      return wrap(t,/(mod\.\s+)([xX]{3,4}(?:\s+[xX]{3,4})?)(["”])/gi,'modeloSlidingSleeve')
  } },
  // OUTROS
  { scope:set('ABAN 018'), run:t=>wrap(t,/(\b)(x{2,3})(\s*klbf\b)/gi,'outrosTrtWeightTcap') },
  { scope:set('ABAN 023'), run:t=>wrap(t,/(\b)([Xx]{1,2})(\s*klbf\b)/gi,'outrosTrtWeightAnm') },
  { scope:set('ABAN 216','ABAN 217'), run:t=>{
      t=wrap(t,/()(xx)(\s*%\s*MEG\b)/gi,'outrosMegConc')
      return wrap(t,/()(xx)(\s*%\s*FCBA\b)/gi,'outrosMegConc')
  } },
  { scope:set('ABAN 223','ABAN 224'), run:t=>wrap(t,/(\b)(xx)(\s*bpm\b)/gi,'outrosCoolingFlow') },
  { scope:set('ABAN 220','ABAN 221'), run:t=>wrap(t,/(\b)(xxx)(\s*psi\b)/gi,'outrosPcabN2Psi') },
  { scope:set('ABAN 218'), run:t=>wrap(t,/(\b)(xxxx)(\s*psi\b)/gi,'outrosDrainB2Psi') },
  { scope:set('ABAN 016'), run:t=>wrap(t,/(\b)(xxx)(\s*scf\/min\b)/gi,'outrosN2FlowScfm') },
  // PROOF — por último (genérico "com XXX psi")
  { scope:true, run:(t,id)=>wrap(t,/(com\s+)(x{2,4})(\s+psi\b)/gi,()=> PROOF_FIELD[id] ?? 'pressaoProva') },
]

// ── nav tokenizer (posicional, glifo '?') ─────────────────────────────────────
function tokenizeNav(text) {
  let t = text
  // distância primeiro
  t = t.replace(/\b(XXX|XX|xx)(\s+NM\b)/g, (_,g,post)=>`${TK('distanciaEntrePocos','?')}${post}`)
  // XXXX/XXX: 1º=origem, 2º=destino (≥2); senão destino
  const matches = t.match(/XXXX|XXX/g)
  if (matches && matches.length >= 2) {
    let c = 0
    t = t.replace(/XXXX|XXX/g, () => { c++; return TK(c===1 ? 'pocoOrigem':'poco','?') })
  } else {
    t = t.replace(/XXXX|XXX/g, () => TK('poco','?'))
  }
  // xxx minúsculo → origem
  t = t.replace(/\bxxx\b/g, () => TK('pocoOrigem','?'))
  return t
}

// ── processa ──────────────────────────────────────────────────────────────────
const data = JSON.parse(fs.readFileSync(SRC,'utf8').replace(/^﻿/, ''))
let tokenizedLines = 0, tokenCount = 0
for (const pkgId of Object.keys(data)) {
  const pkgName = pkgNames[pkgId] ?? ''
  const isNavPkg = NAV_PKGS.has(pkgId)
  for (const ln of data[pkgId]) {
    if (!ln || typeof ln.text !== 'string') continue
    const orig = ln.text
    const owEtapa = ln.owEtapa ?? ''
    const isNavLine = isNavPkg && (NAV_ETAPAS.has(owEtapa) || NAV_PREP.has(owEtapa))
    let out
    if (isNavPkg && (isNavLine || hasNavPh(orig))) {
      out = tokenizeNav(orig)
    } else {
      out = orig
      for (const r of RULES) {
        if (!inScope(r.scope, pkgId)) continue
        if (r.guard && !r.guard.test(out)) continue
        out = r.run(out, pkgId, pkgName)
      }
    }
    if (out !== orig) { tokenizedLines++; tokenCount += (out.match(/\{\{/g)||[]).length }
    ln.text = out
  }
}
fs.writeFileSync(OUT, JSON.stringify(data, null, 2))
console.log(`tokenized lines: ${tokenizedLines} | tokens: ${tokenCount} | -> ${OUT.pathname}`)
