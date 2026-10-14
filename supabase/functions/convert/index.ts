import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { downloadBytes } from '../_shared/storage.ts'
import { convertDocument } from '../_shared/convert.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { path, mime, docType } = await req.json()
    if (!path) throw new Error('path가 필요합니다.')
    const bytes = await downloadBytes(path)
    const base = path.split('/').pop() || 'document'
    const name = base.includes('.') ? base : `${base}.${docType || ''}`
    const result = await convertDocument(bytes, name, mime || '')
    return jsonResponse(result)
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
