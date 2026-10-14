const SUPABASE_CONFIG = {
  url: 'https://pyesmylwuzaftieqzokn.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5ZXNteWx3dXphZnRpZXF6b2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5Mzk4MzUsImV4cCI6MjEwNzUxNTgzNX0.PUbzZTvmtfkcq5GB6SYjYhIFkqV94rQj6HiLObLUWUQ',
  jwtKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5ZXNteWx3dXphZnRpZXF6b2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5Mzk4MzUsImV4cCI6MjEwNzUxNTgzNX0.PUbzZTvmtfkcq5GB6SYjYhIFkqV94rQj6HiLObLUWUQ',
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
