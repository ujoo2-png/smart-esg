const SUPABASE_CONFIG = {
  url: 'https://your-project.supabase.co',
  anonKey: 'your-anon-key',
  jwtKey: '',
}

let supabaseClient = null

function _isPlaceholder() {
  return !SUPABASE_CONFIG.url || SUPABASE_CONFIG.url.includes('your-project') ||
         !SUPABASE_CONFIG.anonKey || SUPABASE_CONFIG.anonKey === 'your-anon-key'
}

function initSupabase() {
  if (_isPlaceholder()) {
    console.warn('Supabase: placeholder credentials — skipping client creation')
    return null
  }
  if (typeof supabase === 'undefined') {
    console.warn('Supabase: @supabase/supabase-js CDN이 로드되지 않았습니다.')
    return null
  }
  supabaseClient = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
  return supabaseClient
}

function getSupabase() {
  if (supabaseClient) return supabaseClient
  return initSupabase()
}
