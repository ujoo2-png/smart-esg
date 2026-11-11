import test from 'node:test'
import assert from 'node:assert/strict'
import { validateKey, authorizeRequest, decodeJwtPayload } from '../supabase/functions/_shared/keyguard.js'

const VALID = [
  '1/2024/1730000000000/report.pdf',
  'default/2025/abc_DEF-1/파일.pdf'.replace('파일', 'file'),
  '_healthcheck/1730000000000.txt',
  'references/1/2024/99/a.docx',
  'evidence/12/2025/document/xlsx_1.xlsx',
  'uploads/7/1730000000000.pptx'
]

const INVALID = [
  '',
  null,
  undefined,
  123,
  '/etc/passwd',
  '../secret.txt',
  '1/2024/../../etc/passwd',
  '1/2024/99/..',
  '1\\2024\\99\\a.pdf',
  '1//99/a.pdf',
  '1/2024/99/a.pdf/',
  '1/2024/99/%2e%2e/a.pdf',
  '1/2024/99/a b.pdf',
  '1/24/99/a.pdf',
  '_healthcheck/../x',
  'a'.repeat(200) + '/2024/99/a.pdf',
  '1/2024/99/a.pdf\u0000'
]

test('keyguard: 앱이 생성하는 경로는 허용', () => {
  for (const key of VALID) {
    const r = validateKey(key)
    assert.equal(r.ok, true, `허용되어야 함: ${key} (${r.error})`)
  }
})

test('keyguard: 경로 탈출/형식 위반은 거부', () => {
  for (const key of INVALID) {
    const r = validateKey(key)
    assert.equal(r.ok, false, `거부되어야 함: ${String(key)}`)
  }
})

test('keyguard: URL 인코딩된 상위 이동 차단', () => {
  assert.equal(validateKey('1/2024/99/%2e%2e%2fx').ok, false)
  assert.equal(validateKey('1/2024/99/a%2fb.pdf').ok, false)
})

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fakeReq(payload) {
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.sig`
  return { headers: { get: (k) => (String(k).toLowerCase() === 'authorization' ? `Bearer ${token}` : null) } }
}

test('keyguard: anon 토큰은 거부', () => {
  const req = fakeReq({ role: 'anon', exp: Math.floor(Date.now() / 1000) + 600 })
  const r = authorizeRequest(req)
  assert.equal(r.ok, false)
  assert.equal(r.status, 403)
})

test('keyguard: 인증 사용자 토큰은 허용', () => {
  const req = fakeReq({ role: 'authenticated', sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 600 })
  const r = authorizeRequest(req)
  assert.equal(r.ok, true)
  assert.equal(r.role, 'authenticated')
})

test('keyguard: 토큰 없음/만료 토큰은 401', () => {
  assert.equal(authorizeRequest({ headers: { get: () => null } }).status, 401)
  const expired = fakeReq({ role: 'authenticated', exp: Math.floor(Date.now() / 1000) - 10 })
  assert.equal(authorizeRequest(expired).status, 401)
})

test('keyguard: STORAGE_ALLOW_ANON=true 이면 anon 허용', () => {
  const req = fakeReq({ role: 'anon', exp: Math.floor(Date.now() / 1000) + 600 })
  const r = authorizeRequest(req, { env: () => 'true' })
  assert.equal(r.ok, true)
})

test('keyguard: JWT payload 디코딩', () => {
  const payload = decodeJwtPayload(`${b64url({ alg: 'HS256' })}.${b64url({ role: 'authenticated', sub: 'abc' })}.sig`)
  assert.equal(payload.sub, 'abc')
  assert.equal(decodeJwtPayload('not-a-jwt'), null)
})
