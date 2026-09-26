import type { Card } from './card'
import { strengthOf } from './evaluate'

/** 三道的下标约定：与 biji_sim.py 的摆法元组相同，按 尾、中、头 排列 */
export const Lane = {
  Tail: 0,
  Middle: 1,
  Head: 2,
} as const
export type Lane = (typeof Lane)[keyof typeof Lane]

export const LANE_NAME: Record<Lane, string> = {
  [Lane.Tail]: '尾道',
  [Lane.Middle]: '中道',
  [Lane.Head]: '头道',
}

export type Triple = readonly [Card, Card, Card]

/** 一手摆法：lanes[0] 尾道、lanes[1] 中道、lanes[2] 头道 */
export interface Arrangement {
  lanes: readonly [Triple, Triple, Triple]
}

/** 三道的强度，顺序同 Lane */
export type LaneStrengths = readonly [number, number, number]

export const HAND_SIZE = 9

/** 9 张牌中取 3 张的全部下标组合，C(9,3) = 84 个，顺序同 itertools.combinations(range(9), 3) */
export const SUBSETS: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = []
  for (let i = 0; i < HAND_SIZE; i++) {
    for (let j = i + 1; j < HAND_SIZE; j++) {
      for (let k = j + 1; k < HAND_SIZE; k++)
        out.push([i, j, k])
    }
  }
  return out
})()

/**
 * 全部有序三道分配，84 × 20 = 1680 种，每项为 [尾, 中, 头] 在 SUBSETS 中的编号，
 * 顺序与 biji_sim.PATTERNS 一致。未过滤倒水。
 */
export const PATTERNS: readonly (readonly [number, number, number])[] = (() => {
  const id = new Map(SUBSETS.map((s, i) => [s.join(','), i]))
  const out: [number, number, number][] = []
  for (let t = 0; t < SUBSETS.length; t++) {
    const rest = [...Array(HAND_SIZE).keys()].filter(i => !SUBSETS[t].includes(i))
    for (let x = 0; x < rest.length; x++) {
      for (let y = x + 1; y < rest.length; y++) {
        for (let z = y + 1; z < rest.length; z++) {
          const m = [rest[x], rest[y], rest[z]]
          const h = rest.filter(i => !m.includes(i))
          out.push([t, id.get(m.join(','))!, id.get(h.join(','))!])
        }
      }
    }
  }
  return out
})()

export function laneStrengths(arr: Arrangement): LaneStrengths {
  const [t, m, h] = arr.lanes
  return [strengthOf(...t), strengthOf(...m), strengthOf(...h)]
}

/** 倒水：不满足 尾道 ≥ 中道 ≥ 头道。按实战规则判三道全负 */
export function isFoulStrengths(s: LaneStrengths): boolean {
  return !(s[0] >= s[1] && s[1] >= s[2])
}

export function isFoul(arr: Arrangement): boolean {
  return isFoulStrengths(laneStrengths(arr))
}

export function makeArrangement(tail: Triple, middle: Triple, head: Triple): Arrangement {
  const all = [...tail, ...middle, ...head]
  if (new Set(all).size !== HAND_SIZE)
    throw new RangeError('三道必须由 9 张互不相同的牌组成')
  return { lanes: [tail, middle, head] }
}

export interface CandidateArrangement {
  arrangement: Arrangement
  strengths: LaneStrengths
}

/** 枚举一手 9 张牌的全部合法（不倒水）摆法 */
export function legalArrangements(hand: readonly Card[]): CandidateArrangement[] {
  if (hand.length !== HAND_SIZE)
    throw new RangeError(`手牌必须是 9 张，实际 ${hand.length} 张`)
  const triples = SUBSETS.map(([i, j, k]) => [hand[i], hand[j], hand[k]] as const)
  const ss = triples.map(t => strengthOf(...t))
  const out: CandidateArrangement[] = []
  for (const [t, m, h] of PATTERNS) {
    const strengths = [ss[t], ss[m], ss[h]] as const
    if (!isFoulStrengths(strengths))
      out.push({ arrangement: { lanes: [triples[t], triples[m], triples[h]] }, strengths })
  }
  return out
}
