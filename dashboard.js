const Dashboard = {
  _animState: {},

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
    const suppliers = Store.getSuppliers ? Store.getSuppliers() : []

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
        ${this._kpiScore(assessment)}
        ${this._kpiCompletion(items)}
        ${this._kpiEvidence(evidenceCount)}
        ${this._kpiRisk(risks)}
      </div>
      <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:16px;margin-bottom:20px">
        ${this._pillarChart(items, groups, assessment.authority_code)}
        ${this._ghgDonut(ghgSummary)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:20px">
        ${this._evidenceStackedBar(evidenceCount)}
        ${this._draftProgress(drafts)}
        ${this._supplierRiskBar(suppliers)}
      </div>
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:20px">
        ${this._riskHeatmap(risks)}
        ${this._alertFeed(alerts)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        ${this._kssbStatus()}
        ${this._budgetGauge()}
        ${this._groupScoreMini(items, groups, assessment.authority_code)}
      </div>
    `

    this._bindAnimations(container)
  },

  _bindAnimations(container) {
    container.querySelectorAll('[data-chart-bar]').forEach(bar => {
      bar.style.cursor = 'pointer'
      bar.addEventListener('click', () => {
        const key = bar.dataset.chartBar
        const target = parseFloat(bar.dataset.targetPct || 0)
        const color = bar.dataset.color || '#7C3AED'
        bar.style.transition = 'none'
        bar.style.width = '0%'
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            bar.style.transition = 'width 0.8s cubic-bezier(.4,0,.2,1)'
            bar.style.width = target + '%'
            bar.style.background = `linear-gradient(90deg, ${color}, ${this._lighten(color)})`
          })
        })
        const label = bar.closest('[data-chart-group]')?.querySelector('[data-chart-val]')
        if (label) {
          label.style.transition = 'none'
          label.style.opacity = '0'
          label.style.transform = 'translateY(8px)'
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              label.style.transition = 'all 0.5s ease 0.3s'
              label.style.opacity = '1'
              label.style.transform = 'translateY(0)'
            })
          })
        }
      })
    })

    container.querySelectorAll('[data-ring]').forEach(ring => {
      ring.style.cursor = 'pointer'
      ring.addEventListener('click', () => {
        const circles = ring.querySelectorAll('circle[data-target]')
        circles.forEach(circle => {
          const targetOffset = parseFloat(circle.dataset.target)
          circle.style.transition = 'none'
          circle.setAttribute('stroke-dashoffset', circle.getAttribute('stroke-dasharray'))
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              circle.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)'
              circle.setAttribute('stroke-dashoffset', targetOffset)
            })
          })
        })
      })
    })

    container.querySelectorAll('[data-donut]').forEach(svg => {
      svg.style.cursor = 'pointer'
      svg.addEventListener('click', () => {
        const circles = svg.querySelectorAll('circle')
        circles.forEach((circle, i) => {
          const origDA = circle.dataset.origDasharray || circle.getAttribute('stroke-dasharray')
          circle.style.transition = 'none'
          circle.setAttribute('stroke-dasharray', `0 ${parseFloat(circle.dataset.circumference || 240)}`)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              circle.style.transition = `stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1) ${i * 0.1}s`
              circle.setAttribute('stroke-dasharray', origDA)
            })
          })
        })
      })
    })

    container.querySelectorAll('[data-stacked-bar]').forEach(wrap => {
      wrap.style.cursor = 'pointer'
      wrap.addEventListener('click', () => {
        const segs = wrap.querySelectorAll('[data-seg]')
        segs.forEach((seg, i) => {
          const targetW = seg.dataset.seg
          seg.style.transition = 'none'
          seg.style.width = '0%'
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              seg.style.transition = `width 0.7s cubic-bezier(.4,0,.2,1) ${i * 0.1}s`
              seg.style.width = targetW + '%'
            })
          })
        })
      })
    })

    container.querySelectorAll('[data-gauge]').forEach(gauge => {
      gauge.style.cursor = 'pointer'
      gauge.addEventListener('click', () => {
        const circle = gauge.querySelector('circle:nth-child(2)')
        if (!circle) return
        const targetOffset = parseFloat(circle.dataset.target || 0)
        const dasharray = parseFloat(circle.getAttribute('stroke-dasharray') || 0) + targetOffset
        circle.style.transition = 'none'
        circle.setAttribute('stroke-dashoffset', dasharray)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            circle.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)'
            circle.setAttribute('stroke-dashoffset', targetOffset)
          })
        })
      })
    })
  },

  _lighten(hex) {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const lr = Math.min(255, r + 40)
    const lg = Math.min(255, g + 40)
    const lb = Math.min(255, b + 40)
    return `rgb(${lr},${lg},${lb})`
  },

  _ring(pct, color, size = 100, stroke = 8) {
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const offset = c - (pct / 100) * c
    return `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)" data-ring>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#f0f0f0" stroke-width="${stroke}"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transition:stroke-dashoffset 0.6s ease" data-target="${offset}"/>
    </svg>`
  },

  _card(title, content, opts = {}) {
    return `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px">
      <div style="font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:14px">${title}</div>
      ${content}
    </div>`
  },

  _kpiScore(a) {
    const gradeColor = { Platinum: '#8e44ad', Gold: '#d4a017', Silver: '#7f8c8d', Bronze: '#cd7f32' }
    const color = gradeColor[a.rating] || '#7C3AED'
    return `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px;display:flex;align-items:center;gap:20px">
      <div style="position:relative;width:72px;height:72px;flex-shrink:0">
        ${this._ring(a.total_score || 0, color, 72, 6)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:${color}">${a.total_score != null ? a.total_score.toFixed(0) : '-'}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px">총점</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-top:2px">${a.rating || '미평가'}</div>
        <div style="font-size:11px;color:#bbb;margin-top:4px">${Indicator.getAuthorityName(a.authority_code)} · ${a.assessment_year}년</div>
      </div>
    </div>`
  },

  _kpiCompletion(items) {
    const total = items.length
    const done = items.filter(i => i.status === 'completed' || i.status === 'excluded').length
    const pct = total ? Math.round(done / total * 100) : 0
    const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
    return `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px;display:flex;align-items:center;gap:20px">
      <div style="position:relative;width:72px;height:72px;flex-shrink:0">
        ${this._ring(pct, color, 72, 6)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${color}">${pct}%</div>
      </div>
      <div>
        <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px">완료율</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-top:2px">${done} <span style="font-size:13px;color:#bbb;font-weight:400">/ ${total}</span></div>
        <div style="font-size:11px;color:#bbb;margin-top:4px">${items.filter(i=>i.status==='in_progress').length}건 진행중</div>
      </div>
    </div>`
  },

  _kpiEvidence(ec) {
    const total = ec.total
    const verified = ec.externally_verified
    const pct = total ? Math.round(verified / total * 100) : 0
    return `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px;display:flex;align-items:center;gap:20px">
      <div style="position:relative;width:72px;height:72px;flex-shrink:0">
        ${this._ring(pct, '#3b82f6', 72, 6)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#3b82f6">${total}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px">증빙</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-top:2px">${total}건</div>
        <div style="font-size:11px;color:#bbb;margin-top:4px">외부검증 ${verified}건</div>
      </div>
    </div>`
  },

  _kpiRisk(risks) {
    const overall = risks.overall
    const color = overall.color || '#94a3b8'
    return `<div style="background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px;display:flex;align-items:center;gap:20px">
      <div style="position:relative;width:72px;height:72px;flex-shrink:0">
        ${this._ring(overall.score || 0, color, 72, 6)}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${color}">${overall.score ?? '-'}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:0.5px">리스크</div>
        <div style="font-size:22px;font-weight:700;color:#1a1a2e;margin-top:2px">${overall.label || '미평가'}</div>
        <div style="font-size:11px;color:#bbb;margin-top:4px">${risks.alerts.length}건 알림</div>
      </div>
    </div>`
  },

  _pillarChart(items, groups, authorityCode) {
    const usePillar = authorityCode === 'ECOVADIS'
    const barColors = ['#7C3AED', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
    let barsHtml = ''
    if (usePillar) {
      const pillarParams = Store.getWeightParams().filter(w => w.authority_code === 'ECOVADIS' && w.group_code === '_PILLAR')
      const pillars = ['POLICY', 'ACTION', 'RESULT']
      barsHtml = pillars.map((p, i) => {
        const pillarItems = items.filter(it => { const ind = Store.getIndicators().find(x => x.id === it.indicator_id); return ind && ind.pillar === p })
        const avg = pillarItems.length ? (pillarItems.reduce((s, it) => s + (it.score || 0), 0) / pillarItems.length) : 0
        const pw = pillarParams.find(pp => pp.pillar === p)
        return `<div style="margin:10px 0" data-chart-group>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:13px;color:#555;font-weight:500">${Indicator.getPillarName(p)}</span>
            <span style="font-size:13px;font-weight:600;color:${barColors[i]}" data-chart-val>${avg.toFixed(1)}</span>
          </div>
          <div style="background:#f5f5f5;height:8px;border-radius:4px;overflow:hidden;cursor:pointer" title="클릭하면 애니메이션됩니다">
            <div style="background:${barColors[i]};height:100%;width:${avg}%;border-radius:4px" data-chart-bar data-target-pct="${avg}" data-color="${barColors[i]}"></div>
          </div>
          ${pw ? `<div style="font-size:10px;color:#bbb;margin-top:3px">가중치 ${pw.weight_pct}%</div>` : ''}
        </div>`
      }).join('')
    } else {
      barsHtml = groups.map((g, i) => {
        const groupItems = items.filter(it => { const inds = Indicator.getIndicators(g.id); return inds.some(ind => ind.id === it.indicator_id) })
        const avg = groupItems.length ? (groupItems.reduce((s, it) => s + (it.score || 0), 0) / groupItems.length) : 0
        return `<div style="margin:8px 0" data-chart-group>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <span style="font-size:12px;color:#666">${g.group_name}</span>
            <span style="font-size:12px;font-weight:600;color:${barColors[i % barColors.length]}" data-chart-val>${avg.toFixed(1)}</span>
          </div>
          <div style="background:#f5f5f5;height:6px;border-radius:3px;overflow:hidden;cursor:pointer" title="클릭하면 애니메이션됩니다">
            <div style="background:${barColors[i % barColors.length]};height:100%;width:${avg}%;border-radius:3px" data-chart-bar data-target-pct="${avg}" data-color="${barColors[i % barColors.length]}"></div>
          </div>
        </div>`
      }).join('')
    }
    return this._card(usePillar ? '필러별 점수' : '테마별 점수', barsHtml || '<p style="color:#bbb;font-size:12px">데이터 없음</p>')
  },

  _ghgDonut(summary) {
    const entries = Object.values(summary)
    const total = entries.reduce((s, e) => s + e.total, 0)
    if (!entries.length) return this._card('GHG 배출량', '<div style="text-align:center;padding:24px;color:#bbb;font-size:12px">데이터 없음</div>')

    const colors = ['#3b82f6', '#10b981', '#06b6d4', '#8b5cf6', '#f59e0b']
    const size = 120
    const r = 44
    const c = 2 * Math.PI * r
    let cumPct = 0
    const circles = entries.map((e, i) => {
      const pct = total ? e.total / total : 0
      const dashLen = pct * c
      const dashOff = c - cumPct * c
      cumPct += pct
      return `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="18" stroke-dasharray="${dashLen} ${c - dashLen}" stroke-dashoffset="${dashOff}" transform="rotate(-90 ${size/2} ${size/2})" data-circumference="${c}" data-orig-dasharray="${dashLen} ${c - dashLen}"/>`
    })

    const legend = entries.map((e, i) => {
      const label = e.scope2_method ? `Scope 2 (${e.scope2_method === 'location-based' ? '위치' : '시장'})` : `Scope ${e.scope}`
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
        <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
        <span style="flex:1;font-size:12px;color:#666">${label}</span>
        <span style="font-size:12px;font-weight:600;color:#333">${e.total.toFixed(1)}</span>
      </div>`
    }).join('')

    return this._card('GHG 배출량 (tCO₂eq)', `
      <div style="display:flex;align-items:center;gap:24px" data-donut-wrap>
        <svg width="${size}" height="${size}" style="flex-shrink:0;cursor:pointer" data-donut title="클릭하면 애니메이션됩니다">${circles.join('')}</svg>
        <div style="flex:1">${legend}</div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#bbb">합계 ${total.toFixed(1)} tCO₂eq · 클릭 시 애니메이션</div>
    `)
  },

  _evidenceStackedBar(ec) {
    const total = ec.total || 1
    const segments = [
      { label: '외부검증', count: ec.externally_verified, color: '#10b981' },
      { label: '내부검토', count: ec.internal_reviewed, color: '#3b82f6' },
      { label: '자가입력', count: ec.self, color: '#f59e0b' }
    ]
    const bars = segments.map(s => `<div style="width:${(s.count/total*100)}%;background:${s.color};height:100%" data-seg="${(s.count/total*100)}"></div>`).join('')
    const legend = segments.map(s => `<div style="display:flex;align-items:center;gap:6px;font-size:12px">
      <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
      <span style="flex:1;color:#666">${s.label}</span>
      <span style="font-weight:600;color:#333">${s.count}건</span>
    </div>`).join('')
    return this._card('증빙 현황', `
      <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:14px" data-stacked-bar title="클릭하면 애니메이션됩니다">${bars}</div>
      <div style="display:flex;flex-direction:column;gap:4px">${legend}</div>
      <div style="margin-top:8px;font-size:11px;color:#bbb">외부검증률 ${total > 1 ? Math.round(ec.externally_verified/total*100) : 0}%</div>
    `)
  },

  _draftProgress(drafts) {
    const total = drafts.length
    const approved = drafts.filter(d => d.human_status === 'approved').length
    const verified = drafts.filter(d => d.ver_status === 'pass').length
    const pending = drafts.filter(d => d.ver_status === 'pending').length
    const failed = drafts.filter(d => d.ver_status === 'fail').length
    const pct = total ? Math.round(approved / total * 100) : 0
    const badges = [
      { label: '승인', count: approved, color: '#10b981' },
      { label: '검증', count: verified, color: '#3b82f6' },
      { label: '대기', count: pending, color: '#f59e0b' },
      { label: '실패', count: failed, color: '#ef4444' }
    ]
    return this._card('AI 초안 진행', `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px">
        <div style="position:relative;width:56px;height:56px;flex-shrink:0">
          ${this._ring(pct, '#7C3AED', 56, 5)}
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#7C3AED">${pct}%</div>
        </div>
        <div>
          <div style="font-size:20px;font-weight:700;color:#1a1a2e">${total}</div>
          <div style="font-size:11px;color:#bbb">전체 초안</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${badges.map(b => `<div style="display:flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;background:${b.color}08;border-radius:6px;color:${b.color};font-weight:500">
          <span style="width:6px;height:6px;border-radius:50%;background:${b.color}"></span>${b.label} ${b.count}
        </div>`).join('')}
      </div>
    `)
  },

  _supplierRiskBar(suppliers) {
    const summary = { A: 0, B: 0, C: 0, D: 0 }
    suppliers.forEach(s => { if (s.last_vsme_grade && summary[s.last_vsme_grade] !== undefined) summary[s.last_vsme_grade]++ })
    const colors = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' }
    const bars = Object.entries(summary).map(([g, count]) => {
      const pct = suppliers.length ? Math.round(count / suppliers.length * 100) : 0
      return `<div style="margin:8px 0" data-chart-group>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <span style="font-size:12px;color:#555;font-weight:500">${g}등급</span>
          <span style="font-size:11px;color:#bbb">${count}개사</span>
        </div>
        <div style="background:#f5f5f5;height:6px;border-radius:3px;overflow:hidden;cursor:pointer" title="클릭하면 애니메이션됩니다">
          <div style="background:${colors[g]};height:100%;width:${pct}%;border-radius:3px" data-chart-bar data-target-pct="${pct}" data-color="${colors[g]}"></div>
        </div>
      </div>`
    }).join('')
    return this._card('협력사 등급', `
      <div style="font-size:24px;font-weight:700;color:#1a1a2e;margin-bottom:12px">${suppliers.length} <span style="font-size:13px;color:#bbb;font-weight:400">개사</span></div>
      ${suppliers.length ? bars : '<div style="color:#bbb;font-size:12px">등록된 협력사 없음</div>'}
    `)
  },

  _riskHeatmap(risks) {
    const cats = risks.categories
    const levels = [
      { min: 0, max: 39, label: '낮음', color: '#10b981' },
      { min: 40, max: 59, label: '보통', color: '#f59e0b' },
      { min: 60, max: 79, label: '높음', color: '#f97316' },
      { min: 80, max: 100, label: '위험', color: '#ef4444' }
    ]
    const trendIcons = { worsening: '↑', improving: '↓', stable: '→' }
    const trendColors = { worsening: '#ef4444', improving: '#10b981', stable: '#94a3b8' }
    const rows = cats.map(cat => {
      const level = levels.find(l => cat.risk.score >= l.min && cat.risk.score <= l.max) || levels[0]
      return `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f8f8f8">
        <span style="font-size:16px;width:28px">${cat.icon}</span>
        <span style="flex:1;font-size:13px;color:#555;font-weight:500">${cat.label}</span>
        <span style="display:inline-block;width:36px;height:24px;line-height:24px;text-align:center;border-radius:6px;background:${level.color}10;color:${level.color};font-weight:700;font-size:12px">${cat.risk.score}</span>
        <span style="font-size:12px;color:${level.color};font-weight:500;width:40px;text-align:right">${cat.risk.label}</span>
        <span style="font-size:14px;color:${trendColors[cat.risk.trend]};width:20px;text-align:center">${trendIcons[cat.risk.trend]}</span>
      </div>`
    }).join('')
    return this._card('리스크 매트릭스', rows || '<div style="color:#bbb;font-size:12px;text-align:center;padding:16px">데이터 없음</div>')
  },

  _alertFeed(alerts) {
    const colors = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }
    const items = alerts.slice(0, 8).map(a => `<div style="padding:8px 0;border-bottom:1px solid #f8f8f8;font-size:12px">
      <span style="color:${colors[a.severity]};font-weight:600">${a.icon} ${a.category}</span>
      <span style="color:#666;margin-left:4px">${a.message}</span>
    </div>`).join('')
    return this._card(`알림 (${alerts.length}건)`, items || '<div style="text-align:center;padding:16px;color:#10b981;font-size:12px">알림이 없습니다</div>')
  },

  _kssbStatus() {
    const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []
    const mandatory = agencies.filter(a => a.track_type === 'MANDATORY')
    const kssbAssessments = Store.getAssessments().filter(a => a.authority_code === 'KSSB' || a.authority_code === 'ISSB')
    const hasKssb = kssbAssessments.length > 0
    return this._card('법정 공시 현황', `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div style="width:36px;height:36px;border-radius:8px;background:${hasKssb ? '#10b98110' : '#ef444410'};display:flex;align-items:center;justify-content:center;font-size:18px">${hasKssb ? '✓' : '!'}</div>
        <div>
          <div style="font-size:15px;font-weight:700;color:${hasKssb ? '#10b981' : '#ef4444'}">${hasKssb ? 'KSSB 진행중' : '미착수'}</div>
          <div style="font-size:11px;color:#bbb">${kssbAssessments.length}건 평가</div>
        </div>
      </div>
      <div style="font-size:12px;color:#888;line-height:1.6">
        <div>대상: ${mandatory.map(a => a.name).join(', ') || '없음'}</div>
        ${mandatory[0]?.effective_date ? `<div>시행일: ${mandatory[0].effective_date}</div>` : ''}
      </div>
    `)
  },

  _budgetGauge() {
    const budget = Store.getProjectBudget ? Store.getProjectBudget() : []
    const totalPlanned = budget.reduce((s, b) => s + (b.planned_amount || 0), 0)
    const totalActual = budget.reduce((s, b) => s + (b.actual_amount || 0), 0)
    const rate = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0
    const color = rate > 100 ? '#ef4444' : rate > 80 ? '#f59e0b' : '#10b981'
    const size = 80
    const stroke = 7
    const r = (size - stroke) / 2
    const c = 2 * Math.PI * r
    const target = c - (Math.min(rate, 100) / 100) * c
    return this._card('예산 집행률', `
      <div style="display:flex;align-items:center;gap:20px">
        <div style="position:relative;width:${size}px;height:${size}px;flex-shrink:0" data-gauge>
          <svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
            <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#f0f0f0" stroke-width="${stroke}"/>
            <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-dasharray="${c}" stroke-dashoffset="${target}" stroke-linecap="round" style="transition:stroke-dashoffset 0.6s ease" data-target="${target}"/>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${color}">${totalPlanned ? rate + '%' : '-'}</div>
        </div>
        <div style="font-size:12px;color:#666;line-height:1.8">
          <div>계획: <strong>₩${(totalPlanned/10000).toFixed(0)}만</strong></div>
          <div>집행: <strong>₩${(totalActual/10000).toFixed(0)}만</strong></div>
        </div>
      </div>
    `)
  },

  _groupScoreMini(items, groups, authorityCode) {
    const barColors = ['#7C3AED', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
    const rows = groups.slice(0, 6).map((g, i) => {
      const groupItems = items.filter(it => { const inds = Indicator.getIndicators(g.id); return inds.some(ind => ind.id === it.indicator_id) })
      const avg = groupItems.length ? (groupItems.reduce((s, it) => s + (it.score || 0), 0) / groupItems.length) : 0
      return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f8f8f8">
        <span style="width:8px;height:8px;border-radius:50%;background:${barColors[i % barColors.length]};flex-shrink:0"></span>
        <span style="flex:1;font-size:12px;color:#555">${g.group_name}</span>
        <span style="font-size:12px;font-weight:600;color:${barColors[i % barColors.length]}">${avg.toFixed(1)}</span>
      </div>`
    }).join('')
    return this._card('그룹별 요약', rows || '<div style="color:#bbb;font-size:12px">데이터 없음</div>')
  }
}
