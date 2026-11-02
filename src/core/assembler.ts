// Two-pass MIPS assembler with pseudo-instructions and data directives.
import {
  DATA_BASE,
  INSTR_BY_NAME,
  TEXT_BASE,
  parseRegister,
  type InstrDef,
} from './isa'

export interface AsmError {
  line: number // 1-based
  message: string
}

export interface TextWord {
  addr: number
  word: number
  line: number // 1-based source line
  /** basic (expanded) instruction text */
  basic: string
  /** original source text (only on the first word of a pseudo expansion) */
  source: string
}

export interface Program {
  text: TextWord[]
  data: Uint8Array // bytes starting at DATA_BASE
  symbols: Map<string, number>
  entry: number
  errors: AsmError[]
  /** address -> index in text */
  addrIndex: Map<number, number>
}

class AsmFail extends Error {}
const fail = (msg: string): never => {
  throw new AsmFail(msg)
}

interface Stmt {
  line: number
  labels: string[]
  op: string // mnemonic or directive (lowercase)
  args: string[]
  raw: string
}

/** Split operands by commas, respecting quoted strings. */
function splitArgs(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"' && s[i - 1] !== '\\') q = !q
    if (c === ',' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  if (cur.trim() !== '') out.push(cur.trim())
  return out
}

function stripComment(line: string): string {
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"' && line[i - 1] !== '\\') q = !q
    if (c === '#' && !q) return line.slice(0, i)
  }
  return line
}

function parseLines(src: string): { stmts: Stmt[]; errors: AsmError[] } {
  const stmts: Stmt[] = []
  const errors: AsmError[] = []
  const lines = src.split(/\r?\n/)
  let pendingLabels: string[] = []
  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1
    let s = stripComment(rawLine).trim()
    // labels
    for (;;) {
      const m = /^([A-Za-z_.$][\w.$]*)\s*:/.exec(s)
      if (!m) break
      pendingLabels.push(m[1])
      s = s.slice(m[0].length).trim()
    }
    if (s === '') return
    const m = /^(\S+)\s*(.*)$/.exec(s)
    if (!m) {
      errors.push({ line: lineNo, message: 'Cannot parse line' })
      return
    }
    stmts.push({
      line: lineNo,
      labels: pendingLabels,
      op: m[1].toLowerCase(),
      args: splitArgs(m[2]),
      raw: rawLine.trim(),
    })
    pendingLabels = []
  })
  if (pendingLabels.length) {
    stmts.push({ line: lines.length, labels: pendingLabels, op: '', args: [], raw: '' })
  }
  return { stmts, errors }
}

export function parseNumber(tok: string): number | undefined {
  const t = tok.trim()
  if (/^'.'$/.test(t)) return t.charCodeAt(1)
  if (/^'\\n'$/.test(t)) return 10
  if (/^[-+]?0x[0-9a-f]+$/i.test(t)) {
    const neg = t.startsWith('-')
    const v = parseInt(t.replace(/^[-+]/, ''), 16)
    return neg ? -v : v
  }
  if (/^[-+]?\d+$/.test(t)) return parseInt(t, 10)
  return undefined
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) =>
    c === 'n' ? '\n' : c === 't' ? '\t' : c === '0' ? '\0' : c,
  )
}

const fitsS16 = (v: number) => v >= -32768 && v <= 32767
const fitsU16 = (v: number) => v >= 0 && v <= 0xffff

/** A basic (real) instruction before encoding. Operands are strings to resolve in pass 2. */
interface Basic {
  def: InstrDef
  ops: Record<string, string | number> // rs, rt, rd, shamt, imm, label
  text: string
}

const reg = (t: string | undefined): number => {
  if (t === undefined) return fail('Missing register operand')
  const r = parseRegister(t)
  if (r === undefined) return fail(`Invalid register "${t}"`)
  return r
}

const B = (name: string, ops: Basic['ops'], text: string): Basic => {
  const def = INSTR_BY_NAME.get(name)!
  return { def, ops, text }
}

/** Expand a statement (real or pseudo) into basic instructions. Labels stay unresolved. */
function expand(st: Stmt): Basic[] {
  const a = st.args
  const n = st.op
  const need = (k: number) => {
    if (a.length !== k) fail(`"${n}" expects ${k} operand(s), got ${a.length}`)
  }
  const AT = 1
  switch (n) {
    case 'nop':
      need(0)
      return [B('sll', { rd: 0, rt: 0, shamt: 0 }, 'sll $0, $0, 0')]
    case 'move':
      need(2)
      return [B('addu', { rd: reg(a[0]), rs: 0, rt: reg(a[1]) }, `addu ${a[0]}, $0, ${a[1]}`)]
    case 'not':
      need(2)
      return [B('nor', { rd: reg(a[0]), rs: reg(a[1]), rt: 0 }, `nor ${a[0]}, ${a[1]}, $0`)]
    case 'neg':
      need(2)
      return [B('sub', { rd: reg(a[0]), rs: 0, rt: reg(a[1]) }, `sub ${a[0]}, $0, ${a[1]}`)]
    case 'li': {
      need(2)
      const rt = reg(a[0])
      const v = parseNumber(a[1])
      if (v === undefined) return fail(`Invalid immediate "${a[1]}"`)
      if (v < -0x80000000 || v > 0xffffffff) fail('Immediate out of 32-bit range')
      if (fitsS16(v)) return [B('addiu', { rt, rs: 0, imm: v }, `addiu ${a[0]}, $0, ${v}`)]
      if (fitsU16(v)) return [B('ori', { rt, rs: 0, imm: v }, `ori ${a[0]}, $0, ${v}`)]
      const u = v >>> 0
      return [
        B('lui', { rt: AT, imm: u >>> 16 }, `lui $at, ${u >>> 16}`),
        B('ori', { rt, rs: AT, imm: u & 0xffff }, `ori ${a[0]}, $at, ${u & 0xffff}`),
      ]
    }
    case 'la': {
      need(2)
      const rt = reg(a[0])
      return [
        B('lui', { rt: AT, imm: `%hi(${a[1]})` }, `lui $at, %hi(${a[1]})`),
        B('ori', { rt, rs: AT, imm: `%lo(${a[1]})` }, `ori ${a[0]}, $at, %lo(${a[1]})`),
      ]
    }
    case 'b':
      need(1)
      return [B('beq', { rs: 0, rt: 0, label: a[0] }, `beq $0, $0, ${a[0]}`)]
    case 'beqz':
    case 'bnez':
      need(2)
      return [
        B(n === 'beqz' ? 'beq' : 'bne', { rs: reg(a[0]), rt: 0, label: a[1] },
          `${n === 'beqz' ? 'beq' : 'bne'} ${a[0]}, $0, ${a[1]}`),
      ]
    case 'blt':
    case 'bgt':
    case 'ble':
    case 'bge': {
      need(3)
      const x = reg(a[0])
      const y = reg(a[1])
      const swap = n === 'bgt' || n === 'ble'
      const br = n === 'blt' || n === 'bgt' ? 'bne' : 'beq'
      const [p, q] = swap ? [y, x] : [x, y]
      const [ps, qs] = swap ? [a[1], a[0]] : [a[0], a[1]]
      return [
        B('slt', { rd: AT, rs: p, rt: q }, `slt $at, ${ps}, ${qs}`),
        B(br, { rs: AT, rt: 0, label: a[2] }, `${br} $at, $0, ${a[2]}`),
      ]
    }
  }

  const def = INSTR_BY_NAME.get(n)
  if (!def) return fail(`Unknown instruction "${n}"`)
  const text = `${n} ${a.join(', ')}`.trim()
  switch (def.syntax) {
    case 'rd,rs,rt':
      need(3)
      return [{ def, ops: { rd: reg(a[0]), rs: reg(a[1]), rt: reg(a[2]) }, text }]
    case 'rd,rt,shamt': {
      need(3)
      const sh = parseNumber(a[2])
      if (sh === undefined || sh < 0 || sh > 31) fail('Shift amount must be 0..31')
      return [{ def, ops: { rd: reg(a[0]), rt: reg(a[1]), shamt: sh! }, text }]
    }
    case 'rs':
      need(1)
      return [{ def, ops: { rs: reg(a[0]) }, text }]
    case 'rd':
      need(1)
      return [{ def, ops: { rd: reg(a[0]) }, text }]
    case 'rs,rt':
      need(2)
      return [{ def, ops: { rs: reg(a[0]), rt: reg(a[1]) }, text }]
    case 'none':
      need(0)
      return [{ def, ops: {}, text }]
    case 'rt,rs,imm':
      need(3)
      return [{ def, ops: { rt: reg(a[0]), rs: reg(a[1]), imm: a[2] }, text }]
    case 'rt,imm':
      need(2)
      return [{ def, ops: { rt: reg(a[0]), imm: a[1] }, text }]
    case 'rt,off(rs)': {
      need(2)
      const m = /^(.*)\(\s*(\$\w+)\s*\)$/.exec(a[1])
      if (m) {
        const off = m[1].trim() === '' ? '0' : m[1].trim()
        return [{ def, ops: { rt: reg(a[0]), rs: reg(m[2]), imm: off }, text }]
      }
      // lw/sw rt, label  -> lui $at, %hiadj(label); lw rt, %lo(label)($at)
      if (parseNumber(a[1]) === undefined && /^[A-Za-z_.$][\w.$]*$/.test(a[1])) {
        return [
          B('lui', { rt: AT, imm: `%hiadj(${a[1]})` }, `lui $at, %hiadj(${a[1]})`),
          { def, ops: { rt: reg(a[0]), rs: AT, imm: `%lo(${a[1]})` }, text: `${n} ${a[0]}, %lo(${a[1]})($at)` },
        ]
      }
      return fail(`Expected offset(register), got "${a[1]}"`)
    }
    case 'rs,rt,label':
      need(3)
      return [{ def, ops: { rs: reg(a[0]), rt: reg(a[1]), label: a[2] }, text }]
    case 'label':
      need(1)
      return [{ def, ops: { label: a[0] }, text }]
  }
}

function resolveValue(tok: string, symbols: Map<string, number>): number {
  const n = parseNumber(tok)
  if (n !== undefined) return n
  const m = /^%(hi|lo|hiadj)\((.+)\)$/.exec(tok)
  if (m) {
    const v = resolveValue(m[2], symbols) >>> 0
    if (m[1] === 'hi') return v >>> 16
    if (m[1] === 'lo') return v & 0xffff
    return ((v + 0x8000) >>> 16) & 0xffff
  }
  const plus = /^([A-Za-z_.$][\w.$]*)\s*([+-])\s*(\d+)$/.exec(tok)
  if (plus) {
    const base = symbols.get(plus[1])
    if (base === undefined) fail(`Undefined label "${plus[1]}"`)
    return plus[2] === '+' ? base! + Number(plus[3]) : base! - Number(plus[3])
  }
  const s = symbols.get(tok)
  if (s === undefined) return fail(`Undefined label "${tok}"`)
  return s
}

function encode(b: Basic, pc: number, symbols: Map<string, number>): number {
  const { def, ops } = b
  const num = (k: string) => (typeof ops[k] === 'number' ? (ops[k] as number) : 0)
  if (def.format === 'R') {
    return (
      ((def.opcode << 26) | (num('rs') << 21) | (num('rt') << 16) | (num('rd') << 11) |
        (num('shamt') << 6) | def.funct!) >>> 0
    )
  }
  if (def.format === 'J') {
    const target = resolveValue(String(ops.label), symbols) >>> 0
    if (target & 3) fail('Jump target not word-aligned')
    if ((target & 0xf0000000) !== ((pc + 4) & 0xf0000000)) fail('Jump target out of range')
    return ((def.opcode << 26) | ((target >>> 2) & 0x3ffffff)) >>> 0
  }
  // I-format
  let imm: number
  if (def.syntax === 'rs,rt,label') {
    const target = resolveValue(String(ops.label), symbols)
    const off = (target - (pc + 4)) >> 2
    if (!fitsS16(off)) fail('Branch target too far')
    imm = off & 0xffff
  } else {
    const raw = ops.imm
    const v = typeof raw === 'number' ? raw : resolveValue(String(raw), symbols)
    const isReloc = typeof raw === 'string' && raw.startsWith('%')
    if (!isReloc) {
      if (def.zeroExt) {
        if (!(fitsU16(v) || (def.name === 'lui' && fitsS16(v))))
          fail(`Immediate ${v} out of range 0..65535 for ${def.name}`)
      } else if (!fitsS16(v)) {
        fail(`Immediate ${v} out of range -32768..32767 for ${def.name}`)
      }
    }
    imm = v & 0xffff
  }
  return ((def.opcode << 26) | (num('rs') << 21) | (num('rt') << 16) | imm) >>> 0
}

export function assemble(src: string): Program {
  const { stmts, errors } = parseLines(src)
  const symbols = new Map<string, number>()
  type Item = { st: Stmt; addr: number; basics: Basic[] }
  const items: Item[] = []
  const data: number[] = []
  let seg: 'text' | 'data' = 'text'
  let textPc = TEXT_BASE
  const dataPc = () => DATA_BASE + data.length
  const align = (n: number) => {
    while (data.length % n) data.push(0)
  }
  const define = (label: string, addr: number, line: number) => {
    if (symbols.has(label)) errors.push({ line, message: `Duplicate label "${label}"` })
    else symbols.set(label, addr)
  }
  const dataWordsToResolve: { offset: number; tok: string; line: number }[] = []

  // ---- Pass 1: addresses, labels, data ----
  for (const st of stmts) {
    try {
      if (st.op === '.text') seg = 'text'
      else if (st.op === '.data') seg = 'data'
      if (seg === 'data' && (st.op === '.word' || st.op === '.align')) {
        if (st.op === '.word') align(4)
      }
      const here = seg === 'text' ? textPc : dataPc()
      for (const l of st.labels) define(l, here, st.line)
      if (st.op === '' || st.op === '.text' || st.op === '.data' || st.op === '.globl' || st.op === '.global') continue
      if (st.op.startsWith('.')) {
        if (seg !== 'data') fail(`Directive ${st.op} is only allowed in .data`)
        switch (st.op) {
          case '.word':
            for (const t of st.args) {
              const v = parseNumber(t)
              if (v === undefined) {
                dataWordsToResolve.push({ offset: data.length, tok: t, line: st.line })
                data.push(0, 0, 0, 0)
              } else {
                const u = v >>> 0
                data.push(u & 255, (u >>> 8) & 255, (u >>> 16) & 255, u >>> 24)
              }
            }
            break
          case '.byte':
            for (const t of st.args) {
              const v = parseNumber(t)
              if (v === undefined) fail(`Invalid byte "${t}"`)
              data.push(v! & 255)
            }
            break
          case '.space': {
            const v = parseNumber(st.args[0] ?? '')
            if (v === undefined || v < 0) fail('.space needs a size')
            for (let i = 0; i < v!; i++) data.push(0)
            break
          }
          case '.ascii':
          case '.asciiz': {
            const m = /^"(.*)"$/.exec(st.args.join(','))
            if (!m) fail(`${st.op} needs a "string"`)
            for (const ch of unescape(m![1])) data.push(ch.charCodeAt(0) & 255)
            if (st.op === '.asciiz') data.push(0)
            break
          }
          case '.align': {
            const v = parseNumber(st.args[0] ?? '')
            if (v === undefined || v < 0 || v > 3) fail('.align needs 0..3')
            align(1 << v!)
            // labels defined before alignment should point to the aligned address
            for (const l of st.labels) symbols.set(l, dataPc())
            break
          }
          default:
            fail(`Unknown directive ${st.op}`)
        }
        continue
      }
      if (seg !== 'text') fail('Instructions must be in .text')
      const basics = expand(st)
      items.push({ st, addr: textPc, basics })
      textPc += 4 * basics.length
    } catch (e) {
      if (e instanceof AsmFail) errors.push({ line: st.line, message: e.message })
      else throw e
    }
  }

  for (const d of dataWordsToResolve) {
    try {
      const u = resolveValue(d.tok, symbols) >>> 0
      data[d.offset] = u & 255
      data[d.offset + 1] = (u >>> 8) & 255
      data[d.offset + 2] = (u >>> 16) & 255
      data[d.offset + 3] = u >>> 24
    } catch (e) {
      if (e instanceof AsmFail) errors.push({ line: d.line, message: e.message })
      else throw e
    }
  }

  // ---- Pass 2: encode ----
  const text: TextWord[] = []
  for (const it of items) {
    let pc = it.addr
    it.basics.forEach((b, i) => {
      let word = 0
      try {
        word = encode(b, pc, symbols)
      } catch (e) {
        if (e instanceof AsmFail) errors.push({ line: it.st.line, message: e.message })
        else throw e
      }
      text.push({ addr: pc, word, line: it.st.line, basic: b.text, source: i === 0 ? it.st.raw : '' })
      pc += 4
    })
  }

  errors.sort((x, y) => x.line - y.line)
  const addrIndex = new Map(text.map((t, i) => [t.addr, i]))
  return {
    text,
    data: Uint8Array.from(data),
    symbols,
    entry: symbols.get('main') ?? TEXT_BASE,
    errors,
    addrIndex,
  }
}
