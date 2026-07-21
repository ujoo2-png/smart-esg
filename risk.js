const RISK_LEVELS = [
  { key: 'critical', label: '위험', color: '#e74c3c', min: 80 },
  { key: 'high', label: '높음', color: '#f39c12', min: 60 },
  { key: 'medium', label: '보통', color: '#f1c40f', min: 40 },
  { key: 'low', label: '낮음', color: '#27ae60', min: 0 }
]

const RISK_CATEGORIES = [
  { key: 'climate', label: '기후변화', icon: '🌡️', indicators: ['EV-ENV-POL', 'EV-ENV-OPS', 'EV-ENV-ANO'] },
  { key: 'resource', label: '자원고갈', icon: '⛏️', indicators: ['EV-ENV-PRD', 'EV-ENV-RES'] },
  { key: 'biodiversity', label: '생태계', icon: '🌿', indicators: ['EV-ENV-CERT'] },
  { key: 'labor', label: '인권/노동', icon: '👥', indicators: ['EV-LHR-POL', 'EV-LHR-HRM', 'EV-LHR-HR', 'EV-LHR-SD', 'EV-LHR-CS', 'EV-LHR-CLL', 'EV-LHR-RES'] },
  { key: 'governance', label: '지배구조', icon: '⚖️', indicators: ['EV-ETH-POL', 'EV-ETH-COR', 'EV-ETH-COMP', 'EV-ETH-INFO', 'EV-ETH-ANT'] },
  { key: 'supply_chain', label: '공급망', icon: '🔗', indicators: ['EV-SP-POL', 'EV-SP-ENV', 'EV-SP-SOC', 'EV-SP-RES', 'EV-360'] }
]

const RISK = {
  getRiskLevels() {
    return RISK_LEVELS
  },

  getCategories() {
    return RISK_CATEGORIES
  },

  calcCategoryRisk(category, scores) {
    const cat = RISK_CATEGORIES.find(c => c.key === category)
    if (!cat) return null
    const indicatorScores = cat.indicators.map(code => {
      const found = scores.find(s => s.code === code)
      return found ? found.score : 0
    })
    const validScores = indicatorScores.filter(s => s > 0)
    if (validScores.length === 0) return { score: 0, level: 'low', label: '데이터 없음', trend: 'stable' }
    const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length
    const riskScore = 100 - avg
    const level = RISK_LEVELS.find(l => riskScore >= l.min) || RISK_LEVELS[RISK_LEVELS.length - 1]
    return { score: Math.round(riskScore), level: level.key, label: level.label, color: level.color, trend: 'stable' }
  },

  analyzeTrend(assessmentId) {
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) return []
    const prevAssessments = Store.getAssessments()
      .filter(a => a.assessment_year < assessment.assessment_year && a.authority_code === 'ECOVADIS')
      .sort((a, b) => b.assessment_year - a.assessment_year)

    return RISK_CATEGORIES.map(cat => {
      const currentScores = items.map(item => {
        const indicator = Store.getIndicators().find(i => i.id === item.indicator_id)
        return indicator ? { code: indicator.indicator_code, score: item.score } : null
      }).filter(Boolean)

      const prevAssessment = prevAssessments[0]
      let prevScores = []
      if (prevAssessment) {
        const prevItems = Store.getAssessmentItems().filter(i => i.assessment_id === prevAssessment.id)
        prevScores = prevItems.map(item => {
          const indicator = Store.getIndicators().find(i => i.id === item.indicator_id)
          return indicator ? { code: indicator.indicator_code, score: item.score } : null
        }).filter(Boolean)
      }

      const current = this.calcCategoryRisk(cat.key, currentScores)
      const prev = prevScores.length ? this.calcCategoryRisk(cat.key, prevScores) : null
      const trend = prev ? (current.score > prev.score + 5 ? 'worsening' : current.score < prev.score - 5 ? 'improving' : 'stable') : 'stable'

      return { ...cat, risk: { ...current, trend }, prev_score: prev?.score ?? null }
    })
  },

  calcOverallRisk(assessmentId) {
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const scores = items.map(item => {
      const indicator = Store.getIndicators().find(i => i.id === item.indicator_id)
      return indicator ? { code: indicator.indicator_code, score: item.score } : null
    }).filter(Boolean)
    const validScores = scores.map(s => s.score).filter(s => s > 0)
    if (validScores.length === 0) return { score: 0, level: 'low', label: '데이터 없음' }
    const avg = validScores.reduce((a, b) => a + b, 0) / validScores.length
    const riskScore = 100 - avg
    const level = RISK_LEVELS.find(l => riskScore >= l.min) || RISK_LEVELS[RISK_LEVELS.length - 1]
    return { score: Math.round(riskScore), level: level.key, label: level.label, color: level.color }
  },

  generateAlerts(assessmentId) {
    const categories = this.analyzeTrend(assessmentId)
    const alerts = []
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const scores = items.map(item => {
      const indicator = Store.getIndicators().find(i => i.id === item.indicator_id)
      return indicator ? { code: indicator.indicator_code, score: item.score } : null
    }).filter(Boolean)
    categories.forEach(cat => {
      if (cat.risk.level === 'critical') {
        alerts.push({ severity: 'critical', category: cat.label, message: `${cat.label} 리스크가 위험 수준입니다 (${cat.risk.score}점)`, icon: cat.icon })
      }
      if (cat.risk.trend === 'worsening') {
        alerts.push({ severity: 'warning', category: cat.label, message: `${cat.label} 리스크가 악화 추세입니다`, icon: cat.icon })
      }
      const missingCount = cat.indicators.filter(code => {
        return !scores?.find(s => s.code === code)
      }).length
      if (missingCount > 0 && missingCount === cat.indicators.length) {
        alerts.push({ severity: 'info', category: cat.label, message: `${cat.label}: ${missingCount}개 지표 데이터 미수집`, icon: cat.icon })
      }
    })
    const overall = this.calcOverallRisk(assessmentId)
    if (overall.level === 'critical') {
      alerts.unshift({ severity: 'critical', category: '전체', message: `전체 리스크가 위험 수준입니다`, icon: '🚨' })
    }
    return alerts
  },

  generateReport(assessmentId) {
    const overall = this.calcOverallRisk(assessmentId)
    const categories = this.analyzeTrend(assessmentId)
    const alerts = this.generateAlerts(assessmentId)

    let html = '<div style="font-size:12px;line-height:1.6">'
    html += `<div style="text-align:center;padding:20px;border-radius:8px;margin-bottom:16px;background:${overall.color || '#f8f9fa'}20;border:2px solid ${overall.color || '#ddd'}">`
    html += `<div style="font-size:32px;font-weight:700;color:${overall.color || '#333'}">${overall.score}</div>`
    html += `<div style="font-size:14px;color:${overall.color || '#333'}">종합 리스크 점수 (${overall.label})</div></div>`

    if (alerts.length) {
      html += '<div style="margin-bottom:16px"><h4 style="margin:0 0 8px 0;font-size:13px">⚠️ 알림</h4>'
      alerts.forEach(a => {
        const colors = { critical: '#e74c3c', warning: '#f39c12', info: '#3498db' }
        html += `<div style="padding:8px 12px;margin-bottom:4px;background:${colors[a.severity]}10;border-left:3px solid ${colors[a.severity]};border-radius:4px">${a.icon} <strong>[${a.category}]</strong> ${a.message}</div>`
      })
      html += '</div>'
    }

    html += '<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">카테고리</th><th style="width:60px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">점수</th><th style="width:60px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">수준</th><th style="width:60px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">추세</th></tr>'
    categories.forEach(cat => {
      const trendIcons = { worsening: '📈 악화', improving: '📉 개선', stable: '➡️ 유지' }
      html += `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0">${cat.icon} ${cat.label}</td>
        <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0"><strong>${cat.risk.score}</strong></td>
        <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0"><span style="color:${cat.risk.color};font-weight:600">${cat.risk.label}</span></td>
        <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0">${trendIcons[cat.risk.trend]}</td></tr>`
    })
    html += '</table></div>'
    return { overall, categories, alerts, html }
  }
}
