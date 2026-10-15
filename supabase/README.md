# Supabase Edge Functions — 참고자료 저장소/변환

보고서 작성 지원 기능의 파일 저장·변환 백엔드입니다. 브라우저는 아래 흐름으로 동작합니다.

```
업로드: 브라우저 → sign-upload → presigned URL → 저장소에 직접 PUT
변환:   브라우저 → convert → (서버가 원본 다운로드 → Markdown) → 응답
열람:   브라우저 → sign-download → presigned URL → GET
삭제:   브라우저 → remove-object → 저장소에서 삭제
```

## 함수

| 함수 | 입력 | 출력 |
|------|------|------|
| `sign-upload` | `{ path }` | `{ uploadUrl, method, bucket }` |
| `sign-download` | `{ path, expires? }` | `{ url }` |
| `remove-object` | `{ path }` | `{ ok }` |
| `convert` | `POST { path, mime, docType }` | `{ markdown, page_count, engine, scanned }` |
| `convert` (헬스체크) | `GET` | `{ ok: true, service, engine, backend, bucket }` |

`convert`는 `verify_jwt`가 켜져 있어 브라우저가 `Authorization: Bearer <anonKey or 세션토큰>`을 보냅니다. GET 헬스체크도 동일 헤더가 필요하며, 앱의 "🔌 변환 서버 테스트" 버튼이 이를 호출합니다. 요청 본문은 최대 25MB(`MAX_BYTES`)입니다.

## 저장소 백엔드

`STORAGE_BACKEND` 환경변수로 선택합니다.

- `s3` (기본): S3 호환. **Cloudflare R2 권장**(egress 무료, 10GB 무료).
- `supabase`: Supabase Storage(1GB 무료) — 소규모·빠른 시작용.

### 공통

| 변수 | 설명 |
|------|------|
| `STORAGE_BACKEND` | `s3` 또는 `supabase` (기본 `s3`) |
| `STORAGE_BUCKET` | 버킷 이름 (기본 `references`) |

### S3 / R2 (`STORAGE_BACKEND=s3`)

| 변수 | 예시 |
|------|------|
| `S3_ENDPOINT` | `https://<accountid>.r2.cloudflarestorage.com` (R2) / `https://s3.ap-northeast-2.amazonaws.com` |
| `S3_REGION` | R2: `auto`, AWS: `ap-northeast-2` |
| `S3_BUCKET` | `references` |
| `S3_ACCESS_KEY_ID` | R2/AWS 액세스 키 |
| `S3_SECRET_ACCESS_KEY` | 시크릿 키 |
| `S3_FORCE_PATH_STYLE` | R2: `true`(기본), AWS: `false` 권장 |

### Supabase Storage (`STORAGE_BACKEND=supabase`)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`가 자동 주입됩니다(Supabase 런타임 기본 제공).

## 배포

> 이 저장소에는 `supabase`/`deno` CLI가 설치되어 있지 않으므로, 아래 명령은 사용자 환경에서 실행합니다.

가장 간단한 방법은 저장소 루트의 배포 스크립트입니다(Docker 불필요, `--use-api` 사용):

```bash
export SUPABASE_ACCESS_TOKEN=<개인 액세스 토큰>
# (선택) export SUPABASE_PROJECT_REF=<PROJECT_REF>   # 기본값: pyesmylwuzaftieqzokn
./deploy-convert.sh
```

또는 수동으로:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy sign-upload
supabase functions deploy sign-download
supabase functions deploy remove-object
supabase functions deploy convert --use-api
```

배포 확인:

```bash
curl -i -H "Authorization: Bearer <ANON_KEY>" \
  https://<PROJECT_REF>.supabase.co/functions/v1/convert
# → 200 {"ok":true,"service":"convert","engine":"...","backend":"...","bucket":"references"}
```

시크릿 등록:

```bash
supabase secrets set STORAGE_BACKEND=s3 STORAGE_BUCKET=references \
  S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com \
  S3_REGION=auto S3_BUCKET=references \
  S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=...
```

## 변환 엔진 (MarkItDown 방식, Deno 재현)

| 형식 | 라이브러리 |
|------|-----------|
| PDF | `unpdf` (pdf.js) — 페이지별 텍스트 |
| DOCX/DOC | `mammoth` — Markdown |
| XLSX/XLS/CSV | `xlsx` (SheetJS) — 시트별 Markdown 표 |
| PPTX/PPT | `fflate` + slide XML 텍스트 추출 |

> 브라우저에서 생성한 경로(`company/year/docId/fileName`)를 그대로 오브젝트 키로 사용하므로, 참고자료 문서는 버킷 내에서 자동 네임스페이스됩니다.
