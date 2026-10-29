import type { Arrangement, Card, Triple } from '@biji/core'
import { ACE, describe, isJoker, Lane, rankOf, strengthOf, suitOf } from '@biji/core'

/**
 * 摆牌台面的状态。所有函数都返回新对象，不修改入参，便于在 Pinia 中整体替换与测试。
 * lanes 的下标同 core 的 Lane：0 尾道、1 中道、2 头道。
 */
export interface Board {
  /** 发到的 9 张牌 */
  hand: readonly Card[]
  lanes: readonly [readonly Card[], readonly Card[], readonly Card[]]
  /** 手牌区中被选中的牌，按选中顺序 */
  selected: readonly Card[]
}

export const LANE_CAPACITY = 3

/** 手牌区排序：rank 按点数从大到小；suit 先按花色分组（♠♥♣♦），组内按点数，王排在最后 */
export type SortMode = 'rank' | 'suit'

export function createBoard(hand: readonly Card[]): Board {
  return { hand: [...hand], lanes: [[], [], []], selected: [] }
}

function placedSet(b: Board): Set<Card> {
  return new Set(b.lanes.flat())
}

/** 手牌区中尚未放入任何一道的牌 */
export function poolCards(b: Board, mode: SortMode): Card[] {
  const placed = placedSet(b)
  return sortCards(b.hand.filter(c => !placed.has(c)), mode)
}

export function sortCards(cards: readonly Card[], mode: SortMode): Card[] {
  // 王没有点数，rankOf 为 0/1，自然排在最后；A 在点数排序中最大
  const byRank = (a: Card, b: Card) => rankOf(b) - rankOf(a) || a - b
  if (mode === 'rank')
    return [...cards].sort(byRank)
  const suitKey = (c: Card) => (isJoker(c) ? 4 : suitOf(c)!)
  return [...cards].sort((a, b) => suitKey(a) - suitKey(b) || byRank(a, b))
}

export function toggleSelect(b: Board, card: Card): Board {
  return setCardSelected(b, card, !b.selected.includes(card))
}

/** 把一张手牌设为选中/未选中；已放入某一道或不在手牌中的牌忽略 */
export function setCardSelected(b: Board, card: Card, selected: boolean): Board {
  if (placedSet(b).has(card) || !b.hand.includes(card))
    return b
  if (b.selected.includes(card) === selected)
    return b
  return {
    ...b,
    selected: selected ? [...b.selected, card] : b.selected.filter(c => c !== card),
  }
}

/** 整道移动方向：+1 向头道（竖屏上、横屏左），−1 向尾道（竖屏下、横屏右） */
export type LaneMove = -1 | 1

/**
 * 把一整道的牌移动到相邻道：两道已有牌时整体互换，目标道为空时整组搬过去。
 * 显式允许在摆牌过程中使用，便于倒水时直接换道而不必逐张撤回。
 */
export function moveLane(b: Board, lane: Lane, dir: LaneMove): Board {
  const target = lane + dir
  if (target < 0 || target > 2 || b.lanes[lane].length === 0)
    return b
  const lanes = b.lanes.map((cards, i) => {
    if (i === lane)
      return b.lanes[target]
    if (i === target)
      return b.lanes[lane]
    return cards
  }) as unknown as Board['lanes']
  return { ...b, lanes }
}

/** 把选中的牌放入某一道；放不下的部分保持选中 */
export function placeSelected(b: Board, lane: Lane): Board {
  const free = LANE_CAPACITY - b.lanes[lane].length
  if (free <= 0 || b.selected.length === 0)
    return b
  const moving = b.selected.slice(0, free)
  const lanes = b.lanes.map((l, i) => (i === lane ? [...l, ...moving] : l)) as unknown as Board['lanes']
  return { ...b, lanes, selected: b.selected.slice(free) }
}

export function removeFromLane(b: Board, lane: Lane, card: Card): Board {
  if (!b.lanes[lane].includes(card))
    return b
  const lanes = b.lanes.map((l, i) => (i === lane ? l.filter(c => c !== card) : l)) as unknown as Board['lanes']
  return { ...b, lanes }
}

export function clearLanes(b: Board): Board {
  return { ...b, lanes: [[], [], []], selected: [] }
}

export function isComplete(b: Board): boolean {
  return b.lanes.every(l => l.length === LANE_CAPACITY)
}

export function toArrangement(b: Board): Arrangement {
  if (!isComplete(b))
    throw new Error('三道尚未摆满')
  return { lanes: b.lanes.map(l => [...l] as unknown as Triple) as unknown as Arrangement['lanes'] }
}

export interface LaneInfo {
  full: boolean
  strength: number | null
  /** 牌型描述，如 "同花 A-Q-5"；未摆满为 null */
  label: string | null
}

export function laneInfo(b: Board, lane: Lane): LaneInfo {
  const cards = b.lanes[lane]
  if (cards.length !== LANE_CAPACITY)
    return { full: false, strength: null, label: null }
  const s = strengthOf(cards[0], cards[1], cards[2])
  return { full: true, strength: s, label: describe(s) }
}

/**
 * 倒水检查：只比较已摆满的相邻两道。
 * tailMid 为 true 表示 尾道 < 中道；midHead 为 true 表示 中道 < 头道。
 * 尾道与头道都满而中道未满时，也检查 尾道 < 头道（此时无论中道怎么摆都必然倒水）。
 */
export interface FoulCheck {
  tailMid: boolean
  midHead: boolean
  tailHead: boolean
  any: boolean
}

export function foulCheck(b: Board): FoulCheck {
  const [t, m, h] = [Lane.Tail, Lane.Middle, Lane.Head].map(l => laneInfo(b, l).strength)
  const tailMid = t !== null && m !== null && t < m
  const midHead = m !== null && h !== null && m < h
  const tailHead = t !== null && h !== null && t < h
  return { tailMid, midHead, tailHead, any: tailMid || midHead || tailHead }
}

/** 从 54 张中随机发 9 张，使用 crypto 随机数 */
export function dealHand(random: (n: number) => number = cryptoInt): Card[] {
  const deck = Array.from({ length: 54 }, (_, i) => i)
  for (let i = deck.length - 1; i > deck.length - 10; i--) {
    const j = random(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(-9)
}

/** [0, n) 的均匀随机整数 */
function cryptoInt(n: number): number {
  const buf = new Uint32Array(1)
  // 拒绝采样消除取模偏差
  const limit = Math.floor(0x100000000 / n) * n
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % n
}

/** 用于显示的点数文字 */
export function rankText(c: Card): string {
  if (isJoker(c))
    return c === 53 ? '大' : '小'
  const r = rankOf(c)
  return ({ 11: 'J', 12: 'Q', 13: 'K', [ACE]: 'A' } as Record<number, string>)[r] ?? String(r)
}

export const SUIT_SYMBOL = ['♠', '♥', '♣', '♦'] as const
