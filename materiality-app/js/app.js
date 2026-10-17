/**
 * app.js — 해시 기반 라우터 + 네비게이션
 * 라우트는 업무 순서대로 정리되어 있습니다:
 *   #/                          파이프라인 대시보드(홈) — 7단계 진행현황 + 자동 오류탐지
 *   #/assessments               평가사이클(연도) 관리
 *   #/target-selection/:aid     1단계: 대상선정
 *   #/survey-builder(/:aid)     2단계: 설문지 작성
 *   #/respond/:tid              3단계: 실사(응답)
 *   #/signoff/:tid              4단계: 결과취합 검증·승인
 *   #/analysis/:tid             5단계: 결과 분석
 *   #/matrix/:tid                6단계: 사사분위 매트릭스(+수동조정, 확정은 평가사이클에서)
 *   #/report/:aid                7단계: 보고서 반영
 *   #/iro/:aid/:group            (지원) 내부 IRO 정밀화 워크시트
 *   #/weights/:aid                (지원) 가중치·임계값 설정
 *   #/esrs-topics, #/issuepool, #/stakeholders  (참고자료)
 */

const APP_ROOT = document.getElementById('app-content');

// 네비게이션 토큰: router()가 호출될 때마다 증가시켜, 이전 페이지의 비동기
// 렌더 콜백(await 이후 실행되는 코드)이 이미 사라진 DOM을 건드리지 않도록 막습니다.
// 각 page* 함수는 isCurrent()로 자기 렌더가 아직 유효한지 확인한 뒤 DOM을 조작해야 합니다.
let _navToken = 0;
function isCurrent(token) { return token === _navToken; }

const ROUTES = [
  { pattern: /^#\/$/, handler: (m, t) => pagePipeline(APP_ROOT, t) },
  { pattern: /^#\/survey-list$/, handler: (m, t) => pageHome(APP_ROOT, t) },
  { pattern: /^#\/assessments$/, handler: (m, t) => pageAssessments(APP_ROOT, t) },
  { pattern: /^#\/target-selection\/(.+)$/, handler: (m, t) => pageTargetSelection(APP_ROOT, m[1], t) },
  { pattern: /^#\/survey-builder$/, handler: (m, t) => pageSurveyBuilder(APP_ROOT, t, null) },
  { pattern: /^#\/survey-builder\/(.+)$/, handler: (m, t) => pageSurveyBuilder(APP_ROOT, t, m[1]) },
  { pattern: /^#\/respond\/(.+)$/, handler: (m, t) => pageSurveyRespond(APP_ROOT, m[1], t) },
  { pattern: /^#\/signoff\/(.+)$/, handler: (m, t) => pageSignoff(APP_ROOT, m[1], t) },
  { pattern: /^#\/analysis\/(.+)$/, handler: (m, t) => pageAnalysis(APP_ROOT, m[1], t) },
  { pattern: /^#\/distribution\/(.+)$/, handler: (m, t) => pageDistribution(APP_ROOT, m[1], t) },
  { pattern: /^#\/matrix\/(.+)$/, handler: (m, t) => pageMatrix(APP_ROOT, m[1], t) },
  { pattern: /^#\/consensus\/(.+)$/, handler: (m, t) => pageConsensus(APP_ROOT, m[1], t) },
  { pattern: /^#\/exclusion-history\/(.+)$/, handler: (m, t) => pageExclusionHistory(APP_ROOT, m[1], t) },
  { pattern: /^#\/report\/(.+)$/, handler: (m, t) => pageReportDraft(APP_ROOT, m[1], t) },
  { pattern: /^#\/weights\/(.+)$/, handler: (m, t) => pageWeights(APP_ROOT, m[1], t) },
  { pattern: /^#\/iro\/([^/]+)\/(.+)$/, handler: (m, t) => pageIROWorksheet(APP_ROOT, m[1], m[2], t) },
  { pattern: /^#\/issuepool$/, handler: (m, t) => pageIssuePool(APP_ROOT, t) },
  { pattern: /^#\/esrs-topics$/, handler: (m, t) => pageESRSTopics(APP_ROOT, t) },
  { pattern: /^#\/stakeholders$/, handler: (m, t) => pageStakeholders(APP_ROOT, t) },
];

function router() {
  const hash = location.hash || '#/';
  _navToken++;
  const token = _navToken;

  // 데이터 로딩 중 화면이 붕 뜨지 않도록 즉시 로딩 스켈레톤 표시(각 page 함수가 덮어씀)
  APP_ROOT.innerHTML = `<div class="card mini">불러오는 중…</div>`;

  for (const r of ROUTES) {
    const m = hash.match(r.pattern);
    if (m) {
      updateNavActive(hash);
      r.handler(m, token);
      window.scrollTo(0, 0);
      return;
    }
  }
  APP_ROOT.innerHTML = `<div class="card">페이지를 찾을 수 없습니다.</div>`;
}

function updateNavActive(hash) {
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === hash ||
      (a.dataset.section && hash.startsWith(a.dataset.section)));
  });
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('version-badge').textContent = 'v' + APP_VERSION;
  document.getElementById('footer-version').textContent = 'v' + APP_VERSION;
  document.getElementById('btn-reset-demo').addEventListener('click', async () => {
    if (confirm('데모 데이터(설문/응답/조정값)를 모두 초기화할까요? 이슈풀 원본은 유지됩니다.')) {
      await db.resetAll();
      location.hash = '#/';
      router();
    }
  });
  router();
});
