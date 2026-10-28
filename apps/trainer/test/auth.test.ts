import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import type { Pinia } from 'pinia'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../src/stores/auth'

const fixtures = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
  listener: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
}))
vi.mock('../src/lib/supabase', () => ({
  configurationError: null,
  supabase: {
    rpc: fixtures.rpc,
    auth: {
      getSession: fixtures.getSession,
      onAuthStateChange: (callback: typeof fixtures.listener) => {
        fixtures.listener = callback
        return { data: { subscription: { unsubscribe: () => { fixtures.listener = null } } } }
      },
    },
  },
}))

const identity = { id: 'old-character', name: '郭靖' }
const otherIdentity = { id: 'other-character', name: '黄蓉' }
const candidate = { id: 'new-candidate', name: '杨过', remaining: 99 }
const session = (id: string) => ({ user: { id } as User }) as Session
let pinia: Pinia

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  fixtures.getSession.mockReset().mockResolvedValue({ data: { session: session('transport-a') }, error: null })
  fixtures.rpc.mockReset().mockImplementation(async (method: string) => ({
    data: method === 'current_character' ? identity : method === 'reserve_character' ? candidate : null,
    error: null,
  }))
})
afterEach(() => disposePinia(pinia))

describe('隐退名号的异步身份边界', () => {
  it('等待删除成功后才清本机身份，候选加载期间持续锁住其他身份操作', async () => {
    const store = useAuthStore()
    await store.init()
    const receipt = Promise.withResolvers<{ data: null, error: null }>()
    const reservation = Promise.withResolvers<{ data: typeof candidate, error: null }>()
    fixtures.rpc.mockImplementation((method: string) => method === 'retire_character' ? receipt.promise : reservation.promise)
    const retiring = store.retire()
    await Promise.resolve()
    expect(store.identity).toEqual(identity)
    expect(store.busy).toBe(true)
    expect(await store.leave()).toBe(false)
    expect(await store.retire()).toBe(false)
    expect(fixtures.rpc.mock.calls.filter(([method]) => method === 'retire_character')).toHaveLength(1)
    expect(fixtures.rpc.mock.calls.some(([method]) => method === 'leave_character')).toBe(false)
    receipt.resolve({ data: null, error: null })
    await vi.waitFor(() => expect(store.identity).toBeNull())
    expect(store.candidate).toBeNull()
    expect(store.busy).toBe(true)
    reservation.resolve({ data: candidate, error: null })
    expect(await retiring).toBe(true)
    expect(store.candidate).toEqual(candidate)
    expect(store.busy).toBe(false)
    expect(store.error).toBeNull()
  })

  it('删除失败保留原身份与真实错误，重试可完成隐退', async () => {
    const store = useAuthStore()
    await store.init()
    fixtures.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: '删除事务已回滚' } })
    expect(await store.retire()).toBe(false)
    expect(store.identity).toEqual(identity)
    expect(store.candidate).toBeNull()
    expect(store.error).toBe('删除事务已回滚')
    expect(store.busy).toBe(false)
    expect(await store.retire()).toBe(true)
    expect(store.identity).toBeNull()
    expect(store.candidate).toEqual(candidate)
    expect(store.error).toBeNull()
  })

  it('删除已提交但重新取候选失败时，不把已删除身份伪装成仍然存在', async () => {
    const store = useAuthStore()
    await store.init()
    fixtures.rpc.mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: '候选服务暂不可用' } })
    expect(await store.retire()).toBe(false)
    expect(store.identity).toBeNull()
    expect(store.candidate).toBeNull()
    expect(store.error).toBe('候选服务暂不可用')
    fixtures.rpc.mockResolvedValueOnce({ data: null, error: null })
    await store.init(true)
    expect(store.identity).toBeNull()
    expect(store.candidate).toEqual(candidate)
    expect(store.error).toBeNull()
  })

  it.each([null, { code: '42501', message: '旧身份已失效' }])('传输会话变化后，旧隐退回执不覆盖新身份（%j）', async (error) => {
    const store = useAuthStore()
    await store.init()
    const receipt = Promise.withResolvers<{ data: null, error: typeof error }>()
    fixtures.rpc.mockImplementation(async (method: string) => method === 'retire_character'
      ? receipt.promise
      : { data: otherIdentity, error: null })
    const retiring = store.retire()
    await Promise.resolve()
    fixtures.listener!('SIGNED_IN', session('transport-b'))
    await vi.waitFor(() => expect(store.identity).toEqual(otherIdentity))
    receipt.resolve({ data: null, error })
    expect(await retiring).toBe(false)
    expect(store.identity).toEqual(otherIdentity)
    expect(store.candidate).toBeNull()
    expect(store.error).toBeNull()
    expect(fixtures.rpc.mock.calls.some(([method]) => method === 'reserve_character')).toBe(false)
  })

  it('同一轮同时请求两种身份操作时只执行先取得锁的一种', async () => {
    const store = useAuthStore()
    await store.init()
    const retiring = store.retire()
    const leaving = store.leave()
    expect(await retiring).toBe(true)
    expect(await leaving).toBe(false)
    expect(fixtures.rpc.mock.calls.some(([method]) => method === 'leave_character')).toBe(false)
  })


  it('store 销毁后旧删除回执不会发起候选请求', async () => {
    const store = useAuthStore()
    await store.init()
    const receipt = Promise.withResolvers<{ data: null, error: null }>()
    fixtures.rpc.mockReturnValueOnce(receipt.promise)
    const retiring = store.retire()
    await Promise.resolve()
    store.$dispose()
    receipt.resolve({ data: null, error: null })
    expect(await retiring).toBe(false)
    expect(fixtures.rpc.mock.calls.some(([method]) => method === 'reserve_character')).toBe(false)
  })
})
