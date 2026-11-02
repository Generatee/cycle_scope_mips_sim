<script setup lang="ts">
import { computed } from 'vue'
import { cpu, trace, version, sim } from '../store'
import { STATES, ALU_CODE, type Signals } from '../core/control'
import { regName } from '../core/isa'

const HOT = '#ffe9a8'
const fmt = (v: number) => (sim.hexView ? (v >>> 0).toString(16).padStart(8, '0') : String(v | 0))

const WIRES: Record<string, string> = {
  pc_iord: 'M64 260 H74 V244 H84',
  pc_alua: 'M64 260 H74 V122 H632 V182 H646',
  pc_m2r: 'M74 122 H358 V352 H370',
  aluout_iord: 'M846 255 H856 V508 H78 V276 H84',
  iord_mem: 'M100 260 H118',
  b_memwd: 'M612 290 H624 V498 H108 V322 H118',
  mem_ir: 'M236 272 H248 V226 H262',
  mem_mdr: 'M236 272 H248 V338 H262',
  ir_rs: 'M336 186 H416',
  ir_rt: 'M336 208 H416',
  ir_rt_dst: 'M350 208 V234 H370',
  ir_rd: 'M336 230 H356 V254 H370',
  c31: 'M356 274 H370',
  regdst_wr: 'M386 254 H416',
  ir_imm: 'M336 262 H344 V406 H430',
  ir_imm_z: 'M344 406 V452 H430',
  mdr_m2r: 'M336 338 H350 V332 H370',
  aluout_m2r: 'M846 255 H856 V516 H362 V312 H370',
  hi_m2r: 'M922 435 H934 V528 H366 V372 H370',
  lo_m2r: 'M922 477 H942 V538 H368 V392 H370',
  m2r_wd: 'M386 355 H400 V330 H416',
  rd1_a: 'M548 196 H572',
  rd2_b: 'M548 290 H572',
  a_alua: 'M612 196 H636 V208 H646',
  b_alub: 'M612 290 H630 V274 H646',
  c4: 'M632 294 H646',
  se_alub: 'M506 406 H516 V380 H636 V314 H646',
  se_sh2: 'M506 406 H530',
  sh2_alub: 'M586 406 H640 V334 H646',
  ze_alub: 'M506 452 H643 V354 H646',
  alua_alu: 'M662 196 H692',
  alub_alu: 'M662 318 H692',
  alu_aluout: 'M764 255 H790',
  alu_pcsrc: 'M764 255 H776 V210 H906',
  aluout_pcsrc: 'M846 255 H870 V236 H906',
  ir_jump: 'M300 168 V112 H770 V155 H780',
  jump_pcsrc: 'M890 155 H893 V262 H906',
  a_pcsrc: 'M612 196 H620 V100 H898 V288 H906',
  pcsrc_pc: 'M922 255 H950 V90 H42 V232',
  ab_mdu: 'M592 304 V457 H646',
  mdu_hi: 'M846 435 H866',
  mdu_lo: 'M846 477 H866',
}

const info = computed(() => {
  void version.value
  const t = trace.value
  const on = new Set<string>()
  const spec = new Set<string>()
  let sig: Signals | null = null
  if (t) {
    sig = t.signals
    const sp = STATES[t.state].signals
    Object.keys(sp).forEach((k) => spec.add(k))
    const s = sig
    const usesALU = 'ALUOp' in sp
    const mem = s.MemRead || s.MemWrite
    const add = (...k: string[]) => k.forEach((x) => on.add(x))
    if (mem) add('iord_mem', s.IorD ? 'aluout_iord' : 'pc_iord')
    if (s.MemWrite) add('b_memwd')
    if (s.IRWrite) add('mem_ir')
    if (s.MemRead && !s.IRWrite) add('mem_mdr')
    if (t.state === 1) add('ir_rs', 'ir_rt', 'rd1_a', 'rd2_b')
    if (usesALU) {
      add('alua_alu', 'alub_alu', 'alu_aluout', s.ALUSrcA ? 'a_alua' : 'pc_alua')
      ;[
        ['b_alub'], ['c4'], ['ir_imm', 'se_alub'], ['ir_imm', 'se_sh2', 'sh2_alub'], ['ir_imm', 'ir_imm_z', 'ze_alub'],
      ][s.ALUSrcB].forEach((x) => add(x))
    }
    const condBranch = s.PCWriteCond || s.PCWriteCondNE
    if (s.PCWrite || condBranch) {
      add(['alu_pcsrc', 'aluout_pcsrc', 'jump_pcsrc', 'a_pcsrc'][s.PCSource])
      if (s.PCSource === 2) add('ir_jump')
      if (t.wires.pcWrite) add('pcsrc_pc')
    }
    if (s.RegWrite) {
      add('regdst_wr', 'm2r_wd', ['ir_rt_dst', 'ir_rd', 'c31'][s.RegDst])
      add(['aluout_m2r', 'mdr_m2r', 'pc_m2r', 'hi_m2r', 'lo_m2r'][s.MemtoReg])
    }
    if (s.MDUOp === 1) add('ab_mdu')
    if (s.MDUOp === 3) add('mdu_hi', 'mdu_lo')
  }
  const changed = new Set(t?.changed ?? [])
  return { t, sig, on, spec, changed }
})

const muxLabel = (name: keyof Signals) => {
  const i = info.value
  if (!i.sig) return { text: `${name}`, active: false }
  const specified = i.spec.has(name)
  return { text: `${name}=${specified ? i.sig[name] : 'X'}`, active: specified }
}

const sel = (name: keyof Signals, idx: number) => {
  const i = info.value
  return !!i.sig && i.spec.has(name) && i.sig[name] === idx
}

const regs = computed(() => {
  void version.value
  return { pc: cpu.pc, ir: cpu.ir, mdr: cpu.mdr, a: cpu.a, b: cpu.b, aluOut: cpu.aluOut, hi: cpu.hi, lo: cpu.lo }
})

const muxInputs = (x: number, ys: number[], name: keyof Signals) =>
  ys.map((y, idx) => ({ x, y, idx, on: sel(name, idx) }))
</script>

<template>
  <svg viewBox="0 0 970 550" class="w-full h-auto select-none" role="img" aria-label="Multi-cycle datapath">
    <defs>
      <marker id="dp-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#9fb0c8" />
      </marker>
      <marker id="dp-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="var(--color-data)" />
      </marker>
    </defs>

    <!-- wires: inactive first, active on top -->
    <g fill="none">
      <path v-for="(d, id) in WIRES" v-show="!info.on.has(id)" :key="'w' + id" :d="d" stroke="#c3cfe0" stroke-width="1.2" marker-end="url(#dp-arrow)" />
      <path v-for="(d, id) in WIRES" v-show="info.on.has(id)" :key="'a' + id" :d="d" stroke="var(--color-data)" stroke-width="2.6" marker-end="url(#dp-arrow-on)" class="wire-on" />
    </g>

    <!-- Control unit -->
    <g>
      <rect x="416" y="22" width="196" height="60" rx="30" fill="var(--color-ctrl-soft)" stroke="var(--color-ctrl)" stroke-width="1.5" />
      <text x="514" y="44" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--color-ctrl)">CONTROL (FSM)</text>
      <text x="514" y="66" text-anchor="middle" font-size="15" font-weight="700" fill="var(--color-ink)" class="mono">
        {{ info.t ? `${info.t.state} ${STATES[info.t.state].name}` : '—' }}
      </text>
    </g>

    <!-- PC -->
    <g>
      <rect x="20" y="232" width="44" height="56" rx="4" :fill="(info.changed.has('pc')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="42" y="256" text-anchor="middle" font-size="14.5" font-weight="700">PC</text>
      <text x="42" y="300" text-anchor="middle" font-size="10.5" class="mono" fill="var(--color-muted)">{{ fmt(regs.pc) }}</text>
    </g>

    <!-- IorD mux -->
    <g>
      <rect x="84" y="228" width="16" height="64" rx="8" fill="#fff" stroke="#4a5d78" />
      <circle v-for="p in muxInputs(84, [244, 276], 'IorD')" :key="p.idx" :cx="p.x + 4" :cy="p.y" r="2.6" :fill="p.on ? 'var(--color-ctrl)' : '#c6d2e3'" />
      <text x="92" y="222" text-anchor="middle" font-size="10.5" :fill="muxLabel('IorD').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">{{ muxLabel('IorD').text }}</text>
    </g>

    <!-- Memory -->
    <g>
      <rect x="118" y="196" width="118" height="150" rx="6" :fill="([...info.changed].some((c) => c.startsWith('mem:'))) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="177" y="216" text-anchor="middle" font-size="14.5" font-weight="700">Memory</text>
      <text x="124" y="264" font-size="10.5" fill="var(--color-muted)">Address</text>
      <text x="124" y="326" font-size="10.5" fill="var(--color-muted)">Write data</text>
      <text x="230" y="276" text-anchor="end" font-size="10.5" fill="var(--color-muted)">MemData</text>
      <text x="177" y="236" text-anchor="middle" font-size="10.5" class="mono" :fill="info.sig?.MemRead || info.sig?.MemWrite ? 'var(--color-data)' : '#a6b4c8'">
        {{ info.sig?.MemRead ? 'MemRead' : info.sig?.MemWrite ? 'MemWrite' : 'idle' }}
      </text>
      <text v-if="info.t && (info.sig?.MemRead || info.sig?.MemWrite)" x="177" y="300" text-anchor="middle" font-size="10.5" class="mono" fill="var(--color-data)">
        [{{ fmt(info.t.wires.memAddr) }}]
      </text>
    </g>

    <!-- IR -->
    <g>
      <rect x="262" y="168" width="74" height="118" rx="4" :fill="(info.changed.has('ir')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="299" y="186" text-anchor="middle" font-size="11.5" font-weight="700">Instruction</text>
      <text x="299" y="198" text-anchor="middle" font-size="11.5" font-weight="700">register</text>
      <text x="299" y="214" text-anchor="middle" font-size="10.5" class="mono" fill="var(--color-muted)">{{ fmt(regs.ir) }}</text>
            <text x="332" y="232" text-anchor="end" font-size="10" fill="#7a8aa3">[15:11]</text>
      <text x="332" y="258" text-anchor="end" font-size="10" fill="#7a8aa3">[15:0]</text>
    </g>

    <!-- MDR -->
    <g>
      <rect x="262" y="318" width="74" height="40" rx="4" :fill="(info.changed.has('mdr')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="299" y="334" text-anchor="middle" font-size="12.5" font-weight="700">MDR</text>
      <text x="299" y="350" text-anchor="middle" font-size="10.5" class="mono" fill="var(--color-muted)">{{ fmt(regs.mdr) }}</text>
    </g>

    <!-- RegDst mux -->
    <g>
      <rect x="370" y="222" width="16" height="64" rx="8" fill="#fff" stroke="#4a5d78" />
      <circle v-for="p in muxInputs(370, [234, 254, 274], 'RegDst')" :key="p.idx" :cx="p.x + 4" :cy="p.y" r="2.6" :fill="p.on ? 'var(--color-ctrl)' : '#c6d2e3'" />
      <text x="378" y="216" text-anchor="middle" font-size="10.5" :fill="muxLabel('RegDst').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">{{ muxLabel('RegDst').text }}</text>
      <text x="350" y="278" font-size="10.5" fill="#7a8aa3">31</text>
    </g>

    <!-- MemtoReg mux -->
    <g>
      <rect x="370" y="300" width="16" height="110" rx="8" fill="#fff" stroke="#4a5d78" />
      <circle v-for="p in muxInputs(370, [312, 332, 352, 372, 392], 'MemtoReg')" :key="p.idx" :cx="p.x + 4" :cy="p.y" r="2.6" :fill="p.on ? 'var(--color-ctrl)' : '#c6d2e3'" />
      <text x="378" y="424" text-anchor="middle" font-size="10.5" :fill="muxLabel('MemtoReg').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">{{ muxLabel('MemtoReg').text }}</text>
    </g>

    <!-- Register file -->
    <g>
      <rect x="416" y="168" width="132" height="178" rx="6" :fill="([...info.changed].some((c) => c.startsWith('reg:'))) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="482" y="262" text-anchor="middle" font-size="14.5" font-weight="700">Registers</text>
      <text x="422" y="190" font-size="10.5" fill="var(--color-muted)">Read reg 1</text>
      <text x="422" y="212" font-size="10.5" fill="var(--color-muted)">Read reg 2</text>
      <text x="422" y="250" font-size="10.5" fill="var(--color-muted)">Write reg</text>
      <text x="422" y="334" font-size="10.5" fill="var(--color-muted)">Write data</text>
      <text x="542" y="200" text-anchor="end" font-size="10.5" fill="var(--color-muted)">Read data 1</text>
      <text x="542" y="294" text-anchor="end" font-size="10.5" fill="var(--color-muted)">Read data 2</text>
      <text v-if="info.sig?.RegWrite && info.t" x="482" y="282" text-anchor="middle" font-size="11.5" class="mono" fill="var(--color-data)" font-weight="700">
        {{ regName(info.t.wires.writeReg) }} ← {{ fmt(info.t.wires.writeData) }}
      </text>
      <text x="482" y="318" text-anchor="middle" font-size="10.5" fill="var(--color-ctrl)" class="mono" :opacity="info.sig?.RegWrite ? 1 : 0.35">RegWrite={{ info.sig?.RegWrite ?? 0 }}</text>
    </g>

    <!-- A, B -->
    <g>
      <rect x="572" y="182" width="40" height="28" rx="4" :fill="(info.changed.has('a')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="592" y="200" text-anchor="middle" font-size="13.5" font-weight="700">A</text>
      <text x="592" y="176" text-anchor="middle" font-size="10" class="mono" fill="var(--color-muted)">{{ fmt(regs.a) }}</text>
      <rect x="572" y="276" width="40" height="28" rx="4" :fill="(info.changed.has('b')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="592" y="294" text-anchor="middle" font-size="13.5" font-weight="700">B</text>
      <text x="592" y="270" text-anchor="middle" font-size="10" class="mono" fill="var(--color-muted)">{{ fmt(regs.b) }}</text>
    </g>

    <!-- Sign / zero extend, shift -->
    <g font-size="11.5">
      <rect x="430" y="392" width="76" height="28" rx="14" fill="#fff" stroke="#4a5d78" />
      <text x="468" y="410" text-anchor="middle">Sign extend</text>
      <rect x="430" y="438" width="76" height="28" rx="14" fill="#fff" stroke="#4a5d78" />
      <text x="468" y="456" text-anchor="middle">Zero extend</text>
      <rect x="530" y="392" width="56" height="28" rx="14" fill="#fff" stroke="#4a5d78" />
      <text x="558" y="410" text-anchor="middle">Shift ≪2</text>
    </g>

    <!-- ALUSrcA mux -->
    <g>
      <rect x="646" y="170" width="16" height="52" rx="8" fill="#fff" stroke="#4a5d78" />
      <circle v-for="p in muxInputs(646, [182, 208], 'ALUSrcA')" :key="p.idx" :cx="p.x + 4" :cy="p.y" r="2.6" :fill="p.on ? 'var(--color-ctrl)' : '#c6d2e3'" />
      <text x="654" y="164" text-anchor="middle" font-size="10.5" :fill="muxLabel('ALUSrcA').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">{{ muxLabel('ALUSrcA').text }}</text>
    </g>

    <!-- ALUSrcB mux -->
    <g>
      <rect x="646" y="262" width="16" height="112" rx="8" fill="#fff" stroke="#4a5d78" />
      <circle v-for="p in muxInputs(646, [274, 294, 314, 334, 354], 'ALUSrcB')" :key="p.idx" :cx="p.x + 4" :cy="p.y" r="2.6" :fill="p.on ? 'var(--color-ctrl)' : '#c6d2e3'" />
      <text x="654" y="388" text-anchor="middle" font-size="10.5" :fill="muxLabel('ALUSrcB').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">{{ muxLabel('ALUSrcB').text }}</text>
      <text x="625" y="298" font-size="10.5" fill="#7a8aa3">4</text>
    </g>

    <!-- ALU -->
    <g>
      <polygon points="692,168 764,212 764,298 692,342 692,272 708,255 692,238" fill="#fff" stroke="#4a5d78" stroke-width="1.3" />
      <text x="736" y="250" text-anchor="middle" font-size="14.5" font-weight="700">ALU</text>
      <text v-if="info.t && 'ALUOp' in STATES[info.t.state].signals" x="736" y="266" text-anchor="middle" font-size="11.5" class="mono" fill="var(--color-data)" font-weight="700">
        {{ info.t.wires.aluFn }}
      </text>
      <text v-if="info.t && 'ALUOp' in STATES[info.t.state].signals" x="736" y="280" text-anchor="middle" font-size="10" class="mono" fill="var(--color-muted)">
        {{ ALU_CODE[info.t.wires.aluFn] }}
      </text>
      <text x="768" y="222" font-size="10.5" fill="var(--color-muted)">Zero={{ info.t?.wires.zero ?? '-' }}</text>
      <text x="728" y="356" text-anchor="middle" font-size="10.5" :fill="muxLabel('ALUOp').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">
        ALUOp={{ info.sig && info.spec.has('ALUOp') ? info.sig.ALUOp.toString(2).padStart(2, '0') : 'X' }}
      </text>
    </g>

    <!-- ALUOut -->
    <g>
      <rect x="790" y="240" width="56" height="30" rx="4" :fill="(info.changed.has('aluOut')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="818" y="259" text-anchor="middle" font-size="12.5" font-weight="700">ALUOut</text>
      <text x="818" y="284" text-anchor="middle" font-size="10" class="mono" fill="var(--color-muted)">{{ fmt(regs.aluOut) }}</text>
    </g>

    <!-- Jump address -->
    <g>
      <rect x="780" y="140" width="110" height="30" rx="15" fill="#fff" stroke="#4a5d78" />
      <text x="835" y="153" text-anchor="middle" font-size="10.5" font-weight="600">Jump address</text>
      <text x="835" y="165" text-anchor="middle" font-size="8" fill="var(--color-muted)" class="mono">PC[31:28]|IR[25:0]|00</text>
    </g>

    <!-- PCSource mux -->
    <g>
      <rect x="906" y="196" width="16" height="118" rx="8" fill="#fff" stroke="#4a5d78" />
      <circle v-for="p in muxInputs(906, [210, 236, 262, 288], 'PCSource')" :key="p.idx" :cx="p.x + 4" :cy="p.y" r="2.6" :fill="p.on ? 'var(--color-ctrl)' : '#c6d2e3'" />
      <text x="914" y="330" text-anchor="middle" font-size="10.5" :fill="muxLabel('PCSource').active ? 'var(--color-ctrl)' : '#97a6bc'" class="mono">{{ muxLabel('PCSource').text }}</text>
      <text x="930" y="190" font-size="10.5" class="mono" :fill="info.t?.wires.pcWrite ? 'var(--color-ctrl)' : '#97a6bc'">
        {{ info.sig?.PCWriteCondNE ? 'PCWriteCondNE' : info.sig?.PCWriteCond ? 'PCWriteCond' : 'PCWrite' }}={{ info.t?.wires.pcWrite ? 1 : 0 }}
      </text>
    </g>

    <!-- MDU + HI/LO -->
    <g>
      <rect x="646" y="420" width="200" height="74" rx="6" :fill="(info.changed.has('mdu')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="746" y="440" text-anchor="middle" font-size="13.5" font-weight="700">Multiply/Divide Unit</text>
      <text x="746" y="458" text-anchor="middle" font-size="10.5" fill="var(--color-muted)">Approach 2 · 1 รอบ/cycle</text>
      <text x="746" y="478" text-anchor="middle" font-size="10.5" class="mono" :fill="info.sig?.MDUOp ? 'var(--color-ctrl)' : '#97a6bc'">
        MDUOp={{ (info.sig?.MDUOp ?? 0).toString(2).padStart(2, '0') }} · count={{ cpu.mdu.count }}
      </text>
      <rect x="866" y="420" width="56" height="30" rx="4" :fill="(info.changed.has('hi')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="894" y="439" text-anchor="middle" font-size="12.5" font-weight="700">HI</text>
      <rect x="866" y="462" width="56" height="30" rx="4" :fill="(info.changed.has('lo')) ? HOT : '#fff'" stroke="#4a5d78" />
      <text x="894" y="481" text-anchor="middle" font-size="12.5" font-weight="700">LO</text>
    </g>
  </svg>
</template>

<style scoped>
.wire-on {
  stroke-dasharray: 6 4;
  animation: flow 0.8s linear infinite;
}
@keyframes flow {
  to { stroke-dashoffset: -20; }
}
@media (prefers-reduced-motion: reduce) {
  .wire-on { animation: none; stroke-dasharray: none; }
}
</style>
