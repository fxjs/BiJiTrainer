import { mulberry32 } from '../src'
import { parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { evaluateFold, generateFoldDrill, opponentFolds } from '../src'
import { defaultModel } from '../src/defaultModel'

const model = defaultModel()

describe('对手弃牌启发式', () => {
  it('第 k 个弃牌的门槛为 −3(6−k) + 3', () => {
    expect(opponentFolds(-12.1, 1)).toBe(true)
    expect(opponentFolds(-11.9, 1)).toBe(false)
    expect(opponentFolds(-0.1, 5)).toBe(true)
    // 第 6 个人不能弃牌
    expect(opponentFolds(-100, 6)).toBe(false)
  })
})

describe('弃牌判断', () => {
  it('强牌不弃', () => {
    const e = evaluateFold(parseCards('5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦'), model, { position: 3, foldedBefore: 2 }, { samples: 300 })
    expect(e.cost).toBe(9)
    expect(e.decision).toBe('play')
    expect(e.diff).toBeGreaterThan(20)
  })

  it('首家弃牌成本 15，而三道全垫底最多付 15 分，弱牌也不弃', () => {
    const e = evaluateFold(parseCards('2♣ 3♥ 5♠ 7♦ 9♣ J♥ 4♦ 6♣ 8♥'), model, { position: 0, foldedBefore: 0 }, { samples: 300 })
    expect(e.cost).toBe(15)
    expect(e.decision).toBe('play')
  })

  it('前面 5 人都弃牌时不能弃', () => {
    const e = evaluateFold(parseCards('2♣ 3♥ 5♠ 7♦ 9♣ J♥ 4♦ 6♣ 8♥'), model, { position: 5, foldedBefore: 5 }, { samples: 50 })
    expect(e.canFold).toBe(false)
    expect(e.decision).toBe('play')
  })

  it('同一种子结果可复现，且情境非法时报错', () => {
    const hand = parseCards('2♣ 3♥ 5♠ 7♦ 9♣ J♥ 4♦ 6♣ 8♥')
    const a = evaluateFold(hand, model, { position: 4, foldedBefore: 3 }, { samples: 200, seed: 9 })
    const b = evaluateFold(hand, model, { position: 4, foldedBefore: 3 }, { samples: 200, seed: 9 })
    expect(a.playMean).toBe(b.playMean)
    expect(() => evaluateFold(hand, model, { position: 2, foldedBefore: 3 })).toThrow()
  })

  it('生成的训练题合法', () => {
    const rng = mulberry32(5)
    for (let i = 0; i < 30; i++) {
      const { hand, scenario } = generateFoldDrill(model, rng)
      expect(new Set(hand).size).toBe(9)
      expect(scenario.foldedBefore).toBeLessThanOrEqual(scenario.position)
      expect(scenario.foldedBefore).toBeLessThanOrEqual(4)
    }
  })
})
