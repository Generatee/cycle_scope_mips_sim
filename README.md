# CycleScope — MIPS Multi-cycle Simulator

เว็บจำลอง CPU MIPS แบบ multi-cycle ทีละ clock cycle ตามสไลด์วิชา Computer Architecture (Multicycle Machine)

## รัน
```
pnpm install
pnpm dev        # เปิด http://localhost:5173
pnpm test       # unit test: assembler, disassembler, CPU, MDU, โปรแกรมตัวอย่าง
pnpm build      # ได้ไฟล์เว็บใน dist/
```

## โครงสร้าง
- `src/core/isa.ts` ตาราง 36 คำสั่ง, memory map
- `src/core/assembler.ts` two-pass assembler + pseudo-instruction + directive
- `src/core/disassembler.ts` แปลง machine code กลับเป็น assembly
- `src/core/control.ts` FSM 23 state, สัญญาณ control, ALU control
- `src/core/cpu.ts` CPU ระดับ register transfer: `step()` = 1 cycle, MDU (Approach 2), syscall, step back
- `src/programs/` โปรแกรมตัวอย่าง (factorial, nCr, fib, sort, mult vs multu)
- `src/pages/` หน้า Simulator, FSM & Control, Encoder/Disassembler, Benchmark
# cycle_scope_mips_sim
