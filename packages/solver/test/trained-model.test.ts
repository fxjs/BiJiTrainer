import { laneStrengths, parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { choosePattern, distinctStrengths, patternStrengths, rankPatterns, tableValue, viewHand } from '../src'
import { defaultModel } from '../src/defaultModel'
import cases from './fixtures/python-policy.json'
import { arr, HANDOUT_CASES, pythonModel } from './helpers'

// TS 自训练的胜率表（data/lane-model.json）与 Python 训练的表：两者随机数不同，只能在抽样误差内一致
describe('自训练胜率表与 Python 胜率表一致', () => {
  const model = defaultModel()

  it('全部 3848 个强度值：p、T 之差 < 0.005，每道期望之差 < 0.1 分', () => {
    for (let k = 0; k < 3; k++) {
      for (const s of distinctStrengths()) {
        expect(Math.abs(model.p[k][s] - pythonModel.p[k][s])).toBeLessThan(0.005)
        expect(Math.abs(model.top[k][s] - pythonModel.top[k][s])).toBeLessThan(0.005)
        expect(Math.abs(model.ev[k][s] - pythonModel.ev[k][s])).toBeLessThan(0.1)
      }
    }
  })

  it('2000 手随机牌：≥ 99% 选出相同摆法，不同者只出现在估值差 < 0.2 分的近似平手处', () => {
    let same = 0
    for (const c of cases as { hand: number[], top: [number, number, number] }[]) {
      const view = viewHand(c.hand)
      const mine = patternStrengths(view, choosePattern(view, model, 'top'))
      if (mine.join() === c.top.join()) {
        same++
        continue
      }
      expect(tableValue(model, ...mine) - tableValue(model, ...c.top)).toBeLessThan(0.2)
    }
    expect(same / cases.length).toBeGreaterThanOrEqual(0.99)
  })

  for (const c of HANDOUT_CASES) {
    it(`讲义牌例 ${c.hand}：最优摆法相同，期望与讲义相差 < 0.5`, () => {
      const hand = parseCards(c.hand)
      const mine = rankPatterns(viewHand(hand), model)[0]
      const py = rankPatterns(viewHand(hand), pythonModel)[0]
      expect(mine.strengths).toEqual(py.strengths)
      expect(Math.abs(mine.value - c.bestEV)).toBeLessThan(0.5)
      if ('best' in c)
        expect(mine.strengths).toEqual(laneStrengths(arr(c.best)))
    })
  }
})
