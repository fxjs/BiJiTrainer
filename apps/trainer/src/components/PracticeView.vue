<script setup lang="ts">
import { Lane, LANE_NAME } from '@biji/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { usePracticeStore } from '../stores/practice'
import LaneRow from './LaneRow.vue'
import PlayingCard from './PlayingCard.vue'
import ResultPanel from './ResultPanel.vue'

const practice = usePracticeStore()
const { pool, lanes, foul, complete, selected, phase, result, error, sortMode, source } = storeToRefs(practice)

const arranging = computed(() => phase.value === 'arranging')

// 台面显示顺序：头道在上，尾道在下
const order: Lane[] = [Lane.Head, Lane.Middle, Lane.Tail]

/** 与某一道相关的倒水标记 */
function laneFoul(l: Lane): boolean {
  const f = foul.value
  if (l === Lane.Tail)
    return f.tailMid || f.tailHead
  if (l === Lane.Middle)
    return f.tailMid || f.midHead
  return f.midHead || f.tailHead
}

const foulText = computed(() => {
  const f = foul.value
  if (f.tailMid)
    return '倒水：尾道小于中道'
  if (f.midHead)
    return '倒水：中道小于头道'
  if (f.tailHead)
    return '倒水：尾道小于头道，中道无论怎么摆都会倒水'
  return ''
})

function toggleSort() {
  sortMode.value = sortMode.value === 'suit' ? 'rank' : 'suit'
}

const hint = computed(() => {
  if (selected.value.length > 0)
    return `已选 ${selected.value.length} 张，点某一道放入`
  if (complete.value)
    return foul.value.any ? '可以提交，但会按倒水结算' : '三道已摆满，可以提交'
  return '点选手牌，再点某一道放入；点道内的牌撤回'
})
</script>

<template>
  <div class="practice">
    <p v-if="source.kind === 'review' && phase !== 'result'" class="review-note">
      错题复习：花色已做同色置换
    </p>
    <div class="table">
      <LaneRow
        v-for="l in order"
        :key="l"
        :name="LANE_NAME[l]"
        :cards="lanes[l].cards"
        :label="lanes[l].info.label"
        :foul="laneFoul(l)"
        :droppable="arranging && selected.length > 0 && lanes[l].cards.length < 3"
        :disabled="!arranging"
        @place="practice.place(l)"
        @remove="(c) => practice.unplace(l, c)"
      />
      <p class="status" :class="{ bad: foul.any }" aria-live="polite">
        {{ foulText || hint }}
      </p>
    </div>

    <template v-if="phase !== 'result'">
      <div class="pool" :class="{ empty: pool.length === 0 }">
        <PlayingCard
          v-for="c in pool"
          :key="c"
          :card="c"
          size="md"
          :selected="selected.includes(c)"
          :interactive="arranging"
          @click="practice.toggle(c)"
        />
      </div>

      <div class="bar">
        <button
          type="button"
          class="btn"
          :disabled="!arranging"
          @click="toggleSort"
        >
          按{{ sortMode === 'suit' ? '点数' : '花色' }}排
        </button>
        <button type="button" class="btn" :disabled="!arranging" @click="practice.clear()">
          清空
        </button>
        <button type="button" class="btn" :disabled="!arranging" @click="practice.newHand()">
          换一手
        </button>
        <button
          type="button"
          class="btn primary submit"
          :disabled="!arranging || !complete"
          @click="practice.submit()"
        >
          {{ phase === 'evaluating' ? '模拟中…' : '提交' }}
        </button>
      </div>
      <p v-if="error" class="error" role="alert">
        评估失败：{{ error }}
      </p>
    </template>

    <ResultPanel
      v-else-if="result"
      :result="result"
      :source="source.kind"
      @retry="practice.retry()"
      @next="practice.newHand()"
    />
  </div>
</template>

<style scoped>
.practice {
  display: grid;
  gap: 14px;
}

.review-note {
  margin: 0;
  font-size: 13px;
  color: var(--v-minor);
}

.table {
  background: var(--table);
  border-radius: 14px;
  padding: 10px 8px 6px;
  display: grid;
  gap: 4px;
}

.status {
  margin: 2px 10px 4px;
  font-size: 13px;
  color: var(--table-muted);
}

.status.bad {
  color: #F0A095;
}

.pool {
  display: flex;
  gap: 4px;
  justify-content: center;
  /* 选中的牌上移 8px，预留空间避免被裁切 */
  padding-top: 10px;
  min-height: calc(min(52px, calc((min(100vw, 520px) - 64px) / 9)) * 1.4 + 10px);
}

.pool.empty::before {
  content: "手牌已全部摆入三道";
  align-self: center;
  font-size: 13px;
  color: var(--muted);
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bar .submit {
  margin-left: auto;
  min-width: 6em;
}

.error {
  margin: 0;
  color: var(--v-mistake);
  font-size: 13px;
}
</style>
