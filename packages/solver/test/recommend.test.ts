import { describe as describeHand, laneStrengths, parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { arrangementKey, evaluateByMonteCarlo, pairedStderr, recommend } from '../src'
import { defaultModel } from '../src/defaultModel'
import { arr, HANDOUT_CASES } from './helpers'

const model = defaultModel()
const hero = HANDOUT_CASES[0]

describe('蒙特卡洛精排', () => {
  it('同一种子结果可复现', () => {
    const hand = parseCards(hero.hand)
    const a = evaluateByMonteCarlo(hand, [arr(hero.best)], model, { samples: 200, seed: 3 })
    const b = evaluateByMonteCarlo(hand, [arr(hero.best)], model, { samples: 200, seed: 3 })
    expect(a[0].mean).toBe(b[0].mean)
    expect(a[0].std).toBe(b[0].std)
  })

  it('与表估值同量级：讲义首例两种摆法（1000 局）', () => {
    const hand = parseCards(hero.hand)
    const [best, naive] = evaluateByMonteCarlo(hand, [arr(hero.best), arr(hero.naive)], model, { samples: 1000, seed: 11 })
    expect(Math.abs(best.mean - hero.bestEV)).toBeLessThan(3)
    expect(Math.abs(naive.mean - hero.naiveEV)).toBeLessThan(3)
    // 公共随机数：差值的配对标准误小于各自标准误之和
    expect(pairedStderr(best, naive)).toBeLessThan(best.stderr + naive.stderr)
    // 三道同花头道几乎必拿第一
    expect(best.laneFirst[2]).toBeGreaterThan(0.98)
  })
})

describe('推荐', () => {
  it('讲义首例：推荐三道同花，直觉摆法明显失误', () => {
    const r = recommend(parseCards(hero.hand), model, { samples: 1000, seed: 5, extra: [arr(hero.naive)] })
    expect(r.legalCount).toBe(280)
    expect(arrangementKey(r.best.arrangement)).toBe(arrangementKey(arr(hero.best)))
    const naive = r.extra[0]
    expect(naive.strengths).toEqual(laneStrengths(arr(hero.naive)))
    expect(naive.equivalentBest).toBe(false)
    expect(naive.gap).toBeGreaterThan(25)
    expect(naive.tableRank).toBeGreaterThan(1)
    // ranked 按效用降序，效用 = 均值 − λ·标准差（默认 λ = 0.1）
    for (let i = 1; i < r.ranked.length; i++)
      expect(r.ranked[i - 1].utility).toBeGreaterThanOrEqual(r.ranked[i].utility)
    for (const s of r.ranked)
      expect(s.utility).toBeCloseTo(s.stat.mean - 0.1 * s.stat.std, 10)
  })

  it('玩家倒水的摆法也能评估', () => {
    const foul = arr('Q♣ Q♦ K♣ | A♥ A♣ A♦ | 10♥ 8♥ 5♦')
    const r = recommend(parseCards(hero.hand), model, { samples: 300, seed: 5, extra: [foul] })
    const s = r.extra[0]
    expect(s.foul).toBe(true)
    expect(s.tableValue).toBeNull()
    expect(s.tableRank).toBeNull()
    // 倒水三道都排在未倒水者之后，名次分为 −15，另可能付对手的喜分
    expect(s.stat.mean).toBeLessThanOrEqual(-15)
  })

  it('讲义其余牌例：推荐摆法即表估值最优摆法', () => {
    for (const c of HANDOUT_CASES.slice(1)) {
      const r = recommend(parseCards(c.hand), model, { samples: 500, seed: 9 })
      expect(r.best.tableRank, `${c.hand} → ${r.best.strengths.map(describeHand).join(' / ')}`).toBe(1)
    }
  })
})
