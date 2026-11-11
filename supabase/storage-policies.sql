-- Smart ESG — Supabase Storage 버킷 정책 (하드닝)
-- 적용 위치: Supabase 대시보드 → SQL Editor
--
-- 배경
--   기존 정책("references_all")은 anon 롤에 버킷 전체 읽기/쓰기/삭제를 허용했다.
--   anon 키는 브라우저 번들에 그대로 노출되므로, 사실상 누구나 모든 파일을
--   내려받거나 지울 수 있는 상태였다.
--
-- 이 파일은 로그인(auth) 사용자만 접근하도록 제한한다.
-- 앱이 실제로 만드는 경로 형태(회사ID/연도/문서ID/파일명)만 통과시킨다.

insert into storage.buckets (id, name, public)
values ('references', 'references', false)
on conflict (id) do update set public = false;

drop policy if exists "references_all" on storage.objects;
drop policy if exists "references_read_authenticated" on storage.objects;
drop policy if exists "references_write_authenticated" on storage.objects;

create policy "references_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'references');

create policy "references_write_authenticated" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'references'
    and array_length(storage.foldername(name), 1) between 3 and 4
    and (storage.foldername(name))[1] ~ '^[A-Za-z0-9_-]{1,64}$'
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^[A-Za-z0-9_-]{1,64}$'
  )
  with check (
    bucket_id = 'references'
    and array_length(storage.foldername(name), 1) between 3 and 4
    and (storage.foldername(name))[1] ~ '^[A-Za-z0-9_-]{1,64}$'
    and (storage.foldername(name))[2] ~ '^[0-9]{4}$'
    and (storage.foldername(name))[3] ~ '^[A-Za-z0-9_-]{1,64}$'
  );

-- 검증: anon 키로 버킷 목록이 비어 있어야 한다.
--   select name from storage.objects where bucket_id = 'references' limit 5;
