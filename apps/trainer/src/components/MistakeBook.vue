<script setup lang="ts">
import type { MistakeItem } from '../review/srs'
import { TAG_TITLE, VERDICT_NAME } from '@biji/solver'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { sortCards } from '../practice/board'
import { INTERVAL_DAYS, isDue } from '../review/srs'
import { useRecordsStore } from '../stores/records'
import { sound } from '../sound'
import PlayingCard from './PlayingCard.vue'

const emit = defineEmits<{ review: [item: MistakeItem] }>()

const records = useRecordsStore()
const { mistakes, dueMistakes } = storeToRefs(records)
const busy = computed(() => records.saving || records.pendingSave || records.loading || !records.ready)

const DAY = 86_400_000

// 到期的排在前面，其余按到期时间
const items = computed(() => [...mistakes.value].sort((a, b) => a.due - b.due))
const PAGE_SIZE = 20
const page = ref(0)
const book = ref<HTMLElement | null>(null)
const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / PAGE_SIZE)))
const visibleItems = computed(() => items.value.slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE))
watch(pageCount, count => { page.value = Math.min(page.value, count - 1) })

function changePage(next: number) {
  page.value = Math.max(0, Math.min(next, pageCount.value - 1))
  book.value?.scrollIntoView({ block: 'start', behavior: 'instant' })
  sound.play('ui')
}

function dueText(m: MistakeItem): string {
  const now = Date.now()
  if (isDue(m, now))
    return '已到期'
  const days = Math.ceil((m.due - now) / DAY)
  return `${days} 天后`
}

function tagText(m: MistakeItem): string {
  return m.tags.filter(t => t !== 'other').map(t => TAG_TITLE[t]).join('、') || '未分类错因'
}
</script>

<template>
  <div ref="book" class="book">
    <header class="book-heading">
      <div>
        <h2>错题复习</h2>
        <p class="counts">
          <span class="due-count">到期 <strong class="num">{{ dueMistakes.length }}</strong> 手</span>
          <span>共 <span class="num">{{ mistakes.length }}</span> 手</span>
        </p>
      </div>
      <button
        type="button"
        class="btn primary"
        :disabled="dueMistakes.length === 0 || busy"
        @click="emit('review', dueMistakes[0])"
      >
        复习下一手到期错题
      </button>
    </header>

    <details class="review-rules">
      <summary>复习间隔如何安排？</summary>
      <p>
        明显失误或倒水的手牌会自动加入。复习评为最优 {{ INTERVAL_DAYS.length }} 次后移出，
        每次间隔依次为 {{ INTERVAL_DAYS.slice(1).join('、') }} 天；其间再次失误则从头开始。
      </p>
    </details>

    <section v-if="items.length === 0" class="empty">
      <h3>没有需要复盘的手牌</h3>
      <p>自由练习中出现明显失误或倒水时，这手牌会自动收进来。复习时先独立摆牌，再与推荐摆法比较。</p>
      <span>看过答案后的重摆不会新增错题。</span>
    </section>

    <template v-else>
      <p v-if="dueMistakes.length === 0" class="caught-up">
        本轮没有到期错题。下一手将在 {{ dueText(items[0]) }} 到期，也可以提前选择一手复习。
      </p>
      <ul class="list" aria-label="按到期时间排序的错题">
        <li v-for="m in visibleItems" :key="m.id">
          <div class="item-heading">
            <h3>{{ tagText(m) }}</h3>
            <span class="due-label" :class="{ due: isDue(m, Date.now()) }">{{ dueText(m) }}</span>
          </div>
          <div class="cards" aria-label="原始手牌">
            <PlayingCard v-for="c in sortCards(m.hand, 'suit')" :key="c" :card="c" size="sm" />
          </div>
          <p class="last-result">
            上次<span :class="`verdict-${m.lastVerdict}`">{{ VERDICT_NAME[m.lastVerdict] }}</span>
            <span class="loss">损失 <strong class="num">{{ m.lastEvLoss.toFixed(1) }}</strong> 分／手</span>
          </p>
          <div class="item-footer">
            <span class="schedule num">第 {{ m.box }} 盒 · 已练 {{ m.attempts }} 次</span>
            <div class="ops">
              <button type="button" class="btn" :disabled="busy" @click="emit('review', m)">
                复习
              </button>
              <button type="button" class="btn remove" :disabled="busy" :aria-label="`删除错题：${tagText(m)}`" @click="records.removeMistake(m.id)">
                删除
              </button>
            </div>
          </div>
        </li>
      </ul>
      <nav v-if="pageCount > 1" class="pagination" aria-label="错题分页">
        <button type="button" class="btn" :disabled="busy || page === 0" @click="changePage(page - 1)">上一页</button>
        <span class="num" aria-live="polite">第 {{ page + 1 }} / {{ pageCount }} 页 · 每页 {{ PAGE_SIZE }} 手</span>
        <button type="button" class="btn" :disabled="busy || page + 1 >= pageCount" @click="changePage(page + 1)">下一页</button>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.book {
  display: grid;
  gap: 20px;
  min-width: 0;
}

.pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.pagination span { color: var(--muted); font-size: 12px; }

.book-heading {
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

.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--muted);
}

.due-count { color: var(--gold); }
.btn { min-height: 44px; }

.review-rules {
  font-size: 13px;
  line-height: 1.7;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  color: var(--muted);
}

.review-rules summary {
  padding: 12px 0;
  cursor: pointer;
  color: var(--ink);
}

.review-rules summary:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}

.review-rules p { margin: 0 0 14px; max-width: 75ch; }

.empty {
  padding: 28px 0;
  max-width: 60ch;
}

.empty h3 {
  margin: 0 0 12px;
  font-size: 18px;
}

.empty p,
.empty span,
.caught-up {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.8;
}

.empty span {
  display: block;
  margin-top: 12px;
  font-size: 13px;
}

.caught-up { color: var(--felt); }

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}

.list li {
  min-width: 0;
  display: grid;
  gap: 14px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--rule);
  background: var(--surface);
}

.item-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.item-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.due-label {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.due-label.due { color: var(--gold); }

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 2px;
}

.last-result {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--muted);
}

.verdict-best { color: var(--v-best); }
.verdict-minor { color: var(--v-minor); }
.verdict-mistake { color: var(--v-mistake); }
.verdict-foul { color: var(--v-foul); }
.loss { margin-left: 8px; }
.loss strong { color: var(--ink); font-weight: 500; }

.item-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--rule);
  padding-top: 12px;
}

.schedule { color: var(--muted); font-size: 12px; }
.ops { display: flex; gap: 8px; margin-left: auto; }
.remove { color: var(--red); }

@media (max-width: 380px) {
  .list li { padding: 12px; }
  .book-heading > .btn { width: 100%; }
}
</style>
