-- Smart ESG — DB 접근 통제(RLS) 초안
-- =============================================================
-- ⚠ 이 파일은 "그대로 실행"하기 전에 반드시 아래 조건을 확인하세요.
--
-- 현재 앱은 브라우저에서 anon 키로 PostgREST에 직접 붙고,
-- 로그인은 클라이언트(store.js/auth.js)에서 처리한다.
-- 따라서 RLS를 켜고 anon 권한을 회수하면 앱의 DB 동기화가 즉시 멈춘다.
--
-- 적용 순서(권장)
--   1) Supabase Auth 기반 로그인으로 전환(이메일/비밀번호)
--   2) supabase.js의 createClient가 사용자 세션 토큰을 쓰도록 변경
--   3) tb_user.password 동기화 중단 (비밀번호는 Auth가 관리)
--   4) 이 파일 실행
--
-- 이 파일은 3단계까지 끝난 환경에서만 실행하세요.
-- =============================================================

begin;

-- 1) 모든 tb_* 테이블에 RLS 활성화
do $$
declare
  t record;
begin
  for t in
    select tablename
      from pg_tables
     where schemaname = 'public'
       and tablename like 'tb\_%'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('alter table public.%I force row level security', t.tablename);
  end loop;
end $$;

-- 2) anon 롤에서 데이터 접근 권한 회수
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- 3) 로그인 사용자(authenticated)에게 CRUD 허용
do $$
declare
  t record;
begin
  for t in
    select tablename
      from pg_tables
     where schemaname = 'public'
       and tablename like 'tb\_%'
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.tablename);
    execute format('drop policy if exists %I on public.%I', t.tablename || '_authenticated_all', t.tablename);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t.tablename || '_authenticated_all', t.tablename
    );
  end loop;
end $$;

grant usage on schema public to authenticated;

-- 4) 감사 로그는 읽기 전용(수정·삭제 금지)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'tb_audit_log') then
    drop policy if exists "tb_audit_log_authenticated_all" on public.tb_audit_log;
    drop policy if exists "tb_audit_log_read" on public.tb_audit_log;
    drop policy if exists "tb_audit_log_insert" on public.tb_audit_log;
    create policy "tb_audit_log_read" on public.tb_audit_log for select to authenticated using (true);
    create policy "tb_audit_log_insert" on public.tb_audit_log for insert to authenticated with check (true);
    revoke update, delete on public.tb_audit_log from authenticated;
  end if;
end $$;

commit;

-- 적용 후 확인
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename like 'tb\_%' order by 1;
--   (rowsecurity = true 여야 함)
--
-- 되돌리기(긴급)
--   do $$ declare t record; begin
--     for t in select tablename from pg_tables where schemaname='public' and tablename like 'tb\_%'
--     loop execute format('alter table public.%I disable row level security', t.tablename); end loop;
--   end $$;
--   grant all on all tables in schema public to anon;
