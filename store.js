const APP_VERSION = 'v1.5.7'
const STORE_KEY = 'smart_esg_data'
const DELETED_IDS_KEY = 'smart_esg_deleted_ids'

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
    const raw = sessionStorage.getItem('smart_esg_user')
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
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
      this._ensureSeeds()
      if (savedVer !== APP_VERSION) {
        localStorage.setItem(STORE_KEY + '_ver', APP_VERSION)
        this._save()
      }
    }
  },

  _ensureSeeds() {
    const d = this._data
    const _ts = () => Date.now() + Math.random()
    if (!d.agencyMaster?.length) {
      d.agencyMaster = [
        { code: 'ECOVADIS', name: 'EcoVadis', country: '프랑스', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '글로벌 공급망 ESG 평가' },
        { code: 'KCGS', name: 'KCGS', country: '한국', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: '한국기업지배구조원 ESG평가' },
        { code: 'NICE', name: 'NICE', country: '한국', track_type: 'VOLUNTARY', disclosure_std_no: null, effective_date: '2024-01-01', note: 'NICE 평가정보 ESG' },
        { code: 'KSSB', name: 'KSSB', country: '한국', track_type: 'MANDATORY', disclosure_std_no: '제1호,제2호', effective_date: '2026-02-26', note: '한국지속가능성기준원 - 법정 공시' },
        { code: 'ISSB', name: 'ISSB', country: '글로벌', track_type: 'MANDATORY', disclosure_std_no: 'IFRS S1,S2', effective_date: '2024-01-01', note: '국제지속가능성기준위원회' }
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
    if (!d.weightParams?.length) {
      d.weightParams = [
        { id: _ts(), authority_code: 'ECOVADIS', group_code: 'ENV', weight_pct: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', group_code: 'LHR', weight_pct: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', group_code: 'ETH', weight_pct: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', group_code: 'SP', weight_pct: 25, year: 2026 },
        { id: _ts(), authority_code: 'KSSB', group_code: 'KSSB', weight_pct: 100, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', group_code: '_PILLAR', pillar: 'POLICY', weight_pct: 25, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', group_code: '_PILLAR', pillar: 'ACTION', weight_pct: 40, year: 2026 },
        { id: _ts(), authority_code: 'ECOVADIS', group_code: '_PILLAR', pillar: 'RESULT', weight_pct: 35, year: 2026 }
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
    this._save()
  },

  _seedIndicatorMappings() {
    const d = this._data
    const _ts = () => Date.now() + Math.random()
    const findInd = (auth, code) => d.indicators.find(i => i.authority_code === auth && i.indicator_code === code)
    const mappingData = [
      ['ECOVADIS', 'EV-ENV-POL', 'KSSB', 'KSSB1-STRAT', 'direct', 'high'],
      ['ECOVADIS', 'EV-ENV-OPS', 'KSSB', 'KSSB2-MET', 'direct', 'high'],
      ['ECOVADIS', 'EV-ENV-OPS', 'KSSB', 'KSSB2-RISK', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-ENV-RES', 'KSSB', 'KSSB2-MET', 'direct', 'high'],
      ['ECOVADIS', 'EV-LHR-POL', 'KSSB', 'KSSB1-STRAT', 'direct', 'medium'],
      ['ECOVADIS', 'EV-LHR-HR', 'KSSB', 'KSSB1-MET', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-ETH-POL', 'KSSB', 'KSSB1-GOV', 'direct', 'high'],
      ['ECOVADIS', 'EV-SP-POL', 'KSSB', 'KSSB1-STRAT', 'indirect', 'low'],
      ['ECOVADIS', 'EV-ENV-POL', 'KCGS', 'KCGS-ENV', 'direct', 'high'],
      ['ECOVADIS', 'EV-LHR-POL', 'KCGS', 'KCGS-SOC', 'direct', 'high'],
      ['ECOVADIS', 'EV-ETH-POL', 'KCGS', 'KCGS-GOV', 'direct', 'high'],
      ['ECOVADIS', 'EV-ENV-RES', 'NICE', 'NICE-ENV', 'direct', 'medium'],
      ['ECOVADIS', 'EV-LHR-RES', 'NICE', 'NICE-SOC', 'direct', 'medium'],
      ['ECOVADIS', 'EV-ETH-COR', 'NICE', 'NICE-GOV', 'direct', 'medium'],
      ['ECOVADIS', 'EV-ENV-OPS', 'K-ESG', 'KESG-E2', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-LHR-HR', 'K-ESG', 'KESG-S2', 'expanded', 'medium'],
      ['ECOVADIS', 'EV-ETH-POL', 'K-ESG', 'KESG-G1', 'direct', 'high'],
      ['ECOVADIS', 'EV-SP-ENV', 'K-ESG', 'KESG-E1', 'indirect', 'low'],
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

    const evEnv = addGroup('ECOVADIS', 'ENV', '환경')
    const evLhr = addGroup('ECOVADIS', 'LHR', '노동·인권')
    const evEth = addGroup('ECOVADIS', 'ETH', '윤리')
    const evSp = addGroup('ECOVADIS', 'SP', '지속가능한 조달')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-POL', '환경방침', 'POLICY')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-OPS', '사업장 운영 환경영향', 'ACTION', { scope2_split_required: true })
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-PRD', '제품 사용·폐기 영향', 'ACTION')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-CERT', '환경 인증(ISO14001 등)', 'ACTION')
    addInd(evEnv, 'ECOVADIS', 'EV-ENV-RES', '환경성과 보고', 'RESULT', { scope2_split_required: true })
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-POL', '인권·노동 정책', 'POLICY')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HRM', '인적자원관리', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HR', '인권(노동법준수/다양성)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-RES', '노동·인권 성과 보고', 'RESULT')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-POL', '윤리·반부패 정책', 'POLICY')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COR', '부패방지 조치', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COMP', '공정경쟁', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-INFO', '정보관리 책임', 'ACTION')
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
      ghgFactors: [],
      ghgActivities: [],
      ghgSummary: [],
      aiDrafts: [],
      aiVerificationLogs: [],
      weightParams: [],
      ratingThresholds: [],
      suppliers: [],
      vsmeAssessments: [],
      maskingRules: [],
      projectBudget: [],
      riskRegister: [],
      agencyMaster: [],
      issa_assurance: null,
      submissions: []
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

    addInd(evLhr, 'ECOVADIS', 'EV-LHR-POL',  '인권·노동 정책', 'POLICY')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HRM',  '인적자원관리(재해예방/교육/근로조건)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-HR',   '인권(노동법준수/다양성/차별금지)', 'ACTION')
    addInd(evLhr, 'ECOVADIS', 'EV-LHR-RES',  '노동·인권 성과 보고', 'RESULT')

    addInd(evEth, 'ECOVADIS', 'EV-ETH-POL',  '윤리·반부패 정책', 'POLICY')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COR',  '부패방지 조치', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-COMP', '공정경쟁(반경쟁행위 방지)', 'ACTION')
    addInd(evEth, 'ECOVADIS', 'EV-ETH-INFO', '정보관리 책임(정보보안)', 'ACTION')

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
      { id: 1, field_name: '급여', masking_type: '전체마스킹', applies_to_ai_api: true },
      { id: 2, field_name: '징계이력', masking_type: '전체마스킹', applies_to_ai_api: true },
      { id: 3, field_name: '내부고발자명', masking_type: '전체마스킹', applies_to_ai_api: true },
      { id: 4, field_name: '직원명', masking_type: '부분마스킹', applies_to_ai_api: true },
      { id: 5, field_name: '계약금액', masking_type: '집계치만허용', applies_to_ai_api: false }
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
      { id: _ts(), authority_code: 'ECOVADIS', group_code: 'ENV', weight_pct: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', group_code: 'LHR', weight_pct: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', group_code: 'ETH', weight_pct: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', group_code: 'SP',  weight_pct: 25, year: 2026 },
      { id: _ts(), authority_code: 'KSSB',     group_code: 'KSSB', weight_pct: 100, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', group_code: '_PILLAR', pillar: 'POLICY', weight_pct: 25, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', group_code: '_PILLAR', pillar: 'ACTION', weight_pct: 40, year: 2026 },
      { id: _ts(), authority_code: 'ECOVADIS', group_code: '_PILLAR', pillar: 'RESULT', weight_pct: 35, year: 2026 }
    )
    this._data.ratingThresholds.push(
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Platinum', min_score: 78, max_score: 100, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Gold', min_score: 68, max_score: 77, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Silver', min_score: 54, max_score: 67, year: 2026, effective_from: '2026-01-01' },
      { id: _ts(), authority_code: 'ECOVADIS', rating: 'Bronze', min_score: 37, max_score: 53, year: 2026, effective_from: '2026-01-01' },
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
      { id: _ts(), project_name: 'Smart ESG 시스템 구축', category: '시스템', planned_amount: 50000000, actual_amount: 35000000, status: 'in_progress', period: '1단계', start_date: '2026-01-01', end_date: '2026-12-31', notes: '' },
      { id: _ts(), project_name: 'ESG 교육 컨설팅', category: '외부컨설팅', planned_amount: 15000000, actual_amount: 8000000, status: 'in_progress', period: '2단계', start_date: '2026-03-01', end_date: '2026-09-30', notes: '' },
      { id: _ts(), project_name: 'GHG 측정 시스템 도입', category: '인프라', planned_amount: 20000000, actual_amount: 0, status: 'planned', period: '3단계', start_date: '2026-06-01', end_date: '2026-12-31', notes: '' }
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

    this._save()
  },

  _save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(this._data))
    this._notify()
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
  addAssessmentItem(item) { this.data.assessmentItems.push({ id: Date.now(), ...item }); this._save(); return item },
  updateAssessmentItem(id, updates) { const i = this.data.assessmentItems.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.assessmentItems[i], updates); this._save() } },
  deleteAssessmentItem(id) { this.data.assessmentItems = this.data.assessmentItems.filter(x => x.id !== id); this._save() },

  // ==== Indicator Groups ====
  getIndicatorGroups() { return this.data.indicatorGroups },
  addIndicatorGroup(g) { this.data.indicatorGroups.push({ id: Date.now(), ...g }); this._save(); return g },
  updateIndicatorGroup(id, updates) { const i = this.data.indicatorGroups.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.indicatorGroups[i], updates); this._save() } },
  deleteIndicatorGroup(id) { this.data.indicatorGroups = this.data.indicatorGroups.filter(x => x.id !== id); this._save() },

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
  deleteIndicator(id) { this.data.indicators = this.data.indicators.filter(x => x.id !== id); this._save() },

  // ==== Indicator Mappings ====
  getIndicatorMappings() { return this.data.indicatorMappings },
  addIndicatorMapping(m) { this.data.indicatorMappings.push({ id: Date.now(), ...m }); this._save(); return m },
  deleteIndicatorMapping(id) { this.data.indicatorMappings = this.data.indicatorMappings.filter(x => x.id !== id); this._save() },

  // ==== Evidences ====
  getEvidences() { return this.data.evidences },
  addEvidence(e) { this.data.evidences.push({ id: Date.now(), expiry_date: '', contains_sensitive_data: false, ...e }); this._save(); return e },
  updateEvidence(id, updates) { const i = this.data.evidences.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.evidences[i], updates); this._save() } },
  deleteEvidence(id) { this.data.evidences = this.data.evidences.filter(x => x.id !== id); this.data.evidenceFiles = this.data.evidenceFiles.filter(f => f.evidence_id !== id); this._addDeletedId('evidences', id); this._save() },

  // ==== Evidence Tags ====
  getEvidenceTags() { return this.data.evidenceTags },
  addEvidenceTag(t) { this.data.evidenceTags.push({ id: Date.now(), ...t }); this._save(); return t },
  removeEvidenceTag(evidenceId, indicatorId) {
    this.data.evidenceTags = this.data.evidenceTags.filter(x => !(x.evidence_id === evidenceId && x.indicator_id === indicatorId))
    this._save()
  },

  // ==== Evidence Files (다중파일) ====
  getEvidenceFiles(evidenceId) { return (this.data.evidenceFiles || []).filter(f => f.evidence_id === evidenceId) },
  addEvidenceFile(f) { this.data.evidenceFiles.push({ id: Date.now(), ...f, uploaded_at: new Date().toISOString() }); this._save(); return f },
  deleteEvidenceFile(id) { this.data.evidenceFiles = this.data.evidenceFiles.filter(f => f.id !== id); this._save() },
  deleteEvidenceFilesByEvidence(evidenceId) { this.data.evidenceFiles = this.data.evidenceFiles.filter(f => f.evidence_id !== evidenceId); this._save() },

  // ==== GHG Factors ====
  getGHGFactors() { return this.data.ghgFactors },
  addGHGFactor(f) { this.data.ghgFactors.push({ id: Date.now(), ...f }); this._save(); return f },
  deleteGHGFactor(id) { this.data.ghgFactors = this.data.ghgFactors.filter(x => x.id !== id); this._save() },

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

  // ==== Suppliers ====
  getSuppliers() { return this.data.suppliers },
  addSupplier(s) { this.data.suppliers.push({ id: Date.now(), ...s, created_at: new Date().toISOString() }); this._save(); return s },
  updateSupplier(id, updates) { const i = this.data.suppliers.findIndex(x => x.id === id); if (i > -1) { Object.assign(this.data.suppliers[i], updates); this._save() } },
  deleteSupplier(id) { this.data.suppliers = this.data.suppliers.filter(x => x.id !== id); this._addDeletedId('suppliers', id); this._save() },

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
      if (!existingIds.has(row.id) && !this._isDeleted(table, row.id)) {
        this.data[table].push(row)
        existingIds.add(row.id)
      }
    })
    this._save()
  }
}
