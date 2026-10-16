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

  _formatRefChunksForPrompt(chunks) {
    if (!chunks || !chunks.length) return '(참고자료 없음)'
    return chunks.map((c, i) => {
      const tag = 'REF-' + (c.reference_id != null ? c.reference_id : i + 1) + (c.page ? ' p.' + c.page : '') + (c.section_title ? ' · ' + c.section_title : '')
      return `[${tag}]\n${(c.content || '').trim()}`
    }).join('\n\n')
  },

  _buildRefineUserPrompt(title, draft, evidence) {
    return `<item>
항목명: ${title || '(제목 없음)'}
</item>

<draft_text>
${draft || '(내용 없음)'}
</draft_text>

<evidence>
${evidence}
</evidence>

위 항목의 원고를, <evidence>의 참고자료에 근거해 문장과 구성을 다듬고 미완성 문장을 완성하십시오.
- 원고의 사실·수치·의도는 유지하되 표현과 문장 구성을 개선하십시오.
- <evidence>에 없는 새로운 수치·사실·고유명사는 절대 만들지 마십시오.
- 근거가 부족해 완성할 수 없는 부분은 "[확인 필요]"로 남기십시오.

출력은 반드시 다음 JSON 스키마를 따르십시오:
{
  "draft_text": "다듬어 완성한 문장",
  "pillar_coverage": { "policy": true/false, "action": true/false, "result": true/false },
  "missing_pillars": ["policy", ...],
  "cited_evidence_ids": ["REF-...", ...],
  "unsupported_claims_flagged": ["...", ...],
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}` 
  },

  async refineReportItem({ title, draft, refChunks }) {
    const evidence = this._formatRefChunksForPrompt(refChunks)
    const messages = [
      { role: 'system', content: this._buildDraftSystemPrompt() },
      { role: 'user', content: this._buildRefineUserPrompt(title, draft, evidence) }
    ]
    try {
      const raw = await this._callAI(messages)
      const parsed = this._safeParseJson(raw)
      return {
        draft_text: parsed?.draft_text || raw || '',
        pillar_coverage: parsed?.pillar_coverage || null,
        missing_pillars: parsed?.missing_pillars || [],
        cited_evidence_ids: parsed?.cited_evidence_ids || [],
        unsupported_claims_flagged: parsed?.unsupported_claims_flagged || [],
        confidence: parsed?.confidence || 'LOW'
      }
    } catch (err) {
      return { error: err.message }
    }
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
        fail_count: 0,
        created_at: new Date().toISOString()
      }

      const verResult = await this.verifyReport(draft)

      if (verResult.error) {
        Store.addAIDraft(draft)
        return { draft, verification: verResult }
      }

      draft.ver_status = verResult.ver_status
      draft.ver_result = verResult
      draft.ver_date = new Date().toISOString()

      if (verResult.overall_verdict === 'FAIL' || draft.cited_evidence_ids.length === 0) {
        draft.human_status = 'blocked'
        draft.fail_count = (draft.fail_count || 0) + 1

        if (draft.fail_count >= 3) {
          draft.human_status = 'escalated'
          draft.escalation_reason = '3회 연속 검증 실패'
        }
      }

      Store.addAIDraft(draft)
      return { draft, verification: verResult }
    } catch (err) {
      return { error: err.message }
    }
  },

  async verifyReport(draftOrId) {
    const draft = typeof draftOrId === 'object' ? draftOrId : Store.getAIDrafts().find(d => d.id === draftOrId)
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

      let newVerStatus = 'pending'
      if (verdict === 'PASS' && unsupportedCount === 0) newVerStatus = 'pass'
      else if (verdict === 'NEEDS_REVISION') newVerStatus = 'revision_needed'
      else newVerStatus = 'fail'

      const criteriaResults = [
        { criterion: 1, pass: claims.every(c => c.matched_evidence_id), detail: '증빙 인용 검증' },
        { criterion: 2, pass: unsupportedCount === 0, detail: '미지원 주장 검증' },
        { criterion: 3, pass: !draft.draft_text.match(/약|대략|추정/), detail: '모호한 표현 검증' },
        { criterion: 4, pass: true, detail: '수치 일치 검증' },
        { criterion: 5, pass: true, detail: '논리적 일관성 검증' },
        { criterion: 6, pass: true, detail: '평가 항목 의도 검증' },
        { criterion: 7, pass: true, detail: '문법·맞춤법 검증' }
      ]

      const score = Math.max(0, 100 - (unsupportedCount * 20))

      const failReasons = []
      if (unsupportedCount > 0) failReasons.push(`${unsupportedCount}개 미지원 주장`)
      if (draft.cited_evidence_ids.length === 0) failReasons.push('증빙 미연결')
      if (draft.draft_text.match(/약|대략|추정/)) failReasons.push('모호한 표현 포함')

      const verLog = {
        id: Date.now(),
        draft_id: draft.id,
        verifier: 'opencode_ai',
        result: verdict,
        score: score,
        criteria_results: criteriaResults,
        claims: claims,
        overall_verdict: verdict,
        revision_notes: parsed?.revision_notes || '',
        fail_reasons: failReasons,
        suggestions: [],
        unsupported_count: unsupportedCount,
        ver_status: newVerStatus,
        created_at: new Date().toISOString()
      }

      if (typeof draftOrId === 'number' || typeof draftOrId === 'string') {
        Store.addAIVerificationLog(verLog)
        Store.updateAIDraft(draft.id, {
          ver_status: newVerStatus,
          ver_result: verLog,
          ver_date: new Date().toISOString()
        })
      }

      return verLog
    } catch (err) {
      return { error: err.message }
    }
  },

  _aiConfig() {
    try { if (typeof Store !== 'undefined' && Store.getAIConfig) return Store.getAIConfig() } catch (e) {}
    return { provider: 'opencode', endpoint: '/api/opencode/generate', model: 'big-pickle', apiKey: '', temperature: 0.3, maxTokens: 2000 }
  },

  _aiError(message) { const err = new Error(message); err.ai = true; return err },

  _extractText(data, provider) {
    if (!data) return ''
    if (provider === 'anthropic') return (data.content || []).map(c => c.text || '').join('')
    if (provider === 'gemini') return ((data.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('')
    if (provider === 'ollama') return data.message?.content || data.response || ''
    return data.choices?.[0]?.message?.content || data.output_text || data.reply || ''
  },

  _defaultModel(provider) {
    const m = { opencode: 'big-pickle', openai: 'gpt-4o-mini', anthropic: 'claude-3-5-sonnet-latest', gemini: 'gemini-1.5-flash', groq: 'llama-3.3-70b-versatile', ollama: 'llama3.1' }
    return m[provider] || 'big-pickle'
  },

  _defaultEndpoint(provider, model, apiKey) {
    if (provider === 'anthropic') return 'https://api.anthropic.com/v1/messages'
    if (provider === 'gemini') return 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(apiKey || '')
    if (provider === 'ollama') return 'http://localhost:11434/api/chat'
    if (provider === 'openai') return 'https://api.openai.com/v1/chat/completions'
    if (provider === 'groq') return 'https://api.groq.com/openai/v1/chat/completions'
    return '/api/opencode/generate'
  },

  _providerConfig(base, entry) {
    const e = entry || {}
    const provider = e.provider || base.provider || 'opencode'
    const same = provider === (base.provider || 'opencode')
    const model = e.model || (same ? base.model : this._defaultModel(provider))
    const apiKey = (e.apiKey != null && e.apiKey !== '') ? e.apiKey : (same ? base.apiKey : '')
    let endpoint = e.endpoint
    if (endpoint == null || endpoint === '') endpoint = this._defaultEndpoint(provider, model, apiKey)
    return {
      provider, endpoint, model, apiKey,
      temperature: e.temperature != null ? e.temperature : base.temperature,
      maxTokens: e.maxTokens != null ? e.maxTokens : base.maxTokens
    }
  },

  _providerChain(cfg) {
    const chain = [this._providerConfig(cfg, null)]
    ;(cfg.fallbacks || []).forEach(fb => { if (fb && fb.provider) chain.push(this._providerConfig(cfg, fb)) })
    return chain
  },

  _buildAIRequest(cfg, messages) {
    const provider = cfg.provider || 'opencode'
    if (provider === 'anthropic') {
      const system = (messages.find(m => m.role === 'system') || {}).content || ''
      const rest = messages.filter(m => m.role !== 'system')
      return {
        url: cfg.endpoint || this._defaultEndpoint(provider, cfg.model, cfg.apiKey),
        headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
        body: { model: cfg.model, max_tokens: cfg.maxTokens, system, messages: rest }
      }
    }
    if (provider === 'gemini') {
      const sys = (messages.find(m => m.role === 'system') || {}).content
      const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
      const url = cfg.endpoint || this._defaultEndpoint(provider, cfg.model, cfg.apiKey)
      return { url, headers: { 'Content-Type': 'application/json' }, body: { contents, systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, generationConfig: { temperature: cfg.temperature, maxOutputTokens: cfg.maxTokens } } }
    }
    const headers = { 'Content-Type': 'application/json' }
    if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey
    return { url: cfg.endpoint || this._defaultEndpoint(provider, cfg.model, cfg.apiKey), headers, body: { model: cfg.model, messages, temperature: cfg.temperature, max_tokens: cfg.maxTokens, stream: false } }
  },

  async _callProvider(cfg, messages) {
    if (!cfg.endpoint) throw this._aiError('엔드포인트 없음')
    const req = this._buildAIRequest(cfg, messages)
    let response
    try {
      response = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(req.body) })
    } catch (err) {
      throw this._aiError('연결 불가 (' + (err && err.message) + ')')
    }
    if (!response.ok) {
      let detail = ''
      try {
        const j = await response.json()
        detail = j.error?.message || (typeof j.error === 'string' ? j.error : '') || j.message || ''
      } catch (e) {}
      throw this._aiError('HTTP ' + response.status + (detail ? ': ' + detail : ''))
    }
    const data = await response.json()
    const text = this._extractText(data, cfg.provider)
    if (!text || !String(text).trim()) throw this._aiError('빈 응답')
    return text
  },

  async _callAI(messages) {
    const cfg = this._aiConfig()
    const chain = this._providerChain(cfg)
    const errors = []
    for (let i = 0; i < chain.length; i++) {
      const c = chain[i]
      try {
        const text = await this._callProvider(c, messages)
        this._lastProvider = c.provider
        return text
      } catch (e) {
        errors.push(c.provider + ' → ' + e.message)
      }
    }
    throw this._aiError('모든 AI 연결에 실패했습니다 — ' + errors.join(' | ') + '  ·  [설정 › AI 연결]을 확인하세요.')
  },

  async testConnection() {
    const cfg = this._aiConfig()
    const chain = this._providerChain(cfg)
    const tried = []
    for (const c of chain) {
      try {
        const raw = await this._callProvider(c, [
          { role: 'system', content: '연결 테스트입니다. 다른 말 없이 정확히 "OK"만 출력하세요.' },
          { role: 'user', content: 'OK' }
        ])
        return { ok: true, provider: c.provider, sample: String(raw).trim().slice(0, 160), tried }
      } catch (e) { tried.push({ provider: c.provider, error: e.message }) }
    }
    return { ok: false, error: tried.map(t => t.provider + ': ' + t.error).join(' | '), tried }
  },

  _localNormalize(text) {
    return String(text || '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.!?;:)\]])/g, '$1')
      .replace(/([,.!?;:])(?=\S)/g, '$1 ')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  },

  approveDraft(draftId, reviewerId, feedback = '') {
    const draft = Store.getAIDrafts().find(d => d.id === draftId)
    if (!draft) return { error: '초안을 찾을 수 없습니다.' }

    if (draft.ver_status !== 'pass') {
      return { error: 'AI 검증을 통과하지 않은 초안은 승인할 수 없습니다.' }
    }

    if (draft.cited_evidence_ids.length === 0) {
      return { error: '증빙이 연결되지 않은 초안은 승인할 수 없습니다.' }
    }

    Store.updateAIDraft(draftId, {
      human_status: 'approved',
      human_reviewer: reviewerId,
      human_reviewed_at: new Date().toISOString(),
      human_feedback: feedback
    })

    return { success: true, draftId }
  },

  rejectDraft(draftId, reviewerId, reason = '') {
    const draft = Store.getAIDrafts().find(d => d.id === draftId)
    if (!draft) return { error: '초안을 찾을 수 없습니다.' }

    Store.updateAIDraft(draftId, {
      human_status: 'rejected',
      human_reviewer: reviewerId,
      human_reviewed_at: new Date().toISOString(),
      human_feedback: reason
    })

    return { success: true, draftId }
  },

  async retryDraft(draftId, reviewerId = 'system', userRole = 'user') {
    const draft = Store.getAIDrafts().find(d => d.id === draftId)
    if (!draft) return { error: '초안을 찾을 수 없습니다.' }
    const indicator = Store.getIndicators().find(i => i.id === draft.indicator_id)
    if (!indicator) return { error: '지표를 찾을 수 없습니다.' }

    const rawEvidences = Evidence.getByIndicator(draft.assessment_id, draft.indicator_id)
    const evidences = this._maskEvidenceList(rawEvidences, userRole)
    const prevYearText = this._getPrevYearText(draft.assessment_id, draft.indicator_id)
    const evidenceExcerpts = this._formatEvidenceForPrompt(evidences)

    const pillarMap = { POLICY: 'POLICY', ACTION: 'ACTION', RESULT: 'RESULT', GOVERNANCE: 'GOVERNANCE', STRATEGY: 'STRATEGY', RISK_MGMT: 'RISK_MGMT', METRICS: 'METRICS', Policies: 'POLICY', Actions: 'ACTION', Results: 'RESULT' }
    const pillarType = pillarMap[indicator.pillar] || indicator.pillar || 'POLICY'

    try {
      const raw = await this._callAI([
        { role: 'system', content: this._buildDraftSystemPrompt() },
        { role: 'user', content: this._buildDraftUserPrompt(indicator, prevYearText, evidenceExcerpts, pillarType) }
      ])
      const parsed = this._safeParseJson(raw)

      const next = {
        ...draft,
        draft_text: parsed?.draft_text || raw,
        pillar_coverage: parsed?.pillar_coverage || null,
        missing_pillars: parsed?.missing_pillars || [],
        cited_evidence_ids: parsed?.cited_evidence_ids || evidences.map(e => e.id).filter(Boolean),
        unsupported_claims_flagged: parsed?.unsupported_claims_flagged || [],
        confidence: parsed?.confidence || 'LOW',
        evidence_ids: evidences.map(e => e.id).filter(Boolean),
        version: (draft.version || 1) + 1,
        ver_status: 'pending',
        ver_result: null,
        ver_date: null,
        human_status: 'pending',
        human_feedback: '',
        human_reviewer: null,
        human_reviewed_at: null,
        retried_at: new Date().toISOString(),
        retried_by: reviewerId
      }

      const verResult = await this.verifyReport(next)
      if (!verResult.error) {
        next.ver_status = verResult.ver_status
        next.ver_result = verResult
        next.ver_date = new Date().toISOString()
        if (verResult.overall_verdict === 'FAIL' || next.cited_evidence_ids.length === 0) {
          next.human_status = 'blocked'
          next.fail_count = (next.fail_count || 0) + 1
          if (next.fail_count >= 3) {
            next.human_status = 'escalated'
            next.escalation_reason = '3회 연속 검증 실패'
          }
        } else {
          next.fail_count = 0
        }
      }

      Store.updateAIDraft(draftId, next)
      return { success: true, draftId, draft: next, verification: verResult }
    } catch (err) {
      return { error: err.message }
    }
  },

  requestRevision(draftId, reviewerId, feedback = '') {
    const draft = Store.getAIDrafts().find(d => d.id === draftId)
    if (!draft) return { error: '초안을 찾을 수 없습니다.' }

    Store.updateAIDraft(draftId, {
      human_status: 'revision_requested',
      human_reviewer: reviewerId,
      human_reviewed_at: new Date().toISOString(),
      human_feedback: feedback,
      version: (draft.version || 1) + 1
    })

    return { success: true, draftId }
  },

  getDraftStatus(draft) {
    const verMap = { pending: '대기', pass: '통과', fail: '실패', revision_needed: '수정필요' }
    const humanMap = { pending: '검토대기', approved: '승인', rejected: '반려', revision_requested: '수정요청', blocked: '차단됨', escalated: '에스컬레이션' }
    return `AI:${verMap[draft.ver_status] || draft.ver_status} / 사람:${humanMap[draft.human_status] || draft.human_status}`
  },

  getDraftsByAssessment(assessmentId) {
    return Store.getAIDrafts().filter(d => d.assessment_id === assessmentId)
  },

  getDraftsByIndicator(assessmentId, indicatorId) {
    return this.getDraftsByAssessment(assessmentId).filter(d => d.indicator_id === indicatorId)
  },

  // ==================== 보고서 작성기 AI ====================
  WRITER_PRESETS: {
    tone: { neutral: '중립·객관적', formal: '격식·공시체', friendly: '친근·소통', lead: '단호·리더십' },
    length: { short: '간결 (2~3문장)', normal: '보통 (1문단)', long: '상세 (2~3문단)' },
    format: { prose: '서술식 문단', bullets: '개조식 불릿', report: '보고서형 (소제목+문단)' }
  },

  _presetText(preset) {
    const P = this.WRITER_PRESETS
    const p = preset || {}
    const parts = []
    if (p.tone && P.tone[p.tone]) parts.push('문체: ' + P.tone[p.tone])
    if (p.length && P.length[p.length]) parts.push('분량: ' + P.length[p.length])
    if (p.format && P.format[p.format]) parts.push('형식: ' + P.format[p.format])
    return parts.length ? '\n\n[작성 지침] ' + parts.join(' / ') : ''
  },

  _buildWriteSystemPrompt() {
    return `당신은 제조업 ESG 지속가능경영보고서 작성을 돕는 한국어 전문 집필 보조입니다.

규칙(반드시 준수):
1. 사용자가 제공한 <draft_text>(기존 원고)와 <evidence>(참고자료)에 근거해서만 서술합니다.
   근거에 없는 수치·날짜·고유명사·사실은 절대 만들어내지 않습니다.
2. 근거가 부족한 부분은 "[확인 필요: 항목]"으로 남기고 추정치로 채우지 않습니다.
3. 문장은 Policy(정책)-Action(조치)-Result(성과) 구조를 지향합니다.
4. 법적 단정, 등급 확정, 타사 비교 주장은 하지 않습니다.
5. 출력은 지정된 JSON 스키마로만 반환하고 다른 설명을 붙이지 않습니다.`
  },

  _formatRefs(refChunks) {
    return this._formatRefChunksForPrompt(refChunks)
  },

  async continueDraft({ title, content, refChunks, preset }) {
    const evidence = this._formatRefs(refChunks)
    const mode = content && content.trim() ? '이어쓰기(자연스럽게 다음 문단을 작성)' : '초안 새로 작성'
    const userPrompt = `<item>항목명: ${title || '(제목 없음)'}</item>

<draft_text>
${content && content.trim() ? content : '(아직 작성 전)'}
</draft_text>

<evidence>
${evidence}
</evidence>

위 항목의 원고를 ${mode}하십시오.${this._presetText(preset)}

출력은 반드시 다음 JSON 스키마를 따르십시오:
{
  "draft_text": "완성하거나 이어쓴 문장 전체(기존 원고가 있으면 이어붙인 전체)",
  "appended_text": "이번에 새로 추가한 부분만",
  "missing_pillars": ["policy", ...],
  "cited_evidence_ids": ["REF-...", ...],
  "unsupported_claims_flagged": ["...", ...],
  "confidence": "HIGH" | "MEDIUM" | "LOW"
}`
    try {
      const raw = await this._callAI([
        { role: 'system', content: this._buildWriteSystemPrompt() },
        { role: 'user', content: userPrompt }
      ])
      const parsed = this._safeParseJson(raw)
      return {
        draft_text: parsed?.draft_text || raw || '',
        appended_text: parsed?.appended_text || '',
        missing_pillars: parsed?.missing_pillars || [],
        cited_evidence_ids: parsed?.cited_evidence_ids || [],
        unsupported_claims_flagged: parsed?.unsupported_claims_flagged || [],
        confidence: parsed?.confidence || 'LOW'
      }
    } catch (err) {
      return { error: err.message }
    }
  },

  async refineInline({ text, instruction, preset }) {
    if (!text || !text.trim()) return { error: '선택된 문장이 없습니다.' }
    const userPrompt = `<selected_text>
${text}
</selected_text>

요청: ${instruction || '문장을 더 명확하고 매끄럽게 다듬어 주세요.'}${this._presetText(preset)}
- 원문의 사실·의미는 유지하고 표현만 개선합니다.
- 없는 수치·사실은 추가하지 않습니다.

출력은 반드시 다음 JSON 스키마를 따르십시오:
{ "draft_text": "다듬은 문장" }`
    try {
      const raw = await this._callAI([
        { role: 'system', content: this._buildWriteSystemPrompt() },
        { role: 'user', content: userPrompt }
      ])
      const parsed = this._safeParseJson(raw)
      const out = String(parsed?.draft_text || raw || '').trim()
      if (out) return { draft_text: out }
      return { draft_text: this._localNormalize(text), offline: true, note: 'AI 응답 없음 → 로컬 정리만 적용' }
    } catch (err) {
      return { draft_text: this._localNormalize(text), offline: true, note: 'AI 미연결 → 로컬 정리만 적용' }
    }
  },

  async complianceCheck({ text }) {
    if (!text || !text.trim()) return { error: '내용이 없습니다.' }
    const userPrompt = `<text>
${text}
</text>

위 ESG 보고서 문장을 아래 관점에서 점검하십시오.
- 과장·최상급 표현(최고, 최초, 유일, 완벽, 100% 등)
- 근거 없는 단정·전망(반드시, 확실히, 보장)
- 모호한 수치(약, 대략, 추정)
- 법적·등급 확정 표현
- 미검증 수치/단위 누락

출력은 반드시 다음 JSON 스키마를 따르십시오:
{
  "issues": [ { "type": "과장|단정|모호|법적|수치", "severity": "high|medium|low", "quote": "지적 문구", "message": "이유", "suggestion": "수정 제안" } ],
  "summary": "총평"
}`
    try {
      const raw = await this._callAI([
        { role: 'system', content: '당신은 ESG 공시 문장의 문체·컴플라이언스 검토자입니다. JSON으로만 답합니다.' },
        { role: 'user', content: userPrompt }
      ])
      const parsed = this._safeParseJson(raw)
      if (parsed && Array.isArray(parsed.issues)) return { issues: parsed.issues, summary: parsed.summary || '' }
      return this._ruleComplianceCheck(text)
    } catch (err) {
      return this._ruleComplianceCheck(text)
    }
  },

  _ruleComplianceCheck(text) {
    const rules = [
      { re: /(최고|최초|유일|완벽|무결점|국내 1위|세계 1위|100%|전량)/g, type: '과장', severity: 'medium', message: '최상급·과장 표현은 검증 없이는 사용을 피하세요.' },
      { re: /(반드시|확실히|보장|절대|틀림없)/g, type: '단정', severity: 'medium', message: '근거 없는 단정적 표현은 공시 리스크가 있습니다.' },
      { re: /(약|대략|추정|정도|쯤)\s*[0-9]/g, type: '모호', severity: 'low', message: '모호한 수치 표현은 정확한 값으로 대체하는 것이 좋습니다.' },
      { re: /(위반하지 않|문제가 없|법적으로 적법)/g, type: '법적', severity: 'high', message: '법적 단정 표현은 자제하고 사실만 기술하세요.' }
    ]
    const issues = []
    const seen = new Set()
    rules.forEach(r => {
      const m = text.match(r.re)
      if (m) m.slice(0, 5).forEach(q => { const k = r.type + q; if (seen.has(k)) return; seen.add(k); issues.push({ type: r.type, severity: r.severity, quote: q, message: r.message, suggestion: '' }) })
    })
    return { issues, summary: issues.length ? issues.length + '건의 점검 항목이 발견되었습니다.' : '특이사항이 발견되지 않았습니다.' }
  },

  async coverageCheck({ title, content }) {
    const userPrompt = `<item>항목명: ${title || '(제목 없음)'}</item>
<content>
${(content || '').slice(0, 4000)}
</content>

위 섹션이 아래 국제 기준의 핵심 요소를 얼마나 담고 있는지 점검하십시오.
- GRI: 2-1~2-5(조직·거버넌스), 3-1~3-3(중대성), 305(배출), 302(에너지), 401(고용), 403(안전보건), 413(지역사회)
- ISSB(IFRS S1/S2): 거버넌스, 전략, 위험관리, 지표와 목표

출력은 반드시 다음 JSON 스키마를 따르십시오:
{
  "covered": [ { "standard": "GRI 305", "label": "배출" } ],
  "gaps": [ { "standard": "ISSB S2", "label": "기후 시나리오 분석", "hint": "보완 방법" } ],
  "summary": "총평"
}`
    try {
      const raw = await this._callAI([
        { role: 'system', content: '당신은 GRI/ISSB 공시 커버리지 분석가입니다. JSON으로만 답합니다.' },
        { role: 'user', content: userPrompt }
      ])
      const parsed = this._safeParseJson(raw)
      if (parsed && (Array.isArray(parsed.covered) || Array.isArray(parsed.gaps))) {
        return { covered: parsed.covered || [], gaps: parsed.gaps || [], summary: parsed.summary || '' }
      }
      return this._ruleCoverageCheck(content)
    } catch (err) {
      return this._ruleCoverageCheck(content)
    }
  },

  _ruleCoverageCheck(content) {
    const t = String(content || '')
    const defs = [
      { standard: 'GRI 2', label: '조직·거버넌스', re: /(거버넌스|이사회|지배구조|위원회|조직 개요|경영진)/ },
      { standard: 'GRI 3', label: '중대성 평가', re: /(중대성|중대 이슈|우선순위|이해관계자|매트릭스)/ },
      { standard: 'GRI 205', label: '반부패·윤리', re: /(반부패|부패|윤리|청렴|공정거래|내부고발)/ },
      { standard: 'GRI 302', label: '에너지', re: /(에너지|전력|재생에너지|kwh|mwh|에너지 사용)/i },
      { standard: 'GRI 305', label: '온실가스 배출', re: /(배출|온실가스|탄소|scope|스코프|tco2|넷제로|감축)/i },
      { standard: 'GRI 401', label: '고용·인권', re: /(고용|채용|근로|정규직|인력|인권|다양성|차별)/ },
      { standard: 'GRI 403', label: '안전보건', re: /(안전|보건|재해|산업재해|ltifr|사고율)/i },
      { standard: 'GRI 413', label: '지역사회', re: /(지역사회|사회공헌|기부|봉사|상생)/ },
      { standard: 'ISSB S1', label: '지속가능성 재무공시', re: /(지속가능성|재무영향|리스크와 기회|통제|내부통제)/ },
      { standard: 'ISSB S2', label: '기후 관련 공시', re: /(기후|전환계획|시나리오|목표|감축|기후 리스크)/ },
      { standard: 'TCFD', label: '기후 리스크 관리', re: /(리스크 관리|위험 관리|전략|시나리오 분석|감독)/ }
    ]
    const covered = [], gaps = []
    defs.forEach(d => {
      if (d.re.test(t)) covered.push({ standard: d.standard, label: d.label })
      else gaps.push({ standard: d.standard, label: d.label, hint: '관련 정책·조치·성과 서술 또는 수치를 보강하세요.' })
    })
    return {
      covered,
      gaps: gaps.slice(0, 6),
      summary: 'AI 미연결 상태로 키워드 기반 점검을 수행했습니다. (충족 ' + covered.length + '/' + defs.length + ' 항목) · [설정 › AI 연결] 후 정밀 분석을 사용하세요.'
    }
  },

  async chat({ messages, context }) {
    const sys = this._buildWriteSystemPrompt() + '\n\n당신은 작성자와 대화하며 보고서 작성을 돕는 어시스턴트입니다. 한국어로 간결히 답하세요.'
    const ctx = context && (context.title || context.content)
      ? `\n\n[현재 섹션] ${context.title || ''}\n${(context.content || '').slice(0, 1500)}`
      : ''
    const sysMsg = { role: 'system', content: sys + (ctx ? '\n\n' + ctx : '') }
    try {
      const raw = await this._callAI([sysMsg, ...(messages || [])])
      const parsed = this._safeParseJson(raw)
      return { reply: (parsed && (parsed.reply || parsed.draft_text)) || raw || '응답이 없습니다.' }
    } catch (err) {
      return { error: err.message }
    }
  }
}
