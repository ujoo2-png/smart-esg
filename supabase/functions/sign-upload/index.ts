import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { jsonResponse, preflight } from '../_shared/cors.ts'
import { assertKey, authorizeRequest } from '../_shared/keyguard.js'
import { signUpload, bucketName } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)
  if (req.method !== 'POST') return jsonResponse({ error: '허용되지 않은 메서드입니다.' }, 405, req)

  const auth = authorizeRequest(req, { env: (k) => Deno.env.get(k) })
  if (!auth.ok) return jsonResponse({ error: auth.error, code: 'unauthorized' }, auth.status, req)

  try {
    const { path } = await req.json()
    assertKey(path)
    const result = await signUpload(path)
    return jsonResponse({ ...result, bucket: bucketName() }, 200, req)
  } catch (e) {
    const status = (e as { status?: number })?.status || 400
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, status, req)
  }
})
