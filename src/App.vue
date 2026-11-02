<script setup lang="ts">
import { ref } from 'vue'
import { ui, setScale } from './store'
import SimulatorPage from './pages/SimulatorPage.vue'
import EncoderPage from './pages/EncoderPage.vue'
import BenchmarkPage from './pages/BenchmarkPage.vue'
import DesignPage from './pages/DesignPage.vue'

type Tab = 'sim' | 'design' | 'encoder' | 'bench'
const tabs: { id: Tab; label: string }[] = [
  { id: 'sim', label: 'Simulator' },
  { id: 'design', label: 'FSM & Control' },
  { id: 'encoder', label: 'Encoder / Disassembler' },
  { id: 'bench', label: 'Benchmark' },
]
const initial = (() => {
  try {
    return (localStorage.getItem('cs-tab') as Tab) || 'sim'
  } catch {
    return 'sim'
  }
})()
const tab = ref<Tab>(tabs.some((t) => t.id === initial) ? initial : 'sim')
const go = (t: Tab) => {
  tab.value = t
  try {
    localStorage.setItem('cs-tab', t)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <header class="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 min-h-13 border-b border-line bg-panel shrink-0">
      <div class="flex items-center gap-2 py-2">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--color-brand)" />
          <path d="M4.5 14.5h3l2-6 3 9 2-5h5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="leading-tight">
          <div class="font-bold text-[16px] tracking-tight">CycleScope</div>
          <div class="text-[11px] text-muted">MIPS Multi-cycle Simulator</div>
        </div>
      </div>
      <nav class="flex flex-wrap self-stretch" aria-label="หน้า">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="px-3.5 text-[14px] font-medium border-b-[3px] -mb-px"
          :class="tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'"
          @click="go(t.id)"
        >
          {{ t.label }}
        </button>
      </nav>
      <div class="ml-auto flex items-center gap-1.5 text-[12px] text-muted py-2" title="ปรับขนาดตัวอักษรและหน้าจอ">
        <span>ขนาด</span>
        <button class="btn h-7! px-2!" aria-label="เล็กลง" @click="setScale(-1)">A−</button>
        <button class="mono w-12 text-center text-ink font-semibold" @click="setScale(0)" :title="ui.auto ? 'อัตโนมัติตามขนาดจอ' : 'กดเพื่อกลับเป็นอัตโนมัติ'">
          {{ Math.round(ui.scale * 100) }}%
        </button>
        <button class="btn h-7! px-2!" aria-label="ใหญ่ขึ้น" @click="setScale(1)">A+</button>
      </div>
    </header>
    <main class="flex-1 min-h-0 p-3 overflow-auto">
      <SimulatorPage v-show="tab === 'sim'" />
      <DesignPage v-if="tab === 'design'" />
      <EncoderPage v-if="tab === 'encoder'" />
      <BenchmarkPage v-if="tab === 'bench'" />
    </main>
  </div>
</template>
