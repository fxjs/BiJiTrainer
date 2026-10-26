import type { Arrangement, Card, LaneStrengths } from '@biji/core'
import type { MonteCarloOptions, MonteCarloStat } from './mc'
import type { LaneModel } from './model'
import { arrangementXi, isFoulStrengths, laneStrengths, XI_PAY_PER_PLAYER } from '@biji/core'
import { evaluateByMonteCarlo, pairedStderr } from './mc'
import { OPPONENTS } from './model'
import { patternArrangement, rankPatterns, tableValue, viewHand } from './policy'

/** 自己成一个喜，其余 5 家各付 5 分 */
const XI_BONUS = XI_PAY_PER_PLAYER * OPPONENTS

/** 默认等价最优阈值（分） */
export const DEFAULT_EPSILON = 0.5

export interface RecommendOptions extends MonteCarloOptions {
  /** 等价最优阈值 ε（分），默认 DEFAULT_EPSILON。实际门槛取 max(ε, 2 × 与最优之差的配对标准误) */
  epsilon?: number
  /** 粗排后进入蒙特卡洛精排的候选数，默认 10 */
  topK?: number
  /** 额外必须精排的摆法（如玩家自己的摆法），允许倒水 */
  extra?: readonly Arrangement[]
}

export interface ScoredArrangement {
  arrangement: Arrangement
  strengths: LaneStrengths
  foul: boolean
  /** 表估值 + 依赖摆法的喜分（每个喜 25）；倒水为 null */
  tableValue: number | null
  /** 在全部合法摆法中按表估值的名次（1 起）；倒水为 null */
  tableRank: number | null
  stat: MonteCarloStat
  /** 与平均得分最高者之差 */
  gap: number
  /** 该差值的配对标准误 */
  gapStderr: number
  /** gap ≤ max(ε, 2·gapStderr)，即在抽样误差内与最优无法区分 */
  equivalentBest: boolean
}

export interface Recommendation {
  /** 精排过的摆法，按平均得分降序；同分时标准差小者在前 */
  ranked: ScoredArrangement[]
  /** 推荐摆法：平均得分最高者；同分时标准差较小者 */
  best: ScoredArrangement
  /** 与 options.extra 一一对应 */
  extra: ScoredArrangement[]
  /** 合法摆法总数 */
  legalCount: number
}

/** 摆法的规范键：三道各自的牌集合，与牌在道内的顺序无关 */
export function arrangementKey(arr: Arrangement): string {
  return arr.lanes.map(l => [...l].sort((a, b) => a - b).join(',')).join('|')
}

export function recommend(hand: readonly Card[], model: LaneModel, opts: RecommendOptions = {}): Recommendation {
  const epsilon = opts.epsilon ?? DEFAULT_EPSILON
  const topK = opts.topK ?? 10
  const view = viewHand(hand)

  // 粗排：表估值 + 依赖摆法的喜（与摆法无关的喜对所有摆法相同，不影响排序）
  const coarse = rankPatterns(view, model).map((r) => {
    const arrangement = patternArrangement(view, r.pattern)
    return { arrangement, strengths: r.strengths, value: r.value + XI_BONUS * arrangementXi(arrangement).length }
  }).sort((a, b) => b.value - a.value)
  const rankByKey = new Map(coarse.map((c, i) => [arrangementKey(c.arrangement), i + 1]))

  const pool = new Map<string, Arrangement>()
  for (const c of coarse.slice(0, topK))
    pool.set(arrangementKey(c.arrangement), c.arrangement)
  const extraKeys = (opts.extra ?? []).map((a) => {
    const key = arrangementKey(a)
    if (!pool.has(key))
      pool.set(key, a)
    return key
  })

  const keys = [...pool.keys()]
  const arrs = [...pool.values()]
  const stats = evaluateByMonteCarlo(view.sorted, arrs, model, opts)

  const scored = arrs.map((arrangement, i): ScoredArrangement => {
    const strengths = laneStrengths(arrangement)
    const foul = isFoulStrengths(strengths)
    return {
      arrangement,
      strengths,
      foul,
      tableValue: foul
        ? null
        : tableValue(model, strengths[0], strengths[1], strengths[2]) + XI_BONUS * arrangementXi(arrangement).length,
      tableRank: rankByKey.get(keys[i]) ?? null,
      stat: stats[i],
      gap: 0,
      gapStderr: 0,
      equivalentBest: false,
    }
  })
  // 推荐必须取期望得分最高者；稳定性只用作同分时的次序，不能反过来降低期望
  const ranked = [...scored].sort((a, b) => b.stat.mean - a.stat.mean || a.stat.std - b.stat.std)
  const top = ranked[0]
  for (const s of scored) {
    s.gap = top.stat.mean - s.stat.mean
    s.gapStderr = s === top ? 0 : pairedStderr(top.stat, s.stat)
    s.equivalentBest = s.gap <= Math.max(epsilon, 2 * s.gapStderr)
  }
  const best = top

  const byKey = new Map(keys.map((k, i) => [k, scored[i]]))
  return {
    ranked,
    best,
    extra: extraKeys.map(k => byKey.get(k)!),
    legalCount: coarse.length,
  }
}
