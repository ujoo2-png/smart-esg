/**
 * seed-data.js
 * 실제 이노디스 6차배포 이슈풀(39개) + 테마그룹 매핑 시드 데이터.
 *
 * ⚠️ theme_group 매핑은 이슈명을 근거로 한 추정안입니다(설계 문서 v2.4 3장 참고).
 *    특히 WATER_WASTE_CHEM / QUALITY / CERT_PROCESS / ETHICS_ESG_FINANCE는
 *    영향/재무 개수가 서로 안 맞아 확인이 필요합니다. 확정되면 이 파일의
 *    theme_group 값만 고치면 전체 화면에 즉시 반영됩니다.
 *
 * 향후 Supabase 연동 시: 이 배열은 tb_issue_pool / tb_issue_theme_group 테이블의
 * 시드 INSERT 문(Smart_ESG_설문지모듈_실데이터반영_v2.4.md 2-1장)과 1:1 대응됩니다.
 */

const THEME_GROUPS = [
  { group_code: 'SAFETY', group_name: '산업안전', esrs_topic_code: 'S1', esg_pillar: 'S', gri_code: 'GRI 403' },
  { group_code: 'SUPPLY_CHAIN', group_name: '공급망', esrs_topic_code: 'S2', esg_pillar: 'S', gri_code: 'GRI 308' },
  { group_code: 'ENERGY_GHG', group_name: '에너지·온실가스', esrs_topic_code: 'E1', esg_pillar: 'E', gri_code: 'GRI 302, 305' },
  { group_code: 'WATER_WASTE_CHEM', group_name: '수자원·폐기물·화학물질', esrs_topic_code: 'E3', esg_pillar: 'E', gri_code: 'GRI 303, 306' },
  { group_code: 'QUALITY', group_name: '제품품질', esrs_topic_code: 'S4', esg_pillar: 'S', gri_code: 'GRI 416' },
  { group_code: 'PRODUCT_SAFETY_DEV', group_name: '제품안전·개발투자', esrs_topic_code: 'S4', esg_pillar: 'S', gri_code: 'GRI 416' },
  { group_code: 'LOCAL_ENV', group_name: '지역환경', esrs_topic_code: 'E2', esg_pillar: 'E', gri_code: 'GRI 304' },
  { group_code: 'CERT_PROCESS', group_name: '인증·공정검증', esrs_topic_code: 'G1', esg_pillar: 'G', gri_code: 'GRI 416' },
  { group_code: 'ETHICS_ESG_FINANCE', group_name: '윤리경영·ESG금융', esrs_topic_code: 'G1', esg_pillar: 'G', gri_code: 'GRI 205, 206' },
  { group_code: 'COMMUNITY', group_name: '지역사회', esrs_topic_code: 'S3', esg_pillar: 'S', gri_code: 'GRI 413' },
  { group_code: 'INFO_SECURITY', group_name: '정보보안', esrs_topic_code: 'G1', esg_pillar: 'G', gri_code: 'GRI 418' },
  { group_code: 'HUMAN_RIGHTS', group_name: '인권', esrs_topic_code: 'S1', esg_pillar: 'S', gri_code: 'GRI 406, 407' },
  { group_code: 'REPUTATION_QUALITY', group_name: '평판·신뢰', esrs_topic_code: 'S4', esg_pillar: 'S', gri_code: 'GRI 416' },
  { group_code: 'CAPABILITY', group_name: '기술경쟁력·국산화', esrs_topic_code: 'G1', esg_pillar: 'G', gri_code: '-' },
];

/**
 * ESRS 1 AR16 토픽 마스터 (설계문서 v2.0 2-1장 그대로).
 * ⚠️ theme_group → esrs_topic_code 매핑도 이슈명 기반 추정입니다(테마그룹 매핑과 마찬가지로
 *    확인 필요). 특히 WATER_WASTE_CHEM(E3 지정)은 오염(E2)·자원순환(E5)과도 겹칩니다.
 * is_default_material=true인 토픽(기후변화)은 감독기관이 "업종 대부분에서 기본적으로 중대함"으로
 * 보므로, 내부 IRO 워크시트에서 이 토픽을 비중대로 판정하려면 사유 입력이 강제됩니다.
 */
const ESRS_TOPICS = [
  { topic_code: 'E1', topic_name: '기후변화', esrs_area: '환경', is_default_material: true },
  { topic_code: 'E2', topic_name: '오염', esrs_area: '환경', is_default_material: false },
  { topic_code: 'E3', topic_name: '수자원 및 해양자원', esrs_area: '환경', is_default_material: false },
  { topic_code: 'E4', topic_name: '생물다양성 및 생태계', esrs_area: '환경', is_default_material: false },
  { topic_code: 'E5', topic_name: '자원사용 및 순환경제', esrs_area: '환경', is_default_material: false },
  { topic_code: 'S1', topic_name: '자사 인력', esrs_area: '사회', is_default_material: false },
  { topic_code: 'S2', topic_name: '가치사슬 근로자', esrs_area: '사회', is_default_material: false },
  { topic_code: 'S3', topic_name: '영향을 받는 지역사회', esrs_area: '사회', is_default_material: false },
  { topic_code: 'S4', topic_name: '소비자 및 최종사용자', esrs_area: '사회', is_default_material: false },
  { topic_code: 'G1', topic_name: '기업행동', esrs_area: '거버넌스', is_default_material: false },
];

// dimension_tag: 'IMPACT' | 'FINANCIAL' | 'OPPORTUNITY'
const ISSUE_POOL = [
  { issue_code: 'ISS-01', issue_name: '산업안전 및 근로자 건강', issue_definition: '공장·공정에서 산업재해, 근로자 건강 문제 발생 가능성이 있는 이슈', dimension_tag: 'IMPACT', question_text: '회사 작업장에서 산업재해나 근로자 건강 문제가 발생할 위험이 얼마나 크다고 보시나요?', theme_group: 'SAFETY' },
  { issue_code: 'ISS-02', issue_name: '협력사 및 공급망의 노동·안전 수준', issue_definition: '협력사 노동환경·안전 수준 부실로 인한 인권·안전 리스크', dimension_tag: 'IMPACT', question_text: '협력사에서 노동환경·안전이 부실하여 근로자 인권·안전을 침해할 위험이 얼마나 크다고 보시나요?', theme_group: 'SUPPLY_CHAIN' },
  { issue_code: 'ISS-03', issue_name: '에너지 사용 및 온실가스 배출', issue_definition: '제품 생산·설비 운영에서 에너지 소비 많은 바람에 환경에 피해를 줄 가능성', dimension_tag: 'IMPACT', question_text: '회사 운영에서 에너지를 많이 쓰고 온실가스를 많이 배출하여 환경에 나쁜 영향을 줄 가능성이 얼마나 크다고 보시나요?', theme_group: 'ENERGY_GHG' },
  { issue_code: 'ISS-04', issue_name: '물 사용량 및 폐수 관리', issue_definition: '물 사용량 과다·폐수 처리 미흡으로 인한 수자원·환경 영향', dimension_tag: 'IMPACT', question_text: '물 사용량이 많거나 폐수가 제대로 처리되지 않아 환경에 피해를 줄 가능성이 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-05', issue_name: '폐기물, 스크랩, 재활용', issue_definition: '불량·폐기물·스크랩 발생으로 인한 자원 낭비·환경 부담', dimension_tag: 'IMPACT', question_text: '폐기물·스크랩이 많아 자원 낭비·환경 부담을 키울 가능성이 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-06', issue_name: '화학물질 및 유해물질 관리', issue_definition: '생산·세정·가공 과정에서 화학물질·유해물질 관리 미흡으로 인한 피해', dimension_tag: 'IMPACT', question_text: '화학물질·유해물질을 잘못 관리해 사람·환경에 피해를 줄 가능성이 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-07', issue_name: '제품 안전성 및 품질 신뢰성', issue_definition: '제품이 고장나거나 품질 떨어져 고객 생산·안전에 피해를 줄 가능성', dimension_tag: 'IMPACT', question_text: '회사 제품이 고장나거나 품질이 떨어져 고객 생산·안전에 피해를 줄 가능성이 얼마나 크다고 보시나요?', theme_group: 'QUALITY' },
  { issue_code: 'ISS-08', issue_name: '고객 공정에서의 제품 사용 중 안전성', issue_definition: '고객 반도체·디스플레이 공정에서 제품 사용 시 안전사고·오염 가능성', dimension_tag: 'IMPACT', question_text: '고객 공정에서 제품이 안전사고·오염을 일으킬 가능성이 얼마나 크다고 보시나요?', theme_group: 'PRODUCT_SAFETY_DEV' },
  { issue_code: 'ISS-09', issue_name: '소음, 악취, 분진 등 지역환경 영향', issue_definition: '소음·악취·분진으로 인한 주변 주민·환경 불편', dimension_tag: 'IMPACT', question_text: '소음·악취·분진 등이 발생해 주변에 불편·피해를 줄 가능성이 얼마나 크다고 보시나요?', theme_group: 'LOCAL_ENV' },
  { issue_code: 'ISS-10', issue_name: '공정 변경 시 환경·안전 검증 수준', issue_definition: '공정 변경 시 환경·안전 검증 부족으로 인한 사고·규제 리스크', dimension_tag: 'IMPACT', question_text: '공정 변경 시 환경·안전을 충분히 검증하지 않아 문제를 일으킬 가능성이 얼마나 크다고 보시나요?', theme_group: 'CERT_PROCESS' },
  { issue_code: 'ISS-11', issue_name: '윤리경영 및 공정거래', issue_definition: '공정하지 못한 거래, 편의 제공, 차별 등 윤리 문제 가능성', dimension_tag: 'IMPACT', question_text: '공정하지 못한 거래나 윤리 문제가 발생할 가능성이 얼마나 크다고 보시나요?', theme_group: 'ETHICS_ESG_FINANCE' },
  { issue_code: 'ISS-12', issue_name: '지역사회 고용 및 지역경제 기여', issue_definition: '지역사회에 일자리·경제적 기여 정도', dimension_tag: 'IMPACT', question_text: '회사가 지역사회에 일자리·경제적 기여를 하는 정도가 얼마나 크다고 보시나요?', theme_group: 'COMMUNITY' },
  { issue_code: 'ISS-13', issue_name: '개인정보 및 정보보안', issue_definition: '개인정보·영업비밀 유출 위험', dimension_tag: 'IMPACT', question_text: '개인정보·영업비밀이 유출될 가능성이 얼마나 크다고 보시나요?', theme_group: 'INFO_SECURITY' },
  { issue_code: 'ISS-14', issue_name: '인권, 차별, 다양성, 괴롭힘 예방', issue_definition: '인권 침해, 차별, 괴롭힘 발생 가능성', dimension_tag: 'IMPACT', question_text: '인권 침해·차별·괴롭힘 등이 발생할 가능성이 얼마나 크다고 보시나요?', theme_group: 'HUMAN_RIGHTS' },
  { issue_code: 'ISS-15', issue_name: '품질사고 시 고객 신뢰 훼손 가능성', issue_definition: '큰 품질 문제가 고객 신뢰에 미치는 영향', dimension_tag: 'IMPACT', question_text: '품질사고로 인해 고객 신뢰가 크게 떨어질 가능성이 얼마나 크다고 보시나요?', theme_group: 'REPUTATION_QUALITY' },

  { issue_code: 'ISS-21', issue_name: '산업재해로 인한 생산중단, 손해배상, 보험료 상승', issue_definition: '산업재해로 인한 생산중단 및 비용 증가', dimension_tag: 'FINANCIAL', question_text: '산업재해로 인해 생산중단·손해배상·보험료 상승 가능성은 얼마나 크다고 보시나요?', theme_group: 'SAFETY' },
  { issue_code: 'ISS-22', issue_name: '고객사 품질 요구 미충족으로 인한 수주 상실', issue_definition: '품질 미달로 인한 수주 상실', dimension_tag: 'FINANCIAL', question_text: '품질 요구 미충족으로 수주를 잃을 가능성이 얼마나 크다고 보시나요?', theme_group: 'QUALITY' },
  { issue_code: 'ISS-23', issue_name: '반도체/디스플레이 고객의 ESG 요구로 인한 거래 조건 변화', issue_definition: '고객 ESG 요구로 인한 거래 조건 변화·불이익', dimension_tag: 'FINANCIAL', question_text: '고객 ESG 요구 강화로 거래 조건이 바뀌거나 불이익을 받을 가능성이 얼마나 크다고 보시나요?', theme_group: 'ETHICS_ESG_FINANCE' },
  { issue_code: 'ISS-24', issue_name: '에너지 비용 상승 및 효율개선 투자 필요', issue_definition: '에너지 비용 상승·개선 투자 필요', dimension_tag: 'FINANCIAL', question_text: '에너지 비용 상승·효율개선 투자 필요성이 얼마나 크다고 보시나요?', theme_group: 'ENERGY_GHG' },
  { issue_code: 'ISS-25', issue_name: '물 사용, 폐기물, 화학물질 규제로 인한 설비 투자 부담', issue_definition: '규제 강화로 인한 설비 투자 부담', dimension_tag: 'FINANCIAL', question_text: '물·폐기물·화학물질 규제 강화로 설비 투자 부담이 커질 가능성이 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-26', issue_name: '소재(PFAS·불소계 등) 규제 변화에 따른 대체 소재 대응 필요', issue_definition: '소재 규제 변화로 인한 대체 소재·투자 필요', dimension_tag: 'FINANCIAL', question_text: '소재 규제 변화로 대체 소재·투자 필요성이 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-27', issue_name: '신제품 개발 및 테스트 설비 투자 필요', issue_definition: '고객 요구 변화로 인한 개발·테스트 투자 필요', dimension_tag: 'FINANCIAL', question_text: '신제품 개발·테스트 설비 투자 필요성이 얼마나 크다고 보시나요?', theme_group: 'PRODUCT_SAFETY_DEV' },
  { issue_code: 'ISS-28', issue_name: '공급망 차질, 협력사 품질 문제, 납기 지연', issue_definition: '공급망·협력사 문제로 인한 운영 차질', dimension_tag: 'FINANCIAL', question_text: '공급망 차질·협력사 품질·납기 문제로 운영 차질을 줄 수 있는 가능성이 얼마나 크다고 보시나요?', theme_group: 'SUPPLY_CHAIN' },
  { issue_code: 'ISS-29', issue_name: '인증 미확보로 인한 고객 승인 지연 또는 상실', issue_definition: '인증 미확보로 인한 승인 지연·상실', dimension_tag: 'FINANCIAL', question_text: '인증 미확보로 고객 승인을 지연하거나 잃을 가능성이 얼마나 크다고 보시나요?', theme_group: 'CERT_PROCESS' },
  { issue_code: 'ISS-30', issue_name: '리콜, 반품, 클레임, A/S 비용 증가', issue_definition: '결함으로 인한 리콜·리턴·비용 증가', dimension_tag: 'FINANCIAL', question_text: '리콜·반품·클레임·A/S 비용 증가 가능성이 얼마나 크다고 보시나요?', theme_group: 'QUALITY' },
  { issue_code: 'ISS-31', issue_name: '자금조달, 은행평가, 투자유치 조건 변화', issue_definition: 'ESG 수준 낮음으로 인한 금융·투자 악영향', dimension_tag: 'FINANCIAL', question_text: 'ESG 수준이 낮아 금융·투자 조건이 부담스럽게 바뀔 가능성은 얼마나 크다고 보시나요?', theme_group: 'ETHICS_ESG_FINANCE' },
  { issue_code: 'ISS-32', issue_name: '고객의 국산화 요구, 기술내재화 요구에 대한 대응 능력', issue_definition: '국산화·기술내재화 요구에 대한 대응 능력', dimension_tag: 'FINANCIAL', question_text: '국산화·기술내재화 요구에 대응 가능한 부담이 얼마나 크다고 보시나요?', theme_group: 'CAPABILITY' },
  { issue_code: 'ISS-33', issue_name: '수출, 해외 고객 대응 시 규격/인증 요건 충족 필요', issue_definition: '해외 규격·인증 충족 부담', dimension_tag: 'FINANCIAL', question_text: '해외 고객·수출에서 규격·인증 요건 충족 부담이 얼마나 크다고 보시나요?', theme_group: 'CERT_PROCESS' },
  { issue_code: 'ISS-34', issue_name: '데이터 유출, 기술유출, 영업비밀 유출 위험', issue_definition: '정보 유출로 인한 경쟁력 저하', dimension_tag: 'FINANCIAL', question_text: '데이터·기술·영업비밀 유출로 경쟁력이 떨어질 가능성이 얼마나 크다고 보시나요?', theme_group: 'INFO_SECURITY' },
  { issue_code: 'ISS-35', issue_name: '평판 악화로 인한 매출 감소 및 신규고객 확보 저하', issue_definition: '평판 악화로 인한 매출·수주 감소', dimension_tag: 'FINANCIAL', question_text: '평판 악화로 매출 감소·신규고객 확보 저하 가능성이 얼마나 크다고 보시나요?', theme_group: 'REPUTATION_QUALITY' },

  { issue_code: 'ISS-41', issue_name: '에너지 효율 향상', issue_definition: '에너지 효율 개선이 회사에 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '에너지 효율이 향상될 경우 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'ENERGY_GHG' },
  { issue_code: 'ISS-42', issue_name: '친환경/저배출 소재 적용', issue_definition: '친환경 소재가 회사에 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '친환경·저배출 소재 적용이 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-43', issue_name: '불소계 소재 대체 대응', issue_definition: '불소계 소재 대체가 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '불소계 소재 대체 대응이 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'WATER_WASTE_CHEM' },
  { issue_code: 'ISS-44', issue_name: '고객 맞춤형 설계 역량 강화', issue_definition: '맞춤형 설계가 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '고객 맞춤형 설계 역량 강화가 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'PRODUCT_SAFETY_DEV' },
  { issue_code: 'ISS-45', issue_name: '테스트/검증 인프라 고도화', issue_definition: '테스트·검증 인프라가 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '테스트·검증 인프라 고도화가 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'CERT_PROCESS' },
  { issue_code: 'ISS-46', issue_name: '국산화 및 공급망 안정성 강화', issue_definition: '국산화·공급망 안정성이 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '국산화 및 공급망 안정성 강화가 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'SUPPLY_CHAIN' },
  { issue_code: 'ISS-47', issue_name: '품질 데이터 및 추적관리 강화', issue_definition: '품질 데이터·트레이스빌리티 강화가 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: '품질 데이터·추적관리 강화가 회사에 제공하는 기회가 얼마나 크다고 보시나요?', theme_group: 'QUALITY' },
  { issue_code: 'ISS-48', issue_name: 'ESG 대응을 통한 수주 경쟁력 확보', issue_definition: 'ESG 대응이 수주·경쟁력에 제공하는 기회', dimension_tag: 'OPPORTUNITY', question_text: 'ESG 대응으로 수주 경쟁력을 확보할 수 있는 기회가 얼마나 크다고 보시나요?', theme_group: 'ETHICS_ESG_FINANCE' },
];

// theme_group → E/S/G 대분류 조회 헬퍼 (설문지 작성 화면의 균등선택 로직에서 사용)
function esgPillarOfThemeGroup(themeGroup) {
  const g = THEME_GROUPS.find(x => x.group_code === themeGroup);
  return g ? g.esg_pillar : null;
}
function esgPillarOfIssue(issueCode) {
  const issue = ISSUE_POOL.find(i => i.issue_code === issueCode);
  return issue ? esgPillarOfThemeGroup(issue.theme_group) : null;
}

// 문항수 프리셋(v2.4 5장) — 프리셋 클릭 시 우선 선택되는 issue_code 목록
// 원칙: 테마그룹당 최소 1개는 남기고, 짝이 있는 이슈(영향+재무 세트) 우선
const PRESET_16 = ['ISS-01','ISS-21','ISS-03','ISS-24','ISS-04','ISS-25','ISS-06','ISS-26',
                    'ISS-07','ISS-22','ISS-13','ISS-34','ISS-15','ISS-35','ISS-11','ISS-23'];
const PRESET_24 = [...PRESET_16, 'ISS-02','ISS-28','ISS-08','ISS-27','ISS-10','ISS-29',
                    'ISS-09','ISS-12','ISS-14','ISS-32','ISS-41','ISS-48'];
