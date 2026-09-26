import type { Policy } from '../src'
import { describe, expect, it } from 'vitest'
import { choosePattern, patternStrengths, viewHand } from '../src'
import cases from './fixtures/python-policy.json'
import { pythonModel } from './helpers'

// 在同一张胜率表（Python 训练的 model.pkl）上，TS 的摆法选择必须与 biji_sim.arrange 逐手一致
describe('与 Python 摆牌策略对拍', () => {
  for (const policy of ['top', 'duel', 'greedy'] as Policy[]) {
    it(`${policy}：2000 手随机牌选出的三道强度完全一致`, () => {
      const mismatches: string[] = []
      for (const c of cases as { hand: number[], top: number[], duel: number[], greedy: number[] }[]) {
        const view = viewHand(c.hand)
        const got = patternStrengths(view, choosePattern(view, pythonModel, policy))
        if (got.join() !== c[policy].join())
          mismatches.push(`${c.hand} ts=${got} py=${c[policy]}`)
      }
      expect(mismatches.slice(0, 5)).toEqual([])
    })
  }
})
