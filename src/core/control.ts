// Main control unit: 23-state FSM (states 0-9 = Five-Stage Control in the slides).
import { fFunct, fOp } from './isa'

export interface Signals {
  PCWrite: number
  PCWriteCond: number
  PCWriteCondNE: number
  IorD: number
  MemRead: number
  MemWrite: number
  IRWrite: number
  RegDst: number // 2 bits: 0 rt, 1 rd, 2 $31
  MemtoReg: number // 3 bits: 0 ALUOut, 1 MDR, 2 PC, 3 HI, 4 LO
  RegWrite: number
  ALUSrcA: number // 0 PC, 1 A
  ALUSrcB: number // 3 bits: 0 B, 1 4, 2 SE, 3 SE<<2, 4 ZE
  ALUOp: number // 2 bits
  PCSource: number // 2 bits: 0 ALU, 1 ALUOut, 2 jump, 3 A
  MDUOp: number // 2 bits: 0 idle, 1 init, 2 step, 3 finish
}

export const SIGNAL_NAMES: (keyof Signals)[] = [
  'PCWrite', 'PCWriteCond', 'PCWriteCondNE', 'IorD', 'MemRead', 'MemWrite', 'IRWrite',
  'RegDst', 'MemtoReg', 'RegWrite', 'ALUSrcA', 'ALUSrcB', 'ALUOp', 'PCSource', 'MDUOp',
]

export const SIGNAL_BITS: Record<keyof Signals, number> = {
  PCWrite: 1, PCWriteCond: 1, PCWriteCondNE: 1, IorD: 1, MemRead: 1, MemWrite: 1, IRWrite: 1,
  RegDst: 2, MemtoReg: 3, RegWrite: 1, ALUSrcA: 1, ALUSrcB: 3, ALUOp: 2, PCSource: 2, MDUOp: 2,
}

/** Mux selects that are "don't care" unless listed in a state. */
export const MUX_SIGNALS: (keyof Signals)[] = ['IorD', 'RegDst', 'MemtoReg', 'ALUSrcA', 'ALUSrcB', 'ALUOp', 'PCSource']

/** Signals added by this project (not in the slides). */
export const NEW_SIGNALS: (keyof Signals)[] = ['PCWriteCondNE', 'MDUOp']

export interface StateInfo {
  id: number
  name: string
  step: string // step number as in the slides' Five-Stage Control
  signals: Partial<Signals>
  rtl: string
  th: string // Thai explanation
  added: boolean // designed by us (not in slides)
}

const S = (
  id: number, name: string, step: string, signals: Partial<Signals>, rtl: string, th: string, added = false,
): StateInfo => ({ id, name, step, signals, rtl, th, added })

export const STATES: StateInfo[] = [
  S(0, 'Fetch', '1', { IorD: 0, MemRead: 1, IRWrite: 1, ALUSrcA: 0, ALUSrcB: 1, ALUOp: 0, PCSource: 0, PCWrite: 1 },
    'IR <= Memory[PC]; PC <= PC + 4',
    'อ่านคำสั่งจาก memory ที่ address = PC ใส่ IR และใช้ ALU บวก PC + 4 พร้อมกัน'),
  S(1, 'Decode', '2', { ALUSrcA: 0, ALUSrcB: 3, ALUOp: 0 },
    'A <= Reg[IR[25:21]]; B <= Reg[IR[20:16]]; ALUOut <= PC + (sign-extend(IR[15:0]) << 2)',
    'อ่าน register rs, rt เก็บใน A, B และคำนวณ branch target ไว้ล่วงหน้าใน ALUOut แล้วเลือก state ถัดไปตาม opcode/funct'),
  S(2, 'MemAddr', '3', { ALUSrcA: 1, ALUSrcB: 2, ALUOp: 0 },
    'ALUOut <= A + sign-extend(IR[15:0])',
    'คำนวณ address ของ memory = rs + offset'),
  S(3, 'MemRead', '4', { MemRead: 1, IorD: 1 },
    'MDR <= Memory[ALUOut]',
    'อ่านข้อมูลจาก memory ที่ address ใน ALUOut เก็บใน MDR'),
  S(4, 'MemWB', '5', { RegDst: 0, MemtoReg: 1, RegWrite: 1 },
    'Reg[IR[20:16]] <= MDR',
    'เขียนข้อมูลจาก MDR ลง register rt (จบ lw ใน 5 cycle)'),
  S(5, 'MemWrite', '4', { MemWrite: 1, IorD: 1 },
    'Memory[ALUOut] <= B',
    'เขียนค่าใน B (rt) ลง memory ที่ address ใน ALUOut (จบ sw ใน 4 cycle)'),
  S(6, 'Execute', '3', { ALUSrcA: 1, ALUSrcB: 0, ALUOp: 2 },
    'ALUOut <= A op B',
    'ALU ทำงานตาม funct กับ A และ B'),
  S(7, 'R-Complete', '4', { RegDst: 1, MemtoReg: 0, RegWrite: 1 },
    'Reg[IR[15:11]] <= ALUOut',
    'เขียนผลลง register rd (จบ R-type ใน 4 cycle)'),
  S(8, 'Beq', '3', { ALUSrcA: 1, ALUSrcB: 0, ALUOp: 1, PCSource: 1, PCWriteCond: 1 },
    'if (A == B) PC <= ALUOut',
    'ALU ลบ A − B ถ้า Zero = 1 ให้ PC = branch target ที่คำนวณไว้ตอน Decode'),
  S(9, 'Jump', '3', { PCSource: 2, PCWrite: 1 },
    'PC <= {PC[31:28], IR[25:0], 00}',
    'กระโดดไปยัง jump address'),
  S(10, 'I-Exec (sign)', '3', { ALUSrcA: 1, ALUSrcB: 2, ALUOp: 3 },
    'ALUOut <= A op sign-extend(IR[15:0])',
    'ALU ทำงานตาม opcode กับ A และ immediate แบบ sign-extend (addi, slti)', true),
  S(11, 'I-Exec (zero)', '3', { ALUSrcA: 1, ALUSrcB: 4, ALUOp: 3 },
    'ALUOut <= A op zero-extend(IR[15:0])',
    'ALU ทำงานตาม opcode กับ A และ immediate แบบ zero-extend (andi, ori, xori, lui)', true),
  S(12, 'I-Complete', '4', { RegDst: 0, MemtoReg: 0, RegWrite: 1 },
    'Reg[IR[20:16]] <= ALUOut',
    'เขียนผลลง register rt', true),
  S(13, 'Bne', '3', { ALUSrcA: 1, ALUSrcB: 0, ALUOp: 1, PCSource: 1, PCWriteCondNE: 1 },
    'if (A != B) PC <= ALUOut',
    'ALU ลบ A − B ถ้า Zero = 0 ให้ PC = branch target', true),
  S(14, 'Jal', '3', { PCSource: 2, PCWrite: 1, RegDst: 2, MemtoReg: 2, RegWrite: 1 },
    'Reg[31] <= PC; PC <= {PC[31:28], IR[25:0], 00}',
    'เก็บ PC (= PC + 4 แล้ว) ลง $ra และกระโดดพร้อมกันในขอบ clock เดียว', true),
  S(15, 'Jr', '3', { PCSource: 3, PCWrite: 1 },
    'PC <= A',
    'กระโดดไปยัง address ใน register rs (A)', true),
  S(16, 'Syscall', '3', {},
    'service($v0)',
    'เรียก service ตาม $v0 (ทำนอก datapath เหมือนส่งงานให้ OS)', true),
  S(17, 'MD-Init', '3', { MDUOp: 1 },
    'Mcand <= |A|; Product <= {0, |B|}; Count <= 32  (div: Divisor <= |B|; Rem <= {0, |A|})',
    'โหลดค่าเข้า MDU ตาม Approach 2 ใช้ค่าสัมบูรณ์ถ้าเป็น signed', true),
  S(18, 'MD-Step', '4…35', { MDUOp: 2 },
    'one Approach-2 iteration; Count <= Count − 1',
    'ทำ 1 รอบ: คูณ = ถ้า Product[0] = 1 บวก Mcand เข้าครึ่งซ้าย แล้ว shift ขวา / หาร = shift ซ้าย แล้วลบ Divisor ถ้าได้', true),
  S(19, 'MD-Finish', '36', { MDUOp: 3 },
    'fix sign; HI <= Product[63:32]; LO <= Product[31:0]',
    'แก้เครื่องหมายผลลัพธ์ แล้วเขียน HI/LO', true),
  S(20, 'Mul-WB', '37', { RegDst: 1, MemtoReg: 4, RegWrite: 1 },
    'Reg[IR[15:11]] <= LO',
    'mul: เขียน LO ลง rd', true),
  S(21, 'Mfhi', '3', { RegDst: 1, MemtoReg: 3, RegWrite: 1 },
    'Reg[IR[15:11]] <= HI',
    'คัดลอก HI ลง rd', true),
  S(22, 'Mflo', '3', { RegDst: 1, MemtoReg: 4, RegWrite: 1 },
    'Reg[IR[15:11]] <= LO',
    'คัดลอก LO ลง rd', true),
]

export function fullSignals(state: number): Signals {
  const s = STATES[state].signals
  const out = {} as Signals
  for (const k of SIGNAL_NAMES) out[k] = s[k] ?? 0
  return out
}

/** Dispatch from Decode (state 1). Returns -1 for unsupported instruction. */
export function dispatch(ir: number): number {
  const op = fOp(ir)
  const funct = fFunct(ir)
  if (op === 0) {
    switch (funct) {
      case 0x08: return 15
      case 0x0c: return 16
      case 0x10: return 21
      case 0x12: return 22
      case 0x18: case 0x19: case 0x1a: case 0x1b: return 17
      case 0x20: case 0x21: case 0x22: case 0x23: case 0x24: case 0x25: case 0x26: case 0x27:
      case 0x2a: case 0x2b: case 0x00: case 0x02: case 0x03:
        return 6
      default: return -1
    }
  }
  switch (op) {
    case 0x23: case 0x2b: return 2
    case 0x04: return 8
    case 0x05: return 13
    case 0x02: return 9
    case 0x03: return 14
    case 0x08: case 0x09: case 0x0a: case 0x0b: return 10
    case 0x0c: case 0x0d: case 0x0e: case 0x0f: return 11
    case 0x1c: return funct === 0x02 ? 17 : -1
    default: return -1
  }
}

export function nextState(state: number, ir: number, mduDone: boolean): number {
  switch (state) {
    case 0: return 1
    case 1: return dispatch(ir)
    case 2: return fOp(ir) === 0x23 ? 3 : 5
    case 3: return 4
    case 6: return 7
    case 10: case 11: return 12
    case 17: return 18
    case 18: return mduDone ? 19 : 18
    case 19: return fOp(ir) === 0x1c ? 20 : 0
    default: return 0
  }
}

// ---------------- ALU control ----------------
export type AluFn = 'and' | 'or' | 'add' | 'sub' | 'slt' | 'nor' | 'xor' | 'sltu' | 'sll' | 'srl' | 'sra' | 'lui'

/** 4-bit ALU control codes; first six follow the slides (The Processor). */
export const ALU_CODE: Record<AluFn, string> = {
  and: '0000', or: '0001', add: '0010', sub: '0110', slt: '0111', nor: '1100',
  xor: '0011', sltu: '1000', sll: '1001', srl: '1010', sra: '1011', lui: '1101',
}

export function aluControl(aluOp: number, ir: number): AluFn {
  if (aluOp === 0) return 'add'
  if (aluOp === 1) return 'sub'
  if (aluOp === 2) {
    switch (fFunct(ir)) {
      case 0x20: case 0x21: return 'add'
      case 0x22: case 0x23: return 'sub'
      case 0x24: return 'and'
      case 0x25: return 'or'
      case 0x26: return 'xor'
      case 0x27: return 'nor'
      case 0x2a: return 'slt'
      case 0x2b: return 'sltu'
      case 0x00: return 'sll'
      case 0x02: return 'srl'
      case 0x03: return 'sra'
      default: return 'add'
    }
  }
  switch (fOp(ir)) {
    case 0x0a: return 'slt'
    case 0x0b: return 'sltu'
    case 0x0c: return 'and'
    case 0x0d: return 'or'
    case 0x0e: return 'xor'
    case 0x0f: return 'lui'
    default: return 'add'
  }
}

export function alu(fn: AluFn, a: number, b: number, shamt: number): number {
  switch (fn) {
    case 'and': return (a & b) >>> 0
    case 'or': return (a | b) >>> 0
    case 'xor': return (a ^ b) >>> 0
    case 'nor': return ~(a | b) >>> 0
    case 'add': return (a + b) >>> 0
    case 'sub': return (a - b) >>> 0
    case 'slt': return (a | 0) < (b | 0) ? 1 : 0
    case 'sltu': return a >>> 0 < b >>> 0 ? 1 : 0
    case 'sll': return (b << shamt) >>> 0
    case 'srl': return b >>> shamt
    case 'sra': return (b >> shamt) >>> 0
    case 'lui': return (b << 16) >>> 0
  }
}
