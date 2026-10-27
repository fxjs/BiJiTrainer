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
      <div class="score">
        <span class="ev num">{{ signed(s.mean) }}</span>
        <span class="score-label">平均得分／手</span>
      </div>
    </header>
    <div class="lanes">
      <div v-for="r in rows" :key="r.name" class="row">
        <span class="pos">{{ r.name }}</span>
        <span class="cards">
          <PlayingCard v-for="c in r.cards" :key="c" :card="c" size="sm" />
        </span>
        <span class="res">
          <strong>{{ r.label }}</strong>
          <span>第一 <span class="num">{{ pct(r.first) }}</span></span>
        </span>
      </div>
    </div>
    <dl class="facts">
      <div><dt>标准误</dt><dd class="num">±{{ s.stderr.toFixed(2) }}</dd></div>
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
  min-width: 0;
  border: 1px solid var(--rule);
  border-radius: 12px;
  padding: 16px;
  background: var(--surface);
  display: grid;
  align-content: start;
  gap: 16px;
}

.arr.highlight {
  border-color: var(--felt);
  background: var(--table);
}

header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 16px;
}

h3 {
  margin: 0;
  font-size: 16px;
  line-height: 1.4;
  text-wrap: balance;
}

.score {
  display: grid;
  justify-items: end;
  gap: 2px;
}

.ev {
  font-size: 24px;
  font-weight: 650;
  line-height: 1.1;
  letter-spacing: -.02em;
}

.highlight .ev { color: var(--felt); }

.score-label {
  color: var(--muted);
  font-size: 11px;
}

.lanes { border-top: 1px solid var(--rule); }

.row {
  display: grid;
  grid-template-columns: 2.2em auto minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--rule);
}

.pos {
  color: var(--muted);
  font-weight: 600;
  font-size: 13px;
}

.cards {
  display: inline-flex;
  gap: 3px;
}

.res {
  display: grid;
  gap: 3px;
  text-align: right;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.res strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 500;
}

.facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px 16px;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.facts div {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 2px 8px;
}

.facts dt,
.facts dd { margin: 0; }
.facts dt { color: var(--muted); }
.facts dd { color: var(--ink); }

.note {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--felt);
}

.note.bad { color: var(--v-foul); }

@media (max-width: 380px) {
  .arr { padding: 12px; }
  .row { gap: 6px; }
  .facts { column-gap: 10px; }
}
</style>
