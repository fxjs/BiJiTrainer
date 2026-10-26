import type { Arrangement, Triple } from '@biji/core'
import type { ScoredArrangement } from '@biji/solver'
import type { EvaluateRequest, EvaluateResponse, ScoredDTO } from './protocol'
import { compositionXi, xiOf } from '@biji/core'
import { arrangementKey, diagnose, grade, recommend } from '@biji/solver'
import { defaultModel } from '@biji/solver/default-model'

/** 结果页展示的备选摆法数量 */
const ALTERNATIVES = 3

/** Worker 全局对象；只声明用到的成员，避免在同一工程中同时引入 DOM 与 WebWorker 两套 lib */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<EvaluateRequest>) => void) | null
  postMessage: (msg: EvaluateResponse) => void
}

function toDTO(s: ScoredArrangement): ScoredDTO {
  const lanes = s.arrangement.lanes.map(l => [...l]) as ScoredDTO['lanes']
  return {
    lanes,
    strengths: s.strengths,
    foul: s.foul,
    // 倒水不计依赖摆法的喜，只保留牌构成的喜，与 core 结算一致
    xi: s.foul ? compositionXi(s.arrangement.lanes.flat()) : xiOf(s.arrangement),
    mean: s.stat.mean,
    std: s.stat.std,
    stderr: s.stat.stderr,
    laneFirst: s.stat.laneFirst,
    sweep: s.stat.sweep,
    gap: s.gap,
    tableRank: s.tableRank,
    equivalentBest: s.equivalentBest,
  }
}

scope.onmessage = (e) => {
  const req = e.data
  const t0 = performance.now()
  let res: EvaluateResponse
  try {
    const [t, m, h] = req.player.map(l => [l[0], l[1], l[2]] as Triple)
    const player: Arrangement = { lanes: [t, m, h] }
    const rec = recommend(req.hand, defaultModel(), {
      samples: req.samples,
      seed: req.seed,
      extra: [player],
    })
    const g = grade(rec)
    const tags = g.verdict === 'best'
      ? []
      : diagnose({
          hand: req.hand,
          player,
          playerFirst: g.player.stat.laneFirst,
          best: g.best.arrangement,
          bestFirst: g.best.stat.laneFirst,
        })
    const bestKey = arrangementKey(g.best.arrangement)
    const playerKey = arrangementKey(g.player.arrangement)
    res = {
      id: req.id,
      ok: true,
      result: {
        verdict: g.verdict,
        evLoss: g.evLoss,
        gap: g.gap,
        player: toDTO(g.player),
        best: toDTO(g.best),
        alternatives: rec.ranked
          .filter(s => !s.foul && ![bestKey, playerKey].includes(arrangementKey(s.arrangement)))
          .slice(0, ALTERNATIVES)
          .map(toDTO),
        tags,
        legalCount: rec.legalCount,
        samples: req.samples,
        elapsedMs: Math.round(performance.now() - t0),
      },
    }
  }
  catch (err) {
    res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  scope.postMessage(res)
}
