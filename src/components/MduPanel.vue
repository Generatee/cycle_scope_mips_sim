<script setup lang="ts">
import { computed } from 'vue'
import { cpu, version } from '../store'

const v = computed(() => {
  void version.value
  const m = cpu.mdu
  const bits = (x: number) => (x >>> 0).toString(2).padStart(32, '0').split('')
  return { m, hiBits: bits(m.hi), loBits: bits(m.lo), mcand: (m.mcand >>> 0).toString(2).padStart(32, '0') }
})
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2 flex-wrap">
      <span class="panel-title">Multiply/Divide Unit</span>
      <span class="chip" :class="v.m.active ? 'bg-brand text-white' : 'bg-soft text-muted'">
        {{ v.m.active ? (v.m.div ? 'กำลังหาร' : 'กำลังคูณ') : 'idle' }}
      </span>
      <span class="chip bg-soft mono">count = {{ v.m.count }}</span>
      <span v-if="v.m.signed" class="chip bg-soft">signed</span>
    </div>
    <div class="text-[12px]">
      <span class="text-muted">{{ v.m.div ? 'Divisor' : 'Multiplicand' }}:</span>
      <span class="mono ml-1">0x{{ (v.m.mcand >>> 0).toString(16).padStart(8, '0') }} ({{ v.m.mcand >>> 0 }})</span>
    </div>
    <div>
      <div class="text-[11px] text-muted mb-1">
        {{ v.m.div ? 'Remainder' : 'Product' }} (64 บิต) · ครึ่งซ้าย → HI · ครึ่งขวา → LO
      </div>
      <div class="grid grid-cols-16 gap-[2px] mono text-[11px] leading-none max-w-[260px]">
        <span class="col-span-16 text-[10px] text-muted font-sans">HI (Product[63:32])</span><span v-for="(b, i) in v.hiBits" :key="'h' + i" class="h-[16px] grid place-items-center rounded-[2px]" :class="b === '1' ? 'bg-data text-white' : 'bg-soft text-muted'">{{ b }}</span>
      </div>
      <div class="grid grid-cols-16 gap-[2px] mono text-[11px] leading-none mt-1 max-w-[260px]">
        <span class="col-span-16 text-[10px] text-muted font-sans">LO (Product[31:0])</span>
        <span
          v-for="(b, i) in v.loBits"
          :key="'l' + i"
          class="h-[16px] grid place-items-center rounded-[2px]"
          :class="[b === '1' ? 'bg-data text-white' : 'bg-soft text-muted', i === 31 && !v.m.div ? 'ring-2 ring-ctrl' : '']"
        >{{ b }}</span>
      </div>
      <div v-if="!v.m.div" class="text-[10px] text-ctrl mt-0.5 text-right max-w-[260px]">↑ Multiplier0 (Product[0])</div>
    </div>
    <div class="text-[12px] rounded bg-soft px-2 py-1">{{ v.m.lastAction || 'รอคำสั่ง mult / div / mul' }}</div>
  </div>
</template>
