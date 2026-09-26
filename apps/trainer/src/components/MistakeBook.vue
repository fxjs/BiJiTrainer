<script setup lang="ts">
import type { MistakeItem } from '../review/srs'
import { TAG_TITLE, VERDICT_NAME } from '@biji/solver'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { sortCards } from '../practice/board'
import { INTERVAL_DAYS, isDue } from '../review/srs'
import { useRecordsStore } from '../stores/records'
import PlayingCard from './PlayingCard.vue'

const emit = defineEmits<{ review: [item: MistakeItem] }>()

const records = useRecordsStore()
const { mistakes, dueMistakes } = storeToRefs(records)

const DAY = 86_400_000

// 到期的排在前面，其余按到期时间
const items = computed(() => [...mistakes.value].sort((a, b) => a.due - b.due))

function dueText(m: MistakeItem): string {
  const now = Date.now()
  if (isDue(m, now))
    return '已到期'
  const days = Math.ceil((m.due - now) / DAY)
  return `${days} 天后`
}

function tagText(m: MistakeItem): string {
  return m.tags.filter(t => t !== 'other').map(t => TAG_TITLE[t]).join('、') || '—'
}
</script>

<template>
  <div class="book">
    <header>
      <p>
        到期 <span class="num">{{ dueMistakes.length }}</span> 手，共 <span class="num">{{ mistakes.length }}</span> 手。
        评为明显失误或倒水的手牌会自动加入；复习评为最优 {{ INTERVAL_DAYS.length }} 次后移出，
        每次间隔依次为 {{ INTERVAL_DAYS.slice(1).join('、') }} 天，其间再次失误则从头开始。
      </p>
      <button
        type="button"
        class="btn primary"
        :disabled="dueMistakes.length === 0"
        @click="emit('review', dueMistakes[0])"
      >
        复习下一手到期错题
      </button>
    </header>

    <p v-if="items.length === 0" class="empty">
      错题本是空的。
    </p>

    <ul v-else class="list">
      <li v-for="m in items" :key="m.id" :class="{ due: isDue(m, Date.now()) }">
        <div class="cards">
          <PlayingCard v-for="c in sortCards(m.hand, 'suit')" :key="c" :card="c" size="sm" />
        </div>
        <div class="meta">
          <span>{{ tagText(m) }}</span>
          <span class="num">
            上次{{ VERDICT_NAME[m.lastVerdict] }}，损失 {{ m.lastEvLoss.toFixed(1) }} 分 · 第 {{ m.box }} 盒 · {{ dueText(m) }} · 已练 {{ m.attempts }} 次
          </span>
        </div>
        <div class="ops">
          <button type="button" class="btn" @click="emit('review', m)">
            复习
          </button>
          <button type="button" class="btn" @click="records.removeMistake(m.id)">
            删除
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.book {
  display: grid;
  gap: 14px;
}

header {
  display: grid;
  gap: 10px;
}

header p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

header .btn {
  justify-self: start;
}

.empty {
  margin: 0;
  color: var(--muted);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.list li {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--rule);
  background: var(--surface);
}

.list li.due {
  border-color: var(--v-minor);
}

.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.meta {
  display: grid;
  gap: 2px;
  font-size: 13px;
}

.meta .num {
  font-size: 12px;
  color: var(--muted);
}

.ops {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
