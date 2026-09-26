import type { Arrangement } from './arrange'
import type { Card } from './card'
import { ACE, BIG_JOKER, isJoker, isRedSuit, rankOf, SMALL_JOKER, suitOf } from './card'
import { Category, categoryOf } from './evaluate'
import { laneStrengths } from './arrange'

/**
 * 本桌喜牌。每个喜由其余每名未弃牌者各付 5 分（6 人桌无人弃牌时出喜者共得 25 分），多个喜叠加计分；
 * 同类中更强的形式只计一个（三顺清不另计双顺清，全三条不另计双豹子）。
 * 例：两组四个头 + 摆成双豹子 = 3 喜，再通关 = 4 喜。
 */
export const Xi = {
  /** 三道都拿第一，取决于全桌比牌，由结算判定 */
  Sweep: 'sweep',
  /** 至少两道为同花顺（需真正摆成） */
  DoubleStraightFlush: 'doubleStraightFlush',
  /** 三道均为同花顺，双顺清的更强形式 */
  TripleStraightFlush: 'tripleStraightFlush',
  /** 至少两道为三条（需真正摆成） */
  DoubleTrips: 'doubleTrips',
  /** 三道均为三条，双豹子的更强形式 */
  AllTrips: 'allTrips',
  /** 有四张同点数的牌，与摆法无关 */
  FourOfAKind: 'fourOfAKind',
  /** 自然牌全为 ♥♦，可含大王、不能含小王，与摆法无关 */
  AllRed: 'allRed',
  /** 自然牌全为 ♠♣，可含小王、不能含大王，与摆法无关 */
  AllBlack: 'allBlack',
  /** 9 张同花且点数连续（A-9 至 6-A），王不能补点，与摆法无关 */
  NineStraightFlush: 'nineStraightFlush',
} as const
export type Xi = (typeof Xi)[keyof typeof Xi]

export const XI_NAME: Record<Xi, string> = {
  [Xi.Sweep]: '通关',
  [Xi.DoubleStraightFlush]: '双顺清',
  [Xi.TripleStraightFlush]: '三顺清',
  [Xi.DoubleTrips]: '双豹子',
  [Xi.AllTrips]: '全三条',
  [Xi.FourOfAKind]: '四个头',
  [Xi.AllRed]: '全红',
  [Xi.AllBlack]: '全黑',
  [Xi.NineStraightFlush]: '同花连顺',
}

/** 每个喜，其余每家付的分数 */
export const XI_PAY_PER_PLAYER = 5

/** 9 张连顺的点数窗口：2-10 ... 6-A，另有 A 作 1 的 A-9 */
const NINE_WINDOWS: readonly (readonly number[])[] = [
  ...[2, 3, 4, 5, 6].map(lo => Array.from({ length: 9 }, (_, i) => lo + i)),
  [ACE, 2, 3, 4, 5, 6, 7, 8, 9],
]

/** 只看 9 张牌构成、与摆法无关的喜 */
export function compositionXi(hand: readonly Card[]): Xi[] {
  const got: Xi[] = []
  const nat = hand.filter(c => !isJoker(c))
  const suits = nat.map(c => suitOf(c)!)

  if (suits.every(s => isRedSuit(s)) && !hand.includes(SMALL_JOKER))
    got.push(Xi.AllRed)
  if (suits.every(s => !isRedSuit(s)) && !hand.includes(BIG_JOKER))
    got.push(Xi.AllBlack)

  const count = new Map<number, number>()
  for (const c of nat)
    count.set(rankOf(c), (count.get(rankOf(c)) ?? 0) + 1)
  // 每组四张同点数计一个四个头，两组即两个喜（本桌口径；ThinkBiJi/sim/xi.py 只计一个）
  for (const v of count.values()) {
    if (v === 4)
      got.push(Xi.FourOfAKind)
  }

  if (nat.length === 9 && new Set(suits).size === 1 && count.size === 9) {
    const ranks = new Set(count.keys())
    if (NINE_WINDOWS.some(w => w.every(r => ranks.has(r))))
      got.push(Xi.NineStraightFlush)
  }
  return got
}

/** 取决于实际摆法的喜（双豹子/全三条、双顺清/三顺清），已按"强者吸收弱者"去重 */
export function arrangementXi(arr: Arrangement): Xi[] {
  const cats = laneStrengths(arr).map(categoryOf)
  const trips = cats.filter(c => c === Category.Trips).length
  const sf = cats.filter(c => c === Category.StraightFlush).length
  const got: Xi[] = []
  if (trips === 3)
    got.push(Xi.AllTrips)
  else if (trips === 2)
    got.push(Xi.DoubleTrips)
  if (sf === 3)
    got.push(Xi.TripleStraightFlush)
  else if (sf === 2)
    got.push(Xi.DoubleStraightFlush)
  return got
}

/** 一手摆法可得的全部喜（不含通关，通关由结算判定） */
export function xiOf(arr: Arrangement): Xi[] {
  return [...compositionXi(arr.lanes.flat()), ...arrangementXi(arr)]
}
