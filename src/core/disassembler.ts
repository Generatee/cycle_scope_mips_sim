import {
  fFunct, fImm, fOp, fRd, fRs, fRt, fShamt, fTarget, lookup, regName, signExt16,
  type InstrDef,
} from './isa'

export interface Fields {
  op: number
  rs: number
  rt: number
  rd: number
  shamt: number
  funct: number
  imm: number
  target: number
}

export interface Decoded {
  word: number
  def?: InstrDef
  fields: Fields
  /** assembly text; branch/jump targets as absolute hex unless labels supplied */
  text: string
  /** absolute branch/jump target address if any */
  target?: number
}

export function fields(word: number): Fields {
  return {
    op: fOp(word), rs: fRs(word), rt: fRt(word), rd: fRd(word),
    shamt: fShamt(word), funct: fFunct(word), imm: fImm(word), target: fTarget(word),
  }
}

const hex = (v: number) => '0x' + (v >>> 0).toString(16).padStart(8, '0')

export function decode(word: number, pc = 0, labels?: Map<number, string>): Decoded {
  word >>>= 0
  const f = fields(word)
  const def = lookup(word)
  if (!def) return { word, fields: f, text: `.word ${hex(word)}  # unknown` }
  const r = regName
  const lbl = (a: number) => labels?.get(a) ?? hex(a)
  let text = def.name
  let target: number | undefined
  switch (def.syntax) {
    case 'rd,rs,rt': text += ` ${r(f.rd)}, ${r(f.rs)}, ${r(f.rt)}`; break
    case 'rd,rt,shamt':
      text = word === 0 ? 'nop' : `${def.name} ${r(f.rd)}, ${r(f.rt)}, ${f.shamt}`
      break
    case 'rs': text += ` ${r(f.rs)}`; break
    case 'rd': text += ` ${r(f.rd)}`; break
    case 'rs,rt': text += ` ${r(f.rs)}, ${r(f.rt)}`; break
    case 'none': break
    case 'rt,rs,imm':
      text += ` ${r(f.rt)}, ${r(f.rs)}, ${def.zeroExt ? f.imm : signExt16(f.imm)}`
      break
    case 'rt,imm': text += ` ${r(f.rt)}, 0x${f.imm.toString(16)}`; break
    case 'rt,off(rs)': text += ` ${r(f.rt)}, ${signExt16(f.imm)}(${r(f.rs)})`; break
    case 'rs,rt,label':
      target = (pc + 4 + (signExt16(f.imm) << 2)) >>> 0
      text += ` ${r(f.rs)}, ${r(f.rt)}, ${lbl(target)}`
      break
    case 'label':
      target = (((pc + 4) & 0xf0000000) | (f.target << 2)) >>> 0
      text += ` ${lbl(target)}`
      break
  }
  return { word, def, fields: f, text, target }
}

export interface DisasmLine {
  addr: number
  word: number
  label?: string
  text: string
}

/** Disassemble a sequence of words placed at base, creating labels for branch/jump targets. */
export function disassemble(words: number[], base: number): DisasmLine[] {
  const end = base + words.length * 4
  const targets = new Set<number>()
  words.forEach((w, i) => {
    const d = decode(w, base + i * 4)
    if (d.target !== undefined && d.target >= base && d.target < end) targets.add(d.target)
  })
  const labels = new Map<number, string>()
  ;[...targets].sort((a, b) => a - b).forEach((a, i) => labels.set(a, `L${i + 1}`))
  return words.map((w, i) => {
    const addr = base + i * 4
    return { addr, word: w >>> 0, label: labels.get(addr), text: decode(w, addr, labels).text }
  })
}

/** Parse hex text (one word per line; 0x optional; comments with #) */
export function parseHexWords(src: string): { words: number[]; errors: { line: number; message: string }[] } {
  const words: number[] = []
  const errors: { line: number; message: string }[] = []
  src.split(/\r?\n/).forEach((l, i) => {
    const t = l.replace(/#.*/, '').trim()
    if (!t) return
    for (const tok of t.split(/[\s,]+/)) {
      const h = tok.replace(/^0x/i, '')
      if (!/^[0-9a-f]{1,8}$/i.test(h)) errors.push({ line: i + 1, message: `Invalid hex "${tok}"` })
      else words.push(parseInt(h, 16) >>> 0)
    }
  })
  return { words, errors }
}
