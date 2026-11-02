<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
  xLabel: string
  yLabel: string
  x: number[]
  series: { name: string; color: string; values: number[] }[]
  log?: boolean
}>()

const W = 560, H = 280, L = 64, R = 130, T = 34, B = 40

const geo = computed(() => {
  const all = props.series.flatMap((s) => s.values).filter((v) => v > 0)
  const max = Math.max(...all, 1)
  const min = props.log ? Math.max(1, Math.min(...all)) : 0
  const lmin = props.log ? Math.floor(Math.log10(min)) : 0
  const lmax = props.log ? Math.ceil(Math.log10(max)) : 0
  const niceMax = props.log ? 10 ** lmax : niceCeil(max)
  const Y = (v: number) =>
    props.log
      ? T + (H - T - B) * (1 - (Math.log10(Math.max(v, 10 ** lmin)) - lmin) / Math.max(1, lmax - lmin))
      : T + (H - T - B) * (1 - v / niceMax)
  const xs = props.x
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(1, xs.length - 1)
  const ticks = props.log
    ? Array.from({ length: lmax - lmin + 1 }, (_, i) => 10 ** (lmin + i))
    : Array.from({ length: 5 }, (_, i) => (niceMax * i) / 4)
  return { Y, X, ticks }
})

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}
const fmtTick = (v: number) => (v >= 1e6 ? v / 1e6 + 'M' : v >= 1e3 ? v / 1e3 + 'k' : String(v))
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="w-full h-auto" role="img" :aria-label="title">
    <text x="0" y="16" font-size="13" font-weight="600" fill="var(--color-ink)">{{ title }}</text>
    <g>
      <template v-for="t in geo.ticks" :key="t">
        <line :x1="L" :x2="W - R" :y1="geo.Y(t)" :y2="geo.Y(t)" stroke="#e3eaf4" />
        <text :x="L - 6" :y="geo.Y(t) + 4" text-anchor="end" font-size="10" fill="var(--color-muted)" class="mono">{{ fmtTick(t) }}</text>
      </template>
      <text v-for="(xv, i) in x" :key="'x' + i" :x="geo.X(i)" :y="H - B + 16" text-anchor="middle" font-size="10" fill="var(--color-muted)" class="mono">{{ xv }}</text>
      <text :x="(L + W - R) / 2" :y="H - 6" text-anchor="middle" font-size="11" fill="var(--color-muted)">{{ xLabel }}</text>
      <text :x="14" :y="(T + H - B) / 2" text-anchor="middle" font-size="11" fill="var(--color-muted)" :transform="`rotate(-90 14 ${(T + H - B) / 2})`">{{ yLabel }}</text>
    </g>
    <g v-for="s in series" :key="s.name">
      <polyline fill="none" :stroke="s.color" stroke-width="2" :points="s.values.map((v, i) => `${geo.X(i)},${geo.Y(v)}`).join(' ')" />
      <circle v-for="(v, i) in s.values" :key="i" :cx="geo.X(i)" :cy="geo.Y(v)" r="2.8" :fill="s.color" />
      <text :x="W - R + 8" :y="geo.Y(s.values[s.values.length - 1]) + 4" font-size="11" font-weight="600" :fill="s.color">{{ s.name }}</text>
    </g>
  </svg>
</template>
