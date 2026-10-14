const BENCHMARK_FALLBACK = {
  industries: [
    { code: 'mfg', label: '제조업', avg_score: 52, sample_size: 156 },
    { code: 'ict', label: 'ICT', avg_score: 61, sample_size: 89 },
    { code: 'finance', label: '금융', avg_score: 58, sample_size: 67 },
    { code: 'energy', label: '에너지', avg_score: 45, sample_size: 43 },
    { code: 'service', label: '서비스', avg_score: 49, sample_size: 112 },
    { code: 'construction', label: '건설', avg_score: 41, sample_size: 54 },
    { code: 'retail', label: '유통', avg_score: 47, sample_size: 78 },
    { code: 'pharma', label: '제약/바이오', avg_score: 55, sample_size: 36 }
  ],
  source: '내부 기준값 (데모 데이터)',
  source_type: 'internal_demo',
  last_updated: null
}

const MONITORING = {
  getIndustries() {
    const stored = (typeof Store !== 'undefined' && Store.getBenchmarkIndustries) ? Store.getBenchmarkIndustries() : null
    return (stored && stored.length) ? stored : BENCHMARK_FALLBACK.industries
  },

  getMeta() {
    const meta = (typeof Store !== 'undefined' && Store.getBenchmarkMeta) ? Store.getBenchmarkMeta() : null
    return meta || { source: BENCHMARK_FALLBACK.source, source_type: BENCHMARK_FALLBACK.source_type, last_updated: BENCHMARK_FALLBACK.last_updated }
  },

  getBenchmarks() {
    const industries = this.getIndustries()
    const sum = industries.reduce((acc, i) => acc + (Number(i.avg_score) || 0), 0)
    const meta = this.getMeta()
    return {
      industries,
      global_avg: industries.length ? Math.round(sum / industries.length) : 0,
      sample_source: meta.source,
      source_type: meta.source_type,
      last_updated: meta.last_updated,
      is_demo: meta.source_type === 'internal_demo'
    }
  },

  getIndustryBenchmark(industryCode) {
    return this.getIndustries().find(i => i.code === industryCode)
  },

  compareToIndustry(assessmentId, industryCode) {
    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) return null
    const benchmark = this.getIndustryBenchmark(industryCode)
    if (!benchmark) return null
    const benchmarks = this.getBenchmarks()
    const companyScore = assessment.total_score || 0
    const diff = companyScore - benchmark.avg_score
    const percentile = diff > 0
      ? Math.min(95, 50 + Math.round((diff / benchmark.avg_score) * 30))
      : Math.max(5, 50 - Math.round((Math.abs(diff) / benchmark.avg_score) * 30))

    return {
      company_score: companyScore,
      industry_avg: benchmark.avg_score,
      industry: benchmark.label,
      difference: diff,
      percentile,
      status: diff > 10 ? 'above' : diff > 0 ? 'slightly_above' : diff > -10 ? 'slightly_below' : 'below',
      statusLabel: diff > 10 ? '상위' : diff > 0 ? '평균 이상' : diff > -10 ? '평균 이하' : '하위',
      sample_size: benchmark.sample_size,
      global_avg: benchmarks.global_avg,
      global_diff: companyScore - benchmarks.global_avg
    }
  },

  compareToAll(assessmentId) {
    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) return null
    const companyScore = assessment.total_score || 0
    return this.getIndustries().map(ind => {
      const diff = companyScore - ind.avg_score
      return {
        industry: ind.label,
        code: ind.code,
        avg: ind.avg_score,
        diff,
        companyScore,
        above: diff > 0
      }
    })
  },

  trackHistory(companyId) {
    const assessments = Store.getAssessments()
      .filter(a => a.company_id === companyId)
      .sort((a, b) => a.assessment_year - b.assessment_year)
    const history = []
    assessments.forEach(a => {
      const items = Store.getAssessmentItems().filter(i => i.assessment_id === a.id)
      const scores = items.map(i => i.score).filter(s => s > 0)
      const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length) : 0
      history.push({
        year: a.assessment_year,
        score: a.total_score || avg,
        assessment_id: a.id,
        label: `${a.assessment_year}년`
      })
    })
    return history
  },

  getAlertRules() {
    return [
      { id: 'below_industry', name: '업계 평균 이하', description: '자사 점수가 업계 평균보다 10점 이상 낮을 때', enabled: true },
      { id: 'below_global', name: '글로벌 평균 이하', description: '자사 점수가 글로벌 평균보다 낮을 때', enabled: true },
      { id: 'regression', name: '점수 후퇴', description: '전년 대비 5점 이상 하락할 때', enabled: true },
      { id: 'low_pillar', name: '필러 최저점', description: '특정 필러 점수가 40점 미만일 때', enabled: true },
      { id: 'new_regulation', name: '규제 변화', description: '평가 기준 변경이 감지될 때', enabled: false }
    ]
  },

  generateReport(assessmentId, industryCode) {
    const comparison = this.compareToIndustry(assessmentId, industryCode)
    const allComparison = this.compareToAll(assessmentId)
    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) return '<p>평가 데이터를 찾을 수 없습니다.</p>'

    let html = '<div style="font-size:12px;line-height:1.6">'
    html += '<h4 style="margin:0 0 12px 0;font-size:14px">📊 경쟁사 벤치마크 분석</h4>'

    if (comparison) {
      const statusColors = { above: '#27ae60', slightly_above: '#2ecc71', slightly_below: '#f39c12', below: '#e74c3c' }
      html += `<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">`
      html += `<div style="flex:1;min-width:140px;text-align:center;padding:12px;background:#f8f9fa;border-radius:6px"><div style="font-size:24px;font-weight:700">${comparison.company_score}</div><div style="font-size:11px;color:#666">자사 점수</div></div>`
      html += `<div style="flex:1;min-width:140px;text-align:center;padding:12px;background:#f8f9fa;border-radius:6px"><div style="font-size:24px;font-weight:700;color:#3498db">${comparison.industry_avg}</div><div style="font-size:11px;color:#666">${comparison.industry} 평균</div></div>`
      html += `<div style="flex:1;min-width:140px;text-align:center;padding:12px;background:#f8f9fa;border-radius:6px"><div style="font-size:24px;font-weight:700;color:#9b59b6">${comparison.global_avg}</div><div style="font-size:11px;color:#666">글로벌 평균</div></div>`
      html += `<div style="flex:1;min-width:140px;text-align:center;padding:12px;background:${statusColors[comparison.status]}15;border:2px solid ${statusColors[comparison.status]};border-radius:6px"><div style="font-size:18px;font-weight:700;color:${statusColors[comparison.status]}">${comparison.statusLabel}</div><div style="font-size:11px;color:#666">${comparison.difference > 0 ? '+' : ''}${comparison.difference}점 차이</div></div>`
      html += '</div>'

      html += `<div style="padding:12px;background:#f8f9fa;border-radius:6px;margin-bottom:16px">`
      html += `<strong>상대 위치:</strong> ${comparison.industry} 내 상위 약 ${100 - comparison.percentile}% 이내 (샘플 ${comparison.sample_size}개사 기준)`
      html += `<br><strong>글로벌 대비:</strong> ${comparison.global_diff > 0 ? '+' : ''}${comparison.global_diff}점`
      html += '</div>'
    }

    if (allComparison && allComparison.length) {
      html += '<h4 style="margin:0 0 8px 0;font-size:13px"> 업종별 비교</h4>'
      html += '<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ddd">업종</th><th style="width:60px;text-align:center;padding:4px 8px;border-bottom:2px solid #ddd">평균</th><th style="width:60px;text-align:center;padding:4px 8px;border-bottom:2px solid #ddd">차이</th><th style="width:40px;text-align:center;padding:4px 8px;border-bottom:2px solid #ddd">상태</th></tr>'
      allComparison.sort((a, b) => b.avg - a.avg).forEach(c => {
        html += `<tr><td style="padding:4px 8px;border-bottom:1px solid #f0f0f0">${c.industry}</td><td style="text-align:center;padding:4px 8px;border-bottom:1px solid #f0f0f0">${c.avg}</td><td style="text-align:center;padding:4px 8px;border-bottom:1px solid #f0f0f0;color:${c.above ? '#27ae60' : '#e74c3c'}">${c.diff > 0 ? '+' : ''}${c.diff}</td><td style="text-align:center;padding:4px 8px;border-bottom:1px solid #f0f0f0">${c.above ? '✅' : '⚠️'}</td></tr>`
      })
      html += '</table>'
    }
    html += '</div>'
    return html
  }
}
