# Smart ESG

지속가능경영보고서(ESG) 작성 · 평가 · 공시를 지원하는 웹 애플리케이션입니다.

- 버전: **v2.10.0** (BUILD 80)
- 데이터: `localStorage`(원본) + Supabase(미러 동기화)
- 별도 빌드 도구 없이 브라우저에서 바로 실행되는 정적 앱

---

## 주요 기능

- **이중중대성평가(DMA)** — ESRS 11개 주제 기반 IRO(영향·리스크·기회) 도출, 이해관계자 참여, 영향·재무 2축 매트릭스, 임계값 기반 중대성 판정, KSSB 지표 연계, CSV 내보내기
- **중대성평가 앱 연계** — 별도「중대성평가 모듈(v1.7.0)」에서 실시한 이해관계자 설문 결과를 표준 계약(`materiality-result.json`, contract v1.0)으로 가져와 이슈·점수·ESRS 토픽·구분(이중/영향/재무)·신뢰도·표본수를 DMA로 이관. 결과·연계 탭에서 구분(사분면) 확인, 확정(FINALIZED) 평가는 수정 잠금, 양방향 번들 내보내기 지원
- **중대성평가 모듈 임베드(⑥ 전체 앱)** — 이중중대성평가 화면의 ⑥ 전체 앱 탭에 별도「중대성평가 모듈(v1.7.0)」을 iframe(`materiality-app/`)으로 그대로 임베드. 설문 문항 구성·실사 응답·결과 분석·사사분면 매트릭스(수동조정)·가중치/임계값 설정을 본편 안에서 그대로 사용. `postMessage` 브리지(`js/smart-esg-bridge.js`)로 분석 결과를 즉시 가져오기(🔄 설문·분석 결과 가져오기)·파일 가져오기·새 창 열기 지원
- **DMA 동기화** — 이중중대성평가(프로젝트·이해관계자·IRO)를 Supabase 미러에 동기화(로컬→원격 push + 원격→로컬 pull). `tb_dma_project`/`tb_dma_stakeholder`/`tb_dma_iro` 테이블 필요(`migration-dma.sql` 증분 적용 또는 `migration.sql` 전체)
- **프로세스 워크플로우** — ① 기준·맥락 → ② 데이터 수집 → ③ 이중중대성평가 → ④ 지표·증빙 → ⑤ 초안 작성 → ⑥ 검증·보증 → ⑦ 제출·공시 7단계. 상단 프로세스 바(현재 위치·진행률 자동 표시) + 전체 구조도 페이지
- **보증(AA1000AS v3 / ISSA 5000)** — 프레임워크 선택, AA1000AS 4대 원칙(포용성·중대성·대응성·영향) 자기평가, Type 1/2·Moderate/High, 적합성 기준 선택, 내재적 한계·후속 사건, 경영진 보고서 초안, 보증 증빙 패키지 원클릭 내보내기
- **다음 할 일 & 데이터 품질** — 대시보드에서 미완료 프로세스 단계와 데이터 품질 이슈(배출량 미산정·실적값 미입력·지표 연계 누락·중대성 대상 미선정·표본 신뢰도 낮음·응답 편차 큼·중대 이슈 근거 미작성·확정 가능 중대성 프로젝트·고위험 협력사·미해결 지적·빈 문서)를 코드 기반으로 자동 점검·안내
- **지표 관리** — EcoVadis / KSSB(제1·2호) / KCGS / NICE / K-ESG 기관별 지표, 중요성(비핵심) 토글
- **평가** — P-A-R 필러 가중치 점수 산정, 평가 이력, 승인 워크플로우
- **증빙 관리** — 업로드(5MB)·태깅·상태·만료일·민감정보, 증빙-문장 강제 연결
- **온실가스** — Scope 1/2(Location·Market-based)/3 산정, IPCC·KEPCO 계수
- **AI 보고서** — 초안 생성 2단계 파이프라인, 마스킹 적용, 생성 이력 검토
- **보고서 편집기** — HTML 생성·인쇄·다운로드, 참고자료 대비 진행방향 피드백
- **보고서 작성기** — 기존 자료(docx/pptx/pdf) 불러오기·항목 자동 분할, **좌측 실시간 PPT 미리보기**(보고서를 표지·목차·섹션 슬라이드로 즉시 렌더, 페이지 이동 시 편집 섹션 연동) + 우측 섹션별 편집·원클릭 AI(다듬기·이어쓰기·선택문장·GRI/ISSB·컴플라이언스), **전체 등록 참고자료 RAG 근거 검색**(문서 지정 불필요), 섹션 순서 이동·이전/다음 섹션 이동, 문체/분량/형식 프리셋, 자동 임시저장(블러·언로드 시 즉시 저장), 버전 비교·되돌리기, AI 어시스턴트, PPTX 생성
- **차세대 문서 편집기** — 블록 기반 리치 에디터(`editor.js`)를 보고서 작성기 본문과 참고자료 뷰어에 공용 적용. 제목/본문/목록/인용/코드/표/구분선 블록 추가·삭제·드래그 정렬, `/` 슬래시 삽입 메뉴, 도구상자 서식(굵게·기울임·밑줄·취소선·링크·서식 지우기), 글자·단어 수·읽는 시간 통계, 찾기·바꾸기(일괄 치환), 블록 단위 AI 다듬기
- **AI 연결 설정** — 제공자(open 내부 게이트웨이/OpenAI/Anthropic/**Gemini**/**Groq**/Ollama/사용자 지정)·엔드포인트·모델·API 키·온도·최대 토큰을 설정 화면에서 관리, 연결 테스트 지원. **폴백 체인**(예: Groq → Gemini → Ollama)으로 앞선 제공자 장애 시 자동 재시도하여 무료 조합으로도 가용성 확보. 엔드포인트 장애 시 점검류는 키워드 기반 로컬 점검으로 자동 대체(더미 데이터 반환 제거)
- **프로젝트 관리(WBS)** — 대/중/소 3단계 계층, 계획/실적 일정, 단순 완료율 진도율·간트·캘린더·타임라인
- **대시보드** — 총점/필러/증빙/AI/GHG/협력사/예산/Scope 분포 등 13종 카드
- **협력사** — VSME 자가진단, ESG 가중치 스코어링, 리스크 등급, 미진단 협력사 자가진단 요청/리마인더 초안 생성
- **공시·모니터링** — 평가기관 자동 제출(CSV/XML/JSON/TXT), 업종 벤치마크, AI 리스크 예측
- **보증·연동** — ISSA 5000 보증 워크플로우, ERP/계량 시스템 API 연동, 참고자료 라이브러리

---

## 디렉터리 구성

| 영역 | 파일 |
|------|------|
| 데이터 레이어 | `store.js`, `supabase.js`, `migration.sql`, `migration-dma.sql` |
| 도메인 로직 | `indicator.js`, `evidence.js`, `ghg.js`, `ai.js`, `report.js`, `gri.js`, `risk.js`, `monitor.js`, `issa.js`, `submit.js`, `supplier.js`, `supplierRisk.js`, `api-integration.js`, `reference.js` |
| UI | `app.js`, `dashboard.js`, `components.js`, `editor.js`(블록 리치 에디터), `index.html`, `style.css` |
| 인증 | `auth.js` |
| 스토리지/변환 | `storage-adapter.js`, `mdconvert.js` |
| 임베드 모듈 | `materiality-app/` (중대성평가 모듈 v1.7.0 standalone + `js/smart-esg-bridge.js`) |
| 서버리스 | `supabase/functions/` (Edge Functions: `sign-upload`, `sign-download`, `remove-object`, `convert`) |
| 문서 | `개발계획서.md`, `진행방향.md` |

---

## 시작하기

1. Supabase 프로젝트를 준비하고 `migration.sql`을 SQL Editor에서 실행합니다.
   - 미러 모드 스키마(`id` TEXT, 제약/트리거 없음, RLS 비활성)입니다.
   - 기존 DB를 리셋하지 않고 DMA 테이블만 추가하려면 `migration-dma.sql`을 대신 실행합니다.
2. `supabase.js`의 `SUPABASE_CONFIG`에 본인 프로젝트의 `url` / `anonKey` / `jwtKey`를 입력합니다.
3. `index.html`을 브라우저로 열거나 정적 호스팅에 배포합니다.

> `supabase.js`의 키를 채우지 않으면 앱은 로컬(`localStorage`) 모드로만 동작합니다.

---

## 기술 스택

- 프런트엔드: 순수 HTML / CSS / JavaScript (프레임워크·번들러 없음)
- 백엔드: Supabase (Postgres + PostgREST + Edge Functions, TypeScript/Deno)

---

## 라이선스

미정.
