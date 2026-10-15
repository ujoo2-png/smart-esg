#!/usr/bin/env bash
set -euo pipefail

# convert Edge Function 배포 (Docker 불필요 — --use-api)
# 사용법:
#   SUPABASE_ACCESS_TOKEN=sbp_xxx ./deploy-convert.sh
#   SUPABASE_ACCESS_TOKEN=sbp_xxx SUPABASE_ANON_KEY=<anon JWT> ./deploy-convert.sh   # 헬스체크용
# 토큰 발급: https://supabase.com/dashboard/account/tokens

PROJECT_REF="${SUPABASE_PROJECT_REF:-pyesmylwuzaftieqzokn}"

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "오류: SUPABASE_ACCESS_TOKEN 환경변수가 필요합니다." >&2
  echo "  SUPABASE_ACCESS_TOKEN=sbp_xxx ./deploy-convert.sh" >&2
  exit 1
fi

echo "→ 프로젝트 ${PROJECT_REF} 에 convert 함수를 배포합니다..."
npx --yes supabase@latest functions deploy convert \
  --project-ref "${PROJECT_REF}" \
  --use-api

echo "→ 헬스체크 확인: (verify_jwt=true → anon JWT 필요)"
curl -fsS "https://${PROJECT_REF}.supabase.co/functions/v1/convert" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY:-anon}" || \
  echo "  (401이면 SUPABASE_ANON_KEY를 지정하세요)"
echo
echo "완료되었습니다. 앱의 참고자료 화면에서 '변환 서버 연결 테스트'로 상태를 확인하세요."
