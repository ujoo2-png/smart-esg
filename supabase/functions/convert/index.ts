import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { jsonResponse, preflight } from '../_shared/cors.ts'
import { assertKey, authorizeRequest } from '../_shared/keyguard.js'
import { downloadBytes, backend, bucketName } from '../_shared/storage.ts'
import { convertDocument } from '../_shared/convert.ts'

const MAX_BYTES = 25 * 1024 * 1024

serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req)

  if (req.method === 'GET') {
    return jsonResponse({ ok: true, service: 'convert', engine: 'unpdf/mammoth/xlsx/fflate', backend: backend(), bucket: bucketName() }, 200, req)
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: '허용되지 않은 메서드입니다.', code: 'method_not_allowed' }, 405, req)
  }

  const auth = authorizeRequest(req, { env: (k) => Deno.env.get(k) })
  if (!auth.ok) return jsonResponse({ error: auth.error, code: 'unauthorized' }, auth.status, req)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: '요청 본문(JSON)이 올바르지 않습니다.', code: 'bad_body' }, 400, req)
    }
    const { path, mime, docType } = body as { path?: string; mime?: string; docType?: string }
    assertKey(path)

    let bytes: Uint8Array
    try {
      bytes = await downloadBytes(path)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ error: '파일을 불러오지 못했습니다: ' + msg, code: 'download_failed' }, 404, req)
    }
    if (bytes.byteLength === 0) {
      return jsonResponse({ error: '빈 파일입니다.', code: 'empty_file' }, 400, req)
    }
    if (bytes.byteLength > MAX_BYTES) {
      return jsonResponse({ error: '파일이 너무 큽니다 (25MB 초과).', code: 'too_large' }, 413, req)
    }

    const base = path.split('/').pop() || 'document'
    const name = base.includes('.') ? base : `${base}.${docType || ''}`
    const result = await convertDocument(bytes, name, mime || '')
    return jsonResponse(result, 200, req)
  } catch (e) {
    const status = (e as { status?: number })?.status || 500
    const code = (e as { code?: string })?.code || 'convert_failed'
    return jsonResponse({ error: e instanceof Error ? e.message : String(e), code }, status, req)
  }
})
