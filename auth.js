/* Auth system — localStorage + Supabase Auth */
function esc(s) { return String(s).replace(/[<>&"']/g, function(m) { return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[m] }) }

let currentUser = null
let authListeners = []
let _sbAuth = null

function getSbAuth() {
  if (_sbAuth) return _sbAuth
  const sb = getSupabase()
  if (!sb) return null
  _sbAuth = sb.auth
  return _sbAuth
}

async function hashPw(pw) {
  return await Store.hashPassword(pw)
}

async function ensureAdmin() {
  await Store.ensureAdmin()
}

function onAuthChange(fn) { authListeners.push(fn) }

function getSession() {
  const raw = sessionStorage.getItem('smart_esg_session')
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

function setSession(user, sbSession) {
  if (user) {
    sessionStorage.setItem('smart_esg_session', JSON.stringify({ id: user.id, username: user.username, name: user.name, role: user.role }))
    if (sbSession?.refresh_token) sessionStorage.setItem('smart_esg_sb_refresh', sbSession.refresh_token)
  } else {
    sessionStorage.removeItem('smart_esg_session')
    sessionStorage.removeItem('smart_esg_sb_refresh')
  }
  currentUser = user
  authListeners.forEach(fn => fn(user))
}

async function checkAuth() {
  const sbAuth = getSbAuth()
  if (sbAuth) {
    try {
      const { data: { session } } = await sbAuth.getSession()
      if (!session) {
        const refresh = sessionStorage.getItem('smart_esg_sb_refresh')
        if (refresh) {
          const { error } = await sbAuth.setSession({ refresh_token: refresh })
          if (error) sessionStorage.removeItem('smart_esg_sb_refresh')
        }
      }
    } catch (e) { /* ignore */ }
  }
  const s = getSession()
  if (!s) return null
  const user = Store.getUsers().find(u => u.id === s.id)
  currentUser = user
  return user
}



async function register(data) {
  const users = Store.getUsers()
  const localDup = users.find(u => u.username === data.username)
  if (localDup) {
    try {
      const sb = getSupabase()
      if (sb) {
        const { data: dup } = await sb.from('tb_user').select('id').eq('username', data.username)
        if (dup && dup.length > 0) return { error: '이미 사용 중인 아이디입니다.' }
      } else return { error: '이미 사용 중인 아이디입니다.' }
    } catch (e) { return { error: '이미 사용 중인 아이디입니다.' } }
  }
  if (data.email && users.find(u => u.email === data.email)) return { error: '이미 사용 중인 이메일입니다.' }
  let authId = null
  const sbAuth = getSbAuth()
  if (sbAuth && data.email) {
    try {
      const { data: authData } = await sbAuth.signUp({ email: data.email, password: data.password })
      if (authData?.user) authId = authData.user.id
    } catch (e) { console.warn('Supabase Auth register:', e.message) }
  }
  Store.addUser({
    username: data.username,
    password: await hashPw(data.password),
    name: data.name,
    email: data.email,
    phone: data.phone,
    company_id: data.company_id || null,
    dept_code: data.dept_code || '',
    position: data.position || '',
    role: data.role || 'user',
    status: 'pending',
  })
  Store.addAuditLog({ category: '사용자등록', action: '신규 등록', user_id: null, user_name: data.name, detail: `아이디: ${data.username}, 이름: ${data.name}, 부서: ${data.dept_code || '미지정'}` })
  return { ok: true }
}

function checkUsername(username) {
  return !Store.getUsers().find(u => u.username === username)
}

async function login(username, password) {
  const user = Store.getUsers().find(u => u.username === username)
  if (!user) { Store.addAuditLog({ category: '로그인', action: '로그인 실패', user_id: null, user_name: '', detail: `아이디: ${username} (사용자 없음)` }); return { error: '아이디 또는 비밀번호가 일치하지 않습니다.' } }
  const pwHash = await Store.hashPassword(password)
  const pwMatch = user.password === pwHash
  if (!pwMatch) { Store.addAuditLog({ category: '로그인', action: '로그인 실패', user_id: user.id, user_name: user.name, detail: `아이디: ${username} (비밀번호 불일치)` }); return { error: '아이디 또는 비밀번호가 일치하지 않습니다.' } }
  if (user.status !== 'active') { Store.addAuditLog({ category: '로그인', action: '로그인 실패', user_id: user.id, user_name: user.name, detail: `아이디: ${username} (승인 대기)` }); return { error: '관리자 승인 대기 중입니다. 관리자에게 문의하세요.' } }

  let sbSession = null
  const sbAuth = getSbAuth()
  if (sbAuth && user.email) {
    try {
      const { data } = await sbAuth.signInWithPassword({ email: user.email, password })
      sbSession = data?.session
    } catch (e) { console.warn('Supabase Auth login:', e.message) }
  }

  setSession(user, sbSession)
  Store.addAuditLog({ category: '로그인', action: '로그인 성공', user_id: user.id, user_name: user.name, detail: `아이디: ${username}` })
  return { ok: true, user }
}

async function logout() {
  const s = getSession()
  if (s) Store.addAuditLog({ category: '로그아웃', action: '로그아웃', user_id: s.id, user_name: s.name, detail: '' })
  const sbAuth = getSbAuth()
  if (sbAuth) { try { await sbAuth.signOut() } catch (e) { /* ignore */ } }
  setSession(null)
}

function findId(email) {
  const user = Store.getUsers().find(u => u.email === email)
  if (!user) return { error: '등록된 이메일이 없습니다.' }
  return { ok: true, username: user.username, createdAt: user.createdAt }
}

function findPassword(name, email) {
  const user = Store.getUsers().find(u => u.name === name && u.email === email)
  if (!user) return { error: '등록된 이름과 이메일이 일치하는 계정이 없습니다.' }
  return { ok: true }
}

function isAdmin() { return currentUser && currentUser.role === 'admin' }
function isManager() { return currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager') }

const _rolePages = {
  dashboard: 'viewer', assessment: 'user', indicator: 'viewer',
  evidence: 'viewer', ghg: 'user', supplier: 'manager',
  ai: 'manager', editor: 'manager', gri: 'viewer',
  references: 'user', writer: 'user',
  risk: 'manager', monitor: 'viewer', issa: 'manager',
  submit: 'manager', kssb: 'manager', aihistory: 'viewer',
  budget: 'manager', masking: 'admin', api: 'admin', settings: 'admin'
}
const _roleOrder = { viewer: 0, user: 1, manager: 2, admin: 3 }
function canAccess(page) {
  if (!currentUser) return false
  const need = _rolePages[page] || 'admin'
  return _roleOrder[currentUser.role] >= _roleOrder[need]
}
function canWrite() { return currentUser && currentUser.role !== 'viewer' }
function roleLabel(r) { return { admin: '관리자', manager: '매니저', user: '사용자', viewer: '뷰어' }[r] || r }
function applyNavRoles() {
  const nav = document.getElementById('nav')
  if (!nav) return
  nav.querySelectorAll('a[data-page]').forEach(a => {
    const page = a.dataset.page
    if (page === 'dashboard') { a.style.display = ''; return }
    const allowed = canAccess(page)
    a.style.display = allowed ? '' : 'none'
  })
}

function capsCheck(e) {
  const w = document.getElementById('af-caps-warn')
  if (w) w.style.display = e.getModifierState('CapsLock') ? 'block' : 'none'
}

function showAuthModal(tab) {
  closeAuthModal()
  const page = document.createElement('div')
  page.id = 'auth-page'
  page.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
  `
  const orbs = document.createElement('div')
  orbs.innerHTML = `
    <div style="position:absolute;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(124,58,237,.3) 0%,transparent 70%);top:-100px;left:-100px;animation:orbFloat 8s ease-in-out infinite"></div>
    <div style="position:absolute;width:350px;height:350px;border-radius:50%;background:radial-gradient(circle,rgba(236,72,153,.25) 0%,transparent 70%);bottom:-80px;right:-80px;animation:orbFloat 10s ease-in-out infinite reverse"></div>
    <div style="position:absolute;width:250px;height:250px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,.2) 0%,transparent 70%);top:50%;left:50%;transform:translate(-50%,-50%);animation:orbFloat 12s ease-in-out infinite 2s"></div>
    <style>
      @keyframes orbFloat {
        0%,100%{transform:translate(0,0) scale(1)}
        33%{transform:translate(30px,-30px) scale(1.05)}
        66%{transform:translate(-20px,20px) scale(.95)}
      }
    </style>`
  page.appendChild(orbs)
  const grid = document.createElement('div')
  grid.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:.03'
  grid.innerHTML = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="lg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0L0 0 0 40" fill="none" stroke="white" stroke-width=".5"/></pattern></defs><rect width="100%" height="100%" fill="url(#lg)"/></svg>`
  page.appendChild(grid)
  document.body.appendChild(page)
  switchAuthTab(tab || 'login')
}

function closeAuthModal(showApp) {
  const el = document.getElementById('auth-page')
  if (el) el.remove()
  if (showApp) {
    const app = document.getElementById('app')
    if (app) app.style.display = 'flex'
  }
}

function switchAuthTab(tab) {
  const container = document.getElementById('auth-page')
  if (!container) return
  const html = {
    login: `
      <div style="background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:20px;padding:36px 32px 28px;width:380px;box-shadow:0 8px 40px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.1);max-height:90vh;overflow-y:auto">
        <div style="text-align:center;margin-bottom:24px">
          <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#EC4899);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:28px;color:#fff;box-shadow:0 4px 16px rgba(124,58,237,.4)">SE</div>
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#1a1a2e;letter-spacing:-.3px">Smart ESG</h1>
          <p style="margin:4px 0 0;font-size:11px;color:#999;letter-spacing:.5px">지속가능경영보고서 시스템 ${Store.version}</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <input id="af-id" type="text" placeholder="아이디" style="width:100%;padding:12px 14px;border:2px solid #e8e8ec;border-radius:12px;font-size:14px;outline:none;transition:border-color .2s;box-sizing:border-box" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'" onkeydown="if(event.key==='Enter') document.getElementById('af-pw').focus()">
          <input id="af-pw" type="password" placeholder="비밀번호" style="width:100%;padding:12px 14px;border:2px solid #e8e8ec;border-radius:12px;font-size:14px;outline:none;transition:border-color .2s;box-sizing:border-box" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'" onkeydown="capsCheck(event);if(event.key==='Enter') doLogin()" onkeyup="capsCheck(event)">
          <p id="af-caps-warn" style="color:#e67e22;font-size:12px;margin:0;display:none;text-align:center;padding:2px 0">⇧ Caps Lock이 켜져 있습니다</p>
          <button onclick="doLogin()" style="padding:12px;background:linear-gradient(135deg,#7C3AED,#EC4899);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 16px rgba(124,58,237,.3)" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(124,58,237,.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 16px rgba(124,58,237,.3)'">로그인</button>
          <p id="af-err" style="color:#d32f2f;font-size:13px;margin:0;display:none;text-align:center;padding:4px 0"></p>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px">
            <a href="#" onclick="switchAuthTab('register');return false" style="color:#7C3AED;text-decoration:none;font-weight:500">회원가입</a>
            <span>
              <a href="#" onclick="switchAuthTab('findId');return false" style="color:#7C3AED;text-decoration:none;font-weight:500">아이디찾기</a>
              <span style="color:#ddd;margin:0 6px">|</span>
              <a href="#" onclick="switchAuthTab('findPw');return false" style="color:#7C3AED;text-decoration:none;font-weight:500">비밀번호찾기</a>
            </span>
          </div>
        </div>
      </div>`,
    register: `
      <div style="background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:20px;padding:32px;width:420px;box-shadow:0 8px 40px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.1);max-height:90vh;overflow-y:auto">
        <div style="text-align:center;margin-bottom:20px">
          <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#EC4899);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:#fff;box-shadow:0 4px 16px rgba(124,58,237,.4)">+</div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:-.3px">회원가입</h2>
          <p style="margin:4px 0 0;font-size:12px;color:#999">관리자 승인 후 로그인이 가능합니다</p>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">아이디 *</label>
            <div style="display:flex;gap:6px">
              <input id="af-reg-id" type="text" style="flex:1;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'">
              <button onclick="checkIdDup()" style="padding:8px 12px;background:#f3f0ff;color:#7C3AED;border:1px solid #d4c8f0;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">중복확인</button>
            </div>
            <p id="af-reg-id-msg" style="font-size:11px;margin:3px 0 0;display:none"></p>
          </div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">비밀번호 *</label><input id="af-reg-pw" type="password" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'"></div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">비밀번호 확인 *</label><input id="af-reg-pw2" type="password" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'"></div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">이름 *</label><input id="af-reg-name" type="text" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'"></div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">이메일 * <span style="font-weight:400;color:#999">(아이디/비번 찾기)</span></label><input id="af-reg-email" type="email" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'"></div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">연락처</label><input id="af-reg-phone" type="text" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'"></div>
          <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">회사</label>
            <select id="af-reg-company" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;background:#fff">
              <option value="">선택</option>
            </select>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">부서</label>
              <select id="af-reg-dept" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;background:#fff">
                <option value="">선택</option>
              </select>
            </div>
            <div><label style="font-size:11px;font-weight:600;color:#666;margin-bottom:4px;display:block">직급</label><input id="af-reg-position" type="text" placeholder="예: 과장" style="width:100%;padding:10px 12px;border:2px solid #e8e8ec;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:border-color .2s" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'"></div>
          </div>
          <button onclick="doRegister()" style="margin-top:4px;padding:12px;background:linear-gradient(135deg,#7C3AED,#EC4899);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 16px rgba(124,58,237,.3)" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(124,58,237,.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 16px rgba(124,58,237,.3)'">가입 신청</button>
          <p id="af-reg-err" style="color:#d32f2f;font-size:13px;margin:0;display:none;text-align:center;padding:4px 0"></p>
          <div style="text-align:center;font-size:12px;color:#888">이미 계정이 있으신가요? <a href="#" onclick="switchAuthTab('login');return false" style="color:#7C3AED;text-decoration:none;font-weight:600">로그인</a></div>
        </div>
      </div>`,
    findId: `
      <div style="background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:20px;padding:32px;width:380px;box-shadow:0 8px 40px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.1)">
        <div style="text-align:center;margin-bottom:20px">
          <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#EC4899);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:#fff;box-shadow:0 4px 16px rgba(124,58,237,.4)">?</div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:-.3px">아이디 찾기</h2>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:13px;color:#888;margin:0;text-align:center">가입 시 등록한 이메일을 입력하세요.</p>
          <input id="af-findid-email" type="email" placeholder="example@email.com" style="width:100%;padding:12px 14px;border:2px solid #e8e8ec;border-radius:12px;font-size:14px;outline:none;transition:border-color .2s;box-sizing:border-box" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'">
          <button onclick="doFindId()" style="padding:12px;background:linear-gradient(135deg,#7C3AED,#EC4899);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 16px rgba(124,58,237,.3)" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(124,58,237,.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 16px rgba(124,58,237,.3)'">아이디 찾기</button>
          <p id="af-findid-rs" style="font-size:13px;margin:0;display:none;text-align:center;padding:6px 10px;border-radius:8px"></p>
          <div style="text-align:center;font-size:12px"><a href="#" onclick="switchAuthTab('login');return false" style="color:#7C3AED;text-decoration:none;font-weight:600">로그인으로 돌아가기</a></div>
        </div>
      </div>`,
    findPw: `
      <div style="background:rgba(255,255,255,.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-radius:20px;padding:32px;width:380px;box-shadow:0 8px 40px rgba(0,0,0,.3),0 0 0 1px rgba(255,255,255,.1)">
        <div style="text-align:center;margin-bottom:20px">
          <div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#EC4899);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:22px;color:#fff;box-shadow:0 4px 16px rgba(124,58,237,.4)">!</div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#1a1a2e;letter-spacing:-.3px">비밀번호 찾기</h2>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <p style="font-size:13px;color:#888;margin:0;text-align:center">가입 시 등록한 이름과 이메일을 입력하세요.</p>
          <input id="af-findpw-name" type="text" placeholder="이름" style="width:100%;padding:12px 14px;border:2px solid #e8e8ec;border-radius:12px;font-size:14px;outline:none;transition:border-color .2s;box-sizing:border-box" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'">
          <input id="af-findpw-email" type="email" placeholder="example@email.com" style="width:100%;padding:12px 14px;border:2px solid #e8e8ec;border-radius:12px;font-size:14px;outline:none;transition:border-color .2s;box-sizing:border-box" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#e8e8ec'">
          <button onclick="doFindPw()" style="padding:12px;background:linear-gradient(135deg,#7C3AED,#EC4899);color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 16px rgba(124,58,237,.3)" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 20px rgba(124,58,237,.4)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 16px rgba(124,58,237,.3)'">확인</button>
          <div id="af-findpw-rs" style="font-size:13px;margin:0;display:none;padding:10px;background:#f5f5f5;border-radius:8px;word-break:break-all;text-align:center"></div>
          <div style="text-align:center;font-size:12px"><a href="#" onclick="switchAuthTab('login');return false" style="color:#7C3AED;text-decoration:none;font-weight:600">로그인으로 돌아가기</a></div>
        </div>
      </div>`,
  }[tab]
  if (!html) return
  container.innerHTML = html
  if (tab === 'register') {
    const companySel = document.getElementById('af-reg-company')
    if (companySel) {
      const companies = Store.getCompanies()
      companies.forEach(c => {
        const opt = document.createElement('option')
        opt.value = c.id
        opt.textContent = c.name
        companySel.appendChild(opt)
      })
    }
    const deptSel = document.getElementById('af-reg-dept')
    if (deptSel) {
      const depts = Store.getDepartments().filter(d => d.is_active !== false)
      depts.forEach(d => {
        const opt = document.createElement('option')
        opt.value = d.dept_code
        opt.textContent = d.dept_name
        deptSel.appendChild(opt)
      })
    }
  }
}

async function doLogin() {
  const id = document.getElementById('af-id').value.trim()
  const pw = document.getElementById('af-pw').value
  const err = document.getElementById('af-err')
  if (!id || !pw) { err.textContent = '아이디와 비밀번호를 입력하세요.'; err.style.display = 'block'; return }
  const r = await login(id, pw)
  if (r.error) { err.textContent = r.error; err.style.display = 'block'; return }
  closeAuthModal(true)
  applyAuthUI()
  init()
  if (typeof initKeepAlive === 'function') initKeepAlive()
}

async function doRegister() {
  const id = document.getElementById('af-reg-id').value.trim()
  const pw = document.getElementById('af-reg-pw').value
  const pw2 = document.getElementById('af-reg-pw2').value
  const name = document.getElementById('af-reg-name').value.trim()
  const email = document.getElementById('af-reg-email').value.trim()
  const phone = document.getElementById('af-reg-phone').value.trim()
  const companyId = document.getElementById('af-reg-company').value
  const deptCode = document.getElementById('af-reg-dept').value
  const position = document.getElementById('af-reg-position').value.trim()
  const err = document.getElementById('af-reg-err')
  if (!id) { err.textContent = '아이디를 입력하세요.'; err.style.display = 'block'; return }
  if (!pw || pw.length < 4) { err.textContent = '비밀번호는 4자리 이상 입력하세요.'; err.style.display = 'block'; return }
  if (pw !== pw2) { err.textContent = '비밀번호가 일치하지 않습니다.'; err.style.display = 'block'; return }
  if (!name) { err.textContent = '이름을 입력하세요.'; err.style.display = 'block'; return }
  if (!email) { err.textContent = '이메일을 입력하세요.'; err.style.display = 'block'; return }
  const r = await register({ username: id, password: pw, name, email, phone, company_id: companyId ? parseInt(companyId) : null, dept_code: deptCode, position, role: 'user' })
  if (r.error) { err.textContent = r.error; err.style.display = 'block'; return }
  err.style.color = '#137333'
  err.textContent = '가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.'
  err.style.display = 'block'
}

async function checkIdDup() {
  const id = document.getElementById('af-reg-id').value.trim()
  const msg = document.getElementById('af-reg-id-msg')
  if (!id) { msg.textContent = '아이디를 입력하세요.'; msg.style.color = '#d32f2f'; msg.style.display = 'block'; return }
  let ok
  const local = Store.getUsers().find(u => u.username === id)
  if (!local) { ok = true }
  else {
    try {
      const sb = getSupabase()
      if (sb) { const { data } = await sb.from('tb_user').select('id').eq('username', id); ok = !data || data.length === 0 }
      else { ok = false }
    } catch (e) { ok = false }
  }
  msg.textContent = ok ? '사용 가능한 아이디입니다.' : '이미 사용 중인 아이디입니다.'
  msg.style.color = ok ? '#137333' : '#d32f2f'
  msg.style.display = 'block'
}

function doFindId() {
  const email = document.getElementById('af-findid-email').value.trim()
  const rs = document.getElementById('af-findid-rs')
  if (!email) { rs.textContent = '이메일을 입력하세요.'; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  const r = findId(email)
  if (r.error) { rs.textContent = r.error; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  rs.innerHTML = `회원님의 아이디는 <strong>${esc(r.username)}</strong>입니다. (가입일: ${r.createdAt})`
  rs.style.color = '#137333'; rs.style.display = 'block'
}

function doFindPw() {
  const name = document.getElementById('af-findpw-name').value.trim()
  const email = document.getElementById('af-findpw-email').value.trim()
  const rs = document.getElementById('af-findpw-rs')
  if (!name) { rs.textContent = '이름을 입력하세요.'; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  if (!email) { rs.textContent = '이메일을 입력하세요.'; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  const r = findPassword(name, email)
  if (r.error) { rs.textContent = r.error; rs.style.color = '#d32f2f'; rs.style.display = 'block'; return }
  rs.innerHTML = '관리자에게 비밀번호 초기화를 요청하세요.'
  rs.style.color = '#137333'; rs.style.display = 'block'
}

function applyAuthUI() {
  const user = currentUser
  const app = document.getElementById('app')
  if (app) app.style.display = user ? 'flex' : 'none'
  const userInfo = document.getElementById('user-info')
  if (userInfo) {
    userInfo.style.display = user ? 'block' : 'none'
    const nameEl = document.getElementById('profile-name-text')
    if (nameEl) nameEl.textContent = user ? (user.name + ' (' + roleLabel(user.role) + ')') : ''
  }
  document.getElementById('login-btn-top').style.display = user ? 'none' : 'inline-block'
  document.body.classList.toggle('viewer-mode', user && user.role === 'viewer')
  if (user) { applyNavRoles(); if (typeof refreshNotifBadge === 'function') refreshNotifBadge(); if (typeof Store !== 'undefined') Store.checkDeadlines() }
}
