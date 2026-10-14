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
<head><meta charset="UTF-8"><title>ESG 보고서 - ${assessment.title}</title>
<style>
  @page { size: A4; margin: 20mm 15mm }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact }
    .no-print { display: none !important }
    .page-break { page-break-before: always }
  }
  * { margin: 0; padding: 0; box-sizing: border-box }
  body { font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 10.5pt; line-height: 1.7; color: #14213D; padding: 0 }
  .cover { text-align: center; padding: 120px 40px 60px; border-bottom: 3px solid #1E3A5F }
  .cover h1 { font-size: 26pt; font-weight: 700; letter-spacing: -0.5px; color: #14213D; margin-bottom: 16px }
  .cover .company { font-size: 16pt; color: #1E3A5F; font-weight: 600; margin-bottom: 8px }
  .cover .date { font-size: 12pt; color: #9ca3af }
  .toc { padding: 30px 40px }
  .toc h2 { font-size: 14pt; border-bottom: 2px solid #14213D; padding-bottom: 6px; margin-bottom: 16px }
  .toc-item { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dotted #e4e7eb; font-size: 11pt }
  h2 { font-size: 14pt; font-weight: 700; color: #14213D; border-bottom: 2px solid #1E3A5F; padding-bottom: 6px; margin: 28px 0 14px }
  h3 { font-size: 11pt; font-weight: 600; color: #1F2937; margin: 16px 0 8px }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt }
  th, td { border: 1px solid #E4E7EB; padding: 7px 10px; text-align: left }
  th { background: #F8FAFC; font-weight: 600; color: #6B7280; white-space: nowrap }
  td { color: #1F2937 }
  .section { margin-bottom: 20px; padding: 0 10px }
  .evidence-ref { color: #1E3A5F; font-size: 9pt; margin-top: 4px }
  .scope-box { background: #F8FAFC; border: 1px solid #e4e7eb; border-radius: 6px; padding: 10px 14px; margin: 8px 0; font-size: 10pt }
  .scope-box strong { color: #1E3A5F }
  .warn-box { background: #fff5f5; border: 1px solid #ffccc7; border-radius: 6px; padding: 10px 14px; margin: 8px 0; font-size: 10pt; color: #DC2626 }
  .footer { text-align: center; color: #9CA3AF; font-size: 9pt; margin-top: 40px; padding-top: 16px; border-top: 1px solid #eef1f4 }
  .print-btn { position: fixed; bottom: 20px; right: 20px; z-index: 9999; padding: 12px 24px; background: #1E3A5F; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 16px rgba(30,58,95,.3) }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">🖨 인쇄 / PDF 저장</button>
<div class="cover">
  <h1>ESG 지속가능경영 보고서</h1>
  <p class="company">${company?.name || '회사명'}</p>
  <p class="date">${assessment.assessment_year}년도 | ${authorityName}</p>
  <p class="date" style="margin-top:8px">생성일: ${now}</p>
</div>
<div class="toc page-break">
  <h2>목차</h2>
  <div class="toc-item"><span>1. 평가 개요</span><span>2</span></div>
  <div class="toc-item"><span>2. 지표별 평가 결과</span><span>3</span></div>
  <div class="toc-item"><span>3. 온실가스 배출량</span><span>-</span></div>
  <div class="toc-item"><span>4. 결론</span><span>-</span></div>
</div>
<div class="page-break"></div>
<h2>1. 평가 개요</h2>
<table>
  <tr><th style="width:120px">평가명</th><td>${assessment.title}</td><th style="width:100px">대상 연도</th><td>${assessment.assessment_year}</td></tr>
  <tr><th>평가 기준</th><td>${authorityName}</td><th>총점</th><td>${assessment.total_score ?? '-'}</td></tr>
  <tr><th>등급</th><td>${assessment.rating ?? '-'}</td><th>상태</th><td>${assessment.status || '-'}</td></tr>
</table>`

    const groups = Indicator.getGroups(assessment.authority_code)
    const ghgSummary = GHG.getSummary(assessmentId)
    const hasGHGData = Object.keys(ghgSummary).length > 0

    html += `<div class="page-break"></div><h2>2. 지표별 평가 결과</h2>`
    groups.forEach(group => {
      const indicators = Indicator.getIndicators(group.id)
      const groupItems = items.filter(i => indicators.some(ind => ind.id === i.indicator_id))
      if (!groupItems.length) return

      html += `<h3>${group.group_name}</h3>`
      groupItems.forEach(item => {
        const ind = indicators.find(i => i.id === item.indicator_id)
        if (!ind) return
        const draft = drafts.find(d => d.indicator_id === ind.id)

        html += `<div class="section">
<h3>${ind.indicator_code} - ${ind.indicator_name}</h3>
<table>
  <tr><th style="width:80px">점수</th><td style="width:80px">${item.score ?? '-'}</td><th style="width:80px">가중치</th><td>${item.weight ?? '-'}</td></tr>
</table>`
        if (ind.scope2_split_required && hasGHGData) {
          html += `<div class="scope-box"><strong>Scope2 분할:</strong> `
          Object.values(ghgSummary).forEach(s => {
            const label = s.scope2_method ? `Scope 2 (${s.scope2_method === 'location-based' ? '위치기준' : '시장기준'})` : `Scope ${s.scope}`
            html += `${label} ${s.total.toFixed(2)} tCO2eq &nbsp;`
          })
          html += `</div>`
        }
        if (draft) {
          html += `<p style="margin:6px 0">${draft.draft_text}</p>`
          if (draft.evidence_ids?.length) {
            html += `<p class="evidence-ref">참조 증빙 ID: ${draft.evidence_ids.join(', ')}</p>`
          }
        } else if (item.narrative) {
          html += `<p style="margin:6px 0">${item.narrative}</p>`
        }
        html += `</div>`
      })
    })

    if (hasGHGData) {
      html += `<div class="page-break"></div><h2>3. 온실가스 배출량 요약</h2>
<table>
  <tr><th>Scope</th><th>구분</th><th>배출량 (tCO2eq)</th><th>건수</th></tr>`
      let totalAll = 0
      Object.values(ghgSummary).forEach(s => {
        totalAll += s.total
        html += `<tr><td>Scope ${s.scope}</td><td>${s.scope2_method || '-'}</td><td>${s.total.toFixed(2)}</td><td>${s.count}</td></tr>`
      })
      html += `<tr style="font-weight:700;background:#F8FAFC"><td colspan="2">합계</td><td>${totalAll.toFixed(2)}</td><td></td></tr>`
      html += `</table>`
    }

    html += `
<h2>${hasGHGData ? '4' : '3'}. 결론</h2>
<p>본 보고서는 Smart ESG 시스템을 통해 작성되었으며, ${assessment.assessment_year}년도 ESG 경영활동에 대한 평가 결과를 담고 있습니다.</p>
<div class="footer">
  <p>본 보고서는 Smart ESG 시스템에서 자동 생성되었습니다.</p>
  <p>생성일: ${now} | ${authorityName} 기준</p>
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
  },

  downloadHTML(assessmentId) {
    const html = this.generateHTML(assessmentId)
    const assessment = Store.getAssessments().find(a => a.id === assessmentId)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ESG_보고서_${assessment?.title || assessmentId}.html`
    a.click()
    URL.revokeObjectURL(url)
  }
}
