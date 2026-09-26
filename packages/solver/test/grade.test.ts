import { parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { grade, recommend } from '../src'
import { defaultModel } from '../src/defaultModel'
import { arr, HANDOUT_CASES } from './helpers'

const model = defaultModel()
const hero = HANDOUT_CASES[0]
const hand = parseCards(hero.hand)

describe('评级', () => {
  it('推荐摆法评为最优', () => {
    const g = grade(recommend(hand, model, { samples: 300, seed: 1, extra: [arr(hero.best)] }))
    expect(g.verdict).toBe('best')
    expect(g.gap).toBe(0)
  })

  it('直觉摆法评为明显失误', () => {
    const g = grade(recommend(hand, model, { samples: 300, seed: 1, extra: [arr(hero.naive)] }))
    expect(g.verdict).toBe('mistake')
    expect(g.evLoss).toBeGreaterThan(25)
  })

  it('倒水', () => {
    const g = grade(recommend(hand, model, { samples: 100, seed: 1, extra: [arr('Q♣ Q♦ K♣ | A♥ A♣ A♦ | 10♥ 8♥ 5♦')] }))
    expect(g.verdict).toBe('foul')
  })

  it('没有传入玩家摆法时报错', () => {
    expect(() => grade(recommend(hand, model, { samples: 50, seed: 1 }))).toThrow()
  })
})
