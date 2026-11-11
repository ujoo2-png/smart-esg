import test from 'node:test'
import assert from 'node:assert/strict'
import { createEnv } from './helpers/env.mjs'

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str)
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

test('비밀번호: PBKDF2 해시 형식과 검증', async () => {
  const { Store } = createEnv()
  const hash = await Store.hashPassword('correct horse battery')
  assert.match(hash, /^pbkdf2_sha256\$210000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
  assert.ok(hash.length > 60)

  const ok = await Store.verifyPassword('correct horse battery', hash)
  assert.equal(ok.ok, true)
  assert.equal(ok.needsUpgrade, false)

  const bad = await Store.verifyPassword('wrong password', hash)
  assert.equal(bad.ok, false)
})

test('비밀번호: 같은 평문도 매번 다른 해시(솔트)', async () => {
  const { Store } = createEnv()
  const a = await Store.hashPassword('same-password')
  const b = await Store.hashPassword('same-password')
  assert.notEqual(a, b)
})

test('비밀번호: 기존 무염 SHA-256 해시는 검증 후 업그레이드 대상', async () => {
  const { Store } = createEnv()
  const legacy = await sha256Hex('legacy-pass-1234')
  const r = await Store.verifyPassword('legacy-pass-1234', legacy)
  assert.equal(r.ok, true)
  assert.equal(r.needsUpgrade, true)
  assert.equal(Store.needsPasswordUpgrade(legacy), true)
})

test('로그인: 승인 대기(pending) 계정은 거부', async () => {
  const { Store, evaluate } = createEnv()
  Store.addUser({ username: 'pending1', password: await Store.hashPassword('password123'), name: '대기자', role: 'user', status: 'pending' })
  const r = await evaluate('login')('pending1', 'password123')
  assert.equal(r.ok, undefined)
  assert.match(r.error, /승인 대기/)
})

test('로그인: 비활성(inactive) 계정은 거부', async () => {
  const { Store, evaluate } = createEnv()
  Store.addUser({ username: 'inactive1', password: await Store.hashPassword('password123'), name: '비활성', role: 'user', status: 'inactive' })
  const r = await evaluate('login')('inactive1', 'password123')
  assert.equal(r.ok, undefined)
  assert.match(r.error, /비활성/)
})

test('로그인: 활성 계정은 성공하고 세션 생성', async () => {
  const { Store, evaluate } = createEnv()
  Store.addUser({ username: 'active1', password: await Store.hashPassword('password123'), name: '활성', role: 'user', status: 'active' })
  const r = await evaluate('login')('active1', 'password123')
  assert.equal(r.ok, true)
  assert.equal(r.user.username, 'active1')
  const sess = evaluate('getSession()')
  assert.equal(sess.username, 'active1')
})

test('로그인: 기존 SHA-256 사용자는 로그인 시 자동 업그레이드', async () => {
  const { Store, evaluate } = createEnv()
  Store.addUser({ username: 'legacy1', password: await sha256Hex('legacy-pass-1234'), name: '레거시', role: 'user', status: 'active' })
  const r = await evaluate('login')('legacy1', 'legacy-pass-1234')
  assert.equal(r.ok, true)
  const stored = Store.getUsers().find(u => u.username === 'legacy1').password
  assert.match(stored, /^pbkdf2_sha256\$/)
})

test('로그인: 5회 실패 후 잠금', async () => {
  const { Store, evaluate } = createEnv()
  const login = evaluate('login')
  Store.addUser({ username: 'brute1', password: await Store.hashPassword('password123'), name: '브루트', role: 'user', status: 'active' })
  for (let i = 0; i < 5; i++) {
    const r = await login('brute1', 'wrong-password')
    assert.equal(r.ok, undefined)
  }
  const blocked = await login('brute1', 'password123')
  assert.equal(blocked.ok, undefined)
  assert.match(blocked.error, /시도가 너무 많습니다/)
})

test('checkAuth: 세션이 있어도 비활성 계정이면 세션 무효화', async () => {
  const { Store, evaluate } = createEnv()
  const u = Store.addUser({ username: 'revoked1', password: await Store.hashPassword('password123'), name: '회수', role: 'user', status: 'active' })
  await evaluate('login')('revoked1', 'password123')
  Store.updateUser(u.id, { status: 'inactive' })
  const user = await evaluate('checkAuth()')
  assert.equal(user, null)
  assert.equal(evaluate('getSession()'), null)
})

test('회원가입: role을 admin으로 보내도 user/pending으로 강제', async () => {
  const { Store, evaluate } = createEnv()
  const r = await evaluate('register')({ username: 'sneaky1', password: 'password123', name: '몰래', email: 'sneaky@example.com', role: 'admin' })
  assert.equal(r.ok, true)
  const u = Store.getUsers().find(x => x.username === 'sneaky1')
  assert.equal(u.role, 'user')
  assert.equal(u.status, 'pending')
})

test('회원가입: 8자 미만 비밀번호 거부', async () => {
  const { evaluate } = createEnv()
  const r = await evaluate('register')({ username: 'shortpw', password: '1234567', name: '짧음', email: 'short@example.com' })
  assert.match(r.error, /8자 이상/)
})

test('부트스트랩: 기본 관리자 계정이 자동 생성되지 않음', () => {
  const { Store } = createEnv()
  assert.equal(Store.needsBootstrap(), true)
  assert.equal(Store.getUsers().some(u => u.username === 'admin'), false)
})

test('부트스트랩: 최초 관리자 생성 후 재실행 차단', async () => {
  const { Store } = createEnv()
  const first = await Store.createFirstAdmin({ username: 'root1', password: 'password123', name: '최초관리자', email: 'root@example.com' })
  assert.equal(first.ok, true)
  assert.equal(Store.needsBootstrap(), false)
  assert.equal(Store.countActiveAdmins(), 1)

  const second = await Store.createFirstAdmin({ username: 'root2', password: 'password123', name: '두번째', email: 'root2@example.com' })
  assert.match(second.error, /이미 관리자/)
})

test('부트스트랩: 생성한 관리자는 즉시 로그인 가능', async () => {
  const { Store, evaluate } = createEnv()
  await Store.createFirstAdmin({ username: 'root1', password: 'password123', name: '최초관리자', email: 'root@example.com' })
  const r = await evaluate('login')('root1', 'password123')
  assert.equal(r.ok, true)
  assert.equal(r.user.role, 'admin')
})
