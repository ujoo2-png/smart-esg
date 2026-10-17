/**
 * pages.js — 화면별 렌더 함수 모음
 * 각 함수는 (container) 또는 (container, params)를 받아 innerHTML을 채우고
 * 이벤트를 바인딩합니다. 라우팅은 app.js에서 처리합니다.
 */

const DIMENSION_LABEL = { IMPACT: '영향', FINANCIAL: '재무', OPPORTUNITY: '기회' };
const DIMENSION_COLOR = { IMPACT: '#b8860b', FINANCIAL: '#2f6fed', OPPORTUNITY: '#1f9d63' };

function esc(s) { return (s ?? '').toString().replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ============================================================
// S-ESRS. ESRS 1 AR16 토픽 마스터 (v2.0 2장)
// ============================================================
async function pageESRSTopics(container, token) {
  const [topics, groups] = await Promise.all([db.listESRSTopics(), db.listThemeGroups()]);
  if (!isCurrent(token)) return;

  container.innerHTML = `
    <div class="page-head">
      <h1>ESRS 토픽 마스터</h1>
      <div class="bc">중대성평가 &gt; ESRS 1 AR16 토픽 (설계문서 v2.0 2장) · 내부 IRO 워크시트가 이 토픽 기준으로 정밀화됩니다</div>
    </div>
    <div class="notice-box">
      기후변화(E1)처럼 <b>기본중대(is_default_material)</b>로 표시된 토픽은, 이 토픽에 연결된 테마그룹을
      내부 워크시트에서 낮은 점수로 판정하려 할 때 별도 사유 입력이 강제됩니다.
    </div>
    <div class="issue-list">
      ${topics.map(t => `
        <div class="issue-card">
          <div class="issue-card-top">
            <span class="issue-code">${t.topic_code}</span>
            ${t.is_default_material ? '<span class="dim-badge" style="background:#fdeaea;color:#c0392b;">기본중대</span>' : `<span class="dim-badge" style="background:#eef0f2;color:#6b7480;">${t.esrs_area}</span>`}
          </div>
          <div class="issue-name">${esc(t.topic_name)}</div>
          <div class="issue-theme">연결된 테마그룹: ${groups.filter(g => g.esrs_topic_code === t.topic_code).map(g => g.group_name).join(', ') || '(없음)'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================================
// S-STK. 이해관계자 마스터 (v2.0 2-3장)
// ============================================================
const STAKEHOLDER_CATEGORY = { EMPLOYEE: '종업원', PARTNER: '파트너(협력사)', CUSTOMER: '고객', INVESTOR: '투자자', COMMUNITY: '지역사회' };
const STAKEHOLDER_ROLE = { AFFECTED_STAKEHOLDER: '영향을 받는 당사자(영향중대성 참여)', INFORMATION_USER: '정보이용자(재무중대성 참여)' };

async function pageStakeholders(container, token) {
  const list = await db.listStakeholders();
  if (!isCurrent(token)) return;

  container.innerHTML = `
    <div class="page-head">
      <h1>이해관계자 관리</h1>
      <div class="bc">중대성평가 &gt; 이해관계자 마스터 (등록 후 설문 응답 시 재사용)</div>
    </div>

    <div class="card">
      <label class="field-label">이름</label>
      <input id="stk-name" class="text-input" placeholder="예: 김도현">
      <label class="field-label">소속 구분</label>
      <select id="stk-category">
        ${Object.entries(STAKEHOLDER_CATEGORY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <label class="field-label">역할 유형</label>
      <select id="stk-role">
        ${Object.entries(STAKEHOLDER_ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
      </select>
      <button id="btn-add-stakeholder" class="btn primary" style="width:100%;margin-top:8px;">등록</button>
    </div>

    <div id="stk-list"></div>
  `;

  function renderList(items) {
    document.getElementById('stk-list').innerHTML = items.length === 0
      ? '<div class="card mini">등록된 이해관계자가 없습니다.</div>'
      : items.map(s => `
        <div class="card template-card">
          <div>
            <div class="tc-title">${esc(s.name)} <span class="mini">${STAKEHOLDER_CATEGORY[s.category] || s.category}</span></div>
            <div class="mini">${STAKEHOLDER_ROLE[s.role_type] || s.role_type}</div>
          </div>
          <button class="btn ghost small" data-del="${s.id}">삭제</button>
        </div>
      `).join('');

    document.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await db.deleteStakeholder(btn.dataset.del);
        const fresh = await db.listStakeholders();
        renderList(fresh);
      });
    });
  }
  renderList(list);

  document.getElementById('btn-add-stakeholder').addEventListener('click', async () => {
    const name = document.getElementById('stk-name').value.trim();
    if (!name) { alert('이름을 입력해주세요.'); return; }
    try {
      await db.registerStakeholder({
        name,
        category: document.getElementById('stk-category').value,
        roleType: document.getElementById('stk-role').value
      });
      const fresh = await db.listStakeholders();
      renderList(fresh);
      document.getElementById('stk-name').value = '';
    } catch (e) {
      alert(e.message);
    }
  });
}

// ============================================================
// S-ASSESS. 평가사이클(연도별) 관리 (v2.0/v2.3)
// ============================================================
const ASSESSMENT_STATUS_LABEL = {
  IN_PROGRESS: '진행중', COMPLETED: '완료', FINALIZED: '확정(FINALIZED)', CARRIED_FORWARD: '전년도 이월'
};

async function pageAssessments(container, token) {
  const list = await db.listAssessments();
  if (!isCurrent(token)) return;

  container.innerHTML = `
    <div class="page-head">
      <h1>평가사이클 관리</h1>
      <div class="bc">중대성평가 &gt; 연도별 평가사이클 (v2.0 2-2장 / v2.3 6장 확정·이월)</div>
    </div>

    <div class="card">
      <label class="field-label">신규 평가사이클 생성</label>
      <div style="display:flex;gap:8px;">
        <input id="new-year" type="number" class="text-input" value="${new Date().getFullYear()}" style="width:120px;">
        <button id="btn-create-assessment" class="btn primary">생성</button>
      </div>
    </div>

    <div id="assess-list"></div>
  `;

  function renderList(items) {
    document.getElementById('assess-list').innerHTML = items.length === 0
      ? '<div class="card mini">아직 평가사이클이 없습니다.</div>'
      : items.map(a => `
        <div class="card">
          <div class="template-card">
            <div>
              <div class="tc-title">${a.report_year}년 평가사이클</div>
              <div class="mini">${ASSESSMENT_STATUS_LABEL[a.status]} · 생성 ${new Date(a.created_at).toLocaleDateString('ko-KR')}
                ${a.finalized_at ? ` · 확정 ${new Date(a.finalized_at).toLocaleDateString('ko-KR')} (${esc(a.finalized_by)})` : ''}
                ${a.change_trigger_note ? ` · 이월사유: ${esc(a.change_trigger_note)}` : ''}
              </div>
            </div>
            <div class="tc-links">
              <a href="#/survey-builder/${a.id}">설문작성</a>
              <a href="#/exclusion-history/${a.id}">이상치이력</a>
            </div>
          </div>
          ${a.status !== 'FINALIZED' ? `
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button class="btn ghost small" data-finalize="${a.id}">확정(FINALIZED)</button>
            <button class="btn ghost small" data-carry="${a.id}">다음 연도로 이월</button>
          </div>` : ''}
        </div>
      `).join('');

    document.querySelectorAll('[data-finalize]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await db.finalizeAssessment(btn.dataset.finalize, '담당자');
          const fresh = await db.listAssessments();
          renderList(fresh);
        } catch (e) { alert(e.message); }
      });
    });
    document.querySelectorAll('[data-carry]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const note = prompt('이월 사유를 입력해주세요 (예: "사업모델·가치사슬에 유의미한 변화 없음"):');
        if (note === null) return;
        const src = items.find(x => x.id === btn.dataset.carry);
        try {
          await db.carryForwardAssessment(btn.dataset.carry, { reportYear: src.report_year + 1, note });
          const fresh = await db.listAssessments();
          renderList(fresh);
        } catch (e) { alert(e.message); }
      });
    });
  }
  renderList(list);

  document.getElementById('btn-create-assessment').addEventListener('click', async () => {
    try {
      await db.createAssessment({ reportYear: Number(document.getElementById('new-year').value) });
      const fresh = await db.listAssessments();
      renderList(fresh);
    } catch (e) { alert(e.message); }
  });
}


const SCORE_COLORS = ['#c0392b', '#e8a798', '#c7ccd4', '#a8c3f0', '#2f6fed'];
const SCORE_LABELS_5 = ['매우 낮음(1)', '낮음(2)', '보통(3)', '높음(4)', '매우 높음(5)'];

// ============================================================
// S-DIST. 문항별 응답분포 시각화 (신규 요청기능 — 참고이미지 4개 유형 반영)
// ============================================================
async function pageDistribution(container, templateId, token) {
  const [{ template }, dist] = await Promise.all([db.getSurveyTemplate(templateId), db.computeResponseDistribution(templateId)]);
  if (!isCurrent(token)) return;
  if (!template) { container.innerHTML = `<div class="card">설문을 찾을 수 없습니다.</div>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <h1>문항별 응답분포 분석</h1>
      <div class="bc">${esc(template.title)} · 답변 유형별 시각화</div>
    </div>

    <div class="card">
      <div class="field-label">① 양방향 발산 차트 — 문항별 긍정/부정 비율 한눈에 비교</div>
      <div class="mini" style="margin-bottom:8px;">중립(3점)을 중앙에 놓고, 왼쪽은 부정(1~2점), 오른쪽은 긍정(4~5점) 비율입니다.</div>
      <div id="diverging-chart"></div>
    </div>

    <div class="card">
      <label class="field-label">② 문항 선택 — 막대차트 · 비율차트 · 유닛차트로 상세 보기</label>
      <select id="dist-question-select" class="text-input">
        ${dist.map((d, i) => `<option value="${i}">${d.issue_code} — ${esc(d.issue_name)}</option>`).join('')}
      </select>
      <div id="question-detail" style="margin-top:14px;"></div>
    </div>
  `;

  // ① 양방향 발산 차트 (전체 문항, 참고이미지4)
  document.getElementById('diverging-chart').innerHTML = dist.map(d => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11.5px;">
      <span style="width:150px;flex:none;" class="mini">${d.issue_code} ${esc(d.issue_name)}</span>
      <div style="flex:1;display:flex;align-items:center;height:18px;position:relative;background:#f4f6f8;border-radius:4px;overflow:hidden;">
        <div style="position:absolute;left:0;right:0;top:0;bottom:0;display:flex;">
          <div style="flex:1;display:flex;justify-content:flex-end;">
            <div style="width:${d.negative_pct}%;background:${SCORE_COLORS[0]};height:100%;"></div>
          </div>
          <div style="width:1px;background:#8a919c;"></div>
          <div style="flex:1;display:flex;">
            <div style="width:${d.positive_pct}%;background:${SCORE_COLORS[4]};height:100%;"></div>
          </div>
        </div>
      </div>
      <span style="width:90px;flex:none;text-align:right;">부정${d.negative_pct}% · 긍정${d.positive_pct}%</span>
    </div>
  `).join('');

  function renderQuestionDetail(idx) {
    const d = dist[idx];
    const maxCount = Math.max(...d.counts, 1);

    document.getElementById('question-detail').innerHTML = `
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;">${d.issue_code} — ${esc(d.issue_name)} <span class="mini">(n=${d.total})</span></div>

      <div class="mini" style="margin-bottom:4px;">막대 차트 (응답 수)</div>
      <div style="display:flex;align-items:flex-end;gap:10px;height:120px;margin-bottom:16px;">
        ${d.counts.map((c, i) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;">
            <span class="mini">${c}</span>
            <div style="width:60%;background:${SCORE_COLORS[i]};height:${(c/maxCount*90)||1}px;border-radius:4px 4px 0 0;"></div>
          </div>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-bottom:16px;">
        ${SCORE_LABELS_5.map((l, i) => `<span style="flex:1;text-align:center;font-size:10.5px;color:${SCORE_COLORS[i]};font-weight:700;">${l}</span>`).join('')}
      </div>

      <div class="mini" style="margin-bottom:4px;">비율 스택 차트 (%)</div>
      <div style="display:flex;height:36px;border-radius:6px;overflow:hidden;margin-bottom:16px;">
        ${d.pct.map((p, i) => p > 0 ? `<div style="width:${p}%;background:${SCORE_COLORS[i]};display:flex;align-items:center;justify-content:center;color:#fff;font-size:10.5px;font-weight:700;">${p}%</div>` : '').join('')}
      </div>

      <div class="mini" style="margin-bottom:4px;">유닛 차트 (응답 1건 = 점 1개)</div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${d.counts.map((c, i) => c > 0 ? `
          <div style="display:flex;flex-wrap:wrap;gap:2px;max-width:180px;align-items:center;">
            ${Array.from({length: c}).map(() => `<span style="width:8px;height:8px;border-radius:50%;background:${SCORE_COLORS[i]};display:inline-block;"></span>`).join('')}
          </div>` : '').join('')}
      </div>
    `;
  }
  renderQuestionDetail(0);
  document.getElementById('dist-question-select').addEventListener('change', (e) => renderQuestionDetail(Number(e.target.value)));
}

// ============================================================
// S-PIPE. 업무 파이프라인 대시보드 (v2.3 8장, 신규 요청기능: 업무순서 메뉴)
// 7단계: 대상선정→설문작성→실사→취합승인→분석→매트릭스확정→보고서반영
// ============================================================
const PIPELINE_STEPS = [
  { step: 1, label: '대상선정', route: a => `#/target-selection/${a}` },
  { step: 2, label: '설문작성', route: a => `#/survey-builder/${a}` },
  { step: 3, label: '실사(응답)', route: (a, t) => t ? `#/respond/${t}` : `#/survey-builder/${a}` },
  { step: 4, label: '취합승인', route: (a, t) => t ? `#/signoff/${t}` : `#/survey-builder/${a}` },
  { step: 5, label: '분석', route: (a, t) => t ? `#/analysis/${t}` : `#/survey-builder/${a}` },
  { step: 6, label: '매트릭스확정', route: (a, t) => t ? `#/matrix/${t}` : `#/survey-builder/${a}` },
  { step: 7, label: '보고서반영', route: a => `#/report/${a}` },
];

async function pagePipeline(container, token) {
  const assessments = await db.listAssessments();
  if (!isCurrent(token)) return;

  if (assessments.length === 0) {
    container.innerHTML = `
      <div class="page-head"><h1>중대성평가 파이프라인</h1><div class="bc">중대성평가 모듈 (Smart ESG 연동 예정)</div></div>
      <div class="notice-box">아직 평가사이클이 없습니다. <a href="#/assessments">먼저 평가사이클을 만들어주세요</a>.</div>
    `;
    return;
  }

  const current = assessments.find(a => a.status === 'IN_PROGRESS') || assessments[0];
  const [templates, issues] = await Promise.all([db.listSurveyTemplates(current.id), db.runWorkflowChecks(current.id)]);
  if (!isCurrent(token)) return;
  const mainTemplate = templates[0];

  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warnCount = issues.filter(i => i.severity === 'WARN').length;

  container.innerHTML = `
    <div class="page-head">
      <h1>중대성평가 파이프라인</h1>
      <div class="bc">중대성평가 모듈 · 표시 중인 사이클: <b>${current.report_year}년</b> (${ASSESSMENT_STATUS_LABEL[current.status]})
        ${assessments.length > 1 ? `<select id="pipe-year-select" style="margin-left:8px;">${assessments.map(a => `<option value="${a.id}" ${a.id===current.id?'selected':''}>${a.report_year}년</option>`).join('')}</select>` : ''}
      </div>
    </div>

    <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;">
      <a href="#/assessments" class="btn ghost">평가사이클 관리</a>
      <a href="#/esrs-topics" class="btn ghost">ESRS 토픽</a>
      <a href="#/issuepool" class="btn ghost">이슈풀</a>
      <a href="#/stakeholders" class="btn ghost">이해관계자</a>
      <a href="#/weights/${current.id}" class="btn ghost">가중치·임계값</a>
    </div>

    <div class="card">
      <div class="field-label">업무 진행 단계 (업무 순서대로)</div>
      <div id="pipeline-steps"></div>
    </div>

    <div class="card">
      <div class="field-label">자동 오류탐지 결과 <span class="mini">🔴오류 ${errorCount}건 · 🟡권고 ${warnCount}건</span></div>
      <div id="pipeline-issues"></div>
    </div>
  `;

  document.getElementById('pipeline-steps').innerHTML = PIPELINE_STEPS.map(s => {
    const hasErrorAtStep = issues.some(i => i.step === s.step && i.severity === 'ERROR');
    const hasWarnAtStep = issues.some(i => i.step === s.step && i.severity === 'WARN');
    const color = hasErrorAtStep ? '#c0392b' : hasWarnAtStep ? '#b8860b' : '#1f9d63';
    const bg = hasErrorAtStep ? '#fdeaea' : hasWarnAtStep ? '#fff6e0' : '#e7f7ee';
    return `<a href="${s.route(current.id, mainTemplate?.id)}" style="text-decoration:none;display:inline-block;">
      <div style="background:${bg};color:${color};border-radius:8px;padding:8px 12px;margin:0 6px 8px 0;display:inline-block;font-size:12px;font-weight:700;">
        ${s.step}. ${s.label}
      </div>
    </a>${s.step < 7 ? '<span style="color:#c7ccd4;">→</span>' : ''}`;
  }).join('');

  document.getElementById('pipeline-issues').innerHTML = issues.length === 0
    ? '<div class="mini">점검할 항목이 아직 없습니다(평가사이클을 진행하면 여기에 표시됩니다).</div>'
    : issues.map(i => {
        const color = i.severity === 'ERROR' ? '#c0392b' : i.severity === 'WARN' ? '#b8860b' : '#1f9d63';
        const icon = i.severity === 'ERROR' ? '🔴' : i.severity === 'WARN' ? '🟡' : '🟢';
        return `<div style="padding:8px 0;border-bottom:1px solid #f0f2f4;font-size:12.5px;">
          ${icon} <span style="color:${color};font-weight:700;">[${s_step_label(i.step)}]</span> ${esc(i.message)}
          <a href="${i.link}" style="margin-left:8px;">이동 →</a>
        </div>`;
      }).join('');

  const yearSelect = document.getElementById('pipe-year-select');
  if (yearSelect) {
    yearSelect.addEventListener('change', () => {
      // 다른 사이클 선택 시 재렌더 (간단히 해시 그대로 두고 강제 재실행)
      const chosen = assessments.find(a => a.id === yearSelect.value);
      if (chosen) { chosen.status = chosen.status; } // no-op, just to keep lint happy
      renderPipelineForAssessment(container, token, yearSelect.value);
    });
  }
}

function s_step_label(step) {
  const found = PIPELINE_STEPS.find(s => s.step === step);
  return found ? found.label : `${step}단계`;
}

async function renderPipelineForAssessment(container, token, assessmentId) {
  const [assessments, templates, issues] = await Promise.all([
    db.listAssessments(), db.listSurveyTemplates(assessmentId), db.runWorkflowChecks(assessmentId)
  ]);
  if (!isCurrent(token)) return;
  const current = assessments.find(a => a.id === assessmentId);
  const mainTemplate = templates[0];
  const errorCount = issues.filter(i => i.severity === 'ERROR').length;
  const warnCount = issues.filter(i => i.severity === 'WARN').length;

  document.querySelector('.bc').innerHTML = `중대성평가 모듈 · 표시 중인 사이클: <b>${current.report_year}년</b> (${ASSESSMENT_STATUS_LABEL[current.status]})
    <select id="pipe-year-select" style="margin-left:8px;">${assessments.map(a => `<option value="${a.id}" ${a.id===current.id?'selected':''}>${a.report_year}년</option>`).join('')}</select>`;

  document.getElementById('pipeline-steps').innerHTML = PIPELINE_STEPS.map(s => {
    const hasErrorAtStep = issues.some(i => i.step === s.step && i.severity === 'ERROR');
    const hasWarnAtStep = issues.some(i => i.step === s.step && i.severity === 'WARN');
    const color = hasErrorAtStep ? '#c0392b' : hasWarnAtStep ? '#b8860b' : '#1f9d63';
    const bg = hasErrorAtStep ? '#fdeaea' : hasWarnAtStep ? '#fff6e0' : '#e7f7ee';
    return `<a href="${s.route(current.id, mainTemplate?.id)}" style="text-decoration:none;display:inline-block;">
      <div style="background:${bg};color:${color};border-radius:8px;padding:8px 12px;margin:0 6px 8px 0;display:inline-block;font-size:12px;font-weight:700;">
        ${s.step}. ${s.label}
      </div>
    </a>${s.step < 7 ? '<span style="color:#c7ccd4;">→</span>' : ''}`;
  }).join('');

  document.querySelector('.card:nth-of-type(2) .field-label').innerHTML = `자동 오류탐지 결과 <span class="mini">🔴오류 ${errorCount}건 · 🟡권고 ${warnCount}건</span>`;
  document.getElementById('pipeline-issues').innerHTML = issues.length === 0
    ? '<div class="mini">점검할 항목이 아직 없습니다.</div>'
    : issues.map(i => {
        const color = i.severity === 'ERROR' ? '#c0392b' : i.severity === 'WARN' ? '#b8860b' : '#1f9d63';
        const icon = i.severity === 'ERROR' ? '🔴' : i.severity === 'WARN' ? '🟡' : '🟢';
        return `<div style="padding:8px 0;border-bottom:1px solid #f0f2f4;font-size:12.5px;">
          ${icon} <span style="color:${color};font-weight:700;">[${s_step_label(i.step)}]</span> ${esc(i.message)}
          <a href="${i.link}" style="margin-left:8px;">이동 →</a>
        </div>`;
      }).join('');

  const yearSelect = document.getElementById('pipe-year-select');
  if (yearSelect) {
    yearSelect.addEventListener('change', () => renderPipelineForAssessment(container, token, yearSelect.value));
  }
}

// ============================================================
// S-TARGET. 대상선정 (v2.3 2장)
// ============================================================
async function pageTargetSelection(container, assessmentId, token) {
  const [assessment, stakeholders, existing] = await Promise.all([
    db.getAssessment(assessmentId), db.listStakeholders(), db.getTargetSelection(assessmentId)
  ]);
  if (!isCurrent(token)) return;
  const readOnly = existing && existing.status === 'APPROVED';

  container.innerHTML = `
    <div class="page-head">
      <h1>대상선정</h1>
      <div class="bc">${assessment ? assessment.report_year + '년' : ''} · 중대성평가 &gt; 1단계: 설문 대상 선정 및 승인 (v2.3 2장)</div>
    </div>

    ${readOnly ? `<div class="success-box">승인됨 (${esc(existing.approved_by)}, ${new Date(existing.approved_at).toLocaleString('ko-KR')})</div>` : ''}

    <div class="card">
      <label class="field-label">선정 방법</label>
      <input id="sel-method" class="text-input" value="${esc(existing?.method || '전 임직원 + 주요 협력사 전수')}" ${readOnly?'disabled':''}>
      <label class="field-label">선정 기준 서술 (감사대응 근거, 승인 시 필수)</label>
      <textarea id="sel-criteria" style="width:100%;min-height:70px;" ${readOnly?'disabled':''}>${esc(existing?.criteria || '')}</textarea>
    </div>

    <div class="card">
      <label class="field-label">대상 이해관계자 선택</label>
      ${stakeholders.length === 0 ? `<div class="mini">등록된 이해관계자가 없습니다 — <a href="#/stakeholders">먼저 등록해주세요</a>.</div>` : ''}
      <div id="target-stk-list">
        ${stakeholders.map(s => `
          <label class="issue-check-row">
            <input type="checkbox" data-id="${s.id}" ${existing?.stakeholder_ids?.includes(s.id) ? 'checked' : ''} ${readOnly?'disabled':''}>
            <span class="ic-name">${esc(s.name)} <span class="mini">${STAKEHOLDER_CATEGORY[s.category]||s.category}</span></span>
          </label>
        `).join('')}
      </div>
    </div>

    ${readOnly ? '' : `
    <div class="card" style="display:flex;gap:8px;">
      <button id="btn-save-target" class="btn ghost" style="flex:1;">임시 저장</button>
      <button id="btn-approve-target" class="btn primary" style="flex:1;">승인</button>
    </div>`}
    <div id="target-result"></div>
  `;

  if (readOnly) return;

  function collectSelectedIds() {
    return [...document.querySelectorAll('#target-stk-list input:checked')].map(cb => cb.dataset.id);
  }

  document.getElementById('btn-save-target').addEventListener('click', async () => {
    await db.saveTargetSelection(assessmentId, {
      method: document.getElementById('sel-method').value,
      criteria: document.getElementById('sel-criteria').value,
      stakeholderIds: collectSelectedIds()
    });
    document.getElementById('target-result').innerHTML = `<div class="success-box">임시 저장되었습니다.</div>`;
  });

  document.getElementById('btn-approve-target').addEventListener('click', async () => {
    try {
      await db.saveTargetSelection(assessmentId, {
        method: document.getElementById('sel-method').value,
        criteria: document.getElementById('sel-criteria').value,
        stakeholderIds: collectSelectedIds()
      });
      await db.approveTargetSelection(assessmentId, '담당자');
      await pageTargetSelection(container, assessmentId, token);
    } catch (e) {
      document.getElementById('target-result').innerHTML = `<div class="reason-box">${esc(e.message)}</div>`;
    }
  });
}

// ============================================================
// S-SIGNOFF. 결과취합 검증·승인 (v2.3 5장)
// ============================================================
const QUALITY_LABEL_KR = { HIGH: '높음', MEDIUM: '보통', LOW: '낮음' };
const QUALITY_COLOR = { HIGH: '#1f9d63', MEDIUM: '#b8860b', LOW: '#c0392b' };
const PERSPECTIVE_LABEL_KR = { ALIGNED: '그룹과 유사', SOMEWHAT_DIFFERENT: '다소 상이', DIVERGENT: '뚜렷하게 상이(소수의견)' };
const ADVICE_TYPE_ICON = { QUALITY: '⚠️', PERSPECTIVE: '💡', SAMPLE_SIZE: '📊', GROUP_BIAS: '👥' };

async function pageSignoff(container, templateId, token) {
  const [{ template }, reliability, advice, existing, respondentCount, questionOutliers] = await Promise.all([
    db.getSurveyTemplate(templateId), db.computeRespondentReliability(templateId), db.getReliabilityAdvice(templateId),
    db.getAggregationSignoff(templateId), db.countRespondents(templateId), db.computeQuestionOutliers(templateId)
  ]);
  if (!isCurrent(token)) return;
  if (!template) { container.innerHTML = `<div class="card">설문을 찾을 수 없습니다.</div>`; return; }

  const lowQuality = reliability.filter(r => r.quality_label === 'LOW');
  const questionOutlierRows = questionOutliers.filter(q => q.outliers && q.outliers.length > 0);

  container.innerHTML = `
    <div class="page-head">
      <h1>결과취합 검증·승인</h1>
      <div class="bc">${esc(template.title)} · 응답자 ${respondentCount}명 · 중대성평가 4단계 — 응답 신뢰도 분석</div>
    </div>

    ${existing ? `<div class="success-box">이미 승인됨 (${esc(existing.signed_off_by)}, ${new Date(existing.signed_off_at).toLocaleString('ko-KR')})
      ${existing.excluded_names?.length ? ` · 제외된 응답자: ${existing.excluded_names.join(', ')}` : ''}</div>` : ''}

    <div class="card">
      <div class="field-label">📋 자동 처리 조언 ${advice.length ? `<span class="mini">(${advice.length}건)</span>` : ''}</div>
      ${advice.length === 0 ? '<div class="mini">특별히 조치가 필요한 사항이 발견되지 않았습니다.</div>' : advice.map(a => `
        <div style="padding:8px 0;border-bottom:1px solid #f0f2f4;font-size:12.5px;">
          ${ADVICE_TYPE_ICON[a.type]} ${a.respondent_name ? `<b>${esc(a.respondent_name)}</b>: ` : ''}${a.message}
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="field-label">응답자별 신뢰도 분석 <span class="mini">(품질점수와 관점차이는 서로 다른 지표입니다 — 아래 설명 참고)</span></div>
      <div class="mini" style="margin-bottom:10px;">
        <b>품질점수</b>: 성의없는 응답(동일점수 반복, 낮은 완료율) 정도 — 낮으면 데이터 문제 가능성.
        <b>관점차이</b>: 그룹 평균과 다르게 응답한 정도 — 다르다고 해서 나쁜 게 아니라 소수의견일 수 있음.
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:2px solid #e2e6eb;">
          <th style="text-align:left;padding:5px;">응답자</th><th style="text-align:left;padding:5px;">그룹</th>
          <th style="text-align:left;padding:5px;">완료율</th><th style="text-align:left;padding:5px;">품질점수</th>
          <th style="text-align:left;padding:5px;">관점차이</th><th style="text-align:left;padding:5px;">제외</th>
        </tr></thead>
        <tbody id="reliability-tbody">
          ${reliability.map(r => `
            <tr style="border-bottom:1px solid #f0f2f4;">
              <td style="padding:5px;">${esc(r.respondent_name)}</td>
              <td style="padding:5px;">${r.group_type}</td>
              <td style="padding:5px;">${r.completion_rate}%</td>
              <td style="padding:5px;color:${QUALITY_COLOR[r.quality_label]};font-weight:700;">${r.quality_score} (${QUALITY_LABEL_KR[r.quality_label]})</td>
              <td style="padding:5px;">${PERSPECTIVE_LABEL_KR[r.perspective_label]}</td>
              <td style="padding:5px;"><input type="checkbox" data-name="${esc(r.respondent_name)}" ${r.quality_label==='LOW'?'checked':''} ${existing?'disabled':''}></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    ${questionOutlierRows.length > 0 ? `
    <div class="card">
      <div class="field-label">문항별 이상치(IQR 방법) <span class="mini">(${questionOutlierRows.length}개 문항에서 발견)</span></div>
      ${questionOutlierRows.map(q => `
        <div style="padding:6px 0;border-bottom:1px solid #f0f2f4;font-size:12px;">
          <b>${q.issue_code}</b> ${esc(q.issue_name)} —
          ${q.outliers.map(o => `${esc(o.respondent_name)}(${o.score}점, ${o.level==='EXTREME'?'극단':'경미'})`).join(', ')}
        </div>
      `).join('')}
    </div>` : ''}

    ${existing ? '' : `
    <label class="field-label" style="margin-top:6px;">제외 사유 (제외 체크한 응답이 있으면 필수)</label>
    <textarea id="excl-reason" class="card" style="width:100%;min-height:50px;" placeholder="예: 품질점수 낮음(전체 문항 동일점수)으로 분석에서 제외함"></textarea>
    <button id="btn-signoff" class="btn primary" style="width:100%;margin-top:10px;">취합 결과 승인</button>`}
    <div id="signoff-result"></div>
  `;

  if (existing) return;

  document.getElementById('btn-signoff').addEventListener('click', async () => {
    const excludedNames = [...document.querySelectorAll('#reliability-tbody input:checked')].map(cb => cb.dataset.name);
    const reason = document.getElementById('excl-reason')?.value || '';
    try {
      await db.signOffAggregation(templateId, { excludedNames, exclusionReason: reason, signedOffBy: '담당자' });
      await pageSignoff(container, templateId, token);
    } catch (e) {
      document.getElementById('signoff-result').innerHTML = `<div class="reason-box">${esc(e.message)}</div>`;
    }
  });
}

// ============================================================
// S-CONSENSUS. 이해관계자 그룹 간 합의도 대시보드 (신규 요청기능 ③)
// ============================================================
async function pageConsensus(container, templateId, token) {
  const [{ template }, consensus] = await Promise.all([db.getSurveyTemplate(templateId), db.computeGroupConsensus(templateId)]);
  if (!isCurrent(token)) return;
  if (!template) { container.innerHTML = `<div class="card">설문을 찾을 수 없습니다.</div>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <h1>그룹 간 합의도 대시보드</h1>
      <div class="bc">${esc(template.title)} · 이해관계자 그룹 쌍별로 인식 차이를 비교합니다</div>
    </div>

    ${consensus.groups.length < 2 ? '<div class="notice-box">응답한 이해관계자 그룹이 2개 미만이라 그룹 간 비교를 할 수 없습니다.</div>' : ''}
    ${consensus.pairs.length === 0 && consensus.groups.length >= 2 ? '<div class="mini">그룹 쌍 간 공통으로 응답한 문항이 없습니다.</div>' : ''}

    ${consensus.pairs.map(pair => `
      <div class="card">
        <div class="field-label">
          ${STAKEHOLDER_CATEGORY[pair.group_a] || pair.group_a} ↔ ${STAKEHOLDER_CATEGORY[pair.group_b] || pair.group_b}
          <span class="dim-badge" style="background:${pair.agreement_score>=70?'#e7f7ee':pair.agreement_score>=40?'#fff6e0':'#fdeaea'};color:${pair.agreement_score>=70?'#1f9d63':pair.agreement_score>=40?'#b8860b':'#c0392b'};margin-left:8px;">
            합의도 ${pair.agreement_score}점
          </span>
        </div>
        <div class="mini" style="margin-bottom:8px;">합의도가 낮을수록(0에 가까울수록) 두 그룹의 인식 차이가 큽니다. 아래는 가장 이견이 큰 문항입니다.</div>
        ${pair.most_divergent.map(d => `
          <div style="padding:6px 0;border-bottom:1px solid #f0f2f4;font-size:12.5px;">
            <b>${d.issue_code}</b> ${esc(d.issue_name)} —
            ${STAKEHOLDER_CATEGORY[pair.group_a]||pair.group_a}: ${d.a.toFixed(1)}점, ${STAKEHOLDER_CATEGORY[pair.group_b]||pair.group_b}: ${d.b.toFixed(1)}점
            <span class="mini">(차이 ${d.diff})</span>
          </div>
        `).join('')}
      </div>
    `).join('')}
  `;
}

// ============================================================
// S-EXCLOG. 이상치 처리 이력 로그 (신규 요청기능 ④)
// ============================================================
async function pageExclusionHistory(container, assessmentId, token) {
  const [assessment, log] = await Promise.all([db.getAssessment(assessmentId), db.listExclusionLog(assessmentId)]);
  if (!isCurrent(token)) return;

  container.innerHTML = `
    <div class="page-head">
      <h1>이상치 처리 이력</h1>
      <div class="bc">${assessment ? assessment.report_year + '년 평가사이클' : ''} · 누가 언제 어떤 응답을 왜 제외했는지 전체 이력 (감사대응용)</div>
    </div>

    ${log.length === 0 ? '<div class="card mini">제외된 응답 이력이 없습니다.</div>' : `
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead><tr style="border-bottom:2px solid #e2e6eb;">
        <th style="text-align:left;padding:6px;">일시</th><th style="text-align:left;padding:6px;">응답자</th>
        <th style="text-align:left;padding:6px;">사유</th><th style="text-align:left;padding:6px;">처리자</th>
      </tr></thead>
      <tbody>
        ${log.map(e => `
          <tr style="border-bottom:1px solid #f0f2f4;">
            <td style="padding:6px;">${new Date(e.excluded_at).toLocaleString('ko-KR')}</td>
            <td style="padding:6px;font-weight:700;">${esc(e.respondent_name)}</td>
            <td style="padding:6px;">${esc(e.reason)}</td>
            <td style="padding:6px;">${esc(e.excluded_by)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`}
  `;
}

// ============================================================
// S-REPORT. 지속가능경영보고서 반영 (v2.3 7장)
// ============================================================
async function pageReportDraft(container, assessmentId, token) {
  const assessment = await db.getAssessment(assessmentId);
  if (!isCurrent(token)) return;

  container.innerHTML = `
    <div class="page-head">
      <h1>지속가능경영보고서 반영</h1>
      <div class="bc">${assessment ? assessment.report_year + '년' : ''} · 중대성평가 7단계 · AI 재작성 없이 저장된 데이터를 그대로 조립합니다</div>
    </div>
    <div class="card">
      <button id="btn-generate-report" class="btn primary" style="width:100%;">보고서 초안 생성 및 미리보기</button>
      <button id="btn-export-integration" class="btn ghost" style="width:100%;margin-top:10px;">🔗 Smart ESG 연계 파일 내보내기 (materiality-result.json)</button>
      <div id="integration-export-note" style="font-size:11.5px;color:#6b7280;margin-top:6px;">본편 Smart ESG의 [이중중대성평가 → 설문 결과 가져오기]에서 이 파일을 불러오면 이슈·점수·구분(사분면)이 그대로 반영됩니다.</div>
    </div>
    <div id="report-preview" class="card" style="display:none;">
      <pre id="report-text" style="white-space:pre-wrap;font-family:inherit;font-size:12.5px;"></pre>
      <button id="btn-download-report" class="btn ghost" style="width:100%;margin-top:10px;">.md 파일로 다운로드</button>
    </div>
  `;

  document.getElementById('btn-export-integration').addEventListener('click', async () => {
    const note = document.getElementById('integration-export-note');
    try {
      const bundle = await downloadIntegrationBundle(assessmentId);
      if (note) note.textContent = `내보내기 완료: 이슈 ${bundle.issues.length}건 · 계약 v${bundle.contract_version}`;
    } catch (e) {
      if (note) note.textContent = '내보내기 실패: ' + (e && e.message);
    }
  });

  document.getElementById('btn-generate-report').addEventListener('click', async () => {
    const text = await db.buildReportDraft(assessmentId);
    document.getElementById('report-text').textContent = text;
    document.getElementById('report-preview').style.display = 'block';
    document.getElementById('btn-download-report').onclick = () => {
      downloadTextFile(`${assessment.report_year}년_중대성평가_보고서초안.md`, text, 'text/markdown');
    };
  });
}

// ============================================================
// S-20-A. 이슈풀 관리
// ============================================================
async function pageIssuePool(container, token) {
  const [pool, groups] = await Promise.all([db.listIssuePool(), db.listThemeGroups()]);
  if (!isCurrent(token)) return;
  const groupName = code => (groups.find(g => g.group_code === code) || {}).group_name || code;

  container.innerHTML = `
    <div class="page-head">
      <h1>이슈풀 관리</h1>
      <div class="bc">중대성평가 &gt; 이슈풀 (전체 ${pool.length}개)</div>
    </div>
    <div class="filter-row">
      <button class="chip active" data-filter="ALL">전체</button>
      <button class="chip" data-filter="IMPACT">영향(${pool.filter(i=>i.dimension_tag==='IMPACT').length})</button>
      <button class="chip" data-filter="FINANCIAL">재무(${pool.filter(i=>i.dimension_tag==='FINANCIAL').length})</button>
      <button class="chip" data-filter="OPPORTUNITY">기회(${pool.filter(i=>i.dimension_tag==='OPPORTUNITY').length})</button>
    </div>
    <div id="issue-list" class="issue-list"></div>
  `;

  function renderList(filter) {
    const list = pool.filter(i => filter === 'ALL' || i.dimension_tag === filter);
    document.getElementById('issue-list').innerHTML = list.map(i => `
      <div class="issue-card">
        <div class="issue-card-top">
          <span class="issue-code">${i.issue_code}</span>
          <span class="dim-badge" style="background:${DIMENSION_COLOR[i.dimension_tag]}22;color:${DIMENSION_COLOR[i.dimension_tag]}">${DIMENSION_LABEL[i.dimension_tag]}</span>
        </div>
        <div class="issue-name">${esc(i.issue_name)}</div>
        <div class="issue-def">${esc(i.issue_definition)}</div>
        <div class="issue-q">"${esc(i.question_text)}"</div>
        <div class="issue-theme">테마그룹: ${groupName(i.theme_group)}</div>
      </div>
    `).join('');
  }
  renderList('ALL');

  container.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderList(btn.dataset.filter);
    });
  });
}

// ============================================================
// S-20-B. 설문지 작성 — 이슈풀에서 선택 + 문항수 프리셋
// ============================================================
async function pageSurveyBuilder(container, token, assessmentId) {
  const [pool, assessments] = await Promise.all([db.listIssuePool(), db.listAssessments()]);
  if (!isCurrent(token)) return;
  const selected = new Set();

  // 평가사이클 미지정 시: 진행중인 사이클이 있으면 그걸, 없으면 새로 만들도록 안내
  let currentAssessment = assessmentId ? assessments.find(a => a.id === assessmentId) : assessments.find(a => a.status === 'IN_PROGRESS');

  if (!currentAssessment) {
    container.innerHTML = `
      <div class="page-head">
        <h1>설문지 작성</h1>
        <div class="bc">중대성평가 &gt; 설문지 작성</div>
      </div>
      <div class="notice-box">
        먼저 평가사이클(연도)을 생성해야 설문지를 만들 수 있습니다(v2.0 설계상 모든 설문·점수는
        연도별 평가사이클에 귀속됩니다).
      </div>
      <a href="#/assessments" class="btn primary" style="display:block;text-align:center;text-decoration:none;">→ 평가사이클 관리로 이동</a>
    `;
    return;
  }
  if (currentAssessment.status === 'FINALIZED') {
    container.innerHTML = `<div class="card">이 평가사이클(${currentAssessment.report_year}년)은 이미 확정되어 새 설문을 추가할 수 없습니다. <a href="#/assessments">평가사이클 관리</a>에서 새 사이클을 만들어주세요.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="page-head">
      <h1>설문지 작성</h1>
      <div class="bc">중대성평가 &gt; 설문지 작성 · 평가사이클: <b>${currentAssessment.report_year}년</b> (${ASSESSMENT_STATUS_LABEL[currentAssessment.status]})</div>
    </div>

    <div class="card">
      <label class="field-label">설문 제목</label>
      <input id="tpl-title" class="text-input" value="${currentAssessment.report_year}년 ESG 중대성 이슈 설문" />
    </div>

    <div class="card">
      <label class="field-label">목표 문항수 (선택 개수는 이 값을 넘을 수 없습니다)</label>
      <input id="target-count" type="number" class="text-input" value="16" min="1" max="${pool.length}" style="width:120px;">
      <div class="preset-row" style="margin-top:8px;">
        <button class="btn ghost" data-preset="16">16개(축약형)</button>
        <button class="btn ghost" data-preset="24">24개(표준형)</button>
        <button class="btn ghost" data-preset="39">전체 39개</button>
        <button class="btn ghost" id="btn-esg-balance">E/S/G 균등선택</button>
        <button class="btn ghost" id="btn-random-pick">랜덤 선택</button>
        <button class="btn ghost" data-preset="clear">선택 초기화</button>
      </div>
      <div class="selected-count">선택된 문항: <b id="sel-count">0</b> / <span id="target-display">16</span>개</div>
    </div>

    <div class="card">
      <div class="issue-select-list" id="issue-select-list"></div>
    </div>

    <div class="card" style="display:flex;gap:8px;">
      <button id="btn-create-survey" class="btn primary" style="flex:1;">설문지 발행</button>
      <button id="btn-export-gform" class="btn ghost">📋 구글폼으로 내보내기</button>
    </div>
    <div id="create-result"></div>
  `;

  const targetInput = document.getElementById('target-count');
  const targetDisplay = document.getElementById('target-display');
  targetInput.addEventListener('input', () => { targetDisplay.textContent = targetInput.value || '0'; });
  function targetCount() { return Number(targetInput.value) || pool.length; }

  function renderCheckList() {
    document.getElementById('issue-select-list').innerHTML = pool.map(i => `
      <label class="issue-check-row">
        <input type="checkbox" data-code="${i.issue_code}" ${selected.has(i.issue_code) ? 'checked' : ''}/>
        <span class="dim-dot" style="background:${DIMENSION_COLOR[i.dimension_tag]}"></span>
        <span class="ic-code">${i.issue_code}</span>
        <span class="ic-name">${esc(i.issue_name)}</span>
      </label>
    `).join('');

    document.getElementById('sel-count').textContent = selected.size;

    document.querySelectorAll('#issue-select-list input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          // 선택 개수 제한(신규 요청기능): 목표 문항수를 넘으면 체크를 취소하고 안내
          if (selected.size >= targetCount()) {
            cb.checked = false;
            alert(`목표 문항수(${targetCount()}개)를 이미 선택했습니다. 더 선택하려면 목표 문항수를 늘리거나 다른 문항의 선택을 해제해주세요.`);
            return;
          }
          selected.add(cb.dataset.code);
        } else {
          selected.delete(cb.dataset.code);
        }
        document.getElementById('sel-count').textContent = selected.size;
      });
    });
  }
  renderCheckList();

  container.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.preset;
      selected.clear();
      if (p === '16') { PRESET_16.forEach(c => selected.add(c)); targetInput.value = 16; }
      else if (p === '24') { PRESET_24.forEach(c => selected.add(c)); targetInput.value = 24; }
      else if (p === '39') { pool.forEach(i => selected.add(i.issue_code)); targetInput.value = pool.length; }
      targetDisplay.textContent = targetInput.value;
      renderCheckList();
    });
  });

  // E/S/G 균등선택 (신규 요청기능): 목표문항수를 E/S/G 3그룹에 최대한 균등 배분해 선택
  document.getElementById('btn-esg-balance').addEventListener('click', () => {
    const target = targetCount();
    selected.clear();
    const byPillar = { E: [], S: [], G: [] };
    pool.forEach(i => {
      const pillar = esgPillarOfIssue(i.issue_code);
      if (pillar && byPillar[pillar]) byPillar[pillar].push(i.issue_code);
    });
    const pillars = ['E', 'S', 'G'];
    const base = Math.floor(target / 3);
    let remainder = target - base * 3;
    const quota = {};
    pillars.forEach(p => { quota[p] = base + (remainder > 0 ? 1 : 0); if (remainder > 0) remainder--; });

    pillars.forEach(p => {
      const codes = byPillar[p];
      for (let k = 0; k < Math.min(quota[p], codes.length); k++) selected.add(codes[k]);
    });
    // 부족분(특정 필러의 이슈 수가 할당량보다 적을 경우)은 남은 풀에서 채움
    if (selected.size < target) {
      const remaining = pool.map(i => i.issue_code).filter(c => !selected.has(c));
      for (const c of remaining) { if (selected.size >= target) break; selected.add(c); }
    }
    renderCheckList();
  });

  // 랜덤 선택 (신규 요청기능)
  document.getElementById('btn-random-pick').addEventListener('click', () => {
    const target = targetCount();
    const codes = pool.map(i => i.issue_code);
    for (let i = codes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [codes[i], codes[j]] = [codes[j], codes[i]];
    }
    selected.clear();
    codes.slice(0, target).forEach(c => selected.add(c));
    renderCheckList();
  });

  // 구글폼으로 내보내기 (신규 요청기능): 현재 선택된 문항 기준, 발행 전에도 가능
  document.getElementById('btn-export-gform').addEventListener('click', () => {
    if (selected.size === 0) { alert('내보낼 문항을 먼저 선택해주세요.'); return; }
    const title = document.getElementById('tpl-title').value || '무제 설문';
    const qs = pool.filter(i => selected.has(i.issue_code))
      .map(i => ({ issue_code: i.issue_code, question_text: i.question_text, dimension_tag: i.dimension_tag }));
    exportSurveyToGoogleFormScript(title, qs);
  });

  document.getElementById('btn-create-survey').addEventListener('click', async () => {
    if (selected.size === 0) {
      alert('최소 1개 이상의 이슈를 선택해주세요.');
      return;
    }
    const title = document.getElementById('tpl-title').value || '무제 설문';
    try {
      const template = await db.createSurveyTemplate({
        title, issueCodes: [...selected], targetCount: selected.size, assessmentId: currentAssessment.id
      });
      document.getElementById('create-result').innerHTML = `
        <div class="success-box">
          설문 "${esc(template.title)}"가 발행되었습니다 (${selected.size}문항).
          <a href="#/respond/${template.id}">→ 모의 응답하러 가기</a> ·
          <a href="#/analysis/${template.id}">→ 분석 화면으로</a>
        </div>`;
    } catch (e) {
      document.getElementById('create-result').innerHTML = `<div class="reason-box">${esc(e.message)}</div>`;
    }
  });
}

// ============================================================
// S-20-C. 설문 응답 (모의 응답 시뮬레이터)
// ============================================================
async function pageSurveyRespond(container, templateId, token) {
  const [{ template, questions }, stakeholders] = await Promise.all([db.getSurveyTemplate(templateId), db.listStakeholders()]);
  if (!isCurrent(token)) return;
  if (!template) { container.innerHTML = `<div class="card">설문을 찾을 수 없습니다.</div>`; return; }

  container.innerHTML = `
    <div class="page-head">
      <h1>${esc(template.title)}</h1>
      <div class="bc">중대성평가 &gt; 설문 응답(모의) · 총 ${questions.length}문항</div>
    </div>
    <div class="card">
      ${stakeholders.length ? `
      <label class="field-label">등록된 이해관계자에서 선택 (선택하면 아래 이름·그룹이 자동 채워집니다)</label>
      <select id="resp-stakeholder" class="text-input">
        <option value="">-- 직접 입력 --</option>
        ${stakeholders.map(s => `<option value="${s.id}" data-name="${esc(s.name)}" data-cat="${s.category}">${esc(s.name)} (${STAKEHOLDER_CATEGORY[s.category]||s.category})</option>`).join('')}
      </select>` : `<div class="mini">등록된 이해관계자가 없습니다 — <a href="#/stakeholders">여기서 등록</a>하거나 아래에 직접 입력하세요.</div>`}
      <label class="field-label" style="margin-top:10px;">응답자 이름</label>
      <input id="resp-name" class="text-input" placeholder="예: 김도현" />
      <label class="field-label" style="margin-top:10px;">이해관계자 그룹</label>
      <select id="resp-group" class="text-input">
        <option value="EMPLOYEE">종업원</option>
        <option value="PARTNER">파트너(협력사)</option>
        <option value="CUSTOMER">고객</option>
        <option value="INVESTOR">투자자</option>
        <option value="COMMUNITY">지역사회</option>
      </select>
    </div>

    <div id="q-list"></div>
    <button id="btn-submit-response" class="btn primary" style="width:100%;">제출</button>
    <div id="submit-result"></div>
  `;

  const stkSelect = document.getElementById('resp-stakeholder');
  if (stkSelect) {
    stkSelect.addEventListener('change', () => {
      const opt = stkSelect.selectedOptions[0];
      if (opt && opt.value) {
        document.getElementById('resp-name').value = opt.dataset.name;
        document.getElementById('resp-group').value = opt.dataset.cat;
      }
    });
  }

  document.getElementById('q-list').innerHTML = questions.map((q, idx) => `
    <div class="card q-card">
      <div class="q-num">${idx + 1}. <span class="dim-badge" style="background:${DIMENSION_COLOR[q.issue.dimension_tag]}22;color:${DIMENSION_COLOR[q.issue.dimension_tag]}">${DIMENSION_LABEL[q.issue.dimension_tag]}</span></div>
      <div class="q-text">${esc(q.issue.question_text)}</div>
      <div class="scale-row" data-qid="${q.id}">
        ${[1,2,3,4,5].map(v => `<label class="scale-opt"><input type="radio" name="q-${q.id}" value="${v}"><span>${v}</span></label>`).join('')}
        <span class="scale-hint">1=거의없음 · 5=매우큼</span>
      </div>
    </div>
  `).join('');

  document.getElementById('btn-submit-response').addEventListener('click', async () => {
    const name = document.getElementById('resp-name').value.trim();
    const group = document.getElementById('resp-group').value;
    if (!name) { alert('응답자 이름을 입력해주세요.'); return; }

    const answers = [];
    let unanswered = 0;
    questions.forEach(q => {
      const checked = document.querySelector(`input[name="q-${q.id}"]:checked`);
      if (checked) answers.push({ question_id: q.id, score_given: Number(checked.value) });
      else unanswered++;
    });
    if (unanswered > 0 && !confirm(`${unanswered}개 문항이 미응답입니다. 이대로 제출하시겠습니까?`)) return;

    const result = await db.submitResponse({ templateId, respondentName: name, groupType: group, answers });
    document.getElementById('submit-result').innerHTML = `
      <div class="success-box">${result.wasResubmit ? '이전 응답을 새 값으로 갱신했습니다(중복 저장되지 않음).' : '응답이 저장되었습니다.'} <a href="#/analysis/${templateId}">→ 분석 화면으로</a></div>`;
  });
}

// ============================================================
// S-22-A. 설문 결과 분석
// ============================================================
async function pageAnalysis(container, templateId, token) {
  const { template, questions } = await db.getSurveyTemplate(templateId);
  if (!isCurrent(token)) return;
  if (!template) { container.innerHTML = `<div class="card">설문을 찾을 수 없습니다.</div>`; return; }

  // 서로 독립적인 조회이므로 병렬 실행 (순차 실행 시 지연이 누적됨)
  const [respondentCount, issueAvg, groupComparison, reliability] = await Promise.all([
    db.countRespondents(templateId),
    db.getIssueAvgScores(templateId),
    db.getGroupComparison(templateId),
    db.computeRespondentReliability(templateId)
  ]);
  if (!isCurrent(token)) return;

  const lowQualityCount = reliability.filter(r => r.quality_label === 'LOW').length;
  const divergentCount = reliability.filter(r => r.perspective_label === 'DIVERGENT').length;

  container.innerHTML = `
    <div class="page-head">
      <h1>설문 결과 분석</h1>
      <div class="bc">${esc(template.title)} · 응답자 ${respondentCount}명</div>
    </div>

    ${respondentCount > 0 && respondentCount < 10 ? `<div class="notice-box">⚠️ 응답자가 ${respondentCount}명으로 적어 통계적 신뢰구간이 넓습니다(표본 확대를 권장). 개별 응답 하나가 평균을 크게 흔들 수 있습니다.</div>` : ''}

    <div class="card">
      <div class="field-label">이해관계자 그룹별 응답 수</div>
      <div id="group-summary"></div>
    </div>

    <div class="card" style="display:flex;gap:8px;flex-wrap:wrap;">
      <a href="#/distribution/${templateId}" class="btn ghost" style="flex:1;text-align:center;text-decoration:none;">문항별 응답분포 시각화</a>
      <a href="#/matrix/${templateId}" class="btn primary" style="flex:1;text-align:center;text-decoration:none;">사사분위 매트릭스 보기</a>
    </div>

    <a href="#/signoff/${templateId}" class="card" style="display:block;text-decoration:none;color:inherit;">
      <div class="field-label">🔍 응답 신뢰도 분석 요약 <span class="mini">(클릭하면 상세 분석·처리 화면으로 이동)</span></div>
      <div style="display:flex;gap:10px;margin-top:6px;">
        <span class="dim-badge" style="background:${lowQualityCount>0?'#fdeaea':'#e7f7ee'};color:${lowQualityCount>0?'#c0392b':'#1f9d63'};">품질 낮음 ${lowQualityCount}명</span>
        <span class="dim-badge" style="background:${divergentCount>0?'#fff6e0':'#eef0f2'};color:${divergentCount>0?'#b8860b':'#6b7480'};">소수의견(관점상이) ${divergentCount}명</span>
      </div>
    </a>

    <div class="card">
      <div class="field-label">엑셀로 결과 일괄 업로드 (신규 요청기능)</div>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button id="btn-download-tpl" class="btn ghost">📥 엑셀 템플릿 다운로드</button>
      </div>
      <input type="file" id="excel-upload" accept=".xlsx,.xls,.csv">
      <div id="upload-result" class="mini" style="margin-top:6px;"></div>
    </div>

    <div class="card">
      <div class="field-label">문항별 평균 점수 <span class="mini">(관리자가 가중치를 설정한 경우 가중평균이 반영됩니다 — <a href="#/weights/${template.assessment_id}">가중치 설정</a>)</span></div>
      <div id="avg-bars"></div>
    </div>
  `;

  document.getElementById('btn-download-tpl').addEventListener('click', async () => {
    const exportData = await db.getSurveyExportData(templateId);
    downloadResponseExcelTemplate(exportData.title, exportData.questions);
  });

  document.getElementById('excel-upload').addEventListener('change', async (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const resultEl = document.getElementById('upload-result');
    resultEl.textContent = '업로드 처리 중…';
    try {
      const exportData = await db.getSurveyExportData(templateId);
      const codes = exportData.questions.map(q => q.issue_code);
      const rows = await parseResponseExcelFile(file, codes);
      const result = await db.bulkImportResponses(templateId, rows);
      resultEl.textContent = `신규 ${result.imported}명, 갱신(중복방지) ${result.updated}명 반영됨 (건너뜀: 행 ${result.skippedRows}, 셀 ${result.skippedCells})`;
      await pageAnalysis(container, templateId, token);
    } catch (e) {
      resultEl.textContent = '업로드 실패: ' + e.message;
    }
  });

  document.getElementById('avg-bars').innerHTML = issueAvg.map(row => `
    <div class="bar-row">
      <span class="bar-label">${row.issue_code} <span class="mini">${esc(row.issue_name)}</span></span>
      <div class="bar-track">
        <div class="bar-fill" style="width:${row.avg_score ? (row.avg_score/5*100) : 0}%; background:${DIMENSION_COLOR[row.dimension_tag]}"></div>
      </div>
      <span class="bar-val">${row.avg_score ?? '-'} <span class="mini">(n=${row.response_count})</span></span>
    </div>
  `).join('');

  const groups = Object.keys(groupComparison);
  document.getElementById('group-summary').innerHTML = groups.length ? groups.map(g => {
    const answered = groupComparison[g].filter(x => x.avg_score !== null).length;
    return `<div class="group-chip">${g}: 문항 응답률 ${answered}/${groupComparison[g].length}</div>`;
  }).join('') : '<div class="mini">아직 응답이 없습니다.</div>';
}

// ============================================================
// S-WEIGHT. 관리자 배점·가중치 조정 (신규 요청기능)
// ============================================================
async function pageWeights(container, assessmentId, token) {
  const [cfg, assessment] = await Promise.all([db.getWeightConfig(assessmentId), db.getAssessment(assessmentId)]);
  if (!isCurrent(token)) return;
  const readOnly = assessment && assessment.status === 'FINALIZED';

  container.innerHTML = `
    <div class="page-head">
      <h1>가중치·임계값 설정</h1>
      <div class="bc">${assessment ? assessment.report_year + '년 평가사이클' : ''} · 관리자 전용 — 그룹별 응답 가중치와 중대성 판정 임계값을 조정합니다</div>
    </div>
    ${readOnly ? '<div class="reason-box">이 평가사이클은 확정되어 읽기 전용입니다.</div>' : ''}

    <div class="card">
      <div class="field-label">이해관계자 그룹별 가중치 (기본 1.0 = 동일 비중)</div>
      ${Object.entries(STAKEHOLDER_CATEGORY).map(([k, v]) => `
        <label style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span>${v} (${k})</span>
          <input type="number" step="0.1" min="0" id="w-${k}" value="${cfg.weights?.[k] ?? 1}" style="width:90px;" ${readOnly?'disabled':''}>
        </label>
      `).join('')}
      <div class="mini">예: 협력사 응답의 신뢰도를 낮게 보고 싶다면 0.7, 경영진 응답에 더 큰 비중을 두려면 1.5처럼 조정합니다. 문항별 평균·매트릭스 좌표 계산 시 가중평균으로 반영됩니다.</div>
    </div>

    <div class="card">
      <div class="field-label">중대성 판정 임계값 (기본 3.0 = 5점 척도의 중간)</div>
      <label>영향중대성 임계값</label>
      <input type="number" step="0.1" min="1" max="5" id="th-impact" value="${cfg.impact_threshold ?? 3}" ${readOnly?'disabled':''}>
      <label>재무중대성 임계값</label>
      <input type="number" step="0.1" min="1" max="5" id="th-financial" value="${cfg.financial_threshold ?? 3}" ${readOnly?'disabled':''}>
      <div class="mini">임계값을 낮추면 더 많은 이슈가 "중대"로 판정되고, 높이면 기준이 엄격해집니다. 매트릭스의 사분면 경계선이 이 값에 따라 이동합니다.</div>
    </div>

    ${readOnly ? '' : '<button id="btn-save-weights" class="btn primary" style="width:100%;">저장</button>'}
    <div id="weights-result"></div>
  `;

  if (readOnly) return;

  document.getElementById('btn-save-weights').addEventListener('click', async () => {
    const weights = {};
    Object.keys(STAKEHOLDER_CATEGORY).forEach(k => { weights[k] = Number(document.getElementById(`w-${k}`).value) || 1; });
    await db.saveWeightConfig(assessmentId, {
      weights,
      impact_threshold: Number(document.getElementById('th-impact').value) || 3,
      financial_threshold: Number(document.getElementById('th-financial').value) || 3
    });
    document.getElementById('weights-result').innerHTML = `<div class="success-box">저장되었습니다. 매트릭스·분석 화면에 즉시 반영됩니다.</div>`;
  });
}

// ============================================================
// S-22-B. 사사분위 매트릭스 (+ 수동조정 패널)
// ============================================================
async function pageMatrix(container, templateId, token) {
  const { template } = await db.getSurveyTemplate(templateId);
  if (!isCurrent(token)) return;
  if (!template) { container.innerHTML = `<div class="card">설문을 찾을 수 없습니다.</div>`; return; }

  const [assessments, currentAssessment, sampleSummary, weightCfg] = await Promise.all([
    db.listAssessments(), db.getAssessment(template.assessment_id), db.computeSurveySampleSummary(templateId),
    db.getWeightConfig(template.assessment_id)
  ]);
  const prevAssessment = currentAssessment
    ? assessments.find(a => a.report_year === currentAssessment.report_year - 1 && a.status === 'FINALIZED')
    : null;
  const prevYearMaterialGroups = prevAssessment ? (prevAssessment.material_theme_groups || []) : null;
  const assessmentId = template.assessment_id;
  const weightsReadOnly = currentAssessment && currentAssessment.status === 'FINALIZED';

  container.innerHTML = `
    <div class="page-head" style="margin-bottom:8px;">
      <h1 style="margin-bottom:2px;">이중중대성 매트릭스</h1>
      <div class="bc">${esc(template.title)}</div>
    </div>

    <div class="mtx-toolbar">
      <a href="#/report/${assessmentId}" class="btn primary small" style="text-decoration:none;">📄 보고서로 이동</a>
      <a href="#/distribution/${templateId}" class="btn ghost small" style="text-decoration:none;">응답분포</a>
      <a href="#/consensus/${templateId}" class="btn ghost small" style="text-decoration:none;">그룹합의도</a>
      <a href="#/exclusion-history/${assessmentId}" class="btn ghost small" style="text-decoration:none;">이상치이력</a>
    </div>

    <!-- 1. 표본 개요 및 표본오차 (맨 위) -->
    <div class="card mtx-compact-card">
      <div class="field-label">📊 표본 개요 및 표본오차</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:5px;">
        <span class="dim-badge" style="background:var(--accent-soft);color:var(--accent);">총 ${sampleSummary.total}건</span>
        ${Object.entries(sampleSummary.byGroup).map(([g, n]) => `<span class="dim-badge" style="background:#eef0f2;color:#5b6472;">${STAKEHOLDER_CATEGORY[g]||g} ${n}건</span>`).join('')}
        ${sampleSummary.marginOfErrorPct !== null ? `<span style="font-size:14px;font-weight:700;margin-left:auto;">표본오차 ±${sampleSummary.marginOfErrorPct}%p</span>` : ''}
      </div>
      ${sampleSummary.total > 0 && sampleSummary.total < 10 ? '<div class="mini" style="color:#b8860b;margin-top:3px;">⚠️ 표본이 작아 해석에 참고용으로만 활용하세요.</div>' : ''}
    </div>

    <!-- 2. 좌: 가중치·임계값 / 중: 매트릭스 그래프 / 우: 수동조정(클릭시) -->
    <div class="mtx-3col">
      <div class="card mtx-col-weights">
        <div class="field-label" style="margin-bottom:5px;">가중치·임계값</div>
        <div id="weights-form"></div>
      </div>

      <div id="matrix-chart" class="card mtx-col-chart"></div>

      <div class="card mtx-col-adjust">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="field-label" style="margin:0;">수동 조정</span>
          <button id="btn-toggle-batch" class="btn ghost small">전체 일괄조정</button>
        </div>
        <div id="matrix-panel" class="panel-empty">점을 클릭하면 상세·조정 패널이 열립니다.</div>
      </div>
    </div>

    <!-- 3. 중대이슈 결과표 (맨 아래) -->
    <div class="card mtx-compact-card">
      <div class="field-label">중대이슈 결과표 ${prevAssessment ? `<span class="mini">(${prevAssessment.report_year}년 대비 New/Existing)</span>` : '<span class="mini">(전년도 확정 사이클 없음)</span>'}</div>
      <div id="materiality-table"></div>
    </div>
  `;

  let batchMode = false;

  function renderWeightsForm() {
    document.getElementById('weights-form').innerHTML = `
      ${Object.entries(STAKEHOLDER_CATEGORY).map(([k, v]) => `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:11px;">
          <span>${v}</span>
          <input type="number" step="0.1" min="0" id="wp-${k}" value="${weightCfg.weights?.[k] ?? 1}" style="width:52px;margin:0;padding:3px 5px;" ${weightsReadOnly?'disabled':''}>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;align-items:center;margin:6px 0 4px;font-size:11px;">
        <span>영향 임계값</span><input type="number" step="0.1" min="1" max="5" id="wp-th-impact" value="${weightCfg.impact_threshold ?? 3}" style="width:52px;margin:0;padding:3px 5px;" ${weightsReadOnly?'disabled':''}>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;font-size:11px;">
        <span>재무 임계값</span><input type="number" step="0.1" min="1" max="5" id="wp-th-financial" value="${weightCfg.financial_threshold ?? 3}" style="width:52px;margin:0;padding:3px 5px;" ${weightsReadOnly?'disabled':''}>
      </div>
      ${weightsReadOnly ? '<div class="mini">읽기 전용</div>' : '<button id="btn-apply-weights" class="btn primary small" style="width:100%;">적용</button>'}
      <div id="weights-inline-result" class="mini" style="margin-top:3px;"></div>
    `;
    const applyBtn = document.getElementById('btn-apply-weights');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const weights = {};
        Object.keys(STAKEHOLDER_CATEGORY).forEach(k => { weights[k] = Number(document.getElementById(`wp-${k}`).value) || 1; });
        weightCfg.weights = weights;
        weightCfg.impact_threshold = Number(document.getElementById('wp-th-impact').value) || 3;
        weightCfg.financial_threshold = Number(document.getElementById('wp-th-financial').value) || 3;
        await db.saveWeightConfig(assessmentId, weightCfg);
        document.getElementById('weights-inline-result').textContent = '적용됨 ✓';
        await refresh();
      });
    }
  }
  renderWeightsForm();

  let lastPoints = [];

  async function refresh() {
    const [points, confidence] = await Promise.all([db.getQuadrantData(templateId), db.computeMatrixConfidence(templateId)]);
    if (!isCurrent(token)) return;
    lastPoints = points;
    const chartEl = document.getElementById('matrix-chart');
    if (!chartEl) return;
    renderMatrix(chartEl, points, onPointClick, confidence);
    const tableEl = document.getElementById('materiality-table');
    if (tableEl) renderMaterialityTable(tableEl, points, prevYearMaterialGroups);
    if (batchMode) renderBatchPanel();
  }

  function renderBatchPanel() {
    const panel = document.getElementById('matrix-panel');
    if (!panel) return;
    panel.classList.remove('panel-empty');
    const twoAxis = lastPoints.filter(p => p.has_impact_axis && p.has_financial_axis);
    panel.innerHTML = `
      <div class="mini" style="margin-bottom:6px;">값을 바꾼 지점만 저장/임시저장됩니다.</div>
      <div style="max-height:220px;overflow-y:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tbody id="batch-edit-tbody">
            ${twoAxis.map(p => `
              <tr data-group="${p.theme_group}">
                <td style="padding:3px 2px;">${esc(p.theme_name)}</td>
                <td style="padding:3px 2px;"><input type="number" class="batch-impact" min="1" max="5" step="0.1" value="${p.final.impact ?? ''}" data-original="${p.final.impact ?? ''}" style="width:44px;box-sizing:border-box;margin:0;padding:2px 3px;font-size:10.5px;"></td>
                <td style="padding:3px 2px;"><input type="number" class="batch-financial" min="1" max="5" step="0.1" value="${p.final.financial ?? ''}" data-original="${p.final.financial ?? ''}" style="width:44px;box-sizing:border-box;margin:0;padding:2px 3px;font-size:10.5px;"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <label class="mini" style="display:block;margin:6px 0 2px;">일괄 조정 사유(전체 저장 시 필수)</label>
      <textarea id="batch-reason" style="width:100%;min-height:40px;font-size:11px;"></textarea>
      <div style="display:flex;gap:6px;margin-top:6px;">
        <button id="btn-batch-draft" class="btn ghost small" style="flex:1;">전체 임시저장</button>
        <button id="btn-batch-save" class="btn primary small" style="flex:1;">전체저장→보고서</button>
      </div>
      <div id="batch-result" class="mini" style="margin-top:4px;"></div>
    `;

    function collectBatchEdits() {
      const edits = [];
      document.querySelectorAll('#batch-edit-tbody tr').forEach(row => {
        const impactInput = row.querySelector('.batch-impact');
        const financialInput = row.querySelector('.batch-financial');
        const impactVal = Number(impactInput.value), financialVal = Number(financialInput.value);
        const impactOrig = Number(impactInput.dataset.original), financialOrig = Number(financialInput.dataset.original);
        if (Math.abs(impactVal - impactOrig) > 0.001 || Math.abs(financialVal - financialOrig) > 0.001) {
          edits.push({ themeGroup: row.dataset.group, impactFinal: impactVal, financialFinal: financialVal });
        }
      });
      return edits;
    }

    document.getElementById('btn-batch-draft').addEventListener('click', async () => {
      const edits = collectBatchEdits();
      const resultEl = document.getElementById('batch-result');
      if (edits.length === 0) { resultEl.textContent = '변경된 값이 없습니다.'; return; }
      const reason = document.getElementById('batch-reason').value;
      edits.forEach(e => { e.reason = reason; });
      await db.batchSaveDrafts(assessmentId, edits);
      resultEl.textContent = `${edits.length}건 임시저장됨.`;
    });

    document.getElementById('btn-batch-save').addEventListener('click', async (ev) => {
      const edits = collectBatchEdits();
      const resultEl = document.getElementById('batch-result');
      if (edits.length === 0) { resultEl.textContent = '변경된 값이 없습니다.'; return; }
      const reason = document.getElementById('batch-reason').value;
      const btn = ev.currentTarget;
      btn.disabled = true; btn.textContent = '저장 중…';
      try {
        await db.batchSaveOverrides(assessmentId, edits, { reason, adjustedBy: '담당자' });
        resultEl.textContent = `${edits.length}건 저장 완료 — 보고서로 이동합니다…`;
        setTimeout(() => { location.hash = `#/report/${assessmentId}`; }, 400);
      } catch (e) {
        alert(e.message);
        btn.disabled = false; btn.textContent = '전체저장→보고서';
      }
    });
  }

  document.getElementById('btn-toggle-batch').addEventListener('click', (ev) => {
    batchMode = !batchMode;
    ev.currentTarget.textContent = batchMode ? '개별 조정으로' : '전체 일괄조정';
    if (batchMode) {
      renderBatchPanel();
    } else {
      const panel = document.getElementById('matrix-panel');
      panel.classList.add('panel-empty');
      panel.innerHTML = '점을 클릭하면 상세·조정 패널이 열립니다.';
    }
  });

  async function onPointClick(themeGroup) {
    if (batchMode) return; // 일괄조정 모드에서는 점 클릭으로 개별 패널을 덮어쓰지 않음
    const panelLoading = document.getElementById('matrix-panel');
    if (panelLoading) panelLoading.innerHTML = `<div class="mini">불러오는 중…</div>`;

    const [points, draft] = await Promise.all([db.getQuadrantData(templateId), db.getScoreDraft(assessmentId, themeGroup)]);
    if (!isCurrent(token)) return;
    const panel = document.getElementById('matrix-panel');
    if (!panel) return;
    const p = points.find(x => x.theme_group === themeGroup);
    panel.classList.remove('panel-empty');

    panel.innerHTML = `
      ${p.is_manually_adjusted ? '<span class="adjusted-tag">✏️ 수동 조정됨</span>' : ''}
      ${draft ? '<span class="adjusted-tag" style="background:#eaf1fe;color:#2f6fed;">📝 임시저장 있음</span>' : ''}
      <div class="topic-name" style="font-size:13px;">${esc(p.theme_name)}</div>
      <div class="topic-code" style="font-size:10px;">${p.theme_group}</div>

      <div class="score-row"><span class="lbl">영향(계산값)</span><span class="val calc">${p.calculated.impact ?? '-'}</span></div>
      <div class="score-row"><span class="lbl">재무(계산값)</span><span class="val calc">${p.calculated.financial ?? '-'}</span></div>
      <div class="score-row"><span class="lbl">영향(최종)</span><span class="val">${p.final.impact ?? '-'}</span></div>
      <div class="score-row"><span class="lbl">재무(최종)</span><span class="val">${p.final.financial ?? '-'}</span></div>

      ${p.adjustment_reason ? `<div class="reason-box">사유: ${esc(p.adjustment_reason)}</div>` : ''}

      <div class="toggle-row">
        <span class="lbl">조정</span>
        <button id="btn-toggle-adjust" class="btn ghost small">${p.is_manually_adjusted || draft ? '편집' : '시작'}</button>
      </div>
      <div id="adjust-form"></div>
      ${p.is_manually_adjusted ? '<button id="btn-clear-adjust" class="btn ghost" style="width:100%;margin-top:6px;">계산값 복원</button>' : ''}
      <a href="#/iro/${p.assessment_id}/${p.theme_group}" class="btn ghost" style="width:100%;margin-top:10px;display:block;text-align:center;text-decoration:none;font-size:11px;">→ IRO 워크시트</a>
    `;

    document.getElementById('btn-toggle-adjust').addEventListener('click', () => {
      const impactVal = draft ? draft.impact_final : p.final.impact;
      const financialVal = draft ? draft.financial_final : p.final.financial;
      const reasonVal = draft ? draft.reason : '';

      document.getElementById('adjust-form').innerHTML = `
        <div class="adj-box">
          <label>영향 최종값</label>
          <input type="number" id="adj-impact" min="1" max="5" step="0.1" value="${impactVal ?? ''}">
          <label>재무 최종값</label>
          <input type="number" id="adj-financial" min="1" max="5" step="0.1" value="${financialVal ?? ''}">
          <label>사유(정식저장 시 필수)</label>
          <textarea id="adj-reason">${esc(reasonVal || '')}</textarea>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button id="btn-draft-save" class="btn ghost small" style="flex:1;">임시저장</button>
            <button id="btn-save-adjust" class="btn primary small" style="flex:1;">저장</button>
          </div>
          <div id="adjust-form-result" class="mini" style="margin-top:4px;"></div>
        </div>`;

      document.getElementById('btn-draft-save').addEventListener('click', async () => {
        const impactFinal = Number(document.getElementById('adj-impact').value);
        const financialFinal = Number(document.getElementById('adj-financial').value);
        const reason = document.getElementById('adj-reason').value;
        await db.saveScoreDraft(assessmentId, p.theme_group, { impactFinal, financialFinal, reason });
        document.getElementById('adjust-form-result').textContent = '임시저장됨.';
      });

      document.getElementById('btn-save-adjust').addEventListener('click', async (ev) => {
        const btn = ev.currentTarget;
        const impactFinal = Number(document.getElementById('adj-impact').value);
        const financialFinal = Number(document.getElementById('adj-financial').value);
        const reason = document.getElementById('adj-reason').value;
        btn.disabled = true; btn.textContent = '저장 중…';
        try {
          await db.setManualOverride(p.assessment_id, p.theme_group, { impactFinal, financialFinal, reason });
          await db.clearScoreDraft(assessmentId, p.theme_group);
          if (!isCurrent(token)) return;
          await refresh();
          if (!isCurrent(token)) return;
          await onPointClick(p.theme_group);
        } catch (e) {
          alert(e.message);
          btn.disabled = false; btn.textContent = '저장';
        }
      });
    });

    const clearBtn = document.getElementById('btn-clear-adjust');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        await db.clearManualOverride(p.assessment_id, p.theme_group);
        if (!isCurrent(token)) return;
        await refresh();
        if (!isCurrent(token)) return;
        onPointClick(p.theme_group);
      });
    }
  }

  refresh();
}

// ============================================================
// S-24. 내부 IRO 정밀화 워크시트 (v2.6 — ESG팀 전용, 이해관계자 비노출)
// ============================================================
async function pageIROWorksheet(container, assessmentId, themeGroup, token) {
  const [groups, saved, assessment, esrsTopic] = await Promise.all([
    db.listThemeGroups(), db.getIROWorksheet(assessmentId, themeGroup),
    db.getAssessment(assessmentId), db.getEsrsTopicForThemeGroup(themeGroup)
  ]);
  if (!isCurrent(token)) return;
  const groupInfo = groups.find(g => g.group_code === themeGroup) || { group_name: themeGroup };
  const readOnly = assessment && assessment.status === 'FINALIZED';

  container.innerHTML = `
    <div class="page-head">
      <h1>내부 IRO 정밀화 워크시트</h1>
      <div class="bc">${esc(groupInfo.group_name)} (${themeGroup}) · ${assessment ? assessment.report_year + '년' : ''} ·
        ESG팀 전용 — 이해관계자에게 노출되지 않습니다</div>
    </div>

    ${readOnly ? '<div class="reason-box">이 평가사이클은 확정(FINALIZED)되어 읽기 전용입니다.</div>' : ''}

    <div class="notice-box">
      이 화면은 설문이 아닙니다. 설문 평균은 참고값이며, 아래 세부지표는 ESG팀/위원회가
      데스크리서치·전문가 판단을 반영해 직접 입력합니다(v2.6 설계 원칙).
      ${esrsTopic ? `연결된 ESRS 토픽: <b>${esrsTopic.topic_code} ${esc(esrsTopic.topic_name)}</b>${esrsTopic.is_default_material ? ' <span class="dim-badge" style="background:#fdeaea;color:#c0392b;">기본중대</span>' : ''}` : ''}
    </div>

    <div class="card">
      <div class="field-label">영향중대성 세부지표</div>
      <label>규모(scale)</label><input type="number" id="iro-scale" min="1" max="5" value="${saved?.impact_scale ?? ''}" ${readOnly?'disabled':''}>
      <label>범위(scope)</label><input type="number" id="iro-scope" min="1" max="5" value="${saved?.impact_scope ?? ''}" ${readOnly?'disabled':''}>
      <label>회복불가능성(irremediability)</label><input type="number" id="iro-irr" min="1" max="5" value="${saved?.impact_irremediability ?? ''}" ${readOnly?'disabled':''}>
      <label>발생가능성(likelihood)</label><input type="number" id="iro-il" min="1" max="5" value="${saved?.impact_likelihood ?? ''}" ${readOnly?'disabled':''}>
    </div>

    <div class="card">
      <div class="field-label">재무중대성 세부지표</div>
      <label>효과크기(magnitude)</label><input type="number" id="iro-mag" min="1" max="5" value="${saved?.financial_magnitude ?? ''}" ${readOnly?'disabled':''}>
      <label>발생가능성(likelihood)</label><input type="number" id="iro-fl" min="1" max="5" value="${saved?.financial_likelihood ?? ''}" ${readOnly?'disabled':''}>
      <label>시간지평</label>
      <select id="iro-th" ${readOnly?'disabled':''}>
        <option value="SHORT" ${saved?.financial_time_horizon==='SHORT'?'selected':''}>단기(1년 미만)</option>
        <option value="MEDIUM" ${saved?.financial_time_horizon==='MEDIUM'?'selected':''}>중기(1~5년)</option>
        <option value="LONG" ${saved?.financial_time_horizon==='LONG'?'selected':''}>장기(5년 초과)</option>
      </select>
    </div>

    ${esrsTopic && esrsTopic.is_default_material ? `
    <div class="card" style="border-color:#f0d9b8;background:#fff8f0;">
      <label class="field-label" style="color:#a06a1f;">기본중대 토픽 비중대 판정 사유 (규모·발생가능성을 모두 낮게(≤2) 입력할 경우 필수)</label>
      <textarea id="iro-nonmat" style="width:100%;min-height:60px;" ${readOnly?'disabled':''}>${esc(saved?.non_material_justification || '')}</textarea>
    </div>` : ''}

    <div class="card">
      <label class="field-label">판단 근거 서술 (감사대응 핵심, 필수)</label>
      <textarea id="iro-note" style="width:100%;min-height:90px;" ${readOnly?'disabled':''}>${esc(saved?.analyst_note || '')}</textarea>
    </div>

    ${readOnly ? '' : '<button id="btn-save-iro" class="btn primary" style="width:100%;">저장</button>'}
    <div id="iro-result"></div>
  `;

  if (readOnly) return;

  document.getElementById('btn-save-iro').addEventListener('click', async () => {
    const note = document.getElementById('iro-note').value.trim();
    const nonMatEl = document.getElementById('iro-nonmat');
    try {
      await db.saveIROWorksheet(assessmentId, themeGroup, {
        impact_scale: Number(document.getElementById('iro-scale').value) || null,
        impact_scope: Number(document.getElementById('iro-scope').value) || null,
        impact_irremediability: Number(document.getElementById('iro-irr').value) || null,
        impact_likelihood: Number(document.getElementById('iro-il').value) || null,
        financial_magnitude: Number(document.getElementById('iro-mag').value) || null,
        financial_likelihood: Number(document.getElementById('iro-fl').value) || null,
        financial_time_horizon: document.getElementById('iro-th').value,
        non_material_justification: nonMatEl ? nonMatEl.value.trim() : null,
        analyst_note: note,
        analyzed_by: '담당자'
      });
      document.getElementById('iro-result').innerHTML = `<div class="success-box">저장되었습니다.</div>`;
    } catch (e) {
      document.getElementById('iro-result').innerHTML = `<div class="reason-box">${esc(e.message)}</div>`;
    }
  });
}

// ============================================================
// 설문 목록 (홈)
// ============================================================
async function pageHome(container, token) {
  const [templates, assessments] = await Promise.all([db.listSurveyTemplates(), db.listAssessments()]);
  if (!isCurrent(token)) return;
  const yearOf = id => { const a = assessments.find(x => x.id === id); return a ? `${a.report_year}년 (${ASSESSMENT_STATUS_LABEL[a.status]})` : '(평가사이클 없음)'; };

  container.innerHTML = `
    <div class="page-head">
      <h1>중대성평가 설문 목록</h1>
      <div class="bc">중대성평가 모듈 (Smart ESG 연동 예정)</div>
    </div>

    <div class="card" style="display:flex;gap:10px;">
      <a href="#/assessments" class="btn ghost">평가사이클 관리</a>
      <a href="#/esrs-topics" class="btn ghost">ESRS 토픽 마스터</a>
      <a href="#/stakeholders" class="btn ghost">이해관계자 관리</a>
      <a href="#/issuepool" class="btn ghost">이슈풀</a>
    </div>

    ${assessments.length === 0 ? `<div class="notice-box">아직 평가사이클이 없습니다. <a href="#/assessments">먼저 평가사이클을 만들어주세요</a>.</div>` : ''}
    ${templates.length === 0 ? `<div class="card">아직 발행된 설문이 없습니다. <a href="#/survey-builder">설문지 작성하러 가기</a></div>` : ''}
    ${templates.map(t => `
      <div class="card template-card">
        <div>
          <div class="tc-title">${esc(t.title)}</div>
          <div class="mini">${yearOf(t.assessment_id)} · ${t.target_question_count}문항 · ${new Date(t.created_at).toLocaleString('ko-KR')}</div>
        </div>
        <div class="tc-links">
          <a href="#/respond/${t.id}">응답(모의)</a>
          <a href="#/analysis/${t.id}">분석</a>
          <a href="#/matrix/${t.id}">매트릭스</a>
        </div>
      </div>
    `).join('')}
  `;
}
