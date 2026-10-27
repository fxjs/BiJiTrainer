const url = process.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, '')
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
if (!url || !key)
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before deployment.')

let privilegedKey = key.startsWith('sb_secret_')
if (!privilegedKey && key.split('.').length === 3) {
  try {
    privilegedKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'service_role'
  }
  catch {
    // The API checks below reject invalid credentials without printing their value.
  }
}
if (privilegedKey)
  throw new Error('A Secret Key or service-role key must never be used in a browser deployment.')

const [authResponse, identityResponse] = await Promise.all([
  fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) }),
  fetch(`${url}/rest/v1/rpc/current_character`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(15000),
  }),
])
const auth = await authResponse.json()
const identity = await identityResponse.json()
const failures = []
if (!authResponse.ok)
  failures.push(`Supabase Auth is unavailable (HTTP ${authResponse.status}).`)
else if (auth.external?.anonymous_users !== true)
  failures.push('Enable Anonymous Sign-ins in Supabase Authentication → Sign In / Providers.')
if (![401, 403].includes(identityResponse.status) || identity?.code !== '42501') {
  if (identity?.code === 'PGRST202')
    failures.push('Run supabase/migrations/20261027000000_account_training_data.sql in the project SQL Editor.')
  else
    failures.push(`The character API is missing or permits unauthenticated access (HTTP ${identityResponse.status}, ${identity?.code ?? 'unexpected response'}).`)
}
if (failures.length)
  throw new Error(`Supabase is not ready for deployment:\n${failures.join('\n')}`)
console.log('Supabase ready: anonymous sign-in enabled; character API requires an authenticated session.')
