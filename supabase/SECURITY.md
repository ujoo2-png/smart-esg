# 보안 운용 가이드

Smart ESG는 빌드 도구 없는 정적 앱이며, 데이터는 `localStorage`(원본)와 Supabase(미러)에 저장됩니다.
Supabase `anon` 키는 브라우저 번들(`supabase.js`)에 그대로 포함되므로 **공개 정보**로 취급해야 합니다.
아래 항목은 anon 키가 유출되어도 데이터가 지켜지도록 만드는 최소 조건입니다.

---

## 1. 지금 바로 확인할 것 (5분)

| 점검 | 방법 | 기대 결과 |
|---|---|---|
| DB가 공개로 쓰이지 않는지 | 앱 우측 상단 Supabase 상태 배지 | `보안 경고`가 아니어야 함 |
| 비밀번호 해시 노출 | 아래 curl 실행 | 빈 배열 `[]` |
| Storage 정책 | Supabase → Storage → Policies | `anon` 롤 정책이 없어야 함 |
| Edge Function CORS | `ALLOWED_ORIGINS` 환경변수 설정 | 배포 도메인만 허용 |

```bash
# anon 키로 tb_user의 비밀번호 컬럼을 읽을 수 있는지 확인
curl -s "https://<PROJECT_REF>.supabase.co/rest/v1/tb_user?select=username,password&limit=3" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
# → [] 이면 정상. 행이 나오면 즉시 2번 항목 진행.
```

---

## 2. DB 접근 통제 (RLS)

`supabase/migration-security.sql`은 **모든 `tb_*` 테이블에 RLS를 켜고 `anon` 권한을 회수**합니다.
다만 현재 앱은 클라이언트 로그인 + anon 키 직접 접속 구조라서, 이 파일을 지금 실행하면 DB 동기화가 멈춥니다.

적용 전에 반드시 다음 3단계를 먼저 끝내야 합니다.

1. **Supabase Auth 로그인으로 전환** — `auth.js`의 `signInWithPassword`가 실제 세션을 만들도록 이메일 확인(Confirm email) 정책을 정리
2. **클라이언트 세션 토큰 사용** — `supabase.createClient`가 로그인 세션을 유지하도록 변경 (anon 키는 apikey로만, Authorization은 세션 토큰)
3. **`tb_user.password` 동기화 중단** — 비밀번호 검증은 Auth가 담당하고, `tb_user`에는 프로필만 저장

3단계가 끝나면 `migration-security.sql`을 실행합니다. 즉시 되돌리는 SQL은 파일 하단에 있습니다.

> RLS를 켜지 못하는 상황이라면, 최소한 앱을 **공개 인터넷에 노출하지 말고** 사내망/SSO 뒤에 두세요.
> anon 키를 아는 사람은 DB 전체를 읽고 쓸 수 있습니다.

---

## 3. Storage

`supabase/storage-policies.sql`을 실행하면 `authenticated` 롤만 접근할 수 있고,
앱이 실제로 생성하는 경로(`회사ID/연도/문서ID/파일명`)만 통과합니다.

- 버킷은 반드시 **비공개(public=false)**
- `anon` 정책(`references_all`)은 남겨두지 마세요

---

## 4. Edge Functions

`supabase/functions/`의 서명·변환 함수는 다음을 강제합니다.

- `path`는 `keyguard.js`의 허용 패턴만 통과 (상위 이동 `..`, 절대 경로, 인코딩 문자 차단)
- `role=anon` 토큰 거부 (게이트웨이의 `verify_jwt=true`는 서명만 확인하므로 별도 검사)
- `remove-object`는 로그인 사용자 전용, `_healthcheck/` 삭제 금지

배포 시 환경변수:

| 변수 | 설명 |
|---|---|
| `ALLOWED_ORIGINS` | 쉼표 구분 허용 출처. 미설정 시 `*` (개발용) |
| `STORAGE_ALLOW_ANON` | `true`일 때만 anon 서명 허용. **운영에서는 설정 금지** |

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxx ALLOWED_ORIGINS=https://esg.example.com ./deploy-convert.sh
# sign-upload / sign-download / remove-object 도 동일하게 배포
```

---

## 5. 계정·인증

- 비밀번호는 **PBKDF2-SHA256(210,000회, 사용자별 salt)** 로 저장됩니다.
  기존 무염 SHA-256 해시는 로그인 성공 시 자동으로 새 형식으로 갱신됩니다.
- 기본 관리자 계정(`admin` / `admin1234`)은 제거되었습니다.
  관리자가 한 명도 없으면 앱이 **최초 관리자 설정 화면**을 띄웁니다.
- 신규 가입 계정은 `status=pending`이며, 관리자 승인 전에는 로그인할 수 없습니다.
- 로그인 실패 5회 시 60초 잠금이 적용됩니다(클라이언트 방어).

> 클라이언트 인증은 개발자 도구로 우회될 수 있습니다.
> 실사용 환경에서는 반드시 Supabase Auth(서버 검증)로 이전하세요.
