-- ============================================================
-- 镐海校园站 · 云端建表 + 权限 + 平台管理（升级版 v3）
-- 用法：Supabase 项目 → 左侧 SQL Editor → New query
--      → 把本文件全部内容粘贴进去 → 点 Run
-- 本脚本可重复执行，不会报错、不会丢数据。
--
-- v3 升级（平台管理第四条）：
--   · 先公开后审核：内容默认直接公开；管理员可在后台"下架"违规内容
--   · 被下架的内容：普通访客看不到，只有作者本人和管理员看得到
--   · 新增 site_stats 表：记录访问量 / 下载量 / AI 用量（按天聚合，省额度）
--   · 管理员身份：由 Cloudflare 服务端校验邮箱白名单，前端无法伪造
-- ============================================================

-- 1. 主内容表：一行 = 页面上一条资料 / 比赛 / 照片
create table if not exists public.site_items (
  id bigint primary key,                 -- 前端用 Date.now() 生成
  kind text not null check (kind in ('doc', 'comp', 'scenery')),
  name text,                             -- 资料名 / 比赛名
  type text,                             -- 资料类型：老师上传 / 学生笔记
  desc_text text,                        -- 照片描述
  link text,                             -- 文件地址或比赛链接
  owner_id uuid,                         -- 发布者用户ID；空 = 平台/管理员发布
  owner_email text,                      -- 发布者邮箱（页面展示"谁上传的"）
  status text not null default 'approved' check (status in ('approved', 'takedown')),
                                         -- approved=公开可见；takedown=已被管理员下架
  view_count bigint not null default 0,  -- 该条内容被查看/下载的次数
  created_at timestamptz not null default now()
);

-- 兼容旧表：补上 v2 / v3 新增的列
alter table public.site_items add column if not exists owner_id uuid;
alter table public.site_items add column if not exists owner_email text;
alter table public.site_items add column if not exists status text not null default 'approved';
alter table public.site_items add column if not exists view_count bigint not null default 0;
-- 老数据全部视为已通过（先公开后审核）
update public.site_items set status = 'approved' where status is null;

create index if not exists site_items_kind_idx on public.site_items (kind);
create index if not exists site_items_owner_idx on public.site_items (owner_id);
create index if not exists site_items_status_idx on public.site_items (status);

-- 2. 统计表：按天 + 类型聚合，一行 = 某天某类事件的数量
--    类型：visit=网站访问 / download=下载查看 / ai=AI提问
create table if not exists public.site_stats (
  day date not null,
  metric text not null check (metric in ('visit', 'download', 'ai')),
  cnt bigint not null default 0,
  primary key (day, metric)
);

-- 3. 开启行级安全（RLS）
alter table public.site_items enable row level security;
alter table public.site_stats enable row level security;

-- 3.1 读内容：只公开"未被下架"的内容。
--     被下架的内容只有作者本人能看到（这样作者知道自己哪条被下架了）。
--     管理员走服务端 service_role 密钥，可绕过 RLS 看到全部。
drop policy if exists "site_items_read" on public.site_items;
create policy "site_items_read" on public.site_items
  for select to anon, authenticated
  using (status = 'approved' or owner_id = auth.uid());

-- 3.2 增：只有登录用户能发布，且 owner_id 必须是自己（防止冒充别人/平台）
drop policy if exists "site_items_insert" on public.site_items;
create policy "site_items_insert" on public.site_items
  for insert to authenticated with check (auth.uid() = owner_id);

-- 3.3 删：只有登录用户能删，且只能删自己发布的
--     老数据 owner_id 为空 → 平台内容谁都删不掉（只有管理员在后台能处理）
drop policy if exists "site_items_delete" on public.site_items;
create policy "site_items_delete" on public.site_items
  for delete to authenticated using (owner_id is not null and auth.uid() = owner_id);

-- 3.4 改：只有登录用户能改，且只能改自己发布的
drop policy if exists "site_items_update" on public.site_items;
create policy "site_items_update" on public.site_items
  for update to authenticated
  using (owner_id is not null and auth.uid() = owner_id)
  with check (owner_id is not null and auth.uid() = owner_id);

-- 3.5 统计表：允许所有人（含游客）写入埋点；读取只开放给服务端（service_role 绕过 RLS）
drop policy if exists "site_stats_insert" on public.site_stats;
create policy "site_stats_insert" on public.site_stats
  for insert to anon, authenticated with check (true);

-- 计数累加需要 update 权限（埋点接口用 upsert：同一天同一类型 +1）
drop policy if exists "site_stats_update" on public.site_stats;
create policy "site_stats_update" on public.site_stats
  for update to anon, authenticated using (true) with check (true);

-- ============================================================
-- 4. 埋点计数函数：同一天同一类型自动 +1（原子操作，避免并发丢数）
--    后端 /api/track 通过 REST 调用：POST /rest/v1/rpc/bump_stat
-- ============================================================
create or replace function public.bump_stat(p_metric text)
returns void as $$
begin
  insert into public.site_stats (day, metric, cnt)
  values (current_date, p_metric, 1)
  on conflict (day, metric) do update set cnt = public.site_stats.cnt + 1;
end;
$$ language plpgsql security definer;

-- 允许游客和登录用户调用这个计数函数
grant execute on function public.bump_stat(text) to anon, authenticated;

-- 给某条内容查看/下载次数 +1（用于统计"哪份资料最火"）
create or replace function public.bump_view(p_id bigint)
returns void as $$
begin
  update public.site_items set view_count = view_count + 1 where id = p_id;
end;
$$ language plpgsql security definer;

grant execute on function public.bump_view(bigint) to anon, authenticated;

-- ============================================================
-- 5. 管理后台配置提醒
--    · 管理员邮箱在 Cloudflare Pages 环境变量 ADMIN_EMAIL 中设置
--    · service_role 密钥在环境变量 SUPABASE_SERVICE_ROLE 中设置
--      （Supabase → Settings → API → service_role secret，绝不能写进前端）
--    · 开启邮箱登录：Authentication → Providers → Email → 开启
--      （建议关掉 Confirm email，注册后立即可登录）
--    · Storage 的 file 桶保持 Public（照片/文件公网链接）
-- ============================================================
