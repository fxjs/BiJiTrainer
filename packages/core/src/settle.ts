import type { Arrangement, LaneStrengths } from './arrange'
import { isFoulStrengths, laneStrengths } from './arrange'
import { arrangementXi, compositionXi, Xi, XI_PAY_PER_PLAYER } from './xi'

/** 标准桌人数 */
export const TABLE_SIZE = 6

/** 弃牌声明：order 为本局第几个弃牌（从 1 开始，按座次依次声明） */
export interface Fold {
  foldOrder: number
}

/** 一个座位的输入：摆好的牌，或弃牌 */
export type SeatInput = Arrangement | Fold

export function isFold(seat: SeatInput): seat is Fold {
  return 'foldOrder' in seat
}

/**
 * 第 k 个弃牌者放到台面的分数：3 × (人数 − k)，6 人桌依次为 15、12、9、6、3。
 * 台面分三等分，由三道各自的第一名拿走，等价于该弃牌者在三道都排第 (人数 − k + 1) 名并照常付名次分。
 * 因此至多 人数 − 1 人弃牌。
 */
export function foldCost(foldOrder: number, tableSize = TABLE_SIZE): number {
  if (!Number.isInteger(foldOrder) || foldOrder < 1 || foldOrder > tableSize - 1)
    throw new RangeError(`弃牌序号越界: ${foldOrder}`)
  return 3 * (tableSize - foldOrder)
}

export interface PlayerSettlement {
  folded: boolean
  /** 各道名次，1 为第一；顺序同 Lane（尾、中、头）。弃牌者按弃牌顺序排在最后，第 1 个弃牌者垫底 */
  laneRank: [number, number, number]
  /** 各道名次分：第一名收其余各家所付之和，第 r 名付 r − 1 分 */
  lanePoints: [number, number, number]
  foul: boolean
  /** 本手成立的喜（含通关），同一种喜可出现多次（如两组四个头） */
  xi: Xi[]
  /** 吃喜净得分：自己出喜的收入减去付给他人的喜分 */
  xiPoints: number
  total: number
}

/**
 * 结算一整桌。
 *
 * 弃牌：弃牌者只付台面分（见 foldCost），此后与本局无关：不收喜、不付喜。
 * 倒水：倒水者在每一道都排在所有未倒水的摆牌者之后；多人倒水时彼此按该道实际强度排序；
 *       不计依赖摆法的喜（双豹子、双顺清等），只看牌构成的喜（四个头、全红等）照常计。
 * 通关：在未弃牌者中三道都拿第一，算一个喜。
 */
export function settle(seats: readonly SeatInput[]): PlayerSettlement[] {
  const n = seats.length
  if (n < 2)
    throw new RangeError('至少 2 人才能结算')
  validateFoldOrders(seats)

  const folded = seats.map(isFold)
  const strengths: (LaneStrengths | null)[] = seats.map(s => isFold(s) ? null : laneStrengths(s))
  const fouls = strengths.map(s => s !== null && isFoulStrengths(s))

  const result: PlayerSettlement[] = seats.map((_, i) => ({
    folded: folded[i],
    laneRank: [0, 0, 0],
    lanePoints: [0, 0, 0],
    foul: fouls[i],
    xi: [],
    xiPoints: 0,
    total: 0,
  }))

  // 每道排序键：未倒水摆牌者 < 倒水者 < 弃牌者；弃牌者之间后弃的排在前面
  const tier = (i: number) => folded[i] ? 2 : fouls[i] ? 1 : 0
  for (let lane = 0; lane < 3; lane++) {
    const order = [...Array(n).keys()].sort((a, b) => {
      const d = tier(a) - tier(b)
      if (d !== 0)
        return d
      if (folded[a])
        return (seats[b] as Fold).foldOrder - (seats[a] as Fold).foldOrder
      return strengths[b]![lane] - strengths[a]![lane]
    })
    let pool = 0
    order.forEach((p, r) => {
      result[p].laneRank[lane] = r + 1
      if (r > 0) {
        result[p].lanePoints[lane] = -r
        pool += r
      }
    })
    result[order[0]].lanePoints[lane] = pool
  }

  seats.forEach((seat, i) => {
    if (isFold(seat))
      return
    const xi = compositionXi(seat.lanes.flat())
    if (!fouls[i])
      xi.push(...arrangementXi(seat))
    if (result[i].laneRank.every(r => r === 1))
      xi.push(Xi.Sweep)
    result[i].xi = xi
  })

  // 每个喜：其余每名未弃牌者付 5 分
  result.forEach((owner, i) => {
    for (let k = 0; k < owner.xi.length; k++) {
      result.forEach((other, j) => {
        if (j !== i && !other.folded) {
          other.xiPoints -= XI_PAY_PER_PLAYER
          owner.xiPoints += XI_PAY_PER_PLAYER
        }
      })
    }
  })

  for (const r of result)
    r.total = r.lanePoints[0] + r.lanePoints[1] + r.lanePoints[2] + r.xiPoints
  return result
}

/** 下一局的首家：本局第一个弃牌者（花分买主动权）；无人弃牌时返回 null，由调用方按常规轮转 */
export function nextLeaderSeat(seats: readonly SeatInput[]): number | null {
  const i = seats.findIndex(s => isFold(s) && s.foldOrder === 1)
  return i === -1 ? null : i
}

function validateFoldOrders(seats: readonly SeatInput[]): void {
  const orders = seats.filter(isFold).map(s => s.foldOrder).sort((a, b) => a - b)
  if (orders.length > seats.length - 1)
    throw new RangeError('至少要有 1 人不弃牌')
  // 弃牌序号必须恰好是 1..m
  orders.forEach((o, i) => {
    if (o !== i + 1)
      throw new RangeError(`弃牌序号必须为 1..${orders.length} 且不重复，实际 [${orders.join(', ')}]`)
  })
}
