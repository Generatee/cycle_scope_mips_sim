<script setup lang="ts">
import { STATES } from '../core/control'

const props = defineProps<{ current?: number; selected?: number }>()
const emit = defineEmits<{ select: [id: number] }>()

const W = 130, H = 34
const c1 = 300, c2 = 450, c3 = 600
// state -> [x, y]
const POS: Record<number, [number, number]> = {
  0: [40, 96], 1: [40, 200],
  2: [c1, 96], 3: [c2, 96], 4: [c3, 96], 5: [c2, 144],
  6: [c1, 192], 7: [c2, 192],
  10: [c1, 240], 12: [c2, 240], 11: [c1, 288],
  8: [c1, 336], 13: [c1, 384], 9: [c1, 432], 14: [c1, 480], 15: [c1, 528], 16: [c1, 576],
  17: [c1, 624], 18: [c2, 624], 19: [c3, 624], 20: [c3, 672], 21: [c1, 720], 22: [c1, 768],
}
const branches: [number, string][] = [
  [96, 'lw, sw'], [192, 'R-type, shift'], [240, 'addi, slti'], [288, 'andi, ori, lui'], [336, 'beq'], [384, 'bne'],
  [432, 'j'], [480, 'jal'], [528, 'jr'], [576, 'syscall'], [624, 'mult, div, mul'], [720, 'mfhi'], [768, 'mflo'],
]
const w = (id: number) => (id <= 1 ? 120 : W)
const fill = (id: number) =>
  props.current === id ? 'var(--color-brand)' : STATES[id].added ? 'var(--color-data-soft)' : '#fff'
const stroke = (id: number) =>
  props.current === id || props.selected === id ? 'var(--color-brand-dark)' : STATES[id].added ? 'var(--color-data)' : '#4a5d78'
</script>

<template>
  <svg viewBox="0 0 760 800" class="w-full h-auto" role="img" aria-label="FSM 23 states">
    <defs>
      <marker id="fsm-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#7a8aa3" />
      </marker>
    </defs>
    <text x="24" y="28" font-size="15" font-weight="600">FSM มี 23 state: 0–9 จากสไลด์ (Five-Stage Control), 10–22 กลุ่มออกแบบเพิ่ม</text>
    <text x="24" y="50" font-size="11.5" fill="var(--color-muted)">กรอบสีฟ้า = state ที่เพิ่ม · ทุกเส้นทางจบแล้วกลับไป state 0 (Fetch) · คลิก state เพื่อดูรายละเอียด</text>
    <g fill="none" stroke="#7a8aa3" stroke-width="1.25">
      <path d="M100 114V182" marker-end="url(#fsm-a)" />
      <path d="M160 200H200" />
      <path d="M200 96V768" />
      <path v-for="[y] in branches" :key="y" :d="`M200 ${y}H${c1}`" marker-end="url(#fsm-a)" />
      <path d="M430 96H450" marker-end="url(#fsm-a)" />
      <path d="M580 96H600" marker-end="url(#fsm-a)" />
      <path d="M365 113V144H450" marker-end="url(#fsm-a)" />
      <path d="M430 192H450" marker-end="url(#fsm-a)" />
      <path d="M430 240H450" marker-end="url(#fsm-a)" />
      <path d="M430 288H515V257" marker-end="url(#fsm-a)" />
      <path d="M430 624H450" marker-end="url(#fsm-a)" />
      <path d="M580 624H600" marker-end="url(#fsm-a)" />
      <path d="M495 607V594H535V607" marker-end="url(#fsm-a)" />
      <path d="M665 641V655" marker-end="url(#fsm-a)" />
    </g>
    <g font-size="11.5" fill="var(--color-muted)">
      <text v-for="[y, l] in branches" :key="'l' + y" x="208" :y="y - 6">{{ l }}</text>
      <text x="440" y="74" text-anchor="middle">lw</text>
      <text x="372" y="136">sw</text>
      <text x="515" y="588" text-anchor="middle">วน 32 รอบ</text>
      <text x="656" y="652" text-anchor="end">mul</text>
    </g>
    <g v-for="(p, id) in POS" :key="id" class="cursor-pointer" @click="emit('select', Number(id))">
      <rect :x="p[0]" :y="p[1] - H / 2" :width="w(Number(id))" :height="H" rx="8" :fill="fill(Number(id))" :stroke="stroke(Number(id))"
        :stroke-width="props.current === Number(id) || props.selected === Number(id) ? 2.5 : 1.25" />
      <text :x="p[0] + w(Number(id)) / 2" :y="p[1] + 4.5" text-anchor="middle" font-size="12.5" :font-weight="Number(id) <= 1 ? 700 : 500"
        :fill="props.current === Number(id) ? '#fff' : 'var(--color-ink)'">{{ id }} {{ STATES[Number(id)].name }}</text>
    </g>
  </svg>
</template>
