<script setup lang="ts">
import { computed } from 'vue'
import { cpu, trace, version, sim, program } from '../store'
import { SP_INIT, DATA_BASE, TEXT_BASE } from '../core/isa'

const props = defineProps<{ mode: 'stack' | 'data' }>()
const fmt = (v: number) => (sim.hexView ? (v >>> 0).toString(16).padStart(8, '0') : String(v | 0))

const rows = computed(() => {
  void version.value
  const ch = new Set(trace.value?.changed ?? [])
  const textEnd = TEXT_BASE + program.value.text.length * 4
  if (props.mode === 'stack') {
    const sp = cpu.regs[29]
    const lo = Math.max(Math.min(sp, cpu.minSp) , SP_INIT - 4 * 63)
    const out = []
    for (let a = SP_INIT; a >= lo; a -= 4) {
      const v = cpu.mem.readWord(a)
      const isRa = v >= TEXT_BASE && v < textEnd && v % 4 === 0
      out.push({ a, v, sp: a === sp, live: a >= sp, hot: ch.has('mem:' + a), note: isRa ? 'return addr?' : '' })
    }
    return out
  }
  const len = Math.min(48, Math.ceil(program.value.data.length / 4) || 8)
  const labels = new Map<number, string>()
  program.value.symbols.forEach((addr, name) => {
    if (addr >= DATA_BASE) labels.set(addr, name)
  })
  return Array.from({ length: len }, (_, i) => {
    const a = DATA_BASE + i * 4
    return { a, v: cpu.mem.readWord(a), sp: false, live: true, hot: ch.has('mem:' + a), note: labels.get(a) ?? '' }
  })
})
</script>

<template>
  <div class="text-[13px] mono">
    <div v-if="mode === 'stack'" class="text-[11px] text-muted mb-1 font-sans">
      $sp = 0x{{ cpu.regs[29].toString(16) }} · stack ลึกสุด {{ SP_INIT - cpu.minSp }} byte
    </div>
    <div
      v-for="r in rows"
      :key="r.a"
      class="flex items-center gap-2 rounded px-1.5 py-[1px]"
      :class="[{ changed: r.hot }, r.live ? '' : 'opacity-35']"
    >
      <span class="w-6 text-brand font-bold">{{ r.sp ? '$sp' : '' }}</span>
      <span class="text-muted">{{ r.a.toString(16).padStart(8, '0') }}</span>
      <span class="font-semibold">{{ fmt(r.v) }}</span>
      <span class="text-[10px] text-brand font-sans truncate">{{ r.note }}</span>
    </div>
  </div>
</template>
