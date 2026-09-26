import type { Arrangement } from '@biji/core'
import type { TagCode } from '../src'
import { parseCards } from '@biji/core'
import { describe, expect, it } from 'vitest'
import { diagnose, evaluateByMonteCarlo } from '../src'
import { defaultModel } from '../src/defaultModel'
import { arr } from './helpers'

const model = defaultModel()

/** 用 600 局蒙特卡洛得到两种摆法各道拿第一的概率，再诊断 */
function tagsOf(hand: string, player: Arrangement, best: Arrangement): TagCode[] {
  const cards = parseCards(hand)
  const [p, b] = evaluateByMonteCarlo(cards, [player, best], model, { samples: 600, seed: 17 })
  return diagnose({ hand: cards, player, playerFirst: p.laneFirst, best, bestFirst: b.laneFirst }).map(t => t.code)
}

// 讲义中的 5 组"直觉摆法 vs 进阶摆法"
describe('错因诊断：讲义牌例', () => {
  it('三条 A 进尾道：直觉摆法、该拆的三条没拆、头道本可以争第一', () => {
    const tags = tagsOf(
      '5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦',
      arr('A♥ A♣ A♦ | Q♣ Q♦ K♣ | 10♥ 8♥ 5♦'),
      arr('A♣ K♣ Q♣ | A♦ Q♦ 5♦ | A♥ 10♥ 8♥'),
    )
    expect(tags).toEqual(['greedyTail', 'keptTrips', 'headWasted'])
  })

  it('头道留对子 Q：不该拆的三条拆了、没有集中火力', () => {
    const tags = tagsOf(
      '2♠ 8♠ 9♠ 10♠ Q♠ Q♥ Q♣ K♦ 小王',
      arr('8♠ 9♠ 10♠ | Q♠ 2♠ 小王 | Q♥ Q♣ K♦'),
      arr('Q♠ Q♥ Q♣ | 8♠ 9♠ 10♠ | K♦ 2♠ 小王'),
    )
    expect(tags).toContain('splitTrips')
    expect(tags).toContain('notConcentrated')
  })

  it('保留三条 4：该拆的三条没拆、头道本可以争第一', () => {
    const tags = tagsOf(
      '4♥ 4♣ 4♦ 7♣ 9♣ 9♦ J♦ K♥ A♥',
      arr('4♥ 4♣ 4♦ | 9♣ 9♦ 7♣ | A♥ K♥ J♦'),
      arr('A♥ K♥ 4♥ | J♦ 9♦ 4♦ | 9♣ 7♣ 4♣'),
    )
    expect(tags).toContain('keptTrips')
    expect(tags).toContain('headWasted')
  })

  // 天然方块同花 A-K-4 大于 A-K-大王（王比点小于 2），所以直觉摆法恰好是尾道优先的贪心摆法
  it('大王落进乌龙：直觉摆法、王的用法、头道本可以争第一', () => {
    const tags = tagsOf(
      '2♥ 3♦ 4♦ 10♠ 10♣ 10♦ K♦ A♦ 大王',
      arr('10♠ 10♣ 10♦ | A♦ K♦ 4♦ | 3♦ 2♥ 大王'),
      arr('10♠ 10♣ 10♦ | A♦ K♦ 大王 | 2♥ 3♦ 4♦'),
    )
    expect(tags).toEqual(['greedyTail', 'jokerMisuse', 'headWasted'])
  })

  it('小顺子放中道：顺子错放在中道、头道本可以争第一', () => {
    const tags = tagsOf(
      '2♣ 3♥ 4♠ 4♦ 6♠ 7♥ 8♣ J♠ K♠',
      arr('K♠ J♠ 6♠ | 2♣ 3♥ 4♦ | 8♣ 7♥ 4♠'),
      arr('K♠ J♠ 4♠ | 6♠ 7♥ 8♣ | 2♣ 3♥ 4♦'),
    )
    expect(tags).toEqual(['straightInMiddle', 'headWasted'])
  })
})

describe('错因诊断：其他', () => {
  it('倒水', () => {
    const tags = tagsOf(
      '5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦',
      arr('Q♣ Q♦ K♣ | A♥ A♣ A♦ | 10♥ 8♥ 5♦'),
      arr('A♣ K♣ Q♣ | A♦ Q♦ 5♦ | A♥ 10♥ 8♥'),
    )
    expect(tags[0]).toBe('foul')
  })

  it('漏喜：能摆双豹子却只摆了一道三条', () => {
    const tags = tagsOf(
      'A♠ A♥ A♦ K♠ K♥ K♦ 2♣ 5♦ 9♥',
      arr('A♠ A♥ A♦ | K♠ K♥ 2♣ | K♦ 9♥ 5♦'),
      arr('A♠ A♥ A♦ | K♠ K♥ K♦ | 2♣ 5♦ 9♥'),
    )
    expect(tags).toContain('missedXi')
  })

  it('命中不了任何规则时给出 other 与各道对比', () => {
    const cards = parseCards('5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦')
    const player = arr('A♣ K♣ Q♣ | A♦ Q♦ 5♦ | A♥ 10♥ 8♥')
    const tags = diagnose({ hand: cards, player, playerFirst: [0.4, 0.9, 1], best: player, bestFirst: [0.4, 0.9, 1] })
    expect(tags.map(t => t.code)).toEqual(['other'])
    expect(tags[0].detail).toContain('头道')
  })
})
