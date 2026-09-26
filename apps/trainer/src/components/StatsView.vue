<script setup lang="ts">
import type { Verdict } from '@biji/solver'
import { TAG_TITLE, VERDICT_NAME } from '@biji/solver'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'
import { pct } from '../format'
import { useRecordsStore } from '../stores/records'

const records = useRecordsStore()
const { summary, recent, trendRows, persistent, error } = storeToRefs(records)

const VERDICTS: Verdict[] = ['best', 'minor', 'mistake', 'foul']

/** 清空需要点两次确认 */
const confirming = ref(false)
async function clear() {
  if (!confirming.value) {
    confirming.value = true
    return
  }
  confirming.value = false
  await records.clearAll()
}
</script>

<template>
  <div class="stats">
    <p v-if="!persistent" class="warn">
      浏览器不允许使用 IndexedDB（可能处于隐私模式），记录只保存在本次会话中。
    </p>
    <p v-if="error" class="warn">
      存储出错：{{ error }}
    </p>

    <p v-if="summary.hands === 0" class="empty">
      还没有练习记录。重摆的结果不计入统计。
    </p>

    <template v-else>
      <section class="kpis">
        <div>
          <span class="v num">{{ summary.hands }}</span>
          <span class="l">累计手数</span>
        </div>
        <div>
          <span class="v num">{{ pct(summary.bestRate, 0) }}</span>
          <span class="l">最优率</span>
        </div>
        <div>
          <span class="v num">{{ summary.avgLoss.toFixed(2) }}</span>
          <span class="l">平均损失（分／手）</span>
        </div>
        <div>
          <span class="v num">{{ pct(recent.bestRate, 0) }}</span>
          <span class="l">最近 {{ recent.hands }} 手最优率</span>
        </div>
      </section>

      <section>
        <h3>评级分布</h3>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>评级</th>
                <th class="r">
                  手数
                </th>
                <th class="r">
                  占比
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in VERDICTS" :key="v">
                <td>{{ VERDICT_NAME[v] }}</td>
                <td class="r num">
                  {{ summary.verdicts[v] }}
                </td>
                <td class="r num">
                  {{ pct(summary.verdicts[v] / summary.hands) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="summary.tags.length">
        <h3>错因排行</h3>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>错因</th>
                <th class="r">
                  次数
                </th>
                <th class="r">
                  占全部手数
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in summary.tags" :key="t.code">
                <td>{{ TAG_TITLE[t.code] }}</td>
                <td class="r num">
                  {{ t.count }}
                </td>
                <td class="r num">
                  {{ pct(t.count / summary.hands) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3>进步趋势（每 20 手一组）</h3>
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th>手数</th>
                <th class="r">
                  最优率
                </th>
                <th class="r">
                  平均损失
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in trendRows" :key="g.from">
                <td class="num">
                  {{ g.from }}–{{ g.to }}
                </td>
                <td class="r num">
                  {{ pct(g.bestRate, 0) }}
                </td>
                <td class="r num">
                  {{ g.avgLoss.toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <button type="button" class="btn danger" @click="clear">
      {{ confirming ? '再点一次确认清空全部记录与错题本' : '清空全部数据' }}
    </button>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  gap: 18px;
}

.warn {
  margin: 0;
  font-size: 13px;
  color: var(--v-minor);
}

.empty {
  margin: 0;
  color: var(--muted);
}

.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 12px;
}

.kpis div {
  display: grid;
}

.kpis .v {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}

.kpis .l {
  font-size: 12px;
  color: var(--muted);
}

h3 {
  margin: 0 0 6px;
  font-family: var(--serif);
  font-size: 16px;
}

.scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

th {
  font-weight: 500;
  font-size: 12px;
  color: var(--muted);
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid var(--rule);
}

td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--rule);
}

.r {
  text-align: right;
}

.btn.danger {
  justify-self: start;
  color: var(--v-mistake);
}
</style>
