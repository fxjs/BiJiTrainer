<script setup lang="ts">
import type { PracticeSource } from '../stores/records'
import type { GradeDTO } from '../worker/protocol'
import { VERDICT_NAME } from '@biji/solver'
import { computed, ref } from 'vue'
import { signed } from '../format'
import ArrangementView from './ArrangementView.vue'

const props = defineProps<{ result: GradeDTO, source: PracticeSource['kind'], blocked?: boolean }>()
defineEmits<{ retry: [], next: [] }>()

const showAlternatives = ref(false)

/** 玩家摆法就是推荐摆法时，只显示一份 */
const sameAsBest = computed(() =>
  props.result.player.lanes.every((l, i) =>
    [...l].sort((a, b) => a - b).join() === [...props.result.best.lanes[i]].sort((a, b) => a - b).join()))

const sourceNote = computed(() => ({
  free: '',
  review: '错题复习：最优则按间隔推迟下次复习，失误则重新开始。',
  retry: '重摆：看过推荐摆法后的结果，不计入记录与错题本。',
})[props.source])

const summary = computed(() => {
  const r = props.result
  switch (r.verdict) {
    case 'best':
      return sameAsBest.value
        ? '与推荐摆法一致。'
        : '与推荐摆法的差距在抽样误差内，同样算最优。'
    case 'foul':
      return `倒水按三道全部垫底结算，比推荐摆法少 ${r.evLoss.toFixed(1)} 分。`
    default:
      return `比推荐摆法平均少 ${r.evLoss.toFixed(1)} 分／手。`
  }
})
</script>

<template>
  <div class="result">
    <header class="verdict" :class="result.verdict">
      <strong>{{ VERDICT_NAME[result.verdict] }}</strong>
      <p>{{ summary }}</p>
    </header>

    <p v-if="sourceNote" class="source">
      {{ sourceNote }}
    </p>

    <ul v-if="result.tags.length" class="tags" aria-label="本手复盘要点">
      <li v-for="t in result.tags" :key="t.code">
        <strong>{{ t.title }}</strong>
        <span>{{ t.detail }}</span>
      </li>
    </ul>

    <div class="comparison">
      <ArrangementView
        title="你的摆法"
        :s="result.player"
        :legal-count="result.legalCount"
        :highlight="sameAsBest"
      />
      <ArrangementView
        v-if="!sameAsBest"
        title="推荐摆法"
        :s="result.best"
        :legal-count="result.legalCount"
        highlight
      />
    </div>

    <details v-if="result.alternatives.length" class="alts" @toggle="showAlternatives = ($event.target as HTMLDetailsElement).open">
      <summary>其他 {{ result.alternatives.length }} 个候选摆法</summary>
      <div v-if="showAlternatives" class="alternative-list">
        <ArrangementView
          v-for="(a, i) in result.alternatives"
          :key="i"
          :title="`候选 ${i + 1}（差 ${signed(-a.gap)}）`"
          :s="a"
          :legal-count="result.legalCount"
        />
      </div>
    </details>

    <p class="foot">
      模拟 {{ result.samples }} 局：其余 45 张随机发给 5 名对手，对手按胜率表摆牌。
      平均得分单位为分／手，推荐摆法取平均得分最高者。用时 {{ result.elapsedMs }} ms。
    </p>

    <div class="actions">
      <button type="button" class="btn" :disabled="blocked" @click="$emit('retry')">
        重摆这一手
      </button>
      <button type="button" class="btn primary" :disabled="blocked" @click="$emit('next')">
        下一手
      </button>
    </div>
  </div>
</template>

<style scoped>
.result {
  display: grid;
  gap: 20px;
  min-width: 0;
}

.verdict {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px 18px;
  padding: 18px 0;
  border-bottom: 1px solid var(--rule);
}

.verdict strong {
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -.02em;
}

.verdict p {
  margin: 0;
  color: var(--ink);
  font-size: 14px;
  line-height: 1.65;
}

.verdict.best { color: var(--v-best); }
.verdict.minor { color: var(--v-minor); }
.verdict.mistake { color: var(--v-mistake); }
.verdict.foul { color: var(--v-foul); }

.source,
.foot {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
  max-width: 75ch;
}

.tags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.tags li {
  display: grid;
  gap: 4px;
  font-size: 14px;
  line-height: 1.6;
}

.tags strong { color: var(--gold); }
.tags span { color: var(--muted); }

.comparison,
.alternative-list {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.alts {
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.alts summary {
  padding: 14px 0;
  min-height: 44px;
  box-sizing: border-box;
  color: var(--felt);
  font-size: 14px;
  cursor: pointer;
}

.alts summary:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 4px;
}

.alternative-list { padding-bottom: 16px; }

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.actions .btn { min-height: 44px; }

@media (min-width: 800px) {
  .comparison,
  .alternative-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 420px) {
  .actions .btn { flex: 1; }
}
</style>
