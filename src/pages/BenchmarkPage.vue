<script setup lang="ts">
import { reactive, ref, computed } from 'vue'
import { assemble } from '../core/assembler'
import { CPU, type Stats } from '../core/cpu'
import { PROGRAMS, defaultParams, renderProgram } from '../programs'
import LineChart from '../components/LineChart.vue'

interface Row {
  id: string
  title: string
  params: string
  ic: number
  cycles: number
  cpi: number
  stats: Stats
  calls: number
  stackBytes: number
  output: string
}

function runOne(id: string, params?: Record<string, number>): Row {
  const p = PROGRAMS.find((x) => x.id === id)!
  const prm = params ?? defaultParams(p)
  const prog = assemble(renderProgram(p, prm))
  const cpu = new CPU()
  cpu.keepHistory = false
  cpu.load(prog)
  cpu.run(200_000_000)
  return {
    id,
    title: p.title,
    params: Object.entries(prm).map(([k, v]) => `${k.toLowerCase()}=${v}`).join(', '),
    ic: cpu.instrCount,
    cycles: cpu.cycle,
    cpi: cpu.cycle / Math.max(1, cpu.instrCount),
    stats: cpu.stats,
    calls: cpu.stats.calls,
    stackBytes: 0x7fffeffc - cpu.minSp,
    output: cpu.output,
  }
}

const delays = reactive({ mem: 200, alu: 200, reg: 100 })
const busy = ref(false)
const rows = ref<Row[]>([])
const ncr = ref<{ x: number[]; rec: number[]; dp: number[]; md: number[] } | null>(null)
const fact = ref<{ x: number[]; hw: number[]; sw: number[]; loop: number[] } | null>(null)

function runAll() {
  busy.value = true
  setTimeout(() => {
    rows.value = PROGRAMS.map((p) => runOne(p.id))
    const xs = [2, 4, 6, 8, 10, 12, 14, 16]
    ncr.value = {
      x: xs,
      rec: xs.map((n) => runOne('ncr_rec', { N: n, R: n / 2 }).cycles),
      dp: xs.map((n) => runOne('ncr_dp', { N: n, R: n / 2 }).cycles),
      md: xs.map((n) => runOne('ncr_muldiv', { N: n, R: n / 2 }).cycles),
    }
    const fx = [1, 2, 4, 6, 8, 10, 12]
    fact.value = {
      x: fx,
      hw: fx.map((n) => runOne('factorial_rec', { N: n }).cycles),
      sw: fx.map((n) => runOne('factorial_shiftadd', { N: n }).cycles),
      loop: fx.map((n) => runOne('factorial_loop', { N: n }).cycles),
    }
    busy.value = false
  }, 30)
}

const clockMulti = computed(() => Math.max(delays.mem, delays.alu, delays.reg))
// single-cycle critical path = lw: instruction memory → register read → ALU → data memory → register write
const clockSingle = computed(() => delays.mem + delays.reg + delays.alu + delays.mem + delays.reg)
const fmtTime = (ps: number) => (ps >= 1e6 ? (ps / 1e6).toFixed(2) + ' µs' : ps >= 1e3 ? (ps / 1e3).toFixed(1) + ' ns' : ps + ' ps')
const pct = (s: Stats, ...k: (keyof Stats['byClass'])[]) =>
  ((100 * k.reduce((a, c) => a + s.byClass[c].count, 0)) / Math.max(1, s.instructions - 0)).toFixed(0) + '%'

runAll()
</script>

<template>
  <div class="flex flex-col gap-3 h-full min-h-0 overflow-auto">
    <div class="panel p-4">
      <div class="flex items-center gap-3 mb-3">
        <div>
          <div class="text-[17px] font-semibold">ผลการทดลอง: รันโปรแกรมจริงบน Multi-cycle CPU</div>
          <div class="text-[13px] text-muted">lw = 5 cycle · R-type / I-type / sw = 4 · branch / jump = 3 · mult / div = 36 · mul = 37</div>
        </div>
        <button class="btn btn-primary ml-auto" :disabled="busy" @click="runAll">{{ busy ? 'กำลังรัน…' : 'รันใหม่ทั้งหมด' }}</button>
      </div>
      <div class="overflow-auto">
        <table class="w-full text-[13px]">
          <thead class="text-muted text-[12px] border-b border-line">
            <tr>
              <th class="text-left font-medium py-1.5">โปรแกรม</th>
              <th class="text-left font-medium">พารามิเตอร์</th>
              <th class="text-right font-medium">คำสั่ง (IC)</th>
              <th class="text-right font-medium">Cycle</th>
              <th class="text-right font-medium">CPI</th>
              <th class="text-right font-medium">ALU</th>
              <th class="text-right font-medium">load</th>
              <th class="text-right font-medium">store</th>
              <th class="text-right font-medium">branch/jump</th>
              <th class="text-right font-medium">mul/div</th>
              <th class="text-right font-medium">jal</th>
              <th class="text-right font-medium">stack (byte)</th>
            </tr>
          </thead>
          <tbody class="mono">
            <tr v-for="r in rows" :key="r.id" class="border-b border-soft">
              <td class="py-1.5 font-sans font-medium">{{ r.title }}</td>
              <td class="text-muted">{{ r.params || '—' }}</td>
              <td class="text-right">{{ r.ic.toLocaleString() }}</td>
              <td class="text-right font-bold">{{ r.cycles.toLocaleString() }}</td>
              <td class="text-right">{{ r.cpi.toFixed(2) }}</td>
              <td class="text-right">{{ pct(r.stats, 'alu', 'shift') }}</td>
              <td class="text-right">{{ pct(r.stats, 'load') }}</td>
              <td class="text-right">{{ pct(r.stats, 'store') }}</td>
              <td class="text-right">{{ pct(r.stats, 'branch', 'jump') }}</td>
              <td class="text-right">{{ pct(r.stats, 'muldiv', 'mfhilo') }}</td>
              <td class="text-right">{{ r.calls }}</td>
              <td class="text-right">{{ r.stackBytes }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div class="panel p-4">
        <LineChart
          v-if="ncr"
          title="nCr (r = n/2): recursive โตแบบ exponential"
          x-label="n"
          y-label="cycle (log)"
          :x="ncr.x"
          log
          :series="[
            { name: 'recursive', color: '#e0670a', values: ncr.rec },
            { name: 'DP', color: '#1f63d6', values: ncr.dp },
            { name: 'mul/div', color: '#16803c', values: ncr.md },
          ]"
        />
        <p class="text-[13px] mt-2 leading-relaxed">
          recursive เรียกฟังก์ชัน 2·C(n, r) − 1 ครั้ง จึงโตแบบ exponential ส่วน DP โตแบบ n² ·
          สูตร mul/div ใช้ MDU ครั้งละ 36–37 cycle แต่วนแค่ r รอบ จึงเร็วที่สุด: CPI สูงไม่ได้แปลว่าช้า ต้องดูจำนวน cycle รวม
        </p>
      </div>
      <div class="panel p-4">
        <LineChart
          v-if="fact"
          title="Factorial: MDU (hardware) vs shift-and-add (software)"
          x-label="n"
          y-label="cycle"
          :x="fact.x"
          :series="[
            { name: 'rec + software', color: '#e0670a', values: fact.sw },
            { name: 'rec + mul', color: '#1f63d6', values: fact.hw },
            { name: 'loop + mul', color: '#16803c', values: fact.loop },
          ]"
        />
        <p class="text-[13px] mt-2 leading-relaxed">
          ตัวคูณ Approach 2 ใช้ 32 รอบเสมอ ส่วน shift-and-add ในซอฟต์แวร์วนตามจำนวนบิตของตัวคูณ (n เล็ก)
          แต่ทุกรอบเสีย 4 คำสั่ง × 3–4 cycle
        </p>
      </div>
    </div>

    <div class="panel p-4">
      <div class="text-[15px] font-semibold mb-1">Multi-cycle vs Single-cycle</div>
      <div class="text-[13px] text-muted mb-3">
        Single-cycle: clock = เส้นทางของ lw (mem + reg + ALU + mem + reg) · Multi-cycle: clock = ขั้นที่ช้าที่สุด
        (สมมติ single-cycle มีตัวคูณเร็วที่จบใน 1 cycle)
      </div>
      <div class="flex flex-wrap gap-4 mb-3 text-[13px]">
        <label class="flex items-center gap-1">Memory <input v-model.number="delays.mem" type="number" class="w-16 h-8 rounded-lg border border-line px-2 mono" /> ps</label>
        <label class="flex items-center gap-1">ALU <input v-model.number="delays.alu" type="number" class="w-16 h-8 rounded-lg border border-line px-2 mono" /> ps</label>
        <label class="flex items-center gap-1">Register file <input v-model.number="delays.reg" type="number" class="w-16 h-8 rounded-lg border border-line px-2 mono" /> ps</label>
        <span class="chip bg-soft mono">single clock = {{ clockSingle }} ps</span>
        <span class="chip bg-soft mono">multi clock = {{ clockMulti }} ps</span>
      </div>
      <table class="w-full text-[13px]">
        <thead class="text-muted text-[12px] border-b border-line">
          <tr>
            <th class="text-left font-medium py-1.5">โปรแกรม</th>
            <th class="text-right font-medium">Single-cycle (IC × {{ clockSingle }} ps)</th>
            <th class="text-right font-medium">Multi-cycle (cycle × {{ clockMulti }} ps)</th>
            <th class="text-right font-medium">Multi / Single</th>
          </tr>
        </thead>
        <tbody class="mono">
          <tr v-for="r in rows" :key="r.id" class="border-b border-soft">
            <td class="py-1.5 font-sans">{{ r.title }}</td>
            <td class="text-right">{{ fmtTime(r.ic * clockSingle) }}</td>
            <td class="text-right">{{ fmtTime(r.cycles * clockMulti) }}</td>
            <td class="text-right font-bold" :class="r.cycles * clockMulti < r.ic * clockSingle ? 'text-ok' : 'text-err'">
              {{ ((r.cycles * clockMulti) / (r.ic * clockSingle)).toFixed(2) }}×
            </td>
          </tr>
        </tbody>
      </table>
      <p class="text-[13px] mt-2 text-muted">ต่ำกว่า 1 = multi-cycle เร็วกว่า · โปรแกรมที่ใช้ mul/div เยอะจะช้ากว่าเพราะ MDU ใช้ 36–37 cycle</p>
    </div>
  </div>
</template>
