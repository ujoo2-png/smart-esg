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
    if (!all.length) return null
    const s = this.getAll().find(x => String(x.id) === String(supplierId))
    const lastDate = s ? String(s.last_vsme_date || '').slice(0, 10) : ''
    if (lastDate) {
      for (let i = all.length - 1; i >= 0; i--) {
        if (String(all[i].assessed_at || all[i].created_at || '').slice(0, 10) === lastDate) return all[i]
      }
    }
    return all[all.length - 1]
  },

  calcVSMEScore(answers, idOrMode) {
    const questionnaire = this.getQuestionnaire(idOrMode)
    const map = this.normalizeAnswers(answers, questionnaire)
    const total = questionnaire.questions.length
    const yes = questionnaire.questions.filter(q => map[q.id] === 'yes').length
    return total > 0 ? Math.round((yes / total) * 100) : 0
  },

  _normalizeAssessedAt(v) {
    if (v == null || v === '') return new Date().toISOString()
    if (v instanceof Date) return isNaN(v.getTime()) ? new Date().toISOString() : v.toISOString()
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000)
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12).toISOString()
    }
    const s = String(v).trim()
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toISOString()
    m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/)
    if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12).toISOString()
    const d = new Date(s)
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  },

  _normalizeAnswer(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase()
    if (!s) return null
    if (['예', 'yes', 'y', 'o', '○', 'true', '1', '실시', '있음', '보유'].includes(s)) return 'yes'
    if (['아니오', '아니요', 'no', 'n', 'x', '×', 'false', '0', '미실시', '없음', '미보유'].includes(s)) return 'no'
    if (['해당없음', '해당 없음', '해당사항없음', 'n/a', 'na', '-', '없당'].includes(s)) return 'na'
    if (['부분', '부분적', '일부', '일부 실시', 'partial'].includes(s)) return 'partial'
    return null
  },

  parseBulkRows(rows) {
    const raw = Array.isArray(rows) ? rows : []
    if (!raw.length) return { format: null, assessments: [], errors: ['데이터가 없습니다.'], supplierNames: [] }
    const objectRows = raw.every(r => r && typeof r === 'object' && !Array.isArray(r))
    let headers, records
    if (objectRows) {
      headers = Object.keys(raw[0] || {}).map(h => String(h).trim())
      records = raw.map(r => {
        const o = {}
        Object.keys(r).forEach(k => { o[String(k).trim()] = r[k] })
        return o
      })
    } else {
      headers = (raw[0] || []).map(h => String(h == null ? '' : h).trim())
      records = raw.slice(1)
        .filter(r => Array.isArray(r) && r.some(v => String(v == null ? '' : v).trim() !== ''))
        .map(r => {
          const o = {}
          headers.forEach((h, i) => { if (h) o[h] = r[i] })
          return o
        })
    }
    const blank = v => v == null || String(v).trim() === ''
    const pick = (o, names) => {
      for (const n of names) {
        const k = Object.keys(o).find(k => k.toLowerCase() === n.toLowerCase())
        if (k && !blank(o[k])) return o[k]
      }
      return ''
    }
    const supplierKeys = ['협력사', '협력사명', '업체', '업체명', '회사명', 'supplier', 'supplier_name']
    const industryKeys = ['업종', '산업', 'industry']
    const qKeys = ['설문지', '설문', '모듈', 'questionnaire', 'questionnaire_name']
    const dateKeys = ['응답일', '응답일자', '입력일', '조사일', '작성일', 'assessed_at', 'date']
    const qidKeys = ['문항id', '문항 id', '문항코드', 'question_id', 'questionid']
    const qtextKeys = ['문항', '질문', 'question']
    const codeKeys = ['응답코드', '코드', 'answer', 'answer_code']
    const labelKeys = ['응답', '답변', '응답값', 'answer_label']
    const hasHeader = names => headers.some(h => names.includes(h.toLowerCase()))
    if (!hasHeader(supplierKeys)) return { format: null, assessments: [], errors: [], supplierNames: [] }

    const questionnaires = this.getQuestionnaires()
    const findQ = v => {
      const s = String(v || '').trim().toLowerCase()
      if (!s) return null
      return questionnaires.find(q => String(q.id).toLowerCase() === s || String(q.name).trim().toLowerCase() === s) || null
    }
    const questionToQ = (qid, qtext) => {
      for (const q of questionnaires) {
        const hit = q.questions.find(x =>
          (!blank(qid) && String(x.id).trim().toLowerCase() === String(qid).trim().toLowerCase()) ||
          (!blank(qtext) && String(x.question).trim() === String(qtext).trim())
        )
        if (hit) return { q, id: hit.id }
      }
      return null
    }

    const assessments = []
    const errors = []
    const longFormat = hasHeader(supplierKeys) && hasHeader(qtextKeys) && (hasHeader(codeKeys) || hasHeader(labelKeys))

    if (longFormat) {
      const groups = new Map()
      records.forEach((r, i) => {
        const rowNo = i + 2
        const supplierName = String(pick(r, supplierKeys)).trim()
        if (!supplierName) { errors.push(`행 ${rowNo}: 협력사명이 없습니다.`); return }
        const qHint = findQ(pick(r, qKeys))
        const qid = pick(r, qidKeys)
        const qtext = pick(r, qtextKeys)
        const match = questionToQ(qid, qtext)
        const q = qHint || match?.q || null
        if (!q) { errors.push(`행 ${rowNo}: 설문지를 찾을 수 없습니다.`); return }
        const answer = this._normalizeAnswer(pick(r, codeKeys)) || this._normalizeAnswer(pick(r, labelKeys))
        if (!answer) return
        const question = q.questions.find(x =>
          (!blank(qid) && String(x.id).trim().toLowerCase() === String(qid).trim().toLowerCase()) ||
          (!blank(qtext) && String(x.question).trim() === String(qtext).trim())
        ) || (match && match.q === q ? q.questions.find(x => x.id === match.id) : null)
        if (!question) { errors.push(`행 ${rowNo}: 문항을 찾을 수 없습니다.`); return }
        const assessedAt = this._normalizeAssessedAt(pick(r, dateKeys))
        const key = `${supplierName.toLowerCase()}|${q.id}|${assessedAt.slice(0, 10)}`
        if (!groups.has(key)) {
          groups.set(key, {
            supplierName,
            industry: String(pick(r, industryKeys) || '').trim(),
            questionnaireId: q.id,
            assessedAt,
            answers: {}
          })
        }
        const g = groups.get(key)
        g.answers[question.id] = answer
        if (!g.industry) g.industry = String(pick(r, industryKeys) || '').trim()
      })
      groups.forEach(g => assessments.push(g))
    } else {
      const bindings = new Map()
      questionnaires.forEach(q => {
        q.questions.forEach(x => {
          const keys = [String(x.id).toLowerCase(), String(x.question).trim().toLowerCase()]
          keys.forEach(k => { if (k && !bindings.has(k)) bindings.set(k, { qid: q.id, questionId: x.id }) })
        })
      })
      records.forEach((r, i) => {
        const rowNo = i + 2
        const supplierName = String(pick(r, supplierKeys)).trim()
        if (!supplierName) { errors.push(`행 ${rowNo}: 협력사명이 없습니다.`); return }
        const qHint = findQ(pick(r, qKeys))
        const bound = []
        headers.forEach(h => {
          const b = bindings.get(h.toLowerCase())
          if (b) bound.push({ header: h, ...b })
        })
        let q = qHint
        if (!q) {
          const tally = {}
          bound.forEach(b => { tally[b.qid] = (tally[b.qid] || 0) + 1 })
          const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
          q = best ? questionnaires.find(x => x.id === best[0]) : null
        }
        q = q || this.getQuestionnaire('basic')
        const answers = {}
        bound.filter(b => b.qid === q.id).forEach(b => {
          const a = this._normalizeAnswer(r[b.header])
          if (a) answers[b.questionId] = a
        })
        if (!Object.keys(answers).length) { errors.push(`행 ${rowNo}: 응답을 찾을 수 없습니다.`); return }
        assessments.push({
          supplierName,
          industry: String(pick(r, industryKeys) || '').trim(),
          questionnaireId: q.id,
          assessedAt: this._normalizeAssessedAt(pick(r, dateKeys)),
          answers
        })
      })
    }

    const supplierNames = [...new Set(assessments.map(a => a.supplierName))]
    return { format: longFormat ? 'long' : 'wide', assessments, errors: errors.slice(0, 30), supplierNames }
  },

  applyBulkImport(parsed, opts = {}) {
    const createSuppliers = opts.createSuppliers !== false
    const overwrite = opts.overwrite !== false
    const items = parsed?.assessments || []
    const suppliers = this.getAll()
    let created = 0, updated = 0, skipped = 0, createdSuppliers = 0
    items.forEach(item => {
      const questionnaire = this.getQuestionnaire(item.questionnaireId)
      const score = this.calcVSMEScore(item.answers, questionnaire.id)
      const grade = this.getGrade(score)
      const assessedAt = item.assessedAt || new Date().toISOString()
      const dateStr = assessedAt.slice(0, 10)
      let s = suppliers.find(x => String(x.name || '').trim().toLowerCase() === String(item.supplierName || '').trim().toLowerCase())
      if (!s) {
        if (!createSuppliers) { skipped++; return }
        s = this.add({ name: item.supplierName, industry: item.industry || '' })
        suppliers.push(s)
        createdSuppliers++
      }
      const existing = (Store.getVSMEAssessments() || []).find(a =>
        String(a.supplier_id) === String(s.id) &&
        String(a.questionnaire_id) === String(questionnaire.id) &&
        String(a.assessed_at || a.created_at || '').slice(0, 10) === dateStr
      )
      if (existing && !overwrite) { skipped++; return }
      const payload = {
        questionnaire_id: questionnaire.id,
        questionnaire_name: questionnaire.name,
        mode: VSME_CHECKLIST[questionnaire.id] ? questionnaire.id : undefined,
        questions: questionnaire.questions.map(q => ({ id: q.id, category: q.category, question: q.question })),
        answers: item.answers,
        score,
        grade: grade.grade,
        assessed_at: assessedAt
      }
      if (existing) {
        Store.updateVSMEAssessment(existing.id, payload)
        updated++
      } else {
        Store.addVSMEAssessment({ supplier_id: s.id, ...payload })
        created++
      }
      const cur = String(s.last_vsme_date || '').slice(0, 10)
      if (!cur || dateStr >= cur) {
        Store.updateSupplier(s.id, { last_vsme_score: score, last_vsme_grade: grade.grade, last_vsme_date: assessedAt })
        s.last_vsme_score = score
        s.last_vsme_grade = grade.grade
        s.last_vsme_date = assessedAt
      }
    })
    return { created, updated, skipped, createdSuppliers, total: items.length }
  },

  submitVSME(supplierId, idOrMode, answers, assessedAtInput) {
    const questionnaire = this.getQuestionnaire(idOrMode)
    const map = this.normalizeAnswers(answers, questionnaire)
    const score = this.calcVSMEScore(map, questionnaire.id)
    const grade = this.getGrade(score)
    const assessedAt = this._normalizeAssessedAt(assessedAtInput)
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
