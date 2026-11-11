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

test('원격 사용자 병합: 로컬에 없는 계정은 추가', () => {
  const { Store } = createEnv()
  const changed = Store._mergeRemoteUsers([{ id: '999', username: 'remote1', password: 'hash', role: 'user', status: 'active' }])
  assert.equal(changed, 1)
  assert.ok(Store.getUsers().some(u => u.username === 'remote1'))
})

test('원격 사용자 병합: 로컬 해시가 낡았으면 원격 해시로 교체', () => {
  const { Store } = createEnv()
  Store.addUser({ id: '1', username: 'admin', password: 'a'.repeat(64), name: '관리자', role: 'admin', status: 'active' })
  const changed = Store._mergeRemoteUsers([{ id: '1', username: 'admin', password: 'remote-hash', name: '관리자', role: 'admin', status: 'active' }])
  assert.equal(changed, 1)
  assert.equal(Store.getUsers().find(u => String(u.id) === '1').password, 'remote-hash')
})

test('원격 사용자 병합: 원격 updated_at이 더 최신이면 원격 우선', () => {
  const { Store } = createEnv()
  Store.addUser({ id: '2', username: 'u2', password: 'local-hash', name: '로컬', role: 'user', status: 'active', updated_at: '2026-01-01T00:00:00.000Z' })
  Store._mergeRemoteUsers([{ id: '2', username: 'u2', password: 'remote-hash', name: '원격', role: 'user', status: 'active', updated_at: '2026-02-01T00:00:00.000Z' }])
  const u = Store.getUsers().find(x => String(x.id) === '2')
  assert.equal(u.password, 'remote-hash')
  assert.equal(u.name, '원격')
})

test('원격 사용자 병합: 로컬 updated_at이 더 최신이면 로컬 보존', () => {
  const { Store } = createEnv()
  Store.addUser({ id: '3', username: 'u3', password: 'local-hash', name: '로컬', role: 'user', status: 'active', updated_at: '2026-03-01T00:00:00.000Z' })
  const changed = Store._mergeRemoteUsers([{ id: '3', username: 'u3', password: 'remote-hash', name: '원격', role: 'user', status: 'active', updated_at: '2026-02-01T00:00:00.000Z' }])
  const u = Store.getUsers().find(x => String(x.id) === '3')
  assert.equal(changed, 0)
  assert.equal(u.password, 'local-hash')
  assert.equal(u.name, '로컬')
})

test('원격 사용자 병합: 원격 비밀번호가 비어 있으면 로컬 해시 유지', () => {
  const { Store } = createEnv()
  Store.addUser({ id: '4', username: 'u4', password: 'local-hash', name: '로컬', role: 'user', status: 'active' })
  Store._mergeRemoteUsers([{ id: '4', username: 'u4', password: '', name: '원격', role: 'user', status: 'active' }])
  const u = Store.getUsers().find(x => String(x.id) === '4')
  assert.equal(u.password, 'local-hash')
  assert.equal(u.name, '원격')
})

test('로그인: 로컬 해시가 낡아도 원격 재조회 후 로그인 성공', async () => {
  const { Store, evaluate } = createEnv()
  const realHash = await Store.hashPassword('admin1234')
  Store.addUser({ id: '1', username: 'admin', password: 'a'.repeat(64), name: '관리자', role: 'admin', status: 'active' })
  Store.pullFromSupabase = async () => {
    Store._mergeRemoteUsers([{ id: '1', username: 'admin', password: realHash, name: '관리자', role: 'admin', status: 'active' }])
    return { ok: true, added: { users: 1 } }
  }
  const r = await evaluate('login')('admin', 'admin1234')
  assert.equal(r.ok, true)
  assert.equal(r.user.username, 'admin')
  assert.match(Store.getUsers().find(u => u.username === 'admin').password, /^pbkdf2_sha256\$/)
})
