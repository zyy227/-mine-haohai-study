# AGENTS.md — 浩海 study

给 AI 编码智能体的项目说明。请先读完本文件再动手改代码。

## 项目概述

「浩海 study」：以课程为索引的校园应用（课程中心 / 资料下载 / 比赛组队 / 失物招领 / 校园美景 / 每日新闻 / AI 助手）。

- **前端**：原生 HTML/JS/CSS 单页应用（**无框架、无构建、无打包**），入口 `index.html`，模块化代码在 `assets/`
- **后端**：Cloudflare Pages Functions（`functions/` 目录，TypeScript），部署后自动映射为 `/api/*` 与 `/news`
- **数据库**：Supabase（Postgres + Storage 桶 `file`）
- **安卓壳**：`android-app/` 是 Capacitor WebView 套壳，仅加载线上站点，不放业务代码

## 目录结构

```
index.html          唯一页面入口（约 3000+ 行，含内联脚本）
admin.html          管理后台页
assets/             前端模块：hh-*.js/css、p0.js、stellar.js、吉祥物图片等
functions/api/      Pages Functions API（TS）：auth/items/courses/teams/lostfound/admin/stats/track/profile/chat
functions/api/supabase/[[path]].ts   Supabase REST 反向代理（国内直连 supabase.co 易超时，前端一律走此代理）
functions/news.ts   /news 接口：抓 RSS（人民日报等三源兜底），边缘缓存 24h
supabase-setup*.sql 建表脚本（v4 → v5 为最新，需按顺序在 Supabase SQL Editor 执行）
seed-courses.sql    5 门课种子数据
tools/              本地辅助脚本（吉祥物切图等，node 运行）
android-app/        Capacitor 安卓套壳
*.backup-*          历史备份文件
vendor/             本地化的第三方库（supabase-js 等）
```

## 数据库表（Supabase）

`site_items`（资料/比赛/美景清单，字段为 `name` 而非 `title`）、`courses`、`lost_found`、`teams`、`profiles`、`site_stats`。
改表结构 = 新增一个 `supabase-setup-*.sql` 并让用户在 Supabase SQL Editor 手动执行，不要猜测线上表结构——**列名以 curl 实测为准**。

## 关键约定

1. **备份文件只读**：`index.backup-*.html`、`*.backup-*.sql`、`备份/` 一律不修改、不删除。
2. **大改前先备份**：修改 `index.html` 前先复制为 `index.backup-before-<主题>.html`（项目既有习惯）。
3. **密钥边界**：前端只允许出现 publishable key（`sb_publishable_` 前缀，可公开）；service_role 密钥只存在于 Pages Functions 的环境变量中，绝不写进前端或提交。
4. **网络请求路径**：前端访问 Supabase 走 `/api/supabase` 代理（见 `supabaseFetch()`），直连 supabase.co 仅作回退；文件/图片 URL 用 `safeUrl()` 转代理。
5. **原生 JS 风格**：无模块打包，内联脚本 + `assets/` 挂载；不要引入框架或 npm 依赖到根目录（根目录没有 package.json 是刻意的）。
6. **注释与文案用中文**，保持与现有代码一致的风格。

## 验证方式

项目无测试框架、无 lint。验证手段：

- JS/CJS 语法检查：`node --check <file>`；functions 的 TS 由 Pages 部署时校验
- 云端数据验证：用 publishable key 直连 REST，例如
  `curl "https://ihvusuaeksxynxewcmjs.supabase.co/rest/v1/<表>?select=*&order=id.desc&limit=5" -H "apikey: <publishable_key>" -H "Authorization: Bearer <publishable_key>"`
- RSS 接口验证：`curl https://plink.anyfeeder.com/people-daily`（本地无法跑 Functions，`/api/*` 只能部署后验证）
- 安卓 APK 构建：GitHub Actions 手动触发（`.github/workflows/android.yml`），本地不构建

## 部署

推送到 GitHub 后由 Cloudflare Pages 自动部署静态文件 + functions（无需手动构建）。