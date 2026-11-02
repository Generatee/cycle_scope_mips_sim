<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { cpu, program, sim, version, assembleAndLoad } from '../store'

const ta = ref<HTMLTextAreaElement | null>(null)
const gutter = ref<HTMLDivElement | null>(null)
const listing = ref<HTMLDivElement | null>(null)

const errLines = computed(() => new Map(program.value.errors.map((e) => [e.line, e.message])))
const lineCount = computed(() => sim.source.split('\n').length)

const rows = computed(() => {
  void version.value
  const cur = cpu.done ? -1 : cpu.instrPc
  return program.value.text.map((t) => ({ ...t, cur: t.addr === cur }))
})

function onScroll() {
  if (ta.value && gutter.value) gutter.value.scrollTop = ta.value.scrollTop
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = e.target as HTMLTextAreaElement
    const s = el.selectionStart
    sim.source = sim.source.slice(0, s) + '        ' + sim.source.slice(el.selectionEnd)
    nextTick(() => el.setSelectionRange(s + 8, s + 8))
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') assembleAndLoad()
}

watch(
  () => version.value,
  () => {
    if (sim.editing) return
    nextTick(() => {
      const el = listing.value?.querySelector('[data-cur="true"]') as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest' })
    })
  },
)

const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0')
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center gap-2 mb-2">
      <div class="inline-flex rounded-lg border border-line p-0.5 bg-soft">
        <button class="px-2.5 h-7 rounded-md text-[12.5px] font-medium whitespace-nowrap" :class="sim.editing ? 'bg-white shadow-sm text-brand' : 'text-muted'" @click="sim.editing = true">แก้โค้ด</button>
        <button class="px-2.5 h-7 rounded-md text-[12.5px] font-medium whitespace-nowrap" :class="!sim.editing ? 'bg-white shadow-sm text-brand' : 'text-muted'" :disabled="program.errors.length > 0" @click="sim.editing = false">Machine code</button>
      </div>
      <button v-if="sim.editing" class="btn btn-primary ml-auto h-7! text-[13px]" @click="assembleAndLoad">Assemble ▸</button>
    </div>

    <!-- editor -->
    <div v-if="sim.editing" class="flex-1 min-h-0 flex flex-col">
      <div class="flex-1 min-h-0 flex rounded-lg border border-line overflow-hidden bg-white">
        <div ref="gutter" class="mono text-[12.5px] leading-[20px] py-2 text-right select-none bg-soft text-muted overflow-hidden w-10 shrink-0">
          <div v-for="n in lineCount" :key="n" class="pr-2" :class="errLines.has(n) ? 'bg-err text-white' : ''">{{ n }}</div>
        </div>
        <textarea
          ref="ta"
          v-model="sim.source"
          spellcheck="false"
          class="mono flex-1 resize-none text-[12.5px] leading-[20px] py-2 px-2 whitespace-pre overflow-auto"
          @scroll="onScroll"
          @keydown="onKey"
        />
      </div>
      <div v-if="program.errors.length" class="mt-2 max-h-28 overflow-auto text-[12px] rounded-lg border border-err/40 bg-err/5 p-2">
        <div v-for="e in program.errors" :key="e.line + e.message" class="text-err">
          บรรทัด {{ e.line }}: {{ e.message }}
        </div>
      </div>
      <div v-else class="mt-1.5 text-[11px] text-muted">Ctrl + Enter = Assemble</div>
    </div>

    <!-- listing -->
    <div v-else ref="listing" class="flex-1 min-h-0 overflow-auto rounded-lg border border-line bg-white">
      <table class="w-full text-[12.5px] mono">
        <thead class="sticky top-0 bg-soft text-muted text-[11px]">
          <tr>
            <th class="text-left font-medium px-2 py-1">Address</th>
            <th class="text-left font-medium px-2 py-1">Code</th>
            <th class="text-left font-medium px-2 py-1">Basic</th>
            <th class="text-left font-medium px-2 py-1">Source</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.addr"
            :data-cur="r.cur"
            :class="r.cur ? 'bg-brand-soft font-semibold text-brand shadow-[inset_3px_0_0_var(--color-brand)]' : r.source ? '' : 'text-muted'"
          >
            <td class="px-2 py-[2px] text-muted">{{ hex(r.addr) }}</td>
            <td class="px-2 py-[2px]">{{ hex(r.word) }}</td>
            <td class="px-2 py-[2px] whitespace-nowrap">{{ r.basic }}</td>
            <td class="px-2 py-[2px] whitespace-nowrap font-sans text-muted"><span class="text-[10px] mr-1">{{ r.line }}</span>{{ r.source }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
