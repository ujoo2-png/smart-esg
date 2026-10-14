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
      pending: '미확인',
      self: '자가입력',
      internal_reviewed: '내부검토완료',
      externally_verified: '외부검증완료',
      confirmed: '확정'
    }
    return labels[status] || status
  },

  getStatusBadge(status) {
    const colors = {
      pending: '#d97706',
      self: '#2563EB',
      internal_reviewed: '#2563EB',
      externally_verified: '#059669',
      confirmed: '#059669',
      expired: '#dc2626',
      missing: '#9ca3af'
    }
    const label = this.getStatusLabel(status)
    return `<span style="background:${colors[status] || '#9ca3af'};color:#fff;padding:2px 8px;border-radius:10px;font-size:11px">${label}</span>`
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
      pending: all.filter(e => e.status === 'pending').length,
      self: all.filter(e => e.status === 'self').length,
      internal_reviewed: all.filter(e => e.status === 'internal_reviewed').length,
      externally_verified: all.filter(e => e.status === 'externally_verified').length,
      confirmed: all.filter(e => e.status === 'confirmed').length
    }
  },

  async checkDuplicateHash(fileHash) {
    if (!fileHash) return null
    const existing = Store.getExtractionsByHash(fileHash)
    return existing.length > 0 ? existing[0] : null
  },

  async computeFileHash(file) {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const buffer = reader.result
        let hash = 0
        const bytes = new Uint8Array(buffer)
        for (let i = 0; i < bytes.length; i++) {
          hash = ((hash << 5) - hash) + bytes[i]
          hash = hash & hash
        }
        resolve(Math.abs(hash).toString(16).padStart(8, '0'))
      }
      reader.onerror = () => resolve(null)
      reader.readAsArrayBuffer(file)
    })
  },

  cloneLastYearEvidences(sourceAssId, targetAssId) {
    const source = this.getAll(sourceAssId)
    const existing = this.getAll(targetAssId)
    const existingTitles = existing.map(e => e.title)
    let cloned = 0
    source.forEach(ev => {
      if (existingTitles.includes(ev.title)) return
      const newEv = {
        id: Date.now() + Math.random(),
        assessment_id: targetAssId,
        title: ev.title,
        file_type: ev.file_type,
        status: 'pending',
        contains_sensitive_data: ev.contains_sensitive_data,
        uploaded_at: new Date().toISOString()
      }
      Store.addEvidence(newEv)
      const tags = this.getTags(ev.id)
      tags.forEach(t => this.tag(newEv.id, t.indicator_id))
      cloned++
    })
    return cloned
  }
}
