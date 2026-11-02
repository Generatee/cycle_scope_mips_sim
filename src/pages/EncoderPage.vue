<script setup lang="ts">
import { computed, ref } from 'vue'
import { assemble } from '../core/assembler'
import { decode, disassemble, parseHexWords } from '../core/disassembler'
import { TEXT_BASE, lookup } from '../core/isa'

const single = ref('addi $t0, $sp, -8')
const asmSrc = ref(`main:   li    $a0, 5
        jal   fact
        li    $v0, 10
        syscall
fact:   addi  $sp, $sp, -8
        sw    $ra, 4($sp)
        slti  $t0, $a0, 2
        beq   $t0, $zero, rec
        li    $v0, 1
        jr    $ra
rec:    mul   $v0, $a0, $v0
        jr    $ra`)
const hexSrc = ref(assemble(asmSrc.value).text.map((t) => '0x' + (t.word >>> 0).toString(16).padStart(8, '0')).join('\n'))

const FIELD_COLORS: Record<string, string> = {
  opcode: '#e0670a', rs: '#1f63d6', rt: '#0f8a7e', rd: '#8a3ffc', shamt: '#b0457a', funct: '#c2410c',
  imm: '#16803c', address: '#16803c',
}

function fieldsOf(word: number) {
  const def = lookup(word)
  const b = (word >>> 0).toString(2).padStart(32, '0')
  const fmt = def?.format ?? (word >>> 26 === 0 ? 'R' : 'I')
  const parts =
    fmt === 'R'
      ? [['opcode', 6], ['rs', 5], ['rt', 5], ['rd', 5], ['shamt', 5], ['funct', 6]]
      : fmt === 'I'
        ? [['opcode', 6], ['rs', 5], ['rt', 5], ['imm', 16]]
        : [['opcode', 6], ['address', 26]]
  let i = 0
  return {
    fmt,
    parts: (parts as [string, number][]).map(([name, len]) => {
      const bits = b.slice(i, i + len)
      i += len
      return { name, bits, value: parseInt(bits, 2), color: FIELD_COLORS[name] }
    }),
  }
}

const singleResult = computed(() => {
  const p = assemble(`main: ${single.value}`)
  if (p.errors.length) return { error: p.errors[0].message, words: [] as number[] }
  return { error: '', words: p.text.map((t) => t.word), basics: p.text.map((t) => t.basic) }
})

const asmResult = computed(() => assemble(asmSrc.value))
const hexResult = computed(() => {
  const { words, errors } = parseHexWords(hexSrc.value)
  return { lines: disassemble(words, TEXT_BASE), errors }
})
const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0')
</script>

<template>
  <div class="flex flex-col gap-3 h-full min-h-0 overflow-auto">
    <!-- single instruction -->
    <div class="panel p-4">
      <div class="panel-title mb-2">แปลงทีละคำสั่ง</div>
      <input v-model="single" class="mono w-full max-w-xl h-10 rounded-lg border border-line px-3 text-[15px]" spellcheck="false" />
      <div v-if="singleResult.error" class="text-err text-[13px] mt-2">{{ singleResult.error }}</div>
      <div v-for="(w, k) in singleResult.words" :key="k" class="mt-4">
        <div class="flex items-baseline gap-3 mb-2">
          <span class="chip bg-soft mono">{{ fieldsOf(w).fmt }}-format</span>
          <span class="mono text-[15px] font-bold">0x{{ hex(w) }}</span>
          <span class="mono text-muted text-[13px]">{{ singleResult.basics?.[k] }}</span>
          <span class="text-muted text-[13px]">→ disassemble: <span class="mono text-ink">{{ decode(w, TEXT_BASE).text }}</span></span>
        </div>
        <div class="flex flex-wrap gap-1">
          <div v-for="f in fieldsOf(w).parts" :key="f.name" class="rounded-lg border-2 px-2 py-1.5 text-center" :style="{ borderColor: f.color }">
            <div class="text-[11px] font-semibold" :style="{ color: f.color }">{{ f.name }} · {{ f.bits.length }} บิต</div>
            <div class="mono text-[15px] tracking-wider">{{ f.bits }}</div>
            <div class="mono text-[12px] text-muted">{{ f.value }} · 0x{{ f.value.toString(16) }}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[420px]">
      <!-- assembler -->
      <div class="panel p-4 flex flex-col min-h-0">
        <div class="panel-title mb-2">Assembly → Machine code</div>
        <textarea v-model="asmSrc" spellcheck="false" class="mono text-[12.5px] leading-5 h-56 rounded-lg border border-line p-2 resize-y" />
        <div v-if="asmResult.errors.length" class="text-err text-[12px] mt-2">
          <div v-for="e in asmResult.errors" :key="e.line + e.message">บรรทัด {{ e.line }}: {{ e.message }}</div>
        </div>
        <div class="mt-3 overflow-auto">
          <table class="w-full text-[12px] mono">
            <tbody>
              <tr v-for="t in asmResult.text" :key="t.addr" class="border-b border-soft">
                <td class="py-1 pr-2 text-muted">{{ hex(t.addr) }}</td>
                <td class="py-1 pr-2 font-bold">{{ hex(t.word) }}</td>
                <td class="py-1 pr-2">
                  <span v-for="f in fieldsOf(t.word).parts" :key="f.name" :style="{ color: f.color }" :title="f.name">{{ f.bits }}&#8203;<span class="text-line">|</span></span>
                </td>
                <td class="py-1 whitespace-nowrap">{{ t.basic }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- disassembler -->
      <div class="panel p-4 flex flex-col min-h-0">
        <div class="panel-title mb-2">Machine code (hex) → Assembly</div>
        <textarea v-model="hexSrc" spellcheck="false" class="mono text-[12.5px] leading-5 h-56 rounded-lg border border-line p-2 resize-y" />
        <div v-if="hexResult.errors.length" class="text-err text-[12px] mt-2">
          <div v-for="e in hexResult.errors" :key="e.line + e.message">บรรทัด {{ e.line }}: {{ e.message }}</div>
        </div>
        <pre class="mono text-[12.5px] mt-3 overflow-auto leading-6"><template v-for="l in hexResult.lines" :key="l.addr"><span class="text-muted">{{ hex(l.addr) }}  </span><span class="text-brand font-bold">{{ (l.label ? l.label + ':' : '').padEnd(6) }}</span>{{ l.text }}
</template></pre>
      </div>
    </div>
  </div>
</template>
