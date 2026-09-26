import { strengthTable } from '@biji/core'

/** 一道拿第一收 15 分（6 人桌第 2~6 名依次付 1~5） */
export const LANE_WIN = 15
/** 对手人数；输给几个人就付几分，期望付分 = 对手数 × (1 − p) */
export const OPPONENTS = 5
/** 通关另由每名对手付 5 分，合计 25 */
export const SWEEP_BONUS = 5 * OPPONENTS

/**
 * 胜率表的序列化格式。道的顺序：尾、中、头（同 core 的 Lane）。
 * strengths 为全部 C(54,3) 组合中出现过的不同强度值（共 3848 个），升序；
 * p[i]、top[i] 对应 strengths[i]。
 */
export interface LaneTable {
  version: 1
  source: string
  /** 训练最后一轮的整局数 */
  deals: number
  strengths: number[]
  lanes: { p: number[], top: number[] }[]
}

let distinct: Int32Array | null = null

/** 全部组合中出现过的不同强度值，升序 */
export function distinctStrengths(): Int32Array {
  if (!distinct)
    distinct = Int32Array.from(new Set(strengthTable())).sort()
  return distinct
}

function maxStrength(): number {
  const d = distinctStrengths()
  return d[d.length - 1]
}

/**
 * 每道的估值模型（与 biji_sim.Model 同口径）：
 * - p   单挑胜率：该道强度大于随机一名对手同一道的概率
 * - top 拿第一的概率：大于其余 5 人同一道最大者的概率
 * - ev  该道期望得分 15·top − 5·(1 − p)
 * 为便于在 1680 种摆法的内循环中查找，三张数组都按强度值直接下标（稠密，约 8 万项）。
 */
export class LaneModel {
  readonly p: Float64Array[]
  readonly top: Float64Array[]
  readonly ev: Float64Array[]

  private constructor(p: Float64Array[], top: Float64Array[]) {
    this.p = p
    this.top = top
    this.ev = p.map((pk, k) => {
      const e = new Float64Array(pk.length)
      for (const s of distinctStrengths())
        // 运算顺序与 biji_sim.Model.lane_ev 一致，保证与 Python 逐位相同
        e[s] = LANE_WIN * top[k][s] - 5 * (1 - pk[s])
      return e
    })
  }

  static fromTable(table: LaneTable): LaneModel {
    if (table.version !== 1 || table.lanes.length !== 3)
      throw new Error('不支持的胜率表格式')
    const size = maxStrength() + 1
    const p = table.lanes.map(() => new Float64Array(size))
    const top = table.lanes.map(() => new Float64Array(size))
    table.strengths.forEach((s, i) => {
      for (let k = 0; k < 3; k++) {
        p[k][s] = table.lanes[k].p[i]
        top[k][s] = table.lanes[k].top[i]
      }
    })
    return new LaneModel(p, top)
  }

  /**
   * 由样本构造模型。
   * @param dists  每道全体玩家的强度样本（已升序）
   * @param maxima 每道"其余 5 人最大值"样本（已升序）；为 null 时用 p⁵ 近似 top（首轮训练）
   */
  static fromSamples(dists: Int32Array[], maxima: Int32Array[] | null): LaneModel {
    const size = maxStrength() + 1
    const p = dists.map(d => cdfArray(d, size))
    const top = maxima
      ? maxima.map(m => cdfArray(m, size))
      : p.map((pk) => {
          const t = new Float64Array(size)
          for (const s of distinctStrengths())
            t[s] = pk[s] ** OPPONENTS
          return t
        })
    return new LaneModel(p, top)
  }

  /** 首轮模型：以"随机三张牌的强度分布"作为每一道的对手分布 */
  static initial(): LaneModel {
    const base = Int32Array.from(strengthTable()).sort()
    return LaneModel.fromSamples([base, base, base], null)
  }

  toTable(source: string, deals: number): LaneTable {
    const strengths = [...distinctStrengths()]
    return {
      version: 1,
      source,
      deals,
      strengths,
      lanes: [0, 1, 2].map(k => ({
        p: strengths.map(s => this.p[k][s]),
        top: strengths.map(s => this.top[k][s]),
      })),
    }
  }
}

/**
 * 经验分布函数 P(X < s)，样本中与 s 相等者计一半（同一组牌可能在不同局重复出现），
 * 与 biji_sim.cdf_fn 一致。只计算实际存在的强度值。
 */
function cdfArray(sorted: Int32Array, size: number): Float64Array {
  const out = new Float64Array(size)
  const n = sorted.length
  for (const s of distinctStrengths()) {
    const lo = lowerBound(sorted, s)
    const hi = lowerBound(sorted, s + 1)
    out[s] = (lo + 0.5 * (hi - lo)) / n
  }
  return out
}

function lowerBound(a: Int32Array, x: number): number {
  let lo = 0
  let hi = a.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (a[mid] < x)
      lo = mid + 1
    else hi = mid
  }
  return lo
}
