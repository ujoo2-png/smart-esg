/**
 * export-utils.js
 * - 구글폼 변환: Google Apps Script(FormApp) 코드를 생성해 .gs 텍스트로 다운로드.
 *   사용자가 script.google.com에서 새 프로젝트를 만들어 이 코드를 붙여넣고 실행하면
 *   문항이 그대로 반영된 구글폼이 자동 생성됩니다(공식 REST API로 폼을 직접 만들 수 없어
 *   Apps Script가 실무적으로 가장 안정적인 방법입니다).
 * - 엑셀 템플릿 다운로드 / 업로드 파싱: SheetJS(xlsx, js/vendor에 로컬 번들) 사용.
 */

function downloadTextFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildGoogleFormScript(title, questions) {
  const esc = s => (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  const items = questions.map((q, i) => `
  // ${i + 1}. [${q.dimension_tag}] ${q.issue_code}
  form.addScaleItem()
      .setTitle('${esc(q.question_text)}')
      .setBounds(1, 5)
      .setLabels('거의 영향 없음(1)', '매우 큰 영향(5)')
      .setRequired(true);`).join('\n');

  return `/**
 * Smart ESG 중대성평가 설문 — 구글폼 자동생성 스크립트
 * 사용법: script.google.com 접속 → 새 프로젝트 → 아래 코드 전체를 붙여넣기 →
 *        상단 함수 선택에서 createMaterialityForm 선택 → 실행(▶)
 *        최초 실행 시 권한 승인 필요. 실행 로그(보기 > 로그)에 생성된 폼 URL이 출력됩니다.
 * 생성일: ${new Date().toISOString().slice(0,10)}
 */
function createMaterialityForm() {
  const form = FormApp.create('${esc(title)}');
  form.setDescription('본 설문은 ESG 중대성평가(이중중대성평가)를 위한 이해관계자 의견 수렴 목적으로 실시됩니다. 각 문항은 1~5점 척도로 평가해 주십시오.');
  form.setCollectEmail(false);

  const stakeholderItem = form.addMultipleChoiceItem();
  stakeholderItem.setTitle('귀하는 이해관계자 중 어디에 해당되십니까?')
      .setChoices([
        stakeholderItem.createChoice('종업원'),
        stakeholderItem.createChoice('파트너(협력사)'),
        stakeholderItem.createChoice('고객'),
        stakeholderItem.createChoice('투자자'),
        stakeholderItem.createChoice('지역사회')
      ])
      .setRequired(true);
${items}

  Logger.log('설문 생성 완료: ' + form.getEditUrl());
  Logger.log('응답 URL: ' + form.getPublishedUrl());
}
`;
}

function exportSurveyToGoogleFormScript(title, questions) {
  const script = buildGoogleFormScript(title, questions);
  downloadTextFile(`${title.replace(/[^\w가-힣]/g, '_')}_구글폼생성스크립트.gs`, script);
}

// ---------------- 엑셀 템플릿 / 업로드 파싱 ----------------

function downloadResponseExcelTemplate(title, questions) {
  const header = ['응답자명', '이해관계자그룹(EMPLOYEE/PARTNER/CUSTOMER/INVESTOR/COMMUNITY)', ...questions.map(q => q.issue_code)];
  const guide = ['(예: 김도현)', '(예: EMPLOYEE)', ...questions.map(() => '1~5')];
  const qNameRow = ['', '', ...questions.map(q => q.question_text)];

  const ws = XLSX.utils.aoa_to_sheet([qNameRow, header, guide]);
  ws['!cols'] = header.map((_, i) => ({ wch: i < 2 ? 24 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '응답입력');
  XLSX.writeFile(wb, `${title.replace(/[^\w가-힣]/g, '_')}_응답템플릿.xlsx`);
}

// 업로드된 엑셀 파일을 파싱해 rows: [{respondent_name, group_type, scores:{issue_code:val}}] 로 변환
// 템플릿 규칙: 1행=문항텍스트(참고용, 무시), 2행=헤더(응답자명/그룹/issue_code...), 3행부터 데이터
function parseResponseExcelFile(file, questionCodes) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // 헤더 행 탐색: '응답자' 또는 '응답자명'을 포함하는 첫 행을 헤더로 간주
        let headerIdx = rows.findIndex(r => r.some(c => typeof c === 'string' && c.includes('응답자')));
        if (headerIdx === -1) headerIdx = 0;
        const header = rows[headerIdx].map(h => String(h || '').trim());

        const nameCol = 0;
        const groupCol = 1;
        const codeColMap = {};
        header.forEach((h, idx) => {
          const match = questionCodes.find(c => h.startsWith(c));
          if (match) codeColMap[match] = idx;
        });

        const parsed = [];
        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !r[nameCol]) continue;
          const scores = {};
          Object.keys(codeColMap).forEach(code => {
            const v = r[codeColMap[code]];
            if (v !== '' && v != null) scores[code] = v;
          });
          parsed.push({
            respondent_name: String(r[nameCol]).trim(),
            group_type: String(r[groupCol] || 'EMPLOYEE').trim().toUpperCase(),
            scores
          });
        }
        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}
