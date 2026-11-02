<script setup lang="ts">
import { computed } from 'vue'
import { cpu, trace, version, sim } from '../store'
import { REG_NAMES } from '../core/isa'

const fmt = (v: number) => (sim.hexView ? (v >>> 0).toString(16).padStart(8, '0') : String(v | 0))

const rows = computed(() => {
  void version.value
  const ch = new Set(trace.value?.changed ?? [])
  return {
    gpr: REG_NAMES.map((n, i) => ({ n, i, v: cpu.regs[i], hot: ch.has('reg:' + i) })),
    special: [
      { n: 'PC', v: cpu.pc, hot: ch.has('pc') },
      { n: 'IR', v: cpu.ir, hot: ch.has('ir') },
      { n: 'MDR', v: cpu.mdr, hot: ch.has('mdr') },
      { n: 'A', v: cpu.a, hot: ch.has('a') },
      { n: 'B', v: cpu.b, hot: ch.has('b') },
      { n: 'ALUOut', v: cpu.aluOut, hot: ch.has('aluOut') },
      { n: 'HI', v: cpu.hi, hot: ch.has('hi') },
      { n: 'LO', v: cpu.lo, hot: ch.has('lo') },
    ],
  }
})
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <span class="panel-title">Registers</span>
      <button class="text-[11.5px] text-brand font-semibold" @click="sim.hexView = !sim.hexView">
        {{ sim.hexView ? 'hex → dec' : 'dec → hex' }}
      </button>
    </div>
    <div class="grid grid-cols-2 gap-x-4 text-[13px] mono">
      <div v-for="r in rows.special" :key="r.n" class="flex justify-between rounded px-1.5 py-[1px]" :class="{ changed: r.hot }">
        <span class="text-brand font-semibold">{{ r.n }}</span><span>{{ fmt(r.v) }}</span>
      </div>
    </div>
    <div class="h-px bg-line my-1.5" />
    <div class="grid grid-cols-2 gap-x-4 text-[13px] mono">
      <div v-for="r in rows.gpr" :key="r.n" class="flex justify-between rounded px-1.5 py-[1px]" :class="{ changed: r.hot }">
        <span class="text-muted">${{ r.n }}<span class="text-[10px] opacity-60"> {{ r.i }}</span></span><span>{{ fmt(r.v) }}</span>
      </div>
    </div>
  </div>
</template>
