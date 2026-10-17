/**
 * matrix.js
 * 사사분위(이중중대성) 매트릭스 SVG 렌더링 + 클릭 시 상세/수동조정 패널 연동.
 * points: db.getQuadrantData()의 반환값 (각 point에 impact_threshold/financial_threshold 포함,
 * 관리자 가중치 설정 화면(S-WEIGHT)에서 조정한 값이 반영됩니다)
 */

function _scaleToSvg(val, min = 1, max = 5, pxMin = 60, pxMax = 580) {
  const clamped = Math.max(min, Math.min(max, val));
  return pxMin + ((clamped - min) / (max - min)) * (pxMax - pxMin);
}

function quadrantOf(x, y, thImpact, thFinancial) {
  if (x === null || y === null) return 'SINGLE_AXIS';
  if (x >= thFinancial && y >= thImpact) return 'DOUBLE_MATERIAL';
  if (y >= thImpact) return 'IMPACT_ONLY';
  if (x >= thFinancial) return 'FINANCIAL_ONLY';
  return 'NOT_MATERIAL';
}

// 타사 사례(하나머티리얼즈/PI첨단소재 보고서)처럼 High/Medium/Low 등급도 함께 표기
function levelOf(score) {
  if (score === null) return '-';
  if (score >= 4) return 'High';
  if (score >= 2.5) return 'Medium';
  return 'Low';
}

const QUADRANT_META = {
  DOUBLE_MATERIAL: { label: '① 이중 중대', color: '#c0392b', bg: '#fdeaea' },
  IMPACT_ONLY: { label: '② 영향중대성만', color: '#b8860b', bg: '#fff6e0' },
  FINANCIAL_ONLY: { label: '③ 재무중대성만', color: '#2f6fed', bg: '#eaf1fe' },
  NOT_MATERIAL: { label: '④ 비중대', color: '#8a919c', bg: '#eef0f2' }
};

function renderMatrix(container, points, onPointClick, confidence) {
  const twoAxis = points.filter(p => p.has_impact_axis && p.has_financial_axis);
  const singleAxis = points.filter(p => !p.has_impact_axis || !p.has_financial_axis);
  const thImpact = twoAxis[0]?.impact_threshold ?? 3;
  const thFinancial = twoAxis[0]?.financial_threshold ?? 3;

  const svgW = 640, svgH = 480;
  const midX = _scaleToSvg(thFinancial), midY = _scaleToSvg(thImpact);
  const pxPerUnit = (580 - 60) / (5 - 1); // 1~5 척도 1단위당 픽셀 (신뢰구간 반지름 환산용)

  // 순위기반 원 크기: 영향+재무 합산점수가 높은 순서대로 가장 크게(요청기능)
  const RADIUS_MAX = 17, RADIUS_MIN = 8;
  const ranked = [...twoAxis].sort((a, b) => (b.final.impact + b.final.financial) - (a.final.impact + a.final.financial));
  const radiusByGroup = {};
  ranked.forEach((p, idx) => {
    radiusByGroup[p.theme_group] = ranked.length > 1
      ? RADIUS_MAX - (RADIUS_MAX - RADIUS_MIN) * (idx / (ranked.length - 1))
      : (RADIUS_MAX + RADIUS_MIN) / 2;
  });

  let pointsHtml = '';
  twoAxis.forEach(p => {
    const cx = _scaleToSvg(p.final.financial);
    const cy = svgH - _scaleToSvg(p.final.impact) + 40; // y축 뒤집기 + 여백보정
    const q = quadrantOf(p.final.financial, p.final.impact, thImpact, thFinancial);
    const meta = QUADRANT_META[q];
    const dash = p.is_manually_adjusted ? 'stroke-dasharray="3,2"' : '';
    const r = radiusByGroup[p.theme_group] || 11;

    // ② 신뢰구간(표본 불확실성) — 응답 표본이 작을수록 더 크고 흐린 바깥 원으로 표시
    let confRingSvg = '';
    const conf = confidence && confidence[p.theme_group];
    if (conf && (conf.impact_margin != null || conf.financial_margin != null)) {
      const marginAvg = ((conf.impact_margin || 0) + (conf.financial_margin || 0)) / (conf.impact_margin != null && conf.financial_margin != null ? 2 : 1);
      const ringR = r + Math.min(marginAvg * pxPerUnit, 60);
      confRingSvg = `<circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="${meta.color}" stroke-width="1" stroke-dasharray="2,3" opacity="0.4"/>`;
    }

    pointsHtml += `
      <g class="mx-point" data-group="${p.theme_group}" style="cursor:pointer;">
        ${confRingSvg}
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="${meta.color}" fill-opacity="0.78" stroke="${meta.color}" stroke-width="2" ${dash}/>
        <text x="${cx}" y="${cy - r - 5}" font-size="10.5" text-anchor="middle" fill="#1c2430">${p.theme_name}${p.is_manually_adjusted ? ' ✏️' : ''}</text>
      </g>`;
  });

  const svg = `
    <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto;display:block;">
      <rect x="60" y="40" width="${midX - 60}" height="${midY - 40}" fill="${QUADRANT_META.IMPACT_ONLY.bg}" opacity="0.5"/>
      <rect x="${midX}" y="40" width="${580 - midX}" height="${midY - 40}" fill="${QUADRANT_META.DOUBLE_MATERIAL.bg}" opacity="0.5"/>
      <rect x="60" y="${midY}" width="${midX - 60}" height="${420 - midY}" fill="${QUADRANT_META.NOT_MATERIAL.bg}" opacity="0.5"/>
      <rect x="${midX}" y="${midY}" width="${580 - midX}" height="${420 - midY}" fill="${QUADRANT_META.FINANCIAL_ONLY.bg}" opacity="0.5"/>

      <line x1="60" y1="40" x2="60" y2="420" stroke="#c7ccd4" stroke-width="1.5"/>
      <line x1="60" y1="420" x2="580" y2="420" stroke="#c7ccd4" stroke-width="1.5"/>
      <line x1="${midX}" y1="40" x2="${midX}" y2="420" stroke="#c7ccd4" stroke-width="1.5" stroke-dasharray="4,3"/>
      <line x1="60" y1="${midY}" x2="580" y2="${midY}" stroke="#c7ccd4" stroke-width="1.5" stroke-dasharray="4,3"/>

      <text x="65" y="55" font-size="11.5" fill="${QUADRANT_META.IMPACT_ONLY.color}" font-weight="700">${QUADRANT_META.IMPACT_ONLY.label}</text>
      <text x="575" y="55" font-size="11.5" fill="${QUADRANT_META.DOUBLE_MATERIAL.color}" font-weight="700" text-anchor="end">${QUADRANT_META.DOUBLE_MATERIAL.label}</text>
      <text x="65" y="415" font-size="11.5" fill="${QUADRANT_META.NOT_MATERIAL.color}" font-weight="700">${QUADRANT_META.NOT_MATERIAL.label}</text>
      <text x="575" y="415" font-size="11.5" fill="${QUADRANT_META.FINANCIAL_ONLY.color}" font-weight="700" text-anchor="end">${QUADRANT_META.FINANCIAL_ONLY.label}</text>

      <text x="320" y="440" font-size="11" fill="#5b6472" text-anchor="middle">재무중대성(평균) → 임계값 ${thFinancial}</text>
      <text x="25" y="230" font-size="11" fill="#5b6472" text-anchor="middle" transform="rotate(-90 25 230)">영향중대성(평균) → 임계값 ${thImpact}</text>

      ${pointsHtml}
    </svg>`;

  const singleHtml = singleAxis.length ? `
    <div class="single-axis-box">
      <div class="single-axis-title">단일축 이슈 (영향 또는 재무 중 한쪽 응답만 존재 — 매트릭스에는 표시되지 않음)</div>
      ${singleAxis.map(p => `
        <div class="single-axis-row">
          <span>${p.theme_name}</span>
          <span class="mini">${p.has_impact_axis ? `영향평균 ${p.final.impact ?? '-'}` : `재무평균 ${p.final.financial ?? '-'}`}</span>
        </div>`).join('')}
    </div>` : '';

  container.innerHTML = `
    <div class="legend">
      <span><span class="dot" style="background:${QUADRANT_META.DOUBLE_MATERIAL.color}"></span>이중 중대</span>
      <span><span class="dot" style="background:${QUADRANT_META.IMPACT_ONLY.color}"></span>영향중대성만</span>
      <span><span class="dot" style="background:${QUADRANT_META.FINANCIAL_ONLY.color}"></span>재무중대성만</span>
      <span><span class="dot" style="background:${QUADRANT_META.NOT_MATERIAL.color}"></span>비중대</span>
      <span style="margin-left:auto;">┄ 점선 = 수동조정됨 · ✏️ = 조정 표시 · 원 크기 = 중대성 순위(클수록 상위) · 흐린 점선원 = 표본 신뢰구간(작을수록 표본 큼)</span>
    </div>
    <div class="chart-wrap">${svg}</div>
    ${singleHtml}
  `;

  container.querySelectorAll('.mx-point').forEach(el => {
    el.addEventListener('click', () => onPointClick(el.dataset.group));
  });
}

const ESG_PILLAR_LABEL = { E: '환경', S: '사회', G: '지배구조' };

// 타사 보고서(이미지 2/4) 스타일의 중대이슈 결과표: 순위/분야/중대이슈/Financial/Impact/GRI/전년비교
function renderMaterialityTable(container, points, prevYearMaterialGroups) {
  const twoAxis = points.filter(p => p.has_impact_axis && p.has_financial_axis);
  const thImpact = twoAxis[0]?.impact_threshold ?? 3;
  const thFinancial = twoAxis[0]?.financial_threshold ?? 3;

  const ranked = twoAxis
    .map(p => ({ ...p, quadrant: quadrantOf(p.final.financial, p.final.impact, thImpact, thFinancial) }))
    .filter(p => p.quadrant === 'DOUBLE_MATERIAL')
    .sort((a, b) => (b.final.impact + b.final.financial) - (a.final.impact + a.final.financial));

  if (ranked.length === 0) {
    container.innerHTML = `<div class="mini">현재 임계값 기준으로 이중 중대 이슈가 없습니다.</div>`;
    return;
  }

  container.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;">
      <thead>
        <tr style="border-bottom:2px solid #e2e6eb;">
          <th style="text-align:left;padding:6px;">순위</th>
          <th style="text-align:left;padding:6px;">분야</th>
          <th style="text-align:left;padding:6px;">중대이슈</th>
          <th style="text-align:left;padding:6px;">Financial<br>Materiality</th>
          <th style="text-align:left;padding:6px;">Impact<br>Materiality</th>
          <th style="text-align:left;padding:6px;">GRI</th>
          <th style="text-align:left;padding:6px;">비교</th>
        </tr>
      </thead>
      <tbody>
        ${ranked.map((p, i) => {
          const isNew = prevYearMaterialGroups && !prevYearMaterialGroups.includes(p.theme_group);
          return `
          <tr style="border-bottom:1px solid #f0f2f4;">
            <td style="padding:6px;">${i + 1}</td>
            <td style="padding:6px;">${ESG_PILLAR_LABEL[p.esg_pillar] || '-'}</td>
            <td style="padding:6px;font-weight:700;">${p.theme_name}${p.is_manually_adjusted ? ' ✏️' : ''}</td>
            <td style="padding:6px;">${levelOf(p.final.financial)}</td>
            <td style="padding:6px;">${levelOf(p.final.impact)}</td>
            <td style="padding:6px;">${p.gri_code || '-'}</td>
            <td style="padding:6px;">${prevYearMaterialGroups ? (isNew ? '<span class="dim-badge" style="background:#eaf1fe;color:#2f6fed;">New</span>' : '<span class="dim-badge" style="background:#eef0f2;color:#6b7480;">Existing</span>') : '-'}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}
