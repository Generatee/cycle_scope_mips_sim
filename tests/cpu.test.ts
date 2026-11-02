import { describe, expect, it } from 'vitest'
import { assemble } from '../src/core/assembler'
import { CPU } from '../src/core/cpu'
import { PROGRAMS, renderProgram, defaultParams } from '../src/programs'

function runSrc(src: string, keepHistory = false) {
  const p = assemble(src)
  expect(p.errors).toEqual([])
  const cpu = new CPU()
  cpu.keepHistory = keepHistory
  cpu.load(p)
  cpu.run(50_000_000)
  expect(cpu.error).toBe('')
  return cpu
}

/** cycles taken by a single instruction placed alone in a program */
function cyclesOf(instr: string, setup = '') {
  const base = runSrc(`main: ${setup || 'nop'}\n`)
  const with1 = runSrc(`main: ${setup || 'nop'}\n ${instr}\n`)
  return with1.cycle - base.cycle
}

describe('cycle counts per instruction class', () => {
  const cases: [string, number][] = [
    ['add $t0, $t1, $t2', 4],
    ['sll $t0, $t1, 2', 4],
    ['addi $t0, $t0, 5', 4],
    ['ori $t0, $t0, 5', 4],
    ['lui $t0, 5', 4],
    ['lw $t0, 0($sp)', 5],
    ['sw $t0, 0($sp)', 4],
    ['beq $t0, $t1, x\nx:', 3],
    ['bne $t0, $t1, x\nx:', 3],
    ['j x\nx:', 3],
    ['mult $t0, $t1', 36],
    ['div $t0, $t1', 36],
    ['mul $t0, $t1, $t2', 37],
    ['mfhi $t0', 3],
    ['mflo $t0', 3],
  ]
  for (const [i, c] of cases) it(i.split('\n')[0], () => expect(cyclesOf(i)).toBe(c))
})

describe('instruction semantics', () => {
  it('ALU and immediates', () => {
    const c = runSrc(`main:
      li $t0, -7
      li $t1, 3
      add $s0, $t0, $t1
      sub $s1, $t0, $t1
      slt $s2, $t0, $t1
      sltu $s3, $t0, $t1
      sra $s4, $t0, 1
      srl $s5, $t0, 28
      andi $s6, $t0, 0xff
      lui $s7, 0x1234
      ori $s7, $s7, 0x5678
      nor $t8, $t0, $zero
      xori $t9, $t1, 1`)
    const r = (n: number) => c.regs[n] | 0
    expect(r(16)).toBe(-4)
    expect(r(17)).toBe(-10)
    expect(r(18)).toBe(1)
    expect(r(19)).toBe(0)
    expect(r(20)).toBe(-4)
    expect(r(21)).toBe(15)
    expect(r(22)).toBe(0xf9)
    expect(c.regs[23]).toBe(0x12345678)
    expect(r(24)).toBe(6)
    expect(r(25)).toBe(2)
  })

  it('jal / jr and stack', () => {
    const c = runSrc(`main: jal f
      li $t1, 9
      li $v0, 10
      syscall
      f: li $t0, 7
      jr $ra`)
    expect(c.regs[8]).toBe(7)
    expect(c.regs[9]).toBe(9)
    expect(c.regs[31]).toBe(0x00400004)
  })

  it('MDU matches BigInt for random operands', () => {
    const vals = [0, 1, -1, 2, -2, 7, -7, 0x7fffffff, -0x80000000, 123456789, -987654321, 65535]
    let seed = 42
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) | 0), seed)
    for (let i = 0; i < 300; i++) vals.push(rnd())
    for (let i = 0; i < vals.length; i++) {
      const x = vals[i] | 0
      const y = vals[(i * 7 + 3) % vals.length] | 0
      const c = runSrc(`main: li $t0, ${x}\n li $t1, ${y}\n mult $t0, $t1\n mfhi $s0\n mflo $s1\n multu $t0, $t1\n mfhi $s2\n mflo $s3\n` +
        (y !== 0 ? ` div $t0, $t1\n mfhi $s4\n mflo $s5\n divu $t0, $t1\n mfhi $s6\n mflo $s7\n` : ''))
      const ps = BigInt(x) * BigInt(y)
      const pu = BigInt(x >>> 0) * BigInt(y >>> 0)
      const mask = (1n << 32n) - 1n
      expect(c.regs[16]).toBe(Number((ps >> 32n) & mask))
      expect(c.regs[17]).toBe(Number(ps & mask))
      expect(c.regs[18]).toBe(Number((pu >> 32n) & mask))
      expect(c.regs[19]).toBe(Number(pu & mask))
      if (y !== 0 && !(x === -0x80000000 && y === -1)) {
        expect(c.regs[20] | 0, `${x} % ${y}`).toBe(Number(BigInt(x) % BigInt(y)))
        expect(c.regs[21] | 0, `${x} / ${y}`).toBe(Number(BigInt(x) / BigInt(y)))
        expect(c.regs[22]).toBe((x >>> 0) % (y >>> 0))
        expect(c.regs[23]).toBe(Math.floor((x >>> 0) / (y >>> 0)))
      }
    }
  })

  it('step back restores everything', () => {
    const p = assemble(PROGRAMS.find((x) => x.id === 'factorial_rec')!.template.replace('{N}', '4'))
    const c = new CPU()
    c.load(p)
    for (let i = 0; i < 150; i++) c.step()
    const regs = c.regs.slice()
    const pc = c.pc
    const st = c.state
    const memWord = c.mem.readWord(c.regs[29])
    for (let i = 0; i < 40; i++) c.step()
    for (let i = 0; i < 40; i++) c.stepBack()
    expect([...c.regs]).toEqual([...regs])
    expect(c.pc).toBe(pc)
    expect(c.state).toBe(st)
    expect(c.mem.readWord(c.regs[29])).toBe(memWord)
    expect(c.cycle).toBe(150)
  })

  it('waits for read_int input', () => {
    const p = assemble('main: li $v0, 5\n syscall\n move $a0, $v0\n li $v0, 1\n syscall')
    const c = new CPU()
    c.load(p)
    c.run()
    expect(c.status).toBe('input')
    c.inputProvider = () => 42
    c.run()
    expect(c.output).toBe('42\n42')
  })
})

describe('example programs', () => {
  for (const prog of PROGRAMS) {
    it(prog.id, () => {
      const params = defaultParams(prog)
      const c = runSrc(renderProgram(prog, params))
      expect(c.status).toBe('halted')
      if (prog.expected) expect(c.output).toBe(prog.expected(params))
    })
  }
  it('bigger inputs', () => {
    const get = (id: string) => PROGRAMS.find((x) => x.id === id)!
    expect(runSrc(renderProgram(get('factorial_rec'), { N: 12 })).output).toBe('n! = 479001600')
    expect(runSrc(renderProgram(get('factorial_shiftadd'), { N: 10 })).output).toBe('n! = 3628800')
    expect(runSrc(renderProgram(get('ncr_rec'), { N: 16, R: 8 })).output).toBe('C(n, r) = 12870')
    expect(runSrc(renderProgram(get('ncr_dp'), { N: 16, R: 8 })).output).toBe('C(n, r) = 12870')
    expect(runSrc(renderProgram(get('ncr_muldiv'), { N: 16, R: 8 })).output).toBe('C(n, r) = 12870')
    expect(runSrc(renderProgram(get('fib_rec'), { N: 20 })).output).toBe('fib(n) = 6765')
  })
})
