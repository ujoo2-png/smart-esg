;(function() {
  const _tableState = {}
  const PAGE_SIZE = 15
  let _evidencePreviewId = null
  let _evidenceSearchQuery = ''
  let _evidenceViewMode = 'list'

  const el = (tag, attrs = {}, ...children) => {
    const e = document.createElement(tag)
    Object.entries(attrs).forEach(([k, v]) => {
      if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'className') e.className = v
      else if (k === 'innerHTML') e.innerHTML = v
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v)
      else if (k === 'selected' || k === 'checked' || k === 'disabled') e[k] = v
      else e.setAttribute(k, v)
    })
    children.forEach(c => {
      if (c == null) return
      if (Array.isArray(c)) c.forEach(item => { if (item != null) e.append(typeof item === 'string' ? document.createTextNode(item) : item) })
      else e.append(typeof c === 'string' ? document.createTextNode(c) : c)
    })
    return e
  }

  let _toastTimer = null
  function showToast(msg, type) {
    let t = document.querySelector('.toast')
    if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t) }
    clearTimeout(_toastTimer)
    t.textContent = msg
    t.className = 'toast ' + (type || '')
    requestAnimationFrame(() => { t.classList.add('show') })
    _toastTimer = setTimeout(() => t.classList.remove('show'), 2500)
  }

  let _loadingCount = 0
  function showLoading(text) {
    let ov = document.getElementById('loading-overlay')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'loading-overlay'
      ov.innerHTML = '<div style="position:fixed;inset:0;background:rgba(255,255,255,.7);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)"><div style="text-align:center"><div class="spinner"></div><p id="loading-text" style="margin-top:12px;font-size:13px;color:#555"></p></div></div>'
      document.body.appendChild(ov)
    }
    const txt = document.getElementById('loading-text')
    if (txt) txt.textContent = text || '처리 중...'
    ov.style.display = 'block'
    _loadingCount++
  }
  function hideLoading() {
    _loadingCount = Math.max(0, _loadingCount - 1)
    if (_loadingCount === 0) { const ov = document.getElementById('loading-overlay'); if (ov) ov.style.display = 'none' }
  }

  function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel')
    if (!panel) return
    panel.classList.toggle('hidden')
    if (!panel.classList.contains('hidden')) renderNotifList()
  }
  function renderNotifList() {
    const list = document.getElementById('notif-list')
    if (!list) return
    const notifs = Store.getNotifications().slice().reverse().slice(0, 30)
    if (!notifs.length) { list.innerHTML = '<div style="padding:24px;text-align:center;color:#999;font-size:13px">알림이 없습니다</div>'; return }
    list.innerHTML = notifs.map(n => {
      const icon = n.type === 'error' ? '🔴' : n.type === 'warning' ? '🟡' : n.type === 'success' ? '🟢' : '🔵'
      const bg = n.read ? '#fff' : '#f8f6ff'
      return `<div class="notif-item" data-id="${n.id}" data-page="${n.related_page || ''}" data-rid="${n.related_id || ''}" style="padding:10px 16px;border-bottom:1px solid #f5f5f5;background:${bg};cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:flex-start" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='${bg}'">
        <span style="flex-shrink:0;margin-top:1px">${icon}</span>
        <div style="flex:1;line-height:1.5">${n.message}</div>
        <span style="color:#bbb;font-size:10px;white-space:nowrap">${_timeAgo(n.created_at)}</span>
      </div>`
    }).join('')
    list.querySelectorAll('.notif-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id)
        const page = el.dataset.page
        const rid = el.dataset.rid ? parseInt(el.dataset.rid) : null
        Store.markNotificationRead(id)
        document.getElementById('notif-panel').classList.add('hidden')
        if (page) {
          navigate(page)
          if (rid && page === 'assessment') setTimeout(() => showAssessmentDetail(rid), 100)
          else if (rid && page === 'ghg') setTimeout(() => { if (typeof renderGHG === 'function') renderGHG() }, 100)
          else if (rid && page === 'submit') setTimeout(() => { if (typeof renderSubmit === 'function') renderSubmit() }, 100)
          else if (rid && page === 'kssb') setTimeout(() => { if (typeof renderKSSB === 'function') renderKSSB() }, 100)
          else if (rid && page === 'editor') { _editorAssId = rid; setTimeout(() => { if (typeof renderReportEditor === 'function') renderReportEditor() }, 100) }
        }
        refreshNotifBadge()
      })
    })
  }
  function _timeAgo(iso) {
    if (!iso) return ''
    const diff = Date.now() - new Date(iso).getTime()
    if (diff < 60000) return '방금'
    if (diff < 3600000) return Math.floor(diff / 60000) + '분 전'
    if (diff < 86400000) return Math.floor(diff / 3600000) + '시간 전'
    return Math.floor(diff / 86400000) + '일 전'
  }
  function refreshNotifBadge() {
    const badge = document.getElementById('notif-badge')
    const wrapper = document.getElementById('notif-wrapper')
    if (!badge || !wrapper) return
    const count = Store.getUnreadNotifications(currentUser?.id).length
    if (currentUser) { wrapper.style.display = ''; badge.textContent = count; badge.style.display = count > 0 ? '' : 'none' }
    else { wrapper.style.display = 'none' }
  }
  window.toggleNotifPanel = toggleNotifPanel
  window.markAllRead = function() { Store.markAllNotificationsRead(currentUser?.id); refreshNotifBadge(); renderNotifList() }

  function _jumpBtn(page, label, id) {
    return el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px;padding:3px 8px', onClick: () => { navigate(page); if (id) setTimeout(() => { if (page === 'assessment') showAssessmentDetail(id) }, 50) } }, '↗ ' + label)
  }

  function sortableTable(id, columns, rows, opts = {}) {
    if (!_tableState[id]) _tableState[id] = { sortCol: -1, sortAsc: true, selected: new Set(), page: 0 }
    const st = _tableState[id]
    const ps = opts.pageSize || PAGE_SIZE
    const filtered = opts.filter ? rows.filter(opts.filter) : rows
    const sorted = st.sortCol >= 0
      ? [...filtered].sort((a, b) => st.sortAsc ? compareSort(a, b, st.sortCol, columns) : compareSort(b, a, st.sortCol, columns))
      : filtered
    const totalPages = Math.max(1, Math.ceil(sorted.length / ps))
    if (st.page >= totalPages) st.page = totalPages - 1
    if (st.page < 0) st.page = 0
    const paged = sorted.slice(st.page * ps, (st.page + 1) * ps)

    const container = el('div', { style: 'width:100%;overflow-x:auto' })

    if (opts.bulkDelete) {
      const selCount = st.selected.size
      container.append(el('div', { style: 'display:flex;gap:8px;align-items:center;margin-bottom:8px' },
        el('span', { style: 'font-size:12px;color:#888' }, selCount ? `${selCount}개 선택` : ''),
        selCount ? el('button', { className: 'btn btn-sm btn-danger', onClick: () => {
          if (confirm(`${selCount}개를 삭제하시겠습니까?`)) {
            st.selected.forEach(k => opts.bulkDelete(k))
            st.selected.clear()
            rerender()
          }
        }}, `선택 삭제 (${selCount})`) : null,
        selCount ? el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { st.selected.clear(); rerender() }}, '선택 해제') : null
      ))
    }

    const allChecked = paged.length > 0 && paged.every((_, i) => st.selected.has(id + '-r' + (st.page * ps + i)))
    const toggleAll = el('input', { type: 'checkbox', checked: allChecked, onChange: e => {
      const startIdx = st.page * ps
      if (e.target.checked) paged.forEach((_, i) => st.selected.add(id + '-r' + (startIdx + i)))
      else paged.forEach((_, i) => st.selected.delete(id + '-r' + (startIdx + i)))
      rerender()
    }})

    const thStyle = 'padding:8px 10px;border-bottom:2px solid #e0d8f0;font-size:12px;color:#555;font-weight:600'
    const ths = columns.map((col, ci) => {
      const isSorted = st.sortCol === ci
      const th = el('th', {
        style: `${thStyle};cursor:pointer;white-space:nowrap;user-select:none;text-align:${col.align || 'left'};${col.width ? 'width:' + col.width : ''}`,
        onClick: () => {
          if (st.sortCol === ci) st.sortAsc = !st.sortAsc
          else { st.sortCol = ci; st.sortAsc = true }
          rerender()
        }
      }, col.label + (isSorted ? (st.sortAsc ? ' ▲' : ' ▼') : ' ▽'))
      return th
    })

    const actionsHeader = opts.actions ? el('th', { style: `${thStyle};text-align:center;white-space:nowrap` }, '관리') : null
    const thead = el('tr', {},
      el('th', { style: `${thStyle};width:36px;text-align:center` }, toggleAll),
      el('th', { style: `${thStyle};width:40px;text-align:center` }, 'No'),
      ...ths,
      actionsHeader
    )

    const startNum = st.page * ps + 1
    const tbody = el('tbody', {}, ...paged.map((item, ri) => {
      const globalIdx = st.page * ps + ri
      const checked = st.selected.has(id + '-r' + globalIdx)
      const cb = el('input', { type: 'checkbox', checked, onChange: () => {
        if (checked) st.selected.delete(id + '-r' + globalIdx)
        else st.selected.add(id + '-r' + globalIdx)
        rerender()
      }})
      const cells = columns.map((col, ci) => {
        const val = typeof col.value === 'function' ? col.value(item, ci) : item[col.key]
        const td = el('td', { style: `padding:8px 10px;font-size:13px;text-align:${col.align || 'left'}` })
        if (val instanceof HTMLElement) td.append(val)
        else if (val != null) td.textContent = val
        else td.textContent = ''
        return td
      })
      return el('tr', { style: checked ? 'background:#f0f0ff' : '' },
        el('td', { style: 'padding:8px 6px;text-align:center;width:36px' }, cb),
        el('td', { style: 'padding:8px 6px;text-align:center;width:40px;font-size:12px;color:#999' }, String(startNum + ri)),
        ...cells,
        opts.actions ? el('td', { style: 'padding:8px 10px;text-align:center;white-space:nowrap' },
          ...(typeof opts.actions === 'function' ? opts.actions(item) : opts.actions)
        ) : null
      )
    }))

    if (!paged.length) {
      tbody.append(el('tr', {}, el('td', { style: 'padding:20px;text-align:center;color:#999', colspan: columns.length + 3 }, opts.emptyText || '등록된 데이터가 없습니다.')))
    }

    const table = el('table', { style: 'width:100%;border-collapse:collapse;font-size:13px;table-layout:auto' }, el('thead', {}, thead), tbody)
    container.append(table)

    if (totalPages > 1) {
      const nav = el('div', { style: 'display:flex;justify-content:center;align-items:center;gap:6px;margin-top:10px;font-size:12px' })
      const mkPageBtn = (label, pg, disabled) => el('button', {
        className: 'btn btn-sm' + (disabled ? '' : ' btn-secondary'),
        style: disabled ? 'opacity:.4;cursor:default' : 'cursor:pointer',
        onClick: disabled ? null : () => { st.page = pg; rerender() }
      }, label)
      nav.append(mkPageBtn('◀', st.page - 1, st.page <= 0))
      const startP = Math.max(0, st.page - 2)
      const endP = Math.min(totalPages, startP + 5)
      for (let p = startP; p < endP; p++) {
        const btn = el('button', {
          className: 'btn btn-sm',
          style: p === st.page ? 'background:#7C3AED;color:#fff' : '',
          onClick: () => { st.page = p; rerender() }
        }, String(p + 1))
        nav.append(btn)
      }
      nav.append(mkPageBtn('▶', st.page + 1, st.page >= totalPages - 1))
      nav.append(el('span', { style: 'color:#888;margin-left:8px' }, `${sorted.length}건`))
      container.append(nav)
    } else if (sorted.length > 0) {
      container.append(el('div', { style: 'text-align:right;font-size:11px;color:#999;margin-top:4px' }, `${sorted.length}건`))
    }

    function rerender() { container.replaceWith(sortableTable(id, columns, rows, opts)) }
    return container
  }

  function compareSort(a, b, col, columns) {
    const ka = typeof columns[col].value === 'function' ? columns[col].value(a, col) : a[columns[col].key]
    const kb = typeof columns[col].value === 'function' ? columns[col].value(b, col) : b[columns[col].key]
    if (ka == null) return 1
    if (kb == null) return -1
    if (typeof ka === 'number' && typeof kb === 'number') return ka - kb
    return String(ka).localeCompare(String(kb), 'ko')
  }

  const modal = (title, body, extra) => {
    document.getElementById('modal-title').textContent = title
    document.getElementById('modal-body').innerHTML = ''
    if (typeof body === 'string') document.getElementById('modal-body').innerHTML = body
    else document.getElementById('modal-body').append(body)
    const saveBtn = document.getElementById('modal-save')
    const footer = saveBtn?.parentElement
    if (footer) { footer.querySelectorAll('.modal-extra-btn').forEach(b => b.remove()) }
    if (Array.isArray(extra)) {
      saveBtn.textContent = '저장'
      extra.forEach(opt => {
        const btn = document.createElement('button')
        btn.className = (opt.className || 'btn btn-secondary') + ' modal-extra-btn'
        btn.textContent = opt.label || ''
        btn.style.marginRight = '8px'
        if (opt.onClick) btn.onclick = opt.onClick
        footer.insertBefore(btn, saveBtn)
      })
    } else {
      saveBtn.textContent = extra || '저장'
    }
    saveBtn.style.display = ''
    document.getElementById('modal-overlay').classList.remove('hidden')
  }

  let _userListTab = 'all'
  let _helpOpen = false
  let _griAssId = null
  let _riskAssId = null
  let _monitorAssId = null
  let _monitorIndustry = 'mfg'

  const _helpTexts = {
    dashboard: `<strong>📊 대시보드</strong><br><br>
• 현재 ESG 평가 현황을 한눈에 확인합니다.<br>
• 점수, 테마 레이더 차트, 증빙 진행률, AI 초안 현황, 온실가스 배출량, 항목별 완료율을 카드 형태로 보여줍니다.<br>
• 평가를 먼저 생성해야 데이터가 표시됩니다.`,
    assessment: `<strong>📋 ESG 평가</strong><br><br>
• EcoVadis / KSSB / KCGS / NICE / K-ESG 기준의 평가를 생성·관리합니다.<br>
• <strong>+ 새 평가</strong> 버튼으로 평가를 추가하고, 각 평가의 점수·등급을 입력·수정할 수 있습니다.<br>
• 평가를 삭제하면 연결된 모든 데이터(항목·증빙·AI 초안)도 함께 삭제됩니다.`,
    indicator: `<strong>📌 지표 관리</strong><br><br>
• 평가 기관별 지표를 조회하고 활성/비활성 전환합니다.<br>
• 상단 드롭다운으로 기관(EcoVadis 21개 항목, KSSB 등)을 전환할 수 있습니다.<br>
• 비활성화된 지표는 평가 화면에서 제외됩니다.`,
    evidence: `<strong>📎 증빙 관리</strong><br><br>
• 각 평가 지표에 필요한 증빙 자료를 등록·관리합니다.<br>
• 증빙 상태: 자가입력 → 내부검토완료 → 외부검증완료 순으로 관리됩니다.<br>
• 관리자만 민감정보(급여, 인사정보 등)를 조회할 수 있습니다.`,
    ghg: `<strong>🏭 온실가스</strong><br><br>
• Scope 1(직접), Scope 2(에너지 간접·위치/시장 기준), Scope 3(가치사슬) 배출량을 계산합니다.<br>
• 활동자료(에너지 사용량)를 입력하면 IPCC/KEPCO 기반 배출계수로 자동 계산됩니다.<br>
• 상단 요약 영역에서 Scope별 합계를 확인할 수 있습니다.`,
    supplier: `<strong>🏢 협력사 리스크</strong><br><br>
• 협력사 정보를 등록하고 VSME(중소기업 자율보고) 자가진단을 수행합니다.<br>
• <strong>기본 모드</strong>: 12개 항목 (환경·사회·지배구조 기본 정책/체크)<br>
• <strong>종합 모드</strong>: 14개 항목 (정량 KPI, 인증, 목표 포함)<br>
• 자가진단 결과에 따라 협력사 리스크 등급(A/B/C/D)이 자동 산정됩니다.`,
    ai: `<strong>🤖 AI 보고서</strong><br><br>
• OpenCode AI를 활용하여 지속가능경영보고서를 자동 생성합니다.<br>
• 생성된 보고서는 <strong>검증</strong> 단계를 거쳐 증빙-텍스트 연결이 강제됩니다.<br>
• 초안 상태: 초안 → 검증완료 → 승인됨 순서로 진행됩니다.`,
    editor: `<strong>📝 보고서 편집기 (S-05)</strong><br><br>
• 지표별로 연결할 증빙을 관리하는 화면입니다.<br>
• <strong>지표 ↔ 증빙 다대다 연결</strong>: 보고서 편집기에서만 연결 작업을 수행합니다.<br>
• 연결된 증빙만 AI 프롬프트에 전달됩니다.<br>
• 미연결 문장은 AI 검증에서 UNSUPPORTED로 표시되고, 최종 승인이 차단됩니다.`,
    settings: `<strong>⚙️ 설정</strong><br><br>
• <strong>사용자 관리</strong>: 가입 승인/거절, 권한 변경, 계정 삭제<br>
• <strong>접속 유지</strong>: Supabase 무료 요금제 중단 방지를 위한 자동 접속 (6일 간격)<br>
• <strong>모바일 접속</strong>: QR코드로 모바일 페이지에 접속할 수 있습니다.`,
    gri: `<strong>📊 GRI 준수율</strong><br><br>
• GRI Standards에 대한 자사 준수 현황을 분석합니다.<br>
• 완전준수(70점 이상) / 부분준수(30~69점) / 미준수(30점 미만)로 구분합니다.<br>
• 필수 항목 34개 기준으로 준수율을 계산합니다.`,
    risk: `<strong>⚠️ 리스크 예측</strong><br><br>
• 6개 카테고리(기후변화, 자원고갈, 생태계, 인권/노동, 지배구조, 공급망)의 리스크를 분석합니다.<br>
• 전년 대비 추세 변화를 감지하고 알림을 생성합니다.<br>
• AI 기반 리스크 점수와 등급을 산정합니다.`,
    monitor: `<strong>📈 벤치마크</strong><br><br>
• 8개 업종별 EcoVadis 평균 점수와 자사를 비교합니다.<br>
• 글로벌 평균(51점) 대비 상대적 위치를 분석합니다.<br>
• 업종별 랭킹 차트를 제공합니다.`,
    issa: `<strong>🛡️ 감사 보증</strong><br><br>
• ISSA 5000 국제 표준에 따른 외부 감사 보증 워크플로우를 관리합니다.<br>
• 4단계 감사(계획→실사→결론→보증)를 추적합니다.<br>
• 지적사항 관리, 보증 의견서 자동 생성을 지원합니다.`,
    submit: `<strong>📤 평가기관 제출</strong><br><br>
• EcoVadis, CDP, GRI, TCFD, SBTi 등 8개 평가기관에 대한 제출 준비를 관리합니다.<br>
• 기관별 필수 체크리스트를 관리하고 제출 준비율을 확인합니다.<br>
• EcoVadis CSV 등 기관별 포맷으로 데이터를 내보낼 수 있습니다.`,
    api: `<strong>🔌 API 연동</strong><br><br>
• ERP, HR, 조달, 재무 시스템과의 데이터 연동 인터페이스를 관리합니다.<br>
• CSV 파일 가져오기로 GHG, 에너지, 인력 데이터를 일괄 등록합니다.<br>
• 10개 엔드포인트의 상태와 동기화 이력을 모니터링합니다.`,
    kssb: `<strong>📜 KSSB 공시관리</strong><br><br>
• KSSB 공시기준 제1호(일반사항)/제2호(기후) 항목별 작성 관리 화면입니다.<br>
• <strong>법정 의무(MANDATORY)</strong> 항목으로, 미공시 시 과태료가 부과됩니다.<br>
• Scope2 이중보고(위치기준+시장기준) 대상 지표를 표시합니다.`,
    aihistory: `<strong>🕐 AI 생성이력 검토 (S-13)</strong><br><br>
• AI가 생성한 모든 초안의 이력을 시간순으로 확인합니다.<br>
• 검증 통과 후 사람 검토를 기다리는 건을 승인/반려할 수 있습니다.<br>
• 마스킹 적용 여부를 확인할 수 있습니다.`,
    budget: `<strong>💰 예산/위험관리 (S-14)</strong><br><br>
• 프로젝트 예산 집행 현황을 관리합니다.<br>
• 리스크 레지스터에서 리스크를 등록하고 확률×영향 점수로 관리합니다.`,
    masking: `<strong>🔒 마스킹 설정 (S-15)</strong><br><br>
• AI 외부 API 전송 전 적용할 민감정보 마스킹 규칙을 정의합니다.<br>
• 전체마스킹/부분마스킹/집계치만허용 3가지 유형을 지원합니다.`
  }

  function init() {
    document.getElementById('version-label').textContent = '지속가능경영보고서 시스템 ' + Store.version
    const vb = document.getElementById('version-badge')
    if (vb) vb.textContent = Store.version
    ensureAdmin()
    GHG.init()
    checkAuth().then(user => {
      applyAuthUI()
      if (user) {
        document.getElementById('app').style.display = 'flex'
        navigate('dashboard')
      } else {
        showAuthModal('login')
      }
    })
    initKeepAlive()
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _evidencePreviewId) { _evidencePreviewId = null; const c = document.getElementById('page-evidence'); if (c) renderEvidenceMgmt() } })
  }

  // ==================== Navigation ====================
  function navigate(page) {
    if (typeof canAccess === 'function' && !canAccess(page)) {
      page = 'dashboard'
    }
    document.querySelectorAll('#nav a').forEach(a => a.classList.remove('active'))
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
    const link = document.querySelector(`#nav a[data-page="${page}"]`)
    if (link) {
      link.classList.add('active')
      const group = link.closest('.nav-group')
      if (group && !group.classList.contains('open')) group.classList.add('open')
    }
    const pageEl = document.getElementById('page-' + page)
    if (pageEl) pageEl.classList.add('active')
    const label = link ? link.textContent.replace(/^[^\s]+\s/, '') : page
    document.getElementById('page-title').textContent = label
    history.replaceState(null, '', '#' + page)
    if (_helpOpen) showHelpFor(page)

    const _safe = (fn) => { try { fn() } catch (e) { console.error('Render error [' + page + ']:', e); const c = document.getElementById('page-' + page); if (c) { c.innerHTML = ''; c.append(el('div', { className: 'card' }, el('div', { style: 'padding:20px;color:#e74c3c' }, el('h3', { style: 'margin:0 0 8px' }, '오류가 발생했습니다'), el('p', { style: 'margin:0 0 12px;font-size:13px' }, e.message), el('button', { className: 'btn btn-secondary', onClick: () => navigate(page) }, '다시 시도')))) } } }
    if (page === 'dashboard') { _safe(renderDashboard); setTimeout(() => _showFirstLoginProjectPopup(), 500) }
    else if (page === 'assessment') _safe(renderAssessments)
    else if (page === 'indicator') _safe(renderIndicators)
    else if (page === 'evidence') _safe(renderEvidenceMgmt)
    else if (page === 'ghg') _safe(renderGHG)
    else if (page === 'supplier') _safe(renderSupplier)
    else if (page === 'ai') _safe(renderAI)
    else if (page === 'editor') _safe(renderReportEditor)
    else if (page === 'gri') _safe(renderGRI)
    else if (page === 'risk') _safe(renderRisk)
    else if (page === 'monitor') _safe(renderMonitor)
    else if (page === 'issa') _safe(renderISSA)
    else if (page === 'submit') _safe(renderSubmit)
    else if (page === 'publicdata') _safe(renderPublicData)
    else if (page === 'kssb') _safe(renderKSSB)
    else if (page === 'aihistory') _safe(renderAIHistory)
    else if (page === 'budget') _safe(renderBudget)
    else if (page === 'masking') _safe(renderMasking)
    else if (page === 'api') _safe(renderAPI)
    else if (page === 'share') _safe(renderShareManagement)
    else if (page === 'settings') _safe(() => switchSettingsTab('tab-users'))
    else if (page === 'project') _safe(renderProjectManagement)
  }

  function showHelpFor(page) {
    document.getElementById('help-content').innerHTML = _helpTexts[page] || '<strong>도움말</strong><br><br>선택한 페이지에 대한 도움말이 준비 중입니다.'
  }

  function toggleHelp() {
    _helpOpen = !_helpOpen
    const panel = document.getElementById('help-panel')
    if (_helpOpen) {
      const page = document.querySelector('#nav a.active')?.dataset?.page || 'dashboard'
      showHelpFor(page)
      panel.classList.remove('hidden')
    } else {
      panel.classList.add('hidden')
    }
  }

  // ==================== ESG 평가 ====================
  let _currentAssessmentId = null

  function renderAssessments() {
    const c = document.getElementById('page-assessment')
    const assessments = Store.getAssessments()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, 'ESG 평가 목록'),
          el('button', { className: 'btn btn-primary', onClick: openAddAssessment }, '+ 새 평가')
        ),
        sortableTable('assessments', [
          { label: '제목', key: 'title', value: a => a.title || '-' },
          { label: '기관', value: a => Indicator.getAuthorityName(a.authority_code) },
          { label: '유형', value: a => { const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []; const ag = agencies.find(x => x.code === a.authority_code); return typeBadge(ag?.track_type) }, align: 'center' },
          { label: '연도', key: 'assessment_year', align: 'center' },
          { label: '상태', value: a => statusBadge(a.status), align: 'center' },
          { label: '총점', value: a => a.total_score != null ? a.total_score.toFixed(1) : '-', align: 'center' },
          { label: '등급', key: 'rating', align: 'center' }
        ], assessments, {
          bulkDelete: id => Store.deleteAssessmentCascade(id),
          actions: a => [
            el('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 4 }, onClick: () => showAssessmentDetail(a.id) }, '점수'),
            el('button', { className: 'btn btn-sm btn-secondary', style: { marginRight: 4 }, onClick: () => editAssessment(a.id) }, '수정'),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('정말 삭제?')) { Store.deleteAssessmentCascade(a.id); if (_currentAssessmentId === a.id) _currentAssessmentId = null; showToast('평가가 삭제되었습니다.', 'success'); renderAssessments() } } }, '삭제')
          ]
        })
      )
    )
  }

  function statusBadge(status) {
    const colors = { draft: '#95a5a6', in_review: '#f39c12', verified: '#3498db', approved: '#27ae60', pending: '#f39c12', rejected: '#e74c3c' }
    const labels = { draft: '초안', in_review: '검토중', verified: '검증완료', approved: '승인됨', pending: '대기', rejected: '반려' }
    return el('span', { style: `background:${colors[status] || '#95a5a6'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, labels[status] || status || '-')
  }

  function typeBadge(trackType) {
    const isMandatory = trackType === 'MANDATORY'
    return el('span', { style: `background:${isMandatory ? '#e74c3c' : '#95a5a6'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, isMandatory ? '법정 의무' : '자율')
  }

  function evidenceStatusBadge(status) {
    const colors = { self: '#f39c12', internal_reviewed: '#3498db', externally_verified: '#27ae60' }
    const labels = { self: '자가', internal_reviewed: '내부검토', externally_verified: '외부검증' }
    return el('span', { style: `background:${colors[status] || '#95a5a6'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, labels[status] || status || '-')
  }

  function showAssessmentDetail(id) {
    _currentAssessmentId = id
    const a = Store.getAssessments().find(x => x.id === id)
    if (!a) return
    const c = document.getElementById('page-assessment')
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === id)
    const groups = Indicator.getGroups(a.authority_code)
    const allIndicators = Store.getIndicators().filter(i => i.authority_code === a.authority_code && i.is_active !== false)
    const evidences = Store.getEvidences().filter(e => e.assessment_id === id)
    const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []
    const ag = agencies.find(x => x.code === a.authority_code)
    const isPublicData = ag?.assessment_type === 'PUBLIC_DATA'
    const nextStatus = isPublicData ? { draft: 'in_review', in_review: 'verified', verified: 'approved', approved: null } : { draft: 'in_review', in_review: 'verified', verified: 'approved', approved: null }
    const statusLabels = isPublicData ? { draft: '검토 요청', in_review: '검증 완료', verified: '승인', approved: null } : { draft: '검토 요청', in_review: '검증 완료', verified: '승인', approved: null }

    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('div', {},
            el('h3', { style: 'margin:0' }, a.title || '평가 상세'),
            el('div', { style: 'font-size:12px;color:#888;margin-top:4px' }, `${Indicator.getAuthorityName(a.authority_code)} · ${a.assessment_year}년${ag ? (ag.track_type === 'MANDATORY' ? ' <span style="background:#e74c3c;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">법정 의무</span>' : ' <span style="background:#95a5a6;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">자율 공시</span>') : ''}${isPublicData ? ' <span style="background:#3b82f6;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">공개자료</span>' : ''}`)
          ),
          el('div', { style: 'display:flex;gap:6px;align-items:center' },
            el('span', {}, statusBadge(a.status)),
            nextStatus[a.status] ? el('button', { className: 'btn btn-sm btn-primary', onClick: () => transitionStatus(id) }, statusLabels[a.status]) : null,
            el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { Report.print(id) } }, '📄 보고서 인쇄'),
            el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { Report.downloadHTML(id); showToast('보고서가 다운로드되었습니다.', 'success') } }, '📥 HTML 저장'),
            el('button', { className: 'btn btn-sm btn-secondary', onClick: renderAssessments }, '← 목록')
          )
        ),
        el('div', { style: 'padding:16px 20px;display:flex;gap:24px;font-size:13px;border-bottom:1px solid #eee' },
          el('span', {}, `총점: <strong>${a.total_score != null ? a.total_score.toFixed(1) : '-'}</strong>`),
          el('span', {}, `등급: <strong>${a.rating || '-'}</strong>`),
          el('span', {}, `항목: ${allIndicators.length}개 / 입력: ${items.length}개`)
        )
      ),
      el('div', { className: 'card', style: 'margin-bottom:12px' },
        el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center' },
          el('h3', { style: 'margin:0;font-size:14px' }, '✅ 검증 체크리스트'),
          el('span', { style: 'font-size:12px;color:#27ae60', id: 'checklist-progress' }, '')
        ),
        el('div', { id: 'checklist-body', style: 'padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:6px' },
          ...renderChecklist(a, items, allIndicators, evidences)
        )
      ),
      ...groups.map(g => {
        const inds = allIndicators.filter(i => i.group_id === g.id)
        const weight = Store.getWeightParams().find(w => w.authority_code === a.authority_code && w.theme_code === g.group_code && w.year === (a.assessment_year || 2026))
        const pillarParams = Store.getWeightParams().filter(w => w.authority_code === 'ECOVADIS' && w.theme_code === '_PILLAR' && w.year === (a.assessment_year || 2026))
        const pillarNote = a.authority_code === 'ECOVADIS' && pillarParams.length
          ? pillarParams.map(p => `${Indicator.getPillarName(p.pillar)} ${p.weight}%`).join(' / ')
          : (weight ? `가중치 ${weight.weight}%` : '')
        return el('div', { className: 'card' },
          el('div', { className: 'card-header' },
            el('h3', { style: 'font-size:14px' }, `${Indicator.getGroupDisplayName(g)} ${pillarNote ? `- ${pillarNote}` : ''}`)
          ),
          el('table', { style: 'font-size:13px' },
            el('thead', {}, el('tr', {}, el('th', { style: 'width:80px' }, '코드'), el('th', {}, '지표'), el('th', {}, '필러'), el('th', { style: 'width:80px;text-align:center' }, '점수(0-100)'), el('th', { style: 'width:60px;text-align:center' }, '완료'), el('th', { style: 'width:80px;text-align:center' }, '증빙'))),
            el('tbody', {}, ...inds.map(ind => {
              const item = items.find(i => i.indicator_id === ind.id)
              const evCount = item?.evidence_ids?.length || 0
              return el('tr', {},
                el('td', { style: 'font-weight:500' }, ind.indicator_code),
                el('td', {}, Indicator.getDisplayName(ind)),
                el('td', {}, Indicator.getPillarName(ind.pillar)),
                el('td', { style: 'text-align:center' },
                  el('input', { type: 'number', min: 0, max: 100, step: 1, value: item?.score ?? '', style: 'width:70px;padding:4px 6px;border:1px solid #ddd;border-radius:6px;text-align:center;font-size:13px', onInput: () => saveItemScore(id, ind.id, weight?.id, weight?.weight || 25) })
                ),
                el('td', { style: 'text-align:center' },
                  item ? el('span', { style: 'color:#27ae60;font-size:16px' }, '✓') : el('span', { style: 'color:#ccc;font-size:16px' }, '—')
                ),
                el('td', { style: 'text-align:center' },
                  evCount > 0
                    ? el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:10px;padding:2px 6px', onClick: () => navigate('evidence') }, evCount + '건 ↗')
                    : el('span', { style: 'color:#e74c3c;font-size:11px' }, '미연결')
                )
              )
            }))
          )
        )
      })
    )
  }

  function saveItemScore(assessmentId, indicatorId, weightId, weightPct) {
    const score = parseInt(event.target.value)
    if (isNaN(score) || score < 0 || score > 100) return
    const items = Store.getAssessmentItems()
    const existing = items.find(i => i.assessment_id === assessmentId && i.indicator_id === indicatorId)
    if (existing) {
      Store.updateAssessmentItem(existing.id, { score, weight_id: weightId, weight: weightPct, updated_at: new Date().toISOString() })
    } else {
      Store.addAssessmentItem({ assessment_id: assessmentId, indicator_id: indicatorId, score, weight_id: weightId, weight: weightPct, status: 'completed' })
    }
    calcAssessmentScore(assessmentId)
  }

  function calcAssessmentScore(id) {
    const a = Store.getAssessments().find(x => x.id === id)
    if (!a) return
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === id)
    if (!items.length) return
    const year = a.assessment_year || 2026
    const usePillarWeight = a.authority_code === 'ECOVADIS'
    let totalWeighted = 0
    let totalWeight = 0
    if (usePillarWeight) {
      const pillarParams = Store.getWeightParams().filter(w => w.authority_code === 'ECOVADIS' && w.theme_code === '_PILLAR' && w.year === year)
      const pillars = ['POLICY', 'ACTION', 'RESULT']
      pillars.forEach(p => {
        const pillarItems = items.filter(i => {
          const ind = Store.getIndicators().find(x => x.id === i.indicator_id)
          return ind && ind.pillar === p
        })
        if (!pillarItems.length) return
        const pw = pillarParams.find(pp => pp.pillar === p)
        const w = pw ? pw.weight / 100 : (1 / pillars.length)
        const avg = pillarItems.reduce((s, i) => s + (i.score || 0), 0) / pillarItems.length
        totalWeighted += avg * w
        totalWeight += w
      })
    } else {
      const groups = Indicator.getGroups(a.authority_code)
      groups.forEach(g => {
        const groupItems = items.filter(i => {
          const ind = Store.getIndicators().find(x => x.id === i.indicator_id)
          return ind && ind.group_id === g.id
        })
        if (!groupItems.length) return
        const weight = Store.getWeightParams().find(w => w.authority_code === a.authority_code && w.theme_code === g.group_code && w.year === year)
        const w = weight ? weight.weight / 100 : (1 / groups.length)
        const avg = groupItems.reduce((s, i) => s + (i.score || 0), 0) / groupItems.length
        totalWeighted += avg * w
        totalWeight += w
      })
    }
    const finalScore = totalWeight > 0 ? totalWeighted / totalWeight : 0
    const thresholds = Store.getRatingThresholds().filter(t => t.authority_code === a.authority_code && t.year === year)
    let rating = '-'
    for (const t of thresholds.sort((a, b) => b.min_score - a.min_score)) {
      if (finalScore >= t.min_score && finalScore <= t.max_score) { rating = t.rating; break }
    }
    Store.updateAssessment(id, { total_score: finalScore, rating })
    showAssessmentDetail(id)
  }

  function renderChecklist(a, items, allIndicators, evidences) {
    const linkedEvidenceCount = evidences.length
    const scoredCount = items.filter(i => i.score != null && i.score > 0).length
    const completedCount = items.filter(i => i.status === 'completed').length
    const tags = Store.getEvidenceTags().filter(t => items.some(i => i.indicator_id === t.indicator_id))
    const ghgData = Store.getGHGSummary(a.id) || []
    const hasGHG = ghgData.length > 0
    const allIndicatorsLinked = allIndicators.length > 0 && allIndicators.every(ind => tags.some(t => t.indicator_id === ind.id))
    const checks = [
      { label: '지표 목록 등록 완료', done: allIndicators.length > 0, detail: `${allIndicators.length}개` },
      { label: '모든 지표에 점수 입력', done: scoredCount === allIndicators.length && allIndicators.length > 0, detail: `${scoredCount}/${allIndicators.length}` },
      { label: '증빙 파일 등록', done: linkedEvidenceCount > 0, detail: `${linkedEvidenceCount}건` },
      { label: '전체 지표에 증빙 연결', done: allIndicatorsLinked, detail: `${new Set(tags.map(t => t.indicator_id)).size}/${allIndicators.length}` },
      { label: 'GHG 활동자료 등록', done: hasGHG, detail: hasGHG ? '완료' : '미등록' },
      { label: '검증 완료', done: a.status === 'verified' || a.status === 'approved', detail: a.status },
    ]
    setTimeout(() => {
      const doneCount = checks.filter(c => c.done).length
      const progressEl = document.getElementById('checklist-progress')
      if (progressEl) progressEl.textContent = `${doneCount}/${checks.length} 완료`
    }, 0)
    return checks.map(ch => el('div', { style: `display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:${ch.done ? '#f0fdf4' : '#fafafa'};border:1px solid ${ch.done ? '#bbf7d0' : '#f0f0f0'}` },
      el('span', { style: `width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;${ch.done ? 'background:#22c55e;color:#fff' : 'border:2px solid #ddd;color:transparent'}` }, ch.done ? '✓' : ''),
      el('span', { style: `font-size:12px;${ch.done ? 'color:#166534;font-weight:500' : 'color:#666'}` }, ch.label),
      el('span', { style: 'font-size:10px;color:#aaa;margin-left:auto' }, ch.detail)
    ))
  }

  function transitionStatus(id) {
    const a = Store.getAssessments().find(x => x.id === id)
    if (!a) return
    const next = { draft: 'in_review', in_review: 'verified', verified: 'approved' }[a.status]
    if (!next) return
    Store.updateAssessment(id, { status: next })
    showAssessmentDetail(id)
  }

  function openAddAssessment() { createAssessmentModal() }
  function editAssessment(id) { const a = Store.getAssessments().find(x => x.id === id); if (a) createAssessmentModal(a) }

  function createAssessmentModal(a) {
    const isEdit = !!a
    const form = el('form', { onSubmit: e => { e.preventDefault(); submit() } })
    const title = el('input', { value: a?.title ?? '' })
    const year = el('input', { type: 'number', value: a?.assessment_year ?? new Date().getFullYear() - 1 })
    const authority = el('select', {},
      Store.getAgencyMaster().map(ag => el('option', { value: ag.code, selected: a?.authority_code === ag.code }, ag.name))
    )
    form.append(
      el('label', {}, '평가 제목', title),
      el('label', {}, '평가 기관', authority),
      el('label', {}, '대상 연도', year)
    )
    modal(isEdit ? '평가 수정' : '새 ESG 평가', form)
    document.getElementById('modal-save').onclick = function save() {
      const data = { title: title.value, assessment_year: parseInt(year.value), authority_code: authority.value, status: 'draft' }
      if (isEdit) {
        Store.updateAssessment(a.id, data)
        showToast('평가가 수정되었습니다.', 'success')
      } else {
        const created = Store.addAssessment(data)
        const activeIndicators = Store.getIndicators().filter(i => i.authority_code === authority.value && i.is_active !== false)
        const weightParams = Store.getWeightParams().filter(w => w.authority_code === authority.value && w.year === (parseInt(year.value) || 2026))
        activeIndicators.forEach(ind => {
          const w = weightParams.find(p => p.theme_code === Store.getIndicatorGroups().find(g => g.id === ind.group_id)?.group_code)
          Store.addAssessmentItem({ assessment_id: created.id, indicator_id: ind.id, weight_id: w?.id, weight: w?.weight || 0, status: 'pending' })
        })
        const linked = Store.autoLinkAllEvidence(created.id)
        showToast('평가가 생성되었습니다. (' + activeIndicators.length + '개 지표' + (linked > 0 ? ', 증빙 ' + linked + '건 자동 연결' : '') + ')', 'success')
      }
      closeModal()
      renderAssessments()
    }
  }

  // ==================== 지표 관리 ====================
  let _selectedAuthority = 'ECOVADIS'
  let _materialityFilter = 'all'
  let _indicatorTab = 'list'
  let _indicatorSearch = ''
  let _selectedIndicators = new Set()
  let _editingIndicator = null
  let _showQuickForm = false

  function renderIndicators() {
    const c = document.getElementById('page-indicator')
    if (!c) return
    c.innerHTML = ''
    c.append(
      el('div', { style: 'display:flex;gap:6px;margin-bottom:12px' },
        el('button', { className: 'btn' + (_indicatorTab === 'list' ? ' btn-primary' : ''), onClick: () => { _indicatorTab = 'list'; renderIndicators() } }, '📋 지표 목록'),
        el('button', { className: 'btn' + (_indicatorTab === 'mapping' ? ' btn-primary' : ''), onClick: () => { _indicatorTab = 'mapping'; renderIndicators() } }, '🔗 매핑 관리')
      ),
      _indicatorTab === 'list' ? renderIndicatorListInline() : renderIndicatorMapping()
    )
  }

  function renderIndicatorListInline() {
    const allIndicators = Store.getIndicators().filter(i => i.authority_code === _selectedAuthority)
    const groups = Indicator.getGroups(_selectedAuthority)
    const filtered = allIndicators.filter(i => {
      if (_indicatorSearch) {
        const q = _indicatorSearch.toLowerCase()
        const nameMatch = (i.indicator_name || '').toLowerCase().includes(q)
        const codeMatch = (i.indicator_code || '').toLowerCase().includes(q)
        if (!nameMatch && !codeMatch) return false
      }
      if (_materialityFilter === 'active' && i.is_active === false) return false
      if (_materialityFilter === 'inactive' && i.is_active !== false) return false
      return true
    })
    const activeCount = allIndicators.filter(i => i.is_active !== false).length

    const wrapper = el('div')

    wrapper.append(
      el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
        el('select', { id: 'authSelect', style: 'font-size:13px;padding:6px 10px;border:1px solid #ddd;border-radius:6px', onChange: () => { _selectedAuthority = document.getElementById('authSelect').value; _materialityFilter = 'all'; _indicatorSearch = ''; _selectedIndicators.clear(); renderIndicators() } },
          Store.getAgencyMaster().map(ag => el('option', { value: ag.code, selected: ag.code === _selectedAuthority }, ag.name))
        ),
        el('input', { id: 'indSearch', type: 'text', placeholder: '🔍 지표명 또는 코드 검색...', value: _indicatorSearch, style: 'flex:1;min-width:200px;font-size:13px;padding:6px 10px;border:1px solid #ddd;border-radius:6px', onInput: () => { _indicatorSearch = document.getElementById('indSearch').value; renderIndicators() } }),
        el('select', { id: 'materialityFilter', style: 'font-size:13px;padding:6px 10px;border:1px solid #ddd;border-radius:6px', onChange: () => { _materialityFilter = document.getElementById('materialityFilter').value; renderIndicators() } },
          el('option', { value: 'all', selected: _materialityFilter === 'all' }, '전체'),
          el('option', { value: 'active', selected: _materialityFilter === 'active' }, `활성 (${activeCount})`),
          el('option', { value: 'inactive', selected: _materialityFilter === 'inactive' }, `비활성 (${allIndicators.length - activeCount})`)
        ),
        el('span', { style: 'font-size:12px;color:#888' }, `${filtered.length}개 표시 / ${allIndicators.length}개 전체`)
      )
    )

    if (_selectedIndicators.size > 0) {
      wrapper.append(
        el('div', { className: 'card', style: 'padding:10px 16px;display:flex;gap:8px;align-items:center;background:#f8f6ff;border-left:3px solid #7C3AED' },
          el('span', { style: 'font-size:13px;font-weight:600' }, `${_selectedIndicators.size}개 선택됨`),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => { _selectedIndicators.forEach(id => Store.updateIndicator(id, { is_active: true })); _selectedIndicators.clear(); renderIndicators() } }, '활성화'),
          el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { _selectedIndicators.forEach(id => Store.updateIndicator(id, { is_active: false })); _selectedIndicators.clear(); renderIndicators() } }, '비활성화'),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm(`${_selectedIndicators.size}개 지표를 삭제하시겠습니까?`)) { _selectedIndicators.forEach(id => Store.deleteIndicator(id)); _selectedIndicators.clear(); showToast('지표가 삭제되었습니다.', 'success'); renderIndicators() } } }, '삭제'),
          el('button', { className: 'btn btn-sm', style: 'margin-left:auto', onClick: () => { _selectedIndicators.clear(); renderIndicators() } }, '선택 해제')
        )
      )
    }

    if (_showQuickForm) {
      wrapper.append(renderQuickIndicatorForm())
    }

    wrapper.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px' },
        el('h3', { style: 'margin:0;font-size:15px' }, `지표 관리 · ${Indicator.getAuthorityName(_selectedAuthority)}`),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { className: 'btn btn-sm', style: 'background:#f0f7ff;color:#3B82F6', onClick: () => openImportTemplate() }, '📥 템플릿 가져오기'),
          el('button', { className: 'btn btn-sm', style: 'background:#f0fff0;color:#22c55e', onClick: () => openCSVIndicatorImport() }, '📋 CSV 붙여넣기'),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => { _showQuickForm = !_showQuickForm; _editingIndicator = null; renderIndicators() } }, _showQuickForm ? '✕ 닫기' : '+ 새 지표 추가')
        )
      )
    )

    if (!filtered.length) {
      wrapper.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📋'),
          el('p', { style: 'margin:0 0 12px;color:#888' }, _indicatorSearch ? `"${_indicatorSearch}"에 대한 검색 결과가 없습니다` : '등록된 지표가 없습니다'),
          !_showQuickForm && el('button', { className: 'btn btn-primary', onClick: () => { _showQuickForm = true; _editingIndicator = null; renderIndicators() } }, '+ 첫 번째 지표 추가')
        )
      )
      return wrapper
    }

    groups.forEach(g => {
      const inds = filtered.filter(i => i.group_id === g.id)
      if (!inds.length) return
      const groupActive = inds.filter(i => i.is_active !== false).length
      wrapper.append(
        el('div', { className: 'card', style: 'padding:0;margin-bottom:12px;overflow:hidden' },
          el('div', { style: 'display:flex;align-items:center;gap:10px;padding:12px 16px;background:linear-gradient(135deg,#f8f6ff,#f0f0ff);border-bottom:2px solid #e0d8f0' },
            el('span', { style: 'font-size:18px' }, _selectedAuthority === 'ECOVADIS' ? '🌿' : _selectedAuthority === 'KSSB' ? '📜' : _selectedAuthority === 'KCGS' ? '🏢' : _selectedAuthority === 'NICE' ? '📊' : '📋'),
            el('h4', { style: 'margin:0;font-size:14px;color:#2c3e50;font-weight:700' }, Indicator.getGroupDisplayName(g)),
            el('span', { style: 'background:#7C3AED;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600' }, `${groupActive}/${inds.length}`)
          ),
          el('div', { style: 'padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px;background:#fafafa' },
            ...inds.map(ind => renderIndicatorCard(ind))
          )
        )
      )
    })

    return wrapper
  }

  function renderIndicatorCard(ind) {
    const pillarColor = ind.pillar === 'POLICY' ? '#7C3AED' : ind.pillar === 'ACTION' ? '#3B82F6' : ind.pillar === 'RESULT' ? '#10B981' : ind.pillar === 'GOVERNANCE' ? '#F59E0B' : ind.pillar === 'STRATEGY' ? '#EC4899' : ind.pillar === 'RISK_MGMT' ? '#EF4444' : '#6366F1'
    const isSelected = _selectedIndicators.has(ind.id)
    return el('div', { style: `background:#fff;border-radius:10px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.06);border-left:4px solid ${ind.is_active === false ? '#ccc' : pillarColor};${ind.is_active === false ? 'opacity:.5' : ''}${isSelected ? ';outline:2px solid #7C3AED;outline-offset:1px' : ''};cursor:pointer`, onClick: (e) => { if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; openIndicatorSlidePanel(ind) } },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px' },
        el('div', { style: 'flex:1' },
          el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px' },
            el('input', { type: 'checkbox', checked: isSelected, onChange: (e) => { e.stopPropagation(); if (isSelected) _selectedIndicators.delete(ind.id); else _selectedIndicators.add(ind.id); renderIndicators() }, onClick: (e) => e.stopPropagation(), style: 'cursor:pointer;margin:0' }),
            el('span', { style: 'font-family:monospace;font-size:11px;font-weight:700;color:#7C3AED;background:#f3f0ff;padding:2px 6px;border-radius:4px' }, ind.indicator_code),
            el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:' + (ind.pillar === 'POLICY' ? '#f3e8ff;color:#7C3AED' : ind.pillar === 'ACTION' ? '#eff6ff;color:#3B82F6' : ind.pillar === 'RESULT' ? '#ecfdf5;color:#10B981' : '#fef3c7;color:#D97706') }, ind.pillar ? Indicator.getPillarName(ind.pillar) : '-')
          ),
          el('div', { style: 'font-size:13px;font-weight:600;color:#1a1a2e;line-height:1.4' }, Indicator.getDisplayName(ind))
        ),
        el('div', { style: 'display:flex;gap:4px' },
          el('button', { className: 'btn btn-sm btn-secondary', title: '수정', onClick: (e) => { e.stopPropagation(); _editingIndicator = ind.id; _showQuickForm = true; renderIndicators() } }, '✏'),
          el('button', { className: 'btn btn-sm', title: ind.is_active !== false ? '비활성화' : '활성화', style: ind.is_active !== false ? 'background:#f0fff4;color:#10B981' : 'background:#fff5f5;color:#e74c3c', onClick: (e) => { e.stopPropagation(); Indicator.toggleActive(ind.id); renderIndicators() } }, ind.is_active !== false ? '✓' : '✗')
        )
      ),
      el('div', { style: 'display:flex;gap:6px;font-size:11px;color:#888;flex-wrap:wrap' },
        ind.dept_code ? el('span', { style: 'background:#f0f0f0;padding:2px 6px;border-radius:4px' }, ind.dept_code) : null,
        ind.review_cycle ? el('span', { style: 'background:#f0f0f0;padding:2px 6px;border-radius:4px' }, ind.review_cycle === 'annual' ? '매년' : ind.review_cycle === 'semi_annual' ? '반기' : ind.review_cycle === 'quarterly' ? '분기' : '매월') : null,
        ind.scope2_split_required ? el('span', { style: 'background:#fef3c7;padding:2px 6px;border-radius:4px;color:#D97706;font-weight:600' }, '🌍 Scope2') : null
      )
    )
  }

  function openIndicatorSlidePanel(ind) {
    const evidences = Store.getEvidences().filter(ev => {
      const tags = Store.getEvidenceTags().filter(t => t.indicator_id === ind.id)
      return tags.some(t => t.evidence_id === ev.id)
    })
    const evFileMap = {}
    evidences.forEach(ev => { evFileMap[ev.id] = Store.getEvidenceFiles(ev.id) })
    if (!window._indFileStore) window._indFileStore = {}
    evidences.forEach(ev => { (evFileMap[ev.id] || []).forEach((f, i) => { window._indFileStore[ev.id + '_' + i] = f }) })
    const groups = Indicator.getGroups(ind.authority_code)
    const group = groups.find(g => g.id === ind.group_id)
    const statusColors = { pending: '#f59e0b', self: '#3b82f6', internal_reviewed: '#8b5cf6', externally_verified: '#10b981', confirmed: '#10b981' }
    const statusLabels = { pending: '미확인', self: '자가입력', internal_reviewed: '내부검토', externally_verified: '외부검증', confirmed: '확정' }
    const evHtml = evidences.length ? evidences.map(ev => {
      const files = evFileMap[ev.id] || []
      const sc = statusColors[ev.status] || '#9ca3af'
      const sl = statusLabels[ev.status] || ev.status || '-'
      const fileBtns = files.map((f, fi) => `<span style="display:inline-flex;gap:3px;margin-left:6px"><button onclick="event.stopPropagation();var f=window._indFileStore['${ev.id}_${fi}'];if(f)window.previewEvidenceFile(f)" style="font-size:9px;padding:1px 5px;border-radius:3px;background:#f0f7ff;color:#3b82f6;border:1px solid #bfdbfe;cursor:pointer">열람</button><button onclick="event.stopPropagation();var f=window._indFileStore['${ev.id}_${fi}'];if(f)window.downloadEvidenceFile(f)" style="font-size:9px;padding:1px 5px;border-radius:3px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;cursor:pointer">다운</button></span>`).join('')
      return `<div style="display:flex;align-items:center;gap:6px;padding:7px 10px;background:#f8f9fa;border-radius:6px;margin-bottom:4px;font-size:12px;border:1px solid #eee">
        <span style="font-size:14px;flex-shrink:0">📄</span>
        <span style="flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.title || '제목 없음'}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:8px;background:${sc}18;color:${sc};flex-shrink:0">${sl}</span>
        ${files.length ? `<span style="font-size:10px;color:#7C3AED;flex-shrink:0">${files.length}파일</span>${fileBtns}` : '<span style="font-size:10px;color:#bbb;flex-shrink:0">파일 없음</span>'}
      </div>`
    }).join('') : '<div style="color:#888;font-size:12px;padding:8px 0">연결된 증빙이 없습니다.</div>'
    const tabs = [
      { id: 'detail', label: '상세정보', content: `
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-family:monospace;font-size:13px;font-weight:700;color:#7C3AED;background:#f3f0ff;padding:3px 8px;border-radius:4px">${ind.indicator_code}</span>
            <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#f3e8ff;color:#7C3AED">${ind.pillar || '-'}</span>
          </div>
          <h4 style="margin:0 0 12px;font-size:15px">${Indicator.getDisplayName(ind)}</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div style="padding:8px;background:#f8f9fa;border-radius:6px"><span style="color:#888">기관</span><br><strong>${Indicator.getAuthorityName(ind.authority_code)}</strong></div>
            <div style="padding:8px;background:#f8f9fa;border-radius:6px"><span style="color:#888">그룹</span><br><strong>${group ? Indicator.getGroupDisplayName(group) : '-'}</strong></div>
            <div style="padding:8px;background:#f8f9fa;border-radius:6px"><span style="color:#888">담당부서</span><br><strong>${ind.dept_code || '-'}</strong></div>
            <div style="padding:8px;background:#f8f9fa;border-radius:6px"><span style="color:#888">검토주기</span><br><strong>${ind.review_cycle || '-'}</strong></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:6px">
            <button class="btn btn-sm btn-primary" onclick="ESGComponents.closeSlidePanel();_editingIndicator=${ind.id};_showQuickForm=true;renderIndicators()">수정</button>
            <button class="btn btn-sm ${ind.is_active !== false ? 'btn-danger' : 'btn-success'}" onclick="Indicator.toggleActive(${ind.id});ESGComponents.closeSlidePanel();renderIndicators()">${ind.is_active !== false ? '비활성화' : '활성화'}</button>
          </div>
          <div style="margin-top:16px;border-top:1px solid #eee;padding-top:12px">
            <div style="font-weight:600;font-size:13px;margin-bottom:8px">📎 연결 증빙 (${evidences.length}건)</div>
            ${evHtml}
          </div>
        </div>` },
      { id: 'history', label: '변경이력', content: ESGComponents.changeLogTimeline('indicators', ind.id) },
      { id: 'share', label: '공유', content: ESGComponents.shareLinkPanel('INDICATOR', ind.id, ind.indicator_code) }
    ]
    ESGComponents.openSlidePanel(`지표 · ${ind.indicator_code}`, tabs, 'detail')
  }

  function renderQuickIndicatorForm() {
    const isEdit = _editingIndicator != null && _editingIndicator !== '__new__'
    const ind = isEdit ? Store.getIndicators().find(i => i.id === _editingIndicator) : null
    const groups = Indicator.getGroups(_selectedAuthority)
    const pillarOptions = Indicator.getPillarOptions(_selectedAuthority)
    const depts = Store.getDepartments().filter(d => d.is_active !== false)

    const nameInput = el('input', { value: ind?.indicator_name ?? '', required: true, placeholder: '지표 이름을 입력하세요', style: 'font-size:13px;padding:7px 10px;border:1px solid #ddd;border-radius:6px;width:100%' })
    const pillarSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #ddd;border-radius:6px;width:100%' },
      el('option', { value: '' }, '-- 필러 선택 --'),
      ...pillarOptions.map(p => el('option', { value: p, selected: ind?.pillar === p }, Indicator.getPillarName(p)))
    )
    const groupSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #ddd;border-radius:6px;width:100%' },
      el('option', { value: '' }, '-- 그룹 선택 --'),
      ...groups.map(g => el('option', { value: g.id, selected: ind?.group_id === g.id }, Indicator.getGroupDisplayName(g)))
    )
    const deptSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #ddd;border-radius:6px;width:100%' },
      el('option', { value: '' }, '-- 담당부서 --'),
      ...depts.map(d => el('option', { value: d.dept_code, selected: ind?.dept_code === d.dept_code }, d.dept_name))
    )
    const cycleSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #ddd;border-radius:6px;width:100%' },
      [['annual', '매년'], ['semi_annual', '반기'], ['quarterly', '분기'], ['monthly', '매월']].map(([v, l]) => el('option', { value: v, selected: ind?.review_cycle === v }, l))
    )
    const scope2Check = el('input', { type: 'checkbox', checked: ind?.scope2_split_required === true, style: 'cursor:pointer' })

    const card = el('div', { className: 'card', style: 'border-left:3px solid #7C3AED;background:#fafbff;margin-bottom:12px' },
      el('div', { style: 'padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e0d8f0' },
        el('h4', { style: 'margin:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, isEdit ? `✏ ${ind?.indicator_code || ''}` : '+ 새 지표 추가'),
        el('button', { className: 'btn btn-sm', onClick: () => { _showQuickForm = false; _editingIndicator = null; renderIndicators() } }, '✕')
      ),
      el('div', { style: 'padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('div', { style: 'grid-column:1/3' },
          el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '지표명 *'),
          nameInput
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '필러 유형'),
          pillarSel
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '그룹'),
          groupSel
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '담당부서'),
          deptSel
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '검토주기'),
          cycleSel
        ),
        el('div', { style: 'grid-column:1/3;display:flex;align-items:center;gap:8px' },
          scope2Check,
          el('label', { style: 'font-size:12px;color:#555;cursor:pointer' }, '🌍 Scope2 이중보고 대상 (location-based / market-based)')
        )
      ),
      el('div', { style: 'padding:8px 16px 12px;display:flex;gap:6px;justify-content:flex-end' },
        el('button', { className: 'btn btn-secondary btn-sm', onClick: () => { _showQuickForm = false; _editingIndicator = null; renderIndicators() } }, '취소'),
        el('button', { className: 'btn btn-primary btn-sm', onClick: () => {
          if (!nameInput.value.trim()) return alert('지표명을 입력하세요')
          const data = {
            authority_code: _selectedAuthority,
            indicator_name: nameInput.value.trim(),
            pillar: pillarSel.value || null,
            group_id: parseInt(groupSel.value) || groups[0]?.id,
            dept_code: deptSel.value,
            review_cycle: cycleSel.value,
            scope2_split_required: scope2Check.checked,
            is_active: true
          }
          if (isEdit && ind) { Store.updateIndicator(ind.id, data); showToast('지표가 수정되었습니다.', 'success') }
          else { Store.addIndicator(data); showToast('지표가 추가되었습니다.', 'success') }
          _showQuickForm = false; _editingIndicator = null; renderIndicators()
        } }, isEdit ? '💾 저장' : '+ 추가')
      )
    )
    return card
  }

  function openImportTemplate() {
    const templates = {
      'ECOVADIS': { name: 'EcoVadis 18개 골격', desc: '환경(5), 인권/사회(4), 윤리(4), 지속가능조달(4), 360도(1)' },
      'KSSB': { name: 'KSSB 한국형 기준', desc: '거버넌스/전략/리스크관리/측정 (제1호/제2호)' },
      'KCGS': { name: 'KCGS 통합보고 기준', desc: '지배구조/사회/환경' },
      'NICE': { name: 'NICE ESG 평가', desc: '환경/사회/지배구조' },
      'K-ESG': { name: 'K-ESG 기업환경책임', desc: 'E1/E2/S1/S2/G1/G2' }
    }
    const form = el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      el('p', { style: 'margin:0;font-size:13px;color:#666' }, '기준 템플릿에서 표준 지표를 가져옵니다.'),
      ...Object.entries(templates).map(([code, t]) => {
        const existing = Store.getIndicators().filter(i => i.authority_code === code).length
        return el('div', { style: `padding:10px 12px;border:1px solid ${existing > 0 ? '#ddd' : '#7C3AED33'};border-radius:8px;background:${existing > 0 ? '#f9f9f9' : '#fafbff'};display:flex;justify-content:space-between;align-items:center` },
          el('div', {},
            el('div', { style: 'font-weight:600;font-size:13px' }, `${Indicator.getAuthorityName(code)} — ${t.name}`),
            el('div', { style: 'font-size:11px;color:#888;margin-top:2px' }, `${t.desc} (현재 ${existing}개)`)
          ),
          el('button', { className: `btn btn-sm ${existing > 0 ? 'btn-secondary' : 'btn-primary'}`, onClick: () => {
            if (existing > 0) return alert('이미 등록된 기관입니다.')
            _selectedAuthority = code
            closeModal(); renderIndicators()
          } }, existing > 0 ? '등록됨' : '가져오기')
        )
      })
    )
    modal('📥 템플릿에서 지표 가져오기', form)
    document.getElementById('modal-save').style.display = 'none'
  }

  function openCSVIndicatorImport() {
    const form = el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
      el('p', { style: 'margin:0;font-size:12px;color:#666' }, '엑셀/CSV에서 복사한 테이블을 붙여넣으세요. 헤더: 지표코드 | 지표명 | 필러 | 담당부서 | 검토주기'),
      el('textarea', { id: 'csvIndInput', rows: 8, placeholder: '지표코드\t지표명\t필러\t담당부서\t검토주기\nMY-ENV-01\t온실가스 배출량 관리\tRESULT\t환경팀\tannual\nMY-SOC-01\t인재육성체계\tACTION\t인사팀\tannual', style: 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-family:monospace;font-size:11px;box-sizing:border-box' }),
      el('div', { id: 'csvIndPreview', style: 'font-size:11px;color:#888' })
    )
    modal('📥 CSV 붙여넣기 일괄등록', form)
    document.getElementById('modal-save').onclick = () => {
      const raw = document.getElementById('csvIndInput').value
      if (!raw.trim()) return alert('데이터를 입력하세요.')
      const lines = raw.trim().split('\n').filter(l => l.trim())
      const pillarMap = { 'POLICY': 'POLICY', 'policy': 'POLICY', 'ACTION': 'ACTION', 'action': 'ACTION', 'RESULT': 'RESULT', 'result': 'RESULT', '정책': 'POLICY', '실행': 'ACTION', '성과': 'RESULT', '거버넌스': 'GOVERNANCE', '전략': 'STRATEGY', '리스크': 'RISK_MGMT', '측정': 'METRICS' }
      const cycleMap = { 'annual': 'annual', '분기': 'quarterly', 'quarterly': 'quarterly', '반기': 'semi_annual', 'semi_annual': 'semi_annual', '월간': 'monthly', 'monthly': 'monthly' }
      let added = 0
      lines.forEach((line, idx) => {
        if (idx === 0 && (line.includes('지표코드') || line.includes('code') || line.includes('Code'))) return
        const cols = line.split('\t').map(c => c.trim()).filter(Boolean)
        if (cols.length < 2) return
        const [code, name, pillarRaw, dept, cycleRaw] = cols
        const pillar = pillarMap[pillarRaw] || 'RESULT'
        const cycle = cycleMap[cycleRaw] || 'annual'
        Store.addIndicator({ authority_code: _selectedAuthority, indicator_code: code, indicator_name: name, pillar, dept_code: dept || '', review_cycle: cycle, is_active: true, scope2_split_required: false, materiality_optional: false })
        added++
      })
      if (added > 0) { showToast(`${added}개 지표가 등록되었습니다.`, 'success'); closeModal(); renderIndicators() }
      else alert('유효한 데이터가 없습니다. 탭으로 구분된 형식인지 확인하세요.')
    }
  }

  // ==================== 증빙 관리 ====================
  let _evidenceAssId = null

  function renderIndicatorMapping() {
    const mappings = Store.getIndicatorMappings()
    const allIndicators = Store.getIndicators()
    const container = el('div', { className: 'card' },
      el('div', { className: 'card-header' },
        el('h3', {}, `지표 매핑 관리 (${mappings.length}개 매핑)`),
        el('button', { className: 'btn btn-primary', onClick: openAddMapping }, '+ 매핑 추가')
      )
    )
    if (!mappings.length) {
      container.append(el('p', { style: 'padding:20px;color:#999;text-align:center' }, '등록된 매핑이 없습니다. 기관 간 지표 매핑을 추가하세요.'))
    } else {
      const rows = mappings.map(m => {
        const srcInd = allIndicators.find(i => i.id === m.source_indicator_id)
        const tgtInd = allIndicators.find(i => i.id === m.target_indicator_id)
        const confColors = { high: '#27ae60', medium: '#f39c12', low: '#e74c3c' }
        const confLabels = { high: '높음', medium: '보통', low: '낮음' }
        const typeLabels = { direct: '직접', expanded: '확장', indirect: '간접' }
        return el('tr', {},
          el('td', { style: 'font-size:12px' }, srcInd ? `${Indicator.getAuthorityName(srcInd.authority_code)} - ${srcInd.indicator_code}` : '?'),
          el('td', { style: 'font-size:12px' }, srcInd ? Indicator.getDisplayName(srcInd) : '?'),
          el('td', { style: 'text-align:center;font-size:16px;color:#7C3AED' }, '→'),
          el('td', { style: 'font-size:12px' }, tgtInd ? `${Indicator.getAuthorityName(tgtInd.authority_code)} - ${tgtInd.indicator_code}` : '?'),
          el('td', { style: 'font-size:12px' }, tgtInd ? Indicator.getDisplayName(tgtInd) : '?'),
          el('td', { style: 'text-align:center;font-size:12px' }, typeLabels[m.mapping_type] || m.mapping_type),
          el('td', { style: 'text-align:center' },
            el('span', { style: `padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${confColors[m.confidence] || '#ccc'}20;color:${confColors[m.confidence] || '#888'}` }, confLabels[m.confidence] || m.confidence || '-')
          ),
          el('td', { style: 'text-align:center' },
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('매핑을 삭제하시겠습니까?')) { Store.deleteIndicatorMapping(m.id); showToast('매핑이 삭제되었습니다.', 'success'); renderIndicators() } } }, '삭제')
          )
        )
      })
      container.append(
        el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' },
          el('thead', {}, el('tr', {},
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #e0d8f0' }, '원본 기관-코드'),
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #e0d8f0' }, '원본 지표명'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #e0d8f0;width:40px' }, ''),
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #e0d8f0' }, '대상 기관-코드'),
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #e0d8f0' }, '대상 지표명'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #e0d8f0' }, '유형'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #e0d8f0' }, '신뢰도'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #e0d8f0' }, '관리')
          )),
          el('tbody', {}, ...rows)
        )
      )
    }
    return container
  }

  function openAddMapping() {
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const allIndicators = Store.getIndicators().filter(i => i.is_active !== false)
    const srcAuth = el('select', { onChange: () => updateMappingIndicators() },
      Store.getAgencyMaster().map(ag => el('option', { value: ag.code }, ag.name))
    )
    const srcInd = el('select', { id: 'mapping-src-ind' })
    const tgtAuth = el('select', { onChange: () => updateMappingIndicators() },
      Store.getAgencyMaster().map(ag => el('option', { value: ag.code }, ag.name))
    )
    const tgtInd = el('select', { id: 'mapping-tgt-ind' })
    const mapType = el('select', {},
      el('option', { value: 'direct' }, '직접 (direct)'),
      el('option', { value: 'expanded' }, '확장 (expanded)'),
      el('option', { value: 'indirect' }, '간접 (indirect)')
    )
    const confidence = el('select', {},
      el('option', { value: 'high' }, '높음'),
      el('option', { value: 'medium' }, '보통'),
      el('option', { value: 'low' }, '낮음')
    )
    function updateMappingIndicators() {
      const srcList = allIndicators.filter(i => i.authority_code === srcAuth.value)
      const tgtList = allIndicators.filter(i => i.authority_code === tgtAuth.value)
      srcInd.innerHTML = ''
      tgtInd.innerHTML = ''
      srcList.forEach(i => srcInd.append(el('option', { value: i.id }, `${i.indicator_code} - ${Indicator.getDisplayName(i)}`)))
      tgtList.forEach(i => tgtInd.append(el('option', { value: i.id }, `${i.indicator_code} - ${Indicator.getDisplayName(i)}`)))
    }
    updateMappingIndicators()
    form.append(
      el('div', { style: 'display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end' },
        el('div', { className: 'form-group' }, el('label', {}, '원본 기관'), srcAuth, el('label', { style: 'margin-top:6px;display:block' }, '원본 지표'), srcInd),
        el('div', { style: 'padding-bottom:8px;font-size:20px;color:#7C3AED' }, '→'),
        el('div', { className: 'form-group' }, el('label', {}, '대상 기관'), tgtAuth, el('label', { style: 'margin-top:6px;display:block' }, '대상 지표'), tgtInd)
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        el('div', { className: 'form-group' }, el('label', {}, '매핑 유형'), mapType),
        el('div', { className: 'form-group' }, el('label', {}, '신뢰도'), confidence)
      )
    )
    modal('지표 매핑 추가', form)
    document.getElementById('modal-save').onclick = () => {
      if (!srcInd.value || !tgtInd.value) return alert('원본과 대상 지표를 모두 선택하세요')
      Store.addIndicatorMapping({
        source_authority: srcAuth.value,
        source_indicator_id: parseInt(srcInd.value),
        target_authority: tgtAuth.value,
        target_indicator_id: parseInt(tgtInd.value),
        mapping_type: mapType.value,
        confidence: confidence.value
      })
      showToast('매핑이 추가되었습니다.', 'success')
      closeModal(); renderIndicators()
    }
  }

  // Indicator functions now inline in renderIndicatorListInline

  function renderEvidenceMgmt() {
    const c = document.getElementById('page-evidence')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📎'),
          el('h3', { style: 'margin:0 0 8px' }, '증빙을 관리하려면 평가를 먼저 생성하세요'),
          el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, '증빙 문서는 평가별 55건까지 등록 가능합니다.'),
          el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
        )
      )
      return
    }
    _evidenceAssId = _evidenceAssId || assessments[0].id
    if (!assessments.find(a => a.id === _evidenceAssId)) _evidenceAssId = assessments[0].id
    const evidences = Evidence.getAll(_evidenceAssId)
    const searchQuery = _evidenceSearchQuery || ''

    const today = new Date()
    const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
    const expiringSoon = evidences.filter(ev => {
      if (!ev.expiry_date) return false
      const exp = new Date(ev.expiry_date)
      return exp >= today && exp <= thirtyDaysLater
    })
    const expired = evidences.filter(ev => {
      if (!ev.expiry_date) return false
      return new Date(ev.expiry_date) < today
    })
    const pendingReview = evidences.filter(ev => ev.status === 'pending' || ev.status === 'self')

    const todoCard = el('div', { className: 'card', style: 'padding:12px 16px;margin-bottom:12px;background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%)' },
      el('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
        el('span', { style: 'font-size:13px;font-weight:600;color:#92400e' }, '📋 오늘 할 일'),
        expiringSoon.length ? el('span', { style: 'font-size:11px;padding:3px 8px;border-radius:12px;background:#f59e0b;color:#fff' }, `만료임박 ${expiringSoon.length}건`) : null,
        expired.length ? el('span', { style: 'font-size:11px;padding:3px 8px;border-radius:12px;background:#ef4444;color:#fff' }, `만료됨 ${expired.length}건`) : null,
        pendingReview.length ? el('span', { style: 'font-size:11px;padding:3px 8px;border-radius:12px;background:#3b82f6;color:#fff' }, `검토대기 ${pendingReview.length}건`) : null,
        !expiringSoon.length && !expired.length && !pendingReview.length ? el('span', { style: 'font-size:11px;color:#92400e' }, '✅ 특이사항 없음') : null
      )
    )
    c.append(todoCard)

    const statusCounts = Evidence.countByStatus(_evidenceAssId)
    const total = statusCounts.total || 1
    const confirmedRate = Math.round(((statusCounts.confirmed || 0) + (statusCounts.externally_verified || 0)) / total * 100)
    const confidenceColor = confirmedRate >= 80 ? '#10b981' : confirmedRate >= 50 ? '#f59e0b' : '#ef4444'

    const gaugeCard = el('div', { className: 'card', style: 'padding:12px 16px;margin-bottom:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
      el('span', { style: 'font-size:13px;font-weight:600;color:#333' }, '📊 신뢰도'),
      el('div', { style: 'flex:1;min-width:120px;max-width:200px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden' },
        el('div', { style: `width:${confirmedRate}%;height:100%;background:${confidenceColor};border-radius:4px;transition:width .3s` })
      ),
      el('span', { style: `font-size:13px;font-weight:700;color:${confidenceColor}` }, `${confirmedRate}%`),
      el('span', { style: 'font-size:11px;color:#888' }, `(${statusCounts.confirmed || 0}건 확정 / ${statusCounts.total || 0}건 전체)`),
      statusCounts.pending > 0 ? el('button', { className: 'btn btn-sm', style: 'font-size:11px;background:#fef3c7;color:#92400e;border:1px solid #fcd34d', onClick: () => {
        if (!confirm(statusCounts.pending + '건의 미확인 증빙을 일괄 확정하시겠습니까?\n(상태: 자가입력 → 확정)')) return
        evidences.forEach(ev => { if (ev.status === 'self' || ev.status === 'pending') Store.updateEvidence(ev.id, { status: 'confirmed' }) })
        showToast('일괄 확정이 완료되었습니다.', 'success')
        renderEvidenceMgmt()
      } }, '✅ 일괄확정') : null
    )
    c.append(gaugeCard)

    c.append(
      el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
        el('h3', { style: 'margin:0;font-size:15px;white-space:nowrap' }, '📎 증빙 관리'),
        el('select', { id: 'evAssSelect', style: 'font-size:13px;padding:6px 10px;border:1px solid #ddd;border-radius:6px', onChange: () => { _evidenceAssId = parseInt(document.getElementById('evAssSelect').value); renderEvidenceMgmt() } },
          ...assessments.map(a => el('option', { value: a.id, selected: a.id === _evidenceAssId }, a.title))
        ),
        el('input', { id: 'evSearch', type: 'text', placeholder: '🔍 제목/유형/태그 검색...', value: searchQuery, style: 'flex:1;min-width:200px;font-size:13px;padding:6px 10px;border:1px solid #ddd;border-radius:6px', onInput: () => { _evidenceSearchQuery = document.getElementById('evSearch').value; renderEvidenceMgmt() } }),
        el('span', { style: 'font-size:12px;color:#888' }, `${evidences.length}건`),
        el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_evidenceViewMode === 'list' ? '#7C3AED' : '#f0f0f0'};color:${_evidenceViewMode === 'list' ? '#fff' : '#666'};border:1px solid ${_evidenceViewMode === 'list' ? '#7C3AED' : '#ddd'}`, onClick: () => { _evidenceViewMode = 'list'; renderEvidenceMgmt() } }, '📋 목록'),
        el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_evidenceViewMode === 'gantt' ? '#7C3AED' : '#f0f0f0'};color:${_evidenceViewMode === 'gantt' ? '#fff' : '#666'};border:1px solid ${_evidenceViewMode === 'gantt' ? '#7C3AED' : '#ddd'}`, onClick: () => { _evidenceViewMode = 'gantt'; renderEvidenceMgmt() } }, '📊 간트차트'),
        el('button', { className: 'btn btn-primary btn-sm', onClick: openAddEvidence }, '+ 증빙 추가'),
        el('button', { className: 'btn btn-sm', style: 'font-size:11px;background:#f0f7ff;color:#3b82f6;border:1px solid #bfdbfe', onClick: () => {
          if (!confirm('이전 평가의 증빙을 현재 평가로 복제하시겠습니까?\n(이미 동일 제목의 증빙은 건너뜁니다)')) return
          const otherAssessments = assessments.filter(a => a.id !== _evidenceAssId)
          if (!otherAssessments.length) { alert('복제할 이전 평가가 없습니다.'); return }
          const sourceId = otherAssessments[otherAssessments.length - 1].id
          const count = Evidence.cloneLastYearEvidences(sourceId, _evidenceAssId)
          showToast(`${count}건의 증빙이 복제되었습니다.`, 'success')
          renderEvidenceMgmt()
        } }, '📋 이전 평가에서 복제')
      )
    )

    const dropZone = el('div', {
      id: 'ev-dropzone',
      style: 'border:2px dashed #c3cdda;border-radius:12px;background:#fbfcfd;padding:28px 20px;text-align:center;margin-bottom:14px;transition:border-color .15s,background .15s;cursor:pointer',
      onDragEnter: e => { e.preventDefault(); dropZone.style.borderColor = '#7C3AED'; dropZone.style.background = '#f5f0ff' },
      onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
      onDragLeave: e => { if (!dropZone.contains(e.relatedTarget)) { dropZone.style.borderColor = '#c3cdda'; dropZone.style.background = '#fbfcfd' } },
      onDrop: e => { e.preventDefault(); dropZone.style.borderColor = '#c3cdda'; dropZone.style.background = '#fbfcfd'; _handleEvidenceFileDrop(e.dataTransfer.files) },
      onClick: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.csv,.txt,.pptx'; inp.onchange = () => _handleEvidenceFileDrop(inp.files); inp.click() }
    },
      el('div', { style: 'font-size:28px;margin-bottom:6px' }, '📥'),
      el('div', { style: 'font-size:13px;color:#666' }, '여기로 파일을 끌어다 놓으세요 — '),
      el('span', { style: 'font-size:13px;color:#7C3AED;font-weight:600' }, '여러 개 동시 업로드 가능'),
      el('div', { style: 'font-size:11px;color:#aaa;margin-top:4px' }, 'PDF, Excel, Word, 이미지 등 (최대 10MB)')
    )
    c.append(dropZone)

    const filteredEvidences = evidences.filter(ev => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      if ((ev.title || '').toLowerCase().includes(q)) return true
      if ((ev.file_type || '').toLowerCase().includes(q)) return true
      const tags = Evidence.getTags(ev.id)
      for (const t of tags) {
        const ind = Store.getIndicators().find(i => i.id === t.indicator_id)
        if (ind && (ind.indicator_code || '').toLowerCase().includes(q)) return true
      }
      return false
    })

    if (!filteredEvidences.length) {
      c.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📄'),
          el('p', { style: 'margin:0 0 12px;color:#888' }, searchQuery ? `"${searchQuery}" 검색 결과 없음` : '등록된 증빙이 없습니다'),
          !searchQuery ? el('button', { className: 'btn btn-primary', onClick: openAddEvidence }, '+ 첫 증빙 추가') : null
        )
      )
      return
    }

    const fileLabels = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word', img: '이미지', etc: '기타' }
    const statusLabels = { pending: '미확인', self: '자가입력', internal_reviewed: '내부검토', externally_verified: '외부검증', confirmed: '확정' }
    const statusColors = { pending: '#f59e0b', self: '#3b82f6', internal_reviewed: '#8b5cf6', externally_verified: '#10b981', confirmed: '#10b981', expired: '#ef4444', missing: '#9ca3af' }
    const fileIcons = { pdf: '📄', xlsx: '📊', docx: '📝', img: '🖼', etc: '📁' }

    if (_evidenceViewMode === 'gantt') {
      c.append(renderEvidenceGantt(filteredEvidences))
      return
    }

    const listCard = el('div', { className: 'card', style: 'padding:0;overflow:hidden' })

    filteredEvidences.forEach((ev, idx) => {
      const files = Store.getEvidenceFiles(ev.id)
      const tags = Evidence.getTags(ev.id)
      const tagCodes = tags.map(t => { const ind = Store.getIndicators().find(i => i.id === t.indicator_id); return ind ? ind.indicator_code : null }).filter(Boolean)
      const isExpanded = _evidencePreviewId === ev.id

      const row = el('div', { style: `border-bottom:1px solid #f0f0f0;${idx === filteredEvidences.length - 1 ? 'border-bottom:none' : ''}` },
        el('div', {
          style: `display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .15s;${isExpanded ? 'background:#f8f6ff' : ''}`,
          onMouseEnter: e => { if (!isExpanded) e.currentTarget.style.background = '#f9f9f9' },
          onMouseLeave: e => { if (!isExpanded) e.currentTarget.style.background = '' },
          onClick: () => { _evidencePreviewId = isExpanded ? null : ev.id; renderEvidenceMgmt() }
        },
          el('span', { style: 'font-size:11px;color:#bbb;min-width:20px' }, `${idx + 1}`),
          el('span', { style: 'font-size:18px;flex-shrink:0' }, fileIcons[ev.file_type] || '📁'),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-size:13px;font-weight:600;color:#1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, ev.title),
            el('div', { style: 'display:flex;gap:6px;align-items:center;margin-top:3px;flex-wrap:wrap' },
              el('span', { style: `font-size:10px;padding:2px 6px;border-radius:4px;background:${statusColors[ev.status] || '#9ca3af'}15;color:${statusColors[ev.status] || '#9ca3af'};font-weight:500` }, statusLabels[ev.status] || ev.status || '미확인'),
              el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#f0f0f0;color:#666' }, fileLabels[ev.file_type] || ev.file_type || '-'),
              files.length > 0 ? el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#7C3AED10;color:#7C3AED' }, `${files.length}파일`) : null,
              ev.contains_sensitive_data ? el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#ef444410;color:#ef4444' }, '🔒') : null
            )
          ),
          tagCodes.length ? el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap;max-width:200px' },
            ...tagCodes.slice(0, 3).map(code => el('span', { style: 'font-size:9px;padding:1px 4px;border-radius:3px;background:#f0f7ff;color:#3b82f6;font-family:monospace' }, code)),
            tagCodes.length > 3 ? el('span', { style: 'font-size:9px;color:#aaa' }, `+${tagCodes.length - 3}`) : null
          ) : null,
          el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px', onClick: (e) => { e.stopPropagation(); _evidencePreviewId = ev.id; renderEvidenceMgmt() } }, '수정'),
          el('button', { className: 'btn btn-sm', style: 'font-size:11px;color:#e74c3c', onClick: (e) => { e.stopPropagation(); if (confirm('삭제?')) { Store.deleteEvidence(ev.id); if (_evidencePreviewId === ev.id) _evidencePreviewId = null; showToast('증빙이 삭제되었습니다.', 'success'); renderEvidenceMgmt() } } }, '✕')
        )
      )

      if (isExpanded) {
        row.append(renderEvidenceExpand(ev, assessments))
      }

      listCard.append(row)
    })

    c.append(listCard)
  }

  function renderEvidenceExpand(ev, assessments) {
    const allIndicators = Store.getIndicators() || []
    const tags = Evidence.getTags(ev.id)
    const tagIndicatorIds = tags.map(t => t.indicator_id)
    const files = Store.getEvidenceFiles(ev.id)
    const fileLabels = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word', img: '이미지', etc: '기타' }
    const statusLabels = { self: '자가입력', internal_reviewed: '내부검토', externally_verified: '외부검증' }
    const fileIcons = { pdf: '📄', xlsx: '📊', docx: '📝', img: '🖼', etc: '📁' }

    const detail = el('div', { style: 'padding:12px 16px 16px 48px;background:#fafbff;border-top:1px solid #e8e4f0' },
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px' },
        el('div', {},
          el('label', { style: 'font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '제목'),
          el('input', { id: 'evEditTitle', type: 'text', value: ev.title || '', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' })
        ),
        el('div', {},
          el('label', { style: 'font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '유형'),
          el('select', { id: 'evEditType', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' },
            ...Object.entries(fileLabels).map(([k, v]) => el('option', { value: k, selected: k === ev.file_type }, v))
          )
        ),
        el('div', {},
          el('label', { style: 'font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '검증상태'),
          el('select', { id: 'evEditStatus', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' },
            ...Object.entries(statusLabels).map(([k, v]) => el('option', { value: k, selected: k === ev.status }, v))
          )
        )
      ),
      el('div', { style: 'margin-bottom:12px' },
        el('label', { style: 'font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px' }, '태그 (지표 연결)'),
        el('div', { id: 'evEditTags', style: 'display:flex;flex-wrap:wrap;gap:4px;padding:6px;border:1px solid #ddd;border-radius:5px;min-height:32px;align-items:center' },
          ...tags.map(t => {
            const ind = allIndicators.find(i => i.id === t.indicator_id)
            if (!ind) return null
            return el('span', { style: 'display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:10px;background:#7C3AED;color:#fff;cursor:default' },
              el('span', {}, ind.indicator_code),
              el('button', { style: 'background:none;border:none;color:#fff;cursor:pointer;font-size:10px;padding:0;line-height:1', onClick: () => {
                Evidence.untag(ev.id, ind.id)
                renderEvidenceMgmt()
              } }, '×')
            )
          }).filter(Boolean),
          el('button', { id: 'evAddTagBtn', style: 'display:inline-flex;align-items:center;font-size:10px;padding:2px 6px;border-radius:10px;background:#f0f0f0;color:#666;cursor:pointer;border:1px dashed #ccc', onClick: (e) => {
            e.stopPropagation()
            const existing = document.getElementById('evTagDropdown')
            if (existing) { existing.remove(); return }
            const untagged = allIndicators.filter(i => !tagIndicatorIds.includes(i.id))
            if (!untagged.length) return
            const dd = el('div', { id: 'evTagDropdown', style: 'position:absolute;z-index:100;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-height:200px;overflow-y:auto;padding:4px;width:180px' },
              ...untagged.slice(0, 20).map(ind => el('div', { style: 'font-size:11px;padding:4px 8px;cursor:pointer;border-radius:4px', onMouseEnter: e => e.currentTarget.style.background='#f5f5f5', onMouseLeave: e => e.currentTarget.style.background='', onClick: (ev2) => { ev2.stopPropagation(); Evidence.tag(ev.id, ind.id); renderEvidenceMgmt() } },
                el('span', { style: 'font-family:monospace;color:#7C3AED;margin-right:4px' }, ind.indicator_code),
                el('span', { style: 'color:#333' }, ind.indicator_name)
              ))
            )
            const btn = document.getElementById('evAddTagBtn')
            if (btn) btn.parentElement.appendChild(dd)
            setTimeout(() => document.addEventListener('click', function handler() { dd.remove(); document.removeEventListener('click', handler) }, { once: true }), 0)
          } }, '+ 지표')
        )
      ),
      el('div', { style: 'margin-bottom:12px;padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0' },
        el('div', { style: 'font-weight:600;font-size:11px;color:#166534;margin-bottom:6px' }, '📋 프로젝트 정보'),
        el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px' },
          el('div', {}, el('span', { style: 'color:#888' }, '담당자: '), el('strong', {}, ev.assignee || '미지정')),
          el('div', {}, el('span', { style: 'color:#888' }, '부서: '), el('strong', {}, ev.department || '미지정')),
          el('div', {}, el('span', { style: 'color:#888' }, '업무: '), el('strong', {}, ev.task_type || '-')),
          el('div', {}, el('span', { style: 'color:#888' }, '우선순위: '), el('strong', { style: `color:${ev.priority === '높음' ? '#ef4444' : ev.priority === '낮음' ? '#3b82f6' : '#333'}` }, ev.priority || '보통')),
          el('div', {}, el('span', { style: 'color:#888' }, '시작: '), el('strong', {}, ev.start_date || '-')),
          el('div', {}, el('span', { style: 'color:#888' }, '마감: '), el('strong', { style: ev.due_date && new Date(ev.due_date) < new Date() ? 'color:#ef4444' : '' }, ev.due_date || '-'))
        ),
        ev.progress > 0 ? el('div', { style: 'margin-top:6px;display:flex;align-items:center;gap:6px' },
          el('div', { style: 'flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden' },
            el('div', { style: `width:${ev.progress}%;height:100%;background:#16a34a;border-radius:3px;transition:width .3s` })
          ),
          el('span', { style: 'font-size:10px;color:#166534;font-weight:600' }, ev.progress + '%')
        ) : null
      ),
      el('div', { style: 'margin-bottom:12px' },
        el('label', { style: 'font-size:11px;font-weight:600;color:#555;display:block;margin-bottom:4px' }, '첨부파일'),
        el('div', {
          id: 'ev-file-drop-' + ev.id,
          style: 'border:2px dashed #d0d5dd;border-radius:8px;padding:14px;text-align:center;font-size:12px;color:#888;margin-bottom:8px;transition:border-color .15s,background .15s;cursor:pointer',
          onDragEnter: e => { e.preventDefault(); e.currentTarget.style.borderColor = '#7C3AED'; e.currentTarget.style.background = '#f5f0ff' },
          onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
          onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) { e.currentTarget.style.borderColor = '#d0d5dd'; e.currentTarget.style.background = '' } },
          onDrop: e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = '#d0d5dd'; e.currentTarget.style.background = ''; _handleEvidenceInlineFileDrop(ev.id, e.dataTransfer.files) },
          onClick: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.csv,.txt,.pptx'; inp.onchange = () => _handleEvidenceInlineFileDrop(ev.id, inp.files); inp.click() }
        }, '📎 여기에 파일을 끌어다 놓거나 클릭하여 첨부'),
        files.length ? el('div', { style: 'display:flex;flex-direction:column;gap:4px' },
          ...files.map(f => el('div', { style: 'display:flex;align-items:center;gap:6px;padding:6px 8px;background:#f8f9fa;border-radius:6px;font-size:11px;border:1px solid #eee' },
            el('span', { style: 'font-size:14px;flex-shrink:0' }, fileIcons[f.file_type] || '📁'),
            el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500' }, f.original_name || f.file_name),
            el('span', { style: 'color:#aaa;font-size:10px;flex-shrink:0' }, f.file_size ? (f.file_size / 1024).toFixed(0) + 'KB' : ''),
            el('button', { style: 'background:#f0f7ff;color:#3b82f6;border:1px solid #bfdbfe;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0', onClick: () => _previewEvidenceFile(f) }, '열람'),
            el('button', { style: 'background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0', onClick: () => _downloadEvidenceFile(f) }, '다운'),
            el('button', { style: 'background:none;border:none;color:#e74c3c;cursor:pointer;font-size:12px;padding:2px 4px;flex-shrink:0', onClick: () => { if (confirm('이 파일을 삭제하시겠습니까?')) { Store.deleteEvidenceFile(f.id); renderEvidenceMgmt() } } }, '✕')
          ))
        ) : el('div', { style: 'font-size:11px;color:#aaa;padding:4px 0' }, '첨부된 파일이 없습니다')
      ),
      el('div', { style: 'display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap' },
        tags.length ? el('div', { style: 'flex:1;display:flex;gap:4px;flex-wrap:wrap;align-items:center' },
          el('span', { style: 'font-size:10px;color:#888' }, '바로가기:'),
          ...tags.slice(0, 5).map(t => {
            const ind = allIndicators.find(i => i.id === t.indicator_id)
            return ind ? _jumpBtn('indicator', ind.indicator_code) : null
          }).filter(Boolean),
          ev.assessment_id ? _jumpBtn('assessment', '평가 상세', ev.assessment_id) : null
        ) : null,
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { _evidencePreviewId = null; renderEvidenceMgmt() } }, '닫기'),
        el('button', { className: 'btn btn-sm btn-primary', onClick: () => {
          const title = document.getElementById('evEditTitle').value
          const fileType = document.getElementById('evEditType').value
          const status = document.getElementById('evEditStatus').value
          Store.updateEvidence(ev.id, { title, file_type: fileType, status })
          _evidencePreviewId = null
          showToast('증빙이 저장되었습니다.', 'success')
          renderEvidenceMgmt()
        } }, '💾 저장')
      )
    )
    return detail
  }

  function openEvidencePreview(evId) {
    _evidencePreviewId = _evidencePreviewId === evId ? null : evId
    renderEvidenceMgmt()
  }

  function renderEvidenceGantt(evidences) {
    const today = new Date()
    const allWithDates = evidences.filter(ev => ev.start_date || ev.due_date)
    if (!allWithDates.length) return el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📊'), el('p', { style: 'color:#888' }, '일정이 설정된 증빙이 없습니다. 증빙 추가/수정 시 시작일과 마감일을 지정해주세요.'))

    const allDates = allWithDates.flatMap(ev => [ev.start_date ? new Date(ev.start_date) : null, ev.due_date ? new Date(ev.due_date) : null].filter(Boolean))
    const minDate = new Date(Math.min(...allDates))
    const maxDate = new Date(Math.max(...allDates))
    minDate.setDate(minDate.getDate() - 3)
    maxDate.setDate(maxDate.getDate() + 7)
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24))
    const dayWidth = Math.max(40, Math.min(60, 800 / totalDays))

    const priorityColors = { '높음': '#ef4444', '보통': '#3b82f6', '낮음': '#10b981' }
    const statusColors = { pending: '#f59e0b', self: '#3b82f6', internal_reviewed: '#8b5cf6', externally_verified: '#10b981', confirmed: '#10b981' }

    const headerDays = []
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const isToday = d.toDateString() === today.toDateString()
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      headerDays.push(el('div', { style: `width:${dayWidth}px;flex-shrink:0;text-align:center;font-size:9px;padding:4px 0;${isToday ? 'background:#7C3AED20;font-weight:700;color:#7C3AED' : isWeekend ? 'background:#f8f9fa;color:#bbb' : 'color:#888'}` }, `${d.getMonth() + 1}/${d.getDate()}`))
    }

    const rows = allWithDates.sort((a, b) => {
      const aStart = a.start_date ? new Date(a.start_date) : new Date(a.due_date)
      const bStart = b.start_date ? new Date(b.start_date) : new Date(b.due_date)
      return aStart - bStart
    }).map(ev => {
      const start = ev.start_date ? new Date(ev.start_date) : new Date(ev.due_date)
      const end = ev.due_date ? new Date(ev.due_date) : new Date(ev.start_date)
      const startOffset = Math.max(0, Math.ceil((start - minDate) / (1000 * 60 * 60 * 24)))
      const duration = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1)
      const barLeft = startOffset * dayWidth
      const barWidth = duration * dayWidth
      const isOverdue = ev.due_date && new Date(ev.due_date) < today && ev.status !== 'confirmed'
      const color = isOverdue ? '#ef4444' : (priorityColors[ev.priority] || '#3b82f6')

      const barBg = el('div', {
        style: `position:absolute;left:${barLeft}px;width:${barWidth}px;height:22px;background:${color}20;border:1px solid ${color}60;border-radius:4px;top:4px;cursor:pointer;display:flex;align-items:center;padding:0 6px;overflow:hidden`,
        onClick: () => { _evidencePreviewId = ev.id; renderEvidenceMgmt() },
        title: `${ev.title}\n${ev.start_date || '?'} ~ ${ev.due_date || '?'}\n담당: ${ev.assignee || '미지정'} (${ev.progress || 0}%)`
      },
        el('div', { style: `height:100%;width:${ev.progress || 0}%;background:${color};border-radius:3px;transition:width .3s` }),
        el('span', { style: `position:absolute;left:8px;font-size:10px;font-weight:600;color:${color};white-space:nowrap;text-shadow:0 0 3px #fff` }, ev.title)
      )

      const todayLine = el('div', { style: `position:absolute;left:${Math.ceil((today - minDate) / (1000 * 60 * 60 * 24)) * dayWidth}px;width:2px;height:100%;background:#ef4444;z-index:2;top:0` })

      return el('div', { style: 'position:relative;height:30px;border-bottom:1px solid #f0f0f0' }, barBg, todayLine)
    })

    return el('div', { className: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { style: 'padding:12px 16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center' },
        el('span', { style: 'font-weight:600;font-size:13px' }, `📊 간트차트 (${allWithDates.length}건)`),
        el('div', { style: 'display:flex;gap:8px;font-size:10px' },
          el('span', {}, el('span', { style: 'display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;margin-right:3px' }, ''), '지연'),
          el('span', {}, el('span', { style: 'display:inline-block;width:10px;height:10px;background:#3b82f6;border-radius:2px;margin-right:3px' }, ''), '보통'),
          el('span', {}, el('span', { style: 'display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;margin-right:3px' }, ''), '낮음'),
          el('span', {}, el('span', { style: 'display:inline-block;width:2px;height:10px;background:#ef4444;margin-right:3px' }, ''), '오늘')
        )
      ),
      el('div', { style: 'display:flex;overflow-x:auto' },
        el('div', { style: `min-width:160px;flex-shrink:0;border-right:1px solid #eee;background:#fafafa` },
          el('div', { style: 'height:32px;border-bottom:1px solid #eee;display:flex;align-items:center;padding:0 12px;font-size:10px;font-weight:600;color:#888' }, '증빙명'),
          ...allWithDates.sort((a, b) => { const as = a.start_date ? new Date(a.start_date) : new Date(a.due_date); const bs = b.start_date ? new Date(b.start_date) : new Date(b.due_date); return as - bs }).map(ev => el('div', { style: 'height:30px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;padding:0 12px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer', onClick: () => { _evidencePreviewId = ev.id; renderEvidenceMgmt() } },
            el('span', { style: `width:6px;height:6px;border-radius:50%;background:${statusColors[ev.status] || '#9ca3af'};margin-right:6px;flex-shrink:0` }),
            ev.title || '제목 없음'
          ))
        ),
        el('div', { style: 'flex:1;overflow-x:auto;position:relative' },
          el('div', { style: `display:flex;height:32px;border-bottom:1px solid #eee;background:#fafafa` }, ...headerDays),
          ...rows
        )
      )
    )
  }

  function _handleEvidenceFileDrop(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    if (!Evidence.canAddMore(_evidenceAssId)) {
      alert(`증빙 문서는 평가당 55개까지 등록 가능합니다.\n기존 증빙을 삭제해주세요.`)
      return
    }
    const validFiles = files.filter(f => { if (f.size > 10 * 1024 * 1024) { alert(f.name + '은 10MB를 초과합니다.'); return false }; return true })
    if (!validFiles.length) return
    const typeMap = { '환경': 'ENV', '안전': 'SAF', '인권': 'HR', '윤리': 'ETH', '에너지': 'ENG', 'GHG': 'GHG', '탄소': 'GHG', '배출': 'EMI', '폐기': 'WST', '수질': 'WTR', '품질': 'QMS', '교정': 'CAL', '점검': 'INS', '보고서': 'RPT', '정책': 'POL', '인증': 'CERT' }
    const extTypeMap = { pdf: 'pdf', xlsx: 'xlsx', xls: 'xlsx', docx: 'docx', doc: 'docx', png: 'img', jpg: 'img', jpeg: 'img', gif: 'img' }
    let loaded = 0
    const results = []
    validFiles.forEach(file => {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const reader = new FileReader()
      reader.onload = e => {
        const fname = file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
        let docType = ''
        for (const [kr, code] of Object.entries(typeMap)) { if (file.name.includes(kr)) { docType = code; break } }
        results.push({
          file_name: file.name,
          file_data: e.target.result,
          file_size: file.size,
          mime_type: file.type,
          title: fname,
          file_type: extTypeMap[ext] || 'etc',
          doc_type: docType
        })
        loaded++
        if (loaded === validFiles.length) _finalizeFileDrop(results)
      }
      reader.readAsDataURL(file)
    })
  }

  function _finalizeFileDrop(fileResults) {
    let created = 0
    const batchId = Date.now()
    fileResults.forEach((fr, i) => {
      const ev = Evidence.add({
        assessment_id: _evidenceAssId,
        title: fr.title || fr.file_name,
        file_type: fr.file_type,
        status: 'self',
        contains_sensitive_data: false
      })
      Store.addEvidenceFile({
        evidence_id: ev.id,
        file_name: fr.file_name,
        file_path: fr.file_data,
        file_size: fr.file_size,
        mime_type: fr.mime_type
      })
      created++
    })
    showToast(`${created}건의 증빙이 추가되었습니다.`, 'success')
    renderEvidenceMgmt()
  }

  function _handleEvidenceInlineFileDrop(evidenceId, fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    const validFiles = files.filter(f => { if (f.size > 10 * 1024 * 1024) { alert(f.name + '은 10MB를 초과합니다.'); return false }; return true })
    if (!validFiles.length) return
    const extTypeMap = { pdf: 'pdf', xlsx: 'xlsx', xls: 'xlsx', docx: 'docx', doc: 'docx', png: 'img', jpg: 'img', jpeg: 'img', gif: 'img' }
    let loaded = 0
    validFiles.forEach(file => {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const reader = new FileReader()
      reader.onload = e => {
        Store.addEvidenceFile({ evidence_id: evidenceId, file_name: file.name, file_path: e.target.result, file_size: file.size, mime_type: file.type })
        loaded++
        if (loaded === validFiles.length) {
          showToast(`${loaded}개 파일이 첨부되었습니다.`, 'success')
          renderEvidenceMgmt()
        }
      }
      reader.readAsDataURL(file)
    })
  }

  function _previewEvidenceFile(file) {
    const dataUrl = file.file_path || file.file_data
    if (!dataUrl) { alert('파일 데이터를 찾을 수 없습니다.'); return }
    const mime = file.mime_type || ''
    const isImage = mime.startsWith('image/')
    const isPdf = mime === 'application/pdf' || (file.file_name || '').toLowerCase().endsWith('.pdf')
    const isText = mime.startsWith('text/') || (file.file_name || '').toLowerCase().match(/\.(csv|txt|json)$/)

    const body = el('div', { style: 'max-height:70vh;overflow:auto' })
    if (isImage) {
      const img = document.createElement('img')
      img.src = dataUrl
      img.style = 'max-width:100%;max-height:65vh;border-radius:8px'
      body.append(img)
    } else if (isPdf) {
      const iframe = document.createElement('iframe')
      iframe.src = dataUrl
      iframe.style = 'width:100%;height:65vh;border:none;border-radius:8px'
      body.append(iframe)
    } else if (isText) {
      try {
        const decoded = atob(dataUrl.split(',')[1] || '')
        const pre = el('pre', { style: 'font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;padding:12px;background:#f8f9fa;border-radius:8px;max-height:60vh;overflow:auto' }, decoded)
        body.append(pre)
      } catch { body.append(el('p', { style: 'color:#888' }, '미리보기를 지원하지 않는 파일 형식입니다.')) }
    } else {
      body.append(el('div', { style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:48px;margin-bottom:12px' }, fileIcons[file.file_type] || '📁'),
        el('p', { style: 'font-size:13px;color:#333;font-weight:600' }, file.file_name),
        el('p', { style: 'font-size:12px;color:#888' }, '이 파일 형식은 브라우저에서 미리보기가 제한됩니다. 다운로드하여 확인하세요.')
      ))
    }
    modal('📎 ' + (file.original_name || file.file_name || '파일 미리보기'), body, '닫기')
    document.getElementById('modal-save').style.display = 'none'
  }

  function _downloadEvidenceFile(file) {
    const dataUrl = file.file_path || file.file_data
    if (!dataUrl) { alert('파일 데이터를 찾을 수 없습니다.'); return }
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = file.original_name || file.file_name || 'download'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    showToast('다운로드를 시작합니다.', 'success')
  }

  function openAddEvidence() { createEvidenceModal() }
  function editEvidence(id) { const ev = Store.getEvidences().find(x => x.id === id); if (ev) createEvidenceModal(ev) }

  function createEvidenceModal(ev) {
    const isEdit = !!ev
    if (!isEdit && !Evidence.canAddMore(_evidenceAssId)) {
      alert(`증빙 문서는 평가당 ${55}개까지 등록 가능합니다.\n기존 증빙을 삭제하거나 우선순위 태깅을 활용해주세요.`)
      return
    }
    const existingTags = ev ? Evidence.getTags(ev.id).map(t => t.indicator_id) : []
    const existingFiles = ev ? Store.getEvidenceFiles(ev.id) : []
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const title = el('input', { value: ev?.title ?? '' })
    const fileTypeLabels = { pdf: 'PDF 문서', xlsx: 'Excel', docx: 'Word', img: '이미지', etc: '기타' }
    const fileType = el('select', {}, ['pdf', 'xlsx', 'docx', 'img', 'etc'].map(t => el('option', { value: t, selected: ev?.file_type === t }, fileTypeLabels[t])))
    const status = el('select', {}, ['pending', 'self', 'internal_reviewed', 'externally_verified', 'confirmed'].map(s => el('option', { value: s, selected: ev?.status === s }, Evidence.getStatusLabel(s))))
    const expiryDate = el('input', { type: 'date', value: ev?.expiry_date ?? '' })
    const sensitiveCheck = el('input', { type: 'checkbox', checked: ev?.contains_sensitive_data === true })
    const indicators = Store.getIndicators().filter(i => i.is_active !== false)
    const fileInput = el('input', { type: 'file', multiple: true, style: 'margin-top:4px' })
    const fileListContainer = el('div', { style: 'margin-top:6px' })
    window._pendingFiles = []

    if (existingFiles.length) {
      existingFiles.forEach(f => {
        const row = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:#f8f9fa;border-radius:6px;margin-bottom:4px;font-size:12px' },
          el('span', {}, '📎 ' + f.file_name),
          el('span', { style: 'color:#999' }, `(${(f.file_size / 1024).toFixed(1)}KB)`),
          el('button', { type: 'button', style: 'background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px', onClick: () => { Store.deleteEvidenceFile(f.id); row.remove() } }, '×')
        )
        fileListContainer.append(row)
      })
    }

    fileInput.onchange = () => {
      const files = Array.from(fileInput.files || [])
      files.forEach(file => {
        if (file.size > 10 * 1024 * 1024) { alert(file.name + '은 10MB를 초과합니다.'); return }
        window._pendingFiles.push(file)
        const fname = file.name || ''
        const dateMatch = fname.match(/(\d{4})[-.\s]?(\d{2})[-.\s]?(\d{2})/)
        const typeMap = { '환경': 'ENV', '안전': 'SAF', '인권': 'HR', '윤리': 'ETH', '에너지': 'ENG', 'GHG': 'GHG', '탄소': 'GHG', '배출': 'EMI', '폐기': 'WST', '수질': 'WTR', '품질': 'QMS', '교정': 'CAL', '점검': 'INS', '보고서': 'RPT', '정책': 'POL', '인증': 'CERT' }
        let docType = ''
        for (const [kr, code] of Object.entries(typeMap)) { if (fname.includes(kr)) { docType = code; break } }
        const extractionInfo = []
        if (dateMatch) extractionInfo.push(`날짜: ${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`)
        if (docType) extractionInfo.push(`유형: ${docType}`)
        if (!title.value && fname) {
          title.value = fname.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')
        }
        const row = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:#f0fff0;border-radius:6px;margin-bottom:4px;font-size:12px' },
          el('span', {}, '📎 ' + fname),
          el('span', { style: 'color:#999' }, `(${(file.size / 1024).toFixed(1)}KB)`),
          extractionInfo.length ? el('span', { style: 'color:#7C3AED;font-size:10px' }, '🤖 ' + extractionInfo.join(', ')) : null,
          el('button', { type: 'button', style: 'background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px', onClick: () => { window._pendingFiles = window._pendingFiles.filter(f => f !== file); row.remove() } }, '×')
        )
        fileListContainer.append(row)
        if (extractionInfo.length && !isEdit) {
          Store.addExtraction({ id: Date.now(), file_name: fname, file_hash: fname, extracted_date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null, extracted_type: docType || null, evidence_id: null })
        }
      })
      fileInput.value = ''
    }

    const tagContainer = el('div', { style: 'margin-top:8px' })
    const autoTagBox = el('div', { id: 'auto-tag-box', style: 'margin:8px 0;padding:10px;background:#f0f6ff;border-radius:8px;display:none;font-size:12px' })

    window._tagValues = existingTags.slice()

    function addTagRow(val) {
      const row = el('div', { style: 'display:flex;gap:6px;margin-bottom:6px' },
        el('select', { style: 'flex:1' },
          el('option', { value: '' }, '=== 항목 선택 ==='),
          ...indicators.map(ind => el('option', { value: ind.id, selected: ind.id === val }, Indicator.getNameAndCode(ind)))
        ),
        el('button', { type: 'button', style: 'background:#e74c3c;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px' }, '×')
      )
      const sel = row.querySelector('select')
      const delBtn = row.lastChild
      sel.onchange = () => { _tagValues = _tagValues.filter(v => v !== val); _tagValues.push(parseInt(sel.value)) }
      delBtn.onclick = () => { row.remove(); _tagValues = _tagValues.filter(v => v !== parseInt(sel.value)) }
      tagContainer.append(row)
    }

    if (existingTags.length) existingTags.forEach(v => addTagRow(v))
    else addTagRow(null)

    const addBtn = el('button', { type: 'button', className: 'btn btn-sm btn-secondary', style: 'margin-top:4px' }, '+ 항목 추가')
    addBtn.onclick = () => addTagRow(null)
    tagContainer.append(addBtn)

    function _checkAutoTag() {
      const txt = (title.value || '')
      const suggestions = Store.suggestAutoTags(txt, txt)
      const existing = new Set(_tagValues)
      const newOnes = suggestions.filter(s => !existing.has(s.indicator_id))
      if (!newOnes.length) { autoTagBox.style.display = 'none'; return }
      autoTagBox.style.display = 'block'
      autoTagBox.innerHTML = '<div style="font-weight:600;color:#7C3AED;margin-bottom:6px">🤖 자동 태그 제안</div>' +
        newOnes.map(s => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><input type="checkbox" class="auto-tag-cb" data-id="${s.indicator_id}" data-code="${s.indicator_code}" checked style="accent-color:#7C3AED"><span>${s.indicator_code} — ${s.indicator_name}</span><span style="color:#999;font-size:10px">(${s.confidence})</span></div>`).join('') +
        '<div style="margin-top:6px"><button type="button" class="btn btn-sm btn-primary" id="apply-auto-tags">적용</button></div>'
      const applyBtn = autoTagBox.querySelector('#apply-auto-tags')
      if (applyBtn) applyBtn.onclick = () => {
        autoTagBox.querySelectorAll('.auto-tag-cb').forEach(cb => {
          if (cb.checked && !existing.has(parseInt(cb.dataset.id))) {
            _tagValues.push(parseInt(cb.dataset.id))
            addTagRow(parseInt(cb.dataset.id))
            existing.add(parseInt(cb.dataset.id))
          }
        })
        autoTagBox.style.display = 'none'
        showToast('자동 태그가 적용되었습니다.', 'success')
      }
    }
    title.addEventListener('input', _checkAutoTag)
    if (!isEdit) setTimeout(_checkAutoTag, 100)

    const assignee = el('input', { value: ev?.assignee ?? '', placeholder: '담당자 이름', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const deptInput = el('input', { value: ev?.department ?? '', placeholder: '부서명', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const taskType = el('select', { style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' },
      ...['', '정책수립', '검증', '보고서 작성', '데이터 수집', '개선조치', '교육훈련', '기타'].map(t => el('option', { value: t, selected: ev?.task_type === t }, t || '-- 업무유형 선택 --'))
    )
    const startDate = el('input', { type: 'date', value: ev?.start_date ?? '', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const dueDate = el('input', { type: 'date', value: ev?.due_date ?? '', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const prioritySel = el('select', { style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:5px;font-size:12px;box-sizing:border-box' },
      ...['높음', '보통', '낮음'].map(p => el('option', { value: p, selected: (ev?.priority || '보통') === p }, p))
    )
    const progressInput = el('input', { type: 'range', min: '0', max: '100', value: ev?.progress ?? '0', style: 'width:100%' })
    const progressLabel = el('span', { style: 'font-size:11px;color:#888;margin-left:8px' }, (ev?.progress ?? '0') + '%')
    progressInput.oninput = () => { progressLabel.textContent = progressInput.value + '%' }

    const pmSection = el('div', { style: 'margin-top:12px;padding:12px;background:#f8f9fa;border-radius:8px;border:1px solid #eee' },
      el('div', { style: 'font-weight:600;font-size:12px;color:#555;margin-bottom:8px' }, '📋 프로젝트 관리'),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        el('label', { style: 'font-size:11px' }, '담당자', assignee),
        el('label', { style: 'font-size:11px' }, '부서', deptInput),
        el('label', { style: 'font-size:11px' }, '업무유형', taskType),
        el('label', { style: 'font-size:11px' }, '우선순위', prioritySel),
        el('label', { style: 'font-size:11px' }, '시작일', startDate),
        el('label', { style: 'font-size:11px' }, '마감일', dueDate)
      ),
      el('div', { style: 'margin-top:8px;display:flex;align-items:center' },
        el('label', { style: 'font-size:11px;flex-shrink:0' }, '진행률'),
        progressInput, progressLabel
      )
    )

    form.append(el('label', {}, '제목', title), el('label', {}, '파일 유형', fileType), el('label', {}, '상태', status), el('label', {}, '유효기간', expiryDate), el('label', { style: 'font-size:12px' }, sensitiveCheck, ' 민감정보 포함'), autoTagBox, el('label', {}, '파일 첨부 (다중 선택 가능)', fileInput, fileListContainer), pmSection, el('label', { style: 'margin-top:8px;font-weight:500' }, '연결 항목'), tagContainer)
    modal(isEdit ? '증빙 수정' : '증빙 추가', form)
    document.getElementById('modal-save').onclick = function save() {
      const pendingFiles = window._pendingFiles || []
      const data = { assessment_id: _evidenceAssId, title: title.value, file_type: fileType.value, status: status.value, assignee: assignee.value, department: deptInput.value, task_type: taskType.value, start_date: startDate.value, due_date: dueDate.value, priority: prioritySel.value, progress: parseInt(progressInput.value) }
      if (pendingFiles.length > 0) {
        let loaded = 0
        const results = []
        pendingFiles.forEach(file => {
          const reader = new FileReader()
          reader.onload = function(e) {
            results.push({ file_name: file.name, file_data: e.target.result, file_size: file.size, mime_type: file.type })
            loaded++
            if (loaded === pendingFiles.length) {
              data.file_name = results[0].file_name
              data.file_data = results[0].file_data
              data.file_size = results[0].file_size
              finalizeSave(data, results)
            }
          }
          reader.readAsDataURL(file)
        })
      } else {
        finalizeSave(data, [])
      }
    }
    function finalizeSave(data, newFiles) {
      data.expiry_date = expiryDate.value
      data.contains_sensitive_data = sensitiveCheck.checked
      let evidenceId
      if (isEdit) {
        Store.updateEvidence(ev.id, data)
        existingTags.forEach(tid => Evidence.untag(ev.id, tid))
        evidenceId = ev.id
        showToast('증빙이 수정되었습니다.', 'success')
      } else {
        const e = Evidence.add(data)
        evidenceId = e.id
        showToast('증빙이 추가되었습니다.', 'success')
      }
      _tagValues.forEach(tid => { if (tid) Evidence.tag(evidenceId, parseInt(tid)) })
      newFiles.forEach(f => {
        Store.addEvidenceFile({ evidence_id: evidenceId, file_name: f.file_name, file_path: f.file_data, file_size: f.file_size, mime_type: f.mime_type })
      })
      if (_evidenceAssId) {
        const linked = Store.autoLinkEvidenceToAssessment(evidenceId, _evidenceAssId)
        if (linked > 0) showToast(linked + '개 평가항목에 자동 연결되었습니다.', 'success')
      }
      closeModal(); renderEvidenceMgmt()
    }
  }

  // ==================== 온실가스 ====================
  let _ghgAssId = null
  function renderGHG() {
    const c = document.getElementById('page-ghg')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '🌍'),
          el('h3', { style: 'margin:0 0 8px' }, 'GHG 온실가스 관리'),
          el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, 'GHG 데이터 입력을 위해 먼저 평가를 생성하세요.'),
          el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
        )
      )
      return
    }
    _ghgAssId = _ghgAssId || assessments[0].id
    if (!assessments.find(a => a.id === _ghgAssId)) _ghgAssId = assessments[0].id
    const summary = GHG.getSummary(_ghgAssId)
    const activities = Store.getGHGActivities().filter(a => a.assessment_id === _ghgAssId)
    const entries = Object.values(summary)
    const totalEmissions = entries.reduce((s, e) => s + e.total, 0)

    const scopeColors = { '1': '#3498db', '2_location-based': '#2ecc71', '2_market-based': '#27ae60', '3': '#9b59b6' }
    const scopeLabels = { '1': 'Scope 1', '2_location-based': 'Scope 2 (위치)', '2_market-based': 'Scope 2 (시장)', '3': 'Scope 3' }

    let barsHtml = ''
    if (entries.length) {
      const maxVal = Math.max(...entries.map(e => e.total), 1)
      barsHtml = entries.map(e => {
        const key = `${e.scope}${e.scope2_method ? '_' + e.scope2_method : ''}`
        const color = scopeColors[key] || '#999'
        const label = scopeLabels[key] || `Scope ${e.scope}`
        const pct = (e.total / maxVal * 100).toFixed(0)
        return `<div style="display:flex;align-items:center;gap:10px;margin:8px 0">
          <span style="width:110px;font-size:12px;color:#555;text-align:right">${label}</span>
          <div style="flex:1;background:#f0f0f0;height:24px;border-radius:12px;overflow:hidden">
            <div style="background:${color};height:100%;width:${pct}%;border-radius:12px;display:flex;align-items:center;padding-left:8px;font-size:11px;color:#fff;font-weight:600;min-width:${pct > 10 ? '0' : '40px'}">${e.total.toFixed(1)}</div>
          </div>
          <span style="width:80px;font-size:12px;color:#666">${e.count}건</span>
        </div>`
      }).join('')
    }

    const byType = {}
    activities.forEach(a => { if (!byType[a.energy_type]) byType[a.energy_type] = 0; byType[a.energy_type] += a.co2eq || 0 })
    const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1])
    const maxType = typeEntries.length ? typeEntries[0][1] : 1
    const typeColors = { electricity: '#3498db', natural_gas: '#e67e22', diesel: '#7f8c8d', gasoline: '#e74c3c', water: '#00bcd4', waste: '#795548', other: '#9e9e9e' }
    const typeBars = typeEntries.map(([type, val]) => {
      const pct = (val / maxType * 100).toFixed(0)
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px">
        <span style="width:80px;color:#555;text-align:right">${ENERGY_LABELS[type] || type}</span>
        <div style="flex:1;background:#f0f0f0;height:16px;border-radius:8px;overflow:hidden">
          <div style="background:${typeColors[type] || '#999'};height:100%;width:${pct}%;border-radius:8px"></div>
        </div>
        <span style="width:60px;font-weight:600;text-align:right">${val.toFixed(2)}</span>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🌍 온실가스 관리'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { id: 'ghgAssSelect', style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: () => { _ghgAssId = parseInt(document.getElementById('ghgAssSelect').value); renderGHG() } },
            ...assessments.map(a => el('option', { value: a.id, selected: a.id === _ghgAssId }, a.title))
          ),
          el('button', { className: 'btn btn-primary', onClick: openAddGHG }, '+ 활동자료 입력')
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('div', { style: 'font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px' }, '총 배출량'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#333;margin-top:4px' }, totalEmissions.toFixed(1)),
          el('div', { style: 'font-size:11px;color:#aaa' }, 'tCO2eq')
        ),
        el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('div', { style: 'font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px' }, '활동자료'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#333;margin-top:4px' }, activities.length),
          el('div', { style: 'font-size:11px;color:#aaa' }, '건 등록')
        ),
        el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('div', { style: 'font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px' }, '에너지 유형'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#333;margin-top:4px' }, typeEntries.length),
          el('div', { style: 'font-size:11px;color:#aaa' }, '종류 사용')
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, 'Scope별 배출량'),
          el('div', { innerHTML: barsHtml || '<div style="color:#999;font-size:12px;text-align:center;padding:20px">데이터 없음 — 활동자료를 등록하세요</div>' })
        ),
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '에너지 유형별 배출량'),
          el('div', { innerHTML: typeBars || '<div style="color:#999;font-size:12px;text-align:center;padding:20px">데이터 없음</div>' })
        )
      ),
      el('div', { className: 'card', style: 'margin:0 20px 20px' },
        activities.length ? sortableTable('ghg', [
          { label: '유형', value: a => (ENERGY_LABELS[a.energy_type] || a.energy_type) },
          { label: 'Scope', value: a => el('span', { style: `background:${scopeColors[a.scope + (a.scope2_method ? '_'+a.scope2_method : '')] || '#999'}20;color:${scopeColors[a.scope + (a.scope2_method ? '_'+a.scope2_method : '')] || '#999'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, `Scope ${a.scope}${a.scope2_method ? ' (' + (a.scope2_method === 'location-based' ? '위치' : '시장') + ')' : ''}`) },
          { label: '값', value: a => `${a.value} ${a.unit}` },
          { label: 'tCO2eq', value: a => el('span', { style: 'font-weight:600' }, a.co2eq ? a.co2eq.toFixed(4) : '-') },
          { label: '계수', value: a => { const f = GHG.getFactor(a.energy_type, a.scope, a.scope2_method); return f ? `${f.factor} ${f.unit}` : '-' } }
        ], activities, {
          bulkDelete: id => { Store.deleteGHGActivity(id); showToast('활동자료가 삭제되었습니다.', 'success') },
          actions: a => [
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteGHGActivity(a.id); showToast('활동자료가 삭제되었습니다.', 'success'); renderGHG() } }, '삭제')
          ]
        }) : el('div', { style: 'text-align:center;padding:30px;color:#999' },
          el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '📊'),
          el('p', { style: { margin: '0 0 8px' } }, '등록된 활동자료가 없습니다'),
          el('p', { style: { margin: '0', fontSize: '12px', color: '#aaa' } }, '+ 버튼을 클릭하여 온실가스 배출 활동을 등록하세요')
        )
      )
    )
  }

  function openAddGHG() {
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const energyType = el('select', {}, ['electricity', 'natural_gas', 'diesel', 'gasoline', 'water', 'waste', 'other'].map(t => el('option', { value: t }, ENERGY_LABELS[t] + ' (' + t + ')')))
    const scope = el('select', { onChange: () => { s2m.style.display = scope.value === '2' ? 'block' : 'none' } },
      el('option', { value: '1' }, 'Scope 1 (직접)'), el('option', { value: '2' }, 'Scope 2 (에너지 간접)'), el('option', { value: '3' }, 'Scope 3 (가치사슬)'))
    const s2m = el('select', { style: 'display:none' },
      el('option', { value: 'location-based' }, '위치기준 (Location-based)'), el('option', { value: 'market-based' }, '시장기준 (Market-based)'))
    const value = el('input', { type: 'number', step: '0.01', required: true })
    const unit = el('input', { value: 'kWh', required: true })
    const ps = el('input', { type: 'date', required: true })
    const pe = el('input', { type: 'date', required: true })
    form.append(el('label', {}, '에너지 유형', energyType), el('label', {}, 'Scope', scope), el('label', {}, s2m), el('label', {}, '활동량', value), el('label', {}, '단위', unit), el('label', {}, '시작일', ps), el('label', {}, '종료일', pe))
    modal('온실가스 활동자료 입력', form)
    document.getElementById('modal-save').onclick = function save() {
      GHG.addActivity({ assessment_id: _ghgAssId, energy_type: energyType.value, scope: parseInt(scope.value), scope2_method: scope.value === '2' ? s2m.value : null, value: parseFloat(value.value), unit: unit.value, period_start: ps.value, period_end: pe.value })
      showToast('활동자료가 등록되었습니다.', 'success')
      closeModal(); renderGHG()
    }
  }

  // ==================== 협력사 리스크 ====================
  let _supplierTab = 'list'

  function renderSupplier() {
    const c = document.getElementById('page-supplier')
    if (!c) return
    c.innerHTML = ''
    const summary = Supplier.getSummary()
    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0;flex-wrap:wrap;gap:8px' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🏢 협력사 리스크 관리'),
        el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' },
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'list' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'list'; renderSupplier() } }, '📋 목록'),
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'vsme' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'vsme'; renderSupplier() } }, '📝 VSME'),
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'grade' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'grade'; renderSupplier() } }, '📊 등급'),
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'risk' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'risk'; renderSupplier() } }, '⚠ 리스크'),
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'chain' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'chain'; renderSupplier() } }, '🔗 공급망'),
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'audit' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'audit'; renderSupplier() } }, '📋 감사'),
          el('button', { className: 'btn btn-sm' + (_supplierTab === 'improve' ? ' btn-primary' : ''), onClick: () => { _supplierTab = 'improve'; renderSupplier() } }, '📈 개선')
        )
      ),
      _supplierTab === 'list' ? renderSupplierList() :
      _supplierTab === 'vsme' ? renderVSMEPanel() :
      _supplierTab === 'grade' ? renderSupplierGradePanel() :
      _supplierTab === 'risk' ? renderSupplierRiskPanel() :
      _supplierTab === 'chain' ? renderSupplyChainPanel() :
      _supplierTab === 'audit' ? renderSupplierAuditPanel() :
      renderSupplierImprovePanel()
    )
  }

  function renderSupplierList() {
    const suppliers = Supplier.getAll()
    const summary = Supplier.getSummary()
    const container = el('div', {})
    const gradeColors = { A: '#27ae60', B: '#3498db', C: '#f39c12', D: '#e74c3c' }

    container.append(
      el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center' },
          el('div', { style: 'font-size:11px;color:#999;text-transform:uppercase' }, '총 협력사'),
          el('div', { style: 'font-size:28px;font-weight:700;margin-top:4px' }, summary.total),
          el('div', { style: 'font-size:11px;color:#aaa' }, `진단완료 ${summary.graded}건`)
        ),
        ...Supplier.RISK_GRADES.map(g => {
          const pct = summary.total ? Math.round((summary.riskCounts[g.grade] || 0) / summary.total * 100) : 0
          return el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center;border-top:3px solid ' + g.color },
            el('div', { style: 'font-size:11px;color:#999' }, `${g.grade}등급 · ${g.label}`),
            el('div', { style: `font-size:28px;font-weight:700;color:${g.color};margin-top:4px` }, summary.riskCounts[g.grade] || 0),
            el('div', { style: 'font-size:11px;color:#aaa' }, `${pct}%`)
          )
        }),
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center;border-top:3px solid #ccc' },
          el('div', { style: 'font-size:11px;color:#999' }, '미진단'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#999;margin-top:4px' }, summary.riskCounts.unscored || 0)
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, `협력사 목록 (${suppliers.length}건)`),
          el('button', { className: 'btn btn-primary', onClick: openAddSupplier }, '+ 협력사 추가')
        ),
        suppliers.length ? sortableTable('suppliers', [
          { label: '회사명', key: 'name', value: s => el('span', { style: 'font-weight:600' }, s.name || '-') },
          { label: '업종', key: 'industry', value: s => s.industry || '-' },
          { label: '대표자', key: 'ceo', value: s => s.ceo || '-' },
          { label: '규모', key: 'employee_count', value: s => s.employee_count ? s.employee_count + '명' : '-', align: 'center' },
          { label: '리스크등급', value: s => {
            if (!s.last_vsme_grade) return el('span', { style: 'background:#f5f5f5;color:#999;padding:2px 10px;border-radius:10px;font-size:11px' }, '미진단')
            const g = Supplier.getGrade(s.last_vsme_score)
            return el('span', { style: `background:${g.color}15;color:${g.color};padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;border:1px solid ${g.color}30` }, `${s.last_vsme_grade}등급 · ${s.last_vsme_score}점`)
          }, align: 'center' },
          { label: '최근 진단', key: 'last_vsme_date', value: s => s.last_vsme_date ? el('span', { style: 'font-size:12px;color:#888' }, new Date(s.last_vsme_date).toLocaleDateString('ko-KR')) : el('span', { style: 'color:#ccc' }, '-') }
        ], suppliers, {
          bulkDelete: id => { Supplier.delete(id); showToast('협력사가 삭제되었습니다.', 'success') },
          actions: s => [
            el('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 4 }, onClick: () => openVSMEForSupplier(s.id) }, '자가진단'),
            el('button', { className: 'btn btn-sm btn-secondary', style: { marginRight: 4 }, onClick: () => editSupplier(s.id) }, '수정'),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('정말 삭제?')) { Supplier.delete(s.id); showToast('협력사가 삭제되었습니다.', 'success'); renderSupplier() } } }, '삭제')
          ]
        }) : el('div', { style: 'text-align:center;padding:30px;color:#999' },
          el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '🏢'),
          el('p', { style: { margin: '0 0 8px' } }, '등록된 협력사가 없습니다'),
          el('p', { style: { margin: '0', fontSize: '12px', color: '#aaa' } }, '+ 버튼으로 협력사를 추가하세요')
        )
      )
    )
    return container
  }

  function openAddSupplier() { createSupplierModal() }
  function editSupplier(id) { const s = Supplier.getAll().find(x => x.id === id); if (s) createSupplierModal(s) }

  function createSupplierModal(s) {
    const isEdit = !!s
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const name = el('input', { value: s?.name ?? '', required: true })
    const industry = el('input', { value: s?.industry ?? '' })
    const ceo = el('input', { value: s?.ceo ?? '' })
    const empCount = el('input', { type: 'number', value: s?.employee_count ?? '' })
    const revenue = el('input', { type: 'number', value: s?.revenue ?? '' })
    const phone = el('input', { value: s?.phone ?? '' })
    const email = el('input', { type: 'email', value: s?.email ?? '' })
    form.append(
      el('label', {}, '회사명 *', name),
      el('label', {}, '업종', industry),
      el('label', {}, '대표자', ceo),
      el('label', {}, '직원 수', empCount),
      el('label', {}, '매출(백만원)', revenue),
      el('label', {}, '연락처', phone),
      el('label', {}, '이메일', email)
    )
    modal(isEdit ? '협력사 수정' : '협력사 추가', form)
    document.getElementById('modal-save').onclick = () => {
      const data = { name: name.value, industry: industry.value, ceo: ceo.value, employee_count: parseInt(empCount.value) || null, revenue: parseFloat(revenue.value) || null, phone: phone.value, email: email.value }
      if (isEdit) { Supplier.update(s.id, data); showToast('협력사가 수정되었습니다.', 'success') }
      else { Supplier.add(data); showToast('협력사가 추가되었습니다.', 'success') }
      closeModal(); renderSupplier()
    }
  }

  function renderSupplierGradePanel() {
    const suppliers = Supplier.getAll()
    const summary = Supplier.getSummary()
    const container = el('div', {})

    const maxBar = Math.max(...Supplier.RISK_GRADES.map(g => summary.riskCounts[g.grade] || 0), 1)

    const gradeBar = Supplier.RISK_GRADES.map(g => {
      const cnt = summary.riskCounts[g.grade] || 0
      const pct = summary.total ? Math.round(cnt / summary.total * 100) : 0
      const barW = Math.round(cnt / maxBar * 100)
      return `<div style="display:flex;align-items:center;gap:12px;margin:8px 0">
        <div style="width:48px;height:48px;border-radius:10px;background:${g.color}15;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px solid ${g.color}30">
          <span style="font-size:18px;font-weight:700;color:${g.color}">${g.grade}</span>
        </div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span style="font-size:12px;font-weight:500;color:#555">${g.label}</span>
            <span style="font-size:11px;color:#999">${cnt}개사 (${pct}%)</span>
          </div>
          <div style="background:#f0f0f0;height:10px;border-radius:5px;overflow:hidden">
            <div style="background:${g.color};height:100%;width:${barW}%;border-radius:5px;transition:width 0.3s"></div>
          </div>
        </div>
      </div>`
    }).join('')

    const unscoredPct = summary.total ? Math.round((summary.riskCounts.unscored || 0) / summary.total * 100) : 0
    const scoredSuppliers = suppliers.filter(s => s.last_vsme_score)
    const avgScore = scoredSuppliers.length ? (scoredSuppliers.reduce((sum, s) => sum + s.last_vsme_score, 0) / scoredSuppliers.length).toFixed(1) : 0

    const supplierCards = suppliers.slice(0, 10).map(s => {
      const grade = s.last_vsme_grade ? Supplier.getGrade(s.last_vsme_score) : null
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #f5f5f5">
        <div style="width:36px;height:36px;border-radius:8px;background:${grade ? grade.color + '15' : '#f5f5f5'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${grade ? grade.color : '#ccc'};font-size:14px;border:1px solid ${grade ? grade.color + '30' : '#eee'}">
          ${grade ? grade.grade : '-'}
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500;color:#333">${s.name}</div>
          <div style="font-size:11px;color:#999">${s.industry || '미분류'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:600;color:${grade ? grade.color : '#ccc'}">${s.last_vsme_score || '-'}점</div>
          <div style="font-size:10px;color:#aaa">${s.last_vsme_date ? new Date(s.last_vsme_date).toLocaleDateString('ko-KR') : '미진단'}</div>
        </div>
      </div>`
    }).join('')

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📊 협력사 등급 분석')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '총 협력사'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, summary.total)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '평균 점수'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#7C3AED;margin-top:2px' }, avgScore)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '진단 완료'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#27ae60;margin-top:2px' }, summary.graded)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '미진단'),
          el('div', { style: `font-size:22px;font-weight:700;color:${unscoredPct > 20 ? '#e74c3c' : '#f39c12'};margin-top:2px` }, summary.riskCounts.unscored || 0),
          el('div', { style: 'font-size:10px;color:#aaa' }, `${unscoredPct}%`)
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '등급별 분포'),
          el('div', { innerHTML: gradeBar || '<div style="color:#999;font-size:12px;text-align:center;padding:20px">데이터 없음</div>' })
        ),
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '협력사 순위'),
          el('div', { innerHTML: supplierCards || '<div style="color:#999;font-size:12px;text-align:center;padding:20px">등록된 협력사 없음</div>' })
        )
      )
    )
    return container
  }

  function renderSupplierRiskPanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})
    const graded = suppliers.filter(s => s.last_vsme_grade)
    const highRisk = graded.filter(s => s.last_vsme_grade === 'C' || s.last_vsme_grade === 'D')
    const medRisk = graded.filter(s => s.last_vsme_grade === 'B')
    const lowRisk = graded.filter(s => s.last_vsme_grade === 'A')

    const riskCategories = [
      { label: '환경 리스크', icon: '🌿', color: '#10b981', desc: '폐기물·배출·인증 관련' },
      { label: '사회 리스크', icon: '👥', color: '#3b82f6', desc: '인권·안전·근로 관련' },
      { label: '지배구조 리스크', icon: '🏛', color: '#8b5cf6', desc: '윤리·컴플라이언스 관련' },
      { label: '공급망 리스크', icon: '🔗', color: '#f59e0b', desc: '이중대응·물량 리스크' }
    ]

    const riskCards = riskCategories.map(cat => {
      const score = Math.floor(Math.random() * 40) + 30
      const level = score < 35 ? '낮음' : score < 55 ? '보통' : score < 75 ? '높음' : '위험'
      const levelColor = score < 35 ? '#10b981' : score < 55 ? '#f59e0b' : score < 75 ? '#f97316' : '#ef4444'
      return el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:10px;padding:16px' },
        el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' },
          el('span', { style: 'font-size:24px' }, cat.icon),
          el('div', {},
            el('div', { style: 'font-size:13px;font-weight:600;color:#333' }, cat.label),
            el('div', { style: 'font-size:11px;color:#999' }, cat.desc)
          )
        ),
        el('div', { style: 'display:flex;align-items:center;gap:12px' },
          el('div', { style: `width:48px;height:48px;border-radius:10px;background:${levelColor}15;display:flex;align-items:center;justify-content:center` },
            el('span', { style: `font-size:18px;font-weight:700;color:${levelColor}` }, score)
          ),
          el('div', { style: 'flex:1' },
            el('div', { style: `font-size:12px;font-weight:600;color:${levelColor}` }, level),
            el('div', { style: 'background:#f0f0f0;height:6px;border-radius:3px;overflow:hidden;margin-top:4px' },
              el('div', { style: `background:${levelColor};height:100%;width:${score}%;border-radius:3px` })
            )
          )
        )
      )
    })

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '⚠ 리스크 평가')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '고위험'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#ef4444;margin-top:2px' }, highRisk.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '중위험'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#f59e0b;margin-top:2px' }, medRisk.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '저위험'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#10b981;margin-top:2px' }, lowRisk.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '미평가'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#999;margin-top:2px' }, suppliers.length - graded.length)
        )
      ),
      el('div', { style: 'padding:20px' },
        el('div', { style: 'display:grid;grid-template-columns:repeat(2,1fr);gap:16px' }, ...riskCards)
      )
    )
    return container
  }

  function renderSupplyChainPanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})

    const tierData = [
      { tier: '1차 공급업체', count: suppliers.length, color: '#3b82f6' },
      { tier: '2차 공급업체', count: Math.floor(suppliers.length * 1.8), color: '#8b5cf6' },
      { tier: '3차 공급업체', count: Math.floor(suppliers.length * 3.2), color: '#f59e0b' }
    ]

    const industryMap = {}
    suppliers.forEach(s => { const ind = s.industry || '미분류'; industryMap[ind] = (industryMap[ind] || 0) + 1 })
    const industryBars = Object.entries(industryMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    const maxInd = Math.max(...industryBars.map(x => x[1]), 1)

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🔗 공급망 관리')
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:20px;border:1px solid #f0f0f0' },
          el('h4', { style: 'margin:0 0 16px;font-size:14px;color:#333' }, '공급망 구조'),
          ...tierData.map((t, i) => el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px' },
            el('div', { style: `width:32px;height:32px;border-radius:8px;background:${t.color}15;display:flex;align-items:center;justify-content:center;font-weight:700;color:${t.color};font-size:13px` }, `T${i + 1}`),
            el('div', { style: 'flex:1' },
              el('div', { style: 'font-size:13px;font-weight:500;color:#333' }, t.tier),
              el('div', { style: 'background:#f0f0f0;height:6px;border-radius:3px;overflow:hidden;margin-top:4px' },
                el('div', { style: `background:${t.color};height:100%;width:${Math.round(t.count / tierData[2].count * 100)}%;border-radius:3px` })
              )
            ),
            el('span', { style: 'font-size:14px;font-weight:700' }, `${t.count}개사`)
          ))
        ),
        el('div', { style: 'background:#fff;border-radius:10px;padding:20px;border:1px solid #f0f0f0' },
          el('h4', { style: 'margin:0 0 16px;font-size:14px;color:#333' }, '업종별 분포'),
          industryBars.length ? industryBars.map(([name, count]) => el('div', { style: 'margin:8px 0' },
            el('div', { style: 'display:flex;justify-content:space-between;margin-bottom:3px' },
              el('span', { style: 'font-size:12px;color:#555' }, name),
              el('span', { style: 'font-size:11px;color:#999' }, `${count}개사`)
            ),
            el('div', { style: 'background:#f5f5f5;height:6px;border-radius:3px;overflow:hidden' },
              el('div', { style: `background:#3b82f6;height:100%;width:${Math.round(count / maxInd * 100)}%;border-radius:3px` })
            )
          )) : el('div', { style: 'text-align:center;padding:20px;color:#ccc;font-size:12px' }, '데이터 없음')
        )
      ),
      el('div', { style: 'padding:0 20px 20px' },
        el('div', { style: 'background:#f8f6ff;border-radius:10px;padding:16px;border:1px solid #e0d8f0' },
          el('h4', { style: 'margin:0 0 8px;font-size:13px;color:#7C3AED' }, '💡 공급망 리스크 관리 팁'),
          el('div', { style: 'font-size:12px;color:#666;line-height:1.8' },
            el('div', {}, '• 핵심 공급업체(1차)의 ESG 리스크를 우선 관리합니다'),
            el('div', {}, '• 공급업체 다각화로 단일 의존 리스크를 줄입니다'),
            el('div', {}, '• 정기적인 공급망 실사(Supply Chain Due Diligence)를 수행합니다')
          )
        )
      )
    )
    return container
  }

  function renderSupplierAuditPanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})

    const auditTypes = [
      { label: '문서 심사', icon: '📄', count: Math.floor(suppliers.length * 0.7), color: '#3b82f6' },
      { label: '현장 심사', icon: '🏭', count: Math.floor(suppliers.length * 0.3), color: '#10b981' },
      { label: '모니터링', icon: '📊', count: Math.floor(suppliers.length * 0.5), color: '#f59e0b' }
    ]

    const recentAudits = suppliers.slice(0, 8).map(s => {
      const grade = s.last_vsme_grade ? Supplier.getGrade(s.last_vsme_score) : null
      return el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #f5f5f5' },
        el('div', { style: `width:36px;height:36px;border-radius:8px;background:${grade ? grade.color + '15' : '#f5f5f5'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${grade ? grade.color : '#ccc'};font-size:13px` }, grade ? grade.grade : '-'),
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-size:13px;font-weight:500' }, s.name),
          el('div', { style: 'font-size:11px;color:#999' }, s.industry || '미분류')
        ),
        el('div', { style: 'text-align:right' },
          el('div', { style: 'font-size:11px;color:#888' }, s.last_vsme_date ? new Date(s.last_vsme_date).toLocaleDateString('ko-KR') : '미실시'),
          el('div', { style: `font-size:11px;font-weight:500;color:${grade ? grade.color : '#ccc'}` }, s.last_vsme_score ? `${s.last_vsme_score}점` : '-')
        )
      )
    })

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📋 감사 이력')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        ...auditTypes.map(t => el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:24px;margin-bottom:4px' }, t.icon),
          el('div', { style: 'font-size:12px;color:#888' }, t.label),
          el('div', { style: `font-size:22px;font-weight:700;color:${t.color};margin-top:2px` }, t.count)
        ))
      ),
      el('div', { style: 'padding:20px' },
        el('h4', { style: 'margin:0 0 12px;font-size:14px;color:#333' }, '최근 감사 이력'),
        recentAudits.length ? recentAudits : el('div', { style: 'text-align:center;padding:20px;color:#ccc;font-size:12px' }, '감사 이력 없음')
      )
    )
    return container
  }

  function renderSupplierImprovePanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})
    const highRisk = suppliers.filter(s => s.last_vsme_grade === 'C' || s.last_vsme_grade === 'D')

    const plans = [
      { title: '협력사 교육 프로그램', status: '계획', date: '2026-Q3', priority: '높음', color: '#ef4444' },
      { title: '공급망 실사 강화', status: '진행중', date: '2026-Q2~Q3', priority: '높음', color: '#f59e0b' },
      { title: 'ESG 역량 강화 워크숍', status: '계획', date: '2026-Q4', priority: '보통', color: '#3b82f6' },
      { title: '리스크 모니터링 시스템 고도화', status: '완료', date: '2026-Q1', priority: '높음', color: '#10b981' }
    ]
    const statusColors = { '계획': '#3b82f6', '진행중': '#f59e0b', '완료': '#10b981' }

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📈 개선 계획')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '고위험 협력사'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#ef4444;margin-top:2px' }, highRisk.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '개선계획 수립'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#3b82f6;margin-top:2px' }, plans.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '완료율'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#10b981;margin-top:2px' }, `${Math.round(plans.filter(p => p.status === '완료').length / plans.length * 100)}%`)
        )
      ),
      el('div', { style: 'padding:20px' },
        el('h4', { style: 'margin:0 0 12px;font-size:14px;color:#333' }, '개선 계획 목록'),
        ...plans.map(p => el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fff;border:1px solid #f0f0f0;border-radius:8px;margin-bottom:8px' },
          el('div', { style: `width:4px;height:36px;border-radius:2px;background:${p.color};flex-shrink:0` }),
          el('div', { style: 'flex:1' },
            el('div', { style: 'font-size:13px;font-weight:600;color:#333' }, p.title),
            el('div', { style: 'font-size:11px;color:#999;margin-top:2px' }, `${p.date} · 우선순위: ${p.priority}`)
          ),
          el('span', { style: `font-size:11px;padding:3px 8px;border-radius:4px;background:${statusColors[p.status]}15;color:${statusColors[p.status]};font-weight:500` }, p.status)
        ))
      )
    )
    return container
  }

  function renderVSMEPanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})
    const totalYes = suppliers.reduce((sum, s) => {
      const latest = Supplier.getLatestVSME(s.id)
      return sum + (latest?.answers?.filter(a => a === 'yes').length || 0)
    }, 0)
    const totalQ = suppliers.reduce((sum, s) => {
      const latest = Supplier.getLatestVSME(s.id)
      const checklist = Supplier.getVSMEChecklist(latest?.mode || 'basic')
      return sum + (checklist.length || 0)
    }, 0)
    const avgPct = totalQ ? Math.round(totalYes / totalQ * 100) : 0

    const supplierCards = suppliers.map(s => {
      const latest = Supplier.getLatestVSME(s.id)
      const grade = latest ? Supplier.getGrade(latest.score) : null
      const checklist = Supplier.getVSMEChecklist(latest?.mode || 'basic')
      const yesCount = latest?.answers?.filter(a => a === 'yes').length || 0
      const completionPct = checklist.length ? Math.round(yesCount / checklist.length * 100) : 0
      return el('div', { style: `display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;background:${grade ? grade.color + '08' : '#fafafa'};border:1px solid ${grade ? grade.color + '20' : '#f0f0f0'};margin-bottom:8px` },
        el('div', { style: `width:44px;height:44px;border-radius:10px;background:${grade ? grade.color + '15' : '#f0f0f0'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${grade ? grade.color : '#ccc'};font-size:16px;border:1px solid ${grade ? grade.color + '30' : '#eee'}` },
          grade ? grade.grade : '-'
        ),
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-weight:600;font-size:14px' }, s.name),
          el('div', { style: 'font-size:12px;color:#888;margin-top:2px' },
            latest ? `${latest.mode === 'basic' ? '기본' : '종합'} · ${latest.score}점 · ${new Date(latest.assessed_at).toLocaleDateString('ko-KR')}` : '미진단'
          ),
          latest ? el('div', { style: 'margin-top:4px;background:#e0e0e0;height:6px;border-radius:3px;overflow:hidden;width:120px' },
            el('div', { style: `background:${grade ? grade.color : '#ccc'};height:100%;width:${completionPct}%` })
          ) : null
        ),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => openVSMEForSupplier(s.id) }, '자가진단'),
          latest ? el('button', { className: 'btn btn-sm btn-secondary', onClick: () => showVSMEHistory(s.id) }, '이력') : null
        )
      )
    })

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📝 VSME 자가진단')
      ),
      el('div', { style: 'padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee;display:flex;gap:16px' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);min-width:100px' },
          el('div', { style: 'font-size:11px;color:#999' }, '대상 협력사'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, suppliers.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);min-width:100px' },
          el('div', { style: 'font-size:11px;color:#999' }, '진행률'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#7C3AED;margin-top:2px' }, `${avgPct}%`)
        ),
        el('div', { style: 'flex:1;display:flex;align-items:center' },
          el('div', { style: 'flex:1;background:#e0e0e0;height:10px;border-radius:5px;overflow:hidden' },
            el('div', { style: `background:#7C3AED;height:100%;width:${avgPct}%` })
          )
        )
      ),
      el('div', { style: 'padding:16px 20px' },
        suppliers.length ? supplierCards : el('div', { style: 'text-align:center;padding:30px;color:#999' },
          el('p', { style: 'margin:0' }, '먼저 협력사를 등록해주세요.'),
          el('button', { className: 'btn btn-primary', style: 'margin-top:8px', onClick: () => { _supplierTab = 'list'; renderSupplier() } }, '협력사 등록하러 가기')
        )
      )
    )
    return container
  }

  function openVSMEForSupplier(supplierId) {
    const supplier = Supplier.getAll().find(s => s.id === supplierId)
    if (!supplier) return
    const form = el('div', {})
    const mode = el('select', { style: 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:12px' },
      el('option', { value: 'basic' }, '기본 모드 (12항목)'),
      el('option', { value: 'comprehensive' }, '종합 모드 (14항목)')
    )
    const questionContainer = el('div', {})
    function renderQuestions() {
      const checklist = Supplier.getVSMEChecklist(mode.value)
      questionContainer.innerHTML = ''
      checklist.forEach(q => {
        const row = el('div', { style: 'padding:8px 0;border-bottom:1px solid #f0f0f0' },
          el('div', { style: 'font-size:13px;margin-bottom:4px' }, `[${q.category}] ${q.question}`),
          el('div', { style: 'display:flex;gap:8px' },
            el('label', { style: 'font-size:12px;cursor:pointer' }, el('input', { type: 'radio', name: q.id, value: 'yes' }), ' 예'),
            el('label', { style: 'font-size:12px;cursor:pointer' }, el('input', { type: 'radio', name: q.id, value: 'no' }), ' 아니오'),
            el('label', { style: 'font-size:12px;cursor:pointer' }, el('input', { type: 'radio', name: q.id, value: 'na', checked: true }), ' 해당없음')
          )
        )
        questionContainer.append(row)
      })
    }
    mode.onchange = renderQuestions
    renderQuestions()
    form.append(mode, questionContainer)
    modal(`VSME 자가진단 - ${supplier.name}`, form)
    document.getElementById('modal-save').onclick = () => {
      try {
        const checklist = Supplier.getVSMEChecklist(mode.value)
        const answers = checklist.map(q => {
          const checked = form.querySelector(`input[name="${q.id}"]:checked`)
          return checked ? checked.value : 'na'
        })
        Supplier.submitVSME(supplierId, mode.value, answers)
        closeModal()
        _supplierTab = 'vsme'
        renderSupplier()
      } catch (e) {
        alert('VSME 저장 중 오류: ' + e.message)
        console.error('VSME save error:', e)
      }
    }
  }

  function showVSMEHistory(supplierId) {
    const supplier = Supplier.getAll().find(s => s.id === supplierId)
    const assessments = Supplier.getVSMEAssessments(supplierId).reverse()
    const body = el('div', { style: 'max-height:400px;overflow-y:auto' })
    if (!assessments.length) {
      body.append(el('p', { style: 'color:#999;text-align:center' }, '진단 이력이 없습니다.'))
    } else {
      assessments.forEach(a => {
        const grade = Supplier.getGrade(a.score)
        body.append(el('div', { style: 'padding:10px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center' },
          el('div', {},
            el('div', { style: 'font-weight:500' }, `${a.mode === 'basic' ? '기본' : '종합'} 모드`),
            el('div', { style: 'font-size:12px;color:#888' }, new Date(a.assessed_at).toLocaleString('ko-KR'))
          ),
          el('span', { style: `background:${grade.color};color:#fff;padding:3px 12px;border-radius:10px;font-size:12px;font-weight:600` }, `${a.score}점 - ${a.grade}등급`)
        ))
      })
    }
    modal(`${supplier?.name || ''} VSME 이력`, body)
    document.getElementById('modal-save').style.display = 'none'
  }

  // ==================== AI 보고서 ====================
  let _aiAssId = null
  let _aiGenerating = false
  function renderAI() {
    const c = document.getElementById('page-ai')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '🤖'),
          el('h3', { style: 'margin:0 0 8px' }, 'AI 보고서 초안 작성'),
          el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, 'AI 초안 생성을 위해 먼저 평가를 완료하세요.'),
          el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
        )
      )
      return
    }
    _aiAssId = _aiAssId || assessments[0].id
    if (!assessments.find(a => a.id === _aiAssId)) _aiAssId = assessments[0].id
    const assessment = Store.getAssessments().find(a => a.id === _aiAssId)
    const groups = Indicator.getGroups(assessment.authority_code)
    const indicators = groups.flatMap(g => Store.getIndicators().filter(i => i.group_id === g.id && i.is_active !== false))
    const drafts = Store.getAIDrafts().filter(d => d.assessment_id === _aiAssId)

    const total = indicators.length
    const generated = drafts.length
    const approved = drafts.filter(d => d.human_status === 'approved').length
    const verified = drafts.filter(d => d.ver_status === 'pass').length
    const pending = drafts.filter(d => d.human_status === 'pending').length
    const rejected = drafts.filter(d => d.human_status === 'rejected').length
    const pct = total ? Math.round(approved / total * 100) : 0

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🤖 AI 보고서 초안'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: e => { _aiAssId = parseInt(e.target.value); renderAI() } },
            ...assessments.map(a => el('option', { value: a.id, selected: a.id === _aiAssId }, a.title))
          )
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '전체 지표'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, total)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '생성 완료'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#3498db;margin-top:2px' }, generated)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '검증 통과'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#f39c12;margin-top:2px' }, verified)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#999' }, '승인 완료'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#27ae60;margin-top:2px' }, approved)
        )
      ),
      el('div', { style: 'padding:12px 20px;border-bottom:1px solid #eee' },
        el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:8px' },
          el('div', { style: 'flex:1;background:#eee;height:8px;border-radius:4px;overflow:hidden' },
            el('div', { style: `background:#7C3AED;height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s` })
          ),
          el('span', { style: 'font-size:12px;font-weight:600;color:#7C3AED' }, `${pct}%`)
        ),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('button', { className: 'btn btn-primary btn-sm', disabled: _aiGenerating, onClick: async () => {
            _aiGenerating = true; renderAI(); showLoading('AI 보고서 일괄 생성 중...')
            for (const ind of indicators) {
              if (!drafts.find(d => d.indicator_id === ind.id)) {
                await AI.generateReport(_aiAssId, ind.id, currentUser?.role)
              }
            }
            hideLoading(); showToast('AI 보고서가 생성되었습니다.', 'success')
            _aiGenerating = false; renderAI()
          }}, _aiGenerating ? '⏳ 생성 중...' : '🚀 전체 일괄 생성'),
          el('span', { style: 'font-size:11px;color:#999' }, `미생성: ${total - generated}건`)
        )
      ),
      pending > 0 || rejected > 0 ? el('div', { className: 'card', style: 'margin:0 20px 12px;padding:14px 20px;background:linear-gradient(135deg,#fef3c7 0%,#fff7ed 100%)' },
        el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:10px' }, '📋 승인 워크플로우'),
        el('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
          el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:12px' },
            el('span', { style: `width:10px;height:10px;border-radius:50%;background:#f39c12` }),
            el('span', {}, `검토 대기: <strong>${pending}</strong>건`)
          ),
          el('span', { style: 'color:#ccc' }, '→'),
          el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:12px' },
            el('span', { style: `width:10px;height:10px;border-radius:50%;background:#3498db` }),
            el('span', {}, `검증 통과: <strong>${verified}</strong>건`)
          ),
          el('span', { style: 'color:#ccc' }, '→'),
          el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:12px' },
            el('span', { style: `width:10px;height:10px;border-radius:50%;background:#27ae60` }),
            el('span', {}, `승인 완료: <strong>${approved}</strong>건`)
          ),
          rejected > 0 ? el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:12px' },
            el('span', { style: `width:10px;height:10px;border-radius:50%;background:#e74c3c` }),
            el('span', { style: 'color:#e74c3c' }, `반려: <strong>${rejected}</strong>건`)
          ) : null
        ),
        pending > 0 ? el('div', { style: 'margin-top:10px;display:flex;gap:6px' },
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => {
            drafts.filter(d => d.human_status === 'pending').forEach(d => { AI.approveDraft(d.id, currentUser?.name || 'admin') })
            showToast(`${pending}건의 초안이 승인되었습니다.`, 'success')
            renderAI()
          }}, '✅ 일괄 승인')
        ) : null
      ) : null,
      el('div', { style: 'display:grid;grid-template-columns:280px 1fr;gap:0;min-height:500px' },
        el('div', { style: 'border-right:1px solid #eee;overflow-y:auto;max-height:600px' },
          ...groups.map(g => {
            const gInds = indicators.filter(i => i.group_id === g.id)
            return el('div', {},
              el('div', { style: 'padding:8px 12px;background:#f8f9fa;font-size:11px;font-weight:600;color:#888;border-bottom:1px solid #f0f0f0;text-transform:uppercase;letter-spacing:0.5px' }, g.group_name),
              ...gInds.map(ind => {
                const draft = drafts.find(d => d.indicator_id === ind.id)
                const sc = draft?.human_status === 'approved' ? '#27ae60' : draft?.ver_status === 'fail' ? '#e74c3c' : draft?.ver_status === 'pass' ? '#3498db' : draft ? '#f39c12' : '#ddd'
                const statusLabel = draft ? AI.getDraftStatus(draft) : '미생성'
                return el('div', { style: `padding:8px 12px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background 0.15s;border-left:3px solid ${sc}`,
                  onClick: () => showAIDetail(ind.id), onMouseEnter: e => { e.currentTarget.style.background = '#fafafa' }, onMouseLeave: e => { e.currentTarget.style.background = '' } },
                  el('div', { style: 'font-weight:500;font-size:12px' }, Indicator.getNameAndCode(ind)),
                  el('div', { style: `font-size:10px;color:${sc};margin-top:2px` }, statusLabel)
                )
              })
            )
          })
        ),
        el('div', { id: 'aiDetail', style: 'padding:20px;min-height:300px' },
          el('div', { style: 'text-align:center;padding:60px 20px;color:#999' },
            el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '👈'),
            el('div', { style: { fontSize: '13px' } }, '왼쪽에서 지표를 선택하세요'),
            el('div', { style: { fontSize: '11px', color: '#bbb', marginTop: '4px' } }, 'AI가 증빙 데이터를 기반으로 보고서 초안을 생성합니다')
          )
        )
      )
    )
  }

  function showAIDetail(indicatorId) {
    const right = document.getElementById('aiDetail')
    if (!right) return
    const indicator = Store.getIndicators().find(i => i.id === indicatorId)
    const drafts = Store.getAIDrafts().filter(d => d.indicator_id === indicatorId && d.assessment_id === _aiAssId)
    const latest = drafts[drafts.length - 1]
    const evidences = Evidence.getByIndicator(_aiAssId, indicatorId)
    right.innerHTML = ''

    const verResult = latest?.ver_result
    const claims = verResult?.claims || []

    right.append(
      el('h4', { style: 'margin:0 0 4px;font-size:14px' }, Indicator.getNameAndCode(indicator)),
      el('div', { style: 'font-size:11px;color:#666;margin-bottom:8px' }, `${Indicator.getPillarName(indicator.pillar)} | 증빙 ${evidences.length}건`),
      latest?.pillar_coverage ? el('div', { style: 'font-size:11px;color:#888;margin-bottom:4px' },
        `필러 커버리지: `,
        latest.pillar_coverage.policy ? el('span', { style: 'color:#27ae60' }, 'Policy ') : el('span', { style: 'color:#ccc' }, 'Policy '),
        latest.pillar_coverage.action ? el('span', { style: 'color:#27ae60' }, 'Action ') : el('span', { style: 'color:#ccc' }, 'Action '),
        latest.pillar_coverage.result ? el('span', { style: 'color:#27ae60' }, 'Result') : el('span', { style: 'color:#ccc' }, 'Result'),
        latest.missing_pillars?.length ? el('span', { style: 'color:#e74c3c;margin-left:4px' }, `(누락: ${latest.missing_pillars.join(', ')})`) : null
      ) : null,
      latest?.confidence ? el('div', { style: 'font-size:11px;margin-bottom:4px;color:' + ({ HIGH: '#27ae60', MEDIUM: '#f39c12', LOW: '#e74c3c' }[latest.confidence] || '#888') }, `신뢰도: ${latest.confidence}`) : null,
      latest ? el('div', { style: 'background:#f8f9fa;border-radius:6px;padding:12px;margin:8px 0;font-size:12px;line-height:1.6;white-space:pre-wrap;max-height:300px;overflow-y:auto' }, latest.draft_text) : null,
      latest ? el('div', { style: 'font-size:11px;margin-bottom:8px' },
        el('span', { style: `color:${latest.ver_status === 'pass' ? '#27ae60' : latest.ver_status === 'fail' ? '#e74c3c' : '#f39c12'}` }, `AI 검증: ${latest.ver_status === 'pass' ? '✅ PASS' : latest.ver_status === 'fail' ? '❌ FAIL' : latest.ver_status === 'revision_needed' ? '⚠️ 수정필요' : '⏳ 대기'}`),
        el('span', { style: 'margin-left:8px' }, `사람: ${latest.human_status === 'approved' ? '✅ 승인' : latest.human_status === 'rejected' ? '❌ 반려' : latest.human_status === 'blocked' ? '🚫 차단됨' : latest.human_status === 'escalated' ? '🚨 에스컬레이션' : '⏳ 검토대기'}`)
      ) : null,
      claims.length ? el('div', { style: 'margin:8px 0;border:1px solid #eee;border-radius:6px;overflow:hidden' },
        el('div', { style: 'padding:8px 12px;background:#f8f9fa;font-size:12px;font-weight:600;border-bottom:1px solid #eee' }, `검증 결과 (${claims.length}개 주장)`),
        ...claims.map(c => {
          const colors = { SUPPORTED: '#27ae60', PARTIALLY_SUPPORTED: '#f39c12', UNSUPPORTED: '#e74c3c', MISMATCH: '#e74c3c' }
          const icons = { SUPPORTED: '✅', PARTIALLY_SUPPORTED: '⚠️', UNSUPPORTED: '❌', MISMATCH: '🔴' }
          return el('div', { style: 'padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:11px' },
            el('div', { style: 'display:flex;align-items:flex-start;gap:6px' },
              el('span', {}, icons[c.status] || '❓'),
              el('div', { style: 'flex:1' },
                el('div', { style: 'color:#333;line-height:1.4' }, c.claim_text),
                el('div', { style: `color:${colors[c.status] || '#888'};margin-top:2px;font-weight:500` }, `${c.status}${c.matched_evidence_id ? ' → ' + c.matched_evidence_id : ''}`),
                c.reason ? el('div', { style: 'color:#888;margin-top:2px' }, c.reason) : null
              )
            )
          )
        }),
        verResult?.revision_notes ? el('div', { style: 'padding:8px 12px;font-size:11px;color:#666;background:#fff9e6' }, el('strong', {}, '수정 노트: '), verResult.revision_notes) : null
      ) : null,
      el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap' },
        el('button', { className: 'btn btn-sm btn-primary', onClick: async () => {
          const btn = event.target; btn.disabled = true; btn.textContent = '생성 중...'
          const r = await AI.generateReport(_aiAssId, indicatorId, currentUser?.role)
          btn.disabled = false; btn.textContent = 'AI 초안 생성'
          showAIDetail(indicatorId)
          if (r.error) alert(r.error)
        }}, 'AI 초안 생성'),
        latest && latest.ver_status === 'pass' && latest.human_status === 'pending' && latest.cited_evidence_ids?.length > 0 ? el('button', { className: 'btn btn-sm btn-success', onClick: () => { const r = AI.approveDraft(latest.id, 'current_user'); if (r.error) { showToast(r.error, 'error'); return; } showAIDetail(indicatorId); showToast('승인되었습니다.', 'success') }}, '✅ 승인') : null,
        latest && latest.ver_status === 'pass' && latest.human_status === 'pending' && (!latest.cited_evidence_ids || latest.cited_evidence_ids.length === 0) ? el('span', { style: 'color:#e74c3c;font-size:11px;font-weight:600;padding:5px 8px;background:#fff5f5;border-radius:6px' }, '⚠ 증빙 미연결 - 승인 불가') : null,
        latest && latest.ver_status === 'pass' && latest.human_status === 'pending' && (() => { const ind = Store.getIndicators().find(i => i.id === indicatorId); return ind && ind.scope2_split_required && Object.keys(GHG.getSummary(_aiAssId)).length === 0 })() ? el('span', { style: 'color:#cf1322;font-size:11px;font-weight:600;padding:5px 8px;background:#fff2f0;border-radius:6px' }, '⚠ GHG 미등록 - Scope2 분할 필요 지표 승인 불가') : null,
        latest && latest.human_status === 'pending' ? el('button', { className: 'btn btn-sm btn-danger', onClick: () => { const r = AI.rejectDraft(latest.id, 'current_user', '검토 필요'); if (r.error) { showToast(r.error, 'error'); return; } showAIDetail(indicatorId); showToast('반려되었습니다.', 'info') }}, '반려') : null,
        latest && latest.human_status === 'pending' ? el('button', { className: 'btn btn-sm', onClick: () => { const fb = prompt('수정 요청 사항:'); if (fb) { AI.requestRevision(latest.id, 'current_user', fb); showAIDetail(indicatorId); showToast('수정이 요청되었습니다.', 'info') } }}, '수정 요청') : null,
        latest && latest.human_status === 'blocked' ? el('span', { style: 'color:#e74c3c;font-size:11px;font-weight:600;padding:5px 8px;background:#fff5f5;border-radius:6px' }, '🚫 검증 실패 - 증빙 연결 필요') : null,
        latest && latest.human_status === 'escalated' ? el('span', { style: 'color:#cf1322;font-size:11px;font-weight:600;padding:5px 8px;background:#fff2f0;border-radius:6px' }, '🚨 에스컬레이션 - 관리자 확인 필요') : null
      ),
      evidences.length ? el('div', { style: 'margin-top:8px;font-size:11px;color:#666' }, el('strong', {}, '증빙: '), ...evidences.map(e => el('span', { style: 'margin-right:4px' }, `[${e.title}]`))) : null
    )
  }

  // ==================== GRI 준수율 ====================
  function renderGRI() {
    const c = document.getElementById('page-gri')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📊'),
        el('h3', { style: 'margin:0 0 8px' }, 'GRI Standards 준수율'),
        el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, 'GRI 분석을 위해 먼저 평가를 생성하세요.'),
        el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
      ))
      return
    }
    if (!_griAssId || !assessments.find(a => a.id === _griAssId)) _griAssId = assessments[0]?.id
    const selectedId = _griAssId
    const report = GRI.generateComplianceReport(selectedId)
    const rate = report.rate

    const catNames = { universal: '보편적', economic: '경제', environmental: '환경', social: '사회' }
    const catColors = { universal: '#7C3AED', economic: '#f39c12', environmental: '#27ae60', social: '#3498db' }
    const catIcons = { universal: '📋', economic: '💰', environmental: '🌿', social: '👥' }

    const categoryStats = {}
    report.rate.details.forEach(d => {
      const std = GRI_STANDARDS.find(s => s.code === d.code)
      if (!std) return
      if (!categoryStats[std.category]) categoryStats[std.category] = { total: 0, compliant: 0, partial: 0, non: 0 }
      categoryStats[std.category].total++
      if (d.status === 'compliant') categoryStats[std.category].compliant++
      else if (d.status === 'with_reference') categoryStats[std.category].partial++
      else categoryStats[std.category].non++
    })

    const catBars = Object.entries(categoryStats).map(([cat, s]) => {
      const cPct = s.total ? Math.round(s.compliant / s.total * 100) : 0
      const pPct = s.total ? Math.round((s.compliant + s.partial) / s.total * 100) : 0
      return `<div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;font-weight:600;color:#555">${catIcons[cat] || ''} ${catNames[cat] || cat}</span>
          <span style="font-size:11px;color:#999">${s.total}개 항목</span>
        </div>
        <div style="background:#f0f0f0;height:20px;border-radius:10px;overflow:hidden;position:relative">
          <div style="background:#27ae60;height:100%;width:${cPct}%;position:absolute;border-radius:10px 0 0 10px"></div>
          <div style="background:#f39c12;height:100%;width:${pPct - cPct}%;position:absolute;left:${cPct}%"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff">${s.compliant}/${s.total}</div>
        </div>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📊 GRI Standards 준수 분석'),
        el('select', { style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: e => { _griAssId = e.target.value; renderGRI() } },
          ...assessments.map(a => el('option', { value: a.id, selected: a.id === selectedId }, a.title))
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '완전준수'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#27ae60;margin-top:2px' }, rate.full_rate + '%'),
          el('div', { style: 'font-size:11px;color:#aaa' }, `${rate.full_compliance}건`)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '부분준수 포함'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#f39c12;margin-top:2px' }, rate.with_ref_rate + '%'),
          el('div', { style: 'font-size:11px;color:#aaa' }, `${rate.with_reference}건`)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '필수 항목'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, rate.total_required),
          el('div', { style: 'font-size:11px;color:#aaa' }, '개 GRI 기준')
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#999' }, '미준수'),
          el('div', { style: `font-size:22px;font-weight:700;color:${rate.non_compliant > 0 ? '#e74c3c' : '#27ae60'};margin-top:2px` }, rate.non_compliant),
          el('div', { style: 'font-size:11px;color:#aaa' }, '건 개선 필요')
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 2fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '카테고리별 준수 현황'),
          el('div', { innerHTML: catBars || '<div style="color:#999;font-size:12px">데이터 없음</div>' }),
          el('div', { style: 'margin-top:12px;display:flex;gap:12px;font-size:11px;color:#888' },
            el('span', {}, '🟢 완전준수'),
            el('span', {}, '🟡 부분준수'),
            el('span', {}, '⚪ 미준수')
          )
        ),
        el('div', { innerHTML: report.html, style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);overflow:auto;max-height:500px' })
      )
    )
  }

  // ==================== 리스크 예측 ====================
  function renderRisk() {
    const c = document.getElementById('page-risk')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:36px;margin-bottom:12px' }, '⚠️'),
        el('h3', { style: 'margin:0 0 8px' }, 'AI 리스크 예측'),
        el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, '리스크 분석을 위해 먼저 평가를 생성하세요.'),
        el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
      ))
      return
    }
    if (!_riskAssId || !assessments.find(a => a.id === _riskAssId)) _riskAssId = assessments[0]?.id
    const selectedId = _riskAssId
    const report = RISK.generateReport(selectedId)
    const overall = report.overall
    const cats = report.categories
    const alerts = report.alerts

    const trendIcons = { worsening: '↑', improving: '↓', stable: '→' }
    const trendLabels = { worsening: '악화', improving: '개선', stable: '유지' }
    const trendColors = { worsening: '#e74c3c', improving: '#27ae60', stable: '#999' }
    const levelBg = { critical: '#e74c3c', high: '#f39c12', medium: '#f1c40f', low: '#27ae60' }

    const catCards = cats.map(cat => {
      const bg = levelBg[cat.risk.level] || '#999'
      return `<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid ${bg}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-size:20px;margin-bottom:4px">${cat.icon}</div>
            <div style="font-size:13px;font-weight:600;color:#333">${cat.label}</div>
          </div>
          <span style="font-size:24px;font-weight:700;color:${bg}">${cat.risk.score}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${bg}15;color:${bg};font-weight:600">${cat.risk.label}</span>
          <span style="font-size:11px;color:${trendColors[cat.risk.trend]}">${trendIcons[cat.risk.trend]} ${trendLabels[cat.risk.trend]}</span>
        </div>
      </div>`
    }).join('')

    const alertCards = alerts.slice(0, 6).map(a => {
      const colors = { critical: '#e74c3c', warning: '#f39c12', info: '#3498db' }
      const bg = colors[a.severity] || '#999'
      return `<div style="padding:10px 14px;margin-bottom:6px;background:${bg}08;border-left:3px solid ${bg};border-radius:0 8px 8px 0;font-size:12px">
        ${a.icon} <span style="color:${bg};font-weight:600">[${a.category}]</span> ${a.message}
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '⚠️ 리스크 매트릭스'),
        el('select', { style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: e => { _riskAssId = e.target.value; renderRisk() } },
          ...assessments.map(a => el('option', { value: a.id, selected: a.id === selectedId }, a.title))
        )
      ),
      el('div', { style: 'padding:20px;background:linear-gradient(135deg,#667eea10,#764ba210);border-bottom:1px solid #eee' },
        el('div', { style: 'display:flex;align-items:center;gap:20px' },
          el('div', { style: 'position:relative;width:100px;height:100px;flex-shrink:0' },
            el('div', { style: `width:100px;height:100px;border-radius:50%;border:8px solid ${overall.color}20;display:flex;align-items:center;justify-content:center` },
              el('div', { style: `font-size:32px;font-weight:700;color:${overall.color}` }, overall.score)
            )
          ),
          el('div', {},
            el('div', { style: 'font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px' }, '종합 리스크'),
            el('div', { style: `font-size:20px;font-weight:700;color:${overall.color};margin-top:4px` }, overall.label),
            el('div', { style: 'font-size:12px;color:#888;margin-top:4px' }, `${cats.length}개 카테고리 분석 · ${alerts.length}건 알림`)
          )
        )
      ),
      el('div', { style: 'padding:20px' },
        el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '카테고리별 리스크'),
        el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px', innerHTML: catCards }),
        alerts.length ? el('div', {},
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, `알림 (${alerts.length}건)`),
          el('div', { innerHTML: alertCards })
        ) : el('div', { style: 'text-align:center;padding:20px;color:#27ae60;font-size:13px' }, '알림이 없습니다')
      )
    )
  }

  // ==================== 벤치마크 모니터링 ====================
  function renderMonitor() {
    const c = document.getElementById('page-monitor')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📈'),
        el('h3', { style: 'margin:0 0 8px' }, '벤치마크 모니터링'),
        el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, '벤치마크 비교를 위해 먼저 평가를 생성하세요.'),
        el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
      ))
      return
    }
    if (!_monitorAssId || !assessments.find(a => a.id === _monitorAssId)) _monitorAssId = assessments[0]?.id
    const selectedId = _monitorAssId
    const benchmarks = MONITORING.getBenchmarks()
    const assessment = Store.getAssessments().find(a => a.id === selectedId)
    const companyScore = assessment?.total_score || 0
    const allComparison = MONITORING.compareToAll(selectedId) || []

    const sorted = [...benchmarks.industries].sort((a, b) => b.avg_score - a.avg_score)
    const maxScore = Math.max(...sorted.map(i => i.avg_score), companyScore, 1)

    const industryBars = sorted.map(ind => {
      const pct = (ind.avg_score / maxScore * 100).toFixed(0)
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px">
        <span style="width:80px;color:#555;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ind.label}</span>
        <div style="flex:1;background:#f0f0f0;height:18px;border-radius:9px;overflow:hidden;position:relative">
          <div style="background:#7C3AED;height:100%;width:${pct}%;border-radius:9px"></div>
          <span style="position:absolute;right:6px;top:1px;font-size:10px;font-weight:600;color:#fff">${ind.avg_score}</span>
        </div>
        <span style="width:30px;font-size:10px;color:#aaa">${ind.sample_size}개사</span>
      </div>`
    }).join('')

    const companyLine = companyScore > 0 ? `<div style="position:absolute;left:${(companyScore / maxScore * 100)}%;top:0;bottom:0;width:2px;background:#e74c3c;z-index:1">
      <span style="position:absolute;top:-16px;left:-20px;font-size:10px;color:#e74c3c;font-weight:700">자사 ${companyScore}</span>
    </div>` : ''

    const alertRules = MONITORING.getAlertRules()
    const ruleItems = alertRules.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:6px;font-size:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
      <span style="width:8px;height:8px;border-radius:50%;background:${r.enabled ? '#27ae60' : '#ccc'}"></span>
      <span style="flex:1;color:#333">${r.name}</span>
      <span style="color:#999;font-size:11px">${r.description}</span>
    </div>`).join('')

    const comparisonCards = allComparison.sort((a, b) => b.avg - a.avg).slice(0, 6).map(c => {
      const diff = companyScore - c.avg
      const color = diff > 0 ? '#27ae60' : diff > -10 ? '#f39c12' : '#e74c3c'
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:6px;font-size:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
        <span style="flex:1;color:#555">${c.industry}</span>
        <span style="font-weight:600;color:#666">${c.avg}</span>
        <span style="width:40px;text-align:right;font-weight:600;color:${color}">${diff > 0 ? '+' : ''}${diff}</span>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📈 벤치마크 모니터링'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: e => { _monitorIndustry = e.target.value; renderMonitor() } },
            ...benchmarks.industries.map(ind => el('option', { value: ind.code, selected: ind.code === _monitorIndustry }, `${ind.label} (${ind.avg_score}점)`))
          ),
          el('select', { style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: e => { _monitorAssId = e.target.value; renderMonitor() } },
            assessments.map(a => el('option', { value: a.id, selected: a.id === selectedId }, `${a.title} (${a.assessment_year}년)`))
          ),
          el('button', { className: 'btn btn-primary', onClick: () => { renderMonitor() } }, '비교 실행')
        )
      ),
      el('div', { style: 'padding:12px 20px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:12px;color:#888;display:flex;gap:16px' },
        el('span', {}, `글로벌 평균: ${benchmarks.global_avg}점`),
        el('span', {}, `출처: ${benchmarks.sample_source}`),
        el('span', {}, `갱신: ${benchmarks.last_updated}`),
        el('span', { style: `font-weight:600;color:${companyScore > benchmarks.global_avg ? '#27ae60' : '#e74c3c'}` }, `자사: ${companyScore}점`)
      ),
      el('div', { style: 'display:grid;grid-template-columns:2fr 1fr;gap:16px;padding:20px;overflow-x:auto' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0;overflow:hidden' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '업종별 평균 점수'),
          el('div', { style: 'position:relative;overflow-x:auto', innerHTML: industryBars + companyLine })
        ),
        el('div', {},
          el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:12px' },
            el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '자사 비교'),
            el('div', { innerHTML: comparisonCards || '<div style="color:#999;font-size:12px">비교 불가</div>' })
          ),
          el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
            el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#666' }, '알림 규칙'),
            el('div', { style: 'display:flex;flex-direction:column;gap:6px', innerHTML: ruleItems })
          )
        )
      ),
      el('div', { id: 'monitorResult', style: 'padding:0 20px 20px' })
    )
  }

  // ==================== ISSA 5000 감사 보증 ====================
  function renderISSA() {
    const c = document.getElementById('page-issa')
    if (!c) return
    const companyId = (Store.getCompanies()[0]?.id) || 'default'
    const companyName = (Store.getCompanies()[0]?.name) || '회사명'
    const assurance = ISSA.getAssurance(companyId)
    const completion = ISSA.getCompletionPercent(assurance)
    const stageInfo = ISSA.getStageInfo(assurance.stage)
    const openFindings = assurance.findings?.filter(f => f.status === 'open') || []
    const closedFindings = assurance.findings?.filter(f => f.status === 'closed') || []

    const stageIdx = ISSA_STAGES.findIndex(x => x.key === assurance.stage)
    const stageHtml = ISSA_STAGES.map((s, i) => {
      const isDone = i < stageIdx
      const isCurrent = i === stageIdx
      const isFuture = i > stageIdx
      return `<div style="flex:1;text-align:center;position:relative">
        <div style="width:40px;height:40px;border-radius:50%;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:18px;background:${isDone ? '#7C3AED' : isCurrent ? '#7C3AED15' : '#f5f5f5'};border:2px solid ${isDone || isCurrent ? '#7C3AED' : '#e0e0e0'};color:${isDone ? '#fff' : isCurrent ? '#7C3AED' : '#bbb'}">
          ${isDone ? '✓' : s.icon}
        </div>
        <div style="font-size:11px;font-weight:${isCurrent ? '700' : '400'};color:${isCurrent ? '#7C3AED' : isDone ? '#666' : '#bbb'}">${s.label}</div>
        ${isDone ? `<div style="position:absolute;top:18px;left:calc(50% + 24px);right:calc(-50% + 24px);height:2px;background:#7C3AED"></div>` : ''}
      </div>`
    }).join('')

    const findingCards = (assurance.findings || []).map(f => {
      const sevColors = { high: '#e74c3c', medium: '#f39c12', low: '#3498db' }
      const sevBg = { high: '#fdf0f0', medium: '#fdf6e3', low: '#f0f4fa' }
      const sevLabels = { high: '높음', medium: '보통', low: '낮음' }
      return `<div style="display:flex;align-items:start;gap:10px;padding:10px 12px;border-radius:8px;background:${sevBg[f.severity] || '#fafafa'};border:1px solid ${sevColors[f.severity]}20;margin-bottom:6px">
        <div style="width:32px;height:32px;border-radius:8px;background:${sevColors[f.severity]}15;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${sevColors[f.severity]};flex-shrink:0">
          ${f.severity === 'high' ? '!' : f.severity === 'medium' ? '~' : 'i'}
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:#333">${f.category} · ${sevLabels[f.severity] || f.severity}</div>
          <div style="font-size:12px;color:#555;margin-top:2px;line-height:1.4">${f.description}</div>
          ${f.recommendation ? `<div style="font-size:11px;color:#888;margin-top:2px">권고: ${f.recommendation}</div>` : ''}
        </div>
        <div style="flex-shrink:0;text-align:right">
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;${f.status === 'open' ? 'background:#e74c3c15;color:#e74c3c' : 'background:#27ae6015;color:#27ae60'}">${f.status === 'open' ? '미해결' : '해결완료'}</span>
          ${f.status === 'open' ? `<button class="btn btn-sm btn-success" style="margin-top:4px;font-size:11px" onclick="(function(){ISSA.resolveFinding('${companyId}','${f.id}');renderISSA()})()">해결처리</button>` : ''}
        </div>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🛡️ ISSA 5000 감사 보증'),
        el('div', { style: 'display:flex;gap:12px;align-items:center' },
          el('span', { style: 'font-size:12px;color:#999' }, `${completion}% 완료`),
          el('span', { style: 'font-size:12px;padding:2px 8px;border-radius:10px;background:#7C3AED15;color:#7C3AED;font-weight:600' }, `${openFindings.length}건 미해결`)
        )
      ),
      el('div', { style: 'padding:20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'margin-bottom:12px' },
          el('div', { style: 'background:#e0e0e0;height:6px;border-radius:3px;overflow:hidden' },
            el('div', { style: `background:#7C3AED;height:100%;width:${completion}%` })
          )
        ),
        el('div', { style: 'display:flex;gap:4px;align-items:flex-start', innerHTML: stageHtml })
      ),
      el('div', { style: 'padding:12px 20px;background:#fff;border-bottom:1px solid #eee;display:flex;gap:20px;font-size:12px;flex-wrap:wrap' },
        el('span', {}, `감사인: ${assurance.auditor_name || '-'}`),
        el('span', {}, `기관: ${assurance.auditor_firm || '-'}`),
        el('span', {}, `보증수준: ${ISSA.getAssuranceLevel(assurance.assurance_level)?.label || assurance.assurance_level || '-'}`),
        assurance.scope_start ? el('span', {}, `기간: ${assurance.scope_start} ~ ${assurance.scope_end || '-'}`) : null
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { className: 'card', style: 'margin:0' },
          el('div', { className: 'card-header' },
            el('h3', { style: 'font-size:14px' }, '감사 기본 정보'),
            el('div', { style: 'display:flex;gap:4px' },
              ISSA_STAGES.map(s => el('button', { className: 'btn btn-sm' + (s.key === assurance.stage ? ' btn-primary' : ''), onClick: () => { ISSA.setStage(companyId, s.key); renderISSA() } }, `${s.icon} ${s.label}`))
            )
          ),
          el('div', { style: 'padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '감사인명'), el('input', { style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.auditor_name || '', onBlur: e => { assurance.auditor_name = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '감사기관'), el('input', { style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.auditor_firm || '', onBlur: e => { assurance.auditor_firm = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '면허번호'), el('input', { style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.auditor_license || '', onBlur: e => { assurance.auditor_license = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '보증 수준'), el('select', { style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', onChange: e => { assurance.assurance_level = e.target.value; ISSA.saveAssurance(assurance); renderISSA() } },
              ASSURANCE_LEVELS.map(l => el('option', { value: l.key, selected: l.key === assurance.assurance_level }, `${l.label} (${l.description})`))
            )),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '감사 시작일'), el('input', { type: 'date', style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.scope_start || '', onBlur: e => { assurance.scope_start = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '감사 종료일'), el('input', { type: 'date', style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.scope_end || '', onBlur: e => { assurance.scope_end = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '중대성 기준(%)'), el('input', { type: 'number', style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.materiality_threshold || 10, onBlur: e => { assurance.materiality_threshold = parseInt(e.target.value) || 10; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#888' }, '서명일'), el('input', { type: 'date', style: 'width:100%;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', value: assurance.sign_date || '', onBlur: e => { assurance.sign_date = e.target.value; ISSA.saveAssurance(assurance) } }))
          )
        ),
        el('div', { className: 'card', style: 'margin:0' },
          el('div', { className: 'card-header' },
            el('h3', { style: 'font-size:14px' }, `지적사항 (${assurance.findings?.length || 0}건)`),
            el('button', { className: 'btn btn-primary btn-sm', onClick: () => {
              const desc = document.getElementById('findDesc')?.value
              if (!desc) return alert('설명을 입력하세요')
              ISSA.addFinding(companyId, {
                category: document.getElementById('findCategory')?.value,
                severity: document.getElementById('findSeverity')?.value,
                description: desc,
                recommendation: document.getElementById('findRec')?.value
              })
              renderISSA()
            }}, '+ 추가')
          ),
          el('div', { style: 'padding:12px;border-bottom:1px solid #f0f0f0;background:#fafafa' },
            el('div', { style: 'display:grid;grid-template-columns:1fr 80px;gap:6px;margin-bottom:6px' },
              el('select', { id: 'findCategory', style: 'padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px' },
                ['환경', '사회', '지배구조', '데이터', '절차', '기타'].map(cat => el('option', { value: cat }, cat))
              ),
              el('select', { id: 'findSeverity', style: 'padding:5px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px' },
                [{ key: 'low', label: '낮음' }, { key: 'medium', label: '보통' }, { key: 'high', label: '높음' }].map(s => el('option', { value: s.key }, s.label))
              )
            ),
            el('textarea', { id: 'findDesc', rows: 2, placeholder: '설명', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px;resize:vertical;margin-bottom:6px' }),
            el('textarea', { id: 'findRec', rows: 1, placeholder: '권고사항 (선택)', style: 'width:100%;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px;resize:vertical' })
          ),
          el('div', { style: 'padding:12px;max-height:350px;overflow-y:auto', innerHTML: findingCards || '<div style="text-align:center;padding:20px;color:#999;font-size:12px">지적사항이 없습니다.</div>' })
        )
      ),
      el('div', { className: 'card', style: 'margin:0 20px 20px' },
        el('div', { className: 'card-header' }, el('h3', { style: 'font-size:14px' }, '보증 의견서')),
        el('div', { innerHTML: ISSA.generateReport(companyId), style: 'padding:16px 20px;font-size:12px;line-height:1.7' })
      )
    )
  }

  // ==================== 평가기관 제출 ====================
  function renderSubmit() {
    const c = document.getElementById('page-submit')
    if (!c) return
    const companyId = (Store.getCompanies()[0]?.id) || 'default'
    const submissions = SUBMISSION.getSubmissions(companyId)
    const agencies = SUBMISSION.getAgencies()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '📤 평가기관 자동 제출'),
          el('button', { className: 'btn btn-primary', onClick: () => {
            modal('평가기관 추가', el('div', {},
              el('div', { className: 'form-group' }, el('label', {}, '평가기관'), el('select', { id: 'subAgency' },
                agencies.map(a => el('option', { value: a.code }, `${a.name} (${a.country})`))
              )),
              el('div', { className: 'form-group' }, el('label', {}, '대상 연도'), el('input', { type: 'number', id: 'subYear', value: new Date().getFullYear() - 1 }))
            ))
            document.getElementById('modal-save').onclick = () => {
              SUBMISSION.addSubmission(companyId, document.getElementById('subAgency').value, parseInt(document.getElementById('subYear').value))
              closeModal(); renderSubmit()
            }
          }}, '+ 평가기관 추가')
        ),
        submissions.length ? el('div', { innerHTML: SUBMISSION.generateReport(companyId) }) : el('p', { style: 'padding:20px;color:#999' }, '등록된 제출이 없습니다. 평가기관을 추가해주세요.')
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '평가기관별 제출 현황')),
        el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '기관'), el('th', {}, '포맷'), el('th', {}, '상태'), el('th', {}, '설명'))),
          el('tbody', {}, ...agencies.map(a => {
            const sub = submissions.find(s => s.agency_code === a.code)
            const statusColors = { available: '#27ae60', pending: '#f39c12', not_available: '#ccc' }
            return el('tr', {},
              el('td', { style: 'font-weight:600' }, a.name),
              el('td', {}, a.format),
              el('td', { style: `color:${statusColors[a.status]};font-weight:600` }, { available: '사용가능', pending: '준비중', not_available: '미지원' }[a.status]),
              el('td', { style: 'font-size:11px;color:#888' }, a.description),
              el('td', {}, sub ? el('span', { style: 'color:#27ae60;font-size:11px' }, `✓ 등록됨 (준비율 ${SUBMISSION.calcReadiness(sub)}%)`) : null)
            )
          }))
        )
      )
    )
  }

  // ==================== 공개자료 점검 (S-18) ====================
  function renderPublicData() {
    const c = document.getElementById('page-publicdata')
    if (!c) return
    const agencies = Store.getAgencyMaster().filter(a => a.assessment_type === 'PUBLIC_DATA')
    const today = new Date()
    c.innerHTML = ''

    const checklistItems = [
      { id: 'homepage_esg', label: '홈페이지 ESG 페이지 게시', desc: '회사 홈페이지에 ESG 관련 페이지가 공개되어 있는지 점검', category: '홈페이지', url: 'https://www.google.com/search?q=ESG+홈페이지+공개' },
      { id: 'annual_report', label: '사업보고서 게시', desc: '최근 연도 사업보고서가 공개되어 있는지 점검', category: '보고서', url: 'https://dart.fss.or.kr' },
      { id: 'sustainability_report', label: '지속가능경영보고서 게시', desc: '지속가능경영보고서가 최신 버전으로 게시되어 있는지 점검', category: '보고서', url: 'https://www.google.com/search?q=지속가능경영보고서+게시' },
      { id: 'esg_policy', label: 'ESG 정책 공개', desc: '환경/사회/거버넌스 정책이 홈페이지에 공개되어 있는지 점검', category: '정책', url: 'https://www.google.com/search?q=ESG+정책+공개' },
      { id: 'news_monitoring', label: '뉴스/이슈 모니터링', desc: '회사 관련 부정 뉴스(제재, 소송, 사고)가 있는지 점검', category: '모니터링', url: 'https://news.google.com/search?q=부정뉴스' },
      { id: 'rating_update', label: '등급 변동 확인', desc: 'MSCI/Sustainalytics 등급이 최근 갱신되었는지 확인', category: '등급', url: 'https://www.google.com/search?q=ESG+등급+변동' }
    ]

    c.append(
      el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
        el('h3', { style: 'margin:0;font-size:15px;white-space:nowrap' }, '🌐 공개자료 점검 (PUBLIC_DATA)'),
        el('span', { style: 'font-size:11px;color:#888' }, 'MSCI/Sustainalytics 등 공개자료 기반 평가기관 대응')
      ),
      el('div', { className: 'card', style: 'margin-bottom:12px;padding:16px 20px;background:linear-gradient(135deg,#f0f7ff 0%,#f8f6ff 100%)' },
        el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:10px' }, '📊 공개자료 현황 요약'),
        el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px' },
          ...agencies.map(ag => {
            const saved = Store.getExtractionsByHash(`checklist_${ag.code}`) || []
            const done = saved.length
            const total = checklistItems.length
            const rate = total ? Math.round(done / total * 100) : 0
            return el('div', { style: `padding:10px;background:#fff;border-radius:8px;border-left:3px solid ${rate >= 80 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444'}` },
              el('div', { style: 'font-size:11px;color:#888' }, ag.name),
              el('div', { style: 'font-size:18px;font-weight:700;color:#333;margin-top:2px' }, `${rate}%`),
              el('div', { style: 'font-size:10px;color:#aaa' }, `${done}/${total} 항목`)
            )
          })
        )
      )
    )

    if (!agencies.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('p', { style: 'margin:0;color:#888' }, 'PUBLIC_DATA 유형의 기관이 없습니다.')
      ))
      return
    }

    agencies.forEach(agency => {
      const savedChecklist = Store.getExtractionsByHash(`checklist_${agency.code}`) || []
      const completedItems = savedChecklist.map(e => e.extracted_type) || []

      const card = el('div', { className: 'card', style: 'margin-bottom:12px' },
        el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center' },
          el('div', {},
            el('h3', { style: 'margin:0;font-size:14px' }, agency.name),
            el('p', { style: 'margin:4px 0 0;font-size:11px;color:#888' }, agency.note || '')
          ),
          el('span', { style: `font-size:11px;padding:3px 8px;border-radius:12px;background:${completedItems.length === checklistItems.length ? '#dcfce7' : '#fef3c7'};color:${completedItems.length === checklistItems.length ? '#166534' : '#92400e'};font-weight:500` },
            `${completedItems.length}/${checklistItems.length} 완료`)
        ),
        el('div', { style: 'padding:12px 16px' },
          ...checklistItems.map(item => {
            const isCompleted = completedItems.includes(item.id)
            return el('div', { style: `display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:6px;cursor:pointer;${isCompleted ? 'background:#f0fdf4' : 'background:#fafafa'}`,
              onClick: () => {
                const extractions = Store.getExtractionsByHash(`checklist_${agency.code}`) || []
                if (isCompleted) {
                  Store.deleteExtraction(extractions.find(e => e.extracted_type === item.id)?.id)
                } else {
                  Store.addExtraction({ id: Date.now(), file_name: `${agency.code}_${item.id}`, file_hash: `checklist_${agency.code}`, extracted_date: today.toISOString().split('T')[0], extracted_type: item.id, evidence_id: null })
                }
                renderPublicData()
              }
            },
              el('span', { style: `width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;${isCompleted ? 'background:#22c55e;color:#fff' : 'border:2px solid #ddd;color:transparent'}` }, isCompleted ? '✓' : ''),
              el('div', { style: 'flex:1' },
                el('div', { style: `font-size:12px;font-weight:${isCompleted ? '500' : '400'};${isCompleted ? 'color:#166534' : 'color:#333'}` }, item.label),
                el('div', { style: 'font-size:10px;color:#888' }, item.desc)
              ),
              el('span', { style: 'font-size:9px;color:#aaa' }, item.category),
              item.url ? el('a', { href: item.url, target: '_blank', style: 'font-size:10px;color:#7C3AED;text-decoration:none;margin-left:4px', onClick: e => e.stopPropagation() }, '🔗') : null
            )
          })
        )
      )
      c.append(card)
    })

    const pendingReminders = Store.getAgencyMaster().filter(a => a.submission_window && a.assessment_type === 'QUESTIONNAIRE')
    if (pendingReminders.length) {
      const reminderCard = el('div', { className: 'card', style: 'margin-bottom:12px;background:linear-gradient(135deg,#fef3c7 0%,#fef9c3 100%)' },
        el('div', { className: 'card-header' }, el('h3', { style: 'margin:0;font-size:14px;color:#92400e' }, '📅 제출기간 알림')),
        el('div', { style: 'padding:8px 16px' },
          ...pendingReminders.map(a => {
            const [start, end] = a.submission_window.split('~')
            const [sm, sd] = start.split('-').map(Number)
            const [em, ed] = end.split('-').map(Number)
            const thisYear = today.getFullYear()
            const startDate = new Date(thisYear, sm - 1, sd)
            const endDate = new Date(thisYear, em - 1, ed)
            const daysUntilStart = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24))
            const daysUntilEnd = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24))
            let status, color
            if (today >= startDate && today <= endDate) { status = '제출기간 진행 중'; color = '#22c55e' }
            else if (daysUntilStart > 0 && daysUntilStart <= 30) { status = `${daysUntilStart}일 후 시작`; color = '#f59e0b' }
            else if (today > endDate) { status = '제출기간 종료'; color = '#ef4444' }
            else { status = `${Math.abs(daysUntilStart)}일 전`; color = '#888' }
            return el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px' },
              el('span', { style: `width:8px;height:8px;border-radius:50%;background:${color}` }),
              el('span', { style: 'font-weight:500;min-width:120px' }, a.name),
              el('span', { style: 'color:#666' }, `${a.submission_window}`),
              el('span', { style: `color:${color};font-weight:500;margin-left:auto` }, status)
            )
          })
        )
      )
      c.append(reminderCard)
    }
  }

  // ==================== ERP/API 연동 ====================
  function renderAPI() {
    const c = document.getElementById('page-api')
    if (!c) return
    const endpoints = API.getEndpoints() || []
    const status = API.getSyncStatus()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '🔌 ERP/API 데이터 연동')),
        el('div', { style: 'padding:12px 20px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:13px;display:flex;gap:24px' },
          el('span', {}, `활성 엔드포인트: <strong>${status.active_endpoints}/${status.total_endpoints}</strong>`),
          el('span', {}, `총 레코드: <strong>${status.total_records}</strong>`),
          el('span', {}, `마지막 동기화: <strong>${status.latest_sync}</strong>`)
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '엔드포인트 목록')),
        el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, 'ID'), el('th', {}, '이름'), el('th', {}, '소스'), el('th', {}, '카테고리'), el('th', {}, '방식'), el('th', {}, '상태'), el('th', {}, '마지막동기화'), el('th', {}, '레코드수'), el('th', {}, '관리'))),
          el('tbody', {}, ...endpoints.map(ep => el('tr', {},
            el('td', { style: 'font-family:monospace;font-size:11px' }, ep.id),
            el('td', {}, ep.name),
            el('td', {}, ep.source),
            el('td', {}, ep.category),
            el('td', {}, ep.method),
            el('td', { style: ep.status === 'active' ? 'color:#27ae60;font-weight:600' : 'color:#999' }, ep.status === 'active' ? '활성' : '비활성'),
            el('td', {}, ep.last_sync ? new Date(ep.last_sync).toLocaleString('ko-KR') : '-'),
            el('td', { style: 'text-align:center' }, ep.record_count),
            el('td', {}, el('button', { className: 'btn btn-sm' + (ep.status === 'active' ? ' btn-danger' : ' btn-success'), onClick: () => { API.toggleEndpoint(ep.id); renderAPI() } }, ep.status === 'active' ? '비활성화' : '활성화'))
          )))
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '📥 CSV 데이터 가져오기')
        ),
        el('div', { style: 'padding:16px 20px' },
          el('div', { className: 'form-group' }, el('label', {}, '데이터 카테고리'), el('select', { id: 'csvCategory' },
            ['ghg', 'energy', 'water', 'waste', 'workforce', 'safety', 'training', 'supply_chain', 'financial'].map(cat => el('option', { value: cat }, cat))
          )),
          el('div', { className: 'form-group' }, el('label', {}, 'CSV 입력'), el('textarea', { id: 'csvInput', rows: 6, placeholder: '헤더 포함 CSV를 붙여넣으세요...\n\n예시: year,scope,category,quantity,unit\n2024,scope1,diesel,1000,liter', style: 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-family:monospace;font-size:11px' })),
          el('div', { style: 'display:flex;gap:8px;align-items:center' },
            el('button', { className: 'btn btn-secondary', onClick: () => {
              const cat = document.getElementById('csvCategory').value
              const template = API.getImportTemplate(cat)
              document.getElementById('csvInput').value = template
            }}, '템플릿 다운로드'),
            el('button', { className: 'btn btn-primary', onClick: () => {
              const cat = document.getElementById('csvCategory').value
              const raw = document.getElementById('csvInput').value
              if (!raw.trim()) return alert('CSV 데이터를 입력하세요')
              const parsed = API.parseCSV(raw)
              if (parsed.errors.length) { alert('파싱 오류:\n' + parsed.errors.join('\n')); return }
              const result = API.importData(cat, parsed.data)
              alert(`가져오기 완료: ${result.imported}건 성공, ${result.errors.length}건 오류`)
              renderAPI()
            }}, '가져오기 실행'),
            el('button', { className: 'btn btn-secondary', onClick: () => {
              const cat = document.getElementById('csvCategory').value
              const schema = API.getSchema(cat)
              if (!schema) return alert('해당 카테고리의 스키마가 없습니다.')
              const msg = `필수 필드: ${schema.required.join(', ')}\n선택 필드: ${schema.optional.join(', ')}`
              alert(msg)
            }}, '스키마 보기')
          ),
          el('div', { id: 'csvPreview', style: 'margin-top:12px;font-size:11px;color:#888' })
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '📡 API 페이로드 예시')),
        el('div', { style: 'padding:16px 20px' },
          el('div', { className: 'form-group' }, el('label', {}, '카테고리 선택'), el('select', { id: 'exampleCat', onChange: () => {
            const cat = document.getElementById('exampleCat').value
            const example = API.generatePayloadExample(cat)
            document.getElementById('examplePayload').textContent = JSON.stringify(example, null, 2)
          }},
            ['ghg', 'energy', 'water', 'waste', 'workforce', 'safety', 'training', 'supply_chain', 'financial'].map(cat => el('option', { value: cat }, cat))
          )),
          el('pre', { id: 'examplePayload', style: 'background:#f8f9fa;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;max-height:200px' }, JSON.stringify(API.generatePayloadExample('ghg'), null, 2))
        )
      )
    )
  }

  // ==================== 외부 공유 관리 (S-19) ====================
  function renderShareManagement() {
    const c = document.getElementById('page-share')
    if (!c) return
    const allLinks = Store.getShareLinks() || []
    const recentLogs = Store.getChangeLogs('shareLinks', '') || []
    c.innerHTML = ''

    c.append(
      el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
        el('h3', { style: 'margin:0;font-size:15px;white-space:nowrap' }, '🔗 외부 공유 관리'),
        el('span', { style: 'font-size:12px;color:#888' }, `${allLinks.filter(l => !l.revoked_at).length}개 활성 링크`)
      )
    )

    const activeLinks = allLinks.filter(l => !l.revoked_at)
    const revokedLinks = allLinks.filter(l => l.revoked_at)
    const resourceLabels = { EVIDENCE: '증빙', REPORT: '보고서', KPI_DASHBOARD: 'KPI 대시보드', CHECKLIST: '체크리스트' }

    if (activeLinks.length) {
      c.append(el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '활성 공유 링크')),
        el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '리소스'), el('th', {}, '대상'), el('th', {}, '권한'), el('th', {}, '열람'), el('th', {}, '만료'), el('th', {}, '관리'))),
          el('tbody', {}, ...activeLinks.map(l => {
            const accessCount = Store.getShareAccessLogs(l.id).length
            const isExpired = l.expires_at && new Date(l.expires_at) < new Date()
            return el('tr', {},
              el('td', {}, resourceLabels[l.resource_type] || l.resource_type),
              el('td', {}, l.shared_with || '-'),
              el('td', { style: 'font-size:11px' }, l.permission === 'VIEW_ONLY' ? '열람' : '코멘트'),
              el('td', { style: 'text-align:center' }, accessCount),
              el('td', { style: 'font-size:11px;color:#888' }, l.expires_at ? new Date(l.expires_at).toLocaleDateString('ko-KR') : '무제한'),
              el('td', {}, el('button', { className: 'btn btn-sm', style: 'font-size:10px;color:#ef4444;background:none;border:none', onClick: () => { ESGComponents.revokeShareLink(l.id); renderShareManagement() } }, '회수'))
            )
          }))
        )
      ))
    }

    if (revokedLinks.length) {
      c.append(el('div', { className: 'card', style: 'opacity:.6' },
        el('div', { className: 'card-header' }, el('h3', {}, `회수된 링크 (${revokedLinks.length}개)`)),
        el('div', { style: 'padding:8px 16px;font-size:12px;color:#888' }, `${revokedLinks.length}개의 공유 링크가 회수되었습니다.`)
      ))
    }

    if (!allLinks.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:36px;margin-bottom:12px' }, '🔗'),
        el('h3', { style: 'margin:0 0 8px' }, '공유된 항목이 없습니다'),
        el('p', { style: 'margin:0;color:#888;font-size:13px' }, '증빙, 보고서, KPI 대시보드에서 공유 버튼을 눌러 링크를 생성하세요.')
      ))
    }
  }

  // ==================== 보고서 편집기 (S-05) ====================
  let _editorAssId = null
  let _editorSelectedIndicator = null

  function renderReportEditor() {
    const c = document.getElementById('page-editor')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''
    if (!assessments.length) {
      c.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📝'),
          el('h3', { style: 'margin:0 0 8px' }, '보고서 편집기'),
          el('p', { style: 'margin:0 0 16px;color:#888;font-size:13px' }, '지표 ↔ 증빙 연결을 위해 먼저 평가를 생성하세요.'),
          el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
        )
      )
      return
    }
    _editorAssId = _editorAssId || assessments[0].id
    if (!assessments.find(a => a.id === _editorAssId)) _editorAssId = assessments[0].id
    const assessment = Store.getAssessments().find(a => a.id === _editorAssId)
    const allIndicators = Store.getIndicators().filter(i => i.authority_code === assessment.authority_code && i.is_active !== false)
    const evidences = Evidence.getAll(_editorAssId)
    const allTags = Store.getEvidenceTags()
    const linked = allIndicators.filter(ind => allTags.some(t => t.indicator_id === ind.id))
    const unlinked = allIndicators.filter(ind => !allTags.some(t => t.indicator_id === ind.id))
    const pct = allIndicators.length ? Math.round(linked.length / allIndicators.length * 100) : 0

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📝 보고서 편집기'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { style: 'padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px', onChange: () => { _editorAssId = parseInt(document.getElementById('editorAssSelect')?.value || document.querySelector('.card-header select')?.value); _editorSelectedIndicator = null; renderReportEditor() } },
            ...assessments.map(a => el('option', { value: a.id, selected: a.id === _editorAssId }, `${a.title} (${a.assessment_year}년)`))
          )
        )
      ),
      el('div', { style: 'padding:12px 20px;background:#f8f9fa;border-bottom:1px solid #eee' },
        el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:6px' },
          el('div', { style: 'flex:1;background:#eee;height:8px;border-radius:4px;overflow:hidden' },
            el('div', { style: `background:#7C3AED;height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s` })
          ),
          el('span', { style: 'font-size:12px;font-weight:600;color:#7C3AED' }, `${pct}%`)
        ),
        el('div', { style: 'display:flex;gap:16px;font-size:12px;color:#666' },
          el('span', {}, `연결 완료: ${linked.length}건`),
          el('span', {}, `미연결: ${unlinked.length}건`),
          el('span', {}, `증빙: ${evidences.length}건`)
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:320px 1fr;gap:0;min-height:500px' },
        el('div', { style: 'border-right:1px solid #eee;overflow-y:auto;max-height:600px' },
          el('div', { style: 'padding:8px 16px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px' }, `전체 지표 (${allIndicators.length}개)`),
          ...allIndicators.map(ind => {
            const tags = allTags.filter(t => t.indicator_id === ind.id)
            const isSelected = _editorSelectedIndicator === ind.id
            const hasLink = tags.length > 0
            return el('div', {
              style: `padding:10px 16px;border-bottom:1px solid #f5f5f5;cursor:pointer;transition:background 0.15s;border-left:3px solid ${isSelected ? '#7C3AED' : hasLink ? '#27ae60' : 'transparent'}`,
              onClick: () => { _editorSelectedIndicator = ind.id; renderReportEditor() },
              onMouseEnter: e => { if (!isSelected) e.currentTarget.style.background = '#fafafa' },
              onMouseLeave: e => { if (!isSelected) e.currentTarget.style.background = '' }
            },
              el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
                el('span', { style: `font-weight:500;font-size:12px;color:${hasLink ? '#333' : '#999'}` }, Indicator.getNameAndCode(ind)),
                hasLink ? el('span', { style: 'background:#27ae60;color:#fff;font-size:10px;padding:1px 6px;border-radius:99px' }, `${tags.length}건`) : el('span', { style: 'background:#eee;color:#999;font-size:10px;padding:1px 6px;border-radius:99px' }, '미연결')
              ),
              el('div', { style: 'font-size:10px;color:#aaa;margin-top:2px' }, Indicator.getPillarName(ind.pillar))
            )
          })
        ),
        el('div', { style: 'overflow-y:auto;max-height:600px;padding:16px' },
          _editorSelectedIndicator ? renderEditorDetail(_editorSelectedIndicator, evidences) : el('div', { style: 'text-align:center;padding:60px 20px;color:#999' },
            el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '👈'),
            el('div', { style: { fontSize: '13px' } }, '왼쪽에서 지표를 선택하세요'),
            el('div', { style: { fontSize: '11px', color: '#bbb', marginTop: '4px' } }, '각 지표에 증빙을 연결하여 보고서를 구성합니다')
          )
        )
      )
    )
  }

  function renderEditorDetail(indicatorId, evidences) {
    const indicator = Store.getIndicators().find(i => i.id === indicatorId)
    if (!indicator) return el('div', {}, '지표를 찾을 수 없습니다.')
    const linkedTags = Store.getEvidenceTags().filter(t => t.indicator_id === indicatorId)
    const linkedEvidences = linkedTags.map(t => evidences.find(e => e.id === t.evidence_id)).filter(Boolean)
    const unlinkedEvidences = evidences.filter(e => !linkedTags.find(t => t.evidence_id === e.id))

    const container = el('div', {})

    const ghgWarning = indicator.scope2_split_required ? (() => {
      const summary = GHG.getSummary(_editorAssId)
      const hasData = Object.keys(summary).length > 0
      if (hasData) {
        return el('div', { style: 'margin-bottom:16px;padding:12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;border-left:3px solid #faad14' },
          el('div', { style: 'font-weight:600;font-size:13px;color:#d48806' }, '📊 Scope2 분할 필요 지표 — GHG 요약 자동 인용'),
          el('div', { style: 'font-size:12px;color:#888;margin-top:4px' }, '이 지표는 Scope 2의 위치기준·시장기준 분할이 필요합니다.'),
          el('pre', { style: 'margin:8px 0 0;padding:8px;background:#fff;border-radius:4px;font-size:12px;white-space:pre-wrap' }, GHG.formatSummary(summary))
        )
      } else {
        return el('div', { style: 'margin-bottom:16px;padding:12px;background:#fff2f0;border:1px solid #ffccc7;border-radius:8px;border-left:3px solid #ff4d4f' },
          el('div', { style: 'font-weight:600;font-size:13px;color:#cf1322' }, '⚠️ Scope2 분할 필요 지표 — GHG 데이터 없음'),
          el('div', { style: 'font-size:12px;color:#888;margin-top:4px' }, '이 지표는 Scope 2 위치기준·시장기준 분할이 필요하지만, GHG 활동자료가 없습니다.'),
          el('div', { style: 'font-size:12px;color:#cf1322;margin-top:4px;font-weight:500' }, '온실가스 관리(S-04)에서 활동자료를 먼저 등록해주세요. 미등록 시 승인이 차단됩니다.')
        )
      }
    })() : null

    container.append(
      el('div', { style: 'margin-bottom:16px;padding:12px;background:#f8f6ff;border-radius:8px;border-left:3px solid #7C3AED' },
        el('div', { style: 'font-weight:600;font-size:14px' }, Indicator.getNameAndCode(indicator)),
        el('div', { style: 'font-size:12px;color:#666;margin-top:4px' }, `${Indicator.getPillarName(indicator.pillar)} | 담당: ${indicator.dept_code || '미지정'} | 주기: ${indicator.review_cycle || '-'}`),
        el('div', { style: 'font-size:12px;color:#888;margin-top:4px' }, `연결된 증빙: ${linkedEvidences.length}건`)
      ),
      ghgWarning,
      indicator.scope2_split_required ? (() => {
        const summary = GHG.getSummary(_editorAssId)
        const hasData = Object.keys(summary).length > 0
        if (!hasData) return null
        return el('div', { style: 'margin-bottom:16px;padding:10px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;display:flex;align-items:center;gap:8px' },
          el('span', { style: 'font-size:13px' }, '📊'),
          el('span', { style: 'font-size:12px;flex:1' }, 'GHG 요약값을 보고서에 삽입합니다.'),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => {
            const summaryText = GHG.formatSummary(summary)
            navigator.clipboard.writeText(summaryText).then(() => showToast('GHG 요약이 클립보드에 복사되었습니다.', 'success')).catch(() => showToast('복사에 실패했습니다.', 'error'))
          } }, '📋 GHG 최신값 복사')
        )
      })() : null,
      el('div', { style: 'margin-bottom:16px' },
        el('h4', { style: 'font-size:13px;margin-bottom:8px;color:#27ae60' }, `✅ 연결된 증빙 (${linkedEvidences.length}건)` ),
        linkedEvidences.length ? el('div', {}, ...linkedEvidences.map(ev =>
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f0fff4;border:1px solid #c6f6d5;border-radius:6px;margin-bottom:6px' },
            el('div', {},
              el('div', { style: 'font-weight:500;font-size:13px' }, ev.title),
              el('div', { style: 'font-size:11px;color:#888' }, `${ev.file_type} | ${Evidence.getStatusLabel(ev.status)}${ev.contains_sensitive_data ? ' | 🔒 민감정보' : ''}`)
            ),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => {
              Store.removeEvidenceTag(ev.id, indicatorId)
              renderReportEditor()
            }}, '해제')
          )
        )) : el('div', { style: 'padding:12px;color:#999;font-size:12px;text-align:center;background:#f9f9f9;border-radius:6px' }, '연결된 증빙이 없습니다. 아래에서 연결하세요.')
      ),
      el('div', { style: 'margin-bottom:16px' },
        el('h4', { style: 'font-size:13px;margin-bottom:8px;color:#666' }, `📎 연결 가능한 증빙 (${unlinkedEvidences.length}건)`),
        unlinkedEvidences.length ? el('div', {}, ...unlinkedEvidences.map(ev =>
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fff;border:1px solid #eee;border-radius:6px;margin-bottom:6px' },
            el('div', {},
              el('div', { style: 'font-weight:500;font-size:13px' }, ev.title),
              el('div', { style: 'font-size:11px;color:#888' }, `${ev.file_type} | ${Evidence.getStatusLabel(ev.status)}${ev.contains_sensitive_data ? ' | 🔒 민감정보' : ''}`)
            ),
            el('button', { className: 'btn btn-sm btn-primary', onClick: () => {
              Store.addEvidenceTag({ evidence_id: ev.id, indicator_id: indicatorId })
              renderReportEditor()
            }}, '연결')
          )
        )) : el('div', { style: 'padding:12px;color:#999;font-size:12px;text-align:center;background:#f9f9f9;border-radius:6px' }, '연결 가능한 증빙이 없습니다. 먼저 증빙을 등록하세요.')
      ),
      el('div', { style: 'padding:12px;background:#f8f9fa;border-radius:8px;font-size:12px;color:#666;line-height:1.6' },
        el('strong', {}, '📌 연결 규칙:'),
        el('br'),
        '• 증빙을 연결해야 AI가 해당 증빙만 참조하여 초안을 생성합니다.',
        el('br'),
        '• 연결되지 않은 문장은 AI 검증에서 UNSUPPORTED로 표시됩니다.',
        el('br'),
        '• 미연결 문장이 있으면 최종 승인이 차단됩니다.',
        el('br'),
        indicator.scope2_split_required ? '• 이 지표는 Scope2 분할이 필요하므로 GHG 데이터가 반드시 있어야 합니다.' : null
      )
    )
    return container
  }

  // ==================== KSSB 공시관리 (S-12) ====================
  function renderKSSB() {
    const c = document.getElementById('page-kssb')
    if (!c) return
    c.innerHTML = ''
    const kssbGroups = Indicator.getGroups('KSSB')
    const allKssbInd = Store.getIndicators().filter(i => i.authority_code === 'KSSB' && i.is_active !== false)
    const agency = Store.getAgencyMaster().find(a => a.code === 'KSSB')
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '📜 KSSB 공시관리 (법정 공시)'),
          el('span', { style: 'background:#e74c3c;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px' }, '법정 의무 (MANDATORY)')
        ),
        el('div', { style: 'padding:12px 20px;background:#fff5f5;border-bottom:1px solid #eee;font-size:12px;line-height:1.6' },
          `<strong>KSSB 공시기준</strong>: ${agency?.disclosure_std_no || '제1호(일반사항), 제2호(기후)'} | 시행일: ${agency?.effective_date || '2026-02-26'}`,
          el('br'),
          '법정 공시 항목입니다. EcoVadis 등 자율 평가와 성격이 다르며, 미공시 시 과태료가 부과될 수 있습니다.'
        )
      ),
      ...kssbGroups.map(g => {
        const inds = allKssbInd.filter(i => i.group_id === g.id)
        if (!inds.length) return null
        return el('div', { className: 'card' },
          el('div', { className: 'card-header' }, el('h3', { style: 'font-size:14px' }, `${Indicator.getGroupDisplayName(g)} (${inds.length}개 항목)`)),
          el('table', { style: 'font-size:12px' },
            el('thead', {}, el('tr', {}, el('th', { style: 'width:120px' }, '코드'), el('th', {}, '항목명'), el('th', { style: 'width:100px' }, '담당부서'), el('th', { style: 'width:80px' }, '검토주기'), el('th', { style: 'width:80px;text-align:center' }, '_SCOPE2 이중'))),
            el('tbody', {}, ...inds.map(ind => el('tr', {},
              el('td', { style: 'font-family:monospace;font-size:11px;font-weight:500' }, ind.indicator_code),
              el('td', {}, Indicator.getDisplayName(ind)),
              el('td', { style: 'font-size:11px;color:#666' }, ind.dept_code || el('span', { style: 'color:#e74c3c' }, '미지정')),
              el('td', { style: 'font-size:11px' }, ind.review_cycle || '-'),
              el('td', { style: 'text-align:center' }, ind.scope2_split_required ? el('span', { style: 'color:#e74c3c;font-weight:600;font-size:11px' }, '위치+시장') : '-')
            )))
          )
        )
      }).filter(Boolean)
    )
  }

  // ==================== AI 생성이력 검토 (S-13) ====================
  function renderAIHistory() {
    const c = document.getElementById('page-aihistory')
    if (!c) return
    const allDrafts = Store.getAIDrafts() || []
    const sorted = [...allDrafts].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    const pendingReview = sorted.filter(d => d.ver_status === 'pass' && d.human_status === 'pending')
    const approved = sorted.filter(d => d.human_status === 'approved')
    const rejected = sorted.filter(d => d.human_status === 'rejected')
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '🕐 AI 생성이력 검토'),
          el('div', { style: 'display:flex;gap:12px;font-size:12px' },
            el('span', {}, `검토대기: <strong style="color:#f39c12">${pendingReview.length}</strong>`),
            el('span', {}, `승인됨: <strong style="color:#27ae60">${approved.length}</strong>`),
            el('span', {}, `반려: <strong style="color:#e74c3c">${rejected.length}</strong>`)
          )
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `검토 대기 (${pendingReview.length}건)`)),
        pendingReview.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '지표'), el('th', { style: 'width:50px' }, '버전'), el('th', {}, '증빙'), el('th', {}, '신뢰도'), el('th', { style: 'width:70px' }, '검증'), el('th', { style: 'width:60px' }, '마스킹'), el('th', { style: 'width:100px' }, '관리'))),
          el('tbody', {}, ...pendingReview.map(d => {
            const ind = Store.getIndicators().find(i => i.id === d.indicator_id)
            const assessment = Store.getAssessments().find(a => a.id === d.assessment_id)
            const unsupported = d.ver_result?.claims?.filter(c => c.status === 'UNSUPPORTED' || c.status === 'MISMATCH') || []
            const evidenceCount = d.cited_evidence_ids?.length || d.evidence_ids?.length || 0
            const hasEvidence = evidenceCount > 0
            return el('tr', { style: hasEvidence ? '' : 'background:#fff8f0' },
              el('td', {}, ind ? Indicator.getNameAndCode(ind) : d.indicator_id),
              el('td', { style: 'text-align:center' }, `v${d.version || 1}`),
              el('td', { style: 'font-size:11px' }, hasEvidence ? `${evidenceCount}건 연결` : el('span', { style: 'color:#e74c3c;font-weight:600' }, '⚠ 증빙 미연결')),
              el('td', { style: `color:${{HIGH:'#27ae60',MEDIUM:'#f39c12',LOW:'#e74c3c'}[d.confidence]||'#888'};font-weight:600` }, d.confidence || '-'),
              el('td', {}, unsupported.length ? el('span', { style: 'color:#e74c3c;font-weight:600' }, `⚠ ${unsupported.length}건`) : el('span', { style: 'color:#27ae60' }, '✅')),
              el('td', { style: 'text-align:center' }, d.masked_before_send ? el('span', { style: 'color:#27ae60;font-size:10px' }, '🔒') : el('span', { style: 'color:#999;font-size:10px' }, '-')),
              el('td', { style: 'white-space:nowrap' },
                hasEvidence && d.ver_status === 'pass' ? el('button', { className: 'btn btn-sm btn-success', style: { marginRight: 4 }, onClick: () => { const r = AI.approveDraft(d.id, 'current_user'); if (r.error) { showToast(r.error, 'error'); return; } showToast('AI 초안이 승인되었습니다.', 'success'); renderAIHistory() } }, '승인') : el('span', { style: 'color:#e74c3c;font-size:10px;font-weight:600;padding:4px 8px;background:#fff5f5;border-radius:4px;display:inline-block' }, !hasEvidence ? '증빙미연결' : '검증미통과'),
                el('button', { className: 'btn btn-sm btn-danger', onClick: () => { AI.rejectDraft(d.id, 'current_user', '반려'); showToast('AI 초안이 반려되었습니다.', 'warning'); renderAIHistory() } }, '반려')
              )
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#999;text-align:center' }, '검토 대기 중인 AI 초안이 없습니다.')
      ),
      rejected.length ? el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `반려 (${rejected.length}건)`)),
        el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '지표'), el('th', { style: 'width:50px' }, '버전'), el('th', {}, '반려사유'), el('th', { style: 'width:140px' }, '관리'))),
          el('tbody', {}, ...rejected.map(d => {
            const ind = Store.getIndicators().find(i => i.id === d.indicator_id)
            return el('tr', {},
              el('td', {}, ind ? Indicator.getNameAndCode(ind) : d.indicator_id),
              el('td', { style: 'text-align:center' }, `v${d.version || 1}`),
              el('td', { style: 'font-size:11px;color:#e74c3c' }, d.rejection_reason || '반려됨'),
              el('td', { style: 'white-space:nowrap' },
                el('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 4 }, onClick: () => { _editorAssId = d.assessment_id; navigate('editor'); setTimeout(() => { if (typeof renderReportEditor === 'function') renderReportEditor() }, 100) } }, '지금 수정하기'),
                el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { AI.retryDraft(d.id, 'current_user'); showToast('AI 재생성이 시작되었습니다.', 'success'); renderAIHistory() } }, '재생성')
              )
            )
          }))
        )
      ) : null,
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `전체 이력 (${sorted.length}건)`)),
        sorted.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '지표'), el('th', { style: 'width:50px' }, '버전'), el('th', { style: 'width:50px' }, '증빙'), el('th', { style: 'width:70px' }, '검증'), el('th', { style: 'width:70px' }, '사람검토'), el('th', { style: 'width:50px' }, '마스킹'), el('th', { style: 'width:140px' }, '생성일시'))),
          el('tbody', {}, ...sorted.slice(0, 50).map(d => {
            const ind = Store.getIndicators().find(i => i.id === d.indicator_id)
            const verColors = { pass: '#27ae60', fail: '#e74c3c', revision_needed: '#f39c12' }
            const humColors = { approved: '#27ae60', rejected: '#e74c3c', pending: '#f39c12' }
            const humLabels = { approved: '승인', rejected: '반려', pending: '대기' }
            const evCount = d.cited_evidence_ids?.length || d.evidence_ids?.length || 0
            return el('tr', {},
              el('td', {}, ind ? Indicator.getNameAndCode(ind) : d.indicator_id),
              el('td', { style: 'text-align:center' }, `v${d.version || 1}`),
              el('td', { style: 'text-align:center;font-size:11px' }, evCount ? `${evCount}건` : el('span', { style: 'color:#e74c3c' }, '0')),
              el('td', { style: `color:${verColors[d.ver_status]||'#888'};font-weight:600;text-align:center` }, d.ver_status || '-'),
              el('td', { style: `color:${humColors[d.human_status]||'#888'};font-weight:600;text-align:center` }, humLabels[d.human_status] || d.human_status),
              el('td', { style: 'text-align:center;font-size:11px' }, d.masked_before_send ? '✅' : '❌'),
              el('td', { style: 'font-size:11px;color:#888' }, d.created_at ? new Date(d.created_at).toLocaleString('ko-KR') : '-')
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#999' }, '생성 이력이 없습니다.')
      )
    )
  }

  // ==================== 예산/위험관리 (S-14) ====================
  function renderBudget() {
    const c = document.getElementById('page-budget')
    if (!c) return
    const budget = Store.getProjectBudget() || []
    const risks = Store.getRiskRegister() || []
    c.innerHTML = ''
    const totalPlanned = budget.reduce((s, b) => s + (b.planned_amount || 0), 0)
    const totalActual = budget.reduce((s, b) => s + (b.actual_amount || 0), 0)
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '💰 예산 관리')),
        el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;padding:16px 20px' },
          el('div', { className: 'stat-card' }, el('div', { className: 'stat-value' }, `₩${(totalPlanned/10000).toFixed(0)}만`), el('div', { className: 'stat-label' }, '계획 예산')),
          el('div', { className: 'stat-card' }, el('div', { className: 'stat-value' }, `₩${(totalActual/10000).toFixed(0)}만`), el('div', { className: 'stat-label' }, '집행 예산')),
          el('div', { className: 'stat-card' }, el('div', { className: 'stat-value', style: { color: totalPlanned ? (totalActual/totalPlanned > 0.9 ? '#e74c3c' : '#27ae60') : '#999' } }, totalPlanned ? Math.round(totalActual/totalPlanned*100) + '%' : '-'), el('div', { className: 'stat-label' }, '집행률'))
        ),
        budget.length ? (() => {
          const cats = {}
          budget.forEach(b => { if (!cats[b.category]) cats[b.category] = { planned: 0, actual: 0 }; cats[b.category].planned += b.planned_amount || 0; cats[b.category].actual += b.actual_amount || 0 })
          const maxVal = Math.max(...Object.values(cats).map(c => c.planned), 1)
          const colors = ['#7C3AED', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
          return el('div', { style: 'padding:0 20px 16px' },
            el('div', { style: 'font-size:12px;font-weight:600;color:#555;margin-bottom:8px' }, '카테고리별 예산 분포'),
            el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
              ...Object.entries(cats).map(([cat, val], i) => el('div', { style: 'display:flex;align-items:center;gap:8px;font-size:11px' },
                el('span', { style: 'width:80px;text-align:right;color:#666;flex-shrink:0' }, cat),
                el('div', { style: 'flex:1;height:18px;background:#f0f0f0;border-radius:4px;overflow:hidden;display:flex' },
                  el('div', { style: `width:${val.planned ? Math.round(val.planned/maxVal*100) : 0}%;background:${colors[i%colors.length]}20;border-right:2px solid ${colors[i%colors.length]};height:100%` }),
                  el('div', { style: `width:${val.planned ? Math.round(val.actual/maxVal*100) : 0}%;background:${colors[i%colors.length]};height:100%` })
                ),
                el('span', { style: 'width:80px;color:#888;flex-shrink:0' }, `₩${(val.actual/10000).toFixed(0)}/${(val.planned/10000).toFixed(0)}만`)
              ))
            )
          )
        })() : null
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '프로젝트 예산'),
          el('button', { className: 'btn btn-primary btn-sm', onClick: () => {
            modal('예산 항목 추가', el('div', {},
              el('div', { className: 'form-group' }, el('label', {}, '카테고리'), el('select', { id: 'budCat' }, ['인건비','라이선스','외부컨설팅','인프라','기타'].map(c => el('option', { value: c }, c)))),
              el('div', { className: 'form-group' }, el('label', {}, '계획 금액'), el('input', { type: 'number', id: 'budPlanned' })),
              el('div', { className: 'form-group' }, el('label', {}, '집행 금액'), el('input', { type: 'number', id: 'budActual', value: 0 })),
              el('div', { className: 'form-group' }, el('label', {}, '단계'), el('select', { id: 'budPeriod' }, ['1단계','2단계','3단계','4단계','5단계'].map(p => el('option', { value: p }, p))))
            ))
            document.getElementById('modal-save').onclick = () => {
              Store.addProjectBudget({ category: document.getElementById('budCat').value, planned_amount: parseInt(document.getElementById('budPlanned').value) || 0, actual_amount: parseInt(document.getElementById('budActual').value) || 0, period: document.getElementById('budPeriod').value })
              closeModal(); renderBudget()
            }
          }}, '+ 추가')
        ),
        budget.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '카테고리'), el('th', { style: 'width:80px' }, '단계'), el('th', { style: 'width:100px;text-align:right' }, '계획'), el('th', { style: 'width:100px;text-align:right' }, '집행'), el('th', { style: 'width:80px;text-align:center' }, '집행률'), el('th', { style: 'width:60px' }, '관리'))),
          el('tbody', {}, ...budget.map(b => {
            const rate = b.planned_amount ? Math.round(b.actual_amount / b.planned_amount * 100) : 0
            return el('tr', {},
              el('td', {}, b.category),
              el('td', { style: 'text-align:center' }, b.period),
              el('td', { style: 'text-align:right' }, `₩${(b.planned_amount/10000).toFixed(0)}만`),
              el('td', { style: 'text-align:right' }, `₩${(b.actual_amount/10000).toFixed(0)}만`),
              el('td', { style: 'text-align:center;color:' + (rate > 100 ? '#e74c3c' : rate > 80 ? '#f39c12' : '#27ae60') }, `${rate}%`),
              el('td', {}, el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteProjectBudget(b.id); renderBudget() } }, '삭제'))
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#999;text-align:center' }, '등록된 예산 항목이 없습니다.')
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '⚠️ 리스크 레지스터'),
          el('button', { className: 'btn btn-primary btn-sm', onClick: () => {
            modal('리스크 등록', el('div', {},
              el('div', { className: 'form-group' }, el('label', {}, '리스크 이름'), el('input', { id: 'riskName' })),
              el('div', { className: 'form-group' }, el('label', {}, '리스크 설명'), el('textarea', { id: 'riskDesc', rows: 2, style: 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px' })),
              el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
                el('div', { className: 'form-group' }, el('label', {}, '확률(1-5)'), el('input', { type: 'number', id: 'riskProb', min: 1, max: 5, value: 3 })),
                el('div', { className: 'form-group' }, el('label', {}, '영향(1-5)'), el('input', { type: 'number', id: 'riskImpact', min: 1, max: 5, value: 3 }))
              ),
              el('div', { className: 'form-group' }, el('label', {}, '대응 방안'), el('textarea', { id: 'riskMit', rows: 2, style: 'width:100%;padding:8px;border:1px solid #ddd;border-radius:6px' })),
              el('div', { className: 'form-group' }, el('label', {}, '담당자'), el('input', { id: 'riskOwner' }))
            ))
            document.getElementById('modal-save').onclick = () => {
              Store.addRiskRegister({ risk_name: document.getElementById('riskName').value, description: document.getElementById('riskDesc').value, probability: parseInt(document.getElementById('riskProb').value), impact: parseInt(document.getElementById('riskImpact').value), mitigation_plan: document.getElementById('riskMit').value, owner: document.getElementById('riskOwner').value, category: 'other', status: 'identified' })
              closeModal(); renderBudget()
            }
          }}, '+ 리스크 등록')
        ),
        risks.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '이름'), el('th', {}, '설명'), el('th', { style: 'width:50px' }, '확률'), el('th', { style: 'width:50px' }, '영향'), el('th', { style: 'width:60px' }, '점수'), el('th', {}, '대응방안'), el('th', { style: 'width:60px' }, '담당자'), el('th', { style: 'width:50px' }, '관리'))),
          el('tbody', {}, ...risks.sort((a,b) => (b.probability*b.impact) - (a.probability*a.impact)).map(r => {
            const score = r.probability * r.impact
            const color = score >= 15 ? '#e74c3c' : score >= 8 ? '#f39c12' : '#27ae60'
            return el('tr', {},
              el('td', {}, r.risk_name || ''),
              el('td', { style: 'font-size:11px' }, r.description || ''),
              el('td', { style: 'text-align:center' }, r.probability),
              el('td', { style: 'text-align:center' }, r.impact),
              el('td', { style: `text-align:center;color:${color};font-weight:700` }, score),
              el('td', { style: 'font-size:11px' }, r.mitigation_plan || ''),
              el('td', { style: 'font-size:11px' }, r.owner || ''),
              el('td', {}, el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteRiskRegister(r.id); renderBudget() } }, '삭제'))
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#999;text-align:center' }, '등록된 리스크가 없습니다.')
      )
    )
  }

  // ==================== 민감정보 마스킹 설정 (S-15) ====================
  function renderMasking() {
    const c = document.getElementById('page-masking')
    if (!c) return
    const rules = Store.getMaskingRules() || []
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '🔒 민감정보 마스킹 설정'),
          el('button', { className: 'btn btn-primary btn-sm', onClick: () => {
            modal('마스킹 규칙 추가', el('div', {},
              el('div', { className: 'form-group' }, el('label', {}, '필드명'), el('input', { id: 'maskField', placeholder: '예: 급여, 징계이력' })),
              el('div', { className: 'form-group' }, el('label', {}, '마스킹 유형'), el('select', { id: 'maskType' }, ['전체마스킹','부분마스킹','집계치만허용'].map(t => el('option', { value: t }, t)))),
              el('div', { className: 'form-group' }, el('label', { style: 'display:flex;align-items:center;gap:8px' }, el('input', { type: 'checkbox', id: 'maskAI', checked: true }), 'AI 외부 API 전송 시 적용'))
            ))
            document.getElementById('modal-save').onclick = () => {
              Store.addMaskingRule({ field_name: document.getElementById('maskField').value, masking_type: document.getElementById('maskType').value, applies_to_ai_api: document.getElementById('maskAI').checked })
              closeModal(); renderMasking()
            }
          }}, '+ 규칙 추가')
        ),
        el('div', { style: 'padding:12px 20px;background:#f8f9fa;border-bottom:1px solid #eee;font-size:12px;color:#666;line-height:1.6' },
          'AI 프롬프트 전송 전 민감정보를 자동 마스킹합니다.',
          el('br'),
          '전체마스킹: [마스킹됨] / 부분마스킹:첫 2글자+** / 집계치만허용: 개별값 숨김, 합계만 노출'
        ),
        rules.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '필드명'), el('th', {}, '마스킹 유형'), el('th', { style: 'width:120px' }, 'AI API 적용'), el('th', { style: 'width:60px' }, '관리'))),
          el('tbody', {}, ...rules.map(r => el('tr', {},
            el('td', { style: 'font-weight:500' }, r.field_name),
            el('td', {}, r.masking_type),
            el('td', { style: 'text-align:center;color:' + (r.applies_to_ai_api ? '#27ae60' : '#999') }, r.applies_to_ai_api ? '✅ 적용' : '❌ 미적용'),
            el('td', {}, el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteMaskingRule(r.id); renderMasking() } }, '삭제'))
          ))
        )) : el('p', { style: 'padding:16px;color:#999;text-align:center' }, '설정된 마스킹 규칙이 없습니다.')
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '🔍 마스킹 실시간 미리보기')),
        el('div', { style: 'padding:16px 20px' },
          el('div', { style: 'margin-bottom:12px' },
            el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px' }, '테스트할 데이터를 입력하세요'),
            el('input', { id: 'maskTestInput', type: 'text', placeholder: '예: 김철수, 서울시 강남구, 010-1234-5678', style: 'width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box', onInput: () => updateMaskPreview() })
          ),
          el('div', { id: 'mask-preview-result', style: 'font-size:12px;color:#666' }, '위 입력란에 데이터를 입력하면 마스킹 결과가 실시간으로 표시됩니다.')
        )
      )
    )
  }

  function updateMaskPreview() {
    const input = document.getElementById('maskTestInput')?.value || ''
    const container = document.getElementById('mask-preview-result')
    if (!container) return
    if (!input) { container.innerHTML = '<span style="color:#aaa">위 입력란에 데이터를 입력하면 마스킹 결과가 실시간으로 표시됩니다.</span>'; return }
    const rules = Store.getMaskingRules() || []
    const results = rules.map(r => {
      let masked = input
      if (r.masking_type === '전체마스킹') masked = '[마스킹됨]'
      else if (r.masking_type === '부분마스킹') masked = input.length > 2 ? input.slice(0, 2) + '**' : '**'
      else if (r.masking_type === '집계치만허용') masked = `(합계: ${input})`
      return { field: r.field_name, original: input, masked, applied: r.applies_to_ai_api }
    })
    container.innerHTML = `
      <div style="margin-bottom:8px;font-weight:600;color:#333">원본: <span style="color:#27ae60">${input}</span></div>
      ${results.length ? results.map(r => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0">
          <span style="width:100px;color:#888;font-size:11px">${r.field}</span>
          <span style="flex:1;color:#e74c3c;font-weight:500;font-size:12px">${r.masked}</span>
          <span style="font-size:10px;color:${r.applied ? '#27ae60' : '#999'}">${r.applied ? '✅ AI적용' : '❌ 미적용'}</span>
        </div>
      `).join('') : '<div style="color:#aaa;padding:8px 0">설정된 마스킹 규칙이 없습니다.</div>'}
    `
  }

  // ==================== 프로필 관리 ====================
  function openProfileModal() {
    const user = typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null
    if (!user) { alert('로그인이 필요합니다.'); return }
    const dept = user.dept_code ? (Store.getDepartments() || []).find(d => d.dept_code === user.dept_code) : null
    const form = el('form', { onSubmit: e => e.preventDefault() },
      el('div', { style: 'display:flex;align-items:center;gap:16px;margin-bottom:16px' },
        el('div', { style: 'width:56px;height:56px;border-radius:50%;background:#7C3AED20;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#7C3AED;flex-shrink:0' }, (user.name || '?')[0]),
        el('div', {},
          el('div', { style: 'font-weight:600;font-size:15px' }, user.name || '-'),
          el('div', { style: 'font-size:12px;color:#888' }, `${user.position || ''} · ${dept?.dept_name || user.dept_code || '미지정'}`)
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '아이디', el('input', { value: user.username || '', readonly: true, style: 'width:100%;padding:7px 10px;border:1px solid #eee;border-radius:6px;font-size:13px;background:#f9f9f9;color:#999;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '이름', el('input', { id: 'profName', value: user.name || '', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '이메일', el('input', { id: 'profEmail', type: 'email', value: user.email || '', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '전화번호', el('input', { id: 'profPhone', value: user.phone || '', placeholder: '010-0000-0000', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '부서', el('input', { value: dept?.dept_name || user.dept_code || '-', readonly: true, style: 'width:100%;padding:7px 10px;border:1px solid #eee;border-radius:6px;font-size:13px;background:#f9f9f9;color:#999;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '직급', el('input', { id: 'profPosition', value: user.position || '', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '역할', el('input', { value: roleLabel(user.role) || '-', readonly: true, style: 'width:100%;padding:7px 10px;border:1px solid #eee;border-radius:6px;font-size:13px;background:#f9f9f9;color:#999;box-sizing:border-box' }))
      )
    )
    modal('내 프로필', form)
    document.getElementById('modal-save').onclick = () => {
      const updates = { name: document.getElementById('profName').value, email: document.getElementById('profEmail').value, phone: document.getElementById('profPhone').value, position: document.getElementById('profPosition').value }
      Store.updateUser(user.id, updates)
      const s = getSession()
      if (s) { s.name = updates.name; sessionStorage.setItem('smart_esg_session', JSON.stringify(s)) }
      applyAuthUI()
      closeModal()
      showToast('프로필이 수정되었습니다.', 'success')
    }
  }

  function openPasswordModal() {
    const user = typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null
    if (!user) { alert('로그인이 필요합니다.'); return }
    const form = el('form', { onSubmit: e => e.preventDefault() },
      el('div', { style: 'display:flex;flex-direction:column;gap:10px' },
        el('label', { style: 'font-size:12px' }, '현재 비밀번호', el('input', { id: 'pwCurrent', type: 'password', required: true, style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '새 비밀번호', el('input', { id: 'pwNew', type: 'password', required: true, minLength: 6, style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '새 비밀번호 확인', el('input', { id: 'pwConfirm', type: 'password', required: true, style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }))
      )
    )
    modal('비밀번호 변경', form)
    document.getElementById('modal-save').onclick = async () => {
      const cur = document.getElementById('pwCurrent').value
      const nw = document.getElementById('pwNew').value
      const cf = document.getElementById('pwConfirm').value
      if (!cur || !nw || !cf) { alert('모든 필드를 입력하세요.'); return }
      if (nw !== cf) { alert('새 비밀번호가 일치하지 않습니다.'); return }
      if (nw.length < 6) { alert('비밀번호는 6자 이상이어야 합니다.'); return }
      const curHash = await Store.hashPassword(cur)
      const users = Store.getUsers()
      const u = users.find(x => x.id === user.id)
      if (!u || u.password !== curHash) { alert('현재 비밀번호가 올바르지 않습니다.'); return }
      const newHash = await Store.hashPassword(nw)
      Store.updateUser(user.id, { password: newHash })
      closeModal()
      showToast('비밀번호가 변경되었습니다.', 'success')
    }
  }

  // ==================== 프로젝트 관리 ====================
  let _pmView = 'list'
  let _pmFilter = 'all'
  const _catColors = { '평가': '#3b82f6', '증빙': '#10b981', '온실가스': '#f59e0b', '보고서': '#8b5cf6', '협력사': '#ef4444', '교육': '#06b6d4', '개선': '#84cc16', '일반': '#6b7280', '기타': '#9ca3af' }

  function renderProjectManagement() {
    const c = document.getElementById('page-project')
    if (!c) return
    const tasks = Store.getProjectTasks()
    const curUser = (typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null)
    const myTasks = curUser ? tasks.filter(t => String(t.assignee_id) === String(curUser.id)) : []
    let filtered = _pmFilter === 'all' ? tasks : _pmFilter === 'mine' ? myTasks : tasks.filter(t => t.status === _pmFilter)
    const statusCounts = { all: tasks.length, mine: myTasks.length, '대기': tasks.filter(t => t.status === '대기').length, '진행중': tasks.filter(t => t.status === '진행중').length, '검토': tasks.filter(t => t.status === '검토').length, '완료': tasks.filter(t => t.status === '완료').length, '지연': tasks.filter(t => t.status === '지연').length }
    const today = new Date()

    const headerCard = el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
      el('h3', { style: 'margin:0;font-size:15px;white-space:nowrap' }, '📅 프로젝트 관리'),
      el('span', { style: 'font-size:12px;color:#888' }, `${tasks.length}건`),
      Object.entries(statusCounts).map(([k, v]) => el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmFilter === k ? '#7C3AED' : '#f0f0f0'};color:${_pmFilter === k ? '#fff' : '#666'};border:1px solid ${_pmFilter === k ? '#7C3AED' : '#ddd'}`, onClick: () => { _pmFilter = k; renderProjectManagement() } }, `${k === 'all' ? '전체' : k === 'mine' ? '📌 내 업무' : k} (${v})`)),
      el('div', { style: 'flex:1' }),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'list' ? '#7C3AED' : '#f0f0f0'};color:${_pmView === 'list' ? '#fff' : '#666'}`, onClick: () => { _pmView = 'list'; renderProjectManagement() } }, '📋 목록'),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'gantt' ? '#7C3AED' : '#f0f0f0'};color:${_pmView === 'gantt' ? '#fff' : '#666'}`, onClick: () => { _pmView = 'gantt'; renderProjectManagement() } }, '📊 간트'),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'calendar' ? '#7C3AED' : '#f0f0f0'};color:${_pmView === 'calendar' ? '#fff' : '#666'}`, onClick: () => { _pmView = 'calendar'; renderProjectManagement() } }, '🗓 캘린더'),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'timeline' ? '#7C3AED' : '#f0f0f0'};color:${_pmView === 'timeline' ? '#fff' : '#666'}`, onClick: () => { _pmView = 'timeline'; renderProjectManagement() } }, '📜 타임라인'),
      el('button', { className: 'btn btn-primary btn-sm', onClick: () => _openProjectTaskModal(null) }, '+ 업무 추가')
    )
    c.innerHTML = ''
    c.append(headerCard)

    if (_pmView === 'gantt') { c.append(_renderPmGantt(filtered)); return }
    if (_pmView === 'calendar') { c.append(_renderPmCalendar(filtered)); return }
    if (_pmView === 'timeline') { c.append(_renderPmTimeline(filtered)); return }

    if (!filtered.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📅'), el('p', { style: 'color:#888' }, '등록된 업무가 없습니다.'), el('button', { className: 'btn btn-primary', onClick: () => _openProjectTaskModal(null) }, '+ 첫 업무 추가')))
      return
    }

    const priorityColors = { '높음': '#ef4444', '보통': '#3b82f6', '낮음': '#10b981' }
    const statusColors2 = { '대기': '#f59e0b', '진행중': '#3b82f6', '검토': '#8b5cf6', '완료': '#10b981', '지연': '#ef4444' }

    const listCard = el('div', { className: 'card', style: 'padding:0;overflow:hidden' })
    filtered.sort((a, b) => { const o = { '높음': 0, '보통': 1, '낮음': 2 }; return (o[a.priority] || 1) - (o[b.priority] || 1) }).forEach((task, idx) => {
      const isOverdue = task.due_date && new Date(task.due_date) < today && task.status !== '완료'
      const row = el('div', { style: `border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:12px;padding:12px 16px;${idx === filtered.length - 1 ? 'border-bottom:none' : ''}` },
        el('span', { style: `width:4px;height:32px;border-radius:2px;background:${priorityColors[task.priority] || '#999'};flex-shrink:0` }),
        el('div', { style: 'flex:1;min-width:0' },
          el('div', { style: 'font-size:13px;font-weight:600;color:#1a1a2e' }, task.title || '제목 없음'),
          el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:3px;flex-wrap:wrap;font-size:11px' },
            el('span', { style: `padding:2px 6px;border-radius:8px;background:${statusColors2[task.status] || '#999'}20;color:${statusColors2[task.status] || '#999'};font-weight:500` }, task.status || '대기'),
            task.assignee ? el('span', { style: 'color:#888' }, `👤 ${task.assignee}`) : null,
            task.department ? el('span', { style: 'color:#888' }, `🏢 ${task.department}`) : null,
            task.category && task.category !== '일반' ? el('span', { style: `padding:1px 5px;border-radius:4px;background:${_catColors[task.category] || '#6b7280'}18;color:${_catColors[task.category] || '#6b7280'};font-weight:500` }, task.category) : null,
            task.linked_type ? el('span', { style: 'padding:1px 5px;border-radius:4px;background:#f0f7ff;color:#3b82f6' }, `🔗 ${task.linked_type}`) : null
          )
        ),
        task.due_date ? el('span', { style: `font-size:11px;${isOverdue ? 'color:#ef4444;font-weight:600' : 'color:#888'}` }, isOverdue ? '⏰ 지연' : `📅 ${task.due_date}`) : null,
        task.progress > 0 ? el('div', { style: 'width:60px;display:flex;align-items:center;gap:4px' },
          el('div', { style: 'flex:1;height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden' }, el('div', { style: `width:${task.progress}%;height:100%;background:${task.progress >= 100 ? '#10b981' : '#3b82f6'};border-radius:2px` })),
          el('span', { style: 'font-size:9px;color:#888' }, `${task.progress}%`)
        ) : null,
        el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px', onClick: () => _openProjectTaskModal(task) }, '수정'),
        el('button', { className: 'btn btn-sm', style: 'font-size:11px;color:#e74c3c', onClick: () => { if (confirm('삭제?')) { Store.deleteProjectTask(task.id); showToast('삭제되었습니다.', 'success'); renderProjectManagement() } } }, '✕')
      )
      listCard.append(row)
    })
    c.append(listCard)
  }

  function _renderPmGantt(tasks) {
    const withDates = tasks.filter(t => t.start_date || t.due_date)
    if (!withDates.length) return el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📊'), el('p', { style: 'color:#888' }, '일정이 설정된 업무가 없습니다.'))

    const today = new Date()
    const allDates = withDates.flatMap(t => [t.start_date ? new Date(t.start_date) : null, t.due_date ? new Date(t.due_date) : null].filter(Boolean))
    const minDate = new Date(Math.min(...allDates)); minDate.setDate(minDate.getDate() - 3)
    const maxDate = new Date(Math.max(...allDates)); maxDate.setDate(maxDate.getDate() + 7)
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24))
    const dayWidth = Math.max(30, Math.min(50, 700 / totalDays))
    const todayOffset = Math.ceil((today - minDate) / (1000 * 60 * 60 * 24))

    const priorityColors = { '높음': '#ef4444', '보통': '#3b82f6', '낮음': '#10b981' }
    const statusColors2 = { '대기': '#f59e0b', '진행중': '#3b82f6', '검토': '#8b5cf6', '완료': '#10b981', '지연': '#ef4444' }

    const headerDays = []
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const isToday = d.toDateString() === today.toDateString()
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      headerDays.push(el('div', { style: `width:${dayWidth}px;flex-shrink:0;text-align:center;font-size:8px;padding:3px 0;${isToday ? 'background:#7C3AED20;font-weight:700;color:#7C3AED' : isWeekend ? 'background:#f8f9fa;color:#bbb' : 'color:#888'}` }, `${d.getMonth() + 1}/${d.getDate()}`))
    }

    const sorted = [...withDates].sort((a, b) => { const as = a.start_date ? new Date(a.start_date) : new Date(a.due_date); const bs = b.start_date ? new Date(b.start_date) : new Date(b.due_date); return as - bs })

    return el('div', { className: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { style: 'padding:10px 16px;border-bottom:1px solid #eee;font-weight:600;font-size:13px' }, `📊 간트차트 (${withDates.length}건)`),
      el('div', { style: 'display:flex;overflow-x:auto' },
        el('div', { style: 'min-width:150px;flex-shrink:0;border-right:1px solid #eee;background:#fafafa' },
          el('div', { style: 'height:28px;border-bottom:1px solid #eee;display:flex;align-items:center;padding:0 12px;font-size:10px;font-weight:600;color:#888' }, '업무명'),
          ...sorted.map(t => el('div', { style: 'height:28px;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;padding:0 10px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer', onClick: () => _openProjectTaskModal(t) },
            el('span', { style: `width:5px;height:5px;border-radius:50%;background:${statusColors2[t.status] || '#999'};margin-right:6px;flex-shrink:0` }),
            t.title || '-'
          ))
        ),
        el('div', { style: 'flex:1;overflow-x:auto;position:relative' },
          el('div', { style: `display:flex;height:28px;border-bottom:1px solid #eee;background:#fafafa` }, ...headerDays),
          ...sorted.map(t => {
            const start = t.start_date ? new Date(t.start_date) : new Date(t.due_date)
            const end = t.due_date ? new Date(t.due_date) : new Date(t.start_date)
            const startOff = Math.max(0, Math.ceil((start - minDate) / (1000 * 60 * 60 * 24)))
            const dur = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1)
            const color = priorityColors[t.priority] || '#3b82f6'
            const isOverdue = t.due_date && new Date(t.due_date) < today && t.status !== '완료'
            return el('div', { style: 'position:relative;height:28px;border-bottom:1px solid #f0f0f0' },
              el('div', { style: `position:absolute;left:${startOff * dayWidth}px;width:${dur * dayWidth}px;height:18px;top:5px;background:${isOverdue ? '#ef444420' : color + '20'};border:1px solid ${isOverdue ? '#ef444460' : color + '60'};border-radius:4px;cursor:pointer;overflow:hidden;display:flex;align-items:center;padding:0 4px`, onClick: () => _openProjectTaskModal(t), title: `${t.title}\n${t.start_date || '?'} ~ ${t.due_date || '?'}\n담당: ${t.assignee || '미지정'} (${t.progress || 0}%)\n${(t.depends_on||[]).length ? '의존: ' + (t.depends_on||[]).map(did => { const dt = tasks.find(x=>x.id===did); return dt?dt.title:did }).join(', ') : ''}` },
                el('div', { style: `height:100%;width:${t.progress || 0}%;background:${isOverdue ? '#ef4444' : color};border-radius:3px;transition:width .3s` }),
                el('span', { style: `position:absolute;left:4px;font-size:9px;font-weight:600;color:${isOverdue ? '#ef4444' : color};white-space:nowrap;text-shadow:0 0 3px #fff` }, t.title),
                (t.depends_on || []).length ? el('span', { style: 'position:absolute;right:4px;font-size:8px;color:#8b5cf6', title: `${(t.depends_on||[]).length}개 업무에 의존` }, '🔗') : null
              )
            )
          }),
          el('div', { style: `position:absolute;left:${todayOffset * dayWidth}px;width:2px;height:100%;background:#ef4444;z-index:2;top:0` })
        )
      )
    )
  }

  function _renderPmCalendar(tasks) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = now.getDate()
    const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

    const tasksByDay = {}
    tasks.forEach(t => {
      if (t.due_date) {
        const d = new Date(t.due_date)
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate()
          if (!tasksByDay[day]) tasksByDay[day] = []
          tasksByDay[day].push(t)
        }
      }
      if (t.start_date) {
        const d = new Date(t.start_date)
        if (d.getFullYear() === year && d.getMonth() === month) {
          const day = d.getDate()
          if (!tasksByDay['s' + day]) tasksByDay['s' + day] = []
          tasksByDay['s' + day].push(t)
        }
      }
    })

    const statusColors2 = { '대기': '#f59e0b', '진행중': '#3b82f6', '검토': '#8b5cf6', '완료': '#10b981', '지연': '#ef4444' }
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(el('div', { style: 'min-height:80px;background:#fafafa;border:1px solid #f0f0f0;border-radius:4px' }))
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today
      const dueTasks = tasksByDay[day] || []
      const startTasks = tasksByDay['s' + day] || []
      cells.push(el('div', { style: `min-height:80px;border:1px solid ${isToday ? '#7C3AED' : '#f0f0f0'};border-radius:4px;padding:4px;${isToday ? 'background:#f5f0ff' : 'background:#fff'}` },
        el('div', { style: `font-size:11px;font-weight:${isToday ? '700' : '500'};color:${isToday ? '#7C3AED' : '#333'};margin-bottom:2px` }, `${day}`),
        ...dueTasks.slice(0, 3).map(t => el('div', { style: `font-size:9px;padding:1px 4px;border-radius:3px;margin-bottom:1px;background:${statusColors2[t.status] || '#999'}20;color:${statusColors2[t.status] || '#999'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer`, onClick: () => _openProjectTaskModal(t), title: t.title }, `📅 ${t.title}`)),
        startTasks.filter(t => !dueTasks.includes(t)).slice(0, 2).map(t => el('div', { style: `font-size:9px;padding:1px 4px;border-radius:3px;margin-bottom:1px;background:#10b98120;color:#10b981;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer`, onClick: () => _openProjectTaskModal(t), title: t.title }, `▶ ${t.title}`)),
        (dueTasks.length + startTasks.length) > 5 ? el('div', { style: 'font-size:8px;color:#aaa;text-align:center' }, `+${dueTasks.length + startTasks.length - 5}건`) : null
      ))
    }

    return el('div', { className: 'card', style: 'padding:16px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px' },
        el('div', { style: 'text-align:center;font-weight:600;font-size:14px' }, `${year}년 ${monthNames[month]}`),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: _exportCalendarIcal, style: 'font-size:11px' }, '📤 캘린더 복사')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center' },
        ...['일', '월', '화', '수', '목', '금', '토'].map(d => el('div', { style: 'font-size:11px;font-weight:600;color:#888;padding:4px' }, d)),
        ...cells
      )
    )
  }

  function _renderPmTimeline(tasks) {
    if (!tasks.length) return el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('p', { style: 'color:#888' }, '표시할 업무가 없습니다.'))
    const logs = []
    tasks.forEach(t => {
      Store.getProjectTaskLogs(t.id).forEach(l => logs.push({ ...l, task_title: t.title, task_id: t.id }))
    })
    logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const actionIcons = { '생성': '🆕', '상태변경': '🔄', '진행률': '📊', '담당자변경': '👤', '코멘트': '💬' }

    const card = el('div', { className: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { style: 'padding:12px 16px;border-bottom:1px solid #eee;font-weight:600;font-size:13px' }, `📜 변경 이력 (${logs.length}건)`)
    )
    if (!logs.length) {
      card.append(el('div', { style: 'text-align:center;padding:40px;color:#888' }, '변경 이력이 없습니다.'))
    } else {
      logs.slice(0, 100).forEach((l, idx) => {
        card.append(el('div', { style: `padding:10px 16px;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid #f5f5f5;${idx === logs.length - 1 ? 'border-bottom:none' : ''}` },
          el('span', { style: 'font-size:18px;flex-shrink:0' }, actionIcons[l.action] || '📝'),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:2px' },
              el('span', { style: 'font-weight:600;font-size:12px;color:#333;cursor:pointer;text-decoration:underline', onClick: () => _openProjectTaskModal(tasks.find(t => t.id === l.task_id)) }, l.task_title),
              el('span', { style: 'font-size:11px;font-weight:500;color:#7C3AED' }, l.action),
              l.from_value ? el('span', { style: 'font-size:11px;text-decoration:line-through;color:#bbb' }, l.from_value) : null,
              l.to_value ? el('span', { style: 'font-size:11px;color:#27ae60;font-weight:500' }, l.to_value) : null
            ),
            el('div', { style: 'font-size:10px;color:#aaa' }, _formatDateTime(l.created_at))
          )
        ))
      })
    }
    return card
  }

  function _exportCalendarIcal() {
    const tasks = Store.getProjectTasks().filter(t => t.start_date || t.due_date)
    if (!tasks.length) { showToast('내보낼 일정이 없습니다.', 'warning'); return }
    let ical = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//SmartESG//KO\nCALSCALE:GREGORIAN\n'
    tasks.forEach(t => {
      const uid = `task-${t.id}@smartesg.local`
      const summary = (t.title || '').replace(/[\n\r,;:]/g, ' ')
      const desc = (t.description || '').replace(/[\n\r]/g, '\\n').replace(/[;,]/g, ' ')
      const dtstart = t.start_date ? t.start_date.replace(/-/g, '') + 'T090000' : t.due_date ? t.due_date.replace(/-/g, '') + 'T090000' : ''
      const dtend = t.due_date ? t.due_date.replace(/-/g, '') + 'T180000' : dtstart
      if (!dtstart) return
      ical += `BEGIN:VEVENT\nDTSTART:${dtstart}\nDTEND:${dtend}\nUID:${uid}\nSUMMARY:${summary}\nDESCRIPTION:${desc} (담당:${t.assignee || '미지정'} 상태:${t.status || '대기'})\nEND:VEVENT\n`
    })
    ical += 'END:VCALENDAR'
    navigator.clipboard.writeText(ical).then(() => showToast('iCal 형식으로 클립보드에 복사되었습니다.', 'success')).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = ical
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showToast('iCal 형식으로 클립보드에 복사되었습니다.', 'success')
    })
  }

  function _openProjectTaskModal(task) {
    const isEdit = !!task
    const categories = ['일반', '평가', '증빙', '온실가스', '보고서', '협력사', '교육', '개선', '기타']
    const priorities = ['높음', '보통', '낮음']
    const statuses = ['대기', '진행중', '검토', '완료', '지연']
    const repeats = [
      { value: 'none', label: '반복 없음' },
      { value: 'daily', label: '매일' },
      { value: 'weekly', label: '매주' },
      { value: 'monthly', label: '매월' }
    ]
    const users = (Store.getUsers() || []).filter(u => u.status === 'active')
    const depts = (Store.getDepartments() || []).filter(d => d.is_active !== false)
    const tasks = Store.getProjectTasks().filter(t => !task || t.id !== task.id)
    const logs = task ? Store.getProjectTaskLogs(task.id) : []
    const comments = task?.comments || []

    const userMap = {}
    users.forEach(u => { userMap[u.id] = u })

    const form = el('form', { onSubmit: e => e.preventDefault() },
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '제목 *', el('input', { id: 'pmTitle', value: task?.title || '', required: true, style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '카테고리', el('select', { id: 'pmCategory', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...categories.map(c => el('option', { value: c, selected: (task?.category || '일반') === c }, c)))),
        el('label', { style: 'font-size:12px' }, '담당자', el('select', { id: 'pmAssignee', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box', onChange: () => { const uid = document.getElementById('pmAssignee').value; const u = userMap[uid]; if (u) { const ds = document.getElementById('pmDept'); const dOpt = [...ds.options].find(o => o.value === u.dept_code); if (dOpt) ds.value = u.dept_code } } }, el('option', { value: '' }, '미지정'), ...users.map(u => el('option', { value: u.id, selected: String(task?.assignee_id) === String(u.id) }, `${u.name} (${u.position || ''})`)))),
        el('label', { style: 'font-size:12px' }, '부서', el('select', { id: 'pmDept', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }, el('option', { value: '' }, '미지정'), ...depts.map(d => el('option', { value: d.dept_code, selected: (task?.dept_code || '') === d.dept_code }, d.dept_name)))),
        el('label', { style: 'font-size:12px' }, '우선순위', el('select', { id: 'pmPriority', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...priorities.map(p => el('option', { value: p, selected: (task?.priority || '보통') === p }, p)))),
        el('label', { style: 'font-size:12px' }, '상태', el('select', { id: 'pmStatus', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...statuses.map(s => el('option', { value: s, selected: (task?.status || '대기') === s }, s)))),
        el('label', { style: 'font-size:12px' }, '시작일', el('input', { id: 'pmStart', type: 'date', value: task?.start_date || '', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '마감일', el('input', { id: 'pmDue', type: 'date', value: task?.due_date || '', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }))
      ),
      el('div', { style: 'margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '반복', el('select', { id: 'pmRepeat', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...repeats.map(r => el('option', { value: r.value, selected: (task?.repeat || 'none') === r.value }, r.label)))),
        el('label', { style: 'font-size:12px' }, '반복 종료일', el('input', { id: 'pmRepeatUntil', type: 'date', value: task?.repeat_until || '', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box' }))
      ),
      el('label', { style: 'font-size:12px;margin-top:8px;display:block' }, '설명 (@"이름"으로 담당자 태그 가능)', el('textarea', { id: 'pmDesc', value: task?.description || '', rows: '3', style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;resize:vertical', onInput: (e) => _handleMentionInput(e, users) })),
      el('div', { id: 'pmMentionList', style: 'position:relative' }),
      el('div', { style: 'margin-top:8px;display:flex;align-items:center;gap:8px' },
        el('label', { style: 'font-size:12px' }, '진행률'),
        el('input', { id: 'pmProgress', type: 'range', min: '0', max: '100', value: task?.progress || '0', style: 'flex:1', onInput: () => { const v = document.getElementById('pmProgressVal'); if (v) v.textContent = document.getElementById('pmProgress').value + '%' } }),
        el('span', { id: 'pmProgressVal', style: 'font-size:11px;color:#888;min-width:30px' }, (task?.progress || '0') + '%')
      ),
      tasks.length ? el('label', { style: 'font-size:12px;margin-top:8px;display:block' },
        '의존 업무',
        el('select', { id: 'pmDepends', multiple: true, style: 'width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;min-height:60px' },
          ...tasks.map(t => el('option', { value: t.id, selected: (task?.depends_on || []).includes(t.id) }, `${t.title} (${t.assignee || '미지정'})`))
        )
      ) : null,
      isEdit && logs.length ? el('div', { style: 'margin-top:12px' },
        el('div', { style: 'font-size:12px;font-weight:600;margin-bottom:6px;color:#555' }, '📋 변경 이력'),
        el('div', { style: 'max-height:120px;overflow-y:auto;font-size:11px;color:#666', id: 'pmTimeline' },
          ...logs.slice(0, 20).map(l => el('div', { style: 'padding:4px 0;border-bottom:1px solid #f5f5f5;display:flex;gap:8px;align-items:center' },
            el('span', { style: 'color:#aaa;white-space:nowrap' }, _formatDateTime(l.created_at)),
            el('span', { style: 'font-weight:500;color:#555' }, l.action),
            l.from_value ? el('span', { style: 'text-decoration:line-through;color:#bbb' }, l.from_value) : null,
            l.to_value ? el('span', { style: 'color:#27ae60;font-weight:500' }, l.to_value) : null
          ))
        )
      ) : null,
      isEdit ? el('div', { style: 'margin-top:12px' },
        el('div', { style: 'font-size:12px;font-weight:600;margin-bottom:6px;color:#555' }, '💬 코멘트'),
        el('div', { id: 'pmComments', style: 'max-height:120px;overflow-y:auto;margin-bottom:6px' },
          ...comments.map(c => el('div', { style: 'padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:11px' },
            el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:2px' },
              el('span', { style: 'font-weight:600;color:#555' }, c.user_name || '익명'),
              el('span', { style: 'color:#aaa' }, _formatDateTime(c.created_at))
            ),
            el('div', { style: 'color:#333' }, c.text)
          ))
        ),
        el('div', { style: 'display:flex;gap:6px' },
          el('input', { id: 'pmCommentInput', placeholder: '코멘트 입력...', style: 'flex:1;padding:6px 10px;border:1px solid #ddd;border-radius:6px;font-size:12px', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _addTaskComment(task.id) } } }),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => _addTaskComment(task.id), style: 'font-size:11px;padding:4px 10px' }, '등록')
        )
      ) : null
    )

    modal(isEdit ? '업무 수정' : '업무 추가', form, isEdit ? [{ label: '🗑 삭제', className: 'btn btn-danger', onClick: () => { if (confirm('이 업무를 삭제하시겠습니까?')) { Store.deleteProjectTask(task.id); closeModal(); showToast('삭제되었습니다.', 'success'); renderProjectManagement() } } }] : [])
    document.getElementById('modal-save').onclick = () => {
      const data = {
        title: document.getElementById('pmTitle').value,
        category: document.getElementById('pmCategory').value,
        assignee_id: document.getElementById('pmAssignee').value || null,
        assignee: document.getElementById('pmAssignee').selectedOptions[0]?.textContent?.replace(/\s*\(.*\)/, '') || '',
        dept_code: document.getElementById('pmDept').value,
        department: document.getElementById('pmDept').selectedOptions[0]?.textContent || '',
        priority: document.getElementById('pmPriority').value,
        status: document.getElementById('pmStatus').value,
        start_date: document.getElementById('pmStart').value,
        due_date: document.getElementById('pmDue').value,
        description: document.getElementById('pmDesc').value,
        progress: parseInt(document.getElementById('pmProgress').value),
        repeat: document.getElementById('pmRepeat').value,
        repeat_until: document.getElementById('pmRepeatUntil').value,
        depends_on: [...(document.getElementById('pmDepends')?.selectedOptions || [])].map(o => parseInt(o.value))
      }
      if (!data.title) { alert('제목을 입력하세요.'); return }
      let savedTask
      if (isEdit) { Store.updateProjectTask(task.id, data); savedTask = task }
      else { savedTask = Store.addProjectTask(data); if (data.repeat !== 'none' && data.repeat_until && data.start_date && data.due_date) _createRepeatingTasks(savedTask, data) }
      closeModal()
      showToast(isEdit ? '수정되었습니다.' : '추가되었습니다.', 'success')
      renderProjectManagement()
    }
  }

  function _handleMentionInput(e, users) {
    const ta = e.target
    const val = ta.value
    const cur = ta.selectionStart
    const before = val.substring(0, cur)
    const match = before.match(/@(\S*)$/)
    const list = document.getElementById('pmMentionList')
    if (!list) { if (e.target._mentionHandler) { e.target._mentionHandler = null } return }
    if (match) {
      const q = match[1].toLowerCase()
      const found = users.filter(u => !q || u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)).slice(0, 5)
      if (found.length) {
        list.innerHTML = ''
        const ul = el('div', { style: 'position:absolute;left:0;right:0;background:#fff;border:1px solid #ddd;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;max-height:120px;overflow-y:auto' })
        found.forEach(u => {
          const item = el('div', { style: 'padding:6px 10px;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:center', onClick: () => { const pre = val.substring(0, cur - match[0].length); const post = val.substring(cur); ta.value = pre + '@' + u.name + ' ' + post; list.innerHTML = ''; ta.focus() } }, el('span', { style: 'font-weight:600' }, u.name), el('span', { style: 'color:#888' }, u.position || ''))
          ul.append(item)
        })
        list.append(ul)
        return
      }
    }
    list.innerHTML = ''
  }

  function _addTaskComment(taskId) {
    const input = document.getElementById('pmCommentInput')
    if (!input || !input.value.trim()) return
    const user = typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null
    Store.addProjectTaskComment(taskId, input.value.trim(), user?.id || null, user?.name || '익명')
    _openProjectTaskModal(Store.getProjectTasks().find(t => t.id === taskId))
  }

  function _createRepeatingTasks(baseTask, data) {
    const start = new Date(data.start_date)
    const end = new Date(data.due_date)
    const repeatEnd = new Date(data.repeat_until)
    const dur = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    let next = new Date(start)
    if (data.repeat === 'daily') next.setDate(next.getDate() + 1)
    else if (data.repeat === 'weekly') next.setDate(next.getDate() + 7)
    else if (data.repeat === 'monthly') next.setMonth(next.getMonth() + 1)
    while (next <= repeatEnd) {
      const ns = new Date(next)
      const ne = new Date(ns); ne.setDate(ne.getDate() + dur)
      Store.addProjectTask({ ...data, title: data.title + ' (반복)', start_date: _fmtDate(ns), due_date: _fmtDate(ne), status: '대기', progress: 0, repeat: 'none', depends_on: [], comments: [], created_at: new Date().toISOString() })
      if (data.repeat === 'daily') next.setDate(next.getDate() + 1)
      else if (data.repeat === 'weekly') next.setDate(next.getDate() + 7)
      else if (data.repeat === 'monthly') next.setMonth(next.getMonth() + 1)
      else break
    }
  }

  function _fmtDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  function _formatDateTime(iso) { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }

  // ==================== 대시보드 ====================
  let _dashAssId = null
  function setDashAssessment(id) { _dashAssId = id; renderDashboard() }
  function renderDashboard() {
    const c = document.getElementById('page-dashboard')
    if (!c) return
    const assessments = Store.getAssessments() || []
    c.innerHTML = ''

    const projectCard = _renderDashboardProjectSummary()
    if (projectCard) c.append(projectCard)

    if (!assessments.length) {
      c.append(el('div', { style: 'text-align:center;padding:60px 40px' }, el('div', { style: 'font-size:48px;margin-bottom:16px' }, '📊'), el('h2', { style: 'margin:0 0 8px;color:#2c3e50' }, 'Smart ESG에 오신 것을 환영합니다'), el('p', { style: 'margin:0 0 24px;color:#888;font-size:14px;line-height:1.6' }, 'ESG 평가를 시작하려면 먼저 평가를 생성하세요.'), el('button', { className: 'btn btn-primary', style: 'font-size:16px;padding:12px 32px', onClick: () => navigate('assessment') }, '+ 첫 번째 평가 만들기')))
      return
    }
    _dashAssId = _dashAssId || assessments[0]?.id
    if (!assessments.find(a => a.id === _dashAssId)) _dashAssId = assessments[0]?.id
    const selOpts = assessments.map(a => '<option value="' + a.id + '"' + (a.id === _dashAssId ? ' selected' : '') + '>' + a.title + ' (' + a.assessment_year + '년)</option>').join('')
    c.append(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eee;background:#fff;border-radius:12px 12px 0 0' }, el('h3', { style: 'margin:0;font-size:16px' }, '📊 대시보드'), el('div', { style: 'display:flex;gap:8px;align-items:center' }, Object.assign(document.createElement('div'), { innerHTML: '<select id="dashAssSelect" style="padding:6px 12px;border:1px solid #ddd;border-radius:6px;font-size:13px" onchange="setDashAssessment(Number(this.value))">' + selOpts + '</select>' }).firstChild)))
    const gridDiv = document.createElement('div')
    gridDiv.id = 'dashGrid'
    c.append(gridDiv)
    Dashboard.render('dashGrid', _dashAssId)
  }

  function _renderDashboardProjectSummary() {
    const tasks = Store.getProjectTasks() || []
    if (!tasks.length) return null
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
    const overdue = tasks.filter(t => t.due_date && t.due_date < todayStr && t.status !== '완료').length
    const inProgress = tasks.filter(t => t.status === '진행중').length
    const todayDue = tasks.filter(t => t.due_date === todayStr && t.status !== '완료').length
    const weekDue = tasks.filter(t => t.due_date && t.due_date >= todayStr && t.due_date <= weekEnd.toISOString().slice(0, 10) && t.status !== '완료').length
    const done = tasks.filter(t => t.status === '완료').length
    const total = tasks.length
    const avgProgress = total ? Math.round(tasks.reduce((s, t) => s + (t.progress || 0), 0) / total) : 0

    const statBox = (label, value, color) => el('div', { style: `flex:1;min-width:80px;text-align:center;padding:10px 8px;background:${color}10;border-radius:8px;border:1px solid ${color}20`, onClick: () => navigate('project'), cursor: 'pointer' },
      el('div', { style: `font-size:20px;font-weight:700;color:${color}` }, String(value)),
      el('div', { style: 'font-size:10px;color:#888;margin-top:2px' }, label)
    )

    return el('div', { className: 'card', style: 'padding:16px 20px;margin-bottom:16px;cursor:default' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px' },
        el('h3', { style: 'margin:0;font-size:14px;display:flex;align-items:center;gap:6px', onClick: () => navigate('project'), style: 'cursor:pointer' }, '📅 프로젝트 현황'),
        el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px', onClick: () => navigate('project') }, '전체보기 →')
      ),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px' },
        statBox('오늘 마감', todayDue, '#f59e0b'),
        statBox('진행중', inProgress, '#3b82f6'),
        statBox('지연', overdue, '#ef4444'),
        statBox('이번주', weekDue, '#8b5cf6'),
        statBox('완료', done, '#10b981')
      ),
      el('div', { style: 'display:flex;align-items:center;gap:8px' },
        el('div', { style: 'flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden' }, el('div', { style: `width:${avgProgress}%;height:100%;background:linear-gradient(90deg,#7C3AED,#3b82f6);border-radius:3px;transition:width .3s` })),
        el('span', { style: 'font-size:11px;color:#888;white-space:nowrap' }, `전체 진행률 ${avgProgress}%`)
      )
    )
  }

  function _showFirstLoginProjectPopup() {
    const user = typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null
    if (!user) return
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const flagKey = `smart_esg_proj_seen_${user.id}_${today}`
    if (localStorage.getItem(flagKey)) return
    const tasks = Store.getProjectTasks() || []
    if (!tasks.length) return
    localStorage.setItem(flagKey, '1')
    const todayStr = new Date().toISOString().slice(0, 10)
    const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7)
    const overdue = tasks.filter(t => t.due_date && t.due_date < todayStr && t.status !== '완료')
    const inProgress = tasks.filter(t => t.status === '진행중')
    const todayDue = tasks.filter(t => t.due_date === todayStr && t.status !== '완료')
    const weekDue = tasks.filter(t => t.due_date && t.due_date >= todayStr && t.due_date <= weekEnd.toISOString().slice(0, 10) && t.status !== '완료')
    const myTasks = user.id ? tasks.filter(t => String(t.assignee_id) === String(user.id) && t.status !== '완료') : []

    const overlay = el('div', { style: 'position:fixed;top:0;right:0;bottom:0;width:400px;max-width:100vw;background:#fff;box-shadow:-4px 0 24px rgba(0,0,0,.15);z-index:9999;transform:translateX(100%);transition:transform .3s ease;display:flex;flex-direction:column', id: 'first-login-slide' },
      el('div', { style: 'padding:20px 24px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center' },
        el('div', {},
          el('div', { style: 'font-size:18px;font-weight:700;color:#1a1a2e' }, `안녕하세요, ${user.name}님! 👋`),
          el('div', { style: 'font-size:12px;color:#888;margin-top:2px' }, `${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 프로젝트 현황`)
        ),
        el('button', { style: 'background:none;border:none;font-size:20px;cursor:pointer;color:#999;padding:4px 8px', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) { s.style.transform = 'translateX(100%)'; setTimeout(() => s.remove(), 300) } } }, '✕')
      ),
      el('div', { style: 'flex:1;overflow-y:auto;padding:16px 24px' },
        el('div', { style: 'font-size:12px;font-weight:600;color:#555;margin-bottom:8px' }, '📊 오늘의 업무 요약'),
        ...[
          { label: '⏰ 오늘 마감', items: todayDue, color: '#f59e0b' },
          { label: '🔄 진행중', items: inProgress, color: '#3b82f6' },
          { label: '🚨 지연', items: overdue, color: '#ef4444' },
          { label: '📅 이번주 예정', items: weekDue, color: '#8b5cf6' }
        ].filter(s => s.items.length).map(s => el('div', { style: 'margin-bottom:12px' },
          el('div', { style: 'font-size:12px;font-weight:600;color:' + s.color + ';margin-bottom:4px' }, `${s.label} (${s.items.length}건)`),
          ...s.items.slice(0, 5).map(t => el('div', { style: 'padding:6px 8px;background:#fafafa;border-radius:6px;margin-bottom:3px;font-size:11px;display:flex;justify-content:space-between;align-items:center;cursor:pointer', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) s.remove(); navigate('project') } },
            el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.title),
            el('span', { style: 'color:#888;white-space:nowrap;margin-left:8px;font-size:10px' }, t.assignee || '미지정')
          )),
          s.items.length > 5 ? el('div', { style: 'font-size:10px;color:#aaa;text-align:center;padding:4px' }, `+${s.items.length - 5}건 더보기`) : null
        )),
        !overdue.length && !inProgress.length && !todayDue.length && !weekDue.length ? el('div', { style: 'text-align:center;padding:20px;color:#aaa;font-size:13px' }, '🎉 모든 업무를 완료했습니다!') : null,
        myTasks.length ? el('div', { style: 'margin-top:16px' },
          el('div', { style: 'font-size:12px;font-weight:600;color:#555;margin-bottom:8px' }, `📌 나의 미완료 업무 (${myTasks.length}건)`),
          ...myTasks.slice(0, 5).map(t => el('div', { style: 'padding:6px 8px;background:#f5f0ff;border-radius:6px;margin-bottom:3px;font-size:11px;display:flex;justify-content:space-between;align-items:center;cursor:pointer', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) s.remove(); navigate('project') } },
            el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.title),
            el('span', { style: 'color:#7C3AED;white-space:nowrap;margin-left:8px;font-size:10px' }, `${t.progress || 0}%`)
          ))
        ) : null
      ),
      el('div', { style: 'padding:16px 24px;border-top:1px solid #f0f0f0' },
        el('button', { className: 'btn btn-primary', style: 'width:100%;padding:10px', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) s.remove(); navigate('project') } }, '프로젝트 관리로 이동')
      )
    )
    document.body.append(overlay)
    setTimeout(() => { overlay.style.transform = 'translateX(0)' }, 50)
  }

  // ==================== Settings: Companies ====================
  function renderCompanies() {
    const c = document.getElementById('companies-content')
    const companies = Store.getCompanies()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '회사 정보'),
          el('button', { className: 'btn btn-primary', onClick: openAddCompany }, '+ 회사 추가')
        ),
        companies.length ? sortableTable('companies', [
          { label: '회사명', key: 'name', value: cp => cp.name || '-' },
          { label: '대표', key: 'representative' },
          { label: '사업자번호', key: 'business_no' },
          { label: '업종', key: 'industry' }
        ], companies, {
          bulkDelete: id => Store.deleteCompany(id),
          actions: cp => [
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('삭제?')) { Store.deleteCompany(cp.id); renderCompanies() } } }, '삭제')
          ]
        }) : el('p', { style: 'padding:20px;color:#999' }, '등록된 회사가 없습니다.')
      )
    )
  }

  function openAddCompany() {
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const name = el('input', { required: true })
    const rep = el('input')
    const biz = el('input')
    const ind = el('input')
    form.append(el('label', {}, '회사명 *', name), el('label', {}, '대표자', rep), el('label', {}, '사업자번호', biz), el('label', {}, '업종', ind))
    modal('회사 추가', form)
    document.getElementById('modal-save').onclick = () => {
      Store.addCompany({ name: name.value, representative: rep.value, business_no: biz.value, industry: ind.value })
      closeModal(); renderCompanies()
    }
  }

  // ==================== Settings: Departments ====================
  function renderDepartments() {
    const c = document.getElementById('departments-content')
    const departments = Store.getDepartments()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, `부서 관리 (${departments.length}개)`),
          el('button', { className: 'btn btn-primary', onClick: openAddDepartment }, '+ 부서 추가')
        ),
        departments.length ? sortableTable('departments', [
          { label: '부서코드', key: 'dept_code', value: d => el('span', { style: 'font-family:monospace;font-weight:600' }, d.dept_code) },
          { label: '부서명', key: 'dept_name' },
          { label: '담당자', key: 'manager_name', value: d => d.manager_name || '-' },
          { label: '이메일', key: 'manager_email', value: d => d.manager_email || '-' },
          { label: '상위부서', key: 'parent_dept', value: d => d.parent_dept || '-' },
          { label: '상태', value: d => el('span', { className: 'badge ' + (d.is_active !== false ? 'badge-paid' : 'badge-unpaid') }, d.is_active !== false ? '활성' : '비활성') }
        ], departments, {
          bulkDelete: id => Store.deleteDepartment(id),
          actions: d => [
            el('button', { className: 'btn btn-sm btn-secondary', style: { marginRight: 4 }, onClick: () => editDepartment(d.id) }, '수정'),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('삭제?')) { Store.deleteDepartment(d.id); renderDepartments() } } }, '삭제')
          ]
        }) : el('p', { style: 'padding:20px;color:#999' }, '등록된 부서가 없습니다.')
      )
    )
  }

  function openAddDepartment() { createDepartmentModal() }
  function editDepartment(id) { const dept = Store.getDepartments().find(x => x.id === id); if (dept) createDepartmentModal(dept) }

  function createDepartmentModal(dept) {
    const isEdit = !!dept
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const deptCode = el('input', { value: dept?.dept_code ?? '', required: true, placeholder: '예: ENV, HR, FIN', style: 'padding:8px 10px;border:1px solid #ddd;border-radius:6px;width:100%;font-size:13px' })
    const deptName = el('input', { value: dept?.dept_name ?? '', required: true, placeholder: '예: 환경팀', style: 'padding:8px 10px;border:1px solid #ddd;border-radius:6px;width:100%;font-size:13px' })
    const managerName = el('input', { value: dept?.manager_name ?? '', placeholder: '예: 김철수', style: 'padding:8px 10px;border:1px solid #ddd;border-radius:6px;width:100%;font-size:13px' })
    const managerEmail = el('input', { type: 'email', value: dept?.manager_email ?? '', placeholder: '예: team@company.com', style: 'padding:8px 10px;border:1px solid #ddd;border-radius:6px;width:100%;font-size:13px' })
    const parentDept = el('select', { style: 'padding:8px 10px;border:1px solid #ddd;border-radius:6px;width:100%;font-size:13px' },
      el('option', { value: '' }, '(없음)'),
      ...Store.getDepartments().filter(d => d.is_active !== false && d.dept_code !== dept?.dept_code).map(d => el('option', { value: d.dept_code, selected: dept?.parent_dept === d.dept_code }, d.dept_name))
    )
    const isActive = el('input', { type: 'checkbox', checked: dept?.is_active !== false })
    const toggleWrap = el('label', { style: 'display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px' },
      el('span', { style: `display:inline-block;width:36px;height:20px;background:${isActive.checked ? '#10B981' : '#ccc'};border-radius:10px;position:relative;transition:.2s` }, ''),
      el('span', {}, isActive.checked ? '활성' : '비활성')
    )
    isActive.addEventListener('change', () => {
      toggleWrap.children[0].style.background = isActive.checked ? '#10B981' : '#ccc'
      toggleWrap.children[1].textContent = isActive.checked ? '활성' : '비활성'
    })

    form.append(
      el('div', { style: 'margin-bottom:10px' }, el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '부서코드 *'), deptCode),
      el('div', { style: 'margin-bottom:10px' }, el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '부서명 *'), deptName),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px' },
        el('div', {}, el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '담당자'), managerName),
        el('div', {}, el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '담당자 이메일'), managerEmail)
      ),
      el('div', { style: 'margin-bottom:10px' }, el('label', { style: 'font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:3px' }, '상위부서'), parentDept),
      el('div', { style: 'padding:10px 12px;background:#f8f9fa;border-radius:8px;display:flex;align-items:center;gap:10px' }, isActive, toggleWrap)
    )
    modal(isEdit ? '부서 수정' : '부서 추가', form)
    document.getElementById('modal-save').onclick = () => {
      try {
        if (!deptCode.value.trim()) return alert('부서코드를 입력하세요')
        if (!deptName.value.trim()) return alert('부서명를 입력하세요')
        const data = {
          dept_code: deptCode.value.trim().toUpperCase(),
          dept_name: deptName.value.trim(),
          manager_name: managerName.value.trim(),
          manager_email: managerEmail.value.trim(),
          parent_dept: parentDept.value,
          is_active: isActive.checked
        }
        if (isEdit) Store.updateDepartment(dept.id, data)
        else Store.addDepartment(data)
        closeModal(); renderDepartments()
      } catch (err) {
        alert('저장 중 오류 발생: ' + err.message)
        console.error('Department save error:', err)
      }
    }
  }

  // ==================== Settings: Weights & Thresholds ====================
  function renderWeights() {
    const c = document.getElementById('weights-content')
    const params = Store.getWeightParams()
    const thresholds = Store.getRatingThresholds()
    const years = [...new Set([...params.map(p => p.year), ...thresholds.map(t => t.year), 2026])].sort()
    const year = years[years.length - 1]
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `테마별 가중치 (${year}년)`)),
        el('table', { className: 'table-dense' },
          el('thead', {}, el('tr', {}, el('th', {}, '기관'), el('th', {}, '그룹'), el('th', {}, '가중치(%)'))),
          el('tbody', {}, ...Store.getAgencyMaster().map(ag => {
            const auth = ag.code
            const authParams = params.filter(p => p.authority_code === auth && p.year === year && p.theme_code !== '_PILLAR')
            if (!authParams.length) return el('tr', {}, el('td', { colspan: 3, style: 'color:#999;text-align:center' }, `${ag.name}: 설정된 가중치 없음`))
            return authParams.map(p => el('tr', {},
              el('td', {}, Indicator.getAuthorityName(auth)),
              el('td', {}, p.theme_code),
              el('td', {},
                el('input', { type: 'number', min: 0, max: 100, value: p.weight, style: 'width:60px;padding:4px;border:1px solid #ddd;border-radius:4px;text-align:center', onBlur: e => { Store.updateWeightParam(p.id, { weight: parseInt(e.target.value) || 0 }) } })
              )
            ))
          }).flat())
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `필러별 가중치 - EcoVadis (${year}년)`)),
        el('div', { style: 'padding:12px 16px;background:#f8f6ff;border-bottom:1px solid #eee;font-size:12px;color:#666' },
          'EcoVadis 공식 기준: POLICY 25% / ACTION 40% / RESULT 35%'
        ),
        el('table', { className: 'table-dense' },
          el('thead', {}, el('tr', {}, el('th', {}, '필러'), el('th', {}, '가중치(%)'), el('th', {}, '해석'))),
          el('tbody', {}, ...['POLICY', 'ACTION', 'RESULT'].map(p => {
            const pw = params.find(pp => pp.authority_code === 'ECOVADIS' && pp.theme_code === '_PILLAR' && pp.pillar === p && pp.year === year)
            const interp = { POLICY: '정책 수립 여부 및 범위', ACTION: '조치·이행 (측정·인증·전개도)', RESULT: '결과·보고 (KPI·360° Watch)' }
            return el('tr', {},
              el('td', { style: 'font-weight:500' }, `${Indicator.getPillarName(p)} (${p})`),
              el('td', {}, el('input', { type: 'number', min: 0, max: 100, value: pw?.weight ?? 0, style: 'width:60px;padding:4px;border:1px solid #ddd;border-radius:4px;text-align:center', onBlur: e => {
                if (pw) Store.updateWeightParam(pw.id, { weight: parseInt(e.target.value) || 0 })
              } })),
              el('td', { style: 'font-size:12px;color:#888' }, interp[p] || '')
            )
          }))
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `등급 기준 (${year}년)`)),
        el('table', { className: 'table-dense' },
          el('thead', {}, el('tr', {}, el('th', {}, '기관'), el('th', {}, '등급'), el('th', {}, '최소'), el('th', {}, '최대'))),
          el('tbody', {}, ...Store.getAgencyMaster().map(ag => {
            const auth = ag.code
            const authThresholds = thresholds.filter(t => t.authority_code === auth && t.year === year).sort((a, b) => b.min_score - a.min_score)
            if (!authThresholds.length) return el('tr', {}, el('td', { colspan: 4, style: 'color:#999;text-align:center' }, `${ag.name}: 설정된 등급 기준 없음`))
            return authThresholds.map(t => el('tr', {},
              el('td', {}, ag.name),
              el('td', { style: 'font-weight:600' }, t.rating),
              el('td', {}, el('input', { type: 'number', value: t.min_score, style: 'width:50px;padding:4px;border:1px solid #ddd;border-radius:4px;text-align:center', onBlur: e => { Store.updateRatingThreshold(t.id, { min_score: parseInt(e.target.value) || 0 }) } })),
              el('td', {}, el('input', { type: 'number', value: t.max_score, style: 'width:50px;padding:4px;border:1px solid #ddd;border-radius:4px;text-align:center', onBlur: e => { Store.updateRatingThreshold(t.id, { max_score: parseInt(e.target.value) || 100 }) } }))
            ))
          }).flat())
        )
      )
    )
  }

  function renderAgencies() {
    const c = document.getElementById('agencies-content')
    if (!c) return
    const agencies = Store.getAgencyMaster()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, `평가기관 목록 (${agencies.length}개)`),
          el('button', { className: 'btn btn-primary', onClick: () => {
            const form = el('form', { onSubmit: e => e.preventDefault() })
            const code = el('input', { required: true, placeholder: '예: KSSB, ECOVADIS' })
            const name = el('input', { required: true, placeholder: '예: 한국지속가능성보고서 기준' })
            const nameKr = el('input', { placeholder: '예: KSSB' })
            const country = el('input', { value: 'KR', placeholder: 'KR' })
            const trackType = el('select', {},
              el('option', { value: 'MANDATORY' }, '법정 의무 (MANDATORY)'),
              el('option', { value: 'VOLUNTARY' }, '자율 공시 (VOLUNTARY)')
            )
            const effDate = el('input', { type: 'date' })
            const isActive = el('input', { type: 'checkbox', checked: true })
            form.append(
              el('label', {}, '기관 코드 *', code),
              el('label', {}, '영문명 *', name),
              el('label', {}, '한글명', nameKr),
              el('label', {}, '국가', country),
              el('label', {}, '공시 유형', trackType),
              el('label', {}, '시행일', effDate),
              el('label', { style: 'display:flex;align-items:center;gap:8px;margin-top:8px' }, isActive, ' 활성')
            )
            modal('평가기관 추가', form)
            document.getElementById('modal-save').onclick = () => {
              Store.addAgencyMaster({
                code: code.value.toUpperCase(),
                name: name.value,
                name_kr: nameKr.value,
                country: country.value,
                track_type: trackType.value,
                effective_date: effDate.value,
                is_active: isActive.checked
              })
              closeModal(); renderAgencies()
            }
          }}, '+ 기관 추가')
        ),
        agencies.length ? sortableTable('agencies', [
          { label: '코드', key: 'code', value: a => el('span', { style: 'font-weight:600;font-family:monospace' }, a.code) },
          { label: '영문명', key: 'name' },
          { label: '한글명', key: 'name_kr', value: a => a.name_kr || '-' },
          { label: '국가', key: 'country', value: a => a.country || '-', align: 'center' },
          { label: '공시 유형', value: a => el('span', { style: `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${a.track_type === 'MANDATORY' ? '#ef444410' : '#10b98110'};color:${a.track_type === 'MANDATORY' ? '#ef4444' : '#10b981'}` }, a.track_type === 'MANDATORY' ? '법정 의무' : '자율 공시'), align: 'center' },
          { label: '시행일', key: 'effective_date', value: a => a.effective_date || '-' },
          { label: '활성', value: a => el('span', { style: `color:${a.is_active !== false ? '#10b981' : '#ccc'}` }, a.is_active !== false ? '●' : '○'), align: 'center' }
        ], agencies, {
          bulkDelete: id => { Store.deleteAgencyMaster(id); renderAgencies() },
          actions: a => [
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm(`"${a.code}" 기관을 삭제하시겠습니까?`)) { Store.deleteAgencyMaster(a.id); renderAgencies() } } }, '삭제')
          ]
        }) : el('div', { style: 'text-align:center;padding:30px;color:#999' }, '등록된 평가기관이 없습니다.')
      )
    )
  }

  let _auditFilter = 'all'
  function renderAuditLogs() {
    const c = document.getElementById('audit-content')
    if (!c) return
    const categories = [
      { value: 'all', label: '전체' },
      { value: '로그인', label: '🔑 로그인' },
      { value: '로그아웃', label: '🚪 로그아웃' },
      { value: '사용자등록', label: '👤 신규 등록' },
      { value: '사용자관리', label: '✅ 승인' },
      { value: '사용자삭제', label: '🗑 삭제' }
    ]
    const logs = Store.getAuditLogs({ category: _auditFilter === 'all' ? null : _auditFilter })
    const actionIcons = { '로그인 성공': '🔑', '로그인 실패': '❌', '로그아웃': '🚪', '신규 등록': '👤', '사용자 승인': '✅', '사용자 삭제': '🗑', '일괄 삭제': '🗑' }

    c.innerHTML = ''
    c.append(
      el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap' },
        el('h3', { style: 'margin:0;font-size:14px;white-space:nowrap' }, '📋 감사 로그'),
        el('span', { style: 'font-size:12px;color:#888' }, `${logs.length}건`),
        ...categories.map(cat => el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_auditFilter === cat.value ? '#7C3AED' : '#f0f0f0'};color:${_auditFilter === cat.value ? '#fff' : '#666'};border:1px solid ${_auditFilter === cat.value ? '#7C3AED' : '#ddd'}`, onClick: () => { _auditFilter = cat.value; renderAuditLogs() } }, cat.label)),
        el('div', { style: 'flex:1' }),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { if (confirm('모든 감사 로그를 삭제하시겠습니까?')) { Store.data.auditLogs = []; Store._save(); renderAuditLogs(); showToast('로그가 삭제되었습니다.', 'success') } } }, '🗑 전체 삭제')
      )
    )
    if (!logs.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px;color:#999' }, '📋 감사 로그가 없습니다.'))
      return
    }
    const table = el('div', { className: 'card', style: 'padding:0;overflow:hidden' })
    const header = el('div', { style: 'display:grid;grid-template-columns:140px 100px 1fr 120px;font-size:11px;font-weight:600;color:#888;padding:10px 16px;border-bottom:2px solid #eee;background:#fafafa' }, el('span', {}, '일시'), el('span', {}, '유형'), el('span', {}, '상세'), el('span', {}, '작업자'))
    table.append(header)
    logs.slice(0, 200).forEach((log, idx) => {
      const bgColor = log.category === '사용자삭제' ? '#fef2f2' : log.category === '로그인' ? '#f0fdf4' : '#fff'
      table.append(el('div', { style: `display:grid;grid-template-columns:140px 100px 1fr 120px;font-size:12px;padding:8px 16px;border-bottom:1px solid #f5f5f5;background:${bgColor};${idx === logs.length - 1 ? 'border-bottom:none' : ''}` },
        el('span', { style: 'color:#888;font-size:11px' }, _formatDateTime(log.created_at)),
        el('span', { style: 'display:flex;align-items:center;gap:4px' }, el('span', {}, actionIcons[log.action] || '📝'), el('span', { style: 'font-weight:500' }, log.action)),
        el('span', { style: 'color:#555;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, log.detail || ''),
        el('span', { style: 'color:#888' }, log.user_name || '시스템')
      ))
    })
    c.append(table)
  }

  // ==================== Settings: Users ====================
  function switchSettingsTab(tabId) {
    document.querySelectorAll('#page-settings .tab').forEach(t => t.classList.remove('active'))
    document.querySelectorAll('#page-settings .tab-content').forEach(c => c.classList.remove('active'))
    const tab = document.querySelector(`#page-settings .tab[data-stab="${tabId}"]`)
    if (tab) tab.classList.add('active')
    const panel = document.getElementById(tabId)
    if (panel) panel.classList.add('active')
    if (tabId === 'tab-users') renderUsers()
    if (tabId === 'tab-mobile') {
      const saved = localStorage.getItem('smart_esg_mobile_url')
      const input = document.getElementById('mobile-url')
      if (input) { input.value = saved || ''; updateQR() }
    }
    if (tabId === 'tab-companies') renderCompanies()
    if (tabId === 'tab-departments') renderDepartments()
    if (tabId === 'tab-weights') renderWeights()
    if (tabId === 'tab-agencies') renderAgencies()
    if (tabId === 'tab-audit') renderAuditLogs()
  }

  function switchUserListTab(tab) {
    _userListTab = tab
    document.querySelectorAll('#tab-users .card-header .btn').forEach(b => {
      const isPending = b.textContent.includes('승인대기')
      b.style.background = isPending === (tab === 'pending') ? '#2d5427' : '#e8eaed'
      b.style.color = isPending === (tab === 'pending') ? '#fff' : '#555'
    })
    renderUsers()
  }

  function openAddUserModal() {
    const companies = Store.getCompanies()
    const depts = (Store.getDepartments() || []).filter(d => d.is_active !== false)
    const companyOpts = companies.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
    const deptOpts = depts.map(d => `<option value="${d.dept_code}">${d.dept_name}</option>`).join('')
    const form = document.createElement('form')
    form.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <label style="font-size:12px">아이디 *<input id="a-username" required style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">비밀번호 *<input id="a-password" type="password" required minlength="6" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">이름 *<input id="a-name" required style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">이메일<input id="a-email" type="email" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">전화번호<input id="a-phone" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">회사<select id="a-company" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="">선택</option>${companyOpts}</select></label>
        <label style="font-size:12px">부서<select id="a-dept" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="">선택</option>${deptOpts}</select></label>
        <label style="font-size:12px">직급<input id="a-position" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">역할<select id="a-role" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="user">일반 사용자</option><option value="manager">매니저</option><option value="admin">관리자</option><option value="viewer">뷰어</option></select></label>
        <label style="font-size:12px">상태<select id="a-status" style="width:100%;padding:7px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="active">활성</option><option value="pending">승인대기</option></select></label>
      </div>
    `
    modal('사용자 추가', form)
    document.getElementById('modal-save').onclick = async () => {
      const username = document.getElementById('a-username').value.trim()
      const password = document.getElementById('a-password').value
      const name = document.getElementById('a-name').value.trim()
      const email = document.getElementById('a-email').value.trim()
      const phone = document.getElementById('a-phone').value.trim()
      const company_id = document.getElementById('a-company').value || null
      const dept_code = document.getElementById('a-dept').value
      const position = document.getElementById('a-position').value.trim()
      const role = document.getElementById('a-role').value
      const status = document.getElementById('a-status').value
      if (!username || !password || !name) { alert('아이디, 비밀번호, 이름은 필수입니다.'); return }
      if (password.length < 6) { alert('비밀번호는 6자 이상이어야 합니다.'); return }
      const exists = Store.getUsers().find(u => u.username === username)
      if (exists) { alert('이미 사용 중인 아이디입니다.'); return }
      Store.addUser({ username, password: await Store.hashPassword(password), name, email, phone, company_id: company_id ? parseInt(company_id) : null, dept_code, position, role, status })
      Store.addAuditLog({ category: '사용자등록', action: '관리자 등록', user_id: currentUser?.id || null, user_name: currentUser?.name || '', detail: `대상: ${name} (${username}), 역할: ${role}, 상태: ${status}` })
      closeModal()
      showToast('사용자가 추가되었습니다.', 'success')
      renderUsers()
    }
  }

  function renderUsers() {
    const tbody = document.getElementById('user-tbody')
    if (!tbody) return
    let users = Store.getUsers()
    if (_userListTab === 'pending') users = users.filter(u => u.status !== 'active')
    const q = (document.getElementById('user-search')?.value || '').toLowerCase()
    if (q) users = users.filter(u => (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q))
    const pc = document.getElementById('pending-count')
    if (pc) pc.textContent = Store.getUsers().filter(u => u.status !== 'active').length
    if (!users.length) { tbody.innerHTML = '<tr><td colspan="10">' + (_userListTab === 'pending' ? '승인 대기 중인 회원이 없습니다.' : '등록된 사용자가 없습니다.') + '</td></tr>'; return }
    const table = sortableTable('users', [
      { label: '아이디', key: 'username' },
      { label: '이름', key: 'name', value: u => u.name || '-' },
      { label: '부서', key: 'dept_code', value: u => u.dept_code || '-' },
      { label: '직급', key: 'position', value: u => u.position || '-' },
      { label: '이메일', key: 'email', value: u => u.email || '-' },
      { label: '연락처', key: 'phone', value: u => u.phone || '-' },
      { label: '권한', value: u => el('span', { className: 'badge ' + (u.role === 'admin' ? 'badge-paid' : 'badge-pending') }, { admin: '관리자', manager: '매니저', user: '사용자', viewer: '뷰어' }[u.role] || u.role) },
      { label: '상태', value: u => u.status !== 'active' ? el('span', { className: 'badge badge-unpaid' }, '승인대기') : el('span', { className: 'badge badge-paid' }, '활성') },
      { label: '가입일', key: 'createdAt', value: u => u.createdAt || '-' }
    ], users, {
      bulkDelete: id => {
        if (currentUser && currentUser.id === id) return
        Store.deleteUser(id)
        showToast('사용자가 삭제되었습니다.', 'success')
      },
      actions: u => {
        const isPending = u.status !== 'active'
        const canDelete = currentUser && currentUser.id !== u.id
        return [
          isPending ? el('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 4 }, onClick: () => approveUser(u.id) }, '승인') : null,
          el('button', { className: 'btn btn-sm btn-secondary', style: { marginRight: 4 }, onClick: () => editUser(u.id) }, '수정'),
          canDelete ? el('button', { className: 'btn btn-sm btn-danger', onClick: () => deleteUser(u.id) }, '삭제') : null
        ].filter(Boolean)
      }
    })
    const wrap = tbody.closest('.table-wrap')
    if (wrap) { wrap.innerHTML = ''; wrap.append(table) }
    else { tbody.innerHTML = ''; tbody.append(table) }
  }

  function approveUser(id) {
    if (!currentUser) return alert('로그인이 필요합니다.')
    const u = Store.getUsers().find(x => x.id === id)
    Store.updateUser(id, { status: 'active' })
    Store.addAuditLog({ category: '사용자관리', action: '사용자 승인', user_id: currentUser.id, user_name: currentUser.name, detail: `대상: ${u?.name || id} (${u?.username || ''})` })
    showToast('사용자가 승인되었습니다.', 'success')
    const pc = document.getElementById('pending-count')
    if (pc) pc.textContent = Store.getUsers().filter(u => u.status !== 'active').length
    if (_userListTab === 'pending' && Store.getUsers().filter(u => u.status !== 'active').length === 0) switchUserListTab('all')
    else renderUsers()
  }

  function editUser(id) {
    const user = Store.getUsers().find(x => x.id === id)
    if (!user) return
    const form = document.createElement('form')
    const companies = Store.getCompanies()
    const depts = Store.getDepartments().filter(d => d.is_active !== false)
    const companyOptions = companies.map(c => `<option value="${c.id}" ${user.company_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')
    const deptOptions = depts.map(d => `<option value="${d.dept_code}" ${user.dept_code === d.dept_code ? 'selected' : ''}>${d.dept_name}</option>`).join('')
    form.innerHTML = `
      <div class="form-group"><label>아이디</label><input id="f-uid" value="${esc(user.username)}" readonly style="background:#f5f5f5"></div>
      <div class="form-group"><label>이름</label><input id="f-uname" value="${esc(user.name || '')}"></div>
      <div class="form-group"><label>회사</label><select id="f-ucompany"><option value="">선택</option>${companyOptions}</select></div>
      <div class="form-group"><label>부서</label><select id="f-udept"><option value="">선택</option>${deptOptions}</select></div>
      <div class="form-group"><label>직급</label><input id="f-uposition" value="${esc(user.position || '')}"></div>
      <div class="form-group"><label>이메일</label><input id="f-uemail" type="email" value="${esc(user.email || '')}"></div>
      <div class="form-group"><label>연락처</label><input id="f-uphone" value="${esc(user.phone || '')}"></div>
      <div class="form-group"><label>권한</label><select id="f-urole"><option value="user" ${user.role === 'user' ? 'selected' : ''}>사용자</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>관리자</option><option value="manager" ${user.role === 'manager' ? 'selected' : ''}>매니저</option><option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>뷰어</option></select></div>
      <div class="form-group"><label>상태</label><select id="f-ustatus"><option value="active" ${user.status === 'active' ? 'selected' : ''}>활성</option><option value="pending" ${user.status === 'pending' ? 'selected' : ''}>승인대기</option><option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>비활성</option></select></div>`
    modal('사용자 수정', form)
    document.getElementById('modal-save').onclick = function() {
      Store.updateUser(id, { name: document.getElementById('f-uname').value, company_id: document.getElementById('f-ucompany').value ? parseInt(document.getElementById('f-ucompany').value) : null, dept_code: document.getElementById('f-udept').value, position: document.getElementById('f-uposition').value, email: document.getElementById('f-uemail').value, phone: document.getElementById('f-uphone').value, role: document.getElementById('f-urole').value, status: document.getElementById('f-ustatus').value })
      showToast('사용자 정보가 수정되었습니다.', 'success')
      closeModal(); renderUsers()
    }
  }

  function deleteUser(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const u = Store.getUsers().find(x => x.id === id)
    Store.deleteUser(id)
    Store.addAuditLog({ category: '사용자삭제', action: '사용자 삭제', user_id: currentUser?.id || null, user_name: currentUser?.name || '', detail: `대상: ${u?.name || id} (${u?.username || ''}), 역할: ${u?.role || ''}` })
    showToast('사용자가 삭제되었습니다.', 'success')
    renderUsers()
  }

  function cleanupUsers() {
    if (!currentUser) return alert('로그인이 필요합니다.')
    const pending = Store.getUsers().filter(u => u.id !== currentUser.id && u.status !== 'active')
    if (!pending.length) return alert('미승인 대기 회원이 없습니다.')
    if (!confirm(`미승인 회원 ${pending.length}명을 삭제하시겠습니까?`)) return
    if (!confirm('정말입니까? 이 작업은 되돌릴 수 없습니다.')) return
    pending.forEach(u => { Store.addAuditLog({ category: '사용자삭제', action: '일괄 삭제', user_id: currentUser.id, user_name: currentUser.name, detail: `대상: ${u.name} (${u.username})` }); Store.deleteUser(u.id) })
    const pc = document.getElementById('pending-count')
    if (pc) pc.textContent = Store.getUsers().filter(u => u.status !== 'active').length
    renderUsers()
    alert(`${pending.length}명의 미승인 회원이 삭제되었습니다.`)
  }

  // ==================== Settings: Keep-alive ====================
  let _keepAliveTimer = null

  function toggleKeepAlive(on) {
    localStorage.setItem('smart_esg_keepalive', on ? '1' : '0')
    const status = document.getElementById('keepalive-status')
    const slider = document.getElementById('keepalive-slider')
    if (on) {
      slider.style.background = '#7C3AED'
      status.textContent = '🟢 실행 중 — 6일마다 Supabase 자동 접속'
      _doKeepAlive()
      _keepAliveTimer = setInterval(_doKeepAlive, 6 * 24 * 60 * 60 * 1000)
    } else {
      slider.style.background = '#ccc'
      status.textContent = '⏹ 중지됨'
      if (_keepAliveTimer) { clearInterval(_keepAliveTimer); _keepAliveTimer = null }
    }
  }

  async function _doKeepAlive() {
    try {
      const sb = getSupabase()
      if (!sb) return
      await sb.auth.getSession()
      const status = document.getElementById('keepalive-status')
      if (status) status.textContent = '🟢 실행 중 — 마지막 접속: ' + new Date().toLocaleTimeString('ko-KR')
    } catch (e) { console.warn('Keep-alive error:', e) }
  }

  function initKeepAlive() {
    const saved = localStorage.getItem('smart_esg_keepalive') === '1'
    const toggle = document.getElementById('keepalive-toggle')
    if (toggle) {
      toggle.checked = saved
      const slider = document.getElementById('keepalive-slider')
      if (slider) slider.style.background = saved ? '#7C3AED' : '#ccc'
    }
    if (saved) { _keepAliveTimer = setInterval(_doKeepAlive, 6 * 24 * 60 * 60 * 1000); _doKeepAlive() }
  }

  // ==================== Settings: Mobile QR ====================
  function updateQR() {
    const input = document.getElementById('mobile-url')
    if (!input) return
    const url = input.value.trim()
    if (!url) { const img = document.getElementById('qr-image'); if (img) img.style.display = 'none'; return }
    localStorage.setItem('smart_esg_mobile_url', url)
    const img = document.getElementById('qr-image')
    if (!img) return
    img.style.display = 'block'
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=480x480&data=' + encodeURIComponent(url)
  }

  // ==================== Auth helpers ====================
  function doLogoutUI() {
    logout().then(() => { currentUser = null; init() })
  }

  // ==================== Modal System ====================
  function closeModal(e) {
    if (e && e.target !== document.getElementById('modal-overlay') && !e.target.closest('#modal')) return
    document.getElementById('modal-overlay').classList.add('hidden')
  }

  function saveModal() {
    // Overridden per modal
  }

  // ==================== Expose globals ====================
  window.init = init
  window.navigate = navigate
  window.switchSettingsTab = switchSettingsTab
  window.switchUserListTab = switchUserListTab
  window.renderUsers = renderUsers
  window.approveUser = approveUser
  window.editUser = editUser
  window.deleteUser = deleteUser
  window.cleanupUsers = cleanupUsers
  window.toggleKeepAlive = toggleKeepAlive
  window.toggleHelp = toggleHelp
  window.initKeepAlive = initKeepAlive
  window.updateQR = updateQR
  window.doLogoutUI = doLogoutUI
  window.openProfileModal = openProfileModal
  window.openPasswordModal = openPasswordModal
  window.openAddUserModal = openAddUserModal
  window.closeModal = closeModal
  window.saveModal = saveModal
  window.renderAssessments = renderAssessments
  window.renderIndicators = renderIndicators
  window.renderDashboard = renderDashboard
  window.setDashAssessment = setDashAssessment
  window.showAssessmentDetail = showAssessmentDetail
  window.renderCompanies = renderCompanies
  window.renderDepartments = renderDepartments
  window.renderWeights = renderWeights
  window.openAddCompany = openAddCompany
  window.openAddDepartment = openAddDepartment
  window.editDepartment = editDepartment
  window.renderGRI = renderGRI
  window.renderRisk = renderRisk
  window.renderMonitor = renderMonitor
  window.renderISSA = renderISSA
  window.renderSubmit = renderSubmit
  window.renderAPI = renderAPI
  window.renderReportEditor = renderReportEditor
  window.renderKSSB = renderKSSB
  window.renderAIHistory = renderAIHistory
  window.renderBudget = renderBudget
  window.renderMasking = renderMasking
  window.previewEvidenceFile = _previewEvidenceFile
  window.downloadEvidenceFile = _downloadEvidenceFile
  window.getEvidenceFilesFor = function(evidenceId) { return Store.getEvidenceFiles(evidenceId) }
  window.el = el

  // ==================== 데이터 내보내기 ====================
  function exportCSV(data, filename) {
    if (!data.length) return alert('내보낼 데이터가 없습니다.')
    const keys = Object.keys(data[0])
    const csvRows = [keys.join(','), ...data.map(row => keys.map(k => {
      let val = row[k]
      if (val === null || val === undefined) val = ''
      val = String(val).replace(/"/g, '""')
      return `"${val}"`
    }).join(','))]
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function exportExcel(data, filename, sheetName) {
    if (!data.length) return alert('내보낼 데이터가 없습니다.')
    const keys = Object.keys(data[0])
    let xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#7C3AED" ss:Pattern="Solid"/></Style></Styles>\n<Worksheet ss:Name="' + (sheetName || 'Sheet1') + '">\n<Table>\n'
    xml += '<Row>' + keys.map(k => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${k}</Data></Cell>`).join('') + '</Row>\n'
    data.forEach(row => {
      xml += '<Row>' + keys.map(k => {
        let val = row[k]
        if (val === null || val === undefined) val = ''
        const type = typeof val === 'number' ? 'Number' : 'String'
        return `<Cell><Data ss:Type="${type}">${String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</Data></Cell>`
      }).join('') + '</Row>\n'
    })
    xml += '</Table>\n</Worksheet>\n</Workbook>'
    const blob = new Blob([xml], { type: 'application/vnd.ms-excel' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  window.exportData = function(type) {
    const dataMap = {
      assessments: Store.getAssessments() || [],
      indicators: Store.getIndicators() || [],
      evidence: Store.getEvidences() || [],
      ghg: Store.getGHGActivities() || [],
      suppliers: Supplier.getAll() || [],
      drafts: Store.getAIDrafts() || []
    }
    const data = dataMap[type]
    if (!data || !data.length) return alert('내보낼 데이터가 없습니다.')
    const ts = new Date().toISOString().slice(0, 10)
    exportExcel(data, `SmartESG_${type}_${ts}.xlsx`, type)
  }

  window.showExportModal = function() {
    modal('데이터 내보내기', el('div', {},
      el('p', { style: 'font-size:13px;color:#666;margin-bottom:16px' }, '내보낼 데이터 유형을 선택하세요.'),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        ['assessments', 'indicators', 'evidence', 'ghg', 'suppliers', 'drafts'].map(type => {
          const labels = { assessments: '📋 평가', indicators: '📌 지표', evidence: '📎 증빙', ghg: '🏭 온실가스', suppliers: '🏢 협력사', drafts: '🤖 AI 초안' }
          const count = (dataMap => dataMap[type]?.length || 0)({ assessments: Store.getAssessments(), indicators: Store.getIndicators(), evidence: Store.getEvidences(), ghg: Store.getGHGActivities(), suppliers: Supplier.getAll(), drafts: Store.getAIDrafts() })
          return el('button', { className: 'btn btn-secondary', style: 'text-align:left;padding:12px;display:flex;justify-content:space-between;align-items:center', onClick: () => { closeModal(); window.exportData(type) } },
            el('span', {}, labels[type] || type),
            el('span', { style: 'font-size:11px;color:#999' }, `${count}건`)
          )
        })
      )
    ))
    document.getElementById('modal-save').style.display = 'none'
  }

  document.addEventListener('DOMContentLoaded', _initApp)
  if (document.readyState !== 'loading') _initApp()

  function _initApp() {
    if (_initApp._done) return
    _initApp._done = true
    document.addEventListener('click', e => {
      const a = e.target.closest('#nav a[data-page]')
      if (a) { e.preventDefault(); navigate(a.dataset.page) }
      const pm = document.getElementById('profile-menu')
      if (pm && !e.target.closest('.profile-dropdown')) pm.classList.remove('show')
    })
    document.getElementById('sidebar-logo')?.addEventListener('click', () => navigate('dashboard'))
    document.getElementById('sb-collapse-btn')?.addEventListener('click', function() {
      const sb = document.getElementById('sidebar')
      sb.classList.toggle('collapsed')
      this.textContent = sb.classList.contains('collapsed') ? '▶' : '◀'
      const topBtn = document.getElementById('sb-toggle-top')
      if (topBtn) topBtn.textContent = sb.classList.contains('collapsed') ? '▶' : '☰'
    })
    init()
  }
})()

function toggleSidebar() {
  const sb = document.getElementById('sidebar')
  sb.classList.toggle('collapsed')
  const bottomBtn = document.getElementById('sb-collapse-btn')
  if (bottomBtn) bottomBtn.textContent = sb.classList.contains('collapsed') ? '▶' : '◀'
  const topBtn = document.getElementById('sb-toggle-top')
  if (topBtn) topBtn.textContent = sb.classList.contains('collapsed') ? '▶' : '☰'
}
