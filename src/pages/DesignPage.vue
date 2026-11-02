<script setup lang="ts">
import { ref } from 'vue'
import FsmDiagram from '../components/FsmDiagram.vue'
import { STATES, SIGNAL_BITS, MUX_SIGNALS, NEW_SIGNALS, type Signals } from '../core/control'
import { view } from '../store'

const selected = ref(0)
const sigText = (id: number) =>
  Object.entries(STATES[id].signals)
    .map(([k, v]) => {
      const bits = SIGNAL_BITS[k as keyof Signals]
      const isMux = MUX_SIGNALS.includes(k as keyof Signals) || bits > 1
      return isMux ? `${k}=${(v as number).toString(2).padStart(bits, '0')}` : v ? k : ''
    })
    .filter(Boolean)
    .join(', ')
</script>

<template>
  <div class="design-grid grid gap-3 h-full min-h-0">
    <div class="panel p-3 overflow-auto">
      <FsmDiagram :current="view.state" :selected="selected" @select="selected = $event" />
    </div>
    <div class="flex flex-col gap-3 min-h-0 overflow-auto">
      <div class="panel p-4">
        <div class="flex items-center gap-2">
          <span class="text-[20px] font-bold mono">{{ selected }}</span>
          <span class="text-[18px] font-semibold">{{ STATES[selected].name }}</span>
          <span class="chip bg-soft">Step {{ STATES[selected].step }}</span>
          <span v-if="STATES[selected].added" class="chip bg-brand-soft text-brand">state ที่กลุ่มเพิ่ม</span>
        </div>
        <div class="mono text-[14px] font-semibold mt-2">{{ STATES[selected].rtl }}</div>
        <div class="text-[14px] mt-1">{{ STATES[selected].th }}</div>
        <div class="mono text-[13px] mt-2 text-ctrl">{{ sigText(selected) || '— ไม่มีสัญญาณ datapath —' }}</div>
      </div>
      <div class="panel p-4">
        <div class="panel-title mb-2">ตาราง state ทั้งหมด</div>
        <table class="w-full text-[12.5px]">
          <thead class="text-muted text-[11px] border-b border-line">
            <tr>
              <th class="text-left font-medium py-1">State</th>
              <th class="text-left font-medium">Step</th>
              <th class="text-left font-medium">สัญญาณ</th>
              <th class="text-left font-medium">RTL</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in STATES"
              :key="s.id"
              class="border-b border-soft cursor-pointer align-top"
              :class="selected === s.id ? 'bg-brand-soft' : s.added ? 'bg-data-soft/40' : ''"
              @click="selected = s.id"
            >
              <td class="py-1 pr-2 whitespace-nowrap font-medium"><span class="mono">{{ s.id }}</span> {{ s.name }}</td>
              <td class="pr-2 mono">{{ s.step }}</td>
              <td class="pr-2 mono text-[11.5px] text-ctrl">{{ sigText(s.id) }}</td>
              <td class="mono text-[11.5px]">{{ s.rtl }}</td>
            </tr>
          </tbody>
        </table>
        <div class="text-[12px] text-muted mt-2">★ สัญญาณใหม่: {{ NEW_SIGNALS.join(', ') }} · ขยาย mux: RegDst (2 บิต), MemtoReg (3), ALUSrcB (3), ALUOp = 11, PCSource = 11</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.design-grid { grid-template-columns: minmax(420px, 1fr) minmax(480px, 1.2fr); }
@media (max-width: 1100px) {
  .design-grid { grid-template-columns: minmax(0, 1fr); height: auto; }
}
</style>
