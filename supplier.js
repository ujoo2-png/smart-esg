const VSME_CHECKLIST = {
  basic: [
    { id: 'vb-1', category: '환경', question: '환경경영 정책이 있는가?' },
    { id: 'vb-2', category: '환경', question: '온실가스 배출량을 측정하는가?' },
    { id: 'vb-3', category: '환경', question: '폐기물 관리 계획이 있는가?' },
    { id: 'vb-4', category: '환경', question: '에너지 사용량을 모니터링하는가?' },
    { id: 'vb-5', category: '사회', question: '근로계약서를 교부하는가?' },
    { id: 'vb-6', category: '사회', question: '산업재해 예방 교육을 실시하는가?' },
    { id: 'vb-7', category: '사회', question: '직원 교육훈련 계획이 있는가?' },
    { id: 'vb-8', category: '사회', question: '인권 정책이 있는가?' },
    { id: 'vb-9', category: '지배구조', question: '윤리경영 규범이 있는가?' },
    { id: 'vb-10', category: '지배구조', question: '내부신고 채널이 있는가?' },
    { id: 'vb-11', category: '지배구조', question: '계약 조건을 준수하는가?' },
    { id: 'vb-12', category: '지배구조', question: '정보보안 정책이 있는가?' }
  ],
  comprehensive: [
    { id: 'vc-1', category: '환경', question: 'Scope 1,2 온실가스 배출량을 산정하는가?' },
    { id: 'vc-2', category: '환경', question: 'Scope 3 배출량을 측정하는가?' },
    { id: 'vc-3', category: '환경', question: '온실가스 감축 목표를 수립했는가?' },
    { id: 'vc-4', category: '환경', question: 'RE100 등 재생에너지 전환 목표가 있는가?' },
    { id: 'vc-5', category: '환경', question: '환경 인증(ISO14001 등)을 보유하는가?' },
    { id: 'vc-6', category: '사회', question: '협력사 ESG 평가를 실시하는가?' },
    { id: 'vc-7', category: '사회', question: '성별·국적별 고용현황을 관리하는가?' },
    { id: 'vc-8', category: '사회', question: '산업재해율을 공시하는가?' },
    { id: 'vc-9', category: '사회', question: '직원 만족도 조사를 실시하는가?' },
    { id: 'vc-10', category: '지배구조', question: 'ESG 관련 이사회 안건이 있는가?' },
    { id: 'vc-11', category: '지배구조', question: '부패방지 교육을 실시하는가?' },
    { id: 'vc-12', category: '지배구조', question: '공정거래 자율준수 프로그램(ACP)이 있는가?' },
    { id: 'vc-13', category: '지배구조', question: 'ISO37001 부패방지 인증을 보유하는가?' },
    { id: 'vc-14', category: '지배구조', question: '이사회 구성에 다양성이 고려되는가?' }
  ]
}

const Supplier = {
  RISK_GRADES: [
    { grade: 'A', label: '우수', min_score: 80, color: '#047857' },
    { grade: 'B', label: '양호', min_score: 60, color: '#1E3A5F' },
    { grade: 'C', label: '보통', min_score: 40, color: '#d97706' },
    { grade: 'D', label: '위험', min_score: 0, color: '#dc2626' }
  ],

  getAll() {
    return Store.getSuppliers()
  },

  add(data) {
    return Store.addSupplier(data)
  },

  update(id, updates) {
    Store.updateSupplier(id, updates)
  },

  delete(id) {
    Store.deleteSupplier(id)
  },

  getGrade(score) {
    for (const g of this.RISK_GRADES) {
      if (score >= g.min_score) return g
    }
    return this.RISK_GRADES[this.RISK_GRADES.length - 1]
  },

  getVSMEChecklist(mode) {
    return VSME_CHECKLIST[mode] || VSME_CHECKLIST.basic
  },

  getVSMEAssessments(supplierId) {
    return Store.getVSMEAssessments().filter(a => a.supplier_id === supplierId)
  },

  getLatestVSME(supplierId) {
    const all = this.getVSMEAssessments(supplierId)
    return all.length ? all[all.length - 1] : null
  },

  calcVSMEScore(answers, mode) {
    const checklist = this.getVSMEChecklist(mode)
    const total = checklist.length
    const yes = answers.filter(a => a === 'yes').length
    return total > 0 ? Math.round((yes / total) * 100) : 0
  },

  submitVSME(supplierId, mode, answers) {
    const score = this.calcVSMEScore(answers, mode)
    const grade = this.getGrade(score)
    const assessment = {
      supplier_id: supplierId,
      mode,
      answers,
      score,
      grade: grade.grade,
      assessed_at: new Date().toISOString()
    }
    const created = Store.addVSMEAssessment(assessment)
    Store.updateSupplier(supplierId, { last_vsme_score: score, last_vsme_grade: grade.grade, last_vsme_date: new Date().toISOString() })
    return created
  },

  getSummary() {
    const suppliers = this.getAll()
    const total = suppliers.length
    const graded = suppliers.filter(s => s.last_vsme_grade)
    const riskCounts = { A: 0, B: 0, C: 0, D: 0, unscored: total - graded.length }
    graded.forEach(s => { if (riskCounts[s.last_vsme_grade] !== undefined) riskCounts[s.last_vsme_grade]++ })
    return { total, graded: graded.length, riskCounts }
  }
}
