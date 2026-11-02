import { describe, expect, it } from 'vitest'
import { assemble } from '../src/core/assembler'
import { decode, disassemble } from '../src/core/disassembler'
import { INSTRUCTIONS, TEXT_BASE, DATA_BASE } from '../src/core/isa'

const one = (src: string) => {
  const p = assemble(`main: ${src}`)
  expect(p.errors).toEqual([])
  return p.text.map((t) => t.word >>> 0)
}

describe('assembler encodings (checked against MARS)', () => {
  const cases: [string, number][] = [
    ['add $t0, $t1, $t2', 0x012a4020],
    ['sub $s0, $s1, $s2', 0x02328022],
    ['and $t0, $t1, $t2', 0x012a4024],
    ['or $t0, $t1, $t2', 0x012a4025],
    ['slt $t0, $t1, $t2', 0x012a402a],
    ['addi $t0, $t0, -1', 0x2108ffff],
    ['addiu $sp, $sp, -8', 0x27bdfff8],
    ['slti $t0, $a0, 1', 0x28880001],
    ['ori $t0, $zero, 65535', 0x3408ffff],
    ['andi $t0, $t1, 0xff', 0x312800ff],
    ['lui $at, 0x1001', 0x3c011001],
    ['lw $t0, 4($sp)', 0x8fa80004],
    ['sw $ra, 0($sp)', 0xafbf0000],
    ['sll $t0, $t1, 2', 0x00094080],
    ['srl $t0, $t1, 1', 0x00094042],
    ['sra $t0, $t1, 3', 0x000940c3],
    ['jr $ra', 0x03e00008],
    ['syscall', 0x0000000c],
    ['mult $s1, $s2', 0x02320018],
    ['multu $s1, $s2', 0x02320019],
    ['div $t0, $t1', 0x0109001a],
    ['divu $t0, $t1', 0x0109001b],
    ['mfhi $s3', 0x00009810],
    ['mflo $s4', 0x0000a012],
    ['mul $t0, $t1, $t2', 0x712a4002],
    ['nop', 0x00000000],
  ]
  for (const [src, word] of cases) {
    it(src, () => expect(one(src)).toEqual([word]))
  }

  it('j / jal / branches', () => {
    const p = assemble('main: j main\njal main\nloop: beq $t0, $zero, loop\nbne $t0, $t1, main')
    expect(p.errors).toEqual([])
    expect(p.text.map((t) => t.word)).toEqual([0x08100000, 0x0c100000, 0x1100ffff, 0x1509fffc])
  })

  it('pseudo-instructions', () => {
    expect(one('li $t0, 5')).toEqual([0x24080005])
    expect(one('li $t0, -5')).toEqual([0x2408fffb])
    expect(one('li $s1, 0xfffffffb')).toEqual([0x3c01ffff, 0x3431fffb])
    expect(one('li $t0, 0x12345678')).toEqual([0x3c011234, 0x34285678])
    expect(one('move $a0, $s0')).toEqual([0x00102021])
    const p = assemble('.data\nmsg: .asciiz "hi"\n.text\nmain: la $a0, msg\nblt $t0, $t1, main')
    expect(p.errors).toEqual([])
    expect(p.text.map((t) => t.word)).toEqual([0x3c011001, 0x34240000, 0x0109082a, 0x1420fffc])
  })

  it('data directives', () => {
    const p = assemble('.data\na: .byte 1\nb: .word 7, a\nc: .space 3\nd: .asciiz "A"\n.text\nmain: lw $t0, b')
    expect(p.errors).toEqual([])
    expect(p.symbols.get('b')).toBe(DATA_BASE + 4)
    expect([...p.data.slice(4, 12)]).toEqual([7, 0, 0, 0, 0, 0, 0x01, 0x10])
    expect(p.symbols.get('d')).toBe(DATA_BASE + 15)
    expect(p.text.map((t) => t.word)).toEqual([0x3c011001, 0x8c280004])
  })

  it('reports errors with line numbers', () => {
    const p = assemble('main:\n  add $t0, $t1\n  foo $t0\n  beq $t0, $t1, nowhere\n  addi $t0, $t0, 40000')
    expect(p.errors.map((e) => e.line)).toEqual([2, 3, 4, 5])
  })
})

describe('disassembler', () => {
  it('round-trips every instruction', () => {
    for (const d of INSTRUCTIONS) {
      let src: string
      switch (d.syntax) {
        case 'rd,rs,rt': src = `${d.name} $t0, $t1, $t2`; break
        case 'rd,rt,shamt': src = `${d.name} $t0, $t1, 3`; break
        case 'rs': src = `${d.name} $ra`; break
        case 'rd': src = `${d.name} $t0`; break
        case 'rs,rt': src = `${d.name} $t0, $t1`; break
        case 'none': src = d.name; break
        case 'rt,rs,imm': src = `${d.name} $t0, $t1, 12`; break
        case 'rt,imm': src = `${d.name} $t0, 12`; break
        case 'rt,off(rs)': src = `${d.name} $t0, -8($sp)`; break
        case 'rs,rt,label': src = `${d.name} $t0, $t1, main`; break
        case 'label': src = `${d.name} main`; break
      }
      const w = one(src)[0]
      const back = decode(w, TEXT_BASE).text
      const w2 = assemble(`main: ${back.replace(/0x00400000/, 'main')}`).text[0].word
      expect(w2 >>> 0, `${src} -> ${back}`).toBe(w)
    }
  })

  it('creates labels', () => {
    const lines = disassemble([0x1100ffff, 0x08100000], TEXT_BASE)
    expect(lines[0].label).toBe('L1')
    expect(lines[0].text).toBe('beq $t0, $zero, L1')
    expect(lines[1].text).toBe('j L1')
  })
})
