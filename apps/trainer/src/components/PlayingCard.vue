<script setup lang="ts">
import type { Card } from '@biji/core'
import { BIG_JOKER, isJoker, isRedSuit, suitOf } from '@biji/core'
import { computed } from 'vue'
import { rankText, SUIT_SYMBOL } from '../practice/board'

const props = withDefaults(defineProps<{
  card: Card
  /** sm 结果页小牌；md 手牌区（9 张一行）；lg 三道中的牌 */
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
    <b>{{ rank }}</b>
    <i>{{ suit }}</i>
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
  background: var(--card);
  color: var(--card-ink);
  border: 1px solid var(--card-edge);
  border-radius: calc(var(--w) * .12);
  box-shadow: 0 1px 0 rgba(0, 0, 0, .08);
  font-family: var(--serif);
  line-height: 1;
  user-select: none;
  transition: transform .12s ease, box-shadow .12s ease;
}

.pc.sm { --w: 26px; }
/* 手牌区一行 9 张：可用宽度 = 视口（最大 520px）− 两侧留白 32px − 8 个间隙 */
.pc.md { --w: min(52px, calc((min(100vw, 520px) - 32px - 8 * 4px) / 9)); }
.pc.lg { --w: min(58px, 15vw); }

.pc.red { color: var(--card-red); }

.pc b {
  position: absolute;
  left: .2em;
  top: .22em;
  font-size: calc(var(--w) * .38);
  font-weight: 900;
  letter-spacing: -.04em;
}

.pc i {
  position: absolute;
  right: .16em;
  bottom: .14em;
  font-style: normal;
  font-size: calc(var(--w) * .5);
}

.pc.joker b { font-size: calc(var(--w) * .34); }
.pc.joker i { font-size: calc(var(--w) * .36); font-weight: 900; }
.pc.joker::after {
  content: "";
  position: absolute;
  inset: 3px;
  border: 1px dashed currentColor;
  border-radius: calc(var(--w) * .08);
  opacity: .35;
}

button.pc { cursor: pointer; }

.pc.selected {
  transform: translateY(-8px);
  box-shadow: 0 0 0 2px var(--gold), 0 6px 10px rgba(0, 0, 0, .25);
}

@media (prefers-reduced-motion: reduce) {
  .pc { transition: none; }
}
</style>
