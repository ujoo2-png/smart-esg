# Smart ESG

지속가능경영보고서(ESG) 작성 · 평가 · 공시를 지원하는 웹 애플리케이션입니다.

- 버전: **v2.2.0** (BUILD 63)
- 데이터: `localStorage`(원본) + Supabase(미러 동기화)
- 별도 빌드 도구 없이 브라우저에서 바로 실행되는 정적 앱

---

## 주요 기능

- **지표 관리** — EcoVadis / KSSB(제1·2호) / KCGS / NICE / K-ESG 기관별 지표, 중요성(비핵심) 토글
- **평가** — P-A-R 필러 가중치 점수 산정, 평가 이력, 승인 워크플로우
- **증빙 관리** — 업로드(5MB)·태깅·상태·만료일·민감정보, 증빙-문장 강제 연결
- **온실가스** — Scope 1/2(Location·Market-based)/3 산정, IPCC·KEPCO 계수
- **AI 보고서** — 초안 생성 2단계 파이프라인, 마스킹 적용, 생성 이력 검토
- **보고서 편집기** — HTML 생성·인쇄·다운로드, 참고자료 대비 진행방향 피드백
- **보고서 작성기** — 기존 자료(docx/pptx/pdf) 불러오기·항목 자동 분할, 참고자료 기반 AI 다듬기, 버전 관리 + PPTX 생성
- **프로젝트 관리(WBS)** — 대/중/소 3단계 계층, 계획/실적 일정, 단순 완료율 진도율·간트·캘린더·타임라인
- **대시보드** — 총점/필러/증빙/AI/GHG/협력사/예산/Scope 분포 등 13종 카드
- **협력사** — VSME 자가진단, ESG 가중치 스코어링, 리스크 등급
- **공시·모니터링** — 평가기관 자동 제출(CSV/XML/JSON/TXT), 업종 벤치마크, AI 리스크 예측
- **보증·연동** — ISSA 5000 보증 워크플로우, ERP/계량 시스템 API 연동, 참고자료 라이브러리

---

## 디렉터리 구성

| 영역 | 파일 |
|------|------|
| 데이터 레이어 | `store.js`, `supabase.js`, `migration.sql` |
| 도메인 로직 | `indicator.js`, `evidence.js`, `ghg.js`, `ai.js`, `report.js`, `gri.js`, `risk.js`, `monitor.js`, `issa.js`, `submit.js`, `supplier.js`, `supplierRisk.js`, `api-integration.js`, `reference.js` |
| UI | `app.js`, `dashboard.js`, `components.js`, `index.html`, `style.css` |
| 인증 | `auth.js` |
| 스토리지/변환 | `storage-adapter.js`, `mdconvert.js` |
| 서버리스 | `supabase/functions/` (Edge Functions: `sign-upload`, `sign-download`, `remove-object`, `convert`) |
| 문서 | `개발계획서.md`, `진행방향.md` |

---

## 시작하기

1. Supabase 프로젝트를 준비하고 `migration.sql`을 SQL Editor에서 실행합니다.
   - 미러 모드 스키마(`id` TEXT, 제약/트리거 없음, RLS 비활성)입니다.
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
