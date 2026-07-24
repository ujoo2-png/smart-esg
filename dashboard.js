// 대시보드 시각화 모듈
// 부문별 점수, 준비도, 위험도, 미완료 과제

const Dashboard = {
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

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
        <div class="dash-card">${this._scoreCard(assessment)}</div>
        <div class="dash-card">${this._workflowCard(assessmentId)}</div>
        <div class="dash-card">${this._themeRadar(items, groups, assessment.authority_code)}</div>
        <div class="dash-card">${this._evidenceCard(evidenceCount)}</div>
        <div class="dash-card">${this._draftStatusCard(drafts)}</div>
        <div class="dash-card">${this._ghgCard(ghgSummary)}</div>
        <div class="dash-card">${this._supplierRiskCard()}</div>
        <div class="dash-card">${this._completionCard(items)}</div>
        <div class="dash-card">${this._kssbSubmissionCard()}</div>
        <div class="dash-card">${this._aiUnapprovedCard(assessmentId)}</div>
        <div class="dash-card">${this._budgetProgressCard()}</div>
        <div class="dash-card">${this._ghgTrendCard(assessmentId)}</div>
        <div class="dash-card">${this._submissionDeadlineCard()}</div>
      </div>
    `
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
      const colors = { Platinum: '#8e44ad', Gold: '#f1c40f', Silver: '#95a5a6', Bronze: '#d35400', 우수: '#8e44ad', 양호: '#f1c40f', 보통: '#95a5a6', 미흡: '#d35400' }
      return colors[rating] || '#333'
    }
    const score = assessment.total_score
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">총점</h3>
  <div style="font-size:48px;font-weight:700;color:${gradeColor(assessment.rating)}" data-countup="${score || 0}" data-decimals="1">0</div>
  <div style="margin-top:8px;color:#666">등급: <strong style="color:${gradeColor(assessment.rating)}">${assessment.rating ?? '미평가'}</strong></div>
  <div style="margin-top:4px;color:#999;font-size:12px">${assessment.authority_code}</div>
</div>`
  },

  _themeRadar(items, groups, authorityCode) {
    const usePillar = authorityCode === 'ECOVADIS'
    let labels = [], values = []
    if (usePillar) {
      const pillarParams = Store.getWeightParams().filter(w => w.authority_code === 'ECOVADIS' && w.theme_code === '_PILLAR')
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
      svg += `<polygon points="${pts}" fill="none" stroke="#e8e8ec" stroke-width="1"/>`
    })
    for (let i = 0; i < n; i++) {
      const [x, y] = toXY(i, 100)
      svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e8e8ec" stroke-width="1"/>`
    }
    const dataPts = values.map((v, i) => toXY(i, v).join(',')).join(' ')
    svg += `<polygon points="${dataPts}" fill="rgba(124,58,237,.15)" stroke="#7C3AED" stroke-width="2"/>`
    values.forEach((v, i) => {
      const [x, y] = toXY(i, v)
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="#7C3AED"/>`
    })
    labels.forEach((l, i) => {
      const [x, y] = toXY(i, 115)
      const anchor = x < cx - 10 ? 'end' : x > cx + 10 ? 'start' : 'middle'
      svg += `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="11" fill="#666" font-weight="500">${l}</text>`
      const [vx, vy] = toXY(i, values[i])
      svg += `<text x="${vx}" y="${vy - 8}" text-anchor="middle" font-size="10" fill="#7C3AED" font-weight="600">${values[i].toFixed(1)}</text>`
    })
    svg += `</svg>`
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">${usePillar ? '필러별 점수' : '테마별 점수'}</h3>
  ${n ? svg : '<p style="color:#999">데이터 없음</p>'}
</div>`
  },

  _evidenceCard(count) {
    const pct = count.total ? ((count.externally_verified / count.total) * 100).toFixed(0) : 0
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">증빙 현황</h3>
  <div style="display:flex;justify-content:space-between;margin-bottom:8px">
    <span>총 ${count.total}건</span>
    <span>외부검증 ${pct}%</span>
  </div>
  <div style="background:#eee;height:8px;border-radius:4px;overflow:hidden">
    <div class="dash-bar dash-bar-init" data-width="${pct}" style="background:#27ae60;height:100%;width:0%;border-radius:4px"></div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:12px;color:#666">
    <span>🟡 ${count.self}건 자가</span>
    <span>🔵 ${count.internal_reviewed}건 내부검토</span>
    <span>🟢 ${count.externally_verified}건 외부검증</span>
  </div>
</div>`
  },

  _draftStatusCard(drafts) {
    const total = drafts.length
    const approved = drafts.filter(d => d.human_status === 'approved').length
    const pending = drafts.filter(d => d.human_status === 'pending').length
    const rejected = drafts.filter(d => d.human_status === 'rejected').length
    const passRate = total ? ((drafts.filter(d => d.ver_status === 'pass').length / total) * 100).toFixed(0) : 0
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">AI 초안 현황</h3>
  <div>생성: ${total}건</div>
  <div>AI 검증 통과율: ${passRate}%</div>
  <div style="margin-top:8px;display:flex;gap:8px;font-size:12px">
    <span style="background:#f39c12;color:#fff;padding:2px 8px;border-radius:10px">대기 ${pending}</span>
    <span style="background:#27ae60;color:#fff;padding:2px 8px;border-radius:10px">승인 ${approved}</span>
    <span style="background:#e74c3c;color:#fff;padding:2px 8px;border-radius:10px">반려 ${rejected}</span>
  </div>
</div>`
  },

  _ghgCard(summary) {
    const entries = Object.values(summary)
    const totalEmissions = entries.reduce((sum, s) => sum + s.total, 0)
    const details = entries.map(s => {
      const label = s.scope2_method
        ? `Scope 2 (${s.scope2_method === 'location-based' ? 'LB' : 'MB'})`
        : `Scope ${s.scope}`
      return `<div style="display:flex;justify-content:space-between;font-size:12px;margin:2px 0">
        <span>${label}</span><span>${s.total.toFixed(1)} tCO2eq</span>
      </div>`
    }).join('')
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">온실가스 배출</h3>
  <div style="font-size:28px;font-weight:700">${totalEmissions.toFixed(1)}</div>
  <div style="font-size:12px;color:#666;margin-bottom:8px">tCO2eq</div>
  ${details || '<div style="color:#999">데이터 없음</div>'}
</div>`
  },

  _supplierRiskCard() {
    const suppliers = Store.getSuppliers()
    const summary = { total: suppliers.length, A: 0, B: 0, C: 0, D: 0, unscored: 0 }
    const gradeColors = { A: '#27ae60', B: '#2980b9', C: '#f39c12', D: '#e74c3c' }
    suppliers.forEach(s => {
      if (s.last_vsme_grade && summary[s.last_vsme_grade] !== undefined) summary[s.last_vsme_grade]++
      else summary.unscored++
    })
    const bars = ['A', 'B', 'C', 'D', 'unscored'].map(g => {
      const count = summary[g]
      const pct = summary.total ? (count / summary.total * 100).toFixed(0) : 0
      const label = g === 'unscored' ? '미진단' : g + '등급'
      const color = g === 'unscored' ? '#ccc' : gradeColors[g]
      return `<div style="margin:4px 0;display:flex;align-items:center;gap:8px;font-size:12px">
        <span style="width:48px;text-align:right;color:#666">${label}</span>
        <div style="flex:1;background:#eee;height:14px;border-radius:7px;overflow:hidden">
          <div class="dash-bar dash-bar-init" data-width="${pct}" style="background:${color};height:100%;width:0%;border-radius:7px"></div>
        </div>
        <span style="width:28px;font-weight:600;color:${color}">${count}</span>
      </div>`
    }).join('')
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">협력사 리스크</h3>
  <div style="font-size:28px;font-weight:700">${summary.total}</div>
  <div style="font-size:12px;color:#666;margin-bottom:8px">총 협력사</div>
  ${summary.total ? bars : '<div style="color:#999;font-size:12px">등록된 협력사 없음</div>'}
</div>`
  },

  _completionCard(items) {
    const total = items.length
    const completed = items.filter(i => i.status === 'completed').length
    const excluded = items.filter(i => i.status === 'excluded').length
    const inProgress = items.filter(i => i.status === 'in_progress').length
    const pending = items.filter(i => i.status === 'pending').length
    const pct = total ? (((completed + excluded) / total) * 100).toFixed(0) : 0
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">항목 완료율</h3>
  <div style="font-size:36px;font-weight:700" data-countup="${pct}" data-suffix="%">0%</div>
  <div style="background:#eee;height:8px;border-radius:4px;margin:8px 0;overflow:hidden">
    <div class="dash-bar dash-bar-init" data-width="${pct}" style="background:#27ae60;height:100%;width:0%;border-radius:4px"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:12px;color:#666">
    <span>⬜ ${pending} 대기</span>
    <span>🔄 ${inProgress} 진행</span>
    <span>✅ ${completed} 완료</span>
    <span>⏭️ ${excluded} 제외</span>
  </div>
</div>`
  },

  _kssbSubmissionCard() {
    const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []
    const mandatory = agencies.filter(a => a.track_type === 'MANDATORY')
    const assessments = Store.getAssessments().filter(a => a.authority_code === 'KSSB' || a.authority_code === 'ISSB')
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">📜 법정 공시 현황</h3>
  <div style="font-size:28px;font-weight:700;color:${assessments.length ? '#27ae60' : '#e74c3c'}">${assessments.length ? '진행중' : '미착수'}</div>
  <div style="font-size:12px;color:#666;margin-top:4px">대상 기관: ${mandatory.map(a => a.name).join(', ') || '-'}</div>
  <div style="font-size:12px;color:#888;margin-top:4px">KSSB 공시기준 제1호·제2호 | 시행일: ${mandatory[0]?.effective_date || '-'}</div>
</div>`
  },

  _aiUnapprovedCard(assessmentId) {
    const drafts = Store.getAIDrafts().filter(d => d.assessment_id === assessmentId)
    const verifiedNotApproved = drafts.filter(d => d.ver_status === 'pass' && d.human_status === 'pending')
    const totalDrafts = drafts.length
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">🔍 AI 미승인 대기</h3>
  <div style="font-size:36px;font-weight:700;color:${verifiedNotApproved.length > 0 ? '#f39c12' : '#27ae60'}">${verifiedNotApproved.length}</div>
  <div style="font-size:12px;color:#666">검증 통과 후 승인 대기 중</div>
  <div style="margin-top:8px;font-size:12px;color:#888">전체 초안: ${totalDrafts}건</div>
</div>`
  },

  _budgetProgressCard() {
    const budget = Store.getProjectBudget ? Store.getProjectBudget() : []
    const totalPlanned = budget.reduce((s, b) => s + (b.planned_amount || 0), 0)
    const totalActual = budget.reduce((s, b) => s + (b.actual_amount || 0), 0)
    const rate = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0
    const barColor = rate > 100 ? '#e74c3c' : rate > 80 ? '#f39c12' : '#27ae60'
    const cappedRate = Math.min(rate, 100)
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">💰 예산 집행률</h3>
  <div style="font-size:36px;font-weight:700;color:${barColor}" data-countup="${totalPlanned ? rate : 0}" data-suffix="%">0%</div>
  <div style="background:#eee;height:8px;border-radius:4px;margin:8px 0;overflow:hidden">
    <div class="dash-bar dash-bar-init" data-width="${cappedRate}" style="background:${barColor};height:100%;width:0%;border-radius:4px"></div>
  </div>
  <div style="font-size:12px;color:#666">계획: ₩${(totalPlanned/10000).toFixed(0)}만 | 집행: ₩${(totalActual/10000).toFixed(0)}만</div>
</div>`
  },

  _ghgTrendCard(assessmentId) {
    const activities = Store.getGHGActivities().filter(a => a.assessment_id === assessmentId)
    const scope1 = activities.filter(a => a.scope === 1).reduce((s, a) => s + (a.co2eq || 0), 0)
    const scope2lb = activities.filter(a => a.scope === 2 && a.scope2_method === 'location-based').reduce((s, a) => s + (a.co2eq || 0), 0)
    const scope2mb = activities.filter(a => a.scope === 2 && a.scope2_method === 'market-based').reduce((s, a) => s + (a.co2eq || 0), 0)
    const scope3 = activities.filter(a => a.scope === 3).reduce((s, a) => s + (a.co2eq || 0), 0)
    const scopes = [
      { label: 'Scope 1', value: scope1, color: '#3498db' },
      { label: 'Scope 2 (LB)', value: scope2lb, color: '#2ecc71' },
      { label: 'Scope 2 (MB)', value: scope2mb, color: '#27ae60' },
      { label: 'Scope 3', value: scope3, color: '#9b59b6' }
    ].filter(s => s.value > 0)
    const maxVal = Math.max(...scopes.map(s => s.value), 1)
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <h3 style="margin:0 0 12px;font-size:14px;color:#666">🏭 Scope 배출량 분포</h3>
  ${scopes.length ? scopes.map(s => `
    <div style="margin:6px 0;display:flex;align-items:center;gap:8px;font-size:12px">
      <span style="width:80px;color:#666">${s.label}</span>
      <div style="flex:1;background:#eee;height:16px;border-radius:8px;overflow:hidden">
        <div class="dash-bar dash-bar-init" data-width="${(s.value/maxVal*100).toFixed(0)}" style="background:${s.color};height:100%;width:0%;border-radius:8px"></div>
      </div>
      <span style="width:70px;text-align:right;font-weight:500">${s.value.toFixed(1)}</span>
    </div>
  `).join('') : '<div style="color:#999;font-size:12px">데이터 없음</div>'}
  <div style="font-size:11px;color:#999;margin-top:8px">단위: tCO2eq</div>
</div>`
  },

  _workflowCard(assessmentId) {
    const stats = Store.getWorkflowStats(assessmentId)
    const notifs = Store.getUnreadNotifications()
    const notifCount = notifs.length
    const overdueItems = notifs.filter(n => n.type === 'error')
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="font-weight:600;font-size:14px;margin-bottom:12px">⚡ 자동 워크플로우 현황</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
    <div style="background:#f0f6ff;padding:10px;border-radius:8px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#7C3AED">${stats.completionPct}%</div>
      <div style="font-size:11px;color:#888">평가 완료율</div>
    </div>
    <div style="background:#f0fff4;padding:10px;border-radius:8px;text-align:center">
      <div style="font-size:22px;font-weight:700;color:#27ae60">${stats.evidencePct}%</div>
      <div style="font-size:11px;color:#888">증빙 연결률</div>
    </div>
  </div>
  <div style="font-size:12px;line-height:2">
    <div>📋 총 항목: <strong>${stats.total}</strong>건 / 완료: <strong>${stats.completed}</strong>건</div>
    <div>📎 증빙 연결: <strong>${stats.withEvidence}</strong>건 / 미연결: <strong>${stats.total - stats.withEvidence}</strong>건</div>
    ${stats.overdue > 0 ? '<div style="color:#e74c3c">🔴 마감 초과: <strong>' + stats.overdue + '</strong>건</div>' : ''}
    ${stats.dueSoon > 0 ? '<div style="color:#f39c12">🟡 마감 임박: <strong>' + stats.dueSoon + '</strong>건</div>' : ''}
    ${notifCount > 0 ? '<div style="color:#7C3AED">🔔 읽지 않은 알림: <strong>' + notifCount + '</strong>건</div>' : ''}
  </div>
  <div style="display:flex;gap:6px;margin-top:12px">
    <button onclick="navigate('assessment')" class="btn btn-sm btn-secondary" style="font-size:11px">📋 평가 관리 ↗</button>
    <button onclick="navigate('evidence')" class="btn btn-sm btn-secondary" class="btn btn-sm btn-secondary" style="font-size:11px">📎 증빙 관리 ↗</button>
    <button onclick="navigate('indicator')" class="btn btn-sm btn-secondary" style="font-size:11px">📌 지표 관리 ↗</button>
  </div>
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
      if (today >= startDate && today <= endDate) { status = '진행 중'; color = '#22c55e' }
      else if (daysUntilStart > 0 && daysUntilStart <= 30) { status = `${daysUntilStart}일 후`; color = '#f59e0b' }
      else if (today > endDate) { status = '종료'; color = '#ef4444' }
      else { status = `${Math.abs(daysUntilStart)}일 전`; color = '#888' }
      return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:12px"><span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0"></span><span style="flex:1">${a.name}</span><span style="color:${color};font-weight:500">${status}</span></div>`
    }).join('')
    return `
<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.1)">
  <div style="font-weight:600;font-size:14px;margin-bottom:12px">📅 제출기간 알림</div>
  <div>${items}</div>
  <div style="margin-top:10px"><button onclick="navigate('publicdata')" class="btn btn-sm btn-secondary" style="font-size:11px">🌐 공개자료 점검 ↗</button></div>
</div>`
  }
}
