// 보고서 출력 · 내보내기 모듈
// HTML print · PDF · 보고서 포맷

const Report = {
  generateHTML(assessmentId) {
    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    if (!assessment) return '<p>평가 정보를 찾을 수 없습니다.</p>'

    const company = Store.getCompanies().find(c => c.id === assessment.company_id)
    const items = Store.getAssessmentItems().filter(i => i.assessment_id === assessmentId)
    const drafts = Store.getAIDrafts().filter(d => d.assessment_id === assessmentId && d.human_status === 'approved')

    const authorityName = Indicator.getAuthorityName(assessment.authority_code)
    const now = new Date().toLocaleDateString('ko-KR')

    let html = `
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>ESG 보고서</title>
<style>
  @page { margin: 20mm 15mm }
  body { font-family: 'Nanum Gothic', sans-serif; font-size: 11pt; line-height: 1.6; color: #333 }
  h1 { font-size: 22pt; text-align: center; margin-bottom: 30px }
  h2 { font-size: 16pt; border-bottom: 2px solid #2c3e50; padding-bottom: 5px; margin-top: 30px }
  h3 { font-size: 13pt; margin-top: 20px }
  table { width: 100%; border-collapse: collapse; margin: 15px 0 }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left }
  th { background: #f5f5f5 }
  .cover { text-align: center; padding: 100px 0 }
  .cover h1 { font-size: 28pt }
  .cover .subtitle { font-size: 14pt; color: #666; margin-top: 20px }
  .section { margin-bottom: 25px }
  .evidence-ref { color: #3498db; font-size: 9pt }
  .footer { text-align: center; color: #999; font-size: 9pt; margin-top: 50px }
</style>
</head>
<body>
<div class="cover">
  <h1>ESG 지속가능경영 보고서</h1>
  <p class="subtitle">${company?.name || '회사명'}</p>
  <p>${now}</p>
</div>
<div style="page-break-before:always"></div>
<h2>1. 개요</h2>
<table>
  <tr><th>평가명</th><td>${assessment.title}</td></tr>
  <tr><th>대상 연도</th><td>${assessment.assessment_year}</td></tr>
  <tr><th>평가 기준</th><td>${authorityName}</td></tr>
  <tr><th>총점</th><td>${assessment.total_score ?? '-'}</td></tr>
  <tr><th>등급</th><td>${assessment.rating ?? '-'}</td></tr>
</table>`

    // 지표별 상세
    const groups = Indicator.getGroups(assessment.authority_code)
    const ghgSummary = GHG.getSummary(assessmentId)
    const hasGHGData = Object.keys(ghgSummary).length > 0
    groups.forEach(group => {
      const indicators = Indicator.getIndicators(group.id)
      const groupItems = items.filter(i => indicators.some(ind => ind.id === i.indicator_id))
      if (!groupItems.length) return

      html += `<h2>${group.group_name}</h2>`
      groupItems.forEach(item => {
        const ind = indicators.find(i => i.id === item.indicator_id)
        if (!ind) return
        const draft = drafts.find(d => d.indicator_id === ind.id)

        html += `<div class="section">
<h3>${ind.indicator_code} - ${ind.indicator_name}</h3>
<table>
  <tr><th>점수</th><td>${item.score ?? '-'}</td><th>가중치</th><td>${item.weight ?? '-'}</td></tr>
</table>`
        if (ind.scope2_split_required) {
          if (hasGHGData) {
            html += `<div style="background:#fffbe6;border:1px solid #ffe58f;border-radius:4px;padding:8px 12px;margin:8px 0;font-size:10pt">
<strong>📊 Scope2 분할 필요 — GHG 요약:</strong><br>`
            Object.values(ghgSummary).forEach(s => {
              const label = s.scope2_method ? `Scope 2 (${s.scope2_method === 'location-based' ? '위치기준' : '시장기준'})` : `Scope ${s.scope}`
              html += `${label}: ${s.total.toFixed(2)} tCO2eq (${s.count}건)<br>`
            })
            html += `</div>`
          } else {
            html += `<div style="background:#fff2f0;border:1px solid #ffccc7;border-radius:4px;padding:8px 12px;margin:8px 0;font-size:10pt;color:#cf1322">
<strong>⚠️ Scope2 분할 필요 — GHG 데이터 미등록</strong>
</div>`
          }
        }
        if (draft) {
          html += `<p>${draft.draft_text}</p>`
          if (draft.evidence_ids?.length) {
            html += `<p class="evidence-ref">참조 증빙: ${draft.evidence_ids.join(', ')}</p>`
          }
        } else if (item.narrative) {
          html += `<p>${item.narrative}</p>`
        }
        html += `</div>`
      })
    })

    // GHG 요약
    if (hasGHGData) {
      html += `<h2>온실가스 배출량 요약</h2>
<table>
  <tr><th>Scope</th><th>구분</th><th>배출량(tCO2eq)</th><th>건수</th></tr>`
      Object.values(ghgSummary).forEach(s => {
        html += `<tr><td>Scope ${s.scope}</td><td>${s.scope2_method || '-'}</td><td>${s.total.toFixed(2)}</td><td>${s.count}</td></tr>`
      })
      html += `</table>`
    }

    html += `
<div class="footer">
  <p>본 보고서는 Smart ESG 시스템에서 자동 생성되었습니다.</p>
  <p>생성일: ${now}</p>
</div>
</body></html>`

    return html
  },

  print(assessmentId) {
    const html = this.generateHTML(assessmentId)
    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  },

  downloadHTML(assessmentId) {
    const html = this.generateHTML(assessmentId)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ESG_보고서_${assessmentId}.html`
    a.click()
    URL.revokeObjectURL(url)
  }
}
