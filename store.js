const APP_VERSION = 'v2.1.5'
const STORE_KEY = 'smart_esg_data'
const DELETED_IDS_KEY = 'smart_esg_deleted_ids'

// Supabase 미러 동기화 매핑: [테이블명, 허용 컬럼]
// 허용 컬럼만 전송하고 나머지는 null로 채워 모든 행의 키를 동일하게 맞춘다.
// (PostgREST는 한 배치의 모든 행이 같은 키 집합을 가져야 함)
// tb_risk_register.score는 GENERATED 컬럼이므로 제외한다.
const SB_SYNC_MAP = {
  assessments: ['tb_assessment', ['id', 'company_id', 'title', 'assessment_year', 'authority_code', 'status', 'total_score', 'rating', 'created_by', 'created_at', 'updated_at']],
  assessmentItems: ['tb_assessment_item', ['id', 'assessment_id', 'indicator_id', 'score', 'weight', 'narrative', 'target_value', 'actual_value', 'status']],
  evidences: ['tb_evidence', ['id', 'assessment_id', 'title', 'description', 'file_url', 'file_type', 'file_size', 'status', 'notes', 'uploaded_by', 'uploaded_at', 'expiry_date', 'contains_sensitive_data', 'reuse_linked_indicators', 'upload_count_flag']],
  evidenceTags: ['tb_evidence_tag', ['id', 'evidence_id', 'indicator_id', 'is_primary']],
  aiDrafts: ['tb_ai_report_draft', ['id', 'assessment_id', 'indicator_id', 'draft_text', 'evidence_ids', 'ver_status', 'ver_result', 'ver_date', 'human_status', 'human_reviewer', 'human_reviewed_at', 'human_feedback', 'version', 'created_at', 'updated_at', 'masked_before_send', 'cited_evidence_ids']],
  aiVerificationLogs: ['tb_ai_verification_log', ['id', 'draft_id', 'verifier', 'result', 'score', 'criteria_results', 'fail_reasons', 'suggestions', 'created_at']],
  users: ['tb_user', ['id', 'company_id', 'dept_code', 'username', 'password', 'name', 'email', 'phone', 'position', 'role', 'status', 'created_at', 'updated_at']],
  companies: ['tb_company', ['id', 'name', 'business_number', 'ceo_name', 'address', 'industry_code', 'employee_count', 'revenue', 'created_at', 'updated_at']],
  departments: ['tb_department', ['id', 'dept_code', 'dept_name', 'manager_name', 'manager_email', 'parent_dept', 'is_active', 'created_at', 'updated_at']],
  indicators: ['tb_indicator', ['id', 'group_id', 'authority_code', 'indicator_code', 'indicator_name', 'pillar', 'description', 'weight_default', 'is_active', 'sort_order', 'data_type', 'unit', 'dept_code', 'review_cycle', 'scope2_split_required', 'materiality_optional', 'theme_code']],
  indicatorGroups: ['tb_indicator_group', ['id', 'authority_code', 'group_code', 'group_name', 'description', 'sort_order']],
  indicatorMappings: ['tb_indicator_mapping', ['id', 'source_authority', 'source_indicator_id', 'target_authority', 'target_indicator_id', 'mapping_type', 'confidence', 'notes']],
  ghgFactors: ['tb_ghg_emission_factor', ['id', 'energy_type', 'scope', 'scope2_method', 'factor', 'unit', 'source', 'valid_from', 'valid_to']],
  ghgActivities: ['tb_ghg_activity_data', ['id', 'assessment_id', 'energy_type', 'scope', 'scope2_method', 'value', 'unit', 'emission_factor_id', 'co2eq', 'period_start', 'period_end', 'notes', 'created_at', 'dept_code', 'evidence_id', 'calculated_emission']],
  ghgSummary: ['tb_ghg_summary', ['id', 'assessment_id', 'scope', 'scope2_method', 'total', 'unit', 'last_updated']],
  weightParams: ['tb_weight_param', ['id', 'authority_code', 'year', 'theme_code', 'weight', 'updated_at']],
  ratingThresholds: ['tb_rating_threshold', ['id', 'authority_code', 'year', 'rating', 'min_score', 'max_score', 'notes', 'effective_from']],
  maskingRules: ['tb_data_masking_rule', ['id', 'field_name', 'masking_type', 'description', 'applies_to_ai_api', 'is_active', 'created_at']],
  projectBudget: ['tb_project_budget', ['id', 'project_name', 'category', 'planned_amount', 'actual_amount', 'status', 'start_date', 'end_date', 'notes', 'created_at', 'updated_at']],
  riskRegister: ['tb_risk_register', ['id', 'risk_name', 'category', 'description', 'probability', 'impact', 'status', 'owner', 'mitigation_plan', 'created_at', 'updated_at']],
  agencyMaster: ['tb_agency_master', ['id', 'code', 'name', 'track_type', 'description', 'effective_date', 'website_url', 'is_active', 'created_at']],
  referenceDocs: ['tb_reference_doc', ['id', 'title', 'source_org', 'industry', 'year', 'file_name', 'file_type', 'mime_type', 'file_size', 'storage_path', 'markdown', 'page_count', 'chunk_count', 'engine', 'status', 'error', 'tags', 'created_at', 'updated_at', 'converted_at']],
  reportDocs: ['tb_report_doc', ['id', 'title', 'status', 'progress', 'created_at', 'updated_at']],
  reportDocSections: ['tb_report_doc_section', ['id', 'doc_id', 'title', 'content', 'sort_order', 'status', 'indicator_refs', 'created_at', 'updated_at']],
  reportFeedback: ['tb_report_feedback', ['id', 'doc_id', 'section_id', 'kind', 'message', 'suggestion', 'reference_title', 'page', 'status', 'created_at']]
}

async function _sha256(str) {
  const buf = new TextEncoder().encode(str)
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

const Store = {
  _data: null,
  _listeners: [],
  _pwCache: {},
  get version() { return APP_VERSION },

  async hashPassword(pw) {
    if (this._pwCache[pw]) return this._pwCache[pw]
    const h = await _sha256(pw)
    this._pwCache[pw] = h
    return h
  },

  getCurrentUser() {
    const raw = sessionStorage.getItem('smart_esg_session')
    if (!raw) return null
    try { const s = JSON.parse(raw); return (this.getUsers() || []).find(u => u.id === s.id) || null } catch { return null }
  },

  currentUserHasRole(role) {
    const u = this.getCurrentUser()
    return u && (u.role === role || u.role === 'admin')
  },

  deleteAssessmentCascade(id) {
    this.data.assessmentItems = this.data.assessmentItems.filter(x => x.assessment_id !== id)
    this.data.evidenceTags = this.data.evidenceTags.filter(t => {
      const ev = this.data.evidences.find(e => e.id === t.evidence_id)
      return ev && ev.assessment_id !== id
    })
    this.data.evidences = this.data.evidences.filter(x => x.assessment_id !== id)
    this.data.ghgActivities = this.data.ghgActivities.filter(x => x.assessment_id !== id)
    this.data.aiDrafts = this.data.aiDrafts.filter(x => x.assessment_id !== id)
    this.data.aiVerificationLogs = this.data.aiVerificationLogs.filter(x => x.assessment_id !== id)
    this.data.assessments = this.data.assessments.filter(x => x.id !== id)
    this._addDeletedId('assessments', id)
    this._save()
  },

  async ensureAdmin() {
    try {
      const users = this.data.users
      const adminExists = users.some(u => u.username === 'admin')
      if (!adminExists) {
        const hash = await this.hashPassword('admin1234')
        users.push({ id: 1, username: 'admin', password: hash, role: 'admin', status: 'active', createdAt: new Date().toISOString() })
        this._save()
      }
    } catch (e) {
      console.error('ensureAdmin error:', e)
    }
  },

  get data() {
    if (!this._data) this._load()
    return this._data
  },

  _load() {
    const raw = localStorage.getItem(STORE_KEY)
    const savedVer = localStorage.getItem(STORE_KEY + '_ver')
    this._data = raw ? JSON.parse(raw) : this._emptyData()
    if (!raw) {
      this._seed()
    } else {
      const empty = this._emptyData()
      Object.keys(empty).forEach(k => {
        if (this._data[k] == null) this._data[k] = empty[k]
      })
    }
    this._ensureSeeds()
    if (savedVer !== APP_VERSION) {
      localStorage.setItem(STORE_KEY + '_ver', APP_VERSION)
      this._save()
    }
  },

  _ensureSeeds() {
    const d = this._data
    const _ts = () => Date.now() + Math.random()
    if (d.agencyMaster?.length) {
      const typeMap = { ECOVADIS: 'QUESTIONNAIRE', KCGS: 'QUESTIONNAIRE', NICE: 'QUESTIONNAIRE', KSSB: 'REGULATORY', 'K-ESG': 'QUESTIONNAIRE', ISSB: 'REGULATORY' }
      d.agencyMaster.forEach(a => { if (!a.assessment_type) a.assessment_type = typeMap[a.code] || 'QUESTIONNAIRE'; if (!('submission_window' in a)) a.submission_window = null })
      const newAgencies = [
        { code: 'UNGC', name: 'UN Global Compact - CoP', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: '04-01~07-31', disclosure_std_no: null, effective_date: '2024-01-01', note: 'CEO성명 + CoP설문, 미제출시 12/31 제명' },
        { code: 'CDP', name: 'CDP (Climate/Water/Forest)', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '환경 공시 특화, A~D- 등급' },
        { code: 'SPGLOBAL', name: 'S&P Global CSA (DJSI)', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '업종별 최대 62개 설문, 0~100점' },
        { code: 'MSCI', name: 'MSCI ESG Ratings', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'PUBLIC_DATA', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '공개자료 기반, 업종 상대평가 AAA~CCC — 증빙 제출 불필요' },
        { code: 'SUSTAINALYTICS', name: 'Sustainalytics ESG Risk Rating', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'PUBLIC_DATA', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '공개자료 기반, 절대 리스크 점수(낮을수록 우수) — 증빙 제출 불필요' },
        { code: 'EU_VSME', name: 'EU VSME (중소기업 자율공시기준)', country: 'EU', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2026-01-01', note: 'EU 대형고객사의 트리클다운 요청 상한 — Omnibus 이후 이 범위 초과 요청 불가' },
        { code: 'CA_SB253', name: 'California SB253 (Scope1/2 공시)', country: '미국', track_type: 'MANDATORY', assessment_type: 'REGULATORY', submission_window: null, disclosure_std_no: null, effective_date: '2026-11-10', note: '매출 10억달러 이상 대상, 2026-11-10 첫 마감(연기됨)' },
        { code: 'CA_SB261', name: 'California SB261 (기후재무리스크)', country: '미국', track_type: 'MANDATORY', assessment_type: 'REGULATORY', submission_window: null, disclosure_std_no: null, effective_date: '2026-01-01', note: '매출 5억달러 이상 대상, TCFD/ISSB 정합 필요' }
      ]
      const existingCodes = new Set(d.agencyMaster.map(a => a.code))
      newAgencies.forEach(a => { if (!existingCodes.has(a.code)) d.agencyMaster.push(a) })
    }
    if (!d.agencyMaster?.length) {
      d.agencyMaster = [
        { code: 'ECOVADIS', name: 'EcoVadis', country: '프랑스', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '글로벌 공급망 ESG 평가' },
        { code: 'KCGS', name: 'KCGS', country: '한국', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '한국기업지배구조원 ESG평가' },
        { code: 'NICE', name: 'NICE', country: '한국', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: 'NICE 평가정보 ESG' },
        { code: 'KSSB', name: 'KSSB', country: '한국', track_type: 'MANDATORY', assessment_type: 'REGULATORY', submission_window: null, disclosure_std_no: '제1호,제2호', effective_date: '2026-02-26', note: '한국지속가능성기준원 - 법정 공시' },
        { code: 'K-ESG', name: 'K-ESG', country: '한국', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2026-01-01', note: 'K-ESG 가이드라인' },
        { code: 'ISSB', name: 'ISSB', country: '글로벌', track_type: 'MANDATORY', assessment_type: 'REGULATORY', submission_window: null, disclosure_std_no: 'IFRS S1,S2', effective_date: '2024-01-01', note: '국제지속가능성기준위원회' },
        { code: 'UNGC', name: 'UN Global Compact - CoP', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: '04-01~07-31', disclosure_std_no: null, effective_date: '2024-01-01', note: 'CEO성명 + CoP설문, 미제출시 12/31 제명' },
        { code: 'CDP', name: 'CDP (Climate/Water/Forest)', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '환경 공시 특화, A~D- 등급' },
        { code: 'SPGLOBAL', name: 'S&P Global CSA (DJSI)', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '업종별 최대 62개 설문, 0~100점' },
        { code: 'MSCI', name: 'MSCI ESG Ratings', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'PUBLIC_DATA', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '공개자료 기반, 업종 상대평가 AAA~CCC — 증빙 제출 불필요' },
        { code: 'SUSTAINALYTICS', name: 'Sustainalytics ESG Risk Rating', country: '글로벌', track_type: 'VOLUNTARY', assessment_type: 'PUBLIC_DATA', submission_window: null, disclosure_std_no: null, effective_date: '2024-01-01', note: '공개자료 기반, 절대 리스크 점수(낮을수록 우수) — 증빙 제출 불필요' },
        { code: 'EU_VSME', name: 'EU VSME (중소기업 자율공시기준)', country: 'EU', track_type: 'VOLUNTARY', assessment_type: 'QUESTIONNAIRE', submission_window: null, disclosure_std_no: null, effective_date: '2026-01-01', note: 'EU 대형고객사의 트리클다운 요청 상한 — Omnibus 이후 이 범위 초과 요청 불가' },
        { code: 'CA_SB253', name: 'California SB253 (Scope1/2 공시)', country: '미국', track_type: 'MANDATORY', assessment_type: 'REGULATORY', submission_window: null, disclosure_std_no: null, effective_date: '2026-11-10', note: '매출 10억달러 이상 대상, 2026-11-10 첫 마감(연기됨)' },
        { code: 'CA_SB261', name: 'California SB261 (기후재무리스크)', country: '미국', track_type: 'MANDATORY', assessment_type: 'REGULATORY', submission_window: null, disclosure_std_no: null, effective_date: '2026-01-01', note: '매출 5억달러 이상 대상, TCFD/ISSB 정합 필요' }
      ]
    }
    if (!d.departments?.length) {
      d.departments = [
        { id: _ts(), dept_code: 'ESG', dept_name: 'ESG경영팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
        { id: _ts(), dept_code: 'ENV', dept_name: '환경팀', manager_name: '', manager_email: '', parent_dept: 'ESG', is_active: true },
        { id: _ts(), dept_code: 'HR', dept_name: '인사팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true }
      ]
    }
    if (!d.indicatorGroups?.length) this._seedIndicatorsOnly()
    else if (!d.indicatorGroups.some(g => g.authority_code === 'EU_VSME')) {
      const addGroup = (auth, code, name) => { const id = _ts(); d.indicatorGroups.push({ id, authority_code: auth, group_code: code, group_name: name, sort_order: d.indicatorGroups.length + 1 }); return id }
      const addInd = (gid, auth, code, name, pillar, opts = {}) => { d.indicators.push({ id: _ts(), group_id: gid, authority_code: auth, indicator_code: code, indicator_name: name, pillar, is_active: true, sort_order: d.indicators.length + 1, dept_code: '', review_cycle: 'annual', scope2_split_required: false, materiality_optional: false, ...opts }) }
      const vsmeGen = addGroup('EU_VSME', 'General', '일반정보')
      const vsmeEnv = addGroup('EU_VSME', 'Environment', '환경')
      const vsmeSoc = addGroup('EU_VSME', 'Social', '사회')
      const vsmeGov = addGroup('EU_VSME', 'Governance', '거버넌스')
      addInd(vsmeGen, 'EU_VSME', 'VSME-B1', '기업개요·사업장', 'POLICY')
      addInd(vsmeEnv, 'EU_VSME', 'VSME-B2', '에너지·GHG 배출(기본모듈)', 'RESULT')
      addInd(vsmeSoc, 'EU_VSME', 'VSME-B3', '인력현황·안전보건(기본모듈)', 'RESULT')
      addInd(vsmeEnv, 'EU_VSME', 'VSME-C1', '전환계획·타겟(종합모듈, 선택)', 'STRATEGY')
      addInd(vsmeGov, 'EU_VSME', 'VSME-C2', '이해관계자 참여(종합모듈, 선택)', 'GOVERNANCE')
    }
    if (!d.weightParams?.length) {
      d.weightParams = [
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'ENV', weight: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'LHR', weight: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'ETH', weight: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'SP', weight: 25, year: 2026 },
        { id: _ts(), authority_code: 'KSSB', theme_code: 'KSSB', weight: 100, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: '_PILLAR', pillar: 'POLICY', weight: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: '_PILLAR', pillar: 'ACTION', weight: 40, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', theme_code: '_PILLAR', pillar: 'RESULT', weight: 35, year: 2026 }
      ]
    }
    if (!d.ratingThresholds?.length) {
      d.ratingThresholds = [
        { id: _ts(), authority_code: 'ECOVADIS', rating: 'Platinum', min_score: 78, max_score: 100, year: 2026, effective_from: '2026-01-01' },
        { id: _ts(), authority_code: 'ECOVADIS', rating: 'Gold', min_score: 68, max_score: 77, year: 2026, effective_from: '2026-01-01' },
        { id: _ts(), authority_code: 'ECOVADIS', rating: 'Silver', min_score: 54, max_score: 67, year: 2026, effective_from: '2026-01-01' },
        { id: _ts(), authority_code: 'ECOVADIS', rating: 'Bronze', min_score: 37, max_score: 53, year: 2026, effective_from: '2026-01-01' },
        { id: _ts(), authority_code: 'KSSB', rating: '우수', min_score: 80, max_score: 100, year: 2026, effective_from: '2026-02-26' },
        { id: _ts(), authority_code: 'KSSB', rating: '양호', min_score: 60, max_score: 79, year: 2026, effective_from: '2026-02-26' },
        { id: _ts(), authority_code: 'KSSB', rating: '보통', min_score: 40, max_score: 59, year: 2026, effective_from: '2026-02-26' },
        { id: _ts(), authority_code: 'KSSB', rating: '미흡', min_score: 0, max_score: 39, year: 2026, effective_from: '2026-02-26' }
      ]
    }
    if (!d.indicatorMappings?.length && d.indicators?.length) {
      this._seedIndicatorMappings()
    }
    if (!d.suppliers?.length) {
      d.suppliers = [
        { id: _ts(), name: '(주)한국전자', industry: '전자제품', ceo: '김철수', employee_count: 500, last_vsme_score: null, last_vsme_grade: null, last_vsme_date: null },
        { id: _ts(), name: '(주)서울ENG', industry: '엔지니어링', ceo: '박영희', employee_count: 200, last_vsme_score: 72, last_vsme_grade: 'B', last_vsme_date: '2025-12-01' },
        { id: _ts(), name: '(주)그린팩토리', industry: '제조업', ceo: '이준호', employee_count: 100, last_vsme_score: 45, last_vsme_grade: 'D', last_vsme_date: '2025-11-15' }
      ]
    }
    if (!d.maskingRules?.length) {
      d.maskingRules = [
        { id: 1, field_name: '급여', masking_type: '전체마스킹', applies_to_ai_api: true },
        { id: 2, field_name: '징계이력', masking_type: '전체마스킹', applies_to_ai_api: true },
        { id: 3, field_name: '직원명', masking_type: '부분마스킹', applies_to_ai_api: true }
      ]
    }
    if (!d.supplierRiskItems?.length && d.suppliers?.length && typeof SupplierRisk !== 'undefined') {
      this._seedSupplierRisk()
    }
    this._seedApiEndpoints()
    this._seedBenchmarks()
    this._save()
  },

  _seedBenchmarks() {
    if (this.data.benchmarks) return
    this.data.benchmarks = {
      industries: [
        { code: 'mfg', label: '제조업', avg_score: 52, sample_size: 156 },
        { code: 'ict', label: 'ICT', avg_score: 61, sample_size: 89 },
        { code: 'finance', label: '금융', avg_score: 58, sample_size: 67 },
        { code: 'energy', label: '에너지', avg_score: 45, sample_size: 43 },
        { code: 'service', label: '서비스', avg_score: 49, sample_size: 112 },
        { code: 'construction', label: '건설', avg_score: 41, sample_size: 54 },
        { code: 'retail', label: '유통', avg_score: 47, sample_size: 78 },
        { code: 'pharma', label: '제약/바이오', avg_score: 55, sample_size: 36 }
      ],
      source: '내부 기준값 (데모 데이터)',
      source_type: 'internal_demo',
      last_updated: null
    }
  },

  _seedSupplierRisk() {
    const _ts = () => Date.now() + Math.random()
    const patterns = {
      '에코솔루션': { e1: 'yes', e2: 'yes', e3: 'partial', e4: 'no', e5: 'yes', s1: 'yes', s2: 'yes', s3: 'yes', s4: 'yes', s5: 'yes', g1: 'yes', g2: 'yes', g3: 'yes' },
      '그린텍(주)': { e1: 'yes', e2: 'yes', e3: 'no', e4: 'partial', e5: 'partial', s1: 'yes', s2: 'yes', s3: 'partial', s4: 'yes', s5: 'no', g1: 'yes', g2: 'partial', g3: 'yes' },
      '스마트물산': { e1: 'partial', e2: 'no', e3: 'no', e4: 'no', e5: 'partial', s1: 'yes', s2: 'no', s3: 'no', s4: 'no', s5: 'partial', g1: 'no', g2: 'no', g3: 'yes' }
    }
    const qMeta = {}
    Object.entries(SupplierRisk.ESG_QUESTIONS).forEach(([axis, arr]) => arr.forEach(q => { qMeta[q.id] = { axis, question: q.question, weight: q.weight } }))
    this.data.suppliers.forEach(s => {
      const pat = patterns[s.name]
      if (!pat) return
      Object.entries(pat).forEach(([qid, answer]) => {
        const m = qMeta[qid]
        if (!m) return
        this.data.supplierRiskItems.push({ id: _ts(), supplier_id: s.id, question_id: qid, axis: m.axis, question: m.question, weight: m.weight, answer, assessed_at: new Date().toISOString() })
      })
    })
    const target = this.data.suppliers.find(s => s.name === '스마트물산')
    if (target) {
      this.data.supplierRiskActions.push({ id: _ts(), supplier_id: target.id, description: 'ISO 14001 환경경영시스템 인증 취득', owner: '구매팀', due_date: '2026-12-31', status: 'in_progress', priority: '높음', progress: 40, created_at: new Date().toISOString() })
      this.data.supplierRiskActions.push({ id: _ts(), supplier_id: target.id, description: '산업안전보건 교육 프로그램 도입', owner: '안전팀', due_date: '2026-09-30', status: 'not_started', priority: '높음', progress: 0, created_at: new Date().toISOString() })
    }
  },

  _seedIndicatorMappings() {
    const d = this._data
    const _ts = () => Date.now() + Math.random()
    const findInd = (auth, code) => d.indicators.find(i => i.authority_code === auth && i.indicator_code === code)
    const mappingData = [
      ['ECOVADIS', 'EV-ENV-OPS', 'KSSB', 'KSSB2-MET', 'expanded', 'high'],
      ['ECOVADIS', 'EV-ENV-POL', 'KSSB', 'KSSB1-GOV', 'expanded', 'high'],
      ['ECOVADIS', 'EV-ENV-POL', 'KSSB', 'KSSB1-STRAT', 'expanded', 'high'],
      ['ECOVADIS', 'EV-ENV-OPS', 'KSSB', 'KSSB1-MET', 'indirect', 'medium'],
      ['ECOVADIS', 'EV-ETH-INFO', 'KSSB', 'KSSB1-GOV', 'indirect', 'medium'],
      ['ECOVADIS', 'EV-LHR-HR', 'KSSB', 'KSSB1-RISK', 'direct', 'high'],
      ['ECOVADIS', 'EV-LHR-SD', 'KSSB', 'KSSB1-MET', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-LHR-CS', 'KSSB', 'KSSB1-STRAT', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-SP-POL', 'KSSB', 'KSSB1-RISK', 'indirect', 'medium'],
      ['ECOVADIS', 'EV-ENV-POL', 'KCGS', 'KCGS-ENV', 'direct', 'high'],
      ['ECOVADIS', 'EV-LHR-POL', 'KCGS', 'KCGS-SOC', 'direct', 'high'],
      ['ECOVADIS', 'EV-LHR-SD', 'KCGS', 'KCGS-SOC', 'direct', 'medium'],
      ['ECOVADIS', 'EV-LHR-CS', 'KCGS', 'KCGS-SOC', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-ETH-POL', 'KCGS', 'KCGS-GOV', 'direct', 'high'],
      ['ECOVADIS', 'EV-ENV-RES', 'NICE', 'NICE-ENV', 'direct', 'medium'],
      ['ECOVADIS', 'EV-LHR-RES', 'NICE', 'NICE-SOC', 'direct', 'medium'],
      ['ECOVADIS', 'EV-ETH-COR', 'NICE', 'NICE-GOV', 'direct', 'medium'],
      ['ECOVADIS', 'EV-ENV-OPS', 'K-ESG', 'KESG-E2', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-LHR-HR', 'K-ESG', 'KESG-S2', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-ETH-POL', 'K-ESG', 'KESG-G1', 'direct', 'high'],
      ['ECOVADIS', 'EV-SP-ENV', 'K-ESG', 'KESG-E1', 'indirect', 'low'],
      ['ECOVADIS', 'EV-ENV-ANO', 'K-ESG', 'KESG-E1', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-LHR-CS', 'K-ESG', 'KESG-S2', 'expanded', 'medium'],
      ['KSSB', 'KSSB2-MET', 'ECOVADIS', 'EV-ENV-OPS', 'direct', 'high'],
      ['KSSB', 'KSSB1-GOV', 'ECOVADIS', 'EV-ETH-POL', 'direct', 'high'],
      ['KCGS', 'KCGS-ENV', 'ECOVADIS', 'EV-ENV-RES', 'direct', 'medium'],
      ['KCGS', 'KCGS-SOC', 'ECOVADIS', 'EV-LHR-RES', 'direct', 'medium'],
      ['KCGS', 'KCGS-GOV', 'ECOVADIS', 'EV-ETH-COR', 'direct', 'medium']
    ]
    mappingData.forEach(([srcAuth, srcCode, tgtAuth, tgtCode, type, conf]) => {
      const src = findInd(srcAuth, srcCode)
      const tgt = findInd(tgtAuth, tgtCode)
      if (src && tgt) {
        d.indicatorMappings.push({
          id: _ts(),
          source_authority: srcAuth,
          source_indicator_id: src.id,
          target_authority: tgtAuth,
          target_indicator_id: tgt.id,
          mapping_type: type,
          confidence: conf
        })
      }
    })
  },

  _seedIndicatorsOnly() {
    const d = this._data
    const _ts = () => Date.now() + Math.random()
    const addGroup = (auth, code, name) => { const id = _ts(); d.indicatorGroups.push({ id, authority_code: auth, group_code: code, group_name: name, sort_order: d.indicatorGroups.length + 1 }); return id }
    const addInd = (gid, auth, code, name, pillar, opts = {}) => { d.indicators.push({ id: _ts(), group_id: gid, authority_code: auth, indicator_code: code, indicator_name: name, pillar, is_active: true, sort_order: d.indicators.length + 1, dept_code: '', review_cycle: 'annual', scope2_split_required: false, materiality_optional: false, ...opts }) }

    const evEnv = addGroup('ECOVADIS', 'ENV', '환경 (Environment)')
    const evLhr = addGroup('ECOVADIS', 'LHR', '노동·인권 (Labor & Human Rights)')
    const evEth = addGroup('ECOVADIS', 'ETH', '윤리 (Ethics)')
    const evSp = addGroup('ECOVADIS', 'SP', '지속가능한 조달 (Sustainable Procurement)')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-POL', '환경방침', 'POLICY')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-OPS', '사업장 운영 환경영향', 'ACTION', { scope2_split_required: true, materiality_optional: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-PRD', '제품 사용·폐기 영향', 'ACTION', { materiality_optional: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-CERT', '환경 인증(ISO14001 등)', 'ACTION')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-RES', '환경성과 보고', 'RESULT', { scope2_split_required: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-ANO', '대기·소음·악취', 'RESULT')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-POL', '인권·노동 정책', 'POLICY')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HRM', '인적자원관리', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-SD', '사회적 대화', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HR', '인권(노동법준수/다양성)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-CS', '경력·숙련도', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-CLL', '아동·강제노동 방지', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-RES', '노동·인권 성과 보고', 'RESULT')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-POL', '윤리·반부패 정책', 'POLICY')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COR', '부패방지 조치', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COMP', '공정경쟁', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-INFO', '정보관리 책임', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-ANT', '독점금지(공정거래)', 'ACTION')
    addInd(evSp, 'ECOVADIS', 'EV-SP-POL', '지속가능조달 정책', 'POLICY')
    addInd(evSp, 'ECOVADIS', 'EV-SP-ENV', '공급사 환경실사', 'ACTION')
    addInd(evSp, 'ECOVADIS', 'EV-SP-SOC', '공급사 사회실사', 'ACTION')
    addInd(evSp, 'ECOVADIS', 'EV-SP-RES', '조달 성과', 'RESULT')
    addInd(evSp, 'ECOVADIS', 'EV-360', '360° Watch', 'RESULT')

    const kssb1 = addGroup('KSSB', 'KSSB1', '일반사항 (제1호)')
    const kssb2 = addGroup('KSSB', 'KSSB2', '기후 (제2호)')
    addInd(kssb1, 'KSSB', 'KSSB1-GOV', '지속가능성 거버넌스', 'GOVERNANCE')
    addInd(kssb1, 'KSSB', 'KSSB1-STRAT', '지속가능성 전략', 'STRATEGY')
    addInd(kssb1, 'KSSB', 'KSSB1-RISK', '위험관리 절차', 'RISK_MGMT')
    addInd(kssb1, 'KSSB', 'KSSB1-MET', '지표 및 목표', 'METRICS')
    addInd(kssb2, 'KSSB', 'KSSB2-GOV', '기후 거버넌스', 'GOVERNANCE')
    addInd(kssb2, 'KSSB', 'KSSB2-STRAT', '기후 전략', 'STRATEGY')
    addInd(kssb2, 'KSSB', 'KSSB2-RISK', '기후 위험관리', 'RISK_MGMT')
    addInd(kssb2, 'KSSB', 'KSSB2-MET', 'Scope1/2/3 배출량', 'METRICS', { scope2_split_required: true })

    const kcgG = addGroup('KCGS', 'G', '지배구조')
    const kcgS = addGroup('KCGS', 'S', '사회')
    const kcgE = addGroup('KCGS', 'E', '환경')
    addInd(kcgG, 'KCGS', 'KCGS-GOV', '지배구조 공시', 'RESULT')
    addInd(kcgS, 'KCGS', 'KCGS-SOC', '사회 공시', 'RESULT')
    addInd(kcgE, 'KCGS', 'KCGS-ENV', '환경 공시', 'RESULT')

    const niceE = addGroup('NICE', 'E', '환경')
    const niceS = addGroup('NICE', 'S', '사회')
    const niceG = addGroup('NICE', 'G', '지배구조')
    addInd(niceE, 'NICE', 'NICE-ENV', '환경 공시', 'RESULT')
    addInd(niceS, 'NICE', 'NICE-SOC', '사회 공시', 'RESULT')
    addInd(niceG, 'NICE', 'NICE-GOV', '지배구조 공시', 'RESULT')

    const kesgE = addGroup('K-ESG', 'E', '환경')
    const kesgS = addGroup('K-ESG', 'S', '사회')
    const kesgG = addGroup('K-ESG', 'G', '지배구조')
    addInd(kesgE, 'K-ESG', 'KESG-E1', '환경경영', 'RESULT')
    addInd(kesgE, 'K-ESG', 'KESG-E2', '탄소중립', 'RESULT')
    addInd(kesgS, 'K-ESG', 'KESG-S1', '사회공헌', 'RESULT')
    addInd(kesgS, 'K-ESG', 'KESG-S2', '안전보건', 'RESULT')
    addInd(kesgG, 'K-ESG', 'KESG-G1', '윤리경영', 'RESULT')
    addInd(kesgG, 'K-ESG', 'KESG-G2', '정보공개', 'RESULT')

    const vsmeGen = addGroup('EU_VSME', 'General', '일반정보')
    const vsmeEnv = addGroup('EU_VSME', 'Environment', '환경')
    const vsmeSoc = addGroup('EU_VSME', 'Social', '사회')
    const vsmeGov = addGroup('EU_VSME', 'Governance', '거버넌스')
    addInd(vsmeGen, 'EU_VSME', 'VSME-B1', '기업개요·사업장', 'POLICY')
    addInd(vsmeEnv, 'EU_VSME', 'VSME-B2', '에너지·GHG 배출(기본모듈)', 'RESULT')
    addInd(vsmeSoc, 'EU_VSME', 'VSME-B3', '인력현황·안전보건(기본모듈)', 'RESULT')
    addInd(vsmeEnv, 'EU_VSME', 'VSME-C1', '전환계획·타겟(종합모듈, 선택)', 'STRATEGY')
    addInd(vsmeGov, 'EU_VSME', 'VSME-C2', '이해관계자 참여(종합모듈, 선택)', 'GOVERNANCE')
  },

  _emptyData() {
    return {
      users: [],
      assessments: [],
      assessmentItems: [],
      companies: [],
      departments: [],
      indicatorGroups: [],
      indicators: [],
      indicatorMappings: [],
      evidences: [],
      evidenceFiles: [],
      evidenceTags: [],
      evidenceExtractions: [],
      ghgFactors: [],
      ghgActivities: [],
      ghgSummary: [],
      aiDrafts: [],
      aiVerificationLogs: [],
      weightParams: [],
      ratingThresholds: [],
      suppliers: [],
      supplierRiskItems: [],
      supplierRiskActions: [],
      vsmeAssessments: [],
      maskingRules: [],
      projectBudget: [],
      riskRegister: [],
      agencyMaster: [],
      issa_assurance: null,
      submissions: [],
      notifications: [],
      autoTagRules: [],
      changeLogs: [],
      shareLinks: [],
      shareAccessLogs: [],
      capaItems: [],
      projectTasks: [],
      projectTaskLogs: [],
      auditLogs: [],
      apiEndpoints: [],
      apiDataLogs: [],
      benchmarks: null,
      referenceDocs: [],
      referenceChunks: [],
      reportDocs: [],
      reportDocSections: [],
      reportFeedback: []
    }
  },

  _seed() {
    const _ts = () => Date.now() + Math.random()
    const addGroup = (auth, code, name) => { const id = _ts(); this._data.indicatorGroups.push({ id, authority_code: auth, group_code: code, group_name: name, sort_order: this._data.indicatorGroups.length + 1 }); return id }
    const addInd = (gid, auth, code, name, pillar, opts = {}) => { this._data.indicators.push({ id: _ts(), group_id: gid, authority_code: auth, indicator_code: code, indicator_name: name, pillar, is_active: true, sort_order: this._data.indicators.length + 1, dept_code: '', review_cycle: 'annual', scope2_split_required: false, materiality_optional: false, ...opts }) }

    const evEnv = addGroup('ECOVADIS', 'ENV', '환경')
    const evLhr = addGroup('ECOVADIS', 'LHR', '노동·인권')
    const evEth = addGroup('ECOVADIS', 'ETH', '윤리')
    const evSp  = addGroup('ECOVADIS', 'SP',  '지속가능한 조달')

    addInd(evEnv, 'ECOVADIS', 'EV-ENV-POL',  '환경방침', 'POLICY')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-OPS',  '사업장 운영 환경영향(에너지·GHG·용수·생물다양성·오염)', 'ACTION', { scope2_split_required: true, materiality_optional: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-PRD',  '제품 사용·폐기 영향', 'ACTION', { materiality_optional: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-CERT', '환경 인증(ISO14001 등)', 'ACTION')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-RES',  '환경성과 보고', 'RESULT', { scope2_split_required: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-ANO',  '대기·소음·악취', 'RESULT')

    addInd(evLhr, 'ECOVADIS', 'EV-LHR-POL',  '인권·노동 정책', 'POLICY')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HRM',  '인적자원관리(재해예방/교육/근로조건)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-SD',   '사회적 대화(노사협의/직원참여)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HR',   '인권(노동법준수/다양성/차별금지)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-CS',   '경력·숙련도(직업훈련/역량개발)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-CLL',  '아동·강제노동 방지', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-RES',  '노동·인권 성과 보고', 'RESULT')

    addInd(evEth, 'ECOVADIS', 'EV-ETH-POL',  '윤리·반부패 정책', 'POLICY')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COR',  '부패방지 조치', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COMP', '공정경쟁(반경쟁행위 방지)', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-INFO', '정보관리 책임(정보보안)', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-ANT',  '독점금지(공정거래)', 'ACTION')

    addInd(evSp, 'ECOVADIS', 'EV-SP-POL',   '지속가능조달 정책', 'POLICY')
    addInd(evSp, 'ECOVADIS', 'EV-SP-ENV',   '공급사 환경실사', 'ACTION')
    addInd(evSp, 'ECOVADIS', 'EV-SP-SOC',   '공급사 사회(노동·인권)실사', 'ACTION')
    addInd(evSp, 'ECOVADIS', 'EV-SP-RES',   '조달 성과(커버리지/개선율)', 'RESULT')
    addInd(evSp, 'ECOVADIS', 'EV-360',      '360° Watch 외부 모니터링', 'RESULT')

    this._data.agencyMaster.push(
      { id: 1, code: 'ECOVADIS', name: 'EcoVadis', country: '프랑스', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '글로벌 공급망 ESG 평가' },
      { id: 2, code: 'KCGS', name: 'KCGS', country: '한국', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '한국기업지배구조원 ESG평가' },
      { id: 3, code: 'NICE', name: 'NICE', country: '한국', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: 'NICE 평가정보 ESG' },
      { id: 4, code: 'KSSB', name: 'KSSB', country: '한국', track_type: 'MANDATORY', disclosure_std_no: '제1호,제2호', effective_date: '2026-02-26', note: '한국지속가능성기준원 - 법정 공시' },
      { id: 5, code: 'ISSB', name: 'ISSB', country: '글로벌', track_type: 'MANDATORY', disclosure_std_no: 'IFRS S1,S2', effective_date: '2024-01-01', note: '국제지속가능성기준위원회' },
      { id: 6, code: 'CDP', name: 'CDP', country: '영국', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '환경정보 공개 플랫폼' },
      { id: 7, code: 'GRI', name: 'GRI', country: '네덜란드', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '지속가능경영 보고서 기준' },
      { id: 8, code: 'TCFD', name: 'TCFD', country: '글로벌', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '기후관련 재무정보 공시' },
      { id: 9, code: 'SBTi', name: 'SBTi', country: '글로벌', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '과학기반 감축목표' }
    )

    this._data.departments.push(
      { id: _ts(), dept_code: 'ESG', dept_name: 'ESG경영팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'ENV', dept_name: '환경팀', manager_name: '', manager_email: '', parent_dept: 'ESG', is_active: true },
      { id: _ts(), dept_code: 'HR',  dept_name: '인사팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'FIN', dept_name: '재무팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'PRD', dept_name: '생산팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'QAL', dept_name: '품질관리팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'PUR', dept_name: '구매팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'IT',  dept_name: 'IT팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'LAW', dept_name: '법무팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'SAF', dept_name: '안전보건팀', manager_name: '', manager_email: '', parent_dept: 'ENV', is_active: true },
      { id: _ts(), dept_code: 'GEN', dept_name: '총무팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true },
      { id: _ts(), dept_code: 'MKT', dept_name: '마케팅팀', manager_name: '', manager_email: '', parent_dept: '', is_active: true }
    )

    this._data.maskingRules.push(
      { id: 1, field_name: 'salary', masking_type: 'FULL', applies_to_ai_api: true },
      { id: 2, field_name: 'discipline_history', masking_type: 'FULL', applies_to_ai_api: true },
      { id: 3, field_name: 'whistleblower_name', masking_type: 'FULL', applies_to_ai_api: true },
      { id: 4, field_name: 'employee_name', masking_type: 'PARTIAL', applies_to_ai_api: true },
      { id: 5, field_name: 'contract_amount', masking_type: 'AGGREGATE_ONLY', applies_to_ai_api: false }
    )

    const kssb1Id = addGroup('KSSB', 'KSSB1', '일반사항 (제1호)')
    const kssb2Id = addGroup('KSSB', 'KSSB2', '기후 (제2호)')
    const kcgGId  = addGroup('KCGS', 'G', '지배구조')
    const kcgSId  = addGroup('KCGS', 'S', '사회')
    const kcgEId  = addGroup('KCGS', 'E', '환경')
    const niceEId = addGroup('NICE', 'E', '환경')
    const niceSId = addGroup('NICE', 'S', '사회')
    const niceGId = addGroup('NICE', 'G', '지배구조')
    const kesgEId = addGroup('K-ESG', 'E', '환경')
    const kesgSId = addGroup('K-ESG', 'S', '사회')
    const kesgGId = addGroup('K-ESG', 'G', '지배구조')

    addInd(kssb1Id, 'KSSB', 'KSSB1-GOV',   '지속가능성 관련 거버넌스', 'GOVERNANCE')
    addInd(kssb1Id, 'KSSB', 'KSSB1-STRAT', '지속가능성 관련 전략·재무영향', 'STRATEGY')
    addInd(kssb1Id, 'KSSB', 'KSSB1-RISK',  '지속가능성 위험관리 절차', 'RISK_MGMT')
    addInd(kssb1Id, 'KSSB', 'KSSB1-MET',   '지속가능성 지표 및 목표', 'METRICS')

    addInd(kssb2Id, 'KSSB', 'KSSB2-GOV',   '기후 관련 거버넌스', 'GOVERNANCE')
    addInd(kssb2Id, 'KSSB', 'KSSB2-STRAT', '기후 관련 전략·재무영향', 'STRATEGY')
    addInd(kssb2Id, 'KSSB', 'KSSB2-RISK',  '기후 위험관리 절차', 'RISK_MGMT')
    addInd(kssb2Id, 'KSSB', 'KSSB2-MET',   'Scope1/2/3 배출량 등 기후지표·목표', 'METRICS', { scope2_split_required: true })

    addInd(kcgGId, 'KCGS', 'KCGS-GOV', '지배구조 부문 공시자료', 'RESULT')
    addInd(kcgSId, 'KCGS', 'KCGS-SOC', '사회 부문 공시자료', 'RESULT')
    addInd(kcgEId, 'KCGS', 'KCGS-ENV', '환경 부문 공시자료', 'RESULT')

    addInd(niceEId, 'NICE', 'NICE-ENV', '환경 부문 공시자료', 'RESULT')
    addInd(niceSId, 'NICE', 'NICE-SOC', '사회 부문 공시자료', 'RESULT')
    addInd(niceGId, 'NICE', 'NICE-GOV', '지배구조 부문 공시자료', 'RESULT')

    addInd(kesgEId, 'K-ESG', 'KESG-E1', '환경경영', 'RESULT')
    addInd(kesgEId, 'K-ESG', 'KESG-E2', '탄소중립', 'RESULT')
    addInd(kesgSId, 'K-ESG', 'KESG-S1', '사회공헌', 'RESULT')
    addInd(kesgSId, 'K-ESG', 'KESG-S2', '안전보건', 'RESULT')
    addInd(kesgGId, 'K-ESG', 'KESG-G1', '윤리경영', 'RESULT')
    addInd(kesgGId, 'K-ESG', 'KESG-G2', '정보공개', 'RESULT')

    this._data.weightParams.push(
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'ENV', weight: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'LHR', weight: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'ETH', weight: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: 'SP',  weight: 25, year: 2026 },
      { id: _ts(), authority_code: 'KSSB',     theme_code: 'KSSB', weight: 100, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: '_PILLAR', pillar: 'POLICY', weight: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: '_PILLAR', pillar: 'ACTION', weight: 40, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', theme_code: '_PILLAR', pillar: 'RESULT', weight: 35, year: 2026 }
    )
    this._data.ratingThresholds.push(
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Platinum', min_score: 82, max_score: 100, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Gold', min_score: 72, max_score: 81.99, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Silver', min_score: 63, max_score: 71.99, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Bronze', min_score: 54, max_score: 62.99, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'KSSB', rating: '우수', min_score: 80, max_score: 100, year: 2026, effective_from: '2026-02-26' },
      { id: _ts(), authority_code: 'KSSB', rating: '양호', min_score: 60, max_score: 79, year: 2026, effective_from: '2026-02-26' },
      { id: _ts(), authority_code: 'KSSB', rating: '보통', min_score: 40, max_score: 59, year: 2026, effective_from: '2026-02-26' },
      { id: _ts(), authority_code: 'KSSB', rating: '미흡', min_score: 0, max_score: 39, year: 2026, effective_from: '2026-02-26' }
    )

    const sampleAssId = Date.now() + 900
    this._data.assessments.push({
      id: sampleAssId,
      title: '2026 EcoVadis ESG 평가 (샘플)',
      assessment_year: 2026,
      authority_code: 'ECOVADIS',
      status: 'in_review',
      total_score: 65.3,
      rating: 'Silver',
      createdAt: new Date().toISOString()
    })

    const evInds = this._data.indicators.filter(i => i.authority_code === 'ECOVADIS')
    const sampleScores = [72, 65, 58, 55, 48, 78, 72, 68, 82, 70, 65, 60, 78, 85, 68, 72, 55, 62]
    evInds.forEach((ind, idx) => {
      this._data.assessmentItems.push({
        id: _ts(), assessment_id: sampleAssId, indicator_id: ind.id,
        score: sampleScores[idx] || 50, weight: 1.0,
        narrative: '', target_value: '', actual_value: '',
        status: idx < 15 ? 'completed' : 'in_progress'
      })
    })

    this._seedIndicatorMappings()

    const evIds = []
    ;[
      { title: '환경경영 정책서 (2026)', file_type: 'pdf', status: 'externally_verified' },
      { title: 'Scope 1,2 온실가스 배출량 보고서', file_type: 'xlsx', status: 'internal_reviewed' },
      { title: '에너지 사용량 월별 집계표', file_type: 'xlsx', status: 'self' },
      { title: '산업안전보건 교육 이수증', file_type: 'pdf', status: 'externally_verified' },
      { title: '윤리경영 규범 및 신고절차', file_type: 'pdf', status: 'externally_verified' },
      { title: '협력사 ESG 평가 결과표', file_type: 'xlsx', status: 'internal_reviewed' },
      { title: '근로계약서 사본 (전 직원)', file_type: 'pdf', status: 'self' },
      { title: '폐기물 처리 계약서', file_type: 'pdf', status: 'internal_reviewed' }
    ].forEach((e, idx) => {
      const eid = Date.now() + 950 + idx
      evIds.push(eid)
      this._data.evidences.push({
        id: eid, assessment_id: sampleAssId, title: e.title,
        description: '', file_url: '', file_type: e.file_type, file_size: 0,
        status: e.status, notes: '', uploaded_by: null,
        expiry_date: '', contains_sensitive_data: false,
        reuse_linked_indicators: [], upload_count_flag: false,
        uploaded_at: new Date().toISOString()
      })
    })

    if (evInds.length >= 18 && evIds.length >= 8) {
      this._data.evidenceTags.push(
        { id: _ts(), evidence_id: evIds[0], indicator_id: evInds[0].id },
        { id: _ts(), evidence_id: evIds[1], indicator_id: evInds[0].id },
        { id: _ts(), evidence_id: evIds[2], indicator_id: evInds[1].id },
        { id: _ts(), evidence_id: evIds[3], indicator_id: evInds[7].id },
        { id: _ts(), evidence_id: evIds[4], indicator_id: evInds[9].id },
        { id: _ts(), evidence_id: evIds[5], indicator_id: evInds[13].id },
        { id: _ts(), evidence_id: evIds[6], indicator_id: evInds[5].id },
        { id: _ts(), evidence_id: evIds[7], indicator_id: evInds[2].id }
      )
    }

    this._data.aiDrafts.push({
      id: _ts(), assessment_id: sampleAssId,
      indicator_id: evInds[0]?.id, version: 1,
      draft_text: '회사는 에너지 소비 및 온실가스 배출 관리를 위한 정책을 수립하고 있으며, 연간 에너지 사용량 및 GHG 배출량을 측정하고 있습니다.',
      evidence_ids: evIds.slice(0, 2).map(String),
      cited_evidence_ids: evIds.slice(0, 2).map(String),
      confidence: 'HIGH', masked_before_send: true,
      ver_status: 'pass', ver_result: { claims: [{ text: '에너지 정책 보유', status: 'SUPPORTED', evidence_ref: String(evIds[0]) }] },
      ver_date: new Date().toISOString(),
      human_status: 'pending', human_reviewer: null, human_reviewed_at: null, human_feedback: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    })

    this._data.projectBudget.push(
      { id: _ts(), project_name: 'Smart ESG 시스템 구축', category: 'system', planned_amount: 50000000, actual_amount: 35000000, status: 'in_progress', start_date: '2026-01-01', end_date: '2026-12-31', notes: '' },
      { id: _ts(), project_name: 'ESG 교육 컨설팅', category: 'consulting', planned_amount: 15000000, actual_amount: 8000000, status: 'in_progress', start_date: '2026-03-01', end_date: '2026-09-30', notes: '' },
      { id: _ts(), project_name: 'GHG 측정 시스템 도입', category: 'system', planned_amount: 20000000, actual_amount: 0, status: 'planned', start_date: '2026-06-01', end_date: '2026-12-31', notes: '' }
    )

    this._data.riskRegister.push(
      { id: _ts(), risk_name: '탄소세 도입 리스크', category: 'climate', description: 'EU CBAM 등 탄소 국경세 도입에 따른 비용 증가', probability: 4, impact: 5, status: 'mitigating', owner: '환경팀', mitigation_plan: 'Scope 1,2 감축 로드맵 수립', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: _ts(), risk_name: '공급망 인권 리스크', category: 'supply_chain', description: '협력사 인권 침해 이슈 발생 가능성', probability: 3, impact: 4, status: 'identified', owner: '구매팀', mitigation_plan: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: _ts(), risk_name: '데이터 유출 리스크', category: 'governance', description: 'ESG 데이터 관리 부실로 인한 정보 유출', probability: 2, impact: 5, status: 'identified', owner: 'IT팀', mitigation_plan: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    )

    this._data.suppliers.push(
      { id: _ts(), name: '그린텍(주)', industry: '제조업', ceo: '김철수', employee_count: 120, revenue: 5000, phone: '02-1234-5678', email: 'contact@greentech.kr', last_vsme_grade: 'B', last_vsme_score: 72, last_vsme_date: '2026-03-15', created_at: new Date().toISOString() },
      { id: _ts(), name: '에코솔루션', industry: '환경서비스', ceo: '이영희', employee_count: 45, revenue: 2000, phone: '031-987-6543', email: 'info@ecosol.kr', last_vsme_grade: 'A', last_vsme_score: 85, last_vsme_date: '2026-04-20', created_at: new Date().toISOString() },
      { id: _ts(), name: '스마트물산', industry: '도매업', ceo: '박지민', employee_count: 200, revenue: 12000, phone: '051-555-1234', email: 'smart@smartmul.kr', last_vsme_grade: 'C', last_vsme_score: 48, last_vsme_date: '2026-02-10', created_at: new Date().toISOString() }
    )

    this._seedAutoTagRules()

    this._save()
  },

  _save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this._data))
    this._notify()
    this._sbSync()
  },

  _fmtSbError(e) {
    if (!e) return 'unknown'
    return [e.code, e.message, e.details, e.hint].filter(Boolean).join(' | ')
  },

  _buildSyncPayload(rows, cols, table) {
    const byId = new Map()
    const window = rows.slice(-200)
    let fallback = 0
    for (const row of window) {
      const out = {}
      cols.forEach(c => {
        if (c === 'id') return
        const v = row[c]
        if (v == null || v === '') { out[c] = null; return }
        if (typeof v === 'number' || typeof v === 'boolean') { out[c] = v; return }
        if (Array.isArray(v)) { out[c] = v.map(x => typeof x === 'number' ? String(x) : x); return }
        if (c.endsWith('_id')) { out[c] = String(v); return }
        out[c] = v
      })
      let id
      if (row.id != null) id = String(row.id)
      else id = String(row.code || row.field_name || row.dept_code || row.indicator_code || row.username || (table + '_' + (fallback++)))
      out.id = id
      byId.set(id, out)
    }
    return [...byId.values()]
  },

  async _sbSync() {
    const sb = getSupabase ? getSupabase() : null
    if (!sb) return
    const now = Date.now()
    if (this._lastSync && now - this._lastSync < 3000) return
    this._lastSync = now
    const deleted = this._getDeletedIds()
    const errors = []
    for (const table of Object.keys(SB_SYNC_MAP)) {
      const [tb, cols] = SB_SYNC_MAP[table]
      try {
        if (deleted[table]?.length) {
          const { error: delErr } = await sb.from(tb).delete().in('id', deleted[table].map(String))
          if (delErr) {
            console.error(`[sbSync] DELETE ${tb}`, this._fmtSbError(delErr))
            errors.push({ table: tb, op: 'delete', err: this._fmtSbError(delErr) })
          } else deleted[table] = []
        }
        const rows = this._data[table]
        if (rows?.length) {
          const payload = this._buildSyncPayload(rows, cols, table)
          const { error } = await sb.from(tb).upsert(payload, { onConflict: 'id' })
          if (error) {
            console.error(`[sbSync] UPSERT ${tb} (${payload.length}행)`, this._fmtSbError(error))
            console.error(`[sbSync] ${tb} 첫 행 예시`, JSON.stringify(payload[0]).slice(0, 400))
            errors.push({ table: tb, op: 'upsert', rows: payload.length, err: this._fmtSbError(error) })
            for (let i = 0; i < payload.length; i++) {
              const { error: e2 } = await sb.from(tb).upsert([payload[i]], { onConflict: 'id' })
              if (e2) {
                console.error(`[sbSync] ${tb} 개별행 #${i} 실패`, this._fmtSbError(e2), JSON.stringify(payload[i]).slice(0, 400))
                errors.push({ table: tb, op: 'row', row: i, err: this._fmtSbError(e2) })
                break
              }
            }
          }
        }
      } catch (e) { console.error(`[sbSync] ${tb} 예외`, e && e.message) }
    }
    this._lastSyncErrors = errors
    if (typeof window !== 'undefined' && errors.length && typeof window.renderSupabaseStatus === 'function') {
      try { window.renderSupabaseStatus() } catch (_) {}
    }
    if (Object.keys(deleted).some(k => deleted[k]?.length)) {
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(deleted))
    }
  },

  async diagnoseSupabase() {
    const sb = getSupabase ? getSupabase() : null
    if (!sb) { console.warn('Supabase 미연결 (getSupabase 없음)'); return null }
    const report = {}
    for (const table of Object.keys(SB_SYNC_MAP)) {
      const [tb] = SB_SYNC_MAP[table]
      const { error, count } = await sb.from(tb).select('id', { count: 'exact', head: true })
      report[tb] = error ? this._fmtSbError(error) : `OK (행 ${count == null ? '?' : count})`
    }
    console.table(report)
    console.log(JSON.stringify(report, null, 2))
    return report
  },

  _notify() {
    this._listeners.forEach(fn => fn(this._data))
  },

  subscribe(fn) {
    this._listeners.push(fn)
    return () => { this._listeners = this._listeners.filter(f => f !== fn) }
  },

  // ==== Users ====
  getUsers() { return this.data.users },
  addUser(user) { this.data.users.push({ id: Date.now(), ...user, company_id: user.company_id || null, dept_code: user.dept_code || '', position: user.position || '', createdAt: new Date().toISOString() }); this._save(); return user },
  updateUser(id, updates) { const i = this.data.users.findIndex(u => u.id === id); if (i > -1) { Object.assign(this.data.users[i], updates); this._save() } },
  deleteUser(id) { this.data.users = this.data.users.filter(u => u.id !== id); this._addDeletedId('users', id); this._save() },

  // ==== Companies ====
  getCompanies() { return this.data.companies },
  addCompany(c) { this.data.companies.push({ id: Date.now(), ...c, createdAt: new Date().toISOString() }); this._save(); return c },
  updateCompany(id, updates) { const i = this.data.companies.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.companies[i], updates); this._save() } },
  deleteCompany(id) { this.data.companies = this.data.companies.filter(x => x.id !== id); this._addDeletedId('companies', id); this._save() },

  // ==== Departments ====
  getDepartments() { return this.data.departments || [] },
  getDepartmentByCode(code) { return (this.data.departments || []).find(d => d.dept_code === code) },
  addDepartment(d) { this.data.departments.push({ id: Date.now(), ...d, created_at: new Date().toISOString() }); this._save(); return d },
  updateDepartment(id, updates) { const i = this.data.departments.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.departments[i], updates); this._save() } },
  deleteDepartment(id) { this.data.departments = this.data.departments.filter(x => x.id !== id); this._save() },

  // ==== Assessments ====
  getAssessments() { return this.data.assessments },
  addAssessment(a) { this.data.assessments.push({ id: Date.now(), ...a, createdAt: new Date().toISOString() }); this._save(); return a },
  updateAssessment(id, updates) { const i = this.data.assessments.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.assessments[i], updates); this._save() } },
  deleteAssessment(id) { this.data.assessments = this.data.assessments.filter(x => x.id !== id); this._addDeletedId('assessments', id); this._save() },

  // ==== Assessment Items ====
  getAssessmentItems() { return this.data.assessmentItems },
  addAssessmentItem(item) { this.data.assessmentItems.push({ id: Date.now(), evidence_ids: [], due_date: item.due_date || null, assignee_id: item.assignee_id || null, ...item }); this._save(); return item },
  updateAssessmentItem(id, updates) { const i = this.data.assessmentItems.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.assessmentItems[i], updates); this._save() } },
  deleteAssessmentItem(id) { this.data.assessmentItems = this.data.assessmentItems.filter(x => x.id !== id); this._save() },

  // ==== Indicator Groups ====
  getIndicatorGroups() { return this.data.indicatorGroups },
  addIndicatorGroup(g) { this.data.indicatorGroups.push({ id: Date.now(), ...g }); this._save(); return g },
  updateIndicatorGroup(id, updates) { const i = this.data.indicatorGroups.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.indicatorGroups[i], updates); this._save() } },
  deleteIndicatorGroup(id) { this.data.indicatorGroups = this.data.indicatorGroups.filter(x => x.id !== id); this._addDeletedId('indicatorGroups', id); this._save() },

  // ==== Indicators ====
  getIndicators() { return this.data.indicators },
  addIndicator(ind) {
    if (!ind.indicator_code) {
      const prefix = { ECOVADIS: 'EV', KSSB: 'KSSB', KCGS: 'KCGS', NICE: 'NICE', 'K-ESG': 'KESG' }[ind.authority_code] || 'IND'
      const existing = this.data.indicators.filter(i => i.authority_code === ind.authority_code)
      ind.indicator_code = `${prefix}-${String(existing.length + 1).padStart(3, '0')}`
    }
    this.data.indicators.push({ id: Date.now(), dept_code: '', review_cycle: '연1회', ...ind })
    this._save()
    return ind
  },
  updateIndicator(id, updates) { const i = this.data.indicators.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.indicators[i], updates); this._save() } },
  deleteIndicator(id) { this.data.indicators = this.data.indicators.filter(x => x.id !== id); this._addDeletedId('indicators', id); this._save() },

  // ==== Indicator Mappings ====
  getIndicatorMappings() { return this.data.indicatorMappings },
  addIndicatorMapping(m) { this.data.indicatorMappings.push({ id: Date.now(), ...m }); this._save(); return m },
  deleteIndicatorMapping(id) { this.data.indicatorMappings = this.data.indicatorMappings.filter(x => x.id !== id); this._save() },

  // ==== Evidences ====
  getEvidences() { return this.data.evidences },
  addEvidence(e) { this.data.evidences.push({ id: Date.now(), expiry_date: '', contains_sensitive_data: false, assignee: '', department: '', task_type: '', due_date: '', start_date: '', priority: '보통', progress: 0, ...e }); this._save(); return e },
  updateEvidence(id, updates) { const i = this.data.evidences.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.evidences[i], updates); this._save() } },
  deleteEvidence(id) { this.data.evidences = this.data.evidences.filter(x => x.id !== id); this.data.evidenceFiles = this.data.evidenceFiles.filter(f => f.evidence_id !== id); this._addDeletedId('evidences', id); this._save() },

  // ==== Evidence Tags ====
  getEvidenceTags() { return this.data.evidenceTags },
  addEvidenceTag(t) { this.data.evidenceTags.push({ id: Date.now(), ...t }); this._save(); return t },
  removeEvidenceTag(evidenceId, indicatorId) {
    this.data.evidenceTags = this.data.evidenceTags.filter(x => !(x.evidence_id === evidenceId && x.indicator_id === indicatorId))
    this._save()
  },

  // ==== Evidence Extractions (자동 추출) ====
  getExtraction(evidenceId) { return (this.data.evidenceExtractions || []).find(e => e.evidence_id === evidenceId) },
  getExtractionsByHash(hash) { return (this.data.evidenceExtractions || []).filter(e => e.file_hash === hash) },
  addExtraction(data) {
    const ext = { id: Date.now(), extraction_status: 'PENDING', confidence_score: 0, created_at: new Date().toISOString(), ...data }
    if (!this.data.evidenceExtractions) this.data.evidenceExtractions = []
    this.data.evidenceExtractions.push(ext)
    this._save()
    return ext
  },
  updateExtraction(evidenceId, updates) {
    const i = (this.data.evidenceExtractions || []).findIndex(e => e.evidence_id === evidenceId)
    if (i > -1) { Object.assign(this.data.evidenceExtractions[i], updates); this._save() }
  },
  getDuplicateHash(hash, excludeEvidenceId) {
    return (this.data.evidenceExtractions || []).find(e => e.file_hash === hash && e.evidence_id !== excludeEvidenceId)
  },
  deleteExtraction(id) {
    if (!id) return
    this.data.evidenceExtractions = (this.data.evidenceExtractions || []).filter(e => e.id !== id)
    this._save()
  },

  addChangeLog(tableName, recordId, fieldName, oldValue, newValue, actionType, changedBy) {
    const log = { id: Date.now() + Math.random(), table_name: tableName, record_id: String(recordId), field_name: fieldName || null, old_value: oldValue != null ? String(oldValue) : null, new_value: newValue != null ? String(newValue) : null, action_type: actionType, changed_by: changedBy || 'system', changed_at: new Date().toISOString() }
    if (!this.data.changeLogs) this.data.changeLogs = []
    this.data.changeLogs.push(log)
    this._save()
    return log
  },
  getChangeLogs(tableName, recordId) {
    return (this.data.changeLogs || []).filter(l => l.table_name === tableName && l.record_id === String(recordId)).sort((a, b) => new Date(b.changed_at) - new Date(a.changed_at))
  },

  addShareLink(resourceType, resourceId, sharedWith, permission, expiresAt, createdBy) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')
    const link = { id: Date.now() + Math.random(), resource_type: resourceType, resource_id: String(resourceId), share_token: token, shared_with: sharedWith || '', permission: permission || 'VIEW_ONLY', expires_at: expiresAt || null, created_by: createdBy || 'user', created_at: new Date().toISOString(), revoked_at: null }
    if (!this.data.shareLinks) this.data.shareLinks = []
    this.data.shareLinks.push(link)
    this._save()
    return link
  },
  getShareLinks(resourceType, resourceId) {
    return (this.data.shareLinks || []).filter(l => l.resource_type === resourceType && (!resourceId || l.resource_id === String(resourceId)))
  },
  revokeShareLink(id) {
    const link = (this.data.shareLinks || []).find(l => l.id === id)
    if (link) { link.revoked_at = new Date().toISOString(); this._save() }
  },
  getShareLinkByToken(token) {
    return (this.data.shareLinks || []).find(l => l.share_token === token && !l.revoked_at)
  },
  logShareAccess(shareId, ipHint) {
    if (!this.data.shareAccessLogs) this.data.shareAccessLogs = []
    this.data.shareAccessLogs.push({ id: Date.now() + Math.random(), share_id: shareId, accessed_at: new Date().toISOString(), ip_hint: ipHint || '' })
    this._save()
  },
  getShareAccessLogs(shareId) {
    return (this.data.shareAccessLogs || []).filter(l => l.share_id === shareId)
  },

  addCapaItem(data) {
    const item = { id: Date.now(), status: 'open', created_at: new Date().toISOString(), ...data }
    if (!this.data.capaItems) this.data.capaItems = []
    this.data.capaItems.push(item)
    this._save()
    return item
  },
  getCapaItems(assessmentId) {
    return (this.data.capaItems || []).filter(c => !assessmentId || c.assessment_id === assessmentId)
  },
  updateCapaItem(id, updates) {
    const item = (this.data.capaItems || []).find(c => c.id === id)
    if (item) { Object.assign(item, updates, { updated_at: new Date().toISOString() }); this._save() }
  },
  completeCapaWithEvidence(capaId, evidenceData) {
    const capa = (this.data.capaItems || []).find(c => c.id === capaId)
    if (!capa) return null
    this.updateCapaItem(capaId, { status: 'completed', completed_at: new Date().toISOString() })
    const evidence = { id: Date.now(), assessment_id: capa.assessment_id, title: `[CAPA] ${capa.title || '개선조치 완료'}`, file_type: evidenceData?.file_type || 'etc', status: 'self', contains_sensitive_data: false, uploaded_at: new Date().toISOString(), ...evidenceData }
    this.addEvidence(evidence)
    if (capa.indicator_id) {
      this.addEvidenceTag({ evidence_id: evidence.id, indicator_id: capa.indicator_id, is_primary: false })
    }
    return evidence
  },

  // ==== Evidence Files (다중파일) ====
  getEvidenceFiles(evidenceId) { return (this.data.evidenceFiles || []).filter(f => f.evidence_id === evidenceId) },
  addEvidenceFile(f) { this.data.evidenceFiles.push({ id: Date.now(), ...f, uploaded_at: new Date().toISOString() }); this._save(); return f },
  deleteEvidenceFile(id) { this.data.evidenceFiles = this.data.evidenceFiles.filter(f => f.id !== id); this._save() },
  deleteEvidenceFilesByEvidence(evidenceId) { this.data.evidenceFiles = this.data.evidenceFiles.filter(f => f.evidence_id !== evidenceId); this._save() },

  // ==== Project Tasks ====
  getProjectTasks() { return this.data.projectTasks || [] },
  addProjectTask(t) { const task = { id: Date.now(), title: '', description: '', category: '일반', assignee: '', assignee_id: null, department: '', dept_code: '', priority: '보통', status: '대기', start_date: '', due_date: '', progress: 0, tags: [], linked_type: '', linked_id: null, repeat: 'none', repeat_until: '', depends_on: [], comments: [], created_at: new Date().toISOString(), ...t }; this.data.projectTasks.push(task); this._logProjectTask(task.id, '생성', '', '', task.title); this._save(); return task },
  updateProjectTask(id, updates) { const i = (this.data.projectTasks || []).findIndex(x => x.id === id); if (i > -1) { const old = { ...this.data.projectTasks[i] }; Object.assign(this.data.projectTasks[i], updates); if (updates.status && updates.status !== old.status) this._logProjectTask(id, '상태변경', old.status, updates.status); if (updates.progress != null && updates.progress !== old.progress) this._logProjectTask(id, '진행률', old.progress + '%', updates.progress + '%'); if (updates.assignee && updates.assignee !== old.assignee) this._logProjectTask(id, '담당자변경', old.assignee, updates.assignee); this._save() } },
  deleteProjectTask(id) { this.data.projectTasks = (this.data.projectTasks || []).filter(x => x.id !== id); this.data.projectTaskLogs = (this.data.projectTaskLogs || []).filter(x => x.task_id !== id); this._save() },
  _logProjectTask(taskId, action, from, to, detail) { if (!this.data.projectTaskLogs) this.data.projectTaskLogs = []; this.data.projectTaskLogs.push({ id: Date.now() + Math.random(), task_id: taskId, user_id: null, action, from_value: String(from), to_value: String(to), detail: detail || '', created_at: new Date().toISOString() }) },
  getProjectTaskLogs(taskId) { return (this.data.projectTaskLogs || []).filter(l => l.task_id === taskId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) },

  // ==== Project Task Comments ====
  addProjectTaskComment(taskId, text, userId, userName) { const i = (this.data.projectTasks || []).findIndex(x => x.id === taskId); if (i > -1) { if (!this.data.projectTasks[i].comments) this.data.projectTasks[i].comments = []; this.data.projectTasks[i].comments.push({ id: Date.now(), user_id: userId, user_name: userName, text, created_at: new Date().toISOString() }); this._logProjectTask(taskId, '코멘트', '', text); this._save() } },

  // ==== GHG Factors ====
  getGHGFactors() { return this.data.ghgFactors },
  addGHGFactor(f) { this.data.ghgFactors.push({ id: Date.now(), ...f }); this._save(); return f },
  deleteGHGFactor(id) { this.data.ghgFactors = this.data.ghgFactors.filter(x => x.id !== id); this._save() },

  // ==== Audit Logs ====
  addAuditLog(log) { const entry = { id: Date.now() + Math.random(), ...log, created_at: new Date().toISOString() }; if (!this.data.auditLogs) this.data.auditLogs = []; this.data.auditLogs.push(entry); this._save(); return entry },
  getAuditLogs(filter) { let logs = (this.data.auditLogs || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); if (filter?.category) logs = logs.filter(l => l.category === filter.category); if (filter?.user_id) logs = logs.filter(l => l.user_id === filter.user_id); if (filter?.date_from) logs = logs.filter(l => l.created_at >= filter.date_from); if (filter?.date_to) logs = logs.filter(l => l.created_at <= filter.date_to + 'T23:59:59'); return logs },

  // ==== GHG Activities ====
  getGHGActivities() { return this.data.ghgActivities },
  addGHGActivity(a) { this.data.ghgActivities.push({ id: Date.now(), dept_code: '', evidence_id: null, calculated_emission: 0, ...a }); this._save(); return a },
  updateGHGActivity(id, updates) { const i = this.data.ghgActivities.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.ghgActivities[i], updates); this._save() } },
  deleteGHGActivity(id) { this.data.ghgActivities = this.data.ghgActivities.filter(x => x.id !== id); this._save() },

  // ==== GHG Summary ====
  getGHGSummary() { return this.data.ghgSummary || [] },
  upsertGHGSummary(year, data) {
    const existing = (this.data.ghgSummary || []).find(s => s.report_year === year)
    if (existing) Object.assign(existing, data)
    else { if (!this.data.ghgSummary) this.data.ghgSummary = []; this.data.ghgSummary.push({ report_year: year, verification_status: 'self', ...data }) }
    this._save()
  },

  // ==== AI Drafts ====
  getAIDrafts() { return this.data.aiDrafts },
  addAIDraft(d) { this.data.aiDrafts.push({ id: Date.now(), masked_before_send: true, ...d }); this._save(); return d },
  updateAIDraft(id, updates) { const i = this.data.aiDrafts.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.aiDrafts[i], updates); this._save() } },
  deleteAIDraft(id) { this.data.aiDrafts = this.data.aiDrafts.filter(x => x.id !== id); this._save() },

  // ==== AI Verification Logs ====
  getAIVerificationLogs() { return this.data.aiVerificationLogs },
  addAIVerificationLog(l) { this.data.aiVerificationLogs.push({ id: Date.now(), ...l }); this._save(); return l },

  // ==== Weight Params ====
  getWeightParams() { return this.data.weightParams },
  addWeightParam(p) { this.data.weightParams.push({ id: Date.now(), ...p }); this._save(); return p },
  updateWeightParam(id, updates) { const i = this.data.weightParams.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.weightParams[i], updates); this._save() } },
  deleteWeightParam(id) { this.data.weightParams = this.data.weightParams.filter(x => x.id !== id); this._save() },

  // ==== Rating Thresholds ====
  getRatingThresholds() { return this.data.ratingThresholds },
  addRatingThreshold(t) { this.data.ratingThresholds.push({ id: Date.now(), ...t }); this._save(); return t },
  updateRatingThreshold(id, updates) { const i = this.data.ratingThresholds.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.ratingThresholds[i], updates); this._save() } },
  deleteRatingThreshold(id) { this.data.ratingThresholds = this.data.ratingThresholds.filter(x => x.id !== id); this._save() },

  // ==== Masking Rules ====
  getMaskingRules() { return this.data.maskingRules || [] },
  addMaskingRule(r) { this.data.maskingRules.push({ id: Date.now(), ...r }); this._save(); return r },
  updateMaskingRule(id, updates) { const i = this.data.maskingRules.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.maskingRules[i], updates); this._save() } },
  deleteMaskingRule(id) { this.data.maskingRules = this.data.maskingRules.filter(x => x.id !== id); this._save() },

  // ==== Project Budget ====
  getProjectBudget() { return this.data.projectBudget || [] },
  addProjectBudget(b) { this.data.projectBudget.push({ id: Date.now(), ...b }); this._save(); return b },
  updateProjectBudget(id, updates) { const i = this.data.projectBudget.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.projectBudget[i], updates); this._save() } },
  deleteProjectBudget(id) { this.data.projectBudget = this.data.projectBudget.filter(x => x.id !== id); this._save() },

  // ==== Risk Register ====
  getRiskRegister() { return this.data.riskRegister || [] },
  addRiskRegister(r) { this.data.riskRegister.push({ id: Date.now(), ...r, created_at: new Date().toISOString() }); this._save(); return r },
  updateRiskRegister(id, updates) { const i = this.data.riskRegister.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.riskRegister[i], updates); this._save() } },
  deleteRiskRegister(id) { this.data.riskRegister = this.data.riskRegister.filter(x => x.id !== id); this._save() },

  // ==== Reference Docs (참고자료 라이브러리) ====
  getReferenceDocs() { return this.data.referenceDocs || [] },
  getReferenceDoc(id) { return (this.data.referenceDocs || []).find(d => d.id === id) },
  addReferenceDoc(doc) { const rec = { id: Date.now(), status: 'pending', tags: [], chunk_count: 0, created_at: new Date().toISOString(), ...doc }; this.data.referenceDocs.push(rec); this._save(); return rec },
  updateReferenceDoc(id, updates) { const i = (this.data.referenceDocs || []).findIndex(d => d.id === id); if (i > -1) { Object.assign(this.data.referenceDocs[i], updates, { updated_at: new Date().toISOString() }); this._save() } return this.getReferenceDoc(id) },
  deleteReferenceDoc(id) { this.data.referenceDocs = (this.data.referenceDocs || []).filter(d => d.id !== id); this.data.referenceChunks = (this.data.referenceChunks || []).filter(c => c.reference_id !== id); this._addDeletedId('referenceDocs', id); this._save() },

  // ==== Reference Chunks (검색 인덱스) ====
  getReferenceChunks(referenceId) { const all = this.data.referenceChunks || []; return referenceId == null ? all : all.filter(c => c.reference_id === referenceId) },
  replaceReferenceChunks(referenceId, chunks) {
    this.data.referenceChunks = (this.data.referenceChunks || []).filter(c => c.reference_id !== referenceId)
    chunks.forEach((c, idx) => this.data.referenceChunks.push({ id: Date.now() + idx, reference_id: referenceId, ...c }))
    this._save()
  },

  // ==== Report Docs (작성 중 보고서) ====
  getReportDocs() { return this.data.reportDocs || [] },
  getReportDoc(id) { return (this.data.reportDocs || []).find(d => d.id === id) },
  addReportDoc(doc) { const rec = { id: Date.now(), status: 'draft', progress: 0, created_at: new Date().toISOString(), ...doc }; this.data.reportDocs.push(rec); this._save(); return rec },
  updateReportDoc(id, updates) { const i = (this.data.reportDocs || []).findIndex(d => d.id === id); if (i > -1) { Object.assign(this.data.reportDocs[i], updates, { updated_at: new Date().toISOString() }); this._save() } return this.getReportDoc(id) },
  deleteReportDoc(id) { this.data.reportDocs = (this.data.reportDocs || []).filter(d => d.id !== id); this.data.reportDocSections = (this.data.reportDocSections || []).filter(s => s.doc_id !== id); this.data.reportFeedback = (this.data.reportFeedback || []).filter(f => f.doc_id !== id); this._addDeletedId('reportDocs', id); this._save() },

  // ==== Report Doc Sections (보고서 섹션) ====
  getReportDocSections(docId) { const all = this.data.reportDocSections || []; return docId == null ? all : all.filter(s => s.doc_id === docId) },
  addReportSection(sec) { this.data.reportDocSections.push({ id: Date.now(), status: 'empty', indicator_ids: [], sort_order: this.data.reportDocSections.length + 1, created_at: new Date().toISOString(), ...sec }); this._save(); return sec },
  updateReportSection(id, updates) { const i = (this.data.reportDocSections || []).findIndex(s => s.id === id); if (i > -1) { Object.assign(this.data.reportDocSections[i], updates, { updated_at: new Date().toISOString() }); this._save() } },
  deleteReportSection(id) { this.data.reportDocSections = (this.data.reportDocSections || []).filter(s => s.id !== id); this.data.reportFeedback = (this.data.reportFeedback || []).filter(f => f.section_id !== id); this._save() },

  // ==== Report Feedback (참고자료 대비 제안) ====
  getFeedback(docId) { const all = this.data.reportFeedback || []; return docId == null ? all : all.filter(f => f.doc_id === docId) },
  addFeedbackItem(fb) { this.data.reportFeedback.push({ id: Date.now() + Math.random(), status: 'open', created_at: new Date().toISOString(), ...fb }); this._save(); return fb },
  updateFeedbackItem(id, updates) { const i = (this.data.reportFeedback || []).findIndex(f => f.id === id); if (i > -1) { Object.assign(this.data.reportFeedback[i], updates); this._save() } },
  deleteFeedbackItem(id) { this.data.reportFeedback = (this.data.reportFeedback || []).filter(f => f.id !== id); this._save() },

  // ==== Agency Master ====
  getAgencyMaster() { return this.data.agencyMaster || [] },
  getAgencyTrackType(code) { const a = (this.data.agencyMaster || []).find(x => x.code === code); return a ? a.track_type : 'VOLUNTARY' },
  addAgencyMaster(a) { this.data.agencyMaster.push({ id: Date.now(), ...a }); this._save() },
  deleteAgencyMaster(id) { this.data.agencyMaster = this.data.agencyMaster.filter(x => x.id !== id); this._save() },

  // ==== Import API Data (ERP 연동) ====
  importApiData(category, rows) {
    const key = 'api_' + category
    if (!this.data[key]) this.data[key] = []
    this.data[key].push(...rows)
    this._save()
  },

  // ==== API Endpoints (F-18) ====
  getApiEndpoints() { return this.data.apiEndpoints || [] },
  getApiEndpoint(id) { return (this.data.apiEndpoints || []).find(e => e.id === id) },
  updateApiEndpoint(id, updates) {
    const ep = (this.data.apiEndpoints || []).find(e => e.id === id)
    if (ep) { Object.assign(ep, updates, { updated_at: new Date().toISOString() }); this._save() }
    return ep
  },
  getApiDataLogs(endpointId) {
    const logs = this.data.apiDataLogs || []
    return endpointId == null ? logs : logs.filter(l => l.endpoint_id === endpointId)
  },
  addApiDataLog(log) {
    if (!this.data.apiDataLogs) this.data.apiDataLogs = []
    this.data.apiDataLogs.push({ id: Date.now() + Math.random(), created_at: new Date().toISOString(), ...log })
    if (this.data.apiDataLogs.length > 200) this.data.apiDataLogs = this.data.apiDataLogs.slice(-200)
    this._save()
  },
  _seedApiEndpoints() {
    if (this.data.apiEndpoints?.length) return
    if (typeof API_DEFAULT_ENDPOINTS === 'undefined') return
    this.data.apiEndpoints = API_DEFAULT_ENDPOINTS.map(e => ({ ...e, base_url: '', headers: {}, timeout_ms: 8000 }))
  },

  // ==== Benchmarks (업종 벤치마크) ====
  getBenchmarkIndustries() { return this.data.benchmarks?.industries || [] },
  getBenchmarkMeta() {
    const b = this.data.benchmarks
    return b ? { source: b.source, source_type: b.source_type, last_updated: b.last_updated } : null
  },
  addBenchmarkIndustry(data) {
    if (!this.data.benchmarks) this._seedBenchmarks()
    const industry = {
      code: data.code || ('ind_' + Date.now()),
      label: data.label || '신규 업종',
      avg_score: Number(data.avg_score) || 0,
      sample_size: Number(data.sample_size) || 0
    }
    this.data.benchmarks.industries.push(industry)
    this._save()
    return industry
  },
  updateBenchmarkIndustry(code, updates) {
    const industry = (this.data.benchmarks?.industries || []).find(i => i.code === code)
    if (industry) {
      Object.assign(industry, updates)
      if (updates.avg_score != null) industry.avg_score = Number(updates.avg_score) || 0
      if (updates.sample_size != null) industry.sample_size = Number(updates.sample_size) || 0
      this._save()
    }
    return industry
  },
  deleteBenchmarkIndustry(code) {
    if (!this.data.benchmarks) return
    this.data.benchmarks.industries = this.data.benchmarks.industries.filter(i => i.code !== code)
    this._save()
  },
  setBenchmarkMeta(updates) {
    if (!this.data.benchmarks) this._seedBenchmarks()
    const b = this.data.benchmarks
    if (updates.source != null) b.source = updates.source
    if (updates.source_type != null) b.source_type = updates.source_type
    if ('last_updated' in updates) b.last_updated = updates.last_updated || null
    this._save()
  },

  // ==== Suppliers ====
  getSuppliers() { return this.data.suppliers },
  addSupplier(s) { this.data.suppliers.push({ id: Date.now(), ...s, created_at: new Date().toISOString() }); this._save(); return s },
  updateSupplier(id, updates) { const i = this.data.suppliers.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.suppliers[i], updates); this._save() } },
  deleteSupplier(id) {
    this.data.suppliers = this.data.suppliers.filter(x => x.id !== id)
    this.data.supplierRiskItems = (this.data.supplierRiskItems || []).filter(x => x.supplier_id !== id)
    this.data.supplierRiskActions = (this.data.supplierRiskActions || []).filter(x => x.supplier_id !== id)
    this._addDeletedId('suppliers', id)
    this._save()
  },

  // ==== Supplier Risk Items (5축 진단) ====
  getSupplierRiskItems(supplierId) {
    const items = this.data.supplierRiskItems || []
    return supplierId == null ? items : items.filter(x => x.supplier_id === supplierId)
  },
  addSupplierRiskItem(item) { this.data.supplierRiskItems.push({ id: Date.now() + Math.random(), answer: null, created_at: new Date().toISOString(), ...item }); this._save(); return item },
  updateSupplierRiskItem(id, updates) { const i = (this.data.supplierRiskItems || []).findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.supplierRiskItems[i], updates, { updated_at: new Date().toISOString() }); this._save() } },
  deleteSupplierRiskItem(id) { this.data.supplierRiskItems = (this.data.supplierRiskItems || []).filter(x => x.id !== id); this._save() },
  deleteSupplierRiskItemsBySupplier(supplierId) { this.data.supplierRiskItems = (this.data.supplierRiskItems || []).filter(x => x.supplier_id !== supplierId); this._save() },

  // ==== Supplier Risk Actions (개선조치) ====
  getSupplierRiskActions(supplierId) {
    const actions = this.data.supplierRiskActions || []
    return supplierId == null ? actions : actions.filter(x => x.supplier_id === supplierId)
  },
  addSupplierRiskAction(a) { this.data.supplierRiskActions.push({ id: Date.now() + Math.random(), status: 'not_started', priority: '보통', progress: 0, created_at: new Date().toISOString(), ...a }); this._save(); return a },
  updateSupplierRiskAction(id, updates) { const i = (this.data.supplierRiskActions || []).findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.supplierRiskActions[i], updates, { updated_at: new Date().toISOString() }); this._save() } },
  deleteSupplierRiskAction(id) { this.data.supplierRiskActions = (this.data.supplierRiskActions || []).filter(x => x.id !== id); this._save() },
  deleteSupplierRiskActionsBySupplier(supplierId) { this.data.supplierRiskActions = (this.data.supplierRiskActions || []).filter(x => x.supplier_id !== supplierId); this._save() },

  // ==== VSME Assessments ====
  getVSMEAssessments() { return this.data.vsmeAssessments },
  addVSMEAssessment(v) { this.data.vsmeAssessments.push({ id: Date.now(), ...v, created_at: new Date().toISOString() }); this._save(); return v },
  updateVSMEAssessment(id, updates) { const i = this.data.vsmeAssessments.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.vsmeAssessments[i], updates); this._save() } },
  deleteVSMEAssessment(id) { this.data.vsmeAssessments = this.data.vsmeAssessments.filter(x => x.id !== id); this._addDeletedId('vsmeAssessments', id); this._save() },

  // ==== Deleted IDs (Supabase sync) ====
  _getDeletedIds() {
    try { return JSON.parse(localStorage.getItem(DELETED_IDS_KEY)) || {} }
    catch { return {} }
  },
  _addDeletedId(table, id) {
    const d = this._getDeletedIds()
    if (!d[table]) d[table] = []
    if (!d[table].includes(id)) d[table].push(id)
    localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(d))
  },
  _isDeleted(table, id) {
    const d = this._getDeletedIds()
    return d[table] ? d[table].includes(id) : false
  },

  // ==== Bulk seed (from remote sync) ====
  _seedTable(table, rows) {
    if (!this.data[table]) this.data[table] = []
    const existingIds = new Set(this.data[table].map(r => r.id))
    rows.forEach(row => {
      if (this._isDeleted(table, row.id)) return
      const idx = this.data[table].findIndex(r => r.id === row.id)
      if (idx > -1) {
        this.data[table][idx] = { ...row, ...this.data[table][idx] }
      } else {
        this.data[table].push(row)
        existingIds.add(row.id)
      }
    })
    this._save()
  },

  // ==== Notifications ====
  getNotifications() { return this.data.notifications || [] },
  getUnreadNotifications(userId) { return (this.data.notifications || []).filter(n => !n.read && (!userId || n.user_id === userId)) },
  addNotification(n) { const notif = { id: Date.now(), read: false, created_at: new Date().toISOString(), ...n }; this.data.notifications.push(notif); this._save(); return notif },
  markNotificationRead(id) { const n = (this.data.notifications || []).find(x => x.id === id); if (n) { n.read = true; this._save() } },
  markAllNotificationsRead(userId) { (this.data.notifications || []).forEach(n => { if (!userId || n.user_id === userId) n.read = true }); this._save() },
  clearOldNotifications(days) { const cutoff = Date.now() - (days || 30) * 86400000; this.data.notifications = (this.data.notifications || []).filter(n => new Date(n.created_at).getTime() > cutoff); this._save() },

  // ==== Auto-Tag Rules ====
  getAutoTagRules() { return this.data.autoTagRules || [] },
  addAutoTagRule(r) { const rule = { id: Date.now(), enabled: true, ...r }; this.data.autoTagRules.push(rule); this._save(); return rule },
  deleteAutoTagRule(id) { this.data.autoTagRules = (this.data.autoTagRules || []).filter(r => r.id !== id); this._save() },

  // ==== Auto-Tag Engine ====
  suggestAutoTags(title, description) {
    const text = ((title || '') + ' ' + (description || '')).toLowerCase()
    const rules = (this.data.autoTagRules || []).filter(r => r.enabled !== false)
    const indicators = this.data.indicators || []
    const matches = []
    rules.forEach(rule => {
      const keywords = (rule.keywords || '').toLowerCase().split(',').map(k => k.trim()).filter(Boolean)
      if (keywords.some(kw => text.includes(kw))) {
        const ind = indicators.find(i => i.id === rule.indicator_id)
        if (ind) matches.push({ indicator_id: ind.id, indicator_code: ind.indicator_code, indicator_name: ind.indicator_name, confidence: rule.confidence || 'medium' })
      }
    })
    const seen = new Set()
    return matches.filter(m => { if (seen.has(m.indicator_id)) return false; seen.add(m.indicator_id); return true })
  },

  autoTagEvidence(evidenceId, title, description) {
    const suggestions = this.suggestAutoTags(title, description)
    const existing = (this.data.evidenceTags || []).filter(t => t.evidence_id === evidenceId)
    const existingIds = new Set(existing.map(t => t.indicator_id))
    let count = 0
    suggestions.forEach(s => {
      if (!existingIds.has(s.indicator_id)) {
        this.data.evidenceTags.push({ id: Date.now() + count, evidence_id: evidenceId, indicator_id: s.indicator_id, is_primary: false, auto_tagged: true })
        count++
      }
    })
    if (count > 0) this._save()
    return suggestions
  },

  // ==== Auto-Link Evidence to Assessment Items ====
  autoLinkEvidenceToAssessment(evidenceId, assessmentId) {
    const tags = (this.data.evidenceTags || []).filter(t => t.evidence_id === evidenceId)
    const items = (this.data.assessmentItems || []).filter(i => i.assessment_id === assessmentId)
    let linked = 0
    tags.forEach(tag => {
      const item = items.find(i => i.indicator_id === tag.indicator_id)
      if (item) {
        if (!item.evidence_ids) item.evidence_ids = []
        if (!item.evidence_ids.includes(evidenceId)) {
          item.evidence_ids.push(evidenceId)
          linked++
        }
      }
    })
    if (linked > 0) this._save()
    return linked
  },

  autoLinkAllEvidence(assessmentId) {
    const evidences = (this.data.evidences || []).filter(e => !assessmentId || e.assessment_id === assessmentId)
    let total = 0
    evidences.forEach(ev => {
      total += this.autoLinkEvidenceToAssessment(ev.id, ev.assessment_id || assessmentId)
    })
    return total
  },

  // ==== Deadline Check ====
  checkDeadlines() {
    const now = new Date()
    const items = this.data.assessmentItems || []
    const notifications = this.data.notifications || []
    const existingMsgs = new Set(notifications.filter(n => !n.read).map(n => n.key))
    let alerts = []

    items.forEach(item => {
      if (!item.due_date || item.status === 'completed') return
      const due = new Date(item.due_date)
      const diffDays = Math.ceil((due - now) / 86400000)
      const ind = (this.data.indicators || []).find(i => i.id === item.indicator_id)
      const code = ind ? ind.indicator_code : item.indicator_id
      const assignee = item.assignee_id ? (this.data.users || []).find(u => u.id === item.assignee_id) : null
      const assigneeName = assignee ? assignee.name : ''

      if (diffDays < 0) {
        const key = 'overdue_' + item.id
        if (!existingMsgs.has(key)) {
          alerts.push({ type: 'error', key, message: `${code} 마감 초과 (${Math.abs(diffDays)}일 지연)${assigneeName ? ' - ' + assigneeName : ''}`, related_page: 'assessment', related_id: item.assessment_id, user_id: item.assignee_id })
        }
      } else if (diffDays <= 3) {
        const key = 'urgent_' + item.id
        if (!existingMsgs.has(key)) {
          alerts.push({ type: 'warning', key, message: `${code} 마감 임박 (D-${diffDays})${assigneeName ? ' - ' + assigneeName : ''}`, related_page: 'assessment', related_id: item.assessment_id, user_id: item.assignee_id })
        }
      } else if (diffDays <= 7) {
        const key = 'soon_' + item.id
        if (!existingMsgs.has(key)) {
          alerts.push({ type: 'info', key, message: `${code} 마감 D-${diffDays}${assigneeName ? ' - ' + assigneeName : ''}`, related_page: 'assessment', related_id: item.assessment_id, user_id: item.assignee_id })
        }
      }

      if (!item.evidence_ids || item.evidence_ids.length === 0) {
        const key = 'noev_' + item.id
        if (!existingMsgs.has(key) && diffDays <= 14) {
          alerts.push({ type: 'warning', key, message: `${code} 증빙 미연결${assigneeName ? ' - ' + assigneeName : ''}`, related_page: 'assessment', related_id: item.assessment_id, user_id: item.assignee_id })
        }
      }
    })

    const submissions = this.data.submissions || []
    submissions.filter(s => s.status !== 'submitted' && s.status !== 'approved').forEach(s => {
      const agency = (this.data.agencyMaster || []).find(a => a.code === s.agency_code)
      if (!agency || !agency.submission_window) return
      const key = 'submit_' + s.id
      if (existingMsgs.has(key)) return
      const [start, end] = agency.submission_window.split('~')
      const [em, ed] = end.split('-').map(Number)
      const endDate = new Date(now.getFullYear(), em - 1, ed)
      const diffDays = Math.ceil((endDate - now) / 86400000)
      if (diffDays <= 14 && diffDays >= 0) {
        alerts.push({ type: 'warning', key, message: `${agency.name} 제출 마감 D-${diffDays} — ${s.assessment_year}년`, related_page: 'submit', related_id: s.id })
      }
    })

    alerts.forEach(a => this.addNotification({ type: a.type, key: a.key, message: a.message, related_page: a.related_page, related_id: a.related_id, user_id: a.user_id || null }))
    return alerts
  },

  // ==== Workflow Stats ====
  getWorkflowStats(assessmentId) {
    const items = (this.data.assessmentItems || []).filter(i => !assessmentId || i.assessment_id === assessmentId)
    const total = items.length
    const completed = items.filter(i => i.status === 'completed').length
    const withEvidence = items.filter(i => i.evidence_ids && i.evidence_ids.length > 0).length
    const now = new Date()
    const overdue = items.filter(i => i.due_date && new Date(i.due_date) < now && i.status !== 'completed').length
    const dueSoon = items.filter(i => { if (!i.due_date || i.status === 'completed') return false; const d = Math.ceil((new Date(i.due_date) - now) / 86400000); return d >= 0 && d <= 7 }).length
    return { total, completed, withEvidence, overdue, dueSoon, completionPct: total ? Math.round(completed / total * 100) : 0, evidencePct: total ? Math.round(withEvidence / total * 100) : 0 }
  },

  // ==== Seed Auto-Tag Rules ====
  _seedAutoTagRules() {
    if ((this.data.autoTagRules || []).length > 0) return
    const indicators = this.data.indicators || []
    const findInd = (code) => indicators.find(i => i.indicator_code === code)
    const rules = [
      { keywords: '에너지,전력,가스,연료,난방,냉방', indicator_code: 'EV-ENV-OPS', confidence: 'high' },
      { keywords: '온실가스,탄소,CO2,GHG,배출량', indicator_code: 'EV-ENV-OPS', confidence: 'high' },
      { keywords: '용수,물,수자원,폐수', indicator_code: 'EV-ENV-OPS', confidence: 'medium' },
      { keywords: '폐기,재활용,매립,소각', indicator_code: 'EV-ENV-PRD', confidence: 'medium' },
      { keywords: 'ISO14001,환경인증,환경경영시스템', indicator_code: 'EV-ENV-CERT', confidence: 'high' },
      { keywords: '대기,배출,오염,소음,악취', indicator_code: 'EV-ENV-ANO', confidence: 'high' },
      { keywords: '환경성과,환경보고,환경목표', indicator_code: 'EV-ENV-RES', confidence: 'medium' },
      { keywords: '환경방침,환경정책', indicator_code: 'EV-ENV-POL', confidence: 'high' },
      { keywords: '인권,노동,근로,임금,근로시간', indicator_code: 'EV-LHR-HR', confidence: 'high' },
      { keywords: '인적자원,교육,훈련,역량개발', indicator_code: 'EV-LHR-HRM', confidence: 'medium' },
      { keywords: '노사,단체교섭,직원참여,협의', indicator_code: 'EV-LHR-SD', confidence: 'high' },
      { keywords: '승진,경력,성과평가,보상', indicator_code: 'EV-LHR-CS', confidence: 'medium' },
      { keywords: '인권정책,노동정책', indicator_code: 'EV-LHR-POL', confidence: 'high' },
      { keywords: '윤리,반부패,청렴,부패', indicator_code: 'EV-ETH-POL', confidence: 'high' },
      { keywords: '공정경쟁,독점,카르텔', indicator_code: 'EV-ETH-COMP', confidence: 'high' },
      { keywords: '정보보안,개인정보,보호', indicator_code: 'EV-ETH-INFO', confidence: 'high' },
      { keywords: '조달,구매,공급사', indicator_code: 'EV-SP-POL', confidence: 'medium' },
      { keywords: '공급사실사,공급사평가', indicator_code: 'EV-SP-ENV', confidence: 'high' },
      { keywords: ' Scope', indicator_code: 'KSSB2-MET', confidence: 'high' },
      { keywords: '기후,기후변화,적응,완화', indicator_code: 'KSSB2-STRAT', confidence: 'medium' },
      { keywords: '거버넌스,이사회,위원회', indicator_code: 'KSSB1-GOV', confidence: 'medium' },
      { keywords: '위험관리,리스크관리', indicator_code: 'KSSB1-RISK', confidence: 'medium' }
    ]
    rules.forEach(r => {
      const ind = findInd(r.indicator_code)
      if (ind) this.data.autoTagRules.push({ id: Date.now() + Math.random(), indicator_id: ind.id, keywords: r.keywords, confidence: r.confidence, enabled: true })
    })
    this._save()
  }
}
