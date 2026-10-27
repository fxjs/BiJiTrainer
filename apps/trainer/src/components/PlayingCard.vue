<script setup lang="ts">
import type { Card } from '@biji/core'
import { BIG_JOKER, isJoker, isRedSuit, suitOf } from '@biji/core'
import { computed } from 'vue'
import { rankText, SUIT_SYMBOL } from '../practice/board'

const props = withDefaults(defineProps<{
  card: Card
  /** sm 结果页小牌；md 响应式手牌；lg 三道中的牌 */
  size?: 'sm' | 'md' | 'lg'
  selected?: boolean
  /** 可点击时渲染为 button */
  interactive?: boolean
}>(), { size: 'md', selected: false, interactive: false })

defineEmits<{ click: [e: MouseEvent] }>()

const joker = computed(() => isJoker(props.card))
// 大王红色，小王黑色，与它们能补的花色颜色一致
const red = computed(() => {
  if (joker.value)
    return props.card === BIG_JOKER
  return isRedSuit(suitOf(props.card)!)
})
const rank = computed(() => rankText(props.card))
const suit = computed(() => (joker.value ? '王' : SUIT_SYMBOL[suitOf(props.card)!]))
const aria = computed(() => (joker.value ? (props.card === BIG_JOKER ? '大王' : '小王') : `${suit.value}${rank.value}`))
</script>

<template>
  <component
    :is="interactive ? 'button' : 'span'"
    :type="interactive ? 'button' : undefined"
    class="pc"
    :class="[size, { red, joker, selected }]"
    :aria-label="aria"
    :aria-pressed="interactive ? selected : undefined"
    @click="(e: MouseEvent) => interactive && $emit('click', e)"
  >
    <b aria-hidden="true">{{ rank }}</b>
    <i aria-hidden="true">{{ suit }}</i>
    <span class="selected-mark" aria-hidden="true">✓</span>
  </component>
</template>

<style scoped>
.pc {
  --w: 38px;
  position: relative;
  display: inline-block;
  flex: none;
  width: var(--w);
  height: calc(var(--w) * 1.4);
  padding: 0;
  border: 1px solid var(--card-edge);
  border-radius: 6px;
  background: var(--card);
  box-shadow: 0 2px 0 rgb(0 0 0 / .2);
  color: var(--card-ink);
  font-family: var(--sans);
  font-variant-numeric: lining-nums;
  line-height: 1;
  vertical-align: middle;
  user-select: none;
  -webkit-user-select: none;
  transition: transform var(--motion-fast) var(--ease-out);
}

.pc.sm {
  --w: 26px;
  border-radius: 4px;
}

.pc.md {
  --w: var(--hand-card-width, 52px);
}

.pc.lg {
  --w: var(--lane-card-width, 58px);
}

.pc.red {
  color: var(--card-red);
}

.pc b {
  position: absolute;
  top: .18em;
  left: .18em;
  font-size: calc(var(--w) * .4);
  font-weight: 800;
  letter-spacing: -.035em;
}

.pc i {
  position: absolute;
  right: .15em;
  bottom: .12em;
  font-family: var(--serif);
  font-size: calc(var(--w) * .54);
  font-style: normal;
}

.pc.sm b {
  font-size: 12px;
}

.pc.sm i {
  font-size: 15px;
}

.pc.joker b {
  font-size: calc(var(--w) * .34);
}

.pc.joker i {
  font-family: var(--sans);
  font-size: calc(var(--w) * .36);
  font-weight: 800;
}

.pc.sm.joker b,
.pc.sm.joker i {
  font-size: 12px;
}

.selected-mark {
  position: absolute;
  top: -5px;
  right: -5px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--gold);
  color: var(--card-ink);
  font-size: 12px;
  font-weight: 800;
  opacity: 0;
  transform: scale(.85);
  pointer-events: none;
  transition: opacity var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out);
}

button.pc {
  cursor: pointer;
}

.pc.selected {
  z-index: 1;
  outline: 2px solid var(--gold);
  outline-offset: 1px;
  transform: translateY(-6px);
}

.selected .selected-mark {
  opacity: 1;
  transform: scale(1);
}

button.pc:focus-visible {
  outline: 3px solid var(--gold);
  outline-offset: 4px;
}

button.pc:active {
  transform: translateY(1px);
}

button.pc.selected:active {
  transform: translateY(-4px);
}

@media (hover: hover) {
  button.pc:hover:not(.selected) {
    transform: translateY(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pc,
  .selected-mark {
    transition: none;
  }
}
</style>
