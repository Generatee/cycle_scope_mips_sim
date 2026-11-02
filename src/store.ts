import { computed, markRaw, reactive, ref } from 'vue'
import { assemble, type Program } from './core/assembler'
import { CPU, type CycleTrace } from './core/cpu'
import { PROGRAMS, defaultParams, renderProgram } from './programs'

const first = PROGRAMS.find((p) => p.id === 'factorial_rec')!

export const sim = reactive({
  programId: first.id,
  params: defaultParams(first) as Record<string, number>,
  source: renderProgram(first, defaultParams(first)),
  editing: false,
  running: false,
  speed: 3, // index into SPEEDS
  hexView: true,
  inputValue: '',
})

export const SPEEDS = [
  { label: '1 cycle/วิ', perSec: 1 },
  { label: '4 cycle/วิ', perSec: 4 },
  { label: '20 cycle/วิ', perSec: 20 },
  { label: '200 cycle/วิ', perSec: 200 },
  { label: 'เร็วสุด', perSec: Infinity },
]

/** bumped after every CPU change so computed values re-evaluate */
export const version = ref(0)
export const cpu = markRaw(new CPU())
export const program = ref<Program>(markRaw(assemble(sim.source)) as Program)
export const trace = ref<CycleTrace | null>(null)
/** recent traces (non-reactive); the last one is the cycle just executed */
const traces: CycleTrace[] = []
export const lastInstrTrace = ref<CycleTrace[]>([]) // traces of the current instruction
function syncInstrTraces() {
  let i = traces.length - 1
  while (i > 0 && traces[i].state !== 0) i--
  lastInstrTrace.value = traces.slice(Math.max(0, i))
  trace.value = traces.length ? traces[traces.length - 1] : null
}
const pendingInput: number[] = []

cpu.inputProvider = () => (pendingInput.length ? pendingInput.shift()! : null)

export function bump() {
  version.value++
}

export function loadProgram(id: string) {
  const p = PROGRAMS.find((x) => x.id === id)!
  sim.programId = id
  sim.params = defaultParams(p)
  sim.source = renderProgram(p, sim.params)
  assembleAndLoad()
}

export function applyParams() {
  const p = PROGRAMS.find((x) => x.id === sim.programId)
  if (!p) return
  sim.source = renderProgram(p, sim.params)
  assembleAndLoad()
}

export function assembleAndLoad() {
  stop()
  const p = markRaw(assemble(sim.source)) as Program
  program.value = p
  if (p.errors.length === 0) {
    cpu.load(p)
    sim.editing = false
  } else {
    sim.editing = true
  }
  traces.length = 0
  syncInstrTraces()
  bump()
}

export function reset() {
  stop()
  if (program.value.errors.length === 0) cpu.load(program.value)
  traces.length = 0
  syncInstrTraces()
  bump()
}

function record(t: CycleTrace | null, sync = true) {
  if (!t) return
  traces.push(markRaw(t) as CycleTrace)
  if (traces.length > 20000) traces.splice(0, 10000)
  if (sync) syncInstrTraces()
}

export function stepCycle() {
  record(cpu.step())
  bump()
}

export function stepInstr() {
  let t = cpu.step()
  record(t)
  while (t && cpu.state !== 0 && !cpu.done && cpu.status !== 'input') {
    t = cpu.step()
    record(t)
  }
  bump()
}

export function stepBack() {
  stop()
  if (cpu.stepBack()) traces.pop()
  syncInstrTraces()
  bump()
}

let timer: number | null = null
let raf: number | null = null

export function stop() {
  sim.running = false
  if (timer !== null) clearInterval(timer)
  if (raf !== null) cancelAnimationFrame(raf)
  timer = raf = null
}

export function run() {
  if (cpu.done) return
  sim.running = true
  const sp = SPEEDS[sim.speed].perSec
  if (sp === Infinity) {
    const loop = () => {
      const t0 = performance.now()
      let last: CycleTrace | null = null
      while (performance.now() - t0 < 30) {
        let n = 0
        while (n++ < 2000) {
          const t = cpu.step()
          if (!t) break
          record(t, false)
          last = t
        }
        if (cpu.done || cpu.status === 'input') break
      }
      if (last) syncInstrTraces()
      bump()
      if (cpu.done || cpu.status === 'input' || !sim.running) return stop()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  } else {
    const perTick = Math.max(1, Math.round(sp / 20))
    const interval = sp >= 20 ? 50 : 1000 / sp
    timer = setInterval(() => {
      for (let i = 0; i < perTick; i++) {
        const t = cpu.step()
        record(t, false)
        if (!t) break
      }
      syncInstrTraces()
      bump()
      if (cpu.done || cpu.status === 'input') stop()
    }, interval) as unknown as number
  }
}

export function submitInput() {
  const v = parseInt(sim.inputValue, 10)
  if (Number.isNaN(v)) return
  pendingInput.push(v)
  sim.inputValue = ''
  cpu.status = 'running'
  stepCycle()
}

/** reactive view helpers */
export const view = computed(() => {
  void version.value
  return {
    cycle: cpu.cycle,
    instr: cpu.instrCount,
    state: cpu.state,
    status: cpu.status,
    error: cpu.error,
    pc: cpu.pc,
    instrPc: cpu.instrPc,
    output: cpu.output,
    cpi: cpu.instrCount ? cpu.cycle / cpu.instrCount : 0,
    canBack: cpu.canStepBack,
    done: cpu.done,
  }
})

assembleAndLoad()


// ---------------- UI size (zoom) ----------------
export const UI_SCALES = [0.9, 1, 1.1, 1.2, 1.35, 1.5]
function autoScale() {
  const w = window.innerWidth
  return w >= 2200 ? 1.35 : w >= 1850 ? 1.2 : w >= 1600 ? 1.1 : 1
}
function loadScale(): number | null {
  try {
    const v = Number(localStorage.getItem('cs-ui-scale'))
    return UI_SCALES.includes(v) ? v : null
  } catch {
    return null
  }
}
export const ui = reactive({ scale: loadScale() ?? autoScale(), auto: loadScale() === null })
export function applyScale() {
  ;(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(ui.scale)
}
export function setScale(dir: 1 | -1 | 0) {
  if (dir === 0) {
    ui.auto = true
    ui.scale = autoScale()
    try { localStorage.removeItem('cs-ui-scale') } catch { /* ignore */ }
  } else {
    const i = UI_SCALES.indexOf(ui.scale)
    const j = Math.min(UI_SCALES.length - 1, Math.max(0, (i < 0 ? 1 : i) + dir))
    ui.scale = UI_SCALES[j]
    ui.auto = false
    try { localStorage.setItem('cs-ui-scale', String(ui.scale)) } catch { /* ignore */ }
  }
  applyScale()
}
window.addEventListener('resize', () => {
  if (ui.auto) {
    ui.scale = autoScale()
    applyScale()
  }
})
applyScale()
