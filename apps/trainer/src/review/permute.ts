import type { Card } from '@biji/core'
import { isJoker } from '@biji/core'

/**
 * 复习时的花色置换，防止记住牌面而不是牌理。只在同色花色之间交换：
 * bit0 交换 ♠↔♣，bit1 交换 ♥↔♦，共 4 种（0 为不变）。
 * 同色交换保持大小王的配色关系（大王补红、小王补黑）；
 * 花色大小顺序会变，只影响牌型与点数完全相同时的比较，推荐摆法由 Worker 重新计算。
 */
export const PERMUTATION_COUNT = 4

// 花色编号：0 ♠、1 ♥、2 ♣、3 ♦
const SUIT_MAPS: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [2, 1, 0, 3],
  [0, 3, 2, 1],
  [2, 3, 0, 1],
]

export function permuteSuits(cards: readonly Card[], variant: number): Card[] {
  const map = SUIT_MAPS[variant % PERMUTATION_COUNT]
  return cards.map(c => (isJoker(c) ? c : (c & ~3) | map[c & 3]))
}
