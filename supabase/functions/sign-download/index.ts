import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { signDownload } from '../_shared/storage.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { path, expires } = await req.json()
    if (!path) throw new Error('path가 필요합니다.')
    const url = await signDownload(path, expires || 3600)
    return jsonResponse({ url })
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : String(e) }, 400)
  }
})
