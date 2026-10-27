<script setup lang="ts">
import type { Verdict } from '@biji/solver'
import { TAG_TITLE, VERDICT_NAME } from '@biji/solver'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { pct } from '../format'
import { useRecordsStore } from '../stores/records'

const records = useRecordsStore()
const { summary, recent, trendRows } = storeToRefs(records)
const busy = computed(() => records.saving || records.pendingSave || records.loading)

const VERDICTS: Verdict[] = ['best', 'minor', 'mistake', 'foul']

/** 清空需要点两次确认 */
const confirming = ref(false)
async function clear() {
  if (busy.value)
    return
  if (!confirming.value) {
    confirming.value = true
    return
  }
  confirming.value = false
  await records.clearAll()
}

async function refresh() {
  if (busy.value)
    return
  confirming.value = false
  await records.reload()
}
</script>

<template>
  <div class="stats">
    <header class="stats-heading">
      <div>
        <h2>练习统计</h2>
        <p>当前名号的云端记录，自由练习与错题复习计入统计。</p>
      </div>
      <button type="button" class="btn" :disabled="busy" @click="refresh">
        刷新云端记录
      </button>
    </header>

    <section v-if="summary.hands === 0" class="empty">
      <h3>从第一手开始积累判断力</h3>
      <p>完成一手自由练习后，这里会记录最优率、平均损失和错因。每 20 手汇成一组，便于比较不同阶段的表现。</p>
      <span>看过推荐摆法后的重摆不计入统计。</span>
    </section>

    <template v-else>
      <dl class="overview" aria-label="练习概览">
        <div>
          <dt>累计手数</dt>
          <dd class="num">{{ summary.hands }}</dd>
        </div>
        <div>
          <dt>最优率</dt>
          <dd class="num">{{ pct(summary.bestRate, 0) }}</dd>
        </div>
        <div>
          <dt>平均损失 <span>分／手</span></dt>
          <dd class="num">{{ summary.avgLoss.toFixed(2) }}</dd>
        </div>
        <div>
          <dt>最近 {{ recent.hands }} 手最优率</dt>
          <dd class="num">{{ pct(recent.bestRate, 0) }}</dd>
        </div>
      </dl>

      <div class="breakdowns">
        <section class="data-section">
          <h3>评级分布</h3>
          <table>
            <thead>
              <tr>
                <th scope="col">评级</th>
                <th scope="col" class="r">手数</th>
                <th scope="col" class="r">占比</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="v in VERDICTS" :key="v">
                <th scope="row"><span class="verdict" :class="v">{{ VERDICT_NAME[v] }}</span></th>
                <td class="r num">{{ summary.verdicts[v] }}</td>
                <td class="r num">{{ pct(summary.verdicts[v] / summary.hands) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="data-section">
          <h3>错因排行</h3>
          <table v-if="summary.tags.length">
            <thead>
              <tr>
                <th scope="col">错因</th>
                <th scope="col" class="r">次数</th>
                <th scope="col" class="r">占全部手数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in summary.tags" :key="t.code">
                <th scope="row">{{ TAG_TITLE[t.code] }}</th>
                <td class="r num">{{ t.count }}</td>
                <td class="r num">{{ pct(t.count / summary.hands) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else class="no-tags">目前没有识别到错因。继续练习，出现可归类的失误后会在这里汇总。</p>
        </section>
      </div>

      <section class="data-section trend">
        <div class="section-heading">
          <h3>进步趋势</h3>
          <span>每 20 手一组 · 平均损失单位为分／手</span>
        </div>
        <table>
          <thead>
            <tr>
              <th scope="col">手数</th>
              <th scope="col" class="r">最优率</th>
              <th scope="col" class="r">平均损失</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in trendRows" :key="g.from">
              <th scope="row" class="num">{{ g.from }}–{{ g.to }}</th>
              <td class="r num">{{ pct(g.bestRate, 0) }}</td>
              <td class="r num">{{ g.avgLoss.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>

    <section v-if="summary.hands > 0 || records.mistakes.length > 0" class="data-controls" aria-label="名号云端数据管理">
      <div>
        <h3>管理当前名号数据</h3>
        <p :class="{ caution: confirming }">
          {{ confirming ? '将永久删除当前名号云端的全部练习记录与错题，无法撤销。其他名号不受影响。' : '清空会同时删除当前名号云端的练习记录与错题本。' }}
        </p>
      </div>
      <div class="clear-actions">
        <button v-if="confirming" type="button" class="btn" :disabled="busy" @click="confirming = false">
          取消
        </button>
        <button type="button" class="btn danger" :disabled="busy" @click="clear">
          {{ confirming ? '确认清空当前名号云端数据' : '清空当前名号云端数据' }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  gap: 28px;
  min-width: 0;
}

.stats-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

h2 {
  margin: 0;
  font-size: 22px;
  letter-spacing: -.02em;
}

.stats-heading p {
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.btn { min-height: 44px; }

.empty {
  padding: 28px 0;
  border-top: 1px solid var(--rule);
  max-width: 65ch;
}

.empty h3 { margin-bottom: 12px; font-size: 18px; }

.empty p,
.no-tags {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.8;
}

.empty span {
  display: block;
  margin-top: 14px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.overview {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px 16px;
  margin: 0;
  padding: 20px 0;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
}

.overview div { display: grid; gap: 8px; }
.overview dt { color: var(--muted); font-size: 12px; line-height: 1.5; }
.overview dt span { white-space: nowrap; }
.overview dd { margin: 0; font-size: 21px; font-weight: 600; line-height: 1.2; }

.breakdowns { display: grid; gap: 28px; min-width: 0; }
.data-section { min-width: 0; }

h3 {
  margin: 0 0 14px;
  font-size: 16px;
  text-wrap: balance;
}

.section-heading {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin-bottom: 14px;
}

.section-heading h3 { margin: 0; }
.section-heading > span { color: var(--muted); font-size: 12px; line-height: 1.6; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
  line-height: 1.5;
}

th,
td {
  padding: 11px 8px;
  border-bottom: 1px solid var(--rule);
  text-align: left;
  font-weight: 400;
}

th:first-child { padding-left: 0; }
th:last-child,
td:last-child { padding-right: 0; }
thead th { color: var(--muted); font-size: 12px; vertical-align: bottom; }
.r { text-align: right; }
td.num { white-space: nowrap; }

.verdict.best { color: var(--v-best); }
.verdict.minor { color: var(--v-minor); }
.verdict.mistake { color: var(--v-mistake); }
.verdict.foul { color: var(--v-foul); }

.no-tags { padding: 12px 0; }

.data-controls {
  display: grid;
  gap: 16px;
  border-top: 1px solid var(--rule);
  padding-top: 24px;
}

.data-controls h3 { margin-bottom: 6px; font-size: 14px; }
.data-controls p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
.data-controls p.caution { color: var(--gold); }
.clear-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn.danger { color: var(--red); white-space: normal; text-align: left; }

@media (min-width: 720px) {
  .overview { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .breakdowns { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; }
}
</style>
