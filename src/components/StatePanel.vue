<script setup lang="ts">
import { computed } from 'vue'
import { cpu, trace, version, lastInstrTrace, sim } from '../store'
import { STATES, SIGNAL_NAMES, SIGNAL_BITS, MUX_SIGNALS, NEW_SIGNALS, dispatch, nextState } from '../core/control'
import { decode } from '../core/disassembler'

/** predicted state path for an instruction word */
function pathFor(ir: number): number[] {
  const p = [0, 1]
  const d = dispatch(ir)
  if (d < 0) return p
  let s = d
  let guard = 0
  while (s !== 0 && guard++ < 10) {
    p.push(s)
    if (s === 18) {
      s = 19
      continue
    }
    s = nextState(s, ir, true)
  }
  return p
}

const props = withDefaults(defineProps<{ part?: 'now' | 'signals' | 'all' }>(), { part: 'all' })

const data = computed(() => {
  void version.value
  const t = trace.value
  // instruction being executed / just executed
  const ir = t ? (t.state === 0 ? t.ir : cpu.ir) : 0
  const path = t ? pathFor(t.state === 0 ? t.ir : cpu.ir) : [0, 1]
  const doneStates = lastInstrTrace.value.map((x) => x.state)
  return { t, ir, path, doneStates, next: cpu.state, dec: t ? decode(ir, cpu.instrPc) : null }
})

const signalOn = (n: (typeof SIGNAL_NAMES)[number]) =>
  !!data.value.t && n in STATES[data.value.t.state].signals && (data.value.t.signals[n] !== 0 || MUX_SIGNALS.includes(n))
const signalText = (n: (typeof SIGNAL_NAMES)[number]) => {
  const t = data.value.t
  if (!t) return '-'
  if (MUX_SIGNALS.includes(n) && !(n in STATES[t.state].signals)) return 'X'
  return bin(t.signals[n], SIGNAL_BITS[n])
}
const sortedSignals = computed(() => [...SIGNAL_NAMES].sort((a, b) => Number(signalOn(b)) - Number(signalOn(a))))

const bin = (v: number, bits: number) => v.toString(2).padStart(bits, '0')
const fmt = (v: number) => (sim.hexView ? '0x' + (v >>> 0).toString(16).padStart(8, '0') : String(v | 0))
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-if="props.part !== 'signals'">
      <!-- empty state: how to use -->
      <div v-if="!data.t" class="flex flex-col gap-2">
        <div class="text-[15px] font-semibold">เริ่มใช้งาน</div>
        <ol class="grid gap-1.5 text-[13.5px] sm:grid-cols-3">
          <li class="rounded-lg bg-brand-soft px-3 py-2"><b class="text-brand">1.</b> เลือกโปรแกรมด้านบน แล้วกำหนดค่า n, r</li>
          <li class="rounded-lg bg-brand-soft px-3 py-2"><b class="text-brand">2.</b> กด <b>Step cycle</b> หรือปุ่ม <kbd>→</kbd> เพื่อรันทีละ 1 clock</li>
          <li class="rounded-lg bg-brand-soft px-3 py-2"><b class="text-brand">3.</b> ดูเส้นสีฟ้าใน datapath = ข้อมูลที่วิ่งใน cycle นั้น</li>
        </ol>
      </div>

      <template v-else>
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="text-[12px] font-semibold text-muted uppercase tracking-wide">กำลังทำคำสั่ง</span>
          <span class="mono font-bold text-[18px] text-ink">{{ data.dec?.text ?? '—' }}</span>
          <span class="mono text-[12px] text-muted">PC 0x{{ cpu.instrPc.toString(16).padStart(8, '0') }}</span>
          <span class="ml-auto mono text-[12px] text-muted">cycle {{ data.t.cycle }}</span>
        </div>

        <!-- state path -->
        <div class="flex flex-wrap items-center gap-1.5">
          <template v-for="(st, i) in data.path" :key="i">
            <span v-if="i > 0" class="text-line">━</span>
            <span
              class="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12.5px] mono border"
              :class="[
                data.t.state === st
                  ? 'bg-brand text-white border-brand font-bold shadow-sm'
                  : data.doneStates.includes(st)
                    ? 'bg-brand-soft text-brand border-brand-soft'
                    : 'bg-white text-muted border-line',
              ]"
            >
              <span class="opacity-70">{{ st }}</span>{{ STATES[st].name }}<template v-if="st === 18"> ×32</template>
            </span>
          </template>
        </div>

        <!-- what happens in this cycle -->
        <div class="rounded-xl border border-brand/25 bg-brand-soft/60 px-4 py-3">
          <div class="flex flex-wrap items-center gap-2 mb-1">
            <span class="text-[12px] font-semibold text-brand">State {{ data.t.state }} · Step {{ STATES[data.t.state].step }} ในสไลด์</span>
            <span v-if="STATES[data.t.state].added" class="chip bg-white text-brand border border-brand/30">state ที่กลุ่มออกแบบเพิ่ม</span>
          </div>
          <div class="text-[15px] leading-relaxed">{{ STATES[data.t.state].th }}</div>
          <div class="mono text-[13px] font-semibold mt-1.5 text-ink/80">{{ STATES[data.t.state].rtl }}</div>
          <div v-if="data.t.note" class="text-[13px] mt-1.5 text-brand">syscall → {{ JSON.stringify(data.t.note) }}</div>
          <div class="text-[12.5px] mt-1.5 text-muted">
            cycle ถัดไป → <b class="text-ink">state {{ data.next }} {{ STATES[data.next]?.name }}</b>
          </div>
        </div>
      </template>
    </template>

    <template v-if="props.part !== 'now'">
      <div class="flex items-center gap-2">
        <span class="panel-title">สัญญาณ control ใน cycle นี้</span>
        <span class="text-[11.5px] text-muted">สีส้ม = สัญญาณที่ใช้งาน · X = don't care · ★ = สัญญาณใหม่</span>
      </div>
      <div class="grid grid-cols-2 xl:grid-cols-3 gap-1.5">
        <div
          v-for="n in sortedSignals"
          :key="n"
          class="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] border"
          :class="signalOn(n) ? 'border-ctrl/50 bg-ctrl-soft text-ink' : 'border-line text-muted'"
        >
          <span class="truncate">{{ n }}<sup v-if="NEW_SIGNALS.includes(n)" class="text-brand">★</sup></span>
          <span class="mono font-bold ml-1" :class="signalOn(n) ? 'text-ctrl' : ''">{{ signalText(n) }}</span>
        </div>
      </div>

      <div v-if="data.t" class="grid grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-1 text-[12.5px] mono rounded-lg bg-soft px-3 py-2">
        <div class="flex justify-between"><span class="text-muted">ALU A</span><span>{{ fmt(data.t.wires.aluA) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">ALU B</span><span>{{ fmt(data.t.wires.aluB) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">ALU result</span><span>{{ fmt(data.t.wires.aluResult) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">Zero</span><span>{{ data.t.wires.zero }}</span></div>
        <div class="flex justify-between"><span class="text-muted">Mem addr</span><span>{{ fmt(data.t.wires.memAddr) }}</span></div>
        <div class="flex justify-between"><span class="text-muted">Mem data</span><span>{{ data.t.wires.memData === null ? '—' : fmt(data.t.wires.memData) }}</span></div>
      </div>
    </template>
  </div>
</template>
