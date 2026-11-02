<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Datapath from '../components/Datapath.vue'
import StatePanel from '../components/StatePanel.vue'
import Registers from '../components/Registers.vue'
import StackView from '../components/StackView.vue'
import MduPanel from '../components/MduPanel.vue'
import SourcePanel from '../components/SourcePanel.vue'
import { PROGRAMS } from '../programs'
import {
  sim, view, version, SPEEDS, loadProgram, applyParams, reset, stepCycle, stepInstr, stepBack, run, stop, submitInput, cpu,
} from '../store'

const prog = computed(() => PROGRAMS.find((p) => p.id === sim.programId))
const memTab = ref<'stack' | 'data' | 'mdu'>('stack')
// show the MDU automatically while a multiply/divide is running
watch(version, () => {
  if (cpu.state >= 17 && cpu.state <= 19 && memTab.value !== 'mdu') memTab.value = 'mdu'
})
const statusLabel = computed(() => {
  const s = view.value.status
  return s === 'halted' ? 'จบโปรแกรม' : s === 'error' ? 'Error' : s === 'input' ? 'รอ input' : sim.running ? 'กำลังรัน' : 'พร้อม'
})

// keyboard shortcuts (ignored while typing)
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) return
  if (e.key === 'ArrowRight' && !sim.running && !view.value.done) {
    e.preventDefault()
    if (e.shiftKey) stepInstr()
    else stepCycle()
  } else if (e.key === 'ArrowLeft' && view.value.canBack && !sim.running) {
    e.preventDefault()
    stepBack()
  } else if (e.key === ' ') {
    e.preventDefault()
    if (sim.running) stop()
    else run()
  } else if (e.key === 'r' || e.key === 'R') {
    reset()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
const showKeys = ref(false)
</script>

<template>
  <div class="flex flex-col gap-3 h-full min-h-0">
    <!-- toolbar -->
    <div class="panel px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <!-- program -->
      <div class="flex flex-wrap items-center gap-2">
        <label for="prog-select" class="text-[12px] font-semibold text-muted">โปรแกรม</label>
        <select
          id="prog-select"
          class="h-9 rounded-lg border border-line bg-white px-2 font-medium max-w-64"
          :value="sim.programId"
          @change="loadProgram(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in PROGRAMS" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
        <template v-if="prog">
          <label v-for="prm in prog.params" :key="prm.key" class="flex items-center gap-1 text-[13px]">
            <span class="text-muted">{{ prm.label }} =</span>
            <input
              :id="'param-' + prm.key"
              v-model.number="sim.params[prm.key]"
              type="number"
              :min="prm.min"
              :max="prm.max"
              class="w-16 h-9 rounded-lg border border-line px-2 mono"
              @change="applyParams"
            />
          </label>
        </template>
      </div>

      <!-- controls -->
      <div class="flex flex-wrap items-center gap-1.5">
        <button class="btn h-9!" title="เริ่มใหม่ (R)" @click="reset">⟲ Reset</button>
        <button class="btn h-9!" title="ย้อน 1 cycle (←)" :disabled="!view.canBack || sim.running" @click="stepBack">◀ ย้อน</button>
        <button class="btn btn-primary btn-lg" title="รัน 1 clock cycle (→)" :disabled="view.done || sim.running" @click="stepCycle">Step cycle ▶</button>
        <button class="btn h-9!" title="รันจนจบคำสั่ง (Shift + →)" :disabled="view.done || sim.running" @click="stepInstr">Step ทั้งคำสั่ง ▶▶</button>
        <button v-if="!sim.running" class="btn h-9!" title="รันต่อเนื่อง (Space)" :disabled="view.done" @click="run">▶ Run</button>
        <button v-else class="btn h-9! border-brand! text-brand" @click="stop">❚❚ Pause</button>
        <select id="speed-select" v-model.number="sim.speed" class="h-9 rounded-lg border border-line bg-white px-2 text-[13px]" title="ความเร็วตอน Run" @change="sim.running && (stop(), run())">
          <option v-for="(sp, i) in SPEEDS" :key="i" :value="i">{{ sp.label }}</option>
        </select>
        <button class="text-[12px] text-brand font-medium px-1" @click="showKeys = !showKeys">⌨ คีย์ลัด</button>
      </div>

      <!-- status -->
      <div class="ml-auto flex items-center gap-4 text-[13px]">
        <span class="chip" :class="view.status === 'error' ? 'bg-err text-white' : view.status === 'halted' ? 'bg-ok/15 text-ok' : sim.running ? 'bg-brand text-white' : 'bg-brand-soft text-brand'">{{ statusLabel }}</span>
        <div class="text-center leading-tight"><div class="mono font-bold text-[16px]">{{ view.cycle }}</div><div class="text-[11px] text-muted">cycle</div></div>
        <div class="text-center leading-tight"><div class="mono font-bold text-[16px]">{{ view.instr }}</div><div class="text-[11px] text-muted">คำสั่ง</div></div>
        <div class="text-center leading-tight"><div class="mono font-bold text-[16px]">{{ view.cpi.toFixed(2) }}</div><div class="text-[11px] text-muted">CPI</div></div>
      </div>
      <div v-if="showKeys" class="basis-full flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span><kbd>→</kbd> step cycle</span><span><kbd>Shift</kbd>+<kbd>→</kbd> step ทั้งคำสั่ง</span>
        <span><kbd>←</kbd> ย้อน</span><span><kbd>Space</kbd> run / pause</span><span><kbd>R</kbd> reset</span>
      </div>
    </div>
    <div v-if="view.error" class="rounded-lg bg-err/10 text-err px-3 py-2 text-[13px]">{{ view.error }}</div>

    <!-- main grid -->
    <div class="sim-grid grid gap-3 min-h-0 flex-1">
      <div class="panel p-3 min-h-0 flex flex-col">
        <SourcePanel />
        <div class="mt-3 border-t border-line pt-2">
          <div class="panel-title mb-1">Console (ผลลัพธ์ของโปรแกรม)</div>
          <pre class="mono text-[13px] whitespace-pre-wrap bg-[#0f1e36] text-[#e4eefd] rounded-lg p-2.5 min-h-12 max-h-32 overflow-auto">{{ view.output || ' ' }}</pre>
          <form v-if="view.status === 'input'" class="flex gap-2 mt-2" @submit.prevent="submitInput">
            <input id="read-int" v-model="sim.inputValue" class="flex-1 h-9 rounded-lg border-2 border-brand px-2 mono" placeholder="read_int: พิมพ์ตัวเลขแล้ว Enter" autofocus />
            <button class="btn btn-primary h-9!">ส่ง</button>
          </form>
        </div>
      </div>

      <div class="flex flex-col gap-3 min-h-0 overflow-auto">
        <div class="panel p-4">
          <StatePanel part="now" />
        </div>
        <div class="panel p-2">
          <Datapath />
          <div class="flex flex-wrap items-center gap-x-5 gap-y-1 px-2 pb-1 text-[12px] text-muted">
            <span class="flex items-center gap-1.5"><svg width="26" height="6"><line x1="0" y1="3" x2="26" y2="3" stroke="var(--color-data)" stroke-width="2.6" stroke-dasharray="6 4" /></svg>สายที่ใช้งานใน cycle นี้</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-ctrl inline-block" />ขาที่ mux เลือก</span>
            <span class="flex items-center gap-1.5"><span class="w-4 h-3 rounded-sm bg-hot border border-[#e6cf73] inline-block" />register ที่ถูกเขียน</span>
            <span class="flex items-center gap-1.5"><span class="text-ctrl mono font-semibold">IorD=0</span>ค่าสัญญาณ control</span>
          </div>
        </div>
        <div class="panel p-4">
          <StatePanel part="signals" />
        </div>
      </div>

      <div class="flex flex-col gap-3 min-h-0 overflow-auto">
        <div class="panel p-3">
          <Registers />
        </div>
        <div class="panel p-3">
          <div class="inline-flex rounded-lg border border-line p-0.5 bg-soft mb-2">
            <button v-for="t in (['stack', 'data', 'mdu'] as const)" :key="t" class="px-3 h-7 rounded-md text-[12.5px] font-medium" :class="memTab === t ? 'bg-white shadow-sm text-brand' : 'text-muted'" @click="memTab = t">
              {{ t === 'stack' ? 'Stack' : t === 'data' ? '.data' : 'ตัวคูณ/หาร' }}
            </button>
          </div>
          <StackView v-if="memTab !== 'mdu'" :mode="memTab" />
          <MduPanel v-else />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sim-grid { grid-template-columns: minmax(270px, 0.85fr) minmax(560px, 2.6fr) minmax(250px, 0.85fr); }
@media (max-width: 1180px) {
  .sim-grid { grid-template-columns: minmax(0, 1fr); }
  .sim-grid > * { min-height: auto; overflow: visible; }
}
</style>
