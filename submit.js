const SUBMISSION_AGENCIES = [
  { code: 'ecovadis', name: 'EcoVadis', country: '프랑스', url: 'https://www.ecovadis.com', format: 'ecovadis_csv', status: 'available', description: '글로벌 공급망 ESG 평가' },
  { code: 'cdp', name: 'CDP', country: '영국', url: 'https://www.cdp.net', format: 'cdp_xlsx', status: 'available', description: '환경정보 공개 플랫폼' },
  { code: 'gri', name: 'GRI', country: '네덜란드', url: 'https://www.globalreporting.org', format: 'gri_xml', status: 'available', description: '지속가능경영 보고서 기준' },
  { code: 'tcfd', name: 'TCFD', country: '글로벌', url: 'https://www.fsb-tcfd.org', format: 'tcfd_json', status: 'available', description: '기후관련 재무정보 공시' },
  { code: 'sbti', name: 'SBTi', country: '글로벌', url: 'https://www.sciencebasedtargets.org', format: 'sbti_excel', status: 'available', description: '과학기반 감축목표' },
  { code: 'unsdg', name: 'UN SDGs', country: '글로벌', url: 'https://sdgs.un.org', format: 'sdg_json', status: 'available', description: '유엔 지속가능개발목표' },
  { code: 'kcgf', name: 'KCGF', country: '한국', url: 'https://www.kcgf.or.kr', format: 'kcgf_pdf', status: 'pending', description: '한국기업지배구조원 ESG평가' },
  { code: 'kess', name: 'KESS', country: '한국', url: 'https://www.kess.or.kr', format: 'kess_pdf', status: 'pending', description: '한국ESG기준원' },
  { code: 'ungc', name: 'UN Global Compact - CoP', country: '글로벌', url: 'https://www.unglobalcompact.org', format: 'ungc_web', status: 'available', description: 'CEO성명 + CoP설문, 제출기간 4/1~7/31' },
  { code: 'spglobal', name: 'S&P Global CSA (DJSI)', country: '글로벌', url: 'https://www.spglobal.com', format: 'sp_web', status: 'available', description: '업종별 최대 62개 설문, 0~100점' },
  { code: 'msci', name: 'MSCI ESG Ratings', country: '글로벌', url: 'https://www.msci.com', format: 'public_data', status: 'not_available', description: '공개자료 기반 — 증빙 제출 불필요' },
  { code: 'sustainalytics', name: 'Sustainalytics', country: '글로벌', url: 'https://www.sustainalytics.com', format: 'public_data', status: 'not_available', description: '공개자료 기반 — 증빙 제출 불필요' },
  { code: 'eu_vsme', name: 'EU VSME', country: 'EU', url: 'https://efrag.org', format: 'vsme_xlsx', status: 'available', description: '중소기업 자율공시기준' },
  { code: 'ca_sb253', name: 'California SB253', country: '미국', url: 'https://ww2.arb.ca.gov', format: 'regulatory', status: 'pending', description: 'Scope1/2 공시, 2026-11-10 첫 마감' },
  { code: 'ca_sb261', name: 'California SB261', country: '미국', url: 'https://ww2.arb.ca.gov', format: 'regulatory', status: 'pending', description: '기후재무리스크 보고' }
]

const SUBMISSION_STATUS = [
  { key: 'not_started', label: '미시작', color: '#95a5a6' },
  { key: 'preparing', label: '준비중', color: '#f39c12' },
  { key: 'ready', label: '제출가능', color: '#3498db' },
  { key: 'submitted', label: '제출완료', color: '#27ae60' },
  { key: 'rejected', label: '반려', color: '#e74c3c' }
]

const SUBMISSION = {
  getAgencies() {
    return SUBMISSION_AGENCIES
  },

  getStatuses() {
    return SUBMISSION_STATUS
  },

  getSubmissions(companyId) {
    const d = Store.data
    return (d.submissions || []).filter(s => s.company_id === companyId)
  },

  addSubmission(companyId, agencyCode, year) {
    const agency = SUBMISSION_AGENCIES.find(a => a.code === agencyCode)
    if (!agency) return null
    const d = Store.data
    if (!d.submissions) d.submissions = []
    const submission = {
      id: 'SUB-' + Date.now(),
      company_id: companyId,
      agency_code: agencyCode,
      agency_name: agency.name,
      format: agency.format,
      year,
      status: 'not_started',
      checklist: this.getChecklistForAgency(agencyCode),
      created_at: new Date().toISOString()
    }
    d.submissions.push(submission)
    Store._save()
    return submission
  },

  updateStatus(submissionId, status) {
    const d = Store.data
    const submission = d.submissions?.find(s => s.id === submissionId)
    if (submission) {
      submission.status = status
      if (status === 'submitted') submission.submitted_at = new Date().toISOString()
      Store._save()
    }
    return submission
  },

  getChecklistForAgency(agencyCode) {
    const checklists = {
      ecovadis: [
        { id: 'ec1', item: '회사 개요 및 조직도', required: true, done: false },
        { id: 'ec2', item: 'ESG 정책 문서', required: true, done: false },
        { id: 'ec3', item: '환경 데이터 (GHG, 에너지, 용수, 폐기물)', required: true, done: false },
        { id: 'ec4', item: '사회 데이터 (인력, 안전, 교육)', required: true, done: false },
        { id: 'ec5', item: '지배구조 데이터 (윤리, 컴플라이언스)', required: true, done: false },
        { id: 'ec6', item: '증빙 문서 (인증서, 감사보고서)', required: false, done: false },
        { id: 'ec7', item: 'VAE(Vendor Assessment Evidence) 파일', required: true, done: false }
      ],
      cdp: [
        { id: 'cdp1', item: '기후변화 거버넌스', required: true, done: false },
        { id: 'cdp2', item: '리스크 및 기회 식별', required: true, done: false },
        { id: 'cdp3', item: '배출량 계산 (Scope 1/2/3)', required: true, done: false },
        { id: 'cdp4', item: '감축 목표 및 이행', required: true, done: false },
        { id: 'cdp5', item: '탄소가격 도입 현황', required: false, done: false },
        { id: 'cdp6', item: '목표 Setting Tool 결과', required: true, done: false }
      ],
      gri: [
        { id: 'gri1', item: 'GRI 내용색인(Contents Index)', required: true, done: false },
        { id: 'gri2', item: '이해관계자 정보', required: true, done: false },
        { id: 'gri3', item: '보고서 경계', required: true, done: false },
        { id: 'gri4', item: '보고 접근법', required: true, done: false },
        { id: 'gri5', item: '보편적 공시 항목', required: true, done: false },
        { id: 'gri6', item: '주제별 공시 항목', required: true, done: false }
      ],
      tcfd: [
        { id: 'tcfd1', item: '지배구조 공시', required: true, done: false },
        { id: 'tcfd2', item: '전략 공시', required: true, done: false },
        { id: 'tcfd3', item: '리스크 관리 공시', required: true, done: false },
        { id: 'tcfd4', item: '지표 및 목표 공시', required: true, done: false },
        { id: 'tcfd5', item: '시나리오 분석 결과', required: false, done: false }
      ],
      sbti: [
        { id: 'sbti1', item: 'Scope 1/2 배출량 (3년)', required: true, done: false },
        { id: 'sbti2', item: 'Scope 3 배출량 (3년)', required: true, done: false },
        { id: 'sbti3', item: '감축 목표 선언', required: true, done: false },
        { id: 'sbti4', item: 'SBTi 검증 완료 여부', required: false, done: false }
      ],
      unsdg: [
        { id: 'sdg1', item: 'SDGs 연계 전략', required: true, done: false },
        { id: 'sdg2', item: 'SDGs 기여 활동', required: true, done: false },
        { id: 'sdg3', item: '핵심 성과 지표(KPI)', required: true, done: false },
        { id: 'sdg4', item: '외부 파트너십', required: false, done: false }
      ]
    }
    return checklists[agencyCode] || [
      { id: 'def1', item: '보고서 초안', required: true, done: false },
      { id: 'def2', item: '증빙 문서', required: true, done: false },
      { id: 'def3', item: '데이터 검증 완료', required: true, done: false }
    ]
  },

  toggleChecklistItem(submissionId, itemId) {
    const d = Store.data
    const submission = d.submissions?.find(s => s.id === submissionId)
    if (!submission) return null
    const item = submission.checklist?.find(c => c.id === itemId)
    if (item) {
      item.done = !item.done
      const allRequired = submission.checklist.filter(c => c.required)
      const doneRequired = allRequired.filter(c => c.done)
      submission.ready_to_submit = doneRequired.length === allRequired.length
      if (submission.ready_to_submit && submission.status === 'preparing') {
        submission.status = 'ready'
      }
      Store._save()
    }
    return submission
  },

  calcReadiness(submission) {
    if (!submission.checklist || !submission.checklist.length) return 0
    const total = submission.checklist.length
    const done = submission.checklist.filter(c => c.done).length
    return Math.round((done / total) * 100)
  },

  generateCSV(submission) {
    const agency = SUBMISSION_AGENCIES.find(a => a.code === submission.agency_code)
    if (!agency) return ''
    if (agency.format === 'ecovadis_csv') {
      const headers = ['Indicator Code', 'Indicator Name', 'Pillar', 'Score', 'Evidence Reference', 'Comment']
      const items = Store.getAssessmentItems().filter(i => {
        const assessment = Store.getAssessments().find(a => a.id === i.assessment_id)
        return assessment && assessment.assessment_year == submission.year
      })
      const rows = items.map(item => {
        const indicator = Store.getIndicators().find(ind => ind.id === item.indicator_id)
        const evidences = Store.getEvidences().filter(e => e.indicator_id === item.indicator_id)
        return [
          indicator?.indicator_code || '',
          indicator?.indicator_name || '',
          indicator?.pillar || '',
          item.score || 0,
          evidences.map(e => e.id).join('; '),
          item.comment || ''
        ]
      })
      return [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    }
    return 'Format not yet implemented'
  },

  generateReport(companyId) {
    const submissions = this.getSubmissions(companyId)
    let html = '<div style="font-size:12px;line-height:1.6">'
    if (!submissions.length) {
      html += '<p style="color:#666;text-align:center;padding:20px">등록된 제출이 없습니다. 평가기관을 추가해주세요.</p>'
    } else {
      html += '<table style="width:100%;border-collapse:collapse"><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd">기관</th><th style="width:60px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">연도</th><th style="width:80px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">상태</th><th style="width:80px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">준비율</th><th style="width:80px;text-align:center;padding:6px 8px;border-bottom:2px solid #ddd">기한</th></tr>'
      submissions.forEach(s => {
        const statusInfo = SUBMISSION_STATUS.find(st => st.key === s.status)
        const readiness = this.calcReadiness(s)
        html += `<tr>
          <td style="padding:6px 8px;border-bottom:1px solid #f0f0f0"><strong>${s.agency_name}</strong></td>
          <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0">${s.year}</td>
          <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0"><span style="color:${statusInfo?.color};font-weight:600;font-size:11px">${statusInfo?.label || s.status}</span></td>
          <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0"><div style="background:#ecf0f1;border-radius:10px;height:8px;position:relative"><div style="background:${readiness >= 100 ? '#27ae60' : readiness >= 50 ? '#f39c12' : '#e74c3c'};border-radius:10px;height:100%;width:${readiness}%"></div></div><span style="font-size:10px;color:#666">${readiness}%</span></td>
          <td style="text-align:center;padding:6px 8px;border-bottom:1px solid #f0f0f0">${s.deadline || '-'}</td></tr>`
      })
      html += '</table>'
    }
    html += '</div>'
    return html
  }
}
