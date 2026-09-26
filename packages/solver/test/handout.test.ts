import { laneStrengths, parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { rankPatterns, tableValue, viewHand } from '../src'
import { arr, HANDOUT_CASES, pythonModel } from './helpers'

// 讲义数值由 Python 模型按表估值算出，保留一位小数
describe('在 Python 胜率表上复现讲义牌例', () => {
  for (const c of HANDOUT_CASES) {
    it(`${c.hand}：最优期望 ${c.bestEV}`, () => {
      const ranked = rankPatterns(viewHand(parseCards(c.hand)), pythonModel)
      expect(ranked[0].value).toBeCloseTo(c.bestEV, 1)
      if ('best' in c) {
        expect(ranked[0].strengths).toEqual(laneStrengths(arr(c.best)))
        const naive = laneStrengths(arr(c.naive))
        expect(tableValue(pythonModel, ...naive)).toBeCloseTo(c.naiveEV, 1)
      }
    })
  }
})
