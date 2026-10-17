/**
 * store.js
 * ------------------------------------------------------------
 * 지금은 localStorage 기반 in-memory 저장소지만, 모든 데이터 접근은
 * `db.*` 비동기 함수로만 이루어집니다. 나중에 Smart ESG(Supabase)와
 * 연결할 때는 이 파일의 함수 내부 구현만 Supabase 쿼리로 바꿔치기하면
 * 되고, 화면(pages.js/matrix.js) 코드는 손댈 필요가 없습니다.
 *
 * 테이블명은 설계 문서(v2.0~v2.6)의 실제 테이블명과 동일하게 맞췄습니다.
 *   tb_issue_pool, tb_issue_theme_group, tb_survey_template,
 *   tb_survey_question, tb_stakeholder_response, tb_materiality_score,
 *   tb_internal_iro_worksheet
 * ------------------------------------------------------------
 */

const STORAGE_KEY = 'smart_esg_materiality_v1';
const SCHEMA_VERSION = 2; // 저장 데이터 구조 버전. 구조가 바뀌면 올리고 _loadState()에서 마이그레이션 처리

function _uuid() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function _loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      // 이전 버전(ESRS 토픽/평가사이클/이해관계자 마스터가 없던 상태) 데이터 마이그레이션 가드
      parsed.tb_materiality_topic = parsed.tb_materiality_topic || ESRS_TOPICS;
      parsed.tb_materiality_assessment = parsed.tb_materiality_assessment || [];
      parsed.tb_stakeholder = parsed.tb_stakeholder || [];
      parsed.tb_weight_config = parsed.tb_weight_config || {};
      parsed.tb_target_selection = parsed.tb_target_selection || {};
      parsed.tb_aggregation_signoff = parsed.tb_aggregation_signoff || {};
      parsed.tb_exclusion_log = parsed.tb_exclusion_log || [];
      parsed.tb_score_draft = parsed.tb_score_draft || {};
      parsed.schema_version = parsed.schema_version || SCHEMA_VERSION;
      parsed.tb_issue_theme_group = THEME_GROUPS; // esrs_topic_code 매핑은 항상 최신 시드로 갱신
      return parsed;
    } catch (e) { /* fallthrough to fresh state */ }
  }
  return {
    tb_issue_pool: ISSUE_POOL.map(i => ({ ...i, pool_round: '6차', is_active: true })),
    tb_issue_theme_group: THEME_GROUPS,
    tb_materiality_topic: ESRS_TOPICS,                 // v2.0 — ESRS 1 AR16 토픽 마스터
    tb_materiality_assessment: [],                      // v2.0/v2.3 — 연도별 평가사이클
    tb_stakeholder: [],                                  // v2.0 — 이해관계자 마스터(등록형)
    tb_survey_template: [],       // {id, assessment_id, title, target_question_count, status, created_at}
    tb_survey_question: [],       // {id, template_id, issue_code, display_order}
    tb_stakeholder_response: [],  // {id, template_id, question_id, respondent_name, group_type, score_given, answered_at}
    tb_materiality_score: {},     // keyed by theme_group -> {impact_score_calculated, financial_score_calculated, impact_score_final, financial_score_final, is_manually_adjusted, adjustment_reason, adjusted_by, adjusted_at}
    tb_internal_iro_worksheet: {}, // keyed by `${assessment_id}::${theme_group}`
    tb_target_selection: {},       // keyed by assessment_id -> {method, criteria, status, approved_by, approved_at, stakeholder_ids:[]}
    tb_aggregation_signoff: {},    // keyed by template_id -> {excluded_names:[], exclusion_reason, signed_off_by, signed_off_at}
    tb_exclusion_log: [],          // append-only: {id, template_id, respondent_name, reason, excluded_by, excluded_at}
    tb_score_draft: {},            // keyed by `${assessment_id}::${theme_group}` -> {impact_final, financial_final, reason, saved_at}
    tb_weight_config: {},          // keyed by assessment_id -> {weights:{EMPLOYEE:1,...}, impact_threshold:3, financial_threshold:3}
    schema_version: SCHEMA_VERSION
  };
}

let _state = _loadState();

function _persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(_state));
}

function _delay(v) {
  // 실제 네트워크 호출처럼 비동기 흉내(향후 Supabase 전환 시 자연스럽게 대체)
  return new Promise(resolve => setTimeout(() => resolve(v), 60));
}

const db = {

  // ---------- 이슈풀 ----------
  async listIssuePool() {
    return _delay([..._state.tb_issue_pool]);
  },
  async listThemeGroups() {
    return _delay([..._state.tb_issue_theme_group]);
  },

  // ---------- ESRS 토픽 마스터 (v2.0) ----------
  async listESRSTopics() {
    return _delay([..._state.tb_materiality_topic]);
  },
  async getEsrsTopicForThemeGroup(themeGroup) {
    const tg = _state.tb_issue_theme_group.find(g => g.group_code === themeGroup);
    if (!tg) return _delay(null);
    return _delay(_state.tb_materiality_topic.find(t => t.topic_code === tg.esrs_topic_code) || null);
  },

  // ---------- 평가사이클 (v2.0/v2.3) ----------
  async createAssessment({ reportYear, method = 'ISSUE_POOL_SIMPLE' }) {
    const exists = _state.tb_materiality_assessment.find(a => a.report_year === reportYear && a.status !== 'CARRIED_FORWARD');
    if (exists) throw new Error(`${reportYear}년 평가사이클이 이미 존재합니다.`);
    const a = {
      id: _uuid(), report_year: reportYear, method, approach: 'BOTTOM_UP',
      status: 'IN_PROGRESS', carried_from_id: null, change_trigger_note: null,
      created_at: new Date().toISOString(), finalized_at: null, finalized_by: null
    };
    _state.tb_materiality_assessment.push(a);
    _persist();
    return _delay(a);
  },

  async listAssessments() {
    return _delay([..._state.tb_materiality_assessment].sort((a, b) => b.report_year - a.report_year));
  },

  async getAssessment(id) {
    return _delay(_state.tb_materiality_assessment.find(a => a.id === id) || null);
  },

  async carryForwardAssessment(fromId, { reportYear, note }) {
    if (!note || !note.trim()) throw new Error('이월 사유(변경사항 없음에 대한 근거)를 입력해야 합니다.');
    const src = _state.tb_materiality_assessment.find(a => a.id === fromId);
    if (!src) throw new Error('원본 평가사이클을 찾을 수 없습니다.');
    const a = {
      id: _uuid(), report_year: reportYear, method: src.method, approach: src.approach,
      status: 'CARRIED_FORWARD', carried_from_id: fromId, change_trigger_note: note,
      created_at: new Date().toISOString(), finalized_at: null, finalized_by: null
    };
    _state.tb_materiality_assessment.push(a);

    // 전년도 IRO 워크시트를 새 사이클로 복제(참고용 시작값)
    Object.keys(_state.tb_internal_iro_worksheet).forEach(key => {
      if (key.startsWith(fromId + '::')) {
        const themeGroup = key.split('::')[1];
        _state.tb_internal_iro_worksheet[`${a.id}::${themeGroup}`] = {
          ..._state.tb_internal_iro_worksheet[key],
          analyst_note: '[전년도 이월] ' + (_state.tb_internal_iro_worksheet[key].analyst_note || '')
        };
      }
    });
    _persist();
    return _delay(a);
  },

  async finalizeAssessment(id, finalizedBy) {
    const a = _state.tb_materiality_assessment.find(x => x.id === id);
    if (!a) throw new Error('평가사이클을 찾을 수 없습니다.');

    // 감사대응 요건(v2.0 5장): 이해관계자 참여 없이는 확정 불가
    const templatesOfAssessment = _state.tb_survey_template.filter(t => t.assessment_id === id);
    const hasResponses = _state.tb_stakeholder_response.some(r =>
      templatesOfAssessment.some(t => t.id === r.template_id));
    if (!hasResponses) throw new Error('이해관계자 응답이 하나도 없어 확정할 수 없습니다(이해관계자 참여는 필수 요건).');

    // 전년대비 비교(New/Existing 배지)를 위해, 확정 시점의 이중중대 테마그룹 목록을 스냅샷으로 저장
    const materialGroups = new Set();
    for (const t of templatesOfAssessment) {
      const points = await this.getQuadrantData(t.id);
      points.forEach(p => {
        if (p.has_impact_axis && p.has_financial_axis &&
            p.final.impact >= p.impact_threshold && p.final.financial >= p.financial_threshold) {
          materialGroups.add(p.theme_group);
        }
      });
    }
    a.material_theme_groups = [...materialGroups];

    a.status = 'FINALIZED';
    a.finalized_at = new Date().toISOString();
    a.finalized_by = finalizedBy || '담당자';
    _persist();
    return _delay(a);
  },

  // ---------- 이해관계자 마스터 (v2.0) ----------
  async registerStakeholder({ name, category, roleType }) {
    // 중복방지: 같은 이름+소속구분이 이미 등록되어 있으면 새로 만들지 않고 기존 레코드를 반환
    const existing = _state.tb_stakeholder.find(s => s.name === name && s.category === category);
    if (existing) {
      throw new Error(`"${name}"(${category})은(는) 이미 등록되어 있습니다.`);
    }
    const s = { id: _uuid(), name, category, role_type: roleType, created_at: new Date().toISOString() };
    _state.tb_stakeholder.push(s);
    _persist();
    return _delay(s);
  },

  async listStakeholders() {
    return _delay([..._state.tb_stakeholder]);
  },

  async deleteStakeholder(id) {
    _state.tb_stakeholder = _state.tb_stakeholder.filter(s => s.id !== id);
    _persist();
    return _delay(true);
  },

  // ---------- 설문지 작성 (v2.4 5장) ----------
  async createSurveyTemplate({ title, issueCodes, targetCount, assessmentId }) {
    if (!assessmentId) throw new Error('평가사이클(연도)을 먼저 선택해야 합니다.');
    const assessment = _state.tb_materiality_assessment.find(a => a.id === assessmentId);
    if (assessment && assessment.status === 'FINALIZED') {
      throw new Error('이미 확정된 평가사이클에는 새 설문을 추가할 수 없습니다.');
    }
    const template = {
      id: _uuid(),
      assessment_id: assessmentId,
      title,
      target_question_count: targetCount,
      status: 'PUBLISHED',
      created_at: new Date().toISOString()
    };
    _state.tb_survey_template.push(template);

    issueCodes.forEach((code, idx) => {
      _state.tb_survey_question.push({
        id: _uuid(),
        template_id: template.id,
        issue_code: code,
        display_order: idx + 1
      });
    });
    _persist();
    return _delay(template);
  },

  async listSurveyTemplates(assessmentId) {
    let list = [..._state.tb_survey_template];
    if (assessmentId) list = list.filter(t => t.assessment_id === assessmentId);
    return _delay(list.sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },

  async getSurveyTemplate(templateId) {
    const template = _state.tb_survey_template.find(t => t.id === templateId);
    const questions = _state.tb_survey_question
      .filter(q => q.template_id === templateId)
      .sort((a, b) => a.display_order - b.display_order)
      .map(q => ({ ...q, issue: _state.tb_issue_pool.find(i => i.issue_code === q.issue_code) }));
    return _delay({ template, questions });
  },

  // ---------- 설문 응답 (모의 응답 시뮬레이터) ----------
  // 중복방지: 같은 응답자가 같은 설문에 다시 제출하면(이름 기준) 새로 추가하지 않고
  // 기존 응답을 지우고 새 값으로 교체합니다(업데이트 의미의 재제출).
  async submitResponse({ templateId, respondentName, groupType, answers }) {
    const before = _state.tb_stakeholder_response.length;
    _state.tb_stakeholder_response = _state.tb_stakeholder_response.filter(
      r => !(r.template_id === templateId && r.respondent_name === respondentName)
    );
    const wasResubmit = _state.tb_stakeholder_response.length < before;

    answers.forEach(a => {
      _state.tb_stakeholder_response.push({
        id: _uuid(),
        template_id: templateId,
        question_id: a.question_id,
        respondent_name: respondentName,
        group_type: groupType,
        score_given: a.score_given,
        answered_at: new Date().toISOString()
      });
    });
    _persist();
    return _delay({ ok: true, wasResubmit });
  },

  async listResponses(templateId) {
    return _delay(_state.tb_stakeholder_response.filter(r => r.template_id === templateId));
  },

  async countRespondents(templateId) {
    const names = new Set(
      _state.tb_stakeholder_response.filter(r => r.template_id === templateId).map(r => r.respondent_name)
    );
    return _delay(names.size);
  },

  // ---------- 엑셀 일괄 업로드 (신규 요청기능) ----------
  // rows: [{respondent_name, group_type, scores: {issue_code: 1~5, ...}}]
  // issue_code 기준으로 해당 템플릿의 question_id를 매칭해 일괄 저장합니다.
  async bulkImportResponses(templateId, rows) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const qByIssue = {};
    questions.forEach(q => { qByIssue[q.issue_code] = q.id; });

    let imported = 0, updated = 0, skippedRows = 0, skippedCells = 0;
    rows.forEach(row => {
      if (!row.respondent_name) { skippedRows++; return; }
      const answers = [];
      Object.keys(row.scores || {}).forEach(code => {
        const qid = qByIssue[code];
        const val = Number(row.scores[code]);
        if (!qid || !val || val < 1 || val > 5) { skippedCells++; return; }
        answers.push({ question_id: qid, score_given: val });
      });
      if (answers.length === 0) { skippedRows++; return; }

      // 중복방지: 같은 응답자명이 이미 이 설문에 응답한 적이 있으면 기존 응답을 지우고 교체
      const beforeCount = _state.tb_stakeholder_response.length;
      _state.tb_stakeholder_response = _state.tb_stakeholder_response.filter(
        r => !(r.template_id === templateId && r.respondent_name === row.respondent_name)
      );
      if (_state.tb_stakeholder_response.length < beforeCount) updated++; else imported++;

      answers.forEach(a => {
        _state.tb_stakeholder_response.push({
          id: _uuid(), template_id: templateId, question_id: a.question_id,
          respondent_name: row.respondent_name, group_type: row.group_type || 'EMPLOYEE',
          score_given: a.score_given, answered_at: new Date().toISOString()
        });
      });
    });
    _persist();
    return _delay({ imported, updated, skippedRows, skippedCells });
  },

  // 엑셀 템플릿/구글폼 생성에 필요한 문항 원본 (issue_code를 헤더/식별자로 사용)
  async getSurveyExportData(templateId) {
    const { template, questions } = await this.getSurveyTemplate(templateId);
    return _delay({
      title: template ? template.title : '',
      questions: questions.map(q => ({
        issue_code: q.issue_code,
        question_text: q.issue.question_text,
        dimension_tag: q.issue.dimension_tag
      }))
    });
  },

  // ---------- 관리자 가중치·임계값 설정 (신규 요청기능) ----------
  async getWeightConfig(assessmentId) {
    return _delay(_state.tb_weight_config[assessmentId] || {
      weights: { EMPLOYEE: 1, PARTNER: 1, CUSTOMER: 1, INVESTOR: 1, COMMUNITY: 1 },
      impact_threshold: 3, financial_threshold: 3
    });
  },
  async saveWeightConfig(assessmentId, config) {
    _state.tb_weight_config[assessmentId] = config;
    _persist();
    return _delay(true);
  },
  // 가중평균 계산 헬퍼: responses(해당 문항의 응답 배열) + weights(그룹별 가중치)
  _weightedAvg(responses, weights) {
    if (!responses.length) return null;
    let sumW = 0, sumWS = 0;
    responses.forEach(r => {
      const w = (weights && weights[r.group_type] != null) ? weights[r.group_type] : 1;
      sumW += w;
      sumWS += w * r.score_given;
    });
    return sumW > 0 ? sumWS / sumW : null;
  },

  // ---------- 결과 취합/분석 (v2.1 6장 / v2.4 6장) ----------
  // 이슈별 평균 (v_issue_avg_score 대응) — 가중치 적용
  // ---------- 문항별 응답분포 분석 (신규 요청기능 — 유형별 시각화용) ----------
  // 1~5점을 5개 응답구간(참고이미지의 '매우불만족~매우만족'과 동일한 개념)으로 보고
  // 구간별 응답수·비율, 긍정/부정/중립 3분류를 계산합니다.
  async computeResponseDistribution(templateId) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);

    return questions.map(q => {
      const scores = responses.filter(r => r.question_id === q.id).map(r => r.score_given);
      const total = scores.length;
      const counts = [1, 2, 3, 4, 5].map(v => scores.filter(s => s === v).length);
      const pct = counts.map(c => total ? Math.round((c / total) * 1000) / 10 : 0);
      const negative = counts[0] + counts[1];   // 1~2점
      const neutral = counts[2];                 // 3점
      const positive = counts[3] + counts[4];    // 4~5점
      return {
        issue_code: q.issue_code, issue_name: q.issue.issue_name,
        dimension_tag: q.issue.dimension_tag, theme_group: q.issue.theme_group,
        total, counts, pct,
        negative_pct: total ? Math.round((negative / total) * 1000) / 10 : 0,
        neutral_pct: total ? Math.round((neutral / total) * 1000) / 10 : 0,
        positive_pct: total ? Math.round((positive / total) * 1000) / 10 : 0
      };
    });
  },

  // ---------- 표본 개요·표본오차 (신규 요청기능 — 매트릭스 옆 표시용) ----------
  // 표본오차는 여론조사 표준 관행대로 95% 신뢰수준, 최악의 경우(p=0.5) 가정으로 계산합니다.
  async computeSurveySampleSummary(templateId) {
    const responses = await this.listResponses(templateId);
    const byName = {};
    responses.forEach(r => { byName[r.respondent_name] = r.group_type; });
    const total = Object.keys(byName).length;

    const byGroup = {};
    Object.values(byName).forEach(g => { byGroup[g] = (byGroup[g] || 0) + 1; });

    // 95% 신뢰수준 표본오차(%) = 1.96 * sqrt(0.5*0.5/n) * 100
    const marginOfErrorPct = total > 0 ? Math.round(1.96 * Math.sqrt(0.25 / total) * 1000) / 10 : null;

    return _delay({ total, byGroup, marginOfErrorPct });
  },

  async getIssueAvgScores(templateId) {
    const { template, questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);
    const cfg = template ? await this.getWeightConfig(template.assessment_id) : { weights: {} };

    return _delay(questions.map(q => {
      const rs = responses.filter(r => r.question_id === q.id);
      const avg = this._weightedAvg(rs, cfg.weights);
      return {
        issue_code: q.issue_code,
        issue_name: q.issue.issue_name,
        dimension_tag: q.issue.dimension_tag,
        theme_group: q.issue.theme_group,
        avg_score: avg !== null ? Math.round(avg * 100) / 100 : null,
        response_count: rs.length
      };
    }));
  },

  // 이해관계자 그룹별 비교 (v2.1 S-22 레이더차트용, 가중치 적용 전 원값 — 그룹간 비교가 목적이므로 가중치 미적용)
  async getGroupComparison(templateId) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);
    const groups = [...new Set(responses.map(r => r.group_type))];

    const result = {};
    groups.forEach(g => {
      result[g] = questions.map(q => {
        const scores = responses.filter(r => r.question_id === q.id && r.group_type === g).map(r => r.score_given);
        const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
        return { issue_code: q.issue_code, theme_group: q.issue.theme_group, avg_score: avg };
      });
    });
    return _delay(result);
  },

  // 테마그룹별 XY 좌표 (v_theme_quadrant_point 대응) — 가중치 및 임계값 적용
  // note: 내부에서 questions/responses를 직접 조회해 getIssueAvgScores의 중복 getSurveyTemplate
  // 호출을 피합니다(호출 1회당 왕복이 있는 실제 Supabase 연동 시 지연을 줄이기 위함).
  async getQuadrantData(templateId) {
    const { template, questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);
    const assessmentId = template ? template.assessment_id : null;
    const cfg = assessmentId ? await this.getWeightConfig(assessmentId) : { weights: {}, impact_threshold: 3, financial_threshold: 3 };

    const byGroup = {};
    questions.forEach(q => {
      const rs = responses.filter(r => r.question_id === q.id);
      const avg = this._weightedAvg(rs, cfg.weights);
      const tg = q.issue.theme_group;
      if (!byGroup[tg]) byGroup[tg] = { theme_group: tg, impact: [], financial: [] };
      if (avg === null) return;
      if (q.issue.dimension_tag === 'IMPACT') byGroup[tg].impact.push(avg);
      if (q.issue.dimension_tag === 'FINANCIAL' || q.issue.dimension_tag === 'OPPORTUNITY') byGroup[tg].financial.push(avg);
    });

    const points = Object.values(byGroup).map(g => {
      const y = g.impact.length ? g.impact.reduce((a, b) => a + b, 0) / g.impact.length : null;
      const x = g.financial.length ? g.financial.reduce((a, b) => a + b, 0) / g.financial.length : null;
      const groupInfo = _state.tb_issue_theme_group.find(t => t.group_code === g.theme_group);
      const stored = _state.tb_materiality_score[`${assessmentId}::${g.theme_group}`];

      const calculated = { impact: y, financial: x };
      const isAdjusted = stored && stored.is_manually_adjusted;
      const final = {
        impact: isAdjusted ? stored.impact_score_final : y,
        financial: isAdjusted ? stored.financial_score_final : x
      };

      return {
        theme_group: g.theme_group,
        theme_name: groupInfo ? groupInfo.group_name : g.theme_group,
        esrs_topic_code: groupInfo ? groupInfo.esrs_topic_code : null,
        esg_pillar: groupInfo ? groupInfo.esg_pillar : null,
        gri_code: groupInfo ? groupInfo.gri_code : null,
        assessment_id: assessmentId,
        impact_threshold: cfg.impact_threshold ?? 3,
        financial_threshold: cfg.financial_threshold ?? 3,
        has_impact_axis: y !== null,
        has_financial_axis: x !== null,
        calculated,
        final,
        is_manually_adjusted: !!isAdjusted,
        adjustment_reason: stored ? stored.adjustment_reason : null
      };
    });
    return _delay(points);
  },

  // ---------- 수동 조정 (v2.2) ----------
  async setManualOverride(assessmentId, themeGroup, { impactFinal, financialFinal, reason, adjustedBy }) {
    const assessment = _state.tb_materiality_assessment.find(a => a.id === assessmentId);
    if (assessment && assessment.status === 'FINALIZED') {
      throw new Error('확정(FINALIZED)된 평가사이클은 더 이상 수정할 수 없습니다.');
    }
    if (!reason || !reason.trim()) {
      throw new Error('조정 사유(reason)를 반드시 입력해야 합니다.');
    }
    const key = `${assessmentId}::${themeGroup}`;
    _state.tb_materiality_score[key] = {
      ..._state.tb_materiality_score[key],
      is_manually_adjusted: true,
      impact_score_final: impactFinal,
      financial_score_final: financialFinal,
      adjustment_reason: reason,
      adjusted_by: adjustedBy || '담당자',
      adjusted_at: new Date().toISOString()
    };
    _persist();
    return _delay(true);
  },

  async clearManualOverride(assessmentId, themeGroup) {
    const key = `${assessmentId}::${themeGroup}`;
    if (_state.tb_materiality_score[key]) {
      _state.tb_materiality_score[key].is_manually_adjusted = false;
    }
    _persist();
    return _delay(true);
  },

  // ---------- 수동조정 임시저장(Draft) (신규 요청기능 2.4) ----------
  // 정식 저장(setManualOverride)과 달리 사유 검증 없이 언제든 저장할 수 있는 작업 중 상태입니다.
  // 화면을 나갔다 다시 들어와도 값이 남아있고, 정식 저장 시 자동으로 지워집니다.
  async saveScoreDraft(assessmentId, themeGroup, { impactFinal, financialFinal, reason }) {
    _state.tb_score_draft[`${assessmentId}::${themeGroup}`] = {
      impact_final: impactFinal, financial_final: financialFinal, reason: reason || '',
      saved_at: new Date().toISOString()
    };
    _persist();
    return _delay(true);
  },
  async getScoreDraft(assessmentId, themeGroup) {
    return _delay(_state.tb_score_draft[`${assessmentId}::${themeGroup}`] || null);
  },
  async clearScoreDraft(assessmentId, themeGroup) {
    delete _state.tb_score_draft[`${assessmentId}::${themeGroup}`];
    _persist();
    return _delay(true);
  },

  // 일괄 임시저장: 매트릭스 화면에서 편집된 모든 지점을 한 번에 draft로 저장 (사유 검증 없음)
  async batchSaveDrafts(assessmentId, edits) {
    // edits: [{ themeGroup, impactFinal, financialFinal, reason }]
    edits.forEach(e => {
      _state.tb_score_draft[`${assessmentId}::${e.themeGroup}`] = {
        impact_final: e.impactFinal, financial_final: e.financialFinal, reason: e.reason || '',
        saved_at: new Date().toISOString()
      };
    });
    _persist();
    return _delay({ count: edits.length });
  },

  // 일괄 정식저장: 편집된 모든 지점을 한 번에 확정 반영 (사유 필수, 확정된 사이클은 차단)
  async batchSaveOverrides(assessmentId, edits, { reason, adjustedBy }) {
    if (!reason || !reason.trim()) {
      throw new Error('일괄 저장하려면 조정 사유를 입력해야 합니다.');
    }
    const assessment = _state.tb_materiality_assessment.find(a => a.id === assessmentId);
    if (assessment && assessment.status === 'FINALIZED') {
      throw new Error('확정(FINALIZED)된 평가사이클은 더 이상 수정할 수 없습니다.');
    }
    edits.forEach(e => {
      const key = `${assessmentId}::${e.themeGroup}`;
      _state.tb_materiality_score[key] = {
        ..._state.tb_materiality_score[key],
        is_manually_adjusted: true,
        impact_score_final: e.impactFinal,
        financial_score_final: e.financialFinal,
        adjustment_reason: reason,
        adjusted_by: adjustedBy || '담당자',
        adjusted_at: new Date().toISOString()
      };
      delete _state.tb_score_draft[key];
    });
    _persist();
    return _delay({ count: edits.length });
  },

  // ---------- 내부 IRO 정밀화 워크시트 (v2.6, v2.0 5장 감사요건 반영) ----------
  // 평가사이클(assessment_id)별로 키를 분리해 연도마다 별도 기록이 남도록 합니다.
  async getIROWorksheet(assessmentId, themeGroup) {
    return _delay(_state.tb_internal_iro_worksheet[`${assessmentId}::${themeGroup}`] || null);
  },

  async saveIROWorksheet(assessmentId, themeGroup, data) {
    const assessment = _state.tb_materiality_assessment.find(a => a.id === assessmentId);
    if (assessment && assessment.status === 'FINALIZED') {
      throw new Error('확정(FINALIZED)된 평가사이클은 더 이상 수정할 수 없습니다. 새 평가사이클을 만들어 이어가세요.');
    }
    if (!data.analyst_note || !data.analyst_note.trim()) {
      throw new Error('판단 근거 서술(analyst_note)은 필수입니다.');
    }

    // 기본중대 토픽(is_default_material=true)을 낮은 점수로 판정하려는 경우 별도 사유 강제 (v2.0 5장)
    const esrsTopic = await this.getEsrsTopicForThemeGroup(themeGroup);
    const lowScore = (data.impact_scale <= 2 && data.impact_likelihood <= 2);
    if (esrsTopic && esrsTopic.is_default_material && lowScore && (!data.non_material_justification || !data.non_material_justification.trim())) {
      throw new Error(`"${esrsTopic.topic_name}"은(는) 감독기관이 기본적으로 중대하다고 보는 토픽입니다. 낮은 점수로 판정하려면 별도 사유(non_material_justification)를 반드시 입력해야 합니다.`);
    }

    _state.tb_internal_iro_worksheet[`${assessmentId}::${themeGroup}`] = {
      ...data,
      assessment_id: assessmentId,
      theme_group: themeGroup,
      analyzed_at: new Date().toISOString()
    };
    _persist();
    return _delay(true);
  },

  // ---------- 대상선정 (v2.3 2장) ----------
  async saveTargetSelection(assessmentId, { method, criteria, stakeholderIds }) {
    _state.tb_target_selection[assessmentId] = {
      method, criteria, stakeholder_ids: stakeholderIds,
      status: 'DRAFT', approved_by: null, approved_at: null,
      updated_at: new Date().toISOString()
    };
    _persist();
    return _delay(true);
  },
  async getTargetSelection(assessmentId) {
    return _delay(_state.tb_target_selection[assessmentId] || null);
  },
  async approveTargetSelection(assessmentId, approvedBy) {
    const sel = _state.tb_target_selection[assessmentId];
    if (!sel) throw new Error('먼저 대상선정 기준과 대상자를 저장해주세요.');
    if (!sel.criteria || !sel.criteria.trim()) throw new Error('선정기준 서술 없이는 승인할 수 없습니다.');
    sel.status = 'APPROVED';
    sel.approved_by = approvedBy || '담당자';
    sel.approved_at = new Date().toISOString();
    _persist();
    return _delay(sel);
  },

  // ---------- 결과취합 검증·승인(Sign-off) (v2.3 5장) — 신뢰도 분석 강화판 ----------
  // 통계 유틸
  _mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; },
  _stdev(arr) {
    if (arr.length < 2) return 0;
    const m = this._mean(arr);
    return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
  },
  _quartiles(arr) {
    const sorted = [...arr].sort((a, b) => a - b);
    const q = p => {
      const idx = (sorted.length - 1) * p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };
    return { q1: q(0.25), q3: q(0.75) };
  },

  // 문항별 이상치 탐지 (IQR 방법 — 통계학 표준 기법)
  // mild: Q1-1.5*IQR ~ Q3+1.5*IQR 벗어남 / extreme: Q1-3*IQR ~ Q3+3*IQR 벗어남
  async computeQuestionOutliers(templateId) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);

    return questions.map(q => {
      const rs = responses.filter(r => r.question_id === q.id);
      const scores = rs.map(r => r.score_given);
      if (scores.length < 4) return { issue_code: q.issue_code, issue_name: q.issue.issue_name, outliers: [], note: '표본이 작아 이상치 판정 생략(n<4)' };

      const { q1, q3 } = this._quartiles(scores);
      const iqr = q3 - q1;
      const outliers = [];
      rs.forEach(r => {
        const dist = r.score_given < q1 ? q1 - r.score_given : r.score_given > q3 ? r.score_given - q3 : 0;
        if (dist > 3 * iqr && iqr > 0) outliers.push({ respondent_name: r.respondent_name, score: r.score_given, level: 'EXTREME' });
        else if (dist > 1.5 * iqr && iqr > 0) outliers.push({ respondent_name: r.respondent_name, score: r.score_given, level: 'MILD' });
      });
      return { issue_code: q.issue_code, issue_name: q.issue.issue_name, theme_group: q.issue.theme_group, outliers };
    });
  },

  // 응답자별 신뢰도 분석 — "성의없는 응답(품질)"과 "그룹평균과 다른 소수의견(관점차이)"을 분리해서 봅니다.
  async computeRespondentReliability(templateId) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);
    const totalQuestions = questions.length;

    // 문항별 평균/표준편차 (개인의 관점이 그룹과 얼마나 다른지 비교할 기준)
    const qStats = {};
    questions.forEach(q => {
      const scores = responses.filter(r => r.question_id === q.id).map(r => r.score_given);
      qStats[q.id] = { mean: this._mean(scores), std: this._stdev(scores) || 0.6 }; // std=0 방지용 최소값
    });

    const byName = {};
    responses.forEach(r => {
      if (!byName[r.respondent_name]) byName[r.respondent_name] = [];
      byName[r.respondent_name].push(r);
    });

    return Object.keys(byName).map(name => {
      const rs = byName[name];
      const scores = rs.map(r => r.score_given);
      const completionRate = rs.length / totalQuestions;
      const ownStdev = this._stdev(scores);
      const isStraightLine = scores.length >= 4 && new Set(scores).size === 1;
      const isLowVariance = !isStraightLine && scores.length >= 4 && ownStdev < 0.4;

      // 그룹 합의로부터의 평균 이탈도(|z-score| 평균) — 클수록 그룹과 다르게 봄(관점차이 지표, 품질과는 별개)
      const zScores = rs.map(r => Math.abs((r.score_given - qStats[r.question_id].mean) / qStats[r.question_id].std));
      const avgAbsZ = this._mean(zScores) || 0;

      // 신뢰도(품질) 점수 0~100: 성의없음 징후에 대해서만 감점. 관점차이는 감점하지 않음(별도 표시).
      let qualityScore = 100;
      if (isStraightLine) qualityScore -= 55;
      if (isLowVariance) qualityScore -= 25;
      qualityScore -= Math.round((1 - completionRate) * 30);
      qualityScore = Math.max(0, Math.min(100, qualityScore));

      const qualityLabel = qualityScore >= 80 ? 'HIGH' : qualityScore >= 50 ? 'MEDIUM' : 'LOW';
      const perspectiveLabel = avgAbsZ >= 1.8 ? 'DIVERGENT' : avgAbsZ >= 1.0 ? 'SOMEWHAT_DIFFERENT' : 'ALIGNED';

      return {
        respondent_name: name,
        group_type: rs[0].group_type,
        answered_count: rs.length, total_questions: totalQuestions, completion_rate: Math.round(completionRate * 100),
        own_stdev: Math.round(ownStdev * 100) / 100,
        is_straight_line: isStraightLine, is_low_variance: isLowVariance,
        avg_abs_zscore: Math.round(avgAbsZ * 100) / 100,
        quality_score: qualityScore, quality_label: qualityLabel,
        perspective_label: perspectiveLabel
      };
    }).sort((a, b) => a.quality_score - b.quality_score);
  },

  // 규칙 기반 처리 조언 엔진 (AI 호출 없이, 계산된 통계에 규칙을 적용해 생성)
  async getReliabilityAdvice(templateId) {
    const reliability = await this.computeRespondentReliability(templateId);
    const questionOutliers = await this.computeQuestionOutliers(templateId);
    const respondentCount = reliability.length;
    const advice = [];

    reliability.forEach(r => {
      if (r.quality_label === 'LOW') {
        const reasons = [];
        if (r.is_straight_line) reasons.push('전 문항 동일점수');
        if (r.is_low_variance) reasons.push('사실상 무변화 응답');
        if (r.completion_rate < 70) reasons.push(`낮은 완료율(${r.completion_rate}%)`);
        advice.push({
          respondent_name: r.respondent_name, type: 'QUALITY',
          message: `신뢰도 낮음(${r.quality_score}점) — ${reasons.join(', ')}. 취합승인 화면에서 제외를 권장합니다.`
        });
      } else if (r.perspective_label === 'DIVERGENT' && r.quality_label !== 'LOW') {
        advice.push({
          respondent_name: r.respondent_name, type: 'PERSPECTIVE',
          message: `응답 품질은 양호하나 그룹 평균과 상당히 다른 관점(평균 이탈도 ${r.avg_abs_zscore}) — 제외보다는 **소수의견으로 유지**하고, 왜 다른 시각인지 추가 확인(인터뷰 등)을 권장합니다.`
        });
      }
    });

    // 표본 크기 경고
    if (respondentCount > 0 && respondentCount < 10) {
      advice.push({
        respondent_name: null, type: 'SAMPLE_SIZE',
        message: `현재 응답자가 ${respondentCount}명으로 적어, 응답 1건이 평균에 미치는 영향이 큽니다. 이상치를 제외하기보다 응답자를 더 확보하는 것을 우선 권장합니다.`
      });
    }

    // 문항 단위로 이상치가 몰린 경우, 특정 이해관계자 그룹 편중 여부 확인 권고
    const responses = await this.listResponses(templateId);
    questionOutliers.forEach(qo => {
      if (qo.outliers && qo.outliers.length >= 2) {
        const groups = qo.outliers.map(o => {
          const r = responses.find(x => x.respondent_name === o.respondent_name);
          return r ? r.group_type : null;
        }).filter(Boolean);
        const uniqueGroups = new Set(groups);
        if (uniqueGroups.size === 1 && groups.length >= 2) {
          advice.push({
            respondent_name: null, type: 'GROUP_BIAS',
            message: `"${qo.issue_name}" 문항에서 ${[...uniqueGroups][0]} 그룹 응답자 ${groups.length}명이 나란히 이상치로 탐지되었습니다 — 개인 편차가 아니라 그 그룹의 공통된 인식일 가능성이 있으니 그룹별 평균을 별도로 검토하는 것을 권장합니다.`
          });
        }
      }
    });

    return advice;
  },

  // 이상응답 탐지 (기존 signoff 화면 호환용 — 신뢰도 LOW 응답자만 추려서 반환)
  // ---------- ② 매트릭스 신뢰구간(표본 불확실성) 계산 ----------
  // theme_group의 각 축(영향/재무)에 실제로 기여한 개별 응답 점수를 전부 모아 SEM(표준오차)을 구하고,
  // 95% 신뢰구간(margin = 1.96*SEM)을 산출합니다. 표본이 작을수록 margin이 커집니다.
  async computeMatrixConfidence(templateId) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);
    const byGroup = {};

    questions.forEach(q => {
      const tg = q.issue.theme_group;
      if (!byGroup[tg]) byGroup[tg] = { impact: [], financial: [] };
      const scores = responses.filter(r => r.question_id === q.id).map(r => r.score_given);
      if (q.issue.dimension_tag === 'IMPACT') byGroup[tg].impact.push(...scores);
      if (q.issue.dimension_tag === 'FINANCIAL' || q.issue.dimension_tag === 'OPPORTUNITY') byGroup[tg].financial.push(...scores);
    });

    const result = {};
    Object.keys(byGroup).forEach(tg => {
      const imp = byGroup[tg].impact, fin = byGroup[tg].financial;
      const impSem = imp.length > 1 ? this._stdev(imp) / Math.sqrt(imp.length) : null;
      const finSem = fin.length > 1 ? this._stdev(fin) / Math.sqrt(fin.length) : null;
      result[tg] = {
        impact_n: imp.length, financial_n: fin.length,
        impact_margin: impSem !== null ? Math.round(1.96 * impSem * 100) / 100 : null,
        financial_margin: finSem !== null ? Math.round(1.96 * finSem * 100) / 100 : null
      };
    });
    return _delay(result);
  },

  // ---------- ③ 이해관계자 그룹 간 합의도 대시보드 ----------
  async computeGroupConsensus(templateId) {
    const { questions } = await this.getSurveyTemplate(templateId);
    const responses = await this.listResponses(templateId);
    const groups = [...new Set(responses.map(r => r.group_type))];
    if (groups.length < 2) return _delay({ groups, pairs: [] });

    // 그룹별 문항 평균표
    const groupAvg = {};
    groups.forEach(g => {
      groupAvg[g] = {};
      questions.forEach(q => {
        const scores = responses.filter(r => r.question_id === q.id && r.group_type === g).map(r => r.score_given);
        groupAvg[g][q.issue_code] = scores.length ? this._mean(scores) : null;
      });
    });

    const pairs = [];
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const gA = groups[i], gB = groups[j];
        const diffs = [];
        const issueDiffs = [];
        questions.forEach(q => {
          const a = groupAvg[gA][q.issue_code], b = groupAvg[gB][q.issue_code];
          if (a !== null && b !== null) {
            const d = Math.abs(a - b);
            diffs.push(d);
            issueDiffs.push({ issue_code: q.issue_code, issue_name: q.issue.issue_name, a, b, diff: Math.round(d * 100) / 100 });
          }
        });
        if (diffs.length === 0) continue;
        const avgDiff = this._mean(diffs);
        const agreementScore = Math.max(0, Math.round((1 - avgDiff / 4) * 100)); // 1~5점 척도, 최대차이 4
        issueDiffs.sort((x, y) => y.diff - x.diff);
        pairs.push({
          group_a: gA, group_b: gB, agreement_score: agreementScore,
          most_divergent: issueDiffs.slice(0, 3)
        });
      }
    }
    pairs.sort((a, b) => a.agreement_score - b.agreement_score); // 합의도 낮은(이견 큰) 쌍부터
    return _delay({ groups, pairs });
  },

  // ---------- ④ 이상치 처리 이력 로그 ----------
  async listExclusionLog(assessmentId) {
    const templateIds = _state.tb_survey_template.filter(t => t.assessment_id === assessmentId).map(t => t.id);
    return _delay((_state.tb_exclusion_log || [])
      .filter(e => templateIds.includes(e.template_id))
      .sort((a, b) => b.excluded_at.localeCompare(a.excluded_at)));
  },
  async listAllExclusionLog() {
    return _delay([...(_state.tb_exclusion_log || [])].sort((a, b) => b.excluded_at.localeCompare(a.excluded_at)));
  },

  // 이상응답 탐지 (기존 signoff 화면 호환용 — 신뢰도 LOW 응답자만 추려서 반환)
  async detectAnomalousRespondents(templateId) {
    const reliability = await this.computeRespondentReliability(templateId);
    return reliability.filter(r => r.quality_label === 'LOW').map(r => ({
      respondent_name: r.respondent_name,
      reason: r.is_straight_line
        ? `전체 ${r.answered_count}문항에 동일점수만 응답(성의없는 응답 의심)`
        : `완료율 ${r.completion_rate}% 또는 응답 변동성이 낮아 신뢰도 ${r.quality_score}점으로 판정됨`
    }));
  },

  async signOffAggregation(templateId, { excludedNames, exclusionReason, signedOffBy }) {
    if (excludedNames.length > 0 && (!exclusionReason || !exclusionReason.trim())) {
      throw new Error('응답을 제외하려면 제외 사유를 입력해야 합니다.');
    }
    // 제외 대상 응답을 실제로 제거 + 제외이력 로그 기록(append-only, 감사대응용)
    if (excludedNames.length > 0) {
      const now = new Date().toISOString();
      excludedNames.forEach(name => {
        _state.tb_exclusion_log.push({
          id: _uuid(), template_id: templateId, respondent_name: name,
          reason: exclusionReason, excluded_by: signedOffBy || '담당자', excluded_at: now
        });
      });
      _state.tb_stakeholder_response = _state.tb_stakeholder_response.filter(
        r => !(r.template_id === templateId && excludedNames.includes(r.respondent_name))
      );
    }
    _state.tb_aggregation_signoff[templateId] = {
      excluded_names: excludedNames, exclusion_reason: exclusionReason || null,
      signed_off_by: signedOffBy || '담당자', signed_off_at: new Date().toISOString()
    };
    _persist();
    return _delay(true);
  },
  async getAggregationSignoff(templateId) {
    return _delay(_state.tb_aggregation_signoff[templateId] || null);
  },

  // ---------- 자동 오류탐지 엔진 (신규 요청기능) ----------
  // 평가사이클(assessment) 하나를 기준으로 전체 파이프라인을 훑어 문제를 리스트업합니다.
  // severity: 'ERROR'(진행 막힘) | 'WARN'(권고)
  async runWorkflowChecks(assessmentId) {
    const issues = [];
    const assessment = _state.tb_materiality_assessment.find(a => a.id === assessmentId);
    if (!assessment) return _delay(issues);

    const templates = _state.tb_survey_template.filter(t => t.assessment_id === assessmentId);
    const targetSel = _state.tb_target_selection[assessmentId];

    // ① 대상선정 단계 체크
    if (!targetSel) {
      issues.push({ severity: 'WARN', step: 1, code: 'NO_TARGET_SELECTION', message: '대상선정이 아직 이루어지지 않았습니다.', link: `#/target-selection/${assessmentId}` });
    } else if (targetSel.status !== 'APPROVED') {
      issues.push({ severity: 'WARN', step: 1, code: 'TARGET_NOT_APPROVED', message: '대상선정이 승인 대기 중입니다.', link: `#/target-selection/${assessmentId}` });
    }

    // ② 설문 존재 여부
    if (templates.length === 0) {
      issues.push({ severity: 'WARN', step: 2, code: 'NO_SURVEY', message: '설문지가 아직 작성되지 않았습니다.', link: `#/survey-builder/${assessmentId}` });
    }

    for (const t of templates) {
      const responses = _state.tb_stakeholder_response.filter(r => r.template_id === t.id);
      const respondentCount = new Set(responses.map(r => r.respondent_name)).size;

      // ③ 실사(응답) 진행 여부
      if (respondentCount === 0) {
        issues.push({ severity: 'WARN', step: 3, code: 'NO_RESPONSES', message: `설문 "${t.title}"에 응답이 없습니다.`, link: `#/respond/${t.id}` });
        continue;
      }
      if (targetSel && targetSel.stakeholder_ids?.length) {
        const rate = respondentCount / targetSel.stakeholder_ids.length;
        if (rate < 0.5) {
          issues.push({ severity: 'WARN', step: 3, code: 'LOW_RESPONSE_RATE', message: `"${t.title}" 응답률이 낮습니다(${respondentCount}/${targetSel.stakeholder_ids.length}, ${Math.round(rate*100)}%).`, link: `#/analysis/${t.id}` });
        }
      }

      // ④ 이상응답 및 취합승인 체크
      const anomalies = await this.detectAnomalousRespondents(t.id);
      if (anomalies.length > 0) {
        issues.push({ severity: 'ERROR', step: 4, code: 'ANOMALOUS_RESPONSES', message: `"${t.title}"에 이상응답 의심 ${anomalies.length}건이 있습니다(취합승인에서 확인 필요).`, link: `#/signoff/${t.id}` });
      }
      const signoff = _state.tb_aggregation_signoff[t.id];
      if (!signoff) {
        issues.push({ severity: 'WARN', step: 4, code: 'NO_SIGNOFF', message: `"${t.title}" 결과취합이 아직 승인되지 않았습니다.`, link: `#/signoff/${t.id}` });
      }

      // ⑥ 이중중대 이슈에 대한 내부 IRO 워크시트(감사근거) 누락 체크
      const points = await this.getQuadrantData(t.id);
      for (const p of points) {
        if (!p.has_impact_axis || !p.has_financial_axis) continue;
        if (p.final.impact >= p.impact_threshold && p.final.financial >= p.financial_threshold) {
          const ws = _state.tb_internal_iro_worksheet[`${assessmentId}::${p.theme_group}`];
          if (!ws || !ws.analyst_note) {
            issues.push({ severity: 'WARN', step: 6, code: 'MISSING_IRO', message: `이중중대 이슈 "${p.theme_name}"의 내부 IRO 워크시트 근거가 없습니다.`, link: `#/iro/${assessmentId}/${p.theme_group}` });
          }
        }
      }
    }

    // ⑦ 확정 가능 여부
    if (assessment.status === 'IN_PROGRESS' && templates.length > 0 && issues.filter(i => i.severity === 'ERROR').length === 0) {
      const allSignedOff = templates.every(t => _state.tb_aggregation_signoff[t.id]);
      if (allSignedOff) {
        issues.push({ severity: 'INFO', step: 7, code: 'READY_TO_FINALIZE', message: '모든 점검을 통과했습니다 — 평가사이클을 확정할 준비가 되었습니다.', link: `#/assessments` });
      }
    }

    return _delay(issues);
  },

  // ---------- 지속가능경영보고서 반영 (v2.3 7장) ----------
  // AI 없이 결정론적으로 데이터를 그대로 조립합니다(수치 왜곡 방지 원칙).
  async buildReportDraft(assessmentId) {
    const assessment = _state.tb_materiality_assessment.find(a => a.id === assessmentId);
    if (!assessment) throw new Error('평가사이클을 찾을 수 없습니다.');
    const templates = _state.tb_survey_template.filter(t => t.assessment_id === assessmentId);
    const targetSel = _state.tb_target_selection[assessmentId];

    let allPoints = [];
    let totalRespondents = 0, totalQuestions = 0;
    for (const t of templates) {
      const points = await this.getQuadrantData(t.id);
      allPoints = allPoints.concat(points);
      totalRespondents += new Set(_state.tb_stakeholder_response.filter(r => r.template_id === t.id).map(r => r.respondent_name)).size;
      totalQuestions += _state.tb_survey_question.filter(q => q.template_id === t.id).length;
    }

    const material = allPoints
      .filter(p => p.has_impact_axis && p.has_financial_axis && p.final.impact >= p.impact_threshold && p.final.financial >= p.financial_threshold)
      .sort((a, b) => (b.final.impact + b.final.financial) - (a.final.impact + a.final.financial));

    const lines = [];
    lines.push(`# ${assessment.report_year}년 이중중대성 평가 결과`);
    lines.push('');
    lines.push('## 평가 방법론');
    lines.push(`본 평가는 이슈풀 기반 이해관계자 설문(1~5점 척도)을 실시하고, 영향중대성과 재무중대성을 각각 산출한 뒤 사사분위 매트릭스로 종합하는 방식으로 진행되었습니다.`);
    if (targetSel) lines.push(`대상 선정기준: ${targetSel.criteria || '(미기재)'}`);
    lines.push(`총 문항 수: ${totalQuestions}개, 총 응답자 수: ${totalRespondents}명.`);
    lines.push('');
    lines.push('## 중대 이슈 선정 결과');
    if (material.length === 0) {
      lines.push('현재 임계값 기준으로 이중 중대 이슈가 도출되지 않았습니다.');
    } else {
      lines.push('| 순위 | 분야 | 중대이슈 | Financial Materiality | Impact Materiality | GRI |');
      lines.push('|---|---|---|---|---|---|');
      material.forEach((p, i) => {
        lines.push(`| ${i+1} | ${ESG_PILLAR_LABEL[p.esg_pillar] || '-'} | ${p.theme_name} | ${levelOf(p.final.financial)} | ${levelOf(p.final.impact)} | ${p.gri_code || '-'} |`);
      });
    }
    lines.push('');
    lines.push('## 이해관계자 참여');
    lines.push(`설문은 ${templates.length}개 배포되었으며, 총 ${totalRespondents}명이 응답했습니다.`);
    lines.push('');
    lines.push('## 내부 정밀분석(IRO) 근거 요약');
    material.forEach(p => {
      const ws = _state.tb_internal_iro_worksheet[`${assessmentId}::${p.theme_group}`];
      lines.push(`### ${p.theme_name}`);
      lines.push(ws && ws.analyst_note ? ws.analyst_note : '(내부 IRO 워크시트 근거 미작성)');
      lines.push('');
    });
    lines.push('---');
    lines.push(`문서 생성: ${new Date().toISOString()} · 이 문서는 시스템이 저장된 데이터를 그대로 조립한 것으로, AI 재작성을 거치지 않았습니다.`);

    return lines.join('\n');
  },

  // ---------- 초기화(데모용) ----------
  async resetAll() {
    localStorage.removeItem(STORAGE_KEY);
    _state = _loadState();
    return _delay(true);
  }
};
