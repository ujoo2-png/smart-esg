import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { removeObject } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { path } = await req.json()
    if (!path) throw new Error('path가 필요합니다.')
    await removeObject(path)
    return jsonResponse({ ok: true })
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
