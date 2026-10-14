// 협력사 리스크 진단 모듈 (VSME)
// 5축 구조: 기본정보 / 국가·산업 / ESG실사 / 증빙 / 개선조치

const SupplierRisk = {
  ANSWER_VALUES: { yes: 1, partial: 0.5, no: 0 },
  ANSWER_LABELS: { yes: '예', partial: '부분', no: '아니오' },

  RISK_LEVELS: [
    { value: 'high', label: '고위험', color: '#dc2626' },
    { value: 'medium', label: '중위험', color: '#d97706' },
    { value: 'low', label: '저위험', color: '#047857' },
    { value: 'pending', label: '미진단', color: '#9CA3AF' }
  ],

  STATUS_OPTIONS: [
    { value: 'not_started', label: '미착수' },
    { value: 'in_progress', label: '진행중' },
    { value: 'completed', label: '완료' },
    { value: 'overdue', label: '지연' }
  ],

  AXES: [
    { id: 'basic', name: '기본정보', icon: '🏢', desc: '협력사 기본 데이터 (회사명, 사업자번호, 대표자, 업종 등)' },
    { id: 'country', name: '국가·산업', icon: '🌍', desc: '국가별 리스크 등급, 산업 특성, 규제 환경' },
    { id: 'esg', name: 'ESG 실사', icon: '📋', desc: '환경(E)/사회(S)/지배구조(G) 5~10개 핵심 질문 진단' },
    { id: 'evidence', name: '증빙', icon: '📎', desc: '실사 항목별 증빙 문서 첨부 및 검증' },
    { id: 'action', name: '개선조치', icon: '🔧', desc: '진단 결과 기반 개선 과제, 담당자, 기한, 진행현황' }
  ],

  ESG_QUESTIONS: {
    E: [
      { id: 'e1', question: '온실가스 배출량을 측정·보고하고 있습니까?', weight: 2 },
      { id: 'e2', question: '환경 경영 시스템(ISO 14001 등)을 보유하고 있습니까?', weight: 2 },
      { id: 'e3', question: '유해화학물질 관리 및 규제 준수 현황은?', weight: 1 },
      { id: 'e4', question: '폐기물 처리 및 재활용율은?', weight: 1 },
      { id: 'e5', question: '용수 사용량 관리 및 절감 노력은?', weight: 1 }
    ],
    S: [
      { id: 's1', question: '직원 근로계약서를 체결하고 있습니까?', weight: 2 },
      { id: 's2', question: '산업안전보건 교육을 정기적으로 실시합니까?', weight: 2 },
      { id: 's3', question: '차별 및 괴롭힘 금지 정책이 있습니까?', weight: 1 },
      { id: 's4', question: '협력사 인권 존중 정책을 준수합니까?', weight: 1 },
      { id: 's5', question: '最低임금 및 법정근로시간을 준수합니까?', weight: 2 }
    ],
    G: [
      { id: 'g1', question: '부패방지 및 윤리경영 정책이 있습니까?', weight: 2 },
      { id: 'g2', question: '정보보안 관리 체계를 갖추고 있습니까?', weight: 1 },
      { id: 'g3', question: '사업자등록증 및 관련 인허가를 보유하고 있습니까?', weight: 2 },
      { id: 'g4', question: '재무제표를 투명하게 공개합니까?', weight: 1 },
      { id: 'g5', question: '내부통제 및 리스크 관리 프로세스가 있습니까?', weight: 1 }
    ]
  },

  createDefault() {
    return {
      company_name: '',
      business_number: '',
      ceo_name: '',
      industry: '',
      country: 'KR',
      country_risk: 'low',
      industry_risk: 'low',
      risk_level: 'pending',
      total_score: null,
      assessed_by: '',
      assessed_at: null,
      notes: ''
    }
  },

  getRiskColor(level) {
    const found = this.RISK_LEVELS.find(r => r.value === level)
    return found ? found.color : '#9CA3AF'
  },

  getRiskLabel(level) {
    const found = this.RISK_LEVELS.find(r => r.value === level)
    return found ? found.label : level
  },

  getStatusLabel(status) {
    const found = this.STATUS_OPTIONS.find(s => s.value === status)
    return found ? found.label : status
  },

  calculateRisk(items) {
    if (!items.length) return 'pending'
    let totalWeight = 0
    let weightedSum = 0
    items.forEach(item => {
      const q = this._findQuestion(item.question_id)
      const w = q ? q.weight : 1
      totalWeight += w
      weightedSum += (item.score || 0) * w
    })
    if (totalWeight === 0) return 'pending'
    const avg = weightedSum / totalWeight
    if (avg >= 70) return 'low'
    if (avg >= 40) return 'medium'
    return 'high'
  },

  _findQuestion(qid) {
    for (const cat of Object.values(this.ESG_QUESTIONS)) {
      const found = cat.find(q => q.id === qid)
      if (found) return found
    }
    return null
  },

  getScoreLabel(score) {
    if (score == null) return '-'
    if (score >= 80) return '우수'
    if (score >= 60) return '양호'
    if (score >= 40) return '보통'
    return '미흡'
  },

  scoreAnswers(answerMap) {
    const axes = { E: null, S: null, G: null }
    const totals = { E: { earned: 0, max: 0 }, S: { earned: 0, max: 0 }, G: { earned: 0, max: 0 } }
    let answered = 0
    let total = 0
    ;['E', 'S', 'G'].forEach(axis => {
      this.ESG_QUESTIONS[axis].forEach(q => {
        total++
        const ans = answerMap[q.id]
        totals[axis].max += q.weight
        if (ans != null) {
          answered++
          totals[axis].earned += q.weight * (this.ANSWER_VALUES[ans] ?? 0)
        }
      })
    })
    if (answered === 0) return { E: null, S: null, G: null, overall: null, answered: 0, total }
    ;['E', 'S', 'G'].forEach(axis => {
      axes[axis] = totals[axis].max ? Math.round(totals[axis].earned / totals[axis].max * 100) : null
    })
    const earned = totals.E.earned + totals.S.earned + totals.G.earned
    const max = totals.E.max + totals.S.max + totals.G.max
    return { ...axes, overall: max ? Math.round(earned / max * 100) : null, answered, total }
  },

  getSupplierScores(supplierId) {
    const items = Store.getSupplierRiskItems(supplierId)
    if (!items.length || items.every(i => i.answer == null)) return null
    const map = {}
    items.forEach(i => { if (i.answer != null) map[i.question_id] = i.answer })
    return this.scoreAnswers(map)
  },

  getSupplierRiskLevel(supplierId) {
    const s = this.getSupplierScores(supplierId)
    if (!s || s.overall == null) return 'pending'
    if (s.overall >= 80) return 'low'
    if (s.overall >= 50) return 'medium'
    return 'high'
  },

  saveAssessment(supplierId, answers) {
    const existing = Store.getSupplierRiskItems(supplierId)
    ;['E', 'S', 'G'].forEach(axis => {
      this.ESG_QUESTIONS[axis].forEach(q => {
        const payload = { supplier_id: supplierId, axis, question_id: q.id, question: q.question, weight: q.weight, answer: answers[q.id] ?? null, assessed_at: new Date().toISOString() }
        const found = existing.find(i => i.question_id === q.id)
        if (found) Store.updateSupplierRiskItem(found.id, payload)
        else Store.addSupplierRiskItem(payload)
      })
    })
    return this.getSupplierScores(supplierId)
  },

  getAggregateScores() {
    const suppliers = Store.getSuppliers()
    const acc = { E: [], S: [], G: [], overall: [] }
    suppliers.forEach(s => {
      const sc = this.getSupplierScores(s.id)
      if (!sc) return
      ;['E', 'S', 'G', 'overall'].forEach(k => { if (sc[k] != null) acc[k].push(sc[k]) })
    })
    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
    const assessed = acc.overall.length
    return { E: avg(acc.E), S: avg(acc.S), G: avg(acc.G), overall: avg(acc.overall), assessed, total: suppliers.length, unassessed: suppliers.length - assessed }
  },

  getProgress(riskId) {
    const items = Store.getSupplierRiskItems(riskId)
    const actions = Store.getSupplierRiskActions(riskId)
    const totalQuestions = Object.values(this.ESG_QUESTIONS).flat().length
    const answered = items.filter(i => i.answer != null).length
    const actionTotal = actions.length
    const actionDone = actions.filter(a => a.status === 'completed').length
    return {
      surveyPct: totalQuestions ? Math.round((answered / totalQuestions) * 100) : 0,
      answered,
      totalQuestions,
      actionTotal,
      actionDone,
      actionPct: actionTotal ? Math.round((actionDone / actionTotal) * 100) : 0
    }
  }
}
