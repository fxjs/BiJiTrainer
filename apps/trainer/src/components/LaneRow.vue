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
    role="group"
    :aria-label="`${name}，${cards.length} 张${foul ? '，倒水' : ''}`"
    @click="onRowClick"
  >
    <div class="meta">
      <button
        type="button"
        class="place-target"
        :disabled="disabled || !droppable"
        :aria-label="`将选中的牌放入${name}`"
        @click.stop="onRowClick"
      >
        {{ name }}
      </button>
      <span class="label">{{ label ?? `${cards.length} / 3` }}</span>
      <span v-if="foul" class="foul-label">倒水</span>
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
      <span v-for="i in empty" :key="`e${i}`" class="slot" aria-hidden="true">
        <span>{{ droppable ? '+' : '·' }}</span>
      </span>
    </div>
    <div class="move">
      <button
        type="button"
        class="move-btn"
        title="整道上移"
        :aria-label="`${name}整道上移`"
        :disabled="!canMoveUp"
        @click.stop="emit('move', 1)"
      >
        ↑
      </button>
      <button
        type="button"
        class="move-btn"
        title="整道下移"
        :aria-label="`${name}整道下移`"
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
  --lane-card-width: 58px;
  position: relative;
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) 44px;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
}

.lane.droppable {
  border-color: var(--gold);
  cursor: pointer;
}

.lane.foul {
  background: color-mix(in srgb, var(--red) 9%, var(--table));
}

.meta {
  display: grid;
  align-content: center;
  justify-items: start;
  min-width: 0;
  gap: 3px;
}

.place-target {
  min-height: 44px;
  margin: -8px 0 -4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--table-ink);
  font-size: 16px;
  font-weight: 650;
  cursor: pointer;
}

.place-target:disabled {
  opacity: 1;
  cursor: default;
}

.droppable .place-target {
  color: var(--gold);
  text-decoration: underline;
  text-underline-offset: 5px;
}

.label {
  color: var(--table-muted);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.foul-label {
  color: var(--red);
  font-size: 11px;
  line-height: 1.3;
}

.slots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.move {
  display: grid;
  gap: 2px;
}

.move-btn {
  display: grid;
  place-items: center;
  width: 44px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--rule);
  border-radius: 6px;
  background: var(--table);
  color: var(--table-ink);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: transform var(--motion-fast) var(--ease-out);
}

.move-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.move-btn:disabled {
  opacity: .3;
  cursor: default;
}

.slot {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--lane-card-width);
  height: calc(var(--lane-card-width) * 1.4);
  border: 1px dashed var(--rule);
  border-radius: 6px;
  color: var(--table-muted);
  font-size: 20px;
}

.droppable .slot {
  border-color: var(--gold);
  color: var(--gold);
}

.move-btn:focus-visible,
.place-target:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 3px;
}

@media (hover: hover) {
  .move-btn:hover:not(:disabled) {
    background: var(--felt-soft);
    border-color: var(--table-muted);
  }
}

@media (max-width: 540px) {
  .lane {
    --lane-card-width: min(52px, 12vw);
    grid-template-columns: 48px minmax(0, 1fr) 44px;
    gap: 6px;
    padding: 2px 6px;
  }

  .slots {
    gap: 4px;
  }

  .place-target {
    font-size: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .move-btn {
    transition: none;
  }
}
</style>
