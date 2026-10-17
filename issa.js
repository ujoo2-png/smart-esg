const ISSA_STAGES = [
  { key: 'planned', label: '감사 계획', icon: '📋' },
  { key: 'fieldwork', label: '현장 실사', icon: '🔍' },
  { key: 'conclusion', label: '감사 결론', icon: '📄' },
  { key: 'assured', label: '보증 완료', icon: '✅' }
]

const ASSURANCE_LEVELS = [
  { key: 'limited', label: '제한적 보증', description: '합리적 확신 미달, 부정적 의견 없음', threshold: 70 },
  { key: 'reasonable', label: '합리적 보증', description: '충분한 근거에 기반한 높은 수준 확신', threshold: 90 }
]

const ASSURANCE_FRAMEWORKS = [
  { key: 'ISSA5000', label: 'ISSA 5000', desc: '국제 지속가능성 보증 표준 (제한적/합리적 보증)' },
  { key: 'AA1000AS', label: 'AA1000AS v3', desc: 'AccountAbility 원칙 기반 보증 (Type 1/2)' }
]

const AA1000_PRINCIPLES = [
  { key: 'inclusivity', label: '포용성 (Inclusivity)', desc: '이해관계자 참여와 의견 수렴의 적절성' },
  { key: 'materiality', label: '중대성 (Materiality)', desc: '중대 이슈 식별·우선순위 결정의 적절성' },
  { key: 'responsiveness', label: '대응성 (Responsiveness)', desc: '중대 이슈에 대한 조직의 대응과 성과' },
  { key: 'impact', label: '영향 (Impact)', desc: '조직의 영향에 대한 이해·측정·관리' }
]

const AA1000_TYPES = [
  { key: 'Type1', label: 'Type 1', desc: 'AA1000 원칙 준수에 대한 보증' },
  { key: 'Type2', label: 'Type 2', desc: '원칙 준수 + 지속가능성 성과 정보의 신뢰성 보증' }
]

const AA1000_LEVELS = [
  { key: 'moderate', label: 'Moderate', desc: '중간 수준 보증' },
  { key: 'high', label: 'High', desc: '높은 수준 보증' }
]

const SUITABLE_CRITERIA = ['GRI Standards', 'ISSB (IFRS S1/S2)', 'ESRS', 'KSSB', 'K-ESG', 'ISO 14064', 'TCFD/TNFD', '내부 회계·ESG 관리기준']

const DEFAULT_AA_PRINCIPLES = {
  inclusivity: { score: 3, note: '' },
  materiality: { score: 3, note: '' },
  responsiveness: { score: 3, note: '' },
  impact: { score: 3, note: '' }
}

const DEFAULT_ISSA = {
  framework: 'ISSA5000',
  stage: 'planned',
  assurance_level: 'limited',
  aa_type: 'Type2',
  aa_level: 'moderate',
  criteria: ['GRI Standards'],
  principles: JSON.parse(JSON.stringify(DEFAULT_AA_PRINCIPLES)),
  auditor_name: '',
  auditor_firm: '',
  auditor_license: '',
  materiality_threshold: 10,
  scope_start: '',
  scope_end: '',
  period: '',
  findings: [],
  conclusion_statement: '',
  management_report: '',
  limitations: '',
  subsequent_events: '',
  disclaimer: '',
  sign_date: '',
  next_review_date: ''
}

const ISSA = {
  getAssurance(companyId) {
    const d = Store.data
    if (!d.issa_assurance) d.issa_assurance = { ...DEFAULT_ISSA, principles: JSON.parse(JSON.stringify(DEFAULT_AA_PRINCIPLES)), company_id: companyId }
    if (!d.issa_assurance.principles) d.issa_assurance.principles = JSON.parse(JSON.stringify(DEFAULT_AA_PRINCIPLES))
    if (!d.issa_assurance.criteria) d.issa_assurance.criteria = ['GRI Standards']
    return d.issa_assurance
  },

  saveAssurance(assurance) {
    const d = Store.data
    const merged = { ...DEFAULT_ISSA, ...assurance, company_id: assurance.company_id || d.companies?.[0]?.id || 'default' }
    if (!merged.principles) merged.principles = JSON.parse(JSON.stringify(DEFAULT_AA_PRINCIPLES))
    if (!merged.criteria) merged.criteria = ['GRI Standards']
    d.issa_assurance = merged
    Store._save()
  },

  setStage(companyId, stage) {
    const assurance = this.getAssurance(companyId)
    assurance.stage = stage
    this.saveAssurance(assurance)
    return assurance
  },

  getStageInfo(stage) {
    return ISSA_STAGES.find(s => s.key === stage)
  },

  getAssuranceLevel(level) {
    return ASSURANCE_LEVELS.find(l => l.key === level)
  },

  getFramework(key) { return ASSURANCE_FRAMEWORKS.find(f => f.key === key) || ASSURANCE_FRAMEWORKS[0] },
  getAAType(key) { return AA1000_TYPES.find(t => t.key === key) || AA1000_TYPES[1] },
  getAALevel(key) { return AA1000_LEVELS.find(l => l.key === key) || AA1000_LEVELS[0] },
  getPrinciples(assurance) {
    assurance.principles = assurance.principles || {}
    AA1000_PRINCIPLES.forEach(p => {
      if (!assurance.principles[p.key]) assurance.principles[p.key] = { score: 3, note: '' }
    })
    return assurance.principles
  },
  getAAPercent(assurance) {
    const pr = this.getPrinciples(assurance)
    const avg = AA1000_PRINCIPLES.reduce((s, p) => s + (pr[p.key]?.score || 0), 0) / AA1000_PRINCIPLES.length
    return Math.round(avg / 5 * 100)
  },
  toggleCriterion(companyId, criterion) {
    const assurance = this.getAssurance(companyId)
    if (!assurance.criteria) assurance.criteria = []
    const i = assurance.criteria.indexOf(criterion)
    if (i > -1) assurance.criteria.splice(i, 1)
    else assurance.criteria.push(criterion)
    this.saveAssurance(assurance)
    return assurance.criteria
  },

  getCompletionPercent(assurance) {
    let score = 0
    if (assurance.stage !== 'planned') score += 15
    if (assurance.stage !== 'planned' && assurance.stage !== 'fieldwork') score += 15
    else if (assurance.stage === 'fieldwork') score += 10
    if (assurance.auditor_name && assurance.auditor_firm) score += 10
    if (assurance.scope_start && assurance.scope_end) score += 10
    if (assurance.findings && assurance.findings.length > 0) score += 15
    if (assurance.conclusion_statement) score += 15
    if (assurance.stage === 'conclusion' || assurance.stage === 'assured') score += 10
    if (assurance.sign_date) score += 5
    if (assurance.stage === 'assured') score += 5
    return Math.min(100, score)
  },

  addFinding(companyId, finding) {
    const assurance = this.getAssurance(companyId)
    if (!assurance.findings) assurance.findings = []
    assurance.findings.push({
      id: 'FIND-' + Date.now(),
      category: finding.category || 'other',
      severity: finding.severity || 'low',
      description: finding.description || '',
      recommendation: finding.recommendation || '',
      status: 'open',
      created_at: new Date().toISOString()
    })
    this.saveAssurance(assurance)
    return assurance.findings
  },

  resolveFinding(companyId, findingId) {
    const assurance = this.getAssurance(companyId)
    const finding = assurance.findings?.find(f => f.id === findingId)
    if (finding) {
      finding.status = 'resolved'
      finding.resolved_at = new Date().toISOString()
    }
    this.saveAssurance(assurance)
    return assurance.findings
  },

  generateStatement(assurance, companyName) {
    const year = assurance.period || new Date().getFullYear().toString()
    const scopeText = assurance.scope_start && assurance.scope_end
      ? `${assurance.scope_start}부터 ${assurance.scope_end}까지`
      : `${year}년`
    const openFindings = assurance.findings?.filter(f => f.status === 'open') || []
    const criteriaText = (assurance.criteria && assurance.criteria.length) ? assurance.criteria.join(', ') : 'GRI Standards'

    if (assurance.framework === 'AA1000AS') {
      const aaType = this.getAAType(assurance.aa_type)
      const aaLvl = this.getAALevel(assurance.aa_level)
      const pr = this.getPrinciples(assurance)
      const prinLines = AA1000_PRINCIPLES.map(p => `· ${p.label}: ${pr[p.key].score}/5${pr[p.key].note ? ' — ' + pr[p.key].note : ''}`).join('\n')
      const stmt = `${companyName}의 ${year}년 지속가능경영보고서에 대하여, 우리는 AA1000AS v3(AccountAbility Assurance Standard)에 따른 ${aaType.label} 보증을 ${aaLvl.label} 수준으로 수행하였습니다.

감사 범위: ${companyName}의 ${scopeText} 기간의 지속가능성 관련 정보, 데이터 및 관리 절차에 한정됩니다.

감사 기준: AA1000 AccountAbility Principles (2018) 및 AA1000AS v3. 적용한 적합성 기준(Suitable Criteria): ${criteriaText}.

원칙 준수 평가:
${prinLines}

감사 의견: 상기 4대 원칙(포용성·중대성·대응성·영향)에 대한 우리의 평가 결과, 본 보고서의 지속가능성 정보가 중대한 왜곡 없이 ${aaType.key === 'Type2' ? '작성되었으며 관련 데이터의 신뢰성이 확보되어 있음' : '공정하게 작성되었음을 확인합니다.'}

${openFindings.length > 0 ? `미해결 사항: ${openFindings.length}건 (상세는 첨부 보고서 참조)` : '미해결 사항: 없음'}

보증 유효 기간: ${assurance.sign_date || new Date().toISOString().split('T')[0]}부터 다음 감사일까지 유효합니다.`
      return { statement: stmt, level: assurance.aa_level, type: assurance.aa_type, framework: 'AA1000AS', open_findings: openFindings.length, sign_date: assurance.sign_date }
    }

    const levelInfo = this.getAssuranceLevel(assurance.assurance_level)
    const stmt = `${companyName}의 ${year}년 지속가능경영보고서에 대하여, 우리는 ${levelInfo.label} 서비스를 수행하였습니다.

감사 범위: ${companyName}의 ${scopeText} 기간의 지속가능경영 관련 데이터, 지표, 절차에 한정됩니다.

감사 기준: ISSA 5000(국제 지속가능성 보증 표준) 및 관련 한국감사기준원 지속가능경영 보증기준을 적용하였습니다. 적용한 적합성 기준(Suitable Criteria): ${criteriaText}.

감사 의견: ${levelInfo.description}을 근거로, 본 보고서에 포함된 정보가 중대한 왜곡이나 오류 없이 공정하게 작성되었음을 확인합니다.

${openFindings.length > 0 ? `미해결 사항: ${openFindings.length}건 (상세는 첨부 보고서 참조)` : '미해결 사항: 없음'}

보증 유효 기간: ${assurance.sign_date || new Date().toISOString().split('T')[0]}부터 다음 감사일까지 유효합니다.`
    return { statement: stmt, level: assurance.assurance_level, framework: 'ISSA5000', open_findings: openFindings.length, sign_date: assurance.sign_date }
  },

  generateManagementReport(assurance, companyName) {
    const today = new Date().toISOString().split('T')[0]
    const limitations = assurance.limitations || '(기재 없음)'
    const subsequent = assurance.subsequent_events || '(기재 없음)'
    const custom = assurance.management_report || ''
    return `${companyName} 경영진 보고서 (Management Report)

작성일: ${today}

1. 경영진의 책임
경영진은 지속가능경영보고서 및 관련 지속가능성 정보의 작성과 공정한 표시에 대한 책임이 있으며, 보고 기준에 따라 중대한 왜곡이 없는 정보를 제공할 책임이 있습니다. 또한 지속가능성 정보의 생성을 위한 내부통제의 설계·운영·유지에 대한 책임이 있습니다.

2. 적용한 기준
본 보고서는 지속가능성보고기준(GRI Standards 등) 및 적용 가능한 공시기준에 따라 작성되었습니다.

3. 보증과의 관계
본 보고서는 독립적 제3자 보증(ISSA 5000 또는 AA1000AS v3)의 대상입니다. 경영진은 보증인에게 필요한 모든 정보와 접근을 제공하였습니다.

4. 내재적 한계
지속가능성 정보는 추정과 판단에 기반하며, 일부 비재무데이터는 측정·추정상의 내재적 한계를 가집니다.
- 한계 및 범위 제한: ${limitations}

5. 보고기간 후 사건
- 후속 사건(subsequent events): ${subsequent}

6. 추가 진술
${custom || '(추가 진술 없음)'}

서명: ____________________  (대표이사)`
  },

  generatePackage(companyId) {
    const assurance = this.getAssurance(companyId)
    const companyName = Store.data.companies?.[0]?.name || '회사명'
    const fw = this.getFramework(assurance.framework)
    const statement = this.generateStatement(assurance, companyName)
    const mgmt = this.generateManagementReport(assurance, companyName)
    const openF = (assurance.findings || []).filter(f => f.status === 'open')
    const rows = (assurance.findings || []).map(f => `<tr><td>${f.id}</td><td>${f.category}</td><td>${f.severity}</td><td>${f.description}</td><td>${f.status}</td></tr>`).join('')
    return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>보증 패키지 - ${companyName}</title>
<style>body{font-family:'Malgun Gothic',sans-serif;max-width:900px;margin:32px auto;line-height:1.7;color:#111827}h1{font-size:20px}h2{font-size:15px;border-bottom:2px solid #1E3A5F;padding-bottom:6px;margin-top:28px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #e4e7eb;padding:6px 8px;text-align:left}th{background:#F8FAFC}pre{white-space:pre-wrap;font-family:inherit;background:#F8FAFC;border:1px solid #e4e7eb;border-radius:8px;padding:14px}</style></head><body>
<h1>🛡️ 지속가능성 보증 패키지 — ${companyName}</h1>
<p style="color:#6b7280;font-size:12px">생성일: ${new Date().toISOString().split('T')[0]} · 프레임워크: ${fw.label} · 단계: ${assurance.stage}</p>
<h2>1. 보증 개요</h2>
<table><tr><th>프레임워크</th><td>${fw.label}</td></tr>
<tr><th>감사인</th><td>${assurance.auditor_name || '-'}</td></tr>
<tr><th>감사기관</th><td>${assurance.auditor_firm || '-'}</td></tr>
<tr><th>보증 수준</th><td>${assurance.framework === 'AA1000AS' ? this.getAALevel(assurance.aa_level).label + ' / ' + this.getAAType(assurance.aa_type).label : (this.getAssuranceLevel(assurance.assurance_level)?.label || '-')}</td></tr>
<tr><th>적용 기준</th><td>${(assurance.criteria || []).join(', ') || '-'}</td></tr>
<tr><th>감사 범위</th><td>${assurance.scope_start || '-'} ~ ${assurance.scope_end || '-'}</td></tr>
<tr><th>중대성 기준</th><td>${assurance.materiality_threshold || 10}%</td></tr>
<tr><th>미해결 지적</th><td>${openF.length}건</td></tr></table>
<h2>2. 보증 의견서</h2><pre>${statement.statement}</pre>
<h2>3. 경영진 보고서</h2><pre>${mgmt}</pre>
<h2>4. 지적사항</h2><table><tr><th>ID</th><th>유형</th><th>심각도</th><th>설명</th><th>상태</th></tr>${rows || '<tr><td colspan="5">없음</td></tr>'}</table>
<h2>5. 승인</h2><table><tr><th>서명일</th><td>${assurance.sign_date || '-'}</td></tr><tr><th>차기 검토일</th><td>${assurance.next_review_date || '-'}</td></tr></table>
</body></html>`
  },


  generateReport(companyId) {
    const assurance = this.getAssurance(companyId)
    const companyName = Store.data.companies?.[0]?.name || '회사명'
    const statement = this.generateStatement(assurance, companyName)
    const levelInfo = this.getAssuranceLevel(assurance.assurance_level)
    const stageInfo = this.getStageInfo(assurance.stage)
    const completion = this.getCompletionPercent(assurance)
    const openFindings = assurance.findings?.filter(f => f.status === 'open') || []
    const resolvedFindings = assurance.findings?.filter(f => f.status === 'resolved') || []

    let html = '<div style="font-size:12px;line-height:1.6">'
    html += `<div style="display:flex;justify-content:space-between;margin-bottom:16px;padding:12px;background:#F8FAFC;border-radius:6px">`
    html += `<div><strong>감사 단계:</strong> ${stageInfo?.icon || ''} ${stageInfo?.label || assurance.stage}</div>`
    html += `<div><strong>보증 수준:</strong> ${levelInfo?.label || assurance.assurance_level}</div>`
    html += `<div><strong>완료율:</strong> ${completion}%</div></div>`
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:12px"><tbody>'
    html += `<tr><td style="padding:4px 8px;width:120px;color:#6b7280">감사인</td><td style="padding:4px 8px">${assurance.auditor_name || '-'}</td></tr>`
    html += `<tr><td style="padding:4px 8px;color:#6b7280">감사기관</td><td style="padding:4px 8px">${assurance.auditor_firm || '-'}</td></tr>`
    html += `<tr><td style="padding:4px 8px;color:#6b7280">면허번호</td><td style="padding:4px 8px">${assurance.auditor_license || '-'}</td></tr>`
    html += `<tr><td style="padding:4px 8px;color:#6b7280">감사 범위</td><td style="padding:4px 8px">${assurance.scope_start || '-'} ~ ${assurance.scope_end || '-'}</td></tr>`
    html += `<tr><td style="padding:4px 8px;color:#6b7280">중대성 기준</td><td style="padding:4px 8px">${assurance.materiality_threshold}%</td></tr>`
    html += `<tr><td style="padding:4px 8px;color:#6b7280">미해결 지적사항</td><td style="padding:4px 8px">${openFindings.length}건</td></tr>`
    html += `<tr><td style="padding:4px 8px;color:#6b7280">해결 완료</td><td style="padding:4px 8px">${resolvedFindings.length}건</td></tr>`
    html += '</tbody></table>'
    html += '<div style="border:1px solid #e4e7eb;padding:12px;border-radius:6px;margin-bottom:12px"><h4 style="margin:0 0 8px 0;font-size:13px">보증 의견</h4>'
    html += `<p style="margin:0;white-space:pre-wrap">${statement.statement}</p></div>`
    if (assurance.findings && assurance.findings.length) {
      html += '<h4 style="margin:0 0 8px 0;font-size:13px">지적사항 상세</h4>'
      html += '<table style="width:100%;border-collapse:collapse;font-size:11px"><tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #e4e7eb">ID</th><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #e4e7eb">유형</th><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #e4e7eb">심각도</th><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #e4e7eb">설명</th><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #e4e7eb">상태</th></tr>'
      assurance.findings.forEach(f => {
        const sevColors = { high: '#dc2626', medium: '#d97706', low: '#2563EB' }
        const sevLabels = { high: '높음', medium: '보통', low: '낮음' }
        const stColors = { open: '#dc2626', resolved: '#047857' }
        const stLabels = { open: '미해결', resolved: '해결완료' }
        html += `<tr><td style="padding:4px 8px;border-bottom:1px solid #EEF1F4">${f.id}</td><td style="padding:4px 8px;border-bottom:1px solid #EEF1F4">${f.category}</td><td style="padding:4px 8px;border-bottom:1px solid #EEF1F4"><span style="color:${sevColors[f.severity]};font-weight:600">${sevLabels[f.severity] || f.severity}</span></td><td style="padding:4px 8px;border-bottom:1px solid #EEF1F4">${f.description}</td><td style="padding:4px 8px;border-bottom:1px solid #EEF1F4"><span style="color:${stColors[f.status]};font-weight:600">${stLabels[f.status] || f.status}</span></td></tr>`
      })
      html += '</table>'
    }
    html += '</div>'
    return html
  }
}
