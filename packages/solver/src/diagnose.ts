import type { Arrangement, Card } from '@biji/core'
import {
  BIG_JOKER,
  Category,
  categoryOf,
  isFoulStrengths,
  isJoker,
  Lane,
  LANE_NAME,
  laneStrengths,
  legalArrangements,
  rankOf,
  Xi,
  XI_NAME,
} from '@biji/core'
import { choosePattern, patternStrengths, viewHand } from './policy'

/**
 * 错因编码，按讲义的"摆牌六步"与各节技巧归类。一手牌可以同时命中多个。
 * 数组顺序即展示顺序（重要的在前）。
 */
export const TAG_CODES = [
  'foul', // 倒水
  'missedXi', // 漏喜：能摆成双豹子 / 双顺清却没有摆成
  'greedyTail', // 尾道优先的直觉摆法
  'keptTrips', // 该拆的三条没拆
  'splitTrips', // 不该拆的三条拆了
  'jokerMisuse', // 王没有用来凑同花
  'straightInMiddle', // 顺子错放在中道，应放头道
  'notConcentrated', // 三道平均用力，没有集中争两道
  'headWasted', // 头道本可以争第一
  'other', // 未归入以上错因
] as const
export type TagCode = (typeof TAG_CODES)[number]

export const TAG_TITLE: Record<TagCode, string> = {
  foul: '倒水',
  missedXi: '漏喜',
  greedyTail: '尾道优先的直觉摆法',
  keptTrips: '该拆的三条没拆',
  splitTrips: '不该拆的三条拆了',
  jokerMisuse: '王的用法',
  straightInMiddle: '顺子错放在中道',
  notConcentrated: '没有集中火力',
  headWasted: '头道本可以争第一',
  other: '其他',
}

export interface Tag {
  code: TagCode
  title: string
  /** 结合本手牌的说明 */
  detail: string
}

export interface DiagnoseInput {
  hand: readonly Card[]
  player: Arrangement
  /** 玩家摆法各道拿第一的概率（尾、中、头），来自蒙特卡洛 */
  playerFirst: readonly [number, number, number]
  best: Arrangement
  bestFirst: readonly [number, number, number]
}

/** 一道"把握较大"的门槛：拿第一概率 ≥ 70% */
const STRONG = 0.7
/** 被放弃的一道：拿第一概率 ≤ 5% */
const ABANDONED = 0.05
/** 头道"可以争"的门槛：推荐摆法头道拿第一 ≥ 40%，而玩家 < 10% */
const HEAD_CONTEST = 0.4
const HEAD_WASTED = 0.1

const pct = (x: number) => `${Math.round(x * 100)}%`

function rankName(r: number): string {
  return ({ 14: 'A', 13: 'K', 12: 'Q', 11: 'J' } as Record<number, string>)[r] ?? String(r)
}

/** 手中有 ≥ 3 张的点数（可以组成三条） */
function tripsRanks(hand: readonly Card[]): number[] {
  const count = new Map<number, number>()
  for (const c of hand) {
    if (!isJoker(c))
      count.set(rankOf(c), (count.get(rankOf(c)) ?? 0) + 1)
  }
  return [...count].filter(([, n]) => n >= 3).map(([r]) => r)
}

/** 摆法中是否有一道恰好是点数 r 的三条 */
function keepsTrips(arr: Arrangement, r: number): boolean {
  return arr.lanes.some(l => l.every(c => !isJoker(c) && rankOf(c) === r))
}

/** 王所在那一道是否为同花（王只有在同花里才有用） */
function jokerInFlush(arr: Arrangement, joker: Card): boolean {
  const i = arr.lanes.findIndex(l => l.includes(joker))
  return categoryOf(laneStrengths(arr)[i]) === Category.Flush
}

/** 依赖摆法的喜数量：两道以上三条计 1，两道以上同花顺计 1 */
function xiCount(strengths: readonly number[]): { n: number, names: string[] } {
  const cats = strengths.map(categoryOf)
  const names: string[] = []
  const trips = cats.filter(c => c === Category.Trips).length
  const sf = cats.filter(c => c === Category.StraightFlush).length
  if (trips >= 2)
    names.push(XI_NAME[trips === 3 ? Xi.AllTrips : Xi.DoubleTrips])
  if (sf >= 2)
    names.push(XI_NAME[sf === 3 ? Xi.TripleStraightFlush : Xi.DoubleStraightFlush])
  return { n: names.length, names }
}

/**
 * 规则化的错因诊断。只应在玩家摆法不是最优时调用；
 * 所有判定都对照推荐摆法，避免把"这手牌本来就只能这样"的情况误报为错误。
 */
export function diagnose(input: DiagnoseInput): Tag[] {
  const { hand, player, best, playerFirst: pf, bestFirst: bf } = input
  const ps = laneStrengths(player)
  const bs = laneStrengths(best)
  const tags: Tag[] = []
  const add = (code: TagCode, detail: string) => tags.push({ code, title: TAG_TITLE[code], detail })
  const foul = isFoulStrengths(ps)

  if (foul)
    add('foul', '三道须满足 尾道 ≥ 中道 ≥ 头道。倒水按三道全部垫底结算，每道付 5 分。')

  // 漏喜：全部合法摆法中能达到的最多喜数 > 玩家摆法的喜数
  let maxXi = { n: 0, names: [] as string[] }
  for (const cand of legalArrangements(hand)) {
    const x = xiCount(cand.strengths)
    if (x.n > maxXi.n)
      maxXi = x
  }
  const playerXi = foul ? 0 : xiCount(ps).n
  if (maxXi.n > playerXi)
    add('missedXi', `这手牌能摆成${maxXi.names.join('、')}，每个喜其余每家付 5 分。为成喜调整摆法的平均代价只有 1 分左右，应优先成喜。`)

  if (!foul) {
    const view = viewHand(hand)
    const greedy = patternStrengths(view, choosePattern(view, null, 'greedy'))
    if (greedy.join() === ps.join() && greedy.join() !== bs.join())
      add('greedyTail', '尾道尽量大、其次中道的直觉摆法。本规则每道只有第一名收分，应当先数每道能不能拿第一，而不是让尾道最大。')
  }

  for (const r of tripsRanks(hand)) {
    const p = keepsTrips(player, r)
    const b = keepsTrips(best, r)
    if (p && !b)
      add('keptTrips', `三条 ${rankName(r)} 应当拆开：拆开后各张分别补进同花，能换来更多接近确定的第一。`)
    if (!p && b)
      add('splitTrips', `三条 ${rankName(r)} 应当保留：它和其他强组合一起能稳拿两道。`)
  }

  for (const j of hand.filter(isJoker)) {
    if (jokerInFlush(best, j) && !jokerInFlush(player, j)) {
      const name = j === BIG_JOKER ? '大王' : '小王'
      const colors = j === BIG_JOKER ? '红桃或方块' : '黑桃或梅花'
      add('jokerMisuse', `${name}只能补${colors}凑同花，不在同花里就是全场最小的单张。推荐摆法让${name}进同花，腾出天然牌给别的道。`)
    }
  }

  if (categoryOf(ps[Lane.Middle]) === Category.Straight && categoryOf(bs[Lane.Head]) === Category.Straight
    && pf[Lane.Middle] < ABANDONED) {
    add('straightInMiddle', `中道的对手基本都是同花，顺子放中道拿第一只有 ${pct(pf[Lane.Middle])}；顺子应放头道，推荐摆法头道拿第一 ${pct(bf[Lane.Head])}。`)
  }

  const strong = (f: readonly number[]) => f.filter(x => x >= STRONG).length
  const abandoned = [Lane.Tail, Lane.Middle, Lane.Head].find(l => bf[l] <= ABANDONED)
  if (strong(bf) >= 2 && strong(pf) < strong(bf) && abandoned !== undefined) {
    add('notConcentrated', `推荐摆法放弃${LANE_NAME[abandoned]}，把强牌集中起来稳拿 ${strong(bf)} 道第一；你的摆法只有 ${strong(pf)} 道把握较大。放弃一道最多付 5 分，多拿一道第一收 15 分。`)
  }

  if (bf[Lane.Head] >= HEAD_CONTEST && pf[Lane.Head] < HEAD_WASTED) {
    add('headWasted', `头道的冠军线最低，一半的局里顺子就能拿下。推荐摆法头道拿第一 ${pct(bf[Lane.Head])}，你的摆法只有 ${pct(pf[Lane.Head])}。`)
  }

  if (tags.length === 0) {
    const lines = [Lane.Head, Lane.Middle, Lane.Tail].map(l => `${LANE_NAME[l]} ${pct(pf[l])} → ${pct(bf[l])}`)
    add('other', `各道拿第一的概率（你的 → 推荐）：${lines.join('，')}。`)
  }

  const order = new Map(TAG_CODES.map((c, i) => [c, i]))
  return tags.sort((a, b) => order.get(a.code)! - order.get(b.code)!)
}
