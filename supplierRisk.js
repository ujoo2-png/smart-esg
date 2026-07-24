// 협력사 리스크 진단 모듈 (VSME)
// 5축 구조: 기본정보 / 국가·산업 / ESG실사 / 증빙 / 개선조치

const SupplierRisk = {
  RISK_LEVELS: [
    { value: 'high', label: '고위험', color: '#e74c3c' },
    { value: 'medium', label: '중위험', color: '#f39c12' },
    { value: 'low', label: '저위험', color: '#27ae60' },
    { value: 'pending', label: '미진단', color: '#95a5a6' }
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
    return found ? found.color : '#95a5a6'
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

  getProgress(riskId) {
    const items = Store.getSupplierRiskItems(riskId)
    const actions = Store.getSupplierRiskActions(riskId)
    const totalQuestions = Object.values(this.ESG_QUESTIONS).flat().length
    const answered = items.length
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
