import type { Arrangement, Triple } from '@biji/core'
import type { LaneTable } from '../src'
import { makeArrangement, parseCards } from '@biji/core'
import { LaneModel } from '../src'
import pyTable from './fixtures/python-model.json'

export const pythonModel = LaneModel.fromTable(pyTable as LaneTable)

/** "尾 | 中 | 头" 写法的摆法 */
export function arr(text: string): Arrangement {
  const [t, m, h] = text.split('|').map(x => parseCards(x) as unknown as Triple)
  return makeArrangement(t, m, h)
}

/** 讲义中的 5 手牌例：最优摆法与讲义给出的期望（表估值，含通关近似，不含喜） */
export const HANDOUT_CASES = [
  {
    hand: '5♦ 8♥ 10♥ Q♣ Q♦ K♣ A♥ A♣ A♦',
    best: 'A♣ K♣ Q♣ | A♦ Q♦ 5♦ | A♥ 10♥ 8♥',
    bestEV: 44.1,
    naive: 'A♥ A♣ A♦ | Q♣ Q♦ K♣ | 10♥ 8♥ 5♦',
    naiveEV: 5.8,
  },
  { hand: '2♠ 8♠ 9♠ 10♠ Q♠ Q♥ Q♣ K♦ 小王', bestEV: 24.1 },
  { hand: '4♥ 4♣ 4♦ 7♣ 9♣ 9♦ J♦ K♥ A♥', bestEV: 15.6 },
  { hand: '2♥ 3♦ 4♦ 10♠ 10♣ 10♦ K♦ A♦ 大王', bestEV: 42.0 },
  { hand: '2♣ 3♥ 4♠ 4♦ 6♠ 7♥ 8♣ J♠ K♠', bestEV: 1.3 },
] as const
