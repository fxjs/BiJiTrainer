import type { Arrangement } from '../src'
import { describe, expect, it } from 'vitest'
import { foldCost, legalArrangements, makeArrangement, nextLeaderSeat, parseCards, settle, Xi } from '../src'

// 整副牌按固定顺序发给 6 人，各自取"尾道优先"的第一个合法摆法，仅用于验证结算的守恒性质
function greedy(hand: number[]): Arrangement {
  const legal = legalArrangements(hand)
  legal.sort((a, b) => b.strengths[0] - a.strengths[0] || b.strengths[1] - a.strengths[1] || b.strengths[2] - a.strengths[2])
  return legal[0].arrangement
}

function shuffled(seed: number): number[] {
  const deck = [...Array(54).keys()]
  let x = seed
  for (let i = deck.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) % 2147483648
    const j = x % (i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

describe('结算', () => {
  it('每道第一名收 15 分，第 2~6 名依次付 1~5 分，整桌零和', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const deck = shuffled(seed)
      const arrs = [...Array(6).keys()].map(i => greedy(deck.slice(i * 9, i * 9 + 9)))
      const res = settle(arrs)
      for (let lane = 0; lane < 3; lane++) {
        const pts = res.map(r => r.lanePoints[lane]).sort((a, b) => a - b)
        expect(pts).toEqual([-5, -4, -3, -2, -1, 15])
      }
      expect(res.reduce((sum, r) => sum + r.total, 0)).toBe(0)
    }
  })

  it('通关：三道第一共 45 分，另加通关喜 25 分，合计 70 分', () => {
    const hands = [
      'A♠ A♥ A♦ K♠ K♥ K♦ Q♠ Q♥ Q♦',
      '2♠ 3♥ 5♣ 7♦ 8♠ 10♥ 2♥ 4♣ 6♦',
      '2♣ 3♦ 5♠ 7♥ 9♣ J♦ 2♦ 4♠ 6♥',
      '3♠ 4♥ 6♣ 8♦ 9♠ J♥ 3♣ 5♥ 7♠',
      '4♦ 6♠ 8♣ 9♥ J♣ 大王 5♦ 7♣ 10♠',
      '8♥ 9♦ J♠ 10♣ 10♦ A♣ K♣ Q♣ 小王',
    ]
    const cards = hands.flatMap(h => parseCards(h))
    expect(new Set(cards).size).toBe(54)
    const res = settle(hands.map(h => greedy(parseCards(h))))
    expect(res[0].xi).toContain(Xi.Sweep)
    expect(res[0].xi).toContain(Xi.AllTrips)
    // 三道 45 + 通关 25 + 全三条 25
    expect(res[0].total).toBe(95)
    expect(res.reduce((sum, r) => sum + r.total, 0)).toBe(0)
  })

  it('两组四个头 + 双豹子 + 通关 = 4 喜', () => {
    // 每手写成 "尾 | 中 | 头"
    const rows = [
      'A♠ A♥ A♣ | K♠ K♥ K♣ | A♦ K♦ 2♠',
      'Q♠ Q♥ Q♣ | J♠ J♥ 3♠ | 10♠ 7♥ 2♥',
      '10♥ 10♣ 10♦ | 9♠ 9♥ 3♥ | 8♠ 6♥ 2♣',
      'Q♦ J♣ J♦ | 9♣ 9♦ 3♣ | 8♥ 5♠ 2♦',
      '7♠ 7♣ 7♦ | 8♣ 8♦ 3♦ | 6♠ 4♥ 大王',
      '5♥ 5♣ 5♦ | 4♠ 4♣ 6♣ | 4♦ 6♦ 小王',
    ]
    const arrs = rows.map((row) => {
      const [tail, mid, head] = row.split('|').map(x => parseCards(x) as unknown as readonly [number, number, number])
      return makeArrangement(tail, mid, head)
    })
    expect(new Set(arrs.flatMap(a => a.lanes.flat())).size).toBe(54)
    const res = settle(arrs)
    expect(res.every(r => !r.foul)).toBe(true)
    expect(res[0].xi.filter(x => x === Xi.FourOfAKind).length).toBe(2)
    expect(res[0].xi).toContain(Xi.DoubleTrips)
    expect(res[0].xi).toContain(Xi.Sweep)
    expect(res[0].xi.length).toBe(4)
    // 三道 45 + 4 喜 × 25
    expect(res[0].total).toBe(145)
    expect(res.reduce((sum, r) => sum + r.total, 0)).toBe(0)
  })
})

describe('弃牌', () => {
  it('6 人桌第 1~5 个弃牌者依次放 15、12、9、6、3 分', () => {
    expect([1, 2, 3, 4, 5].map(k => foldCost(k))).toEqual([15, 12, 9, 6, 3])
    expect(() => foldCost(6)).toThrow()
  })

  it('台面分由三道第一各拿三分之一，弃牌者不收不付喜，下一局首家为第一个弃牌者', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const deck = shuffled(seed)
      const seats = [...Array(6).keys()].map(i => greedy(deck.slice(i * 9, i * 9 + 9)))
      // 座位 4 第一个弃牌，座位 2 第二个弃牌
      const input = seats.map((a, i) => i === 4 ? { foldOrder: 1 } : i === 2 ? { foldOrder: 2 } : a)
      const res = settle(input)
      expect(res[4].total).toBe(-15)
      expect(res[2].total).toBe(-12)
      for (const i of [2, 4]) {
        expect(res[i].folded).toBe(true)
        expect(res[i].xi).toEqual([])
        expect(res[i].xiPoints).toBe(0)
      }
      for (let lane = 0; lane < 3; lane++) {
        // 第一名：其余 3 名摆牌者付 1+2+3，加上两份台面分 5 + 4
        const first = res.find(r => r.laneRank[lane] === 1)!
        expect(first.folded).toBe(false)
        expect(first.lanePoints[lane]).toBe(15)
      }
      // 喜分只在未弃牌者之间结算
      const active = res.filter(r => !r.folded)
      expect(active.reduce((sum, r) => sum + r.xiPoints, 0)).toBe(0)
      expect(res.reduce((sum, r) => sum + r.total, 0)).toBe(0)
      expect(nextLeaderSeat(input)).toBe(4)
    }
  })

  it('弃牌序号必须连续且至少 1 人不弃牌', () => {
    const deck = shuffled(7)
    const seats = [...Array(6).keys()].map(i => greedy(deck.slice(i * 9, i * 9 + 9)))
    expect(() => settle(seats.map((a, i) => i === 0 ? { foldOrder: 2 } : a))).toThrow()
    expect(() => settle(seats.map((_, i) => ({ foldOrder: i + 1 })))).toThrow()
    expect(nextLeaderSeat(seats)).toBeNull()
  })

  // 本桌规则下弃牌在名次分上被"不弃"压制：前面已有 f 人弃牌时，自己弃牌付 3(5−f)；
  // 不弃则场上最多 6−f 人摆牌，每道最多付 5−f，三道合计同样是 3(5−f)。
  it('未弃牌者三道名次分合计 ≥ −3 × (摆牌人数 − 1)，不低于其弃牌成本', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const deck = shuffled(seed)
      const folders = seed % 5
      const input = [...Array(6).keys()].map(i =>
        i < folders ? { foldOrder: i + 1 } : greedy(deck.slice(i * 9, i * 9 + 9)))
      const res = settle(input)
      const active = 6 - folders
      res.forEach((r, i) => {
        if (r.folded)
          return
        const lanes = r.lanePoints[0] + r.lanePoints[1] + r.lanePoints[2]
        expect(lanes).toBeGreaterThanOrEqual(-3 * (active - 1))
        // 该座位若改为弃牌，是第 (之前弃牌人数 + 1) 个
        const before = Math.min(i, folders)
        expect(lanes).toBeGreaterThanOrEqual(-foldCost(before + 1))
      })
    }
  })
})

