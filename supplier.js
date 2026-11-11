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

const VSME_QUESTIONNAIRE_META = {
  basic: { name: 'VSME 기본 모듈', description: '중소기업 공통 12문항 (환경·사회·지배구조)' },
  comprehensive: { name: 'VSME 종합 모듈', description: '대형 고객사 대응 14문항 (Scope 3·인권·반부패 포함)' }
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

  deleteDemo() {
    return Store.deleteDemoSuppliers()
  },

  getGrade(score) {
    for (const g of this.RISK_GRADES) {
      if (score >= g.min_score) return g
    }
    return this.RISK_GRADES[this.RISK_GRADES.length - 1]
  },

  getBuiltinQuestionnaires() {
    return Object.keys(VSME_CHECKLIST).map(id => ({
      id,
      name: VSME_QUESTIONNAIRE_META[id]?.name || id,
      description: VSME_QUESTIONNAIRE_META[id]?.description || '',
      builtin: true,
      questions: VSME_CHECKLIST[id].map(q => ({ ...q }))
    }))
  },

  getQuestionnaires() {
    const builtins = this.getBuiltinQuestionnaires()
    const ids = new Set(builtins.map(q => q.id))
    const custom = (typeof Store !== 'undefined' && Store.getQuestionnaires) ? Store.getQuestionnaires() : []
    const normalized = custom
      .filter(q => !ids.has(q.id))
      .map(q => ({
        id: q.id,
        name: q.name || '이름 없는 설문',
        description: q.description || '',
        builtin: false,
        questions: (q.questions || []).map((x, i) => ({
          id: x.id || `${q.id}-${i + 1}`,
          category: x.category || '기타',
          question: x.question || ''
        }))
      }))
    return [...builtins, ...normalized]
  },

  getQuestionnaire(idOrMode) {
    const list = this.getQuestionnaires()
    return list.find(q => q.id === idOrMode) || list[0]
  },

  getVSMEChecklist(idOrMode) {
    return this.getQuestionnaire(idOrMode).questions
  },

  getAssessmentQuestionnaire(a) {
    if (!a) return this.getQuestionnaire('basic')
    if (Array.isArray(a.questions) && a.questions.length) {
      return { id: a.questionnaire_id || a.mode || 'custom', name: a.questionnaire_name || '사용자 설문', builtin: false, questions: a.questions }
    }
    return this.getQuestionnaire(a.questionnaire_id || a.mode)
  },

  normalizeAnswers(answers, questionnaire) {
    const map = {}
    if (Array.isArray(answers)) {
      questionnaire.questions.forEach((q, i) => { if (answers[i] != null) map[q.id] = answers[i] })
    } else if (answers && typeof answers === 'object') {
      Object.entries(answers).forEach(([k, v]) => { if (v != null) map[k] = v })
    }
    return map
  },

  countYes(assessment) {
    if (!assessment) return 0
    const answers = assessment.answers
    if (Array.isArray(answers)) return answers.filter(a => a === 'yes').length
    return Object.values(answers || {}).filter(a => a === 'yes').length
  },

  assessmentProgress(assessment) {
    const q = this.getAssessmentQuestionnaire(assessment)
    return q.questions.length ? Math.round(this.countYes(assessment) / q.questions.length * 100) : 0
  },

  getVSMEAssessments(supplierId) {
    const all = Store.getVSMEAssessments() || []
    if (supplierId == null) return all
    return all.filter(a => String(a.supplier_id) === String(supplierId))
  },

  getLatestVSME(supplierId) {
    const all = this.getVSMEAssessments(supplierId)
    return all.length ? all[all.length - 1] : null
  },

  calcVSMEScore(answers, idOrMode) {
    const questionnaire = this.getQuestionnaire(idOrMode)
    const map = this.normalizeAnswers(answers, questionnaire)
    const total = questionnaire.questions.length
    const yes = questionnaire.questions.filter(q => map[q.id] === 'yes').length
    return total > 0 ? Math.round((yes / total) * 100) : 0
  },

  submitVSME(supplierId, idOrMode, answers) {
    const questionnaire = this.getQuestionnaire(idOrMode)
    const map = this.normalizeAnswers(answers, questionnaire)
    const score = this.calcVSMEScore(map, questionnaire.id)
    const grade = this.getGrade(score)
    const assessedAt = new Date().toISOString()
    const payload = {
      questionnaire_id: questionnaire.id,
      questionnaire_name: questionnaire.name,
      mode: VSME_CHECKLIST[questionnaire.id] ? questionnaire.id : undefined,
      questions: questionnaire.questions.map(q => ({ id: q.id, category: q.category, question: q.question })),
      answers: map,
      score,
      grade: grade.grade,
      assessed_at: assessedAt
    }
    if (Store.recordVSMEAssessment) return Store.recordVSMEAssessment(supplierId, payload)
    const created = Store.addVSMEAssessment({ supplier_id: supplierId, ...payload })
    Store.updateSupplier(supplierId, { last_vsme_score: score, last_vsme_grade: grade.grade, last_vsme_date: assessedAt })
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
