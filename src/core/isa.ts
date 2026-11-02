// ISA table shared by assembler, disassembler and CPU.
// Based on the course slides (Multicycle Machine — Version 3, MIPS Multiplication)
// extended to 36 real instructions.

export type Format = 'R' | 'I' | 'J'

/** Operand syntax patterns */
export type Syntax =
  | 'rd,rs,rt'
  | 'rd,rt,shamt'
  | 'rs'
  | 'rd'
  | 'rs,rt'
  | 'none'
  | 'rt,rs,imm'
  | 'rt,imm'
  | 'rt,off(rs)'
  | 'rs,rt,label'
  | 'label'

export type InstrClass =
  | 'alu'
  | 'shift'
  | 'load'
  | 'store'
  | 'branch'
  | 'jump'
  | 'syscall'
  | 'muldiv'
  | 'mfhilo'

export interface InstrDef {
  name: string
  format: Format
  opcode: number
  funct?: number
  syntax: Syntax
  cls: InstrClass
  /** immediate is zero-extended (andi/ori/xori/lui) */
  zeroExt?: boolean
}

const R = (name: string, funct: number, syntax: Syntax, cls: InstrClass): InstrDef => ({
  name,
  format: 'R',
  opcode: 0,
  funct,
  syntax,
  cls,
})
const I = (name: string, opcode: number, syntax: Syntax, cls: InstrClass, zeroExt = false): InstrDef => ({
  name,
  format: 'I',
  opcode,
  syntax,
  cls,
  zeroExt,
})

export const INSTRUCTIONS: InstrDef[] = [
  R('add', 0x20, 'rd,rs,rt', 'alu'),
  R('addu', 0x21, 'rd,rs,rt', 'alu'),
  R('sub', 0x22, 'rd,rs,rt', 'alu'),
  R('subu', 0x23, 'rd,rs,rt', 'alu'),
  R('and', 0x24, 'rd,rs,rt', 'alu'),
  R('or', 0x25, 'rd,rs,rt', 'alu'),
  R('xor', 0x26, 'rd,rs,rt', 'alu'),
  R('nor', 0x27, 'rd,rs,rt', 'alu'),
  R('slt', 0x2a, 'rd,rs,rt', 'alu'),
  R('sltu', 0x2b, 'rd,rs,rt', 'alu'),
  R('sll', 0x00, 'rd,rt,shamt', 'shift'),
  R('srl', 0x02, 'rd,rt,shamt', 'shift'),
  R('sra', 0x03, 'rd,rt,shamt', 'shift'),
  R('jr', 0x08, 'rs', 'jump'),
  R('syscall', 0x0c, 'none', 'syscall'),
  R('mfhi', 0x10, 'rd', 'mfhilo'),
  R('mflo', 0x12, 'rd', 'mfhilo'),
  R('mult', 0x18, 'rs,rt', 'muldiv'),
  R('multu', 0x19, 'rs,rt', 'muldiv'),
  R('div', 0x1a, 'rs,rt', 'muldiv'),
  R('divu', 0x1b, 'rs,rt', 'muldiv'),
  { name: 'mul', format: 'R', opcode: 0x1c, funct: 0x02, syntax: 'rd,rs,rt', cls: 'muldiv' },
  I('addi', 0x08, 'rt,rs,imm', 'alu'),
  I('addiu', 0x09, 'rt,rs,imm', 'alu'),
  I('slti', 0x0a, 'rt,rs,imm', 'alu'),
  I('sltiu', 0x0b, 'rt,rs,imm', 'alu'),
  I('andi', 0x0c, 'rt,rs,imm', 'alu', true),
  I('ori', 0x0d, 'rt,rs,imm', 'alu', true),
  I('xori', 0x0e, 'rt,rs,imm', 'alu', true),
  I('lui', 0x0f, 'rt,imm', 'alu', true),
  I('lw', 0x23, 'rt,off(rs)', 'load'),
  I('sw', 0x2b, 'rt,off(rs)', 'store'),
  I('beq', 0x04, 'rs,rt,label', 'branch'),
  I('bne', 0x05, 'rs,rt,label', 'branch'),
  { name: 'j', format: 'J', opcode: 0x02, syntax: 'label', cls: 'jump' },
  { name: 'jal', format: 'J', opcode: 0x03, syntax: 'label', cls: 'jump' },
]

export const INSTR_BY_NAME = new Map(INSTRUCTIONS.map((d) => [d.name, d]))

/** Find the definition for a machine word, or undefined if unsupported. */
export function lookup(word: number): InstrDef | undefined {
  const op = word >>> 26
  if (op === 0) {
    const funct = word & 0x3f
    return INSTRUCTIONS.find((d) => d.opcode === 0 && d.funct === funct)
  }
  if (op === 0x1c) {
    const funct = word & 0x3f
    return INSTRUCTIONS.find((d) => d.opcode === 0x1c && d.funct === funct)
  }
  return INSTRUCTIONS.find((d) => d.opcode === op && d.format !== 'R')
}

export const REG_NAMES = [
  'zero', 'at', 'v0', 'v1', 'a0', 'a1', 'a2', 'a3',
  't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7',
  's0', 's1', 's2', 's3', 's4', 's5', 's6', 's7',
  't8', 't9', 'k0', 'k1', 'gp', 'sp', 'fp', 'ra',
]

export function parseRegister(tok: string): number | undefined {
  const t = tok.trim().toLowerCase()
  if (!t.startsWith('$')) return undefined
  const n = t.slice(1)
  if (/^\d+$/.test(n)) {
    const v = Number(n)
    return v >= 0 && v < 32 ? v : undefined
  }
  if (n === 's8') return 30
  const i = REG_NAMES.indexOf(n)
  return i >= 0 ? i : undefined
}

export const regName = (n: number) => '$' + REG_NAMES[n]

// Memory map (same as MARS defaults)
export const TEXT_BASE = 0x00400000
export const DATA_BASE = 0x10010000
export const GP_INIT = 0x10008000
export const SP_INIT = 0x7fffeffc

// Field helpers
export const fOp = (w: number) => w >>> 26
export const fRs = (w: number) => (w >>> 21) & 31
export const fRt = (w: number) => (w >>> 16) & 31
export const fRd = (w: number) => (w >>> 11) & 31
export const fShamt = (w: number) => (w >>> 6) & 31
export const fFunct = (w: number) => w & 0x3f
export const fImm = (w: number) => w & 0xffff
export const fTarget = (w: number) => w & 0x3ffffff
export const signExt16 = (v: number) => (v << 16) >> 16
export const hex32 = (v: number) => '0x' + (v >>> 0).toString(16).padStart(8, '0')
