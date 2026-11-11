// 스토리지 키 검증 — Edge Function과 Node 테스트에서 공용으로 사용한다.
// 클라이언트가 임의의 경로를 넘겨 버킷 전체를 덮어쓰거나 삭제하지 못하도록
// 실제 앱이 생성하는 경로 형태만 허용한다.

export const MAX_KEY_LENGTH = 512
export const MAX_SEGMENT_LENGTH = 180

// 실제 업로드 경로: `${companyId}/${year}/${docId}/${safeFileName}`
// 첫 세그먼트(회사ID)는 서버가 알 수 없는 값이라 화이트리스트하지 않는다.
// 구조(연도 4자리, 파일명 문자셋)만 강제하고, 회사 단위 격리는 DB/RLS가 담당한다.
export const APP_PATH_PATTERN = /^[A-Za-z0-9_-]{1,64}\/\d{4}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/
export const HEALTHCHECK_PATTERN = /^_healthcheck\/[A-Za-z0-9._-]{1,80}$/
// 향후 도입될 수 있는 논리 프리픽스
export const PREFIXED_PATTERNS = [
  /^references\/[A-Za-z0-9_-]{1,64}\/\d{4}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/,
  /^evidence\/[A-Za-z0-9_-]{1,64}\/\d{4}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/,
  /^report\/[A-Za-z0-9_-]{1,64}\/\d{4}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/,
  /^uploads\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/
]

export const ALLOWED_PATTERNS = [APP_PATH_PATTERN, HEALTHCHECK_PATTERN, ...PREFIXED_PATTERNS]

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

export function validateKey(key) {
  if (typeof key !== 'string') return { ok: false, error: 'path는 문자열이어야 합니다.' }
  if (!key.length) return { ok: false, error: 'path가 비어 있습니다.' }
  if (key.length > MAX_KEY_LENGTH) return { ok: false, error: `path가 너무 깁니다 (최대 ${MAX_KEY_LENGTH}자).` }
  if (CONTROL_CHARS.test(key)) return { ok: false, error: 'path에 제어 문자가 포함되어 있습니다.' }
  if (key.includes('\\')) return { ok: false, error: 'path에 역슬래시를 사용할 수 없습니다.' }
  if (key.includes('%')) return { ok: false, error: 'path에 인코딩된 문자(%)를 사용할 수 없습니다.' }
  if (key.startsWith('/')) return { ok: false, error: 'path는 절대 경로일 수 없습니다.' }
  if (key.endsWith('/')) return { ok: false, error: 'path는 파일 경로여야 합니다.' }
  if (key.includes('//')) return { ok: false, error: 'path에 빈 구간이 있습니다.' }

  const segments = key.split('/')
  for (const seg of segments) {
    if (seg === '.' || seg === '..') return { ok: false, error: 'path에 상위 이동 구간(..)을 사용할 수 없습니다.' }
    if (!seg.length) return { ok: false, error: 'path에 빈 구간이 있습니다.' }
    if (seg.length > MAX_SEGMENT_LENGTH) return { ok: false, error: 'path 구간이 너무 깁니다.' }
  }

  if (!ALLOWED_PATTERNS.some(re => re.test(key))) {
    return { ok: false, error: '허용되지 않은 저장 경로입니다.' }
  }
  return { ok: true }
}

export function assertKey(key) {
  const r = validateKey(key)
  if (!r.ok) {
    const err = new Error(r.error)
    err.status = 400
    err.code = 'invalid_path'
    throw err
  }
  return key
}

export function decodeJwtPayload(token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const json = typeof atob === 'function'
      ? decodeURIComponent(Array.from(atob(padded)).map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
      : Buffer.from(padded, 'base64').toString('utf8')
    const payload = JSON.parse(json)
    return payload && typeof payload === 'object' ? payload : null
  } catch {
    return null
  }
}

// 게이트웨이의 verify_jwt=true는 서명만 확인한다. anon 키도 유효한 JWT라서
// 그대로 통과하므로, 쓰기 작업은 role이 anon이 아닌 실제 로그인 사용자로 제한한다.
export function authorizeRequest(req, { env = (k) => null, allowAnon = false } = {}) {
  if (allowAnon || env('STORAGE_ALLOW_ANON') === 'true') return { ok: true, role: 'anon' }
  const header = req?.headers?.get?.('authorization') || req?.headers?.get?.('Authorization') || ''
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim())
  if (!m) return { ok: false, status: 401, error: '로그인이 필요합니다.' }
  const payload = decodeJwtPayload(m[1])
  if (!payload) return { ok: false, status: 401, error: '토큰을 해석할 수 없습니다.' }
  if (payload.exp && Date.now() / 1000 > Number(payload.exp)) return { ok: false, status: 401, error: '토큰이 만료되었습니다.' }
  const role = payload.role || 'anon'
  if (role === 'anon') {
    return { ok: false, status: 403, error: '승인된 사용자만 저장소에 접근할 수 있습니다.' }
  }
  return { ok: true, role, sub: payload.sub || null, email: payload.email || null }
}
