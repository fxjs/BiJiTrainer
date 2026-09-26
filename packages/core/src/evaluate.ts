import type { Card } from './card'
import { ACE, DECK_SIZE, isJoker, jokerFits, rankOf, suitOf, suitScore } from './card'

/** 三张一道的牌型，数值越大牌型越大（三条 > 同花顺 > 同花 > 顺子 > 对子 > 乌龙） */
export const Category = {
  HighCard: 0,
  Pair: 1,
  Straight: 2,
  Flush: 3,
  StraightFlush: 4,
  Trips: 5,
} as const
export type Category = (typeof Category)[keyof typeof Category]

export const CATEGORY_NAME: Record<Category, string> = {
  [Category.HighCard]: '乌龙',
  [Category.Pair]: '对子',
  [Category.Straight]: '顺子',
  [Category.Flush]: '同花',
  [Category.StraightFlush]: '同花顺',
  [Category.Trips]: '三条',
}

/**
 * 强度编码（与 biji_sim.py 一致）：
 *   strength = (牌型 × 15³ + a × 15² + b × 15 + c) × 4 + 主牌花色分
 * a、b、c 为按牌型含义排列的点数（0..14，王为 0/1），a×225+b×15+c ≤ 3374 < 15³，
 * 因此整数大小即牌力大小。同一局内不同玩家的同一道不会出现相等强度（花色无平局）。
 */
const B = 15
const B3 = B * B * B

function encode(cat: Category, a = 0, b = 0, c = 0): number {
  return cat * B3 + a * B * B + b * B + c
}

/** 三个互不相同的点数能否成顺；返回顺子顶张点数（A23 记为 3，是最小的顺子），否则 null */
function straightTop(rs: number[]): number | null {
  const [x, y, z] = [...rs].sort((p, q) => p - q)
  if (x + 1 === y && y + 1 === z)
    return z
  if (x === 2 && y === 3 && z === ACE)
    return 3
  return null
}

/** 只按牌型与点数编码，不含花色分 */
function rankKey(cards: readonly Card[]): number {
  const nat = cards.filter(c => !isJoker(c))
  const natRs = nat.map(rankOf)
  const suits = new Set(nat.map(c => suitOf(c)!))
  const flushSuit = suits.size === 1 ? [...suits][0] : null
  // 同花：自然牌同一花色，且每张王都能补这个花色
  const flush = flushSuit !== null && cards.every(c => !isJoker(c) || jokerFits(c, flushSuit))
  const rs = cards.map(rankOf).sort((p, q) => q - p)

  // 三条、顺子、同花顺都要求三张自然牌（王不配点）
  if (nat.length === 3) {
    if (natRs[0] === natRs[1] && natRs[1] === natRs[2])
      return encode(Category.Trips, natRs[0])
    if (new Set(natRs).size === 3) {
      const top = straightTop(natRs)
      if (top !== null)
        return encode(flush ? Category.StraightFlush : Category.Straight, top)
    }
  }
  if (flush)
    return encode(Category.Flush, rs[0], rs[1], rs[2])
  const pair = pairRank(natRs)
  if (pair !== null) {
    const kicker = rs.find(r => r !== pair)!
    return encode(Category.Pair, pair, kicker)
  }
  return encode(Category.HighCard, rs[0], rs[1], rs[2])
}

function pairRank(natRs: number[]): number | null {
  let best: number | null = null
  for (const r of natRs) {
    if (natRs.filter(x => x === r).length === 2 && (best === null || r > best))
      best = r
  }
  return best
}

/**
 * 计算一道（3 张）的强度整数，可直接比较大小。
 * 主牌花色规则：对子取对子中较大的花色；三条取最大花色；A23 取 3 的花色；其余取点数最大一张的花色。
 */
export function evaluate(cards: readonly Card[]): number {
  if (cards.length !== 3)
    throw new RangeError(`一道必须是 3 张牌，实际 ${cards.length} 张`)
  const key = rankKey(cards)
  const cat = Math.floor(key / B3) as Category
  const nat = cards.filter(c => !isJoker(c))
  let lead: number
  if (cat === Category.Pair) {
    const p = Math.floor(key / (B * B)) % B
    lead = Math.max(...nat.filter(c => rankOf(c) === p).map(suitScore))
  }
  else if (cat === Category.Trips) {
    lead = Math.max(...nat.map(suitScore))
  }
  else if ((cat === Category.Straight || cat === Category.StraightFlush) && Math.floor(key / (B * B)) % B === 3) {
    // 顶张为 3 的顺子只有 A23，主牌是 3 而不是 A
    lead = suitScore(nat.find(c => rankOf(c) === 3)!)
  }
  else {
    let top = cards[0]
    for (const c of cards) {
      if (rankOf(c) > rankOf(top))
        top = c
    }
    lead = suitScore(top)
  }
  return key * 4 + lead
}

export function categoryOf(strength: number): Category {
  return Math.floor(strength / 4 / B3) as Category
}

// ---------- 全部 C(54,3) 组合的强度查找表 ----------

/** C(54,3) = 24804 */
export const COMBO3_COUNT = (DECK_SIZE * (DECK_SIZE - 1) * (DECK_SIZE - 2)) / 6

/** 组合数系统（colex）下标：要求 a < b < c，结果范围 0..COMBO3_COUNT-1 */
export function comboIndex(a: Card, b: Card, c: Card): number {
  return (c * (c - 1) * (c - 2)) / 6 + (b * (b - 1)) / 2 + a
}

let table: Int32Array | null = null

/** 懒加载的强度表，首次调用时计算全部 24804 种组合（毫秒级） */
export function strengthTable(): Int32Array {
  if (table)
    return table
  const t = new Int32Array(COMBO3_COUNT)
  for (let c = 2; c < DECK_SIZE; c++) {
    for (let b = 1; b < c; b++) {
      for (let a = 0; a < b; a++)
        t[comboIndex(a, b, c)] = evaluate([a, b, c])
    }
  }
  table = t
  return t
}

/** 查表版 evaluate，参数顺序任意 */
export function strengthOf(x: Card, y: Card, z: Card): number {
  // 三数排序为 a < b < c
  let a = x
  let b = y
  let c = z
  if (a > b)
    [a, b] = [b, a]
  if (b > c)
    [b, c] = [c, b]
  if (a > b)
    [a, b] = [b, a]
  return strengthTable()[comboIndex(a, b, c)]
}

// ---------- 文字描述 ----------

function rankName(r: number): string {
  return ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 1: '大王', 0: '小王' } as Record<number, string>)[r] ?? String(r)
}

/** 牌型描述，与 biji_sim.describe 口径一致，例如 "同花 A-9-大王"、"顺子 A23"、"对子 10" */
export function describe(strength: number): string {
  const s = Math.floor(strength / 4)
  const cat = Math.floor(s / B3) as Category
  const a = Math.floor(s / (B * B)) % B
  const b = Math.floor(s / B) % B
  const c = s % B
  switch (cat) {
    case Category.HighCard:
    case Category.Flush:
      return `${CATEGORY_NAME[cat]} ${rankName(a)}-${rankName(b)}-${rankName(c)}`
    case Category.Pair:
      return `对子 ${rankName(a)}`
    case Category.Straight:
    case Category.StraightFlush:
      return `${CATEGORY_NAME[cat]} ${a === 3 ? 'A23' : `${rankName(a - 2)}${rankName(a - 1)}${rankName(a)}`}`
    default:
      return `三条 ${rankName(a)}`
  }
}
