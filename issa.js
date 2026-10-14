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

const DEFAULT_ISSA = {
  stage: 'planned',
  assurance_level: 'limited',
  auditor_name: '',
  auditor_firm: '',
  auditor_license: '',
  materiality_threshold: 10,
  scope_start: '',
  scope_end: '',
  period: '',
  findings: [],
  conclusion_statement: '',
  disclaimer: '',
  sign_date: '',
  next_review_date: ''
}

const ISSA = {
  getAssurance(companyId) {
    const d = Store.data
    if (!d.issa_assurance) d.issa_assurance = { ...DEFAULT_ISSA, company_id: companyId }
    return d.issa_assurance
  },

  saveAssurance(assurance) {
    const d = Store.data
    d.issa_assurance = { ...DEFAULT_ISSA, ...assurance, company_id: assurance.company_id || d.companies?.[0]?.id || 'default' }
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
    const levelInfo = this.getAssuranceLevel(assurance.assurance_level)
    const year = assurance.period || new Date().getFullYear().toString()
    const scopeText = assurance.scope_start && assurance.scope_end
      ? `${assurance.scope_start}부터 ${assurance.scope_end}까지`
      : `${year}년`
    const openFindings = assurance.findings?.filter(f => f.status === 'open') || []

    return {
      statement: `${companyName}의 ${year}년 지속가능경영보고서에 대하여, 우리는 ${levelInfo.label} 서비스를 수행하였습니다.

감사 범위: ${companyName}의 ${scopeText} 기간의 지속가능경영 관련 데이터, 지표, 절차에 한정됩니다.

감사 기준: ISSA 5000(국제 지속가능성 보증 표준) 및 관련 한국감사기준원 지속가능경영 보증기준을 적용하였습니다.

감사 의견: ${levelInfo.description}을 근거로, 본 보고서에 포함된 정보가 중대한 왜곡이나 오류 없이 공정하게 작성되었음을 확인합니다.

${openFindings.length > 0 ? `미해결 사항: ${openFindings.length}건 (상세는 첨부 보고서 참조)` : '미해결 사항: 없음'}

보증 유효 기간: ${assurance.sign_date || new Date().toISOString().split('T')[0]}부터 다음 감사일까지 유효합니다.`,
      level: assurance.assurance_level,
      open_findings: openFindings.length,
      sign_date: assurance.sign_date
    }
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
