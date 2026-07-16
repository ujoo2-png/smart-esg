const GRI_STANDARDS = [
  { code: 'GRI 2', name: '조직 개요', category: 'universal', required: true },
  { code: 'GRI 3', name: '이해관계자 참여', category: 'universal', required: true },
  { code: 'GRI 201', name: '경제 성과', category: 'economic', required: true },
  { code: 'GRI 202', name: '시장 입지', category: 'economic', required: false },
  { code: 'GRI 203', name: '간접 경제 영향', category: 'economic', required: false },
  { code: 'GRI 204', name: '조달 관행', category: 'economic', required: false },
  { code: 'GRI 205', name: '반부패', category: 'economic', required: true },
  { code: 'GRI 206', name: '공정경쟁', category: 'economic', required: false },
  { code: 'GRI 207', name: '세금', category: 'economic', required: false },
  { code: 'GRI 301', name: '자재', category: 'environmental', required: true },
  { code: 'GRI 302', name: '에너지', category: 'environmental', required: true },
  { code: 'GRI 303', name: '수자원', category: 'environmental', required: true },
  { code: 'GRI 304', name: '생물다양성', category: 'environmental', required: false },
  { code: 'GRI 305', name: '배출', category: 'environmental', required: true },
  { code: 'GRI 306', name: '폐기물', category: 'environmental', required: true },
  { code: 'GRI 307', name: '환경 규정 준수', category: 'environmental', required: true },
  { code: 'GRI 308', name: '공급망 환경 평가', category: 'environmental', required: false },
  { code: 'GRI 401', name: '고용', category: 'social', required: true },
  { code: 'GRI 402', name: '노사관계', category: 'social', required: true },
  { code: 'GRI 403', name: '산업안전보건', category: 'social', required: true },
  { code: 'GRI 404', name: '교육훈련', category: 'social', required: false },
  { code: 'GRI 405', name: '다양성과 기회균등', category: 'social', required: false },
  { code: 'GRI 406', name: '차별 금지', category: 'social', required: true },
  { code: 'GRI 407', name: '결사의 자유', category: 'social', required: false },
  { code: 'GRI 408', name: '아동노동 금지', category: 'social', required: true },
  { code: 'GRI 409', name: '강제노동 금지', category: 'social', required: true },
  { code: 'GRI 410', name: '인권 정책', category: 'social', required: true },
  { code: 'GRI 411', name: '원주민 권리', category: 'social', required: false },
  { code: 'GRI 413', name: '지역사회', category: 'social', required: false },
  { code: 'GRI 414', name: '공급망 사회 평가', category: 'social', required: false },
  { code: 'GRI 415', name: '공공 정책', category: 'social', required: false },
  { code: 'GRI 416', name: '고객 안전', category: 'social', required: false },
  { code: 'GRI 417', name: '마케팅 라벨링', category: 'social', required: false },
  { code: 'GRI 418', name: '고객 프라이버시', category: 'social', required: true }
]

const GRI_MAPPING = {
  'EV-ENV-POL': ['GRI 302', 'GRI 305'],
  'EV-ENV-OPS': ['GRI 302', 'GRI 303', 'GRI 305'],
  'EV-ENV-PRD': ['GRI 306'],
  'EV-ENV-CERT': ['GRI 304'],
  'EV-ENV-RES': ['GRI 301', 'GRI 302', 'GRI 305', 'GRI 307'],
  'EV-LHR-POL': ['GRI 401', 'GRI 410'],
  'EV-LHR-HRM': ['GRI 401', 'GRI 402', 'GRI 403', 'GRI 404'],
  'EV-LHR-HR': ['GRI 405', 'GRI 406', 'GRI 408', 'GRI 409', 'GRI 410'],
  'EV-LHR-RES': ['GRI 401', 'GRI 403'],
  'EV-ETH-POL': ['GRI 205'],
  'EV-ETH-COR': ['GRI 205'],
  'EV-ETH-COMP': ['GRI 206'],
  'EV-ETH-INFO': ['GRI 418'],
  'EV-SP-POL': ['GRI 308', 'GRI 414'],
  'EV-SP-ENV': ['GRI 308'],
  'EV-SP-SOC': ['GRI 414'],
  'EV-SP-RES': ['GRI 308', 'GRI 414'],
  'EV-360': ['GRI 206']
}

const GRI = {
  getStandards() {
    return GRI_STANDARDS
  },

  getRequiredStandards() {
    return GRI_STANDARDS.filter(s => s.required)
  },

  getStandardsByCategory(category) {
    return GRI_STANDARDS.filter(s => s.category === category)
  },

  getMappedGRIs(indicatorCode) {
    return GRI_MAPPING[indicatorCode] || []
  },

  getIndicatorsForGRI(griCode) {
    const indicators = Store.getIndicators().filter(i => i.authority_code === 'ECOVADIS')
    return indicators.filter(ind => {
      const mapped = GRI_MAPPING[ind.indicator_code]
      return mapped && mapped.includes(griCode)
    })
  },

  calcComplianceRate(assessmentId) {
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const required = this.getRequiredStandards()
    const covered = new Set()
    const partial = new Set()

    items.forEach(item => {
      const indicator = Store.getIndicators().find(i => i.id === item.indicator_id)
      if (!indicator) return
      const grieCodes = GRI_MAPPING[indicator.indicator_code] || []
      grieCodes.forEach(code => {
        if (item.score >= 70) covered.add(code)
        else if (item.score >= 30) partial.add(code)
      })
    })

    const totalRequired = required.length
    const fullCount = required.filter(s => covered.has(s.code)).length
    const partialCount = required.filter(s => partial.has(s.code) && !covered.has(s.code)).length
    const uncovered = totalRequired - fullCount - partialCount

    return {
      total_required: totalRequired,
      full_compliance: fullCount,
      with_reference: partialCount,
      non_compliant: uncovered,
      full_rate: totalRequired ? ((fullCount / totalRequired) * 100).toFixed(1) : 0,
      with_ref_rate: totalRequired ? (((fullCount + partialCount) / totalRequired) * 100).toFixed(1) : 0,
      details: required.map(s => ({
        code: s.code,
        name: s.name,
        status: covered.has(s.code) ? 'compliant' : partial.has(s.code) ? 'with_reference' : 'non_compliant',
        indicators: this.getIndicatorsForGRI(s.code).map(ind => {
          const item = items.find(i => i.indicator_id === ind.id)
          return { code: ind.indicator_code, name: ind.indicator_name, score: item?.score ?? null }
        })
      }))
    }
  },

  generateComplianceReport(assessmentId) {
    const rate = this.calcComplianceRate(assessmentId)
    const categories = ['universal', 'economic', 'environmental', 'social']
    const categoryNames = { universal: '보편적', economic: '경제', environmental: '환경', social: '사회' }

    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px">'
    html += '<tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">GRI 기준</th><th style="width:80px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">상태</th><th style="width:60px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">연결 지표</th></tr>'

    categories.forEach(cat => {
      const items = rate.details.filter(d => {
        const std = GRI_STANDARDS.find(s => s.code === d.code)
        return std && std.category === cat
      })
      if (!items.length) return
      html += `<tr><td colspan="3" style="padding:8px;font-weight:600;background:#f8f9fa;border-bottom:1px solid #eee">${categoryNames[cat]}</td></tr>`
      items.forEach(d => {
        const statusColors = { compliant: '#27ae60', with_reference: '#f39c12', non_compliant: '#e74c3c' }
        const statusLabels = { compliant: '완전준수', with_reference: '부분준수', non_compliant: '미준수' }
        html += `<tr>
          <td style="padding:4px 8px;border-bottom:1px solid #f0f0f0">${d.code} - ${d.name}</td>
          <td style="text-align:center;padding:4px 8px;border-bottom:1px solid #f0f0f0"><span style="color:${statusColors[d.status]};font-weight:600;font-size:11px">${statusLabels[d.status]}</span></td>
          <td style="text-align:center;padding:4px 8px;border-bottom:1px solid #f0f0f0">${d.indicators.length}</td>
        </tr>`
      })
    })
    html += '</table>'
    return { rate, html }
  }
}
