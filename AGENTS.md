# Smart ESG 프로젝트 규칙

## 버전 규칙
- `store.js`의 `APP_VERSION`이 유일한 진실 공급원
- 버전 표시는 `app.js` `init()`에서만

## 데이터 계층
- localStorage + Supabase 하이브리드
- Supabase merge: `{ ...remote, ...local }` (로컬 우선)

## 코드 컨벤션
- 카멜케이스
- 주석 없음 (꼭 필요한 경우만)
