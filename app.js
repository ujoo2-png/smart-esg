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
  let _loadingSafety = null
  function showLoading(text) {
    let ov = document.getElementById('loading-overlay')
    if (!ov) {
      ov = document.createElement('div')
      ov.id = 'loading-overlay'
      ov.innerHTML = '<div style="position:fixed;inset:0;background:rgba(255,255,255,.7);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)"><div style="text-align:center"><div class="spinner"></div><p id="loading-text" style="margin-top:12px;font-size:13px;color:#6B7280"></p></div></div>'
      document.body.appendChild(ov)
    }
    const txt = document.getElementById('loading-text')
    if (txt) txt.textContent = text || '처리 중...'
    ov.style.display = 'block'
    _loadingCount++
    clearTimeout(_loadingSafety)
    _loadingSafety = setTimeout(_forceHideLoading, 120000)
  }
  function _forceHideLoading() {
    _loadingCount = 0
    clearTimeout(_loadingSafety)
    const ov = document.getElementById('loading-overlay')
    if (ov) ov.style.display = 'none'
  }
  function hideLoading() {
    _loadingCount = Math.max(0, _loadingCount - 1)
    if (_loadingCount === 0) { clearTimeout(_loadingSafety); const ov = document.getElementById('loading-overlay'); if (ov) ov.style.display = 'none' }
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
    if (!notifs.length) { list.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">알림이 없습니다</div>'; return }
    list.innerHTML = notifs.map(n => {
      const icon = n.type === 'error' ? '🔴' : n.type === 'warning' ? '🟡' : n.type === 'success' ? '🟢' : '🔵'
      const bg = n.read ? '#fff' : '#F8FAFC'
      return `<div class="notif-item" data-id="${n.id}" data-page="${n.related_page || ''}" data-rid="${n.related_id || ''}" style="padding:10px 16px;border-bottom:1px solid #F8FAFC;background:${bg};cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:flex-start" onmouseover="this.style.background='#EEF1F4'" onmouseout="this.style.background='${bg}'">
        <span style="flex-shrink:0;margin-top:1px">${icon}</span>
        <div style="flex:1;line-height:1.5">${n.message}</div>
        <span style="color:#9CA3AF;font-size:10px;white-space:nowrap">${_timeAgo(n.created_at)}</span>
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
        el('span', { style: 'font-size:12px;color:#9ca3af' }, selCount ? `${selCount}개 선택` : ''),
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

    const thStyle = 'padding:8px 10px;border-bottom:2px solid #EEF4FA;font-size:12px;color:#6B7280;font-weight:600'
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
      return el('tr', { style: checked ? 'background:#EEF4FA' : '' },
        el('td', { style: 'padding:8px 6px;text-align:center;width:36px' }, cb),
        el('td', { style: 'padding:8px 6px;text-align:center;width:40px;font-size:12px;color:#9CA3AF' }, String(startNum + ri)),
        ...cells,
        opts.actions ? el('td', { style: 'padding:8px 10px;text-align:center;white-space:nowrap' },
          ...(typeof opts.actions === 'function' ? opts.actions(item) : opts.actions)
        ) : null
      )
    }))

    if (!paged.length) {
      tbody.append(el('tr', {}, el('td', { style: 'padding:20px;text-align:center;color:#9CA3AF', colspan: columns.length + 3 }, opts.emptyText || '등록된 데이터가 없습니다.')))
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
          style: p === st.page ? 'background:#1E3A5F;color:#fff' : '',
          onClick: () => { st.page = p; rerender() }
        }, String(p + 1))
        nav.append(btn)
      }
      nav.append(mkPageBtn('▶', st.page + 1, st.page >= totalPages - 1))
      nav.append(el('span', { style: 'color:#9ca3af;margin-left:8px' }, `${sorted.length}건`))
      container.append(nav)
    } else if (sorted.length > 0) {
      container.append(el('div', { style: 'text-align:right;font-size:11px;color:#9CA3AF;margin-top:4px' }, `${sorted.length}건`))
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

  let _modalDragReady = false
  let _suppressOverlayClose = 0
  function _initModalDrag() {
    if (_modalDragReady) return
    const overlay = document.getElementById('modal-overlay')
    const panel = document.getElementById('modal')
    const header = document.getElementById('modal-header')
    if (!overlay || !panel || !header) return
    _modalDragReady = true
    let dragging = false, moved = false, startX = 0, startY = 0, origLeft = 0, origTop = 0

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
    const begin = (clientX, clientY, target, preventDefault) => {
      if (target.closest('.btn-close') || target.closest('button')) return
      const rect = panel.getBoundingClientRect()
      panel.style.animation = 'none'
      panel.style.position = 'fixed'
      panel.style.margin = '0'
      panel.style.transform = 'none'
      panel.style.left = rect.left + 'px'
      panel.style.top = rect.top + 'px'
      panel.style.maxHeight = Math.min(rect.height, window.innerHeight - 20) + 'px'
      startX = clientX; startY = clientY; origLeft = rect.left; origTop = rect.top
      dragging = true; moved = false
      _suppressOverlayClose = 0
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'move'
      if (preventDefault) preventDefault()
    }
    const move = (clientX, clientY) => {
      if (!dragging) return
      if (Math.abs(clientX - startX) > 3 || Math.abs(clientY - startY) > 3) moved = true
      const w = panel.offsetWidth
      const nl = clamp(origLeft + (clientX - startX), -w + 60, window.innerWidth - 60)
      const nt = clamp(origTop + (clientY - startY), 0, window.innerHeight - 40)
      panel.style.left = nl + 'px'
      panel.style.top = nt + 'px'
    }
    const end = () => {
      if (dragging && moved) _suppressOverlayClose = Date.now() + 300
      dragging = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    header.addEventListener('mousedown', e => begin(e.clientX, e.clientY, e.target, () => e.preventDefault()))
    document.addEventListener('mousemove', e => move(e.clientX, e.clientY))
    document.addEventListener('mouseup', end)
    header.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) begin(t.clientX, t.clientY, e.target, () => e.preventDefault()) }, { passive: false })
    document.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) { if (dragging) e.preventDefault(); move(t.clientX, t.clientY) } }, { passive: false })
    document.addEventListener('touchend', end)
    header.addEventListener('dblclick', () => _resetModalPosition())
  }

  function _resetModalPosition() {
    const panel = document.getElementById('modal')
    if (!panel) return
    panel.style.animation = ''
    panel.style.position = ''
    panel.style.left = ''
    panel.style.top = ''
    panel.style.margin = ''
    panel.style.transform = ''
    panel.style.maxHeight = ''
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  const modal = (title, body, extra) => {
    _initModalDrag()
    _resetModalPosition()
    document.getElementById('modal-title').textContent = title
    document.getElementById('modal-body').innerHTML = ''
    if (typeof body === 'string') document.getElementById('modal-body').innerHTML = body
    else document.getElementById('modal-body').append(body)
    const saveBtn = document.getElementById('modal-save')
    const footer = saveBtn?.parentElement
    if (footer) { footer.querySelectorAll('.modal-extra-btn').forEach(b => b.remove()) }
    if (saveBtn) { saveBtn.style.display = ''; saveBtn.onclick = null }
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
    references: `<strong>📚 참고자료 라이브러리</strong><br><br>
• 지속가능경영보고서, 업종 보고서, 가이드라인(PDF/PPT/Word/Excel)을 업로드하면 Markdown으로 자동 변환되어 검색 가능한 지식베이스가 됩니다.<br>
• 변환된 문서는 <strong>보고서 작성기</strong>에서 내 원고와 대비하여 진행방향·문구 다듬기 제안에 활용됩니다.<br>
• 저장 위치는 <strong>설정 › 저장소</strong>에서 로컬/원격(R2·S3·GDrive)을 선택할 수 있습니다.`,
    writer: `<strong>✍️ 보고서 작성기</strong><br><br>
• 섹션 단위로 원고를 작성하고, 참고자료 라이브러리와 대비하여 피드백을 받습니다.<br>
• <strong>진행방향</strong>: 아직 다루지 않은 필수 항목을 제안합니다.<br>
• <strong>문구 다듬기</strong>: 참고자료 근거와 함께 표현 개선안을 제시합니다.<br>
• 피드백은 반영/무시 처리하여 진도를 관리합니다.`,
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

  function _supabaseReady() {
    return typeof SUPABASE_CONFIG !== 'undefined' && !!SUPABASE_CONFIG.url &&
      !SUPABASE_CONFIG.url.includes('your-project') &&
      !!SUPABASE_CONFIG.anonKey && SUPABASE_CONFIG.anonKey !== 'your-anon-key'
  }

  async function renderSupabaseStatus() {
    const box = document.getElementById('supabase-status')
    if (!box) return
    const dot = box.querySelector('.supa-dot')
    const txt = box.querySelector('.supa-text')
    if (!_supabaseReady()) {
      box.className = 'supa-status is-off'
      box.title = 'Supabase 미설정 — 로컬 저장(localStorage) 모드로 동작 중입니다. supabase.js에 URL/키를 입력하세요.'
      if (txt) txt.textContent = '로컬 모드'
      return
    }
    if (!dot || dot.dataset.checking) return
    dot.dataset.checking = '1'
    if (txt) txt.textContent = '연결 확인 중…'
    let ok = false
    try {
      const sb = (typeof getSupabase === 'function') ? getSupabase() : null
      if (sb) {
        const { error } = await sb.from('tb_company').select('id', { head: true, count: 'exact' }).limit(1)
        ok = !error
      }
    } catch (e) { ok = false }
    delete dot.dataset.checking
    const remote = (typeof StorageAdapter !== 'undefined' && StorageAdapter.isRemote)
    const syncErrors = Store._lastSyncErrors || []
    if (ok && syncErrors.length) {
      box.className = 'supa-status is-err'
      const first = syncErrors[0]
      box.title = `동기화 경고: ${syncErrors.length}개 테이블 실패\n` + syncErrors.map(e => `${e.table}: ${e.err}`).join('\n')
      if (txt) txt.textContent = `동기화 오류 (${syncErrors.length})`
    } else if (ok) {
      box.className = 'supa-status is-on'
      box.title = 'Supabase 연결됨 · 저장소 모드: ' + (remote ? '원격' : '로컬(IndexedDB)')
      if (txt) txt.textContent = 'Supabase 연결됨'
    } else {
      box.className = 'supa-status is-err'
      box.title = 'Supabase에 연결할 수 없습니다. 네트워크/키/RLS를 확인하세요.'
      if (txt) txt.textContent = 'Supabase 오류'
    }
  }
  window.renderSupabaseStatus = renderSupabaseStatus
  window.diagnoseSupabase = () => Store.diagnoseSupabase()

  async function init() {
    document.getElementById('version-label').textContent = '지속가능경영보고서 시스템 ' + Store.version
    const vb = document.getElementById('version-badge')
    if (vb) vb.textContent = Store.version
    renderSupabaseStatus()
    try { await ensureAdmin() } catch (e) { console.warn('ensureAdmin:', e) }
    GHG.init()
    checkAuth().then(user => {
      applyAuthUI()
      if (user) {
        document.getElementById('app').style.display = 'flex'
        navigate('dashboard')
      } else {
        showAuthModal('login')
      }
      if (typeof Store.pullFromSupabase === 'function') {
        Store.pullFromSupabase({ tables: ['users', 'referenceDocs', 'referenceChunks', 'projectTasks', 'projectTaskLogs'] })
          .then(r => {
            if (!r || !r.ok) return
            const active = document.querySelector('.page.active')
            if (!active) return
            if (active.id === 'page-references' && (r.added.referenceDocs || r.added.referenceChunks)) renderReferences()
            if (active.id === 'page-project' && (r.added.projectTasks || r.added.projectTaskLogs)) renderProjectManagement()
          }).catch(() => {})
      }
    })
    initKeepAlive()
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && _evidencePreviewId) { _evidencePreviewId = null; const c = document.getElementById('page-evidence'); if (c) renderEvidenceMgmt() } })
    window.addEventListener('beforeunload', () => { const wp = document.getElementById('page-writer'); if (wp && wp.classList.contains('active')) { clearTimeout(_writerAutosaveTimer); _flushWriterInput() } })
  }

  // ==================== Navigation ====================
  function navigate(page) {
    if (typeof canAccess === 'function' && !canAccess(page)) {
      page = 'dashboard'
    }
    if (page !== 'writer') { const ap = document.getElementById('writer-assistant'); if (ap) ap.remove() }
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

    const _safe = (fn) => { try { fn() } catch (e) { console.error('Render error [' + page + ']:', e); const c = document.getElementById('page-' + page); if (c) { c.innerHTML = ''; c.append(el('div', { className: 'card' }, el('div', { style: 'padding:20px;color:#dc2626' }, el('h3', { style: 'margin:0 0 8px' }, '오류가 발생했습니다'), el('p', { style: 'margin:0 0 12px;font-size:13px' }, e.message), el('button', { className: 'btn btn-secondary', onClick: () => navigate(page) }, '다시 시도')))) } } }
    if (page === 'dashboard') { _safe(renderDashboard); setTimeout(() => _showFirstLoginProjectPopup(), 500) }
    else if (page === 'assessment') _safe(renderAssessments)
    else if (page === 'indicator') _safe(renderIndicators)
    else if (page === 'evidence') _safe(renderEvidenceMgmt)
    else if (page === 'ghg') _safe(renderGHG)
    else if (page === 'supplier') _safe(renderSupplier)
    else if (page === 'ai') _safe(renderAI)
    else if (page === 'references') _safe(renderReferences)
    else if (page === 'writer') _safe(renderWriter)
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
    const assessments = Store.getAssessments().filter(a => Store.canSeeOwned('assessments', a))
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
    const colors = { draft: '#9CA3AF', in_review: '#d97706', verified: '#2563EB', approved: '#047857', pending: '#d97706', rejected: '#dc2626' }
    const labels = { draft: '초안', in_review: '검토중', verified: '검증완료', approved: '승인됨', pending: '대기', rejected: '반려' }
    return el('span', { style: `background:${colors[status] || '#9CA3AF'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, labels[status] || status || '-')
  }

  function typeBadge(trackType) {
    const isMandatory = trackType === 'MANDATORY'
    return el('span', { style: `background:${isMandatory ? '#dc2626' : '#9CA3AF'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, isMandatory ? '법정 의무' : '자율')
  }

  function evidenceStatusBadge(status) {
    const colors = { self: '#d97706', internal_reviewed: '#2563EB', externally_verified: '#047857' }
    const labels = { self: '자가', internal_reviewed: '내부검토', externally_verified: '외부검증' }
    return el('span', { style: `background:${colors[status] || '#9CA3AF'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, labels[status] || status || '-')
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
            el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:4px' }, `${Indicator.getAuthorityName(a.authority_code)} · ${a.assessment_year}년${ag ? (ag.track_type === 'MANDATORY' ? ' <span style="background:#dc2626;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">법정 의무</span>' : ' <span style="background:#9CA3AF;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">자율 공시</span>') : ''}${isPublicData ? ' <span style="background:#2563EB;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px;margin-left:4px">공개자료</span>' : ''}`)
          ),
          el('div', { style: 'display:flex;gap:6px;align-items:center' },
            el('span', {}, statusBadge(a.status)),
            nextStatus[a.status] ? el('button', { className: 'btn btn-sm btn-primary', onClick: () => transitionStatus(id) }, statusLabels[a.status]) : null,
            el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { Report.print(id) } }, '📄 보고서 인쇄'),
            el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { Report.downloadHTML(id); showToast('보고서가 다운로드되었습니다.', 'success') } }, '📥 HTML 저장'),
            el('button', { className: 'btn btn-sm btn-secondary', onClick: renderAssessments }, '← 목록')
          )
        ),
        el('div', { style: 'padding:16px 20px;display:flex;gap:24px;font-size:13px;border-bottom:1px solid #eef1f4' },
          el('span', {}, `총점: <strong>${a.total_score != null ? a.total_score.toFixed(1) : '-'}</strong>`),
          el('span', {}, `등급: <strong>${a.rating || '-'}</strong>`),
          el('span', {}, `항목: ${allIndicators.length}개 / 입력: ${items.length}개`)
        )
      ),
      el('div', { className: 'card', style: 'margin-bottom:12px' },
        el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center' },
          el('h3', { style: 'margin:0;font-size:14px' }, '✅ 검증 체크리스트'),
          el('span', { style: 'font-size:12px;color:#047857', id: 'checklist-progress' }, '')
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
                  el('input', { type: 'number', min: 0, max: 100, step: 1, value: item?.score ?? '', style: 'width:70px;padding:4px 6px;border:1px solid #e4e7eb;border-radius:6px;text-align:center;font-size:13px', onInput: () => saveItemScore(id, ind.id, weight?.id, weight?.weight || 25) })
                ),
                el('td', { style: 'text-align:center' },
                  item ? el('span', { style: 'color:#047857;font-size:16px' }, '✓') : el('span', { style: 'color:#D0D5DD;font-size:16px' }, '—')
                ),
                el('td', { style: 'text-align:center' },
                  evCount > 0
                    ? el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:10px;padding:2px 6px', onClick: () => navigate('evidence') }, evCount + '건 ↗')
                    : el('span', { style: 'color:#dc2626;font-size:11px' }, '미연결')
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
    return checks.map(ch => el('div', { style: `display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:${ch.done ? '#f0fdf4' : '#F8FAFC'};border:1px solid ${ch.done ? '#bbf7d0' : '#EEF1F4'}` },
      el('span', { style: `width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;${ch.done ? 'background:#059669;color:#fff' : 'border:2px solid #e4e7eb;color:transparent'}` }, ch.done ? '✓' : ''),
      el('span', { style: `font-size:12px;${ch.done ? 'color:#047857;font-weight:500' : 'color:#6b7280'}` }, ch.label),
      el('span', { style: 'font-size:10px;color:#9CA3AF;margin-left:auto' }, ch.detail)
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
      const data = { title: title.value, assessment_year: parseInt(year.value), authority_code: authority.value, status: 'draft', created_by: currentUser?.id ?? null }
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
  let _materialityScope = 'all'
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
      if (_materialityScope === 'core' && i.materiality_optional === true) return false
      if (_materialityScope === 'optional' && i.materiality_optional !== true) return false
      return true
    })
    const activeCount = allIndicators.filter(i => i.is_active !== false).length
    const optionalCount = allIndicators.filter(i => i.materiality_optional === true).length

    const wrapper = el('div')

    wrapper.append(
      el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
        el('select', { id: 'authSelect', style: 'font-size:13px;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px', onChange: () => { _selectedAuthority = document.getElementById('authSelect').value; _materialityFilter = 'all'; _materialityScope = 'all'; _indicatorSearch = ''; _selectedIndicators.clear(); renderIndicators() } },
          Store.getAgencyMaster().map(ag => el('option', { value: ag.code, selected: ag.code === _selectedAuthority }, ag.name))
        ),
        el('input', { id: 'indSearch', type: 'text', placeholder: '🔍 지표명 또는 코드 검색...', value: _indicatorSearch, style: 'flex:1;min-width:200px;font-size:13px;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px', onInput: () => { _indicatorSearch = document.getElementById('indSearch').value; renderIndicators() } }),
        el('select', { id: 'materialityFilter', style: 'font-size:13px;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px', onChange: () => { _materialityFilter = document.getElementById('materialityFilter').value; renderIndicators() } },
          el('option', { value: 'all', selected: _materialityFilter === 'all' }, '전체'),
          el('option', { value: 'active', selected: _materialityFilter === 'active' }, `활성 (${activeCount})`),
          el('option', { value: 'inactive', selected: _materialityFilter === 'inactive' }, `비활성 (${allIndicators.length - activeCount})`)
        ),
        el('select', { id: 'materialityScope', style: 'font-size:13px;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px', onChange: () => { _materialityScope = document.getElementById('materialityScope').value; renderIndicators() } },
          el('option', { value: 'all', selected: _materialityScope === 'all' }, '중요성: 전체'),
          el('option', { value: 'core', selected: _materialityScope === 'core' }, `핵심만 (비핵심 ${optionalCount}개 제외)`),
          el('option', { value: 'optional', selected: _materialityScope === 'optional' }, `비핵심만 (${optionalCount})`)
        ),
        el('span', { style: 'font-size:12px;color:#9ca3af' }, `${filtered.length}개 표시 / ${allIndicators.length}개 전체`)
      )
    )

    if (_selectedIndicators.size > 0) {
      wrapper.append(
        el('div', { className: 'card', style: 'padding:10px 16px;display:flex;gap:8px;align-items:center;background:#F8FAFC;border-left:3px solid #1E3A5F' },
          el('span', { style: 'font-size:13px;font-weight:600' }, `${_selectedIndicators.size}개 선택됨`),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => { _selectedIndicators.forEach(id => Store.updateIndicator(id, { is_active: true })); _selectedIndicators.clear(); renderIndicators() } }, '활성화'),
          el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { _selectedIndicators.forEach(id => Store.updateIndicator(id, { is_active: false })); _selectedIndicators.clear(); renderIndicators() } }, '비활성화'),
          el('button', { className: 'btn btn-sm', style: 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca', onClick: () => { _selectedIndicators.forEach(id => Store.updateIndicator(id, { materiality_optional: true })); _selectedIndicators.clear(); showToast('비핵심 항목으로 지정되었습니다.', 'success'); renderIndicators() } }, '🎯 비핵심 지정'),
          el('button', { className: 'btn btn-sm', style: 'background:#f0fdf4;color:#059669;border:1px solid #bbf7d0', onClick: () => { _selectedIndicators.forEach(id => Store.updateIndicator(id, { materiality_optional: false })); _selectedIndicators.clear(); showToast('핵심 항목으로 지정되었습니다.', 'success'); renderIndicators() } }, '핵심 지정'),
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
          el('button', { className: 'btn btn-sm', style: 'background:#f0f7ff;color:#2563EB', onClick: () => openImportTemplate() }, '📥 템플릿 가져오기'),
          el('button', { className: 'btn btn-sm', style: 'background:#f0fff0;color:#059669', onClick: () => openCSVIndicatorImport() }, '📋 CSV 붙여넣기'),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => { _showQuickForm = !_showQuickForm; _editingIndicator = null; renderIndicators() } }, _showQuickForm ? '✕ 닫기' : '+ 새 지표 추가')
        )
      )
    )

    if (!filtered.length) {
      wrapper.append(
        el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
          el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📋'),
          el('p', { style: 'margin:0 0 12px;color:#9ca3af' }, _indicatorSearch ? `"${_indicatorSearch}"에 대한 검색 결과가 없습니다` : '등록된 지표가 없습니다'),
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
          el('div', { style: 'display:flex;align-items:center;gap:10px;padding:12px 16px;background:linear-gradient(135deg,#F8FAFC,#EEF4FA);border-bottom:2px solid #EEF4FA' },
            el('span', { style: 'font-size:18px' }, _selectedAuthority === 'ECOVADIS' ? '🌿' : _selectedAuthority === 'KSSB' ? '📜' : _selectedAuthority === 'KCGS' ? '🏢' : _selectedAuthority === 'NICE' ? '📊' : '📋'),
            el('h4', { style: 'margin:0;font-size:14px;color:#16304F;font-weight:700' }, Indicator.getGroupDisplayName(g)),
            el('span', { style: 'background:#1E3A5F;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600' }, `${groupActive}/${inds.length}`)
          ),
          el('div', { style: 'padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px;background:#F8FAFC' },
            ...inds.map(ind => renderIndicatorCard(ind))
          )
        )
      )
    })

    return wrapper
  }

  function renderIndicatorCard(ind) {
    const pillarColor = ind.pillar === 'POLICY' ? '#1E3A5F' : ind.pillar === 'ACTION' ? '#2563EB' : ind.pillar === 'RESULT' ? '#059669' : ind.pillar === 'GOVERNANCE' ? '#d97706' : ind.pillar === 'STRATEGY' ? '#1E3A5F' : ind.pillar === 'RISK_MGMT' ? '#dc2626' : '#1E3A5F'
    const isSelected = _selectedIndicators.has(ind.id)
    return el('div', { style: `background:#fff;border-radius:10px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.06);border-left:4px solid ${ind.is_active === false ? '#D0D5DD' : pillarColor};${ind.is_active === false ? 'opacity:.5' : ''}${isSelected ? ';outline:2px solid #1E3A5F;outline-offset:1px' : ''};cursor:pointer`, onClick: (e) => { if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; openIndicatorSlidePanel(ind) } },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px' },
        el('div', { style: 'flex:1' },
          el('div', { style: 'display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap' },
            el('input', { type: 'checkbox', checked: isSelected, onChange: (e) => { e.stopPropagation(); if (isSelected) _selectedIndicators.delete(ind.id); else _selectedIndicators.add(ind.id); renderIndicators() }, onClick: (e) => e.stopPropagation(), style: 'cursor:pointer;margin:0' }),
            el('span', { style: 'font-family:monospace;font-size:11px;font-weight:700;color:#1E3A5F;background:#EEF4FA;padding:2px 6px;border-radius:4px' }, ind.indicator_code),
            el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:' + (ind.pillar === 'POLICY' ? '#eef4fa;color:#1E3A5F' : ind.pillar === 'ACTION' ? '#eef4fa;color:#2563EB' : ind.pillar === 'RESULT' ? '#ecfdf5;color:#059669' : '#fef3c7;color:#D97706') }, ind.pillar ? Indicator.getPillarName(ind.pillar) : '-'),
            ind.materiality_optional === true ? el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#fef2f2;color:#dc2626;font-weight:600' }, '🎯 비핵심') : null
          ),
          el('div', { style: 'font-size:13px;font-weight:600;color:#14213D;line-height:1.4' }, Indicator.getDisplayName(ind))
        ),
        el('div', { style: 'display:flex;gap:4px' },
          el('button', { className: 'btn btn-sm', title: ind.materiality_optional === true ? '핵심 항목으로 지정' : '비핵심 항목으로 지정(중요성)', style: ind.materiality_optional === true ? 'background:#fef2f2;color:#dc2626' : 'background:#F8FAFC;color:#9CA3AF', onClick: (e) => { e.stopPropagation(); Indicator.toggleMateriality(ind.id); showToast(ind.materiality_optional === true ? '핵심 항목으로 지정되었습니다.' : '비핵심 항목으로 지정되었습니다.', 'success'); renderIndicators() } }, '🎯'),
          el('button', { className: 'btn btn-sm btn-secondary', title: '수정', onClick: (e) => { e.stopPropagation(); _editingIndicator = ind.id; _showQuickForm = true; renderIndicators() } }, '✏'),
          el('button', { className: 'btn btn-sm', title: ind.is_active !== false ? '비활성화' : '활성화', style: ind.is_active !== false ? 'background:#f0fff4;color:#059669' : 'background:#fff5f5;color:#dc2626', onClick: (e) => { e.stopPropagation(); Indicator.toggleActive(ind.id); renderIndicators() } }, ind.is_active !== false ? '✓' : '✗')
        )
      ),
      el('div', { style: 'display:flex;gap:6px;font-size:11px;color:#9ca3af;flex-wrap:wrap' },
        ind.dept_code ? el('span', { style: 'background:#EEF1F4;padding:2px 6px;border-radius:4px' }, ind.dept_code) : null,
        ind.review_cycle ? el('span', { style: 'background:#EEF1F4;padding:2px 6px;border-radius:4px' }, ind.review_cycle === 'annual' ? '매년' : ind.review_cycle === 'semi_annual' ? '반기' : ind.review_cycle === 'quarterly' ? '분기' : '매월') : null,
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
    const statusColors = { pending: '#d97706', self: '#2563EB', internal_reviewed: '#2563EB', externally_verified: '#059669', confirmed: '#059669' }
    const statusLabels = { pending: '미확인', self: '자가입력', internal_reviewed: '내부검토', externally_verified: '외부검증', confirmed: '확정' }
    const evHtml = evidences.length ? evidences.map(ev => {
      const files = evFileMap[ev.id] || []
      const sc = statusColors[ev.status] || '#9ca3af'
      const sl = statusLabels[ev.status] || ev.status || '-'
      const fileBtns = files.map((f, fi) => `<span style="display:inline-flex;gap:3px;margin-left:6px"><button onclick="event.stopPropagation();var f=window._indFileStore['${ev.id}_${fi}'];if(f)window.previewEvidenceFile(f)" style="font-size:9px;padding:1px 5px;border-radius:3px;background:#f0f7ff;color:#2563EB;border:1px solid #bfdbfe;cursor:pointer">열람</button><button onclick="event.stopPropagation();var f=window._indFileStore['${ev.id}_${fi}'];if(f)window.downloadEvidenceFile(f)" style="font-size:9px;padding:1px 5px;border-radius:3px;background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;cursor:pointer">다운</button></span>`).join('')
      return `<div style="display:flex;align-items:center;gap:6px;padding:7px 10px;background:#F8FAFC;border-radius:6px;margin-bottom:4px;font-size:12px;border:1px solid #eef1f4">
        <span style="font-size:14px;flex-shrink:0">📄</span>
        <span style="flex:1;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ev.title || '제목 없음'}</span>
        <span style="font-size:10px;padding:2px 6px;border-radius:8px;background:${sc}18;color:${sc};flex-shrink:0">${sl}</span>
        ${files.length ? `<span style="font-size:10px;color:#1E3A5F;flex-shrink:0">${files.length}파일</span>${fileBtns}` : '<span style="font-size:10px;color:#9CA3AF;flex-shrink:0">파일 없음</span>'}
      </div>`
    }).join('') : '<div style="color:#9ca3af;font-size:12px;padding:8px 0">연결된 증빙이 없습니다.</div>'
    const tabs = [
      { id: 'detail', label: '상세정보', content: `
        <div style="padding:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
            <span style="font-family:monospace;font-size:13px;font-weight:700;color:#1E3A5F;background:#EEF4FA;padding:3px 8px;border-radius:4px">${ind.indicator_code}</span>
            <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:#eef4fa;color:#1E3A5F">${ind.pillar || '-'}</span>
          </div>
          <h4 style="margin:0 0 12px;font-size:15px">${Indicator.getDisplayName(ind)}</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px">
            <div style="padding:8px;background:#F8FAFC;border-radius:6px"><span style="color:#9ca3af">기관</span><br><strong>${Indicator.getAuthorityName(ind.authority_code)}</strong></div>
            <div style="padding:8px;background:#F8FAFC;border-radius:6px"><span style="color:#9ca3af">그룹</span><br><strong>${group ? Indicator.getGroupDisplayName(group) : '-'}</strong></div>
            <div style="padding:8px;background:#F8FAFC;border-radius:6px"><span style="color:#9ca3af">담당부서</span><br><strong>${ind.dept_code || '-'}</strong></div>
            <div style="padding:8px;background:#F8FAFC;border-radius:6px"><span style="color:#9ca3af">검토주기</span><br><strong>${ind.review_cycle || '-'}</strong></div>
            <div style="padding:8px;background:#F8FAFC;border-radius:6px"><span style="color:#9ca3af">중요성(Materiality)</span><br><strong style="color:${ind.materiality_optional === true ? '#dc2626' : '#059669'}">${ind.materiality_optional === true ? '🎯 비핵심' : '핵심'}</strong></div>
          </div>
          <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" onclick="ESGComponents.closeSlidePanel();_editingIndicator=${ind.id};_showQuickForm=true;renderIndicators()">수정</button>
            <button class="btn btn-sm ${ind.is_active !== false ? 'btn-danger' : 'btn-success'}" onclick="Indicator.toggleActive(${ind.id});ESGComponents.closeSlidePanel();renderIndicators()">${ind.is_active !== false ? '비활성화' : '활성화'}</button>
            <button class="btn btn-sm" style="${ind.materiality_optional === true ? 'background:#f0fdf4;color:#059669;border:1px solid #bbf7d0' : 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca'}" onclick="Indicator.toggleMateriality(${ind.id});ESGComponents.closeSlidePanel();renderIndicators()">${ind.materiality_optional === true ? '핵심으로 지정' : '🎯 비핵심으로 지정'}</button>
          </div>
          <div style="margin-top:16px;border-top:1px solid #eef1f4;padding-top:12px">
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

    const nameInput = el('input', { value: ind?.indicator_name ?? '', required: true, placeholder: '지표 이름을 입력하세요', style: 'font-size:13px;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%' })
    const pillarSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%' },
      el('option', { value: '' }, '-- 필러 선택 --'),
      ...pillarOptions.map(p => el('option', { value: p, selected: ind?.pillar === p }, Indicator.getPillarName(p)))
    )
    const groupSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%' },
      el('option', { value: '' }, '-- 그룹 선택 --'),
      ...groups.map(g => el('option', { value: g.id, selected: ind?.group_id === g.id }, Indicator.getGroupDisplayName(g)))
    )
    const deptSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%' },
      el('option', { value: '' }, '-- 담당부서 --'),
      ...depts.map(d => el('option', { value: d.dept_code, selected: ind?.dept_code === d.dept_code }, d.dept_name))
    )
    const cycleSel = el('select', { style: 'font-size:13px;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%' },
      [['annual', '매년'], ['semi_annual', '반기'], ['quarterly', '분기'], ['monthly', '매월']].map(([v, l]) => el('option', { value: v, selected: ind?.review_cycle === v }, l))
    )
    const scope2Check = el('input', { type: 'checkbox', checked: ind?.scope2_split_required === true, style: 'cursor:pointer' })
    const materialityCheck = el('input', { type: 'checkbox', checked: ind?.materiality_optional === true, style: 'cursor:pointer' })

    const card = el('div', { className: 'card', style: 'border-left:3px solid #1E3A5F;background:#fafbff;margin-bottom:12px' },
      el('div', { style: 'padding:10px 16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #EEF4FA' },
        el('h4', { style: 'margin:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, isEdit ? `✏ ${ind?.indicator_code || ''}` : '+ 새 지표 추가'),
        el('button', { className: 'btn btn-sm', onClick: () => { _showQuickForm = false; _editingIndicator = null; renderIndicators() } }, '✕')
      ),
      el('div', { style: 'padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('div', { style: 'grid-column:1/3' },
          el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '지표명 *'),
          nameInput
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '필러 유형'),
          pillarSel
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '그룹'),
          groupSel
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '담당부서'),
          deptSel
        ),
        el('div', {},
          el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '검토주기'),
          cycleSel
        ),
        el('div', { style: 'grid-column:1/3;display:flex;align-items:center;gap:8px' },
          scope2Check,
          el('label', { style: 'font-size:12px;color:#6B7280;cursor:pointer' }, '🌍 Scope2 이중보고 대상 (location-based / market-based)')
        ),
        el('div', { style: 'grid-column:1/3;display:flex;align-items:center;gap:8px' },
          materialityCheck,
          el('label', { style: 'font-size:12px;color:#6B7280;cursor:pointer' }, '🎯 비핵심 항목 (중요성 평가에서 제외 가능)')
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
            materiality_optional: materialityCheck.checked,
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
      el('p', { style: 'margin:0;font-size:13px;color:#6b7280' }, '기준 템플릿에서 표준 지표를 가져옵니다.'),
      ...Object.entries(templates).map(([code, t]) => {
        const existing = Store.getIndicators().filter(i => i.authority_code === code).length
        return el('div', { style: `padding:10px 12px;border:1px solid ${existing > 0 ? '#e4e7eb' : '#1E3A5F33'};border-radius:8px;background:${existing > 0 ? '#F8FAFC' : '#fafbff'};display:flex;justify-content:space-between;align-items:center` },
          el('div', {},
            el('div', { style: 'font-weight:600;font-size:13px' }, `${Indicator.getAuthorityName(code)} — ${t.name}`),
            el('div', { style: 'font-size:11px;color:#9ca3af;margin-top:2px' }, `${t.desc} (현재 ${existing}개)`)
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
      el('p', { style: 'margin:0;font-size:12px;color:#6b7280' }, '엑셀/CSV에서 복사한 테이블을 붙여넣으세요. 헤더: 지표코드 | 지표명 | 필러 | 담당부서 | 검토주기'),
      el('textarea', { id: 'csvIndInput', rows: 8, placeholder: '지표코드\t지표명\t필러\t담당부서\t검토주기\nMY-ENV-01\t온실가스 배출량 관리\tRESULT\t환경팀\tannual\nMY-SOC-01\t인재육성체계\tACTION\t인사팀\tannual', style: 'width:100%;padding:8px;border:1px solid #e4e7eb;border-radius:6px;font-family:monospace;font-size:11px;box-sizing:border-box' }),
      el('div', { id: 'csvIndPreview', style: 'font-size:11px;color:#9ca3af' })
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
      container.append(el('p', { style: 'padding:20px;color:#9CA3AF;text-align:center' }, '등록된 매핑이 없습니다. 기관 간 지표 매핑을 추가하세요.'))
    } else {
      const rows = mappings.map(m => {
        const srcInd = allIndicators.find(i => i.id === m.source_indicator_id)
        const tgtInd = allIndicators.find(i => i.id === m.target_indicator_id)
        const confColors = { high: '#047857', medium: '#d97706', low: '#dc2626' }
        const confLabels = { high: '높음', medium: '보통', low: '낮음' }
        const typeLabels = { direct: '직접', expanded: '확장', indirect: '간접' }
        return el('tr', {},
          el('td', { style: 'font-size:12px' }, srcInd ? `${Indicator.getAuthorityName(srcInd.authority_code)} - ${srcInd.indicator_code}` : '?'),
          el('td', { style: 'font-size:12px' }, srcInd ? Indicator.getDisplayName(srcInd) : '?'),
          el('td', { style: 'text-align:center;font-size:16px;color:#1E3A5F' }, '→'),
          el('td', { style: 'font-size:12px' }, tgtInd ? `${Indicator.getAuthorityName(tgtInd.authority_code)} - ${tgtInd.indicator_code}` : '?'),
          el('td', { style: 'font-size:12px' }, tgtInd ? Indicator.getDisplayName(tgtInd) : '?'),
          el('td', { style: 'text-align:center;font-size:12px' }, typeLabels[m.mapping_type] || m.mapping_type),
          el('td', { style: 'text-align:center' },
            el('span', { style: `padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;background:${confColors[m.confidence] || '#D0D5DD'}20;color:${confColors[m.confidence] || '#9ca3af'}` }, confLabels[m.confidence] || m.confidence || '-')
          ),
          el('td', { style: 'text-align:center' },
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('매핑을 삭제하시겠습니까?')) { Store.deleteIndicatorMapping(m.id); showToast('매핑이 삭제되었습니다.', 'success'); renderIndicators() } } }, '삭제')
          )
        )
      })
      container.append(
        el('table', { style: 'width:100%;border-collapse:collapse;font-size:12px' },
          el('thead', {}, el('tr', {},
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #EEF4FA' }, '원본 기관-코드'),
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #EEF4FA' }, '원본 지표명'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #EEF4FA;width:40px' }, ''),
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #EEF4FA' }, '대상 기관-코드'),
            el('th', { style: 'padding:8px;text-align:left;border-bottom:2px solid #EEF4FA' }, '대상 지표명'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #EEF4FA' }, '유형'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #EEF4FA' }, '신뢰도'),
            el('th', { style: 'padding:8px;text-align:center;border-bottom:2px solid #EEF4FA' }, '관리')
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
        el('div', { style: 'padding-bottom:8px;font-size:20px;color:#1E3A5F' }, '→'),
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
          el('p', { style: 'margin:0 0 16px;color:#9ca3af;font-size:13px' }, '증빙 문서는 평가별 55건까지 등록 가능합니다.'),
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
        expiringSoon.length ? el('span', { style: 'font-size:11px;padding:3px 8px;border-radius:12px;background:#d97706;color:#fff' }, `만료임박 ${expiringSoon.length}건`) : null,
        expired.length ? el('span', { style: 'font-size:11px;padding:3px 8px;border-radius:12px;background:#dc2626;color:#fff' }, `만료됨 ${expired.length}건`) : null,
        pendingReview.length ? el('span', { style: 'font-size:11px;padding:3px 8px;border-radius:12px;background:#2563EB;color:#fff' }, `검토대기 ${pendingReview.length}건`) : null,
        !expiringSoon.length && !expired.length && !pendingReview.length ? el('span', { style: 'font-size:11px;color:#92400e' }, '✅ 특이사항 없음') : null
      )
    )
    c.append(todoCard)

    const statusCounts = Evidence.countByStatus(_evidenceAssId)
    const total = statusCounts.total || 1
    const confirmedRate = Math.round(((statusCounts.confirmed || 0) + (statusCounts.externally_verified || 0)) / total * 100)
    const confidenceColor = confirmedRate >= 80 ? '#059669' : confirmedRate >= 50 ? '#d97706' : '#dc2626'

    const gaugeCard = el('div', { className: 'card', style: 'padding:12px 16px;margin-bottom:12px;display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
      el('span', { style: 'font-size:13px;font-weight:600;color:#1F2937' }, '📊 신뢰도'),
      el('div', { style: 'flex:1;min-width:120px;max-width:200px;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden' },
        el('div', { style: `width:${confirmedRate}%;height:100%;background:${confidenceColor};border-radius:4px;transition:width .3s` })
      ),
      el('span', { style: `font-size:13px;font-weight:700;color:${confidenceColor}` }, `${confirmedRate}%`),
      el('span', { style: 'font-size:11px;color:#9ca3af' }, `(${statusCounts.confirmed || 0}건 확정 / ${statusCounts.total || 0}건 전체)`),
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
        el('select', { id: 'evAssSelect', style: 'font-size:13px;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px', onChange: () => { _evidenceAssId = parseInt(document.getElementById('evAssSelect').value); renderEvidenceMgmt() } },
          ...assessments.map(a => el('option', { value: a.id, selected: a.id === _evidenceAssId }, a.title))
        ),
        el('input', { id: 'evSearch', type: 'text', placeholder: '🔍 제목/유형/태그 검색...', value: searchQuery, style: 'flex:1;min-width:200px;font-size:13px;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px', onInput: () => { _evidenceSearchQuery = document.getElementById('evSearch').value; renderEvidenceMgmt() } }),
        el('span', { style: 'font-size:12px;color:#9ca3af' }, `${evidences.length}건`),
        el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_evidenceViewMode === 'list' ? '#1E3A5F' : '#EEF1F4'};color:${_evidenceViewMode === 'list' ? '#fff' : '#6b7280'};border:1px solid ${_evidenceViewMode === 'list' ? '#1E3A5F' : '#e4e7eb'}`, onClick: () => { _evidenceViewMode = 'list'; renderEvidenceMgmt() } }, '📋 목록'),
        el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_evidenceViewMode === 'gantt' ? '#1E3A5F' : '#EEF1F4'};color:${_evidenceViewMode === 'gantt' ? '#fff' : '#6b7280'};border:1px solid ${_evidenceViewMode === 'gantt' ? '#1E3A5F' : '#e4e7eb'}`, onClick: () => { _evidenceViewMode = 'gantt'; renderEvidenceMgmt() } }, '📊 간트차트'),
        el('button', { className: 'btn btn-primary btn-sm', onClick: openAddEvidence }, '+ 증빙 추가'),
        el('button', { className: 'btn btn-sm', style: 'font-size:11px;background:#eef4fa;color:#1E3A5F;border:1px solid #e4e7eb6fe', onClick: () => openCameraCapture(file => _handleEvidenceFileDrop([file])) }, '📷 카메라 촬영'),
        el('button', { className: 'btn btn-sm', style: 'font-size:11px;background:#f0f7ff;color:#2563EB;border:1px solid #bfdbfe', onClick: () => {
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
      onDragEnter: e => { e.preventDefault(); dropZone.style.borderColor = '#1E3A5F'; dropZone.style.background = '#eef4fa' },
      onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
      onDragLeave: e => { if (!dropZone.contains(e.relatedTarget)) { dropZone.style.borderColor = '#c3cdda'; dropZone.style.background = '#fbfcfd' } },
      onDrop: e => { e.preventDefault(); dropZone.style.borderColor = '#c3cdda'; dropZone.style.background = '#fbfcfd'; _handleEvidenceFileDrop(e.dataTransfer.files) },
      onClick: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.csv,.txt,.pptx'; inp.onchange = () => _handleEvidenceFileDrop(inp.files); inp.click() }
    },
      el('div', { style: 'font-size:28px;margin-bottom:6px' }, '📥'),
      el('div', { style: 'font-size:13px;color:#6b7280' }, '여기로 파일을 끌어다 놓으세요 — '),
      el('span', { style: 'font-size:13px;color:#1E3A5F;font-weight:600' }, '여러 개 동시 업로드 가능'),
      el('div', { style: 'font-size:11px;color:#9CA3AF;margin-top:4px' }, 'PDF, Excel, Word, 이미지 등 (최대 10MB)')
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
          el('p', { style: 'margin:0 0 12px;color:#9ca3af' }, searchQuery ? `"${searchQuery}" 검색 결과 없음` : '등록된 증빙이 없습니다'),
          !searchQuery ? el('button', { className: 'btn btn-primary', onClick: openAddEvidence }, '+ 첫 증빙 추가') : null
        )
      )
      return
    }

    const fileLabels = { pdf: 'PDF', xlsx: 'Excel', docx: 'Word', img: '이미지', etc: '기타' }
    const statusLabels = { pending: '미확인', self: '자가입력', internal_reviewed: '내부검토', externally_verified: '외부검증', confirmed: '확정' }
    const statusColors = { pending: '#d97706', self: '#2563EB', internal_reviewed: '#2563EB', externally_verified: '#059669', confirmed: '#059669', expired: '#dc2626', missing: '#9ca3af' }
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

      const row = el('div', { style: `border-bottom:1px solid #EEF1F4;${idx === filteredEvidences.length - 1 ? 'border-bottom:none' : ''}` },
        el('div', {
          style: `display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .15s;${isExpanded ? 'background:#F8FAFC' : ''}`,
          onMouseEnter: e => { if (!isExpanded) e.currentTarget.style.background = '#F8FAFC' },
          onMouseLeave: e => { if (!isExpanded) e.currentTarget.style.background = '' },
          onClick: () => { _evidencePreviewId = isExpanded ? null : ev.id; renderEvidenceMgmt() }
        },
          el('span', { style: 'font-size:11px;color:#9CA3AF;min-width:20px' }, `${idx + 1}`),
          el('span', { style: 'font-size:18px;flex-shrink:0' }, fileIcons[ev.file_type] || '📁'),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-size:13px;font-weight:600;color:#14213D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, ev.title),
            el('div', { style: 'display:flex;gap:6px;align-items:center;margin-top:3px;flex-wrap:wrap' },
              el('span', { style: `font-size:10px;padding:2px 6px;border-radius:4px;background:${statusColors[ev.status] || '#9ca3af'}15;color:${statusColors[ev.status] || '#9ca3af'};font-weight:500` }, statusLabels[ev.status] || ev.status || '미확인'),
              el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#EEF1F4;color:#6b7280' }, fileLabels[ev.file_type] || ev.file_type || '-'),
              files.length > 0 ? el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#1E3A5F10;color:#1E3A5F' }, `${files.length}파일`) : null,
              ev.contains_sensitive_data ? el('span', { style: 'font-size:10px;padding:2px 6px;border-radius:4px;background:#dc262610;color:#dc2626' }, '🔒') : null
            )
          ),
          tagCodes.length ? el('div', { style: 'display:flex;gap:3px;flex-wrap:wrap;max-width:200px' },
            ...tagCodes.slice(0, 3).map(code => el('span', { style: 'font-size:9px;padding:1px 4px;border-radius:3px;background:#f0f7ff;color:#2563EB;font-family:monospace' }, code)),
            tagCodes.length > 3 ? el('span', { style: 'font-size:9px;color:#9CA3AF' }, `+${tagCodes.length - 3}`) : null
          ) : null,
          el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px', onClick: (e) => { e.stopPropagation(); _evidencePreviewId = ev.id; renderEvidenceMgmt() } }, '수정'),
          el('button', { className: 'btn btn-sm', style: 'font-size:11px;color:#dc2626', onClick: (e) => { e.stopPropagation(); if (confirm('삭제?')) { Store.deleteEvidence(ev.id); if (_evidencePreviewId === ev.id) _evidencePreviewId = null; showToast('증빙이 삭제되었습니다.', 'success'); renderEvidenceMgmt() } } }, '✕')
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

    const detail = el('div', { style: 'padding:12px 16px 16px 48px;background:#fafbff;border-top:1px solid #EEF4FA' },
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px' },
        el('div', {},
          el('label', { style: 'font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '제목'),
          el('input', { id: 'evEditTitle', type: 'text', value: ev.title || '', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' })
        ),
        el('div', {},
          el('label', { style: 'font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '유형'),
          el('select', { id: 'evEditType', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' },
            ...Object.entries(fileLabels).map(([k, v]) => el('option', { value: k, selected: k === ev.file_type }, v))
          )
        ),
        el('div', {},
          el('label', { style: 'font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '검증상태'),
          el('select', { id: 'evEditStatus', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' },
            ...Object.entries(statusLabels).map(([k, v]) => el('option', { value: k, selected: k === ev.status }, v))
          )
        )
      ),
      el('div', { style: 'margin-bottom:12px' },
        el('label', { style: 'font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px' }, '태그 (지표 연결)'),
        el('div', { id: 'evEditTags', style: 'display:flex;flex-wrap:wrap;gap:4px;padding:6px;border:1px solid #e4e7eb;border-radius:5px;min-height:32px;align-items:center' },
          ...tags.map(t => {
            const ind = allIndicators.find(i => i.id === t.indicator_id)
            if (!ind) return null
            return el('span', { style: 'display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 6px;border-radius:10px;background:#1E3A5F;color:#fff;cursor:default' },
              el('span', {}, ind.indicator_code),
              el('button', { style: 'background:none;border:none;color:#fff;cursor:pointer;font-size:10px;padding:0;line-height:1', onClick: () => {
                Evidence.untag(ev.id, ind.id)
                renderEvidenceMgmt()
              } }, '×')
            )
          }).filter(Boolean),
          el('button', { id: 'evAddTagBtn', style: 'display:inline-flex;align-items:center;font-size:10px;padding:2px 6px;border-radius:10px;background:#EEF1F4;color:#6b7280;cursor:pointer;border:1px dashed #D0D5DD', onClick: (e) => {
            e.stopPropagation()
            const existing = document.getElementById('evTagDropdown')
            if (existing) { existing.remove(); return }
            const untagged = allIndicators.filter(i => !tagIndicatorIds.includes(i.id))
            if (!untagged.length) return
            const dd = el('div', { id: 'evTagDropdown', style: 'position:absolute;z-index:100;background:#fff;border:1px solid #e4e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.15);max-height:200px;overflow-y:auto;padding:4px;width:180px' },
              ...untagged.slice(0, 20).map(ind => el('div', { style: 'font-size:11px;padding:4px 8px;cursor:pointer;border-radius:4px', onMouseEnter: e => e.currentTarget.style.background='#F8FAFC', onMouseLeave: e => e.currentTarget.style.background='', onClick: (ev2) => { ev2.stopPropagation(); Evidence.tag(ev.id, ind.id); renderEvidenceMgmt() } },
                el('span', { style: 'font-family:monospace;color:#1E3A5F;margin-right:4px' }, ind.indicator_code),
                el('span', { style: 'color:#1F2937' }, ind.indicator_name)
              ))
            )
            const btn = document.getElementById('evAddTagBtn')
            if (btn) btn.parentElement.appendChild(dd)
            setTimeout(() => document.addEventListener('click', function handler() { dd.remove(); document.removeEventListener('click', handler) }, { once: true }), 0)
          } }, '+ 지표')
        )
      ),
      el('div', { style: 'margin-bottom:12px;padding:10px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0' },
        el('div', { style: 'font-weight:600;font-size:11px;color:#047857;margin-bottom:6px' }, '📋 프로젝트 정보'),
        el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:6px;font-size:11px' },
          el('div', {}, el('span', { style: 'color:#9ca3af' }, '담당자: '), el('strong', {}, ev.assignee || '미지정')),
          el('div', {}, el('span', { style: 'color:#9ca3af' }, '부서: '), el('strong', {}, ev.department || '미지정')),
          el('div', {}, el('span', { style: 'color:#9ca3af' }, '업무: '), el('strong', {}, ev.task_type || '-')),
          el('div', {}, el('span', { style: 'color:#9ca3af' }, '우선순위: '), el('strong', { style: `color:${ev.priority === '높음' ? '#dc2626' : ev.priority === '낮음' ? '#2563EB' : '#1F2937'}` }, ev.priority || '보통')),
          el('div', {}, el('span', { style: 'color:#9ca3af' }, '시작: '), el('strong', {}, ev.start_date || '-')),
          el('div', {}, el('span', { style: 'color:#9ca3af' }, '마감: '), el('strong', { style: ev.due_date && new Date(ev.due_date) < new Date() ? 'color:#dc2626' : '' }, ev.due_date || '-'))
        ),
        ev.progress > 0 ? el('div', { style: 'margin-top:6px;display:flex;align-items:center;gap:6px' },
          el('div', { style: 'flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden' },
            el('div', { style: `width:${ev.progress}%;height:100%;background:#059669;border-radius:3px;transition:width .3s` })
          ),
          el('span', { style: 'font-size:10px;color:#047857;font-weight:600' }, ev.progress + '%')
        ) : null
      ),
      el('div', { style: 'margin-bottom:12px' },
        el('label', { style: 'font-size:11px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px' }, '첨부파일'),
        el('div', {
          id: 'ev-file-drop-' + ev.id,
          style: 'border:2px dashed #d0d5dd;border-radius:8px;padding:14px;text-align:center;font-size:12px;color:#9ca3af;margin-bottom:8px;transition:border-color .15s,background .15s;cursor:pointer',
          onDragEnter: e => { e.preventDefault(); e.currentTarget.style.borderColor = '#1E3A5F'; e.currentTarget.style.background = '#eef4fa' },
          onDragOver: e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' },
          onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) { e.currentTarget.style.borderColor = '#d0d5dd'; e.currentTarget.style.background = '' } },
          onDrop: e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.borderColor = '#d0d5dd'; e.currentTarget.style.background = ''; _handleEvidenceInlineFileDrop(ev.id, e.dataTransfer.files) },
          onClick: () => { const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.gif,.csv,.txt,.pptx'; inp.onchange = () => _handleEvidenceInlineFileDrop(ev.id, inp.files); inp.click() }
        }, '📎 여기에 파일을 끌어다 놓거나 클릭하여 첨부'),
        el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px;margin-bottom:8px', onClick: () => openCameraCapture(f => _handleEvidenceInlineFileDrop(ev.id, [f])) }, '📷 카메라로 촬영'),
        files.length ? el('div', { style: 'display:flex;flex-direction:column;gap:4px' },
          ...files.map(f => el('div', { style: 'display:flex;align-items:center;gap:6px;padding:6px 8px;background:#F8FAFC;border-radius:6px;font-size:11px;border:1px solid #eef1f4' },
            el('span', { style: 'font-size:14px;flex-shrink:0' }, fileIcons[f.file_type] || '📁'),
            el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500' }, f.original_name || f.file_name),
            el('span', { style: 'color:#9CA3AF;font-size:10px;flex-shrink:0' }, f.file_size ? (f.file_size / 1024).toFixed(0) + 'KB' : ''),
            el('button', { style: 'background:#f0f7ff;color:#2563EB;border:1px solid #bfdbfe;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0', onClick: () => _previewEvidenceFile(f) }, '열람'),
            el('button', { style: 'background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;border-radius:4px;padding:3px 8px;cursor:pointer;font-size:10px;font-weight:600;flex-shrink:0', onClick: () => _downloadEvidenceFile(f) }, '다운'),
            el('button', { style: 'background:none;border:none;color:#dc2626;cursor:pointer;font-size:12px;padding:2px 4px;flex-shrink:0', onClick: () => { if (confirm('이 파일을 삭제하시겠습니까?')) { Store.deleteEvidenceFile(f.id); renderEvidenceMgmt() } } }, '✕')
          ))
        ) : el('div', { style: 'font-size:11px;color:#9CA3AF;padding:4px 0' }, '첨부된 파일이 없습니다')
      ),
      el('div', { style: 'display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap' },
        tags.length ? el('div', { style: 'flex:1;display:flex;gap:4px;flex-wrap:wrap;align-items:center' },
          el('span', { style: 'font-size:10px;color:#9ca3af' }, '바로가기:'),
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
    if (!allWithDates.length) return el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📊'), el('p', { style: 'color:#9ca3af' }, '일정이 설정된 증빙이 없습니다. 증빙 추가/수정 시 시작일과 마감일을 지정해주세요.'))

    const allDates = allWithDates.flatMap(ev => [ev.start_date ? new Date(ev.start_date) : null, ev.due_date ? new Date(ev.due_date) : null].filter(Boolean))
    const minDate = new Date(Math.min(...allDates))
    const maxDate = new Date(Math.max(...allDates))
    minDate.setDate(minDate.getDate() - 3)
    maxDate.setDate(maxDate.getDate() + 7)
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24))
    const dayWidth = Math.max(40, Math.min(60, 800 / totalDays))

    const priorityColors = { '높음': '#dc2626', '보통': '#2563EB', '낮음': '#059669' }
    const statusColors = { pending: '#d97706', self: '#2563EB', internal_reviewed: '#2563EB', externally_verified: '#059669', confirmed: '#059669' }

    const headerDays = []
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const isToday = d.toDateString() === today.toDateString()
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      headerDays.push(el('div', { style: `width:${dayWidth}px;flex-shrink:0;text-align:center;font-size:9px;padding:4px 0;${isToday ? 'background:#1E3A5F20;font-weight:700;color:#1E3A5F' : isWeekend ? 'background:#F8FAFC;color:#9CA3AF' : 'color:#9ca3af'}` }, `${d.getMonth() + 1}/${d.getDate()}`))
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
      const color = isOverdue ? '#dc2626' : (priorityColors[ev.priority] || '#2563EB')

      const barBg = el('div', {
        style: `position:absolute;left:${barLeft}px;width:${barWidth}px;height:22px;background:${color}20;border:1px solid ${color}60;border-radius:4px;top:4px;cursor:pointer;display:flex;align-items:center;padding:0 6px;overflow:hidden`,
        onClick: () => { _evidencePreviewId = ev.id; renderEvidenceMgmt() },
        title: `${ev.title}\n${ev.start_date || '?'} ~ ${ev.due_date || '?'}\n담당: ${ev.assignee || '미지정'} (${ev.progress || 0}%)`
      },
        el('div', { style: `height:100%;width:${ev.progress || 0}%;background:${color};border-radius:3px;transition:width .3s` }),
        el('span', { style: `position:absolute;left:8px;font-size:10px;font-weight:600;color:${color};white-space:nowrap;text-shadow:0 0 3px #fff` }, ev.title)
      )

      const todayLine = el('div', { style: `position:absolute;left:${Math.ceil((today - minDate) / (1000 * 60 * 60 * 24)) * dayWidth}px;width:2px;height:100%;background:#dc2626;z-index:2;top:0` })

      return el('div', { style: 'position:relative;height:30px;border-bottom:1px solid #EEF1F4' }, barBg, todayLine)
    })

    return el('div', { className: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { style: 'padding:12px 16px;border-bottom:1px solid #eef1f4;display:flex;justify-content:space-between;align-items:center' },
        el('span', { style: 'font-weight:600;font-size:13px' }, `📊 간트차트 (${allWithDates.length}건)`),
        el('div', { style: 'display:flex;gap:8px;font-size:10px' },
          el('span', {}, el('span', { style: 'display:inline-block;width:10px;height:10px;background:#dc2626;border-radius:2px;margin-right:3px' }, ''), '지연'),
          el('span', {}, el('span', { style: 'display:inline-block;width:10px;height:10px;background:#2563EB;border-radius:2px;margin-right:3px' }, ''), '보통'),
          el('span', {}, el('span', { style: 'display:inline-block;width:10px;height:10px;background:#059669;border-radius:2px;margin-right:3px' }, ''), '낮음'),
          el('span', {}, el('span', { style: 'display:inline-block;width:2px;height:10px;background:#dc2626;margin-right:3px' }, ''), '오늘')
        )
      ),
      el('div', { style: 'display:flex;overflow-x:auto' },
        el('div', { style: `min-width:160px;flex-shrink:0;border-right:1px solid #eef1f4;background:#F8FAFC` },
          el('div', { style: 'height:32px;border-bottom:1px solid #eef1f4;display:flex;align-items:center;padding:0 12px;font-size:10px;font-weight:600;color:#9ca3af' }, '증빙명'),
          ...allWithDates.sort((a, b) => { const as = a.start_date ? new Date(a.start_date) : new Date(a.due_date); const bs = b.start_date ? new Date(b.start_date) : new Date(b.due_date); return as - bs }).map(ev => el('div', { style: 'height:30px;border-bottom:1px solid #EEF1F4;display:flex;align-items:center;padding:0 12px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer', onClick: () => { _evidencePreviewId = ev.id; renderEvidenceMgmt() } },
            el('span', { style: `width:6px;height:6px;border-radius:50%;background:${statusColors[ev.status] || '#9ca3af'};margin-right:6px;flex-shrink:0` }),
            ev.title || '제목 없음'
          ))
        ),
        el('div', { style: 'flex:1;overflow-x:auto;position:relative' },
          el('div', { style: `display:flex;height:32px;border-bottom:1px solid #eef1f4;background:#F8FAFC` }, ...headerDays),
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

  function openCameraCapture(onCapture) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('이 브라우저에서는 카메라를 사용할 수 없습니다.\n파일 업로드를 이용해주세요.')
      return
    }
    const video = el('video', { autoplay: true, playsinline: true, muted: true, style: 'width:100%;max-height:58vh;border-radius:8px;background:#000' })
    const statusMsg = el('div', { style: 'font-size:11px;color:#9CA3AF;margin-top:8px;min-height:16px' }, '카메라를 시작하는 중...')
    let stream = null
    const stop = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null } }
    const closeCam = () => { stop(); overlay.remove() }
    const captureBtn = el('button', {
      className: 'btn btn-primary',
      style: 'flex:1',
      onClick: () => {
        if (!stream) { overlay.remove(); return }
        const w = video.videoWidth
        const h = video.videoHeight
        if (!w || !h) { alert('카메라 영상이 아직 준비되지 않았습니다.'); return }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob(blob => {
          if (!blob) { return }
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const file = new File([blob], `카메라촬영_${ts}.jpg`, { type: 'image/jpeg' })
          stop()
          overlay.remove()
          onCapture(file)
        }, 'image/jpeg', 0.85)
      }
    }, '📸 촬영')
    const cancelBtn = el('button', { className: 'btn btn-secondary', style: 'flex:1', onClick: () => { if (stream) stream.getTracks().forEach(t => t.stop()); overlay.remove() } }, '✕ 취소')
    const overlay = el('div', { style: 'position:fixed;inset:0;background:rgba(0,0,0,.78);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px' },
      el('div', { style: 'background:#fff;border-radius:12px;padding:16px;width:100%;max-width:520px' },
        el('div', { style: 'font-size:15px;font-weight:700;margin-bottom:10px' }, '📷 카메라 촬영'),
        video,
        statusMsg,
        el('div', { style: 'display:flex;gap:8px;margin-top:12px' }, cancelBtn, captureBtn)
      )
    )
    document.body.appendChild(overlay)
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => { stream = s; video.srcObject = s; statusMsg.textContent = '카메라를 촬영 대상에 맞춘 뒤 촬영 버튼을 누르세요.' })
      .catch(err => {
        statusMsg.style.color = '#dc2626'
        statusMsg.textContent = '카메라를 시작할 수 없습니다: ' + (err && err.name ? err.name : '오류') + ' — 권한 허용 및 HTTPS 환경을 확인하세요.'
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
        const pre = el('pre', { style: 'font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-all;padding:12px;background:#F8FAFC;border-radius:8px;max-height:60vh;overflow:auto' }, decoded)
        body.append(pre)
      } catch { body.append(el('p', { style: 'color:#9ca3af' }, '미리보기를 지원하지 않는 파일 형식입니다.')) }
    } else {
      body.append(el('div', { style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:48px;margin-bottom:12px' }, fileIcons[file.file_type] || '📁'),
        el('p', { style: 'font-size:13px;color:#1F2937;font-weight:600' }, file.file_name),
        el('p', { style: 'font-size:12px;color:#9ca3af' }, '이 파일 형식은 브라우저에서 미리보기가 제한됩니다. 다운로드하여 확인하세요.')
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
        const row = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:4px 8px;background:#F8FAFC;border-radius:6px;margin-bottom:4px;font-size:12px' },
          el('span', {}, '📎 ' + f.file_name),
          el('span', { style: 'color:#9CA3AF' }, `(${(f.file_size / 1024).toFixed(1)}KB)`),
          el('button', { type: 'button', style: 'background:#dc2626;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px', onClick: () => { Store.deleteEvidenceFile(f.id); row.remove() } }, '×')
        )
        fileListContainer.append(row)
      })
    }

    function addPendingFile(file) {
      {
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
          el('span', { style: 'color:#9CA3AF' }, `(${(file.size / 1024).toFixed(1)}KB)`),
          extractionInfo.length ? el('span', { style: 'color:#1E3A5F;font-size:10px' }, '🤖 ' + extractionInfo.join(', ')) : null,
          el('button', { type: 'button', style: 'background:#dc2626;color:#fff;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px', onClick: () => { window._pendingFiles = window._pendingFiles.filter(f => f !== file); row.remove() } }, '×')
        )
        fileListContainer.append(row)
        if (extractionInfo.length && !isEdit) {
          Store.addExtraction({ id: Date.now(), file_name: fname, file_hash: fname, extracted_date: dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : null, extracted_type: docType || null, evidence_id: null })
        }
      }
    }
    fileInput.onchange = () => { Array.from(fileInput.files || []).forEach(addPendingFile); fileInput.value = '' }

    const tagContainer = el('div', { style: 'margin-top:8px' })
    const autoTagBox = el('div', { id: 'auto-tag-box', style: 'margin:8px 0;padding:10px;background:#f0f6ff;border-radius:8px;display:none;font-size:12px' })

    window._tagValues = existingTags.slice()

    function addTagRow(val) {
      const row = el('div', { style: 'display:flex;gap:6px;margin-bottom:6px' },
        el('select', { style: 'flex:1' },
          el('option', { value: '' }, '=== 항목 선택 ==='),
          ...indicators.map(ind => el('option', { value: ind.id, selected: ind.id === val }, Indicator.getNameAndCode(ind)))
        ),
        el('button', { type: 'button', style: 'background:#dc2626;color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px' }, '×')
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
      autoTagBox.innerHTML = '<div style="font-weight:600;color:#1E3A5F;margin-bottom:6px">🤖 자동 태그 제안</div>' +
        newOnes.map(s => `<div style="display:flex;align-items:center;gap:6px;padding:4px 0"><input type="checkbox" class="auto-tag-cb" data-id="${s.indicator_id}" data-code="${s.indicator_code}" checked style="accent-color:#1E3A5F"><span>${s.indicator_code} — ${s.indicator_name}</span><span style="color:#9CA3AF;font-size:10px">(${s.confidence})</span></div>`).join('') +
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

    const assignee = el('input', { value: ev?.assignee ?? '', placeholder: '담당자 이름', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const deptInput = el('input', { value: ev?.department ?? '', placeholder: '부서명', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const taskType = el('select', { style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' },
      ...['', '정책수립', '검증', '보고서 작성', '데이터 수집', '개선조치', '교육훈련', '기타'].map(t => el('option', { value: t, selected: ev?.task_type === t }, t || '-- 업무유형 선택 --'))
    )
    const startDate = el('input', { type: 'date', value: ev?.start_date ?? '', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const dueDate = el('input', { type: 'date', value: ev?.due_date ?? '', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' })
    const prioritySel = el('select', { style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:5px;font-size:12px;box-sizing:border-box' },
      ...['높음', '보통', '낮음'].map(p => el('option', { value: p, selected: (ev?.priority || '보통') === p }, p))
    )
    const progressInput = el('input', { type: 'range', min: '0', max: '100', value: ev?.progress ?? '0', style: 'width:100%' })
    const progressLabel = el('span', { style: 'font-size:11px;color:#9ca3af;margin-left:8px' }, (ev?.progress ?? '0') + '%')
    progressInput.oninput = () => { progressLabel.textContent = progressInput.value + '%' }

    const pmSection = el('div', { style: 'margin-top:12px;padding:12px;background:#F8FAFC;border-radius:8px;border:1px solid #eef1f4' },
      el('div', { style: 'font-weight:600;font-size:12px;color:#6B7280;margin-bottom:8px' }, '📋 프로젝트 관리'),
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

    form.append(el('label', {}, '제목', title), el('label', {}, '파일 유형', fileType), el('label', {}, '상태', status), el('label', {}, '유효기간', expiryDate), el('label', { style: 'font-size:12px' }, sensitiveCheck, ' 민감정보 포함'), autoTagBox, el('label', {}, '파일 첨부 (다중 선택 가능)', fileInput, el('button', { type: 'button', className: 'btn btn-sm btn-secondary', style: 'font-size:11px;margin-left:6px', onClick: () => openCameraCapture(f => addPendingFile(f)) }, '📷 카메라 촬영'), fileListContainer), pmSection, el('label', { style: 'margin-top:8px;font-weight:500' }, '연결 항목'), tagContainer)
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
          el('p', { style: 'margin:0 0 16px;color:#9ca3af;font-size:13px' }, 'GHG 데이터 입력을 위해 먼저 평가를 생성하세요.'),
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

    const scopeColors = { '1': '#2563EB', '2_location-based': '#059669', '2_market-based': '#047857', '3': '#1E3A5F' }
    const scopeLabels = { '1': 'Scope 1', '2_location-based': 'Scope 2 (위치)', '2_market-based': 'Scope 2 (시장)', '3': 'Scope 3' }

    let barsHtml = ''
    if (entries.length) {
      const maxVal = Math.max(...entries.map(e => e.total), 1)
      barsHtml = entries.map(e => {
        const key = `${e.scope}${e.scope2_method ? '_' + e.scope2_method : ''}`
        const color = scopeColors[key] || '#9CA3AF'
        const label = scopeLabels[key] || `Scope ${e.scope}`
        const pct = (e.total / maxVal * 100).toFixed(0)
        return `<div style="display:flex;align-items:center;gap:10px;margin:8px 0">
          <span style="width:110px;font-size:12px;color:#6B7280;text-align:right">${label}</span>
          <div style="flex:1;background:#EEF1F4;height:24px;border-radius:12px;overflow:hidden">
            <div style="background:${color};height:100%;width:${pct}%;border-radius:12px;display:flex;align-items:center;padding-left:8px;font-size:11px;color:#fff;font-weight:600;min-width:${pct > 10 ? '0' : '40px'}">${e.total.toFixed(1)}</div>
          </div>
          <span style="width:80px;font-size:12px;color:#6b7280">${e.count}건</span>
        </div>`
      }).join('')
    }

    const byType = {}
    activities.forEach(a => { if (!byType[a.energy_type]) byType[a.energy_type] = 0; byType[a.energy_type] += a.co2eq || 0 })
    const typeEntries = Object.entries(byType).sort((a, b) => b[1] - a[1])
    const maxType = typeEntries.length ? typeEntries[0][1] : 1
    const typeColors = { electricity: '#2563EB', natural_gas: '#d97706', diesel: '#6B7280', gasoline: '#dc2626', water: '#2563EB', waste: '#795548', other: '#9CA3AF' }
    const typeBars = typeEntries.map(([type, val]) => {
      const pct = (val / maxType * 100).toFixed(0)
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px">
        <span style="width:80px;color:#6B7280;text-align:right">${ENERGY_LABELS[type] || type}</span>
        <div style="flex:1;background:#EEF1F4;height:16px;border-radius:8px;overflow:hidden">
          <div style="background:${typeColors[type] || '#9CA3AF'};height:100%;width:${pct}%;border-radius:8px"></div>
        </div>
        <span style="width:60px;font-weight:600;text-align:right">${val.toFixed(2)}</span>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🌍 온실가스 관리'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { id: 'ghgAssSelect', style: 'padding:6px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px', onChange: () => { _ghgAssId = parseInt(document.getElementById('ghgAssSelect').value); renderGHG() } },
            ...assessments.map(a => el('option', { value: a.id, selected: a.id === _ghgAssId }, a.title))
          ),
          el('button', { className: 'btn btn-primary', onClick: openAddGHG }, '+ 활동자료 입력')
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px' }, '총 배출량'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#1F2937;margin-top:4px' }, totalEmissions.toFixed(1)),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, 'tCO2eq')
        ),
        el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px' }, '활동자료'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#1F2937;margin-top:4px' }, activities.length),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '건 등록')
        ),
        el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px' }, '에너지 유형'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#1F2937;margin-top:4px' }, typeEntries.length),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '종류 사용')
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, 'Scope별 배출량'),
          el('div', { innerHTML: barsHtml || '<div style="color:#9CA3AF;font-size:12px;text-align:center;padding:20px">데이터 없음 — 활동자료를 등록하세요</div>' })
        ),
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '에너지 유형별 배출량'),
          el('div', { innerHTML: typeBars || '<div style="color:#9CA3AF;font-size:12px;text-align:center;padding:20px">데이터 없음</div>' })
        )
      ),
      el('div', { className: 'card', style: 'margin:0 20px 20px' },
        activities.length ? sortableTable('ghg', [
          { label: '유형', value: a => (ENERGY_LABELS[a.energy_type] || a.energy_type) },
          { label: 'Scope', value: a => el('span', { style: `background:${scopeColors[a.scope + (a.scope2_method ? '_'+a.scope2_method : '')] || '#9CA3AF'}20;color:${scopeColors[a.scope + (a.scope2_method ? '_'+a.scope2_method : '')] || '#9CA3AF'};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600` }, `Scope ${a.scope}${a.scope2_method ? ' (' + (a.scope2_method === 'location-based' ? '위치' : '시장') + ')' : ''}`) },
          { label: '값', value: a => `${a.value} ${a.unit}` },
          { label: 'tCO2eq', value: a => el('span', { style: 'font-weight:600' }, a.co2eq ? a.co2eq.toFixed(4) : '-') },
          { label: '계수', value: a => { const f = GHG.getFactor(a.energy_type, a.scope, a.scope2_method); return f ? `${f.factor} ${f.unit}` : '-' } }
        ], activities, {
          bulkDelete: id => { Store.deleteGHGActivity(id); showToast('활동자료가 삭제되었습니다.', 'success') },
          actions: a => [
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteGHGActivity(a.id); showToast('활동자료가 삭제되었습니다.', 'success'); renderGHG() } }, '삭제')
          ]
        }) : el('div', { style: 'text-align:center;padding:30px;color:#9CA3AF' },
          el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '📊'),
          el('p', { style: { margin: '0 0 8px' } }, '등록된 활동자료가 없습니다'),
          el('p', { style: { margin: '0', fontSize: '12px', color: '#9CA3AF' } }, '+ 버튼을 클릭하여 온실가스 배출 활동을 등록하세요')
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
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0;flex-wrap:wrap;gap:8px' },
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
    const gradeColors = { A: '#047857', B: '#2563EB', C: '#d97706', D: '#dc2626' }

    container.append(
      el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center' },
          el('div', { style: 'font-size:11px;color:#9CA3AF;text-transform:uppercase' }, '총 협력사'),
          el('div', { style: 'font-size:28px;font-weight:700;margin-top:4px' }, summary.total),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, `진단완료 ${summary.graded}건`)
        ),
        ...Supplier.RISK_GRADES.map(g => {
          const pct = summary.total ? Math.round((summary.riskCounts[g.grade] || 0) / summary.total * 100) : 0
          return el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center;border-top:3px solid ' + g.color },
            el('div', { style: 'font-size:11px;color:#9CA3AF' }, `${g.grade}등급 · ${g.label}`),
            el('div', { style: `font-size:28px;font-weight:700;color:${g.color};margin-top:4px` }, summary.riskCounts[g.grade] || 0),
            el('div', { style: 'font-size:11px;color:#9CA3AF' }, `${pct}%`)
          )
        }),
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);text-align:center;border-top:3px solid #D0D5DD' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '미진단'),
          el('div', { style: 'font-size:28px;font-weight:700;color:#9CA3AF;margin-top:4px' }, summary.riskCounts.unscored || 0)
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
            if (!s.last_vsme_grade) return el('span', { style: 'background:#F8FAFC;color:#9CA3AF;padding:2px 10px;border-radius:10px;font-size:11px' }, '미진단')
            const g = Supplier.getGrade(s.last_vsme_score)
            return el('span', { style: `background:${g.color}15;color:${g.color};padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;border:1px solid ${g.color}30` }, `${s.last_vsme_grade}등급 · ${s.last_vsme_score}점`)
          }, align: 'center' },
          { label: '최근 진단', key: 'last_vsme_date', value: s => s.last_vsme_date ? el('span', { style: 'font-size:12px;color:#9ca3af' }, new Date(s.last_vsme_date).toLocaleDateString('ko-KR')) : el('span', { style: 'color:#D0D5DD' }, '-') }
        ], suppliers, {
          bulkDelete: id => { Supplier.delete(id); showToast('협력사가 삭제되었습니다.', 'success') },
          actions: s => [
            el('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 4 }, onClick: () => openVSMEForSupplier(s.id) }, '자가진단'),
            el('button', { className: 'btn btn-sm btn-secondary', style: { marginRight: 4 }, onClick: () => editSupplier(s.id) }, '수정'),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm('정말 삭제?')) { Supplier.delete(s.id); showToast('협력사가 삭제되었습니다.', 'success'); renderSupplier() } } }, '삭제')
          ]
        }) : el('div', { style: 'text-align:center;padding:30px;color:#9CA3AF' },
          el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '🏢'),
          el('p', { style: { margin: '0 0 8px' } }, '등록된 협력사가 없습니다'),
          el('p', { style: { margin: '0', fontSize: '12px', color: '#9CA3AF' } }, '+ 버튼으로 협력사를 추가하세요')
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
            <span style="font-size:12px;font-weight:500;color:#6B7280">${g.label}</span>
            <span style="font-size:11px;color:#9CA3AF">${cnt}개사 (${pct}%)</span>
          </div>
          <div style="background:#EEF1F4;height:10px;border-radius:5px;overflow:hidden">
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
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid #F8FAFC">
        <div style="width:36px;height:36px;border-radius:8px;background:${grade ? grade.color + '15' : '#F8FAFC'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${grade ? grade.color : '#D0D5DD'};font-size:14px;border:1px solid ${grade ? grade.color + '30' : '#eef1f4'}">
          ${grade ? grade.grade : '-'}
        </div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500;color:#1F2937">${s.name}</div>
          <div style="font-size:11px;color:#9CA3AF">${s.industry || '미분류'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:600;color:${grade ? grade.color : '#D0D5DD'}">${s.last_vsme_score || '-'}점</div>
          <div style="font-size:10px;color:#9CA3AF">${s.last_vsme_date ? new Date(s.last_vsme_date).toLocaleDateString('ko-KR') : '미진단'}</div>
        </div>
      </div>`
    }).join('')

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📊 협력사 등급 분석')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '총 협력사'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, summary.total)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '평균 점수'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#1E3A5F;margin-top:2px' }, avgScore)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '진단 완료'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#047857;margin-top:2px' }, summary.graded)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04)' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '미진단'),
          el('div', { style: `font-size:22px;font-weight:700;color:${unscoredPct > 20 ? '#dc2626' : '#d97706'};margin-top:2px` }, summary.riskCounts.unscored || 0),
          el('div', { style: 'font-size:10px;color:#9CA3AF' }, `${unscoredPct}%`)
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '등급별 분포'),
          el('div', { innerHTML: gradeBar || '<div style="color:#9CA3AF;font-size:12px;text-align:center;padding:20px">데이터 없음</div>' })
        ),
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '협력사 순위'),
          el('div', { innerHTML: supplierCards || '<div style="color:#9CA3AF;font-size:12px;text-align:center;padding:20px">등록된 협력사 없음</div>' })
        )
      )
    )
    return container
  }

  function levelMeta(level) {
    return {
      high: { label: '고위험', color: '#dc2626' },
      medium: { label: '중위험', color: '#d97706' },
      low: { label: '저위험', color: '#059669' },
      pending: { label: '미진단', color: '#9CA3AF' }
    }[level] || { label: '미진단', color: '#9CA3AF' }
  }

  function scoreColor(score) {
    if (score == null) return '#9CA3AF'
    if (score >= 80) return '#059669'
    if (score >= 50) return '#d97706'
    return '#dc2626'
  }

  function renderSupplierRiskPanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})
    const agg = SupplierRisk.getAggregateScores()
    const counts = { high: 0, medium: 0, low: 0, pending: 0 }
    suppliers.forEach(s => { counts[SupplierRisk.getSupplierRiskLevel(s.id)]++ })

    const catDefs = [
      { axis: 'E', label: '환경 리스크', icon: '🌿', desc: '폐기물·배출·인증 관련' },
      { axis: 'S', label: '사회 리스크', icon: '👥', desc: '인권·안전·근로 관련' },
      { axis: 'G', label: '지배구조 리스크', icon: '🏛', desc: '윤리·컴플라이언스 관련' },
      { axis: 'overall', label: '종합 리스크', icon: '⚠', desc: 'E·S·G 가중 평균' }
    ]

    const riskCards = catDefs.map(cat => {
      const score = agg[cat.axis]
      const has = score != null
      const level = !has ? '미진단' : score >= 80 ? '낮음' : score >= 50 ? '보통' : '높음'
      const levelColor = scoreColor(score)
      return el('div', { style: 'background:#fff;border:1px solid #EEF1F4;border-radius:10px;padding:16px' },
        el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:12px' },
          el('span', { style: 'font-size:24px' }, cat.icon),
          el('div', {},
            el('div', { style: 'font-size:13px;font-weight:600;color:#1F2937' }, cat.label),
            el('div', { style: 'font-size:11px;color:#9CA3AF' }, cat.desc)
          )
        ),
        el('div', { style: 'display:flex;align-items:center;gap:12px' },
          el('div', { style: `width:48px;height:48px;border-radius:10px;background:${levelColor}15;display:flex;align-items:center;justify-content:center` },
            el('span', { style: `font-size:18px;font-weight:700;color:${levelColor}` }, has ? score : '-')
          ),
          el('div', { style: 'flex:1' },
            el('div', { style: `font-size:12px;font-weight:600;color:${levelColor}` }, level),
            el('div', { style: 'background:#EEF1F4;height:6px;border-radius:3px;overflow:hidden;margin-top:4px' },
              el('div', { style: `background:${levelColor};height:100%;width:${has ? score : 0}%;border-radius:3px` })
            )
          )
        )
      )
    })

    const rows = suppliers.map(s => {
      const sc = SupplierRisk.getSupplierScores(s.id)
      const level = SupplierRisk.getSupplierRiskLevel(s.id)
      const lm = levelMeta(level)
      return el('tr', {},
        el('td', { style: 'font-weight:600' }, s.name),
        el('td', { style: 'text-align:center;color:' + scoreColor(sc?.E) }, sc ? sc.E : '-'),
        el('td', { style: 'text-align:center;color:' + scoreColor(sc?.S) }, sc ? sc.S : '-'),
        el('td', { style: 'text-align:center;color:' + scoreColor(sc?.G) }, sc ? sc.G : '-'),
        el('td', { style: 'text-align:center;font-weight:700;color:' + scoreColor(sc?.overall) }, sc ? sc.overall : '-'),
        el('td', { style: 'text-align:center' }, el('span', { style: `background:${lm.color}15;color:${lm.color};padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;border:1px solid ${lm.color}30` }, lm.label)),
        el('td', {}, el('button', { className: 'btn btn-sm btn-primary', onClick: () => openSupplierRiskModal(s.id) }, sc ? '재진단' : '진단'))
      )
    })

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '⚠ ESG 리스크 진단'),
        el('span', { style: 'font-size:12px;color:#9ca3af' }, `진단 완료 ${agg.assessed}/${agg.total}개사`)
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '고위험'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#dc2626;margin-top:2px' }, counts.high)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '중위험'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#d97706;margin-top:2px' }, counts.medium)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '저위험'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#059669;margin-top:2px' }, counts.low)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '미진단'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#9CA3AF;margin-top:2px' }, counts.pending)
        )
      ),
      el('div', { style: 'padding:20px' },
        el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px' }, ...riskCards)
      ),
      el('div', { className: 'card', style: 'margin-top:0' },
        el('div', { className: 'card-header' }, el('h3', {}, '협력사별 리스크 점수')),
        suppliers.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {},
            el('th', {}, '회사명'), el('th', { style: 'text-align:center' }, '환경(E)'), el('th', { style: 'text-align:center' }, '사회(S)'), el('th', { style: 'text-align:center' }, '지배구조(G)'), el('th', { style: 'text-align:center' }, '종합'), el('th', { style: 'text-align:center' }, '등급'), el('th', {}, '관리')
          )),
          el('tbody', {}, ...rows)
        ) : el('div', { style: 'text-align:center;padding:24px;color:#D0D5DD;font-size:12px' }, '등록된 협력사가 없습니다')
      )
    )
    return container
  }

  function openSupplierRiskModal(supplierId) {
    const supplier = Supplier.getAll().find(s => s.id === supplierId)
    if (!supplier) return
    const existing = Store.getSupplierRiskItems(supplierId)
    const getAns = qid => (existing.find(i => i.question_id === qid)?.answer) ?? ''
    const selectEls = {}
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const axisLabels = { E: '🌿 환경', S: '👥 사회', G: '🏛 지배구조' }
    ;['E', 'S', 'G'].forEach(axis => {
      form.append(el('div', { style: 'font-size:12px;font-weight:700;color:#1E3A5F;margin:12px 0 4px' }, axisLabels[axis]))
      SupplierRisk.ESG_QUESTIONS[axis].forEach(q => {
        const sel = el('select', { style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px' },
          el('option', { value: '' }, '미응답'),
          el('option', { value: 'yes' }, '예'),
          el('option', { value: 'partial' }, '부분'),
          el('option', { value: 'no' }, '아니오')
        )
        sel.value = getAns(q.id)
        selectEls[q.id] = sel
        form.append(el('label', { style: 'display:block;font-size:12px;margin-bottom:8px' },
          el('span', { style: 'display:block;margin-bottom:3px;color:#6B7280' }, `${q.question} (가중치 ${q.weight})`), sel))
      })
    })
    const preview = el('div', { style: 'margin-top:12px;padding:10px 12px;background:#F8FAFC;border-radius:8px;font-size:12px;color:#6B7280' }, '응답을 선택하면 점수가 미리 계산됩니다.')
    const collect = () => { const a = {}; Object.entries(selectEls).forEach(([qid, sel]) => { if (sel.value) answers[qid] = sel.value }); return a }
    const updatePreview = () => {
      const answers = {}
      Object.entries(selectEls).forEach(([qid, sel]) => { if (sel.value) answers[qid] = sel.value })
      const sc = SupplierRisk.scoreAnswers(answers)
      preview.textContent = sc.overall == null
        ? '응답을 선택하면 점수가 미리 계산됩니다.'
        : `환경 ${sc.E ?? '-'} · 사회 ${sc.S ?? '-'} · 지배구조 ${sc.G ?? '-'} → 종합 ${sc.overall}점 (${SupplierRisk.getScoreLabel(sc.overall)})`
    }
    Object.values(selectEls).forEach(sel => sel.addEventListener('change', updatePreview))
    updatePreview()
    form.append(preview)
    modal(`ESG 리스크 진단 — ${supplier.name}`, form)
    document.getElementById('modal-save').onclick = () => {
      const answers = {}
      Object.entries(selectEls).forEach(([qid, sel]) => { if (sel.value) answers[qid] = sel.value })
      SupplierRisk.saveAssessment(supplierId, answers)
      showToast('리스크 진단이 저장되었습니다.', 'success')
      closeModal()
      renderSupplier()
    }
  }

  function renderSupplyChainPanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})

    const tierData = [
      { tier: '1차 공급업체', count: suppliers.length, color: '#2563EB' },
      { tier: '2차 공급업체', count: Math.floor(suppliers.length * 1.8), color: '#2563EB' },
      { tier: '3차 공급업체', count: Math.floor(suppliers.length * 3.2), color: '#d97706' }
    ]

    const industryMap = {}
    suppliers.forEach(s => { const ind = s.industry || '미분류'; industryMap[ind] = (industryMap[ind] || 0) + 1 })
    const industryBars = Object.entries(industryMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    const maxInd = Math.max(...industryBars.map(x => x[1]), 1)

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🔗 공급망 관리')
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:20px;border:1px solid #EEF1F4' },
          el('h4', { style: 'margin:0 0 16px;font-size:14px;color:#1F2937' }, '공급망 구조'),
          ...tierData.map((t, i) => el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px' },
            el('div', { style: `width:32px;height:32px;border-radius:8px;background:${t.color}15;display:flex;align-items:center;justify-content:center;font-weight:700;color:${t.color};font-size:13px` }, `T${i + 1}`),
            el('div', { style: 'flex:1' },
              el('div', { style: 'font-size:13px;font-weight:500;color:#1F2937' }, t.tier),
              el('div', { style: 'background:#EEF1F4;height:6px;border-radius:3px;overflow:hidden;margin-top:4px' },
                el('div', { style: `background:${t.color};height:100%;width:${Math.round(t.count / tierData[2].count * 100)}%;border-radius:3px` })
              )
            ),
            el('span', { style: 'font-size:14px;font-weight:700' }, `${t.count}개사`)
          ))
        ),
        el('div', { style: 'background:#fff;border-radius:10px;padding:20px;border:1px solid #EEF1F4' },
          el('h4', { style: 'margin:0 0 16px;font-size:14px;color:#1F2937' }, '업종별 분포'),
          industryBars.length ? industryBars.map(([name, count]) => el('div', { style: 'margin:8px 0' },
            el('div', { style: 'display:flex;justify-content:space-between;margin-bottom:3px' },
              el('span', { style: 'font-size:12px;color:#6B7280' }, name),
              el('span', { style: 'font-size:11px;color:#9CA3AF' }, `${count}개사`)
            ),
            el('div', { style: 'background:#F8FAFC;height:6px;border-radius:3px;overflow:hidden' },
              el('div', { style: `background:#2563EB;height:100%;width:${Math.round(count / maxInd * 100)}%;border-radius:3px` })
            )
          )) : el('div', { style: 'text-align:center;padding:20px;color:#D0D5DD;font-size:12px' }, '데이터 없음')
        )
      ),
      el('div', { style: 'padding:0 20px 20px' },
        el('div', { style: 'background:#F8FAFC;border-radius:10px;padding:16px;border:1px solid #EEF4FA' },
          el('h4', { style: 'margin:0 0 8px;font-size:13px;color:#1E3A5F' }, '💡 공급망 리스크 관리 팁'),
          el('div', { style: 'font-size:12px;color:#6b7280;line-height:1.8' },
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
      { label: '문서 심사', icon: '📄', count: Math.floor(suppliers.length * 0.7), color: '#2563EB' },
      { label: '현장 심사', icon: '🏭', count: Math.floor(suppliers.length * 0.3), color: '#059669' },
      { label: '모니터링', icon: '📊', count: Math.floor(suppliers.length * 0.5), color: '#d97706' }
    ]

    const recentAudits = suppliers.slice(0, 8).map(s => {
      const grade = s.last_vsme_grade ? Supplier.getGrade(s.last_vsme_score) : null
      return el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #F8FAFC' },
        el('div', { style: `width:36px;height:36px;border-radius:8px;background:${grade ? grade.color + '15' : '#F8FAFC'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${grade ? grade.color : '#D0D5DD'};font-size:13px` }, grade ? grade.grade : '-'),
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-size:13px;font-weight:500' }, s.name),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, s.industry || '미분류')
        ),
        el('div', { style: 'text-align:right' },
          el('div', { style: 'font-size:11px;color:#9ca3af' }, s.last_vsme_date ? new Date(s.last_vsme_date).toLocaleDateString('ko-KR') : '미실시'),
          el('div', { style: `font-size:11px;font-weight:500;color:${grade ? grade.color : '#D0D5DD'}` }, s.last_vsme_score ? `${s.last_vsme_score}점` : '-')
        )
      )
    })

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📋 감사 이력')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        ...auditTypes.map(t => el('div', { style: 'text-align:center;padding:16px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:24px;margin-bottom:4px' }, t.icon),
          el('div', { style: 'font-size:12px;color:#9ca3af' }, t.label),
          el('div', { style: `font-size:22px;font-weight:700;color:${t.color};margin-top:2px` }, t.count)
        ))
      ),
      el('div', { style: 'padding:20px' },
        el('h4', { style: 'margin:0 0 12px;font-size:14px;color:#1F2937' }, '최근 감사 이력'),
        recentAudits.length ? recentAudits : el('div', { style: 'text-align:center;padding:20px;color:#D0D5DD;font-size:12px' }, '감사 이력 없음')
      )
    )
    return container
  }

  function renderSupplierImprovePanel() {
    const suppliers = Supplier.getAll()
    const container = el('div', {})
    const highRisk = suppliers.filter(s => s.last_vsme_grade === 'C' || s.last_vsme_grade === 'D')

    const plans = [
      { title: '협력사 교육 프로그램', status: '계획', date: '2026-Q3', priority: '높음', color: '#dc2626' },
      { title: '공급망 실사 강화', status: '진행중', date: '2026-Q2~Q3', priority: '높음', color: '#d97706' },
      { title: 'ESG 역량 강화 워크숍', status: '계획', date: '2026-Q4', priority: '보통', color: '#2563EB' },
      { title: '리스크 모니터링 시스템 고도화', status: '완료', date: '2026-Q1', priority: '높음', color: '#059669' }
    ]
    const statusColors = { '계획': '#2563EB', '진행중': '#d97706', '완료': '#059669' }

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📈 개선 계획')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:16px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '고위험 협력사'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#dc2626;margin-top:2px' }, highRisk.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '개선계획 수립'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#2563EB;margin-top:2px' }, plans.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '완료율'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#059669;margin-top:2px' }, `${Math.round(plans.filter(p => p.status === '완료').length / plans.length * 100)}%`)
        )
      ),
      el('div', { style: 'padding:20px' },
        el('h4', { style: 'margin:0 0 12px;font-size:14px;color:#1F2937' }, '개선 계획 목록'),
        ...plans.map(p => el('div', { style: 'display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fff;border:1px solid #EEF1F4;border-radius:8px;margin-bottom:8px' },
          el('div', { style: `width:4px;height:36px;border-radius:2px;background:${p.color};flex-shrink:0` }),
          el('div', { style: 'flex:1' },
            el('div', { style: 'font-size:13px;font-weight:600;color:#1F2937' }, p.title),
            el('div', { style: 'font-size:11px;color:#9CA3AF;margin-top:2px' }, `${p.date} · 우선순위: ${p.priority}`)
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
      return el('div', { style: `display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;background:${grade ? grade.color + '08' : '#F8FAFC'};border:1px solid ${grade ? grade.color + '20' : '#EEF1F4'};margin-bottom:8px` },
        el('div', { style: `width:44px;height:44px;border-radius:10px;background:${grade ? grade.color + '15' : '#EEF1F4'};display:flex;align-items:center;justify-content:center;font-weight:700;color:${grade ? grade.color : '#D0D5DD'};font-size:16px;border:1px solid ${grade ? grade.color + '30' : '#eef1f4'}` },
          grade ? grade.grade : '-'
        ),
        el('div', { style: 'flex:1' },
          el('div', { style: 'font-weight:600;font-size:14px' }, s.name),
          el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:2px' },
            latest ? `${latest.mode === 'basic' ? '기본' : '종합'} · ${latest.score}점 · ${new Date(latest.assessed_at).toLocaleDateString('ko-KR')}` : '미진단'
          ),
          latest ? el('div', { style: 'margin-top:4px;background:#E4E7EB;height:6px;border-radius:3px;overflow:hidden;width:120px' },
            el('div', { style: `background:${grade ? grade.color : '#D0D5DD'};height:100%;width:${completionPct}%` })
          ) : null
        ),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => openVSMEForSupplier(s.id) }, '자가진단'),
          latest ? el('button', { className: 'btn btn-sm btn-secondary', onClick: () => showVSMEHistory(s.id) }, '이력') : null
        )
      )
    })

    container.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📝 VSME 자가진단')
      ),
      el('div', { style: 'padding:16px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4;display:flex;gap:16px' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);min-width:100px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '대상 협력사'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, suppliers.length)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.04);min-width:100px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '진행률'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#1E3A5F;margin-top:2px' }, `${avgPct}%`)
        ),
        el('div', { style: 'flex:1;display:flex;align-items:center' },
          el('div', { style: 'flex:1;background:#E4E7EB;height:10px;border-radius:5px;overflow:hidden' },
            el('div', { style: `background:#1E3A5F;height:100%;width:${avgPct}%` })
          )
        )
      ),
      el('div', { style: 'padding:16px 20px' },
        suppliers.length ? supplierCards : el('div', { style: 'text-align:center;padding:30px;color:#9CA3AF' },
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
    const mode = el('select', { style: 'width:100%;padding:8px;border:1px solid #e4e7eb;border-radius:6px;margin-bottom:12px' },
      el('option', { value: 'basic' }, '기본 모드 (12항목)'),
      el('option', { value: 'comprehensive' }, '종합 모드 (14항목)')
    )
    const questionContainer = el('div', {})
    function renderQuestions() {
      const checklist = Supplier.getVSMEChecklist(mode.value)
      questionContainer.innerHTML = ''
      checklist.forEach(q => {
        const row = el('div', { style: 'padding:8px 0;border-bottom:1px solid #EEF1F4' },
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
      body.append(el('p', { style: 'color:#9CA3AF;text-align:center' }, '진단 이력이 없습니다.'))
    } else {
      assessments.forEach(a => {
        const grade = Supplier.getGrade(a.score)
        body.append(el('div', { style: 'padding:10px;border-bottom:1px solid #EEF1F4;display:flex;justify-content:space-between;align-items:center' },
          el('div', {},
            el('div', { style: 'font-weight:500' }, `${a.mode === 'basic' ? '기본' : '종합'} 모드`),
            el('div', { style: 'font-size:12px;color:#9ca3af' }, new Date(a.assessed_at).toLocaleString('ko-KR'))
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
      c.append(el('div', { className: 'card empty-state' },
        el('div', { className: 'empty-ico' }, '🤖'),
        el('h3', {}, 'AI 보고서 초안 작성'),
        el('p', {}, 'AI 초안 생성을 위해 먼저 평가를 완료하세요.'),
        el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
      ))
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

    const dotClass = draft => !draft ? 'dot-muted' : draft.human_status === 'approved' ? 'dot-ok' : draft.ver_status === 'fail' || draft.human_status === 'rejected' ? 'dot-danger' : draft.ver_status === 'pass' ? 'dot-info' : 'dot-warn'

    c.append(
      el('div', { className: 'card', style: 'overflow:hidden' },
        el('div', { className: 'ai-toolbar' },
          el('h3', {}, '🤖 AI 보고서 초안'),
          el('select', { className: 'select-sm', onChange: e => { _aiAssId = parseInt(e.target.value); renderAI() } },
            ...assessments.map(a => el('option', { value: a.id, selected: a.id === _aiAssId }, a.title))
          )
        ),
        el('div', { className: 'stat-grid' },
          stat('전체 지표', total, ''),
          stat('생성 완료', generated, 'is-info'),
          stat('검증 통과', verified, 'is-warn'),
          stat('승인 완료', approved, 'is-ok')
        ),
        el('div', { className: 'progress-wrap' },
          el('div', { className: 'progress-row' },
            el('div', { className: 'progress-track' }, el('div', { className: 'progress-fill', style: `width:${pct}%` })),
            el('span', { className: 'progress-pct' }, `${pct}%`)
          ),
          el('div', { className: 'chip-row' },
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
            el('span', { className: 'chip chip-muted' }, `미생성 ${total - generated}건`)
          )
        ),
        pending > 0 || rejected > 0 ? el('div', { style: 'padding:14px 20px;border-top:1px solid var(--c-border-soft);background:linear-gradient(135deg,#fef3c7 0%,#fff7ed 100%)' },
          el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:10px' }, '📋 승인 워크플로우'),
          el('div', { className: 'ai-flow' },
            flowItem('dot-warn', '검토 대기', pending),
            el('span', { className: 'arrow' }, '→'),
            flowItem('dot-info', '검증 통과', verified),
            el('span', { className: 'arrow' }, '→'),
            flowItem('dot-ok', '승인 완료', approved),
            rejected > 0 ? flowItem('dot-danger', '반려', rejected, true) : null
          ),
          pending > 0 ? el('div', { style: 'margin-top:10px' },
            el('button', { className: 'btn btn-sm btn-primary', onClick: () => {
              drafts.filter(d => d.human_status === 'pending').forEach(d => { AI.approveDraft(d.id, currentUser?.name || 'admin') })
              showToast(`${pending}건의 초안이 승인되었습니다.`, 'success')
              renderAI()
            }}, '✅ 일괄 승인')
          ) : null
        ) : null
      ),
      el('div', { className: 'card', style: 'overflow:hidden' },
        el('div', { className: 'ai-layout' },
          el('div', { className: 'ai-list', id: 'aiList' },
            ...groups.map(g => {
              const gInds = indicators.filter(i => i.group_id === g.id)
              return el('div', {},
                el('div', { className: 'ai-group-header' }, g.group_name),
                ...gInds.map(ind => {
                  const draft = drafts.find(d => d.indicator_id === ind.id)
                  const statusLabel = draft ? AI.getDraftStatus(draft) : '미생성'
                  const item = el('div', { className: 'ai-item', 'data-ind': ind.id, onClick: () => selectAIIndicator(ind.id) },
                    el('span', { className: 'status-dot ' + dotClass(draft) }),
                    el('div', { className: 'ai-item-body' },
                      el('div', { className: 'ai-item-title' }, Indicator.getNameAndCode(ind)),
                      el('div', { className: 'ai-item-status' }, statusLabel)
                    )
                  )
                  return item
                })
              )
            })
          ),
          el('div', { className: 'ai-detail', id: 'aiDetail' },
            el('div', { className: 'empty-state', style: 'padding:60px 20px' },
              el('div', { className: 'empty-ico' }, '👈'),
              el('div', { style: 'font-size:13px' }, '왼쪽에서 지표를 선택하세요'),
              el('div', { style: 'font-size:11.5px;color:var(--c-text-faint);margin-top:4px' }, 'AI가 증빙 데이터를 기반으로 보고서 초안을 생성합니다')
            )
          )
        )
      )
    )
  }

  function stat(label, value, cls) {
    return el('div', { className: 'stat' },
      el('div', { className: 'stat-label' }, label),
      el('div', { className: 'stat-value ' + (cls || '') }, value)
    )
  }

  function flowItem(dotCls, label, count, danger) {
    return el('div', { className: 'chip' },
      el('span', { className: 'status-dot ' + dotCls }),
      el('span', { style: danger ? 'color:var(--c-danger)' : '' }, label + ' ' + count + '건')
    )
  }

  function selectAIIndicator(id) {
    document.querySelectorAll('#aiList .ai-item').forEach(n => n.classList.toggle('active', String(n.getAttribute('data-ind')) === String(id)))
    showAIDetail(id)
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
    const verChip = !latest ? null : latest.ver_status === 'pass' ? 'chip-ok' : latest.ver_status === 'fail' ? 'chip-danger' : 'chip-warn'
    const verText = !latest ? '' : latest.ver_status === 'pass' ? '✅ 검증 PASS' : latest.ver_status === 'fail' ? '❌ 검증 FAIL' : latest.ver_status === 'revision_needed' ? '⚠️ 수정 필요' : '⏳ 검증 대기'
    const humanChip = !latest ? null : latest.human_status === 'approved' ? 'chip-ok' : (latest.human_status === 'rejected' || latest.human_status === 'blocked') ? 'chip-danger' : 'chip-warn'
    const humanText = !latest ? '' : latest.human_status === 'approved' ? '✅ 승인' : latest.human_status === 'rejected' ? '❌ 반려' : latest.human_status === 'blocked' ? '🚫 차단됨' : latest.human_status === 'escalated' ? '🚨 에스컬레이션' : '⏳ 검토 대기'

    right.append(
      el('div', { className: 'ai-detail-head' },
        el('div', {},
          el('h4', {}, Indicator.getNameAndCode(indicator)),
          el('div', { className: 'ai-detail-sub' }, `${Indicator.getPillarName(indicator.pillar)} · 증빙 ${evidences.length}건`)
        ),
        el('div', { className: 'chip-row' },
          latest ? el('span', { className: 'chip ' + verChip }, verText) : null,
          latest ? el('span', { className: 'chip ' + humanChip }, humanText) : null,
          latest?.confidence ? el('span', { className: 'chip chip-muted' }, `신뢰도 ${latest.confidence}`) : null
        )
      ),
      latest?.pillar_coverage ? el('div', { className: 'chip-row', style: 'margin-bottom:8px' },
        el('span', { style: 'font-size:11px;color:var(--c-text-faint)' }, '필러 커버리지:'),
        el('span', { className: 'chip ' + (latest.pillar_coverage.policy ? 'chip-ok' : 'chip-muted') }, 'Policy'),
        el('span', { className: 'chip ' + (latest.pillar_coverage.action ? 'chip-ok' : 'chip-muted') }, 'Action'),
        el('span', { className: 'chip ' + (latest.pillar_coverage.result ? 'chip-ok' : 'chip-muted') }, 'Result'),
        latest.missing_pillars?.length ? el('span', { className: 'chip chip-danger' }, `누락: ${latest.missing_pillars.join(', ')}`) : null
      ) : null,
      latest ? el('div', { className: 'ai-section-label' }, 'AI 초안') : null,
      latest ? el('div', { className: 'ai-draft' }, latest.draft_text) : el('div', { className: 'empty-state', style: 'padding:32px 16px' },
        el('div', { className: 'empty-ico' }, '📝'),
        el('div', { style: 'font-size:12.5px' }, '아직 생성된 초안이 없습니다. 아래 버튼으로 AI 초안을 생성하세요.')
      ),
      claims.length ? el('div', { className: 'claims' },
        el('div', { className: 'claims-head' }, `🔍 검증 결과 (${claims.length}개 주장)`),
        ...claims.map(c => {
          const cls = { SUPPORTED: 'chip-ok', PARTIALLY_SUPPORTED: 'chip-warn', UNSUPPORTED: 'chip-danger', MISMATCH: 'chip-danger' }
          const icons = { SUPPORTED: '✅', PARTIALLY_SUPPORTED: '⚠️', UNSUPPORTED: '❌', MISMATCH: '🔴' }
          return el('div', { className: 'claim' },
            el('span', {}, icons[c.status] || '❓'),
            el('div', { className: 'claim-body' },
              el('div', { className: 'claim-text' }, c.claim_text),
              el('div', { className: 'claim-status' }, el('span', { className: 'chip ' + (cls[c.status] || 'chip-muted') }, `${c.status}${c.matched_evidence_id ? ' → ' + c.matched_evidence_id : ''}`)),
              c.reason ? el('div', { className: 'claim-reason' }, c.reason) : null
            )
          )
        }),
        verResult?.revision_notes ? el('div', { className: 'claims-note' }, el('strong', {}, '수정 노트: '), verResult.revision_notes) : null
      ) : null,
      el('div', { className: 'ai-actions' },
        el('button', { className: 'btn btn-sm btn-primary', onClick: async (e) => {
          const btn = e.target; btn.disabled = true; btn.textContent = '생성 중...'
          const r = await AI.generateReport(_aiAssId, indicatorId, currentUser?.role)
          showAIDetail(indicatorId)
          if (r.error) showToast(r.error, 'error')
        }}, 'AI 초안 생성'),
        latest && latest.ver_status === 'pass' && latest.human_status === 'pending' && latest.cited_evidence_ids?.length > 0 ? el('button', { className: 'btn btn-sm btn-success', onClick: () => { const r = AI.approveDraft(latest.id, 'current_user'); if (r.error) { showToast(r.error, 'error'); return; } showAIDetail(indicatorId); showToast('승인되었습니다.', 'success') }}, '✅ 승인') : null,
        latest && latest.human_status === 'pending' ? el('button', { className: 'btn btn-sm btn-danger', onClick: () => { const r = AI.rejectDraft(latest.id, 'current_user', '검토 필요'); if (r.error) { showToast(r.error, 'error'); return; } showAIDetail(indicatorId); showToast('반려되었습니다.', 'info') }}, '반려') : null,
        latest && latest.human_status === 'pending' ? el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { const fb = prompt('수정 요청 사항:'); if (fb) { AI.requestRevision(latest.id, 'current_user', fb); showAIDetail(indicatorId); showToast('수정이 요청되었습니다.', 'info') } }}, '수정 요청') : null,
        latest && latest.ver_status === 'pass' && latest.human_status === 'pending' && (!latest.cited_evidence_ids || latest.cited_evidence_ids.length === 0) ? el('span', { className: 'ai-note chip-danger' }, '⚠ 증빙 미연결 - 승인 불가') : null,
        latest && latest.ver_status === 'pass' && latest.human_status === 'pending' && (() => { const ind = Store.getIndicators().find(i => i.id === indicatorId); return ind && ind.scope2_split_required && Object.keys(GHG.getSummary(_aiAssId)).length === 0 })() ? el('span', { className: 'ai-note chip-danger' }, '⚠ GHG 미등록 - Scope2 분할 필요 지표 승인 불가') : null,
        latest && latest.human_status === 'blocked' ? el('span', { className: 'ai-note chip-danger' }, '🚫 검증 실패 - 증빙 연결 필요') : null,
        latest && latest.human_status === 'escalated' ? el('span', { className: 'ai-note chip-danger' }, '🚨 에스컬레이션 - 관리자 확인 필요') : null
      ),
      evidences.length ? el('div', { className: 'ai-section-label' }, '연결된 증빙') : null,
      evidences.length ? el('div', { className: 'chip-row' }, ...evidences.map(e => el('span', { className: 'chip chip-muted' }, e.title))) : null
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
        el('p', { style: 'margin:0 0 16px;color:#9ca3af;font-size:13px' }, 'GRI 분석을 위해 먼저 평가를 생성하세요.'),
        el('button', { className: 'btn btn-primary', onClick: () => navigate('assessment') }, '+ 평가 생성하러 가기')
      ))
      return
    }
    if (!_griAssId || !assessments.find(a => a.id === _griAssId)) _griAssId = assessments[0]?.id
    const selectedId = _griAssId
    const report = GRI.generateComplianceReport(selectedId)
    const rate = report.rate

    const catNames = { universal: '보편적', economic: '경제', environmental: '환경', social: '사회' }
    const catColors = { universal: '#1E3A5F', economic: '#d97706', environmental: '#047857', social: '#2563EB' }
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
          <span style="font-size:12px;font-weight:600;color:#6B7280">${catIcons[cat] || ''} ${catNames[cat] || cat}</span>
          <span style="font-size:11px;color:#9CA3AF">${s.total}개 항목</span>
        </div>
        <div style="background:#EEF1F4;height:20px;border-radius:10px;overflow:hidden;position:relative">
          <div style="background:#047857;height:100%;width:${cPct}%;position:absolute;border-radius:10px 0 0 10px"></div>
          <div style="background:#d97706;height:100%;width:${pPct - cPct}%;position:absolute;left:${cPct}%"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:#fff">${s.compliant}/${s.total}</div>
        </div>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📊 GRI Standards 준수 분석'),
        el('select', { style: 'padding:6px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px', onChange: e => { _griAssId = e.target.value; renderGRI() } },
          ...assessments.map(a => el('option', { value: a.id, selected: a.id === selectedId }, a.title))
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '완전준수'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#047857;margin-top:2px' }, rate.full_rate + '%'),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, `${rate.full_compliance}건`)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '부분준수 포함'),
          el('div', { style: 'font-size:22px;font-weight:700;color:#d97706;margin-top:2px' }, rate.with_ref_rate + '%'),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, `${rate.with_reference}건`)
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '필수 항목'),
          el('div', { style: 'font-size:22px;font-weight:700;margin-top:2px' }, rate.total_required),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '개 GRI 기준')
        ),
        el('div', { style: 'text-align:center;padding:12px;background:#fff;border-radius:8px' },
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '미준수'),
          el('div', { style: `font-size:22px;font-weight:700;color:${rate.non_compliant > 0 ? '#dc2626' : '#047857'};margin-top:2px` }, rate.non_compliant),
          el('div', { style: 'font-size:11px;color:#9CA3AF' }, '건 개선 필요')
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 2fr;gap:16px;padding:20px' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '카테고리별 준수 현황'),
          el('div', { innerHTML: catBars || '<div style="color:#9CA3AF;font-size:12px">데이터 없음</div>' }),
          el('div', { style: 'margin-top:12px;display:flex;gap:12px;font-size:11px;color:#9ca3af' },
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
        el('p', { style: 'margin:0 0 16px;color:#9ca3af;font-size:13px' }, '리스크 분석을 위해 먼저 평가를 생성하세요.'),
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
    const trendColors = { worsening: '#dc2626', improving: '#047857', stable: '#9CA3AF' }
    const levelBg = { critical: '#dc2626', high: '#d97706', medium: '#D97706', low: '#047857' }

    const catCards = cats.map(cat => {
      const bg = levelBg[cat.risk.level] || '#9CA3AF'
      return `<div style="background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid ${bg}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
          <div>
            <div style="font-size:20px;margin-bottom:4px">${cat.icon}</div>
            <div style="font-size:13px;font-weight:600;color:#1F2937">${cat.label}</div>
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
      const colors = { critical: '#dc2626', warning: '#d97706', info: '#2563EB' }
      const bg = colors[a.severity] || '#9CA3AF'
      return `<div style="padding:10px 14px;margin-bottom:6px;background:${bg}08;border-left:3px solid ${bg};border-radius:0 8px 8px 0;font-size:12px">
        ${a.icon} <span style="color:${bg};font-weight:600">[${a.category}]</span> ${a.message}
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '⚠️ 리스크 매트릭스'),
        el('select', { style: 'padding:6px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px', onChange: e => { _riskAssId = e.target.value; renderRisk() } },
          ...assessments.map(a => el('option', { value: a.id, selected: a.id === selectedId }, a.title))
        )
      ),
      el('div', { style: 'padding:20px;background:linear-gradient(135deg,#1E3A5F10,#1E3A5F10);border-bottom:1px solid #eef1f4' },
        el('div', { style: 'display:flex;align-items:center;gap:20px' },
          el('div', { style: 'position:relative;width:100px;height:100px;flex-shrink:0' },
            el('div', { style: `width:100px;height:100px;border-radius:50%;border:8px solid ${overall.color}20;display:flex;align-items:center;justify-content:center` },
              el('div', { style: `font-size:32px;font-weight:700;color:${overall.color}` }, overall.score)
            )
          ),
          el('div', {},
            el('div', { style: 'font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px' }, '종합 리스크'),
            el('div', { style: `font-size:20px;font-weight:700;color:${overall.color};margin-top:4px` }, overall.label),
            el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:4px' }, `${cats.length}개 카테고리 분석 · ${alerts.length}건 알림`)
          )
        )
      ),
      el('div', { style: 'padding:20px' },
        el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '카테고리별 리스크'),
        el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px', innerHTML: catCards }),
        alerts.length ? el('div', {},
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, `알림 (${alerts.length}건)`),
          el('div', { innerHTML: alertCards })
        ) : el('div', { style: 'text-align:center;padding:20px;color:#047857;font-size:13px' }, '알림이 없습니다')
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
        el('p', { style: 'margin:0 0 16px;color:#9ca3af;font-size:13px' }, '벤치마크 비교를 위해 먼저 평가를 생성하세요.'),
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
        <span style="width:80px;color:#6B7280;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ind.label}</span>
        <div style="flex:1;background:#EEF1F4;height:18px;border-radius:9px;overflow:hidden;position:relative">
          <div style="background:#1E3A5F;height:100%;width:${pct}%;border-radius:9px"></div>
          <span style="position:absolute;right:6px;top:1px;font-size:10px;font-weight:600;color:#fff">${ind.avg_score}</span>
        </div>
        <span style="width:30px;font-size:10px;color:#9CA3AF">${ind.sample_size}개사</span>
      </div>`
    }).join('')

    const companyLine = companyScore > 0 ? `<div style="position:absolute;left:${(companyScore / maxScore * 100)}%;top:0;bottom:0;width:2px;background:#dc2626;z-index:1">
      <span style="position:absolute;top:-16px;left:-20px;font-size:10px;color:#dc2626;font-weight:700">자사 ${companyScore}</span>
    </div>` : ''

    const alertRules = MONITORING.getAlertRules()
    const ruleItems = alertRules.map(r => `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:6px;font-size:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
      <span style="width:8px;height:8px;border-radius:50%;background:${r.enabled ? '#047857' : '#D0D5DD'}"></span>
      <span style="flex:1;color:#1F2937">${r.name}</span>
      <span style="color:#9CA3AF;font-size:11px">${r.description}</span>
    </div>`).join('')

    const comparisonCards = allComparison.sort((a, b) => b.avg - a.avg).slice(0, 6).map(c => {
      const diff = companyScore - c.avg
      const color = diff > 0 ? '#047857' : diff > -10 ? '#d97706' : '#dc2626'
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fff;border-radius:6px;font-size:12px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
        <span style="flex:1;color:#6B7280">${c.industry}</span>
        <span style="font-weight:600;color:#6b7280">${c.avg}</span>
        <span style="width:40px;text-align:right;font-weight:600;color:${color}">${diff > 0 ? '+' : ''}${diff}</span>
      </div>`
    }).join('')

    c.append(
      benchmarks.is_demo ? el('div', { style: 'display:flex;gap:8px;align-items:center;padding:10px 16px;margin-bottom:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#D97706' },
        el('span', { style: 'font-size:16px' }, '⚠'),
        el('span', {}, '현재 벤치마크는 데모 기준값입니다. 실제 비교에는 공인 외부 자료를 입력하세요.'),
        el('button', { className: 'btn btn-sm btn-secondary', style: 'margin-left:auto', onClick: () => _openBenchmarkEditor() }, '기준값 편집')
      ) : null,
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📈 벤치마크 모니터링'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { style: 'padding:6px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px', onChange: e => { _monitorIndustry = e.target.value; renderMonitor() } },
            ...benchmarks.industries.map(ind => el('option', { value: ind.code, selected: ind.code === _monitorIndustry }, `${ind.label} (${ind.avg_score}점)`))
          ),
          el('select', { style: 'padding:6px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px', onChange: e => { _monitorAssId = e.target.value; renderMonitor() } },
            assessments.map(a => el('option', { value: a.id, selected: a.id === selectedId }, `${a.title} (${a.assessment_year}년)`))
          ),
          el('button', { className: 'btn btn-primary', onClick: () => { renderMonitor() } }, '비교 실행')
        )
      ),
      el('div', { style: 'padding:12px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4;font-size:12px;color:#9ca3af;display:flex;gap:16px;align-items:center;flex-wrap:wrap' },
        el('span', {}, `글로벌 평균: ${benchmarks.global_avg}점`),
        el('span', { style: benchmarks.is_demo ? 'color:#D97706;font-weight:600' : '' }, `출처: ${benchmarks.sample_source}${benchmarks.is_demo ? ' ⚠ 확인 필요' : ''}`),
        el('span', {}, `갱신: ${benchmarks.last_updated || '미입력'}`),
        el('span', { style: `font-weight:600;color:${companyScore > benchmarks.global_avg ? '#047857' : '#dc2626'}` }, `자사: ${companyScore}점`),
        el('button', { className: 'btn btn-sm btn-secondary', style: 'margin-left:auto', onClick: () => _openBenchmarkEditor() }, '⚙ 기준값 편집')
      ),
      el('div', { style: 'display:grid;grid-template-columns:2fr 1fr;gap:16px;padding:20px;overflow-x:auto' },
        el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);min-width:0;overflow:hidden' },
          el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '업종별 평균 점수'),
          el('div', { style: 'position:relative;overflow-x:auto', innerHTML: industryBars + companyLine })
        ),
        el('div', {},
          el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);margin-bottom:12px' },
            el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '자사 비교'),
            el('div', { innerHTML: comparisonCards || '<div style="color:#9CA3AF;font-size:12px">비교 불가</div>' })
          ),
          el('div', { style: 'background:#fff;border-radius:10px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)' },
            el('h4', { style: 'margin:0 0 12px;font-size:13px;color:#6b7280' }, '알림 규칙'),
            el('div', { style: 'display:flex;flex-direction:column;gap:6px', innerHTML: ruleItems })
          )
        )
      ),
      el('div', { id: 'monitorResult', style: 'padding:0 20px 20px' })
    )
  }

  function _openBenchmarkEditor() {
    const meta = MONITORING.getBenchmarks()
    let rows = MONITORING.getIndustries().map(i => ({ ...i }))
    const fieldStyle = 'width:100%;font-size:13px;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;box-sizing:border-box'
    const labelStyle = 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px'

    const rowsC = el('div', { style: 'display:flex;flex-direction:column;gap:6px' })
    const renderRows = () => {
      rowsC.innerHTML = ''
      if (!rows.length) rowsC.append(el('div', { style: 'font-size:12px;color:#9CA3AF;padding:8px 0' }, '등록된 업종이 없습니다.'))
      rows.forEach((r, idx) => {
        rowsC.append(el('div', { style: 'display:flex;gap:6px;align-items:center' },
          el('input', { value: r.label, placeholder: '업종명', style: 'flex:2;min-width:0;font-size:12px;padding:6px 8px;border:1px solid #e4e7eb;border-radius:6px', onInput: e => { rows[idx].label = e.target.value } }),
          el('input', { type: 'number', value: r.avg_score, placeholder: '평균', style: 'flex:1;min-width:0;font-size:12px;padding:6px 8px;border:1px solid #e4e7eb;border-radius:6px', onInput: e => { rows[idx].avg_score = e.target.value } }),
          el('input', { type: 'number', value: r.sample_size, placeholder: '표본', style: 'flex:1;min-width:0;font-size:12px;padding:6px 8px;border:1px solid #e4e7eb;border-radius:6px', onInput: e => { rows[idx].sample_size = e.target.value } }),
          el('button', { className: 'btn btn-sm btn-danger', title: '삭제', onClick: () => { rows.splice(idx, 1); renderRows() } }, '✕')
        ))
      })
    }
    renderRows()

    const sourceInput = el('input', { value: meta.sample_source || '', style: fieldStyle })
    const typeSel = el('select', { style: fieldStyle },
      el('option', { value: 'internal_demo', selected: meta.source_type === 'internal_demo' }, '내부 기준값 (데모)'),
      el('option', { value: 'external', selected: meta.source_type === 'external' }, '외부 공개 자료'),
      el('option', { value: 'manual', selected: meta.source_type === 'manual' }, '수동 입력')
    )
    const dateInput = el('input', { type: 'date', value: meta.last_updated || '', style: fieldStyle })

    const form = el('div', { style: 'display:flex;flex-direction:column;gap:12px' },
      el('div', {}, el('label', { style: labelStyle }, '출처'), sourceInput),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('div', {}, el('label', { style: labelStyle }, '출처 유형'), typeSel),
        el('div', {}, el('label', { style: labelStyle }, '갱신일'), dateInput)
      ),
      el('div', {},
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' },
          el('label', { style: labelStyle + ';margin:0' }, '업종별 평균 점수 / 표본 수'),
          el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { rows.push({ code: 'ind_' + Date.now(), label: '', avg_score: 0, sample_size: 0 }); renderRows() } }, '+ 업종 추가')
        ),
        el('div', { style: 'display:flex;gap:6px;font-size:10px;color:#9CA3AF;margin-bottom:4px' },
          el('span', { style: 'flex:2' }, '업종명'), el('span', { style: 'flex:1' }, '평균'), el('span', { style: 'flex:1' }, '표본수'), el('span', { style: 'width:28px' }, '')
        ),
        rowsC
      ),
      el('p', { style: 'margin:0;font-size:11px;color:#9CA3AF' }, '입력값은 로컬에 저장되며, 출처 유형을 "내부 기준값(데모)"에서 변경하면 경고 표시가 사라집니다.')
    )
    modal('📊 벤치마크 기준값 편집', form)
    document.getElementById('modal-save').onclick = () => {
      const existing = MONITORING.getIndustries().map(i => i.code)
      const keepCodes = new Set(rows.map(r => r.code))
      existing.forEach(code => { if (!keepCodes.has(code)) Store.deleteBenchmarkIndustry(code) })
      rows.forEach(r => {
        const payload = { label: String(r.label || '').trim() || '업종', avg_score: Number(r.avg_score) || 0, sample_size: Number(r.sample_size) || 0 }
        if (existing.includes(r.code)) Store.updateBenchmarkIndustry(r.code, payload)
        else Store.addBenchmarkIndustry({ code: r.code, ...payload })
      })
      Store.setBenchmarkMeta({ source: sourceInput.value.trim() || '수동 입력', source_type: typeSel.value, last_updated: dateInput.value || null })
      closeModal()
      showToast('벤치마크 기준값이 저장되었습니다.', 'success')
      renderMonitor()
    }
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
        <div style="width:40px;height:40px;border-radius:50%;margin:0 auto 6px;display:flex;align-items:center;justify-content:center;font-size:18px;background:${isDone ? '#1E3A5F' : isCurrent ? '#1E3A5F15' : '#F8FAFC'};border:2px solid ${isDone || isCurrent ? '#1E3A5F' : '#E4E7EB'};color:${isDone ? '#fff' : isCurrent ? '#1E3A5F' : '#9CA3AF'}">
          ${isDone ? '✓' : s.icon}
        </div>
        <div style="font-size:11px;font-weight:${isCurrent ? '700' : '400'};color:${isCurrent ? '#1E3A5F' : isDone ? '#6b7280' : '#9CA3AF'}">${s.label}</div>
        ${isDone ? `<div style="position:absolute;top:18px;left:calc(50% + 24px);right:calc(-50% + 24px);height:2px;background:#1E3A5F"></div>` : ''}
      </div>`
    }).join('')

    const findingCards = (assurance.findings || []).map(f => {
      const sevColors = { high: '#dc2626', medium: '#d97706', low: '#2563EB' }
      const sevBg = { high: '#fdf0f0', medium: '#fdf6e3', low: '#f0f4fa' }
      const sevLabels = { high: '높음', medium: '보통', low: '낮음' }
      return `<div style="display:flex;align-items:start;gap:10px;padding:10px 12px;border-radius:8px;background:${sevBg[f.severity] || '#F8FAFC'};border:1px solid ${sevColors[f.severity]}20;margin-bottom:6px">
        <div style="width:32px;height:32px;border-radius:8px;background:${sevColors[f.severity]}15;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:${sevColors[f.severity]};flex-shrink:0">
          ${f.severity === 'high' ? '!' : f.severity === 'medium' ? '~' : 'i'}
        </div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:#1F2937">${f.category} · ${sevLabels[f.severity] || f.severity}</div>
          <div style="font-size:12px;color:#6B7280;margin-top:2px;line-height:1.4">${f.description}</div>
          ${f.recommendation ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">권고: ${f.recommendation}</div>` : ''}
        </div>
        <div style="flex-shrink:0;text-align:right">
          <span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;${f.status === 'open' ? 'background:#dc262615;color:#dc2626' : 'background:#04785715;color:#047857'}">${f.status === 'open' ? '미해결' : '해결완료'}</span>
          ${f.status === 'open' ? `<button class="btn btn-sm btn-success" style="margin-top:4px;font-size:11px" onclick="(function(){ISSA.resolveFinding('${companyId}','${f.id}');renderISSA()})()">해결처리</button>` : ''}
        </div>
      </div>`
    }).join('')

    c.append(
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '🛡️ ISSA 5000 감사 보증'),
        el('div', { style: 'display:flex;gap:12px;align-items:center' },
          el('span', { style: 'font-size:12px;color:#9CA3AF' }, `${completion}% 완료`),
          el('span', { style: 'font-size:12px;padding:2px 8px;border-radius:10px;background:#1E3A5F15;color:#1E3A5F;font-weight:600' }, `${openFindings.length}건 미해결`)
        )
      ),
      el('div', { style: 'padding:20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'margin-bottom:12px' },
          el('div', { style: 'background:#E4E7EB;height:6px;border-radius:3px;overflow:hidden' },
            el('div', { style: `background:#1E3A5F;height:100%;width:${completion}%` })
          )
        ),
        el('div', { style: 'display:flex;gap:4px;align-items:flex-start', innerHTML: stageHtml })
      ),
      el('div', { style: 'padding:12px 20px;background:#fff;border-bottom:1px solid #eef1f4;display:flex;gap:20px;font-size:12px;flex-wrap:wrap' },
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
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '감사인명'), el('input', { style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.auditor_name || '', onBlur: e => { assurance.auditor_name = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '감사기관'), el('input', { style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.auditor_firm || '', onBlur: e => { assurance.auditor_firm = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '면허번호'), el('input', { style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.auditor_license || '', onBlur: e => { assurance.auditor_license = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '보증 수준'), el('select', { style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', onChange: e => { assurance.assurance_level = e.target.value; ISSA.saveAssurance(assurance); renderISSA() } },
              ASSURANCE_LEVELS.map(l => el('option', { value: l.key, selected: l.key === assurance.assurance_level }, `${l.label} (${l.description})`))
            )),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '감사 시작일'), el('input', { type: 'date', style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.scope_start || '', onBlur: e => { assurance.scope_start = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '감사 종료일'), el('input', { type: 'date', style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.scope_end || '', onBlur: e => { assurance.scope_end = e.target.value; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '중대성 기준(%)'), el('input', { type: 'number', style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.materiality_threshold || 10, onBlur: e => { assurance.materiality_threshold = parseInt(e.target.value) || 10; ISSA.saveAssurance(assurance) } })),
            el('div', { className: 'form-group' }, el('label', { style: 'font-size:11px;color:#9ca3af' }, '서명일'), el('input', { type: 'date', style: 'width:100%;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', value: assurance.sign_date || '', onBlur: e => { assurance.sign_date = e.target.value; ISSA.saveAssurance(assurance) } }))
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
          el('div', { style: 'padding:12px;border-bottom:1px solid #EEF1F4;background:#F8FAFC' },
            el('div', { style: 'display:grid;grid-template-columns:1fr 80px;gap:6px;margin-bottom:6px' },
              el('select', { id: 'findCategory', style: 'padding:5px 8px;border:1px solid #e4e7eb;border-radius:6px;font-size:11px' },
                ['환경', '사회', '지배구조', '데이터', '절차', '기타'].map(cat => el('option', { value: cat }, cat))
              ),
              el('select', { id: 'findSeverity', style: 'padding:5px 8px;border:1px solid #e4e7eb;border-radius:6px;font-size:11px' },
                [{ key: 'low', label: '낮음' }, { key: 'medium', label: '보통' }, { key: 'high', label: '높음' }].map(s => el('option', { value: s.key }, s.label))
              )
            ),
            el('textarea', { id: 'findDesc', rows: 2, placeholder: '설명', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:6px;font-size:11px;resize:vertical;margin-bottom:6px' }),
            el('textarea', { id: 'findRec', rows: 1, placeholder: '권고사항 (선택)', style: 'width:100%;padding:6px 8px;border:1px solid #e4e7eb;border-radius:6px;font-size:11px;resize:vertical' })
          ),
          el('div', { style: 'padding:12px;max-height:350px;overflow-y:auto', innerHTML: findingCards || '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:12px">지적사항이 없습니다.</div>' })
        )
      ),
      el('div', { className: 'card', style: 'margin:0 20px 20px' },
        el('div', { className: 'card-header' }, el('h3', { style: 'font-size:14px' }, '보증 의견서')),
        el('div', { innerHTML: ISSA.generateReport(companyId), style: 'padding:16px 20px;font-size:12px;line-height:1.7' })
      )
    )
  }

  // ==================== 평가기관 제출 ====================
  function _downloadSubmission(submissionId) {
    const companyId = (Store.getCompanies()[0]?.id) || 'default'
    const submission = SUBMISSION.getSubmissions(companyId).find(s => s.id === submissionId)
    if (!submission) return
    const file = SUBMISSION.generateFile(submission)
    if (!file) return alert('이 평가기관은 파일 제출을 지원하지 않습니다.')
    const blob = new Blob(['\uFEFF' + file.content], { type: file.mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    a.click()
    URL.revokeObjectURL(url)
    showToast(`${file.filename} 파일이 생성되었습니다.`, 'success')
  }

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
        submissions.length ? el('div', { innerHTML: SUBMISSION.generateReport(companyId) }) : el('p', { style: 'padding:20px;color:#9CA3AF' }, '등록된 제출이 없습니다. 평가기관을 추가해주세요.')
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '평가기관별 제출 현황')),
        el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '기관'), el('th', {}, '포맷'), el('th', {}, '상태'), el('th', {}, '설명'))),
          el('tbody', {}, ...agencies.map(a => {
            const sub = submissions.find(s => s.agency_code === a.code)
            const statusColors = { available: '#047857', pending: '#d97706', not_available: '#D0D5DD' }
            return el('tr', {},
              el('td', { style: 'font-weight:600' }, a.name),
              el('td', {}, a.format),
              el('td', { style: `color:${statusColors[a.status]};font-weight:600` }, { available: '사용가능', pending: '준비중', not_available: '미지원' }[a.status]),
              el('td', { style: 'font-size:11px;color:#9ca3af' }, a.description),
              el('td', {}, sub ? el('div', { style: 'display:flex;align-items:center;gap:8px' },
                el('span', { style: 'color:#047857;font-size:11px;white-space:nowrap' }, `✓ 등록됨 (준비율 ${SUBMISSION.calcReadiness(sub)}%)`),
                a.status === 'available' ? el('button', { className: 'btn btn-sm btn-secondary', onClick: () => _downloadSubmission(sub.id) }, '⬇ 제출 파일') : null
              ) : null)
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
        el('span', { style: 'font-size:11px;color:#9ca3af' }, 'MSCI/Sustainalytics 등 공개자료 기반 평가기관 대응')
      ),
      el('div', { className: 'card', style: 'margin-bottom:12px;padding:16px 20px;background:linear-gradient(135deg,#f0f7ff 0%,#F8FAFC 100%)' },
        el('div', { style: 'font-weight:600;font-size:13px;margin-bottom:10px' }, '📊 공개자료 현황 요약'),
        el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px' },
          ...agencies.map(ag => {
            const saved = Store.getExtractionsByHash(`checklist_${ag.code}`) || []
            const done = saved.length
            const total = checklistItems.length
            const rate = total ? Math.round(done / total * 100) : 0
            return el('div', { style: `padding:10px;background:#fff;border-radius:8px;border-left:3px solid ${rate >= 80 ? '#059669' : rate >= 40 ? '#d97706' : '#dc2626'}` },
              el('div', { style: 'font-size:11px;color:#9ca3af' }, ag.name),
              el('div', { style: 'font-size:18px;font-weight:700;color:#1F2937;margin-top:2px' }, `${rate}%`),
              el('div', { style: 'font-size:10px;color:#9CA3AF' }, `${done}/${total} 항목`)
            )
          })
        )
      )
    )

    if (!agencies.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('p', { style: 'margin:0;color:#9ca3af' }, 'PUBLIC_DATA 유형의 기관이 없습니다.')
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
            el('p', { style: 'margin:4px 0 0;font-size:11px;color:#9ca3af' }, agency.note || '')
          ),
          el('span', { style: `font-size:11px;padding:3px 8px;border-radius:12px;background:${completedItems.length === checklistItems.length ? '#dcfce7' : '#fef3c7'};color:${completedItems.length === checklistItems.length ? '#047857' : '#92400e'};font-weight:500` },
            `${completedItems.length}/${checklistItems.length} 완료`)
        ),
        el('div', { style: 'padding:12px 16px' },
          ...checklistItems.map(item => {
            const isCompleted = completedItems.includes(item.id)
            return el('div', { style: `display:flex;align-items:center;gap:8px;padding:8px 12px;margin-bottom:4px;border-radius:6px;cursor:pointer;${isCompleted ? 'background:#f0fdf4' : 'background:#F8FAFC'}`,
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
              el('span', { style: `width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;${isCompleted ? 'background:#059669;color:#fff' : 'border:2px solid #e4e7eb;color:transparent'}` }, isCompleted ? '✓' : ''),
              el('div', { style: 'flex:1' },
                el('div', { style: `font-size:12px;font-weight:${isCompleted ? '500' : '400'};${isCompleted ? 'color:#047857' : 'color:#1F2937'}` }, item.label),
                el('div', { style: 'font-size:10px;color:#9ca3af' }, item.desc)
              ),
              el('span', { style: 'font-size:9px;color:#9CA3AF' }, item.category),
              item.url ? el('a', { href: item.url, target: '_blank', style: 'font-size:10px;color:#1E3A5F;text-decoration:none;margin-left:4px', onClick: e => e.stopPropagation() }, '🔗') : null
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
            if (today >= startDate && today <= endDate) { status = '제출기간 진행 중'; color = '#059669' }
            else if (daysUntilStart > 0 && daysUntilStart <= 30) { status = `${daysUntilStart}일 후 시작`; color = '#d97706' }
            else if (today > endDate) { status = '제출기간 종료'; color = '#dc2626' }
            else { status = `${Math.abs(daysUntilStart)}일 전`; color = '#9ca3af' }
            return el('div', { style: 'display:flex;align-items:center;gap:8px;padding:6px 0;font-size:12px' },
              el('span', { style: `width:8px;height:8px;border-radius:50%;background:${color}` }),
              el('span', { style: 'font-weight:500;min-width:120px' }, a.name),
              el('span', { style: 'color:#6b7280' }, `${a.submission_window}`),
              el('span', { style: `color:${color};font-weight:500;margin-left:auto` }, status)
            )
          })
        )
      )
      c.append(reminderCard)
    }
  }

  // ==================== ERP/API 연동 ====================
  async function _testApiEndpoint(id, btn) {
    const original = btn.textContent
    btn.disabled = true
    btn.textContent = '테스트 중...'
    const res = await API.testConnection(id)
    btn.disabled = false
    btn.textContent = original
    if (res.ok) showToast(`연결 성공 (HTTP ${res.status}, ${res.latency}ms)`, 'success')
    else showToast(`연결 실패: ${res.error || 'ERROR'}${res.message ? ' — ' + res.message : ''}`, 'error')
    renderAPI()
  }

  async function _pullApiEndpoint(id, btn) {
    const original = btn.textContent
    btn.disabled = true
    btn.textContent = '수집 중...'
    const res = await API.pullData(id)
    btn.disabled = false
    btn.textContent = original
    if (res.ok) showToast(`데이터 수집 완료: ${res.imported}건`, 'success')
    else showToast(`수집 실패: ${res.error || 'ERROR'}${res.message ? ' — ' + res.message : ''}`, 'error')
    renderAPI()
  }

  function renderAPI() {
    if (!c) return
    const endpoints = API.getEndpoints() || []
    const status = API.getSyncStatus()
    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '🔌 ERP/API 데이터 연동')),
        el('div', { style: 'padding:12px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4;font-size:13px;display:flex;gap:24px' },
          el('span', {}, `활성 엔드포인트: <strong>${status.active_endpoints}/${status.total_endpoints}</strong>`),
          el('span', {}, `총 레코드: <strong>${status.total_records}</strong>`),
          el('span', {}, `마지막 동기화: <strong>${status.latest_sync}</strong>`)
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '엔드포인트 목록')),
        el('div', { style: 'padding:10px 20px;background:#fffbeb;border-bottom:1px solid #fde68a;font-size:11px;color:#92400e' },
          '⚠ 실제 연동을 위해서는 각 엔드포인트의 Base URL을 입력하고 연결 테스트를 실행하세요. (인증 토큰 사용 시 Bearer 형식)'
        ),
        el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, 'ID'), el('th', {}, '이름'), el('th', {}, '소스'), el('th', {}, '카테고리'), el('th', {}, '방식'), el('th', {}, 'Base URL'), el('th', {}, '상태'), el('th', {}, '마지막동기화'), el('th', {}, '레코드'), el('th', {}, '관리'))),
          el('tbody', {}, ...endpoints.map(ep => el('tr', {},
            el('td', { style: 'font-family:monospace;font-size:11px' }, ep.id),
            el('td', {}, ep.name),
            el('td', {}, ep.source),
            el('td', {}, ep.category),
            el('td', {}, ep.method),
            el('td', {}, el('input', { id: 'apiBase_' + ep.id, value: ep.base_url || '', placeholder: 'https://erp.company.com', style: 'width:190px;padding:4px 6px;border:1px solid #e4e7eb;border-radius:4px;font-size:11px', onChange: e => API.setEndpointConfig(ep.id, { base_url: e.target.value.trim() }) })),
            el('td', { style: ep.status === 'active' ? 'color:#047857;font-weight:600' : 'color:#9CA3AF' }, ep.status === 'active' ? '활성' : '비활성'),
            el('td', {}, ep.last_sync ? new Date(ep.last_sync).toLocaleString('ko-KR') : '-'),
            el('td', { style: 'text-align:center' }, ep.record_count || 0),
            el('td', { style: 'white-space:nowrap' },
              el('button', { className: 'btn btn-sm', style: 'background:#EEF4FA;color:#1E3A5F;border:1px solid #DBE3EC;font-size:11px', onClick: e => _testApiEndpoint(ep.id, e.target) }, '연결 테스트'),
              el('button', { className: 'btn btn-sm', style: 'background:#f0fdf4;color:#059669;border:1px solid #bbf7d0;font-size:11px;margin-left:4px', onClick: e => _pullApiEndpoint(ep.id, e.target) }, '수집'),
              el('button', { className: 'btn btn-sm' + (ep.status === 'active' ? ' btn-danger' : ' btn-success'), style: 'font-size:11px;margin-left:4px', onClick: () => { API.toggleEndpoint(ep.id); renderAPI() } }, ep.status === 'active' ? '비활성화' : '활성화')
            )
          )))
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '📡 연동 로그')),
        (() => {
          const logs = Store.getApiDataLogs().slice(-8).reverse()
          if (!logs.length) return el('div', { style: 'padding:16px 20px;color:#9CA3AF;font-size:12px' }, '연동 이력이 없습니다')
          return el('table', { style: 'font-size:11px' },
            el('thead', {}, el('tr', {}, el('th', {}, '시각'), el('th', {}, '엔드포인트'), el('th', {}, '유형'), el('th', {}, '결과'), el('th', {}, '상태코드'), el('th', {}, '지연(ms)'), el('th', {}, '비고'))),
            el('tbody', {}, ...logs.map(l => el('tr', {},
              el('td', {}, new Date(l.created_at).toLocaleString('ko-KR')),
              el('td', { style: 'font-family:monospace' }, l.endpoint_id),
              el('td', {}, l.type === 'test' ? '연결 테스트' : '데이터 수집'),
              el('td', { style: l.ok ? 'color:#059669;font-weight:600' : 'color:#dc2626;font-weight:600' }, l.ok ? '성공' : '실패'),
              el('td', {}, l.status_code != null ? l.status_code : '-'),
              el('td', {}, l.latency_ms != null ? l.latency_ms + 'ms' : '-'),
              el('td', {}, l.error ? l.error : (l.imported != null ? `${l.imported}건 수집` : ''))
            )))
          )
        })()
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '📥 CSV 데이터 가져오기')
        ),
        el('div', { style: 'padding:16px 20px' },
          el('div', { className: 'form-group' }, el('label', {}, '데이터 카테고리'), el('select', { id: 'csvCategory' },
            ['ghg', 'energy', 'water', 'waste', 'workforce', 'safety', 'training', 'supply_chain', 'financial'].map(cat => el('option', { value: cat }, cat))
          )),
          el('div', { className: 'form-group' }, el('label', {}, 'CSV 입력'), el('textarea', { id: 'csvInput', rows: 6, placeholder: '헤더 포함 CSV를 붙여넣으세요...\n\n예시: year,scope,category,quantity,unit\n2024,scope1,diesel,1000,liter', style: 'width:100%;padding:8px;border:1px solid #e4e7eb;border-radius:6px;font-family:monospace;font-size:11px' })),
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
          el('div', { id: 'csvPreview', style: 'margin-top:12px;font-size:11px;color:#9ca3af' })
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
          el('pre', { id: 'examplePayload', style: 'background:#F8FAFC;padding:12px;border-radius:6px;font-size:11px;overflow-x:auto;max-height:200px' }, JSON.stringify(API.generatePayloadExample('ghg'), null, 2))
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
        el('span', { style: 'font-size:12px;color:#9ca3af' }, `${allLinks.filter(l => !l.revoked_at).length}개 활성 링크`)
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
              el('td', { style: 'font-size:11px;color:#9ca3af' }, l.expires_at ? new Date(l.expires_at).toLocaleDateString('ko-KR') : '무제한'),
              el('td', {}, el('button', { className: 'btn btn-sm', style: 'font-size:10px;color:#dc2626;background:none;border:none', onClick: () => { ESGComponents.revokeShareLink(l.id); renderShareManagement() } }, '회수'))
            )
          }))
        )
      ))
    }

    if (revokedLinks.length) {
      c.append(el('div', { className: 'card', style: 'opacity:.6' },
        el('div', { className: 'card-header' }, el('h3', {}, `회수된 링크 (${revokedLinks.length}개)`)),
        el('div', { style: 'padding:8px 16px;font-size:12px;color:#9ca3af' }, `${revokedLinks.length}개의 공유 링크가 회수되었습니다.`)
      ))
    }

    if (!allLinks.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' },
        el('div', { style: 'font-size:36px;margin-bottom:12px' }, '🔗'),
        el('h3', { style: 'margin:0 0 8px' }, '공유된 항목이 없습니다'),
        el('p', { style: 'margin:0;color:#9ca3af;font-size:13px' }, '증빙, 보고서, KPI 대시보드에서 공유 버튼을 눌러 링크를 생성하세요.')
      ))
    }
  }

  // ==================== 참고자료 라이브러리 ====================
  let _refQuery = ''
  let _refStatus = 'all'

  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  function _mdToHtml(md) {
    const inline = (t) => _esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/`(.+?)`/g, '<code>$1</code>')
    const lines = (md || '').split('\n')
    let html = ''
    let inList = false
    lines.forEach(line => {
      const h = line.match(/^(#{1,6})\s+(.*)$/)
      if (h) { if (inList) { html += '</ul>'; inList = false } const lv = Math.min(h[1].length + 1, 6); html += `<h${lv}>${inline(h[2])}</h${lv}>`; return }
      const li = line.match(/^\s*[-*+]\s+(.*)$/)
      if (li) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${inline(li[1])}</li>`; return }
      if (inList) { html += '</ul>'; inList = false }
      if (line.trim() === '') return
      html += `<p>${inline(line)}</p>`
    })
    if (inList) html += '</ul>'
    return html
  }

  function renderReferences() {
    const c = document.getElementById('page-references')
    if (!c) return
    const docs = Reference.getAll().filter(d => Store.canSeeOwned('referenceDocs', d))
    const q = _refQuery.trim().toLowerCase()
    const filtered = docs.filter(d => {
      if (_refStatus !== 'all' && d.status !== _refStatus) return false
      if (!q) return true
      return [d.title, d.source_org, d.industry, d.year, (d.tags || []).join(' ')].join(' ').toLowerCase().includes(q)
    })
    const ready = docs.filter(d => d.status === 'ready').length
    const busy = docs.filter(d => d.status === 'uploading' || d.status === 'converting').length
    const totalPages = docs.reduce((s, d) => s + (d.page_count || 0), 0)

    c.innerHTML = ''
    if (!_supabaseReady()) {
      c.append(el('div', { className: 'ref-banner warn' },
        el('span', { style: { fontSize: 16 } }, '⚠️'),
        el('div', {}, el('b', {}, 'Supabase 미연결(로컬 모드)'), el('div', {}, '문서는 브라우저에서 변환됩니다(PDF·Word·PPT·Excel·TXT·MD). supabase.js에 프로젝트 URL/키를 입력하면 원격 저장·동기화와 서버 변환(Edge Function)을 사용할 수 있습니다.'))
      ))
    }
    if (!c.dataset.dropBound) {
      c.dataset.dropBound = '1'
      c.addEventListener('dragover', e => e.preventDefault())
      c.addEventListener('drop', e => {
        e.preventDefault()
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
        if (f) openReferenceUpload(f)
      })
    }
    c.append(el('div', { className: 'card' },
      el('div', { className: 'card-header' },
        el('h3', {}, '📚 참고자료 라이브러리'),
        el('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          el('input', { type: 'text', placeholder: '검색 (제목/기관/태그)', value: _refQuery, style: { padding: '7px 12px', border: '1px solid #e4e7eb', borderRadius: 6, fontSize: 13, width: 220 }, onInput: e => { _refQuery = e.target.value; renderReferences() } }),
          _supabaseReady() ? el('button', { className: 'btn btn-secondary', onClick: testConvertServer, title: '변환 서버(Edge Function) 연결 확인' }, '🔌 변환 서버 테스트') : null,
          el('button', { className: 'btn btn-secondary', onClick: openStorageSettings, title: '저장소 설정' }, '⚙ 저장소'),
          el('button', { className: 'btn btn-primary', onClick: openReferenceUpload }, '＋ 참고자료 업로드')
        )
      ),
      el('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap', padding: '0 4px 12px' } },
        _refStat('전체 문서', docs.length, '#2563EB'),
        _refStat('변환 완료', ready, '#059669'),
        _refStat('처리 중', busy, '#d97706'),
        _refStat('총 페이지', totalPages, '#2563EB')
      )
    ))

    const chips = ['all', 'ready', 'converting', 'pending', 'error']
    c.append(el('div', { style: { display: 'flex', gap: 8, marginBottom: 12, padding: '0 4px', flexWrap: 'wrap' } },
      chips.map(s => el('button', {
        className: 'btn btn-sm ' + (_refStatus === s ? 'btn-primary' : 'btn-secondary'),
        onClick: () => { _refStatus = s; renderReferences() }
      }, s === 'all' ? '전체' : Reference.statusLabel(s)))
    ))

    if (!filtered.length) {
      c.append(el('div', { className: 'card' },
        el('div', { style: { textAlign: 'center', padding: '40px 20px', color: '#9ca3af' } },
          el('div', { style: { fontSize: 36, marginBottom: 12 } }, '📚'),
          el('h3', { style: { margin: '0 0 8px' } }, docs.length ? '검색 결과가 없습니다' : '등록된 참고자료가 없습니다'),
          el('p', { style: { margin: 0, fontSize: 13 } }, 'PDF·PPT·Word·Excel 문서를 업로드하면 Markdown으로 변환되어 검색·활용됩니다.'))
      ))
      return
    }

    const rows = filtered.map(d => el('tr', {},
      el('td', {}, el('div', { style: { fontWeight: 600 } }, d.title || d.file_name || '(제목 없음)', d.scanned ? el('span', { className: 'chip chip-warn', style: 'margin-left:6px' }, '스캔본') : null, d.storage_error ? el('span', { className: 'chip chip-warn', style: 'margin-left:6px', title: d.storage_error }, '저장소 ⚠') : null), el('div', { style: { fontSize: 12, color: '#9ca3af' } }, [Reference.typeLabel(d.file_name), d.file_name, d.engine].filter(Boolean).join(' · ')), d.error ? el('div', { style: { fontSize: 11, color: '#dc2626', marginTop: 2 } }, d.error) : null, d.storage_error ? el('div', { style: { fontSize: 11, color: '#d97706', marginTop: 2 } }, d.storage_error) : null),
      el('td', {}, d.source_org || '-'),
      el('td', {}, d.year || '-'),
      el('td', {}, el('span', { style: { display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 11, color: '#fff', background: Reference.statusColor(d.status) } }, Reference.statusLabel(d.status))),
      el('td', {}, d.status === 'ready' ? (d.page_count || 0) + 'p / ' + (d.chunk_count || 0) + 'chunk' : '-'),
      el('td', {}, el('div', { style: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' } },
        el('div', { style: { fontSize: 12, color: '#6B7280' } }, (d.view_count || 0) + '회'),
        el('div', { style: { fontSize: 11, color: '#9CA3AF' } }, d.last_viewed_at ? '최근 ' + new Date(d.last_viewed_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '미열람'),
        el('button', { className: 'btn btn-sm btn-primary', style: { marginTop: 2 }, onClick: () => openReferencePreview(d.id) }, '열람하기')
      )),
      el('td', {}, el('div', { style: { display: 'flex', gap: 4 } },
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => reconvertReference(d.id) }, '재변환'),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => deleteReference(d.id) }, '삭제')
      ))
    ))

    c.append(el('div', { className: 'card', style: { padding: 0 } },
      el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
        el('thead', {}, el('tr', {}, ['제목', '출처 기관', '연도', '상태', '분량', '열람', '관리'].map(h => el('th', { style: { textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #eef1f4', color: '#6b7280', fontWeight: 600 } }, h)))),
        el('tbody', {}, rows)
      )
    ))
  }

  function _refStat(label, value, color) {
    return el('div', { style: { flex: '1 1 140px', background: '#f8fafc', borderRadius: 10, padding: '12px 16px', borderLeft: '3px solid ' + color } },
      el('div', { style: { fontSize: 12, color: '#9ca3af' } }, label),
      el('div', { style: { fontSize: 22, fontWeight: 700, color: '#16304f' } }, String(value))
    )
  }

  async function testConvertServer() {
    showLoading('변환 서버 연결 확인 중...')
    try {
      const r = await MdConvert.testServer()
      if (r.ok) {
        showToast(`변환 서버 정상 (engine: ${r.engine}${r.backend ? ', backend: ' + r.backend : ''})`, 'success')
      } else {
        showToast('변환 서버 오류: ' + r.reason, 'error')
      }
    } catch (e) {
      showToast('변환 서버 확인 실패: ' + (e && e.message), 'error')
    } finally {
      hideLoading()
    }
  }

  function openReferenceUpload(preset) {
    let file = (preset instanceof File || preset instanceof Blob) ? preset : null
    const fileInput = el('input', { type: 'file', accept: '.pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.txt,.md,.csv,.json' })
    fileInput.style.display = 'none'
    const dropzone = el('div', { className: 'ref-dropzone' })
    const titleInput = el('input', { id: 'ref-title', type: 'text', placeholder: '예: 2024 지속가능경영보고서' })
    const orgInput = el('input', { id: 'ref-org', type: 'text', placeholder: '예: GRI / KSSB / 벤치마크 기업' })
    const industryInput = el('input', { id: 'ref-industry', type: 'text', placeholder: '예: 전기전자' })
    const yearInput = el('input', { id: 'ref-year', type: 'text', placeholder: '예: 2024' })
    const tagsInput = el('input', { id: 'ref-tags', type: 'text', placeholder: '쉼표로 구분 · 예: 기후, GRI' })

    const _fileSub = (f) => {
      const kb = f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : (f.size / 1048576).toFixed(1) + ' MB'
      const ext = (f.name.split('.').pop() || '').toUpperCase()
      return ext + ' · ' + kb
    }
    const renderDrop = () => {
      dropzone.innerHTML = ''
      if (!file) {
        dropzone.classList.remove('has-file')
        dropzone.append(
          el('div', { className: 'ref-drop-icon' }, '📄'),
          el('div', { className: 'ref-drop-title' }, '파일을 여기로 끌어다 놓으세요'),
          el('div', { className: 'ref-drop-sub' }, '또는 클릭하여 선택 · PDF, PPT, Word, Excel, TXT, MD')
        )
      } else {
        dropzone.classList.add('has-file')
        dropzone.append(el('div', { className: 'ref-file-chip' },
          el('span', { className: 'ref-file-ico' }, '📄'),
          el('div', { className: 'ref-file-meta' },
            el('div', { className: 'ref-file-name', title: file.name }, file.name),
            el('div', { className: 'ref-file-sub' }, _fileSub(file))
          ),
          el('button', { type: 'button', className: 'ref-file-remove', onClick: e => { e.stopPropagation(); file = null; fileInput.value = ''; renderDrop() } }, '✕ 제거')
        ))
      }
    }
    renderDrop()

    dropzone.addEventListener('click', () => fileInput.click())
    ;['dragenter', 'dragover'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag') }))
    ;['dragleave', 'dragend'].forEach(ev => dropzone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag') }))
    dropzone.addEventListener('drop', e => {
      e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag')
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
      if (f) { file = f; renderDrop() }
    })
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) { file = fileInput.files[0]; renderDrop() } })

    const field = (label, input, full) => el('div', { className: 'ref-field' + (full ? ' full' : '') }, el('label', {}, label), input)

    const form = el('div', {},
      dropzone, fileInput,
      el('div', { style: { height: 16 } }),
      el('div', { className: 'ref-upload-grid' },
        field('제목', titleInput, true),
        field('출처 기관', orgInput),
        field('발간연도', yearInput),
        field('업종', industryInput),
        field('태그', tagsInput)
      ),
      el('div', { style: { marginTop: 14, fontSize: 12, lineHeight: 1.6, color: _supabaseReady() ? '#6b7280' : '#D97706' } },
        _supabaseReady()
          ? '업로드한 문서는 Markdown으로 변환되어 검색·인용에 활용됩니다. (스캔본 PDF는 텍스트 추출 정확도가 낮을 수 있습니다.)'
          : '⚠ Supabase 미연결(로컬 모드): 문서를 브라우저에서 직접 변환합니다(PDF·Word·PPT·Excel·TXT·MD). 원격 저장이 필요하면 Supabase를 연결하세요.')
    )
    modal('참고자료 업로드', form)
    document.getElementById('modal-save').onclick = async () => {
      if (!file) { showToast('파일을 선택하세요.', 'error'); return }
      const MAX_MB = 50
      if (StorageAdapter.isRemote && file.size > MAX_MB * 1024 * 1024) {
        const mb = (file.size / 1024 / 1024).toFixed(1)
        showToast('파일이 ' + mb + 'MB로 Supabase Storage 기본 제한(' + MAX_MB + 'MB)을 초과합니다. 대시보드에서 제한을 늘리거나 로컬 저장 모드로 전환하세요.', 'warning')
      }
      const payload = {
        title: titleInput.value.trim(),
        source_org: orgInput.value.trim(),
        industry: industryInput.value.trim(),
        year: parseInt(yearInput.value) || null,
        tags: tagsInput.value.split(',').map(s => s.trim()).filter(Boolean),
        file
      }
      closeModal()
      showLoading('업로드 및 변환 중...')
      try {
        const saved = await Reference.create(payload)
        if (saved && saved.status === 'ready' && saved.storage_error) showToast('등록됨 · 저장소 경고: ' + saved.storage_error, 'warning')
        else showToast('참고자료가 등록되었습니다.')
      } catch (e) {
        showToast('등록 실패: ' + e.message, 'error')
      } finally {
        hideLoading()
        renderReferences()
      }
    }
  }

  async function openReferencePreview(id) {
    const doc = Reference.getById(id)
    if (!doc) return
    _refRte = null
    Store.recordReferenceView(id)
    showLoading('문서 불러오는 중...')
    let md = doc.markdown || ''
    if (!md) { try { const blob = await Reference.getBlob(id); md = await blob.text() } catch (e) { showToast('파일을 불러올 수 없습니다.', 'error') } }
    hideLoading()
    const sugg = Reference.suggestIndicators(id, 8)
    const body = el('div', { style: { maxHeight: '70vh', overflow: 'auto', fontSize: 13, lineHeight: 1.6 } },
      el('div', { style: { marginBottom: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        el('span', {}, [doc.source_org, doc.year ? doc.year + '년' : '', Reference.typeLabel(doc.file_name)].filter(Boolean).join(' · ')),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => openReferenceFile(id) }, '⬇ 원본 파일 열기')
      ),
      sugg.length ? el('div', { style: { marginBottom: 12, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #e4e7eb', borderRadius: 8 } },
        el('div', { style: { fontSize: 12, fontWeight: 600, color: '#1E3A5F', marginBottom: 6 } }, '🔗 관련 지표 제안'),
        el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          ...sugg.map(s => el('span', { style: { fontSize: 11, padding: '3px 8px', background: '#fff', border: '1px solid #dbe3ec', borderRadius: 99, color: '#16304f' } }, Indicator.getNameAndCode({ indicator_code: s.code, indicator_name: s.name })))
        )
      ) : null,
      doc.scanned ? el('div', { className: 'ref-banner warn', style: 'margin-bottom:12px' },
        el('span', { style: { fontSize: 16 } }, '⚠️'),
        el('div', {}, el('b', {}, '스캔본(이미지) PDF'), el('div', {}, '텍스트 레이어가 거의 없어 변환 품질이 낮습니다. OCR이 적용된 PDF를 업로드하거나 변환 서버 사용을 권장합니다.'))) : null,
      el('div', { id: 'ref-md-view', innerHTML: md ? _mdToHtml(md) : '<p style="color:#9ca3af">변환된 내용이 없습니다. 재변환을 시도하세요.</p>' }),
      el('div', { id: 'ref-rte-host', style: 'display:none' })
    )
    modal('📖 ' + (doc.title || doc.file_name || '참고자료'), body, '닫기')
    const saveBtn = document.getElementById('modal-save')
    saveBtn.style.display = ''
    saveBtn.textContent = '✎ 편집'
    saveBtn.onclick = () => _toggleRefEdit(id, md)
    renderReferences()
  }

  let _refRte = null
  function _toggleRefEdit(id, md) {
    const view = document.getElementById('ref-md-view')
    const host = document.getElementById('ref-rte-host')
    const saveBtn = document.getElementById('modal-save')
    if (!view || !host) return
    if (_refRte) {
      const markdown = RichEditor.textFromBlocks(_refRte.blocks)
      Store.updateReferenceDoc(id, { markdown })
      showToast('참고자료를 수정했습니다.')
      view.innerHTML = markdown ? _mdToHtml(markdown) : '<p style="color:#9ca3af">내용이 없습니다.</p>'
      view.style.display = ''
      host.style.display = 'none'
      _refRte = null
      saveBtn.textContent = '✎ 편집'
      saveBtn.onclick = () => _toggleRefEdit(id)
      renderReferences()
      return
    }
    if (!window.RichEditor) { showToast('에디터를 불러올 수 없습니다.', 'error'); return }
    const doc = Reference.getById(id)
    const cur = (doc && doc.markdown) || md || ''
    view.style.display = 'none'
    host.style.display = ''
    host.innerHTML = ''
    _refRte = new RichEditor.RichEditor({ html: cur ? _mdToHtml(cur) : '', showAI: false, autosaveLabel: null })
    _refRte.mount(host)
    saveBtn.textContent = '💾 저장'
    saveBtn.onclick = () => _toggleRefEdit(id)
  }

  async function openReferenceFile(id) {
    try {
      const blob = await Reference.getBlob(id)
      if (!blob) { showToast('원본 파일이 없습니다.', 'error'); return }
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e) { showToast('원본 파일을 열 수 없습니다: ' + e.message, 'error') }
  }

  async function reconvertReference(id) {
    showLoading('재변환 중...')
    try { await Reference.recreate(id); showToast('재변환 완료.') }
    catch (e) { showToast('재변환 실패: ' + e.message, 'error') }
    finally { hideLoading(); renderReferences() }
  }

  async function deleteReference(id) {
    const doc = Reference.getById(id)
    if (!doc) return
    if (!confirm('"' + (doc.title || doc.file_name) + '" 참고자료를 삭제할까요?')) return
    showLoading('삭제 중...')
    try { await Reference.remove(id); showToast('삭제되었습니다.') }
    catch (e) { showToast('실패: ' + e.message, 'error') }
    finally { hideLoading(); renderReferences() }
  }

  function openStorageSettings() {
    const mode = StorageAdapter.mode
    const remoteReady = typeof SUPABASE_CONFIG !== 'undefined' && !!SUPABASE_CONFIG.url && !SUPABASE_CONFIG.url.includes('your-project')
    const policySql = 'insert into storage.buckets (id, name, public)\nvalues (\'references\', \'references\', false)\non conflict (id) do update set public = false;\n\ndrop policy if exists "references_all" on storage.objects;\ncreate policy "references_all" on storage.objects\n  for all to anon, authenticated\n  using (bucket_id = \'references\')\n  with check (bucket_id = \'references\');'
    const note = el('div', { id: 'storage-remote-note', style: { display: mode !== 'local' ? 'block' : 'none', fontSize: 12, lineHeight: 1.6, color: remoteReady ? '#6B7280' : '#dc2626', background: '#f8fafc', padding: '10px 12px', borderRadius: 8 } },
      remoteReady
        ? el('div', {},
            el('div', {}, '백엔드: Supabase Storage · 버킷: ' + StorageAdapter._bucket),
            el('div', { style: { marginTop: 4, color: '#6B7280' } }, 'Supabase 대시보드 → Storage에서 "' + StorageAdapter._bucket + '" 버킷을 생성하고, 아래 정책 SQL을 SQL Editor에서 실행하세요.'),
            el('button', { type: 'button', className: 'btn btn-secondary', style: { marginTop: 8, fontSize: 12, padding: '5px 10px' }, onClick: e => { navigator.clipboard.writeText(policySql).then(() => showToast('정책 SQL을 복사했습니다.')).catch(() => showToast('복사 실패', 'error')) } }, '정책 SQL 복사'),
            el('div', { style: { marginTop: 8, color: '#9CA3AF' } }, '업로드 400 오류 원인: ① 버킷 미생성 ② Storage 정책(RLS) 미설정 ③ 파일 크기 제한(기본 50MB) 초과 ④ 버킷 공개/비공개 설정 불일치')
          )
        : '⚠ supabase.js의 URL/anonKey가 placeholder입니다. 원격 저장을 사용하려면 실제 값을 설정하세요.')
    const form = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 } },
      el('p', { style: { margin: 0, color: '#6b7280' } }, '참고자료 원본 파일의 저장 위치를 선택합니다. DB·Markdown·메타데이터는 항상 Supabase에 저장됩니다.'),
      el('label', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        el('input', { type: 'radio', name: 'storagemode', value: 'local', checked: mode === 'local', onChange: e => { if (e.target.checked) document.getElementById('storage-remote-note').style.display = 'none' } }),
        el('span', {}, '로컬 저장 (IndexedDB · 이 브라우저에만 저장)')),
      el('label', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        el('input', { type: 'radio', name: 'storagemode', value: 'remote', checked: mode !== 'local', onChange: e => { if (e.target.checked) document.getElementById('storage-remote-note').style.display = 'block' } }),
        el('span', {}, '원격 저장 (Supabase Storage · 버킷: references)')),
      note
    )
    modal('⚙ 저장소 설정', form, [{
      label: '연결 테스트',
      className: 'btn btn-secondary',
      onClick: async () => {
        const sel = document.querySelector('input[name="storagemode"]:checked')?.value || 'local'
        StorageAdapter.setMode(sel)
        showLoading('연결 테스트 중...')
        try { const r = await StorageAdapter.testConnection(); showToast('연결 성공 (' + (r.mode === 'local' ? '로컬' : '원격') + ')') }
        catch (e) { showToast('연결 실패: ' + e.message, 'error') }
        finally { hideLoading() }
      }
    }])
    document.getElementById('modal-save').onclick = () => {
      const sel = document.querySelector('input[name="storagemode"]:checked')?.value || 'local'
      StorageAdapter.setMode(sel)
      closeModal()
      renderReferences()
      showToast('저장소: ' + (sel === 'local' ? '로컬' : '원격') + ' 모드로 설정되었습니다.')
    }
  }

  // ==================== 보고서 작성기 ====================
  let _writerDocId = null
  let _writerSectionId = null
  let _writerPreset = { tone: 'formal', length: 'normal', format: 'prose' }
  let _writerChat = []
  let _writerAutosaveTimer = null
  let _writerSkipFlush = false
  let _writerRte = null
  let _previewIndex = 0
  let _previewSectionId = null

  function _writerContentNow() {
    if (_writerRte) return _writerRte.getHTML()
    const ta = document.getElementById('writer-input')
    return ta ? ta.value : ''
  }

  function _sectionText(content) {
    if (!window.RichEditor) return content || ''
    return RichEditor.textFromBlocks(RichEditor.blocksFromHTML(content || ''))
  }

  function _flushWriterInput() {
    if (_writerSectionId == null) return
    Store.updateReportSection(_writerSectionId, { content: _writerContentNow() })
  }

  function renderWriter() {
    const c = document.getElementById('page-writer')
    if (!c) return
    if (!_writerSkipFlush) _flushWriterInput()
    _writerSkipFlush = false
    const docs = Store.getReportDocs().filter(d => Store.canSeeOwned('reportDocs', d))
    if (_writerDocId && !docs.find(d => d.id === _writerDocId)) _writerDocId = null
    if (!_writerDocId && docs.length) _writerDocId = docs[docs.length - 1].id
    const doc = _writerDocId ? Store.getReportDoc(_writerDocId) : null
    const sections = doc ? Store.getReportDocSections(doc.id).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)) : []
    if (_writerSectionId && !sections.find(s => s.id === _writerSectionId)) _writerSectionId = null
    if (!_writerSectionId && sections.length) _writerSectionId = sections[0].id

    c.innerHTML = ''
    c.append(el('div', { className: 'card' },
      el('div', { className: 'card-header' },
        el('h3', {}, '✍️ 보고서 작성기'),
        el('div', { className: 'writer-toolbar' },
          el('select', { className: 'select-sm', onChange: e => { _flushWriterInput(); _writerSkipFlush = true; _writerDocId = parseInt(e.target.value) || null; _writerSectionId = null; renderWriter() } },
            docs.length ? docs.map(d => el('option', { value: d.id, selected: d.id === _writerDocId }, d.title || '(제목 없음)')) : el('option', { value: '' }, '문서 없음')
          ),
          el('button', { className: 'btn btn-secondary', onClick: openImportDoc }, '📥 자료 불러오기'),
          el('button', { className: 'btn btn-primary', onClick: openNewReportDoc }, '＋ 새 보고서')
        )
      )
    ))

    if (!doc) {
      c.append(el('div', { className: 'card empty-state' },
        el('div', { className: 'empty-ico' }, '✍️'),
        el('h3', {}, '작성 중인 보고서가 없습니다'),
        el('p', {}, '새 보고서를 만들고 섹션을 추가해 원고를 작성하세요.')))
      return
    }

    const total = sections.length
    const written = sections.filter(s => _sectionText(s.content).trim()).length
    const progress = total ? Math.round(written / total * 100) : 0
    const refDocs = Reference.getAll().filter(d => Store.canSeeOwned('referenceDocs', d))
    const chunkCount = Store.getReferenceChunks().length
    c.append(el('div', { className: 'card' },
      el('div', { className: 'writer-summary' },
        el('div', { className: 'writer-title' },
          el('strong', {}, doc.title || '(제목 없음)'),
          el('span', { className: 'badge-ver' }, 'v' + (doc.version || 1))),
        el('div', { className: 'chip-row' },
          el('span', { className: 'chip chip-muted' }, `진도 ${progress}% · ${written}/${total} 섹션`),
          el('span', { className: 'chip chip-muted', title: '보고서 전체가 참고자료 색인을 RAG 방식으로 검색합니다' }, `📚 색인 ${refDocs.length}건 · ${chunkCount}청크`),
          el('button', { className: 'btn btn-sm btn-secondary', onClick: openWriterVersions }, '🗂 버전·되돌리기'),
          el('button', { className: 'btn btn-sm btn-secondary', onClick: exportWriterPptx }, '📤 PPTX'),
          el('button', { className: 'btn btn-sm btn-primary', onClick: saveWriterDoc }, '💾 저장(버전)'))),
      el('div', { className: 'progress-track' },
        el('div', { className: 'progress-fill', style: 'width:' + progress + '%' }))))

    const slides = _writerBuildSlides(doc, sections)
    if (_previewSectionId !== _writerSectionId || _previewIndex >= slides.length) {
      _previewIndex = _firstSlideForSection(slides, _writerSectionId)
      _previewSectionId = _writerSectionId
    }
    if (_previewIndex < 0) _previewIndex = 0

    const grid = el('div', { className: 'writer-grid' })
    grid.append(renderWriterPreview(doc, slides))

    const curIdx = sections.findIndex(s => String(s.id) === String(_writerSectionId))
    const main = el('div', { className: 'writer-main' },
      el('div', { className: 'writer-secbar' },
        el('button', { className: 'btn btn-sm btn-secondary', title: '이전 섹션', disabled: curIdx <= 0, onClick: () => _writerSelectSection(sections[Math.max(0, curIdx - 1)].id) }, '◀'),
        el('select', { className: 'select-sm', style: 'flex:1;min-width:160px', onChange: e => _writerSelectSection(isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)) },
          sections.length ? sections.map(s => el('option', { value: String(s.id), selected: s.id === _writerSectionId }, (s.title || '(제목 없음)') + (_sectionText(s.content).trim() ? '' : ' · 미작성'))) : el('option', { value: '' }, '섹션 없음')
        ),
        el('button', { className: 'btn btn-sm btn-secondary', title: '다음 섹션', disabled: curIdx < 0 || curIdx >= sections.length - 1, onClick: () => _writerSelectSection(sections[Math.min(sections.length - 1, curIdx + 1)].id) }, '▶'),
        el('button', { className: 'btn btn-sm btn-secondary', title: '위로 이동', disabled: curIdx <= 0, onClick: () => moveWriterSection(sections, curIdx, -1) }, '↑'),
        el('button', { className: 'btn btn-sm btn-secondary', title: '아래로 이동', disabled: curIdx < 0 || curIdx >= sections.length - 1, onClick: () => moveWriterSection(sections, curIdx, 1) }, '↓'),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => openAddSection(doc.id) }, '＋ 섹션')))
    main.append(renderWriterEditor(sections.find(s => s.id === _writerSectionId)))
    grid.append(main)
    c.append(grid)
    _mountWriterEditor(sections.find(s => s.id === _writerSectionId), document.getElementById('writer-input'))
  }

  function _writerBuildSlides(doc, sections) {
    const slides = [{ kind: 'cover', title: doc.title || '(제목 없음)', version: doc.version || 1 }]
    if (!sections.length) return slides
    slides.push({ kind: 'toc', titles: sections.map(s => s.title || '(제목 없음)') })
    sections.forEach(s => {
      const chunks = PptxExport._chunk(_sectionText(s.content).trim() || '(내용 없음)', 900)
      chunks.forEach((ck, ci) => slides.push({ kind: 'section', sectionId: s.id, title: s.title || '(제목 없음)', content: ck, part: ci + 1, parts: chunks.length }))
    })
    return slides
  }

  function _firstSlideForSection(slides, sectionId) {
    const i = slides.findIndex(s => s.sectionId != null && String(s.sectionId) === String(sectionId))
    return i < 0 ? 0 : i
  }

  function _writerSelectSection(sectionId) {
    if (sectionId == null || sectionId === '') return
    _flushWriterInput()
    _writerSkipFlush = true
    _writerSectionId = sectionId
    _previewSectionId = null
    renderWriter()
  }

  function moveWriterSection(sections, idx, delta) {
    const j = idx + delta
    if (idx < 0 || j < 0 || j >= sections.length) return
    const ids = sections.map(s => s.id)
    const tmp = ids[idx]; ids[idx] = ids[j]; ids[j] = tmp
    Store.setReportSectionOrder(ids)
    _writerSkipFlush = true
    _previewSectionId = null
    renderWriter()
  }

  function renderWriterPreview(doc, slides) {
    const slide = slides[_previewIndex] || slides[0] || { kind: 'cover' }
    const stage = el('div', { className: 'writer-preview-stage' })
    if (slide.kind === 'cover') {
      stage.append(el('div', { className: 'pv-slide pv-cover' },
        el('div', { className: 'pv-cover-top' },
          el('div', { className: 'pv-cover-title' }, slide.title),
          el('div', { className: 'pv-cover-sub' }, '지속가능경영보고서')),
        el('div', { className: 'pv-cover-line' }),
        el('div', { className: 'pv-cover-meta' }, '버전 v' + (slide.version || 1) + ' · ' + new Date().toLocaleDateString('ko-KR'))))
    } else if (slide.kind === 'toc') {
      stage.append(el('div', { className: 'pv-slide' },
        el('div', { className: 'pv-accent' }),
        el('div', { className: 'pv-title' }, '목차'),
        el('div', { className: 'pv-body' }, ...slide.titles.map((t, i) => el('div', { className: 'pv-toc-item' }, (i + 1) + '. ' + t)))))
    } else {
      stage.append(el('div', { className: 'pv-slide' },
        el('div', { className: 'pv-accent' }),
        el('div', { className: 'pv-sidebar' }),
        el('div', { className: 'pv-title' }, slide.title + (slide.part > 1 ? ' (계속)' : '')),
        el('div', { className: 'pv-body' }, slide.content),
        el('div', { className: 'pv-foot' }, 'v' + (doc.version || 1) + '  ·  ' + slide.part + '/' + slide.parts)))
    }

    const jump = el('select', { className: 'select-sm', style: 'max-width:220px', onChange: e => {
      const i = parseInt(e.target.value)
      if (!isNaN(i)) _writerPreviewNav(slides, i)
    } }, slides.map((s, i) => el('option', { value: String(i), selected: i === _previewIndex }, _writerSlideLabel(s, i))))

    return el('div', { className: 'card writer-preview' },
      el('div', { className: 'writer-preview-head' },
        el('strong', {}, '🖥 PPT 미리보기'),
        el('span', { className: 'writer-preview-page' }, (_previewIndex + 1) + ' / ' + slides.length)),
      stage,
      el('div', { className: 'writer-preview-nav' },
        el('button', { className: 'btn btn-sm btn-secondary', disabled: _previewIndex <= 0, onClick: () => _writerPreviewNav(slides, _previewIndex - 1) }, '◀ 이전'),
        jump,
        el('button', { className: 'btn btn-sm btn-secondary', disabled: _previewIndex >= slides.length - 1, onClick: () => _writerPreviewNav(slides, _previewIndex + 1) }, '다음 ▶')))
  }

  function _writerSlideLabel(s, i) {
    if (s.kind === 'cover') return (i + 1) + '. 표지'
    if (s.kind === 'toc') return (i + 1) + '. 목차'
    return (i + 1) + '. ' + s.title + (s.parts > 1 ? ' (' + s.part + ')' : '')
  }

  function _writerPreviewNav(slides, index) {
    const next = Math.max(0, Math.min(slides.length - 1, index))
    _previewIndex = next
    const slide = slides[next]
    if (slide && slide.sectionId != null && String(slide.sectionId) !== String(_writerSectionId)) {
      _flushWriterInput()
      _writerSkipFlush = true
      _writerSectionId = slide.sectionId
      _previewSectionId = slide.sectionId
    }
    renderWriter()
  }

  function _mountWriterEditor(section, ta) {
    const host = document.getElementById('writer-rte-host')
    if (!host || !section || !window.RichEditor) { _writerRte = null; return }
    const rte = new RichEditor.RichEditor({
      html: section.content || '',
      onChange: (html, blocks, text) => {
        ta.value = html
        const st = document.getElementById('writer-autosave')
        const cnt = document.getElementById('writer-count')
        if (cnt) cnt.textContent = RichEditor.stripTags(text).length + '자'
        if (st) st.textContent = '입력 중…'
        clearTimeout(_writerAutosaveTimer)
        _writerAutosaveTimer = setTimeout(() => {
          Store.updateReportSection(section.id, { content: html })
          const s2 = document.getElementById('writer-autosave')
          if (s2) s2.textContent = '자동 저장됨 ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        }, 1200)
      },
      onAI: (text, done) => {
        showLoading('블록 문장 다듬는 중...')
        AI.refineInline({ text, instruction: '', preset: _writerPreset }).then(res => {
          if (res.error) throw new Error(res.error)
          const t = (res.draft_text || '').trim()
          if (!t) throw new Error('AI 응답이 비어 있습니다.')
          done(t)
          showToast('블록을 다듬었습니다.')
        }).catch(e => showToast('다듬기 실패: ' + e.message, 'error')).finally(hideLoading)
      }
    })
    rte.mount(host)
    _writerRte = rte
  }

  function _fbKindLabel(kind) {
    const m = { direction: '진행방향', polish: '문구 다듬기', polish_full: 'AI 다듬기', compliance: '문체·컴플라이언스', coverage: 'GRI/ISSB 점검', continue: '이어쓰기' }
    return m[kind] || '제안'
  }

  function renderWriterEditor(section) {
    if (!section) return el('div', { className: 'card' }, el('p', { style: { color: 'var(--c-text-faint)', margin: 0 } }, '섹션을 선택하세요.'))
    _writerRte = null
    const ta = el('textarea', { id: 'writer-input', style: 'display:none' })
    ta.value = section.content || ''
    const contentNow = () => (_writerRte ? _writerRte.getHTML() : ta.value)
    const textNow = () => (_writerRte ? _writerRte.getText() : RichEditor.stripTags(ta.value))
    const all = Store.getFeedback(section.doc_id).filter(f => f.section_id === section.id)
    const proposals = all.filter(f => f.kind === 'polish_full').sort((a, b) => b.id - a.id)
    const feedback = all.filter(f => f.kind !== 'polish_full')
    const P = AI.WRITER_PRESETS

    const aiBtn = (label, fn) => el('button', { className: 'btn btn-sm btn-secondary wbtn', onClick: fn }, label)

    return el('div', { className: 'card writer-editor' },
      el('div', { className: 'writer-panel-head' },
        el('strong', {}, section.title || '(제목 없음)'),
        el('div', { className: 'chip-row' },
          el('span', { id: 'writer-autosave', className: 'writer-autosave' }, ''),
          el('span', { id: 'writer-count', className: 'writer-count' }, RichEditor.stripTags(section.content || '').length + '자'),
          el('button', { className: 'btn btn-sm btn-secondary', onClick: () => deleteWriterSection(section.id) }, '섹션 삭제'))),
      el('div', { className: 'writer-ai-tools' },
        aiBtn('🔎 전체 참고자료 근거', () => showWriterEvidence(section, textNow())),
        aiBtn('🤖 참조자료로 다듬기', () => runWriterPolish(section, textNow())),
        aiBtn('💬 AI 피드백', () => runWriterFeedback(section, textNow())),
        aiBtn('✨ 이어쓰기', () => runWriterContinue(section, textNow())),
        aiBtn('✂️ 선택 다듬기', () => runWriterInline(section)),
        aiBtn('🧭 GRI/ISSB 점검', () => runWriterCoverage(section, textNow())),
        aiBtn('🛡️ 문체·컴플라이언스', () => runWriterCompliance(section, textNow()))),
      el('div', { className: 'writer-preset-row' },
        el('span', { className: 'writer-preset-label' }, 'AI 프리셋'),
        el('select', { className: 'select-sm', onChange: e => { _writerPreset.tone = e.target.value } }, Object.keys(P.tone).map(k => el('option', { value: k, selected: _writerPreset.tone === k }, '문체·' + P.tone[k]))),
        el('select', { className: 'select-sm', onChange: e => { _writerPreset.length = e.target.value } }, Object.keys(P.length).map(k => el('option', { value: k, selected: _writerPreset.length === k }, '분량·' + P.length[k]))),
        el('select', { className: 'select-sm', onChange: e => { _writerPreset.format = e.target.value } }, Object.keys(P.format).map(k => el('option', { value: k, selected: _writerPreset.format === k }, '형식·' + P.format[k])))),
      el('div', { id: 'writer-rte-host', className: 'writer-rte-host' }),
      ta,
      el('div', { className: 'writer-card-footer' },
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { Store.updateReportSection(section.id, { content: contentNow() }); showToast('임시저장되었습니다.') } }, '📌 임시저장'),
        el('button', { className: 'btn btn-sm btn-primary', onClick: () => { Store.updateReportSection(section.id, { content: contentNow() }); saveWriterDoc() } }, '💾 저장 (버전)'),
        el('div', { style: { flex: 1 } }),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => openWriterAssistant(section, textNow()) }, '💡 AI 어시스턴트')),
      proposals.length ? el('div', { className: 'proposal' },
        el('div', { className: 'proposal-head' }, '🤖 AI 다듬기 제안 (' + proposals.length + ')'),
        proposals.map(p => {
          const open = p.status === 'open'
          const meta = (p.reference_title ? '근거: ' + p.reference_title + (p.page ? ' p.' + p.page : '') : '근거: 참고자료')
            + (p.confidence ? ' · 신뢰도 ' + p.confidence : '')
            + (p.missing && p.missing.length ? ' · 보완 필요: ' + p.missing.join(', ') : '')
          return el('div', { className: 'proposal-item' },
            el('div', { className: 'proposal-meta' }, meta),
            el('div', { className: 'proposal-grid' },
              el('div', {},
                el('div', { className: 'proposal-col-label orig' }, '원문'),
                el('div', { className: 'proposal-body orig' }, p.original || '(원문 없음)')),
              el('div', {},
                el('div', { className: 'proposal-col-label sugg' }, 'AI 제안'),
                el('div', { className: 'proposal-body sugg' }, p.suggestion || ''))),
            el('div', { className: 'proposal-actions' },
              el('button', { className: 'btn btn-sm btn-primary', disabled: !open, onClick: () => applyWriterPolish(section, p) }, p.status === 'applied' ? '✓ 적용됨' : '이 제안 적용'),
              el('button', { className: 'btn btn-sm btn-secondary', disabled: !open, onClick: () => { Store.updateFeedbackItem(p.id, { status: 'dismissed' }); renderWriter() } }, '무시')))
        })) : null,
      feedback.length ? el('div', { style: { marginTop: 16 } },
        el('div', { className: 'ai-section-label', style: { marginTop: 0 } }, '💬 AI 결과 (' + feedback.length + ')'),
        feedback.map(f => el('div', { className: 'fb-item' + (f.status === 'applied' ? ' is-applied' : f.status === 'dismissed' ? ' is-dismissed' : '') },
          el('div', { className: 'fb-meta' }, _fbKindLabel(f.kind) + (f.reference_title ? ' · 근거: ' + f.reference_title + (f.page ? ' p.' + f.page : '') : '')),
          el('div', { className: 'fb-msg' }, f.message),
          f.suggestion ? el('div', { className: 'fb-msg', style: { marginTop: 6, padding: 8, background: '#f0fdf6', borderRadius: 8 } }, f.suggestion) : null,
          el('div', { className: 'chip-row' },
            f.suggestion ? el('button', { className: 'btn btn-sm btn-primary', disabled: f.status !== 'open', onClick: () => { Store.updateReportSection(section.id, { content: f.suggestion }); Store.updateFeedbackItem(f.id, { status: 'applied' }); renderWriter(); showToast('반영했습니다.') } }, '내용에 반영') : null,
            el('button', { className: 'btn btn-sm btn-secondary', disabled: f.status !== 'open', onClick: () => { Store.updateFeedbackItem(f.id, { status: 'applied' }); renderWriter() } }, '확인'),
            el('button', { className: 'btn btn-sm btn-secondary', disabled: f.status !== 'open', onClick: () => { Store.updateFeedbackItem(f.id, { status: 'dismissed' }); renderWriter() } }, '무시')
          )))
      ) : null
    )
  }

  function showWriterEvidence(section, content) {
    const refs = findRefsForSection(section.title, content || section.content || '', 12)
    const refDocs = Reference.getAll().filter(d => Store.canSeeOwned('referenceDocs', d))
    if (!refDocs.length) { showToast('등록된 참고자료가 없습니다. [참고자료]에서 먼저 업로드하세요.', 'error'); return }
    const wrap = el('div', {},
      el('div', { style: { fontSize: 12, color: '#6b7280', marginBottom: 12, lineHeight: 1.7 } },
        '등록된 참고자료 ' + refDocs.length + '건 전체(색인 ' + Store.getReferenceChunks().length + '청크)를 RAG 방식으로 검색한 결과입니다. 특정 문서를 지정할 필요 없이 섹션 제목·본문과 가장 관련 있는 근거를 자동으로 찾습니다.'),
      refs.length
        ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, refs.map((r, i) =>
            el('div', { className: 'refpeek-item' },
              el('div', { className: 'refpeek-meta' }, '[' + (i + 1) + '] ' + (r.source_org || '') + ' ' + (r.title || '') + (r.page ? ' p.' + r.page : '') + (r.section_title ? ' · ' + r.section_title : '')),
              el('div', { className: 'refpeek-text' }, (r.content || '').slice(0, 700)))))
        : el('div', { style: { padding: 16, color: '#9ca3af', textAlign: 'center' } }, '이 섹션과 연관된 근거를 찾지 못했습니다. 내용을 더 작성하거나 참고자료를 추가하세요.'))
    modal('🔎 전체 참고자료 근거 — ' + (section.title || ''), wrap)
    const saveBtn = document.getElementById('modal-save')
    if (saveBtn) { saveBtn.textContent = '닫기'; saveBtn.onclick = () => closeModal() }
  }

  async function runWriterContinue(section, content) {
    _flushWriterInput()
    showLoading('AI가 이어서 작성 중...')
    try {
      const refs = findRefsForSection(section.title, content, 6)
      const chunks = refs.map(r => ({ reference_id: r.reference_id, page: r.page, section_title: r.section_title, content: r.content }))
      const res = await AI.continueDraft({ title: section.title, content, refChunks: chunks, preset: _writerPreset })
      if (res.error) throw new Error(res.error)
      const text = (res.draft_text || '').trim()
      if (!text) throw new Error('AI 응답이 비어 있습니다.')
      Store.addFeedbackItem({
        doc_id: section.doc_id, section_id: section.id, kind: 'continue',
        message: content.trim() ? '이어쓰기 제안' : '초안 제안', suggestion: text, original: content,
        reference_title: refs[0]?.title || '', page: refs[0]?.page || null, confidence: res.confidence || ''
      })
      showToast('이어쓰기 제안을 생성했습니다. 내용에 반영 여부를 선택하세요.')
    } catch (e) { showToast('이어쓰기 실패: ' + e.message, 'error') }
    finally { hideLoading(); renderWriter() }
  }

  async function runWriterInline(section) {
    let selected = ''
    if (_writerRte) {
      const b = _writerRte.blocks[_writerRte._active]
      selected = b ? RichEditor.blockText(b) : ''
    } else {
      const ta = document.getElementById('writer-input')
      selected = ta ? (ta.value || '') : (section.content || '')
    }
    if (!selected.trim()) { showToast('다듬을 블록(문단)을 먼저 선택하세요.', 'error'); return }
    showLoading('선택 문장 다듬는 중...')
    try {
      const res = await AI.refineInline({ text: selected, instruction: '', preset: _writerPreset })
      if (res.error) throw new Error(res.error)
      const text = (res.draft_text || '').trim()
      if (!text) throw new Error('AI 응답이 비어 있습니다.')
      Store.addFeedbackItem({ doc_id: section.doc_id, section_id: section.id, kind: 'polish', message: '선택 문장 다듬기', suggestion: text, original: selected })
      showToast('선택 문장 다듬기 제안을 생성했습니다.')
    } catch (err) { showToast('다듬기 실패: ' + err.message, 'error') }
    finally { hideLoading(); renderWriter() }
  }

  async function runWriterCompliance(section, content) {
    if (!content.trim()) { showToast('내용을 먼저 작성하세요.', 'error'); return }
    showLoading('문체·컴플라이언스 점검 중...')
    try {
      const res = await AI.complianceCheck({ text: content })
      if (res.error) throw new Error(res.error)
      const issues = res.issues || []
      const msg = issues.length
        ? issues.map(i => '· [' + i.type + '/' + i.severity + '] "' + (i.quote || '') + '"\n  ' + (i.message || '') + (i.suggestion ? '\n  → ' + i.suggestion : '')).join('\n')
        : (res.summary || '특이사항 없음')
      Store.addFeedbackItem({ doc_id: section.doc_id, section_id: section.id, kind: 'compliance', message: (res.summary ? res.summary + '\n' : '') + msg })
      showToast(issues.length ? issues.length + '건의 점검 항목을 찾았습니다.' : '특이사항이 없습니다.')
    } catch (e) { showToast('점검 실패: ' + e.message, 'error') }
    finally { hideLoading(); renderWriter() }
  }

  async function runWriterCoverage(section, content) {
    showLoading('GRI/ISSB 커버리지 점검 중...')
    try {
      const res = await AI.coverageCheck({ title: section.title, content })
      if (res.error) throw new Error(res.error)
      const covered = (res.covered || []).map(c => c.standard + ' ' + (c.label || '')).join(', ')
      const gaps = (res.gaps || []).map(g => '· ' + g.standard + ' ' + (g.label || '') + (g.hint ? ' — ' + g.hint : '')).join('\n')
      const msg = (covered ? '충족: ' + covered + '\n' : '') + (gaps ? '보완 필요:\n' + gaps : '') + (res.summary ? '\n' + res.summary : '')
      Store.addFeedbackItem({ doc_id: section.doc_id, section_id: section.id, kind: 'coverage', message: msg || '분석 결과가 없습니다.' })
      showToast((res.gaps || []).length ? (res.gaps.length + '건의 보완 항목이 있습니다.') : '커버리지 점검 완료.')
    } catch (e) { showToast('점검 실패: ' + e.message, 'error') }
    finally { hideLoading(); renderWriter() }
  }

  function _lineDiff(a, b) {
    const la = (a || '').split('\n'), lb = (b || '').split('\n')
    const n = Math.max(la.length, lb.length)
    const out = []
    for (let i = 0; i < n; i++) {
      const x = la[i], y = lb[i]
      if (x === y) out.push({ type: 'same', text: x == null ? '' : x })
      else { if (x != null) out.push({ type: 'del', text: x }); if (y != null) out.push({ type: 'add', text: y }) }
    }
    return out
  }

  function openWriterVersions() {
    const doc = _writerDocId ? Store.getReportDoc(_writerDocId) : null
    if (!doc) { showToast('문서가 없습니다.', 'error'); return }
    const versions = Store.getReportDocVersions(doc.id)
    const cur = doc.version || 1
    if (!versions.length) { showToast('저장된 버전이 없습니다. (저장(버전)을 실행하세요)', 'error'); return }
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      versions.map(v => el('div', { className: 'ver-item' },
        el('div', { className: 'ver-head' },
          el('strong', {}, 'v' + v.version),
          el('span', { className: 'ver-meta' }, (v.note || v.title || '') + ' · ' + (v.section_count || 0) + '섹션 · ' + (v.created_at ? new Date(v.created_at).toLocaleString('ko-KR') : '') + (v.version === cur ? ' · 현재' : '')),
        el('div', { className: 'chip-row' },
          el('button', { className: 'btn btn-sm btn-secondary', disabled: !v.snapshot || v.version === cur, onClick: () => showVersionDiff(doc, v) }, '현재와 비교'),
          el('button', { className: 'btn btn-sm btn-primary', disabled: !v.snapshot || v.version === cur, onClick: () => {
            if (!confirm('v' + v.version + ' 내용으로 되돌릴까요? 현재 내용은 덮어써집니다.')) return
            Store.restoreReportDocVersion(doc.id, v.version)
            closeModal(); renderWriter(); showToast('v' + v.version + '으로 되돌렸습니다.')
          } }, '이 버전으로 되돌리기'))))))
    modal('🗂 버전 이력 — ' + (doc.title || ''), body)
    const saveBtn = document.getElementById('modal-save')
    saveBtn.textContent = '닫기'
    saveBtn.onclick = () => closeModal()
  }

  function showVersionDiff(doc, v) {
    const cur = Store.snapshotReportDoc(doc.id)
    const snap = v.snapshot || []
    const byTitle = (arr) => { const m = {}; arr.forEach(s => { (m[s.title] = m[s.title] || []).push(_sectionText(s.content)) }); return m }
    const cm = byTitle(cur), sm = byTitle(snap)
    const titles = [...new Set([...Object.keys(sm), ...Object.keys(cm)])]
    const wrap = el('div', {}, titles.map(t => {
      const before = (sm[t] || []).join('\n'), after = (cm[t] || []).join('\n')
      if (before === after) return null
      return el('div', { style: { marginBottom: 14 } },
        el('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 6 } }, t),
        el('div', { className: 'diff-body' }, _lineDiff(before, after).map(l => el('div', { className: 'diff-line ' + l.type }, (l.type === 'add' ? '+ ' : l.type === 'del' ? '- ' : '  ') + l.text))))
    }).filter(Boolean))
    if (!wrap.childNodes.length) wrap.append(el('div', { style: { color: '#6b7280', fontSize: 13 } }, 'v' + v.version + '와 현재 내용이 동일합니다.'))
    modal('변경 비교 — v' + v.version + ' → 현재', wrap)
    const saveBtn = document.getElementById('modal-save')
    saveBtn.textContent = '닫기'
    saveBtn.onclick = () => closeModal()
  }

  function openWriterAssistant(section, content) {
    const existing = document.getElementById('writer-assistant')
    if (existing) existing.remove()
    const log = el('div', { className: 'assistant-log' })
    const paint = () => {
      log.innerHTML = ''
      if (!_writerChat.length) log.append(el('div', { className: 'assistant-hint' }, '현재 섹션에 대해 질문하거나 "더 전문적으로 다시 써줘"처럼 요청하세요.'))
      _writerChat.forEach(m => log.append(el('div', { className: 'assistant-msg ' + m.role }, m.content)))
      log.scrollTop = log.scrollHeight
    }
    const input = el('textarea', { className: 'assistant-input', placeholder: '예: 이 문단을 더 간결하게 다듬어줘', rows: 2 })
    const send = async () => {
      const text = input.value.trim()
      if (!text) return
      input.value = ''
      _writerChat.push({ role: 'user', content: text })
      paint()
      showLoading('AI 응답 생성 중...')
      try {
        const res = await AI.chat({ messages: _writerChat.map(m => ({ role: m.role, content: m.content })), context: { title: section.title, content: section.content || content } })
        _writerChat.push({ role: 'assistant', content: res.error ? ('오류: ' + res.error) : res.reply })
      } catch (e) { _writerChat.push({ role: 'assistant', content: '오류: ' + e.message }) }
      finally { hideLoading(); paint() }
    }
    const panel = el('div', { id: 'writer-assistant', className: 'writer-assistant' },
      el('div', { className: 'assistant-head' },
        el('strong', {}, '💡 AI 어시스턴트'),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => panel.remove() }, '닫기')),
      log,
      el('div', { className: 'assistant-foot' },
        input,
        el('button', { className: 'btn btn-sm btn-primary', onClick: send }, '전송')))
    document.body.append(panel)
    paint()
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } })
  }

  function openNewReportDoc() {
    const refs = Reference.getAll().filter(d => Store.canSeeOwned('referenceDocs', d))
    const docs = Store.getReportDocs().filter(d => Store.canSeeOwned('reportDocs', d))
    const state = { start: 'new', src: 'report' }

    const titleInput = el('input', { id: 'rd-title', type: 'text', placeholder: '예: 2025 지속가능경영보고서', style: { padding: '10px 12px', border: '1px solid #e4e7eb', borderRadius: 8, fontSize: 14, width: '100%' } })
    const sectionsArea = el('textarea', { id: 'rd-sections', style: { minHeight: 120, padding: 10, border: '1px solid #e4e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', width: '100%' } }, 'CEO 메시지\n지속가능경영 개요\n환경 성과\n사회 성과\n지배구조\n이해관계자 참여\nGRI 부록')

    const srcDocSelect = docs.length
      ? el('select', { id: 'rd-src-doc', style: { padding: '9px 10px', border: '1px solid #e4e7eb', borderRadius: 8, fontSize: 13, width: '100%' } }, docs.map(d => el('option', { value: String(d.id) }, d.title || '(제목 없음)')))
      : null

    const refList = refs.length
      ? el('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 170, overflow: 'auto' } },
          refs.map(d => el('label', { className: 'rd-ref-item' },
            el('input', { type: 'checkbox', className: 'rd-ref', value: String(d.id) }),
            el('span', { className: 'rd-ref-title' }, d.title || d.file_name || '(제목 없음)'),
            el('span', { className: 'rd-ref-meta' }, d.page_count ? d.page_count + 'p' : (Reference.statusLabel ? Reference.statusLabel(d.status) : '')))))
      : el('div', { className: 'rd-empty' }, '등록된 참고자료가 없습니다. 먼저 참고자료를 업로드하세요.')

    const startOptions = el('div', { className: 'rd-opts' })
    const srcOptions = el('div', { className: 'rd-opts rd-opts-sm' })
    const dynamic = el('div', { style: { marginTop: 10 } })

    const card = (icon, title, desc, active, onClick) => el('div', { className: 'rd-opt' + (active ? ' selected' : ''), onClick },
      el('div', { className: 'rd-opt-ico' }, icon),
      el('div', {}, el('div', { className: 'rd-opt-title' }, title), el('div', { className: 'rd-opt-desc' }, desc)))

    const paint = () => {
      startOptions.innerHTML = ''
      startOptions.append(
        card('📝', '처음부터 새로 작성', '빈 섹션으로 시작합니다', state.start === 'new', () => { state.start = 'new'; paint() }),
        card('📥', '기존 자료 불러와서', '이전 보고서·참고자료로 시작', state.start === 'src', () => { state.start = 'src'; paint() }))

      dynamic.innerHTML = ''
      if (state.start === 'new') {
        dynamic.append(el('div', { className: 'rd-field-label' }, '초기 섹션 (줄바꿈으로 구분)'), sectionsArea)
      } else {
        srcOptions.innerHTML = ''
        srcOptions.append(
          card('🗂️', '이전 보고서 복사', '작성했던 문서의 섹션 구조·내용', state.src === 'report', () => { state.src = 'report'; paint() }),
          card('📚', '참고자료에서 불러오기', '등록한 문서를 섹션으로', state.src === 'ref', () => { state.src = 'ref'; paint() }))
        dynamic.append(el('div', { className: 'rd-field-label' }, '불러올 자료 종류'), srcOptions)
        if (state.src === 'report') {
          dynamic.append(
            el('div', { className: 'rd-field-label', style: { marginTop: 12 } }, '복사할 이전 보고서'),
            srcDocSelect || el('div', { className: 'rd-empty' }, '복사할 이전 보고서가 없습니다.'),
            el('label', { className: 'rd-ref-item', style: { marginTop: 8 } },
              el('input', { type: 'checkbox', id: 'rd-src-content' }), el('span', {}, '섹션 본문(내용)까지 함께 복사')))
        } else {
          dynamic.append(
            el('div', { className: 'rd-field-label', style: { marginTop: 12 } }, '불러올 참고자료 (문서 1개 = 섹션 1개)'),
            refList,
            el('label', { className: 'rd-ref-item', style: { marginTop: 8 } },
              el('input', { type: 'checkbox', id: 'rd-ref-content', checked: true }), el('span', {}, '문서 본문을 섹션 내용으로 채우기')))
        }
      }
    }
    paint()

    const form = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 } },
      el('div', {}, el('div', { className: 'rd-field-label' }, '보고서 제목'), titleInput),
      el('div', {}, el('div', { className: 'rd-field-label' }, '시작 방식'), startOptions),
      dynamic)
    modal('새 보고서', form)
    document.getElementById('modal-save').onclick = () => {
      const title = titleInput.value.trim() || '제목 없는 보고서'
      const doc = Store.addReportDoc({ title, owner_id: currentUser?.id ?? null })
      if (state.start === 'new') {
        sectionsArea.value.split('\n').map(s => s.trim()).filter(Boolean).forEach(t => Store.addReportSection({ doc_id: doc.id, title: t, content: '' }))
      } else if (state.src === 'report') {
        const srcId = srcDocSelect ? srcDocSelect.value : null
        const withContent = document.getElementById('rd-src-content')?.checked
        const srcSections = srcId != null ? Store.getReportDocSections(isNaN(Number(srcId)) ? srcId : Number(srcId)) : []
        srcSections.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach(s => Store.addReportSection({ doc_id: doc.id, title: s.title, content: withContent ? (s.content || '') : '' }))
      } else {
        const all = Store.getReferenceDocs()
        const ids = [...document.querySelectorAll('.rd-ref:checked')].map(c => c.value)
        const withContent = document.getElementById('rd-ref-content')?.checked
        ids.forEach(id => { const r = all.find(d => String(d.id) === String(id)); if (r) Store.addReportSection({ doc_id: doc.id, title: (r.title || r.file_name || '(제목 없음)'), content: withContent ? (r.markdown || '') : '' }) })
      }
      _writerDocId = doc.id; _writerSectionId = null
      closeModal(); renderWriter(); showToast('보고서가 생성되었습니다.')
    }
  }

  function openAddSection(docId) {
    const form = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
      el('label', {}, '섹션 제목 (여러 줄 입력 시 일괄 추가)'),
      el('textarea', { id: 'rd-add-sections', style: { minHeight: 100, padding: 10, border: '1px solid #e4e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }, placeholder: '예: 기후변화 대응\n생물다양성' })
    )
    modal('섹션 추가', form)
    document.getElementById('modal-save').onclick = () => {
      const lines = document.getElementById('rd-add-sections').value.split('\n').map(s => s.trim()).filter(Boolean)
      if (!lines.length) { showToast('섹션 제목을 입력하세요.', 'error'); return }
      lines.forEach(t => Store.addReportSection({ doc_id: docId, title: t, content: '' }))
      closeModal(); renderWriter(); showToast(lines.length + '개 섹션을 추가했습니다.')
    }
  }

  function deleteWriterSection(id) {
    if (!confirm('이 섹션을 삭제할까요?')) return
    Store.deleteReportSection(id)
    _writerSectionId = null
    renderWriter()
  }

  async function runWriterFeedback(section, content) {
    if (!content.trim()) { showToast('내용을 먼저 작성하세요.', 'error'); return }
    _flushWriterInput()
    showLoading('참고자료와 대비하여 분석 중...')
    try {
      const refs = Reference.search(section.title || '', 5)
      const refText = refs.map((r, i) => `[${i + 1}] ${r.source_org || ''} ${r.title || ''} p.${r.page || '-'}: ${(r.snippet || '').trim()}`).join('\n')
      const messages = [
        { role: 'system', content: '너는 지속가능경영보고서 작성 코치다. 작성 중인 섹션 원고를 참고자료와 대비하여 진행방향(direction)과 문구 다듬기(polish) 제안을 JSON으로만 답하라. 형식: {"feedback":[{"kind":"direction|polish","message":"...", "suggestion":"..."}]}' },
        { role: 'user', content: `섹션: ${section.title}\n\n원고:\n${content}\n\n참고자료 발췌:\n${refText || '(없음)'}\n\n위 원고에서 빠진 필수 항목과 개선할 표현을 각각 제안하라.` }
      ]
      const raw = await AI._callAI(messages)
      let parsed = AI._safeParseJson(raw)
      const items = (parsed && parsed.feedback) || []
      if (!items.length) {
        items.push({ kind: 'direction', message: '참고자료와 대비할 근거가 부족합니다. 참고자료를 먼저 등록하세요.' })
      }
      items.forEach(it => Store.addFeedbackItem({ doc_id: section.doc_id, section_id: section.id, kind: it.kind || 'suggestion', message: it.message || it.suggestion || '', suggestion: it.suggestion || '', reference_title: refs[0]?.title || '', page: refs[0]?.page || null }))
      showToast(items.length + '건의 피드백을 받았습니다.')
    } catch (e) {
      showToast('피드백 실패: ' + e.message, 'error')
    } finally {
      hideLoading(); renderWriter()
    }
  }

  function findRefsForSection(title, draft, limit) {
    const stop = { '그리고': 1, '있습니다': 1, '합니다': 1, '대한': 1, '위해': 1, '통해': 1, '있는': 1, '하는': 1, '되는': 1, '으로': 1, '에서': 1, '하여': 1, '대해': 1, '또한': 1 }
    const terms = []
    const push = t => { const s = String(t || '').trim(); if (s.length >= 2 && !stop[s] && terms.indexOf(s) < 0) terms.push(s) }
    String(title || '').split(/[^0-9A-Za-z가-힣]+/).forEach(push)
    String(draft || '').split(/[^0-9A-Za-z가-힣]+/).slice(0, 150).forEach(push)
    if (!terms.length && title) terms.push(title)
    return Reference.searchTerms(terms.slice(0, 24), limit || 6)
  }

  async function runWriterPolish(section, draft) {
    const content = (draft != null ? draft : section.content || '').trim()
    if (!content) { showToast('내용을 먼저 작성하거나 자료를 불러오세요.', 'error'); return }
    showLoading('참고자료에서 근거를 찾아 다듬는 중...')
    try {
      _flushWriterInput()
      const refs = findRefsForSection(section.title, content, 6)
      const chunks = refs.map(r => ({ reference_id: r.reference_id, page: r.page, section_title: r.section_title, content: r.content }))
      const res = await AI.refineReportItem({ title: section.title, draft: content.slice(0, 4000), refChunks: chunks })
      if (res.error) throw new Error(res.error)
      const text = (res.draft_text || '').trim()
      if (!text) throw new Error('AI 응답이 비어 있습니다.')
      Store.addFeedbackItem({
        doc_id: section.doc_id, section_id: section.id, kind: 'polish_full',
        message: 'AI 다듬기 제안', suggestion: text, original: content,
        reference_title: refs[0]?.title || '', page: refs[0]?.page || null,
        confidence: res.confidence || '', missing: res.missing_pillars || []
      })
      showToast(refs.length ? refs.length + '개 참고 근거로 제안을 생성했습니다.' : '참고 근거 없이 일반 다듬기 제안을 생성했습니다.')
    } catch (e) {
      showToast('AI 다듬기 실패: ' + e.message, 'error')
    } finally {
      hideLoading(); renderWriter()
    }
  }

  function applyWriterPolish(section, item) {
    Store.updateReportSection(section.id, { content: item.suggestion || '' })
    Store.updateFeedbackItem(item.id, { status: 'applied' })
    renderWriter()
    showToast('제안을 반영했습니다.')
  }

  function _splitDocIntoItems(result) {
    const raw = (result && result.markdown) || ''
    const md = raw.replace(/^[ \t]*\[?page\s*[: ]?\d+\]?[ \t]*$/gim, '').replace(/\n{3,}/g, '\n\n').trim()
    if (!md) return []
    const hasHeading = /^#{1,6}\s/m.test(md)
    const items = []
    if (hasHeading) {
      let cur = null
      const flush = () => { if (cur && (cur.title || cur.lines.join('').trim())) items.push({ title: cur.title, content: cur.lines.join('\n').trim() }) }
      md.split('\n').forEach(line => {
        if (/^#{1,6}\s/.test(line)) { flush(); cur = { title: line.replace(/^#{1,6}\s*/, '').trim(), lines: [] } }
        else { if (!cur) cur = { title: '', lines: [] }; cur.lines.push(line) }
      })
      flush()
    } else {
      md.split(/\n{2,}/).map(s => s.trim()).filter(Boolean).forEach((p, i) => {
        const first = p.split('\n')[0].trim()
        items.push({ title: first.length <= 40 ? first : ('항목 ' + (i + 1)), content: p })
      })
    }
    return items.map((it, i) => ({ title: (it.title || ('항목 ' + (i + 1))).slice(0, 80), content: it.content }))
  }

  function openImportDoc() {
    const titleInput = el('input', { type: 'text', style: { padding: '10px 12px', border: '1px solid #e4e7eb', borderRadius: 8, fontSize: 14, width: '100%' }, placeholder: '예: 2025 지속가능경영보고서' })
    const fileInput = el('input', { type: 'file', accept: '.docx,.pptx,.pdf,.txt,.md,.csv,.json', style: { fontSize: 13 } })
    const status = el('div', { style: { fontSize: 12, color: '#6b7280', minHeight: 18 } })
    const form = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      el('div', {}, el('div', { className: 'rd-field-label' }, '보고서 제목'), titleInput),
      el('div', {}, el('div', { className: 'rd-field-label' }, '작성 중인 자료 업로드 (docx / pptx / pdf / txt / md)'), fileInput),
      el('div', { style: { fontSize: 12, color: '#9ca3af', lineHeight: 1.6 } }, '업로드한 문서를 항목(제목·헤딩)별로 나누어 섹션으로 만듭니다. 구형 .doc / .ppt는 지원되지 않으니 .docx / .pptx로 저장한 뒤 올려주세요. 변환·처리는 브라우저에서 이뤄지며, 각 항목은 참고자료로 다듬을 수 있습니다.'),
      status)
    modal('📥 기존 자료 불러오기', form)
    document.getElementById('modal-save').textContent = '불러오기'
    document.getElementById('modal-save').onclick = async () => {
      const f = fileInput.files && fileInput.files[0]
      if (!f) { showToast('파일을 선택하세요.', 'error'); return }
      const title = titleInput.value.trim() || f.name.replace(/\.[^.]+$/, '')
      status.textContent = '문서 변환 중...'; showLoading('문서 변환 중...')
      try {
        const result = await MdConvert.convertLocal(f)
        const items = _splitDocIntoItems(result)
        if (!items.length) throw new Error('문서에서 내용을 추출하지 못했습니다.')
        const doc = Store.addReportDoc({ title, status: 'draft', progress: 0, version: 1, source_file: f.name, source_type: Reference.detectType(f.name), owner_id: currentUser?.id ?? null })
        items.forEach((it, i) => Store.addReportSection({ doc_id: doc.id, title: it.title, content: it.content, sort_order: i, status: it.content ? 'draft' : 'empty' }))
        Store.addReportDocVersion(doc.id, { version: 1, title, section_count: items.length, note: '자료 불러오기 (' + f.name + ')', snapshot: Store.snapshotReportDoc(doc.id) })
        _writerDocId = doc.id; _writerSectionId = null
        closeModal(); renderWriter()
        showToast(items.length + '개 항목을 불러왔습니다. 각 항목에서 "참고자료로 다듬기"를 실행하세요.')
      } catch (e) {
        status.textContent = '오류: ' + e.message
        showToast('불러오기 실패: ' + e.message, 'error')
      } finally { hideLoading() }
    }
  }

  function _collectWriterSections(docId) {
    const ta = document.getElementById('writer-input')
    if (ta && _writerSectionId) Store.updateReportSection(_writerSectionId, { content: ta.value })
    return Store.getReportDocSections(docId).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  }

  function _writerProgress(sections) {
    const written = sections.filter(s => _sectionText(s.content).trim()).length
    return sections.length ? Math.round(written / sections.length * 100) : 0
  }

  async function exportWriterPptx() {
    const doc = _writerDocId ? Store.getReportDoc(_writerDocId) : null
    if (!doc) { showToast('문서가 없습니다.', 'error'); return }
    const sections = _collectWriterSections(doc.id)
    showLoading('PPTX 생성 중...')
    try {
      const fn = await PptxExport.export(doc, sections, { version: doc.version || 1 })
      hideLoading()
      showToast(fn + ' 을(를) 내려받았습니다.')
    } catch (e) {
      hideLoading(); showToast('PPTX 생성 실패: ' + e.message, 'error')
    }
  }

  async function saveWriterDoc() {
    const doc = _writerDocId ? Store.getReportDoc(_writerDocId) : null
    if (!doc) { showToast('문서가 없습니다.', 'error'); return }
    const sections = _collectWriterSections(doc.id)
    if (!sections.length) { showToast('저장할 섹션이 없습니다.', 'error'); return }
    const nextVersion = (doc.version || 1) + 1
    Store.updateReportDoc(doc.id, { version: nextVersion, progress: _writerProgress(sections), status: 'draft' })
    Store.addReportDocVersion(doc.id, { version: nextVersion, title: doc.title, section_count: sections.length, note: '', snapshot: Store.snapshotReportDoc(doc.id) })
    showLoading('v' + nextVersion + ' 저장 중 · PPTX 생성...')
    let fn = null
    try { fn = await PptxExport.export({ ...doc, version: nextVersion }, sections, { version: nextVersion }) }
    catch (e) { hideLoading(); renderWriter(); showToast('v' + nextVersion + ' 저장됨 · PPTX 생성 실패: ' + e.message, 'error'); return }
    hideLoading(); renderWriter()
    showToast('v' + nextVersion + ' 버전으로 저장하고 ' + fn + ' 을(를) 내려받았습니다.')
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
          el('p', { style: 'margin:0 0 16px;color:#9ca3af;font-size:13px' }, '지표 ↔ 증빙 연결을 위해 먼저 평가를 생성하세요.'),
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
      el('div', { className: 'card-header', style: 'display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef1f4;background:#fff;border-radius:12px 12px 0 0' },
        el('h3', { style: 'margin:0;font-size:16px' }, '📝 보고서 편집기'),
        el('div', { style: 'display:flex;gap:8px;align-items:center' },
          el('select', { style: 'padding:6px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px', onChange: () => { _editorAssId = parseInt(document.getElementById('editorAssSelect')?.value || document.querySelector('.card-header select')?.value); _editorSelectedIndicator = null; renderReportEditor() } },
            ...assessments.map(a => el('option', { value: a.id, selected: a.id === _editorAssId }, `${a.title} (${a.assessment_year}년)`))
          )
        )
      ),
      el('div', { style: 'padding:12px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4' },
        el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:6px' },
          el('div', { style: 'flex:1;background:#eef1f4;height:8px;border-radius:4px;overflow:hidden' },
            el('div', { style: `background:#1E3A5F;height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s` })
          ),
          el('span', { style: 'font-size:12px;font-weight:600;color:#1E3A5F' }, `${pct}%`)
        ),
        el('div', { style: 'display:flex;gap:16px;font-size:12px;color:#6b7280' },
          el('span', {}, `연결 완료: ${linked.length}건`),
          el('span', {}, `미연결: ${unlinked.length}건`),
          el('span', {}, `증빙: ${evidences.length}건`)
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:320px 1fr;gap:0;min-height:500px' },
        el('div', { style: 'border-right:1px solid #eef1f4;overflow-y:auto;max-height:600px' },
          el('div', { style: 'padding:8px 16px;background:#F8FAFC;border-bottom:1px solid #eef1f4;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px' }, `전체 지표 (${allIndicators.length}개)`),
          ...allIndicators.map(ind => {
            const tags = allTags.filter(t => t.indicator_id === ind.id)
            const isSelected = _editorSelectedIndicator === ind.id
            const hasLink = tags.length > 0
            return el('div', {
              style: `padding:10px 16px;border-bottom:1px solid #F8FAFC;cursor:pointer;transition:background 0.15s;border-left:3px solid ${isSelected ? '#1E3A5F' : hasLink ? '#047857' : 'transparent'}`,
              onClick: () => { _editorSelectedIndicator = ind.id; renderReportEditor() },
              onMouseEnter: e => { if (!isSelected) e.currentTarget.style.background = '#F8FAFC' },
              onMouseLeave: e => { if (!isSelected) e.currentTarget.style.background = '' }
            },
              el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
                el('span', { style: `font-weight:500;font-size:12px;color:${hasLink ? '#1F2937' : '#9CA3AF'}` }, Indicator.getNameAndCode(ind)),
                hasLink ? el('span', { style: 'background:#047857;color:#fff;font-size:10px;padding:1px 6px;border-radius:99px' }, `${tags.length}건`) : el('span', { style: 'background:#eef1f4;color:#9CA3AF;font-size:10px;padding:1px 6px;border-radius:99px' }, '미연결')
              ),
              el('div', { style: 'font-size:10px;color:#9CA3AF;margin-top:2px' }, Indicator.getPillarName(ind.pillar))
            )
          })
        ),
        el('div', { style: 'overflow-y:auto;max-height:600px;padding:16px' },
          _editorSelectedIndicator ? renderEditorDetail(_editorSelectedIndicator, evidences) : el('div', { style: 'text-align:center;padding:60px 20px;color:#9CA3AF' },
            el('div', { style: { fontSize: '32px', marginBottom: '8px' } }, '👈'),
            el('div', { style: { fontSize: '13px' } }, '왼쪽에서 지표를 선택하세요'),
            el('div', { style: { fontSize: '11px', color: '#9CA3AF', marginTop: '4px' } }, '각 지표에 증빙을 연결하여 보고서를 구성합니다')
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
        return el('div', { style: 'margin-bottom:16px;padding:12px;background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;border-left:3px solid #D97706' },
          el('div', { style: 'font-weight:600;font-size:13px;color:#D97706' }, '📊 Scope2 분할 필요 지표 — GHG 요약 자동 인용'),
          el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:4px' }, '이 지표는 Scope 2의 위치기준·시장기준 분할이 필요합니다.'),
          el('pre', { style: 'margin:8px 0 0;padding:8px;background:#fff;border-radius:4px;font-size:12px;white-space:pre-wrap' }, GHG.formatSummary(summary))
        )
      } else {
        return el('div', { style: 'margin-bottom:16px;padding:12px;background:#fff2f0;border:1px solid #ffccc7;border-radius:8px;border-left:3px solid #DC2626' },
          el('div', { style: 'font-weight:600;font-size:13px;color:#DC2626' }, '⚠️ Scope2 분할 필요 지표 — GHG 데이터 없음'),
          el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:4px' }, '이 지표는 Scope 2 위치기준·시장기준 분할이 필요하지만, GHG 활동자료가 없습니다.'),
          el('div', { style: 'font-size:12px;color:#DC2626;margin-top:4px;font-weight:500' }, '온실가스 관리(S-04)에서 활동자료를 먼저 등록해주세요. 미등록 시 승인이 차단됩니다.')
        )
      }
    })() : null

    container.append(
      el('div', { style: 'margin-bottom:16px;padding:12px;background:#F8FAFC;border-radius:8px;border-left:3px solid #1E3A5F' },
        el('div', { style: 'font-weight:600;font-size:14px' }, Indicator.getNameAndCode(indicator)),
        el('div', { style: 'font-size:12px;color:#6b7280;margin-top:4px' }, `${Indicator.getPillarName(indicator.pillar)} | 담당: ${indicator.dept_code || '미지정'} | 주기: ${indicator.review_cycle || '-'}`),
        el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:4px' }, `연결된 증빙: ${linkedEvidences.length}건`)
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
        el('h4', { style: 'font-size:13px;margin-bottom:8px;color:#047857' }, `✅ 연결된 증빙 (${linkedEvidences.length}건)` ),
        linkedEvidences.length ? el('div', {}, ...linkedEvidences.map(ev =>
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f0fff4;border:1px solid #c6f6d5;border-radius:6px;margin-bottom:6px' },
            el('div', {},
              el('div', { style: 'font-weight:500;font-size:13px' }, ev.title),
              el('div', { style: 'font-size:11px;color:#9ca3af' }, `${ev.file_type} | ${Evidence.getStatusLabel(ev.status)}${ev.contains_sensitive_data ? ' | 🔒 민감정보' : ''}`)
            ),
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => {
              Store.removeEvidenceTag(ev.id, indicatorId)
              renderReportEditor()
            }}, '해제')
          )
        )) : el('div', { style: 'padding:12px;color:#9CA3AF;font-size:12px;text-align:center;background:#F8FAFC;border-radius:6px' }, '연결된 증빙이 없습니다. 아래에서 연결하세요.')
      ),
      el('div', { style: 'margin-bottom:16px' },
        el('h4', { style: 'font-size:13px;margin-bottom:8px;color:#6b7280' }, `📎 연결 가능한 증빙 (${unlinkedEvidences.length}건)`),
        unlinkedEvidences.length ? el('div', {}, ...unlinkedEvidences.map(ev =>
          el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fff;border:1px solid #eef1f4;border-radius:6px;margin-bottom:6px' },
            el('div', {},
              el('div', { style: 'font-weight:500;font-size:13px' }, ev.title),
              el('div', { style: 'font-size:11px;color:#9ca3af' }, `${ev.file_type} | ${Evidence.getStatusLabel(ev.status)}${ev.contains_sensitive_data ? ' | 🔒 민감정보' : ''}`)
            ),
            el('button', { className: 'btn btn-sm btn-primary', onClick: () => {
              Store.addEvidenceTag({ evidence_id: ev.id, indicator_id: indicatorId })
              renderReportEditor()
            }}, '연결')
          )
        )) : el('div', { style: 'padding:12px;color:#9CA3AF;font-size:12px;text-align:center;background:#F8FAFC;border-radius:6px' }, '연결 가능한 증빙이 없습니다. 먼저 증빙을 등록하세요.')
      ),
      (() => {
        const refs = (typeof Reference !== 'undefined') ? Reference.getRelevant([indicator], 6) : []
        if (!refs.length) return null
        return el('div', { style: 'margin-bottom:16px' },
          el('h4', { style: 'font-size:13px;margin-bottom:8px;color:#1E3A5F' }, '📚 참고 근거 (' + refs.length + '건)'),
          ...refs.map(r => el('div', { style: 'padding:8px 12px;background:#F8FAFC;border:1px solid #e4e7eb;border-radius:6px;margin-bottom:6px' },
            el('div', { style: 'font-size:11px;color:#1E3A5F;margin-bottom:4px' }, [r.source_org, r.title, r.page ? 'p.' + r.page : ''].filter(Boolean).join(' · ')),
            el('div', { style: 'font-size:12px;color:#1F2937;line-height:1.5;max-height:72px;overflow:hidden' }, (r.content || '').slice(0, 240) + ((r.content || '').length > 240 ? '…' : '')),
            el('button', { className: 'btn btn-sm btn-secondary', style: { marginTop: 6 }, onClick: () => navigator.clipboard.writeText(r.content || '').then(() => showToast('근거를 복사했습니다.')).catch(() => showToast('복사 실패', 'error')) }, '근거 복사')
          ))
        )
      })(),
      el('div', { style: 'padding:12px;background:#F8FAFC;border-radius:8px;font-size:12px;color:#6b7280;line-height:1.6' },
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
          el('span', { style: 'background:#dc2626;color:#fff;font-size:11px;padding:2px 8px;border-radius:99px' }, '법정 의무 (MANDATORY)')
        ),
        el('div', { style: 'padding:12px 20px;background:#fff5f5;border-bottom:1px solid #eef1f4;font-size:12px;line-height:1.6' },
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
              el('td', { style: 'font-size:11px;color:#6b7280' }, ind.dept_code || el('span', { style: 'color:#dc2626' }, '미지정')),
              el('td', { style: 'font-size:11px' }, ind.review_cycle || '-'),
              el('td', { style: 'text-align:center' }, ind.scope2_split_required ? el('span', { style: 'color:#dc2626;font-weight:600;font-size:11px' }, '위치+시장') : '-')
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
            el('span', {}, `검토대기: <strong style="color:#d97706">${pendingReview.length}</strong>`),
            el('span', {}, `승인됨: <strong style="color:#047857">${approved.length}</strong>`),
            el('span', {}, `반려: <strong style="color:#dc2626">${rejected.length}</strong>`)
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
              el('td', { style: 'font-size:11px' }, hasEvidence ? `${evidenceCount}건 연결` : el('span', { style: 'color:#dc2626;font-weight:600' }, '⚠ 증빙 미연결')),
              el('td', { style: `color:${{HIGH:'#047857',MEDIUM:'#d97706',LOW:'#dc2626'}[d.confidence]||'#9ca3af'};font-weight:600` }, d.confidence || '-'),
              el('td', {}, unsupported.length ? el('span', { style: 'color:#dc2626;font-weight:600' }, `⚠ ${unsupported.length}건`) : el('span', { style: 'color:#047857' }, '✅')),
              el('td', { style: 'text-align:center' }, d.masked_before_send ? el('span', { style: 'color:#047857;font-size:10px' }, '🔒') : el('span', { style: 'color:#9CA3AF;font-size:10px' }, '-')),
              el('td', { style: 'white-space:nowrap' },
                hasEvidence && d.ver_status === 'pass' ? el('button', { className: 'btn btn-sm btn-success', style: { marginRight: 4 }, onClick: () => { const r = AI.approveDraft(d.id, 'current_user'); if (r.error) { showToast(r.error, 'error'); return; } showToast('AI 초안이 승인되었습니다.', 'success'); renderAIHistory() } }, '승인') : el('span', { style: 'color:#dc2626;font-size:10px;font-weight:600;padding:4px 8px;background:#fff5f5;border-radius:4px;display:inline-block' }, !hasEvidence ? '증빙미연결' : '검증미통과'),
                el('button', { className: 'btn btn-sm btn-danger', onClick: () => { AI.rejectDraft(d.id, 'current_user', '반려'); showToast('AI 초안이 반려되었습니다.', 'warning'); renderAIHistory() } }, '반려')
              )
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#9CA3AF;text-align:center' }, '검토 대기 중인 AI 초안이 없습니다.')
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
              el('td', { style: 'font-size:11px;color:#dc2626' }, d.rejection_reason || '반려됨'),
              el('td', { style: 'white-space:nowrap' },
                el('button', { className: 'btn btn-sm btn-primary', style: { marginRight: 4 }, onClick: () => { _editorAssId = d.assessment_id; navigate('editor'); setTimeout(() => { if (typeof renderReportEditor === 'function') renderReportEditor() }, 100) } }, '지금 수정하기'),
                el('button', { className: 'btn btn-sm btn-secondary', onClick: async () => { const r = await AI.retryDraft(d.id, 'current_user'); if (r && r.error) { showToast('재생성 실패: ' + r.error, 'error'); return; } showToast('AI 재생성이 완료되었습니다. (v' + ((r && r.draft && r.draft.version) || 1) + ')', 'success'); renderAIHistory() } }, '재생성')
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
            const verColors = { pass: '#047857', fail: '#dc2626', revision_needed: '#d97706' }
            const humColors = { approved: '#047857', rejected: '#dc2626', pending: '#d97706' }
            const humLabels = { approved: '승인', rejected: '반려', pending: '대기' }
            const evCount = d.cited_evidence_ids?.length || d.evidence_ids?.length || 0
            return el('tr', {},
              el('td', {}, ind ? Indicator.getNameAndCode(ind) : d.indicator_id),
              el('td', { style: 'text-align:center' }, `v${d.version || 1}`),
              el('td', { style: 'text-align:center;font-size:11px' }, evCount ? `${evCount}건` : el('span', { style: 'color:#dc2626' }, '0')),
              el('td', { style: `color:${verColors[d.ver_status]||'#9ca3af'};font-weight:600;text-align:center` }, d.ver_status || '-'),
              el('td', { style: `color:${humColors[d.human_status]||'#9ca3af'};font-weight:600;text-align:center` }, humLabels[d.human_status] || d.human_status),
              el('td', { style: 'text-align:center;font-size:11px' }, d.masked_before_send ? '✅' : '❌'),
              el('td', { style: 'font-size:11px;color:#9ca3af' }, d.created_at ? new Date(d.created_at).toLocaleString('ko-KR') : '-')
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#9CA3AF' }, '생성 이력이 없습니다.')
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
          el('div', { className: 'stat-card' }, el('div', { className: 'stat-value', style: { color: totalPlanned ? (totalActual/totalPlanned > 0.9 ? '#dc2626' : '#047857') : '#9CA3AF' } }, totalPlanned ? Math.round(totalActual/totalPlanned*100) + '%' : '-'), el('div', { className: 'stat-label' }, '집행률'))
        ),
        budget.length ? (() => {
          const cats = {}
          budget.forEach(b => { if (!cats[b.category]) cats[b.category] = { planned: 0, actual: 0 }; cats[b.category].planned += b.planned_amount || 0; cats[b.category].actual += b.actual_amount || 0 })
          const maxVal = Math.max(...Object.values(cats).map(c => c.planned), 1)
          const colors = ['#1E3A5F', '#2563EB', '#059669', '#d97706', '#dc2626', '#2563EB']
          return el('div', { style: 'padding:0 20px 16px' },
            el('div', { style: 'font-size:12px;font-weight:600;color:#6B7280;margin-bottom:8px' }, '카테고리별 예산 분포'),
            el('div', { style: 'display:flex;flex-direction:column;gap:6px' },
              ...Object.entries(cats).map(([cat, val], i) => el('div', { style: 'display:flex;align-items:center;gap:8px;font-size:11px' },
                el('span', { style: 'width:80px;text-align:right;color:#6b7280;flex-shrink:0' }, cat),
                el('div', { style: 'flex:1;height:18px;background:#EEF1F4;border-radius:4px;overflow:hidden;display:flex' },
                  el('div', { style: `width:${val.planned ? Math.round(val.planned/maxVal*100) : 0}%;background:${colors[i%colors.length]}20;border-right:2px solid ${colors[i%colors.length]};height:100%` }),
                  el('div', { style: `width:${val.planned ? Math.round(val.actual/maxVal*100) : 0}%;background:${colors[i%colors.length]};height:100%` })
                ),
                el('span', { style: 'width:80px;color:#9ca3af;flex-shrink:0' }, `₩${(val.actual/10000).toFixed(0)}/${(val.planned/10000).toFixed(0)}만`)
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
              el('td', { style: 'text-align:center;color:' + (rate > 100 ? '#dc2626' : rate > 80 ? '#d97706' : '#047857') }, `${rate}%`),
              el('td', {}, el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteProjectBudget(b.id); renderBudget() } }, '삭제'))
            )
          }))
        ) : el('p', { style: 'padding:16px;color:#9CA3AF;text-align:center' }, '등록된 예산 항목이 없습니다.')
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' },
          el('h3', {}, '⚠️ 리스크 레지스터'),
          el('button', { className: 'btn btn-primary btn-sm', onClick: () => {
            modal('리스크 등록', el('div', {},
              el('div', { className: 'form-group' }, el('label', {}, '리스크 이름'), el('input', { id: 'riskName' })),
              el('div', { className: 'form-group' }, el('label', {}, '리스크 설명'), el('textarea', { id: 'riskDesc', rows: 2, style: 'width:100%;padding:8px;border:1px solid #e4e7eb;border-radius:6px' })),
              el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
                el('div', { className: 'form-group' }, el('label', {}, '확률(1-5)'), el('input', { type: 'number', id: 'riskProb', min: 1, max: 5, value: 3 })),
                el('div', { className: 'form-group' }, el('label', {}, '영향(1-5)'), el('input', { type: 'number', id: 'riskImpact', min: 1, max: 5, value: 3 }))
              ),
              el('div', { className: 'form-group' }, el('label', {}, '대응 방안'), el('textarea', { id: 'riskMit', rows: 2, style: 'width:100%;padding:8px;border:1px solid #e4e7eb;border-radius:6px' })),
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
            const color = score >= 15 ? '#dc2626' : score >= 8 ? '#d97706' : '#047857'
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
        ) : el('p', { style: 'padding:16px;color:#9CA3AF;text-align:center' }, '등록된 리스크가 없습니다.')
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
        el('div', { style: 'padding:12px 20px;background:#F8FAFC;border-bottom:1px solid #eef1f4;font-size:12px;color:#6b7280;line-height:1.6' },
          'AI 프롬프트 전송 전 민감정보를 자동 마스킹합니다.',
          el('br'),
          '전체마스킹: [마스킹됨] / 부분마스킹:첫 2글자+** / 집계치만허용: 개별값 숨김, 합계만 노출'
        ),
        rules.length ? el('table', { style: 'font-size:12px' },
          el('thead', {}, el('tr', {}, el('th', {}, '필드명'), el('th', {}, '마스킹 유형'), el('th', { style: 'width:120px' }, 'AI API 적용'), el('th', { style: 'width:60px' }, '관리'))),
          el('tbody', {}, ...rules.map(r => el('tr', {},
            el('td', { style: 'font-weight:500' }, r.field_name),
            el('td', {}, r.masking_type),
            el('td', { style: 'text-align:center;color:' + (r.applies_to_ai_api ? '#047857' : '#9CA3AF') }, r.applies_to_ai_api ? '✅ 적용' : '❌ 미적용'),
            el('td', {}, el('button', { className: 'btn btn-sm btn-danger', onClick: () => { Store.deleteMaskingRule(r.id); renderMasking() } }, '삭제'))
          ))
        )) : el('p', { style: 'padding:16px;color:#9CA3AF;text-align:center' }, '설정된 마스킹 규칙이 없습니다.')
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '🔍 마스킹 실시간 미리보기')),
        el('div', { style: 'padding:16px 20px' },
          el('div', { style: 'margin-bottom:12px' },
            el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:4px' }, '테스트할 데이터를 입력하세요'),
            el('input', { id: 'maskTestInput', type: 'text', placeholder: '예: 김철수, 서울시 강남구, 010-1234-5678', style: 'width:100%;padding:8px 12px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box', onInput: () => updateMaskPreview() })
          ),
          el('div', { id: 'mask-preview-result', style: 'font-size:12px;color:#6b7280' }, '위 입력란에 데이터를 입력하면 마스킹 결과가 실시간으로 표시됩니다.')
        )
      )
    )
  }

  function updateMaskPreview() {
    const input = document.getElementById('maskTestInput')?.value || ''
    const container = document.getElementById('mask-preview-result')
    if (!container) return
    if (!input) { container.innerHTML = '<span style="color:#9CA3AF">위 입력란에 데이터를 입력하면 마스킹 결과가 실시간으로 표시됩니다.</span>'; return }
    const rules = Store.getMaskingRules() || []
    const results = rules.map(r => {
      let masked = input
      if (r.masking_type === '전체마스킹') masked = '[마스킹됨]'
      else if (r.masking_type === '부분마스킹') masked = input.length > 2 ? input.slice(0, 2) + '**' : '**'
      else if (r.masking_type === '집계치만허용') masked = `(합계: ${input})`
      return { field: r.field_name, original: input, masked, applied: r.applies_to_ai_api }
    })
    container.innerHTML = `
      <div style="margin-bottom:8px;font-weight:600;color:#1F2937">원본: <span style="color:#047857">${input}</span></div>
      ${results.length ? results.map(r => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #EEF1F4">
          <span style="width:100px;color:#9ca3af;font-size:11px">${r.field}</span>
          <span style="flex:1;color:#dc2626;font-weight:500;font-size:12px">${r.masked}</span>
          <span style="font-size:10px;color:${r.applied ? '#047857' : '#9CA3AF'}">${r.applied ? '✅ AI적용' : '❌ 미적용'}</span>
        </div>
      `).join('') : '<div style="color:#9CA3AF;padding:8px 0">설정된 마스킹 규칙이 없습니다.</div>'}
    `
  }

  // ==================== 프로필 관리 ====================
  function openProfileModal() {
    const user = typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null
    if (!user) { alert('로그인이 필요합니다.'); return }
    const dept = user.dept_code ? (Store.getDepartments() || []).find(d => d.dept_code === user.dept_code) : null
    const form = el('form', { onSubmit: e => e.preventDefault() },
      el('div', { style: 'display:flex;align-items:center;gap:16px;margin-bottom:16px' },
        el('div', { style: 'width:56px;height:56px;border-radius:50%;background:#1E3A5F20;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#1E3A5F;flex-shrink:0' }, (user.name || '?')[0]),
        el('div', {},
          el('div', { style: 'font-weight:600;font-size:15px' }, user.name || '-'),
          el('div', { style: 'font-size:12px;color:#9ca3af' }, `${user.position || ''} · ${dept?.dept_name || user.dept_code || '미지정'}`)
        )
      ),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '아이디', el('input', { value: user.username || '', readonly: true, style: 'width:100%;padding:7px 10px;border:1px solid #eef1f4;border-radius:6px;font-size:13px;background:#F8FAFC;color:#9CA3AF;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '이름', el('input', { id: 'profName', value: user.name || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '이메일', el('input', { id: 'profEmail', type: 'email', value: user.email || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '전화번호', el('input', { id: 'profPhone', value: user.phone || '', placeholder: '010-0000-0000', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '부서', el('input', { value: dept?.dept_name || user.dept_code || '-', readonly: true, style: 'width:100%;padding:7px 10px;border:1px solid #eef1f4;border-radius:6px;font-size:13px;background:#F8FAFC;color:#9CA3AF;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '직급', el('input', { id: 'profPosition', value: user.position || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '역할', el('input', { value: roleLabel(user.role) || '-', readonly: true, style: 'width:100%;padding:7px 10px;border:1px solid #eef1f4;border-radius:6px;font-size:13px;background:#F8FAFC;color:#9CA3AF;box-sizing:border-box' }))
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
        el('label', { style: 'font-size:12px' }, '현재 비밀번호', el('input', { id: 'pwCurrent', type: 'password', required: true, style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '새 비밀번호', el('input', { id: 'pwNew', type: 'password', required: true, minLength: 6, style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '새 비밀번호 확인', el('input', { id: 'pwConfirm', type: 'password', required: true, style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }))
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
  const _catColors = { '평가': '#2563EB', '증빙': '#059669', '온실가스': '#d97706', '보고서': '#2563EB', '협력사': '#dc2626', '교육': '#2563EB', '개선': '#059669', '일반': '#6b7280', '기타': '#9ca3af' }

  function renderProjectManagement() {
    const c = document.getElementById('page-project')
    if (!c) return
    const tasks = Store.getProjectTasks()
    const curUser = (typeof Store.getCurrentUser === 'function' ? Store.getCurrentUser() : null)
    const myTasks = curUser ? tasks.filter(t => String(t.assignee_id) === String(curUser.id)) : []
    let filtered = _pmFilter === 'all' ? tasks : _pmFilter === 'mine' ? myTasks : tasks.filter(t => t.status === _pmFilter)
    const statusCounts = { all: tasks.length, mine: myTasks.length, '대기': tasks.filter(t => t.status === '대기').length, '진행중': tasks.filter(t => t.status === '진행중').length, '검토': tasks.filter(t => t.status === '검토').length, '완료': tasks.filter(t => t.status === '완료').length, '지연': tasks.filter(t => t.status === '지연').length }
    const today = new Date()
    const wbs = Store.wbsStats()

    const headerCard = el('div', { className: 'card', style: 'padding:12px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap' },
      el('h3', { style: 'margin:0;font-size:15px;white-space:nowrap' }, '📅 프로젝트 관리'),
      el('span', { style: 'font-size:12px;color:#9ca3af' }, `${tasks.length}건`),
      Object.entries(statusCounts).map(([k, v]) => el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmFilter === k ? '#1E3A5F' : '#EEF1F4'};color:${_pmFilter === k ? '#fff' : '#6b7280'};border:1px solid ${_pmFilter === k ? '#1E3A5F' : '#e4e7eb'}`, onClick: () => { _pmFilter = k; renderProjectManagement() } }, `${k === 'all' ? '전체' : k === 'mine' ? '📌 내 업무' : k} (${v})`)),
      el('div', { style: 'flex:1' }),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'list' ? '#1E3A5F' : '#EEF1F4'};color:${_pmView === 'list' ? '#fff' : '#6b7280'}`, onClick: () => { _pmView = 'list'; renderProjectManagement() } }, '📋 목록'),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'gantt' ? '#1E3A5F' : '#EEF1F4'};color:${_pmView === 'gantt' ? '#fff' : '#6b7280'}`, onClick: () => { _pmView = 'gantt'; renderProjectManagement() } }, '📊 간트'),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'calendar' ? '#1E3A5F' : '#EEF1F4'};color:${_pmView === 'calendar' ? '#fff' : '#6b7280'}`, onClick: () => { _pmView = 'calendar'; renderProjectManagement() } }, '🗓 캘린더'),
      el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_pmView === 'timeline' ? '#1E3A5F' : '#EEF1F4'};color:${_pmView === 'timeline' ? '#fff' : '#6b7280'}`, onClick: () => { _pmView = 'timeline'; renderProjectManagement() } }, '📜 타임라인'),
      el('button', { className: 'btn btn-primary btn-sm', onClick: () => _openProjectTaskModal(null) }, '+ 업무 추가')
    )
    c.innerHTML = ''
    c.append(headerCard)
    c.append(el('div', { className: 'card', style: 'padding:12px 16px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px' },
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          el('strong', { style: 'font-size:13px;color:#1E3A5F' }, '📊 전체 진도율 (단순 완료율)'),
          el('span', { style: 'font-size:11px;color:#9ca3af' }, 'WBS 소공정 기준 완료 개수')),
        el('span', { style: 'font-size:13px;font-weight:700;color:' + (wbs.percent >= 100 ? '#059669' : '#2563EB') }, wbs.percent + '%  ' + wbs.done + '/' + wbs.total)),
      el('div', { style: 'height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden' },
        el('div', { style: `width:${wbs.percent}%;height:100%;background:linear-gradient(90deg,#2563EB,#059669);border-radius:5px` }))))

    if (_pmView === 'gantt') { c.append(_renderPmGantt(filtered)); return }
    if (_pmView === 'calendar') { c.append(_renderPmCalendar(filtered)); return }
    if (_pmView === 'timeline') { c.append(_renderPmTimeline(filtered)); return }

    if (!filtered.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📅'), el('p', { style: 'color:#9ca3af' }, '등록된 업무가 없습니다.'), el('button', { className: 'btn btn-primary', onClick: () => _openProjectTaskModal(null) }, '+ 첫 업무 추가')))
      return
    }

    const priorityColors = { '높음': '#dc2626', '보통': '#2563EB', '낮음': '#059669' }
    const statusColors2 = { '대기': '#d97706', '진행중': '#2563EB', '검토': '#2563EB', '완료': '#059669', '지연': '#dc2626' }

    const listCard = el('div', { className: 'card', style: 'padding:0;overflow:hidden' })
    const levelColor = { '대': '#1E3A5F', '중': '#2563EB', '소': '#6b7280' }
    const visibleIds = new Set(filtered.map(t => String(t.id)))
    const kids = {}
    filtered.forEach(t => {
      const pid = (t.parent_id != null && visibleIds.has(String(t.parent_id))) ? String(t.parent_id) : '__root'
      ;(kids[pid] = kids[pid] || []).push(t)
    })
    const pOrder = { '높음': 0, '보통': 1, '낮음': 2 }
    Object.keys(kids).forEach(k => kids[k].sort((a, b) => (pOrder[a.priority] || 1) - (pOrder[b.priority] || 1)))
    const nextLevel = { '대': '중', '중': '소' }
    const walkPm = (parentKey, depth) => {
      (kids[parentKey] || []).forEach(task => {
        const st = wbs.nodeStat(task.id)
        const isOverdue = task.due_date && new Date(task.due_date) < today && task.status !== '완료'
        listCard.append(el('div', { style: `border-bottom:1px solid #EEF1F4;display:flex;align-items:center;gap:10px;padding:10px 16px 10px ${16 + depth * 22}px` },
          el('span', { style: `font-size:10px;font-weight:700;color:#fff;background:${levelColor[task.level] || '#9CA3AF'};border-radius:4px;padding:2px 7px;flex-shrink:0` }, task.level || '소'),
          el('span', { style: `width:4px;height:30px;border-radius:2px;background:${priorityColors[task.priority] || '#9CA3AF'};flex-shrink:0` }),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'font-size:13px;font-weight:600;color:#14213D' }, task.title || '제목 없음'),
            el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:3px;flex-wrap:wrap;font-size:11px' },
              el('span', { style: `padding:2px 6px;border-radius:8px;background:${statusColors2[task.status] || '#9CA3AF'}20;color:${statusColors2[task.status] || '#9CA3AF'};font-weight:500` }, task.status || '대기'),
              task.assignee ? el('span', { style: 'color:#9ca3af' }, `👤 ${task.assignee}`) : null,
              task.department ? el('span', { style: 'color:#9ca3af' }, `🏢 ${task.department}`) : null,
              (task.planned_start || task.planned_end) ? el('span', { style: 'color:#9ca3af' }, `계획 ${task.planned_start || '?'}~${task.planned_end || '?'}`) : null,
              (task.actual_start || task.actual_end) ? el('span', { style: 'color:#047857' }, `실적 ${task.actual_start || '?'}~${task.actual_end || '?'}`) : (isOverdue ? el('span', { style: 'color:#dc2626;font-weight:600' }, '⏰ 지연') : null)
            )),
          el('div', { style: 'display:flex;align-items:center;gap:6px;min-width:96px' },
            el('div', { style: 'flex:1;height:5px;background:#e5e7eb;border-radius:3px;overflow:hidden' }, el('div', { style: `width:${st.percent}%;height:100%;background:${st.percent >= 100 ? '#059669' : '#2563EB'}` })),
            el('span', { style: 'font-size:10px;color:#6b7280;white-space:nowrap' }, `${st.percent}% ${st.done}/${st.total}`)),
          depth < 2 ? el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px;padding:2px 8px', title: '하위 업무 추가', onClick: () => _openProjectTaskModal(null, { parent_id: task.id, level: nextLevel[task.level] || (depth === 0 ? '중' : '소') }) }, '＋ 하위') : null,
          el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px', onClick: () => _openProjectTaskModal(task) }, '수정'),
          el('button', { className: 'btn btn-sm', style: 'font-size:11px;color:#dc2626', onClick: () => { if (confirm('하위 업무도 함께 삭제됩니다. 삭제할까요?')) _deleteProjectTaskCascade(task.id) } }, '✕')))
        walkPm(String(task.id), depth + 1)
      })
    }
    walkPm('__root', 0)
    c.append(listCard)
  }

  function _renderPmGantt(tasks) {
    const withDates = tasks.filter(t => t.start_date || t.due_date)
    if (!withDates.length) return el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('div', { style: 'font-size:36px;margin-bottom:12px' }, '📊'), el('p', { style: 'color:#9ca3af' }, '일정이 설정된 업무가 없습니다.'))

    const today = new Date()
    const allDates = withDates.flatMap(t => [t.start_date ? new Date(t.start_date) : null, t.due_date ? new Date(t.due_date) : null].filter(Boolean))
    const minDate = new Date(Math.min(...allDates)); minDate.setDate(minDate.getDate() - 3)
    const maxDate = new Date(Math.max(...allDates)); maxDate.setDate(maxDate.getDate() + 7)
    const totalDays = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24))
    const dayWidth = Math.max(30, Math.min(50, 700 / totalDays))
    const todayOffset = Math.ceil((today - minDate) / (1000 * 60 * 60 * 24))

    const priorityColors = { '높음': '#dc2626', '보통': '#2563EB', '낮음': '#059669' }
    const statusColors2 = { '대기': '#d97706', '진행중': '#2563EB', '검토': '#2563EB', '완료': '#059669', '지연': '#dc2626' }

    const headerDays = []
    for (let d = new Date(minDate); d <= maxDate; d.setDate(d.getDate() + 1)) {
      const isToday = d.toDateString() === today.toDateString()
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      headerDays.push(el('div', { style: `width:${dayWidth}px;flex-shrink:0;text-align:center;font-size:8px;padding:3px 0;${isToday ? 'background:#1E3A5F20;font-weight:700;color:#1E3A5F' : isWeekend ? 'background:#F8FAFC;color:#9CA3AF' : 'color:#9ca3af'}` }, `${d.getMonth() + 1}/${d.getDate()}`))
    }

    const sorted = [...withDates].sort((a, b) => { const as = a.start_date ? new Date(a.start_date) : new Date(a.due_date); const bs = b.start_date ? new Date(b.start_date) : new Date(b.due_date); return as - bs })

    return el('div', { className: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { style: 'padding:10px 16px;border-bottom:1px solid #eef1f4;font-weight:600;font-size:13px' }, `📊 간트차트 (${withDates.length}건)`),
      el('div', { style: 'display:flex;overflow-x:auto' },
        el('div', { style: 'min-width:150px;flex-shrink:0;border-right:1px solid #eef1f4;background:#F8FAFC' },
          el('div', { style: 'height:28px;border-bottom:1px solid #eef1f4;display:flex;align-items:center;padding:0 12px;font-size:10px;font-weight:600;color:#9ca3af' }, '업무명'),
          ...sorted.map(t => el('div', { style: 'height:28px;border-bottom:1px solid #EEF1F4;display:flex;align-items:center;padding:0 10px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer', onClick: () => _openProjectTaskModal(t) },
            el('span', { style: `width:5px;height:5px;border-radius:50%;background:${statusColors2[t.status] || '#9CA3AF'};margin-right:6px;flex-shrink:0` }),
            t.title || '-'
          ))
        ),
        el('div', { style: 'flex:1;overflow-x:auto;position:relative' },
          el('div', { style: `display:flex;height:28px;border-bottom:1px solid #eef1f4;background:#F8FAFC` }, ...headerDays),
          ...sorted.map(t => {
            const start = t.start_date ? new Date(t.start_date) : new Date(t.due_date)
            const end = t.due_date ? new Date(t.due_date) : new Date(t.start_date)
            const startOff = Math.max(0, Math.ceil((start - minDate) / (1000 * 60 * 60 * 24)))
            const dur = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1)
            const color = priorityColors[t.priority] || '#2563EB'
            const isOverdue = t.due_date && new Date(t.due_date) < today && t.status !== '완료'
            return el('div', { style: 'position:relative;height:28px;border-bottom:1px solid #EEF1F4' },
              el('div', { style: `position:absolute;left:${startOff * dayWidth}px;width:${dur * dayWidth}px;height:18px;top:5px;background:${isOverdue ? '#dc262620' : color + '20'};border:1px solid ${isOverdue ? '#dc262660' : color + '60'};border-radius:4px;cursor:pointer;overflow:hidden;display:flex;align-items:center;padding:0 4px`, onClick: () => _openProjectTaskModal(t), title: `${t.title}\n${t.start_date || '?'} ~ ${t.due_date || '?'}\n담당: ${t.assignee || '미지정'} (${t.progress || 0}%)\n${(t.depends_on||[]).length ? '의존: ' + (t.depends_on||[]).map(did => { const dt = tasks.find(x=>x.id===did); return dt?dt.title:did }).join(', ') : ''}` },
                el('div', { style: `height:100%;width:${t.progress || 0}%;background:${isOverdue ? '#dc2626' : color};border-radius:3px;transition:width .3s` }),
                el('span', { style: `position:absolute;left:4px;font-size:9px;font-weight:600;color:${isOverdue ? '#dc2626' : color};white-space:nowrap;text-shadow:0 0 3px #fff` }, t.title),
                (t.depends_on || []).length ? el('span', { style: 'position:absolute;right:4px;font-size:8px;color:#2563EB', title: `${(t.depends_on||[]).length}개 업무에 의존` }, '🔗') : null
              )
            )
          }),
          el('div', { style: `position:absolute;left:${todayOffset * dayWidth}px;width:2px;height:100%;background:#dc2626;z-index:2;top:0` })
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

    const statusColors2 = { '대기': '#d97706', '진행중': '#2563EB', '검토': '#2563EB', '완료': '#059669', '지연': '#dc2626' }
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(el('div', { style: 'min-height:80px;background:#F8FAFC;border:1px solid #EEF1F4;border-radius:4px' }))
    for (let day = 1; day <= daysInMonth; day++) {
      const isToday = day === today
      const dueTasks = tasksByDay[day] || []
      const startTasks = tasksByDay['s' + day] || []
      cells.push(el('div', { style: `min-height:80px;border:1px solid ${isToday ? '#1E3A5F' : '#EEF1F4'};border-radius:4px;padding:4px;${isToday ? 'background:#eef4fa' : 'background:#fff'}` },
        el('div', { style: `font-size:11px;font-weight:${isToday ? '700' : '500'};color:${isToday ? '#1E3A5F' : '#1F2937'};margin-bottom:2px` }, `${day}`),
        ...dueTasks.slice(0, 3).map(t => el('div', { style: `font-size:9px;padding:1px 4px;border-radius:3px;margin-bottom:1px;background:${statusColors2[t.status] || '#9CA3AF'}20;color:${statusColors2[t.status] || '#9CA3AF'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer`, onClick: () => _openProjectTaskModal(t), title: t.title }, `📅 ${t.title}`)),
        startTasks.filter(t => !dueTasks.includes(t)).slice(0, 2).map(t => el('div', { style: `font-size:9px;padding:1px 4px;border-radius:3px;margin-bottom:1px;background:#05966920;color:#059669;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer`, onClick: () => _openProjectTaskModal(t), title: t.title }, `▶ ${t.title}`)),
        (dueTasks.length + startTasks.length) > 5 ? el('div', { style: 'font-size:8px;color:#9CA3AF;text-align:center' }, `+${dueTasks.length + startTasks.length - 5}건`) : null
      ))
    }

    return el('div', { className: 'card', style: 'padding:16px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px' },
        el('div', { style: 'text-align:center;font-weight:600;font-size:14px' }, `${year}년 ${monthNames[month]}`),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: _exportCalendarIcal, style: 'font-size:11px' }, '📤 캘린더 복사')
      ),
      el('div', { style: 'display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center' },
        ...['일', '월', '화', '수', '목', '금', '토'].map(d => el('div', { style: 'font-size:11px;font-weight:600;color:#9ca3af;padding:4px' }, d)),
        ...cells
      )
    )
  }

  function _renderPmTimeline(tasks) {
    if (!tasks.length) return el('div', { className: 'card', style: 'text-align:center;padding:40px 20px' }, el('p', { style: 'color:#9ca3af' }, '표시할 업무가 없습니다.'))
    const logs = []
    tasks.forEach(t => {
      Store.getProjectTaskLogs(t.id).forEach(l => logs.push({ ...l, task_title: t.title, task_id: t.id }))
    })
    logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const actionIcons = { '생성': '🆕', '상태변경': '🔄', '진행률': '📊', '담당자변경': '👤', '코멘트': '💬' }

    const card = el('div', { className: 'card', style: 'padding:0;overflow:hidden' },
      el('div', { style: 'padding:12px 16px;border-bottom:1px solid #eef1f4;font-weight:600;font-size:13px' }, `📜 변경 이력 (${logs.length}건)`)
    )
    if (!logs.length) {
      card.append(el('div', { style: 'text-align:center;padding:40px;color:#9ca3af' }, '변경 이력이 없습니다.'))
    } else {
      logs.slice(0, 100).forEach((l, idx) => {
        card.append(el('div', { style: `padding:10px 16px;display:flex;gap:10px;align-items:flex-start;border-bottom:1px solid #F8FAFC;${idx === logs.length - 1 ? 'border-bottom:none' : ''}` },
          el('span', { style: 'font-size:18px;flex-shrink:0' }, actionIcons[l.action] || '📝'),
          el('div', { style: 'flex:1;min-width:0' },
            el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:2px' },
              el('span', { style: 'font-weight:600;font-size:12px;color:#1F2937;cursor:pointer;text-decoration:underline', onClick: () => _openProjectTaskModal(tasks.find(t => t.id === l.task_id)) }, l.task_title),
              el('span', { style: 'font-size:11px;font-weight:500;color:#1E3A5F' }, l.action),
              l.from_value ? el('span', { style: 'font-size:11px;text-decoration:line-through;color:#9CA3AF' }, l.from_value) : null,
              l.to_value ? el('span', { style: 'font-size:11px;color:#047857;font-weight:500' }, l.to_value) : null
            ),
            el('div', { style: 'font-size:10px;color:#9CA3AF' }, _formatDateTime(l.created_at))
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

  function _pmParentOptions(all, excludeId) {
    const exclude = new Set()
    if (excludeId != null) {
      exclude.add(String(excludeId))
      const stack = [excludeId]
      while (stack.length) {
        const cur = stack.pop()
        all.forEach(t => { if (String(t.parent_id) === String(cur) && !exclude.has(String(t.id))) { exclude.add(String(t.id)); stack.push(t.id) } })
      }
    }
    const childrenOf = {}
    all.forEach(t => { const p = t.parent_id == null || t.parent_id === '' ? '__root' : String(t.parent_id); (childrenOf[p] = childrenOf[p] || []).push(t) })
    const out = []
    const walk = (key, depth) => (childrenOf[key] || []).forEach(t => {
      if (!exclude.has(String(t.id))) out.push({ id: t.id, label: '　'.repeat(depth) + '[' + (t.level || '소') + '] ' + (t.title || '(제목 없음)') })
      walk(String(t.id), depth + 1)
    })
    walk('__root', 0)
    return out
  }

  function _deleteProjectTaskCascade(id) {
    const all = Store.getProjectTasks()
    const ids = new Set([String(id)])
    let changed = true
    while (changed) {
      changed = false
      all.forEach(t => { if (t.parent_id != null && ids.has(String(t.parent_id)) && !ids.has(String(t.id))) { ids.add(String(t.id)); changed = true } })
    }
    all.filter(t => ids.has(String(t.id))).forEach(t => Store.deleteProjectTask(t.id))
    showToast('삭제되었습니다.', 'success')
    renderProjectManagement()
  }

  function _openProjectTaskModal(task, preset) {
    const isEdit = !!task
    const presetLevel = preset?.level || (task && task.level) || '대'
    const presetParent = task ? task.parent_id : (preset ? preset.parent_id : null)
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
    const allTasks = Store.getProjectTasks()
    const levels = ['대', '중', '소']
    const parentOpts = _pmParentOptions(allTasks, task ? task.id : null)
    const curLevel = task?.level || preset?.level || '대'
    const curParent = task ? task.parent_id : (preset ? preset.parent_id : null)
    const logs = task ? Store.getProjectTaskLogs(task.id) : []
    const comments = task?.comments || []

    const userMap = {}
    users.forEach(u => { userMap[u.id] = u })

    const form = el('form', { onSubmit: e => e.preventDefault() },
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '단계(WBS)', el('select', { id: 'pmLevel', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...levels.map(l => el('option', { value: l, selected: curLevel === l }, l === '대' ? '대공정' : l === '중' ? '중공정' : '소공정')))),
        el('label', { style: 'font-size:12px' }, '상위 업무', el('select', { id: 'pmParent', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, el('option', { value: '' }, '— 최상위 —'), ...parentOpts.map(o => el('option', { value: o.id, selected: String(curParent ?? '') === String(o.id) }, o.label)))),
        el('label', { style: 'font-size:12px' }, '제목 *', el('input', { id: 'pmTitle', value: task?.title || '', required: true, style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '카테고리', el('select', { id: 'pmCategory', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...categories.map(c => el('option', { value: c, selected: (task?.category || '일반') === c }, c)))),
        el('label', { style: 'font-size:12px' }, '담당자', el('select', { id: 'pmAssignee', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box', onChange: () => { const uid = document.getElementById('pmAssignee').value; const u = userMap[uid]; if (u) { const ds = document.getElementById('pmDept'); const dOpt = [...ds.options].find(o => o.value === u.dept_code); if (dOpt) ds.value = u.dept_code } } }, el('option', { value: '' }, '미지정'), ...users.map(u => el('option', { value: u.id, selected: String(task?.assignee_id) === String(u.id) }, `${u.name} (${u.position || ''})`)))),
        el('label', { style: 'font-size:12px' }, '부서', el('select', { id: 'pmDept', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, el('option', { value: '' }, '미지정'), ...depts.map(d => el('option', { value: d.dept_code, selected: (task?.dept_code || '') === d.dept_code }, d.dept_name)))),
        el('label', { style: 'font-size:12px' }, '우선순위', el('select', { id: 'pmPriority', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...priorities.map(p => el('option', { value: p, selected: (task?.priority || '보통') === p }, p)))),
        el('label', { style: 'font-size:12px' }, '상태', el('select', { id: 'pmStatus', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...statuses.map(s => el('option', { value: s, selected: (task?.status || '대기') === s }, s)))),
        el('label', { style: 'font-size:12px' }, '시작일', el('input', { id: 'pmStart', type: 'date', value: task?.start_date || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '마감일', el('input', { id: 'pmDue', type: 'date', value: task?.due_date || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }))
      ),
      el('div', { style: 'margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '반복', el('select', { id: 'pmRepeat', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }, ...repeats.map(r => el('option', { value: r.value, selected: (task?.repeat || 'none') === r.value }, r.label)))),
        el('label', { style: 'font-size:12px' }, '반복 종료일', el('input', { id: 'pmRepeatUntil', type: 'date', value: task?.repeat_until || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }))
      ),
      el('div', { style: 'margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px' },
        el('label', { style: 'font-size:12px' }, '계획 시작일', el('input', { id: 'pmPlanStart', type: 'date', value: task?.planned_start || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '계획 종료일', el('input', { id: 'pmPlanEnd', type: 'date', value: task?.planned_end || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '실적 시작일', el('input', { id: 'pmActStart', type: 'date', value: task?.actual_start || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' })),
        el('label', { style: 'font-size:12px' }, '실적 종료일', el('input', { id: 'pmActEnd', type: 'date', value: task?.actual_end || '', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box' }))
      ),
      el('label', { style: 'font-size:12px;margin-top:8px;display:block' }, '설명 (@"이름"으로 담당자 태그 가능)', el('textarea', { id: 'pmDesc', value: task?.description || '', rows: '3', style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px;box-sizing:border-box;resize:vertical', onInput: (e) => _handleMentionInput(e, users) })),
      el('div', { id: 'pmMentionList', style: 'position:relative' }),
      el('div', { style: 'margin-top:8px;display:flex;align-items:center;gap:8px' },
        el('label', { style: 'font-size:12px' }, '진행률'),
        el('input', { id: 'pmProgress', type: 'range', min: '0', max: '100', value: task?.progress || '0', style: 'flex:1', onInput: () => { const v = document.getElementById('pmProgressVal'); if (v) v.textContent = document.getElementById('pmProgress').value + '%' } }),
        el('span', { id: 'pmProgressVal', style: 'font-size:11px;color:#9ca3af;min-width:30px' }, (task?.progress || '0') + '%')
      ),
      tasks.length ? el('label', { style: 'font-size:12px;margin-top:8px;display:block' },
        '의존 업무',
        el('select', { id: 'pmDepends', multiple: true, style: 'width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px;box-sizing:border-box;min-height:60px' },
          ...tasks.map(t => el('option', { value: t.id, selected: (task?.depends_on || []).includes(t.id) }, `${t.title} (${t.assignee || '미지정'})`))
        )
      ) : null,
      isEdit && logs.length ? el('div', { style: 'margin-top:12px' },
        el('div', { style: 'font-size:12px;font-weight:600;margin-bottom:6px;color:#6B7280' }, '📋 변경 이력'),
        el('div', { style: 'max-height:120px;overflow-y:auto;font-size:11px;color:#6b7280', id: 'pmTimeline' },
          ...logs.slice(0, 20).map(l => el('div', { style: 'padding:4px 0;border-bottom:1px solid #F8FAFC;display:flex;gap:8px;align-items:center' },
            el('span', { style: 'color:#9CA3AF;white-space:nowrap' }, _formatDateTime(l.created_at)),
            el('span', { style: 'font-weight:500;color:#6B7280' }, l.action),
            l.from_value ? el('span', { style: 'text-decoration:line-through;color:#9CA3AF' }, l.from_value) : null,
            l.to_value ? el('span', { style: 'color:#047857;font-weight:500' }, l.to_value) : null
          ))
        )
      ) : null,
      isEdit ? el('div', { style: 'margin-top:12px' },
        el('div', { style: 'font-size:12px;font-weight:600;margin-bottom:6px;color:#6B7280' }, '💬 코멘트'),
        el('div', { id: 'pmComments', style: 'max-height:120px;overflow-y:auto;margin-bottom:6px' },
          ...comments.map(c => el('div', { style: 'padding:6px 0;border-bottom:1px solid #F8FAFC;font-size:11px' },
            el('div', { style: 'display:flex;gap:6px;align-items:center;margin-bottom:2px' },
              el('span', { style: 'font-weight:600;color:#6B7280' }, c.user_name || '익명'),
              el('span', { style: 'color:#9CA3AF' }, _formatDateTime(c.created_at))
            ),
            el('div', { style: 'color:#1F2937' }, c.text)
          ))
        ),
        el('div', { style: 'display:flex;gap:6px' },
          el('input', { id: 'pmCommentInput', placeholder: '코멘트 입력...', style: 'flex:1;padding:6px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:12px', onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); _addTaskComment(task.id) } } }),
          el('button', { className: 'btn btn-sm btn-primary', onClick: () => _addTaskComment(task.id), style: 'font-size:11px;padding:4px 10px' }, '등록')
        )
      ) : null
    )

    modal(isEdit ? '업무 수정' : '업무 추가', form, isEdit ? [{ label: '🗑 삭제', className: 'btn btn-danger', onClick: () => { if (confirm('이 업무와 하위 업무를 삭제하시겠습니까?')) { closeModal(); _deleteProjectTaskCascade(task.id) } } }] : [])
    document.getElementById('modal-save').onclick = () => {
      const data = {
        title: document.getElementById('pmTitle').value,
        category: document.getElementById('pmCategory').value,
        level: document.getElementById('pmLevel').value,
        parent_id: document.getElementById('pmParent').value ? document.getElementById('pmParent').value : null,
        assignee_id: document.getElementById('pmAssignee').value || null,
        assignee: document.getElementById('pmAssignee').selectedOptions[0]?.textContent?.replace(/\s*\(.*\)/, '') || '',
        dept_code: document.getElementById('pmDept').value,
        department: document.getElementById('pmDept').selectedOptions[0]?.textContent || '',
        priority: document.getElementById('pmPriority').value,
        status: document.getElementById('pmStatus').value,
        start_date: document.getElementById('pmStart').value,
        due_date: document.getElementById('pmDue').value,
        planned_start: document.getElementById('pmPlanStart').value,
        planned_end: document.getElementById('pmPlanEnd').value,
        actual_start: document.getElementById('pmActStart').value,
        actual_end: document.getElementById('pmActEnd').value,
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
        const ul = el('div', { style: 'position:absolute;left:0;right:0;background:#fff;border:1px solid #e4e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;max-height:120px;overflow-y:auto' })
        found.forEach(u => {
          const item = el('div', { style: 'padding:6px 10px;cursor:pointer;font-size:12px;display:flex;gap:8px;align-items:center', onClick: () => { const pre = val.substring(0, cur - match[0].length); const post = val.substring(cur); ta.value = pre + '@' + u.name + ' ' + post; list.innerHTML = ''; ta.focus() } }, el('span', { style: 'font-weight:600' }, u.name), el('span', { style: 'color:#9ca3af' }, u.position || ''))
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
      c.append(el('div', { style: 'text-align:center;padding:64px 40px' }, el('div', { style: 'font-size:46px;margin-bottom:16px' }, '📊'), el('h2', { style: 'margin:0 0 8px;color:var(--c-primary)' }, 'Smart ESG에 오신 것을 환영합니다'), el('p', { style: 'margin:0 0 24px;color:var(--c-text-muted);font-size:14px;line-height:1.6' }, 'ESG 평가를 시작하려면 먼저 평가를 생성하세요.'), el('button', { className: 'btn btn-primary', style: 'font-size:15px;padding:12px 32px', onClick: () => navigate('assessment') }, '+ 첫 번째 평가 만들기')))
      return
    }
    _dashAssId = _dashAssId || assessments[0]?.id
    if (!assessments.find(a => a.id === _dashAssId)) _dashAssId = assessments[0]?.id
    const selOpts = assessments.map(a => '<option value="' + a.id + '"' + (a.id === _dashAssId ? ' selected' : '') + '>' + a.title + ' (' + a.assessment_year + '년)</option>').join('')
    c.append(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;padding:4px 2px 16px;flex-wrap:wrap;gap:10px' }, el('div', {}, el('h2', { style: 'margin:0;font-size:20px;font-weight:700;color:var(--c-primary)' }, '대시보드'), el('div', { style: 'font-size:12px;color:var(--c-text-muted);margin-top:2px' }, 'ESG 현황 요약')), el('div', { style: 'display:flex;gap:8px;align-items:center' }, Object.assign(document.createElement('div'), { innerHTML: '<select id="dashAssSelect" style="padding:7px 12px;border:1px solid var(--c-border);border-radius:var(--radius-sm);font-size:13px;background:#fff;color:var(--c-text)" onchange="setDashAssessment(Number(this.value))">' + selOpts + '</select>' }).firstChild)))
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

    const statBox = (label, value, color) => el('div', { style: `flex:1;min-width:84px;text-align:center;padding:12px 8px;background:${color}14;border-radius:10px;border:1px solid ${color}26;cursor:pointer`, onClick: () => navigate('project') },
      el('div', { style: `font-size:21px;font-weight:700;color:${color};line-height:1.1` }, String(value)),
      el('div', { style: 'font-size:10.5px;color:var(--c-text-muted);margin-top:3px' }, label)
    )

    return el('div', { className: 'card', style: 'padding:18px 20px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px' },
        el('h3', { style: 'margin:0;font-size:14px;display:flex;align-items:center;gap:6px;color:var(--c-primary);cursor:pointer', onClick: () => navigate('project') }, '📅 프로젝트 현황'),
        el('button', { className: 'btn btn-sm btn-secondary', style: 'font-size:11px', onClick: () => navigate('project') }, '전체보기 →')
      ),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px' },
        statBox('오늘 마감', todayDue, '#d97706'),
        statBox('진행중', inProgress, '#2563EB'),
        statBox('지연', overdue, '#dc2626'),
        statBox('이번주', weekDue, '#1E3A5F'),
        statBox('완료', done, '#059669')
      ),
      el('div', { style: 'display:flex;align-items:center;gap:8px' },
        el('div', { style: 'flex:1;height:6px;background:#eef1f5;border-radius:99px;overflow:hidden' }, el('div', { style: `width:${avgProgress}%;height:100%;background:linear-gradient(90deg,#059669,#1E3A5F);border-radius:99px;transition:width .3s` })),
        el('span', { style: 'font-size:11px;color:var(--c-text-muted);white-space:nowrap' }, `전체 진행률 ${avgProgress}%`)
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
      el('div', { style: 'padding:20px 24px;border-bottom:1px solid #EEF1F4;display:flex;justify-content:space-between;align-items:center' },
        el('div', {},
          el('div', { style: 'font-size:18px;font-weight:700;color:#14213D' }, `안녕하세요, ${user.name}님! 👋`),
          el('div', { style: 'font-size:12px;color:#9ca3af;margin-top:2px' }, `${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} 프로젝트 현황`)
        ),
        el('button', { style: 'background:none;border:none;font-size:20px;cursor:pointer;color:#9CA3AF;padding:4px 8px', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) { s.style.transform = 'translateX(100%)'; setTimeout(() => s.remove(), 300) } } }, '✕')
      ),
      el('div', { style: 'flex:1;overflow-y:auto;padding:16px 24px' },
        el('div', { style: 'font-size:12px;font-weight:600;color:#6B7280;margin-bottom:8px' }, '📊 오늘의 업무 요약'),
        ...[
          { label: '⏰ 오늘 마감', items: todayDue, color: '#d97706' },
          { label: '🔄 진행중', items: inProgress, color: '#2563EB' },
          { label: '🚨 지연', items: overdue, color: '#dc2626' },
          { label: '📅 이번주 예정', items: weekDue, color: '#2563EB' }
        ].filter(s => s.items.length).map(s => el('div', { style: 'margin-bottom:12px' },
          el('div', { style: 'font-size:12px;font-weight:600;color:' + s.color + ';margin-bottom:4px' }, `${s.label} (${s.items.length}건)`),
          ...s.items.slice(0, 5).map(t => el('div', { style: 'padding:6px 8px;background:#F8FAFC;border-radius:6px;margin-bottom:3px;font-size:11px;display:flex;justify-content:space-between;align-items:center;cursor:pointer', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) s.remove(); navigate('project') } },
            el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.title),
            el('span', { style: 'color:#9ca3af;white-space:nowrap;margin-left:8px;font-size:10px' }, t.assignee || '미지정')
          )),
          s.items.length > 5 ? el('div', { style: 'font-size:10px;color:#9CA3AF;text-align:center;padding:4px' }, `+${s.items.length - 5}건 더보기`) : null
        )),
        !overdue.length && !inProgress.length && !todayDue.length && !weekDue.length ? el('div', { style: 'text-align:center;padding:20px;color:#9CA3AF;font-size:13px' }, '🎉 모든 업무를 완료했습니다!') : null,
        myTasks.length ? el('div', { style: 'margin-top:16px' },
          el('div', { style: 'font-size:12px;font-weight:600;color:#6B7280;margin-bottom:8px' }, `📌 나의 미완료 업무 (${myTasks.length}건)`),
          ...myTasks.slice(0, 5).map(t => el('div', { style: 'padding:6px 8px;background:#eef4fa;border-radius:6px;margin-bottom:3px;font-size:11px;display:flex;justify-content:space-between;align-items:center;cursor:pointer', onClick: () => { const s = document.getElementById('first-login-slide'); if (s) s.remove(); navigate('project') } },
            el('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, t.title),
            el('span', { style: 'color:#1E3A5F;white-space:nowrap;margin-left:8px;font-size:10px' }, `${t.progress || 0}%`)
          ))
        ) : null
      ),
      el('div', { style: 'padding:16px 24px;border-top:1px solid #EEF1F4' },
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
        }) : el('p', { style: 'padding:20px;color:#9CA3AF' }, '등록된 회사가 없습니다.')
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
        }) : el('p', { style: 'padding:20px;color:#9CA3AF' }, '등록된 부서가 없습니다.')
      )
    )
  }

  function openAddDepartment() { createDepartmentModal() }
  function editDepartment(id) { const dept = Store.getDepartments().find(x => x.id === id); if (dept) createDepartmentModal(dept) }

  function createDepartmentModal(dept) {
    const isEdit = !!dept
    const form = el('form', { onSubmit: e => e.preventDefault() })
    const deptCode = el('input', { value: dept?.dept_code ?? '', required: true, placeholder: '예: ENV, HR, FIN', style: 'padding:8px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%;font-size:13px' })
    const deptName = el('input', { value: dept?.dept_name ?? '', required: true, placeholder: '예: 환경팀', style: 'padding:8px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%;font-size:13px' })
    const managerName = el('input', { value: dept?.manager_name ?? '', placeholder: '예: 김철수', style: 'padding:8px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%;font-size:13px' })
    const managerEmail = el('input', { type: 'email', value: dept?.manager_email ?? '', placeholder: '예: team@company.com', style: 'padding:8px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%;font-size:13px' })
    const parentDept = el('select', { style: 'padding:8px 10px;border:1px solid #e4e7eb;border-radius:6px;width:100%;font-size:13px' },
      el('option', { value: '' }, '(없음)'),
      ...Store.getDepartments().filter(d => d.is_active !== false && d.dept_code !== dept?.dept_code).map(d => el('option', { value: d.dept_code, selected: dept?.parent_dept === d.dept_code }, d.dept_name))
    )
    const isActive = el('input', { type: 'checkbox', checked: dept?.is_active !== false })
    const toggleWrap = el('label', { style: 'display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px' },
      el('span', { style: `display:inline-block;width:36px;height:20px;background:${isActive.checked ? '#059669' : '#D0D5DD'};border-radius:10px;position:relative;transition:.2s` }, ''),
      el('span', {}, isActive.checked ? '활성' : '비활성')
    )
    isActive.addEventListener('change', () => {
      toggleWrap.children[0].style.background = isActive.checked ? '#059669' : '#D0D5DD'
      toggleWrap.children[1].textContent = isActive.checked ? '활성' : '비활성'
    })

    form.append(
      el('div', { style: 'margin-bottom:10px' }, el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '부서코드 *'), deptCode),
      el('div', { style: 'margin-bottom:10px' }, el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '부서명 *'), deptName),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px' },
        el('div', {}, el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '담당자'), managerName),
        el('div', {}, el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '담당자 이메일'), managerEmail)
      ),
      el('div', { style: 'margin-bottom:10px' }, el('label', { style: 'font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px' }, '상위부서'), parentDept),
      el('div', { style: 'padding:10px 12px;background:#F8FAFC;border-radius:8px;display:flex;align-items:center;gap:10px' }, isActive, toggleWrap)
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
            if (!authParams.length) return el('tr', {}, el('td', { colspan: 3, style: 'color:#9CA3AF;text-align:center' }, `${ag.name}: 설정된 가중치 없음`))
            return authParams.map(p => el('tr', {},
              el('td', {}, Indicator.getAuthorityName(auth)),
              el('td', {}, p.theme_code),
              el('td', {},
                el('input', { type: 'number', min: 0, max: 100, value: p.weight, style: 'width:60px;padding:4px;border:1px solid #e4e7eb;border-radius:4px;text-align:center', onBlur: e => { Store.updateWeightParam(p.id, { weight: parseInt(e.target.value) || 0 }) } })
              )
            ))
          }).flat())
        )
      ),
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, `필러별 가중치 - EcoVadis (${year}년)`)),
        el('div', { style: 'padding:12px 16px;background:#F8FAFC;border-bottom:1px solid #eef1f4;font-size:12px;color:#6b7280' },
          'EcoVadis 공식 기준: POLICY 25% / ACTION 40% / RESULT 35%'
        ),
        el('table', { className: 'table-dense' },
          el('thead', {}, el('tr', {}, el('th', {}, '필러'), el('th', {}, '가중치(%)'), el('th', {}, '해석'))),
          el('tbody', {}, ...['POLICY', 'ACTION', 'RESULT'].map(p => {
            const pw = params.find(pp => pp.authority_code === 'ECOVADIS' && pp.theme_code === '_PILLAR' && pp.pillar === p && pp.year === year)
            const interp = { POLICY: '정책 수립 여부 및 범위', ACTION: '조치·이행 (측정·인증·전개도)', RESULT: '결과·보고 (KPI·360° Watch)' }
            return el('tr', {},
              el('td', { style: 'font-weight:500' }, `${Indicator.getPillarName(p)} (${p})`),
              el('td', {}, el('input', { type: 'number', min: 0, max: 100, value: pw?.weight ?? 0, style: 'width:60px;padding:4px;border:1px solid #e4e7eb;border-radius:4px;text-align:center', onBlur: e => {
                if (pw) Store.updateWeightParam(pw.id, { weight: parseInt(e.target.value) || 0 })
              } })),
              el('td', { style: 'font-size:12px;color:#9ca3af' }, interp[p] || '')
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
            if (!authThresholds.length) return el('tr', {}, el('td', { colspan: 4, style: 'color:#9CA3AF;text-align:center' }, `${ag.name}: 설정된 등급 기준 없음`))
            return authThresholds.map(t => el('tr', {},
              el('td', {}, ag.name),
              el('td', { style: 'font-weight:600' }, t.rating),
              el('td', {}, el('input', { type: 'number', value: t.min_score, style: 'width:50px;padding:4px;border:1px solid #e4e7eb;border-radius:4px;text-align:center', onBlur: e => { Store.updateRatingThreshold(t.id, { min_score: parseInt(e.target.value) || 0 }) } })),
              el('td', {}, el('input', { type: 'number', value: t.max_score, style: 'width:50px;padding:4px;border:1px solid #e4e7eb;border-radius:4px;text-align:center', onBlur: e => { Store.updateRatingThreshold(t.id, { max_score: parseInt(e.target.value) || 100 }) } }))
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
          { label: '공시 유형', value: a => el('span', { style: `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:${a.track_type === 'MANDATORY' ? '#dc262610' : '#05966910'};color:${a.track_type === 'MANDATORY' ? '#dc2626' : '#059669'}` }, a.track_type === 'MANDATORY' ? '법정 의무' : '자율 공시'), align: 'center' },
          { label: '시행일', key: 'effective_date', value: a => a.effective_date || '-' },
          { label: '활성', value: a => el('span', { style: `color:${a.is_active !== false ? '#059669' : '#D0D5DD'}` }, a.is_active !== false ? '●' : '○'), align: 'center' }
        ], agencies, {
          bulkDelete: id => { Store.deleteAgencyMaster(id); renderAgencies() },
          actions: a => [
            el('button', { className: 'btn btn-sm btn-danger', onClick: () => { if (confirm(`"${a.code}" 기관을 삭제하시겠습니까?`)) { Store.deleteAgencyMaster(a.id); renderAgencies() } } }, '삭제')
          ]
        }) : el('div', { style: 'text-align:center;padding:30px;color:#9CA3AF' }, '등록된 평가기관이 없습니다.')
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
        el('span', { style: 'font-size:12px;color:#9ca3af' }, `${logs.length}건`),
        ...categories.map(cat => el('button', { className: 'btn btn-sm', style: `font-size:11px;background:${_auditFilter === cat.value ? '#1E3A5F' : '#EEF1F4'};color:${_auditFilter === cat.value ? '#fff' : '#6b7280'};border:1px solid ${_auditFilter === cat.value ? '#1E3A5F' : '#e4e7eb'}`, onClick: () => { _auditFilter = cat.value; renderAuditLogs() } }, cat.label)),
        el('div', { style: 'flex:1' }),
        el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { if (confirm('모든 감사 로그를 삭제하시겠습니까?')) { Store.data.auditLogs = []; Store._save(); renderAuditLogs(); showToast('로그가 삭제되었습니다.', 'success') } } }, '🗑 전체 삭제')
      )
    )
    if (!logs.length) {
      c.append(el('div', { className: 'card', style: 'text-align:center;padding:40px;color:#9CA3AF' }, '📋 감사 로그가 없습니다.'))
      return
    }
    const table = el('div', { className: 'card', style: 'padding:0;overflow:hidden' })
    const header = el('div', { style: 'display:grid;grid-template-columns:140px 100px 1fr 120px;font-size:11px;font-weight:600;color:#9ca3af;padding:10px 16px;border-bottom:2px solid #eef1f4;background:#F8FAFC' }, el('span', {}, '일시'), el('span', {}, '유형'), el('span', {}, '상세'), el('span', {}, '작업자'))
    table.append(header)
    logs.slice(0, 200).forEach((log, idx) => {
      const bgColor = log.category === '사용자삭제' ? '#fef2f2' : log.category === '로그인' ? '#f0fdf4' : '#fff'
      table.append(el('div', { style: `display:grid;grid-template-columns:140px 100px 1fr 120px;font-size:12px;padding:8px 16px;border-bottom:1px solid #F8FAFC;background:${bgColor};${idx === logs.length - 1 ? 'border-bottom:none' : ''}` },
        el('span', { style: 'color:#9ca3af;font-size:11px' }, _formatDateTime(log.created_at)),
        el('span', { style: 'display:flex;align-items:center;gap:4px' }, el('span', {}, actionIcons[log.action] || '📝'), el('span', { style: 'font-weight:500' }, log.action)),
        el('span', { style: 'color:#6B7280;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, log.detail || ''),
        el('span', { style: 'color:#9ca3af' }, log.user_name || '시스템')
      ))
    })
    c.append(table)
  }

  // ==================== Settings: AI 연결 ====================
  function renderAIConfig() {
    const c = document.getElementById('aicfg-content')
    if (!c) return
    const cfg = Store.getAIConfig()
    const presets = {
      opencode: { endpoint: '/api/opencode/generate', model: 'big-pickle', hint: '내부 게이트웨이(open). 별도 키 없이 동작하는 호스팅 환경에서 사용합니다.' },
      openai: { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', hint: 'OpenAI 호환 Chat Completions API. API 키가 필요합니다.' },
      anthropic: { endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-3-5-sonnet-latest', hint: 'Anthropic Messages API. API 키가 필요합니다.' },
      gemini: { endpoint: '', model: 'gemini-1.5-flash', hint: 'Google Gemini. 엔드포인트를 비우면 모델명으로 자동 생성합니다. (무료 티어, API 키 필요)' },
      groq: { endpoint: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile', hint: 'Groq 무료 티어. OpenAI 호환 API로 응답이 매우 빠릅니다. (console.groq.com에서 API 키 발급)' },
      ollama: { endpoint: 'http://localhost:11434/api/chat', model: 'llama3.1', hint: '로컬 Ollama 서버. 같은 PC에서 실행 중일 때 사용합니다. (완전 무료·데이터 외부 유출 없음)' },
      custom: { endpoint: cfg.endpoint, model: cfg.model, hint: 'OpenAI 호환 엔드포인트를 직접 지정합니다.' }
    }
    const state = { ...cfg, fallbacks: (cfg.fallbacks || []).map(f => ({ ...f })) }
    const inputStyle = 'width:100%;padding:9px 11px;border:1px solid #e4e7eb;border-radius:8px;font-size:13px;outline:none'
    const labelStyle = 'font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;display:block'
    const status = el('div', { style: 'font-size:12px;min-height:20px;margin-top:2px;color:#6b7280;line-height:1.6' })

    const providerSel = el('select', { id: 'aicfg-provider', style: inputStyle, onChange: e => {
      state.provider = e.target.value
      const p = presets[state.provider]
      if (p) { state.endpoint = p.endpoint; state.model = p.model; endpointInput.value = p.endpoint; modelInput.value = p.model }
      hint.textContent = p ? p.hint : ''
    } }, Object.keys(presets).map(k => el('option', { value: k, selected: state.provider === k }, k)))
    const endpointInput = el('input', { id: 'aicfg-endpoint', type: 'text', value: state.endpoint, style: inputStyle, placeholder: 'https://... 또는 /api/opencode/generate', onInput: e => { state.endpoint = e.target.value } })
    const modelInput = el('input', { id: 'aicfg-model', type: 'text', value: state.model, style: inputStyle, onInput: e => { state.model = e.target.value } })
    const keyInput = el('input', { id: 'aicfg-key', type: 'password', value: state.apiKey, style: inputStyle, placeholder: 'sk-... (이 브라우저에만 저장됩니다)', onInput: e => { state.apiKey = e.target.value } })
    const tempInput = el('input', { id: 'aicfg-temp', type: 'number', min: 0, max: 2, step: 0.1, value: state.temperature, style: inputStyle, onInput: e => { state.temperature = parseFloat(e.target.value) } })
    const maxInput = el('input', { id: 'aicfg-max', type: 'number', min: 256, max: 32000, step: 256, value: state.maxTokens, style: inputStyle, onInput: e => { state.maxTokens = parseInt(e.target.value) || 2000 } })
    const hint = el('div', { style: 'font-size:12px;color:#9ca3af;line-height:1.6;margin-top:-2px;margin-bottom:2px' }, presets[state.provider]?.hint || '')

    const save = () => {
      Store.setAIConfig({
        provider: state.provider, endpoint: state.endpoint, model: state.model, apiKey: state.apiKey,
        temperature: state.temperature, maxTokens: state.maxTokens,
        fallbacks: state.fallbacks.map(f => ({ provider: f.provider, endpoint: f.endpoint || '', model: f.model || '', apiKey: f.apiKey || '' }))
      })
      showToast('AI 연결 설정을 저장했습니다.', 'success')
      status.style.color = '#059669'; status.textContent = '저장됨 · ' + state.provider + ' · ' + state.model + (state.fallbacks.length ? ' (+폴백 ' + state.fallbacks.length + '단계)' : '')
    }
    const test = async () => {
      save()
      status.style.color = '#6b7280'; status.textContent = '연결 테스트 중...'
      const r = await AI.testConnection()
      if (r.ok) {
        status.style.color = '#059669'
        const fbUsed = r.tried && r.tried.length
        status.textContent = '✅ 연결 성공 · 사용 제공자: ' + r.provider + (fbUsed ? ' (앞선 ' + fbUsed + '개 실패 후 폴백)' : '') + ' · 응답: ' + r.sample
      } else { status.style.color = '#dc2626'; status.textContent = '❌ ' + r.error }
    }

    const field = (label, control, extra) => el('div', { style: Object.assign({ minWidth: 0 }, extra || {}) }, el('label', { style: labelStyle }, label), control)

    const fbContainer = el('div', { style: 'display:flex;flex-direction:column;gap:10px' })
    const renderFallbackRows = () => {
      fbContainer.innerHTML = ''
      if (!state.fallbacks.length) {
        fbContainer.append(el('div', { style: 'font-size:12px;color:#9ca3af;padding:4px 0' }, '폴백 없음 — 기본 제공자만 사용합니다. (장애 대비용으로 추가를 권장)'))
        return
      }
      state.fallbacks.forEach((fb, idx) => {
        const provSel = el('select', { style: inputStyle, onChange: e => { fb.provider = e.target.value; const p = presets[fb.provider]; if (p) { fb.endpoint = p.endpoint; fb.model = p.model } renderFallbackRows() } },
          Object.keys(presets).filter(k => k !== 'custom').map(k => el('option', { value: k, selected: fb.provider === k }, k)))
        const epIn = el('input', { type: 'text', value: fb.endpoint || '', placeholder: '엔드포인트 (비우면 기본값)', style: inputStyle, onInput: e => { fb.endpoint = e.target.value } })
        const mdIn = el('input', { type: 'text', value: fb.model || '', placeholder: '모델', style: inputStyle, onInput: e => { fb.model = e.target.value } })
        const kyIn = el('input', { type: 'password', value: fb.apiKey || '', placeholder: 'API 키', style: inputStyle, onInput: e => { fb.apiKey = e.target.value } })
        fbContainer.append(el('div', { style: 'border:1px solid #e4e7eb;border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;background:#FCFDFE' },
          el('div', { style: 'display:flex;gap:8px;align-items:center' },
            el('span', { style: 'font-size:12px;font-weight:800;color:#0f766e;min-width:28px' }, '#' + (idx + 1)),
            el('div', { style: 'flex:1' }, provSel),
            el('button', { className: 'btn btn-sm btn-secondary', disabled: idx === 0, title: '위로', onClick: () => { const t = state.fallbacks[idx - 1]; state.fallbacks[idx - 1] = state.fallbacks[idx]; state.fallbacks[idx] = t; renderFallbackRows() } }, '↑'),
            el('button', { className: 'btn btn-sm btn-secondary', disabled: idx === state.fallbacks.length - 1, title: '아래로', onClick: () => { const t = state.fallbacks[idx + 1]; state.fallbacks[idx + 1] = state.fallbacks[idx]; state.fallbacks[idx] = t; renderFallbackRows() } }, '↓'),
            el('button', { className: 'btn btn-sm btn-secondary', title: '삭제', onClick: () => { state.fallbacks.splice(idx, 1); renderFallbackRows() } }, '✕')),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
            el('div', { style: 'flex:1 1 220px' }, epIn),
            el('div', { style: 'flex:1 1 150px' }, mdIn),
            el('div', { style: 'flex:1 1 150px' }, kyIn))))
      })
    }
    renderFallbackRows()

    c.innerHTML = ''
    c.append(
      el('div', { className: 'card' },
        el('div', { className: 'card-header' }, el('h3', {}, '🤖 AI 연결 설정')),
        el('div', { style: 'padding:16px;display:flex;flex-direction:column;gap:10px' },
          el('div', { style: 'font-size:12px;color:#6b7280;line-height:1.7;padding:10px 12px;background:#F8FAFC;border-radius:8px' },
            '보고서 작성기·AI 초안·컴플라이언스 점검 등 모든 AI 기능이 이 연결을 사용합니다. ',
            el('strong', {}, '엔드포인트가 잘못되거나 서버에 연결할 수 없으면 AI 기능은 오류를 표시하며, 점검류는 키워드 기반 로컬 점검으로 자동 대체됩니다.'),
            ' API 키는 서버로만 전송되며 이 브라우저(localStorage)에만 저장되고 Supabase에는 동기화되지 않습니다.'),
          field('제공자', providerSel),
          hint,
          field('엔드포인트 URL', endpointInput),
          field('모델', modelInput),
          field('API 키 (선택)', keyInput),
          el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap' },
            field('Temperature', tempInput, { flex: '1 1 140px' }),
            field('Max tokens', maxInput, { flex: '1 1 140px' })),
          el('div', { style: 'border-top:1px dashed #e4e7eb;padding-top:12px;margin-top:2px;display:flex;flex-direction:column;gap:8px' },
            el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap' },
              el('div', {},
                el('div', { style: 'font-size:13px;font-weight:800;color:#0f3d3e' }, '🔁 폴백 체인 (자동 재시도)'),
                el('div', { style: 'font-size:11.5px;color:#6b7280;margin-top:2px' }, '기본 제공자가 실패하면 위에서부터 순서대로 다음 제공자를 시도합니다. 무료 조합 예: Groq → Gemini → Ollama')),
              el('button', { className: 'btn btn-sm btn-secondary', onClick: () => { state.fallbacks.push({ provider: 'groq', endpoint: presets.groq.endpoint, model: presets.groq.model, apiKey: '' }); renderFallbackRows() } }, '＋ 폴백 추가')),
            fbContainer),
          el('div', { style: 'display:flex;gap:8px' },
            el('button', { className: 'btn btn-primary', onClick: save }, '💾 저장'),
            el('button', { className: 'btn btn-secondary', onClick: test }, '🔌 연결 테스트')),
          status))
    )
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
    if (tabId === 'tab-aicfg') renderAIConfig()
    if (tabId === 'tab-audit') renderAuditLogs()
  }

  function switchUserListTab(tab) {
    _userListTab = tab
    document.querySelectorAll('#tab-users .card-header .btn').forEach(b => {
      const isPending = b.textContent.includes('승인대기')
      b.style.background = isPending === (tab === 'pending') ? '#2d5427' : '#e8eaed'
      b.style.color = isPending === (tab === 'pending') ? '#fff' : '#6B7280'
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
        <label style="font-size:12px">아이디 *<input id="a-username" required style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">비밀번호 *<input id="a-password" type="password" required minlength="6" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">이름 *<input id="a-name" required style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">이메일<input id="a-email" type="email" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">전화번호<input id="a-phone" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">회사<select id="a-company" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="">선택</option>${companyOpts}</select></label>
        <label style="font-size:12px">부서<select id="a-dept" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="">선택</option>${deptOpts}</select></label>
        <label style="font-size:12px">직급<input id="a-position" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"></label>
        <label style="font-size:12px">역할<select id="a-role" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="user">일반 사용자</option><option value="manager">매니저</option><option value="admin">관리자</option><option value="viewer">뷰어</option></select></label>
        <label style="font-size:12px">상태<select id="a-status" style="width:100%;padding:7px 10px;border:1px solid #e4e7eb;border-radius:6px;font-size:13px;box-sizing:border-box"><option value="active">활성</option><option value="pending">승인대기</option></select></label>
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
    const u = Store.getUser(id)
    Store.updateUser(id, { status: 'active' })
    Store.addAuditLog({ category: '사용자관리', action: '사용자 승인', user_id: currentUser.id, user_name: currentUser.name, detail: `대상: ${u?.name || id} (${u?.username || ''})` })
    showToast('사용자가 승인되었습니다.', 'success')
    const pc = document.getElementById('pending-count')
    if (pc) pc.textContent = Store.getUsers().filter(u => u.status !== 'active').length
    if (_userListTab === 'pending' && Store.getUsers().filter(u => u.status !== 'active').length === 0) switchUserListTab('all')
    else renderUsers()
  }

  function editUser(id) {
    const user = Store.getUser(id)
    if (!user) return
    const form = document.createElement('form')
    const companies = Store.getCompanies()
    const depts = Store.getDepartments().filter(d => d.is_active !== false)
    const companyOptions = companies.map(c => `<option value="${c.id}" ${user.company_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')
    const deptOptions = depts.map(d => `<option value="${d.dept_code}" ${user.dept_code === d.dept_code ? 'selected' : ''}>${d.dept_name}</option>`).join('')
    form.innerHTML = `
      <div class="form-group"><label>아이디</label><input id="f-uid" value="${esc(user.username)}" readonly style="background:#F8FAFC"></div>
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
    const u = Store.getUser(id)
    if (!u) return
    if (currentUser && String(currentUser.id) === String(id)) { alert('본인 계정은 삭제할 수 없습니다.'); return }
    const counts = Store.countUserData(id)
    const others = Store.getUsers().filter(x => String(x.id) !== String(id) && x.status === 'active')
    const sameCo = others.filter(x => x.company_id != null && u.company_id != null && String(x.company_id) === String(u.company_id))
    const rest = others.filter(x => !sameCo.includes(x))

    const rows = Object.keys(counts).filter(k => k !== 'total').map(k =>
      el('tr', {},
        el('td', { style: 'padding:6px 10px;border-bottom:1px solid #EEF1F4' }, Store.ownerLabel(k)),
        el('td', { style: 'padding:6px 10px;border-bottom:1px solid #EEF1F4;text-align:right;font-weight:600' }, String(counts[k]))
      )
    )

    const body = el('div', {},
      el('div', { style: 'padding:12px;background:#FEF3F2;border:1px solid #FECDCA;border-radius:10px;color:#B42318;font-size:13px;marginBottom:14px' },
        el('div', { style: 'font-weight:700;marginBottom:4px' }, '⚠️ 사용자 삭제 — 데이터 이관 필요'),
        el('div', {}, `${u.name || u.username}(${u.username}) 님을 삭제하면 아래 자료의 소유자가 사라집니다. 삭제 전에 반드시 이관자를 지정해야 합니다.`)
      ),
      counts.total > 0
        ? el('div', { style: 'marginBottom:14px' },
            el('table', { style: 'width:100%;border-collapse:collapse;font-size:13px' },
              el('thead', {}, el('tr', {},
                el('th', { style: 'padding:6px 10px;text-align:left;border-bottom:2px solid #EEF4FA;color:#6B7280;font-size:12px' }, '연관 자료'),
                el('th', { style: 'padding:6px 10px;text-align:right;border-bottom:2px solid #EEF4FA;color:#6B7280;font-size:12px' }, '건수')
              )),
              el('tbody', {}, ...rows,
                el('tr', {}, el('td', { style: 'padding:6px 10px;font-weight:700' }, '합계'), el('td', { style: 'padding:6px 10px;text-align:right;font-weight:700' }, String(counts.total)))
              )
            )
          )
        : el('div', { style: 'padding:12px;background:#F8FAFC;border-radius:10px;color:#6B7280;font-size:13px;marginBottom:14px' }, '연관된 자료가 없습니다.'),
      counts.total > 0
        ? el('label', { style: 'display:block;font-size:12px;font-weight:600;color:#374151;marginBottom:6px' }, '이관자 선택 *')
        : null,
      counts.total > 0
        ? el('select', { id: 'del-successor', style: 'width:100%;padding:10px 12px;border:2px solid #EEF1F4;border-radius:10px;font-size:14px;box-sizing:border-box' },
            el('option', { value: '' }, '— 이관자를 선택하세요 —'),
            sameCo.length ? el('optgroup', { label: '같은 회사 사용자' }, ...sameCo.map(x => el('option', { value: String(x.id) }, `${x.name || x.username} (${x.username})${x.role === 'admin' ? ' · 관리자' : ''}`))) : null,
            rest.length ? el('optgroup', { label: '그 외 사용자' }, ...rest.map(x => el('option', { value: String(x.id) }, `${x.name || x.username} (${x.username})${x.role === 'admin' ? ' · 관리자' : ''}`))) : null
          )
        : null,
      (counts.total > 0 && !others.length)
        ? el('div', { style: { marginTop: 10, padding: 10, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, color: '#92400E', fontSize: 12 } }, '이관할 수 있는 활성 사용자가 없습니다. 먼저 이관자를 추가하거나 활성화하세요.')
        : null
    )
    modal(`사용자 삭제 — ${u.name || u.username}`, body)
    const saveBtn = document.getElementById('modal-save')
    saveBtn.textContent = counts.total > 0 ? '이관 후 삭제' : '삭제'
    if (counts.total > 0) {
      const sel = document.getElementById('del-successor')
      const update = () => { const ok = !!sel.value; saveBtn.disabled = !ok; saveBtn.style.opacity = ok ? '' : '.5'; saveBtn.style.cursor = ok ? 'pointer' : 'not-allowed' }
      sel.addEventListener('change', update); update()
    }
    saveBtn.onclick = () => {
      let toId = null
      if (counts.total > 0) {
        const sel = document.getElementById('del-successor')
        if (!sel || !sel.value) { alert('이관자를 선택해야 삭제할 수 있습니다.'); return }
        toId = sel.value
      }
      const target = toId != null ? Store.getUser(toId) : null
      const moved = Store.transferUserData(id, toId)
      Store.deleteUser(id)
      Store.addAuditLog({ category: '사용자삭제', action: '사용자 삭제', user_id: currentUser?.id || null, user_name: currentUser?.name || '', detail: `대상: ${u.name || id} (${u.username}), 이관자: ${target ? (target.name || target.username) : '없음'}, 이관 자료: ${moved.total}건` })
      showToast(moved.total > 0 ? `사용자가 삭제되고 자료 ${moved.total}건이 이관되었습니다.` : '사용자가 삭제되었습니다.', 'success')
      closeModal(); renderUsers()
    }
  }

  function mergeDuplicateUsers() {
    if (!currentUser || currentUser.role !== 'admin') return alert('관리자만 실행할 수 있습니다.')
    const groups = Store.duplicateUserGroups()
    if (!groups.length) { showToast('중복된 아이디가 없습니다.', 'success'); return }

    const memberRow = (u) => {
      const c = Store.countUserData(u.id)
      const co = Store.getCompanies().find(x => String(x.id) === String(u.company_id))
      return el('tr', { style: 'border-bottom:1px solid #EEF1F4' },
        el('td', { style: 'padding:6px 8px' }, el('input', { type: 'radio', name: 'keep-' + u.username, value: String(u.id), className: 'keep-pick', 'data-username': u.username })),
        el('td', { style: 'padding:6px 8px' }, (u.name || '-') + ' (' + u.username + ')'),
        el('td', { style: 'padding:6px 8px;color:#6B7280' }, co ? co.name : '-'),
        el('td', { style: 'padding:6px 8px;color:#6B7280' }, u.email || '-'),
        el('td', { style: 'padding:6px 8px;text-align:right' }, String(c.total) + '건'),
        el('td', { style: 'padding:6px 8px' }, u.status === 'active' ? '활성' : '대기'))
    }
    const body = el('div', {},
      el('div', { style: 'padding:12px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;color:#1E40AF;font-size:13px;margin-bottom:14px' },
        el('div', { style: 'font-weight:700;margin-bottom:4px' }, '중복 아이디 정리'),
        el('div', {}, '각 아이디마다 남길(유지) 계정을 선택하세요. 나머지 계정의 자료는 선택한 계정으로 이관된 뒤 삭제됩니다.')),
      groups.map(g => el('div', { style: { marginBottom: 14 } },
        el('div', { style: { fontWeight: 700, fontSize: 13, marginBottom: 6 } }, '아이디: ' + g.username),
        el('table', { style: 'width:100%;border-collapse:collapse;font-size:12.5px' },
          el('thead', {}, el('tr', { style: 'color:#6B7280' },
            el('th', { style: 'text-align:left;padding:4px 8px' }, '유지'),
            el('th', { style: 'text-align:left;padding:4px 8px' }, '이름'),
            el('th', { style: 'text-align:left;padding:4px 8px' }, '회사'),
            el('th', { style: 'text-align:left;padding:4px 8px' }, '이메일'),
            el('th', { style: 'text-align:right;padding:4px 8px' }, '보유자료'),
            el('th', { style: 'text-align:left;padding:4px 8px' }, '상태'))),
          el('tbody', {}, ...g.members.map(memberRow))))))
    modal('중복 아이디 정리', body)
    const saveBtn = document.getElementById('modal-save')
    saveBtn.textContent = '선택 계정으로 병합'
    saveBtn.onclick = () => {
      const prefer = {}
      groups.forEach(g => {
        const picked = document.querySelector('input.keep-pick[data-username="' + CSS.escape(g.username) + '"]:checked')
        if (picked) prefer[String(g.username).trim().toLowerCase()] = picked.value
      })
      const before = Store.getUsers().length
      const merged = Store.mergeDuplicateUsers(prefer)
      if (!merged) { showToast('병합할 중복 계정이 없습니다.', 'success'); closeModal(); return }
      Store.addAuditLog({ category: '사용자관리', action: '중복 아이디 병합', user_id: currentUser.id, user_name: currentUser.name, detail: `중복 계정 ${merged}건을 병합했습니다. (${before} → ${Store.getUsers().length})` })
      showToast(`중복 계정 ${merged}건을 병합했습니다.`, 'success')
      closeModal(); renderUsers(); applyAuthUI()
    }
  }

  function cleanupUsers() {
    if (!currentUser) return alert('로그인이 필요합니다.')
    const pending = Store.getUsers().filter(u => u.id !== currentUser.id && u.status !== 'active')
    if (!pending.length) return alert('미승인 대기 회원이 없습니다.')
    if (!confirm(`미승인 회원 ${pending.length}명을 삭제하시겠습니까?`)) return
    if (!confirm('정말입니까? 이 작업은 되돌릴 수 없습니다.')) return
    pending.forEach(u => { Store.addAuditLog({ category: '사용자삭제', action: '일괄 삭제', user_id: currentUser.id, user_name: currentUser.name, detail: `대상: ${u.name} (${u.username})` }); Store.transferUserData(u.id, currentUser.id); Store.deleteUser(u.id) })
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
      slider.style.background = '#1E3A5F'
      status.textContent = '🟢 실행 중 — 6일마다 Supabase 자동 접속'
      _doKeepAlive()
      _keepAliveTimer = setInterval(_doKeepAlive, 6 * 24 * 60 * 60 * 1000)
    } else {
      slider.style.background = '#D0D5DD'
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
      if (slider) slider.style.background = saved ? '#1E3A5F' : '#D0D5DD'
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
    if (_suppressOverlayClose && Date.now() < _suppressOverlayClose) return
    if (e && e.target !== document.getElementById('modal-overlay') && !e.target.closest('#modal')) return
    document.getElementById('modal-overlay').classList.add('hidden')
    _refRte = null
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
  window.mergeDuplicateUsers = mergeDuplicateUsers
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
  window.renderAIConfig = renderAIConfig
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
  window.renderReferences = renderReferences
  window.renderWriter = renderWriter
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
    let xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/></Style></Styles>\n<Worksheet ss:Name="' + (sheetName || 'Sheet1') + '">\n<Table>\n'
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
      el('p', { style: 'font-size:13px;color:#6b7280;margin-bottom:16px' }, '내보낼 데이터 유형을 선택하세요.'),
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' },
        ['assessments', 'indicators', 'evidence', 'ghg', 'suppliers', 'drafts'].map(type => {
          const labels = { assessments: '📋 평가', indicators: '📌 지표', evidence: '📎 증빙', ghg: '🏭 온실가스', suppliers: '🏢 협력사', drafts: '🤖 AI 초안' }
          const count = (dataMap => dataMap[type]?.length || 0)({ assessments: Store.getAssessments(), indicators: Store.getIndicators(), evidence: Store.getEvidences(), ghg: Store.getGHGActivities(), suppliers: Supplier.getAll(), drafts: Store.getAIDrafts() })
          return el('button', { className: 'btn btn-secondary', style: 'text-align:left;padding:12px;display:flex;justify-content:space-between;align-items:center', onClick: () => { closeModal(); window.exportData(type) } },
            el('span', {}, labels[type] || type),
            el('span', { style: 'font-size:11px;color:#9CA3AF' }, `${count}건`)
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
