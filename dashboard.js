const Dashboard = {
  render(containerId, assessmentId) {
    const container = document.getElementById(containerId)
    if (!container) return

    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) {
      container.innerHTML = '<p style="text-align:center;padding:40px;color:#999">평가 데이터가 없습니다.</p>'
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

    container.innerHTML = ''
    const wrap = el('div', { style: 'display:flex;flex-direction:column;gap:20px' })

    wrap.append(
      this._kpiRow(assessment, items, evidenceCount, risks),
      this._chartRow1(items, groups, assessment.authority_code, ghgSummary),
      this._chartRow2(evidenceCount, drafts, suppliers),
      this._chartRow3(risks, alerts),
      this._chartRow4(items, groups, assessment.authority_code)
    )

    container.append(wrap)
  },

  _kpi(a, label, value, sub, pct, color) {
    const size = 72, stroke = 6
    const r = (size - stroke) / 2, c = 2 * Math.PI * r
    const targetOffset = c - (Math.min(pct, 100) / 100) * c

    const circle = el('circle', { cx: size/2, cy: size/2, r: r, fill: 'none', stroke: '#f0f0f0', stroke-width: stroke })
    const active = el('circle', {
      cx: size/2, cy: size/2, r: r, fill: 'none',
      stroke: color, 'stroke-width': stroke,
      'stroke-dasharray': c, 'stroke-dashoffset': c,
      'stroke-linecap': 'round',
      style: 'transition:stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)'
    })
    const svg = el('svg', { width: size, height: size, style: 'transform:rotate(-90deg);flex-shrink:0' }, circle, active)

    const card = el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px;display:flex;align-items:center;gap:20px' },
      el('div', { style: 'position:relative;width:' + size + 'px;height:' + size + 'px;flex-shrink:0' },
        svg,
        el('div', { style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:' + color }, value)
      ),
      el('div', {},
        el('div', { style: 'font-size:11px;color:#aaa;text-transform:uppercase;letter-spacing:.5px' }, label),
        el('div', { style: 'font-size:22px;font-weight:700;color:#1a1a2e;margin-top:2px' }, a),
        el('div', { style: 'font-size:11px;color:#bbb;margin-top:4px' }, sub)
      )
    )

    card.style.cursor = 'pointer'
    card.addEventListener('click', () => {
      active.style.transition = 'none'
      active.setAttribute('stroke-dashoffset', c)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          active.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)'
          active.setAttribute('stroke-dashoffset', targetOffset)
        })
      })
    })

    setTimeout(() => active.setAttribute('stroke-dashoffset', targetOffset), 100)
    return card
  },

  _kpiRow(a, items, ec, risks) {
    const gradeColor = { Platinum: '#8e44ad', Gold: '#d4a017', Silver: '#7f8c8d', Bronze: '#cd7f32' }
    const total = items.length
    const done = items.filter(i => i.status === 'completed' || i.status === 'excluded').length
    const pct = total ? Math.round(done / total * 100) : 0
    const ePct = ec.total ? Math.round(ec.externally_verified / ec.total * 100) : 0
    const rc = risks.overall.color || '#94a3b8'

    return el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:16px' },
      this._kpi(a.rating || '미평가', '총점', `${a.total_score != null ? a.total_score.toFixed(0) : '-'}`, `${Indicator.getAuthorityName(a.authority_code)} · ${a.assessment_year}년`, a.total_score || 0, gradeColor[a.rating] || '#7C3AED'),
      this._kpi(`${pct}%`, '완료율', `${done} / ${total}`, `${items.filter(i=>i.status==='in_progress').length}건 진행중`, pct, pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'),
      this._kpi(`${ec.total}건`, '증빙', `외부검증 ${ec.externally_verified}건`, `검증률 ${ePct}%`, ePct, '#3b82f6'),
      this._kpi(risks.overall.label || '미평가', '리스크', `${risks.alerts.length}건 알림`, '', risks.overall.score || 0, rc)
    )
  },

  _barChart(title, bars) {
    const card = el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, title)
    )
    bars.forEach(b => {
      const barInner = el('div', {
        style: `background:${b.color};height:100%;width:0%;border-radius:4px;transition:width 0s`,
        'data-target': b.pct
      })
      const barWrap = el('div', { style: 'background:#f5f5f5;height:8px;border-radius:4px;overflow:hidden;cursor:pointer' }, barInner)
      const valLabel = el('span', { style: `font-size:13px;font-weight:600;color:${b.color}` }, '0')

      barWrap.addEventListener('click', () => {
        barInner.style.transition = 'none'
        barInner.style.width = '0%'
        valLabel.style.transition = 'none'
        valLabel.style.opacity = '0'
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            barInner.style.transition = 'width 1s cubic-bezier(.4,0,.2,1)'
            barInner.style.width = b.pct + '%'
            valLabel.style.transition = 'opacity .5s ease .4s'
            valLabel.style.opacity = '1'
            valLabel.textContent = b.value
          })
        })
      })

      card.append(el('div', { style: 'margin:10px 0' },
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:5px' },
          el('span', { style: 'font-size:12px;color:#555;font-weight:500' }, b.label),
          valLabel
        ),
        barWrap,
        b.sub ? el('div', { style: 'font-size:10px;color:#bbb;margin-top:3px' }, b.sub) : null
      ))

      setTimeout(() => {
        barInner.style.transition = 'width 1s cubic-bezier(.4,0,.2,1)'
        barInner.style.width = b.pct + '%'
        valLabel.textContent = b.value
      }, 200)
    })
    return card
  },

  _chartRow1(items, groups, authCode, ghgSummary) {
    const usePillar = authCode === 'ECOVADIS'
    const colors = ['#7C3AED', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
    let bars = []

    if (usePillar) {
      const pillarParams = Store.getWeightParams().filter(w => w.authority_code === 'ECOVADIS' && w.group_code === '_PILLAR')
      ;['POLICY', 'ACTION', 'RESULT'].forEach((p, i) => {
        const pItems = items.filter(it => { const ind = Store.getIndicators().find(x => x.id === it.indicator_id); return ind && ind.pillar === p })
        const avg = pItems.length ? (pItems.reduce((s, it) => s + (it.score || 0), 0) / pItems.length) : 0
        const pw = pillarParams.find(pp => pp.pillar === p)
        bars.push({ label: Indicator.getPillarName(p), value: avg.toFixed(1), pct: avg, color: colors[i], sub: pw ? `가중치 ${pw.weight_pct}%` : '' })
      })
    } else {
      groups.forEach((g, i) => {
        const gItems = items.filter(it => { const inds = Indicator.getIndicators(g.id); return inds.some(ind => ind.id === it.indicator_id) })
        const avg = gItems.length ? (gItems.reduce((s, it) => s + (it.score || 0), 0) / gItems.length) : 0
        bars.push({ label: g.group_name, value: avg.toFixed(1), pct: avg, color: colors[i % colors.length] })
      })
    }

    const entries = Object.values(ghgSummary)
    const total = entries.reduce((s, e) => s + e.total, 0)
    const ghgColors = ['#3b82f6', '#10b981', '#06b6d4', '#8b5cf6', '#f59e0b']
    const svgSize = 120, svgR = 44, svgC = 2 * Math.PI * svgR
    let cumPct = 0
    const donutCircles = entries.map((e, i) => {
      const pct = total ? e.total / total : 0
      const dashLen = pct * svgC
      const dashOff = svgC - cumPct * svgC
      cumPct += pct
      return { dashLen, dashOff, color: ghgColors[i], circumference: svgC, label: e.scope2_method ? `Scope 2 (${e.scope2_method === 'location-based' ? '위치' : '시장'})` : `Scope ${e.scope}`, value: e.total.toFixed(1) }
    })

    const ghgCard = el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, 'GHG 배출량 (tCO₂eq)')
    )

    if (entries.length) {
      const svgCircles = donutCircles.map(d => {
        const circ = el('circle', { cx: svgSize/2, cy: svgSize/2, r: svgR, fill: 'none', stroke: d.color, 'stroke-width': 18, 'stroke-dasharray': '0 ' + d.circumference, transform: `rotate(-90 ${svgSize/2} ${svgSize/2})` })
        setTimeout(() => { circ.style.transition = 'stroke-dasharray .8s cubic-bezier(.4,0,.2,1)'; circ.setAttribute('stroke-dasharray', d.dashLen + ' ' + (d.circumference - d.dashLen)) }, 300)
        return circ
      })
      const svg = el('svg', { width: svgSize, height: svgSize, style: 'flex-shrink:0;cursor:pointer' }, ...svgCircles)
      svg.addEventListener('click', () => {
        svgCircles.forEach((circ, i) => {
          circ.style.transition = 'none'
          circ.setAttribute('stroke-dasharray', '0 ' + svgC)
          setTimeout(() => {
            circ.style.transition = 'stroke-dasharray .8s cubic-bezier(.4,0,.2,1) ' + (i * 0.1) + 's'
            circ.setAttribute('stroke-dasharray', donutCircles[i].dashLen + ' ' + (svgC - donutCircles[i].dashLen))
          }, 50)
        })
      })

      const legend = donutCircles.map(d => el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0' },
        el('span', { style: 'width:10px;height:10px;border-radius:50%;background:' + d.color + ';flex-shrink:0' }),
        el('span', { style: 'flex:1;font-size:12px;color:#666' }, d.label),
        el('span', { style: 'font-size:12px;font-weight:600;color:#333' }, d.value)
      ))

      ghgCard.append(el('div', { style: 'display:flex;align-items:center;gap:24px' }, svg, el('div', { style: 'flex:1' }, ...legend)))
    } else {
      ghgCard.append(el('div', { style: 'text-align:center;padding:24px;color:#bbb;font-size:12px' }, '데이터 없음'))
    }
    ghgCard.append(el('div', { style: 'margin-top:8px;font-size:11px;color:#bbb' }, `합계 ${total.toFixed(1)} tCO₂eq`))

    return el('div', { style: 'display:grid;grid-template-columns:1.2fr 0.8fr;gap:16px' },
      this._barChart(usePillar ? '필러별 점수' : '테마별 점수', bars),
      ghgCard
    )
  },

  _stackedBar(title, segments, total) {
    const barInner = segments.map((s, i) => {
      const seg = el('div', {
        style: `background:${s.color};height:100%;width:0%;transition:width 0s`,
        'data-target': (s.count / total * 100)
      })
      setTimeout(() => { seg.style.transition = `width .7s cubic-bezier(.4,0,.2,1) ${i * 0.1}s`; seg.style.width = (s.count / total * 100) + '%' }, 300)
      return seg
    })

    const bar = el('div', { style: 'display:flex;height:10px;border-radius:5px;overflow:hidden;margin-bottom:14px;cursor:pointer' }, ...barInner)
    bar.addEventListener('click', () => {
      barInner.forEach((seg, i) => {
        seg.style.transition = 'none'
        seg.style.width = '0%'
        setTimeout(() => { seg.style.transition = `width .7s cubic-bezier(.4,0,.2,1) ${i * 0.1}s`; seg.style.width = segments[i].count / total * 100 + '%' }, 50)
      })
    })

    const legend = segments.map(s => el('div', { style: 'display:flex;align-items:center;gap:6px;font-size:12px' },
      el('span', { style: 'width:8px;height:8px;border-radius:50%;background:' + s.color + ';flex-shrink:0' }),
      el('span', { style: 'flex:1;color:#666' }, s.label),
      el('span', { style: 'font-weight:600;color:#333' }, s.count + '건')
    ))

    return el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, title),
      bar,
      ...legend,
      el('div', { style: 'margin-top:8px;font-size:11px;color:#bbb' }, `외부검증률 ${total > 1 ? Math.round(segments[0].count / total * 100) : 0}%`)
    )
  },

  _chartRow2(ec, drafts, suppliers) {
    const total = ec.total || 1
    const segs = [
      { label: '외부검증', count: ec.externally_verified, color: '#10b981' },
      { label: '내부검토', count: ec.internal_reviewed, color: '#3b82f6' },
      { label: '자가입력', count: ec.self, color: '#f59e0b' }
    ]

    const dTotal = drafts.length
    const approved = drafts.filter(d => d.human_status === 'approved').length
    const verified = drafts.filter(d => d.ver_status === 'pass').length
    const pending = drafts.filter(d => d.ver_status === 'pending').length
    const failed = drafts.filter(d => d.ver_status === 'fail').length
    const dPct = dTotal ? Math.round(approved / dTotal * 100) : 0
    const dColors = [
      { label: '승인', count: approved, color: '#10b981' },
      { label: '검증', count: verified, color: '#3b82f6' },
      { label: '대기', count: pending, color: '#f59e0b' },
      { label: '실패', count: failed, color: '#ef4444' }
    ]

    const draftCard = el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, 'AI 초안 진행'),
      el('div', { style: 'display:flex;align-items:center;gap:16px;margin-bottom:14px' },
        el('div', { style: 'font-size:20px;font-weight:700;color:#1a1a2e' }, dTotal + ''),
        el('div', { style: 'font-size:11px;color:#bbb' }, '전체 초안')
      ),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        ...dColors.map(b => el('div', { style: 'display:flex;align-items:center;gap:4px;font-size:11px;padding:3px 8px;background:' + b.color + '08;border-radius:6px;color:' + b.color + ';font-weight:500' },
          el('span', { style: 'width:6px;height:6px;border-radius:50%;background:' + b.color }),
          b.label + ' ' + b.count
        ))
      )
    )

    const summary = { A: 0, B: 0, C: 0, D: 0 }
    suppliers.forEach(s => { if (s.last_vsme_grade && summary[s.last_vsme_grade] !== undefined) summary[s.last_vsme_grade]++ })
    const gColors = { A: '#10b981', B: '#3b82f6', C: '#f59e0b', D: '#ef4444' }
    const supplierBars = Object.entries(summary).map(([g, count]) => {
      const pct = suppliers.length ? Math.round(count / suppliers.length * 100) : 0
      return { label: g + '등급', value: count + '개사', pct, color: gColors[g] }
    })

    return el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px' },
      this._stackedBar('증빙 현황', segs, total),
      draftCard,
      this._barChart('협력사 등급', supplierBars.length && suppliers.length ? supplierBars : [{ label: '데이터 없음', value: '', pct: 0, color: '#ccc' }])
    )
  },

  _riskRow(cats) {
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
      return el('div', { style: 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #f8f8f8' },
        el('span', { style: 'font-size:16px;width:28px' }, cat.icon),
        el('span', { style: 'flex:1;font-size:13px;color:#555;font-weight:500' }, cat.label),
        el('span', { style: 'display:inline-block;width:36px;height:24px;line-height:24px;text-align:center;border-radius:6px;background:' + level.color + '10;color:' + level.color + ';font-weight:700;font-size:12px' }, cat.risk.score),
        el('span', { style: 'font-size:12px;color:' + level.color + ';font-weight:500;width:40px;text-align:right' }, cat.risk.label),
        el('span', { style: 'font-size:14px;color:' + trendColors[cat.risk.trend] + ';width:20px;text-align:center' }, trendIcons[cat.risk.trend])
      )
    })

    return el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, '리스크 매트릭스'),
      ...rows
    )
  },

  _alertFeed(alerts) {
    const colors = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' }
    const items = alerts.slice(0, 8).map(a => el('div', { style: 'padding:8px 0;border-bottom:1px solid #f8f8f8;font-size:12px' },
      el('span', { style: 'color:' + colors[a.severity] + ';font-weight:600' }, a.icon + ' ' + a.category),
      el('span', { style: 'color:#666;margin-left:4px' }, a.message)
    ))

    return el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, `알림 (${alerts.length}건)`),
      items.length ? items : el('div', { style: 'text-align:center;padding:16px;color:#10b981;font-size:12px' }, '알림이 없습니다')
    )
  },

  _chartRow3(risks, alerts) {
    return el('div', { style: 'display:grid;grid-template-columns:1.5fr 1fr;gap:16px' },
      this._riskRow(risks.categories),
      this._alertFeed(alerts)
    )
  },

  _miniRow(items, groups) {
    const colors = ['#7C3AED', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
    const rows = groups.slice(0, 6).map((g, i) => {
      const gItems = items.filter(it => { const inds = Indicator.getIndicators(g.id); return inds.some(ind => ind.id === it.indicator_id) })
      const avg = gItems.length ? (gItems.reduce((s, it) => s + (it.score || 0), 0) / gItems.length) : 0
      return el('div', { style: 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f8f8f8' },
        el('span', { style: 'width:8px;height:8px;border-radius:50%;background:' + colors[i % colors.length] + ';flex-shrink:0' }),
        el('span', { style: 'flex:1;font-size:12px;color:#555' }, g.group_name),
        el('span', { style: 'font-size:12px;font-weight:600;color:' + colors[i % colors.length] }, avg.toFixed(1))
      )
    })
    return el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, '그룹별 요약'),
      rows.length ? rows : el('div', { style: 'color:#bbb;font-size:12px;text-align:center' }, '데이터 없음')
    )
  },

  _budgetCard() {
    const budget = Store.getProjectBudget ? Store.getProjectBudget() : []
    const totalPlanned = budget.reduce((s, b) => s + (b.planned_amount || 0), 0)
    const totalActual = budget.reduce((s, b) => s + (b.actual_amount || 0), 0)
    const rate = totalPlanned ? Math.round(totalActual / totalPlanned * 100) : 0
    const color = rate > 100 ? '#ef4444' : rate > 80 ? '#f59e0b' : '#10b981'
    const size = 80, stroke = 7, r = (size - stroke) / 2, c = 2 * Math.PI * r
    const targetOffset = c - (Math.min(rate, 100) / 100) * c

    const active = el('circle', {
      cx: size/2, cy: size/2, r: r, fill: 'none',
      stroke: color, 'stroke-width': stroke,
      'stroke-dasharray': c, 'stroke-dashoffset': c,
      'stroke-linecap': 'round',
      style: 'transition:stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)'
    })
    const svg = el('svg', { width: size, height: size, style: 'transform:rotate(-90deg)' },
      el('circle', { cx: size/2, cy: size/2, r: r, fill: 'none', stroke: '#f0f0f0', 'stroke-width': stroke }),
      active
    )
    setTimeout(() => active.setAttribute('stroke-dashoffset', targetOffset), 300)

    const card = el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, '예산 집행률'),
      el('div', { style: 'display:flex;align-items:center;gap:20px' },
        el('div', { style: 'position:relative;width:' + size + 'px;height:' + size + 'px;flex-shrink:0' },
          svg,
          el('div', { style: 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:' + color }, totalPlanned ? rate + '%' : '-')
        ),
        el('div', { style: 'font-size:12px;color:#666;line-height:1.8' },
          el('div', { innerHTML: '계획: <strong>₩' + (totalPlanned/10000).toFixed(0) + '만</strong>' }),
          el('div', { innerHTML: '집행: <strong>₩' + (totalActual/10000).toFixed(0) + '만</strong>' })
        )
      )
    )
    card.style.cursor = 'pointer'
    card.addEventListener('click', () => {
      active.style.transition = 'none'
      active.setAttribute('stroke-dashoffset', c)
      setTimeout(() => { active.style.transition = 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)'; active.setAttribute('stroke-dashoffset', targetOffset) }, 50)
    })
    return card
  },

  _kssbCard() {
    const agencies = Store.getAgencyMaster ? Store.getAgencyMaster() : []
    const mandatory = agencies.filter(a => a.track_type === 'MANDATORY')
    const kssbAssessments = Store.getAssessments().filter(a => a.authority_code === 'KSSB' || a.authority_code === 'ISSB')
    const hasKssb = kssbAssessments.length > 0
    return el('div', { style: 'background:#fff;border:1px solid #f0f0f0;border-radius:12px;padding:20px' },
      el('div', { style: 'font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:14px' }, '법정 공시 현황'),
      el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:10px' },
        el('div', { style: 'width:36px;height:36px;border-radius:8px;background:' + (hasKssb ? '#10b98110' : '#ef444410') + ';display:flex;align-items:center;justify-content:center;font-size:18px' }, hasKssb ? '✓' : '!'),
        el('div', {},
          el('div', { style: 'font-size:15px;font-weight:700;color:' + (hasKssb ? '#10b981' : '#ef4444') }, hasKssb ? 'KSSB 진행중' : '미착수'),
          el('div', { style: 'font-size:11px;color:#bbb' }, kssbAssessments.length + '건 평가')
        )
      ),
      el('div', { style: 'font-size:12px;color:#888;line-height:1.6' },
        el('div', {}, '대상: ' + (mandatory.map(a => a.name).join(', ') || '없음')),
        mandatory[0] && mandatory[0].effective_date ? el('div', {}, '시행일: ' + mandatory[0].effective_date) : null
      )
    )
  },

  _chartRow4(items, groups, authCode) {
    return el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px' },
      this._kssbCard(),
      this._budgetCard(),
      this._miniRow(items, groups)
    )
  }
}
