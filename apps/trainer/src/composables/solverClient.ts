import type { EvaluateRequest, EvaluateResponse, GradeDTO } from '../worker/protocol'

/**
 * 求解 Worker 的客户端：单例 Worker，按请求 id 匹配响应。
 * 胜率表（约 300 KB）只打包进 Worker，不进入主线程的包。
 */
let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (r: GradeDTO) => void, reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker)
    return worker
  worker = new Worker(new URL('../worker/solver.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<EvaluateResponse>) => {
    const p = pending.get(e.data.id)
    if (!p)
      return
    pending.delete(e.data.id)
    if (e.data.ok)
      p.resolve(e.data.result)
    else
      p.reject(new Error(e.data.error))
  }
  worker.onerror = (e) => {
    // Worker 整体出错时，所有未完成请求一并失败，并在下次请求时重建
    for (const p of pending.values())
      p.reject(new Error(e.message || '求解 Worker 出错'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

export function evaluateInWorker(req: Omit<EvaluateRequest, 'id'>): Promise<GradeDTO> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...req, id } satisfies EvaluateRequest)
  })
}
