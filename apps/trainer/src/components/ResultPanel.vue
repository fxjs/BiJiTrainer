<script setup lang="ts">
import type { GradeDTO } from '../worker/protocol'
import { VERDICT_NAME } from '@biji/solver'
import { computed, ref } from 'vue'
import { signed } from '../format'
import ArrangementView from './ArrangementView.vue'

const props = defineProps<{ result: GradeDTO }>()
defineEmits<{ retry: [], next: [] }>()

const showAlternatives = ref(false)

/** 玩家摆法就是推荐摆法时，只显示一份 */
const sameAsBest = computed(() =>
  props.result.player.lanes.every((l, i) =>
    [...l].sort((a, b) => a - b).join() === [...props.result.best.lanes[i]].sort((a, b) => a - b).join()))

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
    <div class="verdict" :class="result.verdict">
      <strong>{{ VERDICT_NAME[result.verdict] }}</strong>
      <span>{{ summary }}</span>
    </div>

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

    <div v-if="result.alternatives.length" class="alts">
      <button type="button" class="link" @click="showAlternatives = !showAlternatives">
        {{ showAlternatives ? '收起' : '查看' }}其他 {{ result.alternatives.length }} 个候选
      </button>
      <template v-if="showAlternatives">
        <ArrangementView
          v-for="(a, i) in result.alternatives"
          :key="i"
          :title="`候选 ${i + 1}（差 ${signed(-a.gap)}）`"
          :s="a"
          :legal-count="result.legalCount"
        />
      </template>
    </div>

    <p class="foot">
      模拟 {{ result.samples }} 局：其余 45 张随机发给 5 名对手，对手按胜率表摆牌。
      大数为平均得分（分／手），效用 = 平均 − {{ result.lambda }} × σ。用时 {{ result.elapsedMs }} ms。
    </p>

    <div class="actions">
      <button type="button" class="btn" @click="$emit('retry')">
        重摆这一手
      </button>
      <button type="button" class="btn primary" @click="$emit('next')">
        下一手
      </button>
    </div>
  </div>
</template>

<style scoped>
.result {
  display: grid;
  gap: 12px;
}

.verdict {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  border-radius: 10px;
  border-left: 5px solid currentColor;
  background: var(--surface);
}

.verdict strong {
  font-family: var(--serif);
  font-size: 20px;
}

.verdict span {
  color: var(--ink);
  font-size: 14px;
}

.verdict.best { color: var(--v-best); }
.verdict.minor { color: var(--v-minor); }
.verdict.mistake { color: var(--v-mistake); }
.verdict.foul { color: var(--v-foul); }

.alts {
  display: grid;
  gap: 10px;
}

.link {
  justify-self: start;
  background: none;
  border: none;
  padding: 0;
  color: var(--felt);
  cursor: pointer;
  text-decoration: underline;
}

.foot {
  margin: 0;
  font-size: 12px;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
