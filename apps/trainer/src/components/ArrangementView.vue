<script setup lang="ts">
import type { ScoredDTO } from '../worker/protocol'
import { describe, Lane, LANE_NAME, XI_NAME } from '@biji/core'
import { computed } from 'vue'
import { pct, signed } from '../format'
import PlayingCard from './PlayingCard.vue'

const props = defineProps<{
  title: string
  s: ScoredDTO
  legalCount: number
  highlight?: boolean
}>()

// 显示顺序与台面一致：头道在上，尾道在下
const rows = computed(() => [Lane.Head, Lane.Middle, Lane.Tail].map(l => ({
  name: LANE_NAME[l],
  cards: props.s.lanes[l],
  label: describe(props.s.strengths[l]),
  first: props.s.laneFirst[l],
})))
const xi = computed(() => props.s.xi.map(x => XI_NAME[x]).join('、'))
</script>

<template>
  <section class="arr" :class="{ highlight }">
    <header>
      <h3>{{ title }}</h3>
      <span class="ev num" :title="`标准误 ±${s.stderr.toFixed(2)}`">{{ signed(s.mean) }}</span>
    </header>
    <div v-for="r in rows" :key="r.name" class="row">
      <span class="pos">{{ r.name }}</span>
      <span class="cards">
        <PlayingCard v-for="c in r.cards" :key="c" :card="c" size="sm" />
      </span>
      <span class="res">
        {{ r.label }}<br>
        第一 <span class="num">{{ pct(r.first) }}</span>
      </span>
    </div>
    <dl class="facts">
      <div><dt>波动 σ</dt><dd class="num">{{ s.std.toFixed(1) }}</dd></div>
      <div><dt>通关</dt><dd class="num">{{ pct(s.sweep) }}</dd></div>
      <div><dt>表估值排名</dt><dd class="num">{{ s.tableRank ? `${s.tableRank} / ${legalCount}` : '—' }}</dd></div>
    </dl>
    <p v-if="s.foul" class="note bad">
      倒水：三道全部垫底{{ xi ? `；仍计牌构成的喜：${xi}` : '' }}
    </p>
    <p v-else-if="xi" class="note">
      成喜：{{ xi }}
    </p>
  </section>
</template>

<style scoped>
.arr {
  border: 1px solid var(--rule);
  border-radius: 10px;
  padding: 12px;
  background: var(--surface);
  display: grid;
  gap: 6px;
}

.arr.highlight {
  border-color: var(--felt);
  background: var(--felt-soft);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

h3 {
  margin: 0;
  font-family: var(--serif);
  font-size: 15px;
}

.ev {
  font-size: 22px;
  font-weight: 600;
}

.row {
  display: grid;
  grid-template-columns: 2.6em auto 1fr;
  gap: 8px;
  align-items: center;
  padding-top: 6px;
  border-top: 1px solid var(--rule);
}

.pos {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 13px;
}

.cards {
  display: inline-flex;
  gap: 3px;
}

.res {
  text-align: right;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.35;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.facts div {
  display: flex;
  gap: 6px;
}

.facts dt,
.facts dd {
  margin: 0;
}

.facts dd {
  color: var(--ink);
}

.note {
  margin: 0;
  font-size: 13px;
  color: var(--felt);
}

.note.bad {
  color: var(--v-foul);
}
</style>
