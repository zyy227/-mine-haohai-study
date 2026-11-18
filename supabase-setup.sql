-- ============================================================
-- 镐海校园站 · 云端"网盘清单"建表脚本
-- 用法：打开 Supabase 项目 → 左侧 SQL Editor → New query
--      → 把本文件全部内容粘贴进去 → 点 Run
-- 执行成功后，左侧 Table Editor 里会出现 site_items 表。
-- 本脚本可以重复执行，不会报错。
-- ============================================================

-- 1. 建表：一行 = 页面上一条资料 / 比赛 / 照片
create table if not exists public.site_items (
  id bigint primary key,                 -- 前端用 Date.now() 生成
  kind text not null check (kind in ('doc', 'comp', 'scenery')),
  name text,                             -- 资料名 / 比赛名
  type text,                             -- 资料类型：老师上传 / 学生笔记
  desc_text text,                        -- 照片描述
  link text,                             -- 文件地址（Storage 公网链接）或比赛链接
  created_at timestamptz not null default now()
);

create index if not exists site_items_kind_idx on public.site_items (kind);

-- 2. 开启行级安全（RLS），再用策略允许匿名读写
--    注意：站点没有登录功能，所以访客也能增删。
--    以后加了登录，可以把 anon 去掉，只留 authenticated。
alter table public.site_items enable row level security;

drop policy if exists "site_items_read" on public.site_items;
create policy "site_items_read" on public.site_items
  for select to anon, authenticated using (true);

drop policy if exists "site_items_insert" on public.site_items;
create policy "site_items_insert" on public.site_items
  for insert to anon, authenticated with check (true);

drop policy if exists "site_items_delete" on public.site_items;
create policy "site_items_delete" on public.site_items
  for delete to anon, authenticated using (true);

drop policy if exists "site_items_update" on public.site_items;
create policy "site_items_update" on public.site_items
  for update to anon, authenticated using (true);

-- ============================================================
-- 3. 确认 Storage 的 file 存储桶是公开读的
--    左侧 Storage → file → 右上角 Configuration → Public bucket 打勾
--    （你之前上传能拿到链接，说明大概率已经开了）
-- ============================================================
