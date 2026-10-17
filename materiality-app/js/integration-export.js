/**
 * integration-export.js — Smart ESG(본편) 연계 모듈
 *
 * 목적: 중대성평가 모듈(standalone)에서 산출한 결과를 Smart ESG DMA가 그대로
 *       가져올 수 있도록 표준 계약 파일(materiality-result.json, contract_version 1.0)로
 *       내보냅니다. 서버 없이 파일만으로 연계됩니다.
 *
 * 사용: 보고서 반영(#/report/:aid) 화면의 "🔗 Smart ESG 연계 파일 내보내기" 버튼.
 *      콘솔에서 직접 호출도 가능: await downloadIntegrationBundle('<assessmentId>')
 *
 * 계약 정의: Smart_ESG_Materiality_App_통합설계안_v1.0.md §3 참고.
 * 이 파일은 기존 페이지/스토어를 수정하지 않으며, 전역 함수만 추가합니다.
 */

const PILLAR_LABEL = { E: '환경', S: '사회', G: '지배구조' };

async function exportIntegrationBundle(assessmentId) {
  const assessment = await db.getAssessment(assessmentId);
  if (!assessment) throw new Error('평가사이클을 찾을 수 없습니다.');

  const [templates, groups, stakeholders] = await Promise.all([
    db.listSurveyTemplates(assessmentId),
    db.listThemeGroups(),
    db.listStakeholders(),
  ]);
  const groupByCode = {};
  (groups || []).forEach(g => { groupByCode[g.group_code] = g; });

  const acc = {};
  for (const t of templates || []) {
    let points = [];
    let summary = null, conf = null;
    try { points = await db.getQuadrantData(t.id); } catch (e) { points = []; }
    try { summary = await db.computeSurveySampleSummary(t.id); } catch (e) { summary = null; }
    try { conf = await db.computeMatrixConfidence(t.id); } catch (e) { conf = null; }

    for (const p of points) {
      const g = acc[p.theme_group] || (acc[p.theme_group] = {
        point: p, respondents: 0, margin: null, impact_margin: null, financial_margin: null
      });
      g.respondents += (summary && summary.total) || 0;
      if (summary && summary.marginOfErrorPct != null) {
        g.margin = g.margin == null ? summary.marginOfErrorPct : Math.max(g.margin, summary.marginOfErrorPct);
      }
      if (conf && conf[p.theme_group]) {
        const c = conf[p.theme_group];
        if (c.impact_margin != null) g.impact_margin = Math.max(g.impact_margin == null ? 0 : g.impact_margin, c.impact_margin);
        if (c.financial_margin != null) g.financial_margin = Math.max(g.financial_margin == null ? 0 : g.financial_margin, c.financial_margin);
      }
      if (p.is_manually_adjusted) g.point = p;
    }
  }

  const poolFor = tg => ISSUE_POOL.filter(i => i.theme_group === tg).map(i => i.issue_code);

  const issues = Object.keys(acc).map(tg => {
    const g = acc[tg];
    const p = g.point;
    const info = groupByCode[tg] || {};
    const ith = p.impact_threshold != null ? p.impact_threshold : 3;
    const fth = p.financial_threshold != null ? p.financial_threshold : 3;
    const hasI = !!p.has_impact_axis && p.final.impact != null;
    const hasF = !!p.has_financial_axis && p.final.financial != null;
    const impact = round1(p.final.impact);
    const financial = round1(p.final.financial);
    let quad = 'NONE';
    if (hasI && hasF) quad = (impact >= ith && financial >= fth) ? 'DOUBLE' : impact >= ith ? 'IMPACT_ONLY' : financial >= fth ? 'FINANCIAL_ONLY' : 'NONE';
    else if (hasI) quad = impact >= ith ? 'IMPACT_ONLY' : 'NONE';
    else if (hasF) quad = financial >= fth ? 'FINANCIAL_ONLY' : 'NONE';
    const worst = Math.max(g.impact_margin || 0, g.financial_margin || 0);
    const reliability = (g.impact_margin == null && g.financial_margin == null) ? '' : worst <= 0.5 ? 'HIGH' : worst <= 1.0 ? 'MEDIUM' : 'LOW';
    const poolCodes = poolFor(tg);
    return {
      issue_code: poolCodes[0] || tg,
      issue_codes: poolCodes,
      issue_name: p.theme_name || info.group_name || tg,
      theme_group: tg,
      esrs_topic: p.esrs_topic_code || info.esrs_topic_code || '',
      pillar: PILLAR_LABEL[p.esg_pillar || info.esg_pillar] || '',
      gri_code: p.gri_code || info.gri_code || '',
      dimension: (hasI && !hasF) ? 'IMPACT' : (!hasI && hasF) ? 'FINANCIAL' : 'IMPACT',
      has_impact_axis: hasI,
      has_financial_axis: hasF,
      impact_score: impact == null ? 0 : impact,
      financial_score: financial == null ? 0 : financial,
      quadrant: quad,
      material: hasI && hasF && impact >= ith && financial >= fth,
      reliability,
      sample_n: g.respondents,
      sample_error_pct: g.margin,
      evidence_note: p.is_manually_adjusted ? ('수동조정: ' + (p.adjustment_reason || '')) : '',
      threshold_impact: ith,
      threshold_financial: fth
    };
  });

  const stakeholder_groups = (stakeholders || []).map(s => ({
    group_type: s.category || 'ETC', name: s.name || s.category || '이해관계자', weight: 1, respondents: 0
  }));

  let exclusions = [];
  try {
    const log = await db.listExclusionLog(assessmentId);
    exclusions = (log || []).map(e => ({ respondent: e.respondent_name, reason: e.reason, excluded_by: e.excluded_by, at: e.excluded_at }));
  } catch (e) { exclusions = []; }

  const iro_worksheets = [];
  for (const tg of Object.keys(acc)) {
    try {
      const ws = await db.getIROWorksheet(assessmentId, tg);
      if (ws) iro_worksheets.push({
        theme_group: tg,
        esrs_topic: (groupByCode[tg] || {}).esrs_topic_code || '',
        scale: ws.impact_scale, scope: ws.scope, irremediability: ws.irremediability,
        likelihood: ws.impact_likelihood, time_horizon: ws.time_horizon, analyst_note: ws.analyst_note
      });
    } catch (e) { /* skip */ }
  }

  let signoff = null;
  try { if (templates && templates[0]) signoff = await db.getAggregationSignoff(templates[0].id); } catch (e) { signoff = null; }
  let wc = null;
  try { wc = await db.getWeightConfig(assessmentId); } catch (e) { wc = null; }

  return {
    contract_version: '1.0',
    source_app: 'materiality-app',
    source_version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
    exported_at: new Date().toISOString(),
    assessment: {
      assessment_id: assessment.id,
      year: assessment.report_year,
      method: assessment.method || 'DOUBLE_MATERIALITY',
      status: assessment.status,
      approved_by: (signoff && signoff.signed_off_by) || assessment.finalized_by || '',
      approved_at: assessment.finalized_at || (signoff && signoff.signed_off_at) || '',
      thresholds: {
        impact: (wc && wc.impact_threshold) != null ? wc.impact_threshold : 3,
        financial: (wc && wc.financial_threshold) != null ? wc.financial_threshold : 3
      }
    },
    stakeholder_groups,
    issues,
    exclusions,
    iro_worksheets
  };
}

async function downloadIntegrationBundle(assessmentId) {
  const bundle = await exportIntegrationBundle(assessmentId);
  const year = bundle.assessment.year || '';
  downloadTextFile(`materiality-result-${year}-v${bundle.source_version}.json`, JSON.stringify(bundle, null, 2), 'application/json');
  return bundle;
}

function round1(v) { return v == null ? null : Math.round(v * 10) / 10; }
