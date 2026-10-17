/**
 * smart-esg-bridge.js — Smart ESG 본편(iframe 임베드) 연계 브리지
 *
 * 목적: 이 모듈(standalone)이 Smart ESG 본편의「이중중대성평가」화면에 iframe으로
 *       임베드될 때, 본편이 postMessage로 요청한 결과 번들(materiality-result.json 계약)을
 *       돌려줍니다. 기존 페이지/스토어를 수정하지 않으며 postMessage 핸들러만 추가합니다.
 *
 * 프로토콜 (부모 → 자식):
 *   { source:'smart-esg', type:'MAT_APP_LIST', requestId }  → 평가사이클 목록 요청
 *   { source:'smart-esg', type:'MAT_APP_GET',  requestId, assessmentId } → 결과 번들 요청
 * (자식 → 부모):
 *   { source:'materiality-app', type:'MAT_APP_READY', version }
 *   { source:'materiality-app', type:'MAT_APP_LIST_RESULT', requestId, assessments }
 *   { source:'materiality-app', type:'MAT_APP_BUNDLE', requestId, bundle }
 *   { source:'materiality-app', type:'MAT_APP_ERROR', requestId, error }
 *   { source:'materiality-app', type:'MAT_APP_WANT_PICK' }   (임베드 시 플로팅 버튼)
 */

(function () {
  var IS_EMBEDDED = false;
  try { IS_EMBEDDED = !!(window.parent && window.parent !== window) } catch (e) { IS_EMBEDDED = false }

  function post(type, payload) {
    if (!IS_EMBEDDED) return
    try { window.parent.postMessage(Object.assign({ source: 'materiality-app', type: type }, payload || {}), '*') } catch (e) {}
  }

  async function listAssessments() {
    var list = []
    try { list = await db.listAssessments() } catch (e) { list = [] }
    return (list || []).map(function (a) {
      return {
        id: a.id,
        year: a.report_year,
        status: a.status,
        title: (a.report_year ? a.report_year + ' ' : '') + '중대성평가 (v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') + ')'
      }
    })
  }

  window.addEventListener('message', async function (ev) {
    var d = ev && ev.data
    if (!d || typeof d !== 'object' || d.source !== 'smart-esg') return
    if (d.type === 'MAT_APP_LIST') {
      try {
        post('MAT_APP_LIST_RESULT', { requestId: d.requestId || null, assessments: await listAssessments() })
      } catch (e) {
        post('MAT_APP_ERROR', { requestId: d.requestId || null, error: String((e && e.message) || e) })
      }
    } else if (d.type === 'MAT_APP_GET') {
      try {
        var bundle = await exportIntegrationBundle(d.assessmentId)
        post('MAT_APP_BUNDLE', { requestId: d.requestId || null, bundle: bundle })
      } catch (e) {
        post('MAT_APP_ERROR', { requestId: d.requestId || null, error: String((e && e.message) || e) })
      }
    }
  })

  function mountFloatingButton() {
    if (document.getElementById('smart-esg-bridge-btn')) return
    var btn = document.createElement('button')
    btn.id = 'smart-esg-bridge-btn'
    btn.type = 'button'
    btn.textContent = '⬆ 본편으로 연동'
    btn.title = 'Smart ESG 이중중대성평가 화면으로 분석 결과를 가져옵니다'
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:9999;padding:10px 16px;border:none;border-radius:999px;background:#1E3A5F;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(30,58,95,.35)'
    btn.addEventListener('click', function () { post('MAT_APP_WANT_PICK', {}) })
    document.body.appendChild(btn)
  }

  window.addEventListener('DOMContentLoaded', function () {
    if (!IS_EMBEDDED) return
    post('MAT_APP_READY', { version: (typeof APP_VERSION !== 'undefined' ? APP_VERSION : '') })
    mountFloatingButton()
  })
})();
