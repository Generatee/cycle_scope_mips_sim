// Example / benchmark programs. Sources are templates: {N} and {R} are replaced by parameters.

export interface ProgramDef {
  id: string
  title: string
  description: string
  params: { key: 'N' | 'R'; label: string; default: number; min: number; max: number }[]
  template: string
  /** expected console output for the parameters (for tests and the benchmark check) */
  expected?: (p: Record<string, number>) => string
}

const fact = (n: number) => { let r = 1; for (let i = 2; i <= n; i++) r = Math.imul(r, i) | 0; return r }
const ncr = (n: number, r: number) => { let c = 1; for (let i = 0; i < r; i++) c = (c * (n - i)) / (i + 1); return c }
const fib = (n: number) => { let a = 0, b = 1; for (let i = 0; i < n; i++) [a, b] = [b, a + b]; return a }

const PRINT_V = (label: string) => `
        la    $a0, ${label}
        li    $v0, 4          # print_string
        syscall`

export const PROGRAMS: ProgramDef[] = [
  {
    id: 'hello',
    title: 'Hello + บวกเลข',
    description: 'โปรแกรมสั้นสำหรับดู Fetch / Decode / R-type / lw / sw ทีละ state',
    params: [],
    template: `# Hello CycleScope: ใช้ดูการทำงานทีละ state
        .data
msg:    .asciiz "Hello, CycleScope! 2 + 3 = "
x:      .word 2
y:      .word 3
z:      .word 0
        .text
main:   lw    $t0, x          # lw  : 5 cycle
        lw    $t1, y
        add   $t2, $t0, $t1   # add : 4 cycle
        sw    $t2, z          # sw  : 4 cycle
${PRINT_V('msg')}
        move  $a0, $t2
        li    $v0, 1          # print_int
        syscall
        li    $v0, 10         # exit
        syscall
`,
    expected: () => 'Hello, CycleScope! 2 + 3 = 5',
  },
  {
    id: 'mult_signed',
    title: 'mult vs multu (Hand-On จากสไลด์)',
    description: '0xfffffffb × 2: signed = −5 × 2, unsigned = 4,294,967,291 × 2 ดู Product register เลื่อนทีละ cycle',
    params: [],
    template: `# Hand-On: Signed vs Unsigned Multiplication (สไลด์ Arithmetic for Computers)
        .data
m1:     .asciiz "mult : HI = "
m2:     .asciiz "multu: HI = "
lo:     .asciiz ", LO = "
nl:     .asciiz "\\n"
        .text
main:   li    $s1, 0xfffffffb   # -5 (signed) / 4,294,967,291 (unsigned)
        li    $s2, 0x00000002
        mult  $s1, $s2          # 36 cycle
        mfhi  $s3
        mflo  $s4
${PRINT_V('m1')}
        move  $a0, $s3
        li    $v0, 1
        syscall
${PRINT_V('lo')}
        move  $a0, $s4
        li    $v0, 1
        syscall
${PRINT_V('nl')}
        multu $s1, $s2
        mfhi  $s3
        mflo  $s4
${PRINT_V('m2')}
        move  $a0, $s3
        li    $v0, 1
        syscall
${PRINT_V('lo')}
        move  $a0, $s4
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
`,
    expected: () => 'mult : HI = -1, LO = -10\nmultu: HI = 1, LO = -10',
  },
  {
    id: 'factorial_loop',
    title: 'Factorial (loop)',
    description: 'n! ด้วย loop และ mul (MDU 37 cycle ต่อครั้ง)',
    params: [{ key: 'N', label: 'n', default: 5, min: 0, max: 12 }],
    template: `# n! แบบ loop
        .data
msg:    .asciiz "n! = "
        .text
main:   li    $a0, {N}        # n
        li    $v1, 1          # result = 1
        li    $t0, 1          # i = 1
loop:   bgt   $t0, $a0, done  # while (i <= n)
        mul   $v1, $v1, $t0   #   result = result * i
        addi  $t0, $t0, 1     #   i++
        j     loop
done:
${PRINT_V('msg')}
        move  $a0, $v1
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
`,
    expected: (p) => `n! = ${fact(p.N)}`,
  },
  {
    id: 'factorial_rec',
    title: 'Factorial (recursive)',
    description: 'n! แบบ recursive ใช้ stack frame, jal/jr และ mul',
    params: [{ key: 'N', label: 'n', default: 5, min: 0, max: 12 }],
    template: `# n! แบบ recursive (ตามตัวอย่าง P&H)
        .data
msg:    .asciiz "n! = "
        .text
main:   li    $a0, {N}
        jal   fact
        move  $s0, $v0
${PRINT_V('msg')}
        move  $a0, $s0
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall

# int fact(int n)
fact:   addi  $sp, $sp, -8    # สร้าง stack frame 2 word
        sw    $ra, 4($sp)     # save return address
        sw    $a0, 0($sp)     # save n
        slti  $t0, $a0, 2     # n < 2 ?
        beq   $t0, $zero, rec
        li    $v0, 1          # return 1
        addi  $sp, $sp, 8
        jr    $ra
rec:    addi  $a0, $a0, -1
        jal   fact            # fact(n - 1)
        lw    $a0, 0($sp)     # restore n
        lw    $ra, 4($sp)
        addi  $sp, $sp, 8
        mul   $v0, $a0, $v0   # n * fact(n - 1)
        jr    $ra
`,
    expected: (p) => `n! = ${fact(p.N)}`,
  },
  {
    id: 'factorial_shiftadd',
    title: 'Factorial (recursive, คูณด้วยซอฟต์แวร์)',
    description: 'เหมือน factorial_rec แต่ไม่ใช้ mul: คูณด้วย subroutine shift-and-add',
    params: [{ key: 'N', label: 'n', default: 5, min: 0, max: 12 }],
    template: `# n! แบบ recursive คูณด้วย shift-and-add (ไม่ใช้ MDU)
        .data
msg:    .asciiz "n! = "
        .text
main:   li    $a0, {N}
        jal   fact
        move  $s0, $v0
${PRINT_V('msg')}
        move  $a0, $s0
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall

fact:   addi  $sp, $sp, -8
        sw    $ra, 4($sp)
        sw    $a0, 0($sp)
        slti  $t0, $a0, 2
        beq   $t0, $zero, rec
        li    $v0, 1
        addi  $sp, $sp, 8
        jr    $ra
rec:    addi  $a0, $a0, -1
        jal   fact
        lw    $a1, 0($sp)     # a1 = n (ตัวคูณ)
        move  $a0, $v0        # a0 = fact(n - 1)
        jal   smul            # v0 = a0 * a1
        lw    $ra, 4($sp)
        addi  $sp, $sp, 8
        jr    $ra

# v0 = a0 * a1 แบบ shift-and-add (Approach 1 ในซอฟต์แวร์)
smul:   li    $v0, 0
sm_lp:  beq   $a1, $zero, sm_end
        andi  $t1, $a1, 1
        beq   $t1, $zero, sm_sk
        addu  $v0, $v0, $a0
sm_sk:  sll   $a0, $a0, 1
        srl   $a1, $a1, 1
        j     sm_lp
sm_end: jr    $ra
`,
    expected: (p) => `n! = ${fact(p.N)}`,
  },
  {
    id: 'ncr_rec',
    title: 'nCr (recursive)',
    description: 'C(n, r) = C(n−1, r−1) + C(n−1, r) จำนวนการเรียกโตแบบ exponential',
    params: [
      { key: 'N', label: 'n', default: 6, min: 0, max: 16 },
      { key: 'R', label: 'r', default: 3, min: 0, max: 16 },
    ],
    template: `# nCr แบบ recursive
        .data
msg:    .asciiz "C(n, r) = "
        .text
main:   li    $a0, {N}        # n
        li    $a1, {R}        # r
        jal   ncr
        move  $s0, $v0
${PRINT_V('msg')}
        move  $a0, $s0
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall

# int ncr(int n, int r)
ncr:    beq   $a1, $zero, one # r == 0
        beq   $a1, $a0, one   # r == n
        addi  $sp, $sp, -16
        sw    $ra, 12($sp)
        sw    $a0, 8($sp)
        sw    $a1, 4($sp)
        addi  $a0, $a0, -1
        addi  $a1, $a1, -1
        jal   ncr             # C(n-1, r-1)
        sw    $v0, 0($sp)
        lw    $a0, 8($sp)
        lw    $a1, 4($sp)
        addi  $a0, $a0, -1
        jal   ncr             # C(n-1, r)
        lw    $t0, 0($sp)
        add   $v0, $v0, $t0
        lw    $ra, 12($sp)
        addi  $sp, $sp, 16
        jr    $ra
one:    li    $v0, 1
        jr    $ra
`,
    expected: (p) => `C(n, r) = ${ncr(p.N, p.R)}`,
  },
  {
    id: 'ncr_dp',
    title: 'nCr (DP / Pascal)',
    description: 'C(n, r) ด้วย Pascal\'s triangle ใน array 1 มิติ (n² ขั้น)',
    params: [
      { key: 'N', label: 'n', default: 6, min: 0, max: 30 },
      { key: 'R', label: 'r', default: 3, min: 0, max: 30 },
    ],
    template: `# nCr ด้วย Pascal's triangle
        .data
msg:    .asciiz "C(n, r) = "
        .align 2
row:    .space 128            # row[0..r]
        .text
main:   li    $s0, {N}        # n
        li    $s1, {R}        # r
        la    $s2, row
        li    $t0, 1
        sw    $t0, 0($s2)     # row[0] = 1
        li    $t1, 1          # i = 1
iloop:  bgt   $t1, $s0, idone
        move  $t2, $t1        # j = min(i, r)
        ble   $t2, $s1, jloop
        move  $t2, $s1
jloop:  beq   $t2, $zero, jdone
        sll   $t3, $t2, 2
        add   $t3, $t3, $s2   # &row[j]
        lw    $t4, 0($t3)
        lw    $t5, -4($t3)
        add   $t4, $t4, $t5   # row[j] += row[j-1]
        sw    $t4, 0($t3)
        addi  $t2, $t2, -1
        j     jloop
jdone:  addi  $t1, $t1, 1
        j     iloop
idone:
${PRINT_V('msg')}
        sll   $t3, $s1, 2
        add   $t3, $t3, $s2
        lw    $a0, 0($t3)
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
`,
    expected: (p) => `C(n, r) = ${ncr(p.N, p.R)}`,
  },
  {
    id: 'ncr_muldiv',
    title: 'nCr (สูตร mul/div)',
    description: 'c = c × (n − i) / (i + 1) คำสั่งน้อยแต่ใช้ MDU ทุกรอบ',
    params: [
      { key: 'N', label: 'n', default: 6, min: 0, max: 30 },
      { key: 'R', label: 'r', default: 3, min: 0, max: 30 },
    ],
    template: `# nCr ด้วยสูตร c = c * (n - i) / (i + 1)
        .data
msg:    .asciiz "C(n, r) = "
        .text
main:   li    $s0, {N}        # n
        li    $s1, {R}        # r
        li    $v1, 1          # c = 1
        li    $t0, 0          # i = 0
loop:   beq   $t0, $s1, done
        sub   $t1, $s0, $t0   # n - i
        mul   $v1, $v1, $t1   # c = c * (n - i)
        addi  $t2, $t0, 1     # i + 1
        div   $v1, $t2        # LO = c / (i + 1)
        mflo  $v1
        addi  $t0, $t0, 1
        j     loop
done:
${PRINT_V('msg')}
        move  $a0, $v1
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
`,
    expected: (p) => `C(n, r) = ${ncr(p.N, p.R)}`,
  },
  {
    id: 'fib_rec',
    title: 'Fibonacci (recursive)',
    description: 'fib(n) = fib(n−1) + fib(n−2)',
    params: [{ key: 'N', label: 'n', default: 10, min: 0, max: 24 }],
    template: `# Fibonacci แบบ recursive
        .data
msg:    .asciiz "fib(n) = "
        .text
main:   li    $a0, {N}
        jal   fib
        move  $s0, $v0
${PRINT_V('msg')}
        move  $a0, $s0
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall

fib:    slti  $t0, $a0, 2
        beq   $t0, $zero, frec
        move  $v0, $a0        # fib(0)=0, fib(1)=1
        jr    $ra
frec:   addi  $sp, $sp, -12
        sw    $ra, 8($sp)
        sw    $a0, 4($sp)
        addi  $a0, $a0, -1
        jal   fib             # fib(n-1)
        sw    $v0, 0($sp)
        lw    $a0, 4($sp)
        addi  $a0, $a0, -2
        jal   fib             # fib(n-2)
        lw    $t0, 0($sp)
        add   $v0, $v0, $t0
        lw    $ra, 8($sp)
        addi  $sp, $sp, 12
        jr    $ra
`,
    expected: (p) => `fib(n) = ${fib(p.N)}`,
  },
  {
    id: 'fib_loop',
    title: 'Fibonacci (loop)',
    description: 'fib(n) แบบวนลูป',
    params: [{ key: 'N', label: 'n', default: 10, min: 0, max: 46 }],
    template: `# Fibonacci แบบ loop
        .data
msg:    .asciiz "fib(n) = "
        .text
main:   li    $t0, {N}        # n
        li    $t1, 0          # a = 0
        li    $t2, 1          # b = 1
loop:   beq   $t0, $zero, done
        add   $t3, $t1, $t2   # t = a + b
        move  $t1, $t2        # a = b
        move  $t2, $t3        # b = t
        addi  $t0, $t0, -1
        j     loop
done:
${PRINT_V('msg')}
        move  $a0, $t1
        li    $v0, 1
        syscall
        li    $v0, 10
        syscall
`,
    expected: (p) => `fib(n) = ${fib(p.N)}`,
  },
  {
    id: 'bubble_sort',
    title: 'Bubble sort',
    description: 'เรียง array 10 ตัวใน .data ใช้ lw/sw เยอะ',
    params: [],
    template: `# Bubble sort 10 ตัว
        .data
arr:    .word 64, 25, 12, 22, 11, 90, 3, 47, 5, 31
len:    .word 10
sp_:    .asciiz " "
        .text
main:   la    $s0, arr
        lw    $s1, len        # n
        addi  $t0, $s1, -1    # i = n - 1
outer:  beq   $t0, $zero, print
        li    $t1, 0          # j = 0
        move  $t2, $s0        # p = &arr[0]
inner:  beq   $t1, $t0, next
        lw    $t3, 0($t2)
        lw    $t4, 4($t2)
        slt   $t5, $t4, $t3   # arr[j+1] < arr[j] ?
        beq   $t5, $zero, noswap
        sw    $t4, 0($t2)
        sw    $t3, 4($t2)
noswap: addi  $t1, $t1, 1
        addi  $t2, $t2, 4
        j     inner
next:   addi  $t0, $t0, -1
        j     outer
print:  li    $t1, 0
        move  $t2, $s0
ploop:  beq   $t1, $s1, end
        lw    $a0, 0($t2)
        li    $v0, 1
        syscall
${PRINT_V('sp_')}
        addi  $t1, $t1, 1
        addi  $t2, $t2, 4
        j     ploop
end:    li    $v0, 10
        syscall
`,
    expected: () => '3 5 11 12 22 25 31 47 64 90 ',
  },
]

export function renderProgram(p: ProgramDef, values?: Record<string, number>): string {
  let s = p.template
  for (const prm of p.params) s = s.split(`{${prm.key}}`).join(String(values?.[prm.key] ?? prm.default))
  return s
}

export const defaultParams = (p: ProgramDef) =>
  Object.fromEntries(p.params.map((x) => [x.key, x.default])) as Record<string, number>
