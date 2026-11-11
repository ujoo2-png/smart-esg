import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { jsonResponse, preflight } from '../_shared/cors.ts'
import { assertKey, authorizeRequest } from '../_shared/keyguard.js'
import { removeObject } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return jsonResponse({ error: '허용되지 않은 메서드입니다.' }, 405, req)

  // 삭제는 되돌릴 수 없으므로 anon 예외 설정과 무관하게 로그인 사용자만 허용한다.
  const auth = authorizeRequest(req, { env: (k) => Deno.env.get(k) })
  if (!auth.ok) return jsonResponse({ error: auth.error, code: 'unauthorized' }, auth.status, req)

  try {
    const { path } = await req.json()
    assertKey(path)
    if (String(path).startsWith('_healthcheck/')) {
      return jsonResponse({ error: '시스템 경로는 삭제할 수 없습니다.' }, 400, req)
    }
    await removeObject(path)
    return jsonResponse({ ok: true }, 200, req)
  } catch (e) {
    const status = (e as { status?: number })?.status || 400
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, status, req)
  }
})
