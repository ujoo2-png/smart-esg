// 대시보드 시각화 모듈
// 부문별 점수, 준비도, 위험도, 미완료 과제

const Dashboard = {
  _dragState: null,
  _cardOrder: null,

  _head(icon, title) {
    return `<div class="dash-card-head"><span class="dash-card-ico">${icon}</span><h3>${title}</h3></div>`
  },

  render(containerId, assessmentId) {
    const container = document.getElementById(containerId)
    if (!container) return

    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) {
      container.innerHTML = '<p>평가 데이터가 없습니다.</p>'
      return
    }

    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const groups = Indicator.getGroups(assessment.authority_code)
    const evidenceCount = Evidence.countByStatus(assessmentId)
    const drafts = Store.getAIDrafts().filter(d => d.assessment_id === assessmentId)
    const ghgSummary = GHG.getSummary(assessmentId)

    const cardIds = ['score', 'workflow', 'themeRadar', 'evidence', 'draftStatus', 'ghg', 'supplierRisk', 'completion', 'kssb', 'aiUnapproved', 'budget', 'ghgTrend', 'deadline']
    const cardContents = {
      score: this._scoreCard(assessment),
      workflow: this._workflowCard(assessmentId),
      themeRadar: this._themeRadar(items, groups, assessment.authority_code),
      evidence: this._evidenceCard(evidenceCount),
      draftStatus: this._draftStatusCard(drafts),
      ghg: this._ghgCard(ghgSummary),
      supplierRisk: this._supplierRiskCard(),
      completion: this._completionCard(items),
      kssb: this._kssbSubmissionCard(),
      aiUnapproved: this._aiUnapprovedCard(assessmentId),
      budget: this._budgetProgressCard(),
      ghgTrend: this._ghgTrendCard(assessmentId),
      deadline: this._submissionDeadlineCard()
    }

    if (!this._cardOrder) {
      const saved = localStorage.getItem('smartesg_dash_order')
      this._cardOrder = saved ? JSON.parse(saved) : cardIds.slice()
    }
    const orderedIds = this._cardOrder.filter(id => cardIds.includes(id))
    cardIds.forEach(id => { if (!orderedIds.includes(id)) orderedIds.push(id) })

    container.innerHTML = ''
    const grid = document.createElement('div')
    grid.id = 'dash-drag-grid'
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;position:relative'
    const guideLine = document.createElement('div')
    guideLine.id = 'dash-snap-guide'
    guideLine.style.cssText = 'display:none;position:absolute;background:rgba(5,150,105,.12);border:1px dashed #059669;border-radius:4px;z-index:50;pointer-events:none;transition:all .15s'
    container.append(grid, guideLine)

    orderedIds.forEach((id, idx) => {
      const contentWrap = document.createElement('div')
      contentWrap.innerHTML = cardContents[id] || ''
      const card = el('div', {
        className: 'dash-card',
        'data-card-id': id,
        draggable: 'true',
        style: 'position:relative;cursor:default',
        onDragStart: e => {
          Dashboard._dragState = { id, startIdx: idx }
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', id)
          setTimeout(() => { e.target.style.opacity = '0.4'; e.target.style.transform = 'scale(0.98)' }, 0)
        },
        onDragEnd: e => {
          e.target.style.opacity = '1'; e.target.style.transform = ''
          Dashboard._dragState = null
          guideLine.style.display = 'none'
          grid.querySelectorAll('.dash-card').forEach(c => { c.style.borderTop = ''; c.style.paddingTop = '' })
        },
        onDragOver: e => {
          e.preventDefault()
          if (!Dashboard._dragState) return
          const targetRect = e.currentTarget.getBoundingClientRect()
          const midY = targetRect.top + targetRect.height / 2
          guideLine.style.display = 'block'
          guideLine.style.left = targetRect.left + 'px'
          guideLine.style.width = targetRect.width + 'px'
          guideLine.style.height = '3px'
          guideLine.style.top = (e.clientY < midY ? targetRect.top : targetRect.bottom) + 'px'
        },
        onDrop: e => {
          e.preventDefault()
          if (!Dashboard._dragState) return
          const fromId = Dashboard._dragState.id
          const toId = id
          if (fromId === toId) return
          const fromIdx = Dashboard._cardOrder.indexOf(fromId)
          Dashboard._cardOrder.splice(fromIdx, 1)
          const targetRect = e.currentTarget.getBoundingClientRect()
          const insertIdx = e.clientY < targetRect.top + targetRect.height / 2 ? Dashboard._cardOrder.indexOf(toId) : Dashboard._cardOrder.indexOf(toId) + 1
          Dashboard._cardOrder.splice(insertIdx, 0, fromId)
          localStorage.setItem('smartesg_dash_order', JSON.stringify(Dashboard._cardOrder))
          Dashboard._dragState = null
          Dashboard.render(containerId, assessmentId)
        }
      })
      const handle = document.createElement('div')
      handle.style.cssText = 'position:absolute;top:10px;right:12px;font-size:12px;color:#cbd5e1;cursor:grab;user-select:none;z-index:5'
      handle.textContent = '\u22EE'
      handle.title = '드래그하여 순서 변경'
      card.append(handle, contentWrap)
      grid.append(card)
    })

    requestAnimationFrame(() => {
      container.querySelectorAll('.dash-bar-init').forEach(bar => {
        const w = bar.getAttribute('data-width')
        bar.style.width = w + '%'
        bar.classList.remove('dash-bar-init')
      })
      container.querySelectorAll('[data-countup]').forEach(el => {
        const target = parseFloat(el.getAttribute('data-countup'))
        const suffix = el.getAttribute('data-suffix') || ''
        const decimals = (el.getAttribute('data-decimals') || '0') | 0
        const duration = 800
        const start = performance.now()
        const animate = (now) => {
          const progress = Math.min((now - start) / duration, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          const val = (target * eased).toFixed(decimals)
          el.textContent = val + suffix
          if (progress < 1) requestAnimationFrame(animate)
        }
        requestAnimationFrame(animate)
      })
    })
  },

  _scoreCard(assessment) {
    const gradeColor = rating => {
      const colors = { Platinum: '#0f766e', Gold: '#059669', Silver: '#2563EB', Bronze: '#d97706', 우수: '#059669', 양호: '#2563EB', 보통: '#d97706', 미흡: '#dc2626' }
      return colors[rating] || '#1E3A5F'
    }
    const score = assessment.total_score
    const color = gradeColor(assessment.rating)
    return `
${this._head('🎯', '총점')}
<div class="dash-kpi" style="color:${color}" data-countup="${score || 0}" data-decimals="1">0</div>
<div style="margin-top:10px;display:flex;align-items:center;gap:8px">
  <span class="dash-chip" style="background:${color}1a;color:${color}">${assessment.rating ?? '미평가'}</span>
  <span style="font-size:12px;color:var(--c-text-muted)">${assessment.authority_code}</span>
</div>`
  },

  _themeRadar(items, groups, authorityCode) {
    const usePillar = authorityCode === 'ECOVADIS'
    let labels = [], values = []
    if (usePillar) {
      const pillars = ['POLICY', 'ACTION', 'RESULT']
      pillars.forEach(p => {
        const pillarItems = items.filter(i => {
          const ind = Store.getIndicators().find(x => x.id === i.indicator_id)
          return ind && ind.pillar === p
        })
        const avg = pillarItems.length
          ? pillarItems.reduce((sum, i) => sum + (i.score || 0), 0) / pillarItems.length
          : 0
        labels.push(Indicator.getPillarName(p))
        values.push(avg)
      })
    } else {
      groups.forEach(g => {
        const groupItems = items.filter(i => {
          const indicators = Indicator.getIndicators(g.id)
          return indicators.some(ind => ind.id === i.indicator_id)
        })
        const avg = groupItems.length
          ? groupItems.reduce((sum, i) => sum + (i.score || 0), 0) / groupItems.length
          : 0
        labels.push(g.group_name)
        values.push(avg)
      })
    }
    const n = labels.length
    if (!n) return `${this._head('📊', '테마 점수')}<div style="color:var(--c-text-faint);font-size:12px">데이터 없음</div>`
    const cx = 130, cy = 110, r = 80
    const angleStep = (2 * Math.PI) / n
    const toXY = (i, val) => {
      const a = angleStep * i - Math.PI / 2
      const pct = val / 100
      return [cx + r * pct * Math.cos(a), cy + r * pct * Math.sin(a)]
    }
    const gridLevels = [25, 50, 75, 100]
    let svg = `<svg class="radar-svg" viewBox="0 0 260 230" style="width:100%;max-width:260px;display:block;margin:0 auto">`
    gridLevels.forEach(lv => {
      const pts = Array.from({ length: n }, (_, i) => toXY(i, lv).join(',')).join(' ')
      svg += `<polygon points="${pts}" fill="none" stroke="#e4e7eb" stroke-width="1"/>`
    })
    for (let i = 0; i < n; i++) {
      const [x, y] = toXY(i, 100)
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e4e7eb" stroke-width="1"/>`
    }
    const dataPts = values.map((v, i) => toXY(i, v).join(',')).join(' ')
    svg += `<polygon points="${dataPts}" fill="rgba(30,58,95,.14)" stroke="#1E3A5F" stroke-width="2"/>`
    values.forEach((v, i) => {
      const [x, y] = toXY(i, v)
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#059669"/>`
    })
    labels.forEach((l, i) => {
      const [x, y] = toXY(i, 115)
      const anchor = x < cx - 10 ? 'end' : x > cx + 10 ? 'start' : 'middle'
      svg += `<text x="${x}" y="${y}" fill="#6b7280" font-size="10.5" text-anchor="${anchor}">${l}</text>`
    })
    svg += `</svg>`
    return `${this._head('📊', usePillar ? '필러 점수' : '테마 점수')}${svg}`
  },

  _evidenceCard(count) {
    const pct = count.total ? Math.round((count.externally_verified / count.total) * 100) : 0
    return `
${this._head('📎', '증빙 검증률')}
<div class="dash-kpi">${pct}<span style="font-size:18px;font-weight:600">%</span></div>
<div class="dash-kpi-sub">외부검증 ${count.externally_verified}건 / 전체 ${count.total}건</div>
<div class="dash-meter" style="margin:14px 0 10px"><i class="dash-bar dash-bar-init" data-width="${pct}" style="background:linear-gradient(90deg,#059669,#047857)"></i></div>
<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-text-muted)">
  <span>자가 ${count.self}</span><span>내부검토 ${count.internal_reviewed}</span><span>외부검증 ${count.externally_verified}</span>
</div>`
  },

  _draftStatusCard(drafts) {
    const total = drafts.length
    const approved = drafts.filter(d => d.human_status === 'approved').length
    const pending = drafts.filter(d => d.human_status === 'pending').length
    const rejected = drafts.filter(d => d.human_status === 'rejected').length
    const passRate = total ? Math.round((drafts.filter(d => d.ver_status === 'pass').length / total) * 100) : 0
    return `
${this._head('🤖', 'AI 초안 현황')}
<div class="dash-kpi">${total}<span style="font-size:16px;font-weight:600;color:var(--c-text-muted)">건</span></div>
<div class="dash-kpi-sub">AI 검증 통과율 ${passRate}%</div>
<div style="margin-top:14px;display:flex;gap:6px">
  <span class="dash-chip" style="background:#fef3c7;color:#b45309">대기 ${pending}</span>
  <span class="dash-chip" style="background:#d1fae5;color:#047857">승인 ${approved}</span>
  <span class="dash-chip" style="background:#fee2e2;color:#b91c1c">반려 ${rejected}</span>
</div>`
  },

  _ghgCard(summary) {
    const entries = Object.values(summary)
    const totalEmissions = entries.reduce((sum, s) => sum + s.total, 0)
    const details = entries.map(s => {
      const label = s.scope2_method
        ? `Scope 2 (${s.scope2_method === 'location-based' ? 'LB' : 'MB'})`
        : `Scope ${s.scope}`
      return `<div class="dash-row"><span class="dash-row-lbl" style="width:auto;flex:1">${label}</span><span style="font-weight:500">${s.total.toFixed(1)}</span></div>`
    }).join('')
    return `
${this._head('🏭', '온실가스 배출')}
<div class="dash-kpi">${totalEmissions.toFixed(1)}</div>
<div class="dash-kpi-sub">tCO₂eq (총 배출량)</div>
<div style="margin-top:12px">${details || '<div style="color:var(--c-text-faint);font-size:12px">데이터 없음</div>'}</div>`
  },

  _supplierRiskCard() {
    const suppliers = Store.getSuppliers()
    const summary = { total: suppliers.length, A: 0, B: 0, C: 0, D: 0, unscored: 0 }
    const gradeColors = { A: '#059669', B: '#2563EB', C: '#d97706', D: '#dc2626' }
    suppliers.forEach(s => {
      if (s.last_vsme_grade && summary[s.last_vsme_grade] !== undefined) summary[s.last_vsme_grade]++
      else summary.unscored++
    })
    const bars = ['A', 'B', 'C', 'D', 'unscored'].map(g => {
      const count = summary[g]
      const pct = summary.total ? Math.round(count / summary.total * 100) : 0
      const label = g === 'unscored' ? '미진단' : g + '등급'
      const color = g === 'unscored' ? '#cbd5e1' : gradeColors[g]
      return `<div class="dash-row">
        <span class="dash-row-lbl" style="width:46px;color:var(--c-text-muted);text-align:right">${label}</span>
        <div style="flex:1" class="dash-meter"><i class="dash-bar dash-bar-init" data-width="${pct}" style="background:${color}"></i></div>
        <span style="width:22px;font-weight:600;color:${color};text-align:right">${count}</span>
      </div>`
    }).join('')
    return `
${this._head('🏢', '협력사 리스크')}
<div class="dash-kpi">${summary.total}<span style="font-size:16px;font-weight:600;color:var(--c-text-muted)">개사</span></div>
<div style="margin-top:12px">${summary.total ? bars : '<div style="color:var(--c-text-faint);font-size:12px">등록된 협력사 없음</div>'}</div>`
  },

  _completionCard(items) {
    const total = items.length
    const completed = items.filter(i => i.status === 'completed').length
    const excluded = items.filter(i => i.status === 'excluded').length
    const inProgress = items.filter(i => i.status === 'in_progress').length
    const pending = items.filter(i => i.status === 'pending').length
    const pct = total ? Math.round(((completed + excluded) / total) * 100) : 0
    return `
${this._head('✅', '항목 완료율')}
<div class="dash-kpi" data-countup="${pct}" data-suffix="%">0%</div>
<div class="dash-meter" style="margin:14px 0 10px"><i class="dash-bar dash-bar-init" data-width="${pct}" style="background:linear-gradient(90deg,#059669,#047857)"></i></div>
<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--c-text-muted)">
  <span>대기 ${pending}</span><span>진행 ${inProgress}</span><span>완료 ${completed}</span><span>제외 ${excluded}</span>
</div>`
  },

  _kssbSubmissionCard() {
    const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []
    const mandatory = agencies.filter(a => a.track_type === 'MANDATORY')
    const assessments = Store.getAssessments().filter(a => a.authority_code === 'KSSB' || a.authority_code === 'ISSB')
    const onTrack = assessments.length > 0
    return `
${this._head('📜', '법정 공시 현황')}
<div class="dash-kpi" style="font-size:26px;color:${onTrack ? 'var(--c-accent)' : 'var(--c-danger)'}">${onTrack ? '진행중' : '미착수'}</div>
<div class="dash-kpi-sub">대상 기관: ${mandatory.map(a => a.name).join(', ') || '-'}</div>
<div style="font-size:11px;color:var(--c-text-faint);margin-top:8px">KSSB 공시기준 제1호·제2호 | 시행일: ${mandatory[0]?.effective_date || '-'}</div>`
  },

  _aiUnapprovedCard(assessmentId) {
    const drafts = Store.getAIDrafts().filter(d => d.assessment_id === assessmentId)
    const verifiedNotApproved = drafts.filter(d => d.ver_status === 'pass' && d.human_status === 'pending')
    const totalDrafts = drafts.length
    const color = verifiedNotApproved.length > 0 ? 'var(--c-warn)' : 'var(--c-accent)'
    return `
${this._head('🔍', 'AI 미승인 대기')}
<div class="dash-kpi" style="color:${color}">${verifiedNotApproved.length}</div>
<div class="dash-kpi-sub">검증 통과 후 승인 대기 중</div>
<div style="margin-top:10px;font-size:11px;color:var(--c-text-faint)">전체 초안 ${totalDrafts}건</div>`
  },

  _budgetProgressCard() {
    const budget = Store.getProjectBudget ? Store.getProjectBudget() : []
    const totalPlanned = budget.reduce((s, b) => s + (b.planned_amount || 0), 0)
    const totalActual = budget.reduce((s, b) => s + (b.actual_amount || 0), 0)
    const rate = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0
    const barColor = rate > 100 ? '#dc2626' : rate > 80 ? '#d97706' : '#059669'
    const cappedRate = Math.min(rate, 100)
    return `
${this._head('💰', '예산 집행률')}
<div class="dash-kpi" style="color:${barColor}" data-countup="${totalPlanned ? rate : 0}" data-suffix="%">0%</div>
<div class="dash-meter" style="margin:14px 0 10px"><i class="dash-bar dash-bar-init" data-width="${cappedRate}" style="background:${barColor}"></i></div>
<div style="font-size:11px;color:var(--c-text-muted)">계획 ₩${(totalPlanned/10000).toFixed(0)}만 · 집행 ₩${(totalActual/10000).toFixed(0)}만</div>`
  },

  _ghgTrendCard(assessmentId) {
    const activities = Store.getGHGActivities().filter(a => a.assessment_id === assessmentId)
    const scope1 = activities.filter(a => a.scope === 1).reduce((s, a) => s + (a.co2eq || 0), 0)
    const scope2lb = activities.filter(a => a.scope === 2 && a.scope2_method === 'location-based').reduce((s, a) => s + (a.co2eq || 0), 0)
    const scope2mb = activities.filter(a => a.scope === 2 && a.scope2_method === 'market-based').reduce((s, a) => s + (a.co2eq || 0), 0)
    const scope3 = activities.filter(a => a.scope === 3).reduce((s, a) => s + (a.co2eq || 0), 0)
    const scopes = [
      { label: 'Scope 1', value: scope1, color: '#1E3A5F' },
      { label: 'Scope 2 (LB)', value: scope2lb, color: '#2563EB' },
      { label: 'Scope 2 (MB)', value: scope2mb, color: '#059669' },
      { label: 'Scope 3', value: scope3, color: '#7c8da6' }
    ].filter(s => s.value > 0)
    const maxVal = Math.max(...scopes.map(s => s.value), 1)
    const rows = scopes.map(s => `
      <div class="dash-row">
        <span class="dash-row-lbl" style="width:74px;color:var(--c-text-muted)">${s.label}</span>
        <div style="flex:1" class="dash-meter"><i class="dash-bar dash-bar-init" data-width="${(s.value/maxVal*100).toFixed(0)}" style="background:${s.color}"></i></div>
        <span style="width:52px;text-align:right;font-weight:500">${s.value.toFixed(1)}</span>
      </div>`).join('')
    return `
${this._head('📈', 'Scope 배출 분포')}
${scopes.length ? rows : '<div style="color:var(--c-text-faint);font-size:12px">데이터 없음</div>'}
<div style="font-size:11px;color:var(--c-text-faint);margin-top:8px">단위: tCO₂eq</div>`
  },

  _workflowCard(assessmentId) {
    const stats = Store.getWorkflowStats(assessmentId)
    const notifs = Store.getUnreadNotifications()
    const notifCount = notifs.length
    return `
${this._head('⚡', '자동 워크플로우')}
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
  <div style="background:var(--c-primary-soft);padding:12px;border-radius:var(--radius-sm);text-align:center">
    <div style="font-size:22px;font-weight:700;color:var(--c-primary)">${stats.completionPct}%</div>
    <div style="font-size:11px;color:var(--c-text-muted)">평가 완료율</div>
  </div>
  <div style="background:var(--c-accent-soft);padding:12px;border-radius:var(--radius-sm);text-align:center">
    <div style="font-size:22px;font-weight:700;color:var(--c-accent)">${stats.evidencePct}%</div>
    <div style="font-size:11px;color:var(--c-text-muted)">증빙 연결률</div>
  </div>
</div>
<div style="font-size:12px;line-height:2;color:var(--c-text)">
  <div>총 항목 <strong>${stats.total}</strong>건 · 완료 <strong>${stats.completed}</strong>건</div>
  <div>증빙 연결 <strong>${stats.withEvidence}</strong>건 · 미연결 <strong>${stats.total - stats.withEvidence}</strong>건</div>
  ${stats.overdue > 0 ? '<div style="color:var(--c-danger)">마감 초과 <strong>' + stats.overdue + '</strong>건</div>' : ''}
  ${stats.dueSoon > 0 ? '<div style="color:var(--c-warn)">마감 임박 <strong>' + stats.dueSoon + '</strong>건</div>' : ''}
  ${notifCount > 0 ? '<div style="color:var(--c-secondary)">읽지 않은 알림 <strong>' + notifCount + '</strong>건</div>' : ''}
</div>
<div style="display:flex;gap:6px;margin-top:14px;flex-wrap:wrap">
  <button onclick="navigate('assessment')" class="btn btn-sm btn-secondary">평가 관리</button>
  <button onclick="navigate('evidence')" class="btn btn-sm btn-secondary">증빙 관리</button>
  <button onclick="navigate('indicator')" class="btn btn-sm btn-secondary">지표 관리</button>
</div>`
  },

  _submissionDeadlineCard() {
    const today = new Date()
    const agencies = Store.getAgencyMaster().filter(a => a.submission_window)
    if (!agencies.length) return ''
    const items = agencies.map(a => {
      const [start, end] = a.submission_window.split('~')
      const [sm, sd] = start.split('-').map(Number)
      const [em, ed] = end.split('-').map(Number)
      const thisYear = today.getFullYear()
      const startDate = new Date(thisYear, sm - 1, sd)
      const endDate = new Date(thisYear, em - 1, ed)
      const daysUntilStart = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24))
      let status, color
      if (today >= startDate && today <= endDate) { status = '진행 중'; color = '#059669' }
      else if (daysUntilStart > 0 && daysUntilStart <= 30) { status = `${daysUntilStart}일 후`; color = '#d97706' }
      else if (today > endDate) { status = '종료'; color = '#dc2626' }
      else { status = `${Math.abs(daysUntilStart)}일 전`; color = '#9ca3af' }
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px"><span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="flex:1">${a.name}</span><span style="color:${color};font-weight:600">${status}</span></div>`
    }).join('')
    return `
${this._head('📅', '제출기간 알림')}
<div>${items}</div>
<div style="margin-top:12px"><button onclick="navigate('publicdata')" class="btn btn-sm btn-secondary">공개자료 점검</button></div>`
  }
}
