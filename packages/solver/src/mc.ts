import type { Arrangement, Card } from '@biji/core'
import type { LaneModel } from './model'
import type { Policy } from './policy'
import { fullDeck, HAND_SIZE, settle, TABLE_SIZE, Xi } from '@biji/core'
import { chooseArrangement } from './policy'
import { mulberry32, shuffleInPlace } from './rng'

export interface MonteCarloOptions {
  /** 采样局数，默认 2000 */
  samples?: number
  seed?: number
  /** 对手的摆牌策略，默认 top */
  opponentPolicy?: Policy
}

export interface MonteCarloStat {
  /** 每手平均得分（名次分 + 通关 + 喜分，含付给对手的喜分） */
  mean: number
  /** 得分标准差，作为"稳"的度量 */
  std: number
  /** 均值的标准误 = std / √samples */
  stderr: number
  /** 各道拿第一的频率，顺序：尾、中、头 */
  laneFirst: [number, number, number]
  /** 通关频率 */
  sweep: number
  samples: number
  /** 每局得分；候选之间按下标配对（同一局对手牌），用于计算差值的配对标准误 */
  totals: Float64Array
}

/**
 * 蒙特卡洛精排：把自己之外的 45 张随机发给 5 名对手（54 张全发，阻断效应由此计入），
 * 对手按胜率表策略摆牌，再用 core 的完整规则结算。
 * 所有候选摆法共用同一批对手牌（公共随机数），候选之间的差值比各自的均值精确得多。
 * 未考虑对手弃牌。
 */
export function evaluateByMonteCarlo(
  hand: readonly Card[],
  candidates: readonly Arrangement[],
  model: LaneModel,
  opts: MonteCarloOptions = {},
): MonteCarloStat[] {
  const samples = opts.samples ?? 2000
  const rng = mulberry32(opts.seed ?? 1)
  const policy = opts.opponentPolicy ?? 'top'
  const own = new Set(hand)
  const rest = fullDeck().filter(c => !own.has(c))
  const opponents = TABLE_SIZE - 1
  if (rest.length !== opponents * HAND_SIZE)
    throw new RangeError('手牌必须是 9 张不同的牌')

  const acc = candidates.map(() => ({ sum: 0, sumSq: 0, first: [0, 0, 0], sweep: 0, totals: new Float64Array(samples) }))
  for (let n = 0; n < samples; n++) {
    shuffleInPlace(rest, rng)
    const opps: Arrangement[] = []
    for (let i = 0; i < opponents; i++)
      opps.push(chooseArrangement(rest.slice(i * HAND_SIZE, (i + 1) * HAND_SIZE), model, policy))
    candidates.forEach((cand, ci) => {
      const me = settle([cand, ...opps])[0]
      const a = acc[ci]
      a.sum += me.total
      a.sumSq += me.total * me.total
      a.totals[n] = me.total
      for (let k = 0; k < 3; k++) {
        if (me.laneRank[k] === 1)
          a.first[k]++
      }
      if (me.xi.includes(Xi.Sweep))
        a.sweep++
    })
  }

  return acc.map((a): MonteCarloStat => {
    const mean = a.sum / samples
    const variance = samples > 1 ? Math.max(0, (a.sumSq - samples * mean * mean) / (samples - 1)) : 0
    const std = Math.sqrt(variance)
    return {
      mean,
      std,
      stderr: std / Math.sqrt(samples),
      laneFirst: [a.first[0] / samples, a.first[1] / samples, a.first[2] / samples],
      sweep: a.sweep / samples,
      samples,
      totals: a.totals,
    }
  })
}

/** 两个候选得分之差的配对标准误（要求来自同一次 evaluateByMonteCarlo，即同一批对手牌） */
export function pairedStderr(a: MonteCarloStat, b: MonteCarloStat): number {
  const n = a.samples
  if (n < 2)
    return 0
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const d = a.totals[i] - b.totals[i]
    sum += d
    sumSq += d * d
  }
  const mean = sum / n
  return Math.sqrt(Math.max(0, (sumSq - n * mean * mean) / (n - 1)) / n)
}
