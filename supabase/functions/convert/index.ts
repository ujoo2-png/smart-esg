import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { downloadBytes, backend, bucketName } from '../_shared/storage.ts'
import { convertDocument } from '../_shared/convert.ts'

const MAX_BYTES = 25 * 1024 * 1024

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method === 'GET') {
    return jsonResponse({ ok: true, service: 'convert', engine: 'unpdf/mammoth/xlsx/fflate', backend: backend(), bucket: bucketName() })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: '허용되지 않은 메서드입니다.', code: 'method_not_allowed' }, 405)
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return jsonResponse({ error: '요청 본문(JSON)이 올바르지 않습니다.', code: 'bad_body' }, 400)
    }
    const { path, mime, docType } = body as { path?: string; mime?: string; docType?: string }
    if (!path || typeof path !== 'string') {
      return jsonResponse({ error: 'path가 필요합니다.', code: 'missing_path' }, 400)
    }
    if (path.includes('..')) {
      return jsonResponse({ error: '잘못된 경로입니다.', code: 'bad_path' }, 400)
    }

    let bytes: Uint8Array
    try {
      bytes = await downloadBytes(path)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return jsonResponse({ error: '파일을 불러오지 못했습니다: ' + msg, code: 'download_failed' }, 404)
    }
    if (bytes.byteLength === 0) {
      return jsonResponse({ error: '빈 파일입니다.', code: 'empty_file' }, 400)
    }
    if (bytes.byteLength > MAX_BYTES) {
      return jsonResponse({ error: '파일이 너무 큽니다 (25MB 초과).', code: 'too_large' }, 413)
    }

    const base = path.split('/').pop() || 'document'
    const name = base.includes('.') ? base : `${base}.${docType || ''}`
    const result = await convertDocument(bytes, name, mime || '')
    return jsonResponse(result)
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e), code: 'convert_failed' }, 500)
  }
})
