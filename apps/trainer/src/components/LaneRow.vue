<script setup lang="ts">
import type { Card } from '@biji/core'
import { computed } from 'vue'
import { LANE_CAPACITY } from '../practice/board'
import PlayingCard from './PlayingCard.vue'

const props = defineProps<{
  name: string
  cards: readonly Card[]
  /** 摆满后的牌型描述 */
  label: string | null
  /** 与相邻道构成倒水 */
  foul: boolean
  /** 当前有选中的牌且本道还有空位，可以放入 */
  droppable: boolean
  disabled: boolean
  /** 可以把整道牌移向头道/尾道 */
  canMoveUp: boolean
  canMoveDown: boolean
}>()

const emit = defineEmits<{
  place: []
  remove: [card: Card]
  move: [dir: -1 | 1]
}>()

const empty = computed(() => Math.max(0, LANE_CAPACITY - props.cards.length))

/** 点击道内的牌是撤回，阻止冒泡到整行（整行点击是放入） */
function onCardClick(e: MouseEvent, card: Card) {
  e.stopPropagation()
  emit('remove', card)
}

function onRowClick() {
  if (!props.disabled && props.droppable)
    emit('place')
}
</script>

<template>
  <div
    class="lane"
    :class="{ droppable, foul }"
    role="button"
    :tabindex="droppable && !disabled ? 0 : -1"
    :aria-label="`${name}${droppable ? '，点击放入选中的牌' : ''}`"
    @click="onRowClick"
    @keydown.enter.prevent="onRowClick"
  >
    <div class="meta">
      <span class="name">{{ name }}</span>
      <span class="label">{{ label ?? `${cards.length}/3` }}</span>
    </div>
    <div class="slots">
      <PlayingCard
        v-for="c in cards"
        :key="c"
        :card="c"
        size="lg"
        :interactive="!disabled"
        @click="(e: MouseEvent) => onCardClick(e, c)"
      />
      <span v-for="i in empty" :key="`e${i}`" class="slot" />
    </div>
    <div class="move">
      <button
        type="button"
        class="move-btn"
        title="整道上移"
        aria-label="整道上移"
        :disabled="!canMoveUp"
        @click.stop="emit('move', 1)"
      >
        ↑
      </button>
      <button
        type="button"
        class="move-btn"
        title="整道下移"
        aria-label="整道下移"
        :disabled="!canMoveDown"
        @click.stop="emit('move', -1)"
      >
        ↓
      </button>
    </div>
  </div>
</template>

<style scoped>
.lane {
  display: grid;
  grid-template-columns: 3.6em 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 10px;
  border: 1px dashed transparent;
  transition: background-color .12s ease, border-color .12s ease;
}

.lane.droppable {
  border-color: var(--gold);
  background: rgba(240, 198, 107, .08);
  cursor: pointer;
}

.lane.foul {
  border: 1px solid #E7766A;
  background: rgba(231, 118, 106, .12);
}

.meta {
  display: grid;
  gap: 2px;
  color: var(--table-ink);
}

.name {
  font-family: var(--serif);
  font-weight: 700;
  font-size: 16px;
}

.label {
  font-size: 12px;
  color: var(--table-muted);
  line-height: 1.3;
}

.slots {
  display: flex;
  gap: 6px;
  justify-content: flex-start;
}

.move {
  display: grid;
  gap: 4px;
}

.move-btn {
  width: 26px;
  height: 24px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, .25);
  border-radius: 6px;
  background: rgba(255, 255, 255, .06);
  color: var(--table-ink);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}

.move-btn:disabled {
  opacity: .25;
  cursor: default;
}

.slot {
  width: min(58px, 15vw);
  height: calc(min(58px, 15vw) * 1.4);
  border: 1px dashed rgba(255, 255, 255, .28);
  border-radius: 7px;
}
</style>
