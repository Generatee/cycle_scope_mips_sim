<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { cpu, trace, version, program, sim } from '../store'
import { TEXT_BASE, DATA_BASE, SP_INIT } from '../core/isa'

const ROWS = 48 // 48 rows x 16 bytes = 768 bytes per page
const BYTES = 16

const base = ref(DATA_BASE) // first address shown (aligned to 16)
const mode = ref<'bytes' | 'words'>('bytes')
const follow = ref(true)
const gotoText = ref('')
const gotoError = ref('')
const scroller = ref<HTMLDivElement | null>(null)

const align = (a: number) => (Math.floor((a >>> 0) / BYTES) * BYTES) >>> 0
const hex8 = (v: number) => (v >>> 0).toString(16).padStart(8, '0')
const hex2 = (v: number) => v.toString(16).padStart(2, '0')

function show(addr: number, center = true) {
  const a = align(addr)
  base.value = center ? align(Math.max(0, a - BYTES * 8)) : a
  nextTick(() => {
    const el = scroller.value?.querySelector(`[data-row="${a}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function goto() {
  const t = gotoText.value.trim()
  gotoError.value = ''
  if (!t) return
  const sym = program.value.symbols.get(t)
  const n = sym ?? (/^(0x)?[0-9a-f]+$/i.test(t) ? parseInt(t.replace(/^0x/i, ''), 16) : NaN)
  if (Number.isNaN(n)) {
    gotoError.value = 'ใส่ address เป็น hex (เช่น 10010000) หรือชื่อ label'
    return
  }
  follow.value = false
  show(n)
}

const jumps = computed(() => {
  void version.value
  return [
    { label: '.text', addr: TEXT_BASE, title: 'โค้ดโปรแกรม (machine code)' },
    { label: '.data', addr: DATA_BASE, title: 'ข้อมูลใน .data' },
    { label: '$sp', addr: cpu.regs[29], title: 'stack ปัจจุบัน' },
    { label: 'PC', addr: cpu.pc, title: 'คำสั่งที่กำลังรัน' },
  ]
})

/** what the CPU touched in the cycle just executed */
const access = computed(() => {
  void version.value
  const t = trace.value
  if (!t) return null
  const s = t.signals
  if (s.MemWrite) return { addr: t.wires.memAddr, kind: 'write' as const }
  if (s.MemRead) return { addr: t.wires.memAddr, kind: s.IRWrite ? ('fetch' as const) : ('read' as const) }
  return null
})

// follow memory accesses (skip instruction fetches so the view stays on data)
watch(access, (a) => {
  if (!follow.value || !a || a.kind === 'fetch') return
  const end = base.value + ROWS * BYTES
  if (a.addr < base.value || a.addr >= end) show(a.addr)
  else
    nextTick(() => {
      const el = scroller.value?.querySelector(`[data-row="${align(a.addr)}"]`) as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest' })
    })
})

const labelsByAddr = computed(() => {
  const m = new Map<number, string[]>()
  program.value.symbols.forEach((addr, name) => {
    const list = m.get(addr) ?? []
    list.push(name)
    m.set(addr, list)
  })
  return m
})

const segmentOf = (a: number) => {
  const textEnd = TEXT_BASE + program.value.text.length * 4
  if (a >= TEXT_BASE && a < textEnd) return '.text'
  if (a >= DATA_BASE && a < DATA_BASE + Math.max(program.value.data.length, 1)) return '.data'
  if (a >= cpu.regs[29] && a <= SP_INIT + 3) return 'stack'
  return ''
}

const rows = computed(() => {
  void version.value
  const acc = access.value
  const pc = cpu.pc
  const sp = cpu.regs[29]
  const out = []
  for (let r = 0; r < ROWS; r++) {
    const a = (base.value + r * BYTES) >>> 0
    const bytes = []
    for (let i = 0; i < BYTES; i++) {
      const addr = (a + i) >>> 0
      const v = cpu.mem.readByte(addr)
      const inAcc = acc && addr >= acc.addr && addr < acc.addr + 4
      bytes.push({
        addr,
        v,
        ch: v >= 32 && v < 127 ? String.fromCharCode(v) : '·',
        acc: inAcc ? acc!.kind : '',
        pc: addr >= pc && addr < pc + 4,
        zero: v === 0,
      })
    }
    const words = [0, 1, 2, 3].map((w) => ({ addr: a + w * 4, v: cpu.mem.readWord(a + w * 4) }))
    const labels: string[] = []
    for (let i = 0; i < BYTES; i++) labels.push(...(labelsByAddr.value.get(a + i) ?? []))
    out.push({
      a,
      bytes,
      words,
      labels,
      seg: segmentOf(a),
      hasPc: pc >= a && pc < a + BYTES,
      hasSp: sp >= a && sp < a + BYTES,
      hasAcc: !!acc && acc.addr >= a && acc.addr < a + BYTES,
    })
  }
  return out
})

const accClass = (k: string) =>
  k === 'write'
    ? 'bg-hot text-ink font-bold'
    : k === 'read'
      ? 'bg-brand text-white font-bold'
      : k === 'fetch'
        ? 'bg-brand-soft text-brand font-bold'
        : ''

const page = (dir: 1 | -1) => {
  follow.value = false
  base.value = Math.max(0, base.value + dir * ROWS * BYTES) >>> 0
}
</script>

<template>
  <div class="flex flex-col min-h-0 h-full">
    <!-- toolbar -->
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
      <span class="panel-title">Memory</span>
      <div class="inline-flex rounded-lg border border-line p-0.5 bg-soft">
        <button v-for="j in jumps" :key="j.label" class="px-2.5 h-7 rounded-md text-[12.5px] font-medium mono text-muted hover:text-brand" :title="j.title" @click="follow = false; show(j.addr)">
          {{ j.label }}
        </button>
      </div>
      <form class="flex items-center gap-1.5" @submit.prevent="goto">
        <label for="mem-goto" class="text-[12px] text-muted">ไปที่</label>
        <input id="mem-goto" v-model="gotoText" class="mono h-8 w-44 rounded-lg border border-line px-2 text-[12.5px]" placeholder="10010000 หรือ label" />
        <button class="btn h-8!">ไป</button>
      </form>
      <span v-if="gotoError" class="text-[12px] text-err">{{ gotoError }}</span>
      <div class="flex items-center gap-1">
        <button class="btn h-8! px-2!" title="ย้อนไป 768 byte" @click="page(-1)">▲</button>
        <button class="btn h-8! px-2!" title="ไปต่อ 768 byte" @click="page(1)">▼</button>
      </div>
      <label class="flex items-center gap-1.5 text-[12.5px] cursor-pointer select-none">
        <input id="mem-follow" v-model="follow" type="checkbox" class="accent-[var(--color-brand)]" />
        ตามการอ่าน/เขียนล่าสุด
      </label>
      <div class="inline-flex rounded-lg border border-line p-0.5 bg-soft">
        <button class="px-2.5 h-7 rounded-md text-[12.5px] font-medium" :class="mode === 'bytes' ? 'bg-white shadow-sm text-brand' : 'text-muted'" @click="mode = 'bytes'">Byte + ASCII</button>
        <button class="px-2.5 h-7 rounded-md text-[12.5px] font-medium" :class="mode === 'words' ? 'bg-white shadow-sm text-brand' : 'text-muted'" @click="mode = 'words'">Word</button>
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-3 text-[11.5px] text-muted">
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-brand inline-block" />อ่าน (lw)</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-hot border border-[#e6cf73] inline-block" />เขียน (sw)</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm bg-brand-soft border border-brand/30 inline-block" />fetch คำสั่ง</span>
        <span class="flex items-center gap-1"><span class="w-3 h-3 rounded-sm border-2 border-brand inline-block" />PC</span>
      </div>
    </div>

    <!-- dump -->
    <div ref="scroller" class="flex-1 min-h-0 overflow-auto rounded-lg border border-line bg-white">
      <table class="mono text-[12.5px] leading-[22px] w-full">
        <thead class="sticky top-0 bg-soft text-muted text-[11px] z-10">
          <tr>
            <th class="text-left font-medium pl-3 pr-2 w-28">Address</th>
            <th class="text-left font-medium px-1 w-14">ส่วน</th>
            <template v-if="mode === 'bytes'">
              <th v-for="i in BYTES" :key="i" class="font-medium w-[26px] text-center" :class="(i - 1) % 4 === 0 ? 'pl-2' : ''">+{{ (i - 1).toString(16) }}</th>
              <th class="text-left font-medium pl-4">ASCII</th>
            </template>
            <template v-else>
              <th v-for="i in 4" :key="i" class="text-left font-medium px-3">+{{ ((i - 1) * 4).toString(16) }}</th>
            </template>
            <th class="text-left font-medium pl-3">label</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.a" :data-row="r.a" class="border-b border-soft" :class="r.hasAcc ? 'bg-brand-soft/40' : ''">
            <td class="pl-3 pr-2 whitespace-nowrap" :class="r.hasPc || r.hasSp ? 'text-brand font-bold' : 'text-muted'">
              {{ hex8(r.a) }}
            </td>
            <td class="px-1 text-[11px] whitespace-nowrap">
              <span v-if="r.seg" class="text-muted">{{ r.seg }}</span>
              <span v-if="r.hasSp" class="ml-1 text-brand font-bold">←$sp</span>
            </td>
            <template v-if="mode === 'bytes'">
              <td
                v-for="(b, i) in r.bytes"
                :key="b.addr"
                class="text-center"
                :class="[i % 4 === 0 ? 'pl-2' : '']"
              >
                <span
                  class="inline-block w-[22px] rounded-[3px]"
                  :class="[accClass(b.acc), b.pc && !b.acc ? 'outline-2 outline-brand -outline-offset-1' : '', b.zero && !b.acc ? 'text-[#b6c2d3]' : '']"
                  :title="`0x${hex8(b.addr)} = ${b.v} (${b.ch})`"
                >{{ hex2(b.v) }}</span>
              </td>
              <td class="pl-4 whitespace-pre tracking-[0.12em]">
                <span v-for="b in r.bytes" :key="'c' + b.addr" class="rounded-[2px]" :class="b.acc ? accClass(b.acc) : b.ch === '·' ? 'text-[#b6c2d3]' : 'text-ink'">{{ b.ch }}</span>
              </td>
            </template>
            <template v-else>
              <td v-for="w in r.words" :key="w.addr" class="px-3">
                <span
                  class="rounded-[3px] px-1"
                  :class="[
                    access && access.addr === w.addr ? accClass(access.kind) : '',
                    w.addr === cpu.pc ? 'outline-2 outline-brand -outline-offset-1' : '',
                    w.v === 0 ? 'text-[#b6c2d3]' : '',
                  ]"
                >{{ sim.hexView ? hex8(w.v) : String(w.v | 0) }}</span>
              </td>
            </template>
            <td class="pl-3 pr-3 text-[11.5px] text-brand font-sans whitespace-nowrap">{{ r.labels.join(', ') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="mt-1.5 text-[11.5px] text-muted">
      Little-endian: word <span class="mono">0x24040005</span> เก็บเป็นไบต์ <span class="mono">05 00 04 24</span> ·
      {{ access ? `cycle นี้${access.kind === 'write' ? 'เขียน' : access.kind === 'read' ? 'อ่าน' : 'fetch'} 0x${hex8(access.addr)}` : 'cycle นี้ไม่ได้ใช้ memory' }}
    </div>
  </div>
</template>
