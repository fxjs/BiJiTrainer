import type { SupabaseClient, User } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { onScopeDispose, ref, shallowRef } from 'vue'
import { configurationError, supabase } from '../lib/supabase'

export interface CharacterIdentity {
  id: string
  name: string
}
export interface CharacterCandidate extends CharacterIdentity {
  remaining: number
}

function errorMessage(cause: unknown): string {
  const code = cause && typeof cause === 'object' && 'code' in cause ? String(cause.code) : ''
  if (code === 'anonymous_provider_disabled')
    return '请先在 Supabase 中开启匿名登录。'
  if (code === 'PGRST202' || code === 'PGRST205')
    return '名号服务尚未初始化，请先执行数据库迁移。'
  if (code === 'over_request_rate_limit')
    return '操作过于频繁，请稍后再试。'
  if (cause instanceof TypeError)
    return '暂时连不上服务器，请重试。'
  return cause && typeof cause === 'object' && 'message' in cause ? String(cause.message) : '进入失败，请重试。'
}

export const useAuthStore = defineStore('auth', () => {
  // 匿名会话只用于传输认证；真正的训练身份由后台人物 UUID 决定。
  const user = shallowRef<User | null>(null)
  const identity = shallowRef<CharacterIdentity | null>(null)
  const candidate = shallowRef<CharacterCandidate | null>(null)
  const ready = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(configurationError)
  let initialization: Promise<void> | null = null
  let hydration: Promise<void> | null = null
  let bootstrapping = false
  let unsubscribe: (() => void) | null = null
  let generation = 0
  let disposed = false

  async function loadCharacter(version: number) {
    try {
      const { data, error: loadError } = await supabase!.rpc('current_character')
      if (loadError)
        throw loadError
      if (version !== generation || disposed)
        return
      identity.value = data as CharacterIdentity | null
      if (!identity.value) {
        const reserved = await supabase!.rpc('reserve_character', { p_replace: false })
        if (reserved.error)
          throw reserved.error
        if (version === generation && !disposed)
          candidate.value = reserved.data as CharacterCandidate
      }
    }
    catch (cause) {
      if (version === generation && !disposed)
        error.value = errorMessage(cause)
    }
    finally {
      if (version === generation && !disposed) {
        ready.value = true
        busy.value = false
      }
    }
  }

  function receiveUser(next: User | null) {
    const changed = (user.value?.id ?? null) !== (next?.id ?? null)
    user.value = next
    if (!changed)
      return
    const version = ++generation
    identity.value = null
    candidate.value = null
    error.value = null
    ready.value = false
    if (next) {
      busy.value = true
      // 认证回调在 SDK 锁内运行：不等待 RPC，异步加载不会反向阻塞认证锁。
      hydration = Promise.resolve().then(() => loadCharacter(version))
    }
    else {
      hydration = null
      busy.value = false
      if (!bootstrapping)
        queueMicrotask(() => { if (!disposed) void init(true) })
    }
  }

  async function initialize() {
    ready.value = false
    busy.value = true
    error.value = configurationError
    try {
      if (!supabase) {
        ready.value = true
        busy.value = false
        return
      }
      if (!unsubscribe) {
        const { data } = supabase.auth.onAuthStateChange((_event, session) => receiveUser(session?.user ?? null))
        unsubscribe = () => data.subscription.unsubscribe()
      }
      const existing = await supabase.auth.getSession()
      if (existing.error)
        throw existing.error
      let session = existing.data.session
      if (!session) {
        const anonymous = await supabase.auth.signInAnonymously()
        if (anonymous.error)
          throw anonymous.error
        session = anonymous.data.session
      }
      if (disposed)
        return
      if (!session)
        throw new Error('未取得连接身份，请重试。')
      receiveUser(session.user)
      if (!hydration) {
        const version = ++generation
        hydration = loadCharacter(version)
      }
      await hydration
    }
    catch (cause) {
      if (!disposed) {
        error.value = errorMessage(cause)
        ready.value = true
        busy.value = false
      }
    }
    finally {
      bootstrapping = false
    }
  }

  function init(force = false): Promise<void> {
    if (bootstrapping)
      return initialization!
    if (initialization && !force)
      return initialization
    if (force) {
      generation++
      hydration = null
      identity.value = null
      candidate.value = null
    }
    bootstrapping = true
    initialization = initialize()
    return initialization
  }

  onScopeDispose(() => {
    disposed = true
    generation++
    unsubscribe?.()
  })

  async function runAction(action: (client: SupabaseClient, version: number) => Promise<void>): Promise<boolean> {
    if (busy.value)
      return false
    await init()
    if (busy.value || disposed)
      return false
    const version = generation
    busy.value = true
    error.value = null
    try {
      if (!supabase || !user.value)
        throw new Error(configurationError ?? '连接尚未就绪，请重试。')
      await action(supabase, version)
      return version === generation && !disposed
    }
    catch (cause) {
      if (version === generation && !disposed)
        error.value = errorMessage(cause)
      return false
    }
    finally {
      if (version === generation && !disposed)
        busy.value = false
    }
  }

  function roll(): Promise<boolean> {
    return runAction(async (client, version) => {
      const { data, error: rollError } = await client.rpc('reserve_character', { p_replace: true })
      if (rollError)
        throw rollError
      if (version === generation && !disposed)
        candidate.value = data as CharacterCandidate
    })
  }

  function enter(name: string): Promise<boolean> {
    return runAction(async (client, version) => {
      const trimmed = name.trim()
      if (!trimmed)
        throw new Error('请输入名号。')
      const current = candidate.value
      const result = current && trimmed === current.name
        ? await client.rpc('claim_character', { p_character_id: current.id })
        : await client.rpc('restore_character', { p_name: trimmed })
      if (result.error)
        throw result.error
      if (version === generation && !disposed) {
        identity.value = result.data as CharacterIdentity
        candidate.value = null
      }
    })
  }

  function leave(): Promise<boolean> {
    const current = identity.value
    if (!current)
      return Promise.resolve(false)
    return runAction(async (client, version) => {
      const result = await client.rpc('leave_character', { p_character_id: current.id })
      if (result.error)
        throw result.error
      if (version !== generation || disposed)
        return
      identity.value = null
      candidate.value = null
      const reserved = await client.rpc('reserve_character', { p_replace: false })
      if (reserved.error)
        throw reserved.error
      if (version === generation && !disposed)
        candidate.value = reserved.data as CharacterCandidate
    })
  }

  function retire(): Promise<boolean> {
    const current = identity.value
    if (!current)
      return Promise.resolve(false)
    return runAction(async (client, version) => {
      const result = await client.rpc('retire_character', { p_character_id: current.id })
      if (result.error)
        throw result.error
      if (version !== generation || disposed)
        return
      identity.value = null
      candidate.value = null
      const reserved = await client.rpc('reserve_character', { p_replace: false })
      if (reserved.error)
        throw reserved.error
      if (version === generation && !disposed)
        candidate.value = reserved.data as CharacterCandidate
    })
  }

  return { user, identity, candidate, ready, busy, error, init, roll, enter, leave, retire }
})
