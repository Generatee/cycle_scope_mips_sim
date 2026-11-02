// Multi-cycle MIPS CPU simulated at register-transfer level, one clock cycle per step().
import type { Program } from './assembler'
import {
  alu, aluControl, fullSignals, nextState, STATES, type AluFn, type Signals,
} from './control'
import {
  GP_INIT, SP_INIT, TEXT_BASE, fFunct, fImm, fOp, fRd, fRs, fRt, fShamt, fTarget, lookup, signExt16,
  type InstrClass,
} from './isa'
import { Memory } from './memory'

export interface MduState {
  mcand: number // multiplicand or divisor (uint32)
  hi: number // left half of Product/Remainder
  lo: number // right half
  count: number
  div: boolean
  signed: boolean
  negA: boolean // sign of first operand (dividend / multiplicand)
  negB: boolean
  active: boolean
  /** what the last step did, for the visualization */
  lastAction: string
}

/** Values on the main wires during a cycle (combinational, before the clock edge). */
export interface Wires {
  memAddr: number
  memData: number | null
  readData1: number
  readData2: number
  aluA: number
  aluB: number
  aluFn: AluFn
  aluResult: number
  zero: number
  signExt: number
  jumpAddr: number
  pcNext: number
  pcWrite: boolean
  writeReg: number
  writeData: number
}

export interface CycleTrace {
  cycle: number // 1-based cycle number of this trace
  state: number
  next: number
  signals: Signals
  wires: Wires
  ir: number
  instrPc: number // address of the instruction being executed
  changed: string[] // keys: pc, ir, mdr, a, b, aluOut, hi, lo, mdu, reg:N, mem:ADDR
  note?: string // syscall output etc.
}

export type CpuStatus = 'ready' | 'running' | 'halted' | 'error' | 'input'

interface Snapshot {
  pc: number; ir: number; mdr: number; a: number; b: number; aluOut: number; hi: number; lo: number
  state: number; instrPc: number; cycle: number; instrCount: number; halted: boolean; status: CpuStatus
  error: string; outLen: number; mdu: MduState; regs: Uint32Array; mem: [number, number][]
  stats: Stats; minSp: number; callDepth: number; maxCallDepth: number
}

export interface Stats {
  cycles: number
  instructions: number
  byClass: Record<InstrClass, { count: number; cycles: number }>
  calls: number
}

const emptyStats = (): Stats => ({
  cycles: 0,
  instructions: 0,
  byClass: {
    alu: { count: 0, cycles: 0 }, shift: { count: 0, cycles: 0 }, load: { count: 0, cycles: 0 },
    store: { count: 0, cycles: 0 }, branch: { count: 0, cycles: 0 }, jump: { count: 0, cycles: 0 },
    syscall: { count: 0, cycles: 0 }, muldiv: { count: 0, cycles: 0 }, mfhilo: { count: 0, cycles: 0 },
  },
  calls: 0,
})

const cloneStats = (s: Stats): Stats => {
  const byClass = {} as Stats['byClass']
  for (const k in s.byClass) {
    const c = s.byClass[k as InstrClass]
    byClass[k as InstrClass] = { count: c.count, cycles: c.cycles }
  }
  return { cycles: s.cycles, instructions: s.instructions, byClass, calls: s.calls }
}

export class CPU {
  mem = new Memory()
  regs = new Uint32Array(32)
  pc = TEXT_BASE
  ir = 0
  mdr = 0
  a = 0
  b = 0
  aluOut = 0
  hi = 0
  lo = 0
  state = 0
  mdu: MduState = this.freshMdu()
  instrPc = TEXT_BASE
  cycle = 0
  instrCount = 0
  status: CpuStatus = 'ready'
  error = ''
  output = ''
  textEnd = TEXT_BASE
  stats = emptyStats()
  minSp = SP_INIT
  callDepth = 0
  maxCallDepth = 0
  /** Provides input for read_int; return null to wait. */
  inputProvider: () => number | null = () => null
  keepHistory = true
  historyLimit = 200_000
  private history: Snapshot[] = []
  private memUndo: [number, number][] = []
  lastTrace: CycleTrace | null = null

  private freshMdu(): MduState {
    return { mcand: 0, hi: 0, lo: 0, count: 0, div: false, signed: false, negA: false, negB: false, active: false, lastAction: '' }
  }

  load(p: Program) {
    this.mem = new Memory()
    this.regs = new Uint32Array(32)
    this.regs[28] = GP_INIT
    this.regs[29] = SP_INIT
    for (const t of p.text) this.mem.writeWord(t.addr, t.word)
    p.data.forEach((v, i) => this.mem.writeByte(0x10010000 + i, v))
    this.textEnd = TEXT_BASE + p.text.length * 4
    this.pc = p.entry
    this.instrPc = p.entry
    this.ir = this.mdr = this.a = this.b = this.aluOut = this.hi = this.lo = 0
    this.state = 0
    this.mdu = this.freshMdu()
    this.cycle = 0
    this.instrCount = 0
    this.status = 'ready'
    this.error = ''
    this.output = ''
    this.stats = emptyStats()
    this.minSp = SP_INIT
    this.callDepth = 0
    this.maxCallDepth = 0
    this.history = []
    this.lastTrace = null
  }

  get done() {
    return this.status === 'halted' || this.status === 'error'
  }

  get canStepBack() {
    return this.history.length > 0
  }

  private snapshot(): Snapshot {
    return {
      pc: this.pc, ir: this.ir, mdr: this.mdr, a: this.a, b: this.b, aluOut: this.aluOut, hi: this.hi, lo: this.lo,
      state: this.state, instrPc: this.instrPc, cycle: this.cycle, instrCount: this.instrCount,
      halted: this.done, status: this.status, error: this.error, outLen: this.output.length,
      mdu: { ...this.mdu }, regs: this.regs.slice(), mem: [], stats: cloneStats(this.stats),
      minSp: this.minSp, callDepth: this.callDepth, maxCallDepth: this.maxCallDepth,
    }
  }

  stepBack(): boolean {
    const s = this.history.pop()
    if (!s) return false
    for (let i = s.mem.length - 1; i >= 0; i--) this.mem.writeWord(s.mem[i][0], s.mem[i][1])
    Object.assign(this, {
      pc: s.pc, ir: s.ir, mdr: s.mdr, a: s.a, b: s.b, aluOut: s.aluOut, hi: s.hi, lo: s.lo,
      state: s.state, instrPc: s.instrPc, cycle: s.cycle, instrCount: s.instrCount, status: s.status,
      error: s.error, mdu: s.mdu, regs: s.regs, stats: s.stats, minSp: s.minSp, callDepth: s.callDepth,
      maxCallDepth: s.maxCallDepth,
    })
    this.output = this.output.slice(0, s.outLen)
    this.lastTrace = null
    return true
  }

  private fail(msg: string) {
    this.status = 'error'
    this.error = msg
  }

  private writeMem(addr: number, v: number) {
    this.memUndo.push([addr, this.mem.readWord(addr)])
    this.mem.writeWord(addr, v)
  }

  /** Execute one clock cycle. Returns null if nothing happened (halted / waiting for input). */
  step(): CycleTrace | null {
    if (this.done) return null
    const state = this.state

    // Program end: PC ran past the last instruction (like MARS "dropped off bottom")
    if (state === 0 && (this.pc >= this.textEnd || this.pc < TEXT_BASE)) {
      this.status = 'halted'
      this.error = ''
      return null
    }

    const snap = this.keepHistory ? this.snapshot() : null
    this.memUndo = []
    const sig = fullSignals(state)
    const ir = this.ir
    const changed: string[] = []
    let note: string | undefined

    // ---------- combinational logic ----------
    const memAddr = sig.IorD ? this.aluOut : this.pc
    let memData: number | null = null
    if (sig.MemRead || sig.MemWrite) {
      if (memAddr & 3) {
        this.fail(`Unaligned memory address ${memAddr.toString(16)} at PC ${this.instrPc.toString(16)}`)
        return null
      }
    }
    if (sig.MemRead) memData = this.mem.readWord(memAddr)
    const rs = fRs(ir), rt = fRt(ir), rd = fRd(ir)
    const readData1 = this.regs[rs]
    const readData2 = this.regs[rt]
    const imm = fImm(ir)
    const se = signExt16(imm) >>> 0
    const aluA = sig.ALUSrcA ? this.a : this.pc
    const aluB = [this.b, 4, se, (se << 2) >>> 0, imm][sig.ALUSrcB]
    const aluFn = aluControl(sig.ALUOp, ir)
    const aluResult = alu(aluFn, aluA, aluB, fShamt(ir))
    const zero = aluResult === 0 ? 1 : 0
    const jumpAddr = ((this.pc & 0xf0000000) | (fTarget(ir) << 2)) >>> 0
    const pcNext = [aluResult, this.aluOut, jumpAddr, this.a][sig.PCSource]
    const pcWrite = !!(sig.PCWrite || (sig.PCWriteCond && zero) || (sig.PCWriteCondNE && !zero))
    const writeReg = [rt, rd, 31][sig.RegDst]
    const writeData = [this.aluOut, this.mdr, this.pc, this.hi, this.lo][sig.MemtoReg]

    // next state (uses current IR; Decode dispatch uses IR loaded in Fetch)
    const irForNext = sig.IRWrite && memData !== null ? memData : ir

    // ---------- clock edge ----------
    if (state === 0) {
      this.instrPc = this.pc
      this.instrCount++
      this.stats.instructions++
    }
    if (sig.MemWrite) {
      this.writeMem(memAddr, this.b)
      changed.push('mem:' + memAddr)
    }
    if (sig.IRWrite && memData !== null) {
      this.ir = memData
      changed.push('ir')
    }
    if (sig.MemRead && memData !== null && !sig.IRWrite) {
      this.mdr = memData
      changed.push('mdr')
    }
    if (this.a !== readData1) changed.push('a')
    if (this.b !== readData2) changed.push('b')
    this.a = readData1
    this.b = readData2
    if (this.aluOut !== aluResult) changed.push('aluOut')
    this.aluOut = aluResult
    if (pcWrite) {
      if (this.pc !== pcNext) changed.push('pc')
      this.pc = pcNext
    }
    if (sig.RegWrite && writeReg !== 0) {
      if (this.regs[writeReg] !== writeData) changed.push('reg:' + writeReg)
      this.regs[writeReg] = writeData
      if (writeReg === 29) this.minSp = Math.min(this.minSp, writeData)
    }

    // MDU
    if (sig.MDUOp) {
      this.mduClock(sig.MDUOp, ir, readData1, readData2)
      changed.push('mdu')
      if (sig.MDUOp === 3) changed.push('hi', 'lo')
    }

    // Syscall
    if (state === 16) {
      const r = this.syscall()
      if (r === 'wait') {
        // no clock edge happened: restore and wait for input
        this.status = 'input'
        if (snap) Object.assign(this, { a: snap.a, b: snap.b, aluOut: snap.aluOut })
        return null
      }
      note = r ?? undefined
    }

    this.cycle++
    this.stats.cycles++

    let next = this.status === 'error' ? state : nextState(state, irForNext, this.mdu.count === 0)
    if (next === -1) {
      this.fail(`Unsupported instruction 0x${irForNext.toString(16).padStart(8, '0')} at PC 0x${this.instrPc.toString(16)}`)
      next = state
    }
    if (next === 0 && this.status !== 'error') {
      // instruction completed: account its cycles
      const d = lookup(this.ir)
      if (d) {
        const c = this.stats.byClass[d.cls]
        c.count++
        if (d.name === 'jal') {
          this.stats.calls++
          this.callDepth++
          this.maxCallDepth = Math.max(this.maxCallDepth, this.callDepth)
        }
        if (d.name === 'jr' && fRs(this.ir) === 31) this.callDepth = Math.max(0, this.callDepth - 1)
      }
    }
    // cycles per class accounted per cycle (fetch/decode attributed to the fetched instruction)
    const dNow = lookup(state === 0 ? irForNext : this.ir)
    if (dNow) this.stats.byClass[dNow.cls].cycles++

    if ((this.status as CpuStatus) === 'input') this.status = 'running'
    this.state = next

    if (snap) {
      snap.mem = this.memUndo
      this.history.push(snap)
      if (this.history.length > this.historyLimit) this.history.splice(0, 10000)
    }

    const trace: CycleTrace = {
      cycle: this.cycle,
      state,
      next,
      signals: sig,
      wires: {
        memAddr, memData, readData1, readData2, aluA, aluB, aluFn, aluResult, zero, signExt: se,
        jumpAddr, pcNext, pcWrite, writeReg, writeData,
      },
      ir: state === 0 ? this.ir : ir,
      instrPc: this.instrPc,
      changed,
      note,
    }
    this.lastTrace = trace
    return trace
  }

  private mduClock(op: number, ir: number, aVal: number, bVal: number) {
    const m = this.mdu
    if (op === 1) {
      const isMul = fOp(ir) === 0x1c
      const f = fFunct(ir)
      m.div = !isMul && (f === 0x1a || f === 0x1b)
      m.signed = isMul || f === 0x18 || f === 0x1a
      // A/B hold rs/rt (loaded in Decode)
      const x = this.a, y = this.b
      void aVal; void bVal
      m.negA = m.signed && (x | 0) < 0
      m.negB = m.signed && (y | 0) < 0
      const absX = m.negA ? (-(x | 0)) >>> 0 : x >>> 0
      const absY = m.negB ? (-(y | 0)) >>> 0 : y >>> 0
      if (m.div) {
        m.mcand = absY // divisor
        m.hi = 0
        m.lo = absX // dividend
      } else {
        m.mcand = absX // multiplicand
        m.hi = 0
        m.lo = absY // multiplier in right half of Product
      }
      m.count = 32
      m.active = true
      m.lastAction = m.div ? 'load Divisor, Remainder = {0, dividend}' : 'load Multiplicand, Product = {0, multiplier}'
    } else if (op === 2) {
      if (!m.div) {
        if (m.lo & 1) {
          const sum = m.hi + m.mcand
          const carry = sum > 0xffffffff ? 1 : 0
          const hi = sum >>> 0
          m.lo = ((m.lo >>> 1) | ((hi & 1) << 31)) >>> 0
          m.hi = ((hi >>> 1) | (carry << 31)) >>> 0
          m.lastAction = 'Product[0] = 1 → add Multiplicand, shift right'
        } else {
          m.lo = ((m.lo >>> 1) | ((m.hi & 1) << 31)) >>> 0
          m.hi = m.hi >>> 1
          m.lastAction = 'Product[0] = 0 → shift right'
        }
      } else {
        let hiN = m.hi * 2 + (m.lo >>> 31)
        let lo = (m.lo << 1) >>> 0
        if (hiN >= m.mcand) {
          hiN -= m.mcand
          lo = (lo | 1) >>> 0
          m.lastAction = 'shift left; Remainder ≥ Divisor → subtract, quotient bit = 1'
        } else {
          m.lastAction = 'shift left; Remainder < Divisor → quotient bit = 0'
        }
        m.hi = hiN % 0x100000000
        m.lo = lo
      }
      m.count--
    } else if (op === 3) {
      let hi = m.hi, lo = m.lo
      if (!m.div) {
        if (m.negA !== m.negB) {
          lo = (~lo + 1) >>> 0
          hi = (~hi + (lo === 0 ? 1 : 0)) >>> 0
        }
      } else {
        let q = lo, r = hi
        if (m.negA !== m.negB) q = (-(q | 0)) >>> 0
        if (m.negA) r = (-(r | 0)) >>> 0
        lo = q
        hi = r
      }
      this.hi = hi >>> 0
      this.lo = lo >>> 0
      m.active = false
      m.lastAction = m.signed ? 'fix sign, write HI/LO' : 'write HI/LO'
    }
  }

  private syscall(): string | null | 'wait' {
    const v0 = this.regs[2] | 0
    const a0 = this.regs[4]
    switch (v0) {
      case 1: {
        const s = String(a0 | 0)
        this.output += s
        return s
      }
      case 4: {
        const s = this.mem.readString(a0)
        this.output += s
        return s
      }
      case 11: {
        const s = String.fromCharCode(a0 & 255)
        this.output += s
        return s
      }
      case 5: {
        const v = this.inputProvider()
        if (v === null) return 'wait'
        this.regs[2] = v >>> 0
        this.output += String(v) + '\n'
        return `read ${v}`
      }
      case 10:
        this.status = 'halted'
        return 'exit'
      default:
        this.fail(`Unknown syscall $v0 = ${v0}`)
        return null
    }
  }

  /** Run until halted/error/input or limit reached. Returns cycles executed. */
  run(maxCycles = 10_000_000): number {
    const start = this.cycle
    if (this.status === 'input') this.status = 'running'
    while (!this.done && (this.status as CpuStatus) !== 'input' && this.cycle - start < maxCycles) {
      if (!this.step()) break
    }
    return this.cycle - start
  }

  /** Run until the current instruction finishes (back to Fetch). */
  stepInstruction(): CycleTrace | null {
    let t = this.step()
    while (t && this.state !== 0 && !this.done && this.status !== 'input') t = this.step()
    return t
  }

  get stateInfo() {
    return STATES[this.state]
  }
}
