import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

function validateConfiguration(): string | null {
  if (!url || !publishableKey)
    return '尚未配置云端账号服务：请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY，然后重新构建。'

  try {
    const parsed = new URL(url)
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash)
      return 'VITE_SUPABASE_URL 格式不正确，请填写 Supabase 项目的 HTTP(S) 地址。'
  }
  catch {
    return 'VITE_SUPABASE_URL 格式不正确，请填写 Supabase 项目的完整 HTTP(S) 地址。'
  }

  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey))
    return null

  // 兼容本地 Supabase 的 anon JWT；拒绝 secret / service_role 凭据进入客户端。
  try {
    const parts = publishableKey.split('.')
    if (parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) {
      const encoded = parts[1]!.replace(/-/g, '+').replace(/_/g, '/')
      const payload: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')))
      if (payload && typeof payload === 'object' && 'role' in payload && payload.role === 'anon')
        return null
    }
  }
  catch {
    // 格式错误统一呈现为配置问题，而不是让应用在启动时崩溃。
  }
  return 'VITE_SUPABASE_PUBLISHABLE_KEY 格式不正确：仅可使用公开的 sb_publishable_ 密钥或 anon JWT，禁止使用 secret / service_role 密钥。'
}

let client: SupabaseClient | null = null
let configError = validateConfiguration()
if (!configError) {
  try {
    client = createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  catch {
    configError = '无法初始化云端账号服务，请检查 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY 配置。'
  }
}

export const supabase: SupabaseClient | null = client
export const supabaseConfigured = client !== null
export const configurationError: string | null = configError
