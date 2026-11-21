-- ============================================================
-- 浩海 study · v5 管理后台补充（失物招领 / 组队 支持“下架”）
-- 在 supabase-setup-v4.sql 之后执行；可重复执行。
--
-- 背景：管理后台的“内容巡查”需要把失物招领、组队也下架/恢复，
--      但 v4 里这两张表的状态只允许 open/resolved/closed、open/closed。
-- 这个脚本把 status 的检查约束扩展为允许 hidden。
-- ============================================================

do $$
declare
  r record;
begin
  if to_regclass('public.lost_found') is not null then
    for r in
      select conname from pg_constraint
      where conrelid = 'public.lost_found'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format('alter table public.lost_found drop constraint %I', r.conname);
    end loop;

    alter table public.lost_found
      add constraint lost_found_status_check
      check (status in ('open', 'resolved', 'closed', 'hidden'));
  end if;
end $$;

do $$
declare
  r record;
begin
  if to_regclass('public.teams') is not null then
    for r in
      select conname from pg_constraint
      where conrelid = 'public.teams'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%status%'
    loop
      execute format('alter table public.teams drop constraint %I', r.conname);
    end loop;

    alter table public.teams
      add constraint teams_status_check
      check (status in ('open', 'closed', 'hidden'));
  end if;
end $$;

-- 下架后公开列表不再返回（作者本人仍能看到自己的）
drop policy if exists "lost_found_read" on public.lost_found;
create policy "lost_found_read" on public.lost_found
  for select to anon, authenticated
  using (status <> 'hidden' or owner_id = auth.uid());

drop policy if exists "teams_read" on public.teams;
create policy "teams_read" on public.teams
  for select to anon, authenticated
  using (status <> 'hidden' or owner_id = auth.uid());

-- 自检：两条都应该返回 hidden
-- select status from public.lost_found limit 1;
-- select status from public.teams limit 1;
