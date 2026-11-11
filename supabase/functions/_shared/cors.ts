const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

// ALLOWED_ORIGINS(쉼표 구분)가 설정되면 해당 출처만 허용한다.
// 미설정 시 기존 동작(*)을 유지하되, 운영 배포에서는 반드시 설정할 것을 권장한다.
function resolveOrigin(req?: Request): string {
  const raw = Deno.env.get('ALLOWED_ORIGINS') || ''
  const origin = req?.headers?.get('origin') || ''
  if (!raw.trim()) return '*'
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (origin && allowed.includes(origin)) return origin
  return allowed[0] || 'null'
}

export function corsHeadersFor(req?: Request): Record<string, string> {
  return { 'Access-Control-Allow-Origin': resolveOrigin(req), ...BASE_HEADERS, Vary: 'Origin' }
}

// 하위 호환용 (정적 헤더)
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  ...BASE_HEADERS
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeadersFor(req), 'Content-Type': 'application/json' }
  })
}

export function preflight(req: Request): Response {
  return new Response('ok', { headers: corsHeadersFor(req) })
}
