const MASKING_RULES = [
  { field: 'salary', mode: 'FULL', applies_to_ai: true },
  { field: 'account_number', mode: 'FULL', applies_to_ai: true },
  { field: 'employee_name', mode: 'PARTIAL', applies_to_ai: true },
  { field: 'reporter_name', mode: 'PARTIAL', applies_to_ai: true },
  { field: 'target_name', mode: 'PARTIAL', applies_to_ai: true },
  { field: 'minor_name', mode: 'FULL', applies_to_ai: true },
  { field: 'guardian_name', mode: 'FULL', applies_to_ai: true },
  { field: 'case_number', mode: 'FULL', applies_to_ai: true }
]

const AI = {
  _safeParseJson(text) {
    let cleaned = text.trim()
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) cleaned = fenceMatch[1].trim()
    const braceStart = cleaned.indexOf('{')
    const braceEnd = cleaned.lastIndexOf('}')
    if (braceStart >= 0 && braceEnd > braceStart) cleaned = cleaned.substring(braceStart, braceEnd + 1)
    try { return JSON.parse(cleaned) }
    catch { return null }
  },

  _maskText(text, userRole) {
    if (userRole === 'admin') return text
    let masked = text
    MASKING_RULES.forEach(rule => {
      if (!rule.applies_to_ai) return
      const regex = new RegExp(rule.field + '[^\\s]*\\s*[:=]\\s*["\']?([^"\'\\n,]+)', 'gi')
      if (rule.mode === 'FULL') {
        masked = masked.replace(regex, m => m.replace(/[:=]\s*["\']?[^"\'\\n,]+/, ': [마스킹됨]'))
      } else if (rule.mode === 'PARTIAL') {
        masked = masked.replace(regex, (m, val) => {
          const chars = [...val]
          if (chars.length <= 2) return m.replace(val, val[0] + '**')
          return m.replace(val, chars[0] + chars[1] + '**'.repeat(chars.length - 2))
        })
      }
    })
    return masked
  },

  _maskEvidenceList(evidences, userRole) {
    return evidences.map(ev => {
      const masked = { ...ev }
      if (userRole !== 'admin') {
        const sensitiveFields = {
          salary: ['amount', 'account_number'],
          discrimination: ['employee_name', 'case_number'],
          whistleblowing: ['reporter_name', 'target_name'],
          child_labor: ['minor_name', 'guardian_name']
        }
        if (ev.category && sensitiveFields[ev.category]) {
          sensitiveFields[ev.category].forEach(f => { if (masked[f]) masked[f] = '[마스킹됨]' })
        }
        if (masked.title) masked.title = this._maskText(masked.title, userRole)
        if (masked.summary) masked.summary = this._maskText(masked.summary, userRole)
      }
      return masked
    })
  },

  _buildDraftSystemPrompt() {
    return `당신은 제조업 ESG 지속가능경영보고서 작성을 보조하는 문서 초안 작성기입니다.

규칙(반드시 준수):
1. 오직 <evidence> 태그 안에 주어진 내용에 근거해서만 서술문을 작성하십시오.
   <evidence>에 없는 사실, 수치, 날짜, 고유명사는 절대 만들어내지 마십시오.
2. 근거가 부족해 문장을 완성할 수 없는 부분은 "[증빙 확인 필요: 000]" 형식으로
   빈 자리를 남기고, 임의의 수치나 추정치로 채우지 마십시오.
3. 각 문장은 Policy(정책) - Action(조치) - Result(성과) 구조를 따르도록 작성하십시오.
   해당 항목에 셋 중 근거가 없는 축이 있으면 그 축은 생략하고, 어떤 축이 비어있는지
   output의 missing_pillars에 명시하십시오.
4. 절대 하지 말 것: 법적 판단, 등급/점수 확정 판정, 타사 비교 주장.
5. 출력은 반드시 지정된 JSON 스키마로만 반환하고, 그 외 설명이나 전제문을 붙이지 마십시오.
6. GHG 등 정량 계산 수치는 <evidence>에 인용된 것만 인용하되, AI가 재계산하지 마십시오.
7. 온실가스 배출량 등은 반드시 <evidence>의 수치를 그대로 인용하고, 결괏값은 [수치 확인 필요]로 표기하십시오.`

  },

  _buildDraftUserPrompt(indicator, prevYearText, evidenceExcerpts, pillarType) {
    const pillarInstructions = {
      POLICY: '\n이 항목은 정책의 존재·공개범위·최신성이 핵심입니다. 정책의 적용대상(전사/특정 사업장)과 개정일을 명시하십시오.',
      ACTION: '\n이 항목은 실행 증거가 핵심입니다. 구체적 조치, 담당부서, 실행 빈도/횟수를 증빙에 있는 만큼만 기술하십시오.',
      RESULT: '\n이 항목은 정량 성과가 핵심입니다. 증빙에 없는 수치는 절대 만들지 말고, 목표 대비 실적 형태로만 서술하십시오.'
    }
    const additional = pillarInstructions[pillarType] || ''

    return `<indicator>
기관: ${indicator.authority_name || indicator.authority_code} (${indicator.authority_code})
지표코드: ${indicator.indicator_code}
지표명: ${indicator.indicator_name}
필러유형: ${pillarType || 'POLICY'}
${indicator.indicator_question ? '세부 질문: ' + indicator.indicator_question : ''}
</indicator>

<previous_year_text>
${prevYearText || '해당없음'}
</previous_year_text>

<evidence>
${evidenceExcerpts}
</evidence>

위 정보를 바탕으로 이 지표에 대한 보고서 서술 초안을 작성하십시오.${additional}

출력은 반드시 다음 JSON 스키마를 따르십시오:
{
  "draft_text": "서술문",
  "pillar_coverage": { "policy": true/false, "action": true/false, "result": true/false },
  "missing_pillars": ["policy", ...],
  "cited_evidence_ids": ["EV-2026-0031", ...],
  "unsupported_claims_flagged": ["증빙에 없는 수치: ...", ...],
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`
  },

  _buildVerifySystemPrompt() {
    return `당신은 ESG 보고서 초안의 사실관계를 증빙 문서와 대조하여 검증하는 팩트체커입니다.
초안을 작성한 것은 당신이 아니라고 가정하고, 회의적인 제3자의 입장에서 검토하십시오.

규칙:
1. 초안의 모든 문장을 개별 주장(claim) 단위로 분해하십시오.
2. 각 주장에 대해 <evidence>의 어느 부분이 그 주장을 뒷받침하는지 확인하고,
   근거가 없으면 반드시 "UNSUPPORTED"로 표시하십시오. 애매하면
   "PARTIALLY_SUPPORTED"로 표시하고 이유를 남기십시오.
3. 수치(금액, 배출량, 인원수, 비율, 날짜 등)는 특히 엄격하게 확인하십시오.
   증빙에 명시된 값과 초안의 값이 정확히 일치하지 않으면 무조건
   "UNSUPPORTED" 또는 "MISMATCH"로 표시하십시오.
4. 판정 근거를 지어내지 말고, 근거가 불충분하면 불충분하다고만 말하십시오.
5. 출력은 지정된 JSON 스키마로만 반환하십시오.`
  },

  _buildVerifyUserPrompt(draftText, evidenceExcerpts) {
    return `<draft_text>
${draftText}
</draft_text>

<evidence>
${evidenceExcerpts}
</evidence>

위 초안의 모든 주장을 증빙과 대조하여 검증하십시오.

출력은 반드시 다음 JSON 스키마를 따르십시오:
{
  "claims": [
    {
      "claim_text": "주장 내용",
      "status": "SUPPORTED" | "PARTIALLY_SUPPORTED" | "UNSUPPORTED" | "MISMATCH",
      "matched_evidence_id": "EV-2026-0031" 또는 null,
      "reason": "판정 이유"
    }
  ],
  "overall_verdict": "PASS" | "NEEDS_REVISION" | "FAIL",
  "revision_notes": "수정이 필요한 부분 요약"
}`
  },

  _formatEvidenceForPrompt(evidences) {
    if (!evidences.length) return '(증빙 없음)'
    return evidences.map(e => {
      const parts = [`[증빙ID: ${e.id || e.title}] (문서유형: ${e.file_type || '미상'}, 상태: ${e.status || '미상'})`]
      if (e.summary) parts.push(`본문 발췌: ${e.summary}`)
      else if (e.title) parts.push(`제목: ${e.title}`)
      return parts.join('\n')
    }).join('\n\n')
  },

  _getPrevYearText(assessmentId, indicatorId) {
    const assessments = Store.getAssessments()
    const current = assessments.find(a => a.id === assessmentId)
    if (!current) return null
    const prevYear = (current.assessment_year || 2026) - 1
    const prev = assessments.find(a => a.authority_code === current.authority_code && a.assessment_year === prevYear)
    if (!prev) return null
    const drafts = Store.getAIDrafts().filter(d => d.assessment_id === prev.id && d.indicator_id === indicatorId && d.human_status === 'approved')
    return drafts.length ? drafts[drafts.length - 1].draft_text : null
  },

  async generateReport(assessmentId, indicatorId, userRole = 'user') {
    const indicator = Store.getIndicators().find(i => i.id === indicatorId)
    if (!indicator) return { error: '지표를 찾을 수 없습니다.' }

    const rawEvidences = Evidence.getByIndicator(assessmentId, indicatorId)
    const evidences = this._maskEvidenceList(rawEvidences, userRole)

    const prevYearText = this._getPrevYearText(assessmentId, indicatorId)
    const evidenceExcerpts = this._formatEvidenceForPrompt(evidences)

    const pillarMap = { POLICY: 'POLICY', ACTION: 'ACTION', RESULT: 'RESULT', GOVERNANCE: 'GOVERNANCE', STRATEGY: 'STRATEGY', RISK_MGMT: 'RISK_MGMT', METRICS: 'METRICS', Policies: 'POLICY', Actions: 'ACTION', Results: 'RESULT' }
    const pillarType = pillarMap[indicator.pillar] || indicator.pillar || 'POLICY'

    const systemPrompt = this._buildDraftSystemPrompt()
    const userPrompt = this._buildDraftUserPrompt(indicator, prevYearText, evidenceExcerpts, pillarType)

    try {
      const raw = await this._callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])
      const parsed = this._safeParseJson(raw)

      const draftText = parsed?.draft_text || raw
      const draft = {
        id: Date.now(),
        assessment_id: assessmentId,
        indicator_id: indicatorId,
        draft_text: draftText,
        pillar_coverage: parsed?.pillar_coverage || null,
        missing_pillars: parsed?.missing_pillars || [],
        cited_evidence_ids: parsed?.cited_evidence_ids || evidences.map(e => e.id).filter(Boolean),
        unsupported_claims_flagged: parsed?.unsupported_claims_flagged || [],
        confidence: parsed?.confidence || 'LOW',
        evidence_ids: evidences.map(e => e.id).filter(Boolean),
        ver_status: 'pending',
        ver_result: null,
        human_status: 'pending',
        version: 1,
        created_at: new Date().toISOString()
      }
      Store.addAIDraft(draft)

      const verResult = await this.verifyReport(draft.id)
      return { draft, verification: verResult }
    } catch (err) {
      return { error: err.message }
    }
  },

  async verifyReport(draftId) {
    const draft = Store.getAIDrafts().find(d => d.id === draftId)
    if (!draft) return { error: '초안을 찾을 수 없습니다.' }

    const evidences = Store.getEvidences().filter(e => draft.evidence_ids.includes(e.id))
    const evidenceExcerpts = this._formatEvidenceForPrompt(evidences)

    const systemPrompt = this._buildVerifySystemPrompt()
    const userPrompt = this._buildVerifyUserPrompt(draft.draft_text, evidenceExcerpts)

    try {
      const raw = await this._callAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ])
      const parsed = this._safeParseJson(raw)

      const verdict = parsed?.overall_verdict || 'FAIL'
      const claims = parsed?.claims || []

      const unsupportedCount = claims.filter(c => c.status === 'UNSUPPORTED' || c.status === 'MISMATCH').length

      const verLog = {
        id: Date.now(),
        draft_id: draftId,
        verifier: 'opencode_ai',
        result: verdict,
        claims: claims,
        overall_verdict: verdict,
        revision_notes: parsed?.revision_notes || '',
        unsupported_count: unsupportedCount,
        created_at: new Date().toISOString()
      }
      Store.addAIVerificationLog(verLog)

      let newVerStatus = 'pending'
      if (verdict === 'PASS' && unsupportedCount === 0) newVerStatus = 'pass'
      else if (verdict === 'NEEDS_REVISION') newVerStatus = 'revision_needed'
      else newVerStatus = 'fail'

      Store.updateAIDraft(draftId, {
        ver_status: newVerStatus,
        ver_result: verLog,
        ver_date: new Date().toISOString()
      })

      return verLog
    } catch (err) {
      return { error: err.message }
    }
  },

  async _callAI(messages) {
    try {
      const response = await fetch('/api/opencode/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'big-pickle',
          messages,
          temperature: 0.3,
          max_tokens: 2000
        })
      })
      if (!response.ok) throw new Error(`AI 호출 실패: ${response.status}`)
      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    } catch (err) {
      console.warn('AI API 호출 실패, 더미 데이터 반환:', err.message)
      const indicatorHint = messages.find(m => m.role === 'user')?.content?.match(/지표코드: (.+)/)?.[1] || ''
      return JSON.stringify({
        draft_text: `[AI 오프라인 모드] 증빙 데이터를 기반으로 보고서 초안을 생성해야 합니다.\n\n지표: ${indicatorHint}\n\nAPI 연결 후 실제 초기가 생성됩니다.`,
        pillar_coverage: { policy: false, action: false, result: false },
        missing_pillars: ['policy', 'action', 'result'],
        cited_evidence_ids: [],
        unsupported_claims_flagged: [],
        confidence: 'LOW'
      })
    }
  },

  getDraftStatus(draft) {
    const verMap = { pending: '대기', pass: '통과', fail: '실패', revision_needed: '수정필요' }
    const humanMap = { pending: '검토대기', approved: '승인', rejected: '반려', revision_requested: '수정요청' }
    return `AI:${verMap[draft.ver_status] || draft.ver_status} / 사람:${humanMap[draft.human_status] || draft.human_status}`
  },

  getDraftsByAssessment(assessmentId) {
    return Store.getAIDrafts().filter(d => d.assessment_id === assessmentId)
  },

  getDraftsByIndicator(assessmentId, indicatorId) {
    return this.getDraftsByAssessment(assessmentId).filter(d => d.indicator_id === indicatorId)
  }
}
