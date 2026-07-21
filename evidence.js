// 증빙 관리 모듈
// 업로드 · 태깅(1:N) · 상태 관리 · 민감정보 마스킹

const EVIDENCE_LIMIT = 55

const Evidence = {
  getAll(assessmentId) {
    return Store.getEvidences().filter(e => e.assessment_id === assessmentId)
  },

  getCount(assessmentId) {
    return this.getAll(assessmentId).length
  },

  canAddMore(assessmentId) {
    return this.getCount(assessmentId) < EVIDENCE_LIMIT
  },

  getByIndicator(assessmentId, indicatorId) {
    const tags = Store.getEvidenceTags().filter(t => t.indicator_id === indicatorId)
    const evidenceIds = tags.map(t => t.evidence_id)
    return Store.getEvidences().filter(e =>
      e.assessment_id === assessmentId && evidenceIds.includes(e.id)
    )
  },

  add(data) {
    const ev = {
      id: Date.now(),
      ...data,
      status: data.status || 'self',
      uploaded_at: new Date().toISOString()
    }
    Store.addEvidence(ev)
    return ev
  },

  tag(evidenceId, indicatorId, isPrimary = false) {
    Store.addEvidenceTag({ evidence_id: evidenceId, indicator_id: indicatorId, is_primary: isPrimary })
  },

  untag(evidenceId, indicatorId) {
    Store.removeEvidenceTag(evidenceId, indicatorId)
  },

  getTags(evidenceId) {
    return Store.getEvidenceTags().filter(t => t.evidence_id === evidenceId)
  },

  getStatusLabel(status) {
    const labels = {
      self: '자가입력',
      internal_reviewed: '내부검토완료',
      externally_verified: '외부검증완료'
    }
    return labels[status] || status
  },

  getStatusBadge(status) {
    const colors = {
      self: '#f39c12',
      internal_reviewed: '#3498db',
      externally_verified: '#27ae60'
    }
    const label = this.getStatusLabel(status)
    return `<span style="background:${colors[status] || '#95a5a6'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${label}</span>`
  },

  maskSensitive(evidences, userRole) {
    const SENSITIVE_FIELDS = {
      salary: ['amount', 'account_number'],
      discrimination: ['employee_name', 'case_number'],
      whistleblowing: ['reporter_name', 'target_name'],
      child_labor: ['minor_name', 'guardian_name']
    }

    return evidences.map(ev => {
      const masked = { ...ev }
      if (userRole !== 'admin') {
        const cat = ev.category || (ev.contains_sensitive_data ? 'default' : null)
        if (cat && SENSITIVE_FIELDS[cat]) {
          SENSITIVE_FIELDS[cat].forEach(field => {
            if (masked[field]) masked[field] = '***'
          })
        }
        if (ev.contains_sensitive_data && !cat) {
          if (masked.summary) masked.summary = masked.summary.substring(0, 20) + '***'
          if (masked.title) masked.title = masked.title.substring(0, 10) + '***'
        }
      }
      return masked
    })
  },

  countByStatus(assessmentId) {
    const all = this.getAll(assessmentId)
    return {
      total: all.length,
      self: all.filter(e => e.status === 'self').length,
      internal_reviewed: all.filter(e => e.status === 'internal_reviewed').length,
      externally_verified: all.filter(e => e.status === 'externally_verified').length
    }
  }
}
