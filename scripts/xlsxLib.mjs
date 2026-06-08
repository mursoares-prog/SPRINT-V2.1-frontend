// Parser XLSX mínimo (sem dependências): lê sharedStrings + uma worksheet e
// retorna matriz de linhas (array de objetos {col: valor}). Inclui um leitor de
// ZIP (via zlib) para abrir o .xlsx diretamente, sem descompactar antes.
import { readFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'

// Lê uma entrada do .xlsx (ZIP) pelo nome, via central directory.
export function readZipEntry(zipPath, entryName) {
  const buf = readFileSync(zipPath)
  // End of Central Directory: assina 0x06054b50, procurar do fim
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('EOCD não encontrado (ZIP inválido)')
  const cdCount = buf.readUInt16LE(eocd + 10)
  let off = buf.readUInt32LE(eocd + 16)
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('central dir corrompido')
    const method = buf.readUInt16LE(off + 10)
    const compSize = buf.readUInt32LE(off + 20)
    const nameLen = buf.readUInt16LE(off + 28)
    const extraLen = buf.readUInt16LE(off + 30)
    const commentLen = buf.readUInt16LE(off + 32)
    const localOff = buf.readUInt32LE(off + 42)
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen)
    if (name === entryName) {
      // local header: nome+extra têm tamanhos próprios
      const lNameLen = buf.readUInt16LE(localOff + 26)
      const lExtraLen = buf.readUInt16LE(localOff + 28)
      const dataStart = localOff + 30 + lNameLen + lExtraLen
      const comp = buf.subarray(dataStart, dataStart + compSize)
      return method === 0 ? comp.toString('utf8') : inflateRawSync(comp).toString('utf8')
    }
    off += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`entrada não encontrada no ZIP: ${entryName}`)
}

const decode = s => s
  .replace(/<[^>]+>/g, '')        // remove tags internas de <t> (ex.: rPr)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#10;/g, '\n').replace(/&#13;/g, '\r').replace(/&#9;/g, '\t')
  .replace(/&amp;/g, '&')

export function parseSharedStrings(xml) {
  const out = []
  // cada <si>...</si> é uma string; pode ter múltiplos <t> (runs)
  const siRe = /<si>([\s\S]*?)<\/si>/g
  let m
  while ((m = siRe.exec(xml))) {
    const inner = m[1]
    const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g
    let t, buf = ''
    while ((t = tRe.exec(inner))) buf += t[1]
    out.push(decode(buf))
  }
  return out
}

const colLetter = ref => ref.replace(/\d+/g, '')

export function parseSheet(xml, shared) {
  const rows = []
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g
  let rm
  while ((rm = rowRe.exec(xml))) {
    const cells = {}
    const inner = rm[2]
    const cRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g
    let cm
    while ((cm = cRe.exec(inner))) {
      const attrs = cm[1] ?? cm[3] ?? ''
      const body = cm[2] ?? ''
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) ?? [])[1]
      if (!ref) continue
      const type = (attrs.match(/\bt="([^"]+)"/) ?? [])[1]
      let val = ''
      if (type === 's') {
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1]
        if (v != null) val = shared[parseInt(v, 10)] ?? ''
      } else if (type === 'inlineStr') {
        const tRe = /<t[^>]*>([\s\S]*?)<\/t>/g
        let t; while ((t = tRe.exec(body))) val += t[1]
        val = decode(val)
      } else {
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1]
        if (v != null) val = decode(v)
      }
      cells[colLetter(ref)] = val
    }
    rows.push({ r: parseInt(rm[1], 10), cells })
  }
  return rows
}
