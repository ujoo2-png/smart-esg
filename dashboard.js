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
    const risks = RISK.generateReport(assessmentId)
    const alerts = RISK.generateAlerts(assessmentId)

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        ${this._kpiScore(assessment)}
        ${this._kpiCompletion(items)}
        ${this._kpiEvidence(evidenceCount)}
        ${this._kpiRisk(risks)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
        ${this._pillarChart(items, groups, assessment.authority_code)}
        ${this._ghgDonut(ghgSummary)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px">
        ${this._evidenceStackedBar(evidenceCount)}
        ${this._draftProgress(drafts)}
        ${this._supplierRiskBar()}
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;margin-bottom:16px">
        ${this._riskHeatmap(risks)}
        ${this._alertFeed(alerts)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        ${this._kssbStatus()}
        ${this._budgetGauge()}
      </div>
    `
  },

  _ring(pct, color, size = 100, stroke = 10) {
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const offset = c - (pct / 100) * c
    return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#eee" stroke-width="${stroke}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
    </svg>`
  },

  _kpiScore(a) {
    const gradeColor = { Platinum: '#8e44ad', Gold: '#f1c40f', Silver: '#95a5a6', Bronze: '#d35400' }
    const color = gradeColor[a.rating] || '#7C3AED'
    return `<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;align-items:center;gap:16px">
      <div style="position:relative;width:80px;height:80px;flex-shrink:0">
        ${this._ring(a.total_score || 0, color, 80, 8)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:${color}">${a.total_score != null ? a.total_score.toFixed(0) : '-'}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px">총점 · 등급</div>
        <div style="font-size:20px;font-weight:700;color:${color};margin-top:2px">${a.rating || '미평가'}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${Indicator.getAuthorityName(a.authority_code)} · ${a.assessment_year}년</div>
      </div>
    </div>`
  },

  _kpiCompletion(items) {
    const total = items.length
    const done = items.filter(i => i.status === 'completed' || i.status === 'excluded').length
    const pct = total ? Math.round(done / total * 100) : 0
    const color = pct >= 80 ? '#27ae60' : pct >= 50 ? '#f39c12' : '#e74c3c'
    return `<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;align-items:center;gap:16px">
      <div style="position:relative;width:80px;height:80px;flex-shrink:0">
        ${this._ring(pct, color, 80, 8)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${color}">${pct}%</div>
      </div>
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px">항목 완료율</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${done} <span style="font-size:13px;color:#999">/ ${total}</span></div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${items.filter(i=>i.status==='in_progress').length}건 진행중</div>
      </div>
    </div>`
  },

  _kpiEvidence(ec) {
    const total = ec.total
    const verified = ec.externally_verified
    const pct = total ? Math.round(verified / total * 100) : 0
    return `<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;align-items:center;gap:16px">
      <div style="position:relative;width:80px;height:80px;flex-shrink:0">
        ${this._ring(pct, '#3498db', 80, 8)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#3498db">${total}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px">증빙 현황</div>
        <div style="font-size:20px;font-weight:700;margin-top:2px">${total}건</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">외부검증 ${verified}건 (${pct}%)</div>
      </div>
    </div>`
  },

  _kpiRisk(risks) {
    const overall = risks.overall
    const color = overall.color || '#999'
    return `<div style="background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);display:flex;align-items:center;gap:16px">
      <div style="position:relative;width:80px;height:80px;flex-shrink:0">
        ${this._ring(overall.score || 0, color, 80, 8)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${color}">${overall.score ?? '-'}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px">리스크 점수</div>
        <div style="font-size:20px;font-weight:700;color:${color};margin-top:2px">${overall.label || '미평가'}</div>
        <div style="font-size:11px;color:#aaa;margin-top:2px">${risks.alerts.length}건 알림</div>
      </div>
    </div>`
  },

  _pillarChart(items, groups, authorityCode) {
    const usePillar = authorityCode === 'ECOVADIS'
    let barsHtml = ''
    const barColors = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']
    if (usePillar) {
      const pillarParams = Store.getWeightParams().filter(w => w.authority_code === 'ECOVADIS' && w.group_code === '_PILLAR')
      const pillars = ['POLICY', 'ACTION', 'RESULT']
      barsHtml = pillars.map((p, i) => {
        const pillarItems = items.filter(it => { const ind = Store.getIndicators().find(x => x.id === it.indicator_id); return ind && ind.pillar === p })
        const avg = pillarItems.length ? (pillarItems.reduce((s, it) => s + (it.score || 0), 0) / pillarItems.length) : 0
        const pw = pillarParams.find(pp => pp.pillar === p)
        const pct = (avg / 100) * 100
        return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <span style="width:90px;font-size:12px;color:#555;text-align:right">${Indicator.getPillarName(p)}</span>
          <div style="flex:1;background:#f0f0f0;height:20px;border-radius:10px;overflow:hidden">
            <div style="background:${barColors[i]};height:100%;width:${pct}%;border-radius:10px;transition:width 0.5s"></div>
          </div>
          <span style="width:40px;font-size:13px;font-weight:600;color:${barColors[i]}">${avg.toFixed(1)}</span>
          <span style="width:40px;font-size:11px;color:#999">${pw ? pw.weight_pct + '%' : '-'}</span>
        </div>`
      }).join('')
    } else {
      barsHtml = groups.map((g, i) => {
        const groupItems = items.filter(it => { const inds = Indicator.getIndicators(g.id); return inds.some(ind => ind.id === it.indicator_id) })
        const avg = groupItems.length ? (groupItems.reduce((s, it) => s + (it.score || 0), 0) / groupItems.length) : 0
        const pct = (avg / 100) * 100
        return `<div style="display:flex;align-items:center;gap:10px;margin:6px 0">
          <span style="width:90px;font-size:12px;color:#555;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.group_name}</span>
          <div style="flex:1;background:#f0f0f0;height:20px;border-radius:10px;overflow:hidden">
            <div style="background:${barColors[i % barColors.length]};height:100%;width:${pct}%;border-radius:10px;transition:width 0.5s"></div>
          </div>
          <span style="width:40px;font-size:13px;font-weight:600;color:${barColors[i % barColors.length]}">${avg.toFixed(1)}</span>
        </div>`
      }).join('')
    }
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">${usePillar ? '필러별 점수' : '테마별 점수'}</h3>
      ${barsHtml || '<p style="color:#999;font-size:12px">데이터 없음</p>'}
    </div>`
  },

  _ghgDonut(summary) {
    const entries = Object.values(summary)
    const total = entries.reduce((s, e) => s + e.total, 0)
    if (!entries.length) return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">GHG 배출량</h3>
      <div style="text-align:center;padding:30px;color:#999;font-size:12px">데이터 없음</div>
    </div>`

    const colors = ['#3498db', '#2ecc71', '#27ae60', '#9b59b6', '#e67e22']
    const size = 120
    const r = 45
    const c = 2 * Math.PI * r
    let cumPct = 0
    const circles = entries.map((e, i) => {
      const pct = total ? e.total / total : 0
      const dashLen = pct * c
      const dashOff = c - cumPct * c
      cumPct += pct
      const label = e.scope2_method ? `S2-${e.scope2_method === 'location-based' ? 'LB' : 'MB'}` : `Scope ${e.scope}`
      return `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="18" stroke-dasharray="${dashLen} ${c - dashLen}" stroke-dashoffset="${dashOff}" transform="rotate(-90 ${size/2} ${size/2})"/>
        <text x="${size/2}" y="${size/2 + 4}" text-anchor="middle" font-size="14" font-weight="700" fill="#333" transform="rotate(90 ${size/2} ${size/2})">${total.toFixed(0)}</text>`
    })

    const legend = entries.map((e, i) => {
      const label = e.scope2_method ? `Scope 2 (${e.scope2_method === 'location-based' ? '위치' : '시장'})` : `Scope ${e.scope}`
      return `<div style="display:flex;align-items:center;gap:6px;font-size:12px;margin:3px 0">
        <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
        <span style="flex:1;color:#555">${label}</span>
        <span style="font-weight:600">${e.total.toFixed(1)}</span>
      </div>`
    }).join('')

    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">GHG 배출량 (tCO2eq)</h3>
      <div style="display:flex;align-items:center;gap:20px">
        <div style="flex-shrink:0">${this._ring(100, '#3498db', size, 0)}</div>
        <div style="flex:1">${legend}</div>
      </div>
    </div>`
  },

  _evidenceStackedBar(ec) {
    const total = ec.total || 1
    const segments = [
      { label: '외부검증', count: ec.externally_verified, color: '#27ae60' },
      { label: '내부검토', count: ec.internal_reviewed, color: '#3498db' },
      { label: '자가입력', count: ec.self, color: '#f39c12' }
    ]
    const bars = segments.map(s => `<div style="width:${(s.count/total*100)}%;background:${s.color};height:100%;float:left"></div>`).join('')
    const legend = segments.map(s => `<span style="font-size:11px;color:#666;margin-right:12px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:4px"></span>${s.label} ${s.count}건</span>`).join('')
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">증빙 현황</h3>
      <div style="display:flex;height:16px;border-radius:8px;overflow:hidden;margin-bottom:10px">${bars}</div>
      <div>${legend}</div>
      <div style="margin-top:8px;font-size:11px;color:#aaa">총 ${ec.total}건 · 외부검증률 ${total > 1 ? Math.round(ec.externally_verified/total*100) : 0}%</div>
    </div>`
  },

  _draftProgress(drafts) {
    const total = drafts.length
    const approved = drafts.filter(d => d.human_status === 'approved').length
    const verified = drafts.filter(d => d.ver_status === 'pass').length
    const pending = drafts.filter(d => d.ver_status === 'pending').length
    const failed = drafts.filter(d => d.ver_status === 'fail').length
    const pct = total ? Math.round(approved / total * 100) : 0
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">AI 초안 진행</h3>
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:12px">
        <div style="position:relative;width:60px;height:60px;flex-shrink:0">
          ${this._ring(pct, '#7C3AED', 60, 6)}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#7C3AED">${pct}%</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:700">${total}</div>
          <div style="font-size:11px;color:#999">전체 초안</div>
        </div>
      </div>
      <div style="display:flex;gap:6px;font-size:11px;flex-wrap:wrap">
        <span style="background:#27ae6015;color:#27ae60;padding:3px 8px;border-radius:12px;font-weight:500">승인 ${approved}</span>
        <span style="background:#3498db15;color:#3498db;padding:3px 8px;border-radius:12px;font-weight:500">검증완료 ${verified}</span>
        <span style="background:#f39c1215;color:#f39c12;padding:3px 8px;border-radius:12px;font-weight:500">대기 ${pending}</span>
        <span style="background:#e74c3c15;color:#e74c3c;padding:3px 8px;border-radius:12px;font-weight:500">실패 ${failed}</span>
      </div>
    </div>`
  },

  _supplierRiskBar() {
    const suppliers = Store.getSuppliers()
    const summary = { A: 0, B: 0, C: 0, D: 0 }
    suppliers.forEach(s => { if (s.last_vsme_grade && summary[s.last_vsme_grade] !== undefined) summary[s.last_vsme_grade]++ })
    const colors = { A: '#27ae60', B: '#3498db', C: '#f39c12', D: '#e74c3c' }
    const bars = Object.entries(summary).map(([g, count]) => {
      const pct = suppliers.length ? Math.round(count / suppliers.length * 100) : 0
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px">
        <span style="width:16px;text-align:center;font-weight:700;color:${colors[g]}">${g}</span>
        <div style="flex:1;background:#f0f0f0;height:14px;border-radius:7px;overflow:hidden">
          <div style="background:${colors[g]};height:100%;width:${pct}%;border-radius:7px"></div>
        </div>
        <span style="width:20px;font-weight:600;color:${colors[g]}">${count}</span>
      </div>`
    }).join('')
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">협력사 등급 분포</h3>
      <div style="font-size:28px;font-weight:700;margin-bottom:8px">${suppliers.length} <span style="font-size:13px;color:#999;font-weight:400">개사</span></div>
      ${suppliers.length ? bars : '<div style="color:#999;font-size:12px">등록된 협력사 없음</div>'}
    </div>`
  },

  _riskHeatmap(risks) {
    const cats = risks.categories
    const levels = [
      { min: 0, max: 39, label: '낮음', bg: '#27ae6015', border: '#27ae60' },
      { min: 40, max: 59, label: '보통', bg: '#f1c40f15', border: '#f1c40f' },
      { min: 60, max: 79, label: '높음', bg: '#f39c1215', border: '#f39c12' },
      { min: 80, max: 100, label: '위험', bg: '#e74c3c15', border: '#e74c3c' }
    ]
    const trendIcons = { worsening: '↑', improving: '↓', stable: '→' }
    const trendColors = { worsening: '#e74c3c', improving: '#27ae60', stable: '#999' }
    const rows = cats.map(cat => {
      const level = levels.find(l => cat.risk.score >= l.min && cat.risk.score <= l.max) || levels[0]
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px">${cat.icon} ${cat.label}</td>
        <td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0">
          <span style="display:inline-block;width:36px;height:24px;line-height:24px;text-align:center;border-radius:4px;background:${level.bg};border:1px solid ${level.border};color:${level.border};font-weight:700;font-size:12px">${cat.risk.score}</span>
        </td>
        <td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;font-size:12px;color:${cat.risk.color};font-weight:600">${cat.risk.label}</td>
        <td style="padding:8px;text-align:center;border-bottom:1px solid #f0f0f0;font-size:16px;color:${trendColors[cat.risk.trend]}">${trendIcons[cat.risk.trend]}</td>
      </tr>`
    }).join('')
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">리스크 매트릭스</h3>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#f8f9fa">
          <th style="padding:6px 12px;text-align:left;font-size:11px;color:#888;border-bottom:2px solid #eee">카테고리</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;border-bottom:2px solid #eee">점수</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;border-bottom:2px solid #eee">수준</th>
          <th style="padding:6px 8px;text-align:center;font-size:11px;color:#888;border-bottom:2px solid #eee">추세</th>
        </tr>
        ${rows}
      </table>
    </div>`
  },

  _alertFeed(alerts) {
    const colors = { critical: '#e74c3c', warning: '#f39c12', info: '#3498db' }
    const items = alerts.slice(0, 8).map(a => `<div style="padding:8px 12px;margin-bottom:4px;background:${colors[a.severity]}08;border-left:3px solid ${colors[a.severity]};border-radius:0 6px 6px 0;font-size:12px">
      ${a.icon} <span style="color:${colors[a.severity]};font-weight:600">${a.category}</span> ${a.message}
    </div>`).join('')
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">알림 (${alerts.length}건)</h3>
      ${items || '<div style="text-align:center;padding:20px;color:#27ae60;font-size:13px">알림이 없습니다</div>'}
    </div>`
  },

  _kssbStatus() {
    const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []
    const mandatory = agencies.filter(a => a.track_type === 'MANDATORY')
    const kssbAssessments = Store.getAssessments().filter(a => a.authority_code === 'KSSB' || a.authority_code === 'ISSB')
    const hasKssb = kssbAssessments.length > 0
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">법정 공시 현황</h3>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div style="width:48px;height:48px;border-radius:12px;background:${hasKssb ? '#27ae6015' : '#e74c3c15'};display:flex;align-items:center;justify-content:center;font-size:24px">${hasKssb ? '✅' : '⚠️'}</div>
        <div>
          <div style="font-size:16px;font-weight:700;color:${hasKssb ? '#27ae60' : '#e74c3c'}">${hasKssb ? 'KSSB 진행중' : '미착수'}</div>
          <div style="font-size:11px;color:#999">${kssbAssessments.length}건 평가 등록됨</div>
        </div>
      </div>
      <div style="font-size:12px;color:#888;line-height:1.6">
        <div>대상: ${mandatory.map(a => a.name).join(', ') || '없음'}</div>
        <div>시행일: ${mandatory[0]?.effective_date || '-'}</div>
      </div>
    </div>`
  },

  _budgetGauge() {
    const budget = Store.getProjectBudget ? Store.getProjectBudget() : []
    const totalPlanned = budget.reduce((s, b) => s + (b.planned_amount || 0), 0)
    const totalActual = budget.reduce((s, b) => s + (b.actual_amount || 0), 0)
    const rate = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0
    const color = rate > 100 ? '#e74c3c' : rate > 80 ? '#f39c12' : '#27ae60'
    return `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
      <h3 style="margin:0 0 12px;font-size:13px;color:#666;font-weight:600">예산 집행률</h3>
      <div style="display:flex;align-items:center;gap:16px">
        <div style="position:relative;width:80px;height:80px;flex-shrink:0">
          ${this._ring(Math.min(rate, 100), color, 80, 8)}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${color}">${totalPlanned ? rate + '%' : '-'}</div>
        </div>
        <div>
          <div style="font-size:12px;color:#666">계획: ₩${(totalPlanned/10000).toFixed(0)}만</div>
          <div style="font-size:12px;color:#666">집행: ₩${(totalActual/10000).toFixed(0)}만</div>
          <div style="font-size:11px;color:${color};margin-top:4px;font-weight:500">${rate > 100 ? '초과 집행' : rate > 80 ? '양호' : '여유'}</div>
        </div>
      </div>
    </div>`
  }
}