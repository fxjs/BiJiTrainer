import { describe, expect, it } from 'vitest'
import { Category, categoryOf, describe as describeHand, evaluate, parseCards } from '../src'

const s = (text: string) => evaluate(parseCards(text))
const cat = (text: string) => categoryOf(s(text))

describe('牌型识别', () => {
  it('六种牌型', () => {
    expect(cat('5♠ 5♥ 5♦')).toBe(Category.Trips)
    expect(cat('7♥ 8♥ 9♥')).toBe(Category.StraightFlush)
    expect(cat('A♥ 9♥ 4♥')).toBe(Category.Flush)
    expect(cat('3♦ 4♠ 5♦')).toBe(Category.Straight)
    expect(cat('10♠ 10♥ 5♦')).toBe(Category.Pair)
    expect(cat('A♠ K♥ 8♦')).toBe(Category.HighCard)
  })

  it('三条大于同花顺', () => {
    expect(s('2♠ 2♥ 2♦')).toBeGreaterThan(s('Q♠ K♠ A♠'))
  })

  it('A23 是最小的顺子，QKA 最大', () => {
    expect(s('A♠ 2♥ 3♦')).toBeLessThan(s('2♠ 3♥ 4♦'))
    expect(s('Q♠ K♥ A♦')).toBeGreaterThan(s('J♠ Q♥ K♦'))
    expect(describeHand(s('A♠ 2♥ 3♦'))).toBe('顺子 A23')
  })

  it('K A 2 不成顺', () => {
    expect(cat('K♠ A♥ 2♦')).toBe(Category.HighCard)
  })
})

describe('大小王：配色不配点', () => {
  it('大王只补红色花色，小王只补黑色花色', () => {
    expect(cat('A♥ 9♥ 大王')).toBe(Category.Flush)
    expect(cat('A♦ 9♦ 大王')).toBe(Category.Flush)
    expect(cat('A♠ 9♠ 大王')).toBe(Category.HighCard)
    expect(cat('A♠ 9♠ 小王')).toBe(Category.Flush)
    expect(cat('A♥ 9♥ 小王')).toBe(Category.HighCard)
  })

  it('双王不能同在一个同花里', () => {
    expect(cat('A♥ 小王 大王')).toBe(Category.HighCard)
  })

  it('王不能凑对子、顺子、同花顺、三条', () => {
    expect(cat('5♠ 5♥ 大王')).toBe(Category.Pair)
    expect(cat('7♥ 8♥ 大王')).toBe(Category.Flush)
    expect(cat('7♠ 8♥ 大王')).toBe(Category.HighCard)
  })

  it('王比点时小于 2，大王大于小王', () => {
    expect(s('A♥ 9♥ 大王')).toBeLessThan(s('A♥ 9♥ 2♥'))
    expect(s('A♥ 9♥ 大王')).toBeLessThan(s('A♦ 9♦ 2♦'))
    expect(s('A♠ K♥ 大王')).toBeGreaterThan(s('A♠ K♥ 小王'))
    expect(describeHand(s('A♥ 9♥ 大王'))).toBe('同花 A-9-大王')
  })
})

describe('花色比较：♠ > ♥ > ♣ > ♦，没有平局', () => {
  it('其余牌型比点数最大一张的花色', () => {
    expect(s('A♠ K♥ 8♦')).toBeGreaterThan(s('A♥ K♠ 8♣'))
  })

  it('对子比对子中较大的花色', () => {
    expect(s('K♠ K♦ 5♣')).toBeGreaterThan(s('K♥ K♣ 5♠'))
  })

  it('A23 的主牌是 3', () => {
    expect(s('A♦ 2♦ 3♠')).toBeGreaterThan(s('A♠ 2♠ 3♥'))
  })

  it('同牌型先逐张比点，再比花色', () => {
    expect(s('A♦ K♦ 4♦')).toBeGreaterThan(s('A♠ 9♠ 8♠'))
  })
})
